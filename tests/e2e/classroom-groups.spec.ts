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
    names?: string;
    size?: string;
    /** Switches to "number of groups" mode and sets it. */
    groups?: string;
    apart?: string;
    speed?: 'normal' | 'fast' | 'skip';
  },
) => {
  if (opts.count !== undefined) await page.fill('#cg-count', opts.count);
  if (opts.names !== undefined) await page.fill('#cg-names', opts.names);
  if (opts.size !== undefined) await page.fill('#cg-size', opts.size);
  if (opts.groups !== undefined) {
    await page.check('input[name="mode"][value="groupCount"]');
    await page.fill('#cg-groups', opts.groups);
  }
  if (opts.apart !== undefined) await page.fill('#cg-apart', opts.apart);
  // Default to skip so the tests assert the RESULT, not the show. The
  // animation gets its own test below.
  await page.selectOption('#cg-speed', opts.speed ?? 'skip');
};

test.describe('classroom group creator', () => {
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

  test('uses pasted names, and numbers students when none are given', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await fill(page, { names: 'Ana\nBudi\nCitra\nDewi', size: '2' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results')).toContainText('Ana');
    await expect(page.locator('#cg-results')).toContainText('Budi');

    // Now with no names at all — the DEFAULT mode, so it must be first-class.
    await page.fill('#cg-names', '');
    await fill(page, { count: '4', size: '2' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .student').first()).toContainText(
      'Student',
    );
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

  test('explains an impossible keep-apart instead of failing silently', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await fill(page, {
      names: 'Ana\nBudi\nCitra\nDewi\nEko\nFitri\nGita\nHadi',
      size: '2', // 8 students / 2 = 4 groups
      apart: [
        'Ana, Budi',
        'Ana, Citra',
        'Ana, Dewi',
        'Ana, Eko',
        'Budi, Citra',
        'Budi, Dewi',
        'Budi, Eko',
        'Citra, Dewi',
        'Citra, Eko',
        'Dewi, Eko',
      ].join('\n'),
    });
    await page.click('#cg-go');

    const error = page.locator('#cg-error');
    await expect(error).toBeVisible();
    // Must NAME the students and say how many groups are needed.
    await expect(error).toContainText('Ana');
    await expect(error).toContainText('Eko');
    await expect(error).toContainText('5');
    await expect(page.locator('#cg-results')).toBeHidden();
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

  test('an unarrangeable class is explained without accusing anyone', async ({
    page,
  }) => {
    // A ring: Ana-Budi-Citra-Dewi-Eko-Ana. No two of these five all conflict
    // beyond a pair, so nothing licenses the sentence "these five all need to
    // be kept apart from each other" — which is what the page used to print,
    // naming Ana and Citra, who have no rule between them.
    await page.goto('/classroom-groups');
    await fill(page, {
      names: 'Ana\nBudi\nCitra\nDewi\nEko',
      groups: '2',
      apart: [
        'Ana, Budi',
        'Budi, Citra',
        'Citra, Dewi',
        'Dewi, Eko',
        'Eko, Ana',
      ].join('\n'),
    });
    await page.click('#cg-go');

    const error = page.locator('#cg-error');
    await expect(error).toHaveText(
      'There is no way to fit your class into 2 groups while keeping everyone apart who needs to be. Either make more groups or remove one of the rules.',
    );
    // Names no children at all — the point of the fix.
    for (const child of ['Ana', 'Budi', 'Citra', 'Dewi', 'Eko']) {
      await expect(error).not.toContainText(child);
    }
  });

  test('keeps a named pair apart when it is possible', async ({ page }) => {
    await page.goto('/classroom-groups');
    await fill(page, {
      names: 'Ana\nBudi\nCitra\nDewi',
      size: '2',
      apart: 'Ana, Budi',
    });
    await page.click('#cg-go');

    await expect(page.locator('#cg-results .group')).toHaveCount(2);
    const groupWithBoth = page
      .locator('#cg-results .group')
      .filter({ hasText: 'Ana' })
      .filter({ hasText: 'Budi' });
    await expect(groupWithBoth).toHaveCount(0);
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

  test('three names on one line means all three apart', async ({ page }) => {
    // The help says "one pair per line", but the box is free text and this is
    // how a teacher writes it. The old parser kept the first pair, dropped
    // the rest, seated Citra next to Ana and reported success.
    await page.goto('/classroom-groups');
    await fill(page, {
      names: 'Ana\nBudi\nCitra\nDewi\nEko\nFitri',
      size: '2',
      apart: 'Ana, Budi, Citra',
    });
    await page.click('#cg-go');

    await expect(page.locator('#cg-results .group')).toHaveCount(3);
    for (const [a, b] of [
      ['Ana', 'Budi'],
      ['Ana', 'Citra'],
      ['Budi', 'Citra'],
    ]) {
      await expect(
        page
          .locator('#cg-results .group')
          .filter({ hasText: a })
          .filter({ hasText: b }),
      ).toHaveCount(0);
    }
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

  test('keep-apart is disabled until there are names to refer to', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-apart')).toBeDisabled();
    await expect(page.locator('#cg-apart-hint')).toBeVisible();
    await page.fill('#cg-names', 'Ana\nBudi');
    await expect(page.locator('#cg-apart')).toBeEnabled();
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

test.describe('classroom group creator — Bahasa Indonesia', () => {
  test('the Indonesian page is genuinely in Indonesian', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(page.locator('h1')).toHaveText('Pembuat Kelompok Kelas');
    await expect(page.locator('#cg-go')).toHaveText('Buat Kelompok');
  });

  test('anonymous students are labelled in Indonesian', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await fill(page, { count: '4', size: '2' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .student').first()).toContainText(
      'Siswa',
    );
  });

  test('errors are shown in Indonesian, not English', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await fill(page, { count: '0', size: '2' });
    await page.click('#cg-go');
    const error = page.locator('#cg-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('Tambahkan siswa');
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
