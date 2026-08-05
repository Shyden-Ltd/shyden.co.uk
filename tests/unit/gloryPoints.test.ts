import { describe, it, expect } from 'vitest';
import {
  calculateGlory,
  formatNumber,
  ERRORS,
} from '../../src/lib/gloryPoints';

describe('calculateGlory — formula (verified against the ported Flask source)', () => {
  it.each([
    [1, 1, 2, 5],
    [9, 9, 10, 25], // 9/0.9 = 10 exactly: no rounding — catches always-round-up bugs
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
    // bean per koin" correctly, so the page was contradicting itself.
    expect(formatNumber(1112, 'id')).toBe('1.112');
    expect(formatNumber(1112, 'id')).not.toBe(formatNumber(1112, 'en'));
  });
});
