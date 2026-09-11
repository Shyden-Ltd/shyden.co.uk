import { describe, it, expect } from 'vitest';
import { LOCALES } from '../../src/lib/i18n';
import { localeNativeNames } from '../../src/lib/i18n/metadata';

/**
 * The marquee names the languages the site SERVES, derived (#17).
 *
 * The approved artifact writes the list by hand. Deriving it from `LOCALES`
 * means a locale cannot be added without the marquee following, and — the
 * half that matters — the marquee cannot name a language the site does not
 * actually serve. The site-wide rule is that copy never states what anything
 * is available in; a list that can only ever be true is the one form of that
 * claim which cannot go stale into a lie.
 */
describe('the homepage marquee', () => {
  /**
   * A literal pin, deliberately separate from the derivation.
   *
   * `expect(names).toEqual(LOCALES.map(nativeName))` would be green whatever
   * either side said — it asserts the relationship and never the level
   * (#117). These are the actual endonyms, and a change to any of them is a
   * change a person should see in a diff.
   */
  it('names each language as that language names itself', () => {
    expect(localeNativeNames()).toEqual([
      'English',
      'Bahasa Indonesia',
      '中文',
      'Tiếng Việt',
      'ไทย',
    ]);
  });

  it('covers every locale the site serves, and no others', () => {
    expect(localeNativeNames()).toHaveLength(LOCALES.length);
    expect(localeNativeNames().filter((n) => n.trim() !== '')).toHaveLength(
      LOCALES.length,
    );
  });
});
