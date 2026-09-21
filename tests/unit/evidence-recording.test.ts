/**
 * A recording is earned by ACTION, and the rule is derived from the source.
 *
 * Operator, 2026-09-18, reviewing #205's preview: "recordings are pointless
 * and useless on static content", and "if there is some sort of action. I.e.
 * a click, a scroll or orientation change. Then we need a recording.
 * otherwise, screenshot is perfect on it's own."
 *
 * So the policy has two halves that must agree: a spec DECLARES
 * `test.use(recorded)`, and its own source says whether it acts. Neither
 * stands alone. A hand-written list of "the ones that animate" is exactly
 * the shape that opened `#cg-grouping-toggle` and `#cg-sound-toggle` and
 * never `#cg-io-toggle` -- the only one holding a native file input, and the
 * only one that broke. The source is the authority; the declaration is the
 * thing checked against it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { withoutTsComments } from './source-text';
import { specFilesUnder, searched, nonEmpty } from '../source-files';

const E2E = 'tests/e2e';
const HOME = 'tests/e2e/evidence.ts';
const CONFIG = 'playwright.config.ts';

const SPECS = nonEmpty(specFilesUnder(E2E), 'e2e specs');

/**
 * What ACTING is, spelled as the constructs that do it rather than as a
 * judgement about a spec's name. Matched with the leading dot and the opening
 * parenthesis so a test TITLE containing the word "click" is not an action.
 */
const ACTIONS = [
  '.click(',
  '.dblclick(',
  '.tap(',
  '.hover(',
  '.press(',
  '.type(',
  '.fill(',
  '.dragTo(',
  '.selectOption(',
  '.check(',
  '.uncheck(',
  '.setInputFiles(',
  '.scrollIntoViewIfNeeded(',
  '.setViewportSize(',
  'mouse.wheel(',
  'mouse.down(',
  'scrollTo(',
  'scrollBy(',
] as const;

/** Comment-stripped, so a spec's own prose can never satisfy or defeat this. */
const sourceOf = (path: string): string =>
  withoutTsComments(readFileSync(path, 'utf8'));

const VIEWPORT = '.setViewportSize(';

const countOf = (text: string, token: string): number =>
  text.split(token).length - 1;

/**
 * A viewport SET is configuration; a viewport CHANGE is an action.
 *
 * Operator's rule names an "orientation change". Choosing a device before
 * `goto` renders the page once and nothing moves -- measured: `site-meta`,
 * `thai-typography` and `not-found` each call it exactly once, and each is
 * static content. Two calls INSIDE ONE TEST is the page reflowing mid-journey,
 * which is the thing a still cannot show. Counted per test rather than per
 * file because `homepage` calls it twice in two DIFFERENT tests, which is two
 * configurations, not a change.
 */
const viewportChanges = (text: string): boolean =>
  text
    .split(/\b(?:test|it)\s*\(/)
    .some((chunk) => countOf(chunk, VIEWPORT) > 1);

const actionsIn = (text: string): string[] => {
  const found: string[] = ACTIONS.filter(
    (token) => token !== VIEWPORT && text.includes(token),
  );
  if (viewportChanges(text)) found.push(VIEWPORT);
  return found;
};

const declaresRecorded = (text: string): boolean =>
  text.includes('test.use(recorded)');

describe('evidence recording is opt-in, and the opt-in is derived', () => {
  it('records nothing by default: the shared config value is the literal off', () => {
    // AC1. The literal is the safety property -- an environment variable here
    // is what made an evidence run record all ~2200 tests. Read from the
    // stripped source, so the comment above it explaining the old value
    // cannot satisfy the guard that replaced it.
    const config = withoutTsComments(readFileSync(CONFIG, 'utf8'));
    // The CONSTRUCT, not the bare string: `process.env.EVIDENCE_DIR` is used
    // legitimately by `outputDir`, so asserting its absence file-wide is red
    // on correct config. What matters is the value bound to `video:`.
    const bound = /video:\s*([^,\n]+)/.exec(config)?.[1]?.trim();
    expect(bound).toBe("'off'");
  });

  it('keeps video in one home: no spec spells it itself', () => {
    // AC5. A spec that writes `video: 'on'` inline opts itself in behind the
    // derivation guard's back, and nothing below would see it.
    const spelled = SPECS.filter((path) => sourceOf(path).includes('video:'));
    expect(
      searched(spelled, { of: SPECS, what: 'specs read for an inline video' }),
    ).toEqual([]);
    // The home really does hold it, so the assertion above is about a rule
    // being kept rather than about the string having vanished from the repo.
    expect(withoutTsComments(readFileSync(HOME, 'utf8'))).toContain('video:');
  });

  it('every spec that acts declares test.use(recorded)', () => {
    // AC4, first direction.
    const missing = SPECS.filter((path) => {
      const text = sourceOf(path);
      return actionsIn(text).length > 0 && !declaresRecorded(text);
    }).map((path) => `${path} acts (${actionsIn(sourceOf(path)).join(' ')})`);
    expect(
      searched(missing, { of: SPECS, what: 'specs checked for a declaration' }),
    ).toEqual([]);
  });

  it('no spec declares test.use(recorded) without acting', () => {
    // AC4, second direction. This is the half that keeps the 255-entry budget:
    // a spec that opts in and never moves spends recordings on stills.
    const idle = SPECS.filter((path) => {
      const text = sourceOf(path);
      return declaresRecorded(text) && actionsIn(text).length === 0;
    });
    expect(
      searched(idle, { of: SPECS, what: 'specs checked for an idle opt-in' }),
    ).toEqual([]);
  });

  it('every construct in the vocabulary is detectable', () => {
    // Anti-vacuity, done with FIXTURES rather than by demanding a real spec
    // use each token. A token no spec uses yet still states the policy for the
    // spec written next week, and deleting it to satisfy a control would
    // narrow the rule to today's code. What must not happen is a branch that
    // cannot match at all, so each is exercised directly.
    const undetected = ACTIONS.filter((token) =>
      token === VIEWPORT
        ? !actionsIn(
            `test('x', async () => { await page${token}a); await page${token}b); })`,
          ).includes(token)
        : !actionsIn(`await page${token}'x');`).includes(token),
    );
    expect(
      searched(undetected, { of: ACTIONS, what: 'action constructs' }),
    ).toEqual([]);
    // The negative control: silence means "no action", not "detector broken".
    expect(
      searched(actionsIn("await expect(page).toHaveTitle('Home');"), {
        of: ACTIONS,
        what: 'action constructs',
      }),
    ).toEqual([]);
    // And a single viewport set is NOT an action, which is the whole rule.
    expect(
      searched(
        actionsIn("test('x', async () => { await page.setViewportSize(a); })"),
        { of: ACTIONS, what: 'action constructs' },
      ),
    ).toEqual([]);
  });

  it('some specs really do act, and some really do not', () => {
    // The population control for the two direction guards above: if every
    // spec landed on one side, both would pass while asserting nothing.
    const acting = SPECS.filter((p) => actionsIn(sourceOf(p)).length > 0);
    const still = SPECS.filter((p) => actionsIn(sourceOf(p)).length === 0);
    expect({ acting: acting.length > 0, still: still.length > 0 }).toEqual({
      acting: true,
      still: true,
    });
  });
});
