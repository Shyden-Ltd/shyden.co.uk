import { describe, expect, it } from 'vitest';
import {
  itemKey,
  PUBLISH_NOTE,
  publishedVideoPath,
  renderEvidencePage,
  REVIEW_DATA_ID,
  sha256Of,
} from '../../scripts/build-evidence-page.mjs';
import { searched } from '../source-files';

/**
 * What the evidence page's review viewer steps through, and the key every
 * decision about it is stored under (#205).
 *
 * The key is the review's identity, so it carries a digest of the file's own
 * bytes. A page is republished after a recapture, and a decision made about the
 * old picture must never be shown against the new one: the operator would be
 * reading an approval of something they have not seen. Same bytes, same key,
 * on every build; different bytes, a different key.
 *
 * Asserted over the page the builder RENDERS, not over a helper's return value
 * alone: the page script reads the items from the rendered data block, so a
 * derivation that is right in isolation and wired wrongly into the page is the
 * failure worth catching.
 */

const FIRST = 'the first journey';
const SECOND = 'the second journey';
const SIGNOFF_KEY = 'ticket-205';

const slug = (title: string) => title.replace(/ /g, '-');

const row = (project: string, title: string, order: number, label: string) => ({
  project,
  title: `evidence review > ${title}`,
  order,
  label,
  file: `${project}/${slug(title)}-${order}.png`,
});

/**
 * Deliberately NOT in page order: the second assertion before the first and
 * webkit before chromium, so an item list that followed the manifest's rows
 * would fail on order rather than pass by coincidence.
 */
const MANIFEST = [
  row('webkit', FIRST, 2, 'the result shows'),
  row('chromium', FIRST, 2, 'the result shows'),
  row('webkit', FIRST, 1, 'the form is empty'),
  row('chromium', FIRST, 1, 'the form is empty'),
  row('chromium', SECOND, 1, 'the page loads'),
];

const spec = (title: string) => ({
  title,
  tests: ['chromium', 'webkit'].map((projectName) => ({
    projectName,
    results: [{ status: 'passed', duration: 100, attachments: [] }],
  })),
});

const REPORT = {
  stats: {
    startTime: '2026-09-17T08:00:00.000Z',
    duration: 1000,
    expected: 4,
    unexpected: 0,
    flaky: 0,
    skipped: 0,
  },
  suites: [{ specs: [spec(FIRST), spec(SECOND)] }],
};

const dataUri = (bytes: Buffer, type = 'image/png') =>
  `data:${type};base64,${bytes.toString('base64')}`;

const captureBytes = (file: string) => Buffer.from(`capture of ${file}`);

const SHOTS = new Map(
  MANIFEST.map((m) => [m.file, dataUri(captureBytes(m.file))]),
);

const recording = (journey: string, engine: string, bytes = 'take one') => {
  const key = `${slug(journey)}|${engine}`;
  return [
    key,
    {
      src: publishedVideoPath(key),
      sha256: sha256Of(Buffer.from(`${key} ${bytes}`)),
    },
  ] as const;
};

/** Recordings on both engines for the first journey, on webkit alone for the second. */
const VIDEOS = new Map([
  recording(FIRST, 'chromium'),
  recording(FIRST, 'webkit'),
  recording(SECOND, 'webkit'),
]);

const CONTENT = { title: 'Review fixture', signoffKey: SIGNOFF_KEY };

const build = (over: Record<string, unknown> = {}) =>
  renderEvidencePage({
    manifest: MANIFEST,
    report: REPORT,
    content: CONTENT,
    shots: SHOTS,
    videos: VIDEOS,
    ...over,
  });

interface ReviewItem {
  key: string;
  kind: 'screenshot' | 'recording';
  journey: string;
  journeyTitle: string;
  assertion: number | null;
  label: string;
  engine: string;
  filename: string;
  src?: string;
}

/** The review data exactly as the rendered page hands it to its own script. */
const reviewOf = (
  html: string,
): { signoffKey: string; journeys: string[]; items: ReviewItem[] } => {
  const open = `<script type="application/json" id="${REVIEW_DATA_ID}">`;
  const start = html.indexOf(open);
  if (start < 0) throw new Error('the page carries no review data block');
  const end = html.indexOf('</script>', start);
  return JSON.parse(html.slice(start + open.length, end));
};

const itemsOf = (html: string) => reviewOf(html).items;

/** An item named the way a reader would name it: journey, assertion or rec, engine. */
const named = (item: ReviewItem) =>
  `${item.journeyTitle} ${item.assertion ?? 'rec'} ${item.engine}`;

describe('the review items are every capture on the page, in page order', () => {
  it('lists each journey’s screenshots by assertion then engine, then that journey’s recordings', () => {
    expect(itemsOf(build()).map(named)).toEqual([
      `${FIRST} 1 chromium`,
      `${FIRST} 1 webkit`,
      `${FIRST} 2 chromium`,
      `${FIRST} 2 webkit`,
      `${FIRST} rec chromium`,
      `${FIRST} rec webkit`,
      `${SECOND} 1 chromium`,
      `${SECOND} rec webkit`,
    ]);
  });

  it('never makes an item of a placeholder', () => {
    const html = build();
    // Control: the page really does render both placeholders, so their absence
    // from the items below is a decision and not an accident of the fixture.
    expect(html).toContain('not captured');
    expect(html).toContain('not embedded');
    const items = itemsOf(html).map(named);
    expect(items).not.toContain(`${SECOND} 1 webkit`);
    expect(items).not.toContain(`${SECOND} rec chromium`);
  });

  it('describes each item the way the viewer shows it', () => {
    const [first, , , , firstRecording] = itemsOf(build());
    expect(first).toMatchObject({
      kind: 'screenshot',
      journeyTitle: FIRST,
      assertion: 1,
      label: 'the form is empty',
      engine: 'chromium',
    });
    expect(firstRecording).toMatchObject({
      kind: 'recording',
      journeyTitle: FIRST,
      assertion: null,
      label: 'Recording',
      engine: 'chromium',
      src: publishedVideoPath(`${slug(FIRST)}|chromium`),
    });
  });

  it('marks every captured figure on the page with the key of its item', () => {
    const html = build();
    const keys = itemsOf(html).map((item) => item.key);
    const unmarked = keys.filter((key) => !html.includes(`data-item="${key}"`));
    expect(searched(unmarked, { of: keys, what: 'review items' })).toEqual([]);
  });

  it('names the sign-off the items belong to', () => {
    expect(reviewOf(build()).signoffKey).toBe(SIGNOFF_KEY);
  });
});

describe('an item key names its journey, assertion, engine and bytes', () => {
  const DIGEST_OF_X =
    '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881';

  it('digests bytes with SHA-256', () => {
    // A literal, not a second computation: a digest checked against the same
    // function that produced it would agree with any function at all.
    expect(sha256Of(Buffer.from('x'))).toBe(DIGEST_OF_X);
  });

  it('joins the parts with the first 12 hex digits of the digest', () => {
    expect(
      itemKey({
        journey: 'the-first-journey',
        assertion: 2,
        engine: 'webkit',
        sha256: DIGEST_OF_X,
      }),
    ).toBe('the-first-journey-2-webkit-2d711642b726');
  });

  it('spells a recording rec, and an engine in lower-case words', () => {
    expect(
      itemKey({
        journey: 'the-first-journey',
        assertion: 'rec',
        engine: 'Mobile Safari',
        sha256: DIGEST_OF_X,
      }),
    ).toBe('the-first-journey-rec-mobile-safari-2d711642b726');
  });

  it('refuses to build a key without a whole digest', () => {
    for (const sha256 of ['', DIGEST_OF_X.slice(0, 12), 'x'.repeat(64)])
      expect(
        () => itemKey({ journey: 'a', assertion: 1, engine: 'webkit', sha256 }),
        `accepted ${JSON.stringify(sha256)} as a digest`,
      ).toThrow(/SHA-256/);
  });

  it('uses only lower-case letters, digits and hyphens in every key the page carries', () => {
    const keys = itemsOf(build()).map((item) => item.key);
    const unsafe = keys.filter((key) => !/^[a-z0-9-]+$/.test(key));
    expect(searched(unsafe, { of: keys, what: 'item keys' })).toEqual([]);
  });

  it('gives the same bytes the same key on every build', () => {
    expect(itemsOf(build()).map((item) => item.key)).toEqual(
      itemsOf(build()).map((item) => item.key),
    );
  });

  it('gives a recaptured screenshot a new key, and leaves every other key alone', () => {
    const recaptured = MANIFEST[3]; // chromium, first journey, assertion 1
    const before = itemsOf(build());
    const after = itemsOf(
      build({
        shots: new Map([
          ...SHOTS,
          [recaptured.file, dataUri(Buffer.from('a different picture'))],
        ]),
      }),
    );
    const changed = after
      .filter((item, index) => item.key !== before[index].key)
      .map(named);
    expect(changed).toEqual([`${FIRST} 1 chromium`]);
  });

  it('gives a re-recorded recording a new key, and leaves every other key alone', () => {
    const before = itemsOf(build());
    const after = itemsOf(
      build({
        videos: new Map([...VIDEOS, recording(FIRST, 'webkit', 'take two')]),
      }),
    );
    const changed = after
      .filter((item, index) => item.key !== before[index].key)
      .map(named);
    expect(changed).toEqual([`${FIRST} rec webkit`]);
  });

  it('refuses a recording it has no digest for', () => {
    const [key, { src }] = recording(FIRST, 'webkit');
    expect(() => build({ videos: new Map([[key, { src }]]) })).toThrow(
      /SHA-256/,
    );
  });

  it('refuses a screenshot whose bytes it cannot read', () => {
    const [first] = MANIFEST;
    expect(() =>
      build({
        shots: new Map([
          ...SHOTS,
          [first.file, 'https://elsewhere.test/a.png'],
        ]),
      }),
    ).toThrow(/base64 data URI/);
  });

  it('refuses two items that would share a key', () => {
    // Two titles that slug alike, captured with the same bytes: one stored
    // decision would answer for both, and nothing on the page would say so.
    const twin = {
      ...MANIFEST[3],
      title: 'evidence review > the first, journey',
    };
    const shots = new Map([...SHOTS, [twin.file, SHOTS.get(twin.file) ?? '']]);
    expect(() =>
      build({
        manifest: [...MANIFEST, twin],
        shots,
      }),
    ).toThrow(/share a key/);
  });

  it('refuses a key longer than a storage path segment allows', () => {
    // db.d.ts: at most 200 bytes per segment. The page would throw building the
    // path at run time, and every decision on the page would fail with it.
    const long = 'a'.repeat(190);
    const manifest = [{ ...MANIFEST[3], title: `evidence review > ${long}` }];
    expect(() =>
      build({
        manifest,
        report: { ...REPORT, suites: [{ specs: [spec(long)] }] },
        videos: new Map(),
      }),
    ).toThrow(/200 bytes/);
  });

  it('refuses a sign-off key that is not one storage path segment', () => {
    expect(() =>
      build({ content: { ...CONTENT, signoffKey: 'ticket/205' } }),
    ).toThrow(/sign-off key/);
  });
});

describe('every item downloads under a name that says what it is', () => {
  it('names a screenshot by sign-off, journey, assertion and engine', () => {
    const [first] = itemsOf(build());
    expect(first.filename).toBe(
      `${SIGNOFF_KEY}-the-first-journey-1-chromium.png`,
    );
  });

  it('names a recording rec, with the extension it was published under', () => {
    const recordings = itemsOf(build()).filter(
      (item) => item.kind === 'recording',
    );
    expect(recordings.map((item) => item.filename)).toEqual([
      `${SIGNOFF_KEY}-the-first-journey-rec-chromium.webm`,
      `${SIGNOFF_KEY}-the-first-journey-rec-webkit.webm`,
      `${SIGNOFF_KEY}-the-second-journey-rec-webkit.webm`,
    ]);
  });

  it('takes a screenshot’s extension from its media type', () => {
    const jpeg = new Map(
      MANIFEST.map((m) => [
        m.file,
        dataUri(captureBytes(m.file), 'image/jpeg'),
      ]),
    );
    const [first] = itemsOf(build({ shots: jpeg }));
    expect(first.filename).toBe(
      `${SIGNOFF_KEY}-the-first-journey-1-chromium.jpg`,
    );
  });
});

describe('the build says how the review is granted and read back', () => {
  it('names the full declaration the page needs', () => {
    expect(PUBLISH_NOTE).toContain(
      '{"db": {}, "downloads": true, "comments": {}}',
    );
  });

  it('names how a session reads the review back', () => {
    expect(PUBLISH_NOTE).toContain('ArtifactData list signoff/<key>/items');
  });

  it('declares only capabilities the RENDERED page reaches for', () => {
    // The seam in both directions: a declaration the page never uses is a
    // grant nobody needed, and a capability the page uses but the note omits
    // resolves null on the published page.
    const html = build();
    for (const name of ['db', 'downloads', 'comments'])
      expect(html, `the page no longer reaches for ${name}`).toContain(
        `use('${name}')`,
      );
  });
});
