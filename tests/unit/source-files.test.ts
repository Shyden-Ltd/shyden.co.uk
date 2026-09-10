import { describe, expect, it } from 'vitest';
import { filesUnder, nonEmpty } from '../source-files';

/**
 * The shared directory walk (#80). Nine private copies had grown, in three
 * implementations whose exclusions disagreed — so the behaviour every guard
 * now inherits is pinned here rather than left to whichever copy a future
 * guard happened to reach for.
 */
describe('filesUnder', () => {
  it('recurses, and returns paths a caller can read', () => {
    const specs = filesUnder('tests', (path) => path.endsWith('.spec.ts'));
    // Anti-vacuity: an empty walk would satisfy every "no offenders" guard in
    // the suite at once — the exact failure #79 found in the e2e collectors.
    expect(specs.length).toBeGreaterThan(10);
    // Proof it went DOWN, not just listed the top level.
    expect(specs).toContain('tests/e2e/classroom-groups-print.spec.ts');
  });

  it('applies the caller predicate to the whole path, not the basename', () => {
    const inE2eOnly = filesUnder('tests', (path) =>
      path.startsWith('tests/e2e/'),
    );
    expect(inE2eOnly.every((path) => path.startsWith('tests/e2e/'))).toBe(true);
  });

  it('returns a stable order, so a guard reads the same list on every OS', () => {
    const once = filesUnder('tests', () => true);
    expect(once).toEqual([...once].sort());
  });

  it('skips dotfiles and node_modules, which only four of the nine did', () => {
    const all = filesUnder('tests', () => true);
    expect(
      all.filter((path) => path.split('/').some((s) => s.startsWith('.'))),
    ).toEqual([]);
    expect(all.filter((path) => path.includes('node_modules'))).toEqual([]);
  });
});

/**
 * The liveness control #84 moved OFF the call sites and INTO the collector.
 *
 * Eleven guards hand-wrote `expect(files.length).toBeGreaterThan(0)`, five of
 * them copying a comment that cites a sibling; four forgot, and twelve tests
 * passed while scanning zero files. `recorders.ts` already settled the shape
 * for browser events in #79 — the collector, not a convention, is what a
 * caller cannot forget.
 */
describe('nonEmpty', () => {
  it('passes a populated list straight through, untouched', () => {
    expect(nonEmpty(['a', 'b'], 'letters')).toEqual(['a', 'b']);
  });

  it('throws, naming what it was scanning, when the list is empty', () => {
    expect(() => nonEmpty([], 'every .ts file under tests/')).toThrow(
      /every \.ts file under tests\//,
    );
  });

  it('blames the guard, not the subject: the message is the whole point', () => {
    // "found none" reads like a clean result. The message has to say that the
    // WALK is broken, or the next reader triages the wrong thing entirely.
    expect(() => nonEmpty([], 'x')).toThrow(/broken/);
  });
});

describe('filesUnder refuses to answer blind', () => {
  it('throws rather than returning an empty list a guard would trust', () => {
    expect(() => filesUnder('tests', () => false)).toThrow(/tests/);
  });

  it('still descends through directories that hold no match themselves', () => {
    // The refusal belongs to the TOP-LEVEL call only. `tests/` holds
    // directories with no `.spec.ts` in them, so a recursion that refused an
    // empty sub-result could never complete a walk at all.
    expect(
      filesUnder('tests', (path) => path.endsWith('.spec.ts')).length,
    ).toBeGreaterThan(10);
  });
});
