import { describe, it, expect } from 'vitest';
import { parseNumberSets, studentsForInput } from '../../src/lib/numberSets';
import { MAX_STUDENTS } from '../../src/lib/grouping';
import { student } from './factories';

// #188. A teacher types register numbers straight into three fields beside
// "Number of students" -- absent, keep-together, keep-apart -- and never
// opens Student details. This module is the TRANSLATOR that turns one
// field's text into sets of numbers; `buildGroups` is left untouched, so
// every grouping rule, error and warning the engine already owns applies
// unchanged (#188's "Why this is not already possible").
//
// Pure of the catalogue as well as the DOM (AC1: "a pure function of text
// plus the current count"): a refusal names the offending TEXT and the page
// renders the sentence, so this suite runs without a catalogue existing.
//
// "Comma joins a set, semicolon starts a new one" -- operator, 2026-09-16.

describe('parseNumberSets -- what a teacher types', () => {
  it('reads nothing from an empty field, and does not refuse it', () => {
    expect(parseNumberSets('', { count: 25, kind: 'absent' })).toEqual({
      sets: [],
      problem: null,
    });
  });

  it('reads a lone number as a set of one', () => {
    expect(parseNumberSets('7', { count: 25, kind: 'absent' })).toEqual({
      sets: [[7]],
      problem: null,
    });
  });

  it('joins numbers separated by a comma into ONE set', () => {
    expect(parseNumberSets('7,12', { count: 25, kind: 'absent' })).toEqual({
      sets: [[7, 12]],
      problem: null,
    });
  });

  it('starts a new set at a semicolon', () => {
    expect(
      parseNumberSets('3,9; 14,15', { count: 25, kind: 'pairing' }),
    ).toEqual({
      sets: [
        [3, 9],
        [14, 15],
      ],
      problem: null,
    });
  });

  // AC2. Typed in a hurry, between registration and the bell.
  it('tolerates surrounding space, spaces after separators, and a trailing separator', () => {
    expect(
      parseNumberSets('  3 , 9 ;  14 , 15 ;  ', { count: 25, kind: 'pairing' }),
    ).toEqual({
      sets: [
        [3, 9],
        [14, 15],
      ],
      problem: null,
    });
  });

  it('tolerates a trailing comma inside the last set', () => {
    expect(parseNumberSets('7, 12,', { count: 25, kind: 'absent' })).toEqual({
      sets: [[7, 12]],
      problem: null,
    });
  });

  // AC6. Whitespace alone is an empty field a teacher has tabbed through,
  // not a refusal to show them.
  it('reads nothing from a field holding only whitespace', () => {
    expect(parseNumberSets('   ', { count: 25, kind: 'absent' })).toEqual({
      sets: [],
      problem: null,
    });
  });

  // AC6. A pairing is not limited to two -- "keep these three together" is
  // the same rule, and the engine already places a whole together-block.
  it('reads a set of three or more', () => {
    expect(parseNumberSets('3,9,14', { count: 25, kind: 'pairing' })).toEqual({
      sets: [[3, 9, 14]],
      problem: null,
    });
  });
});

// AC3, AC4, AC5. Every refusal names the offending TEXT exactly as it was
// typed, so the page can put it in the sentence without re-deriving it --
// the same contract `Problem.students` keeps in roster.ts, one layer down.
//
// On a refusal the field contributes NOTHING: `sets` is empty. A half-read
// field is the worst of both, silently grouping on some of what was typed.
describe('parseNumberSets -- what it refuses', () => {
  const at25 = { count: 25, kind: 'absent' } as const;

  it('refuses text that is not a number, naming it', () => {
    expect(parseNumberSets('7, abc', at25)).toEqual({
      sets: [],
      problem: { kind: 'notAWholeNumber', text: 'abc' },
    });
  });

  it('refuses zero', () => {
    expect(parseNumberSets('0', at25)).toEqual({
      sets: [],
      problem: { kind: 'notAWholeNumber', text: '0' },
    });
  });

  it('refuses a negative number', () => {
    expect(parseNumberSets('-3', at25)).toEqual({
      sets: [],
      problem: { kind: 'notAWholeNumber', text: '-3' },
    });
  });

  it('refuses a decimal', () => {
    expect(parseNumberSets('2.5', at25)).toEqual({
      sets: [],
      problem: { kind: 'notAWholeNumber', text: '2.5' },
    });
  });

  // AC6, boundaries. 1 and N are the two ends of what a teacher may name.
  it('accepts 1 and the count itself', () => {
    expect(parseNumberSets('1, 25', at25)).toEqual({
      sets: [[1, 25]],
      problem: null,
    });
  });

  it('refuses a number above the current count, naming it', () => {
    expect(parseNumberSets('26', at25)).toEqual({
      sets: [],
      problem: { kind: 'aboveCount', text: '26' },
    });
  });

  // A separate code from `aboveCount` on purpose: the remedy differs. One
  // says "you typed 25 students", the other says the page cannot go above
  // MAX_STUDENTS at all. Reachable because `#cg-count` can be typed past
  // the ceiling -- the engine refuses THAT at Generate (`tooManyStudents`),
  // which is a different sentence again.
  it('accepts MAX_STUDENTS and refuses one above it', () => {
    const roomy = { count: MAX_STUDENTS + 50, kind: 'absent' } as const;
    expect(parseNumberSets(String(MAX_STUDENTS), roomy)).toEqual({
      sets: [[MAX_STUDENTS]],
      problem: null,
    });
    expect(parseNumberSets(String(MAX_STUDENTS + 1), roomy)).toEqual({
      sets: [],
      problem: { kind: 'aboveMaximum', text: String(MAX_STUDENTS + 1) },
    });
  });

  // AC4. The roster's own DUPLICATE rule refuses rather than silently
  // de-duplicating (roster.ts `rosterProblems`), and this mirrors it: a
  // number typed twice is a teacher losing their place, not a shorthand.
  it('refuses a number repeated inside one set, naming it', () => {
    expect(parseNumberSets('7, 7', at25)).toEqual({
      sets: [],
      problem: { kind: 'duplicate', text: '7' },
    });
  });

  it('refuses a number repeated across two sets of the same field', () => {
    expect(
      parseNumberSets('3,9; 9,14', { count: 25, kind: 'pairing' }),
    ).toEqual({
      sets: [],
      problem: { kind: 'duplicate', text: '9' },
    });
  });

  // AC5. Two halves of the same rule: a pairing of one says nothing, an
  // absence of one is the whole point of the field.
  it('refuses a pairing set holding a single number', () => {
    expect(parseNumberSets('3; 14,15', { count: 25, kind: 'pairing' })).toEqual(
      {
        sets: [],
        problem: { kind: 'lonelySet', text: '3' },
      },
    );
  });

  it('accepts a single absent number', () => {
    expect(parseNumberSets('3', at25)).toEqual({
      sets: [[3]],
      problem: null,
    });
  });

  // Deterministic and left-to-right: a teacher fixes the first thing wrong,
  // re-reads, and is told about the next -- never handed a list to triage.
  it('reports the FIRST offending text when a field holds several', () => {
    expect(parseNumberSets('abc, 99', at25)).toEqual({
      sets: [],
      problem: { kind: 'notAWholeNumber', text: 'abc' },
    });
  });

  // A unit is carried by a LETTER, and the roster caps those at Z
  // (`availableLetters`, roster.ts: "never past `Z`"). A 27th set has no
  // letter left, and reusing `A` would silently MERGE two units a teacher
  // meant to keep separate -- the engine would obey, the page would look
  // right, and the groups would be wrong. Refused instead, naming the set
  // that has nowhere to go.
  const pairsUpTo = (howMany: number): string =>
    Array.from({ length: howMany }, (_, i) => `${i * 2 + 1},${i * 2 + 2}`).join(
      '; ',
    );

  it('accepts 26 pairing sets -- one for every letter', () => {
    const parsed = parseNumberSets(pairsUpTo(26), {
      count: 60,
      kind: 'pairing',
    });
    expect(parsed.problem).toBeNull();
    expect(parsed.sets).toHaveLength(26);
  });

  it('refuses a 27th pairing set, naming the one with no letter left', () => {
    expect(
      parseNumberSets(pairsUpTo(27), { count: 60, kind: 'pairing' }),
    ).toEqual({
      sets: [],
      problem: { kind: 'tooManySets', text: '53,54' },
    });
  });
});

// The other half of the translator: parsed sets become the `Student[]` that
// `buildGroups` already understands. No grouping rule is written here -- the
// engine's `absent` filter, together-blocks and apart-sets do all the work,
// which is the whole reason #188 is a small ticket.
describe('studentsForInput -- typed numbers become a roster', () => {
  const noFields = { absent: [], together: [], apart: [] };

  // AC7. The default path must not change shape because a new feature
  // exists: with nothing typed, the engine still receives the bare count it
  // has always received, not a 25-long array of anonymous students.
  it('returns the bare count when all three fields are empty', () => {
    expect(studentsForInput(25, noFields)).toBe(25);
  });

  // AC8, AC9. Absence marks a pupil out of THIS shuffle, not out of the
  // register -- so number 7 still exists, still holds 7, and nobody is
  // renumbered to close the gap (`nextNumber`'s own reasoning, roster.ts).
  it('builds the whole class, marking only the absent ones', () => {
    const built = studentsForInput(25, { ...noFields, absent: [[7]] });
    expect(Array.isArray(built)).toBe(true);
    const students = built as ReturnType<typeof student>[];
    expect(students).toHaveLength(25);
    expect(students.map((s) => s.number)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
    expect(students.filter((s) => s.absent).map((s) => s.number)).toEqual([7]);
  });

  it('leaves every built student anonymous -- no name, no sex', () => {
    const built = studentsForInput(3, {
      ...noFields,
      absent: [[3]],
    }) as ReturnType<typeof student>[];
    expect(built).toEqual([
      student({ number: 1 }),
      student({ number: 2 }),
      student({ number: 3, absent: true }),
    ]);
  });

  it('gives each together set its own letter, in the order typed', () => {
    const built = studentsForInput(16, {
      ...noFields,
      together: [
        [3, 9],
        [14, 15],
      ],
    }) as ReturnType<typeof student>[];
    const letters = Object.fromEntries(
      built.map((s) => [s.number, s.together]),
    );
    expect(letters[3]).toBe('A');
    expect(letters[9]).toBe('A');
    expect(letters[14]).toBe('B');
    expect(letters[15]).toBe('B');
    expect(letters[1]).toBeNull();
  });

  // roster.ts:106 -- "a 'together A' and an 'apart A' are unrelated domains".
  // Both fields therefore start again at A, and a shared counter would be a
  // bug no assertion about one field alone could see.
  it('letters the two pairing fields independently, both starting at A', () => {
    const built = studentsForInput(6, {
      absent: [],
      together: [[1, 2]],
      apart: [[4, 5]],
    }) as ReturnType<typeof student>[];
    const byNumber = Object.fromEntries(built.map((s) => [s.number, s]));
    expect(byNumber[1].together).toBe('A');
    expect(byNumber[1].apart).toBeNull();
    expect(byNumber[4].apart).toBe('A');
    expect(byNumber[4].together).toBeNull();
  });

  // AC11's raw material: the same number in both fields carries both
  // letters, which is exactly the state the engine's `togetherApartClash`
  // already names. No new error code is invented for it.
  it('lets one number carry both a together and an apart letter', () => {
    const built = studentsForInput(6, {
      absent: [],
      together: [[1, 2]],
      apart: [[1, 3]],
    }) as ReturnType<typeof student>[];
    const first = built.find((s) => s.number === 1)!;
    expect(first.together).toBe('A');
    expect(first.apart).toBe('A');
  });
});
