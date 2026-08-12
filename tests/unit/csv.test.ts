import { describe, it, expect } from 'vitest';
import { CSV_LOCALES } from '../../src/lib/csv-locale';
import {
  serialiseRoster,
  serialiseGroups,
  todayISO,
  safeFilePart,
  fileName,
  parseRoster,
  emptyTemplate,
  detectLocale,
  importFile,
} from '../../src/lib/csv';
import { student } from './factories';
import { en } from '../../src/lib/i18n/en';
import { id } from '../../src/lib/i18n/id';

/**
 * Stage 4, Task 1. The two column tables, and the invariants that make
 * every later task in this stage possible.
 *
 * Every literal here is checked against design spec section 9's own table
 * ("Language"), not against the plan's snippet -- stage 3's ledger records
 * eleven separate occasions where a plan snippet gave a label, selector or
 * whole sentence that did not exist in the product.
 */
describe('CSV_LOCALES', () => {
  it('has English headers', () => {
    expect(Object.values(CSV_LOCALES.en.columns)).toEqual([
      'number',
      'name',
      'sex',
      'absent',
      'together',
      'apart',
    ]);
  });

  it('has Indonesian headers', () => {
    expect(Object.values(CSV_LOCALES.id.columns)).toEqual([
      'nomor',
      'nama',
      'jenis kelamin',
      'tidak hadir',
      'bersama',
      'terpisah',
    ]);
  });

  // ORDER, not just membership. `Object.values` above already depends on
  // insertion order, but that is incidental; the serialiser writes columns
  // in this order and the parser reads headers positionally-by-name, so two
  // tables that agreed on the SET and disagreed on the ORDER would produce
  // a file one page writes and the other reads with the columns swapped.
  it('lists the columns in the same order in both locales', () => {
    expect(Object.keys(CSV_LOCALES.id.columns)).toEqual(
      Object.keys(CSV_LOCALES.en.columns),
    );
  });

  it('translates the values, not only the headers', () => {
    expect(CSV_LOCALES.en.sex).toEqual({ M: 'M', F: 'F' });
    expect(CSV_LOCALES.id.sex).toEqual({ M: 'L', F: 'P' });
    expect(CSV_LOCALES.en.absentYes).toBe('yes');
    expect(CSV_LOCALES.en.absentNo).toBe('no');
    expect(CSV_LOCALES.id.absentYes).toBe('ya');
    expect(CSV_LOCALES.id.absentNo).toBe('tidak');
  });

  it('translates the class comment and the group column', () => {
    expect(CSV_LOCALES.en.classComment).toBe('# Class:');
    expect(CSV_LOCALES.id.classComment).toBe('# Kelas:');
    expect(CSV_LOCALES.en.groupColumn).toBe('group');
    expect(CSV_LOCALES.id.groupColumn).toBe('kelompok');
  });

  it('has the same column keys in both locales', () => {
    // A missing column in one language is a file the other page cannot read,
    // and nothing else in this repo would catch it -- there is no type checker.
    expect(Object.keys(CSV_LOCALES.en.columns).sort()).toEqual(
      Object.keys(CSV_LOCALES.id.columns).sort(),
    );
  });

  it('shares no header word between the locales', () => {
    // detectLocale distinguishes files by their headers. Any word appearing in
    // both tables would make that ambiguous, so this is a design invariant and
    // not a nicety.
    const en = new Set<string>(Object.values(CSV_LOCALES.en.columns));
    const shared = Object.values(CSV_LOCALES.id.columns).filter((c) =>
      en.has(c),
    );
    expect(shared).toEqual([]);
  });

  // The same ambiguity, one level down and NOT covered by the header test
  // above: `detectLocale` reads headers, but the PARSER reads values, and a
  // sex or absent token meaning two different things in the two languages
  // would silently mis-import a file that passed detection. 'no' (English
  // "not absent") against a hypothetical Indonesian 'no' is the shape this
  // rules out. Checked case-insensitively, because the parser accepts
  // either case.
  it('shares no sex or absent VALUE between the locales', () => {
    const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());
    const enValues = new Set(
      lower([
        CSV_LOCALES.en.sex.M,
        CSV_LOCALES.en.sex.F,
        CSV_LOCALES.en.absentYes,
        CSV_LOCALES.en.absentNo,
      ]),
    );
    const idValues = lower([
      CSV_LOCALES.id.sex.M,
      CSV_LOCALES.id.sex.F,
      CSV_LOCALES.id.absentYes,
      CSV_LOCALES.id.absentNo,
    ]);
    expect(idValues.filter((v) => enValues.has(v))).toEqual([]);
  });

  // Guards the two invariants above against a mutant that empties a table:
  // `[].filter(...)` is `[]`, so "shares nothing" passes vacuously against
  // a locale with no columns at all.
  it('both tables are actually populated', () => {
    expect(Object.keys(CSV_LOCALES.en.columns)).toHaveLength(6);
    expect(Object.keys(CSV_LOCALES.id.columns)).toHaveLength(6);
    for (const locale of Object.values(CSV_LOCALES)) {
      for (const header of Object.values(locale.columns)) {
        expect(header).not.toBe('');
      }
    }
  });

  it('carries exactly the two locales this site ships', () => {
    expect(Object.keys(CSV_LOCALES).sort()).toEqual(['en', 'id']);
  });
});

/**
 * Stage 4, Task 2. Serialising -- a roster, a set of groups, and the
 * filenames both arrive under. C-03…C-07, C-25, C-27.
 *
 * Every shape is asserted in BOTH locales, not only English. The plan's own
 * snippet gave `serialiseGroups` an English test only, which would have let
 * an untranslated `# Groups made` comment ship on the Indonesian export --
 * in direct breach of this stage's own governing constraint ("the file must
 * match the language of the page -- headers AND values").
 */
const sample = [
  student({ number: 1, name: 'Ana', sex: 'F', together: 'A' }),
  student({ number: 4, name: 'Dewi', sex: 'F', absent: true }),
  student({ number: 6 }),
];

describe('serialiseRoster', () => {
  it('writes the English shape', () => {
    expect(serialiseRoster(sample, '7B', 'en')).toBe(
      '# Class: 7B\n' +
        'number,name,sex,absent,together,apart\n' +
        '1,Ana,F,,A,\n' +
        '4,Dewi,F,yes,,\n' +
        '6,,,,,\n',
    );
  });

  it('writes the Indonesian shape', () => {
    expect(serialiseRoster(sample, '7B', 'id')).toBe(
      '# Kelas: 7B\n' +
        'nomor,nama,jenis kelamin,tidak hadir,bersama,terpisah\n' +
        '1,Ana,P,,A,\n' +
        '4,Dewi,P,ya,,\n' +
        '6,,,,,\n',
    );
  });

  // The absent column stays QUIET until somebody is out -- `absentNo` is a
  // token the PARSER accepts, never one the serialiser writes. A row of
  // "no,no,no" down a column is noise in a spreadsheet.
  it('leaves the absent column blank for everyone who is in', () => {
    const lines = serialiseRoster([student({ number: 1 })], '', 'en').split(
      '\n',
    );
    expect(lines[0]).toBe('number,name,sex,absent,together,apart');
    expect(lines[1]).toBe('1,,,,,');
    // Asserted on the CELL, by position, not as `not.toContain('no')` over
    // the whole file -- a substring check is not an existence check, and
    // that one would have been satisfied or broken by unrelated words.
    expect(lines[1].split(',')[3]).toBe('');
  });

  it('omits the class comment when there is no class name', () => {
    expect(
      serialiseRoster([student({ number: 1 })], '', 'en').startsWith('#'),
    ).toBe(false);
  });

  // A class name of only spaces is not a class name. Without this it would
  // produce a bare "# Class:   " line that round-trips into a whitespace
  // class name on import.
  it('omits the class comment for a name of only whitespace', () => {
    expect(
      serialiseRoster([student({ number: 1 })], '   ', 'en').startsWith('#'),
    ).toBe(false);
  });

  it('quotes a name containing a comma', () => {
    expect(
      serialiseRoster([student({ number: 1, name: 'Wong, Mei' })], '', 'en'),
    ).toContain('1,"Wong, Mei",,,,');
  });

  it('quotes a name containing a quote, doubling it', () => {
    expect(
      serialiseRoster(
        [student({ number: 1, name: 'Jo "Jojo" Tan' })],
        '',
        'en',
      ),
    ).toContain('1,"Jo ""Jojo"" Tan",,,,');
  });

  // The third RFC-4180 trigger, which the plan's snippet does not cover: a
  // newline inside a cell. A teacher pasting from a spreadsheet can carry
  // one in, and unquoted it would split one student into two rows.
  it('quotes a name containing a newline', () => {
    expect(
      serialiseRoster([student({ number: 1, name: 'Ana\nMaria' })], '', 'en'),
    ).toContain('1,"Ana\nMaria",,,,');
  });

  // The class name is a teacher's typed text on the same line as metadata,
  // so it needs the same treatment -- the plan's snippet only ever quotes
  // NAMES.
  it('quotes a class name containing a comma', () => {
    expect(
      serialiseRoster([student({ number: 1 })], 'Year 7, Set B', 'en'),
    ).toContain('# Class: "Year 7, Set B"');
  });

  it('writes the together and apart letters', () => {
    expect(
      serialiseRoster(
        [student({ number: 2, together: 'B', apart: 'C' })],
        '',
        'en',
      ),
    ).toContain('2,,,,B,C');
  });

  it('writes an empty roster as its header alone', () => {
    expect(serialiseRoster([], '', 'en')).toBe(
      'number,name,sex,absent,together,apart\n',
    );
  });
});

describe('todayISO and the filename helpers', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(todayISO(new Date('2026-08-06T23:30:00Z'))).toBe('2026-08-06');
  });

  it('builds the four filenames', () => {
    expect(fileName('class-list', '7B', '2026-08-06', 'en')).toBe(
      '7B-class-list-2026-08-06.csv',
    );
    expect(fileName('class-list', '7B', '2026-08-06', 'id')).toBe(
      '7B-daftar-kelas-2026-08-06.csv',
    );
    expect(fileName('groups', '7B', '2026-08-06', 'en')).toBe(
      '7B-groups-2026-08-06.csv',
    );
    expect(fileName('groups', '7B', '2026-08-06', 'id')).toBe(
      '7B-kelompok-2026-08-06.csv',
    );
  });

  it('drops the class part when there is no class name', () => {
    expect(fileName('class-list', '', '2026-08-06', 'en')).toBe(
      'class-list-2026-08-06.csv',
    );
  });

  it('makes a class name safe for a filename', () => {
    expect(safeFilePart('Year 7 / Set B')).toBe('Year-7-Set-B');
    expect(safeFilePart('7B: top set')).toBe('7B-top-set');
    expect(safeFilePart('  7B  ')).toBe('7B');
  });

  it('never returns a leading or trailing dash, or a run of them', () => {
    expect(safeFilePart('///7B///')).toBe('7B');
    expect(safeFilePart('a // b')).toBe('a-b');
  });

  it('returns an empty string for a name made entirely of unusable characters', () => {
    // …so fileName falls back to the unnamed form rather than producing "-.csv".
    expect(safeFilePart('///')).toBe('');
    expect(fileName('class-list', '///', '2026-08-06', 'en')).toBe(
      'class-list-2026-08-06.csv',
    );
  });

  // Design spec section 9: "the class name itself is never altered" -- the
  // sanitising is for the FILENAME only. Pinned directly, because
  // `safeFilePart` returning a new string is not by itself proof that
  // nothing mutated the source.
  it('does not alter the class name it was given', () => {
    const className = 'Year 7 / Set B';
    safeFilePart(className);
    expect(className).toBe('Year 7 / Set B');
    expect(
      serialiseRoster([student({ number: 1 })], className, 'en'),
    ).toContain('# Class: Year 7 / Set B');
  });

  // A path separator or traversal sequence in a class name must not survive
  // into a filename. `/` is already covered above; this is the rest of the
  // set a browser download would act on.
  it('strips characters a filesystem would act on', () => {
    expect(safeFilePart('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFilePart('a\\b')).toBe('a-b');
    expect(safeFilePart('7B*?"<>|')).toBe('7B');
  });
});

describe('serialiseGroups', () => {
  it('writes one row per student with a group column', () => {
    expect(
      serialiseGroups([[sample[0]], [sample[2]]], '7B', '2026-08-06', 'en'),
    ).toBe(
      '# Class: 7B\n' +
        '# Groups made 2026-08-06\n' +
        'group,number,name\n' +
        '1,1,Ana\n' +
        '2,6,\n',
    );
  });

  // The half the plan's snippet omits. Without this an English "# Groups
  // made" line ships on the Indonesian export.
  it('writes the Indonesian shape, comment line included', () => {
    expect(
      serialiseGroups([[sample[0]], [sample[2]]], '7B', '2026-08-06', 'id'),
    ).toBe(
      '# Kelas: 7B\n' +
        '# Kelompok dibuat 2026-08-06\n' +
        'kelompok,nomor,nama\n' +
        '1,1,Ana\n' +
        '2,6,\n',
    );
  });

  it('numbers the groups from 1, in the order given', () => {
    const out = serialiseGroups(
      [[student({ number: 9 })], [student({ number: 8 })]],
      '',
      '2026-08-06',
      'en',
    );
    expect(out.split('\n').filter((l) => l && !l.startsWith('#'))).toEqual([
      'group,number,name',
      '1,9,',
      '2,8,',
    ]);
  });

  it('quotes a name in a groups file too', () => {
    expect(
      serialiseGroups(
        [[student({ number: 1, name: 'Wong, Mei' })]],
        '',
        '2026-08-06',
        'en',
      ),
    ).toContain('1,1,"Wong, Mei"');
  });

  it('still writes the date comment when there is no class name', () => {
    expect(
      serialiseGroups([[student({ number: 1 })]], '', '2026-08-06', 'en'),
    ).toBe('# Groups made 2026-08-06\ngroup,number,name\n1,1,\n');
  });
});

/**
 * Stage 4, Task 3. Parsing -- the largest task in this stage and the one a
 * teacher will feel. C-01, C-02, C-08…C-10, C-14…C-16, C-21…C-24, X-07.
 *
 * The governing rule (design spec section 9): a bad file is rejected WHOLE
 * and reports EVERY problem, never just the first, because a teacher who
 * has to make three round trips to a spreadsheet stops using the tool.
 */
describe('parseRoster', () => {
  it('accepts a file with nothing but a number column', () => {
    const out = parseRoster('number\n1\n2\n3\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(
      out.roster.every((s) => s.name === null && s.sex === null && !s.absent),
    ).toBe(true);
  });

  it('accepts partial rows', () => {
    const out = parseRoster('number,name,sex\n1,Ana,\n2,,M\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster[0]).toMatchObject({ number: 1, name: 'Ana', sex: null });
    expect(out.roster[1]).toMatchObject({ number: 2, name: null, sex: 'M' });
  });

  it('round-trips the class name', () => {
    const out = parseRoster('# Class: 7B\nnumber\n1\n', 'en', en);
    expect(out.ok && out.className).toBe('7B');
  });

  it('round-trips a quoted class name containing a comma', () => {
    const out = parseRoster('# Class: "Year 7, Set B"\nnumber\n1\n', 'en', en);
    expect(out.ok && out.className).toBe('Year 7, Set B');
  });

  it('reads the Indonesian class comment on the Indonesian page', () => {
    const out = parseRoster('# Kelas: 7B\nnomor\n1\n', 'id', id);
    expect(out.ok && out.className).toBe('7B');
  });

  it('accepts blank, no and NO as present', () => {
    for (const v of ['', 'no', 'NO', 'No']) {
      const out = parseRoster(`number,absent\n1,${v}\n`, 'en', en);
      expect(out.ok && out.roster[0].absent, v).toBe(false);
    }
  });

  it('accepts yes in any case as absent', () => {
    for (const v of ['yes', 'YES', 'Yes']) {
      const out = parseRoster(`number,absent\n1,${v}\n`, 'en', en);
      expect(out.ok && out.roster[0].absent, v).toBe(true);
    }
  });

  it('accepts tidak as present on the Indonesian page', () => {
    const out = parseRoster('nomor,tidak hadir\n1,tidak\n', 'id', id);
    expect(out.ok && out.roster[0].absent).toBe(false);
  });

  it('accepts ya as absent on the Indonesian page', () => {
    const out = parseRoster('nomor,tidak hadir\n1,ya\n', 'id', id);
    expect(out.ok && out.roster[0].absent).toBe(true);
  });

  it('reads L and P as the sexes on the Indonesian page', () => {
    const out = parseRoster('nomor,jenis kelamin\n1,L\n2,P\n', 'id', id);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster.map((s) => s.sex)).toEqual(['M', 'F']);
  });

  it('refuses anything else in the absent column, by name', () => {
    const out = parseRoster('number,absent\n1,maybe\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toBe(
      "Row 1 — absent 'maybe' not understood. Use yes, no, or leave blank.",
    );
  });

  it('refuses an unrecognised sex, by name', () => {
    const out = parseRoster('number,sex\n1,Male\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toBe(
      "Row 1 — sex 'Male' not understood. Use M, F, or leave blank.",
    );
  });

  // The refusal is written in the language of the PAGE, and names the
  // tokens THAT page accepts -- an Indonesian teacher told to "use M, F"
  // has been given advice that would fail again.
  it('refuses in Indonesian, naming the Indonesian tokens', () => {
    const out = parseRoster('nomor,jenis kelamin\n1,Male\n', 'id', id);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toContain('L');
    expect(out.problems[0].message).not.toContain('Use M, F');
    expect(out.problems[0].message).not.toBe(
      "Row 1 — sex 'Male' not understood. Use M, F, or leave blank.",
    );
  });

  it('lists EVERY problem, not just the first', () => {
    const out = parseRoster(
      'number,name,sex\n' +
        '1,Ana,F\n' +
        '2,Budi,Male\n' + // row 2 — bad sex
        '1,Citra,F\n' + // row 3 — duplicate number
        ',Dewi,F\n', // row 4 — no number
      'en',
      en,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems).toHaveLength(3);
    expect(out.problems.map((p) => p.row)).toEqual([2, 3, 4]);
    expect(out.problems[1].message).toBe(
      'Row 3 — number 1 is already used by row 1.',
    );
    expect(out.problems[2].message).toBe(
      'Row 4 — number is blank. Every student needs one.',
    );
  });

  it('refuses a number that is not a whole number, by name', () => {
    const out = parseRoster('number\n1\nabc\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toBe(
      "Row 2 — number 'abc' is not a whole number.",
    );
  });

  it('refuses a file with no number column at all', () => {
    const out = parseRoster('name,sex\nAna,F\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].row).toBeNull();
    expect(out.problems[0].message).toBe(
      'This file has no number column. Every student needs one.',
    );
  });

  it('refuses an empty file', () => {
    const out = parseRoster('', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].row).toBeNull();
    expect(out.problems[0].message).toBe('This file is empty.');
  });

  // A file whose headers are all present but which carries no data rows is
  // NOT an error -- it is an empty class list, and importing it empties the
  // roster, which is a thing a teacher may mean.
  it('accepts a header-only file as an empty roster', () => {
    const out = parseRoster('number,name\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster).toEqual([]);
  });

  it('ignores every # line except the class comment', () => {
    const out = parseRoster(
      '# Class: 7B\nnumber,name\n# 1,Ana\n# my notes\n2,Budi\n',
      'en',
      en,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster).toHaveLength(1);
    expect(out.roster[0].name).toBe('Budi');
  });

  // Row numbers count DATA rows, not file lines, so a comment sitting
  // between two students does not shift the number a teacher is told to
  // look at. Without this the message sends them to the wrong row.
  it('numbers rows by data row, so a # line does not shift them', () => {
    const out = parseRoster('number\n1\n# a note\n# another\n1\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toBe(
      'Row 2 — number 1 is already used by row 1.',
    );
  });

  it('imports nothing from an untouched template', () => {
    // `emptyTemplate` is the same exported function the download button calls,
    // so this proves the artefact a teacher actually receives -- not a copy of
    // it written in the test, which would pass while the real one drifted.
    const out = parseRoster(emptyTemplate('en'), 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster).toEqual([]);
  });

  it('imports nothing from an untouched Indonesian template either', () => {
    const out = parseRoster(emptyTemplate('id'), 'id', id);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster).toEqual([]);
  });

  it('does not import a real child called Example One', () => {
    // The reason examples are comment lines rather than recognised by content.
    const out = parseRoster('number,name\n1,Example One\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster[0].name).toBe('Example One');
  });

  it('rejects a file of more than MAX_ROSTER rows, naming both numbers', () => {
    const rows = Array.from({ length: 101 }, (_, i) => `${i + 1}`).join('\n');
    const out = parseRoster(`number\n${rows}\n`, 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toBe(
      'This file has 101 students. Student details holds up to 100.',
    );
  });

  it('accepts a file of exactly MAX_ROSTER rows', () => {
    const rows = Array.from({ length: 100 }, (_, i) => `${i + 1}`).join('\n');
    const out = parseRoster(`number\n${rows}\n`, 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster).toHaveLength(100);
  });

  it('handles CRLF line endings, which is what Excel writes', () => {
    const out = parseRoster('number,name\r\n1,Ana\r\n', 'en', en);
    expect(out.ok && out.roster[0].name).toBe('Ana');
  });

  it('handles a UTF-8 BOM, which is also what Excel writes', () => {
    const out = parseRoster('﻿number,name\n1,Ana\n', 'en', en);
    expect(out.ok).toBe(true);
  });

  it('reads quoted cells containing commas', () => {
    const out = parseRoster('number,name\n1,"Wong, Mei"\n', 'en', en);
    expect(out.ok && out.roster[0].name).toBe('Wong, Mei');
  });

  it('reads a doubled quote inside a quoted cell', () => {
    const out = parseRoster('number,name\n1,"Jo ""Jojo"" Tan"\n', 'en', en);
    expect(out.ok && out.roster[0].name).toBe('Jo "Jojo" Tan');
  });

  it('reads a newline inside a quoted cell without splitting the row', () => {
    const out = parseRoster('number,name\n1,"Ana\nMaria"\n2,Budi\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster).toHaveLength(2);
    expect(out.roster[0].name).toBe('Ana\nMaria');
  });

  it('tolerates headers in any order', () => {
    const out = parseRoster('name,number\nAna,1\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster[0]).toMatchObject({ number: 1, name: 'Ana' });
  });

  it('tolerates headers in a different case and with padding', () => {
    const out = parseRoster(' Number , Name \n1,Ana\n', 'en', en);
    expect(out.ok && out.roster[0].name).toBe('Ana');
  });

  it('reads the together and apart letters, upper-cased', () => {
    const out = parseRoster('number,together,apart\n1,a,b\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster[0]).toMatchObject({ together: 'A', apart: 'B' });
  });

  it('refuses a together value that is not a single letter', () => {
    const out = parseRoster('number,together\n1,AB\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toBe(
      "Row 1 — together 'AB' is not a single letter.",
    );
  });

  // A round trip is the claim the whole stage rests on. Asserted as an
  // object comparison over the WHOLE roster, in both languages, rather
  // than field by field -- a field the serialiser drops and the parser
  // defaults would survive any narrower check.
  for (const locale of ['en', 'id'] as const) {
    it(`round-trips a full roster through serialise and parse (${locale})`, () => {
      const original = [
        student({ number: 1, name: 'Ana', sex: 'F', together: 'A' }),
        student({ number: 4, name: 'Wong, Mei', sex: 'F', absent: true }),
        student({ number: 6, sex: 'M', apart: 'B' }),
        student({ number: 9 }),
      ];
      const text = serialiseRoster(original, '7B', locale);
      const out = parseRoster(text, locale, locale === 'en' ? en : id);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.roster).toEqual(original);
      expect(out.className).toBe('7B');
    });
  }
});

/**
 * Stage 4, Task 4. C-11, C-12, C-13.
 *
 * Detection rests entirely on the invariant asserted at the top of this
 * file -- the two locales share no header word. That is why this can be
 * decided from headers alone rather than by guessing from content.
 */
describe('detectLocale', () => {
  it('recognises an English file', () =>
    expect(detectLocale('number,name,sex\n1,Ana,F\n')).toBe('en'));

  it('recognises an Indonesian file', () =>
    expect(detectLocale('nomor,nama,jenis kelamin\n1,Ana,P\n')).toBe('id'));

  it('recognises one by its class comment alone', () =>
    expect(detectLocale('# Kelas: 7B\nnomor\n1\n')).toBe('id'));

  it('returns null for something that is neither', () =>
    expect(detectLocale('foo,bar\n1,2\n')).toBe(null));

  // The header row is the FIRST non-comment record. A student called
  // "nomor" sits in a data row and must not vote.
  it('is not confused by a name that looks like a header', () =>
    expect(detectLocale('number,name\n1,nomor\n')).toBe('en'));

  it('recognises a file this codebase itself wrote, both ways', () => {
    // Not a hand-typed sample: the real serialiser's output, so detection
    // cannot pass here while drifting from what we actually emit.
    const roster = [student({ number: 1, name: 'Ana', sex: 'F' })];
    expect(detectLocale(serialiseRoster(roster, '7B', 'en'))).toBe('en');
    expect(detectLocale(serialiseRoster(roster, '7B', 'id'))).toBe('id');
    expect(detectLocale(emptyTemplate('en'))).toBe('en');
    expect(detectLocale(emptyTemplate('id'))).toBe('id');
  });

  it('returns null for an empty file rather than guessing', () =>
    expect(detectLocale('')).toBe(null));

  it('reads a BOM and CRLF file the same as a plain one', () =>
    expect(detectLocale('﻿nomor,nama\r\n1,Ana\r\n')).toBe('id'));

  // Case and padding, the same tolerance `parseRoster` gives headers.
  it('tolerates case and padding in the headers', () =>
    expect(detectLocale(' Nomor , Nama \n1,Ana\n')).toBe('id'));
});

describe('importFile — the wrong language, refused with a way forward', () => {
  it('is refused with a link, in the language of the PAGE', () => {
    const out = importFile('nomor,nama\n1,Ana\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toBe(
      'This looks like a Bahasa Indonesia class list. Open the Indonesian ' +
        'version of this page to import it.',
    );
  });

  it('is refused the other way round, in Indonesian', () => {
    const out = importFile('number,name\n1,Ana\n', 'id', id);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toContain('bahasa Inggris');
    expect(out.problems[0].message).not.toContain('Bahasa Indonesia class');
  });

  // The refusal REPLACES the parse, it does not accompany it. Parsing an
  // Indonesian file as English produces a pile of "not understood"
  // problems that are all noise once the real cause is known.
  it('reports the language and nothing else', () => {
    const out = importFile('nomor,nama,jenis kelamin\n1,Ana,P\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0].row).toBeNull();
  });

  it('passes a right-language file straight through to parseRoster', () => {
    const text = 'number,name\n1,Ana\n';
    expect(importFile(text, 'en', en)).toEqual(parseRoster(text, 'en', en));
  });

  // An unrecognisable file is NOT a wrong-language file. It falls through
  // to the parser, whose own messages ("no number column") are the useful
  // ones -- claiming it is in another language would be a guess.
  it('falls through to the parser when the language cannot be told', () => {
    const out = importFile('foo,bar\n1,2\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toBe(
      'This file has no number column. Every student needs one.',
    );
  });
});
