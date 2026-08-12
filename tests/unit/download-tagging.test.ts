import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * reasoning on why this scans SOURCE TEXT rather than importing the specs
 * (Playwright specs cannot be loaded by Vitest at all).
 *
 * THE APPROXIMATION, STATED PLAINLY: this attributes a `downloadText(` call
 * to the nearest preceding `test(`/`test.describe(` declaration by line
 * order. It cannot see a call reached through a helper this scan does not
 * know the name of, or a declaration whose title is passed by variable. Both
 * shapes are absent from this repo today, verified by reading every call
 * site — and the sibling guard's own "aliased callee" case documents what a
 * scan like this sees instead.
 */

const TAG = '@requires-download-bytes';
/** The one helper that reads a download's bytes. `downloadName` does not. */
const READS_BYTES = 'downloadText(';

const specFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? specFiles(join(dir, entry.name))
      : entry.name.endsWith('.spec.ts')
        ? [join(dir, entry.name)]
        : [],
  );

interface Decl {
  line: number;
  header: string;
}

/**
 * Every `test(`-shaped declaration in a file, with the text from its own
 * line up to the start of its body — which is where a `{ tag: … }` options
 * object sits.
 *
 * Requiring a QUOTE after the parenthesis is what distinguishes a
 * declaration from the runtime conditional overloads that share the
 * spelling (`test.skip(browserName === 'webkit', 'reason')`), exactly as the
 * sibling guard does. A wrapped title — `test(` on one line, its quoted
 * title on the next — still counts, because the scan joins the next two
 * lines before testing.
 */
const declarations = (source: string): Decl[] => {
  const lines = source.split('\n');
  const found: Decl[] = [];
  for (const [i, line] of lines.entries()) {
    const ahead = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ');
    if (/\btest(\.(only|skip|fixme|describe))?\(\s*['"`]/.test(ahead)) {
      found.push({ line: i + 1, header: ahead });
    }
  }
  return found;
};

/** The declaration a given line belongs to: the nearest one above it. */
const owning = (decls: Decl[], line: number): Decl | undefined =>
  [...decls].reverse().find((d) => d.line <= line);

const scan = () => {
  const untagged: string[] = [];
  const stale: string[] = [];
  for (const file of specFiles('tests/e2e')) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    const decls = declarations(source);

    const readingLines = lines
      .map((l, i) => ({ l, line: i + 1 }))
      // A call sitting only inside a comment is not a call.
      .filter(
        ({ l }) =>
          l.includes(READS_BYTES) &&
          !l.trimStart().startsWith('*') &&
          !l.trimStart().startsWith('//'),
      )
      .map(({ line }) => line);

    for (const line of readingLines) {
      const owner = owning(decls, line);
      if (!owner) continue;
      if (!owner.header.includes(TAG)) {
        untagged.push(
          `${file}:${owner.line} reads a download's bytes (line ${line}) but is not tagged \`${TAG}\``,
        );
      }
    }

    // The other direction: a tag on a test that no longer reads any bytes
    // is an exclusion nobody needs, quietly costing real-device coverage.
    for (const decl of decls) {
      if (!decl.header.includes(TAG)) continue;
      const next = decls.find((d) => d.line > decl.line);
      const end = next ? next.line : lines.length + 1;
      const body = lines.slice(decl.line - 1, end - 1).join('\n');
      if (!body.includes(READS_BYTES)) {
        stale.push(
          `${file}:${decl.line} is tagged \`${TAG}\` but never reads a download's bytes`,
        );
      }
    }
  }
  return { untagged, stale };
};

describe('every test that reads a download’s bytes is tagged', () => {
  it(`is tagged ${TAG}, and no tag is stale`, () => {
    const { untagged, stale } = scan();
    expect(untagged).toEqual([]);
    expect(stale).toEqual([]);
  });

  // Guards the guard: without this, a scan that found nothing at all --
  // because the helper was renamed, or `tests/e2e` moved -- would report a
  // clean sweep it never performed.
  it('is actually looking at tests that read bytes', () => {
    const reading = specFiles('tests/e2e').filter((f) =>
      readFileSync(f, 'utf8').includes(READS_BYTES),
    );
    expect(reading.length).toBeGreaterThan(0);
    const tagged = specFiles('tests/e2e').flatMap((f) =>
      declarations(readFileSync(f, 'utf8')).filter((d) =>
        d.header.includes(TAG),
      ),
    );
    expect(tagged.length).toBeGreaterThan(0);
  });

  // …and that the exclusion it enforces is the one actually configured.
  // A tag every spec carries correctly, that no config excludes, protects
  // nothing.
  it('the device config actually excludes this tag', () => {
    expect(readFileSync('playwright.device.config.ts', 'utf8')).toContain(TAG);
  });
});
