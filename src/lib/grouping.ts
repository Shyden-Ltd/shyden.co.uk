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
  /** The identity. Unique, whole, and the teacher's to choose — gaps allowed. */
  number: number;
  name: string | null;
  sex: 'M' | 'F' | null;
  absent: boolean;
  /** Letter. Everyone sharing it is placed as one unit. */
  together: string | null;
  /** Letter. Everyone sharing it is mutually separated. */
  apart: string | null;
}

export type Mode =
  { kind: 'perGroup'; size: number } | { kind: 'groupCount'; count: number };

export type Leftovers = 'spread' | 'bunch';

export type SexMode = 'off' | 'mix' | 'separate';

export interface GroupingInput {
  /** A bare count (anonymous students) or the roster. */
  students: number | Student[];
  mode: Mode;
  leftovers: Leftovers;
  sexMode: SexMode;
  /** Groups the teacher pinned; left exactly as they are. */
  pinned: Student[][];
  /** Injected so results are reproducible in tests. */
  random: () => number;
}

export const ERROR_CODES = {
  noStudents: 'NO_STUDENTS',
  tooManyStudents: 'TOO_MANY_STUDENTS',
  /** Two records claimed the same number — the roster is ambiguous. */
  duplicateNumber: 'DUPLICATE_NUMBER',
  invalidGroupSize: 'INVALID_GROUP_SIZE',
  invalidGroupCount: 'INVALID_GROUP_COUNT',
  tooManyGroups: 'TOO_MANY_GROUPS',
  /** A together-letter unit is bigger than even the largest group. */
  togetherUnitTooLarge: 'TOGETHER_UNIT_TOO_LARGE',
  /** PROVEN by exhaustive search: no arrangement of together-blocks fits at this group count. */
  togetherNoArrangement: 'TOGETHER_NO_ARRANGEMENT',
  /** Proves NOTHING: the together-block search hit its budget. Says so rather than guessing. */
  togetherSearchGaveUp: 'TOGETHER_SEARCH_GAVE_UP',
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
  | { code: typeof ERROR_CODES.duplicateNumber; number: number }
  | { code: typeof ERROR_CODES.invalidGroupSize }
  | { code: typeof ERROR_CODES.invalidGroupCount }
  | { code: typeof ERROR_CODES.tooManyGroups; maxGroups: number }
  | {
      code: typeof ERROR_CODES.togetherUnitTooLarge;
      letter: string;
      unit: number;
      groupSize: number;
    }
  | { code: typeof ERROR_CODES.togetherNoArrangement; groupsTried: number }
  | { code: typeof ERROR_CODES.togetherSearchGaveUp }
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
 *
 * Measured uncapped, on a keep-apart list shaped like "these three wind each
 * other up, and those three, and those three" -- the worst case for both the
 * clique search below and the assignment search in `assign`: 24 students
 * took 27ms, 36 took 471ms, 42 took 7.3s, and 48 took 121.7s. The growth
 * between those points is why the cap exists at all, not just what value it
 * holds -- a handful of students past classroom scale is the difference
 * between instant and a hung tab. (Formerly reproduced by a `moonMoser` test
 * helper, retired in Task 2 along with the free-text `keepApart` field that
 * fed it; Task 5 needs an equivalently pathological letter-based input to
 * re-prove this number, not just to trust this comment.)
 *
 * This cap now also bounds `assign`'s block-placement search (Fix round 1,
 * F-2/F-3), a second and different consumer -- pure bin-packing among
 * same-cost groups, no conflicts, since `pairs` is still always empty this
 * stage. The measurements above were never taken against that shape of
 * input, so they justify the cap for keep-apart only; they are not evidence
 * for the together-block case, and should not be read as if they were.
 * tests/unit/grouping.test.ts pins one concrete together-block input that
 * exhausts the cap (Fix round 1, F-3), but that is one data point, not a
 * growth curve -- nobody has yet measured where together-block search time
 * blows up the way the keep-apart numbers above do.
 *
 * Fix round 2: block placement can now call `assign` up to twice, once per
 * pass (see `placeBlocks`). This cap is spent PER CALL, not once for the
 * whole placement -- each pass opens its own node counter at zero -- so the
 * true worst case for block placement is 2x this many nodes, not this many,
 * on the rare input that defeats both the shuffled order and
 * first-fit-decreasing.
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
function requestedSize(input: number | Student[]): number {
  return typeof input === 'number' ? input : input.length;
}

/**
 * A name as it is DISPLAYED: trimmed, and in one Unicode form.
 *
 * This used to also be how two students were MATCHED against each other for
 * a keep-apart rule: "José" pasted as NFC and typed as NFD needed to reach
 * the same key, or the rule would silently fail to fire, and folding case
 * was refused for the same reason — "ana" and "Ana" had to stay distinguishable
 * or two different children could be merged into one conflict. Identity is
 * the number now, so nothing is matched on the name at all; this function is
 * kept purely so the roster renders consistently regardless of which Unicode
 * form or stray whitespace a name arrived in.
 *
 * Case is still deliberately NOT folded: a teacher who typed "Ana" must see
 * "Ana" on their own roster, not "ana".
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

const anonymous = (number: number): Student => ({
  number,
  name: null,
  sex: null,
  absent: false,
  together: null,
  apart: null,
});

function normaliseStudents(input: number | Student[]): Student[] {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 1) return [];
    return Array.from({ length: Math.floor(input) }, (_, i) =>
      anonymous(i + 1),
    );
  }
  // A record list is taken as given. Renumbering it would throw away the one
  // thing that makes a constraint unambiguous, which is the whole point of
  // this rewrite: two children called Ana are two numbers, not one name.
  return input.map((s) => ({
    ...s,
    // A blank is not a name. Without the `|| null`, nameKey('   ') returns
    // '' -- a third state the contract does not describe (it is name, or
    // null meaning "no name"). '' is not nullish, so `name ?? 'Student N'`
    // would render a blank label instead of falling back to it.
    name: s.name === null ? null : nameKey(s.name) || null,
    // Same field shape, same defect, same fix (Fix round 1, F-4). Left
    // untrimmed, '' and '   ' are two DIFFERENT Map keys in buildBlocks, so
    // two students with blank cells merge into one block or not depending on
    // invisible whitespace -- and a blank collapsed the wrong way still
    // reads as a real, shared letter rather than as "no letter".
    together: s.together === null ? null : nameKey(s.together) || null,
    apart: s.apart === null ? null : nameKey(s.apart) || null,
  }));
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

/** Indices into the present roster that must end up in one group. */
type Block = number[];

/**
 * Collapse together-letters into blocks.
 *
 * A student with no letter is a block of one, so the placer below has exactly
 * one kind of thing to move. That is what keeps the backtracking search — and
 * its node budget, and its honest "I stopped looking" — identical to the one
 * that already works.
 */
function buildBlocks(present: Student[]): Block[] {
  const byLetter = new Map<string, Block>();
  const blocks: Block[] = [];
  present.forEach((s, i) => {
    if (s.together === null) {
      blocks.push([i]);
      return;
    }
    const existing = byLetter.get(s.together);
    if (existing) {
      existing.push(i);
      return;
    }
    const block: Block = [i];
    byLetter.set(s.together, block);
    blocks.push(block);
  });
  return blocks;
}

/** Conflict adjacency by student index, built from name pairs. */
function buildConflicts(
  students: Student[],
  pairs: Array<[string, string]>,
): Set<number>[] {
  // Temporarily unread: `pairs` is always [] until Task 5 (see the comment
  // at its construction site in buildGroups), so nothing ever looks this
  // map up. Left in place -- Task 5 refills `pairs`, not this function.
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
 * Place blocks into fixed-capacity groups without seating two conflicting
 * blocks together, and without ever splitting a block across groups.
 *
 * `assign` places in whatever `order` it is handed — it does not choose that
 * order itself. That choice, and the trade-off it carries, lives one level
 * up in `placeBlocks`: a shuffled order costs more search depth but supplies
 * the arrangement variety that makes "shuffle again" mean something; sorting
 * largest-block-first (first-fit-decreasing) keeps the search shallow at the
 * cost of that variety. Fix round 1 (F-2) put that sort directly in the only
 * order `assign` ever saw, which cleared its "gave up" cases but collapsed
 * variety on together-rosters to a single arrangement. Fix round 2 moved the
 * sort out of `assign` entirely, into a second, later pass in `placeBlocks`
 * — `assign` itself is unchanged from before either fix round.
 *
 * A student with no together-letter is a block of one (see `buildBlocks`),
 * so this is the only placement function — there is no separate
 * single-student path that could drift out of sync with this one.
 */
function assign(
  order: number[], // block indices, in the order the caller wants them tried
  blocks: Block[],
  sizes: number[],
  adj: Set<number>[], // conflicts BETWEEN BLOCKS
): { groups: number[][] | null; gaveUp: boolean } {
  const groups: number[][] = sizes.map(() => []); // holds block indices
  let nodes = 0;
  let gaveUp = false;
  const filled = sizes.map(() => 0);

  const place = (idx: number): boolean => {
    if (idx === order.length) return true;
    if (++nodes > SEARCH_NODE_CAP) {
      // Not "no arrangement exists" — "I stopped looking". Collapsing the two
      // is how a tool ends up telling a teacher a falsehood with confidence.
      gaveUp = true;
      return false;
    }
    const b = order[idx];
    const size = blocks[b].length;

    for (let g = 0; g < groups.length; g++) {
      if (filled[g] + size > sizes[g]) continue;
      if (groups[g].some((other) => adj[b].has(other))) continue;
      groups[g].push(b);
      filled[g] += size;
      if (place(idx + 1)) return true;
      groups[g].pop();
      filled[g] -= size;
    }
    return false;
  };

  const placed = place(0);
  return { groups: placed ? groups : null, gaveUp };
}

/**
 * Two-pass placement (Fix round 2).
 *
 * Pass 1 tries the blocks in the shuffled order, unsorted — exactly what
 * this placer did before Fix round 1. This is what supplies arrangement
 * variety: the search meets blocks in an unpredictable order, and the
 * backtracking fill lands differently seed to seed. If it succeeds, that
 * arrangement is used and pass 2 never runs, so the common path — nearly
 * every real class — costs exactly the one search it always needed.
 *
 * If pass 1 runs to completion WITHOUT giving up, that is already a complete
 * proof that no arrangement exists at this group count: `assign` is an
 * exhaustive backtracking search over every valid group choice for every
 * block, so the order it meets blocks in changes how many nodes it visits
 * before deciding, never what it is capable of deciding. A second pass in a
 * different order cannot find an arrangement the first pass already proved
 * does not exist, so none is run — see the call site in `buildGroups` for
 * where that proof is reported.
 *
 * Only when pass 1 hits SEARCH_NODE_CAP — proving nothing, "I stopped
 * looking" — does pass 2 run, with blocks sorted largest-first
 * (first-fit-decreasing, the standard bin-packing heuristic). That sort is
 * what cleared Fix round 1's "gave up" cases (13 of 1540 measured
 * together-rosters, down to 0): it trades away the variety pass 1 exists to
 * protect, but only once pass 1 has already shown the varied order cannot
 * decide this particular case within budget. Pass 2 sorts a COPY of pass 1's
 * own shuffled order, rather than shuffling again, so both passes draw from
 * the same sequence of `random` calls — there is no second, independent
 * source of randomness here, only a second look at the first one's output.
 *
 * SEARCH_NODE_CAP is a PER-PASS budget, not a shared one: each call to
 * `assign` opens its own `nodes` counter at zero (see `assign`'s closure),
 * so the worst case — pass 1 gives up, then pass 2 also gives up — visits up
 * to 2 * SEARCH_NODE_CAP nodes and costs roughly twice one pass's time. That
 * only happens on an input that defeats first-fit-decreasing outright (see
 * the "gave up" test in grouping.test.ts, where every block is the same
 * size so pass 2's sort cannot help); every other input pays for one pass.
 */
function placeBlocks(
  blocks: Block[],
  sizes: number[],
  adj: Set<number>[], // conflicts BETWEEN BLOCKS
  random: () => number,
): { groups: number[][] | null; gaveUp: boolean } {
  const order = shuffled(
    blocks.map((_, i) => i),
    random,
  );

  const pass1 = assign(order, blocks, sizes, adj);
  if (pass1.groups !== null || !pass1.gaveUp) return pass1;

  const ffdOrder = order
    .slice()
    .sort((a, b) => blocks[b].length - blocks[a].length);
  return assign(ffdOrder, blocks, sizes, adj);
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

  // The PAGE also refuses duplicates, live, in stage 3. Both must say the same
  // sentence, so the engine reports the code and the number and the renderer
  // owns the words -- exactly one place builds that string.
  const seen = new Set<number>();
  for (const s of students) {
    if (seen.has(s.number)) {
      return fail({ code: ERROR_CODES.duplicateNumber, number: s.number });
    }
    seen.add(s.number);
  }

  if (students.length === 0) return fail({ code: ERROR_CODES.noStudents });

  // Absence is applied here, after the roster is counted and validated, so a
  // duplicate number is still caught in a row that is out today -- the teacher
  // is going to untick it tomorrow.
  const present = students.filter((s) => !s.absent);
  if (present.length === 0) return fail({ code: ERROR_CODES.noStudents });

  const { mode, leftovers, random } = input;
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
    if (mode.count > present.length) {
      return fail({
        code: ERROR_CODES.tooManyGroups,
        maxGroups: present.length,
      });
    }
  }

  // No source of conflicts yet. The free-text `keepApart` pairs this used to
  // read are retired by this task, and Task 5's letter-based `apart` field
  // (see Student.apart) is not wired in until then -- so buildConflicts,
  // largestMutualConflict and the KEEP_APART_* branches below all still
  // exist and still run, they simply have nothing to do. An empty list here
  // is that "nothing to do" made visible, rather than a read of a field that
  // no longer exists on GroupingInput.
  //
  // Concretely: with `pairs` always empty, `largestMutualConflict`, the
  // clique-impossibility gate just below, and `KEEP_APART_NO_ARRANGEMENT` and
  // `KEEP_APART_SEARCH_GAVE_UP` are all UNREACHABLE through the public API,
  // and therefore UNTESTED, until Task 5 refills `pairs`. This is a real
  // coverage gap, not a stylistic one (see Fix round 1, F-3 in
  // task-2-report.md). Two guarantees are at risk while it stands: that two
  // students who must be apart never end up sharing a group, and that
  // exhausting SEARCH_NODE_CAP is never reported as "no arrangement exists"
  // (the gaveUp / no-arrangement distinction just above `assign`'s call
  // site, below). Task 5 must RE-PROVE both against letter-fed conflicts,
  // not merely add new apart-letter tests on top of an already-untested
  // path.
  //
  // Task 4 addendum: `assign` no longer reads the `adj` built below at all.
  // `adj` is indexed by a student's position in `present`; `assign` moves
  // BLOCKS now (see `Block`, `buildBlocks`), and blocks.length is
  // <= present.length from the moment any together-letter merges two or more
  // students into one block. Handing `assign` that student-indexed adjacency
  // and letting it index by BLOCK would silently read some unrelated
  // student's conflict set instead of the block's own -- wrong, but not
  // wrong enough for any test to catch, because every set is empty until
  // Task 5 (same reasoning as the paragraph above). `blockAdj`, below, is
  // therefore built fresh at blocks.length -- one empty set per block --
  // rather than reused from `adj`. Task 5 must fill `blockAdj` PER BLOCK (for
  // instance, by unioning the student-level conflicts of everyone inside
  // each block), not per student, or this exact substitution bug comes back
  // with real data behind it and nothing left to catch it.
  const pairs: Array<[string, string]> = [];

  const sizes = targetSizes(present.length, mode, leftovers);
  const blocks = buildBlocks(present);

  // Checked against the LARGEST group, because that is the only one a big unit
  // could fit in. Comparing against the smallest would refuse arrangements
  // that are perfectly possible.
  const largestGroup = Math.max(...sizes);
  for (const block of blocks) {
    if (block.length > largestGroup) {
      return fail({
        code: ERROR_CODES.togetherUnitTooLarge,
        letter: present[block[0]].together as string,
        unit: block.length,
        groupSize: largestGroup,
      });
    }
  }

  const adj = buildConflicts(present, pairs);

  if (pairs.length > 0) {
    const clique = largestMutualConflict(adj);
    if (clique.length > sizes.length) {
      return fail({
        code: ERROR_CODES.keepApartImpossible,
        students: clique.map((i) => present[i].name as string),
        groupsNeeded: clique.length,
      });
    }
  }

  // See the Task 4 addendum on the comment above `pairs`: this is
  // block-indexed and empty, never the student-indexed `adj` above.
  const blockAdj: Set<number>[] = blocks.map(() => new Set<number>());

  // Two-pass placement -- see `placeBlocks`. Pass 1 is the shuffled order,
  // unsorted, which is what supplies arrangement variety; pass 2
  // (first-fit-decreasing) runs only if pass 1 gives up (Fix round 2, closing
  // the arrangement-variety regression Fix round 1's sort caused). blockAdj
  // is not read as a tie-break in either pass: every set is empty until Task
  // 5, so it would decide nothing today.
  const { groups: placed, gaveUp } = placeBlocks(
    blocks,
    sizes,
    blockAdj,
    random,
  );
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
    //
    // Which RULE failed matters too (Fix round 1, F-1): a together clash and
    // a keep-apart clash have opposite remedies -- the together copy says
    // make groups BIGGER or use fewer/lighter letters, the keep-apart copy
    // says make MORE groups or drop a rule -- so attributing a together
    // failure to keep-apart hands the teacher a fix that makes the real
    // problem worse. Decided from what is actually in play, not guessed:
    // a block bigger than one student means a together-letter is live; a
    // non-empty entry in blockAdj means an apart-letter conflict is live.
    // `pairs` is always [] until Task 5, so blockAdj is always all-empty
    // sets and apartInPlay is always false here today -- every reachable
    // failure this stage is a together failure. It is still computed
    // rather than hardcoded so the attribution stays correct once Task 5
    // makes apartInPlay real.
    //
    // Task 5 must decide what happens when BOTH are true at once -- e.g. a
    // class with together- AND apart-letters where the search still fails.
    // That combination cannot be attributed to a single rule from these two
    // booleans alone, and it is untestable today because apart-letters do
    // not exist yet. This only resolves the two single-rule cases; the
    // combined case is not decided here and falls through to the
    // keep-apart branch below, which is a placeholder, not a considered
    // answer -- do not read it as one.
    const togetherInPlay = blocks.some((block) => block.length > 1);
    const apartInPlay = blockAdj.some((conflicts) => conflicts.size > 0);

    if (togetherInPlay && !apartInPlay) {
      return fail(
        gaveUp
          ? { code: ERROR_CODES.togetherSearchGaveUp }
          : {
              code: ERROR_CODES.togetherNoArrangement,
              groupsTried: sizes.length,
            },
      );
    }

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
    result: {
      groups: slots.map((i) =>
        placed[i].flatMap((b) => blocks[b].map((j) => present[j])),
      ),
    },
  };
}
