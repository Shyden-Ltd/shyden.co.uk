import { describe, expect, it } from 'vitest';
import { slugOf } from '../../scripts/build-evidence-page.mjs';
import { changeMapOf, renderChangeMap } from '../../scripts/release-map.mjs';

const BASE = 'b'.repeat(40);
const entry = (
  sha: string,
  visitorFacing: boolean,
  areas = ['src'],
  subject = `commit ${sha}`,
) => ({
  sha: sha.repeat(40).slice(0, 40),
  subject,
  pr: 1,
  ticket: 2,
  files: [],
  visitorFacing,
  areas,
});
const A = entry('a', true);
const C = entry('c', true, ['src'], 'feat: <img src=x onerror=alert(1)>');
const D = entry('d', true);
const T = entry('e', false, ['tests', '.github']);
const U = entry('f', false, ['tests']);
const inventory = { base: BASE, entries: [A, C, D, T, U] };

const JOURNEY = 'a describe > a journey';
const SKIPPY = 'a describe > mobile only';
const release = (entries: Record<string, unknown>) => ({
  base: BASE,
  headline: 'h',
  lede: 'l',
  signoff: {},
  gapGroup: 'g',
  checks: [],
  entries,
});
const ALL = {
  [A.sha]: { kind: 'visible', journeys: [JOURNEY] },
  [C.sha]: { kind: 'gap', check: 'try it by hand' },
  [D.sha]: { kind: 'none', reason: 'a refactor' },
};
const journeys = new Set([JOURNEY, SKIPPY]);
const passing = new Map([
  [JOURNEY, ['passed', 'passed', 'passed', 'passed', 'passed']],
  [SKIPPY, ['passed', 'skipped', 'skipped', 'passed', 'passed']],
]);
const map = (
  entries: Record<string, unknown>,
  statuses: ReadonlyMap<string, readonly string[]> | null = passing,
) => changeMapOf({ inventory, release: release(entries), journeys, statuses });

describe('the change map (#362)', () => {
  it('has one row per visitor-facing commit, in release order', () => {
    expect(map(ALL).rows.map((r) => r.entry.sha)).toEqual([
      A.sha,
      C.sha,
      D.sha,
    ]);
  });

  it.each([
    [
      'a release for another base',
      { ...ALL },
      (r: ReturnType<typeof release>) => ({ ...r, base: 'x'.repeat(40) }),
      /is for x+, the inventory starts at b+/,
    ],
    [
      'an unclassified commit',
      { [A.sha]: ALL[A.sha], [C.sha]: ALL[C.sha] },
      null,
      /d{40} .* is unclassified/,
    ],
    [
      'a stale classification',
      { ...ALL, [T.sha]: { kind: 'none', reason: 'x' } },
      null,
      /e{40} is classified but is not a visitor-facing commit/,
    ],
    [
      'a visible change citing nothing',
      { ...ALL, [A.sha]: { kind: 'visible', journeys: [] } },
      null,
      /a{40} is visible but cites no journey/,
    ],
    [
      'an unknown journey',
      {
        ...ALL,
        [A.sha]: { kind: 'visible', journeys: ['a describe > a jorney'] },
      },
      null,
      /"a describe > a jorney", cited by a{40}, is not a journey/,
    ],
    [
      'a reasonless none',
      { ...ALL, [D.sha]: { kind: 'none', reason: ' ' } },
      null,
      /d{40} .* gives no reason/,
    ],
    [
      'an empty gap',
      { ...ALL, [C.sha]: { kind: 'gap', check: '' } },
      null,
      /c{40} .* says nothing to check/,
    ],
    [
      'an unknown kind',
      { ...ALL, [D.sha]: { kind: 'visble', journeys: [JOURNEY] } },
      null,
      /d{40} .* kind "visble"/,
    ],
  ])('refuses %s', (_, entries, reshape, message) => {
    const r = release(entries);
    expect(() =>
      changeMapOf({
        inventory,
        release: reshape ? reshape(r) : r,
        journeys,
        statuses: passing,
      }),
    ).toThrow(message);
  });

  it('flags a journey that failed on any engine, and one that passed on none', () => {
    const failed = new Map(passing).set(JOURNEY, [
      'passed',
      'failed',
      'passed',
      'passed',
      'passed',
    ]);
    expect(map(ALL, failed).rows[0]?.flagged).toBe(true);
    const skippedEverywhere = new Map(passing).set(JOURNEY, [
      'skipped',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
    ]);
    expect(map(ALL, skippedEverywhere).rows[0]?.flagged).toBe(true);
  });

  it('does not flag a journey skipped on an engine by design', () => {
    const cites = { ...ALL, [A.sha]: { kind: 'visible', journeys: [SKIPPY] } };
    expect(map(cites).rows[0]?.flagged).toBe(false);
  });

  it('computes no flag from a listing', () => {
    expect(map(ALL, null).rows[0]?.flagged).toBeNull();
  });

  it('totals each kind, and counts only real flags', () => {
    const failed = new Map(passing).set(JOURNEY, [
      'failed',
      'passed',
      'passed',
      'passed',
      'passed',
    ]);
    expect(map(ALL, failed).totals).toEqual({
      entries: 3,
      visible: 1,
      gap: 1,
      none: 1,
      flagged: 1,
    });
    expect(map(ALL).totals.flagged).toBe(0);
  });

  it('counts every commit a visitor never receives, by area', () => {
    const { otherCommits, otherAreas } = map(ALL);
    expect(otherCommits).toBe(2);
    expect(otherAreas).toEqual([
      ['.github', 1],
      ['tests', 2],
    ]);
  });

  it('renders every value escaped, and links each journey to its section', () => {
    const { changeMap, others } = renderChangeMap(map(ALL));
    expect(changeMap).not.toContain('<img src=x');
    expect(changeMap).toContain('feat: &lt;img src=x onerror=alert(1)&gt;');
    expect(changeMap).toContain(`<a href="#j-${slugOf(JOURNEY)}">`);
    expect(changeMap).toContain('try it by hand');
    expect(changeMap).toContain('a refactor');
    expect(others).toContain('tests');
  });
});
