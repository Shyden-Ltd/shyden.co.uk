import { describe, it, expect } from 'vitest';
import { projectTimings, formatTimings } from '../../scripts/test-e2e.mjs';

/**
 * Where the e2e suite's time actually goes, per project.
 *
 * #44: `build-and-test` failed on a single mobile-safari test that exceeded
 * the 30s budget inside `page.goto`, and passed on a re-run. The issue's first
 * acceptance criterion is explicit that no timeout may be raised before the
 * real numbers are known — a timeout change with no measurement behind it is a
 * guess with a number in it.
 *
 * The numbers were already being thrown away. `scripts/test-e2e.mjs` runs the
 * suite with a json reporter beside the caller's (#36's suite-size guard needs
 * one), reads `stats` out of it and deletes the file. Every duration in every
 * CI run so far has gone into a temp directory and straight in the bin.
 *
 * So this is not new instrumentation, it is keeping what the run already
 * produced. Nothing is added to CI: no artifact upload, no new action to
 * SHA-pin, no third-party reporter. That matters more here than convenience —
 * the supply chain of this pipeline is the thing #39 and #23 exist to keep
 * small.
 *
 * ONE CORRECTION TO THE ISSUE, worth recording because it changes the
 * diagnosis. `playwright.config.ts` sets NO `timeout` and no
 * `navigationTimeout`, so "Test timeout of 30000ms exceeded" is the WHOLE
 * TEST's budget, not a stalled navigation — `page.goto` is merely where the
 * clock ran out. That test takes 775ms locally on mobile-safari. A ~39x gap is
 * not the shape of a tight budget under load, which is what these numbers are
 * collected to settle.
 */

/** A report in the shape Playwright's json reporter actually emits, verified
 *  against a real run rather than assumed from the docs. */
const report = (
  tests: { project: string; title: string; durations: number[] }[],
) => ({
  config: {},
  errors: [],
  stats: { expected: tests.length, unexpected: 0, duration: 1 },
  suites: [
    {
      title: 'a.spec.ts',
      file: 'a.spec.ts',
      specs: tests.map(({ project, title, durations }) => ({
        title,
        tests: [
          {
            projectName: project,
            status: 'expected',
            results: durations.map((duration) => ({
              duration,
              status: 'passed',
            })),
          },
        ],
      })),
    },
  ],
});

describe('per-project e2e timings', () => {
  it('groups by project and counts what ran', () => {
    const rows = projectTimings(
      report([
        { project: 'chromium', title: 'a', durations: [10] },
        { project: 'chromium', title: 'b', durations: [20] },
        { project: 'webkit', title: 'c', durations: [30] },
      ]),
    );
    expect(rows.map((r) => [r.project, r.count])).toEqual([
      ['chromium', 2],
      ['webkit', 1],
    ]);
  });

  it('reports the tail, not the mean — a mean hides the one test that timed out', () => {
    const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 29000];
    const [row] = projectTimings(
      report(
        durations.map((d, i) => ({
          project: 'mobile-safari',
          title: `t${i}`,
          durations: [d],
        })),
      ),
    );
    // Nearest-rank: p50 is the 5th of ten, p90 the 9th.
    expect(row.p50).toBe(500);
    expect(row.p90).toBe(900);
    expect(row.max).toBe(29000);
  });

  it('takes the SLOWEST attempt of a retried test, not the last', () => {
    // A test that times out at 30s and passes at 800ms on retry is the exact
    // case #44 is about. Reporting 800ms would erase the finding.
    const [row] = projectTimings(
      report([{ project: 'webkit', title: 'flaky', durations: [30000, 800] }]),
    );
    expect(row.max).toBe(30000);
  });

  it('names the slowest tests, so a near-timeout is identifiable', () => {
    const rows = projectTimings(
      report([
        { project: 'webkit', title: 'quick', durations: [5] },
        { project: 'webkit', title: 'the slow one', durations: [9000] },
      ]),
    );
    expect(rows[0].slowest[0]).toEqual({ title: 'the slow one', ms: 9000 });
  });

  it('survives a report with no tests rather than dividing by zero', () => {
    expect(projectTimings(report([]))).toEqual([]);
  });

  it('formats a table naming the budget each project is measured against', () => {
    const table = formatTimings(
      projectTimings(
        report([{ project: 'webkit', title: 'x', durations: [1234] }]),
      ),
    );
    expect(table).toContain('webkit');
    expect(table).toContain('1234');
    // The 30000ms default is the thing these numbers are read against; a table
    // without it makes the reader look it up and guess.
    expect(table).toContain('30000');
  });
});
