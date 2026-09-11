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

type RGB = readonly [number, number, number];
type RGBA = { rgb: RGB; alpha: number };

/** One sRGB channel, linearised per WCAG 2.x relative luminance. */
const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: RGB): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const contrast = (a: RGB, b: RGB): number => {
  const [la, lb] = [luminance(a), luminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * A CSS colour as this repo writes them: `#abc`, `#aabbcc`, or the space-
 * separated form `rgb(255 255 255 / 0.35)`.
 *
 * Aurora's borders and glass surfaces are ALPHAS, not hex (#17). A guard that
 * read only hex would silently classify every one of them as "not a colour"
 * and drop it from the pair check AND from the exhaustiveness check — green,
 * while blind to exactly the tokens that design leans on hardest.
 */
const parseColour = (value: string): RGBA | null => {
  const text = value.trim();

  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex !== null) {
    const h = hex[1];
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    return { rgb: [r, g, b], alpha: 1 };
  }

  const fn = text.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+)(%?)\s*)?\)$/i,
  );
  if (fn === null) return null;

  const [r, g, b] = [fn[1], fn[2], fn[3]].map(Number);
  const alpha =
    fn[4] === undefined
      ? 1
      : fn[5] === '%'
        ? Number(fn[4]) / 100
        : Number(fn[4]);
  return { rgb: [r, g, b], alpha };
};

const isColour = (value: string): boolean => parseColour(value) !== null;

/** Contrast between two literal CSS colours — for the WCAG pin only. */
const ratioOf = (a: string, b: string): number => {
  const [x, y] = [parseColour(a), parseColour(b)];
  if (x === null || y === null)
    throw new Error(`unreadable colour: ${a} / ${b}`);
  return contrast(x.rgb, y.rgb);
};

/** Source-over compositing, which is what a browser does with an alpha. */
const over = (fg: RGBA, ground: RGB): RGB =>
  [0, 1, 2].map((i) =>
    Math.round(fg.alpha * fg.rgb[i] + (1 - fg.alpha) * ground[i]),
  ) as unknown as RGB;

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

const colourTokens = (): [string, string][] =>
  nonEmpty(
    [...tokens()].filter(([, value]) => isColour(value)),
    `colour tokens in ${TOKENS_FILE}`,
  );

/**
 * Flatten a layer stack, written TOP-FIRST, onto its opaque base.
 *
 * `['--border-strong', '--bg']` is the border as the eye actually receives it.
 * Comparing the declared `rgb(255 255 255 / .35)` against `--bg` directly
 * scores 21:1 — the ratio of pure white to near-black, a colour that is never
 * drawn anywhere. An alpha judged un-composited is a guard measuring a pixel
 * that does not exist, and it fails OPEN.
 */
const flatten = (
  layers: readonly string[],
  from: Map<string, string>,
): RGB | string => {
  const parsed: RGBA[] = [];
  for (const layer of layers) {
    const value = layer.startsWith('--') ? from.get(layer) : layer;
    if (value === undefined) return `${layer} is not defined in ${TOKENS_FILE}`;
    const colour = parseColour(value);
    if (colour === null) return `${layer} is not a readable colour: ${value}`;
    parsed.push(colour);
  }

  const base = parsed[parsed.length - 1];
  if (base.alpha !== 1)
    return `the base of [${layers.join(', ')}] is translucent — nothing is behind it`;

  return parsed
    .slice(0, -1)
    .reduceRight<RGB>((ground, layer) => over(layer, ground), base.rgb);
};

/** 4.5 for body copy, 3 for large text and for anything identifying a control. */
const LEVELS = { body: 4.5, large: 3, ui: 3 } as const;

type Pair = {
  /** Layer stack, TOP-FIRST, ending in an opaque base. */
  fg: readonly string[];
  bg: readonly string[];
  level: keyof typeof LEVELS;
  where: string;
};

/**
 * Which colour sits on which, and at what level.
 *
 * Hand-written deliberately: WHICH pairs the design puts together is a design
 * fact no filesystem walk can answer, and resolving it from the cascade would
 * need a browser. What IS derived is exhaustiveness — every colour token must
 * appear here or in `DECORATIVE`, so a new token cannot be added unclassified.
 *
 * NOT covered here, and covered by the measurement pass instead: the page
 * atmosphere is a conic gradient, a radial gradient and a 5% white shaft
 * overlay, so the real ground under a given text run is lighter than `--bg`
 * in places. A token table can only judge the flat case.
 */
/**
 * The atmosphere as a layer stack, TOP-FIRST.
 *
 * Every stop composited at once is the WORST case, not the real one: the
 * three radials are positioned apart, so no pixel receives all of them. A
 * guard that measured the real overlap would need a browser and would answer
 * a question about one viewport width; this answers it for all of them, and
 * errs towards refusing a palette that would in fact have passed.
 */
const ATMOSPHERE = [
  '--aurora-shaft',
  '--aurora-mint',
  '--aurora-violet',
  '--aurora-deep',
  '--bg',
] as const;

const PAIRS: Pair[] = [
  {
    fg: ['--ink'],
    bg: ['--bg'],
    level: 'body',
    where: 'body copy on the page ground',
  },
  {
    fg: ['--ink'],
    bg: ['--surface'],
    level: 'body',
    where: 'body copy on a card',
  },
  {
    fg: ['--ink'],
    bg: ['--glass', '--bg'],
    level: 'body',
    where: 'a tool-card heading on the glass panel',
  },
  {
    fg: ['--ink-soft'],
    bg: ['--bg'],
    level: 'body',
    where: 'secondary copy on the page ground',
  },
  {
    fg: ['--ink-soft'],
    bg: ['--surface'],
    level: 'body',
    where: 'secondary copy on a card',
  },
  {
    fg: ['--ink-soft'],
    bg: ['--glass', '--bg'],
    level: 'body',
    where: 'tool-card body copy on the glass panel',
  },
  {
    fg: ['--ink-soft'],
    bg: ['--glass-2', '--bg'],
    level: 'body',
    where: 'tool-card body copy, panel hovered',
  },
  {
    fg: ['--accent'],
    bg: ['--bg'],
    level: 'body',
    where:
      'link text, and the :focus-visible ring — the ring needs only 3:1 under 1.4.11 but shares this pair, so the stricter 4.5 governs',
  },
  {
    fg: ['--accent'],
    bg: ['--surface'],
    level: 'body',
    where: 'link text on a card',
  },
  {
    fg: ['--accent'],
    bg: ['--glass', '--bg'],
    level: 'body',
    where: 'the tool-card open link on the glass panel',
  },
  {
    fg: ['--accent-ink'],
    bg: ['--bg'],
    level: 'body',
    where: 'link hover on the page ground',
  },
  {
    fg: ['--accent-ink'],
    bg: ['--surface'],
    level: 'body',
    where: 'link hover on a card',
  },
  {
    fg: ['--on-accent'],
    bg: ['--accent'],
    level: 'body',
    where: 'the label on a filled button',
  },
  {
    fg: ['--on-accent'],
    bg: ['--accent-ink'],
    level: 'body',
    where: 'the label on a filled button, hovered',
  },
  {
    fg: ['--danger'],
    bg: ['--bg'],
    level: 'body',
    where: 'error text on the page ground',
  },
  {
    fg: ['--danger'],
    bg: ['--surface'],
    level: 'body',
    where: 'error text on a card',
  },
  {
    fg: ['--ink'],
    bg: ATMOSPHERE,
    level: 'body',
    where: 'body copy over the brightest possible point of the atmosphere',
  },
  {
    fg: ['--ink-soft'],
    bg: ATMOSPHERE,
    level: 'body',
    where:
      'secondary copy over the atmosphere — the knife edge. At mint .10 / violet .14 / deep .18 this scored 4.48:1, a failure by 0.02 that no single layer shows',
  },
  {
    fg: ['--accent'],
    bg: ATMOSPHERE,
    level: 'body',
    where: 'link text and section kickers over the atmosphere',
  },
  {
    fg: ['--border-strong', ...ATMOSPHERE],
    bg: ATMOSPHERE,
    level: 'ui',
    where: 'control boundaries over the atmosphere (WCAG 1.4.11)',
  },
  {
    fg: ['--border-strong', '--bg'],
    bg: ['--bg'],
    level: 'ui',
    where: 'control boundaries on the page ground (WCAG 1.4.11)',
  },
  {
    fg: ['--border-strong', '--surface'],
    bg: ['--surface'],
    level: 'ui',
    where: 'control boundaries on a card (WCAG 1.4.11)',
  },
];

/**
 * Colour tokens deliberately in no pair, each with the reason.
 *
 * `--border` is here because 1.4.11 reaches only information REQUIRED to
 * identify a component. A card outline or a table rule is not that; a form
 * field's only edge is, which is why those use `--border-strong`.
 */
const DECORATIVE: Record<string, string> = {
  '--border':
    'decorative separators only — card outlines, header and footer rules, table rules. Every control boundary uses --border-strong.',
  '--deep':
    'a gradient stop in the page atmosphere, never drawn as text or a control edge. It IS a fill behind text — the earlier note here said otherwise — so it is measured as a layer in ATMOSPHERE rather than trusted as decorative.',
  '--violet':
    'a gradient stop in the page atmosphere. It was specified as the section kicker colour; measured, it scores 4.61:1 flat and 2.91:1 over the atmosphere, so it cannot carry small text. Kickers use --accent.',
  '--accent-glow':
    'the mint bloom behind the marquee band. A box-shadow: nothing is ever read against it, and 1.4.11 reaches only what identifies a control.',
};

const pairName = (p: Pair) =>
  `${p.fg.join(' over ')} on ${p.bg.join(' over ')} (${p.where})`;

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
    expect(ratioOf('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(ratioOf('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(ratioOf('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ratioOf('#777777', '#ffffff')).toBeLessThan(4.5);
    expect(ratioOf('#fff', '#000')).toBeCloseTo(21, 5);
    expect(ratioOf('#0a7d66', '#0a7d66')).toBeCloseTo(1, 5);
  });

  /**
   * Compositing pinned independently of the palette, for the same reason.
   *
   * 50% white over black is the one case anyone can check by hand, and an
   * opaque layer must pass through unchanged or every stack is silently wrong.
   */
  it('composites an alpha the way a browser does', () => {
    const from = new Map([
      ['--half', 'rgb(255 255 255 / 0.5)'],
      ['--black', '#000000'],
      ['--opaque', '#123456'],
    ]);
    expect(flatten(['--half', '--black'], from)).toEqual([128, 128, 128]);
    expect(flatten(['--opaque', '--black'], from)).toEqual([18, 52, 86]);
    expect(flatten(['--black'], from)).toEqual([0, 0, 0]);
    expect(flatten(['--missing', '--black'], from)).toBe(
      '--missing is not defined in src/styles/tokens.css',
    );
    expect(flatten(['--half'], from)).toBe(
      'the base of [--half] is translucent — nothing is behind it',
    );
  });

  it('every declared pair clears its required ratio', () => {
    const from = tokens();
    const failures = PAIRS.flatMap((pair) => {
      const fg = flatten(pair.fg, from);
      const bg = flatten(pair.bg, from);
      if (typeof fg === 'string') return [`${pairName(pair)} — ${fg}`];
      if (typeof bg === 'string') return [`${pairName(pair)} — ${bg}`];

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
    const paired = new Set(PAIRS.flatMap((p) => [...p.fg, ...p.bg]));
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
  'components/WorkCard.astro :: .work-card-badge',
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
