import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../../src/lib/i18n/en';
import { siteEn } from '../../src/lib/i18n/site';

/**
 * A defined string that nothing renders.
 *
 * Both locale files carried translated copy that reached no page: a
 * "Making groups…" status, three locale-name labels, and a `switchLanguage`
 * that DUPLICATED site.ts's `language.switchTo` with a different value —
 * "Baca dalam Bahasa Indonesia" against the "Bahasa Indonesia" a visitor
 * actually sees. Two sources of truth for one label, and the one a maintainer
 * is most likely to edit was the inert one.
 *
 * `skipToContent` was the costly case: the copy for a skip link existed in
 * both languages while no skip link existed on any page, so the repo looked
 * like it had met WCAG 2.4.1 and had not.
 *
 * Nothing else notices this. Every other test in this suite reads the locale
 * files, so a key can be complete, translated, non-blank, and never once
 * shown to anybody.
 */
const sourceText = (() => {
  const collect = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return collect(path);
      return /\.(astro|ts)$/.test(path) ? [path] : [];
    });

  // Excludes the files that DEFINE the copy, and nothing else. i18n/index.ts
  // stays in: it is a renderer, and dropping the whole i18n directory made
  // `groupLabel` and `themes` look dead when index.ts composes both.
  const definitions = ['en.ts', 'id.ts', 'site.ts'].map((f) =>
    join('src', 'lib', 'i18n', f),
  );

  return collect('src')
    .filter((path) => !definitions.includes(path))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
})();

/** `t.foo`, `strings.foo`, `siteEn.foo` — any property access by that name. */
const isReferenced = (key: string) =>
  new RegExp(`\\.${key}\\b`).test(sourceText);

describe('every translated string reaches a page', () => {
  it('the tool locale defines nothing that no page renders', () => {
    const unused = Object.keys(en).filter((key) => !isReferenced(key));
    expect(unused).toEqual([]);
  });

  it('every error code the copy defines is rendered by renderError', () => {
    const renderer = readFileSync('src/lib/i18n/index.ts', 'utf8');
    const unused = Object.keys(en.errors).filter(
      (code) => !renderer.includes(code),
    );
    expect(unused).toEqual([]);
  });

  // Task 8a. Same check, same reasoning, for the warnings channel:
  // WARNING_CODES.sexSpillover was defined and translated in both locales
  // BEFORE anything in grouping.ts emitted one (Task 8b's separate-mode
  // placement, which landed later, is the first caller -- see
  // WARNING_CODES.sexSpillover's doc comment in grouping.ts). That gap is
  // exactly what would let warning copy rot unnoticed the way error copy
  // cannot: a translated key that renderWarning forgets to switch on would
  // still pass every other check in this file, same as an error code
  // would.
  it('every warning code the copy defines is rendered by renderWarning', () => {
    const renderer = readFileSync('src/lib/i18n/index.ts', 'utf8');
    const unused = Object.keys(en.warnings).filter(
      (code) => !renderer.includes(code),
    );
    expect(unused).toEqual([]);
  });

  it('the site-wide copy defines nothing that no page renders', () => {
    // Nested one level: `footer.companyNo`, `glory.needsJs`.
    const unused: string[] = [];
    for (const [group, value] of Object.entries(siteEn)) {
      if (!isReferenced(group)) {
        unused.push(group);
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const key of Object.keys(value)) {
          if (!isReferenced(key)) unused.push(`${group}.${key}`);
        }
      }
    }
    expect(unused).toEqual([]);
  });
});
