import { DEFAULT_LOCALE } from './index';

/**
 * Everything that differs per language, in one table.
 *
 * Five separate places used to decide what a locale meant, each with its own
 * `lang === 'id' ? … : …`: the strings table, `og:locale`, the number
 * formatter, the switcher label and the handover. Every one of them was
 * correct for two locales and silently wrong for a third — `og:locale` would
 * have announced a Chinese page as `en_GB`, and `toLocaleString` would have
 * grouped Thai digits as British English. Neither is an error; both are
 * defaults that quietly stop matching reality, which is why no test caught
 * them and why they are gathered here instead.
 */

/**
 * The five MVP languages, deliberately WIDER than `LOCALES`.
 *
 * Metadata for all five ships now while only `en` and `id` are routed. That is
 * what makes #22 a data change: adding `zh` to LOCALES must mean flipping which
 * locales are served, never writing new metadata code.
 */
export const MVP_LOCALES = ['en', 'id', 'zh', 'vi', 'th'] as const;
export type MvpLocale = (typeof MVP_LOCALES)[number];

/** The country whose flag stands in for a language in the switcher. */
export type FlagCode = 'gb' | 'id' | 'cn' | 'vn' | 'th';

export interface LocaleMetadata {
  /**
   * The language's own name for itself.
   *
   * A picker listing "Chinese" in English is useless to the person who needs
   * it — they are looking for 中文. This is the label, and the flag beside it
   * is only a visual anchor, because a flag is a country and not a language.
   */
  readonly nativeName: string;
  readonly flag: FlagCode;
  /** `<meta property="og:locale">`, in language_TERRITORY form. */
  readonly ogLocale: string;
  /** BCP-47 tag for `Intl` / `toLocaleString`. */
  readonly numberLocale: string;
}

export const LOCALE_METADATA: Record<MvpLocale, LocaleMetadata> = {
  en: {
    nativeName: 'English',
    // GB rather than US: Shyden Ltd is registered in England & Wales and the
    // site is shyden.co.uk. The copy is British English throughout.
    flag: 'gb',
    ogLocale: 'en_GB',
    numberLocale: 'en-GB',
  },
  id: {
    nativeName: 'Bahasa Indonesia',
    flag: 'id',
    ogLocale: 'id_ID',
    numberLocale: 'id-ID',
  },
  zh: {
    nativeName: '中文',
    // Simplified Chinese, so the PRC flag. Operator decision, #21, 2026-09-09.
    flag: 'cn',
    ogLocale: 'zh_CN',
    numberLocale: 'zh-CN',
  },
  vi: {
    nativeName: 'Tiếng Việt',
    flag: 'vn',
    ogLocale: 'vi_VN',
    numberLocale: 'vi-VN',
  },
  th: {
    nativeName: 'ไทย',
    flag: 'th',
    ogLocale: 'th_TH',
    numberLocale: 'th-TH',
  },
};

/**
 * Every served locale's own name for itself, in `MVP_LOCALES` order.
 *
 * Derived rather than listed so the homepage marquee cannot name a language
 * the site does not serve, and cannot fall behind one that is added. The
 * approved Aurora artifact writes the list by hand (#17).
 */
export const localeNativeNames = (): string[] =>
  MVP_LOCALES.map((locale) => LOCALE_METADATA[locale].nativeName);

export const isMvpLocale = (value: unknown): value is MvpLocale =>
  typeof value === 'string' &&
  (MVP_LOCALES as readonly string[]).includes(value);

/**
 * Metadata for a locale, falling back to the default rather than throwing.
 *
 * Astro hands a component whatever the URL contained. A page that 500s because
 * someone typed `/xx/` is worse than one that renders in English.
 */
export const metadataFor = (locale: unknown): LocaleMetadata =>
  isMvpLocale(locale)
    ? LOCALE_METADATA[locale]
    : LOCALE_METADATA[DEFAULT_LOCALE];
