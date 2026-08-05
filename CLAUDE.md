# shyden.co.uk — working agreement

- **Mobile-first, TDD, all-browser.** Base CSS is small-screen; enhance up. No horizontal scroll ≥320px; touch targets ≥44px; WCAG AA.
- **Homepage ships zero JS.** Only `/glory-points` and `/classroom-groups` have scripts, in both locales.
- **Logic is pure** (`src/lib/gloryPoints.ts`, `src/lib/grouping.ts`) and unit-tested; page scripts only wire the DOM. Change the formula or the grouping rules? Update the unit tests first.
- **Whitespace between two JSX nodes only survives while they share a line.** Assemble a sentence in the frontmatter, or write the space as `{' '}` — never rejoin the lines, because prettier re-wraps them and silently changes what the page says. Three sentences shipped broken this way. `tests/e2e/rendered-text.spec.ts` scans every built page for it.
- **Locale files are a review surface.** `src/lib/i18n/*` claims a compile-time guarantee that nothing enforces — there is no type checker in this repo or in CI. `tests/unit/i18n.test.ts` and `dead-copy.test.ts` are what actually hold it up: missing keys, blank values, untranslated copy, and copy no page renders.
- **The e2e suite measures `dist/`**, not the dev server (`playwright.config.ts` builds and previews). Anything asserted against `astro dev` is asserting about bytes nobody receives.
- **Accent `#0A7D66`** is the AA floor — never lighten it without re-checking contrast.
- **Fonts self-hosted** via `@fontsource`. No external CDN / no third-party requests.
- **Tests:** `npm run test:unit` (Vitest), `npm run test:e2e` (Playwright, 5 projects), `npm test` (both).
- **Owed:** real mobile-device browser gauntlet before launch (web work is device-verified too).
