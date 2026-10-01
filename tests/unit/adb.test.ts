import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ADB_TIMEOUT_MS, adb } from '../../scripts/adb.mjs';
import { scratchDir } from '../scratch-dir';
import { filesUnder, searched } from '../source-files';
import { withoutTsComments } from './source-text';

/**
 * Every `adb` call the device leg makes goes through `scripts/adb.mjs` (#390).
 *
 * Nineteen calls across five files were bare `execFileSync('adb', ...)` with no
 * deadline. A wedged phone leaves `adb shell` waiting, and a synchronous wait
 * blocks the worker's event loop, so not even Playwright's test timeout can
 * fire: the gauntlet hangs with nothing to say why.
 */

/** Answers `$1 $2…`, fails on `fail`, and never answers on `hang`. */
const STAND_IN = `#!/bin/sh
if [ "$1" = hang ]; then exec sleep 30; fi
if [ "$1" = fail ]; then echo "no devices/emulators found" >&2; exit 1; fi
echo "answered: $*"
`;

describe('adb()', () => {
  let path: string | undefined;
  beforeEach(() => {
    const bin = scratchDir('adb-stand-in-');
    writeFileSync(join(bin, 'adb'), STAND_IN);
    chmodSync(join(bin, 'adb'), 0o755);
    path = process.env.PATH;
    process.env.PATH = `${bin}${delimiter}${path ?? ''}`;
  });
  afterEach(() => {
    process.env.PATH = path;
  });

  it('returns what adb printed', () => {
    expect(adb(['shell', 'dumpsys', 'window'])).toBe(
      'answered: shell dumpsys window\n',
    );
  });

  it('names the command and the cause when adb gives no answer in time', () => {
    const started = Date.now();
    expect(() => adb(['hang', 'now'], { timeoutMs: 300 })).toThrow(
      /^adb hang now gave no answer within 300 ms: is the phone still connected and unlocked\?$/,
    );
    // Stopped at its deadline, not when the stand-in's 30 s ran out.
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("names the command and adb's own words when adb fails", () => {
    expect(() => adb(['fail'])).toThrow(
      /^adb fail failed: [\s\S]*no devices\/emulators found/,
    );
  });

  it('allows fifteen seconds by default', () => {
    expect(ADB_TIMEOUT_MS).toBe(15_000);
  });
});

describe('no file spawns adb but scripts/adb.mjs', () => {
  it('reads every call site through the one home', () => {
    const files = ['tests', 'scripts'].flatMap((dir) =>
      filesUnder(dir, (file) => /\.(ts|mjs)$/.test(file)),
    );
    const spawning = files.filter(
      (file) =>
        file !== 'scripts/adb.mjs' &&
        /\b(?:execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*['"`]adb\b/.test(
          withoutTsComments(readFileSync(file, 'utf8')),
        ),
    );
    expect(
      searched(spawning, {
        of: files,
        what: 'files under tests/ and scripts/',
      }),
    ).toEqual([]);
  });
});
