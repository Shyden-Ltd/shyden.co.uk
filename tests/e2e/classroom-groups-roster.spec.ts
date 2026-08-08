import { test, expect } from './fixtures';
import { openRoster, addSeveral } from './helpers';

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
  test('the table has the six columns, in order', async ({ page }) => {
    await openRoster(page);
    await expect(page.locator('#cg-roster thead th')).toHaveText([
      '#',
      'Name',
      'Sex',
      'Absent',
      'Together',
      'Apart',
    ]);
  });

  test('an unnamed row renders Student N in the results', async ({ page }) => {
    await openRoster(page);
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
  // classroom-groups-controls.spec.ts; test 3 ("Clear all" → nothing to
  // save) still cannot run before a later task builds "Clear all" -- see
  // this task's own report for that gap, carried forward again rather than
  // silently dropped.
  test('any roster change makes it unsaved', async ({ page }) => {
    await openRoster(page);
    await expect(page.locator('#cg-io .state')).toHaveText(
      'unsaved changes — export to keep them',
    );
  });
});

test.describe('Indonesian', () => {
  test('the table has the six columns, translated', async ({ page }) => {
    await openRoster(page, '/id/classroom-groups');
    await expect(page.locator('#cg-roster thead th')).toHaveText([
      '#',
      'Nama',
      'Jenis kelamin',
      'Tidak hadir',
      'Bersama',
      'Terpisah',
    ]);
  });

  test('an unnamed row renders Siswa N in the results', async ({ page }) => {
    await openRoster(page, '/id/classroom-groups');
    await page.getByRole('button', { name: 'Buat Kelompok' }).click();
    await expect(page.locator('#cg-results')).toContainText('Siswa 1');
  });
});
