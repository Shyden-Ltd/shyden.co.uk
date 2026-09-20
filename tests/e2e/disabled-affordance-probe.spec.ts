import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from '@playwright/test';
import { searched } from '../source-files';

/**
 * #250 PROBE -- a measurement instrument, not a guard.
 *
 * The ticket's design hinges on one fact this repo refuses to assume: a
 * browser may suppress pointer events on a `disabled` form control, in which
 * case `cursor: not-allowed` set ON that control is never applied and a
 * `title` hung off it never appears. A CSS rule is not evidence the browser
 * honoured it (#33: a ratio with no threshold passed a green button turning
 * blue), so this renders the real page on all five engines and reports which
 * element actually wins the hit test under the pointer.
 *
 * It asserts only its own liveness. The NUMBERS are the deliverable: they go
 * on the PR and they pick the mechanism. Delete this file once AC7/AC8 have a
 * real guard -- a probe kept past its answer becomes a test nobody reads.
 */

type Probe = {
  readonly label: string;
  readonly tag: string;
  /** Does the pointer at the control's own centre actually land ON it? */
  readonly hitIsSelf: boolean;
  readonly hitLabel: string;
  /** Declared on the control -- may be inert if `hitIsSelf` is false. */
  readonly cursorOnControl: string;
  /** What the USER sees: the cursor of whatever won the hit test. */
  readonly cursorSeen: string;
  readonly pointerEvents: string;
  /** Did a real mouse move deliver `mouseover` to the control? */
  readonly mouseoverOnControl: boolean;
  /** ...or only to an ancestor, which is where a tooltip would have to live? */
  readonly mouseoverOnAncestor: boolean;
};

test.describe('#250 probe: what a disabled control does under a pointer', () => {
  test('measure every disabled control on /classroom-groups', async ({
    page,
  }, testInfo) => {
    await page.goto('/classroom-groups');

    // Disabled controls hide inside collapsed disclosures. Open every one,
    // DERIVED from the DOM (AC1) -- a hand-written list is how this repo
    // shipped 74px of horizontal scroll.
    // The repo's established disclosure selector (classroom-groups-controls
    // .spec.ts): `[aria-controls]` is the half that pairs a toggle to the
    // body it opens. Measured 2026-09-20: `aria-expanded` appears in exactly
    // one component site-wide, so this is the whole population, not a sample.
    const toggles = page.locator('button[aria-expanded][aria-controls]');
    for (let i = 0; i < (await toggles.count()); i += 1) {
      const toggle = toggles.nth(i);
      if ((await toggle.getAttribute('aria-expanded')) === 'false')
        await toggle.click();
    }

    // Tag each disabled control so the browser-side measurement can find the
    // same element the test enumerated, without inventing an id scheme.
    const labels = await page.evaluate(() => {
      const found: string[] = [];
      document.querySelectorAll<HTMLElement>(':disabled').forEach((el, i) => {
        const label = el.id || `${el.tagName.toLowerCase()}#${i}`;
        el.setAttribute('data-probe-250', label);
        found.push(label);
      });
      return found;
    });

    // Liveness. A probe that measured nothing must never read as "no problems
    // found" -- and `searched` counts CONTENT, not entries (#112, #118).
    searched(labels, {
      of: labels,
      what: 'disabled controls on /classroom-groups',
    });

    const results: Probe[] = [];
    for (const label of labels) {
      const control = page.locator(`[data-probe-250="${label}"]`);
      const box = await control.boundingBox();
      if (box === null) continue; // not rendered; nothing to measure

      // Arm listeners BEFORE the pointer moves. A collector read at the wrong
      // moment is this repo's most-repeated flake (#188 and eight siblings).
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
          return {
            label: id,
            tag: el.tagName.toLowerCase(),
            hitIsSelf: hit === el,
            hitLabel: name(hit),
            cursorOnControl: getComputedStyle(el).cursor,
            cursorSeen: hit === null ? '(none)' : getComputedStyle(hit).cursor,
            pointerEvents: getComputedStyle(el).pointerEvents,
            mouseoverOnControl: w.__probeSelf === true,
            mouseoverOnAncestor: w.__probeAncestor === true,
          };
        }, label),
      );
    }

    searched(results, {
      of: results.map((r) => r.label),
      what: 'measured disabled controls',
    });

    const out = join(
      testInfo.project.outputDir,
      'probe-250',
      `${testInfo.project.name}.json`,
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      JSON.stringify(
        {
          engine: testInfo.project.name,
          hasTouch: testInfo.project.use.hasTouch === true,
          results,
        },
        null,
        2,
      ),
      'utf8',
    );

    // Printed so the answer is readable straight off the CI log, not only
    // from an artefact somebody has to download.
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        `[probe-250][${testInfo.project.name}] ${r.label} (${r.tag}) ` +
          `hitIsSelf=${r.hitIsSelf} hit=${r.hitLabel} ` +
          `cursorOnControl=${r.cursorOnControl} cursorSeen=${r.cursorSeen} ` +
          `pointerEvents=${r.pointerEvents} ` +
          `mouseover self=${r.mouseoverOnControl} ancestor=${r.mouseoverOnAncestor}`,
      );
    }
  });
});
