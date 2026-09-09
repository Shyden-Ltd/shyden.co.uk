import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const TESTS_DIR = 'tests';

/** Every directory at or below `dir` that directly holds a Playwright spec. */
function dirsHoldingSpecs(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const here = entries.some(
    (entry) => entry.isFile() && entry.name.endsWith('.spec.ts'),
  )
    ? [dir]
    : [];
  const below = entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules',
    )
    .flatMap((entry) => dirsHoldingSpecs(join(dir, entry.name)));
  return [...here, ...below];
}

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
export const specDirs = (): string[] => dirsHoldingSpecs(TESTS_DIR).sort();
