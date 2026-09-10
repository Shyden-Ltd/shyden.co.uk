import { test, expect } from './fixtures';
import { shoot } from './evidence';
import {
  LOCALES,
  DEFAULT_LOCALE,
  getSiteStrings,
  localisePath,
} from '../../src/lib/i18n/index';

/**
 * The 404, as a visitor who mistyped a URL actually meets it.
 *
 * Cloudflare Pages serves this one file for ANY unknown path, so it is the only
 * place a lost visitor can be answered — and until #104 it answered in two of
 * the five languages this site serves. `copy-reaches-a-page.spec.ts` holds the
 * bytes; this holds what rendering and geometry can show and bytes cannot: that
 * five stacked languages are visible, and that they do not push the page
 * sideways on the narrowest phone.
 */

const NOT_FOUND = '/no-such-page-' + 'xyz';

test.describe('the 404 answers everyone', () => {
  test('shows every language the site serves', async ({ page }) => {
    await page.goto(NOT_FOUND);

    for (const locale of LOCALES) {
      const t = getSiteStrings(locale).notFound;
      const heading =
        locale === DEFAULT_LOCALE
          ? page.getByRole('heading', { level: 1, name: t.heading })
          : page.getByRole('heading', { level: 2, name: t.heading });
      await expect(heading, `${locale}: no heading on the 404`).toBeVisible();
      await shoot(page, `${locale} is answered on the 404`, heading);
    }
  });

  test('marks each language so a screen reader changes voice', async ({
    page,
  }) => {
    // Not asserted as `lang="xx"` anywhere on the page: the language switcher
    // renders `<a hreflang="zh" lang="zh">` for every alternative, so that
    // check passes on a page with no Chinese content at all. Anchored to the
    // heading element instead.
    await page.goto(NOT_FOUND);
    for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
      const t = getSiteStrings(locale).notFound;
      const heading = page.getByRole('heading', { level: 2, name: t.heading });
      await expect(heading).toHaveAttribute('lang', locale);
      await shoot(page, `${locale} heading carries lang="${locale}"`, heading);
    }
  });

  test('sends every visitor home in their own language', async ({ page }) => {
    await page.goto(NOT_FOUND);
    for (const locale of LOCALES) {
      const t = getSiteStrings(locale).notFound;
      const link = page.getByRole('link', { name: t.backHome, exact: true });
      await expect(link).toHaveAttribute('href', localisePath('/', locale));
      await shoot(page, `${locale} link goes to its own homepage`, link);
    }
  });

  test(
    'five stacked languages add no horizontal scroll at 320px',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto(NOT_FOUND);
      // Not vacuous: a 404 whose content were hidden at 320px would satisfy
      // "no overflow" trivially, and hiding it is also the wrong fix.
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: getSiteStrings(LOCALES[LOCALES.length - 1]).notFound.heading,
        }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, 'the 404 scrolls sideways at 320px').toBeLessThanOrEqual(
        0,
      );
      await shoot(page, `320px: last language visible, overflow ${overflow}px`);
    },
  );
});
