import { describe, it, expect } from 'vitest';
import {
  collectNavigations,
  NAVIGATION_STEP_CATEGORY,
  NAVIGATION_STEP_TITLE,
  type NavigationStepLike,
} from '../reporters/nav-timing-reporter';
import {
  navTimings,
  formatNavTimings,
  navTimingVerdict,
} from '../../scripts/test-e2e.mjs';

/**
 * Per-NAVIGATION timings, as opposed to the per-test timings in
 * `e2e-timings.test.ts`.
 *
 * #44's open question is stated in `playwright.config.ts`: the whole-test
 * numbers "bound the problem, they do not separate a slow navigation from a
 * slow test around one". `page.goto: Test timeout of 30000ms exceeded` names
 * the TEST budget, so a navigation that ran 900ms inside a test that ran 29s
 * and one that ran 29s on its own produce the same line. Only the first is a
 * navigation problem, and the two call for opposite fixes.
 *
 * THREE FACTS BELOW WERE MEASURED, NOT ASSUMED (Playwright 1.63.0, probe run
 * 2026-09-10), and each one would have produced a silently empty distribution
 * if guessed:
 *
 * 1. The step is titled `Navigate`, NOT `page.goto`. Matching the API name —
 *    the obvious guess — collects nothing and reports a healthy-looking empty
 *    table.
 * 2. A `goto` inside a plain helper is a TOP-LEVEL step, but one inside
 *    `test.step()` is a CHILD, and one in `beforeEach` is a child of
 *    `Before Hooks`. A shallow scan silently drops both.
 * 3. The built-in `json` reporter — the artefact `scripts/test-e2e.mjs`
 *    already produces — STRIPS every `pw:api` step and keeps only the user's
 *    `test.step` entries, with no `category` field at all. The durations exist
 *    only in the in-memory tree a reporter is handed, which is why this is a
 *    reporter and not another read of that file.
 *
 * The liveness verdict at the bottom is the control for all three. Every one
 * of those mistakes fails the same way — zero records, green run — which is
 * the defect class #79/#84/#87 exist to close, in a fourth medium.
 */

/** A minimal `TestStep`, structurally compatible with Playwright's. */
function step(
  title: string,
  category: string,
  duration: number,
  options: { error?: boolean; steps?: NavigationStepLike[] } = {},
): NavigationStepLike {
  return {
    title,
    category,
    duration,
    error: options.error ? { message: 'timed out' } : undefined,
    steps: options.steps ?? [],
  };
}

const nav = (duration: number, error = false) =>
  step(NAVIGATION_STEP_TITLE, NAVIGATION_STEP_CATEGORY, duration, { error });

describe('collecting navigation steps out of a result tree', () => {
  it('records a top-level navigation', () => {
    expect(collectNavigations([nav(420)])).toEqual([
      { durationMs: 420, errored: false },
    ]);
  });

  it('records a navigation nested inside a test.step', () => {
    const tree = [
      step('a named step', 'test.step', 430, { steps: [nav(425)] }),
    ];
    expect(collectNavigations(tree)).toEqual([
      { durationMs: 425, errored: false },
    ]);
  });

  it('records a navigation made in beforeEach, under Before Hooks', () => {
    const tree = [
      step('Before Hooks', 'hook', 900, {
        steps: [step('Fixture "page"', 'fixture', 800, { steps: [nav(760)] })],
      }),
    ];
    expect(collectNavigations(tree)).toEqual([
      { durationMs: 760, errored: false },
    ]);
  });

  it('ignores a test.step a human happened to title Navigate', () => {
    const tree = [step(NAVIGATION_STEP_TITLE, 'test.step', 99)];
    expect(collectNavigations(tree)).toEqual([]);
  });

  it('ignores the other pw:api steps that surround every navigation', () => {
    const tree = [
      step('Launch browser', NAVIGATION_STEP_CATEGORY, 595),
      step('Create context', NAVIGATION_STEP_CATEGORY, 5),
      step('Create page', NAVIGATION_STEP_CATEGORY, 183),
    ];
    expect(collectNavigations(tree)).toEqual([]);
  });

  it('flags a navigation that errored — the #44 shape', () => {
    expect(collectNavigations([nav(8802, true)])).toEqual([
      { durationMs: 8802, errored: true },
    ]);
  });

  it('finds every navigation in a test that made several', () => {
    const tree = [
      nav(100),
      step('reload and check', 'test.step', 300, { steps: [nav(250)] }),
      nav(120),
    ];
    expect(collectNavigations(tree).map((n) => n.durationMs)).toEqual([
      100, 250, 120,
    ]);
  });
});

describe('summarising navigations per project', () => {
  const records = [
    {
      project: 'mobile-safari',
      file: 'a.spec.ts',
      test: 'one',
      durationMs: 100,
      errored: false,
    },
    {
      project: 'mobile-safari',
      file: 'a.spec.ts',
      test: 'two',
      durationMs: 900,
      errored: false,
    },
    {
      project: 'mobile-safari',
      file: 'a.spec.ts',
      test: 'three',
      durationMs: 500,
      errored: false,
    },
    {
      project: 'chromium',
      file: 'a.spec.ts',
      test: 'one',
      durationMs: 40,
      errored: false,
    },
  ];

  it('groups by project and counts what it saw', () => {
    const rows = navTimings(records);
    expect(rows.map((r) => [r.project, r.count])).toEqual([
      ['mobile-safari', 3],
      ['chromium', 1],
    ]);
  });

  it('reports the tail, because a mean hides the one navigation that stalled', () => {
    const [heaviest] = navTimings(records);
    expect(heaviest.maxMs).toBe(900);
    expect(heaviest.p95Ms).toBe(900);
  });

  it('never invents a duration that no navigation actually took', () => {
    // Nearest-rank, not interpolation. With two samples an interpolated
    // median would report 300ms — a number no navigation spent — and #44 is
    // an argument about specific observed navigations.
    const [only] = navTimings([
      { project: 'p', file: 'f', test: 't', durationMs: 100, errored: false },
      { project: 'p', file: 'f', test: 't', durationMs: 500, errored: false },
    ]);
    expect(only.medianMs).toBe(100);
  });

  it('orders projects by their slowest navigation, worst first', () => {
    expect(navTimings(records).map((r) => r.project)).toEqual([
      'mobile-safari',
      'chromium',
    ]);
  });

  it('names the errored navigations, so a timeout is identifiable', () => {
    const rows = navTimings([
      ...records,
      {
        project: 'mobile-safari',
        file: 'p.spec.ts',
        test: 'reload',
        durationMs: 30000,
        errored: true,
      },
    ]);
    const [heaviest] = rows;
    expect(heaviest.erroredCount).toBe(1);
    expect(heaviest.slowest[0]).toMatchObject({
      test: 'reload',
      durationMs: 30000,
    });
  });

  it('survives a run that recorded nothing rather than dividing by zero', () => {
    expect(navTimings([])).toEqual([]);
  });
});

describe('the liveness verdict — the control on all of the above', () => {
  it('fails a run where tests ran but no navigation was recorded', () => {
    const verdict = navTimingVerdict({ navigations: 0, testsWithResults: 120 });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toMatch(/Navigate/);
  });

  it('passes a run that recorded navigations', () => {
    expect(navTimingVerdict({ navigations: 1, testsWithResults: 1 }).ok).toBe(
      true,
    );
  });

  it('passes a run where no test produced a result at all', () => {
    // `--grep` that matches nothing, or a suite-level failure before any test
    // ran: there is no collector to prove alive, so there is nothing to fail.
    expect(navTimingVerdict({ navigations: 0, testsWithResults: 0 }).ok).toBe(
      true,
    );
  });
});

describe('the printed table', () => {
  it('prints a row per project with its tail', () => {
    const table = formatNavTimings(
      navTimings([
        {
          project: 'mobile-safari',
          file: 'a.spec.ts',
          test: 'one',
          durationMs: 900,
          errored: false,
        },
      ]),
    );
    expect(table).toMatch(/mobile-safari/);
    expect(table).toMatch(/900/);
  });

  it('says so plainly when a run recorded no navigations', () => {
    expect(formatNavTimings([])).toMatch(/no navigations/i);
  });
});
