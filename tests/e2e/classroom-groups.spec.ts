import { test, expect, type Page } from '@playwright/test';

/**
 * Every assertion is web-first (auto-retrying). No fixed waits: the tool deals
 * cards on a timer, so a sleep would make these pass or fail on machine speed
 * rather than on the product.
 */

const fill = async (
  page: Page,
  opts: {
    count?: string;
    size?: string;
    /** Switches to "number of groups" mode and sets it. */
    groups?: string;
    speed?: 'normal' | 'fast' | 'skip';
  },
) => {
  if (opts.count !== undefined) await page.fill('#cg-count', opts.count);
  if (opts.size !== undefined) await page.fill('#cg-size', opts.size);
  if (opts.groups !== undefined) {
    await page.check('input[name="mode"][value="groupCount"]');
    await page.fill('#cg-groups', opts.groups);
  }
  // Default to skip so the tests assert the RESULT, not the show. The
  // animation gets its own test below.
  await page.selectOption('#cg-speed', opts.speed ?? 'skip');
};

test.describe('classroom group creator', () => {
  // Stage 2, Task 1's own RED tests. The brief's literal snippet used
  // `getByLabel('How many students?')` and `#cg-groups .group` — neither
  // matches this page: the label reads "Number of students" (`studentsLabel`
  // in en.ts) and `#cg-groups` is the "how many groups" NUMBER INPUT's id,
  // not the results container (that's `#cg-results`, as every other test in
  // this file already uses). Corrected to the real label and the real
  // selector rather than reproduced verbatim.
  test('shuffles anonymous students against the rewritten engine', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Number of students').fill('12');
    await page.getByRole('button', { name: 'Make groups' }).click();
    // 12 students at the default group size (4) => 3 groups.
    await expect(page.locator('#cg-results .group')).toHaveCount(3);
  });

  test('the paste-names box and the keep-apart box are gone', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-names')).toHaveCount(0);
    await expect(page.locator('#cg-apart')).toHaveCount(0);
  });

  // Two more tests retired along with the keep-apart box (#cg-apart) above
  // -- both fed `apart`, free text the rewritten engine no longer accepts
  // (see grouping.ts's GroupingInput). Their SUBJECTS are still alive and
  // worth reinstating once apart-letters are reachable from the page again:
  //
  // - 'explains an impossible keep-apart instead of failing silently':
  //   KEEP_APART_IMPOSSIBLE names the conflicting students and states how
  //   many groups they would need (src/lib/i18n/index.ts:113).
  // - 'an unarrangeable class is explained without accusing anyone':
  //   KEEP_APART_NO_ARRANGEMENT's promise that a refusal names NOBODY --
  //   proving no arrangement exists is not the same as blaming a student,
  //   and a later stage could silently re-break that
  //   (src/lib/i18n/index.ts:118).

  test('splits a class and shows every student exactly once', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await fill(page, { count: '22', size: '4' });
    await page.click('#cg-go');

    // 22 students in groups of 4 => 5 groups.
    await expect(page.locator('#cg-results .group')).toHaveCount(5);
    await expect(page.locator('#cg-results .student')).toHaveCount(22);
    await expect(page.locator('#cg-summary')).toContainText('22');
  });

  test('never makes a group smaller than the size asked for', async ({
    page,
  }) => {
    // The operator's core rule: 7 students in groups of 4 is ONE group of 7,
    // not 4 and 3.
    await page.goto('/classroom-groups');
    await fill(page, { count: '7', size: '4' });
    await page.click('#cg-go');

    await expect(page.locator('#cg-results .group')).toHaveCount(1);
    await expect(page.locator('#cg-results .student')).toHaveCount(7);
  });

  test('numbers students since there is no roster to name them from yet', async ({
    page,
  }) => {
    // The paste-names box is gone: it fed `students: string[]`, an input
    // shape the rewritten engine no longer accepts (see grouping.ts's
    // GroupingInput). Numbered students are the only mode there is until a
    // later stage brings a roster back, so this is the default case, not a
    // fallback from something else.
    //
    // Asserts the whole SET of labels, not `.first()`'s: placeBlocks in
    // grouping.ts shuffles block order with the real, unseeded Math.random
    // this page wires in, so which student renders first is never
    // deterministic -- only which four labels appear is. A substring check
    // (`toContainText('Student')`) would also pass for a malformed label
    // like "Student NaN" -- Student.number carries no whole/positive
    // validation on the record path (see the stage-2 ledger) -- so this
    // pins each full sentence, not a fragment of one.
    await page.goto('/classroom-groups');
    await fill(page, { count: '4', size: '2' });
    await page.click('#cg-go');
    const labels = await page.locator('#cg-results .student').allTextContents();
    expect(labels.sort()).toEqual([
      'Student 1',
      'Student 2',
      'Student 3',
      'Student 4',
    ]);
  });

  test('results are readable with the animation skipped', async ({ page }) => {
    // The whole accessibility argument: the answer exists as text regardless
    // of whether anyone watched it being dealt.
    await page.goto('/classroom-groups');
    await fill(page, { count: '8', size: '4', speed: 'skip' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .student')).toHaveCount(8);
    await expect(page.locator('#cg-results .student').first()).toBeVisible();
  });

  test('the animation deals every card and settles', async ({ page }) => {
    await page.goto('/classroom-groups');
    await fill(page, { count: '6', size: '3', speed: 'fast' });
    await page.click('#cg-go');
    // Auto-retries until the deal finishes — no timing bet.
    await expect(page.locator('#cg-results .student.dealt')).toHaveCount(6);
    await expect(page.locator('#cg-go')).toBeEnabled();
  });

  test('splits by number of groups, not just by group size', async ({
    page,
  }) => {
    // The whole second half of the "how to split them" fieldset — reachable
    // from the page, and until now asserted by nothing.
    await page.goto('/classroom-groups');
    await fill(page, { count: '20', groups: '3' });
    await page.click('#cg-go');

    await expect(page.locator('#cg-results .group')).toHaveCount(3);
    await expect(page.locator('#cg-results .student')).toHaveCount(20);
  });

  test('a mis-keyed class size is refused, not attempted', async ({ page }) => {
    // Before the cap this allocated 100 million objects and the tab died —
    // on a phone, taking the browser with it.
    await page.goto('/classroom-groups');
    await fill(page, { count: '100000000', size: '4' });
    await page.click('#cg-go');

    await expect(page.locator('#cg-error')).toHaveText(
      'That is more students than this tool will take. The most is 500.',
    );
    // Still alive and still usable, which is the actual claim.
    await expect(page.locator('#cg-go')).toBeEnabled();
    await expect(page.locator('#cg-results')).toBeHidden();
  });

  test('the summary reads as a sentence, singular included', async ({
    page,
  }) => {
    // The tool's own headline case, and the page has said "1 groups from 7
    // students." since it shipped. The old assertion was toContainText('22')
    // — a bare number, which would also have passed with the arguments the
    // wrong way round.
    await page.goto('/classroom-groups');
    await fill(page, { count: '7', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-summary')).toHaveText(
      '1 group from 7 students.',
    );

    await fill(page, { count: '22', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-summary')).toHaveText(
      '5 groups from 22 students.',
    );
  });

  test('the error clears the stale "Shuffle again" label', async ({ page }) => {
    await page.goto('/classroom-groups');
    await fill(page, { count: '8', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-go')).toHaveText('Shuffle again');

    // Now a refusal. Offering to reshuffle results that are no longer on
    // screen is an offer the page cannot keep.
    await fill(page, { count: '0', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-error')).toBeVisible();
    await expect(page.locator('#cg-go')).toHaveText('Make Groups');
  });

  test('the mute choice survives a reload', async ({ page }) => {
    await page.goto('/classroom-groups');
    // Sound is ON by default (operator decision).
    await expect(page.locator('#cg-sound')).toBeChecked();
    await page.uncheck('#cg-sound');
    await page.reload();
    await expect(page.locator('#cg-sound')).not.toBeChecked();
  });
});

// Stage 2, Task 5: the class name, and the results heading it optionally
// heads (design spec section 8). "Class name is optional. Blank is fine and
// nothing is blocked... It heads the results: `7B — your groups`... It is
// not repeated on every group card."
test.describe('class name and results heading', () => {
  // Corrected from task-5-brief.md's own snippet, which located the
  // "not repeated on cards" check at `#cg-groups` -- that id belongs to the
  // "how many groups" NUMBER INPUT on this page, not the results container
  // (`#cg-tables`, where the script actually appends group cards) -- the
  // same class of locator mistake Task 1/Task 2's own ledger entries
  // already record and correct.
  test('the class name heads the results, once', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Class (optional)').fill('7B');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('7B — your groups');
    await expect(page.locator('#cg-tables').getByText('7B')).toHaveCount(0);
  });

  // task-5-brief.md's own count (9 students at the page's default group
  // size, 4) predicted `#cg-groups .group` would have count 3. The engine's
  // own targetSizes (src/lib/grouping.ts) says otherwise: groupCount =
  // floor(9/4) = 2, not ceil -- the same "never smaller than the size you
  // asked for" rule this file already pins above ('never makes a group
  // smaller than the size asked for'). Confirmed against grouping.test.ts's
  // own "Derivation: base = floor(9/4) = 2, remainder = 9 - 8 = 1" comment
  // before writing this, rather than trusting the brief's arithmetic.
  // Honestly: this passes even before #cg-class exists, since it never
  // references the field at all -- confirmed, not assumed, by running it
  // against the untouched page before implementing anything (RED baseline).
  // It is not decoration, though: it pins the exact branch
  // resultsHeadingText takes when nothing was typed, which is the same
  // branch a teacher who never opens the class field exercises on the real
  // page. What would redden it: a bug in that blank check (e.g. reading
  // `classInput.value` before it exists, or comparing against `''` without
  // `.trim()` so a later whitespace-only fix regresses), or the page's own
  // default group size changing out from under the `.toHaveCount(2)` below.
  test('a blank class name blocks nothing', async ({ page }) => {
    await page.goto('/classroom-groups');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('Your groups');
    await expect(page.locator('#cg-results .group')).toHaveCount(2);
    await expect(page.locator('#cg-results .student')).toHaveCount(9);
  });

  // Design spec section 8 says blank "blocks nothing" -- a teacher who
  // fat-fingers the space bar has not typed a name a class would recognise
  // as its own either. Distinct from the never-filled case above: this is
  // the one place the `.trim()` blank-test is proven through the real
  // control, not just the pure function (tests/unit/i18n.test.ts covers
  // resultsHeadingText directly).
  test('a class name of only spaces is treated as no class name', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Class (optional)').fill('   ');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('Your groups');
  });

  // Corrected from task-5-brief.md's own `#cg-groups .group h3` locator --
  // same mistake as above. Filling the class field first is what makes this
  // a real test of THIS task's own wiring rather than a pin of
  // stage-3-owned behaviour: a naive implementation that broke
  // render()/groupName()'s call order while adding the heading write would
  // show up here. The claim "groups are always numbered" -- i.e. that the
  // theme picker and the naming radio are gone -- is stage 3's own removal
  // (design spec section 3, delivery item 3) and is NOT re-tested here;
  // this only pins that setting a class name does not disturb today's
  // numbered DEFAULT.
  test('groups stay numbered when a class name is set', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Class (optional)').fill('7B');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .group h3').first()).toHaveText(
      'Group 1',
    );
  });

  // "A teacher's typed text is theirs" -- the class name reaches the DOM
  // through `.textContent`, never `.innerHTML` (classroom-groups.ts), the
  // same rule the results grid already follows for a student's name (see
  // that file's own comment on `who.textContent = label(student)`). Proven
  // by a payload that would look completely different if it were EVER
  // parsed as markup: an `<img>` tag consumed as an element would vanish
  // from the rendered TEXT and its `onerror` would fire (a dialog opening)
  // -- so the exact literal string surviving, with no `<img>` ELEMENT ever
  // created and no dialog raised, is the only way this test can pass.
  test('a class name is rendered literally, HTML metacharacters included', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    let dialogFired = false;
    page.on('dialog', (d) => {
      dialogFired = true;
      void d.dismiss();
    });
    const raw = '<img src=x onerror=alert(1)>7B & "Sons"';
    await page.getByLabel('Class (optional)').fill(raw);
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText(
      `${raw} — your groups`,
    );
    await expect(page.locator('#cg-results-h img')).toHaveCount(0);
    expect(dialogFired).toBe(false);
  });

  // Design spec section 9: "The class name is made safe for a filename, and
  // only there... The class name itself is never altered -- not on the
  // page, not in the `# Class:` line, not in the results heading."
  // Filenames are stage 4's own scope, but that line's promise about the
  // results heading is testable now, so it is pinned now rather than left
  // to whichever task builds the filename. A slash is the design doc's own
  // example of a filename-unsafe character (`Year 7 / Set B`).
  test('filename-unsafe characters reach the heading unaltered', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Class (optional)').fill('Year 7 / Set B');
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText(
      'Year 7 / Set B — your groups',
    );
  });

  // CLAUDE.md's own rule: no horizontal scroll at >= 320px, in any state. A
  // class name has no length limit (MAX_ROSTER is stage 3's, and governs
  // the roster, not this field), so an unbroken long name is a real input,
  // not a contrived one -- ordinary word-wrapping cannot help a single
  // token with no spaces, which is exactly why this is a genuine check of
  // `#cg-results-h`'s own `overflow-wrap: anywhere` rather than something
  // normal text wrapping would already have covered.
  test('a very long class name does not force the page to scroll sideways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/classroom-groups');
    await page.getByLabel('Class (optional)').fill('x'.repeat(300));
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // The class name is read fresh at every submit (classroom-groups.ts), not
  // captured once -- a second shuffle with a different name in the field
  // must show the NEW name, not the first one cached. This is about the
  // correctness of THIS task's own wiring, not the staleness/dimming
  // behaviour a later task owns (design spec section 8's "when the class
  // changes after a shuffle") -- nothing here asserts the old groups are
  // marked out of date, only that the heading itself keeps up.
  test('a changed class name is picked up on the next shuffle', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    const classField = page.getByLabel('Class (optional)');
    await classField.fill('7B');
    await fill(page, { count: '8', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('7B — your groups');

    await classField.fill('8C');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('8C — your groups');
  });
});

test.describe('classroom group creator — Bahasa Indonesia', () => {
  test('the Indonesian page is genuinely in Indonesian', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(page.locator('h1')).toHaveText('Pembuat Kelompok Kelas');
    await expect(page.locator('#cg-go')).toHaveText('Buat Kelompok');
  });

  test('anonymous students are labelled in Indonesian', async ({ page }) => {
    // Same whole-set assertion as the English cover above, for the same
    // reason: render order is genuinely shuffled, and a substring would
    // also pass for a malformed "Siswa NaN".
    await page.goto('/id/classroom-groups');
    await fill(page, { count: '4', size: '2' });
    await page.click('#cg-go');
    const labels = await page.locator('#cg-results .student').allTextContents();
    expect(labels.sort()).toEqual(['Siswa 1', 'Siswa 2', 'Siswa 3', 'Siswa 4']);
  });

  test('errors are shown in Indonesian, not English', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await fill(page, { count: '0', size: '2' });
    await page.click('#cg-go');
    const error = page.locator('#cg-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('Tambahkan siswa');
  });

  // Mirrors the English 'class name and results heading' describe block
  // above -- "assert whole rendered sentences, in both locales" applies
  // regardless of what task-5-brief.md's own snippet happened to show (it
  // was English-only).
  test('the class name heads the results, once', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await page.getByLabel('Kelas (opsional)').fill('7B');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText(
      '7B — kelompok Anda',
    );
    await expect(page.locator('#cg-tables').getByText('7B')).toHaveCount(0);
  });

  // Same honesty note as the English version above: passes before
  // #cg-class exists too, for the same reason (never references the
  // field), confirmed against the RED baseline rather than assumed.
  test('a blank class name blocks nothing', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('Kelompok Anda');
    await expect(page.locator('#cg-results .group')).toHaveCount(2);
  });
});

test.describe('site-wide language switching', () => {
  test('the switcher moves between the two versions of the SAME page', async ({
    page,
  }) => {
    // The classic i18n bug is a switcher that dumps you on the homepage.
    await page.goto('/classroom-groups');
    await page.click('header a.lang');
    await expect(page).toHaveURL(/\/id\/classroom-groups\/?$/);
    await page.click('header a.lang');
    await expect(page).toHaveURL(/\/classroom-groups\/?$/);
  });

  for (const [path, heading] of [
    [
      '/id/',
      'Kami membangun perangkat lunak khusus — dipercepat AI, sepenuhnya milik Anda.',
    ],
    ['/id/glory-points', 'Kalkulator Glory Points'],
  ] as const) {
    test(`${path} is translated`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', 'id');
      await expect(page.locator('h1')).toHaveText(heading);
    });
  }

  test('Indonesian nav links stay inside Indonesian — and read as Indonesian', async ({
    page,
  }) => {
    await page.goto('/id/');
    await expect(page.locator('nav a[href="/id/#services"]')).toHaveCount(1);
    // The hrefs were asserted; the WORDS were not. An entirely English nav
    // bar on every Indonesian page passed the whole suite.
    await expect(page.locator('nav a')).toHaveText([
      'Layanan',
      'Karya',
      'Kontak',
    ]);
  });

  test('the Indonesian homepage links to the Indonesian tools', async ({
    page,
  }) => {
    // localisePath's own doc comment calls this "the classic i18n bug", and
    // nothing asserted it anywhere: an Indonesian visitor clicking a work
    // card landed on the English page.
    await page.goto('/id/');
    await expect(
      page.locator('#work a[href="/id/classroom-groups"]'),
    ).toHaveCount(1);
    await expect(page.locator('#work a[href="/id/glory-points"]')).toHaveCount(
      1,
    );
    await expect(page.locator('#work a[href="/classroom-groups"]')).toHaveCount(
      0,
    );
  });

  test.describe('what each page tells a search engine', () => {
    // Asserted by VALUE. Counting the tags cannot tell the difference between
    // a correct alternate and every page on the site advertising the
    // Indonesian homepage as its translation.
    const SITE = 'https://shyden.co.uk';
    for (const [path, self, other, locale] of [
      ['/', '/', '/id/', 'en_GB'],
      ['/id/', '/id/', '/', 'id_ID'],
      [
        '/classroom-groups',
        '/classroom-groups/',
        '/id/classroom-groups/',
        'en_GB',
      ],
      [
        '/id/classroom-groups',
        '/id/classroom-groups/',
        '/classroom-groups/',
        'id_ID',
      ],
      ['/glory-points', '/glory-points/', '/id/glory-points/', 'en_GB'],
      ['/id/glory-points', '/id/glory-points/', '/glory-points/', 'id_ID'],
    ] as const) {
      test(`${path}`, async ({ page }) => {
        await page.goto(path);
        const isId = locale === 'id_ID';
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          'href',
          SITE + self,
        );
        await expect(
          page.locator('link[rel="alternate"][hreflang="id"]'),
        ).toHaveAttribute('href', SITE + (isId ? self : other));
        await expect(
          page.locator('link[rel="alternate"][hreflang="en"]'),
        ).toHaveAttribute('href', SITE + (isId ? other : self));
        // English is x-default, the correct convention for the unprefixed
        // locale — and asserted nowhere before this.
        await expect(
          page.locator('link[rel="alternate"][hreflang="x-default"]'),
        ).toHaveAttribute('href', SITE + (isId ? other : self));
        await expect(
          page.locator('meta[property="og:locale"]'),
        ).toHaveAttribute('content', locale);
        await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
          'content',
          SITE + self,
        );
      });
    }
  });

  test('the 404 answers in both languages', async ({ page }) => {
    // Cloudflare Pages serves this one file for any unknown path, including
    // /id/*, so an Indonesian visitor must not be stranded in English.
    const response = await page.goto('/definitely-not-a-page');
    expect(response?.status()).toBe(404);
    await expect(page.locator('body')).toContainText('Page not found');
    await expect(page.locator('body')).toContainText('Halaman tidak ditemukan');
  });
});
