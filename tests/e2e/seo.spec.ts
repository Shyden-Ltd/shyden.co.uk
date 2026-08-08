import { test, expect } from './fixtures';
test.describe('homepage SEO head', () => {
  test('has title, meta description, canonical and Open Graph', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Shyden/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /.{20,}/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://shyden.co.uk/',
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      'content',
      'website',
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      'https://shyden.co.uk/',
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://shyden.co.uk/og-default.png',
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
  });
});
