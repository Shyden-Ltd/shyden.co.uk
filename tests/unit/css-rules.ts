/**
 * A stylesheet's STRUCTURE: which rules it holds, the chain of blocks each
 * one sits under, and the colours a declaration writes.
 *
 * Input is CSS already stripped of comments. Take it from `stylesheetCss`
 * (`source-text.ts`), which also splits an `.astro` file into its `<style>`
 * bodies; a brace inside a comment would otherwise open a block.
 */

/**
 * One declaration, whitespace collapsed. It carries no line number: the CSS
 * this reads has had its comments removed, so a line counted here is not the
 * file's line, and a guard that points at the wrong line misleads. A rule's
 * file and chain identify it exactly.
 */
export type CssDeclaration = { property: string; value: string };

export type CssRule = {
  /**
   * Every block header from the outermost in, whitespace collapsed:
   * `['@media print', '.print-head']`. A line scan that keeps only the
   * nearest selector cannot tell that rule from the screen rule of the same
   * name, and where a rule sits is usually the question a guard is asking.
   */
  chain: readonly string[];
  declarations: readonly CssDeclaration[];
};

/**
 * Every block in `css`, outermost first, with the declarations written
 * directly inside it.
 *
 * One pass over the braces. Quoted strings are skipped, so `content: '{'`
 * opens nothing. A statement outside every block (`@import …;`) is dropped.
 * Residual, named rather than chased: an UNQUOTED `url()` holding a `;`, as
 * a data URI can, ends its declaration early. None occurs under `src/` as
 * this is written.
 */
export function cssRules(css: string): CssRule[] {
  type Block = { chain: string[]; declarations: CssDeclaration[] };
  const rules: Block[] = [];
  const open: Block[] = [];
  let buffer = '';
  let quote: string | null = null;
  let escaped = false;

  const take = (): string => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    buffer = '';
    return text;
  };

  const declare = (): void => {
    const text = take();
    const block = open.at(-1);
    const colon = text.indexOf(':');
    if (block === undefined || colon <= 0) return;
    block.declarations.push({
      property: text.slice(0, colon).trim(),
      value: text.slice(colon + 1).trim(),
    });
  };

  for (const ch of css) {
    if (quote !== null) {
      buffer += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
    } else if (ch === '{') {
      const block: Block = {
        chain: [...(open.at(-1)?.chain ?? []), take()],
        declarations: [],
      };
      open.push(block);
      rules.push(block);
    } else if (ch === '}') {
      declare();
      open.pop();
    } else if (ch === ';') {
      declare();
    } else if (buffer !== '' || !/\s/.test(ch)) {
      // Leading whitespace is never buffered: a `<style>` view is the whole
      // `.astro` file with everything else blanked, and rescanning that
      // prefix on every character would be quadratic.
      if (ch === '"' || ch === "'") quote = ch;
      buffer += ch;
    }
  }
  return rules;
}

/**
 * CSS Color 4's named colours, lower-case.
 *
 * `transparent` and `currentColor` are absent on purpose: neither fixes a
 * colour a theme would need to reach. So are the system colours (`Canvas`,
 * `CanvasText` and the rest), which already follow `color-scheme`.
 */
export const NAMED_COLOURS: readonly string[] = [
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
];

/** `&#123;` is a character reference, and `a.#b` a private field. */
const HEX = /(?<![&\w.])#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})(?![\w-])/gi;

/** Every function that fixes a colour, legacy and modern, one nesting deep. */
const COLOUR_FUNCTION =
  /(?<![\w.-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?:[^()]|\([^()]*\))*\)/gi;

const NAMED = new RegExp(
  `(?<![\\w-])(?:${NAMED_COLOURS.join('|')})(?![\\w-])`,
  'gi',
);

/** Blanked before a name is looked for: `'Red Hat'` and `url(red.png)`. */
const QUOTED = /(["'])(?:\\.|(?!\1)[^\\])*\1/g;
const URL = /\burl\((?:[^()]|\([^()]*\))*\)/gi;

/**
 * Every colour literal a CSS value writes, in the order written: a hex, a
 * colour function, or a named colour.
 */
export const colourLiterals = (value: string): string[] => {
  const bare = value.replace(URL, 'url()').replace(QUOTED, "''");
  return [HEX, COLOUR_FUNCTION, NAMED]
    .flatMap((pattern) => [...bare.matchAll(pattern)])
    .sort((a, b) => a.index - b.index)
    .map((match) => match[0]);
};
