import { test, expect } from '@playwright/test';

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
  await page.selectOption('#cg-speed', 'skip');
  await page.click('#cg-go');
  await expect(page.locator('#cg-results .student')).toHaveCount(8);
});

test.describe('the Indonesian half of the site exists on dev', () => {
  // Half the routes on this site are /id/* and none of them were checked
  // here. A build that dropped the locale would have deployed green.
  for (const [path, heading] of [
    ['/id/', 'Kami membangun'],
    ['/id/glory-points', 'Kalkulator Glory Points'],
    ['/id/classroom-groups', 'Pembuat Kelompok Kelas'],
  ] as const) {
    test(`${path} is served in Indonesian`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', 'id');
      await expect(page.locator('h1')).toContainText(heading);
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
