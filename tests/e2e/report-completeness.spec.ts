import { test, expect } from './fixtures';
import { recorded } from './evidence';
import { searched } from '../source-files';
import { catalogueLeaves } from '../../src/lib/catalogue-leaves';
import {
  PREFIXED_LOCALES,
  getSiteStrings,
  rawCatalogue,
  type Locale,
} from '../../src/lib/i18n';
import {
  PAGE_IDS,
  normalise,
  pagePath,
  reportOptions,
} from '../../src/lib/report';
import { isMessageTemplate } from '../../src/lib/i18n/message';
import { LOCALE_METADATA } from '../../src/lib/i18n/metadata';

test.use(recorded);

/**
 * Every catalogue string a visitor can see on a page is one that page offers
 * to report (#97, spec 10). Read from the RENDERED DOM after the page's
 * script has run: the tool strings arrive by script, so a static read of the
 * HTML would never find one and pass for nothing (spec review pass 3).
 * Compared by text, not key, because the same words can live under two keys
 * and the visitor picks words. Text the page draws from somewhere other than
 * a catalogue is left out, derived from its source: the language switcher's
 * endonyms come from LOCALE_METADATA, and each locale's own also sits in the
 * tool catalogue's `csvLanguageName`, so on a page without the tool it read
 * as a tool string left unoffered (measured in review pass 4).
 */
const NOT_CATALOGUE_COPY = Object.values(LOCALE_METADATA).map(
  ({ nativeName }) => nativeName,
);
function plainCatalogueTexts(locale: Locale): string[] {
  const english = new Map(catalogueLeaves(rawCatalogue('en')));
  const tool = catalogueLeaves(rawCatalogue(locale)).filter(([key, value]) => {
    const reference = english.get(key);
    return (
      typeof value === 'string' &&
      !(
        typeof reference === 'string' &&
        !key.includes('[') &&
        isMessageTemplate(reference)
      )
    );
  });
  const site = catalogueLeaves(getSiteStrings(locale)).filter(
    ([key, value]) => typeof value === 'string' && !key.startsWith('notFound.'),
  );
  return [
    ...new Set(
      [...tool, ...site].map(([, value]) => normalise(value as string, locale)),
    ),
  ].filter((text) => text.length > 0);
}

for (const locale of PREFIXED_LOCALES)
  for (const pageId of PAGE_IDS)
    test(`${pagePath(pageId, locale)}: every catalogue string on the page is reportable there`, async ({
      page,
    }) => {
      await page.goto(pagePath(pageId, locale));
      if (pageId === 'classroom-groups')
        await page.locator('#cg-students-toggle').click();
      const rendered = await page.evaluate(() => {
        const texts: string[] = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (parent && parent.checkVisibility() && node.textContent?.trim())
            texts.push(node.textContent);
        }
        return texts;
      });
      const onPage = new Set(rendered.map((text) => normalise(text, locale)));
      const offered = new Set(
        reportOptions(pageId, locale).map((option) =>
          normalise(option, locale),
        ),
      );
      const elsewhere = new Set(
        NOT_CATALOGUE_COPY.map((text) => normalise(text, locale)),
      );
      const found = plainCatalogueTexts(locale).filter(
        (text) => onPage.has(text) && !elsewhere.has(text),
      );
      const missing = found.filter((text) => !offered.has(text));
      expect(
        searched(missing, {
          of: found,
          what: 'catalogue strings rendered on the page',
        }),
      ).toEqual([]);
    });
