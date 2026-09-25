import { test, expect } from './fixtures';
import { recorded, shoot } from './evidence';
import { getStrings, renderError, type Locale } from '../../src/lib/i18n/index';
import { LOCALE_METADATA } from '../../src/lib/i18n/metadata';
import { CSV_LOCALES } from '../../src/lib/csv-locale';
import { importFile } from '../../src/lib/csv';
import { ERROR_CODES } from '../../src/lib/grouping';
import {
  buildRoster,
  buildRosterAtPath,
  expectVisibleText,
  handoverTo,
  listedByThisBrowser,
  upload,
} from './helpers';

test.use(recorded);

/**
 * The sentences corrected on #319's sheet, read where a teacher meets them.
 *
 * `feature-terms.test.ts` holds every piece of copy that names a feature to
 * the words its language approved, and `verified-labels.test.ts` pins what the
 * operator read. Neither says anything about the page: a component can render
 * a different key, or render the right one where nobody sees it. So each
 * correction a teacher can reach is asserted here, on the page, in the
 * language it was corrected in, and photographed for the evidence page.
 *
 * Every expectation is built from the catalogue with the functions the page
 * itself calls -- `renderError` for a refusal, `importFile` for a CSV's
 * problems -- so the pins stay the one place the approved words are written.
 *
 * Not reached here, and held by the unit guard and the pins instead: the
 * seven pin messages (the page has no pin control yet), the three
 * `*_SEARCH_GAVE_UP` messages (they need the search to run out of budget),
 * `TOGETHER_APART_CLASH` (the roster refuses the clash before the engine
 * runs, with `rosterClashMessage`, which IS read here), and the
 * `*_NO_ARRANGEMENT` messages, which no roster in this spec builds.
 */
const LANGUAGES: readonly Locale[] = ['zh', 'vi', 'th'];

/** Four students; the first two are a together pair of mixed sex. */
const NAMES = ['Ana', 'Budi', 'Citra', 'Dedi'];
const byNumber = (n: number) => NAMES[n - 1] ?? String(n);

test.describe('the sentences corrected on #319', () => {
  for (const locale of LANGUAGES) {
    test(`${locale}: every reachable correction reads as approved`, async ({
      page,
      context,
    }) => {
      const t = getStrings(locale);
      const columns = CSV_LOCALES[locale].columns;

      await buildRoster(page, [
        ['F', NAMES[0]],
        ['M', NAMES[1]],
        ['F', NAMES[2]],
        ['M', NAMES[3]],
      ]);
      for (const row of [0, 1])
        await page
          .locator('.cg-student')
          .nth(row)
          .getByLabel('Together')
          .selectOption('A');
      await page.locator('#cg-io-toggle').click();
      const [, tool] = await Promise.all([
        page.waitForEvent('download'),
        context.waitForEvent('page'),
        handoverTo(page, LOCALE_METADATA[locale].nativeName),
      ]);
      await tool.waitForLoadState();
      const rows = tool.locator('.cg-student');
      await expect(rows).toHaveCount(NAMES.length);
      const go = tool.locator('#cg-go');
      const error = tool.locator('#cg-error');

      // The how-to's second step names who is being split.
      await tool.locator('#cg-howto-toggle').click();
      const step = tool.locator('#cg-howto-body ol li').nth(1);
      await expectVisibleText(step, t.howToSteps[1]);
      await shoot(
        tool,
        `${locale}: the second step reads “${t.howToSteps[1]}”`,
        step,
      );

      // The leftover-student choices, under the grouping options.
      await tool.locator('#cg-grouping-toggle').click();
      for (const [value, text] of [
        ['spread', t.leftoversSpread],
        ['bunch', t.leftoversBunch],
      ] as const) {
        const choice = tool.locator('label').filter({
          has: tool.locator(`input[name="leftovers"][value="${value}"]`),
        });
        await expectVisibleText(choice, text);
      }
      await shoot(
        tool,
        `${locale}: leftover students can be “${t.leftoversSpread}” or “${t.leftoversBunch}”`,
        tool
          .locator('input[name="leftovers"]')
          .first()
          .locator('xpath=ancestor::div[@class="field"]'),
      );

      // A mixed-sex together pair cannot make a single-sex group.
      await tool.locator('#cg-sex-separate').check();
      await go.click();
      await expectVisibleText(
        error,
        await listedByThisBrowser(
          tool,
          locale,
          [1, 2].map(byNumber),
          renderError(
            { code: ERROR_CODES.sexSeparateSplitsUnit, students: [1, 2] },
            t,
            byNumber,
          ),
        ),
      );
      await shoot(
        tool,
        `${locale}: a mixed-sex together pair is refused in separate mode`,
        error,
      );
      await tool.locator('#cg-sex-separate').uncheck();

      // The roster arrives folded; its rows are edited from here on.
      await tool.locator('#cg-students-toggle').click();
      await expect(rows.first()).toBeVisible();

      // Four students on one together letter cannot fit a group of two.
      for (const row of [2, 3])
        await rows
          .nth(row)
          .getByLabel(t.rosterColTogether, { exact: true })
          .selectOption('A');
      await tool.locator('#cg-size').fill('2');
      await go.click();
      await expectVisibleText(
        error,
        renderError(
          {
            code: ERROR_CODES.togetherUnitTooLarge,
            letter: 'A',
            unit: 4,
            groupSize: 2,
          },
          t,
          byNumber,
        ),
      );
      await shoot(
        tool,
        `${locale}: a together letter larger than any group is refused`,
        error,
      );

      // Everyone absent is the same refusal as nobody at all.
      for (let row = 0; row < NAMES.length; row++)
        await rows
          .nth(row)
          .getByLabel(t.rosterColAbsent, { exact: true })
          .check();
      await go.click();
      await expectVisibleText(
        error,
        renderError({ code: ERROR_CODES.noStudents }, t),
      );
      await shoot(
        tool,
        `${locale}: a roster with everyone absent is refused`,
        error,
      );
      for (let row = 0; row < NAMES.length; row++) {
        await rows
          .nth(row)
          .getByLabel(t.rosterColAbsent, { exact: true })
          .uncheck();
        await rows
          .nth(row)
          .getByLabel(t.rosterColTogether, { exact: true })
          .selectOption({ value: '' });
      }

      // Groups made, the print panel offers the group results and the letters.
      await go.click();
      await expect(error).toBeHidden();
      await tool.locator('#cg-print-open').click();
      const panel = tool.locator('#cg-print-panel');
      await expect(panel).toBeVisible();
      await expectVisibleText(
        panel
          .locator('label')
          .filter({ has: tool.locator('input[value="groups"]') }),
        t.printWhatGroups,
      );
      await expectVisibleText(
        panel
          .locator('label')
          .filter({ has: tool.locator('#cg-print-letters') }),
        t.printShowLetters,
      );
      await shoot(
        tool,
        `${locale}: the print panel offers “${t.printWhatGroups}” and “${t.printShowLetters}”`,
        panel,
      );
      await tool.keyboard.press('Escape');
      await expect(panel).toBeHidden();

      // A together pair that is also an apart pair is refused as it is typed.
      // A select offers the letters in use and the next free one, so 'A' it is.
      for (const row of [0, 1]) {
        await rows
          .nth(row)
          .getByLabel(t.rosterColTogether, { exact: true })
          .selectOption('A');
        await rows
          .nth(row)
          .getByLabel(t.rosterColApart, { exact: true })
          .selectOption('A');
      }
      const clash = tool.locator('#cg-roster-problem');
      await expectVisibleText(
        clash,
        await listedByThisBrowser(
          tool,
          locale,
          [NAMES[0], NAMES[1]],
          t.rosterClashMessage({ names: [NAMES[0], NAMES[1]] }),
        ),
      );
      await shoot(
        tool,
        `${locale}: a together pair kept apart is refused as it is typed`,
        clash,
      );

      // A file in the page's own language, with one fault on every row.
      await tool.locator('#cg-io-toggle').click();
      const faulty = [
        [columns.number, columns.name, columns.absent].join(','),
        `1,${NAMES[0]},?`,
        `1.5,${NAMES[1]},`,
        `1,${NAMES[2]},`,
        `,${NAMES[3]},`,
      ].join('\n');
      const parsed = importFile(faulty, locale, t);
      expect(parsed.ok).toBe(false);
      const problems = parsed.ok
        ? []
        : parsed.problems.map(({ message }) => message);
      expect(problems.length).toBeGreaterThan(3);
      await upload(tool, 'faulty.csv', faulty);
      for (const problem of problems)
        await expectVisibleText(
          tool.getByText(problem, { exact: true }),
          problem,
        );
      await shoot(
        tool,
        `${locale}: a faulty class list names every problem`,
        tool.getByText(problems[0] ?? '', { exact: true }).locator('xpath=..'),
      );

      // A file with no number column at all.
      const numberless = [
        [columns.name, columns.absent].join(','),
        `${NAMES[0]},`,
      ].join('\n');
      const refused = importFile(numberless, locale, t);
      const reason = refused.ok ? '' : (refused.problems[0]?.message ?? '');
      expect(reason).not.toBe('');
      await upload(tool, 'numberless.csv', numberless);
      await expectVisibleText(tool.getByText(reason, { exact: true }), reason);
      await shoot(
        tool,
        `${locale}: a class list with no number column is refused`,
        tool.getByText(reason, { exact: true }),
      );

      // A file written in another language is refused before any warning.
      const english = [
        Object.values(CSV_LOCALES.en.columns).join(','),
        `1,${NAMES[0]},F,,,`,
      ].join('\n');
      const foreign = importFile(english, locale, t);
      const why = foreign.ok ? '' : (foreign.problems[0]?.message ?? '');
      expect(why).not.toBe('');
      await upload(tool, 'english.csv', english);
      await expectVisibleText(tool.getByText(why, { exact: true }), why);
      await shoot(
        tool,
        `${locale}: an English class list is refused with “${why}”`,
        tool.getByText(why, { exact: true }),
      );
    });
  }

  test('id: everyone absent is refused in the words of the column', async ({
    page,
  }) => {
    const t = getStrings('id');
    await buildRosterAtPath(page, '/id/classroom-groups', [
      ['F', NAMES[0]],
      ['M', NAMES[1]],
    ]);
    const rows = page.locator('.cg-student');
    for (let row = 0; row < 2; row++)
      await rows
        .nth(row)
        .getByLabel(t.rosterColAbsent, { exact: true })
        .check();
    await page.locator('#cg-go').click();
    const error = page.locator('#cg-error');
    await expectVisibleText(
      error,
      renderError({ code: ERROR_CODES.noStudents }, t),
    );
    await shoot(page, 'id: a roster with everyone absent is refused', error);
  });
});
