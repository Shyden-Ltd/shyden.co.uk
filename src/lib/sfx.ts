/**
 * Sound design for the Classroom Group Creator's three effects -- shuffle,
 * land(i), done -- as pure data and pure functions. No `AudioContext`
 * reference anywhere in this file, and nothing here touches `window` or
 * `document`: every export is a number, a readonly array of numbers, or a
 * function of numbers, so Vitest exercises the real synthesiser logic, not
 * a fake standing in for Web Audio (see CLAUDE.md: "logic is pure ... page
 * scripts only wire the DOM"). `src/scripts/classroom-groups.ts` is the
 * only thing that ever turns these numbers into an audio graph.
 *
 * The three effects share one timbral family, deliberately: `land` and
 * `done` are both built from `TONIC_HZ`, and `done`'s major-triad chord
 * tones (the third and the fifth) are themselves degrees of `land`'s own
 * pentatonic scale -- see doneFrequencies' doc comment for the exact
 * overlap. `shuffle` carries no pitch at all (filtered noise only), so it
 * joins the family through timbre -- soft attack, low-passed, quiet -- not
 * through a shared note.
 */

/** A filter's character. Kept as this project's own three-value union
 *  rather than importing `BiquadFilterType` from lib.dom -- this file has
 *  no DOM dependency, type-level or otherwise, and never will. */
export type FilterKind = 'lowpass' | 'bandpass' | 'highpass';

/** One additive layer on top of a fundamental: how far away in pitch, as a
 *  frequency RATIO to the fundamental (2 is exactly one octave up,
 *  whatever the fundamental's own pitch is), how loud relative to the
 *  fundamental's own gain (1.0), and how far detuned in cents. Every
 *  partial used by this file keeps `gain < 1` and `detuneCents` at 0 --
 *  "a quieter partial", per the brief, not a chorus effect -- but the
 *  field stays so a future task can add width without a shape change.
 *  Named `PartialTone`, not `Partial`, so importing it can never shadow
 *  TypeScript's own `Partial<T>` utility type in a file that imports both. */
export interface PartialTone {
  ratio: number;
  gain: number;
  detuneCents: number;
}

/**
 * attack -> decay -> (an implicit, zero-length hold at sustainLevel -- see
 * below) -> release. All four fields in seconds except `sustainLevel`,
 * which is a 0..1 fraction of the voice's own peak gain.
 *
 * This is a percussive one-shot envelope, not a held note: nothing in this
 * file ever calls a "note off". So there is no separate hold-duration
 * field -- `decayS` is the time from the attack's peak DOWN to
 * `sustainLevel`, and `releaseS` begins the instant `decayS` ends. Two
 * effects (`SHUFFLE_ENVELOPE`, `LAND_TRANSIENT.envelope`) collapse this to
 * a plain attack-then-release swell by setting `decayS: 0, sustainLevel:
 * 1` -- decay to 100% of peak in zero time is a no-op, which is exactly
 * the simpler shape a noise swell or a click wants. `land` and `done` use
 * the full four-stage shape: a percussive body that drops to a lower
 * level before it rings out is what makes them read as STRUCK rather than
 * merely faded.
 */
export interface Envelope {
  attackS: number;
  decayS: number;
  sustainLevel: number;
  releaseS: number;
}

/** Attack + decay + release: the wall-clock length of one voice's envelope,
 *  from onset to the floor it releases to. The one arithmetic expression
 *  every voice's `.stop()` time and every "does this fit inside N ms"
 *  test both read from, so they cannot independently drift apart. */
export const envelopeTotalS = (envelope: Envelope): number =>
  envelope.attackS + envelope.decayS + envelope.releaseS;

/**
 * A filter's cutoff (or, for a bandpass, its centre) moving over time.
 * `startHz` is where it begins; `endHz` is where it ends. `peakHz`/
 * `peakAtS` are both present together, or both absent: present, the sweep
 * is a three-point up-then-down motion (`shuffle`'s "sweeps up and back
 * down") that passes through `peakHz` at `peakAtS` seconds before heading
 * to `endHz`; absent, it is a plain two-point motion straight from
 * `startHz` to `endHz` (`land`'s cutoff, which only ever falls).
 */
export interface FilterSweep {
  kind: FilterKind;
  q: number;
  startHz: number;
  endHz: number;
  peakHz?: number;
  peakAtS?: number;
}

/**
 * The band every NOTE (not filter cutoff -- see the test file for why
 * those are checked separately) this file produces is asserted to live
 * inside: comfortably within human hearing, and specifically the range a
 * soft classroom tone should occupy -- low enough to stay warm, high
 * enough that a run of `land` notes still reads as a rising phrase rather
 * than a bass rumble.
 */
export const AUDIBLE_BAND_HZ = { min: 120, max: 2500 } as const;

/**
 * The two dealing paces `classroom-groups.ts`'s `animate()` offers
 * (`skip` plays no sound at all -- see that function). Defined here, not
 * there, and imported back by animate(), so `LAND_ENVELOPE`'s total decay
 * time and the fast step can be compared in ONE place (sfx.test.ts) rather
 * than trusting a hand-copied `45` to stay in sync with whatever `animate`
 * actually uses -- two places computing the same fact is how they end up
 * disagreeing.
 */
export const FAST_STEP_S = 0.045;
export const NORMAL_STEP_S = 0.11;

// ── the shared tonal centre ─────────────────────────────────────────────

/** G4. The root both `land`'s scale and `done`'s chord are built from --
 *  see the module doc comment for why sharing one root is what makes the
 *  two pitched effects one family rather than two unrelated ones. */
export const TONIC_HZ = 392;

/** Equal-temperament frequency ratio for a distance of `semitones` (may be
 *  fractional or negative). `semitoneRatio(12) === 2` -- exactly one
 *  octave -- is the identity every pitch calculation below rests on. */
export const semitoneRatio = (semitones: number): number =>
  Math.pow(2, semitones / 12);

// ── land(i): a pentatonic mallet pluck ──────────────────────────────────

/**
 * G major pentatonic (G A B D E), as semitone offsets from `TONIC_HZ`. A
 * pentatonic scale is built by construction to contain no semitone (one
 * half-step) interval between any two of its degrees -- that absence is
 * exactly what makes ANY subset of it sound consonant together, which
 * matters here because a class can split into any number of groups, i.e.
 * any LENGTH of subset of this scale, and none of them may clash. Checked
 * directly in sfx.test.ts, including the wrap interval back to the octave
 * above (9 -> 12 is 3 semitones, the same as every other gap here) --
 * that wrap is the one interval a naive "check consecutive array entries"
 * test would miss.
 */
export const SCALE_SEMITONES: readonly number[] = [0, 2, 4, 7, 9];

/**
 * How many octaves above the scale's own the mapping is allowed to climb
 * before it stops climbing and cycles the same top octave instead. 1
 * means two octave "levels" are reachable (0 and 1) -- 10 distinct
 * pitches, G4 to E6 -- and a group index past that wraps back to G5
 * rather than continuing upward. This is the cap that keeps a class split
 * into many groups from ever turning shrill; see `landFrequency`.
 */
export const LAND_OCTAVE_CAP = 1;

/**
 * Group index -> pitch. `degree` cycles through the 5-note scale;
 * `rawOctave` would climb without bound as `index` grows, so it is
 * clamped to `LAND_OCTAVE_CAP` before it ever reaches the exponent --
 * `octave`, not `rawOctave`, is what `semitoneRatio` actually sees. That
 * is the one line standing between this function and the exact bug the
 * brief names: "an unbounded mapping is the shrillness bug waiting to
 * happen." Negative or fractional input is defensively floored to a
 * non-negative integer -- `animate()`'s own loop index never goes
 * negative, but a pure function should not trust that from outside.
 */
export function landFrequency(index: number): number {
  const i = Math.max(0, Math.trunc(index));
  const degree = i % SCALE_SEMITONES.length;
  const rawOctave = Math.floor(i / SCALE_SEMITONES.length);
  const octave = Math.min(rawOctave, LAND_OCTAVE_CAP);
  return TONIC_HZ * semitoneRatio(SCALE_SEMITONES[degree] + octave * 12);
}

/** Kept in the brief's stated 0.03-0.05 range -- this is the FUNDAMENTAL's
 *  own peak; every partial below is a strictly-quieter multiplier on top
 *  of it, never an independent peak of its own. */
export const LAND_PEAK_GAIN = 0.035;

/**
 * A sine fundamental plus two quieter partials -- warmth and a little
 * mallet brightness without the harshness a loud upper partial would add.
 * Both partials are harmonic (ratio 2 and 4: one and two octaves up) so
 * they reinforce the fundamental's own pitch rather than smearing it, and
 * `LAND_LOWPASS` below closes over them as the note dies so the brightest
 * content is also the shortest-lived, the way a struck bar actually
 * behaves.
 */
export const LAND_PARTIALS: readonly PartialTone[] = [
  { ratio: 1, gain: 1, detuneCents: 0 },
  { ratio: 2, gain: 0.22, detuneCents: 0 },
  { ratio: 4, gain: 0.08, detuneCents: 0 },
];

/**
 * The core numeric claim of this task: this envelope's TOTAL
 * (envelopeTotalS: 0.002 + 0.008 + 0.024 = 0.034s) must stay clear of
 * FAST_STEP_S (0.045s), the closest two `land` notes are ever scheduled --
 * see sfx.test.ts for the assertion and this file's own report for the
 * dB-level reasoning about the release curve. 34ms leaves 11ms (24% of
 * the 45ms step) where the previous note has already reached the release
 * floor before the next note's attack begins, at ANY speed the page
 * offers -- `NORMAL_STEP_S` (110ms) has more than triple that margin.
 */
export const LAND_ENVELOPE: Envelope = {
  attackS: 0.002,
  decayS: 0.008,
  sustainLevel: 0.3,
  releaseS: 0.024,
};

/**
 * The cutoff FALLS as the note decays (brief's own words) -- 6000Hz
 * comfortably clears the highest content this effect ever produces (the
 * ratio-4 partial of the highest capped note, 1318.53 * 4 = 5274Hz) so
 * the attack is not itself dulled, then closes to 1100Hz by the time the
 * envelope releases, muting the partials early and leaving mostly the
 * fundamental ringing -- the "cutoff falls" half of a struck-mallet's
 * actual physics.
 */
export const LAND_LOWPASS: FilterSweep = {
  kind: 'lowpass',
  q: 0.707,
  startHz: 6000,
  endHz: 1100,
};

/** A very short burst of filtered noise laid under `land`'s onset -- "the
 *  sense of contact", brief's words, that a pure sine attack cannot supply
 *  on its own. `gain` is relative to `LAND_PEAK_GAIN`, same convention as
 *  a PartialTone's own gain. The envelope's `decayS: 0, sustainLevel: 1`
 *  is the simple attack-then-release shape (see Envelope's own doc
 *  comment) -- a click has no body to hold, only an onset and a fade. The
 *  filter's `startHz === endHz` is a deliberately flat highpass, not a
 *  sweep: this is a 6ms transient, over before a moving cutoff could be
 *  heard as movement at all. */
export interface Transient {
  gain: number;
  envelope: Envelope;
  filter: FilterSweep;
}
export const LAND_TRANSIENT: Transient = {
  gain: 0.35,
  envelope: { attackS: 0.001, decayS: 0, sustainLevel: 1, releaseS: 0.006 },
  filter: { kind: 'highpass', q: 0.9, startHz: 1500, endHz: 1500 },
};

// ── shuffle(): a filtered-noise whoosh ──────────────────────────────────

/** Kept in the brief's stated 0.03-0.05 range, same reasoning as
 *  LAND_PEAK_GAIN. */
export const SHUFFLE_PEAK_GAIN = 0.045;

/** Fast attack, soft tail (brief's own words) -- `decayS: 0, sustainLevel:
 *  1` is the plain swell-then-fade shape (see Envelope's own doc comment):
 *  a card-riffle whoosh has one rise and one long fade, no separate
 *  struck body to decay through first. Total 0.348s -- well clear of any
 *  step timing, since this fires once per shuffle, never in a tight
 *  loop the way `land` does. */
export const SHUFFLE_ENVELOPE: Envelope = {
  attackS: 0.008,
  decayS: 0,
  sustainLevel: 1,
  releaseS: 0.34,
};

/** The bandpass centre sweeps UP from 650Hz to a 2200Hz peak at 0.15s in,
 *  then back DOWN to 480Hz by the envelope's own end (0.348s) -- "sweeps
 *  up and back down", brief's own words, over filtered noise rather than
 *  a pitched oscillator, which is what turns a buzz into a whoosh. Q 1.2
 *  is a broad, gentle band -- narrow enough to sound swept rather than
 *  flat, nowhere near narrow enough to whistle. */
export const SHUFFLE_FILTER: FilterSweep = {
  kind: 'bandpass',
  q: 1.2,
  startHz: 650,
  peakHz: 2200,
  peakAtS: 0.15,
  endHz: 480,
};

// ── done(): a resolving major-triad bell chord ──────────────────────────

/** Root, major third, fifth, octave -- four notes, the brief's upper
 *  bound. Built in the SAME equal-temperament semitones as `land`'s scale
 *  (see `doneFrequencies`), not a separate just-intonation ratio table,
 *  so the two effects' pitch math is one system, not two. */
export const DONE_CHORD_SEMITONES: readonly number[] = [0, 4, 7, 12];

/** Each note staggered from the effect's own start, in seconds -- "a few
 *  tens of milliseconds" apart (brief's own words): four notes, 40ms
 *  apart, arriving over 120ms total before any of their own (much longer)
 *  releases even begin to matter. Strictly ascending, one entry per
 *  DONE_CHORD_SEMITONES entry -- both checked in sfx.test.ts, since a
 *  length mismatch between this array and the chord would silently drop
 *  a note or read `undefined` at the call site in classroom-groups.ts. */
export const DONE_STAGGER_S: readonly number[] = [0, 0.04, 0.08, 0.12];

/** Kept in the brief's stated 0.03-0.05 range, same reasoning as
 *  LAND_PEAK_GAIN -- applied per note, not to the chord as a whole; four
 *  notes this quiet, staggered in both time and pitch, is what "soft
 *  resolving" sounds like rather than "loud chord". */
export const DONE_PEAK_GAIN = 0.045;

/** A sine fundamental plus ONE quieter partial -- brief's own words, "each
 *  a sine with a quieter partial" (singular) -- simpler than `land`'s two
 *  partials, which is deliberate: a resolving chord wants to sound like a
 *  clean bell, not compete with the mallet-pluck texture `land` already
 *  supplies throughout the same run. */
export const DONE_PARTIALS: readonly PartialTone[] = [
  { ratio: 1, gain: 1, detuneCents: 0 },
  { ratio: 2, gain: 0.15, detuneCents: 0 },
];

/** A LONGER release than `land` (brief's own words: 0.75s against land's
 *  0.024s, over 30x) -- "an arrival, not an alarm": the chord is meant to
 *  ring out and fade slowly once the groups have settled, not snap off
 *  the way a mallet note under a fast deal has to. */
export const DONE_ENVELOPE: Envelope = {
  attackS: 0.006,
  decayS: 0.05,
  sustainLevel: 0.45,
  releaseS: 0.75,
};

/** `DONE_CHORD_SEMITONES` resolved against the SAME `TONIC_HZ` `land`
 *  reads -- one shared root, per the module doc comment. Two of its four
 *  notes are not incidental to `land`'s own scale: `semitoneRatio(4)`'s
 *  note (the major third) sits between `land`'s 2nd and 3rd scale degrees
 *  and is not itself one of them, but `semitoneRatio(7)` -- the fifth --
 *  IS `SCALE_SEMITONES[3]` exactly, so `done`'s fifth is a note `land`
 *  could also have played moments earlier. That overlap is what makes the
 *  chord sound like the destination the preceding run of pentatonic notes
 *  was heading toward, rather than an unrelated sound arriving on top of
 *  it. */
export function doneFrequencies(): number[] {
  return DONE_CHORD_SEMITONES.map((s) => TONIC_HZ * semitoneRatio(s));
}

// ── the master bus ──────────────────────────────────────────────────────

/** A gentle overall trim on the combined bus, on top of the individual
 *  peak gains above -- headroom for whichever effect's voices happen to
 *  land in phase with each other, never loud enough on its own to make
 *  anything quieter than intended. */
export const MASTER_GAIN = 0.85;

/** "A gentle lowpass on the master bus so nothing is harsh" (brief's own
 *  words) -- comfortably above every fundamental this file ever produces
 *  (land tops out at 1318.53Hz, done at 784Hz; see the "never eats a
 *  real note" test in sfx.test.ts) so it never mutes actual pitch, and
 *  above `SHUFFLE_FILTER`'s own 2200Hz peak too -- its job is smoothing
 *  the top of the band, not reshaping any one effect's own filter work. */
export const MASTER_LOWPASS_HZ = 4200;
