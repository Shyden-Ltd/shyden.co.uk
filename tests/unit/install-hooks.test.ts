import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scratchGit, withoutLocalGit } from '../git-env';

/**
 * `scripts/install-hooks.mjs`, run by `npm install` (`prepare`) in a clone,
 * in a source tarball and in a container checkout.
 *
 * Its success line once named only the pre-push hook while `.githooks/`
 * installed `commit-msg` too, which is the closing-keyword refusal. The line
 * now names what the directory holds, so a hook added later is named the day
 * it lands.
 */

const SCRIPT = path.resolve(
  import.meta.dirname,
  '../../scripts/install-hooks.mjs',
);

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'install-hooks-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const install = () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: withoutLocalGit(process.env),
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
};

describe('install-hooks', () => {
  it('points git at .githooks and names every hook it holds', () => {
    const git = scratchGit(dir);
    git(['init', '-q']);
    mkdirSync(path.join(dir, '.githooks'));
    for (const hook of ['pre-push', 'commit-msg', '.DS_Store'])
      writeFileSync(path.join(dir, '.githooks', hook), '');

    const { code, out, err } = install();

    expect(err).toBe('');
    expect(out).toBe(
      'install-hooks: git will run the hooks in .githooks/: commit-msg, ' +
        'pre-push. Bypass one with --no-verify.\n',
    );
    expect(git(['config', 'core.hooksPath']).trim()).toBe('.githooks');
    expect(code).toBe(0);
  });

  it('says so when .githooks holds no hook, rather than naming none', () => {
    scratchGit(dir)(['init', '-q']);

    const { code, out } = install();

    expect(out).toBe(
      'install-hooks: git will read hooks from .githooks/, which holds none.\n',
    );
    expect(code).toBe(0);
  });

  it('installs nothing, and says so, where there is no .git', () => {
    const { code, out } = install();

    // The whole output: without its exit, this branch would go on to ask
    // git, and print git's refusal after it.
    expect(out).toBe(
      'install-hooks: no .git here, so no git hooks were installed. ' +
        'Run this again from a clone to install its hooks.\n',
    );
    expect(code).toBe(0);
  });

  it('never fails an install when git refuses the config, and says why', () => {
    writeFileSync(path.join(dir, '.git'), 'not a repository\n');

    const { code, out } = install();

    expect(out).toContain(
      'install-hooks: git would not accept a config here (fatal: ',
    );
    expect(out).toContain('so no hooks were installed.');
    expect(code).toBe(0);
  });
});
