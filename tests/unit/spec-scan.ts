import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { specDirs } from '../spec-dirs';
import { searched, tsFilesUnder } from '../source-files';

/**
 * The body every source-scanning guard in this repo ends with, once (#277).
 *
 * `viewport-tagging`, `isolated-context-tagging`, `parked-tests` and
 * `download-tagging` each carried it: read every file, run this guard's own
 * `analyze` over each one's source, assert the findings are empty with the
 * population named inside the assertion so an empty scan cannot pass for a
 * clean one (#118). Four copies of three lines, which is not why they
 * matter -- they matter because the copies HAD ALREADY DRIFTED, and only in
 * the one place a reader never looks.
 *
 * Three of them scanned `specDirs()`, the derived set that exists because
 * four guards once hard-coded `[tests/e2e, tests/device]` and never
 * revisited it when `tests/dev` and `tests/prod` arrived -- a `test.fixme`
 * planted in `tests/dev` left `parked-tests.test.ts` green at 11/11.
 * `download-tagging` was the fifth guard with that exact bug still in it:
 * `specFilesUnder('tests/e2e')`, written narrow and never widened. Nothing
 * outside `tests/e2e` reads a download's bytes TODAY, measured, so the hole
 * was latent rather than open -- which is the only kind you get to close
 * cheaply.
 *
 * So the scope belongs here, not at the call site. A guard that genuinely
 * needs a narrower set is an exception that has to say so out loud, instead
 * of a default that drifts in silence.
 */

/** A guard's own reading of one file: the problems it found, as messages. */
export type Analyze = (file: string, source: string) => readonly string[];

/**
 * Run `analyze` over every file in the spec directories and assert it found
 * nothing. The failure message is every finding, one per line.
 */
export const expectNothingFound = (analyze: Analyze): void => {
  const files = specDirs().flatMap(tsFilesUnder);
  const findings = files.flatMap((file) =>
    analyze(file, readFileSync(file, 'utf8')),
  );
  expect(
    searched(findings, { of: files, what: 'files under the spec directories' }),
    findings.join('\n'),
  ).toEqual([]);
};
