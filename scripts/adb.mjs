/**
 * Every `adb` call the device leg makes, with a deadline (#390).
 *
 * Nineteen calls across the runner and the device specs were bare
 * `execFileSync('adb', ...)`, with no timeout. A wedged phone leaves
 * `adb shell` waiting for an answer that never comes, and because the call is
 * synchronous it also blocks the event loop that would have fired Playwright's
 * own test timeout, so the gauntlet hung with nothing to say why. Here a call
 * that runs past its deadline is stopped, and the error names the command.
 *
 * One home, imported by `scripts/test-devices.mjs` and by `tests/device/`, and
 * held by `tests/unit/adb.test.ts`, which also refuses any other file that
 * spawns `adb` itself.
 */

import { execFileSync } from 'node:child_process';
import { messageOf } from './errors.mjs';

/**
 * How long one `adb` call may take. The slowest the device leg makes, a cold
 * `am start`, answers in about two seconds, so this is room for a slow phone
 * while a wedged one still fails inside a test's 30-second budget.
 */
export const ADB_TIMEOUT_MS = 15_000;

/**
 * Runs `adb` with `args` and returns what it printed. Throws, naming the
 * command, when adb fails or gives no answer within `timeoutMs`.
 *
 * @param {readonly string[]} args
 * @param {{ timeoutMs?: number }} [options]
 * @returns {string}
 */
export function adb(args, { timeoutMs = ADB_TIMEOUT_MS } = {}) {
  const command = `adb ${args.join(' ')}`;
  try {
    return execFileSync('adb', [...args], {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const timedOut =
      error instanceof Error && 'code' in error && error.code === 'ETIMEDOUT';
    throw new Error(
      timedOut
        ? `${command} gave no answer within ${timeoutMs} ms: is the phone still connected and unlocked?`
        : `${command} failed: ${messageOf(error)}`,
      { cause: error },
    );
  }
}
