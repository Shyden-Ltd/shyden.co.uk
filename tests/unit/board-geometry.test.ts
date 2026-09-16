import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { measureBoard, measureBoardScript } from '../board-geometry';
import { searched, tsFilesUnder } from '../source-files';
import { withoutTsComments } from './source-text';

/**
 * The board measurement is serialised into two runtimes, so it is guarded here.
 *
 * `tests/board-geometry.ts` cannot be exercised in this suite: measuring a
 * layout needs a layout, and no DOM environment is installed (adding `jsdom`
 * would be a new dependency, which is an operator decision). What CAN be
 * proved without a browser is the part that silently breaks -- that the
 * function still arrives at the far end intact, and that there is still only
 * one of it.
 *
 * Both callers ship the function as TEXT: Playwright serialises it into the
 * page, and the iOS leg sends `(${measureBoard})()` down a WebDriver wire. A
 * reference to a module-scope binding type-checks perfectly here and is
 * `undefined` over there -- a failure that appears only on a real phone, in
 * the one leg #189 AC11 exists to cover.
 */
describe('the board is measured once, and survives being sent somewhere else', () => {
  it('still names the things it measures once serialised', () => {
    const source = measureBoard.toString();

    // A transpiler that inlined, renamed or stubbed this would leave a
    // function that still serialises and measures nothing. These are the
    // selectors the measurement is ABOUT: without them it cannot be the
    // measurement, whatever else survived.
    const needles = [
      'cg-board-stage',
      '.group',
      '.who',
      'getClientRects',
      'getBoundingClientRect',
    ];
    const missing = needles.filter((needle) => !source.includes(needle));

    expect(
      searched(missing, { of: needles, what: 'serialised selectors' }),
      `the serialised measurement lost: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('closes over nothing, because anything it closed over would be undefined at the far end', () => {
    const source = withoutTsComments(
      readFileSync('tests/board-geometry.ts', 'utf8'),
    );

    // The positive control: this is the right file, so "no imports" below is
    // a fact about the measurement and not about an empty read.
    expect(source, 'read the module that owns the measurement').toContain(
      'export const measureBoard',
    );

    // The population goes INSIDE the assertion: a filter that quietly stopped
    // matching reads exactly like a module with no imports, and only one of
    // those is good news (#118). `searched` counts the population by CONTENT,
    // so blank lines cannot stand in for source.
    const lines = source.split('\n');
    const imports = lines.filter((line) => /^\s*import\s/.test(line));
    expect(
      searched(imports, {
        of: lines,
        what: 'source lines in the measurement module',
      }),
      'an import here is a binding that exists while type-checking and is ' +
        'undefined inside the page -- the failure only a real device shows',
    ).toEqual([]);
  });

  it('has one spelling of the wrapper the device leg sends', () => {
    expect(measureBoardScript()).toBe(`return (${measureBoard})();`);
  });

  it('is spelled in exactly one place under tests/', () => {
    // A guard that names the thing it guards has to exempt itself -- exactly
    // as `CONTRACT_MODULE` does for the evidence filenames. Derived from
    // `import.meta.url` rather than written as a string, so a rename cannot
    // leave the exemption pointing at a file that no longer exists.
    const self = relative(process.cwd(), fileURLToPath(import.meta.url));
    const files = tsFilesUnder('tests').filter((path) => path !== self);
    const spelling = files.filter((path) =>
      withoutTsComments(readFileSync(path, 'utf8')).includes('cg-board-stage'),
    );

    // Derived from the filesystem rather than a list: a sweep driven by its
    // own ticket's file list missed five survivors (#65). The population is
    // every TypeScript file under tests/, so a second measurement written next
    // year is caught the day it appears.
    expect(
      searched(spelling, { of: files, what: 'files naming the board stage' }),
      'the board stage is measured in one home; a second measurement is the ' +
        'one place the two legs could quietly disagree',
    ).toEqual(['tests/board-geometry.ts']);
  });
});
