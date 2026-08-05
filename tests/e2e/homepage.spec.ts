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
  test('work cards: ShyTalk shown as its brand wordmark (external), calculator internal', async ({
    page,
  }) => {
    await page.goto('/');
    const shytalk = page.locator(
      '#work a[href="https://shytalk.shyden.co.uk"]',
    );
    await expect(shytalk).toHaveCount(1);
    // Accessible name stays "ShyTalk" even though the visible title is a wordmark.
    await expect(shytalk).toHaveAttribute('aria-label', 'ShyTalk');
    // The card's title is the ShyTalk wordmark: "Shy" + a spanned, brand-purple
    // "Talk" (the two-tone mark from shytalk.shyden.co.uk), not plain text.
    const wordmark = shytalk.locator('.shytalk-wordmark');
    await expect(wordmark).toHaveText('ShyTalk');
    await expect(wordmark.locator('span')).toHaveText('Talk');
    // The exact two-tone logo colours from shytalk.shyden.co.uk:
    // light "Shy" (#e8e0f0) + purple "Talk" (#d0bcff), on the dark brand tile.
    await expect(wordmark).toHaveCSS('color', 'rgb(232, 224, 240)');
    await expect(wordmark.locator('span')).toHaveCSS(
      'color',
      'rgb(208, 188, 255)',
    );
    await expect(shytalk).toHaveCSS('background-color', 'rgb(15, 13, 21)');
    await expect(page.locator('#work a[href="/glory-points"]')).toHaveCount(1);
  });
  test('contact section CTA links to the support mailbox', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('#contact').getByRole('link', { name: /email us/i }),
    ).toHaveAttribute('href', 'mailto:support@shyden.co.uk');
  });

  // Asserting the READ sentence, not just that the link exists: the invitation
  // and the address are separate nodes, and the space between them is dropped
  // whenever a formatter puts them on separate lines — which shipped
  // "building.support@shyden.co.uk" to real phones. Checking the href alone
  // cannot see that; only the rendered text can.
  for (const { locale, path, sentence } of [
    {
      locale: 'English',
      path: '/',
      sentence: "Tell us what you're building. support@shyden.co.uk",
    },
    {
      locale: 'Indonesian',
      path: '/id/',
      sentence: 'Ceritakan apa yang sedang Anda bangun. support@shyden.co.uk',
    },
  ]) {
    test(`${locale}: the contact invitation reads as one sentence`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.locator('#contact p').first()).toHaveText(sentence);
    });
  }
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
