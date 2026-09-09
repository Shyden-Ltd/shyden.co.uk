import { readdirSync } from 'node:fs';

const PAGES_DIR = 'src/pages';

/**
 * The site's pages, read off the routes that serve the default locale.
 *
 * `404.astro` is excluded: it is Cloudflare's not-found document, served at
 * one URL for the whole site, and there is no `/id/404` to match it.
 *
 * Derived, never listed. `route-coverage.test.ts` already did this privately
 * while `locale-routing.test.ts` and `thai-typography.spec.ts` wrote the same
 * three pages out by hand — so adding a fourth page left the hand-written
 * pair silently asserting nothing about it (#68).
 */
export const pageNames = (): string[] =>
  readdirSync(PAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.astro'))
    .map((entry) => entry.name.replace(/\.astro$/, ''))
    .filter((name) => name !== '404')

    .sort();

/** The same pages as request paths in the default locale: `index` is `/`. */
export const sitePaths = (): string[] =>
  pageNames().map((name) => (name === 'index' ? '/' : `/${name}`));
