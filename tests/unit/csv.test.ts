import { describe, it, expect } from 'vitest';
import { CSV_LOCALES } from '../../src/lib/csv-locale';
import {
  serialiseRoster,
  serialiseGroups,
  todayISO,
  safeFilePart,
  fileName,
} from '../../src/lib/csv';
import { student } from './factories';

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
