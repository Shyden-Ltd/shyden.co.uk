# Light mode, PR 2 of 2: Studio beside Aurora (#142) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, inline in the main session (Native, the operator's choice on 2026-09-24). Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** draft, under review. Passes are logged in the Review log at the end, and the plan is approved on the first pass that finds nothing.

**Goal:** Give the site a light identity, Studio, beside the dark one it has, Aurora, switchable in one press from the header, persisted, and following the device until the visitor chooses.

**Architecture:** Studio's values move onto bare `:root`, and Aurora's into two screen-only blocks found by their `color-scheme: dark`, so the whole site changes theme through tokens alone. One inline classic script in every `<head>` (`src/scripts/theme.inline.js`, emitted by `BaseLayout.astro`) stamps a saved choice before the first paint, reveals the switch, and handles its presses by delegation. The switch is a toggle button grouped with the language switcher. The palette model in `tests/palette.ts` reads both themes, so the contrast suite, the per-theme browser runs (each of which first proves the theme it rendered) and the visual suite's 24 baselines all measure both palettes.

**Tech Stack:** Astro 7, CSS custom properties, one inline classic script (no bundle, no request), Vitest, Playwright (five engines, the `content` project, and `visual` in the pinned `linux/amd64` container), the real-device gauntlet (Android Chrome over CDP, iOS Safari over WebDriver), TypeScript with `checkJs`.

**Spec:** `docs/superpowers/specs/2026-09-23-light-mode-design.md`. This plan covers §11 step 3: everything §3 to §8 asks for that PR 1 (#337, merged as `3640af2`) did not do. PR 1's plan is `docs/superpowers/plans/2026-09-24-light-mode-1-groundwork.md`, and this plan builds on the code it left.

## Global Constraints

- **Aurora's values do not change** (§3.1, AC1). The dark set of 12 baselines keeps its file names and differs from today's only in the header, where the switch now sits (§6.5, AC12).
- **Studio's values are §3.1's, exactly:**

  | token | Studio | Aurora |
  | --- | --- | --- |
  | `--bg` | `#eef1f4` | `#04070d` |
  | `--surface` | `#ffffff` | `#070d16` |
  | `--ink` | `#111821` | `#eaf2ff` |
  | `--ink-soft` | `#4d5866` | `#8fa6c6` |
  | `--disabled-fill` | `#dde2e8` | `#2a323f` |
  | `--accent` | `#006652` | `#38f5c8` |
  | `--accent-ink` | `#004d3e` | `#7fffe0` |
  | `--on-accent` | `#ffffff` | `#04140f` |
  | `--danger` | `#b42318` | `#ff6b5a` |
  | `--border` | `rgb(17 24 33 / 0.1)` | `rgb(255 255 255 / 0.11)` |
  | `--border-strong` | `rgb(17 24 33 / 0.55)` | `rgb(255 255 255 / 0.4)` |
  | `--glass` | `rgb(17 24 33 / 0.05)` | `rgb(255 255 255 / 0.055)` |
  | `--accent-glow` | `transparent` | `rgb(56 245 200 / 0.3)` |
  | `--dock-shadow` | `rgb(17 24 33 / 0.14)` | `rgb(0 0 0 / 0.55)` |
  | `--lift-shadow` | `rgb(17 24 33 / 0.18)` | `rgb(0 0 0 / 0.55)` |
  | `--pool-top-left` | `rgb(255 255 255 / 0.7)` | `rgb(56 245 200 / 0.08)` |
  | `--pool-top-right` | `rgb(60 80 110 / 0.045)` | `rgb(122 92 255 / 0.1)` |
  | `--pool-foot` | `rgb(30 45 65 / 0.055)` | `rgb(24 74 110 / 0.14)` |
  | `--shaft` | `rgb(255 255 255 / 0.35)` | `rgb(255 255 255 / 0.05)` |
  | `--wordmark-tile` | `#0f0d15` | `transparent` |
  | `--wordmark-pad` | `0.12em 0.42em 0.18em` | `0` |
  | `--switch-moon` | `inline-block` | `none` |
  | `--switch-sun` | `none` | `inline-block` |

  `color-scheme` is `light` on bare `:root` and `dark` in every dark block; `--switch-display` is `none` on bare `:root` and `inline-flex` under `:root[data-theme-switch]` (§4).
- **Exactly one inline theme script:** classic, inline and blocking in `<head>`, straight after the viewport `<meta>`, identical to `src/scripts/theme.inline.js`. No bundle, no network request, no cookie. It writes one `localStorage` key, `theme`, only when the switch is pressed, and only the values `light` and `dark` (§2, §5).
- **An explicit choice wins in both directions; with none, the page follows `prefers-color-scheme`, live** (§2, §4, AC2).
- **The switch** is one 44 × 44 `<button type="button">` in the header, grouped with the language switcher and before it, at every width. It is a toggle button named by the locale's `themeDarkMode` ("Dark mode" in English), with `aria-pressed="true"` when dark and no `aria-pressed` until the script adds it. It shows a moon in light and a sun in dark, draws in `currentColor` from `--ink`, has a visible focus ring, switches instantly, and does not print (§5, AC3).
- **Every guard that discovers its population asserts it with `searched()`,** and every new or rewritten guard is watched failing, then passing (§6.8, CLAUDE.md).
- **No new npm dependency** (CLAUDE.md).
- **Commit messages, the PR body and every comment say `Refs #142`,** never a closing keyword beside an issue number (CLAUDE.md).
- **Merge into `develop` with a merge commit, on a comprehensive self-review:** every check green, read by name on the head being merged; the Task 12 mutation table; a full read of the diff; a grep of `tests/dev`, `tests/prod` and `tests/device` for every changed fact. Production stays the operator's (operator, 2026-09-24).
- **The visual suite runs only in the pinned container,** and nothing else runs beside a container run. Never raise Playwright's worker count (CLAUDE.md, standing rules).

## Where this plan settles what the spec leaves open

1. **`themeDarkMode` lives in `site.ts`, typed by `SiteStrings`,** not in the tool catalogue `Catalogue` that §8 names. The switch is header chrome, and the header reads `getSiteStrings`. The effect §8 wants is the same: a locale missing the key fails `astro check`. `SITE_PAGES` in `src/lib/i18n/label-check.ts` must also name the key's page, or the build does not compile.
2. **The shipped script carries no `// @ts-check`.** `tsconfig.json` already sets `checkJs: true` (#228), which type-checks every `.js` file under `src/`, so the directive would be redundant bytes on every page. Task 12's mutation T1 proves `astro check` reads the file.
3. **`parseColour` learns `transparent`.** CSS defines it as `rgb(0 0 0 / 0)`. Studio's `--accent-glow` and Aurora's `--wordmark-tile` are both `transparent`, and a token the reader cannot parse drops out of every pair it sits in. `wcag.test.ts`'s refusal list loses `transparent` and gains a positive case (Task 1).
4. **The brand guard gains one narrow exemption.** `tests/unit/shytalk-brand.test.ts` refuses the mark's colours outside `shytalk-brand.ts`, but §3.4 deliberately puts the tile in `tokens.css` as a theme token. `tokens.css` may spell `SHYTALK_MARK.tile`, once, and nothing else of the mark, and `tokens.test.ts` holds the two equal (Task 3).
5. **The mark's contrast is scored** as two pairs at the large-text level: each tone on `--wordmark-tile` over the atmosphere, in both themes (Task 3).
6. **The palette-reading set is derived, not only §6.2's list.** It is every e2e spec that reads a computed colour. Today that adds `classroom-groups-roster.spec.ts`, `disabled-controls.spec.ts`, `locale-beta.spec.ts` and `homepage.spec.ts` to §6.2's four files. The grep that derives it is in Task 7.
7. **Most per-theme runs happen inside the test,** through `emulateTheme(page, theme)` from `tests/themes.ts`. It sets the device's scheme and then proves the theme rendered, so each run asserts its theme first, the page is set up once, and what changes is exactly what a visitor's device changes. Two cases are different. The print run with a stamped choice saves `dark` and reloads. The visual suite gives each baseline its own test, so its themes are describes.
8. **The Tab-order fact keeps one home.**
   - `chrome.spec.ts` walks Shift+Tab from the language switcher to the switch, so `tabindex="-1"` goes red there.
   - `skip-link.spec.ts` walks the header's controls, derived from the DOM.
   - `theme.spec.ts`'s keyboard test proves Enter and Space activate the switch. It focuses the switch directly, so WebKit is covered too, and its mutation is a pseudo-button that ignores the keyboard (§6.8 names the Tab walks as the observers of `tabindex="-1"`).
9. **Figures in comments are the scorer's, in paint order.** Aurora's `--ink-soft` knife edge stays 5.22:1; §3.2's table took the worse of two stacking orders, 5.05:1. Studio's figures equal the table's, because its worst subset, the two shade pools, is the same in either order (measured with the repo's own model on 2026-09-24).
10. **The real Back test runs only where an engine restores from the back-forward cache.** Playwright launches Chromium with `--disable-back-forward-cache` (read in `playwright-core`'s launch switches, 2026-09-24), so `chromium` and `mobile-chrome` skip with that reason. The synthetic `pageshow` case proves the handler in every engine (§6.3).
11. **On iOS, the harness pins the palette by stamping `theme`**, because WebDriver cannot emulate a media feature on Safari. The privacy journey's rule "every key starts `cg-`" therefore excludes `theme` (Task 9).
12. **PR 1's two deferred minors.**
    - **(a)** The colour guard is widened to `.js` and `.mjs` (Task 4).
    - **(b)** Needs no change: nothing in PR 2 writes a CSS value into a TypeScript string, since the switch draws with `currentColor` in markup, so the documented trade-off stands.
13. **The evidence page (§6.7, AC18) is built after the merge,** from an evidence run at the merge commit, and does not gate the merge (operator, 2026-09-24).
14. **The branch continues as `142-light-mode-beside-aurora`,** fast-forwarded to `develop` at `3640af2`. `astro preview` serves `localhost`, not `127.0.0.1` (PR 1's Task 10).

## Review Focus

1. **A saved value that is not exactly `light` or `dark`**, such as an old or hand-edited `theme` of `Dark`, `auto` or `""`, is ignored. The device setting applies, nothing is stamped, `aria-pressed` follows the device, and the next press writes a valid value (Task 6).
2. **A double press** (a double-click, or a held Enter with key repeat) toggles once per press. After two presses, the page, `aria-pressed` and the saved value all agree on where it started (Task 6).
3. **An engine whose `MediaQueryList` has no `addEventListener`** (Safari before 14) still switches and saves, and no error reaches the console. Only `aria-pressed`'s live follow of a device change is lost (Task 6).
4. **Forced colours** (Windows High Contrast): the switch's icon stays visible, drawn in the system's own text colour, because it is `currentColor`. This runs on Chromium, the one engine that emulates `forcedColors` (Task 5).
5. **The device changes its setting while a choice is saved:** the page does not follow, because the saved choice wins, and `aria-pressed` does not flip (Task 6).

---

## Before you start

- [ ] **Confirm the base.** `git rev-parse HEAD` on `142-light-mode-beside-aurora` prints `3640af27e1cab40c1af69526d556767165a51732`, or a later `develop` merged in with `git merge origin/develop`.
- [ ] **Take the baseline.** Run `npm run test:unit` and expect every test to pass (99 files and 2408 tests at `3640af2`). Every later run is compared with these totals.
- [ ] **Commit at every green gate, and always before mutating anything** (standing rule: `git checkout` restores `HEAD`). A bare `git status --short` always lists `HANDOVER.md`, so scope any "is the tree clean" check to a path.
- [ ] **#142's card is already In Progress** on the Shyden Site board (project 2), as PR 1 left it. Read it back with `gh issue view 142 --json projectItems`, and never write to project 1.
- [ ] **Find edits by their text, never by line number.** Every anchor below is quoted from the file as `3640af2` holds it.

## File map

| file | responsibility |
| --- | --- |
| `tests/wcag.ts`, `tests/unit/wcag.test.ts` | `parseColour` reads `transparent`. |
| `tests/palette.ts`, `tests/unit/palette.test.ts` | The palette model gains the themes: `THEMES`, `rootBlock`, `darkBlocks`, `themeTokens`, `computedForm`, `themeColour`. |
| `src/styles/tokens.css` | Studio on bare `:root`; Aurora in two screen-only dark blocks; the wordmark and switch tokens; the switch's reveal rule. |
| `tests/unit/tokens.test.ts` | The dark-block guards and the wordmark-tile guard. |
| `tests/unit/contrast.test.ts` | Every pair, pin and classification in both themes; the mark's two pairs. |
| `src/components/pages/HomePage.astro` | The ShyTalk mark on its tile. |
| `tests/unit/shytalk-brand.test.ts` | The tile's one exemption in `tokens.css`. |
| `src/scripts/theme.inline.js` (new) | The theme script, shipped as written. |
| `src/layouts/BaseLayout.astro` | Emits the script inline, after the viewport `<meta>`. |
| `src/components/ThemeSwitch.astro` (new) | The switch. |
| `src/components/Header.astro` | Groups the switch with the language switcher. |
| `src/lib/i18n/site.ts`, `src/lib/i18n/label-check.ts`, `src/lib/i18n/.translations.json` | `themeDarkMode` in five locales, its page, its drafts. |
| `tests/themes.ts` (new) | `expectTheme`, `emulateTheme`, `saveTheme`: the per-theme browser helpers, shared by e2e, dev and prod. |
| `tests/e2e/theme-script.spec.ts` (new) | The script inventory and the static no-flash guard, on every built page (content project). |
| `tests/e2e/theme.spec.ts` (new) | The switch, rendered: §6.3 and the Review Focus. |
| `tests/e2e/theme-gallery.spec.ts` (new) | Every built page in both themes at 320 and 1280px, and the interactive states: the evidence §6.7 asks for, each capture behind an assertion. |
| `playwright.config.ts` | `theme-script.spec.ts` joins `CONTENT_ONLY_SPECS`. |
| `tests/e2e/classroom-groups.spec.ts`, `tests/unit/locale-switcher.test.ts` | The two former zero-JS guards, rewritten. |
| `tests/unit/colour-literals.test.ts` | Widened to `.js` and `.mjs`. |
| `tests/e2e/palette-controls.spec.ts`, `print-legibility.spec.ts`, `thai-typography.spec.ts`, `classroom-groups.spec.ts`, `classroom-groups-roster.spec.ts`, `disabled-controls.spec.ts`, `locale-beta.spec.ts`, `homepage.spec.ts` | The palette-reading guards, run in both themes. |
| `tests/e2e/chrome.spec.ts`, `tests/e2e/skip-link.spec.ts` | The Tab-order walks meet the switch. |
| `tests/dev/dev-sanity.spec.ts`, `tests/prod/prod-sanity.spec.ts` | The switch, proven on each deployed site. |
| `tests/e2e/fixtures.ts`, `tests/device/ios/session.ts`, `tests/device/ios/journeys.journey.ts` | The phones pin the theme per run. |
| `tests/e2e/visual.spec.ts`, `tests/e2e/__screenshots__/` | 24 baselines. |
| `CLAUDE.md` | The working agreement's script line. |

---

### Task 1: The palette model reads both themes

**Files:**
- Modify: `tests/wcag.ts`, `tests/unit/wcag.test.ts`
- Modify: `tests/palette.ts`, `tests/unit/palette.test.ts`

**Interfaces:**
- Consumes: `cssRules`, `CssRule` (`tests/unit/css-rules.ts`); `parseColour` (`tests/wcag.ts`).
- Produces, in `tests/palette.ts`:
  - `THEMES: readonly ['light', 'dark']` and `type Theme = 'light' | 'dark'`;
  - `rootBlock(css: string): CssRule`;
  - `darkBlocks(css: string): CssRule[]`;
  - `themeTokens(css: string, theme: Theme): Map<string, string>`;
  - `computedForm(value: string): string`;
  - `themeColour(theme: Theme, token: string): string`.
  `rootTokens` keeps its signature.

- [ ] **Step 1: Write the failing tests.**

In `tests/unit/wcag.test.ts`, the refusal test reads:

```ts
    for (const value of ['', 'transparent', 'currentColor', '#ab', 'rgb(1,2)'])
```

Replace that line with the one below, and add the new test straight after the refusal test's closing `});`:

```ts
    for (const value of ['', 'currentColor', '#ab', 'rgb(1,2)', 'transparentish'])
```

```ts
  it('reads transparent as CSS defines it: black at zero alpha', () => {
    // #142: Studio's band glow and Aurora's wordmark tile are `transparent`,
    // and a token this reader refused would drop out of every pair it sits in.
    expect(parseColour('transparent')).toEqual({ rgb: [0, 0, 0], alpha: 0 });
    expect(parseColour(' Transparent ')).toEqual({ rgb: [0, 0, 0], alpha: 0 });
  });
```

In `tests/unit/palette.test.ts`, extend the import to

```ts
import {
  ATMOSPHERE,
  atmosphereLayers,
  computedForm,
  darkBlocks,
  rootTokens,
  subsets,
  themeTokens,
  worstContrast,
} from '../palette';
```

and append:

```ts
describe('the themes', () => {
  const css = [
    ':root {\n  color-scheme: light;\n  --bg: #eef1f4;\n  --ink: #111821;\n  --font: serif;\n}',
    "@media screen and (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n    color-scheme: dark;\n    --bg: #04070d;\n    --ink: #eaf2ff;\n  }\n}",
    "@media screen {\n  :root[data-theme='dark'] {\n    color-scheme: dark;\n    --bg: #04070d;\n    --ink: #eaf2ff;\n  }\n  :root[data-theme-switch] {\n    --switch-display: inline-flex;\n  }\n}",
    '@media print {\n  :root {\n    --bg: #fff;\n  }\n}',
  ].join('\n');

  it('finds every dark block by its color-scheme, never by its selector', () => {
    expect(darkBlocks(css).map(({ chain }) => chain.join(' { '))).toEqual([
      "@media screen and (prefers-color-scheme: dark) { :root:not([data-theme='light'])",
      "@media screen { :root[data-theme='dark']",
    ]);
  });

  it('reads light from bare :root, and dark as bare :root with a dark block laid over it', () => {
    expect([...themeTokens(css, 'light')]).toEqual([
      ['--bg', '#eef1f4'],
      ['--ink', '#111821'],
      ['--font', 'serif'],
    ]);
    expect([...themeTokens(css, 'dark')]).toEqual([
      ['--bg', '#04070d'],
      ['--ink', '#eaf2ff'],
      ['--font', 'serif'],
    ]);
  });

  it('refuses a dark theme that no block declares', () => {
    expect(() => themeTokens(':root {\n  --bg: #fff;\n}', 'dark')).toThrow(
      'no block in src/styles/tokens.css declares color-scheme: dark',
    );
  });

  it('writes a colour the way getComputedStyle reports it', () => {
    expect(computedForm('#eef1f4')).toBe('rgb(238, 241, 244)');
    expect(computedForm('rgb(17 24 33 / 0.05)')).toBe('rgba(17, 24, 33, 0.05)');
    expect(computedForm('transparent')).toBe('rgba(0, 0, 0, 0)');
    expect(() => computedForm('currentColor')).toThrow('not a colour');
  });
});
```

- [ ] **Step 2: Add stubs so every new test fails on its own assertion.** A test that fails on a missing import proves nothing about the test (standing rule, #95). Add these to `tests/palette.ts`:

```ts
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const darkBlocks = (_css: string): CssRule[] => {
  throw new Error('not implemented');
};
export const themeTokens = (_css: string, _theme: Theme): Map<string, string> => {
  throw new Error('not implemented');
};
export const computedForm = (_value: string): string => {
  throw new Error('not implemented');
};
```

- [ ] **Step 3: Run the tests and watch them fail.**
  - Run: `npx vitest run tests/unit/wcag.test.ts tests/unit/palette.test.ts`
  - Expected: 5 failures. 4 are the new `palette.test.ts` cases, each failing on the stub's `not implemented` in its first statement. The fifth is the new `wcag.test.ts` case, where `parseColour('transparent')` returns `null`.
  - **Every other test passes.** Note: `'transparentish'` in the refusal list is `null` both before and after this change, which is right: it is the control that keeps the new branch exact.

- [ ] **Step 4: Implement.**

In `tests/wcag.ts`, add this as the first statement after `const text = value.trim();` in `parseColour`:

```ts
  // CSS defines `transparent` as rgb(0 0 0 / 0), an exact value, not a guess.
  if (/^transparent$/i.test(text)) return { rgb: [0, 0, 0], alpha: 0 };
```

In `tests/palette.ts`, delete the Step 2 stubs. Then replace `rootTokens` and its doc comment with the block below, which redefines `THEMES` and `Theme` and adds everything else:

```ts
/** The site's two themes (#142): light on bare `:root`, dark in the blocks that declare `color-scheme: dark`. */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * The bare `:root` block, exactly one, found by its chain rather than by
 * coming first: the print block is `:root` one level down, and a theme block
 * is `:root` with more after it.
 */
export const rootBlock = (css: string): CssRule => {
  const roots = topLevel(css, ':root');
  if (roots.length !== 1)
    throw new Error(
      `expected one bare :root block in ${TOKENS_FILE}, found ${roots.length}`,
    );
  return roots[0];
};

/** The tokens bare `:root` declares: Studio's, the light theme. */
export const rootTokens = (css: string): Map<string, string> =>
  customProperties(rootBlock(css));

/**
 * Every block that declares `color-scheme: dark`: Aurora, written twice
 * (#142 §4). Found by that declaration rather than by selector, so a copy
 * added later is found, and compared, too.
 */
export const darkBlocks = (css: string): CssRule[] =>
  cssRules(css).filter(({ declarations }) =>
    declarations.some(
      ({ property, value }) => property === 'color-scheme' && value === 'dark',
    ),
  );

/**
 * The tokens `theme` paints. Light is bare `:root`. Dark is bare `:root` with
 * the first dark block laid over it: a dark block redefines tokens and only
 * tokens, and tokens.test.ts proves every dark block identical, so the first
 * speaks for all of them.
 */
export const themeTokens = (css: string, theme: Theme): Map<string, string> => {
  const root = rootTokens(css);
  if (theme === 'light') return root;
  const [first] = darkBlocks(css);
  if (first === undefined)
    throw new Error(`no block in ${TOKENS_FILE} declares color-scheme: dark`);
  return new Map([...root, ...customProperties(first)]);
};

/**
 * A colour in the form `getComputedStyle` reports it: `rgb(r, g, b)`, or
 * `rgba(r, g, b, a)` below full opacity. A browser assertion compares with
 * this, so the page is judged against tokens.css rather than against itself.
 */
export const computedForm = (value: string): string => {
  const colour = parseColour(value);
  if (colour === null) throw new Error(`not a colour: ${value}`);
  const [r, g, b] = colour.rgb;
  return colour.alpha === 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${colour.alpha})`;
};

/** `theme`'s value for a colour token, as a browser reports it (#142 §6.2). */
export const themeColour = (theme: Theme, token: string): string => {
  const value = themeTokens(tokensCss(), theme).get(token);
  if (value === undefined)
    throw new Error(`${token} is not defined in the ${theme} theme`);
  return computedForm(value);
};
```

- [ ] **Step 5: Run the tests and watch them pass.**
  - Run: `npx vitest run tests/unit/wcag.test.ts tests/unit/palette.test.ts`. Expected: every test passes.
  - Then run `npm run test:unit`. Expected: the baseline plus the 5 new tests, all passing. `tokens.css` has no dark block yet, but nothing reads the dark theme until Task 2.
  - Then run `npm run typecheck`. Expected: 0 errors, 0 warnings, 0 hints.

- [ ] **Step 6: Commit.**

```bash
npx prettier --write tests/wcag.ts tests/unit/wcag.test.ts tests/palette.ts tests/unit/palette.test.ts
git add tests/wcag.ts tests/unit/wcag.test.ts tests/palette.ts tests/unit/palette.test.ts
git commit -m "test(unit): the palette model reads both themes

Refs #142"
```

(Every commit in this plan ends with the two attribution lines of the session's system reminder, after a blank line.)

---

### Task 2: Studio on bare `:root`, Aurora in two screen-only blocks

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `tests/unit/tokens.test.ts`, `tests/unit/contrast.test.ts`

**Interfaces:**
- Consumes: `THEMES`, `Theme`, `rootBlock`, `rootTokens`, `darkBlocks`, `themeTokens`, `customProperties`, `tokensCss` (Task 1).
- Produces: the token file every later task edits. Its anchors are the bare `:root` block, the block `@media screen and (prefers-color-scheme: dark) { :root:not([data-theme='light']) {`, the block `@media screen { :root[data-theme='dark'] {`, and the print block.

- [ ] **Step 1: Write the failing token guards.** In `tests/unit/tokens.test.ts`, replace the import of `../palette` with

```ts
import { cssRules, type CssRule } from './css-rules';
import {
  customProperties,
  darkBlocks,
  rootBlock,
  rootTokens,
  tokensCss,
} from '../palette';
```

and append:

```ts
/** A block's declarations as `property: value` lines, sorted. */
const declared = (rule: CssRule): string[] =>
  rule.declarations.map(({ property, value }) => `${property}: ${value}`).sort();

/**
 * The two themes (#142 §4). Aurora is written twice, because the unstamped
 * state needs its media query and the stamped state must not. Two copies of a
 * palette drift unless something holds them together, so every block that
 * declares `color-scheme: dark` is found by that declaration and compared.
 */
describe('the two themes (#142)', () => {
  it('declares light on bare :root', () => {
    expect(rootBlock(tokensCss()).declarations).toContainEqual({
      property: 'color-scheme',
      value: 'light',
    });
  });

  it('declares color-scheme only beside a palette', () => {
    // Compared by chain, never by identity: each reader parses afresh, so
    // the same block arrives as a different object from each of them.
    const css = tokensCss();
    const where = ({ chain }: CssRule) => chain.join(' { ');
    const palettes = new Set([rootBlock(css), ...darkBlocks(css)].map(where));
    const declaring = cssRules(css).filter(({ declarations }) =>
      declarations.some(({ property }) => property === 'color-scheme'),
    );
    const stray = declaring
      .map(where)
      .filter((chain) => !palettes.has(chain));
    expect(
      searched(stray, { of: declaring, what: 'rules declaring color-scheme' }),
    ).toEqual([]);
  });

  it('keeps every dark block screen-only, and has both states it needs', () => {
    const chains = darkBlocks(tokensCss()).map(({ chain }) =>
      chain.join(' { '),
    );
    const onPaper = chains.filter((chain) => !/^@media screen\b/.test(chain));
    expect(searched(onPaper, { of: chains, what: 'dark blocks' })).toEqual([]);
    expect(chains).toEqual(
      expect.arrayContaining([
        "@media screen and (prefers-color-scheme: dark) { :root:not([data-theme='light'])",
        "@media screen { :root[data-theme='dark']",
      ]),
    );
  });

  it('declares the same tokens, with the same values, in every dark block', () => {
    const [first, ...rest] = darkBlocks(tokensCss()).map(declared);
    const drifted = rest.flatMap((block, i) => [
      ...block
        .filter((line) => !first.includes(line))
        .map((line) => `dark block ${i + 2} adds ${line}`),
      ...first
        .filter((line) => !block.includes(line))
        .map((line) => `dark block ${i + 2} lacks ${line}`),
    ]);
    expect(
      searched(drifted, { of: rest, what: 'dark blocks after the first' }),
    ).toEqual([]);
  });

  it('defines no token only inside a dark block', () => {
    const css = tokensCss();
    const root = rootTokens(css);
    const dark = darkBlocks(css).flatMap((block) => [
      ...customProperties(block).keys(),
    ]);
    const orphans = [...new Set(dark)].filter((name) => !root.has(name));
    expect(
      searched(orphans, { of: dark, what: 'tokens the dark blocks declare' }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the failing contrast suite, in both themes.** In `tests/unit/contrast.test.ts`, make these edits.
  - **The import from `../palette`** becomes:

    ```ts
    import {
      ATMOSPHERE,
      THEMES,
      TOKENS_FILE,
      atmosphereLayers,
      flatten,
      themeTokens,
      tokensCss,
      worstContrast,
      type Theme,
    } from '../palette';
    ```

  - **`colourTokens` becomes per-theme:**

    ```ts
    const colourTokens = (theme: Theme): [string, string][] =>
      nonEmpty(
        [...themeTokens(tokensCss(), theme)].filter(([, value]) =>
          isColour(value),
        ),
        `${theme} colour tokens in ${TOKENS_FILE}`,
      );
    ```

  - **Add this constant straight after `DECORATIVE`'s closing `};`:**

    ```ts
    /**
     * The disabled fill in each theme, pinned against the brief (#250, #142
     * §3.1): the level every derived guard around it is unable to assert.
     */
    const DISABLED_FILL: Record<Theme, string> = {
      light: '#dde2e8',
      dark: '#2a323f',
    };
    ```

  - **Three tests become per-theme:**
    - *every declared pair clears its required ratio*;
    - *pins the disabled fill*;
    - *every colour token is classified*.

    Wrap each in `for (const theme of THEMES) { … }` and prefix its title with `${theme}: `, so the titles read `` `${theme}: every declared pair clears its required ratio, over the worst subset of the atmosphere` ``, `` `${theme}: pins the disabled fill, and keeps it off every ground it is drawn on` `` and `` `${theme}: every colour token is classified — paired or explicitly decorative` ``.
  - **Inside those three bodies:**
    - `const from = rootTokens(css);` becomes `const from = themeTokens(css, theme);`.
    - `const from = rootTokens(tokensCss());` becomes `const from = themeTokens(tokensCss(), theme);`.
    - `expect(from.get('--disabled-fill')).toBe('#2a323f');` becomes `expect(from.get('--disabled-fill')).toBe(DISABLED_FILL[theme]);`.
    - `const all = colourTokens();` becomes `const all = colourTokens(theme);`.
    - `searched(failures, { of: PAIRS, what: 'declared colour pairs' })` becomes `searched(failures, { of: PAIRS, what: \`${theme} colour pairs\` })`.
  - **The comment above the disabled-fill test** keeps its text, except its measured example: "set the fill to `--surface`'s `#070d16`" becomes "set Aurora's fill to its `--surface`, `#070d16`".

- [ ] **Step 3: Run the new tests and watch them fail.**
  - Run: `npx vitest run tests/unit/tokens.test.ts tests/unit/contrast.test.ts`
  - Expected: `tokens.test.ts` fails all 5 of its new tests:
    - *declares light on bare :root*: no `color-scheme` on `:root`.
    - *declares color-scheme only beside a palette*: `html` declares it.
    - *keeps every dark block screen-only*: `searched` throws, *searched no dark blocks*.
    - *declares the same tokens*: there is no dark block, so `rest` is empty and `searched` throws.
    - *defines no token only inside a dark block*: `searched` throws, *searched no tokens the dark blocks declare*.
  - `contrast.test.ts` fails 4:
    - the three `dark:` tests, each with `no block in src/styles/tokens.css declares color-scheme: dark`;
    - *light: pins the disabled fill*, because bare `:root` is still Aurora, whose `#2a323f` is not Studio's `#dde2e8`.

    The other two `light:` tests pass, for the same reason.
  - Expected total: **9 red**.

- [ ] **Step 4: Rewrite the head of `tokens.css`.** Replace everything from the file's first line down to and including the closing `}` of the bare `:root` block (the line after `--maxw: 1120px;`) with:

```css
/* src/styles/tokens.css — design tokens (see spec §4).
   Two identities share one set of token NAMES (#142). Studio, the light one,
   is defined on bare :root. Aurora (#17), the dark one, redefines the same
   tokens, and only the tokens, in the two screen-only blocks below it. Every
   value is derived against the ground it sits on and ASSERTED, in both
   themes, in tests/unit/contrast.test.ts — a comment claiming a ratio is not
   a control, which is how a 1.17:1 control boundary shipped to production
   (#133). */
@import '@fontsource-variable/bricolage-grotesque';
@import '@fontsource-variable/instrument-sans';
@import '@fontsource/space-mono/400.css';
@import '@fontsource/space-mono/700.css';

/* Studio: depth, not colour. A cool grey ground, pure white cards that sit
   forward of it, window light at the top left and cool shade falling off to
   the right and below. Its one colour is the brand green; everything else it
   paints is light and shade. `color-scheme` travels with the palette, so the
   browser draws its own controls for the ground they sit on. */
:root {
  color-scheme: light;

  --bg: #eef1f4;
  --surface: #ffffff;
  --ink: #111821;
  --ink-soft: #4d5866;

  /* A control that cannot be used right now (#250): an opaque fill, so the
     label's ratio is fixed and checkable. --ink-soft on it is 5.55:1. */
  --disabled-fill: #dde2e8;

  --accent: #006652;
  --accent-ink: #004d3e;
  --on-accent: #ffffff;
  --danger: #b42318;

  /* The ink at low alpha, judged OVER its ground. --border is decorative
     only. --border-strong draws every control boundary (WCAG 1.4.11): 3.63:1
     over the atmosphere at its worst subset, 3.83:1 on --bg and 3.97:1 on
     --surface. */
  --border: rgb(17 24 33 / 0.1);
  --border-strong: rgb(17 24 33 / 0.55);
  /* A faint ink tint, not white: white glass on a white card has no fill.
     The work-card badge's accent text reads 6.27:1 on it. */
  --glass: rgb(17 24 33 / 0.05);

  /* A glow reads as light only against darkness. On this ground the band's
     clipped glow painted a flat grey box, so there is none (#142 §3.3). */
  --accent-glow: transparent;
  /* Shadows in the ink's own hue, softer than Aurora's black. Nothing is read
     against them. */
  --dock-shadow: rgb(17 24 33 / 0.14);
  --lift-shadow: rgb(17 24 33 / 0.18);

  /* The atmosphere, painted on body::before: window light at the top left,
     cool shade at the top right and at the foot, and a bright shaft. Here
     the light layers brighten the ground under dark ink while the shade
     darkens it, so every layer at once is NOT the worst case: the two shade
     pools alone are, and --accent over them, 5.19:1, is Studio's tightest
     text pair. contrast.test.ts scores every subset, in both themes. */
  --pool-top-left: rgb(255 255 255 / 0.7);
  --pool-top-right: rgb(60 80 110 / 0.045);
  --pool-foot: rgb(30 45 65 / 0.055);
  --shaft: rgb(255 255 255 / 0.35);

  --font-head: 'Bricolage Grotesque Variable', system-ui, sans-serif;
  --font-body: 'Instrument Sans Variable', system-ui, sans-serif;
  --font-mono: 'Space Mono', ui-monospace, monospace;
  --measure: 66ch;
  --radius: 10px;
  --space: clamp(1rem, 0.6rem + 2vw, 2rem);
  --maxw: 1120px;
}

/* Aurora (#17), the dark identity, exactly as it shipped: the same tokens,
   redefined. Written TWICE (#142 §4). The unstamped state needs the media
   query, so a visitor with no saved choice follows the device, live, with no
   script involved. The stamped state must not have it, so a saved `dark`
   wins on a light device; and `:not([data-theme='light'])` lets a saved
   `light` win on a dark one.

   Both copies are screen-only, and that is load-bearing for print. Their
   selectors outrank the print block's bare :root, so on paper they would put
   Aurora's near-white ink on white paper: the blank sheet of 2026-09-11.
   tests/unit/tokens.test.ts finds every block that declares
   `color-scheme: dark`, keeps each screen-only, and proves them identical. */
@media screen and (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;

    /* Ground and ink. --surface is only 1.04:1 against --bg, so a card is
       identified by its EDGE, not by its fill — which is why the border
       tokens below carry more weight here than on a light palette. */
    --bg: #04070d;
    --surface: #070d16;
    --ink: #eaf2ff;
    --ink-soft: #8fa6c6;

    /* A control that cannot be used right now (#250). An opaque FILL, never
       the `opacity: 0.6` this replaced: opacity composites the whole
       subtree, control AND label, with whatever happens to be behind it, so
       the label's ratio depends on the page atmosphere at that spot --
       measured at roughly 2.67:1 for --ink-soft, well under AA, in
       ClassroomGroupsPage.astro's own note. Opaque, the ratio is fixed and
       checkable: --ink-soft on this is 5.19:1, and --ink 11.46:1. 1.51:1
       against --surface and 1.56:1 against --bg, so the control still reads
       as a control on the card; WCAG 1.4.11 exempts an inactive component
       from the 3:1 boundary, and the reason paragraph beside it is what
       carries the state without colour (AC6). */
    --disabled-fill: #2a323f;

    /* Brand. --on-accent is the ink for anything sitting ON mint: white
       scores 1.39:1 there, so a filled button labelled #fff would be
       unreadable. */
    --accent: #38f5c8;
    --accent-ink: #7fffe0;
    --on-accent: #04140f;

    /* #c0392b was tuned for a near-white page and scores 3.71:1 on this
       ground — below the 4.5:1 body floor. The artifact never specified an
       error colour; the roles a design does not mention are the ones with
       nobody checking. */
    --danger: #ff6b5a;

    /* Borders, composited: alphas are judged OVER their ground, never raw.
       --border at .11 is 1.27:1 and is decorative only. Aurora's own
       --line-2 at .18 was 1.61:1.

       Control boundaries need 3:1 (WCAG 1.4.11). White reached that at alpha
       .35 while the page ground was FLAT — 3.10:1 on --bg, 3.17:1 on
       --surface. The atmosphere lightens the ground beneath a control, and
       at .35 the boundary drops to 2.96:1 there: a 1.4.11 failure introduced
       by a change three declarations away that touched no border at all. At
       .40 it is 3.44:1 over the atmosphere at its worst subset, 3.72:1 on
       --bg and 3.79:1 on --surface. */
    --border: rgb(255 255 255 / 0.11);
    --border-strong: rgb(255 255 255 / 0.4);
    --glass: rgb(255 255 255 / 0.055);

    /* The mint bloom behind the marquee band. Decorative: it is a shadow, so
       nothing is ever read against it and 1.4.11 does not reach it. */
    --accent-glow: rgb(56 245 200 / 0.3);

    /* The shadow the pinned action row on /classroom-groups casts UP over
       whatever scrolls beneath it (#188). Decorative: it separates a docked
       bar from the content passing under it, and nothing is read against it
       by design, because scroll-padding keeps a focused field clear of the
       row. */
    --dock-shadow: rgb(0 0 0 / 0.55);

    /* The phone mockup's shadow (PhoneFrame.astro). Decorative, like the dock
       shadow above: nothing is read against it. This is the value the frame
       hard-coded before it became a token (#142). */
    --lift-shadow: rgb(0 0 0 / 0.55);

    /* The atmosphere: mint at the top left, violet at the top right, deep
       blue at the foot, and a faint white shaft. Every layer lightens a
       near-black ground under light ink, so here the worst subset IS every
       layer at once: --ink-soft reads 5.22:1 over it, the knife edge. The
       hand-written stack this replaced put the shaft on top, where the
       browser never paints it, and read 5.05:1. */
    --pool-top-left: rgb(56 245 200 / 0.08);
    --pool-top-right: rgb(122 92 255 / 0.1);
    --pool-foot: rgb(24 74 110 / 0.14);
    --shaft: rgb(255 255 255 / 0.05);
  }
}

@media screen {
  /* The second copy: a saved `dark` choice, whatever the device prefers.
     Every declaration mirrors the block above, whose comments give the
     reasons; tokens.test.ts keeps the two identical. */
  :root[data-theme='dark'] {
    color-scheme: dark;
    --bg: #04070d;
    --surface: #070d16;
    --ink: #eaf2ff;
    --ink-soft: #8fa6c6;
    --disabled-fill: #2a323f;
    --accent: #38f5c8;
    --accent-ink: #7fffe0;
    --on-accent: #04140f;
    --danger: #ff6b5a;
    --border: rgb(255 255 255 / 0.11);
    --border-strong: rgb(255 255 255 / 0.4);
    --glass: rgb(255 255 255 / 0.055);
    --accent-glow: rgb(56 245 200 / 0.3);
    --dock-shadow: rgb(0 0 0 / 0.55);
    --lift-shadow: rgb(0 0 0 / 0.55);
    --pool-top-left: rgb(56 245 200 / 0.08);
    --pool-top-right: rgb(122 92 255 / 0.1);
    --pool-foot: rgb(24 74 110 / 0.14);
    --shaft: rgb(255 255 255 / 0.05);
  }
}
```

Then, in the `html` rule, delete the line `color-scheme: dark;` and replace the comment above `accent-color` with:

```css
  /* Checkboxes and radios are drawn by the browser, and `auto` means it picks
     its own blue — measured as the selected state on /classroom-groups, the
     one brand colour on the page that was not ours. `color-scheme`, declared
     with each palette above, fixes their GROUND but says nothing about the
     fill. The UA derives the tick's own colour from this, so it stays legible
     on the accent. */
```

In the comment above `body::before`, replace "the aurora is the light in the room" with "the atmosphere is the light in the room". Then add a paragraph before its last one:

```css
   The same layer paints both themes (#142); only its tokens change, so the
   geometry #141 measured the paint cost of stands.
```

- [ ] **Step 5: Run the tests and watch them pass.**
  - Run: `npx vitest run tests/unit/tokens.test.ts tests/unit/contrast.test.ts tests/unit/palette.test.ts`. Expected: every test passes. The `light:` pair test now scores Studio, whose worst pair is `--accent` over `[--pool-top-right, --pool-foot]` at 5.19:1.
  - Then run `npm run test:unit`. Expected: every test passes, **including `literal-grounds`, `colour-literals` and `tokens`' "declares no token that nothing reads"**, since no token was added or removed.
  - Then run `npm run typecheck` and `npx prettier --check src/styles/tokens.css`. Expected: 0/0/0, and clean.

- [ ] **Step 6: Commit.**

```bash
git add src/styles/tokens.css tests/unit/tokens.test.ts tests/unit/contrast.test.ts
git commit -m "feat(tokens): Studio on bare :root, Aurora in two screen-only blocks

Refs #142"
```

---

### Task 3: The ShyTalk mark on its own tile

**Files:**
- Modify: `src/styles/tokens.css`, `src/components/pages/HomePage.astro`
- Modify: `tests/unit/tokens.test.ts`, `tests/unit/shytalk-brand.test.ts`, `tests/unit/contrast.test.ts`

**Interfaces:**
- Consumes: `themeTokens`, `tokensCss` (Task 1); the dark blocks (Task 2); `SHYTALK_MARK` (`src/lib/shytalk-brand.ts`).
- Produces: `--wordmark-tile` and `--wordmark-pad` in every palette block and the print block.

- [ ] **Step 1: Write the failing tile guard.** In `tests/unit/tokens.test.ts`, add `themeTokens` to the `../palette` import, add `import { SHYTALK_MARK } from '../../src/lib/shytalk-brand';`, and append inside `describe('the two themes (#142)', …)`:

```ts
  it('puts the ShyTalk mark on its own tile in light, and on nothing in dark', () => {
    // The tile's colour now lives in two files (§3.4): SHYTALK_MARK, whose
    // level shytalk-brand.test.ts pins, and this token, held equal to it here.
    const css = tokensCss();
    expect(themeTokens(css, 'light').get('--wordmark-tile')).toBe(
      SHYTALK_MARK.tile,
    );
    expect(themeTokens(css, 'dark').get('--wordmark-tile')).toBe(
      'transparent',
    );
    expect(themeTokens(css, 'dark').get('--wordmark-pad')).toBe('0');
  });
```

- [ ] **Step 2: Write the failing brand exemption.** In `tests/unit/shytalk-brand.test.ts`, add this straight after `const SCAN = ['src', 'tests'];`:

```ts
/**
 * One narrower exemption (#142 §3.4). The mark's tile is also a THEME token:
 * the theme, not the component, decides whether the mark sits on it, so
 * tokens.css declares `--wordmark-tile` with the tile's hex on bare `:root`.
 * That file may spell the tile and nothing else of the mark, and only once;
 * tests/unit/tokens.test.ts holds the value equal to SHYTALK_MARK.tile.
 */
const TOKEN_HOME = 'src/styles/tokens.css';
const TOKEN_FORM = SHYTALK_MARK.tile.toLowerCase();
```

Then replace the test *exempts exactly two files, and both exist* with:

```ts
  it('exempts exactly two files and one token, and each file exists', () => {
    // An exemption naming a path that does not exist exempts nothing and
    // reads identically to one that works.
    const files = scannedFiles();
    for (const allowed of [...ALLOWED, TOKEN_HOME]) {
      expect(files, `${allowed} is not in the scanned set`).toContain(allowed);
    }
    expect(ALLOWED.size).toBe(2);
  });
```

and, in *is spelled out nowhere else in the repo*, replace the `return forms…` statement at the end of the `flatMap` callback with:

```ts
      const exempt = file === TOKEN_HOME ? [TOKEN_FORM] : [];
      const repeated = exempt.filter((form) => lower.split(form).length > 2);
      return [
        ...forms
          .filter(
            (form) =>
              lower.includes(form.toLowerCase()) && !exempt.includes(form),
          )
          .map((form) => `${file} spells out ${form}`),
        ...repeated.map((form) => `${file} spells out ${form} more than once`),
      ];
```

- [ ] **Step 3: Write the failing pairs for the mark.** In `tests/unit/contrast.test.ts`, add `import { SHYTALK_MARK } from '../../src/lib/shytalk-brand';` and append two entries to `PAIRS`, straight before its closing `];`:

```ts
  {
    fg: [SHYTALK_MARK.shy],
    bg: ['--wordmark-tile', ATMOSPHERE, '--bg'],
    level: 'large',
    where:
      'the ShyTalk mark\'s "Shy" (HomePage.astro, 2.6rem bold): on its own tile in light, and over the atmosphere in dark, where the tile is transparent (#142 §3.4)',
  },
  {
    fg: [SHYTALK_MARK.talk],
    bg: ['--wordmark-tile', ATMOSPHERE, '--bg'],
    level: 'large',
    where:
      'the ShyTalk mark\'s "Talk", on the same ground as "Shy" in each theme (#142 §3.4)',
  },
```

- [ ] **Step 4: Run them and watch them fail.**
  - Run: `npx vitest run tests/unit/tokens.test.ts tests/unit/shytalk-brand.test.ts tests/unit/contrast.test.ts`
  - Expected: **3 red.**
    - `tokens.test.ts`' tile guard fails: the token is `undefined`.
    - `contrast.test.ts`' `light:` and `dark:` pair tests fail, each on `--wordmark-tile is not defined in src/styles/tokens.css`.
  - `shytalk-brand.test.ts` stays green: `tokens.css` does not spell the tile yet.

- [ ] **Step 5: Implement.**

In `tokens.css`'s bare `:root`, straight after `--shaft: rgb(255 255 255 / 0.35);`, add:

```css

  /* The ShyTalk mark's tile (HomePage.astro, #142 §3.4). The mark's two
     tones were made for a dark ground and measure 1.28:1 and 1.70:1 on
     white, so in light it sits on ShyTalk's own tile colour, like a logo
     badge: 15.02:1 and 11.32:1. The same value as SHYTALK_MARK.tile, held
     equal by tests/unit/tokens.test.ts, because the colour now lives in two
     files. */
  --wordmark-tile: #0f0d15;
  --wordmark-pad: 0.12em 0.42em 0.18em;
```

In the first dark block, straight after `--shaft: rgb(255 255 255 / 0.05);`, add:

```css

    /* No tile: the mark was made for this ground, and zero padding keeps it
       exactly where Aurora always had it. */
    --wordmark-tile: transparent;
    --wordmark-pad: 0;
```

In the second dark block, straight after its `--shaft: rgb(255 255 255 / 0.05);`, add:

```css
    --wordmark-tile: transparent;
    --wordmark-pad: 0;
```

In the print block, straight after `--shaft: transparent;`, add:

```css

    /* The mark prints in ink (HomePage.astro), so a tile would print as a
       dark slab around dark text, if it printed at all. None on paper. */
    --wordmark-tile: transparent;
    --wordmark-pad: 0;
```

In `HomePage.astro`, the rule reading

```css
  .shytalk-wordmark {
    display: inline-block;
```

becomes

```css
  .shytalk-wordmark {
    display: inline-block;
    background: var(--wordmark-tile);
    padding: var(--wordmark-pad);
    border-radius: 14px;
```

and its comment's last line, "Colours taken from the live logo; values live in src/lib/shytalk-brand.ts.", becomes "Colours taken from the live logo; values live in src/lib/shytalk-brand.ts, and the tile's theme token in tokens.css (#142 §3.4)."

- [ ] **Step 6: Run the tests and watch them pass.**
  - Run: `npx vitest run tests/unit/tokens.test.ts tests/unit/shytalk-brand.test.ts tests/unit/contrast.test.ts`. Expected: every test passes. In light the mark scores 15.02:1 and 11.32:1 on its tile at every subset. In dark it scores over the atmosphere.
  - Then run `npm run test:unit` and `npm run typecheck`. Expected: all green, and 0/0/0. `colour-literals` does not scan `tokens.css`, and `HomePage.astro` gains only `var()` reads.

- [ ] **Step 7: Commit.**

```bash
npx prettier --write src/styles/tokens.css src/components/pages/HomePage.astro tests/unit/tokens.test.ts tests/unit/shytalk-brand.test.ts tests/unit/contrast.test.ts
git add src/styles/tokens.css src/components/pages/HomePage.astro tests/unit/tokens.test.ts tests/unit/shytalk-brand.test.ts tests/unit/contrast.test.ts
git commit -m "feat(home): the ShyTalk mark sits on its own tile in light

Refs #142"
```

---

### Task 4: The theme script, inline in every `<head>`, and the inventory that pins it

**Files:**
- Create: `src/scripts/theme.inline.js`, `tests/themes.ts`, `tests/e2e/theme-script.spec.ts`, `tests/e2e/theme.spec.ts`
- Modify: `src/layouts/BaseLayout.astro`, `playwright.config.ts`, `tests/e2e/classroom-groups.spec.ts`, `tests/unit/locale-switcher.test.ts`, `tests/unit/colour-literals.test.ts`, `CLAUDE.md`

**Interfaces:**
- Consumes: `themeColour`, `THEMES`, `Theme` (Task 1).
- Produces, in `tests/themes.ts`:
  - `THEME_SCRIPT_FILE = 'src/scripts/theme.inline.js'`;
  - `THEME_SCRIPT_SOURCE: string`, the file's text;
  - `expectTheme(page: Page, theme: Theme): Promise<void>`;
  - `emulateTheme(page: Page, theme: Theme): Promise<void>`;
  - `saveTheme(page: Page, theme: Theme): Promise<void>`.

  `tests/e2e/theme.spec.ts` exists for Tasks 5 and 6 to extend. The script stamps `data-theme` and `data-theme-switch` on `<html>`, and reads `localStorage['theme']`.

- [ ] **Step 1: Create the helpers, and an empty script to compare against.**
  - Create `src/scripts/theme.inline.js` as an **empty file**. The red run in Step 3 needs a source to read, and an empty one matches no real script.
  - Create `tests/themes.ts`:

```ts
import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { themeColour, type Theme } from './palette';

/**
 * The browser half of the palette model (#142 §6.2), shared by the e2e suite
 * and both deployed-site suites. Every expectation comes from tokens.css
 * through `themeColour`, never from the page, which would compare the page
 * with itself.
 */

/** The one script every page carries (#142 §5), and its text as shipped. */
export const THEME_SCRIPT_FILE = 'src/scripts/theme.inline.js';
export const THEME_SCRIPT_SOURCE = readFileSync(THEME_SCRIPT_FILE, 'utf8');

/**
 * Prove `page` rendered `theme`, by its ground. Every per-theme run asserts
 * this first, so a run meant to be light that rendered dark fails rather than
 * passing on the other palette. Read in screen media: on paper the ground is
 * white whatever the theme.
 */
export async function expectTheme(page: Page, theme: Theme): Promise<void> {
  await expect(
    page.locator('html'),
    `the page rendered the ${theme} theme`,
  ).toHaveCSS('background-color', themeColour(theme, '--bg'));
}

/**
 * Show `theme` as the device's own setting, in screen media, then prove the
 * page rendered it. This is what a visitor's device does, and with no choice
 * saved the page follows it live (#142 §4).
 */
export async function emulateTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ media: 'screen', colorScheme: theme });
  await expectTheme(page, theme);
}

/**
 * Save `theme` as the visitor's choice, as the switch does, then reload so the
 * page's own script reads it before the first paint.
 */
export async function saveTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((value) => localStorage.setItem('theme', value), theme);
  await page.reload();
}
```

- [ ] **Step 2: Write the failing browser guards.** Create `tests/e2e/theme-script.spec.ts`:

```ts
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { recorded } from './evidence';
import { searched } from '../source-files';
import { sitePaths } from '../site-pages';
import { THEME_SCRIPT_SOURCE } from '../themes';
import { LOCALES, localisePath } from '../../src/lib/i18n';

test.use(recorded);

/**
 * The one script every page carries, pinned by what MAY exist (#142 §6.4).
 *
 * The homepage's promise was "no JavaScript", held by counting to zero. With
 * the theme script it ships exactly one, so the promise is pinned as an
 * inventory instead: the theme script on every page exactly once, identical
 * to its source, and nothing else on a page that carried nothing before.
 *
 * Read from a real DOM (`document.scripts`), never by matching `<script` in
 * the HTML: /classroom-groups carries a comment that only mentions the tag,
 * and a text match counts it.
 */

/** The 404 is served for any unknown path, so any unknown path reaches it. */
const NOT_FOUND = '/definitely-not-a-page';

/**
 * What each page carries of its own, besides the theme script, as the build
 * measured on 2026-09-24. Keyed by unlocalised path, so a page added to
 * src/pages has no entry and fails until someone decides what it may carry.
 */
const OWN_SCRIPTS: Record<string, readonly string[]> = {
  '/': [],
  '/glory-points': ['external module in body'],
  '/classroom-groups': ['inline classic in body', 'external module in body'],
  [NOT_FOUND]: [],
};

type Script = {
  inline: boolean;
  module: boolean;
  inHead: boolean;
  text: string;
  /** Every stylesheet that comes BEFORE this script in the document. */
  sheetsBefore: string[];
};

/** The page's scripts, and every stylesheet it carries, from the DOM. */
const scriptsOn = (page: Page): Promise<{ scripts: Script[]; sheets: string[] }> =>
  page.evaluate(() => {
    const sheetElements = [
      ...document.querySelectorAll('link[rel~="stylesheet"], style'),
    ];
    const name = (sheet: Element) =>
      sheet instanceof HTMLLinkElement ? `link ${sheet.href}` : 'style';
    return {
      sheets: sheetElements.map(name),
      scripts: [...document.scripts].map((script) => ({
        inline: !script.hasAttribute('src'),
        module: script.type === 'module',
        inHead: document.head.contains(script),
        text: script.hasAttribute('src') ? '' : (script.textContent ?? ''),
        sheetsBefore: sheetElements
          .filter(
            (sheet) =>
              !(
                script.compareDocumentPosition(sheet) &
                Node.DOCUMENT_POSITION_FOLLOWING
              ),
          )
          .map(name),
      })),
    };
  });

const kindOf = ({ inline, module, inHead }: Script): string =>
  `${inline ? 'inline' : 'external'} ${module ? 'module' : 'classic'} in ${inHead ? 'head' : 'body'}`;

const isTheme = (script: Script): boolean =>
  script.inline && script.text === THEME_SCRIPT_SOURCE;

/** Every page the build emits: each page in each locale, and the 404. */
const BUILT = [
  ...LOCALES.flatMap((locale) =>
    sitePaths().map((route) => ({ route, path: localisePath(route, locale) })),
  ),
  { route: NOT_FOUND, path: NOT_FOUND },
];

test.describe('the theme script (#142 §6.4)', () => {
  test('is compared with the real script', () => {
    // The control for every comparison below: an empty or missing source
    // would match nothing, or an empty inline script, and prove nothing.
    expect(THEME_SCRIPT_SOURCE).toContain("localStorage.getItem('theme')");
  });

  for (const { route, path } of BUILT) {
    test(`${path}: carries it exactly once, and nothing it did not carry before`, async ({
      page,
    }) => {
      const own = OWN_SCRIPTS[route];
      if (own === undefined)
        throw new Error(
          `${route} has no entry in OWN_SCRIPTS: decide what it may carry`,
        );
      await page.goto(path);
      const { scripts } = await scriptsOn(page);
      expect(scripts.filter(isTheme), 'the theme script').toHaveLength(1);
      expect(
        scripts.filter((script) => !isTheme(script)).map(kindOf),
      ).toEqual(own);
    });

    test(`${path}: runs it before the first paint: inline, classic, in <head>, ahead of every stylesheet`, async ({
      page,
    }) => {
      await page.goto(path);
      const { scripts, sheets } = await scriptsOn(page);
      const [theme] = scripts.filter(isTheme);
      expect(theme, 'the theme script is on the page').toBeDefined();
      expect(kindOf(theme)).toBe('inline classic in head');
      expect(
        searched(theme.sheetsBefore, { of: sheets, what: 'stylesheets' }),
        'a stylesheet ahead of the theme script paints before it runs',
      ).toEqual([]);
    });
  }
});
```

Create `tests/e2e/theme.spec.ts`:

```ts
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { recorded, shoot } from './evidence';
import { themeColour } from '../palette';
import { expectTheme } from '../themes';

test.use(recorded);

/**
 * The switch, rendered (#142 §6.3). The project's device prefers dark, so a
 * page with no saved choice shows Aurora, and a test that needs another
 * device says so with `test.use({ colorScheme })`.
 */

/**
 * Record the ground of the first frame that paints one, from an init script,
 * before the page's own scripts run. Until the stylesheet applies, the ground
 * is the UA's transparent. The first frame with a ground is the frame a flash
 * would show in.
 */
const recordFirstGround = (page: Page) =>
  page.addInitScript(() => {
    const read = () => {
      const ground = getComputedStyle(document.documentElement).backgroundColor;
      if (ground === 'rgba(0, 0, 0, 0)') requestAnimationFrame(read);
      else document.documentElement.dataset.firstGround = ground;
    };
    requestAnimationFrame(read);
  });

test.describe('no flash of the other theme (#142 §6.3, AC5)', () => {
  for (const [saved, device] of [
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const) {
    test.describe(`a saved ${saved} choice on a device preferring ${device}`, () => {
      test.use({ colorScheme: device });

      test('the first frame that paints a ground paints the saved theme', async ({
        page,
      }) => {
        await page.goto('/glory-points');
        await expectTheme(page, device);
        await page.evaluate((theme) => localStorage.setItem('theme', theme), saved);
        await recordFirstGround(page);
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute(
          'data-first-ground',
          themeColour(saved, '--bg'),
        );
        await expectTheme(page, saved);
        await shoot(
          page,
          `a saved ${saved} choice on a ${device} device: the first painted frame is already ${saved}`,
        );
      });
    });
  }
});

test.describe('a saved value that is not exactly light or dark (Review Focus 1)', () => {
  test.use({ colorScheme: 'light' });

  test('is ignored, and the device setting applies', async ({ page }) => {
    await page.goto('/');
    for (const stale of ['Dark', ' dark', 'dark\n', '"dark"', 'auto', '']) {
      await page.evaluate((value) => localStorage.setItem('theme', value), stale);
      await page.reload();
      await expectTheme(page, 'light');
      await expect(
        page.locator('html'),
        `${JSON.stringify(stale)} stamped nothing`,
      ).not.toHaveAttribute('data-theme', /./);
    }
  });
});
```

Then make three more edits.

- **Add `'theme-script.spec.ts',` to `CONTENT_ONLY_SPECS`** in `playwright.config.ts`, straight after `'copy-reaches-a-page.spec.ts',`. What it reads is DOM order, which is identical on every engine.
- **Rewrite the first former zero-JS guard.** In `tests/e2e/classroom-groups.spec.ts`, add `import { THEME_SCRIPT_SOURCE } from '../themes';` after `import { recorded, shoot } from './evidence';`. Then replace the whole test `'the homepage still ships no JavaScript'`, from its `test(` line to its closing `});`, with:

```ts
  test('the homepage ships the theme script and nothing else', async ({
    page,
  }) => {
    // Rewritten for #142. The promise was "the homepage ships zero JS"; it
    // now ships exactly one script, the inline theme script, so this pins
    // what may exist rather than counting to zero. Two measurements still,
    // because a request recorder cannot see an inline script at all (#79):
    // the DOM says what is on the page, and the recorder that nothing was
    // fetched to run. theme-script.spec.ts pins the same on every page.
    const seen = recordRequests(page);
    await page.goto('/');
    const scripts = await page.evaluate(() =>
      [...document.scripts].map((script) => ({
        src: script.getAttribute('src') ?? '',
        text: script.textContent ?? '',
      })),
    );
    expect(scripts, 'the homepage carries the theme script alone').toEqual([
      { src: '', text: THEME_SCRIPT_SOURCE },
    ]);
    seen.expectNone(
      ({ resourceType }) => resourceType === 'script',
      'the homepage fetches no script',
    );
  });
```

  In the `// M-11.` comment above it, replace its first sentence, "The one test in this file that never touches /classroom-groups --", and the text up to the end of that comment with:

```ts
  // M-11. The one test in this file that never touches /classroom-groups --
  // CLAUDE.md's promise about what the homepage ships (one script, the theme
  // script, since #142) is site-wide, and this task's own work could put it
  // at risk only by accident (a shared layout partial, a global script tag),
  // so it earns a direct check rather than an inference.
```

- **Rewrite the second former zero-JS guard.** In `tests/unit/locale-switcher.test.ts`, replace the test `'ships no JavaScript, because the homepage ships none'` with:

```ts
  it('ships no JavaScript of its own, so it works with scripting off', () => {
    const src = source(SWITCHER);
    expect(
      /<details[\s>]/.test(src),
      'the switcher is not a <details> element, so it needs JavaScript',
    ).toBe(true);
    expect(
      /<script/.test(src),
      'a language switcher is exactly the control someone needs when ' +
        'something else has already failed: it must work with no script, ' +
        'the theme script included (#142)',
    ).toBe(false);
  });
```

- [ ] **Step 3: Write the failing colour-guard widening.** In `tests/unit/colour-literals.test.ts`, first move the walk into a function of its own, keeping its filter exactly as it is. Replace `literalsUnderSrc` with:

```ts
/** The files the guard reads: every source under src/ but the tokens themselves. */
const scannedFiles = (): string[] =>
  filesUnder(
    'src',
    (path) => /\.(astro|css|ts)$/.test(path) && path !== TOKENS_FILE,
  );

const literalsUnderSrc = (): Literal[] =>
  scannedFiles().flatMap((file) =>
    literalsIn(file, readFileSync(file, 'utf8')),
  );
```

Then append two tests inside the `describe`:

```ts
  it('reads the theme script, and every kind of source a colour can hide in', () => {
    // #142 put the first plain .js under src/, and a guard reading only
    // .astro, .css and .ts would never have opened it.
    expect(scannedFiles()).toContain('src/scripts/theme.inline.js');
  });

  it('reads a script as code, never as CSS', () => {
    expect(
      literalsIn('x.js', 'const a = { color: red }; const b = "#fff";').map(
        describeLiteral,
      ),
    ).toEqual(['x.js :: (code) writes #fff']);
  });
```

- [ ] **Step 4: Run everything new and watch it fail.**
  - Run `npx vitest run tests/unit/colour-literals.test.ts tests/unit/locale-switcher.test.ts`. Expected: **2 red.**
    - *reads the theme script*: the walk does not open `.js`.
    - *reads a script as code, never as CSS*: `literalsIn` still reads any non-`.ts` file as CSS, so it also finds `x.js :: const a = writes red` inside the object literal.
  - The rewritten locale-switcher test is green: the switcher has no script, which is the point. Its red is mutation U13 in Task 12.
  - Run `npx playwright test tests/e2e/theme-script.spec.ts tests/e2e/theme.spec.ts`, then `npx playwright test tests/e2e/classroom-groups.spec.ts -g "ships the theme script" --project=chromium`. Expected:
    - `theme-script.spec.ts` (content project): **33 red.** The source control, 16 inventory tests and 16 order tests. The empty source matches no script on any page.
    - `theme.spec.ts`: **10 red**, the two no-flash tests on 5 engines. Nothing stamps the saved choice. The Review Focus test is **green on all 5**: nothing stamps anything yet. Its red is mutation S7 in Task 12.
    - `classroom-groups.spec.ts`: **1 red**. The homepage carries no script at all.

- [ ] **Step 5: Implement.**

`src/scripts/theme.inline.js`, the part of the script this task needs: read and stamp a saved choice, and reveal the switch.

```js
(() => {
  const root = document.documentElement;
  const saved = () => {
    try {
      const theme = localStorage.getItem('theme');
      return theme === 'light' || theme === 'dark' ? theme : null;
    } catch {
      return null;
    }
  };
  const apply = () => {
    const theme = saved();
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
  };
  apply();
  root.dataset.themeSwitch = '';
})();
```

In `src/layouts/BaseLayout.astro`, add `import themeScript from '../scripts/theme.inline.js?raw';` straight after `import '../styles/tokens.css';`. Then, straight after `<meta name="viewport" content="width=device-width, initial-scale=1" />`, add:

```astro
    {
      /* The theme script (#142 §5). Inline, classic and HERE, straight after
         the viewport meta and before every stylesheet, because it stamps a
         saved choice on <html> before the first paint: a visitor who chose
         light never sees a frame of dark, or the reverse. A module, `defer`
         or a later place in the document would all run after that frame.
         It also reveals the switch, which exists only for a page whose script
         ran, and handles its presses by delegation, since the switch does
         not exist yet when a head script runs.

         Its explanation lives here, where the build strips it, and not in the
         shipped file, which every page carries exactly as written. The site
         sends no Content-Security-Policy; one added later must allow this
         script by its hash, which changes only when the file does, and
         theme-script.spec.ts pins the content. The choice is one
         localStorage word, written only when the switch is pressed: no
         cookie, and nothing sent anywhere. */
    }
    <script is:inline set:html={themeScript}></script>
```

In `tests/unit/colour-literals.test.ts`, widen the walk and read every script as code:
- After the `Literal` type, add:

  ```ts
  /** Every kind of source file under src/ that a colour can be written in. */
  const SOURCE = /\.(astro|css|ts|js|mjs)$/;

  /** Code through and through: nothing in it to read as CSS by rule. */
  const isCode = (file: string): boolean => /\.(ts|js|mjs)$/.test(file);
  ```

- In `scannedFiles`, `/\.(astro|css|ts)$/.test(path)` becomes `SOURCE.test(path)`.
- In `literalsIn`, `...(file.endsWith('.ts')` becomes `...(isCode(file)`.
- `codeOf`'s doc comment, "all of a `.ts` file", becomes "all of a `.ts`, `.js` or `.mjs` file".

In `CLAUDE.md`, replace the line

```markdown
- **Homepage ships zero JS.** Only `/glory-points` and `/classroom-groups` have scripts, in both locales.
```

with

```markdown
- **Every page ships one script, the inline theme script, and the homepage nothing else.** `src/scripts/theme.inline.js` is emitted by `BaseLayout.astro` inline and classic in `<head>`, ahead of every stylesheet, so a saved light or dark choice is on `<html>` before the first paint (#142). The homepage in all five locales and the 404 carry nothing else; `/glory-points` and `/classroom-groups` add their own, in all five locales. `tests/e2e/theme-script.spec.ts` pins that inventory on every built page, read from a real DOM.
```

- [ ] **Step 6: Run everything and watch it pass.**
  - Rerun both Step 4 commands. Expected: all green.
    - `theme-script.spec.ts`: 33 of 33.
    - `theme.spec.ts`: 15 of 15. The Review Focus test is on 5 engines.
    - `classroom-groups.spec.ts`: 1 of 1.
  - If the inventory fails only on the source comparison, the build changed the text, for example by compressing whitespace. Compare `script.textContent` with the file byte by byte, and fix the emission, never the comparison.
  - Then run `npm run test:unit`, `npm run typecheck` and `npx prettier --check .`. Expected: all green, and 0/0/0. `astro check` now type-checks the script under `checkJs`.

- [ ] **Step 7: Commit.**

```bash
npx prettier --write src/scripts/theme.inline.js src/layouts/BaseLayout.astro tests/themes.ts tests/e2e/theme-script.spec.ts tests/e2e/theme.spec.ts tests/e2e/classroom-groups.spec.ts tests/unit/locale-switcher.test.ts tests/unit/colour-literals.test.ts playwright.config.ts CLAUDE.md
git add src/scripts/theme.inline.js src/layouts/BaseLayout.astro tests/themes.ts tests/e2e/theme-script.spec.ts tests/e2e/theme.spec.ts tests/e2e/classroom-groups.spec.ts tests/unit/locale-switcher.test.ts tests/unit/colour-literals.test.ts playwright.config.ts CLAUDE.md
git commit -m "feat(layout): one inline theme script in every head, pinned by inventory

Refs #142"
```

---

### Task 5: The switch in the header

**Files:**
- Create: `src/components/ThemeSwitch.astro`
- Modify: `src/components/Header.astro`, `src/styles/tokens.css`, `src/scripts/theme.inline.js`
- Modify: `src/lib/i18n/site.ts`, `src/lib/i18n/label-check.ts`, `src/lib/i18n/.translations.json`
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: `expectTheme` (Task 4); `THEMES`, `themeColour` (Task 1); `getSiteStrings`, `LOCALES`, `localisePath` (`src/lib/i18n`); `atLeast44` (`tests/viewport.ts`).
- Produces:
  - `SiteStrings['themeDarkMode']`;
  - the switch, `header [data-theme-toggle]`, a `<button>` with `aria-label` and, once the script runs, `aria-pressed`;
  - the tokens `--switch-display`, `--switch-moon` and `--switch-sun`.

- [ ] **Step 1: Write the failing tests.** In `tests/e2e/theme.spec.ts`:
  - **The `../palette` import** becomes `import { THEMES, themeColour } from '../palette';`.
  - **Two new imports:** `import { atLeast44 } from '../viewport';` and `import { LOCALES, getSiteStrings, localisePath } from '../../src/lib/i18n';`.
  - **Two constants** go after the file's doc comment: `const SWITCH = 'header [data-theme-toggle]';` and `const toggle = (page: Page) => page.locator(SWITCH);`.
  - **Append:**

```ts
test.describe('the switch (#142 §5, AC3)', () => {
  for (const locale of LOCALES) {
    test(`${locale}: a toggle button named in its own language, pressed while dark`, async ({
      page,
    }) => {
      const name = getSiteStrings(locale).themeDarkMode;
      await page.goto(localisePath('/', locale));
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await button.click();
      await expectTheme(page, 'light');
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await shoot(page, `${locale}: "${name}" pressed off, and the page is light`, button);
    });
  }

  test('is 44 × 44, with a visible focus ring', async ({ page }) => {
    await page.goto('/');
    await expect(toggle(page)).toBeVisible();
    await atLeast44(toggle(page), 'the theme switch');
    // A keypress first, so the focus below is keyboard focus to every
    // engine's :focus-visible heuristic.
    await page.keyboard.press('Shift');
    await toggle(page).focus();
    await expect(toggle(page)).toHaveCSS('outline-style', 'solid');
    await expect(toggle(page)).toHaveCSS('outline-width', '3px');
    await shoot(page, 'the switch focused: its ring is the accent', toggle(page));
  });

  test('Enter and Space each toggle it', async ({ page }) => {
    await page.goto('/');
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expectTheme(page, 'light');
    await page.keyboard.press('Space');
    await expectTheme(page, 'dark');
  });

  test('switches instantly: the next frame already paints the new ground', async ({
    page,
  }) => {
    await page.goto('/');
    await expectTheme(page, 'dark');
    const next = await toggle(page).evaluate(
      (button) =>
        new Promise<string>((resolve) => {
          (button as HTMLElement).click();
          requestAnimationFrame(() =>
            resolve(getComputedStyle(document.documentElement).backgroundColor),
          );
        }),
    );
    expect(next).toBe(themeColour('light', '--bg'));
  });

  test('does not print', async ({ page }) => {
    await page.goto('/');
    await expect(toggle(page)).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(toggle(page)).toHaveCount(1);
    await expect(toggle(page)).toBeHidden();
  });

  test('under forced colours, its icon draws in the system text colour (Review Focus 4)', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Playwright emulates forcedColors in Chromium alone',
    );
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/');
    const drawn = await toggle(page).evaluate((button) => ({
      ink: getComputedStyle(button).color,
      paints: [...button.querySelectorAll('svg')]
        .filter((svg) => svg.getClientRects().length > 0)
        .flatMap((svg) => [...svg.querySelectorAll('circle, path')])
        .map((shape) => {
          const style = getComputedStyle(shape);
          return style.fill === 'none' ? style.stroke : style.fill;
        }),
    }));
    expect(drawn.paints.length, 'the visible icon draws something').toBeGreaterThan(0);
    expect([...new Set(drawn.paints)]).toEqual([drawn.ink]);
  });
});

test.describe('without JavaScript (#142 AC7)', () => {
  test.use({ javaScriptEnabled: false });

  for (const theme of THEMES) {
    test.describe(`on a device preferring ${theme}`, () => {
      test.use({ colorScheme: theme });

      test(
        'the switch is absent, and the device setting applies',
        { tag: '@requires-isolated-context' },
        async ({ page }) => {
          await page.goto('/');
          await expectTheme(page, theme);
          await expect(toggle(page)).toHaveCount(1);
          await expect(toggle(page)).toBeHidden();
          await expect(toggle(page)).not.toHaveAttribute('aria-pressed', /./);
        },
      );
    });
  }
});
```

- [ ] **Step 2: Run them and watch them fail.**
  - Run: `npx playwright test tests/e2e/theme.spec.ts`
  - Expected: the new tests fail on every engine where they run: there is no switch.
    - **Red:** the 5 locale tests, *is 44 × 44*, *Enter and Space*, *instantly* and *does not print*, on 5 engines. The forced-colours test on `chromium` and `mobile-chrome`.
    - **Skipped:** the forced-colours test on the other three.
    - **Without JavaScript:** its 2 tests are red on all 5 engines. The locator counts 0 where the test wants 1.
  - Before Step 3, `getSiteStrings(locale).themeDarkMode` is `undefined`, so `getByRole` filters by no name. The count is then not 1 wherever the page has any other button, so the failure is still red, for the reason the test states.

- [ ] **Step 3: Implement.**

**The label, in five locales.**
- In `src/lib/i18n/site.ts`, add `themeDarkMode: 'Dark mode',` after `menuLabel: 'Toggle navigation menu',` in `siteEn`.
- In `src/lib/i18n/label-check.ts`, add `themeDarkMode: CHROME,` after `menuLabel: CHROME,` in `SITE_PAGES`.
- Then draft the four other locales with the repo's translator. It sends only English it has no draft for, here the nine characters "Dark mode" per locale, and writes the drafts to `src/lib/i18n/.translations.json`:

```bash
npm run i18n:translate -- id --send
npm run i18n:translate -- zh --send
npm run i18n:translate -- vi --send
npm run i18n:translate -- th --send
```

  Copy each draft into `site.ts`, after that locale's `menuLabel`, as `themeDarkMode`. The drafts expected, and the values to check them against, are:

  | locale | draft |
  | --- | --- |
  | `id` | `Mode gelap` |
  | `zh` | `深色模式` |
  | `vi` | `Chế độ tối` |
  | `th` | `โหมดมืด` |

  The cache is the source. If DeepL returns another draft, that draft is written, and the difference is noted in the task's commit message. If the key is unavailable, the translator dies with *DEEPL_API_KEY is not set*: stop and ask the operator, because the drafts are machine-seeded by design (§8).

**The tokens.**
- In `tokens.css`'s bare `:root`, straight after `--wordmark-pad: 0.12em 0.42em 0.18em;`, add:

```css

  /* The theme switch (ThemeSwitch.astro, #142 §4-5). Hidden until the theme
     script has run and stamped data-theme-switch (the last rule of the
     screen block below), so with JavaScript off no dead button is offered.
     Its icon is chosen here, beside the palette it names: a moon while light
     is showing, a sun while dark is. */
  --switch-display: none;
  --switch-moon: inline-block;
  --switch-sun: none;
```

- In **both** dark blocks, straight after each `--wordmark-pad: 0;`, add:

```css
    --switch-moon: none;
    --switch-sun: inline-block;
```

- Inside `@media screen {`, straight after the closing `}` of `:root[data-theme='dark']`, add:

```css

  /* The switch appears only once the theme script has run (#142 §4).
     Screen-only, so it never prints; and here, in the one file that owns the
     root, because a component's scoped selectors never test an attribute on
     :root. */
  :root[data-theme-switch] {
    --switch-display: inline-flex;
  }
```

**The component.** Create `src/components/ThemeSwitch.astro`:

```astro
---
import { getSiteStrings, type Locale } from '../lib/i18n';

interface Props {
  lang: Locale;
}
const { lang } = Astro.props;
const t = getSiteStrings(lang);
---

{
  /* The theme switch (#142 §5): a toggle button whose name stays "Dark mode"
     while only its pressed state changes, the WAI-ARIA pattern. The server
     renders no aria-pressed; the theme script adds it once the page has
     parsed and keeps it true, so the attribute exists only while something
     maintains it. Hidden until that script has run (--switch-display in
     tokens.css): with JavaScript off, the device's own setting applies and no
     dead button is offered. The icons are decorative: a moon while light is
     showing and a sun while dark is, each shown by a token, so an icon can
     never disagree with the palette. They draw in currentColor, from --ink,
     which also lets forced colours reach them. */
}
<button
  type="button"
  class="theme-switch"
  data-theme-toggle
  aria-label={t.themeDarkMode}
>
  <svg class="moon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M20.4 14.1A8.6 8.6 0 1 1 9.9 3.6a7.5 7.5 0 0 0 10.5 10.5Z"
    />
  </svg>
  <svg class="sun" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <circle fill="currentColor" cx="12" cy="12" r="4.5" />
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
    />
  </svg>
</button>

<style>
  .theme-switch {
    display: var(--switch-display);
    flex: none;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--ink);
    cursor: pointer;
  }
  .moon {
    display: var(--switch-moon);
  }
  .sun {
    display: var(--switch-sun);
  }
</style>
```

**The header.** In `src/components/Header.astro`:
- Add `import ThemeSwitch from './ThemeSwitch.astro';` after the `LanguageSwitcher` import.
- Replace the comment block above `<LanguageSwitcher …/>`, and that line, with:

```astro
    {/* The theme switch and the language switcher are ONE item in the bar
        (#142 §5). The bar spaces its items with `space-between`, so a fourth
        separate item would float in the middle of the row on a wide screen
        rather than sit beside the language switcher. Both live in the BAR,
        not in <nav>, for two reasons, both learned from a failing test.
        <nav> means "the site's sections" and is pinned to exactly those
        three links; these controls are a different kind of thing. And on
        mobile <nav> collapses behind the menu button, which would hide them
        from exactly the visitors most likely to want them. */}
    <div class="controls">
      <ThemeSwitch lang={lang} />
      <LanguageSwitcher lang={lang} pathname={Astro.url.pathname} />
    </div>
```

- In the `<style>` block, add, straight after the `.wordmark` rule:

```css
  .controls {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
```

**The script.** `src/scripts/theme.inline.js` becomes:

```js
(() => {
  const root = document.documentElement;
  const os = matchMedia('(prefers-color-scheme: dark)');
  const saved = () => {
    try {
      const theme = localStorage.getItem('theme');
      return theme === 'light' || theme === 'dark' ? theme : null;
    } catch {
      return null;
    }
  };
  const apply = () => {
    const theme = saved();
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
  };
  const showing = () => root.dataset.theme ?? (os.matches ? 'dark' : 'light');
  const press = () => {
    for (const toggle of document.querySelectorAll('[data-theme-toggle]'))
      toggle.setAttribute('aria-pressed', String(showing() === 'dark'));
  };
  apply();
  root.dataset.themeSwitch = '';
  document.addEventListener('DOMContentLoaded', press);
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('[data-theme-toggle]')) return;
    root.dataset.theme = showing() === 'dark' ? 'light' : 'dark';
    press();
  });
})();
```

- [ ] **Step 4: Run everything that reads the header, and watch it pass.**
  - Run: `npx playwright test tests/e2e/theme.spec.ts tests/e2e/theme-script.spec.ts tests/e2e/header-room.spec.ts tests/e2e/chrome.spec.ts tests/e2e/language-switcher.spec.ts tests/e2e/locale-beta.spec.ts tests/e2e/skip-link.spec.ts`
  - Expected: all green. The forced-colours test skips on `firefox`, `webkit` and `mobile-safari`. The Tab walks skip on WebKit as before.
  - **`header-room.spec.ts` is the geometry proof of AC3.** It derives every `a[href], summary, button` in `header .bar`, the switch included, and measures overlap and wrapping in every locale at every width from 320px. A red there is the header's finding, never the guard's.
  - Then run `npm run test:unit`. Expected: all green:
    - `tokens`: *declares no token that nothing reads* sees the three switch tokens read by `ThemeSwitch.astro`;
    - `dead-copy`, `i18n`, `locale-fallbacks`, `label-check` and `verified-labels`: `themeDarkMode` has no witness, so it is `unchecked`, and nothing needs pinning;
    - `colour-literals`: `currentColor` and `none` are not colours.

    Also run `npm run typecheck` (0/0/0) and `npx prettier --check .`.

- [ ] **Step 5: Commit.**

```bash
npx prettier --write src/components/ThemeSwitch.astro src/components/Header.astro src/styles/tokens.css src/scripts/theme.inline.js src/lib/i18n/site.ts src/lib/i18n/label-check.ts tests/e2e/theme.spec.ts
git add src/components/ThemeSwitch.astro src/components/Header.astro src/styles/tokens.css src/scripts/theme.inline.js src/lib/i18n/site.ts src/lib/i18n/label-check.ts src/lib/i18n/.translations.json tests/e2e/theme.spec.ts
git commit -m "feat(header): the theme switch, a toggle beside the language switcher

Refs #142"
```

---

### Task 6: The choice persists, and the switch follows the device

**Files:**
- Modify: `src/scripts/theme.inline.js`
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: `toggle`, `expectTheme` (Tasks 4 and 5); `emulateTheme` (Task 4); `recordErrors` (`tests/e2e/recorders.ts`).
- Produces: the final script. A press saves the choice under `theme`. `aria-pressed` follows the device when no choice is saved. A page restored from the back-forward cache re-applies the saved choice.

- [ ] **Step 1: Write the failing tests.** Add `import { recordErrors } from './recorders';` and `import { emulateTheme, expectTheme } from '../themes';` (replacing the Task 4 import of `expectTheme`) to `tests/e2e/theme.spec.ts`, then append:

```ts
test.describe('the choice persists (#142 AC4)', () => {
  test('across a reload and a second page', async ({ page }) => {
    await page.goto('/');
    await expectTheme(page, 'dark');
    await toggle(page).click();
    await expectTheme(page, 'light');
    await page.reload();
    await expectTheme(page, 'light');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await page.goto('/glory-points');
    await expectTheme(page, 'light');
    await shoot(page, 'a light choice made on the homepage holds on /glory-points', toggle(page));
  });

  test(
    'into a new session that carries the same storage',
    { tag: '@requires-isolated-context' },
    async ({ page, browser, baseURL }) => {
      await page.goto('/');
      await toggle(page).click();
      await expectTheme(page, 'light');
      const storageState = await page.context().storageState();
      const session = await browser.newContext({
        storageState,
        baseURL,
        colorScheme: 'dark',
      });
      try {
        const next = await session.newPage();
        await next.goto('/');
        await expectTheme(next, 'light');
      } finally {
        await session.close();
      }
    },
  );

  test('and a press after a stale saved value saves a valid one (Review Focus 1)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('theme', 'Dark'));
    await page.reload();
    await toggle(page).click();
    await expectTheme(page, 'light');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
  });

  test('and a double press lands where it started, saving what it shows (Review Focus 2)', async ({
    page,
  }) => {
    await page.goto('/');
    await toggle(page).dblclick();
    await expectTheme(page, 'dark');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
  });
});

test.describe('storage refused (#142 AC7)', () => {
  test('the switch still changes the page, nothing is saved, and nothing is logged', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
    const errors = recordErrors(page);
    await page.goto('/');
    await expectTheme(page, 'dark');
    await toggle(page).click();
    await expectTheme(page, 'light');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await errors.expectNone('the theme script threw where storage is refused');
    // A second page carries no refusal, so it can read what was saved.
    const probe = await page.context().newPage();
    await probe.goto('/');
    expect(await probe.evaluate(() => localStorage.getItem('theme'))).toBeNull();
    await probe.close();
  });
});

test.describe('the device (#142 AC2)', () => {
  test('with no choice saved, the page and the switch follow it, live', async ({
    page,
  }) => {
    await page.goto('/');
    await expectTheme(page, 'dark');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await emulateTheme(page, 'light');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await emulateTheme(page, 'dark');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('with a choice saved, a change on the device changes nothing (Review Focus 5)', async ({
    page,
  }) => {
    await page.goto('/');
    await toggle(page).click();
    await expectTheme(page, 'light');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectTheme(page, 'light');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('an engine without MediaQueryList.addEventListener still switches, and logs nothing (Review Focus 3)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // Safari before 14 offered only the deprecated addListener.
      Object.defineProperty(MediaQueryList.prototype, 'addEventListener', {
        configurable: true,
        value: undefined,
      });
    });
    const errors = recordErrors(page);
    await page.goto('/');
    await toggle(page).click();
    await expectTheme(page, 'light');
    await page.reload();
    await expectTheme(page, 'light');
    await errors.expectNone('the theme script threw without MediaQueryList.addEventListener');
  });
});

test.describe('Back (#142 §5 step 5, AC4)', () => {
  test('a page restored from the back-forward cache shows the theme chosen after leaving it', async ({
    page,
  }) => {
    await page.goto('/');
    await expectTheme(page, 'dark');
    await page.evaluate(() => {
      addEventListener('pageshow', (event) => {
        if (event.persisted) document.documentElement.dataset.restored = '';
      });
    });
    await page.goto('/glory-points');
    await toggle(page).click();
    await expectTheme(page, 'light');
    await page.goBack();
    await page.waitForLoadState();
    const restored = await page.evaluate(
      () => 'restored' in document.documentElement.dataset,
    );
    test.skip(
      !restored,
      'this engine reloaded the page instead of restoring it from the back-forward cache ' +
        '(Playwright launches Chromium with --disable-back-forward-cache); a reload re-runs ' +
        'the head script and would pass without the pageshow handler ever running',
    );
    await expectTheme(page, 'light');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the pageshow handler re-applies the saved choice, and aria-pressed with it', async ({
    page,
  }) => {
    // Runs on every engine, so the handler is proven even where every engine
    // skips the real Back above (§6.3).
    await page.goto('/');
    await expectTheme(page, 'dark');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expectTheme(page, 'light');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  });
});
```

- [ ] **Step 2: Run them and watch them fail.**
  - Run: `npx playwright test tests/e2e/theme.spec.ts`
  - Expected: nothing saves yet, so these are **red on every engine where they run**:
    - *across a reload and a second page*;
    - *into a new session*;
    - *a press after a stale saved value*, because nothing is saved;
    - *a double press*, because nothing is saved;
    - *the device … follow it, live*, because nothing moves `aria-pressed`;
    - *the pageshow handler*.
  - Also red: *without MediaQueryList.addEventListener*. Its reload shows dark, since nothing is saved yet. What it exists for, that nothing throws, is proven red by mutation S6 in Task 12.
  - **Green:** *storage refused* and *a change on the device changes nothing*. Each already holds for the Task 5 script. Their reds are mutations S2 and S9 in Task 12.
  - **Skipped:** *a page restored from the back-forward cache*, wherever the engine did not restore the page. Record which engines ran it: that list goes in the PR body.

- [ ] **Step 3: Implement.** `src/scripts/theme.inline.js` becomes its final form:

```js
(() => {
  const root = document.documentElement;
  const os = matchMedia('(prefers-color-scheme: dark)');
  const saved = () => {
    try {
      const theme = localStorage.getItem('theme');
      return theme === 'light' || theme === 'dark' ? theme : null;
    } catch {
      return null;
    }
  };
  const apply = () => {
    const theme = saved();
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
  };
  const showing = () => root.dataset.theme ?? (os.matches ? 'dark' : 'light');
  const press = () => {
    for (const toggle of document.querySelectorAll('[data-theme-toggle]'))
      toggle.setAttribute('aria-pressed', String(showing() === 'dark'));
  };
  apply();
  root.dataset.themeSwitch = '';
  document.addEventListener('DOMContentLoaded', press);
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('[data-theme-toggle]')) return;
    const theme = showing() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {}
    press();
  });
  addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    apply();
    press();
  });
  os.addEventListener?.('change', press);
})();
```

  The device listener is attached last, and only where it exists. An engine without `MediaQueryList.addEventListener` then still has its click and `pageshow` handlers, and throws nothing (Review Focus 3). The empty `catch` is the specified behaviour, not a silent failure. §5 says: if saving throws, the page still switches, and the choice is just not remembered. *storage refused* holds that behaviour.

- [ ] **Step 4: Run everything and watch it pass.**
  - Run: `npx playwright test tests/e2e/theme.spec.ts tests/e2e/theme-script.spec.ts`. Expected: all green, apart from the recorded skips. The inventory still matches, because it compares with the file as it now reads.
  - Measure the shipped size with `wc -c src/scripts/theme.inline.js` and record it for the PR body. §5 asks for "a few hundred bytes".
  - Then run `npm run test:unit`, `npm run typecheck` and `npx prettier --check .`.

- [ ] **Step 5: Commit.**

```bash
npx prettier --write src/scripts/theme.inline.js tests/e2e/theme.spec.ts
git add src/scripts/theme.inline.js tests/e2e/theme.spec.ts
git commit -m "feat(theme): the choice persists, and the switch follows the device

Refs #142"
```

---

### Task 7: Every palette-reading guard runs in both themes

**Files:**
- Modify: `tests/e2e/palette-controls.spec.ts`, `tests/e2e/print-legibility.spec.ts`, `tests/e2e/thai-typography.spec.ts`, `tests/e2e/classroom-groups.spec.ts`, `tests/e2e/classroom-groups-roster.spec.ts`, `tests/e2e/disabled-controls.spec.ts`, `tests/e2e/locale-beta.spec.ts`, `tests/e2e/homepage.spec.ts`

**Interfaces:**
- Consumes: `THEMES`, `themeColour` (Task 1); `emulateTheme`, `expectTheme`, `saveTheme` (Task 4).
- Produces: nothing new. Every edit below is the same move: the assertion runs once per theme, and each run first proves its theme through `emulateTheme`.

- [ ] **Step 1: Derive the set, and check it against this task's list.**
  - Run:

    ```bash
    command grep -l -E "toHaveCSS\(\s*'(color|background-color|background|border-color|border-top-color|outline-color|accent-color|box-shadow|fill|stroke)'|\.(backgroundColor|borderColor|borderTopColor|outlineColor|accentColor)\b|style\.color\b|contrastRatio\(|getPropertyValue\('--" tests/e2e/*.spec.ts
    ```

  - Expected, at `3640af2` plus Tasks 1 to 6: `classroom-groups-roster`, `classroom-groups`, `disabled-controls`, `evidence-page`, `homepage`, `locale-beta`, `palette-controls` and `print-legibility`, each `.spec.ts`, plus `theme.spec.ts` from Tasks 4 to 6, which already sets its own themes.
  - **Two differences from that list, both deliberate:**
    - `evidence-page.spec.ts` reads the colours of the evidence page the scripts build, not the site's, so it stays as it is.
    - `thai-typography.spec.ts` reads no colour, but §6.2 names it, and a theme changes what it measures: the mark's tile padding sits in the `/th/` homepage's `h2`.

    Any other file the command prints is a finding: add it here before going on.

- [ ] **Step 2: Make each guard run per theme.** Every edit adds `import { THEMES } from '../palette';` and the helpers it uses from `'../themes'`. Where a spec already imports from one of those modules, the names join that import.

**`palette-controls.spec.ts`.** Import `emulateTheme`.
- In the per-path test:
  - The title becomes `` `${path}: every control it paints uses a palette colour, in both themes` ``.
  - Everything after `await page.goto(path);` goes inside `for (const theme of THEMES) {`, opened by `await emulateTheme(page, theme);`.
  - Inside that loop:
    - the homepage branch's `return;` becomes `continue;`;
    - the off-palette message becomes `` `${theme}: off-palette control colours on ${path}; the palette resolved to ${allowed.length} values` ``;
    - the shot's label becomes `` `${path}, ${theme}: all ${readings.length} controls drawn from the palette's ${allowed.length} values` ``.
  - The allowed set is still read off `:root` at runtime, so in light it is Studio's.
- In *the controls the browser draws use the brand accent*:
  - the title gains `, in both themes`;
  - everything after the liveness `await expect(boxes.first()).toBeVisible();` goes inside the same loop;
  - the shot's label becomes `` `${theme}: all ${await boxes.count()} browser-drawn controls use --accent ${resolved}` ``.

**`print-legibility.spec.ts`.** Import `emulateTheme`, `expectTheme` and `saveTheme` from `'../themes'`, and `THEMES` from `'../palette'`.
- Add, after `const BODY_TEXT = 4.5;`:

```ts
/**
 * The screens a sheet is printed from (#142 §6.2). Paper ignores the screen
 * theme, so each must print the same legible ink. The last run stamps a
 * saved `dark` choice on a light device: that is the state whose theme block
 * would outrank paper if it were not screen-only.
 */
const PRINT_RUNS = [
  { device: 'light', saved: null },
  { device: 'dark', saved: null },
  { device: 'light', saved: 'dark' },
] as const;

/** Ink a screen shows on its headings, pinned per theme against the brief (#117). */
const SCREEN_INK = { light: 'rgb(17, 24, 33)', dark: 'rgb(234, 242, 255)' } as const;
```

- The per-path test becomes:

```ts
  test(`${path}: every printed ink is readable on white paper, whatever the screen shows`, async ({
    page,
  }) => {
    await page.goto(path);
    for (const { device, saved } of PRINT_RUNS) {
      await emulateTheme(page, device);
      if (saved !== null) await saveTheme(page, saved);
      await prepare(page);
      // In screen media, before the switch to print: on paper the ground is
      // white whatever the theme, so this is the only place it can be read.
      await expectTheme(page, saved ?? device);
      const screen = `${saved ?? device} screen${saved ? ' (a saved choice)' : ''}`;

      await page.emulateMedia({ media: 'print' });
      const inks = await inkInUse(page);

      // Liveness: a page whose text all sat inside ancestors, or a selector
      // that stopped matching, reports zero offenders exactly like a correct
      // page.
      expect(
        inks.length,
        `${path} from a ${screen} rendered no text under print media — the guard measured nothing`,
      ).toBeGreaterThan(0);

      const illegible = inks
        .map(({ colour, where }) => ({ colour, where, rgb: inkOnPaper(colour) }))
        .filter(({ rgb }) => rgb === null || contrast(rgb, PAPER) < BODY_TEXT)
        .map(
          ({ colour, where, rgb }) =>
            `${where} — ${colour} is ${rgb ? contrast(rgb, PAPER).toFixed(2) : '?'}:1 on white`,
        );
      expect(
        searched(illegible, { of: inks, what: `distinct inks on ${path}` }),
        `${path} from a ${screen}: ink that will not survive the printer`,
      ).toEqual([]);
      // Captured while print media is still emulated, which is the whole
      // point: this image is the sheet, not the screen. A blank one IS the
      // defect.
      await shoot(
        page,
        `${path} printed from a ${screen}: all ${inks.length} inks clear ${BODY_TEXT}:1 on white`,
      );
    }
  });
```

- In *a disabled control never depends on its fill reaching paper*, everything after `await page.goto('/classroom-groups');` and the `resolve` helper goes inside `for (const theme of THEMES) {`, opened by `await emulateTheme(page, theme);`. The two messages gain `${theme}: ` at their start, and so does the shot's label.
- *the screen palette is not dragged down with the print one* becomes:

```ts
test('the screen palette is not dragged down with the print one', async ({
  page,
}) => {
  // The inverse. Fixing print by blackening the ink everywhere would pass
  // every assertion above and ruin the site, so pin that each screen theme
  // still paints its own ink.
  await page.goto('/classroom-groups');
  for (const theme of THEMES) {
    await emulateTheme(page, theme);
    await expect(page.locator('h1')).toHaveCSS('color', SCREEN_INK[theme]);
    await shoot(
      page,
      `on a ${theme} screen the heading keeps its ink, ${SCREEN_INK[theme]}`,
      page.locator('h1'),
    );
  }
});
```

**`thai-typography.spec.ts`.** Import `emulateTheme`. Inside the route loop, everything after the status assertion goes inside `for (const theme of THEMES) {`, opened by `await emulateTheme(page, theme);`.
- The `examined` message, the `searched` `what` and the verdict message each gain `, ${theme}` after `${width}px`.
- The shot's label becomes `` `${route} at ${width}px, ${theme}: ${examined} Thai runs clear of the line above` ``.

**`classroom-groups.spec.ts`.** Extend the `'../themes'` import to `{ THEME_SCRIPT_SOURCE, emulateTheme }`.
- In *the dim stays above the WCAG AA contrast floor for normal text*, the last two statements become:

```ts
    for (const theme of THEMES) {
      await emulateTheme(page, theme);
      const contrast = await contrastRatio(
        page.locator('#cg-results .group').first(),
      );
      expect(contrast, theme).toBeGreaterThanOrEqual(4.5);
    }
```

- In *the out-of-date sentence meets the WCAG AA contrast floor*, the last two statements become:

```ts
    for (const theme of THEMES) {
      await emulateTheme(page, theme);
      expect(await contrastRatio(sentence), theme).toBeGreaterThanOrEqual(4.5);
      await shoot(
        page,
        `${theme}: the out-of-date sentence on its cream notice`,
        page.locator('#cg-stale'),
      );
    }
```

- In *the accent colour still meets the WCAG AA contrast floor*, the last two statements become:

```ts
    for (const theme of THEMES) {
      await emulateTheme(page, theme);
      const contrast = await contrastRatio(page.locator('#cg-go'));
      expect(contrast, theme).toBeGreaterThanOrEqual(4.5);
    }
```

**`classroom-groups-roster.spec.ts`.** Import `emulateTheme`.
- In *is tinted, striped and labelled*, `await expect(row).toHaveCSS('background-color', 'rgb(255, 246, 227)');` becomes:

```ts
    for (const theme of THEMES) {
      await emulateTheme(page, theme);
      await expect(row, theme).toHaveCSS('background-color', 'rgb(255, 246, 227)');
    }
```

- In the per-layout test `` `${name}: absence carries the tint, the stripe and the pill -- same element as the table` ``, the same line becomes the same loop.
- In *the pill text meets the WCAG AA contrast floor*, the last two statements become:

```ts
    for (const theme of THEMES) {
      await emulateTheme(page, theme);
      const contrast = await contrastRatio(
        page.locator('.cg-absent-pill').first(),
      );
      expect(contrast, theme).toBeGreaterThanOrEqual(4.5);
    }
```

- In *the gap warning meets the WCAG AA contrast floor*, the last two statements become:

```ts
    for (const theme of THEMES) {
      await emulateTheme(page, theme);
      expect(await contrastRatio(warning), theme).toBeGreaterThanOrEqual(4.5);
      await shoot(page, `${theme}: the gap warning on its cream ground`, warning);
    }
```

**`disabled-controls.spec.ts`.** Import `emulateTheme`.
- In *roster at the limit — the add buttons and Make groups too*, the three lines from `const { reachable, fill, ink } = await affordances(page);` to `expectDisabledPaint(reachable, fill, ink, 'at-limit');` become:

```ts
    for (const theme of THEMES) {
      await emulateTheme(page, theme);
      const { reachable, fill, ink } = await affordances(page);
      expectNoEntryCursor(reachable, `at-limit, ${theme}`);
      expectDisabledPaint(reachable, fill, ink, `at-limit, ${theme}`);
    }
```

  The next line, `expectAReasonWithoutHover(await reasons(page), 'at-limit');`, stays after the loop.
- In *the disabled placeholder option is excluded deliberately, and it exists*, everything from `const { reachable, excluded, fill, ink } = await affordances(page);` to the end of the test goes inside the same loop, opened by `await emulateTheme(page, theme);`. Its two labels become `` `a sex chosen, ${theme}` ``.

**`locale-beta.spec.ts`.** Import `emulateTheme`. *the badge clears the WCAG AA floor for normal text* becomes:

```ts
  test('the badge clears the WCAG AA floor for normal text, in both themes', async ({
    page,
  }) => {
    // Both placements: the dropdown paints its own background, so the entry
    // badge is a different composite from the one in the summary. The list
    // is opened first, so both badges are measured in each theme.
    await page.goto(localisePath('/', PREFIXED_LOCALES[0]));
    await page.locator(`${SWITCHER} > summary`).click();
    const summaryBadge = page.locator(`${SWITCHER} > summary ${BADGE}`).first();
    const entryBadge = page.locator(`${SWITCHER} li ${BADGE}`).first();
    await expect(entryBadge).toBeVisible();
    for (const theme of THEMES) {
      await emulateTheme(page, theme);
      const summaryRatio = await contrastRatio(summaryBadge);
      expect(summaryRatio, `${theme}: the summary badge`).toBeGreaterThanOrEqual(4.5);
      const entryRatio = await contrastRatio(entryBadge);
      expect(entryRatio, `${theme}: the entry badge`).toBeGreaterThanOrEqual(4.5);
      await shoot(
        page,
        `${theme}: the badge paints ${summaryRatio.toFixed(2)}:1 in the summary and ${entryRatio.toFixed(2)}:1 in the list, floor 4.5:1`,
        page.locator(SWITCHER),
      );
    }
  });
```

**`homepage.spec.ts`.** Import `THEMES` and `themeColour` from `'../palette'`, and `emulateTheme` from `'../themes'`. Append this block at the end of *the ShyTalk showcase carries the brand wordmark and links out*:

```ts
    // #142 §3.4, AC14: the mark keeps its own tones in both themes, sits on
    // its own tile in light and on nothing in dark, and prints in the
    // page's own ink with no tile.
    for (const theme of THEMES) {
      await emulateTheme(page, theme);
      await expect(wordmark, theme).toHaveCSS('color', asComputedRgb(SHYTALK_MARK.shy));
      await expect(wordmark, theme).toHaveCSS(
        'background-color',
        themeColour(theme, '--wordmark-tile'),
      );
    }
    await page.emulateMedia({ media: 'print' });
    const ink = await page
      .locator('body')
      .evaluate((body) => getComputedStyle(body).color);
    await expect(wordmark, 'on paper').toHaveCSS('color', ink);
    await expect(wordmark, 'on paper').toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
```

- [ ] **Step 3: Run the eight specs on every engine.**
  - Run: `npx playwright test tests/e2e/palette-controls.spec.ts tests/e2e/print-legibility.spec.ts tests/e2e/thai-typography.spec.ts tests/e2e/classroom-groups.spec.ts tests/e2e/classroom-groups-roster.spec.ts tests/e2e/disabled-controls.spec.ts tests/e2e/locale-beta.spec.ts tests/e2e/homepage.spec.ts`
  - Expected: all green. These guards already hold in dark, and Studio's pairs all clear in the unit suite.
  - **A red in the light run is a finding about the page, never about the guard.** Read the failing assertion, then check the ground in a browser before believing it, since a composite can report a ground no page paints (standing rule). Fix the component by moving it onto tokens, and re-run. Record each such finding and its fix for the PR body.
  - Then run `npm run test:unit`, which holds the meta-guards on specs: `capture-after-assertion`, `event-collectors`, `absence-liveness`, `viewport-tagging` and `evidence-recording`. Expected: all green. Every `shoot` above comes after an `expect` in the same loop.

- [ ] **Step 4: Commit.**

```bash
npx prettier --write tests/e2e/palette-controls.spec.ts tests/e2e/print-legibility.spec.ts tests/e2e/thai-typography.spec.ts tests/e2e/classroom-groups.spec.ts tests/e2e/classroom-groups-roster.spec.ts tests/e2e/disabled-controls.spec.ts tests/e2e/locale-beta.spec.ts tests/e2e/homepage.spec.ts
git add tests/e2e/palette-controls.spec.ts tests/e2e/print-legibility.spec.ts tests/e2e/thai-typography.spec.ts tests/e2e/classroom-groups.spec.ts tests/e2e/classroom-groups-roster.spec.ts tests/e2e/disabled-controls.spec.ts tests/e2e/locale-beta.spec.ts tests/e2e/homepage.spec.ts
git commit -m "test(e2e): every palette-reading guard runs in both themes

Refs #142"
```

---

### Task 8: The Tab-order walks meet the switch

**Files:**
- Modify: `tests/e2e/chrome.spec.ts`, `tests/e2e/skip-link.spec.ts`

**Interfaces:**
- Consumes: the switch, `header [data-theme-toggle]` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Update the walks.**

In `chrome.spec.ts`, the test titled `'desktop: nav is keyboard-reachable in order (WCAG 2.1.1)'` gets the title `'desktop: the header is keyboard-reachable in order (WCAG 2.1.1)'`. Its statements from `await page.locator('header details.lang-switch > summary').focus();` to the end of its `for` loop become:

```ts
      const languages = page.locator('header details.lang-switch > summary');
      await languages.focus();
      // The theme switch sits immediately before the language switcher
      // (#142 §5). Reached by Shift+Tab, never focused directly, so a switch
      // taken out of the Tab order (tabindex="-1") is stepped over and this
      // fails where a direct focus() would still succeed.
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('header [data-theme-toggle]')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(languages).toBeFocused();

      for (const label of ['ShyTalk', 'Tools', 'Contact']) {
        await page.keyboard.press('Tab');
        await expect(
          page.locator('header nav a', { hasText: label }),
        ).toBeFocused();
      }
```

In *every header link can take focus, on every engine*, add `'header [data-theme-toggle]',` to the selector list, straight before `'header details.lang-switch > summary',`.

In `skip-link.spec.ts`, *it is the FIRST thing a Tab reaches*: in the comment, "the wordmark, the hamburger, the language switcher and three nav links" becomes "the wordmark, the hamburger, the theme switch, the language switcher and three nav links". Append to the test:

```ts
    // ...and on through the header in the bar's own order (#142): every
    // control it shows, derived from the DOM, with the theme switch
    // immediately before the language switcher.
    const controls = await page.locator('header .bar').evaluate((bar) =>
      [...bar.querySelectorAll('a[href], summary, button')]
        .filter((el) => el.checkVisibility())
        .map((el, i) => {
          el.setAttribute('data-walk', String(i));
          if (el.matches('[data-theme-toggle]')) return 'theme switch';
          if (el.matches('.lang-switch > summary')) return 'language switcher';
          return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
        }),
    );
    const languages = controls.indexOf('language switcher');
    expect(
      controls[languages - 1],
      `the theme switch sits right before the language switcher: ${controls.join(', ')}`,
    ).toBe('theme switch');
    for (const [i, control] of controls.entries()) {
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus'), control).toHaveAttribute(
        'data-walk',
        String(i),
      );
    }
```

- [ ] **Step 2: Run both specs and watch them pass.**
  - Run: `npx playwright test tests/e2e/chrome.spec.ts tests/e2e/skip-link.spec.ts`
  - Expected: all green. The walks skip on WebKit as before. Their reds are mutation S15 in Task 12, the switch taken out of the Tab order.

- [ ] **Step 3: Commit.**

```bash
npx prettier --write tests/e2e/chrome.spec.ts tests/e2e/skip-link.spec.ts
git add tests/e2e/chrome.spec.ts tests/e2e/skip-link.spec.ts
git commit -m "test(e2e): the Tab-order walks expect the switch before the language switcher

Refs #142"
```

---

### Task 9: The deployed sites prove the switch, and the phones pin the theme

**Files:**
- Modify: `tests/dev/dev-sanity.spec.ts`, `tests/prod/prod-sanity.spec.ts`
- Modify: `tests/e2e/fixtures.ts`, `tests/device/ios/session.ts`, `tests/device/ios/journeys.journey.ts`

**Interfaces:**
- Consumes: `expectTheme` (Task 4); `themeColour` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: The sanity suites.** In `tests/dev/dev-sanity.spec.ts` and in `tests/prod/prod-sanity.spec.ts`, add `import { expectTheme } from '../themes';` after the last import, and append:

```ts
// The switch is a rendering fact, so the deployed site's browser run proves
// it (#142 §6.2): it changes the page, and the choice survives a reload.
test('the theme switch changes the page, and the choice survives a reload', async ({
  page,
}) => {
  const toggle = page.locator('header [data-theme-toggle]');
  await page.goto('/');
  await expectTheme(page, 'dark');
  await toggle.click();
  await expectTheme(page, 'light');
  await page.reload();
  await expectTheme(page, 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});
```

- [ ] **Step 2: Run both against a local build.** Neither suite runs on a pull request (#335), so a stale fact in one fails the deploy after the merge instead.
  - Build as `deploy-dev.yml` builds: `PUBLIC_SHYTALK_URL` is set to dev ShyTalk, as the workflow sets it.
  - Serve with `npx astro preview --port 4399`, then run:
    - `WEB_BASE_URL=http://localhost:4399 npx playwright test -c playwright.dev.config.ts`
    - `WEB_BASE_URL=http://localhost:4399 npx playwright test -c playwright.prod.config.ts`
  - Expected: the new test passes in both. Dev-sanity's *robots.txt disallows all crawling* and *an unauthenticated request is challenged with 401* fail, as they always do on a local build: Cloudflare's `functions/_middleware.js` serves them, and `astro preview` never runs it. Any other red in either suite is a finding.
  - Stop the preview with `npx astro preview stop`.

- [ ] **Step 3: Android pins the theme per page.** In `tests/e2e/fixtures.ts`, the real device's `page` fixture:
  - its signature `page: async ({ context, baseURL }, use, testInfo) => {` becomes `page: async ({ context, baseURL, colorScheme }, use, testInfo) => {`;
  - straight after `const page = await context.newPage();`, add:

```ts
    // The theme is pinned per test (#142 §6.2). The phone's context was made
    // by Chrome, not by Playwright, so the `colorScheme` option never reaches
    // it by itself, and a run would follow the phone's own appearance setting.
    // Emulating it on each page applies the project's scheme, or a test's own
    // `test.use({ colorScheme })`, over CDP (Emulation.setEmulatedMedia).
    await page.emulateMedia({ colorScheme });
```

- [ ] **Step 4: iOS pins the theme per load.** In `tests/device/ios/session.ts`:
  - add `import { themeColour } from '../../palette';` after the file's last import;
  - in `navigateToPath`, replace `await driver.navigate(`${baseUrl}${path}`);` with:

```ts
      // The palette is pinned per load (#142 §6.2), so no journey's result
      // depends on the phone's own appearance setting. WebDriver cannot
      // emulate a media feature on Safari, so the lever is the one the page
      // itself honours: a saved choice, stamped on the origin BEFORE the
      // measured load, which the load then proves it rendered. Dark, the
      // palette every journey was written against.
      await driver.navigate(`${baseUrl}/`);
      await driver.executeScript("localStorage.setItem('theme', 'dark');");
      await driver.navigate(`${baseUrl}${path}`);
      const ground = await driver.executeScript<string>(
        'return getComputedStyle(document.documentElement).backgroundColor;',
      );
      if (ground !== themeColour('dark', '--bg'))
        throw new Error(
          `${path} rendered the ground ${ground}, not the dark theme's ` +
            `${themeColour('dark', '--bg')}: the stamped choice did not take`,
        );
```

  In `tests/device/ios/journeys.journey.ts`, Journey 10's last assertion, the one reading `Object.keys(stored).every((k) => k.startsWith('cg-'))`, becomes:

```ts
      // `theme` is the harness's own stamp (navigateToPath pins the palette,
      // #142), not a key this page writes.
      const written = Object.keys(stored).filter((key) => key !== 'theme');
      expect(
        written.every((k) => k.startsWith('cg-')),
        `every key this page writes starts "cg-" (${locale}): ${JSON.stringify(written)}`,
      ).toBe(true);
```

- [ ] **Step 5: Check what can be checked without the phones.**
  - Run `npm run typecheck`. Expected: 0/0/0, covering `fixtures.ts`, `session.ts` and the journeys.
  - Run `npx playwright test -c playwright.device.config.ts --list`. Expected: it lists the suite, including `theme.spec.ts`'s tests without the two isolated-context and no-JavaScript ones, and exits 0.
  - The gauntlet itself, `npm run test:devices`, needs the phones attached, so it is the operator's (§6.2 names it; #17's AC18 is the same kind of step). Record that in the PR body. Do not describe it as run.

- [ ] **Step 6: Commit.**

```bash
npx prettier --write tests/dev/dev-sanity.spec.ts tests/prod/prod-sanity.spec.ts tests/e2e/fixtures.ts tests/device/ios/session.ts tests/device/ios/journeys.journey.ts
git add tests/dev/dev-sanity.spec.ts tests/prod/prod-sanity.spec.ts tests/e2e/fixtures.ts tests/device/ios/session.ts tests/device/ios/journeys.journey.ts
git commit -m "test: the deployed sites prove the switch, and the phones pin the theme

Refs #142"
```

---

### Task 10: Every page in both themes, captured behind an assertion

**Files:**
- Create: `tests/e2e/theme-gallery.spec.ts`

**Interfaces:**
- Consumes: `THEMES` (Task 1); `expectTheme` (Task 4); `expectNoHorizontalScroll` (`tests/viewport.ts`); `withGroups` (`tests/e2e/helpers.ts`); `sitePaths` (`tests/site-pages.ts`).
- Produces: the captures §6.7's evidence page is built from (Task 14).

- [ ] **Step 1: Write the spec.** Create `tests/e2e/theme-gallery.spec.ts`:

```ts
import { test, expect } from './fixtures';
import { recorded, shoot } from './evidence';
import { withGroups } from './helpers';
import { THEMES } from '../palette';
import { sitePaths } from '../site-pages';
import { expectTheme } from '../themes';
import { expectNoHorizontalScroll } from '../viewport';
import { DEFAULT_LOCALE, LOCALES, localisePath } from '../../src/lib/i18n';

/**
 * Every built page in both themes (#142 §6.7), in every locale, at the
 * narrowest width the site supports and a laptop's. The assertion is the one
 * a theme can break on any page: it renders its theme, and nothing scrolls
 * sideways. The captures are what the operator reviews on the evidence page.
 */
const WIDTHS = [320, 1280];

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    for (const width of WIDTHS) {
      for (const locale of LOCALES) {
        test(
          `${locale} at ${width}px: every page renders the theme, with no sideways scroll`,
          { tag: '@emulated-viewport' },
          async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            const paths = sitePaths().map((path) => localisePath(path, locale));
            if (locale === DEFAULT_LOCALE) paths.push('/definitely-not-a-page');
            for (const path of paths) {
              await page.goto(path);
              await expectTheme(page, theme);
              await expectNoHorizontalScroll(page);
              await shoot(page, `${path}, ${theme}, ${width}px`);
            }
          },
        );
      }
    }

    test.describe('interactive states', () => {
      test.use(recorded);

      test(
        'the header: the phone menu, the language list and the focused switch',
        { tag: '@emulated-viewport' },
        async ({ page }) => {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto('/');
          await expectTheme(page, theme);
          const menu = page.locator('header details.menu > summary');
          await menu.click();
          await expect(page.locator('header nav a').first()).toBeVisible();
          await shoot(page, `${theme}: the phone menu, open`);
          await menu.click();

          const languages = page.locator('header details.lang-switch');
          await languages.locator('summary').click();
          await expect(languages.locator('a.entry').first()).toBeVisible();
          await shoot(
            page,
            `${theme}: the language list, open beside the compact label`,
            languages,
          );
          await languages.locator('summary').click();

          const toggle = page.locator('header [data-theme-toggle]');
          await page.keyboard.press('Shift');
          await toggle.focus();
          await expect(toggle).toBeFocused();
          await shoot(page, `${theme}: the theme switch, focused`, page.locator('header'));
        },
      );

      test(
        '/classroom-groups: results, the roster, the docked bar, print and the full-screen board',
        { tag: '@emulated-viewport' },
        async ({ page }) => {
          await page.setViewportSize({ width: 1280, height: 900 });
          // A refused requestFullscreen lands in the overlay on every engine,
          // so the board renders the same way wherever this runs.
          await page.addInitScript(() => {
            Element.prototype.requestFullscreen = () =>
              Promise.reject(new Error('refused'));
          });
          await withGroups(page);
          await expectTheme(page, theme);
          await expect(page.locator('#cg-results .group').first()).toBeVisible();
          await shoot(page, `${theme}: /classroom-groups with results`);

          await expect(page.locator('#cg-roster tbody tr').first()).toBeVisible();
          await shoot(page, `${theme}: the roster`, page.locator('#cg-roster'));

          await page.evaluate(() => scrollTo(0, 0));
          await expect(page.locator('p.actions')).toHaveCSS('position', 'sticky');
          await shoot(page, `${theme}: the action bar, docked`);

          await page.emulateMedia({ media: 'print' });
          await expect(page.locator('#cg-results .group').first()).toBeVisible();
          await shoot(page, `${theme}: the print preview`);
          await page.emulateMedia({ media: 'screen' });

          await page.getByRole('button', { name: 'Full screen' }).click();
          await expect(page.locator('#cg-board')).toBeVisible();
          await shoot(page, `${theme}: the full-screen board`);
        },
      );
    });
  });
}
```

- [ ] **Step 2: Run it on every engine.**
  - Run: `npx playwright test tests/e2e/theme-gallery.spec.ts`
  - Expected: green on `chromium`, `firefox`, `webkit`, `mobile-chrome` and `mobile-safari`. That is 24 tests per engine: 2 themes × (2 widths × 5 locales + 2 states).
  - A sideways scroll in light alone is a finding about the page. Fix it at its container, and re-run.
  - Then run `npm run test:unit`. Expected: all green, including `viewport-tagging`, `capture-after-assertion` and `evidence-recording`. Each resize sits in its tagged test's own body, and each `shoot` follows an `expect`.

- [ ] **Step 3: Commit.**

```bash
npx prettier --write tests/e2e/theme-gallery.spec.ts
git add tests/e2e/theme-gallery.spec.ts
git commit -m "test(e2e): every page in both themes, in every locale, captured behind an assertion

Refs #142"
```

---

### Task 11: The visual suite holds both themes

**Files:**
- Modify: `tests/e2e/visual.spec.ts`
- Modify: `tests/e2e/__screenshots__/`: the 12 dark baselines are re-captured, and 12 light ones are added.

**Interfaces:**
- Consumes: `THEMES` (Task 1); `expectTheme` (Task 4).
- Produces: 24 baselines. The dark set keeps its file names. The light set is `<name>-<label>-light-linux.png`.

- [ ] **Step 1: Run each view in both themes.** In `tests/e2e/visual.spec.ts`:
  - Add `import { THEMES } from '../palette';` and `import { expectTheme } from '../themes';`.
  - Wrap the whole `for (const { label, viewport } of WIDTHS) { … }` block in:

```ts
for (const theme of THEMES) {
  // Dark keeps today's file names, so its diff reads file by file against
  // the baselines it replaces; light is new, and says so (#142 §6.5).
  const suffix = theme === 'dark' ? '' : `-${theme}`;

  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    /* the existing `for (const { label, viewport } of WIDTHS)` block */
  });
}
```

  - Inside that block:
    - the three snapshot names `` `${name}-${label}.png` ``, `` `classroom-groups-roster-${label}.png` `` and `` `classroom-groups-docked-${label}.png` `` each gain `${suffix}` before `.png`;
    - each of the three tests calls `await expectTheme(page, theme);` straight after it navigates: after `page.goto`, or after `openRoster`.
  - That last addition asserts the theme before any picture is taken. A light baseline captured on a dark page would otherwise be a picture of the wrong palette, and every later run would pass against it.

- [ ] **Step 2: Capture, in the pinned container, with nothing else running.**
  - Stop any preview, container or background job first.
  - Run: `npm run test:visual:update`
  - Expected:
    - 24 passed;
    - `git status --short tests/e2e/__screenshots__` lists the 12 dark baselines as modified and 12 `-light-linux.png` files as new, and nothing else.

- [ ] **Step 3: Review the dark diff by eye.** For each of the 12 modified files:
  - Extract the old one with `git show HEAD:tests/e2e/__screenshots__/<file> > "$S/old-<file>"`, where `$S` is the scratchpad.
  - Read the old and the new.
  - Expected: the only change is in the header, where the switch sits before the language switcher and the header items it moves along with.
  - Any other change is a finding. Aurora's values did not change, so nothing else may move. Stop and trace it before going on.
  - Then read the 12 light files. Each must show Studio: a cool grey ground, white cards, the mark on its dark tile, and a moon in the switch.

- [ ] **Step 4: Prove the light set compares, then watch it fail and pass (§6.5).**
  - Commit the baselines first: `git add tests/e2e/visual.spec.ts tests/e2e/__screenshots__ && git commit -m "test(visual): 24 baselines, each view in both themes" -m "Refs #142"`.
  - Run `npm run test:visual`, unchanged. Expected: 24 passed, and `git status --short tests/e2e/__screenshots__` prints nothing. It compared, and wrote nothing.
  - In `tokens.css`'s bare `:root`, change `--accent: #006652;` to `--accent: #0a66c2;`. Then run `npm run test:visual -- -g "light theme"`. Expected: red. Every light view whose picture shows the accent fails, and each diff image marks the accent's regions: links, kickers and the filled buttons.
  - Restore with `git checkout HEAD -- src/styles/tokens.css`, check that `git diff --quiet HEAD -- src/styles/tokens.css` exits 0, and run `npm run test:visual` again. Expected: 24 passed, and nothing written.
  - Record the red run's count and the regions its diffs named, for the PR body.

- [ ] **Step 5: Nothing further to commit** unless Step 3 found something. The baselines and the spec were committed in Step 4.

  Then prove the theme assertion itself. In `visual.spec.ts`, change `test.use({ colorScheme: theme });` to `test.use({ colorScheme: theme === 'dark' ? 'light' : 'dark' });`, and run `npm run test:visual -- -g "light theme"`.
  - Expected: 12 red, each on *the page rendered the light theme*, before any picture is compared.
  - Restore with `git checkout HEAD -- tests/e2e/visual.spec.ts`, and confirm with `git diff --quiet HEAD -- tests/e2e/visual.spec.ts`.

---

### Task 12: Watch every guard fail

**Files:**
- Create (gitignored, never committed): `.superpowers/sdd/2026-09-24-light-mode-2-studio/mutate142b.mjs`, its log `mut142b.log`, and its reports.

- [ ] **Step 1: Write the harness, on a committed tree, with every prediction in it before any run.**
  - Each mutation's anchors must match exactly the number of times the mutation says, which is once unless it says otherwise, or the mutation is not run.
  - Every edited file is restored from `HEAD` and checked. A created file is deleted.
  - A run with no verdict is BROKEN, never RED. A run whose total differs from its baseline's is also BROKEN.
  - A baseline is taken once per runner and configuration, and whatever fails in it, such as dev-sanity's two Cloudflare Functions tests, is subtracted from every mutation's run.

```js
// mutate142b.mjs: node .superpowers/sdd/2026-09-24-light-mode-2-studio/mutate142b.mjs [ID ...]
// From the repo root, on a committed tree. One Playwright run at a time, at
// the default worker count: never raise it (standing rule).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DIR = '.superpowers/sdd/2026-09-24-light-mode-2-studio';
const UNIT = ['wcag', 'palette', 'tokens', 'contrast', 'shytalk-brand', 'colour-literals', 'locale-switcher']
  .map((name) => `tests/unit/${name}.test.ts`);

function unit() {
  const r = spawnSync('npx', ['vitest', 'run', ...UNIT], { encoding: 'utf8' });
  const out = `${r.stdout}\n${r.stderr}`;
  const totals = /Tests\s+(?:(\d+) failed \| )?(\d+) passed \((\d+)\)/.exec(out);
  if (!totals) return { broken: 'no totals line' };
  return {
    total: Number(totals[3]),
    failing: [...out.matchAll(/^\s+× (.+?)(?: \d+ms)?$/gm)].map((m) => m[1]),
  };
}

function typecheck() {
  const r = spawnSync('npx', ['astro', 'check'], { encoding: 'utf8' });
  const out = `${r.stdout}\n${r.stderr}`;
  const errors = /^- (\d+) errors?$/m.exec(out);
  if (!errors) return { broken: 'no error count' };
  return { total: 1, failing: Number(errors[1]) > 0 ? [`astro check: ${errors[1]} errors`] : [] };
}

/** One Playwright run; every unexpected result by project and title path, from its JSON report. */
function playwright(args, env = {}) {
  const report = `${DIR}/report.json`;
  rmSync(report, { force: true });
  const r = spawnSync('npx', ['playwright', 'test', ...args, '--reporter=json'], {
    encoding: 'utf8',
    env: { ...process.env, ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
  });
  if (!existsSync(report)) return { broken: `no report, exit ${r.status}: ${r.stderr.slice(-300)}` };
  const json = JSON.parse(readFileSync(report, 'utf8'));
  if ((json.errors ?? []).length > 0) return { broken: json.errors.map((e) => e.message).join('; ').slice(0, 300) };
  const failing = [];
  let total = 0;
  const walk = (suite, path) => {
    for (const spec of suite.specs ?? [])
      for (const t of spec.tests) {
        total += 1;
        if (t.status === 'unexpected') failing.push(`${t.projectName} › ${[...path, spec.title].join(' › ')}`);
      }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title]);
  };
  for (const suite of json.suites) walk(suite, []);
  return { total, failing };
}

const e2e = (files, projects) => () => playwright([...files, ...projects.map((p) => `--project=${p}`)]);

/** The deployed-site suites against a local dev build, as Task 9 runs them. */
function sanity() {
  const build = spawnSync('npm', ['run', 'build'], {
    encoding: 'utf8',
    env: { ...process.env, PUBLIC_SHYTALK_URL: 'https://dev.shytalk.shyden.co.uk' },
  });
  if (build.status !== 0) return { broken: 'build failed' };
  spawnSync('npx', ['astro', 'preview', '--port', '4399'], { encoding: 'utf8' });
  try {
    const env = { WEB_BASE_URL: 'http://localhost:4399' };
    const dev = playwright(['-c', 'playwright.dev.config.ts'], env);
    const prod = playwright(['-c', 'playwright.prod.config.ts'], env);
    if (dev.broken || prod.broken) return { broken: dev.broken ?? prod.broken };
    return { total: dev.total + prod.total, failing: [...dev.failing, ...prod.failing] };
  } finally {
    spawnSync('npx', ['astro', 'preview', 'stop']);
  }
}

const RUNNERS = {
  unit,
  typecheck,
  sanity,
  theme: e2e(['tests/e2e/theme.spec.ts'], ['chromium']),
  walks: e2e(['tests/e2e/chrome.spec.ts', 'tests/e2e/skip-link.spec.ts'], ['chromium']),
  script: e2e(['tests/e2e/theme-script.spec.ts'], ['content']),
  print: e2e(['tests/e2e/print-legibility.spec.ts'], ['chromium']),
  palette: e2e(['tests/e2e/palette-controls.spec.ts'], ['chromium']),
  home: e2e(['tests/e2e/homepage.spec.ts'], ['chromium']),
  gallery: e2e(['tests/e2e/theme-gallery.spec.ts'], ['chromium']),
};

// One entry per row of the table in Step 2:
// { id, runner, edits: [{ file, anchor, to, count? }], fails: [title substrings], count }
// or { id, runner, create: path, body, fails, count }. Each substring must
// match a newly failing title, and newly failing titles must number `count`.
const MUTATIONS = [/* the Step 2 table, row for row */];

const restore = (file) => {
  spawnSync('git', ['checkout', 'HEAD', '--', file]);
  if (spawnSync('git', ['diff', '--quiet', 'HEAD', '--', file]).status !== 0) throw new Error(`NOT RESTORED: ${file}`);
};

if (spawnSync('git', ['diff', '--quiet', 'HEAD', '--', 'src', 'tests', 'playwright.config.ts']).status !== 0)
  throw new Error('uncommitted changes: commit before mutating');

const baselines = {};
const baseline = (runner) => {
  if (!baselines[runner]) {
    const base = RUNNERS[runner]();
    if (base.broken) throw new Error(`${runner} baseline broken: ${base.broken}`);
    console.log(`BASELINE ${runner}: total=${base.total} failing=${JSON.stringify(base.failing)}`);
    baselines[runner] = base;
  }
  return baselines[runner];
};

for (const m of MUTATIONS.filter((x) => process.argv.length === 2 || process.argv.includes(x.id))) {
  const base = baseline(m.runner);
  let applied = true;
  if (m.create) writeFileSync(m.create, m.body);
  else
    for (const { file, anchor, to, count = 1 } of m.edits) {
      const before = readFileSync(file, 'utf8');
      const found = before.split(anchor).length - 1;
      if (found !== count) {
        console.log(`${m.id} ANCHOR IN ${file} MATCHED ${found} TIMES, WANTED ${count}: not run`);
        applied = false;
        break;
      }
      writeFileSync(file, before.split(anchor).join(to));
      console.log(`${m.id} applied in ${file}: ${JSON.stringify(to).slice(0, 120)}`);
    }
  const after = applied ? RUNNERS[m.runner]() : null;
  if (m.create) rmSync(m.create);
  else for (const { file } of m.edits) restore(file);
  if (!applied) continue;
  if (after.broken || after.total !== base.total) {
    console.log(`${m.id} BROKEN (${after.broken ?? `total ${after.total} vs ${base.total}`})`);
    continue;
  }
  const newly = after.failing.filter((t) => !base.failing.includes(t));
  const ok =
    newly.length === m.count &&
    m.fails.every((s) => newly.some((t) => t.includes(s))) &&
    newly.every((t) => m.fails.some((s) => t.includes(s)));
  console.log(`${m.id} ${newly.length === 0 ? 'GREEN (NOT CAUGHT)' : ok ? 'RED as predicted' : 'RED, NOT as predicted'}`);
  if (!ok) console.log(`   newlyFailing=${JSON.stringify(newly)}`);
}
```

- [ ] **Step 2: Run the mutations.** One per guard branch, at least. The rows map to §6.8 as shown. A GREEN is investigated through its three causes before anything else (CLAUDE.md, #250): a weak guard, a mutation that never reached what was run, or a mutation the medium makes impossible. A branch no row can observe is deleted, or given its own fixture.

**Unit** (runner `unit`):

| id | mutation | must turn red (count) | §6.8 |
| --- | --- | --- | --- |
| U1 | `tests/wcag.ts`: the `transparent` branch removed | *reads transparent as CSS defines it*; *writes a colour the way getComputedStyle reports it*; *dark: every declared pair clears* (the mark's tile is unreadable) (3) | — |
| U2 | `tests/palette.ts`: `darkBlocks` finds by selector: `cssRules(css).filter(({ declarations }) =>` becomes ``cssRules(css).filter(({ chain, declarations }) => chain.at(-1) === ":root[data-theme='dark']" &&`` | *finds every dark block by its color-scheme*; *keeps every dark block screen-only, and has both states it needs*; *declares the same tokens*; *declares color-scheme only beside a palette* (4) | — |
| U3 | `tests/palette.ts`: `if (theme === 'light') return root;` becomes `if (theme === 'light' \|\| theme === 'dark') return root;` | *reads light from bare :root, and dark as*; *refuses a dark theme that no block declares*; *dark: pins the disabled fill*; *puts the ShyTalk mark on its own tile* (4) | — |
| U4 | `tokens.css`: in the second dark block, `--danger: #ff6b5a;\n    --border: rgb(255 255 255 / 0.11);` becomes `--danger: #ff6b5b;` followed by the same border | *declares the same tokens, with the same values, in every dark block* (1) | one token changed in only one dark block |
| U5 | `tokens.css`: `    color-scheme: dark;\n` (count 2) becomes the same line followed by `    --orphan: 1px;\n` | *defines no token only inside a dark block* (1) | a token declared only inside a dark block |
| U6 | `tokens.css`: `@media screen and (prefers-color-scheme: dark) {` becomes `@media (prefers-color-scheme: dark) {` | *keeps every dark block screen-only* (1) | the dark blocks' `@media screen` wrapper removed (unit half; S20 is the print half) |
| U7 | `tokens.css`: `  --ink-soft: #4d5866;` becomes `  --ink-soft: #5f6a78;`, which is 4.85:1 flat on `--bg` and 5.13:1 under all four layers, but 4.11:1 over the two shade pools | *light: every declared pair clears*, whose message must name `[--pool-top-right, --pool-foot]` (1) | `--ink-soft` lightened so it fails over the shade pools alone |
| U8 | `tokens.css`: `  --wordmark-tile: #0f0d15;` becomes `  --wordmark-tile: #0f0d16;` | *puts the ShyTalk mark on its own tile* (1) | the light `--wordmark-tile` changed |
| U9 | `tokens.css`: `None on paper. */\n    --wordmark-tile: transparent;` becomes the same with `#0f0d15` | *is spelled out nowhere else in the repo* (tokens.css spells the tile twice) (1) | — |
| U10 | `tokens.css`: `html {\n  background: var(--bg);` becomes `html {\n  color-scheme: dark;\n  background: var(--bg);` | *declares color-scheme only beside a palette* (1) | — |
| U11 | create `src/scripts/zz-probe.js` holding `export const probe = 'white';\n` | *writes no colour literal outside tokens.css but the allowed ones* (1) | `color: #fff` written into a component, here in the `.js` kind this PR opened |
| U12 | `colour-literals.test.ts`: `/\.(ts\|js\|mjs)$/.test(file)` becomes `/\.ts$/.test(file)` | *reads a script as code, never as CSS* (1) | — |
| U13 | `LanguageSwitcher.astro`: `</details>\n` becomes `</details>\n<script>console.info('switcher');</script>\n` | *ships no JavaScript of its own* (1) | — |

**Types** (runner `typecheck`):

| id | mutation | must turn red | §6.8 |
| --- | --- | --- | --- |
| T1 | `theme.inline.js`: `const root = document.documentElement;` becomes `const root = document.documentElemnt;` | `astro check` reports an error: `checkJs` reads the shipped script (ruling 2) | — |

**Browser** (the runner named in each row, on `chromium` unless it says `content`):

| id | runner | mutation | must turn red (count) | §6.8 |
| --- | --- | --- | --- | --- |
| S1 | theme | `  apply();\n  root.dataset.themeSwitch = '';` becomes `  setTimeout(apply, 200);\n  root.dataset.themeSwitch = '';` | *the first frame that paints a ground paints the saved theme*, in both directions (2) | the stamp delayed by a `setTimeout` |
| S2 | theme | the `try { … } catch {}` around `localStorage.setItem('theme', theme);` removed, the call kept | *the switch still changes the page, nothing is saved, and nothing is logged* (1) | the `try`/`catch` around the save removed |
| S3 | theme | the same `try { … } catch {}` removed with its call | *across a reload and a second page*; *into a new session*; *a press after a stale saved value*; *a double press*; *an engine without MediaQueryList.addEventListener* (its reload) (5) | the save removed |
| S4 | theme | the `pageshow` listener removed | *the pageshow handler re-applies the saved choice* (1). The real Back skips on `chromium`, as Task 6 recorded | the `pageshow` handler removed |
| S5 | theme | `  os.addEventListener?.('change', press);\n` removed | *with no choice saved, the page and the switch follow it, live* (1) | the OS-change listener removed |
| S6 | theme | `os.addEventListener?.(` becomes `os.addEventListener(` | *an engine without MediaQueryList.addEventListener* (1) | — |
| S7 | theme | `      return theme === 'light' \|\| theme === 'dark' ? theme : null;` becomes `      return theme;` | *is ignored, and the device setting applies*; *a press after a stale saved value* (2) | — |
| S8 | sanity | `document.addEventListener('click', (event) => {` becomes `document.addEventListener('click-never', (event) => {` | *the theme switch changes the page, and the choice survives a reload*, on dev and on prod (2) | the click delegation removed, with the sanity suites run against a local build |
| S9 | theme | `  os.addEventListener?.('change', press);` becomes `  os.addEventListener?.('change', () => {\n    delete root.dataset.theme;\n    press();\n  });` | *with a choice saved, a change on the device changes nothing* (1) | — |
| S10 | theme | `  --switch-display: none;` becomes `  --switch-display: inline-flex;` | *the switch is absent, and the device setting applies*, in both themes; *does not print* (3) | `--switch-display` shown on bare `:root` |
| S11 | theme | the reveal rule moved out of `@media screen`: `  :root[data-theme-switch] {\n    --switch-display: inline-flex;\n  }\n}` becomes `}\n:root[data-theme-switch] {\n  --switch-display: inline-flex;\n}` | *does not print* (1) | the reveal rule taken out of `@media screen` |
| S12 | theme | `html {\n  background: var(--bg);` becomes `html {\n  transition: background-color 0.2s;\n  background: var(--bg);` | *switches instantly* (1) | `transition: background-color 0.2s` added to `html` |
| S13 | theme | `ThemeSwitch.astro`: the `aria-label={t.themeDarkMode}` line removed | the 5 *a toggle button named in its own language* tests (5) | the switch's accessible name removed |
| S14 | theme | `ThemeSwitch.astro`: `<button\n  type="button"` becomes `<span\n  role="button"\n  tabindex="0"`, and `</button>` becomes `</span>` | *Enter and Space each toggle it* (1) | — (ruling 8) |
| S15 | walks | `ThemeSwitch.astro`: `  data-theme-toggle\n` becomes `  data-theme-toggle\n  tabindex="-1"\n` | *desktop: the header is keyboard-reachable in order*; *it is the FIRST thing a Tab reaches*; *every header link can take focus, on every engine* (3) | the switch given `tabindex="-1"` |
| S16 | theme | `ThemeSwitch.astro`: `<circle fill="currentColor"` becomes `<circle fill="#eaf2ff"` | *under forced colours, its icon draws in the system text colour* (1) | — |
| S17 | script (content) | `BaseLayout.astro`: `<script is:inline set:html={themeScript}></script>` becomes `<script is:inline type="module" set:html={themeScript}></script>` | all 16 *runs it before the first paint* (16) | the theme script made a module |
| S18 | script (content) | `BaseLayout.astro`: the script removed from `<head>`, and `<Footer lang={lang} />` becomes `<Footer lang={lang} />\n    <script is:inline set:html={themeScript}></script>` | all 16 *runs it before the first paint* (16) | …or moved to the end of `<body>` |
| S19 | script (content) | `HomePage.astro`: `<section id="shytalk" class="wrap showcase">` becomes `<script is:inline>document.documentElement.dataset.extra = '';</script>\n  <section id="shytalk" class="wrap showcase">` | the 5 homepages' *carries it exactly once, and nothing it did not carry before* (5) | a second inline script on the homepage |
| S20 | print | `tokens.css`: `@media screen and (prefers-color-scheme: dark) {` becomes `@media (prefers-color-scheme: dark) {`, and `@media screen {\n  /* The second copy` becomes `@media all {\n  /* The second copy` | the 3 *every printed ink is readable on white paper, whatever the screen shows*; *a disabled control never depends on its fill reaching paper* (4) | the dark blocks' `@media screen` wrapper removed |
| S21 | palette | `tests/themes.ts`: `colorScheme: theme });` becomes `colorScheme: theme === 'dark' ? 'light' : 'dark' });` | the 4 per-path tests and *the controls the browser draws use the brand accent* (5) | a per-theme run set to the other scheme |
| S22 | home | = U8's change | *the ShyTalk showcase carries the brand wordmark and links out* (1) | the light `--wordmark-tile` changed (rendered half) |
| S23 | home | `tokens.css`: `None on paper. */\n    --wordmark-tile: transparent;\n` becomes `None on paper. */\n` | *the ShyTalk showcase carries the brand wordmark and links out* (1) | — (AC14's "prints in ink") |
| S24 | gallery | `theme-gallery.spec.ts`: `test.use({ colorScheme: theme });` becomes `test.use({ colorScheme: theme === 'dark' ? 'light' : 'dark' });` | all 24 gallery tests (24) | a per-theme run set to the other scheme, in the gallery |

  §6.8's one remaining row, a project's `colorScheme` removed or a config added without one, guards code this PR does not change. It was proven in #337 by mutations S1 to S4 there, and is not re-run.

  The visual suite's own controls are Task 11 Step 4: a Studio token recoloured, and the scheme swapped.

- [ ] **Step 3: Keep the log** (`mut142b.log`) for the PR body. Record, for each row, the predicted count, the actual count and the verdict. If a row reads *RED, NOT as predicted*, reproduce it by hand with full output before believing either the guard or the prediction (standing rule).

---

### Task 13: Prove it locally, then deliver

- [ ] **Step 1: The whole local verdict.**
  - `npm run test:unit`: every test passes. Compare the totals with the baseline plus this PR's new tests.
  - `npm run typecheck`: 0/0/0.
  - `npx prettier --check .`: clean, `HANDOVER.md` included (the pre-push hook reads the working tree).
  - `npx playwright test tests/e2e/theme.spec.ts tests/e2e/theme-script.spec.ts tests/e2e/theme-gallery.spec.ts tests/e2e/header-room.spec.ts`: green on every engine, apart from the recorded skips.
  - `npm run test:visual`: 24 passed, and nothing written.

- [ ] **Step 2: Grep what runs only after the merge.** Look in `tests/dev`, `tests/prod` and `tests/device` for every fact this PR changed:

  ```bash
  command grep -rn -E "234, 242, 255|4, 7, 13|--bg|--ink|colorScheme|color-scheme|data-theme|aria-pressed|theme\.inline|Dark mode|zero JS|ships no JavaScript" tests/dev tests/prod tests/device
  ```

  Expected hits, and only these:
  - Task 9's own additions;
  - `colorScheme: 'dark'` in the configs;
  - Journey 10's `theme` exclusion.

  Anything else is a stale fact in a suite no pull request runs (#335). Fix it before the push.

- [ ] **Step 3: Push and open the PR.**
  - Run `npx prettier --write HANDOVER.md`, then `git push -u origin 142-light-mode-beside-aurora`.
  - Open a PR into `develop` titled "Light mode: Studio beside Aurora, switchable from the header (#142)". The body carries:
    - `Refs #142`;
    - what changed, task by task;
    - the mutation table with its results (Task 12);
    - the visual control sequence's counts (Task 11);
    - the dark diff's review ("header only");
    - which engines ran the real Back test and which skipped it, with the reason;
    - the shipped script's size;
    - the translator's drafts;
    - every finding Task 7 or Task 10 fixed;
    - that `npm run test:devices` is the operator's, with the phones.
  - Check it with `node scripts/closing-keywords.mjs <file> "this pull request body"`.

- [ ] **Step 4: Wait for CI by name, on the head.**
  - Write `gh pr view <n> --json headRefOid --jq .headRefOid` to a file, and compare the run's SHA with it.
  - All twelve required checks must be green on that head: `checks`, `closing-keywords`, `e2e shard 1 of 8` to `e2e shard 8 of 8`, `build-and-test` and `visual`.
  - `back-translation` also runs, because `src/lib/i18n` changed. It is advisory: read its summary for `themeDarkMode`'s scores and record them. A red there means the review read nothing, which is a finding to report, not a gate.

- [ ] **Step 5: Self-review, then merge.**
  - Read the whole diff against `develop` once more, with the mutation log beside it.
  - Then run `gh pr merge <n> --merge --match-head-commit "$(cat <file holding the head>)"`.
  - Watch `deploy-dev.yml` for the merge commit. Read every job by name, and `dev-verified` off the merge commit. A skipped verify job still concludes `success` (#157).
  - The verify job runs dev-sanity against the deployed site, with the switch test Task 9 added. That run is the switch's first proof on a real deployment, and the robots.txt and 401 tests pass there as they cannot locally.

---

### Task 14: The evidence page, and close-out

§6.7 and AC18. The operator reviews the whole board at the end (2026-09-24), so this page does not gate the merge; it is how the review happens.

- [ ] **Step 1: Capture the evidence at the merge commit.**
  - `git switch develop && git pull --ff-only`, then confirm `git rev-parse HEAD` is the merge commit.
  - Run `EVIDENCE_DIR="$S/evidence142" npm run test:e2e -- tests/e2e/theme-gallery.spec.ts tests/e2e/theme.spec.ts tests/e2e/print-legibility.spec.ts tests/e2e/palette-controls.spec.ts --project=chromium`, where `$S` is the scratchpad. Expected: green, with the captures and `manifest.jsonl` in `$S/evidence142`, and `report.json` beside them.

- [ ] **Step 2: Write the content file,** `$S/content142.json`, in the evidence builder's schema: `title`, `eyebrow`, `headline`, `lede`, `sections` (`{ heading, body }` each), `mutations` (`{ id, what, predicted, actual }` each, from `mut142b.log`), `signoffKey` and `notCovered`.
  - Headline: "Light mode: Studio beside Aurora". `signoffKey`: `ticket-142`.
  - Sections: the palette, the switch, what the pages show in each theme, print, and what was measured.
  - `notCovered`: the real-device gauntlet, which is the operator's with the phones, and the real Back test on the two Chromium engines, which Playwright launches without the back-forward cache.

- [ ] **Step 3: Build and publish.** This is the two-pass flow the builder documents (#268). Load the `artifact-capabilities` skill before passing any capability.
  1. `node scripts/build-evidence-page.mjs --plan --evidence "$S/evidence142" --out "$S/evidence142.html"` writes the upload list, `$S/evidence142.html.uploads.json`.
  2. Publish a first version of the page as a new artifact, with the capabilities the builder's page needs: `assets` for the captures, `db` for the sign-off it writes.
  3. Upload the listed files to its asset store, 25 at a time, by short relative paths (memory: evidence uploads go by short relative paths). Then list the store with `scope: "assets"` and save the listing's text to `$S/assets142.txt`.
  4. `node scripts/upload-evidence-assets.mjs --plan "$S/evidence142.html.uploads.json" --listing "$S/assets142.txt" --out "$S/assets142.json"`. This pairs every capture with its asset by sha256, never by hand.
  5. `node scripts/build-evidence-page.mjs --evidence "$S/evidence142" --content "$S/content142.json" --assets "$S/assets142.json" --out "$S/evidence142.html"`, then republish that file to the same artifact.
  6. Read the published page back with `grep`, never with `Artifact action: "read"` (standing rule), and confirm that every capture resolves.

- [ ] **Step 4: Close the ticket.**
  - Post the evidence page's link and PR 2's results on #142, with `Refs`, after checking the comment with `node scripts/closing-keywords.mjs <file> "this comment"`.
  - Then close it deliberately with `gh issue close 142`.
  - Move #142's card to **Done** on the Shyden Site board. Resolve the board from its recorded node id, assert its title is "Shyden Site" before the write, and read the item's `project { title }` and status back afterwards. Never project 1.

- [ ] **Step 5: Hand over.** Rewrite `HANDOVER.md` with the branch, the SHAs from `git rev-parse` written to files, what is done, and the next ticket. Then send a `PushNotification`, and say that the session is safe to `/clear`.

---

## Review log

Each pass runs every mechanical check, then reads the whole plan (operator, 2026-09-24: _"review the plan on a /loop until there's no findings, then approve it"_). The loop ends on a pass that finds nothing.

_No pass has run yet._
