import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filesUnder, searched } from '../source-files';
import { withoutTsComments } from './source-text';

/**
 * Each command-line tool the device leg drives is spawned from one home, which
 * gives every call a deadline and an error that names the command (#390).
 *
 * A synchronous call to a wedged phone blocks the worker's event loop, so not
 * even the test timeout can fire: the gauntlet hangs with nothing to say why.
 * `adb` had nineteen such calls across five files. `xcrun devicectl` had two,
 * in the runner and the iOS session, each with its own copy of the parsing,
 * and only the runner's had been taught to name a listing of another shape.
 */
const HOMES = [
  { tool: 'adb', home: 'scripts/adb.mjs' },
  { tool: 'xcrun', home: 'scripts/devicectl.mjs' },
] as const;

const files = ['tests', 'scripts'].flatMap((dir) =>
  filesUnder(dir, (file) => /\.(ts|mjs)$/.test(file)),
);

describe.each(HOMES)('no file spawns $tool but $home', ({ tool, home }) => {
  it('reads every call site through the one home', () => {
    const spawns = new RegExp(
      String.raw`\b(?:execFileSync|execFile|spawnSync|spawn|execSync|exec|runWithDeadline)\(\s*['"\`]` +
        tool +
        String.raw`\b`,
    );
    const spawning = files.filter(
      (file) =>
        file !== home &&
        spawns.test(withoutTsComments(readFileSync(file, 'utf8'))),
    );
    expect(
      searched(spawning, {
        of: files,
        what: 'files under tests/ and scripts/',
      }),
    ).toEqual([]);

    // The positive control: the home itself is caught by the same pattern, so
    // an empty list above is a fact about the other files and not a pattern
    // that has stopped matching anything.
    expect(
      spawns.test(withoutTsComments(readFileSync(home, 'utf8'))),
      `${home} spawns ${tool}`,
    ).toBe(true);
  });
});

/**
 * The runner and the Android preflight each read `adb devices` themselves, and
 * disagreed: the runner takes the phone `ANDROID_SERIAL` names among several,
 * while the preflight refused any listing that was not exactly one ready
 * device, so a two-phone setup the runner accepts failed preflight test 1.
 * Both now ask `androidAbsence`, beside the `adb` it reads (#390).
 */
describe('`adb devices` is read in one place', () => {
  it('only scripts/adb.mjs decides which listed device is ready', () => {
    const readsState = /\bstate\s*(?:===|:)\s*['"]device['"]/;
    const reading = files.filter((file) =>
      readsState.test(withoutTsComments(readFileSync(file, 'utf8'))),
    );
    expect(
      searched(reading, { of: files, what: 'files under tests/ and scripts/' }),
    ).toEqual(['scripts/adb.mjs']);
  });
});
