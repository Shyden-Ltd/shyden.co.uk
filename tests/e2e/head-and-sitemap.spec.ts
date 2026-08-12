import { test, expect } from './fixtures';

test.describe('the sitemap', () => {
  test('lists every page and pairs the two languages', async ({ request }) => {
    // Nothing tested the sitemap's CONTENTS: seo.spec.ts only checked that
    // robots.txt mentions it. A dropped page or a lost locale went unnoticed.
    const xml = await (await request.get('/sitemap-0.xml')).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
      new URL(m[1]).pathname.replace(/\/$/, ''),
    );

    expect(locs.sort()).toEqual([
      '',
      '/classroom-groups',
      '/glory-points',
      '/id',
      '/id/classroom-groups',
      '/id/glory-points',
    ]);
  });

  test('declares the language relationships search engines need', async ({
    request,
  }) => {
    // @astrojs/sitemap reads its OWN i18n option; the routing config in
    // astro.config.mjs is not inherited. Without it the file carried six
    // <loc> entries and zero alternates, so the English and Indonesian
    // versions of a page looked like unrelated near-duplicates.
    const xml = await (await request.get('/sitemap-0.xml')).text();
    expect(xml).toContain('xhtml:link');
    expect(xml).toContain('hreflang="en-GB"');
    expect(xml).toContain('hreflang="id-ID"');

    // Each entry pairs with its own translation, not with the homepage.
    const groups = xml.split('<url>').slice(1);
    const tool = groups.find((g) =>
      g.includes('<loc>https://shyden.co.uk/classroom-groups/</loc>'),
    );
    expect(tool).toBeDefined();
    expect(tool).toContain('href="https://shyden.co.uk/id/classroom-groups/"');
  });
});

test.describe('the 404 head', () => {
  test('asks not to be indexed, and points nowhere that does not exist', async ({
    page,
  }) => {
    // Cloudflare serves this one file for ANY unknown path, so it has no URL
    // of its own to be canonical about. It used to declare
    // canonical=/404/ and hreflang=id → /id/404/, neither of which is a page.
    await page.goto('/definitely-not-a-page');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
    await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
  });

  test('real pages still declare theirs', async ({ page }) => {
    // The opt-out must not have leaked into every other page.
    await page.goto('/classroom-groups');
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="alternate"]')).toHaveCount(3);
  });
});

test.describe('skip link — WCAG 2.4.1', () => {
  for (const [path, label] of [
    ['/', 'Skip to content'],
    ['/id/', 'Lewati ke konten'],
    ['/classroom-groups', 'Skip to content'],
    ['/id/classroom-groups', 'Lewati ke konten'],
    ['/definitely-not-a-page', 'Skip to content'],
  ] as const) {
    test(`${path} offers it, in the page's language`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('.skip-link')).toHaveText(label);
    });
  }

  test('it is the FIRST thing a Tab reaches', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'Safari omits plain links from the Tab sequence unless the visitor opts ' +
        'in, so a Tab walk here would assert a browser preference rather than ' +
        'our markup. The link itself is asserted for WebKit in the test below.',
    );
    // The whole point of the link, on the page where it matters most:
    // without it a keyboard user crosses the wordmark, the hamburger, the
    // language switcher and three nav links before the first form field.
    await page.goto('/classroom-groups');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveClass(/skip-link/);
  });

  test('it becomes visible when focused, and lands on the content', async ({
    page,
  }) => {
    // Asserted on EVERY engine, WebKit included: focusability and the jump
    // are our markup, and only the Tab ORDER is the browser's preference.
    await page.goto('/classroom-groups');
    const link = page.locator('.skip-link');

    // Off-screen until focused, which is the only time it is any use — and
    // `display: none` would have made it unfocusable, i.e. not a skip link.
    await expect(link).not.toBeInViewport();
    await link.focus();
    await expect(link).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    await expect(page.locator(':focus')).toHaveAttribute('id', 'main');
  });
});
