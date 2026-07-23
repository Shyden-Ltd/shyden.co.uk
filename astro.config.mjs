import { defineConfig } from 'astro/config';

// Task 3: `site` set for canonical/OG URL resolution.
// The sitemap integration is added in Task 7.
// devToolbar disabled: it is dev-only UI whose late async insertion causes
// reflow flakiness in E2E measurements and never ships to production.
export default defineConfig({
  site: 'https://shyden.co.uk',
  devToolbar: { enabled: false },
});
