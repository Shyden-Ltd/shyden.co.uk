import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { recorded, shoot } from './evidence';
import { THEMES, themeColour } from '../palette';
import { expectTheme } from '../themes';
import { atLeast44 } from '../viewport';
import { LOCALES, getSiteStrings, localisePath } from '../../src/lib/i18n';

test.use(recorded);

/**
 * The switch, rendered (#142 §6.3). The project's device prefers dark, so a
 * page with no saved choice shows Aurora, and a test that needs another
 * device says so with `test.use({ colorScheme })`.
 */

const SWITCH = 'header [data-theme-toggle]';
const toggle = (page: Page) => page.locator(SWITCH);

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

test.describe('the switch (#142 §5, AC3)', () => {
  for (const locale of LOCALES) {
    test(`${locale}: a toggle button named in its own language, pressed while dark`, async ({
      page,
    }) => {
      const name = getSiteStrings(locale).themeDarkMode;
      await page.goto(localisePath('/', locale));
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await button.click();
      await expectTheme(page, 'light');
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await shoot(
        page,
        `${locale}: "${name}" pressed off, and the page is light`,
        button,
      );
    });
  }

  test('is 44 × 44, with a visible focus ring', async ({ page }) => {
    await page.goto('/');
    await expect(toggle(page)).toBeVisible();
    await atLeast44(toggle(page), 'the theme switch');
    // A keypress first, so the focus below is keyboard focus to every
    // engine's :focus-visible heuristic.
    await page.keyboard.press('Shift');
    await toggle(page).focus();
    await expect(toggle(page)).toHaveCSS('outline-style', 'solid');
    await expect(toggle(page)).toHaveCSS('outline-width', '3px');
    await shoot(
      page,
      'the switch focused: its ring is the accent',
      toggle(page),
    );
  });

  test('Enter and Space each toggle it', async ({ page }) => {
    await page.goto('/');
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expectTheme(page, 'light');
    await page.keyboard.press('Space');
    await expectTheme(page, 'dark');
  });

  test('switches instantly: the next frame already paints the new ground', async ({
    page,
  }) => {
    await page.goto('/');
    await expectTheme(page, 'dark');
    const next = await toggle(page).evaluate(
      (button) =>
        new Promise<string>((resolve) => {
          (button as HTMLElement).click();
          requestAnimationFrame(() =>
            resolve(getComputedStyle(document.documentElement).backgroundColor),
          );
        }),
    );
    expect(next).toBe(themeColour('light', '--bg'));
  });

  test('does not print', async ({ page }) => {
    await page.goto('/');
    await expect(toggle(page)).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(toggle(page)).toHaveCount(1);
    await expect(toggle(page)).toBeHidden();
  });

  test('under forced colours, its icon draws in the system text colour (Review Focus 4)', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Playwright emulates forcedColors in Chromium alone',
    );
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/');
    const drawn = await toggle(page).evaluate((button) => ({
      ink: getComputedStyle(button).color,
      paints: [...button.querySelectorAll('svg')]
        .filter((svg) => svg.getClientRects().length > 0)
        .flatMap((svg) => [...svg.querySelectorAll('circle, path')])
        .map((shape) => {
          const style = getComputedStyle(shape);
          return style.fill === 'none' ? style.stroke : style.fill;
        }),
    }));
    expect(
      drawn.paints.length,
      'the visible icon draws something',
    ).toBeGreaterThan(0);
    expect([...new Set(drawn.paints)]).toEqual([drawn.ink]);
  });
});

test.describe('without JavaScript (#142 AC7)', () => {
  test.use({ javaScriptEnabled: false });

  for (const theme of THEMES) {
    test.describe(`on a device preferring ${theme}`, () => {
      test.use({ colorScheme: theme });

      test(
        'the switch is absent, and the device setting applies',
        { tag: '@requires-isolated-context' },
        async ({ page }) => {
          await page.goto('/');
          await expectTheme(page, theme);
          await expect(toggle(page)).toHaveCount(1);
          await expect(toggle(page)).toBeHidden();
          await expect(toggle(page)).not.toHaveAttribute('aria-pressed', /./);
        },
      );
    });
  }
});
