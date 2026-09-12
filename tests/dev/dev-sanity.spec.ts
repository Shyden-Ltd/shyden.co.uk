import { test, expect } from '@playwright/test';
import {
  LOCALES,
  localisePath,
  getStrings,
  isBetaLocale,
} from '../../src/lib/i18n/index';
import { deployedRoutes } from '../site-pages';
import { searched } from '../source-files';

// Runs against the REAL deployed dev site behind Basic auth. baseURL +
// httpCredentials are supplied by playwright.dev.config.ts (env-driven).
const BASE = process.env.WEB_BASE_URL ?? 'https://dev.shyden.co.uk';

test('dev homepage loads behind Basic auth', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toBeVisible();
});

test('the Glory Points calculator loads on dev', async ({ page }) => {
  const res = await page.goto('/glory-points');
  expect(res?.status()).toBe(200);
  await expect(page.locator('#glory-input')).toBeVisible();
});

test('the Classroom Group Creator loads on dev', async ({ page }) => {
  const res = await page.goto('/classroom-groups');
  expect(res?.status()).toBe(200);
  await expect(page.locator('#cg-form')).toBeVisible();
  // The script is what makes this page a tool rather than a form that leaks.
  // If the bundle 404s after a partial deploy, this is where it shows.
  await page.fill('#cg-count', '8');
  await page.fill('#cg-size', '4');
  // #cg-speed sits inside #cg-sound-body since Stage 2, Task 7.
  await page.locator('#cg-sound-toggle').click();
  await page.selectOption('#cg-speed', 'skip');
  await page.click('#cg-go');
  await expect(page.locator('#cg-results .student')).toHaveCount(8);
});

/**
 * Every locale the site CLAIMS to serve is actually on the deployed host.
 *
 * This block used to be a hand-written list of three `/id/*` paths, and its own
 * comment recorded that the same gap had already happened once: "Half the
 * routes on this site are /id/* and none of them were checked here." It was
 * fixed by extending the list, so it broke again the moment #22 added zh, vi
 * and th — nine routes, the entire point of that ticket, never requested from
 * the deployed site while `dev-verified` went green anyway. See #49.
 *
 * `dev-verified` is a REQUIRED status on main's branch protection. It is the
 * gate between develop and production, so a list that silently stops covering
 * new routes is not a coverage gap, it is a gate that stopped gating.
 *
 * DERIVED ON BOTH AXES, so a sixth language is covered the day it joins
 * LOCALES and a fourth page the day it appears under `src/pages/` — nobody has
 * to remember this file. The page axis was hand-written until #89, which is
 * how a new page could be smoked by curl and never rendered in a browser. The expected heading comes from the same
 * catalogue the page renders from, which closes the "second hand-written
 * table" drift but opens a smaller hole: a catalogue accidentally left as
 * English would agree with itself and pass. The differs-from-English check
 * below is the independent half.
 */
const ROUTES = deployedRoutes();

/**
 * How many BETA badges every deployed page must carry, in every locale.
 *
 * Each unverified language is marked exactly once -- in the switcher's control
 * when it is the language being read, in its list when it is an alternative --
 * so the total is the size of the beta set and does not vary by page or by
 * locale. An EXACT count, never "at least one": a marker painted on
 * everything, English included, satisfies any weaker check while telling the
 * visitor nothing.
 */
const BETA_BADGES = LOCALES.filter(isBetaLocale).length;

test.describe('every locale the site claims to serve is deployed', () => {
  for (const { locale, path, heading, englishHeading } of ROUTES) {
    test(`${path} is served in ${locale}`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} did not return 200`).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('h1')).toContainText(heading);

      if (locale !== 'en') {
        // Independent of the catalogue above: a build that fell back to
        // English would still match its own strings if the catalogue were the
        // thing that regressed. This asserts against the ENGLISH copy instead,
        // so the two checks cannot fail together silently.
        await expect(page.locator('h1')).not.toHaveText(englishHeading);
      }

      // #102. `dev-verified` proved the marker was BUILT and that wrangler did
      // not error -- not that the deployed site serves it. Asserted on THIS
      // page load rather than in a loop of its own, so full locale x page
      // coverage costs no extra navigation.
      //
      // The status assertion above is load-bearing here: a failed request
      // yields an empty document, and an empty document contains zero badges,
      // which is indistinguishable from the marker having been removed. Counted
      // only after the page is known to be a real 200.
      await expect(
        page.locator('[data-beta]'),
        `${path}: expected one BETA badge per unverified locale`,
      ).toHaveCount(BETA_BADGES);
      await expect(
        page.locator('[data-beta-notice]'),
        `${path}: ${locale === 'en' ? 'English is verified and must carry no notice' : 'the beta notice is missing'}`,
      ).toHaveCount(isBetaLocale(locale) ? 1 : 0);
    });
  }
});

test('robots.txt disallows all crawling on the dev site', async ({
  request,
}) => {
  // Served before the auth gate, so this holds with or without creds.
  const body = await (await request.get('/robots.txt')).text();
  expect(body).toContain('Disallow: /');
});

test('an unauthenticated request is challenged with 401', async () => {
  // Raw fetch — NOT a Playwright request context, which would inherit the
  // config's httpCredentials and silently authenticate (making this pass a
  // 200 as if unchallenged). fetch sends no Authorization header, so this
  // genuinely exercises the no-credentials path.
  const res = await fetch(`${BASE}/`, { redirect: 'manual' });
  expect(res.status).toBe(401);
  expect(res.headers.get('www-authenticate')).toMatch(/^Basic realm=/);
});

const DEV_SHYTALK_HOST = 'dev.shytalk.shyden.co.uk';

test('every outbound ShyTalk link points at DEV ShyTalk, never prod (no cross-env leak)', async ({
  page,
}) => {
  // The dev build injects PUBLIC_SHYTALK_URL=dev, so EVERY outbound ShyTalk
  // link must resolve to the dev host.
  //
  // DERIVED, not pinned to a count. This read `toHaveCount(1)` on the dev URL,
  // because when it was written the only outbound link sat on a work card. The
  // Aurora merge added a hero call-to-action, the count became 2, and the guard
  // reddened the dev deploy on a legitimate design change (run 34678649630).
  //
  // Worse than the false red: `toHaveCount(0)` on the PROD url — the assertion
  // that actually protects against a cross-env leak — NEVER RAN. Playwright
  // stops a test at its first failed expectation, so the guard failed on its
  // liveness proxy while its real invariant went unmeasured. A count is a proxy
  // for "the links are right"; asserting the hosts measures it directly, and
  // cannot be broken by adding or removing a button.
  await page.goto('/');

  const hosts = await page
    .locator('a[href*="shytalk.shyden.co.uk"]')
    .evaluateAll((els) =>
      els.map((el) => new URL((el as HTMLAnchorElement).href).host),
    );

  // `searched()` carries the LIVENESS CONTROL, and it is the repo's recognised
  // idiom rather than a hand-rolled one (#118). The assertion is an ABSENCE, so
  // a page carrying no outbound ShyTalk link would satisfy it having measured
  // nothing. Putting the population inside the assertion makes that impossible,
  // and `searched` counts its members by CONTENT, not by entries — an array of
  // empty strings is not a population.
  //
  // A hand-written `expect(hosts.length).toBeGreaterThan(0)` above this was
  // equivalent in spirit and INVISIBLE to `absence-liveness.test.ts`, which
  // flagged this line. The fix is to adopt the idiom, never to widen the
  // detector so one's own code slips past it.
  const wrongHost = hosts.filter((host) => host !== DEV_SHYTALK_HOST);
  expect(
    searched(wrongHost, {
      of: hosts,
      what: 'outbound ShyTalk links on the dev homepage',
    }),
    `every outbound ShyTalk link on a dev build must point at ${DEV_SHYTALK_HOST}; found ${JSON.stringify(wrongHost)} across ${hosts.length} link(s)`,
  ).toEqual([]);
});

/**
 * The v2 surfaces, on the deployed dev site.
 *
 * Dev is the MERGE GATE now, so this suite is what stands between a broken
 * build and `main`. It stays a smoke, not a second copy of the e2e suite:
 * each of these asks only "did this part of the tool arrive at all", which is
 * the question a deploy can answer wrongly. Behaviour is proven by the 2036
 * e2e tests that already ran before the deploy.
 */
test.describe('the Classroom Group Creator v2 surfaces reached dev', () => {
  test('Student details builds a roster', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-students-toggle').click();
    await page.getByRole('button', { name: /Add student/ }).click();
    await expect(page.locator('.cg-student')).toHaveCount(1);
    // The roster's own controls, not just a row: a partial bundle can render
    // the table and wire nothing.
    await expect(
      page.locator('.cg-student').first().getByLabel('Name'),
    ).toBeVisible();
  });

  test('Import / export offers its controls', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-io-toggle').click();
    await expect(
      page.getByRole('button', { name: 'Export class list' }),
    ).toBeVisible();
    await expect(page.locator('#cg-import')).toBeVisible();
  });

  test('the print panel and the projector are reachable once groups exist', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.fill('#cg-count', '8');
    await page.fill('#cg-size', '4');
    await page.locator('#cg-sound-toggle').click();
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .group').first()).toBeVisible();

    await page.getByRole('button', { name: 'Print' }).click();
    await expect(page.locator('#cg-print-panel')).toBeVisible();
    await page
      .locator('#cg-print-panel')
      .getByRole('button', { name: 'Cancel' })
      .click();

    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board')).toBeVisible();
    await expect(page.locator('#cg-board #cg-results')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cg-board')).toBeHidden();
  });

  // Was one test against `/id/classroom-groups` asserting the literal string
  // 'Ekspor daftar kelas' -- a hand-written copy expectation that could drift
  // from the catalogue, covering one of the four translated locales. Both the
  // path and the expected label are derived now, so this checks that each
  // locale's TOOL, not just its page shell, carries its own copy. #49.
  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    test(`the ${locale} tool carries its own copy`, async ({ page }) => {
      await page.goto(localisePath('/classroom-groups', locale));
      await page.locator('#cg-io-toggle').click();
      await expect(
        page.getByRole('button', {
          name: getStrings(locale).ioExportClassList,
        }),
      ).toBeVisible();
    });
  }
});
