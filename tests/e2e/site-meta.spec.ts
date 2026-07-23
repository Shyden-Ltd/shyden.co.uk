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

// The 404 page is a real, user-reachable page (broken links, typos, shared bad
// URLs — disproportionately on mobile), so it carries the same no-horizontal-
// scroll guarantee as every other page (cf. homepage.spec.ts / glory-points.spec.ts).
test.describe('404 page — mobile-first layout', () => {
  for (const width of [320, 375, 768, 1280]) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/no-such-page-xyz');
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
