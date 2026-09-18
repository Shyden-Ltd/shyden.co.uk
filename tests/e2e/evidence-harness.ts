import type { Page } from '@playwright/test';
import type { StandInWindow, WriteOrder } from './db-stand-in';
import { test as base } from './fixtures';
import { recordErrors } from './recorders';

/**
 * What every evidence-page spec shares: the origin a rendered page is served
 * from, the fixture that fails a test when the page script throws, and the
 * store's counters. One home, so the sign-off spec (#172) and the review
 * viewer spec (#205) cannot drift apart in how a page is served or judged.
 */

export const ORIGIN = 'https://evidence.test';

/**
 * A real 1x1 PNG, so no capture on a fixture page is a broken image.
 *
 * Every chunk's CRC is correct, and that is the whole point of this comment.
 * The bytes here until #205 were the 1x1 PNG that circulates everywhere, and
 * its IDAT CRC is WRONG: Chromium and WebKit decode it anyway, Firefox
 * refuses it, so every capture on every fixture page was a broken image in
 * one engine of five. Nothing caught it for as long as no test asked whether
 * a capture had actually DECODED -- the sign-off specs only ever asked what
 * the page said. It surfaced the moment Approve had to wait for the picture.
 * Regenerate with a CRC check, never by pasting a pixel found elsewhere.
 */
export const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAgLvRWwAAAABJRU5ErkJggg==';

export const WRITE_ORDERS: ReadonlyArray<{ order: WriteOrder; when: string }> =
  [
    {
      order: 'resolve-then-confirm',
      when: 'a write resolves before its confirmed snapshot arrives',
    },
    {
      order: 'confirm-then-resolve',
      when: 'a confirmed snapshot arrives before its write resolves',
    },
  ];

/**
 * Every test also fails if the page script throws. In strict mode a write
 * into a frozen snapshot is a TypeError, so this names that mistake outright.
 */
export const evidenceTest = base.extend<{ pageErrors: void }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors = recordErrors(page);
      await use();
      await errors.expectNoUncaught(
        'the evidence page script threw while it was driven',
      );
    },
    { auto: true },
  ],
});

/** A file served beside the page, answered only once `until` settles when given. */
export interface ServedFile {
  contentType: string;
  body: Buffer;
  until?: Promise<void>;
}

/**
 * Serves the page as the builder rendered it, the files a publish would carry
 * beside it, and nothing from any other host.
 */
export async function serveEvidencePage(
  page: Page,
  html: string,
  files: Readonly<Record<string, ServedFile>> = {},
): Promise<void> {
  await page.route(/^https:\/\/evidence\.test\//, async (route) => {
    const url = route.request().url();
    if (url === `${ORIGIN}/`)
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: html,
      });
    const file = files[url.slice(ORIGIN.length + 1)];
    if (!file) return route.fulfill({ status: 204 });
    await file.until;
    return route.fulfill({ contentType: file.contentType, body: file.body });
  });
  // The builder links Google Fonts. Nothing in these suites reaches a third party.
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
}

export const counters = (page: Page) =>
  page.evaluate(() => {
    const standIn = (window as StandInWindow).__dbStandIn;
    return {
      writes: standIn.writes(),
      inflight: standIn.inflight(),
      deliveries: standIn.deliveries(),
    };
  });
