import { test, expect } from '@playwright/test';
test.describe('header + footer', () => {
  test('nav links point to the section anchors in scroll order', async ({
    page,
  }) => {
    // Pin desktop width: on mobile projects the nav lives in a closed <details>,
    // so this viewport-dependent test must set its own width (not inherit the project's).
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const nav = page.locator('header nav');
    await expect(nav.locator('a')).toHaveText(['Services', 'Work', 'Contact']);
    await expect(nav.locator('a').nth(0)).toHaveAttribute('href', '#services');
  });
  test('footer shows the required UK company disclosure', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toContainText('Shyden Ltd');
    await expect(footer).toContainText('Registered in England & Wales');
    await expect(footer).toContainText(/Company (No\.|number)/i);
    await expect(
      footer.locator('a[href="mailto:support@shyden.co.uk"]'),
    ).toBeVisible();
  });
  test('mobile menu is a zero-JS <details> disclosure', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    const details = page.locator('header details');
    await expect(details).toHaveJSProperty('open', false);
    await page.locator('header summary').click();
    await expect(details).toHaveJSProperty('open', true);
  });
});
