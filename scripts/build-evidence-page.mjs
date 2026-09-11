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
 * from Playwright's JSON report and the capture manifest. A sixth engine, or a
 * spec that runs on fewer, is reflected without touching this code.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * Keep items in the order given while they fit, and NAME what was dropped.
 *
 * A generator that silently emits a smaller page when the budget is tight
 * leaves the operator believing they saw everything. The caller prints the
 * drop list.
 */
export const selectMedia = (items, budgetBytes, usedBytes = 0) => {
  const kept = [];
  const dropped = [];
  let used = usedBytes;
  for (const item of items) {
    if (used + item.bytes <= budgetBytes) {
      kept.push(item);
      used += item.bytes;
    } else dropped.push(item);
  }
  return { kept, dropped, used };
};

const slugOf = (s) =>
  String(s)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

/**
 * The page, as a string. Pure: every input is passed in, nothing is read here.
 */
export const renderEvidencePage = ({
  manifest,
  report,
  content,
  shots,
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

  const order = [];
  for (const m of manifest) {
    const short = m.title.split(' > ').slice(1).join(' > ') || m.title;
    if (!order.includes(short)) order.push(short);
  }

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
      <span class="sr">Mark journey reviewed</span>
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
            ? `<figure class="shot"><img loading="lazy" src="${shots.get(s.file)}" alt="${esc(s.label)} &mdash; ${esc(s.project)}"><figcaption class="mono">${esc(s.project)}</figcaption></figure>`
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
  <p class="state" id="state">Loading saved state&hellip;</p>
  ${content.notCovered ? `<p class="sub" style="margin-top:18px"><strong>Not covered by this page:</strong> ${content.notCovered}</p>` : ''}
</section>
</div>

<div id="lb" role="dialog" aria-modal="true" aria-label="Enlarged screenshot"><div><img id="lb-img" alt=""><p id="lb-cap"></p></div></div>

<script>
(function () {
  var JOURNEYS = ${JSON.stringify(journeys.map((j) => j.id))};
  var DOC = 'signoff/' + ${JSON.stringify(content.signoffKey ?? 'ticket')};
  var state = { journeys: {}, verdict: null, note: '' };
  var db = null, saveTimer = null;
  var stateEl = document.getElementById('state');
  var progressEl = document.getElementById('progress');
  var noteEl = document.getElementById('note');
  var approve = document.getElementById('btn-approve');
  var more = document.getElementById('btn-more');
  function say(m, ok) { stateEl.textContent = m; stateEl.className = 'state' + (ok ? ' saved' : ''); }
  function paint() {
    var done = 0;
    JOURNEYS.forEach(function (id) {
      var box = document.getElementById('chk-' + id);
      if (!box) return;
      var on = !!state.journeys[id];
      box.checked = on;
      var sec = document.getElementById('j-' + id);
      if (sec) sec.classList.toggle('done', on);
      if (on) done++;
    });
    progressEl.textContent = done + ' of ' + JOURNEYS.length + ' journeys reviewed';
    approve.setAttribute('aria-pressed', String(state.verdict === 'approved'));
    more.setAttribute('aria-pressed', String(state.verdict === 'more'));
    if (document.activeElement !== noteEl) noteEl.value = state.note || '';
  }
  function save() {
    if (!db) { say('Not saved \u2014 this view cannot reach storage. Your ticks are visible but will not persist.', false); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      say('Saving\u2026', false);
      Promise.resolve(db.doc(DOC).set({ journeys: state.journeys, verdict: state.verdict, note: state.note, updatedAt: new Date().toISOString() }))
        .then(function () { say('Saved. Your decision persists on this page.', true); })
        .catch(function (e) { say('Could not save: ' + (e && e.code ? e.code : 'unknown'), false); });
    }, 400);
  }
  document.querySelectorAll('input[data-journey]').forEach(function (box) {
    box.addEventListener('change', function () { state.journeys[box.dataset.journey] = box.checked; paint(); save(); });
  });
  approve.addEventListener('click', function () { state.verdict = state.verdict === 'approved' ? null : 'approved'; paint(); save(); });
  more.addEventListener('click', function () { state.verdict = state.verdict === 'more' ? null : 'more'; paint(); save(); });
  noteEl.addEventListener('input', function () { state.note = noteEl.value; save(); });
  var lb = document.getElementById('lb'), lbImg = document.getElementById('lb-img'), lbCap = document.getElementById('lb-cap');
  document.addEventListener('click', function (e) {
    var img = e.target.closest ? e.target.closest('.shot img') : null;
    if (img) { lbImg.src = img.src; lbImg.alt = img.alt; lbCap.textContent = img.alt; lb.classList.add('on'); return; }
    if (lb.classList.contains('on')) lb.classList.remove('on');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.classList.remove('on'); });
  paint();
  if (!window.claude || !window.claude.use) { say('Ticks are local to this view \u2014 storage is not available here.', false); return; }
  window.claude.use('db').then(function (handle) {
    db = handle;
    if (!db) { say('Ticks are local to this view \u2014 storage is not available here.', false); return; }
    var ref = db.doc(DOC);
    var apply = function (snap) {
      var d = snap && typeof snap.data === 'function' ? snap.data() : (snap && snap.data) || snap;
      if (d && typeof d === 'object') { state.journeys = d.journeys || {}; state.verdict = d.verdict || null; state.note = d.note || ''; paint(); }
    };
    Promise.resolve(ref.get()).then(function (snap) { apply(snap); say('Ready. Your ticks and decision are saved as you make them.', true); })
      .catch(function () { say('Ready. Nothing saved yet.', true); });
    if (typeof ref.onSnapshot === 'function') { try { ref.onSnapshot(apply); } catch (e) {} }
  }).catch(function () { say('Ticks are local to this view \u2014 storage is not available here.', false); });
})();
</script>`;
};

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const main = () => {
  const dir = arg('evidence');
  const contentPath = arg('content');
  const out = arg('out');
  const budgetMb = Number(arg('budget-mb', '12'));
  if (!dir || !contentPath || !out) {
    console.error(
      'usage: build-evidence-page.mjs --evidence <dir> --content <file.json> --out <file.html> [--budget-mb 12]',
    );
    process.exit(2);
  }

  const manifest = readFileSync(join(dir, EVIDENCE_MANIFEST), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const report = JSON.parse(readFileSync(join(dir, EVIDENCE_REPORT), 'utf8'));
  const content = JSON.parse(readFileSync(contentPath, 'utf8'));

  const b64 = (p) => readFileSync(p).toString('base64');
  const shots = new Map(
    manifest.map((m) => [
      m.file,
      'data:image/png;base64,' + b64(join(dir, m.file)),
    ]),
  );
  let used = 0;
  for (const v of shots.values()) used += v.length;

  const specs = flattenReport(report);
  const candidates = [];
  for (const s of specs) {
    if (!s.video) continue;
    const abs = s.video.startsWith('/')
      ? s.video
      : join(process.cwd(), s.video);
    if (!existsSync(abs)) continue;
    candidates.push({
      key: `${slugOf(s.title)}|${s.project}`,
      abs,
      bytes: Math.ceil(statSync(abs).size * 1.37),
    });
  }
  const { kept, dropped } = selectMedia(
    candidates,
    budgetMb * 1024 * 1024,
    used,
  );
  const videos = new Map(
    kept.map((v) => [v.key, 'data:video/webm;base64,' + b64(v.abs)]),
  );

  const html = renderEvidencePage({ manifest, report, content, shots, videos });
  writeFileSync(out, html, 'utf8');
  console.log(
    `written ${out} ${(Buffer.byteLength(html) / 1048576).toFixed(2)}MB ` +
      `shots=${shots.size} videos=${videos.size}/${candidates.length}` +
      (dropped.length
        ? ` DROPPED=${dropped.length} (budget ${budgetMb}MB)`
        : ''),
  );
};

if (import.meta.url === `file://${process.argv[1]}`) main();
