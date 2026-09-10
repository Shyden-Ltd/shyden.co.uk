import { describe, it, expect } from 'vitest';
import { pageNames } from '../site-pages';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, PREFIXED_LOCALES } from '../../src/lib/i18n';
import { withoutTsComments, withoutMarkupComments } from './source-text';
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
      // Comments stripped BOTH ways before matching: an `.astro` file is
      // TypeScript frontmatter plus markup, and a line of either kind
      // mentioning `PREFIXED_LOCALES` would satisfy a raw `toContain` after
      // the real derivation had been replaced by a literal list -- which is
      // the exact thing this test exists to forbid (#98).
      const src = withoutMarkupComments(
        withoutTsComments(
          readFileSync(join(LOCALE_ROUTE, `${route}.astro`), 'utf8'),
        ),
      );
      // ANCHORED to a USE, not to the word. Stripping removes one way of
      // faking this; it still passes on a file that imports the constant and
      // then ignores it, which is the same bug wearing an import. The claim
      // is that the paths are GENERATED from it, so assert a call on it.
      expect(
        /PREFIXED_LOCALES\s*\.\s*\w+\(/.test(src),
        `${route}.astro mentions PREFIXED_LOCALES but never calls anything ` +
          'on it — the paths are not generated from it',
      ).toBe(true);
      expect(
        /^export function getStaticPaths\(/m.test(src),
        `${route}.astro has no getStaticPaths export`,
      ).toBe(true);
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
 * The production smoke's own page coverage is NOT guarded here.
 *
 * It was, in a `describe('the production smoke covers every route')` that
 * built its expectation from `LOCALES` and a hand-written
 * `['/', '/glory-points', '/classroom-groups']` — inside a guard whose stated
 * purpose was to make a hand-written list unable to go stale. It could catch a
 * sixth locale and was blind to a fourth page.
 *
 * `pipeline-wiring.test.ts`'s `the prod smoke covers every page in every
 * locale` asserts the same invariant and derives BOTH axes, so it is strictly
 * stronger and is now the one home for it (#89). Two guards on one invariant,
 * one of them weaker, is how the weaker one comes to be the only one anybody
 * edits.
 */
