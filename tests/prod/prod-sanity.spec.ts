import { test, expect } from '@playwright/test';
import { LOCALES } from '../../src/lib/i18n/index';
import { deployedRoutes } from '../site-pages';

/**
 * Every route the site serves, derived. #49.
 *
 * Both lists below were hand-written `/id/*` triples, and each carried a
 * comment saying a dropped locale would deploy green -- which is what happened
 * the moment #22 added zh, vi and th: nine routes, never requested here, while
 * the gate stayed green. Extending the list by hand is how it broke the first
 * time, so it is derived now and a sixth language is covered the day it joins
 * LOCALES. The PAGE axis stayed hand-written until #89 — three literals, so a
 * fourth page was smoked by curl in release-prod.yml and never rendered in a
 * browser here. Both axes are derived now.
 */
const ROUTES = deployedRoutes();

/**
 * Production, verified in a real browser before `prod-verified` is posted.
 *
 * Every check here is one the previous `curl` smoke could not make. curl proved
 * that bytes arrived with a 200 and that certain strings were among them. It
 * could not tell whether the stylesheet loaded, whether the calculators' script
 * ran, or whether the page fits the screen — and this repo has shipped, for a
 * whole release, a bug that only geometry could see.
 *
 * So the rule for this file: if `curl` could already prove it, it does not
 * belong here. Status codes and page inventory stay in the smoke; this suite
 * asserts things that require rendering.
 *
 * Deliberately does NOT assert homepage copy. The wording is being replaced,
 * and a release gate that fails because marketing text changed teaches everyone
 * to ignore it.
 */

test('the homepage renders, and its stylesheet actually applied', async ({
  page,
}) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toBeVisible();

  // A deploy that drops or 404s the CSS still returns 200 with all its text
  // intact — curl cannot tell the difference. The rendered background can:
  // unstyled, it is the browser default (transparent/white).
  const background = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(background).not.toBe('rgba(0, 0, 0, 0)');
  expect(background).not.toBe('');
});

test('the Glory Points calculator computes, not just loads', async ({
  page,
}) => {
  await page.goto('/glory-points');
  await expect(page.locator('#glory-input')).toBeVisible();

  // The script is what makes this a calculator rather than a form. If the
  // bundle 404s after a partial deploy, the page still serves 200 and still
  // contains every label — and this is where that shows.
  await page.fill('#glory-input', '1000');
  await page.click('#glory-submit');

  await expect(page.locator('#glory-result')).toBeVisible();
  await expect(page.locator('#glory-result')).not.toBeEmpty();
  await expect(page.locator('#glory-error')).toBeHidden();
});

test('the Classroom Group Creator forms groups', async ({ page }) => {
  await page.goto('/classroom-groups');
  await expect(page.locator('#cg-form')).toBeVisible();

  await page.fill('#cg-count', '8');
  await page.fill('#cg-size', '4');
  await page.locator('#cg-sound-toggle').click();
  await page.selectOption('#cg-speed', 'skip');
  await page.click('#cg-go');

  await expect(page.locator('#cg-results .student')).toHaveCount(8);
});

// Geometry, which no text assertion can reach. `#cg-io-toggle`'s intrinsic
// minimum once propagated up a grid whose items default to `min-width: auto`
// and pinned a track wide enough to force 74px of horizontal scroll at 320px —
// while every text-based test stayed green.
//
// 320px because that is the narrowest viewport the working agreement supports.
test.describe('no page scrolls sideways at 320px', () => {
  for (const { path } of ROUTES) {
    test(
      `${path} fits a 320px viewport`,
      { tag: '@emulated-viewport' },
      async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 720 });
        await page.goto(path);
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(
          overflow,
          `${path} overflows by ${overflow}px`,
        ).toBeLessThanOrEqual(0);
      },
    );
  }
});

test('every locale the site claims to serve is live, and in that language', async ({
  page,
}) => {
  // The original note here said a heading assertion must not be able to redden
  // a release gate, because the COPY is changing and a hand-written table of
  // headings would drift from it. That concern is answered rather than
  // overridden: the expectation comes from the SAME catalogue the page renders
  // from, so a copy change updates both in one commit and cannot drift.
  //
  // What it cannot catch on its own is a catalogue left as English -- it would
  // agree with itself. The comparison against the English string is the
  // independent half, so the two cannot fail together silently.
  for (const { locale, path, heading, englishHeading } of ROUTES) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} did not return 200`).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('h1')).toContainText(heading);
    if (locale !== 'en') {
      await expect(page.locator('h1')).not.toHaveText(englishHeading);
    }
  }
});

test('the outbound ShyTalk link points at PROD ShyTalk, never dev', async ({
  page,
}) => {
  // The mirror of dev-sanity's cross-env check. The URL is env-derived
  // (PUBLIC_SHYTALK_URL) precisely so the two environments never cross, and a
  // production page sending visitors to a dev host is a leak, not a typo.
  await page.goto('/');
  const shytalk = page.locator('a[href*="shytalk"]').first();
  await expect(shytalk).toHaveCount(1);

  const href = await shytalk.getAttribute('href');
  expect(href, 'no ShyTalk link found on the production homepage').toBeTruthy();
  expect(href).toContain('shytalk.shyden.co.uk');
  expect(href).not.toContain('dev.shytalk');
});
