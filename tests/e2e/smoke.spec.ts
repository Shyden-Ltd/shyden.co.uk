import { test, expect } from './fixtures';

test('homepage responds with the Shyden title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Shyden/);
});
