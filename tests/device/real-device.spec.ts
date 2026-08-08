import { execFileSync } from 'node:child_process';
import { test, expect } from '../e2e/fixtures';

test('the suite is running on the real phone, not an emulated profile', async ({ page }) => {
  await page.goto('/classroom-groups');

  const browserSide = await page.evaluate(() => ({
    ua: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints,
    dpr: devicePixelRatio,
    cssWidth: innerWidth,
  }));

  // What the device itself says its screen is -- adb cannot be fooled by an emulated profile.
  const size = execFileSync('adb', ['shell', 'wm', 'size']).toString();
  const density = execFileSync('adb', ['shell', 'wm', 'density']).toString();
  const physicalWidth = Number(/(\d+)x\d+/.exec(size)![1]);
  const physicalDensity = Number(/(\d+)\s*$/.exec(density.trim())![1]);

  expect(browserSide.ua).toContain('Android');
  expect(browserSide.touchPoints).toBeGreaterThan(0);
  // dpr is density/160 on Android, and CSS width is the physical width divided by it.
  expect(browserSide.dpr).toBeCloseTo(physicalDensity / 160, 2);
  expect(browserSide.cssWidth).toBeCloseTo(physicalWidth / browserSide.dpr, 0);
});
