import { test, expect, type Locator } from '@playwright/test';
test.describe('glory points calculator', () => {
  test('computes the exact breakdown for 1000', async ({ page }) => {
    await page.goto('/glory-points');
    await page.fill('#glory-input', '1000');
    await page.click('#glory-submit');
    const result = page.locator('#glory-result');
    await expect(result).toContainText('1,000'); // coins
    await expect(result).toContainText('1,112'); // beans
    await expect(result).toContainText('2,780'); // gift
    await expect(page.locator('#glory-error')).toBeEmpty(); // result & error are mutually exclusive
  });
  test('Enter key submits', async ({ page }) => {
    await page.goto('/glory-points');
    await page.fill('#glory-input', '9');
    await page.press('#glory-input', 'Enter');
    await expect(page.locator('#glory-result')).toContainText('25');
    await expect(page.locator('#glory-error')).toBeEmpty();
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

test.describe('glory points — touch targets ≥ 44×44px (WCAG / mobile-first)', () => {
  const atLeast44 = async (locator: Locator) => {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    // Round to the nearest device pixel: engines can report a sub-pixel value
    // like 43.9999 for a declared `min-height: 44px` (fixed-point layout math).
    expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
  };

  test('mobile: attribution link, input and submit button are ≥44px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/glory-points');
    await atLeast44(page.locator('a[href="https://yeetalkapp.com/"]'));
    await atLeast44(page.locator('#glory-input'));
    await atLeast44(page.locator('#glory-submit'));
  });
});

test.describe('glory points — mobile-first layout', () => {
  for (const width of [320, 375, 768, 1280]) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/glory-points');
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
