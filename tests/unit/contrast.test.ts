import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { filesUnder, nonEmpty, searched } from '../source-files';
import { withoutCssComments } from './source-text';

/**
 * WCAG AA contrast, COMPUTED from the tokens rather than promised in a comment.
 *
 * Until this file existed, the AA floor in this repo was enforced by a comment
 * beside `--accent` reading "do NOT lighten past AA", and nothing anywhere
 * computed a contrast ratio. Writing the sentence is not the control; the
 * assertion is. The first run found `--border` at 1.17:1 drawing the only
 * visual boundary on every form control on the site — a WCAG 2.1 SC 1.4.11
 * failure that had shipped to production, invisible to the visual suite
 * because the baseline had always been wrong (#133).
 */

const TOKENS_FILE = 'src/styles/tokens.css';
const SRC = 'src';

/** One sRGB channel, linearised per WCAG 2.x relative luminance. */
const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: string, b: string): number => {
  const [la, lb] = [luminance(a), luminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * The `:root` custom properties, read with CSS comments stripped.
 *
 * Stripped because this file's own documentation names token values, and a
 * guard satisfied by the prose explaining it is the defect this suite exists
 * to catch — five have shipped in this repo (#23, #21, #35, #49, #129).
 */
const tokens = (): Map<string, string> => {
  const css = withoutCssComments(readFileSync(TOKENS_FILE, 'utf8'));
  const root = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (root === null) throw new Error(`no :root block in ${TOKENS_FILE}`);

  const found = new Map<string, string>();
  for (const [, name, value] of root[1].matchAll(
    /(--[\w-]+)\s*:\s*([^;]+);/g,
  )) {
    found.set(name, value.trim());
  }
  return found;
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const colourTokens = (): [string, string][] =>
  nonEmpty(
    [...tokens()].filter(([, value]) => HEX.test(value)),
    `colour tokens in ${TOKENS_FILE}`,
  );

/** 4.5 for body copy, 3 for large text and for anything identifying a control. */
const LEVELS = { body: 4.5, large: 3, ui: 3 } as const;

type Pair = {
  fg: string;
  bg: string;
  level: keyof typeof LEVELS;
  where: string;
};

/**
 * Which colour sits on which, and at what level.
 *
 * Hand-written deliberately: WHICH pairs the design puts together is a design
 * fact that no filesystem walk can answer, and resolving it from the cascade
 * would need a full browser. What IS derived is exhaustiveness — every colour
 * token below must appear here or in `DECORATIVE`, so a new token cannot be
 * added without being classified.
 */
const PAIRS: Pair[] = [
  {
    fg: '--ink',
    bg: '--bg',
    level: 'body',
    where: 'body copy on the page ground',
  },
  { fg: '--ink', bg: '--surface', level: 'body', where: 'body copy on a card' },
  {
    fg: '--ink-soft',
    bg: '--bg',
    level: 'body',
    where: 'secondary copy on the page ground',
  },
  {
    fg: '--ink-soft',
    bg: '--surface',
    level: 'body',
    where: 'secondary copy on a card',
  },
  {
    fg: '--accent',
    bg: '--bg',
    level: 'body',
    where:
      'link text, and the :focus-visible ring — the ring needs only 3:1 under 1.4.11 but shares this pair, so the stricter 4.5 governs',
  },
  {
    fg: '--accent',
    bg: '--surface',
    level: 'body',
    where: 'link text on a card',
  },
  {
    fg: '--accent-ink',
    bg: '--bg',
    level: 'body',
    where: 'link hover on the page ground',
  },
  {
    fg: '--accent-ink',
    bg: '--surface',
    level: 'body',
    where: 'link hover on a card',
  },
  {
    fg: '#ffffff',
    bg: '--accent',
    level: 'body',
    where: 'primary button label, skip link',
  },
  {
    fg: '#ffffff',
    bg: '--accent-ink',
    level: 'body',
    where: 'primary button label on hover',
  },
  {
    fg: '--danger',
    bg: '--bg',
    level: 'body',
    where: 'error text on the page ground',
  },
  {
    fg: '--danger',
    bg: '--surface',
    level: 'body',
    where: 'error text on a card',
  },
  {
    fg: '--border-strong',
    bg: '--bg',
    level: 'ui',
    where: 'control boundaries on the page ground (WCAG 1.4.11)',
  },
  {
    fg: '--border-strong',
    bg: '--surface',
    level: 'ui',
    where: 'control boundaries on a card (WCAG 1.4.11)',
  },
];

/**
 * Colour tokens deliberately in no pair, each with the reason.
 *
 * `--border` is here because 1.4.11 reaches only information REQUIRED to
 * identify a component. A card outline or a table rule is not that; a form
 * field's only edge is, which is why those moved to `--border-strong`.
 */
const DECORATIVE: Record<string, string> = {
  '--border':
    'decorative separators only — card outlines, header and footer rules, table rules. Every control boundary uses --border-strong.',
};

const resolve = (ref: string, from: Map<string, string>): string | null =>
  ref.startsWith('--') ? (from.get(ref) ?? null) : ref;

const pairName = (p: Pair) => `${p.fg} on ${p.bg} (${p.where})`;

describe('the palette meets WCAG AA by computation, not by comment', () => {
  /**
   * The ratio function pinned against WCAG's OWN published boundary.
   *
   * Without this, every assertion below is satisfied by a `contrast()` that
   * returns 21 for everything — a value checked only against the palette it
   * was computed from proves the relationship, never the level (#117).
   * `#767676` is the canonical darkest grey that still clears 4.5:1 on white,
   * and `#777777` the lightest that does not: they pin the function to within
   * 0.07 of the threshold that matters.
   */
  it('computes the ratios WCAG itself publishes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5);
    expect(contrast('#fff', '#000')).toBeCloseTo(21, 5);
    expect(contrast('#0a7d66', '#0a7d66')).toBeCloseTo(1, 5);
  });

  it('every declared pair clears its required ratio', () => {
    const from = tokens();
    const failures = PAIRS.flatMap((pair) => {
      const fg = resolve(pair.fg, from);
      const bg = resolve(pair.bg, from);
      if (fg === null || bg === null)
        return [
          `${pairName(pair)} — ${fg === null ? pair.fg : pair.bg} is not defined in ${TOKENS_FILE}`,
        ];

      const ratio = contrast(fg, bg);
      const need = LEVELS[pair.level];
      return ratio >= need
        ? []
        : [`${pairName(pair)} — ${ratio.toFixed(2)}:1, needs ${need}:1`];
    });

    expect(
      searched(failures, { of: PAIRS, what: 'declared colour pairs' }),
    ).toEqual([]);
  });

  it('every colour token is classified — paired or explicitly decorative', () => {
    const paired = new Set(PAIRS.flatMap((p) => [p.fg, p.bg]));
    const all = colourTokens();
    const unclassified = all
      .map(([name]) => name)
      .filter((name) => !paired.has(name) && !(name in DECORATIVE));

    expect(searched(unclassified, { of: all, what: 'colour tokens' })).toEqual(
      [],
    );
  });
});

/**
 * Every `var(--border)` site in the source, with the selector it sits under.
 *
 * Selector tracking is the last line ending in `{`. Every border usage in this
 * repo is written under a single-line selector; a multi-line selector list
 * would be recorded under its final line, which still classifies uniquely and
 * still fails loudly if it is not classified at all.
 */
type BorderUsage = { file: string; selector: string; declaration: string };

const borderUsages = (): BorderUsage[] => {
  const files = nonEmpty(
    filesUnder(SRC, (path) => path.endsWith('.astro') || path.endsWith('.css')),
    `.astro and .css files under ${SRC}/`,
  );

  return files.flatMap((file) => {
    const lines = withoutCssComments(readFileSync(file, 'utf8')).split('\n');
    let selector = '(none)';
    const found: BorderUsage[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.endsWith('{') && !trimmed.startsWith('@')) {
        selector = trimmed.slice(0, -1).trim();
      }
      if (trimmed.includes('var(--border)')) {
        found.push({
          file: file.replace(/^src\//, ''),
          selector,
          declaration: trimmed,
        });
      }
    }
    return found;
  });
};

const key = (u: { file: string; selector: string }) =>
  `${u.file} :: ${u.selector}`;

/** Selectors whose border is the ONLY thing identifying a control (#133). */
const CONTROL_SELECTORS = [
  'components/Button.astro :: .secondary',
  'components/LanguageSwitcher.astro :: ul',
  'components/pages/GloryPointsPage.astro :: .for-yeetalk a',
  'components/pages/GloryPointsPage.astro :: input',
  "components/pages/ClassroomGroupsPage.astro :: input[type='number']",
  'components/pages/ClassroomGroupsPage.astro :: select',
  'components/pages/ClassroomGroupsPage.astro :: #cg-roster select',
  'components/pages/ClassroomGroupsPage.astro :: #cg-io-both-toggle',
  'components/pages/ClassroomGroupsPage.astro :: .cg-print-open',
  'components/pages/ClassroomGroupsPage.astro :: .cg-print-actions button',
  'components/pages/ClassroomGroupsPage.astro :: .cg-board-bar button',
  'components/pages/ClassroomGroupsPage.astro :: .cg-io-confirm-buttons button',
  'components/pages/ClassroomGroupsPage.astro :: .cg-add-several-inline input',
];

/** Selectors whose border separates or outlines but identifies no control. */
const DECORATIVE_SELECTORS = [
  'components/WorkCard.astro :: .work-card',
  'components/ServiceCard.astro :: .service-card',
  'components/Footer.astro :: footer',
  'components/Header.astro :: header',
  'components/Header.astro :: .menu[open] ~ nav',
  'components/pages/GloryPointsPage.astro :: .card',
  'components/pages/ClassroomGroupsPage.astro :: #cg-results .group',
  'components/pages/ClassroomGroupsPage.astro :: #cg-roster .cg-student',
  'components/pages/ClassroomGroupsPage.astro :: #cg-roster td',
  'components/pages/ClassroomGroupsPage.astro :: #cg-roster .cg-student > td',
  'components/pages/ClassroomGroupsPage.astro :: .cg-io-confirm',
  'components/pages/ClassroomGroupsPage.astro :: .cg-print-panel',
  'components/pages/ClassroomGroupsPage.astro :: .cg-print-panel fieldset',
  'components/pages/ClassroomGroupsPage.astro :: .tool-section',
  'pages/404.astro :: hr',
];

describe('a control is never identified by the decorative border alone', () => {
  it('no control selector draws its boundary with --border', () => {
    const usages = borderUsages();
    const offenders = usages
      .filter((u) => CONTROL_SELECTORS.includes(key(u)))
      .map((u) => `${key(u)} → ${u.declaration}`);

    expect(
      searched(offenders, { of: usages, what: 'var(--border) usages in src/' }),
    ).toEqual([]);
  });

  it('every --border usage is classified as control or decorative', () => {
    const usages = borderUsages();
    const classified = new Set([...CONTROL_SELECTORS, ...DECORATIVE_SELECTORS]);
    const unclassified = usages
      .filter((u) => !classified.has(key(u)))
      .map((u) => `${key(u)} → ${u.declaration}`);

    expect(
      searched(unclassified, {
        of: usages,
        what: 'var(--border) usages in src/',
      }),
    ).toEqual([]);
  });
});
