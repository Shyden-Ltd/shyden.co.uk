import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  accountFileName,
  accountFindings,
  needsFindings,
  shardOf,
} from '../../scripts/e2e-shards.mjs';

/**
 * `build-and-test` passing must still mean what it meant before the suite was
 * split: every step ran, and the WHOLE suite ran (#163).
 *
 * Branch protection and `scripts/deploy-gate.mjs` both read one conclusion by
 * name and never the work behind it. Once the suite runs as parallel shards,
 * `build-and-test` does none of that work itself; it stands for jobs that did.
 * So its verdict has two halves, and each one catches something the other
 * cannot:
 *
 * - NEEDS. Every job it stands for must have SUCCEEDED. A skipped job is not
 *   a failed one, and a skipped required check reads as passing (#157), so
 *   `skipped` and `cancelled` are refusals exactly like `failure`.
 * - ACCOUNTS. The shards must add up to the suite. Every shard can succeed
 *   while running fewer tests than the suite holds: a shard never scheduled,
 *   a filter that crept into one shard's command, a shard total that
 *   disagrees with the matrix. Shards that together run less still pass, and
 *   that is the shrinking-population class this repo keeps finding (#112,
 *   #118). Each shard enumerates the whole suite with an unfiltered
 *   `playwright test --list` and records what it ran, so the sum is held
 *   against a count that comes from outside every run, as `test-e2e.mjs`
 *   already does for an unsharded run.
 */

/**
 * One shard's account, declared here rather than imported so a fixture that
 * disagrees with the contract fails to compile (#157).
 */
interface Account {
  shard: { index: number; total: number };
  enumerated: number | null;
  executed: number | null;
  playwrightExitCode: number;
  listingStatus: number | null;
}

const SUITE = 2210;

const account = (
  index: number,
  executed: number,
  over: Partial<Account> = {},
): Account => ({
  shard: { index, total: 4 },
  enumerated: SUITE,
  executed,
  playwrightExitCode: 0,
  listingStatus: 0,
  ...over,
});

/** Four shards that together ran exactly the suite: 553 + 553 + 552 + 552. */
const whole = (): Account[] => [
  account(1, 553),
  account(2, 553),
  account(3, 552),
  account(4, 552),
];

describe('shardOf: the shard a run was asked for', () => {
  it('reads --shard=i/N', () => {
    expect(shardOf(['--shard=2/4'])).toEqual({ index: 2, total: 4 });
  });

  it('reads --shard i/N, with its value as the next argument', () => {
    expect(shardOf(['--project=chromium', '--shard', '3/4'])).toEqual({
      index: 3,
      total: 4,
    });
  });

  it('is null for a run that asked for no shard', () => {
    expect(shardOf([])).toBeNull();
    expect(
      shardOf(['--project=chromium', 'tests/e2e/chrome.spec.ts']),
    ).toBeNull();
  });

  // Playwright refuses these too, but a shard this module cannot place would
  // write an account nobody can reconcile. Refused by name, so the message
  // points at the argument rather than at arithmetic three steps later.
  it.each([
    ['--shard=0/4'],
    ['--shard=5/4'],
    ['--shard=2/0'],
    ['--shard=2'],
    ['--shard=x/4'],
    ['--shard=2/4/1'],
  ])('refuses %s, naming it', (arg) => {
    expect(() => shardOf([arg])).toThrow(`${arg} is not`);
  });

  it('names a value given as the next argument the same way', () => {
    expect(() => shardOf(['--shard', '5/4'])).toThrow('--shard=5/4 is not');
  });

  it('refuses --shard with no value at all', () => {
    expect(() => shardOf(['--shard'])).toThrow(/--shard/);
  });
});

describe('accountFileName: one file per shard', () => {
  // The aggregating job downloads every shard's artifact into ONE directory.
  // Two shards writing the same file name would overwrite each other, and the
  // survivor would read as a whole suite that ran only once.
  it('names the shard and the total', () => {
    expect(accountFileName({ index: 2, total: 4 })).toBe(
      'e2e-account-2-of-4.json',
    );
  });

  it('never gives two shards of one run the same name', () => {
    const names = [1, 2, 3, 4].map((index) =>
      accountFileName({ index, total: 4 }),
    );
    expect(new Set(names).size).toBe(4);
  });
});

describe('needsFindings: every job build-and-test stands for succeeded', () => {
  const needs = (e2e: string, checks = 'success') => ({
    checks: { result: checks, outputs: {} },
    e2e: { result: e2e, outputs: {} },
  });

  it('has nothing to say when every job succeeded', () => {
    expect(needsFindings(needs('success'))).toEqual([]);
  });

  // `skipped` is the dangerous one: a skipped required check is reported to
  // branch protection as passing, so a skipped shard must never reach it as
  // anything but a refusal (#157).
  it.each(['failure', 'cancelled', 'skipped'])(
    'refuses a job that finished %s, naming the job and the result',
    (result) => {
      const findings = needsFindings(needs(result));
      expect(findings).toHaveLength(1);
      expect(findings[0]).toContain('e2e');
      expect(findings[0]).toContain(result);
    },
  );

  it('names every job that did not succeed, not only the first', () => {
    const findings = needsFindings(needs('cancelled', 'failure'));
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toMatch(/checks[\s\S]*e2e/);
  });

  // An aggregate standing for nothing agrees with everything. `toJSON(needs)`
  // is `{}` for a job that needs nothing, which is what an edit dropping the
  // `needs:` line would hand it.
  it('refuses to vouch for no jobs at all', () => {
    expect(needsFindings({})).toEqual([
      expect.stringMatching(/stands for no job/),
    ]);
  });

  it.each([[null], ['success'], [[]], [42]])(
    'refuses needs it cannot read: %j',
    (value) => {
      expect(needsFindings(value)).toEqual([
        expect.stringMatching(/could not be read/),
      ]);
    },
  );

  it('refuses a job whose result is missing', () => {
    expect(needsFindings({ e2e: { outputs: {} } })).toEqual([
      expect.stringMatching(/e2e/),
    ]);
  });
});

describe('accountFindings: the shards add up to the suite', () => {
  it('has nothing to say when four shards ran exactly the enumerated suite', () => {
    expect(accountFindings(whole())).toEqual([]);
  });

  it('refuses a total one short, and says by how much', () => {
    const accounts = whole();
    accounts[2] = account(3, 551);
    expect(accountFindings(accounts)).toEqual([
      expect.stringMatching(/2209 of the 2210/),
    ]);
  });

  it('refuses more tests than the suite holds as a disagreement too', () => {
    const accounts = whole();
    accounts[0] = account(1, 554);
    expect(accountFindings(accounts)).toEqual([
      expect.stringMatching(/2211 of the 2210/),
    ]);
  });

  it('names a shard that never reported', () => {
    const accounts = whole().filter(({ shard }) => shard.index !== 3);
    const findings = accountFindings(accounts);
    expect(findings.join('\n')).toMatch(/shard 3 of 4/);
  });

  it('names a shard that reported twice', () => {
    const accounts = [...whole(), account(2, 553)];
    expect(accountFindings(accounts).join('\n')).toMatch(
      /shard 2 of 4 .*2 accounts/,
    );
  });

  it('refuses shards that disagree on how many shards there are', () => {
    const accounts = whole();
    accounts[3] = account(4, 552, { shard: { index: 4, total: 5 } });
    expect(accountFindings(accounts).join('\n')).toMatch(/disagree/);
  });

  it('refuses shards that enumerated different suites', () => {
    const accounts = whole();
    accounts[1] = account(2, 553, { enumerated: 2209 });
    expect(accountFindings(accounts).join('\n')).toMatch(
      /2209[\s\S]*2210|2210[\s\S]*2209/,
    );
  });

  // Zero is a broken measurement, not a small shard: `reconcile()` in
  // test-e2e.mjs refuses a run of zero for the same reason (#150).
  it('refuses a shard that ran no tests', () => {
    const accounts = whole();
    accounts[1] = account(2, 0);
    expect(accountFindings(accounts).join('\n')).toMatch(
      /shard 2 of 4 ran no tests/,
    );
  });

  it('refuses an enumeration of zero', () => {
    const accounts = whole().map((each) => ({ ...each, enumerated: 0 }));
    expect(accountFindings(accounts).join('\n')).toMatch(/enumerated no tests/);
  });

  it('refuses no accounts at all', () => {
    expect(accountFindings([])).toEqual([
      expect.stringMatching(/no shard accounted for itself/),
    ]);
  });

  it('refuses a shard whose listing failed, whatever it counted', () => {
    const accounts = whole();
    accounts[0] = account(1, 553, { listingStatus: 1 });
    expect(accountFindings(accounts).join('\n')).toMatch(
      /shard 1 of 4 .*--list.* exited 1/,
    );
  });

  it('refuses a shard whose Playwright run failed, whatever it counted', () => {
    const accounts = whole();
    accounts[3] = account(4, 552, { playwrightExitCode: 1 });
    expect(accountFindings(accounts).join('\n')).toMatch(
      /shard 4 of 4 .*Playwright exited 1/,
    );
  });

  it.each([
    [null],
    [{}],
    [{ shard: { index: 1, total: 4 }, enumerated: SUITE }],
    [{ ...account(1, 553), executed: '553' }],
  ])('refuses an account it cannot read: %j', (broken) => {
    const accounts: unknown[] = whole().slice(1);
    accounts.unshift(broken);
    expect(accountFindings(accounts).join('\n')).toMatch(/not an account/);
  });
});

describe('the verdict, run as build-and-test runs it', () => {
  const SCRIPT = join(process.cwd(), 'scripts/e2e-shards.mjs');
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  const accountsDir = (accounts: Account[], nested = false) => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-accounts-'));
    dirs.push(dir);
    for (const each of accounts) {
      // `download-artifact` without `merge-multiple` puts each artifact in a
      // folder of its own; with it, all of them in one. Both must be read.
      const home = nested ? join(dir, `e2e-account-${each.shard.index}`) : dir;
      mkdirSync(home, { recursive: true });
      writeFileSync(
        join(home, accountFileName(each.shard)),
        JSON.stringify(each),
      );
    }
    return dir;
  };

  const verdict = (dir: string, needs: unknown) =>
    spawnSync(process.execPath, [SCRIPT, dir], {
      encoding: 'utf8',
      env: { ...process.env, NEEDS_JSON: JSON.stringify(needs) },
    });

  const succeeded = {
    checks: { result: 'success', outputs: {} },
    e2e: { result: 'success', outputs: {} },
  };

  it('passes when every job succeeded and the shards add up, and says so', () => {
    const run = verdict(accountsDir(whole()), succeeded);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/4 shards ran 2210 of the 2210 tests/);
  });

  it('reads accounts from one folder per artifact too', () => {
    const run = verdict(accountsDir(whole(), true), succeeded);
    expect(run.status).toBe(0);
  });

  it('fails when a shard failed, even though the accounts add up', () => {
    const run = verdict(accountsDir(whole()), {
      ...succeeded,
      e2e: { result: 'failure', outputs: {} },
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/e2e.*failure/);
  });

  it('fails when the accounts fall short, even though every job succeeded', () => {
    const run = verdict(accountsDir(whole().slice(0, 3)), succeeded);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/shard 4 of 4/);
  });

  it('fails, rather than passing on nothing, when the folder is missing', () => {
    const run = verdict(
      join(tmpdir(), 'e2e-accounts-that-were-never-downloaded'),
      succeeded,
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/no shard accounted for itself/);
  });

  it('fails when it is handed no needs to read', () => {
    const run = spawnSync(process.execPath, [SCRIPT, accountsDir(whole())], {
      encoding: 'utf8',
      env: { ...process.env, NEEDS_JSON: '' },
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/could not be read/);
  });
});
