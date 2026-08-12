import { test, expect } from './fixtures';
import { withGroups, rosterForSpillover, rosterOf, namesIn } from './helpers';

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
    // The viewport is read from the PAGE, not from `page.viewportSize()`.
    // On a real device over CDP there is no emulated viewport and that
    // returns `null` -- found on the real Android gauntlet, where this was
    // the only failure in 339. `window.innerWidth/innerHeight` is the real
    // viewport on every target, which is what this assertion was always
    // about; asking Playwright was asking the wrong thing.
    const box = (await page.locator('#cg-board').boundingBox())!;
    const vp = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
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
    // The board's Shuffle shares the page's own one-at-a-time guard, so it
    // does nothing while the previous deal is still running -- which is
    // what a teacher pressing it twice should get, and what this test was
    // unknowingly doing. Wait for the deal to finish first: condition-based
    // on the deal button's own enabled state, never a sleep.
    await expect(page.locator('#cg-go')).toBeEnabled();
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
    await expect(page.locator('#cg-go')).toBeEnabled();
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

/**
 * Stage 5, Task 6. Z-21, Z-22, Z-23, E-15, E-16, E-17.
 */
test.describe('the reveal', () => {
  // Leaving MID-reveal must cancel what is still pending. Left running, the
  // remaining timers fire against groups that are back on the page, and a
  // second showing has the first showing's timers re-adding `revealed`
  // behind the new one. Caught by self-review, not by a test that lets the
  // reveal finish -- which is every other test in this block.
  test('leaving mid-reveal cancels the rest of it', async ({ page }) => {
    await withGroups(page, 24);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board .group').first()).toHaveClass(
      /revealing/,
    );
    // Out again immediately, while later groups are still queued.
    await page.keyboard.press('Escape');
    await expect(page.locator('#cg-board')).toBeHidden();
    // The groups are back on the page and none of them is left mid-reveal:
    // a pending timer firing now would add `revealed` to a card that is no
    // longer on the board at all.
    const stuck = await page
      .locator('#cg-results .group')
      .evaluateAll(
        (els) =>
          els.filter(
            (e) =>
              e.classList.contains('revealing') &&
              !e.classList.contains('revealed'),
          ).length,
      );
    expect(stuck).toBe(0);
  });

  test('the reveal plays on the board', async ({ page }) => {
    await withGroups(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board .group').first()).toHaveClass(
      /revealing/,
    );
    await expect(page.locator('#cg-board .group').last()).toHaveClass(
      /revealed/,
    );
  });

  test('the Sound & animation switch suppresses it', async ({ page }) => {
    // AFTER the roster is built, not before: `withGroups` navigates (it
    // goes to the page and opens Student details), so a setting made first
    // is thrown away by that navigation. The plan's own snippet set it
    // first and would have passed only if suppression never worked.
    await withGroups(page);
    await page.locator('#cg-sound-toggle').click();
    // A <select>, not a checkbox — the plan's snippet used `.check()` on a
    // label that is an <option>. The real control is `#cg-speed`.
    await page.selectOption('#cg-speed', 'skip');
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board .group').first()).not.toHaveClass(
      /revealing/,
    );
    // …and they are on screen, which is what "suppressed" has to mean: a
    // board of permanently invisible groups would also satisfy the line
    // above.
    await expect(page.locator('#cg-board .group').first()).toHaveClass(
      /revealed/,
    );
    await expect(page.locator('#cg-board .group').first()).toBeVisible();
  });

  test('prefers-reduced-motion suppresses it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await withGroups(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board .group').first()).not.toHaveClass(
      /revealing/,
    );
    await expect(page.locator('#cg-board .group').first()).toBeVisible();
  });
});

/**
 * Three separate tests against three separate entry points. A shared helper
 * asserting "one of them refused" would pass while two of them quietly
 * succeeded, and each of those two puts a wrong answer in front of a class.
 */
test.describe('all three refuse while the groups are out of date', () => {
  const goStale = async (page: import('@playwright/test').Page) => {
    await rosterOf(page, 12);
    await page.locator('#cg-go').click();
    await page.locator('.cg-student').first().getByLabel('Absent').check();
    await expect(page.getByText(/These groups are out of date/)).toBeVisible();
  };

  test('Export groups refuses, and says why', async ({ page }) => {
    await goStale(page);
    await page.locator('#cg-io-toggle').click();
    await page.getByRole('button', { name: 'Export groups' }).click();
    await expect(
      page.getByText(
        'These groups are out of date. Shuffle again before saving them.',
      ),
    ).toBeVisible();
  });

  test('Print refuses, and says why', async ({ page }) => {
    await goStale(page);
    await page.getByRole('button', { name: 'Print' }).click();
    await expect(page.locator('#cg-print-panel')).toBeHidden();
    await expect(
      page.getByText(
        'These groups are out of date. Shuffle again before printing them.',
      ),
    ).toBeVisible();
  });

  test('Full screen refuses, and says why', async ({ page }) => {
    await goStale(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board')).toBeHidden();
    await expect(
      page.getByText(
        'These groups are out of date. Shuffle again before showing them.',
      ),
    ).toBeVisible();
  });

  // …and each one WORKS again once the groups are fresh, so the refusal is
  // a gate rather than a wall. Without this a permanently-broken control
  // would satisfy all three tests above.
  test('and all three work again after a reshuffle', async ({ page }) => {
    await goStale(page);
    // `#cg-go`, by id. After a successful shuffle its LABEL becomes
    // "Shuffle again" (classroom-groups.ts sets `goButton.textContent =
    // t.again`), so asking for it by the name it had at load finds nothing.
    await page.locator('#cg-go').click();
    await expect(page.getByText(/These groups are out of date/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('#cg-board')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cg-board')).toBeHidden();
    await clickable(page, '#cg-print-open');

    await page.getByRole('button', { name: 'Print' }).click();
    await expect(page.locator('#cg-print-panel')).toBeVisible();
    await page
      .locator('#cg-print-panel')
      .getByRole('button', { name: 'Cancel' })
      .click();
  });
});

/**
 * Review findings, fixed and pinned. Each of these reddens against the code
 * as it was before the fix beside it.
 */
test.describe('review findings', () => {
  // I1. `refuse()` was the only writer of #cg-refusal AND its only clearer,
  // so the alert outlived the staleness that produced it: the page said the
  // groups were out of date in a role="alert" while everything else on it
  // said they were fine.
  test('a refusal clears when the change that caused it is undone', async ({
    page,
  }) => {
    await rosterOf(page, 12);
    await page.locator('#cg-go').click();
    await page.locator('.cg-student').first().getByLabel('Absent').check();
    await page.getByRole('button', { name: 'Print' }).click();
    await expect(
      page.getByText(
        'These groups are out of date. Shuffle again before printing them.',
      ),
    ).toBeVisible();

    // UNDO, rather than reshuffle: the staleness goes away by itself, and
    // nothing else on the page is touched.
    await page.locator('.cg-student').first().getByLabel('Absent').uncheck();
    await expect(
      page.getByText(/Shuffle again before printing them/),
    ).toHaveCount(0);
  });

  test('and it clears on a reshuffle too', async ({ page }) => {
    await rosterOf(page, 12);
    await page.locator('#cg-go').click();
    await page.locator('.cg-student').first().getByLabel('Absent').check();
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(
      page.getByText(/Shuffle again before showing them/),
    ).toBeVisible();
    await expect(page.locator('#cg-go')).toBeEnabled();
    await page.locator('#cg-go').click();
    await expect(
      page.getByText(/Shuffle again before showing them/),
    ).toHaveCount(0);
  });

  // I7a. The board's Shuffle and the page's deal button are one action and
  // must share one guard. Two overlapping deals doubled the land sounds,
  // re-enabled the button while the second was still running, and dealt
  // onto cards the second render had already detached.
  test('the board Shuffle does not start a second deal over the first', async ({
    page,
  }) => {
    await withGroups(page);
    await expect(page.locator('#cg-go')).toBeEnabled();
    await page.getByRole('button', { name: 'Full screen' }).click();
    const shuffle = bar(page).getByRole('button', { name: 'Shuffle again' });
    await shuffle.click();
    // Mid-deal: the page's own button is disabled, so this press is refused
    // rather than starting a second overlapping animation.
    await expect(page.locator('#cg-go')).toBeDisabled();
    await shuffle.click();
    await expect(page.locator('#cg-go')).toBeEnabled();
    // …and exactly one arrangement survives: every student appears once.
    const names = await page
      .locator('#cg-board .student')
      .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(12);
  });
});
