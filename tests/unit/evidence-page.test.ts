import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withoutTsComments } from './source-text';
import { filesUnder, tsFilesUnder, searched } from '../source-files';
import { reportLocation } from '../../scripts/test-e2e.mjs';
import {
  CONTRACT_MODULE,
  EVIDENCE_MANIFEST,
  EVIDENCE_REPORT,
} from '../../scripts/evidence-files.mjs';
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

/**
 * The run has to LEAVE BEHIND what the builder reads.
 *
 * `playwright.config.ts` states that an evidence run is exactly
 * `EVIDENCE_DIR=<dir> npm run test:e2e -- <spec>` and "needs no second flag
 * anybody could forget". That sentence was false when it was written: the
 * builder reads `<EVIDENCE_DIR>/report.json`, the config declares no reporter,
 * and the runner wrote its json into a `mkdtemp` directory it deleted in a
 * `finally`. The captures landed, the run went green, and the page could not
 * be built -- the failure surfacing one step away from its cause.
 *
 * A comment is not an implementation, so the promise is asserted here instead
 * of restated there.
 */
describe('an evidence run leaves the builder exactly what it reads', () => {
  it('writes the report INTO the evidence directory, and keeps it', () => {
    expect(reportLocation({ EVIDENCE_DIR: '/e' })).toEqual({
      dir: '/e',
      path: join('/e', EVIDENCE_REPORT),
      ephemeral: false,
    });
  });

  it('still uses a throwaway directory when no evidence was asked for', () => {
    const location = reportLocation({});
    // The point of the flag is that the ordinary run is unchanged: ~2200 tests
    // must not start littering the tree with reports nobody reads.
    expect(location.ephemeral).toBe(true);
    expect(location.dir).not.toBe('/e');
    expect(location.path).toBe(join(location.dir, EVIDENCE_REPORT));
  });

  it('never deletes a directory the operator was asked to keep', () => {
    // `reportLocation` returning `ephemeral: false` is only half the control:
    // it is the CALL SITE that deletes, and an unconditional `rmSync` there
    // would take the captures and the video with it. Asserted against the
    // construct -- the guard around the call -- not the bare name, and against
    // the stripped source, because the paragraph above the line says
    // "ephemeral" too.
    const runner = withoutTsComments(
      readFileSync('scripts/test-e2e.mjs', 'utf8'),
    );
    const deletions = [...runner.matchAll(/rmSync\(reportDir[^)]*\)/g)];

    expect(
      searched(deletions, { of: deletions.length, what: 'report cleanups' }),
      'the runner stopped deleting its temp report directory at all',
    ).toHaveLength(1);
    expect(runner, 'the report directory is deleted unconditionally').toMatch(
      /if \(ephemeral\)\s*rmSync\(reportDir/,
    );
  });

  it('pins the two filenames the evidence directory is defined by', () => {
    // A literal pin against the contract, separate from any guard that derives
    // from it: both sides moving together would otherwise pass at any name.
    expect(EVIDENCE_REPORT).toBe('report.json');
    expect(EVIDENCE_MANIFEST).toBe('manifest.jsonl');
  });

  it('has no consumer spelling an evidence filename for itself', () => {
    // Derived from the filesystem, not from a list: the sweep that missed five
    // survivors (#65) was driven by the file list in its own ticket.
    const consumers = [
      ...filesUnder('scripts', (p) => p.endsWith('.mjs')),
      ...tsFilesUnder('tests/e2e'),
    ].filter((p) => !p.endsWith(CONTRACT_MODULE));

    const respellings = consumers.filter((path) => {
      const code = withoutTsComments(readFileSync(path, 'utf8'));
      return (
        code.includes(`'${EVIDENCE_REPORT}'`) ||
        code.includes(`'${EVIDENCE_MANIFEST}'`)
      );
    });

    expect(
      searched(respellings, { of: consumers, what: 'evidence consumers' }),
      'a filename spelled twice is two filenames the day one of them moves',
    ).toEqual([]);
  });
});
