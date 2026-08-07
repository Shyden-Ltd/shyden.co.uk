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
 *
 * A successful outcome can still carry something worth telling the teacher --
 * `result.warnings`, same CODE-plus-data shape as errors, rendered the same
 * way (see `renderWarning` in src/lib/i18n/index.ts). "Here are your groups,
 * and two students ended up with the other sex" is a success, not a refusal,
 * so it does not belong in GroupingError.
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
  /**
   * Two students in the same together-block also hold the same apart-letter
   * as each other -- kept together and kept apart from each other at once.
   * Caught as a contradiction before the placer ever runs; see the comment
   * at its call site in buildGroups for why that beats letting the search
   * fail on it.
   */
  togetherApartClash: 'TOGETHER_APART_CLASH',
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
  /**
   * PROVEN by exhaustive search, but with BOTH a together- and an apart-letter
   * live, so unlike the two codes above this cannot be pinned on one rule.
   * See the comment at its call site in buildGroups for why guessing is worse
   * than saying so.
   */
  bothRulesNoArrangement: 'BOTH_RULES_NO_ARRANGEMENT',
  /** Proves NOTHING: the search hit its budget with both kinds of rule live. */
  bothRulesSearchGaveUp: 'BOTH_RULES_SEARCH_GAVE_UP',
  /**
   * A guard, not a feature. Stage 2 disables the mix and separate switches
   * until every student being grouped already has a sex, so this should be
   * unreachable from the real page -- it exists because this module is the
   * pure logic and must not trust its caller. Scoped to `sexMode !== 'off'`
   * (`mix` and `separate` alike) as of Task 8a, widened from `mix` only:
   * Task 7 scoped it narrower because at the time `separate` did not read
   * `sex` anywhere in this file, and refusing a roster over a field a mode
   * never consulted would have been a real regression (an executable
   * tripwire test existed for exactly this in grouping.test.ts; Task 8a
   * updates it rather than deleting it -- see "sex mode: mix"'s
   * now-refuses test for the history). Task 8a widens the predicate
   * deliberately, ahead of Task 8b's separate-mode PLACEMENT landing: an
   * unset sex is equally unusable input for `separate` as for `mix`, so
   * refusing it now means Task 8b does not also have to remember to add
   * this guard once it wires `sex` into `separate`'s placement. `off`
   * alone stays unguarded -- it is the one mode that genuinely never reads
   * `sex`, at any point in this file, today or after Task 8b. See the call
   * site in buildGroups for why it is checked where it is.
   */
  sexNeedsAllSet: 'SEX_NEEDS_ALL_SET',
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
      code: typeof ERROR_CODES.togetherApartClash;
      // Numbers, not names -- same reasoning as keepApartImpossible below:
      // identity is the number (Student.number), and the engine has no
      // roster to format a display string from. renderError's resolver
      // parameter is what turns these into words; see its doc comment in
      // src/lib/i18n/index.ts.
      students: number[];
    }
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
      // Numbers, not names: identity is the number (see Student.number), and
      // the engine has no business formatting a display string -- the page
      // resolves a number to `name ?? "Student N"`, this union just carries
      // the fact. renderError's resolver parameter is what turns this into
      // words; see its doc comment in src/lib/i18n/index.ts.
      students: number[];
      groupsNeeded: number;
    }
  | { code: typeof ERROR_CODES.keepApartNoArrangement; groupsTried: number }
  | { code: typeof ERROR_CODES.keepApartSearchGaveUp }
  | { code: typeof ERROR_CODES.bothRulesNoArrangement; groupsTried: number }
  | { code: typeof ERROR_CODES.bothRulesSearchGaveUp }
  | {
      code: typeof ERROR_CODES.sexNeedsAllSet;
      // Numbers, not names -- same reasoning as togetherApartClash and
      // keepApartImpossible above: identity is the number (Student.number),
      // and the engine has no roster to format a display string from.
      // renderError's resolver parameter is what turns these into words.
      students: number[];
    };

/**
 * A successful outcome can still carry something worth telling the teacher
 * -- see the module doc comment. Same CODE-plus-data shape as ERROR_CODES,
 * for the same reason: a plain code, never rendered prose, so the locale
 * layer (`renderWarning` in src/lib/i18n/index.ts) is the one place a
 * sentence gets composed.
 *
 * `sexSpillover` is defined here but NOTHING IN THIS MODULE EMITS IT YET.
 * Task 8a builds the channel -- this type, the outcome shape below, the
 * renderer, the copy in both locales -- ahead of the placement logic that
 * will actually push a warning through it. Separate-mode placement
 * (`splitBySex`, the per-sex group allocation, the spill, and the
 * `warnings.push(...)` call that would fire this code) is Task 8b's scope;
 * until it lands, `separate` places exactly as `off` does (see the comment
 * at buildGroups's unset-sex guard, and the "places exactly like off" test
 * in grouping.test.ts's "sex mode: separate" block) and this array is
 * always empty. The member exists now so Task 8b extends a channel that is
 * already tested, translated and wired through renderWarning, rather than
 * inventing one from scratch alongside the harder placement work.
 */
export const WARNING_CODES = {
  sexSpillover: 'SEX_SPILLOVER',
} as const;

/**
 * A warning and exactly the data its message needs -- same reasoning as
 * GroupingError above. `sex` is the sex of the NAMED students, not of the
 * group they landed in: the message needs to say both "you joined a group
 * of the other sex" and "there were not enough of your own", and the
 * spilled side's sex alone is enough data to derive both halves.
 */
export type GroupingWarning = {
  code: typeof WARNING_CODES.sexSpillover;
  students: number[];
  sex: 'M' | 'F';
};

export type GroupingOutcome =
  | { ok: true; result: { groups: Student[][]; warnings: GroupingWarning[] } }
  | { ok: false; error: GroupingError };

/**
 * Backtracking node cap. A class is at most a few dozen students with a
 * handful of constraints, so a real solution is found in far fewer steps than
 * this. The cap exists so a pathological input degrades into an honest
 * "cannot be done" rather than hanging the teacher's browser.
 *
 * Measured uncapped, on a keep-apart list shaped like "these three wind each
 * other up, and those three, and those three" -- the worst case for both the
 * clique search below and the assignment search in `assign`, AS THOSE
 * FUNCTIONS EXISTED AT THE TIME: 24 students took 27ms, 36 took 471ms, 42
 * took 7.3s, and 48 took 121.7s. (Formerly reproduced by a `moonMoser` test
 * helper, retired in Task 2 along with the free-text `keepApart` field that
 * fed it.) SUPERSEDED, not just old -- see the Task 5 paragraphs below: this
 * exact shape (many disjoint SAME-size cliques) no longer reproduces on the
 * current engine at all, at any size up to the 500-student ceiling. Kept
 * here as a record of why the cap exists and roughly what scale of danger it
 * was guarding against, not as a claim about current behaviour -- Task 5
 * needed an equivalently pathological letter-based input to re-prove that,
 * not to trust these numbers, and found this shape does not transfer.
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
 *
 * Task 5 re-measured against the CURRENT engine (block-based, two-pass) with
 * real letter-fed conflicts, rather than trusting the paragraph above -- and
 * the old shape turned out not to transfer. Many disjoint cliques, all the
 * SAME size (the literal old shape: "these three, and those three"),
 * measured trivially fast here regardless of scale or how tightly capacity
 * is drawn: 8 to 20 triangles (24-60 students) into 3 groups, several
 * tightness variants including capacity matching the clique size exactly,
 * and a "Latin square" shape (K disjoint K-cliques into K groups of exactly
 * K, zero slack anywhere) up to K=22 (484 students, just under
 * MAX_STUDENTS) -- every one resolved in low single-digit milliseconds. The
 * reason: this engine's placer tries groups in a FIXED ascending order for
 * every block, so a perfectly regular shape (every clique the same size,
 * every group the same capacity) lets first-fit self-balance into a valid
 * arrangement without ever needing to backtrack, however large it is scaled.
 *
 * UNEVEN clique sizes is what actually defeats it. Six disjoint cliques
 * sized 20, 19, 18, 17, 16 and 15 (105 students) into exactly 20 groups
 * (tests/unit/grouping.test.ts, "apart letters" debt (b) test) reliably
 * exhausts the cap: 334 of 400 seeds measured gave up outright and the other
 * 66 succeeded, confirming this is a common outcome for the shape rather
 * than one unlucky seed -- seed 1 (this engine's default in tests) is among
 * the 334, reproducibly, at ~51-57ms. Every block in that input is a
 * singleton (no `together`), so pass 2's first-fit-decreasing sort is a
 * no-op there (a stable sort over equal-size keys preserves order) and
 * replays pass 1's exhausted search node for node -- confirmed by temporary
 * instrumentation on that exact input, not assumed from the stable-sort
 * argument alone: pass 1 gaveUp=true/found=false, pass 2
 * gaveUp=true/found=false, and pass 2's order verified byte-identical to
 * pass 1's. Both passes are genuinely defeated on that input, matching the
 * two-pass docstring's own "rare input that defeats both" case above.
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

const succeed = (
  groups: Student[][],
  warnings: GroupingWarning[],
): GroupingOutcome => ({ ok: true, result: { groups, warnings } });

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

/**
 * Conflict adjacency BETWEEN BLOCKS, from apart-letters.
 *
 * Everyone sharing a letter is mutually separated, so a letter is a set and
 * not a pair. The conflict is recorded between blocks rather than students
 * because a block moves as one: separating Ana from Citra separates everyone
 * kept together with Ana from Citra too.
 *
 * Identity here is entirely the block index and the letter string — nothing
 * is matched on a student's name. `nameKey` (used only for display
 * normalisation in `normaliseStudents`) is never called from this function.
 */
function buildConflicts(present: Student[], blocks: Block[]): Set<number>[] {
  const adj: Set<number>[] = blocks.map(() => new Set<number>());
  const byLetter = new Map<string, number[]>();

  blocks.forEach((block, b) => {
    for (const i of block) {
      const letter = present[i].apart;
      if (letter === null) continue;
      const list = byLetter.get(letter) ?? [];
      if (!list.includes(b)) list.push(b);
      byLetter.set(letter, list);
    }
  });

  for (const members of byLetter.values()) {
    for (let x = 0; x < members.length; x++) {
      for (let y = x + 1; y < members.length; y++) {
        adj[members[x]].add(members[y]);
        adj[members[y]].add(members[x]);
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
 * four will ever work. Reporting that set — by number; identity is the
 * number, see Student.number — gives the teacher something to act on. It
 * operates on an adjacency array indexed however the caller likes (student
 * index or block index) and does not care which; only the caller's reading
 * of its output does.
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
 * Pass 1's block order under `mix`: shuffled, then woven by a ratio merge —
 * emitting from whichever side (boys or girls) has fallen furthest behind
 * its share of the blocks emitted so far.
 *
 * WHAT THE CODE DOES, first: `sexOf` reads the block's FIRST member and
 * classifies the WHOLE block by that one member's sex — it does not check
 * that every member agrees. A together-block spanning both sexes (one boy,
 * one girl) is therefore silently classified into `boys` or `girls` by
 * whichever sex its first member happens to be; it does NOT fall into
 * `rest`. (Task 7's own comment here previously said the opposite — "it
 * falls into `rest`, which is the only honest thing to do with it" — that
 * was never what this code did; Fix round 1 corrects the comment, not the
 * classification, which is unchanged and still pinned by the "places a
 * together-block spanning both sexes" test in grouping.test.ts.) `rest`
 * holds only a block whose first member's sex is neither `'M'` nor `'F'` —
 * `null`, `undefined`, or any other off-domain value a non-TypeScript
 * caller might hand this pure module (Fix round 1, F-2: `sexOf` normalises
 * anything that is not exactly `'M'` or `'F'` to `null` before classifying,
 * so `boys`, `girls` and `rest` are provably exhaustive and mutually
 * exclusive over EVERY index in `indices` — a permutation by construction,
 * not by the assumption the pre-fix code rested on). In practice `rest` is
 * unreachable from `mix`'s own call site specifically: `weaveBySex` only
 * ever runs after buildGroups's unset-sex guard has confirmed every
 * PRESENT student's `sex` is exactly `'M'` or `'F'`. That guard covers
 * `separate` too as of Task 8a (see `ERROR_CODES.sexNeedsAllSet`'s doc
 * comment) — but `weaveBySex` itself is not what makes that safe: it is
 * written to survive a caller that carries no such guarantee at all, guard
 * widened, guard narrow, or no caller-side guard whatsoever, as when a test
 * calls it directly. See the "never drops a block, whatever `sex` holds"
 * test in grouping.test.ts, which does exactly that.
 *
 * WHY A RATIO MERGE, not straight alternation. `indices` must already be
 * shuffled — this only sorts them into the boy, girl and rest lists,
 * preserving whatever order they arrive in within each list; that is what
 * supplies the variety in WHICH boy and WHICH girl lands in each slot, same
 * as before — pinned by the "varies which boy pairs with which girl across
 * seeds, not just the 1-and-1 split" and "varies pairings on the uneven
 * roster too, not just the evenly-divided one" tests in grouping.test.ts,
 * not by a narrative measurement alone. What changed is HOW the two lists
 * are merged. The original alternation (`woven[i] = boys[i], girls[i]`,
 * i = 0..max(nb,ng)) exhausts the shorter list partway through and then
 * appends the remainder of the longer one as ONE CONTIGUOUS RUN — and
 * `assign` fills groups in ascending order via first-fit, so that run lands
 * as a single-sex group every time.
 * Fix round 1, F-1: measured on the shipped alternation, 2 boys and 4 girls
 * into 2 groups landed the ideal {1M2F, 1M2F} split ZERO times in 200
 * seeds, while `off` (no weave at all) landed it 107 times — the feature
 * made its own goal less likely than not having it. See
 * docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
 * "The five-shape table" for the full reproduction across five roster
 * shapes: `mix` now lands the ideal split 200/200 on every one of them,
 * `off` never better than 58%.
 *
 * The merge below counts BLOCKS, not students: `bi`/`gi` are how many boy-
 * and girl-blocks have been emitted so far, and a boy-block is emitted next
 * when `bi * ng <= gi * nb` (the boy side's share-so-far is still at or
 * below its true share of the two block counts) — a girl-block otherwise —
 * and whichever side is exhausted yields unconditionally to the other. This
 * spreads the minority side proportionally across every position instead of
 * front-loading it, so the excess of the majority side is spread out too,
 * rather than landing as one trailing block.
 *
 * NOT weighted by block SIZE, deliberately, and only after building and
 * measuring the weighted version. A together-block's size is invisible to
 * this count: a 4-student together-block counts as one "boy" the same as a
 * lone boy, so it can still clump — measured on a 4-boy together-block plus
 * 4 lone boys and 8 lone girls into 4 groups, block-COUNT `mix` lands
 * {2M2F, 1M3F, 1M3F, 4M0F} (the best any ordering can do, since a block the
 * exact size of a group cannot share it with anyone) on 100/100 seeds,
 * beating `off`'s 58/100. A student-WEIGHTED variant of this same merge
 * (emit by cumulative student count against each side's true total, so a
 * size-4 block counts as 4) was built and measured on the identical roster:
 * it reached that same best split only 36/100 seeds, WORSE than `off`. The
 * mechanism: weighting makes a block's size a forward-looking "debt" against
 * the OTHER side that persists after the block is placed — the big block
 * pushes `bTotal` to 4 in one step, and the merge then owes girls four turns
 * in a row to let `gTotal` catch up, clumping the very thing it was meant to
 * spread, even though the big block has already claimed its own group and
 * has no further claim on the remaining ones. Block-count weighting has no
 * memory of a block's size once its single turn is taken, which is exactly
 * why it does not make this mistake. Rejected on measurement, not
 * intuition; see
 * docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
 * "The block-size-weighted merge: tried, measured, and rejected" for the
 * full comparison, including a second together-block shape where
 * block-count `mix` beats
 * `off` by roughly 2x without reaching the ideal every time (30.7% vs
 * 15.3%), and a third where a pair of exactly-group-sized blocks of the
 * same sex forces the identical worst split on `mix` and `off` alike — a
 * hard limit no ordering can move, not a regression.
 *
 * EXPORTED, unlike every other helper in this module, for exactly one
 * reason (Fix round 1, F-2): its total-partition guarantee -- every index in
 * `indices` lands in exactly one of `boys`, `girls`, `rest` -- has to hold
 * for ANY caller, not just the ones reachable through `buildGroups` today.
 * `mix` is the only caller `buildGroups` actually has (`placeBlocks` weaves
 * only when `sexMode === 'mix'`; `separate` still takes the plain shuffled
 * order even after Task 8a widened the unset-sex guard to cover it too --
 * see `ERROR_CODES.sexNeedsAllSet`'s doc comment), and that guard refuses
 * every off-domain `sex` before `mix` can reach this function, so there is
 * no path through `buildGroups` left to exercise the guarantee with bad
 * data -- proving it as a property of THIS function, not of `buildGroups`'s
 * current callers, needs a direct call. See the "never drops a block,
 * whatever `sex` holds" test in grouping.test.ts.
 */
export function weaveBySex(
  blocks: Block[],
  present: Student[],
  indices: number[],
): number[] {
  const sexOf = (b: number): 'M' | 'F' | null => {
    const sex = present[blocks[b][0]].sex;
    return sex === 'M' || sex === 'F' ? sex : null;
  };
  const boys = indices.filter((b) => sexOf(b) === 'M');
  const girls = indices.filter((b) => sexOf(b) === 'F');
  const rest = indices.filter((b) => sexOf(b) === null);
  const nb = boys.length;
  const ng = girls.length;

  const woven: number[] = [];
  let bi = 0;
  let gi = 0;
  while (bi < nb || gi < ng) {
    const takeBoy = gi >= ng || (bi < nb && bi * ng <= gi * nb);
    if (takeBoy) {
      woven.push(boys[bi]);
      bi += 1;
    } else {
      woven.push(girls[gi]);
      gi += 1;
    }
  }
  return [...woven, ...rest];
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
 * Task 7 adds one more shape to pass 1's order, under `mix` only: the
 * shuffled order is woven boy-girl-boy-girl before `assign` ever sees it
 * (see `weaveBySex`). This is still "pass 1, unsorted" in the sense that
 * matters — no comparison of block SIZE or conflict COUNT is applied, which
 * is what Fix round 1 got wrong — it is a fixed interleave over an order
 * that is still shuffled underneath, so variety survives (proven in
 * docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
 * "Singleton-block shapes") exactly as it did before this task. `sexMode`
 * values other than `mix` (`off`, and `separate` -- still true after Task
 * 8a, which widened the unset-sex guard elsewhere in this file but left
 * this function untouched; only Task 8b's placement work would change
 * this) take this same shuffled order unchanged, so this task is additive:
 * it can only ever add a branch `mix` reaches, never touch what `off` or
 * `separate` compute (confirmed byte-identical against the pre-Task-7
 * engine; see
 * docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
 * "mix: byte-identical under off and separate").
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
 * Under `mix` that copy is of the WOVEN order, and the size sort discards
 * the weave along with everything else about pass 1's order — deliberately:
 * pass 2 exists purely as the robustness fallback once pass 1's order,
 * whatever shape it had, has already failed to find a fit within budget, and
 * mixing is a preference that has already lost to finding ANY valid
 * arrangement by the time pass 2 runs at all.
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
  present: Student[],
  sexMode: SexMode,
): { groups: number[][] | null; gaveUp: boolean } {
  const shuffledOrder = shuffled(
    blocks.map((_, i) => i),
    random,
  );
  const order =
    sexMode === 'mix'
      ? weaveBySex(blocks, present, shuffledOrder)
      : shuffledOrder;

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

  // A precondition on the ROSTER'S data, not on the requested shape or the
  // rules the teacher wrote -- the same tier as duplicateNumber and
  // noStudents above, both of which also ask "is this data usable" before
  // anything downstream (mode validation, block-building, the search) is
  // asked to make sense of it. So it is checked here, before mode
  // validation and before togetherApartClash below, rather than closer to
  // where `sex` is actually consumed (`placeBlocks`'s weave).
  //
  // That ordering is deliberate, not just "as early as it can be". This
  // guard is a caller-contract violation -- stage 2 disables the mix and
  // separate switches until every student being grouped already has a sex,
  // so a real teacher cannot reach it -- while an invalid group count, too
  // many groups, and a together/apart clash are things a teacher genuinely
  // types. Even so, it fires FIRST: duplicateNumber and noStudents do not
  // spend effort validating a request's SHAPE when the roster's DATA is not
  // even usable yet, and this guard is the same kind of check -- "can I
  // trust what I was handed" -- just conditioned on `sexMode` the way
  // invalidGroupSize is conditioned on `mode.kind`. A non-page caller (a
  // test, a future integration) that violates the contract gets told about
  // ITS mistake first, on the same footing its other data mistakes already
  // are, rather than being sent on a detour through mode/rule errors that
  // are moot the moment this module cannot honour the setting it was asked
  // to run under.
  //
  // Scoped to `sexMode !== 'off'` as of Task 8a -- `mix` AND `separate`,
  // widened from `mix` only. Task 7 scoped it narrower because at the time
  // `separate` did not read `sex` anywhere in this file, so refusing a
  // `separate` roster over a field that mode never consulted would have
  // been a pure regression; see
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "mix: byte-identical under off and separate" for the measurement that
  // pinned `separate`'s output as unaffected by `mix`'s existence. That
  // measurement is about PLACEMENT, not this guard, and stays true today:
  // Task 8a does not touch `placeBlocks`, so `separate` still places
  // exactly as `off` does for any roster this guard now lets through (see
  // the "places exactly like off" test in grouping.test.ts's "sex mode:
  // separate" block). What changed is only which rosters get that far.
  // Task 8a widens the predicate deliberately, ahead of Task 8b's
  // separate-mode placement landing -- see `ERROR_CODES.sexNeedsAllSet`'s
  // doc comment for the full reasoning and the tripwire test this flips.
  //
  // Fix round 1, F-2: reads `!== 'M' && !== 'F'`, not `=== null`. The old
  // check closed exactly one hole -- a `sex` of literally `null` -- and left
  // every other off-domain value (`undefined`, `''`, `'m'`, `'male'`, `0`,
  // anything a non-TypeScript caller might send; this repo has no runtime
  // type checker, see the module doc) to slip straight through, because
  // `undefined === null` is false. A slipped-through value then vanished
  // silently in `weaveBySex`'s old two-list split (neither `=== 'M'` nor
  // `=== 'F'` nor `=== null` matched it, so it landed in NONE of `boys`,
  // `girls`, `rest` and never reached `order` at all) -- `ok: true` with one
  // fewer student than the roster held, no error, nothing to tell a teacher
  // who would have printed that group list. Measured: `sex: undefined` on
  // one student in a 6-student roster returned five. See
  // docs/superpowers/notes/2026-08-06-classroom-groups-v2-engine-measurements.md,
  // "What slipped through before the fix" for the reproduction. This check
  // is the door, not one hole in it: anything that is not exactly `'M'` or
  // `'F'` is refused here, by name, before it can reach the weave (or, as
  // of Task 8a, `separate`'s own future placement) at all.
  if (input.sexMode === 'mix' || input.sexMode === 'separate') {
    const unset = present
      .filter((s) => s.sex !== 'M' && s.sex !== 'F')
      .map((s) => s.number);
    if (unset.length > 0) {
      return fail({ code: ERROR_CODES.sexNeedsAllSet, students: unset });
    }
  }

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

  const sizes = targetSizes(present.length, mode, leftovers);
  const blocks = buildBlocks(present);

  // Caught here rather than left to the placer. The search would fail on a
  // self-conflicting block and report "no arrangement exists" -- true, and
  // the wrong sentence: the teacher asked for something impossible, not for
  // something merely unreachable, and only one of those tells them what to
  // fix.
  for (const block of blocks) {
    const seenLetters = new Map<string, number[]>();
    for (const i of block) {
      const letter = present[i].apart;
      if (letter === null) continue;
      const list = seenLetters.get(letter) ?? [];
      list.push(present[i].number);
      seenLetters.set(letter, list);
    }
    for (const numbers of seenLetters.values()) {
      if (numbers.length > 1) {
        return fail({
          code: ERROR_CODES.togetherApartClash,
          students: numbers,
        });
      }
    }
  }

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

  // Block-indexed conflict adjacency from apart-letters (see buildConflicts).
  // This IS what `assign` places against below -- there is no separate
  // student-indexed adjacency and no later substitution step, so the bug the
  // Task 4 addendum used to warn about here (handing `assign` a
  // student-indexed set and reading it as if it were block-indexed) has no
  // seam left for it to reappear at: one adjacency, built at block width,
  // used everywhere a conflict is asked about.
  const adj = buildConflicts(present, blocks);

  // "Is an apart-rule actually live" has two possible readings, and they
  // disagree. `present.some((s) => s.apart !== null)` is true the moment ONE
  // student carries a letter, even though a letter only one person holds
  // constrains nobody -- buildConflicts never gives a lone holder an edge.
  // Deriving it from the adjacency instead -- some block has a real conflict
  // -- is the truthful reading: it can only be true when the search's own
  // input actually contains a constraint. It is computed once, here, and
  // both the clique gate immediately below and the failure attribution
  // further down read this SAME flag, so the two can never disagree with
  // each other about what "in play" means.
  const apartInPlay = adj.some((conflicts) => conflicts.size > 0);

  if (apartInPlay) {
    const clique = largestMutualConflict(adj);
    if (clique.length > sizes.length) {
      return fail({
        code: ERROR_CODES.keepApartImpossible,
        // ONE representative per block, not every member of every block
        // (Fix round 1, F-1). Every member would name students who are not
        // mutually apart at all -- a block can hold students with no
        // apart-letter of their own (they are there only because a
        // together-letter binds them to a real letter-holder), and naming
        // them alongside their blockmate asserts that two students who must
        // be kept TOGETHER also need to be kept apart from each other. It
        // also makes `students.length` bigger than `groupsNeeded`,
        // self-contradicting the sentence it feeds: N mutually-apart
        // students need N groups, not fewer.
        //
        // Every block reported here is guaranteed to have at least one
        // apart-letter holder: `buildConflicts` only ever gives a block an
        // edge because one of its members shares a letter with a member of
        // another block, and a clique this gate reports always has at least
        // two blocks (`clique.length > sizes.length >= 1`). So `.find` below
        // always succeeds; the `?? blocks[b][0]` fallback is unreachable
        // defensive code, not a real path. Numbers, because identity is the
        // number (Student.number); renderError's resolver turns these into
        // names for a page that has a roster to resolve them against.
        students: clique.map((b) => {
          const holder = blocks[b].find((i) => present[i].apart !== null);
          return present[holder ?? blocks[b][0]].number;
        }),
        groupsNeeded: clique.length,
      });
    }
  }

  // Two-pass placement -- see `placeBlocks`. Pass 1 is the shuffled order,
  // unsorted apart from Task 7's boy-girl weave under `mix`, which is what
  // supplies arrangement variety; pass 2 (first-fit-decreasing) runs only if
  // pass 1 gives up (Fix round 2, closing the arrangement-variety regression
  // Fix round 1's sort caused). `adj` is real now: a block-vs-block conflict
  // can and does turn away a placement that capacity alone would have
  // allowed, in both passes.
  const { groups: placed, gaveUp } = placeBlocks(
    blocks,
    sizes,
    adj,
    random,
    present,
    input.sexMode,
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
    // problem worse. Decided from what is actually in play: a block bigger
    // than one student means a together-letter is live; `apartInPlay`
    // (computed once, above, and reused here rather than from a second,
    // different definition) means an apart-letter conflict is live.
    //
    // Task 5 resolves the third case Task 4 left as a stated placeholder:
    // BOTH kinds of rule live at once. Neither single-rule code is safe to
    // guess here -- their remedies are opposites (bigger groups make a
    // together clash better and a keep-apart clash worse; more groups is the
    // reverse), and the search genuinely cannot say which rule is the one
    // actually blocking a fit, only that it could not find one. Guessing
    // sends the teacher the wrong way exactly as often as the right one.
    // BOTH_RULES_NO_ARRANGEMENT / BOTH_RULES_SEARCH_GAVE_UP say what is
    // actually known: both rules are named, both remedies are offered, and
    // neither is claimed to be the cause.
    const togetherInPlay = blocks.some((block) => block.length > 1);

    if (togetherInPlay && apartInPlay) {
      return fail(
        gaveUp
          ? { code: ERROR_CODES.bothRulesSearchGaveUp }
          : {
              code: ERROR_CODES.bothRulesNoArrangement,
              groupsTried: sizes.length,
            },
      );
    }

    if (togetherInPlay) {
      return fail(
        gaveUp
          ? { code: ERROR_CODES.togetherSearchGaveUp }
          : {
              code: ERROR_CODES.togetherNoArrangement,
              groupsTried: sizes.length,
            },
      );
    }

    // apartInPlay must be true here: `placed === null` only happens when
    // `assign` actually turned a placement away, and with togetherInPlay
    // false every block is a singleton, which cannot fail on capacity alone
    // (sizes always sums to present.length -- see targetSizes) -- only a
    // live conflict can. Written as the fallback rather than
    // `else if (apartInPlay)` so a future change to either flag's
    // definition fails safe into the strongest claim's OPPOSITE (a refusal
    // rather than a silent wrong success), not into silence.
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
  // No sexMode branches to an empty list yet -- WARNING_CODES.sexSpillover
  // is unreachable until Task 8b's separate-mode placement lands (see its
  // doc comment above). Every success from this build carries `[]`.
  return succeed(
    slots.map((i) =>
      placed[i].flatMap((b) => blocks[b].map((j) => present[j])),
    ),
    [],
  );
}
