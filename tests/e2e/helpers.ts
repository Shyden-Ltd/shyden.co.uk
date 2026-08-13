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

/**
 * Give every roster row a sex.
 *
 * "Make Groups" does not enable until every student has one (operator,
 * 2026-08-13; `rosterProblems`' `no-sex` problem). `openRoster` and
 * `addSeveral` deliberately create rows WITHOUT a sex — the tests for the
 * sex-based grouping options depend on being able to — so any test that
 * builds a roster that way and then wants to reach the results calls this.
 *
 * 'M' for everyone means "this test does not care about sex". A test that
 * does states its own mix through `buildRoster`.
 */
export const giveEveryoneASex = async (page: Page, sex: 'M' | 'F' = 'M') => {
  const rows = page.locator('#cg-roster tbody tr');
  for (let i = 0; i < (await rows.count()); i++) {
    const select = rows.nth(i).getByLabel(/Sex|Jenis kelamin/);
    if ((await select.inputValue()) === '') await select.selectOption(sex);
  }
};

export const addSeveral = async (page: Page, howMany: number) => {
  await page
    .getByRole('button', { name: /Add several|Tambah beberapa/ })
    .click();
  await page
    .getByLabel(/How many to add\?|Berapa yang ditambahkan\?/)
    .fill(String(howMany));
  await page.getByRole('button', { name: /^Add$|^Tambah$/ }).click();
};

/**
 * Marks the FIRST roster row absent -- `openRoster` already adds one
 * student (its own "Add student" click), so this only needs to tick that
 * row's own Absent box. Stage 3, Task 4's own state-setup helper, placed
 * HERE rather than as a local `const` inside the spec file (task-4-brief.md's
 * own Step 1 snippet defines it locally): this file's own header comment
 * says plainly "Stage 3, 4 and 5 all need one [fixture]" and "every helper
 * lives here and is imported, never redefined in a suite" -- and stage 5
 * (the print panel, which prints an `Absent` column) is a real second
 * consumer-to-be, not a hypothetical one, so the same rule that already
 * governs `openRoster`/`addSeveral` applies to this one too.
 */
export const markAbsent = async (page: Page) => {
  await openRoster(page);
  await page.locator('.cg-student').first().getByLabel('Absent').check();
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
  path = '/classroom-groups',
) => {
  await openRoster(page, path);
  if (students.length > 1) await addSeveral(page, students.length - 1);
  for (const [i, [sex, name]] of students.entries()) {
    const row = page.locator('.cg-student').nth(i);
    if (name) await row.getByLabel(/Name|Nama/).fill(name);
    if (sex) await row.getByLabel(/Sex|Jenis kelamin/).selectOption(sex);
  }
  await expect(page.locator('.cg-student')).toHaveCount(students.length);
};

/**
 * A roster of `n` students that is READY TO GROUP — every student carries a
 * sex, because sex is required before "Make Groups" enables (operator,
 * 2026-08-13; `rosterProblems`' own `no-sex` problem, src/lib/roster.ts).
 *
 * 'M' for all of them is deliberate and means "this test does not care about
 * sex". A test that DOES care states its own mix through `buildRoster`, which
 * still honours `null` — that is how the tests for the sex-based grouping
 * options build a roster that is intentionally incomplete.
 */
export const rosterOf = async (
  page: Page,
  n: number,
  path = '/classroom-groups',
) =>
  buildRoster(
    page,
    Array.from({ length: n }, () => ['M'] as ['M']),
    path,
  );

export const withGroups = async (
  page: Page,
  n = 12,
  path = '/classroom-groups',
) => {
  await rosterOf(page, n, path);
  // "Make Groups" / "Buat Kelompok" -- capital-for-capital (en.ts's own
  // `makeGroups`/id.ts's own `makeGroups`). A case-SENSITIVE regex name
  // (no `i` flag) is matched against the accessible name exactly as
  // Playwright computes it -- `escapeRegexForSelector` in Playwright's own
  // source passes a regex through unchanged, flags and all -- so the
  // lowercase `groups`/`kelompok` this line used to carry could never match
  // either button. Found by tracing that matching path, not assumed;
  // confirmed directly against a real page before this fix. This helper had
  // no call site anywhere in the suite yet (grep confirmed it: `withGroups(`
  // -- zero hits outside its own definition), so the bug was latent, never
  // exercised, and would have reddened the FIRST test to use it for a
  // reason that had nothing to do with what that test was checking.
  await page.getByRole('button', { name: /Make Groups|Buat Kelompok/ }).click();
  await expect(page.locator('#cg-results .group').first()).toBeVisible();
};

/**
 * The PRODUCT's formatter, re-exported -- never a second implementation.
 *
 * This used to be its own `toISOString().slice(0, 10)`, which agreed with
 * the product only while the product was also (wrongly) UTC. The moment
 * `todayISO` was fixed to the local calendar day, a re-implementation here
 * would have disagreed with it for the seven hours a day this machine's
 * own timezone is ahead of UTC -- making every filename and printed-date
 * test fail in the morning and pass in the afternoon.
 *
 * That makes these e2e assertions agree with the product by construction,
 * which is the point: WHAT the date should be is pinned at unit level
 * against explicit local dates (tests/unit/csv.test.ts), and what these
 * tests check is that the page uses it.
 */
export { todayISO } from '../../src/lib/csv';

/**
 * Stage 4's fixtures. ADDED to this file, never started as a second one --
 * see this file's own header for why two versions of a helper is a bug
 * waiting to be blamed on the wrong test.
 */
export const upload = async (page: Page, name: string, body: string) => {
  await page.locator('#cg-import').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(body, 'utf8'),
  });
};

/** The bytes a download actually contains, not the button that produced it. */
export const downloadText = async (page: Page, button: string | RegExp) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
};

export const downloadName = async (page: Page, button: string | RegExp) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ]);
  return download.suggestedFilename();
};

/** Build a roster on a named locale's page — the handover needs both. */
export const buildRosterAtPath = async (
  page: Page,
  path: string,
  students: Array<['M' | 'F' | null, string?]>,
) => buildRoster(page, students, path);

/**
 * Stage 5's fixtures. Six students, number 4 absent, letters on #1/#2
 * (together) and #3 (apart).
 *
 * The SHAPE is what makes `['1','2','3','5','6']` the right expectation when
 * absent students are dropped -- change this fixture and those assertions
 * become meaningless rather than failing, which is exactly why it lives in
 * one place.
 */
export const rosterWithAnAbsence = async (page: Page) => {
  await buildRoster(page, [
    ['F', 'Ana'],
    ['M', 'Budi'],
    ['F', 'Citra'],
    ['F', 'Dewi'],
    ['M', 'Eko'],
    [null],
  ]);
  await page
    .locator('.cg-student')
    .nth(0)
    .getByLabel(/Together/)
    .selectOption('A');
  await page
    .locator('.cg-student')
    .nth(1)
    .getByLabel(/Together/)
    .selectOption('A');
  await page
    .locator('.cg-student')
    .nth(2)
    .getByLabel(/Apart/)
    .selectOption('A');
  await page
    .locator('.cg-student')
    .nth(3)
    .getByLabel(/Absent/)
    .check();
};

/** Six boys and two girls — separate mode then cannot give the girls a group. */
export const rosterForSpillover = async (page: Page) => {
  await buildRoster(page, [
    ['M', 'Ana'],
    ['M', 'Budi'],
    ['M', 'Citra'],
    ['M', 'Dedi'],
    ['M', 'Eko'],
    ['M', 'Fajar'],
    ['F', 'Gita'],
    ['F', 'Hani'],
  ]);
  await page.locator('#cg-grouping-toggle').click();
  await page.getByLabel(/Keep boys and girls separate/).check();
  await page.getByLabel(/Students in each group/).fill('4');
};

export const namesIn = (text: string): string[] =>
  text.split(/\s+/).filter((w) => /^[A-Z][a-z]+$/.test(w));

/** Open the print panel from the results section. */
export const openPrintPanel = async (page: Page) => {
  await page
    .getByRole('button', { name: /^(Print|Cetak)$/ })
    .first()
    .click();
  await expect(page.locator('#cg-print-panel')).toBeVisible();
};
