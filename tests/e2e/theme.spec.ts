import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { shoot } from './evidence';
import { themeColour } from '../palette';
import { expectTheme } from '../themes';

/**
 * The switch, rendered (#142 §6.3). The project's device prefers dark, so a
 * page with no saved choice shows Aurora, and a test that needs another
 * device says so with `test.use({ colorScheme })`.
 */

/**
 * Record the ground of the first frame that paints one, from an init script,
 * before the page's own scripts run. Until the stylesheet applies, the ground
 * is the UA's transparent. The first frame with a ground is the frame a flash
 * would show in.
 */
const recordFirstGround = (page: Page) =>
  page.addInitScript(() => {
    const read = () => {
      const ground = getComputedStyle(document.documentElement).backgroundColor;
      if (ground === 'rgba(0, 0, 0, 0)') requestAnimationFrame(read);
      else document.documentElement.dataset.firstGround = ground;
    };
    requestAnimationFrame(read);
  });

test.describe('no flash of the other theme (#142 §6.3, AC5)', () => {
  for (const [saved, device] of [
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const) {
    test.describe(`a saved ${saved} choice on a device preferring ${device}`, () => {
      test.use({ colorScheme: device });

      test('the first frame that paints a ground paints the saved theme', async ({
        page,
      }) => {
        await page.goto('/glory-points');
        await expectTheme(page, device);
        await page.evaluate(
          (theme) => localStorage.setItem('theme', theme),
          saved,
        );
        await recordFirstGround(page);
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute(
          'data-first-ground',
          themeColour(saved, '--bg'),
        );
        await expectTheme(page, saved);
        await shoot(
          page,
          `a saved ${saved} choice on a ${device} device: the first painted frame is already ${saved}`,
        );
      });
    });
  }
});

test.describe('a saved value that is not exactly light or dark (Review Focus 1)', () => {
  test.use({ colorScheme: 'light' });

  test('is ignored, and the device setting applies', async ({ page }) => {
    await page.goto('/');
    for (const stale of ['Dark', ' dark', 'dark\n', '"dark"', 'auto', '']) {
      await page.evaluate(
        (value) => localStorage.setItem('theme', value),
        stale,
      );
      await page.reload();
      await expectTheme(page, 'light');
      await expect(
        page.locator('html'),
        `${JSON.stringify(stale)} stamped nothing`,
      ).not.toHaveAttribute('data-theme', /./);
    }
  });
});
