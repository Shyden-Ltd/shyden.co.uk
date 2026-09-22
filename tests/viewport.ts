import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The page-level horizontal-overflow measurement, in one place (#277).
 *
 * It had TWENTY-ONE copies across twelve spec files in three suites
 * (`tests/e2e/`, `tests/prod/`, and the same shape again in the iOS journey
 * corpus, which cannot import this and is left alone). The duplication scan
 * flagged eleven of those twenty-one: the rest sit under its 120-character
 * floor or below its 0.85 ratio, which is the working agreement's own lesson
 * running once more -- "a hand-written list of things to check will miss the
 * one that breaks". The population here was DERIVED, by grepping every
 * `documentElement.scrollWidth` in `tests/`, not taken from the ticket.
 *
 * The copies had already drifted in the one place a reader looks when a test
 * goes red: sixteen asserted with no message at all, three named the page,
 * one named the page and the width, and only `prod-sanity.spec.ts` printed
 * the measured overflow. A failure reading `expected 34.5 to be less than or
 * equal to 0` names the symptom and not the page, which is a twenty-minute
 * diagnosis for a one-second fact. Every caller now gets the number.
 *
 * NOT CONTAINMENT. `document.documentElement` answers "does the PAGE scroll
 * sideways", and content can overflow a card by 34.5px while the document
 * stays still -- which is exactly how the Remove button shipped hanging out
 * of the Student details border at every laptop width. A claim about an
 * element inside the page is measured against that element's own container;
 * see 'nothing in the roster escapes its card'.
 */

/**
 * How many pixels the document scrolls sideways. Zero or less is healthy; a
 * fractional positive value is a real overflow, not a rounding artefact.
 *
 * Exported beside the assertion because two callers in
 * `classroom-groups-controls.spec.ts` measure every disclosure section in a
 * loop and COLLECT the failures, so that one red names all of them rather
 * than stopping at the first. They need the number, not a verdict.
 */
export const horizontalOverflow = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

/**
 * Assert the document does not scroll sideways.
 *
 * `note` says which page and which state, since the test name is not in the
 * assertion's own message; the measured overflow is appended for you.
 * Omitted, the page's URL stands in -- which is right for a test whose title
 * already carries the state.
 *
 * Returns what it measured, because three callers put that number in an
 * evidence-page caption. The alternative -- assert here, measure again for
 * the caption -- is two reads of a live page that can disagree, and a
 * caption that disagrees with the guard beside it is worse than no caption.
 */
export const expectNoHorizontalScroll = async (
  page: Page,
  note?: string,
): Promise<number> => {
  const overflow = await horizontalOverflow(page);
  expect(
    overflow,
    `${note ?? page.url()} scrolls sideways by ${overflow}px`,
  ).toBeLessThanOrEqual(0);
  return overflow;
};

/**
 * A control is at least 44x44 CSS pixels -- the working agreement's touch
 * target floor, and WCAG 2.2 SC 2.5.8's.
 *
 * Two byte-identical copies before #277 (`chrome.spec.ts` and
 * `glory-points.spec.ts`), and a THIRD in `homepage.spec.ts` that stays where
 * it is on purpose: it sits inline inside a `.all()` loop because the
 * unproved-loop scanner in `event-collectors.test.ts` matches that exact
 * shape, and hoisting it out would make the loop invisible to a guard that
 * would then silently stop asking for a liveness proof. Its comment says so;
 * this is the cross-reference.
 *
 * Nine further sites assert the height alone, unrounded. That is a WEAKER
 * claim, not this one -- a 20px-wide button passes it -- so they are left
 * alone here rather than quietly widened, which would be a coverage change
 * wearing a refactor's clothes.
 */
export const atLeast44 = async (locator: Locator): Promise<void> => {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  // Round to the nearest device pixel: engines can report a sub-pixel value
  // like 43.9999 for a declared `min-height: 44px` (fixed-point layout math).
  expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
  expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
};
