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
import { EVIDENCE_MANIFEST, EVIDENCE_REPORT } from './evidence-files.mjs';

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Every spec result in the report, flattened, each carrying its FULL title
 * path -- the describes and the test, exactly as `tests/e2e/evidence.ts`'s
 * `shoot` writes one (`info.titlePath.slice(1).join(' > ')`, the file dropped).
 *
 * This used to emit `spec.title`, the leaf alone, and discard the describe
 * titles sitting right there in the suite nesting. Everything downstream then
 * keyed a journey by that leaf, so **two tests sharing a leaf title in
 * different describes were one journey**: their captures pooled into a single
 * strip and the per-engine results took whichever spec matched first. Measured
 * on a 7-spec run -- 275 distinct leaf titles, 5 used twice, every pair an
 * English block and its Indonesian counterpart -- a page would have shown one
 * journey wearing two languages' evidence, and nothing about it would have
 * looked wrong (#263). `videoFiles` was the only thing that noticed, because it
 * alone demands a unique path, and it refused the whole build.
 *
 * The file-level suite's own title is NOT included: `shoot` drops it, and the
 * two formats have to agree by construction rather than by a heuristic that
 * repairs one into the other.
 */
const flattenReport = (report) => {
  const out = [];
  const walk = (suite, ancestors, file) => {
    for (const child of suite.suites || [])
      walk(child, child.title ? [...ancestors, child.title] : ancestors, file);
    for (const spec of suite.specs || [])
      for (const t of spec.tests)
        for (const r of t.results)
          out.push({
            title: [...ancestors, spec.title].filter(Boolean).join(' > '),
            project: t.projectName,
            status: r.status,
            duration: r.duration,
            // The spec FILE a journey came from. Since #214 a recording is
            // opt-in per spec, so "no recording" means one of two different
            // things and the page must not spell them the same way.
            file: spec.file ?? file,
            video: (r.attachments || []).find((a) => a.name === 'video')?.path,
          });
  };
  // Each top-level entry is a FILE; its children are the describes.
  for (const suite of report.suites || []) walk(suite, [], suite.file);
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
export const renderEvidencePage = ({
  manifest,
  report,
  content,
  shots,
  dims = new Map(),
  videos = new Map(),
}) => {
  const specs = flattenReport(report);

  // A journey with no recording is either a spec that never ASKED for one --
  // the default since #214 -- or a recording that went astray (#165). Those
  // are different facts: the first is the policy working, the second is
  // evidence missing, and a page that spells both "not embedded" tells the
  // operator nothing about which he is looking at.
  //
  // Derived from the report itself rather than from the spec sources or a
  // list: a spec RECORDS when any result of its own carries a video. There is
  // no second statement of the policy that could drift from the first.
  const recordingSpecs = new Set(
    specs.filter((s) => s.video).map((s) => s.file),
  );
  const specFileOf = new Map(specs.map((s) => [s.title, s.file]));
  const noRecordingNote = (title) =>
    recordingSpecs.has(specFileOf.get(title))
      ? 'recording missing'
      : 'not recorded by policy';

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
  // Both sides now spell a journey the same way, so neither is repaired into
  // the other. The `slice(1)` that used to strip a describe off the manifest
  // title, and the `endsWith(' > ' + short)` that matched it back, were what
  // made a duplicate leaf ambiguous -- a suffix match cannot tell two
  // describes apart (#263).
  const order = [];
  for (const m of manifest) if (!order.includes(m.title)) order.push(m.title);
  for (const s of specs) if (!order.includes(s.title)) order.push(s.title);

  const missing = manifest.filter((m) => !shots.has(m.file));
  if (missing.length)
    throw new Error(
      `build-evidence-page: missing image data for ${missing.length} captured ` +
        `assertion(s), first ${missing[0].file}. Refusing to emit a page that ` +
        'claims evidence it does not carry.',
    );

  const journeys = order.map((title) => {
    const rows = manifest.filter((m) => m.title === title);
    const orders = [...new Set(rows.map((r) => r.order))].sort((a, b) => a - b);
    return {
      id: slugOf(title),
      title,
      assertions: orders.map((n) => ({
        order: n,
        label: rows.find((r) => r.order === n)?.label ?? '',
        shots: engines.map((e) =>
          rows.find((r) => r.project === e && r.order === n),
        ),
      })),
      results: engines.map((e) =>
        specs.find((s) => s.project === e && s.title === title),
      ),
    };
  });

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
            ? `<figure class="shot"><img loading="lazy"${dims.get(s.file) ? ` width="${dims.get(s.file).w}" height="${dims.get(s.file).h}"` : ''} src="${shots.get(s.file)}" alt="${esc(s.label)} &mdash; ${esc(s.project)}"><figcaption class="mono">${esc(s.project)}</figcaption></figure>`
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
            ? `<figure><video controls preload="none" src="${videos.get(`${j.id}|${e}`)}"></video><figcaption class="mono">${esc(e)}</figcaption></figure>`
            : `<figure class="absent"><div class="novid mono">${esc(noRecordingNote(j.title))}</div><figcaption class="mono">${esc(e)}</figcaption></figure>`,
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
button{font:inherit;font-family:var(--head);font-weight:500;padding:11px 18px;border-radius:6px;border:1.5px solid var(--ink);background:var(--surface);color:var(--ink);cursor:pointer;min-height:44px}
button:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}
button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent)}
button[aria-pressed="true"]{color:var(--on-accent)}
textarea{width:100%;max-width:100%;font:inherit;font-size:.92rem;padding:11px;border:1px solid var(--rule);border-radius:6px;background:var(--ground);color:var(--ink);min-height:88px;resize:vertical}
.state{font-family:var(--mono);font-size:.78rem;color:var(--ink-soft);margin-top:12px}
.state.saved{color:var(--accent-ink)}

/* lightbox */
#lb{position:fixed;inset:0;background:rgba(10,12,14,.92);display:none;place-items:center;z-index:50;padding:18px}
#lb.on{display:grid}
#lb img{max-width:100%;max-height:86vh;border-radius:4px}
#lb p{color:#e8e6e0;font-family:var(--mono);font-size:.76rem;margin:12px 0 0;text-align:center;max-width:70ch}
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
<p class="sub">Each image was captured immediately after the assertion above it passed, during the run &mdash; not reconstructed afterwards. Playwright stops a test at its first failed expectation, so a present image <em>is</em> the result. Tap any image to enlarge, and tick a journey once you are satisfied it proves what it claims.</p>
${journeyHtml}

<section class="signoff" id="signoff">
  <h2 style="margin-top:0">Sign-off</h2>
  <p class="count" id="progress">0 of ${journeys.length} journeys reviewed</p>
  <p class="sub">Nothing merges on green CI alone. This ticket progresses only on your explicit decision below.</p>
  <div class="choices">
    <button type="button" id="btn-approve" aria-pressed="false">Signed off &mdash; may merge to develop</button>
    <button type="button" id="btn-more" aria-pressed="false">More tests needed</button>
  </div>
  <label for="note" class="sub" style="display:block;margin-bottom:6px">Notes, or what else you want covered</label>
  <textarea id="note"></textarea>
  <p class="state" id="state" role="status">Loading saved state&hellip;</p>
  ${content.notCovered ? `<p class="sub" style="margin-top:18px"><strong>Not covered by this page:</strong> ${content.notCovered}</p>` : ''}
</section>
</div>

<div id="lb" role="dialog" aria-modal="true" aria-label="Enlarged screenshot"><div><img id="lb-img" alt=""><p id="lb-cap"></p></div></div>

<script>
(function () {
  'use strict';
  var JOURNEYS = ${JSON.stringify(journeys.map((j) => j.id))};
  var DOC = 'signoff/' + ${JSON.stringify(content.signoffKey ?? 'ticket')};
  var JOURNEY_KEY = 'journey:';
  var READY = 'Ready. Your ticks and decision are saved as you make them.';
  var SAVED = 'Saved. Your decision persists on this page.';
  var LOCAL = 'Ticks are local to this view \u2014 storage is not available here.';
  var NOT_SAVED = 'Not saved \u2014 this view cannot reach storage. Your ticks are visible but will not persist.';
  var NOT_LOADED = 'Not saved yet \u2014 the saved sign-off has not loaded.';
  // The stored sign-off as this view last received it, always as the page's
  // OWN copy: the runtime delivers snapshots frozen, and a page that keeps one
  // as its state drops every later edit without an error (#172).
  var server = copyOf(undefined);
  // Edits no completed write has carried yet, keyed 'journey:<id>', 'verdict'
  // and 'note'. The page shows the server copy with these laid over it, so no
  // snapshot, early or late, can repaint an edit away.
  var pending = Object.create(null);
  var db = null, storageAbsent = false, loaded = false, saveTimer = null;
  var stateEl = document.getElementById('state');
  var progressEl = document.getElementById('progress');
  var noteEl = document.getElementById('note');
  var approve = document.getElementById('btn-approve');
  var more = document.getElementById('btn-more');
  function say(m, ok) { stateEl.textContent = m; stateEl.className = 'state' + (ok ? ' saved' : ''); }
  function codeOf(e) { return e && typeof e.code === 'string' ? e.code : 'unknown'; }
  function hasPending() { return Object.keys(pending).length > 0; }
  // Keeps only the shape this page writes. The store is shared by every
  // viewer, so what it delivers is untrusted input.
  function copyOf(body) {
    var source = body && typeof body === 'object' ? body : {};
    var stored = source.journeys && typeof source.journeys === 'object' ? source.journeys : {};
    var journeys = {};
    Object.keys(stored).forEach(function (id) {
      if (typeof stored[id] === 'boolean') journeys[id] = stored[id];
    });
    return {
      journeys: journeys,
      verdict: source.verdict === 'approved' || source.verdict === 'more' ? source.verdict : null,
      note: typeof source.note === 'string' ? source.note : ''
    };
  }
  function overlay(target, edits) {
    Object.keys(edits).forEach(function (key) {
      if (key.indexOf(JOURNEY_KEY) === 0) target.journeys[key.slice(JOURNEY_KEY.length)] = edits[key];
      else target[key] = edits[key];
    });
    return target;
  }
  function view() { return overlay(copyOf(server), pending); }
  function paint() {
    var shown = view(), done = 0;
    JOURNEYS.forEach(function (id) {
      var box = document.getElementById('chk-' + id);
      if (!box) return;
      var on = shown.journeys[id] === true;
      box.checked = on;
      var sec = document.getElementById('j-' + id);
      if (sec) sec.classList.toggle('done', on);
      if (on) done++;
    });
    progressEl.textContent = done + ' of ' + JOURNEYS.length + ' journeys reviewed';
    approve.setAttribute('aria-pressed', String(shown.verdict === 'approved'));
    more.setAttribute('aria-pressed', String(shown.verdict === 'more'));
    if (document.activeElement !== noteEl) noteEl.value = shown.note;
  }
  function schedule() {
    say('Saving\u2026', false);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }
  function change(key, value) {
    pending[key] = value;
    paint();
    if (storageAbsent) { say(NOT_SAVED, false); return; }
    // set() replaces the whole document, so nothing is written before the
    // stored sign-off has loaded: an early write would erase it.
    if (!loaded) { say(NOT_LOADED, false); return; }
    schedule();
  }
  function save() {
    saveTimer = null;
    var carried = Object.assign(Object.create(null), pending);
    var body = view();
    body.updatedAt = new Date().toISOString();
    db.doc(DOC).set(body).then(function () {
      // The store now holds what this write carried. Once a subscription has
      // ended nothing echoes it back, so the server copy takes it from here.
      overlay(server, carried);
      Object.keys(carried).forEach(function (key) {
        if (pending[key] === carried[key]) delete pending[key];
      });
      paint();
      if (!hasPending() && saveTimer === null) say(SAVED, true);
    }, function (e) {
      say('Could not save: ' + codeOf(e), false);
    });
  }
  function receive(snap) {
    server = copyOf(snap.data());
    if (!loaded) {
      loaded = true;
      if (hasPending()) schedule();
      else say(READY, true);
    }
    paint();
  }
  function markStorageAbsent() {
    storageAbsent = true;
    say(LOCAL, false);
  }
  document.querySelectorAll('input[data-journey]').forEach(function (box) {
    box.addEventListener('change', function () { change(JOURNEY_KEY + box.dataset.journey, box.checked); });
  });
  approve.addEventListener('click', function () { change('verdict', view().verdict === 'approved' ? null : 'approved'); });
  more.addEventListener('click', function () { change('verdict', view().verdict === 'more' ? null : 'more'); });
  noteEl.addEventListener('input', function () { change('note', noteEl.value); });
  var lb = document.getElementById('lb'), lbImg = document.getElementById('lb-img'), lbCap = document.getElementById('lb-cap');
  document.addEventListener('click', function (e) {
    var img = e.target.closest ? e.target.closest('.shot img') : null;
    if (img) { lbImg.src = img.src; lbImg.alt = img.alt; lbCap.textContent = img.alt; lb.classList.add('on'); return; }
    if (lb.classList.contains('on')) lb.classList.remove('on');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.classList.remove('on'); });
  paint();
  if (!window.claude || typeof window.claude.use !== 'function') { markStorageAbsent(); return; }
  window.claude.use('db').then(function (handle) {
    if (!handle) { markStorageAbsent(); return; }
    db = handle;
    var ref = db.doc(DOC);
    ref.get().then(receive, function (e) {
      // A read can fail after live updates have already loaded the sign-off.
      if (!loaded) say('Could not load the saved sign-off (' + codeOf(e) + '). Ticks are not saved until it loads.', false);
    });
    // Pass the error callback: without one, a subscription that ends is an
    // uncaught error. It speaks once the sign-off has loaded; before that, the
    // read's own failure is the one to report.
    ref.onSnapshot(receive, function (e) {
      if (loaded) say('Live updates stopped (' + codeOf(e) + '). Reload to see changes made elsewhere.', false);
    });
  }, markStorageAbsent);
})();
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
  'publish with capabilities {"db": {}}, AND the files map written beside ' +
  "this page — without the capability claude.use('db') resolves null, the " +
  'page says "ticks are local to this view", and the sign-off is recorded ' +
  'NOWHERE; without the files the page references recordings nothing ' +
  'uploaded, and a journey with a broken src reads as one never recorded.';

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
    candidates.map((c) => [c.key, publishedVideoPath(c.key)]),
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

// Only when run, never when imported: the tests import the functions above.
// Node answers "was I run directly?" itself. Comparing `import.meta.url` with
// the raw path skipped the build, in silence, from any checkout whose path held
// a space (#221, `tests/unit/script-entry.test.ts`).
if (import.meta.main) main();
