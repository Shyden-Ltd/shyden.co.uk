# shyden.co.uk

The **Shyden Ltd** company website — a bespoke, AI-powered software company.

## Status

**v1 in design.** See the design spec:
[`docs/superpowers/specs/2026-07-23-shyden-homepage-design.md`](docs/superpowers/specs/2026-07-23-shyden-homepage-design.md)

v1 scope:

- **Homepage** — company landing / lead generation.
- **Glory Points Calculator** (`/glory-points`) — a re-designed, client-side companion tool for the third-party YeeTalk app.

## Tech

- **[Astro](https://astro.build)** static site generator (multi-page-ready, zero-JS output).
- **Cloudflare Pages** hosting ($0).
- **Mobile-first**, **TDD** (Vitest + Playwright), **all-browser-compatible**.

## Development

    npm install
    npm run dev         # http://localhost:4321
    npm test            # unit + e2e

## Deploy (Cloudflare Pages)

- Connect the repo in Cloudflare Pages.
- Build command: `npm run build` · Output directory: `dist` · Node: 24.
- Add the custom domain `shyden.co.uk` (and confirm `shytalk.shyden.co.uk` resolves before cutover).
- The old Flask Glory Points app is retired once cutover is verified.
