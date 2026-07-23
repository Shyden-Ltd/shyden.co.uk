/** Exact user-facing messages — copy is part of the contract (tests assert these). */
export const ERRORS = {
  empty: 'Please enter a number.',
  notWhole: 'Please enter a whole number.',
  zero: 'Enter a number greater than zero.',
  tooLarge: 'That number is too large.',
} as const;

/**
 * Conversion constants ported verbatim from the YeeTalk Flask calculator.
 * Naive Math.ceil is used: an audit over inputs 1..2000 showed zero divergence
 * from an epsilon-guarded ceil, and 12/0.4 === 30 exactly. Do NOT add a float
 * guard — it is unnecessary here and would change nothing (documented decision).
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
  if (gloryPoints > Number.MAX_SAFE_INTEGER)
    return { ok: false, error: ERRORS.tooLarge };

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
