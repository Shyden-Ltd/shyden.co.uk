import { anonymousStudent, type Student } from '../../src/lib/grouping';

/**
 * A record with the boring fields filled in, so tests state only what they
 * mean.
 *
 * The defaults come from production's own blank record rather than a fifth
 * copy of them (#277). A test factory that defaults a field differently from
 * the page is a fixture that cannot disagree with the contract in the one
 * direction that matters: it would describe a student the tool never builds.
 * The literal pin lives in `grouping.test.ts`, outside both.
 */
export const student = (
  over: Partial<Student> & { number: number },
): Student => ({
  ...anonymousStudent(over.number),
  ...over,
});

/** Group sizes, largest first — the shape of a split, independent of who landed where. */
export const shape = (groups: Student[][]): number[] =>
  groups.map((g) => g.length).sort((a, b) => b - a);

/** The group containing this student number. */
export const groupOf = (
  groups: Student[][],
  number: number,
): Student[] | undefined =>
  groups.find((g) => g.some((s) => s.number === number));

/**
 * A seeded generator, so "random" is reproducible.
 *
 * Without this every assertion about leftovers, shuffling or "a random group"
 * is either flaky or so weak it proves nothing. The engine takes its random
 * source as a parameter precisely so tests can pin it. mulberry32 — small,
 * well-distributed, and deterministic for a given seed.
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
