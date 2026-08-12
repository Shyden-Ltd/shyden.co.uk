import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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

  // TRANSITIONAL. `release.yml` (deploy-before-merge) is still here, and only
  // because the PR introducing its replacements has to be mergeable: branch
  // protection requires `prod-verified`, and until the new pair is on the
  // default branch this is the only thing that posts it.
  //
  // What must hold WHILE it survives is that it cannot fire on its own --
  // dispatch only, no `push:` trigger -- so two pipelines can never race to
  // deploy prod from the same event. The follow-up PR deletes it and replaces
  // this test with the assertion that it is gone.
  it('the retired workflow cannot fire on its own', () => {
    const names = readdirSync(WORKFLOWS);
    if (!names.includes('release.yml')) return; // already deleted: nothing to guard
    const old = workflowSteps('release.yml');
    expect(old).toContain('workflow_dispatch');
    expect(old, 'the retired workflow must not trigger on push').not.toMatch(
      /on:[\s\S]*?push:/,
    );
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
});
