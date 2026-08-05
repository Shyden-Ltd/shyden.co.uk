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
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'en', locales: { en: 'en-GB', id: 'id-ID' } },
    }),
  ],
  devToolbar: { enabled: false },
});
