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
    expect(out.result.groups[0].map((s) => s.number).sort()).toEqual([
      1, 2, 3,
    ]);
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
