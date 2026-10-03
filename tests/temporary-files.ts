import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nonEmpty } from './source-files';

/**
 * The unit run's own temporary directory (#390 F56), as vitest's
 * `globalSetup`. Every worker, and every process a test starts, inherits it as
 * `TMPDIR`, which `os.tmpdir()` reads on each call (measured: a worker's
 * `mkdtempSync` landed in it). At the end of the run anything a test left there
 * fails the run, and the directory goes either way, so a leak can neither pass
 * unseen nor pile up: before this, the laptop's `$TMPDIR` held 2,717
 * directories the suite had made and never removed.
 */

/** Where `setup` put the run, for `tests/temporary-files-setup.ts` to check. */
export const RUN_TMPDIR = 'SHYDEN_UNIT_TMPDIR';

/**
 * Written by `setup`, so the directory the check reads is never empty and is
 * provably the one `setup` made: a check that read some other, empty directory
 * would otherwise pass on nothing.
 */
export const RUN_MARKER = '.unit-run';

/**
 * What the tools leave beside the tests, by shape, so they are not counted as
 * a test's leak: Node's compile cache, Playwright's transform cache (named for
 * the user id), and vite's module cache, a 21-character id holding only `ssr`
 * (all three measured in one whole-suite run).
 */
const isToolCache = (dir: string, name: string): boolean =>
  name === 'node-compile-cache' ||
  /^playwright-transform-cache-\d+$/.test(name) ||
  (/^[\w-]{21}$/.test(name) &&
    existsSync(join(dir, name, 'ssr')) &&
    nonEmpty(
      readdirSync(join(dir, name)),
      `${name}, which holds ssr`,
    ).join() === 'ssr');

/**
 * Everything in `dir` a test left behind, sorted. `dir` holds at least the run
 * marker, or this refuses rather than answer for a directory it never saw.
 */
export function leakedEntries(dir: string): string[] {
  return nonEmpty(readdirSync(dir), `the unit run's directory, ${dir}`)
    .filter((name) => name !== RUN_MARKER && !isToolCache(dir, name))
    .sort();
}

let runDir = '';

export function setup(): void {
  runDir = mkdtempSync(join(tmpdir(), 'shyden-unit-'));
  writeFileSync(join(runDir, RUN_MARKER), '');
  process.env.TMPDIR = runDir;
  process.env[RUN_TMPDIR] = runDir;
}

export function teardown(): void {
  try {
    const leaked = leakedEntries(runDir);
    if (leaked.length > 0) {
      throw new Error(
        `the unit run left ${leaked.length} entr${leaked.length === 1 ? 'y' : 'ies'} in its ` +
          `temporary directory: ${leaked.join(', ')}. Make a test's directory with ` +
          "scratchDir() from 'tests/scratch-dir', which removes it when the test ends.",
      );
    }
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
}
