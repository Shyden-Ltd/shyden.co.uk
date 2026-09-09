import { dirname } from 'node:path';
import { specFilesUnder } from './source-files';

const TESTS_DIR = 'tests';

/** Every directory at or below `dir` that directly holds a Playwright spec. */

/**
 * The directories a source-scanning guard should read, derived from disk.
 *
 * Four guards each carried their own `[tests/e2e, tests/device]` — written
 * when those were the only two spec directories, and never revisited when
 * `tests/dev` and `tests/prod` were added. Those two produce `dev-verified`,
 * a required check on main's branch protection, and were scanned by none of
 * them: a `test.fixme` planted in `tests/dev` left `parked-tests.test.ts`
 * green at 11/11, and widening the scan immediately found a real defect
 * (#67).
 */
export const specDirs = (): string[] =>
  [...new Set(specFilesUnder(TESTS_DIR).map((path) => dirname(path)))].sort();
