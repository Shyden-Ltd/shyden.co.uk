import { describe, it, expect } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { id } from '../../src/lib/i18n/id';
import {
  LOCALES,
  getStrings,
  renderError,
  localisePath,
  localeFromPath,
  toolPath,
  otherLocale,
  isLocale,
  groupName,
} from '../../src/lib/i18n';
import { ERROR_CODES, type GroupingError } from '../../src/lib/grouping';
import { siteEn, siteId } from '../../src/lib/i18n/site';

const locales = [
  ['en', en],
  ['id', id],
] as const;

/**
 * Every leaf in a locale, addressed by path — `errors.NO_STUDENTS`,
 * `themes.animals[3]`, `howToSteps[1]`.
 *
 * The old checks read `Object.entries` at the TOP level only and skipped
 * anything that was not a string, which left `errors.*`, `themes.*`,
 * `themeNames.*` and every `howToSteps` entry — roughly 45 keys — unchecked.
 * An empty `id.errors.NO_STUDENTS` passed. So did a `howToSteps` with two
 * entries where English has three, which would silently show an Indonesian
 * teacher fewer instructions.
 */
const deepKeys = (value: unknown, path = ''): string[] => {
  if (Array.isArray(value))
    return value.flatMap((v, i) => deepKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) =>
      deepKeys(v, path ? `${path}.${k}` : k),
    );
  return [path];
};

const deepStrings = (value: unknown, path = ''): Array<[string, string]> => {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value))
    return value.flatMap((v, i) => deepStrings(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) =>
      deepStrings(v, path ? `${path}.${k}` : k),
    );
  return []; // functions are covered by the rendered-sentence tests below
};

/**
 * Strings that are legitimately the same in both languages. Measured, not
 * assumed — this is the whole list across every key at every depth.
 */
const ALLOWED_IDENTICAL = new Set([
  'speedNormal', // "Normal" is the Indonesian word as well
  'themes.planets[1]', // Venus
  'themes.planets[3]', // Mars
  'themes.planets[6]', // Uranus
]);

describe('locales are complete', () => {
  it('Indonesian defines every key English defines, at every depth', () => {
    // Includes array positions, so a themes list or a howToSteps that lost an
    // entry is a failure rather than a shorter page.
    expect(deepKeys(id).sort()).toEqual(deepKeys(en).sort());
  });

  it.each(locales)('%s has no blank string anywhere', (_name, strings) => {
    const blank = deepStrings(strings)
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k);
    expect(blank).toEqual([]);
  });

  it('Indonesian is actually translated, not copied English', () => {
    // Walks EVERY string rather than five hand-picked ones. A copy-paste
    // locale passes a same-keys check perfectly, and five samples cannot see
    // the section somebody forgot.
    //
    // Exceptions are listed by name, so each one is a decision rather than a
    // loosened rule.
    const enMap = new Map(deepStrings(en));
    const identical = deepStrings(id)
      .filter(([k, v]) => enMap.get(k) === v)
      .map(([k]) => k);

    expect(identical.filter((k) => !ALLOWED_IDENTICAL.has(k))).toEqual([]);
  });

  it('and the list of exceptions has no dead entries', () => {
    // An allow-list that outlives its reason quietly stops guarding anything.
    // If a translation lands for one of these, this fails and the entry goes.
    const enMap = new Map(deepStrings(en));
    const stillIdentical = deepStrings(id)
      .filter(([k, v]) => enMap.get(k) === v)
      .map(([k]) => k);
    expect(
      [...ALLOWED_IDENTICAL].filter((k) => !stillIdentical.includes(k)).sort(),
    ).toEqual([]);
  });
});

describe('every engine error can be rendered in every language', () => {
  /**
   * One realistic error per code, with the data that code carries.
   *
   * The old version called renderError({ code }) with no data at all and
   * asserted only that the result was non-empty — so
   * " are not in your class list. Check the spelling." passed, as did
   * " all need to be kept apart from each other, so you would need at least 0
   * groups." GroupingError is a union now, so those calls no longer even
   * describe a possible value.
   */
  const SAMPLES: Record<string, GroupingError> = {
    NO_STUDENTS: { code: ERROR_CODES.noStudents },
    TOO_MANY_STUDENTS: {
      code: ERROR_CODES.tooManyStudents,
      maxStudents: 500,
    },
    DUPLICATE_NUMBER: { code: ERROR_CODES.duplicateNumber, number: 5 },
    INVALID_GROUP_SIZE: { code: ERROR_CODES.invalidGroupSize },
    INVALID_GROUP_COUNT: { code: ERROR_CODES.invalidGroupCount },
    TOO_MANY_GROUPS: { code: ERROR_CODES.tooManyGroups, maxGroups: 4 },
    TOGETHER_UNIT_TOO_LARGE: {
      code: ERROR_CODES.togetherUnitTooLarge,
      letter: 'A',
      unit: 6,
      groupSize: 4,
    },
    TOGETHER_NO_ARRANGEMENT: {
      code: ERROR_CODES.togetherNoArrangement,
      groupsTried: 2,
    },
    TOGETHER_SEARCH_GAVE_UP: { code: ERROR_CODES.togetherSearchGaveUp },
    // Numbers, not names -- identity is the number (Student.number). See the
    // "resolving a student number to a label" block below for how a name
    // reaches the page from here.
    KEEP_APART_IMPOSSIBLE: {
      code: ERROR_CODES.keepApartImpossible,
      students: [1, 2],
      groupsNeeded: 2,
    },
    KEEP_APART_NO_ARRANGEMENT: {
      code: ERROR_CODES.keepApartNoArrangement,
      groupsTried: 2,
    },
    KEEP_APART_SEARCH_GAVE_UP: { code: ERROR_CODES.keepApartSearchGaveUp },
    BOTH_RULES_NO_ARRANGEMENT: {
      code: ERROR_CODES.bothRulesNoArrangement,
      groupsTried: 2,
    },
    BOTH_RULES_SEARCH_GAVE_UP: { code: ERROR_CODES.bothRulesSearchGaveUp },
  };

  it('every code the engine can return has a sample here', () => {
    // Otherwise a new code arrives with no coverage and this file still
    // reports green — the list would be describing itself, not the engine.
    expect(Object.keys(SAMPLES).sort()).toEqual(
      Object.values(ERROR_CODES).sort(),
    );
  });

  it.each(locales)(
    '%s renders every code as a real sentence',
    (_n, strings) => {
      for (const [code, error] of Object.entries(SAMPLES)) {
        const msg = renderError(error, strings);
        expect(msg).not.toContain(code); // no raw code leaking through
        // A sentence, not a fragment: starts with a capital, ends in a stop,
        // and never opens with the space left by missing data.
        expect(msg).toMatch(/^\S.*[.!?]$/);
        expect(msg[0]).toBe(msg[0].toUpperCase());
      }
    },
  );

  it('the impossible-constraints message names the students, via the resolver, and the group count', () => {
    const names = ['Ana', 'Budi', 'Citra', 'Dewi', 'Eko'];
    const msg = renderError(
      {
        code: ERROR_CODES.keepApartImpossible,
        students: [1, 2, 3, 4, 5],
        groupsNeeded: 5,
      },
      en,
      (n) => names[n - 1],
    );
    for (const name of names) expect(msg).toContain(name);
    expect(msg).toContain('5');
  });

  describe('resolving a student number to a label', () => {
    // KEEP_APART_IMPOSSIBLE carries numbers (Student.number is the identity;
    // see grouping.ts), never names -- the engine has no roster to resolve
    // one from. renderError's third parameter is how a caller with a roster
    // supplies a better label than a bare number; a caller without one --
    // or one that simply forgets -- must still get a readable sentence.
    it.each(locales)(
      'falls back to the numbered label when no resolver is supplied (%s)',
      (_name, strings) => {
        const msg = renderError(
          {
            code: ERROR_CODES.keepApartImpossible,
            students: [1, 2],
            groupsNeeded: 2,
          },
          strings,
        );
        // The exact rendered sentence, not merely "a function was called" --
        // a resolver that fires but formats wrongly would still pass a
        // weaker check.
        expect(msg).toBe(
          strings.errors.KEEP_APART_IMPOSSIBLE(
            [strings.studentNumber(1), strings.studentNumber(2)],
            2,
          ),
        );
        expect(msg).toContain(strings.studentNumber(1));
        expect(msg).toContain(strings.studentNumber(2));
        // Digits alone, with no word around them, is exactly the bug this
        // default exists to prevent -- "1, 2 all need to be kept apart" reads
        // as nonsense to a teacher.
        expect(msg).not.toMatch(/^\d+, \d+ /);
      },
    );

    it('English default reads "Student 1, Student 2 …", not bare digits', () => {
      const msg = renderError(
        {
          code: ERROR_CODES.keepApartImpossible,
          students: [1, 2],
          groupsNeeded: 2,
        },
        en,
      );
      expect(msg).toContain('Student 1, Student 2');
    });

    it('Indonesian default reads "Siswa 1, Siswa 2 …", not bare digits', () => {
      const msg = renderError(
        {
          code: ERROR_CODES.keepApartImpossible,
          students: [1, 2],
          groupsNeeded: 2,
        },
        id,
      );
      expect(msg).toContain('Siswa 1, Siswa 2');
    });

    it('a supplied resolver is used in place of the default, for every number', () => {
      const byNumber: Record<number, string> = { 1: 'Ana', 2: 'Budi' };
      const msg = renderError(
        {
          code: ERROR_CODES.keepApartImpossible,
          students: [1, 2],
          groupsNeeded: 2,
        },
        en,
        (n) => byNumber[n],
      );
      expect(msg).toBe(
        'Ana, Budi all need to be kept apart from each other, so you would need at least 2 groups. Either make more groups or remove one of the rules.',
      );
      expect(msg).not.toContain('Student');
    });
  });

  describe('both together- and apart-letters are live at once', () => {
    // Correction 2: the two single-rule codes have OPPOSITE remedies, so
    // guessing between them when both rules are live sends the teacher the
    // wrong way as often as the right one. These pin that the combined
    // copy commits to neither.
    it.each(locales)(
      'names how many groups were tried, without picking a side (%s)',
      (_name, strings) => {
        const msg = renderError(
          { code: ERROR_CODES.bothRulesNoArrangement, groupsTried: 3 },
          strings,
        );
        expect(msg).toContain('3');
      },
    );

    it('English offers BOTH remedies -- bigger groups AND more groups -- not one', () => {
      const msg = renderError(
        { code: ERROR_CODES.bothRulesNoArrangement, groupsTried: 3 },
        en,
      );
      // "bigger" is the together remedy; "more groups" is the keep-apart
      // remedy. A version that silently collapsed to one rule's copy (the
      // Task 4 placeholder this replaces) would fail one side of this.
      expect(msg).toContain('bigger');
      expect(msg).toContain('more groups');
    });

    it('English gave-up copy does not claim either rule is the cause', () => {
      const msg = renderError({ code: ERROR_CODES.bothRulesSearchGaveUp }, en);
      expect(msg).not.toContain(ERROR_CODES.bothRulesSearchGaveUp);
      expect(msg).toMatch(/^\S.*[.!?]$/);
    });
  });

  it('states the maximum possible when too many groups were requested', () => {
    const msg = renderError(
      { code: ERROR_CODES.tooManyGroups, maxGroups: 4 },
      en,
    );
    expect(msg).toContain('4');
  });

  it.each(locales)(
    'the together-unit-too-large message names the letter, the unit size and the group size (%s)',
    (_name, strings) => {
      // letter: 'Q' rather than 'A' -- the sample used to pass 'A', so a
      // renderError that quietly hardcoded the letter to 'A' instead of
      // substituting `error.letter` would render "...letter "A"..." and this
      // test could not tell the difference: its own expected value was the
      // same letter the bug would have hardcoded. 'Q' does not collide with
      // a plausible hardcoded default, so a dropped substitution now shows
      // up as a missing 'Q' rather than a coincidental match. Fix round 1, F-6.
      const msg = renderError(
        {
          code: ERROR_CODES.togetherUnitTooLarge,
          letter: 'Q',
          unit: 6,
          groupSize: 4,
        },
        strings,
      );
      expect(msg).toContain('Q');
      expect(msg).toContain('6');
      expect(msg).toContain('4');
    },
  );

  it.each(locales)(
    'the together-no-arrangement message names how many groups were tried (%s)',
    (_name, strings) => {
      // Fix round 1, F-1/F-6: the generic "renders every code as a real
      // sentence" check above only looks at sentence SHAPE, so it would not
      // notice renderError threading the wrong number through. This is the
      // dedicated check that does, matching the precedent set by the
      // together-unit-too-large test above rather than by
      // KEEP_APART_NO_ARRANGEMENT, which has no dedicated test at all.
      const msg = renderError(
        { code: ERROR_CODES.togetherNoArrangement, groupsTried: 3 },
        strings,
      );
      expect(msg).toContain('3');
    },
  );
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
      // "Glory points" is YeeTalk's in-app currency — a product name, not
      // English prose, so it is correctly identical in both locales. Listed
      // explicitly rather than loosening the check: the guard's value is that
      // every exception is a decision someone made on purpose.
      'glory.inputLabel',
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

describe('the locale-aware paths', () => {
  // localisePath's own doc comment names "the classic i18n bug" — a switcher
  // that dumps the visitor on the homepage. Every function in this block had
  // zero references anywhere in tests/ before this.

  it.each([
    ['/', 'en', '/'],
    ['/', 'id', '/id/'],
    ['/id/', 'en', '/'],
    ['/id/', 'id', '/id/'],
    ['/classroom-groups', 'id', '/id/classroom-groups'],
    ['/classroom-groups/', 'id', '/id/classroom-groups/'],
    ['/id/classroom-groups', 'en', '/classroom-groups'],
    ['/id/classroom-groups/', 'en', '/classroom-groups/'],
    ['/glory-points', 'en', '/glory-points'],
    // The anchoring that matters: /identity is not the Indonesian homepage.
    ['/identity', 'id', '/id/identity'],
    ['/identity', 'en', '/identity'],
    ['/ideas', 'en', '/ideas'],
    ['/id-card', 'en', '/id-card'],
  ] as const)('localisePath(%s, %s) -> %s', (path, target, expected) => {
    expect(localisePath(path, target)).toBe(expected);
  });

  it.each([
    ['/', 'en'],
    ['/glory-points', 'en'],
    ['/identity', 'en'], // must NOT be read as the /id prefix
    ['/ideas', 'en'],
    ['/id', 'id'],
    ['/id/', 'id'],
    ['/id/glory-points', 'id'],
  ] as const)('localeFromPath(%s) -> %s', (path, locale) => {
    expect(localeFromPath(path)).toBe(locale);
  });

  it('a round trip through the other language returns to the same page', () => {
    for (const path of [
      '/',
      '/glory-points',
      '/classroom-groups',
      '/identity',
    ]) {
      const there = localisePath(path, 'id');
      expect(localisePath(there, 'en')).toBe(path);
    }
  });

  it.each([
    ['en', '/classroom-groups'],
    ['id', '/id/classroom-groups'],
  ] as const)('toolPath(%s)', (locale, expected) => {
    expect(toolPath(locale)).toBe(expected);
  });

  it('otherLocale is its own inverse', () => {
    expect(otherLocale('en')).toBe('id');
    expect(otherLocale('id')).toBe('en');
    expect(otherLocale(otherLocale('en'))).toBe('en');
  });

  it.each([
    ['en', true],
    ['id', true],
    ['fr', false],
    ['EN', false],
    ['', false],
  ] as const)('isLocale(%s) -> %s', (value, expected) => {
    expect(isLocale(value)).toBe(expected);
  });

  it.each([[undefined], [null], [7], [{}]])(
    'isLocale rejects the non-string %s',
    (value) => {
      expect(isLocale(value)).toBe(false);
    },
  );
});

describe('group names', () => {
  it('numbers groups from 1, not from 0', () => {
    expect(groupName(0, 'numbered', 'animals', en)).toBe('Group 1');
    expect(groupName(0, 'numbered', 'animals', id)).toBe('Kelompok 1');
  });

  it('uses the theme in the page language', () => {
    expect(groupName(0, 'themed', 'animals', en)).toBe('Tigers');
    expect(groupName(0, 'themed', 'animals', id)).toBe('Harimau');
  });

  it('falls back to numbering past the end of a theme', () => {
    // Repeating a name would make two groups indistinguishable, which is
    // worse than a plain number.
    expect(en.themes.animals).toHaveLength(8);
    expect(groupName(8, 'themed', 'animals', en)).toBe('Group 9');
  });

  it('falls back to numbering for a theme that does not exist', () => {
    // The value arrives from a <select> on the page, so it is a string
    // nobody has checked by the time it gets here.
    expect(groupName(0, 'themed', 'dinosaurs', en)).toBe('Group 1');
    expect(groupName(0, 'themed', '', en)).toBe('Group 1');
  });
});

describe('the sentences a teacher reads at the end', () => {
  // These are asserted as WHOLE SENTENCES. The e2e suite checked
  // `toContainText('22')` — a bare number, which would pass just as happily
  // if the two arguments were swapped, and did pass while the page said
  // "1 groups from 7 students."
  it.each([
    [5, 22, '5 groups from 22 students.'],
    // The tool's own documented headline case: 7 students in groups of 4 is
    // ONE group of 7. The page has printed "1 groups" since it shipped.
    [1, 7, '1 group from 7 students.'],
    [1, 1, '1 group from 1 student.'],
    [2, 2, '2 groups from 2 students.'],
  ])('English %i/%i', (groups, students, sentence) => {
    expect(en.resultsSummary(groups, students)).toBe(sentence);
  });

  it.each([
    [5, 22, '5 kelompok dari 22 siswa.'],
    [1, 7, '1 kelompok dari 7 siswa.'],
  ])('Indonesian %i/%i — no inflection, correct as written', (g, s, out) => {
    expect(id.resultsSummary(g, s)).toBe(out);
  });

  it('cannot pass with its arguments swapped', () => {
    // The property the old assertion lacked.
    expect(en.resultsSummary(5, 22)).not.toBe(en.resultsSummary(22, 5));
  });
});
