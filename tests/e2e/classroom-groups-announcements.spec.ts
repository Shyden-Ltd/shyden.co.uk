import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { recorded, shoot } from './evidence';

test.use(recorded);

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
      // Named three, then DERIVED. A hand-written list is the shape that let
      // `#cg-io-toggle` slip past the no-scroll tests for months: a region
      // added later is silently uninstrumented, and an ordering test written
      // for it would assert nothing at all. Every live region declares
      // itself with a role, so that is what this reads. The three stay named
      // explicitly rather than being replaced by the query -- `#cg-results`
      // is not a live region (it is the ancestor whose reveal the summary's
      // write must follow), and dropping any of them would weaken tests that
      // already pass.
      const ids = new Set(['cg-error', 'cg-results', 'cg-summary']);
      for (const live of document.querySelectorAll(
        '[role="alert"], [role="status"]',
      )) {
        if (live.id) ids.add(live.id);
      }
      for (const id of ids) {
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

  // #188, AC16. A refused number field is a refusal, so it is announced
  // rather than merely shown -- the region has to join the accessibility
  // tree before the sentence is written into it. Instrumented without being
  // named: the recorder above now derives every element carrying a live
  // role, so this region was covered the moment the markup declared one.
  //
  // The LAST two operations, not the whole sequence: every keystroke that
  // leaves the field valid also writes an empty string into the hidden
  // region, so pinning the full array would be brittle for reasons that
  // have nothing to do with the ordering. `slice(-2)` still fails outright
  // if nothing was recorded at all.
  test('a refused number field is announced, not just revealed', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.fill('#cg-count', '25');
    await page.fill('#cg-numbers-absent', '26');

    await expect(page.locator('#cg-numbers-problem')).toHaveText(
      'There is no number 26. You have 25 students.',
    );
    expect((await opsFor(page, 'cg-numbers-problem')).slice(-2)).toEqual([
      'show',
      'write',
    ]);
    await shoot(
      page,
      'the refusal, revealed before it was written',
      page.locator('#cg-numbers-problem'),
    );
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
