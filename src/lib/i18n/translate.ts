import type { MvpLocale } from './metadata';

/**
 * The decisions the DeepL harness makes, with no I/O in sight.
 *
 * `scripts/i18n-translate.mjs` reads files, calls the API and writes the
 * result; everything it has to be RIGHT about is here, where it can be tested
 * without a key, without a network, and without spending a character of a
 * free-tier quota. Same split CLAUDE.md already requires of `gloryPoints.ts`
 * and `grouping.ts` against the page scripts.
 *
 * Built and NOT run — #21 Stage 5, operator instruction 2026-09-09. No
 * translation is committed by this stage; #22 is what runs it.
 *
 * This module is CLI-only and must stay out of the browser bundle, which
 * `tests/unit/translate.test.ts` asserts by scanning `src/` for importers.
 */

/**
 * DeepL's two hosts, and why the key decides.
 *
 * A Free-plan key ends `:fx` and is REJECTED by `api.deepl.com` — a 403, not
 * a redirect and not a failover. Getting this wrong is a whole run that
 * translates nothing and looks like an auth problem.
 */
const FREE_HOST = 'https://api-free.deepl.com';
const PRO_HOST = 'https://api.deepl.com';
const FREE_KEY_SUFFIX = ':fx';

/**
 * The endpoint for a given key. Never the key itself.
 *
 * DeepL authenticates with an `Authorization: DeepL-Auth-Key` header, so the
 * key has no business in a URL — a URL reaches logs, CI output and the text
 * of any error thrown around it, and this is the one place it could leak by
 * accident.
 *
 * Trimmed before the suffix test: `DEEPL_API_KEY=abc:fx` read from a real
 * `.env.local` carries a trailing newline, and `endsWith(':fx')` is false for
 * `'abc:fx\n'` — a Free key quietly sent to the paid host.
 */
export function deeplEndpoint(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) {
    // Deliberately says nothing about the value it was given.
    throw new Error(
      'DEEPL_API_KEY is empty — set it in .env.local (Free plan keys end :fx)',
    );
  }
  const host = key.endsWith(FREE_KEY_SUFFIX) ? FREE_HOST : PRO_HOST;
  return `${host}/v2/translate`;
}

/**
 * What DeepL calls each of our languages.
 *
 * Variants are named rather than left to a default. `EN` resolves to American
 * English at DeepL and this site is British throughout (CLAUDE.md; `en_GB` in
 * LOCALE_METADATA). `ZH` is Simplified today, and the ticket asks for
 * Simplified — `ZH-HANS` says so rather than relying on that staying true.
 */
const DEEPL_LANGUAGE: Record<MvpLocale, string> = {
  en: 'EN-GB',
  id: 'ID',
  zh: 'ZH-HANS',
  vi: 'VI',
  th: 'TH',
};

export const deeplLanguage = (locale: MvpLocale): string =>
  DEEPL_LANGUAGE[locale];

/**
 * The locales the harness will accept as a target, READ OFF the table above.
 *
 * Not a second copy of `MVP_LOCALES`. `DEEPL_LANGUAGE` is typed
 * `Record<MvpLocale, string>`, so a locale missing from it is a type error and
 * a locale added to it that is not an MvpLocale is too — the keys cannot drift
 * from the source list, and `tests/unit/translate.test.ts` checks the pair
 * anyway.
 *
 * It exists because `scripts/i18n-translate.mjs` runs under plain Node, which
 * will not resolve `metadata.ts`'s own extensionless `'./index'` import. This
 * module imports `MvpLocale` as a TYPE, which is stripped, so it loads on its
 * own — and the script gets the list without a build step.
 */
export const TRANSLATABLE_LOCALES = Object.keys(DEEPL_LANGUAGE) as MvpLocale[];

/**
 * Never sent to a translator, in any language.
 *
 * Two kinds of thing: names, which are the same word everywhere, and legal
 * facts, which are not copy at all. A translated company number is a wrong
 * company number, and "Glory Points" is the name of a feature a teacher will
 * look for in the interface — translating it in the docs and not in the UI is
 * how a term stops matching itself.
 *
 * DeepL honours these through its `ignore_tags` / glossary features; the
 * script wraps each occurrence before sending. The list is here so it is
 * reviewable in one place rather than spread through the caller.
 */
export const DO_NOT_TRANSLATE: readonly string[] = [
  'Shyden',
  'Shyden Ltd',
  'ShyTalk',
  'Glory Points',
  // The registered company number and office, as the footer states them. A
  // legal fact, and wrong the moment it is "translated".
  '17110487',
  'England and Wales',
];

/** A letter in any script — Latin, Han, Thai. Not a digit and not punctuation. */
const HAS_A_LETTER = /\p{L}/u;

/**
 * Whether a catalogue entry is something a translator can take.
 *
 * Three things are excluded, each for its own reason:
 *
 * - **Functions.** Every parameterised message in the catalogues is an arrow
 *   function (`ioHandoverSent`, all of `errors`). A translator returns prose,
 *   not a function body. These are copied verbatim and reported for a human.
 * - **Empty strings**, which have nothing to translate.
 * - **Punctuation and symbols.** `rosterColNumber` is `#` and `—` is a dash;
 *   neither carries a language, and both are already accepted as legitimately
 *   identical in `tests/unit/i18n.test.ts`. Sending them wastes quota and
 *   invites a translator to "helpfully" change them.
 */
export const needsTranslation = (value: unknown): boolean =>
  typeof value === 'string' && HAS_A_LETTER.test(value);

/**
 * Every key the harness cannot do itself, as a dotted path.
 *
 * The point of the report: a machine-translated catalogue that silently
 * carries English function bodies looks complete. This names them, so the
 * gap is a list somebody works through rather than a discovery months later.
 *
 * Paths match the shape `tests/unit/i18n.test.ts` already reports
 * (`errors.TOO_MANY_STUDENTS`, `list[0]`), so a name from one is a name in
 * the other.
 */
export function untranslatedKeys(table: unknown, path = ''): string[] {
  if (Array.isArray(table))
    return table.flatMap((v, i) => untranslatedKeys(v, `${path}[${i}]`));
  if (table && typeof table === 'object')
    return Object.entries(table).flatMap(([k, v]) =>
      untranslatedKeys(v, path ? `${path}.${k}` : k),
    );
  return needsTranslation(table) ? [] : [path];
}
