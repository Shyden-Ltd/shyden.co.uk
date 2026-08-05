import { describe, it, expect } from 'vitest';
import {
  buildGroups,
  ERROR_CODES,
  type GroupingInput,
  type Student,
} from '../../src/lib/grouping';

/**
 * A seeded generator, so "random" is reproducible.
 *
 * Without this every assertion about leftovers, shuffling or "a random group"
 * is either flaky or so weak it proves nothing. The engine takes its random
 * source as a parameter precisely so tests can pin it. mulberry32 — small,
 * well-distributed, and deterministic for a given seed.
 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const base = (over: Partial<GroupingInput> = {}): GroupingInput => ({
  students: 22,
  mode: { kind: 'perGroup', size: 4 },
  leftovers: 'spread',
  keepApart: [],
  random: seeded(1),
  ...over,
});

/** Group sizes, largest first — the shape of a split, independent of who landed where. */
const shape = (groups: Student[][]): number[] =>
  groups.map((g) => g.length).sort((x, y) => y - x);

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

        const ids = groups.flat().map((s) => s.id);
        expect(new Set(ids).size).toBe(students); // nobody duplicated
        expect(ids).toHaveLength(students); // nobody lost or invented

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
    expect(all.map((s) => s.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('a name list keeps every name, including genuine duplicates', () => {
    // Two children really can share a first name; silently de-duplicating
    // would quietly drop a child from the class.
    const names = ['Ana', 'Budi', 'Ana', 'Citra'];
    const { groups } = ok(
      base({ students: names, mode: { kind: 'perGroup', size: 2 } }),
    );
    expect(
      groups
        .flat()
        .map((s) => s.name)
        .sort(),
    ).toEqual(['Ana', 'Ana', 'Budi', 'Citra']);
  });

  it('blank and whitespace-only lines are dropped, not turned into nameless students', () => {
    const { groups } = ok(
      base({
        students: ['Ana', '', '   ', 'Budi'],
        mode: { kind: 'perGroup', size: 2 },
      }),
    );
    expect(groups.flat()).toHaveLength(2);
  });
});

describe('buildGroups — keep-apart pairs', () => {
  const klass = [
    'Ana',
    'Budi',
    'Citra',
    'Dewi',
    'Eko',
    'Fitri',
    'Gita',
    'Hadi',
  ];

  it('separates a pair that must not share a group', () => {
    const { groups } = ok(
      base({
        students: klass,
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [['Ana', 'Budi']],
      }),
    );
    const together = groups.find(
      (g) =>
        g.some((s) => s.name === 'Ana') && g.some((s) => s.name === 'Budi'),
    );
    expect(together).toBeUndefined();
  });

  it('satisfies several constraints at once', () => {
    const { groups } = ok(
      base({
        students: klass,
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [
          ['Ana', 'Budi'],
          ['Citra', 'Dewi'],
          ['Ana', 'Citra'],
        ],
      }),
    );
    for (const [a, b] of [
      ['Ana', 'Budi'],
      ['Citra', 'Dewi'],
      ['Ana', 'Citra'],
    ]) {
      expect(
        groups.some(
          (g) => g.some((s) => s.name === a) && g.some((s) => s.name === b),
        ),
      ).toBe(false);
    }
  });

  it('reports impossibility and NAMES the students who conflict', () => {
    // 5 students who must all be separated cannot fit into 4 groups. The
    // failure has to say which students and how many groups are needed —
    // "could not generate groups" would leave the teacher with no next step.
    const out = buildGroups(
      base({
        students: klass,
        mode: { kind: 'perGroup', size: 2 }, // 8 students / 2 = 4 groups
        keepApart: [
          ['Ana', 'Budi'],
          ['Ana', 'Citra'],
          ['Ana', 'Dewi'],
          ['Ana', 'Eko'],
          ['Budi', 'Citra'],
          ['Budi', 'Dewi'],
          ['Budi', 'Eko'],
          ['Citra', 'Dewi'],
          ['Citra', 'Eko'],
          ['Dewi', 'Eko'],
        ],
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.keepApartImpossible);
    expect(out.error.students?.sort()).toEqual([
      'Ana',
      'Budi',
      'Citra',
      'Dewi',
      'Eko',
    ]);
    expect(out.error.groupsNeeded).toBe(5);
  });

  it('refuses a keep-apart name that is not in the class', () => {
    const out = buildGroups(
      base({
        students: klass,
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [['Ana', 'Zara']],
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.keepApartUnknownName);
    expect(out.error.students).toEqual(['Zara']);
  });

  it('refuses keep-apart when the class has no names to refer to', () => {
    const out = buildGroups(
      base({
        students: 8,
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [['Ana', 'Budi']],
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.keepApartNeedsNames);
  });
});

describe('buildGroups — refusals', () => {
  it.each([
    ['no students at all', base({ students: 0 }), ERROR_CODES.noStudents],
    ['an empty name list', base({ students: [] }), ERROR_CODES.noStudents],
    [
      'a name list of only blanks',
      base({ students: ['', '  '] }),
      ERROR_CODES.noStudents,
    ],
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

describe('buildGroups — randomness is real but reproducible', () => {
  it('the same seed gives the same arrangement', () => {
    const a = ok(base({ random: seeded(7) }));
    const b = ok(base({ random: seeded(7) }));
    expect(a.groups.map((g) => g.map((s) => s.id))).toEqual(
      b.groups.map((g) => g.map((s) => s.id)),
    );
  });

  it('different seeds actually shuffle — the engine is not returning a fixed order', () => {
    // Guards against a "shuffle" that does nothing, which every other test here
    // would happily pass.
    const arrangements = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
        JSON.stringify(
          ok(base({ random: seeded(s) })).groups.map((g) => g.map((x) => x.id)),
        ),
      ),
    );
    expect(arrangements.size).toBeGreaterThan(1);
  });
});
