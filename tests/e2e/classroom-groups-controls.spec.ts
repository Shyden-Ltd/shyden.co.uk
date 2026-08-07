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

test.describe('the results are styled, not just present', () => {
  /**
   * Every other test here counts elements and reads text, and all of them
   * passed while the entire results area rendered unstyled.
   *
   * The script BUILDS the results at runtime, so the elements it creates
   * never carry Astro's `data-astro-cid-…` scope attribute — and every rule
   * in the component's <style> block is compiled to
   * `.avatar[data-astro-cid-vs67owv4]`, which matches none of them. The
   * avatars therefore had no size and filled the width of the card as black
   * circles, and the deal animation never animated. Found on a real phone,
   * where one child's face covered the screen.
   */
  test('an avatar is a small coloured face, not a full-width black circle', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await makeGroups(page, '8', '4');
    await expect(page.locator('#cg-results .student')).toHaveCount(8);

    const box = await page.locator('#cg-results .avatar').first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(20);
    expect(box!.width).toBeLessThan(60);
    expect(Math.abs(box!.width - box!.height)).toBeLessThan(2);

    // Coloured from --hue. Unstyled SVG paths default to black.
    const fill = await page
      .locator('#cg-results .a-bg')
      .first()
      .evaluate((el) => getComputedStyle(el).fill);
    expect(fill).not.toBe('rgb(0, 0, 0)');
  });

  test('a student row lays out beside its avatar', async ({ page }) => {
    await page.goto('/classroom-groups');
    await makeGroups(page, '8', '4');
    const display = await page
      .locator('#cg-results .student')
      .first()
      .evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('flex');
  });

  test('a group is a card, not bare text', async ({ page }) => {
    await page.goto('/classroom-groups');
    await makeGroups(page, '8', '4');
    const border = await page
      .locator('#cg-results .group')
      .first()
      .evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(border).not.toBe('0px');
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

  // 'a long name does not push the layout sideways' is retired along with
  // the paste-names box it depended on (#cg-names) -- it fed `students:
  // string[]`, an input shape the rewritten engine no longer accepts (see
  // grouping.ts's GroupingInput). The `overflow-wrap: anywhere` rule this
  // test exercised on `.who` in ClassroomGroupsPage.astro's global styles is
  // still in place; a later stage that reintroduces a named roster should
  // also reintroduce this test against it.

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

// Stage 2, Task 2's own RED tests (H-01…H-08, Y-05). The plan's literal
// snippet used `page.getByLabel('How many students?')` -- that does not
// match this page, same correction Task 1's own tests already recorded
// above (classroom-groups.spec.ts): the label reads "Number of students"
// (`studentsLabel` in en.ts), not "How many students?". Corrected to the
// real label here too, rather than reproduced verbatim.
test.describe('How to use', () => {
  test('sits above the form and outside the tool sections', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    const howTo = page.locator('#cg-howto');
    const form = page.locator('#cg-form');
    const hy = (await howTo.boundingBox())!.y;
    const fy = (await form.boundingBox())!.y;
    expect(hy).toBeLessThan(fy);
    // and it is not one of the tool's collapsible sections
    await expect(form.locator('#cg-howto')).toHaveCount(0);
  });

  test('holds both parts and is open by default', async ({ page }) => {
    await page.goto('/classroom-groups');
    // The whole sentence, and it must name WHO and WHY -- not just what.
    await expect(
      page.getByText(
        'Built for teachers, by Shyden. Splitting a class fairly takes time you do not have, and doing it by hand invites an argument about favourites. This does it in one press — free, with no sign-up, and with nothing about your class ever leaving your browser.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Say how many students are in your class.'),
    ).toBeVisible();
  });

  test('both parts collapse together, and the header survives', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.getByRole('button', { name: 'How to use' }).click();
    await expect(
      page.getByText('Say how many students are in your class.'),
    ).toBeHidden();
    await expect(page.getByText('Built for teachers, by Shyden.')).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'How to use' }),
    ).toBeVisible();
  });

  // A control that hides itself is a trap. The test above only proves the
  // header survives being collapsed once -- it never proves the content
  // comes back. Click again and look for the actual sentence returning,
  // not just an attribute flipping.
  test('clicking the toggle a second time reopens both parts', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    const toggle = page.getByRole('button', { name: 'How to use' });
    await toggle.click();
    await toggle.click();
    await expect(
      page.getByText(
        'Built for teachers, by Shyden. Splitting a class fairly takes time you do not have, and doing it by hand invites an argument about favourites. This does it in one press — free, with no sign-up, and with nothing about your class ever leaving your browser.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Say how many students are in your class.'),
    ).toBeVisible();
  });

  test('the collapsed state survives a reload', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByRole('button', { name: 'How to use' }).click();
    await page.reload();
    await expect(
      page.getByText('Say how many students are in your class.'),
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'How to use' }),
    ).toBeVisible();
  });

  test('only the preference is stored, never class data', async ({ page }) => {
    await page.goto('/classroom-groups');
    // Not 'How many students?' -- see the describe block's own comment.
    await page.getByLabel('Number of students').fill('12');
    await page.getByRole('button', { name: 'How to use' }).click();
    const stored = await page.evaluate(() => ({ ...localStorage }));
    expect(Object.values(stored).join(' ')).not.toContain('12');
    expect(Object.keys(stored)).toContain('cg-howto-collapsed');
    // Every key this page writes starts `cg-`, and none of them may carry
    // class data. Asserting the EXACT list here would be a false economy:
    // stage 5 adds four print preferences and would break a test that is
    // not about printing.
    expect(Object.keys(stored).every((k) => k.startsWith('cg-'))).toBe(true);
  });

  // The old markup was a real <h2>; the toggle rewrite dropped it to a bare
  // <button>, which a screen reader can no longer find by heading
  // navigation. Assert the role and level a screen-reader user would land
  // on, not a tag count, and confirm the click still works with the
  // heading restored.
  test('the section is reachable by heading, and the toggle still works', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await expect(
      page.getByRole('heading', { name: 'How to use', level: 2 }),
    ).toBeVisible();
    const toggle = page.getByRole('button', { name: 'How to use' });
    await toggle.click();
    await expect(
      page.getByText('Say how many students are in your class.'),
    ).toBeHidden();
  });
});

test.describe('How to use — Indonesian', () => {
  test('sits above the form and outside the tool sections', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    const howTo = page.locator('#cg-howto');
    const form = page.locator('#cg-form');
    const hy = (await howTo.boundingBox())!.y;
    const fy = (await form.boundingBox())!.y;
    expect(hy).toBeLessThan(fy);
    await expect(form.locator('#cg-howto')).toHaveCount(0);
  });

  test('holds both parts and is open by default', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await expect(
      page.getByText(
        'Dibuat untuk para guru, oleh Shyden. Membagi kelas dengan adil memakan waktu yang tidak Anda miliki, dan melakukannya secara manual mengundang perdebatan soal pilih kasih. Ini melakukannya dalam satu tekan — gratis, tanpa perlu mendaftar, dan tidak ada data kelas Anda yang pernah meninggalkan peramban Anda.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Masukkan jumlah siswa di kelas Anda.'),
    ).toBeVisible();
  });

  test('both parts collapse together, and the header survives', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await page.getByRole('button', { name: 'Cara menggunakan' }).click();
    await expect(
      page.getByText('Masukkan jumlah siswa di kelas Anda.'),
    ).toBeHidden();
    await expect(
      page.getByText('Dibuat untuk para guru, oleh Shyden.'),
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Cara menggunakan' }),
    ).toBeVisible();
  });

  // Mirrors the English suite's own reopen test -- a control that hides
  // itself is a trap, in every language this page ships.
  test('clicking the toggle a second time reopens both parts', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    const toggle = page.getByRole('button', { name: 'Cara menggunakan' });
    await toggle.click();
    await toggle.click();
    await expect(
      page.getByText(
        'Dibuat untuk para guru, oleh Shyden. Membagi kelas dengan adil memakan waktu yang tidak Anda miliki, dan melakukannya secara manual mengundang perdebatan soal pilih kasih. Ini melakukannya dalam satu tekan — gratis, tanpa perlu mendaftar, dan tidak ada data kelas Anda yang pernah meninggalkan peramban Anda.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Masukkan jumlah siswa di kelas Anda.'),
    ).toBeVisible();
  });

  test('the collapsed state survives a reload', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await page.getByRole('button', { name: 'Cara menggunakan' }).click();
    await page.reload();
    await expect(
      page.getByText('Masukkan jumlah siswa di kelas Anda.'),
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Cara menggunakan' }),
    ).toBeVisible();
  });

  test('only the preference is stored, never class data', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await page.getByLabel('Jumlah siswa').fill('12');
    await page.getByRole('button', { name: 'Cara menggunakan' }).click();
    const stored = await page.evaluate(() => ({ ...localStorage }));
    expect(Object.values(stored).join(' ')).not.toContain('12');
    expect(Object.keys(stored)).toContain('cg-howto-collapsed');
    expect(Object.keys(stored).every((k) => k.startsWith('cg-'))).toBe(true);
  });

  // Mirrors the English suite's own heading-reachability test.
  test('the section is reachable by heading, and the toggle still works', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await expect(
      page.getByRole('heading', { name: 'Cara menggunakan', level: 2 }),
    ).toBeVisible();
    const toggle = page.getByRole('button', { name: 'Cara menggunakan' });
    await toggle.click();
    await expect(
      page.getByText('Masukkan jumlah siswa di kelas Anda.'),
    ).toBeHidden();
  });
});

// Stage 2, Task 3's own RED tests (S-01…S-10, L-10, L-11). Same collapsible
// pattern as How to use above, for the same reason recorded there: a bare
// <button> has no heading role, so each toggle is wrapped in an <h2> —
// matching #cg-howto's own level, since these three are its siblings in the
// page's outline, not a level beneath it. Unlike How to use, these start
// COLLAPSED (design spec section 2: the tool is collapsed by default, and
// opening it is a deliberate act) and are never written to localStorage
// (section 11 names only the how-to state and a later print panel as the
// UI preferences allowed to persist).
//
// Only three of the four sections exist yet. Sound & animation is not
// built here — see ClassroomGroupsPage.astro's own comment on the id
// collision that would cause with the existing sound checkbox — so no test
// below references #cg-sound.
test.describe("the tool's collapsible sections", () => {
  test('every header reports its own state', async ({ page }) => {
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-students .state')).toHaveText('none added');
    await expect(page.locator('#cg-grouping .state')).toHaveText('none');
    await expect(page.locator('#cg-io .state')).toHaveText(
      'nothing to save yet',
    );
  });

  // The middot joining the label to the state is a real text node (an Astro
  // expression, `{' · '}`), never template whitespace relying on two nodes
  // sharing a line — so the whole button must read as one sentence, the
  // same promise rendered-text.spec.ts holds every other sentence on this
  // site to. This also covers S-10 (the section is named "Student details",
  // never "Customise students").
  test('each header is the whole rendered sentence, not just its state fragment', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-students-toggle')).toHaveText(
      'Student details · none added',
    );
    await expect(page.locator('#cg-grouping-toggle')).toHaveText(
      'Grouping options · none',
    );
    await expect(page.locator('#cg-io-toggle')).toHaveText(
      'Import / export · nothing to save yet',
    );
  });

  // F-1, task-3-fix-report.md. `leftovers` is the one ToolState field
  // already live on this page today -- the radios still sit in the
  // top-level form (Task 4 moves them into #cg-grouping itself), but a
  // teacher can choose "put them all in one group" long before that move
  // happens, and the header must not go on reporting "none" once they have.
  test('the grouping header follows the leftovers choice, live', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.check('input[name="leftovers"][value="bunch"]');
    await expect(page.locator('#cg-grouping-toggle')).toHaveText(
      'Grouping options · leftovers in one group',
    );
  });

  test('sections sit two-by-two on a laptop and stacked on a phone', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.setViewportSize({ width: 1280, height: 900 });
    const a = (await page.locator('#cg-students').boundingBox())!;
    const b = (await page.locator('#cg-grouping').boundingBox())!;
    expect(b.y).toBeCloseTo(a.y, 0); // same row
    await page.setViewportSize({ width: 320, height: 800 });
    const c = (await page.locator('#cg-students').boundingBox())!;
    const d = (await page.locator('#cg-grouping').boundingBox())!;
    expect(d.y).toBeGreaterThan(c.y); // stacked
  });

  test('each section is reachable by heading, and starts collapsed', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    for (const [id, label] of [
      ['cg-students', 'Student details'],
      ['cg-grouping', 'Grouping options'],
      ['cg-io', 'Import / export'],
    ] as const) {
      // getByRole's name match is a substring by default, so this also
      // matches the full "label · state" text — see the dedicated
      // whole-sentence test above for the exact string pinned.
      await expect(
        page.getByRole('heading', { name: label, level: 2 }),
      ).toBeVisible();
      await expect(page.locator(`#${id}-body`)).toBeHidden();
      await expect(page.locator(`#${id}-toggle`)).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    }
  });

  // A control that only ever opens, or only ever closes, is a trap — the
  // same proof the How to use fix round added above (see that describe
  // block's own comment), adapted here for a body with no sentence of its
  // own to search for: all three of these sections render nothing at all
  // in the body until a later stage fills them in (see the markup's own
  // comment on why). So "content the user would actually see returning" is
  // the body genuinely re-entering the page's rendered layout — checked
  // with toBeVisible()/toBeHidden(), which read computed layout (the body
  // carries `padding-bottom` only while unhidden, so an empty div still has
  // real, non-zero size to detect), never the aria-expanded STRING alone.
  // Three clicks, not two: these sections start CLOSED (opposite of How to
  // use's default-open), so proving a genuine REOPEN — not just the first
  // close — needs open, close, open again.
  for (const id of ['cg-students', 'cg-grouping', 'cg-io']) {
    test(`${id}: a second opening genuinely re-shows the section, not merely an attribute flipping back`, async ({
      page,
    }) => {
      await page.goto('/classroom-groups');
      const toggle = page.locator(`#${id}-toggle`);
      const body = page.locator(`#${id}-body`);

      await expect(body).toBeHidden();

      await toggle.click(); // open
      await expect(body).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await toggle.click(); // close
      await expect(body).toBeHidden();
      await expect(toggle).toBeVisible(); // the header itself is never hidden

      await toggle.click(); // reopen
      await expect(body).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });
  }
});

test.describe("the tool's collapsible sections — Indonesian", () => {
  test('every header reports its own state', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await expect(page.locator('#cg-students .state')).toHaveText(
      'tidak ada yang ditambahkan',
    );
    await expect(page.locator('#cg-grouping .state')).toHaveText('tidak ada');
    await expect(page.locator('#cg-io .state')).toHaveText(
      'belum ada yang perlu disimpan',
    );
  });

  test('each header is the whole rendered sentence, not just its state fragment', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await expect(page.locator('#cg-students-toggle')).toHaveText(
      'Detail siswa · tidak ada yang ditambahkan',
    );
    await expect(page.locator('#cg-grouping-toggle')).toHaveText(
      'Opsi pengelompokan · tidak ada',
    );
    await expect(page.locator('#cg-io-toggle')).toHaveText(
      'Impor / ekspor · belum ada yang perlu disimpan',
    );
  });

  // Mirrors the English suite's own leftovers-follows-live test.
  test('the grouping header follows the leftovers choice, live', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await page.check('input[name="leftovers"][value="bunch"]');
    await expect(page.locator('#cg-grouping-toggle')).toHaveText(
      'Opsi pengelompokan · sisa dalam satu kelompok',
    );
  });

  test('each section is reachable by heading, and starts collapsed', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    for (const [id, label] of [
      ['cg-students', 'Detail siswa'],
      ['cg-grouping', 'Opsi pengelompokan'],
      ['cg-io', 'Impor / ekspor'],
    ] as const) {
      await expect(
        page.getByRole('heading', { name: label, level: 2 }),
      ).toBeVisible();
      await expect(page.locator(`#${id}-body`)).toBeHidden();
    }
  });

  test('a second opening genuinely re-shows the section', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    const toggle = page.locator('#cg-grouping-toggle');
    const body = page.locator('#cg-grouping-body');
    await toggle.click();
    await expect(body).toBeVisible();
    await toggle.click();
    await expect(body).toBeHidden();
    await toggle.click();
    await expect(body).toBeVisible();
  });
});
