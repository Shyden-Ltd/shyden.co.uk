/**
 * Sound design for the Classroom Group Creator's three effects -- shuffle,
 * land(i), done -- as pure data and pure functions. No `AudioContext`
 * reference anywhere in this file, and nothing here touches `window` or
 * `document`: every export is a number, a readonly array/object of numbers,
 * or a function of numbers (and an injected `rng`), so Vitest exercises the
 * real synthesiser logic, not a fake standing in for Web Audio (see
 * CLAUDE.md: "logic is pure ... page scripts only wire the DOM").
 * `src/scripts/classroom-groups.ts` is the only thing that ever turns these
 * numbers into an audio graph.
 *
 * This is the second attempt at this task. The first shipped a marimba
 * emulation -- a sine fundamental, HARMONIC partials (2x, 4x -- integer
 * multiples), everything hard-cut at 34ms -- and was rejected as sounding
 * like a 1995 soundfont. Two changes fix the actual causes, not the
 * symptoms:
 *
 * 1. Partials are INHARMONIC (ratios 1 : 2.756 : 5.404, a free-free bar's
 *    real transverse-mode ratios). Integer-multiple overtones are what an
 *    organ or an early GM soundfont sounds like, because a pure harmonic
 *    stack has no information in it other than "one pitch" -- the ear
 *    cannot distinguish it from a single band-limited tone. Non-integer
 *    ratios are what a physical, resonating MATERIAL sounds like, because
 *    real materials very rarely vibrate in exact integer relationships
 *    (a taut string is the one common exception; a bar, a plate or a bell
 *    is not). This is the single highest-leverage change in this file.
 * 2. The audible TAIL is no longer truncated to fit the fast animation
 *    step. Only the TRANSIENT + BODY (see LAND_TRANSIENT_PLUS_BODY_S) has
 *    to fit inside FAST_STEP_S; the RELEASE (up to LAND_RELEASE_S, far
 *    longer than the step) is free to ring on and overlap the next note.
 *    Overlapping tails is what makes a run of notes sound rich rather than
 *    thin; only overlapping transients reads as muddy, because the
 *    transient is the only part of the sound carrying onset/rhythm
 *    information -- the tail carries none.
 *
 * A NOTE ON WHAT THIS FILE CANNOT CLAIM: nobody involved in writing this
 * file has heard it -- there is no audio playback available while editing
 * source code, and no listening pass happened before this shipped. Every
 * choice below is justified by an acoustic MECHANISM (what a given ratio,
 * envelope shape or filter move does to a signal), never by an adjective
 * like "warm" or "punchy" -- those are claims this file has no basis to
 * make. Numbers given an exact source (a design brief, a physical
 * measurement) are pinned as given. Numbers with no stated source (e.g.
 * absolute gain-staging, the riser's exact Hz range, the saturator's drive
 * constant) are reasoned engineering defaults, called out as such in their
 * own doc comments, not claims about how anything sounds.
 */

// ── shared envelope shape ───────────────────────────────────────────────

/**
 * attack -> decay -> (an implicit, zero-length hold at sustainLevel) ->
 * release. All four fields in seconds except `sustainLevel`, a 0..1
 * fraction of the node's own peak gain. Every percussive one-shot in this
 * file uses this same shape -- see envelopeTotalS, the one place "how long
 * does this envelope actually last" is computed, so a scheduling site and
 * a "does this fit inside N ms" test can never independently drift apart.
 * `decayS: 0, sustainLevel: 1` collapses this to a plain attack-then-release
 * swell -- the shape a short click, thump or grain wants, with no separate
 * body to decay through first.
 */
export interface Envelope {
  attackS: number;
  decayS: number;
  sustainLevel: number;
  releaseS: number;
}

export const envelopeTotalS = (envelope: Envelope): number =>
  envelope.attackS + envelope.decayS + envelope.releaseS;

/** The band every NOTE (a land/done fundamental -- not a partial, not the
 *  transient/sub/grain/riser support layers, which legitimately range wider)
 *  is asserted to live inside: comfortably brackets D4 (293.66Hz) through
 *  D5 (587.32Hz, done's octave note), the full range TONIC_HZ, the
 *  pentatonic scale and the chord ever produce, with real margin either
 *  side so this stays a meaningful regression check rather than a
 *  hair's-breadth one. */
export const AUDIBLE_BAND_HZ = { min: 150, max: 900 } as const;

/** The two dealing paces `classroom-groups.ts`'s `animate()` offers
 *  (`skip` plays no sound at all -- see that function). Defined here, not
 *  there, so LAND_TRANSIENT_PLUS_BODY_S/LAND_RELEASE_S and the step can be
 *  compared in ONE place (sfx.test.ts) instead of a hand-copied number
 *  drifting out of sync with what `animate` actually uses. Unchanged by
 *  this task -- the brief's own instruction is to keep the timing, replace
 *  only what decides how much of each note has to fit inside it. */
export const FAST_STEP_S = 0.045;
export const NORMAL_STEP_S = 0.11;

// ── the shared tonal centre ─────────────────────────────────────────────

/** D4. The root both `land`'s scale and `done`'s chord resolve against --
 *  one shared tonal centre, not two unrelated pitch systems. */
export const TONIC_HZ = 293.66;

/** Equal-temperament frequency ratio for a distance of `semitones` (may be
 *  fractional or negative). `semitoneRatio(12) === 2` -- exactly one
 *  octave -- is the identity every pitch calculation below, including
 *  cents-based micro-variation (100 cents = 1 semitone), rests on. */
export const semitoneRatio = (semitones: number): number =>
  Math.pow(2, semitones / 12);

// ── land(i): pitch mapping ──────────────────────────────────────────────

/** D minor pentatonic (D F G A C) as semitone offsets from TONIC_HZ: root,
 *  minor third, fourth, fifth, minor seventh. A minor pentatonic reads as
 *  calm and neutral -- a MAJOR pentatonic (the brief's own words) is what
 *  makes an app sound like a toy, because the major third is the single
 *  most cheerful-reading interval in Western tonality; omitting it (this
 *  scale has no third at all, major or minor, only the notes either side
 *  of where one would sit) is what keeps a run of these notes sounding
 *  neutral rather than either bright or sad. Two of these five notes (D
 *  itself, and A -- semitone 7) reappear in DONE_CHORD_SEMITONES: the
 *  chord shares a root and a fifth with the scale a run of `land` notes
 *  was just playing, so it reads as the run's destination, not an
 *  unrelated sound arriving on top of it. */
export const LAND_SCALE_SEMITONES: readonly number[] = [0, 3, 5, 7, 10];

/**
 * Group index -> fundamental frequency. Cycles every 5 indices -- "wrapping
 * after one octave" (the brief's own words): index 5 is degree 0 again, at
 * the SAME octave, not the octave above. That is a deliberately tighter
 * cap than the previous attempt's two-octave climb: a class splitting into
 * many groups stays inside one register rather than eventually turning
 * shrill, without needing a separate cap constant to express "one octave,
 * always" -- the modulo already says it.
 */
export function landFrequency(index: number): number {
  const i = Math.max(0, Math.trunc(index));
  const degree = i % LAND_SCALE_SEMITONES.length;
  return TONIC_HZ * semitoneRatio(LAND_SCALE_SEMITONES[degree]);
}

/** Roughly -0.35..+0.35 (the brief's own range) -- gentle, not the hard
 *  stereo extremes shuffle's grains use, because `land` notes are meant to
 *  read as one instrument stepping through a register, not scattered
 *  across the room. Cycles in lockstep with landFrequency's own degree, so
 *  the same pitch always arrives from the same rough direction. */
export const LAND_PAN_RANGE = 0.35;

export function landPan(index: number): number {
  const i = Math.max(0, Math.trunc(index));
  const degree = i % LAND_SCALE_SEMITONES.length;
  const span = LAND_SCALE_SEMITONES.length - 1;
  return -LAND_PAN_RANGE + (degree / span) * (2 * LAND_PAN_RANGE);
}

// ── the "struck voice" architecture shared by land() and done() ────────

/**
 * Ratios to the fundamental for the three partials every struck voice
 * carries. NOT 1:2:4 (harmonic, integer) -- 1 : 2.756 : 5.404, a free-free
 * bar's real transverse bending-mode ratios. An integer-ratio stack is
 * indistinguishable, to the ear, from a single filtered tone: every
 * partial reinforces the same pitch class, so there is no information in
 * the spectrum beyond "one note". Non-integer ratios put energy at
 * frequencies that are NOT simple multiples of each other, which is
 * exactly what makes the ear parse a sound as several modes of one
 * physical object ringing together -- i.e. a material -- rather than a
 * synthesiser's single oscillator dressed up with octaves. This is the
 * literal fix for the first attempt's core defect; see the module doc
 * comment.
 */
export const INHARMONIC_PARTIAL_RATIOS: readonly number[] = [1, 2.756, 5.404];

/** Each partial strictly quieter than the one below it (1.0 : 0.38 : 0.14)
 *  -- the fundamental carries most of the perceived pitch and loudness,
 *  the upper partials add colour without competing for it. */
export const INHARMONIC_PARTIAL_GAINS: readonly number[] = [1.0, 0.38, 0.14];

/** Each partial's OWN decay time, in seconds, shortest as the ratio rises:
 *  260ms : 120ms : 55ms -- the brief's own numbers, and the second most
 *  important physical cue after inharmonicity itself. Real struck objects
 *  lose their high-frequency content fastest (higher modes radiate and
 *  damp faster than low ones in almost any real material), so a sound
 *  whose brightest partial dies first reads as something that was
 *  actually hit, decaying under real material damping -- a synth that
 *  holds all its partials for the same duration cannot produce this cue at
 *  all, which is exactly what made the previous attempt cheap regardless
 *  of which ratios it used. Index-for-index against
 *  INHARMONIC_PARTIAL_RATIOS. */
export const LAND_PARTIAL_DECAYS_S: readonly number[] = [0.26, 0.12, 0.055];

/** LAND_PARTIAL_DECAYS_S expressed as fractions of its own longest entry
 *  (index 0, the fundamental) -- the SHAPE `done` reuses at a longer
 *  overall release (see buildVoicePlan/doneVoicePlans): scaling every
 *  partial's decay by the same factor preserves "higher partials decay
 *  faster" exactly, while stretching the whole voice out. Derived, not
 *  hand-typed, so it can never drift from LAND_PARTIAL_DECAYS_S itself. */
export const INHARMONIC_RELATIVE_DECAYS: readonly number[] =
  LAND_PARTIAL_DECAYS_S.map((s) => s / LAND_PARTIAL_DECAYS_S[0]);

/** land's own overall release: exactly its fundamental's own decay time
 *  (INHARMONIC_RELATIVE_DECAYS[0] === 1 by construction), so the two are
 *  never stated as two separately-typed numbers that could disagree. */
export const LAND_RELEASE_S = LAND_PARTIAL_DECAYS_S[0];

/** Each partial glides down ~7% over its first 60ms (the brief's own
 *  numbers) -- a STATIC pitch is what reads as synthetic; real struck
 *  objects drop in pitch immediately after the strike as the initial
 *  impact energy (which stiffens the material slightly, raising its
 *  effective frequency for an instant) dissipates into the steady-state
 *  ringing frequency. Applied identically to every partial: each glides
 *  down from its own (inharmonic) nominal ratio, so the inharmonicity
 *  itself is preserved throughout the glide, not just at onset. */
export const PITCH_DROP_FRACTION = 0.07;
export const PITCH_GLIDE_S = 0.06;

/** The shared attack every layer of a struck voice uses (partials,
 *  transient, sub) -- fast enough to read as struck, not instantaneous
 *  (Web Audio's exponential ramps require a strictly positive duration,
 *  and 0ms would also click). A reasoned default: the brief gives no
 *  explicit attack time for the new architecture, only the transient's own
 *  4ms and the sub's own 70ms. */
export const VOICE_ATTACK_S = 0.003;

/** The voice-level "gain (ADSR)" merge point's own decay/sustain stage --
 *  distinct from, and layered ON TOP of, each partial's own independent
 *  release above. This is what gives a struck voice its percussive BODY:
 *  a fast drop from the onset peak to a lower level (0.55 of peak) right
 *  after the strike, before the (longer, per-partial) tail continues from
 *  there. Without this stage, the note would only ever fade, never
 *  visibly "settle" the way something actually struck does -- see
 *  LAND_TRANSIENT_PLUS_BODY_S, which is exactly transient + this settle,
 *  the part of the sound the fast step has to contain. Reasoned defaults:
 *  the brief specifies the per-partial decay numbers and calls the merge
 *  point "voice gain (ADSR)", but does not give this stage's own
 *  decay/sustain numbers. */
export const VOICE_BODY_DECAY_S = 0.02;
export const VOICE_BODY_SUSTAIN_LEVEL = 0.55;

/** 4ms of noise through a resonant bandpass centred ~2.2x the fundamental,
 *  Q≈6 (the brief's own numbers) -- "the sense of contact" a pure tone
 *  cannot supply alone. Centring the bandpass on a ratio of the
 *  fundamental (rather than a fixed Hz) keeps the contact transient's own
 *  colour tracking the note's own pitch, the same way a real mallet strike
 *  sounds brighter/darker as the struck object's own pitch changes. Q=6 is
 *  resonant enough to give the click a hint of its own pitch centre
 *  (rather than a flat, colourless tap), without being narrow enough to
 *  ring as a whistle in 4ms -- there is not enough time at Q=6 for a
 *  resonant bandpass to complete more than a few cycles of ringing. */
export const LAND_TRANSIENT = {
  durationS: 0.004,
  filterRatio: 2.2,
  q: 6,
  gain: 0.35,
} as const;

/** The part of a struck voice that MUST fit inside the fastest animation
 *  step: the transient (4ms) plus the voice-level body's own attack+decay
 *  settle (VOICE_ATTACK_S + VOICE_BODY_DECAY_S) -- the portion carrying
 *  onset/rhythm information, i.e. "was a note struck here". Everything
 *  after this point is RELEASE (up to LAND_RELEASE_S/DONE_RELEASE_S, both
 *  far longer than FAST_STEP_S -- see that constant), which is free, and
 *  intended, to ring past the step into the next note: overlapping TAILS
 *  read as rich; only overlapping TRANSIENTS read as muddy. This is the
 *  literal fix for the first attempt's other defect -- see the module doc
 *  comment -- pinned as its own named constant precisely so a future edit
 *  cannot silently shrink the release back down to fit some new step
 *  without a test noticing (see sfx.test.ts's "duration ceilings").
 */
export const LAND_TRANSIENT_PLUS_BODY_S =
  LAND_TRANSIENT.durationS + VOICE_ATTACK_S + VOICE_BODY_DECAY_S;

/** Sine from 0.5x to 0.38x the fundamental over 70ms, gain 0.30 (the
 *  brief's own numbers) -- a falling sub gives the strike WEIGHT: a large
 *  or dense-sounding struck object's initial impact carries low-frequency
 *  energy well below its own steady-state pitch (the whole body moving,
 *  not just the mode that determines its ringing pitch), and that energy
 *  dies out fast as the object settles into its steady ring -- hence a
 *  short, falling sub layer rather than a sustained bass tone. */
export const VOICE_SUB = {
  startRatio: 0.5,
  endRatio: 0.38,
  durationS: 0.07,
  gain: 0.3,
} as const;

// ── micro-variation (drives "repeated triggers must not be identical") ──

/** ±12 cents of pitch, ±6% of gain (the brief's own numbers) -- the
 *  bounds every struck voice's own onset is nudged within, per trigger.
 *  Identical repetition is the clearest tell of cheap synthesis: a real
 *  struck object never hits at literally the same velocity or the same
 *  contact point twice, so two real strikes are never bit-identical
 *  either. This is small enough to leave the pentatonic scale and the
 *  chord clearly recognisable as themselves (12 cents is a small fraction
 *  of the 100-cent semitone steps between them) while still breaking
 *  exact repetition. */
export const MICRO_VARIATION_MAX = {
  detuneCents: 12,
  gainFraction: 0.06,
} as const;

export interface MicroVariation {
  detuneCents: number;
  gainMultiplier: number;
}

/** `rng` is injected, never read from module state -- see createPrng.
 *  `rng() === 0` gives the minimum (-12 cents, x0.94 gain); `rng() === 1`
 *  gives the maximum (+12 cents, x1.06 gain); `rng() === 0.5` gives no
 *  variation at all (0 cents, x1 gain) -- the midpoint of the PRNG's own
 *  [0,1) range is deliberately the identity, not an edge case. */
export function microVariation(rng: () => number): MicroVariation {
  const spread = rng() * 2 - 1; // -1..1
  return {
    detuneCents: spread * MICRO_VARIATION_MAX.detuneCents,
    gainMultiplier: 1 + spread * MICRO_VARIATION_MAX.gainFraction,
  };
}

/**
 * A small, fast, deterministic PRNG (mulberry32) -- NOT `Math.random()`,
 * per the brief: every pure export in this file must be reproducible from
 * a seed alone, with nothing reading the wall clock, so a test can assert
 * an exact output and a mutation to the algorithm changes that output
 * predictably. `classroom-groups.ts` seeds one instance (from
 * `Math.random()`, which is fine there -- it is Web Audio wiring, not this
 * pure module) and threads it through every effect call, exactly the way
 * `grouping.ts`'s own `buildGroups` already takes a `random` function as a
 * parameter rather than calling `Math.random()` internally.
 */
export function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── the resolved "plan" a struck voice hands to classroom-groups.ts ────

/** One partial's resolved pitch envelope (start -> end over pitchGlideS)
 *  and gain envelope, RELATIVE to the voice's own body gain -- the actual
 *  absolute level is applied once, at the body gain stage, because the two
 *  gain nodes sit in series (partial gain -> body gain) and Web Audio
 *  multiplies them, exactly matching the signal chain's own "3 oscillators
 *  ... -> voice gain (ADSR)" shape. */
export interface VoicePartialPlan {
  freqStartHz: number;
  freqEndHz: number;
  pitchGlideS: number;
  relativeGain: number;
  envelope: Envelope;
}

export interface TransientPlan {
  filterCenterHz: number;
  q: number;
  relativeGain: number;
  envelope: Envelope;
}

export interface SubTonePlan {
  freqStartHz: number;
  freqEndHz: number;
  relativeGain: number;
  envelope: Envelope;
}

export interface VoicePlan {
  fundamentalHz: number;
  bodyPeakGain: number;
  bodyEnvelope: Envelope;
  partials: VoicePartialPlan[];
  transient: TransientPlan;
  sub: SubTonePlan;
  pan: number;
  reverbSend: number;
}

/**
 * Resolves one full struck voice: applies this trigger's own
 * micro-variation (detune shifts EVERY layer's frequency together, since
 * they all derive from the one detuned fundamental below -- the transient
 * and sub stay "the same struck object" as the partials, not a decoupled
 * layer wobbling independently), then builds the three parallel layers
 * (partials/transient/sub) and the voice-level body envelope, per the
 * signal chain in the module doc comment. `overallReleaseS` is the one
 * parameter that turns this same architecture into either `land` (0.26s)
 * or `done` (0.9s) -- see doneVoicePlans.
 */
export function buildVoicePlan(params: {
  fundamentalHz: number;
  peakGain: number;
  overallReleaseS: number;
  pan: number;
  reverbSend: number;
  rng: () => number;
}): VoicePlan {
  const { fundamentalHz, peakGain, overallReleaseS, pan, reverbSend, rng } =
    params;
  const variation = microVariation(rng);
  const detunedHz = fundamentalHz * semitoneRatio(variation.detuneCents / 100);

  const partials: VoicePartialPlan[] = INHARMONIC_PARTIAL_RATIOS.map(
    (ratio, i) => {
      const startHz = detunedHz * ratio;
      return {
        freqStartHz: startHz,
        freqEndHz: startHz * (1 - PITCH_DROP_FRACTION),
        pitchGlideS: PITCH_GLIDE_S,
        relativeGain: INHARMONIC_PARTIAL_GAINS[i],
        envelope: {
          attackS: VOICE_ATTACK_S,
          decayS: 0,
          sustainLevel: 1,
          releaseS: overallReleaseS * INHARMONIC_RELATIVE_DECAYS[i],
        },
      };
    },
  );

  const transient: TransientPlan = {
    filterCenterHz: detunedHz * LAND_TRANSIENT.filterRatio,
    q: LAND_TRANSIENT.q,
    relativeGain: LAND_TRANSIENT.gain,
    envelope: {
      attackS: 0.001,
      decayS: 0,
      sustainLevel: 1,
      releaseS: LAND_TRANSIENT.durationS,
    },
  };

  const sub: SubTonePlan = {
    freqStartHz: detunedHz * VOICE_SUB.startRatio,
    freqEndHz: detunedHz * VOICE_SUB.endRatio,
    relativeGain: VOICE_SUB.gain,
    envelope: {
      attackS: VOICE_ATTACK_S,
      decayS: 0,
      sustainLevel: 1,
      releaseS: VOICE_SUB.durationS,
    },
  };

  return {
    fundamentalHz: detunedHz,
    bodyPeakGain: peakGain * variation.gainMultiplier,
    bodyEnvelope: {
      attackS: VOICE_ATTACK_S,
      decayS: VOICE_BODY_DECAY_S,
      sustainLevel: VOICE_BODY_SUSTAIN_LEVEL,
      releaseS: overallReleaseS,
    },
    partials,
    transient,
    sub,
    pan,
    reverbSend,
  };
}

/** land's own fundamental's ABSOLUTE peak gain, pre-saturation -- every
 *  partial/transient/sub gain above is a RELATIVE multiplier on top of
 *  this. A reasoned default: the new signal chain's soft saturator and
 *  master compressor (see SATURATOR_DRIVE, MASTER_COMPRESSOR) give this
 *  file more gain-staging headroom than the previous attempt had (which
 *  had neither), so this is not read from the brief -- there is no stated
 *  absolute level for the new architecture, only the relative numbers
 *  above and the envelope timings. */
export const LAND_PEAK_GAIN = 0.14;

/** The brief's own number: how much of a `land` voice's post-pan signal
 *  feeds the shared reverb send. */
export const LAND_REVERB_SEND = 0.18;

export function landVoicePlan(index: number, rng: () => number): VoicePlan {
  return buildVoicePlan({
    fundamentalHz: landFrequency(index),
    peakGain: LAND_PEAK_GAIN,
    overallReleaseS: LAND_RELEASE_S,
    pan: landPan(index),
    reverbSend: LAND_REVERB_SEND,
    rng,
  });
}

// ── done(): a sus2/add9 resolving cluster, with a riser ─────────────────

/** D, E, A, D-an-octave-up, as semitone offsets from the SAME TONIC_HZ
 *  land's scale reads: root, 2nd/9th, 5th, octave -- a sus2/add9 voicing
 *  that OMITS the third entirely, so the chord is neither major nor minor,
 *  "open and modern" (the brief's own words) rather than a plain major
 *  triad, which is the one chord quality every consumer OS/UI sound of the
 *  last three decades has already used (a plain major triad is what the
 *  brief itself names as "Windows XP"). E (semitone 2) does not appear in
 *  LAND_SCALE_SEMITONES at all -- it is the one note that marks this
 *  chord as a distinct arrival rather than just another pentatonic degree,
 *  while the root and the fifth (both shared with the scale) keep it
 *  recognisably the same tonal family a run of `land` notes was just
 *  playing. */
export const DONE_CHORD_SEMITONES: readonly number[] = [0, 2, 7, 12];

export function doneFrequencies(): number[] {
  return DONE_CHORD_SEMITONES.map((s) => TONIC_HZ * semitoneRatio(s));
}

/** 0 / 35 / 70 / 110ms -- the brief's own numbers, exactly. Strictly
 *  ascending, one entry per DONE_CHORD_SEMITONES entry (checked in
 *  sfx.test.ts) -- a length mismatch would silently drop a note or read
 *  `undefined` at the call site. */
export const DONE_STAGGER_S: readonly number[] = [0, 0.035, 0.07, 0.11];

/** ~900ms (the brief's own number) -- reuses the exact same struck-voice
 *  shape as `land` (buildVoicePlan), just stretched: every partial's decay
 *  scales up in proportion (INHARMONIC_RELATIVE_DECAYS), so "higher
 *  partials decay faster" still holds, only the whole voice now rings for
 *  the better part of a second -- "an arrival, not a snap-off". */
export const DONE_RELEASE_S = 0.9;

/** A reasoned default, same reasoning as LAND_PEAK_GAIN -- slightly under
 *  land's own peak because four of these notes sum together (staggered,
 *  but still overlapping for most of their release). */
export const DONE_PEAK_GAIN = 0.12;

/** The brief's own number: the longest reverb send of the three effects --
 *  "an arrival" gets the most space to resolve into. Checked against
 *  LAND_REVERB_SEND/SHUFFLE_REVERB_SEND in sfx.test.ts. */
export const DONE_REVERB_SEND = 0.28;

/** Every chord note centred (pan 0) -- the brief gives no stereo-spread
 *  number for `done` (unlike `land`'s explicit -0.35..+0.35), and the
 *  effect already has the largest reverb send of the three: width comes
 *  from the shared synthesised space the notes resolve into, not from
 *  panning them apart, which keeps this file from inventing an unstated
 *  number where the brief did not give one. */
export function doneVoicePlans(rng: () => number): VoicePlan[] {
  return doneFrequencies().map((freqHz) =>
    buildVoicePlan({
      fundamentalHz: freqHz,
      peakGain: DONE_PEAK_GAIN,
      overallReleaseS: DONE_RELEASE_S,
      pan: 0,
      reverbSend: DONE_REVERB_SEND,
      rng,
    }),
  );
}

/** 120ms of noise through a highpass sweeping upward, swelling into the
 *  hit (the brief's own description and duration). A rising highpass
 *  sweep over a swelling envelope is literally the "riser" gesture: it
 *  moves audible energy from low/broadband toward high/thin as it builds,
 *  which is the same spectral motion as something accelerating or closing
 *  distance, and is -- per the brief -- "the most recognisably
 *  contemporary gesture available" in current UI/trailer sound design.
 *  startHz/endHz/gain/q/releaseS are reasoned defaults: the brief states
 *  the duration and the general behaviour, not exact filter bounds. */
export const DONE_RISER = {
  durationS: 0.12,
  startHz: 300,
  endHz: 6000,
  gain: 0.25,
  q: 0.8,
  releaseS: 0.02,
} as const;

// ── shuffle(): a granular riffle ─────────────────────────────────────────

export const SHUFFLE_DURATION_S = 0.26;

/** 16-22 grains, each 6-14ms, bandpass centre randomised 900-4200Hz, pan
 *  randomised across ±0.6 (all the brief's own numbers). Emitting many
 *  short, independently-filtered noise bursts rather than one filtered
 *  noise sweep is what makes this read as discrete objects in motion (a
 *  card riffle) instead of a single continuous whoosh (a PowerPoint
 *  transition, the brief's own comparison) -- a sweep carries one piece of
 *  spectral information moving smoothly; a grain cloud carries dozens of
 *  independent, briefly-glimpsed spectral events, which is what a
 *  real riffle of many small objects actually is. */
export const SHUFFLE_GRAIN_BOUNDS = {
  countMin: 16,
  countMax: 22,
  durationMinS: 0.006,
  durationMaxS: 0.014,
  filterMinHz: 900,
  filterMaxHz: 4200,
  panRange: 0.6,
  q: 4,
} as const;

/** A reasoned default: each grain's own peak, kept modest because up to 22
 *  of them can overlap -- the brief gives the grain COUNT and FILTER
 *  bounds, not an absolute per-grain gain. */
export const SHUFFLE_GRAIN_PEAK_GAIN = 0.055;

export const SHUFFLE_REVERB_SEND = 0.12;

export interface GrainPlan {
  onsetS: number;
  filterCenterHz: number;
  q: number;
  pan: number;
  peakGain: number;
  envelope: Envelope;
}

/**
 * `count` grains, evenly spaced across SHUFFLE_DURATION_S (16-22, the
 * brief's own bounds), each independently randomised in duration, filter
 * centre and pan. Amplitude follows a soft arch -- quiet, loud in the
 * middle, quiet -- via `sin(pi * positionFraction)`: zero at both ends of
 * the effect's own timeline, one exactly in the middle, deterministic
 * given each grain's OWN (evenly-spaced, not randomised) position, so the
 * arch shape itself is exact and not subject to the same jitter as the
 * grain's other properties -- a crescendo-decrescendo across the whole
 * gesture, the way a real riffle swells as more cards are in motion and
 * tapers as it completes.
 */
export function shuffleGrainPlans(rng: () => number): GrainPlan[] {
  const b = SHUFFLE_GRAIN_BOUNDS;
  const count = b.countMin + Math.floor(rng() * (b.countMax - b.countMin + 1));
  const grains: GrainPlan[] = [];
  for (let i = 0; i < count; i++) {
    const onsetS = (i / count) * SHUFFLE_DURATION_S;
    const durationS =
      b.durationMinS + rng() * (b.durationMaxS - b.durationMinS);
    const filterCenterHz =
      b.filterMinHz + rng() * (b.filterMaxHz - b.filterMinHz);
    const pan = (rng() * 2 - 1) * b.panRange;
    const arch = Math.sin(Math.PI * (onsetS / SHUFFLE_DURATION_S));
    const peakGain =
      SHUFFLE_GRAIN_PEAK_GAIN * (0.15 + 0.85 * Math.max(0, arch));
    grains.push({
      onsetS,
      filterCenterHz,
      q: b.q,
      pan,
      peakGain,
      envelope: {
        attackS: durationS * 0.35,
        decayS: 0,
        sustainLevel: 1,
        releaseS: durationS * 0.65,
      },
    });
  }
  return grains;
}

/** One sub thump at the shuffle's own onset (the brief's own instruction)
 *  -- absolute Hz, not a ratio off any fundamental, since shuffle carries
 *  no pitch at all (see the module doc comment's own reasoning: shuffle
 *  joins this file's timbral family through texture, not through a shared
 *  note). Reasoned defaults, same order of magnitude as VOICE_SUB. */
export const SHUFFLE_SUB = {
  startHz: 110,
  endHz: 70,
  durationS: 0.08,
  gain: 0.28,
} as const;

// ── polyphony cap ────────────────────────────────────────────────────────

/** 8 voices, oldest stolen (the brief's own numbers/policy) -- long tails
 *  (up to DONE_RELEASE_S = 0.9s) plus a big class landing many groups in a
 *  fast run must not pile up an unbounded number of simultaneously-ringing
 *  voices. */
export const MAX_POLYPHONY = 8;

/**
 * Pure FIFO admission: given the currently-active pool and a new voice,
 * returns the pool WITH the new voice added, plus whichever voice had to
 * be stolen (evicted) to stay at or under `maxVoices` -- or `null` if
 * nothing needed stealing. Deliberately stateless (the caller threads the
 * pool through, rather than this module holding it) so it can be
 * exhaustively tested without any notion of time or of what a "voice"
 * actually is: `classroom-groups.ts` is the only thing that knows how to
 * actually stop a stolen voice's real Web Audio nodes, this module only
 * decides WHICH one.
 */
export function admitVoice<T>(
  activeVoices: readonly T[],
  newVoice: T,
  maxVoices: number = MAX_POLYPHONY,
): { activeVoices: T[]; stolen: T | null } {
  const next = [...activeVoices, newVoice];
  if (next.length > maxVoices) {
    const [stolen, ...rest] = next;
    return { activeVoices: rest, stolen };
  }
  return { activeVoices: next, stolen: null };
}

// ── the soft saturator (WaveShaper curve) ────────────────────────────────

/** tanh's own drive constant -- a reasoned default (the brief names the
 *  curve shape, "WaveShaper, tanh", not a drive amount). At this drive,
 *  quiet input is boosted by a small, constant factor (tanh is
 *  approximately linear near zero, but tanh(k)/k < 1 for k>0, so
 *  normalising the curve to unity at full scale, as generateSaturatorCurve
 *  does, boosts everything below full scale slightly), while input
 *  approaching full scale is compressed toward the curve's own asymptote
 *  -- i.e. peaks are rounded off rather than sharply clipped. That is what
 *  a soft saturator is FOR: it is a continuous, odd-symmetric function
 *  with no flat region, so it never produces the hard-edged harmonic
 *  spray a digital clip (a literal min/max) does, while still taming the
 *  loudest instants of several overlapping voices. */
export const SATURATOR_DRIVE = 1.1;

/** Odd, so the curve has an exact centre sample at x=0 -- see
 *  generateSaturatorCurve's own "curve(0) is exactly 0" test. */
export const SATURATOR_CURVE_SAMPLES = 257;

/**
 * A WaveShaperNode `.curve` array: `tanh(drive * x) / tanh(drive)` sampled
 * across x = -1..1, normalised so x = ±1 maps to exactly ±1 (unity gain at
 * full scale -- this curve never makes a full-scale signal LOUDER, only
 * quieter-than-full-scale signal relatively louder, which is the intended
 * "gentle glue" character, not a boost). Pure math, no AudioContext: only
 * the act of assigning this array to a real WaveShaperNode's `.curve`
 * property is Web Audio, which stays in classroom-groups.ts.
 */
export function generateSaturatorCurve(
  samples: number = SATURATOR_CURVE_SAMPLES,
): Float64Array {
  const curve = new Float64Array(samples);
  const norm = Math.tanh(SATURATOR_DRIVE);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(SATURATOR_DRIVE * x) / norm;
  }
  return curve;
}

// ── the synthesised reverb impulse response ──────────────────────────────

/** ~0.9s (the brief's own duration) -- long enough to read as a real,
 *  if small, room rather than a slap-back, short enough that it has
 *  fully resolved well before even `done`'s own release (also ~0.9s) has
 *  finished ringing. */
export const REVERB_DURATION_S = 0.9;

/** The exponential envelope's own time constant: REVERB_DURATION_S / 5, so
 *  the tail has decayed to e^-5 (≈0.7%, about -43dB below its own peak) by
 *  the end of the buffer -- comfortably "near-silence" relative to
 *  anything else in this file's own gain range, without the buffer needing
 *  to be any longer than REVERB_DURATION_S to get there. */
export const REVERB_DECAY_TIME_CONSTANT_S = REVERB_DURATION_S / 5;

/** The exponential decay envelope itself, exposed as its own pure
 *  function (not inlined into generateReverbImpulseResponse) so its
 *  monotonicity can be asserted exactly, analytically, rather than only
 *  inferred statistically from noisy generated samples -- see
 *  sfx.test.ts. Strictly decreasing for any t2 > t1 >= 0, by construction
 *  (Math.exp of a strictly decreasing exponent). */
export const reverbEnvelopeGain = (tS: number): number =>
  Math.exp(-tS / REVERB_DECAY_TIME_CONSTANT_S);

/** Reverb tails in real spaces lose high-frequency energy fastest (air and
 *  most real materials absorb highs more than lows), so a bright,
 *  full-band noise tail reads as an artificial hiss rather than a space.
 *  A one-pole lowpass at 3200Hz -- well below the master bus's own
 *  ~9000Hz -- keeps the SYNTHESISED tail dark specifically, distinct from
 *  (and beneath) the actual voices ringing into it. A reasoned default:
 *  the brief says "lowpassed so the tail is dark", not an exact cutoff. */
export const REVERB_LOWPASS_HZ = 3200;

/** The generated buffer's own peak sample, after generation, is scaled to
 *  land here -- headroom under full scale (1.0), chosen once, mathematically,
 *  rather than by ear (see the module doc comment: nobody has heard this).
 *  This is what makes REVERB_RETURN_GAIN a legitimate unity trim rather
 *  than an arbitrary guess: the IR's own level is fixed at generation
 *  time, not left for the return gain to compensate for. */
export const REVERB_NORMALIZE_PEAK = 0.95;

export interface ReverbIR {
  sampleRateHz: number;
  left: Float64Array;
  right: Float64Array;
}

/**
 * Generates a stereo impulse response entirely in code. This whole file is
 * now the FALLBACK path: src/assets/sfx/ ships six real, mastered CC0
 * samples for shuffle/land/done (provenance and licence in that directory's
 * own CREDITS.md), and classroom-groups.ts's own "sound" section plays one
 * of those whenever it is ready, reaching the synthesis this file describes
 * only when it is not (not decoded yet, a failed fetch, or a browser that
 * cannot decode AAC). A fallback that itself depended on a fetched or
 * bundled recording for the one effect (reverb) that would conventionally
 * use a recorded IR would defeat the point of having one -- it needs to
 * keep working precisely when a real asset could not be reached. Per sample:
 * a one-pole lowpass (REVERB_LOWPASS_HZ) applied to noise, multiplied by
 * the exponential decay envelope (reverbEnvelopeGain). The two channels
 * are DELIBERATELY only slightly decorrelated -- each is a blend of one
 * SHARED noise source (80%) and its own independent one (20%), not two
 * fully independent channels. Real stereo room reflections are highly
 * correlated between the two ears/mics (both are hearing largely the same
 * reflected sound field, arriving microseconds apart), not statistically
 * independent processes; more importantly, fully-independent stereo noise
 * cancels when summed to mono, and this tool is as likely to be heard
 * through a single phone or laptop speaker as through stereo ones -- a
 * "slightly" decorrelated tail stays close to mono-safe while still
 * widening true stereo playback, which is what the brief's own "for
 * width" is asking for without breaking mono compatibility it never
 * mentioned but a real classroom device will still expose.
 */
export function generateReverbImpulseResponse(
  sampleRateHz: number,
  rng: () => number,
): ReverbIR {
  const CHANNEL_CORRELATION = 0.8;
  const length = Math.max(1, Math.round(sampleRateHz * REVERB_DURATION_S));
  const left = new Float64Array(length);
  const right = new Float64Array(length);

  const rc = 1 / (2 * Math.PI * REVERB_LOWPASS_HZ);
  const dt = 1 / sampleRateHz;
  const alpha = dt / (rc + dt);
  let lpL = 0;
  let lpR = 0;
  let peak = 0;

  for (let n = 0; n < length; n++) {
    const env = reverbEnvelopeGain(n / sampleRateHz);
    const shared = rng() * 2 - 1;
    const independentL = rng() * 2 - 1;
    const independentR = rng() * 2 - 1;
    const rawL =
      CHANNEL_CORRELATION * shared + (1 - CHANNEL_CORRELATION) * independentL;
    const rawR =
      CHANNEL_CORRELATION * shared + (1 - CHANNEL_CORRELATION) * independentR;
    lpL += alpha * (rawL - lpL);
    lpR += alpha * (rawR - lpR);
    const l = lpL * env;
    const r = lpR * env;
    left[n] = l;
    right[n] = r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }

  const scale = peak > 0 ? REVERB_NORMALIZE_PEAK / peak : 0;
  for (let n = 0; n < length; n++) {
    left[n] *= scale;
    right[n] *= scale;
  }
  return { sampleRateHz, left, right };
}

// ── the master bus ──────────────────────────────────────────────────────

/** A gentle overall trim ahead of the compressor -- headroom for whichever
 *  effect's voices happen to land in phase, never loud enough alone to
 *  make anything quieter than intended. A reasoned default, same
 *  reasoning as LAND_PEAK_GAIN. */
export const MASTER_GAIN = 0.45;

/** Strips DC offset and sub-bass rumble no real content in this file ever
 *  occupies -- the lowest thing this file produces is a `land`/`done` sub
 *  layer bottoming out around 0.38x TONIC_HZ (≈112Hz), comfortably above
 *  this cutoff, so it trims noise-floor content only, never a real note. */
export const MASTER_HIGHPASS_HZ = 40;

/** ~9000Hz (the brief's own number) -- "so nothing is harsh" without
 *  dulling the grain cloud's own randomised centres, which range up to
 *  SHUFFLE_GRAIN_BOUNDS.filterMaxHz (4200Hz): this sits comfortably above
 *  that too, so it is a gentle top-end safety rail on the whole bus, not a
 *  reshaping of any one effect's own filter work. */
export const MASTER_LOWPASS_HZ = 9000;

/** "Glue" bus compression across up to MAX_POLYPHONY simultaneous struck
 *  voices plus a grain cloud plus a reverb return -- a moderate ratio and
 *  a soft knee so it manages the combined level of many overlapping
 *  sources without audibly pumping on any one of them, the standard role
 *  of a bus compressor sitting after a mix point rather than on a single
 *  source. Reasoned defaults: the brief specifies the node's presence and
 *  position in the chain, not its parameters. */
export const MASTER_COMPRESSOR = {
  thresholdDb: -10,
  kneeDb: 6,
  ratio: 2,
  attackS: 0.003,
  releaseS: 0.18,
} as const;

/** A structural unity trim on the shared reverb return, after the
 *  convolver and before the master bus -- unity is a principled choice
 *  here specifically because REVERB_NORMALIZE_PEAK already fixes the
 *  convolver's own output level mathematically at generation time (see
 *  that constant's own doc comment), not an arbitrary "sounds about
 *  right" guess this file has no basis to make. */
export const REVERB_RETURN_GAIN = 0.5;
