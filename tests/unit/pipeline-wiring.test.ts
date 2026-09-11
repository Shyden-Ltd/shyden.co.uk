import { describe, it, expect } from 'vitest';
import { LOCALES, DEFAULT_LOCALE, localisePath } from '../../src/lib/i18n';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { withoutCommentLines, withoutTsComments } from './source-text';
import { nonEmpty, searched } from '../source-files';
import { VISUAL_PROJECT } from '../../playwright.config';
import { sitePaths } from '../site-pages';

/**
 * The deploy pipeline is wired to the things it claims to run.
 *
 * This file exists because of a real, shipped gap: `tests/dev/dev-sanity.spec.ts`
 * and `playwright.dev.config.ts` were both written to verify the deployed dev
 * site — nine tests, both locales, the tool actually shuffling students — and
 * **nothing in CI ever referenced either of them**. "Deployed to dev" meant
 * only that `wrangler` had not errored. A dev deploy serving a blank page
 * would have gone green.
 *
 * A test suite nobody runs is worse than no suite: it reads as coverage. The
 * checks below are cheap, and each one names a way that could happen again.
 *
 * SOURCE TEXT, not YAML parsing: no YAML parser is available here and none is
 * worth adding for this ("no new npm dependencies"). The assertions are about
 * whether a filename or a job name APPEARS, which text answers exactly.
 */

const WORKFLOWS = '.github/workflows';
const workflow = (name: string) => readFileSync(join(WORKFLOWS, name), 'utf8');

/**
 * A workflow's text with its COMMENT LINES REMOVED.
 *
 * Every check below asks whether the pipeline DOES something. A `#` line
 * saying it does is prose, and prose is exactly what these files are full
 * of. Found by mutation: the first version of the dev-sanity check searched
 * raw text, and pointing the run step at a different config left it green --
 * because this file's own comment explaining the fix still contained the
 * filename it was looking for.
 */
const runnableText = (text: string) => withoutCommentLines(text);

const workflowSteps = (name: string) => runnableText(workflow(name));

/**
 * The workflow filenames, proved non-empty (#84).
 *
 * Three guards in this file assert ABSENCE over this list -- `release.yml`
 * is gone, no dangling workflow reference, no default-config bypass -- and
 * one empty read satisfies all three at once.
 */
const workflowFileNames = (): string[] =>
  nonEmpty(readdirSync(WORKFLOWS), `workflow files in ${WORKFLOWS}`);

const allWorkflows = () =>
  workflowFileNames()
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({
      name: f,
      text: runnableText(readFileSync(join(WORKFLOWS, f), 'utf8')),
    }));

describe('the deploy pipeline runs what it claims to', () => {
  it('some workflow actually runs the dev sanity suite', () => {
    const runners = allWorkflows().filter((w) =>
      w.text.includes('--config=playwright.dev.config.ts'),
    );
    expect(
      runners.map((w) => w.name),
      'playwright.dev.config.ts is referenced by no workflow — the dev site is deployed and never verified, which is exactly the gap this file was written for',
    ).not.toEqual([]);
  });

  it('the dev sanity suite exists and is more than a stub', () => {
    const spec = readFileSync('tests/dev/dev-sanity.spec.ts', 'utf8');
    const tests = spec.match(/\btest\(/g) ?? [];
    // A guard that only checked the workflow REFERENCES the config would pass
    // against an emptied suite.
    expect(tests.length).toBeGreaterThan(3);
  });

  it('the dev deploy is gated on the tests passing first', () => {
    const dev = workflowSteps('release-dev.yml');
    expect(dev).toMatch(/deploy-dev:[\s\S]*?needs:\s*test/);
    expect(dev).toMatch(/verify-dev:[\s\S]*?needs:\s*deploy-dev/);
  });

  // The merge gate. `dev-verified` has to be POSTED by something, or branch
  // protection requiring it blocks every PR forever.
  it('dev-verified is posted by the dev workflow', () => {
    const dev = workflowSteps('release-dev.yml');
    expect(dev).toContain('context=dev-verified');
    expect(dev).toContain('statuses: write');
  });

  it('prod-verified is posted by the prod workflow', () => {
    const prod = workflowSteps('release-prod.yml');
    expect(prod).toContain('context=prod-verified');
    expect(prod).toContain('statuses: write');
  });

  // Prod must deploy from `main`, never from a branch. Deploying before the
  // merge means production runs a commit that is on no permanent ref, and
  // `main` stops describing what is live.
  it('prod deploys from main, not from a dispatched branch alone', () => {
    const prod = workflowSteps('release-prod.yml');
    expect(prod).toMatch(/on:[\s\S]*?push:[\s\S]*?branches:\s*\[main\]/);
  });

  it('prod is behind the approval-gated environment', () => {
    const prod = workflowSteps('release-prod.yml');
    expect(prod).toMatch(/environment:\s*\n\s*name:\s*prod/);
  });

  // The placeholder guard cost two false-failed releases before it matched the
  // placeholder SHAPE rather than a bare `[[`, and before it skipped binaries.
  // Both fixes live in one line, and losing either is a release blocked for
  // nothing.
  it('the prod placeholder guard still skips binaries and matches a shape', () => {
    const prod = workflowSteps('release-prod.yml');
    expect(prod).toContain("grep -rnIE '\\[\\[[^]]{1,60}\\]\\]' dist/");
  });

  // Every page, every locale. The smoke checked the homepage and the
  // calculator only, and would have passed with the Classroom Group Creator
  // 404ing — through the entire release that rebuilt it.
  //
  // DERIVED since #21 Stage 4, from LOCALES and from the routes on disk. The
  // hand-written list this replaces named five paths and was correct for two
  // locales; it would have gone on passing while `/zh/glory-points` 404'd
  // through a whole release, because a list cannot check that it is still the
  // whole list.
  //
  // An EXACT SET comparison against the paths the loop actually iterates, not
  // `prod.includes(path)`. A substring check here is worse than no check: the
  // English `/glory-points` is a substring of the Indonesian
  // `/id/glory-points`, so the English assertion passes on the Indonesian
  // path, and mutating a path to `/id/glory-pointsXX` leaves it green. That
  // vacuity was real and was caught by mutating this guard, not by reading it.
  // Set equality also catches a path the routes no longer serve.
  it('the prod smoke covers every page in every locale', () => {
    const prod = workflowSteps('release-prod.yml');
    const loop = /for path in ([^;]+); do/.exec(prod);
    expect(loop, 'the prod smoke no longer loops over a path list').not.toBe(
      null,
    );
    const fetched = new Set(loop![1].trim().split(/\s+/));

    // The default locale's homepage is fetched on its own as `$BASE/`,
    // because the smoke greps that response for the footer and the ShyTalk
    // link. Everything else goes through the loop.
    const home = localisePath('/', DEFAULT_LOCALE);
    expect(prod, 'the homepage is no longer fetched').toContain('"$BASE/"');

    const expected = new Set<string>();
    for (const locale of LOCALES) {
      for (const page of sitePaths()) {
        const path = localisePath(page, locale);
        if (path !== home) expected.add(path);
      }
    }
    expect([...fetched].sort()).toEqual([...expected].sort());
  });

  // The deploy-before-merge workflow is GONE. It survived exactly one merge
  // -- the one that introduced its replacements, which could not otherwise
  // earn the `prod-verified` status branch protection then required. That
  // status is no longer required: the gate is `dev-verified`, posted before
  // the merge by release-dev.yml.
  //
  // Two pipelines both able to deploy prod, disagreeing about when, is worse
  // than either.
  it('the deploy-before-merge workflow is gone', () => {
    expect(workflowFileNames()).not.toContain('release.yml');
  });

  // …and exactly one workflow deploys prod on a PUSH, so a merge can never
  // start two prod deployments.
  it('only one workflow deploys prod on a push', () => {
    const pushers = allWorkflows().filter(
      (w) =>
        /on:[\s\S]*?push:/.test(w.text) &&
        w.text.includes('shyden-site --branch'),
    );
    expect(pushers.map((w) => w.name)).toEqual(['release-prod.yml']);
  });

  // ---- the develop branching model ---------------------------------------
  //
  // `release-dev.yml` was DISPATCH-only, which made the dev deploy — and so the
  // `dev-verified` status gating `main` — a step someone had to remember. The
  // header comment gave a real reason: every PR branch deploying to one shared
  // dev environment means the last push wins, and `dev-verified` then describes
  // whichever branch happened to land last.
  //
  // An integration branch removes that competition by construction rather than
  // by discipline: exactly one branch deploys to dev, so "last push wins" is no
  // longer ambiguous — dev always shows develop's head, which is what it should
  // show.
  it('dev deploys automatically when develop moves', () => {
    const dev = workflowSteps('release-dev.yml');
    expect(dev).toMatch(/on:[\s\S]*?push:[\s\S]*?branches:\s*\[develop\]/);
  });

  // The dispatch escape hatch stays: deploying an arbitrary branch to dev is a
  // real capability worth keeping.
  it('the dispatch escape hatch survives', () => {
    const dev = workflowSteps('release-dev.yml');
    expect(dev).toMatch(/workflow_dispatch:/);
  });

  // …but an UNGUARDED dispatch would hand any feature branch a `dev-verified`
  // status, which is exactly what branch protection on `main` requires. That
  // branch could then open a PR straight into `main` and satisfy the gate
  // without ever passing through `develop` — the bypass this whole model
  // exists to prevent. Deploy and test on any ref; publish the STATUS only for
  // develop.
  it('dev-verified is only posted for develop', () => {
    const dev = workflowSteps('release-dev.yml');
    const post = dev.indexOf('/statuses/');
    expect(post, 'no dev-verified status step found').toBeGreaterThan(-1);
    const step = dev.slice(Math.max(0, post - 900), post);
    expect(step).toMatch(/if:.*github\.ref_name\s*==\s*'develop'/);
  });

  // `ci.yml` had a bare `pull_request:` — every PR, whatever its base. That
  // happened to be correct while `main` was the only long-lived branch, and
  // silently stays correct here, which is the problem: nothing records that
  // `build-and-test` is required on BOTH bases. Name them, so removing one is
  // a red test rather than a quiet hole in the gate.
  it('CI runs on pull requests into develop and main', () => {
    const ci = workflowSteps('ci.yml');
    expect(ci).toMatch(/pull_request:[\s\S]*?branches:\s*\[develop,\s*main\]/);
  });

  // RAW text on purpose — the opposite of every other check in this file.
  //
  // Elsewhere a comment claiming the pipeline does something is prose to be
  // stripped. Here the comment IS the thing under test: `ci.yml`'s header
  // explained itself in terms of `deploy.yml`, a workflow deleted with the
  // deploy-before-merge pipeline. A reader trusting that comment goes looking
  // for a file that has not existed for releases.
  //
  // Guards the CLASS rather than that one instance: any workflow naming any
  // workflow file that is not there fails, including the next one.
  it('no workflow names a workflow file that does not exist', () => {
    const candidates = (name: string) => [
      join(WORKFLOWS, name),
      join('.github', name),
      name,
    ];
    const dangling: string[] = [];

    const workflows = workflowFileNames();
    for (const file of workflows) {
      if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
      const raw = readFileSync(join(WORKFLOWS, file), 'utf8');
      for (const [, ref] of raw.matchAll(/\b([\w.-]+\.ya?ml)\b/g)) {
        if (!candidates(ref).some((p) => existsSync(p))) {
          dangling.push(`${file} → ${ref}`);
        }
      }
    }

    expect(
      searched(dangling, { of: workflows, what: 'workflow files' }),
    ).toEqual([]);
  });

  // Production was verified by `curl`: status codes and grepping fetched HTML.
  // That is a TEXT assertion, and this repo has already shipped a bug for a
  // full release that no text assertion can see — `display: flex` ate authored
  // whitespace while `textContent` still contained it, so every text-based
  // check passed. curl also cannot tell whether the CSS loaded, whether the
  // calculators' JS ran, or whether the page scrolls sideways at 320px.
  //
  // `prod-verified` should mean a browser rendered production, so the browser
  // run has to come BEFORE the status is posted, not beside it.
  it('prod-verified is gated on a real browser run, not a curl smoke', () => {
    const prod = workflowSteps('release-prod.yml');
    const browser = prod.indexOf('playwright.prod.config');
    const status = prod.indexOf('/statuses/');

    expect(browser, 'prod never runs playwright.prod.config').toBeGreaterThan(
      -1,
    );
    expect(status, 'prod never posts a commit status').toBeGreaterThan(-1);
    expect(
      browser,
      'prod-verified is posted before the browser run that should gate it',
    ).toBeLessThan(status);
  });

  /**
   * Production is verified against the host REAL VISITORS GET.
   *
   * `shyden-site.pages.dev` is the deployment alias, and it is Basic-auth
   * locked (401) while the apex is public (200). Verifying the alias means
   * `prod-verified` attests that a password-protected staging URL rendered —
   * it says nothing about whether shyden.co.uk resolves, presents a valid
   * certificate, or routes to this project at all. Any of those breaking
   * leaves the site dark for everyone while the release goes green.
   *
   * Two tests because there are two independent ways to regress: the config
   * default drifting back, and the workflow overriding a correct default.
   * A fix to only one of them changes nothing.
   */
  it('the prod browser run defaults to the public production domain', async () => {
    delete process.env.WEB_BASE_URL;
    const config = (await import('../../playwright.prod.config')).default;

    expect(config.use?.baseURL).toBe('https://shyden.co.uk');
  });

  it('prod verification targets the public domain, not the deployment alias', () => {
    const prod = workflowSteps('release-prod.yml');

    expect(
      prod,
      'a prod check still runs against the Basic-auth-locked deployment alias',
    ).not.toMatch(/shyden-site\.pages\.dev/);
    expect(prod, 'the curl smoke does not target the apex').toMatch(
      /BASE="https:\/\/shyden\.co\.uk"/,
    );
    expect(prod, 'the browser run does not target the apex').toMatch(
      /WEB_BASE_URL:\s*https:\/\/shyden\.co\.uk/,
    );
  });

  it('the prod sanity suite exists and is more than a stub', () => {
    const spec = readFileSync('tests/prod/prod-sanity.spec.ts', 'utf8');
    expect(spec.match(/\bit\(|\btest\(/g)?.length ?? 0).toBeGreaterThan(3);
  });
});

/**
 * The e2e reconciliation guard is what `npm run test:e2e` actually runs.
 *
 * The guard (scripts/test-e2e.mjs) compares the tests a run accounted for
 * against the tests `playwright test --list` enumerates, and refuses a green
 * summary over a partial run. It protects nothing if the pipeline calls
 * Playwright directly and walks straight past it — which is the easiest change
 * in the world to make by accident, and produces no visible symptom, because
 * the suite still passes. It just stops being checked.
 */
describe('the e2e reconciliation guard cannot be bypassed', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  it('is what `npm run test:e2e` invokes', () => {
    expect(
      pkg.scripts['test:e2e'],
      'pointing this back at `playwright test` silently removes the guard ' +
        'without failing a single test',
    ).toContain('scripts/test-e2e.mjs');
  });

  it('names a script that exists', () => {
    expect(existsSync('scripts/test-e2e.mjs')).toBe(true);
  });

  it('is not bypassed by any workflow calling Playwright directly', () => {
    // The deployed-site smoke suites legitimately call Playwright with their
    // own config (playwright.dev/prod.config.ts) and are not the full corpus.
    // Anything invoking the DEFAULT config, though, is the full suite and must
    // come through the guard.
    //
    // One exception, and it is DERIVED rather than written down: the visual
    // project (#33) is not part of the default corpus at all -- it exists
    // only under `VISUAL=1`, so `test-e2e.mjs` never enumerates it and there
    // is nothing for the reconciliation to reconcile. Naming it here by
    // importing it means renaming the project moves this exemption with it,
    // instead of leaving a stale allowance behind. Playwright supplies the
    // liveness itself: an unknown project, or one matching no tests, is a
    // hard error rather than a green empty run.
    //
    // `--project=` alone is NOT enough to be exempt. `--project=chromium`
    // would run a fifth of the real corpus with nobody counting it.
    const subset = new RegExp(`--project=${VISUAL_PROJECT.name}\\b`);
    const bypasses = workflowFileNames()
      .flatMap((file) =>
        workflow(file)
          .split('\n')
          .map((line) => ({ file, line })),
      )
      .filter(
        ({ line }) =>
          /\bplaywright\s+test\b/.test(line) &&
          !line.includes('--config=') &&
          !subset.test(line),
      );

    expect(
      searched(
        bypasses.map(({ file, line }) => `${file}: ${line.trim()}`),
        { of: workflowFileNames(), what: 'workflow files' },
      ),
      'a workflow running the default config outside `npm run test:e2e` is a ' +
        'full suite whose completeness nobody checks',
    ).toEqual([]);
  });
});

/**
 * The visual-regression job, and the one flag that would hollow it out (#33).
 *
 * A screenshot suite that can rewrite its own baseline asserts nothing, and
 * the flag that does it is three words long. This is the same family as every
 * other guard here: the pipeline is only as good as the thing nobody has
 * quietly edited.
 *
 * Read over COMMENT-STRIPPED text, and in the inverse direction from the
 * usual reason. These are ABSENCE assertions, so a comment naming the flag
 * makes them go RED on a workflow that is correct -- and `ci.yml`'s own
 * comment explains that it never passes `--update-snapshots`, which would
 * fail this guard on the sentence promising the thing it checks for.
 */
describe('the visual-regression job cannot rewrite what it checks', () => {
  it('never passes --update-snapshots, in any workflow', () => {
    // `workflowFileNames` refuses an empty read (#84), so this loop cannot
    // run over nothing and report success.
    for (const name of workflowFileNames()) {
      if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
      expect(
        withoutCommentLines(workflow(name), '#'),
        `${name} can rewrite the baseline it is checking against`,
      ).not.toContain('--update-snapshots');
    }
  });

  it('pins the same image the baselines are captured in', () => {
    // Written down once. A browser bundle from a different release than the
    // library driving it fails in ways neither one reports clearly, and the
    // capture script derives the image from this same version rather than
    // repeating it.
    const { version } = JSON.parse(
      readFileSync('node_modules/@playwright/test/package.json', 'utf8'),
    ) as { version: string };
    expect(withoutCommentLines(workflow('ci.yml'), '#')).toContain(
      `image: mcr.microsoft.com/playwright:v${version}-noble`,
    );
  });

  it('runs the visual project, with the switch that declares it', () => {
    const ci = withoutCommentLines(workflow('ci.yml'), '#');
    expect(ci).toMatch(/npx playwright test --project=visual\s*$/m);
    // Without it the project is not declared at all, and `--project=visual`
    // is a hard Playwright error rather than an empty, green run.
    expect(ci).toMatch(/VISUAL:\s*'1'/);
  });
});

/**
 * A failure capture that catches nothing must not report success (#131).
 *
 * `if-no-files-found: ignore` is the one value that makes an
 * `actions/upload-artifact` step go GREEN having preserved nothing. Every
 * one of these steps runs under `if: failure()` — they exist solely to keep
 * the only evidence a red run ever produces — so a silent empty capture is
 * the vacuous-guard pattern living inside the evidence path itself. Verified
 * 2026-09-10: that path had fired exactly ONCE in this repository's history,
 * and nothing would have said so if it had fired and caught nothing.
 *
 * `warn` over `error` deliberately: the job is already red when these run,
 * and a job that died in `test:unit` before Playwright created
 * `test-results/` is legitimately empty. An annotation says so; a second red
 * X would blame the capture for the unit failure.
 */
type ArtifactStep = {
  workflow: string;
  step: string;
  /** The declared `if-no-files-found`, or `null` when the key is absent. */
  declared: string | null;
};

/**
 * Every `actions/upload-artifact` step in one workflow's text.
 *
 * SOURCE TEXT, not YAML parsing, for the reason given at the top of this
 * file. The walk is indentation-scoped: from the `uses:` line, keys belong to
 * that step until a line appears at or left of that indentation, which is
 * where the next step or the next block begins. Taking the file's first
 * `if-no-files-found` instead would let step three inherit step two's answer.
 */
const artifactStepsIn = (workflow: string, text: string): ArtifactStep[] => {
  const lines = text.split('\n');
  const steps: ArtifactStep[] = [];
  let step = '(unnamed step)';

  lines.forEach((line, i) => {
    const named = line.match(/^\s*-\s+name:\s*(.+?)\s*$/);
    if (named) step = named[1];
    if (!/^\s*uses:\s*actions\/upload-artifact@/.test(line)) return;

    const indent = line.search(/\S/);
    let declared: string | null = null;
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j];
      if (next.trim() === '') continue;
      if (next.search(/\S/) < indent) break;
      const value = next.match(/^\s*if-no-files-found:\s*(\S+)/);
      if (value) {
        declared = value[1].replace(/^['"]|['"]$/g, '');
        break;
      }
    }
    steps.push({ workflow, step, declared });
  });

  return steps;
};

/** Derived from disk, never from a list: the handover's list said two (#131). */
const allArtifactSteps = (): ArtifactStep[] =>
  nonEmpty(
    allWorkflows().flatMap(({ name, text }) => artifactStepsIn(name, text)),
    'upload-artifact steps in .github/workflows',
  );

const artifactSite = (s: ArtifactStep) => `${s.workflow} → ${s.step}`;

describe('a failure capture cannot succeed having caught nothing', () => {
  it('tells ignore, a quoted value and an absent key apart', () => {
    const fixture = [
      'jobs:',
      '  test:',
      '    steps:',
      '      - name: silent',
      '        uses: actions/upload-artifact@abc # v7.0.1',
      '        with:',
      '          if-no-files-found: ignore',
      '      - name: loud',
      '        uses: actions/upload-artifact@abc # v7.0.1',
      '        with:',
      "          if-no-files-found: 'warn'",
      '      - name: silent by default',
      '        uses: actions/upload-artifact@abc # v7.0.1',
      '        with:',
      '          path: test-results/',
      '      - name: a later step is not this one',
      '        run: echo if-no-files-found: ignore',
      '',
    ].join('\n');

    expect(artifactStepsIn('fixture.yml', fixture)).toEqual([
      { workflow: 'fixture.yml', step: 'silent', declared: 'ignore' },
      { workflow: 'fixture.yml', step: 'loud', declared: 'warn' },
      { workflow: 'fixture.yml', step: 'silent by default', declared: null },
    ]);
  });

  it('no artifact capture in any workflow is set to ignore', () => {
    const steps = allArtifactSteps();
    const silent = steps
      .filter((s) => s.declared === 'ignore')
      .map(artifactSite);

    expect(
      searched(silent, { of: steps, what: 'upload-artifact steps' }),
    ).toEqual([]);
  });

  it('every artifact capture states what an empty capture means', () => {
    const steps = allArtifactSteps();
    const undeclared = steps
      .filter((s) => s.declared === null)
      .map(artifactSite);

    expect(
      searched(undeclared, { of: steps, what: 'upload-artifact steps' }),
    ).toEqual([]);
  });
});

/**
 * A server Playwright cannot supervise is a suite that cannot run.
 *
 * Astro 7.3 detects that an AI agent is running the command -- `isRunByAgent()`
 * in `astro/dist/cli/agent.js`, via `am-i-vibing` -- and DAEMONISES `astro dev`
 * and `astro preview` without being asked. `playwright.config.ts` supervises
 * the process it spawned, so the fork-and-exit reads as
 * "Process from config.webServer exited early" and the whole run aborts at
 * zero tests, while the detached server keeps port 4321. It binds IPv6 only,
 * so `lsof -ti tcp:4321` reports the port free and the next run fails the same
 * way (#139).
 *
 * The opt-out is badly named: `ASTRO_PREVIEW_BACKGROUND` is what the parent
 * sets ON the daemon child, so its presence means "detection already ran, do
 * not re-detect" and therefore keeps the server in the FOREGROUND.
 */
describe('the e2e server is supervised, not handed to a daemon', () => {
  /** `astro dev` and `astro preview` each have their OWN opt-out variable. */
  const SERVER = /\bastro\s+(dev|preview)\b/;

  const serverScripts = (): [string, string][] =>
    Object.entries(
      JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {},
    ).filter(([, command]) => SERVER.test(command as string)) as [
      string,
      string,
    ][];

  it('every astro server script opts out of the agent auto-background', () => {
    // Derived from package.json, never a list: a third server script added
    // next year is covered without anybody remembering this file exists.
    const scripts = serverScripts();
    const unguarded = scripts.filter(([, command]) => {
      const mode = SERVER.exec(command)![1].toUpperCase();
      return !command.includes(`ASTRO_${mode}_BACKGROUND=`);
    });

    expect(
      searched(unguarded, {
        of: scripts.map(([, command]) => command),
        what: 'astro server scripts',
      }),
      'an auto-backgrounded server exits early under Playwright and orphans the port',
    ).toEqual([]);
  });

  it('the opt-out it relies on still exists in the installed Astro', () => {
    // The seam, not our side of it. An Astro upgrade that renames or drops
    // this check must turn THIS red, rather than the suite starting to abort
    // at zero tests with a message about a web server.
    for (const mode of ['dev', 'preview']) {
      // STRIPPED, like every other source-text assertion here: a match landing
      // in a comment would report an opt-out Astro had already dropped.
      const cli = withoutTsComments(
        readFileSync(`node_modules/astro/dist/cli/${mode}/index.js`, 'utf8'),
      );
      expect(
        cli,
        `astro ${mode} no longer honours ASTRO_${mode.toUpperCase()}_BACKGROUND`,
      ).toContain(`!process.env.ASTRO_${mode.toUpperCase()}_BACKGROUND`);
    }
  });
});
