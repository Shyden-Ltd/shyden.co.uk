import {
  test as base,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
import { ensureChromeForegroundOrRecover } from '../device/chrome-foreground';

const CDP_URL = process.env.ANDROID_CDP_URL ?? 'http://127.0.0.1:9222';

/** HTTP-verb methods this suite wraps on `page.request` (== `context.request`; see below). */
const REQUEST_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'fetch',
] as const;

// Matches a literal's opening content that `new URL(literal, base)` -- the mechanism every API
// below actually resolves through (`resolveBaseURL` in playwright-core's coreBundle.js) --
// treats as *already absolute*: a URL scheme (`https:`, `about:`, ...) or a protocol-relative
// `//`. Anything else, including a bare word with no leading slash at all, is relative and
// resolves against baseURL identically to a leading-slash path -- `'login'` and `'/login'` are
// the same case to `new URL()`. An earlier version of this pattern checked for a leading `/` or
// `.` instead, which is the wrong test: it would have missed exactly the bare-word shape it
// exists to catch.
const ABSOLUTE_URL_LOOKAHEAD = '(?:[a-zA-Z][a-zA-Z\\d+.-]*:|//)';

function relativeLiteralCallPattern(
  apiPath: string,
  extraAbsolutePrefix?: string,
): RegExp {
  // Matches `<apiPath>(`, then a string/template-literal delimiter, with no whitespace
  // tolerated between the call and the delimiter (that would read as a different call shape),
  // asserting via lookahead that what follows is NOT absolute. A regex-literal argument (e.g.
  // `toHaveURL(/foo/)`) never opens with a quote character, so the mandatory delimiter capture
  // cannot mistake it for a URL string.
  const escaped = apiPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const absolute = extraAbsolutePrefix
    ? `(?:${ABSOLUTE_URL_LOOKAHEAD}|${extraAbsolutePrefix})`
    : ABSOLUTE_URL_LOOKAHEAD;
  return new RegExp(`\\b${escaped}\\(\\s*(['"\`])(?!${absolute})`, 'g');
}

function bareIdentifierCallPattern(identifier: string, method: string): RegExp {
  // For the bare `request` fixture: unlike relativeLiteralCallPattern, this must NOT match a
  // property-access chain ending in the same identifier -- `page.request.get(` and
  // `context.request.get(` are already their own rows below and must not double-count here.
  // The negative lookbehind requires `identifier` not be immediately preceded by a dot, i.e.
  // it must appear as the bare fixture parameter, not a property of something else.
  const escapedMethod = method.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?<!\\.)\\b${identifier}\\.${escapedMethod}\\(\\s*(['"\`])(?!${ABSOLUTE_URL_LOOKAHEAD})`,
    'g',
  );
}

/**
 * Every Playwright API this suite reaches for whose behaviour depends on `baseURL` -- confirmed
 * by reading Playwright's own source, not assumed: `page.goto`, `page.request.*`,
 * `expect(page).toHaveURL(string)` and `page.route`'s glob matching all read
 * `browserContext._options.baseURL`, empty for the device's adopted context (see the
 * `context`/`page` fixtures below, which were never created through `newContext({ baseURL })`).
 * The bare `request` fixture is the one exception -- Playwright builds it via
 * `playwright.request.newContext()` (`playwright/lib/index.js`), independently of any
 * `browser`/`context` override, so it does not automatically share the adopted context's gap;
 * see its own row for the mechanism and the on-device measurement that confirmed it.
 *
 * `resolved: true` means a relative literal is safe on-device, whether because the fixtures
 * below patch it or because it was measured to already work through its own mechanism.
 * `resolved: false` means `tests/e2e/baseurl-guard.spec.ts` fails on a relative literal, naming
 * this row's `api`, rather than the gap surfacing later as a confusing device-only failure with
 * no signpost. This is the single source of truth for the patches and the guard together: add a
 * row here whenever this suite starts calling a new baseURL-aware API, and the two cannot drift
 * apart -- an unlisted API is invisible to both.
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
    reason:
      'the page fixture resolves the URL against baseURL before calling the real goto',
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
  ...REQUEST_METHODS.map((method) => ({
    api: `request.${method} (bare fixture)`,
    pattern: bareIdentifierCallPattern('request', method),
    resolved: true,
    reason:
      "measured directly on the physical device (tests/device/real-device.spec.ts's " +
      '"the bare request fixture..." test): Playwright builds the `request` fixture via ' +
      '`playwright.request.newContext()` (playwright/lib/index.js), a construction path ' +
      "independent of this file's `browser`/`context` overrides entirely, and it resolved a " +
      'relative literal correctly with no patch from this file',
  })),
  {
    api: 'page.route',
    pattern: relativeLiteralCallPattern('page.route', '\\*'),
    resolved: false,
    reason:
      'not patched -- a glob starting with `*` (the one existing call site starts `**`) skips ' +
      'baseURL resolution entirely (`resolveGlobBase`\'s own `!match.startsWith("*")` check in ' +
      'coreBundle.js), which is why this pattern exempts that shape too; a glob NOT starting ' +
      'with `*` goes through the same resolveBaseURL joining as goto and would not resolve',
  },
  {
    api: 'context.route',
    pattern: relativeLiteralCallPattern('context.route', '\\*'),
    resolved: false,
    reason: 'not patched, same gap and same `*`-prefix exemption as page.route',
  },
  {
    api: 'page.waitForURL',
    pattern: relativeLiteralCallPattern('page.waitForURL'),
    resolved: false,
    reason:
      'not patched -- no current call site, but reads context baseURL the same way goto does',
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

// Structural subset of Playwright's own `Disposable` (playwright-core/types/types.d.ts) --
// returned by `context.addInitScript`/`page.addInitScript`. Declared locally rather than
// imported: `@playwright/test`'s re-export chain (-> `playwright/test` -> `playwright-core`)
// does not surface the type under that name at the package's own top level, and the two-method
// shape this file actually uses is not worth chasing an import path for.
interface InitScriptDisposable {
  dispose(): Promise<void>;
}

/** Guards the one-time `context.addInitScript` patch below, same role and same reasoning as REQUEST_PATCHED. */
const INIT_SCRIPT_PATCHED = Symbol('shyden-context-addinitscript-patch');

/**
 * Reassigned to a fresh array at the TOP of every test's `context` fixture invocation (below)
 * and drained at the bottom of the same invocation -- the patched `context.addInitScript`
 * (installed once, the first time any test needs it) always pushes into whichever array is
 * current, so each test's own disposals stay its own even though the patch itself is installed
 * only once. Safe as plain module state, not fixture-threaded: real-device runs are always
 * `workers: 1`, `fullyParallel: false` (playwright.device.config.ts's own comment: "One phone,
 * one shared context, one localStorage origin"), so exactly one test's array is ever live.
 */
let currentTestInitScriptDisposals: InitScriptDisposable[] = [];

/**
 * Every fixture below that needs `baseURL` calls this instead of trusting it -- a bare `!`
 * assertion crashes with a generic, unnamed "Cannot read properties of undefined" if it is
 * ever wrong, and silently falling back to the unresolved URL (what the `goto`/`request`
 * patches did before this fix) reproduces the exact confusing device-only failure this whole
 * file exists to prevent, just one level further downstream and with no signpost pointing back
 * at the real cause. One named assertion, used everywhere, is the file's own "assert the end
 * state, name the cause" standard applied to itself.
 */
function requireBaseURL(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error(
      'Real device fixtures need `use.baseURL` set (playwright.device.config.ts sets it to ' +
        'http://localhost:4321) -- without it there is nothing to resolve a relative URL ' +
        'against, and Chrome rejects a bare relative string outright.',
    );
  }
  return baseURL;
}

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
    if (!context)
      throw new Error('Real device exposed no browser context over CDP.');

    const resolvedBaseURL = requireBaseURL(baseURL);
    const scratch = await context.newPage();
    const cdp = await context.newCDPSession(scratch);
    await cdp.send('Storage.clearDataForOrigin', {
      origin: new URL(resolvedBaseURL).origin,
      storageTypes: 'all',
    });
    await cdp.detach();
    await scratch.close();
    await context.clearCookies();

    // Fresh bucket for THIS test -- see currentTestInitScriptDisposals's own comment for why
    // plain module state is safe here.
    currentTestInitScriptDisposals = [];
    const patchable = context as BrowserContext & {
      [INIT_SCRIPT_PATCHED]?: true;
    };
    if (!patchable[INIT_SCRIPT_PATCHED]) {
      // `context.addInitScript` is a real Playwright API that returns a `Disposable`
      // specifically so a caller can undo it (playwright-core's types.d.ts: "Disposable ...
      // returned ... to allow undoing the corresponding action" / "removes the init script").
      // No desktop test in this suite has ever needed to call `.dispose()` because Playwright
      // hands every desktop test a brand-new context -- the init script dies with it, for
      // free. The real device has exactly ONE adopted context for the WHOLE run
      // (`browser.newContext()` is unsupported -- see the `browser` fixture above), so without
      // this, an init script registered by one test has no supported way to be scoped to just
      // that test: it silently keeps running on every later test's page for the rest of the
      // run. Measured, not theorised -- reproduced live, in total isolation from the other
      // ~174 tests: running classroom-groups-privacy.spec.ts's "a mid-module failure still
      // cannot leak the class list" test (registers a context.addInitScript that makes
      // `matchMedia` throw) immediately before either "the tool still makes groups" (same
      // file) or "the mute choice survives a reload" (a DIFFERENT file, 18 tests later in a
      // full run) reproduces that later test's exact full-run failure signature with nothing
      // else involved. Disposing every init script a test added, the instant that test ends,
      // is what a fresh desktop context gives every desktop test for free -- see
      // docs/superpowers/specs/2026-08-08-real-device-test-harness-design.md for the design
      // this fixture implements.
      const rawAddInitScript = context.addInitScript.bind(context) as (
        script: unknown,
        arg?: unknown,
      ) => Promise<InitScriptDisposable>;
      // Deliberately loosely typed, scoped to just this wrapper (mirrors the `request` patch
      // below): `addInitScript`'s generic `Arg` parameter does not survive being re-wrapped
      // through `Parameters<>`/`ReturnType<>` utility types cleanly, and the two shapes this
      // suite actually calls (a zero-arg function; a function with one plain-object arg) do
      // not need that generic to be preserved to stay correct at the JS level.
      context.addInitScript = (async (script: unknown, arg?: unknown) => {
        const disposable = await rawAddInitScript(script, arg);
        currentTestInitScriptDisposals.push(disposable);
        return disposable;
      }) as BrowserContext['addInitScript'];
      patchable[INIT_SCRIPT_PATCHED] = true;
    }

    await use(context);

    // Undo every init script THIS test added -- see the patch comment above. Order does not
    // matter: each disposal only ever removes its own script.
    for (const disposable of currentTestInitScriptDisposals.splice(0)) {
      await disposable.dispose().catch(() => {});
    }

    // Leave the context open -- it belongs to the device, not to the test.
    for (const page of context.pages()) await page.close().catch(() => {});
  },

  page: async ({ context, baseURL }, use, testInfo) => {
    // Chrome losing foreground mid-run is a real, observed failure mode (147 failed / 62
    // failed in otherwise-clean runs -- see tests/device/chrome-foreground.ts's own module
    // comment for the evidence and the design doc for the full trail).
    // android-preflight.setup.ts's own precondition 3 only confirms this ONCE, before the run
    // starts; this is the re-check, once per test, BEFORE that test's own actions begin, so no
    // test ever knowingly runs against the wrong foreground app. Cheap (median ~68ms,
    // measured) when Chrome already holds it, which is every test except a genuine
    // interruption.
    await ensureChromeForegroundOrRecover(testInfo.title);

    const page = await context.newPage();
    const resolvedBaseURL = requireBaseURL(baseURL);

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
      rawGoto(
        new URL(url, resolvedBaseURL).toString(),
        options,
      )) as Page['goto'];

    // `page.request` has the identical gap, for the identical reason. Wrapped generically
    // over REQUEST_METHODS -- rather than seven hand-written near-duplicates -- so
    // BASE_URL_AWARE_APIS above and the patch loop below cannot silently drift apart: adding a
    // method to one without the other is either a dead guard row or an unlisted patch, not a
    // quiet gap. `fetch`'s first argument can be a Request object (from route interception),
    // not only a URL string, so only string arguments are resolved.
    //
    // BASE_URL_AWARE_APIS documents every other baseURL-aware API this suite could reach for
    // (the bare `request` fixture, `page.route`, `waitForURL`/`waitForRequest`/
    // `waitForResponse`, `toHaveURL`). Some are proven safe by their own mechanism, some are
    // not patched here and not currently called with a relative literal either (verified: see
    // BASE_URL_AWARE_APIS's `reason` fields) -- so a relative literal reaching any row marked
    // `resolved: false` would misbehave on-device exactly as goto did before this fixture
    // existed. tests/e2e/baseurl-guard.spec.ts fails the build the moment one is added, rather
    // than leaving it to be found as a confusing device-only failure.
    const request = page.request as APIRequestContext & {
      [REQUEST_PATCHED]?: true;
    };
    if (!request[REQUEST_PATCHED]) {
      // Every wrapped method has the same (url, options?) shape at the JS level even though
      // their TS signatures differ enough (get/post/.../head take `url: string`; fetch takes
      // `urlOrRequest: string | Request`) that a generic loop can't satisfy all seven at once.
      // `loose` is the one deliberately-untyped seam, scoped to just this loop.
      const loose = request as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      for (const method of REQUEST_METHODS) {
        const original = loose[method].bind(request);
        loose[method] = (urlOrRequest: unknown, options?: unknown) =>
          original(
            typeof urlOrRequest === 'string'
              ? new URL(urlOrRequest, resolvedBaseURL).toString()
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
