import { isLabel, type BackTranslationUnit } from './back-translate.ts';
import type { Locale } from './locales.ts';
import type { SiteStrings } from './site.ts';

/**
 * Short labels, checked against how their own locale renders the same English
 * elsewhere (#161).
 *
 * A label of a word or two carries no context, so a translation engine can
 * resolve it to the wrong sense: `vi.rosterColSex` held `Tình dục` -- sexual
 * intercourse -- as a column heading for a month. The locale's SENTENCES had
 * the context and got the same word right: four of them said `giới tính`. So
 * the question asked here is whether a label's rendering appears anywhere the
 * locale uses the label's English, and a label that appears nowhere it could
 * is flagged for a human.
 *
 * Reading the label back into English cannot ask that question. A wrong sense
 * reads back as the same ambiguous word, and #95 measured it: `Tình dục` scored
 * 100 read back as "Sex", and the `Giới tính` that replaced it scored 9.
 *
 * A witness is copy that says MORE than the label: a sentence, or a longer
 * label ("Exit full screen" judges "Full screen"). Copy with exactly the
 * label's English is no witness, because one engine call rendered both from
 * the same bare source and they agree by construction -- before #252 the CSV
 * header repeated `Tình dục`. Such namesakes are compared with each other
 * instead, and one rendered in other words is a variant: the roster and the
 * CSV naming one column two ways.
 *
 * What it cannot see: a label no other copy in its locale uses (`unchecked`),
 * and a wrong rendering that happens to appear inside a longer word of a
 * witness. Chinese and Thai do not separate words with spaces, so a part of a
 * label is looked for anywhere in a witness rather than word by word.
 *
 * CLI-only, like the `back-translate.ts` it reads its units from.
 */

/** How a label compares with the copy that says more than it does. */
export type LabelStatus = 'agrees' | 'disagrees' | 'unchecked';

export interface CheckedLabel extends BackTranslationUnit {
  /**
   * `agrees` when a witness carries every part of the label's rendering,
   * `disagrees` when there are witnesses and none does, and `unchecked` when
   * there is no witness to compare with.
   */
  readonly status: LabelStatus;
  /**
   * Every other piece of the locale's copy whose English uses the label's
   * English and says more, in the order given.
   */
  readonly witnesses: readonly BackTranslationUnit[];
  /**
   * Every other piece of copy with exactly the label's English whose
   * rendering neither holds the label's nor is held by it, in the order given.
   */
  readonly variants: readonly BackTranslationUnit[];
}

/** A message slot, or a run of punctuation and symbols: never a word. */
const NOT_WORDS = /\{[^{}]*\}|[\p{P}\p{S}]+/gu;

/**
 * The parts of a piece of copy that are words: composed, in lower case, split
 * wherever a slot or punctuation stood. `按……划分` is two parts, `按` and
 * `划分`; a witness must carry both.
 */
const partsOf = (text: string, locale: Locale): string[] =>
  text
    .normalize('NFC')
    .toLocaleLowerCase(locale)
    .split(NOT_WORDS)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part !== '');

const wordsOf = (text: string, locale: Locale): string =>
  partsOf(text, locale).join(' ');

/**
 * Whether English copy uses a label's English: as whole words, allowing a
 * plural on the last one. `sex` is in "both sexes" and not in "Essex". The
 * English needs no escaping, because `partsOf` removed every character a
 * regular expression treats specially.
 */
const uses = (english: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])${english}(?:e?s)?(?![\\p{L}\\p{N}])`, 'u');

/**
 * Every label in `units`, checked against every other unit in `units`. Pass
 * one locale's units, from `backTranslationUnits`: a witness is only evidence
 * about the locale it was written in.
 */
export function checkLabels(
  units: readonly BackTranslationUnit[],
  locale: Locale,
): CheckedLabel[] {
  const copy = units.map((one) => ({
    one,
    english: wordsOf(one.english, 'en'),
  }));
  // Whether `outer`'s rendering carries every part of `inner`'s. `[].every`
  // is true, so a rendering left with no words holds nothing and is held by
  // nothing, rather than agreeing with everything.
  const holds = (outer: BackTranslationUnit, inner: BackTranslationUnit) => {
    const parts = partsOf(inner.translation, locale);
    const text = wordsOf(outer.translation, locale);
    return parts.length > 0 && parts.every((part) => text.includes(part));
  };
  return copy
    .filter(({ one }) => isLabel(one.english))
    .map(({ one: label, english }) => {
      const others = copy.filter(({ one }) => one !== label);
      const pattern = uses(english);
      // An empty English would find the lone `s` of a possessive everywhere.
      const witnesses =
        english === ''
          ? []
          : others
              .filter((other) => other.english !== english)
              .filter((other) => pattern.test(other.english))
              .map(({ one }) => one);
      const variants = others
        .filter((other) => other.english === english)
        .map(({ one }) => one)
        .filter((other) => !holds(label, other) && !holds(other, label));
      const status: LabelStatus =
        witnesses.length === 0
          ? 'unchecked'
          : witnesses.some((witness) => holds(witness, label))
            ? 'agrees'
            : 'disagrees';
      return { ...label, status, witnesses, variants };
    });
}

const CHROME = 'the header or footer of every page';

/**
 * The page each section of `site.ts` renders on. Keyed by every section, so
 * a section added without a page here fails to compile.
 */
const SITE_PAGES: Record<keyof SiteStrings, string> = {
  nav: CHROME,
  menuLabel: CHROME,
  skipToContent: CHROME,
  footer: CHROME,
  language: CHROME,
  home: '/',
  glory: '/glory-points',
  notFound: 'the 404 page',
};

/**
 * Where a unit's copy is read, from its key. Unprefixed keys are the
 * classroom-groups catalogue, which only that page reads (`getStrings`).
 */
export function renderedOn(key: string): string {
  if (key.startsWith('csv.')) return 'the CSV file a teacher downloads';
  if (!key.startsWith('site.')) return '/classroom-groups';
  const section = key.slice('site.'.length).split(/[.[ ]/)[0];
  if (!Object.hasOwn(SITE_PAGES, section))
    throw new Error(
      `renderedOn: site.ts has no section "${section}" with a page (${key})`,
    );
  return SITE_PAGES[section as keyof SiteStrings];
}
