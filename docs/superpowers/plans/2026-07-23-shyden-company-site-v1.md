# Shyden Company Site v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shyden.co.uk company homepage plus a re-coded, client-side Glory Points Calculator as a static Astro site, mobile-first and TDD, ready for Cloudflare Pages.

**Architecture:** A single Astro static site. All chrome (head/SEO, header, footer) lives in one `BaseLayout`; pages compose small single-responsibility components. The calculator's arithmetic is a pure, DOM-free TypeScript module (unit-tested with Vitest); a thin page script wires the DOM to it. Everything else ships as zero-JS HTML/CSS. Cross-browser behaviour is gated by Playwright.

**Tech Stack:** Astro 5 (static), TypeScript, Vitest (unit), Playwright (E2E, chromium/firefox/webkit + mobile), `@fontsource` self-hosted fonts, `@astrojs/sitemap`, GitHub Actions CI, Cloudflare Pages hosting.

Spec: `docs/superpowers/specs/2026-07-23-shyden-homepage-design.md`.

## Global Constraints

Every task's requirements implicitly include these (verbatim from the spec):

- **Mobile-first**: base CSS targets small screens; enhance up with `min-width`. No horizontal scroll at any width **from 320px up**; content never clips.
- **Touch targets ≥ 44×44px**; **WCAG AA** contrast; semantic HTML; keyboard-navigable; visible focus; `prefers-reduced-motion` respected.
- **Homepage ships zero JS**; only `/glory-points` includes a script; the calculator degrades to a clear message if JS is off.
- **Self-hosted fonts only — no external CDN** (use `@fontsource`).
- **Cross-browser**: correct on chromium, firefox, webkit (desktop) + mobile chromium + mobile webkit.
- **Signature accent `#0A7D66`** — do NOT lighten past AA (white-on-accent ≥ 4.5:1). Palette tokens are fixed in §4 of the spec.
- **Calculator input policy**: plain digits only (`/^\d+$/`); reject decimals / scientific notation / separators / signs; reject `0`; cap at **1,000,000,000** (naive `number` arithmetic is provably exact across the accepted range — verified). Error strings are exact (see Task 2).
- **Contact** = `mailto:support@shyden.co.uk`; no backend, no form.
- **Hosting** = Cloudflare Pages, static only, $0.
- **Node 24** (pin to CI). **TDD** (RED→GREEN), **frequent commits**, DRY, YAGNI.

---

### Task 1: Project scaffold, tooling & CI

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `.nvmrc`, `.prettierrc.json`
- Create: `vitest.config.ts`, `playwright.config.ts`
- Create: `src/styles/tokens.css`, `src/layouts/BaseLayout.astro`, `src/pages/index.astro`
- Create: `.github/workflows/ci.yml`
- Test: `tests/unit/smoke.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a buildable Astro project; `BaseLayout` (props filled in Task 3); `tokens.css` with the fixed palette; npm scripts `dev`/`build`/`preview`/`test:unit`/`test:e2e`/`test`/`format`.

- [ ] **Step 1: Scaffold the Astro project non-interactively**

Run:
```bash
npm create astro@latest . -- --template minimal --no-install --no-git --typescript strict --yes
npm pkg set scripts.dev="astro dev" scripts.build="astro build" scripts.preview="astro preview"
npm pkg set scripts.test:unit="vitest run" scripts.test:e2e="playwright test" scripts.test="npm run test:unit && npm run test:e2e" scripts.format="prettier --check ."
npm install -D vitest @playwright/test prettier prettier-plugin-astro @astrojs/sitemap @fontsource/space-grotesk @fontsource/inter
npx playwright install    # local/macOS: NO --with-deps (that flag is Ubuntu/Debian only); CI on ubuntu keeps --with-deps
echo "24" > .nvmrc
printf '{\n  "singleQuote": true,\n  "semi": true,\n  "plugins": ["prettier-plugin-astro"]\n}\n' > .prettierrc.json
printf 'dist/\n.astro/\n.superpowers/\nnode_modules/\npackage-lock.json\npublic/\n' > .prettierignore
```
Expected: `package.json`, `astro.config.mjs`, `tsconfig.json` exist; dependencies installed.

- [ ] **Step 2: Write `src/styles/tokens.css` with the AA-verified palette + type scale**

```css
/* src/styles/tokens.css — design tokens (see spec §4). Palette AA-verified. */
@import '@fontsource/space-grotesk/400.css';
@import '@fontsource/space-grotesk/600.css';
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/600.css';

:root {
  --bg: #f7f6f2;
  --surface: #ffffff;
  --ink: #16171c;
  --ink-soft: #565a66;
  --border: #e7e4dc;
  --accent: #0a7d66;      /* do NOT lighten past AA */
  --accent-ink: #096452;
  --danger: #c0392b;

  --font-head: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --measure: 66ch;
  --radius: 10px;
  --space: clamp(1rem, 0.6rem + 2vw, 2rem);
  --maxw: 1080px;
}

*, *::before, *::after { box-sizing: border-box; }
html { color-scheme: light; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-body);
  line-height: 1.6;
  -webkit-text-size-adjust: 100%;
}
h1, h2, h3 { font-family: var(--font-head); line-height: 1.15; }
a { color: var(--accent); }
a:hover { color: var(--accent-ink); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
img { max-width: 100%; height: auto; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 3: Write a minimal `BaseLayout` and homepage so the project builds**

`src/layouts/BaseLayout.astro`:
```astro
---
import '../styles/tokens.css';
interface Props { title: string }
const { title } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
  </head>
  <body>
    <main><slot /></main>
  </body>
</html>
```

`src/pages/index.astro`:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Shyden Ltd — Bespoke, AI-powered software">
  <h1>Shyden</h1>
</BaseLayout>
```

- [ ] **Step 4: Write config files**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'] } });
```

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:4321' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
});
```

- [ ] **Step 5: Write smoke tests (RED first)**

`tests/unit/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => {
  it('runs the unit test harness', () => {
    expect(1 + 1).toBe(2);
  });
});
```

`tests/e2e/smoke.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
test('homepage responds with the Shyden title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Shyden/);
});
```

- [ ] **Step 6: Verify build + tests pass**

Run:
```bash
npm run build && npm run test:unit && npm run test:e2e
```
Expected: build writes `dist/`; unit smoke PASS; e2e smoke PASS across all 5 projects.

- [ ] **Step 7: Write CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run format
      - run: npm run build
      - run: npm run test:unit
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json .nvmrc .prettierrc.json vitest.config.ts playwright.config.ts src/styles/tokens.css src/layouts/BaseLayout.astro src/pages/index.astro tests/unit/smoke.test.ts tests/e2e/smoke.spec.ts .github/workflows/ci.yml
git commit -m "chore: scaffold Astro site, tooling, tokens and CI"
```

---

### Task 2: Glory Points pure logic (`lib/gloryPoints.ts`)

**Files:**
- Create: `src/lib/gloryPoints.ts`
- Test: `tests/unit/gloryPoints.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (relied on by Task 6):
  - `export const ERRORS: { empty; notWhole; zero; tooLarge }` — exact message strings.
  - `export interface GloryResult { gloryPoints; coinsNeeded; beansNeeded; totalGiftValue }` (all `number`).
  - `export type GloryOutcome = { ok: true; result: GloryResult } | { ok: false; error: string }`.
  - `export function calculateGlory(rawInput: string): GloryOutcome`.
  - `export function formatNumber(n: number): string` — thousands-separated (`1,234`).

- [ ] **Step 1: Write the failing tests (all branches + formula)**

`tests/unit/gloryPoints.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { calculateGlory, formatNumber, ERRORS } from '../../src/lib/gloryPoints';

describe('calculateGlory — formula (verified against the ported Flask source)', () => {
  it.each([
    [1, 1, 2, 5],
    [9, 9, 10, 25],       // 9/0.9 = 10 exactly: no rounding — catches always-round-up bugs
    [10, 10, 12, 30],
    [100, 100, 112, 280],
    [1000, 1000, 1112, 2780],
  ])('points=%i -> coins=%i beans=%i gift=%i', (p, coins, beans, gift) => {
    const out = calculateGlory(String(p));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result).toEqual({ gloryPoints: p, coinsNeeded: coins, beansNeeded: beans, totalGiftValue: gift });
    }
  });
});

describe('calculateGlory — validation', () => {
  it.each(['', '   '])('empty/whitespace %j -> empty error', (v) => {
    expect(calculateGlory(v)).toEqual({ ok: false, error: ERRORS.empty });
  });
  it.each(['abc', '3.5', '1e3', '1,000', '+5', '-5', '5 5', '0x10'])(
    'non-digits %j -> notWhole error', (v) => {
      expect(calculateGlory(v)).toEqual({ ok: false, error: ERRORS.notWhole });
    });
  it.each(['0', '00', '000'])('zero %j -> zero error', (v) => {
    expect(calculateGlory(v)).toEqual({ ok: false, error: ERRORS.zero });
  });
  it('trims surrounding whitespace around a valid value', () => {
    const out = calculateGlory('  10  ');
    expect(out.ok).toBe(true);
  });
});

describe('calculateGlory — upper bound (cap 1,000,000,000)', () => {
  it('accepts the cap and computes it exactly', () => {
    expect(calculateGlory('1000000000')).toEqual({
      ok: true,
      result: { gloryPoints: 1000000000, coinsNeeded: 1000000000, beansNeeded: 1111111112, totalGiftValue: 2777777780 },
    });
  });
  it('rejects one above the cap', () => {
    expect(calculateGlory('1000000001')).toEqual({ ok: false, error: ERRORS.tooLarge });
  });
});

describe('formatNumber', () => {
  it.each([[5, '5'], [280, '280'], [2780, '2,780'], [1000000, '1,000,000']])(
    '%i -> %s', (n, s) => expect(formatNumber(n)).toBe(s));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `calculateGlory`/`formatNumber`/`ERRORS` not found (module missing).

- [ ] **Step 3: Write the minimal implementation**

`src/lib/gloryPoints.ts`:
```ts
/** Exact user-facing messages — copy is part of the contract (tests assert these). */
export const ERRORS = {
  empty: 'Please enter a number.',
  notWhole: 'Please enter a whole number.',
  zero: 'Enter a number greater than zero.',
  tooLarge: 'That number is too large.',
} as const;

/**
 * Conversion constants ported from the YeeTalk Flask calculator.
 * Input is capped at 1,000,000,000 (see calculateGlory). Across the entire
 * accepted range [1, 1e9] the naive Math.ceil arithmetic is EXACT — verified
 * exhaustively to 50,000,000 and by a dense BigInt cross-check up to 1e9, with
 * the first divergence only at ~2^51 (2.25e15), a >1,000,000x margin. Do NOT
 * raise the cap without re-verifying exactness (float division by 0.9 / 0.4
 * loses integer precision at large magnitudes).
 */
const BEANS_PER_COIN = 0.9;
const GIFT_BEAN_RATE = 0.4;

export interface GloryResult {
  gloryPoints: number;
  coinsNeeded: number;
  beansNeeded: number;
  totalGiftValue: number;
}

export type GloryOutcome =
  | { ok: true; result: GloryResult }
  | { ok: false; error: string };

export function calculateGlory(rawInput: string): GloryOutcome {
  const trimmed = rawInput.trim();
  if (trimmed === '') return { ok: false, error: ERRORS.empty };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: ERRORS.notWhole };

  const gloryPoints = Number(trimmed);
  if (gloryPoints === 0) return { ok: false, error: ERRORS.zero };
  if (gloryPoints > 1_000_000_000) return { ok: false, error: ERRORS.tooLarge };

  const coinsNeeded = Math.ceil(gloryPoints * 1);
  const beansNeeded = Math.ceil(coinsNeeded / BEANS_PER_COIN);
  const totalGiftValue = Math.ceil(beansNeeded / GIFT_BEAN_RATE);

  return { ok: true, result: { gloryPoints, coinsNeeded, beansNeeded, totalGiftValue } };
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS (all formula, validation, bound, format cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gloryPoints.ts tests/unit/gloryPoints.test.ts
git commit -m "feat: pure Glory Points calculation + validation module"
```

---

### Task 3: BaseLayout head/SEO

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/index.astro` (pass SEO props)
- Test: `tests/e2e/seo.spec.ts`

**Interfaces:**
- Consumes: `tokens.css` (Task 1).
- Produces: `BaseLayout` prop contract `{ title: string; description: string; ogImage?: string }`, a `<slot name="head" />` for page-specific tags, canonical URL derived from `Astro.url`. Header/Footer are injected in Task 4.

- [ ] **Step 1: Write the failing SEO test**

`tests/e2e/seo.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
test.describe('homepage SEO head', () => {
  test('has title, meta description, canonical and Open Graph', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Shyden/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{20,}/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/seo.spec.ts --project=chromium`
Expected: FAIL — no meta description / canonical / og tags.

- [ ] **Step 3: Implement the SEO head in BaseLayout**

`src/layouts/BaseLayout.astro`:
```astro
---
import '../styles/tokens.css';
interface Props { title: string; description: string; ogImage?: string }
const { title, description, ogImage = '/og-default.png' } = Astro.props;
const canonical = new URL(Astro.url.pathname, Astro.site ?? Astro.url).href;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <meta property="og:type" content="website" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    <meta property="og:image" content={new URL(ogImage, Astro.site ?? Astro.url).href} />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <slot name="head" />
  </head>
  <body>
    <main><slot /></main>
  </body>
</html>
```

Set the site URL in `astro.config.mjs`:
```js
import { defineConfig } from 'astro/config';
export default defineConfig({ site: 'https://shyden.co.uk' });
```

Update `src/pages/index.astro` front matter to pass a description:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
const description = 'Shyden Ltd builds bespoke, AI-accelerated software end-to-end — or embeds specialists in your existing team.';
---
<BaseLayout title="Shyden Ltd — Bespoke, AI-powered software" description={description}>
  <h1>Shyden</h1>
</BaseLayout>
```

Add placeholder assets so links resolve: create `public/favicon.svg` (a simple teal square with "S") and `public/og-default.png` (1200×630 brand image — a solid `--bg` canvas with the Shyden wordmark; regenerate during design polish).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/seo.spec.ts`
Expected: PASS across all projects.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/BaseLayout.astro src/pages/index.astro astro.config.mjs public/favicon.svg public/og-default.png tests/e2e/seo.spec.ts
git commit -m "feat: SEO/OG head in BaseLayout with canonical URLs"
```

---

### Task 4: Header + Footer (nav, zero-JS mobile menu, legal disclosure)

**Files:**
- Create: `src/components/Header.astro`, `src/components/Footer.astro`
- Modify: `src/layouts/BaseLayout.astro` (render Header/Footer around the slot)
- Test: `tests/e2e/chrome.spec.ts`

**Interfaces:**
- Consumes: `tokens.css`, `BaseLayout` (Task 3).
- Produces: `<header>` with anchor nav `#services`, `#work`, `#contact` and a `<details>` mobile disclosure; `<footer>` containing the required UK disclosure text. No new JS.

- [ ] **Step 1: Write the failing chrome test**

`tests/e2e/chrome.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
test.describe('header + footer', () => {
  test('nav links point to the section anchors in scroll order', async ({ page }) => {
    // Pin desktop width: on mobile projects the nav lives in a closed <details>,
    // so this viewport-dependent test must set its own width (not inherit the project's).
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const nav = page.locator('header nav');
    await expect(nav.locator('a')).toHaveText(['Services', 'Work', 'Contact']);
    await expect(nav.locator('a').nth(0)).toHaveAttribute('href', '#services');
  });
  test('footer shows the required UK company disclosure', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toContainText('Shyden Ltd');
    await expect(footer).toContainText('Registered in England & Wales');
    await expect(footer).toContainText(/Company (No\.|number)/i);
    await expect(footer.locator('a[href="mailto:support@shyden.co.uk"]')).toBeVisible();
  });
  test('mobile menu is a zero-JS <details> disclosure', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    const details = page.locator('header details');
    await expect(details).toHaveJSProperty('open', false);
    await page.locator('header summary').click();
    await expect(details).toHaveJSProperty('open', true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/chrome.spec.ts --project=chromium`
Expected: FAIL — no `<header nav>` / `<footer>` yet.

- [ ] **Step 3: Implement Header and Footer, wire into BaseLayout**

`src/components/Header.astro`:
```astro
---
const links = [
  { href: '#services', label: 'Services' },
  { href: '#work', label: 'Work' },
  { href: '#contact', label: 'Contact' },
];
---
<header>
  <div class="bar">
    <a class="wordmark" href="/">Shyden</a>
    <details class="menu">
      <summary aria-label="Toggle navigation menu"><span class="bars"></span></summary>
      <nav>
        {links.map((l) => <a href={l.href}>{l.label}</a>)}
      </nav>
    </details>
  </div>
</header>
<style>
  header { position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--border); }
  .bar { max-width: var(--maxw); margin: 0 auto; padding: 0.75rem var(--space); display: flex; align-items: center; justify-content: space-between; }
  .wordmark { font-family: var(--font-head); font-weight: 600; font-size: 1.25rem; color: var(--ink); text-decoration: none; }
  summary { list-style: none; min-width: 44px; min-height: 44px; display: grid; place-items: center; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }
  .bars, .bars::before, .bars::after { display: block; width: 24px; height: 2px; background: var(--ink); content: ''; }
  .bars { position: relative; }
  .bars::before { position: absolute; top: -7px; } .bars::after { position: absolute; top: 7px; }
  nav { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.5rem 0; }
  nav a { min-height: 44px; display: flex; align-items: center; color: var(--ink); text-decoration: none; }
  @media (min-width: 720px) {
    summary { display: none; }
    nav { flex-direction: row; gap: 1.5rem; }
    .menu > nav { display: flex; } /* force-show regardless of open state on desktop */
  }
</style>
```

Note: on desktop, `<details>` content is force-shown via the `@media` rule; on mobile it toggles natively. Verify the desktop nav is visible without opening the disclosure (the Step 1 test checks `a[href="#services"]` visible at desktop width and the disclosure toggle at 375px).

`src/components/Footer.astro`:
```astro
---
// Legal values are supplied at content time (spec §11). Placeholders below are
// clearly marked; replace before launch — do not ship the bracketed text.
const companyNo = '[[COMPANY_NUMBER]]';
const regOffice = '[[REGISTERED_OFFICE_ADDRESS]]';
const year = new Date().getFullYear();
---
<footer id="contact-legal">
  <div class="inner">
    <p class="disclosure">
      &copy; {year} Shyden Ltd. Registered in England &amp; Wales. Company No. {companyNo}.
      Registered office: {regOffice}.
    </p>
    <p><a href="mailto:support@shyden.co.uk">support@shyden.co.uk</a></p>
  </div>
</footer>
<style>
  footer { border-top: 1px solid var(--border); margin-top: 4rem; }
  .inner { max-width: var(--maxw); margin: 0 auto; padding: 2rem var(--space); color: var(--ink-soft); font-size: 0.9rem; }
  .inner a { color: var(--accent); }
</style>
```

Wire into `src/layouts/BaseLayout.astro` `<body>`:
```astro
---
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
// ...existing Props/canonical code above...
---
<!-- ...head unchanged... -->
  <body>
    <Header />
    <main><slot /></main>
    <Footer />
  </body>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/chrome.spec.ts`
Expected: PASS across all projects. (The `[[COMPANY_NUMBER]]` placeholder still satisfies the `Company No.` regex; real values land at content time.)

- [ ] **Step 5: Commit**

```bash
git add src/components/Header.astro src/components/Footer.astro src/layouts/BaseLayout.astro tests/e2e/chrome.spec.ts
git commit -m "feat: header nav, zero-JS mobile menu, legal-disclosure footer"
```

---

### Task 5: Homepage sections (hero, services, work, contact)

**Files:**
- Create: `src/components/Button.astro`, `src/components/ServiceCard.astro`, `src/components/WorkCard.astro`
- Modify: `src/pages/index.astro`
- Test: `tests/e2e/homepage.spec.ts`

**Interfaces:**
- Consumes: `BaseLayout`, `Header`/`Footer`, tokens.
- Produces: homepage sections `#services`, `#work`, `#contact`; `Button` (`href`, `variant`), `ServiceCard` (`title`, slot), `WorkCard` (`title`, `href`, `external?`, slot).

- [ ] **Step 1: Write the failing homepage test**

`tests/e2e/homepage.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
test.describe('homepage content', () => {
  test('hero CTA is a mailto and sections exist', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText(/Shyden|bespoke/i);
    await expect(page.getByRole('link', { name: /get in touch/i }).first())
      .toHaveAttribute('href', 'mailto:support@shyden.co.uk');
    for (const id of ['services', 'work', 'contact']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });
  test('exactly two service cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#services .service-card')).toHaveCount(2);
  });
  test('work cards link to ShyTalk (external) and the calculator (internal)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#work a[href="https://shytalk.shyden.co.uk"]')).toHaveCount(1);
    await expect(page.locator('#work a[href="/glory-points"]')).toHaveCount(1);
  });
});
test.describe('mobile-first layout', () => {
  for (const width of [320, 375, 768, 1280]) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
  test('no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/');
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/homepage.spec.ts --project=chromium`
Expected: FAIL — sections/cards/CTA absent.

- [ ] **Step 3: Implement components + homepage**

`src/components/Button.astro`:
```astro
---
interface Props { href: string; variant?: 'primary' | 'secondary' }
const { href, variant = 'primary' } = Astro.props;
---
<a class={`btn ${variant}`} href={href}><slot /></a>
<style>
  .btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 1.25rem; border-radius: var(--radius); text-decoration: none; font-weight: 600; }
  .primary { background: var(--accent); color: #fff; }
  .primary:hover { background: var(--accent-ink); color: #fff; }
  .secondary { border: 1px solid var(--border); color: var(--ink); }
</style>
```

`src/components/ServiceCard.astro`:
```astro
---
interface Props { title: string }
const { title } = Astro.props;
---
<article class="service-card">
  <h3>{title}</h3>
  <p><slot /></p>
</article>
<style>
  .service-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; }
  h3 { margin-top: 0; }
</style>
```

`src/components/WorkCard.astro`:
```astro
---
interface Props { title: string; href: string; external?: boolean }
const { title, href, external = false } = Astro.props;
const rel = external ? 'noopener' : undefined;
const target = external ? '_blank' : undefined;
---
<a class="work-card" href={href} rel={rel} target={target}>
  <h3>{title}</h3>
  <p><slot /></p>
</a>
<style>
  .work-card { display: block; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; text-decoration: none; color: var(--ink); }
  .work-card:hover { border-color: var(--accent); }
</style>
```

`src/pages/index.astro`:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Button from '../components/Button.astro';
import ServiceCard from '../components/ServiceCard.astro';
import WorkCard from '../components/WorkCard.astro';
const description = 'Shyden Ltd builds bespoke, AI-accelerated software end-to-end — or embeds specialists in your existing team.';
---
<BaseLayout title="Shyden Ltd — Bespoke, AI-powered software" description={description}>
  <section class="hero wrap">
    <h1>We build bespoke software — AI-accelerated, yours end-to-end.</h1>
    <p class="lead">Or embed our specialists in the team you already have.</p>
    <p class="cta">
      <Button href="mailto:support@shyden.co.uk">Get in touch</Button>
      <Button href="#work" variant="secondary">See our work</Button>
    </p>
  </section>

  <section id="services" class="wrap">
    <h2>What we do</h2>
    <div class="grid-2">
      <ServiceCard title="We build your product">Plan, build and maintain your software end-to-end — AI-accelerated, delivered by us.</ServiceCard>
      <ServiceCard title="Hire our specialists">Embed our people in your existing software and processes to move faster with less risk.</ServiceCard>
    </div>
  </section>

  <section id="work" class="wrap">
    <h2>Our work</h2>
    <div class="grid-2">
      <WorkCard title="ShyTalk" href="https://shytalk.shyden.co.uk" external>Our flagship product.</WorkCard>
      <WorkCard title="Glory Points Calculator" href="/glory-points">A companion tool we built for YeeTalk.</WorkCard>
    </div>
  </section>

  <section id="contact" class="wrap">
    <h2>Get in touch</h2>
    <p>Tell us what you're building. <a href="mailto:support@shyden.co.uk">support@shyden.co.uk</a></p>
    <p><Button href="mailto:support@shyden.co.uk">Email us</Button></p>
  </section>
</BaseLayout>
<style>
  .wrap { max-width: var(--maxw); margin: 0 auto; padding: 3rem var(--space); }
  .hero h1 { font-size: clamp(2rem, 1.2rem + 4vw, 3.25rem); max-width: var(--measure); }
  .lead { font-size: 1.15rem; color: var(--ink-soft); max-width: var(--measure); }
  .cta { display: flex; flex-wrap: wrap; gap: 1rem; }
  .grid-2 { display: grid; grid-template-columns: 1fr; gap: 1rem; }
  @media (min-width: 720px) { .grid-2 { grid-template-columns: 1fr 1fr; } }
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/homepage.spec.ts`
Expected: PASS across all 5 projects (content, 2 cards, work links, no overflow at 320/375/768/1280, no console errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/Button.astro src/components/ServiceCard.astro src/components/WorkCard.astro src/pages/index.astro tests/e2e/homepage.spec.ts
git commit -m "feat: homepage hero, services, work and contact sections"
```

---

### Task 6: Calculator page + DOM wiring

**Files:**
- Create: `src/scripts/glory-points.ts`, `src/pages/glory-points.astro`
- Test: `tests/e2e/glory-points.spec.ts`

**Interfaces:**
- Consumes: `calculateGlory`, `formatNumber`, `ERRORS` from `src/lib/gloryPoints.ts` (Task 2); `BaseLayout`.
- Produces: `/glory-points` page with `#glory-input`, `#glory-submit`, `#glory-result` (`aria-live="polite"`), `#glory-error` (`role="alert"`), wired by `scripts/glory-points.ts`; plus a "For YeeTalk" attribution link to `https://yeetalkapp.com/`.

- [ ] **Step 1: Write the failing calculator test**

`tests/e2e/glory-points.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
test.describe('glory points calculator', () => {
  test('computes the exact breakdown for 1000', async ({ page }) => {
    await page.goto('/glory-points');
    await page.fill('#glory-input', '1000');
    await page.click('#glory-submit');
    const result = page.locator('#glory-result');
    await expect(result).toContainText('1,000');   // coins
    await expect(result).toContainText('1,112');   // beans
    await expect(result).toContainText('2,780');   // gift
  });
  test('Enter key submits', async ({ page }) => {
    await page.goto('/glory-points');
    await page.fill('#glory-input', '9');
    await page.press('#glory-input', 'Enter');
    await expect(page.locator('#glory-result')).toContainText('25');
  });
  test('shows YeeTalk attribution linking to the official site', async ({ page }) => {
    await page.goto('/glory-points');
    const link = page.locator('a[href="https://yeetalkapp.com/"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.getByText(/YeeTalk/i).first()).toBeVisible();
  });
  test.each([
    ['', 'Please enter a number.'],
    ['abc', 'Please enter a whole number.'],
    ['3.5', 'Please enter a whole number.'],
    ['0', 'Enter a number greater than zero.'],
  ])('input %j shows error %j', async ({ page }, input, message) => {
    await page.goto('/glory-points');
    if (input) await page.fill('#glory-input', input);
    await page.click('#glory-submit');
    await expect(page.locator('#glory-error')).toHaveText(message);
    await expect(page.locator('#glory-result')).toBeEmpty();
  });
});
```
(If your Playwright version doesn't support `test.each` with fixtures, expand into four explicit tests with the same bodies.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/glory-points.spec.ts --project=chromium`
Expected: FAIL — `/glory-points` 404 / elements absent.

- [ ] **Step 3: Implement the page + DOM wiring**

`src/scripts/glory-points.ts`:
```ts
import { calculateGlory, formatNumber } from '../lib/gloryPoints';

const input = document.querySelector<HTMLInputElement>('#glory-input');
const submit = document.querySelector<HTMLButtonElement>('#glory-submit');
const result = document.querySelector<HTMLElement>('#glory-result');
const error = document.querySelector<HTMLElement>('#glory-error');

function run(): void {
  if (!input || !result || !error) return;
  const outcome = calculateGlory(input.value);
  if (!outcome.ok) {
    result.textContent = '';
    error.textContent = outcome.error;
    return;
  }
  error.textContent = '';
  const { coinsNeeded, beansNeeded, totalGiftValue } = outcome.result;
  result.textContent =
    `${formatNumber(coinsNeeded)} coins → ${formatNumber(beansNeeded)} beans → ` +
    `${formatNumber(totalGiftValue)} total gift value`;
}

submit?.addEventListener('click', run);
input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
```

`src/pages/glory-points.astro`:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
const description = 'Convert YeeTalk glory points into coins, beans and total gift value — instantly, in your browser.';
---
<BaseLayout title="Glory Points Calculator — Shyden" description={description}>
  <section class="wrap">
    <p class="for-yeetalk">
      <!-- Nominative attribution: text wordmark now; swap in YeeTalk's official
           logo asset when sourced (spec §6/§11). Do not fabricate their mark. -->
      <a href="https://yeetalkapp.com/" target="_blank" rel="noopener noreferrer">For YeeTalk ↗</a>
    </p>
    <h1>Glory Points Calculator</h1>
    <p class="lead">
      Glory points are part of <strong>YeeTalk</strong>'s in-app gifting. This companion
      tool, built by Shyden, converts a glory-point total into coins, beans and gift value.
    </p>
    <div class="card">
      <label for="glory-input">Glory points</label>
      <input id="glory-input" name="glory" type="text" inputmode="numeric"
             autocomplete="off" aria-describedby="glory-error" />
      <button id="glory-submit" type="button">Calculate</button>
      <p id="glory-error" class="error" role="alert" aria-live="assertive"></p>
      <p id="glory-result" class="result" aria-live="polite"></p>
      <noscript><p class="error">This calculator needs JavaScript enabled.</p></noscript>
    </div>
    <p class="assumptions">Assumes 1 coin per point, 0.9 beans per coin, and gifts converting to beans at 40%.</p>
  </section>
</BaseLayout>
<script>
  import '../scripts/glory-points.ts';
</script>
<style>
  .wrap { max-width: 640px; margin: 0 auto; padding: 3rem var(--space); }
  .for-yeetalk { margin: 0 0 0.5rem; }
  .for-yeetalk a { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 32px; padding: 0.15rem 0.75rem; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--ink-soft); font-size: 0.85rem; font-weight: 600; text-decoration: none; }
  .for-yeetalk a:hover { border-color: var(--accent); color: var(--accent-ink); }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; display: grid; gap: 0.75rem; }
  label { font-weight: 600; }
  input { min-height: 44px; padding: 0 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem; }
  button { min-height: 44px; border: 0; border-radius: var(--radius); background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
  button:hover { background: var(--accent-ink); }
  .error { color: var(--danger); min-height: 1.5rem; margin: 0; }
  .result { font-size: 1.15rem; font-weight: 600; min-height: 1.5rem; margin: 0; }
  .assumptions { color: var(--ink-soft); font-size: 0.9rem; }
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/glory-points.spec.ts`
Expected: PASS across all projects (exact breakdown, Enter key, each validation message, result cleared on error).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/glory-points.ts src/pages/glory-points.astro tests/e2e/glory-points.spec.ts
git commit -m "feat: client-side Glory Points Calculator page"
```

---

### Task 7: 404 page, sitemap, robots, reduced-motion

**Files:**
- Create: `src/pages/404.astro`, `public/robots.txt`
- Modify: `astro.config.mjs` (add sitemap integration)
- Test: `tests/e2e/site-meta.spec.ts`

**Interfaces:**
- Consumes: `BaseLayout`, `astro.config.mjs` (Task 3).
- Produces: custom 404, generated `sitemap-index.xml`, `robots.txt` referencing it.

- [ ] **Step 1: Write the failing test**

`tests/e2e/site-meta.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
test('custom 404 renders branded not-found copy', async ({ page }) => {
  const res = await page.goto('/no-such-page-xyz');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText(/not found/i);
  await expect(page.locator('a[href="/"]')).toBeVisible();
});
test('robots.txt references the sitemap', async ({ request }) => {
  const body = await (await request.get('/robots.txt')).text();
  expect(body).toMatch(/Sitemap:\s*https:\/\/shyden\.co\.uk\/sitemap-index\.xml/);
});
```
Note: the 404 status assertion requires the production build (`astro build && astro preview`); if the E2E webServer runs `astro dev`, run this spec against preview, or assert only the rendered copy in dev.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/site-meta.spec.ts --project=chromium`
Expected: FAIL — default 404, no robots.txt.

- [ ] **Step 3: Implement 404, sitemap, robots**

`src/pages/404.astro`:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Page not found — Shyden" description="The page you were looking for doesn't exist.">
  <section class="wrap">
    <h1>Page not found</h1>
    <p>That page doesn't exist. <a href="/">Back to the homepage</a>.</p>
  </section>
</BaseLayout>
<style>.wrap { max-width: var(--maxw); margin: 0 auto; padding: 4rem var(--space); }</style>
```

`astro.config.mjs`:
```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
export default defineConfig({ site: 'https://shyden.co.uk', integrations: [sitemap()] });
```

`public/robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://shyden.co.uk/sitemap-index.xml
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm run build && npx playwright test tests/e2e/site-meta.spec.ts
```
Expected: PASS. Confirm `dist/sitemap-index.xml` exists after build.

- [ ] **Step 5: Commit**

```bash
git add src/pages/404.astro public/robots.txt astro.config.mjs tests/e2e/site-meta.spec.ts
git commit -m "feat: custom 404, sitemap and robots.txt"
```

---

### Task 8: Deploy config + project docs

**Files:**
- Create: `public/_headers` (Cloudflare Pages security headers)
- Create: `CLAUDE.md` (project working agreement)
- Modify: `README.md` (dev + deploy instructions)
- Test: manual build verification (no runtime test — config/docs task)

**Interfaces:**
- Consumes: everything above.
- Produces: deploy-ready repo + documented Cloudflare Pages settings.

- [ ] **Step 1: Add Cloudflare Pages headers**

`public/_headers`:
```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
```

- [ ] **Step 2: Write `CLAUDE.md`**

```markdown
# shyden.co.uk — working agreement

- **Mobile-first, TDD, all-browser.** Base CSS is small-screen; enhance up. No horizontal scroll ≥320px; touch targets ≥44px; WCAG AA.
- **Homepage ships zero JS.** Only `/glory-points` has a script.
- **Calculator logic is pure** (`src/lib/gloryPoints.ts`) and unit-tested; the page script only wires the DOM. Change the formula? Update the unit tests first.
- **Accent `#0A7D66`** is the AA floor — never lighten it without re-checking contrast.
- **Fonts self-hosted** via `@fontsource`. No external CDN / no third-party requests.
- **Tests:** `npm run test:unit` (Vitest), `npm run test:e2e` (Playwright, 5 projects), `npm test` (both).
- **Owed:** real mobile-device browser gauntlet before launch (web work is device-verified too).
```

- [ ] **Step 3: Update `README.md` with dev + deploy**

Replace the "Development" section of `README.md` with:
```markdown
## Development

    npm install
    npm run dev         # http://localhost:4321
    npm test            # unit + e2e

## Deploy (Cloudflare Pages)

- Connect the repo in Cloudflare Pages.
- Build command: `npm run build` · Output directory: `dist` · Node: 24.
- Add the custom domain `shyden.co.uk` (and confirm `shytalk.shyden.co.uk` resolves before cutover).
- The old Flask Glory Points app is retired once cutover is verified.
```

- [ ] **Step 4: Verify a clean production build**

Run: `npm run build && npm run preview`
Expected: `dist/` builds clean; homepage + `/glory-points` + 404 serve; `dist/sitemap-index.xml` present.

- [ ] **Step 5: Commit**

```bash
git add public/_headers CLAUDE.md README.md
git commit -m "docs: Cloudflare Pages deploy config and project working agreement"
```

---

## Post-implementation (owed, tracked — not code tasks)

- **Real mobile-device browser gauntlet**: real Android (chrome/samsung/edge/firefox) + real iPhone (safari/chrome) browsers against a preview deploy — the hard gate for web work on device return.
- **Legal values**: replace `[[COMPANY_NUMBER]]` / `[[REGISTERED_OFFICE_ADDRESS]]` in `Footer.astro` before launch.
- **OG image + favicon**: replace the placeholder `public/og-default.png` / `public/favicon.svg` with final brand art.
- **YeeTalk logo**: source YeeTalk's official mark and drop it into the `/glory-points` "For YeeTalk" lockup (the text wordmark link ships until then); confirm affiliation framing (spec §11).
- **DNS cutover** (operator): point `shyden.co.uk` at Pages; retire the Flask app.

## Plan Self-Review

- **Spec coverage:** homepage (§5)→Tasks 4–5; calculator (§6)→Tasks 2,6; brand/tokens (§4)→Task 1; SEO (§3)→Task 3; mobile-first/cross-browser (§7)→Tasks 5,6 + Playwright projects; testing (§8)→every task TDD; deploy (§9)→Task 8; legal footer (§5.6)→Task 4; 404/sitemap→Task 7; ACs (§10)→covered across Tasks 1–8. No uncovered requirement.
- **Placeholders:** the only bracketed tokens are the `[[COMPANY_NUMBER]]` / `[[REGISTERED_OFFICE_ADDRESS]]` legal values and the OG/favicon art — all explicitly "supplied at content time" per spec §11, tracked in Post-implementation, and non-blocking for build/test. No hand-wavy "add validation/error handling" steps.
- **Type consistency:** `calculateGlory`/`formatNumber`/`ERRORS`/`GloryOutcome` are defined in Task 2 and consumed with the same names/shape in Task 6; element IDs (`#glory-input/-submit/-result/-error`) match between the page (Task 6 Step 3) and its tests (Task 6 Step 1); nav anchors (`#services/#work/#contact`) match between Header (Task 4) and homepage sections (Task 5).
