import { test, expect } from './fixtures';
import { contrastRatio } from './helpers';
import {
  LOCALES,
  DEFAULT_LOCALE,
  PREFIXED_LOCALES,
  isBetaLocale,
  localisePath,
  otherLocales,
  getSiteStrings,
  BETA_BADGE,
} from '../../src/lib/i18n/index';

/**
 * What a visitor actually sees: every unverified language is labelled BETA.
 *
 * The unit tests hold the derivation and the copy. These hold the RENDERING,
 * which is what #96's acceptance criteria are written about -- a marker that
 * exists in a string table and reaches no page is exactly the vacuity this
 * repo keeps finding.
 *
 * Runs over the full LOCALES set, not `SAMPLED_LOCALES`: this is text- and
 * layout-sensitive, and the 320px case in particular differs by script.
 */

const SWITCHER = 'details.lang-switch';
const BADGE = '[data-beta]';
const NOTICE = '[data-beta-notice]';

/**
 * The count that must appear on EVERY page in EVERY locale.
 *
 * Each beta locale is marked exactly once -- in the `<summary>` when it is the
 * language being read, in the `<ul>` when it is an alternative -- so the total
 * is the size of the beta set and does not vary by page. Asserted as an exact
 * number rather than "at least one": a marker painted on everything, English
 * included, would satisfy any weaker check while telling the visitor nothing.
 */
const EXPECTED_BADGES = LOCALES.filter(isBetaLocale).length;

test.describe('every unverified language is marked BETA', () => {
  for (const locale of LOCALES) {
    const path = localisePath('/', locale);
    const t = getSiteStrings(locale);

    test(`${locale}: marks each beta language once and English never`, async ({
      page,
    }) => {
      await page.goto(path);

      expect(
        await page.locator(BADGE).count(),
        `${path}: expected one badge per beta locale`,
      ).toBe(EXPECTED_BADGES);

      // The language being read is badged only when it is itself unverified.
      const summaryBadge = page.locator(`${SWITCHER} > summary ${BADGE}`);
      await expect(summaryBadge).toHaveCount(isBetaLocale(locale) ? 1 : 0);

      await page.locator(`${SWITCHER} > summary`).click();
      for (const other of otherLocales(locale)) {
        const entry = page.locator(`${SWITCHER} li a[hreflang="${other}"]`);
        await expect(
          entry.locator(BADGE),
          `${path}: ${other} is ${isBetaLocale(other) ? 'unverified and unbadged' : 'verified but badged'}`,
        ).toHaveCount(isBetaLocale(other) ? 1 : 0);
      }
    });

    test(`${locale}: the footer says why, in ${locale}`, async ({ page }) => {
      await page.goto(path);
      const notice = page.locator(NOTICE);

      if (!isBetaLocale(locale)) {
        // English is the one locale we can confirm verified, so its page
        // carries no notice at all.
        await expect(notice).toHaveCount(0);
        return;
      }

      await expect(notice).toBeVisible();
      await expect(notice).toContainText(t.language.betaNotice);
      // The badge token is not translated; the sentence beside it is.
      await expect(notice).toContainText(BETA_BADGE);
      if (locale !== DEFAULT_LOCALE) {
        await expect(notice).not.toContainText(
          getSiteStrings(DEFAULT_LOCALE).language.betaNotice,
        );
      }
    });
  }

  test('the badge carries a translated name for screen readers', async ({
    page,
  }) => {
    // "BETA" alone tells a screen-reader user nothing about WHAT is in beta.
    // Read as textContent, not as an accessible name: the badge is a plain
    // `<span>` with no role, and the label is a visually-hidden child that a
    // reader traverses but `innerText` omits.
    for (const locale of PREFIXED_LOCALES) {
      await page.goto(localisePath('/', locale));
      const spoken = await page
        .locator(`${SWITCHER} > summary ${BADGE}`)
        .evaluate((el) => el.textContent ?? '');
      expect(spoken, `${locale}: badge is a bare token`).toContain(
        getSiteStrings(locale).language.betaLabel,
      );
      expect(spoken).toContain(BETA_BADGE);
    }
  });

  test('the badge clears the WCAG AA floor for normal text', async ({
    page,
  }) => {
    // Both placements: the dropdown paints its own background, so the entry
    // badge is a different composite from the one in the summary.
    await page.goto(localisePath('/', PREFIXED_LOCALES[0]));
    const summaryBadge = page.locator(`${SWITCHER} > summary ${BADGE}`).first();
    expect(await contrastRatio(summaryBadge)).toBeGreaterThanOrEqual(4.5);

    await page.locator(`${SWITCHER} > summary`).click();
    const entryBadge = page.locator(`${SWITCHER} li ${BADGE}`).first();
    await expect(entryBadge).toBeVisible();
    expect(await contrastRatio(entryBadge)).toBeGreaterThanOrEqual(4.5);
  });

  test(
    'adds no horizontal scroll at 320px, in every language',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      for (const locale of LOCALES) {
        const path = localisePath('/', locale);
        await page.setViewportSize({ width: 320, height: 720 });
        await page.goto(path);
        // Not vacuous: a badge hidden at 320px would satisfy "no overflow"
        // trivially, and hiding it is also the wrong fix.
        if (isBetaLocale(locale))
          await expect(
            page.locator(`${SWITCHER} > summary ${BADGE}`),
          ).toBeVisible();
        await expect(page.locator(NOTICE)).toHaveCount(
          isBetaLocale(locale) ? 1 : 0,
        );
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(
          overflow,
          `${path} scrolls sideways at 320px with the BETA marker`,
        ).toBeLessThanOrEqual(0);
      }
    },
  );
});
