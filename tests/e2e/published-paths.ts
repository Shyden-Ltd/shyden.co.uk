import { expect, type Page } from '@playwright/test';

/**
 * Every page the site publishes, read from the built sitemap rather than
 * listed here — a new page is covered the day it is added, without anyone
 * remembering to come back and add it. The 404 is appended because it is
 * deliberately absent from the sitemap.
 *
 * One home for the list: `rendered-text.spec.ts` kept it privately until
 * `head-and-sitemap.spec.ts` needed the same pages (#233).
 */
export async function publishedPaths(page: Page): Promise<string[]> {
  const xml = await (await page.request.get('/sitemap-0.xml')).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => new URL(m[1]).pathname,
  );
  expect(paths.length).toBeGreaterThan(0); // an empty sitemap must not pass
  return [...paths, '/definitely-not-a-page'];
}
