import type { Student } from './grouping';
import type { Strings } from './i18n';

/**
 * Why the two sex switches (#cg-sex-mix, #cg-sex-separate) are disabled --
 * or `null` when they are not.
 *
 * Design spec section 6: "Both are DISABLED unless every student BEING
 * GROUPED has M or F." The qualifier is load-bearing. An absent student
 * with no sex set must not hold the switches shut, because they are not
 * being placed into anything today -- measuring the WHOLE roster instead
 * would produce "the worst kind of block" (the section's own words): every
 * group on screen has a sex, nothing looks wrong, and the one student
 * preventing the switches from ever turning on is not even in the room.
 * `grouped` below is filtered to `!absent` for exactly that reason, before
 * `unset` is ever computed from it.
 *
 * Returns `null` for "enabled" rather than an empty string, deliberately:
 * `if (why)` then reads correctly at every call site, and an empty string
 * that means "fine" is exactly the stringly-typed signal that gets tested
 * as truthy by accident.
 *
 * `roster === null` and `roster.length === 0` collapse to the SAME message
 * (`sexWhyNoList`) rather than two -- an empty list and no list are the
 * same fact here (nobody has a sex either way), matching how design spec
 * section 4's "Students box" already treats emptying the list as returning
 * to the no-list state, not a third state of its own.
 *
 * `grouped.length === 0` -- a roster exists but every student on it is
 * absent -- is NOT special-cased, and falls through to `unset.length ===
 * 0` -> enabled. That is the vacuous case, not a bug: "every student being
 * grouped has M or F" is true of an empty set of students being grouped,
 * the same way `[].every(...)` is `true` in JS. Toggling the switches here
 * is harmless (there is nobody to place), and pressing Make Groups already
 * reports `NO_STUDENTS` regardless of `sexMode` -- see grouping.ts's
 * `ERROR_CODES.noStudents` doc comment on the second of its two triggers.
 *
 * OWED (test traceability matrix, G-07): design spec section 6 and section
 * 13 both call for a THIRD, name-specific message -- "Dewi is back and has
 * no sex set...", distinct from `sexWhyUnset`'s count -- for the moment
 * un-ticking one student's absence is specifically what CLOSES these
 * switches (0 unset -> 1). Deciding when that applies needs the transition
 * itself (was THIS toggle what took `unset` from 0 to 1?), which a roster
 * snapshot cannot recover after the fact -- the caller would have to know
 * which control just fired and pass that in. There is no such caller
 * today: Student details' absence control (stage 3) does not exist on the
 * page yet (see ClassroomGroupsPage.astro's own comment on
 * `#cg-students-body`). Building that parameter now would be guessing at a
 * shape the real caller may not need until it exists. Whichever task wires
 * that control owns adding the locale key and threading the transition it
 * names.
 */
export const sexWhy = (roster: Student[] | null, t: Strings): string | null => {
  if (roster === null || roster.length === 0) return t.sexWhyNoList;
  const grouped = roster.filter((s) => !s.absent);
  const unset = grouped.filter((s) => s.sex === null);
  if (unset.length === 0) return null;
  return t.sexWhyUnset(unset.length, grouped.length);
};
