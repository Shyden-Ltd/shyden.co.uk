#!/usr/bin/env node
/**
 * `npx playwright install --with-deps`, with a time limit on each attempt and
 * one retry (#431).
 *
 * Run 36973026350's e2e shard 2 spent its job's whole 20 minutes in this
 * install while a package mirror served one file every two or three seconds:
 * no test ran, `build-and-test` failed on the cancel, and only a manual re-run
 * recovered it. Across 23 green shard runs the same step took 37 to 81 s
 * (median 58 s), so an attempt still running at LIMIT_MS is stalled, not slow.
 * It is stopped, process tree and all, and tried once more; a stall on both
 * attempts fails the step in words that say so, rather than as a generic
 * cancel at the job's limit.
 *
 *   node scripts/install-browsers.mjs [browser ...]
 *
 * Every workflow installs browsers through this file, which
 * `pipeline-wiring.test.ts` derives from the parsed workflows.
 */
import { spawn, spawnSync } from 'node:child_process';
import { argv, env, exit, platform } from 'node:process';

/** Over twice the slowest measured install (81 s). */
export const LIMIT_MS = 180_000;

/** The first attempt and one retry. */
export const ATTEMPTS = 2;

/**
 * Runs `command` once, in a process group of its own so a limit stops
 * everything under it: `playwright install --with-deps` runs apt-get, and a
 * download left running behind the retry would hold apt's lock against it.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @param {number} limitMs
 * @returns {Promise<{ stalled: boolean, code: number | null, signal: string | null }>}
 */
function attempt(command, args, limitMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: 'inherit',
      detached: true,
    });
    let stalled = false;
    const timer = setTimeout(() => {
      stalled = true;
      try {
        process.kill(-(/** @type {number} */ (child.pid)), 'SIGKILL');
      } catch (error) {
        // ESRCH: the group ended between the timer firing and the kill.
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH')
          throw error;
      }
    }, limitMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ stalled, code, signal });
    });
  });
}

/**
 * `1000` as `1 s`, `500` as `0.5 s`: the limit as a reader would write it.
 * @param {number} ms
 */
const seconds = (ms) => `${ms / 1000} s`;

/**
 * Runs `command` until an attempt exits 0, at most `attempts` times, each
 * stopped at `limitMs`. `beforeRetry` runs between attempts, to repair what a
 * stopped one left behind. Each failed attempt is reported through `log`;
 * when none succeeds, the error names every attempt and the stall.
 *
 * @param {{ command: string, args: readonly string[], limitMs: number,
 *   attempts?: number, beforeRetry?: () => Promise<void>,
 *   log?: (line: string) => void }} options
 * @returns {Promise<void>}
 */
export async function installWithRetry({
  command,
  args,
  limitMs,
  attempts = ATTEMPTS,
  beforeRetry = async () => {},
  log = (line) => console.error(line),
}) {
  /** @type {string[]} */
  const failures = [];
  for (let n = 1; n <= attempts; n += 1) {
    if (n > 1) await beforeRetry();
    const { stalled, code, signal } = await attempt(command, args, limitMs);
    if (!stalled && code === 0) return;
    const failure = `attempt ${n} of ${attempts} ${
      stalled
        ? `stopped at its ${seconds(limitMs)} limit`
        : `exited ${code ?? `on ${signal}`}`
    }`;
    failures.push(failure);
    log(`playwright install: ${failure}`);
  }
  throw new Error(
    `the browser install did not finish in ${attempts} attempts: ${failures.join('; ')}. ` +
      'A package mirror or the browser download stalled; re-run the job.',
  );
}

/**
 * A stopped apt-get can leave dpkg half-configured, and the next install then
 * refuses to start until it is finished. On a CI runner, finish it; anywhere
 * else there is no apt run of ours to repair.
 */
async function repairApt() {
  if (platform !== 'linux' || !env.CI) return;
  spawnSync('sudo', ['-n', 'dpkg', '--configure', '-a'], { stdio: 'inherit' });
}

/** The browsers `playwright install` takes by name; none named means all. */
const BROWSERS = ['chromium', 'firefox', 'webkit'];

export async function main() {
  // Refused before anything is downloaded: a misspelt browser would
  // otherwise spend a whole attempt reaching Playwright's own refusal.
  const browsers = argv.slice(2);
  const unknown = browsers.filter((name) => !BROWSERS.includes(name));
  if (unknown.length > 0) {
    console.error(
      `usage: node scripts/install-browsers.mjs [${BROWSERS.join('|')} ...] -- not a browser: ${unknown.join(' ')}`,
    );
    exit(1);
  }
  try {
    await installWithRetry({
      command: 'npx',
      args: ['playwright', 'install', '--with-deps', ...browsers],
      limitMs: LIMIT_MS,
      beforeRetry: repairApt,
    });
  } catch (error) {
    console.error(`::error::${/** @type {Error} */ (error).message}`);
    exit(1);
  }
}

if (import.meta.main) await main();
