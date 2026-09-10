import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Task 3: `site` set for canonical/OG URL resolution.
// Task 7: sitemap integration generates sitemap-index.xml at build time.
// devToolbar disabled: it is dev-only UI whose late async insertion causes
// reflow flakiness in E2E measurements and never ships to production.
export default defineConfig({
  site: 'https://shyden.co.uk',
  // English stays unprefixed (/) and Indonesian lives under /id/. Both are
  // real built pages so both are indexed and both land in the sitemap —
  // a client-side text swap would leave the Indonesian version invisible to
  // search and impossible to link to directly.
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'id'],
    routing: { prefixDefaultLocale: false },
  },
  // @astrojs/sitemap reads its OWN i18n option and does not inherit the
  // routing config above, so without this the sitemap listed six <loc>
  // entries and zero xhtml:link alternates — declaring no relationship
  // between the English and Indonesian versions of the same page.
  //
  // WRITTEN OUT because this file runs under plain Node and cannot import
  // src/lib/i18n. That duplication is the whole hazard: it said en+id for
  // weeks after #22 shipped five languages, so nine of fifteen URLs declared
  // NO alternates at all while the guard — which also named en and id by hand
  // — passed. Two hand-written lists agreeing with each other is not a check.
  // The values are LOCALE_METADATA's `ogLocale` with `_` as `-`, and
  // tests/unit/sitemap-config.test.ts asserts this map against that table, so
  // the seam is checked even though the import cannot be. See #108.
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en-GB',
          id: 'id-ID',
          zh: 'zh-CN',
          vi: 'vi-VN',
          th: 'th-TH',
        },
      },
    }),
  ],
  devToolbar: { enabled: false },
});
