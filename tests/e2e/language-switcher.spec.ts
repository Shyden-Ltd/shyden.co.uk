import { test, expect } from './fixtures';
import { LOCALES, localisePath } from '../../src/lib/i18n';
import { otherLocales } from '../../src/lib/i18n/index';
import { LOCALE_METADATA } from '../../src/lib/i18n/metadata';

/**
 * The language switcher, as a visitor meets it.
 *
 * It replaced a single link labelled "the other language" — one string that
 * could only ever name one alternative. The unit tests hold the source shape;
 * these hold what a person actually gets: the right name, in the right script,
 * linking to the page they were already reading.
 *
 * The 320px case is not a formality. The old control was one short word; this
 * one is a flag, a caret and a full native name — "Bahasa Indonesia" is 16
 * characters — sitting in a header that already carries a wordmark and a menu
 * button. This repo has shipped horizontal scroll from exactly this kind of
 * intrinsic-width growth before (#cg-io-toggle pinned a grid track to 378px
 * and put 74px of scroll on a 320px screen).
 */

const SWITCHER = 'details.lang-switch';

test.describe('language switcher', () => {
  test('names the current language in its own language', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(`${SWITCHER} > summary`)).toContainText(
      'English',
    );

    await page.goto('/id/');
    await expect(page.locator(`${SWITCHER} > summary`)).toContainText(
      'Bahasa Indonesia',
    );
  });

  test('offers every other language, each named in its own language', async ({
    page,
  }) => {
    await page.goto('/');
    // Every other language, derived. A count of 1 and a single hard-coded
    // name asserted that the site had two languages, not that the switcher
    // lists them -- and it would have gone on passing if #22 had wired the
    // three new locales everywhere EXCEPT here.
    const others = otherLocales('en');
    const entries = page.locator(`${SWITCHER} li a`);
    await expect(entries).toHaveCount(others.length);
    for (const locale of others) {
      const entry = entries.filter({
        hasText: LOCALE_METADATA[locale].nativeName,
      });
      await expect(entry, `an entry for ${locale}`).toHaveCount(1);
      await expect(entry).toHaveAttribute('hreflang', locale);
      await expect(entry).toHaveAttribute('lang', locale);
    }
  });

  test('opens and closes without JavaScript', async ({ page }) => {
    // A native <details>. The homepage ships zero JS, and a language switcher
    // is exactly the control someone needs when something else has failed.
    await page.goto('/');
    const details = page.locator(SWITCHER);
    const entry = page.locator(`${SWITCHER} li a`).first();

    await expect(entry).toBeHidden();
    await page.locator(`${SWITCHER} > summary`).click();
    await expect(details).toHaveAttribute('open', '');
    await expect(entry).toBeVisible();
  });

  test('keeps you on the page you were reading', async ({ page }) => {
    // The classic i18n bug is a switcher that dumps the visitor on the
    // homepage instead of translating the page in front of them.
    // Trailing slash included deliberately: Astro serves these paths with one,
    // so this asserts the href a visitor actually gets rather than a tidied
    // version of it. `every target is a real page` proves it resolves.
    await page.goto('/glory-points');
    await expect(page.locator(`${SWITCHER} li a`).first()).toHaveAttribute(
      'href',
      '/id/glory-points/',
    );

    await page.goto('/id/glory-points');
    await expect(page.locator(`${SWITCHER} li a`).first()).toHaveAttribute(
      'href',
      '/glory-points/',
    );
  });

  test('every target is a real page, not a 404', async ({ page }) => {
    await page.goto('/glory-points');
    const href = await page
      .locator(`${SWITCHER} li a`)
      .first()
      .getAttribute('href');
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
  });

  test('the control and its entries are touchable', async ({ page }) => {
    await page.goto('/');
    const summary = page.locator(`${SWITCHER} > summary`);
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await summary.click();
    const entry = page.locator(`${SWITCHER} li a`).first();
    expect((await entry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test(
    'adds no horizontal scroll at 320px, in every language',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      // Derived from LOCALES (#75). This read `['/', '/id/']`, written when
      // those were the only two. Width at 320px is one of the few genuinely
      // locale-sensitive things here — Thai and Chinese set to different
      // widths than English — so the three locales #22 added are exactly the
      // ones this test most needed to see. The loop is inside the test, so
      // covering them costs iterations, not tests.
      for (const path of LOCALES.map((locale) => localisePath('/', locale))) {
        await page.setViewportSize({ width: 320, height: 720 });
        await page.goto(path);
        // Not vacuous: a switcher hidden at 320px would satisfy "no overflow"
        // trivially, and would also be the wrong fix.
        await expect(page.locator(`${SWITCHER} > summary`)).toBeVisible();
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(
          overflow,
          `${path} scrolls sideways at 320px`,
        ).toBeLessThanOrEqual(0);
      }
    },
  );

  test(
    'the open dropdown stays inside the viewport at 320px',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      // Page-level scrollWidth is not containment: a panel can escape its own
      // container and still produce zero document scroll.
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto('/');
      await expect(page.locator(`${SWITCHER} > summary`)).toBeVisible();
      await page.locator(`${SWITCHER} > summary`).click();
      const box = (await page.locator(`${SWITCHER} ul`).boundingBox())!;
      expect(box.x, 'dropdown escapes the left edge').toBeGreaterThanOrEqual(0);
      expect(
        box.x + box.width,
        'dropdown escapes the right edge',
      ).toBeLessThanOrEqual(320);
    },
  );
});
