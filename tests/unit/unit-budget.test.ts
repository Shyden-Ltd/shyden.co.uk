import { describe, it, expect } from 'vitest';
import config from '../../vitest.config';

/**
 * The per-test budget of the unit suite (#235).
 *
 * Nine unit files spawn real processes (git hooks, the translator, the
 * reconciler, and `script-entry.test.ts`, which runs every deciding script as
 * a script). Vitest's default budget is 5000ms, a policy nobody here chose,
 * and process start-up on a shared runner spent it: `test-e2e.mjs refuses
 * from this checkout` starts Node and then `playwright test --list`, which
 * took 1.1s on a laptop, 5.4s on the CI runner (run 35335647213) and up to
 * 9.8s on the laptop under 24 busy loops.
 *
 * The budget is declared once, in `vitest.config.ts`, so a spawning test
 * added later is covered the day it appears, with no list of files to keep.
 * It is pinned here as a literal: a value asserted against the config it came
 * from would move with it and pin nothing.
 */
describe('the unit suite budget', () => {
  it('gives every test 30s, about three times the slowest spawn measured under load', () => {
    expect(config.test?.testTimeout).toBe(30_000);
  });
});
