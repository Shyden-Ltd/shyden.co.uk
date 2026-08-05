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
  // `reuseExistingServer` stays false deliberately. Left on, a dev server
  // already listening on 4321 is silently adopted and the whole suite goes
  // back to measuring the wrong thing, with nothing in the output to say so.
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: false,
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
