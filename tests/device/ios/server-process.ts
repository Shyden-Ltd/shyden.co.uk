/**
 * Starts a long-running server process and waits until it is ready to
 * answer. `safaridriver` is the one caller; the logic lives here, apart from
 * the session lifecycle in `session.ts`, so it can be exercised against real
 * processes without a phone or a Mac-only binary (#309).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { waitFor } from './webdriver';

export interface ServerReadiness {
  /** Resolves true once the server answers. A throw (e.g. a refused `fetch`) means "not yet". */
  readonly isReady: () => Promise<boolean>;
  readonly timeout: number;
  /** What ready means, phrased to follow "waiting for:". */
  readonly describe: string;
}

/**
 * How much of the server's output the error keeps. `safaridriver` on a taken
 * port prints one line, "Unable to start the server: Address already in use",
 * and that line is the whole diagnosis.
 */
const OUTPUT_TAIL_CHARS = 500;

/**
 * Spawns `command` and resolves with the running process once `isReady`
 * holds. A server that ends first -- it exits, is killed, or never starts --
 * can never answer, so the wait stops the moment that is known instead of
 * polling to the timeout, and the error names the exit code, the signal and
 * what the server printed.
 */
export async function startServerProcess(
  command: string,
  args: readonly string[],
  readiness: ServerReadiness,
): Promise<ChildProcess> {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const keepTail = (chunk: string): void => {
    output = (output + chunk).slice(-OUTPUT_TAIL_CHARS);
  };
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', keepTail);
  }

  // `ended` answers "is it over?" between polls; `whenEnded` interrupts a
  // poll already in flight, because the port the server failed to bind may
  // belong to something that accepts the readiness request and never answers.
  let ended: Error | undefined;
  const { promise: whenEnded, reject: endWith } =
    Promise.withResolvers<never>();
  whenEnded.catch(() => undefined); // it settles when the server ends, long after the wait if it started
  const end = (error: Error): void => {
    ended ??= error;
    endWith(ended);
  };

  // `close`, not `exit`: it fires once the output streams have ended, so the
  // message carries everything the server printed, and it also follows a
  // failed spawn, which emits `error` and never `exit`.
  const onSpawnError = (error: Error): void => {
    end(
      new Error(
        `${command} could not be started (${error.message}) while waiting for: ${readiness.describe}`,
      ),
    );
  };
  child.on('error', onSpawnError);
  child.once('close', (code, signal) => {
    const printed = output.trim();
    end(
      new Error(
        `${command} exited (code=${code}, signal=${signal}) while waiting for: ${readiness.describe}. ` +
          (printed ? `It printed: ${printed}` : 'It printed nothing.'),
      ),
    );
  });

  try {
    await waitFor(
      async () => {
        if (ended) throw ended;
        const ready = await Promise.race([readiness.isReady(), whenEnded]);
        return ready ? true : undefined;
      },
      {
        timeout: readiness.timeout,
        describe: readiness.describe,
        retryable: (error) => error !== ended,
      },
    );
  } catch (error) {
    child.kill();
    throw error;
  } finally {
    child.off('error', onSpawnError);
  }

  return child;
}
