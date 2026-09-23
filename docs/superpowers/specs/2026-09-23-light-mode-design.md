# Light mode: Studio beside Aurora (#142)

**Status:** design approved in four parts on 2026-09-23. This written spec awaits the operator's review. No plan and no code exist yet, and none will until the spec is approved.

**Comparison and review page:** https://claude.ai/artifact/RXZDsNzcjVEosHnYMAnqBw (version 2: the three candidates as rendered, Studio refined, and the two wordmark options).

## 1. What this is

Aurora (#17) becomes the site's **dark** mode, unchanged. A second identity, **Studio**, becomes its **light** mode. One button in the header switches between them instantly, and the visitor's choice persists. Until a visitor chooses, the site follows the device's own setting.

Studio answers the question Aurora answers with glow: _what carries the atmosphere when there is no darkness to glow against?_ Its answer is **depth, not colour**. A cool grey ground, pure white cards that sit forward of it, window light at the top left and cool shade falling off to the right and below. The brand green is the only colour on the page.

## 2. Decisions on record

| date       | decision                                                                                                                                                                                                                                                                                                                                         | source       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 2026-09-11 | _"the current design should be considered 'dark mode' and we should be able to toggle between dark mode and light mode easily … instantly switchable by the click of a single button and be persisted."_ And: _"a background that's non-intrusive and compatible with each mode."_                                                                | #142 body    |
| 2026-09-11 | The zero-JS invariant is amended: **exactly one inline theme script**, with no bundle and no network request. It must be inline and blocking in `<head>`.                                                                                                                                                                                       | #142 body    |
| 2026-09-11 | The default follows `prefers-color-scheme`: an explicit choice wins, then the OS preference. The stated cost was accepted: a visitor on a light-mode device never sees Aurora unless they toggle.                                                                                                                                               | #142 body    |
| 2026-09-11 | _"its own identity, not an inversion."_ No mechanical inversion, and no reuse of Aurora's hues at lower alpha. The background is the **same mechanism in both themes**: one `body::before` layer whose token values change.                                                                                                                    | #142 comment |
| 2026-09-23 | **Studio** is chosen over Paper and Sea glass.                                                                                                                                                                                                                                                                                                 | interactive  |
| 2026-09-23 | Design part 1 approved (the palette and its three refinements). Part 2: the **ShyTalk mark on its own tile**. Part 3 approved (the switch, including the English label "Dark mode"). Part 4 approved (tests and cleanup).                                                                                                                         | interactive  |

## 3. The palette

### 3.1 Tokens

Every colour token is defined on bare `:root` with its **Studio** value. Aurora redefines the tokens, and only the tokens (§4). Values marked "unchanged" are today's Aurora values.

| token                | Studio (light, bare `:root`) | Aurora (dark)                 | role                                                        |
| -------------------- | ---------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `--bg`               | `#eef1f4`                    | `#04070d` unchanged           | page ground                                                 |
| `--surface`          | `#ffffff`                    | `#070d16` unchanged           | cards; on Studio a card is identified by fill as well as edge |
| `--ink`              | `#111821`                    | `#eaf2ff` unchanged           | text                                                        |
| `--ink-soft`         | `#4d5866`                    | `#8fa6c6` unchanged           | secondary text                                              |
| `--disabled-fill`    | `#dde2e8`                    | `#2a323f` unchanged           | an unavailable control (#250)                               |
| `--accent`           | `#006652`                    | `#38f5c8` unchanged           | links, kickers, filled buttons                              |
| `--accent-ink`       | `#004d3e`                    | `#7fffe0` unchanged           | accent text where it needs more weight                      |
| `--on-accent`        | `#ffffff`                    | `#04140f` unchanged           | ink on an accent fill                                       |
| `--danger`           | `#b42318`                    | `#ff6b5a` unchanged           | errors                                                      |
| `--border`           | `rgb(17 24 33 / 0.1)`        | `rgb(255 255 255 / 0.11)`     | decorative rules only                                       |
| `--border-strong`    | `rgb(17 24 33 / 0.55)`       | `rgb(255 255 255 / 0.4)`      | every control boundary (WCAG 1.4.11)                        |
| `--glass`            | `rgb(255 255 255 / 0.6)`     | `rgb(255 255 255 / 0.055)`    | translucent panels                                          |
| `--accent-glow`      | `transparent`                | `rgb(56 245 200 / 0.3)`       | the glow behind the language band (§3.3)                    |
| `--dock-shadow`      | `rgb(17 24 33 / 0.14)`       | `rgb(0 0 0 / 0.55)`           | the docked action row's shadow (#188)                       |
| `--lift-shadow`      | `rgb(17 24 33 / 0.18)`       | `rgb(0 0 0 / 0.55)`           | **new**: the phone mockup's shadow (§3.3)                    |
| `--pool-top-left`    | `rgb(255 255 255 / 0.7)`     | `rgb(56 245 200 / 0.08)`      | **renamed** from `--aurora-mint`                            |
| `--pool-top-right`   | `rgb(60 80 110 / 0.045)`     | `rgb(122 92 255 / 0.1)`       | **renamed** from `--aurora-violet`                          |
| `--pool-foot`        | `rgb(30 45 65 / 0.055)`      | `rgb(24 74 110 / 0.14)`       | **renamed** from `--aurora-deep`                            |
| `--shaft`            | `rgb(255 255 255 / 0.35)`    | `rgb(255 255 255 / 0.05)`     | **renamed** from `--aurora-shaft`                           |
| `--wordmark-tile`    | `#0f0d15`                    | `transparent`                 | **new**: the ShyTalk mark's tile (§3.4)                      |
| `--wordmark-pad`     | `0.12em 0.42em 0.18em`       | `0`                           | **new**: the tile's padding, zero in dark so Aurora does not move |
| `--switch-moon`      | `inline-block`               | `none`                        | **new**: the switch shows a moon in light…                  |
| `--switch-sun`       | `none`                       | `inline-block`                | **new**: …and a sun in dark (§5)                            |

`color-scheme` travels with the palette: `light` on bare `:root` and `dark` in the dark blocks. The `html { color-scheme: dark }` rule that sits outside the tokens today is removed. `accent-color: var(--accent)` stays as it is.

Retired, because no page uses them (0 `var()` references under `src/`): `--violet`, `--deep` and `--glass-2`. So are their `DECORATIVE` entries and the `--ink-soft` on `--glass-2` pair in `contrast.test.ts`. The `DECORATIVE` note calls `--violet` and `--deep` "gradient stops in the page atmosphere", but the atmosphere draws from its own `--aurora-*` values, so the note describes something that is not drawn.

### 3.2 Contrast, measured

The maths is `tests/wcag.ts`, applied to every pair declared in `contrast.test.ts`. Any pair drawn over the atmosphere is scored against **all 16 subsets** of its four layers, in **both** stacking orders, and the worst is kept (§6.1 explains why). Every row passes. The figures come from the scorer's output file and were not typed by hand:

| pair | level | Studio (light) | Aurora (dark) |
| --- | --- | --- | --- |
| `--ink on --bg` | 4.5 | 15.75 | 17.90 |
| `--ink on --surface` | 4.5 | 17.85 | 17.29 |
| `--ink on --glass+--bg` | 4.5 | 16.94 | 16.24 |
| `--ink-soft on --bg` | 4.5 | 6.38 | 8.10 |
| `--ink-soft on --surface` | 4.5 | 7.23 | 7.83 |
| `--ink-soft on --glass+--bg` | 4.5 | 6.87 | 7.35 |
| `--ink-soft on --glass-2+--bg` | 4.5 | 7.05 | 6.77 |
| `--accent on --bg` | 4.5 | 6.13 | 14.46 |
| `--accent on --surface` | 4.5 | 6.95 | 13.97 |
| `--accent on --glass+--bg` | 4.5 | 6.60 | 13.12 |
| `--accent-ink on --bg` | 4.5 | 8.69 | 16.60 |
| `--accent-ink on --surface` | 4.5 | 9.85 | 16.03 |
| `--on-accent on --accent` | 4.5 | 6.95 | 13.54 |
| `--on-accent on --accent-ink` | 4.5 | 9.85 | 15.54 |
| `--danger on --bg` | 4.5 | 5.80 | 7.20 |
| `--danger on --surface` | 4.5 | 6.57 | 6.96 |
| `--ink on atmosphere+--bg` | 4.5 | 13.33 | 11.16 |
| `--ink-soft on atmosphere+--bg` | 4.5 | 5.40 | 5.05 |
| `--accent on atmosphere+--bg` | 4.5 | 5.19 | 9.02 |
| `--border-strong+--bg on atmosphere+--bg` | 3 | 3.63 | 3.38 |
| `--border-strong+--bg on --bg` | 3 | 3.83 | 3.72 |
| `--border-strong+--surface on --surface` | 3 | 3.97 | 3.79 |
| `--ink-soft on --disabled-fill` | 4.5 | 5.55 | 5.19 |

The `--glass-2` row leaves with that token. Studio's tightest body-text pair is the accent over the shade pools, at 5.19:1.

### 3.3 Refinements approved in part 1

- **The language band has no glow in light mode.** `Marquee.astro` paints `box-shadow: 0 0 50px var(--accent-glow)` inside a container with `overflow: clip`. On a light ground the clipped glow painted a flat grey box. A glow reads as light only against darkness, so in Studio `--accent-glow` is `transparent`.
- **The phone mockup's shadow becomes a token.** `PhoneFrame.astro:77` hard-codes `rgb(0 0 0 / 0.55)`. It becomes `var(--lift-shadow)`, with that same value in Aurora (so dark is pixel-identical) and a softer one in Studio.
- **The atmosphere tokens are renamed by position.** The same layer carries window light in one theme and mint in the other, so a name that describes Aurora's hue is wrong for half the site.

### 3.4 The ShyTalk mark (part 2)

The mark keeps ShyTalk's own two tones (`SHYTALK_MARK.shy` `#e8e0f0`, `.talk` `#d0bcff`). Those were made for a dark ground and measure 1.28:1 and 1.70:1 on white. In light mode the mark sits on **ShyTalk's own tile colour**, `SHYTALK_MARK.tile` `#0f0d15`, like a logo badge: `background: var(--wordmark-tile)` and `padding: var(--wordmark-pad)`, with a fixed radius. In dark mode the tile is transparent and the padding is zero, so Aurora does not move. In print the existing rule still renders the mark in ink, and the print block sets the tile transparent and the padding to zero. A unit guard asserts that the light `--wordmark-tile` equals `SHYTALK_MARK.tile`, because the colour now lives in two files.

## 4. How the three states resolve

```css
:root {
  /* Studio: every token, plus color-scheme: light */
}

@media screen and (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    /* Aurora tokens, color-scheme: dark */
  }
}

@media screen {
  :root[data-theme='dark'] {
    /* the same Aurora tokens, color-scheme: dark */
  }
}

@media print {
  :root {
    /* paper, unchanged from today */
  }
}
```

- **An explicit choice wins in both directions.** `[data-theme="light"]` defeats a dark OS through the `:not()` guard. `[data-theme="dark"]` applies whatever the OS says.
- **No choice follows the OS, live.** The media query re-evaluates when the device's setting changes, with no script involved.
- **Both dark blocks are screen-only.** This is load-bearing for print. The dark blocks' selectors carry specificity (0,2,0), and the print block's `:root` carries (0,1,0). If the dark blocks applied in print, a visitor in dark mode would print Aurora's near-white ink onto white paper, the blank-sheet defect found on 2026-09-11. Screen-only, they never reach the print cascade, and paper keeps being measured against white alone.
- **The Aurora palette is written twice**: once per dark block, because the unstamped state needs the media query and the stamped state must not. A unit guard parses both blocks, with comments stripped, and asserts they declare the same tokens with the same values. A third copy cannot drift silently either, since the guard derives the dark blocks from the file rather than listing them.
- **No colour has its only definition inside a theme block.** A unit guard asserts that every token a dark block declares is also declared on bare `:root`.

## 5. The switch (part 3)

**Placement.** A 44 × 44px button in the header, immediately before the language switcher, at every width. It is never inside the phone menu, so it is always one tap. Measured on today's header at 320px, the wordmark (74px), the menu (44px) and the language switcher (110px) leave 60px, so a 44px button fits with 16px to spare. The existing no-horizontal-scroll tests at 320px pin it.

**What it is.** A `<button type="button">` exposed as a **toggle button**. Its accessible name is **"Dark mode"**, from the catalogue key `themeDarkMode` in all five locales, and `aria-pressed="true"` means dark is on. The name stays fixed; only the pressed state changes, which is the WAI-ARIA toggle-button pattern. The icons are decorative (`aria-hidden`): a moon while light is showing, a sun while dark is showing, each shown by `display: var(--switch-moon)` / `var(--switch-sun)`, so the icon cannot disagree with the palette. The switch has a visible focus ring, and switching is instant, with no transition. In print the switch is hidden, like the skip link: it is a screen affordance, not part of the record.

**The one script.** It lives in one source file, `src/scripts/theme.inline.js`. It is plain JavaScript because it ships exactly as written; it is type-checked through `// @ts-check` and kept to a few hundred bytes, because every page carries it. Its explanation lives in a template comment beside the place where `BaseLayout.astro` emits it, which the build strips, rather than in the shipped file. `BaseLayout.astro` emits it with `<script is:inline set:html={themeScript}>` straight after the viewport `<meta>`, which puts it before every stylesheet. It is parsed and run before the first paint and makes no request. It does four things:

1. Reads `localStorage.getItem('theme')` inside `try`/`catch`, the same guard `/classroom-groups` uses for `'cg-sound'`, because some privacy modes throw `SecurityError` on touching storage. If the value is exactly `light` or `dark`, it stamps `data-theme` on `<html>`.
2. Stamps `data-theme-switch` on `<html>`. The button's CSS shows it only under that attribute, so **with JavaScript off the button never appears** and the device setting applies.
3. Handles clicks by **delegation** on `document`, because the button does not exist yet when a head script runs. A click computes the current theme (the stamp, or `matchMedia('(prefers-color-scheme: dark)')` when unstamped), stamps the opposite and saves it. If saving throws, the page still switches; the choice just is not remembered.
4. Keeps `aria-pressed` true to the theme on `DOMContentLoaded`, after a click, and when the OS setting changes while no choice is saved.

**Not included, deliberately:** a third "follow the device" option in the interface (the operator asked for a single button), syncing open tabs (a tab picks the choice up on its next page load), and a cookie (the site is static and has no server to read one).

## 6. How it is proven (part 4)

### 6.1 Contrast, in both themes

`contrast.test.ts` reads **both** palettes: light from bare `:root` and dark from the dark block. It runs every pair against each. Two defects in the current model are fixed on the way:

- **Stacking order.** CSS paints the **first** background layer on top, so `body::before` puts the shaft at the **bottom**, while the test's `ATMOSPHERE` stacks it on top. In dark mode the test's order was only stricter (`--ink-soft` 5.05:1, against 5.22:1 in paint order). The stack is now **derived from the `body::before` rule itself**, the `var()` names in declaration order, so it cannot disagree with what the browser paints.
- **The worst case.** "Every stop composited at once" is the worst case only when every layer moves the ground towards the ink. That holds in Aurora, where every layer lightens a near-black ground under light ink, and **fails in Studio**, where the shaft brightens the ground under dark ink while the pools darken it. The worst case is now taken over **every subset** of the four layers. Measured while designing: Studio's first draft passed "all at once" and failed at 3.92:1 against its two shade pools alone.

The stale claim in `tokens.css`, that `--ink-soft` over the atmosphere scores 5.11:1, is corrected to the measured figures.

### 6.2 Every Playwright project declares its scheme

No Playwright config sets `colorScheme` today, so every project runs under Playwright's **default, which is light**. The day Studio lands, every existing e2e test, dev-sanity and prod-sanity would silently start testing a different palette. So:

- every project in every config (`playwright.config.ts`, `playwright.dev.config.ts`, `playwright.prod.config.ts`) and the device harness declares `colorScheme` explicitly. The general suite declares **dark**, so every existing test keeps testing exactly what it tests today, and a unit guard fails any project that leaves it to the default;
- the palette-reading guards run **once per theme**: `palette-controls.spec.ts`, `print-legibility.spec.ts`, `thai-typography.spec.ts`, and every assertion in `classroom-groups.spec.ts` that reads a computed colour. Print runs under both, and additionally with a stamped `dark` choice, proving paper ignores the screen theme;
- **dev-sanity** proves on the deployed dev site that the switch toggles, and that the choice survives a reload;
- the **device gauntlet** pins the theme per run: Android Chrome over CDP through `Emulation.setEmulatedMedia`, and iOS Safari by stamping a saved choice before the measured load. Its results therefore never depend on the phone's own setting.

### 6.3 The switch, rendered

A new `theme.spec.ts` covers:

- **no flash, both directions.** A saved `light` choice on a device preferring dark, and a saved `dark` choice on a device preferring light. An init script records `getComputedStyle(documentElement).backgroundColor` in the first animation frame, which runs before the first paint, and it must equal the saved theme's `--bg`. A static guard backs it on every built page: the theme script is inline, inside `<head>`, before every stylesheet, and carries no `async`, `defer` or `type="module"`. The static guard covers a moved or deferred script, which a fast page could otherwise hide from a timing test;
- **persistence** across a reload, a second page, and a new browser context carrying the same storage;
- **storage refused**: `localStorage` throws, the button still switches the page, no error reaches the console, and nothing is saved;
- **the OS changes** while no choice is saved: emulated `colorScheme` flips, the page follows, and `aria-pressed` follows it;
- **without JavaScript** the button is absent and the device setting applies;
- **accessibility**: the name is "Dark mode" in each locale, `aria-pressed` is correct in each state, the target is 44 × 44, and the focus ring is visible.

### 6.4 The script inventory, pinned

The two guards that hold "the homepage ships no JavaScript" (`locale-switcher.test.ts:112` and `classroom-groups.spec.ts:2087`) are rewritten to pin **what may exist** rather than count to zero.

What exists today was measured in a browser on the current build:

- the homepage in both locales, and the 404, carry no script;
- `/glory-points` carries one module;
- `/classroom-groups` carries one module and one small inline script of its own (505 bytes, in the body).

After this change, **every page carries the theme script exactly once**: inline, in `<head>`, and identical in content to `src/scripts/theme.inline.js`. The homepage in both locales and the 404 carry **nothing else**, and the tool pages' own scripts are unchanged.

The inventory is read from a real DOM (`document.scripts`), never by matching `<script` in the HTML text. On today's build a text match counts a comment on `/classroom-groups` that only mentions the tag.

### 6.5 Visual baselines, both themes

The visual suite captures every page in both themes, so **12 baselines become 24**. The light set is new. The existing 12 are re-captured once, because the switch now sits in every header, and their diff against today's is reviewed to show changes in the header alone: the switch, and the header items it moves along. Both sets are captured and compared in the pinned `linux/amd64` Playwright image, as today.

### 6.6 Every guard watched failing

Every new or rewritten guard is mutation-verified in both directions before it lands, following the repo rule. The minimum set:

| mutation                                                            | must turn red                         |
| ------------------------------------------------------------------- | ------------------------------------- |
| a second inline script on the homepage                              | the one-script guard                  |
| the theme script given `defer`, or moved to the end of `<body>`     | the static no-flash guard             |
| the stamp delayed by a `setTimeout`                                 | the first-frame no-flash test         |
| one token changed in only one of the two dark blocks                | the dark-blocks-identical guard       |
| a token declared only inside a dark block                           | the bare-`:root` completeness guard   |
| the dark blocks' `@media screen` wrapper removed                    | print legibility (stamped dark)       |
| `--ink-soft` lightened to fail over a single shade pool             | the subset worst-case contrast test   |
| a project's `colorScheme` removed                                   | the scheme-declared guard             |
| the save made to throw                                              | storage-refused (page still switches) |
| the light `--wordmark-tile` changed                                 | the wordmark-tile guard               |

## 7. Cleanup in the same ticket (part 4)

- `ClassroomGroupsPage.astro` still quotes the pre-Aurora palette. The comment near line 1094 (`--ink` `#16171c`, `--bg` `#f7f6f2`) is corrected, and the dead fallbacks `var(--bg, #f7f6f2)` and `var(--border, #e7e4dc)` near line 2871 lose their fallbacks. The same goes for `LanguageSwitcher.astro`'s `var(--surface, …)` fallbacks, since every token is always defined.
- `--violet`, `--deep` and `--glass-2` are removed (§3.1).
- The 5.11:1 comment in `tokens.css` is corrected (§6.1).
- The atmosphere tokens are renamed (§3.3), and every reference follows, including `contrast.test.ts`.
- `CLAUDE.md`'s working agreement says the homepage ships zero JavaScript. It is amended to say the homepage ships exactly one inline script, the theme script, and to name the guard that pins it.
- #141's paint-cost figure stands. The atmosphere keeps its four gradients and their geometry; only the colour values change.

## 8. Translation

One new catalogue key, `themeDarkMode`, reads "Dark mode" in English. It is typed through `Catalogue`, so a missing locale fails `astro check`. The id, zh, vi and th values are machine-drafted like the rest of those catalogues. The label is two words, so it passes through the short-label guards (`label-check.test.ts`, `verified-labels.test.ts`) and the back-translation gate like every other label, and `locale-fallbacks.test.ts` refuses English left in zh, vi or th.

## 9. Risks

| risk                                                                       | answer                                                                                                                                                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a component selector written against `:root[data-theme]` is scoped by Astro | theme logic lives only in `tokens.css`; components read tokens and never test the theme, so no scoped rule can mis-stamp it                                                                          |
| a whole suite silently changes palette                                     | §6.2: every project declares its scheme, and a guard enforces it                                                                                                                                    |
| the two Aurora blocks drift apart                                          | §4: a guard derives both blocks and asserts they are equal                                                                                                                                          |
| print follows a dark screen                                                | §4: the dark blocks are screen-only, proven with a stamped dark choice                                                                                                                              |
| a real phone's own setting changes the gauntlet's results                  | §6.2: the device harness pins the scheme per run                                                                                                                                                    |
| a visitor's storage is refused                                             | §5: the page still switches; the choice just is not remembered                                                                                                                                      |

## 10. Acceptance criteria

These replace the criteria in the #142 issue body once this spec is approved.

1. The Studio palette (§3.1) is complete on bare `:root`. Aurora redefines only tokens, in two screen-only blocks a unit guard proves identical. No token is defined only inside a theme block.
2. Three states: a `[data-theme]` stamp wins in both directions, and with no stamp the page follows `prefers-color-scheme` live.
3. One 44 × 44px button in the header, before the language switcher, at every width, with no horizontal scroll at 320px. It is a toggle button named "Dark mode" (translated), pressed when dark, showing a moon in light and a sun in dark. It switches instantly, and the choice persists across pages, reloads and sessions.
4. No flash in either direction, proven by the first-frame test and by the static head-position guard, both mutation-verified.
5. Every page carries the theme script exactly once, inline in `<head>` and identical to `src/scripts/theme.inline.js`. The homepage (both locales) and the 404 carry no other script. The inventory is read from a real DOM. The two former zero-JS guards are rewritten to pin this and are mutation-verified.
6. Without JavaScript the switch is absent and the device setting applies. With storage refused, the switch works for the page and nothing is saved.
7. One `body::before` layer in both themes, painting Studio's values in light mode. The language band has no glow in light mode, and the phone mockup's shadow comes from `--lift-shadow`.
8. Contrast: every pair passes in both themes, taking the worst over every subset of the atmosphere layers, in the paint order derived from `body::before`.
9. Print is measured against white alone and is identical whichever theme the screen shows, including a stamped dark choice.
10. The palette-reading guards (§6.2) run once per theme.
11. The visual suite holds 24 baselines, 12 per theme, and the re-captured dark set differs from today's only in the header.
12. Every Playwright project declares `colorScheme`, enforced by a guard. Dev-sanity proves the switch on the deployed dev site. The device gauntlet pins the scheme per run.
13. The ShyTalk mark sits on `SHYTALK_MARK.tile` in light mode (guarded), is unchanged in dark mode, and prints in ink.
14. The §7 cleanup is done, and the atmosphere tokens carry their positional names everywhere.
15. `themeDarkMode` exists in all five catalogues and passes every locale guard.
16. Every new or rewritten guard in §6.6 has been watched failing and then passing.

## 11. Delivery

The work lands as two pull requests under #142, in this order:

1. **Groundwork that changes no pixel.** It renames the atmosphere tokens, retires the unused ones, corrects the stale comments and fallbacks, introduces `--lift-shadow`, moves the contrast suite to the derived paint order and the subset worst case, and declares `colorScheme` in every project. The unchanged visual suite proves nothing moved.
2. **Light mode.** Studio, the two dark blocks, the script, the switch, the translation, `theme.spec.ts`, the palette guards per theme, the light baselines and the `CLAUDE.md` amendment.

Splitting it keeps the second pull request's diff to the feature itself. It also means a rename that missed a reference fails loudly while no colour has changed yet to hide it.
