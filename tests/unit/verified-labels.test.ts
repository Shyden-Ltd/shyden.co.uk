import { describe, it, expect } from 'vitest';
import { nonEmpty, searched } from '../source-files';
import { en, type Catalogue } from '../../src/lib/i18n/en';
import { id } from '../../src/lib/i18n/id';
import { zh } from '../../src/lib/i18n/zh';
import { vi } from '../../src/lib/i18n/vi';
import { th } from '../../src/lib/i18n/th';
import { LOCALES, type Locale } from '../../src/lib/i18n/locales';
import { getSiteStrings } from '../../src/lib/i18n';

/**
 * The values of the roster's column labels, pinned to what the operator read
 * and approved.
 *
 * This file exists because four i18n guards ran over `vi.rosterColSex` for a
 * month and none of them could see what was wrong with it. It held
 * `Tinh duc` -- Vietnamese for sexual intercourse -- as the column heading
 * beside every pupil's name on a classroom roster. `locale-fallbacks` asks
 * "is this still English?" and it is not. `i18n` asks "is this blank?" and it
 * is not. `dead-copy` asks "does a page render it?" and one does.
 * `message-parity` asks "are the slots the same?" and there are none. A
 * string that is fully translated and WRONG answers every one of those
 * correctly, so the only question left is "is this the value we approved?",
 * and that question needs a literal pin.
 *
 * Machine translation fails this way on BARE LABELS specifically: a one-word
 * source carries no context to disambiguate its sense. The same catalogue's
 * prose was right all along -- `vi.ts` uses `gioi tinh` for this exact concept
 * in four sentences (lines 77, 79, 134 and 135) -- which is why reading the
 * surrounding copy never surfaced it.
 *
 * No native speaker is available and none is coming (operator, 2026-09-20),
 * so the operator's own read IS the verification of record. That makes this
 * table the record of it: changing a value here is changing what was signed
 * off, and it may not be done without a fresh operator read.
 *
 * Scope is the roster column family, because #249 propagates these six keys
 * out of one table header and into the empty option of three dropdowns on
 * every row. The rest of the catalogues' short labels need the same treatment
 * and that sweep is #161, whose list must be derived rather than read. The CSV
 * export writes its own copy of these headers and is held apart as #252: there
 * the header word is a parsing token, so correcting one breaks importing a file
 * a teacher has already exported.
 */
const VERIFIED: Record<Locale, Record<string, string>> = {
  en: {
    rosterColNumber: '#',
    rosterColName: 'Name',
    rosterColSex: 'Sex',
    rosterColAbsent: 'Absent',
    rosterColTogether: 'Together',
    rosterColApart: 'Apart',
  },
  id: {
    rosterColNumber: '#',
    rosterColName: 'Nama',
    rosterColSex: 'Jenis kelamin',
    rosterColAbsent: 'Tidak hadir',
    rosterColTogether: 'Bersama',
    rosterColApart: 'Terpisah',
  },
  zh: {
    rosterColNumber: '#',
    rosterColName: '姓名',
    rosterColSex: '性别',
    rosterColAbsent: '缺席',
    rosterColTogether: '在一起',
    rosterColApart: '分开',
  },
  vi: {
    rosterColNumber: '#',
    rosterColName: 'Tên',
    rosterColSex: 'Giới tính',
    rosterColAbsent: 'Vắng mặt',
    rosterColTogether: 'Cùng nhau',
    rosterColApart: 'Tách biệt',
  },
  th: {
    rosterColNumber: '#',
    rosterColName: 'ชื่อ',
    rosterColSex: 'เพศ',
    rosterColAbsent: 'ไม่มา',
    rosterColTogether: 'ร่วมกัน',
    rosterColApart: 'แยก',
  },
};

const CATALOGUES: Record<Locale, Catalogue> = { en, id, zh, vi, th };

/**
 * Only the string leaves. A `Catalogue` also holds message templates, which
 * are functions; if a `rosterCol*` key ever became one it would drop out of
 * the derived key set below and the count control would go red rather than
 * this file quietly stopping to assert it.
 */
const stringsOf = (catalogue: Catalogue): Record<string, string> =>
  Object.fromEntries(
    Object.entries(catalogue).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;

/**
 * Derived from the catalogue, never listed here. A seventh roster column
 * added next year is covered the day it appears -- it arrives unpinned, the
 * coverage test goes red, and someone has to get its five values read.
 */
const rosterColumnKeys = Object.keys(stringsOf(en))
  .filter((key) => key.startsWith('rosterCol'))
  .sort();

describe('the roster column labels a teacher reads', () => {
  it('every locale renders the value the operator approved', () => {
    const live = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        Object.fromEntries(
          rosterColumnKeys.map((key) => [
            key,
            stringsOf(CATALOGUES[locale])[key],
          ]),
        ),
      ]),
    );

    expect(live).toEqual(VERIFIED);
  });

  it('the pin covers every locale and every column, with nothing blank', () => {
    expect(Object.keys(CATALOGUES).sort()).toEqual([...LOCALES].sort());
    expect(Object.keys(VERIFIED).sort()).toEqual([...LOCALES].sort());

    // A literal count, against the six columns the design spec names. Counting
    // the array is not counting its content, so the values are checked below.
    expect(
      nonEmpty(rosterColumnKeys, 'rosterCol* keys in the English catalogue'),
    ).toHaveLength(6);

    for (const locale of LOCALES) {
      expect(Object.keys(VERIFIED[locale]).sort()).toEqual(rosterColumnKeys);
    }

    const values = LOCALES.flatMap((locale) =>
      rosterColumnKeys.map((key) => VERIFIED[locale][key]),
    );
    expect(
      searched(
        values.filter((value) => value.trim() === ''),
        { of: values, what: 'pinned roster column labels' },
      ),
    ).toEqual([]);
  });
});

/**
 * The footer's registered-office line, pinned to what the operator approved.
 *
 * Same defect class as the roster columns above, in a different file. DeepL
 * returned the Thai line with the `<x>`-protected term butted straight against
 * the Thai -- `จดทะเบียนในEngland & Wales` -- and every structural guard passed it:
 * it is translated, non-blank, rendered by the footer of every page, and
 * carries no placeholders to compare. Only a literal pin can ask whether it is
 * the value we approved.
 *
 * The space is NOT derivable as a rule across locales, which is why this is a
 * table rather than an assertion about separators. Thai sets a space around an
 * inline Latin-script term; Chinese does not, and `注册于England & Wales。` is
 * correct with none. A guard reading "every locale separates the protected
 * term" would be red on correct Chinese.
 *
 * Nor is the terminal stop derivable. Thai marks a sentence end with a space
 * rather than a period, so the Thai line ends without one while its four
 * siblings end with the stop their own scripts use. #53's original acceptance
 * criterion asked for a full stop here; that applied English punctuation logic
 * to Thai and was reversed by operator decision, 2026-09-20.
 *
 * `id` localises the place name to `Inggris` while the machine-seeded locales
 * keep the protected `England & Wales`. That is deliberate -- `id.ts` is
 * hand-written -- and pinning the values is what keeps it deliberate rather
 * than looking like a protection failure to the next reader.
 */
const VERIFIED_FOOTER: Record<Locale, string> = {
  en: 'Registered in England & Wales.',
  id: 'Terdaftar di Inggris & Wales.',
  zh: '注册于England & Wales。',
  vi: 'Được đăng ký tại England & Wales.',
  th: 'จดทะเบียนใน England & Wales',
};

describe("the footer's registered-office line", () => {
  it('every locale renders the value the operator approved', () => {
    const live = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        getSiteStrings(locale).footer.registered,
      ]),
    );

    expect(live).toEqual(VERIFIED_FOOTER);
  });

  it('the pin covers every locale, with nothing blank', () => {
    expect(Object.keys(VERIFIED_FOOTER).sort()).toEqual([...LOCALES].sort());

    // Counting the array is not counting its content: five empty strings are
    // still five entries, and an emptied table collides with nothing.
    const values = LOCALES.map((locale) => VERIFIED_FOOTER[locale]);
    expect(
      searched(
        values.filter((value) => value.trim() === ''),
        { of: values, what: 'pinned footer registered-office lines' },
      ),
    ).toEqual([]);
  });
});
