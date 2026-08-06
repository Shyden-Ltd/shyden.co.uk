/**
 * English — the REFERENCE locale.
 *
 * `Strings` is derived from this object, so `id: Strings` cannot be written
 * with a key missing: a missing translation must never degrade into an
 * English sentence on the Indonesian page.
 *
 * That is a promise the TYPES make, and nothing in this repo runs a type
 * checker — `astro build` strips types without checking them, and CI runs
 * format, build, unit and e2e. So the promise is kept by tests instead:
 * i18n.test.ts walks both locales for missing keys, blank values and
 * untranslated copy, at every depth. Treat this file as a review surface.
 */
export const THEME_KEYS = ['animals', 'colours', 'planets'] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

export const en = {
  title: 'Classroom Group Creator',
  description:
    'Split your class into groups instantly — in your browser, with nothing sent anywhere.',
  heading: 'Classroom Group Creator',
  lead: 'Tell it how big your class is and how many students you want per group. It shuffles and deals everyone out, and no group ever ends up smaller than you asked for.',
  privacy:
    'Everything happens in your browser. No class list ever leaves this page.',

  howToHeading: 'How to use it',
  howToSteps: [
    'Enter how many students are in your class — or paste their names, one per line.',
    'Choose how many students go in each group, or how many groups you want.',
    'Press Make Groups and watch them get dealt out.',
  ],

  classHeading: 'Your class',
  studentsLabel: 'Number of students',
  studentsHelp: 'Leave the names box empty to use numbered students.',
  namesLabel: 'Student names (optional)',
  namesHelp:
    'One name per line. If you add names, they are used instead of the number above.',

  groupsHeading: 'How to split them',
  modeLabel: 'Split by',
  modePerGroup: 'Students per group',
  modeGroupCount: 'Number of groups',
  groupSizeLabel: 'Students in each group',
  groupCountLabel: 'How many groups',
  leftoversLabel: 'If students are left over',
  leftoversSpread: 'Share them out evenly',
  leftoversBunch: 'Put them all in one group',
  leftoversHelp:
    'Either way, no group is ever smaller than the size you chose.',

  namingLabel: 'Name the groups',
  namingNumbered: 'Group 1, 2, 3…',
  namingThemed: 'Use a theme',
  themeLabel: 'Theme',
  // `satisfies`, not `as`. The cast that used to be here widened the type to
  // Record<string, string>, so `id: Strings` accepted a themeNames with keys
  // MISSING — the page would then render an empty <option> on
  // /id/classroom-groups. `satisfies` checks completeness while keeping the
  // literal keys, so the guarantee this file claims is actually made.
  themeNames: {
    animals: 'Animals',
    colours: 'Colours',
    planets: 'Planets',
  } satisfies Record<ThemeKey, string>,

  keepApartHeading: 'Keep apart (optional)',
  keepApartLabel: 'Students who should not share a group',
  keepApartHelp:
    'One pair per line, separated by a comma — for example: Ana, Budi',
  keepApartNeedsNamesHint: 'Add student names above to use this.',

  playbackHeading: 'Sound and animation',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  speedLabel: 'Speed',
  speedNormal: 'Normal',
  speedFast: 'Fast',
  speedSkip: 'Skip the animation',

  makeGroups: 'Make Groups',
  again: 'Shuffle again',
  needsJs: 'This tool needs JavaScript enabled.',

  resultsHeading: 'Your groups',
  // English inflects; the tool's own headline case (7 students in groups of
  // 4 is ONE group of 7) hits the singular every time.
  resultsSummary: (groups: number, students: number) =>
    `${groups} ${groups === 1 ? 'group' : 'groups'} from ${students} ${students === 1 ? 'student' : 'students'}.`,
  groupLabel: (n: number) => `Group ${n}`,
  studentNumber: (n: number) => `Student ${n}`,

  errors: {
    NO_STUDENTS:
      'Add some students first — either a number or a list of names.',
    TOO_MANY_STUDENTS: (max: number) =>
      `That is more students than this tool will take. The most is ${max}.`,
    DUPLICATE_NUMBER: (number: number) =>
      `Student number ${number} is used twice. Give each student their own number.`,
    INVALID_GROUP_SIZE: 'Each group needs at least 1 student.',
    INVALID_GROUP_COUNT: 'You need at least 1 group.',
    TOO_MANY_GROUPS: (max: number) =>
      `There are not enough students for that many groups. The most you can have is ${max}.`,
    TOGETHER_UNIT_TOO_LARGE: (
      letter: string,
      unit: number,
      groupSize: number,
    ) =>
      `The "${letter}" group has ${unit} students, but the largest group here only holds ${groupSize}. Make the groups bigger, or give the letter "${letter}" to fewer students.`,
    KEEP_APART_IMPOSSIBLE: (names: string[], groupsNeeded: number) =>
      `${names.join(', ')} all need to be kept apart from each other, so you would need at least ${groupsNeeded} groups. Either make more groups or remove one of the rules.`,
    // Says only what an exhaustive search proved: not that any particular
    // students conflict, just that this many groups cannot hold them all.
    KEEP_APART_NO_ARRANGEMENT: (groupsTried: number) =>
      `There is no way to fit your class into ${groupsTried} ${groupsTried === 1 ? 'group' : 'groups'} while keeping everyone apart who needs to be. Either make more groups or remove one of the rules.`,
    // Claims nothing at all, because nothing was established.
    KEEP_APART_SEARCH_GAVE_UP:
      'There are too many keep-apart rules here to work through. Try removing some of them.',
  },

  themes: {
    animals: [
      'Tigers',
      'Eagles',
      'Dolphins',
      'Foxes',
      'Pandas',
      'Falcons',
      'Otters',
      'Lions',
    ],
    colours: [
      'Red',
      'Blue',
      'Green',
      'Yellow',
      'Purple',
      'Orange',
      'Teal',
      'Pink',
    ],
    planets: [
      'Mercury',
      'Venus',
      'Earth',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
    ],
  } satisfies Record<ThemeKey, string[]>,
};

export type Strings = typeof en;
