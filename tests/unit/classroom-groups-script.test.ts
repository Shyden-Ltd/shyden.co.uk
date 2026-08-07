import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * A forcing function for stage 3, not a test of behaviour (F-2, review).
 *
 * classroom-groups.ts reads `sexMode` through ONE function, `readSexMode`,
 * hard-coded to `'off'` -- because there is no roster on this page yet. The
 * two sex switches render (Stage 2, Task 4) but can never actually be
 * checked: sexWhy's "no list at all" branch keeps them permanently disabled
 * (src/lib/sexOptions.ts). Stage 2's own e2e coverage for the spillover
 * warning is therefore `test.fixme` (tests/e2e/classroom-groups-controls.spec.ts)
 * rather than a real test -- there is no fixture reachable from this page
 * today that could ever drive `sexMode` to `'separate'` with a mixed
 * roster, so a real assertion would have nothing to exercise.
 *
 * `readSexMode` did not exist when this test was first written -- submit
 * used to carry its own inline `sexMode: 'off'` literal, and
 * `updateGroupingHeader` carried a SECOND, independent one of its own (the
 * comment on the old version of this test named that second literal
 * explicitly, so a bare search would not accidentally pin the wrong one).
 * Stage 2, Task 6 (staleness) unified both into this one function, because
 * a staleness snapshot needs the exact same live value submit uses, and two
 * places hard-coding the same fact by hand is how they drift -- see that
 * task's own report for the reasoning. There is now only one place to pin.
 *
 * `test.fixme` does NOT fail the day it starts passing -- Playwright's own
 * docs are explicit that a declared fixme test simply is not run at all
 * (see that test's own comment, which corrects an earlier, wrong assumption
 * to the contrary). So nothing else in the suite turns red the moment
 * stage 3 wires the switches to a live roster. This does: the instant
 * `readSexMode` stops returning the hard-coded literal matched below,
 * stage 3 has made the switches real, which is exactly when the spillover
 * warning becomes renderable, the fixme test is owed either a real body or
 * removal, and staleReason's own `staleSexMode` branch
 * (src/lib/staleness.ts) becomes reachable from the live page for the first
 * time. Whoever makes that change is forced to look at this file too,
 * rather than the debt sitting green forever.
 *
 * A slice over the built source, not an import: there is nothing to
 * import. `readSexMode` is a local function inside the module, not an
 * exported value -- scanning the source text is the only way to pin a fact
 * about code SHAPE rather than runtime behaviour, the same reasoning
 * dead-copy.test.ts already applies to locale copy in this repo. `slice`
 * rather than a regex over the whole file: a regex anchored on surrounding
 * whitespace/formatting is exactly the kind of pin that reformatting can
 * silently break (see this repo's own lesson on that); isolating the one
 * declaration line first and asserting on ITS text is unaffected by
 * anything before or after it.
 */
describe('classroom-groups.ts — sexMode is still hard-coded (stage 3 owes this)', () => {
  it("readSexMode() still returns the hard-coded 'off', because no roster exists yet", () => {
    const source = readFileSync('src/scripts/classroom-groups.ts', 'utf8');
    const start = source.indexOf('const readSexMode');
    // A confusing failure ("expected '' to contain...") if `readSexMode`
    // itself has been renamed or removed is not the same signal as this
    // test's own claim going false -- this line is what tells the two
    // apart.
    expect(start).toBeGreaterThan(-1);
    const declaration = source.slice(start, source.indexOf('\n', start));
    expect(declaration).toContain("=> 'off'");
  });
});

/**
 * A second forcing function, alongside the one above, for the OTHER field
 * Stage 2 leaves deliberately unfinished (F-2, review).
 *
 * `snapshot()` (classroom-groups.ts) is what `updateStaleness` compares
 * against on every form input -- see src/lib/staleness.ts's own `Snapshot`
 * doc comment. Its `roster` field is hard-coded to `''` because no roster
 * exists on this page yet; comparing `'' !== ''` can never be true, so
 * `staleReason`'s own `staleRoster` branch is real code with no way to
 * reach it today. That is deliberate, not an oversight -- but a marker that
 * cannot fail is not a promise, so this pins the placeholder directly
 * rather than only leaving a comment beside it. The day `roster` carries a
 * real value is the day "a student was edited" becomes a genuine trigger on
 * this SAME machine, which is the whole point of Snapshot being a
 * comparison rather than a second, parallel mechanism -- see that
 * interface's own doc comment.
 */
describe('classroom-groups.ts — the staleness snapshot still hard-codes an empty roster (stage 3 owes this)', () => {
  it("snapshot()'s roster field is still the honest placeholder '', because no roster exists yet", () => {
    const source = readFileSync('src/scripts/classroom-groups.ts', 'utf8');
    const start = source.indexOf('const snapshot = ()');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('});', start);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    expect(body).toContain("roster: ''");
  });
});
