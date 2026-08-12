# Classroom Group Creator v2 — Stage 1: data model and engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `src/lib/grouping.ts` so a student is a record identified by a number rather than a name, and so the engine understands absence, together/apart letters, sex-based grouping and pinned groups — with every failure reported honestly.

**Architecture:** One pure module, no DOM, no storage, randomness injected. Students are normalised into an internal array once; every constraint is then expressed over *indices* into that array. Together-letters collapse students into **blocks** that must be placed as a unit; apart-letters become a conflict graph between blocks; the existing backtracking placer is retargeted from students onto blocks so its budget, its clique certificate and its honest "I stopped looking" all survive unchanged. Sex handling wraps the placer rather than living inside it: `mix` orders the blocks before dealing, `separate` partitions them and places each sex independently.

**Tech Stack:** TypeScript, Vitest (`npm run test:unit`), Astro (untouched in this stage). No new dependencies — this repo ships no third-party runtime code and that does not change.

**Spec:** `docs/superpowers/specs/2026-08-06-classroom-groups-v2-design.md`. This plan implements **stage 1 of 5** (spec §14). Stages 2–5 are separate plans and depend on the types this one produces.

## Global Constraints

- **Logic is pure.** `src/lib/grouping.ts` never touches the DOM, `localStorage`, `window` or `Date`. Randomness arrives as `random: () => number`.
- **No new dependencies.** Nothing is added to `package.json`.
- **`MAX_STUDENTS = 500`** stays and stays exported — it is the single source of truth for the page's `max` attribute. `MAX_ROSTER` belongs to stage 3 and is **not** added here.
- **`SEARCH_NODE_CAP = 200_000`** stays. Exhausting it means *"I stopped looking"* and must never be reported as *"no arrangement exists"*.
- **Errors are a discriminated union**, each variant carrying exactly the data its message needs — never a bag of optionals. Follow the existing pattern and its comment.
- **Identity is the number.** Every error and warning that names students carries **`number[]`** (student numbers), never names. The page resolves a number to `name ?? "Student N"`. This is the defect being fixed; do not reintroduce name matching.
- **There is no type checker in this repo or in CI.** Every guarantee must be asserted by a runtime test. A type alone proves nothing here.
- **Tests observed RED first.** Write the test, run it, see it fail for the stated reason, then implement. A test that has never failed has never been shown to test anything.
- **Commit after every task.** Small commits, present-tense subject, no `--no-verify`.
- **Run tests with `npm run test:unit`.** A single file is `npx vitest run tests/unit/grouping.test.ts`; a single case adds `-t 'name'`. **Check the exit code** — a `-t` filter that matches nothing exits 0 with everything skipped, which looks exactly like success.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/grouping.ts` | **Modified throughout.** The whole engine. Grows enough in this stage that the block-placement helpers are worth keeping in one clearly-commented region rather than being split out — the working agreement keeps logic in one pure module, and a second file would be split by layer rather than by responsibility. |
| `tests/unit/grouping.test.ts` | **Modified throughout.** Existing suite: 38 cases. Cases covering name-based keep-apart and `parseKeepApart` are deleted in Task 1 alongside the code they cover; everything else is extended. |

Nothing else is touched in this stage. `src/scripts/classroom-groups.ts` still calls the old signature and **will not compile against the new one** — that is expected and is stage 2's job. Because there is no type checker, the page keeps running against a mismatched library until then, so **stage 1 must not be deployed on its own**; the spec's "merged behind the scenes, deployed once at the end" is what covers this.

---

## Task 1: Retire the name-based contract

Deletes what the letters replace, so nothing later is written against a surface that is going away.

> **AS BUILT — this task's scope grew twice during execution. Recorded here so the plan matches
> the commits.** Ledger:
> `.superpowers/sdd/2026-08-06-classroom-groups-v2-stage-1-engine/progress.md`.
>
> 1. **`src/lib/i18n/index.ts` had to change too** (`d4c4745`). Deleting the two `ERROR_CODES`
>    entries left their two `case` labels in `renderError` evaluating to `case undefined:`, so an
>    unknown-name sample rendered the *needs-names* sentence and `tests/unit/i18n.test.ts` went
>    red. A red baseline across the remaining ten tasks would blind every one of them to breakage
>    it caused, so the dead copy and its i18n cases were deleted here. The locale files are a
>    review surface with no type checker behind them — deleting an error code is never a
>    one-file change.
> 2. **Two of the deleted test cases covered still-live behaviour** (`a62a829`, after review).
>    Restoring that cover is part of this task:
>    - `nameKey` deliberately does not fold case. Pin it with **4 students and 2 pairs**, not the
>      obvious 3-and-1 — case-folding only ever *adds* conflict edges, so a "these two are never
>      grouped" assertion survives the mutation and proves nothing. The 4/2 shape makes the
>      groupmate a logical necessity, so the mutant yields no arrangement at all.
>    - Removing the roster guard turned a loud refusal into a **silent dropped constraint**. Pin
>      the fallthrough with **two** tests — the guard had two independent triggers (unknown name
>      in a pair; a nameless class). These are transitional and die with Task 2.
>    - Correct the two now-false doc comments in `src/lib/grouping.ts`: `GroupingInput.keepApart`
>      no longer "requires named students", and the `GroupingError` example must not cite the
>      retired `KEEP_APART_UNKNOWN_NAME`.

**Files:**
- Modify: `src/lib/grouping.ts` — delete `parseKeepApart`, `buildConflicts`'s name lookup, two error codes; correct two doc comments
- Modify: `src/lib/i18n/index.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/id.ts` — delete the two dead `renderError` cases and their copy
- Modify: `tests/unit/grouping.test.ts` — delete the cases covering them, and restore cover for the two live invariants above

**Interfaces:**
- Consumes: nothing
- Produces: `ERROR_CODES` without `keepApartNeedsNames` / `keepApartUnknownName`; no `parseKeepApart` export

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/grouping.test.ts`:

```ts
import * as grouping from '../../src/lib/grouping';

describe('the name-based keep-apart surface is gone', () => {
  it('no longer exports parseKeepApart', () => {
    expect((grouping as Record<string, unknown>).parseKeepApart).toBeUndefined();
  });

  it('no longer has error codes that only free text could produce', () => {
    // A letter needs no names and cannot be misspelt, so neither failure can
    // occur. Leaving the codes would leave dead branches that no test reaches.
    const codes = Object.values(ERROR_CODES);
    expect(codes).not.toContain('KEEP_APART_NEEDS_NAMES');
    expect(codes).not.toContain('KEEP_APART_UNKNOWN_NAME');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```
npx vitest run tests/unit/grouping.test.ts -t 'name-based keep-apart surface'
```

Expected: 2 failed — `parseKeepApart` is defined, and both codes are present.

- [ ] **Step 3: Delete the code**

In `src/lib/grouping.ts`:
1. Delete the whole `parseKeepApart` function and its doc comment (currently lines ~205–232).
2. Remove these two entries from `ERROR_CODES`:
   ```ts
   keepApartNeedsNames: 'KEEP_APART_NEEDS_NAMES',
   keepApartUnknownName: 'KEEP_APART_UNKNOWN_NAME',
   ```
3. Remove their two variants from the `GroupingError` union.
4. In `buildGroups`, delete the `if (pairs.length > 0) { if (!named) … unknown … }` block (currently ~378–398) and the now-unused `const named = …`.

- [ ] **Step 4: Delete the tests that covered them**

In `tests/unit/grouping.test.ts`, delete every case that imports or calls `parseKeepApart`, and every case asserting `KEEP_APART_NEEDS_NAMES` or `KEEP_APART_UNKNOWN_NAME`. Remove `parseKeepApart` from the import list at the top.

**Do not leave them skipped.** A skipped test for a deleted feature is a green suite that asserts nothing, and it is how a removed feature comes back by accident.

- [ ] **Step 5: Run the whole file**

```
npx vitest run tests/unit/grouping.test.ts
```

Expected: PASS. The suite is smaller than it was — that is the point of this task.

- [ ] **Step 6: Commit**

```bash
git add src/lib/grouping.ts tests/unit/grouping.test.ts
git commit -m "refactor(grouping): retire the name-based keep-apart surface

parseKeepApart parses a free-text box that the letters replace, and two
error codes describe failures a letter cannot produce -- it needs no
names and cannot be misspelt. Deleted with the tests that covered them
rather than left exported with no caller."
```

---

## Task 2: A student is a record, identified by a number

**Files:**
- Modify: `src/lib/grouping.ts` — `Student`, `GroupingInput`, `normaliseStudents`, `requestedSize`
- Modify: `tests/unit/grouping.test.ts`
- **Create: `tests/unit/factories.ts`** — `student()`, `seeded()`, `shape()`, `groupOf()`

> **Why a factory file rather than a helper at the top of the suite.** `student()` is used ~200 times
> across this stage and again in stage 3's roster tests. Defined twice, the two drift — and a factory
> whose defaults differ between suites produces two different meanings for "a student with nothing
> set", which is the shape of a bug nobody looks for. Move `seeded`, `shape` and `groupOf` there at
> the same time and import them back into `grouping.test.ts`.

**Interfaces:**
- Consumes: Task 1's trimmed `ERROR_CODES`
- Produces:
  ```ts
  export interface Student {
    number: number;
    name: string | null;
    sex: 'M' | 'F' | null;
    absent: boolean;
    together: string | null;
    apart: string | null;
  }
  export interface GroupingInput {
    students: number | Student[];
    mode: Mode;
    leftovers: Leftovers;
    sexMode: SexMode;      // Task 7
    pinned: Student[][];   // Task 9
    random: () => number;
  }
  export type SexMode = 'off' | 'mix' | 'separate';
  ```
  plus `ERROR_CODES.duplicateNumber` = `'DUPLICATE_NUMBER'` carrying `{ number: number }`.

> **Note for the implementer:** add `sexMode` and `pinned` to `GroupingInput` **now**, in this task, and default them in the test helper. Tasks 7 and 9 give them behaviour. Adding them later would mean editing every test's input shape twice.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/factories.ts`:

```ts
import type { Student } from '../../src/lib/grouping';

/** A record with the boring fields filled in, so tests state only what they mean. */
export const student = (over: Partial<Student> & { number: number }): Student => ({
  name: null, sex: null, absent: false, together: null, apart: null, ...over,
});

/** Group sizes, largest first — the shape of a split, independent of who landed where. */
export const shape = (groups: Student[][]): number[] =>
  groups.map((g) => g.length).sort((a, b) => b - a);

/** The group containing this student number. */
export const groupOf = (groups: Student[][], number: number): Student[] | undefined =>
  groups.find((g) => g.some((s) => s.number === number));

// `seeded` moves here unchanged from grouping.test.ts.
```

Then in `tests/unit/grouping.test.ts`:

```ts
import { student, shape, groupOf, seeded } from './factories';

describe('students are records identified by a number', () => {
  it('keeps the teacher\'s numbers rather than renumbering from 1', () => {
    const out = buildGroups(base({
      students: [student({ number: 4, name: 'Dewi' }), student({ number: 9, name: 'Gita' })],
      mode: { kind: 'groupCount', count: 1 },
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.groups[0].map((s) => s.number).sort((a, b) => a - b)).toEqual([4, 9]);
  });

  it('accepts gaps in the numbers', () => {
    const out = buildGroups(base({
      students: [1, 2, 3, 5, 8].map((n) => student({ number: n })),
      mode: { kind: 'groupCount', count: 1 },
    }));
    expect(out.ok).toBe(true);
  });

  it('refuses two students sharing a number, naming it', () => {
    const out = buildGroups(base({
      students: [student({ number: 5, name: 'Eko' }), student({ number: 5, name: 'Ana' })],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({ code: ERROR_CODES.duplicateNumber, number: 5 });
  });

  it('still takes a bare count, and numbers those 1..N', () => {
    const out = buildGroups(base({ students: 3, mode: { kind: 'groupCount', count: 1 } }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.groups[0].map((s) => s.number).sort()).toEqual([1, 2, 3]);
    expect(out.result.groups[0].every((s) => s.name === null)).toBe(true);
  });

  it('counts a record list before building it, so 501 records is refused', () => {
    const many = Array.from({ length: MAX_STUDENTS + 1 }, (_, i) => student({ number: i + 1 }));
    const out = buildGroups(base({ students: many }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({ code: ERROR_CODES.tooManyStudents, maxStudents: MAX_STUDENTS });
  });
});
```

Update the `base()` helper in the same file:

```ts
const base = (over: Partial<GroupingInput> = {}): GroupingInput => ({
  students: 22,
  mode: { kind: 'perGroup', size: 4 },
  leftovers: 'spread',
  sexMode: 'off',
  pinned: [],
  random: seeded(1),
  ...over,
});
```

- [ ] **Step 2: Run and watch them fail**

```
npx vitest run tests/unit/grouping.test.ts -t 'students are records'
```

Expected: 5 failed. Records arrive where strings were expected, so `normaliseStudents` produces `{ id, name: undefined }` and every number assertion fails; `duplicateNumber` does not exist.

- [ ] **Step 3: Implement**

```ts
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

export type SexMode = 'off' | 'mix' | 'separate';

export interface GroupingInput {
  /** A bare count (anonymous students) or the roster. */
  students: number | Student[];
  mode: Mode;
  leftovers: Leftovers;
  sexMode: SexMode;
  /** Groups the teacher pinned; left exactly as they are. */
  pinned: Student[][];
  random: () => number;
}
```

Add to `ERROR_CODES` and the union:

```ts
duplicateNumber: 'DUPLICATE_NUMBER',
```
```ts
| { code: typeof ERROR_CODES.duplicateNumber; number: number }
```

Replace `requestedSize` and `normaliseStudents`:

```ts
function requestedSize(input: number | Student[]): number {
  return typeof input === 'number' ? input : input.length;
}

const anonymous = (number: number): Student => ({
  number, name: null, sex: null, absent: false, together: null, apart: null,
});

function normaliseStudents(input: number | Student[]): Student[] {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 1) return [];
    return Array.from({ length: Math.floor(input) }, (_, i) => anonymous(i + 1));
  }
  // A record list is taken as given. Renumbering it would throw away the one
  // thing that makes a constraint unambiguous, which is the whole point of
  // this rewrite: two children called Ana are two numbers, not one name.
  return input.map((s) => ({ ...s, name: s.name === null ? null : nameKey(s.name) }));
}
```

In `buildGroups`, immediately after `if (students.length === 0)`:

```ts
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
```

Keep `nameKey` — it still normalises names for display, even though nothing matches on them now. Update its doc comment: it is no longer load-bearing for correctness, only for consistent rendering.

- [ ] **Step 4: Run and watch them pass**

```
npx vitest run tests/unit/grouping.test.ts
```

Expected: PASS, including the pre-existing cases — a bare count behaves exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.ts tests/unit/grouping.test.ts
git commit -m "feat(grouping): a student is a record identified by its number

id becomes number, and the roster arrives as records rather than
strings. The teacher's numbers survive, gaps and all, because a number
is what makes a constraint unambiguous -- two children called Ana are
two numbers, not one name. Duplicates are refused, naming the number."
```

---

## Task 3: Absence

**Files:**
- Modify: `src/lib/grouping.ts` — `buildGroups`
- Modify: `tests/unit/grouping.test.ts`

**Interfaces:**
- Consumes: `Student.absent` from Task 2
- Produces: `buildGroups` grouping only students where `absent === false`

- [ ] **Step 1: Write the failing tests**

```ts
describe('absence', () => {
  const roster = [
    student({ number: 1, name: 'Ana' }),
    student({ number: 2, name: 'Budi' }),
    student({ number: 3, name: 'Citra', absent: true }),
    student({ number: 4, name: 'Dewi' }),
  ];

  it('leaves an absent student out of the results entirely', () => {
    const out = buildGroups(base({ students: roster, mode: { kind: 'groupCount', count: 2 } }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const numbers = out.result.groups.flat().map((s) => s.number);
    expect(numbers).not.toContain(3);
    expect(numbers.sort()).toEqual([1, 2, 4]);
  });

  it('sizes the groups from those present, not from the roster', () => {
    // 4 on the roster, 3 present, groups of 3 -> one group of 3, not of 4.
    const out = buildGroups(base({ students: roster, mode: { kind: 'perGroup', size: 3 } }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(shape(out.result.groups)).toEqual([3]);
  });

  it('refuses when everybody is absent, as if there were no students', () => {
    const out = buildGroups(base({
      students: roster.map((s) => ({ ...s, absent: true })),
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({ code: ERROR_CODES.noStudents });
  });

  it('counts absent students against MAX_STUDENTS, because the roster is built first', () => {
    // The cap exists to stop a mis-keyed number allocating until the tab dies.
    // That allocation happens before anyone is filtered, so the guard must too.
    const many = Array.from({ length: MAX_STUDENTS + 1 }, (_, i) =>
      student({ number: i + 1, absent: true }));
    const out = buildGroups(base({ students: many }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.tooManyStudents);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```
npx vitest run tests/unit/grouping.test.ts -t 'absence'
```

Expected: 3 failed (the `MAX_STUDENTS` one already passes, because the size guard runs before normalisation — keep it, it pins that ordering against a future refactor that moves the filter earlier).

- [ ] **Step 3: Implement**

In `buildGroups`, after the duplicate-number guard and **before** the empty check:

```ts
  // Absence is applied here, after the roster is counted and validated, so a
  // duplicate number is still caught in a row that is out today -- the teacher
  // is going to untick it tomorrow.
  const present = students.filter((s) => !s.absent);
  if (present.length === 0) return fail({ code: ERROR_CODES.noStudents });
```

Then use `present` — not `students` — everywhere below: `targetSizes(present.length, …)`, the `groupCount > present.length` check, the conflict graph, the ordering and the final mapping.

Move the existing `if (students.length === 0) return fail({ code: ERROR_CODES.noStudents })` so it still fires for an empty roster; the `present` check then covers "everyone is out".

- [ ] **Step 4: Run and watch them pass**

```
npx vitest run tests/unit/grouping.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.ts tests/unit/grouping.test.ts
git commit -m "feat(grouping): absent students are not grouped

Filtered after the roster is counted and validated, so a duplicate
number in a row that is out today is still caught -- the teacher unticks
it tomorrow. Everyone absent reads as no students."
```

---

## Task 4: Together letters — students placed as one block

The engine's biggest structural change. The placer stops moving students and starts moving blocks.

**Files:**
- Modify: `src/lib/grouping.ts` — new `buildBlocks`, retargeted `assign`
- Modify: `tests/unit/grouping.test.ts`

**Interfaces:**
- Consumes: `Student.together` from Task 2, `present` from Task 3
- Produces:
  ```ts
  /** Indices into `present` that must share a group. */
  type Block = number[];
  function buildBlocks(present: Student[]): Block[];
  ```
  plus `ERROR_CODES.togetherUnitTooLarge` carrying `{ letter: string; unit: number; groupSize: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
/** The group containing this student number. */
const groupOf = (groups: Student[][], number: number): Student[] | undefined =>
  groups.find((g) => g.some((s) => s.number === number));

describe('together letters', () => {
  it('places everyone sharing a letter in the same group', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, name: 'Ana', together: 'A' }),
        student({ number: 2, name: 'Budi', together: 'A' }),
        student({ number: 3, name: 'Citra' }),
        student({ number: 4, name: 'Dewi' }),
        student({ number: 5, name: 'Eko' }),
        student({ number: 6, name: 'Gita' }),
      ],
      mode: { kind: 'groupCount', count: 3 },
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const g = groupOf(out.result.groups, 1);
    expect(g?.map((s) => s.number)).toContain(2);
  });

  it('keeps two different letters apart from each other only by chance, not by rule', () => {
    // A and B are two units. Nothing says they may not share a group, and
    // asserting that they do not would be asserting a rule nobody wrote.
    const out = buildGroups(base({
      students: [
        student({ number: 1, together: 'A' }), student({ number: 2, together: 'A' }),
        student({ number: 3, together: 'B' }), student({ number: 4, together: 'B' }),
      ],
      mode: { kind: 'groupCount', count: 1 },
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.groups[0]).toHaveLength(4);
  });

  it('refuses a unit larger than the group, naming the letter and both numbers', () => {
    const out = buildGroups(base({
      students: Array.from({ length: 8 }, (_, i) =>
        student({ number: i + 1, together: i < 6 ? 'A' : null })),
      mode: { kind: 'perGroup', size: 4 },
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.togetherUnitTooLarge, letter: 'A', unit: 6, groupSize: 4,
    });
  });

  it('refuses the same clash reached by shrinking the groups instead', () => {
    // Same contradiction, opposite direction. One check has to catch both or
    // the teacher meets it from one side and not the other.
    const out = buildGroups(base({
      students: Array.from({ length: 8 }, (_, i) =>
        student({ number: i + 1, together: i < 3 ? 'A' : null })),
      mode: { kind: 'groupCount', count: 4 },   // 8 into 4 -> groups of 2
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.togetherUnitTooLarge);
  });

  it('ignores the letter of an absent student', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, name: 'Ana', together: 'A', absent: true }),
        student({ number: 2, name: 'Budi', together: 'A' }),
        student({ number: 3, name: 'Citra' }),
      ],
      mode: { kind: 'groupCount', count: 3 },
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Budi's unit is now one student, so he can go anywhere.
    expect(out.result.groups.flat()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```
npx vitest run tests/unit/grouping.test.ts -t 'together letters'
```

Expected: 5 failed — `together` is ignored entirely and `togetherUnitTooLarge` does not exist.

- [ ] **Step 3: Implement**

Add the code, the union variant, and the block builder:

```ts
togetherUnitTooLarge: 'TOGETHER_UNIT_TOO_LARGE',
```
```ts
| {
    code: typeof ERROR_CODES.togetherUnitTooLarge;
    letter: string;
    unit: number;
    groupSize: number;
  }
```

```ts
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
```

In `buildGroups`, after `const sizes = targetSizes(present.length, mode, leftovers)`:

```ts
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
```

Retarget `assign` from students onto blocks — the diff is three lines:

```ts
function assign(
  order: number[],          // block indices, most-constrained first
  blocks: Block[],
  sizes: number[],
  adj: Set<number>[],       // conflicts BETWEEN BLOCKS
): { groups: number[][] | null; gaveUp: boolean } {
  const groups: number[][] = sizes.map(() => []);   // holds block indices
  let nodes = 0;
  let gaveUp = false;
  const filled = sizes.map(() => 0);

  const place = (idx: number): boolean => {
    if (idx === order.length) return true;
    if (++nodes > SEARCH_NODE_CAP) { gaveUp = true; return false; }
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
```

And at the end of `buildGroups`, expand blocks back into students:

```ts
  result: {
    groups: slots.map((i) => placed[i].flatMap((b) => blocks[b].map((j) => present[j]))),
  },
```

- [ ] **Step 4: Run the whole file**

```
npx vitest run tests/unit/grouping.test.ts
```

Expected: PASS. Every pre-existing case is a roster of singleton blocks, so nothing about the old behaviour changes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.ts tests/unit/grouping.test.ts
git commit -m "feat(grouping): together letters place students as one block

Students sharing a letter collapse into a block; a student without one
is a block of one, so the placer has exactly one kind of thing to move
and its node budget and honest failures survive untouched.

A unit larger than the largest group is refused, and refused from both
directions -- growing the unit and shrinking the groups reach the same
contradiction and must not behave differently."
```

---

## Task 5: Apart letters — mutual separation between blocks

> **⚠️ THIS TASK CARRIES A DEBT FROM TASK 2. Read before writing any new test.**
>
> Task 2 removed `keepApart`, which left `pairs` permanently empty. That gated off the entire
> conflict machinery, so from Task 2 until you refill `pairs` the following are **unreachable
> through the public API and therefore covered by nothing**:
> `largestMutualConflict`, the clique gate, `assign`'s conflict check,
> `KEEP_APART_NO_ARRANGEMENT`, and `KEEP_APART_SEARCH_GAVE_UP`.
> The comment at the `pairs` construction site in `src/lib/grouping.ts` says the same thing.
>
> **You must RE-PROVE these, not build letter tests on top of the gap.** Two guarantees
> specifically, both of which the deleted tests existed to protect:
>
> 1. **Two students who must be apart never share a group.** This is the headline promise of the
>    whole feature and currently has zero cover.
> 2. **Exhausting `SEARCH_NODE_CAP` is never reported as "no arrangement exists".** The spec
>    mandates this distinction. A refusal must not assert something untrue — the old code once
>    shipped a bug reporting five students as mutually inseparable when it had merely stopped
>    looking, and the regression tests for it are gone.
>
> For (2) you need a pathological input. The retired `moonMoser` helper's measurements are
> preserved in the comment above `SEARCH_NODE_CAP`: uncapped, 24 students took 27 ms, 36 took
> 471 ms, 42 took 7.3 s, 48 took 121.7 s. **Re-measure — do not cite the comment as proof.** The
> engine has changed shape since those numbers were taken, and a test that no longer reaches the
> cap passes for the wrong reason.
>
> When you migrate `keepApartImpossible.students` from `string[]` to `number[]`, that is the last
> place in the engine where identity was a name. Check nothing else still matches on one.

**Files:**
- Modify: `src/lib/grouping.ts` — `buildConflicts`, the clique certificate
- Modify: `tests/unit/grouping.test.ts`

**Interfaces:**
- Consumes: `Block` and `buildBlocks` from Task 4
- Produces: `buildConflicts(present: Student[], blocks: Block[]): Set<number>[]` — adjacency between **block indices**; `keepApartImpossible` now carries `students: number[]`

- [ ] **Step 1: Write the failing tests**

```ts
describe('apart letters', () => {
  it('separates everyone sharing a letter from everyone else sharing it', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, apart: 'X' }), student({ number: 2, apart: 'X' }),
        student({ number: 3, apart: 'X' }), student({ number: 4 }),
        student({ number: 5 }), student({ number: 6 }),
      ],
      mode: { kind: 'groupCount', count: 3 },
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const g of out.result.groups) {
      expect(g.filter((s) => s.apart === 'X')).toHaveLength(1);
    }
  });

  it('treats two different letters as unrelated', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, apart: 'X' }), student({ number: 2, apart: 'Y' }),
      ],
      mode: { kind: 'groupCount', count: 1 },
    }));
    expect(out.ok).toBe(true);   // X and Y have no rule between them
  });

  it('proves impossibility by naming the students, as numbers', () => {
    const out = buildGroups(base({
      students: Array.from({ length: 6 }, (_, i) =>
        student({ number: i + 1, apart: i < 4 ? 'X' : null })),
      mode: { kind: 'groupCount', count: 3 },
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe(ERROR_CODES.keepApartImpossible);
    if (out.error.code !== ERROR_CODES.keepApartImpossible) return;
    expect(out.error.students.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(out.error.groupsNeeded).toBe(4);
  });

  it('ignores the letter of an absent student', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, apart: 'X' }), student({ number: 2, apart: 'X' }),
        student({ number: 3, apart: 'X', absent: true }),
      ],
      mode: { kind: 'groupCount', count: 2 },
    }));
    expect(out.ok).toBe(true);   // two present, two groups
  });

  it('separates whole units, not just the students carrying the letter', () => {
    // Ana is with Budi, and Ana must be away from Citra. Budi therefore cannot
    // be with Citra either -- the unit moves as one, so the conflict does too.
    const out = buildGroups(base({
      students: [
        student({ number: 1, name: 'Ana', together: 'A', apart: 'X' }),
        student({ number: 2, name: 'Budi', together: 'A' }),
        student({ number: 3, name: 'Citra', apart: 'X' }),
        student({ number: 4, name: 'Dewi' }),
      ],
      mode: { kind: 'groupCount', count: 2 },
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const withBudi = groupOf(out.result.groups, 2);
    expect(withBudi?.map((s) => s.number)).not.toContain(3);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```
npx vitest run tests/unit/grouping.test.ts -t 'apart letters'
```

Expected: 5 failed — `apart` is ignored; `buildConflicts` still expects name pairs.

- [ ] **Step 3: Implement**

Replace `buildConflicts` entirely:

```ts
/**
 * Conflict adjacency BETWEEN BLOCKS, from apart-letters.
 *
 * Everyone sharing a letter is mutually separated, so a letter is a set and
 * not a pair. The conflict is recorded between blocks rather than students
 * because a block moves as one: separating Ana from Citra separates everyone
 * kept together with Ana from Citra too.
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
```

`largestMutualConflict` is unchanged — it operates on an adjacency array and does not care what the nodes are. Only its *reporting* changes, in `buildGroups`:

```ts
  const hasApart = present.some((s) => s.apart !== null);
  if (hasApart) {
    const clique = largestMutualConflict(adj);
    if (clique.length > sizes.length) {
      return fail({
        code: ERROR_CODES.keepApartImpossible,
        students: clique.flatMap((b) => blocks[b].map((i) => present[i].number)),
        groupsNeeded: clique.length,
      });
    }
  }
```

Change the union variant from `students: string[]` to `students: number[]`.

Replace the old `pairs`-based gating (`if (pairs.length > 0)`) with `hasApart`, and delete the now-unused `pairs` local and `keepApart` destructuring.

- [ ] **Step 4: Run the whole file**

```
npx vitest run tests/unit/grouping.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.ts tests/unit/grouping.test.ts
git commit -m "feat(grouping): apart letters mutually separate whole blocks

A letter is a set, not a pair: everyone marked X goes in a different
group from everyone else marked X. The conflict is recorded between
blocks because a block moves as one -- separating Ana from Citra
separates whoever is kept together with Ana from Citra too.

The clique certificate now names students by number. Identity is the
number; nothing matches on a name any more."
```

---

## Task 6: A student marked both together and apart

**Files:**
- Modify: `src/lib/grouping.ts`
- Modify: `tests/unit/grouping.test.ts`

**Interfaces:**
- Consumes: Tasks 4 and 5
- Produces: `ERROR_CODES.togetherApartClash` carrying `{ students: number[] }`

- [ ] **Step 1: Write the failing test**

```ts
describe('together and apart at the same time', () => {
  it('refuses two students kept together who are also kept apart', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, name: 'Ana', together: 'A', apart: 'X' }),
        student({ number: 2, name: 'Budi', together: 'A', apart: 'X' }),
        student({ number: 3, name: 'Citra' }),
        student({ number: 4, name: 'Dewi' }),
      ],
      mode: { kind: 'groupCount', count: 2 },
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.togetherApartClash, students: [1, 2],
    });
  });

  it('allows the same apart letter on students who are NOT kept together', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, together: 'A', apart: 'X' }),
        student({ number: 2, together: 'A' }),
        student({ number: 3, apart: 'X' }),
        student({ number: 4 }),
      ],
      mode: { kind: 'groupCount', count: 2 },
    }));
    expect(out.ok).toBe(true);   // 1 and 3 share X but are in different units
  });

  it('does not fire when one of the pair is absent', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, together: 'A', apart: 'X' }),
        student({ number: 2, together: 'A', apart: 'X', absent: true }),
        student({ number: 3 }),
      ],
      mode: { kind: 'groupCount', count: 2 },
    }));
    expect(out.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```
npx vitest run tests/unit/grouping.test.ts -t 'together and apart at the same time'
```

Expected: 1 failed — **but not the way this plan originally predicted.** It said the placer would report `KEEP_APART_NO_ARRANGEMENT`, "true but useless". Task 5's review measured what actually happens, and it is worse:

```
students 1(together:'A', apart:'X'), 2(together:'A', apart:'X'), 3, 4 → groupCount 2
result: ok === true, groups = [[4, 3], [1, 2]]
```

**It succeeds, and seats 1 and 2 together in violation of their own apart-letter.** `buildConflicts` records conflicts between *blocks*, and its `if (!list.includes(b))` guard means a letter held twice inside one block produces no edge at all — so no conflict exists, `apartInPlay` is false, and even the clique gate never runs. The teacher gets a seating plan that breaks the rule they typed, with no signal whatsoever.

So the RED you should observe is `expected false, got true`, not a wrong error code. If you see a wrong error code instead, something changed since this was measured — stop and report rather than proceeding.

This is why the error matters: the alternative to a clash error is not a confusing message, it is silence.

- [ ] **Step 3: Implement**

```ts
togetherApartClash: 'TOGETHER_APART_CLASH',
```
```ts
| { code: typeof ERROR_CODES.togetherApartClash; students: number[] }
```

In `buildGroups`, immediately after `buildBlocks` and **before** the unit-size check:

```ts
  // Caught here rather than left to the placer. The search would fail on a
  // self-conflicting block and report "no arrangement exists" -- true, and the
  // wrong sentence: the teacher asked for something impossible, not for
  // something merely unreachable, and only one of those tells them what to fix.
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
        return fail({ code: ERROR_CODES.togetherApartClash, students: numbers });
      }
    }
  }
```

- [ ] **Step 4: Run and watch them pass**

```
npx vitest run tests/unit/grouping.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.ts tests/unit/grouping.test.ts
git commit -m "feat(grouping): refuse a pair kept together and apart at once

Left to the placer this fails as \"no arrangement exists\" -- true, and
the wrong sentence. The teacher asked for a contradiction, not for
something merely unreachable, and only one of those tells them what to
change."
```

---

## Task 7: Sex mode — mix

**Files:**
- Modify: `src/lib/grouping.ts` — block ordering
- Modify: `tests/unit/grouping.test.ts`

**Interfaces:**
- Consumes: `SexMode` and `Student.sex` from Task 2, blocks from Task 4
- Produces: `ERROR_CODES.sexNeedsAllSet` carrying `{ students: number[] }`

> **A guard, not a feature.** Stage 2 disables both switches until every student being grouped has a sex, so `sexNeedsAllSet` should be unreachable from the page. It exists because this module is the pure logic and must not trust its caller — the spec names four new codes and this is a fifth, added as depth rather than as behaviour. **Flagged to the operator.**

- [ ] **Step 1: Write the failing tests**

```ts
const M = (number: number) => student({ number, sex: 'M' });
const F = (number: number) => student({ number, sex: 'F' });

describe('sex mode: mix', () => {
  it('spreads boys and girls as evenly as the numbers allow', () => {
    const out = buildGroups(base({
      students: [M(1), M(2), M(3), M(4), F(5), F(6), F(7), F(8)],
      mode: { kind: 'groupCount', count: 4 },
      sexMode: 'mix',
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const g of out.result.groups) {
      expect(g.filter((s) => s.sex === 'M')).toHaveLength(1);
      expect(g.filter((s) => s.sex === 'F')).toHaveLength(1);
    }
  });

  it('does the best it can when the numbers do not divide', () => {
    const out = buildGroups(base({
      students: [M(1), M(2), M(3), M(4), M(5), F(6)],
      mode: { kind: 'groupCount', count: 3 },
      sexMode: 'mix',
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // One girl and three groups: exactly one group has her, and no group is
    // empty. Asserting anything stronger would assert an impossibility.
    expect(out.result.groups.filter((g) => g.some((s) => s.sex === 'F'))).toHaveLength(1);
  });

  it('refuses when a student being grouped has no sex set', () => {
    const out = buildGroups(base({
      students: [M(1), F(2), student({ number: 3 })],
      mode: { kind: 'groupCount', count: 1 },
      sexMode: 'mix',
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({ code: ERROR_CODES.sexNeedsAllSet, students: [3] });
  });

  it('does not count an absent student with no sex', () => {
    const out = buildGroups(base({
      students: [M(1), F(2), student({ number: 3, absent: true })],
      mode: { kind: 'groupCount', count: 1 },
      sexMode: 'mix',
    }));
    expect(out.ok).toBe(true);
  });

  it('ignores sex entirely when the mode is off', () => {
    const out = buildGroups(base({
      students: [M(1), F(2), student({ number: 3 })],
      mode: { kind: 'groupCount', count: 1 },
      sexMode: 'off',
    }));
    expect(out.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```
npx vitest run tests/unit/grouping.test.ts -t 'sex mode: mix'
```

Expected: 3 failed (the "off" and absent cases already pass — keep both; they pin that `sexMode: 'off'` stays a no-op and that the guard measures the same population everything else does).

- [ ] **Step 3: Implement**

```ts
sexNeedsAllSet: 'SEX_NEEDS_ALL_SET',
```
```ts
| { code: typeof ERROR_CODES.sexNeedsAllSet; students: number[] }
```

In `buildGroups`, after `present` is computed:

```ts
  if (input.sexMode !== 'off') {
    const unset = present.filter((s) => s.sex === null).map((s) => s.number);
    if (unset.length > 0) {
      return fail({ code: ERROR_CODES.sexNeedsAllSet, students: unset });
    }
  }
```

Then replace the ordering line. Today it is:

```ts
  const order = shuffled(present.map((_, i) => i), random)
    .sort((a, b) => adj[b].size - adj[a].size);
```

It becomes an ordering over **blocks**, with mix interleaving them:

```ts
/**
 * The order blocks are offered to the placer.
 *
 * Most-constrained-first is what keeps the search shallow, and it is applied
 * last so it always wins — mixing is a preference, and a preference must never
 * cost us an arrangement that satisfies a rule.
 *
 * For `mix`, blocks are dealt boys-girls-boys-girls before that sort, so
 * equally-constrained blocks arrive alternating and the greedy first-fit
 * spreads the sexes across groups instead of filling group 1 with boys.
 */
function orderBlocks(
  blocks: Block[],
  present: Student[],
  adj: Set<number>[],
  sexMode: SexMode,
  random: () => number,
): number[] {
  const indices = shuffled(blocks.map((_, i) => i), random);
  if (sexMode !== 'mix') {
    return indices.sort((a, b) => adj[b].size - adj[a].size);
  }

  const sexOf = (b: number): 'M' | 'F' | null => present[blocks[b][0]].sex;
  const boys = indices.filter((b) => sexOf(b) === 'M');
  const girls = indices.filter((b) => sexOf(b) === 'F');
  const rest = indices.filter((b) => sexOf(b) === null);   // mixed units

  const woven: number[] = [];
  for (let i = 0; i < Math.max(boys.length, girls.length); i++) {
    if (i < boys.length) woven.push(boys[i]);
    if (i < girls.length) woven.push(girls[i]);
  }
  return [...woven, ...rest].sort((a, b) => adj[b].size - adj[a].size);
}
```

> `sexOf` reads the **first** member of a block. A together-unit spanning both sexes has no single sex; it falls into `rest` and is dealt last, which is the only honest thing to do with it under `mix`. Under `separate` it is a contradiction — Task 8.

Call it:

```ts
  const order = orderBlocks(blocks, present, adj, input.sexMode, random);
```

- [ ] **Step 4: Run the whole file**

```
npx vitest run tests/unit/grouping.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.ts tests/unit/grouping.test.ts
git commit -m "feat(grouping): sex mode mix, and a guard for unset sexes

Blocks are dealt alternating before the most-constrained-first sort, so
equally-constrained blocks arrive boy-girl-boy-girl and first-fit
spreads them instead of filling group 1 with boys. The sort is applied
last so a rule always beats a preference.

The unset-sex guard should be unreachable from the page, which disables
the switches until every student being grouped has one. It is here
because this module is the pure logic and does not trust its caller."
```

---

## Task 8: Sex mode — separate, and the warnings channel

**Files:**
- Modify: `src/lib/grouping.ts` — `GroupingOutcome` gains warnings; separate-mode placement
- Modify: `tests/unit/grouping.test.ts`

**Interfaces:**
- Consumes: Task 7
- Produces:
  ```ts
  export const WARNING_CODES = {
    sexSpillover: 'SEX_SPILLOVER',
  } as const;
  export type GroupingWarning =
    | { code: typeof WARNING_CODES.sexSpillover; students: number[]; sex: 'M' | 'F' };
  export type GroupingOutcome =
    | { ok: true; result: { groups: Student[][]; warnings: GroupingWarning[] } }
    | { ok: false; error: GroupingError };
  ```
  plus `ERROR_CODES.sexSeparateSplitsUnit` carrying `{ students: number[] }`.

> **Every existing success assertion changes shape.** `result` gains a second field. Add `warnings: []` expectations where the suite asserts the whole `result` object; where it only reads `result.groups`, nothing changes.

- [ ] **Step 1: Write the failing tests**

```ts
describe('sex mode: separate', () => {
  it('makes single-sex groups when the numbers divide', () => {
    const out = buildGroups(base({
      students: [M(1), M(2), M(3), M(4), F(5), F(6), F(7), F(8)],
      mode: { kind: 'perGroup', size: 4 },
      sexMode: 'separate',
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const g of out.result.groups) {
      expect(new Set(g.map((s) => s.sex)).size).toBe(1);
    }
    expect(out.result.warnings).toEqual([]);
  });

  it('warns and names who lands in a group of the other sex', () => {
    // Six boys and two girls into groups of 4: the boys make one group and
    // the girls cannot make one of their own.
    const out = buildGroups(base({
      students: [M(1), M(2), M(3), M(4), M(5), M(6), F(7), F(8)],
      mode: { kind: 'perGroup', size: 4 },
      sexMode: 'separate',
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings).toHaveLength(1);
    expect(out.result.warnings[0]).toEqual({
      code: WARNING_CODES.sexSpillover, students: [7, 8], sex: 'F',
    });
  });

  it('refuses a together-unit that spans both sexes', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, name: 'Ana', sex: 'F', together: 'A' }),
        student({ number: 2, name: 'Budi', sex: 'M', together: 'A' }),
        M(3), F(4),
      ],
      mode: { kind: 'groupCount', count: 2 },
      sexMode: 'separate',
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({
      code: ERROR_CODES.sexSeparateSplitsUnit, students: [1, 2],
    });
  });

  it('allows that same mixed unit under mix, and under off', () => {
    for (const sexMode of ['mix', 'off'] as const) {
      const out = buildGroups(base({
        students: [
          student({ number: 1, sex: 'F', together: 'A' }),
          student({ number: 2, sex: 'M', together: 'A' }),
          M(3), F(4),
        ],
        mode: { kind: 'groupCount', count: 2 },
        sexMode,
      }));
      expect(out.ok, `sexMode ${sexMode}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```
npx vitest run tests/unit/grouping.test.ts -t 'sex mode: separate'
```

Expected: 4 failed — `warnings` does not exist, `separate` is not implemented, `sexSeparateSplitsUnit` does not exist.

- [ ] **Step 3: Implement**

Add the warning types and the error code exactly as given in **Interfaces** above, plus:

```ts
sexSeparateSplitsUnit: 'SEX_SEPARATE_SPLITS_UNIT',
```
```ts
| { code: typeof ERROR_CODES.sexSeparateSplitsUnit; students: number[] }
```

Update `fail` and every `return { ok: true, … }` to carry warnings:

```ts
const succeed = (
  groups: Student[][],
  warnings: GroupingWarning[],
): GroupingOutcome => ({ ok: true, result: { groups, warnings } });
```

In `buildGroups`, under `separate`, before placement:

```ts
  if (input.sexMode === 'separate') {
    for (const block of blocks) {
      const sexes = new Set(block.map((i) => present[i].sex));
      if (sexes.size > 1) {
        return fail({
          code: ERROR_CODES.sexSeparateSplitsUnit,
          students: block.map((i) => present[i].number),
        });
      }
    }
  }
```

Separate-mode placement runs the existing machinery **once per sex** and concatenates:

```ts
/**
 * How many groups each sex gets, and who spills over.
 *
 * A sex with fewer students than a whole group cannot have one of its own, so
 * those students join a group of the other sex and are named in a warning.
 * Silently absorbing them is the failure this exists to prevent: the teacher
 * asked for single-sex groups and would be handed mixed ones with no word said.
 */
function splitBySex(
  present: Student[],
  blocks: Block[],
  perGroup: number,
): { boys: number[]; girls: number[]; spill: number[]; spillSex: 'M' | 'F' | null } {
  const sexOf = (b: number) => present[blocks[b][0]].sex;
  const boys = blocks.map((_, i) => i).filter((b) => sexOf(b) === 'M');
  const girls = blocks.map((_, i) => i).filter((b) => sexOf(b) === 'F');

  const count = (side: number[]) =>
    side.reduce((n, b) => n + blocks[b].length, 0);

  if (count(girls) > 0 && count(girls) < perGroup) {
    return { boys, girls: [], spill: girls, spillSex: 'F' };
  }
  if (count(boys) > 0 && count(boys) < perGroup) {
    return { boys: [], girls, spill: boys, spillSex: 'M' };
  }
  return { boys, girls, spill: [], spillSex: null };
}
```

Then in `buildGroups`, when `sexMode === 'separate'`, place each side against its own `sizes` (recomputed from that side's student count with the same `mode` and `leftovers`), append the spill blocks to the smallest resulting group, and emit:

```ts
    warnings.push({
      code: WARNING_CODES.sexSpillover,
      students: spill.flatMap((b) => blocks[b].map((i) => present[i].number)),
      sex: spillSex,
    });
```

Keep the apart-conflict adjacency global across both sides — a letter separates people regardless of which side they were placed on.

- [ ] **Step 4: Run the whole file**

```
npx vitest run tests/unit/grouping.test.ts
```

Expected: PASS, after adding `warnings: []` to any whole-`result` assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.ts tests/unit/grouping.test.ts
git commit -m "feat(grouping): sex mode separate, and a warnings channel

A successful outcome can now carry warnings, because \"here are your
groups, and two girls are in a group of boys\" is neither a success to
report silently nor a failure to refuse.

A sex with fewer students than a whole group cannot have one of its own;
those students join a group of the other sex and are named. Silently
absorbing them is exactly the failure this prevents. A together-unit
spanning both sexes is a contradiction under separate and is refused."
```

---

## Task 9: Pinned groups

**Files:**
- Modify: `src/lib/grouping.ts`
- Modify: `tests/unit/grouping.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces: `ERROR_CODES.pinnedSplitsUnit` carrying `{ students: number[] }`

> **A rule the spec left to this plan.** §7 requires every interaction between pins and the other constraints to be specified, without saying what they are. This plan decides: **a together-unit split across a pinned boundary is refused, naming both students.** It is reachable — pin group 1, then give a letter to someone in group 1 and someone in group 2 — and the alternative, silently unpinning, would undo something the teacher explicitly asked to keep. **Flagged to the operator.**

- [ ] **Step 1: Write the failing tests**

```ts
describe('pinned groups', () => {
  const roster = Array.from({ length: 9 }, (_, i) => student({ number: i + 1 }));

  it('returns pinned groups untouched and redeals the rest', () => {
    const pinned = [[roster[0], roster[1], roster[2]]];
    const out = buildGroups(base({
      students: roster, mode: { kind: 'groupCount', count: 3 }, pinned,
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const first = out.result.groups.find((g) => g.some((s) => s.number === 1));
    expect(first?.map((s) => s.number).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(out.result.groups.flat()).toHaveLength(9);
  });

  it('never places a pinned student anywhere else as well', () => {
    const out = buildGroups(base({
      students: roster,
      mode: { kind: 'groupCount', count: 3 },
      pinned: [[roster[0], roster[1], roster[2]]],
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const numbers = out.result.groups.flat().map((s) => s.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('drops a pinned student who has since been marked absent', () => {
    const withAbsence = roster.map((s) => s.number === 2 ? { ...s, absent: true } : s);
    const out = buildGroups(base({
      students: withAbsence,
      mode: { kind: 'groupCount', count: 3 },
      pinned: [[roster[0], roster[1], roster[2]]],
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.groups.flat().map((s) => s.number)).not.toContain(2);
  });

  it('still honours apart letters among the students being redealt', () => {
    const withLetters = roster.map((s) =>
      s.number >= 4 && s.number <= 6 ? { ...s, apart: 'X' } : s);
    const out = buildGroups(base({
      students: withLetters,
      mode: { kind: 'groupCount', count: 3 },
      pinned: [[withLetters[0], withLetters[1], withLetters[2]]],
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const g of out.result.groups) {
      expect(g.filter((s) => s.apart === 'X').length).toBeLessThanOrEqual(1);
    }
  });

  it('refuses a together-unit split across a pinned boundary, naming both', () => {
    const split = roster.map((s) =>
      s.number === 1 || s.number === 7 ? { ...s, together: 'A' } : s);
    const out = buildGroups(base({
      students: split,
      mode: { kind: 'groupCount', count: 3 },
      pinned: [[split[0], split[1], split[2]]],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({ code: ERROR_CODES.pinnedSplitsUnit, students: [1, 7] });
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```
npx vitest run tests/unit/grouping.test.ts -t 'pinned groups'
```

Expected: 5 failed — `pinned` is accepted and ignored, so pinned students are redealt like everyone else.

- [ ] **Step 3: Implement**

```ts
pinnedSplitsUnit: 'PINNED_SPLITS_UNIT',
```
```ts
| { code: typeof ERROR_CODES.pinnedSplitsUnit; students: number[] }
```

In `buildGroups`, after `present` and before blocks:

```ts
  // Pinned groups are matched by NUMBER against the current roster, not taken
  // as given. A pin is a snapshot from a previous shuffle: a student in it may
  // since have been marked absent, renamed, or removed altogether.
  const presentByNumber = new Map(present.map((s) => [s.number, s]));
  const pinnedGroups = input.pinned
    .map((g) => g.map((s) => presentByNumber.get(s.number)).filter((s): s is Student => s !== undefined))
    .filter((g) => g.length > 0);

  const pinnedNumbers = new Set(pinnedGroups.flat().map((s) => s.number));
  const pool = present.filter((s) => !pinnedNumbers.has(s.number));
```

Then check the boundary:

```ts
  // A unit that straddles a pin cannot be honoured: the pinned group is not
  // being added to, so the other members have nowhere to go. Silently
  // unpinning would undo something the teacher explicitly asked to keep, so
  // this is refused with both students named.
  for (const s of pool) {
    if (s.together === null) continue;
    const stranded = pinnedGroups.flat().filter((p) => p.together === s.together);
    if (stranded.length > 0) {
      return fail({
        code: ERROR_CODES.pinnedSplitsUnit,
        students: [...stranded.map((p) => p.number), s.number].sort((a, b) => a - b),
      });
    }
  }
```

Everything downstream then operates on `pool` rather than `present`, with the group count reduced by `pinnedGroups.length` and the sizes computed from `pool.length`. Finally:

```ts
  return succeed([...pinnedGroups, ...dealtGroups], warnings);
```

Guard the degenerate case: if `pinnedGroups.length >= groupCount`, every group is pinned; `pool` must then be empty or the input is contradictory — return `tooManyGroups` with `maxGroups: sizes.length`.

- [ ] **Step 4: Run the whole file**

```
npx vitest run tests/unit/grouping.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.ts tests/unit/grouping.test.ts
git commit -m "feat(grouping): pinned groups survive a reshuffle

Pins are matched by number against the current roster rather than taken
as given -- a pin is a snapshot, and a student in it may since have been
marked absent or removed.

A together-unit straddling a pinned boundary is refused, naming both
students. The pinned group is not being added to, so the other members
have nowhere to go, and silently unpinning would undo the one thing the
teacher explicitly asked to keep."
```

---

## Task 10: Leftovers, restated against every constraint

The leftovers choice predates all of this. This task proves it still means what it says.

**Files:**
- Modify: `tests/unit/grouping.test.ts` (implementation only if a test fails)

**Interfaces:**
- Consumes: everything above
- Produces: nothing new

- [ ] **Step 1: Write the tests**

```ts
describe('leftovers, against the new constraints', () => {
  it('spread still keeps the largest and smallest group within one', () => {
    const out = buildGroups(base({
      students: 11, mode: { kind: 'perGroup', size: 4 }, leftovers: 'spread',
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(shape(out.result.groups)).toEqual([6, 5]);
  });

  it('bunch puts the remainder in one group', () => {
    const out = buildGroups(base({
      students: 9, mode: { kind: 'groupCount', count: 4 }, leftovers: 'bunch',
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(shape(out.result.groups)).toEqual([3, 2, 2, 2]);
  });

  it('a spare student carrying a together letter goes where the unit goes', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, together: 'A' }), student({ number: 2, together: 'A' }),
        student({ number: 3 }), student({ number: 4 }), student({ number: 5 }),
      ],
      mode: { kind: 'perGroup', size: 2 },
      leftovers: 'spread',
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(groupOf(out.result.groups, 1)?.map((s) => s.number)).toContain(2);
  });

  it('bunch never builds a leftover group that violates an apart letter', () => {
    const out = buildGroups(base({
      students: [
        student({ number: 1, apart: 'X' }), student({ number: 2, apart: 'X' }),
        student({ number: 3 }), student({ number: 4 }), student({ number: 5 }),
      ],
      mode: { kind: 'groupCount', count: 2 },
      leftovers: 'bunch',
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const g of out.result.groups) {
      expect(g.filter((s) => s.apart === 'X').length).toBeLessThanOrEqual(1);
    }
  });

  it('counts only present students when sizing', () => {
    const out = buildGroups(base({
      students: [
        ...Array.from({ length: 11 }, (_, i) => student({ number: i + 1 })),
        student({ number: 99, absent: true }),
      ],
      mode: { kind: 'perGroup', size: 4 },
      leftovers: 'spread',
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(shape(out.result.groups)).toEqual([6, 5]);
  });
});
```

- [ ] **Step 2: Run them**

```
npx vitest run tests/unit/grouping.test.ts -t 'leftovers, against'
```

**These may already pass.** That is a legitimate outcome for a task whose job is to prove existing behaviour survived — but it is also exactly how a test that asserts nothing gets committed. **Prove each one can fail** before accepting it: temporarily invert the assertion, or comment out the constraint it exercises, confirm RED, then restore. Record in the commit body which mutation you used.

If a case genuinely fails, fix the engine — the likeliest cause is `targetSizes` being handed `students.length` where it should now get `pool.length`.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/grouping.test.ts src/lib/grouping.ts
git commit -m "test(grouping): leftovers restated against the new constraints

Spread and bunch predate blocks, absence and pins. These prove they
still mean what they say when a spare student is half of a together
unit, when the remainder group would violate an apart letter, and when
some of the roster is absent.

Each case was mutation-checked -- inverted, observed RED, restored --
because a test written after the behaviour is the easiest kind to write
so that it can never fail."
```

---

## Task 11: Final sweep

**Files:**
- Modify: `src/lib/grouping.ts`
- Modify: `tests/unit/grouping.test.ts`

- [ ] **Step 1: Prove no dead exports or unreachable codes remain**

```ts
describe('the module surface', () => {
  it('exports nothing that nothing uses', () => {
    expect(Object.keys(grouping).sort()).toEqual([
      'ERROR_CODES', 'MAX_STUDENTS', 'WARNING_CODES', 'buildGroups',
    ].sort());
  });

  it('has a test that reaches every error code', () => {
    // A code with no test is a message a teacher could see that nobody has
    // ever read. Kept as a checklist that fails when a code is added.
    expect(Object.values(ERROR_CODES).sort()).toEqual([
      'DUPLICATE_NUMBER', 'INVALID_GROUP_COUNT', 'INVALID_GROUP_SIZE',
      'KEEP_APART_IMPOSSIBLE', 'KEEP_APART_NO_ARRANGEMENT',
      'KEEP_APART_SEARCH_GAVE_UP', 'NO_STUDENTS', 'PINNED_SPLITS_UNIT',
      'SEX_NEEDS_ALL_SET', 'SEX_SEPARATE_SPLITS_UNIT', 'TOGETHER_APART_CLASH',
      'TOGETHER_UNIT_TOO_LARGE', 'TOO_MANY_GROUPS', 'TOO_MANY_STUDENTS',
    ].sort());
  });
});
```

Type-only exports (`Student`, `Mode`, `Leftovers`, `SexMode`, `GroupingInput`, `GroupingError`, `GroupingWarning`, `GroupingOutcome`) do not appear at runtime, so they are absent from the first assertion by design.

- [ ] **Step 2: Run it**

```
npx vitest run tests/unit/grouping.test.ts -t 'the module surface'
```

Fix whatever it reports: an unexpected export is dead code to delete; a missing one is a task above left half-done.

- [ ] **Step 3: Confirm every listed code has a test that reaches it**

For each of the 14 codes, `grep` the suite for it. `KEEP_APART_SEARCH_GAVE_UP` is the one likely to have no case — it needs an input that exhausts `SEARCH_NODE_CAP`. If the existing suite covers it, leave it; if not, write one using a Moon–Moser-shaped apart-letter set, and **check the runtime** — a case that takes 30 seconds does not belong in a unit suite, so cap it with a temporarily lowered budget rather than a bigger input.

- [ ] **Step 4: Run everything, and check the exit code**

```
npm run test:unit; echo "exit=$?"
```

Expected: all suites pass, `exit=0`. `gloryPoints`, `i18n`, `dead-copy`, `lockdown` and `smoke` are untouched and must stay green.

- [ ] **Step 5: Format**

```
npx prettier --write src/lib/grouping.ts tests/unit/grouping.test.ts
npm run format
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/grouping.ts tests/unit/grouping.test.ts
git commit -m "test(grouping): pin the module surface and the error codes

Two assertions that fail when an export or an error code is added
without a test. A code with no test is a sentence a teacher could be
shown that nobody has ever read."
```

---

## Self-review

**Spec coverage** — every stage-1 item in §14 maps to a task: the `Student` record and `id`→`number` (T2), together/apart letters (T4, T5, T6), absence (T3), sex-based grouping (T7, T8), pinned groups (T9), leftovers restated (T10), the two dead error codes deleted and the new ones added (T1, T2, T4, T6, T7, T8, T9), `parseKeepApart` removed (T1). `MAX_ROSTER` is correctly absent — §14 puts it in stage 3.

**Placeholders** — none. Every step names its file, its command and its expected result, and every code step carries the code.

**Type consistency** — `Block` is `number[]` throughout; `buildBlocks(present)` in T4 is what T5's `buildConflicts(present, blocks)` consumes; `adj` is indexed by block from T5 onward, including in T7's `orderBlocks`; every error carrying students carries `number[]`, including `keepApartImpossible`, which T5 changes from `string[]`.

**Two decisions this plan makes that the spec left open**, both flagged in-line and both reversible:
1. `SEX_NEEDS_ALL_SET` — a fifth error code, added as a guard because the module must not trust its caller. The spec named four.
2. **A together-unit split across a pinned boundary is refused.** §7 requires the interaction to be specified without saying how. The alternative — silently unpinning — would undo what the teacher asked to keep.
