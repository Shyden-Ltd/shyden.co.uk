/**
 * Classroom Group Creator — DOM wiring, animation and sound.
 *
 * Per the repo's working agreement, the logic lives in src/lib/grouping.ts and
 * this file only drives the page. It computes the arrangement FIRST, writes it
 * into the DOM as real text, and only then animates. That ordering is what
 * makes "skip the animation", a screen reader, and a finished deal all expose
 * exactly the same result — the animation is a presentation of the answer, never
 * the means of producing it.
 */
import {
  buildGroups,
  type Student,
  type Mode,
  type Leftovers,
  type SexMode,
} from '../lib/grouping';
import {
  envelopeTotalS,
  landVoicePlan,
  doneVoicePlans,
  shuffleGrainPlans,
  DONE_STAGGER_S,
  DONE_RISER,
  DONE_REVERB_SEND,
  SHUFFLE_SUB,
  SHUFFLE_REVERB_SEND,
  MASTER_GAIN,
  MASTER_HIGHPASS_HZ,
  MASTER_LOWPASS_HZ,
  MASTER_COMPRESSOR,
  REVERB_RETURN_GAIN,
  generateReverbImpulseResponse,
  generateSaturatorCurve,
  createPrng,
  admitVoice,
  FAST_STEP_S,
  NORMAL_STEP_S,
  type Envelope,
  type VoicePlan,
} from '../lib/sfx';
import {
  getStrings,
  renderError,
  groupName,
  resultsHeadingText,
  type Strings,
} from '../lib/i18n';
import { sectionState } from '../lib/sections';
import { staleReason, type Snapshot } from '../lib/staleness';

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

const form = $<HTMLFormElement>('cg-form');
if (form) {
  // The FIRST statement in the module, before anything that could throw.
  //
  // A <form> with no `action` natively GETs its own url, so a native submit
  // is the one path by which anything typed on this page could reach a URL,
  // a history entry or an access log. Everything below is enhancement; this
  // line is the privacy promise, and it is deliberately not guarded by any
  // condition, wrapped in any try, or placed after any work that might fail.
  // The markup carries no `name` on a data field either — two independent
  // barriers, because one of them is one careless edit from being removed.
  form.addEventListener('submit', (e) => e.preventDefault());

  /**
   * Storage is a convenience, never a dependency. Safari's "Block all
   * cookies", partitioned third-party contexts and some managed device
   * profiles throw SecurityError on the mere act of touching localStorage.
   * Uncaught, that throw would abort this module — and a dead module is
   * precisely the state the guard above exists to survive.
   */
  const remember = {
    read: (key: string): string | null => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write: (key: string, value: string): void => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // The preference cannot follow them to their next lesson. The toggle
        // still works for this one, which is the part that matters now.
      }
    },
  };

  // ── how to use ────────────────────────────────────────────────────────
  // #cg-howto is page chrome, not one of the tool's sections (see
  // ClassroomGroupsPage.astro's own comment on it), so it is wired here,
  // ahead of everything below that reads the roster or the engine, and
  // ahead of `reduceMotion`'s window.matchMedia call further down -- which
  // is a real throw site (see classroom-groups-privacy.spec.ts's "a
  // mid-module failure still cannot leak the class list"). Wiring this
  // first means the one thing a visitor can always still open or close is
  // this section, even if something later in the module dies. The
  // collapsed/expanded state is a UI preference, never class data, so it
  // goes through the same try/catch-wrapped `remember` the sound toggle
  // below also uses -- see H-07 in the stage-2 traceability table.
  //
  // Collapsed by DEFAULT since design spec section 2's operator ruling 2
  // (2026-08-08). '0' is the only stored value that means "a teacher left
  // this open"; absent (nothing stored yet) or '1' both mean collapsed --
  // which is why the read below is `!== '0'` rather than `=== '1'`: the
  // same key, the same two written values, just a different answer for
  // "nothing stored yet". ClassroomGroupsPage.astro's own inline script
  // reads this exact key the exact same way, synchronously, before this
  // deferred module has even loaded -- see that script's own comment for
  // why a deferred module cannot prevent the first-paint flash on its own.
  // The call below is therefore usually a no-op against DOM state that
  // inline script already set; it stays as the source of truth for
  // anywhere that inline script could not run (its own try/catch covers
  // when that is).
  const HOWTO_KEY = 'cg-howto-collapsed';
  const howToToggle = $<HTMLButtonElement>('cg-howto-toggle');
  const howToBody = $<HTMLElement>('cg-howto-body');
  if (howToToggle && howToBody) {
    const applyHowTo = (isCollapsed: boolean) => {
      // Only the BODY ever gets `hidden`. The toggle itself is never
      // hidden by either state -- a control that hides itself is a trap,
      // and this is the only way back open once it is closed.
      howToBody.hidden = isCollapsed;
      howToToggle.setAttribute('aria-expanded', String(!isCollapsed));
    };
    applyHowTo(remember.read(HOWTO_KEY) !== '0');
    howToToggle.addEventListener('click', () => {
      const next = !howToBody.hidden;
      applyHowTo(next);
      remember.write(HOWTO_KEY, next ? '1' : '0');
    });
  }

  // ── the tool's four collapsible sections ────────────────────────────────
  // Student details, Grouping options, Import / export, Sound & animation
  // (the fourth folded in by Stage 2, Task 7 -- see
  // ClassroomGroupsPage.astro's own comment on the restructuring). Same
  // reason this is wired here, ahead of `reduceMotion`'s throw site below,
  // as #cg-howto's own toggle just above: a mid-module failure further down
  // must not be able to leave any section header un-openable. Unlike
  // #cg-howto, nothing here is read from or written to `remember` -- design
  // doc section 11 names exactly two UI preferences allowed to persist (the
  // how-to collapsed state, and a later print panel), and these are not one
  // of them, so every visit starts collapsed with no localStorage involved.
  // This loop only opens and closes the SECTION -- `cg-sound`'s own checkbox
  // and its remembered on/off state are separate, wired further down under
  // "settings", the same separation `cg-grouping`'s section toggle here and
  // its leftovers-radio listener (`updateGroupingHeader`, further down)
  // already have.
  for (const id of ['cg-students', 'cg-grouping', 'cg-io', 'cg-sound']) {
    const toggle = $<HTMLButtonElement>(`${id}-toggle`);
    const body = $<HTMLElement>(`${id}-body`);
    if (!toggle || !body) continue;
    toggle.addEventListener('click', () => {
      const opening = body.hidden;
      body.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(opening));
    });
  }

  const t: Strings = getStrings(document.documentElement.lang);
  // The engine's errors (and warnings) carry student NUMBERS, never names --
  // identity is the number, and grouping.ts has no roster to resolve one
  // from (see Student.number's doc comment there). `roster` is where a
  // number would resolve to a name; it is empty today because the
  // paste-names box that used to feed one is gone (see the fieldset removed
  // from ClassroomGroupsPage.astro) -- stage 3 is what populates it.
  // `resolveStudent` reads `roster`, falling back to the same numbered label
  // `renderError` itself defaults to when no resolver is passed at all.
  // `label` below calls this exact function instead of reading a name of its
  // own, so there is only ONE place a number becomes display text -- which
  // is what makes it true, not just intended, that the results grid and
  // every rendered error can never drift apart: nothing is left that could
  // resolve the two differently.
  const roster = new Map<number, string>();
  const resolveStudent = (n: number): string =>
    roster.get(n) ?? t.studentNumber(n);
  const errorBox = $<HTMLParagraphElement>('cg-error')!;
  const results = $<HTMLElement>('cg-results')!;
  const resultsHeadingEl = $<HTMLHeadingElement>('cg-results-h')!;
  const classInput = $<HTMLInputElement>('cg-class')!;
  const summary = $<HTMLParagraphElement>('cg-summary')!;
  const tables = $<HTMLDivElement>('cg-tables')!;
  // 'cg-sound' now names the collapsible SECTION (wired in the loop above,
  // ClassroomGroupsPage.astro's own comment has the reasoning) -- the
  // checkbox itself is 'cg-sound-check'.
  const soundToggle = $<HTMLInputElement>('cg-sound-check')!;
  const soundText = $<HTMLSpanElement>('cg-sound-text')!;
  const speedSelect = $<HTMLSelectElement>('cg-speed')!;
  const goButton = $<HTMLButtonElement>('cg-go')!;

  // A localStorage KEY, not a DOM id -- deliberately left as the literal
  // 'cg-sound' rather than renamed alongside the checkbox above: a teacher
  // who already muted sound before this task has that preference stored
  // under this exact string, and changing it would silently reset them to
  // the default (sound ON) the next time they load the page. The two
  // namespaces only ever coincided by accident; nothing requires them to
  // match.
  const SOUND_KEY = 'cg-sound';
  const reduceMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;

  // ── settings ────────────────────────────────────────────────────────────
  // Sound defaults ON (operator decision). A stored preference wins, so a
  // teacher who muted it once is not surprised again on their next lesson.
  const stored = remember.read(SOUND_KEY);
  if (stored !== null) soundToggle.checked = stored === 'on';
  const syncSoundLabel = () => {
    soundText.textContent = soundToggle.checked ? t.soundOn : t.soundOff;
  };
  syncSoundLabel();
  soundToggle.addEventListener('change', () => {
    remember.write(SOUND_KEY, soundToggle.checked ? 'on' : 'off');
    syncSoundLabel();
  });

  // A device asking for reduced motion gets the result without the show, but
  // the teacher can still opt back in — it is a default, not a lock.
  if (reduceMotion) speedSelect.value = 'skip';

  // ── conditional fields ──────────────────────────────────────────────────
  const showFor = (attr: string, value: string) => {
    document.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((el) => {
      el.hidden = el.dataset[attr] !== value;
    });
  };
  const readRadio = (name: string) =>
    (
      form.querySelector(
        `input[name="${name}"]:checked`,
      ) as HTMLInputElement | null
    )?.value ?? '';

  // `mode`/`leftovers`/`sexMode`/`count` -- ONE function each, called from
  // every place that needs the live value (submit, the grouping header,
  // and the staleness snapshot further down) so none of the four can ever
  // read a different answer than the others. Two call sites computing the
  // same fact by hand is how a header ends up disagreeing with reality
  // (see the fix recorded on #cg-grouping's own header, Task 3) -- the same
  // failure mode a staleness snapshot built from its OWN separate reads
  // could reintroduce.
  //
  // `readMode` returns the exact shape buildGroups expects, not just the
  // radio's own value: #cg-size or #cg-groups can change while the radio
  // itself stays put, and staleReason's own doc comment (src/lib/staleness.ts)
  // is why the snapshot needs the WHOLE shape, JSON-stringified, in one
  // comparison rather than the number and the kind compared separately.
  const readMode = (): Mode =>
    readRadio('mode') === 'groupCount'
      ? {
          kind: 'groupCount',
          count: Number(($('cg-groups') as HTMLInputElement).value),
        }
      : {
          kind: 'perGroup',
          size: Number(($('cg-size') as HTMLInputElement).value),
        };
  const readLeftovers = (): Leftovers =>
    readRadio('leftovers') === 'bunch' ? 'bunch' : 'spread';
  // Hard-coded 'off', on purpose: #cg-sex-mix/#cg-sex-separate render
  // (Stage 2, Task 4) but stay permanently `disabled` -- src/lib/sexOptions.ts's
  // `sexWhy` always returns its "no list at all" reason, because there is
  // no roster on this page until stage 3. A native form already excludes a
  // disabled control's value from submission; reading `.checked` here would
  // honour the SAME rule by hand for no behavioural difference (an
  // unchecked, disabled checkbox reads `false` regardless), so this stays
  // hard-coded rather than adding a read that can only ever observe the one
  // value it already has. ONE function, not a literal repeated at every
  // call site, so the day stage 3 makes this live is a change made here
  // once, not a hunt through the file for every place 'off' was written by
  // hand. Pinned by classroom-groups-script.test.ts: the day this stops
  // returning a hard-coded literal is the day the two sex switches -- and
  // staleReason's own `staleSexMode` branch below -- become live.
  const readSexMode = (): SexMode => 'off';

  // #cg-count ("Number of students") -- the same ONE-function reasoning as
  // mode/leftovers/sexMode above. Submit and `readRoster` (below) both need
  // the exact live value; reading it inline at each call site is exactly
  // the duplication this file's own comment, just above, warns is how two
  // places end up disagreeing.
  const readCount = (): number =>
    Number(($('cg-count') as HTMLInputElement).value);

  // `roster` is what the class list currently IS. Stage 2 has no
  // per-student data yet -- #cg-count is the page's only population
  // control, so reading it here is not a stand-in for a future roster
  // snapshot, it already IS one, the same way `readMode` already returns
  // the exact shape `buildGroups` expects rather than a placeholder for a
  // richer shape later. JSON.stringify'd at this call site, the same way
  // `readMode` stringifies its own shape just above, so the result is
  // always a primitive `snapshot()`'s comparison can compare by VALUE --
  // see staleReason's own `assertComparable` (src/lib/staleness.ts), which
  // throws if a future call site ever skips this and hands it something
  // that is not already a string. Stage 3 extends THIS function to fold
  // real per-student fields into the same returned object, rather than
  // adding a second field to Snapshot or a second machine alongside this
  // one -- see Snapshot's own doc comment for why.
  const readRoster = (): string => JSON.stringify({ count: readCount() });

  // `leftovers` is the one `ToolState` field a teacher can actually change
  // today: the radios now live inside `#cg-grouping-body` (Stage 2, Task 4
  // rehomed them there, unchanged), and the header must not go on reporting
  // "none" once one is chosen. This listener needed NO change for that
  // move: it delegates on `#cg-form`'s own `change` event and
  // `readRadio` queries `input[name="leftovers"]:checked` scoped to the
  // whole form, neither of which cares how deep the radio sits inside it.
  // Calls the SAME `sectionState` that produced the header's build-time
  // text (see ClassroomGroupsPage.astro's own `initialToolState`) with
  // every other field left at that same default -- no roster exists yet,
  // and nothing can mark the roster dirty until a later stage gives it
  // something to lose -- so the two can never disagree by computing the
  // sentence two different ways. `sexMode` stays `'off'` here for the same
  // reason `readSexMode` always returns `'off'` -- see that function's own
  // comment, above, for the rest of the reasoning.
  const groupingStateEl = document.querySelector<HTMLElement>(
    '#cg-grouping .state',
  );
  const updateGroupingHeader = () => {
    if (!groupingStateEl) return;
    groupingStateEl.textContent = sectionState(
      {
        named: 0,
        absent: 0,
        together: 0,
        apart: 0,
        rosterSize: 0,
        sexMode: readSexMode(),
        leftovers: readLeftovers(),
        dirty: false,
      },
      t,
    ).groupingOptions;
  };

  // ── staleness ────────────────────────────────────────────────────────────
  // Design spec section 8. `lastSnapshot` is what the groups ON SCREEN were
  // actually made from -- set once, at the end of a successful shuffle
  // (below), and never touched anywhere else. Every input/change event on
  // the form compares it against a FRESH read of the form (`snapshot()`),
  // so undoing a change needs no code of its own: the comparison simply
  // comes back equal again. `null` until the first shuffle, so nothing is
  // ever reported stale before there is anything on screen to be stale
  // about. See staleReason's own doc comment (src/lib/staleness.ts) for why
  // a comparison, not a flag, is the whole point.
  let lastSnapshot: Snapshot | null = null;
  const staleNotice = $<HTMLElement>('cg-stale')!;
  const staleText = $<HTMLParagraphElement>('cg-stale-text')!;

  const snapshot = (): Snapshot => ({
    mode: JSON.stringify(readMode()),
    leftovers: readLeftovers(),
    sexMode: readSexMode(),
    roster: readRoster(),
  });

  const updateStaleness = () => {
    // No notice before there are groups to be stale (`lastSnapshot` is
    // still null), and none while the results section itself is hidden --
    // an error refusal already hides #cg-results (see the submit handler's
    // failure branch below), which takes this notice out of view with it;
    // there is nothing useful to compare against a shuffle that did not
    // happen.
    const reason =
      lastSnapshot && !results.hidden
        ? staleReason(lastSnapshot, snapshot(), t)
        : null;
    results.classList.toggle('stale', reason !== null);
    if (reason === null) {
      staleNotice.hidden = true;
      // Not just hidden -- CLEARED. `hidden` takes it out of the a11y tree,
      // but the text node itself would otherwise still sit in the DOM, and
      // a query that finds text regardless of visibility (Playwright's own
      // `getByText`, same as a browser extension or any other DOM-reading
      // tool) would still report "These groups are out of date" as present
      // on the page. Caught this exact way: "shuffling clears it" failed
      // with `getByText('out of date')` still resolving to 1 element,
      // hidden but not gone, before this line existed.
      staleText.textContent = '';
      return;
    }
    // Joins the tree before the sentence is written -- same reason
    // #cg-error/#cg-summary do, see the submit handler's own comment on
    // announcement ordering. Guarded so an unchanged reason (most
    // keystrokes, once already stale) does not re-write the same text into
    // a live region and risk a spurious re-announcement.
    staleNotice.hidden = false;
    if (staleText.textContent !== reason) staleText.textContent = reason;
  };

  form.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'mode') showFor('mode', target.value);
    if (target.name === 'naming') showFor('naming', target.value);
    if (target.name === 'leftovers') updateGroupingHeader();
    updateStaleness();
  });
  // The brief's own instruction: recompute on every `change` AND `input`
  // event, so a teacher typing a new group size sees the notice the moment
  // they type it, not only once the field loses focus.
  form.addEventListener('input', updateStaleness);

  // ── sound (synthesised; the site ships no audio assets by policy) ────────
  // Everything that SHAPES these three effects -- the inharmonic partials,
  // the envelopes, the scale and chord, the grain cloud, the reverb IR's
  // own generation, every gain -- is pure data/functions in src/lib/sfx.ts,
  // unit-tested there (tests/unit/sfx.test.ts) with no AudioContext in
  // sight. Everything below this comment is wiring only: it turns those
  // numbers into real Web Audio nodes and schedules them, exactly the
  // split CLAUDE.md asks for. The signal chain, per voice, then the shared
  // master bus:
  //
  //   voice ─┬─ partials: 3 oscillators, independent gain+pitch envelope
  //          ├─ transient: a short noise burst through a resonant bandpass
  //          └─ sub: a sine with its own falling pitch
  //                 │
  //                 ├─ voice gain (ADSR) → saturator (WaveShaper) → panner
  //                 │        ├─ dry ─────────────────────────────→ master
  //                 │        └─ send → convolver (synthesised IR) → master
  //   master → highpass → lowpass → compressor → destination
  let audio: AudioContext | null = null;
  let master: GainNode | null = null;
  let reverbConvolver: ConvolverNode | null = null;
  let saturatorCurve: Float32Array | null = null;
  let variationRng: (() => number) | null = null;

  /** Seeded once, lazily, from `Math.random()` -- fine here, this is Web
   *  Audio wiring, not the pure module sfx.ts (which the brief explicitly
   *  forbids `Math.random()` in, so its own output stays reproducible from
   *  a seed for tests). Threaded through every land()/shuffle()/done()
   *  call, exactly the way `buildGroups` above is handed `random:
   *  Math.random` rather than reading it internally. */
  const ensureVariationRng = (): (() => number) => {
    if (!variationRng)
      variationRng = createPrng(Math.floor(Math.random() * 0xffffffff));
    return variationRng;
  };

  /**
   * Creates the AudioContext, the master bus and the shared reverb
   * convolver lazily, on first use -- exactly once, same as before this
   * task (see the "reuses it" e2e test in classroom-groups.spec.ts). Every
   * voice's DRY signal connects to `master`; every voice's WET send
   * connects to `reverbConvolver`, which itself feeds back into `master`
   * -- a shared send/return bus, not one convolver per voice, per the
   * signal chain above.
   */
  const ensureAudio = (): {
    ctx: AudioContext;
    master: GainNode;
    reverbConvolver: ConvolverNode;
  } => {
    if (!audio || !master || !reverbConvolver) {
      audio = new (window.AudioContext ?? (window as any).webkitAudioContext)();
      const ctx = audio;

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = MASTER_HIGHPASS_HZ;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = MASTER_LOWPASS_HZ;
      lowpass.Q.value = 0.707; // flat/Butterworth -- "gentle", no resonant peak
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = MASTER_COMPRESSOR.thresholdDb;
      compressor.knee.value = MASTER_COMPRESSOR.kneeDb;
      compressor.ratio.value = MASTER_COMPRESSOR.ratio;
      compressor.attack.value = MASTER_COMPRESSOR.attackS;
      compressor.release.value = MASTER_COMPRESSOR.releaseS;
      highpass.connect(lowpass).connect(compressor).connect(ctx.destination);

      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(highpass);

      // The reverb IR is GENERATED, never fetched or bundled -- the site's
      // own "no audio assets" policy applies to this effect too. Its
      // level is fixed mathematically at generation time (see
      // REVERB_NORMALIZE_PEAK's own doc comment in sfx.ts), so
      // `normalize` is turned OFF here: Web Audio's own auto-normalise
      // would re-scale it a second, uncontrolled time on top of that.
      const ir = generateReverbImpulseResponse(
        ctx.sampleRate,
        ensureVariationRng(),
      );
      const irBuffer = ctx.createBuffer(2, ir.left.length, ctx.sampleRate);
      irBuffer.getChannelData(0).set(ir.left);
      irBuffer.getChannelData(1).set(ir.right);
      reverbConvolver = ctx.createConvolver();
      reverbConvolver.normalize = false;
      reverbConvolver.buffer = irBuffer;
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = REVERB_RETURN_GAIN;
      reverbConvolver.connect(reverbReturn);
      reverbReturn.connect(master);

      saturatorCurve = new Float32Array(generateSaturatorCurve());
    }
    return { ctx: audio, master, reverbConvolver };
  };

  /** A fresh buffer of white noise -- generated in memory from
   *  Math.random(), never fetched or bundled, so this stays inside "the
   *  site ships no audio assets" however many times it runs. Reused by
   *  every noise-based layer: land's transient, shuffle's grains, done's
   *  riser. */
  const noiseBuffer = (ctx: AudioContext, durationS: number): AudioBuffer => {
    const length = Math.max(1, Math.round(ctx.sampleRate * durationS));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  };

  /**
   * attack -> decay -> release, ramped on the GainParam of whichever node
   * the caller built -- scheduled entirely against `startTime` (always an
   * `audio.currentTime`-derived value; see sfx.shuffle/land/done below),
   * never `setTimeout`. `0.0001` is the floor every ramp starts and ends
   * on: `exponentialRampToValueAtTime` requires a strictly positive
   * target, so the true "silence" a browser could give us is not
   * representable. Returns the envelope's own total duration so the
   * caller knows when to `.stop()` its node.
   */
  const FLOOR_GAIN = 0.0001;
  const applyEnvelope = (
    gainParam: AudioParam,
    peakGain: number,
    envelope: Envelope,
    startTime: number,
  ): number => {
    const totalS = envelopeTotalS(envelope);
    gainParam.setValueAtTime(FLOOR_GAIN, startTime);
    gainParam.exponentialRampToValueAtTime(
      Math.max(FLOOR_GAIN, peakGain),
      startTime + envelope.attackS,
    );
    gainParam.exponentialRampToValueAtTime(
      Math.max(FLOOR_GAIN, peakGain * envelope.sustainLevel),
      startTime + envelope.attackS + envelope.decayS,
    );
    gainParam.exponentialRampToValueAtTime(FLOOR_GAIN, startTime + totalS);
    return totalS;
  };

  /** Everything currently needed to force a voice silent early -- see
   *  admitAndTrack, which steals the oldest once MAX_POLYPHONY (sfx.ts) is
   *  exceeded. `sources` covers every oscillator/buffer-source the voice
   *  started, so stopNow() can stop all of them, not just the audible
   *  one. */
  interface VoiceHandle {
    bodyGain: GainNode;
    sources: (OscillatorNode | AudioBufferSourceNode)[];
    stopNow: () => void;
  }

  /** How long a stolen voice takes to fade to silence, rather than being
   *  cut instantly -- an instant gain-node cut can click (a discontinuous
   *  jump in the waveform); a short forced ramp to the floor avoids that
   *  even when a voice is being stolen well before its own natural
   *  release would have reached it. */
  const STEAL_FADE_S = 0.015;

  /**
   * Builds one full struck voice (land's own note, or one note of done's
   * chord) from a resolved VoicePlan -- the signal chain in this section's
   * own header comment, node for node: 3 partial oscillators + a noise
   * transient + a falling sub, merged into one voice-gain node (the ADSR),
   * through the shared saturator curve, through a panner, then split into
   * a dry path to `master` and a send path (scaled by the plan's own
   * `reverbSend`) into the shared convolver.
   */
  const scheduleVoice = (plan: VoicePlan, startTime: number): VoiceHandle => {
    const { ctx, master: bus, reverbConvolver: convolver } = ensureAudio();

    const bodyGain = ctx.createGain();
    const bodyTotalS = applyEnvelope(
      bodyGain.gain,
      plan.bodyPeakGain,
      plan.bodyEnvelope,
      startTime,
    );

    const saturator = ctx.createWaveShaper();
    saturator.curve = saturatorCurve!; // built above, in ensureAudio, before this can run
    saturator.oversample = '2x';

    const panner = ctx.createStereoPanner();
    panner.pan.value = plan.pan;

    bodyGain.connect(saturator).connect(panner);
    panner.connect(bus);
    const sendGain = ctx.createGain();
    sendGain.gain.value = plan.reverbSend;
    panner.connect(sendGain);
    sendGain.connect(convolver);

    const sources: (OscillatorNode | AudioBufferSourceNode)[] = [];

    for (const partial of plan.partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(partial.freqStartHz, startTime);
      osc.frequency.exponentialRampToValueAtTime(
        partial.freqEndHz,
        startTime + partial.pitchGlideS,
      );
      const gain = ctx.createGain();
      applyEnvelope(
        gain.gain,
        partial.relativeGain,
        partial.envelope,
        startTime,
      );
      osc.connect(gain).connect(bodyGain);
      osc.start(startTime);
      osc.stop(startTime + bodyTotalS + 0.02);
      sources.push(osc);
    }

    const transientTotalS = envelopeTotalS(plan.transient.envelope);
    const transientSrc = ctx.createBufferSource();
    transientSrc.buffer = noiseBuffer(ctx, transientTotalS);
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = plan.transient.filterCenterHz;
    bandpass.Q.value = plan.transient.q;
    const transientGain = ctx.createGain();
    applyEnvelope(
      transientGain.gain,
      plan.transient.relativeGain,
      plan.transient.envelope,
      startTime,
    );
    transientSrc.connect(bandpass).connect(transientGain).connect(bodyGain);
    transientSrc.start(startTime);
    transientSrc.stop(startTime + transientTotalS + 0.02);
    sources.push(transientSrc);

    const subTotalS = envelopeTotalS(plan.sub.envelope);
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(plan.sub.freqStartHz, startTime);
    subOsc.frequency.exponentialRampToValueAtTime(
      plan.sub.freqEndHz,
      startTime + subTotalS,
    );
    const subGain = ctx.createGain();
    applyEnvelope(
      subGain.gain,
      plan.sub.relativeGain,
      plan.sub.envelope,
      startTime,
    );
    subOsc.connect(subGain).connect(bodyGain);
    subOsc.start(startTime);
    subOsc.stop(startTime + subTotalS + 0.02);
    sources.push(subOsc);

    const stopNow = (): void => {
      try {
        const now = ctx.currentTime;
        bodyGain.gain.cancelScheduledValues(now);
        bodyGain.gain.setValueAtTime(
          Math.max(FLOOR_GAIN, bodyGain.gain.value),
          now,
        );
        bodyGain.gain.exponentialRampToValueAtTime(
          FLOOR_GAIN,
          now + STEAL_FADE_S,
        );
        for (const src of sources) src.stop(now + STEAL_FADE_S + 0.005);
      } catch {
        // A stolen voice that goes silent a little abruptly is not worth
        // breaking the tool over -- same "audio is decoration" reasoning
        // as `play` below.
      }
    };

    return { bodyGain, sources, stopNow };
  };

  /** MAX_POLYPHONY (sfx.ts) voices at once; the oldest is stolen (faded
   *  and stopped early) the instant a 9th would otherwise start. Long
   *  reverb tails (done's release runs to ~0.9s) plus a big class landing
   *  many groups in a fast run must not pile up an unbounded number of
   *  simultaneously-ringing voices. */
  let activeVoices: VoiceHandle[] = [];
  const admitAndTrack = (handle: VoiceHandle): void => {
    const { activeVoices: next, stolen } = admitVoice(activeVoices, handle);
    activeVoices = next;
    stolen?.stopNow();
  };

  /** Sound only plays when the toggle is checked, and audio is decoration:
   *  a browser refusing any part of this must never break the tool. */
  const play = (effect: () => void): void => {
    if (!soundToggle.checked) return;
    try {
      effect();
    } catch {
      // Audio is decoration. If the browser refuses, the tool still works.
    }
  };

  const sfx = {
    // A granular riffle: 16-22 independently-filtered noise grains over a
    // soft arch, plus one onset thump -- see shuffleGrainPlans' own doc
    // comment in sfx.ts for why this reads as discrete objects in motion
    // rather than one continuous whoosh.
    shuffle: () =>
      play(() => {
        const { ctx, master: bus, reverbConvolver: convolver } = ensureAudio();
        const startTime = ctx.currentTime;
        const rng = ensureVariationRng();

        for (const grain of shuffleGrainPlans(rng)) {
          const grainStart = startTime + grain.onsetS;
          const grainTotalS = envelopeTotalS(grain.envelope);
          const src = ctx.createBufferSource();
          src.buffer = noiseBuffer(ctx, grainTotalS);
          const bandpass = ctx.createBiquadFilter();
          bandpass.type = 'bandpass';
          bandpass.frequency.value = grain.filterCenterHz;
          bandpass.Q.value = grain.q;
          const gain = ctx.createGain();
          applyEnvelope(gain.gain, grain.peakGain, grain.envelope, grainStart);
          const panner = ctx.createStereoPanner();
          panner.pan.value = grain.pan;
          src.connect(bandpass).connect(gain).connect(panner);
          panner.connect(bus);
          const sendGain = ctx.createGain();
          sendGain.gain.value = SHUFFLE_REVERB_SEND;
          panner.connect(sendGain);
          sendGain.connect(convolver);
          src.start(grainStart);
          src.stop(grainStart + grainTotalS + 0.02);
        }

        const subOsc = ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(SHUFFLE_SUB.startHz, startTime);
        subOsc.frequency.exponentialRampToValueAtTime(
          SHUFFLE_SUB.endHz,
          startTime + SHUFFLE_SUB.durationS,
        );
        const subGain = ctx.createGain();
        applyEnvelope(
          subGain.gain,
          SHUFFLE_SUB.gain,
          {
            attackS: 0.005,
            decayS: 0,
            sustainLevel: 1,
            releaseS: SHUFFLE_SUB.durationS,
          },
          startTime,
        );
        subOsc.connect(subGain).connect(bus);
        subOsc.start(startTime);
        subOsc.stop(startTime + SHUFFLE_SUB.durationS + 0.02);
      }),
    // A soft, weighted struck voice -- inharmonic partials, a contact
    // transient and a falling sub -- pitched from the pentatonic scale and
    // stepping with the group index. See scheduleVoice's own doc comment.
    land: (i: number) =>
      play(() => {
        const { ctx } = ensureAudio();
        const startTime = ctx.currentTime;
        admitAndTrack(
          scheduleVoice(landVoicePlan(i, ensureVariationRng()), startTime),
        );
      }),
    // A riser swelling into a sus2/add9 cluster, each note the same
    // struck-voice architecture as `land`, staggered and stretched to a
    // much longer release -- "an arrival, not a snap-off". Every note
    // scheduled against THIS SAME audio-clock startTime, offset by
    // DONE_STAGGER_S, never by setTimeout.
    done: () =>
      play(() => {
        const { ctx, master: bus, reverbConvolver: convolver } = ensureAudio();
        const startTime = ctx.currentTime;
        const rng = ensureVariationRng();

        const riserTotalS = DONE_RISER.durationS + DONE_RISER.releaseS;
        const riserSrc = ctx.createBufferSource();
        riserSrc.buffer = noiseBuffer(ctx, riserTotalS);
        const riserFilter = ctx.createBiquadFilter();
        riserFilter.type = 'highpass';
        riserFilter.Q.value = DONE_RISER.q;
        riserFilter.frequency.setValueAtTime(DONE_RISER.startHz, startTime);
        riserFilter.frequency.exponentialRampToValueAtTime(
          DONE_RISER.endHz,
          startTime + DONE_RISER.durationS,
        );
        const riserGain = ctx.createGain();
        applyEnvelope(
          riserGain.gain,
          DONE_RISER.gain,
          {
            attackS: DONE_RISER.durationS,
            decayS: 0,
            sustainLevel: 1,
            releaseS: DONE_RISER.releaseS,
          },
          startTime,
        );
        riserSrc.connect(riserFilter).connect(riserGain);
        riserGain.connect(bus);
        const riserSend = ctx.createGain();
        riserSend.gain.value = DONE_REVERB_SEND;
        riserGain.connect(riserSend);
        riserSend.connect(convolver);
        riserSrc.start(startTime);
        riserSrc.stop(startTime + riserTotalS + 0.02);

        doneVoicePlans(rng).forEach((plan, j) => {
          admitAndTrack(scheduleVoice(plan, startTime + DONE_STAGGER_S[j]));
        });
      }),
  };

  // ── rendering ───────────────────────────────────────────────────────────
  const AVATAR_HUES = [8, 34, 64, 122, 168, 200, 250, 288, 320, 344];

  /**
   * A CONSTANT with no interpolation, so this template can never carry
   * teacher-supplied text however the calling code is later edited. The
   * per-student colour arrives as a CSS custom property instead of being
   * spliced into the markup, and the name is set with textContent.
   * Decorative: hidden from assistive tech, which reads the name instead.
   */
  const AVATAR_SVG =
    '<svg class="avatar" viewBox="0 0 40 40" focusable="false" aria-hidden="true">' +
    '<circle class="a-bg" cx="20" cy="20" r="20"></circle>' +
    '<circle class="a-head" cx="20" cy="16" r="7"></circle>' +
    '<path class="a-body" d="M6 40a14 14 0 0 1 28 0Z"></path>' +
    '</svg>';

  /** Deterministic per student, so the same child keeps the same face. */
  const hueFor = (student: Student) =>
    AVATAR_HUES[student.number % AVATAR_HUES.length];

  const label = (student: Student) => resolveStudent(student.number);

  const render = (groups: Student[][], naming: string, theme: string) => {
    tables.textContent = '';
    groups.forEach((group, i) => {
      const card = document.createElement('section');
      card.className = 'group';
      const h = document.createElement('h3');
      h.textContent = groupName(
        i,
        naming === 'themed' ? 'themed' : 'numbered',
        theme,
        t,
      );
      const ul = document.createElement('ul');
      group.forEach((student, j) => {
        const li = document.createElement('li');
        li.className = 'student';
        li.style.setProperty('--hue', String(hueFor(student)));
        li.innerHTML = AVATAR_SVG; // constant markup, no interpolation
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = label(student); // the untrusted value, set as TEXT
        li.appendChild(who);
        ul.appendChild(li);
      });
      card.append(h, ul);
      tables.appendChild(card);
    });
  };

  const animate = async (groups: Student[][], speed: string) => {
    const cards = Array.from(tables.querySelectorAll<HTMLElement>('.student'));
    if (speed === 'skip') {
      cards.forEach((c) => c.classList.add('dealt'));
      return;
    }
    // FAST_STEP_S/NORMAL_STEP_S live in sfx.ts, not here, so
    // LAND_TRANSIENT_PLUS_BODY_S/LAND_RELEASE_S and this step can be
    // compared in one place (sfx.test.ts) instead of trusting a
    // hand-copied 45/110 to stay in sync with whatever this line actually
    // uses.
    const step = (speed === 'fast' ? FAST_STEP_S : NORMAL_STEP_S) * 1000;
    sfx.shuffle();
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.add('dealt');
      sfx.land(i);
      await new Promise((r) => setTimeout(r, step));
    }
    sfx.done();
  };

  // ── submit ──────────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;

    const mode = readMode();

    const count = readCount();
    const outcome = buildGroups({
      students: count, // a number until a future stage gives us a roster
      mode,
      leftovers: readLeftovers(),
      sexMode: readSexMode(), // hard-coded 'off' this stage -- see that function's own comment
      pinned: [], // a later stage wires the pins
      random: Math.random,
    });

    if (!outcome.ok) {
      results.hidden = true;
      // Unhidden BEFORE the text lands. A live region only reports mutations
      // to something already in the accessibility tree, so writing first and
      // revealing second announced nothing at all — the visitor pressed the
      // button and heard silence.
      errorBox.hidden = false;
      errorBox.textContent = renderError(outcome.error, t, resolveStudent);
      // No focus move: role="alert" is what announces this. The old
      // errorBox.focus?.() was neither a guard (focus always exists on an
      // HTMLElement, so the ?. never short-circuits) nor a focus move (a <p>
      // with no tabindex is not focusable) — it only looked like both.

      // The results are gone, so the button must stop offering to reshuffle
      // them. Left alone it still read "Shuffle again" from the last success.
      goButton.textContent = t.makeGroups;
      return;
    }

    // A success can still carry `warnings` -- e.g. "two girls ended up in a
    // group of boys" -- see grouping.ts's own module doc. Read here, not
    // dropped silently, but not yet rendered anywhere on the page: `sexMode`
    // stays `'off'` above (see that comment), so this array is always empty
    // today regardless. G-11 (test traceability matrix) is owed to stage 3,
    // which is what would give `sexMode` a way to ever be anything else.
    const { groups, warnings } = outcome.result;
    void warnings;
    const naming = readRadio('naming');
    const theme = ($('cg-theme') as HTMLSelectElement).value;

    // Read fresh at every submit -- never cached -- so a class name typed
    // or changed between two shuffles is picked up on the next one. Set
    // through `.textContent`, never `.innerHTML`: a teacher's typed text is
    // theirs, not markup, the same rule the results grid already follows
    // for a student's own name below (`who.textContent = label(student)`).
    // See resultsHeadingText's own doc comment (src/lib/i18n/index.ts) for
    // why the value is threaded through untrimmed. Written here, alongside
    // render() and before `results.hidden = false`, because -- like the
    // group cards `render()` builds -- this is structural content inside a
    // non-live section, not the `role="status"` region itself; only
    // `summary` below needs the write-after-reveal ordering that makes a
    // live-region announcement actually fire.
    resultsHeadingEl.textContent = resultsHeadingText(classInput.value, t);
    // Text first, animation second — see the note at the top of this file.
    render(groups, naming, theme);
    // Same ordering rule as the error path: the region joins the tree, and
    // only then is the sentence written into it.
    results.hidden = false;
    summary.textContent = t.resultsSummary(groups.length, groups.flat().length);
    goButton.textContent = t.again;
    // A fresh shuffle is, by definition, made from exactly what the form
    // says right now -- comparing that against itself returns null, which
    // is what clears any notice left over from before this shuffle. Set
    // AFTER results.hidden = false so updateStaleness's own guard sees a
    // visible section, though staleReason would return null either way.
    lastSnapshot = snapshot();
    updateStaleness();

    goButton.disabled = true;
    try {
      await animate(groups, speedSelect.value);
    } finally {
      // In a finally because a rejection here would otherwise leave the
      // button disabled for good — and a disabled default button also
      // suppresses Enter, so there would be no keyboard way out either.
      goButton.disabled = false;
    }
  });
}
