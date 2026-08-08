import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';
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
  test('the Indonesian calculator prints Indonesian numbers', async ({
    page,
  }) => {
    // "." groups thousands and "," is the decimal mark in Indonesian, so the
    // English rendering "1.112" would read as one-point-one-one-two. The
    // static copy on this very page already says "0,9 bean per koin".
    //
    // The Indonesian calculator had never been exercised at all — which is
    // how this survived, along with t.errors.* and the English fallback in
    // glory-points.ts.
    await page.goto('/id/glory-points');
    await page.fill('#glory-input', '1000');
    await page.click('#glory-submit');
    const result = page.locator('#glory-result');
    await expect(result).toContainText('1.000'); // koin
    await expect(result).toContainText('1.112'); // bean
    await expect(result).toContainText('2.780'); // nilai hadiah
    await expect(result).not.toContainText('1,112');
  });

  test('the Indonesian calculator refuses in Indonesian', async ({ page }) => {
    await page.goto('/id/glory-points');
    await page.fill('#glory-input', 'abc');
    await page.click('#glory-submit');
    const error = page.locator('#glory-error');
    await expect(error).not.toBeEmpty();
    // The English fallback at glory-points.ts would render the raw English
    // message here; the map must actually cover this code.
    await expect(error).not.toContainText('whole number');
    await expect(page.locator('#glory-result')).toBeEmpty();
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

test.describe('glory points — explains what it does and how to use it', () => {
  test('the lead says: enter a target, get the exact amounts NEEDED to reach it', async ({
    page,
  }) => {
    // Pin the CAUSAL DIRECTION, not just the vocabulary: glory points are the
    // INPUT you enter, and the exact coins/beans/total gift value are the OUTPUT
    // you NEED to reach that target. A backwards rewrite that keeps all the same
    // keywords (e.g. "enter the gift value → get the glory points") must FAIL
    // this, which a set of order-independent substring checks could not catch.
    await page.goto('/glory-points');
    const lead = page.locator('.lead');
    await expect(lead).toContainText(
      /enter the number of glory points.+exact coins, beans and total gift value you need to reach it/i,
    );
  });

  test('gives numbered, in-order steps: enter → calculate → read the result', async ({
    page,
  }) => {
    await page.goto('/glory-points');
    await expect(
      page.getByRole('heading', { name: /how to use it/i }),
    ).toBeVisible();
    // The steps are a real list in the accessibility tree, named by the "How to
    // use it" heading (via aria-labelledby) — so a screen reader announces
    // "How to use it, list, 3 items". Asserting the ROLE (not just the CSS
    // selector) guards the native list semantics against a styling regression.
    await expect(
      page.getByRole('list', { name: /how to use it/i }),
    ).toBeVisible();
    const steps = page.locator('.how-to ol > li');
    await expect(steps).toHaveCount(3);
    // 1) Enter the glory-point target.
    await expect(steps.nth(0)).toContainText(/glory points/i);
    await expect(steps.nth(0)).toContainText(/enter|type/i);
    // 2) Trigger the calculation (the button is labelled "Calculate").
    await expect(steps.nth(1)).toContainText(/calculate/i);
    // 3) Read off the beans and gift value needed — the amounts the user asked about.
    await expect(steps.nth(2)).toContainText(/beans/i);
    await expect(steps.nth(2)).toContainText(/total gift value/i);
  });
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

  test(
    'mobile: attribution link, input and submit button are ≥44px',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto('/glory-points');
      await atLeast44(page.locator('a[href="https://yeetalkapp.com/"]'));
      await atLeast44(page.locator('#glory-input'));
      await atLeast44(page.locator('#glory-submit'));
    },
  );
});

test.describe('glory points — mobile-first layout', () => {
  for (const width of [320, 375, 768, 1280]) {
    test(
      `no horizontal scroll at ${width}px`,
      { tag: '@emulated-viewport' },
      async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/glory-points');
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      },
    );
  }
});
