import { test, expect } from './fixtures';
import { LOCALES, localisePath, type Locale } from '../../src/lib/i18n/index';
import {
  siteEn,
  siteId,
  siteZh,
  siteVi,
  siteTh,
  type SiteStrings,
} from '../../src/lib/i18n/site';

/**
 * Every published page is served in every locale it claims to ship.
 *
 * The gap this closes: `classroom-groups` had "the Indonesian page is genuinely
 * in Indonesian", but the homepage and the Glory Points page had no equivalent
 * — 1 of 12 homepage tests and 2 of 16 glory-points tests touched `/id` at all.
 *
 * Written against LOCALES rather than against `id`, deliberately. The existing
 * Indonesian tests are hand-copied mirrors of their English twins with the
 * strings swapped; repeating that for zh, vi and th (#22) triples the suite by
 * hand. Everything here is derived, so a locale added to LOCALES is covered the
 * moment its dictionary exists, with no new test code.
 */

/** The site copy each locale ships. Keyed loosely so a missing one is a test
 *  failure below, not a compile error that would hide behind `as`. */
const SITE: Record<string, SiteStrings> = {
  en: siteEn,
  id: siteId,
  zh: siteZh,
  vi: siteVi,
  th: siteTh,
};

const PAGES = [
  { path: '/', title: (s: SiteStrings) => s.home.title },
  { path: '/glory-points', title: (s: SiteStrings) => s.glory.title },
] as const;

/**
 * Where a page lives in a given locale, derived from the route layout
 * (`src/pages/<locale>/…`) rather than from `localisePath`.
 *
 * Kept as a SECOND, independent derivation rather than deleted now that
 * `localisePath` is general (#21 Stage 1 replaced its hardcoded
 * `/^\/id(?=\/|$)/` with a pattern built from `PREFIXED_LOCALES`). The two
 * are pinned together below: the helper and the route layout must agree for
 * every locale, and a test that used the helper to check the helper would
 * agree with itself no matter what either one said.
 */
const urlFor = (path: string, locale: Locale) =>
  locale === 'en' ? path : `/${locale}${path === '/' ? '/' : path}`;

test.describe('every locale, every page', () => {
  test('every shipped locale has site copy', () => {
    // The page components each pick a dictionary with
    // `lang === 'id' ? siteId : siteEn` (Header, Footer, HomePage,
    // GloryPointsPage). That ternary returns ENGLISH for any locale added to
    // LOCALES without wiring — silently, on a page that looks fine. This is
    // the assertion that makes that loud.
    expect(LOCALES.filter((l) => !SITE[l])).toEqual([]);
  });

  test('localisePath agrees with the route layout for every locale', () => {
    for (const locale of LOCALES)
      for (const { path } of PAGES)
        expect(localisePath(path, locale), `${path} in ${locale}`).toBe(
          urlFor(path, locale),
        );
  });

  test('the translated titles actually differ from English', () => {
    // Vacuity guard. Every per-page assertion below compares the rendered
    // title against that locale's dictionary; if a dictionary simply held the
    // English string, those would all pass on a page that had fallen back to
    // English entirely and prove nothing.
    for (const locale of LOCALES.filter((l) => l !== 'en'))
      for (const { path, title } of PAGES)
        expect(title(SITE[locale]), `${path} title in ${locale}`).not.toBe(
          title(siteEn),
        );
  });

  for (const locale of LOCALES)
    for (const { path, title } of PAGES) {
      const url = urlFor(path, locale);
      test(`${url} is served in ${locale}`, async ({ page }) => {
        await page.goto(url);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page).toHaveTitle(title(SITE[locale]));
      });
    }
});
