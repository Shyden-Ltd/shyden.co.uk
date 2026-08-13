import { test, expect } from './fixtures';
import {
  openRoster,
  addSeveral,
  markAbsent,
  giveEveryoneASex,
} from './helpers';

/**
 * Stage 3, Task 2: the roster table. Traceability: R-01, R-02, R-09, R-10,
 * R-11, F-02, A-01, L-06 (design spec section 13 /
 * docs/superpowers/plans/2026-08-06-classroom-groups-v2-test-traceability.md).
 *
 * Stage 3, Task 2's own brief asserts the unnamed-row test against
 * `#cg-groups` -- the SAME mistake Stage 2, Task 1's own brief made and
 * classroom-groups.spec.ts already corrected (see that file's own comment,
 * just above its first test): `#cg-groups` is the "number of groups"
 * NUMBER INPUT's id (`ClassroomGroupsPage.astro`'s `.split-by` field), not
 * the results container. Corrected to `#cg-results` here, and in
 * `tests/e2e/helpers.ts`'s own `withGroups` -- the same correction later
 * stages' own briefs (Task 9, Task 10) will need too, since they repeat the
 * identical `#cg-groups` snippet.
 */

test.describe('the roster table', () => {
  // Seven columns, not six, as of Stage 3, Task 6's own fix round: Remove
  // earns a real header, not a silently unlabelled cell. This title used
  // to read "the table has the six columns, in order", asserting exactly
  // six -- that number was pinning the column count as it stood at Task 2,
  // never a requirement anyone actually chose. When Remove's own column
  // landed with no `<th>` of its own (reasoned, at the time, as the way to
  // avoid reddening THIS test), the real defect was a table column with no
  // accessible name at all -- do not "fix" this back down to six; six was
  // the bug's own shape, not the contract. The seventh header's own text
  // ('Remove'/'Hapus') is present in the DOM -- `toHaveText` reads it here
  // exactly as it reads the other six -- but visually hidden via CSS clip
  // (ClassroomGroupsPage.astro's own `.cg-roster-remove-heading`): a
  // screen reader building this table's column headers finds a real name
  // for every one of the seven, while a sighted teacher never sees a
  // printed "Remove" heading sitting above a column of seven identical
  // "Remove" buttons repeating the same word.
  test('the table has seven columns, in order — the seventh (Remove) has a real header, visually hidden but present', async ({
    page,
  }) => {
    await openRoster(page);
    // Absent leads (operator, 2026-08-13). Every positional rule that depends
    // on this order moves with it — see ClassroomGroupsPage.astro's
    // `.cg-student > td:nth-child(...)` card layout, its `col:nth-child(...)`
    // widths, and the print letters rule.
    await expect(page.locator('#cg-roster thead th')).toHaveText([
      'Absent',
      '#',
      'Name',
      'Sex',
      'Together',
      'Apart',
      'Remove',
    ]);
  });

  // The general invariant "the table has seven columns" above pins today.
  // This is the one that stops it drifting again: derived from the DOM on
  // BOTH sides (colgroup's own <col> count, thead's own <th> count),
  // never a hard-coded number, so an eighth column added later without
  // its own header -- or a header added without its own column -- fails
  // here regardless of what the actual count turns out to be.
  test('every column has a header — the header count matches the column count', async ({
    page,
  }) => {
    await openRoster(page);
    const columnCount = await page.locator('#cg-roster colgroup col').count();
    const headerCount = await page.locator('#cg-roster thead th').count();
    expect(headerCount).toBe(columnCount);
  });

  test('an unnamed row renders Student N in the results', async ({ page }) => {
    await openRoster(page);
    await giveEveryoneASex(page);
    await page.getByRole('button', { name: 'Make groups' }).click();
    await expect(page.locator('#cg-results')).toContainText('Student 1');
  });

  test('an empty name box is exactly as wide as a full one', async ({
    page,
  }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    await page
      .locator('#cg-roster tbody tr')
      .nth(0)
      .getByLabel('Name')
      .fill('Sebastianus');
    const a = (await page
      .locator('#cg-roster tbody tr')
      .nth(0)
      .getByLabel('Name')
      .boundingBox())!;
    const b = (await page
      .locator('#cg-roster tbody tr')
      .nth(1)
      .getByLabel('Name')
      .boundingBox())!;
    expect(b.width).toBeCloseTo(a.width, 0);
  });

  test(
    'a long name does not push the letters out of view',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await openRoster(page);
      await page
        .locator('#cg-roster tbody tr')
        .nth(0)
        .getByLabel('Name')
        .fill('Maria Anastasia Wijayanti');
      const over = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(over).toBeLessThanOrEqual(0);
    },
  );

  // Not a claim about the 320px CARD layout (a later stage-3 task's own
  // job, and design spec section 3 is explicit that a table cannot meet
  // 44px at 320px with six columns -- that is WHY the reflow exists). This
  // only proves the HEIGHT half of the touch-target rule, which fixed
  // percentage-width columns cannot squeeze the way width can be squeezed,
  // so it holds regardless of viewport -- run at each project's own default
  // (desktop for chromium/firefox/webkit, a phone's own default for
  // mobile-chrome/mobile-safari) rather than pinned to one.
  test('per-row controls meet the 44px minimum height', async ({ page }) => {
    await openRoster(page);
    const row = page.locator('.cg-student').first();
    for (const label of ['#', 'Name', 'Sex', 'Together', 'Apart']) {
      const box = (await row.getByLabel(label).boundingBox())!;
      expect(box.height, label).toBeGreaterThanOrEqual(44);
    }
    // The checkbox itself is drawn small on purpose, matching this page's
    // existing `.switch input` convention -- its REAL tap target is the
    // <label> wrapping it. Measuring the bare input here would repeat the
    // exact false failure classroom-groups-controls.spec.ts's own "the two
    // sex switches meet the 44px touch target once open" test already
    // documents hitting once, and already works around the same way: via
    // `.closest('label')`, not the input's own rect.
    const absent = await row.getByLabel('Absent').evaluate((el) => {
      const target = el.closest('label') ?? el;
      const r = target.getBoundingClientRect();
      return r.height;
    });
    expect(absent, 'Absent (label)').toBeGreaterThanOrEqual(44);
  });

  test('no console errors while building a roster', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    await openRoster(page);
    await addSeveral(page, 3);
    const row = page.locator('.cg-student').first();
    await row.getByLabel('Name').fill('Ana');
    await row.getByLabel('Sex').selectOption('F');
    await row.getByLabel('Absent').check();
    await row.getByLabel('Together').selectOption('A');
    await giveEveryoneASex(page);
    await page.getByRole('button', { name: 'Make groups' }).click();

    expect(errors, errors.join(' | ')).toEqual([]);
  });
});

// R-01 (numbers assigned 1…N, the Playwright half -- nextNumber's own unit
// coverage is tests/unit/roster.test.ts) and R-02 (the teacher may override
// a number).
test.describe('numbers', () => {
  test('assigned 1, 2, 3… in the order rows are added', async ({ page }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    await page.getByRole('button', { name: 'Add student' }).click();
    // Individually, not `toHaveValue(['1','2','3'])` against the whole
    // multi-element locator -- unlike `toHaveText`, `toHaveValue` is a
    // single-element (strict-mode) matcher and does not accept an array for
    // a locator resolving to more than one node.
    const rows = page.locator('.cg-student');
    await expect(rows.nth(0).getByLabel('#')).toHaveValue('1');
    await expect(rows.nth(1).getByLabel('#')).toHaveValue('2');
    await expect(rows.nth(2).getByLabel('#')).toHaveValue('3');
  });

  test('the teacher may override a number, and a later add still takes one past the highest', async ({
    page,
  }) => {
    await openRoster(page);
    const first = page.locator('.cg-student').first().getByLabel('#');
    await first.fill('50');
    await expect(first).toHaveValue('50');
    // Proves the override reached the actual roster, not just the visible
    // input: the next student added takes one past 50, not one past 1.
    await page.getByRole('button', { name: 'Add student' }).click();
    await expect(
      page.locator('.cg-student').nth(1).getByLabel('#'),
    ).toHaveValue('51');
  });
});

// A-01: the Absent column, and ticking it marking a student out. The tint,
// stripe and pill it also carries (design spec section 4) are a later
// task's own job (traceability A-05…A-09) -- this proves the functional
// consequence the column exists for.
test.describe('absence', () => {
  test('ticking Absent excludes that student from the results', async ({
    page,
  }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    await page.locator('.cg-student').first().getByLabel('Absent').check();
    await giveEveryoneASex(page);
    await page.getByRole('button', { name: 'Make groups' }).click();
    await expect(page.locator('#cg-results')).not.toContainText('Student 1');
    await expect(page.locator('#cg-results')).toContainText('Student 2');
  });

  test('nothing in the row is disabled by ticking it', async ({ page }) => {
    await openRoster(page);
    const row = page.locator('.cg-student').first();
    await row.getByLabel('Absent').check();
    for (const label of ['Name', 'Sex', 'Together', 'Apart']) {
      await expect(row.getByLabel(label), label).toBeEnabled();
    }
  });
});

/**
 * Stage 3, Task 4: absence, rendered. Traceability: A-05…A-10, A-19, A-20,
 * and F-05 (the tint/stripe/pill on the CARD, not just the row) -- handed
 * to this task explicitly by Task 3's own carried-forward note, since
 * `.cg-student` is the one element both layouts share and neither task 2
 * nor task 3 could style it. A-01…A-04 are already proven above (Task 2's
 * own 'absence' describe block, immediately before this one) -- not
 * reproduced here.
 *
 * task-4-brief.md's own Step 1 snippet is reproduced below with real
 * differences, not verbatim:
 *  - Its own first test, 'nothing in the row is disabled', duplicates
 *    Task 2's 'nothing in the row is disabled by ticking it' immediately
 *    above -- identical assertions, same four labels. Design spec section
 *    13's own rule ("the existing suites are extended, not duplicated")
 *    is why it is not reproduced a second time under a second title.
 *  - `markAbsent` is defined in tests/e2e/helpers.ts, not locally, per
 *    that file's own header rule -- see its own doc comment there.
 *  - The count-line test replaces the brief's own three inline clicks with
 *    `addSeveral`, the established correction this file's own Task 3
 *    section already made once for the identical reason.
 *  - Every test that resizes the viewport carries `@emulated-viewport`
 *    (global-constraints.md; tests/unit/viewport-tagging.test.ts is a hard
 *    guard on it), which the brief's own snippet does not carry on any of
 *    its tests -- none of the brief's own six actually resize the
 *    viewport, so none needed it; the tag only appears below on the tests
 *    THIS task adds beyond the brief.
 *
 * Three tests below are not in the brief at all, added because the parent
 * task explicitly named the risk they cover:
 *  - the card/table parity loop -- proving F-05 on BOTH layouts, not
 *    assuming the shared `.cg-student` selector makes it automatic;
 *  - the pill's own AA contrast, computed from live styles the same way
 *    classroom-groups.spec.ts's own accent-colour test already does,
 *    rather than trusting the hex pair by eye;
 *  - a no-horizontal-scroll check at 320px WITH the pill actually
 *    rendered -- the existing 100-student check (Task 3, above) never
 *    marks anyone absent, so it never exercises the one extra element this
 *    task adds to the tightest column on the narrowest layout.
 */
test.describe('an absent student', () => {
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
    await page.addStyleTag({
      content: 'html { filter: grayscale(1) !important }',
    });
    await expect(
      page.locator('.cg-student').first().getByLabel('Absent'),
    ).toBeChecked();
    await expect(
      page.locator('.cg-student').first().locator('.cg-absent-pill'),
    ).toHaveText('absent');
  });

  test('the consequence line is there before anyone is marked', async ({
    page,
  }) => {
    await openRoster(page);
    await expect(
      page.getByText(
        'Students marked absent are not included when groups are made.',
      ),
    ).toBeVisible();
  });

  test('the count line reads students, here and absent', async ({ page }) => {
    await openRoster(page);
    await addSeveral(page, 23);
    await page.locator('.cg-student').first().getByLabel('Absent').check();
    await page.locator('.cg-student').nth(1).getByLabel('Absent').check();
    await expect(page.locator('#cg-roster-count')).toHaveText(
      '24 students · 22 here · 2 absent',
    );
  });

  test('the word is never "away", anywhere', async ({ page }) => {
    await markAbsent(page);
    await giveEveryoneASex(page);
    await page.getByRole('button', { name: 'Make groups' }).click();
    await expect(page.locator('body')).not.toContainText(/\baway\b/);
  });

  // F-05: the SAME `.cg-student` (roster-ui.ts's whole "one renderer, two
  // CSS layouts" point) must carry the tint, the stripe and the pill in
  // BOTH shapes, not only the one Task 2 happened to build against first.
  // The stripe assertion is loose on purpose (`not.toBe('none')`, not an
  // exact rgb/inset string): box-shadow's computed-style text format is
  // not identical across the five engines this task was told to check
  // (the same "WebKit lies" caution the brief itself raises about
  // min-height applies just as well to trusting one engine's own
  // serialisation of a shadow), and the two layouts deliberately paint the
  // stripe on two DIFFERENT elements (see ClassroomGroupsPage.astro's own
  // comment on `.cg-student.is-absent` for why box-shadow cannot paint on
  // a `display: table-row` box at all), so a single exact string could
  // never describe both correctly.
  for (const { name, width } of [
    { name: 'cards', width: 320 },
    { name: 'table', width: 1280 },
  ] as const) {
    test(
      `${name}: absence carries the tint, the stripe and the pill -- same element as the table`,
      { tag: '@emulated-viewport' },
      async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await markAbsent(page);
        const row = page.locator('.cg-student').first();
        await expect(row).toHaveCSS('background-color', 'rgb(255, 246, 227)');
        await expect(row.locator('.cg-absent-pill')).toHaveText('absent');
        const stripeTarget = width < 600 ? row : row.locator('td').first();
        const boxShadow = await stripeTarget.evaluate(
          (el) => getComputedStyle(el).boxShadow,
        );
        expect(boxShadow, `${name} stripe`).not.toBe('none');
      },
    );
  }

  // L-09-shaped, mirroring classroom-groups.spec.ts's own "the accent
  // colour still meets the WCAG AA contrast floor" test: computes the REAL
  // painted contrast from live computed styles rather than trusting the
  // #8a6a10/#fff hex pair by eye. "Any tint you add must keep text on it
  // at AA" (this task's own constraint) applies to the pill's own
  // background just as much as the row's.
  test('the pill text meets the WCAG AA contrast floor', async ({ page }) => {
    await markAbsent(page);
    const contrast = await page
      .locator('.cg-absent-pill')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        const nums = (css: string) => css.match(/[\d.]+/g)!.map(Number);
        const [ir, ig, ib] = nums(style.color);
        const [br, bg, bb] = nums(style.backgroundColor);
        const lin = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (r: number, g: number, b: number) =>
          0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const textLum = luminance(ir, ig, ib);
        const bgLum = luminance(br, bg, bb);
        const lighter = Math.max(textLum, bgLum);
        const darker = Math.min(textLum, bgLum);
        return (lighter + 0.05) / (darker + 0.05);
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  test(
    'cards: no horizontal scroll at 320px once a student is marked absent',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await markAbsent(page);
      const over = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(over).toBeLessThanOrEqual(0);
    },
  );
});

// T-06 -- claimed by no task's own traceability line (checked: it appears
// only in the plan's stage-level rollup, docs/superpowers/plans/2026-08-06-
// classroom-groups-v2-stage-3-student-details.md line 13), yet Task 2 is
// unambiguously the task that first renders the together/apart columns at
// all. Picked up here rather than left for a task that never claims it.
test.describe('together/apart letters', () => {
  test('the dropdown grows as needed -- B appears once A is used', async ({
    page,
  }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    const row0 = page.locator('.cg-student').nth(0);
    const row1 = page.locator('.cg-student').nth(1);

    await expect(row0.getByLabel('Together').locator('option')).toHaveText([
      '—',
      'A',
    ]);

    await row0.getByLabel('Together').selectOption('A');

    // Every row's own dropdown grows, not only the one A was just set on.
    await expect(row0.getByLabel('Together').locator('option')).toHaveText([
      '—',
      'A',
      'B',
    ]);
    await expect(row1.getByLabel('Together').locator('option')).toHaveText([
      '—',
      'A',
      'B',
    ]);
  });

  test('together and apart grow independently', async ({ page }) => {
    await openRoster(page);
    const row = page.locator('.cg-student').first();
    await row.getByLabel('Together').selectOption('A');
    // Apart has had nothing set on it yet, so it must still offer only A --
    // a shared counter across both fields would leak Together's own use
    // into Apart's own list.
    await expect(row.getByLabel('Apart').locator('option')).toHaveText([
      '—',
      'A',
    ]);
  });
});

// Global constraint, this stage (design spec section 11): "The roster
// is never persisted. Not localStorage, not sessionStorage, not the URL."
// A dedicated, exhaustive sweep across every roster operation is Task 10's
// own job (Y-01…Y-04) -- this is a lighter, standing proof that THIS task's
// own new code path (building a roster at all) does not write one, so a
// regression here is caught by the task that introduced the risk, not only
// by the one that audits the whole stage at the end.
test.describe('the roster is never persisted', () => {
  test('a typed name never reaches localStorage or sessionStorage', async ({
    page,
  }) => {
    await openRoster(page);
    await addSeveral(page, 2);
    await page
      .locator('.cg-student')
      .first()
      .getByLabel('Name')
      .fill('PrivacyProbeStudentName');
    const stored = await page.evaluate(() => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
    }));
    expect(stored.local).not.toContain('PrivacyProbeStudentName');
    expect(stored.session).not.toContain('PrivacyProbeStudentName');
  });
});

// L-06's own layout half (no scroll) is proven above; this is the two
// section headers a roster now gives something real to report -- design
// spec section 3's "every collapsed header reports its own state" rule,
// and Task 1's own deferred `dirty` e2e coverage (flagged in Task 1's own
// report as worth a deliberate look once Task 2 lands and setRoster gets
// its first real caller). `openRoster` is exactly that first caller.
test.describe('headers follow the roster, live', () => {
  test('the Student details header reports the roster once one exists', async ({
    page,
  }) => {
    await openRoster(page);
    await expect(page.locator('#cg-students-toggle')).toHaveText(
      'Student details · 1 added',
    );
  });

  test('and counts a named student once one is named', async ({ page }) => {
    await openRoster(page);
    await page.locator('.cg-student').first().getByLabel('Name').fill('Ana');
    await expect(page.locator('#cg-students-toggle')).toHaveText(
      'Student details · 1 named',
    );
  });

  // Task 1's own Step 3b test 2, deferred there because `openRoster` did
  // not exist yet -- picked up here now that it does. Test 1 of that same
  // step ("nothing to save yet" on load) is already covered by Stage 2's
  // classroom-groups-controls.spec.ts.
  test('any roster change makes it unsaved', async ({ page }) => {
    await openRoster(page);
    await expect(page.locator('#cg-io .state')).toHaveText(
      'unsaved changes — export to keep them',
    );
  });

  // Task 1's own Step 3b test 3, carried forward rather than lost: it
  // appeared in NEITHER Task 1's nor Task 2's own test list (both read in
  // full at the time -- see task-1-report.md and progress.md), because
  // "Clear all" did not exist until this task builds it (design spec
  // section 4, "Emptying the list"). It lands here now that it does.
  test('clearing the roster returns it to nothing to save', async ({
    page,
  }) => {
    await openRoster(page);
    await expect(page.locator('#cg-io .state')).toHaveText(
      'unsaved changes — export to keep them',
    );
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.locator('#cg-io .state')).toHaveText(
      'nothing to save yet',
    );
  });
});

/**
 * Stage 3, Task 5: validation as it is typed. Traceability: R-04, R-05,
 * R-06, T-07 (design spec section 13 / test-traceability.md) -- R-07 and
 * T-08 (the matching engine-side refusals) are already proven by
 * grouping.test.ts; this is the PAGE half, catching the identical fact one
 * keystroke earlier, before the button is ever pressed.
 *
 * task-5-brief.md's own Step 3 snippet is reproduced below with one real
 * correction, not verbatim: its own "a gap warns but does not block" test
 * fills the FIRST (and, at that point, ONLY) roster row's number to '4' --
 * a one-student roster has no internal range to be missing a number FROM
 * (rosterWarnings measures gaps between the roster's own min and max; see
 * that function's own doc comment in src/lib/roster.ts, and its "does not
 * treat a roster starting above 1 as a gap" / "is quiet on a single-student
 * roster" unit tests), so that exact sequence produces no warning at all
 * under a correct implementation -- confirmed by running it before this fix
 * existed. Corrected here by adding one more student first, so editing the
 * SECOND row's number actually opens a gap (1, then 4 -- missing 2 and 3)
 * rather than merely renumbering the only row that exists.
 */
test.describe('validation as it is typed', () => {
  test('a duplicate number is refused as it is typed', async ({ page }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    await page.locator('.cg-student').nth(1).getByLabel('#').fill('1');
    await expect(page.getByText(/Number 1 is already used/)).toBeVisible();
    // and before the button is ever pressed
    await expect(
      page.getByRole('button', { name: 'Make groups' }),
    ).toBeDisabled();
  });

  test('a together-and-apart clash is refused as it is typed', async ({
    page,
  }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    const row0 = page.locator('.cg-student').nth(0);
    const row1 = page.locator('.cg-student').nth(1);
    await row0.getByLabel('Together').selectOption('A');
    await row1.getByLabel('Together').selectOption('A');
    await row0.getByLabel('Apart').selectOption('A');
    await row1.getByLabel('Apart').selectOption('A');
    await expect(
      page.getByText(/are kept together, so they cannot also be kept apart/),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Make groups' }),
    ).toBeDisabled();
  });

  test('a gap warns but does not block', async ({ page }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    await page.locator('.cg-student').nth(1).getByLabel('#').fill('4');
    await expect(page.getByText(/looks incomplete/)).toBeVisible();
    await giveEveryoneASex(page);
    await expect(
      page.getByRole('button', { name: 'Make groups' }),
    ).toBeEnabled();
  });

  // R-06 -- "…naming who already holds it" -- proven with a REAL typed
  // name, not only the "Student N" fallback the first test above exercises
  // (neither student there is ever named).
  test('a duplicate names the student who already holds the number, by name', async ({
    page,
  }) => {
    await openRoster(page);
    await page.locator('.cg-student').first().getByLabel('Name').fill('Eko');
    await page.getByRole('button', { name: 'Add student' }).click();
    await page.locator('.cg-student').nth(1).getByLabel('#').fill('1');
    await expect(
      page.getByText(
        'Number 1 is already used by Eko. Every student needs their own.',
      ),
    ).toBeVisible();
  });

  // This task's own central risk: a re-render mid-keystroke would steal the
  // focus and the caret out from under whoever is typing (roster-ui.ts's
  // own RosterHandlers doc comment). Every test above reads the message
  // AFTER the triggering edit, which would pass just as well whether or not
  // a re-render happened in between -- this is the one that actually proves
  // it did not: the SAME locator handle used to type is asserted still
  // focused, holding exactly what was typed, once the message is showing.
  test('the duplicate message appears without stealing focus or the caret from the field being typed in', async ({
    page,
  }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    const secondNumber = page.locator('.cg-student').nth(1).getByLabel('#');
    await secondNumber.fill('1');
    await expect(page.getByText(/Number 1 is already used/)).toBeVisible();
    await expect(secondNumber).toBeFocused();
    await expect(secondNumber).toHaveValue('1');
  });

  // Errors must be announced accessibly, not just shown -- the same rule
  // classroom-groups-announcements.spec.ts already proves for #cg-error.
  // role="alert" is what makes a screen reader interrupt with this the
  // moment it appears, matching that established pattern rather than a new
  // one for this notice.
  test('the duplicate refusal is announced accessibly, not just shown', async ({
    page,
  }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    await page.locator('.cg-student').nth(1).getByLabel('#').fill('1');
    await expect(page.locator('#cg-roster-problem')).toHaveAttribute(
      'role',
      'alert',
    );
    await expect(page.locator('#cg-roster-problem')).toBeVisible();
  });

  // The gap warning is announced too, but politely (role="status") rather
  // than as an interruption -- it is a non-blocking notice, not a refusal,
  // and "Make groups" stays enabled while it shows (proven above).
  test('the gap warning is announced politely, not as an alert', async ({
    page,
  }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    await page.locator('.cg-student').nth(1).getByLabel('#').fill('4');
    await expect(page.locator('#cg-roster-warning')).toHaveAttribute(
      'role',
      'status',
    );
  });

  // The block is a COMPARISON, not a one-way latch -- the same "a
  // dirty/stale flag must be able to clear again" philosophy this page
  // already applies to `dirty` (classroom-groups.ts) and `staleReason`
  // (staleness.ts). Fixing the duplicate must re-enable the button, not
  // leave it disabled forever once a problem has ever existed.
  test('fixing the duplicate re-enables Make groups and clears the message', async ({
    page,
  }) => {
    await openRoster(page);
    await page.getByRole('button', { name: 'Add student' }).click();
    const secondNumber = page.locator('.cg-student').nth(1).getByLabel('#');
    await secondNumber.fill('1');
    await expect(
      page.getByRole('button', { name: 'Make groups' }),
    ).toBeDisabled();
    await secondNumber.fill('2');
    await expect(page.getByText(/Number 1 is already used/)).toBeHidden();
    await giveEveryoneASex(page);
    await expect(
      page.getByRole('button', { name: 'Make groups' }),
    ).toBeEnabled();
  });
});

/**
 * Stage 3, Task 6: adding, removing, and the two limits. Traceability:
 * R-08, B-06…B-09, X-02…X-06, X-08 (design spec section 4 /
 * test-traceability.md).
 *
 * task-6-brief.md's own Step 1 snippet is reproduced below with corrections
 * and additions, not verbatim:
 *  - Its own "Student details refuses to open above 100" test uses
 *    `page.getByLabel('How many students?')` -- that label does not exist
 *    on this page. The field's real accessible name is "Number of
 *    students" (`studentsLabel` in en.ts) -- the SAME correction
 *    classroom-groups.spec.ts and classroom-groups-controls.spec.ts each
 *    already made once for the identical brief mistake (see either file's
 *    own comment recording it).
 *  - B-09 ("Removing a row lowers it") is named by this task's own
 *    traceability line but is not exercised by any of the brief's five
 *    given tests at all -- picked up below in its own describe block,
 *    along with the identity question this task's own brief was explicit
 *    is not to be answered by assumption: removing a student must not
 *    renumber the others (design spec section 4's "gaps allowed... a
 *    number belongs to a student, not a position").
 *  - R-08's own traceability line names the design spec's literal example
 *    (1, 2, 3, 5 -> 6, a real GAP), which the brief's own "a new student
 *    takes one past the highest" test does not quite reproduce (it sets
 *    ONE student's number to 5 without first creating the 1/2/3 that make
 *    it a genuine gap rather than merely a highest value) -- reproduced
 *    literally as a second, additional test.
 */
test.describe('adding, removing, and the two limits', () => {
  test('Add several is inline — no dialog', async ({ page }) => {
    await openRoster(page);
    page.on('dialog', () => {
      throw new Error('a dialog was opened');
    });
    await page.getByRole('button', { name: 'Add several' }).click();
    await expect(page.getByLabel('How many to add?')).toBeVisible();
  });

  test('a new student takes one past the highest', async ({ page }) => {
    await openRoster(page);
    await page.locator('.cg-student').first().getByLabel('#').fill('5');
    await page.getByRole('button', { name: 'Add student' }).click();
    await expect(
      page.locator('.cg-student').nth(1).getByLabel('#'),
    ).toHaveValue('6');
  });

  // Not in the brief -- R-08's own literal example (design spec section 4,
  // "Numbers": "With 1, 2, 3 and 5 on the list the next student is 6, not
  // 4"), proving a REAL gap is not filled before a fresh highest.
  test('a new student takes one past the highest even across a real gap — 1, 2, 3, 5 then Add student gives 6', async ({
    page,
  }) => {
    await openRoster(page);
    await addSeveral(page, 3); // rows #1, 2, 3, 4
    await page.locator('.cg-student').nth(3).getByLabel('#').fill('5'); // now 1, 2, 3, 5 -- a real gap at 4
    await page.getByRole('button', { name: 'Add student' }).click();
    await expect(
      page.locator('.cg-student').nth(4).getByLabel('#'),
    ).toHaveValue('6');
  });

  test('both add controls disable at 100, stating the limit', async ({
    page,
  }) => {
    await openRoster(page);
    await addSeveral(page, 99);
    await expect(
      page.getByRole('button', { name: 'Add student' }),
    ).toBeDisabled();
    await expect(
      page.getByText('Student details holds up to 100 students.'),
    ).toBeVisible();
  });

  // Not in the brief -- the OTHER add control must state the limit too,
  // proven independently rather than assumed from "Add student" above:
  // both are disabled by the SAME `rosterAtLimit` check (roster-ui.ts's
  // buildToolbar), but that is an implementation fact, not something this
  // suite is entitled to take on faith.
  test('Add several also disables at 100', async ({ page }) => {
    await openRoster(page);
    await addSeveral(page, 99);
    await expect(
      page.getByRole('button', { name: 'Add several' }),
    ).toBeDisabled();
  });

  test('Add several refuses a number that would cross the limit, saying how many are free', async ({
    page,
  }) => {
    await openRoster(page);
    await addSeveral(page, 89);
    await page.getByRole('button', { name: 'Add several' }).click();
    await page.getByLabel('How many to add?').fill('20');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(
      page.getByText('There is room for 10 more students.'),
    ).toBeVisible();
    await expect(page.locator('.cg-student')).toHaveCount(90);
  });

  // Corrected from the brief's own `getByLabel('How many students?')` --
  // see this describe block's own header comment.
  test('Student details refuses to open above 100, leaving the count alone', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Number of students').fill('300');
    await page.locator('#cg-students-toggle').click();
    await expect(
      page.getByText(
        'Student details holds up to 100 students. Lower the number to list this class individually.',
      ),
    ).toBeVisible();
    await expect(page.locator('#cg-roster')).toHaveCount(0);
    await expect(page.getByLabel('Number of students')).toHaveValue('300');
    await giveEveryoneASex(page);
    await expect(
      page.getByRole('button', { name: 'Make groups' }),
    ).toBeEnabled();
  });

  // Not in the brief -- the refusal is a COMPARISON, not a one-way latch,
  // the same "comparison, not a flag" shape every other guard on this page
  // already keeps (dirty, staleReason, updateRosterValidation). Lowering
  // the count and clicking again must actually open the section, not stay
  // refused over a fact that is no longer true.
  test('lowering the count and reopening actually opens Student details', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Number of students').fill('300');
    await page.locator('#cg-students-toggle').click();
    await expect(
      page.getByText('Student details holds up to 100 students.'),
    ).toBeVisible();
    await page.getByLabel('Number of students').fill('50');
    await page.locator('#cg-students-toggle').click();
    await expect(
      page.getByRole('button', { name: 'Add student' }),
    ).toBeVisible();
    await expect(
      page.getByText('Student details holds up to 100 students.'),
    ).toBeHidden();
  });
});

// B-09 ("Removing a row lowers it") and this task's own carried-forward
// risk: "make sure a pending, uncommitted text edit is not silently
// discarded when a row is added or removed elsewhere" (this task's own
// brief). None of these are in task-6-brief.md's own Step 1 snippet at all.
test.describe('removing a student', () => {
  test('removes the row and lowers the roster', async ({ page }) => {
    await openRoster(page);
    await addSeveral(page, 2); // three rows: 1, 2, 3
    await expect(page.locator('.cg-student')).toHaveCount(3);
    await page
      .locator('.cg-student')
      .nth(1)
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(page.locator('.cg-student')).toHaveCount(2);
  });

  // Identity is the number (this stage's own global constraint): removing
  // a student must not renumber the others. Removing the MIDDLE student of
  // 1, 2, 3 must leave 1 and 3 — a gap — never silently renumber the
  // survivor down to 2, which would quietly hand student #3's own together/
  // apart letters (or a future pin) to a different child.
  test('does not renumber the remaining students', async ({ page }) => {
    await openRoster(page);
    await addSeveral(page, 2); // three rows: 1, 2, 3
    await page
      .locator('.cg-student')
      .nth(1)
      .getByRole('button', { name: 'Remove' })
      .click();
    const rows = page.locator('.cg-student');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).getByLabel('#')).toHaveValue('1');
    await expect(rows.nth(1).getByLabel('#')).toHaveValue('3');
  });

  // The exact shape of bug this task's own brief named as a real risk: a
  // pending, uncommitted text edit on a DIFFERENT row (never itself
  // re-rendered — RosterHandlers.onTextChange's own doc comment,
  // roster-ui.ts) must survive a removal elsewhere in the table, not be
  // silently discarded by a stale render-time snapshot.
  test('removing one row does not discard an uncommitted text edit on another', async ({
    page,
  }) => {
    await openRoster(page);
    await addSeveral(page, 2); // three rows: 1, 2, 3
    const rows = page.locator('.cg-student');
    await rows.nth(0).getByLabel('Name').fill('Ana');
    await rows.nth(1).getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.cg-student')).toHaveCount(2);
    await expect(
      page.locator('.cg-student').first().getByLabel('Name'),
    ).toHaveValue('Ana');
  });

  // Removing a row re-enables the add controls the moment the roster drops
  // back under the limit — the same "comparison, not a one-way latch"
  // shape design spec section 4's own refusals already keep elsewhere.
  test('removing a row at the limit re-enables the add controls', async ({
    page,
  }) => {
    await openRoster(page);
    await addSeveral(page, 99); // 100 rows -- at the limit
    await expect(
      page.getByRole('button', { name: 'Add student' }),
    ).toBeDisabled();
    await page
      .locator('.cg-student')
      .first()
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(page.locator('.cg-student')).toHaveCount(99);
    await expect(
      page.getByRole('button', { name: 'Add student' }),
    ).toBeEnabled();
    await expect(
      page.getByText('Student details holds up to 100 students.'),
    ).toBeHidden();
  });

  test('the Remove button meets the 44px touch target', async ({ page }) => {
    await openRoster(page);
    const box = await page
      .locator('.cg-student')
      .first()
      .getByRole('button', { name: 'Remove' })
      .boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
});

// Stage 3, Task 7 (design spec section 4, "The Students box -- an input,
// then a read-out"). Two things could have claimed to know the class size
// -- #cg-count and the roster -- and design spec section 4 resolves the
// mismatch by never letting both be in charge: the box is the input with no
// list, and becomes an untypeable read-out the instant one exists.
// task-7-brief.md's own Step 1 snippet used
// `page.getByLabel('How many students?')` throughout -- the same recurring
// mistake Tasks 1, 2, 5 and 6 already documented and corrected in this
// suite and its siblings; the real label is "Number of students"
// (`studentsLabel` in en.ts). Corrected here the same way, not reproduced
// verbatim.
test.describe('the Students box becomes a read-out', () => {
  test('typeable with no list; a read-out with one', async ({ page }) => {
    await page.goto('/classroom-groups');
    await expect(page.getByLabel('Number of students')).toBeEditable();
    await page.locator('#cg-students-toggle').click();
    await page.getByRole('button', { name: 'Add student' }).click();
    await expect(page.getByLabel('Number of students')).not.toBeEditable();
  });

  test('the reason is rendered, not implied', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-students-toggle').click();
    await page.getByRole('button', { name: 'Add student' }).click();
    await expect(
      page.getByText(
        'Set by your list. Add or remove students in Student details to change it.',
      ),
    ).toBeVisible();
  });

  // The brief's own literal count (23, giving 24 total) is NOT used here --
  // #cg-count's own build-time markup ships `value="24"` (ClassroomGroupsPage.astro),
  // so a roster that lands on exactly 24 would pass this test's `toHaveValue`
  // checks even with NO implementation at all: the box's own untouched
  // static default already reads "24" before a single line of this task's
  // own code exists. Run against the page before implementing, to confirm
  // that is not hypothetical: it is not. 30 (29 + the one `openRoster`
  // already adds) shares nothing with that default, so passing here
  // actually requires the box's value to have been SET from the roster,
  // not merely left alone.
  test('emptying the list makes it typeable again, keeping the number', async ({
    page,
  }) => {
    await openRoster(page);
    await addSeveral(page, 29);
    await expect(page.getByLabel('Number of students')).toHaveValue('30');
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByLabel('Number of students')).toBeEditable();
    await expect(page.getByLabel('Number of students')).toHaveValue('30');
  });

  // Same correction, same reason -- see the comment on the test just above.
  test('marking a student absent does not move it', async ({ page }) => {
    await openRoster(page);
    await addSeveral(page, 29);
    await page.locator('.cg-student').first().getByLabel('Absent').check();
    await expect(page.getByLabel('Number of students')).toHaveValue('30');
    await expect(page.locator('#cg-roster-count')).toHaveText(
      '30 students · 29 here · 1 absent',
    );
  });

  test('no sequence of operations makes the box disagree with the list', async ({
    page,
  }) => {
    await openRoster(page);
    for (const n of [5, 3, 11]) await addSeveral(page, n);
    await page
      .locator('.cg-student')
      .nth(2)
      .getByRole('button', { name: 'Remove' })
      .click();
    await page.locator('.cg-student').first().getByLabel('Absent').check();
    const rows = await page.locator('.cg-student').count();
    await expect(page.getByLabel('Number of students')).toHaveValue(
      String(rows),
    );
  });

  // Not in the brief -- X-08 ("there is no way to type the box past
  // MAX_ROSTER with a list present") was only HALF closed by Task 6, which
  // made neither add path able to push the roster past 100; this task's own
  // job is the other half, the box becoming untypeable at all. Proving that
  // holds AT the ceiling, not merely below it, is what actually closes
  // X-08 rather than leaving it true only by the accident of every other
  // test here using a small roster.
  test('even at the roster ceiling, the box is still a read-out, never typeable past it', async ({
    page,
  }) => {
    await openRoster(page);
    await addSeveral(page, 99); // 100 total -- MAX_ROSTER
    await expect(page.getByLabel('Number of students')).not.toBeEditable();
    await expect(page.getByLabel('Number of students')).toHaveValue('100');
  });

  // Not in the brief -- every other interactive control this table adds
  // gets its own measured touch-target test (see 'the Remove button meets
  // the 44px touch target'), so Clear all does too rather than trusting it
  // by inspection because it shares a CSS class with one that is measured.
  test('the Clear all button meets the 44px touch target', async ({ page }) => {
    await openRoster(page);
    const box = await page
      .getByRole('button', { name: 'Clear all' })
      .boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  // Not in the brief -- design spec section 4's own example shows exactly
  // ONE explanatory line under a locked box ("Set by your list..."), and
  // `studentsHelp` ("Students are anonymous and numbered") stops being true
  // the moment a roster can hold a real name -- showing both at once would
  // show a teacher a claim this task's own change makes false.
  test('the anonymous-count help text steps aside for the reason, and returns once the list is gone', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await expect(
      page.getByText('Students are anonymous and numbered'),
    ).toBeVisible();
    await page.locator('#cg-students-toggle').click();
    await page.getByRole('button', { name: 'Add student' }).click();
    await expect(
      page.getByText('Students are anonymous and numbered'),
    ).toBeHidden();
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(
      page.getByText('Students are anonymous and numbered'),
    ).toBeVisible();
  });
});

test.describe('Indonesian', () => {
  // Mirrors 'the table has seven columns, in order...', above -- the
  // seventh header's own text is 'Hapus' (rosterRemove, id.ts), the exact
  // word every row's own Remove button already carries.
  test('the table has seven columns, translated — the seventh (Remove/Hapus) has a real header too', async ({
    page,
  }) => {
    await openRoster(page, '/id/classroom-groups');
    await expect(page.locator('#cg-roster thead th')).toHaveText([
      'Tidak hadir',
      '#',
      'Nama',
      'Jenis kelamin',
      'Bersama',
      'Terpisah',
      'Hapus',
    ]);
  });

  test('an unnamed row renders Siswa N in the results', async ({ page }) => {
    await openRoster(page, '/id/classroom-groups');
    await giveEveryoneASex(page);
    await page.getByRole('button', { name: 'Buat Kelompok' }).click();
    await expect(page.locator('#cg-results')).toContainText('Siswa 1');
  });

  // Mirrors 'the count line reads students, here and absent', above --
  // task-4-brief.md's own instruction ("Mirror the last two on /id/").
  test('the count line reads siswa, hadir and tidak hadir', async ({
    page,
  }) => {
    await openRoster(page, '/id/classroom-groups');
    await addSeveral(page, 23);
    await page.locator('.cg-student').first().getByLabel('Tidak hadir').check();
    await page.locator('.cg-student').nth(1).getByLabel('Tidak hadir').check();
    await expect(page.locator('#cg-roster-count')).toHaveText(
      '24 siswa · 22 hadir · 2 tidak hadir',
    );
  });

  // Mirrors 'the word is never "away", anywhere', above -- same guard
  // against a stray, untranslated English word, run on the Indonesian page.
  test('the word is never "away", anywhere', async ({ page }) => {
    await openRoster(page, '/id/classroom-groups');
    await page.locator('.cg-student').first().getByLabel('Tidak hadir').check();
    await giveEveryoneASex(page);
    await page.getByRole('button', { name: 'Buat Kelompok' }).click();
    await expect(page.locator('body')).not.toContainText(/\baway\b/);
  });

  // Mirrors 'a duplicate number is refused as it is typed', above --
  // Stage 3, Task 5's own i18n requirement: the refusal is live in both
  // languages, not only English.
  test('a duplicate number is refused as it is typed, in Indonesian', async ({
    page,
  }) => {
    await openRoster(page, '/id/classroom-groups');
    await page.getByRole('button', { name: 'Tambah siswa' }).click();
    await page.locator('.cg-student').nth(1).getByLabel('#').fill('1');
    await expect(page.getByText(/Nomor 1 sudah dipakai/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Buat Kelompok' }),
    ).toBeDisabled();
  });

  // Mirrors 'a together-and-apart clash is refused as it is typed', above.
  test('a together-and-apart clash is refused as it is typed, in Indonesian', async ({
    page,
  }) => {
    await openRoster(page, '/id/classroom-groups');
    await page.getByRole('button', { name: 'Tambah siswa' }).click();
    const row0 = page.locator('.cg-student').nth(0);
    const row1 = page.locator('.cg-student').nth(1);
    await row0.getByLabel('Bersama').selectOption('A');
    await row1.getByLabel('Bersama').selectOption('A');
    await row0.getByLabel('Terpisah').selectOption('A');
    await row1.getByLabel('Terpisah').selectOption('A');
    await expect(
      page.getByText(/sudah ditandai untuk disatukan/),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Buat Kelompok' }),
    ).toBeDisabled();
  });

  // Mirrors 'a gap warns but does not block', above.
  test('a gap warns but does not block, in Indonesian', async ({ page }) => {
    await openRoster(page, '/id/classroom-groups');
    await page.getByRole('button', { name: 'Tambah siswa' }).click();
    await page.locator('.cg-student').nth(1).getByLabel('#').fill('4');
    await expect(page.getByText(/tampak belum lengkap/)).toBeVisible();
    await giveEveryoneASex(page);
    await expect(
      page.getByRole('button', { name: 'Buat Kelompok' }),
    ).toBeEnabled();
  });

  // Stage 3, Task 6's own i18n requirement. Mirrors 'Student details
  // refuses to open above 100, leaving the count alone', above.
  test('Student details refuses to open above 100, in Indonesian', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await page.getByLabel('Jumlah siswa').fill('300');
    await page.locator('#cg-students-toggle').click();
    await expect(
      page.getByText(
        'Detail siswa menampung hingga 100 siswa. Turunkan angkanya untuk mendaftar kelas ini satu per satu.',
      ),
    ).toBeVisible();
    await expect(page.locator('#cg-roster')).toHaveCount(0);
    await expect(page.getByLabel('Jumlah siswa')).toHaveValue('300');
    await giveEveryoneASex(page);
    await expect(
      page.getByRole('button', { name: 'Buat Kelompok' }),
    ).toBeEnabled();
  });

  // Mirrors 'both add controls disable at 100, stating the limit', above.
  test('both add controls disable at 100, in Indonesian', async ({ page }) => {
    await openRoster(page, '/id/classroom-groups');
    await addSeveral(page, 99);
    await expect(
      page.getByRole('button', { name: 'Tambah siswa' }),
    ).toBeDisabled();
    await expect(
      page.getByText('Detail siswa menampung hingga 100 siswa.'),
    ).toBeVisible();
  });

  // Mirrors 'Add several refuses a number that would cross the limit...',
  // above.
  test('Add several refuses a number that would cross the limit, in Indonesian', async ({
    page,
  }) => {
    await openRoster(page, '/id/classroom-groups');
    await addSeveral(page, 89);
    await page.getByRole('button', { name: 'Tambah beberapa' }).click();
    await page.getByLabel('Berapa yang ditambahkan?').fill('20');
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await expect(
      page.getByText('Masih ada ruang untuk 10 siswa lagi.'),
    ).toBeVisible();
    await expect(page.locator('.cg-student')).toHaveCount(90);
  });

  // Mirrors 'removes the row and lowers the roster', above.
  test('removing a row lowers the roster, in Indonesian', async ({ page }) => {
    await openRoster(page, '/id/classroom-groups');
    await addSeveral(page, 2);
    await page
      .locator('.cg-student')
      .nth(1)
      .getByRole('button', { name: 'Hapus' })
      .click();
    await expect(page.locator('.cg-student')).toHaveCount(2);
  });

  // Mirrors 'typeable with no list; a read-out with one' / 'the reason is
  // rendered, not implied' / 'emptying the list...' above, in one test --
  // Stage 3, Task 7's own copy (studentsLockedReason, rosterClearAll) in
  // Indonesian. 'Hapus semua' is scoped to nothing here (no `.cg-student`
  // row locator), unlike the per-row 'Hapus' button just above -- Clear all
  // lives in the toolbar, not any one row, so the two never collide even
  // though 'Hapus' is a literal substring of 'Hapus semua'.
  test('the Students box becomes a read-out, and Hapus semua returns it, in Indonesian', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await expect(page.getByLabel('Jumlah siswa')).toBeEditable();
    await page.locator('#cg-students-toggle').click();
    await page.getByRole('button', { name: 'Tambah siswa' }).click();
    await expect(page.getByLabel('Jumlah siswa')).not.toBeEditable();
    await expect(
      page.getByText(
        'Ditentukan oleh daftar Anda. Tambah atau hapus siswa di Detail siswa untuk mengubahnya.',
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Hapus semua' }).click();
    await expect(page.getByLabel('Jumlah siswa')).toBeEditable();
    await expect(page.getByLabel('Jumlah siswa')).toHaveValue('1');
  });
});

/**
 * Stage 3, Task 3: the card layout, and proving it is the same thing.
 * Traceability: F-01, F-03, F-04, F-06, F-07, L-06 (design spec section 13 /
 * docs/superpowers/plans/2026-08-06-classroom-groups-v2-test-traceability.md).
 *
 * task-3-brief.md's own Traceability line also names F-05 ("the absent tint,
 * stripe and pill all appear on the card, not only the row"). Not claimed
 * here: the tint/stripe/pill do not exist yet on EITHER shape -- Task 2's own
 * comment at the top of this file already deferred them to "a later task"
 * (traceability A-05…A-09), and the traceability matrix's own F-05 row is
 * still unticked. `.cg-student` being one element in both layouts (this
 * task's whole point) is what will make F-05 fall out for free the moment a
 * later task styles absence on it -- no separate card-specific work will be
 * needed then -- but that is that task's row to tick, not this one's.
 *
 * task-3-brief.md's own Step 1 snippet is reproduced below with two
 * corrections, not verbatim:
 *  - Every test that calls `page.setViewportSize` is tagged
 *    `@emulated-viewport`, per this stage's own global-constraints.md
 *    ("Any test that resizes the viewport must be tagged") -- the brief's
 *    literal code has no tag, which `tests/unit/viewport-tagging.test.ts`
 *    (a hard guard, not a style preference) would fail on: a real phone
 *    cannot resize itself, so an untagged resize test would run, and fail
 *    for a false reason, on `android-chrome`/`ios-safari`.
 *  - The "no horizontal scroll" test calls the existing `addSeveral` helper
 *    (already imported above, already every other test in this file's own
 *    way of driving "+ Add several…") instead of reproducing its three
 *    clicks inline, as the brief's own snippet does.
 */
const LAYOUTS = [
  { name: 'cards', width: 320 },
  { name: 'table', width: 1280 },
] as const;

for (const { name, width } of LAYOUTS) {
  test(
    `${name}: every control is present with the same value`,
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openRoster(page);
      const row = page.locator('.cg-student').first();
      await expect(row.getByLabel('Name')).toBeVisible();
      await expect(row.getByLabel('Sex')).toBeVisible();
      await expect(row.getByLabel('Absent')).toBeVisible();
      await expect(row.getByLabel('Together')).toBeVisible();
      await expect(row.getByLabel('Apart')).toBeVisible();
    },
  );

  test(
    `${name}: editing every field works`,
    { tag: '@emulated-viewport' },
    async ({ page }) => {
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
    },
  );
}

// A second, related defect found via the SAME investigation as the loop
// above's "editing every field works" (task-3-brief.md's own Step 1 test,
// unmodified): two DIFFERENT rows' own text edits, NEITHER of which
// re-renders on its own (`RosterHandlers`' own doc comment, roster-ui.ts --
// "avoiding focus/caret theft"), used to stomp each other, because every
// row built in one render shared the identical stale `roster` snapshot --
// the second row's own patch was computed from a base that did not yet
// know about the first row's edit, discarding it the moment the second
// landed. Not part of the brief's own Step 1 (which only ever edits one
// row at a time); added because the fix for the first bug (roster-ui.ts's
// own `liveRoster`) fixes this one for free, and an unpinned fix is one
// that can regress silently.
test('editing two different rows by text, neither of which re-renders on its own, does not lose either', async ({
  page,
}) => {
  await openRoster(page);
  await addSeveral(page, 1);
  const rows = page.locator('.cg-student');
  await rows.nth(0).getByLabel('Name').fill('Ana');
  await rows.nth(1).getByLabel('Name').fill('Budi');
  await expect(rows.nth(0).getByLabel('Name')).toHaveValue('Ana');
  await expect(rows.nth(1).getByLabel('Name')).toHaveValue('Budi');
});

test(
  'cards: the name field takes the full remaining width',
  { tag: '@emulated-viewport' },
  async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openRoster(page);
    const card = (await page.locator('.cg-student').first().boundingBox())!;
    const name = (await page
      .locator('.cg-student')
      .first()
      .getByLabel('Name')
      .boundingBox())!;
    expect(name.width).toBeGreaterThan(card.width * 0.6);
  },
);

// L-06, re-homed from stage 2: that stage could not open Student details
// because it had no body, so the row was untestable there.
test(
  'cards: no horizontal scroll at 320px with 100 students',
  { tag: '@emulated-viewport' },
  async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openRoster(page);
    await addSeveral(page, 99);
    const over = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
  },
);
