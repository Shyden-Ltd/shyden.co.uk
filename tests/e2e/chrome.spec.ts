import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';

test.describe('header + footer', () => {
  test(
    'nav links point to the section anchors in scroll order',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      // Pin desktop width: on mobile the nav is hidden until the disclosure opens,
      // so this viewport-dependent test sets its own width (not the project's).
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      const nav = page.locator('header nav');
      await expect(nav.locator('a')).toHaveText([
        'Services',
        'Work',
        'Contact',
      ]);
      await expect(nav.locator('a').nth(0)).toHaveAttribute(
        'href',
        '/#services',
      );
    },
  );

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

  test(
    'mobile menu: zero-JS disclosure reveals and hides the nav',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
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
    },
  );

  test(
    'nav stays a horizontal row at desktop even if opened at mobile first',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto('/');
      await page.locator('header summary').click(); // open at mobile
      await expect(page.locator('header details')).toHaveJSProperty(
        'open',
        true,
      );
      await page.setViewportSize({ width: 1280, height: 800 }); // resize WITHOUT reload
      const nav = page.locator('header nav');
      await expect(nav).toHaveCSS('flex-direction', 'row');
      await expect(nav).toHaveCSS('position', 'static');
      const lastBox = await page.locator('header nav a').last().boundingBox();
      expect(lastBox!.x + lastBox!.width).toBeLessThanOrEqual(1280);
    },
  );

  // Keyboard access in the header is TWO separate contracts, because engines
  // genuinely disagree about one of them and agree about the other.
  //
  // Safari, by default, does not put plain links in the Tab sequence at all —
  // the visitor opts in with "Press Tab to highlight each item". That is the
  // VISITOR's setting to make, so the Tab-sequence test below runs only where
  // links are tabbed, and the contract that must hold everywhere — that each
  // control can take focus and none is removed from the tab order — is
  // asserted separately, on every engine.
  test(
    'desktop: nav is keyboard-reachable in order (WCAG 2.1.1)',
    { tag: '@emulated-viewport' },
    async ({ page, browserName }) => {
      test.skip(
        browserName === 'webkit',
        'Safari omits plain links from the Tab sequence unless the visitor opts in, ' +
          'so a Tab walk here would assert a browser preference, not our markup. ' +
          'Focusability and order are asserted for WebKit in the tests below.',
      );
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      // Anchor on the language link — the last thing in the bar before <nav> —
      // rather than on the wordmark: engines differ on how many Tab presses that
      // gap costs, and an explicit focus() fixes the starting point on all of
      // them. Tab then advances in DOM order, so this asserts OUR running order.
      await page.locator('header a.lang').focus();

      for (const label of ['Services', 'Work', 'Contact']) {
        await page.keyboard.press('Tab');
        await expect(
          page.locator('header nav a', { hasText: label }),
        ).toBeFocused();
      }
    },
  );

  test(
    'every header link can take focus, on every engine',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      // The contract that holds regardless of the visitor's Tab preference:
      // asserted with an explicit focus() rather than a Tab press, so it measures
      // our markup and not Safari's default. This is the whole header, not just
      // the language switcher — a control left out here would be unreachable by
      // keyboard even for a visitor who HAS opted in.
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      for (const sel of [
        'header .wordmark',
        'header a.lang',
        'header nav a:nth-of-type(1)',
        'header nav a:nth-of-type(2)',
        'header nav a:nth-of-type(3)',
      ]) {
        const el = page.locator(sel);
        await expect(el, sel).toBeVisible();
        await expect(el, sel).not.toHaveAttribute('tabindex', '-1');
        await el.focus();
        await expect(el, sel).toBeFocused();
      }
    },
  );

  test('no header link overrides the visitor’s own Tab preference', async ({
    page,
  }) => {
    // The nav links once carried a redundant tabindex="0". It changes nothing
    // on Chromium or Firefox, but on Safari it FORCES a link into the Tab
    // sequence even when the visitor has chosen to keep links out of it — so
    // Tab reached Services/Work/Contact while silently skipping the wordmark
    // and the language switcher, an inconsistency created by our markup rather
    // than chosen by anyone. Links are focusable natively; the attribute is
    // redundant everywhere it is not actively harmful.
    await page.goto('/');
    const withTabindex = await page
      .locator('header a[tabindex]')
      .evaluateAll((els) =>
        els.map(
          (e) =>
            `${e.className || e.textContent?.trim()}=${e.getAttribute('tabindex')}`,
        ),
      );
    expect(withTabindex).toEqual([]);
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

  test(
    'mobile: wordmark, menu button, nav links and footer email are ≥44px',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
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
    },
  );

  test(
    'desktop: nav links are visible, on-screen and ≥44px including width',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
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
    },
  );
});

test.describe('mobile layout: no horizontal overflow', () => {
  test(
    'no horizontal scroll at 320px with the menu open',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto('/');
      await page.locator('header summary').click();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    },
  );
});
