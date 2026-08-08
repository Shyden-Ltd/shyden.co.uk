import {
  test as base,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type APIRequestContext,
} from '@playwright/test';

const CDP_URL = process.env.ANDROID_CDP_URL ?? 'http://127.0.0.1:9222';

/** HTTP-verb methods this suite wraps on `page.request` (== `context.request`; see below). */
const REQUEST_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'] as const;

function relativeLiteralCallPattern(apiPath: string): RegExp {
  // Matches `<apiPath>(`, then a string/template-literal delimiter whose very next character
  // is `/` or `.` -- i.e. a relative-looking literal, with no whitespace tolerated between the
  // call and its first argument's opening delimiter (that would read as a different call
  // shape). A regex-literal argument (e.g. `toHaveURL(/foo/)`) never opens with a quote
  // character, so this cannot mistake it for a URL string.
  const escaped = apiPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\(\\s*(['"\`])(\\/|\\.)`, 'g');
}

/**
 * Every Playwright API this suite reaches for whose behaviour depends on
 * `browserContext._options.baseURL` -- confirmed by reading Playwright's own source, not
 * assumed: `page.goto`, `page.request.*` and `expect(page).toHaveURL(string)` all read exactly
 * that field (`toHaveURL`: `const baseURL = page.context()._options.baseURL`, in
 * playwright/lib/matchers/expect.js). It is empty for the device's adopted context -- see the
 * `context`/`page` fixtures below -- because that context was never created through
 * `newContext({ baseURL })`.
 *
 * `resolved: true` means the fixtures below patch it, so a relative literal is safe on-device.
 * `resolved: false` means they do not, so `tests/e2e/baseurl-guard.spec.ts` fails on a relative
 * literal, naming this row's `api`, rather than the gap surfacing later as a confusing
 * device-only failure with no signpost. This is the single source of truth for both the
 * patches and the guard: add a row here when you add a patch (or when you add a new
 * baseURL-aware call the fixtures do *not* patch), and the two cannot drift apart.
 */
export const BASE_URL_AWARE_APIS: ReadonlyArray<{
  readonly api: string;
  readonly pattern: RegExp;
  readonly resolved: boolean;
  readonly reason: string;
}> = [
  {
    api: 'page.goto',
    pattern: relativeLiteralCallPattern('page.goto'),
    resolved: true,
    reason: 'the page fixture resolves the URL against baseURL before calling the real goto',
  },
  ...REQUEST_METHODS.map((method) => ({
    api: `page.request.${method}`,
    pattern: relativeLiteralCallPattern(`page.request.${method}`),
    resolved: true,
    reason:
      'the page fixture resolves string URL arguments against baseURL before calling the ' +
      'real method',
  })),
  ...REQUEST_METHODS.map((method) => ({
    api: `context.request.${method}`,
    pattern: relativeLiteralCallPattern(`context.request.${method}`),
    resolved: true,
    reason:
      "page.request and context.request are the same APIRequestContext instance (Playwright's " +
      'own docs: "page.request ... returns the same instance as browserContext.request"), so ' +
      'patching page.request resolves this call shape too',
  })),
  {
    api: 'page.route',
    pattern: relativeLiteralCallPattern('page.route'),
    resolved: false,
    reason:
      'not patched -- a glob starting with `**` (the one existing call site) matches the ' +
      'absolute URL regardless of baseURL and so is never flagged, but a plain relative path ' +
      'would not resolve the same way',
  },
  {
    api: 'context.route',
    pattern: relativeLiteralCallPattern('context.route'),
    resolved: false,
    reason: 'not patched, same gap as page.route',
  },
  {
    api: 'page.waitForURL',
    pattern: relativeLiteralCallPattern('page.waitForURL'),
    resolved: false,
    reason: 'not patched -- no current call site, but reads context baseURL the same way goto does',
  },
  {
    api: 'page.waitForRequest',
    pattern: relativeLiteralCallPattern('page.waitForRequest'),
    resolved: false,
    reason: 'not patched -- no current call site',
  },
  {
    api: 'page.waitForResponse',
    pattern: relativeLiteralCallPattern('page.waitForResponse'),
    resolved: false,
    reason: 'not patched -- no current call site',
  },
  {
    api: 'toHaveURL',
    pattern: relativeLiteralCallPattern('toHaveURL'),
    resolved: false,
    reason:
      'not patched -- existing call sites all pass a regex, which never consults baseURL, so ' +
      'they are unaffected; a future call passing a plain relative string would read the same ' +
      'empty context baseURL that goto does',
  },
];

// Marks an APIRequestContext whose methods this module has already wrapped. `page.request` is
// the same long-lived, context-scoped object on every test in the worker (unlike `page`
// itself, which context.newPage() recreates fresh each test), so without this guard every test
// would wrap the previous test's wrapper again, nesting deeper each time.
const REQUEST_PATCHED = Symbol('shyden-baseurl-request-patch');

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
    const rawGoto = page.goto.bind(page);
    page.goto = (async (url: string, options?: Parameters<Page['goto']>[1]) =>
      rawGoto(baseURL ? new URL(url, baseURL).toString() : url, options)) as Page['goto'];

    // `page.request` has the identical gap, for the identical reason. Wrapped generically
    // over REQUEST_METHODS -- rather than seven hand-written near-duplicates -- so
    // BASE_URL_AWARE_APIS above and the patch loop below cannot silently drift apart: adding a
    // method to one without the other is either a dead guard row or an unlisted patch, not a
    // quiet gap. `fetch`'s first argument can be a Request object (from route interception),
    // not only a URL string, so only string arguments are resolved.
    //
    // BASE_URL_AWARE_APIS documents every other baseURL-aware API this suite could reach for
    // (`page.route`, `waitForURL`/`waitForRequest`/`waitForResponse`, `toHaveURL`). None is
    // patched -- none is currently called with a relative literal either (verified: see
    // BASE_URL_AWARE_APIS's `reason` fields) -- so a relative literal reaching any of them
    // would misbehave on-device exactly as goto did before this fixture existed.
    // tests/e2e/baseurl-guard.spec.ts fails the build the moment one is added, rather than
    // leaving it to be found as a confusing device-only failure.
    const request = page.request as APIRequestContext & { [REQUEST_PATCHED]?: true };
    if (!request[REQUEST_PATCHED]) {
      // Every wrapped method has the same (url, options?) shape at the JS level even though
      // their TS signatures differ enough (get/post/.../head take `url: string`; fetch takes
      // `urlOrRequest: string | Request`) that a generic loop can't satisfy all seven at once.
      // `loose` is the one deliberately-untyped seam, scoped to just this loop.
      const loose = request as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      for (const method of REQUEST_METHODS) {
        const original = loose[method].bind(request);
        loose[method] = (urlOrRequest: unknown, options?: unknown) =>
          original(
            baseURL && typeof urlOrRequest === 'string'
              ? new URL(urlOrRequest, baseURL).toString()
              : urlOrRequest,
            options,
          );
      }
      request[REQUEST_PATCHED] = true;
    }

    await use(page);
    await page.close().catch(() => {});
  },
});

export const test = process.env.PW_REAL_DEVICE === '1' ? realDeviceTest : base;
export { expect };
