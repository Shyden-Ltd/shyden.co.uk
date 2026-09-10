import { describe, it, expect } from 'vitest';
import { specDirs } from '../spec-dirs';
import { blankCommentLines, isCommentLine } from './source-text';
import { readFileSync } from 'node:fs';
import { searched, tsFilesUnder } from '../source-files';

/**
 * "Tracked, not hidden" has to be TRUE, not merely written.
 *
 * #32 was filed because `tests/e2e/classroom-groups.spec.ts` parked two real
 * viewport-fit failures as `test.fixme` under a comment that said they were
 * "tracked, not hidden" -- and no issue covering viewport fit existed in this
 * repo, open or closed. The product genuinely overflowed the fold at 320x568
 * and 375x667, no test failed, and the Playwright summary reported the two
 * rows as "skipped", which is indistinguishable from a legitimate conditional
 * skip. A claim nobody could fail is how that survived. This file is what
 * makes the claim falsifiable: a parked test must name an issue, or the suite
 * goes red.
 *
 * WHAT IS A DECLARATION, AND WHAT IS NOT. Playwright spells two entirely
 * different things the same way:
 *
 *   test.skip(browserName === 'webkit', 'Safari omits plain links...')  <- runtime
 *   test.fixme('the tool fits at 320x568', async ({ page }) => { ... })  <- declaration
 *
 * The first is a runtime guard INSIDE a running test: the assertion would be
 * invalid on that engine, the reason is stated at the call site, and it needs
 * no ticket because nothing is broken. The corpus has three of those and all
 * three name where the coverage is recovered instead. The second parks a test
 * that SHOULD pass. Only the second is this guard's business, and the two are
 * told apart exactly the way tests/unit/viewport-tagging.test.ts tells them
 * apart: a declaration's first argument is a string literal, so a quote
 * follows the parenthesis (modulo whitespace), while the runtime overload
 * always opens with an expression. The runtime form is invisible here by
 * construction, not by an exclusion list somebody has to maintain.
 *
 * COMMENTS ARE BLANKED TO FIND DECLARATIONS, AND KEPT TO FIND REFERENCES.
 * Both directions matter, and the corpus already contains the case that
 * proves it: classroom-groups-controls.spec.ts records a deleted test as
 * ``Stage 2's `test.fixme('a separate-mode spillover warning renders...')`
 * stood here. DELETED``. Scanning raw text would flag that history note as a
 * parked test. Scanning blanked text for the REFERENCE would throw away the
 * comment the reference is supposed to live in. So declarations are located
 * in comment-blanked source, and the issue reference is read back out of the
 * original.
 *
 * THE APPROXIMATION, STATED PLAINLY. Like viewport-tagging.test.ts, this
 * walks text with regexes rather than parsing (no parser dependency is
 * available), and "the same block" is defined as: the unbroken run of comment
 * lines immediately above the declaration, plus the declaration's own opening
 * lines. A blank line ends the block -- a comment separated from the test it
 * documents is not that test's comment. What this CANNOT do is verify the
 * issue exists, is open, or is about this test; it forces a reference to be
 * written, which is the step that was skipped. That is a smaller claim than
 * "tracked", and it is one this file can actually keep.
 */

const SCAN_DIRS = specDirs();

/** Any `#123`. Deliberately NOT a `/g/` regex: a global regex carries
 * `lastIndex` between `.test()` calls and would report alternating results
 * for identical input. */
const ISSUE_REFERENCE = /#\d+/;

/**
 * `test.fixme(`, `test.skip(`, `test.describe.fixme(`, `test.describe.skip(`
 * -- each followed, after whitespace only, by a quote. The lookahead is what
 * keeps the runtime overload out; see the file comment above.
 */
const DECLARATION =
  /\b(?:test|it)(?:\.describe)?\.(fixme|skip)\s*\(\s*(?=['"`])/g;

/** How far past the declaration line to look for a reference in the title. A
 * wrapped declaration puts its title on the next line, and the house Prettier
 * config wraps the options object after that. */
const CONTEXT_LINES_AFTER = 5;

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** The unbroken run of comment lines immediately above `line` (1-indexed). */
function precedingCommentBlock(lines: string[], line: number): string[] {
  const block: string[] = [];
  for (let i = line - 2; i >= 0 && isCommentLine(lines[i]); i--) {
    block.unshift(lines[i]);
  }
  return block;
}

export function findUnreferencedParkedTests(
  file: string,
  source: string,
): string[] {
  const blanked = blankCommentLines(source);
  const lines = source.split('\n');
  const findings: string[] = [];

  for (const match of blanked.matchAll(DECLARATION)) {
    const line = lineNumberAt(blanked, match.index ?? 0);
    const context = [
      ...precedingCommentBlock(lines, line),
      ...lines.slice(line - 1, line - 1 + CONTEXT_LINES_AFTER),
    ].join('\n');
    if (ISSUE_REFERENCE.test(context)) continue;
    findings.push(
      `${file}:${line} -- \`test.${match[1]}(\` parks a test without naming ` +
        'an issue. Put a `#<number>` in the comment block directly above it, ' +
        "or in the test's own title, or delete the test. #32 was filed " +
        'because a comment claimed "tracked, not hidden" and no such ticket ' +
        'existed, while the product really did overflow the fold.',
    );
  }

  return findings;
}

describe('parked tests must name an issue', () => {
  const scan = (source: string) =>
    findUnreferencedParkedTests('synthetic.spec.ts', source);

  it('flags a test.fixme that names no issue', () => {
    const source = [
      "test.fixme('the tool fits without scrolling at 320x568', async () => {",
      '  await measureFit(page);',
      '});',
    ].join('\n');
    expect(scan(source)).toHaveLength(1);
  });

  it('accepts a test.fixme whose preceding comment names an issue', () => {
    const source = [
      '// Parked until #32 lands -- the overflow is real and measured.',
      "test.fixme('the tool fits without scrolling at 320x568', async () => {",
      '  await measureFit(page);',
      '});',
    ].join('\n');
    expect(scan(source)).toEqual([]);
  });

  it('accepts a test.fixme whose own title names an issue', () => {
    const source = [
      "test.fixme('the tool fits at 320x568 (#32)', async () => {",
      '  await measureFit(page);',
      '});',
    ].join('\n');
    expect(scan(source)).toEqual([]);
  });

  it('accepts a reference on the wrapped title line', () => {
    const source = [
      'test.fixme(',
      "  'the tool fits without scrolling at 320x568, parked by #32',",
      "  { tag: '@emulated-viewport' },",
      '  async () => {},',
      ');',
    ].join('\n');
    expect(scan(source)).toEqual([]);
  });

  it('is blind to the runtime conditional overload, which needs no issue', () => {
    const source = [
      "test('it is the FIRST thing a Tab reaches', async ({ browserName }) => {",
      '  test.skip(',
      "    browserName === 'webkit',",
      "    'Safari omits plain links from the Tab sequence by visitor preference.',",
      '  );',
      '});',
    ].join('\n');
    expect(scan(source)).toEqual([]);
  });

  it('flags a bare test.describe.fixme, not just a single test', () => {
    const source = [
      "test.describe.fixme('the whole print panel', () => {",
      "  test('it prints', async () => {});",
      '});',
    ].join('\n');
    expect(scan(source)).toHaveLength(1);
  });

  it('flags a test.skip declaration, which hides exactly as well', () => {
    const source = [
      "test.skip('the roster imports a CSV', async () => {});",
    ].join('\n');
    expect(scan(source)).toHaveLength(1);
  });

  it('does not accept a reference separated from the test by a blank line', () => {
    const source = [
      '// #32 is about something else entirely, and this blank line proves it.',
      '',
      "test.fixme('the tool fits without scrolling at 320x568', async () => {});",
    ].join('\n');
    expect(scan(source)).toHaveLength(1);
  });

  it('does not treat a test.fixme quoted inside a comment as a declaration', () => {
    const source = [
      "// Stage 2's `test.fixme('a separate-mode spillover warning renders,",
      "// naming who')` stood here. DELETED, whole -- its body was comments",
      '// only, so stripping the `.fixme` would have produced a real `test()`',
      '// with zero assertions.',
      "test('names who landed in a group of the other sex', async () => {});",
    ].join('\n');
    expect(scan(source)).toEqual([]);
  });

  it('names the file and line so a finding is actionable', () => {
    const source = ['', "test.fixme('a parked test', async () => {});"].join(
      '\n',
    );
    expect(scan(source)[0]).toContain('synthetic.spec.ts:2');
  });

  it('the e2e corpus parks nothing without naming an issue', () => {
    const files = SCAN_DIRS.flatMap(tsFilesUnder);

    const findings = files.flatMap((file) =>
      findUnreferencedParkedTests(file, readFileSync(file, 'utf8')),
    );
    expect(
      searched(findings, { of: files, what: 'e2e corpus files' }),
      findings.join('\n'),
    ).toEqual([]);
  });
});
