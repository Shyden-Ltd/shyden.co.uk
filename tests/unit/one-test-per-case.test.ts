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

  it('names a template title by its source, so a burn-down entry is stable', () => {
    expect(
      found(`
        test(\`\${path}: every control\`, async ({ page }) => {
          for (const theme of THEMES) await emulateTheme(page, theme);
        });`)[0].test,
    ).toBe('${path}: every control');
  });
});

/**
 * Every looped site in the suite on the day #417 landed, to be split by
 * #418-#422. `file :: test :: loop`. The guard fails on a site missing from
 * this list AND on an entry that no longer matches a site, so the list can
 * only shrink: a conversion removes its entries in the same pull request.
 */
const BURN_DOWN: readonly string[] = [
  'tests/e2e/classroom-groups.spec.ts :: the accent colour still meets the WCAG AA contrast floor :: for (const theme of THEMES)',
  'tests/e2e/classroom-groups.spec.ts :: the dim stays above the WCAG AA contrast floor for normal text :: for (const theme of THEMES)',
  'tests/e2e/classroom-groups.spec.ts :: the out-of-date sentence meets the WCAG AA contrast floor :: for (const theme of THEMES)',
  'tests/e2e/classroom-groups.spec.ts :: the pinned action row casts a soft shadow upward at every width :: for (const { width, height } of VIEWPORTS)',
  'tests/e2e/classroom-groups.spec.ts :: the scroll padding clears the pinned action row at every width :: for (const { width, height } of VIEWPORTS)',
  'tests/e2e/disabled-controls.spec.ts :: roster at the limit — the add buttons and Make groups too :: for (const theme of THEMES)',
  'tests/e2e/disabled-controls.spec.ts :: the disabled placeholder option is excluded deliberately, and it exists :: for (const theme of THEMES)',
  'tests/e2e/head-and-sitemap.spec.ts :: declares exactly one viewport, at the device width :: for (const path of paths)',
  'tests/e2e/header-room.spec.ts :: ${locale}: no header item overlaps another, at any width :: for (const path of paths)',
  'tests/e2e/header-room.spec.ts :: ${locale}: no header item overlaps another, at any width :: for (const width of await header.open(page, path))',
  'tests/e2e/homepage.spec.ts :: the ShyTalk showcase carries the brand wordmark and links out :: for (const theme of THEMES)',
  'tests/e2e/homepage.spec.ts :: the hero has no label above its heading, in any locale :: for (const locale of LOCALES)',
  'tests/e2e/homepage.spec.ts :: the showcase frame shows a real room capture, one PER LOCALE :: for (const locale of LOCALES)',
  "tests/e2e/language-switcher.spec.ts :: adds no horizontal scroll at 320px, in every language :: for (const path of LOCALES.map((locale) => localisePath('/', locale)))",
  'tests/e2e/language-switcher.spec.ts :: lists every language in one fixed order, the current one ticked in place, every other a link :: for (const locale of LOCALES)',
  'tests/e2e/language-switcher.spec.ts :: names the current language in its own language, as its width calls for :: for (const locale of LOCALES)',
  'tests/e2e/language-switcher.spec.ts :: shows the short code below 720px and the full name from 720px, in every language :: for (const locale of LOCALES)',
  'tests/e2e/language-switcher.spec.ts :: shows the short code below 720px and the full name from 720px, in every language :: for (const width of [320, COMPACT_BELOW - 1, COMPACT_BELOW, 1280])',
  'tests/e2e/locale-beta.spec.ts :: adds no horizontal scroll at 320px, in every language :: for (const locale of LOCALES)',
  'tests/e2e/locale-beta.spec.ts :: the badge carries a translated name for screen readers :: for (const locale of PREFIXED_LOCALES)',
  'tests/e2e/locale-beta.spec.ts :: the badge clears the WCAG AA floor for normal text, in both themes :: for (const theme of THEMES)',
  "tests/e2e/locale-beta.spec.ts :: the badge's spoken label keeps the page's language, even inside another language's entry :: for (const locale of LOCALES)",
  'tests/e2e/palette-controls.spec.ts :: ${path}: every control it paints uses a palette colour, in both themes :: for (const theme of THEMES)',
  'tests/e2e/palette-controls.spec.ts :: the controls the browser draws use the brand accent, in both themes :: for (const theme of THEMES)',
  'tests/e2e/print-legibility.spec.ts :: ${path}: every printed ink is readable on white paper, whatever the screen shows :: for (const { device, saved } of PRINT_RUNS)',
  'tests/e2e/print-legibility.spec.ts :: a disabled control never depends on its fill reaching paper :: for (const theme of THEMES)',
  'tests/e2e/print-legibility.spec.ts :: the screen palette is not dragged down with the print one :: for (const theme of THEMES)',
  'tests/e2e/rendered-text.spec.ts :: every published page, in every language :: for (const path of paths)',
  'tests/e2e/rendered-text.spec.ts :: no two words are rendered touching, on any page :: for (const path of paths)',
  'tests/e2e/rendered-text.spec.ts :: no unfilled [[placeholder]] reaches a page :: for (const path of paths)',
  'tests/e2e/report-presence.spec.ts :: the disclosure sits right after the BETA notice, and asks for nothing personal :: for (const locale of PREFIXED_LOCALES)',
  'tests/e2e/text-over-ribbon.spec.ts :: ${theme} at ${width}px: every text run over the ribbon clears AA, on every page :: for (const path of paths)',
  'tests/e2e/thai-typography.spec.ts :: no Thai glyph draws beyond its line box at ${width}px :: for (const route of THAI_ROUTES)',
  'tests/e2e/thai-typography.spec.ts :: no Thai glyph draws beyond its line box at ${width}px :: for (const theme of THEMES)',
  'tests/e2e/theme-gallery.spec.ts :: ${locale} at ${width}px: every page renders the theme, with no sideways scroll :: for (const path of paths)',
  'tests/prod/prod-sanity.spec.ts :: every locale the site claims to serve is live, and in that language :: for (const { locale, path, heading, englishHeading } of ROUTES)',
];

/** Every looped site in the suite, scanned inside each test, never at collection. */
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
  it('loops no known population inside a test beyond the burn-down list', () => {
    const { specs, sites } = scan();
    expect(
      searched(
        sites.filter((site) => !BURN_DOWN.includes(site)),
        { of: specs, what: 'spec files' },
      ),
    ).toEqual([]);
  });

  it('keeps no burn-down entry that has already been split', () => {
    const { sites } = scan();
    expect(BURN_DOWN.filter((entry) => !sites.includes(entry))).toEqual([]);
  });
});
