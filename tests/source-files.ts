import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The one directory walk in the suite.
 *
 * Nine private copies had grown before #80 — four byte-identical
 * `listSourceFiles`, plus `specFiles`, `sourceFiles`, `collect`, `walk` and
 * `listM4aFiles` — in three implementations that disagreed about what to
 * skip. A guard can only see what its walker hands it, so whichever copy the
 * next guard reached for silently decided its blind spots: exactly how #67's
 * four hand-written `[tests/e2e, tests/device]` lists left the deploy gates
 * unscanned.
 *
 * `tests/unit/one-home.test.ts` fails if a tenth appears.
 */

/**
 * Never descended into. Dotfiles are tooling (`.git`, `.astro`) and
 * `node_modules` is somebody else's source — a guard that reads either is
 * asserting against files nobody in this repo wrote. Four of the nine copies
 * skipped both, one skipped neither; this is the majority behaviour made
 * uniform rather than left to whichever copy a caller inherited.
 */
const isSkipped = (name: string): boolean =>
  name.startsWith('.') || name === 'node_modules';

/**
 * Every file at or below `dir` that `keep` accepts, sorted.
 *
 * `keep` receives the FULL path, not the basename, so a caller can filter on
 * directory as well as extension — `translate.test.ts` needs to exempt one
 * specific file, and a basename would have made that a substring match.
 *
 * Sorted because `readdirSync` order is filesystem-dependent: a guard whose
 * findings are asserted as a list would otherwise pass on Linux and fail on
 * macOS for reasons that have nothing to do with what it guards.
 */
export function filesUnder(
  dir: string,
  keep: (path: string) => boolean,
): string[] {
  return nonEmpty(walk(dir, keep).sort(), `files under ${dir}`);
}

/**
 * The recursion, kept private so an empty result stays ordinary HERE.
 *
 * `tests/` holds directories with no `.spec.ts` in them, so a walk that
 * refused an empty sub-result could never complete. The refusal belongs to
 * the exported, top-level form and nowhere else.
 */
function walk(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isSkipped(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path, keep));
    else if (keep(path)) out.push(path);
  }
  return out;
}

/**
 * A derived set, proved non-empty before a guard is allowed to scan it.
 *
 * #79 settled this shape for browser events and put the control INSIDE
 * `recorders.ts`, because a call site cannot forget what it never writes.
 * The filesystem collectors kept it as a convention instead: eleven guards
 * hand-wrote `expect(files.length).toBeGreaterThan(0)`, five of them copying
 * a comment that cites a sibling, and **four forgot** — twelve tests passed
 * while scanning zero files (#84).
 *
 * A plain `throw`, not `expect`: this module is imported by both Vitest and
 * Playwright specs, and a failed assertion belonging to neither runner is
 * still a loud, correctly-attributed failure in both.
 */
export function nonEmpty<T>(items: T[], what: string): T[] {
  if (items.length === 0)
    throw new Error(
      `found no ${what} — the walk is broken, not the subject clean. ` +
        'A guard handed an empty list asserts nothing at all (#84).',
    );
  return items;
}

/**
 * Every TypeScript source at or below `dir`.
 *
 * The filter four byte-identical copies each spelled out. Exported as its own
 * function so their call sites stay point-free — `SCAN_DIRS.flatMap(
 * tsFilesUnder)` — rather than each re-writing the same predicate, which is
 * how the four copies started.
 */
export const tsFilesUnder = (dir: string): string[] =>
  filesUnder(dir, (path) => /\.tsx?$/.test(path));

/**
 * Every Playwright spec at or below `dir`.
 *
 * `specDirs()` is built from this rather than from its own recursion: a
 * directory "holds specs" exactly when this returns a file in it, so the two
 * can no longer disagree about what a spec is.
 */
export const specFilesUnder = (dir: string): string[] =>
  filesUnder(dir, (path) => path.endsWith('.spec.ts'));
