import { describe, it, expect } from 'vitest';
import {
  buildGroups,
  ERROR_CODES,
  MAX_STUDENTS,
  type GroupingInput,
} from '../../src/lib/grouping';
import * as grouping from '../../src/lib/grouping';
import { student, shape, groupOf, seeded } from './factories';

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
        // the brief's version unmodified (see task-4-report.md). count: 2 keeps
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
    // The reviewer's own repro (task-4-report.md, Fix round 1, F-1/F-3):
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
});
