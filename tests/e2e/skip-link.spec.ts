import { test, expect } from './fixtures';

/**
 * The skip link, WCAG 2.4.1, on every engine.
 *
 * These tests lived in `head-and-sitemap.spec.ts`, which is content-only and
 * so runs on one engine at 1280px. They read layout (`toBeInViewport`) and ask
 * which engine they are on (`browserName`), so they ran nowhere else, while
 * the comment in the last test promised WebKit. The widened content-only
 * boundary found them (#198); here they run on all five engines, which is what
 * that comment always said.
 */
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
