import { defineConfig, devices } from '@playwright/test';

/**
 * Specs that assert HTTP responses and DOM text, and never render.
 *
 * A sitemap's URLs, a canonical tag, whether two words come out touching:
 * `textContent` is spec-defined, so these bytes do not vary by engine. Running
 * them on all five projects cost four extra runs each and returned nothing the
 * first run had not already proven.
 *
 * The boundary is mechanical, not editorial -- a spec is content-only exactly
 * when it never drives the viewport -- so it is enforced rather than trusted:
 * tests/unit/browser-matrix.test.ts fails if anything listed here calls
 * `setViewportSize` or carries `@emulated-viewport`, if a name here stops
 * matching a real file, or if any engine project stops ignoring these.
 *
 * `site-meta.spec.ts` is deliberately NOT here. It mixes three content
 * assertions with a parameterised 404 layout test that does resize, and the
 * layout half has to keep running everywhere.
 */
export const CONTENT_ONLY_SPECS = [
  'head-and-sitemap.spec.ts',
  'seo.spec.ts',
  'baseurl-guard.spec.ts',
  'rendered-text.spec.ts',
  'locale-parity.spec.ts',
];

const contentOnly = new RegExp(
  `(?:${CONTENT_ONLY_SPECS.map((s) => s.replace(/\./g, '\\.')).join('|')})$`,
);

const ENGINES = [
  { name: 'chromium', device: 'Desktop Chrome' },
  { name: 'firefox', device: 'Desktop Firefox' },
  { name: 'webkit', device: 'Desktop Safari' },
  { name: 'mobile-chrome', device: 'Pixel 5' },
  { name: 'mobile-safari', device: 'iPhone 13' },
] as const;

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
  use: {
    baseURL: 'http://localhost:4321',
    // #44. A test that times out inside `page.goto` leaves ONE LINE of text
    // behind, and the run is gone: `retries` is 0 and nothing is kept. Two
    // occurrences have now been reasoned about from a stack trace and a
    // memory of what the test does.
    //
    // The measured distribution says this is not load — mobile-safari's max
    // sits around 10-11.6s against a 30s budget across runs, and the failing
    // test never appears in the slowest three. So the next occurrence needs
    // to be diagnosable, not re-argued.
    //
    // `retain-on-failure`, not `on`: a trace per test across ~2200 tests is
    // hundreds of megabytes of artefact for runs that told us nothing. This
    // costs nothing on a green run.
    trace: 'retain-on-failure',
  },
  projects: [
    // Bytes and DOM text are identical on every engine, so running these five
    // times bought four repeats of a result the first run already had. Once is
    // enough. See CONTENT_ONLY_SPECS.
    {
      name: 'content',
      use: { ...devices['Desktop Chrome'] },
      testMatch: contentOnly,
    },
    // Everything that renders, on every engine it has to render on. A collapsed
    // nav wrapper once pushed the header links off-screen and only a real
    // engine could see it -- this half of the matrix is not negotiable.
    ...ENGINES.map(({ name, device }) => ({
      name,
      use: { ...devices[device] },
      testIgnore: contentOnly,
    })),
  ],
});
