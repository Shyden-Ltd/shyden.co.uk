import { describe, it, expect } from 'vitest';
import { nonEmpty } from '../source-files';
import {
  backTranslationUnits,
  type BackTranslationUnit,
} from '../../src/lib/i18n/back-translate';
import { checkLabels, renderedOn } from '../../src/lib/i18n/label-check';

/**
 * A short label, cross-checked against how its own locale renders the same
 * English elsewhere (#161).
 *
 * `vi.rosterColSex` held `Tình dục` -- sexual intercourse -- as a column
 * heading for a month while four Vietnamese sentences said `giới tính` for
 * the same word. A bare label carries no context, so the engine picked the
 * wrong sense; the sentences around it had context and got it right. Reading
 * the label back into English cannot see this, because the wrong sense reads
 * back as the same ambiguous word (#95 measured it: 100 before the fix, 9
 * after). The locale's own sentences can.
 */

const unit = (
  key: string,
  english: string,
  translation: string,
): BackTranslationUnit => ({ key, english, translation });

const SEX_SENTENCE = unit(
  'modeHintSex',
  'Mix the groups by sex so each one is balanced',
  'Trộn các nhóm theo giới tính để mỗi nhóm cân bằng',
);

describe('checkLabels: a label against the rest of its locale', () => {
  it('a label its own sentences use agrees', () => {
    const label = unit('rosterColSex', 'Sex', 'Giới tính');

    expect(checkLabels([label, SEX_SENTENCE], 'vi')).toEqual([
      { ...label, status: 'agrees', witnesses: [SEX_SENTENCE], variants: [] },
    ]);
  });

  it('a label its own sentences never use is flagged, with those sentences', () => {
    const label = unit('rosterColSex', 'Sex', 'Tình dục');

    expect(checkLabels([label, SEX_SENTENCE], 'vi')).toEqual([
      {
        ...label,
        status: 'disagrees',
        witnesses: [SEX_SENTENCE],
        variants: [],
      },
    ]);
  });

  it('a label no other copy uses is unchecked, never agreed', () => {
    const label = unit('rosterColAbsent', 'Absent', 'Vắng mặt');

    expect(checkLabels([label, SEX_SENTENCE], 'vi')).toEqual([
      { ...label, status: 'unchecked', witnesses: [], variants: [] },
    ]);
  });

  it("finds the label's English as a whole word, so Sex is not in Essex", () => {
    const label = unit('rosterColSex', 'Sex', 'Tình dục');
    const essex = unit(
      'schoolHint',
      'Schools in Essex use this every week',
      'Các trường ở Essex dùng cái này mỗi tuần',
    );

    expect(checkLabels([label, essex], 'vi')).toEqual([
      { ...label, status: 'unchecked', witnesses: [], variants: [] },
    ]);
  });

  it.each([
    [
      'groups',
      unit('groupColumn', 'Group', 'Nhóm'),
      unit(
        'howTo',
        'Make four groups from the class list',
        'Tạo bốn nhóm từ danh sách lớp',
      ),
    ],
    [
      'sexes',
      unit('rosterColSex', 'Sex', 'Giới tính'),
      unit(
        'mixHint',
        'Keep both sexes in every group',
        'Giữ cả hai giới tính trong mỗi nhóm',
      ),
    ],
  ])(
    'a plural in the sentence (%s) still uses the label word',
    (_plural, label, sentence) => {
      expect(checkLabels([label, sentence], 'vi')).toEqual([
        { ...label, status: 'agrees', witnesses: [sentence], variants: [] },
      ]);
    },
  );

  it('neither letter case nor Unicode composition decides agreement', () => {
    const label = unit('rosterColSex', 'SEX', 'Giới tính');
    const decomposed = 'trộn các nhóm theo giới tính'.normalize('NFD');
    const sentence = unit(
      'modeHintSex',
      'Mix the groups by sex so each one is balanced',
      decomposed,
    );
    // The control: without normalising, the sentence does not contain the
    // label, so an agreement below can only come from the normalisation.
    expect(decomposed.includes('giới tính')).toBe(false);

    expect(checkLabels([label, sentence], 'vi')).toEqual([
      { ...label, status: 'agrees', witnesses: [sentence], variants: [] },
    ]);
  });

  it('slots and punctuation separate the words compared, on both sides', () => {
    const splitBy = unit('modeLabel', 'Split by', '按……划分');
    const apart = unit('stateApart', '{n} apart', '{n} 分开');
    const sentence = unit(
      'warnings.APART',
      '{names} are kept apart, so the group is not split by sex',
      '{names} 被分开，因此该组没有按性别划分',
    );

    expect(checkLabels([splitBy, apart, sentence], 'zh')).toEqual([
      { ...splitBy, status: 'agrees', witnesses: [sentence], variants: [] },
      { ...apart, status: 'agrees', witnesses: [sentence], variants: [] },
    ]);
  });

  it('every part of the label must appear in one piece of copy', () => {
    const label = unit('modeLabel', 'Split by', '按……划分');
    const first = unit(
      'a',
      'Groups are split by size first',
      '小组首先按大小排列',
    );
    const second = unit(
      'b',
      'Nothing here is split by sex',
      '这里没有任何划分',
    );

    expect(checkLabels([label, first, second], 'zh')).toEqual([
      {
        ...label,
        status: 'disagrees',
        witnesses: [first, second],
        variants: [],
      },
    ]);
  });

  it('a label whose rendering lost its words agrees with nothing', () => {
    // `[].every(...)` is true: without a guard, a translation that kept only
    // its slot would agree with every witness it has.
    const label = unit('stateNamed', '{n} named', '{n}');
    const sentence = unit(
      'namedHint',
      'Pupils are named in the order you typed them',
      'Học sinh được đặt tên theo thứ tự bạn đã nhập',
    );

    expect(checkLabels([label, sentence], 'vi')).toEqual([
      { ...label, status: 'disagrees', witnesses: [sentence], variants: [] },
    ]);
  });

  it('copy with no English words has nothing to look for, so no witnesses', () => {
    // An empty pattern would match the lone `s` a possessive leaves once its
    // apostrophe is gone ("pupil's" is "pupil s"), so it has to be refused.
    const count = unit('count', '{n}', '{n} học sinh');
    const sentence = unit(
      'nameHint',
      "Each pupil's name goes on its own line",
      'Tên của mỗi học sinh nằm trên một dòng riêng',
    );

    expect(checkLabels([count, sentence], 'vi')).toEqual([
      { ...count, status: 'unchecked', witnesses: [], variants: [] },
    ]);
  });

  it('a longer label is a witness: "Exit full screen" judges "Full screen"', () => {
    const open = unit('boardOpen', 'Full screen', 'หน้าจอเต็ม');
    const exit = unit('boardExit', 'Exit full screen', 'ปิดโหมดเต็มหน้าจอ');

    expect(checkLabels([open, exit], 'th')).toEqual([
      { ...open, status: 'disagrees', witnesses: [exit], variants: [] },
      { ...exit, status: 'unchecked', witnesses: [], variants: [] },
    ]);
  });

  it('copy with the same English is no witness, so two copies of one wrong rendering cannot vouch for each other', () => {
    // One engine call rendered both from the same bare source, so they agree
    // by construction. Before #252, the CSV header repeated `Tình dục`.
    const button = unit('again', 'Shuffle again', '再次洗牌');
    const board = unit('boardShuffle', 'Shuffle again', '再次洗牌');
    const sentence = unit(
      'staleRefuseExport',
      'These groups are out of date. Shuffle again before you save them.',
      '这些组已过时。保存前请重新打乱顺序。',
    );

    expect(checkLabels([button, board, sentence], 'zh')).toEqual([
      { ...button, status: 'disagrees', witnesses: [sentence], variants: [] },
      { ...board, status: 'disagrees', witnesses: [sentence], variants: [] },
    ]);
  });

  it('copy with the same English rendered in other words is a variant: a roster and a CSV naming one column two ways', () => {
    const roster = unit('rosterColName', 'Name', '姓名');
    const csv = unit('csv.columns.name', 'name', '名称');

    expect(checkLabels([roster, csv], 'zh')).toEqual([
      { ...roster, status: 'unchecked', witnesses: [], variants: [csv] },
      { ...csv, status: 'unchecked', witnesses: [], variants: [roster] },
    ]);
  });

  it('copy with the same English is no variant when one rendering holds the other', () => {
    const column = unit('rosterColAbsent', 'Absent', '缺席');
    const count = unit('stateAbsent', '{n} absent', '{n} 缺席');

    expect(checkLabels([column, count], 'zh')).toEqual([
      { ...column, status: 'unchecked', witnesses: [], variants: [] },
      { ...count, status: 'unchecked', witnesses: [], variants: [] },
    ]);
  });

  it('judges copy of three lettered words or fewer, slots not counted, and nothing longer', () => {
    const three = unit('modeGroupCount', 'Number of groups', '组数');
    const slotted = unit(
      'groupLabel',
      'Group {n} of {total}',
      '第 {n} 组，共 {total} 组',
    );
    const four = unit('modeHint', 'Number of groups wanted', '想要的组数');

    expect(
      checkLabels([three, slotted, four], 'zh').map(({ key }) => key),
    ).toEqual(['modeGroupCount', 'groupLabel']);
  });
});

describe('renderedOn: where a label is read', () => {
  it.each([
    ['rosterColSex', '/classroom-groups'],
    ['warnings.SEX_SPILLOVER [sex=M]', '/classroom-groups'],
    ['site.home.workGloryTitle', '/'],
    ['site.glory.heading', '/glory-points'],
    ['site.notFound.heading', 'the 404 page'],
    ['site.nav.home', 'the header or footer of every page'],
    ['site.footer.registered', 'the header or footer of every page'],
    ['csv.columns.sex', 'the CSV file a teacher downloads'],
  ])('%s is read on %s', (key, where) => {
    expect(renderedOn(key)).toBe(where);
  });

  it('refuses a site section it has no page for, naming it', () => {
    expect(() => renderedOn('site.nowhere.heading')).toThrow(/nowhere/);
  });
});

describe('on the live catalogues', () => {
  const live = () => backTranslationUnits('vi');
  const verdictOn = (units: readonly BackTranslationUnit[], key: string) =>
    nonEmpty(checkLabels(units, 'vi'), 'vi labels').find(
      (label) => label.key === key,
    );

  it('vi rosterColSex seeded back to Tình dục is flagged against the prose saying giới tính', () => {
    const units = live();
    const seeded = units.map((one) =>
      one.key === 'rosterColSex' ? { ...one, translation: 'Tình dục' } : one,
    );
    // Watch the seed apply: exactly one unit differs, and it is this one.
    expect(
      seeded.filter((one, index) => one !== units[index]).map(({ key }) => key),
    ).toEqual(['rosterColSex']);

    const verdict = verdictOn(seeded, 'rosterColSex');

    expect(verdict?.status).toBe('disagrees');
    expect(
      verdict?.witnesses.filter(({ translation }) =>
        translation.toLocaleLowerCase('vi').includes('giới tính'),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('the value the operator approved, Giới tính, is not flagged', () => {
    expect(verdictOn(live(), 'rosterColSex')).toMatchObject({
      translation: 'Giới tính',
      status: 'agrees',
      variants: [],
    });
  });
});
