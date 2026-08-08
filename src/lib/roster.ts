/**
 * The roster: pure arithmetic and comparison over `Student[]`.
 *
 * The roster ARRAY itself never lives here — it is one array in
 * `classroom-groups.ts`'s own module scope, never persisted, reached from
 * outside that file only through `getRoster`/`setRoster` (that file's own
 * doc comment explains why an accessor pair exists rather than an exported
 * `let`). This file is everything about a roster that is a fact of its
 * data, not a fact of the page: next-number assignment, the counts the
 * Student details header (`sectionState`, src/lib/sections.ts) reads, and
 * the one string that says whether two rosters would group differently.
 * Kept pure and here, per this repo's working agreement (CLAUDE.md: logic
 * is pure in src/lib and unit-tested; page scripts only wire the DOM), so
 * each rule is proven against its own inputs rather than sampled through
 * the DOM.
 */
import type { Student } from './grouping';

/**
 * Student details holds up to this many named rows — design spec section 4,
 * "Two size limits, not one". `MAX_STUDENTS` (grouping.ts, 500) is the
 * other limit: a bare count of anonymous students costs the page one
 * number, while a named row costs six form controls (number, name, sex,
 * absent, together, apart), so the two get different ceilings. 100 is
 * roughly twice the largest real class, so no teacher meets it by
 * accident.
 *
 * Nothing in this file enforces it — opening Student details above the
 * limit, and disabling the two add controls at it, are a later task's job
 * (design spec section 4 states three separate outcomes for exceeding it).
 * Exported now so every call site that eventually needs it imports this
 * one constant rather than each hard-coding `100` by hand.
 */
export const MAX_ROSTER = 100;

/**
 * One past the highest number in use — never the first free gap.
 *
 * A gap is usually the register number of a child who has left; filling it
 * would quietly hand their number to somebody else (design spec section 4,
 * "Numbers"). An absent student's number is still taken: absence marks
 * them out of THIS shuffle, not out of the register, so this reads every
 * student's number regardless of `absent`.
 */
export const nextNumber = (roster: Student[]): number =>
  roster.reduce((max, s) => Math.max(max, s.number), 0) + 1;

/**
 * The four counts the Student details header reads once a roster exists:
 * how many have a name, how many are marked absent, and how many carry
 * each kind of letter. `together` and `apart` are independent counts, not
 * a partition of the roster — a student can carry both letters at once
 * (see `Student`'s own doc comment in grouping.ts), so they can and do
 * overlap.
 *
 * An emptied name (`''`, typed and then deleted) reads as unnamed, the
 * same as one that was never set (`null`) — only a name with real
 * characters in it counts.
 */
export const rosterCounts = (roster: Student[]) => ({
  named: roster.filter((s) => s.name !== null && s.name !== '').length,
  absent: roster.filter((s) => s.absent).length,
  together: roster.filter((s) => s.together !== null).length,
  apart: roster.filter((s) => s.apart !== null).length,
});

/**
 * Everything about the roster that could change who ends up with whom,
 * folded into one string two calls can compare with `!==` — the same
 * "primitive, compared by value" contract every `Snapshot` field keeps
 * (see that interface's own doc comment in staleness.ts).
 *
 * The NAME IS DELIBERATELY ABSENT. Correcting a spelling moves nobody, so
 * it must not mark the groups out of date — and leaving the name out of
 * the comparison is what makes that true by construction, rather than by a
 * special case somebody has to remember.
 *
 * Sorted before joining, so the same roster listed in a different array
 * order — the table re-rendering, or a student removed and an equal one
 * re-added — still compares equal: nothing about any actual student
 * changed, so nothing here may read as though it did.
 */
export const serialiseForCompare = (roster: Student[]): string =>
  roster
    .map(
      (s) =>
        `${s.number}:${s.sex ?? ''}:${s.absent ? 1 : 0}:${s.together ?? ''}:${s.apart ?? ''}`,
    )
    .sort()
    .join('|');

/**
 * Which letters a together/apart `<select>` should offer — design spec
 * section 4: "chosen from a dropdown that grows as needed (A, then B once A
 * is used, and so on)." Always starts at `['A']`, even on an empty roster,
 * so there is a letter for the first student who gets one; grows to one
 * PAST whichever letter is currently the highest in use for `field`,
 * never past `Z` (26 is far more letters than any real class needs, and it
 * keeps the return value finite regardless of what a future import feeds
 * this).
 *
 * `together` and `apart` grow independently — a "together A" and an "apart
 * A" are unrelated domains (one is a unit, the other a mutual-separation
 * set), so `field` selects which of the two a given call is measuring.
 * `readonly` because this only ever reads the roster, the same contract
 * `getRoster()` (classroom-groups.ts) already returns.
 */
export const availableLetters = (
  roster: readonly Student[],
  field: 'together' | 'apart',
): string[] => {
  let highest = 0; // 0 = none in use yet; A=1, B=2, … Z=26
  for (const s of roster) {
    const letter = s[field];
    if (!letter) continue;
    const code = letter.toUpperCase().charCodeAt(0) - 64;
    if (code > highest) highest = code;
  }
  const count = Math.min(26, highest + 1);
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
};
