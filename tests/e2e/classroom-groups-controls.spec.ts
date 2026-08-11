import { test, expect } from './fixtures';
import { addSeveral, buildRoster } from './helpers';

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
  // Stage 2, Task 7 folded Sound & animation into the tool's fourth
  // collapsible section -- #cg-speed now lives in #cg-sound-body, which
  // starts collapsed, so it has to be open before `selectOption` can act on
  // it (same reasoning as the leftovers radios inside #cg-grouping-body,
  // Stage 2 Task 4). Idempotent: this helper can run more than once per
  // test, and a second click would close what the first one opened.
  const soundBody = page.locator('#cg-sound-body');
  if (await soundBody.isHidden()) {
    await page.locator('#cg-sound-toggle').click();
  }
  await page.selectOption('#cg-speed', 'skip');
  await page.click('#cg-go');
};

test.describe('the controls that had no tests', () => {
  // Stage 3, Task 8 (design spec section 5) removed the theme picker and
  // the naming radio that revealed it -- three tests used to live here
  // exercising them directly ("themed groups are named from the chosen
  // theme, in each language", "the theme picker offers every theme,
  // translated", "numbering past the end of a theme falls back rather than
  // repeating"), deleted in the same commit that removes the feature
  // (design spec section 13's own "tests for a removed feature are deleted
  // in the same stage that removes it"). These two replace them: proving
  // the removal itself, and that the numbered default it leaves behind
  // still works.
  //
  // task-8-brief.md's own given snippet for both has three real bugs, each
  // the SAME recurring shape this stage's own progress ledger already
  // records more than once (task-6/7's reports: a brief-given label or
  // selector that does not exist on the real page) -- found by RUNNING
  // this against the page, not by re-reading the brief harder:
  //   - `page.getByLabel('Animals')` and
  //     `page.getByRole('radio', { name: /Numbered|Themed/ })` both return
  //     ZERO matches on the UNMODIFIED, pre-Task-8 page too -- "Animals" was
  //     never a <label>, only <option> text inside one; the two naming
  //     radios' own accessible names are "Group 1, 2, 3…" / "Use a theme",
  //     neither of which contains the word "Numbered" or "Themed" anywhere.
  //     Both assertions would have passed whether or not the removal ever
  //     happened -- decoration, not proof. Replaced with direct, structural
  //     checks: the naming radio GROUP is gone (`input[name="naming"]`) and
  //     its own legend text no longer renders anywhere on the page.
  //   - `page.getByLabel('How many students?')` -- the real label is
  //     "Number of students" (`studentsLabel`, en.ts). `getByRole('button',
  //     { name: 'Make groups' })` -- the real button text is "Make Groups",
  //     capital G (`makeGroups`, en.ts); Playwright's own case-sensitive
  //     string matching (this file's own `makeGroups` helper reads the
  //     control by id already, sidestepping both).
  //   - count=9/size=4 (the brief's own numbers) produces TWO groups, not
  //     three -- proven by an already-passing sibling test in this suite's
  //     own family (classroom-groups.spec.ts's "a blank class name blocks
  //     nothing": `fill(page, { count: '9', size: '4' })` then
  //     `expect(page.locator('#cg-results .group')).toHaveCount(2)`).
  //     Replaced with count=12/size=4 -- a clean division (three groups of
  //     four, no leftover-redistribution ambiguity) that genuinely yields
  //     three sequentially-numbered groups.
  test('the theme select and the naming radio are gone', async ({ page }) => {
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-theme')).toHaveCount(0);
    await expect(page.locator('input[name="naming"]')).toHaveCount(0);
    await expect(page.getByText('Name the groups')).toHaveCount(0);
  });

  test('groups are numbered, always', async ({ page }) => {
    await page.goto('/classroom-groups');
    await makeGroups(page, '12', '4');
    await expect(page.locator('#cg-results .group h3')).toHaveText([
      'Group 1',
      'Group 2',
      'Group 3',
    ]);
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

    // Stage 2, Task 4 moved the leftovers radios into #cg-grouping-body,
    // which starts collapsed (`hidden`) -- Playwright's `check` waits for
    // its target to be visible, so a hidden radio times out rather than
    // being checked. Opening the section first is the same thing a teacher
    // has to do; it is not a workaround.
    await page.locator('#cg-grouping-toggle').click();
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
    // Stage 2, Task 7: the checkbox now lives inside #cg-sound-body, and
    // every visit starts collapsed (design spec section 11 names only the
    // how-to state and a later print panel as UI preferences allowed to
    // persist) -- so it has to be reopened after the reload below too.
    await page.locator('#cg-sound-toggle').click();
    // Task 8, the locale sweep. sectionSoundHeading ("Sound and animation")
    // had been clicked by id in every file that opens this section, but its
    // own rendered text had never been asserted anywhere -- this is the
    // whole button label, with no `· state` half to join it to (see
    // sections.ts's own doc comment on why sectionState returns three
    // fields, not four).
    await expect(page.locator('#cg-sound-toggle')).toHaveText(
      'Sound and animation',
    );
    await expect(page.locator('#cg-sound-text')).toHaveText('Sound on');
    await page.uncheck('#cg-sound-check');
    await expect(page.locator('#cg-sound-text')).toHaveText('Sound off');
    await page.reload();
    await page.locator('#cg-sound-toggle').click();
    await expect(page.locator('#cg-sound-check')).not.toBeChecked();
    await expect(page.locator('#cg-sound-text')).toHaveText('Sound off');
  });

  // Task 8, the locale sweep. This whole section (heading, sound label,
  // speed label) had zero Indonesian e2e coverage -- every existing
  // interaction with it goes through an id or a selectOption VALUE
  // ('fast'/'skip'/'normal'), never the page's own words.
  test('the sound section reads in Indonesian, as whole sentences', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await page.locator('#cg-sound-toggle').click();
    await expect(page.locator('#cg-sound-toggle')).toHaveText(
      'Suara dan animasi',
    );
    await expect(page.locator('#cg-sound-text')).toHaveText('Suara aktif');
    await page.uncheck('#cg-sound-check');
    await expect(page.locator('#cg-sound-text')).toHaveText('Suara mati');
    // { exact: true }: getByLabel's default match is a substring, not a
    // whole string -- a mutation spot-check on a sibling test in
    // classroom-groups.spec.ts ('the Split by row names its own fields')
    // found this the same way it found getByText's own default.
    await expect(page.getByLabel('Kecepatan', { exact: true })).toBeVisible();
  });

  // Mirrors 'the theme picker offers every theme, translated' below: not a
  // count, since an option whose label went missing renders empty and a
  // count would not notice. speedNormal is genuinely "Normal" in both
  // languages (i18n.test.ts's own ALLOWED_IDENTICAL), so this is the only
  // place that fact is proven against the real page rather than assumed.
  test('the speed picker offers every option, translated', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-sound-toggle').click();
    await expect(page.locator('#cg-speed option')).toHaveText([
      'Normal',
      'Fast',
      'Skip the animation',
    ]);

    await page.goto('/id/classroom-groups');
    await page.locator('#cg-sound-toggle').click();
    await expect(page.locator('#cg-speed option')).toHaveText([
      'Normal',
      'Cepat',
      'Lewati animasi',
    ]);
  });

  test('a device asking for less motion gets the answer without the show', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/classroom-groups');
    // #cg-speed sits inside #cg-sound-body since Stage 2, Task 7.
    await page.locator('#cg-sound-toggle').click();
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
  test('an avatar is a small face, not a full-width black circle', async ({
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
  });

  // Stage 3, Task 8 (design spec section 5) replaced the single grey/hued
  // silhouette this describe block's own header comment was written against
  // with three sex-based faces, hand-authored once each as a `<symbol>` and
  // referenced by `<use>` (src/lib/avatars.ts's own doc comment has the
  // full "one definition however many appear" reasoning). That changes what
  // "coloured, not black" actually has to prove, and where:
  //
  //   - Colour used to arrive as a `--hue` CSS custom property this page's
  //     own scoped styles set per student; now it is baked directly into
  //     each shape's own `fill="…"` attribute inside the `<symbol>`
  //     (src/lib/avatars.ts), so there is no computed style left to read —
  //     `getComputedStyle` is not this fill's source of truth any more,
  //     the attribute is.
  //   - A `<use>`'s referenced content is cloned into a shadow tree that
  //     `document.querySelectorAll`/Playwright locators cannot see inside —
  //     `#cg-results .a-bg` (the old locator) can never resolve to
  //     anything once colour lives inside a `<symbol>` reached only by
  //     `<use>`, no matter how the assertion itself is written. Reading the
  //     DEFINITION's own attribute instead — a real, light-DOM element,
  //     just never painted on its own — sidesteps that entirely rather
  //     than gambling on how any given engine resolves computed style for
  //     content that is never directly rendered.
  test('each rendered avatar references one of the three defined, coloured faces', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await makeGroups(page, '8', '4');

    // The sprite: exactly three <symbol>s, each a real fill attribute, none
    // of them black (an unstyled SVG shape with no fill at all defaults to
    // black -- the exact failure mode the old Astro-scoping bug produced,
    // see this describe block's own header comment).
    const defs = await page
      .locator('.cg-avatar-defs symbol')
      .evaluateAll((symbols) =>
        symbols.map((s) => ({
          id: s.id,
          fill: s.querySelector('.a-bg')?.getAttribute('fill') ?? null,
        })),
      );
    expect(defs.map((d) => d.id).sort()).toEqual([
      'avatar-f',
      'avatar-m',
      'avatar-n',
    ]);
    for (const { fill } of defs) {
      expect(fill).not.toBeNull();
      expect(fill).not.toBe('#000');
      expect(fill).toMatch(/^hsl\(/);
    }

    // Every rendered instance actually references one of those three --
    // proving the wiring end to end, not just that the definitions exist.
    const hrefs = await page
      .locator('#cg-results .avatar use')
      .evaluateAll((uses) => uses.map((u) => u.getAttribute('href')));
    expect(hrefs).toHaveLength(8);
    const definedIds = new Set(defs.map((d) => `#${d.id}`));
    for (const href of hrefs) expect(definedIds.has(href ?? '')).toBe(true);
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
      test(
        `${path}: no horizontal scroll at ${width}px`,
        { tag: '@emulated-viewport' },
        async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(path);
          const overflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          expect(overflow).toBeLessThanOrEqual(0);
        },
      );
    }
  }

  // 'a long name does not push the layout sideways' is retired along with
  // the paste-names box it depended on (#cg-names) -- it fed `students:
  // string[]`, an input shape the rewritten engine no longer accepts (see
  // grouping.ts's GroupingInput). The `overflow-wrap: anywhere` rule this
  // test exercised on `.who` in ClassroomGroupsPage.astro's global styles is
  // still in place; a later stage that reintroduces a named roster should
  // also reintroduce this test against it.

  // L-05/L-06 (test traceability matrix). "No horizontal scroll... in any
  // state" was untested for an OPEN section until now: all three sections
  // Task 3 built had empty bodies, and an empty div cannot overflow.
  // #cg-grouping is the first to hold real content (two switches, the
  // why-paragraph, the leftovers radios) -- the first place this claim can
  // actually be checked rather than merely stated. Two widths, not the full
  // four: 320px is the tightest (mobile-first floor) and 768px is where
  // `.tool-sections` switches to two columns, so #cg-grouping's open
  // content sits in a narrower column than the full viewport -- a distinct
  // geometry worth its own check.
  for (const width of [320, 768]) {
    test(
      `no horizontal scroll with Grouping options open, at ${width}px`,
      { tag: '@emulated-viewport' },
      async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/classroom-groups');
        await page.locator('#cg-grouping-toggle').click();
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      },
    );
  }

  // Stage 2, Task 7: Sound & animation is the SECOND section to hold real
  // content (the sound checkbox and the speed select), so it earns the same
  // check the loop above gave Grouping options, for the same two widths and
  // the same reason (320px is the mobile-first floor; 768px is where
  // `.tool-sections` becomes two columns, a distinct geometry).
  for (const width of [320, 768]) {
    test(
      `no horizontal scroll with Sound & animation open, at ${width}px`,
      { tag: '@emulated-viewport' },
      async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/classroom-groups');
        await page.locator('#cg-sound-toggle').click();
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      },
    );
  }

  // Design spec section 13: "no horizontal page scroll at any of those four
  // widths, in any state" -- "with results shown" was the one reachable
  // state nothing above checked. A hundred students maximises the number of
  // group cards and avatars actually on screen, the real-content analogue
  // of the long-class-name check elsewhere in this file.
  for (const width of [320, 768]) {
    test(
      `no horizontal scroll with results shown, at ${width}px`,
      { tag: '@emulated-viewport' },
      async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/classroom-groups');
        await makeGroups(page, '120', '4');
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      },
    );
  }

  test(
    'every control meets the 44px touch target',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto('/classroom-groups');

      // Measured in BOTH states of the mode field, because "students per
      // group" and "how many groups" are never on screen at the same time —
      // and a control that is not displayed measures 0, which is not the
      // same thing as too small. Used to also toggle the naming radio's own
      // conditional theme `<select>` the same way; Stage 3, Task 8 removed
      // that field along with the radio that revealed it (design spec
      // section 5), leaving one conditional field, not two.
      //
      // Stage 2, Task 5 added `#cg-form input[type="text"]` to this selector
      // for the new #cg-class field. Honestly: this could not go red before
      // that field existed, and does not prove much on its own even after --
      // `small` starts and stays `[]` whether or not #cg-class is measured at
      // all, which is exactly what happened when this line was added (a
      // pre-implementation run stayed green, confirmed rather than assumed).
      // What it DOES buy, from here on, is real: a #cg-class CSS rule that
      // dropped below 44px would populate `small` and redden `expect(small).
      // toEqual([])` below, the same as it would for any control this test
      // already covered. `seen`'s own lower bound was left alone rather than
      // bumped to "prove" #cg-class was counted -- the real baseline already
      // includes the three section-toggle buttons inside #cg-form (missed on
      // a first pass), so it sits comfortably above 5 with or without
      // #cg-class, and tightening it to track an exact count would make this
      // test brittle against unrelated future controls for no real gain.
      //
      // Noted on code review, not a hole: `#cg-speed` (and `#cg-sound-check`)
      // moved into `#cg-sound-body` in Stage 2, Task 7, which starts
      // `hidden`, and this test never opens it -- `offsetParent !== null`
      // below correctly drops both from `small` and from `seen`'s count, the
      // same as it would for any control inside a collapsed section. Neither
      // control silently loses coverage overall: classroom-groups.spec.ts's
      // own "every interactive target is at least 44px, collapsed and with
      // every section open" test opens all four sections first and measures
      // everything inside them, `#cg-speed` included. This test's own job is
      // narrower -- the controls already on screen before a teacher opens
      // anything -- and #cg-speed simply is not one of those any more.
      const measureVisible = () =>
        page
          .locator(
            '#cg-form select, #cg-form button, #cg-form input[type="number"], #cg-form input[type="text"]',
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
      small.push(...(await measureVisible()));

      // And prove the measurement actually saw the fields, rather than
      // reporting nothing because it found nothing to look at.
      const seen = await page
        .locator(
          '#cg-form select, #cg-form button, #cg-form input[type="number"], #cg-form input[type="text"]',
        )
        .evaluateAll(
          (els) =>
            els.filter((el) => (el as HTMLElement).offsetParent !== null)
              .length,
        );
      expect(seen).toBeGreaterThanOrEqual(5);
      expect(small).toEqual([]);
    },
  );

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

  // Reverses design spec section 3's original "open by default" -- section
  // 2's operator ruling 2 (2026-08-08) collapses it, because measurement
  // showed it was ~310px of a phone screen, the single biggest saving
  // toward the tool fitting one. The header stays visible and operable
  // regardless -- a control that hides itself is a trap.
  test('holds both parts and is collapsed by default', async ({ page }) => {
    await page.goto('/classroom-groups');
    await expect(
      page.getByRole('button', { name: 'How to use' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'How to use' }),
    ).toHaveAttribute('aria-expanded', 'false');
    // The whole sentence, and it must name WHO and WHY -- not just what.
    await expect(
      page.getByText(
        'Built for teachers, by Shyden. Splitting a class fairly takes time you do not have, and doing it by hand invites an argument about favourites. This does it in one press — free, with no sign-up, and with nothing about your class ever leaving your browser.',
      ),
    ).toBeHidden();
    await expect(
      page.getByText('Say how many students are in your class.'),
    ).toBeHidden();
  });

  test('clicking the toggle opens both parts', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByRole('button', { name: 'How to use' }).click();
    await expect(
      page.getByText(
        'Built for teachers, by Shyden. Splitting a class fairly takes time you do not have, and doing it by hand invites an argument about favourites. This does it in one press — free, with no sign-up, and with nothing about your class ever leaving your browser.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Say how many students are in your class.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'How to use' }),
    ).toBeVisible();
  });

  // A control that only ever opens is a trap too. The test above only
  // proves a first click reveals the content -- it never proves it can be
  // put away again. Click a second time and look for the actual sentences
  // leaving, not just an attribute flipping back.
  test('clicking the toggle a second time closes both parts again', async ({
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
    ).toBeHidden();
    await expect(
      page.getByText('Say how many students are in your class.'),
    ).toBeHidden();
    await expect(toggle).toBeVisible();
  });

  // "Collapse it, reload, still collapsed" would now be vacuous -- collapsed
  // is the default, so that would pass even with persistence completely
  // unwired. The test that actually proves the state round-trips through
  // localStorage is the other direction: open it, reload, and it must still
  // be open.
  test('the opened state survives a reload', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByRole('button', { name: 'How to use' }).click();
    await page.reload();
    await expect(
      page.getByText('Say how many students are in your class.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'How to use' }),
    ).toHaveAttribute('aria-expanded', 'true');
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
    ).toBeVisible();
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

  // Mirrors the English suite's own default-state test -- see that describe
  // block's own comment for the ruling behind the reversal.
  test('holds both parts and is collapsed by default', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await expect(
      page.getByRole('button', { name: 'Cara menggunakan' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cara menggunakan' }),
    ).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByText(
        'Dibuat untuk para guru, oleh Shyden. Membagi kelas dengan adil memakan waktu yang tidak Anda miliki, dan melakukannya secara manual mengundang perdebatan soal pilih kasih. Ini melakukannya dalam satu tekan — gratis, tanpa perlu mendaftar, dan tidak ada data kelas Anda yang pernah meninggalkan peramban Anda.',
      ),
    ).toBeHidden();
    await expect(
      page.getByText('Masukkan jumlah siswa di kelas Anda.'),
    ).toBeHidden();
  });

  test('clicking the toggle opens both parts', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await page.getByRole('button', { name: 'Cara menggunakan' }).click();
    await expect(
      page.getByText(
        'Dibuat untuk para guru, oleh Shyden. Membagi kelas dengan adil memakan waktu yang tidak Anda miliki, dan melakukannya secara manual mengundang perdebatan soal pilih kasih. Ini melakukannya dalam satu tekan — gratis, tanpa perlu mendaftar, dan tidak ada data kelas Anda yang pernah meninggalkan peramban Anda.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Masukkan jumlah siswa di kelas Anda.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cara menggunakan' }),
    ).toBeVisible();
  });

  // Mirrors the English suite's own close-again test -- a control that only
  // ever opens is a trap too, in every language this page ships.
  test('clicking the toggle a second time closes both parts again', async ({
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
    ).toBeHidden();
    await expect(
      page.getByText('Masukkan jumlah siswa di kelas Anda.'),
    ).toBeHidden();
    await expect(toggle).toBeVisible();
  });

  // Mirrors the English suite's own reload test -- see that describe
  // block's own comment for why the meaningful direction is now "opened",
  // not "collapsed".
  test('the opened state survives a reload', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await page.getByRole('button', { name: 'Cara menggunakan' }).click();
    await page.reload();
    await expect(
      page.getByText('Masukkan jumlah siswa di kelas Anda.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cara menggunakan' }),
    ).toHaveAttribute('aria-expanded', 'true');
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
    ).toBeVisible();
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
// Only three of the four sections existed when this block was first
// written. Stage 2, Task 7 folded Sound & animation in as the fourth --
// see ClassroomGroupsPage.astro's own comment on how the id collision with
// the existing sound checkbox was resolved (the checkbox is now
// #cg-sound-check; the section wrapper, its toggle and its body hold
// #cg-sound/#cg-sound-toggle/#cg-sound-body) -- but its state string is
// still deliberately absent (sections.ts's own doc comment on why), so it
// is not part of the loops below, which all assert a `.state` span or a
// `label · state` sentence neither of which this section has.
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

  // F-1, task-3-fix-report.md, and Stage 2 Task 4. The header-follows-radio
  // wiring was built BEFORE the radio had a home -- `updateGroupingHeader`
  // in classroom-groups.ts delegates on `#cg-form`'s own `change` event and
  // queries `input[name="leftovers"]:checked` scoped to the whole form, so
  // moving the radios into #cg-grouping-body needed no code change there at
  // all, only this test's interaction: the radio now starts inside a
  // collapsed section, so it must be opened before it can be checked, the
  // same as any other control a teacher reaches by opening the section
  // first. The guarantee this test proves -- the header cannot go on
  // reporting "none" once a teacher has chosen "put them all in one group"
  // -- is unchanged by where the control lives.
  test('the grouping header follows the leftovers choice, live', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-grouping-toggle').click();
    await page.check('input[name="leftovers"][value="bunch"]');
    await expect(page.locator('#cg-grouping-toggle')).toHaveText(
      'Grouping options · leftovers in one group',
    );
  });

  test(
    'sections sit two-by-two on a laptop and stacked on a phone',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.goto('/classroom-groups');
      await page.setViewportSize({ width: 1280, height: 900 });
      const a = (await page.locator('#cg-students').boundingBox())!;
      const b = (await page.locator('#cg-grouping').boundingBox())!;
      expect(b.y).toBeCloseTo(a.y, 0); // same row
      await page.setViewportSize({ width: 320, height: 800 });
      const c = (await page.locator('#cg-students').boundingBox())!;
      const d = (await page.locator('#cg-grouping').boundingBox())!;
      expect(d.y).toBeGreaterThan(c.y); // stacked
    },
  );

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
  // block's own comment), adapted here for a shared loop across three
  // bodies that no longer all hold the same thing. `cg-students` and
  // `cg-io` still render nothing at all in the body (see the markup's own
  // comment on why), so for those two "content the user would actually see
  // returning" is the body genuinely re-entering the page's rendered
  // layout — checked with toBeVisible()/toBeHidden(), which read computed
  // layout (the body carries `padding-bottom` only while unhidden, so an
  // empty div still has real, non-zero size to detect), never the
  // aria-expanded STRING alone. `cg-grouping` is no longer one of the empty
  // two: Stage 2, Task 4 moved the two sex switches and the leftovers
  // choice into its body, so its reopen here is proven by the same
  // computed-layout check but is no longer resting on an empty div's
  // padding alone — the dedicated 'Grouping options' describe block below
  // asserts its actual content directly. Three clicks, not two: these
  // sections start CLOSED — the same default How to use now has too
  // (design spec section 2's operator ruling 2) — but unlike that describe
  // block's own dedicated pair of tests (one click opens, a second closes
  // again), this shared loop proves a genuine SECOND opening specifically,
  // which needs open, close, open again to reach.
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

  // Mirrors the English suite's own leftovers-follows-live test, including
  // the section-open step that test's own comment explains.
  test('the grouping header follows the leftovers choice, live', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await page.locator('#cg-grouping-toggle').click();
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

// Stage 2, Task 4: the two sex switches, and the leftovers control rehomed
// into #cg-grouping-body (task-4-brief.md's Step 3 -- markup, `name`
// attribute and all four locale keys unchanged, only its parent). Design
// spec section 6.
//
// SUPERSEDED by Stage 3, Task 9. This block's own comment used to say the
// page was permanently stuck in ONE of design spec section 6's three
// branches -- "no list at all" -- because no control on the page could give
// a student a sex. That is no longer true: Task 2 built the roster table,
// Task 4 built absence, and Task 9 wires `sexWhy`/`sexWhyReturning`
// (src/lib/sexOptions.ts) to the live roster. All THREE branches are now
// reachable from the page, and the tests below drive each of them through
// real controls rather than citing the unit tests that prove them against
// synthetic rosters.
test.describe('Grouping options', () => {
  test('holds both sex switches and the leftovers choice', async ({ page }) => {
    await page.goto('/classroom-groups');
    // F-1 (review): the headline claim of this task is that these controls
    // live INSIDE Grouping options, not merely that they turn up somewhere
    // on the page after a click. Proven in both directions: hidden BEFORE
    // the section opens (checked against the whole page, not the section
    // body -- a control moved anywhere else on the page would still
    // satisfy a body-scoped hidden check, since a locator matching zero
    // elements passes toBeHidden()), then visible AND scoped to
    // `#cg-grouping-body` once it does. Proven directly, not by citing a
    // session note: temporarily moving this markup back to the top-level
    // "How to split them" fieldset reddens both halves above, with a real
    // hidden/visible mismatch and no crash -- confirmed, then reverted.
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeHidden();
    await expect(page.getByText('If students are left over')).toBeHidden();

    const body = page.locator('#cg-grouping-body');
    await page.locator('#cg-grouping-toggle').click();
    await expect(body.getByLabel('Mix boys and girls evenly')).toBeVisible();
    await expect(body.getByLabel('Keep boys and girls separate')).toBeVisible();
    await expect(body.getByText('If students are left over')).toBeVisible();
    await expect(body.getByLabel('Share them out evenly')).toBeChecked();
  });

  test('both switches are off by default', async ({ page }) => {
    await page.goto('/classroom-groups');
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeHidden();

    const body = page.locator('#cg-grouping-body');
    await page.locator('#cg-grouping-toggle').click();
    await expect(
      body.getByLabel('Mix boys and girls evenly'),
    ).not.toBeChecked();
    await expect(
      body.getByLabel('Keep boys and girls separate'),
    ).not.toBeChecked();
  });

  test('with no list at all, both are disabled and say why', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeHidden();

    const body = page.locator('#cg-grouping-body');
    await page.locator('#cg-grouping-toggle').click();
    await expect(body.getByLabel('Mix boys and girls evenly')).toBeDisabled();
    await expect(
      body.getByLabel('Keep boys and girls separate'),
    ).toBeDisabled();
    await expect(
      body.getByText(
        'Add your students in Student details and set M or F for each to use these.',
      ),
    ).toBeVisible();
  });

  // Design spec section 6: "Both are DISABLED unless every student being
  // grouped has M or F" -- ONE condition governing both switches, not two
  // independent ones. Both pointing at the same `aria-describedby` is what
  // would catch a copy-paste that gave each switch its own, silently
  // diverging reason element.
  test('both switches point at the same reason', async ({ page }) => {
    await page.goto('/classroom-groups');
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeHidden();

    const body = page.locator('#cg-grouping-body');
    await page.locator('#cg-grouping-toggle').click();
    await expect(body.getByLabel('Mix boys and girls evenly')).toHaveAttribute(
      'aria-describedby',
      'cg-sex-why',
    );
    await expect(
      body.getByLabel('Keep boys and girls separate'),
    ).toHaveAttribute('aria-describedby', 'cg-sex-why');
  });

  // The existing 44px sweep ('every control meets the 44px touch target',
  // above) deliberately measures only `select`, `button` and
  // `input[type="number"]` -- it has never covered #cg-sound or these two
  // switches. Scoped here rather than widening that query, so this task's
  // addition cannot change what that test already proves. The LABEL is
  // measured, not the raw checkbox: `.switch`'s 44px min-height is on the
  // label, because the whole row is the tap target, the same as every
  // radio label on this page. The id locator is ALSO scoped to
  // `#cg-grouping-body` (F-1, review): an id selector is unique regardless
  // of parent, so this is the one test in this describe block where
  // scoping is not already implied by getByLabel/getByText -- without it,
  // moving the switches anywhere else on the page would still measure the
  // same two elements and this test would never notice they had left
  // Grouping options.
  test(
    'the two sex switches meet the 44px touch target once open',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto('/classroom-groups');
      await expect(page.locator('#cg-sex-mix')).toBeHidden();

      const body = page.locator('#cg-grouping-body');
      await page.locator('#cg-grouping-toggle').click();
      const heights = await body
        .locator('#cg-sex-mix, #cg-sex-separate')
        .evaluateAll((els) =>
          els.map((el) => el.closest('label')!.getBoundingClientRect().height),
        );
      expect(heights).toHaveLength(2);
      expect(heights.every((h) => h >= 44)).toBe(true);
    },
  );

  // Stage 2's `test.fixme('a separate-mode spillover warning renders,
  // naming who')` stood here. DELETED, whole, per this task's own plan step
  // -- not "un-fixme'd": its body was comments only, so stripping the
  // `.fixme` would have produced a real `test()` with zero assertions,
  // which always passes under a name claiming coverage it does not have.
  // Its real replacement is `names who landed in a group of the other sex`
  // below, which drives the message through the page's own controls.
  //
  // The stage-2 comment justifying it also described
  // tests/unit/classroom-groups-script.test.ts as the code-level forcing
  // function that would redden the day `sexMode` stopped being a hard-coded
  // `'off'`. That day is today. It did redden, on purpose, and is deleted
  // too -- its job is done, and a test pinning a literal the product no
  // longer contains is a test pinning the bug as the contract.

  // G-03. Both switches share ONE condition, so both are asserted every
  // time: a fix that enabled only the one the test happened to name would
  // otherwise pass.
  test('enabled once every student being grouped has a sex', async ({
    page,
  }) => {
    await buildRoster(page, [
      ['M', 'Ana'],
      ['F', 'Budi'],
    ]);
    await page.locator('#cg-grouping-toggle').click();
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeEnabled();
    await expect(page.getByLabel('Keep boys and girls separate')).toBeEnabled();
    // The reason paragraph is not merely blank -- it is gone. A visible
    // empty `.why` box under two enabled switches is its own small defect.
    await expect(page.locator('#cg-sex-why')).toBeHidden();
  });

  // G-04 through the page. The unit tests already prove `sexWhy` excludes
  // absent students; this proves the page hands it a roster where `absent`
  // is actually set, which is the half a pure-function test cannot reach.
  test('an absent student with no sex does not disable them', async ({
    page,
  }) => {
    await buildRoster(page, [['M', 'Ana'], ['F', 'Budi'], [null]]);
    await page.locator('.cg-student').nth(2).getByLabel('Absent').check();
    await page.locator('#cg-grouping-toggle').click();
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeEnabled();
    await expect(page.getByLabel('Keep boys and girls separate')).toBeEnabled();
  });

  // G-07, the third message, and the whole reason `sexWhyReturning` exists.
  // Asserted as a WHOLE rendered sentence (CLAUDE.md), not a substring: the
  // count message would also contain the word "sex".
  test('unticking that absence disables them again, naming the student', async ({
    page,
  }) => {
    await buildRoster(page, [
      ['M', 'Ana'],
      ['F', 'Budi'],
      [null, 'Dewi'],
    ]);
    const dewi = page.locator('.cg-student').nth(2);
    await dewi.getByLabel('Absent').check();
    await page.locator('#cg-grouping-toggle').click();
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeEnabled();

    await dewi.getByLabel('Absent').uncheck();
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeDisabled();
    await expect(
      page.getByLabel('Keep boys and girls separate'),
    ).toBeDisabled();
    await expect(
      page.getByText(
        'Dewi is back and has no sex set. These options need one for every ' +
          'student being grouped.',
      ),
    ).toBeVisible();
  });

  // The other half of the same rule: a roster that was ALREADY shut gets
  // the count, not a name. Without this, an implementation that always
  // named somebody would pass the test above.
  test('a roster that was already shut gets the count, not a name', async ({
    page,
  }) => {
    await buildRoster(page, [
      ['M', 'Ana'],
      [null, 'Cahya'],
      [null, 'Dewi'],
    ]);
    await page.locator('.cg-student').nth(2).getByLabel('Absent').check();
    await page.locator('#cg-grouping-toggle').click();
    // Cahya alone still holds them shut, so this was never open.
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeDisabled();

    await page.locator('.cg-student').nth(2).getByLabel('Absent').uncheck();
    await expect(
      page.getByText(
        '2 of the 3 students being grouped have no sex set. Open Student ' +
          'details and set M or F for them to use these.',
      ),
    ).toBeVisible();
    await expect(page.getByText(/Dewi is back/)).toHaveCount(0);
  });

  // G-11, and stage 2's fixme discharged. Six boys and two girls, split
  // four to a group: the two girls cannot make a group of their own, so
  // they join one of boys and the engine says so.
  //
  // The plan's own snippet asserted 'Gita and Hadi are in a group of boys.'
  // -- a sentence that exists nowhere in this codebase. The real copy is
  // en.ts's `warnings.SEX_SPILLOVER`, asserted whole below. Its own
  // resolver turns student NUMBERS into names, so this also proves the
  // warning channel resolves them the same way the error channel does.
  test('separate mode names who landed in a group of the other sex', async ({
    page,
  }) => {
    await buildRoster(page, [
      ['M'],
      ['M'],
      ['M'],
      ['M'],
      ['M'],
      ['M'],
      ['F', 'Gita'],
      ['F', 'Sari'],
    ]);
    await page.locator('#cg-grouping-toggle').click();
    await page.getByLabel('Keep boys and girls separate').check();
    await page.getByLabel('Students in each group').fill('4');
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await expect(
      page.getByText(
        'Gita, Sari have joined a group of boys because there were not ' +
          'enough girls to make a group of their own. That is simply how ' +
          'the numbers divided, not a mistake to fix.',
      ),
    ).toBeVisible();
  });

  // The warning must not outlive the shuffle that produced it. Turning
  // separate mode back off and reshuffling leaves nothing to warn about,
  // and a stale warning under fresh groups is a lie about them.
  test('the warning clears on a shuffle that has nothing to warn about', async ({
    page,
  }) => {
    await buildRoster(page, [
      ['M'],
      ['M'],
      ['M'],
      ['M'],
      ['M'],
      ['M'],
      ['F', 'Gita'],
      ['F', 'Sari'],
    ]);
    await page.locator('#cg-grouping-toggle').click();
    await page.getByLabel('Keep boys and girls separate').check();
    await page.getByLabel('Students in each group').fill('4');
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await expect(page.getByText(/have joined a group of boys/)).toBeVisible();

    await page.getByLabel('Keep boys and girls separate').uncheck();
    await page.getByRole('button', { name: 'Shuffle again' }).first().click();
    await expect(page.getByText(/have joined a group of boys/)).toHaveCount(0);
  });
});

// The brief's own three tests above were only ever written in English;
// "assert whole rendered sentences, in both locales" (CLAUDE.md) applies
// regardless of what the brief's snippet happened to show.
test.describe('Grouping options — Indonesian', () => {
  test('holds both sex switches and the leftovers choice', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    // Same placement proof as the English describe block above (F-1,
    // review): hidden before the section opens, then visible and scoped
    // to `#cg-grouping-body` once it does.
    await expect(
      page.getByLabel('Campur siswa laki-laki dan perempuan secara merata'),
    ).toBeHidden();
    await expect(page.getByText('Jika ada siswa tersisa')).toBeHidden();

    const body = page.locator('#cg-grouping-body');
    await page.locator('#cg-grouping-toggle').click();
    await expect(
      body.getByLabel('Campur siswa laki-laki dan perempuan secara merata'),
    ).toBeVisible();
    await expect(
      body.getByLabel('Pisahkan siswa laki-laki dan perempuan'),
    ).toBeVisible();
    await expect(body.getByText('Jika ada siswa tersisa')).toBeVisible();
    await expect(body.getByLabel('Bagikan merata')).toBeChecked();
  });

  test('both switches are off by default', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await expect(
      page.getByLabel('Campur siswa laki-laki dan perempuan secara merata'),
    ).toBeHidden();

    const body = page.locator('#cg-grouping-body');
    await page.locator('#cg-grouping-toggle').click();
    await expect(
      body.getByLabel('Campur siswa laki-laki dan perempuan secara merata'),
    ).not.toBeChecked();
    await expect(
      body.getByLabel('Pisahkan siswa laki-laki dan perempuan'),
    ).not.toBeChecked();
  });

  test('with no list at all, both are disabled and say why', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await expect(
      page.getByLabel('Campur siswa laki-laki dan perempuan secara merata'),
    ).toBeHidden();

    const body = page.locator('#cg-grouping-body');
    await page.locator('#cg-grouping-toggle').click();
    await expect(
      body.getByLabel('Campur siswa laki-laki dan perempuan secara merata'),
    ).toBeDisabled();
    await expect(
      body.getByLabel('Pisahkan siswa laki-laki dan perempuan'),
    ).toBeDisabled();
    await expect(
      body.getByText(
        'Tambahkan siswa Anda di bagian Detail siswa dan atur L atau P untuk masing-masing agar bisa memakai opsi ini.',
      ),
    ).toBeVisible();
  });
});

// Stage 3, Task 9. The three sex-switch branches, driven through the page in
// Indonesian too -- CLAUDE.md's "assert whole rendered sentences, in both
// locales", and the more so here because the Indonesian copy for
// `sexWhyReturning` is a translation this stage wrote rather than approved
// spec copy. The roster's own controls carry Indonesian accessible names
// (`rosterColSex`/`rosterColAbsent` in id.ts), so this cannot reuse the
// English helpers' label regexes for the parts that differ.
test.describe('Grouping options, live from the roster — Indonesian', () => {
  const openRosterId = async (page: import('@playwright/test').Page) => {
    await page.goto('/id/classroom-groups');
    await page.locator('#cg-students-toggle').click();
    await page.getByRole('button', { name: 'Tambah siswa' }).click();
  };

  test('enabled once every student being grouped has a sex', async ({
    page,
  }) => {
    await openRosterId(page);
    await addSeveral(page, 1);
    await page
      .locator('.cg-student')
      .nth(0)
      .getByLabel('Jenis kelamin')
      .selectOption('M');
    await page
      .locator('.cg-student')
      .nth(1)
      .getByLabel('Jenis kelamin')
      .selectOption('F');
    await page.locator('#cg-grouping-toggle').click();
    await expect(
      page.getByLabel('Campur siswa laki-laki dan perempuan secara merata'),
    ).toBeEnabled();
    await expect(page.locator('#cg-sex-why')).toBeHidden();
  });

  test('unticking an absence disables them again, naming the student', async ({
    page,
  }) => {
    await openRosterId(page);
    await addSeveral(page, 2);
    await page
      .locator('.cg-student')
      .nth(0)
      .getByLabel('Jenis kelamin')
      .selectOption('M');
    await page
      .locator('.cg-student')
      .nth(1)
      .getByLabel('Jenis kelamin')
      .selectOption('F');
    const dewi = page.locator('.cg-student').nth(2);
    await dewi.getByLabel('Nama').fill('Dewi');
    await dewi.getByLabel('Tidak hadir').check();
    await page.locator('#cg-grouping-toggle').click();
    await expect(
      page.getByLabel('Campur siswa laki-laki dan perempuan secara merata'),
    ).toBeEnabled();

    await dewi.getByLabel('Tidak hadir').uncheck();
    await expect(
      page.getByLabel('Campur siswa laki-laki dan perempuan secara merata'),
    ).toBeDisabled();
    await expect(
      page.getByText(
        'Dewi sudah hadir kembali dan belum memiliki jenis kelamin. Opsi ini ' +
          'memerlukannya untuk setiap siswa yang dikelompokkan.',
      ),
    ).toBeVisible();
  });
});
