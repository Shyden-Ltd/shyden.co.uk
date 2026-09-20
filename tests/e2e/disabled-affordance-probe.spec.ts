import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { searched } from '../source-files';
import { MAX_ROSTER } from '../../src/lib/roster';
import { addSeveral, openRoster } from './helpers';

/**
 * #250 PROBE -- a measurement instrument, not a guard.
 *
 * The ticket's design hinges on one fact this repo refuses to assume: that a
 * browser suppresses pointer events on a `disabled` form control, in which
 * case `cursor: not-allowed` set ON that control is never applied and a
 * `title` hung off it never appears. A CSS rule is not evidence the browser
 * honoured it (#33: a ratio with no threshold passed a green button turning
 * blue), so this renders the real page on all five engines and reports which
 * element actually wins the hit test under the pointer.
 *
 * It asserts only its own liveness. The NUMBERS are the deliverable: they go
 * on the PR and they pick the mechanism. Delete this file once AC7/AC8 have a
 * real guard -- a probe kept past its answer becomes a test nobody reads.
 *
 * TWO scenarios, because one state is not the population. In the default
 * state only the two sex switches are disabled, both `<input type=checkbox>`.
 * The controls the ticket actually worries about are `<button>`s, and they
 * disable only at `MAX_ROSTER` (roster-ui.ts:330). Measuring the default
 * state alone would have answered a question about checkboxes and reported it
 * as a fact about buttons.
 */

/**
 * `hitRelation` is the field that decides the design:
 *  - `self`       the control IS hit-testable; hover reaches it, and a cursor
 *                 or title set on it applies.
 *  - `ancestor`   the pointer passes THROUGH the disabled control to a parent.
 *                 This is the classic suppressed-pointer-events behaviour, and
 *                 it means a tooltip and cursor must hang off a WRAPPER.
 *  - `unrelated`  something else is over the control (this page has a sticky
 *                 header). The measurement is INVALID, not a finding.
 *  - `none`       the point was outside the viewport. Also INVALID.
 */
type HitRelation = 'self' | 'ancestor' | 'unrelated' | 'none';

type Probe = {
  readonly label: string;
  readonly tag: string;
  readonly hitRelation: HitRelation;
  readonly hitLabel: string;
  /** Declared on the control -- inert unless `hitRelation` is `self`. */
  readonly cursorOnControl: string;
  /** What the USER sees: the cursor of whatever won the hit test. */
  readonly cursorSeen: string;
  readonly pointerEvents: string;
  /** Did a real mouse move deliver `mouseover` to the control? */
  readonly mouseoverOnControl: boolean;
  /** ...or only to an ancestor, which is where a tooltip would have to live? */
  readonly mouseoverOnAncestor: boolean;
  /** Geometry, so an INVALID reading is diagnosable rather than mysterious. */
  readonly rect: string;
  readonly viewport: string;
};

/** Open every disclosure, DERIVED from the DOM (AC1) -- never hand-listed. */
const openEveryDisclosure = async (page: Page) => {
  const toggles = page.locator('button[aria-expanded][aria-controls]');
  for (let i = 0; i < (await toggles.count()); i += 1) {
    const toggle = toggles.nth(i);
    if ((await toggle.getAttribute('aria-expanded')) === 'false') {
      await toggle.click();
    }
  }
};

const measure = async (
  page: Page,
  testInfo: TestInfo,
  scenario: string,
): Promise<void> => {
  // Tag each disabled control so the browser-side measurement finds the same
  // element this enumerated, without inventing an id scheme.
  const labels = await page.evaluate(() => {
    const found: string[] = [];
    document.querySelectorAll<HTMLElement>(':disabled').forEach((el, i) => {
      // The CI log IS the deliverable, so a label must identify its control
      // on its own. `hitLabel` cannot be relied on for that: where the hit
      // relation is `ancestor` it names the PARENT, not this element.
      // The index stays so two controls sharing a class cannot collide.
      const cls =
        typeof el.className === 'string'
          ? el.className.trim().split(/\s+/)[0]
          : '';
      const label =
        el.id || `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}#${i}`;
      el.setAttribute('data-probe-250', label);
      found.push(label);
    });
    return found;
  });

  // Liveness. A probe that measured nothing must never read as "no problems
  // found" -- and `searched` counts CONTENT, not entries (#112, #118).
  searched(labels, { of: labels, what: `disabled controls (${scenario})` });

  const results: Probe[] = [];
  for (const label of labels) {
    const control = page.locator(`[data-probe-250="${label}"]`);
    // `page.mouse.move` does NOT scroll, unlike `hover()`. Without this the
    // pointer lands outside the viewport, `elementFromPoint` returns null,
    // and every field below reads as "hover never reached the control" -- an
    // artefact of the probe, not a fact about disabled controls. `block:
    // 'center'` rather than the default: this page has a STICKY header
    // (Header.astro:49), and a control scrolled to the top sits underneath
    // it, so the header legitimately wins the hit test. Measured on run
    // 35521737392, which reported `hit=a.wordmark` for exactly that reason.
    await control.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const box = await control.boundingBox();
    if (box === null) continue; // not rendered; nothing to measure

    // Arm listeners BEFORE the pointer moves. A collector read at the wrong
    // moment is this repo's most-repeated flake.
    await page.evaluate((id) => {
      const el = document.querySelector<HTMLElement>(
        `[data-probe-250="${id}"]`,
      )!;
      const w = window as unknown as Record<string, boolean>;
      w.__probeSelf = false;
      w.__probeAncestor = false;
      el.addEventListener('mouseover', () => void (w.__probeSelf = true), {
        once: true,
      });
      el.parentElement?.addEventListener(
        'mouseover',
        () => void (w.__probeAncestor = true),
        { once: true },
      );
    }, label);

    // Move away first. Two controls can land on the SAME viewport point after
    // each is centred (`.switches` is a flex COLUMN), and a move to the point
    // the pointer already occupies fires no `mouseover` -- which would read
    // as "hover never reached it".
    await page.mouse.move(0, 0);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    results.push(
      await page.evaluate((id) => {
        const el = document.querySelector<HTMLElement>(
          `[data-probe-250="${id}"]`,
        )!;
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        const name = (n: Element | null) =>
          n === null
            ? '(none)'
            : `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${
                n.className && typeof n.className === 'string'
                  ? `.${n.className.trim().split(/\s+/).join('.')}`
                  : ''
              }`;
        const w = window as unknown as Record<string, boolean>;
        // `contains` is reflexive, so identity is tested FIRST. An ancestor
        // hit is the signature of a control the browser refuses to hit-test:
        // the pointer falls THROUGH it to the label or wrapper around it,
        // which is where a tooltip and cursor would have to live.
        const relation =
          hit === null
            ? 'none'
            : hit === el
              ? 'self'
              : hit.contains(el)
                ? 'ancestor'
                : 'unrelated';
        return {
          label: id,
          tag: el.tagName.toLowerCase(),
          hitRelation: relation,
          hitLabel: name(hit),
          cursorOnControl: getComputedStyle(el).cursor,
          cursorSeen: hit === null ? '(none)' : getComputedStyle(hit).cursor,
          pointerEvents: getComputedStyle(el).pointerEvents,
          mouseoverOnControl: w.__probeSelf === true,
          mouseoverOnAncestor: w.__probeAncestor === true,
          rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(
            r.width,
          )}x${Math.round(r.height)}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        };
      }, label),
    );
  }

  searched(results, {
    of: results.map((r) => r.label),
    what: `measured disabled controls (${scenario})`,
  });

  const engine = testInfo.project.name;
  const out = join(
    testInfo.project.outputDir,
    'probe-250',
    `${engine}-${scenario}.json`,
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        engine,
        scenario,
        hasTouch: testInfo.project.use.hasTouch === true,
        results,
      },
      null,
      2,
    ),
    'utf8',
  );

  // Printed so the answer is readable straight off the CI log, not only from
  // an artefact somebody has to download.
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(
      `[probe-250][${engine}][${scenario}] ${r.label} (${r.tag}) ` +
        `hitRelation=${r.hitRelation} hit=${r.hitLabel} ` +
        `cursorOnControl=${r.cursorOnControl} cursorSeen=${r.cursorSeen} ` +
        `pointerEvents=${r.pointerEvents} ` +
        `mouseover self=${r.mouseoverOnControl} ancestor=${r.mouseoverOnAncestor} ` +
        `rect=${r.rect} viewport=${r.viewport}`,
    );
  }
};

test.describe('#250 probe: what a disabled control does under a pointer', () => {
  test('default state — the two sex switches', async ({ page }, testInfo) => {
    await page.goto('/classroom-groups');
    await openEveryDisclosure(page);
    await measure(page, testInfo, 'default');
  });

  test('roster at the limit — the add buttons', async ({ page }, testInfo) => {
    await openRoster(page);
    // `openRoster` already added one, so this lands exactly ON the limit
    // rather than asking the page to clamp an overshoot.
    await addSeveral(page, MAX_ROSTER - 1);
    await openEveryDisclosure(page);
    await measure(page, testInfo, 'at-limit');
  });
});
