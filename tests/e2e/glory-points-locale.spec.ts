import { test, expect } from './fixtures';
import { shoot } from './evidence';
import {
  LOCALES,
  localisePath,
  getSiteStrings,
} from '../../src/lib/i18n/index';
import { LOCALE_METADATA } from '../../src/lib/i18n/metadata';

/**
 * The calculator answers in the language of the page it is on.
 *
 * `glory-points.ts` chose its locale with
 * `document.documentElement.lang === 'id' ? 'id' : 'en'` -- a binary written
 * when the site served two languages. #22 shipped five, so on /zh/, /vi/ and
 * /th/ it fell through to ENGLISH: English validation messages, and numbers
 * grouped as en-GB.
 *
 * That second half is the bug `formatNumber`'s own docblock describes for
 * Indonesian, reappearing in three more locales: Vietnamese groups thousands
 * with "." and marks decimals with ",", the exact reverse of English, so a
 * result read as one number and meant another.
 *
 * Derived from LOCALES, so a sixth language is covered the day it is added.
 */

test.describe('the Glory Points calculator speaks the page it is on', () => {
  for (const locale of LOCALES) {
    test(`${locale}: validation is answered in ${locale}`, async ({ page }) => {
      await page.goto(localisePath('/glory-points', locale));
      const t = getSiteStrings(locale).glory;

      await page.locator('#glory-input').fill('');
      await page.locator('#glory-submit').click();

      const error = page.locator('#glory-error');
      await expect(error).toHaveText(t.errors.empty);
      await shoot(
        page,
        `${locale}: empty input is refused in ${locale}`,
        error,
      );
    });

    test(`${locale}: numbers use ${locale} conventions`, async ({ page }) => {
      await page.goto(localisePath('/glory-points', locale));

      await page.locator('#glory-input').fill('1112');
      await page.locator('#glory-submit').click();

      const result = page.locator('#glory-result');
      await expect(result).not.toBeEmpty();
      const shown = (await result.textContent()) ?? '';

      // Compare against what the platform itself formats for this locale --
      // never a hand-written expectation of where the separators go, which
      // would be a second table to keep in step with LOCALE_METADATA.
      const expected = (1112).toLocaleString(
        LOCALE_METADATA[locale].numberLocale,
      );
      expect(
        shown.includes(expected),
        `${locale}: expected ${expected} in "${shown.trim().slice(0, 80)}"`,
      ).toBe(true);
      await shoot(page, `${locale}: 1112 renders as ${expected}`, result);
    });
  }
});
