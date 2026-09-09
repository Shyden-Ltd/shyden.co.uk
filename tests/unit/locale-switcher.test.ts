import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LOCALES,
  otherLocales,
  DEFAULT_LOCALE,
} from '../../src/lib/i18n/index';
import { siteEn, siteId } from '../../src/lib/i18n/site';

/**
 * One tripwire retired, one still armed.
 *
 * This file held two deliberate failures, each guarding a user-facing
 * behaviour that was still binary after #21 generalised the routing:
 *
 *   1. RETIRED by Stage 2. `strings.language.switchTo` was a single string
 *      meaning "the other language". Over two alternatives it labelled both
 *      identically — the visitor saw one word twice and could not tell which
 *      was which. The switcher is now a `<details>` dropdown that reads each
 *      language's own name from LOCALE_METADATA, so it labels N alternatives
 *      correctly. The guards below are what stop the single label returning.
 *
 *   2. STILL ARMED. The classroom-groups handover takes
 *      `otherLocales(locale)[0]`, which is only ever right while there is
 *      exactly one. Stage 3 replaces it with a picker. Until then this is what
 *      stops a third locale shipping a handover that chooses a language on the
 *      teacher's behalf, silently.
 *
 * Do not "fix" the remaining tripwire by relaxing its number. Retire it the
 * way Stage 2 retired the first: build the thing, then replace the tripwire
 * with assertions about what was built.
 */

const source = (path: string) => readFileSync(path, 'utf8');
const SWITCHER = 'src/components/LanguageSwitcher.astro';
const HEADER = 'src/components/Header.astro';

describe('the language switcher labels every alternative (tripwire 1, retired)', () => {
  it('no longer ships a single string meaning "the other language"', () => {
    // The exact shape of the retired bug. A reinstated `switchTo` would label
    // every alternative identically again, and nothing else here would notice.
    const tables = JSON.stringify({ siteEn, siteId });
    expect(
      tables.includes('switchTo'),
      'language.switchTo is the binary label #21 Stage 2 removed — the ' +
        'switcher reads native names from LOCALE_METADATA instead',
    ).toBe(false);
  });

  it('derives its entries from otherLocales, not from a fixed pair', () => {
    const src = source(SWITCHER);
    expect(src).toContain('otherLocales(');
    expect(
      src,
      'each entry must be labelled from its own metadata, or the dropdown is ' +
        'just the single-label bug with a caret on it',
    ).toContain('nativeName');
  });

  it('gives every alternative its own hreflang and lang', () => {
    // Without `lang`, a screen reader announces 中文 in English phonetics.
    const src = source(SWITCHER);
    expect(src).toContain('hreflang={code}');
    expect(src).toContain('lang={code}');
  });

  it('is the only switcher the header renders', () => {
    const src = source(HEADER);
    expect(src).toContain('<LanguageSwitcher');
    expect(
      src.includes('otherLocales'),
      'the header must not hand-roll a second switcher beside the component',
    ).toBe(false);
  });

  it('ships no JavaScript, because the homepage ships none', () => {
    const src = source(SWITCHER);
    expect(src).toContain('<details');
    expect(
      /<script/.test(src),
      'a language switcher is exactly the control someone needs when ' +
        'something else has already failed',
    ).toBe(false);
  });
});

describe('binary-locale assumptions still outstanding after #21', () => {
  it('the handover has exactly one destination', () => {
    // io-ui.ts takes otherLocales(locale)[0]. Stage 3 replaces it with a
    // picker; until then a third locale would silently choose for the teacher.
    expect(
      LOCALES.length,
      'the handover picks otherLocales(locale)[0] — build the locale picker ' +
        '(#21 Stage 3) before adding a locale',
    ).toBe(2);
  });

  it('the default locale is the one served without a prefix', () => {
    expect(DEFAULT_LOCALE).toBe(LOCALES[0]);
    expect(otherLocales(DEFAULT_LOCALE)).not.toContain(DEFAULT_LOCALE);
  });
});
