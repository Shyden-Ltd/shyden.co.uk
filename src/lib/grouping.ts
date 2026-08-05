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
  /** Pairs of NAMES that must not share a group. Requires named students. */
  keepApart: Array<[string, string]>;
  /** Injected so results are reproducible in tests. */
  random: () => number;
}

export const ERROR_CODES = {
  noStudents: 'NO_STUDENTS',
  invalidGroupSize: 'INVALID_GROUP_SIZE',
  invalidGroupCount: 'INVALID_GROUP_COUNT',
  tooManyGroups: 'TOO_MANY_GROUPS',
  keepApartNeedsNames: 'KEEP_APART_NEEDS_NAMES',
  keepApartUnknownName: 'KEEP_APART_UNKNOWN_NAME',
  keepApartImpossible: 'KEEP_APART_IMPOSSIBLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface GroupingError {
  code: ErrorCode;
  /** The specific names involved — unknown entries, or the conflicting set. */
  students?: string[];
  /** For an impossible request: how many groups it would actually take. */
  groupsNeeded?: number;
  /** For too-many-groups: the most that were possible. */
  maxGroups?: number;
}

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

const fail = (error: GroupingError): GroupingOutcome => ({ ok: false, error });

/** Fisher-Yates against the injected source. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
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
    .map((n) => n.trim())
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
    for (const i of byName.get(a.trim()) ?? []) {
      for (const j of byName.get(b.trim()) ?? []) {
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
 * to act on. Exact search is fine at classroom scale.
 */
function largestMutualConflict(adj: Set<number>[]): number[] {
  let best: number[] = [];
  const n = adj.length;

  const extend = (clique: number[], candidates: number[]): void => {
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
): number[][] | null {
  const groups: number[][] = sizes.map(() => []);
  let nodes = 0;

  const place = (idx: number): boolean => {
    if (idx === order.length) return true;
    if (++nodes > SEARCH_NODE_CAP) return false;
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

  return place(0) ? groups : null;
}

export function buildGroups(input: GroupingInput): GroupingOutcome {
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

  const named = students.some((s) => s.name !== null);
  const pairs = keepApart.filter(
    ([a, b]) => a.trim() !== '' && b.trim() !== '',
  );

  if (pairs.length > 0) {
    // Refuse rather than ignore: quietly dropping the constraint would seat
    // children together that the teacher explicitly separated.
    if (!named) return fail({ code: ERROR_CODES.keepApartNeedsNames });

    const roster = new Set(students.map((s) => s.name));
    const unknown = [...new Set(pairs.flat().map((n) => n.trim()))].filter(
      (n) => !roster.has(n),
    );
    if (unknown.length > 0) {
      return fail({
        code: ERROR_CODES.keepApartUnknownName,
        students: unknown,
      });
    }
  }

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

  const placed = assign(order, sizes, adj);
  if (placed === null) {
    // Reachable when the constraints are individually satisfiable but cannot
    // co-exist with these group sizes — no single clique explains it, so name
    // everyone involved and report that more groups are required.
    const involved = [...new Set(pairs.flat().map((n) => n.trim()))].sort();
    return fail({
      code: ERROR_CODES.keepApartImpossible,
      students: involved,
      groupsNeeded: sizes.length + 1,
    });
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
