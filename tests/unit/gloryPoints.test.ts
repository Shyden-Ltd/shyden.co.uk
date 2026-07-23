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

describe('calculateGlory — upper bound', () => {
  it('accepts exactly Number.MAX_SAFE_INTEGER', () => {
    expect(calculateGlory(String(Number.MAX_SAFE_INTEGER)).ok).toBe(true);
  });
  it('rejects MAX_SAFE_INTEGER + 1', () => {
    expect(calculateGlory('9007199254740992')).toEqual({
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
  ])('%i -> %s', (n, s) => expect(formatNumber(n)).toBe(s));
});
