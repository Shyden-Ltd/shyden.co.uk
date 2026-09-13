import type { MvpLocale } from './metadata';
// With its extension: the DeepL scripts load this module under plain Node,
// which resolves nothing without one.
import {
  describeMessage,
  isMessageTemplate,
  parseMessage,
  type MessagePart,
} from './message.ts';

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
 * A slot in a sentence sent for translation: `{names}`, `{n}`.
 *
 * Wrapped in the tag DeepL is told to ignore, exactly like a protected term:
 * the translator moves the placeholder to wherever its sentence needs it and
 * hands it back unchanged, and `unprotectTerms` takes the tag off again.
 */
const SLOT = /\{[A-Za-z_][A-Za-z0-9_]*\}/g;

export const protectSlots = (text: string): string =>
  text.replace(SLOT, (slot) => `<${PROTECT_TAG}>${slot}</${PROTECT_TAG}>`);

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
    text: texts.map((t) => protectSlots(protectTerms(escapeXml(t)))),
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
 * - **Anything that is not a string.** A function is code, and a translator
 *   returns prose, not a function body. No catalogue holds one since #136:
 *   every parameterised message is a template string, sent as the sentences
 *   it can say (`translationUnits`).
 * - **Empty strings**, which have nothing to translate.
 * - **Punctuation and symbols.** `rosterColNumber` is `#` and `—` is a dash;
 *   neither carries a language, and both are already accepted as legitimately
 *   identical in `tests/unit/i18n.test.ts`. Sending them wastes quota and
 *   invites a translator to "helpfully" change them.
 */
export const needsTranslation = (value: unknown): value is string =>
  typeof value === 'string' && HAS_A_LETTER.test(value);

/**
 * Every key the harness cannot do itself, as a dotted path.
 *
 * The point of the report: a machine-translated catalogue that silently
 * carries copy nobody translated looks complete. This names those keys, so
 * the gap is a list somebody works through rather than a discovery months
 * later.
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

/**
 * What the harness sends for one catalogue entry: copy as it is, a message as
 * the sentences it can say, and nothing for a symbol or a non-string.
 */
export function translationUnits(value: unknown): string[] {
  if (!needsTranslation(value)) return [];
  return isMessageTemplate(value) ? messageUnits(value) : [value];
}

/**
 * A message as a translator can take it, and how it is put back. #136.
 *
 * Template syntax is not prose: sent whole, DeepL translates "other", moves
 * the braces and returns something no parser accepts. So a message is sent as
 * the whole sentences it can say, every slot a `{name}` placeholder, and
 * rebuilt around the translations that come back.
 *
 * - A plural is sent as its "other" sentence, with `#` written as the slot it
 *   counts. Every language drafted so far has "other" alone, and
 *   `assembleMessage` refuses one that has more.
 * - A choice (`select`) is sent as one whole sentence per branch, so each
 *   reaches the translator with its context rather than as a fragment.
 *
 * A message making more than one choice, or a plural with an exact-match
 * branch (`=0`), is refused. Neither occurs in the catalogues, and a guess at
 * how to rebuild one would be a draft nobody could trust.
 */
export const messageUnits = (template: string): string[] => [
  ...draft(template).sentences,
];

/**
 * The message in the target language, rebuilt from its translated sentences.
 *
 * Checked, never trusted: a translation that drops `{names}` still reads as a
 * good sentence, just without the pupils in it. Throws when a sentence has no
 * translation, when a translation fills different slots from its sentence
 * (lost, invented or repeated), when it is not a template at all, and when the
 * language has plural forms beyond "other" that a draft cut from "other" would
 * get wrong. `pluralCategories` is the language's `Intl.PluralRules`
 * categories, passed in so this stays a function of its arguments.
 */
export function assembleMessage(
  template: string,
  translationOf: (sentence: string) => string | undefined,
  pluralCategories: readonly string[],
): string {
  if (
    describeMessage(template).plurals.length > 0 &&
    pluralCategories.join() !== 'other'
  )
    throw new Error(
      `${JSON.stringify(template)}: the language has the plural forms ${[...pluralCategories].sort().join(', ')}, and a draft cut from "other" alone would be wrong for the rest`,
    );
  const { choice, sentences } = draft(template);
  const translated = sentences.map((sentence) => {
    const translation = translationOf(sentence);
    if (translation === undefined)
      throw new Error(`no translation for ${JSON.stringify(sentence)}`);
    const expected = slotsFilled(sentence);
    const actual = slotsFilled(translation);
    if (actual !== expected)
      throw new Error(
        `${JSON.stringify(sentence)} came back as ${JSON.stringify(translation)}, which fills the slots {${actual}} instead of {${expected}}`,
      );
    return translation;
  });
  if (!choice) return translated[0];
  return `{${choice.name}, select, ${choice.keys
    .map((key, index) => `${key} {${translated[index]}}`)
    .join(' ')}}`;
}

interface Draft {
  /** The choice the sentences were cut from, when the message makes one. */
  readonly choice?: { readonly name: string; readonly keys: readonly string[] };
  readonly sentences: readonly string[];
}

function draft(template: string): Draft {
  const parts = collapsePlurals(parseMessage(template), template);
  const choices = countChoices(parts);
  if (choices > 1)
    throw new Error(
      `${JSON.stringify(template)} makes ${choices} choices of sentence, and a translation can be drafted for one select only`,
    );
  const at = parts.findIndex((part) => part.kind === 'select');
  const choice = parts[at];
  if (at === -1 || choice.kind !== 'select')
    return { sentences: [sentenceOf(parts, template)] };
  const before = parts.slice(0, at);
  const after = parts.slice(at + 1);
  return {
    choice: { name: choice.name, keys: [...choice.branches.keys()] },
    sentences: [...choice.branches.values()].map((branch) =>
      sentenceOf([...before, ...branch, ...after], template),
    ),
  };
}

/** The parts a translation needs: every plural cut to its "other" sentence. */
function collapsePlurals(
  parts: readonly MessagePart[],
  template: string,
  counting?: string,
): MessagePart[] {
  return parts.flatMap((part): MessagePart[] => {
    switch (part.kind) {
      case 'text':
      case 'value':
        return [part];
      case 'count':
        if (counting === undefined)
          throw new Error(`${JSON.stringify(template)}: "#" outside a plural`);
        return [{ kind: 'value', name: counting }];
      case 'plural': {
        const exact = [...part.branches.keys()].filter((key) =>
          key.startsWith('='),
        );
        const other = part.branches.get('other');
        if (exact.length > 0 || !other)
          throw new Error(
            `${JSON.stringify(template)}: {${part.name}} has the exact-match branch ${exact.join(', ')}, which a sentence drafted from "other" cannot carry`,
          );
        return collapsePlurals(other, template, part.name);
      }
      case 'select':
        return [
          {
            ...part,
            branches: new Map(
              [...part.branches].map(
                ([key, branch]): [string, MessagePart[]] => [
                  key,
                  collapsePlurals(branch, template, counting),
                ],
              ),
            ),
          },
        ];
    }
  });
}

/** How many choices of sentence a message makes, nested ones included. */
const countChoices = (parts: readonly MessagePart[]): number =>
  parts.reduce(
    (total, part) =>
      part.kind === 'select'
        ? total +
          1 +
          [...part.branches.values()].reduce(
            (sum, branch) => sum + countChoices(branch),
            0,
          )
        : total,
    0,
  );

/** A message with no plural and no choice left, as the sentence it says. */
function sentenceOf(parts: readonly MessagePart[], template: string): string {
  return parts
    .map((part) => {
      if (part.kind === 'text') return part.text;
      if (part.kind === 'value') return `{${part.name}}`;
      throw new Error(
        `${JSON.stringify(template)}: a ${part.kind} is left in a drafted sentence`,
      );
    })
    .join('');
}

/** Every slot a sentence fills, repeats included, in a comparable order. */
const slotsFilled = (text: string): string =>
  parseMessage(text)
    .flatMap((part) =>
      part.kind === 'text'
        ? []
        : [part.kind === 'value' ? part.name : `(${part.kind})`],
    )
    .sort()
    .join(', ');
