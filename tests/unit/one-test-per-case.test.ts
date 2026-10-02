import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSource } from './ast';
import { searched, specFilesUnder } from '../source-files';
import { loopedCases, type LoopedCase } from '../one-test-per-case';

/**
 * One test per case (operator, 2026-10-02; #417).
 *
 * A population known before the run -- locales, pages, widths, themes -- is
 * covered by generating one test per case, never by looping it inside one
 * test body. A loop inside shares one 30 s budget across every case (this
 * repo measured that going red on Firefox and WebKit under load, #380),
 * stops at the first failing case, and names none in its title.
 *
 * The question asked is STRUCTURAL: does a loop inside a test navigate or
 * change the viewport, theme or media on each pass? Whether its iterable was
 * "known before the run" is a dataflow question, and a detector asking one
 * here before flagged 54 of 103 sites and was useless (#118). A loop over a
 * population only the page knows (the disclosures it rendered) cannot be
 * split at collection time, and says so in a `// runtime population:`
 * comment, found by position, so the same words in a string do not count.
 */
const found = (source: string): readonly LoopedCase[] =>
  loopedCases(parseSource(source, 'fixture.spec.ts'));

describe('the detector', () => {
  it('refuses a loop inside a test that navigates on each pass', () => {
    expect(
      found(`
        test('every locale', async ({ page }) => {
          for (const locale of LOCALES) {
            await page.goto(localisePath('/', locale));
          }
        });`),
    ).toEqual([
      {
        test: 'every locale',
        loop: 'for (const locale of LOCALES)',
        line: 3,
      },
    ]);
  });

  it('passes the same cases generated as one test each', () => {
    expect(
      found(`
        for (const locale of LOCALES)
          test(\`\${locale}: one case\`, async ({ page }) => {
            await page.goto(localisePath('/', locale));
          });`),
    ).toEqual([]);
  });

  it('refuses each state change the budget pays for, not only goto', () => {
    const titles = found(`
      test('widths', async ({ page }) => {
        for (const width of [320, 1280]) await page.setViewportSize({ width, height: 900 });
      });
      test('themes', async ({ page }) => {
        for (const theme of THEMES) { await emulateTheme(page, theme); }
      });
      test('media', async ({ page }) => {
        ['print', 'screen'].forEach(async (media) => page.emulateMedia({ media }));
      });
      test('saved', async ({ page }) => {
        for (let i = 0; i < 2; i += 1) await saveTheme(page, 'dark');
      });`).map((site) => site.test);
    expect(titles).toEqual(['widths', 'themes', 'media', 'saved']);
  });

  it('passes a loop that changes no page state', () => {
    expect(
      found(`
        test('links', async ({ page }) => {
          await page.goto('/');
          for (const a of await page.locator('a').all()) await atLeast44(a);
        });`),
    ).toEqual([]);
  });

  it('passes a runtime population that says so in a comment', () => {
    expect(
      found(`
        test('disclosures', async ({ page }) => {
          // runtime population: the toggles this page rendered
          for (const id of ids) await page.goto(path);
        });`),
    ).toEqual([]);
  });

  // An ordinary comment sits above the loop on purpose. Without one, a
  // detector that read the words from anywhere in the file still saw no
  // comment to read them in, and this passed against it (DM5, #417).
  it('does not take the words from a string as the comment', () => {
    expect(
      found(`
        test('disclosures', async ({ page }) => {
          const note = '// runtime population: not a comment';
          // every toggle, one at a time
          for (const id of ids) await page.goto(path);
        });`),
    ).toHaveLength(1);
  });

  it('reads a test inside a describe, and a test.describe callback is not a test', () => {
    expect(
      found(`
        test.describe('group', () => {
          for (const width of WIDTHS)
            test(\`\${width}\`, async ({ page }) => {
              await page.setViewportSize({ width, height: 9 });
            });
          test('inner', async ({ page }) => {
            for (const p of PATHS) await page.goto(p);
          });
        });`).map((site) => site.test),
    ).toEqual(['inner']);
  });

  it('names a template title by its source, so a finding names its test', () => {
    expect(
      found(`
        test(\`\${path}: every control\`, async ({ page }) => {
          for (const theme of THEMES) await emulateTheme(page, theme);
        });`)[0].test,
    ).toBe('${path}: every control');
  });
});

/**
 * Every looped site in the suite, scanned inside each test, never at collection.
 *
 * #417 landed this guard with a burn-down list of the 46 sites that existed
 * that day; #418-#422 split them all, and #422 retired the list rather than
 * keep it empty. An empty allowance is somewhere to park the next site instead
 * of splitting it, and its own staleness check would assert over nothing.
 */
const scan = (): { specs: string[]; sites: string[] } => {
  const specs = specFilesUnder('tests');
  const sites = specs.flatMap((file) =>
    loopedCases(parseSource(readFileSync(file, 'utf8'), file)).map(
      (site) => `${file} :: ${site.test} :: ${site.loop}`,
    ),
  );
  return { specs, sites };
};

describe('the suite', () => {
  it('loops no known population inside a test', () => {
    const { specs, sites } = scan();
    expect(searched(sites, { of: specs, what: 'spec files' })).toEqual([]);
  });
});
