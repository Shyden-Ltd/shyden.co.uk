import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Task 3: `site` set for canonical/OG URL resolution.
// Task 7: sitemap integration generates sitemap-index.xml at build time.
// devToolbar disabled: it is dev-only UI whose late async insertion causes
// reflow flakiness in E2E measurements and never ships to production.
export default defineConfig({
  site: 'https://shyden.co.uk',
  integrations: [sitemap()],
  devToolbar: { enabled: false },
});
