import { test, expect } from './fixtures';
import { withGroups, openPrintPanel } from './helpers';

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
    await withGroups(page);
    await openPrintPanel(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#cg-print-panel')).toBeHidden();
    await expect(page.locator('html')).not.toHaveAttribute('data-print-what');
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
