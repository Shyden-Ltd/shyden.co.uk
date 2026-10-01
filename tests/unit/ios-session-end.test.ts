import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endSession } from '../device/ios/session';
import { withoutTsComments } from './source-text';

/**
 * How the iOS leg lets go of the one session the phone allows (#390).
 *
 * The phone takes exactly one WebDriver session, so one left open locks every
 * later run out. A marker on disk names the open session, and the runner
 * deletes it after the fact if this process dies first. The marker's contract
 * is that it is removed only once the session is confirmed gone. `teardown()`
 * kept it; the two failure paths in `startIosSession` cleared it whether or
 * not the delete had worked, so a failed delete there left a live session
 * nothing would ever find.
 *
 * Run without a phone: the driver, safaridriver and the marker are stand-ins
 * that record what was asked of them, in order.
 */
const recorder = (deleteOutcome: () => Promise<void>) => {
  const calls: string[] = [];
  return {
    calls,
    driver: {
      deleteSession: () => {
        calls.push('delete the session');
        return deleteOutcome();
      },
    },
    child: {
      kill: () => {
        calls.push('stop safaridriver');
        return true;
      },
    },
    clearMarker: () => {
      calls.push('clear the marker');
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('endSession', () => {
  it('clears the marker once the delete is confirmed, then stops safaridriver', async () => {
    const r = recorder(async () => undefined);

    const ended = await endSession(r.driver, r.child, r.clearMarker);

    expect(ended).toEqual({ deleted: true });
    expect(r.calls).toEqual([
      'delete the session',
      'clear the marker',
      'stop safaridriver',
    ]);
  });

  it('keeps the marker when the delete fails, so the runner can still close the session', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused = new Error('DELETE /session/abc: connection reset');
    const r = recorder(async () => {
      throw refused;
    });

    const ended = await endSession(r.driver, r.child, r.clearMarker);

    expect(ended).toEqual({ deleted: false, error: refused });
    expect(r.calls).toEqual(['delete the session', 'stop safaridriver']);
    expect(logged).toHaveBeenCalledWith(
      'Failed to delete the WebDriver session (stopping safaridriver; the marker stays for the runner to finish the job):',
      refused,
    );
  });

  it('waits for the delete to be answered before stopping the server that answers it', async () => {
    const { promise: answered, resolve: answer } =
      Promise.withResolvers<void>();
    const r = recorder(() => answered);

    const ending = endSession(r.driver, r.child, r.clearMarker);
    // Let every queued callback run: the kill must still be waiting.
    await new Promise((resolve) => setImmediate(resolve));
    expect(r.calls).toEqual(['delete the session']);

    answer();
    await ending;
    expect(r.calls).toEqual([
      'delete the session',
      'clear the marker',
      'stop safaridriver',
    ]);
  });
});

/**
 * The call sites need the iPhone, so no test here can run them: mutation ES6
 * rewound one of `startIosSession`'s failure paths to the old defect and every
 * test above stayed green. What can be held without a phone is the shape: the
 * marker is cleared by `endSession`, on a confirmed delete, and otherwise only
 * once, at the start of a run, before any session exists.
 */
describe('the session marker is cleared in one place', () => {
  it('outside endSession, only by the start-of-run clear', () => {
    const source = withoutTsComments(
      readFileSync('tests/device/ios/session.ts', 'utf8'),
    );
    // The positive control: this is the file that owns the marker.
    expect(source).toContain('function clearSessionMarker(): void');

    const statements = source.match(/\bclearSessionMarker\(\);/g) ?? [];
    expect(
      statements,
      'a second clear is a path that can erase the marker of a session it ' +
        'never confirmed deleted; end the session through endSession instead',
    ).toEqual(['clearSessionMarker();']);
  });
});
