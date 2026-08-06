import { en, THEME_KEYS, type Strings, type ThemeKey } from './en';
import { id } from './id';
import { ERROR_CODES, type GroupingError } from '../grouping';

/** English first: it is the default and lives at the unprefixed route. */
export const LOCALES = ['en', 'id'] as const;
export type Locale = (typeof LOCALES)[number];

const TABLE: Record<Locale, Strings> = { en, id };

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/** Unknown or absent locale falls back to English rather than throwing. */
export const getStrings = (locale: unknown): Strings =>
  isLocale(locale) ? TABLE[locale] : en;

/** The path to this tool in a given locale. English is unprefixed. */
export const toolPath = (locale: Locale): string =>
  locale === 'en' ? '/classroom-groups' : `/${locale}/classroom-groups`;

export const otherLocale = (locale: Locale): Locale =>
  locale === 'en' ? 'id' : 'en';

/**
 * The same page in another locale.
 *
 * Every page needs this for its hreflang links and its language switcher, and
 * getting it wrong is the classic i18n bug: a switcher that always dumps the
 * visitor on the homepage instead of the page they were reading. English is
 * unprefixed, so switching is purely adding or removing the `/id` segment.
 */
export function localisePath(pathname: string, target: Locale): string {
  const stripped = pathname.replace(/^\/id(?=\/|$)/, '') || '/';
  if (target === 'en') return stripped;
  return stripped === '/' ? '/id/' : `/id${stripped}`;
}

/** The locale a path belongs to, inferred from its prefix. */
export const localeFromPath = (pathname: string): Locale =>
  /^\/id(\/|$)/.test(pathname) ? 'id' : 'en';

/**
 * A student number, resolved to a label a teacher can read.
 *
 * The engine's errors carry numbers, never names (see `Student.number`'s
 * comment: identity is the number, and `GroupingError`'s `keepApartImpossible`
 * variant carries `students: number[]` for exactly that reason) — grouping.ts
 * has no roster to resolve one from. `renderError` has no roster either by
 * default, so a resolver is how one gets supplied.
 */
export type ResolveStudentLabel = (studentNumber: number) => string;

/**
 * Turn an engine error into a sentence in the page's language.
 *
 * The engine deliberately returns a code plus data instead of prose, so this
 * is the single place a message is composed. The switch is exhaustive over
 * ErrorCode; adding a code without handling it here fails the type check
 * rather than silently rendering the raw code to a teacher.
 *
 * `resolveStudent` turns a `KEEP_APART_IMPOSSIBLE` number into display text.
 * It defaults to the same numbered label an anonymous student already gets
 * elsewhere on the page (`strings.studentNumber`) rather than a second,
 * independent spelling of "Student N" — so a caller that forgets to pass a
 * resolver still gets "Student 1, Student 2 all need to be kept apart…",
 * never bare digits. Stage 2's page passes its own resolver, one that reads
 * the roster and prefers `name ?? studentNumber(n)`, so a teacher who typed
 * names sees them. This keeps the engine pure — `GroupingError` still carries
 * only numbers, and nothing in this module imports grouping.ts's `Student`
 * type — while guaranteeing the default is still a full sentence, not a
 * partial one.
 */
export function renderError(
  error: GroupingError,
  strings: Strings,
  resolveStudent: ResolveStudentLabel = (n) => strings.studentNumber(n),
): string {
  const e = strings.errors;
  switch (error.code) {
    case ERROR_CODES.noStudents:
      return e.NO_STUDENTS;
    case ERROR_CODES.invalidGroupSize:
      return e.INVALID_GROUP_SIZE;
    case ERROR_CODES.invalidGroupCount:
      return e.INVALID_GROUP_COUNT;
    case ERROR_CODES.tooManyGroups:
      return e.TOO_MANY_GROUPS(error.maxGroups);
    // Carries `students: number[]`, exactly like keepApartImpossible below --
    // same reason (identity is the number) and the same fix (resolve each
    // one through `resolveStudent` before the copy ever sees it).
    case ERROR_CODES.togetherApartClash:
      return e.TOGETHER_APART_CLASH(error.students.map(resolveStudent));
    case ERROR_CODES.togetherUnitTooLarge:
      return e.TOGETHER_UNIT_TOO_LARGE(
        error.letter,
        error.unit,
        error.groupSize,
      );
    case ERROR_CODES.togetherNoArrangement:
      return e.TOGETHER_NO_ARRANGEMENT(error.groupsTried);
    case ERROR_CODES.togetherSearchGaveUp:
      return e.TOGETHER_SEARCH_GAVE_UP;
    case ERROR_CODES.tooManyStudents:
      return e.TOO_MANY_STUDENTS(error.maxStudents);
    case ERROR_CODES.duplicateNumber:
      return e.DUPLICATE_NUMBER(error.number);
    case ERROR_CODES.keepApartImpossible:
      return e.KEEP_APART_IMPOSSIBLE(
        error.students.map(resolveStudent),
        error.groupsNeeded,
      );
    case ERROR_CODES.keepApartNoArrangement:
      return e.KEEP_APART_NO_ARRANGEMENT(error.groupsTried);
    case ERROR_CODES.keepApartSearchGaveUp:
      return e.KEEP_APART_SEARCH_GAVE_UP;
    case ERROR_CODES.bothRulesNoArrangement:
      return e.BOTH_RULES_NO_ARRANGEMENT(error.groupsTried);
    case ERROR_CODES.bothRulesSearchGaveUp:
      return e.BOTH_RULES_SEARCH_GAVE_UP;
    // Carries `students: number[]`, exactly like togetherApartClash and
    // keepApartImpossible above -- same reason (identity is the number) and
    // the same fix (resolve each one through `resolveStudent` first).
    case ERROR_CODES.sexNeedsAllSet:
      return e.SEX_NEEDS_ALL_SET(error.students.map(resolveStudent));
  }
}

/** Whether a string off the DOM is one of the themes that actually exist. */
export const isThemeKey = (value: string): value is ThemeKey =>
  (THEME_KEYS as readonly string[]).includes(value);

/** The display name for a group: numbered, or the nth name of a theme. */
export function groupName(
  index: number,
  naming: 'numbered' | 'themed',
  theme: string,
  strings: Strings,
): string {
  // `theme` arrives from a <select> value, so it is a string from the page
  // rather than a key anyone has checked. Numbering is the honest fallback
  // for an unknown one, and the same fallback the theme runs out of names.
  if (naming === 'numbered' || !isThemeKey(theme)) {
    return strings.groupLabel(index + 1);
  }
  const names = strings.themes[theme];
  // More groups than the theme has names: fall back to numbering rather than
  // repeating a name, which would make two groups indistinguishable.
  return names[index] ?? strings.groupLabel(index + 1);
}

export { THEME_KEYS };
export type { Strings, ThemeKey };
