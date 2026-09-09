import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
const runnableText = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

const workflowSteps = (name: string) => runnableText(workflow(name));

const allWorkflows = () =>
  readdirSync(WORKFLOWS)
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

  // Every page, both locales. The smoke checked the homepage and the
  // calculator only, and would have passed with the Classroom Group Creator
  // 404ing — through the entire release that rebuilt it.
  it('the prod smoke covers every page in both languages', () => {
    const prod = workflowSteps('release-prod.yml');
    for (const path of [
      '/glory-points',
      '/classroom-groups',
      '/id/',
      '/id/glory-points',
      '/id/classroom-groups',
    ]) {
      expect(prod, `prod smoke does not fetch ${path}`).toContain(path);
    }
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
    expect(readdirSync(WORKFLOWS)).not.toContain('release.yml');
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

    for (const file of readdirSync(WORKFLOWS)) {
      if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
      const raw = readFileSync(join(WORKFLOWS, file), 'utf8');
      for (const [, ref] of raw.matchAll(/\b([\w.-]+\.ya?ml)\b/g)) {
        if (!candidates(ref).some((p) => existsSync(p))) {
          dangling.push(`${file} → ${ref}`);
        }
      }
    }

    expect(dangling).toEqual([]);
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
    const bypasses = readdirSync(WORKFLOWS)
      .flatMap((file) =>
        workflow(file)
          .split('\n')
          .map((line) => ({ file, line })),
      )
      .filter(
        ({ line }) =>
          /\bplaywright\s+test\b/.test(line) && !line.includes('--config='),
      );

    expect(
      bypasses.map(({ file, line }) => `${file}: ${line.trim()}`),
      'a workflow running the default config outside `npm run test:e2e` is a ' +
        'full suite whose completeness nobody checks',
    ).toEqual([]);
  });
});
