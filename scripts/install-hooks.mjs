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

// `.git` existing is a PROXY for "git will work here", and it is weaker than
// the thing it stands for: git refuses a repository whose files are owned by
// another user unless it is named in `safe.directory`, and a container job
// checks out as one uid and runs as another. The guard above passed, this
// line then died with `fatal: not in a git directory`, and it failed
// `npm ci` -- so a job that only wanted to run tests could not install at
// all. Found by adding a containerised CI job (#33), never by reading.
//
// A hook installer must never fail an install. Not installing a convenience
// is not an error; claiming to have installed one would be.
try {
  execFileSync('git', ['config', 'core.hooksPath', HOOKS], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
} catch (error) {
  const detail = String(error?.stderr ?? '').trim() || 'git refused';
  console.log(
    `install-hooks: git would not accept a config here (${detail}), so no ` +
      `hooks were installed. That is expected inside a container or a CI ` +
      `checkout, and it is not a reason to fail the install.`,
  );
  process.exit(0);
}
console.log(
  `install-hooks: git will run hooks from ${HOOKS}/ — ` +
    `pre-push checks formatting and unit tests. Bypass one push with --no-verify.`,
);
