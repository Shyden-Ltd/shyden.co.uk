import { test as base, expect, chromium, type BrowserContext, type Page } from '@playwright/test';

const CDP_URL = process.env.ANDROID_CDP_URL ?? 'http://127.0.0.1:9222';

/**
 * Real-device runs are a separate Playwright invocation with its own config, so the choice
 * is made once, at module load, rather than per test. Desktop keeps `base` verbatim: an
 * override that merely *reproduced* the defaults would be one refactor away from dropping
 * the emulation options that the mobile-chrome and mobile-safari projects depend on.
 */
const realDeviceTest = base.extend<{ context: BrowserContext; page: Page }>({
  browser: [
    async ({}, use) => {
      const browser = await chromium.connectOverCDP(CDP_URL);
      await use(browser);
      // Disconnects the client. It does not close Chrome on the phone.
      await browser.close();
    },
    { scope: 'worker' },
  ],

  context: async ({ browser, baseURL }, use) => {
    // The phone has exactly one context and newContext() is unsupported, so every test
    // shares it -- which means state does not clear itself between tests the way it does
    // for a fresh desktop context.
    const context = browser.contexts()[0];
    if (!context) throw new Error('Real device exposed no browser context over CDP.');

    const scratch = await context.newPage();
    const cdp = await context.newCDPSession(scratch);
    await cdp.send('Storage.clearDataForOrigin', {
      origin: new URL(baseURL!).origin,
      storageTypes: 'all',
    });
    await cdp.detach();
    await scratch.close();
    await context.clearCookies();

    await use(context);

    // Leave the context open -- it belongs to the device, not to the test.
    for (const page of context.pages()) await page.close().catch(() => {});
  },

  page: async ({ context, baseURL }, use) => {
    const page = await context.newPage();

    // This context was never created via `newContext({ baseURL })` -- Chrome made it, not
    // Playwright, so the server-side `browserContext._options.baseURL` that `page.goto()`
    // normally reads is empty. Measured directly: calling `page.goto('/classroom-groups')`
    // against this context throws `Protocol error (Page.navigate): Cannot navigate to
    // invalid URL`, because Chrome receives the literal relative string with nothing to
    // resolve it against. There is no supported API to set baseURL on an existing context
    // after the fact, so this resolves it client-side before the call ever reaches the
    // browser. `new URL(url, baseURL)` passes an already-absolute `url` through unchanged,
    // so specs that pass a full URL are unaffected.
    //
    // Only `goto` is patched. Other baseURL-aware APIs (`page.request`, `page.route` glob
    // matching, `waitForURL`) have the same gap and are unused by the one spec this task
    // requires to pass on-device; give them the same treatment if a later task needs them.
    const rawGoto = page.goto.bind(page);
    page.goto = (async (url: string, options?: Parameters<Page['goto']>[1]) =>
      rawGoto(baseURL ? new URL(url, baseURL).toString() : url, options)) as Page['goto'];

    await use(page);
    await page.close().catch(() => {});
  },
});

export const test = process.env.PW_REAL_DEVICE === '1' ? realDeviceTest : base;
export { expect };
