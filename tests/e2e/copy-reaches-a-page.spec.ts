import { test, expect } from './fixtures';
import { readFileSync } from 'node:fs';
import {
  LOCALES,
  PREFIXED_LOCALES,
  DEFAULT_LOCALE,
  getSiteStrings,
} from '../../src/lib/i18n/index';
import type { Locale } from '../../src/lib/i18n/index';
import { filesUnder } from '../source-files';

/**
 * Site copy that reaches no page -- measured against the BUILT BYTES.
 *
 * `dead-copy.test.ts` already asks whether a key is REFERENCED, with
 * `new RegExp('\\.' + key + '\\b')` over source. That catches a key nothing
 * mentions. It cannot catch a key that is mentioned and renders nowhere, and
 * the difference is not theoretical: suppressing the footer notice with a
 * one-word edit (`betaNotice && (` -> `false && (`) removed it from every page
 * in every locale and left that suite green, because the frontmatter still
 * *wrote* `t.language.betaNotice`. Its block is titled "every translated
 * string reaches a page"; it could only measure mention. See #99.
 *
 * Here rather than in `tests/unit/`, for one reason: `playwright.config.ts`
 * runs `npm run build` before every run, so `dist/` is guaranteed FRESH. A
 * unit test would read whatever build happened to be on disk, and a check that
 * passes against a stale artefact is the same defect wearing different
 * clothes.
 *
 * SITE copy only. `en.ts` holds tool strings that `roster-ui.ts` and friends
 * inject at runtime, so they are correctly absent from static HTML;
 * `dead-copy.test.ts` keeps the reference check for those, and the error and
 * warning channels have renderer-specific guards of their own.
 */

/** Every built page, grouped by the locale whose directory it sits in. */
const PAGES_BY_LOCALE = (() => {
  const html = filesUnder('dist', (path) => /\.html$/.test(path));
  const prefixes = PREFIXED_LOCALES.map((l) => `dist/${l}/`);
  const table = {} as Record<Locale, string[]>;
  for (const locale of LOCALES)
    table[locale] = html.filter((path) =>
      locale === 'en'
        ? !prefixes.some((p) => path.startsWith(p))
        : path.startsWith(`dist/${locale}/`),
    );
  return table;
})();

/**
 * Rendered text of a locale's pages, entity-decoded and whitespace-flattened.
 *
 * Both normalisations are load-bearing. An apostrophe is served as `&#39;`, so
 * "what you're building" never matches the source string raw; and HTML wraps
 * freely, so a sentence can be split across lines between any two words.
 */
const renderedText = (locale: Locale) =>
  PAGES_BY_LOCALE[locale]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Every string leaf in a copy table, as `dotted.path` -> value. */
const leaves = (node: unknown, prefix = ''): Array<[string, string]> => {
  if (typeof node === 'string') return [[prefix, node]];
  if (Array.isArray(node))
    return node.flatMap((v, i) => leaves(v, `${prefix}[${i}]`));
  if (node && typeof node === 'object')
    return Object.entries(node).flatMap(([k, v]) =>
      leaves(v, prefix ? `${prefix}.${k}` : k),
    );
  // Functions interpolate at runtime and have no fixed rendered form.
  return [];
};

/**
 * Copy that is DELIBERATELY absent from a locale's pages, and why.
 *
 * Rules, not a list of keys: 40 hand-written `locale:path` entries would break
 * the same "derive, don't list" rule this guard exists to enforce, and would
 * miss the next locale on the day it is added.
 *
 * Policed in BOTH directions, because an allowlist is a guard too:
 *
 *   - an entry whose copy turns out to be rendered fails, so a silenced
 *     finding cannot outlive the thing that justified it;
 *   - an entry naming a path that is not a real key fails, so a typo or a
 *     renamed key cannot leave a rule quietly matching nothing.
 *
 * Without the second, the allowlist becomes the place strings go to die.
 */
const ABSENCE_RULES: ReadonlyArray<{
  locales: readonly Locale[];
  paths: readonly string[];
  why: string;
}> = [
  {
    locales: LOCALES,
    paths: [
      'glory.errors.empty',
      'glory.errors.notWhole',
      'glory.errors.zero',
      'glory.errors.tooLarge',
    ],
    why:
      'Validation messages the Glory Points script writes into the DOM in ' +
      'response to a bad input. Absent from static HTML by design, in every ' +
      'locale; dead-copy.test.ts keeps the reference check for them.',
  },
  {
    locales: PREFIXED_LOCALES,
    paths: [
      'notFound.title',
      'notFound.description',
      'notFound.heading',
      'notFound.body',
      'notFound.backHome',
    ],
    why:
      'TRACKED IN #104. Only `dist/404.html` is built and it is English, so ' +
      'these translations reach nobody -- an Indonesian visitor who mistypes ' +
      'a URL gets an English 404, on production, today. Left visible here ' +
      'rather than deleted: these entries FAIL the day #104 ships, which ' +
      'forces their own removal.',
  },
  {
    locales: [DEFAULT_LOCALE],
    paths: ['language.betaNotice'],
    why:
      'English is the one locale Shyden Ltd can confirm verified, so its ' +
      'pages carry no beta notice at all; only the four translations of that ' +
      'sentence are ever served. See #96. NOTE the sibling `betaLabel` is ' +
      'deliberately NOT listed here: an English page badges the four beta ' +
      'alternatives in its switcher, and a badge is labelled in the language ' +
      'of the PAGE, so the English label does render. That correction came ' +
      'from this rule failing its own reverse-check, not from review.',
  },
];

const ALLOWED = new Map<string, string>(
  ABSENCE_RULES.flatMap((rule) =>
    rule.locales.flatMap((locale) =>
      rule.paths.map((path) => [`${locale}:${path}`, rule.why] as const),
    ),
  ),
);

test.describe('every site string reaches a built page', () => {
  for (const locale of LOCALES) {
    test(`${locale}: no defined copy renders nowhere`, () => {
      expect(
        PAGES_BY_LOCALE[locale].length,
        `${locale} built no pages — the scan below would pass vacuously`,
      ).toBeGreaterThan(0);

      const haystack = renderedText(locale);
      const missing: string[] = [];
      const wronglyAllowed: string[] = [];
      const seen = new Set<string>();

      for (const [path, value] of leaves(getSiteStrings(locale))) {
        const needle = flat(value);
        if (!needle) continue;
        const key = `${locale}:${path}`;
        seen.add(key);
        const present = haystack.includes(needle);
        if (ALLOWED.has(key)) {
          if (present) wronglyAllowed.push(key);
        } else if (!present) {
          missing.push(`${key} = ${JSON.stringify(needle.slice(0, 60))}`);
        }
      }

      // An allowlist entry naming a key that no longer exists silences
      // nothing and hides that it silences nothing.
      const phantom = [...ALLOWED.keys()].filter(
        (key) => key.startsWith(`${locale}:`) && !seen.has(key),
      );

      expect(
        missing,
        `${locale}: defined copy that no built page renders`,
      ).toEqual([]);
      expect(
        wronglyAllowed,
        'allowlisted as deliberately absent, but rendered — remove the entry',
      ).toEqual([]);
      expect(
        phantom,
        'allowlisted key does not exist in the copy table — stale rule',
      ).toEqual([]);
    });
  }
});
