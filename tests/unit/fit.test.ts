import { describe, it, expect } from 'vitest';
import { fitScale, fontThatFits } from '../../src/lib/fit';

/**
 * Stage 5, Task 4. Z-07, Z-08, Z-09.
 *
 * Pure, because the FLOOR is the entire point and a measured loop cannot be
 * tested without pulling it out: the projector's own sizing is a
 * measure-adjust-remeasure cycle against a real box, and none of the
 * decisions inside it are observable from outside.
 */
describe('fitScale', () => {
  it('does not enlarge when it already fits', () => {
    expect(fitScale(1000, 500, 24, 40)).toEqual({ scale: 1, scrolls: false });
  });

  // The plan's own snippet asserted `fitScale(500, 1000, 24, 40)` gives
  // `{ scale: 0.5, scrolls: false }`. It cannot: with base 40 and floor 24
  // the smallest allowed scale is 0.6, and 0.5 is below it -- exactly as
  // 0.2 is in the next case, which the SAME snippet expects to be clamped.
  // The two cannot both hold under any one rule, and the floor is the point
  // of the function, so the floor wins. Found by running, not by reading.
  //
  // Restated with a floor the shrink actually clears: base 40, floor 16 ->
  // smallest allowed 0.4, and 0.5 is a real fit.
  it('shrinks to fit', () => {
    expect(fitScale(500, 1000, 16, 40)).toEqual({ scale: 0.5, scrolls: false });
  });

  // …and the plan's own numbers, with the answer the floor rule actually
  // gives, kept so the contradiction stays recorded rather than edited away.
  it('clamps a shrink that would go under the floor', () => {
    expect(fitScale(500, 1000, 24, 40)).toEqual({ scale: 0.6, scrolls: true });
  });

  it('stops at the floor and scrolls instead', () => {
    // base 40px, floor 24px -> the smallest allowed scale is 0.6
    expect(fitScale(200, 1000, 24, 40)).toEqual({ scale: 0.6, scrolls: true });
  });

  it('lands exactly on the floor without scrolling when that is enough', () => {
    expect(fitScale(600, 1000, 24, 40)).toEqual({ scale: 0.6, scrolls: false });
  });

  // `available` comes from a measured DOM box. A board mounted while hidden
  // measures 0, and a scale of 0 makes the whole projection vanish with
  // nothing on screen to explain it.
  it('never returns a scale of zero or less, whatever it is given', () => {
    for (const available of [0, -1, NaN]) {
      const { scale } = fitScale(available, 1000, 24, 40);
      expect(scale, String(available)).toBeGreaterThanOrEqual(0.6);
    }
  });

  // The same hazard on the other measurement. `needed` is measured too, and
  // a content box that has not laid out yet reads 0 -- dividing by it gives
  // Infinity, which would then be clamped to 1 by luck rather than by rule.
  it('treats an unmeasurable content size as already fitting', () => {
    for (const needed of [0, -1, NaN]) {
      expect(fitScale(1000, needed, 24, 40), String(needed)).toEqual({
        scale: 1,
        scrolls: false,
      });
    }
  });

  // A floor above the base would mean "never shrink at all", which is a
  // legitimate configuration (a board where nothing may be smaller than it
  // is drawn) and must not invert into a scale above 1.
  it('never enlarges, even when the floor is above the base', () => {
    const { scale, scrolls } = fitScale(200, 1000, 48, 40);
    expect(scale).toBe(1);
    expect(scrolls).toBe(true);
  });

  // `scrolls` is the whole reason this returns an object rather than a
  // number: the caller has to know whether it must ALSO offer a way to
  // reach what did not fit. Pinned at the boundary in both directions, one
  // pixel apart, so an off-by-one in the comparison cannot survive.
  it('reports scrolling exactly at the boundary, not near it', () => {
    expect(fitScale(600, 1000, 24, 40).scrolls).toBe(false);
    expect(fitScale(599, 1000, 24, 40).scrolls).toBe(true);
  });

  it('does not scroll when it fits at full size, boundary included', () => {
    expect(fitScale(1000, 1000, 24, 40)).toEqual({ scale: 1, scrolls: false });
  });
});

/**
 * The CORRECTION, and why one ratio nudge is not enough (#189).
 *
 * The board's grid tracks are `em`, so shrinking the type narrows the columns
 * and changes how many cards sit on a row: height is not proportional to the
 * font, it is `a * font + C` within a column regime, and `C` is every `rem`
 * and `px` part that does not shrink at all. Correcting by the measured ratio
 * `available / height` therefore converges on the answer instead of reaching
 * it -- measured on the real page, a class of eight in pairs wanted 0.955,
 * was corrected from 38.2px to 37.8px, and STILL did not fit.
 *
 * The projector already holds two real readings by the time it needs to
 * correct -- the sheet at the base font and the sheet at the applied one --
 * and two points define the line. So the correction is solved rather than
 * approached, for no extra measuring.
 *
 * Every case below is arithmetic done by hand from the inputs, never from the
 * implementation: a value checked against the constant it was computed from
 * would hold at any level.
 */
describe('fontThatFits', () => {
  // a = (688 - 665) / (40 - 38.2) = 12.7778 px of sheet per px of font
  // C = 688 - 40a = 176.8889 px that never shrink
  // (657 - C) / a = 37.5739
  const atBase = { font: 40, height: 688 };
  const atApplied = { font: 38.2, height: 665 };

  it('solves the line through two real readings', () => {
    expect(fontThatFits(657, atBase, atApplied, 24)).toBeCloseTo(37.5739, 3);
  });

  it('never enlarges past the font already applied', () => {
    // The sheet fits with room to spare, so the line solves ABOVE the applied
    // font. Growing there would undo a shrink the first pass decided on.
    expect(fontThatFits(2000, atBase, atApplied, 24)).toBe(38.2);
  });

  it('never goes below the readable floor', () => {
    expect(fontThatFits(10, atBase, atApplied, 24)).toBe(24);
  });

  it('returns the applied font when the sheet already fits', () => {
    expect(fontThatFits(700, atBase, atApplied, 24)).toBe(38.2);
  });

  // The fallbacks. Each is a line that cannot be solved, and each resolves to
  // the ratio correction -- 38.2 * 657 / 665 = 37.7405 -- rather than to a
  // NaN, an Infinity, or a font of zero in front of a class.
  it('falls back to the ratio when both readings share a font', () => {
    expect(fontThatFits(657, atApplied, atApplied, 24)).toBeCloseTo(37.7405, 3);
  });

  it('falls back to the ratio when the sheet did not move', () => {
    expect(
      fontThatFits(657, { font: 40, height: 665 }, atApplied, 24),
    ).toBeCloseTo(37.7405, 3);
  });

  it('falls back to the ratio when the sheet GREW as the font shrank', () => {
    // A real possibility, not a defensive flourish: crossing a column-count
    // boundary can add a row. The line then slopes the wrong way and solving
    // it would ENLARGE the font to make the sheet smaller.
    expect(
      fontThatFits(657, { font: 40, height: 600 }, atApplied, 24),
    ).toBeCloseTo(37.7405, 3);
  });

  it('never returns a font of zero or NaN, whatever it is given', () => {
    for (const answer of [
      fontThatFits(NaN, atBase, atApplied, 24),
      fontThatFits(657, { font: NaN, height: NaN }, atApplied, 24),
      fontThatFits(657, atBase, { font: 0, height: 0 }, 24),
      fontThatFits(0, atBase, atApplied, 24),
      fontThatFits(-100, atBase, atApplied, 24),
    ]) {
      expect(Number.isFinite(answer)).toBe(true);
      expect(answer).toBeGreaterThan(0);
    }
  });
});
