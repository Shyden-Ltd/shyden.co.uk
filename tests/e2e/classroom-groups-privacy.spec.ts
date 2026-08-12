import { test, expect } from './fixtures';
import {
  buildRoster,
  buildRosterAtPath,
  upload,
  downloadName,
} from './helpers';

/**
 * The page makes a promise in both languages: "No class list ever leaves this
 * page." These tests are that promise, written down.
 *
 * The threat is not an attacker — it is the form working exactly as HTML says
 * it should. A <form> with no action submits to its OWN url as a GET, so any
 * control carrying a `name` puts its value in the address bar, the browser's
 * history and the server's access log. That happens whenever the submit
 * listener is not attached, which is a real state: JavaScript blocked by a
 * school filter, a 404'd bundle after a partial deploy, or a top-level throw
 * before the listener registers.
 *
 * So the door is closed at the markup: no control holding anything a teacher
 * typed carries a `name` at all. The radio groups keep theirs because `name`
 * is what makes a radio group a group — but "students per group" is not
 * personal data.
 */

/**
 * `name`s that may legitimately appear in a submitted form.
 *
 * Stage 3, Task 8 removed `naming` -- the radio choosing "Group 1, 2, 3…"
 * versus "Use a theme" -- along with the theme picker it revealed (design
 * spec section 5). Groups are always numbered now, so there is nothing
 * left for a radio group of that name to choose between.
 */
const NON_PERSONAL_NAMES = ['mode', 'leftovers'];

test.describe('privacy — the class list cannot leave the page', () => {
  for (const path of ['/classroom-groups', '/id/classroom-groups']) {
    test(`${path}: no control holding typed text is submittable`, async ({
      page,
    }) => {
      await page.goto(path);

      // Every named control in the form, by tag and type.
      const named = await page.locator('#cg-form [name]').evaluateAll((els) =>
        els.map((el) => ({
          name: el.getAttribute('name'),
          type: (el as HTMLInputElement).type,
        })),
      );

      expect(named.length).toBeGreaterThan(0); // the radios are still there

      // A `name` on anything but a radio is a leak waiting for a broken
      // script. This fails the moment someone adds one back.
      const leaky = named.filter((c) => c.type !== 'radio');
      expect(leaky).toEqual([]);

      const radioNames = [...new Set(named.map((c) => c.name))].sort();
      expect(radioNames).toEqual([...NON_PERSONAL_NAMES].sort());
    });
  }
});

test.describe('privacy — with JavaScript blocked', () => {
  test.use({ javaScriptEnabled: false });

  for (const [path, notice] of [
    ['/classroom-groups', 'This tool needs JavaScript enabled.'],
    ['/id/classroom-groups', 'Alat ini memerlukan JavaScript yang aktif.'],
  ] as const) {
    test(
      `${path}: says so, in its own language`,
      { tag: '@requires-isolated-context' },
      async ({ page }) => {
        await page.goto(path);
        // Not "a noscript tag exists" — the sentence a visitor actually reads.
        await expect(page.locator('#cg-noscript')).toHaveText(notice);
      },
    );
  }

  // Code review on this task (I-3): `#cg-howto-body` used to ship `hidden`
  // in the raw markup, which meant a visitor without JavaScript got the
  // heading, the lead and the privacy line, and a dead `▸ How to use`
  // header — the one paragraph naming WHO this is for and WHY it exists
  // (design spec section 3, part 1) was unreachable. Fixed by shipping that
  // element unhidden and having the JS-only inline script collapse it
  // instead (ClassroomGroupsPage.astro's own comment on `#cg-howto-body`
  // has the full reasoning). `javaScriptEnabled: false` on this describe
  // block means that script never runs, so the raw markup below is exactly
  // what a real script-disabled visitor gets — not a proxy for it.
  for (const [path, whoAndWhy] of [
    [
      '/classroom-groups',
      'Built for teachers, by Shyden. Splitting a class fairly takes time you do not have, and doing it by hand invites an argument about favourites. This does it in one press — free, with no sign-up, and with nothing about your class ever leaving your browser.',
    ],
    [
      '/id/classroom-groups',
      'Dibuat untuk para guru, oleh Shyden. Membagi kelas dengan adil memakan waktu yang tidak Anda miliki, dan melakukannya secara manual mengundang perdebatan soal pilih kasih. Ini melakukannya dalam satu tekan — gratis, tanpa perlu mendaftar, dan tidak ada data kelas Anda yang pernah meninggalkan peramban Anda.',
    ],
  ] as const) {
    test(
      `${path}: the who-and-why copy is reachable without JavaScript`,
      { tag: '@requires-isolated-context' },
      async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('#cg-howto-body')).toBeVisible();
        await expect(page.locator('#cg-howto-body > p')).toHaveText(whoAndWhy);
      },
    );
  }

  // M-10 (stage-2 traceability matrix; design spec section 13's own "The
  // no-JS message is unchanged... the new sections do not each need their
  // own"). Stage 2, Task 7 folded Sound & animation into the tool's fourth
  // collapsible section -- proving the SAME single notice still covers it
  // is what keeps this row honestly ticked, rather than assumed true
  // because it was true of the first three. What would redden this: a
  // second `<noscript>` added anywhere on the page, e.g. one guarding the
  // new section specifically -- exactly the mistake this row exists to
  // catch, since without script NONE of the four sections can be opened at
  // all and one notice already says why.
  test(
    'one notice still covers all four sections, not one each',
    { tag: '@requires-isolated-context' },
    async ({ page }) => {
      await page.goto('/classroom-groups');
      await expect(page.locator('noscript')).toHaveCount(1);
    },
  );

  test(
    'submitting cannot put a class list in the URL',
    { tag: '@requires-isolated-context' },
    async ({ page }) => {
      await page.goto('/classroom-groups');

      // A teacher fills the form in and presses the button before noticing the
      // notice. With no listener attached, this is a native GET. The
      // paste-names box that used to carry typed names is gone (it fed
      // `students: string[]`, an input shape the rewritten engine no longer
      // accepts -- see grouping.ts's GroupingInput). What remains general on
      // purpose, rather than naming fields one at a time: the query string a
      // native submit produces may contain ONLY the allow-list, so a `name`
      // added to any future data field fails here the moment it is added,
      // before it carries anything that looks personal.
      //
      // Stage 2, Task 5 gave this page its first typed-text control since
      // that box was removed: #cg-class. It carries no `name` (see that
      // field's own comment in ClassroomGroupsPage.astro), so the structural
      // guarantee above already covers it with no change needed -- an unnamed
      // control cannot be serialised into a form GET at all. Filled here
      // anyway, with a value distinctive enough to be unmistakable, so the
      // proof is concrete rather than resting on that guarantee alone.
      await page.fill('#cg-count', '24');
      await page.fill('#cg-class', 'PrivacyProbeClassName7B');
      await page.click('#cg-go');

      const url = new URL(page.url());
      for (const key of url.searchParams.keys()) {
        expect(NON_PERSONAL_NAMES).toContain(key);
      }
      expect(url.search).not.toContain('PrivacyProbeClassName7B');
    },
  );
});

test.describe('privacy — when the script dies half-way', () => {
  /**
   * The barrier that matters is the one that holds in states nobody
   * enumerated. This breaks the module at a line in the MIDDLE — after setup
   * has begun, before the submit handler is reached — which is the shape of
   * every future bug that has not been written yet.
   *
   * The tool is dead here and that is not what is being asserted. What is
   * asserted is that a dead tool is still a silent one.
   */
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        get: () => () => {
          throw new Error('matchMedia unavailable');
        },
      });
    });
  });

  test('a mid-module failure still cannot leak the class list', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.fill('#cg-count', '8');
    await page.click('#cg-go');

    // No native submit happened, so no query string exists at all — not even
    // the harmless radio values. That is the unconditional guard registered
    // as the module's first statement, and it does not care what was typed
    // into the form, so filling the count field alone still proves it.
    expect(new URL(page.url()).search).toBe('');
  });
});

test.describe('privacy — when storage is unavailable', () => {
  /**
   * Safari's "Block all cookies", storage-partitioned contexts and some MDM
   * profiles throw SecurityError on localStorage access. The sound preference
   * is decoration; failing to read it must not take the tool down with it,
   * because a dead script is exactly the state that leaks the class list.
   */
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const boom = () => {
        throw new DOMException('denied', 'SecurityError');
      };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => ({ getItem: boom, setItem: boom, removeItem: boom }),
      });
    });
  });

  test('the tool still makes groups', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.fill('#cg-count', '8');
    await page.fill('#cg-size', '4');
    // #cg-speed sits inside #cg-sound-body since Stage 2, Task 7.
    await page.locator('#cg-sound-toggle').click();
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');

    await expect(page.locator('#cg-results .student')).toHaveCount(8);
  });

  test('and the sound toggle still works, it just cannot remember', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-sound-toggle').click();
    await expect(page.locator('#cg-sound-check')).toBeChecked();
    await page.uncheck('#cg-sound-check');
    // The label still tracks the control — the write failed, silently and
    // correctly, without breaking the widget.
    await expect(page.locator('#cg-sound-text')).toHaveText('Sound off');
  });

  // Code review on this task (I-3): the raw markup now ships How to use
  // EXPANDED (see ClassroomGroupsPage.astro's own comment on
  // `#cg-howto-body`), so the synchronous inline script must actively
  // collapse it — including when reading the stored preference throws,
  // this block's own scenario. Checking the state after the page has fully
  // loaded is not enough to prove that on its own: classroom-groups.ts's
  // deferred module reads the identical key the identical way, wrapped in
  // its own try/catch, and would collapse the section a moment later
  // regardless of what the inline script did — a real safety net, but one
  // that would mask a mutant that left the inline script's own throw path
  // doing nothing, at the cost of the exact expanded-then-collapsed flash a
  // JavaScript-enabled visitor would see and a same-final-state test would
  // never catch. Blocking the deferred module's own request removes that
  // net, so what is left standing here is the inline script alone.
  test('the inline script alone collapses How to use on a storage throw', async ({
    page,
  }) => {
    await page.route('**/_astro/ClassroomGroupsPage*.js', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: '',
      }),
    );
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-howto-body')).toBeHidden();
    await expect(page.locator('#cg-howto-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

/**
 * Stage 3, Task 10 (Y-01…Y-04, R-12). The blocks above close the door at
 * the MARKUP -- no control carrying typed text is submittable, so a broken
 * script cannot put a class list in the address bar. These close it at
 * RUNTIME: the roster now exists as real, named, editable rows, and the
 * promise the page makes in both languages ("No class list ever leaves this
 * page") has to survive every operation that could have written one
 * somewhere, not just page load.
 *
 * Asserted AFTER each operation rather than once at the end, deliberately:
 * a write that happened during editing and was cleared before the shuffle
 * would pass a single check at the end and still have leaked.
 */
test.describe('privacy — the roster never leaves memory', () => {
  /** Storage, session storage and the address bar, in one read. */
  const everywhereItCouldHide = (page: import('@playwright/test').Page) =>
    page.evaluate(() => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
      url: location.href,
      // Cookies too -- the plan's own snippet checked the first three, but
      // a cookie is the fourth place a name could be written to and the
      // one nothing else in this suite looks at.
      cookies: document.cookie,
    }));

  const expectNothingStored = async (
    page: import('@playwright/test').Page,
    when: string,
  ) => {
    const stored = await everywhereItCouldHide(page);
    for (const [where, value] of Object.entries(stored)) {
      expect(value, `${where} — ${when}`).not.toContain('Ana');
      expect(value, `${where} — ${when}`).not.toContain('Budi');
    }
  };

  test('nothing about the class is stored, after every operation', async ({
    page,
  }) => {
    // `buildRoster` opens the section itself -- the plan's snippet called
    // `openRoster` first as well, which would have TOGGLED #cg-students
    // shut again and left every later locator waiting on a hidden row.
    await buildRoster(page, [
      ['F', 'Ana'],
      ['M', 'Budi'],
    ]);
    await expectNothingStored(page, 'after building the roster');

    await page.locator('.cg-student').first().getByLabel('Absent').check();
    await expectNothingStored(page, 'after marking a student absent');

    await page.getByRole('button', { name: 'Make Groups' }).click();
    await expect(page.locator('#cg-results .group').first()).toBeVisible();
    await expectNothingStored(page, 'after shuffling');

    // POSITIVE CONTROL. Everything above passes trivially if storage is
    // simply unreadable in this context, or if `everywhereItCouldHide` is
    // looking in the wrong place -- and a privacy test that cannot fail is
    // worth nothing. So: change the one thing design spec section 11 DOES
    // allow this page to remember, and prove the same read sees it land.
    //
    // Note the shape of what appears -- `cg-sound: "off"`. A preference,
    // under a fixed key, with a value from a fixed set. That is the whole
    // of what this tool is permitted to persist, and it is why the
    // assertions above can be as blunt as "the word Ana is nowhere".
    await page.locator('#cg-sound-toggle').click();
    await page.uncheck('#cg-sound-check');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('cg-sound')))
      .toBe('off');
    await expectNothingStored(page, 'after a preference was written');
  });

  test('a reload loses the roster', async ({ page }) => {
    await buildRoster(page, [['F', 'Ana']]);
    await page.reload();
    await page.locator('#cg-students-toggle').click();
    await expect(page.locator('.cg-student')).toHaveCount(0);
  });

  /**
   * R-12, and the defect this whole stage exists to fix: identity is the
   * NUMBER, never the name. Two children called Ana are two children.
   *
   * The plan's own assertion here was `expect(#cg-groups).toContainText
   * ('Ana')` -- wrong selector (that id is the "how many groups" number
   * input; the results container is `#cg-results`, the fifth time this
   * stage has had to make that correction) and, more importantly, an
   * assertion that passes as long as the word "Ana" appears ANYWHERE. It
   * would pass just as well under the name-collapsing engine it is meant
   * to rule out. Replaced with the two facts that actually distinguish
   * them: BOTH Anas are placed, and the apart letter constrains only the
   * one row that carries it.
   */
  test('two children called Ana are separated independently', async ({
    page,
  }) => {
    await buildRoster(page, [
      ['F', 'Ana'],
      ['F', 'Ana'],
      ['M', 'Budi'],
      ['M', 'Eko'],
    ]);
    // Student 1 (the first Ana) and student 3 (Budi) must not meet.
    //
    // 'A', not the plan's 'X': the Apart dropdown offers only the letters
    // in use plus ONE more (`availableLetters`, src/lib/roster.ts -- the
    // list grows as letters are taken, so a fresh roster offers exactly
    // "A"). Selecting 'X' waits forever on an option the page has no
    // reason to render. Found by running it.
    await page
      .locator('.cg-student')
      .nth(0)
      .getByLabel('Apart')
      .selectOption('A');
    await page
      .locator('.cg-student')
      .nth(2)
      .getByLabel('Apart')
      .selectOption('A');
    await page.getByLabel('Number of groups').check();
    await page.getByLabel('How many groups').fill('2');
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await expect(page.locator('#cg-results .group').first()).toBeVisible();

    // Both Anas are on the sheet. Under a name-matching engine the second
    // would have been folded into the first and only one would appear.
    await expect(
      page.locator('#cg-results .student').getByText('Ana'),
    ).toHaveCount(2);
    await expect(page.locator('#cg-results .student')).toHaveCount(4);

    // `data-number` (Stage 3, Task 9) is the identity, on the element --
    // so which group each student landed in is readable without going
    // through their name, which is the whole point being proven.
    const groupOf = (n: number) =>
      page
        .locator('#cg-results .group')
        .filter({ has: page.locator(`.student[data-number="${n}"]`) });
    // The two rows carrying X are in different groups -- identified by
    // each card's own heading ("Group 1"/"Group 2"), which is the only
    // per-group identity the rendered sheet actually carries.
    const [anaGroup, budiGroup] = await Promise.all([
      groupOf(1).locator('h3').textContent(),
      groupOf(3).locator('h3').textContent(),
    ]);
    expect(anaGroup).toMatch(/^Group \d+$/);
    expect(anaGroup).not.toBe(budiGroup);
    // ...and the SECOND Ana carries no letter, so she is placed freely.
    // Asserted as "she is placed at all, in exactly one group" rather than
    // "she is with Budi", which the shuffle is free to decide either way.
    await expect(groupOf(2)).toHaveCount(1);
  });
});

/**
 * Stage 4, Task 7. Y-01…Y-04 re-asserted after the paths stage 4 added.
 *
 * Import, export and the handover are three new opportunities to write
 * something somewhere. The invariant is re-checked after each rather than
 * assumed to hold because it held before them -- which is the whole reason
 * the stage-3 block above checks after EACH operation rather than once at
 * the end.
 */
test.describe('privacy — the roster still never persists, after the new paths', () => {
  const nowhere = async (
    page: import('@playwright/test').Page,
    when: string,
  ) => {
    const seen = await page.evaluate(() =>
      [
        JSON.stringify({ ...localStorage }),
        JSON.stringify({ ...sessionStorage }),
        location.href,
        document.cookie,
      ].join(' '),
    );
    expect(seen, when).not.toContain('Ana');
    expect(seen, when).not.toContain('Budi');
  };

  test('an import writes nothing', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-io-toggle').click();
    await upload(page, 'ok.csv', 'number,name\n1,Ana\n2,Budi\n');
    await expect(page.getByText('Imported 2 students.')).toBeVisible();
    await nowhere(page, 'after an import');
  });

  test('an export writes nothing, and leaves no object URL behind', async ({
    page,
  }) => {
    await buildRoster(page, [
      ['F', 'Ana'],
      ['M', 'Budi'],
    ]);
    await page.locator('#cg-io-toggle').click();
    await downloadName(page, 'Export class list');
    await nowhere(page, 'after an export');
    // The blob URL is revoked the moment the click is dispatched, so no
    // <a> holding the file's bytes is left in the document -- see
    // io-ui.ts's own `download` for why that matters here.
    expect(
      await page.evaluate(
        () => document.querySelectorAll('a[href^="blob:"]').length,
      ),
    ).toBe(0);
  });

  test('the handover writes nothing in either tab', async ({
    page,
    context,
  }) => {
    await buildRosterAtPath(page, '/classroom-groups', [
      ['F', 'Ana'],
      ['M', 'Budi'],
    ]);
    await page.locator('#cg-io-toggle').click();
    const [, newPage] = await Promise.all([
      page.waitForEvent('download'),
      context.waitForEvent('page'),
      page.getByRole('button', { name: /other language/ }).click(),
    ]);
    await newPage.waitForLoadState();
    await newPage.locator('#cg-students-toggle').click();
    await expect(newPage.locator('.cg-student')).toHaveCount(2);
    await nowhere(page, 'source tab after the handover');
    await nowhere(newPage, 'receiving tab after the handover');
  });

  test('a reload after an import still loses the roster', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-io-toggle').click();
    await upload(page, 'ok.csv', 'number,name\n1,Ana\n');
    await expect(page.getByText('Imported 1 student.')).toBeVisible();
    await page.reload();
    await page.locator('#cg-students-toggle').click();
    await expect(page.locator('.cg-student')).toHaveCount(0);
  });
});
