import { test, expect } from './fixtures';
import { searched } from '../source-files';

/**
 * What comes off the printer has to be readable.
 *
 * The Aurora palette made `--ink` near-white. The classroom print stylesheet
 * forces backgrounds transparent — correctly, so a dark page does not print as
 * a slab of toner — and never reset the ink, because on the old light ground
 * it never had to. Measured under emulated print media, every element on
 * /classroom-groups computed to rgb(234 242 255) on white paper: a teacher
 * would have printed a BLANK sheet of groups.
 *
 * No existing guard could see it. The screen palette was correct and fully
 * asserted; the unit contrast suite reads tokens.css's `:root`, which is the
 * SCREEN block; and a screenshot is taken in screen media. The defect lives
 * only in a medium nothing rendered.
 *
 * Measured against WHITE and nothing else. Paper is white, whatever the page
 * declares, and `print-color-adjust` is honoured inconsistently — so a guard
 * that judged the ink against the page's own background would confirm a
 * legible pair that never reaches the sheet.
 */
const PAPER: [number, number, number] = [255, 255, 255];
const BODY_TEXT = 4.5;

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: [number, number, number]): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (
  a: [number, number, number],
  b: [number, number, number],
): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** `rgb(r, g, b)` / `rgba(r, g, b, a)` as the browser always reports it. */
const parse = (value: string): [number, number, number] | null => {
  const m = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/**
 * Distinct ink colours of elements that actually carry text, with one sample
 * element named per colour so a failure says WHERE.
 *
 * Own text only: an ancestor inherits nothing readable of its own, and
 * counting it would report the same colour from <html> on every page.
 */
const inkInUse = async (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const seen = new Map<string, string>();
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const ownText = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim(),
      );
      if (!ownText) continue;
      // Client rects, NOT the element's own computed display. `display: none`
      // on an ANCESTOR leaves a descendant's own computed display untouched,
      // so a per-element check reported the marquee's span as rendered after
      // the band itself had been hidden — a bug in this guard that read as a
      // bug in the page. An off-screen element still has rects, so a skip
      // link positioned out of view is correctly still measured.
      if (el.getClientRects().length === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden') continue;
      const colour = style.color;
      if (!seen.has(colour)) {
        seen.set(
          colour,
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}: ${(el.textContent ?? '').trim().slice(0, 30)}`,
        );
      }
    }
    return [...seen].map(([colour, where]) => ({ colour, where }));
  });

for (const { path, prepare } of [
  { path: '/', prepare: async () => {} },
  { path: '/glory-points', prepare: async () => {} },
  {
    path: '/classroom-groups',
    // The sheet a teacher actually prints has groups on it. Without this the
    // guard measures the empty form and never sees the results at all.
    prepare: async (page: import('@playwright/test').Page) => {
      await page.click('#cg-go');
      await expect(page.locator('#cg-results .group').first()).toBeVisible();
    },
  },
]) {
  test(`${path}: every printed ink is readable on white paper`, async ({
    page,
  }) => {
    await page.goto(path);
    await prepare(page);

    await page.emulateMedia({ media: 'print' });
    const inks = await inkInUse(page);

    // Liveness: a page whose text all sat inside ancestors, or a selector that
    // stopped matching, reports zero offenders exactly like a correct page.
    expect(
      inks.length,
      `${path} rendered no text under print media — the guard measured nothing`,
    ).toBeGreaterThan(0);

    const illegible = inks
      .map(({ colour, where }) => ({ colour, where, rgb: parse(colour) }))
      .filter(({ rgb }) => rgb === null || ratio(rgb, PAPER) < BODY_TEXT)
      .map(
        ({ colour, where, rgb }) =>
          `${where} — ${colour} is ${rgb ? ratio(rgb, PAPER).toFixed(2) : '?'}:1 on white`,
      );

    expect(
      searched(illegible, { of: inks, what: `distinct inks on ${path}` }),
      `${path}: ink that will not survive the printer`,
    ).toEqual([]);
  });
}

test('the screen palette is not dragged down with the print one', async ({
  page,
}) => {
  // The inverse. Fixing print by blackening the ink everywhere would pass
  // every assertion above and ruin the site, so pin that screen still gets
  // Aurora's near-white ink on its dark ground.
  await page.goto('/classroom-groups');
  await expect(page.locator('h1')).toHaveCSS('color', 'rgb(234, 242, 255)');
});
