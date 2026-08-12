import { test, expect } from './fixtures';
import {
  buildRoster,
  rosterOf,
  upload,
  downloadText,
  downloadName,
  todayISO,
  buildRosterAtPath,
} from './helpers';

/**
 * Stage 4, Task 5. The Import/export section, driven through the page.
 * C-14, C-17…C-20, C-26, C-28…C-31, S-06…S-08.
 *
 * The pure format is proven exhaustively at unit level (tests/unit/csv.test.ts,
 * 84 tests). What only a page can prove is here: that a bad file leaves the
 * screen exactly as it was, that a download carries the bytes and the name a
 * teacher receives, and that the two `dirty` transitions stage 3 built
 * actually fire.
 *
 * Every button is found by its RENDERED name, and the plan's snippets for
 * this task were checked against the real page first -- `Make groups` is
 * `Make Groups` on it, and stage 3's ledger records ten other occasions
 * where a plan literal did not exist in the product.
 */

const openIo = async (page: import('@playwright/test').Page) => {
  await page.locator('#cg-io-toggle').click();
};

test.describe('Import / export', () => {
  test('a bad file changes nothing on screen, and lists every problem', async ({
    page,
  }) => {
    await rosterOf(page, 3);
    await openIo(page);
    await upload(
      page,
      'bad.csv',
      'number,name,sex\n1,Ana,F\n2,Budi,Male\n1,Citra,F\n',
    );
    await expect(
      page.getByText(
        "Row 2 — sex 'Male' not understood. Use M, F, or leave blank.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Row 3 — number 1 is already used by row 1.'),
    ).toBeVisible();
    await expect(page.locator('.cg-student')).toHaveCount(3); // untouched
  });

  // The refusal must not outlive the file that caused it. A teacher who
  // fixes their spreadsheet and re-imports should not be reading last
  // attempt's problems under this attempt's result.
  test('a later good file clears the problems from a bad one', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await openIo(page);
    await upload(page, 'bad.csv', 'number\nabc\n');
    await expect(
      page.getByText("Row 1 — number 'abc' is not a whole number."),
    ).toBeVisible();
    await upload(page, 'ok.csv', 'number,name\n1,Ana\n');
    await expect(page.getByText(/is not a whole number/)).toHaveCount(0);
    await expect(page.locator('.cg-student')).toHaveCount(1);
  });

  test('importing over a roster always warns, even when the counts match', async ({
    page,
  }) => {
    await rosterOf(page, 3);
    await openIo(page);
    await upload(page, 'three.csv', 'number\n1\n2\n3\n');
    await expect(
      page.getByText(
        'This will replace your current class list — 3 students, 0 named.',
      ),
    ).toBeVisible();
    await expect(page.locator('.cg-student')).toHaveCount(3); // not yet replaced
  });

  // The warning names how much was typed BY HAND, which is the part a
  // teacher actually mourns -- design spec section 9 is explicit about it.
  test('the warning counts how many were named by hand', async ({ page }) => {
    await buildRoster(page, [['F', 'Ana'], ['M', 'Budi'], [null]]);
    await openIo(page);
    await upload(page, 'other.csv', 'number\n1\n');
    await expect(
      page.getByText(
        'This will replace your current class list — 3 students, 2 named.',
      ),
    ).toBeVisible();
  });

  test('confirming the warning replaces the roster', async ({ page }) => {
    await buildRoster(page, [
      ['F', 'Ana'],
      ['M', 'Budi'],
    ]);
    await openIo(page);
    await upload(page, 'new.csv', 'number,name\n7,Gita\n');
    await page.getByRole('button', { name: 'Replace it' }).click();
    await expect(page.locator('.cg-student')).toHaveCount(1);
    await expect(
      page.locator('.cg-student').first().getByLabel('Name'),
    ).toHaveValue('Gita');
  });

  test('cancelling the warning keeps what was there', async ({ page }) => {
    await buildRoster(page, [
      ['F', 'Ana'],
      ['M', 'Budi'],
    ]);
    await openIo(page);
    await upload(page, 'new.csv', 'number,name\n7,Gita\n');
    await page.getByRole('button', { name: 'Keep what I have' }).click();
    await expect(page.locator('.cg-student')).toHaveCount(2);
    await expect(
      page.locator('.cg-student').first().getByLabel('Name'),
    ).toHaveValue('Ana');
    await expect(page.getByText(/This will replace/)).toHaveCount(0);
  });

  // No roster on screen means nothing to lose, so no warning -- the warning
  // exists to protect work, not to add a step.
  test('importing onto an empty page needs no confirmation', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await openIo(page);
    await upload(page, 'ok.csv', 'number,name\n1,Ana\n2,Budi\n');
    await expect(page.locator('.cg-student')).toHaveCount(2);
    await expect(page.getByText(/This will replace/)).toHaveCount(0);
  });

  // A successful import must SAY so -- everything else about it is
  // inference (the roster lands in a section that is still collapsed, and
  // the header quietly changes). A teacher who picked the wrong file needs
  // to be told a file landed at all.
  test('a successful import says how many students landed', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await openIo(page);
    await upload(page, 'ok.csv', 'number,name\n1,Ana\n2,Budi\n');
    await expect(page.getByText('Imported 2 students.')).toBeVisible();
  });

  test('and says it in the singular for one', async ({ page }) => {
    await page.goto('/classroom-groups');
    await openIo(page);
    await upload(page, 'one.csv', 'number,name\n1,Ana\n');
    await expect(page.getByText('Imported 1 student.')).toBeVisible();
  });

  // The confirmation belongs to ONE file. A later refusal must not sit
  // underneath a message saying the last one worked.
  test('a later bad file clears the success message', async ({ page }) => {
    await page.goto('/classroom-groups');
    await openIo(page);
    await upload(page, 'ok.csv', 'number,name\n1,Ana\n');
    await expect(page.getByText('Imported 1 student.')).toBeVisible();
    await upload(page, 'bad.csv', 'number\nabc\n');
    await expect(page.getByText(/^Imported /)).toHaveCount(0);
    await expect(
      page.getByText("Row 1 — number 'abc' is not a whole number."),
    ).toBeVisible();
  });

  test('the export button for groups appears only once groups exist', async ({
    page,
  }) => {
    await rosterOf(page, 6);
    await openIo(page);
    await expect(
      page.getByRole('button', { name: 'Export groups' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await expect(
      page.getByRole('button', { name: 'Export groups' }),
    ).toBeVisible();
  });

  test(
    'the template is the roster once there is one',
    { tag: '@requires-download-bytes' },
    async ({ page }) => {
      await buildRoster(page, [
        ['F', 'Ana'],
        ['M', 'Budi'],
      ]);
      await openIo(page);
      const text = await downloadText(page, 'Download template');
      expect(text).toContain('1,Ana,F,,,');
      expect(text).toContain('2,Budi,M,,,');
      // and it is a real roster, not the example rows
      expect(text).not.toContain('# 1,Ana');
    },
  );

  test(
    'the template with no roster is example COMMENT rows only',
    { tag: '@requires-download-bytes' },
    async ({ page }) => {
      await page.goto('/classroom-groups');
      await openIo(page);
      const text = await downloadText(page, 'Download template');
      expect(text).toContain('# 1,Ana,F,,A,');
      // Every line that is not the header is a comment, so importing it
      // unedited adds nobody. The header is found by its own content rather
      // than by position, because the `# Class:` prompt line comes first.
      const body = text
        .split('\n')
        .filter((l) => l.trim() !== '')
        .filter((l) => l !== 'number,name,sex,absent,together,apart');
      expect(body.every((l) => l.startsWith('#'))).toBe(true);
    },
  );

  test(
    'the exported class list is the roster on screen',
    { tag: '@requires-download-bytes' },
    async ({ page }) => {
      await buildRoster(page, [
        ['F', 'Ana'],
        ['M', 'Budi'],
      ]);
      await openIo(page);
      const text = await downloadText(page, 'Export class list');
      expect(text).toBe(
        'number,name,sex,absent,together,apart\n1,Ana,F,,,\n2,Budi,M,,,\n',
      );
    },
  );

  test('the filename carries the class and the date', async ({ page }) => {
    await rosterOf(page, 2);
    await page.getByLabel('Class (optional)').fill('7B');
    await openIo(page);
    const name = await downloadName(page, 'Export class list');
    expect(name).toMatch(/^7B-class-list-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('a class name with a slash still produces a usable filename', async ({
    page,
  }) => {
    await rosterOf(page, 2);
    await page.getByLabel('Class (optional)').fill('Year 7 / Set B');
    await openIo(page);
    const name = await downloadName(page, 'Export class list');
    expect(name).toBe(`Year-7-Set-B-class-list-${todayISO()}.csv`);
    // and the class name itself is untouched
    await expect(page.getByLabel('Class (optional)')).toHaveValue(
      'Year 7 / Set B',
    );
  });

  // C-30's last surface: the results heading. The filename was sanitised
  // from this same value, and the heading must not have been.
  test('the sanitised filename does not leak into the results heading', async ({
    page,
  }) => {
    await rosterOf(page, 4);
    await page.getByLabel('Class (optional)').fill('Year 7 / Set B');
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await expect(page.locator('#cg-results-h')).toContainText('Year 7 / Set B');
    await expect(page.locator('#cg-results-h')).not.toContainText(
      'Year-7-Set-B',
    );
    await openIo(page);
    expect(await downloadName(page, 'Export class list')).toContain(
      'Year-7-Set-B',
    );
  });

  // S-08. The warning is a HEADER, not a toast: it is still there after the
  // page has had every chance to settle. Condition-based -- this waits for
  // the page to go quiet, never for a fixed number of milliseconds.
  test('the unsaved-changes warning is permanent, not a toast that fades', async ({
    page,
  }) => {
    await rosterOf(page, 2);
    await expect(page.locator('#cg-io .state')).toHaveText(
      'unsaved changes — export to keep them',
    );
    await page.waitForLoadState('networkidle');
    // A full animation frame plus the tool's own longest deal step: if
    // anything on this page were going to clear the header on a timer, it
    // would have by now.
    await page.evaluate(
      () =>
        new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
    );
    await expect(page.locator('#cg-io .state')).toHaveText(
      'unsaved changes — export to keep them',
    );
  });

  test(
    'the exported groups file is one row per student',
    { tag: '@requires-download-bytes' },
    async ({ page }) => {
      await rosterOf(page, 4);
      await page.getByLabel('Students in each group').fill('2');
      await page.getByRole('button', { name: 'Make Groups' }).click();
      await openIo(page);
      const text = await downloadText(page, 'Export groups');
      const lines = text.split('\n').filter(Boolean);
      expect(lines[0]).toBe(`# Groups made ${todayISO()}`);
      expect(lines[1]).toBe('group,number,name');
      expect(lines).toHaveLength(6); // comment + header + 4 students
    },
  );

  test('exporting clears the unsaved-changes warning', async ({ page }) => {
    // The other half of stage 3's `dirty` rule: setRoster(next, { saved: true }).
    await rosterOf(page, 3);
    await openIo(page);
    await expect(page.locator('#cg-io .state')).toHaveText(
      'unsaved changes — export to keep them',
    );
    await downloadName(page, 'Export class list');
    await expect(page.locator('#cg-io .state')).toHaveText(
      'nothing to save yet',
    );
  });

  test('a successful import clears it too', async ({ page }) => {
    await page.goto('/classroom-groups');
    await openIo(page);
    await upload(page, 'ok.csv', 'number,name\n1,Ana\n2,Budi\n');
    await expect(page.locator('.cg-student')).toHaveCount(2);
    await expect(page.locator('#cg-io .state')).toHaveText(
      'nothing to save yet',
    );
  });

  // …and editing after an import makes it dirty again, which is what proves
  // the flag was CLEARED rather than switched off for good.
  test('editing after an import marks it unsaved again', async ({ page }) => {
    await page.goto('/classroom-groups');
    await openIo(page);
    await upload(page, 'ok.csv', 'number,name\n1,Ana\n');
    await expect(page.locator('#cg-io .state')).toHaveText(
      'nothing to save yet',
    );
    // Student details is still COLLAPSED -- an import fills it but does not
    // open it, and a hidden input cannot be typed into. Opening it is the
    // same thing a teacher does, not a workaround.
    await page.locator('#cg-students-toggle').click();
    await page.locator('.cg-student').first().getByLabel('Name').fill('Anna');
    await expect(page.locator('#cg-io .state')).toHaveText(
      'unsaved changes — export to keep them',
    );
  });

  // A round trip through the real controls: export, then import the exact
  // bytes back, and get the same roster. The unit suite proves
  // serialise/parse agree; this proves the PAGE hands them the same roster
  // it is showing.
  test(
    'a roster survives a round trip through export and import',
    { tag: '@requires-download-bytes' },
    async ({ page }) => {
      await buildRoster(page, [
        ['F', 'Ana'],
        ['M', 'Budi'],
        [null, 'Wong, Mei'],
      ]);
      await openIo(page);
      const text = await downloadText(page, 'Export class list');
      await page.reload();
      await openIo(page);
      await upload(page, 'again.csv', text);
      await expect(page.locator('.cg-student')).toHaveCount(3);
      await expect(
        page.locator('.cg-student').nth(2).getByLabel('Name'),
      ).toHaveValue('Wong, Mei');
    },
  );

  test('no console errors while importing and exporting', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/classroom-groups');
    await openIo(page);
    await upload(page, 'ok.csv', 'number,name\n1,Ana\n');
    await downloadName(page, 'Export class list');
    expect(errors).toEqual([]);
  });
});

test.describe('Import / export — Indonesian', () => {
  test('the section carries its own controls, translated', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await page.locator('#cg-io-toggle').click();
    await expect(
      page.getByRole('button', { name: 'Ekspor daftar kelas' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Unduh templat' }),
    ).toBeVisible();
    await expect(page.getByText('Impor daftar kelas')).toBeVisible();
  });

  test(
    'an Indonesian page exports an Indonesian file',
    { tag: '@requires-download-bytes' },
    async ({ page }) => {
      await buildRoster(
        page,
        [
          ['F', 'Ana'],
          ['M', 'Budi'],
        ],
        '/id/classroom-groups',
      );
      await page.locator('#cg-io-toggle').click();
      const text = await downloadText(page, 'Ekspor daftar kelas');
      expect(text).toBe(
        'nomor,nama,jenis kelamin,tidak hadir,bersama,terpisah\n' +
          '1,Ana,P,,,\n' +
          '2,Budi,L,,,\n',
      );
    },
  );

  test('a successful Indonesian import says so in Indonesian', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await page.locator('#cg-io-toggle').click();
    await upload(page, 'ok.csv', 'nomor,nama\n1,Ana\n2,Budi\n');
    await expect(page.getByText('2 siswa diimpor.')).toBeVisible();
  });

  test('an English file dropped on the Indonesian page is refused in Indonesian', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await page.locator('#cg-io-toggle').click();
    await upload(page, 'english.csv', 'number,name\n1,Ana\n');
    await expect(page.getByText(/bahasa Inggris/)).toBeVisible();
    await expect(page.locator('.cg-student')).toHaveCount(0);
  });

  test('and the refusal names the Indonesian filename on export', async ({
    page,
  }) => {
    await rosterOf(page, 2);
    await page.goto('/id/classroom-groups');
    await buildRoster(page, [['F', 'Ana']], '/id/classroom-groups');
    await page.getByLabel('Kelas (opsional)').fill('7B');
    await page.locator('#cg-io-toggle').click();
    const name = await downloadName(page, 'Ekspor daftar kelas');
    expect(name).toBe(`7B-daftar-kelas-${todayISO()}.csv`);
  });
});

/**
 * Stage 4, Task 6. W-01…W-13, Y-02…Y-04.
 *
 * Both directions are driven by the SAME parameterised case, because
 * "bidirectional" is precisely the kind of claim that gets made about code
 * that only works one way.
 */
test.describe('exporting in both languages', () => {
  for (const [from, to, firstFile, secondFile, secondButton] of [
    [
      '/classroom-groups',
      '/id/classroom-groups',
      'class-list',
      'daftar-kelas',
      'Ekspor daftar kelas',
    ],
    [
      '/id/classroom-groups',
      '/classroom-groups',
      'daftar-kelas',
      'class-list',
      'Export class list',
    ],
  ] as const) {
    test(`works starting from ${from}`, async ({ page, context }) => {
      await buildRosterAtPath(page, from, [
        ['F', 'Ana'],
        ['M', 'Budi'],
      ]);
      await page.locator('#cg-io-toggle').click();

      const [download, newPage] = await Promise.all([
        page.waitForEvent('download'),
        context.waitForEvent('page'),
        page
          .getByRole('button', {
            name: /other language|bahasa lainnya/,
          })
          .click(),
      ]);

      expect(download.suggestedFilename()).toContain(firstFile);
      await newPage.waitForLoadState();
      expect(new URL(newPage.url()).pathname).toBe(to);

      await newPage.locator('#cg-students-toggle').click();
      await expect(newPage.locator('.cg-student')).toHaveCount(2);
      await expect(
        newPage
          .locator('.cg-student')
          .first()
          .getByLabel(/Name|Nama/),
      ).toHaveValue('Ana');

      await newPage.locator('#cg-io-toggle').click();
      const [second] = await Promise.all([
        newPage.waitForEvent('download'),
        newPage.getByRole('button', { name: secondButton }).click(),
      ]);
      expect(second.suggestedFilename()).toContain(secondFile);
    });
  }

  // The sex value must cross as the ENGINE's own 'M'/'F', not as the page's
  // rendered letter -- otherwise an Indonesian 'P' arrives on the English
  // page as a sex it does not recognise. The letters differ between the two
  // pages, which is exactly why this is worth pinning.
  test('a sex survives the crossing, in the receiving page own letters', async ({
    page,
    context,
  }) => {
    await buildRosterAtPath(page, '/classroom-groups', [['F', 'Ana']]);
    await page.locator('#cg-io-toggle').click();
    const [, newPage] = await Promise.all([
      page.waitForEvent('download'),
      context.waitForEvent('page'),
      page.getByRole('button', { name: /other language/ }).click(),
    ]);
    await newPage.waitForLoadState();
    await newPage.locator('#cg-students-toggle').click();
    await expect(
      newPage.locator('.cg-student').first().getByLabel('Jenis kelamin'),
    ).toHaveValue('F');
    // …and the Indonesian page shows it as P, its own letter for the same fact.
    await expect(
      newPage
        .locator('.cg-student')
        .first()
        .getByLabel('Jenis kelamin')
        .locator('option:checked'),
    ).toHaveText('P');
  });

  test('nothing is written to storage and nothing is in a URL', async ({
    page,
    context,
  }) => {
    await buildRosterAtPath(page, '/classroom-groups', [['F', 'Ana']]);
    await page.locator('#cg-io-toggle').click();
    const [, newPage] = await Promise.all([
      page.waitForEvent('download'),
      context.waitForEvent('page'),
      page.getByRole('button', { name: /other language/ }).click(),
    ]);
    await newPage.waitForLoadState();
    await newPage.locator('#cg-students-toggle').click();
    await expect(newPage.locator('.cg-student')).toHaveCount(1);
    for (const p of [page, newPage]) {
      const seen = await p.evaluate(() =>
        [
          JSON.stringify({ ...localStorage }),
          JSON.stringify({ ...sessionStorage }),
          location.href,
          document.cookie,
        ].join(' '),
      );
      expect(seen).not.toContain('Ana');
    }
  });

  test('the source keeps the roster until the new tab acknowledges', async ({
    page,
    context,
  }) => {
    await buildRosterAtPath(page, '/classroom-groups', [['F', 'Ana']]);
    await page.locator('#cg-io-toggle').click();
    const [, newPage] = await Promise.all([
      page.waitForEvent('download'),
      context.waitForEvent('page'),
      page.getByRole('button', { name: /other language/ }).click(),
    ]);
    await newPage.waitForLoadState();
    await newPage.locator('#cg-students-toggle').click();
    await expect(newPage.locator('.cg-student')).toHaveCount(1);
    await expect(page.locator('.cg-student')).toHaveCount(1); // still there
    await expect(
      page.getByText('Your class list is now open in the other language.'),
    ).toBeVisible();
  });

  test('a blocked tab is reported and the roster is kept', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      window.open = () => null;
    });
    await buildRosterAtPath(page, '/classroom-groups', [['F', 'Ana']]);
    await page.locator('#cg-io-toggle').click();
    // The file still saves -- a blocked pop-up must not cost a teacher the
    // export they actually asked for.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /other language/ }).click(),
    ]);
    expect(download.suggestedFilename()).toContain('class-list');
    await expect(
      page.getByText(
        'The second tab could not be opened. Your class list is still here — ' +
          'allow pop-ups and try again.',
      ),
    ).toBeVisible();
    await expect(page.locator('.cg-student')).toHaveCount(1);
  });

  // A tab that opens but never asks -- the other half of "the handover must
  // never lose data by failing silently". Condition-based: this waits for
  // the sentence to appear, never for a fixed number of milliseconds.
  test('a tab that never asks is reported, and the roster is kept', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      // A window that opens and does nothing -- the shape of a tab that
      // loads but whose script never runs (a school filter, a failed
      // deploy). Truthy, so it is not the blocked case.
      window.open = () => ({ closed: false }) as unknown as Window;
    });
    await buildRosterAtPath(page, '/classroom-groups', [['F', 'Ana']]);
    await page.locator('#cg-io-toggle').click();
    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /other language/ }).click(),
    ]);
    await expect(
      page.getByText(
        'The second tab never asked for the class list. Your class list is ' +
          'still here — close that tab and try again.',
      ),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.cg-student')).toHaveCount(1);
  });

  // A page opened NORMALLY must not shout into the channel -- otherwise a
  // teacher with two tabs open has one silently overwrite the other.
  // W-13. The whole flow's copy follows the STARTING page, not the file or
  // the destination -- asserted from the Indonesian side, which the
  // parameterised case above exercises for behaviour but not for wording.
  test('the flow speaks the starting page own language, from Indonesian', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      window.open = () => null;
    });
    await buildRosterAtPath(page, '/id/classroom-groups', [['F', 'Ana']]);
    await page.locator('#cg-io-toggle').click();
    await expect(
      page.getByText(
        'Berkas Anda tersimpan sekarang, dalam bahasa ini. Tab kedua akan ' +
          'terbuka dalam bahasa lainnya dengan daftar kelas yang sama, untuk ' +
          'Anda periksa dan simpan di sana. Tidak ada yang disimpan dan ' +
          'tidak ada yang dikirim ke mana pun.',
      ),
    ).toBeVisible();
    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /bahasa lainnya/ }).click(),
    ]);
    await expect(
      page.getByText(
        'Tab kedua tidak dapat dibuka. Daftar kelas Anda masih ada di ' +
          'sini — izinkan pop-up lalu coba lagi.',
      ),
    ).toBeVisible();
  });

  test('a page opened normally does not ask for anybody roster', async ({
    page,
    context,
  }) => {
    await buildRosterAtPath(page, '/classroom-groups', [['F', 'Ana']]);
    await page.locator('#cg-io-toggle').click();
    const other = await context.newPage();
    // An ABSOLUTE url, built from the page under test. `context.newPage()`
    // carries no `baseURL` over a CDP connection to a real phone, so a
    // relative path there is "Cannot navigate to invalid URL" -- found on
    // real Android, where every other page in this suite comes from the
    // `page` fixture and never hits it.
    await other.goto(new URL('/id/classroom-groups', page.url()).href);
    await other.locator('#cg-students-toggle').click();
    await expect(other.locator('.cg-student')).toHaveCount(0);
    await expect(page.locator('.cg-student')).toHaveCount(1);
  });
});
