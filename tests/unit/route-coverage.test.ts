import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '../../src/lib/i18n';

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

/**
 * The site's pages, read off the routes that serve the default locale.
 *
 * `404.astro` is excluded: it is Cloudflare's not-found document, served at
 * one URL for the whole site, and there is no `/id/404` to match it.
 */
const pageRoutes = (): string[] =>
  readdirSync(PAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.astro'))
    .map((e) => e.name.replace(/\.astro$/, ''))
    .filter((n) => n !== '404')
    .sort();

describe('every locale is routed from LOCALES, not from a directory per locale', () => {
  it('serves the default locale from the unprefixed routes', () => {
    expect(pageRoutes().length).toBeGreaterThan(0);
    expect(pageRoutes()).toContain('index');
  });

  it('serves every other locale from ONE dynamic route per page', () => {
    const dynamic = readdirSync(LOCALE_ROUTE)
      .filter((n) => n.endsWith('.astro'))
      .map((n) => n.replace(/\.astro$/, ''))
      .sort();
    expect(
      dynamic,
      'a page served at / with no [locale] twin 404s in every other language',
    ).toEqual(pageRoutes());
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
    for (const route of pageRoutes()) {
      const src = readFileSync(join(LOCALE_ROUTE, `${route}.astro`), 'utf8');
      expect(src, `${route}.astro`).toContain('PREFIXED_LOCALES');
      expect(src, `${route}.astro has no getStaticPaths`).toContain(
        'getStaticPaths',
      );
    }
  });
});
