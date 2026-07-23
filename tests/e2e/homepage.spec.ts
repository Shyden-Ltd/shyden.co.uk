import { test, expect } from '@playwright/test';
test.describe('homepage content', () => {
  test('hero CTA is a mailto and sections exist', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText(/Shyden|bespoke/i);
    await expect(
      page.getByRole('link', { name: /get in touch/i }).first(),
    ).toHaveAttribute('href', 'mailto:support@shyden.co.uk');
    for (const id of ['services', 'work', 'contact']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });
  test('exactly two service cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#services .service-card')).toHaveCount(2);
  });
  test('work cards link to ShyTalk (external) and the calculator (internal)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.locator('#work a[href="https://shytalk.shyden.co.uk"]'),
    ).toHaveCount(1);
    await expect(page.locator('#work a[href="/glory-points"]')).toHaveCount(1);
  });
  test('contact section CTA links to the support mailbox', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('#contact').getByRole('link', { name: /email us/i }),
    ).toHaveAttribute('href', 'mailto:support@shyden.co.uk');
  });
  test('call-to-action buttons meet the 44×44px touch target', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    const btns = page.locator('.btn');
    await expect(btns.first()).toBeVisible();
    for (const b of await btns.all()) {
      const box = await b.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
      expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
    }
  });
});
test.describe('mobile-first layout', () => {
  for (const width of [320, 375, 768, 1280]) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
  test('no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/');
    expect(errors).toEqual([]);
  });
});
