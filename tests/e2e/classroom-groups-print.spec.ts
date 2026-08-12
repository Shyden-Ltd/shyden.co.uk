import { test, expect } from './fixtures';
import {
  withGroups,
  openPrintPanel,
  rosterWithAnAbsence,
  buildRoster,
} from './helpers';
import { todayISO } from '../../src/lib/csv';

/**
 * Every control assertion is scoped to the PANEL, never to the page.
 *
 * `getByLabel` matches by SUBSTRING, and the import field's own label --
 * "Import a class list" -- contains "Class list", so a page-scoped
 * `getByLabel('Class list')` resolves to two elements and Playwright's
 * strict mode refuses it. Found by running, and worth keeping scoped rather
 * than switching to `{ exact: true }`: these tests are about the panel, and
 * scoping also survives any future copy on the page that happens to share a
 * word with one of these six labels.
 */
const panel = (page: import('@playwright/test').Page) =>
  page.locator('#cg-print-panel');

/**
 * Stage 5, Task 1. The print panel and its four remembered choices.
 * Q-01…Q-04, Q-21, Y-06, Y-07.
 *
 * `window.print()` is never called from a test: Playwright cannot dismiss a
 * print dialog and the run hangs. The panel's Print button sets the `data-`
 * attributes and THEN prints, so the tests assert the attributes, and
 * appearance is checked with `page.emulateMedia({ media: 'print' })`.
 */

test.describe('the print panel', () => {
  test('the panel offers what to print, with Both as the default', async ({
    page,
  }) => {
    await withGroups(page);
    await openPrintPanel(page);
    await expect(panel(page).getByLabel('Both')).toBeChecked();
    await expect(panel(page).getByLabel('Class list')).not.toBeChecked();
    await expect(panel(page).getByLabel('Group results')).not.toBeChecked();
  });

  test('all three tick boxes start ticked', async ({ page }) => {
    await withGroups(page);
    await openPrintPanel(page);
    for (const label of [
      'Show students who are absent',
      'Show sex and the together/apart letters',
      'Include avatars',
    ]) {
      await expect(panel(page).getByLabel(label), label).toBeChecked();
    }
  });

  test('all four choices survive a reload', async ({ page }) => {
    await withGroups(page);
    await openPrintPanel(page);
    await panel(page).getByLabel('Class list').check();
    await panel(page).getByLabel('Include avatars').uncheck();
    await panel(page).getByLabel('Show students who are absent').uncheck();
    await panel(page).getByRole('button', { name: 'Cancel' }).click();

    await page.reload();
    await withGroups(page);
    await openPrintPanel(page);
    await expect(panel(page).getByLabel('Class list')).toBeChecked();
    await expect(panel(page).getByLabel('Include avatars')).not.toBeChecked();
    await expect(
      panel(page).getByLabel('Show students who are absent'),
    ).not.toBeChecked();
    // …and the one left alone is still on, so "remembers all four" is not
    // satisfied by a wrapper that simply forgets everything.
    await expect(
      panel(page).getByLabel('Show sex and the together/apart letters'),
    ).toBeChecked();
  });

  test('only preferences are stored — no class data', async ({ page }) => {
    await withGroups(page);
    await page.getByLabel('Class (optional)').fill('7B');
    await openPrintPanel(page);
    await panel(page).getByLabel('Class list').check();
    const stored = await page.evaluate(() =>
      JSON.stringify({ ...localStorage }),
    );
    expect(stored).not.toContain('7B');
    // The exact list is asserted HERE and nowhere earlier. Stage 2
    // deliberately asserts only the `cg-` prefix, so adding these four does
    // not break a test that has nothing to do with printing.
    //
    // `cg-howto-collapsed` is NOT in this list, and the plan's own snippet
    // was wrong to include it: that key is written only when the How to use
    // header is CLICKED (classroom-groups.ts's own `howToToggle` listener),
    // never on load, and nothing in this test clicks it. Verified by
    // reading the write site, then by running.
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual([
      'cg-print-absent',
      'cg-print-avatars',
      'cg-print-letters',
      'cg-print-what',
    ]);
  });

  // Q-21. The panel is a dialog: Escape closes it, and it does not print on
  // the way out. A panel a teacher cannot back out of is worse than a bare
  // button.
  test('Escape closes the panel without printing', async ({ page }) => {
    // Counts CALLS to window.print. This used to assert that `<html>`
    // carried no `data-print-what`, which was a proxy -- and stopped being
    // a true one when the remembered choices began reaching the document at
    // load (so that a teacher printing from the browser's own menu gets the
    // sheet their stored preference says). The proxy would now fail while
    // the behaviour it stood for is correct; this asserts the behaviour.
    await page.addInitScript(() => {
      (window as unknown as { __prints: number }).__prints = 0;
      window.print = () => {
        (window as unknown as { __prints: number }).__prints += 1;
      };
    });
    await withGroups(page);
    await openPrintPanel(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#cg-print-panel')).toBeHidden();
    expect(
      await page.evaluate(
        () => (window as unknown as { __prints: number }).__prints,
      ),
    ).toBe(0);
  });

  // …and the choices DO reach the document at load, from what was
  // remembered, so the browser's own print menu produces the sheet the
  // panel is showing rather than the build-time default.
  test('a remembered choice is on the document before the panel is opened', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.print = () => {};
    });
    await withGroups(page);
    await openPrintPanel(page);
    await panel(page).getByLabel('Group results').check();
    await panel(page).getByRole('button', { name: 'Cancel' }).click();

    await page.reload();
    // No panel opened on this load at all.
    await expect(page.locator('html')).toHaveAttribute(
      'data-print-what',
      'groups',
    );
  });

  test('Cancel closes it and keeps the choices made', async ({ page }) => {
    await withGroups(page);
    await openPrintPanel(page);
    await panel(page).getByLabel('Group results').check();
    await panel(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#cg-print-panel')).toBeHidden();
    await openPrintPanel(page);
    await expect(panel(page).getByLabel('Group results')).toBeChecked();
  });

  // The panel writes what it was told onto the document, which is the whole
  // mechanism the printed sheet is styled from -- asserted directly rather
  // than through an appearance check, so a styling change cannot make this
  // pass while the choice stops being carried.
  test('the choices reach the document as data attributes', async ({
    page,
  }) => {
    // The panel's Print button calls `window.print()` last, after setting
    // the attributes. Playwright cannot dismiss a real print dialog and the
    // run hangs -- this happens to be a no-op in headless Chromium, which
    // is exactly the kind of accident not to build a five-browser suite on.
    // Neutralised explicitly, before the page loads, so the assertion below
    // is about the attributes and nothing else.
    await page.addInitScript(() => {
      window.print = () => {};
    });
    await withGroups(page);
    await openPrintPanel(page);
    await panel(page).getByLabel('Class list').check();
    await panel(page).getByLabel('Include avatars').uncheck();
    await panel(page).getByRole('button', { name: 'Print' }).click();
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-print-what', 'class-list');
    await expect(html).toHaveAttribute('data-print-avatars', 'off');
    await expect(html).toHaveAttribute('data-print-absent', 'on');
    await expect(html).toHaveAttribute('data-print-letters', 'on');
  });
});

test.describe('the print panel — Indonesian', () => {
  test('the panel offers what to print, with Keduanya as the default', async ({
    page,
  }) => {
    await withGroups(page, 12, '/id/classroom-groups');
    await openPrintPanel(page);
    await expect(panel(page).getByLabel('Keduanya')).toBeChecked();
    await expect(panel(page).getByLabel('Daftar kelas')).not.toBeChecked();
    await expect(panel(page).getByLabel('Hasil kelompok')).not.toBeChecked();
  });

  test('all three tick boxes start ticked', async ({ page }) => {
    await withGroups(page, 12, '/id/classroom-groups');
    await openPrintPanel(page);
    for (const label of [
      'Tampilkan siswa yang tidak hadir',
      'Tampilkan jenis kelamin dan huruf bersama/terpisah',
      'Sertakan avatar',
    ]) {
      await expect(panel(page).getByLabel(label), label).toBeChecked();
    }
  });

  test('all four choices survive a reload', async ({ page }) => {
    await withGroups(page, 12, '/id/classroom-groups');
    await openPrintPanel(page);
    await panel(page).getByLabel('Daftar kelas').check();
    await panel(page).getByLabel('Sertakan avatar').uncheck();
    await panel(page).getByRole('button', { name: 'Batal' }).click();

    await page.reload();
    await withGroups(page, 12, '/id/classroom-groups');
    await openPrintPanel(page);
    await expect(panel(page).getByLabel('Daftar kelas')).toBeChecked();
    await expect(panel(page).getByLabel('Sertakan avatar')).not.toBeChecked();
  });
});

/**
 * Stage 5, Task 2. The printed class list, in all four combinations.
 * Q-05…Q-13, Q-16, Q-17, Q-20, A-08.
 *
 * All four are tested because the two tick boxes being INDEPENDENT is the
 * whole reason they are tick boxes and not three named sheets.
 */
const sheet = async (
  page: import('@playwright/test').Page,
  opts: {
    what: string;
    absent: boolean;
    letters: boolean;
    avatars: boolean;
  },
) => {
  await openPrintPanel(page);
  await panel(page).getByLabel(opts.what).check();
  await panel(page)
    .getByLabel('Show students who are absent')
    .setChecked(opts.absent);
  await panel(page)
    .getByLabel('Show sex and the together/apart letters')
    .setChecked(opts.letters);
  await panel(page).getByLabel('Include avatars').setChecked(opts.avatars);
  await panel(page).getByRole('button', { name: 'Print' }).click();
  await page.emulateMedia({ media: 'print' });
};

test.describe('the printed class list', () => {
  test.beforeEach(async ({ page }) => {
    // `window.print()` is the last thing the panel's Print button does.
    // Stubbed before load on every test in this block -- see the note on
    // the attributes test above for why not relying on it being a no-op.
    await page.addInitScript(() => {
      window.print = () => {};
    });
    await rosterWithAnAbsence(page); // 6 students, #4 absent, letters on #1/#2/#3
  });

  test('absent ✓ letters ✓ — the full register', async ({ page }) => {
    await sheet(page, {
      what: 'Class list',
      absent: true,
      letters: true,
      avatars: false,
    });
    await expect(page.locator('.print-list thead th:visible')).toHaveText([
      '#',
      'Name',
      'Sex',
      'Absent',
      'Together',
      'Apart',
    ]);
    await expect(page.locator('.print-list tbody tr:visible')).toHaveCount(6);
    await expect(page.locator('.print-foot')).toHaveText(
      '6 students · 5 here · 1 absent',
    );
  });

  test('absent ✓ letters ✗ — the Absent column STAYS', async ({ page }) => {
    // The combination that would otherwise print an absent child
    // indistinguishable from a present one.
    await sheet(page, {
      what: 'Class list',
      absent: true,
      letters: false,
      avatars: false,
    });
    await expect(page.locator('.print-list thead th:visible')).toHaveText([
      '#',
      'Name',
      'Absent',
    ]);
    await expect(page.locator('.print-list tbody tr:visible')).toHaveCount(6);
    await expect(page.locator('.print-list tbody tr').nth(3)).toContainText(
      '☑',
    );
  });

  test('absent ✗ letters ✓ — dropped, and the numbers jump', async ({
    page,
  }) => {
    await sheet(page, {
      what: 'Class list',
      absent: false,
      letters: true,
      avatars: false,
    });
    await expect(page.locator('.print-list tbody tr:visible')).toHaveCount(5);
    const numbers = await page
      .locator('.print-list tbody tr:visible td:first-child')
      .allTextContents();
    expect(numbers).toEqual(['1', '2', '3', '5', '6']);
    await expect(page.locator('.print-foot-here')).toHaveText(
      '5 students here today · 1 absent',
    );
    // …and the line it replaces is gone, so the sheet does not carry two
    // different totals.
    await expect(page.locator('.print-foot')).toBeHidden();
  });

  test('absent ✗ letters ✗ — numbers and names only', async ({ page }) => {
    await sheet(page, {
      what: 'Class list',
      absent: false,
      letters: false,
      avatars: false,
    });
    await expect(page.locator('.print-list thead th:visible')).toHaveText([
      '#',
      'Name',
    ]);
    await expect(page.locator('.print-list tbody tr:visible')).toHaveCount(5);
  });

  test('no form and no site chrome on the sheet', async ({ page }) => {
    await sheet(page, {
      what: 'Both',
      absent: true,
      letters: true,
      avatars: true,
    });
    // The plan's own snippet asserted `#cg-form` itself was hidden. It
    // cannot be: the four tool sections live INSIDE the form, so the class
    // list would go with it. The requirement (design spec section 10) is
    // about what a teacher SEES -- "no form, no collapsed sections, no site
    // chrome" -- so this asserts the CONTROLS are gone, which is the honest
    // form of the same claim and does not depend on where the <form>
    // element happens to start.
    for (const sel of [
      'header nav',
      'footer',
      '.top-row',
      '#cg-go',
      '#cg-grouping',
      '#cg-io',
      '#cg-sound',
      '#cg-howto',
      '.cg-roster-toolbar',
    ]) {
      await expect(page.locator(sel), sel).toBeHidden();
    }
    // Nothing a teacher could press or type into is left anywhere on the
    // sheet -- a stronger claim than naming sections one at a time, and the
    // one that actually fails if a future control is added and forgotten.
    const interactive = page.locator(
      '#cg-form input:visible, #cg-form select:visible, #cg-form button:visible, #cg-form textarea:visible',
    );
    await expect(interactive).toHaveCount(0);
    // …and the class list is still there, which is the whole point of not
    // hiding the form.
    await expect(page.locator('#cg-roster')).toBeVisible();
  });

  test('the sheet carries the class name and a date', async ({ page }) => {
    await page.getByLabel('Class (optional)').fill('7B');
    await sheet(page, {
      what: 'Class list',
      absent: true,
      letters: true,
      avatars: false,
    });
    await expect(page.locator('.print-head')).toContainText('7B');
    await expect(page.locator('.print-head')).toContainText(todayISO());
  });

  test('paper carries neither the tint nor the pill', async ({ page }) => {
    await sheet(page, {
      what: 'Class list',
      absent: true,
      letters: true,
      avatars: false,
    });
    await expect(page.locator('.print-list .cg-absent-pill')).toBeHidden();
    await expect(page.locator('.print-list tbody tr').nth(3)).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
  });

  // Q-16/Q-17: the two What-to-print choices actually exclude each other's
  // section. Without this a sheet asked for one could quietly carry both.
  test('Class list prints the roster and not the groups', async ({ page }) => {
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await sheet(page, {
      what: 'Class list',
      absent: true,
      letters: true,
      avatars: false,
    });
    await expect(page.locator('#cg-students')).toBeVisible();
    await expect(page.locator('#cg-results')).toBeHidden();
  });

  test('Group results prints the groups and not the roster', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await sheet(page, {
      what: 'Group results',
      absent: true,
      letters: true,
      avatars: false,
    });
    await expect(page.locator('#cg-results')).toBeVisible();
    await expect(page.locator('#cg-students')).toBeHidden();
  });

  test('Both prints both', async ({ page }) => {
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await sheet(page, {
      what: 'Both',
      absent: true,
      letters: true,
      avatars: false,
    });
    await expect(page.locator('#cg-students')).toBeVisible();
    await expect(page.locator('#cg-results')).toBeVisible();
  });

  // A rename after the panel was last opened must reach the paper. The
  // mirrors are the only text on the sheet, and a text edit deliberately
  // never re-renders its row -- so this is the case that would go stale.
  test('a name typed after the last print still reaches the sheet', async ({
    page,
  }) => {
    await sheet(page, {
      what: 'Class list',
      absent: true,
      letters: true,
      avatars: false,
    });
    await expect(page.locator('.print-list tbody tr').first()).toContainText(
      'Ana',
    );
    await page.emulateMedia({ media: 'screen' });
    await page.locator('.cg-student').first().getByLabel('Name').fill('Annika');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.print-list tbody tr').first()).toContainText(
      'Annika',
    );
    await expect(
      page.locator('.print-list tbody tr').first(),
    ).not.toContainText('Ana ');
  });
});

/**
 * Stage 5, Task 3. The printed groups, and the greyscale proof.
 * Q-14, Q-15, Q-18, Q-19.
 *
 * The greyscale case does not merely check the page still renders: it
 * asserts the boy and girl avatars remain DISTINGUISHABLE with colour
 * removed, which is what the hair-length decision was for.
 */
test.describe('the printed groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {};
    });
  });

  test('avatars on: faces print; off: names only', async ({ page }) => {
    await rosterWithAnAbsence(page);
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await sheet(page, {
      what: 'Group results',
      absent: true,
      letters: true,
      avatars: true,
    });
    await expect(page.locator('.print-groups svg').first()).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
    await sheet(page, {
      what: 'Group results',
      absent: true,
      letters: true,
      avatars: false,
    });
    await expect(page.locator('.print-groups svg:visible')).toHaveCount(0);
  });

  test('group results print minus absent students', async ({ page }) => {
    await rosterWithAnAbsence(page);
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await sheet(page, {
      what: 'Group results',
      absent: true,
      letters: true,
      avatars: false,
    });
    // Dewi is #4 and absent, so she was never in the results at all --
    // design spec section 4. The absent tick box governs the class list
    // only, which is why this holds with it ON.
    await expect(page.locator('.print-groups')).not.toContainText('Dewi');
  });

  test('legible with no colour at all', async ({ page }) => {
    await buildRoster(page, [
      ['F', 'Ana'],
      ['M', 'Budi'],
      ['F', 'Citra'],
      ['M', 'Dedi'],
    ]);
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await sheet(page, {
      what: 'Both',
      absent: true,
      letters: true,
      avatars: true,
    });
    await page.addStyleTag({
      content: 'html { filter: grayscale(1) !important }',
    });

    // every printed name is still there and still readable
    for (const name of ['Ana', 'Budi', 'Citra']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
    // …and boy/girl is still distinguishable, by HAIR rather than by
    // colour. Found through `data-hair` rather than through the hair's own
    // fill, because the fill is the very signal this case removes -- a
    // query that depended on it would be proving nothing.
    const hairs = await page
      .locator('.cg-avatar-defs [data-hair]')
      .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('d')))]);
    expect(hairs.length).toBeGreaterThan(1);
    // Exactly three, one per face, and all different: two faces sharing a
    // path would leave them apart only by colour, which is the defect.
    expect(hairs).toHaveLength(3);
  });
});
