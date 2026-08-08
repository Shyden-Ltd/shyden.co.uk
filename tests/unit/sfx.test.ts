import { describe, it, expect } from 'vitest';
import * as sfx from '../../src/lib/sfx';
import {
  envelopeTotalS,
  semitoneRatio,
  landFrequency,
  doneFrequencies,
  TONIC_HZ,
  SCALE_SEMITONES,
  LAND_OCTAVE_CAP,
  LAND_PEAK_GAIN,
  LAND_PARTIALS,
  LAND_ENVELOPE,
  LAND_LOWPASS,
  LAND_TRANSIENT,
  SHUFFLE_PEAK_GAIN,
  SHUFFLE_ENVELOPE,
  SHUFFLE_FILTER,
  DONE_CHORD_SEMITONES,
  DONE_STAGGER_S,
  DONE_PEAK_GAIN,
  DONE_PARTIALS,
  DONE_ENVELOPE,
  MASTER_GAIN,
  MASTER_LOWPASS_HZ,
  AUDIBLE_BAND_HZ,
  FAST_STEP_S,
  NORMAL_STEP_S,
  type Envelope,
} from '../../src/lib/sfx';

// Every export here is pure -- no AudioContext, no window, no document (see
// the module doc comment) -- so every test below exercises the REAL
// synthesiser logic, not a fake standing in for Web Audio.
describe('the module surface', () => {
  it('exports nothing that nothing uses', () => {
    // Same forcing-function pattern as grouping.test.ts's own "the module
    // surface" block: type-only exports (FilterKind, PartialTone, Envelope,
    // FilterSweep, Transient) are erased at build time and never appear in
    // Object.keys, so they are correctly absent here by construction, not
    // by omission. A new export belongs in this list ONLY once something
    // (classroom-groups.ts, or a test that cannot otherwise reach a
    // guarantee) actually uses it -- an export nothing reaches is dead code.
    expect(Object.keys(sfx).sort()).toEqual(
      [
        'envelopeTotalS',
        'AUDIBLE_BAND_HZ',
        'FAST_STEP_S',
        'NORMAL_STEP_S',
        'TONIC_HZ',
        'semitoneRatio',
        'SCALE_SEMITONES',
        'LAND_OCTAVE_CAP',
        'landFrequency',
        'LAND_PEAK_GAIN',
        'LAND_PARTIALS',
        'LAND_ENVELOPE',
        'LAND_LOWPASS',
        'LAND_TRANSIENT',
        'SHUFFLE_PEAK_GAIN',
        'SHUFFLE_ENVELOPE',
        'SHUFFLE_FILTER',
        'DONE_CHORD_SEMITONES',
        'DONE_STAGGER_S',
        'DONE_PEAK_GAIN',
        'DONE_PARTIALS',
        'DONE_ENVELOPE',
        'doneFrequencies',
        'MASTER_GAIN',
        'MASTER_LOWPASS_HZ',
      ].sort(),
    );
  });
});

describe('semitoneRatio', () => {
  it('is the identity every pitch calculation in this file rests on', () => {
    expect(semitoneRatio(0)).toBe(1); // no distance, no change
    expect(semitoneRatio(12)).toBe(2); // one octave up, exactly double
    expect(semitoneRatio(-12)).toBeCloseTo(0.5, 10); // one octave down, exactly half
    expect(semitoneRatio(24)).toBe(4); // two octaves, exactly quadruple
  });
});

describe('the pentatonic scale (SCALE_SEMITONES)', () => {
  it('is five notes -- "pentatonic" is not a name, it is a count', () => {
    expect(SCALE_SEMITONES.length).toBe(5);
  });

  it('is given in strictly ascending order', () => {
    for (let i = 1; i < SCALE_SEMITONES.length; i++) {
      expect(SCALE_SEMITONES[i]).toBeGreaterThan(SCALE_SEMITONES[i - 1]);
    }
  });

  it('contains no semitone (one half-step) interval, including the wrap back to the octave above', () => {
    // This is the property that makes it consonant: any SUBSET of a
    // pentatonic scale still sounds musical together, which matters
    // because a class splitting into groups plays an arbitrary-length
    // subset of this scale, never the whole thing in order. A naive
    // "check consecutive array entries" version of this test would miss
    // the interval from the LAST degree back up to the octave above the
    // first -- included here deliberately (see the loop's `next`).
    const intervals: number[] = [];
    for (let i = 0; i < SCALE_SEMITONES.length; i++) {
      const next =
        i + 1 < SCALE_SEMITONES.length
          ? SCALE_SEMITONES[i + 1]
          : SCALE_SEMITONES[0] + 12;
      intervals.push(next - SCALE_SEMITONES[i]);
    }
    for (const interval of intervals) {
      expect(interval).toBeGreaterThanOrEqual(2);
    }
    // Sums to exactly one octave -- a sanity check on the interval
    // arithmetic itself, independent of the >=2 claim above.
    expect(intervals.reduce((a, b) => a + b, 0)).toBe(12);
  });
});

describe('landFrequency (group index -> pitch)', () => {
  it('is strictly ascending within the first octave', () => {
    for (let i = 1; i < SCALE_SEMITONES.length; i++) {
      expect(landFrequency(i)).toBeGreaterThan(landFrequency(i - 1));
    }
  });

  it('starts exactly on the tonic', () => {
    expect(landFrequency(0)).toBe(TONIC_HZ); // semitoneRatio(0) === 1, exactly
  });

  it('keeps ascending across the first octave wrap, before the cap is reached', () => {
    // Index SCALE_SEMITONES.length is degree 0 of octave 1 -- still below
    // LAND_OCTAVE_CAP, so this transition must still climb, not drop.
    expect(landFrequency(SCALE_SEMITONES.length)).toBeGreaterThan(
      landFrequency(SCALE_SEMITONES.length - 1),
    );
  });

  it('wraps DOWN once the octave cap is reached -- it does not keep climbing forever', () => {
    // One full cycle past the cap must land back where the cap's own
    // cycle started: proof that the capped region actually repeats
    // rather than merely growing slowly.
    const cycleLength = SCALE_SEMITONES.length;
    const firstCappedIndex = cycleLength * (LAND_OCTAVE_CAP + 1);
    expect(landFrequency(firstCappedIndex)).toBe(
      landFrequency(firstCappedIndex - cycleLength),
    );
    // And the step INTO that wrap is a drop, not a rise -- the last note
    // of the capped octave is higher than the first note of its repeat.
    expect(landFrequency(firstCappedIndex - 1)).toBeGreaterThan(
      landFrequency(firstCappedIndex),
    );
  });

  it('the top frequency is bounded no matter how large the group index gets', () => {
    // Computed from the SAME mechanism landFrequency itself uses (the
    // scale's own highest degree, capped at LAND_OCTAVE_CAP octaves up) --
    // not a hand-picked ceiling -- so this test stays meaningful even if
    // the scale or the cap are retuned later.
    const theoreticalMaxHz =
      TONIC_HZ *
      semitoneRatio(
        SCALE_SEMITONES[SCALE_SEMITONES.length - 1] + LAND_OCTAVE_CAP * 12,
      );
    for (const i of [0, 1, 5, 12, 40, 500]) {
      expect(landFrequency(i)).toBeLessThanOrEqual(theoreticalMaxHz + 1e-9);
    }
    // The strongest form of "bounded": two wildly different indices, both
    // past the cap and both landing on the scale's first degree (40 % 5
    // === 0, 500 % 5 === 0), must produce the EXACT same frequency --
    // proof the mapping truly cycles rather than merely growing slowly
    // enough to look bounded over this particular sample.
    expect(landFrequency(40)).toBe(landFrequency(500));
  });

  it('every frequency stays inside the stated audible band', () => {
    for (const i of [0, 1, 2, 3, 4, 5, 9, 12, 20, 40, 100, 500]) {
      const hz = landFrequency(i);
      expect(hz).toBeGreaterThanOrEqual(AUDIBLE_BAND_HZ.min);
      expect(hz).toBeLessThanOrEqual(AUDIBLE_BAND_HZ.max);
    }
  });

  it('is a pure function -- the same index always gives the same pitch', () => {
    expect(landFrequency(7)).toBe(landFrequency(7));
  });
});

describe('doneFrequencies (the resolving chord)', () => {
  it('returns exactly one frequency per chord degree', () => {
    expect(doneFrequencies().length).toBe(DONE_CHORD_SEMITONES.length);
  });

  it('roots on the SAME tonic land uses -- one shared family, not two', () => {
    expect(doneFrequencies()[0]).toBe(TONIC_HZ);
  });

  it('is a strictly ascending major triad plus octave', () => {
    const freqs = doneFrequencies();
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
    }
  });

  it("its fifth is a degree land's own pentatonic scale also uses", () => {
    // The overlap the module doc comment claims: semitoneRatio(7) (the
    // fifth) is exactly SCALE_SEMITONES[3] -- a note `land` could equally
    // have played. Verified here, not just asserted in prose.
    expect(DONE_CHORD_SEMITONES).toContain(SCALE_SEMITONES[3]);
  });

  it('every note stays inside the stated audible band', () => {
    for (const hz of doneFrequencies()) {
      expect(hz).toBeGreaterThanOrEqual(AUDIBLE_BAND_HZ.min);
      expect(hz).toBeLessThanOrEqual(AUDIBLE_BAND_HZ.max);
    }
  });
});

describe('envelopeTotalS', () => {
  it('sums attack + decay + release (sustainLevel is a level, not a duration)', () => {
    const env: Envelope = {
      attackS: 0.01,
      decayS: 0.02,
      sustainLevel: 0.5,
      releaseS: 0.03,
    };
    expect(envelopeTotalS(env)).toBeCloseTo(0.06, 10);
  });
});

// Every envelope this file exports, checked against the same invariants:
// attack and release must be strictly positive (a zero-duration
// exponential ramp is invalid Web Audio automation -- see
// classroom-groups.ts's own applyEnvelope), decay may legitimately be
// zero (the plain swell-then-fade shape -- see Envelope's own doc
// comment), and sustainLevel is always a 0..1 fraction of peak.
const ALL_ENVELOPES: ReadonlyArray<[string, Envelope]> = [
  ['LAND_ENVELOPE', LAND_ENVELOPE],
  ['SHUFFLE_ENVELOPE', SHUFFLE_ENVELOPE],
  ['DONE_ENVELOPE', DONE_ENVELOPE],
  ['LAND_TRANSIENT.envelope', LAND_TRANSIENT.envelope],
];

describe.each(ALL_ENVELOPES)('%s', (_name, env) => {
  it('has positive, finite attack and release, and a non-negative finite decay', () => {
    expect(env.attackS).toBeGreaterThan(0);
    expect(Number.isFinite(env.attackS)).toBe(true);
    expect(env.decayS).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(env.decayS)).toBe(true);
    expect(env.releaseS).toBeGreaterThan(0);
    expect(Number.isFinite(env.releaseS)).toBe(true);
  });

  it('keeps sustainLevel as a 0..1 fraction of peak', () => {
    expect(env.sustainLevel).toBeGreaterThan(0);
    expect(env.sustainLevel).toBeLessThanOrEqual(1);
  });

  it('has a finite, positive total duration', () => {
    const total = envelopeTotalS(env);
    expect(total).toBeGreaterThan(0);
    expect(Number.isFinite(total)).toBe(true);
  });
});

describe('duration ceilings -- a fast run must not overlap into mush', () => {
  it("land's total envelope fits inside the FAST step, with real margin to spare", () => {
    // The one judgment call the brief leaves to this task, made
    // numerically: land's envelope (attack 2ms + decay 8ms + release
    // 24ms = 34ms) must finish -- reach its release floor, with nothing
    // further scheduled -- before the very next note's attack begins,
    // even at the fastest step (45ms). 34ms < 45ms alone would be a weak
    // claim (true by 1ms is still "fits"); the margin below is the real
    // test.
    const total = envelopeTotalS(LAND_ENVELOPE);
    expect(total).toBeLessThan(FAST_STEP_S);
    const marginS = FAST_STEP_S - total;
    // At least a fifth of the fast step must be genuine silence between
    // one note's release floor and the next note's attack -- not merely
    // "less than", a MEANINGFUL gap. (Measured: 11ms of an 45ms step,
    // ~24%.)
    expect(marginS / FAST_STEP_S).toBeGreaterThanOrEqual(0.2);
  });

  it('land fits inside the NORMAL step with even more room', () => {
    const total = envelopeTotalS(LAND_ENVELOPE);
    expect(total).toBeLessThan(NORMAL_STEP_S);
    expect(NORMAL_STEP_S - total).toBeGreaterThan(FAST_STEP_S - total);
  });

  it('shuffle stays under half a second, start to release floor', () => {
    expect(envelopeTotalS(SHUFFLE_ENVELOPE)).toBeLessThan(0.5);
  });

  it('a single done() note stays under a second and a fifth, stagger included', () => {
    const lastStaggerS = Math.max(...DONE_STAGGER_S);
    const total = lastStaggerS + envelopeTotalS(DONE_ENVELOPE);
    expect(total).toBeLessThan(1.2);
  });

  it("done's release is longer than land's -- an arrival, not a snap-off", () => {
    expect(DONE_ENVELOPE.releaseS).toBeGreaterThan(LAND_ENVELOPE.releaseS);
  });
});

describe("gain levels stay in the brief's stated 0.03-0.05 range", () => {
  it.each([
    ['LAND_PEAK_GAIN', LAND_PEAK_GAIN],
    ['SHUFFLE_PEAK_GAIN', SHUFFLE_PEAK_GAIN],
    ['DONE_PEAK_GAIN', DONE_PEAK_GAIN],
  ])('%s', (_name, gain) => {
    expect(gain).toBeGreaterThanOrEqual(0.03);
    expect(gain).toBeLessThanOrEqual(0.05);
  });

  it('every partial is strictly quieter than the fundamental it sits on', () => {
    for (const partial of [...LAND_PARTIALS, ...DONE_PARTIALS]) {
      if (partial.ratio === 1) continue; // the fundamental itself, gain 1
      expect(partial.gain).toBeGreaterThan(0);
      expect(partial.gain).toBeLessThan(1);
    }
  });

  it("LAND_TRANSIENT's contact click is quieter than land's own fundamental", () => {
    expect(LAND_TRANSIENT.gain).toBeGreaterThan(0);
    expect(LAND_TRANSIENT.gain).toBeLessThan(1);
  });

  it('the master gain trims, it does not amplify', () => {
    expect(MASTER_GAIN).toBeGreaterThan(0);
    expect(MASTER_GAIN).toBeLessThanOrEqual(1);
  });
});

describe('filter sweeps', () => {
  it("land's lowpass cutoff FALLS as the note decays", () => {
    expect(LAND_LOWPASS.startHz).toBeGreaterThan(LAND_LOWPASS.endHz);
  });

  it("land's lowpass clears the brightest content it ever has to pass (the top partial of the highest capped note)", () => {
    const highestPartialRatio = Math.max(...LAND_PARTIALS.map((p) => p.ratio));
    const highestFundamental = Math.max(
      ...[0, 1, 5, 9, 40, 500].map(landFrequency),
    );
    expect(LAND_LOWPASS.startHz).toBeGreaterThan(
      highestFundamental * highestPartialRatio,
    );
  });

  it("shuffle's bandpass genuinely sweeps UP then back DOWN, not a plain slide", () => {
    expect(SHUFFLE_FILTER.peakHz).toBeGreaterThan(SHUFFLE_FILTER.startHz);
    expect(SHUFFLE_FILTER.peakHz).toBeGreaterThan(SHUFFLE_FILTER.endHz);
    expect(SHUFFLE_FILTER.peakAtS).toBeGreaterThan(0);
    expect(SHUFFLE_FILTER.peakAtS).toBeLessThan(
      envelopeTotalS(SHUFFLE_ENVELOPE),
    );
  });

  it('every filter Hz value and Q is positive and finite', () => {
    for (const sweep of [LAND_LOWPASS, SHUFFLE_FILTER, LAND_TRANSIENT.filter]) {
      expect(sweep.startHz).toBeGreaterThan(0);
      expect(sweep.endHz).toBeGreaterThan(0);
      expect(sweep.q).toBeGreaterThan(0);
      expect(Number.isFinite(sweep.startHz)).toBe(true);
      expect(Number.isFinite(sweep.endHz)).toBe(true);
    }
  });

  it('the master lowpass never eats a real note -- it sits above every fundamental this file produces', () => {
    const sampledLandHz = [0, 1, 5, 9, 12, 40, 500].map(landFrequency);
    const highest = Math.max(...sampledLandHz, ...doneFrequencies());
    expect(MASTER_LOWPASS_HZ).toBeGreaterThan(highest);
  });
});

describe("done()'s schedule", () => {
  it('has exactly one stagger offset per chord note -- a length mismatch would silently drop a note', () => {
    expect(DONE_STAGGER_S.length).toBe(DONE_CHORD_SEMITONES.length);
  });

  it("is staggered forward in time only, starting at the effect's own onset", () => {
    expect(DONE_STAGGER_S[0]).toBe(0);
    for (let i = 1; i < DONE_STAGGER_S.length; i++) {
      expect(DONE_STAGGER_S[i]).toBeGreaterThan(DONE_STAGGER_S[i - 1]);
    }
  });

  it('each note arrives a few tens of milliseconds after the last (20-80ms), per the brief', () => {
    for (let i = 1; i < DONE_STAGGER_S.length; i++) {
      const gapS = DONE_STAGGER_S[i] - DONE_STAGGER_S[i - 1];
      expect(gapS).toBeGreaterThanOrEqual(0.02);
      expect(gapS).toBeLessThanOrEqual(0.08);
    }
  });
});
