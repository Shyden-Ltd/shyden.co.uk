import { describe, it, expect } from 'vitest';
import { pageNames } from '../site-pages';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, PREFIXED_LOCALES, localisePath } from '../../src/lib/i18n';
import { withoutTsComments } from './source-text';
import { nonEmpty } from '../source-files';

/**
 * #21 Stage 4. Adding a locale must not mean writing routes by hand.
 *
 * Every prefixed locale used to need its own directory of `.astro` files —
 * `src/pages/id/index.astro`, `id/glory-points.astro`, `id/classroom-groups
 * .astro`, each a two-line wrapper around the same page component. Adding
 * `zh`, `vi` and `th` that way is nine more files, and the failure mode is
 * silent: forget one and that locale simply 404s on that page, with nothing
 * in the suite to say so.
 *
 * The route is now `src/pages/[locale]/…`, generated from PREFIXED_LOCALES by
 * `getStaticPaths`. LOCALES is the single source the ticket asks for, and
 * these tests are what stop a hand-written directory coming back.
 *
 * Every list below is DERIVED — from the filesystem for pages, from LOCALES
 * for locales. This repo's own lesson: "a hand-written list of things to
 * check will miss the one that breaks" (CLAUDE.md), which is exactly how
 * `#cg-io-toggle` shipped 74px of horizontal scroll.
 */

const PAGES_DIR = 'src/pages';
const LOCALE_ROUTE = join(PAGES_DIR, '[locale]');

describe('every locale is routed from LOCALES, not from a directory per locale', () => {
  it('serves the default locale from the unprefixed routes', () => {
    expect(pageNames()).toContain('index');
  });

  it('serves every other locale from ONE dynamic route per page', () => {
    const dynamic = nonEmpty(
      readdirSync(LOCALE_ROUTE)
        .filter((n) => n.endsWith('.astro'))
        .map((n) => n.replace(/\.astro$/, ''))
        .sort(),
      `dynamic locale routes in ${LOCALE_ROUTE}`,
    );
    expect(
      dynamic,
      'a page served at / with no [locale] twin 404s in every other language',
    ).toEqual(pageNames());
  });

  it('has no hand-written directory for any locale', () => {
    // The thing being retired. A literal `src/pages/id/` shadows the dynamic
    // route for that one locale, so it keeps working while a NEW locale
    // silently does not — the hardest version of this bug to see.
    for (const locale of LOCALES) {
      expect(
        existsSync(join(PAGES_DIR, locale)),
        `src/pages/${locale}/ is a hand-written route directory — the ` +
          '[locale] route generates it from PREFIXED_LOCALES',
      ).toBe(false);
    }
  });

  it('generates its paths from PREFIXED_LOCALES, not from a literal list', () => {
    for (const route of pageNames()) {
      const src = readFileSync(join(LOCALE_ROUTE, `${route}.astro`), 'utf8');
      expect(src, `${route}.astro`).toContain('PREFIXED_LOCALES');
      expect(src, `${route}.astro has no getStaticPaths`).toContain(
        'getStaticPaths',
      );
    }
  });
});

/**
 * The post-deploy gates must DERIVE their routes, never list them. #49.
 *
 * `tests/dev/dev-sanity.spec.ts` gates `dev-verified`, which is a required
 * status on main's branch protection — the mechanical stop between develop and
 * production. Its route list was hand-written, so when #22 took the site from
 * six routes to fifteen, nine of them were never requested from the deployed
 * host and the gate went green anyway. `tests/prod/prod-sanity.spec.ts` had
 * the identical defect in two places.
 *
 * It had already happened once before that, and BOTH files carried a comment
 * saying so ("a build that dropped the locale would deploy green"). It was
 * fixed each time by extending the list, which is why it kept recurring. This
 * is what stops the third recurrence: adding a locale-prefixed literal back to
 * either gate fails here.
 *
 * DERIVED THREE TIMES OVER, because a guard against hardcoded lists must not
 * contain one: the files come from the filesystem, the locale prefixes from
 * PREFIXED_LOCALES, and the emptiness of the result is what is asserted.
 */
const gateSpecs = () =>
  ['tests/dev', 'tests/prod'].flatMap((dir) =>
    nonEmpty(
      readdirSync(dir)
        .filter((f) => f.endsWith('.spec.ts'))
        .map((f) => join(dir, f)),
      `gate specs in ${dir}`,
    ),
  );

describe('the post-deploy gates derive their routes', () => {
  it('has gate specs to check', () => {
    // Without this the loop below is vacuous if the directories are ever
    // renamed: no files, no matches, green.
    expect(gateSpecs().length).toBeGreaterThan(1);
  });

  it('hardcodes no locale-prefixed route in any deploy gate', () => {
    const pattern = new RegExp(
      `['"\`]/(?:${PREFIXED_LOCALES.join('|')})/`,
      'g',
    );
    for (const file of gateSpecs()) {
      const found = [
        ...withoutTsComments(readFileSync(file, 'utf8')).matchAll(pattern),
      ].map((m) => m[0]);
      expect(
        found,
        `${file} hardcodes a locale-prefixed path. Derive it from LOCALES ` +
          `and localisePath instead — a hand-written list stops covering new ` +
          `locales silently, and this gate is what stands between develop and ` +
          `production`,
      ).toEqual([]);
    }
  });
});

/**
 * The production smoke fetches every route the site serves. #57.
 *
 * `release-prod.yml` loops over a HAND-WRITTEN path list, and its own comment
 * records why that list exists: the release of 2026-08-12 rebuilt the
 * Classroom Group Creator from nothing, and the smoke would have passed with
 * that page 404ing because it only ever fetched two URLs. The list was then
 * extended by hand -- and extended again for each locale, which is how the
 * comment came to say "in BOTH languages" while the site serves five.
 *
 * That is the #49 defect in the third gate. The dev and prod SANITY suites now
 * derive their routes; this list still cannot, because it is a shell loop in
 * YAML with no access to the catalogue.
 *
 * So the list stays hand-written and is made UNABLE TO GO STALE instead: a
 * sixth locale fails here until the workflow is updated. The runtime behaviour
 * of a release workflow is deliberately not touched -- it executes only on a
 * promotion, so a mistake in it would surface at release time, in front of the
 * one action nobody wants to retry.
 */
const PROD_SMOKE_WORKFLOW = '.github/workflows/release-prod.yml';

/** The paths the prod smoke loop actually iterates, comments stripped. */
function prodSmokePaths(): string[] {
  const body = readFileSync(PROD_SMOKE_WORKFLOW, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  const loop = /for path in ([^;]+); do/.exec(body);
  return loop ? loop[1].trim().split(/\s+/).sort() : [];
}

describe('the production smoke covers every route', () => {
  it('finds the smoke loop at all', () => {
    // Without this the comparison below is vacuous the day someone rewrites
    // the loop: no match, empty list, and an empty expectation would agree.
    expect(
      prodSmokePaths().length,
      `no \`for path in ...; do\` loop found in ${PROD_SMOKE_WORKFLOW} -- if it ` +
        'was restructured, this guard must be taught the new shape rather than deleted',
    ).toBeGreaterThan(0);
  });

  it('smokes every route except the homepage, which is checked separately', () => {
    // `/` is fetched BEFORE the loop and asserted far harder -- 200, contains
    // "shyden", prod ShyTalk link present, dev link absent, real company
    // number -- so it is excluded here rather than duplicated.
    const expected = LOCALES.flatMap((locale) =>
      ['/', '/glory-points', '/classroom-groups'].map((page) =>
        localisePath(page, locale),
      ),
    )
      .filter((path) => path !== '/')
      .sort();

    expect(
      prodSmokePaths(),
      'the prod smoke path list has drifted from LOCALES. It is hand-written ' +
        'because it is a shell loop, so adding a locale means editing ' +
        `${PROD_SMOKE_WORKFLOW} by hand -- this is the failure that makes you do it`,
    ).toEqual(expected);
  });
});
