import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Measure the bytes that ship, not the ones the dev server improvises.
  // `astro dev` renders on request and skips build-time steps — compressHTML,
  // asset hashing, the sitemap — so a suite pointed at it can be entirely
  // green about a page nobody will ever receive. The build is ~1.5s; there is
  // no reason to test anything else.
  //
  // `reuseExistingServer` used to be hardcoded `false` for exactly that
  // reason: left on unconditionally, a dev server already listening on 4321
  // is silently adopted and the whole suite goes back to measuring the wrong
  // thing, with nothing in the output to say so. That hazard is still real —
  // this is now `!!process.env.PW_REUSE_SERVER` instead of always-false
  // because `scripts/test-devices.mjs` (`npm run test:devices`) needs desktop,
  // Android and iOS to share ONE build and ONE server rather than each
  // rebuilding and fighting over port 4321. The invariant this guards is now
  // upheld by the runner, not by this file: `PW_REUSE_SERVER` is set by
  // nothing else, and the runner sets it only after it has (a) freed port
  // 4321 itself, (b) run a fresh `npm run build`, (c) started
  // `astro preview` itself, and (d) fetched `/classroom-groups` and confirmed
  // the response references a hashed `/_astro/` asset — proof the server is
  // previewing a fresh build, not something already-running and stale. A run
  // of this config that does NOT go through the runner (e.g. a bare
  // `npx playwright test`) never has `PW_REUSE_SERVER` set, so it keeps the
  // original safe behaviour unchanged: refuse an already-listening server.
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !!process.env.PW_REUSE_SERVER,
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
