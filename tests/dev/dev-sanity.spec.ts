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
