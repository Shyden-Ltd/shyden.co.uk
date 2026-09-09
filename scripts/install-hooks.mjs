#!/usr/bin/env node
/**
 * Points git at the version-controlled hooks in `.githooks/`.
 *
 * Run by `prepare`, so a fresh clone gets the pre-push hook from its first
 * `npm install` — a hook only one machine has is not a control.
 *
 * No hook runner. husky is the usual answer and it is a new dependency, which
 * this repo does not take ("no new npm dependencies", supply-chain.test.ts);
 * `core.hooksPath` is built into git and needs nothing installed. That also
 * keeps `prepare` running only THIS file, which is three lines of our own code
 * visible in the diff, rather than a third party's postinstall — the line #39
 * drew when it made install-time code execution an explicit allowlist.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const HOOKS = '.githooks';

// `.git` is a directory in a clone and a FILE in a linked worktree; both exist.
// A source tarball or zip has neither, and `npm install` there must not fail
// over a hook — but it must not pretend to have installed one either.
if (!existsSync('.git')) {
  console.log(
    `install-hooks: no .git here, so no git hooks were installed. ` +
      `Run this again from a clone if you want the pre-push checks.`,
  );
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', HOOKS]);
console.log(
  `install-hooks: git will run hooks from ${HOOKS}/ — ` +
    `pre-push checks formatting and unit tests. Bypass one push with --no-verify.`,
);
