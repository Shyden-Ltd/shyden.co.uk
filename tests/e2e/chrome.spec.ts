import { test, expect, type Locator } from '@playwright/test';

test.describe('header + footer', () => {
  test('nav links point to the section anchors in scroll order', async ({
    page,
  }) => {
    // Pin desktop width: on mobile the nav is hidden until the disclosure opens,
    // so this viewport-dependent test sets its own width (not the project's).
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const nav = page.locator('header nav');
    await expect(nav.locator('a')).toHaveText(['Services', 'Work', 'Contact']);
    await expect(nav.locator('a').nth(0)).toHaveAttribute('href', '/#services');
  });

  test('nav links are root-relative so they work from every page, not just /', async ({
    page,
  }) => {
    // The Header renders on every page via BaseLayout, but #services/#work/#contact
    // exist only on the homepage — so the nav hrefs must be root-relative (/#…) or
    // they dead-link on sub-pages. Regression guard for the cross-task defect the
    // whole-branch review caught (nav was #services → /glory-points#services = dead).
    await page.goto('/glory-points');
    const hrefs = await page
      .locator('header nav a')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs).toEqual(['/#services', '/#work', '/#contact']);
  });

  test('footer shows the required UK company disclosure', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toContainText('Shyden Ltd');
    await expect(footer).toContainText('Registered in England & Wales');
    await expect(footer).toContainText(/Company (No\.|number)/i);
    // Real Companies House values (SHYDEN LTD, 17110487) — and no bracketed
    // placeholder may leak into the shipped disclosure.
    await expect(footer).toContainText('Company No. 17110487');
    await expect(footer).toContainText(/WC2H 9JQ/);
    await expect(footer).not.toContainText('[[');
    await expect(
      footer.locator('a[href="mailto:support@shyden.co.uk"]'),
    ).toBeVisible();
  });

  test('mobile menu: zero-JS disclosure reveals and hides the nav', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    const details = page.locator('header details');
    const firstLink = page.locator('header nav a').first();
    // Closed by default: the nav is hidden.
    await expect(details).toHaveJSProperty('open', false);
    await expect(firstLink).toBeHidden();
    // Click the summary to open: the nav is revealed (no JS involved).
    await page.locator('header summary').click();
    await expect(details).toHaveJSProperty('open', true);
    await expect(firstLink).toBeVisible();
    // Keyboard: native <summary> activation toggles the disclosure on Enter.
    await page.locator('header summary').focus();
    await page.keyboard.press('Enter');
    await expect(details).toHaveJSProperty('open', false);
    await expect(firstLink).toBeHidden();
  });

  test('nav stays a horizontal row at desktop even if opened at mobile first', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await page.locator('header summary').click(); // open at mobile
    await expect(page.locator('header details')).toHaveJSProperty('open', true);
    await page.setViewportSize({ width: 1280, height: 800 }); // resize WITHOUT reload
    const nav = page.locator('header nav');
    await expect(nav).toHaveCSS('flex-direction', 'row');
    await expect(nav).toHaveCSS('position', 'static');
    const lastBox = await page.locator('header nav a').last().boundingBox();
    expect(lastBox!.x + lastBox!.width).toBeLessThanOrEqual(1280);
  });

  test('desktop: nav is keyboard-reachable in order (WCAG 2.1.1)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('.wordmark').focus();
    for (const label of ['Services', 'Work', 'Contact']) {
      await page.keyboard.press('Tab');
      await expect(
        page.locator('header nav a', { hasText: label }),
      ).toBeFocused();
    }
  });
});

test.describe('touch targets ≥ 44×44px (WCAG / mobile-first)', () => {
  const atLeast44 = async (locator: Locator) => {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    // Round to the nearest device pixel: engines can report a sub-pixel value
    // like 43.9999 for a declared `min-height: 44px` (fixed-point layout math).
    expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
  };

  test('mobile: wordmark, menu button, nav links and footer email are ≥44px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await atLeast44(page.locator('.wordmark'));
    await atLeast44(page.locator('header summary'));
    await page.locator('header summary').click(); // open the disclosure so nav links render
    for (const a of await page.locator('header nav a').all())
      await atLeast44(a);
    await atLeast44(
      page.locator('footer a[href="mailto:support@shyden.co.uk"]'),
    );
  });

  test('desktop: nav links are visible, on-screen and ≥44px including width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const links = page.locator('header nav a');
    await expect(links).toHaveCount(3);
    for (const a of await links.all()) {
      // Guards the all-browser desktop-nav regression: a collapsed wrapper made
      // these links render off-screen / non-visible on every engine.
      await expect(a).toBeVisible();
      await atLeast44(a);
    }
    // The last link (Contact) previously overflowed past the viewport edge.
    const lastBox = await links.last().boundingBox();
    expect(lastBox!.x + lastBox!.width).toBeLessThanOrEqual(1280);
  });
});

test.describe('mobile layout: no horizontal overflow', () => {
  test('no horizontal scroll at 320px with the menu open', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await page.locator('header summary').click();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
