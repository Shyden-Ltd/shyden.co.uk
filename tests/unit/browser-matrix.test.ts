import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import config, { CONTENT_ONLY_SPECS } from '../../playwright.config';

/**
 * Five browser projects × every spec is not five times the signal.
 *
 * The suite runs 431 unique tests on chromium, firefox, webkit, mobile-chrome
 * and mobile-safari. For anything that renders, that is the point: a collapsed
 * nav wrapper once pushed the header links off-screen on every engine, and only
 * a real engine could have caught it.
 *
 * But some specs assert HTTP responses and DOM text — a sitemap's URLs, a
 * canonical tag, whether two words render touching. `textContent` is
 * spec-defined; those bytes are identical on every engine, so four of the five
 * runs cost time and return nothing the first run did not already prove.
 *
 * The line between the two is not a matter of taste, which is why it can be
 * tested: a spec is content-only exactly when it never drives the viewport.
 * The moment one does, it is engine-dependent and belongs on all five.
 */

const E2E = 'tests/e2e';
const read = (spec: string) => readFileSync(join(E2E, spec), 'utf8');
const projectNamed = (name: string) =>
  config.projects?.find((p) => p.name === name);

describe('the content-only project', () => {
  it('names specs that actually exist', () => {
    expect(CONTENT_ONLY_SPECS.length).toBeGreaterThan(0);
    const missing = CONTENT_ONLY_SPECS.filter((s) => !existsSync(join(E2E, s)));
    expect(missing, 'a renamed spec would silently stop being scoped').toEqual(
      [],
    );
  });

  it('does not simply list every spec, which would assert nothing', () => {
    // Without this, the rule below is satisfiable by scoping the whole suite
    // to one engine — the opposite of what it is for.
    const all = config.projects?.length ?? 0;
    expect(all).toBeGreaterThan(1);
    expect(
      CONTENT_ONLY_SPECS.length,
      'scoping every spec to one engine would delete the cross-engine gate',
    ).toBeLessThan(10);
  });

  it('holds only specs that never drive the viewport', () => {
    const engineDependent = CONTENT_ONLY_SPECS.filter((spec) => {
      const src = read(spec);
      return (
        src.includes('setViewportSize') || src.includes('@emulated-viewport')
      );
    });

    expect(
      engineDependent,
      'a spec that resizes is engine-dependent and must run on all five',
    ).toEqual([]);
  });

  it('runs those specs on exactly one project', () => {
    // Compare spec NAMES, not regex source: the pattern is escaped, so strip
    // the backslashes rather than re-deriving the escaping here and testing
    // this file's own idea of it.
    const ignored = (p: { testIgnore?: unknown }) =>
      String(p.testIgnore ?? '').replace(/\\/g, '');
    const runners = (config.projects ?? []).filter(
      (p) => !CONTENT_ONLY_SPECS.every((s) => ignored(p).includes(s)),
    );

    expect(runners.map((p) => p.name)).toEqual(['content']);
  });

  it('leaves every rendering engine still covering the rest of the suite', () => {
    const engines = (config.projects ?? [])
      .map((p) => p.name)
      .filter((n) => n !== 'content');

    expect(engines).toEqual([
      'chromium',
      'firefox',
      'webkit',
      'mobile-chrome',
      'mobile-safari',
    ]);
  });
});
