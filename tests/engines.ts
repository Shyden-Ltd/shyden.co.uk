/**
 * The five engines every browser suite renders on: the e2e suite and, since
 * #350, the Functions suite. One list, so a sixth is added once.
 */
export const ENGINES = [
  { name: 'chromium', device: 'Desktop Chrome' },
  { name: 'firefox', device: 'Desktop Firefox' },
  { name: 'webkit', device: 'Desktop Safari' },
  { name: 'mobile-chrome', device: 'Pixel 5' },
  { name: 'mobile-safari', device: 'iPhone 13' },
] as const;
