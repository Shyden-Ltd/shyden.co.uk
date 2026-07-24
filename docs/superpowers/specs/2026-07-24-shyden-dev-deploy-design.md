# shyden.co.uk dev deployment — design

**Goal:** A private, password-protected **dev** deployment of the shyden.co.uk static site on Cloudflare Pages, mirroring ShyTalk's website dev-deploy pattern. Reviewers can see the real site at a stable dev URL before it goes to prod; search engines never index it.

## Reference pattern (ShyTalk)

ShyTalk deploys its `public/` site to two Cloudflare Pages projects — `shytalk-site` (prod → `shytalk.shyden.co.uk`) and `shytalk-site-dev` (dev → `dev.shytalk.shyden.co.uk`) — via `wrangler pages deploy … --project-name …` from a GitHub Actions workflow. One `functions/_middleware.js` Pages Function serves BOTH: it passes prod hostnames through untouched, and on every non-prod hostname it gates the request behind HTTP Basic auth, injects `X-Robots-Tag: noindex`, and serves a `Disallow: /` robots.txt. Pure logic lives in `functions/_lib/lockdown.js` (unit-tested).

## shyden.co.uk adaptation

Same shape, adapted for a static **Astro** site (build output `dist/`, not `public/`), ESM (the project is `"type": "module"`), and Vitest (not Jest). No API surface, so the API-hostname helpers are dropped (YAGNI).

### Components

1. **`functions/_lib/lockdown.js`** (ESM, pure) — `isProdHostname` (exact, case-insensitive; `PROD_HOSTNAME = 'shyden.co.uk'`), `shouldServeBlockingRobots`, `blockingRobotsBody`, `noIndexHeaderValue`, `basicAuthOk` (fails closed when the password is unset/empty — a misconfigured deploy stays locked, never wide open), `basicAuthChallenge` (401 + `WWW-Authenticate`). Adapted from ShyTalk's lockdown verbatim in behaviour; only strings/hostnames change.
2. **`functions/_middleware.js`** (ESM) — the Cloudflare Pages plumbing: prod hostname → `next()`; `/robots.txt` → blocking body (before the auth gate, so crawlers read `Disallow`); else Basic-auth via `env.DEV_PASSWORD` → on pass, graft `X-Robots-Tag` onto the response. `functions/` sits at the repo ROOT (wrangler scans `<repo>/functions/`, never `dist/functions/`).
3. **`tests/unit/lockdown.test.ts`** (Vitest) — every branch of the pure logic: exact/near-miss/case hostname matching, fail-closed auth (unset password, missing/malformed header, wrong vs correct password, username-ignored), robots body contains `Disallow: /`, header value.
4. **`.github/workflows/deploy-dev.yml`** (`workflow_dispatch`, `ref` input) — `npm ci` → `npm run build` → `wrangler pages deploy dist --project-name shyden-site-dev --branch main` → Playwright sanity check against `https://dev.shyden.co.uk` using `httpCredentials` (the Basic-auth password).
5. **`tests/dev/dev-sanity.spec.ts`** (its own `testDir`, isolated from `npm run test:e2e`) — post-deploy: the dev homepage + `/glory-points` load (200) behind Basic auth; unauthenticated request gets 401; `/robots.txt` says `Disallow: /`.

### Cloudflare provisioning (this session, via operator API token)

- Create Pages project **`shyden-site-dev`** in the Shyden-Ltd account (same account as ShyTalk — verified against the token; account id lives in CI secrets, not here).
- Set the Pages **secret `DEV_PASSWORD`** (encrypted, via `wrangler pages secret put`; shyden's own Basic-auth password lives at `~/.shytalk/shyden-dev-web-auth.env`, never committed/logged). A secret change only takes effect on the NEXT deploy.
- Add custom domain **`dev.shyden.co.uk`** + the DNS CNAME → `shyden-site-dev.pages.dev`.
- Add the repo GitHub secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` so CI deploys work after this session.

### First deploy

Deploy the current `build/site-v1` branch (the finished-but-unmerged site, PR #1) to dev now, so it can be reviewed on `dev.shyden.co.uk` before merge to `main`.

## Out of scope (tracked, not now)

- The **prod** Pages project (`shyden-site` → `shyden.co.uk`) + prod deploy workflow — the middleware is already forward-compatible (prod hostname passes through). Add when cutting over from the current hosting.
- Wiring `DEV_PASSWORD`/token rotation automation.

## Testing

TDD the pure `lockdown.js` (RED→GREEN, Vitest). The middleware + workflow are integration-verified by the post-deploy `dev-sanity.spec.ts` against the real dev URL (real Basic-auth, real 401, real robots.txt) — no mocks.
