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

  howToHeading: 'How to use',
  // Part 1 must say WHO it is for and WHY it was built, not only what it does
  // -- an explicit operator instruction (design spec section 3, which carries
  // the approved copy verbatim). Assembled with `+` HERE, in the locale file,
  // never written across template lines: whitespace between two nodes in the
  // Astro template survives only while they share a line, and prettier
  // re-wraps long lines -- the seam that has already shipped three broken
  // sentences on this site (see rendered-text.spec.ts). A single JS string
  // constant, however it is line-wrapped, always concatenates back to the
  // same characters -- prettier reflows the surrounding whitespace, never the
  // contents of a string literal, so this sentence cannot lose a space no
  // matter how these four lines get re-wrapped.
  howToWhat:
    'Built for teachers, by Shyden. Splitting a class fairly takes time you do ' +
    'not have, and doing it by hand invites an argument about favourites. This ' +
    'does it in one press — free, with no sign-up, and with nothing about your ' +
    'class ever leaving your browser.',
  // Rewritten alongside `howToWhat` above: the old step 1 ("...or paste their
  // names, one per line") described the free-text names box removed when the
  // engine was rewritten to a numbered roster (see grouping.ts's
  // GroupingInput and classroom-groups.ts's own roster comment). Naming it
  // here rather than leaving it for the locale-sweep task, since this task's
  // own copy work already rewrites this exact array.
  howToSteps: [
    'Say how many students are in your class.',
    'Choose how to split them.',
    // Matches the button's own label (`makeGroups` below) capital-for-capital,
    // so an instruction to "press Make Groups" names exactly what is on screen.
    'Press Make Groups.',
  ],

  // `classHeading` ("Your class") and `groupsHeading` ("How to split
  // them") were the legends of the two `<fieldset>`s Stage 2 Tasks 1 and 5
  // shipped -- folded into one compact "Top row" by design spec section 3
  // (ClassroomGroupsPage.astro's own comment on `.top-row` has the
  // reasoning). Removed here rather than left unreferenced: once neither
  // `<legend>` renders, dead-copy.test.ts fails a defined string nothing
  // renders, and both would be exactly that. Every field underneath keeps
  // its own accessible name regardless -- a <label>, or for the two mode
  // radios the same `aria-labelledby="cg-mode-label"` pattern the naming
  // and leftovers radiogroups elsewhere on this page already use -- so
  // nothing loses a label; only the two purely organisational headings do.
  //
  // Design spec section 3's own top-row ordering: "Class (optional) ·
  // Students · Split by". Stage 2, Task 5. The literal "(optional)" is
  // pinned by task-5-brief.md's own test (`getByLabel('Class (optional)')`)
  // -- the field carries no `required`, no pattern and no `maxlength` to
  // match: design spec section 8 says plainly "Blank is fine and nothing is
  // blocked", and section 9 says the name a teacher types is never altered
  // anywhere it is shown.
  classLabel: 'Class (optional)',
  studentsLabel: 'Number of students',
  // Task 8, the locale sweep. Used to read "Leave the names box empty to
  // use numbered students." -- the paste-names box it described was removed
  // by Task 1's engine rewrite (see classroom-groups.spec.ts's own 'the
  // paste-names box and the keep-apart box are gone'), so this sentence had
  // been describing a control absent from the page since stage 2 began.
  // Rewritten to say what is true today: every student this field produces
  // is anonymous and numbered, the exact form `studentNumber` below renders
  // ("Student N"). Not a forward reference to Student details -- that
  // section's body is still empty (stage 3 fills it; see
  // ClassroomGroupsPage.astro's own comment on `#cg-students-body`), so a
  // sentence pointing a teacher there today would trade one broken promise
  // for another.
  studentsHelp:
    'Students are anonymous and numbered — Student 1, Student 2, and so on.',

  modeLabel: 'Split by',
  modePerGroup: 'Students per group',
  modeGroupCount: 'Number of groups',
  groupSizeLabel: 'Students in each group',
  groupCountLabel: 'How many groups',

  // Design spec section 6 ("Grouping by sex"), read by src/lib/sexOptions.ts
  // (`sexWhy`), the one function that decides why the two switches below
  // are disabled -- so its messages live together here rather than
  // scattered by call site. `sexWhyNoList` and `sexWhyUnset` are both
  // reachable and unit-tested against synthetic rosters today
  // (tests/unit/sexOptions.test.ts); only `sexWhyNoList` is reachable from
  // the page itself, because there is no roster until stage 3 -- see
  // ClassroomGroupsPage.astro's own comment on `#cg-students-body`.
  sexMixLabel: 'Mix boys and girls evenly',
  sexSeparateLabel: 'Keep boys and girls separate',
  sexWhyNoList:
    'Add your students in Student details and set M or F for each to use these.',
  // The literal approved copy (design spec section 6) at unset=3,
  // grouped=22. Branches "has"/"have" and "student"/"students" for
  // grammaticality at the edges -- id.ts needs neither branch: Bahasa
  // Indonesia does not inflect for plural (see every sibling comment on
  // this in this file's own `errors` table).
  sexWhyUnset: (unset: number, grouped: number) =>
    `${unset} of the ${grouped} ${grouped === 1 ? 'student' : 'students'} being grouped ${unset === 1 ? 'has' : 'have'} no sex set. Open Student details and set M or F for them to use these.`,

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

  soundOn: 'Sound on',
  soundOff: 'Sound off',
  speedLabel: 'Speed',
  speedNormal: 'Normal',
  speedFast: 'Fast',
  speedSkip: 'Skip the animation',

  // The tool's four collapsible sections (design spec section 3), in the
  // spec's own order: Student details, Grouping options, Import / export,
  // Sound & animation (Stage 2, Task 7 -- see ClassroomGroupsPage.astro's
  // own comment on the restructuring that gave it a real section, folding
  // in what used to be a plain fieldset here under `playbackHeading`).
  // Sound & animation carries no `· state` half of its own -- see
  // sections.ts's own doc comment on why `sectionState` returns three
  // fields, not four -- so this is the whole button label for that one,
  // with nothing to join it to.
  sectionStudentsHeading: 'Student details',
  sectionGroupingHeading: 'Grouping options',
  sectionImportExportHeading: 'Import / export',
  sectionSoundHeading: 'Sound and animation',

  // Stage 3, Task 2. The roster table (src/scripts/roster-ui.ts) -- column
  // headers, doubling as each cell's own aria-label so the header a sighted
  // teacher reads and the name a screen reader announces for that column's
  // control are the same word, never two independent spellings. Order
  // matches design spec section 3's own six columns, and the literal test
  // that pins it (classroom-groups-roster.spec.ts, "the table has the six
  // columns, in order"). `rosterColNumber` stays the bare glyph "#" in both
  // languages -- it is a symbol, not English, so it needs no translation
  // (see i18n.test.ts's own ALLOWED_IDENTICAL for why this is expected, not
  // an oversight).
  rosterColNumber: '#',
  rosterColName: 'Name',
  rosterColSex: 'Sex',
  rosterColAbsent: 'Absent',
  rosterColTogether: 'Together',
  rosterColApart: 'Apart',
  // The first option in every Sex/Together/Apart <select> -- "blank
  // (neutral)" for sex, "no letter" for the two constraints (design spec
  // section 4). One shared symbol for "nothing chosen" rather than three
  // separate sentences, and -- like `rosterColNumber` above -- punctuation,
  // not English, so it is the same character in both languages.
  rosterUnset: '—',
  // The <option> VALUE stays the fixed 'M'/'F' the engine's own Student.sex
  // type uses (grouping.ts) in both languages -- identity a locale must
  // never change -- only the DISPLAYED text varies; id.ts uses "L"/"P",
  // matching design spec section 9's own Indonesian sex convention (already
  // established there for CSV, and carried into this table for the same
  // reason: a Bahasa Indonesia reader should not have to learn an English
  // abbreviation to read this column).
  rosterSexMale: 'M',
  rosterSexFemale: 'F',
  // Design spec section 4, "Changing the class size is then a list
  // operation": the two ways a row is added, and the inline confirm for the
  // second. The literal leading "+" is the spec's own wording -- kept as
  // real button text, not CSS-generated content, since a pseudo-element's
  // own text is inconsistently exposed to assistive tech, and helpers.ts's
  // `openRoster`/`addSeveral` match these by a REGEX substring, so the "+"
  // costs nothing there either.
  rosterAddStudent: '+ Add student',
  rosterAddSeveral: '+ Add several…',
  // The inline count field's own label, and the button that confirms it.
  // `rosterAddConfirm` is matched EXACTLY (`{ name: 'Add', exact: true }`)
  // by later stages' own tests, precisely so it is never mistaken for
  // `rosterAddStudent` above, whose text also contains the word "Add".
  rosterHowMany: 'How many?',
  rosterAddConfirm: 'Add',

  // Stage 3, Task 4 (design spec section 4, "Absence"). Two lines rendered
  // "under the table" by renderRoster (roster-ui.ts) once the roster is
  // non-empty -- NOT part of the `state*` group below, which feeds only the
  // collapsed Student-details HEADER (sectionState); these feed the table's
  // own footer instead, so they live with the rest of this `roster*` group.
  //
  // `rosterAbsentPill` is the pill text beside the tick -- lowercase, the
  // design doc's own literal example ("a small pill reading `absent`") --
  // distinct from `rosterColAbsent` above, the column HEADING, which is
  // capitalised.
  rosterAbsentPill: 'absent',
  // The permanent consequence line: present "whether or not anyone is
  // marked" (design spec section 4), so a plain string, not a function --
  // nothing about it varies with the roster's own state. The literal
  // approved wording, verbatim.
  rosterAbsentConsequence:
    'Students marked absent are not included when groups are made.',
  // The live count line underneath it -- design spec section 4's own
  // example: "24 students · 22 here · 2 absent". English inflects
  // (`resultsSummary`'s own identical reasoning, above) for the leading
  // noun; "here"/"absent" are used predicatively and never pluralise, the
  // same as `stateAbsent`/`stateTogether` below never branch on their own
  // count.
  rosterCountLine: (total: number, here: number, absent: number) =>
    `${total} ${total === 1 ? 'student' : 'students'} · ${here} here · ${absent} absent`,

  // Every value below is read ONLY through sectionState (src/lib/sections.ts)
  // -- never interpolated into a page directly -- so a key here with no
  // matching branch in that function, or a branch reading a key missing
  // here, is exactly the drift the whole function exists to prevent. Order
  // matches the design doc's own progression: none -> named -> +absent ->
  // +letters, mirrored exactly by sections.test.ts.
  stateNoneAdded: 'none added',
  stateNamed: (n: number) => `${n} named`,
  stateAbsent: (n: number) => `${n} absent`,
  stateTogether: (n: number) => `${n} together`,
  stateApart: (n: number) => `${n} apart`,
  // The roster exists but nothing else is true of it yet: everyone present,
  // nobody named, no letters set. Distinct from `stateNoneAdded` (no roster
  // at all) -- see sections.ts's own fallback branch.
  stateAdded: (n: number) => `${n} added`,
  stateNone: 'none',
  stateMixed: 'mixed by sex',
  stateSeparated: 'separated by sex',
  stateBunched: 'leftovers in one group',
  stateNothingToSave: 'nothing to save yet',
  stateUnsaved: 'unsaved changes — export to keep them',

  makeGroups: 'Make Groups',
  again: 'Shuffle again',
  needsJs: 'This tool needs JavaScript enabled.',

  resultsHeading: 'Your groups',
  // Heads the results when a class name was given (design spec section 8's
  // own literal example: "7B — your groups"). The tail stays lowercase
  // because it continues the sentence the class name started, unlike
  // `resultsHeading` above -- which IS the whole sentence on its own, and is
  // therefore capitalised. Composed against the class name exactly as
  // typed, never trimmed here: see resultsHeadingText's own doc comment
  // (src/lib/i18n/index.ts) for where the two are combined, and why.
  resultsHeadingNamed: (className: string) => `${className} — your groups`,
  // English inflects; the tool's own headline case (7 students in groups of
  // 4 is ONE group of 7) hits the singular every time.
  resultsSummary: (groups: number, students: number) =>
    `${groups} ${groups === 1 ? 'group' : 'groups'} from ${students} ${students === 1 ? 'student' : 'students'}.`,
  groupLabel: (n: number) => `Group ${n}`,
  studentNumber: (n: number) => `Student ${n}`,

  // Design spec section 8, "When the class changes after a shuffle". Each
  // reason names WHAT changed, not merely that something did -- "These
  // groups are out of date" alone sends a teacher hunting for what they
  // touched. staleReason (src/lib/staleness.ts) picks exactly one of these
  // per recompute, in a fixed priority order, so two things changing at
  // once still reads as ONE clear sentence, not a list.
  staleMode: 'These groups are out of date — the group size changed.',
  staleLeftovers:
    'These groups are out of date — the leftovers choice changed.',
  // Unreachable from this page today: the two sex switches render (Stage 2,
  // Task 4) but stay permanently disabled until stage 3 gives them a
  // roster to enable on -- see classroom-groups.ts's own `readSexMode`.
  // Defined now, not left for stage 3, because Snapshot's shape (and
  // staleReason's own branch) already exist -- see that interface's own
  // doc comment for why a comparison, not a flag, is what lets a later
  // stage add a trigger by filling in a field rather than hunting down
  // every place that could clear one.
  staleSexMode:
    'These groups are out of date — how boys and girls are grouped changed.',
  // Unreachable from this page today: `roster` stays '' on both sides of
  // every comparison until stage 3 builds a real roster to summarise (see
  // Snapshot's own doc comment). Generic, not per-student ("Dewi is now
  // marked absent") -- Snapshot compares ONE string, so it can only say a
  // roster changed, not which fact about it did; stage 3's own roster work
  // owns deciding whether a finer-grained comparison is worth building.
  staleRoster: 'These groups are out of date — the class list changed.',

  errors: {
    // Whole-branch review, I-4. `noStudents` fires from TWO different
    // triggers in grouping.ts -- an empty roster (no count, no names) and a
    // non-empty roster where every single student is marked absent -- and
    // carries no data to tell them apart (see the call sites' own comments
    // for why that collapse was deliberate). The old copy ("Add some
    // students first...") was only ever checked against the first trigger;
    // a 30-student roster with everyone unticked got told to add students
    // it already had. This wording is true for both: "add some" fixes an
    // empty roster, "make sure at least one ... is not marked absent" fixes
    // the second trigger, and neither clause claims the other's problem is
    // also present -- same "either/or, only one need apply" shape the rest
    // of this file's multi-remedy copy already uses (see
    // BOTH_RULES_NO_ARRANGEMENT below, for one).
    NO_STUDENTS:
      'Add some students, or make sure at least one of them is not marked absent.',
    TOO_MANY_STUDENTS: (max: number) =>
      `That is more students than this tool will take. The most is ${max}.`,
    DUPLICATE_NUMBER: (number: number) =>
      `Student number ${number} is used twice. Give each student their own number.`,
    INVALID_GROUP_SIZE: 'Each group needs at least 1 student.',
    INVALID_GROUP_COUNT: 'You need at least 1 group.',
    TOO_MANY_GROUPS: (max: number) =>
      `There are not enough students for that many groups. The most you can have is ${max}.`,
    // Carries `students: number[]`, never names -- identity is the number
    // (Student.number). Same resolver pattern as KEEP_APART_IMPOSSIBLE below:
    // renderError maps each number through `resolveStudent` before this
    // function ever sees it, so `names` here is already display text.
    TOGETHER_APART_CLASH: (names: string[]) =>
      `${names.join(', ')} are marked to stay together and to be kept apart from each other at the same time. Remove the together letter or the apart letter from one of them.`,
    TOGETHER_UNIT_TOO_LARGE: (
      letter: string,
      unit: number,
      groupSize: number,
    ) =>
      `The letter "${letter}" has ${unit} students, but the largest group here only holds ${groupSize}. Make the groups bigger, or give the letter "${letter}" to fewer students.`,
    // Says only what an exhaustive search proved: not that any particular
    // letter is the problem, just that this many groups cannot hold every
    // together-unit whole. The remedy is the opposite of KEEP_APART's: more
    // groups makes a together clash WORSE, never better, so this never
    // suggests it.
    TOGETHER_NO_ARRANGEMENT: (groupsTried: number) =>
      `There is no way to fit your class into ${groupsTried} ${groupsTried === 1 ? 'group' : 'groups'} while keeping everyone together who needs to be. Make the groups bigger, or give each letter to fewer students.`,
    // Claims nothing at all, because nothing was established.
    TOGETHER_SEARCH_GAVE_UP:
      'There are too many together-letters here to work through. Try using fewer letters, or make the groups bigger.',
    KEEP_APART_IMPOSSIBLE: (names: string[], groupsNeeded: number) =>
      `${names.join(', ')} all need to be kept apart from each other, so you would need at least ${groupsNeeded} groups. Either make more groups or remove one of the rules.`,
    // Says only what an exhaustive search proved: not that any particular
    // students conflict, just that this many groups cannot hold them all.
    KEEP_APART_NO_ARRANGEMENT: (groupsTried: number) =>
      `There is no way to fit your class into ${groupsTried} ${groupsTried === 1 ? 'group' : 'groups'} while keeping everyone apart who needs to be. Either make more groups or remove one of the rules.`,
    // Claims nothing at all, because nothing was established.
    KEEP_APART_SEARCH_GAVE_UP:
      'There are too many keep-apart rules here to work through. Try removing some of them.',
    // Together and keep-apart clashes have OPPOSITE remedies (bigger groups
    // helps one and hurts the other; more groups is the reverse), and when
    // both kinds of rule are live the search genuinely cannot say which one
    // is the actual sticking point -- only that no arrangement was found.
    // Guessing would send the teacher the wrong way as often as the right
    // one, so this names both rules and offers both remedies without
    // choosing between them.
    BOTH_RULES_NO_ARRANGEMENT: (groupsTried: number) =>
      `There is no way to fit your class into ${groupsTried} ${groupsTried === 1 ? 'group' : 'groups'} while satisfying every together-letter and every apart-letter at once. The search cannot tell which kind of rule is the problem, so try either remedy: make the groups bigger or give a together-letter to fewer students, or make more groups or remove one of the apart-rules.`,
    // Claims nothing at all, because nothing was established -- and, same
    // reasoning as above, does not guess which kind of rule to blame.
    BOTH_RULES_SEARCH_GAVE_UP:
      'There are too many together- and apart-letters here to work through at once. Try using fewer letters of either kind, or make the groups bigger.',
    // Task 7. Carries `students: number[]`, never names -- same resolver
    // pattern as TOGETHER_APART_CLASH and KEEP_APART_IMPOSSIBLE above:
    // renderError maps each number through `resolveStudent` before this
    // function ever sees it. This code should be unreachable from the page
    // (stage 2 disables the mix switch until every student being grouped
    // has a sex set), but the engine does not trust its caller, so the
    // copy is written for a teacher, not for a developer. `names.length`
    // can genuinely be 1 (the guard reports every unset student, and a
    // roster can have exactly one), unlike the two codes above whose lists
    // are always 2 or more by construction -- so, like TOO_MANY_GROUPS and
    // the together/keep-apart "no arrangement" messages, this branches for
    // singular/plural rather than assuming a list.
    SEX_NEEDS_ALL_SET: (names: string[]) =>
      `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} no sex set, so this mode cannot run until every student does. Set a sex for ${names.length === 1 ? 'them' : 'each of them'}, or turn it off.`,
    // Task 8b. Carries `students: number[]`, never names -- same resolver
    // pattern as TOGETHER_APART_CLASH above. `names.length` is always >= 2
    // by construction (a together-unit spanning both sexes needs at least
    // one of each), so, like TOGETHER_APART_CLASH and KEEP_APART_IMPOSSIBLE,
    // this never branches for singular/plural. Stays abstract at "sex"
    // rather than naming "boys"/"girls" -- same choice as SEX_NEEDS_ALL_SET
    // above, its closer sibling (both are guard-style refusals about the
    // `sex` field itself, not about a group a teacher is looking at, unlike
    // SEX_SPILLOVER).
    SEX_SEPARATE_SPLITS_UNIT: (names: string[]) =>
      `${names.join(', ')} are marked to stay together, but are not all the same sex, so they cannot form a single-sex group. Remove the together letter from one of them, or turn this mode off.`,
    // Fix round 1, F-2. Carries `groupsRequested: number` -- the number the
    // TEACHER typed, never a side's own smaller allocation (see the doc
    // comment on ERROR_CODES.sexSeparateImpossible for the defect that
    // substitution was). Reached only once every way of splitting that
    // number between boys and girls has been tried and EXHAUSTED -- see
    // SEX_SEPARATE_SEARCH_GAVE_UP directly below for the sibling that fires
    // when at least one of those tries never got that far -- so, like
    // BOTH_RULES_NO_ARRANGEMENT, this does not guess which rule is to
    // blame -- it names neither a rule nor a side, only the two remedies.
    // Branches for singular/plural even though this code cannot currently
    // fire with `groupsRequested === 1` (the search only runs at
    // `groupsRequested >= 2` -- see `allocationCandidates`) -- same
    // defensive choice this file already makes for TOGETHER_NO_ARRANGEMENT/
    // KEEP_APART_NO_ARRANGEMENT/BOTH_RULES_NO_ARRANGEMENT's own
    // `groupsTried`, which are equally unreachable at 1 in practice and
    // still branch, rather than SEX_SEPARATE_SPLITS_UNIT's
    // `names.length >= 2`, which is provable by TYPE/construction rather
    // than by a runtime argument about when the engine happens to call
    // this.
    //
    // Whole-branch review, I-1: used to say "ask for MORE groups" -- a
    // specific direction, which TOGETHER_NO_ARRANGEMENT's own comment above
    // warns against for exactly this reason (more groups makes a together
    // clash worse, never better). Unlike TOGETHER_NO_ARRANGEMENT and
    // KEEP_APART_NO_ARRANGEMENT, each of which knows its OWN rule's fix
    // direction is always the same, this code is reached after every
    // candidate split has already failed for a mix of reasons this search
    // never isolates -- one candidate can fail on a together-unit too large
    // for its side (fixed by FEWER groups), another on a keep-apart clique
    // (fixed by MORE) -- so "more" is not even usually right, let alone
    // always: measured, 10 boys (6 bound by one together-letter) plus 2
    // girls needed FEWER groups, not more (counts 2-3 succeeded, 4-6 all
    // refused while telling the teacher to ask for more). "A different
    // number" makes no claim about which direction, because the search has
    // not earned one -- honest in the same spirit as this code's own
    // groupsRequested (see ERROR_CODES.sexSeparateImpossible's doc comment
    // in grouping.ts), just about a direction instead of a number.
    SEX_SEPARATE_IMPOSSIBLE: (groupsRequested: number) =>
      `Boys and girls cannot be kept in separate groups across ${groupsRequested} ${groupsRequested === 1 ? 'group' : 'groups'} while also satisfying your other rules. The search cannot tell which rule is the problem, so try either remedy: ask for a different number of groups, or turn this mode off.`,
    // Fix round 2. Claims nothing at all, same reasoning as
    // TOGETHER_SEARCH_GAVE_UP/KEEP_APART_SEARCH_GAVE_UP/
    // BOTH_RULES_SEARCH_GAVE_UP above -- carries no data because nothing
    // was established, not even which of the tried splits was "the" one
    // that ran out of room. Unlike those three, the remedy here names
    // TURNING THE MODE OFF alongside using fewer letters: together- and
    // apart-letters have no on/off switch of their own to offer, but
    // `sexMode` genuinely does, and it is a real way out of a search this
    // large -- see ERROR_CODES.sexSeparateSearchGaveUp's doc comment for
    // why this is reported instead of SEX_SEPARATE_IMPOSSIBLE whenever even
    // one of the tried splits gave up rather than being exhausted.
    SEX_SEPARATE_SEARCH_GAVE_UP:
      'There are too many together- and apart-letters here to work through while also keeping boys and girls in separate groups. Try using fewer letters, or turn this mode off.',
    // Task 9. Carries `students: number[]`, never names -- same resolver
    // pattern as TOGETHER_APART_CLASH above. Always >= 2 by construction: at
    // least one student locked inside the pinned group and one outside it,
    // sharing the together letter that straddles the boundary.
    PINNED_SPLITS_UNIT: (names: string[]) =>
      `${names.join(', ')} are marked to stay together, but only some of them are in a pinned group. Unpin the group, or remove the together letter from whoever is outside it.`,
    // Task 9. Carries `students: number[]`, never names -- same resolver
    // pattern. Always >= 2 by construction: an apart-letter needs at least
    // two holders, and this only fires when both are in the SAME pinned
    // group.
    PINNED_APART_CLASH: (names: string[]) =>
      `${names.join(', ')} are marked to be kept apart from each other, but a pinned group puts them in the same one. Unpin the group, or remove the apart letter from one of them.`,
    // Task 9. Carries a single resolved name, not a list -- `number: number`
    // on the error (like DUPLICATE_NUMBER) always names exactly one student,
    // never a pair, so there is no second party for this sentence to name
    // and no plural form to branch for.
    PINNED_IN_TWO_GROUPS: (name: string) =>
      `${name} is pinned into two different groups at once. A student can only be pinned into one group. Remove them from one of the two.`,
    // Fix round 1, F-1/F-2. Replaces TOO_MANY_GROUPS on the pinned path --
    // see ERROR_CODES.pinnedTooManyGroups's doc comment in grouping.ts. The
    // old sentence here (still TOO_MANY_GROUPS at the time) named a `max`
    // that, under `groupCount` mode, was ALWAYS the exact number the
    // teacher had just typed -- a tautology, not a fix (F-2) -- and did not
    // exist at all for the opposite direction, where MORE pool groups were
    // asked for than pool students remain to fill them (F-1).
    //
    // Fix round 2. A third direction the two-way branch below did not
    // cover: the pins can claim MORE groups than were requested
    // (`pinnedGroupCount > requestedGroups`) while pool students still
    // remain -- pin three groups, then lower the count field to two. That
    // used to fall into the `poolGroupsNeeded <= 0` branch below and reuse
    // its "fill X of the Y groups" opening, which only reads coherently
    // when X <= Y -- producing "Your pins already fill 3 of the 2 groups
    // you asked for". Split off as its own branch, checked first, with its
    // own opening ("already use N groups -- more than the M you asked
    // for"). Its remedy is still "Unpin a group, or ask for more groups",
    // shared verbatim with the `poolGroupsNeeded === 0` case just below it
    // -- both directions move `poolGroupsNeeded` the same way (up, toward
    // 1), so the same two actions (unpin, or ask for more) are still true
    // here; only "X of the Y" needed to change, not the remedy.
    PINNED_TOO_MANY_GROUPS: (
      requestedGroups: number,
      pinnedGroupCount: number,
      remainingStudents: number,
    ) => {
      const groupWord = (n: number) => (n === 1 ? 'group' : 'groups');
      const studentWord = remainingStudents === 1 ? 'student' : 'students';
      const poolGroupsNeeded = requestedGroups - pinnedGroupCount;
      if (poolGroupsNeeded < 0) {
        return `Your pins already use ${pinnedGroupCount} ${groupWord(pinnedGroupCount)} — more than the ${requestedGroups} ${groupWord(requestedGroups)} you asked for — which leaves ${remainingStudents} ${studentWord} with no group left for them. Unpin a group, or ask for more groups.`;
      }
      const opening = `Your pins already fill ${pinnedGroupCount} of the ${requestedGroups} ${groupWord(requestedGroups)} you asked for, which only leaves ${remainingStudents} ${studentWord}`;
      return poolGroupsNeeded === 0
        ? `${opening} with no group left for them. Unpin a group, or ask for more groups.`
        : `${opening} — not enough for the ${poolGroupsNeeded} ${groupWord(poolGroupsNeeded)} still needed. Unpin a group, or ask for fewer groups.`;
    },
  },

  warnings: {
    // Task 8a. Carries `students: number[]` (never names -- same resolver
    // pattern as the errors above) and `sex: 'M' | 'F'`, the sex of the
    // NAMED students, not of the group they joined -- that one fact is
    // enough to phrase both halves of the sentence: which group they ended
    // up in, and which sex ran short. Task 8a built this channel first and
    // Task 8b's separate-mode placement is what emits it -- see
    // WARNING_CODES.sexSpillover's doc comment in grouping.ts. Six boys and
    // two girls not dividing evenly is arithmetic, not a mistake, so unlike
    // every error above this carries no remedy: there is nothing to fix.
    SEX_SPILLOVER: (names: string[], sex: 'M' | 'F') =>
      `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} joined a group of ${sex === 'M' ? 'girls' : 'boys'} because there were not enough ${sex === 'M' ? 'boys' : 'girls'} to make a group of their own. That is simply how the numbers divided, not a mistake to fix.`,
    // Task 9. Carries `students: number[]`, never names -- same resolver
    // pattern as SEX_SPILLOVER above. Always >= 2 by construction (a pinned
    // group needs at least one of each sex to be mixed), so, like
    // SEX_SEPARATE_SPLITS_UNIT, this never branches for singular/plural. No
    // `sex` field, unlike SEX_SPILLOVER: there is no single "spilled" side
    // here, the whole group is mixed because the teacher pinned it that
    // way, and the copy does not need to say which sex is which to make
    // that point -- see WARNING_CODES.pinnedMixedSex's doc comment in
    // grouping.ts for the decision this is the honest wording of.
    PINNED_MIXED_SEX: (names: string[]) =>
      `${names.join(', ')} are pinned together as one group, but are not all the same sex, so this group was not split by sex like the others. That is what the pin asked for, not a mistake to fix.`,
    // Whole-branch review, I-2. Carries `students: number[]` -- everyone in
    // the one merged group, both sexes -- and no `sex` field, unlike
    // SEX_SPILLOVER above: there is no host side and no spilled side here,
    // so no one sex is the "right" one to name (see
    // WARNING_CODES.sexBothTooSmall's doc comment in grouping.ts). Always
    // >= 2 by construction, like SEX_SEPARATE_SPLITS_UNIT and
    // TOGETHER_APART_CLASH above, so no singular/plural branch.
    SEX_BOTH_TOO_SMALL: (names: string[]) =>
      `${names.join(', ')} were placed in one combined group because there were not enough of either sex to make a group of their own. That is simply how the numbers divided, not a mistake to fix.`,
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
