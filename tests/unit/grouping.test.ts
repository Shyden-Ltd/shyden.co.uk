import { describe, it, expect } from 'vitest';
import {
  buildGroups,
  ERROR_CODES,
  MAX_STUDENTS,
  type GroupingInput,
  type Student,
} from '../../src/lib/grouping';
import * as grouping from '../../src/lib/grouping';

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
});

describe('buildGroups — TRANSITIONAL: keepApart silently drops what it cannot match', () => {
  // Pins CURRENT behaviour only, not desired behaviour. buildGroups used to
  // refuse a keepApart pair naming a student who is not on the roster, and
  // refuse outright when the class had no names at all — see the deleted
  // guard, finding I-2 in task-1-review.md. A letter-based rule cannot
  // produce either input, so removing the guard was correct, but that left
  // this path silently dropping the constraint with nothing pinning it.
  //
  // This test exists only to catch accidental drift before Task 2, which
  // deletes the `keepApart` field entirely — this whole describe block goes
  // with it at that point, not before.
  it('drops a pair naming a student who is not on the roster, without error', () => {
    const out = buildGroups(
      base({
        students: ['Ana', 'Budi'],
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [['Ana', 'Zara']],
      }),
    );
    expect(out.ok).toBe(true);
  });

  it('drops every pair when the class has no names to check against, without error', () => {
    const out = buildGroups(
      base({
        students: 8,
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [['Ana', 'Budi']],
      }),
    );
    expect(out.ok).toBe(true);
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

/**
 * Moon–Moser: `n / partSize` parts, every student in conflict with everyone
 * NOT in their own part. Max clique is one per part, but the number of
 * MAXIMUM cliques is partSize^(n/partSize) — the worst case for exact clique
 * search, and the shape a real keep-apart list takes when a teacher writes
 * "these three wind each other up, and those three, and those three".
 *
 * Measured against the uncapped engine: 24 students 27ms, 36 students 471ms,
 * 42 students 7.3s, 48 students 121.7s. A browser tab, not a test runner.
 */
const moonMoser = (n: number, partSize: number) => {
  const names = Array.from({ length: n }, (_, i) => `S${i}`);
  const part = (i: number) => Math.floor(i / partSize);
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (part(i) !== part(j)) pairs.push([names[i], names[j]]);
    }
  }
  return { names, pairs };
};

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

  it('refuses an over-limit pasted name list the same way', () => {
    const out = buildGroups(
      base({
        students: Array.from({ length: MAX_STUDENTS + 1 }, (_, i) => `S${i}`),
      }),
    );
    if (out.ok) throw new Error('expected refusal');
    expect(out.error.code).toBe(ERROR_CODES.tooManyStudents);
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

  it('a search that would take two minutes returns at once', () => {
    // 48 students of this shape took 121,712 ms measured against the
    // uncapped engine. The budget below is 2 s — a 60x margin, so this is a
    // termination guarantee rather than a race with the machine. There is
    // no way to assert "this terminates" without a clock; there is a way to
    // do it without a close one.
    //
    // This test exists because the OTHER pathological test does not pin the
    // clique cap: remove that cap and the outcome is unchanged, just slower.
    const { names, pairs } = moonMoser(48, 3);
    const out = buildGroups(
      base({
        students: names,
        mode: { kind: 'perGroup', size: 2 },
        keepApart: pairs,
      }),
    );
    expect(out.ok).toBe(false);
  }, 2000);

  it('gives up on a pathological keep-apart list instead of searching forever', () => {
    // 42 students took 7.3 SECONDS before the cap existed. The assertion is
    // the outcome, not the clock: an uncapped engine reaches a different
    // answer, so removing the cap fails this test deterministically.
    const { names, pairs } = moonMoser(42, 3);
    const out = buildGroups(
      base({
        students: names,
        mode: { kind: 'perGroup', size: 2 },
        keepApart: pairs,
      }),
    );
    if (out.ok) throw new Error('expected refusal');
    expect(out.error.code).toBe(ERROR_CODES.keepApartSearchGaveUp);
  });
});

describe('buildGroups — a refusal must not assert something untrue', () => {
  it('an odd cycle is refused WITHOUT claiming everyone conflicts with everyone', () => {
    // Ana-Budi-Citra-Dewi-Eko-Ana. Max clique is 2, so two groups look
    // sufficient — but a 5-cycle is not 2-colourable, so no arrangement
    // exists. The old code reported all five as mutually inseparable, which
    // is false: Ana and Citra have no rule between them at all.
    const out = buildGroups(
      base({
        students: ['Ana', 'Budi', 'Citra', 'Dewi', 'Eko'],
        mode: { kind: 'groupCount', count: 2 },
        keepApart: [
          ['Ana', 'Budi'],
          ['Budi', 'Citra'],
          ['Citra', 'Dewi'],
          ['Dewi', 'Eko'],
          ['Eko', 'Ana'],
        ],
      }),
    );
    if (out.ok) throw new Error('expected refusal');
    expect(out.error.code).toBe(ERROR_CODES.keepApartNoArrangement);
    // It may say how many groups it tried with. It may NOT hand back a set of
    // children and call them mutually inseparable.
    expect(out.error.students).toBeUndefined();
    expect(out.error.groupsTried).toBe(2);
  });

  it('distinguishes "there is no arrangement" from "I stopped looking"', () => {
    // Both are refusals; only one of them is a proof. A teacher who is told
    // "this cannot be done" will go and change their class, so the tool must
    // only say it when it actually searched the whole space.
    const proved = buildGroups(
      base({
        students: ['Ana', 'Budi', 'Citra', 'Dewi', 'Eko'],
        mode: { kind: 'groupCount', count: 2 },
        keepApart: [
          ['Ana', 'Budi'],
          ['Budi', 'Citra'],
          ['Citra', 'Dewi'],
          ['Dewi', 'Eko'],
          ['Eko', 'Ana'],
        ],
      }),
    );
    const { names, pairs } = moonMoser(42, 3);
    const gaveUp = buildGroups(
      base({
        students: names,
        mode: { kind: 'perGroup', size: 2 },
        keepApart: pairs,
      }),
    );

    if (proved.ok || gaveUp.ok) throw new Error('expected two refusals');
    expect(proved.error.code).toBe(ERROR_CODES.keepApartNoArrangement);
    expect(gaveUp.error.code).toBe(ERROR_CODES.keepApartSearchGaveUp);
    expect(proved.error.code).not.toBe(gaveUp.error.code);
  });

  it('still names the students when a clique genuinely proves it', () => {
    // The good message must survive: five students who all conflict with each
    // other DO need five groups, and naming them is the actionable part.
    const out = buildGroups(
      base({
        students: ['Ana', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fitri'],
        mode: { kind: 'groupCount', count: 2 },
        keepApart: [
          ['Ana', 'Budi'],
          ['Ana', 'Citra'],
          ['Ana', 'Dewi'],
          ['Budi', 'Citra'],
          ['Budi', 'Dewi'],
          ['Citra', 'Dewi'],
        ],
      }),
    );
    if (out.ok) throw new Error('expected refusal');
    expect(out.error.code).toBe(ERROR_CODES.keepApartImpossible);
    expect(out.error.students?.sort()).toEqual([
      'Ana',
      'Budi',
      'Citra',
      'Dewi',
    ]);
    expect(out.error.groupsNeeded).toBe(4);
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
    expect(new Set(all.map((s) => s.id)).size).toBe(12);
  });
});

describe('buildGroups — names that are not plain ASCII', () => {
  it('matches a name typed in a different Unicode form', () => {
    // "José" has two encodings: NFC (é as one code point) and NFD (e plus a
    // combining accent). They look identical, and macOS keyboards and file
    // pastes produce different ones — so a teacher could paste the class
    // list one way and type the keep-apart rule the other and be told "José
    // is not in your class list. Check the spelling."
    const nfc = 'José';
    const nfd = 'José';
    expect(nfc).not.toBe(nfd);

    const out = buildGroups(
      base({
        students: [nfc, 'Budi', 'Citra', 'Dewi'],
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [[nfd, 'Budi']],
      }),
    );
    if (!out.ok) throw new Error(`expected success, got ${out.error.code}`);
    const together = out.result.groups.find(
      (g) =>
        g.some((s) => s.name?.normalize('NFC') === nfc.normalize('NFC')) &&
        g.some((s) => s.name === 'Budi'),
    );
    expect(together).toBeUndefined();
  });

  it.each([
    ['Chinese', ['张伟', '李娜', '王芳', '刘洋']],
    ['Arabic', ['أحمد', 'فاطمة', 'محمد', 'عائشة']],
    ['Hebrew', ['אבי', 'שרה', 'דוד', 'רחל']],
    ['Thai', ['สมชาย', 'สมหญิง', 'ประเสริฐ', 'มาลี']],
  ])('keeps %s names apart correctly', (_label, names) => {
    const { groups } = ok(
      base({
        students: names,
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [[names[0], names[1]]],
      }),
    );
    expect(
      groups
        .flat()
        .map((s) => s.name)
        .sort(),
    ).toEqual([...names].sort());
    expect(
      groups.some(
        (g) =>
          g.some((s) => s.name === names[0]) &&
          g.some((s) => s.name === names[1]),
      ),
    ).toBe(false);
  });
});

describe('buildGroups — case distinguishes one child from another', () => {
  it('treats a difference of case as a different child', () => {
    // Two children really can be "ana" and "Ana"; case-folding names would
    // merge them, which is a worse failure than asking for the exact
    // spelling the class list uses (see the comment on nameKey). This is now
    // the only test anywhere pinning that invariant — the case that used to
    // observe it through KEEP_APART_UNKNOWN_NAME was deleted along with that
    // error code (see finding I-1, task-1-review.md).
    //
    // Budi is kept apart from BOTH "ana" and "Citra". With two-seat groups,
    // Budi's only possible groupmate is therefore "Ana" — but only if she is
    // treated as a genuinely different child from "ana". If case were
    // folded, "Ana" would inherit "ana"'s conflict with Budi too, and no
    // arrangement would exist at all. That makes the outcome deterministic
    // regardless of which random seed is supplied, so none needs pinning.
    const { groups } = ok(
      base({
        students: ['ana', 'Ana', 'Budi', 'Citra'],
        mode: { kind: 'groupCount', count: 2 },
        keepApart: [
          ['ana', 'Budi'],
          ['Citra', 'Budi'],
        ],
      }),
    );
    const withBudi = groups.find((g) => g.some((s) => s.name === 'Budi'))!;
    expect(withBudi.some((s) => s.name === 'Ana')).toBe(true);
    expect(withBudi.some((s) => s.name === 'ana')).toBe(false);
  });
});

describe('buildGroups — duplicate names and empty rules', () => {
  it('keeps BOTH children of a shared name away from the named one', () => {
    // Two Anas and a rule about "Ana". The safe reading is that it applies
    // to every child called Ana, and this is the only test of it.
    const { groups } = ok(
      base({
        students: ['Ana', 'Budi', 'Ana', 'Citra', 'Dewi', 'Eko'],
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [['Ana', 'Budi']],
      }),
    );
    const withBudi = groups.find((g) => g.some((s) => s.name === 'Budi'))!;
    expect(withBudi.some((s) => s.name === 'Ana')).toBe(false);
  });

  it('a rule naming the same child twice is not a conflict with themself', () => {
    // The i === j branch. With one Ana this must not make Ana unplaceable.
    const out = buildGroups(
      base({
        students: ['Ana', 'Budi'],
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [['Ana', 'Ana']],
      }),
    );
    expect(out.ok).toBe(true);
  });

  it('but with two children of that name, it separates them', () => {
    const { groups } = ok(
      base({
        students: ['Ana', 'Ana', 'Budi', 'Citra'],
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [['Ana', 'Ana']],
      }),
    );
    const together = groups.find(
      (g) => g.filter((s) => s.name === 'Ana').length > 1,
    );
    expect(together).toBeUndefined();
  });

  it('ignores padding around a name in a rule', () => {
    const { groups } = ok(
      base({
        students: ['Ana', 'Budi', 'Citra', 'Dewi'],
        mode: { kind: 'perGroup', size: 2 },
        keepApart: [['  Ana  ', ' Budi ']],
      }),
    );
    expect(
      groups.some(
        (g) =>
          g.some((s) => s.name === 'Ana') && g.some((s) => s.name === 'Budi'),
      ),
    ).toBe(false);
  });

  it.each([
    ['both sides blank', [['', '']] as Array<[string, string]>],
    ['one side blank', [['Ana', '']] as Array<[string, string]>],
    ['only whitespace', [['  ', ' ']] as Array<[string, string]>],
  ])(
    'an empty rule (%s) is no rule, even without names',
    (_label, keepApart) => {
      // A numbered class has no names to refer to, so an empty rule must NOT
      // trip KEEP_APART_NEEDS_NAMES — it is not a rule at all.
      const out = buildGroups(base({ students: 8, keepApart }));
      expect(out.ok).toBe(true);
    },
  );
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
