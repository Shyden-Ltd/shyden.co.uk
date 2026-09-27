import { describe, expect, it } from 'vitest';
import {
  listedTitles,
  releaseContentOf,
} from '../../scripts/build-release-content.mjs';

const BASE = 'b'.repeat(40);
const HEAD = 'h'.repeat(40);
const V = {
  sha: 'a'.repeat(40),
  subject: 'visible',
  pr: 1,
  ticket: 2,
  files: ['src/x'],
  visitorFacing: true,
  areas: ['src'],
};
const G = {
  sha: 'c'.repeat(40),
  subject: 'gap',
  pr: 3,
  ticket: null,
  files: ['src/y'],
  visitorFacing: true,
  areas: ['src'],
};
const inventory = { base: BASE, head: HEAD, entries: [V, G] };
const TITLE = 'a describe > a journey';
const release = {
  base: BASE,
  headline: 'The headline',
  lede: 'The lede',
  signoff: { lede: 'Yours.', approve: 'Release' },
  gapGroup: 'Shown by no journey',
  checks: [{ id: 'dev-home', group: 'On dev', label: 'Open it' }],
  entries: {
    [V.sha]: { kind: 'visible', journeys: [TITLE] },
    [G.sha]: { kind: 'gap', check: 'Try it by hand' },
  },
};
const START = '2026-09-27T08:00:00.000Z';
const report = {
  stats: { startTime: START },
  suites: [
    {
      file: 'x.spec.ts',
      suites: [
        {
          title: 'a describe',
          specs: [
            {
              title: 'a journey',
              tests: [
                {
                  projectName: 'chromium',
                  results: [{ status: 'passed', duration: 1, attachments: [] }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
const manifest = [
  {
    project: 'chromium',
    title: TITLE,
    order: 1,
    label: 'l',
    file: 'chromium/a.jpg',
    at: '2026-09-27T08:00:01.000Z',
  },
];

describe('the release content (#362)', () => {
  // Built inside each test, so a stub fails each on its own assertion rather
  // than the whole file at collection.
  const content = () =>
    releaseContentOf({
      release,
      inventory,
      report,
      manifest,
      devVerified: 'success',
    });

  it('keys the sign-off to the release head', () => {
    expect(content()?.signoffKey).toBe('release-hhhhhhh');
  });

  it('names production, the head and its dev-verified state', () => {
    expect(content()?.ids).toEqual([
      { label: 'Production', value: BASE },
      { label: 'Release head', value: HEAD },
      { label: 'dev-verified', value: 'success' },
    ]);
  });

  it('carries the release file wording and its checks, and turns every gap into a check', () => {
    expect(content()?.headline).toBe('The headline');
    expect(content()?.signoff).toEqual({ lede: 'Yours.', approve: 'Release' });
    expect(content()?.checks).toEqual([
      { id: 'dev-home', group: 'On dev', label: 'Open it' },
      {
        id: 'gap-ccccccc',
        group: 'Shown by no journey',
        label: 'gap: Try it by hand',
      },
    ]);
  });

  it('renders the change map and the rest as html sections', () => {
    expect(
      content()?.sections?.map((s: { html?: string }) => typeof s.html),
    ).toEqual(['string', 'string']);
    expect(content()?.sections?.[0]?.html).toContain('#j-a-describe-a-journey');
  });

  it.each([['failure'], [null]])(
    'refuses a head whose dev-verified reads %s',
    (state) => {
      expect(() =>
        releaseContentOf({
          release,
          inventory,
          report,
          manifest,
          devVerified: state,
        }),
      ).toThrow(/dev-verified/);
    },
  );

  it('refuses a cited title that ran but captured nothing', () => {
    expect(() =>
      releaseContentOf({
        release,
        inventory,
        report,
        manifest: [{ ...manifest[0], title: 'another' }],
        devVerified: 'success',
      }),
    ).toThrow(/is not a journey of this run/);
  });
});

describe('--check against a listing (#362)', () => {
  const listing = {
    suites: [
      {
        file: 'x.spec.ts',
        suites: [
          {
            title: 'a describe',
            specs: [
              {
                title: 'a journey',
                tests: [{ projectName: 'chromium', results: [] }],
              },
            ],
          },
        ],
      },
    ],
  };

  it('reads every listed title, results or none', () => {
    expect([...listedTitles(listing)]).toEqual([TITLE]);
  });

  it('passes a branch head with no dev-verified, and writes nothing', () => {
    expect(
      releaseContentOf({
        release,
        inventory,
        report: listing,
        manifest: null,
        devVerified: null,
      }),
    ).toBeNull();
  });

  it('still refuses a title the listing does not hold', () => {
    const typo = {
      ...release,
      entries: {
        ...release.entries,
        [V.sha]: { kind: 'visible', journeys: ['a describe > a jorney'] },
      },
    };
    expect(() =>
      releaseContentOf({
        release: typo,
        inventory,
        report: listing,
        manifest: null,
        devVerified: null,
      }),
    ).toThrow(/is not a journey of this run/);
  });
});
