/**
 * The Classroom Group Creator engine.
 *
 * Pure: no DOM, no timers, and no randomness of its own — the caller supplies
 * the random source. That is what makes "put the leftovers in a random group"
 * testable rather than either flaky or asserted so weakly it proves nothing.
 *
 * Errors are returned as a CODE plus data, never as a rendered sentence. The
 * sibling gloryPoints.ts keeps English copy in the module because it only ever
 * serves one language; this tool ships in English and Bahasa Indonesia, so the
 * message has to be composed by the locale layer. Returning
 * `{ code, students, groupsNeeded }` also lets the Indonesian page name the
 * conflicting children, which string concatenation in English could not.
 */

export interface Student {
  /** 1-based; the UI renders "Student 7" from this when no name was given. */
  id: number;
  name: string | null;
}

export type Mode =
  { kind: 'perGroup'; size: number } | { kind: 'groupCount'; count: number };

export type Leftovers = 'spread' | 'bunch';

export interface GroupingInput {
  /** A bare count (anonymous students) or a list of names. */
  students: number | string[];
  mode: Mode;
  leftovers: Leftovers;
  /**
   * Pairs of NAMES that must not share a group. A pair naming a student who
   * is not on the roster, or supplied when the class has no names to check
   * against, is silently dropped rather than refused — there is no guard
   * left on this path (see finding I-2, task-1-review.md, and the pinning
   * test in grouping.test.ts). Retired along with the rest of this field
   * in Task 2.
   */
  keepApart: Array<[string, string]>;
  /** Injected so results are reproducible in tests. */
  random: () => number;
}

export const ERROR_CODES = {
  noStudents: 'NO_STUDENTS',
  tooManyStudents: 'TOO_MANY_STUDENTS',
  invalidGroupSize: 'INVALID_GROUP_SIZE',
  invalidGroupCount: 'INVALID_GROUP_COUNT',
  tooManyGroups: 'TOO_MANY_GROUPS',
  /** PROVEN by a clique: these students all conflict, so they need N groups. */
  keepApartImpossible: 'KEEP_APART_IMPOSSIBLE',
  /** PROVEN by exhaustive search: no arrangement exists at this group count. */
  keepApartNoArrangement: 'KEEP_APART_NO_ARRANGEMENT',
  /** Proves NOTHING: the search hit its budget. Says so rather than guessing. */
  keepApartSearchGaveUp: 'KEEP_APART_SEARCH_GAVE_UP',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * An error and exactly the data its message needs — never a bag of optionals.
 *
 * With every field optional, `renderError({ code: KEEP_APART_IMPOSSIBLE })`
 * type-checks and renders " all need to be kept apart from each other, so
 * you would need at least 0 groups. Either make more groups or remove one
 * of the rules.", and the renderer needs `?? []` and `?? 0` fallbacks whose
 * only job is to turn missing data into a plausible-looking sentence. A
 * union removes both: the data cannot be absent, so there is nothing to
 * fall back to.
 */
export type GroupingError =
  | { code: typeof ERROR_CODES.noStudents }
  | { code: typeof ERROR_CODES.tooManyStudents; maxStudents: number }
  | { code: typeof ERROR_CODES.invalidGroupSize }
  | { code: typeof ERROR_CODES.invalidGroupCount }
  | { code: typeof ERROR_CODES.tooManyGroups; maxGroups: number }
  | {
      code: typeof ERROR_CODES.keepApartImpossible;
      students: string[];
      groupsNeeded: number;
    }
  | { code: typeof ERROR_CODES.keepApartNoArrangement; groupsTried: number }
  | { code: typeof ERROR_CODES.keepApartSearchGaveUp };

export type GroupingOutcome =
  | { ok: true; result: { groups: Student[][] } }
  | { ok: false; error: GroupingError };

/**
 * Backtracking node cap. A class is at most a few dozen students with a
 * handful of constraints, so a real solution is found in far fewer steps than
 * this. The cap exists so a pathological input degrades into an honest
 * "cannot be done" rather than hanging the teacher's browser.
 */
const SEARCH_NODE_CAP = 200_000;

/**
 * The largest class this engine will attempt, and the single source of truth
 * for the number the page puts in its `max` attribute.
 *
 * A roster is materialised as objects before anything else can guard it, so
 * `Array.from({ length: 100000000 })` from a mis-keyed paste allocates until
 * the tab is killed — on a phone, until the browser is. 500 is far above any
 * real class and far below anything that hurts.
 */
export const MAX_STUDENTS = 500;

const fail = (error: GroupingError): GroupingOutcome => ({ ok: false, error });

/**
 * How many students were asked for, WITHOUT building them.
 *
 * Deliberately returns the raw number, Infinity and NaN included: the caller
 * distinguishes them, because "more than the tool will do" and "not a number
 * at all" are different mistakes and deserve different sentences.
 */
function requestedSize(input: number | string[]): number {
  return typeof input === 'number'
    ? input
    : input.reduce((n, s) => (s.trim().length > 0 ? n + 1 : n), 0);
}

/**
 * A name as it is compared: trimmed, and in one Unicode form.
 *
 * "José" has two encodings — é as a single code point (NFC) or e plus a
 * combining accent (NFD) — which render identically. macOS filenames and some
 * keyboards produce NFD while most pastes produce NFC, so a teacher could
 * paste the class list one way and type the keep-apart rule the other and be
 * told "José is not in your class list. Check the spelling."
 *
 * Case is deliberately NOT folded: two children really can be "ana" and
 * "Ana", and merging them is a worse failure than asking for the spelling the
 * class list uses.
 */
const nameKey = (name: string): string => name.trim().normalize('NFC');

/** Fisher-Yates against the injected source. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    // Clamped because `random` is a PARAMETER. The contract is [0, 1), and
    // Math.random honours it, but nothing stops a caller passing a source
    // that returns exactly 1 — and then j is i + 1, the swap reads past the
    // end, and `undefined` is seated in a group with a real child.
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function normaliseStudents(input: number | string[]): Student[] {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 1) return [];
    return Array.from({ length: Math.floor(input) }, (_, i) => ({
      id: i + 1,
      name: null,
    }));
  }
  // Blank lines are how a pasted class list ends; they are not students. A
  // duplicate name IS kept — two children genuinely can share a first name,
  // and silently de-duplicating would drop one of them from the class.
  return input
    .map(nameKey)
    .filter((n) => n.length > 0)
    .map((name, i) => ({ id: i + 1, name }));
}

/**
 * How many students each group should end up with.
 *
 * perGroup is the mode carrying the operator's rule: never fewer than the
 * stated size. So the group COUNT is floor(n / size) — taking one more group
 * would strand a short one — and the remainder is then placed according to the
 * leftovers preference. 7 students in groups of 4 therefore gives a single
 * group of 7, not 4 and 3.
 */
function targetSizes(
  total: number,
  mode: Mode,
  leftovers: Leftovers,
): number[] {
  const groupCount =
    mode.kind === 'perGroup'
      ? Math.max(1, Math.floor(total / mode.size))
      : mode.count;

  const base = Math.floor(total / groupCount);
  const sizes = Array.from({ length: groupCount }, () => base);
  let remainder = total - base * groupCount;

  if (leftovers === 'bunch') {
    sizes[0] += remainder;
    return sizes;
  }
  // Spread: one at a time, round-robin. Round-robin (rather than "give the
  // first `remainder` groups one each") is what keeps the largest and smallest
  // group within one of each other even when the remainder exceeds the number
  // of groups — e.g. 11 students in groups of 4 is 6 and 5, never 7 and 4.
  let i = 0;
  while (remainder > 0) {
    sizes[i % groupCount] += 1;
    i += 1;
    remainder -= 1;
  }
  return sizes;
}

/** Conflict adjacency by student index, built from name pairs. */
function buildConflicts(
  students: Student[],
  pairs: Array<[string, string]>,
): Set<number>[] {
  const byName = new Map<string, number[]>();
  students.forEach((s, i) => {
    if (s.name === null) return;
    const list = byName.get(s.name) ?? [];
    list.push(i);
    byName.set(s.name, list);
  });

  const adj: Set<number>[] = students.map(() => new Set<number>());
  for (const [a, b] of pairs) {
    // A duplicated name expands to every student carrying it — the safe
    // reading of "keep Ana away from Budi" when there are two Anas.
    for (const i of byName.get(nameKey(a)) ?? []) {
      for (const j of byName.get(nameKey(b)) ?? []) {
        if (i === j) continue;
        adj[i].add(j);
        adj[j].add(i);
      }
    }
  }
  return adj;
}

/**
 * Largest set of students who ALL conflict with each other (max clique).
 *
 * This is the honest explanation of impossibility: if five students must all
 * be kept apart from one another, they need five groups, and no shuffling of
 * four will ever work. Reporting that set by name gives the teacher something
 * to act on.
 *
 * Budgeted like `assign`, and for the same reason. "Exact search is fine at
 * classroom scale" was measured and is not true: a keep-apart list shaped like
 * "these three wind each other up, and those three, and those three" is the
 * worst case for clique search, and 48 students of it took 121 SECONDS in a
 * tab that had no way to say what it was doing.
 *
 * A clique found under the budget is still a valid certificate — it is a set
 * that genuinely all conflict, whether or not a bigger one exists. Only the
 * opposite conclusion, "no large clique exists", would need a complete search,
 * and this function is never used to draw it. So exhaustion costs precision,
 * never correctness: the caller simply falls through to the real search.
 */
function largestMutualConflict(adj: Set<number>[]): number[] {
  let best: number[] = [];
  let nodes = 0;
  const n = adj.length;

  const extend = (clique: number[], candidates: number[]): void => {
    if (++nodes > SEARCH_NODE_CAP) return;
    if (clique.length > best.length) best = clique.slice();
    // Bound: even taking every remaining candidate cannot beat the best found.
    if (clique.length + candidates.length <= best.length) return;
    for (let k = 0; k < candidates.length; k++) {
      const v = candidates[k];
      extend(
        [...clique, v],
        candidates.slice(k + 1).filter((u) => adj[v].has(u)),
      );
    }
  };

  extend(
    [],
    Array.from({ length: n }, (_, i) => i).filter((i) => adj[i].size > 0),
  );
  return best;
}

/**
 * Place students into fixed-capacity groups without seating two conflicting
 * students together. Most-constrained-first ordering keeps the search shallow;
 * the shuffle beforehand is what makes the arrangement vary between runs.
 */
function assign(
  order: number[],
  sizes: number[],
  adj: Set<number>[],
): { groups: number[][] | null; gaveUp: boolean } {
  const groups: number[][] = sizes.map(() => []);
  let nodes = 0;
  let gaveUp = false;

  const place = (idx: number): boolean => {
    if (idx === order.length) return true;
    if (++nodes > SEARCH_NODE_CAP) {
      // Not "no arrangement exists" — "I stopped looking". Collapsing the two
      // is how a tool ends up telling a teacher a falsehood with confidence.
      gaveUp = true;
      return false;
    }
    const student = order[idx];

    for (let g = 0; g < groups.length; g++) {
      if (groups[g].length >= sizes[g]) continue;
      if (groups[g].some((other) => adj[student].has(other))) continue;
      groups[g].push(student);
      if (place(idx + 1)) return true;
      groups[g].pop();
    }
    return false;
  };

  const placed = place(0);
  return { groups: placed ? groups : null, gaveUp };
}

export function buildGroups(input: GroupingInput): GroupingOutcome {
  // Counted before it is built. Past this line the roster exists in memory,
  // so this is the only place the size can still be refused cheaply.
  if (requestedSize(input.students) > MAX_STUDENTS) {
    return fail({
      code: ERROR_CODES.tooManyStudents,
      maxStudents: MAX_STUDENTS,
    });
  }

  const students = normaliseStudents(input.students);
  if (students.length === 0) return fail({ code: ERROR_CODES.noStudents });

  const { mode, leftovers, keepApart, random } = input;
  if (
    mode.kind === 'perGroup' &&
    (!Number.isInteger(mode.size) || mode.size < 1)
  ) {
    return fail({ code: ERROR_CODES.invalidGroupSize });
  }
  if (mode.kind === 'groupCount') {
    if (!Number.isInteger(mode.count) || mode.count < 1) {
      return fail({ code: ERROR_CODES.invalidGroupCount });
    }
    if (mode.count > students.length) {
      return fail({
        code: ERROR_CODES.tooManyGroups,
        maxGroups: students.length,
      });
    }
  }

  const pairs = keepApart.filter(
    ([a, b]) => a.trim() !== '' && b.trim() !== '',
  );

  const sizes = targetSizes(students.length, mode, leftovers);
  const adj = buildConflicts(students, pairs);

  if (pairs.length > 0) {
    const clique = largestMutualConflict(adj);
    if (clique.length > sizes.length) {
      return fail({
        code: ERROR_CODES.keepApartImpossible,
        students: clique.map((i) => students[i].name as string),
        groupsNeeded: clique.length,
      });
    }
  }

  // Shuffle for variety, then order the most-constrained students first so the
  // search fails fast rather than deep.
  const order = shuffled(
    students.map((_, i) => i),
    random,
  ).sort((a, b) => adj[b].size - adj[a].size);

  const { groups: placed, gaveUp } = assign(order, sizes, adj);
  if (placed === null) {
    // Two different failures, and the difference is everything. The search
    // either ran to completion — in which case no arrangement exists at this
    // group count, and saying so is a proof — or it hit its budget, in which
    // case nothing whatsoever has been established.
    //
    // What is NOT said here is who conflicts with whom. The old code handed
    // back every name appearing in any pair and let the copy call them
    // mutually inseparable; for a five-student ring that named two children
    // who have no rule between them at all. A clique is the only thing that
    // licenses that sentence, and by this line the clique gate has already
    // declined to fire.
    return fail(
      gaveUp
        ? { code: ERROR_CODES.keepApartSearchGaveUp }
        : {
            code: ERROR_CODES.keepApartNoArrangement,
            groupsTried: sizes.length,
          },
    );
  }

  // Randomise which group is "oversized" so bunched leftovers do not always
  // land in group 1, and spread leftovers do not always favour the first
  // groups. Sizes were computed in a fixed order; the mapping is what varies.
  const slots = shuffled(
    placed.map((_, i) => i),
    random,
  );
  return {
    ok: true,
    result: { groups: slots.map((i) => placed[i].map((s) => students[s])) },
  };
}
