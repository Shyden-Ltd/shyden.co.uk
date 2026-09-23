import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { withoutYamlComments, withoutYamlQuotes } from './source-text';
import { filesUnder, nonEmpty, searched } from '../source-files';
import { parseCleanYaml } from '../workflow-jobs';

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
 * SOURCE TEXT, comment-stripped: these checks ask whether a `uses:` line is
 * pinned and whether one group sits above another, which text answers. When a
 * question turns structural, parse instead — `yaml` is declared for exactly
 * that (tests/workflow-jobs.ts, #157).
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

/**
 * A container image CI runs is pinned, and something keeps it current. #95.
 *
 * The back-translation engine is the first image CI runs that no npm version
 * moves (the visual job's Playwright image follows the installed Playwright).
 * Its pin lives in a Dockerfile, not in the workflow, because Dependabot reads
 * no image out of a workflow file: a digest written there is exactly the pin
 * nobody bumps. Both halves are derived from disk, so a Dockerfile added
 * anywhere is held to them the day it appears.
 */
describe('a container image CI runs is pinned, and watched', () => {
  const dockerfiles = () =>
    filesUnder('.', (path) => basename(path) === 'Dockerfile');
  /** Comment lines start with `#`, so an anchored FROM never reads one. */
  const fromLines = () =>
    dockerfiles().flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((text, i) => ({ where: `${file}:${i + 1}`, text: text.trim() }))
        .filter(({ text }) => /^FROM\s/i.test(text)),
    );

  it('builds every Dockerfile FROM a digest, beside the version it names', () => {
    const loose = fromLines()
      .filter(
        ({ text }) =>
          !/^FROM\s+\S+:[^\s:@/]+@sha256:[0-9a-f]{64}(\s+AS\s+\S+)?$/i.test(
            text,
          ),
      )
      .map(({ where, text }) => `${where} ${text}`);

    expect(
      searched(loose, { of: fromLines(), what: 'FROM lines' }),
      'a tag can be repointed under us, and a bare digest is unreviewable',
    ).toEqual([]);
  });

  it('has Dependabot watching every directory that holds a Dockerfile', () => {
    const config = parseCleanYaml(dependabot(), DEPENDABOT) as {
      updates?: { 'package-ecosystem'?: string; directory?: string }[];
    };
    const watched = new Set(
      (config.updates ?? [])
        .filter((entry) => entry['package-ecosystem'] === 'docker')
        .map((entry) => (entry.directory ?? '').replace(/(.)\/+$/, '$1')),
    );
    const unwatched = dockerfiles()
      .map((file) => dirname(file))
      .map((dir) => (dir === '.' ? '/' : `/${dir}`))
      .filter((dir) => !watched.has(dir));

    expect(
      searched(unwatched, { of: dockerfiles(), what: 'Dockerfiles' }),
      'a digest nobody bumps rots',
    ).toEqual([]);
  });
});

/**
 * The majors a peer range admits, for a range written as `^X.Y.Z` terms
 * joined by `||`. Every term is read before any answer is given, and a term
 * in any other form throws: a range this cannot read is a question for a
 * person, and a guess would either hold TypeScript back for nothing or let
 * the hold outlive its reason.
 */
const admittedMajors = (range: string): number[] =>
  range.split('||').map((term) => {
    const caret = /^\^(\d+)\.\d+\.\d+$/.exec(term.trim());
    if (!caret)
      throw new Error(`cannot read "${term.trim()}" in peer range "${range}"`);
    return Number(caret[1]);
  });

/** The range an INSTALLED package declares for one of its peers. */
const installedPeerRange = (pkg: string, peer: string): string => {
  const manifest = JSON.parse(
    readFileSync(join('node_modules', pkg, 'package.json'), 'utf8'),
  ) as { peerDependencies?: Record<string, string> };
  const range = manifest.peerDependencies?.[peer];
  if (range === undefined)
    throw new Error(
      `${pkg} declares no ${peer} peer: judge the hold again (#177)`,
    );
  return range;
};

/** Dependabot's `ignore` rules for one npm dependency, from the PARSED config. */
const npmIgnoresFor = (name: string): unknown[] => {
  const config = parseCleanYaml(dependabot(), DEPENDABOT) as {
    updates?: {
      'package-ecosystem'?: string;
      ignore?: { 'dependency-name'?: string }[];
    }[];
  };
  return (config.updates ?? [])
    .filter((entry) => entry['package-ecosystem'] === 'npm')
    .flatMap((entry) => entry.ignore ?? [])
    .filter((rule) => rule['dependency-name'] === name);
};

/**
 * TypeScript is held at 6 (#177), and the hold is tied to what lifts it.
 *
 * Two reasons, measured 2026-09-15 on Dependabot's 7.0.2 PR (#169).
 * `@astrojs/check`, which `astro check` runs on, peers `^5.0.0 || ^6.0.0`, so
 * 7 cannot install. And 7 moved the compiler API to `typescript/unstable/*`,
 * leaving its `typescript` import with only `version` and
 * `versionMajorMinor`, while six files under tests/ call `createSourceFile`
 * and 30 more names through it.
 *
 * The rule is PARSED, not matched: which update types it covers is
 * structure, and a parsed tree carries no comment that could satisfy it. The
 * second test fails the day `@astrojs/check` accepts 7, so the hold is judged
 * again when its install blocker goes, not when somebody remembers it.
 */
describe('TypeScript is held at 6 until it can move', () => {
  it('ignores TypeScript majors, and only majors', () => {
    expect(
      npmIgnoresFor('typescript'),
      'without it, every 7.x release opens a PR that cannot install',
    ).toEqual([
      {
        'dependency-name': 'typescript',
        'update-types': ['version-update:semver-major'],
      },
    ]);
  });

  it('is judged again once @astrojs/check accepts TypeScript 7', () => {
    const majors = admittedMajors(
      installedPeerRange('@astrojs/check', 'typescript'),
    );

    expect(majors, 'the reader must see the major this repo runs').toContain(6);
    expect(
      searched(
        majors.filter((major) => major >= 7),
        { of: majors, what: 'TypeScript majors @astrojs/check admits' },
      ),
      '@astrojs/check now accepts TypeScript 7 or later: port the six files under tests/ off the TypeScript 6 compiler API (7 moved it to typescript/unstable/*), then delete the typescript ignore in dependabot.yml and this describe block',
    ).toEqual([]);
  });
});

describe('admittedMajors reads a caret peer range, and refuses any other', () => {
  it('reads each caret term to its major', () => {
    expect(admittedMajors('^5.0.0 || ^6.0.0')).toEqual([5, 6]);
    expect(admittedMajors('^7.1.0')).toEqual([7]);
  });

  it('throws on any other form, even beside a term it can read', () => {
    for (const range of [
      '>=5.0.0',
      '~6.0.0',
      '6.x',
      '*',
      '',
      '^6.0.0 || >=7.0.0',
    ]) {
      expect(() => admittedMajors(range), `"${range}"`).toThrow(/cannot read/);
    }
  });
});

/** The version `package.json` itself declares for one of its devDependencies. */
const declaredDevVersion = (name: string): string => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
    devDependencies?: Record<string, string>;
  };
  const declared = manifest.devDependencies?.[name];
  if (declared === undefined)
    throw new Error(
      `package.json declares no devDependency ${name}: judge the hold again (#296)`,
    );
  return declared;
};

/**
 * prettier-plugin-astro is held at 1.0.0, and this hold lifts itself.
 *
 * Measured 2026-09-22 on Dependabot's group PR (#265). 1.0.1 re-indents the
 * continuation lines of every multi-line CSS block comment inside an `.astro`
 * `<style>` block by two spaces — and does it AGAIN on the next run. One
 * comment line went 7 -> 9 -> 11 -> 13 -> 15 -> 17 leading spaces over five
 * `--write` passes, with `--check` still calling the file dirty. The
 * transform has no fixed point, so no commit can satisfy `npm run format`
 * while 1.0.1 is installed. Isolated against a 2x2 matrix: prettier 3.9.8
 * with the plugin at 1.0.0 is clean, and the plugin at 1.0.1 is dirty under
 * both 3.9.6 and 3.9.8. Six of this repo's twenty `.astro` files are hit.
 *
 * Reported and fixed upstream before we met it:
 * withastro/prettier-plugin-astro#487, opened 2026-09-18 and closed as
 * completed on 2026-09-21. The fix is unreleased -- 1.0.1 (2026-09-17) is
 * still npm's latest as of 2026-09-22 -- so 1.0.2 is the release expected to
 * lift the hold, and the rule below is written to let it through.
 *
 * This is NOT the #178 case, which accepted this plugin's 1.0.0 reformat of
 * eleven files and proved every page still said the same thing. That was
 * right because 1.0.0 has a fixed point: format once, commit, done. Committing
 * a pass of 1.0.1 buys nothing — the next `--write` moves it again.
 *
 * #177 ties its hold to a test that fails when the reason expires. This one
 * needs no such test because the rule names a SINGLE version: 1.0.2 is not
 * ignored, so Dependabot opens a PR for it on its own schedule and the format
 * gate judges it. That is why the first test asserts the narrow shape rather
 * than mere presence — a blanket ignore would freeze the plugin at 1.0.0
 * forever, and nothing would ever come back to ask.
 */
describe('prettier-plugin-astro is held at 1.0.0 until a release settles', () => {
  it('ignores 1.0.1 alone, so 1.0.2 still arrives to be judged', () => {
    expect(
      npmIgnoresFor('prettier-plugin-astro'),
      'without this rule every group PR carries 1.0.1 again, and `npm run format` has no formatting it can accept (#296)',
    ).toEqual([
      {
        'dependency-name': 'prettier-plugin-astro',
        versions: ['1.0.1'],
      },
    ]);
  });

  it('pins the exact version, so a plain `npm install` cannot take 1.0.1', () => {
    expect(
      declaredDevVersion('prettier-plugin-astro'),
      'the lockfile governs `npm ci` alone: under `^1.0.0` a developer running `npm install` resolves to 1.0.1 and six .astro files go dirty with no PR to explain it (#296)',
    ).toBe('1.0.0');
  });
});
