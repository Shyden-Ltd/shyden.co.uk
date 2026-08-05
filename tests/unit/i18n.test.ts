import { describe, it, expect } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { id } from '../../src/lib/i18n/id';
import { LOCALES, getStrings, renderError } from '../../src/lib/i18n';
import { ERROR_CODES } from '../../src/lib/grouping';
import { siteEn, siteId } from '../../src/lib/i18n/site';

const locales = [
  ['en', en],
  ['id', id],
] as const;

describe('locales are complete', () => {
  it('Indonesian defines every key English defines', () => {
    // The type system already enforces this at build time; this asserts it at
    // runtime too, so a key added via a cast or an `any` cannot slip through
    // and render an English sentence on the Indonesian page.
    expect(Object.keys(id).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(locales)('%s has no empty strings', (_name, strings) => {
    for (const [key, value] of Object.entries(strings)) {
      if (typeof value === 'string') expect(value.trim()).not.toBe('');
    }
  });

  it('Indonesian is actually translated, not copied English', () => {
    // A copy-paste locale passes a "same keys" check perfectly. Compare the
    // prose the teacher actually reads: near-total overlap means someone
    // duplicated en.ts and never translated it.
    const prose = [
      'title',
      'heading',
      'lead',
      'makeGroups',
      'studentsLabel',
    ] as const;
    const identical = prose.filter((k) => en[k] === id[k]);
    expect(identical).toEqual([]);
  });

  it('every group-name theme exists in both languages with the same number of names', () => {
    expect(Object.keys(id.themes).sort()).toEqual(
      Object.keys(en.themes).sort(),
    );
    for (const theme of Object.keys(en.themes)) {
      expect(id.themes[theme]).toHaveLength(en.themes[theme].length);
    }
  });
});

describe('every engine error can be rendered in every language', () => {
  const codes = Object.values(ERROR_CODES);

  it.each(locales)('%s renders all %i error codes', (_name, strings) => {
    for (const code of codes) {
      const msg = renderError({ code }, strings);
      expect(msg.trim()).not.toBe('');
      // A missing case falling through to the raw code would be a silent
      // failure that still "renders something".
      expect(msg).not.toContain(code);
    }
  });

  it('the impossible-constraints message names the students and the group count', () => {
    const msg = renderError(
      {
        code: ERROR_CODES.keepApartImpossible,
        students: ['Ana', 'Budi', 'Citra', 'Dewi', 'Eko'],
        groupsNeeded: 5,
      },
      en,
    );
    for (const name of ['Ana', 'Budi', 'Citra', 'Dewi', 'Eko'])
      expect(msg).toContain(name);
    expect(msg).toContain('5');
  });

  it('names the unrecognised entry when a keep-apart name is not in the class', () => {
    const msg = renderError(
      { code: ERROR_CODES.keepApartUnknownName, students: ['Zara'] },
      id,
    );
    expect(msg).toContain('Zara');
  });

  it('states the maximum possible when too many groups were requested', () => {
    const msg = renderError(
      { code: ERROR_CODES.tooManyGroups, maxGroups: 4 },
      en,
    );
    expect(msg).toContain('4');
  });
});

describe('site-wide copy is fully translated', () => {
  const walk = (obj: unknown, path = ''): Array<[string, string]> => {
    if (typeof obj === 'string') return [[path, obj]];
    if (obj && typeof obj === 'object') {
      return Object.entries(obj).flatMap(([k, v]) =>
        walk(v, path ? `${path}.${k}` : k),
      );
    }
    return [];
  };

  it('every English site key exists in Indonesian', () => {
    expect(
      walk(siteId)
        .map(([k]) => k)
        .sort(),
    ).toEqual(
      walk(siteEn)
        .map(([k]) => k)
        .sort(),
    );
  });

  it('no site string is blank in either language', () => {
    for (const [, value] of [...walk(siteEn), ...walk(siteId)]) {
      expect(value.trim()).not.toBe('');
    }
  });

  it('the visible prose is genuinely translated, not copied English', () => {
    // Walks EVERY string rather than a hand-picked sample, so a section that
    // was forgotten during translation cannot hide behind the ones that were
    // done. Proper nouns and the language switcher label are legitimately
    // identical across locales, so they are excluded by name.
    const allowedIdentical = new Set([
      'language.switchTo', // literally the other language's own name
      'language.label',
      'footer.companyNo', // "No. Perusahaan" vs "Company No." differ, but keep the guard honest
    ]);
    const enMap = new Map(walk(siteEn));
    const identical = walk(siteId)
      .filter(([k, v]) => enMap.get(k) === v)
      .map(([k]) => k)
      .filter((k) => !allowedIdentical.has(k));
    expect(identical).toEqual([]);
  });
});

describe('locale lookup', () => {
  it('exposes exactly the two supported locales, English first', () => {
    expect(LOCALES).toEqual(['en', 'id']);
  });

  it.each(locales)('getStrings("%s") returns that locale', (name, strings) => {
    expect(getStrings(name)).toBe(strings);
  });

  it('falls back to English for anything unrecognised', () => {
    expect(getStrings('fr')).toBe(en);
    expect(getStrings(undefined)).toBe(en);
  });

  it('renders anonymous students using the locale word for "Student"', () => {
    expect(en.studentNumber(7)).toContain('7');
    expect(id.studentNumber(7)).toContain('7');
    expect(en.studentNumber(7)).not.toBe(id.studentNumber(7));
  });
});
