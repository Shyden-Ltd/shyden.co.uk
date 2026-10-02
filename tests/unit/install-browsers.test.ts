import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ATTEMPTS,
  LIMIT_MS,
  installWithRetry,
} from '../../scripts/install-browsers.mjs';
import { scratchDir } from '../scratch-dir';

/**
 * The browser install's limit and retry, run against real child processes
 * (#431). Run 36973026350's shard spent its job's whole 20 minutes in one
 * `playwright install` that a slow mirror held open; here a stand-in command
 * stalls, fails, or completes, and the wrapper is judged by what it does to a
 * real process, not by what it was told.
 */

/** A node one-liner as a command, so each case is a real process. */
const nodeScript = (source: string) => ({
  command: process.execPath,
  args: ['-e', source],
});

/** Stalls on its first run (it leaves a marker), completes on the next. */
const stallsOnce = (marker: string) =>
  nodeScript(
    `const fs = require('node:fs');
     if (fs.existsSync(${JSON.stringify(marker)})) process.exit(0);
     fs.writeFileSync(${JSON.stringify(marker)}, '');
     setTimeout(() => {}, 60_000);`,
  );

const quiet = () => {};

describe('the browser install (#431)', () => {
  it('gives each attempt over twice the slowest install measured, and one retry', () => {
    // 23 green shard runs took 37 to 81 s (median 58 s). Two attempts at
    // 180 s still leave a 15-minute job most of its budget for the tests.
    expect(LIMIT_MS).toBe(180_000);
    expect(ATTEMPTS).toBe(2);
  });

  it('runs a command that completes once, and only once', async () => {
    const dir = scratchDir('install-once-');
    const count = join(dir, 'runs');
    await installWithRetry({
      ...nodeScript(
        `require('node:fs').appendFileSync(${JSON.stringify(count)}, 'x')`,
      ),
      limitMs: 10_000,
      log: quiet,
    });
    expect(readFileSync(count, 'utf8')).toBe('x');
  });

  it('stops an attempt at its limit and retries it', async () => {
    const dir = scratchDir('install-stall-');
    const lines: string[] = [];
    await installWithRetry({
      ...stallsOnce(join(dir, 'tried')),
      limitMs: 1_000,
      log: (line) => lines.push(line),
    });
    expect(lines.join('\n')).toMatch(/attempt 1 of 2 stopped at its 1 s limit/);
  }, 30_000);

  it('retries an attempt that fails, the way a network error ends one', async () => {
    const dir = scratchDir('install-fail-');
    const marker = join(dir, 'tried');
    const lines: string[] = [];
    await installWithRetry({
      ...nodeScript(
        `const fs = require('node:fs');
         if (fs.existsSync(${JSON.stringify(marker)})) process.exit(0);
         fs.writeFileSync(${JSON.stringify(marker)}, '');
         process.exit(100);`,
      ),
      limitMs: 10_000,
      log: (line) => lines.push(line),
    });
    expect(lines.join('\n')).toMatch(/attempt 1 of 2 exited 100/);
  });

  it('runs the step between attempts that repairs what a stopped one left', async () => {
    const dir = scratchDir('install-repair-');
    const order: string[] = [];
    await installWithRetry({
      ...stallsOnce(join(dir, 'tried')),
      limitMs: 1_000,
      beforeRetry: async () => {
        order.push('repair');
      },
      log: () => order.push('the stopped attempt reported'),
    });
    expect(order).toEqual(['the stopped attempt reported', 'repair']);
  }, 30_000);

  it('fails naming the stall when every attempt stalls', async () => {
    await expect(
      installWithRetry({
        ...nodeScript('setTimeout(() => {}, 60_000)'),
        limitMs: 500,
        log: quiet,
      }),
    ).rejects.toThrow(
      'the browser install did not finish in 2 attempts: attempt 1 of 2 stopped at its 0.5 s limit; attempt 2 of 2 stopped at its 0.5 s limit. ' +
        'A package mirror or the browser download stalled; re-run the job.',
    );
  }, 30_000);

  it('stops the whole process tree, not only the command it started', async () => {
    // apt-get runs under `playwright install`, so a limit that killed only
    // the command would leave the download running behind the retry.
    const dir = scratchDir('install-tree-');
    const started = join(dir, 'grandchild-started');
    const late = join(dir, 'grandchild-wrote');
    await expect(
      installWithRetry({
        ...nodeScript(
          `require('node:child_process').spawn(process.execPath, ['-e',
             "const fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(started).replaceAll('"', '\\"')}, ''); setTimeout(() => fs.writeFileSync(${JSON.stringify(late).replaceAll('"', '\\"')}, ''), 2500)"],
             { stdio: 'ignore' });
           setTimeout(() => {}, 60_000);`,
        ),
        limitMs: 500,
        attempts: 1,
        log: quiet,
      }),
    ).rejects.toThrow(/stopped at its 0.5 s limit/);
    // Past the grandchild's own 2.5 s: had it outlived the limit, it would
    // have written by now.
    await new Promise((resolve) => setTimeout(resolve, 3_500));
    expect(existsSync(started), 'the grandchild ran').toBe(true);
    expect(existsSync(late)).toBe(false);
  }, 30_000);
});
