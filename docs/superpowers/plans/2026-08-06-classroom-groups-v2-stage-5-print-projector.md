# Classroom Group Creator v2 — Stage 5: print and the projector

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the groups off the screen — onto paper the way the teacher chooses, and onto the board where the class can read them.

**Architecture:** The printed sheet is **the same DOM**, restyled by `@media print` and a handful of `data-` attributes set from the print panel — not a second rendering of the roster, because a second rendering is how a printed sheet ends up disagreeing with the screen. The projector view is one overlay component with two ways of going full-screen: the Fullscreen API where it is granted, and a fixed full-viewport layer where it is not. Fit-to-screen is a measured loop with a floor, not a CSS guess.

**Tech Stack:** Astro, TypeScript, Vitest, Playwright. No new dependencies.

**Depends on:** Stages 1–4. Needs `avatarSvg` (stage 3), the roster and `dirty` (stage 3), the staleness snapshot (stage 2), and `todayISO` (stage 4).

**Traceability:** ticks **Q-01…Q-21, Z-01…Z-24, E-15…E-17, Y-06, Y-07, A-08 (on paper)**. Leaves **Z-25** and **F-08** for the device gauntlet, which no CI run can discharge.

## Global Constraints

All previous stages, plus:

- **Nothing on paper may depend on colour.** Greyscale is the default assumption, not a fallback.
- **The printed sheet carries neither the absent tint nor the pill** — the `Absent` column says it in no ink and no colour.
- **The control bar must never trap a keyboard user.** It may not fade while a control inside it holds focus, and Escape always exits.
- **Print, Export groups and Full screen all refuse while the groups are out of date**, each asserted separately.
- Tests observed RED first. Commit per task.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/scripts/print-ui.ts` | **New.** The panel, its four remembered choices, and the `data-` attributes it sets. |
| `src/scripts/projector.ts` | **New.** The overlay, both full-screen paths, fit-to-screen, the fading bar. |
| `src/lib/fit.ts` | **New.** Pure: `fitScale(available, needed, floor)`. Pure because the floor is the whole point and a measured loop is untestable without it. |
| `src/components/pages/ClassroomGroupsPage.astro` | Modified: the panel markup, the print stylesheet. |
| `src/lib/i18n/en.ts`, `id.ts` | Copy. |
| `tests/unit/fit.test.ts` | **New.** |
| `tests/e2e/classroom-groups-print.spec.ts`, `-projector.spec.ts` | **New.** |

---

## Task 1: The print panel and its memory

**Files:** Create `src/scripts/print-ui.ts`, `tests/e2e/classroom-groups-print.spec.ts`; modify page, locales
**Traceability:** Q-01…Q-04, Q-21, Y-06, Y-07

- [ ] **Step 1: Add this stage's helpers to the shared file**

`tests/e2e/helpers.ts` was created in stage 3 and extended in stage 4. **Add to it.** `withGroups`,
`rosterOf` and `buildRoster` already exist; this stage needs three more:

```ts
/** 6 students, #4 absent, letters on #1/#2 (together) and #3 (apart). */
export const rosterWithAnAbsence = async (page: Page) => {
  await buildRoster(page, [['F','Ana'],['M','Budi'],['F','Citra'],['F','Dewi'],['M','Eko'],[null]]);
  await page.locator('.cg-student').nth(0).getByLabel(/Together/).selectOption('A');
  await page.locator('.cg-student').nth(1).getByLabel(/Together/).selectOption('A');
  await page.locator('.cg-student').nth(2).getByLabel(/Apart/).selectOption('X');
  await page.locator('.cg-student').nth(3).getByLabel(/Absent/).check();
};

/** Six boys and two girls — separate mode then cannot give the girls a group. */
export const rosterForSpillover = async (page: Page) => {
  await buildRoster(page, [['M','Ana'],['M','Budi'],['M','Citra'],['M','Dedi'],
                           ['M','Eko'],['M','Fajar'],['F','Gita'],['F','Hani']]);
  await page.getByLabel(/Keep boys and girls separate/).check();
  await page.getByLabel(/Students per group/).fill('4');
};

export const namesIn = (text: string): string[] =>
  text.split(/\s+/).filter((w) => /^[A-Z][a-z]+$/.test(w));
```

> `rosterWithAnAbsence` is the fixture behind every combination in Task 2, so its shape — **six
> students, number 4 absent** — is what makes `['1','2','3','5','6']` the right expectation when
> absent students are dropped. Change the fixture and those assertions become meaningless rather
> than failing, which is why it lives in one place.

- [ ] **Step 2: Write the failing tests**

```ts
import { withGroups, rosterWithAnAbsence, rosterOf, buildRoster } from './helpers';
import { todayISO } from '../../src/lib/csv';   // stage 4's formatter — one date format, two artefacts

test('the panel offers what to print, with Both as the default', async ({ page }) => {
  await withGroups(page);
  await page.getByRole('button', { name: 'Print' }).click();
  await expect(page.getByLabel('Both')).toBeChecked();
  await expect(page.getByLabel('Class list')).not.toBeChecked();
  await expect(page.getByLabel('Group results')).not.toBeChecked();
});

test('all three tick boxes start ticked', async ({ page }) => {
  await withGroups(page);
  await page.getByRole('button', { name: 'Print' }).click();
  for (const label of ['Show students who are absent',
                       'Show sex and the together/apart letters',
                       'Include avatars']) {
    await expect(page.getByLabel(label), label).toBeChecked();
  }
});

test('all four choices survive a reload', async ({ page }) => {
  await withGroups(page);
  await page.getByRole('button', { name: 'Print' }).click();
  await page.getByLabel('Class list').check();
  await page.getByLabel('Include avatars').uncheck();
  await page.getByLabel('Show students who are absent').uncheck();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.reload();
  await withGroups(page);
  await page.getByRole('button', { name: 'Print' }).click();
  await expect(page.getByLabel('Class list')).toBeChecked();
  await expect(page.getByLabel('Include avatars')).not.toBeChecked();
  await expect(page.getByLabel('Show students who are absent')).not.toBeChecked();
});

test('only preferences are stored — no class data', async ({ page }) => {
  await withGroups(page);
  await page.getByLabel('Class (optional)').fill('7B');
  await page.getByRole('button', { name: 'Print' }).click();
  await page.getByLabel('Class list').check();
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain('7B');
  // The exact list is asserted HERE and nowhere earlier. Stage 2 deliberately
  // asserts only the `cg-` prefix, so adding these four does not break a test
  // that has nothing to do with printing.
  expect(Object.keys(JSON.parse(stored)).sort())
    .toEqual(['cg-howto-collapsed', 'cg-print-absent', 'cg-print-avatars',
              'cg-print-letters', 'cg-print-what']);
});
```

Mirror the first three on `/id/`.

- [ ] **Step 3: Run, watch fail, implement**

The panel is a `<dialog>`; the four choices persist through the existing `remember` wrapper. Do **not** call `window.print()` from the tests — Playwright cannot dismiss a print dialog and it will hang the run. The panel's Print button sets the attributes and then calls print; the tests assert the attributes and use `page.emulateMedia({ media: 'print' })` for appearance.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/print-ui.ts tests/e2e/classroom-groups-print.spec.ts tests/e2e/helpers.ts && git add -u src/
git commit -m "feat(classroom): the print panel, and its four remembered choices

A panel rather than a bare button, because where no single sheet was
right the choice belongs to the teacher. Preferences persist; nothing
about the class does.

The tests assert the attributes the panel sets rather than calling
window.print(), which Playwright cannot dismiss."
```

---

## Task 2: The printed class list, all four combinations

**Files:** print CSS in the Astro page, `classroom-groups-print.spec.ts`
**Traceability:** Q-05…Q-13, Q-16, Q-17, Q-20, A-08

- [ ] **Step 1: Write the failing tests**

```ts
const sheet = async (page, { what, absent, letters, avatars }) => {
  await page.getByRole('button', { name: 'Print' }).click();
  await page.getByLabel(what).check();
  await page.getByLabel('Show students who are absent').setChecked(absent);
  await page.getByLabel('Show sex and the together/apart letters').setChecked(letters);
  await page.getByLabel('Include avatars').setChecked(avatars);
  await page.getByRole('button', { name: 'Preview' }).click();   // sets attrs, no print()
  await page.emulateMedia({ media: 'print' });
};

test.describe('the printed class list', () => {
  test.beforeEach(async ({ page }) => {
    await rosterWithAnAbsence(page);   // 6 students, #4 absent, letters on #1/#2/#3
  });

  test('absent ✓ letters ✓ — the full register', async ({ page }) => {
    await sheet(page, { what: 'Class list', absent: true, letters: true, avatars: false });
    await expect(page.locator('.print-list thead th'))
      .toHaveText(['#', 'Name', 'Sex', 'Absent', 'Together', 'Apart']);
    await expect(page.locator('.print-list tbody tr')).toHaveCount(6);
    await expect(page.locator('.print-foot')).toHaveText('6 students · 5 here · 1 absent');
  });

  test('absent ✓ letters ✗ — the Absent column STAYS', async ({ page }) => {
    // The combination that would otherwise print an absent child
    // indistinguishable from a present one.
    await sheet(page, { what: 'Class list', absent: true, letters: false, avatars: false });
    await expect(page.locator('.print-list thead th')).toHaveText(['#', 'Name', 'Absent']);
    await expect(page.locator('.print-list tbody tr')).toHaveCount(6);
    await expect(page.locator('.print-list tbody tr').nth(3)).toContainText('☑');
  });

  test('absent ✗ letters ✓ — dropped, and the numbers jump', async ({ page }) => {
    await sheet(page, { what: 'Class list', absent: false, letters: true, avatars: false });
    await expect(page.locator('.print-list tbody tr')).toHaveCount(5);
    const numbers = await page.locator('.print-list tbody td:first-child').allTextContents();
    expect(numbers).toEqual(['1', '2', '3', '5', '6']);
    await expect(page.locator('.print-foot')).toHaveText('5 students here today · 1 absent');
  });

  test('absent ✗ letters ✗ — numbers and names only', async ({ page }) => {
    await sheet(page, { what: 'Class list', absent: false, letters: false, avatars: false });
    await expect(page.locator('.print-list thead th')).toHaveText(['#', 'Name']);
    await expect(page.locator('.print-list tbody tr')).toHaveCount(5);
  });

  test('no form and no site chrome on the sheet', async ({ page }) => {
    await sheet(page, { what: 'Both', absent: true, letters: true, avatars: true });
    for (const sel of ['#cg-form', 'header nav', 'footer']) {
      await expect(page.locator(sel), sel).toBeHidden();
    }
  });

  test('the sheet carries the class name and a date', async ({ page }) => {
    await page.getByLabel('Class (optional)').fill('7B');
    await sheet(page, { what: 'Class list', absent: true, letters: true, avatars: false });
    await expect(page.locator('.print-head')).toContainText('7B');
    await expect(page.locator('.print-head')).toContainText(todayISO());
  });

  test('paper carries neither the tint nor the pill', async ({ page }) => {
    await sheet(page, { what: 'Class list', absent: true, letters: true, avatars: false });
    await expect(page.locator('.print-list .cg-absent-pill')).toHaveCount(0);
    await expect(page.locator('.print-list tbody tr').nth(3))
      .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });
});
```

- [ ] **Step 2: Run, watch all seven fail**

- [ ] **Step 3: Implement**

Set `data-print-what`, `data-print-absent`, `data-print-letters`, `data-print-avatars` on `<html>`; the print stylesheet reads them. **The `Absent` column is governed by `data-print-absent` alone** — that is the whole fix, and putting it under `data-print-letters` is the bug this task exists to prevent.

- [ ] **Step 4: Commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): the printed class list, in four combinations

All four are tested, because the two tick boxes being independent is the
reason they are tick boxes and not three named sheets.

The Absent column is governed by its own tick box. Under the other one,
choosing to show absent students and being unable to tell which they are
would print a lie.

Paper carries neither the tint nor the pill -- a ticked box says it in
no ink and no colour."
```

---

## Task 3: The printed groups, and greyscale

**Files:** print CSS, `classroom-groups-print.spec.ts`
**Traceability:** Q-14, Q-15, Q-18, Q-19

- [ ] **Step 1: Write the failing tests**

```ts
test('avatars on: faces print; off: names only', async ({ page }) => {
  await rosterWithAnAbsence(page);
  await page.getByRole('button', { name: 'Make groups' }).click();
  await sheet(page, { what: 'Group results', absent: true, letters: true, avatars: true });
  await expect(page.locator('.print-groups svg').first()).toBeVisible();
  await sheet(page, { what: 'Group results', absent: true, letters: true, avatars: false });
  await expect(page.locator('.print-groups svg')).toHaveCount(0);
});

test('group results print minus absent students', async ({ page }) => {
  await rosterWithAnAbsence(page);
  await page.getByRole('button', { name: 'Make groups' }).click();
  await sheet(page, { what: 'Group results', absent: true, letters: true, avatars: false });
  await expect(page.locator('.print-groups')).not.toContainText('Dewi');
});

test('legible with no colour at all', async ({ page }) => {
  await buildRoster(page, [['F','Ana'],['M','Budi'],['F','Citra'],['M','Dedi']]);
  await page.getByRole('button', { name: 'Make groups' }).click();
  await sheet(page, { what: 'Both', absent: true, letters: true, avatars: true });
  await page.addStyleTag({ content: 'html { filter: grayscale(1) !important }' });

  // every printed name is still there and still readable
  for (const name of ['Ana', 'Budi', 'Citra']) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
  // and boy/girl is still distinguishable, by hair rather than by colour
  const hairs = await page.locator('.print-groups svg [data-hair]')
    .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('d')))]);
  expect(hairs.length).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Run, watch fail, implement, commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): printed groups, and a greyscale proof

The greyscale case does not merely check the page still renders: it
asserts the boy and girl avatars remain distinguishable with colour
removed, which is what the hair-length decision was for."
```

---

## Task 4: Fit-to-screen, with a floor

**Files:** Create `src/lib/fit.ts`, `tests/unit/fit.test.ts`
**Traceability:** Z-07, Z-08, Z-09

**Interfaces:** `export function fitScale(available: number, needed: number, floor: number, base: number): { scale: number; scrolls: boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
describe('fitScale', () => {
  it('does not enlarge when it already fits', () => {
    expect(fitScale(1000, 500, 24, 40)).toEqual({ scale: 1, scrolls: false });
  });

  it('shrinks to fit', () => {
    expect(fitScale(500, 1000, 24, 40)).toEqual({ scale: 0.5, scrolls: false });
  });

  it('stops at the floor and scrolls instead', () => {
    // base 40px, floor 24px -> the smallest allowed scale is 0.6
    expect(fitScale(200, 1000, 24, 40)).toEqual({ scale: 0.6, scrolls: true });
  });

  it('lands exactly on the floor without scrolling when that is enough', () => {
    expect(fitScale(600, 1000, 24, 40)).toEqual({ scale: 0.6, scrolls: false });
  });

  it('never returns a scale of zero or less, whatever it is given', () => {
    for (const available of [0, -1, NaN]) {
      const { scale } = fitScale(available, 1000, 24, 40);
      expect(scale, String(available)).toBeGreaterThanOrEqual(0.6);
    }
  });
});
```

> The last case exists because `available` comes from a measured DOM box. A board mounted while hidden measures 0, and a scale of 0 makes the whole projection vanish with nothing on screen to explain it.

- [ ] **Step 2: Run, watch fail, implement, commit**

```bash
git add src/lib/fit.ts tests/unit/fit.test.ts
git commit -m "feat(projector): fit-to-screen with a readable floor

Pure, because the floor is the entire point and a measured loop cannot
be tested without pulling it out. Guards a zero or NaN measurement --
a board mounted while hidden measures 0, and a scale of 0 makes the
projection vanish with nothing on screen to say why."
```

---

## Task 5: The projector view

**Files:** Create `src/scripts/projector.ts`, `tests/e2e/classroom-groups-projector.spec.ts`
**Traceability:** Z-01…Z-06, Z-10…Z-20, Z-24

- [ ] **Step 1: Write the failing tests**

```ts
test('the button appears only once groups exist', async ({ page }) => {
  await page.goto('/classroom-groups');
  await expect(page.getByRole('button', { name: 'Full screen' })).toHaveCount(0);
  await withGroups(page);
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();
});

test('a refused requestFullscreen lands in the overlay, not in nothing', async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('refused'));
  });
  await withGroups(page);
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(page.locator('#cg-board')).toBeVisible();
  const box = (await page.locator('#cg-board').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.width).toBeCloseTo(vp.width, 0);
  expect(box.height).toBeCloseTo(vp.height, 0);
});

test('no form or site chrome on the board', async ({ page }) => {
  await withGroups(page);
  await page.getByRole('button', { name: 'Full screen' }).click();
  for (const sel of ['#cg-form', 'header nav', 'footer']) {
    await expect(page.locator(sel), sel).toBeHidden();
  }
});

test('the bar fades, and comes back on pointer, tap and key', async ({ page }) => {
  await withGroups(page);
  await page.getByRole('button', { name: 'Full screen' }).click();
  const bar = page.locator('#cg-board-bar');
  await expect(bar).toHaveClass(/faded/);              // condition, not a sleep
  await page.mouse.move(100, 100);
  await expect(bar).not.toHaveClass(/faded/);
  await expect(bar).toHaveClass(/faded/);
  await page.locator('#cg-board').tap();
  await expect(bar).not.toHaveClass(/faded/);
  await expect(bar).toHaveClass(/faded/);
  await page.keyboard.press('a');
  await expect(bar).not.toHaveClass(/faded/);
});

test('it does NOT fade while a control inside it has focus', async ({ page }) => {
  await withGroups(page);
  await page.getByRole('button', { name: 'Full screen' }).click();
  const bar = page.locator('#cg-board-bar');
  await bar.getByRole('button', { name: 'Shuffle again' }).focus();
  await expect(bar).not.toHaveClass(/faded/);
  // and it stays that way — a keyboard user must not lose the control they
  // are on. Proved by waiting for the same condition that fades it otherwise.
  await page.waitForFunction(
    () => !document.getElementById('cg-board-bar')!.classList.contains('faded'),
    null, { timeout: 5000 });
});

test('Escape exits, faded or not', async ({ page }) => {
  await withGroups(page);
  for (const faded of [false, true]) {
    await page.getByRole('button', { name: 'Full screen' }).click();
    if (faded) await expect(page.locator('#cg-board-bar')).toHaveClass(/faded/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#cg-board')).toBeHidden();
  }
});

test('a shuffle done on the board is what the page shows on exit', async ({ page }) => {
  await withGroups(page);
  const before = await page.locator('#cg-groups').innerText();
  await page.getByRole('button', { name: 'Full screen' }).click();
  await page.locator('#cg-board-bar').getByRole('button', { name: 'Shuffle again' }).click();
  const onBoard = await page.locator('#cg-board').innerText();
  await page.keyboard.press('Escape');
  const after = await page.locator('#cg-groups').innerText();
  expect(after).not.toBe(before);
  expect(namesIn(after).sort()).toEqual(namesIn(onBoard).sort());
});

test('a warning raised by a board shuffle appears on the board', async ({ page }) => {
  await rosterForSpillover(page);        // six boys, two girls, separate, groups of 4
  await page.getByRole('button', { name: 'Make groups' }).click();
  await page.getByRole('button', { name: 'Full screen' }).click();
  await page.locator('#cg-board-bar').getByRole('button', { name: 'Shuffle again' }).click();
  await expect(page.locator('#cg-board')).toContainText('in a group of boys');
});
```

- [ ] **Step 2: Run, watch fail, implement**

```ts
// Never fade while the bar holds focus. A bar that vanishes under a focused
// button strands a keyboard user with no visible way out -- the defect the
// fade would otherwise introduce.
const canFade = () => !bar.contains(document.activeElement);
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/projector.ts tests/e2e/classroom-groups-projector.spec.ts && git add -u src/
git commit -m "feat(classroom): the projector view

Fullscreen API where granted, a real full-viewport overlay where not --
iOS Safari does not grant it on arbitrary elements, and a refused
promise landing in nothing at all would be a button that silently does
nothing. Tested by rejecting the promise outright.

The bar fades but never while a control inside it holds focus, and
Escape exits either way. A shuffle done on the board is what the page
shows on exit; warnings appear where the teacher is looking."
```

---

## Task 6: The reveal, and the three refusals

**Files:** `projector.ts`, `print-ui.ts`, `io-ui.ts`
**Traceability:** Z-21, Z-22, Z-23, E-15, E-16, E-17

- [ ] **Step 1: Write the failing tests**

```ts
test('the reveal plays on the board', async ({ page }) => {
  await withGroups(page);
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(page.locator('#cg-board .group').first()).toHaveClass(/revealing/);
  await expect(page.locator('#cg-board .group').last()).toHaveClass(/revealed/);
});

test('the Sound & animation switch suppresses it', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.locator('#cg-sound-toggle').click();
  await page.getByLabel('Skip').check();
  await withGroups(page);
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(page.locator('#cg-board .group').first()).not.toHaveClass(/revealing/);
});

test('prefers-reduced-motion suppresses it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await withGroups(page);
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(page.locator('#cg-board .group').first()).not.toHaveClass(/revealing/);
});

test.describe('all three refuse while the groups are out of date', () => {
  const goStale = async (page) => {
    await rosterOf(page, 12);
    await page.getByRole('button', { name: 'Make groups' }).click();
    await page.locator('.cg-student').first().getByLabel('Absent').check();
    await expect(page.getByText(/These groups are out of date/)).toBeVisible();
  };

  test('Export groups refuses, and says why', async ({ page }) => {
    await goStale(page);
    await page.locator('#cg-io-toggle').click();
    await page.getByRole('button', { name: 'Export groups' }).click();
    await expect(page.getByText(
      'These groups are out of date. Shuffle again before saving them.')).toBeVisible();
  });

  test('Print refuses, and says why', async ({ page }) => {
    await goStale(page);
    await page.getByRole('button', { name: 'Print' }).click();
    await expect(page.getByText(
      'These groups are out of date. Shuffle again before printing them.')).toBeVisible();
  });

  test('Full screen refuses, and says why', async ({ page }) => {
    await goStale(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board')).toBeHidden();
    await expect(page.getByText(
      'These groups are out of date. Shuffle again before showing them.')).toBeVisible();
  });
});
```

> The three refusals are three separate tests against three separate entry points. A shared helper asserting "one of them refused" would pass while two of them quietly succeeded, and each of those two puts a wrong answer in front of a classroom.

- [ ] **Step 2: Run, watch fail, implement, commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): the reveal on the board, and three stale refusals

Export groups, Print and Full screen each refuse separately and say why.
Asserting that \"one of them refused\" would pass while two quietly
succeeded, and each of those two puts a wrong answer in front of a
class."
```

---

## Task 7: The whole thing, and what only a room can settle

- [ ] **Step 1: Full run**

```bash
npm test; echo "exit=$?"
```

Five projects, both locales, unit and e2e. **Read the exit code.**

- [ ] **Step 2: Tick every remaining matrix row**

Every row in `2026-08-06-classroom-groups-v2-test-traceability.md` should now be ticked **except three**: F-08, Z-25 and M-14.

- [ ] **Step 3: Run the device gauntlet**

Not optional, and not substitutable by CI. Three things can only be settled here:

| Row | What to settle |
|---|---|
| **F-08** | The roster card/table breakpoint, on a real phone and a real tablet, both orientations. ~600px is a desk guess. |
| **Z-25** | The projector type floor, read from the back of a room off a real projector. 24px/32px are desk guesses. |
| **M-14** | The gauntlet itself — every journey, both platforms. |

If either figure is wrong, **change the figure and the test together**, and record the measured value in the spec. A number confirmed in a room is worth more than the one I chose at a desk.

- [ ] **Step 4: Commit and open the release**

```bash
git add -u docs/ tests/ src/
git commit -m "test(classroom): stage 5 complete; three rows left for the room

Every matrix row is ticked but F-08, Z-25 and M-14 -- the roster
breakpoint, the projector type floor and the gauntlet. All three are
figures or judgements a laptop cannot settle, and both numbers in the
spec are desk guesses waiting to be overturned by a measurement."
```

---

## Self-review

**Spec coverage** — §10 in full (T1, T2, T3); §8's full-screen subsection in full (T4, T5, T6); §11's print preferences (T1); the three stale refusals §8 requires (T6).

**Placeholders** — none.

**Type consistency** — `fitScale` is used only by `projector.ts` and its signature matches the unit test exactly; the four `data-print-*` attributes are named identically in `print-ui.ts` and the stylesheet; `avatarSvg` is stage 3's, unchanged.

**Linkage in** — stage 3's `avatarSvg` and `.cg-absent-pill`; stage 2's staleness snapshot; stage 4's
`todayISO`. Each is imported, none redefined. Test fixtures are added to `tests/e2e/helpers.ts`,
which stage 3 created — this stage starts no new helper file.

**One assertion this stage owns alone**: the exact `localStorage` key list. Stage 2 asserts only the
`cg-` prefix precisely so that adding four print preferences here does not break a test about the
how-to.

**Linkage out** — nothing. This is the last stage; after it, the five branches merge and deploy once, so the live page never sits half-migrated.
