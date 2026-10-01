import { chmodSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ADB_TIMEOUT_MS, adb, androidAbsence } from '../../scripts/adb.mjs';
import { scratchDir } from '../scratch-dir';

/**
 * Every `adb` call the device leg makes goes through `scripts/adb.mjs` (#390).
 *
 * Nineteen calls across five files were bare `execFileSync('adb', ...)` with no
 * deadline. A wedged phone leaves `adb shell` waiting, and a synchronous wait
 * blocks the worker's event loop, so not even Playwright's test timeout can
 * fire: the gauntlet hangs with nothing to say why. That every call goes
 * through it is held by `device-tool-homes.test.ts`.
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

describe('androidAbsence: a phone is present only when adb calls it ready', () => {
  const listing = (...lines: string[]) =>
    ['List of devices attached', ...lines, ''].join('\n');

  it('finds one ready phone', () => {
    expect(androidAbsence(listing('R58M123\tdevice'), undefined)).toBeNull();
  });

  it('refuses a phone that is attached but not ready, listing what it saw', () => {
    expect(
      androidAbsence(
        listing('R58M123\tunauthorized', 'emulator-5554\toffline'),
        undefined,
      ),
    ).toBe(
      "`adb devices` listed no device in state 'device' (unplugged, asleep, offline, or unauthorized otherwise) -- seen: " +
        '[{"serial":"R58M123","state":"unauthorized"},{"serial":"emulator-5554","state":"offline"}]',
    );
  });

  it('refuses no phone at all', () => {
    expect(androidAbsence(listing(), undefined)).toContain('seen: []');
  });

  it('refuses two ready phones without a serial to choose', () => {
    expect(
      androidAbsence(listing('R58M123\tdevice', 'R58M456\tdevice'), undefined),
    ).toBe(
      'expected exactly one ready Android device -- found 2: ' +
        '[{"serial":"R58M123","state":"device"},{"serial":"R58M456","state":"device"}]. Set ANDROID_SERIAL to disambiguate.',
    );
  });

  it('takes the phone ANDROID_SERIAL names among two', () => {
    expect(
      androidAbsence(listing('R58M123\tdevice', 'R58M456\tdevice'), 'R58M456'),
    ).toBeNull();
  });

  it('refuses a serial that is not attached, naming it', () => {
    expect(androidAbsence(listing('R58M123\tdevice'), 'R58M999')).toBe(
      "`adb devices` did not list serial R58M999 (from ANDROID_SERIAL) in state 'device' -- " +
        'seen: [{"serial":"R58M123","state":"device"}]',
    );
  });
});
