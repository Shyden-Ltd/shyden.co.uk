import { describe, expect, it } from 'vitest';
import { specDirs } from '../spec-dirs';

describe('the directories guards scan are derived, not listed', () => {
  it('finds every directory under tests/ that holds specs', () => {
    // Anti-vacuity: an empty derivation would make every guard a no-op.
    // Measured 5 spec directories on 2026-10-03 (#446). Stated tight, so a
    // reader that comes back one short fails.
    expect(specDirs().length).toBeGreaterThan(4);
    expect(specDirs()).toContain('tests/e2e');
    expect(specDirs()).toContain('tests/device');
  });

  it('includes the deploy gates, which the hand-written list missed', () => {
    // These two produce `dev-verified`, a required check on main's branch
    // protection, and were in none of the four hand-written copies (#67).
    expect(specDirs()).toContain('tests/dev');
    expect(specDirs()).toContain('tests/prod');
  });

  it('excludes directories that hold no specs', () => {
    // tests/unit holds *.test.ts, not *.spec.ts — scanning it would make the
    // guards assert against themselves.
    expect(specDirs()).not.toContain('tests/unit');
  });
});
