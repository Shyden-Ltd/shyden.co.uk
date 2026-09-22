import { describe, it, expect } from 'vitest';
import { expectNothingFound } from './spec-scan';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { parseSource } from './ast';
import { specFilesUnder } from '../source-files';
import { callsIn, lineOf } from '../playwright-declarations';

/**
 * A download's bytes are read in ONE place: `downloadText` (tests/e2e/helpers.ts).
 *
 * On the real Android phone a download is saved ON THE PHONE, and `downloadText` is the only
 * reader that knows to fetch it back over adb; `download.createReadStream()` and
 * `download.saveAs()` read Playwright's copy on the Mac, which a phone run never has (#308).
 * Until #308 the phone could not save a download at all, and every test reading bytes carried
 * `@requires-download-bytes` so the phone run could exclude it; this file replaced the guard that
 * kept that tag honest. The phone now runs those tests, so the invariant moved from "tagged" to
 * "read through the one reader that works everywhere".
 *
 * The exemption is structural, not a path: a read is allowed only INSIDE the declaration named
 * `downloadText`, so the helper can read what every spec must not.
 */

/** `Download`'s own byte readers. `path()` is left out: the name is far too common to mean it. */
const DIRECT_READERS = ['createReadStream', 'saveAs'];
const HOME = 'downloadText';

const calleeName = ({ expression }: ts.CallExpression): string | undefined =>
  ts.isPropertyAccessExpression(expression)
    ? expression.name.text
    : ts.isIdentifier(expression)
      ? expression.text
      : undefined;

/** True when `node` sits inside a variable or function declared with the home's name. */
const insideHome = (node: ts.Node): boolean => {
  for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
    if (
      (ts.isVariableDeclaration(at) || ts.isFunctionDeclaration(at)) &&
      at.name !== undefined &&
      ts.isIdentifier(at.name) &&
      at.name.text === HOME
    )
      return true;
  }
  return false;
};

/** The whole guard as one pure function of (path, source text) -> finding messages. */
function analyze(file: string, text: string): string[] {
  const sf = parseSource(text, file);
  return callsIn(sf)
    .filter((call) => DIRECT_READERS.includes(calleeName(call) ?? ''))
    .filter((call) => ts.isPropertyAccessExpression(call.expression))
    .filter((call) => !insideHome(call))
    .map(
      (call) =>
        `${file}:${lineOf(sf, call)} reads a download's bytes with \`${calleeName(call)}\` ` +
        `instead of \`${HOME}\`, the only reader that works on the real phone (#308)`,
    );
}

describe('a download’s bytes are read only through downloadText', () => {
  it('no spec reads them any other way', () => {
    expectNothingFound(analyze);
  });

  // Guards the guard: a scan that found no reads at all -- because the helper was renamed, or
  // `tests/e2e` moved -- would otherwise report a clean sweep it never performed.
  it('is actually looking at specs that read bytes', () => {
    const readers = specFilesUnder('tests/e2e').filter((file) =>
      callsIn(parseSource(readFileSync(file, 'utf8'), file)).some(
        (call) => calleeName(call) === HOME,
      ),
    );
    expect(readers.length).toBeGreaterThan(0);
  });
});

describe('analyze() -- the scanner proven on synthetic input, not just trusted', () => {
  const scanned = (src: string[]) =>
    analyze('synthetic.spec.ts', src.join('\n'));

  it('flags a spec reading a download with createReadStream, naming file and line', () => {
    const findings = scanned([
      "test('exports the roster', async ({ page }) => {",
      "  const [download] = await Promise.all([page.waitForEvent('download'), save(page)]);",
      '  const stream = await download.createReadStream();',
      '});',
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('synthetic.spec.ts:3');
    expect(findings[0]).toContain('createReadStream');
  });

  it('flags saveAs the same way', () => {
    const findings = scanned(["await download.saveAs('/tmp/x.csv');"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('saveAs');
  });

  it('accepts a spec that reads through downloadText', () => {
    expect(
      scanned(["const text = await downloadText(page, 'Download template');"]),
    ).toEqual([]);
  });

  it('allows the read inside the home, and only there', () => {
    const home = [
      'export const downloadText = async (page, button) => {',
      '  const stream = await download.createReadStream();',
      '};',
    ];
    expect(scanned(home)).toEqual([]);
    const elsewhere = home.map((line) =>
      line.replace('downloadText', 'readItMyself'),
    );
    expect(scanned(elsewhere)).toHaveLength(1);
  });

  it('ignores a read written only in a comment or a string', () => {
    expect(
      scanned([
        '// never call download.createReadStream() in a spec',
        "const hint = 'use download.saveAs() only in helpers';",
      ]),
    ).toEqual([]);
  });
});
