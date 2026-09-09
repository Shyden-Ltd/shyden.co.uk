import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';

/**
 * The pre-push hook exists, is wired, and still runs what it was built to run.
 *
 * PR #34 failed CI on `npm run format` — one line over Prettier's print width
 * in a new test file. `format` is the FIRST step of `build-and-test`, so
 * `build`, the unit suite and the whole e2e corpus were skipped: a ~15 minute
 * run that verified nothing and reported a two-second problem. That is CI used
 * as a debugging loop, and a hook is the cheap end of it.
 *
 * NO HOOK RUNNER. husky is the conventional answer and it is a new dependency,
 * against this repo's stated rule ("no new npm dependencies",
 * supply-chain.test.ts) and its deliberately small tree of four runtime and
 * four dev packages. `core.hooksPath` is built into git and does the same job
 * with nothing added.
 *
 * That also settles the open question on #35 — whether a `prepare`-installed
 * hook is acceptable given this repo's supply-chain posture. It is, because
 * `prepare` here runs OUR OWN installer, three lines long and visible in the
 * diff, rather than a third party's postinstall. #39 drew exactly that line:
 * the allowlist governs code we did not write and cannot review.
 *
 * THE MECHANISM, NOT THE SOURCE TEXT. Asserting the hook file merely contains
 * "npm run test:unit" would pass on a hook git never invokes — a file in a
 * directory nothing points at. `core.hooksPath` is what makes it run, so that
 * is what is asserted; `npm ci` runs `prepare` before `test:unit` in CI, so
 * this is a live check there rather than a claim about a config file.
 *
 * PRE-PUSH, NOT PRE-COMMIT, deliberately. Committing a broken intermediate
 * state is normal and useful while working; pushing is the moment the work
 * becomes shared and the moment a CI run would otherwise be burned. A gate at
 * the commit boundary charges for every step of the work and buys nothing that
 * the push gate does not already buy.
 *
 * E2E IS NOT IN THE HOOK. ~7.3 minutes locally would make pushing unusable, so
 * CI remains its gate. Asserted, not merely intended: a well-meaning addition
 * of `test:e2e` here fails this suite.
 */

const HOOK = '.githooks/pre-push';
const hookSource = () => readFileSync(HOOK, 'utf8');

/**
 * The npm scripts the hook RUNS, sorted.
 *
 * Comment lines are dropped and only a command at the start of a line counts,
 * so neither the hook's header nor the `npm run ...` hints inside its failure
 * messages can satisfy an assertion about what it executes.
 */
function invokedNpmScripts(): string[] {
  return hookSource()
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .map((line) => /^\s*npm run (\S+)/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name))
    .sort();
}

const packageJson = () =>
  JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

describe('the pre-push hook', () => {
  it('is the hook directory git actually consults', () => {
    // The seam. A hook script in a directory `core.hooksPath` does not name is
    // an inert file, and every source-text assertion below would still pass.
    // `git config` EXITS 1 when the key is unset, so this has to be caught:
    // letting it throw reports a spawn failure and buries the actual finding.
    let configured = '';
    try {
      configured = execFileSync('git', ['config', 'core.hooksPath'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      configured = '(unset)';
    }
    expect(
      configured,
      'git is not pointed at .githooks — run `npm install` to trigger the ' +
        '`prepare` script, which is what installs the hook',
    ).toBe('.githooks');
  });

  it('is installed by `prepare`, so a fresh clone gets it', () => {
    // Without this, the check above passes forever on a machine where the
    // config was set once by hand, while a new contributor gets no hook at all.
    expect(packageJson().scripts.prepare).toBe(
      'node scripts/install-hooks.mjs',
    );
  });

  it('exists and is executable', () => {
    expect(() => accessSync(HOOK, constants.X_OK)).not.toThrow();
  });

  it('invokes exactly the two checks that gate the first CI step', () => {
    // COMMANDS ACTUALLY INVOKED, not strings present in the file. Asserting
    // `toContain('npm run test:unit')` passed while the hook did NOT run it:
    // the string survived inside the failure hint the hook prints to tell you
    // how to re-run it by hand. That is #23's defect exactly -- a guard
    // satisfied by the file's own documentation -- and only mutation testing
    // showed it, because the assertion reads as obviously correct.
    //
    // An exact set also removes the need for a separate "does not run e2e"
    // check: ~7.3 minutes in a pre-push hook is a hook everyone bypasses, so
    // `test:e2e` appearing here must fail, and adding a third check of any
    // kind should be a deliberate edit to this list.
    expect(invokedNpmScripts()).toEqual(['format', 'test:unit']);
  });
});
