import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * A forcing function for stage 3, not a test of behaviour (F-2, review).
 *
 * classroom-groups.ts hard-codes `sexMode: 'off'` at submit -- see that
 * file's own comment on the literal -- because there is no roster on this
 * page yet. The two sex switches render (Stage 2, Task 4) but can never
 * actually be checked: sexWhy's "no list at all" branch keeps them
 * permanently disabled (src/lib/sexOptions.ts). Stage 2's own e2e coverage
 * for the spillover warning is therefore `test.fixme`
 * (tests/e2e/classroom-groups-controls.spec.ts) rather than a real test --
 * there is no fixture reachable from this page today that could ever drive
 * `sexMode` to `'separate'` with a mixed roster, so a real assertion would
 * have nothing to exercise.
 *
 * `test.fixme` does NOT fail the day it starts passing -- Playwright's own
 * docs are explicit that a declared fixme test simply is not run at all
 * (see that test's own comment, which corrects an earlier, wrong assumption
 * to the contrary). So nothing else in the suite turns red the moment
 * stage 3 wires the switches to a live roster. This does: the instant
 * `sexMode: 'off'` stops being the hard-coded literal matched below,
 * stage 3 has made the switches real, which is exactly when the spillover
 * warning becomes renderable and the fixme test is owed either a real body
 * or removal in favour of a stage-3 replacement that already exercises it
 * (see the stage-3 plan's own Task 9). Whoever makes that change is forced
 * to look at this file too, rather than the debt sitting green forever.
 *
 * A regex over the built source, not an import: there is nothing to
 * import. `sexMode` is a local object literal inside the submit handler,
 * not an exported value -- scanning the source text is the only way to pin
 * a fact about code SHAPE rather than runtime behaviour, the same
 * reasoning dead-copy.test.ts already applies to locale copy in this repo.
 *
 * Anchored on adjacency to `pinned: []`, not a bare `sexMode: 'off'`
 * search: `updateGroupingHeader`'s own default state (read live off the
 * leftovers radio, further up the same file) ALSO spells `sexMode: 'off'`
 * and is not what this pins -- that one only ever feeds the header text.
 * Only the literal fed to `buildGroups` at submit controls whether the
 * engine could ever actually run in separate mode, which is the one that
 * must go red the day stage 3 makes it live.
 */
describe('classroom-groups.ts — sexMode is still hard-coded (stage 3 owes this)', () => {
  it("submits sexMode: 'off' unconditionally, because no roster exists yet", () => {
    const source = readFileSync('src/scripts/classroom-groups.ts', 'utf8');
    expect(source).toMatch(/sexMode:\s*'off',\s*\n\s*pinned:\s*\[\]/);
  });
});
