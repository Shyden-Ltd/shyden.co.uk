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
import { isAbsolute, join, relative, resolve } from 'node:path';
import { withoutTsComments } from './source-text';
import { filesUnder, tsFilesUnder, searched } from '../source-files';
import { reportLocation } from '../../scripts/test-e2e.mjs';
import {
  CONTRACT_MODULE,
  EVIDENCE_JPEG_QUALITY,
  EVIDENCE_MANIFEST,
  EVIDENCE_REPORT,
} from '../../scripts/evidence-files.mjs';
import { captureOptions } from '../e2e/evidence';
import {
  droppedLine,
  imageSize,
  mediaType,
  PUBLISH_NOTE,
  renderEvidencePage,
  selectMedia,
  videoCandidates,
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

  it('names every recording the budget left out, not only how many', () => {
    // `selectMedia` hands back WHAT it dropped so the build can say which; a
    // bare count sends the operator hunting through the page for the gaps.
    const line = droppedLine(
      [
        { key: 'a-journey|webkit', bytes: 900 },
        { key: 'b-journey|firefox', bytes: 900 },
      ],
      12,
    );
    expect(line).toContain('DROPPED=2 (budget 12MB)');
    expect(line).toContain('a-journey|webkit');
    expect(line).toContain('b-journey|firefox');
  });

  it('adds nothing to the build line when nothing was dropped', () => {
    expect(droppedLine([], 12)).toBe('');
  });

  it('still shows, per journey, which engine the budget left out', () => {
    // Left out for size is a decision the page reports. Only a recording the
    // disk does not have is refused, below.
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

  /** A json report with one passing result per recording, grouped by journey. */
  const reportOf = (
    recordings: { journey: string; project: string; video?: string }[],
  ) => ({
    ...REPORT,
    suites: [
      {
        specs: [...new Set(recordings.map((r) => r.journey))].map((title) => ({
          title,
          tests: recordings
            .filter((r) => r.journey === title)
            .map((r) => ({
              projectName: r.project,
              results: [
                {
                  status: 'passed',
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

  it('keeps every recording on disk, charged for the base64 it becomes', () => {
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
      { key: 'a-journey|chromium', abs: chromium, bytes: 1370 },
      { key: 'a-journey|webkit', abs: webkit, bytes: 2740 },
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
    // The PNG signature and a 1x1 IHDR: all the builder reads of a capture.
    writeFileSync(
      join(dir, 'chromium', 'a__01.png'),
      Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex'),
    );
    writeFileSync(
      join(dir, EVIDENCE_MANIFEST),
      JSON.stringify({
        project: 'chromium',
        title: 'suite > a journey',
        order: 1,
        label: 'first thing',
        file: 'chromium/a__01.png',
      }) + '\n',
    );
    const content = join(dir, 'content.json');
    writeFileSync(content, JSON.stringify(CONTENT));
    const page = join(dir, 'page.html');
    const buildWith = (video: string) => {
      writeFileSync(
        join(dir, EVIDENCE_REPORT),
        JSON.stringify(
          reportOf([{ journey: 'a journey', project: 'chromium', video }]),
        ),
      );
      return spawnSync(
        process.execPath,
        [
          'scripts/build-evidence-page.mjs',
          '--evidence',
          dir,
          '--content',
          content,
          '--out',
          page,
        ],
        { encoding: 'utf8' },
      );
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
 * The page carries whatever the run captured, and knows what it is.
 *
 * Captures were PNG, which stores a screenshot of photographs losslessly at
 * roughly ten times the size of a quality-90 JPEG -- a fidelity nobody
 * consumes, since the page is read by an eye and pixel-exact comparison
 * belongs to the visual-regression suite and its own baselines. Measured on
 * #138: 80 shots came to 18.9 MiB, a 25.34 MiB page that could not be
 * published at all, and `selectMedia` dropped ALL EIGHTY videos against a
 * budget the shots had already exhausted -- so the standing requirement of a
 * video per journey was silently unmet (#146).
 *
 * The media type is read from the bytes, never from the extension: a capture
 * whose name and content disagree must still render, and an unknown format
 * must throw rather than emit a data URI the browser will not paint.
 */
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
});

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
