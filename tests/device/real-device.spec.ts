import { execFileSync } from 'node:child_process';
import { test, expect } from '../e2e/fixtures';

test('the suite is running on the real phone, not an emulated profile', async ({
  page,
}) => {
  await page.goto('/classroom-groups');

  const browserSide = await page.evaluate(() => ({
    ua: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints,
    dpr: devicePixelRatio,
    cssWidth: innerWidth,
  }));

  // What the device itself says its screen is -- adb cannot be fooled by an emulated profile.
  // Both lines take the LAST `WxH`/number match after trimming, not the first: `wm density` on
  // this hardware prints both `Physical density: 640` and `Override density: 560`, and the
  // override -- the one the browser actually renders at -- is always the second line when
  // present. `wm size` prints only `Physical size: ...` on this device (no observed override),
  // so the same "last match wins" rule is a no-op there today, but stays ready for a device
  // that does print an `Override size` line, the same way `wm density` already does. Using
  // "first match" on one and "last match" on the other -- the original shape of this file --
  // would silently take the wrong value the day a size override appears.
  const size = execFileSync('adb', ['shell', 'wm', 'size']).toString();
  const density = execFileSync('adb', ['shell', 'wm', 'density']).toString();
  const physicalWidth = Number(/(\d+)x\d+\s*$/.exec(size.trim())![1]);
  const physicalDensity = Number(/(\d+)\s*$/.exec(density.trim())![1]);

  expect(browserSide.ua).toContain('Android');
  expect(browserSide.touchPoints).toBeGreaterThan(0);
  // dpr is density/160 on Android, and CSS width is the physical width divided by it.
  expect(browserSide.dpr).toBeCloseTo(physicalDensity / 160, 2);
  expect(browserSide.cssWidth).toBeCloseTo(physicalWidth / browserSide.dpr, 0);
});

test('the bare request fixture resolves a relative URL against baseURL, on the real device', async ({
  request,
}) => {
  // Playwright builds this fixture via `playwright.request.newContext()`
  // (playwright/lib/index.js), a construction path independent of this suite's `browser`/
  // `context` overrides in tests/e2e/fixtures.ts -- so, unlike `page.goto`/`page.request.*`,
  // there was no a priori reason to expect it shared the adopted context's empty-baseURL gap.
  // This is the on-device measurement that settles it rather than assuming it from the source
  // trace alone: see BASE_URL_AWARE_APIS's `request.<method> (bare fixture)` rows for the
  // recorded result.
  const res = await request.get('/sitemap-0.xml');
  expect(
    res.ok(),
    `expected the bare \`request\` fixture to resolve '/sitemap-0.xml' against baseURL and ` +
      `return 2xx on-device -- got HTTP ${res.status()}`,
  ).toBe(true);

  const body = await res.text();
  // The exact string head-and-sitemap.spec.ts already asserts on the emulated path, so a match
  // here is real sitemap content for a real page, not an empty or unrelated body.
  expect(
    body,
    'expected a <loc> entry for a known page in the sitemap body, not an empty or unrelated response',
  ).toContain('<loc>https://shyden.co.uk/classroom-groups/</loc>');
});

test.describe('per-test isolation actually isolates state across back-to-back tests', () => {
  // Order matters and a failed setup half makes the isolation half meaningless to run, so this
  // pair is explicit about both: serial execution, and proving the write landed before trusting
  // the next test's absence-check.
  test.describe.configure({ mode: 'serial' });

  const PROBE_KEY = 'shyden-isolation-probe';
  const PROBE_VALUE = 'leaked-if-you-can-read-this-in-the-next-test';

  test('writes a distinctive localStorage value and a form field (setup half of the pair)', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');

    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: PROBE_KEY,
      value: PROBE_VALUE,
    });
    // Confirm the write actually landed before the next test trusts its absence -- an "empty"
    // assertion is worthless as proof of clearing if nothing was ever proven present to clear.
    const written = await page.evaluate(
      (key) => localStorage.getItem(key),
      PROBE_KEY,
    );
    expect(
      written,
      'expected the probe value to be readable back in the same test that wrote it, before ' +
        'the next test can meaningfully assert its absence',
    ).toBe(PROBE_VALUE);

    await page.locator('#cg-class').fill('ISOLATION-PROBE-CLASS-NAME');
    await expect(page.locator('#cg-class')).toHaveValue(
      'ISOLATION-PROBE-CLASS-NAME',
    );
  });

  test('starts with no trace of the previous test (isolation half of the pair)', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');

    const leaked = await page.evaluate(
      (key) => localStorage.getItem(key),
      PROBE_KEY,
    );
    expect(
      leaked,
      "expected localStorage to be empty at the start of this test -- the context fixture's " +
        "Storage.clearDataForOrigin call between tests did not clear the previous test's " +
        'value, which means the one-shared-context isolation mechanism this whole device ' +
        'harness depends on does not actually isolate',
    ).toBeNull();

    // #cg-class is never written to or read from storage -- src/scripts/classroom-groups.ts's
    // own privacy-promise comment and ClassroomGroupsPage.astro's section-11 copy both say so,
    // and grepping the script confirms `cg-class` never touches the `remember` localStorage
    // wrapper. A fresh page load therefore guarantees this field is empty regardless of
    // whether storage cleared correctly -- checked because it was asked for, but it is not
    // evidence of the storage-isolation mechanism the way the localStorage assertion above is.
    await expect(page.locator('#cg-class')).toHaveValue('');
  });
});
