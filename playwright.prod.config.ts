import { defineConfig, devices } from '@playwright/test';

// Post-deploy PROD config: runs tests/prod/*.spec.ts against the REAL deployed
// production site (no local webServer), mirroring playwright.dev.config.ts.
//
// This exists because production was verified by `curl` — status codes and
// grepping fetched HTML. That is a text assertion, and this repo has already
// shipped a bug for a whole release that no text assertion can see: `display:
// flex` ate authored whitespace while `textContent` still contained it, so
// every text-based check passed. curl also cannot tell whether the CSS loaded,
// whether the calculators' JS ran, or whether the page scrolls sideways at
// 320px. `prod-verified` should mean a browser rendered production.
//
// baseURL is env-driven so the target can move without editing this file. It
// defaults to the Cloudflare Pages host the existing smoke uses rather than the
// custom domain — kept deliberately identical so this change swaps the TOOL
// without also silently changing WHAT is verified.
const password = process.env.PROD_BASIC_AUTH_PASSWORD;

export default defineConfig({
  testDir: './tests/prod',
  // A failed prod check must not be a flake that gets waved through, and must
  // not hang the release either.
  retries: 1,
  timeout: 30_000,
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'https://shyden-site.pages.dev',
    // Username half is ignored by the gate; only the password matters.
    httpCredentials: password ? { username: 'prod', password } : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
