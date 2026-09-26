import { REVIEW_DATA_ID } from '../scripts/build-evidence-page.mjs';

/**
 * The review data an evidence page hands its own script (#205), read the way
 * the page reads it. One home for the unit suite and the browser specs, which
 * cannot share a module that imports Playwright's runner.
 */

/** One capture the viewer steps through, as the rendered page carries it. */
export interface ReviewItem {
  key: string;
  kind: 'screenshot' | 'recording';
  journey: string;
  journeyTitle: string;
  assertion: number | null;
  label: string;
  engine: string;
  filename: string;
  src?: string;
}

/** The review data exactly as the rendered page hands it to its own script. */
export const reviewOf = (
  html: string,
): { signoffKey: string; items: ReviewItem[] } => {
  const open = `<script type="application/json" id="${REVIEW_DATA_ID}">`;
  const start = html.indexOf(open);
  // Refused rather than read as no items: a page with nothing to review
  // would make every assertion over its items pass for free.
  if (start < 0) throw new Error('the page carries no review data block');
  const end = html.indexOf('</script>', start);
  return JSON.parse(html.slice(start + open.length, end));
};

export const itemsOf = (html: string): ReviewItem[] => reviewOf(html).items;
