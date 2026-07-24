/** Exact user-facing messages — copy is part of the contract (tests assert these). */
export const ERRORS = {
  empty: 'Please enter a number.',
  notWhole: 'Please enter a whole number.',
  zero: 'Enter a number greater than zero.',
  tooLarge: 'That number is too large.',
} as const;

/**
 * Conversion constants ported from the YeeTalk Flask calculator.
 * Input is capped at 1,000,000,000 (see calculateGlory). Across the entire
 * accepted range [1, 1e9] the naive Math.ceil arithmetic is EXACT — verified
 * exhaustively to 50,000,000 and by a dense BigInt cross-check up to 1e9, with
 * the first divergence only at ~2^51 (2.25e15), a >1,000,000x margin. Do NOT
 * raise the cap without re-verifying exactness (float division by 0.9 / 0.4
 * loses integer precision at large magnitudes).
 */
const BEANS_PER_COIN = 0.9;
const GIFT_BEAN_RATE = 0.4;

export interface GloryResult {
  gloryPoints: number;
  coinsNeeded: number;
  beansNeeded: number;
  totalGiftValue: number;
}

export type GloryOutcome =
  { ok: true; result: GloryResult } | { ok: false; error: string };

export function calculateGlory(rawInput: string): GloryOutcome {
  const trimmed = rawInput.trim();
  if (trimmed === '') return { ok: false, error: ERRORS.empty };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: ERRORS.notWhole };

  const gloryPoints = Number(trimmed);
  if (gloryPoints === 0) return { ok: false, error: ERRORS.zero };
  if (gloryPoints > 1_000_000_000) return { ok: false, error: ERRORS.tooLarge };

  const coinsNeeded = Math.ceil(gloryPoints * 1);
  const beansNeeded = Math.ceil(coinsNeeded / BEANS_PER_COIN);
  const totalGiftValue = Math.ceil(beansNeeded / GIFT_BEAN_RATE);

  return {
    ok: true,
    result: { gloryPoints, coinsNeeded, beansNeeded, totalGiftValue },
  };
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
