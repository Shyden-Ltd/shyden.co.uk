import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { withoutYamlComments, withoutYamlQuotes } from './source-text';
import { nonEmpty, searched } from '../source-files';

/**
 * The CI supply chain is pinned, and something keeps it current.
 *
 * Two failure modes, and they pull in opposite directions:
 *
 * 1. A MUTABLE TAG is not a version. `actions/checkout@v4` resolves to
 *    whatever the tag points at today, and a tag can be repointed by anyone
 *    who can push to that repo. A compromised or coerced maintainer moves the
 *    tag and every workflow in this repo runs their code, with our secrets,
 *    on the next push. Pinning to a full commit SHA is the only form of this
 *    reference that cannot be changed underneath us.
 *
 * 2. A PIN THAT NOBODY BUMPS rots. shyden.co.uk sat three majors behind on
 *    both of its actions with no mechanism to notice. So the SHA is only half
 *    the control — Dependabot is the other half, and the version comment
 *    beside each SHA is what makes a bump reviewable by a human instead of an
 *    opaque hex swap.
 *
 * SOURCE TEXT, not YAML parsing: no YAML parser is available here and none is
 * worth adding ("no new npm dependencies"), matching pipeline-wiring.test.ts.
 */

const WORKFLOWS = '.github/workflows';
const DEPENDABOT = '.github/dependabot.yml';

const workflowFiles = () =>
  nonEmpty(
    readdirSync(WORKFLOWS).filter(
      (f) => f.endsWith('.yml') || f.endsWith('.yaml'),
    ),
    `workflow files in ${WORKFLOWS}`,
  );

/**
 * Every `uses:` naming a THIRD-PARTY action.
 *
 * Local references (`./.github/actions/x`, `./.github/workflows/y.yml`) are
 * excluded deliberately: they are this repo's own code, already reviewed at
 * the commit that introduced them, and have no upstream SHA to pin.
 */
const externalUses = () =>
  workflowFiles().flatMap((file) =>
    readFileSync(join(WORKFLOWS, file), 'utf8')
      .split('\n')
      .map((text, i) => ({ where: `${file}:${i + 1}`, text: text.trim() }))
      .filter(({ text }) => /^(-\s*)?uses:\s*[^.\s]/.test(text)),
  );

const dependabot = () =>
  existsSync(DEPENDABOT) ? readFileSync(DEPENDABOT, 'utf8') : '';

/**
 * The config with its YAML comments removed. ASSERT ON THIS, never on the
 * raw text.
 *
 * These checks read source text, and this file DOCUMENTS the very patterns it
 * is checked for — the sub-path note spells out `patterns: ["actions/cache*"]`
 * verbatim. Matched against the raw text, that prose SATISFIES the sub-path
 * guard on its own: the repo could reference `actions/cache` at three
 * sub-paths with no group whatsoever and still go green, and the position of
 * the comment (above the groups) makes the ordering check pass too. Caught by
 * mutation while adding that ordering check.
 */
const configBody = () => withoutYamlComments(dependabot());

/**
 * The config split into one text block per `package-ecosystem:` entry, so a
 * group's position is judged against the catch-all of ITS OWN ecosystem
 * rather than whichever one happens to appear first in the file.
 */
const ecosystemBlocks = () =>
  configBody()
    .split(/(?=^\s*-\s*package-ecosystem:)/m)
    .filter((block) => /package-ecosystem:/.test(block));

/**
 * Every `owner/repo` referenced at MORE THAN ONE sub-path, with the distinct
 * refs seen for it — the ones Dependabot would otherwise bump one sub-path at
 * a time, leaving the siblings behind.
 */
const subPathRepos = (): [string, Set<string>][] => {
  const refs = new Map<string, Set<string>>();
  for (const { text } of externalUses()) {
    const ref = text.match(/uses:\s*([^@\s]+)@/)?.[1];
    if (!ref) continue;
    const [owner, repo] = ref.split('/');
    const key = `${owner}/${repo}`;
    if (!refs.has(key)) refs.set(key, new Set());
    refs.get(key)!.add(ref);
  }
  return [...refs.entries()].filter(([, seen]) => seen.size > 1);
};

describe('the CI supply chain is pinned', () => {
  it('there is something to check', () => {
    expect(externalUses().length).toBeGreaterThan(0);
  });

  it('every third-party action is pinned to a full commit SHA', () => {
    const unpinned = externalUses()
      .filter(({ text }) => !/@[0-9a-f]{40}(?=\s|$)/.test(text))
      .map(({ where, text }) => `${where} ${text}`);

    expect(
      searched(unpinned, { of: externalUses(), what: 'third-party actions' }),
      'a mutable tag can be repointed under us',
    ).toEqual([]);
  });

  it('every pinned action names the version its SHA resolves to', () => {
    const opaque = externalUses()
      .filter(({ text }) => !/@[0-9a-f]{40}\s+#\s*v\d/.test(text))
      .map(({ where, text }) => `${where} ${text}`);

    expect(
      searched(opaque, { of: externalUses(), what: 'third-party actions' }),
      'a bare SHA bump is unreviewable by a human',
    ).toEqual([]);
  });
});

describe('Dependabot keeps the pins from rotting', () => {
  /**
   * ShyTalk shipped this bug, so it is guarded here before it can happen.
   *
   * Dependabot treats `actions/cache`, `actions/cache/restore` and
   * `actions/cache/save` as three SEPARATE dependencies. Ungrouped, they
   * arrive as three PRs, each moving one sub-path's SHA while its siblings
   * lag — a one-SHA-per-repo violation by construction, and for codeql-action
   * a runtime version mismatch ("Loaded a configuration file for version
   * '4.36.3', but running version '4.37.1'"). ShyTalk's SHY-0226.
   *
   * Dormant today: this repo uses no sub-path actions. It fails the moment
   * one is added without a matching Dependabot group. Verified by mutation,
   * not by watching it pass.
   */
  it('an action repo used at more than one sub-path is grouped into one PR', () => {
    const config = configBody();
    const ungrouped = subPathRepos()
      .filter(([key]) => !withoutYamlQuotes(config).includes(`${key}*`))
      .map(([key, refs]) => `${key} used at ${refs.size} sub-paths, ungrouped`);

    expect(
      // The population is every external action, NOT `subPathRepos()`. This
      // repo uses no sub-path actions today, so naming that as the subject
      // would rightly refuse -- and the guard would look broken rather than
      // dormant. Every action was still examined for a sub-path.
      searched(ungrouped, { of: externalUses(), what: 'third-party actions' }),
      'separate PRs per sub-path break the one-SHA-per-repo invariant',
    ).toEqual([]);
  });

  /**
   * Declaring the group is not enough — it has to WIN.
   *
   * Dependabot assigns a dependency to the FIRST group whose patterns match
   * and then stops looking. `patch-updates` is a catch-all keyed on
   * update-type, so it swallows a patch bump of `actions/cache/restore`
   * before an `actions/cache*` group declared BELOW it is ever consulted.
   * The group is present, the config reads correct, and the sub-paths still
   * arrive in separate PRs — SHY-0226 all over again. Order is the control,
   * not presence, so the presence test above cannot stand alone.
   *
   * Dormant today (this repo uses no sub-path actions) and verified by
   * mutation, not by watching it pass.
   */
  it('a sub-path group is declared before the catch-all that would swallow it', () => {
    const misordered = subPathRepos().flatMap(([key]) =>
      ecosystemBlocks()
        .filter((block) => withoutYamlQuotes(block).includes(`${key}*`))
        .filter((block) => {
          const catchAll = block.indexOf('patch-updates:');
          return (
            catchAll !== -1 &&
            catchAll < withoutYamlQuotes(block).indexOf(`${key}*`)
          );
        })
        .map(() => `${key} grouped after patch-updates`),
    );

    expect(
      searched(misordered, {
        of: ecosystemBlocks(),
        what: 'Dependabot ecosystem blocks',
      }),
      'Dependabot assigns to the FIRST matching group and stops',
    ).toEqual([]);
  });

  it('a Dependabot config exists', () => {
    expect(existsSync(DEPENDABOT)).toBe(true);
  });

  it('watches npm AND the GitHub Actions themselves', () => {
    const config = configBody();

    expect(config, 'npm dependencies unwatched').toMatch(
      /package-ecosystem:\s*["']?npm["']?/,
    );
    expect(config, 'the actions that run CI are unwatched').toMatch(
      /package-ecosystem:\s*["']?github-actions["']?/,
    );
  });

  it('opens every PR against develop, never straight at main', () => {
    const config = configBody();
    const ecosystems = (config.match(/package-ecosystem:/g) ?? []).length;
    const onDevelop = config.match(/target-branch:\s*["']?develop["']?/g) ?? [];

    expect(ecosystems, 'no ecosystems declared').toBeGreaterThan(0);
    expect(
      onDevelop.length,
      'an ecosystem defaults to the default branch, bypassing the develop gate',
    ).toBe(ecosystems);
    expect(config).not.toMatch(/target-branch:\s*["']?main["']?/);
  });
});
