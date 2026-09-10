import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { withoutTsComments } from './source-text';
import {
  renderEvidencePage,
  selectMedia,
} from '../../scripts/build-evidence-page.mjs';

/**
 * The evidence page generator, which must stay a TOOL and not become a page
 * about one ticket.
 *
 * #96 produced the first of these by hand, in a session scratchpad, so the
 * next ticket would have rebuilt it from nothing -- exactly the cost the
 * capture harness (`tests/e2e/evidence.ts`) was written to remove. Promoting it
 * only helps if the ticket's own prose stays OUT of the script; a generator
 * with "#96" baked into it produces a page that confidently describes the
 * wrong feature for every ticket after it.
 *
 * Everything structural is DERIVED from the run: engines, journeys and
 * assertions come from Playwright's JSON report and the capture manifest, never
 * from an argument. A sixth engine, or a spec that runs on fewer, is reflected
 * without touching this code.
 */

const CONTENT = {
  title: 'Example Evidence',
  eyebrow: 'example · evidence',
  headline: 'A headline only this ticket would use',
  lede: 'A lede only this ticket would use.',
  sections: [{ heading: 'A section heading', body: 'A section body.' }],
  mutations: [
    { id: 'M1', what: 'something broken', predicted: '1 red', actual: '1 red' },
  ],
  signoffKey: 'ticket-000',
  notCovered: 'Something out of scope.',
};

/** Two engines, one journey, two assertions each -- four captures. */
const MANIFEST = [
  {
    project: 'chromium',
    title: 'suite > a journey',
    order: 1,
    label: 'first thing',
    file: 'chromium/a__01.png',
  },
  {
    project: 'chromium',
    title: 'suite > a journey',
    order: 2,
    label: 'second thing',
    file: 'chromium/a__02.png',
  },
  {
    project: 'webkit',
    title: 'suite > a journey',
    order: 1,
    label: 'first thing',
    file: 'webkit/a__01.png',
  },
  {
    project: 'webkit',
    title: 'suite > a journey',
    order: 2,
    label: 'second thing',
    file: 'webkit/a__02.png',
  },
];

const REPORT = {
  stats: {
    startTime: '2026-01-01T00:00:00.000Z',
    duration: 1000,
    expected: 2,
    unexpected: 0,
    flaky: 0,
    skipped: 0,
  },
  suites: [
    {
      specs: [
        {
          title: 'a journey',
          tests: [
            {
              projectName: 'chromium',
              results: [{ status: 'passed', duration: 500, attachments: [] }],
            },
            {
              projectName: 'webkit',
              results: [{ status: 'passed', duration: 500, attachments: [] }],
            },
          ],
        },
      ],
    },
  ],
};

const SHOTS = new Map(
  MANIFEST.map((m) => [m.file, `data:image/png;base64,AAAA${m.file}`]),
);

const build = (over = {}) =>
  renderEvidencePage({
    manifest: MANIFEST,
    report: REPORT,
    content: CONTENT,
    shots: SHOTS,
    videos: new Map(),
    ...over,
  });

describe('the evidence page is derived from the run', () => {
  it('emits exactly one image per captured assertion', () => {
    const html = build();
    const figures = html.match(/class="shot"/g) ?? [];
    expect(figures).toHaveLength(MANIFEST.length);
  });

  it('refuses to emit a page that silently drops evidence', () => {
    // A page missing captures an operator was told it contains is worse than
    // no page: it looks like proof of assertions nobody can see.
    expect(() => build({ shots: new Map() })).toThrow(/missing/i);
  });

  it('takes its engines from the report, never from an argument', () => {
    const html = build();
    expect(html).toContain('chromium');
    expect(html).toContain('webkit');
    // firefox is in neither the manifest nor the report.
    expect(html).not.toContain('firefox');
  });

  it('reports the run stats it was given rather than a hardcoded verdict', () => {
    const html = build({
      report: { ...REPORT, stats: { ...REPORT.stats, expected: 41, flaky: 7 } },
    });
    // Asserted as the stat cell, not as a bare substring: "7" alone matches
    // any stray digit in the stylesheet, which is a check that cannot fail.
    expect(html).toContain('<span class="n">41</span>');
    expect(html).toContain('<span class="n">7</span>');
  });
});

describe('media selection respects a budget and says what it dropped', () => {
  it('drops videos rather than exceeding the budget, and reports the drop', () => {
    const videos = [
      { key: 'a|chromium', bytes: 900 },
      { key: 'a|webkit', bytes: 900 },
    ];
    const { kept, dropped } = selectMedia(videos, 1000, 0);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(1);
  });

  it('keeps everything when the budget allows', () => {
    const videos = [{ key: 'a|chromium', bytes: 10 }];
    const { kept, dropped } = selectMedia(videos, 1000, 0);
    expect(kept).toHaveLength(1);
    expect(dropped).toEqual([]);
  });
});

describe('the generator carries no ticket prose', () => {
  it('contains none of the content file it renders', () => {
    // Derived from the example content rather than a list of banned words: a
    // hand-written blocklist would miss the phrase somebody actually pastes.
    const source = withoutTsComments(
      readFileSync('scripts/build-evidence-page.mjs', 'utf8'),
    );
    const prose = [
      CONTENT.headline,
      CONTENT.lede,
      CONTENT.sections[0].heading,
      CONTENT.sections[0].body,
      CONTENT.notCovered,
      CONTENT.mutations[0].what,
    ];
    for (const phrase of prose)
      expect(
        source,
        `the generator hardcodes ${JSON.stringify(phrase)}`,
      ).not.toContain(phrase);
  });
});
