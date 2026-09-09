import { describe, it, expect } from 'vitest';
import {
  LOCALES,
  otherLocales,
  DEFAULT_LOCALE,
} from '../../src/lib/i18n/index';
import { siteEn, siteId } from '../../src/lib/i18n/site';

/**
 * TRIPWIRES. These fail ON PURPOSE when a third locale is added.
 *
 * Do not "fix" one by relaxing it. Each guards a place that still assumes
 * exactly two locales after #21 generalised the routing. The routing is now
 * derived from LOCALES and proven against a third locale
 * (`locale-routing.test.ts`), but two USER-FACING behaviours are still binary
 * by construction, and neither fails loudly on its own:
 *
 *   1. The language switcher's label, `strings.language.switchTo`, is one
 *      string meaning "the other language". Rendered over a list of two
 *      alternatives it would label both identically — the visitor sees the
 *      same word twice and cannot tell which is which.
 *
 *   2. The classroom-groups handover opens the tool in "the other language"
 *      and `ioHandoverSent` says so. With more than one alternative, taking
 *      the first would pick a language on the teacher's behalf, silently.
 *
 * Operator decisions on #21 (2026-09-09) settle both: the switcher becomes an
 * SVG-flag-plus-native-name dropdown, and the handover offers a locale picker.
 * Until that work lands, these tests are what stop a third locale shipping a
 * switcher nobody can read. When it lands, delete these and replace them with
 * assertions about the dropdown and the picker — not by widening the numbers.
 *
 * This is the same tactic the repo already uses elsewhere: make the failure
 * arrive at the moment the assumption breaks, rather than trusting a future
 * reader to notice a comment.
 */

describe('binary-locale assumptions still outstanding after #21', () => {
  it('the language switcher cannot label more than one alternative', () => {
    // `switchTo` names a language. One string cannot name two.
    for (const locale of LOCALES) {
      expect(
        otherLocales(locale).length,
        `${locale} has ${otherLocales(locale).length} alternatives, but ` +
          'language.switchTo is a single label — build the flag dropdown ' +
          '(#21) before adding a locale',
      ).toBe(1);
    }
  });

  it('the handover has exactly one destination', () => {
    // io-ui.ts takes otherLocales(locale)[0]. That is only ever right while
    // there is exactly one, which the assertion above already pins; this one
    // states the dependency explicitly so deleting that test does not quietly
    // un-guard the handover too.
    expect(
      LOCALES.length,
      'the handover picks otherLocales(locale)[0] — build the locale picker ' +
        '(#21) before adding a locale',
    ).toBe(2);
  });

  it('every locale ships a switcher label that names a real language', () => {
    // Vacuity guard: the tripwires above would still pass if `switchTo` were
    // blank or identical across locales, which is exactly the state a
    // half-finished translation leaves behind.
    const labels = {
      en: siteEn.language.switchTo,
      id: siteId.language.switchTo,
    };
    for (const [locale, label] of Object.entries(labels)) {
      expect(label.trim(), `${locale} switcher label is blank`).not.toBe('');
    }
    expect(
      new Set(Object.values(labels)).size,
      'every locale shows the same switcher label — the copy was never translated',
    ).toBe(Object.keys(labels).length);
  });

  it('the default locale is the one served without a prefix', () => {
    // Stated as a test because DEFAULT_LOCALE replaced six `=== 'en'` literals;
    // if it ever stopped being LOCALES[0] the routing would still "work" while
    // serving the default language from a prefixed URL.
    expect(DEFAULT_LOCALE).toBe(LOCALES[0]);
    expect(otherLocales(DEFAULT_LOCALE)).not.toContain(DEFAULT_LOCALE);
  });
});
