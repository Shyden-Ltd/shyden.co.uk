import { defineConfig, devices } from '@playwright/test';

// Post-deploy sanity config: runs tests/dev/*.spec.ts against the REAL
// deployed dev site (no local webServer). baseURL + the Basic-auth
// credential come from env so CI — and a local run — can point at
// https://dev.shyden.co.uk. Kept separate from playwright.config.ts
// (testDir ./tests/e2e) so the normal `npm run test:e2e` never picks
// these remote specs up.
const password = process.env.DEV_BASIC_AUTH_PASSWORD;

export default defineConfig({
  testDir: './tests/dev',
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'https://dev.shyden.co.uk',
    // Username half is ignored by the gate; only the password matters.
    httpCredentials: password ? { username: 'dev', password } : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
