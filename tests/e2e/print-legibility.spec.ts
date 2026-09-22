import { test, expect } from './fixtures';
import { searched } from '../source-files';
import { contrast, over, parseColour, type RGB } from '../wcag';
import { recorded, shoot } from './evidence';

test.use(recorded);

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
const PAPER: RGB = [255, 255, 255];
const BODY_TEXT = 4.5;

/**
 * Composited onto the paper before it is judged.
 *
 * The old local `parse` here read the first three numbers and dropped any
 * alpha, so `rgba(0, 0, 0, 0.1)` was measured as pure black — 21:1, when
 * what reaches the sheet is barely a grey. `parseColour` returns the alpha
 * and `over` puts it on the paper first, which is what the printer does.
 */
const inkOnPaper = (colour: string): RGB | null => {
  const parsed = parseColour(colour);
  return parsed === null ? null : over(parsed, PAPER);
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
    // Captured while print media is still emulated, which is the whole point:
    // this image is the sheet, not the screen. A blank one here IS the defect.
    await shoot(
      page,
      `${path} under print media: ${inks.length} inks measured`,
    );

    const illegible = inks
      .map(({ colour, where }) => ({ colour, where, rgb: inkOnPaper(colour) }))
      .filter(({ rgb }) => rgb === null || contrast(rgb, PAPER) < BODY_TEXT)
      .map(
        ({ colour, where, rgb }) =>
          `${where} — ${colour} is ${rgb ? contrast(rgb, PAPER).toFixed(2) : '?'}:1 on white`,
      );

    expect(
      searched(illegible, { of: inks, what: `distinct inks on ${path}` }),
      `${path}: ink that will not survive the printer`,
    ).toEqual([]);
    await shoot(
      page,
      `${path}: all ${inks.length} inks clear ${BODY_TEXT}:1 on white paper`,
    );
  });
}

test('a disabled control never depends on its fill reaching paper', async ({
  page,
}) => {
  // #250 AC5. `--disabled-fill` is what makes a disabled control read as
  // disabled on screen, and a fill only reaches the sheet if the reader has
  // turned "Background graphics" ON — which browsers leave OFF. A control
  // whose legibility depended on it would print as text with no boundary, the
  // same defect the `.btn, button` rule in tokens.css's print block already
  // exists for.
  await page.goto('/classroom-groups');

  const resolve = (name: string) =>
    page.evaluate((property) => {
      const probe = document.createElement('span');
      probe.style.background = getComputedStyle(document.documentElement)
        .getPropertyValue(property)
        .trim();
      document.body.append(probe);
      const rgb = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return rgb;
    }, name);

  // Read on SCREEN first: this is the value that must not survive the switch.
  const onScreen = await resolve('--disabled-fill');
  expect(onScreen).not.toBe('rgba(0, 0, 0, 0)');

  await page.emulateMedia({ media: 'print' });
  expect(await resolve('--disabled-fill')).toBe('rgba(0, 0, 0, 0)');

  // ...and derived, over everything the sheet actually renders, because a
  // token redefined at `:root` proves nothing about a component that hard-
  // coded the same grey somewhere else.
  const painted = await page.evaluate((grey) => {
    const found: string[] = [];
    let rendered = 0;
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      // Client rects, not the element's own computed display: `display: none`
      // on an ANCESTOR leaves a descendant's computed display untouched.
      if (el.getClientRects().length === 0) continue;
      rendered += 1;
      if (getComputedStyle(el).backgroundColor === grey) {
        found.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`);
      }
    }
    return { found, rendered };
  }, onScreen);

  expect(
    searched(painted.found, {
      of: painted.rendered,
      what: 'elements rendered under print media',
    }),
    `the screen disabled grey ${onScreen} reached the sheet`,
  ).toEqual([]);
  await shoot(
    page,
    `under print media --disabled-fill is transparent and none of ${painted.rendered} rendered elements paint ${onScreen}`,
  );
});

test('the screen palette is not dragged down with the print one', async ({
  page,
}) => {
  // The inverse. Fixing print by blackening the ink everywhere would pass
  // every assertion above and ruin the site, so pin that screen still gets
  // Aurora's near-white ink on its dark ground.
  await page.goto('/classroom-groups');
  await expect(page.locator('h1')).toHaveCSS('color', 'rgb(234, 242, 255)');
  await shoot(
    page,
    'on screen the heading keeps Aurora ink rgb(234, 242, 255)',
    page.locator('h1'),
  );
});
