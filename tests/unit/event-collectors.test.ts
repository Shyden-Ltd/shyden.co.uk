import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { specDirs } from '../spec-dirs';
import { searched, tsFilesUnder } from '../source-files';
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

/**
 * A loop over a locator list, and whether anything proved the list non-empty
 * before it ran.
 *
 * `.all()` resolves to `[]` when nothing matches — it neither waits nor fails
 * — so a selector that drifts turns the loop into a no-op and the test goes
 * green having checked nothing its title claims. `chrome.spec.ts` proved that
 * and wrote the lesson out in a comment; `classroom-groups-io.spec.ts` was
 * written afterwards without it, and its WCAG 44px touch-target guard passed
 * with the selector pointed at a class that does not exist. A convention at
 * the call site is not a control (#87, after #79 and #84).
 *
 * Returns EVERY loop, proved or not, so the liveness of this detector reads
 * off the same data as its verdict: a regex that quietly stopped matching
 * would report zero unproved loops and zero loops, and only one of those is
 * a healthy suite.
 */
export interface LocatorLoop {
  /** The locator, as written: a variable name, or the selector it inlines. */
  readonly subject: string;
  readonly proved: boolean;
}

const A_LOCATOR_LOOP =
  /for\s*\(\s*const\s+\w+\s+of\s+await\s+(.+?)\.all\(\)\s*\)/;
const PROVES_NOT_EMPTY = /toHaveCount\s*\(|toBeVisible\s*\(/;

/** A bare `links`, or the selector string inside `page.locator('.x')`. */
const subjectOf = (expression: string): string =>
  expression.match(/'[^']*'|"[^"]*"|`[^`]*`/)?.[0] ?? expression.trim();

export function locatorLoops(source: string): LocatorLoop[] {
  const code = withoutTsComments(source);
  const loops = new RegExp(A_LOCATOR_LOOP, 'g');
  const found: LocatorLoop[] = [];
  for (let hit = loops.exec(code); hit; hit = loops.exec(code)) {
    const subject = subjectOf(hit[1]);
    // Only the enclosing test counts. A count asserted in a DIFFERENT test
    // proves nothing about this one, and the whole file would otherwise vouch
    // for every loop in it.
    const opens = [
      ...code.slice(0, hit.index).matchAll(/^[ \t]*(?:test|it)\s*\(/gm),
    ];
    const before = code.slice(opens.at(-1)?.index ?? 0, hit.index);
    found.push({
      subject,
      proved: before
        .split('\n')
        .some((line) => line.includes(subject) && PROVES_NOT_EMPTY.test(line)),
    });
  }
  return found;
}

describe('a locator list cannot be looped unproved', () => {
  it('sees the loops it is scanning for', () => {
    // The detector's own liveness. Zero unproved loops means nothing if the
    // regex found zero loops.
    expect(
      SCANNED.flatMap((path) => locatorLoops(readFileSync(path, 'utf8')))
        .length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('catches a loop with nothing proving the list is not empty', () => {
    expect(
      locatorLoops(
        "test('x', async () => {\n  for (const a of await links.all()) f(a);\n});",
      ),
    ).toEqual([{ subject: 'links', proved: false }]);
  });

  it('accepts a count, and accepts a visibility check on the first', () => {
    expect(
      locatorLoops(
        "test('x', async () => {\n  await expect(links).toHaveCount(3);\n  for (const a of await links.all()) f(a);\n});",
      ),
    ).toEqual([{ subject: 'links', proved: true }]);
    expect(
      locatorLoops(
        "test('x', async () => {\n  await expect(btns.first()).toBeVisible();\n  for (const b of await btns.all()) f(b);\n});",
      ),
    ).toEqual([{ subject: 'btns', proved: true }]);
  });

  it('reads an inlined locator by its selector, not by a variable name', () => {
    expect(
      locatorLoops(
        "test('x', async () => {\n  await expect(page.locator('.z')).toHaveCount(2);\n  for (const c of await page.locator('.z').all()) f(c);\n});",
      ),
    ).toEqual([{ subject: "'.z'", proved: true }]);
  });

  it('is not satisfied by a count asserted in a DIFFERENT test', () => {
    // Without the enclosing-test window the whole file would vouch for every
    // loop in it, which is how a guard decays into a formality.
    expect(
      locatorLoops(
        "test('a', async () => {\n  await expect(links).toHaveCount(3);\n});\ntest('b', async () => {\n  for (const a of await links.all()) f(a);\n});",
      ),
    ).toEqual([{ subject: 'links', proved: false }]);
  });

  it('is not fired by a comment describing one', () => {
    // chrome.spec.ts spells `.all()` out in prose at length, so this is a live
    // false-positive risk, not a hypothetical.
    expect(
      locatorLoops(
        "// for (const a of await links.all()) would be unproved here\ntest('x', () => {});",
      ),
    ).toEqual([]);
  });

  it('every .all() loop proves its locator is not empty first', () => {
    const unproved = SCANNED.flatMap((path) =>
      locatorLoops(readFileSync(path, 'utf8'))
        .filter((loop) => !loop.proved)
        .map((loop) => `${path}: ${loop.subject}`),
    );
    expect(
      searched(unproved, { of: SCANNED, what: 'scanned e2e specs' }),
      unproved.join('\n'),
    ).toEqual([]);
  });
});
