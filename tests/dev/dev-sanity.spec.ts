import { test, expect } from '@playwright/test';
import {
  LOCALES,
  localisePath,
  getSiteStrings,
  getStrings,
} from '../../src/lib/i18n/index';

// Runs against the REAL deployed dev site behind Basic auth. baseURL +
// httpCredentials are supplied by playwright.dev.config.ts (env-driven).
const BASE = process.env.WEB_BASE_URL ?? 'https://dev.shyden.co.uk';

test('dev homepage loads behind Basic auth', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toBeVisible();
});

test('the Glory Points calculator loads on dev', async ({ page }) => {
  const res = await page.goto('/glory-points');
  expect(res?.status()).toBe(200);
  await expect(page.locator('#glory-input')).toBeVisible();
});

test('the Classroom Group Creator loads on dev', async ({ page }) => {
  const res = await page.goto('/classroom-groups');
  expect(res?.status()).toBe(200);
  await expect(page.locator('#cg-form')).toBeVisible();
  // The script is what makes this page a tool rather than a form that leaks.
  // If the bundle 404s after a partial deploy, this is where it shows.
  await page.fill('#cg-count', '8');
  await page.fill('#cg-size', '4');
  // #cg-speed sits inside #cg-sound-body since Stage 2, Task 7.
  await page.locator('#cg-sound-toggle').click();
  await page.selectOption('#cg-speed', 'skip');
  await page.click('#cg-go');
  await expect(page.locator('#cg-results .student')).toHaveCount(8);
});

/**
 * Every locale the site CLAIMS to serve is actually on the deployed host.
 *
 * This block used to be a hand-written list of three `/id/*` paths, and its own
 * comment recorded that the same gap had already happened once: "Half the
 * routes on this site are /id/* and none of them were checked here." It was
 * fixed by extending the list, so it broke again the moment #22 added zh, vi
 * and th — nine routes, the entire point of that ticket, never requested from
 * the deployed site while `dev-verified` went green anyway. See #49.
 *
 * `dev-verified` is a REQUIRED status on main's branch protection. It is the
 * gate between develop and production, so a list that silently stops covering
 * new routes is not a coverage gap, it is a gate that stopped gating.
 *
 * DERIVED, so a sixth language is covered the day it joins LOCALES and nobody
 * has to remember this file. The expected heading comes from the same
 * catalogue the page renders from, which closes the "second hand-written
 * table" drift but opens a smaller hole: a catalogue accidentally left as
 * English would agree with itself and pass. The differs-from-English check
 * below is the independent half.
 */
const ROUTES = LOCALES.flatMap((locale) => [
  {
    locale,
    path: localisePath('/', locale),
    heading: getSiteStrings(locale).home.heroHeading,
    englishHeading: getSiteStrings('en').home.heroHeading,
  },
  {
    locale,
    path: localisePath('/glory-points', locale),
    heading: getSiteStrings(locale).glory.heading,
    englishHeading: getSiteStrings('en').glory.heading,
  },
  {
    locale,
    path: localisePath('/classroom-groups', locale),
    heading: getStrings(locale).heading,
    englishHeading: getStrings('en').heading,
  },
]);

test.describe('every locale the site claims to serve is deployed', () => {
  for (const { locale, path, heading, englishHeading } of ROUTES) {
    test(`${path} is served in ${locale}`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} did not return 200`).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('h1')).toContainText(heading);

      if (locale !== 'en') {
        // Independent of the catalogue above: a build that fell back to
        // English would still match its own strings if the catalogue were the
        // thing that regressed. This asserts against the ENGLISH copy instead,
        // so the two checks cannot fail together silently.
        await expect(page.locator('h1')).not.toHaveText(englishHeading);
      }
    });
  }
});

test('robots.txt disallows all crawling on the dev site', async ({
  request,
}) => {
  // Served before the auth gate, so this holds with or without creds.
  const body = await (await request.get('/robots.txt')).text();
  expect(body).toContain('Disallow: /');
});

test('an unauthenticated request is challenged with 401', async () => {
  // Raw fetch — NOT a Playwright request context, which would inherit the
  // config's httpCredentials and silently authenticate (making this pass a
  // 200 as if unchallenged). fetch sends no Authorization header, so this
  // genuinely exercises the no-credentials path.
  const res = await fetch(`${BASE}/`, { redirect: 'manual' });
  expect(res.status).toBe(401);
  expect(res.headers.get('www-authenticate')).toMatch(/^Basic realm=/);
});

test('outbound ShyTalk link points at DEV ShyTalk, never prod (no cross-env leak)', async ({
  page,
}) => {
  // The dev build injects PUBLIC_SHYTALK_URL=dev, so the work-card must link to
  // DEV ShyTalk — and the prod URL must NOT appear anywhere on the dev site.
  await page.goto('/');
  await expect(
    page.locator('a[href="https://dev.shytalk.shyden.co.uk"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('a[href="https://shytalk.shyden.co.uk"]'),
  ).toHaveCount(0);
});

/**
 * The v2 surfaces, on the deployed dev site.
 *
 * Dev is the MERGE GATE now, so this suite is what stands between a broken
 * build and `main`. It stays a smoke, not a second copy of the e2e suite:
 * each of these asks only "did this part of the tool arrive at all", which is
 * the question a deploy can answer wrongly. Behaviour is proven by the 2036
 * e2e tests that already ran before the deploy.
 */
test.describe('the Classroom Group Creator v2 surfaces reached dev', () => {
  test('Student details builds a roster', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-students-toggle').click();
    await page.getByRole('button', { name: /Add student/ }).click();
    await expect(page.locator('.cg-student')).toHaveCount(1);
    // The roster's own controls, not just a row: a partial bundle can render
    // the table and wire nothing.
    await expect(
      page.locator('.cg-student').first().getByLabel('Name'),
    ).toBeVisible();
  });

  test('Import / export offers its controls', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-io-toggle').click();
    await expect(
      page.getByRole('button', { name: 'Export class list' }),
    ).toBeVisible();
    await expect(page.locator('#cg-import')).toBeVisible();
  });

  test('the print panel and the projector are reachable once groups exist', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.fill('#cg-count', '8');
    await page.fill('#cg-size', '4');
    await page.locator('#cg-sound-toggle').click();
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .group').first()).toBeVisible();

    await page.getByRole('button', { name: 'Print' }).click();
    await expect(page.locator('#cg-print-panel')).toBeVisible();
    await page
      .locator('#cg-print-panel')
      .getByRole('button', { name: 'Cancel' })
      .click();

    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board')).toBeVisible();
    await expect(page.locator('#cg-board #cg-results')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cg-board')).toBeHidden();
  });

  // Was one test against `/id/classroom-groups` asserting the literal string
  // 'Ekspor daftar kelas' -- a hand-written copy expectation that could drift
  // from the catalogue, covering one of the four translated locales. Both the
  // path and the expected label are derived now, so this checks that each
  // locale's TOOL, not just its page shell, carries its own copy. #49.
  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    test(`the ${locale} tool carries its own copy`, async ({ page }) => {
      await page.goto(localisePath('/classroom-groups', locale));
      await page.locator('#cg-io-toggle').click();
      await expect(
        page.getByRole('button', {
          name: getStrings(locale).ioExportClassList,
        }),
      ).toBeVisible();
    });
  }
});
