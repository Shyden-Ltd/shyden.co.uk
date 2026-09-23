import type { BackTranslationUnit } from './back-translate.ts';
import { partsOf, wordsOf } from './label-check.ts';
import type { Locale } from './locales.ts';

/**
 * Copy that names one of the tool's features, checked against the words the
 * tool's own labels use for that feature (#319).
 *
 * #161 checked each short label against its locale's sentences. This turns the
 * check round: every piece of copy whose English names a feature -- a
 * sentence or a label -- must carry one of the words its locale approved for
 * that feature. The pin messages showed why. `warnings.PINNED_MIXED_SEX` told
 * a teacher "that is what the pin asked for" as "what the tag asked for" in
 * zh, "the request in the post" in vi, and "what the pin's description says"
 * in th, with a transliteration that also means a PIN code. Each was
 * translated, non-blank and slot-perfect, so every structural guard passed it,
 * and a warning explained in the wrong words cannot be acted on.
 *
 * The approved words are the ones the feature's labels use, in the forms the
 * language inflects them into (operator decision on #319, 2026-09-23): vi may
 * say `tách biệt` like the roster column or `khác nhóm` like the Keep apart
 * control. A pin has no control yet, so its one word per locale was approved
 * on its own, and a future pin control is held to it.
 *
 * What it cannot see: copy that carries an approved word once and a wrong
 * word elsewhere. A count was tried and rejected, because a prefix changes an
 * Indonesian root (`pisah` becomes `memisahkan`) and the count then flags
 * correct copy. Chinese and Thai do not separate words with spaces, so an
 * approved word is looked for anywhere in the rendering, as `checkLabels` does.
 *
 * CLI-only, like the `back-translate.ts` it reads its units from.
 */

/** A feature of the classroom-groups tool that its copy names. */
export type FeatureTerm = 'pin' | 'together' | 'apart' | 'absent' | 'group';

/**
 * How English copy names each feature: as a whole word, in every form the
 * catalogues use. Each is matched against the English with its slots and
 * punctuation removed, so `{absent}` is a placeholder and not a use, and
 * "keeping" is not a pin.
 */
export const FEATURE_TERMS: Readonly<Record<FeatureTerm, RegExp>> = {
  pin: /\b(?:un)?pin(?:s|ned|ning)?\b/,
  together: /\btogether\b/,
  apart: /\bapart\b/,
  absent: /\babsen(?:t|ces?)\b/,
  group: /\bgroup(?:s|ed|ings?)?\b/,
};

/** The words a locale may use for each feature, as the operator approved them. */
export type Glossary = Readonly<Record<FeatureTerm, readonly string[]>>;

/** A piece of copy that names a feature without an approved word for it. */
export interface TermMiss extends BackTranslationUnit {
  /** Every feature the English names and the rendering does not, in `FEATURE_TERMS` order. */
  readonly missing: readonly FeatureTerm[];
}

const FEATURES = Object.keys(FEATURE_TERMS) as FeatureTerm[];

/** The features a piece of English copy names, in `FEATURE_TERMS` order. */
export function featuresNamed(english: string): FeatureTerm[] {
  const words = wordsOf(english, 'en');
  return FEATURES.filter((feature) => FEATURE_TERMS[feature].test(words));
}

/**
 * Every unit in `units` whose English names a feature its rendering carries no
 * approved word for. Pass one locale's units, from `backTranslationUnits`,
 * with that locale's glossary.
 */
export function checkFeatureTerms(
  units: readonly BackTranslationUnit[],
  locale: Locale,
  glossary: Glossary,
): TermMiss[] {
  // An approved word must carry every one of its parts. `[].every` is true,
  // so a word left with no parts approves nothing rather than everything.
  const approved = new Map(
    FEATURES.map((feature) => [
      feature,
      glossary[feature].map((word) => partsOf(word, locale)),
    ]),
  );
  const carries = (text: string, feature: FeatureTerm) =>
    (approved.get(feature) ?? []).some(
      (parts) => parts.length > 0 && parts.every((part) => text.includes(part)),
    );
  return units.flatMap((one) => {
    const text = wordsOf(one.translation, locale);
    const missing = featuresNamed(one.english).filter(
      (feature) => !carries(text, feature),
    );
    return missing.length === 0 ? [] : [{ ...one, missing }];
  });
}
