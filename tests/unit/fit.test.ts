import { describe, it, expect } from 'vitest';
import { fitScale } from '../../src/lib/fit';

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
