import { expect, type Page } from '@playwright/test';

/**
 * Fixtures for driving the roster into a starting state -- Stage 3, 4 and 5
 * all need one. **Every helper lives here and is imported**, never
 * redefined in a suite: two versions of `openRoster` that differ by one
 * click would produce two different starting states, and the suite that
 * gets the wrong one fails for a reason that has nothing to do with what it
 * tests.
 *
 * `#cg-groups` correction: Stage 3, Task 2's own brief used it for
 * `withGroups`'s own assertion -- that id belongs to the "number of
 * groups" NUMBER INPUT (`ClassroomGroupsPage.astro`'s `.split-by` field,
 * `mode="groupCount"`), not the results container. The real results
 * container is `#cg-results` -- `#cg-tables` inside it is what
 * classroom-groups.ts's own `render()` actually appends `.group` cards to
 * -- already the corrected, established selector throughout
 * classroom-groups.spec.ts (see that file's own comment recording the
 * identical mistake in Stage 2, Task 1's own brief). Corrected here for the
 * same reason, rather than reproduced verbatim into a helper every later
 * stage would then inherit.
 */
export const openRoster = async (page: Page, path = '/classroom-groups') => {
  await page.goto(path);
  await page.locator('#cg-students-toggle').click();
  await page.getByRole('button', { name: /Add student|Tambah siswa/ }).click();
};

export const addSeveral = async (page: Page, howMany: number) => {
  await page
    .getByRole('button', { name: /Add several|Tambah beberapa/ })
    .click();
  await page.getByLabel(/How many\?|Berapa\?/).fill(String(howMany));
  await page.getByRole('button', { name: /^Add$|^Tambah$/ }).click();
};

export const setSex = async (page: Page, row: number, sex: 'M' | 'F') =>
  page
    .locator('.cg-student')
    .nth(row)
    .getByLabel(/Sex|Jenis kelamin/)
    .selectOption(sex);

/** [sex, name] per student, in order. The one builder every later suite uses. */
export const buildRoster = async (
  page: Page,
  students: Array<['M' | 'F' | null, string?]>,
) => {
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
  buildRoster(
    page,
    Array.from({ length: n }, () => [null] as [null]),
  );

export const withGroups = async (page: Page, n = 12) => {
  await rosterOf(page, n);
  await page.getByRole('button', { name: /Make groups|Buat kelompok/ }).click();
  await expect(page.locator('#cg-results .group').first()).toBeVisible();
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
