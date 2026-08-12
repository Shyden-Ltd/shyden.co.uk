/**
 * How much to shrink the projected sheet so it fits the board — and whether
 * it still will not, so the caller knows it must offer a way to reach what
 * did not.
 *
 * PURE, and that is the whole point. The projector's own sizing is a
 * measure-adjust-remeasure cycle against a real box: none of the decisions
 * inside it are observable from outside, so the one decision that matters --
 * the FLOOR, below which text stops being readable from the back of a
 * room -- would be untestable if it lived in there with them.
 *
 * Returns an object rather than a number because `scrolls` is a separate
 * fact the caller has to act on: a sheet that has been shrunk to the floor
 * and STILL does not fit needs a scrollbar, and one that fits does not.
 *
 * Every input can arrive NaN or zero. Both sizes come from measured DOM
 * boxes, and an element measured before layout, or while its ancestor is
 * hidden, reads 0 — which is exactly the state a board mounted off-screen
 * is in. A scale of 0 makes the whole projection vanish with nothing on
 * screen to explain it, so the guards below are the difference between a
 * readable fallback and a blank wall in front of a class.
 */
export function fitScale(
  available: number,
  needed: number,
  floor: number,
  base: number,
): { scale: number; scrolls: boolean } {
  // The smallest scale that still leaves text at the readable floor. Capped
  // at 1 because a floor ABOVE the base means "never shrink at all" -- a
  // legitimate setting for a board where nothing may be smaller than it is
  // drawn, and one that must not invert into ENLARGING the sheet.
  const minScale = Math.min(1, usable(floor) / usable(base));

  // An unmeasurable content size is treated as already fitting rather than
  // divided by: `needed = 0` gives Infinity, which would then land on 1 by
  // luck rather than by rule, and a rule nobody wrote is a rule nobody can
  // rely on.
  if (!Number.isFinite(needed) || needed <= 0) {
    return { scale: 1, scrolls: false };
  }
  if (!Number.isFinite(available) || available <= 0) {
    return { scale: minScale, scrolls: true };
  }

  const wanted = available / needed;
  if (wanted >= 1) return { scale: 1, scrolls: false };
  // Below the floor, the sheet stays AT the floor and scrolls. Readable and
  // reachable beats fitted and illegible: a class cannot read what does not
  // fit on the board either way, but they can read what scrolls.
  if (wanted < minScale) return { scale: minScale, scrolls: true };
  return { scale: wanted, scrolls: false };
}

/** A size that can actually be divided by. Anything else is 1. */
const usable = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 1;
