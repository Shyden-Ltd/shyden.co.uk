import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { withoutTsComments } from './source-text';
import { filesUnder, tsFilesUnder, searched } from '../source-files';
import { reportLocation } from '../../scripts/test-e2e.mjs';
import {
  CONTRACT_MODULE,
  EVIDENCE_JPEG_QUALITY,
  EVIDENCE_MANIFEST,
  EVIDENCE_REPORT,
} from '../../scripts/evidence-files.mjs';
import { captureOptions, manifestRow } from '../e2e/evidence';
import { scriptCheckout, type ScriptCheckout } from './script-checkout';
import {
  assertPageFits,
  assertPublishLimits,
  capturesOfThisRun,
  earlierLine,
  imageSize,
  mediaType,
  PAGE_MAX_BYTES,
  PUBLISH_MAX_BYTES,
  PUBLISH_MAX_FILES,
  PUBLISH_NOTE,
  publishedVideoPath,
  reconcileFiles,
  renderEvidencePage,
  videoCandidates,
  videoFiles,
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

/** A json report with one result per entry, grouped by journey. */
const reportOf = (
  results: {
    journey: string;
    project: string;
    video?: string;
    status?: string;
  }[],
) => ({
  ...REPORT,
  suites: [
    {
      specs: [...new Set(results.map((r) => r.journey))].map((title) => ({
        title,
        tests: results
          .filter((r) => r.journey === title)
          .map((r) => ({
            projectName: r.project,
            results: [
              {
                status: r.status ?? 'passed',
                duration: 500,
                attachments: r.video
                  ? [
                      {
                        name: 'video',
                        contentType: 'video/webm',
                        path: r.video,
                      },
                    ]
                  : [],
              },
            ],
          })),
      })),
    },
  ],
});

/** The PNG signature and an IHDR `width` px wide: all the builder reads of a capture. */
const png = (width: number) => {
  const size = Buffer.alloc(8);
  size.writeUInt32BE(width, 0);
  size.writeUInt32BE(1, 4);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
    size,
  ]);
};

/** The builder as an operator runs it: its own process, reading only the disk. */
const runBuilder = (
  dir: string,
  page: string,
  script = 'scripts/build-evidence-page.mjs',
) => {
  const content = join(dir, 'content.json');
  writeFileSync(content, JSON.stringify(CONTENT));
  return spawnSync(
    process.execPath,
    [script, '--evidence', dir, '--content', content, '--out', page],
    { encoding: 'utf8' },
  );
};

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

describe('a journey whose engine recorded nothing says so on the page', () => {
  it('shows, per journey, which engine has no recording', () => {
    // An ordinary run records nothing, so a result with no recording is not a
    // loss, and the page reports which engines it holds. Nothing is left out
    // for SIZE any more: recordings travel beside the page, and one the disk
    // does not have is refused outright, below.
    const html = build({
      videos: new Map([['a-journey|chromium', 'data:video/webm;base64,AAAA']]),
    });
    expect(html).toContain('Journey recordings (1 of 2 engines embedded)');
    expect(html).toContain(
      '<div class="novid mono">not embedded</div><figcaption class="mono">webkit</figcaption>',
    );
  });
});

/**
 * A recording the report names is on disk, or there is no page.
 *
 * #165: Playwright wrote the videos into `test-results/`, the next ordinary run
 * cleared that directory as it started, and all 25 were gone while the captures
 * and the report beside them survived. The builder skipped each missing file
 * and built anyway -- "0 of 5 engines embedded" on every journey, which reads
 * exactly like a budget decision. A dangling path is lost evidence, and the
 * build names it.
 */
describe('a recording the report names is on disk, or the build refuses', () => {
  let scratch = '';
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'evidence-recordings-'));
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  /** A real file, so the check reads the disk rather than a stand-in for it. */
  const recording = (name: string, size: number) => {
    const path = join(scratch, name);
    writeFileSync(path, Buffer.alloc(size));
    return path;
  };

  it('names every journey and engine whose recording is gone', () => {
    const report = reportOf([
      {
        journey: 'a journey',
        project: 'chromium',
        video: recording('kept.webm', 10),
      },
      {
        journey: 'a journey',
        project: 'webkit',
        video: join(scratch, 'gone.webm'),
      },
      {
        journey: 'another journey',
        project: 'firefox',
        video: join(scratch, 'also-gone.webm'),
      },
    ]);

    let refusal = 'the build did not refuse';
    try {
      videoCandidates(report);
    } catch (error) {
      refusal = (error as Error).message;
    }
    expect(refusal).toContain('"a journey" on webkit');
    expect(refusal).toContain('"another journey" on firefox');
    expect(
      refusal,
      'a recording that IS on disk was reported missing',
    ).not.toContain('on chromium');
  });

  it('keeps every recording on disk, resolved to the file a publish carries', () => {
    // No base64 charge any more. A recording is PUBLISHED, not inlined, so the
    // 4/3 inflation a data URI paid is not a cost it can incur, and nothing
    // reads a charge from here: `assertPublishLimits` sizes each file on the
    // disk it will be read from. A second number describing the same file is
    // one that can drift from it.
    const chromium = recording('a-chromium.webm', 1000);
    const webkit = recording('a-webkit.webm', 2000);
    expect(
      videoCandidates(
        reportOf([
          { journey: 'a journey', project: 'chromium', video: chromium },
          { journey: 'a journey', project: 'webkit', video: webkit },
        ]),
      ),
    ).toEqual([
      { key: 'a-journey|chromium', abs: chromium },
      { key: 'a-journey|webkit', abs: webkit },
    ]);
  });

  it('reads a result with no recording as nothing to embed, not as a loss', () => {
    // An ordinary run records no video, so a missing attachment is not the
    // defect; a path to a file that is not there is.
    expect(
      videoCandidates(
        reportOf([{ journey: 'a journey', project: 'chromium' }]),
      ),
    ).toEqual([]);
  });

  it('refuses at the command line, before a page is written', () => {
    // The seam: `main` has to ask `videoCandidates` BEFORE it writes. A page
    // written anyway is the #165 page again, whatever the function would say.
    const dir = mkdtempSync(join(scratch, 'run-'));
    mkdirSync(join(dir, 'chromium'));
    writeFileSync(join(dir, 'chromium', 'a__01.png'), png(1));
    // Stamped five seconds into the reported run, as the harness stamps it.
    writeFileSync(
      join(dir, EVIDENCE_MANIFEST),
      JSON.stringify(
        manifestRow(
          {
            project: 'chromium',
            title: 'suite > a journey',
            order: 1,
            label: 'first thing',
            file: 'chromium/a__01.png',
          },
          new Date(Date.parse(REPORT.stats.startTime) + 5_000),
        ),
      ) + '\n',
    );
    const page = join(dir, 'page.html');
    const buildWith = (video: string) => {
      writeFileSync(
        join(dir, EVIDENCE_REPORT),
        JSON.stringify(
          reportOf([{ journey: 'a journey', project: 'chromium', video }]),
        ),
      );
      return runBuilder(dir, page);
    };

    const refused = buildWith(join(dir, 'gone.webm'));
    expect(refused.status, refused.stdout).not.toBe(0);
    expect(refused.stderr).toContain('"a journey" on chromium');
    expect(existsSync(page), 'a page was written without its recordings').toBe(
      false,
    );

    // Positive control: the same directory builds once the recording exists,
    // so the refusal above is about the recording and nothing else.
    const built = buildWith(recording('present.webm', 10));
    expect(built.status, built.stderr).toBe(0);
    expect(built.stdout).toContain('videos=1/1');
    expect(existsSync(page)).toBe(true);
  });
});

/**
 * An earlier run's captures never reach a page built from a later run (#171).
 *
 * The harness APPENDS to the manifest and nothing clears it, so a second run
 * into one evidence directory kept the first run's rows and pictures. Measured:
 * webkit, then chromium, into one directory built a page embedding 15 webkit
 * captures under a report that ran chromium alone. Every row is now stamped as
 * it is written, and the builder keeps only the rows the reported run wrote.
 */
describe('an earlier run in the same evidence directory stays off the page', () => {
  let scratch = '';
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'evidence-runs-'));
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const START = Date.parse(REPORT.stats.startTime);
  const MINUTE = 60_000;

  /** What `shoot` records about one capture, before the stamp. */
  const capture = (project: string, order: number) => ({
    project,
    title: 'suite > a journey',
    order,
    label: `thing ${order}`,
    file: `${project}/a__0${order}.png`,
  });

  /** A row as the harness writes it, `offsetMs` after the reported run began. */
  const stamped = (project: string, order: number, offsetMs: number) =>
    manifestRow(capture(project, order), new Date(START + offsetMs));

  /** A directory as runs leave it: a distinct capture per file, the rows, the report. */
  const directory = (rows: { file: string }[], report: object) => {
    const dir = mkdtempSync(join(scratch, 'run-'));
    [...new Set(rows.map((row) => row.file))].forEach((file, i) => {
      mkdirSync(join(dir, dirname(file)), { recursive: true });
      writeFileSync(join(dir, file), png(10 + i));
    });
    writeFileSync(
      join(dir, EVIDENCE_MANIFEST),
      rows.map((row) => JSON.stringify(row) + '\n').join(''),
    );
    writeFileSync(join(dir, EVIDENCE_REPORT), JSON.stringify(report));
    return dir;
  };

  /** A capture exactly as the page embeds it. */
  const base64Of = (dir: string, file: string) =>
    readFileSync(join(dir, file)).toString('base64');

  it('stamps each manifest row with the instant it was written, keeping what it records', () => {
    expect(
      manifestRow(capture('webkit', 2), new Date('2026-01-01T00:00:05.000Z')),
    ).toEqual({ ...capture('webkit', 2), at: '2026-01-01T00:00:05.000Z' });
  });

  it('keeps the rows the reported run wrote and sets aside the ones from before it began', () => {
    const before = stamped('webkit', 1, -MINUTE);
    const during = stamped('chromium', 1, 5_000);
    expect(capturesOfThisRun([before, during], REPORT)).toEqual({
      current: [during],
      earlier: [before],
    });
  });

  it("counts a row stamped at the very instant the run began as the run's own", () => {
    const { current, earlier } = capturesOfThisRun(
      [stamped('chromium', 1, 0), stamped('chromium', 2, -1)],
      REPORT,
    );
    expect(current.map((row: { order: number }) => row.order)).toEqual([1]);
    expect(earlier.map((row: { order: number }) => row.order)).toEqual([2]);
  });

  it("reads a row with no stamp as an earlier run's: the harness stamps every row it writes", () => {
    const unstamped = capture('webkit', 1);
    const during = stamped('chromium', 1, 5_000);
    expect(capturesOfThisRun([unstamped, during], REPORT)).toEqual({
      current: [during],
      earlier: [unstamped],
    });
  });

  it('refuses a report whose start it cannot read, rather than dating every row as current', () => {
    const rows = [stamped('chromium', 1, 5_000)];
    // Date.parse reads '0' as midnight on 1 January 2000 and '2026' as that
    // year's first instant, so a lenient parse dates an earlier run's rows too.
    for (const startTime of [
      undefined,
      '',
      '0',
      '2026',
      '2026-13-01T00:00:00.000Z',
      START,
    ])
      expect(
        () =>
          capturesOfThisRun(rows, {
            ...REPORT,
            stats: { ...REPORT.stats, startTime },
          }),
        `stats.startTime ${JSON.stringify(startTime)}`,
      ).toThrow(/stats\.startTime/);
    expect(() => capturesOfThisRun(rows, { suites: [] })).toThrow(
      /stats\.startTime/,
    );
  });

  it('refuses a stamp that is not an instant, rather than guessing which run wrote the row', () => {
    for (const at of [null, '', 'yesterday', '0', START])
      expect(
        () => capturesOfThisRun([{ ...capture('chromium', 1), at }], REPORT),
        `at ${JSON.stringify(at)}`,
      ).toThrow('chromium/a__01.png');
  });

  it('refuses a directory where nothing belongs to the reported run, and names what is there', () => {
    let refusal = 'the build did not refuse';
    try {
      capturesOfThisRun(
        [
          stamped('webkit', 1, -MINUTE),
          stamped('webkit', 2, -MINUTE + 1),
          capture('firefox', 1),
        ],
        REPORT,
      );
    } catch (error) {
      refusal = (error as Error).message;
    }
    expect(refusal).toContain(REPORT.stats.startTime);
    expect(refusal).toContain('webkit 2');
    expect(refusal).toContain('firefox 1');
    // A manifest with no rows is a run that reached no assertion at all.
    expect(() => capturesOfThisRun([], REPORT)).toThrow(REPORT.stats.startTime);
  });

  it('names on the build line how many rows it set aside, and from which engines', () => {
    expect(
      earlierLine([
        capture('webkit', 1),
        capture('webkit', 2),
        capture('firefox', 1),
      ]),
    ).toBe(
      ' EARLIER=3 (captured before this run started): webkit 2, firefox 1',
    );
    expect(earlierLine([])).toBe('');
  });

  it('builds the page from the second of two runs into one directory, and deletes nothing', () => {
    // #171's measured scenario in miniature: webkit captured a minute before
    // the reported run began, then chromium into the same directory.
    const webkit = [
      stamped('webkit', 1, -MINUTE),
      stamped('webkit', 2, -MINUTE + 1),
    ];
    const chromium = [
      stamped('chromium', 1, 5_000),
      stamped('chromium', 2, 5_001),
    ];
    const rows = [...webkit, ...chromium];
    const dir = directory(
      rows,
      reportOf([{ journey: 'a journey', project: 'chromium' }]),
    );
    const page = join(dir, 'page.html');

    const built = runBuilder(dir, page);

    expect(built.status, built.stderr).toBe(0);
    expect(built.stdout).toContain('shots=2 videos=0/0');
    expect(built.stdout).toContain(
      'EARLIER=2 (captured before this run started): webkit 2',
    );
    const html = readFileSync(page, 'utf8');
    for (const row of chromium)
      expect(html, `${row.file} is missing from the page`).toContain(
        base64Of(dir, row.file),
      );
    for (const row of webkit)
      expect(
        html,
        `${row.file}, from the earlier run, is on the page`,
      ).not.toContain(base64Of(dir, row.file));
    // Set aside, never deleted: every capture and every row is still there.
    for (const row of rows)
      expect(existsSync(join(dir, row.file)), row.file).toBe(true);
    expect(
      readFileSync(join(dir, EVIDENCE_MANIFEST), 'utf8').trim().split('\n'),
    ).toHaveLength(rows.length);
  });

  it('shows no picture for an assertion this run did not reach, though an earlier run captured it', () => {
    // The first run reached both assertions. The second, after a change,
    // failed before its second shot and overwrote only the first capture.
    const first = [
      stamped('chromium', 1, -MINUTE),
      stamped('chromium', 2, -MINUTE + 1),
    ];
    const second = stamped('chromium', 1, 5_000);
    const dir = directory(
      [...first, second],
      reportOf([
        { journey: 'a journey', project: 'chromium', status: 'failed' },
      ]),
    );
    const page = join(dir, 'page.html');

    const built = runBuilder(dir, page);

    expect(built.status, built.stderr).toBe(0);
    expect(built.stdout).toContain('shots=1 videos=0/0');
    const html = readFileSync(page, 'utf8');
    expect(html).toContain(base64Of(dir, second.file));
    expect(
      html,
      "the unreached assertion carries the earlier run's picture",
    ).not.toContain(base64Of(dir, first[1].file));
  });

  it("never reads an earlier run's capture, so one deleted since is no reason to refuse", () => {
    const gone = stamped('webkit', 1, -MINUTE);
    const kept = stamped('chromium', 1, 5_000);
    const dir = directory(
      [gone, kept],
      reportOf([{ journey: 'a journey', project: 'chromium' }]),
    );
    rmSync(join(dir, gone.file));
    const page = join(dir, 'page.html');

    const built = runBuilder(dir, page);

    expect(built.status, built.stderr).toBe(0);
    expect(built.stdout).toContain('shots=1 videos=0/0');
    expect(built.stdout).toContain(
      'EARLIER=1 (captured before this run started): webkit 1',
    );
  });

  it("refuses at the command line when nothing is this run's, and writes no page", () => {
    const dir = directory(
      [stamped('webkit', 1, -MINUTE)],
      reportOf([
        { journey: 'a journey', project: 'chromium', status: 'failed' },
      ]),
    );
    const page = join(dir, 'page.html');

    const refused = runBuilder(dir, page);

    expect(refused.status, refused.stdout).not.toBe(0);
    expect(refused.stderr).toContain('webkit 1');
    expect(
      existsSync(page),
      'a page was written with no capture from its run',
    ).toBe(false);
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
 * The Playwright config as Playwright loads it, with `EVIDENCE_DIR` as given.
 *
 * The config reads the switch while it loads, so each call evaluates the module
 * afresh: a copy loaded under some other environment would be a verdict about
 * a run nobody is making.
 */
const configUnder = async (evidence: string | undefined) => {
  vi.stubEnv('EVIDENCE_DIR', evidence);
  vi.resetModules();
  try {
    return (await import('../../playwright.config')).default;
  } finally {
    vi.unstubAllEnvs();
  }
};

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
 * The recordings had the same hole one step further out (#165). Playwright
 * wrote them into its default `test-results/`, which every run clears as it
 * starts, so the next ordinary run took all 25 while the captures and the
 * report beside them survived: a directory that looks complete and builds a
 * page with no video in it.
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

  it('keeps the recordings in a directory of their own inside the evidence directory', async () => {
    // #165. The seam is the config Playwright actually loads, not a helper it
    // could stop calling. Playwright clears its output directory as a run
    // starts, so the recordings need a subdirectory: pointed at the evidence
    // directory itself, that clearing would take the captures with it.
    for (const evidence of ['/e', 'evidence-run']) {
      const { outputDir, use } = await configUnder(evidence);
      expect(use?.video, `EVIDENCE_DIR=${evidence} stopped recording`).toBe(
        'on',
      );

      const within = relative(
        resolve(evidence),
        resolve(outputDir ?? 'test-results'),
      );
      expect(
        within !== '' && !within.startsWith('..') && !isAbsolute(within),
        `EVIDENCE_DIR=${evidence} records into ${outputDir ?? 'test-results/'}`,
      ).toBe(true);
    }
  });

  it('refuses an evidence directory that an ordinary run would clear', async () => {
    // Inside test-results/, the next ordinary run deletes the whole evidence
    // directory; `.` would put the recordings back into test-results/ itself.
    for (const evidence of [
      join('test-results', 'evidence'),
      'test-results',
      '.',
    ])
      await expect(
        configUnder(evidence),
        `EVIDENCE_DIR=${evidence}`,
      ).rejects.toThrow(/test-results/);
  });

  it('accepts a directory that merely begins with the same name', async () => {
    // A string-prefix containment check would refuse this one.
    const { outputDir } = await configUnder('test-results-evidence');
    expect(outputDir).toBe(resolve('test-results-evidence', 'test-results'));
  });

  it("leaves an ordinary run on Playwright's default, which CI uploads when a job fails", async () => {
    // ci.yml and release-dev.yml keep test-results/ on failure. An ordinary run
    // writing anywhere else would upload an empty directory and say nothing.
    for (const evidence of [undefined, '']) {
      const { outputDir, use } = await configUnder(evidence);
      expect(
        outputDir,
        `EVIDENCE_DIR=${JSON.stringify(evidence)}`,
      ).toBeUndefined();
      expect(use?.video).toBe('off');
    }
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

/**
 * The page asks for a decision it can only keep if the PUBLISH granted it.
 *
 * The sign-off ticks and the verdict are written through `claude.use('db')`,
 * which resolves `null` unless the publish declared the `db` capability. The
 * page degrades honestly -- it says "ticks are local to this view" -- and that
 * line is easy to read as a quirk rather than as "nothing you decide here is
 * recorded". Found on #138's page at publish time: the first version was
 * published without the declaration, so the operator's sign-off would have
 * been kept nowhere and could not have been read back.
 *
 * The declaration is a publish ARGUMENT, so no code in this repo can enforce
 * it. What can be enforced is that the build SAYS so, and that the note and
 * the page never drift apart.
 */
describe('the build says what the publish has to grant', () => {
  it('names the capability the sign-off is written through', () => {
    expect(PUBLISH_NOTE).toContain('capabilities');
    expect(PUBLISH_NOTE).toContain('db');
  });

  it('names a capability the RENDERED page actually reaches for', () => {
    // The seam. A note naming a capability the page stopped using is the same
    // defect in the other direction -- advice nobody can act on, still read as
    // authoritative.
    //
    // Asserted against the rendered output, NOT the generator's source: the
    // note itself spells use('db'), so a source-text check would be satisfied
    // by the very sentence it is supposed to be corroborating.
    expect(build(), 'the page no longer reaches for db').toContain("use('db')");
  });

  it('names the files map the recordings travel in', () => {
    // The sidecar is inert unless the publish carries it: the page would
    // reference recordings nothing ever uploaded, and a broken `src` reads as
    // a journey that was never recorded. A publish argument cannot be enforced
    // from in here, so the note is its only carrier -- the same reason the
    // capability is named above.
    expect(PUBLISH_NOTE).toContain('files');
  });
});

/**
 * The page carries whatever the run captured, and knows what it is.
 *
 * Captures were PNG, which stores a screenshot of photographs losslessly at
 * roughly ten times the size of a quality-90 JPEG -- a fidelity nobody
 * consumes, since the page is read by an eye and pixel-exact comparison
 * belongs to the visual-regression suite and its own baselines. Measured on
 * #138: 80 shots came to 18.9 MiB, a 25.34 MiB page that could not be
 * published at all, and the budget then dropped ALL EIGHTY videos against
 * bytes the shots had already spent -- so the standing requirement of a video
 * per journey was silently unmet (#146). That budget is gone: recordings are
 * published beside the page (#158), so shots can no longer spend what the
 * recordings need.
 *
 * The media type is read from the bytes, never from the extension: a capture
 * whose name and content disagree must still render, and an unknown format
 * must throw rather than emit a data URI the browser will not paint.
 */
describe('an evidence capture is identified by its own bytes', () => {
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0, 0, 0, 13]),
    Buffer.from('IHDR'),
    Buffer.from([0, 0, 2, 0]), // 512
    Buffer.from([0, 0, 1, 0]), // 256
  ]);

  /** SOI, then `segments`, then EOI. */
  const jpeg = (...segments: Buffer[]) =>
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      ...segments,
      Buffer.from([0xff, 0xd9]),
    ]);

  /** A marker segment: FF, marker, 2-byte length INCLUDING the length field. */
  const segment = (marker: number, payload: Buffer) =>
    Buffer.concat([
      Buffer.from([0xff, marker]),
      Buffer.from([(payload.length + 2) >> 8, (payload.length + 2) & 0xff]),
      payload,
    ]);

  /** SOFn payload: precision, height, width, component count. */
  const frame = (marker: number, w: number, h: number) =>
    segment(marker, Buffer.from([8, h >> 8, h & 0xff, w >> 8, w & 0xff, 3]));

  it('names the two formats a capture can arrive in', () => {
    expect(mediaType(PNG)).toBe('image/png');
    expect(mediaType(jpeg(frame(0xc0, 4, 4)))).toBe('image/jpeg');
  });

  it('refuses a format it cannot identify rather than emitting a broken src', () => {
    // A data URI claiming a type the bytes are not paints nothing, and a page
    // of blank frames looks exactly like a page of captures that failed.
    expect(() => mediaType(Buffer.from('GIF89a not a capture'))).toThrow(
      /unrecognised/i,
    );
  });

  it('reads intrinsic size from PNG and from JPEG alike', () => {
    // Without width/height the page reserves no space, the document grows as
    // shots decode, and a sign-off row jumps out from under the pointer --
    // already measured once at 23642px -> 31760px. The new format must not
    // bring it back.
    expect(imageSize(PNG)).toEqual({ w: 512, h: 256 });
    expect(imageSize(jpeg(frame(0xc0, 1280, 720)))).toEqual({
      w: 1280,
      h: 720,
    });
  });

  it('finds the frame header behind EXIF and a restart interval', () => {
    // The size lives in the SOFn marker, never at a fixed offset: Playwright's
    // encoder is free to put APP1/APP2 and a DRI segment in front of it.
    const withPreamble = jpeg(
      segment(0xe1, Buffer.from('Exif\0\0padding-that-is-not-a-frame')),
      segment(0xdd, Buffer.from([0x00, 0x10])),
      frame(0xc2, 828, 1792),
    );
    expect(imageSize(withPreamble)).toEqual({ w: 828, h: 1792 });
  });

  it('is not fooled by a marker that carries no length field', () => {
    // RSTn and TEM are standalone: reading two bytes after them as a length
    // walks the parser into the middle of the entropy-coded data.
    const withStandalone = jpeg(
      Buffer.from([0xff, 0x01]),
      Buffer.from([0xff, 0xd0]),
      frame(0xc1, 64, 48),
    );
    expect(imageSize(withStandalone)).toEqual({ w: 64, h: 48 });
  });

  it('pins the capture format against the ticket that chose it', () => {
    // A literal pin, separate from the derived checks: quality is a judgement
    // about legible Thai glyphs, and nothing computed from the constant can
    // test its LEVEL.
    expect(EVIDENCE_JPEG_QUALITY).toBe(90);
    expect(captureOptions('/tmp/a.jpg')).toEqual({
      path: '/tmp/a.jpg',
      scale: 'css',
      type: 'jpeg',
      quality: 90,
    });
  });
});

/**
 * Recordings published BESIDE the page, so capture scope and video completeness
 * stop competing for the 16 MB one page is allowed (#158).
 *
 * Twice the shots have spent a budget the recordings needed. #146 filed it; #189
 * hit it again at a different scope, where 105 shots at quality 90 came to
 * 10.0MB and pushed all 35 recordings out of a page that still looked complete.
 * A page carries media as base64 `data:` URIs at 4/3 of the bytes; a supporting
 * file is fetched separately and charged against different ceilings entirely --
 * 15 MB per binary, 64 MB and 255 entries per publish.
 *
 * Which media moves is FORCED by that entry ceiling, not chosen: full scope is
 * 175 shots + 120 recordings + the page = 296 entries, over the 255 a publish
 * allows. So the recordings move and the shots stay inline -- the recordings are
 * the larger bytes, and the ones that were being dropped.
 *
 * The published path is RELATIVE, with no leading slash. An artifact does not
 * serve a root-relative path, so `/evidence/x.webm` yields a broken `src` and a
 * journey that reads as never recorded -- silence indistinguishable from
 * evidence, which is what `mediaType` already refuses to emit. Exact equality on
 * the whole map is therefore the assertion; a `startsWith` probe would pass on a
 * path the publish cannot serve.
 */
describe('recordings are published beside the page, not inside it', () => {
  it('maps every recording to a relative published path, keyed by journey and engine', () => {
    expect(
      videoFiles([
        { key: 'a-journey|chromium', abs: '/run/one.webm' },
        { key: 'a-journey|Mobile Safari', abs: '/run/two.webm' },
      ]),
    ).toEqual({
      'evidence/a-journey-chromium.webm': '/run/one.webm',
      'evidence/a-journey-mobile-safari.webm': '/run/two.webm',
    });
  });

  it('refuses two recordings whose published paths collide, naming both files', () => {
    // Slugging joins on the same separator the key does, so a journey ending
    // where an engine begins can land on one path: `a-b|c` and `a|b-c` both
    // publish as `a-b-c.webm`. `Object.fromEntries` keeps the LAST silently,
    // which puts one journey's recording under another journey's claim -- the
    // stale-video hazard #158 exists to remove, arriving from the other end.
    let refusal = 'the build did not refuse';
    try {
      videoFiles([
        { key: 'a-b|c', abs: '/run/one.webm' },
        { key: 'a|b-c', abs: '/run/two.webm' },
      ]);
    } catch (error) {
      refusal = (error as Error).message;
    }
    expect(refusal).toContain('evidence/a-b-c.webm');
    expect(refusal).toContain('/run/one.webm');
    expect(refusal).toContain('/run/two.webm');
  });
});

/**
 * A second capture must not leave the first capture's recordings behind.
 *
 * Files left out of a redeploy's `files` map are KEPT, not removed, which is the
 * opposite of what the word "publish" suggests and the hazard #158 was filed
 * against. Two ways it bites. Orphans accumulate against the 64 MB and
 * 255-entry ceilings until a publish is refused outright. Far worse, a journey
 * id that survives a re-capture while its recording does not leaves YESTERDAY'S
 * video sitting beside TODAY'S assertion -- and nothing about that page looks
 * wrong, which makes it worse than one that drops the recording honestly.
 *
 * So the removals are emitted explicitly, as `null` against every published
 * path this capture did not produce.
 */
describe('a capture removes the recordings a previous one published', () => {
  it('removes a recording this run did not produce, rather than orphaning it', () => {
    expect(
      reconcileFiles({
        desired: { 'evidence/a-chromium.webm': '/run/a.webm' },
        published: ['evidence/a-chromium.webm', 'evidence/b-webkit.webm'],
      }),
    ).toEqual({
      'evidence/a-chromium.webm': '/run/a.webm',
      'evidence/b-webkit.webm': null,
    });
  });

  it('never removes a published file outside the recordings, so the page survives', () => {
    // The published listing is everything the artifact currently serves, which
    // includes the page itself. "Remove whatever this capture did not produce"
    // reads as correct and deletes `index.html` with it -- and `preflight.js`
    // at the artifact root is reserved, so a publish that nulls it is refused
    // outright. Only the recordings namespace is this builder's to clear.
    expect(
      reconcileFiles({
        desired: { 'evidence/a-chromium.webm': '/run/a.webm' },
        published: ['index.html', 'preflight.js', 'evidence/a-chromium.webm'],
      }),
    ).toEqual({ 'evidence/a-chromium.webm': '/run/a.webm' });
  });
});

/**
 * The publish ceilings are asserted here, loudly, rather than discovered.
 *
 * Silent degradation is what #146 was filed for and what this ticket removes,
 * so the ceilings get a guard that refuses the build -- never a build that
 * quietly emits less. There are two, and they count different things.
 */
describe('a publish that would exceed the artifact ceilings is refused', () => {
  it('refuses more than 255 entries, counting removals as entries', () => {
    // A REMOVAL IS STILL AN ENTRY. `{path: null}` carries no bytes and still
    // occupies one of the 255 slots, so a capture publishing recordings while
    // clearing a previous capture's spends two slots per journey that changed.
    // A guard counting only the entries WITH content passes, and the platform
    // refuses the publish anyway -- reassuring and wrong.
    const files: Record<string, string | null> = {};
    for (let i = 0; i < 200; i += 1)
      files[`evidence/j${i}-chromium.webm`] = `/run/${i}.webm`;
    for (let i = 0; i < 56; i += 1)
      files[`evidence/gone${i}-webkit.webm`] = null;

    let refusal = 'the build did not refuse';
    try {
      assertPublishLimits({ files, sizeOf: () => 10 });
    } catch (error) {
      refusal = (error as Error).message;
    }
    expect(refusal).toContain('256');
    expect(refusal).toContain('255');
  });

  it('refuses more bytes than one publish may carry, whatever the entry count', () => {
    // Ten files, so the entry count is nowhere near its ceiling: a guard that
    // returned after the entry check would pass this without looking at a byte.
    const files: Record<string, string | null> = {};
    for (let i = 0; i < 10; i += 1)
      files[`evidence/j${i}-chromium.webm`] = `/run/${i}.webm`;

    let refusal = 'the build did not refuse';
    try {
      assertPublishLimits({ files, sizeOf: () => 7 * 1024 * 1024 });
    } catch (error) {
      refusal = (error as Error).message;
    }
    expect(refusal).toContain('70.00MB');
    expect(refusal).toContain('64');
  });

  it('pins both ceilings to the numbers a publish actually enforces', () => {
    // A literal pin, separate from the guards that derive from it. Asserting
    // `64 * 1024 * 1024` would restate the expression that DEFINES the
    // constant, so it would hold at any level -- the #117 tautology. The raw
    // literal is what makes lowering a ceiling to get a build through fail
    // here, which is the escape hatch worth closing.
    expect(PUBLISH_MAX_FILES).toBe(255);
    expect(PUBLISH_MAX_BYTES).toBe(67108864);
  });
});

/**
 * A page too large to publish is a REFUSAL, never a smaller page.
 *
 * This is the whole of AC5 and the reason the drop path is gone. The old build
 * met a tight budget by emitting less and saying so on a line nobody reads, so
 * the operator was handed a page that looked complete and held less than he was
 * told (#146, and again at a different scope in #189). With the recordings
 * published beside it, the page holds shots alone -- and there is no honest
 * reason to drop an assertion shot, so not fitting is a build failure.
 *
 * `DROPPED=` can no longer appear on a successful build because the concept is
 * gone, rather than guarded against.
 */
describe('a page too large to publish is refused, not trimmed', () => {
  it('refuses a document over the ceiling, naming both sizes', () => {
    let refusal = 'the build did not refuse';
    try {
      assertPageFits(PAGE_MAX_BYTES + 1);
    } catch (error) {
      refusal = (error as Error).message;
    }
    expect(refusal).toContain('16.00MB');
  });

  it('accepts a document exactly at the ceiling', () => {
    // The boundary belongs to the page: a ceiling is what a publish ALLOWS,
    // so refusing at exactly the limit would reject a page that publishes.
    expect(() => assertPageFits(PAGE_MAX_BYTES)).not.toThrow();
  });

  it('pins the document ceiling to the one a publish enforces', () => {
    // The raw literal, for the same reason as the publish ceilings above:
    // asserting 16 * 1024 * 1024 would restate the defining expression.
    expect(PAGE_MAX_BYTES).toBe(16777216);
  });
});

/**
 * Every media reference the page emits is one a publish can actually serve.
 *
 * An artifact serves a supporting file by RELATIVE path. A root-relative `src`
 * is not served at all, and the failure is a broken `<video>` on a journey that
 * then reads as never recorded -- the silence this ticket exists to remove, in
 * the one place no type can see it: the path is built in `publishedVideoPath`
 * and interpolated into markup somewhere else, with no compiler between them.
 *
 * Asserted over the page's own rendered bytes for that reason. It passes the day
 * it is written, so its evidence comes from mutation: point the path at
 * `/evidence/...` and this is what goes red.
 */
describe('the page references its recordings by a path a publish serves', () => {
  it('emits no root-relative media reference', () => {
    const key = 'a-journey|chromium';
    const html = build({ videos: new Map([[key, publishedVideoPath(key)]]) });
    const srcs = [...html.matchAll(/src="([^"]*)"/g)].map((m) => m[1]);

    const rooted = srcs.filter((src) => src.startsWith('/'));
    expect(searched(rooted, { of: srcs, what: 'media references' })).toEqual(
      [],
    );
    // A positive control on the POPULATION, not merely on its size: the shots
    // are data URIs and would satisfy `searched` on their own, leaving the
    // recording -- the only relative path here -- entirely unexamined.
    expect(srcs).toContain(publishedVideoPath(key));
  });
});

/**
 * A journey the report names is on the page, captured or not.
 *
 * The journey list was derived from the MANIFEST alone, so a test that asserted
 * without calling `shoot()` got no section -- while `videoFiles` publishes a
 * file for EVERY recording, because `video` is `on` for the whole run whenever
 * `EVIDENCE_DIR` is set. Two populations with no compiler between them: entries
 * come from the recordings, `src` attributes come from the journey list.
 *
 * Measured on #158's own full-scope proof run: 120 recordings published, 100
 * referenced, 20 files served to a page naming their journeys nowhere. The
 * waste is the smaller half. Four real journeys ran on five engines and
 * appeared on NO evidence page -- including `no console errors on load` -- so
 * the page under-reported the coverage an operator signs off against, and did
 * so silently, which is the failure this whole ticket exists to remove.
 */
describe('a journey that captured nothing is still on the page', () => {
  const JOURNEY = 'a recorded journey';
  const SLUG = 'a-recorded-journey';
  const reportNamingAnUncapturedJourney = {
    ...REPORT,
    suites: [
      ...REPORT.suites,
      {
        specs: [
          {
            title: JOURNEY,
            tests: [
              {
                projectName: 'chromium',
                results: [{ status: 'passed', duration: 7, attachments: [] }],
              },
            ],
          },
        ],
      },
    ],
  };

  it('gives it a section although no manifest row names it', () => {
    // The precondition IS part of the assertion: add a manifest row for this
    // title and the old manifest-derived list renders it anyway, leaving a
    // guard that passes without testing what it claims to.
    expect(MANIFEST.filter((m) => m.title.endsWith(JOURNEY))).toEqual([]);

    const html = build({ report: reportNamingAnUncapturedJourney });

    expect(html).toContain(`id="j-${SLUG}"`);
    expect(html).toContain(JOURNEY);
    // Control on the population: a page that rendered no journey at all cannot
    // satisfy this, so the assertion above is about derivation, not emptiness.
    expect(html).toContain('id="j-a-journey"');
  });

  it('references every recording it was given', () => {
    const videos = new Map(
      [`${SLUG}|chromium`, 'a-journey|chromium'].map((key) => [
        key,
        publishedVideoPath(key),
      ]),
    );
    const html = build({ report: reportNamingAnUncapturedJourney, videos });
    const keys = [...videos.keys()];

    const unreferenced = keys.filter(
      (key) => !html.includes(`src="${publishedVideoPath(key)}"`),
    );
    expect(
      searched(unreferenced, {
        of: keys,
        what: 'recordings handed to the page',
      }),
    ).toEqual([]);
  });
});

describe('the builder builds its page from any checkout path (#221)', () => {
  // Its entry check once compared `import.meta.url` with a `file://` template
  // around `process.argv[1]`. The URL is percent-encoded and the path is not,
  // so from a checkout whose path held a space `main()` never ran, and the
  // build exited 0 having written nothing.
  let checkout: ScriptCheckout;
  let dir = '';
  beforeAll(() => {
    checkout = scriptCheckout();
    dir = mkdtempSync(join(tmpdir(), 'evidence-entry-'));
  });
  afterAll(() => {
    checkout.remove();
    rmSync(dir, { recursive: true, force: true });
  });

  it('builds it when run from a checkout whose path holds a space', () => {
    const row = manifestRow(
      {
        project: 'chromium',
        title: 'suite > a journey',
        order: 1,
        label: 'thing 1',
        file: 'chromium/a__01.png',
      },
      new Date(Date.parse(REPORT.stats.startTime) + 5_000),
    );
    mkdirSync(join(dir, 'chromium'));
    writeFileSync(join(dir, row.file), png(10));
    writeFileSync(join(dir, EVIDENCE_MANIFEST), `${JSON.stringify(row)}\n`);
    writeFileSync(
      join(dir, EVIDENCE_REPORT),
      JSON.stringify(reportOf([{ journey: 'a journey', project: 'chromium' }])),
    );
    const page = join(dir, 'page.html');

    const built = runBuilder(
      dir,
      page,
      join(checkout.spaced, 'build-evidence-page.mjs'),
    );

    // The precondition, so the test cannot drift into proving nothing.
    expect(checkout.spaced).toContain(' ');
    expect(built.stdout, built.stderr).toContain('shots=1 videos=0/0');
    expect(built.status, built.stderr).toBe(0);
    expect(readFileSync(page, 'utf8')).toContain(
      readFileSync(join(dir, row.file)).toString('base64'),
    );
  });
});
