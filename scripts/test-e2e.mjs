#!/usr/bin/env node
/**
 * `npm run test:e2e` — Playwright, plus proof that Playwright ran all of it.
 *
 * A green e2e summary is how this repo decides a change is safe to deploy. That
 * decision is only as good as the assumption underneath it: that "passed" means
 * the whole suite passed, not that some of it did.
 *
 * The prompting observation (#36) was a run reporting ~850 passing tests when
 * the suite holds 2094. That was originally attributed to stale browser
 * binaries left behind by a Playwright version bump. The theory was tested and
 * is FALSE: moving `webkit-2359` aside and running a webkit spec produces
 * `browserType.launch: Executable doesn't exist`, one failed test, and
 * Playwright's own banner naming the exact fix. A stale browser is loud.
 *
 * So the true cause of that shortfall is unknown — and that is the whole design
 * argument for what follows. This guard does not detect stale browsers, an
 * interrupted worker, a stray `--project`, or a spec that quietly stopped
 * matching. It detects the single thing every one of those has in common, and
 * the only thing that actually matters: fewer tests ran than the suite holds.
 *
 * WHY THE COUNT COMES FROM OUTSIDE THE RUN
 *
 * A Playwright reporter is handed the already-filtered test list. A reporter
 * that compared what it saw against what it was given would compare a number
 * with itself and agree every time — a guard that cannot fail. The enumeration
 * therefore comes from a separate, unfiltered `playwright test --list`.
 *
 * WHY A NARROWED RUN IS ANNOUNCED AND NOT FAILED
 *
 * `npm run test:e2e -- --project=chromium` is a legitimate thing to do. Failing
 * it would train everyone to ignore the guard, which is worse than not having
 * one. A deliberate subset is stated loudly instead; only an unqualified run is
 * held to the full total.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `playwright test --list` closes with e.g. `Total: 2094 tests in 18 files`. */
const LIST_FOOTER = /^Total:\s+(\d+)\s+tests?\b/m;

/**
 * The suite size as `--list` reports it, or null when it cannot be read.
 *
 * Null rather than 0: every comparison below is satisfied by "executed >= 0",
 * so a zero here would wave through the exact runs this file exists to stop.
 */
export function parseListTotal(text) {
  const match = LIST_FOOTER.exec(text ?? '');
  return match ? Number(match[1]) : null;
}

/** Flags that change WHICH tests run, as opposed to how they run. */
const FILTER_FLAGS = new Set([
  '--project',
  '--grep',
  '-g',
  '--grep-invert',
  '--shard',
  '--last-failed',
  '--only-changed',
  // Not a filter — a multiplier. `--repeat-each=2` runs every test twice, so
  // the run legitimately exceeds the enumeration and is not comparable to it.
  '--repeat-each',
]);

/**
 * Flags whose value arrives as a separate token.
 *
 * Without this, `--workers 2` splits into two arguments and `2` reads as a
 * positional spec path — marking a FULL run as narrowed, which announces the
 * shortfall instead of failing it. The guard would still print and still never
 * fire, which is the most dangerous shape a guard can take.
 */
const VALUE_FLAGS = new Set([
  ...FILTER_FLAGS,
  '--workers',
  '-j',
  '--reporter',
  '--retries',
  '--timeout',
  '--global-timeout',
  '--repeat-each',
  '--max-failures',
  '--output',
  '--config',
  '-c',
  '--trace',
]);

/**
 * Args that select WHICH suite this is, as opposed to which of its tests run.
 *
 * These MUST reach the enumeration: counting the default suite while the run
 * executes `--config=playwright.dev.config.ts` compares two different things
 * and fails a perfectly good command.
 */
const SUITE_FLAGS = new Set(['--config', '-c']);

/**
 * The subset of the caller's args that `--list` should also receive.
 *
 * Filters are deliberately excluded, and that exclusion is the load-bearing
 * part: forwarding `--project` would shrink the enumeration to exactly what the
 * run executes, so the two would always agree and this guard could never fire
 * again — while still being present, still passing, and asserting nothing.
 */
export function enumerationArgs(argv = []) {
  const forwarded = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('-')) continue;
    const name = arg.split('=')[0];

    if (SUITE_FLAGS.has(name)) {
      forwarded.push(arg);
      if (!arg.includes('=')) {
        forwarded.push(argv[i + 1]);
        i += 1;
      }
      continue;
    }

    if (!arg.includes('=') && VALUE_FLAGS.has(name)) i += 1;
  }

  return forwarded;
}

/** Did the caller ask for a subset of the suite? */
export function isFilteredRun(argv = []) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('-')) return true; // a spec path
    const name = arg.split('=')[0];
    if (FILTER_FLAGS.has(name)) return true;
    if (!arg.includes('=') && VALUE_FLAGS.has(name)) i += 1; // skip its value
  }
  return false;
}

/**
 * `--reporter` REPLACES rather than appends, so the caller's own choice would
 * leave no json for this guard to read — and a guard with no numbers is a guard
 * that cannot fire. Their reporter is kept; json is added beside it.
 */
export function mergeReporters(argv = []) {
  const passthrough = [];
  let chosen = 'list';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--reporter=')) {
      chosen = arg.slice('--reporter='.length);
    } else if (arg === '--reporter') {
      chosen = argv[i + 1] ?? 'list';
      i += 1;
    } else {
      passthrough.push(arg);
    }
  }

  const reporters = chosen.split(',').filter(Boolean);
  if (!reporters.includes('json')) reporters.push('json');
  return { passthrough, reporter: reporters.join(',') };
}

/**
 * Every outcome a test can end in, skips included.
 *
 * Skipped tests were accounted for by the run. Leaving them out would make the
 * guard fire on a suite that legitimately skips, and the natural fix for that
 * false alarm would be to weaken the guard.
 */
export function countExecuted(stats = {}) {
  const { expected = 0, unexpected = 0, flaky = 0, skipped = 0 } = stats;
  return expected + unexpected + flaky + skipped;
}

const RULE = '='.repeat(72);

/** The verdict, and the exit code the process should carry. */
export function reconcile({
  enumerated,
  executed,
  filtered,
  playwrightExitCode,
}) {
  if (filtered) {
    return {
      exitCode: playwrightExitCode,
      partial: true,
      message:
        `\nPARTIAL RUN — ${executed} of ${enumerated ?? 'an unknown number of'} tests.\n` +
        'Arguments narrowed this run, so it was NOT judged against the full ' +
        'suite.\nRun `npm run test:e2e` with no arguments to cover everything.\n',
    };
  }

  if (typeof enumerated !== 'number') {
    return {
      exitCode: 1,
      partial: false,
      message:
        `\n${RULE}\n  E2E RECONCILIATION FAILED — the size of the suite could not be read\n\n` +
        '  `playwright test --list` did not report a total, so there is nothing\n' +
        '  to hold this run against. An unknown total blocks the run rather than\n' +
        `  waving it through.\n${RULE}\n`,
    };
  }

  if (executed !== enumerated) {
    const verb =
      executed < enumerated ? 'measured less than' : 'disagrees with';
    return {
      exitCode: 1,
      partial: false,
      message:
        `\n${RULE}\n  E2E RECONCILIATION FAILED — this run ${verb} the suite\n\n` +
        `    tests enumerated by \`playwright test --list\` : ${enumerated}\n` +
        `    tests accounted for by this run              : ${executed}\n` +
        `    difference                                   : ${executed - enumerated}\n\n` +
        `  Playwright exited ${playwrightExitCode}. That is not a pass. A green summary\n` +
        '  over a partial run is the single outcome this guard exists to reject.\n\n' +
        '  Worth checking: were workers killed mid-run (memory pressure ends a\n' +
        '  run without failing it)? Did a spec stop matching its project? Was a\n' +
        `  filter set in config rather than on the command line?\n${RULE}\n`,
    };
  }

  return { exitCode: playwrightExitCode, partial: false, message: null };
}

function main() {
  const argv = process.argv.slice(2);
  const filtered = isFilteredRun(argv);
  const { passthrough, reporter } = mergeReporters(argv);

  // Same suite, no filters: this is the number the run has to answer to.
  const listing = spawnSync(
    'npx',
    ['playwright', 'test', '--list', ...enumerationArgs(argv)],
    { encoding: 'utf8' },
  );
  const enumerated = parseListTotal(listing.stdout);

  const reportDir = mkdtempSync(join(tmpdir(), 'e2e-reconcile-'));
  const reportPath = join(reportDir, 'report.json');

  try {
    const run = spawnSync(
      'npx',
      ['playwright', 'test', `--reporter=${reporter}`, ...passthrough],
      {
        stdio: 'inherit',
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath },
      },
    );

    let executed = null;
    try {
      executed = countExecuted(
        JSON.parse(readFileSync(reportPath, 'utf8')).stats,
      );
    } catch (cause) {
      console.error(
        `\n${RULE}\n  E2E RECONCILIATION FAILED — the run produced no readable report\n\n` +
          `  ${cause.message}\n\n` +
          '  Without it there is no count to check, so this cannot be treated as\n' +
          `  a pass.\n${RULE}\n`,
      );
      process.exit(1);
    }

    const verdict = reconcile({
      enumerated,
      executed,
      filtered,
      playwrightExitCode: run.status ?? 1,
    });
    if (verdict.message) console.error(verdict.message);
    process.exit(verdict.exitCode);
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
