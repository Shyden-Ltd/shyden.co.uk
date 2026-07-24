# shyden.co.uk — working agreement

- **Mobile-first, TDD, all-browser.** Base CSS is small-screen; enhance up. No horizontal scroll ≥320px; touch targets ≥44px; WCAG AA.
- **Homepage ships zero JS.** Only `/glory-points` has a script.
- **Calculator logic is pure** (`src/lib/gloryPoints.ts`) and unit-tested; the page script only wires the DOM. Change the formula? Update the unit tests first.
- **Accent `#0A7D66`** is the AA floor — never lighten it without re-checking contrast.
- **Fonts self-hosted** via `@fontsource`. No external CDN / no third-party requests.
- **Tests:** `npm run test:unit` (Vitest), `npm run test:e2e` (Playwright, 5 projects), `npm test` (both).
- **Owed:** real mobile-device browser gauntlet before launch (web work is device-verified too).
