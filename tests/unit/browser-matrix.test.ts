import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import config, {
  CONTENT_ONLY_SPECS,
  VISUAL_PROJECT,
} from '../../playwright.config';
import { searched } from '../source-files';
import { withoutTsComments } from './source-text';

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
describe('the content-only project', () => {
  it('names specs that actually exist', () => {
    const missing = CONTENT_ONLY_SPECS.filter((s) => !existsSync(join(E2E, s)));
    expect(
      searched(missing, {
        of: CONTENT_ONLY_SPECS,
        what: 'content-only specs',
      }),
      'a renamed spec would silently stop being scoped',
    ).toEqual([]);
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
      searched(engineDependent, {
        of: CONTENT_ONLY_SPECS,
        what: 'content-only specs',
      }),
      'a spec that resizes is engine-dependent and must run on all five',
    ).toEqual([]);
  });

  it('runs those specs on exactly one project', () => {
    // Compare spec NAMES, not regex source: the pattern is escaped, so strip
    // the backslashes rather than re-deriving the escaping here and testing
    // this file's own idea of it.
    //
    // And ask what a project actually MATCHES, not what its `testIgnore`
    // spells. Reading `testIgnore` alone made a project scoped the OTHER way
    // -- by `testMatch`, which is how `visual` is scoped -- look like it ran
    // everything (#33). A guard that infers coverage from one of the two
    // mechanisms is blind to the other.
    const matches = (
      p: { testIgnore?: unknown; testMatch?: unknown },
      spec: string,
    ) => {
      const ignored = String(p.testIgnore ?? '').replace(/\\/g, '');
      if (ignored.includes(spec)) return false;
      if (p.testMatch instanceof RegExp) return p.testMatch.test(spec);
      if (typeof p.testMatch === 'string') return spec.includes(p.testMatch);
      return true;
    };
    const runners = (config.projects ?? []).filter((p) =>
      CONTENT_ONLY_SPECS.some((s) => matches(p, s)),
    );

    expect(runners.map((p) => p.name)).toEqual(['content']);
  });

  it('leaves every rendering engine still covering the rest of the suite', () => {
    const engines = (config.projects ?? [])
      .map((p) => p.name)
      .filter((n) => n !== 'content' && n !== 'visual');

    expect(engines).toEqual([
      'chromium',
      'firefox',
      'webkit',
      'mobile-chrome',
      'mobile-safari',
    ]);
  });
});

/**
 * The visual-regression wiring (#33).
 *
 * A screenshot suite fails in two directions and only one of them is loud.
 * It can go red on a font-rendering difference nobody caused -- which gets it
 * switched off within a week -- or it can quietly stop asserting, which is
 * this repo's recurring defect in a new medium. Both are wiring, so both are
 * pinned here rather than left to whoever next edits the config.
 */
describe('the visual-regression project', () => {
  it('matches its own spec and nothing else', () => {
    expect(VISUAL_PROJECT.testMatch.test('visual.spec.ts')).toBe(true);
    expect(VISUAL_PROJECT.testMatch.test('tests/e2e/visual.spec.ts')).toBe(
      true,
    );
    // Not a spec that merely CONTAINS the word, and not the whole corpus.
    expect(VISUAL_PROJECT.testMatch.test('audiovisual.spec.ts')).toBe(false);
    expect(VISUAL_PROJECT.testMatch.test('seo.spec.ts')).toBe(false);
  });

  it('runs on exactly one engine, so one set of baselines exists', () => {
    expect(VISUAL_PROJECT.name).toBe('visual');
    expect(VISUAL_PROJECT.use.defaultBrowserType).toBe('chromium');
  });

  it('is excluded from every OTHER project', () => {
    // Measured, not assumed: with the spec present and this exclusion absent,
    // `playwright test --list` grows by 40 tests -- the same 8 claimed by all
    // five engines, demanding five sets of baselines for a question about our
    // CSS rather than about WebKit's.
    const others = (config.projects ?? []).filter((p) => p.name !== 'visual');
    expect(others.length).toBeGreaterThan(3);
    for (const project of others) {
      const ignored = String(project.testIgnore ?? '');
      const matched = project.testMatch;
      const claims =
        !ignored.includes('visual') &&
        (matched instanceof RegExp
          ? matched.test('visual.spec.ts')
          : matched === undefined);
      expect(claims, `${project.name} would claim visual.spec.ts`).toBe(false);
    }
  });

  it('states its flake policy rather than discovering it', () => {
    const shot = config.expect?.toHaveScreenshot;
    expect(shot, 'no screenshot policy at all').toBeDefined();
    // ZERO, and pinned exactly rather than to a range (#134).
    //
    // A range was the original shape here, guarding against the value being
    // left unset -- "a policy nobody chose". The range itself then became the
    // policy nobody chose: 0.002 is a fraction of the IMAGE, and on a
    // full-page 390x2250 screenshot it permitted 1,755 differing pixels,
    // while a 1px border around a button is ~456. #133 recoloured THIRTEEN
    // control borders and seven of eight screenshots reported green.
    //
    // Zero is safe because the render is deterministic, and that was
    // measured: two consecutive `--update-snapshots=all` runs in the pinned
    // container rewrote all eight baselines byte-identically. Proven in both
    // directions on one 1px border -- red on exactly the four screenshots
    // containing it at 0, entirely green on the same mutation at 0.002.
    //
    // `toBe(0)` and not `toBeLessThan`: `undefined` is not 0, and an absent
    // ratio applies no limit at all.
    expect(shot?.maxDiffPixelRatio).toBe(0);
    // The per-pixel half. Without it the ratio bounds how many pixels may
    // differ while each one differs almost arbitrarily -- measured: at the
    // default 0.2, recolouring the accent green-to-blue changed NO screenshot.
    expect(shot?.threshold).toBeGreaterThan(0);
    expect(shot?.threshold).toBeLessThanOrEqual(0.1);
    expect(shot?.animations).toBe('disabled');
    expect(shot?.caret).toBe('hide');
    // Pins the device-pixel ratio, so a HiDPI runner and a normal one produce
    // comparable images rather than a doubled one.
    expect(shot?.scale).toBe('css');
  });

  it('keeps the platform in the baseline filename', () => {
    // macOS and Linux rasterise text differently, so a laptop-made baseline
    // is not the one CI compares against. Spelling the platform into the path
    // makes that visible in a diff instead of surfacing as a missing snapshot
    // on a runner nobody was watching.
    expect(config.snapshotPathTemplate).toContain('{platform}');
  });

  it('regenerates with `all`, never Playwright’s `changed` preset', () => {
    // `--update-snapshots` BARE is not "update everything": Playwright 1.63
    // documents `preset: "changed"`, which rewrites only baselines whose
    // comparison FAILED and leaves a stale-but-passing one in place -- exactly
    // the drift #134 exists to stop. Every ticket that regenerates asks for
    // `all`, and the zero-allowance evidence above was gathered with `all` by
    // hand, through a flag the repo's own command did not pass (#152).
    //
    // Comment-stripped: visual.mjs's prose names this flag repeatedly, so a
    // raw read is satisfied by the documentation describing the bug.
    const runner = withoutTsComments(
      readFileSync('scripts/visual.mjs', 'utf8'),
    );

    expect(runner, 'the update path must name its mode').toContain(
      "'--update-snapshots=all'",
    );
    expect(runner, 'a bare flag silently means `changed`').not.toMatch(
      /'--update-snapshots'/,
    );
  });

  it('refuses to write a baseline nobody asked for', () => {
    // Playwright 1.63 defaults `updateSnapshots` to 'missing'
    // (`runner/index.js:583`). Under that default a run whose baseline is
    // absent WRITES the PNG first and only then fails on a soft error, so
    // nothing is silently accepted -- but CI produces a baseline no one
    // reviewed, and the only guard on that behaviour watches the
    // `--update-snapshots` FLAG in the workflow. The config default is a
    // second door into the same room, and it was unwatched.
    //
    // 'none' refuses outright and writes nothing, and it is the only value
    // for which `applySuggestedRebaselines` returns early rather than being
    // willing to rewrite expectations during an ordinary run.
    expect(config.updateSnapshots).toBe('none');
  });
});
