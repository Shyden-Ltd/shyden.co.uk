import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { nonEmpty } from '../source-files';

/**
 * The Node version this repo runs on is stated ONCE, and everything agrees.
 *
 * `.nvmrc` is the single source of truth. Every CI job reads it via
 * `node-version-file:`, so CI cannot drift. But `.nvmrc` is invisible to npm:
 * a contributor on volta, asdf, fnm-without-nvmrc, or a system Node installs
 * happily on Node 20 and the failure surfaces much later, at build or test
 * time, as a confusing runtime error instead of at install time as a clear
 * one. `engines` + `engine-strict` is what closes that hole (#31).
 *
 * Three ways the contract can rot, and this file guards all three:
 *
 * 1. `.nvmrc` is bumped and `engines` is not — npm now permits a Node that CI
 *    never exercises.
 * 2. `engines` is bumped and `.nvmrc` is not — CI now runs a Node that npm
 *    refuses to install on.
 * 3. A NEW workflow hardcodes `node-version: 20` instead of reading the file,
 *    quietly reintroducing the drift that `node-version-file:` removed. Found
 *    by the #31 sweep: all six existing references were already correct, but
 *    nothing stopped a seventh from being wrong.
 *
 * PARSED, NOT GREPPED. Every value below is read structurally — JSON.parse for
 * package.json, key=value for .npmrc, comment-stripped text for workflows.
 * A source-text guard is satisfied by the file's own documentation: the
 * dependabot sub-path guard passed for weeks against a COMMENT while no group
 * was configured at all (#23). Prose must never be able to satisfy an
 * assertion here.
 */

const WORKFLOWS = '.github/workflows';

/** `.nvmrc` as a major integer. `24`, `v24`, and trailing newlines all mean 24. */
const nvmrcMajor = (): number => {
  const raw = readFileSync('.nvmrc', 'utf8').trim().replace(/^v/i, '');
  const major = Number(raw.split('.')[0]);
  if (!Number.isInteger(major)) {
    throw new Error(
      `.nvmrc is not a parseable version: ${JSON.stringify(raw)}`,
    );
  }
  return major;
};

const packageJson = (): Record<string, unknown> =>
  JSON.parse(readFileSync('package.json', 'utf8'));

/**
 * The FLOOR major expressed by `engines.node`.
 *
 * Deliberately tolerant of how the range is written (`>=24`, `>= 24.0.0`,
 * `^24.0.0`) but strict that a floor exists at all: a range with no lower
 * bound states no contract and must not pass.
 */
const enginesFloorMajor = (): number => {
  const engines = packageJson().engines as { node?: string } | undefined;
  const range = engines?.node;
  if (typeof range !== 'string') {
    throw new Error('package.json has no engines.node');
  }
  const floor = range.match(/(?:>=|\^|~)?\s*(\d+)/);
  if (!floor) {
    throw new Error(`engines.node states no floor: ${JSON.stringify(range)}`);
  }
  return Number(floor[1]);
};

/** `.npmrc` parsed as key=value, comments and blank lines discarded. */
const npmrc = (): Map<string, string> => {
  const entries = new Map<string, string>();
  if (!existsSync('.npmrc')) return entries;
  for (const line of readFileSync('.npmrc', 'utf8').split('\n')) {
    const stripped = line.replace(/(^|\s)[#;].*$/, '').trim();
    if (!stripped.includes('=')) continue;
    const [key, ...rest] = stripped.split('=');
    entries.set(key.trim(), rest.join('=').trim());
  }
  return entries;
};

/** Workflow files with comments stripped, so prose cannot satisfy a guard. */
const workflowBodies = (): [string, string][] =>
  nonEmpty(
    readdirSync(WORKFLOWS).filter(
      (f) => f.endsWith('.yml') || f.endsWith('.yaml'),
    ),
    `workflow files in ${WORKFLOWS}`,
  ).map((f) => [
    f,
    readFileSync(join(WORKFLOWS, f), 'utf8')
      .split('\n')
      .map((line) => line.replace(/(^|\s)#.*$/, ''))
      .join('\n'),
  ]);

describe('the Node version contract is stated once and agreed everywhere', () => {
  it('declares engines.node in package.json', () => {
    expect(packageJson().engines).toBeDefined();
    expect(enginesFloorMajor()).toBeTypeOf('number');
  });

  it('enforces engines at install time via .npmrc engine-strict', () => {
    // Advisory `engines` only WARNS and lets the wrong Node through, which
    // defeats the point of declaring it. Operator decision on #31: strict.
    expect(npmrc().get('engine-strict')).toBe('true');
  });

  it('keeps engines.node and .nvmrc on the same major, in both directions', () => {
    // One assertion, two failure modes: bumping either file alone breaks it.
    expect(enginesFloorMajor()).toBe(nvmrcMajor());
  });

  it('reads Node from .nvmrc in every workflow that sets Node up', () => {
    for (const [file, body] of workflowBodies()) {
      const setups = body.match(/uses:\s*actions\/setup-node@/g)?.length ?? 0;
      const fromFile = body.match(/node-version-file:\s*\.nvmrc/g)?.length ?? 0;
      expect(
        fromFile,
        `${file}: ${setups} setup-node step(s) but ${fromFile} reading .nvmrc`,
      ).toBe(setups);
    }
  });

  it('never hardcodes a Node version in a workflow', () => {
    // `node-version-file:` does not match: the char after "node-version" is
    // "-", not ":". Only a literal `node-version: 20` trips this.
    for (const [file, body] of workflowBodies()) {
      expect(body, `${file} hardcodes a Node version`).not.toMatch(
        /node-version:\s*\S/,
      );
    }
  });
});
