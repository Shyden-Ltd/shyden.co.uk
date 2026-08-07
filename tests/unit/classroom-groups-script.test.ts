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

// A forcing-function test for `snapshot()`'s `roster` field used to sit
// here, pinning it to the hard-coded placeholder `''` that `staleRoster`
// could never actually reach (F-2, review). Task 6's fix (C-1) removed the
// placeholder: `roster` now reads `#cg-count` through `readRoster`, the
// page's only population control this stage, so "the class list changed"
// is a real, reachable trigger today -- see Snapshot's own doc comment
// (src/lib/staleness.ts) and classroom-groups.ts's own `readRoster`. The
// forcing function did its job (it is what put this fix in front of
// someone), so it is retired rather than left pinning a claim that is now
// false. Behavioural coverage for the live trigger lives in
// tests/e2e/classroom-groups.spec.ts's "out-of-date groups" describe block
// ("changing the number of students marks them out of date..." and
// "undoing the count change clears it"), the same place group-size and
// leftovers are covered -- `readRoster` is DOM-wiring with no unit-test
// seam of its own, same reasoning as `readMode`/`readLeftovers` above it.
