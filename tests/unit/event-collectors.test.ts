import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { specDirs } from '../spec-dirs';
import { tsFilesUnder } from '../source-files';
import { withoutTsComments } from './source-text';

/**
 * Browser events that exist only to be COLLECTED and asserted on later, as
 * opposed to `dialog` and `download`, which a test HANDLES in the moment.
 *
 * The distinction matters because collecting is where the vacuity lives. A
 * collected event arrives over the browser protocol asynchronously, so a test
 * that reads the array the instant an action returns is racing delivery.
 * CI proved it on 2026-09-09 (run 34391533802): six `fetch` calls had been
 * issued and `expect(audioRequests).toHaveLength(6)` saw `[]`.
 *
 * That is survivable as a flake. The same expression asserting ABSENCE is
 * not — eight sites read `toEqual([])` the same instant, including
 * `the homepage still ships no JavaScript`, which would have certified a
 * homepage full of JavaScript for exactly the reason CI demonstrated. #79.
 */
const COLLECTED_EVENTS = [
  'request',
  'requestfailed',
  'requestfinished',
  'response',
  'console',
  'pageerror',
] as const;

const SUBSCRIBES = new RegExp(
  `\\.on\\(\\s*['"\`](?:${COLLECTED_EVENTS.join('|')})['"\`]`,
);

/**
 * Where a subscription is allowed to live. Everything else must take a
 * recorder from here, because a recorder can refuse to answer when it has
 * seen nothing at all — a convention at the call site cannot.
 */
const RECORDERS = 'tests/e2e/recorders.ts';

/** Every file a spec could put a collector in — derived, never listed (#67). */
const SCANNED = specDirs().flatMap(tsFilesUnder).sort();

export function subscribesToACollectedEvent(source: string): boolean {
  return SUBSCRIBES.test(withoutTsComments(source));
}

describe('browser-event collectors have exactly one home', () => {
  it('scans every spec directory', () => {
    // Anti-vacuity: an empty scan satisfies the assertion below, which is the
    // very failure mode this ticket is about.
    expect(SCANNED.length).toBeGreaterThan(20);
    expect(SCANNED).toContain('tests/e2e/classroom-groups.spec.ts');
    expect(SCANNED).toContain(RECORDERS);
  });

  it('is subscribed to only in recorders.ts', () => {
    expect(
      SCANNED.filter((path) =>
        subscribesToACollectedEvent(readFileSync(path, 'utf8')),
      ),
    ).toEqual([RECORDERS]);
  });

  it('catches a hand-rolled collector', () => {
    expect(
      subscribesToACollectedEvent(`
        const errors: string[] = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      `),
    ).toBe(true);
  });

  it('is not fired by a comment describing one', () => {
    expect(
      subscribesToACollectedEvent(`
        // Deliberately NOT page.on('request', ...) — see recorders.ts, which
        // refuses to answer when it has recorded nothing at all.
        const seen = recordRequests(page);
      `),
    ).toBe(false);
  });

  it('leaves dialog and download handlers alone', () => {
    // These are handled in the moment, not collected and asserted later, so
    // they carry none of the delivery race this guard exists to stop.
    expect(
      subscribesToACollectedEvent(`
        page.on('dialog', (d) => d.dismiss());
        page.on('download', (d) => saved.push(d.suggestedFilename()));
      `),
    ).toBe(false);
  });
});
