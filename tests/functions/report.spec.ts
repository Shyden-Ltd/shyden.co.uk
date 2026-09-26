import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { getSiteStrings, getStrings } from '../../src/lib/i18n';
import { pagePath } from '../../src/lib/report';
import { expectReportsBound } from '../report-health';
import { reportsWithNote } from './local.mjs';

const vi = getSiteStrings('vi').report;
const tool = getStrings('vi');
const noteFor = (what: string) => `functions test ${what} ${randomUUID()}`;

async function fillReport(page: Page, quote: string, note: string) {
  await page.locator('[data-report] summary').click();
  await page.getByLabel(vi.quoteLabel, { exact: true }).fill(quote);
  await page.getByLabel(vi.noteLabel, { exact: true }).fill(note);
}

test('the health check sees the binding and the migrated table', async ({
  request,
}) => {
  await expectReportsBound(request);
});

test.describe('with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  // The tag is `isolated-context-tagging`'s rule for every spec directory:
  // javaScriptEnabled is inert on the real-device harness. This suite never
  // runs there, and the tag says so rather than leaving it to be noticed.
  test(
    'the homepage posts, lands on #report-sent, and the row is stored',
    { tag: '@requires-isolated-context' },
    async ({ page }) => {
      const note = noteFor('homepage');
      await page.goto(pagePath('home', 'vi'));
      await fillReport(page, vi.open, note);
      await page.getByRole('button', { name: vi.send }).click();
      await expect(page).toHaveURL(/\/vi\/#report-sent$/);
      await expect(page.locator('#report-sent')).toBeVisible();
      const rows = reportsWithNote(note);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        locale: 'vi',
        page: 'home',
        quote: vi.open,
        suggestion: '',
        note,
      });
      expect(JSON.parse(rows[0].keys)).toContain('site.report.open');
    },
  );

  test(
    'a quote on no page lands on #report-not-found and stores nothing',
    { tag: '@requires-isolated-context' },
    async ({ page }) => {
      const note = noteFor('not-found');
      await page.goto(pagePath('home', 'vi'));
      await fillReport(page, 'on no page at all, anywhere', note);
      await page.getByRole('button', { name: vi.send }).click();
      await expect(page).toHaveURL(/#report-not-found$/);
      await expect(page.locator('#report-not-found')).toBeVisible();
      expect(reportsWithNote(note)).toEqual([]);
    },
  );
});

test('a cross-origin POST is refused and stores nothing', async ({
  request,
}) => {
  const note = noteFor('cross-origin');
  const response = await request.post('/api/report', {
    headers: {
      Origin: 'https://evil.example',
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    data: new URLSearchParams({
      locale: 'vi',
      page: 'home',
      quote: vi.open,
      note,
    }).toString(),
  });
  expect(response.status()).toBe(403);
  expect(reportsWithNote(note)).toEqual([]);
});

test.describe('on a tool page', () => {
  async function typeARoster(page: Page) {
    await page.goto(pagePath('classroom-groups', 'vi'));
    await page.locator('#cg-students-toggle').click();
    await page.getByRole('button', { name: tool.rosterAddStudent }).click();
    await page
      .locator('.cg-student')
      .first()
      .getByLabel(tool.rosterColName)
      .fill('Lan');
  }

  test('/vi/classroom-groups sends in place and the roster is still there', async ({
    page,
  }) => {
    const note = noteFor('roster');
    await typeARoster(page);
    await fillReport(page, vi.open, note);
    await page.getByRole('button', { name: vi.send }).click();
    const sent = page.locator('#report-sent');
    await expect(sent).toBeVisible();
    await expect(sent).toBeFocused();
    await expect(
      page.locator('.cg-student').first().getByLabel(tool.rosterColName),
    ).toHaveValue('Lan');
    await expect(page.getByLabel(vi.quoteLabel, { exact: true })).toHaveValue(
      '',
    );
    expect(reportsWithNote(note)).toHaveLength(1);
  });

  test('a double click stores one report', async ({ page }) => {
    const note = noteFor('double-click');
    await typeARoster(page);
    await fillReport(page, vi.open, note);
    await page.getByRole('button', { name: vi.send }).dblclick();
    await expect(page.locator('#report-sent')).toBeVisible();
    expect(reportsWithNote(note)).toHaveLength(1);
  });

  test('a later outcome replaces the earlier one', async ({ page }) => {
    const note = noteFor('replace');
    await typeARoster(page);
    await fillReport(page, 'on no page at all, anywhere', note);
    await page.getByRole('button', { name: vi.send }).click();
    await expect(page.locator('#report-not-found')).toBeVisible();
    await page.getByLabel(vi.quoteLabel, { exact: true }).fill(vi.open);
    await page.getByRole('button', { name: vi.send }).click();
    await expect(page.locator('#report-sent')).toBeVisible();
    await expect(page.locator('#report-not-found')).toBeHidden();
    await expect(page.locator('.report-status:visible')).toHaveCount(1);
  });

  test('an outcome in place supersedes the one a fragment shows', async ({
    page,
  }) => {
    // A click before the script loads posts the plain form and lands here
    // with a fragment; the next report is sent in place.
    const note = noteFor('fragment');
    await page.goto(`${pagePath('classroom-groups', 'vi')}#report-not-found`);
    await expect(page.locator('#report-not-found')).toBeVisible();
    await fillReport(page, vi.open, note);
    await page.getByRole('button', { name: vi.send }).click();
    await expect(page.locator('#report-sent')).toBeVisible();
    await expect(page.locator('#report-not-found')).toBeHidden();
    await expect(page.locator('.report-status:visible')).toHaveCount(1);
    expect(reportsWithNote(note)).toHaveLength(1);
  });
});
