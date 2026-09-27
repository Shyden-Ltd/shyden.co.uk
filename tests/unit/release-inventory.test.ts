import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  VISITOR_PREFIXES,
  inventoryFor,
  inventoryOf,
  readCommits,
  releaseTests,
} from '../../scripts/release-inventory.mjs';

/** A throwaway repository, driven by the real git. */
const repository = () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-inventory-'));
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q', '-b', 'develop']);
  git(['config', 'user.email', 'fixture@example.test']);
  git(['config', 'user.name', 'Fixture']);
  git(['config', 'commit.gpgsign', 'false']);
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const commit = (subject: string) => {
    git(['add', '-A']);
    git(['commit', '-q', '-m', subject]);
    return git(['rev-parse', 'HEAD']).trim();
  };
  return {
    dir,
    git,
    write,
    commit,
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
};

describe('the release inventory (#362)', () => {
  let repo: ReturnType<typeof repository>;
  const sha: Record<string, string> = {};

  beforeAll(() => {
    repo = repository();
    const { git, write, commit } = repo;
    write('README.md', 'production\n');
    sha.base = commit('the production tree');
    // The squash era: one commit is one pull request, "(#ticket) (#pr)".
    write('src/pages/zh.astro', 'zh\n');
    write('tests/e2e/zh.spec.ts', 'zh\n');
    sha.squash = commit('feat(i18n): serve zh (#22) (#46)');
    // A pull request merged with a merge commit...
    git(['switch', '-q', '-c', '97-report']);
    write('functions/api/report.js', 'report\n');
    commit('the report function');
    git(['switch', '-q', 'develop']);
    // ...while develop moves on beside it, so its branch falls behind.
    write('src/components/Footer.astro', 'footer\n');
    sha.single = commit('fix(footer): one ref (#50)');
    git([
      'merge',
      '-q',
      '--no-ff',
      '-m',
      'Merge pull request #347 from Shyden-Ltd/97-report',
      '97-report',
    ]);
    sha.merge = git(['rev-parse', 'HEAD']).trim();
    // A pull request whose work is tests and a root file only.
    git(['switch', '-q', '-c', 'dependabot/npm/x']);
    write('tests/unit/x.test.ts', 'x\n');
    write('package.json', '{}\n');
    commit('bump');
    git(['switch', '-q', 'develop']);
    git([
      'merge',
      '-q',
      '--no-ff',
      '-m',
      'Merge pull request #298 from Shyden-Ltd/dependabot/npm/x',
      'dependabot/npm/x',
    ]);
    sha.head = git(['rev-parse', 'HEAD']).trim();
  });
  afterAll(() => repo.remove());

  const commits = () =>
    readCommits({ base: sha.base, head: sha.head, git: repo.git });

  it('walks every first-parent commit, oldest first, squashes and merges alike', () => {
    expect(commits().map((c) => c.sha)).toEqual([
      sha.squash,
      sha.single,
      sha.merge,
      sha.head,
    ]);
  });

  it("credits a merge with its own pull request's files, never develop's", () => {
    const merge = commits().find((c) => c.sha === sha.merge);
    expect(merge?.files).toEqual(['functions/api/report.js']);
  });

  it('credits a squash with its own diff', () => {
    expect(commits()[0]?.files).toEqual([
      'src/pages/zh.astro',
      'tests/e2e/zh.spec.ts',
    ]);
  });

  it('reads the pull request and ticket out of each shape of subject', () => {
    const entries = inventoryOf(commits());
    expect(entries.map(({ pr, ticket }) => ({ pr, ticket }))).toEqual([
      { pr: 46, ticket: 22 },
      { pr: 50, ticket: null },
      { pr: 347, ticket: 97 },
      { pr: 298, ticket: null },
    ]);
  });

  it('marks what a visitor receives, and names every other area', () => {
    const entries = inventoryOf(commits());
    expect(entries.map((e) => e.visitorFacing)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(entries[3]?.areas).toEqual(['(root)', 'tests']);
    expect(entries[0]?.areas).toEqual(['src', 'tests']);
  });

  it('covers exactly the four directories a visitor receives', () => {
    expect([...VISITOR_PREFIXES]).toEqual([
      'src/',
      'functions/',
      'migrations/',
      'public/',
    ]);
    for (const prefix of VISITOR_PREFIXES) {
      const [entry] = inventoryOf([
        { sha: 'x', parents: ['p'], subject: 's', files: [`${prefix}a`] },
      ]);
      expect(entry?.visitorFacing, prefix).toBe(true);
    }
  });

  it('resolves the ends to full shas', () => {
    const inventory = inventoryFor({
      base: 'HEAD~4',
      head: 'HEAD',
      git: repo.git,
    });
    expect(inventory.base).toBe(sha.base);
    expect(inventory.head).toBe(sha.head);
    expect(inventory.entries).toHaveLength(4);
  });

  it('refuses a base that is not an ancestor of the head', () => {
    expect(() =>
      readCommits({ base: sha.head, head: sha.squash, git: repo.git }),
    ).toThrow(/is not an ancestor of/);
  });
});

describe('a commit the inventory has no rule for (#362)', () => {
  it('refuses an octopus merge rather than guess which parent is the line', () => {
    const repo = repository();
    try {
      const { git, write, commit } = repo;
      write('a', 'a\n');
      const base = commit('base');
      for (const branch of ['one', 'two']) {
        git(['switch', '-q', '-c', branch, base]);
        write(`src/${branch}`, `${branch}\n`);
        commit(branch);
      }
      git(['switch', '-q', 'develop']);
      git(['merge', '-q', '--no-ff', '-m', 'octopus', 'one', 'two']);
      expect(() => readCommits({ base, head: 'HEAD', git })).toThrow(
        /has 3 parents/,
      );
    } finally {
      repo.remove();
    }
  });
});

describe('the capture selection (#362)', () => {
  const sources: Record<string, string> = {
    'tests/e2e/direct.spec.ts': `
import { shoot } from './evidence';
test('shoots directly', async ({ page }) => {
  await expect(page).toHaveTitle('x');
  await shoot(page, 'shown');
});
test('never shoots', async ({ page }) => {
  // shoot(page, 'a comment naming it decides nothing');
  await expect(page).toHaveTitle('x');
});
for (const locale of ['en', 'id'])
  test(\`\${locale}: shoots in a loop\`, async ({ page }) => {
    await shoot(page, locale);
  });
`,
    'tests/e2e/helper.spec.ts': `
const outer = async (page) => { await inner(page); };
const inner = async (page) => { await shoot(page, 'deep'); };
async function once(page) { await shoot(page, 'once'); }
test('through a helper', async ({ page }) => { await once(page); });
test("through a helper's helper", async ({ page }) => { await outer(page); });
test('calls a helper that never shoots', async ({ page }) => { await quiet(page); });
const quiet = async (page) => { await page.goto('/'); };
`,
    'tests/e2e/tooling.spec.ts': `
import { evidencePageOf } from '../evidence-fixture';
test('the evidence page itself', async ({ page }) => { await shoot(page, 'x'); });
`,
  };
  const read = (file: string) => {
    const source = sources[file];
    if (source === undefined) throw new Error(`no fixture ${file}`);
    return source;
  };

  it('selects each capturing test by file:line, through helpers to a fixed point', () => {
    expect(releaseTests(Object.keys(sources), read)).toEqual([
      'tests/e2e/direct.spec.ts:3',
      'tests/e2e/direct.spec.ts:12',
      'tests/e2e/helper.spec.ts:5',
      'tests/e2e/helper.spec.ts:6',
    ]);
  });
});

describe('release-inventory.mjs as a command (#362)', () => {
  const script = resolve('scripts/release-inventory.mjs');

  it('prints the capture selection of this repository, and it is not empty', () => {
    const run = spawnSync(process.execPath, [script, '--tests'], {
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
    const lines = run.stdout.trim().split('\n');
    expect(lines.length).toBeGreaterThan(50);
    expect(
      lines.every((l) => /^tests\/e2e\/[\w.-]+\.spec\.ts:\d+$/.test(l)),
    ).toBe(true);
    expect(
      lines.some((l) =>
        l.startsWith('tests/e2e/classroom-groups-projector.spec.ts:'),
      ),
    ).toBe(true);
    expect(
      lines.some((l) => l.startsWith('tests/e2e/evidence-page.spec.ts:')),
    ).toBe(false);
  });

  it('refuses a selection that is empty, rather than let a capture run everything', () => {
    const empty = mkdtempSync(join(tmpdir(), 'release-tests-'));
    try {
      mkdirSync(join(empty, 'tests', 'e2e'), { recursive: true });
      execFileSync('git', ['init', '-q'], { cwd: empty });
      const run = spawnSync(process.execPath, [script, '--tests'], {
        cwd: empty,
        encoding: 'utf8',
      });
      expect(run.stderr).toContain('no test captures the site');
      expect(run.status).toBe(1);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
