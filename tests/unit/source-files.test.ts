import { describe, expect, it } from 'vitest';
import { filesUnder } from '../source-files';

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
    expect(inE2eOnly.length).toBeGreaterThan(0);
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
