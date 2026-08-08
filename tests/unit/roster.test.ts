import { describe, it, expect } from 'vitest';
import {
  MAX_ROSTER,
  nextNumber,
  rosterCounts,
  serialiseForCompare,
} from '../../src/lib/roster';
import * as roster from '../../src/lib/roster';
import { student } from './factories';

// Mirrors grouping.test.ts's own "the module surface" test (F-2 there):
// pins exactly what this module exports, so an addition or a removal has
// to change this list deliberately rather than slide through unnoticed. A
// new entry belongs here only once something outside this file actually
// calls it.
describe('the module surface', () => {
  it('exports nothing that nothing uses', () => {
    expect(Object.keys(roster).sort()).toEqual([
      'MAX_ROSTER',
      'nextNumber',
      'rosterCounts',
      'serialiseForCompare',
    ]);
  });
});

// Design spec section 4, "Two size limits, not one": Student details holds
// up to 100 -- twice the largest real class, so no teacher meets it by
// accident. MAX_STUDENTS (grouping.ts, 500) is the other limit and is
// pinned in its own file; this one belongs here because Student details is
// what it governs. Nothing in this task enforces it yet (opening the
// section above the limit, and the two add controls, are a later task's
// job) -- exported now so every later call site imports the same number
// rather than each hard-coding 100 by hand.
describe('MAX_ROSTER', () => {
  it('is 100', () => {
    expect(MAX_ROSTER).toBe(100);
  });
});

describe('nextNumber', () => {
  it('starts at 1', () => expect(nextNumber([])).toBe(1));

  it('takes one past the highest, not the first free gap', () => {
    // A gap is usually the number of a child who has left. Filling it would
    // quietly hand their number to somebody else.
    const roster = [1, 2, 3, 5].map((n) => student({ number: n }));
    expect(nextNumber(roster)).toBe(6);
  });

  it('is not fooled by an unsorted roster', () => {
    expect(nextNumber([5, 1, 3].map((n) => student({ number: n })))).toBe(6);
  });

  it('counts absent students — their number is still taken', () => {
    expect(nextNumber([student({ number: 9, absent: true })])).toBe(10);
  });
});

describe('rosterCounts', () => {
  it('counts names, absences and each letter kind', () => {
    expect(
      rosterCounts([
        student({ number: 1, name: 'Ana', together: 'A' }),
        student({ number: 2, name: 'Budi', together: 'A' }),
        student({ number: 3, absent: true, apart: 'X' }),
        student({ number: 4 }),
      ]),
    ).toEqual({ named: 2, absent: 1, together: 2, apart: 1 });
  });

  it('counts a student carrying both letters under both', () => {
    expect(
      rosterCounts([student({ number: 1, together: 'A', apart: 'X' })]),
    ).toMatchObject({ together: 1, apart: 1 });
  });

  it('is all zero for an empty roster', () => {
    // The `▸ Student details · none added` branch (sections.ts) is chosen
    // on `rosterSize === 0` before it ever looks at these four counts, but
    // this pins that an empty INPUT to rosterCounts itself is inert rather
    // than, say, throwing or returning NaN from a reduce with no seed.
    expect(rosterCounts([])).toEqual({
      named: 0,
      absent: 0,
      together: 0,
      apart: 0,
    });
  });

  // A name typed and then fully deleted is `''`, not `null` -- the table
  // (a later task) clears an input to an empty string, it does not delete
  // the field. Only `null` (never opened, never typed in) should read as
  // unnamed; a mutant that dropped the `!== ''` half of the guard and kept
  // only `!== null` would still pass every test above (none of them ever
  // gives a student an empty-string name) but would count this student as
  // named.
  it('does not count an emptied name as named', () => {
    expect(rosterCounts([student({ number: 1, name: '' })]).named).toBe(0);
  });
});

describe('serialiseForCompare', () => {
  it('changes when a student is marked absent', () => {
    const a = [student({ number: 1 })];
    const b = [student({ number: 1, absent: true })];
    expect(serialiseForCompare(a)).not.toBe(serialiseForCompare(b));
  });

  it('does NOT change when only a name changes', () => {
    // A rename moves nobody, so it must not mark the groups out of date.
    const a = [student({ number: 1, name: 'Ana' })];
    const b = [student({ number: 1, name: 'Anna' })];
    expect(serialiseForCompare(a)).toBe(serialiseForCompare(b));
  });

  it('changes when a letter changes', () => {
    expect(serialiseForCompare([student({ number: 1 })])).not.toBe(
      serialiseForCompare([student({ number: 1, together: 'A' })]),
    );
  });

  // The brief's own test above only ever exercises `together`. A mutant
  // that dropped `apart` from the template string entirely would still
  // pass it -- this is the one that would catch it.
  it('changes when the apart letter changes, independently of together', () => {
    expect(serialiseForCompare([student({ number: 1 })])).not.toBe(
      serialiseForCompare([student({ number: 1, apart: 'X' })]),
    );
  });

  it('changes when a sex changes', () => {
    expect(serialiseForCompare([student({ number: 1 })])).not.toBe(
      serialiseForCompare([student({ number: 1, sex: 'M' })]),
    );
  });

  // Every field this function reads is joined into ONE string per student
  // with `:` -- a naive template could let two different rosters collide
  // on the same string (e.g. a number of 1 and a sex of "M2" vs a number of
  // 12 and no sex). Not a realistic input (numbers are whole, sex is a
  // fixed domain), but this pins that the two given here, which COULD
  // collide under a careless separator choice, do not.
  it('does not collide two different rosters onto the same string', () => {
    const a = [student({ number: 1, together: 'AB' })];
    const b = [student({ number: 1, together: 'A' }), student({ number: 2 })];
    // Not a claim these two happen to differ for any particular reason --
    // just that distinct rosters produce distinct strings.
    expect(serialiseForCompare(a)).not.toBe(serialiseForCompare(b));
  });

  // Sorted before joining (the implementation's own choice): the roster
  // re-rendering in a new order, or a student removed and an equal one
  // re-added, must not read as a change when nothing about any student
  // did. Without the sort, this would fail because the two arrays join in
  // their given order rather than a canonical one.
  it('does not change when the same students are listed in a different order', () => {
    const a = [
      student({ number: 1, name: 'Ana' }),
      student({ number: 2, absent: true }),
    ];
    const b = [
      student({ number: 2, absent: true }),
      student({ number: 1, name: 'Ana' }),
    ];
    expect(serialiseForCompare(a)).toBe(serialiseForCompare(b));
  });

  it('changes when a student is added', () => {
    const a = [student({ number: 1 })];
    const b = [student({ number: 1 }), student({ number: 2 })];
    expect(serialiseForCompare(a)).not.toBe(serialiseForCompare(b));
  });
});
