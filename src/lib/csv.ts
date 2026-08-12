import type { Student } from './grouping';
import type { Strings } from './i18n';
import { MAX_ROSTER } from './roster';
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

/**
 * One problem with an imported file. `row` is the DATA row a teacher should
 * look at (1-based, counting students, never file lines), or `null` for a
 * problem about the file as a whole.
 */
export interface CsvProblem {
  row: number | null;
  message: string;
}

export type ParseResult =
  | { ok: true; roster: Student[]; className: string }
  | { ok: false; problems: CsvProblem[] };

/**
 * RFC-4180 field splitting for ONE logical record, honouring quotes.
 *
 * Written as a character scan rather than a regular expression on purpose:
 * a quoted cell may contain a comma, a doubled quote, OR A NEWLINE, and a
 * line-splitting regex cannot see the third at all -- it would tear one
 * student into two rows, silently, on a file a teacher pasted from a
 * spreadsheet.
 *
 * Returns the cells of the record and the index just past it, so the caller
 * can walk the whole file without ever splitting on '\n' first.
 */
const readRecord = (text: string, start: number): [string[], number] => {
  const cells: string[] = [];
  let cell = '';
  let i = start;
  let quoted = false;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      cells.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      // CRLF is one line ending, not two. Excel writes it, and treating it
      // as two would produce a blank record between every pair of students.
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      cells.push(cell);
      return [cells, i];
    }
    cell += ch;
    i += 1;
  }
  cells.push(cell);
  return [cells, i];
};

/** Every logical record in the file, quotes and CRLF honoured. */
const readRecords = (text: string): string[][] => {
  const records: string[][] = [];
  let i = 0;
  while (i < text.length) {
    const [cells, next] = readRecord(text, i);
    records.push(cells);
    i = next;
  }
  return records;
};

/**
 * Headers plus example rows, all of them comment lines — design spec
 * section 9, "Templates".
 *
 * The examples are `#` lines rather than real rows, and the importer
 * discards every `#` line except the class comment. That is what lets a
 * real child called Example One import normally: recognising examples by
 * their CONTENTS would silently drop her.
 *
 * The `# Class:` line is written with nothing after it deliberately -- as a
 * prompt showing a teacher where the class name goes. `serialiseRoster`
 * omits the line entirely for a blank name, which is the opposite rule and
 * the right one there: an exported file records what IS, a template shows
 * what CAN BE.
 */
export function emptyTemplate(locale: Locale): string {
  const t = CSV_LOCALES[locale];
  const example = (n: number, name: string, sex: 'M' | 'F', letters: string) =>
    `# ${n},${name},${t.sex[sex]},,${letters}\n`;
  return (
    `${t.classComment}\n` +
    row(COLUMN_ORDER.map((c) => t.columns[c])) +
    example(1, 'Ana', 'F', 'A,') +
    example(2, 'Budi', 'M', ',X') +
    `# ${t.templateHint}\n`
  );
}

/**
 * Read a class list. Either a roster, or EVERY problem with the file.
 *
 * Design spec section 9: "A bad file is rejected whole. Nothing is
 * imported." and "Every problem is listed, not just the first" -- a teacher
 * who has to make three round trips to a spreadsheet stops using the tool.
 * So this never returns early on the first problem; it collects and reports
 * them all, and returns a roster only when there are none.
 *
 * Row numbers count DATA rows, so a `#` comment between two students never
 * shifts the row a teacher is sent to look at.
 *
 * `t` carries the messages, in the language of the PAGE rather than of the
 * file, and the accepted tokens are passed into them from `CSV_LOCALES` --
 * telling an Indonesian teacher to "use M, F" is advice that would fail
 * again.
 */
export function parseRoster(
  text: string,
  locale: Locale,
  t: Strings,
): ParseResult {
  const table = CSV_LOCALES[locale];
  const problems: CsvProblem[] = [];
  // A UTF-8 BOM is what Excel writes. Left in place it becomes part of the
  // first header word, and the number column is then not found at all.
  const body = text.replace(/^﻿/, '');

  if (body.trim() === '') {
    return {
      ok: false,
      problems: [{ row: null, message: t.csvProblemEmptyFile }],
    };
  }

  const records = readRecords(body);
  let className = '';
  let header: string[] | null = null;
  const dataRows: string[][] = [];

  for (const cells of records) {
    const first = cells[0] ?? '';
    if (first.trimStart().startsWith('#')) {
      // The ONE `#` line that is not discarded. Matched before the general
      // comment rule, per design spec section 9's own ordering ("`# Class:`
      // ... are recognised as metadata first"). The value is re-read
      // through the record parser so a quoted class name containing a comma
      // arrives whole -- the record split above already divided it at that
      // comma.
      const line = cells.join(',');
      const prefix = table.classComment;
      if (line.trimStart().toLowerCase().startsWith(prefix.toLowerCase())) {
        const rest = line.trimStart().slice(prefix.length);
        className = readRecord(rest.trim(), 0)[0].join(',').trim();
      }
      continue;
    }
    // A wholly blank record is spacing, not a student -- a trailing newline
    // at the end of every file we write produces one.
    if (cells.every((c) => c.trim() === '')) continue;
    if (header === null) {
      header = cells.map((c) => c.trim().toLowerCase());
      continue;
    }
    dataRows.push(cells);
  }

  if (header === null) {
    return {
      ok: false,
      problems: [{ row: null, message: t.csvProblemEmptyFile }],
    };
  }

  /** Column index by our own key, via the locale's header word. */
  const indexOf = (column: CsvColumn): number =>
    header.indexOf(table.columns[column].toLowerCase());

  const numberAt = indexOf('number');
  if (numberAt === -1) {
    return {
      ok: false,
      problems: [{ row: null, message: t.csvProblemNoNumberColumn }],
    };
  }

  // Checked BEFORE the per-row pass, and returned alone: a 500-row file
  // would otherwise bury this one actionable sentence under 500 others.
  if (dataRows.length > MAX_ROSTER) {
    return {
      ok: false,
      problems: [
        {
          row: null,
          message: t.csvProblemTooMany(dataRows.length, MAX_ROSTER),
        },
      ],
    };
  }

  const at = (cells: string[], column: CsvColumn): string => {
    const i = indexOf(column);
    return i === -1 ? '' : (cells[i] ?? '').trim();
  };

  const roster: Student[] = [];
  /** number -> the FIRST data row that claimed it, for the duplicate message. */
  const claimedBy = new Map<number, number>();

  dataRows.forEach((cells, i) => {
    const rowNumber = i + 1;
    const problem = (message: string) =>
      problems.push({ row: rowNumber, message });

    const rawNumber = (cells[numberAt] ?? '').trim();
    let number: number | null = null;
    if (rawNumber === '') {
      problem(t.csvProblemNumberBlank(rowNumber));
    } else if (!/^\d+$/.test(rawNumber)) {
      problem(t.csvProblemNumberNotWhole(rowNumber, rawNumber));
    } else {
      number = Number(rawNumber);
      const first = claimedBy.get(number);
      if (first !== undefined) {
        problem(t.csvProblemDuplicateNumber(rowNumber, number, first));
      } else {
        claimedBy.set(number, rowNumber);
      }
    }

    const rawSex = at(cells, 'sex');
    let sex: 'M' | 'F' | null = null;
    if (rawSex !== '') {
      const upper = rawSex.toUpperCase();
      if (upper === table.sex.M.toUpperCase()) sex = 'M';
      else if (upper === table.sex.F.toUpperCase()) sex = 'F';
      else
        problem(
          t.csvProblemSex(rowNumber, rawSex, `${table.sex.M}, ${table.sex.F}`),
        );
    }

    const rawAbsent = at(cells, 'absent');
    let absent = false;
    if (rawAbsent !== '') {
      const lower = rawAbsent.toLowerCase();
      if (lower === table.absentYes.toLowerCase()) absent = true;
      else if (lower === table.absentNo.toLowerCase()) absent = false;
      else
        problem(
          t.csvProblemAbsent(
            rowNumber,
            rawAbsent,
            `${table.absentYes}, ${table.absentNo}`,
          ),
        );
    }

    // ONE letter, upper-cased. `availableLetters` (src/lib/roster.ts) only
    // ever offers A-Z one at a time, so a two-character value is a
    // hand-edited file and saying so is more use than silently taking the
    // first character.
    const letter = (column: 'together' | 'apart'): string | null => {
      const raw = at(cells, column);
      if (raw === '') return null;
      if (!/^\p{L}$/u.test(raw)) {
        problem(t.csvProblemLetter(rowNumber, table.columns[column], raw));
        return null;
      }
      return raw.toUpperCase();
    };
    const together = letter('together');
    const apart = letter('apart');

    const rawName = at(cells, 'name');
    if (number !== null) {
      roster.push({
        number,
        name: rawName === '' ? null : rawName,
        sex,
        absent,
        together,
        apart,
      });
    }
  });

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, roster, className };
}
