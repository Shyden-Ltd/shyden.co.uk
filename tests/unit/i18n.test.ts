import { describe, it, expect } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { id } from '../../src/lib/i18n/id';
import {
  LOCALES,
  getStrings,
  renderError,
  renderWarning,
  localisePath,
  localeFromPath,
  toolPath,
  otherLocale,
  isLocale,
  groupName,
  resultsHeadingText,
} from '../../src/lib/i18n';
import {
  ERROR_CODES,
  WARNING_CODES,
  type GroupingError,
  type GroupingWarning,
} from '../../src/lib/grouping';
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
  // A function contributes NOTHING here -- not a key, not a value, not a
  // string to compare. `deepFunctions` below is the walk that actually
  // reaches these (most of `errors`/`warnings`, and the three top-level
  // formatters); "the rendered-sentence tests below" cover only that they
  // produce SOME sentence-shaped string, never that the Indonesian one
  // differs from the English one -- see Task 11's "every parameterised
  // message is actually translated" test for the check that closes that
  // gap. This function is named for what it collects, not for what covers
  // the rest, so this comment used to overclaim; it no longer does.
  return [];
};

/**
 * Every function-valued leaf, addressed by the same dotted path `deepKeys`
 * and `deepStrings` use — `errors.KEEP_APART_NO_ARRANGEMENT`, `groupLabel`,
 * and so on.
 *
 * `deepStrings` only collects `typeof value === 'string'`, so a function —
 * most of `errors`/`warnings` (every message with a number, a name list or
 * a letter substituted in — the ones carrying the most detail, and the
 * majority of the table by count) plus `resultsSummary`/`groupLabel`/
 * `studentNumber` — is invisible to it: no key, no value, nothing to
 * compare. Paste `en`'s own `KEEP_APART_NO_ARRANGEMENT` function into
 * `id.ts` verbatim and every `deepStrings`-based check above stays green,
 * because there is no STRING there to catch it. This walk exists so the
 * "genuinely translated" promise reaches these too.
 */
const deepFunctions = (
  value: unknown,
  path = '',
): Array<[string, (...args: never[]) => unknown]> => {
  if (typeof value === 'function')
    return [[path, value as (...args: never[]) => unknown]];
  if (Array.isArray(value))
    return value.flatMap((v, i) => deepFunctions(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) =>
      deepFunctions(v, path ? `${path}.${k}` : k),
    );
  return [];
};

/**
 * Strings that are legitimately the same in both languages. Measured, not
 * assumed — this is the whole list across every key at every depth.
 */
const ALLOWED_IDENTICAL = new Set([
  'speedNormal', // "Normal" is the Indonesian word as well
  // Stage 3, Task 2. Punctuation/symbols, not English -- "#" and "—" carry
  // no language of their own, so there is nothing to translate. See these
  // two keys' own doc comments in en.ts.
  'rosterColNumber',
  'rosterUnset',
]);

/**
 * One representative call per parameterised (function-valued) locale entry,
 * keyed by the same dotted path `deepFunctions` reports.
 *
 * Different functions take different argument shapes (a name list, a single
 * number, three numbers, a sex literal — `Strings` has no one signature), so
 * there is no generic way to invoke "the next function found"; each entry
 * here is deliberate, matching the codebase's existing SAMPLES-table
 * convention below rather than a clever generic guess. `names` arguments use
 * plain resolved-looking strings ('Student 1', not a raw number) because
 * that is what these functions actually receive at runtime — `renderError`/
 * `renderWarning` resolve every number through `resolveStudent` before the
 * locale function ever sees it (see index.ts) — and a probe should call the
 * function with the same SHAPE of argument its real caller does.
 *
 * A path with no entry here is reported by the test below, not silently
 * skipped — see its own comment for why "no probe" must fail loudly rather
 * than pass by omission.
 */
const FUNCTION_PROBES: Record<string, unknown[]> = {
  resultsSummary: [3, 7],
  groupLabel: [2],
  studentNumber: [4],
  // Stage 2, Task 5. `resultsHeadingNamed` -- resultsHeadingText's sole
  // caller for a non-blank class name (src/lib/i18n/index.ts).
  resultsHeadingNamed: ['7B'],
  'errors.TOO_MANY_STUDENTS': [500],
  'errors.DUPLICATE_NUMBER': [5],
  'errors.TOO_MANY_GROUPS': [4],
  'errors.TOGETHER_APART_CLASH': [['Student 1', 'Student 2']],
  'errors.TOGETHER_UNIT_TOO_LARGE': ['Q', 6, 4],
  'errors.TOGETHER_NO_ARRANGEMENT': [3],
  'errors.KEEP_APART_IMPOSSIBLE': [['Student 1', 'Student 2'], 2],
  'errors.KEEP_APART_NO_ARRANGEMENT': [3],
  'errors.BOTH_RULES_NO_ARRANGEMENT': [2],
  'errors.SEX_NEEDS_ALL_SET': [['Student 3']],
  'errors.SEX_SEPARATE_SPLITS_UNIT': [['Student 1', 'Student 2']],
  'errors.SEX_SEPARATE_IMPOSSIBLE': [3],
  'errors.PINNED_SPLITS_UNIT': [['Student 1', 'Student 7']],
  'errors.PINNED_APART_CLASH': [['Student 1', 'Student 2']],
  'errors.PINNED_IN_TWO_GROUPS': ['Student 1'],
  'errors.PINNED_TOO_MANY_GROUPS': [4, 1, 2],
  'warnings.SEX_SPILLOVER': [['Student 7', 'Student 8'], 'M'],
  'warnings.PINNED_MIXED_SEX': [['Student 1', 'Student 4']],
  'warnings.SEX_BOTH_TOO_SMALL': [['Student 1', 'Student 7']],
  // Stage 2, Task 3. The Student details header's counted state fragments --
  // see sections.ts's own sectionState, the sole caller of all five.
  stateNamed: [24],
  stateAbsent: [2],
  stateTogether: [2],
  stateApart: [1],
  stateAdded: [24],
  // Stage 2, Task 4. src/lib/sexOptions.ts's `sexWhy`, its sole caller.
  // (3, 22) matches design spec section 6's own approved copy verbatim.
  sexWhyUnset: [3, 22],
  // Stage 3, Task 9. src/lib/sexOptions.ts's `sexWhyReturning`, its sole
  // caller, which hands it an ALREADY-LABELLED student -- a name the
  // teacher typed, or `studentNumber(n)` when they typed none -- so the
  // probe is a bare name and neither locale has to know that fallback rule.
  // 'Dewi' matches design spec section 13's own approved example verbatim.
  sexWhyReturning: ['Dewi'],
  // Stage 4, Task 3. src/lib/csv.ts's `parseRoster`, their sole caller.
  //
  // The accepted-token argument is passed IN from CSV_LOCALES rather than
  // written by each locale, so the probe supplies the value the ENGLISH
  // table would give. That is deliberate and it is what makes the
  // untranslated-copy half of this test meaningful: with the same tokens on
  // both sides, any difference in the produced sentence has to come from
  // the translated wording around them, not from the tokens.
  csvProblemNumberBlank: [7],
  csvProblemNumberNotWhole: [7, 'abc'],
  csvProblemDuplicateNumber: [12, 5, 5],
  csvProblemSex: [7, 'Male', 'M, F'],
  csvProblemAbsent: [7, 'maybe', 'yes, no'],
  csvProblemLetter: [7, 'together', 'AB'],
  csvProblemTooMany: [101, 100],
  // Stage 4, Task 4. Probed with the English page's own names for the
  // Indonesian language, which is the argument pair `importFile` supplies
  // when an Indonesian file is dropped on the English page -- design spec
  // section 9's own approved example.
  csvWrongLanguage: ['Bahasa Indonesia', 'Indonesian'],
  // Stage 3, Task 4. renderRoster's own live count line (roster-ui.ts),
  // rendered under the table. (24, 22, 2) matches design spec section 4's
  // own literal example verbatim, the same example
  // classroom-groups-roster.spec.ts's own "the count line reads students,
  // here and absent" test pins.
  rosterCountLine: [24, 22, 2],
  // Stage 3, Task 5. rosterProblems/rosterWarnings' own sole callers
  // (src/lib/roster.ts) -- (5, 'Eko') matches task-5-brief.md's own
  // approved example verbatim.
  rosterDuplicateMessage: [5, 'Eko'],
  rosterClashMessage: [['Ana', 'Budi']],
  rosterGapWarning: [[4, 6, 7]],
  // Stage 3, Task 6. rosterOpenProblem/rosterAtLimit's own sole callers
  // (src/lib/roster.ts, roster-ui.ts) -- always called with MAX_ROSTER
  // itself, so 100 is the only argument either is ever probed with.
  rosterOpenRefusedMessage: [100],
  rosterAtLimitMessage: [100],
  rosterRoomMessage: [10],
};

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

  // Task 11, the final sweep. Logged in progress.md against Task 6's own
  // report: this walk skips every function-valued entry (see
  // `deepStrings`'s own comment above), and most of `errors`/`warnings` —
  // the parameterised messages, which carry the most detail of anything in
  // either locale — are functions. Closes that gap the same way the test
  // above closes it for plain strings: call both locales' copy of the SAME
  // function with the SAME arguments, and require the output to differ.
  it('every parameterised message is actually translated, not copied English, when called with the same arguments', () => {
    const idByPath = new Map(deepFunctions(id));
    const missingProbe: string[] = [];
    const identical: string[] = [];

    for (const [path, enFn] of deepFunctions(en)) {
      const args = FUNCTION_PROBES[path];
      // A function this repo added with no entry in FUNCTION_PROBES above
      // is UNTESTED by this check, not exempt from it -- failing here, not
      // silently skipping, is what makes that visible. Fix: add one
      // representative call for the new path to FUNCTION_PROBES, using
      // arguments shaped like what `renderError`/`renderWarning` actually
      // pass (see that table's own comment).
      if (!args) {
        missingProbe.push(path);
        continue;
      }
      const idFn = idByPath.get(path);
      // idFn's absence would mean `id` is missing a key `en` has -- already
      // caught by "Indonesian defines every key English defines" above, so
      // this only needs to not crash; the `!idFn` branch keeps `identical`
      // honestly reporting a real difference, not a thrown TypeError, if
      // that other test's own failure is what brought you here.
      const enOut = enFn(...(args as never[]));
      const idOut = idFn ? idFn(...(args as never[])) : undefined;
      if (enOut === idOut) identical.push(path);
    }

    // A function silently skipped is a translation nobody checked -- same
    // failure mode `deepStrings` already had, now caught instead of hidden.
    expect(missingProbe).toEqual([]);
    // English text called with Indonesian's own function and getting back
    // the SAME string means id.ts's copy was never actually written --
    // fix by translating that path's function body in id.ts, the same
    // remedy as the plain-string check above.
    expect(identical).toEqual([]);
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
    // Numbers, not names -- same reason as KEEP_APART_IMPOSSIBLE below.
    TOGETHER_APART_CLASH: {
      code: ERROR_CODES.togetherApartClash,
      students: [1, 2],
    },
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
    // Task 7. Carries `students: number[]`, never names -- same resolver
    // pattern as TOGETHER_APART_CLASH and KEEP_APART_IMPOSSIBLE above. A
    // single student, deliberately: the guard can legitimately fire for
    // just one (see grouping.test.ts's "refuses when a student being
    // grouped has no sex set"), so English copy has a singular/plural
    // branch to get right, unlike the two codes above whose student lists
    // are always >= 2 by construction.
    SEX_NEEDS_ALL_SET: { code: ERROR_CODES.sexNeedsAllSet, students: [3] },
    // Task 8b. Carries `students: number[]`, never names -- same resolver
    // pattern as TOGETHER_APART_CLASH above. Always >= 2 by construction (a
    // together-unit spanning both sexes needs at least one of each), unlike
    // SEX_NEEDS_ALL_SET above.
    SEX_SEPARATE_SPLITS_UNIT: {
      code: ERROR_CODES.sexSeparateSplitsUnit,
      students: [1, 2],
    },
    // Fix round 1, F-2. Carries `groupsRequested: number`, never names --
    // no resolver involved, unlike every other code in this table that
    // carries `students`.
    SEX_SEPARATE_IMPOSSIBLE: {
      code: ERROR_CODES.sexSeparateImpossible,
      groupsRequested: 4,
    },
    // Fix round 2. Carries no data at all, like the other three
    // SEARCH_GAVE_UP codes above -- nothing was established, so there is
    // nothing to pass through.
    SEX_SEPARATE_SEARCH_GAVE_UP: { code: ERROR_CODES.sexSeparateSearchGaveUp },
    // Task 9. Carries `students: number[]`, never names -- same resolver
    // pattern as TOGETHER_APART_CLASH above. Always >= 2 by construction.
    PINNED_SPLITS_UNIT: {
      code: ERROR_CODES.pinnedSplitsUnit,
      students: [1, 7],
    },
    // Task 9. Carries `students: number[]`, always >= 2 by construction
    // (an apart-letter needs at least two holders, both inside one pinned
    // group to trip this).
    PINNED_APART_CLASH: {
      code: ERROR_CODES.pinnedApartClash,
      students: [1, 2],
    },
    // Task 9. Carries a single `number`, like DUPLICATE_NUMBER -- never a
    // list.
    PINNED_IN_TWO_GROUPS: {
      code: ERROR_CODES.pinnedInTwoGroups,
      number: 5,
    },
    // Fix round 1, F-1/F-2. Carries three numbers, always present -- see
    // ERROR_CODES.pinnedTooManyGroups's doc comment in grouping.ts for why
    // a derived `poolGroupsNeeded` is not its own field. F-1's own reported
    // shape: 10 students, groupCount 4, one pin of 8.
    PINNED_TOO_MANY_GROUPS: {
      code: ERROR_CODES.pinnedTooManyGroups,
      requestedGroups: 4,
      pinnedGroupCount: 1,
      remainingStudents: 2,
    },
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

  describe('together-apart clash resolves student numbers to names', () => {
    // Correction 1: TOGETHER_APART_CLASH carries `students: number[]`,
    // exactly like KEEP_APART_IMPOSSIBLE above, and must go through the same
    // resolver -- a teacher reading "1, 2 are marked..." instead of
    // "Ana, Budi are marked..." is exactly the regression the resolver
    // parameter exists to prevent.
    it.each(locales)(
      'falls back to the numbered label when no resolver is supplied (%s)',
      (_name, strings) => {
        const msg = renderError(
          { code: ERROR_CODES.togetherApartClash, students: [1, 2] },
          strings,
        );
        expect(msg).toBe(
          strings.errors.TOGETHER_APART_CLASH([
            strings.studentNumber(1),
            strings.studentNumber(2),
          ]),
        );
        expect(msg).toContain(strings.studentNumber(1));
        expect(msg).toContain(strings.studentNumber(2));
        // Digits alone, with no word around them, is exactly the bug this
        // default exists to prevent.
        expect(msg).not.toMatch(/^\d+, \d+ /);
      },
    );

    it('English default reads "Student 1, Student 2 …", not bare digits', () => {
      const msg = renderError(
        { code: ERROR_CODES.togetherApartClash, students: [1, 2] },
        en,
      );
      expect(msg).toContain('Student 1, Student 2');
    });

    it('Indonesian default reads "Siswa 1, Siswa 2 …", not bare digits', () => {
      const msg = renderError(
        { code: ERROR_CODES.togetherApartClash, students: [1, 2] },
        id,
      );
      expect(msg).toContain('Siswa 1, Siswa 2');
    });

    it('English: a supplied resolver is used in place of the default, for every number', () => {
      const byNumber: Record<number, string> = { 1: 'Ana', 2: 'Budi' };
      const msg = renderError(
        { code: ERROR_CODES.togetherApartClash, students: [1, 2] },
        en,
        (n) => byNumber[n],
      );
      expect(msg).toBe(
        'Ana, Budi are marked to stay together and to be kept apart from each other at the same time. Remove the together letter or the apart letter from one of them.',
      );
      expect(msg).not.toContain('Student');
    });

    it('Indonesian: a supplied resolver is used in place of the default, for every number', () => {
      const byNumber: Record<number, string> = { 1: 'Ana', 2: 'Budi' };
      const msg = renderError(
        { code: ERROR_CODES.togetherApartClash, students: [1, 2] },
        id,
        (n) => byNumber[n],
      );
      expect(msg).toBe(
        'Ana, Budi ditandai untuk disatukan sekaligus dipisahkan satu sama lain. Hapus huruf yang menyatukan mereka, atau huruf yang memisahkan mereka.',
      );
      expect(msg).not.toContain('Siswa');
    });
  });

  describe('sex-needs-all-set resolves student numbers to names', () => {
    // Task 7. Carries `students: number[]`, exactly like
    // TOGETHER_APART_CLASH and KEEP_APART_IMPOSSIBLE above, and must go
    // through the same resolver -- a teacher reading "3 does not have..."
    // instead of "Citra does not have..." is the same regression the
    // resolver parameter exists to prevent for the other two codes.
    it.each(locales)(
      'falls back to the numbered label when no resolver is supplied (%s)',
      (_name, strings) => {
        const msg = renderError(
          { code: ERROR_CODES.sexNeedsAllSet, students: [3] },
          strings,
        );
        expect(msg).toBe(
          strings.errors.SEX_NEEDS_ALL_SET([strings.studentNumber(3)]),
        );
        expect(msg).toContain(strings.studentNumber(3));
        // A bare digit with no word around it is exactly the bug this
        // default exists to prevent.
        expect(msg).not.toMatch(/^\d+ /);
      },
    );

    it('English default reads "Student 3 …", not a bare digit', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexNeedsAllSet, students: [3] },
        en,
      );
      expect(msg).toContain('Student 3');
    });

    it('Indonesian default reads "Siswa 3 …", not a bare digit', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexNeedsAllSet, students: [3] },
        id,
      );
      expect(msg).toContain('Siswa 3');
    });

    it('English: a supplied resolver is used in place of the default', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexNeedsAllSet, students: [3] },
        en,
        (n) => (n === 3 ? 'Citra' : `#${n}`),
      );
      expect(msg).toBe(
        'Citra has no sex set, so this mode cannot run until every student does. Set a sex for them, or turn it off.',
      );
      expect(msg).not.toContain('Student');
    });

    it('Indonesian: a supplied resolver is used in place of the default', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexNeedsAllSet, students: [3] },
        id,
        (n) => (n === 3 ? 'Citra' : `#${n}`),
      );
      expect(msg).toBe(
        'Citra belum memiliki jenis kelamin, jadi mode ini tidak bisa dijalankan sampai jenis kelamin semua siswa terisi. Isi jenis kelamin untuk mereka, atau matikan mode ini.',
      );
      expect(msg).not.toContain('Siswa');
    });

    it('English names everyone when more than one student has no sex set, with plural grammar', () => {
      // English inflects (see resultsSummary's own singular/plural split),
      // so a list of TWO must read differently from the singular case
      // above -- "has" -> "have", "them" -> "each of them" -- not just a
      // longer name list glued onto the same singular verb.
      const msg = renderError(
        { code: ERROR_CODES.sexNeedsAllSet, students: [1, 2] },
        en,
        (n) => (n === 1 ? 'Ana' : 'Budi'),
      );
      expect(msg).toBe(
        'Ana, Budi have no sex set, so this mode cannot run until every student does. Set a sex for each of them, or turn it off.',
      );
    });

    it('Indonesian reads the same with two students, since Indonesian does not inflect for plural', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexNeedsAllSet, students: [1, 2] },
        id,
        (n) => (n === 1 ? 'Ana' : 'Budi'),
      );
      expect(msg).toBe(
        'Ana, Budi belum memiliki jenis kelamin, jadi mode ini tidak bisa dijalankan sampai jenis kelamin semua siswa terisi. Isi jenis kelamin untuk mereka, atau matikan mode ini.',
      );
    });
  });

  describe('sex-separate-splits-unit resolves student numbers to names', () => {
    // Task 8b. Carries `students: number[]`, exactly like
    // TOGETHER_APART_CLASH above, and must go through the same resolver --
    // a teacher reading "1, 2 are marked..." instead of "Ana, Budi are
    // marked..." is the same regression the resolver parameter exists to
    // prevent there.
    it.each(locales)(
      'falls back to the numbered label when no resolver is supplied (%s)',
      (_name, strings) => {
        const msg = renderError(
          { code: ERROR_CODES.sexSeparateSplitsUnit, students: [1, 2] },
          strings,
        );
        expect(msg).toBe(
          strings.errors.SEX_SEPARATE_SPLITS_UNIT([
            strings.studentNumber(1),
            strings.studentNumber(2),
          ]),
        );
        expect(msg).toContain(strings.studentNumber(1));
        expect(msg).toContain(strings.studentNumber(2));
        expect(msg).not.toMatch(/^\d+, \d+ /);
      },
    );

    it('English default reads "Student 1, Student 2 …", not bare digits', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexSeparateSplitsUnit, students: [1, 2] },
        en,
      );
      expect(msg).toContain('Student 1, Student 2');
    });

    it('Indonesian default reads "Siswa 1, Siswa 2 …", not bare digits', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexSeparateSplitsUnit, students: [1, 2] },
        id,
      );
      expect(msg).toContain('Siswa 1, Siswa 2');
    });

    it('English: a supplied resolver is used in place of the default, names the pair and both remedies', () => {
      const byNumber: Record<number, string> = { 1: 'Ana', 2: 'Budi' };
      const msg = renderError(
        { code: ERROR_CODES.sexSeparateSplitsUnit, students: [1, 2] },
        en,
        (n) => byNumber[n],
      );
      expect(msg).toBe(
        'Ana, Budi are marked to stay together, but are not all the same sex, so they cannot form a single-sex group. Remove the together letter from one of them, or turn this mode off.',
      );
      expect(msg).not.toContain('Student');
    });

    it('Indonesian: a supplied resolver is used in place of the default', () => {
      const byNumber: Record<number, string> = { 1: 'Ana', 2: 'Budi' };
      const msg = renderError(
        { code: ERROR_CODES.sexSeparateSplitsUnit, students: [1, 2] },
        id,
        (n) => byNumber[n],
      );
      expect(msg).toBe(
        'Ana, Budi ditandai untuk disatukan, tetapi tidak semuanya berjenis kelamin sama, sehingga tidak bisa membentuk kelompok satu jenis kelamin. Hapus huruf yang menyatukan mereka, atau matikan mode ini.',
      );
      expect(msg).not.toContain('Siswa');
    });
  });

  describe('sex-separate-impossible names no rule and no side (Fix round 1, F-2)', () => {
    // Exact full sentences, both languages -- this code's whole reason to
    // exist is that a teacher must never read a number they did not type,
    // so its copy gets the same word-for-word scrutiny
    // sex-separate-splits-unit's did above, not just a substring check.
    it('English reads the exact sentence, naming the requested count and both remedies, no rule', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexSeparateImpossible, groupsRequested: 4 },
        en,
      );
      expect(msg).toBe(
        'Boys and girls cannot be kept in separate groups across 4 groups while also satisfying your other rules. The search cannot tell which rule is the problem, so try either remedy: ask for a different number of groups, or turn this mode off.',
      );
    });

    it('Indonesian reads the exact sentence', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexSeparateImpossible, groupsRequested: 4 },
        id,
      );
      expect(msg).toBe(
        'Laki-laki dan perempuan tidak bisa tetap berada di kelompok terpisah dalam 4 kelompok sekaligus memenuhi aturan Anda yang lain. Pencarian ini tidak bisa memastikan aturan mana yang jadi masalah, jadi coba salah satu perbaikan ini: minta jumlah kelompok yang berbeda, atau matikan mode ini.',
      );
    });

    it.each(locales)(
      'is not a together/apart code in disguise, at a groupsTried value those codes also use (%s)',
      (_name, strings) => {
        // Fix round 1, F-7 precedent (BOTH_RULES_NO_ARRANGEMENT's own test
        // above): the risk is not "renders empty", it is "collapses into a
        // sibling code's exact wording" -- same groupsTried/groupsRequested
        // value (3) as the together/apart/both-rules samples elsewhere in
        // this file, so a copy-paste that reused one of THEIR strings would
        // be caught here, not hidden by picking a number nothing else uses.
        const msg = renderError(
          { code: ERROR_CODES.sexSeparateImpossible, groupsRequested: 3 },
          strings,
        );
        expect(msg).toContain('3');
        expect(msg).not.toBe(strings.errors.TOGETHER_NO_ARRANGEMENT(3));
        expect(msg).not.toBe(strings.errors.KEEP_APART_NO_ARRANGEMENT(3));
        expect(msg).not.toBe(strings.errors.BOTH_RULES_NO_ARRANGEMENT(3));
      },
    );
  });

  describe('sex-separate-search-gave-up claims nothing, and offers the mode switch (Fix round 2)', () => {
    // Exact full sentences, both languages -- same word-for-word scrutiny
    // sex-separate-impossible's own test above gets: a proof-shaped
    // sentence reaching a teacher when nothing was actually proven is
    // exactly the defect this code exists to prevent, so a substring check
    // could not tell a correct fix from one that merely renders SOMETHING.
    it('English reads the exact sentence: no proof claimed, fewer letters or the mode switch', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexSeparateSearchGaveUp },
        en,
      );
      expect(msg).toBe(
        'There are too many together- and apart-letters here to work through while also keeping boys and girls in separate groups. Try using fewer letters, or turn this mode off.',
      );
    });

    it('Indonesian reads the exact sentence', () => {
      const msg = renderError(
        { code: ERROR_CODES.sexSeparateSearchGaveUp },
        id,
      );
      expect(msg).toBe(
        'Huruf yang harus disatukan dan aturan pemisahan di sini terlalu banyak untuk dihitung sekaligus, sambil juga menjaga laki-laki dan perempuan di kelompok terpisah. Coba gunakan lebih sedikit huruf, atau matikan mode ini.',
      );
    });

    // Collapsing into ANY of the other three SEARCH_GAVE_UP codes would be
    // the same defect class as sex-separate-impossible's own "not a
    // together/apart code in disguise" test above -- these four all carry
    // ZERO data, so a copy-paste mistake here could not be caught by any
    // number-based check the way that test uses; only the exact sentence
    // can catch it.
    it.each(locales)(
      'is not one of the other three SEARCH_GAVE_UP codes in disguise (%s)',
      (_name, strings) => {
        const msg = renderError(
          { code: ERROR_CODES.sexSeparateSearchGaveUp },
          strings,
        );
        expect(msg).not.toBe(strings.errors.TOGETHER_SEARCH_GAVE_UP);
        expect(msg).not.toBe(strings.errors.KEEP_APART_SEARCH_GAVE_UP);
        expect(msg).not.toBe(strings.errors.BOTH_RULES_SEARCH_GAVE_UP);
      },
    );

    it.each(locales)(
      'is not sexSeparateImpossible in disguise (%s)',
      (_name, strings) => {
        const msg = renderError(
          { code: ERROR_CODES.sexSeparateSearchGaveUp },
          strings,
        );
        const proof = renderError(
          { code: ERROR_CODES.sexSeparateImpossible, groupsRequested: 4 },
          strings,
        );
        expect(msg).not.toBe(proof);
      },
    );
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
        // "Without picking a side" (Fix round 1, F-7): the old version
        // asserted only the group count, which both single-rule PROVEN
        // messages also contain at groupsTried=3 -- so it could not have
        // told a collapse-to-one-rule bug from the real thing. This can:
        // the two single-rule messages are distinct copy this must never
        // equal.
        expect(msg).not.toBe(strings.errors.TOGETHER_NO_ARRANGEMENT(3));
        expect(msg).not.toBe(strings.errors.KEEP_APART_NO_ARRANGEMENT(3));
      },
    );

    // Fix round 1, F-6: folds in and replaces the old English-only "offers
    // BOTH remedies -- bigger groups AND more groups -- not one" test, whose
    // two assertions ('bigger', 'more groups') this strictly subsumes as
    // substrings, and mirrors it into Indonesian, which had NO assertion on
    // this content at all before now -- the gap F-6 found: the Indonesian
    // used to offer four actions with no way to tell which addressed which
    // rule ("berikan setiap huruf ke lebih sedikit siswa" for a message
    // about BOTH letter kinds, when only the together-letter remedy is
    // that). Each phrase below only appears in the FIXED copy -- picked so
    // a regression back to the old generic listing reddens this, not just a
    // regression that drops a remedy entirely.
    it.each([
      ['en', en, 'make the groups bigger', 'make more groups'],
      ['id', id, 'untuk huruf yang harus disatukan', 'untuk aturan pemisahan'],
    ] as const)(
      'ties each remedy to the rule it fixes, not a shared generic list (%s)',
      (_name, strings, togetherPhrase, apartPhrase) => {
        const msg = renderError(
          { code: ERROR_CODES.bothRulesNoArrangement, groupsTried: 3 },
          strings,
        );
        expect(msg).toContain(togetherPhrase);
        expect(msg).toContain(apartPhrase);
      },
    );

    it('English gave-up copy does not claim either rule is the cause', () => {
      // Fix round 1, F-2: the old version only re-checked, for this one
      // code, what the `it.each(locales)` sentence-shape loop above already
      // asserts for EVERY code in SAMPLES (no raw code leaking through; a
      // real sentence) -- nothing in it tested this code's own claim.
      const msg = renderError({ code: ERROR_CODES.bothRulesSearchGaveUp }, en);
      // Mentions BOTH kinds of letter...
      expect(msg).toContain('together');
      expect(msg).toContain('apart');
      // ...and is not a single-rule message in disguise: the two
      // single-rule gave-up sentences are distinct copy this must never
      // collapse into.
      expect(msg).not.toBe(en.errors.TOGETHER_SEARCH_GAVE_UP);
      expect(msg).not.toBe(en.errors.KEEP_APART_SEARCH_GAVE_UP);
    });

    it('Indonesian gave-up copy does not claim either rule is the cause', () => {
      const msg = renderError({ code: ERROR_CODES.bothRulesSearchGaveUp }, id);
      // "disatukan" (together) and "pemisahan" (apart) -- the Indonesian
      // words the single-rule copy above uses on their own.
      expect(msg).toContain('disatukan');
      expect(msg).toContain('pemisahan');
      expect(msg).not.toBe(id.errors.TOGETHER_SEARCH_GAVE_UP);
      expect(msg).not.toBe(id.errors.KEEP_APART_SEARCH_GAVE_UP);
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
      // together-unit-too-large test above -- and, since Task 11's sweep,
      // by KEEP_APART_NO_ARRANGEMENT's own dedicated check directly below,
      // which did not exist when this comment was first written.
      const msg = renderError(
        { code: ERROR_CODES.togetherNoArrangement, groupsTried: 3 },
        strings,
      );
      expect(msg).toContain('3');
    },
  );

  // Task 11, the final sweep. Named directly by the comment above (before
  // this task): this sibling code had a SAMPLES entry (the generic "renders every code" check above)
  // but, unlike TOGETHER_NO_ARRANGEMENT just above, no test confirming
  // `renderError` actually threads `groupsTried` through rather than, say,
  // hardcoding a number or dropping it. Same idiom as that test, same
  // number, deliberately, so a reader can compare the two side by side.
  it.each(locales)(
    'the keep-apart-no-arrangement message names how many groups were tried (%s)',
    (_name, strings) => {
      const msg = renderError(
        { code: ERROR_CODES.keepApartNoArrangement, groupsTried: 3 },
        strings,
      );
      expect(msg).toContain('3');
    },
  );

  describe('pinned-splits-unit resolves student numbers to names', () => {
    // Task 9, Correction 2. Carries `students: number[]`, exactly like
    // togetherApartClash above, and must go through the same resolver.
    it.each(locales)(
      'falls back to the numbered label when no resolver is supplied (%s)',
      (_name, strings) => {
        const msg = renderError(
          { code: ERROR_CODES.pinnedSplitsUnit, students: [1, 7] },
          strings,
        );
        expect(msg).toBe(
          strings.errors.PINNED_SPLITS_UNIT([
            strings.studentNumber(1),
            strings.studentNumber(7),
          ]),
        );
        expect(msg).toContain(strings.studentNumber(1));
        expect(msg).toContain(strings.studentNumber(7));
        expect(msg).not.toMatch(/^\d+, \d+ /);
      },
    );

    it('English: a supplied resolver is used in place of the default, names the pair and both remedies', () => {
      const byNumber: Record<number, string> = { 1: 'Ana', 7: 'Gita' };
      const msg = renderError(
        { code: ERROR_CODES.pinnedSplitsUnit, students: [1, 7] },
        en,
        (n) => byNumber[n],
      );
      expect(msg).toBe(
        'Ana, Gita are marked to stay together, but only some of them are in a pinned group. Unpin the group, or remove the together letter from whoever is outside it.',
      );
      expect(msg).not.toContain('Student');
    });

    it('Indonesian: a supplied resolver is used in place of the default', () => {
      const byNumber: Record<number, string> = { 1: 'Ana', 7: 'Gita' };
      const msg = renderError(
        { code: ERROR_CODES.pinnedSplitsUnit, students: [1, 7] },
        id,
        (n) => byNumber[n],
      );
      expect(msg).toBe(
        'Ana, Gita ditandai untuk disatukan, tetapi hanya sebagian dari mereka yang berada di kelompok yang dikunci. Batalkan kunci kelompok itu, atau hapus huruf penyatu itu dari yang berada di luar kelompok.',
      );
      expect(msg).not.toContain('Siswa');
    });
  });

  describe('pinned-apart-clash resolves student numbers to names', () => {
    // Task 9, Correction 3 (decision: refuse, not warn). Carries
    // `students: number[]`, same resolver pattern as togetherApartClash.
    it.each(locales)(
      'falls back to the numbered label when no resolver is supplied (%s)',
      (_name, strings) => {
        const msg = renderError(
          { code: ERROR_CODES.pinnedApartClash, students: [1, 2] },
          strings,
        );
        expect(msg).toBe(
          strings.errors.PINNED_APART_CLASH([
            strings.studentNumber(1),
            strings.studentNumber(2),
          ]),
        );
        expect(msg).toContain(strings.studentNumber(1));
        expect(msg).toContain(strings.studentNumber(2));
        expect(msg).not.toMatch(/^\d+, \d+ /);
      },
    );

    it('English: a supplied resolver is used in place of the default', () => {
      const byNumber: Record<number, string> = { 1: 'Ana', 2: 'Budi' };
      const msg = renderError(
        { code: ERROR_CODES.pinnedApartClash, students: [1, 2] },
        en,
        (n) => byNumber[n],
      );
      expect(msg).toBe(
        'Ana, Budi are marked to be kept apart from each other, but a pinned group puts them in the same one. Unpin the group, or remove the apart letter from one of them.',
      );
      expect(msg).not.toContain('Student');
    });

    it('Indonesian: a supplied resolver is used in place of the default', () => {
      const byNumber: Record<number, string> = { 1: 'Ana', 2: 'Budi' };
      const msg = renderError(
        { code: ERROR_CODES.pinnedApartClash, students: [1, 2] },
        id,
        (n) => byNumber[n],
      );
      expect(msg).toBe(
        'Ana, Budi ditandai untuk dipisahkan satu sama lain, tetapi kelompok yang dikunci menempatkan mereka bersama. Batalkan kunci kelompok itu, atau hapus huruf pemisah itu dari salah satu siswa tersebut.',
      );
      expect(msg).not.toContain('Siswa');
    });
  });

  describe('pinned-in-two-groups resolves the student number to a name', () => {
    // Task 9, Correction 3 (an unsafe caller error, built not just
    // reported -- see the report). Carries a single `number`, like
    // duplicateNumber, but resolved through `resolveStudent` here (unlike
    // duplicateNumber): this fires after matching against the current
    // roster, so the number is a real, current student.
    it.each(locales)(
      'falls back to the numbered label when no resolver is supplied (%s)',
      (_name, strings) => {
        const msg = renderError(
          { code: ERROR_CODES.pinnedInTwoGroups, number: 5 },
          strings,
        );
        expect(msg).toBe(
          strings.errors.PINNED_IN_TWO_GROUPS(strings.studentNumber(5)),
        );
        expect(msg).toContain(strings.studentNumber(5));
        // A bare digit with no word around it is exactly the bug this
        // default exists to prevent.
        expect(msg).not.toMatch(/^\d+ /);
      },
    );

    it('English: a supplied resolver is used in place of the default', () => {
      const msg = renderError(
        { code: ERROR_CODES.pinnedInTwoGroups, number: 5 },
        en,
        () => 'Eko',
      );
      expect(msg).toBe(
        'Eko is pinned into two different groups at once. A student can only be pinned into one group. Remove them from one of the two.',
      );
      expect(msg).not.toContain('Student');
    });

    it('Indonesian: a supplied resolver is used in place of the default', () => {
      const msg = renderError(
        { code: ERROR_CODES.pinnedInTwoGroups, number: 5 },
        id,
        () => 'Eko',
      );
      expect(msg).toBe(
        'Eko dikunci ke dalam dua kelompok berbeda sekaligus. Satu siswa hanya bisa dikunci ke dalam satu kelompok. Keluarkan dari salah satu kelompok tersebut.',
      );
      expect(msg).not.toContain('Siswa');
    });
  });

  describe('pinned-too-many-groups says the true thing in all three directions (Fix round 1, F-1/F-2 + Fix round 2)', () => {
    // F-1's own reachable shape: an empty-group regression, not a caller
    // mistake -- MORE pool groups requested than pool students remain.
    // Exact sentences, both languages: this code's whole reason to exist is
    // that the OLD message here was a tautology (TOO_MANY_GROUPS's `max`
    // always equal to the number the teacher had just typed -- F-2), so a
    // substring check could not tell a real fix from another
    // wrong-but-plausible sentence.
    it('English: not enough pool students left, names the shortfall and suggests fewer groups', () => {
      const msg = renderError(
        {
          code: ERROR_CODES.pinnedTooManyGroups,
          requestedGroups: 4,
          pinnedGroupCount: 1,
          remainingStudents: 2,
        },
        en,
      );
      expect(msg).toBe(
        'Your pins already fill 1 of the 4 groups you asked for, which only leaves 2 students — not enough for the 3 groups still needed. Unpin a group, or ask for fewer groups.',
      );
    });

    it('Indonesian: the same shape', () => {
      const msg = renderError(
        {
          code: ERROR_CODES.pinnedTooManyGroups,
          requestedGroups: 4,
          pinnedGroupCount: 1,
          remainingStudents: 2,
        },
        id,
      );
      expect(msg).toBe(
        'Kunci Anda sudah memakai 1 dari 4 kelompok yang Anda minta, sehingga hanya tersisa 2 siswa — tidak cukup untuk 3 kelompok yang masih dibutuhkan. Batalkan kunci salah satu kelompok, atau minta lebih sedikit kelompok.',
      );
    });

    // The other direction: the pins alone already claim every group asked
    // for (or more) -- the ONLY shape this call site covered before this
    // fix (Task 9's original degenerate-case guard). Still this same code,
    // but now says "more", never a max equal to what was typed.
    it('English: pins already claim every group requested, suggests more groups instead', () => {
      const msg = renderError(
        {
          code: ERROR_CODES.pinnedTooManyGroups,
          requestedGroups: 1,
          pinnedGroupCount: 1,
          remainingStudents: 6,
        },
        en,
      );
      expect(msg).toBe(
        'Your pins already fill 1 of the 1 group you asked for, which only leaves 6 students with no group left for them. Unpin a group, or ask for more groups.',
      );
    });

    it('Indonesian: the same shape', () => {
      const msg = renderError(
        {
          code: ERROR_CODES.pinnedTooManyGroups,
          requestedGroups: 1,
          pinnedGroupCount: 1,
          remainingStudents: 6,
        },
        id,
      );
      expect(msg).toBe(
        'Kunci Anda sudah memakai 1 dari 1 kelompok yang Anda minta, sehingga hanya tersisa 6 siswa tanpa kelompok tersisa untuk mereka. Batalkan kunci salah satu kelompok, atau minta lebih banyak kelompok.',
      );
    });

    it('is never the same sentence as plain TOO_MANY_GROUPS at an overlapping max', () => {
      // Fix round 1, F-2's own bug was TOO_MANY_GROUPS's `max` collapsing
      // to the number just typed -- a future edit that reused one
      // implementation for the other would reintroduce exactly that.
      const pinned = renderError(
        {
          code: ERROR_CODES.pinnedTooManyGroups,
          requestedGroups: 1,
          pinnedGroupCount: 1,
          remainingStudents: 6,
        },
        en,
      );
      expect(pinned).not.toBe(en.errors.TOO_MANY_GROUPS(1));
    });

    it('English: singular "group" when only one was requested, in both places it appears', () => {
      const msg = renderError(
        {
          code: ERROR_CODES.pinnedTooManyGroups,
          requestedGroups: 1,
          pinnedGroupCount: 1,
          remainingStudents: 6,
        },
        en,
      );
      expect(msg).toContain('1 group ');
      expect(msg).not.toContain('1 groups');
    });

    // Fix round 2. The third direction: the pins claim MORE groups than
    // were requested (pinnedGroupCount > requestedGroups) while pool
    // students still remain -- reachable by pinning three groups, then
    // lowering the count field to two. Before this fix, this direction fell
    // into the same `poolGroupsNeeded <= 0` branch as the "claims every
    // group requested" case above and reused its "X of the Y groups"
    // opening, which is only coherent when X <= Y -- producing "Your pins
    // already fill 3 of the 2 groups you asked for". The refuse/succeed
    // decision was always correct here (grouping.test.ts's own "Fix round
    // 2" fixture pins that); only this sentence was wrong.
    it('English: pins claim MORE groups than requested, names the true count instead of "X of the Y"', () => {
      const msg = renderError(
        {
          code: ERROR_CODES.pinnedTooManyGroups,
          requestedGroups: 2,
          pinnedGroupCount: 3,
          remainingStudents: 3,
        },
        en,
      );
      expect(msg).toBe(
        'Your pins already use 3 groups — more than the 2 groups you asked for — which leaves 3 students with no group left for them. Unpin a group, or ask for more groups.',
      );
    });

    it('Indonesian: the same shape', () => {
      const msg = renderError(
        {
          code: ERROR_CODES.pinnedTooManyGroups,
          requestedGroups: 2,
          pinnedGroupCount: 3,
          remainingStudents: 3,
        },
        id,
      );
      expect(msg).toBe(
        'Kunci Anda sudah memakai 3 kelompok — lebih banyak daripada 2 kelompok yang Anda minta — sehingga tersisa 3 siswa tanpa kelompok tersisa untuk mereka. Batalkan kunci salah satu kelompok, atau minta lebih banyak kelompok.',
      );
    });
  });
});

describe('every engine warning can be rendered in every language', () => {
  /**
   * One realistic warning per code, mirroring SAMPLES above.
   *
   * Task 8a. `sexSpillover` is the only code WARNING_CODES defines.
   * When this sample was written, nothing in grouping.ts emitted it yet --
   * Task 8b's separate-mode placement, which landed later, is the first
   * caller (see the doc comment on WARNING_CODES.sexSpillover in
   * grouping.ts). That did not excuse the renderer from having a real
   * sample here even then: the parity check below would not notice a code
   * with no sample any more than the error one would.
   */
  const WARNING_SAMPLES: Record<string, GroupingWarning> = {
    SEX_SPILLOVER: {
      code: WARNING_CODES.sexSpillover,
      students: [7, 8],
      sex: 'F',
    },
    // Task 9. Carries `students: number[]`, never names, and no `sex` field
    // (see WARNING_CODES.pinnedMixedSex's doc comment in grouping.ts).
    PINNED_MIXED_SEX: {
      code: WARNING_CODES.pinnedMixedSex,
      students: [1, 4],
    },
    // Whole-branch review, I-2. Carries `students: number[]`, never names,
    // and no `sex` field (see WARNING_CODES.sexBothTooSmall's doc comment
    // in grouping.ts) -- there is no host side and no spilled side, so no
    // one sex is the "right" one to name.
    SEX_BOTH_TOO_SMALL: {
      code: WARNING_CODES.sexBothTooSmall,
      students: [1, 7],
    },
  };

  it('every code the engine can return has a sample here', () => {
    expect(Object.keys(WARNING_SAMPLES).sort()).toEqual(
      Object.values(WARNING_CODES).sort(),
    );
  });

  it.each(locales)(
    '%s renders every code as a real sentence',
    (_n, strings) => {
      for (const [code, warning] of Object.entries(WARNING_SAMPLES)) {
        const msg = renderWarning(warning, strings);
        expect(msg).not.toContain(code); // no raw code leaking through
        expect(msg).toMatch(/^\S.*[.!?]$/);
        expect(msg[0]).toBe(msg[0].toUpperCase());
      }
    },
  );

  describe('sex-spillover resolves student numbers to names', () => {
    // Task 8a. Carries `students: number[]`, exactly like the error codes
    // above, and must go through the same resolver -- a teacher reading
    // "7, 8 have joined..." instead of "Gita, Hani have joined..." is the
    // same regression the resolver parameter exists to prevent there.
    it.each(locales)(
      'falls back to the numbered label when no resolver is supplied (%s)',
      (_name, strings) => {
        const msg = renderWarning(
          { code: WARNING_CODES.sexSpillover, students: [7, 8], sex: 'F' },
          strings,
        );
        expect(msg).toBe(
          strings.warnings.SEX_SPILLOVER(
            [strings.studentNumber(7), strings.studentNumber(8)],
            'F',
          ),
        );
        expect(msg).toContain(strings.studentNumber(7));
        expect(msg).toContain(strings.studentNumber(8));
        // A bare digit with no word around it is exactly the bug this
        // default exists to prevent.
        expect(msg).not.toMatch(/^\d+, \d+ /);
      },
    );

    it('English default reads "Student 7, Student 8 …", not bare digits', () => {
      const msg = renderWarning(
        { code: WARNING_CODES.sexSpillover, students: [7, 8], sex: 'F' },
        en,
      );
      expect(msg).toContain('Student 7, Student 8');
    });

    it('Indonesian default reads "Siswa 7, Siswa 8 …", not bare digits', () => {
      const msg = renderWarning(
        { code: WARNING_CODES.sexSpillover, students: [7, 8], sex: 'F' },
        id,
      );
      expect(msg).toContain('Siswa 7, Siswa 8');
    });

    // Girls short: sex: 'F' names the spilled students, so the message must
    // say they joined a group of BOYS. Also checks the "not a mistake"
    // reassurance the brief requires -- the message must not read as if the
    // teacher did something wrong.
    it('English: a supplied resolver is used in place of the default, names who spilled and where they landed', () => {
      const msg = renderWarning(
        { code: WARNING_CODES.sexSpillover, students: [7, 8], sex: 'F' },
        en,
        (n) => (n === 7 ? 'Gita' : 'Hani'),
      );
      expect(msg).toBe(
        'Gita, Hani have joined a group of boys because there were not enough girls to make a group of their own. That is simply how the numbers divided, not a mistake to fix.',
      );
      expect(msg).not.toContain('Student');
      expect(msg).toContain('not a mistake');
    });

    it('Indonesian: a supplied resolver is used in place of the default', () => {
      const msg = renderWarning(
        { code: WARNING_CODES.sexSpillover, students: [7, 8], sex: 'F' },
        id,
        (n) => (n === 7 ? 'Gita' : 'Hani'),
      );
      expect(msg).toBe(
        'Gita, Hani bergabung dengan kelompok laki-laki karena jumlah perempuan tidak cukup untuk membentuk kelompok sendiri. Ini murni soal angka, bukan kesalahan yang perlu diperbaiki.',
      );
      expect(msg).not.toContain('Siswa');
      expect(msg).toContain('bukan kesalahan');
    });

    // The other direction: boys short this time (sex: 'M'), and a single
    // spilled student -- English inflects for singular ("has", not "have"),
    // unlike the two-student case above.
    it('English names a single spilled student with singular grammar, boys short this time', () => {
      const msg = renderWarning(
        { code: WARNING_CODES.sexSpillover, students: [9], sex: 'M' },
        en,
        () => 'Ivan',
      );
      expect(msg).toBe(
        'Ivan has joined a group of girls because there were not enough boys to make a group of their own. That is simply how the numbers divided, not a mistake to fix.',
      );
    });

    it('Indonesian reads the same shape with one student, since Indonesian does not inflect for plural', () => {
      const msg = renderWarning(
        { code: WARNING_CODES.sexSpillover, students: [9], sex: 'M' },
        id,
        () => 'Ivan',
      );
      expect(msg).toBe(
        'Ivan bergabung dengan kelompok perempuan karena jumlah laki-laki tidak cukup untuk membentuk kelompok sendiri. Ini murni soal angka, bukan kesalahan yang perlu diperbaiki.',
      );
    });
  });

  describe('pinned-mixed-sex resolves student numbers to names', () => {
    // Task 9, Correction 3 (decision: warn, not refuse). Carries
    // `students: number[]`, same resolver pattern as sexSpillover above.
    it.each(locales)(
      'falls back to the numbered label when no resolver is supplied (%s)',
      (_name, strings) => {
        const msg = renderWarning(
          { code: WARNING_CODES.pinnedMixedSex, students: [1, 4] },
          strings,
        );
        expect(msg).toBe(
          strings.warnings.PINNED_MIXED_SEX([
            strings.studentNumber(1),
            strings.studentNumber(4),
          ]),
        );
        expect(msg).toContain(strings.studentNumber(1));
        expect(msg).toContain(strings.studentNumber(4));
        expect(msg).not.toMatch(/^\d+, \d+ /);
      },
    );

    it('English: a supplied resolver is used in place of the default, and reassures rather than blaming', () => {
      const msg = renderWarning(
        { code: WARNING_CODES.pinnedMixedSex, students: [1, 4] },
        en,
        (n) => (n === 1 ? 'Ana' : 'Budi'),
      );
      expect(msg).toBe(
        'Ana, Budi are pinned together as one group, but are not all the same sex, so this group was not split by sex like the others. That is what the pin asked for, not a mistake to fix.',
      );
      expect(msg).not.toContain('Student');
      expect(msg).toContain('not a mistake');
    });

    it('Indonesian: a supplied resolver is used in place of the default', () => {
      const msg = renderWarning(
        { code: WARNING_CODES.pinnedMixedSex, students: [1, 4] },
        id,
        (n) => (n === 1 ? 'Ana' : 'Budi'),
      );
      expect(msg).toBe(
        'Ana, Budi dikunci bersama dalam satu kelompok, tetapi tidak semuanya berjenis kelamin sama, sehingga kelompok ini tidak dipisahkan berdasarkan jenis kelamin seperti kelompok lainnya. Itu sesuai permintaan kunci kelompoknya, bukan kesalahan yang perlu diperbaiki.',
      );
      expect(msg).not.toContain('Siswa');
      expect(msg).toContain('bukan kesalahan');
    });
  });

  describe('sex-both-too-small does not contradict itself the way two sexSpillover warnings did (Fix, I-2)', () => {
    // Whole-branch review, I-2. Carries `students: number[]`, same resolver
    // pattern as sexSpillover/pinnedMixedSex above. Always >= 2 by
    // construction (both sexes must have at least one member for this to
    // fire -- see the call site in grouping.ts), so no singular/plural
    // branch, like sexSeparateSplitsUnit.
    it.each(locales)(
      'falls back to the numbered label when no resolver is supplied (%s)',
      (_name, strings) => {
        const msg = renderWarning(
          { code: WARNING_CODES.sexBothTooSmall, students: [1, 7] },
          strings,
        );
        expect(msg).toBe(
          strings.warnings.SEX_BOTH_TOO_SMALL([
            strings.studentNumber(1),
            strings.studentNumber(7),
          ]),
        );
        expect(msg).toContain(strings.studentNumber(1));
        expect(msg).toContain(strings.studentNumber(7));
        expect(msg).not.toMatch(/^\d+, \d+ /);
      },
    );

    // Exact full sentences, both languages -- this code's whole reason to
    // exist is that TWO sexSpillover warnings about the same merged group
    // contradicted each other ("joined a group of girls" / "joined a group
    // of boys", about one group), so a substring check could not tell a
    // real fix (one honest sentence) from a sentence that merely renders.
    it('English: a supplied resolver is used in place of the default, names both and blames neither sex', () => {
      const msg = renderWarning(
        { code: WARNING_CODES.sexBothTooSmall, students: [1, 7] },
        en,
        (n) => (n === 1 ? 'Ana' : 'Gita'),
      );
      expect(msg).toBe(
        'Ana, Gita were placed in one combined group because there were not enough of either sex to make a group of their own. That is simply how the numbers divided, not a mistake to fix.',
      );
      expect(msg).not.toContain('Student');
      expect(msg).toContain('not a mistake');
      // Never claims either side "joined" a pre-existing group of the
      // other -- that framing is exactly what made the two old
      // sexSpillover warnings contradict each other.
      expect(msg).not.toContain('joined');
    });

    it('Indonesian: a supplied resolver is used in place of the default', () => {
      const msg = renderWarning(
        { code: WARNING_CODES.sexBothTooSmall, students: [1, 7] },
        id,
        (n) => (n === 1 ? 'Ana' : 'Gita'),
      );
      expect(msg).toBe(
        'Ana, Gita digabungkan menjadi satu kelompok karena jumlah laki-laki maupun perempuan tidak cukup untuk membentuk kelompok sendiri-sendiri. Ini murni soal angka, bukan kesalahan yang perlu diperbaiki.',
      );
      expect(msg).not.toContain('Siswa');
      expect(msg).toContain('bukan kesalahan');
    });

    it.each(locales)(
      'is not sexSpillover in disguise (%s)',
      (_name, strings) => {
        const msg = renderWarning(
          { code: WARNING_CODES.sexBothTooSmall, students: [1, 7] },
          strings,
        );
        const spilloverAsM = renderWarning(
          { code: WARNING_CODES.sexSpillover, students: [1, 7], sex: 'M' },
          strings,
        );
        const spilloverAsF = renderWarning(
          { code: WARNING_CODES.sexSpillover, students: [1, 7], sex: 'F' },
          strings,
        );
        expect(msg).not.toBe(spilloverAsM);
        expect(msg).not.toBe(spilloverAsF);
      },
    );
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

// Stage 3, Task 8 (design spec section 5): the themed branch this function
// used to have -- Animals / Colours / Planets, chosen by a `naming`/`theme`
// pair of arguments -- is gone along with the theme `<select>` that fed it
// and the locale tables (`themeNames`, `themes`) it read from. Groups are
// always numbered; these three tests are what is left of a block that used
// to also cover "uses the theme in the page language" and two theme
// fallback cases, both retired in the same commit that removes the feature
// (design spec section 13's own "tests for a removed feature are deleted
// in the same stage that removes it").
describe('group names', () => {
  it('numbers groups from 1, not from 0', () => {
    expect(groupName(0, en)).toBe('Group 1');
    expect(groupName(0, id)).toBe('Kelompok 1');
  });

  it('keeps numbering past what any theme table used to hold', () => {
    // The old theme tables topped out at 8 names and fell back to
    // numbering past that point -- groupName has no such ceiling any more,
    // proven here at an index well past where the old fallback used to
    // kick in.
    expect(groupName(8, en)).toBe('Group 9');
    expect(groupName(8, id)).toBe('Kelompok 9');
  });

  it('matches groupLabel directly -- groupName is a thin, one-based wrapper around it', () => {
    for (const strings of [en, id]) {
      for (const index of [0, 1, 24]) {
        expect(groupName(index, strings)).toBe(strings.groupLabel(index + 1));
      }
    }
  });
});

// Stage 2, Task 5. Design spec section 8: "Class name is optional. Blank is
// fine and nothing is blocked... It heads the results: `7B — your groups`...
// It is not repeated on every group card." The "not repeated on cards" half
// is an e2e concern (classroom-groups.spec.ts); this is the pure half,
// composed in ONE function so the named and unnamed forms cannot drift
// apart -- the same reason groupName/renderError above live here rather
// than at their call site.
describe('the results heading names the class once, or leaves it out entirely', () => {
  it.each(locales)(
    'a blank class name gets the plain heading (%s)',
    (_name, strings) => {
      expect(resultsHeadingText('', strings)).toBe(strings.resultsHeading);
    },
  );

  // Design spec section 8 says a blank name "blocks nothing" -- a teacher
  // who fat-fingers the space bar has not typed a name any more than a
  // teacher who typed nothing at all. Distinct from the empty-string case
  // above: a `className === ''` check with no `.trim()` would treat this
  // input as non-blank and render " — your groups", a dash with nothing in
  // front of it.
  it.each(locales)(
    'a whitespace-only class name counts as blank too (%s)',
    (_name, strings) => {
      expect(resultsHeadingText('   ', strings)).toBe(strings.resultsHeading);
      expect(resultsHeadingText('\t\n ', strings)).toBe(strings.resultsHeading);
    },
  );

  it('a named class heads the results, English', () => {
    expect(resultsHeadingText('7B', en)).toBe('7B — your groups');
  });

  it('a named class heads the results, Indonesian', () => {
    expect(resultsHeadingText('7B', id)).toBe('7B — kelompok Anda');
  });

  // Design spec section 9: "The class name is made safe for a filename, and
  // only there... The class name itself is never altered -- not on the
  // page, not in the `# Class:` line, not in the results heading." That
  // line is written for stage 4's filename work, but its own words reach
  // this heading too, so a NON-blank name keeps its own incidental
  // leading/trailing whitespace -- `.trim()` only decides blankness above,
  // it never edits what is actually shown. Deliberately corrects
  // task-5-brief.md's own snippet, which threaded `className.trim()`
  // through to the named branch as well.
  it.each(locales)(
    'a non-blank name keeps its own whitespace, untrimmed (%s)',
    (_name, strings) => {
      const msg = resultsHeadingText(' 7B ', strings);
      expect(msg).toBe(strings.resultsHeadingNamed(' 7B '));
      expect(msg.startsWith(' 7B ')).toBe(true);
    },
  );

  // "A teacher's typed text is theirs" -- resultsHeadingText itself does no
  // escaping or sanitising of any kind; the DOM-level safety
  // (classroom-groups.ts writing this through `.textContent`, never
  // `.innerHTML`) is proven separately, in the e2e suite, where there is an
  // actual DOM to prove it against. This pins the half that belongs here:
  // the STRING is threaded through byte-for-byte, so nothing upstream of
  // the DOM write has already stripped or escaped anything.
  it.each(locales)(
    'passes special characters through untouched (%s)',
    (_name, strings) => {
      const weird = '<b>7"B</b> & Co / Ltd';
      expect(resultsHeadingText(weird, strings)).toBe(
        strings.resultsHeadingNamed(weird),
      );
      expect(resultsHeadingText(weird, strings)).toContain(weird);
    },
  );
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
