import { describe, it, expect } from 'vitest';
import { CSV_LOCALES } from '../../src/lib/csv-locale';

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
