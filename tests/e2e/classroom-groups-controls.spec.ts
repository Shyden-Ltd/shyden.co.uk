import { test, expect } from '@playwright/test';

/**
 * The controls the review found reachable from the page and asserted by
 * nothing: the theme picker, the leftovers radios, the sound label, and what
 * happens when the same button is pressed twice or after a refusal.
 *
 * Plus the three checks every other page on this site already has —
 * horizontal scroll, touch targets, console errors — which this page, the
 * only one that ships a script and about ten controls, did not.
 */

const makeGroups = async (
  page: import('@playwright/test').Page,
  count: string,
  size: string,
) => {
  await page.fill('#cg-count', count);
  await page.fill('#cg-size', size);
  await page.selectOption('#cg-speed', 'skip');
  await page.click('#cg-go');
};

test.describe('the controls that had no tests', () => {
  test('themed groups are named from the chosen theme, in each language', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.check('input[name="naming"][value="themed"]');
    await page.selectOption('#cg-theme', 'animals');
    await makeGroups(page, '8', '4');

    await expect(page.locator('#cg-results .group h3').first()).toHaveText(
      'Tigers',
    );

    await page.goto('/id/classroom-groups');
    await page.check('input[name="naming"][value="themed"]');
    await page.selectOption('#cg-theme', 'animals');
    await makeGroups(page, '8', '4');
    await expect(page.locator('#cg-results .group h3').first()).toHaveText(
      'Harimau',
    );
  });

  test('the theme picker offers every theme, translated', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await page.check('input[name="naming"][value="themed"]');
    // Not a count: an option whose label went missing renders as empty and a
    // count would not notice.
    await expect(page.locator('#cg-theme option')).toHaveText([
      'Hewan',
      'Warna',
      'Planet',
    ]);
  });

  test('numbering past the end of a theme falls back rather than repeating', async ({
    page,
  }) => {
    // Eight animal names, ten groups. Two identical group names would leave
    // the teacher unable to tell two groups apart.
    await page.goto('/classroom-groups');
    await page.check('input[name="naming"][value="themed"]');
    await page.selectOption('#cg-theme', 'animals');
    await page.check('input[name="mode"][value="groupCount"]');
    await page.fill('#cg-count', '30');
    await page.fill('#cg-groups', '10');
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');

    const names = await page.locator('#cg-results .group h3').allTextContents();
    expect(names).toHaveLength(10);
    expect(new Set(names).size).toBe(10);
    expect(names).toContain('Group 9');
  });

  test('the leftovers choice actually changes the shape', async ({ page }) => {
    // 23 students in groups of 4: spread is 6,6,6,5 — bunch is 7,4,4,4,4.
    await page.goto('/classroom-groups');
    await makeGroups(page, '23', '4');
    const spread = await page.locator('#cg-results .group').count();
    const spreadSizes = await page
      .locator('#cg-results .group')
      .evaluateAll((els) =>
        els.map((e) => e.querySelectorAll('.student').length),
      );

    await page.check('input[name="leftovers"][value="bunch"]');
    await page.click('#cg-go');
    const bunchSizes = await page
      .locator('#cg-results .group')
      .evaluateAll((els) =>
        els.map((e) => e.querySelectorAll('.student').length),
      );

    expect(spread).toBe(5);
    expect([...spreadSizes].sort((a, b) => b - a)).toEqual([5, 5, 5, 4, 4]);
    expect([...bunchSizes].sort((a, b) => b - a)).toEqual([7, 4, 4, 4, 4]);
  });

  test('the sound label says which state it is in, and remembers', async ({
    page,
  }) => {
    // Only toBeChecked was asserted — the visible words were not, so the
    // label could have said the opposite of the control.
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-sound-text')).toHaveText('Sound on');
    await page.uncheck('#cg-sound');
    await expect(page.locator('#cg-sound-text')).toHaveText('Sound off');
    await page.reload();
    await expect(page.locator('#cg-sound')).not.toBeChecked();
    await expect(page.locator('#cg-sound-text')).toHaveText('Sound off');
  });

  test('a device asking for less motion gets the answer without the show', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/classroom-groups');
    // A default, not a lock — the teacher can still turn it back on.
    await expect(page.locator('#cg-speed')).toHaveValue('skip');
  });

  test('a second press reshuffles instead of appending', async ({ page }) => {
    await page.goto('/classroom-groups');
    await makeGroups(page, '12', '4');
    await expect(page.locator('#cg-results .student')).toHaveCount(12);

    await page.click('#cg-go');
    // Not 24. The results are replaced, not added to.
    await expect(page.locator('#cg-results .student')).toHaveCount(12);
  });

  test('a refusal after a success clears the results, and vice versa', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await makeGroups(page, '12', '4');
    await expect(page.locator('#cg-results')).toBeVisible();

    await makeGroups(page, '0', '4');
    await expect(page.locator('#cg-error')).toBeVisible();
    await expect(page.locator('#cg-results')).toBeHidden();

    // And back again: the error must not linger over a fresh result.
    await makeGroups(page, '12', '4');
    await expect(page.locator('#cg-results')).toBeVisible();
    await expect(page.locator('#cg-error')).toBeHidden();
  });
});

test.describe('classroom groups — mobile-first layout', () => {
  for (const path of ['/classroom-groups', '/id/classroom-groups']) {
    for (const width of [320, 375, 768, 1280]) {
      test(`${path}: no horizontal scroll at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }

  test('a long name does not push the layout sideways', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/classroom-groups');
    await page.fill(
      '#cg-names',
      ['Bartholomew-Fitzgerald Wollstonecraft', 'Ana', 'Budi', 'Citra'].join(
        '\n',
      ),
    );
    await page.fill('#cg-size', '2');
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .student')).toHaveCount(4);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('every control meets the 44px touch target', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/classroom-groups');

    // Measured in BOTH states of the two conditional fieldsets, because
    // "students per group" and "how many groups" are never on screen at the
    // same time — and a control that is not displayed measures 0, which is
    // not the same thing as too small.
    const measureVisible = () =>
      page
        .locator(
          '#cg-form select, #cg-form button, #cg-form input[type="number"]',
        )
        .evaluateAll((els) =>
          els
            .filter((el) => (el as HTMLElement).offsetParent !== null)
            .map((el) => ({
              id: el.id,
              height: el.getBoundingClientRect().height,
            }))
            .filter((c) => c.height < 44),
        );

    const small = [...(await measureVisible())];
    await page.check('input[name="mode"][value="groupCount"]');
    await page.check('input[name="naming"][value="themed"]');
    small.push(...(await measureVisible()));

    // And prove the measurement actually saw the fields, rather than
    // reporting nothing because it found nothing to look at.
    const seen = await page
      .locator(
        '#cg-form select, #cg-form button, #cg-form input[type="number"]',
      )
      .evaluateAll(
        (els) =>
          els.filter((el) => (el as HTMLElement).offsetParent !== null).length,
      );
    expect(seen).toBeGreaterThanOrEqual(5);
    expect(small).toEqual([]);
  });

  test('no console errors on either language', async ({ page }) => {
    // This is the page that ships a script, and it was the page without this
    // test.
    for (const path of ['/classroom-groups', '/id/classroom-groups']) {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(path);
      await makeGroups(page, '12', '4');
      await expect(page.locator('#cg-results .student')).toHaveCount(12);
      expect(errors, `${path}: ${errors.join(' | ')}`).toEqual([]);
    }
  });
});
