import { describe, it, expect } from 'vitest';
import {
  calculateGlory,
  formatNumber,
  ERRORS,
} from '../../src/lib/gloryPoints';
import {
  siteEn,
  siteId,
  siteZh,
  siteVi,
  siteTh,
} from '../../src/lib/i18n/site';

describe('calculateGlory — formula (verified against the ported Flask source)', () => {
  it.each([
    [1, 1, 2, 5],
    // 9/0.9 = 10 exactly: no rounding — catches always-round-up bugs. Also
    // pins the rate's DIRECTION: one bean converts to 0.9 coins, so 9 coins
    // cost 10 beans; a "0.9 beans per coin" formula would give 9 (#382).
    [9, 9, 10, 25],
    [10, 10, 12, 30],
    [100, 100, 112, 280],
    [1000, 1000, 1112, 2780],
  ])('points=%i -> coins=%i beans=%i gift=%i', (p, coins, beans, gift) => {
    const out = calculateGlory(String(p));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result).toEqual({
        gloryPoints: p,
        coinsNeeded: coins,
        beansNeeded: beans,
        totalGiftValue: gift,
      });
    }
  });
});

describe('calculateGlory — validation', () => {
  it.each(['', '   '])('empty/whitespace %j -> empty error', (v) => {
    expect(calculateGlory(v)).toEqual({ ok: false, error: ERRORS.empty });
  });
  it.each(['abc', '3.5', '1e3', '1,000', '+5', '-5', '5 5', '0x10'])(
    'non-digits %j -> notWhole error',
    (v) => {
      expect(calculateGlory(v)).toEqual({ ok: false, error: ERRORS.notWhole });
    },
  );
  it.each(['0', '00', '000'])('zero %j -> zero error', (v) => {
    expect(calculateGlory(v)).toEqual({ ok: false, error: ERRORS.zero });
  });
  it('trims surrounding whitespace around a valid value', () => {
    const out = calculateGlory('  10  ');
    expect(out.ok).toBe(true);
  });
});

describe('calculateGlory — upper bound (cap 1,000,000,000)', () => {
  it('accepts the cap and computes it exactly', () => {
    expect(calculateGlory('1000000000')).toEqual({
      ok: true,
      result: {
        gloryPoints: 1000000000,
        coinsNeeded: 1000000000,
        beansNeeded: 1111111112,
        totalGiftValue: 2777777780,
      },
    });
  });
  it('rejects one above the cap', () => {
    expect(calculateGlory('1000000001')).toEqual({
      ok: false,
      error: ERRORS.tooLarge,
    });
  });
});

describe('formatNumber', () => {
  it.each([
    [5, '5'],
    [280, '280'],
    [2780, '2,780'],
    [1000000, '1,000,000'],
  ])('English: %i -> %s', (n, s) => expect(formatNumber(n, 'en')).toBe(s));

  it.each([
    [5, '5'],
    [280, '280'],
    [2780, '2.780'],
    [1000000, '1.000.000'],
  ])('Indonesian: %i -> %s', (n, s) => expect(formatNumber(n, 'id')).toBe(s));

  it('does not print an Indonesian number in the English convention', () => {
    // In Indonesian "." groups thousands and "," is the decimal mark, so the
    // English rendering of 1112 reads to an Indonesian teacher as "one point
    // one one two". The static copy on the same page already writes "0,9
    // koin per bean" correctly, so the page was contradicting itself.
    expect(formatNumber(1112, 'id')).toBe('1.112');
    expect(formatNumber(1112, 'id')).not.toBe(formatNumber(1112, 'en'));
  });
});

describe('the assumptions line states the rate the formula uses (#382)', () => {
  // One bean converts to 0.9 coins. Every locale shipped the inverse, "0.9
  // beans per coin", while the formula divided by 0.9 correctly, so the page
  // described a calculation it does not do. Nothing pinned this sentence, and
  // no generic copy guard can: it was translated, non-blank and slot-perfect.
  it.each([
    [
      'en',
      siteEn,
      'Assumes 1 coin per point, 0.9 coins per bean, and gifts converting to beans at 40%.',
    ],
    [
      'id',
      siteId,
      'Mengasumsikan 1 koin per poin, 0,9 koin per bean, dan hadiah dikonversi ke bean sebesar 40%.',
    ],
    [
      'zh',
      siteZh,
      '假设每1分需1枚金币，每颗豆子可兑换0.9枚金币，且礼物可按40%的比例兑换成豆子。',
    ],
    [
      'vi',
      siteVi,
      'Giả định mỗi điểm tương ứng với 1 đồng xu, mỗi hạt đậu tương ứng với 0,9 đồng xu, và quà tặng được quy đổi thành hạt đậu theo tỷ lệ 40%.',
    ],
    [
      'th',
      siteTh,
      'สมมติว่า 1 คะแนนเท่ากับ 1 เหรียญ, 0.9 เหรียญต่อถั่ว และของขวัญจะถูกแปลงเป็นถั่วในอัตรา 40%',
    ],
  ])('%s', (_locale, site, sentence) => {
    expect(site.glory.assumptions).toBe(sentence);
  });
});
