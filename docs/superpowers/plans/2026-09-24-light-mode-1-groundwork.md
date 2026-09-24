# Light mode, PR 1 of 2: the groundwork (#142) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the palette, its guards and every Playwright project for a second theme, without moving a single pixel.

**Architecture:** The palette model moves out of `contrast.test.ts` into a shared module, `tests/palette.ts`. It reads `tokens.css` structurally through #332's CSS rule reader. The contrast suite then scores the atmosphere the way the browser paints it: layers in `body::before`'s own order, worst case over every subset of them. Unused tokens retire, and the atmosphere tokens take names by position. Two guards join: every colour literal outside `tokens.css` must be allowlisted with its reason, and every Playwright project must declare its colour scheme. Aurora's values do not change, and the visual suite proves it.

**Tech Stack:** Astro 5, CSS custom properties, Vitest (unit), Playwright (e2e and visual, in the pinned `linux/amd64` container), TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-23-light-mode-design.md`. This plan covers §11 step 1: §3.1 (renames, retirements, `--lift-shadow`), §3.3, §6.1, §6.2 (the declarations and their guard), §6.6 and §7 (all but the `CLAUDE.md` zero-JS line, which belongs to light mode). PR 2's plan, light mode itself, is written once this PR and #329 have merged, against the code they leave.

## Global Constraints

- **No pixel moves.** CI's `visual` job passes on the 12 existing baselines, and a local compare run writes nothing (§11 step 1).
- **Aurora's values are unchanged.** Only names change:

  | old name | new name |
  | --- | --- |
  | `--aurora-mint` | `--pool-top-left` |
  | `--aurora-violet` | `--pool-top-right` |
  | `--aurora-deep` | `--pool-foot` |
  | `--aurora-shaft` | `--shaft` |

  Every reference follows (§3.1, §3.3, AC16).
- **Three tokens retire:** `--violet`, `--deep` and `--glass-2` (§3.1).
- **`--lift-shadow` is `rgb(0 0 0 / 0.55)`** in Aurora, the value `PhoneFrame.astro` hard-codes today (§3.1, §3.3).
- **The atmosphere is scored in paint order, derived from `body::before`,** with the worst case taken over every subset of its four layers (§6.1, AC9).
- **The glass pair is accent text on `--glass` over `--surface`.** The `--ink` and `--ink-soft` on-glass pairs go, and `--accent-ink` gains a pair over the atmosphere. `--danger` gains no atmosphere pair (§6.1).
- **Every project in every `playwright*.config.ts` declares `colorScheme`,** and the general suite declares `dark`. The guard derives the configs from the filesystem (§6.2).
- **What counts as a colour literal:** a hex value, `rgb()`/`rgba()`, `hsl()`/`hsla()` or a named colour. `transparent` and `currentColor` are exempt (§6.6). This plan also counts `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` and `color()` (Review Focus 1).
- **Every guard that discovers its population asserts it with `searched()`,** and every new or rewritten guard is watched failing, then passing (§6.8, CLAUDE.md).
- **No new npm dependency** (CLAUDE.md).
- **Commit messages and the PR body say `Refs #142`,** never a closing keyword beside an issue number (CLAUDE.md).
- **Merge into `develop` with a merge commit,** and only after the operator signs off the evidence page (standing rule).

## Review Focus

1. **A colour written with a modern function** (`oklch()`, `lab()`, `hwb()`, `color()`), or a named colour inside `color-mix()`, must be refused like `rgb()`. #332's `colourLiterals` already reads CSS values this way, and Task 6 pins the same for colours written in code.
2. **A `body::before` layer written as a literal colour, or holding two tokens,** must make the atmosphere derivation throw rather than leave that layer unscored (Task 1).
3. **A hex-shaped issue number in prose (`#161`) or an HTML character reference (`&#123;`).** The reference must never be a finding. The issue number is a finding, allowlisted by name with its reason, because no detector can tell it from a colour (Tasks 6 and 7).
4. **A config the scheme guard's name pattern might miss:** one added as `.mjs`, or named `playwright-ct.config.ts`. Such a config must still be found, and a project that sets `colorScheme: null` must be refused (Task 8).
5. **A second bare `:root` block, or the print `:root` moved above the screen one.** The token reader must throw on the first, and still read the bare block on the second (Task 1).

---

## Before you start

- [ ] **#332 is merged** (PR #333). This plan builds on its `tests/unit/css-rules.ts` (`cssRules`, `colourLiterals`, `NAMED_COLOURS`) and edits its `tests/unit/literal-grounds.test.ts`. Check with `git ls-tree origin/develop tests/unit/css-rules.ts`, which must print one line.
- [ ] **Bring the branch up to date.** Run `git switch 142-light-mode-beside-aurora && git fetch origin && git merge origin/develop`, a merge as the develop model uses. The branch already carries the spec and this plan.
- [ ] **Take the baseline.** Run `npm run test:unit` and expect every test to pass. Note the file and test totals: every later run is compared with them.
- [ ] **Find edits by content.** #329 (PR #330) may have merged too. It rewrites much of `LanguageSwitcher.astro` but keeps both `var(--surface, …)` fallbacks and the `ul` shadow this plan touches, so every edit here is found by its text, never by a line number.
- [ ] **Commit at every green gate, and always before mutating anything** (standing rule: `git checkout` restores `HEAD`).

## File map

| file | responsibility |
| --- | --- |
| `tests/palette.ts` (new) | The palette model: the bare `:root` tokens, the atmosphere layers in paint order, subsets, compositing, and a pair's worst contrast. Used by `contrast.test.ts`, `tokens.test.ts` and, in PR 2, the per-theme e2e runs. |
| `tests/unit/palette.test.ts` (new) | Fixtures for the model. |
| `tests/unit/tokens.test.ts` (new) | Structural guards on `tokens.css`. PR 1: every declared token is read. PR 2 adds the dark-block guards here. |
| `tests/unit/colour-literals.test.ts` (new) | The §6.6 guard and its allowlist. |
| `tests/unit/css-rules.ts` and `.test.ts` | Gains `onPaper` (one definition of paper) and `codeColourLiterals`. |
| `tests/unit/literal-grounds.test.ts` | Takes paper from `onPaper`. |
| `tests/unit/contrast.test.ts` | The model moves out; the atmosphere is scored by subset; pairs follow the painted ground; `.actions` is classified. |
| `tests/unit/browser-matrix.test.ts` | The colour-scheme guard, beside the other facts about the configs. |
| `src/styles/tokens.css` | Renames, retirements, `--lift-shadow`, corrected comments. |
| `src/components/PhoneFrame.astro` | The shadow reads `--lift-shadow`. |
| `src/components/LanguageSwitcher.astro` | The dead `var(--surface, …)` fallbacks go. |
| `src/components/pages/ClassroomGroupsPage.astro` | The `.actions` fallbacks go, and the pre-Aurora comment is corrected. |
| the four `playwright*.config.ts` | `colorScheme: 'dark'`. |
| `CLAUDE.md` | The stale "Accent `#0A7D66`" line. |

---

### Task 1: The palette model

**Files:**
- Create: `tests/palette.ts`
- Create: `tests/unit/palette.test.ts`
- Modify: `tests/unit/contrast.test.ts` (imports; its local `tokens()` and `flatten` go)

**Interfaces:**
- Consumes: `cssRules`, `CssRule` (`tests/unit/css-rules.ts`, from #332); `stylesheetCss` (`tests/unit/source-text.ts`); `contrast`, `over`, `parseColour`, `RGB`, `RGBA` (`tests/wcag.ts`).
- Produces:
  - `TOKENS_FILE: 'src/styles/tokens.css'`
  - `tokensCss(): string`
  - `customProperties(rule: CssRule): Map<string, string>`
  - `rootTokens(css: string): Map<string, string>`
  - `atmosphereLayers(css: string): string[]` (top-first token names)
  - `subsets<T>(items: readonly T[]): T[][]`
  - `flatten(layers: readonly string[], from: ReadonlyMap<string, string>): RGB | string`
  - `ATMOSPHERE: string` (a placeholder layer)
  - `worstContrast(fg, bg, layers, from): { ratio: number; subset: readonly string[] } | string`

- [ ] **Step 1: Create `tests/palette.ts` with throwing stubs,** so that every new test fails on its own assertion rather than on a missing import:

```ts
import type { CssRule } from './unit/css-rules';
import type { RGB } from './wcag';

export const TOKENS_FILE = 'src/styles/tokens.css';
export const ATMOSPHERE = '(the atmosphere)';
const todo = (name: string): never => {
  throw new Error(`not implemented: ${name}`);
};
export const tokensCss = (): string => todo('tokensCss');
export const customProperties = (rule: CssRule): Map<string, string> =>
  todo(`customProperties ${rule.chain.length}`);
export const rootTokens = (css: string): Map<string, string> =>
  todo(`rootTokens ${css.length}`);
export const atmosphereLayers = (css: string): string[] =>
  todo(`atmosphereLayers ${css.length}`);
export const subsets = <T>(items: readonly T[]): T[][] =>
  todo(`subsets ${items.length}`);
export const flatten = (
  layers: readonly string[],
  from: ReadonlyMap<string, string>,
): RGB | string => todo(`flatten ${layers.length} ${from.size}`);
export const worstContrast = (
  fg: readonly string[],
  bg: readonly string[],
  layers: readonly string[],
  from: ReadonlyMap<string, string>,
): { ratio: number; subset: readonly string[] } | string =>
  todo(`worstContrast ${fg.length} ${bg.length} ${layers.length} ${from.size}`);
```

- [ ] **Step 2: Write the failing tests** in `tests/unit/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ATMOSPHERE,
  atmosphereLayers,
  rootTokens,
  subsets,
  worstContrast,
} from '../palette';

describe('rootTokens', () => {
  it('reads the bare :root block, never the print block or a theme block', () => {
    const css = [
      '@media print {\n  :root { --bg: #fff; }\n}',
      ':root {\n  --bg: #04070d;\n  --ink: #eaf2ff;\n}',
      ":root[data-theme='dark'] { --bg: #000; }",
    ].join('\n');
    expect([...rootTokens(css)]).toEqual([
      ['--bg', '#04070d'],
      ['--ink', '#eaf2ff'],
    ]);
  });

  it('refuses a stylesheet with no bare :root, or with two', () => {
    expect(() => rootTokens('@media print { :root { --a: #fff; } }')).toThrow(
      'found 0',
    );
    expect(() => rootTokens(':root { --a: #fff; }\n:root { --b: #000; }')).toThrow(
      'found 2',
    );
  });
});

describe('atmosphereLayers', () => {
  const before = (background: string): string =>
    `body::before {\n  content: '';\n  background: ${background};\n}\n` +
    '@media print {\n  body::before { display: none; }\n}\n';

  it('lists the layers top-first, in declaration order, one token each', () => {
    expect(
      atmosphereLayers(
        before(
          'radial-gradient(60rem 40rem at 12% -8%, var(--a), transparent 70%), ' +
            'linear-gradient(100deg, transparent 30%, var(--b) 50%, transparent 70%)',
        ),
      ),
    ).toEqual(['--a', '--b']);
  });

  it('refuses a layer it could not score', () => {
    expect(() =>
      atmosphereLayers(before('radial-gradient(#fff, transparent), linear-gradient(var(--a), transparent)')),
    ).toThrow('layer 1 names 0 tokens');
    expect(() =>
      atmosphereLayers(before('linear-gradient(var(--a), var(--b))')),
    ).toThrow('layer 1 names 2 tokens');
  });

  it('refuses a stylesheet with no screen body::before', () => {
    expect(() =>
      atmosphereLayers('@media print { body::before { background: var(--a); } }'),
    ).toThrow('body::before');
  });
});

describe('subsets', () => {
  it('lists all 2^n subsets, each keeping the original order', () => {
    const all = subsets(['a', 'b', 'c']);
    expect(all).toHaveLength(8);
    expect(all).toContainEqual([]);
    expect(all).toContainEqual(['a', 'c']);
    expect(all).toContainEqual(['a', 'b', 'c']);
    expect(all.filter((s) => s.join('') !== [...s].sort().join(''))).toEqual(
      [],
    );
  });
});

describe('worstContrast', () => {
  // Studio's shape (#142 spec §6.1): dark ink on a white ground, one layer
  // that darkens it and one, on top, that lightens it again. Every layer at
  // once passes; the darkening layer alone does not.
  const from = new Map([
    ['--bg', '#ffffff'],
    ['--ink', '#6f6f6f'],
    ['--shaft', 'rgb(255 255 255 / 0.9)'],
    ['--pool', 'rgb(0 0 0 / 0.15)'],
  ]);
  const layers = ['--shaft', '--pool'];

  it('finds the worst subset where every layer at once passes', () => {
    const everyLayer = worstContrast(['--ink'], ['--shaft', '--pool', '--bg'], [], from);
    expect(typeof everyLayer === 'string' ? 0 : everyLayer.ratio).toBeGreaterThan(4.5);
    expect(worstContrast(['--ink'], [ATMOSPHERE, '--bg'], layers, from)).toEqual({
      ratio: expect.closeTo(3.56, 1),
      subset: ['--pool'],
    });
  });

  it('scores a pair that names no atmosphere once, as written', () => {
    expect(worstContrast(['--ink'], ['--bg'], layers, from)).toEqual({
      ratio: expect.closeTo(5.03, 1),
      subset: [],
    });
  });

  it('puts the same subset under the foreground and its ground', () => {
    // A border drawn over the atmosphere sits on the same pixel as the ground
    // it is judged against. Scored with independent subsets, the border over
    // no layer against the ground under the pool would read 1.49:1.
    const withBorder = new Map([...from, ['--line', 'rgb(0 0 0 / 0.3)']]);
    expect(
      worstContrast(['--line', ATMOSPHERE, '--bg'], [ATMOSPHERE, '--bg'], ['--pool'], withBorder),
    ).toEqual({ ratio: expect.closeTo(2.04, 1), subset: ['--pool'] });
  });

  it('reports a stack it cannot flatten, rather than a ratio', () => {
    expect(worstContrast(['--missing'], ['--bg'], [], from)).toBe(
      '--missing is not defined in src/styles/tokens.css',
    );
  });
});
```

- [ ] **Step 3: Run it and watch every test fail on its own assertion.**
  - Run: `npx vitest run tests/unit/palette.test.ts`
  - Expected: `Tests  10 failed (10)`, each with `not implemented: …`.
  - If a test passes against the stubs, it asserts nothing: rewrite it before going on.

- [ ] **Step 4: Implement `tests/palette.ts`,** replacing the stubs whole. `flatten` moves verbatim from `contrast.test.ts`, doc comment included:

```ts
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
 * Comparing the declared `rgb(255 255 255 / .35)` against `--bg` directly
 * scores 21:1 — the ratio of pure white to near-black, a colour that is never
 * drawn anywhere. An alpha judged un-composited is a guard measuring a pixel
 * that does not exist, and it fails OPEN.
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
```

- [ ] **Step 5: Run it and watch it pass.**
  - Run: `npx vitest run tests/unit/palette.test.ts`
  - Expected: `Tests  10 passed (10)`.

- [ ] **Step 6: Point `contrast.test.ts` at the model.**
  - Delete its local `TOKENS_FILE`, `tokens()` and `flatten` (with their doc comments).
  - Replace the imports:

    ```ts
    import { filesUnder, nonEmpty, searched } from '../source-files';
    import { stylesheetCss } from './source-text';
    import { contrast, parseColour } from '../wcag';
    import { TOKENS_FILE, flatten, rootTokens, tokensCss } from '../palette';
    ```

  - Replace every `tokens()` with `rootTokens(tokensCss())`.
  - Leave `ATMOSPHERE` and `PAIRS` as they are for now; Task 2 changes them.
  - Run `npx vitest run tests/unit/contrast.test.ts` and expect the same count as the baseline, all passing.

- [ ] **Step 7: Commit.**

```bash
git add tests/palette.ts tests/unit/palette.test.ts tests/unit/contrast.test.ts
git commit -m "test(unit): the palette model gets one home

Refs #142"
```

---

### Task 2: Positional atmosphere names, scored over every subset in paint order

**Files:**
- Modify: `src/styles/tokens.css` (the four atmosphere tokens, `body::before`, the print block, two comments)
- Modify: `tests/unit/contrast.test.ts` (`ATMOSPHERE`, `PAIRS`, the pair loop, the classification test)
- Modify: `CLAUDE.md` (the "Accent `#0A7D66`" line)

**Interfaces:**
- Consumes: `ATMOSPHERE`, `atmosphereLayers`, `worstContrast`, `rootTokens`, `tokensCss` (Task 1).
- Produces: the token names `--pool-top-left`, `--pool-top-right`, `--pool-foot` and `--shaft`, which PR 2's Studio values use.

- [ ] **Step 1: Write the failing pin** in `contrast.test.ts`, as the first test of `describe('the palette meets WCAG AA by computation, not by comment')`:

```ts
  it('reads the atmosphere from body::before, top-first, named by position', () => {
    expect(atmosphereLayers(tokensCss())).toEqual([
      '--pool-top-left',
      '--pool-top-right',
      '--pool-foot',
      '--shaft',
    ]);
  });
```

  Add `ATMOSPHERE`, `atmosphereLayers` and `worstContrast` to the import from `'../palette'`.

- [ ] **Step 2: Run it and watch it fail.**
  - Run: `npx vitest run tests/unit/contrast.test.ts -t "named by position"`
  - Expected: FAIL. Received `['--aurora-mint', '--aurora-violet', '--aurora-deep', '--aurora-shaft']`.

- [ ] **Step 3: Rename the tokens in `tokens.css`.** Each old name appears exactly three times: its declaration on `:root`, its `var()` in `body::before`, and its `transparent` line in the print block.
  - Replace each name as a whole word: `--aurora-mint` → `--pool-top-left`, `--aurora-violet` → `--pool-top-right`, `--aurora-deep` → `--pool-foot`, `--aurora-shaft` → `--shaft`.
  - Then confirm with `git grep -n -e '--aurora-' -- src tests`. Expected: no output, and exit 1. Put a known positive beside it: `git grep -c -e '--pool-foot' -- src/styles/tokens.css` must print `3`.

- [ ] **Step 4: Score by subset in `contrast.test.ts`.**
  - Delete the local `ATMOSPHERE` array and its doc comment; the placeholder now comes from `../palette`.
  - Change the four atmosphere pairs:

    ```ts
      {
        fg: ['--ink'],
        bg: [ATMOSPHERE, '--bg'],
        level: 'body',
        where: 'body copy over the atmosphere, at its worst subset of layers',
      },
      {
        fg: ['--ink-soft'],
        bg: [ATMOSPHERE, '--bg'],
        level: 'body',
        where:
          'secondary copy over the atmosphere — the knife edge. At top-left .10 / top-right .14 / foot .18 this scored 4.48:1, a failure by 0.02 that no single layer shows',
      },
      {
        fg: ['--accent'],
        bg: [ATMOSPHERE, '--bg'],
        level: 'body',
        where: 'link text and section kickers over the atmosphere',
      },
      {
        fg: ['--border-strong', ATMOSPHERE, '--bg'],
        bg: [ATMOSPHERE, '--bg'],
        level: 'ui',
        where: 'control boundaries over the atmosphere (WCAG 1.4.11)',
      },
    ```

  - Replace the body of `it('every declared pair clears its required ratio', …)`:

    ```ts
      it('every declared pair clears its required ratio, over the worst subset of the atmosphere', () => {
        const css = tokensCss();
        const from = rootTokens(css);
        const layers = atmosphereLayers(css);
        const failures = PAIRS.flatMap((pair) => {
          const scored = worstContrast(pair.fg, pair.bg, layers, from);
          if (typeof scored === 'string') return [`${pairName(pair)} — ${scored}`];
          const need = LEVELS[pair.level];
          return scored.ratio >= need
            ? []
            : [
                `${pairName(pair)} — ${scored.ratio.toFixed(2)}:1 over ` +
                  `[${scored.subset.join(', ') || 'no layer'}], needs ${need}:1`,
              ];
        });

        expect(
          searched(failures, { of: PAIRS, what: 'declared colour pairs' }),
        ).toEqual([]);
      });
    ```

  - In `it('every colour token is classified …')`, expand the placeholder, so that the four layers count as paired:

    ```ts
        const layers = atmosphereLayers(tokensCss());
        const paired = new Set(
          PAIRS.flatMap((p) => [...p.fg, ...p.bg]).flatMap((layer) =>
            layer === ATMOSPHERE ? layers : [layer],
          ),
        );
    ```

- [ ] **Step 5: Correct the atmosphere comment in `tokens.css`.** Its opening already says "three radial stops and a white shaft, painted on body::before". Replace the remainder, from "Text IS read over these" through "These values leave it at 5.11:1.":

```css
  /* The atmosphere: three radial pools and a white shaft, painted on
     body::before. Named by POSITION, not by hue (#142): the same layer
     carries window light in one theme and mint in the other. Text IS read
     over these, so the alphas are not a taste decision. contrast.test.ts
     scores every text token against every SUBSET of the four layers, in
     the order body::before paints them (the first layer on top), and keeps
     the worst.

     The knife edge is --ink-soft: 5.22:1 at its worst subset, which is all
     four layers at once. At top-left .10 / top-right .14 / foot .18 it
     scored 4.48:1, a FAILURE by 0.02 that no layer shows on its own. */
```

  Expected figures, from Task 1's model on today's values, with the worst subset all four layers in every case: `--ink` 11.53, `--ink-soft` 5.22, `--accent` 9.31 and `--border-strong` 3.44. The old hand-written stack read 5.05 for `--ink-soft`.

- [ ] **Step 6: Correct `CLAUDE.md`.** The line `- **Accent `#0A7D66`** is the AA floor — never lighten it without re-checking contrast.` predates Aurora; the accent is `#38f5c8` now, and #142 adds a second. Replace it with:

```markdown
- **The palette's AA floor is computed, not remembered.** `tests/unit/contrast.test.ts` scores every token pair the site paints, over the worst subset of the page atmosphere, and fails any pair under its WCAG level. Change a colour and the suite says whether it still clears; no hex value in this file is the floor.
```

- [ ] **Step 7: Run the whole unit suite and watch it pass.**
  - Run: `npm run test:unit`
  - Expected: all green, and the total equals the baseline plus 10 (Task 1) plus 1.

- [ ] **Step 8: Commit.**

```bash
git add src/styles/tokens.css tests/unit/contrast.test.ts CLAUDE.md
git commit -m "test(unit): score the atmosphere over every subset, in the order it is painted

The atmosphere tokens are named by position, and the stack is derived from
body::before. The worst case is taken over every subset of its layers.

Refs #142"
```

---

### Task 3: Every token is read; the three that are not retire

**Files:**
- Create: `tests/unit/tokens.test.ts`
- Modify: `src/styles/tokens.css` (`--violet`, `--deep`, `--glass-2`)
- Modify: `tests/unit/contrast.test.ts` (their `DECORATIVE` entries and the `--glass-2` pair)

**Interfaces:**
- Consumes: `rootTokens`, `tokensCss` (Task 1); `codeWithoutComments` (`tests/unit/source-text.ts`); `filesUnder`, `searched` (`tests/source-files.ts`).
- Produces: `tests/unit/tokens.test.ts`, which PR 2 extends with the dark-block guards.

- [ ] **Step 1: Write the failing guard** in `tests/unit/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { filesUnder, searched } from '../source-files';
import { codeWithoutComments } from './source-text';
import { rootTokens, tokensCss } from '../palette';

/**
 * The structure of tokens.css (#142).
 *
 * A token nothing reads is the cheapest evidence that a described feature
 * was never built: `--violet` and `--deep` were documented as "gradient stops
 * in the page atmosphere" while the atmosphere drew from its own tokens.
 */
describe('the token file', () => {
  it('declares no token that nothing reads', () => {
    const tokens = [...rootTokens(tokensCss()).keys()];
    const code = filesUnder('src', (path) => /\.(astro|css|ts)$/.test(path))
      .map((file) => codeWithoutComments(file, readFileSync(file, 'utf8')))
      .join('\n');
    const unread = tokens.filter(
      (name) => !new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(code),
    );

    expect(searched(unread, { of: tokens, what: 'tokens on bare :root' })).toEqual(
      [],
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**
  - Run: `npx vitest run tests/unit/tokens.test.ts`
  - Expected: FAIL, received exactly `['--violet', '--deep', '--glass-2']`.

- [ ] **Step 3: Retire the three tokens.**
  - In `tokens.css`:
    - delete `--violet: #7a5cff;` and `--deep: #184a6e;` from `:root`;
    - delete `--glass-2: rgb(255 255 255 / 0.09);` from `:root`;
    - delete `--glass-2: transparent;` from the print block.
  - In `contrast.test.ts`:
    - delete the `'--deep'` and `'--violet'` entries of `DECORATIVE`;
    - delete the pair `{ fg: ['--ink-soft'], bg: ['--glass-2', '--bg'], … }`;
    - in the `--disabled-fill` pair's `where`, replace "the reasoning `--deep`'s entry records" with "the reasoning that puts every ground a text colour sits on into a pair".

- [ ] **Step 4: Run the whole unit suite and watch it pass.**
  - Run: `npm run test:unit`
  - Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add tests/unit/tokens.test.ts src/styles/tokens.css tests/unit/contrast.test.ts
git commit -m "test(unit): a token nothing reads retires

Refs #142"
```

---

### Task 4: The glass pair as drawn, and link hover over the atmosphere

**Files:**
- Modify: `tests/unit/contrast.test.ts` (`PAIRS`)

**Interfaces:**
- Consumes: `ATMOSPHERE` (Task 1).
- Produces: the pair set PR 2 runs against both palettes.

- [ ] **Step 1: Replace the three glass pairs with the one that is drawn.** Delete `--ink` on `['--glass', '--bg']` and `--ink-soft` on `['--glass', '--bg']`, and change the `--accent` glass pair to:

```ts
  {
    fg: ['--accent'],
    bg: ['--glass', '--surface'],
    level: 'body',
    where:
      "the work-card badge: accent text on its glass fill, inside a card whose own background is the opaque --surface (WorkCard.astro). --glass is drawn nowhere else, and never under --ink or --ink-soft",
  },
```

- [ ] **Step 2: Add the link-hover pair over the atmosphere,** after the `--accent` atmosphere pair:

```ts
  {
    fg: ['--accent-ink'],
    bg: [ATMOSPHERE, '--bg'],
    level: 'body',
    where: 'link hover (a:hover in tokens.css), drawn wherever a link sits, so over the atmosphere too',
  },
```

- [ ] **Step 3: Run the suite and watch it pass.** Both pairs clear on today's values (`--accent-ink` measures 10.69 at its worst subset).
  - Run: `npx vitest run tests/unit/contrast.test.ts`
  - Expected: PASS.

- [ ] **Step 4: Watch the new pair fail on its own.** The value `#728fac` clears every other `--accent-ink` pair: 5.99 on `--bg`, 5.79 on `--surface`, and 5.61 under `--on-accent`. It fails only over the atmosphere, at 3.86.
  - In `tokens.css`, set `--accent-ink: #728fac;`.
  - Run: `npx vitest run tests/unit/contrast.test.ts`
  - Expected: exactly one failure, naming `--accent-ink on (the atmosphere) over --bg` at 3.86:1 over all four layers.
  - Restore the file with `git checkout -- src/styles/tokens.css`.
  - Run the file again and expect PASS.

- [ ] **Step 5: Commit.**

```bash
git add tests/unit/contrast.test.ts
git commit -m "test(unit): contrast pairs follow the ground each colour is painted on

Refs #142"
```

---

### Task 5: The phone mockup's shadow becomes `--lift-shadow`

**Files:**
- Modify: `src/styles/tokens.css` (after `--dock-shadow`)
- Modify: `tests/unit/contrast.test.ts` (`DECORATIVE`)
- Modify: `src/components/PhoneFrame.astro` (the `.frame` `box-shadow`)

**Interfaces:**
- Consumes: `tests/unit/tokens.test.ts` (Task 3).
- Produces: `--lift-shadow`, which PR 2's Studio block sets to `rgb(17 24 33 / 0.18)`.

- [ ] **Step 1: Declare the token and classify it.** In `tokens.css`, after `--dock-shadow`:

```css
  /* The phone mockup's shadow (PhoneFrame.astro). Decorative, like the dock
     shadow above: nothing is read against it. A token so a lighter palette
     can soften it (#142); this is the value the frame hard-coded. */
  --lift-shadow: rgb(0 0 0 / 0.55);
```

  In `contrast.test.ts`'s `DECORATIVE`:

```ts
  '--lift-shadow':
    "the phone mockup's shadow (PhoneFrame.astro). A box-shadow: nothing is read against it, and 1.4.11 reaches only what identifies a control.",
```

- [ ] **Step 2: Run the token guard and watch it fail.**
  - Run: `npx vitest run tests/unit/tokens.test.ts`
  - Expected: FAIL, received `['--lift-shadow']`.

- [ ] **Step 3: Use the token.** In `PhoneFrame.astro`, `box-shadow: 0 24px 60px -20px rgb(0 0 0 / 0.55);` becomes `box-shadow: 0 24px 60px -20px var(--lift-shadow);`.

- [ ] **Step 4: Run the whole unit suite and watch it pass.**
  - Run: `npm run test:unit`
  - Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add src/styles/tokens.css tests/unit/contrast.test.ts src/components/PhoneFrame.astro
git commit -m "fix(phone-frame): the mockup's shadow is a token

Refs #142"
```

---

### Task 6: Paper in one place, and colours written in code

**Files:**
- Modify: `tests/unit/css-rules.ts` (add `onPaper`, `codeColourLiterals`)
- Modify: `tests/unit/css-rules.test.ts`
- Modify: `tests/unit/literal-grounds.test.ts` (the paper exemption)

**Interfaces:**
- Consumes: `NAMED_COLOURS`, `colourLiterals` (#332).
- Produces:
  - `onPaper(chain: readonly string[]): boolean`
  - `codeColourLiterals(code: string): string[]`

  Task 7 uses both.

- [ ] **Step 1: Add throwing stubs to `css-rules.ts`:**

```ts
export const onPaper = (chain: readonly string[]): boolean => {
  throw new Error(`not implemented: ${chain.length}`);
};
export const codeColourLiterals = (code: string): string[] => {
  throw new Error(`not implemented: ${code.length}`);
};
```

- [ ] **Step 2: Write the failing tests** in `css-rules.test.ts`, adding both names to its import:

```ts
describe('onPaper', () => {
  it('holds for a rule inside a print-only media block, and only there', () => {
    expect(
      [
        ['@media print', '.a'],
        ['@media only print', '.a'],
        ['@media print and (orientation: portrait)', '.a'],
        ['@media screen', '@media print', '.a'],
      ].filter((chain) => !onPaper(chain)),
    ).toEqual([]);
    expect(
      [
        ['.a'],
        ['@media screen', '.a'],
        ['@media screen, print', '.a'],
        ['@media not print', '.a'],
      ].filter((chain) => onPaper(chain)),
    ).toEqual([]);
  });
});

describe('codeColourLiterals', () => {
  it('finds hex and colour functions anywhere in code', () => {
    expect(
      codeColourLiterals(
        "const tile = '#0f0d15';\nconst c = `rgb(${r}, ${g}, ${b})`;\nfill=\"#FF0\"\n'hsl(214 92% 88%)' 'oklch(70% 0.1 200)'",
      ),
    ).toEqual(['#0f0d15', '#FF0', 'rgb(${r}, ${g}, ${b})', 'hsl(214 92% 88%)', 'oklch(70% 0.1 200)']);
  });

  it('finds a named colour only as a whole string or in a style attribute', () => {
    expect(
      codeColourLiterals(
        "const a = 'white';\nconst b = 'white rabbit';\n<p style=\"color: Red; margin: 0\">x</p>",
      ),
    ).toEqual(['white', 'Red']);
  });

  it('never reads a character reference or a call named color() as a colour', () => {
    expect(codeColourLiterals('&#123; &#x2014; color(x) theme.color(y)')).toEqual([]);
  });

  it('finds a hex-shaped issue number too, which only an allowlist can excuse', () => {
    expect(codeColourLiterals("'see #161 for why'")).toEqual(['#161']);
  });
});
```

- [ ] **Step 3: Run it and watch the new tests fail on their own assertions.**
  - Run: `npx vitest run tests/unit/css-rules.test.ts`
  - Expected: the 5 new tests fail with `not implemented`, and #332's tests still pass.

- [ ] **Step 4: Implement both** in `css-rules.ts`, replacing the stubs:

```ts
/**
 * Whether a rule reaches paper only: some block around it is a print-only
 * media query. One definition, because two guards exempt paper for the same
 * reason. The print block in tokens.css fixes every token there, so no theme
 * reaches paper and no literal on paper escapes one.
 */
export const onPaper = (chain: readonly string[]): boolean =>
  chain.some((header) => /^@media (?:only )?print(?: and .*)?$/i.test(header));

/** A string whose whole content is a named colour: `'white'`, never `'white rabbit'`. */
const NAMED_STRING = new RegExp(`(['"\`])(${NAMED_COLOURS.join('|')})\\1`, 'gi');

/** A `style="…"` attribute's CSS. */
const STYLE_ATTRIBUTE = /\bstyle=(["'])(.*?)\1/g;

/** As COLOUR_FUNCTION, less `color()`: in code that is a call, not a colour. */
const CODE_FUNCTION =
  /(?<![\w.-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\((?:[^()]|\([^()]*\))*\)/gi;

/**
 * Every colour literal in comment-free CODE: TypeScript, or an .astro file's
 * frontmatter, template and scripts.
 *
 * - A hex or a colour function counts anywhere, because in code they are
 *   written inside strings.
 * - A named colour counts only as a whole string, or inside a `style`
 *   attribute: `'white'` is a colour, and `'white rabbit'` is prose.
 * - A hex-shaped issue number in prose (`#161`) is found too. No detector
 *   can tell it from a colour, so it is excused by name in the guard's
 *   allowlist, never by a rule here.
 */
export const codeColourLiterals = (code: string): string[] => [
  ...[...code.matchAll(HEX)].map((match) => match[0]),
  ...[...code.matchAll(CODE_FUNCTION)].map((match) => match[0]),
  ...[...code.matchAll(NAMED_STRING)].map((match) => match[2]),
  ...[...code.matchAll(STYLE_ATTRIBUTE)].flatMap((match) =>
    colourLiterals(match[2]).filter((literal) =>
      NAMED_COLOURS.includes(literal.toLowerCase()),
    ),
  ),
];
```

- [ ] **Step 5: Give `literal-grounds.test.ts` the one definition of paper.**
  - Import `onPaper` from `'./css-rules'`.
  - Replace the first `EXEMPT` entry's `covers` with `covers: onPaper,`, keeping its reason.

- [ ] **Step 6: Run both files and watch them pass.**
  - Run: `npx vitest run tests/unit/css-rules.test.ts tests/unit/literal-grounds.test.ts`
  - Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add tests/unit/css-rules.ts tests/unit/css-rules.test.ts tests/unit/literal-grounds.test.ts
git commit -m "test(unit): paper has one definition, and code has a colour reader

Refs #142"
```

---

### Task 7: No colour a theme cannot see

**Files:**
- Create: `tests/unit/colour-literals.test.ts`
- Modify: `src/components/LanguageSwitcher.astro` (two `var(--surface, …)` fallbacks)
- Modify: `src/components/pages/ClassroomGroupsPage.astro` (the `.actions` fallbacks; the comment near "0.65, not the 0.55")
- Modify: `tests/unit/contrast.test.ts` (`DECORATIVE_SELECTORS` gains `.actions`)

**Interfaces:**
- Consumes: `cssRules`, `colourLiterals`, `onPaper`, `codeColourLiterals` (#332, Task 6); `stylesheetCss`, `withoutAstroComments`, `withoutAstroStyles`, `withoutTsComments` (`source-text.ts`); `TOKENS_FILE` (Task 1).
- Produces: the allowlist PR 2 extends.

- [ ] **Step 1: Write the guard** in `tests/unit/colour-literals.test.ts`. Its allowlist holds today's legitimate literals, so the only findings left are the dead fallbacks:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { filesUnder, searched } from '../source-files';
import {
  stylesheetCss,
  withoutAstroComments,
  withoutAstroStyles,
  withoutTsComments,
} from './source-text';
import {
  codeColourLiterals,
  colourLiterals,
  cssRules,
  onPaper,
} from './css-rules';
import { TOKENS_FILE } from '../palette';

/**
 * No colour a theme cannot see (#142 spec §6.6).
 *
 * Theme logic lives only in tokens.css; components read tokens and never test
 * the theme. So a colour written straight into a component is the one thing a
 * theme cannot reach. Every literal outside tokens.css is refused unless it is
 * allowlisted here with its reason. Paper is exempt by rule, not by entry
 * (`onPaper`): no theme reaches it.
 */

type Literal = { file: string; rule?: readonly string[]; literal: string };

const codeOf = (file: string, text: string): string =>
  file.endsWith('.astro')
    ? withoutAstroComments(withoutAstroStyles(text))
    : withoutTsComments(text);

const literalsIn = (file: string, text: string): Literal[] => [
  ...(file.endsWith('.ts')
    ? []
    : stylesheetCss(file, text).flatMap((css) =>
        cssRules(css)
          .filter(({ chain }) => !onPaper(chain))
          .flatMap(({ chain, declarations }) =>
            declarations.flatMap(({ value }) =>
              colourLiterals(value).map((literal) => ({ file, rule: chain, literal })),
            ),
          ),
      )),
  ...(file.endsWith('.css')
    ? []
    : codeColourLiterals(codeOf(file, text)).map((literal) => ({ file, literal }))),
];

const REASON = {
  callout:
    'a light callout on /classroom-groups: it paints its own ground, ink and edge, so it reads the same over either theme (literal-grounds.test.ts holds the pairing)',
  shadow: 'a shadow: black at low alpha darkens any ground, and nothing is read against it',
  hairline:
    "a flag's hairline: it keeps a flag with a white edge distinct on a light ground, and is invisible but harmless on a dark one",
  scrim: "the print panel's backdrop: a black scrim dims either ground, and holds no text",
  brand: "ShyTalk's own brand constants (#142 spec §3.4): the same in both themes by design",
  flags: 'national flag artwork: a flag keeps its own colours in every theme',
  avatars:
    'student avatar artwork: each avatar paints its own disc behind its figure, so it reads the same over either theme',
  issue:
    'an issue number in prose, not a colour: `#161` is hex-shaped, and no detector can tell the two apart',
} as const;

type Allowance = {
  file: string;
  /** The rule's whole chain; absent for a colour written in code. */
  rule?: readonly string[];
  /** Absent for a file whose every literal is its purpose. */
  literals?: readonly string[];
  reason: string;
};

const CG = 'src/components/pages/ClassroomGroupsPage.astro';

const ALLOWED: Allowance[] = [
  { file: 'src/components/Flag.astro', rule: ['.flag'], literals: ['rgb(0 0 0 / 0.18)'], reason: REASON.hairline },
  { file: 'src/components/LanguageSwitcher.astro', rule: ['ul'], literals: ['rgb(0 0 0 / 0.12)'], reason: REASON.shadow },
  { file: CG, rule: ['#cg-roster .cg-student.is-absent'], literals: ['#fff6e3', '#1a1a1a', '#d9a441'], reason: REASON.callout },
  { file: CG, rule: ['#cg-roster .cg-absent-pill'], literals: ['#8a6a10', '#fff'], reason: REASON.callout },
  {
    file: CG,
    rule: ['@media (min-width: 768px)', '#cg-roster .cg-student.is-absent > td:first-child'],
    literals: ['#d9a441'],
    reason: REASON.callout,
  },
  { file: CG, rule: ['.cg-io-both-target .flag'], literals: ['rgb(0 0 0 / 0.18)'], reason: REASON.hairline },
  { file: CG, rule: ['.cg-print-panel::backdrop'], literals: ['rgb(0 0 0 / 45%)'], reason: REASON.scrim },
  { file: CG, rule: ['.cg-roster-limit-message'], literals: ['#b3261e', '#8c1d18', '#fdecea'], reason: REASON.callout },
  { file: CG, rule: ['.error'], literals: ['#b3261e', '#8c1d18', '#fdecea'], reason: REASON.callout },
  { file: CG, rule: ['.roster-warning'], literals: ['#956b1e', '#fff6e3', '#1a1a1a'], reason: REASON.callout },
  { file: CG, rule: ['.stale-notice'], literals: ['#956b1e', '#fff6e3', '#1a1a1a'], reason: REASON.callout },
  { file: 'src/lib/shytalk-brand.ts', reason: REASON.brand },
  { file: 'src/lib/i18n/flags.ts', reason: REASON.flags },
  { file: 'src/lib/avatars.ts', reason: REASON.avatars },
  { file: 'src/lib/i18n/back-translate.ts', literals: ['#161'], reason: REASON.issue },
];

const sameChain = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((header, i) => header === b[i]);

const allows = (allowance: Allowance, found: Literal): boolean =>
  allowance.file === found.file &&
  (allowance.rule === undefined ||
    (found.rule !== undefined && sameChain(allowance.rule, found.rule))) &&
  (allowance.literals === undefined || allowance.literals.includes(found.literal));

const describeLiteral = ({ file, rule, literal }: Literal): string =>
  `${file} :: ${rule === undefined ? '(code)' : rule.join(' { ')} writes ${literal}`;

const literalsUnderSrc = (): Literal[] =>
  filesUnder('src', (path) => /\.(astro|css|ts)$/.test(path) && path !== TOKENS_FILE).flatMap(
    (file) => literalsIn(file, readFileSync(file, 'utf8')),
  );

describe('no colour a theme cannot see (#142)', () => {
  it('writes no colour literal outside tokens.css but the allowed ones', () => {
    const found = literalsUnderSrc();
    const refused = found
      .filter((literal) => !ALLOWED.some((allowance) => allows(allowance, literal)))
      .map(describeLiteral);
    expect(
      searched(refused, { of: found.map(describeLiteral), what: 'colour literals under src/' }),
    ).toEqual([]);
  });

  it('allows nothing the reader cannot find', () => {
    const found = literalsUnderSrc();
    const idle = ALLOWED.flatMap((allowance) =>
      (allowance.literals ?? [undefined]).flatMap((literal) =>
        found.some(
          (f) =>
            allows({ ...allowance, literals: undefined }, f) &&
            (literal === undefined || f.literal === literal),
        )
          ? []
          : [`${allowance.file} :: ${allowance.rule?.join(' { ') ?? '(code)'} ${literal ?? '(any)'}`],
      ),
    );
    expect(
      searched(idle, { of: found.map(describeLiteral), what: 'colour literals under src/' }),
    ).toEqual([]);
  });

  it('reads CSS by rule and skips paper, and reads code whole', () => {
    const control = literalsIn('x.css', '.a { color: #fff; }');
    expect(control.map(describeLiteral)).toEqual(['x.css :: .a writes #fff']);
    expect(
      searched(literalsIn('x.css', '@media print { .a { color: #fff; } }'), {
        of: control,
        what: 'the same rule on screen',
      }),
    ).toEqual([]);
    expect(
      literalsIn(
        'x.astro',
        "---\nconst c = 'white';\n---\n<p style=\"color: red\">&#123;</p>\n<style>\n  .b { border: 1px solid oklch(70% 0.1 200); }\n</style>\n",
      ).map(describeLiteral),
    ).toEqual([
      'x.astro :: .b writes oklch(70% 0.1 200)',
      'x.astro :: (code) writes white',
      'x.astro :: (code) writes red',
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail on exactly the dead fallbacks.**
  - Run: `npx vitest run tests/unit/colour-literals.test.ts`
  - Expected: the first test FAILS, with exactly these four refusals:
    - `src/components/LanguageSwitcher.astro :: summary:hover, summary:focus-visible writes rgb(0 0 0 / 0.04)`
    - `src/components/LanguageSwitcher.astro :: li a:hover, li a:focus-visible writes rgb(0 0 0 / 0.06)`
    - `src/components/pages/ClassroomGroupsPage.astro :: @media screen { .actions writes #f7f6f2`
    - `src/components/pages/ClassroomGroupsPage.astro :: @media screen { .actions writes #e7e4dc`
  - The other two tests PASS.
  - If #330 has merged, the switcher's selectors may read differently. The guard prints them: use what it prints.
  - Any refusal beyond these four is a finding. Classify it with a reason, or remove it, and record it in the PR.

- [ ] **Step 3: Remove the dead fallbacks.** Every token is always defined, so the fallback never applies (§7).
  - `LanguageSwitcher.astro`: both `background: var(--surface, rgb(0 0 0 / 0.04));` and `background: var(--surface, rgb(0 0 0 / 0.06));` become `background: var(--surface);`.
  - `ClassroomGroupsPage.astro`, `.actions` inside `@media screen`:
    - `background: var(--bg, #f7f6f2);` becomes `background: var(--bg);`
    - `border-top: 1px solid var(--border, #e7e4dc);` becomes `border-top: 1px solid var(--border);`

- [ ] **Step 4: Run the unit suite and watch the border classification go red.** The fallback had hidden `.actions` from it.
  - Run: `npm run test:unit`
  - Expected: `contrast.test.ts` › *every --border usage is classified as control or decorative* FAILS, naming `components/pages/ClassroomGroupsPage.astro :: .actions`. Nothing else fails.

- [ ] **Step 5: Classify it.** The docked bar's top rule separates it from what scrolls beneath it, and identifies no control. Add to `DECORATIVE_SELECTORS`:

```ts
  'components/pages/ClassroomGroupsPage.astro :: .actions',
```

- [ ] **Step 6: Correct the pre-Aurora comment** in `ClassroomGroupsPage.astro`. Replace the paragraph beginning "0.65, not the 0.55 an earlier pass shipped" through "clear of the floor with margin rather than sitting on it." with:

```css
     0.65, not the 0.55 an earlier pass shipped: `.group` paints no
     background of its own, so this opacity composites `--ink` directly over
     whatever the page's ground is. On the palette of the time, 0.55
     measured 3.89:1, under the 4.5:1 AA floor for normal text, and a
     teacher reading a projected screen while it is true is exactly the
     case design spec section 8 keeps the old groups VISIBLE for, not an
     incidental label the AA exemption would cover. No figure is kept here
     because the palette moves (#17, #142): the test named below measures
     the real composite in every run.
```

  Keep the sentence that follows ("Guarded by tests/e2e/classroom-groups.spec.ts's …") as it is.

- [ ] **Step 7: Run the whole unit suite and watch it pass.**
  - Run: `npm run test:unit`
  - Expected: all green.

- [ ] **Step 8: Commit.**

```bash
git add tests/unit/colour-literals.test.ts tests/unit/contrast.test.ts src/components/LanguageSwitcher.astro src/components/pages/ClassroomGroupsPage.astro
git commit -m "test(unit): no colour a theme cannot see

Every colour literal outside tokens.css is refused unless it is allowlisted
with its reason. The dead var() fallbacks go, and with them the spelling
that hid .actions' border from its classification.

Refs #142"
```

---

### Task 8: Every Playwright project declares its colour scheme

**Files:**
- Modify: `playwright.config.ts`, `playwright.dev.config.ts`, `playwright.prod.config.ts`, `playwright.device.config.ts` (each config's top-level `use`)
- Modify: `tests/unit/browser-matrix.test.ts` (the local `ResolvedProject` type, and a new `describe`)

**Interfaces:**
- Consumes: `resolvedProjects(userConfig, configFile)`, `VISUAL_PROJECT` and `VISUAL_MEASURE_PROJECT` (all already in or imported by `browser-matrix.test.ts`).
- Produces: `colorScheme: 'dark'` on every project. PR 2 adds the per-theme runs as `test.use({ colorScheme })` inside the specs.

- [ ] **Step 1: Write the failing guard** at the end of `browser-matrix.test.ts`.
  - Add `use: { colorScheme?: unknown };` to the local `ResolvedProject` type.
  - Import `readdirSync` from `node:fs`.
  - Add `VISUAL_PROJECT` and `VISUAL_MEASURE_PROJECT` to the import from `'../../playwright.config'` if either is missing.
  - Then add:

```ts
/**
 * Every project in every Playwright config declares its colour scheme (#142
 * spec §6.2).
 *
 * No config set one, so every project ran under Playwright's default, light.
 * The day the site gains a light palette, every existing test would silently
 * start testing it. The configs are derived from the repository root, so a
 * fifth config cannot slip past. The main config declares its visual projects
 * only under an environment flag, so they are appended here, where no flag can
 * hide one.
 */
describe('every project declares its colour scheme (#142)', () => {
  const CONFIG = /^playwright.*\.config\.[cm]?[jt]s$/;

  /** A config's module, with any variable its import sets put back. */
  const importConfig = async (file: string): Promise<PlaywrightTestConfig> => {
    const before = { ...process.env };
    try {
      return (await import(resolve(file))).default as PlaywrightTestConfig;
    } finally {
      for (const key of Object.keys(process.env))
        if (!(key in before)) delete process.env[key];
      Object.assign(process.env, before);
    }
  };

  it('finds a config by the name Playwright gives one', () => {
    const names = [
      'playwright.config.ts',
      'playwright.dev.config.ts',
      'playwright-ct.config.ts',
      'playwright.x.config.mjs',
      'playwright.config.ts.bak',
      'my.playwright.config.ts',
      'playwright.ts',
    ];
    expect(names.filter((name) => CONFIG.test(name))).toEqual([
      'playwright.config.ts',
      'playwright.dev.config.ts',
      'playwright-ct.config.ts',
      'playwright.x.config.mjs',
    ]);
  });

  it('runs every resolved project light or dark, never the default', async () => {
    const configs = readdirSync('.').filter((name) => CONFIG.test(name)).sort();
    const projects: string[] = [];
    const undeclared: string[] = [];
    for (const file of configs) {
      const loaded = await importConfig(file);
      const extra =
        file === 'playwright.config.ts' ? [VISUAL_PROJECT, VISUAL_MEASURE_PROJECT] : [];
      for (const project of resolvedProjects(
        { ...loaded, projects: [...(loaded.projects ?? []), ...extra] },
        file,
      )) {
        projects.push(`${file} › ${project.name}`);
        const scheme = project.use.colorScheme;
        if (scheme !== 'light' && scheme !== 'dark')
          undeclared.push(`${file} › ${project.name}: ${String(scheme)}`);
      }
    }
    expect(searched(undeclared, { of: projects, what: 'Playwright projects' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**
  - Run: `npx vitest run tests/unit/browser-matrix.test.ts -t "colour scheme"`
  - Expected: FAIL, with every project listed as `undefined`: the 8 of `playwright.config.ts` (content, the five engines, visual, visual-measure), `playwright.dev.config.ts › chromium`, `playwright.prod.config.ts › chromium`, and the device config's `android-preflight` and `android-chrome`.
  - If `project.use` is itself undefined, Playwright's resolver is not merging the top-level `use` as expected. Read `FullConfigInternal` in `node_modules/playwright/lib/common/config.js` before changing anything.

- [ ] **Step 3: Declare `dark` in each config's top-level `use`,** so every project, present or future, inherits it:
  - `playwright.config.ts`: in `use: { baseURL: 'http://localhost:4321', …`, add `colorScheme: 'dark',` after `baseURL`, with the comment `// #142: the palette every existing test was written against. A light-theme run declares light itself.`
  - `playwright.dev.config.ts`: add `colorScheme: 'dark',` after `baseURL`.
  - `playwright.prod.config.ts`: add `colorScheme: 'dark',` after `baseURL`.
  - `playwright.device.config.ts`: `use: { baseURL: 'http://localhost:4321' },` becomes `use: { baseURL: 'http://localhost:4321', colorScheme: 'dark' },`. On a real phone driven over CDP this declaration is not yet applied. PR 2 pins the theme per run (§6.2). Aurora is still the only palette until then.

- [ ] **Step 4: Run the whole unit suite and watch it pass.**
  - Run: `npm run test:unit`
  - Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add playwright.config.ts playwright.dev.config.ts playwright.prod.config.ts playwright.device.config.ts tests/unit/browser-matrix.test.ts
git commit -m "test(e2e): every Playwright project declares its colour scheme

Refs #142"
```

---

### Task 9: Watch every guard fail

**Files:**
- Create (scratchpad, never committed): `mutate142a.mjs`

- [ ] **Step 1: Write the harness** in the scratchpad, on a committed tree. Write every prediction in before any run.
  - Each mutation matches its anchor exactly once, or it is not run.
  - The files are restored from `HEAD` and checked afterwards.
  - A run with no totals line, or a denominator unlike the baseline's, is BROKEN, never RED.

```js
// mutate142a.mjs: node mutate142a.mjs [ID ...], from the repo root, on a committed tree.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const UNIT = ['palette', 'tokens', 'contrast', 'css-rules', 'literal-grounds', 'colour-literals', 'browser-matrix']
  .map((name) => `tests/unit/${name}.test.ts`);

// One entry per row of the table in Step 2: { id, file, anchor, to, fails: [test-title substrings] }.
// S2 creates a file instead: { id, create: 'playwright.x.config.ts', body, fails }.
const MUTATIONS = [/* … */];

function run() {
  const r = spawnSync('npx', ['vitest', 'run', ...UNIT], { encoding: 'utf8' });
  const out = `${r.stdout}\n${r.stderr}`;
  const totals = /Tests\s+(?:(\d+) failed \| )?(\d+) passed \((\d+)\)/.exec(out);
  if (!totals) return { broken: 'no totals line' };
  return { total: Number(totals[3]), failing: [...out.matchAll(/^\s+× (.+?)(?: \d+ms)?$/gm)].map((m) => m[1]) };
}
const restore = (file) => {
  spawnSync('git', ['checkout', 'HEAD', '--', file]);
  if (spawnSync('git', ['diff', '--quiet', 'HEAD', '--', file]).status !== 0) throw new Error(`NOT RESTORED: ${file}`);
};

if (spawnSync('git', ['diff', '--quiet', 'HEAD', '--', 'src', 'tests', 'playwright.config.ts', 'playwright.dev.config.ts']).status !== 0)
  throw new Error('uncommitted changes: commit before mutating');
const base = run();
if (base.broken) throw new Error(`baseline broken: ${base.broken}`);
console.log(`BASELINE total=${base.total} failing=${JSON.stringify(base.failing)}`);

for (const m of MUTATIONS.filter((x) => process.argv.length === 2 || process.argv.includes(x.id))) {
  if (m.create) writeFileSync(m.create, m.body);
  else {
    const before = readFileSync(m.file, 'utf8');
    const count = before.split(m.anchor).length - 1;
    if (count !== 1) { console.log(`${m.id} ANCHOR MATCHED ${count} TIMES: not run`); continue; }
    writeFileSync(m.file, before.replace(m.anchor, m.to));
  }
  const after = run();
  if (m.create) rmSync(m.create); else restore(m.file);
  if (after.broken || after.total !== base.total) { console.log(`${m.id} BROKEN (${after.broken ?? `total ${after.total} vs ${base.total}`})`); continue; }
  const newly = after.failing.filter((t) => !base.failing.includes(t));
  const ok = m.fails.every((n) => newly.some((t) => t.includes(n))) && newly.length === m.fails.length;
  console.log(`${m.id} ${newly.length === 0 ? 'GREEN (NOT CAUGHT)' : ok ? 'RED as predicted' : 'RED, NOT as predicted'}`);
  if (!ok) console.log(`   newlyFailing=${JSON.stringify(newly)}`);
}
```

- [ ] **Step 2: Run the mutations.** One per guard branch, at minimum:

| id | mutation | must turn red |
| --- | --- | --- |
| P1 | `atmosphereLayers` reverses the list | *lists the layers top-first*; *named by position* |
| P2 | `worstContrast` scores only `[layers]`, not `subsets(layers)` | *finds the worst subset*; *puts the same subset under the foreground* |
| P3 | `worstContrast` expands the placeholder in `bg` only | *puts the same subset under the foreground and its ground* |
| P4 | `rootTokens` takes the first `:root` chain at any depth | *reads the bare :root block* |
| P5 | `atmosphereLayers` accepts a layer with no token (`tokens.length > 1`) | *refuses a layer it could not score* |
| P6 | `tokens.css`: a `body::before` layer written as `rgb(255 0 0 / 0.1)` | every contrast test reading the atmosphere (the derivation throws) |
| T1 | `tokens.css`: `--unused: #123456;` added to `:root` | *declares no token that nothing reads*; *every colour token is classified* |
| T2 | `PhoneFrame.astro`: the shadow back to `rgb(0 0 0 / 0.55)` | *declares no token that nothing reads* (`--lift-shadow`); *writes no colour literal* |
| C1 | `tokens.css`: `--accent-ink: #728fac` | *every declared pair clears* (the link-hover pair only) |
| C2 | the `--accent` glass pair's ground back to `--bg`, and `--glass` set to `rgb(255 255 255 / 0.2)` | *every declared pair clears* (the glass pair) |
| L1 | `ClassroomGroupsPage.astro`: `color: #fff;` added to `.tool-section` | *writes no colour literal* |
| L2 | an allowlist entry for `#abcdef` in `.error` | *allows nothing the reader cannot find* |
| L3 | `literalsIn` drops the `onPaper` filter | *writes no colour literal* (the print rules); *reads CSS by rule and skips paper* |
| L4 | `onPaper` accepts `@media screen, print` | *holds for a rule inside a print-only media block* |
| L5 | `codeColourLiterals` drops `NAMED_STRING` | *finds a named colour only as a whole string*; *reads CSS by rule* |
| L6 | `codeColourLiterals` drops the style-attribute branch | *finds a named colour only as a whole string*; *reads CSS by rule* |
| L7 | `codeColourLiterals`' `HEX` loses `&` from its look-behind | *never reads a character reference* |
| L8 | `LanguageSwitcher.astro`: a `var(--surface, rgb(0 0 0 / 0.04))` fallback restored | *writes no colour literal* |
| S1 | `playwright.dev.config.ts`: `colorScheme` removed | *runs every resolved project light or dark* (`dev › chromium`) |
| S2 | a new root file `playwright.x.config.ts` with `export default { projects: [{ name: 'x' }] }` | the same test (`x`). Delete the file afterwards; the harness restores tracked files only. |
| S3 | `playwright.config.ts`: `colorScheme: null` | the same test (all eight main projects) |
| S4 | `CONFIG` becomes `/^playwright\.[\w-]+\.config\.ts$/` | *finds a config by the name Playwright gives one* |

  Expected: every row RED exactly as predicted. A GREEN is investigated with its three causes (CLAUDE.md, #250) before anything else. A branch no row can observe is deleted, or given its own fixture: plan one mutation per branch.

- [ ] **Step 3: Keep the log** (`mut142a.log`) for the PR and the evidence page.

---

### Task 10: Prove nothing moved, and deliver

- [ ] **Step 1: Compare the visual suite in the container, writing nothing.**
  - Run: `npm run test:visual`. It runs the pinned `linux/amd64` image; stop any other container and background job first.
  - Expected: 12 passed, and `git status --short tests/e2e/__screenshots__` prints nothing.

- [ ] **Step 2: Run the palette-reading browser specs** as the evidence run.
  - Run: `EVIDENCE_DIR=<dir> npm run test:e2e -- tests/e2e/palette-controls.spec.ts tests/e2e/print-legibility.spec.ts tests/e2e/thai-typography.spec.ts`
  - Expected: every test green in every engine.

- [ ] **Step 3: Push and open the PR.**
  - Run `npx prettier --write HANDOVER.md`, then `git push -u origin 142-light-mode-beside-aurora`.
  - Open a PR into `develop` titled "Light mode, groundwork: the palette and its guards get ready for a second theme (#142)".
  - The body carries `Refs #142`, the mutation table with its results, the contrast figures from Task 2, and the list of what the allowlist excuses and why. Check it with `node scripts/closing-keywords.mjs <file> "this pull request body"`.

- [ ] **Step 4: Wait for CI by name,** and compare the run's SHA with `gh pr view <n> --json headRefOid`. Every check must be green: `build-and-test`, `visual` and the eight e2e shards.

- [ ] **Step 5: Build and publish the evidence page,** the procedure #332 used. Call the evidence folder `<dir>` and the page folder `<p>`.
  1. `node scripts/build-evidence-page.mjs --plan --evidence <dir> --out <p>/index.html` lists the recordings to upload.
  2. Publish a placeholder `<p>/index.html` with capabilities `{"db": {}, "assets": {}}`: the uploads need the artifact's URL.
  3. Copy the planned recordings, in plan order, to `test-results/u142/NN.webm`. The folder is gitignored, and the short paths keep each batch small.
  4. Upload them with the `Artifact` tool: `asset: true`, `file_paths`, at most 25 per call. Keep each call's result: its ids are the second copy.
  5. Take `Artifact` `list` `scope: "assets"` and save it verbatim to `<p>/listing.txt`.
  6. Run `node scripts/upload-evidence-assets.mjs --plan <p>/index.html.uploads.json --listing <p>/listing.txt --out <p>/assets.json`, which pairs by sha256.
  7. Cross-check that the upload results and the listing agree id by id, and that each listing line's bytes and sha256 match its file on disk.
  8. Write the content file with the head, the mutation table, the contrast figures and the visual suite's "12 compared, 0 written".
  9. Run `node scripts/build-evidence-page.mjs --evidence <dir> --content <p>/content.json --out <p>/index.html --assets <p>/assets.json`.
  10. Republish the same path. The capabilities carry forward.
  11. Read the `signoff` collection once, and expect it empty.

- [ ] **Step 6: Merge only on the operator's sign-off.**
  - Read `signoff/ticket-142` (`grep -o -E "var DOC = [^;]*"` on the built page confirms the key).
  - Then `gh pr merge <n> --merge --match-head-commit "$(cat <file holding the head>)"`.
  - Watch `deploy-dev.yml`, then read `dev-verified` off the merge commit and every job by name.
  - #142 stays open for PR 2.
