#!/usr/bin/env node
/**
 * Turn one evidence run into the interactive page an operator signs off.
 *
 * The standing rule (operator, 2026-08-22) is a screenshot per ASSERTION and a
 * video per JOURNEY, presented as a page he ticks through before anything
 * merges -- because green CI has meant nothing three times. `tests/e2e/
 * evidence.ts` captures that material during the run; this renders it.
 *
 * TWO PROPERTIES THIS FILE EXISTS TO KEEP
 *
 * 1. NO TICKET PROSE LIVES HERE. Every word specific to a ticket -- headline,
 *    lede, sections, the mutation ledger -- arrives in a content file. The
 *    first of these pages was built by hand for #96 with its wording inline;
 *    reused as-is, it would have described the wrong feature with total
 *    confidence. `tests/unit/evidence-page.test.ts` asserts this file contains
 *    none of the prose it renders, derived from the example content rather
 *    than a blocklist somebody has to remember to extend.
 *
 * 2. NOTHING IS SILENTLY DROPPED. A page missing captures the operator was
 *    told it contains is worse than no page: it looks like proof of assertions
 *    nobody can see. A manifest entry with no image is a THROW, not a gap.
 *
 * Everything structural -- engines, journeys, assertion order -- is derived
 * from Playwright's JSON report and the capture manifest rows that report's run
 * wrote, never an earlier run's (#171). A sixth engine, or a spec that runs on
 * fewer, is reflected without touching this code.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { EVIDENCE_MANIFEST, EVIDENCE_REPORT } from './evidence-files.mjs';

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Every spec result in the report, flattened. */
const flattenReport = (report) => {
  const out = [];
  const walk = (suite) => {
    for (const child of suite.suites || []) walk(child);
    for (const spec of suite.specs || [])
      for (const t of spec.tests)
        for (const r of t.results)
          out.push({
            title: spec.title,
            project: t.projectName,
            status: r.status,
            duration: r.duration,
            video: (r.attachments || []).find((a) => a.name === 'video')?.path,
          });
  };
  for (const suite of report.suites || []) walk(suite);
  return out;
};

/** An instant exactly as `Date.prototype.toISOString` writes one. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Milliseconds since the epoch, or NaN for anything that is not an ISO instant.
 *
 * Never `Date.parse` alone: it reads "0" as midnight on 1 January 2000 and
 * "2026" as that year's first instant, so a mangled start time would date an
 * earlier run's rows as this run's.
 */
const instantOf = (value) =>
  typeof value === 'string' && ISO_INSTANT.test(value)
    ? Date.parse(value)
    : Number.NaN;

/** `webkit 15, firefox 2`: rows counted by engine, in first-seen order. */
const byEngine = (rows) => {
  const counts = new Map();
  for (const row of rows)
    counts.set(row.project, (counts.get(row.project) ?? 0) + 1);
  return [...counts].map(([engine, n]) => `${engine} ${n}`).join(', ');
};

/**
 * The manifest rows the reported run wrote, and the ones an earlier run left.
 *
 * `tests/e2e/evidence.ts` APPENDS to the manifest and nothing clears it, so a
 * second run into one evidence directory kept the first run's rows: webkit,
 * then chromium, built a page embedding 15 webkit captures under a report that
 * ran chromium alone (#171). Each row is stamped as it is written, and a run's
 * rows are those stamped at or after its report's `stats.startTime`, which
 * Playwright takes as the run is configured -- before the web server starts,
 * so before any capture.
 *
 * Set aside, never deleted: an earlier run's files stay where they are, and
 * the caller names what was left out. A row with no stamp predates stamping,
 * so it is an earlier run's by definition. What cannot be dated is refused
 * rather than guessed at: a report with no readable start, a stamp that is not
 * an instant, and a manifest in which nothing is the run's own.
 */
export const capturesOfThisRun = (manifest, report) => {
  const startTime = report.stats?.startTime;
  const start = instantOf(startTime);
  if (Number.isNaN(start))
    throw new Error(
      `build-evidence-page: ${EVIDENCE_REPORT} has no readable stats.startTime ` +
        `(${JSON.stringify(startTime)}), so no capture can be told apart from ` +
        "an earlier run's. Refusing to guess.",
    );

  const current = [];
  const earlier = [];
  for (const row of manifest) {
    if (row.at === undefined) {
      earlier.push(row);
      continue;
    }
    const at = instantOf(row.at);
    if (Number.isNaN(at))
      throw new Error(
        `build-evidence-page: ${EVIDENCE_MANIFEST} stamps ${row.file} with ` +
          `${JSON.stringify(row.at)}, which is not an instant. Refusing to ` +
          'guess which run captured it.',
      );
    (at >= start ? current : earlier).push(row);
  }

  if (!current.length)
    throw new Error(
      `build-evidence-page: nothing in ${EVIDENCE_MANIFEST} was captured by ` +
        `the run ${EVIDENCE_REPORT} describes, which started ${startTime}` +
        (earlier.length
          ? `; its ${earlier.length} row(s) are an earlier run's: ${byEngine(earlier)}`
          : '') +
        '. Refusing to emit a page with no evidence of this run. Capture ' +
        'again, into this directory or a fresh one.',
    );
  return { current, earlier };
};

/**
 * What the build line adds about an earlier run: how many rows were set aside,
 * and from which engines. Without it, a page built from part of a directory
 * reads exactly like one built from all of it.
 */
export const earlierLine = (earlier) =>
  earlier.length
    ? ` EARLIER=${earlier.length} (captured before this run started): ` +
      byEngine(earlier)
    : '';

/** The id of the JSON block the page hands its own review viewer. */
export const REVIEW_DATA_ID = 'evidence-review';

/** At most 200 bytes per storage path segment (db.d.ts). */
const MAX_SEGMENT_BYTES = 200;

const SHA_256_HEX = /^[0-9a-f]{64}$/;

/**
 * The SHA-256 of one capture's own bytes, in lower-case hex.
 *
 * @param {Buffer} bytes
 * @returns {string}
 */
export const sha256Of = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');

/**
 * Where one review decision is stored: journey, assertion, engine, and a
 * digest of the bytes the operator actually looked at.
 *
 * The digest is the point. A page is republished after a recapture, and a
 * decision taken against the OLD picture must never be shown against the new
 * one -- the operator would be reading an approval of something they have not
 * seen, which is the failure this whole page exists to prevent. Same bytes,
 * same key, on every build; different bytes, a different key and no decision
 * yet. A key built from journey and engine alone cannot tell those apart.
 *
 * @param {{journey: string, assertion: number|string, engine: string, sha256: string}} item
 * @returns {string}
 */
export const itemKey = ({ journey, assertion, engine, sha256 }) => {
  if (!SHA_256_HEX.test(String(sha256)))
    throw new Error(
      `build-evidence-page: ${JSON.stringify(sha256)} is not the SHA-256 of a ` +
        'capture. An item is keyed by the bytes it shows; without the digest a ' +
        'recaptured screenshot inherits the decision taken about the picture ' +
        'it replaced, and nothing on the page says so.',
    );
  const key = [
    slugOf(journey),
    assertion,
    slugOf(engine),
    String(sha256).slice(0, 12),
  ].join('-');
  const bytes = Buffer.byteLength(key);
  if (bytes > MAX_SEGMENT_BYTES)
    throw new Error(
      `build-evidence-page: item key is ${bytes} bytes, over the ` +
        `${MAX_SEGMENT_BYTES} bytes a storage path segment allows: ${key}. The ` +
        'page would throw building the path at run time, and every decision on ' +
        'it would fail with the first.',
    );
  return key;
};

const slugOf = (s) =>
  String(s)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

/**
 * Every recording the report names, resolved -- or a refusal naming each one
 * the disk does not have.
 *
 * A dangling path is lost evidence, not a smaller page. Playwright wrote the
 * videos into `test-results/`, the next ordinary run cleared that directory as
 * it started, and this skipped all 25 missing files and built anyway: every
 * journey read "0 of 5 engines embedded", indistinguishable from a budget
 * decision (#165). A result with NO recording attached is not a loss -- an
 * ordinary run records nothing.
 */
export const videoCandidates = (report) => {
  const candidates = [];
  const missing = [];
  for (const s of flattenReport(report)) {
    if (!s.video) continue;
    const abs = isAbsolute(s.video) ? s.video : join(process.cwd(), s.video);
    if (!existsSync(abs)) {
      missing.push(`"${s.title}" on ${s.project}: ${abs}`);
      continue;
    }
    // No size is carried: a recording is published, not inlined, so there is no
    // base64 inflation to charge, and `assertPublishLimits` reads each file's
    // size off the disk it publishes from. A second number here is one that can
    // drift from the file it describes.
    candidates.push({
      key: `${slugOf(s.title)}|${s.project}`,
      abs,
    });
  }
  if (missing.length)
    throw new Error(
      `build-evidence-page: ${EVIDENCE_REPORT} names ${missing.length} ` +
        `recording(s) that are not on disk:\n  ${missing.join('\n  ')}\n` +
        'Refusing to emit a page without the recordings its report claims. ' +
        'Capture again: Playwright clears its output directory when a run ' +
        'starts, so a recording kept outside the evidence directory does not ' +
        'survive the next run.',
    );
  return candidates;
};

/**
 * The one spelling of the directory recordings are published into.
 *
 * `reconcileFiles` clears this namespace and nothing else, so the prefix that
 * BUILDS a published path is the same prefix that AUTHORISES its removal. Two
 * spellings would be two namespaces the day one of them moved -- and the failure
 * is a removal rule that stops matching, which looks exactly like a capture with
 * nothing to remove.
 */
export const PUBLISHED_PREFIX = 'evidence/';

/**
 * Where one recording is published, from the `journey|engine` key it is held
 * under.
 *
 * One home, because two callers need the same answer: the files map a publish
 * carries, and the `src` the page points at. Spelled twice, the day one moved
 * the page would reference a path nothing published -- a broken `src` on a
 * journey that then reads as never recorded.
 *
 * @param {string} key
 * @returns {string}
 */
export const publishedVideoPath = (key) => {
  const [journey, project] = key.split('|');
  return `${PUBLISHED_PREFIX}${journey}-${slugOf(project)}.webm`;
};

/**
 * Every recording as a supporting file: published path -> the file on disk.
 *
 * The page carries media as base64 `data:` URIs at 4/3 of the bytes, all of it
 * inside the 16 MB one page is allowed, so scope and video completeness compete
 * for the same budget -- and the loser is silent (#146, again at a different
 * scope in #189). A supporting file is fetched separately and charged against
 * other ceilings: 15 MB per binary, 64 MB and 255 entries per publish.
 *
 * Which media moves is forced by the entry ceiling rather than chosen: full
 * scope is 175 shots + 120 recordings + the page = 296 entries, over the 255 a
 * publish allows. The recordings move because they are the larger bytes and the
 * ones being dropped; the shots stay inline.
 *
 * The path is RELATIVE with no leading slash -- an artifact does not serve a
 * root-relative path, and the failure is a broken `src` on a journey that then
 * reads as never recorded.
 *
 * Two recordings landing on one path is a THROW. Slugging joins on the same
 * separator the key does, so a journey ending where an engine begins collides:
 * `a-b|c` and `a|b-c` both publish as `a-b-c.webm`. Keeping the last silently
 * would file one journey's recording under another journey's claim, which is the
 * stale-video hazard this ticket exists to remove, arriving from the other end.
 *
 * Accumulated in a Map, not an object literal: `'constructor' in {}` is true, so
 * a journey slugged to a prototype member would report a collision that is not
 * there.
 *
 * @param {{ key: string, abs: string }[]} candidates
 * @returns {Record<string, string>}
 */
export const videoFiles = (candidates) => {
  const files = new Map();
  const collisions = [];
  for (const { key, abs } of candidates) {
    const path = publishedVideoPath(key);
    const taken = files.get(path);
    if (taken === undefined) files.set(path, abs);
    else collisions.push(`${path}: ${taken} and ${abs}`);
  }
  if (collisions.length)
    throw new Error(
      `build-evidence-page: ${collisions.length} published path(s) claimed by ` +
        `more than one recording:\n  ${collisions.join('\n  ')}\n` +
        "Refusing to publish a recording under another journey's claim: the " +
        'page would pair a current assertion with the wrong recording, and ' +
        'nothing about it would look wrong.',
    );
  return Object.fromEntries(files);
};

/**
 * The files a publish carries, with the previous capture's leftovers removed.
 *
 * A path left OUT of a redeploy's `files` map is kept, not removed -- the
 * opposite of what "publish" suggests. So a second capture leaves the first
 * capture's recordings in place, and two things follow: orphans accumulate
 * against the 64 MB and 255-entry ceilings until a publish is refused, and a
 * journey whose id survives a re-capture while its recording does not ends up
 * showing YESTERDAY'S video beside TODAY'S assertion. Nothing about that page
 * looks wrong, which makes it worse than one that drops a recording honestly.
 *
 * The removals are therefore explicit: `null` against every published path this
 * capture did not produce -- but ONLY inside `PUBLISHED_PREFIX`. The published
 * listing is everything the artifact serves, the page itself included, so
 * "remove whatever this capture did not produce" reads as correct and deletes
 * `index.html` with it. `preflight.js` at the artifact root is reserved, and a
 * publish that nulls it is refused outright. The recordings are the only thing
 * this builder owns.
 *
 * @param {{ desired: Record<string, string>, published: string[] }} args
 * @returns {Record<string, string | null>}
 */
export const reconcileFiles = ({ desired, published }) => {
  const files = { ...desired };
  for (const path of published)
    if (path.startsWith(PUBLISHED_PREFIX) && !Object.hasOwn(desired, path))
      files[path] = null;
  return files;
};

/** Entries one publish may carry. A removal occupies one of these. */
export const PUBLISH_MAX_FILES = 255;

/** Bytes one publish may carry, across every file with content in it. */
export const PUBLISH_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Refuse a file map the publish could not carry, naming what is over.
 *
 * A REMOVAL IS STILL AN ENTRY. `{path: null}` carries no bytes and occupies one
 * of the 255 slots, so a capture that clears a previous one spends two slots for
 * every journey whose recording changed. A guard counting only the entries with
 * content passes here and the publish is refused anyway -- reassuring and wrong,
 * and the failure arrives after the build reported success.
 *
 * Loudly, because silence is the defect this ticket exists to remove: #146 was
 * filed for a page that quietly held less than the operator was told it did, and
 * a ceiling discovered at publish time is that same failure moved one step
 * later.
 *
 * BOTH ceilings are reported in ONE refusal. Thrown in sequence, the first stops
 * the second, so a publish over both would name only its entry count -- and
 * whoever trimmed files to satisfy it would be refused again on bytes, by a
 * message that never mentioned them. A guard can be red for a true reason and
 * still send the diagnosis the wrong way (PR #156).
 *
 * @param {{
 *   files: Record<string, string | null>,
 *   sizeOf: (source: string) => number,
 * }} args
 */
export const assertPublishLimits = ({ files, sizeOf }) => {
  const entries = Object.keys(files);
  let bytes = 0;
  let removals = 0;
  for (const path of entries) {
    const source = files[path];
    if (source === null) removals += 1;
    else bytes += sizeOf(source);
  }
  const carried = entries.length - removals;
  const mb = (n) => `${(n / 1048576).toFixed(2)}MB`;

  const over = [];
  if (entries.length > PUBLISH_MAX_FILES)
    over.push(
      `${entries.length} entries (${carried} with content, ${removals} ` +
        `removals), over the ${PUBLISH_MAX_FILES} one publish allows`,
    );
  if (bytes > PUBLISH_MAX_BYTES)
    over.push(
      `${mb(bytes)} across ${carried} file(s), over the ` +
        `${mb(PUBLISH_MAX_BYTES)} one publish allows`,
    );
  if (over.length)
    throw new Error(
      `build-evidence-page: the publish would carry ${over.join('; and ')}. ` +
        'Refusing to build a page whose publish would be refused.',
    );
};

/** Bytes one published document may carry, its inline media included. */
export const PAGE_MAX_BYTES = 16 * 1024 * 1024;

/**
 * Refuse a page too large to publish, naming both sizes.
 *
 * NEVER a smaller page. The old build met a tight budget by emitting less and
 * reporting it on a line nobody reads, so the operator was handed a page that
 * looked complete and held less than he was told (#146, and again at a
 * different capture scope in #189). With the recordings published beside it the
 * page holds shots alone, and there is no honest reason to drop an assertion
 * shot -- so not fitting is a build failure. `DROPPED=` cannot appear on a
 * successful build any more because the concept is gone, not guarded.
 *
 * @param {number} bytes
 */
export const assertPageFits = (bytes) => {
  if (bytes > PAGE_MAX_BYTES)
    throw new Error(
      `build-evidence-page: the page is ${(bytes / 1048576).toFixed(2)}MB, ` +
        `over the ${(PAGE_MAX_BYTES / 1048576).toFixed(2)}MB one published ` +
        'document may carry. Refusing to write a page that cannot be ' +
        'published: narrow the capture scope, or lower EVIDENCE_JPEG_QUALITY.',
    );
};

/**
 * The page, as a string. Pure: every input is passed in, nothing is read here.
 */
const CAPTURE_DATA_URI = /^data:([^;,]+);base64,([\s\S]*)$/;

/**
 * One capture's declared type and its own bytes, read out of the `data:` URI
 * the page carries.
 *
 * A refusal rather than a skip: an item keyed by a digest of bytes fetched from
 * somewhere else is keyed by something this page does not show.
 */
const captureOf = (file, src) => {
  const match = CAPTURE_DATA_URI.exec(String(src));
  if (!match)
    throw new Error(
      `build-evidence-page: ${file} is not a base64 data URI. A review item is ` +
        'keyed by a digest of the bytes the page shows, and a src pointing ' +
        'anywhere else is not those bytes.',
    );
  return { type: match[1], bytes: Buffer.from(match[2], 'base64') };
};

/**
 * What a download of this capture should be CALLED, from the type its data URI
 * declares -- a different question from `mediaType`, which reads the real first
 * bytes to decide whether a browser can paint them at all.
 */
const extensionOf = (type) =>
  type === 'image/jpeg' ? 'jpg' : String(type).split('/').pop();

/**
 * A sign-off key is one storage path segment, so a slash in it would silently
 * nest every decision under a document nothing reads back.
 */
const assertSignoffKey = (key) => {
  if (!key || key.includes('/') || Buffer.byteLength(key) > MAX_SEGMENT_BYTES)
    throw new Error(
      `build-evidence-page: sign-off key ${JSON.stringify(key)} is not one ` +
        'storage path segment. Decisions would be written under a path nothing ' +
        'reads back, and the page would report them saved.',
    );
};

/**
 * Every capture on the page as one review item, in the order the page shows
 * them: each journey's screenshots by assertion then engine, then that
 * journey's recordings.
 *
 * Placeholders make no item. "Not captured" is a gap the page already states;
 * an item for it would ask the operator to approve a picture that does not
 * exist.
 */
const reviewItemsOf = ({ journeys, engines, shots, videos, signoffKey }) => {
  const items = [];
  for (const j of journeys) {
    for (const a of j.assertions)
      for (const shot of a.shots) {
        if (!shot) continue;
        const { type, bytes } = captureOf(shot.file, shots.get(shot.file));
        items.push({
          key: itemKey({
            journey: j.id,
            assertion: a.order,
            engine: shot.project,
            sha256: sha256Of(bytes),
          }),
          kind: 'screenshot',
          journey: j.id,
          journeyTitle: j.title,
          assertion: a.order,
          label: a.label,
          engine: shot.project,
          filename: `${signoffKey}-${j.id}-${a.order}-${slugOf(shot.project)}.${extensionOf(type)}`,
        });
      }
    for (const engine of engines) {
      const video = videos.get(`${j.id}|${engine}`);
      if (!video) continue;
      items.push({
        key: itemKey({
          journey: j.id,
          assertion: 'rec',
          engine,
          sha256: video.sha256,
        }),
        kind: 'recording',
        journey: j.id,
        journeyTitle: j.title,
        assertion: null,
        label: 'Recording',
        engine,
        filename: `${signoffKey}-${j.id}-rec-${slugOf(engine)}.${String(video.src).split('.').pop()}`,
        src: video.src,
      });
    }
  }
  const seen = new Map();
  for (const item of items) {
    const taken = seen.get(item.key);
    if (taken)
      throw new Error(
        `build-evidence-page: two captures share a key, ${item.key}: ` +
          `"${taken.journeyTitle}" ${taken.assertion ?? 'rec'} ` +
          `${taken.engine} and "${item.journeyTitle}" ` +
          `${item.assertion ?? 'rec'} ${item.engine}. One stored decision ` +
          'would answer for both, and nothing on the page would say so.',
      );
    seen.set(item.key, item);
  }
  return items;
};

/**
 * The page's own script, read from the file it lives in.
 *
 * `scripts/evidence-page-script.js` is plain JavaScript, so an editor, the
 * formatter and the linter all treat it as code rather than as the inside of a
 * template literal, where every brace is interpolation and a typo is a runtime
 * error on a page nobody runs locally. It is INLINED rather than published
 * beside the page because the page is handed about as one file.
 */
const PAGE_SCRIPT = new URL('./evidence-page-script.js', import.meta.url);

const pageScript = () => {
  const source = readFileSync(PAGE_SCRIPT, 'utf8');
  if (/<[/]script/i.test(source))
    throw new Error(
      'build-evidence-page: the page script contains a closing script tag, ' +
        'which ends the block early and spills the rest of it onto the page as ' +
        'text. Refusing to emit a page whose script stops halfway.',
    );
  return source;
};

export const renderEvidencePage = ({
  manifest,
  report,
  content,
  shots,
  dims = new Map(),
  videos = new Map(),
}) => {
  const specs = flattenReport(report);

  // Derived, in first-seen order, so the page reflects the run rather than a
  // list somebody kept in step by hand.
  const engines = [];
  for (const s of specs)
    if (!engines.includes(s.project)) engines.push(s.project);
  for (const m of manifest)
    if (!engines.includes(m.project)) engines.push(m.project);

  // Captures first, so a page keeps the order its assertions were taken in,
  // then every journey the report names that captured nothing.
  //
  // Derived from the manifest ALONE, this list omitted any test that asserted
  // without calling `shoot()` -- while `video` is `on` for the whole run
  // whenever `EVIDENCE_DIR` is set, so that test IS recorded and `videoFiles`
  // publishes its recording regardless. Full scope measured 120 recordings
  // published and 100 referenced: 20 files served to a page that named their
  // journeys nowhere, and four journeys that ran on five engines -- `no console
  // errors on load` among them -- absent from the coverage an operator signs
  // off. The dead entries are the smaller half; a page quietly narrower than
  // its run is the failure.
  const order = [];
  for (const m of manifest) {
    const short = m.title.split(' > ').slice(1).join(' > ') || m.title;
    if (!order.includes(short)) order.push(short);
  }
  for (const s of specs) if (!order.includes(s.title)) order.push(s.title);

  const missing = manifest.filter((m) => !shots.has(m.file));
  if (missing.length)
    throw new Error(
      `build-evidence-page: missing image data for ${missing.length} captured ` +
        `assertion(s), first ${missing[0].file}. Refusing to emit a page that ` +
        'claims evidence it does not carry.',
    );

  const journeys = order.map((short) => {
    const rows = manifest.filter(
      (m) => m.title === short || m.title.endsWith(` > ${short}`),
    );
    const orders = [...new Set(rows.map((r) => r.order))].sort((a, b) => a - b);
    return {
      id: slugOf(short),
      title: short,
      assertions: orders.map((n) => ({
        order: n,
        label: rows.find((r) => r.order === n)?.label ?? '',
        shots: engines.map((e) =>
          rows.find((r) => r.project === e && r.order === n),
        ),
      })),
      results: engines.map((e) =>
        specs.find((s) => s.project === e && s.title === short),
      ),
    };
  });

  const signoffKey = content.signoffKey ?? 'ticket';
  assertSignoffKey(signoffKey);

  // The review the page steps through, derived from the same journeys it
  // renders. One derivation, so a figure and the item keyed to it cannot
  // disagree about which capture they are.
  const items = reviewItemsOf({
    journeys,
    engines,
    shots,
    videos,
    signoffKey,
  });
  const itemAt = new Map(
    items.map((i) => [`${i.journey}|${i.assertion ?? 'rec'}|${i.engine}`, i]),
  );
  const keyOfFigure = (journey, assertion, engine) =>
    itemAt.get(`${journey}|${assertion}|${engine}`)?.key ?? '';
  // `<` escaped so the HTML parser cannot find a closing tag inside the data:
  // JSON.parse turns it back, and the page never sees the difference.
  const reviewJson = JSON.stringify({
    signoffKey,
    journeys: journeys.map((j) => j.id),
    items,
  }).replace(/</g, '\\u003c');

  // Every reviewable figure carries the same badge, and the page's own script
  // paints it from the stored decision -- including the icon's `d`, so one
  // element serves all three states and the badge's own words stay the only
  // text in it. Rendered even when there is nothing to say, because a guard
  // asserting absence passes just as happily on an element the builder never
  // emitted; the spec pairs `toHaveCount(1)` with `toBeHidden()` to tell those
  // two apart, and only a badge that is always there can answer both.
  const badge =
    '<span class="badge" hidden><svg class="badge-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d=""></path></svg><span class="badge-text"></span></span>';

  const stats = report.stats || {};
  const dot = (r) =>
    `<span class="dot ${r?.status === 'passed' ? 'ok' : 'bad'}" title="${esc(r?.status ?? 'not run')}"></span>`;

  const journeyHtml = journeys
    .map(
      (j) => `
<section class="journey" id="j-${esc(j.id)}">
  <header class="j-head">
    <label class="tick">
      <input type="checkbox" id="chk-${esc(j.id)}" data-journey="${esc(j.id)}">
      <span class="tickbox" aria-hidden="true"></span>
      <span class="sr">Reviewed: ${esc(j.title)}</span>
    </label>
    <div class="j-title">
      <h3>${esc(j.title)}</h3>
      <p class="j-meta"><span class="mono">${j.assertions.length}</span> assertions &times;
        <span class="mono">${engines.length}</span> engines &middot;
        ${j.results.map((r, k) => `<span class="eng">${dot(r)}<span class="mono">${esc(engines[k])}</span> <span class="mono dim">${r ? r.duration + 'ms' : '&mdash;'}</span></span>`).join('')}
      </p>
    </div>
  </header>
  ${j.assertions
    .map(
      (a) => `
  <div class="assertion">
    <p class="a-label"><span class="mono num">${String(a.order).padStart(2, '0')}</span> ${esc(a.label)}</p>
    <div class="strip">
      ${a.shots
        .map((s, k) =>
          s
            ? `<figure class="shot" data-item="${esc(keyOfFigure(j.id, a.order, s.project))}"><button type="button" class="open" aria-label="Review assertion ${a.order}, ${esc(s.project)}: ${esc(a.label)}"><img loading="lazy"${dims.get(s.file) ? ` width="${dims.get(s.file).w}" height="${dims.get(s.file).h}"` : ''} src="${shots.get(s.file)}" alt="${esc(s.label)} &mdash; ${esc(s.project)}"></button><figcaption class="mono">${esc(s.project)}${badge}</figcaption></figure>`
            : `<figure class="shot absent"><div class="novid mono">not captured</div><figcaption class="mono">${esc(engines[k])}</figcaption></figure>`,
        )
        .join('')}
    </div>
  </div>`,
    )
    .join('')}
  <details class="videos">
    <summary>Journey recordings (${engines.filter((e) => videos.has(`${j.id}|${e}`)).length} of ${engines.length} engines embedded)</summary>
    <div class="vgrid">
      ${engines
        .map((e) =>
          videos.has(`${j.id}|${e}`)
            ? `<figure data-item="${esc(keyOfFigure(j.id, 'rec', e))}"><video controls preload="none" src="${esc(videos.get(`${j.id}|${e}`).src)}"></video><figcaption class="mono">${esc(e)}<button type="button" class="open rev" aria-label="Review the recording, ${esc(e)}">Review</button>${badge}</figcaption></figure>`
            : `<figure class="absent"><div class="novid mono">not embedded</div><figcaption class="mono">${esc(e)}</figcaption></figure>`,
        )
        .join('')}
    </div>
  </details>
</section>`,
    )
    .join('');

  const idsHtml = (content.ids || [])
    .map((i) => `<span><b>${esc(i.label)}</b> ${esc(i.value)}</span>`)
    .join('');
  const sectionsHtml = (content.sections || [])
    .map((s) => `<h2>${esc(s.heading)}</h2>\n<p class="sub">${s.body}</p>`)
    .join('\n');
  const mutationsHtml = (content.mutations || [])
    .map(
      (m) =>
        `<tr><td>${esc(m.id)}</td><td>${m.what}</td><td class="pred">${esc(m.predicted)}</td><td class="act">${esc(m.actual)}</td></tr>`,
    )
    .join('');

  return `<title>${esc(content.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{
  --ground:#f7f6f2; --surface:#ffffff; --raise:#fbfaf7;
  --ink:#16171c; --ink-soft:#565a66; --rule:#e7e4dc;
  --accent:#0a7d66; --accent-ink:#096452; --alert:#c0392b; --on-accent:#ffffff;
  --shadow:0 1px 2px rgba(22,23,28,.05);
  --head:'Space Grotesk',system-ui,sans-serif;
  --body:'Inter',system-ui,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#131519; --surface:#1a1e23; --raise:#20252b;
  --ink:#ecebe6; --ink-soft:#9ba1a9; --rule:#2b3138;
  --accent:#54cfb0; --accent-ink:#7fdcc3; --alert:#f0857a; --on-accent:#0d1114;
  --shadow:0 1px 2px rgba(0,0,0,.4);
}}
:root[data-theme="dark"]{
  --ground:#131519; --surface:#1a1e23; --raise:#20252b;
  --ink:#ecebe6; --ink-soft:#9ba1a9; --rule:#2b3138;
  --accent:#54cfb0; --accent-ink:#7fdcc3; --alert:#f0857a; --on-accent:#0d1114;
  --shadow:0 1px 2px rgba(0,0,0,.4);
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--body);line-height:1.55;-webkit-text-size-adjust:100%}
.wrap{max-width:1080px;margin:0 auto;padding-inline:20px;padding-block:0 72px}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.dim{color:var(--ink-soft)}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%)}
h1,h2,h3{font-family:var(--head);text-wrap:balance;margin:0}
a{color:var(--accent-ink)}

/* masthead */
.mast{padding-block:44px 28px;border-bottom:2px solid var(--ink)}
.eyebrow{font-family:var(--mono);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-ink);margin:0 0 10px}
h1{font-size:clamp(1.8rem,1.2rem+2.6vw,2.7rem);font-weight:700;letter-spacing:-.02em}
.lede{max-width:62ch;color:var(--ink-soft);margin:12px 0 0;font-size:1.02rem}
.ids{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:18px;font-family:var(--mono);font-size:.78rem;color:var(--ink-soft)}
.ids b{color:var(--ink);font-weight:600}

/* verdict */
.verdict{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:1px;background:var(--rule);border:1px solid var(--rule);margin-top:26px}
.vc{background:var(--surface);padding:14px 16px}
.vc .n{font-family:var(--head);font-size:1.7rem;font-weight:700;letter-spacing:-.02em;display:block;font-variant-numeric:tabular-nums}
.vc .k{font-family:var(--mono);font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft)}
.vc.good .n{color:var(--accent-ink)}

h2{font-size:1.22rem;font-weight:500;letter-spacing:-.01em;margin:44px 0 4px}
.sub{color:var(--ink-soft);font-size:.92rem;margin:0 0 16px;max-width:64ch}

/* matrix */
.mtx{overflow-x:auto;border:1px solid var(--rule);background:var(--surface)}
table{border-collapse:collapse;width:100%;min-width:600px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--rule);font-size:.85rem}
th{font-family:var(--mono);font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);font-weight:600;white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
td.j{font-size:.84rem}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--accent);vertical-align:middle}
.dot.bad{background:var(--alert)}

/* mutation ledger */
.led td:first-child{font-family:var(--mono);font-weight:600;color:var(--accent-ink);white-space:nowrap}
.led .pred{color:var(--ink-soft)}
.led .act{font-family:var(--mono);font-weight:600}
.led code{font-family:var(--mono);font-size:.86em;background:var(--raise);padding:1px 4px;border-radius:3px}

/* journeys */
.journey{border:1px solid var(--rule);background:var(--surface);margin-top:14px}
.j-head{display:flex;gap:14px;align-items:flex-start;padding:16px 18px;border-bottom:1px solid var(--rule);background:var(--raise)}
.j-title h3{font-size:1rem;font-weight:500}
.j-meta{margin:6px 0 0;font-size:.76rem;color:var(--ink-soft);display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center}
.eng{display:inline-flex;align-items:center;gap:5px}
.tick{position:relative;flex:none;cursor:pointer;display:block;padding-top:2px}
.tick input{position:absolute;opacity:0;width:26px;height:26px;margin:0;cursor:pointer}
.tickbox{display:block;width:26px;height:26px;border:1.5px solid var(--ink-soft);border-radius:5px;background:var(--surface);transition:background .12s,border-color .12s}
.tick input:checked+.tickbox{background:var(--accent);border-color:var(--accent)}
.tick input:checked+.tickbox::after{content:'';position:absolute;left:9px;top:7px;width:6px;height:12px;border:solid var(--on-accent);border-width:0 2.5px 2.5px 0;transform:rotate(42deg)}
.tick input:focus-visible+.tickbox{outline:2px solid var(--accent-ink);outline-offset:2px}
.journey.done{border-color:var(--accent)}

.assertion{padding:14px 18px;border-bottom:1px solid var(--rule)}
.a-label{margin:0 0 10px;font-size:.88rem}
.num{color:var(--accent-ink);font-weight:600;font-size:.78rem;margin-right:6px}
.strip{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px}
.shot{margin:0;flex:none;width:190px}
.shot img{display:block;width:100%;max-width:100%;height:auto;border:1px solid var(--rule);border-radius:4px;background:var(--ground);cursor:zoom-in}
.shot figcaption{font-size:.66rem;color:var(--ink-soft);margin-top:4px}

.videos{padding:12px 18px}
.videos summary{cursor:pointer;font-size:.82rem;color:var(--ink-soft);font-family:var(--mono)}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:12px}
.vgrid video{width:100%;max-width:100%;border:1px solid var(--rule);border-radius:4px;background:#000}
.vgrid figure{margin:0}
.vgrid figcaption{font-size:.68rem;color:var(--ink-soft);margin-top:4px}
.novid{display:grid;place-items:center;aspect-ratio:16/10;max-width:100%;border:1px dashed var(--rule);border-radius:4px;color:var(--ink-soft);font-size:.7rem}

/* sign-off */
.signoff{border:2px solid var(--ink);background:var(--surface);padding:22px;margin-top:44px}
.signoff h2{margin-top:0}
.count{font-family:var(--mono);font-size:.82rem;color:var(--ink-soft);margin:0 0 14px}
.choices{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
/* 46, not 44: a control whose height comes only from this floor lands on it
   exactly, and at a fractional device pixel ratio the measured height rounds
   to 43.99997 -- under the WCAG floor by a hundred-thousandth of a pixel. The
   floor is the minimum, so it is not the number to design to. */
button{font:inherit;font-family:var(--head);font-weight:500;padding:11px 18px;border-radius:6px;border:1.5px solid var(--ink);background:var(--surface);color:var(--ink);cursor:pointer;min-height:46px}
button:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}
button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent)}
button[aria-pressed="true"]{color:var(--on-accent)}
textarea{width:100%;max-width:100%;font:inherit;font-size:.92rem;padding:11px;border:1px solid var(--rule);border-radius:6px;background:var(--ground);color:var(--ink);min-height:88px;resize:vertical}
.state{font-family:var(--mono);font-size:.78rem;color:var(--ink-soft);margin-top:12px}
.state.saved{color:var(--accent-ink)}

/* review: the badge each figure carries, and the page's way into the viewer */
[hidden]{display:none!important}
.badge{display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:1px 7px;border:1px solid var(--rule);border-radius:999px;font-family:var(--body);font-size:.66rem;font-weight:600;color:var(--ink-soft);vertical-align:middle}
.badge-icon{width:10px;height:10px;flex:none;fill:currentColor}
.badge.approved{color:var(--accent-ink);border-color:var(--accent)}
.badge.rejected{color:var(--alert);border-color:var(--alert)}
/* The picture IS the button, so it keeps the picture's size -- but never
   less than a touch target: a capture whose bytes will not decode has no
   height at all, and it is exactly the one an operator has to open to
   reject. A zero-height way in would make a broken capture unreviewable. */
.shot .open{display:block;width:100%;padding:0;border:0;background:none;border-radius:4px;cursor:zoom-in}
.shot .open:focus-visible{outline:2px solid var(--accent-ink);outline-offset:3px}
/* The thumbnail's own button is the picture, so it keeps the picture's size;
   every other way in stays a 44px target, the recording's Review included. */
.vgrid .open{margin-left:8px;padding:4px 12px;font-size:.7rem;font-family:var(--body)}
.vgrid figcaption{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.review-start{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;border:1px solid var(--rule);background:var(--surface);padding:14px 18px;margin-top:14px}
.review-start .count{margin:0}
.outstanding{border:1px solid var(--alert);background:var(--raise);padding:14px 16px;margin-top:16px}
.outstanding p{margin:0;font-size:.9rem}
.outstanding .choices{margin:12px 0 0}

/* the viewer: one item at a time, full screen on a phone */
#viewer{position:fixed;inset:0;width:100%;max-width:100%;height:100%;max-height:100%;margin:0;padding:16px;border:0;background:var(--ground);color:var(--ink);overflow:auto}
#viewer::backdrop{background:rgba(10,12,14,.72)}
#viewer:focus-visible{outline:2px solid var(--accent-ink);outline-offset:-4px}
#viewer h2{font-size:1.06rem;font-weight:500;margin:0 0 12px}
.v-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.v-status{flex:1 1 140px;min-width:0;margin:0;font-size:.74rem;color:var(--ink-soft)}
.v-where{display:flex;flex-wrap:wrap;gap:4px 10px;margin:14px 0 4px;font-size:.72rem;color:var(--ink-soft)}
#viewer-stage{display:grid;place-items:center;max-width:100%;padding:8px;border:1px solid var(--rule);border-radius:6px;background:var(--surface);touch-action:pan-y pinch-zoom}
#viewer-image,#viewer-stage video{display:block;max-width:100%;height:auto;border-radius:4px}
#viewer-stage video{width:100%;background:#000}
.v-wait{margin:10px 0 0;font-size:.74rem;color:var(--ink-soft)}
.v-decision{margin:12px 0 0;font-family:var(--head);font-size:.96rem}
.v-controls{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
#viewer-approve:not([disabled]){background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
#viewer-reject:not([disabled]){color:var(--alert);border-color:var(--alert)}
#viewer-note-label{display:block;margin:18px 0 6px;font-size:.84rem;color:var(--ink-soft)}
#viewer-note:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}
.v-count{margin:6px 0 0;font-size:.72rem;color:var(--ink-soft)}
#viewer-summary ul{display:grid;gap:8px;list-style:none;margin:12px 0 0;padding:0}
#viewer-summary li{border:1px solid var(--rule);border-radius:6px;background:var(--surface);padding:10px 12px}
#viewer-summary li p{margin:8px 0 0;font-size:.82rem;color:var(--ink-soft)}
#viewer-summary li button{display:block;width:100%;padding:0;border:0;background:none;text-align:left;white-space:normal;font-family:var(--body);font-size:.84rem;color:var(--ink)}
/* A disabled control is dimmed by COLOUR, never by opacity: the contrast
   guard composites opacity, so a half-faded button fails AA by construction. */
button[disabled]{color:var(--ink-soft);border-color:var(--rule);background:var(--surface);cursor:not-allowed}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (max-width:520px){.j-head{flex-wrap:wrap}.shot{width:150px}}
</style>

<div class="wrap">
<header class="mast">
  <p class="eyebrow">${esc(content.eyebrow ?? '')}</p>
  <h1>${esc(content.headline ?? content.title)}</h1>
  <p class="lede">${content.lede ?? ''}</p>
  <div class="ids">${idsHtml}</div>
  <div class="verdict">
    <div class="vc good"><span class="n">${stats.expected ?? 0}</span><span class="k">passed</span></div>
    <div class="vc"><span class="n">${stats.unexpected ?? 0}</span><span class="k">failed</span></div>
    <div class="vc"><span class="n">${stats.flaky ?? 0}</span><span class="k">flaky</span></div>
    <div class="vc"><span class="n">${stats.skipped ?? 0}</span><span class="k">skipped</span></div>
    <div class="vc"><span class="n">${manifest.length}</span><span class="k">assertion shots</span></div>
    <div class="vc"><span class="n">${((stats.duration ?? 0) / 1000).toFixed(1)}s</span><span class="k">wall clock</span></div>
  </div>
</header>

${sectionsHtml}

${
  mutationsHtml
    ? `<h2>Guards proven by breaking them</h2>
<p class="sub">Each mutation's expected result was written down <em>before</em> the run. A mutation judged after seeing the output confirms nothing.</p>
<div class="mtx"><table class="led">
<thead><tr><th>#</th><th>What was broken</th><th>Predicted</th><th>Actual</th></tr></thead>
<tbody>${mutationsHtml}</tbody>
</table></div>`
    : ''
}

<h2>Engine matrix</h2>
<div class="mtx"><table>
<thead><tr><th>Journey</th>${engines.map((e) => `<th>${esc(e)}</th>`).join('')}</tr></thead>
<tbody>${journeys.map((j) => `<tr><td class="j">${esc(j.title)}</td>${j.results.map((r) => `<td>${dot(r)} <span class="mono dim">${r ? r.duration + 'ms' : '&mdash;'}</span></td>`).join('')}</tr>`).join('')}</tbody>
</table></div>

<h2>Every assertion, as it ran</h2>
<p class="sub">Each image was captured immediately after the assertion above it passed, during the run &mdash; not reconstructed afterwards. Playwright stops a test at its first failed expectation, so a present image <em>is</em> the result. Open any capture to review it on its own, or step through them one at a time; a journey ticks itself once every capture in it is approved.</p>

<div class="review-start" id="review-start">
  <p class="count mono" id="review-progress">0 approved, 0 rejected, ${items.length} undecided of ${items.length} items</p>
  <button type="button" id="btn-review-start">Review one by one</button>
</div>
${journeyHtml}

<section class="signoff" id="signoff" tabindex="-1">
  <h2 style="margin-top:0">Sign-off</h2>
  <p class="count" id="progress">0 of ${journeys.length} journeys reviewed</p>
  <p class="count" id="items-progress">0 approved, 0 rejected, ${items.length} undecided of ${items.length} items</p>
  <p class="sub">Nothing merges on green CI alone. This ticket progresses only on your explicit decision below.</p>
  <div class="choices">
    <button type="button" id="btn-approve" aria-pressed="false">Signed off &mdash; may merge to develop</button>
    <button type="button" id="btn-more" aria-pressed="false">More tests needed</button>
    <button type="button" id="btn-review-signoff">Review one by one</button>
    <button type="button" id="btn-send">Send review to Claude</button>
  </div>
  <p class="state" id="send-state" role="status"></p>
  <div class="outstanding" id="outstanding" hidden>
    <p id="outstanding-text"></p>
    <div class="choices">
      <button type="button" id="btn-review-outstanding">Review them</button>
      <button type="button" id="btn-signoff-anyway">Sign off anyway</button>
    </div>
  </div>
  <label for="note" class="sub" style="display:block;margin-bottom:6px">Notes, or what else you want covered</label>
  <textarea id="note"></textarea>
  <p class="state" id="state" role="status">Loading saved state&hellip;</p>
  ${content.notCovered ? `<p class="sub" style="margin-top:18px"><strong>Not covered by this page:</strong> ${content.notCovered}</p>` : ''}
</section>
</div>

<dialog id="viewer" aria-label="Review evidence" tabindex="-1">
  <div class="v-bar">
    <p class="v-status mono" id="viewer-status" role="status"></p>
    <button type="button" id="viewer-close">Close</button>
  </div>
  <div id="viewer-item">
    <p class="v-where mono"><span id="viewer-position"></span><span id="viewer-journey"></span><span id="viewer-engine"></span></p>
    <h2 id="viewer-title"></h2>
    <div id="viewer-stage">
      <img id="viewer-image" alt="">
      <video controls preload="metadata" playsinline hidden></video>
    </div>
    <p class="v-wait mono" id="viewer-wait" hidden></p>
    <p class="v-decision" id="viewer-decision">Not decided</p>
    <label for="viewer-note" id="viewer-note-label">Note for Claude, sent with this review</label>
    <textarea id="viewer-note" maxlength="2000"></textarea>
    <p class="v-count mono" id="viewer-note-count">0 of 2,000 characters</p>
    <div class="v-controls">
      <button type="button" id="viewer-approve">Approve</button>
      <button type="button" id="viewer-reject">Reject</button>
      <button type="button" id="viewer-skip">Skip</button>
      <button type="button" id="viewer-previous">Previous</button>
      <button type="button" id="viewer-download">Download</button>
    </div>
  </div>
  <section id="viewer-summary" aria-label="Review summary" hidden>
    <h2>Review summary</h2>
    <p class="v-count mono" id="viewer-summary-counts"></p>
    <ul id="viewer-summary-list"></ul>
    <div class="v-controls">
      <button type="button" id="viewer-undecided">Review the undecided</button>
      <button type="button" id="viewer-send">Send review to Claude</button>
      <button type="button" id="viewer-go-signoff">Go to sign-off</button>
    </div>
  </section>
  <p class="sr" id="viewer-announce" aria-live="polite"></p>
</dialog>

<script type="application/json" id="${REVIEW_DATA_ID}">${reviewJson}</script>

<script>
${pageScript()}
</script>`;
};

/**
 * What the publish has to grant, said out loud at build time.
 *
 * The page writes the ticks and the verdict through `claude.use('db')`, which
 * resolves `null` unless the PUBLISH declared the `db` capability. The page
 * then degrades honestly -- "ticks are local to this view" -- which reads as a
 * quirk rather than as "nothing you decide here is recorded". #138's page was
 * published that way first: the operator's sign-off would have been kept
 * nowhere and could not have been read back.
 *
 * The declaration is an argument to the publish, so nothing in this repo can
 * enforce it. Printing it is what stops the next person having to remember.
 */
export const PUBLISH_NOTE =
  'publish with capabilities {"db": {}, "downloads": true, "comments": {}}, ' +
  'AND the files map written beside this page — without the capability ' +
  "claude.use('db') resolves null, the page says 'ticks are local to this " +
  "view', and the sign-off is recorded NOWHERE; without 'downloads' the " +
  'review viewer cannot hand the operator the capture it is showing, and ' +
  "without 'comments' it cannot send a rejection back to a session. Without " +
  'the files the page references recordings nothing uploaded, and a journey ' +
  'with a broken src reads as one never recorded. A session reads the ' +
  'decisions back with ArtifactData list signoff/<key>/items.';

/**
 * What a capture actually is, read from its own first bytes.
 *
 * Never from the extension and never hardcoded: a data URI that claims a type
 * the bytes are not paints nothing, and a page of blank frames looks exactly
 * like a page of captures that failed. An unrecognised format is a THROW for
 * the same reason a manifest entry with no image is -- silence here is
 * indistinguishable from evidence.
 */
export const mediaType = (bytes) => {
  if (
    bytes.length >= 8 &&
    bytes.readUInt32BE(0) === 0x89504e47 &&
    bytes.readUInt32BE(4) === 0x0d0a1a0a
  )
    return 'image/png';
  if (
    bytes.length >= 3 &&
    bytes.readUInt16BE(0) === 0xffd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg';
  throw new Error(
    `build-evidence-page: unrecognised capture format, first bytes ` +
      `${bytes.subarray(0, 4).toString('hex')}. Refusing to emit a src the ` +
      'browser cannot paint.',
  );
};

/** Markers that stand alone: TEM and the eight restart markers carry NO length. */
const STANDALONE = new Set([
  0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7,
]);

/** SOFn, excluding DHT (C4), JPG (C8) and DAC (CC), which share the range. */
const isFrameHeader = (marker) =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 &&
  marker !== 0xc8 &&
  marker !== 0xcc;

/**
 * A capture's intrinsic size.
 *
 * Without `width`/`height` on the tag the browser reserves NO space for a
 * lazily-loaded image, so every one of them grows the page as it decodes.
 * Measured on #96's page: 110 shots, 0 with dimensions, and the document grew
 * 23642px -> 31760px while they loaded. An operator scrolling to a journey and
 * clicking its tick had the row jump out from under the pointer, so the click
 * landed on nothing -- which reads exactly like "the checkbox does not work",
 * and only for the ones below the fold.
 *
 * PNG keeps its size at a fixed offset: bytes 12-15 are the IHDR type, 16-19
 * the width, 20-23 the height, all big-endian. JPEG does NOT -- it is a stream
 * of marker segments, so the frame header sits behind whatever EXIF, ICC or
 * restart-interval segments the encoder emitted and has to be walked to.
 */
export const imageSize = (bytes) => {
  if (bytes.length >= 24 && bytes.readUInt32BE(12) === 0x49484452)
    return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
  if (!(bytes.length >= 4 && bytes.readUInt16BE(0) === 0xffd8)) return null;

  let at = 2;
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) return null; // out of step with the segment stream
    let marker = bytes[at + 1];
    // 0xFF is legal padding before a marker, so skip a run of it.
    while (marker === 0xff && at + 2 < bytes.length) {
      at += 1;
      marker = bytes[at + 1];
    }
    if (marker === 0xd8 || STANDALONE.has(marker)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // EOI, or the scan begins
    if (at + 3 >= bytes.length) return null;
    if (isFrameHeader(marker))
      return { w: bytes.readUInt16BE(at + 7), h: bytes.readUInt16BE(at + 5) };
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
};

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const main = () => {
  const dir = arg('evidence');
  const contentPath = arg('content');
  const out = arg('out');
  // The paths the artifact already serves, saved from a file listing. Absent on
  // a first publish; without it nothing can be removed, only added.
  const publishedPath = arg('published');
  if (!dir || !contentPath || !out) {
    console.error(
      'usage: build-evidence-page.mjs --evidence <dir> --content <file.json> --out <file.html> [--published <listing.json>]',
    );
    process.exit(2);
  }

  const report = JSON.parse(readFileSync(join(dir, EVIDENCE_REPORT), 'utf8'));
  // Before any capture is read: an earlier run's rows are set aside here, so a
  // capture of theirs that has gone since is never reached for.
  const { current: manifest, earlier } = capturesOfThisRun(
    readFileSync(join(dir, EVIDENCE_MANIFEST), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
    report,
  );
  const content = JSON.parse(readFileSync(contentPath, 'utf8'));
  // Before any capture is encoded: a missing recording refuses the whole page.
  const candidates = videoCandidates(report);

  // Read ONCE: the same buffer answers what the file is, how big it renders
  // and what goes in the src.
  const bytes = new Map(
    manifest.map((m) => [m.file, readFileSync(join(dir, m.file))]),
  );
  const dims = new Map(
    [...bytes]
      .map(([file, b]) => [file, imageSize(b)])
      .filter(([, size]) => size),
  );
  const shots = new Map(
    [...bytes].map(([file, b]) => [
      file,
      `data:${mediaType(b)};base64,${b.toString('base64')}`,
    ]),
  );
  // Recordings travel BESIDE the page, so the page holds a relative path and
  // the bytes are charged against the publish rather than the 16 MB document.
  // Nothing is selected and nothing is dropped: every recording the report
  // names is published, or the build has already refused above.
  const files = reconcileFiles({
    desired: videoFiles(candidates),
    published: publishedPath
      ? JSON.parse(readFileSync(publishedPath, 'utf8'))
      : [],
  });
  assertPublishLimits({ files, sizeOf: (source) => statSync(source).size });
  const videos = new Map(
    candidates.map((c) => [
      c.key,
      { src: publishedVideoPath(c.key), sha256: sha256Of(readFileSync(c.abs)) },
    ]),
  );

  const html = renderEvidencePage({
    manifest,
    report,
    content,
    shots,
    dims,
    videos,
  });
  // BEFORE anything is written. A refusal that leaves the page on disk invites
  // publishing it anyway, or trimming it by hand; the refusal for a missing
  // recording already leaves no file behind, and this one matches it.
  assertPageFits(Buffer.byteLength(html));
  writeFileSync(out, html, 'utf8');
  // The files map, beside the page, because the publish is a separate step and
  // a map nobody can find is a page whose recordings never travel.
  const filesOut = `${out}.files.json`;
  writeFileSync(filesOut, `${JSON.stringify(files, null, 2)}\n`, 'utf8');
  console.log(
    `written ${out} ${(Buffer.byteLength(html) / 1048576).toFixed(2)}MB ` +
      `shots=${shots.size} videos=${videos.size}/${candidates.length} ` +
      `files=${Object.keys(files).length} (${filesOut})` +
      earlierLine(earlier),
  );
  console.log(PUBLISH_NOTE);
};

if (import.meta.url === `file://${process.argv[1]}`) main();
