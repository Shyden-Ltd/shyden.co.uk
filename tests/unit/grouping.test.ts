import { describe, it, expect } from 'vitest';
import {
  buildGroups,
  ERROR_CODES,
  WARNING_CODES,
  MAX_STUDENTS,
  type GroupingInput,
  type Mode,
  type Student,
} from '../../src/lib/grouping';
import * as grouping from '../../src/lib/grouping';
import { student, shape, groupOf, seeded } from './factories';
// Fix round 1, F-2: closing the reviewer's named gap -- nothing in this
// file, before this fix, ever piped a `separate`-mode failure through
// `renderError`, so a structurally-correct error code with a wrong-number
// or badly-worded sentence would have passed every test in this file.
import { renderError } from '../../src/lib/i18n';
import { en } from '../../src/lib/i18n/en';
import { id } from '../../src/lib/i18n/id';

const base = (over: Partial<GroupingInput> = {}): GroupingInput => ({
  students: 22,
  mode: { kind: 'perGroup', size: 4 },
  leftovers: 'spread',
  sexMode: 'off',
  pinned: [],
  random: seeded(1),
  ...over,
});

const ok = (input: GroupingInput) => {
  const out = buildGroups(input);
  if (!out.ok) throw new Error(`expected success, got ${out.error.code}`);
  return out.result;
};

describe('buildGroups — the worked examples from the design spec', () => {
  it.each([
    // students, mode,                          leftovers, expected shape
    [
      22,
      { kind: 'perGroup', size: 4 } as const,
      'spread' as const,
      [5, 5, 4, 4, 4],
    ],
    [
      22,
      { kind: 'perGroup', size: 4 } as const,
      'bunch' as const,
      [6, 4, 4, 4, 4],
    ],
    [
      22,
      { kind: 'groupCount', count: 5 } as const,
      'spread' as const,
      [5, 5, 4, 4, 4],
    ],
  ])('%i students, %o, %s leftovers', (students, mode, leftovers, expected) => {
    expect(shape(ok(base({ students, mode, leftovers })).groups)).toEqual(
      expected,
    );
  });

  it('7 students in groups of 4 makes ONE group of 7, not a group of 3', () => {
    // The rule the operator stated: never fewer than the specified size.
    // Splitting into 4+3 would break it, so the correct answer is a single
    // group that is too big rather than two where one is too small.
    expect(shape(ok(base({ students: 7 })).groups)).toEqual([7]);
  });

  it('fewer students than one full group still produces one group', () => {
    expect(shape(ok(base({ students: 3 })).groups)).toEqual([3]);
  });
});

describe('buildGroups — invariants that must hold for ANY input', () => {
  const sizes = [1, 2, 3, 5, 7, 12, 13, 22, 29, 30, 40];
  const perGroup = [2, 3, 4, 5, 6];

  it.each(sizes.flatMap((s) => perGroup.map((g) => [s, g] as const)))(
    '%i students / %i per group: nobody lost, nobody invented, no group below the minimum',
    (students, size) => {
      for (const leftovers of ['spread', 'bunch'] as const) {
        const { groups } = ok(
          base({
            students,
            mode: { kind: 'perGroup', size },
            leftovers,
            random: seeded(students * 31 + size),
          }),
        );

        const numbers = groups.flat().map((s) => s.number);
        expect(new Set(numbers).size).toBe(students); // nobody duplicated
        expect(numbers).toHaveLength(students); // nobody lost or invented

        // The minimum applies unless there simply are not enough students for
        // even one full group, in which case a single short group is correct.
        if (students >= size) {
          for (const g of groups) expect(g.length).toBeGreaterThanOrEqual(size);
        } else {
          expect(groups).toHaveLength(1);
        }
      }
    },
  );

  it('spreading leftovers never leaves two groups differing by more than one', () => {
    for (let students = 5; students <= 40; students++) {
      const { groups } = ok(
        base({
          students,
          mode: { kind: 'perGroup', size: 4 },
          leftovers: 'spread',
          random: seeded(students),
        }),
      );
      const s = shape(groups);
      // Only meaningful when more than one group exists.
      if (s.length > 1) expect(s[0] - s[s.length - 1]).toBeLessThanOrEqual(1);
    }
  });

  it('bunching puts every leftover in ONE group, so exactly one group is oversized', () => {
    const { groups } = ok(
      base({
        students: 23,
        mode: { kind: 'perGroup', size: 4 },
        leftovers: 'bunch',
      }),
    );
    const s = shape(groups); // 23 = 5 groups of 4, 3 spare -> 7,4,4,4,4
    expect(s).toEqual([7, 4, 4, 4, 4]);
    expect(s.filter((n) => n > 4)).toHaveLength(1);
  });
});

describe('buildGroups — students with and without names', () => {
  it('a bare count produces numbered students with no name', () => {
    const { groups } = ok(
      base({ students: 5, mode: { kind: 'perGroup', size: 2 } }),
    );
    const all = groups.flat();
    expect(all.map((s) => s.name)).toEqual([null, null, null, null, null]);
    // Numbered 1..n so the UI can render "Student 7" — the DEFAULT mode, not
    // a fallback, so it is asserted rather than assumed.
    expect(all.map((s) => s.number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('a bare count produces a fully-defaulted record, matching the factory field-for-field', () => {
    // anonymous() here and student() in factories.ts are two independent
    // definitions of "a student with nothing set". A per-field assertion
    // only guards fields both sides remember to check; a whole-object
    // comparison also catches a field added to (or dropped from) one side
    // and not the other, which per-field checks cannot. Fix round 1, F-2.
    const { groups } = ok(
      base({ students: 1, mode: { kind: 'perGroup', size: 1 } }),
    );
    expect(groups.flat()[0]).toEqual(student({ number: 1 }));
  });

  it('keeps every student, including two who share a name, because identity is the number', () => {
    // Was 'a name list keeps every name, including genuine duplicates',
    // written against `students: string[]`. That input mode is gone --
    // records are taken as given rather than parsed from a name list -- so
    // the duplicate is now expressed the only way that still exists: two
    // records, two different numbers, one shared name. Silently merging them
    // would be a worse failure than it ever was, because it would now also
    // have to throw away one of two distinct identities, not just a string.
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, name: 'Ana' }),
          student({ number: 2, name: 'Budi' }),
          student({ number: 3, name: 'Ana' }),
          student({ number: 4, name: 'Citra' }),
        ],
        mode: { kind: 'perGroup', size: 2 },
      }),
    );
    if (!out.ok) throw new Error(`expected success, got ${out.error.code}`);
    const { groups } = out.result;
    expect(
      groups
        .flat()
        .map((s) => s.name)
        .sort(),
    ).toEqual(['Ana', 'Ana', 'Budi', 'Citra']);
    // Both Anas kept their own number rather than one being dropped or the
    // two being collapsed into one.
    expect(groupOf(groups, 1)?.find((s) => s.number === 1)?.name).toBe('Ana');
    expect(groupOf(groups, 3)?.find((s) => s.number === 3)?.name).toBe('Ana');
  });
});

describe('students are records identified by a number', () => {
  it("keeps the teacher's numbers rather than renumbering from 1", () => {
    const out = buildGroups(
      base({
        students: [
          student({ number: 4, name: 'Dewi' }),
          student({ number: 9, name: 'Gita' }),
        ],
        mode: { kind: 'groupCount', count: 1 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(
      out.result.groups[0].map((s) => s.number).sort((a, b) => a - b),
    ).toEqual([4, 9]);
  });

  it('accepts gaps in the numbers', () => {
    const out = buildGroups(
      base({
        students: [1, 2, 3, 5, 8].map((n) => student({ number: n })),
        mode: { kind: 'groupCount', count: 1 },
      }),
    );
    expect(out.ok).toBe(true);
  });

  it('refuses two students sharing a number, naming it', () => {
    const out = buildGroups(
      base({
        students: [
          student({ number: 5, name: 'Eko' }),
          student({ number: 5, name: 'Ana' }),
        ],
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({ code: ERROR_CODES.duplicateNumber, number: 5 });
  });

  it('still takes a bare count, and numbers those 1..N', () => {
    const out = buildGroups(
      base({ students: 3, mode: { kind: 'groupCount', count: 1 } }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // A bare .sort() sorts lexicographically -- correct here only by luck,
    // because every number involved is a single digit. Fix round 1, F-5.
    expect(
      out.result.groups[0].map((s) => s.number).sort((a, b) => a - b),
    ).toEqual([1, 2, 3]);
    expect(out.result.groups[0].every((s) => s.name === null)).toBe(true);
  });

  it('counts a record list before building it, so 501 records is refused', () => {
    const many = Array.from({ length: MAX_STUDENTS + 1 }, (_, i) =>
      student({ number: i + 1 }),
    );
    const out = buildGroups(base({ students: many }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.tooManyStudents,
      maxStudents: MAX_STUDENTS,
    });
  });
});

describe('absence', () => {
  const roster = [
    student({ number: 1, name: 'Ana' }),
    student({ number: 2, name: 'Budi' }),
    student({ number: 3, name: 'Citra', absent: true }),
    student({ number: 4, name: 'Dewi' }),
  ];

  it('leaves an absent student out of the results entirely', () => {
    const out = buildGroups(
      base({ students: roster, mode: { kind: 'groupCount', count: 2 } }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const numbers = out.result.groups.flat().map((s) => s.number);
    expect(numbers).not.toContain(3);
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 2, 4]);
  });

  it('sizes the groups from those present, not from the roster', () => {
    // 4 on the roster, 3 present, groups of 3 -> one group of 3, not of 4.
    const out = buildGroups(
      base({ students: roster, mode: { kind: 'perGroup', size: 3 } }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(shape(out.result.groups)).toEqual([3]);
  });

  it('refuses when everybody is absent, as if there were no students', () => {
    const out = buildGroups(
      base({
        students: roster.map((s) => ({ ...s, absent: true })),
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({ code: ERROR_CODES.noStudents });
  });

  it('counts absent students against MAX_STUDENTS, because the roster is built first', () => {
    // The cap exists to stop a mis-keyed number allocating until the tab dies.
    // That allocation happens before anyone is filtered, so the guard must too.
    const many = Array.from({ length: MAX_STUDENTS + 1 }, (_, i) =>
      student({ number: i + 1, absent: true }),
    );
    const out = buildGroups(base({ students: many }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.tooManyStudents);
  });

  it('refuses too many groups using the number PRESENT, not the roster size', () => {
    // 4 on the roster, 3 present. Asking for 4 groups from 3 must be refused,
    // and the count offered back must be 3 -- present.length, not the 4 on
    // the roster. A silent revert to students.length here would read
    // `4 > 4` as false, let the guard pass, and hand the teacher a group of
    // size 0. Fix round 1, F-1.
    const out = buildGroups(
      base({ students: roster, mode: { kind: 'groupCount', count: 4 } }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.tooManyGroups,
      maxGroups: 3,
    });
  });

  it('still refuses a duplicate number when the duplicate is the absent row', () => {
    // The duplicate-number loop runs over the whole roster, before absence is
    // applied, precisely so a duplicate in a row marked absent today is still
    // caught -- the teacher unticks that row tomorrow (see the comment above
    // `present` in grouping.ts). Fix round 1, F-2.
    const out = buildGroups(
      base({
        students: [
          student({ number: 7, name: 'Eko' }),
          student({ number: 7, name: 'Fitri', absent: true }),
        ],
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.duplicateNumber,
      number: 7,
    });
  });
});

describe('buildGroups — refusals', () => {
  it.each([
    ['no students at all', base({ students: 0 }), ERROR_CODES.noStudents],
    ['an empty student list', base({ students: [] }), ERROR_CODES.noStudents],
    [
      'a group size below 1',
      base({ mode: { kind: 'perGroup', size: 0 } }),
      ERROR_CODES.invalidGroupSize,
    ],
    [
      'a group count below 1',
      base({ mode: { kind: 'groupCount', count: 0 } }),
      ERROR_CODES.invalidGroupCount,
    ],
    [
      'more groups than students',
      base({ students: 4, mode: { kind: 'groupCount', count: 9 } }),
      ERROR_CODES.tooManyGroups,
    ],
  ])('refuses %s', (_label, input, code) => {
    const out = buildGroups(input);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe(code);
  });

  it('says how many groups were actually possible when too many were asked for', () => {
    const out = buildGroups(
      base({ students: 4, mode: { kind: 'groupCount', count: 9 } }),
    );
    if (out.ok) throw new Error('expected refusal');
    expect(out.error.maxGroups).toBe(4);
  });
});

describe('buildGroups — no input may hang or crash the browser tab', () => {
  it('refuses a class bigger than it will attempt, and says what the limit is', () => {
    // The tab-killer: Array.from({ length: 1e8 }) before any guard runs.
    const out = buildGroups(base({ students: 100_000_000 }));
    if (out.ok) throw new Error('expected refusal');
    expect(out.error.code).toBe(ERROR_CODES.tooManyStudents);
    expect(out.error.maxStudents).toBe(MAX_STUDENTS);
  });

  it('accepts a class of exactly the limit — the cap is a ceiling, not a fence', () => {
    const result = ok(base({ students: MAX_STUDENTS }));
    expect(result.groups.flat()).toHaveLength(MAX_STUDENTS);
  });

  it('reads an infinite count as too many, not as an empty class', () => {
    // "Not a finite number" is true of Infinity and of NaN, but they mean
    // opposite things to the teacher who typed them.
    const out = buildGroups(base({ students: Number.POSITIVE_INFINITY }));
    if (out.ok) throw new Error('expected refusal');
    expect(out.error.code).toBe(ERROR_CODES.tooManyStudents);
  });

  it('reads a nonsense count as an empty class', () => {
    const out = buildGroups(base({ students: Number.NaN }));
    if (out.ok) throw new Error('expected refusal');
    expect(out.error.code).toBe(ERROR_CODES.noStudents);
  });
});

describe('buildGroups — the edges of a class size', () => {
  it('floors a fractional count rather than inventing a part-student', () => {
    expect(
      ok(
        base({ students: 2.7, mode: { kind: 'perGroup', size: 1 } }),
      ).groups.flat(),
    ).toHaveLength(2);
  });

  it.each([[-1], [0], [-0.5]])('refuses a count of %i', (students) => {
    const out = buildGroups(base({ students }));
    if (out.ok) throw new Error('expected refusal');
    expect(out.error.code).toBe(ERROR_CODES.noStudents);
  });

  it('one group per student is allowed; one more is not', () => {
    // The boundary itself. Only `count > students` was covered, so an
    // off-by-one either way would have gone unnoticed.
    expect(
      ok(base({ students: 4, mode: { kind: 'groupCount', count: 4 } })).groups,
    ).toHaveLength(4);

    const out = buildGroups(
      base({ students: 4, mode: { kind: 'groupCount', count: 5 } }),
    );
    if (out.ok) throw new Error('expected refusal');
    expect(out.error.code).toBe(ERROR_CODES.tooManyGroups);
  });

  it('bunches leftovers in groupCount mode too, not only perGroup', () => {
    // The two settings are independent controls on the page and their
    // combination was never exercised.
    const { groups } = ok(
      base({
        students: 11,
        mode: { kind: 'groupCount', count: 3 },
        leftovers: 'bunch',
      }),
    );
    expect(shape(groups)).toEqual([5, 3, 3]);
  });

  it.each([
    ['always 0', () => 0],
    ['always just under 1', () => 0.999999999],
    // A source that returns exactly 1 is out of contract, but it is a
    // PARAMETER: nothing stops a caller supplying one, and the swap would
    // then read past the end of the array and seat `undefined` in a group.
    ['always exactly 1', () => 1],
  ])('survives a random source that %s', (_label, random) => {
    const { groups } = ok(base({ students: 12, random }));
    const all = groups.flat();
    expect(all).toHaveLength(12);
    expect(all.every((s) => s !== undefined)).toBe(true);
    expect(new Set(all.map((s) => s.number)).size).toBe(12);
  });
});

describe('buildGroups — names that are not plain ASCII', () => {
  it('normalises a name to one Unicode form for display, regardless of which form it arrived in', () => {
    // Was 'matches a name typed in a different Unicode form'. A name can
    // have two encodings that look identical: an accented letter as one
    // code point (NFC), or as a plain letter plus a combining accent (NFD).
    // macOS keyboards and file pastes produce different ones. That used to
    // matter for MATCHING: a roster pasted one way and a keep-apart rule
    // typed the other had to reach the same key, or the rule would silently
    // fail to fire. That matching is gone with the free-text keepApart
    // field -- identity is the number now, so nothing is matched on a name
    // at all.
    //
    // What survives is display: nameKey still runs on every name in
    // normaliseStudents (see its comment), so a name typed in NFD form must
    // still come back in NFC form, or the teacher's own roster renders
    // subtly different glyphs depending on which keyboard pasted it.
    const nfd = 'José'.normalize('NFD');
    const nfc = 'José'.normalize('NFC');
    expect(nfd).not.toBe(nfc);

    const out = buildGroups(
      base({ students: [student({ number: 1, name: nfd })] }),
    );
    if (!out.ok) throw new Error(`expected success, got ${out.error.code}`);
    expect(out.result.groups.flat()[0].name).toBe(nfc);
  });

  it('a roster of non-Latin names comes back intact through display normalisation', () => {
    // Restores coverage dropped when the free-text keepApart matching tests
    // were retired (see Fix round 1, F-5) -- this is NOT a matching test,
    // matching by name is gone for good. It is an NFC-stability check: all
    // four samples are already one Unicode form with no padding, so nameKey
    // is a no-op on them today -- that's the point. The value is future: it
    // fails the day nameKey gains a transform that reshapes a real name
    // silently. Decomposition (NFD) is the proven case -- it lengthens the
    // Arabic sample, which is how this test was shown to be load-bearing.
    // NFKC is NOT guarded here: all four samples were measured unchanged
    // under it, so swapping NFC for NFKC would leave this test green. If you
    // need that guarded, add a compatibility-form sample -- do not assume
    // this one covers it.
    const names = ['张伟', 'أحمد', 'דוד', 'สมชาย'];
    const out = buildGroups(
      base({
        students: names.map((name, i) => student({ number: i + 1, name })),
        mode: { kind: 'perGroup', size: 2 },
      }),
    );
    if (!out.ok) throw new Error(`expected success, got ${out.error.code}`);
    expect(
      out.result.groups
        .flat()
        .sort((a, b) => a.number - b.number)
        .map((s) => s.name),
    ).toEqual(names);
  });
});

describe('buildGroups — display normalisation preserves case', () => {
  it('renders a name with the exact case it was given, not folded to lowercase', () => {
    // Was 'treats a difference of case as a different child', which pinned
    // that nameKey does not fold case, so "ana" and "Ana" stayed two
    // different children for keep-apart MATCHING purposes.
    //
    // That half of the invariant is superseded now, not just unfed: identity
    // is the number, so two children both called "Ana" are simply two
    // numbers. Case-folding one of them can no longer merge them with
    // another, because nothing merges on the name at all any more.
    //
    // What is still live, on every call, is display: nameKey still runs on
    // every name in normaliseStudents (see its comment). If it folded case,
    // a teacher who typed "Ana" would see "ana" on their own roster.
    const out = buildGroups(
      base({ students: [student({ number: 1, name: 'Ana' })] }),
    );
    if (!out.ok) throw new Error(`expected success, got ${out.error.code}`);
    expect(out.result.groups.flat()[0].name).toBe('Ana');
  });
});

describe('buildGroups — a blank name collapses to null', () => {
  it('a whitespace-only name normalises to null, not to an empty string', () => {
    // The contract is two states: a name, or null meaning "no name". Without
    // collapsing the empty result back to null, a whitespace-only name would
    // land in a third, undocumented state -- '' is not nullish, so a
    // consumer reading `name ?? 'Student N'` would render a blank label
    // instead of falling back to it. Fix round 1, F-1.
    const out = buildGroups(
      base({ students: [student({ number: 1, name: '   ' })] }),
    );
    if (!out.ok) throw new Error(`expected success, got ${out.error.code}`);
    expect(out.result.groups.flat()[0].name).toBeNull();
  });

  it('nameKey trims padding around a real name', () => {
    // Zero trim coverage existed anywhere in this file before this test --
    // nameKey has three behaviours (NFC normalisation, case preservation,
    // trimming) and only the first two had a test. Fix round 1, F-1.
    const out = buildGroups(
      base({ students: [student({ number: 1, name: '  Ana  ' })] }),
    );
    if (!out.ok) throw new Error(`expected success, got ${out.error.code}`);
    expect(out.result.groups.flat()[0].name).toBe('Ana');
  });
});

describe('buildGroups — a blank together (or apart) collapses to null, not a shared letter', () => {
  // Same field shape as name, same defect, same fix (Fix round 1, F-4):
  // normaliseStudents used to pass `together` and `apart` through untouched,
  // so a blank cell was a LIVE letter rather than "no letter".
  it('a whitespace-only together forms no block', () => {
    // If '   ' were a real, shared letter, six students who all typed only
    // spaces would collapse into one block of 6 and trip
    // togetherUnitTooLarge against a group size of 3 (6 > 3). Succeeding,
    // with every student free to land in either group, is the proof a
    // blank forms no block at all.
    const out = buildGroups(
      base({
        students: Array.from({ length: 6 }, (_, i) =>
          student({ number: i + 1, together: '   ' }),
        ),
        mode: { kind: 'perGroup', size: 3 },
      }),
    );
    expect(out.ok).toBe(true);
  });

  it('two students with different-looking blank values are not merged into one block', () => {
    // The failure mode a naive fix (trim, but forget to collapse the empty
    // result to null) would still have: '' and '   ' both trim to '', so
    // they would become the SAME map key in buildBlocks and wrongly share a
    // block of 2 -- which trips togetherUnitTooLarge against a group size of
    // 1 (2 > 1). Succeeding, with each student alone in their own group of
    // 1, is the proof both collapsed to null rather than to a shared ''.
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, together: '' }),
          student({ number: 2, together: '   ' }),
        ],
        mode: { kind: 'perGroup', size: 1 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.groups).toHaveLength(2);
  });

  it('a whitespace-only apart also normalises to null, not to an empty string', () => {
    // apart has no grouping behaviour yet (Task 5) -- normalisation is a
    // field-level fix applied to name, together and apart identically in
    // normaliseStudents, so this is observable only as the returned field,
    // not through any placement decision.
    const out = buildGroups(
      base({ students: [student({ number: 1, apart: '   ' })] }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.groups.flat()[0].apart).toBeNull();
  });
});

describe('buildGroups — randomness is real but reproducible', () => {
  it('the same seed gives the same arrangement', () => {
    const a = ok(base({ random: seeded(7) }));
    const b = ok(base({ random: seeded(7) }));
    expect(a.groups.map((g) => g.map((s) => s.number))).toEqual(
      b.groups.map((g) => g.map((s) => s.number)),
    );
  });

  it('different seeds actually shuffle — the engine is not returning a fixed order', () => {
    // Guards against a "shuffle" that does nothing, which every other test here
    // would happily pass.
    const arrangements = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
        JSON.stringify(
          ok(base({ random: seeded(s) })).groups.map((g) =>
            g.map((x) => x.number),
          ),
        ),
      ),
    );
    expect(arrangements.size).toBeGreaterThan(1);
  });
});

describe('the name-based keep-apart surface is gone', () => {
  it('no longer exports parseKeepApart', () => {
    expect(
      (grouping as Record<string, unknown>).parseKeepApart,
    ).toBeUndefined();
  });

  it('no longer has error codes that only free text could produce', () => {
    // A letter needs no names and cannot be misspelt, so neither failure can
    // occur. Leaving the codes would leave dead branches that no test reaches.
    const codes = Object.values(ERROR_CODES);
    expect(codes).not.toContain('KEEP_APART_NEEDS_NAMES');
    expect(codes).not.toContain('KEEP_APART_UNKNOWN_NAME');
  });
});

describe('together letters', () => {
  it('places everyone sharing a letter in the same group', () => {
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, name: 'Ana', together: 'A' }),
          student({ number: 2, name: 'Budi', together: 'A' }),
          student({ number: 3, name: 'Citra' }),
          student({ number: 4, name: 'Dewi' }),
          student({ number: 5, name: 'Eko' }),
          student({ number: 6, name: 'Gita' }),
        ],
        mode: { kind: 'groupCount', count: 3 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const g = groupOf(out.result.groups, 1);
    expect(g?.map((s) => s.number)).toContain(2);
  });

  it('lets two different letters share a group when nothing says they must not', () => {
    // Was 'keeps two different letters apart from each other only by
    // chance, not by rule', asserted with groupCount: 1. With one group,
    // "may A and B share a group" is true by construction -- everyone is in
    // the one group regardless of whether `together` is read at all -- so
    // that test passed even with the feature switched off. It asserted a
    // 4-member group under this test's name, which is coverage the name
    // promised and the body never gave. Fix round 1, F-5.
    //
    // groupCount: 2 makes it observable: two equal-sized groups (sizes
    // [4, 4]) large enough to hold A-with-B or to keep them apart, so
    // whether they ever share is a real question the search answers rather
    // than a foregone conclusion.
    //
    // Fix round 2: this test passed trivially for a second, different
    // reason than the one it was rewritten for -- Fix round 1's
    // first-fit-decreasing sort made A and B share EVERY seed,
    // deterministically (block A always fills group 0 first, and block B
    // still fits in group 0, so it lands there too, regardless of
    // shuffle). "At least one seed together" cannot see "every seed
    // together" as a problem; it was true both before and after the
    // regression. Measured on this build: of these 30 seeds, 12 seated A
    // with B and 18 kept them apart, so the test now also requires the
    // opposite outcome to show up at least once -- it fails immediately if
    // the always-together collapse comes back. The dedicated regression
    // test below (same roster, 200 seeds) is the direct guard; this
    // strengthening is so THIS test's own name stays true.
    const students = [
      student({ number: 1, together: 'A' }),
      student({ number: 2, together: 'A' }),
      student({ number: 3, together: 'B' }),
      student({ number: 4, together: 'B' }),
      student({ number: 5 }),
      student({ number: 6 }),
      student({ number: 7 }),
      student({ number: 8 }),
    ];
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
    const outcomes = seeds.map((seed) => {
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'groupCount', count: 2 },
          random: seeded(seed),
        }),
      );
      if (!out.ok) return 'failed';
      return groupOf(out.result.groups, 1)?.some((s) => s.number === 3)
        ? 'together'
        : 'apart';
    });
    expect(outcomes.some((o) => o === 'together')).toBe(true);
    // Fix round 2: and not ALWAYS together, or the collapse is back.
    expect(outcomes.some((o) => o === 'apart')).toBe(true);
  });

  it('refuses a unit larger than the group, naming the letter and both numbers', () => {
    const out = buildGroups(
      base({
        students: Array.from({ length: 8 }, (_, i) =>
          student({ number: i + 1, together: i < 6 ? 'A' : null }),
        ),
        mode: { kind: 'perGroup', size: 4 },
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.togetherUnitTooLarge,
      letter: 'A',
      unit: 6,
      groupSize: 4,
    });
  });

  it('refuses the same clash reached by shrinking the groups instead', () => {
    // Same contradiction, opposite direction. One check has to catch both or
    // the teacher meets it from one side and not the other.
    const out = buildGroups(
      base({
        students: Array.from({ length: 8 }, (_, i) =>
          student({ number: i + 1, together: i < 3 ? 'A' : null }),
        ),
        mode: { kind: 'groupCount', count: 4 }, // 8 into 4 -> groups of 2
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.togetherUnitTooLarge);
  });

  it('ignores the letter of an absent student', () => {
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, name: 'Ana', together: 'A', absent: true }),
          student({ number: 2, name: 'Budi', together: 'A' }),
          student({ number: 3, name: 'Citra' }),
        ],
        // Brief says count: 3, but that is against the ROSTER (3 students). Task
        // 3 changed the too-many-groups guard to compare against PRESENT
        // students (2, since Ana is absent), so count: 3 trips TOO_MANY_GROUPS
        // before this test's own logic is ever reached -- confirmed by running
        // the brief's version unmodified (see
        // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
        // "Why the absent-student test uses count: 2"). count: 2 keeps
        // the test's actual purpose -- Budi's unit collapses to a block of one
        // once Ana's letter is ignored -- while staying under present.length.
        mode: { kind: 'groupCount', count: 2 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Budi's unit is now one student, so he can go anywhere.
    expect(out.result.groups.flat()).toHaveLength(2);
  });

  // Fix round 1, F-3: `gaveUp` vs "no arrangement exists" is the spec's
  // honesty promise -- until together-blocks existed it was unreachable
  // through the public API, and therefore untested. Both cases below assert
  // the CODE, not just `out.ok === false`: the defect these close was a
  // wrong code with a right verdict, so a test that only checks the verdict
  // would pass on the very bug being fixed.
  it('proves no arrangement exists when three together-pairs cannot all fit', () => {
    // 3 blocks of 2 into 2 groups of 3: each group can hold only ONE block
    // of 2 (two would need 4 of 3), so at most 2 of the 3 blocks ever fit,
    // and the third never does, however the search orders them. Small
    // enough that the search runs to genuine exhaustion, nowhere near
    // SEARCH_NODE_CAP -- this is "proven impossible", not "gave up".
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, together: 'A' }),
          student({ number: 2, together: 'A' }),
          student({ number: 3, together: 'B' }),
          student({ number: 4, together: 'B' }),
          student({ number: 5, together: 'C' }),
          student({ number: 6, together: 'C' }),
        ],
        mode: { kind: 'perGroup', size: 3 },
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.togetherNoArrangement,
      groupsTried: 2,
    });
  });

  it('says it gave up, not that no arrangement exists, once the search budget is exhausted', () => {
    // The reviewer's own repro (see
    // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
    // "The 15-buddy-pairs gave-up input, timed across two engine shapes"):
    // 15 buddy-pairs (30 students) into 10 groups. Re-measured after the
    // F-2 sort fix rather than assumed correct -- all 15 blocks are the
    // SAME size (2), so first-fit-decreasing has no size difference to sort
    // on here and this input still exhausts SEARCH_NODE_CAP exactly as it
    // did before F-2. Confirmed by measurement, not by carrying the number
    // over: gaveUp in 11ms post-F-2 (correcting an earlier version of this
    // comment, which claimed "single-digit milliseconds" -- 11 never was).
    //
    // Fix round 2 re-measured again, because the placer changed again: pass
    // 1 (now the unsorted, varied order) and pass 2 (first-fit-decreasing)
    // BOTH run here and BOTH exhaust the budget -- confirmed by temporary
    // instrumentation on this exact test (pass1: gaveUp=true, groups=null;
    // pass2: gaveUp=true, groups=null), not assumed from the arithmetic
    // alone. All 15 blocks being the SAME size means sorting by size is a
    // no-op, so pass 2's order is byte-identical to pass 1's and it re-runs
    // an already-exhausted search a second time -- measured at 17-23ms
    // across repeated runs, roughly double the single-pass number above,
    // as two equal exhaustions predict.
    const pairs = Array.from({ length: 30 }, (_, i) =>
      student({
        number: i + 1,
        together: String.fromCharCode(65 + Math.floor(i / 2)), // A,A,B,B,...,O,O
      }),
    );
    const out = buildGroups(
      base({ students: pairs, mode: { kind: 'groupCount', count: 10 } }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({ code: ERROR_CODES.togetherSearchGaveUp });
  });

  it('varies which students land together across seeds, not just the group sizes', () => {
    // Fix round 2 regression guard. Nothing previously pinned arrangement
    // VARIETY -- every existing assertion here either checks `shape()`
    // (group SIZES, permutation-invariant) or "at least one seed does X",
    // and Fix round 1's first-fit-decreasing sort collapsed this exact
    // roster to a SINGLE partition on every one of 200 seeds without
    // failing a single existing test: shape() stayed [4, 4] regardless, and
    // "at least one seed together" stayed true because it was true on
    // EVERY seed. Only the partition -- which student landed with which --
    // can see the collapse, so that is what this test asserts on.
    //
    // Same roster and mode as the "lets two different letters share a
    // group" test above, reused so these numbers are directly comparable
    // to what was measured before this fix: two together-pairs (A, A) and
    // (B, B) plus four unlettered students, into two groups of four. Block
    // sizes [2, 2, 1, 1, 1, 1] -- the exact shape whose collapse was
    // reported (1 distinct partition over 200 seeds, always {1,2,3,4} |
    // {5,6,7,8}, confirmed by re-measuring the pre-Fix-round-2 build here).
    //
    // Measured on THIS build (Fix round 2, two-pass placement): 7 distinct
    // partitions over these exact 200 seeds -- the mathematical maximum for
    // this roster (either A and B share a group and all four singles share
    // the other -- 1 way -- or A and B split across groups and the four
    // singles divide 2-and-2 between them -- C(4,2) = 6 ways -- 1 + 6 = 7
    // total). Asserting > 3 leaves more than half of that headroom, so an
    // implementation that still varies, just not maximally, does not turn
    // this test flaky.
    const students = [
      student({ number: 1, together: 'A' }),
      student({ number: 2, together: 'A' }),
      student({ number: 3, together: 'B' }),
      student({ number: 4, together: 'B' }),
      student({ number: 5 }),
      student({ number: 6 }),
      student({ number: 7 }),
      student({ number: 8 }),
    ];
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const partitions = new Set(
      seeds.map((seed) => {
        const { groups } = ok(
          base({
            students,
            mode: { kind: 'groupCount', count: 2 },
            random: seeded(seed),
          }),
        );
        // The partition: which students share a group, independent of
        // which output slot the group landed in (that slot is itself
        // shuffled -- see "randomise which group is oversized" in
        // grouping.ts -- and carries no meaning of its own). Sorted within
        // a group, and the groups sorted against each other, so "A with B"
        // and "B with A" collapse to the one partition they actually are.
        return groups
          .map((g) =>
            g
              .map((s) => s.number)
              .sort((a, b) => a - b)
              .join('.'),
          )
          .sort()
          .join(' | ');
      }),
    );
    expect(partitions.size).toBeGreaterThan(3);
  });

  // Fix round 3: pass 2 (first-fit-decreasing) exists solely to rescue
  // rosters pass 1 (the shuffled, unsorted order) gives up on -- see
  // `placeBlocks`'s docstring. Nothing before this test exercised that
  // rescue: the gave-up test above uses 15 SAME-size blocks, so sorting by
  // size is a no-op and pass 2 replays pass 1's exhausted search node for
  // node; the variety test above resolves entirely inside pass 1. So the one
  // capability the two-pass design exists to provide had no regression
  // guard -- a change that broke "reuse pass 1's order, do not reshuffle"
  // could silently reintroduce give-ups and nothing would catch it.
  //
  // Provenance (see
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "Together letters: pass-2 rescue, proven on a real input" for the full
  // sweep). This roster -- five together-letters of 3 students (A-E), five
  // of 2 (F-J),
  // five unlettered singles; 15 blocks, 30 students -- into groupCount: 10
  // (ten groups of exactly 3) is the classic "a block of 2 needs exactly one
  // block of 1 to fill its group" bin-packing shape, mixed block sizes so
  // the FFD sort is not a no-op.
  //
  // PASS 1 ALONE GIVES UP on this input: established by temporarily
  // disabling pass 2 in grouping.ts (`return pass1;` before the FFD branch)
  // and running this exact roster/mode through the real engine for seeds
  // 1..300. Result: pass 1 hit SEARCH_NODE_CAP and returned
  // TOGETHER_SEARCH_GAVE_UP on 63 of the 300 (seed 1 -- used below -- among
  // them: 1, 6, 9, 12, 15, 20, 22, 35, 40, 41, 47, 56, 59, 60, 65, 67, 71,
  // 77, 79, 85, 90, 91, 93, 96, 106, 107, 108, 110, 114, 122, 123, 124, 128,
  // 132, 133, 135, 139, 148, 152, 159, 173, 179, 187, 192, 199, 203, 216,
  // 217, 219, 222, 224, 226, 238, 247, 256, 261, 263, 264, 265, 267, 277,
  // 286, 297) and NEVER ONCE proved no arrangement exists (0 of 300) -- this
  // is real search exhaustion on a feasible input, not a fixture that
  // happens to be impossible.
  //
  // NOT A LUCKY SEED: with pass 2 restored (the real, committed engine),
  // ALL 63 of those give-up seeds succeed, each one checked for validity
  // (every letter's block intact, exactly 30 students, no duplicates, no
  // invented numbers, every group size 3) -- 63/63, zero exceptions. Seed 1
  // is an arbitrary pick from a uniform 63-wide spread, not the one seed
  // that happens to work.
  //
  // Timing, measured on this machine, not a guarantee: the full call at
  // seed 1 took ~12-14ms (pass 1 spends its ~200,000-node budget before
  // giving up; pass 2's sorted order then succeeds quickly) -- roughly what
  // the existing gave-up test measures for ONE exhausted pass, consistent
  // with pass 1 here also running to exhaustion before pass 2 rescues it.
  it('is rescued by pass 2 when pass 1 alone would give up, without losing or inventing anyone', () => {
    const students = [
      ...['A', 'B', 'C', 'D', 'E'].flatMap((letter, gi) =>
        Array.from({ length: 3 }, (_, k) =>
          student({ number: gi * 3 + k + 1, together: letter }),
        ),
      ),
      ...['F', 'G', 'H', 'I', 'J'].flatMap((letter, gi) =>
        Array.from({ length: 2 }, (_, k) =>
          student({ number: 15 + gi * 2 + k + 1, together: letter }),
        ),
      ),
      ...Array.from({ length: 5 }, (_, k) => student({ number: 26 + k })),
    ];
    const out = buildGroups(
      base({
        students,
        mode: { kind: 'groupCount', count: 10 },
        random: seeded(1),
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { groups } = out.result;

    // Nobody lost, nobody invented -- scoped to this test's own roster, not
    // a general claim (the general block-path version is the next task's).
    const numbers = groups.flat().map((s) => s.number);
    expect(numbers.length).toBe(30);
    expect(new Set(numbers)).toEqual(new Set(students.map((s) => s.number)));

    // Every together-letter's students share one group -- the property pass
    // 2 exists to preserve while rescuing the search.
    for (const letter of 'ABCDEFGHIJ') {
      const withLetter = students.filter((s) => s.together === letter);
      const host = groupOf(groups, withLetter[0].number);
      for (const s of withLetter) {
        expect(host?.map((m) => m.number)).toContain(s.number);
      }
    }
  });
});

describe('apart letters', () => {
  it('separates everyone sharing a letter from everyone else sharing it', () => {
    // Swept across seeds, not asserted once (Fix round 1, F-3): a single
    // arbitrary seed leaves this holding by LUCK, not by the feature -- with
    // apart-letters completely ignored, this exact roster's assertion still
    // holds on 23 of 50 seeds (confirmed by mutation below), and seed 1
    // (base()'s default) is one of the lucky ones. This is the feature's
    // headline promise, so it gets real search pressure: 25 seeds, every one
    // checked, not "at least one".
    for (let seed = 1; seed <= 25; seed++) {
      const out = buildGroups(
        base({
          students: [
            student({ number: 1, apart: 'X' }),
            student({ number: 2, apart: 'X' }),
            student({ number: 3, apart: 'X' }),
            student({ number: 4 }),
            student({ number: 5 }),
            student({ number: 6 }),
          ],
          mode: { kind: 'groupCount', count: 3 },
          random: seeded(seed),
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      for (const g of out.result.groups) {
        expect(g.filter((s) => s.apart === 'X')).toHaveLength(1);
      }
    }
  });

  it('treats two different letters as unrelated', () => {
    // What this actually guards: with a single group, "does X end up with Y"
    // is true by construction regardless of whether apart-letters are read
    // at all -- everyone is in the one group either way. So this test cannot
    // go RED for the reason its name suggests (confirmed: it already passes
    // before buildConflicts reads `apart` at all -- see
    // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
    // "The five original tests: which passed structurally, not by
    // feature"). Its real job is narrower and still real: it guards against
    // OVER-separation, i.e. a bug that conflicted every letter-holder with
    // every other regardless of which letter they hold -- that bug WOULD
    // turn this impossible (two mutually-conflicting singletons cannot both
    // fit in one group) and this test would catch it. Proven by mutation,
    // not asserted: see
    // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
    // "Mutation evidence for the structural claim" for the mutant and its
    // failure.
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, apart: 'X' }),
          student({ number: 2, apart: 'Y' }),
        ],
        mode: { kind: 'groupCount', count: 1 },
      }),
    );
    expect(out.ok).toBe(true); // X and Y have no rule between them
  });

  it('proves impossibility by naming the students, as numbers', () => {
    const out = buildGroups(
      base({
        students: Array.from({ length: 6 }, (_, i) =>
          student({ number: i + 1, apart: i < 4 ? 'X' : null }),
        ),
        mode: { kind: 'groupCount', count: 3 },
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.keepApartImpossible);
    if (out.error.code !== ERROR_CODES.keepApartImpossible) return;
    expect(out.error.students.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(out.error.groupsNeeded).toBe(4);
  });

  it('ignores the letter of an absent student', () => {
    // Structurally unbreakable as apart-COVERAGE, not just weak: 2 present
    // students into sizes [1, 1] separate by CAPACITY alone, whether or not
    // `apart` (or absence-filtering) is read at all -- confirmed, no mutant
    // of the apart logic reddens this (Fix round 1, F-4). Kept anyway as a
    // cheap boundary check that an absent letter-holder does not otherwise
    // disrupt sizing. The real guarantee -- that an absent student's letter
    // cannot inflate the clique -- is the test below.
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, apart: 'X' }),
          student({ number: 2, apart: 'X' }),
          student({ number: 3, apart: 'X', absent: true }),
        ],
        mode: { kind: 'groupCount', count: 2 },
      }),
    );
    expect(out.ok).toBe(true); // two present, two groups
  });

  // Fix round 1, F-4: sits on the refusal boundary instead. Four X-holders
  // (1-4) plus two plain students; student 4 is absent. The PRESENT clique
  // is exactly {1, 2, 3} -- 3 blocks -- which equals sizes.length (3), so
  // the clique gate does not fire and this succeeds. If absence ever leaked
  // into `buildConflicts` (the failure the test above cannot see: it has no
  // slack between "separates" and "does not"), the clique would include the
  // absent student 4 too -- 4 > 3 -- and this would fail with
  // KEEP_APART_IMPOSSIBLE instead. Proven by mutation: see
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "The absence boundary: proven by mutation".
  it('an absent letter-holder does not inflate the clique past the group count', () => {
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, apart: 'X' }),
          student({ number: 2, apart: 'X' }),
          student({ number: 3, apart: 'X' }),
          student({ number: 4, apart: 'X', absent: true }),
          student({ number: 5 }),
          student({ number: 6 }),
        ],
        mode: { kind: 'groupCount', count: 3 },
      }),
    );
    expect(out.ok).toBe(true);
  });

  // 'separates whole units, not just the students carrying the letter' used
  // to live here (Ana+Budi together, Ana apart from Citra, expecting Budi
  // never ends up with Citra) and was deleted (Fix round 1, F-3): with 4
  // students into 2 groups of 2, the together-block {Ana, Budi} has size 2,
  // which can ONLY ever be placed as an entire group on its own -- there is
  // no OTHER group it could partially share -- so Citra ends up with Dewi by
  // CAPACITY ALONE, whether or not the block-level conflict check runs at
  // all. Confirmed by mutation: it stayed green under both an ignored-apart
  // mutant and a disabled-conflict mutant (see
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "The deleted separates-whole-units test"). Adding filler
  // students to relieve that capacity pressure -- the obvious repair -- was
  // tried and it still passed at seed 1, so no repair was found, not for
  // lack of trying.
  //
  // The guarantee it meant to protect -- a together-block moves as one, so
  // its apart-conflict moves with it -- is properly covered, under real
  // search pressure across 100 attempts with multiple modes and seeds, by
  // 'holds even when together-letters merge students into multi-student
  // blocks' below (debt (a) sweep 2), independently reconfirmed here to go
  // red under the disabled-conflict mutant (`expected 2 to be less than or
  // equal to 1`) where this deleted test stayed green under the identical
  // mutation.
});

// Debt (a) from the task-5 brief's opening notice: "two students who must be
// apart never share a group" is the headline promise of the whole feature,
// and until this task it had zero cover -- `assign`'s conflict check has
// been unreachable since Task 2. The five tests above each pin one small,
// hand-picked roster; this proves the same guarantee broadly, with an
// invariant re-checked directly against the raw `apart` field (never via
// buildConflicts or any other engine internal, so this cannot pass merely
// because the test and the implementation share a bug).
describe('apart letters — the guarantee holds broadly, not just on hand-picked rosters (debt a)', () => {
  it('holds across a spread of class sizes, group-count and per-group modes, and seeds', () => {
    const sizesToTry = [4, 6, 9, 12, 16, 20, 25, 30];
    const letters = ['X', 'Y', 'Z'];
    let successes = 0;
    let attempts = 0;

    for (const n of sizesToTry) {
      const students = Array.from({ length: n }, (_, i) =>
        student({ number: i + 1, apart: letters[i % letters.length] }),
      );
      // Cyclic assignment balances each letter's membership to
      // ceil(n/3) at most, so this is the largest clique the search can
      // ever meet for this roster -- used to keep every mode comfortably
      // feasible (a few groups of slack) rather than accidentally
      // constructing a SECOND pathological-search fixture here; that is
      // debt (b)'s job, deliberately, in its own dedicated test below.
      const largestLetterGroup = Math.ceil(n / letters.length);
      const modes: Mode[] = [
        { kind: 'groupCount', count: largestLetterGroup + 2 },
        { kind: 'groupCount', count: largestLetterGroup + 4 },
        {
          kind: 'perGroup',
          size: Math.max(2, Math.floor(n / (largestLetterGroup + 3))),
        },
      ];
      for (const mode of modes) {
        if (mode.kind === 'groupCount' && mode.count > n) continue;
        for (let seed = 1; seed <= 8; seed++) {
          attempts++;
          const out = buildGroups(
            base({ students, mode, random: seeded(seed * 97 + n) }),
          );
          if (!out.ok) continue;
          successes++;
          // The invariant, re-derived from `apart` directly rather than
          // trusting any engine internal: no group holds two present
          // students who share a non-null apart letter.
          for (const g of out.result.groups) {
            for (const letter of letters) {
              expect(
                g.filter((s) => s.apart === letter).length,
              ).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
    // The invariant must actually be exercised on real successes, not hold
    // vacuously because every attempt in the sweep happened to fail.
    // Measured (see
    // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
    // "The guarantee holds broadly: two sweeps"): 184 attempts, 179
    // successes.
    expect(attempts).toBeGreaterThan(100);
    expect(successes).toBeGreaterThan(80);
  });

  it('holds even when together-letters merge students into multi-student blocks', () => {
    // A pure apart-only sweep cannot see a block-index/student-index
    // substitution bug (the exact class of bug the pre-Task-5 comment above
    // `pairs` warned about): with no together-letters every block is a
    // singleton, so block index and student index are the same sequence of
    // numbers and a swap between them is invisible. Together-letters here
    // make blocks of size 2, so block index and student index diverge from
    // student 3 onward, giving this sweep something a same-index bug cannot
    // hide from.
    const students = [
      student({ number: 1, together: 'A', apart: 'X' }),
      student({ number: 2, together: 'A' }),
      student({ number: 3, together: 'B', apart: 'X' }),
      student({ number: 4, together: 'B' }),
      student({ number: 5, together: 'C', apart: 'Y' }),
      student({ number: 6, together: 'C' }),
      student({ number: 7, apart: 'Y' }),
      student({ number: 8, apart: 'Z' }),
      student({ number: 9, apart: 'Z' }),
      student({ number: 10 }),
      student({ number: 11 }),
      student({ number: 12 }),
    ];
    const modes: Mode[] = [
      { kind: 'groupCount', count: 4 },
      { kind: 'groupCount', count: 6 },
      { kind: 'perGroup', size: 3 },
      { kind: 'perGroup', size: 4 },
    ];
    let successes = 0;
    for (const mode of modes) {
      for (let seed = 1; seed <= 25; seed++) {
        const out = buildGroups(base({ students, mode, random: seeded(seed) }));
        if (!out.ok) continue;
        successes++;
        for (const g of out.result.groups) {
          for (const letter of ['X', 'Y', 'Z']) {
            expect(
              g.filter((s) => s.apart === letter).length,
            ).toBeLessThanOrEqual(1);
          }
          // The together-units still move as whole blocks under this mix.
          for (const letter of ['A', 'B', 'C']) {
            const withLetter = g.filter((s) => s.together === letter);
            expect(withLetter.length === 0 || withLetter.length === 2).toBe(
              true,
            );
          }
        }
      }
    }
    // Measured (see
    // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
    // "The guarantee holds broadly: two sweeps"): 100 successes out of 100
    // attempts.
    expect(successes).toBeGreaterThan(20);
  });
});

// Debt (b): exhausting SEARCH_NODE_CAP must never be reported as "no
// arrangement exists" -- the old engine once shipped exactly that bug,
// reporting five students mutually inseparable when it had merely stopped
// looking, and its regression tests were deleted with the free-text
// `keepApart` field. Re-proven here against a REAL apart-only input that
// exhausts the budget on the CURRENT (two-pass, block-based) engine --
// re-measured, not cited from the SEARCH_NODE_CAP comment's old numbers,
// because those were taken against a since-retired engine shape (see that
// comment for how far off they turned out to be: disjoint same-size
// cliques, the literal old shape, no longer exhaust the budget at all on
// this engine, up to 484 students -- see
// docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
// "Re-measured against the current engine: a negative result" for the full
// search that established that before this shape was found).
describe('apart letters — exhausting the search budget is never reported as "no arrangement exists" (debt b)', () => {
  it('says it gave up, not that no arrangement exists, once BOTH passes exhaust the budget', () => {
    // Six disjoint apart-letter cliques of UNEVEN size (20, 19, 18, 17, 16,
    // 15 -- 105 students) into exactly 20 groups. Even sizes (e.g. many
    // same-size disjoint triangles, or several cliques each exactly matching
    // the group count) measured trivially fast on this engine regardless of
    // scale -- greedy first-fit essentially self-balances a perfectly
    // regular shape. Unevenness is what defeats it: with no slack capacity
    // and clique sizes that do not divide the groups evenly, the shuffled
    // first-fit search paints itself into corners that need deep
    // backtracking to escape, 334 of 400 seeds measured exhausting the
    // budget outright with the remaining 66 succeeding (see
    // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
    // "The shape that does defeat it") -- this is a common outcome for this
    // shape, not a hand-picked unlucky seed. No `random` override is
    // passed, so this
    // runs on `base()`'s default `seeded(1)`, confirmed to land in the
    // gave-up set and to reproduce identically across repeated runs (both
    // properties are deterministic, not a matter of luck at test-run time).
    //
    // Every block here is a singleton (no `together`), so pass 2's
    // first-fit-decreasing sort has no size difference to act on -- a
    // stable sort over equal keys is a no-op, so pass 2's order is
    // byte-identical to pass 1's and it replays the same exhausted search
    // node for node. Confirmed by temporary instrumentation on this exact
    // input (reverted before commit, not left in the source): pass 1
    // gaveUp=true/found=false; pass 2 gaveUp=true/found=false, and its order
    // was verified byte-identical to pass 1's. BOTH passes are defeated,
    // not just one, and the earlier "same shape, all-equal-size blocks"
    // together-test (the 15-buddy-pairs one, above) establishes the general
    // pattern this instantiates for apart letters specifically.
    const students = [20, 19, 18, 17, 16, 15].flatMap((size, ci) =>
      Array.from({ length: size }, (_, j) =>
        student({ number: ci * 100 + j + 1, apart: `C${ci}` }),
      ),
    );
    expect(students).toHaveLength(105);

    const out = buildGroups(
      base({ students, mode: { kind: 'groupCount', count: 20 } }),
    );

    expect(out.ok).toBe(false);
    if (out.ok) return;
    // The specific code, not just `ok === false`: the historical bug this
    // guards had the right verdict (refused) and the WRONG code (claimed
    // impossibility when it had only given up), so a test that stopped at
    // the verdict would have passed on that exact bug. That code has exactly
    // one producer (KEEP_APART_SEARCH_GAVE_UP), so this assertion alone
    // already proves the cap was hit -- no separate timing check is needed
    // to establish that (Fix round 1, F-5: a wall-clock assertion
    // (`expect(ms).toBeGreaterThan(5)`) was removed here; this codebase does
    // not allow tests whose pass/fail depends on wall-clock time, since it
    // turns a slow or loaded CI machine into a mystery failure). Measured,
    // as a record rather than an assertion: ~51-57ms on repeated local runs
    // (matches the SEARCH_NODE_CAP comment in grouping.ts, which has the
    // full sweep this input was drawn from).
    expect(out.error).toEqual({ code: ERROR_CODES.keepApartSearchGaveUp });
  });
});

// Debt (c): `largestMutualConflict` has been unreachable since Task 2, so
// nothing has ever proven it reports a genuine clique rather than merely
// "everyone who has some conflict". Two disjoint apart-letters below: X is a
// mutual triangle (a real 3-clique), Y is a mutual pair, and X and Y have no
// rule between them (a different letter is unrelated -- see "treats two
// different letters as unrelated" above). A certificate that named every
// conflicted student rather than the actual maximum clique would wrongly
// include 4 and 5 here.
describe('apart letters — the clique certificate names exactly the conflicting students (debt c)', () => {
  it('does not include a student who has some conflict but is not part of the reported clique', () => {
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, apart: 'X' }),
          student({ number: 2, apart: 'X' }),
          student({ number: 3, apart: 'X' }),
          student({ number: 4, apart: 'Y' }),
          student({ number: 5, apart: 'Y' }),
        ],
        mode: { kind: 'groupCount', count: 2 }, // 2 groups cannot hold X's clique of 3
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.keepApartImpossible);
    if (out.error.code !== ERROR_CODES.keepApartImpossible) return;
    expect(out.error.students.sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(out.error.groupsNeeded).toBe(3);
  });

  // Fix round 1, F-1: every test above uses only singleton blocks (no
  // `together`), so block index and student index coincide and this cannot
  // see a bug that named every MEMBER of every block rather than one
  // representative per block. Three together-pairs below, with the
  // apart-letter on only one student per pair, close that gap: students 2,
  // 4 and 6 carry no apart-letter at all -- they are only in the clique's
  // blocks because a together-letter binds them to 1, 3 and 5 -- so naming
  // them would assert that 1 and 2 (who must be kept TOGETHER) also need to
  // be kept apart from each other, and would leave `students.length` at 6
  // against a `groupsNeeded` of 3.
  it('names one student per block, not every member of a multi-student block', () => {
    const out = buildGroups(
      base({
        students: [
          // The letter-holder is declared SECOND in every pair, deliberately.
          // With the holder first, `blocks[b][0]` and "the member carrying the
          // letter" are the same student, so this test would pass just as well
          // against a certificate that always named the block's first member --
          // the same lie in a quieter form. Declared second, that regression
          // reports [2, 4, 6]: three children with no apart-rule at all.
          student({ number: 2, together: 'P' }),
          student({ number: 1, together: 'P', apart: 'X' }),
          student({ number: 4, together: 'Q' }),
          student({ number: 3, together: 'Q', apart: 'X' }),
          student({ number: 6, together: 'R' }),
          student({ number: 5, together: 'R', apart: 'X' }),
        ],
        mode: { kind: 'groupCount', count: 2 }, // 2 groups cannot hold X's clique of 3
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.keepApartImpossible);
    if (out.error.code !== ERROR_CODES.keepApartImpossible) return;
    // students.length reconciles with groupsNeeded -- unlike the pre-fix
    // certificate, which named all 6.
    expect(out.error.groupsNeeded).toBe(3);
    expect(out.error.students).toHaveLength(3);
    // Exactly the three actual letter-holders -- never their blockmates.
    expect(out.error.students.sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });
});

// Correction 2: Task 4 left "both a together- and an apart-letter are live
// when the search fails" as a stated placeholder, falling through to the
// keep-apart codes. This task makes apart-letters real, so that fallthrough
// is reachable for the first time -- this proves it now resolves to the
// neutral BOTH_RULES code rather than either single-rule guess.
describe('apart and together letters both in play — the failure names both rules, guesses neither', () => {
  it('reports BOTH_RULES_NO_ARRANGEMENT, not a single-rule code, when both kinds of rule are live and the search proves impossibility', () => {
    // Same shape as "refuses no arrangement exists when three together-pairs
    // cannot all fit" above (3 blocks of 2 into 2 groups of 3 -- provably
    // impossible on the together constraint alone: each group of 3 can hold
    // only ONE block of 2, so at most 2 of the 3 blocks ever fit), with an
    // apart-letter added ACROSS two of those blocks so a real keep-apart
    // conflict is live too. The together clash alone already makes this
    // impossible, and adding a strictly tighter constraint cannot make an
    // impossible problem possible again, so this stays a PROVEN
    // impossibility -- just with both rules live at once.
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, together: 'A', apart: 'X' }),
          student({ number: 2, together: 'A' }),
          student({ number: 3, together: 'B', apart: 'X' }),
          student({ number: 4, together: 'B' }),
          student({ number: 5, together: 'C' }),
          student({ number: 6, together: 'C' }),
        ],
        mode: { kind: 'perGroup', size: 3 },
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.bothRulesNoArrangement,
      groupsTried: 2,
    });
  });

  it('reports BOTH_RULES_SEARCH_GAVE_UP, not a single-rule code, when both kinds of rule are live and the search merely gave up', () => {
    // The exact roster from "says it gave up, not that no arrangement
    // exists, once the search budget is exhausted" (together letters,
    // above): 15 buddy-pairs (30 students) into 10 groups, the reviewer's
    // own repro from Task 4, confirmed there to exhaust SEARCH_NODE_CAP in
    // BOTH passes because all 15 blocks are the SAME size (2), so pass 2's
    // first-fit-decreasing sort is a no-op and replays pass 1 exactly.
    //
    // One apart-letter is added here, across two students in DIFFERENT
    // pairs (student 1, pair A; student 17, pair I) -- a real cross-block
    // keep-apart conflict, live alongside the together-letters, and one
    // that does not touch any block's SIZE (apart never does), so the
    // same-size argument for why pass 2 cannot rescue this input still
    // applies unchanged. Confirmed empirically (see
    // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
    // "Both rules at once: attribution, and the gave-up/proven split"), not
    // assumed from that argument alone: this exact roster reproducibly
    // returns BOTH_RULES_SEARCH_GAVE_UP, deterministically, on repeated
    // runs.
    const pairs = Array.from({ length: 30 }, (_, i) =>
      student({
        number: i + 1,
        together: String.fromCharCode(65 + Math.floor(i / 2)), // A,A,B,B,...,O,O
        apart: i === 0 || i === 16 ? 'X' : null, // student 1 (pair A) vs student 17 (pair I)
      }),
    );
    const out = buildGroups(
      base({ students: pairs, mode: { kind: 'groupCount', count: 10 } }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({ code: ERROR_CODES.bothRulesSearchGaveUp });
  });
});

describe('together and apart at the same time', () => {
  it('refuses two students kept together who are also kept apart', () => {
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, name: 'Ana', together: 'A', apart: 'X' }),
          student({ number: 2, name: 'Budi', together: 'A', apart: 'X' }),
          student({ number: 3, name: 'Citra' }),
          student({ number: 4, name: 'Dewi' }),
        ],
        mode: { kind: 'groupCount', count: 2 },
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.togetherApartClash,
      students: [1, 2],
    });
  });

  it('allows the same apart letter on students who are NOT kept together', () => {
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, together: 'A', apart: 'X' }),
          student({ number: 2, together: 'A' }),
          student({ number: 3, apart: 'X' }),
          student({ number: 4 }),
        ],
        mode: { kind: 'groupCount', count: 2 },
      }),
    );
    expect(out.ok).toBe(true); // 1 and 3 share X but are in different units
  });

  it('does not fire when one of the pair is absent', () => {
    // WHAT THIS PROVES, AND WHAT IT DOES NOT.
    //
    // It does NOT prove the clash check is absence-aware, because the check
    // has no absence-aware branch to test. Student 2 is removed by the
    // `present` filter long before `buildBlocks` runs, so the block this code
    // actually sees is student 1 alone -- mechanically the same block-of-one
    // the test above already covers. Mutate the clash guard and this reddens
    // through that single-occurrence path, not through anything to do with
    // `absent`.
    //
    // It DOES pin that absence is resolved upstream. Measured: drop the filter
    // (`const present = students`) and this fails cleanly with `expected false
    // to be true` -- the absent student rejoins the block, the contradiction is
    // detected, and a teacher is refused over a child who is not even in today.
    // That is the regression this guards, and it is why the test stays.
    //
    // Note for whoever mutates this next: passing the unfiltered roster to
    // `buildBlocks` instead is NOT a faithful mutant. Block indices are into
    // `present`, so it dies with a TypeError -- a crash, which any test would
    // catch, proving nothing about this one.
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, together: 'A', apart: 'X' }),
          student({ number: 2, together: 'A', apart: 'X', absent: true }),
          student({ number: 3 }),
        ],
        mode: { kind: 'groupCount', count: 2 },
      }),
    );
    expect(out.ok).toBe(true);
  });
});

describe('sex mode: mix', () => {
  const M = (number: number) => student({ number, sex: 'M' });
  const F = (number: number) => student({ number, sex: 'F' });

  it('spreads boys and girls as evenly as the numbers allow', () => {
    const out = buildGroups(
      base({
        students: [M(1), M(2), M(3), M(4), F(5), F(6), F(7), F(8)],
        mode: { kind: 'groupCount', count: 4 },
        sexMode: 'mix',
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const g of out.result.groups) {
      expect(g.filter((s) => s.sex === 'M')).toHaveLength(1);
      expect(g.filter((s) => s.sex === 'F')).toHaveLength(1);
    }
  });

  // Correction 5: the brief's own version of this test used five boys and
  // ONE girl into three groups, asserting only that exactly one group
  // contains a girl -- true with a single girl no matter what the code
  // does, mix logic included or not, so it could never fail. Replaced with
  // a shape where the weave has real work to do: four boys, two girls,
  // three groups of two. Under the weave (see `weaveBySex`), pass 1's order
  // is [boy, girl, boy, girl, boy, boy] -- the girls sit at positions 1 and
  // 3 -- and with no conflicts live, `assign` fills groups strictly in
  // order (group 0 takes positions 0-1, group 1 takes 2-3, group 2 takes
  // 4-5; see the "fixed ascending order" comment on `assign`), so the two
  // girls land in group 0 and group 1 -- never the same group -- for every
  // seed, because the weave's ALTERNATION (not which student fills which
  // slot) is what fixes each girl's position. Swept across seeds rather
  // than trusting one, matching this file's own standing objection to
  // single-seed proof elsewhere ("NOT A LUCKY SEED").
  //
  // Verified this fails without the weave: this exact assertion, run
  // against the engine as it stood immediately before this task touched
  // `placeBlocks` (sexMode read nowhere, order = plain `shuffled`, sex
  // ignored entirely), reddens with `bothTogether` = [8, 12, 28, 29, 30] --
  // 5 of these 30 seeds put both girls in the same group. Full output
  // recorded in
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "The alternation defect, and the first spread check".
  it('spreads the girls across different groups even when the numbers do not divide evenly', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
    const bothTogether = seeds.filter((seed) => {
      const out = buildGroups(
        base({
          students: [M(1), M(2), M(3), M(4), F(5), F(6)],
          mode: { kind: 'groupCount', count: 3 },
          sexMode: 'mix',
          random: seeded(seed),
        }),
      );
      if (!out.ok) throw new Error(`expected success, got ${out.error.code}`);
      return out.result.groups.some(
        (g) => g.filter((s) => s.sex === 'F').length === 2,
      );
    });
    expect(bothTogether).toEqual([]);
  });

  // Correction 2: the dedicated variety regression guard the together-letters
  // section above already has one of ("varies which students land together
  // across seeds"). Nothing else in this describe block would notice the
  // weave collapsing to a single arrangement, because every other assertion
  // here checks a STRUCTURAL property (how many boys/girls per group, which
  // groups a girl is in) that is permutation-invariant: an implementation
  // that always paired the SAME boy with the SAME girl would satisfy every
  // test above this one and still be exactly the Fix-round-1-style
  // regression Task 4 spent two fix rounds recovering from. Only the
  // PARTITION -- which student landed with which -- can see that collapse.
  //
  // Same roster as "spreads boys and girls as evenly as the numbers allow"
  // above, which the weave forces into exactly one boy and one girl per
  // group. What is NOT forced is WHICH boy pairs with WHICH girl: a perfect
  // matching between 4 boys and 4 girls, of which there are mathematically
  // exactly 4! = 24 (girl 1 can pair with any of 4 boys, girl 2 with any of
  // the remaining 3, and so on). Measured on this build: 24 distinct
  // partitions over 200 seeds -- every one of the 24 possible matchings was
  // seen at least once. Asserting > 10 leaves more than half of that
  // headroom, so an implementation that still varies, just not maximally,
  // does not turn this test flaky.
  it('varies which boy pairs with which girl across seeds, not just the 1-and-1 split', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const partitions = new Set(
      seeds.map((seed) => {
        const { groups } = ok(
          base({
            students: [M(1), M(2), M(3), M(4), F(5), F(6), F(7), F(8)],
            mode: { kind: 'groupCount', count: 4 },
            sexMode: 'mix',
            random: seeded(seed),
          }),
        );
        return groups
          .map((g) =>
            g
              .map((s) => s.number)
              .sort((a, b) => a - b)
              .join('.'),
          )
          .sort()
          .join(' | ');
      }),
    );
    expect(partitions.size).toBeGreaterThan(10);
  });

  // Same measurement, on the uneven roster ("spreads the girls across
  // different groups" above): four boys, two girls, three groups of two.
  // The weave forces the two girls into different groups (proven above) and
  // leaves the third group as the two leftover boys -- what varies is WHICH
  // two boys pair with the girls and WHICH specific girl lands with WHICH
  // specific boy: an injective function from 2 girls to 4 boys, of which
  // there are mathematically exactly 4 x 3 = 12. Measured on this build: 12
  // distinct partitions over 200 seeds -- the mathematical maximum, every
  // one seen. Asserting > 5 leaves more than half of that headroom.
  it('varies pairings on the uneven roster too, not just the evenly-divided one', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const partitions = new Set(
      seeds.map((seed) => {
        const { groups } = ok(
          base({
            students: [M(1), M(2), M(3), M(4), F(5), F(6)],
            mode: { kind: 'groupCount', count: 3 },
            sexMode: 'mix',
            random: seeded(seed),
          }),
        );
        return groups
          .map((g) =>
            g
              .map((s) => s.number)
              .sort((a, b) => a - b)
              .join('.'),
          )
          .sort()
          .join(' | ');
      }),
    );
    expect(partitions.size).toBeGreaterThan(5);
  });

  it('refuses when a student being grouped has no sex set', () => {
    const out = buildGroups(
      base({
        students: [M(1), F(2), student({ number: 3 })],
        mode: { kind: 'groupCount', count: 1 },
        sexMode: 'mix',
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.sexNeedsAllSet,
      students: [3],
    });
  });

  it('does not count an absent student with no sex', () => {
    const out = buildGroups(
      base({
        students: [M(1), F(2), student({ number: 3, absent: true })],
        mode: { kind: 'groupCount', count: 1 },
        sexMode: 'mix',
      }),
    );
    expect(out.ok).toBe(true);
  });

  it('ignores sex entirely when the mode is off', () => {
    const out = buildGroups(
      base({
        students: [M(1), F(2), student({ number: 3 })],
        mode: { kind: 'groupCount', count: 1 },
        sexMode: 'off',
      }),
    );
    expect(out.ok).toBe(true);
  });

  // HISTORICAL TRIPWIRE, DELIBERATELY FLIPPED BY TASK 8A. Task 7 scoped the
  // unset-sex guard to `sexMode === 'mix'` rather than the brief's own
  // `!== 'off'`, because at the time `separate` did not read `sex` anywhere
  // in this file -- refusing a `separate` roster over a field that mode
  // never consulted would have been a pure regression, and this test
  // existed to prove that regression did NOT happen.
  //
  // Task 8a is the deliberate widening Task 7 always meant to hand off (see
  // `ERROR_CODES.sexNeedsAllSet`'s doc comment in grouping.ts): the guard
  // now covers `separate` too, ahead of Task 8b's placement work landing.
  // So the specific claim this test pinned -- that THIS EXACT input
  // succeeds under `separate` -- is now the wrong thing to guarantee. The
  // assertion is flipped in place rather than the test deleted: the
  // history of why `separate` was ever exempt is worth keeping on record,
  // reusing the same input, in the same spot, rather than vanishing
  // silently. The surviving half of the old guarantee -- that PLACEMENT
  // under `separate` is still untouched -- is pinned separately, in the
  // "sex mode: separate" describe block below, on a roster this guard does
  // not refuse.
  it('separate now refuses when a student being grouped has no sex set, same as mix', () => {
    const out = buildGroups(
      base({
        students: [M(1), F(2), student({ number: 3 })],
        mode: { kind: 'groupCount', count: 1 },
        sexMode: 'separate',
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.sexNeedsAllSet,
      students: [3],
    });
  });

  // Correction 1: `sexOf` reads only the block's FIRST present-order member
  // -- it does not check that every member of a together-block agrees on
  // sex. So this boy-girl buddy pair does NOT fall into `rest` (that only
  // happens for a NULL first-member sex, and the guard below has already
  // ruled out every present student having a null sex by the time
  // `weaveBySex` runs -- `rest` is provably unreachable from `mix`; see
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "mix: sexOf and what rest actually means"). It is silently classified
  // by whichever sex its first
  // member is. This is the same "one representative member speaks for the
  // whole block" shortcut `keepApartImpossible`'s naming already takes
  // (`blocks[b].find(...) ?? blocks[b][0]`), not a new one this task
  // invents.
  //
  // WHAT THIS PROVES, AND WHAT IT DOES NOT. It proves a mixed-sex
  // together-block does not trip the unset-sex guard (both members here
  // have a sex, just different ones) and does not break the together
  // constraint. It does NOT prove which bucket (`boys` or `girls`)
  // `weaveBySex` put the block in -- that is an implementation detail this
  // test deliberately does not pin, because the brief only commits to "the
  // only honest thing to do", not to a specific classification.
  //
  // NO MUTATION OF THE CLASSIFICATION LOGIC MAKES THIS TEST FAIL. Tried:
  // reading the block's LAST member instead of the first (`sexOf` keyed off
  // `blocks[b][blocks[b].length - 1]`) -- still ok:true, together still
  // holds, because this test does not assert which bucket either member's
  // sex put the block in. Only a change that CRASHES (a null-unsafe read)
  // or that BREAKS the together invariant would redden this -- both of
  // which every other test that calls buildGroups would also catch, so
  // this test earns its place as documentation of the edge case and a
  // guard against a specific plausible bug (a per-MEMBER classification
  // that double-adds a block into both `boys` and `girls`, corrupting
  // `order` with a duplicate block index), not as a pin on `sexOf`'s
  // specific choice of representative.
  it('places a together-block spanning both sexes without crashing or refusing it', () => {
    const out = buildGroups(
      base({
        students: [
          student({ number: 1, sex: 'M', together: 'A' }),
          student({ number: 2, sex: 'F', together: 'A' }),
          student({ number: 3, sex: 'M' }),
          student({ number: 4, sex: 'F' }),
        ],
        mode: { kind: 'groupCount', count: 2 },
        sexMode: 'mix',
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const host = groupOf(out.result.groups, 1);
    expect(host?.map((s) => s.number)).toContain(2); // the together-letter still binds
  });

  // Correction 4: deliberate ordering, not the brief's position kept by
  // default -- see
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "Why it fires before mode and rule validation" for the full reasoning.
  // In short: this
  // guard is a caller-contract violation (stage 2 disables the mix switch
  // until every present student already has a sex, so a real teacher
  // cannot reach it), while an invalid group count and a together/apart
  // clash are things a teacher can genuinely type. It still fires FIRST, on
  // the same footing as duplicateNumber and noStudents earlier in
  // buildGroups: all three ask "is this roster's data usable" before
  // anything downstream spends effort validating the requested shape or
  // the rules' self-consistency.
  describe('the unset-sex guard fires before checks a teacher can actually trigger', () => {
    it('wins over an invalid group count', () => {
      const out = buildGroups(
        base({
          students: [M(1), student({ number: 2 })],
          mode: { kind: 'groupCount', count: 0 }, // also invalid, on its own
          sexMode: 'mix',
        }),
      );
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error.code).toBe(ERROR_CODES.sexNeedsAllSet);
    });

    it('wins over a together/apart clash', () => {
      const out = buildGroups(
        base({
          students: [
            student({ number: 1, sex: 'M', together: 'A', apart: 'X' }),
            student({ number: 2, sex: 'F', together: 'A', apart: 'X' }), // also a clash, on its own
            student({ number: 3 }), // unset sex
          ],
          mode: { kind: 'groupCount', count: 2 },
          sexMode: 'mix',
        }),
      );
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error.code).toBe(ERROR_CODES.sexNeedsAllSet);
    });
  });

  // Fix round 1, F-1: the shipped weave's alternation (`woven[i] = boys[i],
  // girls[i]`) exhausts the shorter list partway through and appends the
  // REMAINDER of the longer one as one contiguous run, which `assign`'s
  // ascending first-fit then seats as a single-sex group -- every seed, not
  // an unlucky one. Both tests above this point use a group size of 2 with
  // balanced sexes, where the alternation period equals the group size, so
  // the tail can never span a whole group -- structurally blind to this
  // bug. These two are not: group sizes 3 and 4, sexes 2-and-4 and 4-and-8.
  //
  // Measured directly against the pre-fix build (commit 1a6a23e, before this
  // fix round touched `weaveBySex`): this exact roster landed the ideal
  // {1M2F, 1M2F} -- the only split these numbers allow -- ZERO times in 200
  // seeds under `mix`, while `off` (no weave at all) landed it 107 times.
  // The feature made its own goal LESS likely than not shipping it. Full
  // reproduction across all five roster shapes the review named (this one
  // plus four more) is in
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "The five-shape table".
  it('reaches the split the numbers allow, at a group size the alternation bug could not hide behind', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
    for (const seed of seeds) {
      const out = buildGroups(
        base({
          students: [M(1), M(2), F(3), F(4), F(5), F(6)],
          mode: { kind: 'groupCount', count: 2 },
          sexMode: 'mix',
          random: seeded(seed),
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const boysPerGroup = out.result.groups
        .map((g) => g.filter((s) => s.sex === 'M').length)
        .sort((a, b) => a - b);
      expect(boysPerGroup).toEqual([1, 1]);
    }
  });

  // The uneven-division counterpart, at a group size the old bug could also
  // hide behind (this one is 4, not 2): 4 boys cannot split evenly across 3
  // groups of 4, so the best achievable is two groups with 1 boy and one
  // with 2 -- sorted, [1, 1, 2] -- never a group with none.
  //
  // Measured against the pre-fix build: this roster landed boys-per-group
  // [0, 2, 2] -- a group with NO boy at all -- on all 200 of 200 seeds under
  // `mix`; [1, 1, 2] is what it lands on 200 of 200 seeds now. `off` reaches
  // [1, 1, 2] only 115 of 200 times. Full table in
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "The five-shape table".
  it('reaches the best achievable split when boys do not divide evenly, at a group size the bug could also hide behind', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
    for (const seed of seeds) {
      const out = buildGroups(
        base({
          students: [
            M(1),
            M(2),
            M(3),
            M(4),
            F(5),
            F(6),
            F(7),
            F(8),
            F(9),
            F(10),
            F(11),
            F(12),
          ],
          mode: { kind: 'groupCount', count: 3 },
          sexMode: 'mix',
          random: seeded(seed),
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const boysPerGroup = out.result.groups
        .map((g) => g.filter((s) => s.sex === 'M').length)
        .sort((a, b) => a - b);
      expect(boysPerGroup).toEqual([1, 1, 2]);
    }
  });

  // Fix round 1, F-3: both variety tests earlier in this file use
  // singleton-block rosters. The regression that cost this project two fix
  // rounds (Task 4, "varies which students land together across seeds") was
  // specifically a together-block roster collapsing to a single arrangement
  // -- nothing above this point would notice that happening again under
  // `mix`.
  //
  // Three boy-pairs and six girl-pairs (18 students, 9 blocks) into 3 groups
  // of 6: the ratio merge weaves 1 boy-block for every 2 girl-blocks (nb=3,
  // ng=6 divides evenly), so every group lands 2M4F, deterministically --
  // confirmed on this exact roster, all 200 seeds below, matching Fix round
  // 1's own point about a correct SHAPE. What varies is WHICH boy-pair and
  // WHICH two girl-pairs share a group: assigning 6 girl-blocks into 3
  // designated pairs (one per boy-block) is a multinomial count, 6! / (2! 2!
  // 2!) = 90 distinct partitions, the theoretical maximum. Measured on this
  // build: 78 distinct partitions over these 200 seeds. Asserting > 30
  // leaves well over half of that measured headroom, matching this file's
  // own convention elsewhere.
  //
  // PROVEN BY MUTATION, not by a pre-fix comparison: this roster's
  // boys-per-group shape is ALSO wrong before this fix round (that is Fix
  // round 1's own point, pinned by the two tests above), but the pre-fix
  // weave still produces plenty of distinct partitions on it -- 127 of 200,
  // even more than the fixed build's 78 -- because raw partition count and a
  // correct sex balance are different claims. A "reddens pre-fix" comparison
  // on partition count alone would not have caught a collapse here, so it
  // would not prove this test guards one.
  //
  // What DOES collapse it: weaving in fixed block-index order instead of the
  // shuffled order --
  //   weaveBySex(blocks, present, shuffledOrder.slice().sort((a, b) => a - b))
  // in place of `weaveBySex(blocks, present, shuffledOrder)` at the
  // `weaveBySex` call site in `placeBlocks` -- applied and run against
  // exactly this test: 1 distinct partition over these 200 seeds, not 78 (a
  // wrong-answer failure, not a crash). The shape stayed correct (2M4F every
  // group, every seed) because the shape comes from the ratio merge's
  // counting, not from the shuffle -- only WHO fills each slot collapsed,
  // which is exactly what this test exists to catch. Mutant reverted before
  // committing; see
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "Together-block shapes, and mutation evidence" for this run recorded
  // alongside the others.
  it('varies which buddy-pairs share a group across seeds, under mix', () => {
    const students: Student[] = [
      ...['A', 'B', 'C'].flatMap((letter, gi) =>
        Array.from({ length: 2 }, (_, k) =>
          student({ number: gi * 2 + k + 1, sex: 'M', together: letter }),
        ),
      ),
      ...['D', 'E', 'F', 'G', 'H', 'I'].flatMap((letter, gi) =>
        Array.from({ length: 2 }, (_, k) =>
          student({ number: 6 + gi * 2 + k + 1, sex: 'F', together: letter }),
        ),
      ),
    ];
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const partitions = new Set(
      seeds.map((seed) => {
        const { groups } = ok(
          base({
            students,
            mode: { kind: 'groupCount', count: 3 },
            sexMode: 'mix',
            random: seeded(seed),
          }),
        );
        return groups
          .map((g) =>
            g
              .map((s) => s.number)
              .sort((a, b) => a - b)
              .join('.'),
          )
          .sort()
          .join(' | ');
      }),
    );
    expect(partitions.size).toBeGreaterThan(30);
  });

  // Fix round 1, F-2: `boys`/`girls`/`rest` were three FILTERS, not a
  // partition. `rest` only ever caught `sex === null`, so anything else off
  // the `'M' | 'F' | null` domain -- `undefined`, `''`, `'m'`, `'male'`, `0`,
  // anything a non-TypeScript caller might send; this repo has no runtime
  // type checker (see the module doc) -- fell into NONE of the three lists
  // and never reached `order`. `assign` only ever places what `order` hands
  // it, so that student was placed nowhere and simply did not appear in the
  // result: `ok: true`, one student short, no error to explain why.
  describe('a sex value outside M/F/null (Fix round 1, F-2)', () => {
    // This is the same "nobody lost, nobody invented" invariant the
    // "invariants that must hold for ANY input" describe block pins at the
    // buildGroups level, earlier in this file. Pointing that exact sweep at
    // this bug is not possible: it drives bare student COUNTS, where every
    // student's `sex` is `null` by construction (see the `anonymous` factory
    // in grouping.ts), and the guard below now refuses `null` under `mix`
    // same as any other off-domain value -- there is no roster shape that
    // sweep can express which would even reach `weaveBySex`. This pins the
    // same invariant directly on `weaveBySex`, which is where the loss
    // actually happened, using the identical assertion idiom.
    it('weaveBySex never drops a block, whatever `sex` holds', () => {
      const badSexes: unknown[] = [
        'M',
        'F',
        null,
        undefined,
        '',
        'm',
        'male',
        0,
      ];
      const present: Student[] = badSexes.map((sex, i) =>
        student({ number: i + 1, sex: sex as Student['sex'] }),
      );
      const blocks = present.map((_, i) => [i]);
      const indices = present.map((_, i) => i);

      const woven = grouping.weaveBySex(blocks, present, indices);

      expect(woven).toHaveLength(indices.length); // nobody lost or invented
      expect(new Set(woven).size).toBe(indices.length); // nobody duplicated
      expect([...woven].sort((a, b) => a - b)).toEqual(indices); // exactly this set
    });

    // Measured against the pre-fix build: `sex: undefined` on one student in
    // a 6-student roster returned `ok: true` with FIVE students -- student 3
    // simply gone, no error, a teacher would have printed that roster.
    // `''`, `'m'`, `'male'` and `0` all slipped past the OLD guard
    // (`s.sex === null`) the same way, for the same reason: none of them
    // `=== null`. Full output in
    // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
    // "What slipped through before the fix".
    it.each([
      ['undefined', undefined],
      ['an empty string', ''],
      ["'m'", 'm'],
      ["'male'", 'male'],
      ['0', 0],
    ])('refuses a sex of %s, not just literal null', (_label, badSex) => {
      const out = buildGroups(
        base({
          students: [
            M(1),
            F(2),
            student({ number: 3, sex: badSex as unknown as Student['sex'] }),
          ],
          mode: { kind: 'groupCount', count: 1 },
          sexMode: 'mix',
        }),
      );
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error).toEqual({
        code: ERROR_CODES.sexNeedsAllSet,
        students: [3],
      });
    });
  });
});

// Task 8a: the warnings channel. GroupingOutcome's success arm gains
// `warnings`, alongside `groups`. Task 8a itself never emitted one --
// WARNING_CODES.sexSpillover was defined but unreachable through
// buildGroups until Task 8b's separate-mode placement (below) landed. This
// specific roster (2 boys, 2 girls, 2 groups) still carries an empty list
// under every sexMode even after Task 8b: it divides evenly, so `separate`
// has nobody to spill. A roster that DOES spill is covered in "sex mode:
// separate" below, where `warnings` is no longer always `[]`.
describe('the warnings channel', () => {
  it.each(['off', 'mix', 'separate'] as const)(
    'every current success carries an empty warnings list (sexMode: %s)',
    (sexMode) => {
      const M = (number: number) => student({ number, sex: 'M' });
      const F = (number: number) => student({ number, sex: 'F' });
      const out = buildGroups(
        base({
          students: [M(1), M(2), F(3), F(4)],
          mode: { kind: 'groupCount', count: 2 },
          sexMode,
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      // The exact shape, not just an empty array wherever a caller happened
      // to look -- a stray extra key on `result` has no type checker to
      // catch it in this repo (see the module doc), so it is checked here.
      expect(Object.keys(out.result).sort()).toEqual(['groups', 'warnings']);
      expect(out.result.warnings).toEqual([]);
    },
  );
});

// Task 8a widened the unset-sex guard to cover `separate` (see the flipped
// tripwire in "sex mode: mix", 'separate now refuses when a student being
// grouped has no sex set, same as mix') and built the warnings channel
// ahead of time. Task 8b (this block) is the placement work itself:
// `sexSeparateSplitsUnit`, splitting each sex's blocks and running the
// existing machinery once per side, the proportional group-count
// allocation under `groupCount`, the spill, and the warning it emits.
//
// `separate` no longer places "exactly like off" -- that was Task 8a's
// deliberate placeholder (see its own now-superseded test, replaced here),
// not a guarantee this task keeps. The byte-identical guarantee that DOES
// still hold -- `off` and `mix` are unaffected by any of this -- is
// verified separately; see the report for the method and case count (a
// one-off before/after diff, not a permanent test here, because a test
// cannot diff itself against "the code before this commit").
describe('sex mode: separate', () => {
  const M = (number: number) => student({ number, sex: 'M' });
  const F = (number: number) => student({ number, sex: 'F' });

  describe('a together-unit spanning both sexes is a contradiction under separate', () => {
    // Ana and Budi are bound together (letter A) but marked different
    // sexes -- single-sex groups and "these two are one unit" cannot both
    // be honoured, so this is refused before placement runs, not resolved
    // by picking a side silently.
    it('refuses a together-unit that spans both sexes', () => {
      const out = buildGroups(
        base({
          students: [
            student({ number: 1, name: 'Ana', sex: 'F', together: 'A' }),
            student({ number: 2, name: 'Budi', sex: 'M', together: 'A' }),
            M(3),
            F(4),
          ],
          mode: { kind: 'groupCount', count: 2 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error).toEqual({
        code: ERROR_CODES.sexSeparateSplitsUnit,
        students: [1, 2],
      });
    });

    // The same roster is fine under the OTHER two modes: `mix` places boys
    // and girls together on purpose, and `off` does not look at sex at
    // all, so a together-block spanning both sexes is not a contradiction
    // for either. This proves the new check is scoped to `separate`, not
    // leaking into the other two -- it does not go red before
    // implementation (neither mode is touched by this task), so it is a
    // scoping guard against a future regression, not a feature pin.
    it('allows that same mixed unit under mix, and under off', () => {
      for (const sexMode of ['mix', 'off'] as const) {
        const out = buildGroups(
          base({
            students: [
              student({ number: 1, sex: 'F', together: 'A' }),
              student({ number: 2, sex: 'M', together: 'A' }),
              M(3),
              F(4),
            ],
            mode: { kind: 'groupCount', count: 2 },
            sexMode,
          }),
        );
        expect(out.ok, `sexMode ${sexMode}`).toBe(true);
      }
    });
  });

  describe('perGroup: each sex forms its own groups of the requested size', () => {
    it('makes single-sex groups when the numbers divide', () => {
      const out = buildGroups(
        base({
          students: [M(1), M(2), M(3), M(4), F(5), F(6), F(7), F(8)],
          mode: { kind: 'perGroup', size: 4 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      for (const g of out.result.groups) {
        expect(new Set(g.map((s) => s.sex)).size).toBe(1);
      }
      expect(out.result.warnings).toEqual([]);
    });

    // Six boys and two girls into groups of 4: the boys make one group and
    // the girls cannot make one of their own, so the two girls join the
    // boys' single group and are named in a warning. Also pins the
    // resulting shape (one group of all eight), not just the warning --
    // the brief's own append-style description ("join the smallest
    // resulting group") reduces to "the only group" when the host side has
    // just one.
    it('warns and names who lands in a group of the other sex', () => {
      const out = buildGroups(
        base({
          students: [M(1), M(2), M(3), M(4), M(5), M(6), F(7), F(8)],
          mode: { kind: 'perGroup', size: 4 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.result.groups).toHaveLength(1);
      expect(
        out.result.groups[0].map((s) => s.number).sort((a, b) => a - b),
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(out.result.warnings).toEqual([
        { code: WARNING_CODES.sexSpillover, students: [7, 8], sex: 'F' },
      ]);
    });

    // An all-boys roster: girls simply have no members, which is not a
    // spill (nobody was left out of a group of their own -- there is no
    // "their own" to compare against). Regression guard for the fix noted
    // in the report: a side with a genuine allocation of zero groups
    // because it has zero MEMBERS must not be confused with a side that
    // has members but too few of them.
    //
    // Fix round 1, F-3: recorded here, not just in the report, that this
    // does NOT go red before implementation -- `off` already produces this
    // exact shape for an all-one-sex roster (no sex-based branch in
    // `buildSeparateGroups` has anything to DO when the other sex has zero
    // members: every warning gate in that function is conditioned on both
    // sexes having members), so this test was an early pass, not a proof
    // the feature works. It is kept as the regression guard the comment
    // above describes.
    it('a roster that is entirely one sex places with no warning', () => {
      const out = buildGroups(
        base({
          students: [M(1), M(2), M(3), M(4)],
          mode: { kind: 'perGroup', size: 2 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.result.groups).toHaveLength(2);
      expect(out.result.warnings).toEqual([]);
    });
  });

  describe('groupCount: the requested total is allocated between the sexes proportionally by headcount', () => {
    // The task's own worked example: 12 boys and 8 girls asked for 4
    // groups. Single-sex groups sized independently per side (12/5 and 8/5)
    // would want 3 boy-groups and 2 girl-groups -- five, not four. The
    // teacher typed 4, so 4 is what they get: largest-remainder allocation
    // by headcount gives boys 2.4 -> 2 and girls 1.6 -> 2 (girls' larger
    // fractional remainder claims the rounding unit), summing to exactly
    // 4. Every group single-sex, nobody spills.
    it('splits 2-and-2 by headcount share, not 3-and-2 by an independently sized per-sex group count', () => {
      const students = [
        ...Array.from({ length: 12 }, (_, i) => M(i + 1)),
        ...Array.from({ length: 8 }, (_, i) => F(i + 13)),
      ];
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'groupCount', count: 4 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.result.warnings).toEqual([]);
      expect(shape(out.result.groups)).toEqual([6, 6, 4, 4]);
      for (const g of out.result.groups) {
        expect(new Set(g.map((s) => s.sex)).size).toBe(1);
      }
    });

    // The allocation must sum to exactly what was typed, on every split --
    // not just the one worked example above. This is the property largest-
    // remainder exists to guarantee (plain rounding of each side
    // independently can under- or over-shoot the total). It does NOT go
    // red before implementation: today's `separate` (== `off`) also always
    // returns exactly `mode.count` groups, because `off` never splits by
    // sex in the first place, so the group COUNT this asserts is trivially
    // right for a reason that has nothing to do with sex. It is kept
    // anyway because it is the most direct check of the "sums exactly"
    // claim, and it is the guarantee the report cites; "splits 2-and-2..."
    // above and the spill test below are what actually distinguish this
    // implementation from the old placeholder.
    it('the allocated group counts always sum to exactly the number requested, swept across many splits', () => {
      const combos: Array<[boys: number, girls: number, count: number]> = [
        [12, 8, 4],
        [1, 99, 50],
        [1, 99, 1],
        [33, 17, 10],
        [5, 5, 3],
        [1, 1, 1],
        [7, 93, 25],
        [50, 50, 20],
        [3, 97, 40],
        [19, 81, 33],
      ];
      for (const [boys, girls, count] of combos) {
        const students = [
          ...Array.from({ length: boys }, (_, i) => M(i + 1)),
          ...Array.from({ length: girls }, (_, i) => F(i + 1 + boys)),
        ];
        const label = `boys=${boys} girls=${girls} count=${count}`;
        const out = buildGroups(
          base({
            students,
            mode: { kind: 'groupCount', count },
            sexMode: 'separate',
            random: seeded(1),
          }),
        );
        expect(out.ok, label).toBe(true);
        if (!out.ok) continue;
        expect(out.result.groups.length, label).toBe(count);
      }
    });

    // A concrete spill under `groupCount`, not just `perGroup`: 28 boys and
    // 2 girls asked for 5 groups. Girls' proportional share (5 * 2/30 =
    // 0.33) floors to zero, so they spill into the boys' 5 groups -- the
    // SAME rule as the perGroup spill above, just reached via the
    // allocation instead of a direct size comparison (see the report for
    // why one rule serves both).
    it('spills the smaller sex when its proportional share floors to zero groups', () => {
      const students = [
        ...Array.from({ length: 28 }, (_, i) => M(i + 1)),
        F(29),
        F(30),
      ];
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'groupCount', count: 5 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.result.groups).toHaveLength(5);
      expect(out.result.warnings).toEqual([
        { code: WARNING_CODES.sexSpillover, students: [29, 30], sex: 'F' },
      ]);
    });

    // A together-unit sized for its OWN side's largest group, but bigger
    // than the WHOLE ROSTER's -- proves togetherUnitTooLarge is checked
    // per side under `separate`, not against the whole-roster `sizes` the
    // way `off`/`mix` use. 33 boys and 17 girls asked for 10 groups: raw
    // shares are 6.6 and 3.4, both floors (6 and 3) sum to 9, leaving one
    // group to allocate; boys' fractional remainder (0.6) is the larger of
    // the two, and the one leftover group goes to whichever fraction is
    // LARGER, so boys claims it -- 7-and-3, not 6-and-4. Girls' own sizing
    // at count 3 (targetSizes(17, {count:3}, 'spread')) is [6, 6, 5] -- a
    // largest group of 6 -- while the whole roster's sizing at count 10
    // (targetSizes(50, {count:10})) is ten groups of 5, largest 5. A
    // together-block of exactly 6 girls fits the former and would be
    // wrongly refused by the latter.
    //
    // Fix round 1, F-3: recorded here, not just in the report, that this
    // test never went through a RED phase at all -- it was added AFTER
    // implementation, once reasoning through "each side's own sizes can
    // diverge from the whole roster's" surfaced the gap the comment above
    // describes. It is proven by mutation instead: removing the
    // `sexMode !== 'separate'` guard on the pre-existing whole-roster
    // `togetherUnitTooLarge` check reddens this test (the 6-girl unit gets
    // wrongly refused against the whole roster's largest group of 5), with
    // a genuine wrong-value failure, never a crash.
    it("checks a together-unit against its OWN side's largest group, not the whole roster's", () => {
      const students = [
        ...Array.from({ length: 33 }, (_, i) => M(i + 1)),
        student({ number: 34, sex: 'F' as const, together: 'Z' }),
        student({ number: 35, sex: 'F' as const, together: 'Z' }),
        student({ number: 36, sex: 'F' as const, together: 'Z' }),
        student({ number: 37, sex: 'F' as const, together: 'Z' }),
        student({ number: 38, sex: 'F' as const, together: 'Z' }),
        student({ number: 39, sex: 'F' as const, together: 'Z' }),
        ...Array.from({ length: 11 }, (_, i) => F(i + 40)),
      ];
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'groupCount', count: 10 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const host = groupOf(out.result.groups, 34);
      for (const n of [35, 36, 37, 38, 39]) {
        expect(host?.some((s) => s.number === n)).toBe(true);
      }
    });

    // Fix round 1, F-1. The reviewer's own counter-example to a single
    // proportional guess, and the case that motivated turning
    // `allocateSexGroups` into a search: 12 boys, 8 girls (5 of them bound
    // together), 4 groups requested. Proportional gives 2-and-2; 8 girls
    // over 2 groups is sizes [4, 4], and the 5-strong unit does not fit
    // either -- the OLD code refused here (confirmed against the pre-fix
    // engine as part of the report's before/after verification). 3-and-1
    // -- boys claim 3 groups of 4, girls get ONE group of all 8, which
    // holds the unit easily -- satisfies every rule the teacher stated,
    // and `allocationCandidates` finds it at distance 1 from proportional.
    // Proven by mutation, not just this test passing: see the report.
    it('finds 3-and-1 when proportional 2-and-2 would refuse a together-unit, instead of refusing (Fix round 1, F-1)', () => {
      const students = [
        ...Array.from({ length: 12 }, (_, i) => M(i + 1)),
        ...Array.from({ length: 5 }, (_, i) =>
          student({ number: i + 13, sex: 'F', together: 'Z' }),
        ),
        F(18),
        F(19),
        F(20),
      ];
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'groupCount', count: 4 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.result.warnings).toEqual([]);
      expect(shape(out.result.groups)).toEqual([8, 4, 4, 4]);
      const girlUnit = groupOf(out.result.groups, 13);
      for (const n of [13, 14, 15, 16, 17]) {
        expect(girlUnit?.some((s) => s.number === n)).toBe(true);
      }
      for (const g of out.result.groups) {
        expect(new Set(g.map((s) => s.sex)).size).toBe(1);
      }
    });
  });

  // Fix round 1, F-2. Every candidate `allocationCandidates` offers fails:
  // six boys who must all be kept apart from each other need six groups,
  // and no split of 3 requested groups between the sexes ever gives boys
  // more than 2 (see `allocationCandidates`'s own headcount bound). This
  // is the genuinely impossible remainder F-1's search does not rescue --
  // and it must not lie about why, the way a side-scoped
  // `keepApartImpossible` ("you need at least 6 groups") would once
  // several different splits have already been tried and rejected: the
  // teacher typed 3, not 6, and no single split is "the" reason every one
  // of them failed.
  describe('when every allocation fails: reports sexSeparateImpossible, not a side-scoped number (Fix round 1, F-2)', () => {
    const sixBoysMutuallyApart = [
      student({ number: 1, sex: 'M' as const, apart: 'X' }),
      student({ number: 2, sex: 'M' as const, apart: 'X' }),
      student({ number: 3, sex: 'M' as const, apart: 'X' }),
      student({ number: 4, sex: 'M' as const, apart: 'X' }),
      student({ number: 5, sex: 'M' as const, apart: 'X' }),
      student({ number: 6, sex: 'M' as const, apart: 'X' }),
      F(7),
      F(8),
      F(9),
      F(10),
      F(11),
      F(12),
    ];

    it("reports the number the teacher typed, not any side's own allocation", () => {
      const out = buildGroups(
        base({
          students: sixBoysMutuallyApart,
          mode: { kind: 'groupCount', count: 3 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error).toEqual({
        code: ERROR_CODES.sexSeparateImpossible,
        groupsRequested: 3,
      });
    });

    // The assertion is on the SENTENCE, not the code -- a wrong number
    // reaching a teacher is exactly what this finding is about.
    it('renders the exact sentence naming the typed count and both remedies, in both languages', () => {
      const out = buildGroups(
        base({
          students: sixBoysMutuallyApart,
          mode: { kind: 'groupCount', count: 3 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(renderError(out.error, en)).toBe(
        'Boys and girls cannot be kept in separate groups across 3 groups while also satisfying your other rules. The search cannot tell which rule is the problem, so try either remedy: ask for more groups, or turn this mode off.',
      );
      expect(renderError(out.error, id)).toBe(
        'Laki-laki dan perempuan tidak bisa tetap berada di kelompok terpisah dalam 3 kelompok sekaligus memenuhi aturan Anda yang lain. Pencarian ini tidak bisa memastikan aturan mana yang jadi masalah, jadi coba salah satu perbaikan ini: minta lebih banyak kelompok, atau matikan mode ini.',
      );
    });
  });

  // Reachable only under `perGroup` -- see the report for the proof that
  // largest-remainder allocation under `groupCount` can never give BOTH
  // sides zero groups while both have members (the single leftover group
  // always has somewhere to go). Under `perGroup`, a size bigger than
  // BOTH sexes' own headcount gives both a floored group count of zero.
  describe('when neither sex has enough for even one group of its own (perGroup only)', () => {
    it('falls back to one combined group and warns about both sexes', () => {
      const students = [
        M(1),
        M(2),
        M(3),
        M(4),
        M(5),
        M(6),
        F(7),
        F(8),
        F(9),
        F(10),
        F(11),
        F(12),
      ];
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'perGroup', size: 10 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.result.groups).toHaveLength(1);
      expect(
        out.result.groups[0].map((s) => s.number).sort((a, b) => a - b),
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      const bySex = (sex: 'M' | 'F') =>
        out.result.warnings.find((w) => w.sex === sex);
      expect(bySex('M')).toEqual({
        code: WARNING_CODES.sexSpillover,
        students: [1, 2, 3, 4, 5, 6],
        sex: 'M',
      });
      expect(bySex('F')).toEqual({
        code: WARNING_CODES.sexSpillover,
        students: [7, 8, 9, 10, 11, 12],
        sex: 'F',
      });
      expect(out.result.warnings).toHaveLength(2);
    });

    // The neighbouring case that must NOT be confused with the one above:
    // one sex is entirely absent, and the other is too small for the
    // requested size. Both sides still compute an allocation of zero
    // groups (the same condition that triggers the fallback above), but
    // there is no OTHER sex for anyone to have "spilled" into -- this is
    // just an undersized single-sex group, exactly what `off` would do
    // with the same roster. No warning: nobody's outcome changed because
    // of their sex. Does not go red before implementation -- old
    // `separate` (== `off`) already produces this exact shape, since
    // there is only one possible group either way; it pins the fix
    // described in the report (a naive "both allocations are zero" check,
    // without also requiring both sexes to have members, would have
    // wrongly warned a same-sex roster about a sex that is not there).
    it('a lone sex too small for the requested size places with no warning -- there is no other sex to have joined', () => {
      const out = buildGroups(
        base({
          students: [M(1), M(2), M(3)],
          mode: { kind: 'perGroup', size: 10 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.result.groups).toHaveLength(1);
      expect(
        out.result.groups[0].map((s) => s.number).sort((a, b) => a - b),
      ).toEqual([1, 2, 3]);
      expect(out.result.warnings).toEqual([]);
    });
  });

  // The apart-rule hole the brief leaves silent: placing each sex
  // independently makes a cross-sex apart-conflict satisfied for free,
  // EXCEPT for a spilled student, who joins the other sex's placement and
  // can be seated next to someone they must be kept apart from if that
  // conflict is not carried into the spill. See the report for the full
  // reasoning; these two tests are the evidence it holds.
  describe('the apart-rule at the spill boundary', () => {
    // Twelve boys (three groups of four) and two girls who must spill.
    // Multiple destination groups exist, so there is a real choice of
    // where the spill lands, not just one forced slot -- M1 and F13 are
    // marked apart, and across every seed the search must route around
    // that, never seat them together by chance.
    //
    // Does not go red before implementation FOR A SUBTLE REASON worth
    // recording: old `separate` (== `off`) already enforces apart-letters
    // for the whole roster, sex-blind, so M1 and F13 were never seated
    // together under the old code either -- just via a completely
    // different mechanism (one placement pass over everyone) than the one
    // this task builds (independent per-side placement, with the conflict
    // carried across at the spill). Mutation evidence in the report proves
    // THIS implementation's own carrying-across is what this test is
    // actually pinned on, not a coincidence inherited from the old code.
    it('never seats a spilled student beside someone they must be kept apart from, swept across seeds', () => {
      const students = [
        student({ number: 1, sex: 'M', apart: 'X' }),
        ...Array.from({ length: 11 }, (_, i) => M(i + 2)), // M2..M12
        student({ number: 13, sex: 'F', apart: 'X' }),
        F(14),
      ];
      for (let seed = 1; seed <= 30; seed++) {
        const out = buildGroups(
          base({
            students,
            mode: { kind: 'perGroup', size: 4 },
            sexMode: 'separate',
            random: seeded(seed),
          }),
        );
        expect(out.ok, `seed ${seed}`).toBe(true);
        if (!out.ok) continue;
        const g1 = groupOf(out.result.groups, 1);
        expect(g1, `seed ${seed}`).not.toBeUndefined();
        expect(
          g1?.some((s) => s.number === 13),
          `seed ${seed}`,
        ).toBe(false);
      }
    });

    // Four boys fill the one group their own size allows exactly (size 4,
    // 4 boys); one girl must spill, and that group is the ONLY group there
    // is -- so however she is routed, she lands beside every boy, and one
    // of them (M1) is exactly who she must be kept apart from. No
    // arrangement can honour the rule, so it must be REPORTED, not
    // silently ignored: reuses the same keepApartImpossible vocabulary
    // `off`/`mix` already use for "an exhaustive check proved this
    // impossible", now reached from the per-side search instead of the
    // whole-roster one.
    //
    // Also does not go red before implementation, for the same reason as
    // the sibling case immediately above: with only one group possible
    // either way, old `separate` (== `off`) already refuses this input via
    // its own whole-roster clique check. Mutation evidence in the report
    // shows this test's OWN per-side clique check firing, not a
    // hand-me-down from `off`'s.
    it('reports, not silently ignores, when the apart-rule cannot be honoured even after spilling', () => {
      const students = [
        student({ number: 1, sex: 'M', apart: 'X' }),
        M(2),
        M(3),
        M(4),
        student({ number: 5, sex: 'F', apart: 'X' }),
      ];
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'perGroup', size: 4 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error.code).toBe(ERROR_CODES.keepApartImpossible);
      if (out.error.code !== ERROR_CODES.keepApartImpossible) return;
      expect(new Set(out.error.students)).toEqual(new Set([1, 5]));
      expect(out.error.groupsNeeded).toBe(2);
    });
  });

  // Fix round 1: a gap this task's OWN verification found (not the
  // reviewer's, and not named in the brief) -- `allocationCandidates`
  // bounds every alternate split to each side's own headcount (see its
  // doc comment) specifically so a candidate can never hand a side more
  // groups than it has students. Nothing pinned that bound: mutating it
  // away (widening the range to the full, naive `[1, count - 1]`) passes
  // every other test in this file unchanged, and produces a REAL, silent
  // defect on the input below -- `ok: true` with six of ten groups empty
  // (three boys spread thin across the girls'-together-block-driven need
  // for nine boy-groups) -- proven directly, not assumed, before this test
  // was written.
  describe('allocationCandidates never proposes a split that would empty a group (Fix round 1, mutation-found gap)', () => {
    // 3 boys, no rules. 20 girls, 15 of them bound together -- that block
    // only fits a group of >= 15, which only ONE split gives girls (all 20
    // in a single group, i.e. girlsGroups = 1); every other girlsGroups
    // value shrinks the largest possible group below 15. girlsGroups = 1
    // needs boysGroups = 9 -- nine groups for three boys, six of them
    // necessarily empty. The naive, unbounded range would try exactly this
    // candidate (it IS one of the "count - 1 ways to divide"); the
    // headcount bound excludes it, so this must be refused, not silently
    // "succeed" with empty groups in the output.
    it('refuses rather than producing empty groups, when the only fit needs a side to exceed its own headcount', () => {
      const students = [
        M(1),
        M(2),
        M(3),
        ...Array.from({ length: 15 }, (_, i) =>
          student({ number: i + 4, sex: 'F', together: 'Z' }),
        ),
        F(19),
        F(20),
        F(21),
        F(22),
        F(23),
      ];
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'groupCount', count: 10 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error).toEqual({
        code: ERROR_CODES.sexSeparateImpossible,
        groupsRequested: 10,
      });
    });
  });

  // Fix round 1: closes the gap the reviewer named -- before this fix,
  // nothing in this file ever piped a `separate`-mode failure through
  // `renderError`. Every refusal above was checked structurally (code,
  // `students`, `groupsNeeded`) but never as the sentence a teacher
  // actually reads -- and a wrong number reaching a teacher is exactly
  // what these findings are about, so the assertion here is on the
  // sentence, not the code. `sexSeparateImpossible`'s own rendered-message
  // test lives with the rest of F-2's coverage above; the two here cover
  // the other refusal shapes `separate` can still produce.
  describe('rendered messages: separate-mode refusals read correctly, in both languages (Fix round 1)', () => {
    it('sex-separate-splits-unit renders the pair and both remedies, in both languages', () => {
      const out = buildGroups(
        base({
          students: [
            student({ number: 1, name: 'Ana', sex: 'F', together: 'A' }),
            student({ number: 2, name: 'Budi', sex: 'M', together: 'A' }),
            M(3),
            F(4),
          ],
          mode: { kind: 'groupCount', count: 2 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(renderError(out.error, en)).toBe(
        'Student 1, Student 2 are marked to stay together, but are not all the same sex, so they cannot form a single-sex group. Remove the together letter from one of them, or turn this mode off.',
      );
      expect(renderError(out.error, id)).toBe(
        'Siswa 1, Siswa 2 ditandai untuk disatukan, tetapi tidak semuanya berjenis kelamin sama, sehingga tidak bisa membentuk kelompok satu jenis kelamin. Hapus huruf yang menyatukan mereka, atau matikan mode ini.',
      );
    });

    // `perGroup`, unlike `groupCount`, has no single "number the teacher
    // asked for" to contradict -- the teacher stated a SIZE, and this
    // side-scoped `groupsNeeded: 2` is an honest, un-ambiguous fact about
    // the one attempt that was ever possible here (see the report). This
    // test is what shows that: the rendered sentence is correct as-is,
    // nothing about this refusal needed F-2's fix.
    it('keep-apart-impossible at the spill boundary renders correctly under perGroup, in both languages', () => {
      const students = [
        student({ number: 1, sex: 'M', apart: 'X' }),
        M(2),
        M(3),
        M(4),
        student({ number: 5, sex: 'F', apart: 'X' }),
      ];
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'perGroup', size: 4 },
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(false);
      if (out.ok) return;
      const enMsg = renderError(out.error, en);
      expect(enMsg).toBe(
        'Student 1, Student 5 all need to be kept apart from each other, so you would need at least 2 groups. Either make more groups or remove one of the rules.',
      );
      const idMsg = renderError(out.error, id);
      expect(idMsg).toBe(
        'Siswa 1, Siswa 5 semuanya harus dipisahkan satu sama lain, sehingga Anda membutuhkan minimal 2 kelompok. Tambah jumlah kelompok atau hapus salah satu aturannya.',
      );
    });
  });

  // Fix round 1, F-4. The spill's sizing threads `leftovers` through
  // (`sizesForCount` in `buildSeparateGroups`), but every existing spill
  // test above uses the default `'spread'` -- `'bunch'` was never
  // exercised under `separate` at all. No defect found; this closes the
  // gap.
  describe("leftovers: 'bunch' is exercised at the spill, not just 'spread' (Fix round 1, F-4)", () => {
    // 12 boys, 2 girls, groups of 4: boys make exactly 3 groups (12/4),
    // girls spill (2/4 floors to 0). `combined = sizesForCount(14, 3,
    // leftovers)` -- base 4 each, remainder 2 -- is where 'bunch' and
    // 'spread' actually diverge: with only 2 left over, a SINGLE-group
    // remainder (as every other spill test in this file happens to use)
    // cannot tell them apart at all ('spread' round-robins one leftover
    // into slot 0 exactly like 'bunch' does; they only disagree once the
    // remainder is 2 or more). Asserts the SIZE distribution only, not
    // which physical group the spilled girls land in -- `combined`'s sizes
    // are a pure function of (total, groupCount, leftovers), so this shape
    // is the same on every seed, but WHICH of the 14 same-cost,
    // conflict-free blocks fills the larger group is a first-fit-over-a-
    // shuffle question this test does not need to, and should not, pin.
    it("bunch: [6, 4, 4], not spread's [5, 5, 4], on the identical roster", () => {
      const students = [
        ...Array.from({ length: 12 }, (_, i) => M(i + 1)),
        F(13),
        F(14),
      ];
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'perGroup', size: 4 },
          leftovers: 'bunch',
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(shape(out.result.groups)).toEqual([6, 4, 4]);
      expect(out.result.warnings).toEqual([
        { code: WARNING_CODES.sexSpillover, students: [13, 14], sex: 'F' },
      ]);
    });

    // The contrasting case, same roster: 'spread' round-robins the
    // 2-student remainder across two DIFFERENT groups instead of piling
    // both into one. Confirms the fixture above actually distinguishes the
    // two `leftovers` values rather than producing the same shape either
    // way.
    it("contrasts with 'spread' on the identical roster", () => {
      const students = [
        ...Array.from({ length: 12 }, (_, i) => M(i + 1)),
        F(13),
        F(14),
      ];
      const out = buildGroups(
        base({
          students,
          mode: { kind: 'perGroup', size: 4 },
          leftovers: 'spread',
          sexMode: 'separate',
        }),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(shape(out.result.groups)).toEqual([5, 5, 4]);
    });
  });
});
