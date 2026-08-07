import { describe, it, expect } from 'vitest';
import { sectionState, type ToolState } from '../../src/lib/sections';
import { en } from '../../src/lib/i18n/en';
import { id } from '../../src/lib/i18n/id';

describe('section header states', () => {
  const empty: ToolState = {
    named: 0,
    absent: 0,
    together: 0,
    apart: 0,
    rosterSize: 0,
    sexMode: 'off',
    leftovers: 'spread',
    dirty: false,
  };

  it('says nothing is added when the roster is empty', () => {
    expect(sectionState(empty, en).studentDetails).toBe('none added');
  });

  it('counts names', () => {
    expect(
      sectionState({ ...empty, rosterSize: 24, named: 24 }, en).studentDetails,
    ).toBe('24 named');
  });

  // The brief's own progression (empty -> named -> +absent -> +letters) never
  // exercises the roster that exists but has nothing to call out: everyone
  // present, nobody named, no letters set. Without this branch the fallback
  // line in sectionState (`if (parts.length === 0) parts.push(stateAdded...`)
  // has no test that can fail it.
  it('falls back to a plain count when a roster exists but nothing else is true of it', () => {
    expect(sectionState({ ...empty, rosterSize: 24 }, en).studentDetails).toBe(
      '24 added',
    );
  });

  it('adds absences', () => {
    expect(
      sectionState({ ...empty, rosterSize: 24, named: 24, absent: 2 }, en)
        .studentDetails,
    ).toBe('24 named · 2 absent');
  });

  it('adds the letters, in a fixed order', () => {
    expect(
      sectionState(
        {
          ...empty,
          rosterSize: 24,
          named: 24,
          absent: 2,
          together: 2,
          apart: 1,
        },
        en,
      ).studentDetails,
    ).toBe('24 named · 2 absent · 2 together · 1 apart');
  });

  it('reports grouping options', () => {
    expect(sectionState({ ...empty, sexMode: 'mix' }, en).groupingOptions).toBe(
      'mixed by sex',
    );
    expect(
      sectionState({ ...empty, sexMode: 'mix', leftovers: 'bunch' }, en)
        .groupingOptions,
    ).toBe('mixed by sex · leftovers in one group');
    expect(sectionState(empty, en).groupingOptions).toBe('none');
  });

  // The brief's own test above only ever exercises `sexMode: 'mix'`. A
  // mutant that swapped the `separate` branch's condition, or dropped it
  // entirely, would still pass every test above -- this is the one that
  // would catch it.
  it('reports separate mode independently of mix mode, and combines with bunch the same way mix does', () => {
    expect(
      sectionState({ ...empty, sexMode: 'separate' }, en).groupingOptions,
    ).toBe('separated by sex');
    expect(
      sectionState({ ...empty, sexMode: 'separate', leftovers: 'bunch' }, en)
        .groupingOptions,
    ).toBe('separated by sex · leftovers in one group');
  });

  it('warns permanently once anything is unsaved', () => {
    expect(sectionState(empty, en).importExport).toBe('nothing to save yet');
    expect(sectionState({ ...empty, dirty: true }, en).importExport).toBe(
      'unsaved changes — export to keep them',
    );
  });

  // Pins the exact three-key shape the interface promises. Sound & animation
  // (the fourth section) has no design-doc state example and no locale copy
  // of its own -- see sections.ts's own doc comment for why -- so a fourth
  // key appearing here would be an undocumented, untranslated addition, not
  // a harmless extra field.
  it('returns exactly the three fields the interface promises, nothing for sound & animation', () => {
    expect(Object.keys(sectionState(empty, en)).sort()).toEqual([
      'groupingOptions',
      'importExport',
      'studentDetails',
    ]);
  });

  it('produces the Indonesian strings from the Indonesian table', () => {
    expect(
      sectionState({ ...empty, rosterSize: 24, named: 24, absent: 2 }, id)
        .studentDetails,
    ).toBe('24 diberi nama · 2 tidak hadir');
  });

  // The state strings are the whole point of this function, and a unit test
  // is the only thing that can pin one against a locale file -- an e2e test
  // can only ever sample one language at a time. The Indonesian check above
  // covers `studentDetails`; these two close the same gap for the other two
  // returned fields, in both languages, so every branch of the function is
  // proven against BOTH locale tables, not just English.
  it('reports grouping options in Indonesian', () => {
    expect(
      sectionState({ ...empty, sexMode: 'mix', leftovers: 'bunch' }, id)
        .groupingOptions,
    ).toBe('dicampur berdasarkan jenis kelamin · sisa dalam satu kelompok');
    expect(
      sectionState({ ...empty, sexMode: 'separate' }, id).groupingOptions,
    ).toBe('dipisah berdasarkan jenis kelamin');
    expect(sectionState(empty, id).groupingOptions).toBe('tidak ada');
  });

  it('warns permanently once anything is unsaved, in Indonesian', () => {
    expect(sectionState(empty, id).importExport).toBe(
      'belum ada yang perlu disimpan',
    );
    expect(sectionState({ ...empty, dirty: true }, id).importExport).toBe(
      'perubahan belum disimpan — ekspor untuk menyimpannya',
    );
  });
});
