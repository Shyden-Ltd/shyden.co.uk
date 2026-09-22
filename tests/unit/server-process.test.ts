import { describe, it, expect, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServerProcess } from '../device/ios/server-process';

/**
 * `startServerProcess` starts `safaridriver` and waits for it to answer
 * (#309).
 *
 * Each case runs a real Node process in the server's place, so the suite
 * needs no phone and no Mac-only binary: one that dies at startup the way
 * `safaridriver` does when its port is taken (measured: exit code 1 after
 * 215 ms, printing "Unable to start the server: Address already in use"),
 * one killed by a signal, one that cannot be started at all, and one that
 * takes a moment before it listens.
 */

const node = process.execPath;

const DIES_LIKE_A_TAKEN_PORT =
  "require('node:fs').writeSync(2, 'Unable to start the server: Address already in use'); process.exit(1);";
const KILLED_AT_STARTUP = "process.kill(process.pid, 'SIGKILL');";
const LISTENS_AFTER_A_MOMENT = [
  'const port = Number(process.argv[1]);',
  'setTimeout(() => {',
  "  require('node:http')",
  "    .createServer((request, response) => response.end(JSON.stringify({ value: { message: '', ready: true } })))",
  "    .listen(port, '127.0.0.1');",
  '}, 300);',
].join('\n');

const running: ChildProcess[] = [];
afterEach(() => {
  for (const child of running.splice(0)) child.kill();
});

/** A port nothing listens on: bound, then let go. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`expected a TCP address, got ${String(address)}`);
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

/** `GET /status` the way `startSafaridriver` asks it: a refused connection throws. */
function answersStatus(port: number): () => Promise<boolean> {
  return async () => {
    const response = await fetch(`http://127.0.0.1:${port}/status`);
    const body = (await response.json()) as { value?: { ready?: boolean } };
    return body.value?.ready === true;
  };
}

/** Starts `node -e <script>` against a free port and settles, timing it. */
async function attemptStart(
  command: string,
  args: readonly string[],
): Promise<{ outcome: unknown; elapsed: number; port: number }> {
  const port = await freePort();
  const began = performance.now();
  const outcome = await startServerProcess(command, args, {
    isReady: answersStatus(port),
    timeout: 15_000,
    describe: `the server on port ${port} to answer GET /status with ready:true`,
  }).catch((error: unknown) => error);
  return { outcome, elapsed: Math.round(performance.now() - began), port };
}

function messageOf(outcome: unknown): string {
  expect(outcome).toBeInstanceOf(Error);
  return (outcome as Error).message;
}

describe('startServerProcess', () => {
  it('reports a server that dies at startup at once, with its exit code and what it printed', async () => {
    const { outcome, elapsed, port } = await attemptStart(node, [
      '-e',
      DIES_LIKE_A_TAKEN_PORT,
    ]);

    expect(elapsed, `the exit was reported after ${elapsed} ms`).toBeLessThan(
      2_000,
    );
    const message = messageOf(outcome);
    expect(
      {
        exitCode: message.includes('code=1,'),
        signal: message.includes('signal=null'),
        printed: message.includes(
          'Unable to start the server: Address already in use',
        ),
        awaited: message.includes(`port ${port} to answer GET /status`),
      },
      message,
    ).toEqual({ exitCode: true, signal: true, printed: true, awaited: true });
  });

  it('names the signal that killed a server at startup', async () => {
    const { outcome, elapsed } = await attemptStart(node, [
      '-e',
      KILLED_AT_STARTUP,
    ]);

    expect(elapsed, `the kill was reported after ${elapsed} ms`).toBeLessThan(
      2_000,
    );
    expect(messageOf(outcome)).toContain('code=null, signal=SIGKILL');
  });

  it('reports a command that cannot be started at all, instead of crashing the run', async () => {
    const missing = join(tmpdir(), 'no-such-server-309');
    const { outcome, elapsed } = await attemptStart(missing, []);

    expect(
      elapsed,
      `the failure was reported after ${elapsed} ms`,
    ).toBeLessThan(2_000);
    const message = messageOf(outcome);
    expect(
      { command: message.includes(missing), cause: message.includes('ENOENT') },
      message,
    ).toEqual({ command: true, cause: true });
  });

  it('polls through refused connections until a server that is slow to start answers', async () => {
    const port = await freePort();
    let refusals = 0;
    const ready = answersStatus(port);

    const child = await startServerProcess(
      node,
      ['-e', LISTENS_AFTER_A_MOMENT, String(port)],
      {
        isReady: async () => {
          try {
            return await ready();
          } catch (error) {
            refusals += 1;
            throw error;
          }
        },
        timeout: 15_000,
        describe: `the server on port ${port} to answer GET /status with ready:true`,
      },
    );
    running.push(child);

    expect({
      stillRunning: child.exitCode === null && child.signalCode === null,
      refusedBeforeAnswering: refusals > 0,
    }).toEqual({ stillRunning: true, refusedBeforeAnswering: true });
  });
});
