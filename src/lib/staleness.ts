import type { Leftovers, SexMode } from './grouping';
import type { Strings } from './i18n';

/**
 * What the groups on screen were made from.
 *
 * Staleness is a COMPARISON, not a flag. A flag has to be cleared by every
 * code path that could undo the change, and the one that forgets is the
 * bug -- "the teacher put the size back to 4" would leave a badge saying
 * the groups are wrong when they are not (see classroom-groups.spec.ts's
 * own "undoing the change clears it" test, which exists to prove exactly
 * that). A comparison against a snapshot taken at shuffle time needs no
 * clearing at all: it is simply re-evaluated, every time, against whatever
 * the form says right now.
 *
 * One field per control that can invalidate a shuffle. `mode` folds the
 * mode radio (per-group / group count) AND its own number together into
 * one JSON string rather than two separate fields -- see `staleReason`'s
 * own doc comment for why that has to be a single comparison, not two.
 * `roster` is reserved for stage 3: this module never looks inside it, so
 * the day a real roster exists, giving it a real value here is the WHOLE
 * change needed to add "a student was edited" as a trigger -- not a second
 * machine alongside this one. See classroom-groups.ts's own `snapshot()`,
 * which hard-codes it to `''` today with its own comment on why that is
 * honest, not a placeholder pretending to be finished.
 */
export interface Snapshot {
  mode: string;
  leftovers: Leftovers;
  sexMode: SexMode;
  roster: string;
}

/**
 * Why the groups on screen no longer match what the form says now -- or
 * `null` if nothing that matters has changed.
 *
 * Checked in a fixed order and returns the FIRST mismatch, not every one:
 * design spec section 8 asks for a notice naming what changed, and one
 * clear sentence serves a teacher better than a list they have to read in
 * full before acting. That is not a one-shot decision, because the caller
 * recomputes this on every input -- so undoing the highest-priority
 * mismatch does not clear the notice by itself, it just means the very
 * next recompute reports whichever mismatch is still live (or `null`, if
 * none is). See classroom-groups.spec.ts's own "when two things change,
 * undoing one still names the other" test, which a one-shot "first cause
 * wins forever" implementation would fail.
 */
export function staleReason(
  then: Snapshot,
  now: Snapshot,
  t: Strings,
): string | null {
  if (then.mode !== now.mode) return t.staleMode;
  if (then.leftovers !== now.leftovers) return t.staleLeftovers;
  if (then.sexMode !== now.sexMode) return t.staleSexMode;
  if (then.roster !== now.roster) return t.staleRoster;
  return null;
}
