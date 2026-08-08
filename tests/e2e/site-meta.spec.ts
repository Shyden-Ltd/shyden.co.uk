import { test, expect } from './fixtures';
test('custom 404 renders branded not-found copy', async ({ page }) => {
  const res = await page.goto('/no-such-page-xyz');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText(/not found/i);
  await expect(page.locator('main a[href="/"]')).toBeVisible();
});

// One 404 serves both languages (Cloudflare Pages returns the single 404.html
// for /id/* too), so BOTH halves are read by real visitors and both are
// asserted as whole sentences. The two halves are identical markup that differ
// only in line wrapping, and the wrapped half silently lost the space before
// its link — the kind of defect a `toBeVisible()` on the link cannot see.
test('the 404 offers a way home, as a readable sentence, in both languages', async ({
  page,
}) => {
  await page.goto('/no-such-page-xyz');
  await expect(page.locator('main p:not([lang])').first()).toHaveText(
    "That page doesn't exist. Back to the homepage.",
  );
  await expect(page.locator('main p[lang="id"]')).toHaveText(
    'Halaman itu tidak ada. Kembali ke beranda.',
  );
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
