import { test, expect, type Page } from '@playwright/test';

/**
 * A live region only reports mutations to something already in the
 * accessibility tree. `hidden` takes an element out of that tree, so writing
 * the text and revealing the element afterwards mutates nothing anyone is
 * listening to — NVDA, JAWS and VoiceOver commonly say nothing at all when a
 * region appears already-populated. The visitor presses the button and hears
 * silence, whether it worked or not.
 *
 * That ordering is invisible in the finished DOM: both sequences end in the
 * same state. So these tests record the operations as the page performs them.
 *
 * Recorded by wrapping the two setters on the elements themselves — the real
 * accessors are still called, so the page behaves exactly as it ships. The
 * obvious alternative, a MutationObserver, is not usable here: its callback
 * is a microtask that runs after every synchronous mutation in the batch, so
 * reading `hidden` inside it reports the END state for every record and a
 * reversed order looks identical. That version of this test passed against
 * the defect it was written for.
 */
const recordOperations = (page: Page) =>
  page.addInitScript(() => {
    (window as Window & { __ops?: string[] }).__ops = [];
    const log = (entry: string) =>
      (window as Window & { __ops?: string[] }).__ops?.push(entry);

    const hidden = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'hidden',
    )!;
    const text = Object.getOwnPropertyDescriptor(
      Node.prototype,
      'textContent',
    )!;

    document.addEventListener('DOMContentLoaded', () => {
      for (const id of ['cg-error', 'cg-results', 'cg-summary']) {
        const el = document.getElementById(id);
        if (!el) continue;
        Object.defineProperty(el, 'hidden', {
          configurable: true,
          get() {
            return hidden.get!.call(this);
          },
          set(value: boolean) {
            log(`${id}:${value ? 'hide' : 'show'}`);
            hidden.set!.call(this, value);
          },
        });
        Object.defineProperty(el, 'textContent', {
          configurable: true,
          get() {
            return text.get!.call(this);
          },
          set(value: string) {
            log(`${id}:write`);
            text.set!.call(this, value);
          },
        });
      }
    });
  });

const opsFor = async (page: Page, id: string) =>
  (
    await page.evaluate(
      () => (window as Window & { __ops?: string[] }).__ops ?? [],
    )
  )
    .filter((op) => op.startsWith(`${id}:`))
    .map((op) => op.slice(id.length + 1));

test.describe('screen-reader announcements', () => {
  test.beforeEach(async ({ page }) => {
    await recordOperations(page);
  });

  test('an error joins the page before it is written, so it is announced', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.fill('#cg-count', '0');
    await page.click('#cg-go');
    await expect(page.locator('#cg-error')).toBeVisible();

    // Cleared, revealed, then written. The write is the mutation a live
    // region reports, so it has to come last.
    expect(await opsFor(page, 'cg-error')).toEqual(['hide', 'show', 'write']);
  });

  test('the summary joins the page before it is written', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.fill('#cg-count', '8');
    await page.fill('#cg-size', '4');
    // #cg-speed sits inside #cg-sound-body since Stage 2, Task 7. This
    // click is on #cg-sound-toggle, an element `recordOperations` above
    // never instruments (it only wraps cg-error/cg-results/cg-summary), so
    // opening the section here cannot add a spurious entry to `__ops`.
    await page.locator('#cg-sound-toggle').click();
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');
    await expect(page.locator('#cg-summary')).toHaveText(
      '2 groups from 8 students.',
    );

    const results = await opsFor(page, 'cg-results');
    const summary = await opsFor(page, 'cg-summary');
    expect(results).toEqual(['show']);
    expect(summary).toEqual(['write']);

    // And in that order across the two elements.
    const all = await page.evaluate(
      () => (window as Window & { __ops?: string[] }).__ops ?? [],
    );
    expect(all.indexOf('cg-summary:write')).toBeGreaterThan(
      all.indexOf('cg-results:show'),
    );
  });

  test('the announced region is the summary, not the whole result', async ({
    page,
  }) => {
    // Announcing the section would read every group and every child aloud on
    // every shuffle. The summary says how it turned out; the detail is there
    // to be read at the visitor's own pace.
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-summary')).toHaveAttribute('role', 'status');
    await expect(page.locator('#cg-results')).not.toHaveAttribute(
      'aria-live',
      /.*/,
    );
  });
});
