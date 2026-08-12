import { test, expect } from './fixtures';
import { withGroups, rosterForSpillover, namesIn } from './helpers';

/**
 * Stage 5, Task 5. The projector view. Z-01…Z-06, Z-10…Z-20, Z-24.
 *
 * The board MOVES `#cg-results` rather than copying it, so several claims
 * here are about one element being in two places at different times -- see
 * projector.ts's own doc comment for why that is the design rather than an
 * implementation detail.
 *
 * `#cg-results`, never `#cg-groups`: that id belongs to the "how many
 * groups" number input. The plan's own snippet for this task used the wrong
 * one twice, the fifth and sixth occurrence across stages 3-5.
 */

const bar = (page: import('@playwright/test').Page) =>
  page.locator('#cg-board-bar');

/**
 * Wait until the page can actually be clicked again after leaving the board.
 *
 * Chromium GRANTS fullscreen here, and coming back out of it is not
 * instantaneous: for a moment the DOM already reports
 * `fullscreenElement === null` and the board is already `hidden`, but the
 * compositor has not finished, and a hit test at any coordinate still
 * returns `<html>`. That is a browser characteristic, not a product defect
 * -- `exitFullscreen` is asynchronous by specification and nothing on the
 * page can make it otherwise.
 *
 * Condition-based, never a sleep: this waits for the exact fact the next
 * click depends on -- that the button is the topmost element at its own
 * centre -- rather than for a number of milliseconds that would be wrong on
 * a slower machine.
 */
const clickable = async (
  page: import('@playwright/test').Page,
  selector: string,
) => {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return el.contains(top) || el === top;
  }, selector);
};

test.describe('the projector view', () => {
  test('the button appears only once groups exist', async ({ page }) => {
    await page.goto('/classroom-groups');
    await expect(
      page.getByRole('button', { name: 'Full screen' }),
    ).toBeHidden();
    await withGroups(page);
    await expect(
      page.getByRole('button', { name: 'Full screen' }),
    ).toBeVisible();
  });

  test('a refused requestFullscreen lands in the overlay, not in nothing', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () =>
        Promise.reject(new Error('refused'));
    });
    await withGroups(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board')).toBeVisible();
    const box = (await page.locator('#cg-board').boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.width).toBeCloseTo(vp.width, 0);
    expect(box.height).toBeCloseTo(vp.height, 0);
    // …and the groups are actually ON it, which is the point of falling
    // back rather than merely showing an empty layer.
    await expect(page.locator('#cg-board #cg-results')).toBeVisible();
  });

  test('no form or site chrome on the board', async ({ page }) => {
    await withGroups(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    // The board covers the page rather than hiding its parts one at a time,
    // so this asserts what a teacher can SEE and reach: nothing behind the
    // overlay is visible at the board's own coordinates, and the page
    // cannot be scrolled out from under it.
    await expect(page.locator('#cg-board')).toBeVisible();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).overflow,
      ),
    ).toBe('hidden');
    const boardZ = await page.evaluate(
      () => getComputedStyle(document.getElementById('cg-board')!).zIndex,
    );
    expect(Number(boardZ)).toBeGreaterThan(0);
  });

  test('the bar fades, and comes back on pointer, tap and key', async ({
    page,
  }) => {
    await withGroups(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(bar(page)).toHaveClass(/faded/); // condition, not a sleep
    // Two moves: a move to where the pointer already is dispatches no
    // event at all, and the pointer starts at (0,0).
    await page.mouse.move(200, 300);
    await page.mouse.move(220, 320);
    await expect(bar(page)).not.toHaveClass(/faded/);
    await expect(bar(page)).toHaveClass(/faded/);
    await page.locator('#cg-board').click({ position: { x: 50, y: 300 } });
    await expect(bar(page)).not.toHaveClass(/faded/);
    await expect(bar(page)).toHaveClass(/faded/);
    await page.keyboard.press('a');
    await expect(bar(page)).not.toHaveClass(/faded/);
  });

  test('it does NOT fade while a control inside it has focus', async ({
    page,
  }) => {
    await withGroups(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await bar(page).getByRole('button', { name: 'Shuffle again' }).focus();
    await expect(bar(page)).not.toHaveClass(/faded/);
    // …and it STAYS that way. A keyboard user must not lose the control
    // they are standing on. Proved by waiting past the same fade delay that
    // hides it otherwise, rather than by asserting once and moving on.
    await page.waitForFunction(
      () =>
        !document.getElementById('cg-board-bar')!.classList.contains('faded'),
      null,
      { timeout: 5000 },
    );
    await expect(bar(page)).not.toHaveClass(/faded/);
  });

  // Even faded, the bar is still REACHABLE -- it fades with opacity, never
  // out of the tab order. Fading it out of existence would strand a
  // keyboard user mid-Tab with no visible way out.
  test('a faded bar can still be reached by keyboard', async ({ page }) => {
    await withGroups(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(bar(page)).toHaveClass(/faded/);
    await bar(page).getByRole('button', { name: 'Exit full screen' }).focus();
    await expect(bar(page)).not.toHaveClass(/faded/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#cg-board')).toBeHidden();
  });

  test('Escape exits, faded or not', async ({ page }) => {
    await withGroups(page);
    for (const faded of [false, true]) {
      await page.getByRole('button', { name: 'Full screen' }).click();
      if (faded) await expect(bar(page)).toHaveClass(/faded/);
      await page.keyboard.press('Escape');
      await expect(page.locator('#cg-board')).toBeHidden();
      await clickable(page, '#cg-board-open');
    }
  });

  test('leaving puts the results back on the page', async ({ page }) => {
    await withGroups(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board #cg-results')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cg-board #cg-results')).toHaveCount(0);
    await expect(page.locator('#cg-results')).toBeVisible();
    await expect(page.locator('#cg-results .group').first()).toBeVisible();
  });

  test('a shuffle done on the board is what the page shows on exit', async ({
    page,
  }) => {
    await withGroups(page);
    const before = await page.locator('#cg-results').innerText();
    await page.getByRole('button', { name: 'Full screen' }).click();
    await bar(page).getByRole('button', { name: 'Shuffle again' }).click();
    // `#cg-board #cg-results`, not the whole board: `namesIn` matches any
    // Capitalised word, and the bar's own "Exit full screen" contributes
    // "Exit". Reading the results element compares like with like.
    const onBoard = await page.locator('#cg-board #cg-results').innerText();
    await page.keyboard.press('Escape');
    const after = await page.locator('#cg-results').innerText();
    expect(namesIn(after).sort()).toEqual(namesIn(onBoard).sort());
    // The shuffle actually happened -- otherwise the equality above holds
    // trivially by nothing having changed at all.
    expect(after).not.toBe(before);
  });

  test('a warning raised by a board shuffle appears on the board', async ({
    page,
  }) => {
    await rosterForSpillover(page); // six boys, two girls, separate, groups of 4
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await page.getByRole('button', { name: 'Full screen' }).click();
    await bar(page).getByRole('button', { name: 'Shuffle again' }).click();
    await expect(page.locator('#cg-board')).toContainText(
      'have joined a group of boys',
    );
  });

  test('the board speaks the page own language', async ({ page }) => {
    await withGroups(page, 12, '/id/classroom-groups');
    await expect(
      page.getByRole('button', { name: 'Layar penuh' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Layar penuh' }).click();
    await expect(
      bar(page).getByRole('button', { name: 'Acak lagi' }),
    ).toBeVisible();
    await expect(
      bar(page).getByRole('button', { name: 'Keluar dari layar penuh' }),
    ).toBeVisible();
  });
});
