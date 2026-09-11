import { test, expect } from './fixtures';

/**
 * Every control's colour comes from the palette, not from the browser.
 *
 * Two live defects found this, both invisible in source review and both
 * measured on the RENDERED page:
 *
 *  - `#glory-input` declared a border and no fill, so the UA's dark-mode
 *    default applied — rgb(59 59 59), a light grey box on a --surface card,
 *    while the same control on /classroom-groups sat on --bg.
 *  - `accent-color` was `auto` site-wide, so the selected radio on
 *    /classroom-groups was drawn in the browser's blue: the one brand colour
 *    on the page that was not ours.
 *
 * `color-scheme: dark` is what makes this class hide. It fixes a control's
 * GROUND, so nothing looks obviously broken, while saying nothing about the
 * fill — the control looks plausible and is off-palette.
 *
 * The allowed set is DERIVED from the custom properties the page actually
 * serves, read off :root at runtime, so it cannot fall behind a token that is
 * added, renamed or retuned. Comparison is in computed rgb: the browser
 * resolves both sides, so `#04070d` and `rgb(4 7 13)` are the same value here
 * and no parsing of ours can disagree with the renderer.
 *
 * Checkboxes, radios and file inputs are excluded from the FILL check on
 * purpose: the UA draws them, and their background is legitimately
 * transparent. `accent-color` is what governs those, and it is asserted
 * separately below.
 */
const PAGES = ['/', '/glory-points', '/classroom-groups', '/id/glory-points'];

/** Controls the page paints itself, as opposed to the ones the UA draws. */
const PAINTED =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea';

type Reading = {
  what: string;
  background: string;
  color: string;
};

for (const path of PAGES) {
  test(`${path}: every control it paints uses a palette colour`, async ({
    page,
  }) => {
    await page.goto(path);

    const { allowed, readings } = await page.evaluate((selector) => {
      // Resolve a declared value the way the renderer does, so the comparison
      // cannot disagree with what is actually on screen.
      const probe = document.createElement('span');
      probe.style.display = 'none';
      document.body.append(probe);
      const computed = (value: string): string => {
        probe.style.color = '';
        probe.style.color = value;
        return getComputedStyle(probe).color;
      };

      const root = getComputedStyle(document.documentElement);
      const names = Array.from(document.styleSheets)
        .flatMap((sheet) => {
          try {
            return Array.from(sheet.cssRules);
          } catch {
            return []; // a cross-origin sheet; none of ours are
          }
        })
        .flatMap((rule) =>
          rule instanceof CSSStyleRule ? Array.from(rule.style) : [],
        )
        .filter((property) => property.startsWith('--'));

      const palette = new Set<string>(['rgba(0, 0, 0, 0)']);
      for (const name of new Set(names)) {
        const value = root.getPropertyValue(name).trim();
        if (value) palette.add(computed(value));
      }
      probe.remove();

      return {
        allowed: [...palette],
        readings: [...document.querySelectorAll(selector)].map((el) => {
          const style = getComputedStyle(el);
          return {
            what: `${el.tagName.toLowerCase()}#${el.id || '(no id)'}`,
            background: style.backgroundColor,
            color: style.color,
          };
        }),
      };
    }, PAINTED);

    // Liveness. A page with no controls would pass the loop below having
    // measured nothing, and three of these four pages carry controls.
    if (path === '/') {
      expect(readings, 'the homepage paints no form controls').toHaveLength(0);
      return;
    }
    expect(
      readings.length,
      `${path} rendered no controls — the selector or the page changed`,
    ).toBeGreaterThan(0);

    const offPalette = (readings as Reading[])
      .flatMap((r) => [
        { ...r, role: 'background', value: r.background },
        { ...r, role: 'color', value: r.color },
      ])
      .filter((r) => !allowed.includes(r.value))
      .map((r) => `${r.what} ${r.role}=${r.value}`);

    expect(
      offPalette,
      `off-palette control colours on ${path}; the palette resolved to ${allowed.length} values`,
    ).toEqual([]);
  });
}

test('the controls the browser draws use the brand accent', async ({
  page,
}) => {
  await page.goto('/classroom-groups');
  const boxes = page.locator('input[type="checkbox"], input[type="radio"]');
  // Liveness: an empty list and a correct one both report zero offenders.
  // Written as a locator assertion rather than `expect(await boxes.count())`
  // because that is the form tests/unit/event-collectors.test.ts recognises,
  // and a proof a guard cannot see is not a proof.
  await expect(boxes.first()).toBeVisible();

  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim(),
  );
  const resolved = await page.evaluate((value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  }, accent);

  for (const box of await boxes.all()) {
    await expect(box).toHaveCSS('accent-color', resolved);
  }
});
