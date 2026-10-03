import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import {
  assetsMap,
  parseAssetListing,
  pendingUploads,
  planOf,
  UPLOAD_BATCH,
} from '../../scripts/upload-evidence-assets.mjs';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A real listing, copied verbatim from `Artifact action:"list" scope:"assets"`
 * against the `Asset Store Probe` artifact on 2026-09-22. The script parses
 * this text itself: asking anyone to turn it into JSON first would put the
 * hand-transcription #291 exists to remove straight back into the loop.
 */
const LISTING = [
  // Two of the run's 25 lines, and the header says so: the parser checks the
  // lines against this count, so an excerpt that kept 25 here would be a
  // fixture that disagrees with itself.
  'Assets of https://claude.ai/artifact/87T37HGYVnkZLKSt8hXH9G: 2 files, 4190 of 1073741824 bytes used (limit 5000 files).',
  'Oldest first; reference one from the page by its url verbatim, read or delete it by the id after "_blob/":',
  '- /_blob/c6574fb0cc659355f8def4c920def8e3  image/png  94 bytes  2026-09-22T02:20:31.99655Z  sha256 7b75017401c82f7c6c2cb0d325d7a705e0fa6194ab7dbdfc43f4763376060f57',
  '- /_blob/01b125997c05a9d2db8be6c8220262a2  video/mp4  4096 bytes  2026-09-22T02:20:32.975742Z  sha256 aa75017401c82f7c6c2cb0d325d7a705e0fa6194ab7dbdfc43f4763376060f5e',
].join('\n');

describe('reading what the asset store already holds', () => {
  it('takes the id, the byte count and the sha256 off every asset line', () => {
    expect(parseAssetListing(LISTING)).toEqual([
      {
        id: 'c6574fb0cc659355f8def4c920def8e3',
        bytes: 94,
        sha256:
          '7b75017401c82f7c6c2cb0d325d7a705e0fa6194ab7dbdfc43f4763376060f57',
      },
      {
        id: '01b125997c05a9d2db8be6c8220262a2',
        bytes: 4096,
        sha256:
          'aa75017401c82f7c6c2cb0d325d7a705e0fa6194ab7dbdfc43f4763376060f5e',
      },
    ]);
  });

  it('refuses a line the listing format does not explain, rather than skipping it', () => {
    const changed = LISTING.replace(' 94 bytes ', ' 94 B ');
    expect(() => parseAssetListing(changed)).toThrow(
      /1 asset line\(s\) the listing format does not explain/,
    );
  });

  it('reads an empty store as empty, because that is what a first run sees', () => {
    // The store starts empty. Refusing here would make the first upload of
    // any artifact impossible.
    expect(
      parseAssetListing(
        'Assets of https://x: 0 files, 0 of 1073741824 bytes used (limit 5000 files).',
      ),
    ).toEqual([]);
  });

  it('refuses a listing that lists fewer assets than its own header declares', () => {
    // A store with nothing in it and a listing this script read only half of
    // are the same sight -- a short list -- and only one is good news. The
    // listing pages, so a page taken for the whole store would re-upload
    // every recording beyond it. The header's own count is the control.
    const truncated = LISTING.replace('2 files', '99 files');
    expect(() => parseAssetListing(truncated)).toThrow(
      /2 asset line\(s\) against the 99 its header declares/,
    );
  });
});

describe('pairing a recording with the asset that holds it', () => {
  let dir = '';
  /** Real files, really hashed: the join this script exists for is content. */
  const recordings: Record<string, string> = {};
  const stored: { id: string; bytes: number; sha256: string }[] = [];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'upload-assets-'));
    for (const [key, body] of [
      ['a-journey', 'first recording'],
      ['another-journey', 'second recording, different bytes'],
    ]) {
      const abs = join(dir, `${key}.webm`);
      writeFileSync(abs, body);
      recordings[key] = abs;
      stored.push({
        id: createHash('md5').update(key).digest('hex'),
        bytes: Buffer.byteLength(body),
        sha256: createHash('sha256').update(body).digest('hex'),
      });
    }
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('gives each key the id of the asset whose content is that file', () => {
    const map = assetsMap({ plan: recordings, stored });
    expect(map).toEqual({
      'a-journey': `/_blob/${stored[0].id}`,
      'another-journey': `/_blob/${stored[1].id}`,
    });
    // The control that matters: two different recordings must not resolve to
    // one id. A join returning the first asset for everything satisfies the
    // shape above only if this is asserted.
    expect(map['a-journey']).not.toBe(map['another-journey']);
  });

  it('gives two keys the same id when their recordings are byte-identical', () => {
    // Measured on the real store: 25 identical files were stored under 25 ids
    // sharing ONE sha256. Two journeys whose recordings are byte-identical
    // therefore resolve to the same asset, which is correct -- the same bytes
    // render the same recording -- and is why nothing here may assume one id
    // per key.
    const twin = join(dir, 'twin.webm');
    writeFileSync(twin, 'first recording');
    const map = assetsMap({
      plan: { ...recordings, twin },
      stored,
    });
    expect(map.twin).toBe(map['a-journey']);
  });

  it('refuses a key whose recording the store does not hold, naming it', () => {
    // By the time the map is built every recording has been uploaded, so a
    // key with no asset is a journey that will render with no source -- which
    // reads exactly like one that was never recorded. Before the upload the
    // same state means "still to do", and that reading belongs to
    // `pendingUploads`, not here.
    expect(() => assetsMap({ plan: recordings, stored: [stored[0]] })).toThrow(
      /another-journey/,
    );
  });

  it('refuses an asset whose stored byte count is not the file it came from', () => {
    // The listing reports what the store actually holds. If that disagrees
    // with the file on disk, the upload did not land what we think it did,
    // and the page would show it to the operator as evidence.
    const short = [stored[0], { ...stored[1], bytes: stored[1].bytes - 1 }];
    expect(() => assetsMap({ plan: recordings, stored: short })).toThrow(
      /byte/,
    );
  });
});

describe('what is still to upload', () => {
  let dir = '';
  const plan: Record<string, string> = {};
  const stored: { id: string; bytes: number; sha256: string }[] = [];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'upload-pending-'));
    // Sixty, so the batching is exercised by a number no call can take at
    // once. Derived from the plan, never a written-out list: a hand-written
    // list misses the entry that breaks.
    for (let n = 0; n < 60; n += 1) {
      const key = `journey-${n}`;
      const abs = join(dir, `${key}.webm`);
      const body = `recording ${n}`;
      writeFileSync(abs, body);
      plan[key] = abs;
      if (n < 4)
        stored.push({
          id: createHash('md5').update(key).digest('hex'),
          bytes: Buffer.byteLength(body),
          sha256: createHash('sha256').update(body).digest('hex'),
        });
    }
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('leaves out every recording the store already holds', () => {
    const batches = pendingUploads({ plan, stored });
    const paths = batches.flat();
    expect(paths).toHaveLength(56);
    // The liveness control: an empty store must give back all sixty, or a
    // function returning nothing at all would satisfy the count above only
    // by accident of arithmetic.
    expect(pendingUploads({ plan, stored: [] }).flat()).toHaveLength(60);
    for (let n = 0; n < 4; n += 1)
      expect(paths).not.toContain(plan[`journey-${n}`]);
  });

  it('never puts more in one batch than a single call takes', () => {
    const batches = pendingUploads({ plan, stored: [] });
    expect(batches.map((batch) => batch.length)).toEqual([25, 25, 10]);
    expect(UPLOAD_BATCH).toBe(25);
  });
});

describe('what a refusal looks like from the command line', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'upload-cli-'));
    writeFileSync(join(dir, 'a.webm'), 'a recording nobody uploaded');
    writeFileSync(
      join(dir, 'plan.json'),
      JSON.stringify({ 'a-journey': join(dir, 'a.webm') }),
    );
    writeFileSync(
      join(dir, 'listing.txt'),
      'Assets of https://x: 0 files, 0 of 1073741824 bytes used (limit 5000 files).\n',
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('refuses with one line and exit 1, not an unhandled stack trace', () => {
    const run = spawnSync(
      process.execPath,
      [
        'scripts/upload-evidence-assets.mjs',
        '--plan',
        join(dir, 'plan.json'),
        '--listing',
        join(dir, 'listing.txt'),
        '--out',
        join(dir, 'assets.json'),
      ],
      { encoding: 'utf8' },
    );
    expect(run.stderr).toContain('a-journey');
    // A stack trace is what an unhandled throw looks like. Every other script
    // here refuses through `die`, and an operator reading `at main (...)` has
    // been shown an internal error rather than a decision.
    expect(run.stderr).not.toContain('at main');
    expect(run.stderr.startsWith('✗')).toBe(true);
    expect(run.status).toBe(1);
  });
});

describe('a listing in another spelling (#390)', () => {
  it('refuses asset lines under no header, which it cannot count', () => {
    const headless = LISTING.split('\n').slice(1).join('\n');
    expect(() => parseAssetListing(headless)).toThrow(
      /that text carries no asset listing header/,
    );
  });

  it('reads a listing saved with CRLF line ends as the same listing', () => {
    expect(parseAssetListing(LISTING.replace(/\n/g, '\r\n'))).toEqual(
      parseAssetListing(LISTING),
    );
  });
});

describe('the plan, before anything reads it (#390)', () => {
  it('passes a plan of keys to recording paths', () => {
    const plan = { 'a-journey': '/r/a.webm' };
    expect(planOf(plan)).toBe(plan);
  });

  it.each([
    ['a list', [], /the plan is not an object/],
    ['null', null, /the plan is not an object/],
    ['an empty plan', {}, /the plan names no recording/],
    [
      'a path of 7',
      { a: 7, b: '/r/b.webm' },
      /1 plan key\(s\) with no recording path: a$/,
    ],
    [
      'a blank path',
      { a: '/r/a.webm', b: '' },
      /1 plan key\(s\) with no recording path: b$/,
    ],
  ])('refuses %s', (_, plan, message) => {
    expect(() => planOf(plan)).toThrow(message);
  });
});

describe('uploading each recording once (#390)', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'upload-once-'));
    writeFileSync(join(dir, 'a.webm'), 'one recording');
    writeFileSync(join(dir, 'twin.webm'), 'one recording');
    writeFileSync(join(dir, 'b.webm'), 'another recording');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('sends a byte-identical recording, or a path named twice, once', () => {
    const plan = {
      a: join(dir, 'a.webm'),
      twin: join(dir, 'twin.webm'),
      again: join(dir, 'a.webm'),
      b: join(dir, 'b.webm'),
    };
    expect(pendingUploads({ plan, stored: [] })).toEqual([
      [join(dir, 'a.webm'), join(dir, 'b.webm')],
    ]);
  });
});

describe('upload-evidence-assets.mjs as a command (#390)', () => {
  let dir = '';
  const at = (name: string) => join(dir, name);
  /** An asset line as the listing prints it, for a file on disk. */
  const assetLine = (id: string, body: string) =>
    `- /_blob/${id}  video/webm  ${Buffer.byteLength(body)} bytes  ` +
    `2026-09-30T00:00:00Z  sha256 ${createHash('sha256').update(body).digest('hex')}`;
  const listing = (lines: string[]) =>
    [
      `Assets of https://x: ${lines.length} files, 0 of 1073741824 bytes used (limit 5000 files).`,
      ...lines,
    ].join('\n');
  const run = (...args: string[]) => {
    const result = spawnSync(
      process.execPath,
      ['scripts/upload-evidence-assets.mjs', ...args],
      { encoding: 'utf8' },
    );
    return { code: result.status, out: result.stdout, err: result.stderr };
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'upload-command-'));
    writeFileSync(at('a.webm'), 'first recording');
    writeFileSync(at('b.webm'), 'second recording');
    writeFileSync(
      at('plan.json'),
      JSON.stringify({ 'a-journey': at('a.webm'), 'b-journey': at('b.webm') }),
    );
    writeFileSync(at('empty.txt'), listing([]));
    writeFileSync(
      at('held.txt'),
      listing([
        assetLine('a'.repeat(32), 'first recording'),
        assetLine('b'.repeat(32), 'second recording'),
      ]),
    );
    writeFileSync(at('empty-plan.json'), '{}');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('prints what is still to upload, one call per line', () => {
    const { code, out, err } = run(
      '--plan',
      at('plan.json'),
      '--listing',
      at('empty.txt'),
    );
    expect(err).toBe('');
    expect(out).toBe(
      'upload-evidence-assets: 2 recording(s) still to upload, in 1 call(s) of at most 25:\n' +
        `${JSON.stringify([at('a.webm'), at('b.webm')])}\n`,
    );
    expect(code).toBe(0);
  });

  it('says when the store already holds everything', () => {
    const { code, out } = run(
      '--plan',
      at('plan.json'),
      '--listing',
      at('held.txt'),
    );
    expect(out).toBe(
      'upload-evidence-assets: the store already holds every recording in ' +
        'that plan. Re-run the listing, then pass --out to write the map.\n',
    );
    expect(code).toBe(0);
  });

  it('writes the map with --out, and says how many it paired', () => {
    const { code, out, err } = run(
      '--plan',
      at('plan.json'),
      '--listing',
      at('held.txt'),
      '--out',
      at('assets.json'),
    );
    expect(err).toBe('');
    expect(out).toBe(
      `upload-evidence-assets: wrote 2 pairing(s) to ${at('assets.json')}\n`,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(at('assets.json'), 'utf8'))).toEqual({
      'a-journey': `/_blob/${'a'.repeat(32)}`,
      'b-journey': `/_blob/${'b'.repeat(32)}`,
    });
  });

  it('refuses a plan that names nothing', () => {
    const { code, err } = run(
      '--plan',
      at('empty-plan.json'),
      '--listing',
      at('held.txt'),
      '--out',
      at('never.json'),
    );
    expect(err).toContain('the plan names no recording');
    expect(code).toBe(1);
  });

  it.each([
    [
      'a mistyped option, which would skip the map in silence',
      ['--outt', 'x'],
      "upload-evidence-assets: Unknown option '--outt'",
    ],
    [
      'an option whose value is the next option',
      ['--plan', '--listing', 'x'],
      "upload-evidence-assets: Option '--plan' argument is ambiguous.",
    ],
  ])('names %s, and refuses', (_, args, says) => {
    const { code, err } = run(...args);
    expect(err).toContain(says);
    expect(err).toContain('usage: upload-evidence-assets.mjs');
    expect(code).toBe(2);
  });
});
