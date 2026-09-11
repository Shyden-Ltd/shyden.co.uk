import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  imageSize,
  mediaType,
  PUBLISH_NOTE,
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
