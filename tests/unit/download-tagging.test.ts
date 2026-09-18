import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { parseSource } from './ast';
import { withoutTsComments } from './source-text';
import { searched, specFilesUnder } from '../source-files';
import {
  callsIn,
  declarationsIn,
  enclosingDeclaration,
  lineOf,
  type Declaration,
} from '../playwright-declarations';

/**
 * Real Chrome on Android hands a download to the DEVICE's own Downloads
 * folder. A CDP client cannot stream its bytes back, so
 * `download.createReadStream()` returns "canceled" every time — found on a
 * real phone (stage 4's device gate: six failures, all of them this).
 *
 * That is a property of the phone, not of the page. The same tests read the
 * same bytes on all five desktop projects, and the real device still proves
 * the download FIRES and carries the right suggested FILENAME
 * (`downloadName`), which is everything about an export a phone can
 * observe. So every test that reads a download's CONTENTS carries
 * `@requires-download-bytes` and `android-chrome`'s `grepInvert` excludes
 * it — and this file is what keeps that true. An exclusion list nobody
 * checks rots the moment someone adds a test, and the cost of it rotting is
 * an hour rediscovering a limitation already written down.
 *
 * Sibling of tests/unit/viewport-tagging.test.ts, which does the same job
 * for `@emulated-viewport`; see that file's own header for the fuller
 * reasoning on why this scans SOURCE rather than importing the specs
 * (Playwright specs cannot be loaded by Vitest at all).
 *
 * It reads that source with the parser (`tests/playwright-declarations.ts`).
 * Until #218 it credited a `downloadText(` call to the nearest declaration
 * above it, and found declarations by joining each line with the next two --
 * which recorded every declaration again one and two lines above itself. A
 * tagged test written on one line therefore had a tagged phantom above it
 * that read nothing, reported as a stale tag; the corpus stayed green only
 * because prettier happened to wrap every tagged declaration in it. A read
 * no test contains was skipped in silence.
 *
 * THE RULE. A read belongs to the innermost declaration whose callback
 * contains it, and that declaration carries the tag. A read no declaration
 * contains -- a helper outside every test -- is reported rather than passed
 * over. A tagged declaration that owns no read is stale.
 */

const TAG = '@requires-download-bytes';
/** The one helper that reads a download's bytes. `downloadName` does not. */
const READS_BYTES = 'downloadText';

/** Every call in `sf` to the helper that reads a download's bytes. */
const bytesReads = (sf: ts.SourceFile): ts.CallExpression[] =>
  callsIn(sf).filter(
    ({ expression }) =>
      (ts.isIdentifier(expression) && expression.text === READS_BYTES) ||
      (ts.isPropertyAccessExpression(expression) &&
        expression.name.text === READS_BYTES),
  );

/** The whole guard, as one pure function of (path, source text) -> finding
 * messages, so the synthetic tests below can prove every branch red and
 * green. The text is the file as it is on disk: a line counted in stripped
 * text is not the line a reader opens. */
function analyze(file: string, text: string): string[] {
  const sf = parseSource(text, file);
  const declarations = declarationsIn(sf);
  const findings: string[] = [];

  const reads = new Map<Declaration, number[]>();
  for (const call of bytesReads(sf)) {
    const line = lineOf(sf, call);
    const owner = enclosingDeclaration(call, declarations);
    if (owner === undefined) {
      findings.push(
        `${file}:${line} reads a download's bytes outside every test(...) and ` +
          'test.describe(...), so no declaration can carry the tag -- move the read ' +
          'into the test that makes it.',
      );
      continue;
    }
    reads.set(owner, [...(reads.get(owner) ?? []), line]);
  }

  for (const [decl, lines] of reads) {
    if (!decl.tags.includes(TAG))
      findings.push(
        `${file}:${decl.line} reads a download's bytes (line ${lines.join(', ')}) ` +
          `but is not tagged \`${TAG}\``,
      );
  }
  // The other direction: a tag on a test that no longer reads any bytes
  // is an exclusion nobody needs, quietly costing real-device coverage.
  for (const decl of declarations) {
    if (decl.tags.includes(TAG) && !reads.has(decl))
      findings.push(
        `${file}:${decl.line} is tagged \`${TAG}\` but never reads a download's bytes`,
      );
  }
  return findings;
}

describe('every test that reads a download’s bytes is tagged', () => {
  it(`is tagged ${TAG}, and no tag is stale`, () => {
    const files = specFilesUnder('tests/e2e');
    const findings = files.flatMap((file) =>
      analyze(file, readFileSync(file, 'utf8')),
    );
    expect(
      searched(findings, { of: files, what: 'e2e spec files' }),
      findings.join('\n'),
    ).toEqual([]);
  });

  // Guards the guard: without this, a scan that found nothing at all --
  // because the helper was renamed, or `tests/e2e` moved -- would report a
  // clean sweep it never performed.
  it('is actually looking at tests that read bytes', () => {
    const parsed = specFilesUnder('tests/e2e').map((file) =>
      parseSource(readFileSync(file, 'utf8'), file),
    );
    const reading = parsed.filter((sf) => bytesReads(sf).length > 0);
    expect(reading.length).toBeGreaterThan(0);
    const tagged = parsed.flatMap((sf) =>
      declarationsIn(sf).filter(({ tags }) => tags.includes(TAG)),
    );
    expect(tagged.length).toBeGreaterThan(0);
  });

  // …and that the exclusion it enforces is the one actually configured.
  // A tag every spec carries correctly, that no config excludes, protects
  // nothing.
  it('the device config actually excludes this tag', () => {
    expect(
      withoutTsComments(readFileSync('playwright.device.config.ts', 'utf8')),
    ).toContain(TAG);
  });
});

describe('analyze() -- the scanner proven on synthetic input, not just trusted', () => {
  // What the corpus loop reports for a file, read the way it reads one.
  const scanned = (src: string[]) =>
    analyze('synthetic.spec.ts', src.join('\n'));

  it('flags an untagged test that reads a download’s bytes, naming file and line', () => {
    const findings = scanned([
      "import { test } from './fixtures';",
      "test('exports the roster', async ({ page }) => {",
      "  expect(await downloadText(await save(page))).toContain('Name');",
      '});',
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('synthetic.spec.ts:2');
    expect(findings[0]).toContain(TAG);
  });

  it('accepts the identical test once tagged', () => {
    // A tagged test written on one line: the regex version recorded a tagged
    // phantom declaration above it and reported that phantom as stale.
    expect(
      scanned([
        "import { test } from './fixtures';",
        "test('exports the roster', { tag: '@requires-download-bytes' }, async ({ page }) => {",
        "  expect(await downloadText(await save(page))).toContain('Name');",
        '});',
      ]),
    ).toEqual([]);
  });

  it('flags a tag on a test that never reads bytes as stale', () => {
    const findings = scanned([
      "import { test } from './fixtures';",
      "test('names the file', { tag: '@requires-download-bytes' }, async ({ page }) => {",
      "  expect(await downloadName(await save(page))).toBe('roster.csv');",
      '});',
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('synthetic.spec.ts:2');
  });

  it('ignores a read written only in a comment', () => {
    expect(
      scanned([
        "import { test } from './fixtures';",
        "// expect(await downloadText(download)).toContain('Name');",
        "test('names the file', async ({ page }) => {",
        "  expect(await downloadName(await save(page))).toBe('roster.csv');",
        '});',
      ]),
    ).toEqual([]);
  });

  it('credits a read to the test that makes it when the next test follows directly', () => {
    // The three-line join recorded every declaration again one and two lines
    // above itself, so the last lines of the test before it belonged to a
    // phantom: an untagged "reader" and a stale tag, for a correct file.
    expect(
      scanned([
        "import { test } from './fixtures';",
        "test('exports the roster', { tag: '@requires-download-bytes' }, async ({ page }) => {",
        '  const download = await save(page);',
        "  expect(await downloadText(download)).toContain('Name');",
        '});',
        "test('names the file', async ({ page }) => {});",
      ]),
    ).toEqual([]);
  });

  it('is not fooled by a declaration spelled inside a string', () => {
    expect(
      scanned([
        "import { test } from './fixtures';",
        "test('exports the roster', { tag: '@requires-download-bytes' }, async ({ page }) => {",
        '  const example = "test(\'not a test\', async () => {})";',
        "  expect(await downloadText(await save(page))).toContain('Name');",
        '});',
      ]),
    ).toEqual([]);
  });

  it('reports a read no declaration contains, instead of crediting the test above it', () => {
    const findings = scanned([
      "import { test } from './fixtures';",
      'test(',
      "  'exports the roster',",
      "  { tag: '@requires-download-bytes' },",
      '  async ({ page }) => {',
      "    expect(await downloadText(await save(page))).toContain('Name');",
      '  },',
      ');',
      'async function csvOf(page) {',
      '  return downloadText(await save(page));',
      '}',
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('synthetic.spec.ts:10');
  });

  it('reports the line a finding is on in the file, below a block comment', () => {
    const findings = scanned([
      "import { test } from './fixtures';",
      '/**',
      ' * A docblock above the test.',
      ' */',
      "test('exports the roster', async ({ page }) => {",
      "  expect(await downloadText(await save(page))).toContain('Name');",
      '});',
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('synthetic.spec.ts:5');
  });
});
