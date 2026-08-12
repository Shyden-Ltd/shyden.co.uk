/**
 * The CSV format's two language tables, and nothing else.
 *
 * Separate from `csv.ts` deliberately (design spec section 9, "Language"):
 * when a third locale arrives, the language question has ONE file to read
 * and one shape to fill in, rather than a set of literals scattered through
 * a parser. `csv.ts` never contains a header word or a value token.
 *
 * Everything here is copied verbatim from design spec section 9's own
 * table. Two invariants that table implies are asserted in
 * tests/unit/csv.test.ts rather than left to inspection, because nothing in
 * this repo or in CI type-checks (CLAUDE.md) and both are load-bearing:
 *
 *  - The two locales share NO header word. `detectLocale` (Task 4) tells a
 *    file's language from its headers alone, so a word appearing in both
 *    tables would make a real file genuinely ambiguous. It is a design
 *    rule, not a coincidence of translation.
 *  - They share no sex or absent VALUE either. Detection reads headers, but
 *    the parser reads values -- a token meaning one thing in English and
 *    another in Indonesian would mis-import a file that passed detection.
 *
 * The `# Class:` / `# Kelas:` comment carries the class name so it
 * round-trips (spec section 9), and is the ONE `#` line that is not
 * discarded -- see the parser's own doc comment for that rule.
 */

/** The site's two languages. Not widened speculatively: a third locale is a
 *  change to this file, which is the point of the file existing. */
export type Locale = 'en' | 'id';

/**
 * The six roster columns, in the order they are written and read.
 *
 * A union of literal keys rather than a bare `string`, so `columns` below
 * cannot silently omit one or gain a seventh in one locale only -- the
 * closest this repo gets to a compile-time guarantee, backed by the
 * same-keys test.
 */
export type CsvColumn =
  'number' | 'name' | 'sex' | 'absent' | 'together' | 'apart';

export interface CsvLocale {
  /** The metadata line carrying the class name — the one `#` line kept. */
  classComment: string;
  /** Header word per column, in write order. */
  columns: Record<CsvColumn, string>;
  /** The two sex tokens. Blank always means unset, in both languages. */
  sex: { M: string; F: string };
  /** Absent is `absentYes`; present is blank OR `absentNo`. */
  absentYes: string;
  absentNo: string;
  /** The extra first column on an exported GROUPS file. */
  groupColumn: string;
  /**
   * The second metadata line on an exported GROUPS file, before the date:
   * `# Groups made 2026-08-06`.
   *
   * Design spec section 9 shows this line ONLY in English, so the
   * Indonesian wording is this stage's own translation -- a REVIEW
   * SURFACE, flagged rather than quietly shipped. It is in the table
   * rather than in `csv.ts` because leaving it English on an Indonesian
   * export would break this stage's own governing constraint ("the file
   * must match the language of the page -- headers AND values"), and a
   * literal in the serialiser is exactly how that happens unnoticed.
   */
  groupsMadeComment: string;
  /**
   * The last line of the template downloaded with no class list on screen,
   * written as a `#` comment like the two example rows above it — so it
   * imports as nothing whether or not a teacher deletes it.
   *
   * Here rather than in `i18n.ts` for the same reason as
   * `groupsMadeComment`: it is text inside a FILE, and the rule governing
   * this stage is that the file matches the language of the page. Keeping
   * every word the file contains in one table is what makes that checkable.
   */
  templateHint: string;
}

export const CSV_LOCALES: Record<Locale, CsvLocale> = {
  en: {
    classComment: '# Class:',
    columns: {
      number: 'number',
      name: 'name',
      sex: 'sex',
      absent: 'absent',
      together: 'together',
      apart: 'apart',
    },
    sex: { M: 'M', F: 'F' },
    absentYes: 'yes',
    absentNo: 'no',
    groupColumn: 'group',
    groupsMadeComment: '# Groups made',
    templateHint: 'delete these two lines and type your own',
  },
  id: {
    classComment: '# Kelas:',
    columns: {
      number: 'nomor',
      name: 'nama',
      // Two words, with the space. The header is what a teacher sees in
      // Excel, so it is the natural Indonesian phrase and not a compacted
      // identifier -- the parser quotes and trims rather than the table
      // bending to make parsing easier.
      sex: 'jenis kelamin',
      absent: 'tidak hadir',
      together: 'bersama',
      apart: 'terpisah',
    },
    // L/P (laki-laki / perempuan), matching the roster table's own
    // `rosterSexMale`/`rosterSexFemale` on the Indonesian page -- a teacher
    // sees the same two letters in the tool and in the file.
    sex: { M: 'L', F: 'P' },
    absentYes: 'ya',
    absentNo: 'tidak',
    groupColumn: 'kelompok',
    groupsMadeComment: '# Kelompok dibuat',
    templateHint: 'hapus dua baris ini lalu ketik milik Anda sendiri',
  },
};
