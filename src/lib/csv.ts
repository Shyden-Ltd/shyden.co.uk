import type { Student } from './grouping';
import { CSV_LOCALES, type Locale, type CsvColumn } from './csv-locale';

/**
 * The CSV format: writing it here, reading it in the parser below (Task 3).
 * Pure — this module never touches the DOM, a clock, or `document`.
 *
 * No CSV library. The format emitted here is ours, and a writer and a
 * parser strict enough for it are together smaller than the argument for a
 * dependency on a site that ships no third-party runtime code at all
 * (CLAUDE.md: fonts and sounds are self-hosted for the same reason).
 *
 * Language is a PARAMETER, never a module-level global: the same functions
 * serve both pages, and every header word and value token comes from
 * `csv-locale.ts`. There is no locale literal anywhere in this file — a
 * literal here is precisely how an English word ships on an Indonesian
 * export, which this stage's governing constraint forbids.
 */

/**
 * RFC-4180 quoting: quote when the value contains a comma, a quote or a
 * newline, and double any quote inside.
 *
 * ONE function, used by every cell in both writers, because a name with a
 * comma in it is not an edge case in a country where many people have one
 * — and because a second copy is how the roster file and the groups file
 * come to disagree about a name.
 *
 * The newline case is not decorative: a teacher pasting from a spreadsheet
 * can carry one into a name box, and unquoted it splits one student into
 * two rows on the way back in.
 */
const cell = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** A row of already-stringified values, joined and newline-terminated. */
const row = (values: string[]): string => values.map(cell).join(',') + '\n';

/**
 * The metadata line carrying the class name, or nothing at all.
 *
 * Omitted entirely for a blank or whitespace-only name rather than written
 * as an empty `# Class:` — an empty metadata line round-trips into a
 * whitespace class name on the way back in, which is a class name a teacher
 * never typed. The name itself is quoted like any other cell: it is typed
 * text sharing a line with structure.
 */
const classLine = (className: string, locale: Locale): string =>
  className.trim() === ''
    ? ''
    : `${CSV_LOCALES[locale].classComment} ${cell(className)}\n`;

const COLUMN_ORDER: CsvColumn[] = [
  'number',
  'name',
  'sex',
  'absent',
  'together',
  'apart',
];

/**
 * A student's six cells, in `COLUMN_ORDER`.
 *
 * `absent` is written as the locale's own yes-token when true and as BLANK
 * when false — never as the no-token. `absentNo` exists for the PARSER to
 * accept from a teacher's hand-edited file (design spec section 9: "present
 * is blank or `no`"); writing it would put a column of "no" down a
 * spreadsheet that says nothing, and the point of the column is that it is
 * quiet until somebody is out.
 */
const studentCells = (student: Student, locale: Locale): string[] => {
  const t = CSV_LOCALES[locale];
  return [
    String(student.number),
    student.name ?? '',
    student.sex ? t.sex[student.sex] : '',
    student.absent ? t.absentYes : '',
    student.together ?? '',
    student.apart ?? '',
  ];
};

/** The class list, for reuse next lesson. Design spec section 9. */
export function serialiseRoster(
  roster: Student[],
  className: string,
  locale: Locale,
): string {
  const t = CSV_LOCALES[locale];
  return (
    classLine(className, locale) +
    row(COLUMN_ORDER.map((c) => t.columns[c])) +
    roster.map((s) => row(studentCells(s, locale))).join('')
  );
}

/**
 * The arrangement just made — ONE ROW PER STUDENT with a group column.
 *
 * Chosen over one-row-per-group (design spec section 9) because it sorts,
 * filters and pivots, and handles uneven group sizes without ragged blank
 * columns. "A is data; B was a picture — and for a picture you print."
 *
 * Groups are numbered from 1 in the order given, matching what the sheet on
 * screen says; `on` is passed in rather than read from a clock so this and
 * stage 5's printed date can be pinned to the same value.
 */
export function serialiseGroups(
  groups: Student[][],
  className: string,
  on: string,
  locale: Locale,
): string {
  const t = CSV_LOCALES[locale];
  return (
    classLine(className, locale) +
    `${t.groupsMadeComment} ${on}\n` +
    row([t.groupColumn, t.columns.number, t.columns.name]) +
    groups
      .flatMap((group, i) =>
        group.map((s) => row([String(i + 1), String(s.number), s.name ?? ''])),
      )
      .join('')
  );
}

/**
 * ISO date, `YYYY-MM-DD`.
 *
 * Exported because stage 5 prints the date on the sheet and must use this
 * same formatter — two date formats on two artefacts describing the same
 * shuffle is the kind of small inconsistency nobody notices until a teacher
 * does. `now` is a parameter, never read from the clock inside: a formatter
 * that reads the clock internally cannot be tested without freezing time.
 */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * A class name made safe to sit inside a filename. The class name ITSELF is
 * never altered — design spec section 9 is explicit that it is unchanged on
 * the page, in the `# Class:` line and in the results heading; only the
 * filename is sanitised.
 *
 * Everything outside letters, digits and a small safe set collapses to a
 * single dash, and leading/trailing dashes are trimmed, so `Year 7 / Set B`
 * gives `Year-7-Set-B` and never `Year-7--Set-B` or a trailing `-`.
 *
 * Returns `''` for a name made entirely of unusable characters, so
 * `fileName` below falls back to its unnamed form rather than producing a
 * file called `-2026-08-06.csv`. Path separators and traversal sequences
 * are caught by the same rule rather than by a special case: `/`, `\` and
 * `.` are all outside the kept set, so `../../etc/passwd` collapses to
 * `etc-passwd` with no path left in it.
 *
 * Unicode letters are KEPT (`\p{L}`, `u` flag) — an Indonesian or Chinese
 * class name is a class name, and stripping it to nothing would hand every
 * such teacher the same anonymous filename.
 */
export function safeFilePart(className: string): string {
  return className.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

/** The four filenames, per design spec section 9's own examples. */
const FILE_KIND: Record<'class-list' | 'groups', Record<Locale, string>> = {
  'class-list': { en: 'class-list', id: 'daftar-kelas' },
  groups: { en: 'groups', id: 'kelompok' },
};

/**
 * `7B-class-list-2026-08-06.csv`, or `class-list-2026-08-06.csv` unnamed.
 *
 * The date prevents successive saves silently overwriting each other in a
 * downloads folder (design spec section 9).
 */
export function fileName(
  kind: 'class-list' | 'groups',
  className: string,
  on: string,
  locale: Locale,
): string {
  const safe = safeFilePart(className);
  return [safe, FILE_KIND[kind][locale], on].filter(Boolean).join('-') + '.csv';
}
