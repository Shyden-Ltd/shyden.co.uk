import { test, expect } from '@playwright/test';
test('custom 404 renders branded not-found copy', async ({ page }) => {
  const res = await page.goto('/no-such-page-xyz');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText(/not found/i);
  await expect(page.locator('main a[href="/"]')).toBeVisible();
});
test('robots.txt references the sitemap', async ({ request }) => {
  const body = await (await request.get('/robots.txt')).text();
  expect(body).toMatch(
    /Sitemap:\s*https:\/\/shyden\.co\.uk\/sitemap-index\.xml/,
  );
});
