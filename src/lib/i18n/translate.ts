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
  // The footer's own wording, ampersand and all. This read 'England and
  // Wales' until #22 and therefore matched no string the site ships.
  'England & Wales',
];

/**
 * The tag name DeepL is told to leave alone, in `ignore_tags`.
 *
 * One letter because it travels inside the copy and DeepL bills per
 * character. Defined once and used by both the wrapping and the request, so
 * the two cannot drift -- a request ignoring `<keep>` while the text carried
 * `<x>` would translate the term and look fine.
 */
const PROTECT_TAG = 'x';

/**
 * Protected terms, longest first.
 *
 * `Shyden` is a prefix of `Shyden Ltd`. Wrapping the short one first yields
 * `<x>Shyden</x> Ltd` and hands "Ltd" to the translator on its own, which is
 * how a company name comes back half-translated.
 */
const PROTECTED_LONGEST_FIRST: readonly string[] = [...DO_NOT_TRANSLATE].sort(
  (a, b) => b.length - a.length,
);

const escapeForRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * XML escaping, because the request asks for `tag_handling: 'xml'`.
 *
 * DeepL parses the text as XML when tag handling is on, so a bare `&` is a
 * malformed entity and the whole request comes back `400` -- which is exactly
 * what #22's first run of the widened catalogue did, on the footer's
 * "Registered in England & Wales." Escaping is the fix rather than banning
 * the character: an ampersand is correct English and copy should not bend to
 * a transport detail.
 *
 * `&` first on the way out and last on the way back, or the escaping eats its
 * own output (`&lt;` -> `&amp;lt;`) and the round trip stops being one.
 */
export const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const unescapeXml = (text: string): string =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Wrap every protected term so DeepL returns it untouched.
 *
 * #22 found this missing entirely: `DO_NOT_TRANSLATE` was imported by the
 * script, its LENGTH printed ("do-not-send 6 protected terms"), and the batch
 * sent raw. `ignore_tags: ['x']` rode on every request and no `<x>` was ever
 * emitted, so the list protected nothing. The zh/vi/th run returned "Shyden"
 * intact in all three languages by DeepL's own proper-noun handling -- luck,
 * not a control, and luck that runs out the first time someone writes "Glory
 * Points" into the catalogue. Only one of the six terms occurs in today's
 * copy, which is why nothing looked wrong.
 *
 * The lookbehind stops a shorter term matching inside a span a longer one
 * already wrapped: in `<x>Shyden Ltd</x>`, `Shyden` sits immediately after
 * `<x>` and is skipped.
 */
export function protectTerms(text: string): string {
  let out = text;
  for (const term of PROTECTED_LONGEST_FIRST) {
    // The term is escaped the same way the text was, or a name carrying an
    // ampersand ("England & Wales") never matches the escaped copy it sits in.
    out = out.replace(
      new RegExp(
        `(?<!<${PROTECT_TAG}>)${escapeForRegExp(escapeXml(term))}(?!</${PROTECT_TAG}>)`,
        'g',
      ),
      `<${PROTECT_TAG}>${escapeXml(term)}</${PROTECT_TAG}>`,
    );
  }
  return out;
}

/**
 * Take the tags back out of what DeepL returned.
 *
 * The prose around a protected term changes; the tag survives the round trip
 * verbatim, so stripping it recovers the string a catalogue should hold.
 */
export const unprotectTerms = (text: string): string =>
  text.replace(new RegExp(`</?${PROTECT_TAG}>`, 'g'), '');

/**
 * The exact JSON body of a translate request.
 *
 * Here rather than in the script for the reason every other decision is: this
 * is the thing that has to be RIGHT, and in the script it could only be
 * checked by making a network call. `tests/unit/translate.test.ts` asserts the
 * text it carries is protected -- the assertion that was missing while the
 * list sat unused.
 */
export function buildRequestBody(
  texts: readonly string[],
  target: MvpLocale,
): {
  text: string[];
  source_lang: string;
  target_lang: string;
  ignore_tags: string[];
  tag_handling: string;
} {
  return {
    text: texts.map((t) => protectTerms(escapeXml(t))),
    source_lang: 'EN',
    target_lang: deeplLanguage(target),
    ignore_tags: [PROTECT_TAG],
    tag_handling: 'xml',
  };
}

/**
 * CSV vocabulary keys a translator must never be handed.
 *
 * `sex` holds the two TOKENS a teacher types into a spreadsheet cell -- `M`
 * and `F` in English, `L`/`P` in Indonesian (from laki-laki / perempuan,
 * matching what the roster table shows on the Indonesian page). Sent to DeepL
 * a bare `M` comes back as a guess about a letter, and the tokens carry a
 * cross-file invariant a translator cannot see: they must agree with
 * `rosterSexMale`/`rosterSexFemale` in the same locale's own catalogue, or the
 * file a teacher exports disagrees with the table they exported it from.
 *
 * Everything else in the table is ordinary words -- column headers, `yes`,
 * `no`, the class comment -- and goes through DeepL like any other copy.
 */
export const CSV_KEYS_NOT_TRANSLATED: readonly string[] = ['sex'];

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
