import { defineConfig, devices } from '@playwright/test';
import { onBuild } from './tests/sanity-on-build';

// Post-deploy PROD config: runs tests/prod/*.spec.ts against the REAL deployed
// production site (no local webServer unless SANITY_ON_BUILD, below), mirroring
// playwright.dev.config.ts.
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
// defaults to the PUBLIC production domain — the host real visitors get.
//
// It previously defaulted to the `shyden-site.pages.dev` deployment alias,
// chosen while the apex DNS had not yet cut over to this project. That cutover
// has happened: the apex serves 200, while the alias answers 401 behind Basic
// auth. Verifying the alias therefore meant `prod-verified` attested that a
// password-locked staging URL rendered, and said nothing about whether
// shyden.co.uk resolved, presented a valid certificate, or routed here at all.
//
// It sends no credential: the apex is not behind Basic auth. The release used to
// hand this config the DEV password for a prod run, which prod must never hold
// (#241).
//
// With SANITY_ON_BUILD=1 it measures this tree's own production build instead
// (#335). A build inherits the whole environment, and a config cannot unset a
// variable for it, so a PUBLIC_SHYTALK_URL left in the shell would build the
// DEV ShyTalk links into what this run calls production. It is refused.
const build = onBuild(4399, {});
if (build && process.env.PUBLIC_SHYTALK_URL !== undefined)
  throw new Error(
    `SANITY_ON_BUILD: PUBLIC_SHYTALK_URL is set (${process.env.PUBLIC_SHYTALK_URL}), ` +
      'so this build would not be production. Unset it and run again.',
  );

export default defineConfig({
  testDir: './tests/prod',
  // A failed prod check must not be a flake that gets waved through, and must
  // not hang the release either.
  retries: 1,
  timeout: 30_000,
  webServer: build?.webServer,
  grepInvert: build?.grepInvert,
  use: {
    baseURL:
      build?.baseURL ?? process.env.WEB_BASE_URL ?? 'https://shyden.co.uk',
    colorScheme: 'dark',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
