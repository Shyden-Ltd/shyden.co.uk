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

  // The disclosure is asserted as ONE whole sentence rather than as a handful
  // of substrings. It is assembled from four fragments (three of them
  // translated), and every join between them is a place a space can go missing
  // — which is exactly how "Company No.17110487" once shipped. Substring
  // assertions only ever pinned the joins someone thought to name; matching the
  // finished sentence pins all of them at once.
  //
  // The year is matched as \d{4} on purpose: asserting the CURRENT year would
  // either restate the implementation or break the suite on 1 January.
  const disclosureEn =
    /^© \d{4} Shyden Ltd\. Registered in England & Wales\. Company No\. 17110487\. Registered office: 71-75 Shelton Street, Covent Garden, London, United Kingdom, WC2H 9JQ\.$/;
  const disclosureId =
    /^© \d{4} Shyden Ltd\. Terdaftar di Inggris & Wales\. No\. Perusahaan 17110487\. Kantor terdaftar: 71-75 Shelton Street, Covent Garden, London, United Kingdom, WC2H 9JQ\.$/;

  test('footer shows the required UK company disclosure', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    // Real Companies House values (SHYDEN LTD, 17110487) — and no bracketed
    // placeholder may leak into the shipped disclosure.
    await expect(footer.locator('.disclosure')).toHaveText(disclosureEn);
    await expect(footer).not.toContainText('[[');
    await expect(
      footer.locator('a[href="mailto:support@shyden.co.uk"]'),
    ).toBeVisible();
  });

  test('the Indonesian footer carries the same disclosure, translated', async ({
    page,
  }) => {
    // The company name, number and registered office are legal FACTS and stay
    // verbatim in every language; only the wording around them is translated.
    // Indonesian also reorders the label ("No. Perusahaan"), so this is a real
    // second arrangement of the same fragments — not a copy of the English one.
    await page.goto('/id/');
    const footer = page.locator('footer');
    await expect(footer.locator('.disclosure')).toHaveText(disclosureId);
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
    // Start from the language link — the last thing in the bar before <nav> —
    // rather than from the wordmark. Engines DISAGREE about how many Tab
    // presses separate the wordmark from the nav: Chromium and Firefox stop on
    // `a.lang` on the way, WebKit skips it (Safari leaves plain links out of
    // the Tab sequence unless the visitor turns on "Press Tab to highlight each
    // item"). Anchoring on `a.lang` with an explicit focus() sidesteps that
    // disagreement entirely — Tab then advances to the next tabbable element
    // after it in DOM order on every engine — so this test asserts OUR running
    // order and not the browser's link preference. That preference is a
    // separate contract, covered by the focusability test below.
    await page.locator('header a.lang').focus();

    for (const label of ['Services', 'Work', 'Contact']) {
      await page.keyboard.press('Tab');
      await expect(
        page.locator('header nav a', { hasText: label }),
      ).toBeFocused();
    }
  });

  test('the language switcher is keyboard-focusable on every engine', async ({
    page,
  }) => {
    // Asserted with an explicit focus() rather than a Tab press: WebKit leaves
    // plain links out of the Tab sequence unless the user turns on "Press Tab
    // to highlight each item", so a Tab-based assertion would test Safari's
    // preference rather than our markup. What must be true everywhere is that
    // the control CAN take focus and is not removed from the tab order.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const lang = page.locator('header a.lang');
    await expect(lang).toBeVisible();
    await expect(lang).not.toHaveAttribute('tabindex', '-1');
    await lang.focus();
    await expect(lang).toBeFocused();
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
