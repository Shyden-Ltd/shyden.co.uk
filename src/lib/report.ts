/**
 * Translation reports (#97). Which strings a page offers a visitor to
 * report, how a quote is matched against them, and the `/api/report`
 * endpoint.
 *
 * ONE HOME (spec 4.2). The footer imports this at build time for its
 * `<datalist>`, and the Pages Functions import it at run time to validate a
 * report, so what is offered and what is accepted cannot drift apart. It is
 * site-safe: it must never import a CLI-only module (`cli-only.test.ts`),
 * and it runs on workerd, so no Node API either.
 */
import { catalogueLeaves } from './catalogue-leaves';
import {
  DEFAULT_LOCALE,
  getSiteStrings,
  localisePath,
  rawCatalogue,
  type Locale,
  type SiteStrings,
} from './i18n';
import {
  isMessageTemplate,
  parseMessage,
  type MessagePart,
} from './i18n/message';

export const PAGE_IDS = ['home', 'glory-points', 'classroom-groups'] as const;
export type PageId = (typeof PAGE_IDS)[number];

export interface ReportForm {
  /** What the `<datalist>` offers: the literal text with each slot as an ellipsis. */
  readonly display: string;
  /** The literal text between slots: one more run than there are slots. */
  readonly runs: readonly string[];
}

export interface ReportableString {
  /** `site.<path>` for site copy, the bare catalogue path for tool copy. */
  readonly key: string;
  readonly forms: readonly ReportForm[];
}

const ELLIPSIS = String.fromCharCode(0x2026);
/** A private-use character: marks a slot inside a form, and never occurs in copy. */
const SLOT = String.fromCodePoint(0xe000);

interface PageEntry {
  readonly route: string;
  /** The site-catalogue section only this page reads. */
  readonly siteSection?: keyof SiteStrings;
  /** Whether the page reads the raw tool catalogue (`getStrings`). */
  readonly toolCatalogue: boolean;
}

/** Spec section 4's table. The facts: HomePage reads `.home`, GloryPointsPage `.glory`, ClassroomGroupsPage `getStrings`. */
const PAGES: Record<PageId, PageEntry> = {
  home: { route: '/', siteSection: 'home', toolCatalogue: false },
  'glory-points': {
    route: '/glory-points',
    siteSection: 'glory',
    toolCatalogue: false,
  },
  'classroom-groups': { route: '/classroom-groups', toolCatalogue: true },
};

/** Only the English-footed 404 renders this, so no form offers it (spec 3.1). */
const NEVER_OFFERED: ReadonlySet<string> = new Set(['notFound']);

export const isPageId = (value: unknown): value is PageId =>
  typeof value === 'string' && (PAGE_IDS as readonly string[]).includes(value);

export function pageIdFromPath(pathname: string): PageId | null {
  const route =
    localisePath(pathname, DEFAULT_LOCALE).replace(/\/+$/, '') || '/';
  return PAGE_IDS.find((page) => PAGES[page].route === route) ?? null;
}

export const pagePath = (page: PageId, locale: Locale): string =>
  localisePath(PAGES[page].route, locale);

/** Chrome: every top-level site entry no single page owns, derived so a new one is offered the day it is added. */
function chromeSections(): string[] {
  const owned = new Set<string>(NEVER_OFFERED);
  for (const page of PAGE_IDS) {
    const section = PAGES[page].siteSection;
    if (section) owned.add(section);
  }
  return Object.keys(getSiteStrings(DEFAULT_LOCALE)).filter(
    (section) => !owned.has(section),
  );
}

/** Every form a template can render, slots as SLOT, one per plural or select branch. */
function slotted(parts: readonly MessagePart[]): string[] {
  let forms = [''];
  for (const part of parts) {
    if (part.kind === 'text') forms = forms.map((form) => form + part.text);
    else if (part.kind === 'count' || part.kind === 'value')
      forms = forms.map((form) => form + SLOT);
    else {
      const branches = [...part.branches.values()].flatMap(slotted);
      forms = forms.flatMap((form) => branches.map((branch) => form + branch));
    }
  }
  return forms;
}

function formsOf(text: string, isMessage: boolean): ReportForm[] {
  const raw = isMessage ? slotted(parseMessage(text)) : [text];
  return [...new Set(raw)].map((form) => {
    const runs = form.split(SLOT);
    return { display: runs.join(ELLIPSIS), runs };
  });
}

const stringsOnly = (
  leaves: Array<[string, unknown]>,
): Array<[string, string]> =>
  leaves.filter(
    (leaf): leaf is [string, string] => typeof leaf[1] === 'string',
  );

function siteStrings(
  locale: Locale,
  sections: readonly string[],
): ReportableString[] {
  const table = getSiteStrings(locale) as Record<string, unknown>;
  return sections.flatMap((section) =>
    stringsOnly(catalogueLeaves(table[section], `site.${section}`)).map(
      ([key, text]) => ({
        key,
        forms: formsOf(text, false),
      }),
    ),
  );
}

/** English decides what is a message, and arrays are never compiled (`compileCatalogue`). */
function toolStrings(locale: Locale): ReportableString[] {
  const english = new Map(catalogueLeaves(rawCatalogue(DEFAULT_LOCALE)));
  return stringsOnly(catalogueLeaves(rawCatalogue(locale))).map(
    ([key, text]) => {
      const reference = english.get(key);
      const isMessage =
        !key.includes('[') &&
        typeof reference === 'string' &&
        isMessageTemplate(reference);
      return { key, forms: formsOf(text, isMessage) };
    },
  );
}

const tables = new Map<string, readonly ReportableString[]>();

export function reportableStrings(
  page: PageId,
  locale: Locale,
): readonly ReportableString[] {
  const cacheKey = `${page}:${locale}`;
  let table = tables.get(cacheKey);
  if (!table) {
    const { siteSection, toolCatalogue } = PAGES[page];
    const sections = siteSection
      ? [siteSection, ...chromeSections()]
      : chromeSections();
    table = [
      ...(toolCatalogue ? toolStrings(locale) : []),
      ...siteStrings(locale, sections),
    ];
    tables.set(cacheKey, table);
  }
  return table;
}

export const reportOptions = (
  page: PageId,
  locale: Locale,
): readonly string[] => [
  ...new Set(
    reportableStrings(page, locale).flatMap(({ forms }) =>
      forms.map(({ display }) => display),
    ),
  ),
];

const ZERO_WIDTH: ReadonlySet<number> = new Set([
  0x200b, 0x200c, 0x200d, 0x2060, 0xfeff,
]);
const SINGLE_QUOTES: ReadonlySet<number> = new Set([
  0x2018, 0x2019, 0x201a, 0x201b, 0x2032, 0x02bc, 0xff07,
]);
const DOUBLE_QUOTES: ReadonlySet<number> = new Set([
  0x201c, 0x201d, 0x201e, 0x201f, 0x2033, 0xff02,
]);

/** Spec 5's normalisation, applied to the quote and to every form alike. */
export function normalise(text: string, locale: Locale): string {
  const folded = [...text.normalize('NFC')]
    .filter((ch) => !ZERO_WIDTH.has(ch.codePointAt(0)!))
    .map((ch) => {
      const point = ch.codePointAt(0)!;
      if (SINGLE_QUOTES.has(point)) return "'";
      if (DOUBLE_QUOTES.has(point)) return '"';
      return ch;
    })
    .join('');
  return folded.replace(/\s+/gu, ' ').trim().toLocaleLowerCase(locale);
}

const segmenters = new Map<Locale, Intl.Segmenter>();

/**
 * Whether `text` holds at least two characters: graphemes where the runtime
 * segments them, code points otherwise (spec 11, assumption 3). It stops at
 * the second, because the endpoint asks this once per form (about 200 on
 * classroom-groups) of a quote of up to 1000 units, on workerd's CPU budget.
 */
function hasTwoCharacters(text: string, locale: Locale): boolean {
  let units: Iterator<unknown>;
  if (typeof Intl.Segmenter === 'function') {
    let segmenter = segmenters.get(locale);
    if (!segmenter) {
      segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
      segmenters.set(locale, segmenter);
    }
    units = segmenter.segment(text)[Symbol.iterator]();
  } else units = text[Symbol.iterator]();
  return !units.next().done && !units.next().done;
}

/** Rule 3 as an anchored literal scan: each slot a non-empty wildcard, no backtracking. */
function wholeMessage(quote: string, runs: readonly string[]): boolean {
  const first = runs[0];
  const last = runs[runs.length - 1];
  if (!quote.startsWith(first) || !quote.endsWith(last)) return false;
  let at = first.length;
  for (const run of runs.slice(1, -1)) {
    const found = quote.indexOf(run, at + 1);
    if (found < 0) return false;
    at = found + run.length;
  }
  return quote.length - last.length >= at + 1;
}

/**
 * Spec 5's three rules for one form. Both sides arrive normalised: `needle`
 * by `normalise`, the form's runs by normalising them joined on SLOT, so a
 * space either side of a slot survives.
 */
export function matchesForm(
  needle: string,
  form: ReportForm,
  locale: Locale,
): boolean {
  if (needle === '') return false;
  if (needle === form.display) return true;
  if (
    hasTwoCharacters(needle, locale) &&
    form.runs.some((run) => run.includes(needle))
  )
    return true;
  // Clarification 6: a form with under 2 characters of fixed wording would match anything.
  const wholeMessageAllowed =
    form.runs.length > 1 && hasTwoCharacters(form.runs.join(''), locale);
  return wholeMessageAllowed && wholeMessage(needle, form.runs);
}

const normalisedTables = new Map<string, readonly ReportableString[]>();

/** A page's strings with every form normalised once, cached per page and locale. */
function normalisedStrings(
  page: PageId,
  locale: Locale,
): readonly ReportableString[] {
  const cacheKey = `${page}:${locale}`;
  let table = normalisedTables.get(cacheKey);
  if (!table) {
    table = reportableStrings(page, locale).map(({ key, forms }) => ({
      key,
      forms: forms.map(({ runs }) => {
        const normalRuns = normalise(runs.join(SLOT), locale).split(SLOT);
        return { display: normalRuns.join(ELLIPSIS), runs: normalRuns };
      }),
    }));
    normalisedTables.set(cacheKey, table);
  }
  return table;
}

/** Every key whose forms the quote matches (spec 5); empty when it is `not-found`. */
export function matchingKeys(
  quote: string,
  page: PageId,
  locale: Locale,
): string[] {
  const needle = normalise(quote, locale);
  return normalisedStrings(page, locale)
    .filter(({ forms }) =>
      forms.some((form) => matchesForm(needle, form, locale)),
    )
    .map(({ key }) => key);
}
