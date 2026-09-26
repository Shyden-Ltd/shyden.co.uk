import { test, expect } from './fixtures';
import { readFileSync } from 'node:fs';
import {
  LOCALES,
  PREFIXED_LOCALES,
  DEFAULT_LOCALE,
  getSiteStrings,
} from '../../src/lib/i18n/index';
import type { Locale } from '../../src/lib/i18n/index';
import { filesUnder, searched } from '../source-files';
import { stringLeaves } from '../catalogue-leaves';

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
 * The report form's type-ahead (#97) lists every string its page offers as an
 * `<option value>`, so on a beta page it would satisfy this scan for every
 * string whether or not the page shows it, and the scan would find nothing
 * dead in four of the five languages. Copy counts as rendered only outside
 * it. The liveness check is in the test: every page carrying the form must
 * have had its type-ahead taken out, or a renamed datalist would quietly make
 * the scan lenient again.
 */
const REPORT_TYPE_AHEAD =
  /<datalist id="report-strings"[^>]*>[\s\S]*?<\/datalist>/g;

/**
 * Entity-decoded and whitespace-flattened.
 *
 * Both normalisations are load-bearing. An apostrophe is served as `&#39;`, so
 * "what you're building" never matches the source string raw; and HTML wraps
 * freely, so a sentence can be split across lines between any two words.
 */
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

interface Corpus {
  /** How many built pages were read. */
  pages: number;
  /** How many of them carry the report form. */
  withForm: number;
  /** How many type-aheads were taken out of the scan. */
  typeAheadsRemoved: number;
  /** Rendered text of every built page, type-aheads removed, decoded. */
  rendered: string;
}

let corpus: Corpus | undefined;

/**
 * The whole of `dist/`, read when a test first asks and kept for the rest.
 *
 * Not one locale's directory: that was the first version and it was wrong. `src/pages/404.astro` is deliberately bilingual --
 * Cloudflare Pages serves that one file for ANY unknown path, so answering in
 * both languages is the only thing correct regardless of how the host
 * resolves a miss. Grouping by directory filed `dist/404.html` under English
 * alone, so the Indonesian copy inside it was invisible while checking `id`,
 * and the guard invented a defect that did not exist. The claim being tested
 * is "every string reaches A PAGE"; scoping the search per directory quietly
 * tested something narrower and stricter than that.
 *
 * Never at module scope (#351). Playwright evaluates this file while it
 * COLLECTS, and `scripts/test-e2e.mjs` lists the suite before its web server
 * has built anything, so a module-scope walk made listing the suite depend on
 * a build already being there: on a fresh checkout every filtered run passed
 * its tests and then exited 1 on `ENOENT: scandir 'dist'`.
 * `tests/unit/collection-needs-no-build.test.ts` holds every spec to that.
 * Kept once read because five locale tests share one corpus.
 */
const builtCorpus = (): Corpus => {
  if (corpus) return corpus;
  const raw = filesUnder('dist', (path) => /\.html$/.test(path)).map((path) =>
    readFileSync(path, 'utf8'),
  );
  corpus = {
    pages: raw.length,
    withForm: raw.filter((html) => html.includes('data-report-form')).length,
    typeAheadsRemoved: raw.reduce(
      (count, html) => count + (html.match(REPORT_TYPE_AHEAD)?.length ?? 0),
      0,
    ),
    rendered: decode(
      raw.map((html) => html.replace(REPORT_TYPE_AHEAD, '')).join('\n'),
    ),
  };
  return corpus;
};

const PAGE_404 = 'dist/404.html';

const RENDERED_404 = () => decode(readFileSync(PAGE_404, 'utf8'));

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

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
    paths: Object.keys(getSiteStrings(DEFAULT_LOCALE).report).map(
      (key) => `report.${key}`,
    ),
    why:
      'The translation-report form (#97) renders on the four beta locales ' +
      'only (spec 3.1): English is the verified locale, so its pages offer ' +
      'no form and none of this copy. The beta locales render all of it, ' +
      'outside the type-ahead.',
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
          `${PAGE_404} does not carry notFound.${key} in ${locale}`,
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
    const raw = readFileSync(PAGE_404, 'utf8');
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
      const { pages, withForm, typeAheadsRemoved, rendered } = builtCorpus();
      expect(
        pages,
        'no built pages — the scan below would pass vacuously',
      ).toBeGreaterThan(0);
      expect(
        typeAheadsRemoved,
        'every page with a report form had its type-ahead taken out of the scan',
      ).toBe(withForm);
      expect(withForm, 'no built page carries a report form').toBeGreaterThan(
        0,
      );

      const missing: string[] = [];
      const wronglyAllowed: string[] = [];
      const seen = new Set<string>();

      // Strings only: a message interpolates at runtime and has no fixed
      // rendered form to find.
      const defined = stringLeaves(getSiteStrings(locale));
      for (const [path, value] of defined) {
        const needle = flat(value);
        if (!needle) continue;
        const key = `${locale}:${path}`;
        seen.add(key);
        const present = rendered.includes(needle);
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
        searched(missing, { of: defined, what: `${locale} copy strings` }),
        `${locale}: defined copy that no built page renders`,
      ).toEqual([]);
      expect(
        searched(wronglyAllowed, {
          of: defined,
          what: `${locale} copy strings`,
        }),
        'allowlisted as deliberately absent, but rendered — remove the entry',
      ).toEqual([]);
      expect(
        // `seen`, not `ALLOWED`. An empty allowlist is a legitimate state and
        // rightly reports nothing; an empty `seen` is what makes this
        // judgement meaningless, because then EVERY entry looks phantom.
        searched(phantom, {
          of: [...seen],
          what: `${locale} copy keys examined`,
        }),
        'allowlisted key does not exist in the copy table — stale rule',
      ).toEqual([]);
    });
  }
});
