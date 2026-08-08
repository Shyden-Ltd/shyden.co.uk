import { defineConfig } from '@playwright/test';

// Set here rather than only in the runner so that a bare `npx playwright test
// --config=playwright.device.config.ts` behaves identically to the scripted run. Playwright
// loads the config in every worker before any spec file, so fixtures.ts sees it.
process.env.PW_REAL_DEVICE = '1';

export default defineConfig({
  testDir: './tests',
  // One phone, one shared context, one localStorage origin.
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: 'npm run build && npm run preview -- --host 0.0.0.0',
    url: 'http://localhost:4321',
    reuseExistingServer: !!process.env.PW_REUSE_SERVER,
  },
  use: { baseURL: 'http://localhost:4321' },
  projects: [
    { name: 'android-preflight', testMatch: /android-preflight\.setup\.ts/ },
    {
      name: 'android-chrome',
      dependencies: ['android-preflight'],
      // `testDir` is './tests' (not './tests/e2e') so this project can also reach
      // tests/device/real-device.spec.ts, but that widens the sweep to every other
      // directory under tests/ too. An allowlist is deliberate, not a style choice: a
      // denylist that only named the preflight file let this project try to collect
      // tests/unit/*.test.ts (Vitest, crashes -- there is no Vitest runtime under
      // Playwright) and tests/dev/dev-sanity.spec.ts (targets the deployed dev site
      // under its own playwright.dev.config.ts; running it here would mix that
      // environment's assertions into a local-build run). Measured by running
      // `--list` against the denylist version, not assumed.
      testMatch: [
        /tests\/e2e\/.*\.spec\.ts$/,
        /tests\/device\/real-device\.spec\.ts$/,
      ],
      // A real phone has one screen: `page.setViewportSize`/`test.use({ viewport })`
      // would "succeed" against CDP and report numbers describing nothing physical
      // (see tests/unit/viewport-tagging.test.ts, which is what keeps every such
      // test actually carrying this tag). Scoped to this project alone -- the
      // preflight project runs exactly one setup file that never touches the
      // viewport, and must not be affected by a grep option meant for the suite.
      grepInvert: /@emulated-viewport/,
    },
  ],
});
