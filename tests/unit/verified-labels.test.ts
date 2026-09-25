import { describe, it, expect } from 'vitest';
import { nonEmpty, searched } from '../source-files';
import { en, type Catalogue } from '../../src/lib/i18n/en';
import { id } from '../../src/lib/i18n/id';
import { zh } from '../../src/lib/i18n/zh';
import { vi } from '../../src/lib/i18n/vi';
import { th } from '../../src/lib/i18n/th';
import {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
} from '../../src/lib/i18n/locales';
import { getSiteStrings } from '../../src/lib/i18n';
import { CSV_LOCALES } from '../../src/lib/csv-locale';
import { backTranslationUnits } from '../../src/lib/i18n/back-translate';
import { checkLabels } from '../../src/lib/i18n/label-check';

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
 * Scope began as the roster column family, because #249 propagates these six
 * keys out of one table header and into the empty option of three dropdowns
 * on every row. #161 widened it. Every short label that disagreed with its
 * own locale's copy went to the operator on one sheet, and everything he
 * read there is pinned here: the 29 corrections he approved, the sentences
 * that came with them, and the values he chose to keep. Those keys are
 * spelled the way `backTranslationUnits` spells a path (`howToSteps[2]`,
 * `site.glory.heading`, `csv.columns.apart`), so a flag and its pin name the
 * same copy. A CSV header word is a parsing token as well as copy (#252), so
 * correcting one keeps the old word readable: `supersededColumns`.
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
    // #161's sheet, read by the operator on 2026-09-23.
    'csv.columns.apart': 'terpisah',
    'csv.columns.together': 'bersama',
    keepApartLabel: 'Jangan bersama',
    modeLabel: 'Bagi berdasarkan',
    'site.home.opensAt': 'membuka',
    stateApart: '{n} dipisahkan',
    stateTogether: '{n} disatukan',
  },
  zh: {
    rosterColNumber: '#',
    rosterColName: '姓名',
    rosterColSex: '性别',
    rosterColAbsent: '缺席',
    rosterColTogether: '在一起',
    rosterColApart: '分开',
    // #161's sheet, read by the operator on 2026-09-23.
    again: '重新洗牌',
    boardShuffle: '重新洗牌',
    'csv.columns.apart': '分开',
    'csv.columns.name': '姓名',
    'errors.KEEP_APART_SEARCH_GAVE_UP':
      '这里的“分开”规则太多，难以逐一处理。试着删除其中一些吧。',
    howToHeading: '使用方法',
    'howToSteps[2]': '点击“开始分组”。',
    ioReplaceWarning:
      '这将取代您当前的班级名单——{total}名学生，其中{named}名已命名。',
    keepApartLabel: '分开',
    makeGroups: '开始分组',
    modeGroupCount: '组数',
    resultsHeading: '您的分组',
    resultsHeadingNamed: '{className} — 您的分组',
    stateAdded: '{n} 已添加',
    stateApart: '{n} 分开',
    stateNamed: '{n} 已命名',
    stateNone: '无',
    // #319's sheet, applied unanswered under the operator's 2026-09-24
    // instruction to complete the board and review it once, at the end. His
    // read of these is due then and has not been given yet.
    'csv.columns.number': '编号',
    printWhatGroups: '分组结果',
  },
  vi: {
    rosterColNumber: '#',
    rosterColName: 'Tên',
    rosterColSex: 'Giới tính',
    rosterColAbsent: 'Vắng mặt',
    rosterColTogether: 'Cùng nhau',
    rosterColApart: 'Tách biệt',
    // #161's sheet, read by the operator on 2026-09-23.
    'csv.columns.apart': 'tách biệt',
    'errors.KEEP_APART_SEARCH_GAVE_UP':
      'Ở đây có quá nhiều quy tắc xếp khác nhóm, khó mà xử lý hết được. Hãy thử loại bỏ một số quy tắc trong số đó.',
    ioReplaceWarning:
      'Danh sách này sẽ thay thế danh sách lớp hiện tại của bạn — {total} học sinh, {named} em đã có tên.',
    keepApartLabel: 'Xếp khác nhóm',
    modeLabel: 'Phân chia theo',
    sectionStudentsHeading: 'Thông tin học sinh',
    'site.glory.heading': 'Máy tính Glory Points',
    'site.glory.title': 'Máy tính Glory Points — Shyden',
    'site.home.workGloryTitle': 'Máy tính Glory Points',
    stateAdded: '{n} đã được thêm vào',
    stateApart: '{n} tách biệt',
    stateNamed: '{n} đã có tên',
    stateNone: 'không có',
  },
  th: {
    rosterColNumber: '#',
    rosterColName: 'ชื่อ',
    rosterColSex: 'เพศ',
    rosterColAbsent: 'ไม่มา',
    rosterColTogether: 'ด้วยกัน',
    rosterColApart: 'แยก',
    // #161's sheet, read by the operator on 2026-09-23.
    again: 'สับใหม่',
    boardOpen: 'เต็มหน้าจอ',
    boardShuffle: 'สับใหม่',
    'csv.columns.absent': 'ไม่มา',
    'csv.columns.apart': 'แยกกัน',
    'csv.columns.together': 'ด้วยกัน',
    'csv.fileName.class-list': 'รายชื่อชั้น',
    'errors.KEEP_APART_SEARCH_GAVE_UP':
      'มีกฎ “ให้อยู่คนละกลุ่ม” มากเกินไปจนยากที่จะปฏิบัติตาม ลองลบออกบางส่วนดู',
    keepApartLabel: 'ให้อยู่คนละกลุ่ม',
    printClassListHeading: 'รายชื่อนักเรียน',
    printWhatClassList: 'รายชื่อนักเรียน',
    rosterAbsentPill: 'ไม่มา',
    'site.glory.heading': 'เครื่องคำนวณ Glory Points',
    'site.glory.title': 'เครื่องคำนวณ Glory Points — Shyden',
    'site.home.workGloryTitle': 'เครื่องคำนวณ Glory Points',
    stateAbsent: '{n} ไม่มา',
    stateAdded: '{n} ได้เพิ่มแล้ว',
    stateApart: '{n} แยกกัน',
    stateTogether: '{n} ด้วยกัน',
    // #319's sheet, applied unanswered under the operator's 2026-09-24
    // instruction to complete the board and review it once, at the end. His
    // read of these is due then and has not been given yet.
    'csv.columns.number': 'หมายเลข',
    ioReplaceWarning:
      'ข้อมูลนี้จะแทนที่รายชื่อนักเรียนปัจจุบันของคุณ — นักเรียน {total} คน มีชื่อแล้ว {named} คน',
  },
};

const CATALOGUES: Record<Locale, Catalogue> = { en, id, zh, vi, th };

/**
 * Only the top-level strings: the nested tables (`errors`, `warnings`) and
 * the lists (`howToSteps`) are not columns. A message is a string too (#136),
 * so a `rosterCol*` key that became one would stay in the derived set below.
 */
const stringsOf = (catalogue: Catalogue): Record<string, string> =>
  Object.fromEntries(
    Object.entries(catalogue).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;

/**
 * The copy at a pinned key, read from the catalogue the key names: `site.`
 * for the page chrome, `csv.` for the words a downloaded file carries, and
 * the page catalogue otherwise. A key that names nothing reads as
 * `undefined`, which no pinned value equals, so a pin that outlives its copy
 * goes red rather than silently asserting nothing.
 */
const copyAt = (locale: Locale, key: string): unknown => {
  const [root, path]: [unknown, string] = key.startsWith('site.')
    ? [getSiteStrings(locale), key.slice('site.'.length)]
    : key.startsWith('csv.')
      ? [CSV_LOCALES[locale], key.slice('csv.'.length)]
      : [CATALOGUES[locale], key];
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce<unknown>(
      (table, step) =>
        table !== null && typeof table === 'object'
          ? (table as Record<string, unknown>)[step]
          : undefined,
      root,
    );
};

/**
 * Derived from the catalogue, never listed here. A seventh roster column
 * added next year is covered the day it appears -- it arrives unpinned, the
 * coverage test goes red, and someone has to get its five values read.
 */
const rosterColumnKeys = Object.keys(stringsOf(en))
  .filter((key) => key.startsWith('rosterCol'))
  .sort();

describe('the copy the operator read and approved', () => {
  it('every locale renders the value the operator approved', () => {
    const live = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        Object.fromEntries(
          Object.keys(VERIFIED[locale]).map((key) => [
            key,
            copyAt(locale, key),
          ]),
        ),
      ]),
    );

    expect(live).toEqual(VERIFIED);
  });

  it('the pin covers every locale and every roster column, with nothing blank', () => {
    expect(Object.keys(CATALOGUES).sort()).toEqual([...LOCALES].sort());
    expect(Object.keys(VERIFIED).sort()).toEqual([...LOCALES].sort());

    // A literal count, against the six columns the design spec names. Counting
    // the array is not counting its content, so the values are checked below.
    expect(
      nonEmpty(rosterColumnKeys, 'rosterCol* keys in the English catalogue'),
    ).toHaveLength(6);

    const unpinned = LOCALES.flatMap((locale) =>
      rosterColumnKeys
        .filter((key) => !Object.hasOwn(VERIFIED[locale], key))
        .map((key) => `${locale} ${key}`),
    );
    expect(
      searched(unpinned, { of: rosterColumnKeys, what: 'roster columns' }),
    ).toEqual([]);

    const values = LOCALES.flatMap((locale) => Object.values(VERIFIED[locale]));
    expect(
      searched(
        values.filter((value) => value.trim() === ''),
        { of: values, what: 'pinned values' },
      ),
    ).toEqual([]);
  });
});

/**
 * Short labels that disagree with their own locale, awaiting the operator's
 * read (#161).
 *
 * `checkLabels` flags a label whose rendering appears in none of the copy that
 * uses its English and says more, and a label whose namesake renders the same
 * English in other words. Every flag is either pinned in `VERIFIED` above --
 * the operator has read that value -- or listed here until he has. A label
 * that starts to disagree, in a re-seeded locale or on the day it is added, is
 * in neither, and this goes red.
 *
 * Exact in both directions: a listed label that stops disagreeing goes red
 * too, so the list cannot outlive what it describes. It emptied when #161's
 * sheet was answered (2026-09-23), each entry moving to a pin or to a
 * corrected catalogue, and it stays as the place a new flag waits while the
 * operator reads it.
 */
const AWAITING_READ: Record<Locale, readonly string[]> = {
  en: [],
  id: [],
  zh: [],
  vi: [],
  th: [],
};

describe('short labels that disagree with their own locale', () => {
  it("every one is pinned or awaiting the operator's read", () => {
    const unread = Object.fromEntries(
      LOCALES.map((locale) => {
        const labels = checkLabels(backTranslationUnits(locale), locale);
        const flagged = labels
          .filter(
            ({ status, variants }) =>
              status === 'disagrees' || variants.length > 0,
          )
          .map(({ key }) => key)
          .filter((key) => !Object.hasOwn(VERIFIED[locale], key));
        // A check that stopped finding witnesses would flag nothing, and an
        // emptied list would then agree with it. Only English has no labels.
        const witnessed = labels
          .filter(({ status }) => status !== 'unchecked')
          .map(({ key }) => key);
        return [
          locale,
          locale === DEFAULT_LOCALE
            ? flagged
            : [
                ...searched(flagged, {
                  of: witnessed,
                  what: `${locale} labels with a witness`,
                }),
              ].sort(),
        ];
      }),
    );

    expect(unread).toEqual(
      Object.fromEntries(
        LOCALES.map((locale) => [locale, [...AWAITING_READ[locale]].sort()]),
      ),
    );
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
