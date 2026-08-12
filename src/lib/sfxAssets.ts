/**
 * The real, mastered CC0 samples this page can play for shuffle/land/done --
 * as pure data, no `AudioContext`, no `fetch`, no Vite/bundler awareness at
 * all, so Vitest exercises this file directly (tests/unit/sfxAssets.test.ts)
 * with no browser or build step involved. `src/scripts/classroom-groups.ts`
 * is the only thing that ever turns the FILENAMES named here into real Vite
 * asset imports (`import shuffleUrl from '../assets/sfx/shuffle.m4a'`,
 * content-hashed at build time -- see that file's own "sound" section) or
 * into real `fetch`/`decodeAudioData` calls -- exactly the split CLAUDE.md
 * asks for ("logic is pure ... page scripts only wire the DOM"), the same
 * split `src/lib/sfx.ts` (the SYNTHESISED fallback these real samples take
 * priority over) already keeps.
 *
 * Provenance and licence for the six files themselves:
 * src/assets/sfx/CREDITS.md.
 */

/** The three roles this page ever plays a sound for -- `land` is FOUR files
 *  (see SFX_MANIFEST.land), not one, because a run of identical-sounding
 *  landings is the one thing round-robin (landAssetIndex, below) exists to
 *  avoid; `shuffle` and `done` are each exactly one file, since neither is
 *  ever triggered more than once per shuffle. */
export type SfxRole = 'shuffle' | 'land' | 'done';

/**
 * Filenames only -- exactly what is committed at src/assets/sfx/, matched
 * against that real directory listing by tests/unit/sfxAssets.test.ts so the
 * two can never silently drift apart (a file renamed, added or removed on
 * disk without this manifest changing to match, or vice versa, fails a test
 * either way). `classroom-groups.ts` does NOT read this manifest to decide
 * what to import -- it uses the same six filenames as literal
 * `import ... from '../assets/sfx/<name>.m4a'` statements instead, so a
 * missing file fails the BUILD (Vite cannot resolve the import), which is
 * the stronger, earlier guarantee; this manifest is the one place a test can
 * ask "does every role still have exactly the files it should" without
 * needing a build to do it.
 */
export const SFX_MANIFEST: Readonly<Record<SfxRole, readonly string[]>> = {
  shuffle: ['shuffle.m4a'],
  land: ['land-1.m4a', 'land-2.m4a', 'land-3.m4a', 'land-4.m4a'],
  done: ['done.m4a'],
};

/**
 * Group index -> which of the four SFX_MANIFEST.land files plays, cycling so
 * two consecutive groups never land on the same recording -- the entire
 * reason there are four mastered takes instead of one (see CREDITS.md: four
 * separate Kenney originals, RMS-matched to each other so none of the four
 * ducks out as the quiet one in the cycle). Defensively floors negative or
 * fractional input, the same as landFrequency/landPan (src/lib/sfx.ts) -- a
 * pure function should never trust its caller to pre-validate.
 */
export function landAssetIndex(groupIndex: number): number {
  const i = Math.max(0, Math.trunc(groupIndex));
  return i % SFX_MANIFEST.land.length;
}

/**
 * Playback gain per role, applied on a plain GainNode straight to
 * destination (see classroom-groups.ts's own "wire the assets in" section --
 * these files are already mastered; routing them through the SYNTH path's
 * reverb/highpass/lowpass/compressor chain would only recolour a sound that
 * is already finished). Reasoned defaults -- none of these numbers are
 * stated anywhere; the operator brief that picked set C names a choice of
 * sound set, not a mix level. `land` sits lowest of the three because it is
 * the one role triggered repeatedly -- every FAST_STEP_S (src/lib/sfx.ts,
 * 45ms at the fastest speed) against clips 250-268ms long (CREDITS.md), so
 * several overlapping copies ringing at once is the NORMAL case, not an edge
 * case -- while `shuffle`/`done` each fire exactly once per shuffle and so
 * carry no self-overlap risk of their own. There is no shared limiter on
 * this path the way the synth's master bus has one (MASTER_COMPRESSOR,
 * src/lib/sfx.ts), so the headroom has to come from the gain itself.
 */
export const SFX_ASSET_GAIN: Readonly<Record<SfxRole, number>> = {
  shuffle: 0.85,
  land: 0.55,
  done: 0.85,
};

/**
 * A ceiling, in seconds, on how long a role's file may run -- protecting the
 * ANIMATION, not the ear. `land` fires every FAST_STEP_S (45ms,
 * src/lib/sfx.ts) at the fastest speed; a future replacement wildly longer
 * than today's mastered takes (250-268ms, CREDITS.md) would not just sound
 * different, it would pile up overlapping copies of itself into a smear
 * rather than a sequence of discrete landings. `shuffle`/`done` fire once
 * per shuffle, so a longer file cannot smear the animation the same way, but
 * "no ceiling at all" is not the right answer for them either. See
 * tests/unit/sfxAssets.test.ts, which parses the REAL committed files' own
 * container-declared duration (not a hand-typed number that could go stale)
 * and checks it against these ceilings, so a future file swap that is
 * wildly longer fails a test instead of shipping silently. Reasoned
 * defaults, roughly 1.5-1.9x today's real (container) lengths -- real room
 * to replace a file with a similar one, not so loose the ceiling stops
 * meaning anything.
 */
export const SFX_MAX_DURATION_S: Readonly<Record<SfxRole, number>> = {
  shuffle: 0.35,
  land: 0.5,
  done: 0.75,
};
