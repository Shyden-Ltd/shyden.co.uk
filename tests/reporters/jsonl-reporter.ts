/**
 * Emits one JSON object per line to a file, live, so `scripts/dashboard.mjs`
 * can tail it and drive the live dashboard (task brief step 1). This is a
 * SEPARATE reporter from `list`/`json` (see `scripts/test-devices.mjs`,
 * which runs all three together via `--reporter=list,json,./tests/reporters/jsonl-reporter.ts`)
 * -- it does not replace either, and writes to its own file, never stdout.
 * `list`'s terminal output and `json`'s summary file are exactly as they
 * were before this reporter existed.
 *
 * Which file, and which group label to put on every event, come from two
 * environment variables (`DASHBOARD_JSONL_FILE`, `DASHBOARD_GROUP`) rather
 * than reporter options, because Playwright's CLI `--reporter=a,b,c` syntax
 * (which `scripts/test-devices.mjs` already uses for `list,json`) has no
 * way to pass per-reporter options -- only the config-array form
 * (`reporter: [['x', {...}]]`) does, and this project deliberately keeps
 * `playwright.config.ts` and `playwright.device.config.ts` untouched by the
 * dashboard feature, so a bare `npx playwright test` (no dashboard env vars
 * set) is unaffected either way. Measured, not assumed: Playwright resolves a
 * CLI reporter id that isn't a built-in name via
 * `path.resolve(process.cwd(), id)` then `require.resolve` --
 * `node_modules/playwright/lib/cli/testActions.js`'s `resolveReporter` --
 * so a relative path on the CLI works with no config change at all.
 *
 * If `DASHBOARD_JSONL_FILE` is unset, every hook below is a no-op. That is
 * what makes a bare `npx playwright test --reporter=list,json,./tests/reporters/jsonl-reporter.ts`
 * (run by hand, no dashboard involved) harmless -- and it is the mechanism
 * behind the task's hardest requirement: "if the dashboard server throws,
 * the tests carry on" (step 3). This reporter does not talk to the
 * dashboard server or the network at all -- it only appends to a file, and
 * every append is wrapped so a filesystem error here can never propagate
 * into a test failure or abort the run. A write failure is logged ONCE
 * (so it is not silently invisible -- see this project's own rule against
 * `if (ok) { act() }` with no `else`) and then this reporter goes quiet for
 * the rest of the run rather than spamming a failure on every subsequent
 * test.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import type {
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

type DashboardStatus = 'passed' | 'failed' | 'skipped';

/**
 * `result.status` distinguishes `timedOut`/`interrupted` from a plain
 * `failed` -- real, useful distinctions for a human reading Playwright's
 * own output, but the dashboard's contract (task brief step 1) is a flat
 * passed/failed/skipped, matching `summarizePlaywrightGroup` in
 * `scripts/test-devices.mjs`, which already folds every non-zero, non-skip
 * outcome into one "failed" bucket for its own counts. A skipped test is
 * never counted as passed here, in either direction -- the project has
 * shipped that confusion before.
 */
function toDashboardStatus(status: TestResult['status']): DashboardStatus {
  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  return 'failed'; // 'failed' | 'timedOut' | 'interrupted'
}

/**
 * Suite hierarchy is documented (testReporter.d.ts, `Suite.type`) as
 * root -> project -> file -> describe -> ...describe -> test. Walking up to
 * the first `project`-typed suite and reading its title (documented as
 * "Project name for project suite") is more direct than indexing into
 * `test.titlePath()`, which would silently misattribute the project name if
 * the hierarchy ever gained or lost a level.
 */
function projectNameOf(test: TestCase): string {
  let suite: Suite | undefined = test.parent;
  while (suite && suite.type !== 'project') suite = suite.parent;
  return suite?.title || 'unknown-project';
}

export default class JsonlReporter implements Reporter {
  private readonly file: string | undefined;
  private readonly group: string;
  private writeFailed = false;

  constructor() {
    this.file = process.env.DASHBOARD_JSONL_FILE;
    this.group = process.env.DASHBOARD_GROUP || 'unknown-group';
  }

  private append(event: Record<string, unknown>): void {
    if (!this.file || this.writeFailed) return;
    try {
      appendFileSync(
        this.file,
        JSON.stringify({ group: this.group, ...event }) + '\n',
      );
    } catch (error) {
      this.writeFailed = true;
      // eslint-disable-next-line no-console -- deliberate, one-time, visible failure notice; see module doc
      console.error(
        `[jsonl-reporter] failed to write to ${this.file} -- the live dashboard will stop updating for ` +
          `the "${this.group}" group, but the test run itself is unaffected: ${(error as Error).message}`,
      );
    }
  }

  onBegin(_config: unknown, suite: Suite): void {
    if (!this.file) return;
    try {
      // Fresh file per invocation -- an old run's lines must never bleed
      // into this run's dashboard the way an append-only file would if
      // never reset. Truncate-or-create, same "this run overwrites, never
      // accumulates across invocations" contract PLAYWRIGHT_JSON_OUTPUT_NAME
      // already gives the `json` reporter's own output file.
      writeFileSync(this.file, '');
    } catch (error) {
      this.writeFailed = true;
      // eslint-disable-next-line no-console -- deliberate, one-time, visible failure notice; see module doc
      console.error(
        `[jsonl-reporter] failed to create/truncate ${this.file} -- the live dashboard will not see the ` +
          `"${this.group}" group this run, but the test run itself is unaffected: ${(error as Error).message}`,
      );
      return;
    }
    this.append({
      event: 'begin',
      total: suite.allTests().length,
      at: Date.now(),
    });
  }

  onTestBegin(test: TestCase): void {
    this.append({
      event: 'test-start',
      id: test.id,
      title: test.title,
      project: projectNameOf(test),
      at: Date.now(),
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.append({
      event: 'test',
      id: test.id,
      title: test.title,
      project: projectNameOf(test),
      status: toDashboardStatus(result.status),
      durationMs: result.duration,
      at: Date.now(),
    });
  }

  onEnd(_result: FullResult): void {
    this.append({ event: 'end', at: Date.now() });
  }

  printsToStdio(): boolean {
    return false; // this reporter only ever writes to its file, never stdout/stderr
  }
}
