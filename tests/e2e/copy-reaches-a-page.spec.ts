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

/**
 * Every built page, and the locales the bilingual 404 answers in.
 *
 * The corpus is the WHOLE of `dist/`, not one locale's directory. That was the
 * first version and it was wrong: `src/pages/404.astro` is deliberately
 * bilingual -- Cloudflare Pages serves that one file for ANY unknown path, so
 * answering in both languages is the only thing correct regardless of how the
 * host resolves a miss. Grouping by directory filed `dist/404.html` under
 * English alone, so the Indonesian copy inside it was invisible while checking
 * `id`, and the guard invented a defect that did not exist.
 *
 * The claim being tested is "every string reaches A PAGE". Scoping the search
 * per directory quietly tested something narrower and stricter than that.
 */
const BUILT_PAGES = filesUnder('dist', (path) => /\.html$/.test(path));

/**
 * Rendered text of every built page, entity-decoded and whitespace-flattened.
 *
 * Both normalisations are load-bearing. An apostrophe is served as `&#39;`, so
 * "what you're building" never matches the source string raw; and HTML wraps
 * freely, so a sentence can be split across lines between any two words.
 */
const RENDERED = BUILT_PAGES.map((path) => readFileSync(path, 'utf8'))
  .join('\n')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ');

const decode = (text: string) =>
  text
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

const RENDERED_404 = () => decode(readFileSync('dist/404.html', 'utf8'));

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
    paths: ['notFound.title', 'notFound.description'],
    why:
      'A document has ONE <title> and one meta description, and the 404 ' +
      'writes both in the default locale. Every other language it answers in ' +
      'renders its heading, body and link but never its title. Structural, ' +
      'not drift: SiteStrings is derived from siteEn, so every locale must ' +
      'define every key whether or not a given page can use it. That the ' +
      'heading/body/link entries are GONE from this list is #104 shipping -- ' +
      'the reverse-check below failed them the moment the 404 started ' +
      'answering in all five, which is what forced their removal.',
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

/**
 * The 404 answers in every language the site claims to serve.
 *
 * Asserted ABSOLUTELY against LOCALES, never derived from the page itself: a
 * rule that reads which languages the 404 happens to speak, and then excuses
 * exactly those, cannot notice one going missing. It would auto-excuse the
 * drift it exists to catch.
 *
 * That drift is real and shipped. The page was written when LOCALES was en+id,
 * #22 added zh, vi and th, and nothing connected the two -- so a Chinese,
 * Vietnamese or Thai visitor who mistypes a URL is answered in English and
 * Indonesian. Cloudflare Pages serves this ONE file for any unknown path, so
 * this page is the only place that can be fixed.
 */
test.describe('the 404 answers in every locale', () => {
  const page404 = 'dist/404.html';

  for (const locale of LOCALES) {
    test(`${locale}: the 404 speaks it`, () => {
      const t = getSiteStrings(locale).notFound;
      const served = RENDERED_404();
      for (const [key, value] of [
        ['heading', t.heading],
        ['body', t.body],
        ['backHome', t.backHome],
      ] as const)
        expect(
          served.includes(flat(value)),
          `${page404} does not carry notFound.${key} in ${locale}`,
        ).toBe(true);
    });
  }

  test('every language it answers in is marked with its own lang', () => {
    // Without `lang`, a screen reader reads Bahasa Indonesia with English
    // pronunciation rules. The default locale is carried by the document.
    //
    // Anchored to the SECTION HEADING, not to `lang="xx"` anywhere on the
    // page. The first version searched the whole file and passed with zh, vi
    // and th entirely absent from the content: the language switcher renders
    // `<a hreflang="zh" lang="zh">` for every alternative, so every locale's
    // lang attribute is already present on every page. It was satisfied by the
    // navigation while the thing it names was missing.
    const raw = readFileSync(page404, 'utf8');
    for (const locale of PREFIXED_LOCALES)
      expect(
        new RegExp(`<h2[^>]*lang="${locale}"`).test(raw),
        `the 404 has no <h2 lang="${locale}"> section heading`,
      ).toBe(true);
  });
});

test.describe('every site string reaches a built page', () => {
  for (const locale of LOCALES) {
    test(`${locale}: no defined copy renders nowhere`, () => {
      expect(
        BUILT_PAGES.length,
        'no built pages — the scan below would pass vacuously',
      ).toBeGreaterThan(0);

      const missing: string[] = [];
      const wronglyAllowed: string[] = [];
      const seen = new Set<string>();

      for (const [path, value] of leaves(getSiteStrings(locale))) {
        const needle = flat(value);
        if (!needle) continue;
        const key = `${locale}:${path}`;
        seen.add(key);
        const present = RENDERED.includes(needle);
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
