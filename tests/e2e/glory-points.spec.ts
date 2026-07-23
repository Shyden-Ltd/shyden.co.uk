import { test, expect } from '@playwright/test';
test.describe('glory points calculator', () => {
  test('computes the exact breakdown for 1000', async ({ page }) => {
    await page.goto('/glory-points');
    await page.fill('#glory-input', '1000');
    await page.click('#glory-submit');
    const result = page.locator('#glory-result');
    await expect(result).toContainText('1,000'); // coins
    await expect(result).toContainText('1,112'); // beans
    await expect(result).toContainText('2,780'); // gift
  });
  test('Enter key submits', async ({ page }) => {
    await page.goto('/glory-points');
    await page.fill('#glory-input', '9');
    await page.press('#glory-input', 'Enter');
    await expect(page.locator('#glory-result')).toContainText('25');
  });
  test('shows YeeTalk attribution linking to the official site', async ({
    page,
  }) => {
    await page.goto('/glory-points');
    const link = page.locator('a[href="https://yeetalkapp.com/"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.getByText(/YeeTalk/i).first()).toBeVisible();
  });
  // Playwright's `test` has no `.each` (verified: typeof test.each === 'undefined'
  // on @playwright/test@1.61.1) — expanded into one test() per case via a for...of
  // loop, per this repo's existing convention (see homepage.spec.ts). Same four
  // cases, same assertions as the brief's test.each table.
  for (const [input, message] of [
    ['', 'Please enter a number.'],
    ['abc', 'Please enter a whole number.'],
    ['3.5', 'Please enter a whole number.'],
    ['0', 'Enter a number greater than zero.'],
  ] as const) {
    test(`input ${JSON.stringify(input)} shows error ${JSON.stringify(message)}`, async ({
      page,
    }) => {
      await page.goto('/glory-points');
      if (input) await page.fill('#glory-input', input);
      await page.click('#glory-submit');
      await expect(page.locator('#glory-error')).toHaveText(message);
      await expect(page.locator('#glory-result')).toBeEmpty();
    });
  }
});
