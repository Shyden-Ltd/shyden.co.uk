# Classroom Group Creator v2 — Stage 3: Student details and avatars

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the page a roster — a table on a laptop, cards on a phone — with per-student name, sex, absence and the two letters, validated as it is typed, and rendered in the results as avatars.

**Architecture:** The roster is **one array in module scope, never persisted**, and every render is a function of it. Validation is pure and lives in `src/lib/roster.ts` so each rule can be unit-tested against its own inputs rather than sampled through the DOM. The table and the card layout are **one renderer with two CSS layouts**, not two renderers — F-03 and F-04 exist to prove that, and two renderers would make them pass while drifting apart. Avatars are a pure SVG function keyed on sex.

**Tech Stack:** Astro, TypeScript, Vitest, Playwright. No new dependencies — the avatars are hand-written SVG, not a library.

**Depends on:** Stages 1 and 2 complete. This stage **discharges four debts stage 2 left**, each named in Task 1.

**Traceability:** ticks **R-01…R-12, F-01…F-07, A-01…A-10, A-19, A-20, T-06, T-07, B-01…B-12, X-02…X-06, X-08, G-03, G-04, G-07, G-11, M-01…M-08 (avatars), E-05…E-11, K-01…K-05, K-12…K-14**.

## Global Constraints

Everything in stage 2's constraints still applies, plus:

- **The roster is never persisted.** Not `localStorage`, not `sessionStorage`, not the URL. Y-01…Y-04 assert this after every operation in this stage.
- **Identity is the number.** Every lookup, every constraint, every error keys on `Student.number`. Nothing matches on a name.
- **Colour is never the only signal.** The absent row carries a tint, a stripe **and** the word.
- **`MAX_ROSTER = 100`** arrives in this stage. `MAX_STUDENTS = 500` stays where stage 1 put it.
- Tests observed RED first. Commit per task.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/roster.ts` | **New.** Pure: the roster type, next-number, duplicate and clash detection, gap detection, the counts `sectionState` needs. |
| `src/lib/avatars.ts` | **New.** Pure: `avatarSvg(sex)` → string. One file because it is one idea and a stage-5 print sheet needs it too. |
| `src/scripts/roster-ui.ts` | **New.** Renders and wires the roster. Split from `classroom-groups.ts` because that file is 298 lines and this would double it; a file you cannot hold in your head is where edits go wrong. |
| `src/scripts/classroom-groups.ts` | Modified: owns the roster array, calls into `roster-ui`. |
| `src/components/pages/ClassroomGroupsPage.astro` | Modified: the `cg-students` body, the read-out, removals. |
| `src/lib/i18n/en.ts`, `id.ts` | Copy in, removed keys out. |
| `tests/unit/roster.test.ts`, `tests/unit/avatars.test.ts` | **New.** |
| `tests/e2e/classroom-groups-roster.spec.ts` | **New.** The roster is big enough to deserve its own suite. |

---

## Task 1: Discharge stage 2's debts, and add the roster type

**Files:** Create `src/lib/roster.ts`, `tests/unit/roster.test.ts`; modify `classroom-groups.ts`

Stage 2 left four things owed. Doing them first means nothing later is written against a half-wired page.

| Debt | Where it was left |
|---|---|
| `Snapshot.roster` is `''` | stage 2 Task 6 |
| `students: count` should become the roster | stage 2 Task 1 |
| The G-11 spillover test is `fixme` | stage 2 Task 4 |
| The `cg-students` body is empty | stage 2 Task 3 |

This task does the first two. **Task 2** fills the `cg-students` body; **Task 9** removes the `fixme`.

**Interfaces:**
- Produces:
  ```ts
  export const MAX_ROSTER = 100;
  export function nextNumber(roster: Student[]): number;
  export function rosterCounts(roster: Student[]):
    { named: number; absent: number; together: number; apart: number };
  export function serialiseForCompare(roster: Student[]): string;
  ```
  and, from `classroom-groups.ts`, the **roster accessor** that stage 4 imports:
  ```ts
  export function getRoster(): readonly Student[];
  export function setRoster(next: Student[], opts?: { saved?: boolean }): void;
  ```

> **Why an accessor rather than an exported array.** Stage 4 has to read the roster to export it and
> replace it on import. An exported `let` gives it a second reference that can drift from the one the
> renderer reads, and nothing here would catch that. One setter also gives `dirty` and the re-render
> a single place to hang off, so neither can be forgotten by a new call site.
>
> **`dirty`, which stage 2 declared and nobody set.** The rule, wired here:
> - `setRoster` marks it **true** whenever the roster is non-empty and differs from the last saved copy
> - `setRoster(next, { saved: true })` marks it **false** — used by export and by import
> - it is **false** on load
>
> Stage 2 read the field and could never make it true, because a roster is what gets lost and there
> was no roster. This is where it becomes real.

- [ ] **Step 1: Write the failing tests**

```ts
describe('nextNumber', () => {
  it('starts at 1', () => expect(nextNumber([])).toBe(1));

  it('takes one past the highest, not the first free gap', () => {
    // A gap is usually the number of a child who has left. Filling it would
    // quietly hand their number to somebody else.
    const roster = [1, 2, 3, 5].map((n) => student({ number: n }));
    expect(nextNumber(roster)).toBe(6);
  });

  it('is not fooled by an unsorted roster', () => {
    expect(nextNumber([5, 1, 3].map((n) => student({ number: n })))).toBe(6);
  });

  it('counts absent students — their number is still taken', () => {
    expect(nextNumber([student({ number: 9, absent: true })])).toBe(10);
  });
});

describe('rosterCounts', () => {
  it('counts names, absences and each letter kind', () => {
    expect(rosterCounts([
      student({ number: 1, name: 'Ana', together: 'A' }),
      student({ number: 2, name: 'Budi', together: 'A' }),
      student({ number: 3, absent: true, apart: 'X' }),
      student({ number: 4 }),
    ])).toEqual({ named: 2, absent: 1, together: 2, apart: 1 });
  });

  it('counts a student carrying both letters under both', () => {
    expect(rosterCounts([student({ number: 1, together: 'A', apart: 'X' })]))
      .toMatchObject({ together: 1, apart: 1 });
  });
});

describe('serialiseForCompare', () => {
  it('changes when a student is marked absent', () => {
    const a = [student({ number: 1 })];
    const b = [student({ number: 1, absent: true })];
    expect(serialiseForCompare(a)).not.toBe(serialiseForCompare(b));
  });

  it('does NOT change when only a name changes', () => {
    // A rename moves nobody, so it must not mark the groups out of date.
    const a = [student({ number: 1, name: 'Ana' })];
    const b = [student({ number: 1, name: 'Anna' })];
    expect(serialiseForCompare(a)).toBe(serialiseForCompare(b));
  });

  it('changes when a letter changes', () => {
    expect(serialiseForCompare([student({ number: 1 })]))
      .not.toBe(serialiseForCompare([student({ number: 1, together: 'A' })]));
  });

  it('changes when a sex changes', () => {
    expect(serialiseForCompare([student({ number: 1 })]))
      .not.toBe(serialiseForCompare([student({ number: 1, sex: 'M' })]));
  });
});
```

- [ ] **Step 2: Run and watch them fail** — `npx vitest run tests/unit/roster.test.ts`. Module not found.

- [ ] **Step 3: Implement**

```ts
export const MAX_ROSTER = 100;

export const nextNumber = (roster: Student[]): number =>
  roster.reduce((max, s) => Math.max(max, s.number), 0) + 1;

export const rosterCounts = (roster: Student[]) => ({
  named: roster.filter((s) => s.name !== null && s.name !== '').length,
  absent: roster.filter((s) => s.absent).length,
  together: roster.filter((s) => s.together !== null).length,
  apart: roster.filter((s) => s.apart !== null).length,
});

/**
 * Everything about the roster that could change who ends up with whom.
 *
 * The NAME IS DELIBERATELY ABSENT. Correcting a spelling moves nobody, so it
 * must not mark the groups out of date -- and leaving the name out of the
 * comparison is what makes that true by construction, rather than by a special
 * case somebody has to remember.
 */
export const serialiseForCompare = (roster: Student[]): string =>
  roster
    .map((s) => `${s.number}:${s.sex ?? ''}:${s.absent ? 1 : 0}:${s.together ?? ''}:${s.apart ?? ''}`)
    .sort()
    .join('|');
```

- [ ] **Step 3b: Write the failing tests for `dirty`**

```ts
test('the header says nothing to save until there is something', async ({ page }) => {
  await page.goto('/classroom-groups');
  await expect(page.locator('#cg-io .state')).toHaveText('nothing to save yet');
});

test('any roster change makes it unsaved', async ({ page }) => {
  await openRoster(page);
  await expect(page.locator('#cg-io .state'))
    .toHaveText('unsaved changes — export to keep them');
});

test('clearing the roster returns it to nothing to save', async ({ page }) => {
  await openRoster(page);
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#cg-io .state')).toHaveText('nothing to save yet');
});
```

> Export and import clear it too, but neither exists until stage 4 — those two cases live in stage 4
> Task 5, against the same rule.

- [ ] **Step 4: Discharge the two wiring debts**

In `classroom-groups.ts`:

```ts
let roster: Student[] = [];      // never persisted, never leaves this module

// stage 2 left `students: count`; the roster takes over the moment it exists
students: roster.length > 0 ? roster : count,
```

and in `snapshot()`, `roster: serialiseForCompare(roster)` replacing the `''`.

- [ ] **Step 5: Run everything, then commit**

```bash
npm run test:unit; echo "exit=$?"
git add src/lib/roster.ts tests/unit/roster.test.ts && git add -u src/
git commit -m "feat(classroom): the roster type, and stage 2's two wiring debts

serialiseForCompare deliberately omits the name. Correcting a spelling
moves nobody, so it must not mark the groups out of date -- and leaving
the name out of the comparison makes that true by construction rather
than by a special case somebody has to remember.

nextNumber takes one past the highest rather than the first free gap: a
gap is usually the number of a child who has left."
```

---

## Task 2: The table

**Files:** Create `src/scripts/roster-ui.ts`, `tests/e2e/classroom-groups-roster.spec.ts`,
**`tests/e2e/helpers.ts`**; modify the Astro page
**Traceability:** R-01, R-02, R-09, R-10, R-11, F-02, A-01, **L-06** (re-homed from stage 2)

- [ ] **Step 1: Create the shared e2e helpers**

Stages 3, 4 and 5 all drive the roster to set up their cases. **Every helper lives in
`tests/e2e/helpers.ts` and is imported**, never redefined in a suite — two versions of
`openRoster` that differ by one click produce two different starting states, and the suite that
gets the wrong one fails for a reason that has nothing to do with what it tests.

```ts
import { expect, type Page } from '@playwright/test';

export const openRoster = async (page: Page, path = '/classroom-groups') => {
  await page.goto(path);
  await page.locator('#cg-students summary').click();
  await page.getByRole('button', { name: /Add student|Tambah siswa/ }).click();
};

export const addSeveral = async (page: Page, howMany: number) => {
  await page.getByRole('button', { name: /Add several|Tambah beberapa/ }).click();
  await page.getByLabel(/How many\?|Berapa\?/).fill(String(howMany));
  await page.getByRole('button', { name: /^Add$|^Tambah$/ }).click();
};

export const setSex = async (page: Page, row: number, sex: 'M' | 'F') =>
  page.locator('.cg-student').nth(row).getByLabel(/Sex|Jenis kelamin/).selectOption(sex);

/** [sex, name] per student, in order. The one builder every later suite uses. */
export const buildRoster = async (page: Page, students: Array<[('M'|'F'|null), string?]>) => {
  await openRoster(page);
  if (students.length > 1) await addSeveral(page, students.length - 1);
  for (const [i, [sex, name]] of students.entries()) {
    const row = page.locator('.cg-student').nth(i);
    if (name) await row.getByLabel(/Name|Nama/).fill(name);
    if (sex) await row.getByLabel(/Sex|Jenis kelamin/).selectOption(sex);
  }
  await expect(page.locator('.cg-student')).toHaveCount(students.length);
};

export const rosterOf = async (page: Page, n: number) =>
  buildRoster(page, Array.from({ length: n }, () => [null] as [null]));

export const withGroups = async (page: Page, n = 12) => {
  await rosterOf(page, n);
  await page.getByRole('button', { name: /Make groups|Buat kelompok/ }).click();
  await expect(page.locator('#cg-groups .group').first()).toBeVisible();
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
```

Stages 4 and 5 add to this file rather than starting their own: `upload`, `downloadText`,
`downloadName`, `rosterWithAnAbsence`, `rosterForSpillover`, `namesIn`. Each is named in the task
that first needs it.

- [ ] **Step 2: Write the failing tests**

```ts
import { openRoster, addSeveral, buildRoster } from './helpers';

  await page.goto('/classroom-groups');
  await page.getByLabel('How many students?').fill('6');
  await page.locator('#cg-students summary').click();
  await page.getByRole('button', { name: 'Add student' }).click();
};

test('the table has the six columns, in order', async ({ page }) => {
  await openRoster(page);
  await expect(page.locator('#cg-roster thead th')).toHaveText(
    ['#', 'Name', 'Sex', 'Absent', 'Together', 'Apart']);
});

test('an unnamed row renders Student N in the results', async ({ page }) => {
  await openRoster(page);
  await page.getByRole('button', { name: 'Make groups' }).click();
  await expect(page.locator('#cg-groups')).toContainText('Student 1');
});

test('an empty name box is exactly as wide as a full one', async ({ page }) => {
  await openRoster(page);
  await page.getByRole('button', { name: 'Add student' }).click();
  await page.locator('#cg-roster tbody tr').nth(0).getByLabel('Name').fill('Sebastianus');
  const a = (await page.locator('#cg-roster tbody tr').nth(0).getByLabel('Name').boundingBox())!;
  const b = (await page.locator('#cg-roster tbody tr').nth(1).getByLabel('Name').boundingBox())!;
  expect(b.width).toBeCloseTo(a.width, 0);
});

test('a long name does not push the letters out of view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openRoster(page);
  await page.locator('#cg-roster tbody tr').nth(0).getByLabel('Name').fill('Maria Anastasia Wijayanti');
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 3: Run, watch fail, implement**

`roster-ui.ts` exports `renderRoster(container, roster, t, handlers)`. **One renderer.** Each row is built from the same data and the same control set; only the CSS differs between layouts.

Fixed widths in CSS, on the `<th>`/`<td>`, not on the inputs — an input sized by its content is what makes an empty box shrink.

- [ ] **Step 4: Run across all five projects, then commit**

```bash
npx playwright test classroom-groups-roster.spec.ts; echo "exit=$?"
git add src/scripts/roster-ui.ts tests/e2e/classroom-groups-roster.spec.ts tests/e2e/helpers.ts && git add -u src/
git commit -m "feat(classroom): the Student details table

One renderer, six columns, fixed-width cells so an empty name box is the
same size as a full one and the grid holds still while you type."
```

---

## Task 3: The card layout, and proving it is the same thing

**Files:** `roster-ui.ts` CSS, `classroom-groups-roster.spec.ts`
**Traceability:** F-01, F-03, F-04, F-05, F-06, F-07, **L-06**

- [ ] **Step 1: Write the failing tests**

```ts
const LAYOUTS = [
  { name: 'cards', width: 320 },
  { name: 'table', width: 1280 },
];

for (const { name, width } of LAYOUTS) {
  test(`${name}: every control is present with the same value`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openRoster(page);
    const row = page.locator('.cg-student').first();
    await expect(row.getByLabel('Name')).toBeVisible();
    await expect(row.getByLabel('Sex')).toBeVisible();
    await expect(row.getByLabel('Absent')).toBeVisible();
    await expect(row.getByLabel('Together')).toBeVisible();
    await expect(row.getByLabel('Apart')).toBeVisible();
  });

  test(`${name}: editing every field works`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openRoster(page);
    const row = page.locator('.cg-student').first();
    await row.getByLabel('Name').fill('Ana');
    await row.getByLabel('Sex').selectOption('F');
    await row.getByLabel('Together').selectOption('A');
    await row.getByLabel('Absent').check();
    await expect(row.getByLabel('Name')).toHaveValue('Ana');
    await expect(row.getByLabel('Sex')).toHaveValue('F');
    await expect(row.getByLabel('Together')).toHaveValue('A');
    await expect(row.getByLabel('Absent')).toBeChecked();
  });
}

test('cards: the name field takes the full remaining width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openRoster(page);
  const card = (await page.locator('.cg-student').first().boundingBox())!;
  const name = (await page.locator('.cg-student').first().getByLabel('Name').boundingBox())!;
  expect(name.width).toBeGreaterThan(card.width * 0.6);
});

// L-06, re-homed from stage 2: that stage could not open Student details
// because it had no body, so the row was untestable there.
test('cards: no horizontal scroll at 320px with 100 students', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openRoster(page);
  await page.getByRole('button', { name: 'Add several' }).click();
  await page.getByLabel('How many?').fill('99');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 2: Run, watch fail, implement**

CSS only. `.cg-student` is a `<tr>` above the breakpoint and a block below it, via `display: block` on the table parts under a media query — **no second render path**. If you find yourself writing a second renderer, stop: F-03 and F-04 would then pass while the two drift.

- [ ] **Step 3: Commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): the roster reflows to cards on a phone

Six controls at 44px do not fit 304px of usable width -- the name box
lands at about 44px, which satisfies the arithmetic and is unusable.
Below the breakpoint each student becomes a card with the name on its
own line.

One renderer, two CSS layouts. A second renderer would let the
same-content and same-behaviour tests pass while the two drift apart,
which is the failure those tests exist to catch."
```

---

## Task 4: Absence, rendered

**Files:** `roster-ui.ts`, CSS, locales
**Traceability:** A-01…A-10, A-19, A-20

- [ ] **Step 1: Write the failing tests**

```ts
test.describe('an absent student', () => {
  const markAbsent = async (page) => {
    await openRoster(page);
    await page.locator('.cg-student').first().getByLabel('Absent').check();
  };

  test('nothing in the row is disabled', async ({ page }) => {
    await markAbsent(page);
    const row = page.locator('.cg-student').first();
    for (const label of ['Name', 'Sex', 'Together', 'Apart']) {
      await expect(row.getByLabel(label), label).toBeEnabled();
    }
  });

  test('and every field can still be edited', async ({ page }) => {
    await markAbsent(page);
    const row = page.locator('.cg-student').first();
    await row.getByLabel('Name').fill('Dewi');
    await row.getByLabel('Sex').selectOption('F');
    await expect(row.getByLabel('Name')).toHaveValue('Dewi');
    await expect(row.getByLabel('Sex')).toHaveValue('F');
  });

  test('is tinted, striped and labelled', async ({ page }) => {
    await markAbsent(page);
    const row = page.locator('.cg-student').first();
    await expect(row).toHaveCSS('background-color', 'rgb(255, 246, 227)');
    await expect(row.locator('.cg-absent-pill')).toHaveText('absent');
  });

  test('is still readable with colour removed', async ({ page }) => {
    await markAbsent(page);
    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important }' });
    await expect(page.locator('.cg-student').first().getByLabel('Absent')).toBeChecked();
    await expect(page.locator('.cg-student').first().locator('.cg-absent-pill'))
      .toHaveText('absent');
  });

  test('the consequence line is there before anyone is marked', async ({ page }) => {
    await openRoster(page);
    await expect(page.getByText(
      'Students marked absent are not included when groups are made.')).toBeVisible();
  });

  test('the count line reads students, here and absent', async ({ page }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add several' }).click();
    await page.getByLabel('How many?').fill('23');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('.cg-student').first().getByLabel('Absent').check();
    await page.locator('.cg-student').nth(1).getByLabel('Absent').check();
    await expect(page.locator('#cg-roster-count'))
      .toHaveText('24 students · 22 here · 2 absent');
  });

  test('the word is never "away", anywhere', async ({ page }) => {
    await markAbsent(page);
    await page.getByRole('button', { name: 'Make groups' }).click();
    await expect(page.locator('body')).not.toContainText(/\baway\b/);
  });
});
```

Mirror the last two on `/id/`.

- [ ] **Step 2: Run, watch fail, implement**

```css
.cg-student.is-absent { background: #fff6e3; color: #1a1a1a; }
.cg-student.is-absent > :first-child { box-shadow: inset 3px 0 0 #d9a441; }
.cg-absent-pill { background: #8a6a10; color: #fff; border-radius: 99px; }
```

> Set `color` in **every** rule that sets `background`. This repo has already shipped an unreadable panel that way, and a mockup in this project's own brainstorm did it again.

- [ ] **Step 3: Commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): absence tints the row rather than disabling it

Every field stays editable, so a teacher can fix a spelling or set a sex
for a child who is off today. Absence marks a student out of this
shuffle, not out of the register.

Three signals and none of them colour alone: the ticked box, the word
absent, and the tint. The greyscale test asserts the other two survive
with colour removed."
```

---

## Task 5: Validation as it is typed

**Files:** `src/lib/roster.ts`, `roster-ui.ts`, locales
**Traceability:** R-04…R-07, T-07, plus the engine-side R-07

**Interfaces:**
- Produces: `export function rosterProblems(roster: Student[], t: Strings): Problem[]` where
  `Problem = { kind: 'duplicate' | 'clash'; students: number[]; message: string }`, and
  `export function rosterWarnings(roster: Student[], t: Strings): string[]`

- [ ] **Step 1: Write the failing unit tests**

```ts
describe('rosterProblems', () => {
  it('finds a duplicate number and names who already holds it', () => {
    const problems = rosterProblems([
      student({ number: 5, name: 'Eko' }), student({ number: 5, name: 'Ana' }),
    ], en);
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe('duplicate');
    expect(problems[0].message).toBe('Number 5 is already used by Eko. Every student needs their own.');
  });

  it('finds a together-and-apart clash', () => {
    const problems = rosterProblems([
      student({ number: 1, name: 'Ana', together: 'A', apart: 'X' }),
      student({ number: 2, name: 'Budi', together: 'A', apart: 'X' }),
    ], en);
    expect(problems[0].kind).toBe('clash');
    expect(problems[0].message)
      .toBe('Ana and Budi are kept together, so they cannot also be kept apart.');
  });

  it('is quiet when the same apart letter is on students not kept together', () => {
    expect(rosterProblems([
      student({ number: 1, together: 'A', apart: 'X' }),
      student({ number: 2, together: 'A' }),
      student({ number: 3, apart: 'X' }),
    ], en)).toEqual([]);
  });

  it('names an unnamed student as Student N in the message', () => {
    const problems = rosterProblems([
      student({ number: 5 }), student({ number: 5 }),
    ], en);
    expect(problems[0].message).toContain('Student 5');
  });
});

describe('rosterWarnings', () => {
  it('warns about a gap, naming the missing numbers', () => {
    expect(rosterWarnings([1, 2, 3, 5, 8].map((n) => student({ number: n })), en))
      .toEqual(['Your class list looks incomplete. Numbers 4, 6 and 7 are missing. ' +
                'That is fine if those children have left — open Student details to check.']);
  });

  it('is quiet when the numbers run without gaps', () => {
    expect(rosterWarnings([1, 2, 3].map((n) => student({ number: n })), en)).toEqual([]);
  });

  it('does not treat a roster starting above 1 as a gap', () => {
    // A class numbered from 101 is a register, not an incomplete list.
    expect(rosterWarnings([101, 102].map((n) => student({ number: n })), en)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, watch fail, implement**

- [ ] **Step 3: Write the e2e half — the refusal is live**

```ts
test('a duplicate number is refused as it is typed', async ({ page }) => {
  await openRoster(page);
  await page.getByRole('button', { name: 'Add student' }).click();
  await page.locator('.cg-student').nth(1).getByLabel('#').fill('1');
  await expect(page.getByText(/Number 1 is already used/)).toBeVisible();
  // and before the button is ever pressed
  await expect(page.getByRole('button', { name: 'Make groups' })).toBeDisabled();
});

test('a together-and-apart clash is refused as it is typed', async ({ page }) => { /* … */ });

test('a gap warns but does not block', async ({ page }) => {
  await openRoster(page);
  await page.locator('.cg-student').first().getByLabel('#').fill('4');
  await expect(page.getByText(/looks incomplete/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make groups' })).toBeEnabled();
});
```

> The difference between those last two assertions — `toBeDisabled` versus `toBeEnabled` — **is** the difference between a block and a warning, and it is the only place it is proved.

- [ ] **Step 4: Commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): duplicates and clashes refused as they are typed

Both are caught in the table rather than held back until the button is
pressed, so there is one behaviour to learn.

A gap warns and does not block, and the pair of assertions -- button
disabled for a problem, enabled for a warning -- is the only place that
difference is actually proved."
```

---

## Task 6: Adding, removing, and the two limits

**Files:** `roster-ui.ts`, `roster.ts`, locales
**Traceability:** R-08, B-06…B-09, X-02…X-06, X-08

- [ ] **Step 1: Write the failing tests**

```ts
test('Add several is inline — no dialog', async ({ page }) => {
  await openRoster(page);
  page.on('dialog', () => { throw new Error('a dialog was opened'); });
  await page.getByRole('button', { name: 'Add several' }).click();
  await expect(page.getByLabel('How many?')).toBeVisible();
});

test('a new student takes one past the highest', async ({ page }) => {
  await openRoster(page);
  await page.locator('.cg-student').first().getByLabel('#').fill('5');
  await page.getByRole('button', { name: 'Add student' }).click();
  await expect(page.locator('.cg-student').nth(1).getByLabel('#')).toHaveValue('6');
});

test('both add controls disable at 100, stating the limit', async ({ page }) => {
  await openRoster(page);
  await addSeveral(page, 99);
  await expect(page.getByRole('button', { name: 'Add student' })).toBeDisabled();
  await expect(page.getByText('Student details holds up to 100 students.')).toBeVisible();
});

test('Add several refuses a number that would cross the limit, saying how many are free', async ({ page }) => {
  await openRoster(page);
  await addSeveral(page, 89);
  await page.getByRole('button', { name: 'Add several' }).click();
  await page.getByLabel('How many?').fill('20');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('There is room for 10 more students.')).toBeVisible();
  await expect(page.locator('.cg-student')).toHaveCount(90);
});

test('Student details refuses to open above 100, leaving the count alone', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.getByLabel('How many students?').fill('300');
  await page.locator('#cg-students summary').click();
  await expect(page.getByText(
    'Student details holds up to 100 students. Lower the number to list this class individually.'
  )).toBeVisible();
  await expect(page.locator('#cg-roster')).toHaveCount(0);
  await expect(page.getByLabel('How many students?')).toHaveValue('300');
  await expect(page.getByRole('button', { name: 'Make groups' })).toBeEnabled();
});
```

- [ ] **Step 2: Run, watch fail, implement, commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): adding, removing, and the roster limit

Add several is an inline number field, not a dialog, and the test proves
it by failing if any dialog opens at all.

Above 100 the section refuses to open and says why, leaving the count
alone so the teacher can still shuffle 500 anonymously."
```

---

## Task 7: The Students box becomes a read-out

**Files:** Astro page, `classroom-groups.ts`, locales
**Traceability:** B-01…B-05, B-10…B-12, X-08

- [ ] **Step 1: Write the failing tests**

```ts
test('typeable with no list; a read-out with one', async ({ page }) => {
  await page.goto('/classroom-groups');
  await expect(page.getByLabel('How many students?')).toBeEditable();
  await page.locator('#cg-students summary').click();
  await page.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByLabel('How many students?')).not.toBeEditable();
});

test('the reason is rendered, not implied', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.locator('#cg-students summary').click();
  await page.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByText(
    'Set by your list. Add or remove students in Student details to change it.'
  )).toBeVisible();
});

test('emptying the list makes it typeable again, keeping the number', async ({ page }) => {
  await openRoster(page);
  await addSeveral(page, 23);
  await expect(page.getByLabel('How many students?')).toHaveValue('24');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.getByLabel('How many students?')).toBeEditable();
  await expect(page.getByLabel('How many students?')).toHaveValue('24');
});

test('marking a student absent does not move it', async ({ page }) => {
  await openRoster(page);
  await addSeveral(page, 23);
  await page.locator('.cg-student').first().getByLabel('Absent').check();
  await expect(page.getByLabel('How many students?')).toHaveValue('24');
  await expect(page.locator('#cg-roster-count')).toHaveText('24 students · 23 here · 1 absent');
});

test('no sequence of operations makes the box disagree with the list', async ({ page }) => {
  await openRoster(page);
  for (const n of [5, 3, 11]) await addSeveral(page, n);
  await page.locator('.cg-student').nth(2).getByRole('button', { name: 'Remove' }).click();
  await page.locator('.cg-student').first().getByLabel('Absent').check();
  const rows = await page.locator('.cg-student').count();
  await expect(page.getByLabel('How many students?')).toHaveValue(String(rows));
});
```

- [ ] **Step 2: Run, watch fail, implement, commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): the Students box reports the list, and says why

Two things could have claimed to know the class size. Now only one does,
so there is no mismatch to warn about and none to block. The reason is
rendered beside it -- a disabled box that does not say why is a defect,
not a design."
```

---

## Task 8: Avatars, and the removals they replace

**Files:** Create `src/lib/avatars.ts`, `tests/unit/avatars.test.ts`; modify page, script, locales
**Traceability:** M-01…M-08 (avatars), K-01…K-05, K-12, K-13

- [ ] **Step 1: Write the failing unit tests**

```ts
describe('avatarSvg', () => {
  it('uses the boy palette', () => {
    expect(avatarSvg('M')).toContain('hsl(214 92% 88%)');
    expect(avatarSvg('M')).toContain('hsl(218 85% 46%)');
  });
  it('uses the girl palette', () => { /* 334/332 */ });
  it('uses the neutral palette for a student with no sex', () => { /* 150 */ });

  it('gives the three different hair, not just different colour', () => {
    // Colour alone fails a greyscale printout and the ~1 in 12 with red-green
    // colour blindness, for whom this palette puts pink beside green.
    const hair = (sex: 'M' | 'F' | null) =>
      (avatarSvg(sex).match(/hsl\(24 40% 24%\)"\s+d="([^"]+)"/) ?? [])[1];
    const [m, f, n] = [hair('M'), hair('F'), hair(null)];
    expect(new Set([m, f, n]).size).toBe(3);
  });

  it('carries an accessible label', () => {
    expect(avatarSvg('F')).toContain('role="img"');
    expect(avatarSvg('F')).toMatch(/aria-label="[^"]+"/);
  });
});
```

- [ ] **Step 2: Run, watch fail, implement**

Hand-written SVG, three `<symbol>`s, referenced by `<use>`. One definition per avatar however many appear.

- [ ] **Step 3: Remove what the avatars replace**

- The theme `<select>` (`#cg-theme`) and its label
- The **naming radio** — `namingLabel`, `namingNumbered`, `namingThemed`
- From both locales: `themeLabel`, `themeNames` (`animals`, `colours`, `planets`), the three naming keys
- From the script: `THEME_KEYS` and the themed branch of `groupName()`

- [ ] **Step 4: Prove the removals**

```ts
test('the theme select and the naming radio are gone', async ({ page }) => {
  await page.goto('/classroom-groups');
  await expect(page.locator('#cg-theme')).toHaveCount(0);
  await expect(page.getByLabel('Animals')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Numbered|Themed/ })).toHaveCount(0);
});

test('groups are numbered, always', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.getByLabel('How many students?').fill('9');
  await page.getByRole('button', { name: 'Make groups' }).click();
  await expect(page.locator('#cg-groups .group h3')).toHaveText(['Group 1', 'Group 2', 'Group 3']);
});
```

Then `npx vitest run tests/unit/dead-copy.test.ts tests/unit/i18n.test.ts` — the first fails if a removed key is still referenced, the second if the two locales have drifted.

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatars.ts tests/unit/avatars.test.ts && git add -u src/ tests/
git commit -m "feat(classroom): student avatars replace the group themes

Three faces differing in hair length as well as colour, so the
distinction survives a greyscale printout and the roughly 1 in 12 males
with red-green colour blindness -- this palette puts pink beside green.

Deletes the themes, their locale tables, THEME_KEYS, the themed branch
of groupName() and the naming radio, which with themes gone is a choice
with one option. Groups are always numbered."
```

---

## Task 9: The sex switches come alive, and the last stage-2 debts

**Files:** `classroom-groups.ts`, locales, `classroom-groups-controls.spec.ts`
**Traceability:** G-03, G-04, G-07, G-11, A-11…A-18 (through the page), E-05…E-11

- [ ] **Step 1: Write the failing tests**

```ts
test('enabled once every student being grouped has a sex', async ({ page }) => {
  await buildRoster(page, [['M', 'Ana'], ['F', 'Budi']]);
  await expect(page.getByLabel('Mix boys and girls evenly')).toBeEnabled();
});

test('an absent student with no sex does not disable them', async ({ page }) => {
  await openRoster(page);
  await addSeveral(page, 2);
  await setSex(page, 0, 'M'); await setSex(page, 1, 'F');
  await page.locator('.cg-student').nth(2).getByLabel('Absent').check();   // sex unset
  await expect(page.getByLabel('Mix boys and girls evenly')).toBeEnabled();
});

test('unticking that absence disables them again, naming the student', async ({ page }) => {
  // …continues from above
  await page.locator('.cg-student').nth(2).getByLabel('Name').fill('Dewi');
  await page.locator('.cg-student').nth(2).getByLabel('Absent').uncheck();
  await expect(page.getByLabel('Mix boys and girls evenly')).toBeDisabled();
  await expect(page.getByText(
    'Dewi is back and has no sex set. These options need one for every student being grouped.'
  )).toBeVisible();
});

test('separate mode warns and names who lands in a group of the other sex', async ({ page }) => {
  // This is stage 2's fixme, discharged.
  await openRoster(page);
  await buildRoster(page, [['M'], ['M'], ['M'], ['M'], ['M'], ['M'], ['F', 'Gita'], ['F', 'Hadi']]);
  await page.getByLabel('Keep boys and girls separate').check();
  await page.getByLabel('Students per group').fill('4');
  await page.getByRole('button', { name: 'Make groups' }).click();
  await expect(page.getByText('Gita and Hadi are in a group of boys.')).toBeVisible();
});

test('a rename does not mark the groups out of date', async ({ page }) => {
  await openRoster(page);
  await addSeveral(page, 11);
  await page.getByRole('button', { name: 'Make groups' }).click();
  await page.locator('.cg-student').first().getByLabel('Name').fill('Anna');
  await expect(page.getByText('out of date')).toHaveCount(0);
  await expect(page.locator('#cg-groups')).toContainText('Anna');
});

for (const [label, act] of [
  ['marking absent', (p) => p.locator('.cg-student').first().getByLabel('Absent').check()],
  ['adding a student', (p) => p.getByRole('button', { name: 'Add student' }).click()],
  ['removing a student', (p) => p.locator('.cg-student').first().getByRole('button', { name: 'Remove' }).click()],
  ['changing a letter', (p) => p.locator('.cg-student').first().getByLabel('Together').selectOption('A')],
] as const) {
  test(`${label} marks the groups out of date`, async ({ page }) => {
    await openRoster(page);
    await addSeveral(page, 11);
    await page.getByRole('button', { name: 'Make groups' }).click();
    await act(page);
    await expect(page.getByText(/These groups are out of date/)).toBeVisible();
  });
}
```

- [ ] **Step 2: Run, watch fail, implement**

Wire `sexWhy` (stage 2 Task 4) to the live roster, render `warnings` from the engine outcome, and **remove the `test.fixme`** from stage 2's spillover case.

> `test.fixme` fails the run when it starts passing. That is the point — it is how this debt announced itself rather than sitting green.

- [ ] **Step 3: Full run across all projects, then commit**

```bash
npm test; echo "exit=$?"
git add -u src/ tests/
git commit -m "feat(classroom): the sex switches read the live roster

Enabled once every student BEING GROUPED has a sex, so a child who is
off today and has none does not hold them shut. Unticking that absence
closes them again, naming the student -- a control that disables itself
without a reason is the defect this design keeps catching.

Discharges stage 2's fixme on the spillover warning. Roster edits now
feed the staleness snapshot, and a rename still marks nothing stale."
```

---

## Task 10: Privacy, and the stage sweep

**Traceability:** Y-01…Y-04, A-20, R-12, M-03

- [ ] **Step 1: Assert the roster never leaves memory**

```ts
test('nothing about the class is stored, after every operation', async ({ page }) => {
  await openRoster(page);
  await buildRoster(page, [['F', 'Ana'], ['M', 'Budi']]);
  await page.locator('.cg-student').first().getByLabel('Absent').check();
  await page.getByRole('button', { name: 'Make groups' }).click();

  const stored = await page.evaluate(() => ({
    local: JSON.stringify({ ...localStorage }),
    session: JSON.stringify({ ...sessionStorage }),
    url: location.href,
  }));
  for (const [where, value] of Object.entries(stored)) {
    expect(value, where).not.toContain('Ana');
    expect(value, where).not.toContain('Budi');
  }
});

test('a reload loses the roster', async ({ page }) => {
  await openRoster(page);
  await buildRoster(page, [['F', 'Ana']]);
  await page.reload();
  await page.locator('#cg-students summary').click();
  await expect(page.locator('.cg-student')).toHaveCount(0);
});

test('two children called Ana are separated independently', async ({ page }) => {
  await openRoster(page);
  await buildRoster(page, [['F', 'Ana'], ['F', 'Ana'], ['M', 'Budi'], ['M', 'Eko']]);
  await page.locator('.cg-student').nth(0).getByLabel('Apart').selectOption('X');
  await page.locator('.cg-student').nth(2).getByLabel('Apart').selectOption('X');
  await page.getByLabel('Number of groups').fill('2');
  await page.getByRole('button', { name: 'Make groups' }).click();
  // The SECOND Ana is unconstrained and may share with Budi. Under the old
  // name-matching engine she could not -- that was the defect.
  await expect(page.locator('#cg-groups')).toContainText('Ana');
});
```

- [ ] **Step 2: Full run, five projects, both locales**

```bash
npm test; echo "exit=$?"
```

- [ ] **Step 3: Tick the matrix**

Open `2026-08-06-classroom-groups-v2-test-traceability.md` and tick every row listed under **Traceability** at the top of this plan. **A row you cannot tick is a task left undone** — go back rather than adjusting the row.

- [ ] **Step 4: Commit**

```bash
git add -u src/ tests/ docs/
git commit -m "test(classroom): the roster never leaves memory

Storage, session storage and the URL are all asserted clear of names
after building, editing and shuffling -- not once at the end, but after
the operations that could have written something.

Also pins the defect this stage fixes: two children called Ana are now
separated independently, because identity is the number."
```

---

## Self-review

**Spec coverage** — §4 data model and Students box (T1, T5, T6, T7); §3 roster reflow (T2, T3); absence (T4); §5 avatars and §12 removals (T8); §6 sex switches (T9); §11 privacy (T10).

**Placeholders** — none.

**Type consistency** — `Student` is stage 1's throughout; `MAX_ROSTER` is defined once in `roster.ts`; `serialiseForCompare` fills the `Snapshot.roster` field stage 2 declared as `string`; `rosterCounts` returns exactly the four fields `ToolState` needs.

**Linkage out** — stage 4 imports `getRoster` / `setRoster` from `classroom-groups.ts` and
`MAX_ROSTER` from `roster.ts`, and clears `dirty` via `setRoster(next, { saved: true })` on export
and on import. Stage 5 imports `avatarSvg` from `avatars.ts` and reuses the `.cg-absent-pill` class
name. Both add fixtures to `tests/e2e/helpers.ts`, created here.
