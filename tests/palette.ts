import { readFileSync } from 'node:fs';
import { cssRules, type CssRule } from './unit/css-rules';
import { stylesheetCss } from './unit/source-text';
import { contrast, over, parseColour, type RGB, type RGBA } from './wcag';

/**
 * The palette as tokens.css declares it: the one model the contrast suite,
 * the token guards and the per-theme browser runs share, so none of them can
 * disagree about what the palette is (#142).
 */
export const TOKENS_FILE = 'src/styles/tokens.css';

/** tokens.css with its comments stripped: the only form a guard reads. */
export const tokensCss = (): string =>
  stylesheetCss(TOKENS_FILE, readFileSync(TOKENS_FILE, 'utf8')).join('\n');

/** The custom properties a block declares, the last of each name kept. */
export const customProperties = (rule: CssRule): Map<string, string> =>
  new Map(
    rule.declarations
      .filter(({ property }) => property.startsWith('--'))
      .map(({ property, value }) => [property, value]),
  );

/** The rules whose whole chain is `selector`: top level, inside no at-rule. */
const topLevel = (css: string, selector: string): CssRule[] =>
  cssRules(css).filter(
    ({ chain }) => chain.length === 1 && chain[0] === selector,
  );

/**
 * The tokens bare `:root` declares, from exactly one such block, found by its
 * chain rather than by coming first: the print block is `:root` one level
 * down, and a theme block is `:root` with more after it.
 */
export const rootTokens = (css: string): Map<string, string> => {
  const roots = topLevel(css, ':root');
  if (roots.length !== 1)
    throw new Error(
      `expected one bare :root block in ${TOKENS_FILE}, found ${roots.length}`,
    );
  return customProperties(roots[0]);
};

/** A comma-separated list, split only at commas outside parentheses. */
const layersOf = (value: string): string[] => {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  [...value].forEach((ch, i) => {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      layers.push(value.slice(start, i).trim());
      start = i + 1;
    }
  });
  return [...layers, value.slice(start).trim()];
};

/**
 * The page atmosphere's layers as `body::before` paints them, TOP-FIRST. CSS
 * paints the first `background` layer on top, so declaration order IS the
 * stack. Derived, never written down: the suite's hand-written stack once put
 * the shaft on top of a stack the browser paints with the shaft at the bottom.
 *
 * Every layer must take its colour from exactly one token, or no pair could
 * score it: a literal layer would be invisible to every contrast check.
 */
export const atmosphereLayers = (css: string): string[] => {
  const rules = topLevel(css, 'body::before');
  if (rules.length !== 1)
    throw new Error(
      `expected one top-level body::before rule in ${TOKENS_FILE}, found ${rules.length}`,
    );
  const background = rules[0].declarations.filter(
    ({ property }) => property === 'background',
  );
  if (background.length !== 1)
    throw new Error(
      `body::before declares background ${background.length} times, expected once`,
    );
  return layersOf(background[0].value).map((layer, i) => {
    const tokens = [...layer.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
    if (tokens.length !== 1)
      throw new Error(
        `body::before layer ${i + 1} names ${tokens.length} tokens; ` +
          `each layer must take its colour from exactly one: ${layer}`,
      );
    return tokens[0];
  });
};

/** Every subset of `items`, each keeping their order; the empty one first. */
export const subsets = <T>(items: readonly T[]): T[][] =>
  items.reduce<T[][]>(
    (all, item) => [...all, ...all.map((subset) => [...subset, item])],
    [[]],
  );

/**
 * Flatten a layer stack, written TOP-FIRST, onto its opaque base.
 *
 * `['--border-strong', '--bg']` is the border as the eye actually receives it.
 * Comparing the declared `rgb(255 255 255 / 0.4)` against `--bg` directly
 * scores 20.17:1 — the ratio of pure white to near-black, a colour that is
 * never drawn anywhere. An alpha judged un-composited is a guard measuring a
 * pixel that does not exist, and it fails OPEN.
 */
export const flatten = (
  layers: readonly string[],
  from: ReadonlyMap<string, string>,
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

/** A stack entry standing for the atmosphere, replaced by each subset in turn. */
export const ATMOSPHERE = '(the atmosphere)';

/**
 * The worst contrast a pair can have. Each subset of the atmosphere's layers
 * takes ATMOSPHERE's place, in both stacks at once, since a mark and its
 * ground sit on the same pixel.
 *
 * "Every layer at once" is the worst case only when every layer moves the
 * ground towards the ink. It holds in Aurora. In #142's Studio the shaft
 * brightens the ground under dark ink while the pools darken it, and a
 * draft that passed with all four layers failed at 3.92:1 against two.
 */
export const worstContrast = (
  fg: readonly string[],
  bg: readonly string[],
  layers: readonly string[],
  from: ReadonlyMap<string, string>,
): { ratio: number; subset: readonly string[] } | string => {
  const named = fg.includes(ATMOSPHERE) || bg.includes(ATMOSPHERE);
  let worst: { ratio: number; subset: readonly string[] } | undefined;
  for (const subset of named ? subsets(layers) : [[]]) {
    const expand = (stack: readonly string[]) =>
      stack.flatMap((layer) => (layer === ATMOSPHERE ? subset : [layer]));
    const ink = flatten(expand(fg), from);
    const ground = flatten(expand(bg), from);
    if (typeof ink === 'string') return ink;
    if (typeof ground === 'string') return ground;
    const ratio = contrast(ink, ground);
    if (worst === undefined || ratio < worst.ratio) worst = { ratio, subset };
  }
  if (worst === undefined) throw new Error('subsets() returned nothing');
  return worst;
};
