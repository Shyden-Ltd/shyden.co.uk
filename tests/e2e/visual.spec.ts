import { test, expect } from './fixtures';

/**
 * What a 100% green suite cannot see (#33).
 *
 * Every other assertion in this corpus reads the DOM: text, structure,
 * geometry, measured layout. All of it stays true while the page turns
 * visibly wrong -- a font weight shifts, a colour drifts, a decorative image
 * stops painting, two elements that both still exist at their asserted sizes
 * start overlapping. Those ship past a green run, and one of them did, for a
 * whole release (see the `display: flex` note in CLAUDE.md).
 *
 * Screenshots are the only assertion that sees them, and they are also the
 * assertion most likely to be switched off in a week. So the determinism is
 * engineered BEFORE the baselines exist, not patched in after the first
 * flake:
 *
 *  - animations and transitions are disabled, and the caret hidden, from
 *    `expect.toHaveScreenshot` in the config, so no call site can forget;
 *  - `document.fonts.ready` is awaited, because a font that arrives one frame
 *    late re-flows every line of text on the page and is otherwise a coin
 *    toss between runs;
 *  - the footer's copyright line is MASKED. It is built from
 *    `new Date().getFullYear()`, so an unmasked baseline silently fails on
 *    1 January for no change to any code;
 *  - `scale: 'css'` pins the device-pixel ratio, so a HiDPI runner and a
 *    normal one produce comparable images.
 *
 * The widths live here rather than in the config's device list because they
 * are the thing being asserted: this suite exists to see what a phone-width
 * layout does, and a viewport declared three files away is a fact about the
 * test that its reader cannot check.
 */

/** The four the ticket names: both languages, and both tools. */
const PAGES = [
  { name: 'home-en', path: '/' },
  { name: 'home-id', path: '/id/' },
  { name: 'glory-points', path: '/glory-points' },
  { name: 'classroom-groups', path: '/classroom-groups' },
] as const;

const WIDTHS = [
  { label: 'desktop', viewport: { width: 1280, height: 900 } },
  { label: 'mobile', viewport: { width: 390, height: 844 } },
] as const;

for (const { label, viewport } of WIDTHS) {
  test.describe(`${label} @${viewport.width}px`, () => {
    test.use({ viewport });

    for (const { name, path } of PAGES) {
      test(`${name} renders the same pixels`, async ({ page }) => {
        await page.goto(path);
        // The heading is the last thing to settle on the two tool pages,
        // whose scripts rewrite the DOM after load. On the homepage, which
        // ships no JavaScript at all, it is already there and this returns
        // immediately.
        await expect(page.locator('h1').first()).toBeVisible();
        // Awaited INSIDE the callback, not returned from it.
        // `document.fonts.ready` resolves with the FontFaceSet itself, which
        // is not serialisable across the protocol -- returning it makes
        // Playwright try to marshal a live object back to Node.
        await page.evaluate(async () => {
          await document.fonts.ready;
        });

        await expect(page).toHaveScreenshot(`${name}-${label}.png`, {
          fullPage: true,
          mask: [page.locator('p.disclosure')],
        });
      });
    }
  });
}
