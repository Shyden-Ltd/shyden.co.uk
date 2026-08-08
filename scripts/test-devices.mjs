#!/usr/bin/env node
/**
 * `npm run test:devices` -- one build, one shared server, three device
 * groups at once: the existing emulated Playwright suite (5 projects), the
 * real Android phone over CDP, and the real iPhone over WebDriver. See
 * docs/superpowers/specs/2026-08-08-real-device-test-harness-design.md,
 * section 7 ("Parallelism"), for the shape this implements:
 *
 *   build once -> serve dist on 0.0.0.0:4321 -> desktop   (5 projects)   N workers
 *                                             -> android   (real Chrome)  1 worker
 *                                             -> ios       (real Safari)  1 session
 *
 * Desktop, Android and iOS are independent hardware and should not fight
 * each other for port 4321 or rebuild the site three times -- this script
 * builds and serves exactly once, proves the result is a genuinely fresh
 * build (not something already listening on 4321 left over from a previous
 * run), and only then hands all three groups `PW_REUSE_SERVER=1` so their
 * own `webServer` blocks adopt the already-running server instead of
 * starting their own.
 *
 * WHY THE ANDROID GROUP DOES NOT re-implement Brave-stopping, Chrome-
 * launching, or the adb forward/reverse tunnels here, even though the task
 * brief's own step 3 lists exactly those actions: `playwright.device.config.ts`
 * already runs `tests/device/android-preflight.setup.ts` as a project
 * DEPENDENCY of `android-chrome`, and that file already does precisely this
 * (Task 1, shipped and reviewed) -- every time `android-chrome` is asked
 * for, Playwright runs `android-preflight` first, automatically. Re-doing
 * the same adb calls here, moments before Playwright does them again
 * itself, would be redundant, a second place for this logic to drift from
 * the first, and no more correct. This script's own job for Android is
 * narrower: decide whether to attempt the group at all (a device must be
 * physically present), free the ONE port every group shares, and interpret
 * the result honestly.
 *
 * HARD RULES this file exists to satisfy (task brief + project standards):
 *  - Every child process's exit code is read directly off that child's own
 *    `close` event. Nothing is ever piped into another command -- a pipe
 *    reports the LAST command's exit status, which has silently turned red
 *    runs green on this project before.
 *  - No sleeps. Every wait (`waitUntil`) polls a real condition with a
 *    bounded timeout; the clock is a safety net, never the success signal.
 *  - Servers are killed BY PORT (`lsof -nP -iTCP:<port> -sTCP:LISTEN -t`),
 *    never `pkill -f`, which would just as easily match this script's own
 *    waiters.
 *  - A device that is not physically present is reported as NOT RUN, never
 *    silently omitted and never counted as passed -- see `isAndroidPresent`
 *    and `isIosPresent`, and the overall exit-code rule at the end of
 *    `main()` (any `not-run` group fails the whole run, same as a real
 *    failure would).
 *  - Cleanup (preview server, adb tunnels, any live iOS WebDriver session)
 *    always runs, via `finally` and a signal handler -- see `cleanup()`.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4321;
const TEST_RESULTS_DIR = path.join(ROOT, 'test-results');
const IOS_MODE_FILE = path.join(TEST_RESULTS_DIR, 'ios-mode.json');
const IOS_SESSION_MARKER_FILE = path.join(
  TEST_RESULTS_DIR,
  'ios-session-marker.json',
);

// ── small generic helpers ──────────────────────────────────────────────

/** Polls `predicate` until truthy, or throws naming what was awaited. Never a sleep-and-hope: the condition itself decides, the timeout is only a safety net against a hung device or process. */
async function waitUntil(predicate, { timeoutMs, describe, intervalMs = 250 }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await predicate();
    if (result) return result;
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for: ${describe}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Splits a child's stdout/stderr into lines and forwards each, tagged, to this process's own streams -- live, not batched at the end, so a human watching a multi-minute group still sees progress. */
function tagOutput(tag, child) {
  const forward = (stream, out) => {
    let buffer = '';
    stream.on('data', (data) => {
      buffer += data.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) out.write(`[${tag}] ${line}\n`);
    });
    stream.on('end', () => {
      if (buffer.length > 0) out.write(`[${tag}] ${buffer}\n`);
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
}

/** Spawns without a shell (array-form argv, never a pipe) and returns the live child immediately -- for long-running processes (the preview server) the caller needs a handle to, not a settled result. */
function spawnTagged(tag, command, args, { env, cwd = ROOT } = {}) {
  const child = spawn(command, args, {
    cwd,
    env: env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  tagOutput(tag, child);
  return child;
}

/** Resolves with the exit code read DIRECTLY off this exact child's own `close` event -- never scraped from stdout, never inferred from a pipe's own status. */
function waitForClose(child, command, args) {
  return new Promise((resolve, reject) => {
    child.once('error', (err) =>
      reject(
        new Error(
          `failed to start \`${command} ${args.join(' ')}\`: ${err.message}`,
          {
            cause: err,
          },
        ),
      ),
    );
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

/** spawnTagged + waitForClose, for one-shot commands this script needs the real outcome of before moving on. */
async function runTagged(tag, command, args, opts) {
  const child = spawnTagged(tag, command, args, opts);
  return waitForClose(child, command, args);
}

function readJson(file, description) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(
      `expected to read ${description} at ${path.relative(ROOT, file)}: ${error.message}`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `expected ${description} at ${path.relative(ROOT, file)} to be valid JSON: ${error.message}`,
    );
  }
}

// ── port ownership: kill by port, never by process-name pattern ────────

function pidsListeningOnPort(port) {
  try {
    const out = execFileSync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      { encoding: 'utf8' },
    );
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
  } catch (error) {
    // `lsof` exits 1 with empty stdout when nothing matches the filter --
    // that is "port is free", not a real error. Anything else (lsof
    // missing, a permissions problem) is a genuine failure and must not be
    // swallowed into a false "free".
    if (error.status === 1 && !error.stdout) return [];
    throw error;
  }
}

/**
 * Kills whatever is LISTENING on `port`, identified only by that -- never
 * `pkill -f` matching a command-line pattern, which would just as easily
 * catch this very script's own `waitUntil` polling loops (this project has
 * been burned by exactly that pattern before). SIGTERM first, escalating
 * to SIGKILL only if the port is still occupied after a grace period.
 * Idempotent: does nothing, successfully, if the port is already free.
 */
async function killByPort(port) {
  let pids = pidsListeningOnPort(port);
  if (pids.length === 0) return;
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone between the lsof snapshot and this kill -- fine.
    }
  }
  try {
    await waitUntil(() => pidsListeningOnPort(port).length === 0, {
      timeoutMs: 10_000,
      describe: `port ${port} to become free after SIGTERM`,
    });
  } catch {
    pids = pidsListeningOnPort(port);
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone -- fine.
      }
    }
    await waitUntil(() => pidsListeningOnPort(port).length === 0, {
      timeoutMs: 5_000,
      describe: `port ${port} to become free after SIGKILL`,
    });
  }
}

async function waitForHttpOk(url, { timeoutMs, describe }) {
  return waitUntil(
    async () => {
      try {
        const response = await fetch(url);
        return response.ok ? response : undefined;
      } catch {
        return undefined;
      }
    },
    { timeoutMs, describe },
  );
}

// ── device presence: real checks, not a config flag ────────────────────

/**
 * `adb devices`, parsed the same way `tests/device/android-preflight.setup.ts`
 * asserts it (state must be exactly `device`, not merely present-but-locked
 * or unauthorized). Not imported from that file -- it is a Playwright test,
 * not an exported function, and plain Node cannot load this project's other
 * device-facing TypeScript either way (see `findIosDeviceOrThrow`'s comment
 * for the measured reason). A self-contained, cross-referenced duplicate of
 * this same `adb devices` parsing, kept deliberately small.
 *
 * `ANDROID_SERIAL` (a real, standard adb environment variable) disambiguates
 * when more than one device is attached, the same role `IOS_UDID` plays for
 * `findIosDeviceOrThrow` below -- set it to a serial that is not attached
 * and this function honestly reports absence. That is also how this run's
 * "device absent" proof was produced for a phone this agent has no hands to
 * physically unplug: point this env var at a serial that is not attached
 * and the real detection logic reports absence honestly, exactly as it
 * would for a genuinely disconnected device.
 */
function isAndroidPresent() {
  let raw;
  try {
    raw = execFileSync('adb', ['devices'], { encoding: 'utf8' });
  } catch (error) {
    return {
      present: false,
      reason: `\`adb devices\` failed to run: ${error.message}`,
    };
  }
  const devices = raw
    .split('\n')
    .slice(1) // drop the "List of devices attached" header line
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    });

  const ready = devices.filter((d) => d.state === 'device');
  const override = process.env.ANDROID_SERIAL;
  const matching = override
    ? ready.filter((d) => d.serial === override)
    : ready;

  if (matching.length === 0) {
    return {
      present: false,
      reason: override
        ? `\`adb devices\` did not list serial ${override} (from ANDROID_SERIAL) in state 'device' -- ` +
          `seen: ${JSON.stringify(devices)}`
        : `\`adb devices\` listed no device in state 'device' (unplugged, asleep, offline, or ` +
          `unauthorized otherwise) -- seen: ${JSON.stringify(devices)}`,
    };
  }
  if (matching.length > 1) {
    return {
      present: false,
      reason:
        `expected exactly one ready Android device -- found ${matching.length}: ` +
        `${JSON.stringify(matching)}. Set ANDROID_SERIAL to disambiguate.`,
    };
  }
  return { present: true, serial: matching[0].serial };
}

/**
 * A deliberate, cross-referenced DUPLICATE of `findIosDevice` in
 * tests/device/ios/session.ts -- not imported from there. Measured, not a
 * style choice: this script tried importing that file directly (this
 * repo's pinned Node, .nvmrc: 24, does strip TypeScript *types* natively)
 * and it failed with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` -- `session.ts`
 * transitively pulls in `webdriver.ts` and `interaction.ts`, both of which
 * use constructor PARAMETER PROPERTIES (e.g. `constructor(private readonly
 * driver: WebDriver)`), a real syntax transform, not mere type erasure,
 * which Node's strip-only mode explicitly does not support. Rewriting
 * those already-shipped, already-reviewed files to dodge that -- purely so
 * this script could import them -- was judged a worse trade than one
 * small, clearly-labelled duplication. If `xcrun devicectl`'s JSON shape
 * ever changes, both this function and session.ts's `findIosDevice` need
 * updating together.
 */
function findIosDeviceOrThrow() {
  const raw = execFileSync(
    'xcrun',
    ['devicectl', 'list', 'devices', '--json-output', '-'],
    { encoding: 'utf8' },
  );

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `expected \`xcrun devicectl list devices --json-output -\` to print JSON on stdout -- got: ` +
        `${raw.slice(0, 300)}`,
      { cause },
    );
  }

  const physicalIphones = parsed.result.devices.filter(
    (d) =>
      d.hardwareProperties.reality === 'physical' &&
      d.hardwareProperties.deviceType === 'iPhone',
  );

  const override = process.env.IOS_UDID;
  const candidates = override
    ? physicalIphones.filter((d) => d.hardwareProperties.udid === override)
    : physicalIphones;

  if (candidates.length === 0) {
    const seen = physicalIphones.map((d) => d.hardwareProperties.udid);
    throw new Error(
      override
        ? `expected \`xcrun devicectl list devices\` to include a physical iPhone with udid ${override} ` +
            `(from IOS_UDID) -- none found; physical iPhones seen: ${JSON.stringify(seen)}`
        : 'expected `xcrun devicectl list devices` to list at least one physical iPhone -- none found. ' +
            'Is it connected, paired and trusted? (Set IOS_UDID to target one by UDID.)',
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `expected exactly one physical iPhone to target -- found ${candidates.length}: ` +
        `${JSON.stringify(candidates.map((d) => d.hardwareProperties.udid))}. Set IOS_UDID to disambiguate.`,
    );
  }

  return candidates[0];
}

function isIosPresent() {
  try {
    const device = findIosDeviceOrThrow();
    return {
      present: true,
      udid: device.hardwareProperties.udid,
      name: device.deviceProperties.name,
    };
  } catch (error) {
    return { present: false, reason: error.message };
  }
}

// ── one-off discovery: how many tests does @emulated-viewport exclude? ──

/**
 * `android-chrome`'s `grepInvert: /@emulated-viewport/` (playwright.device.config.ts)
 * excludes tagged tests before Playwright's own JSON reporter ever sees them
 * -- they are not "skipped", they are never collected, so the real run's
 * own report has no number for them at all. This asks separately, freshly,
 * every run: `--list --grep=@emulated-viewport` against ANY project sharing
 * android-chrome's `tests/e2e/*.spec.ts` scope directly SELECTS the tagged
 * set (chromium is a convenient, arbitrary choice -- one project, no
 * filtering of its own). `tests/device/real-device.spec.ts`, the one file
 * android-chrome matches that chromium's own testDir does not reach, carries
 * zero @emulated-viewport tags (checked by hand), so restricting this
 * listing to tests/e2e does not undercount.
 *
 * Never hardcoded: measured live against this exact source tree, every run,
 * so a future test gaining or losing the tag cannot make this number rot.
 * `--list`'s own JSON reporter marks every listed test `skipped` (nothing
 * ran) -- measured directly before being trusted: this exact invocation
 * reported `stats.skipped: 47` here, matching both the human-readable
 * "Total: 47 tests" line it printed and Task 2's independently hand-counted
 * figure (task-2-report.md).
 */
async function countEmulatedViewportExclusions() {
  const outFile = path.join(TEST_RESULTS_DIR, 'emulated-viewport-count.json');
  const { code } = await runTagged(
    'discover',
    'npx',
    [
      'playwright',
      'test',
      '--config=playwright.config.ts',
      '--project=chromium',
      '--list',
      '--grep=@emulated-viewport',
      '--reporter=json',
    ],
    { env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: outFile } },
  );
  if (code !== 0) {
    throw new Error(
      'expected `playwright test --list --grep=@emulated-viewport` to exit 0 (it only lists tests, ' +
        `never runs them) -- got code ${code}. Cannot compute the Android group's skipped-by-design count.`,
    );
  }
  const report = readJson(outFile, 'the @emulated-viewport discovery listing');
  return report.stats.skipped;
}

// ── the three groups ────────────────────────────────────────────────────

function summarizePlaywrightGroup(
  name,
  code,
  reportFile,
  durationMs,
  { extraSkipped = 0 } = {},
) {
  if (!existsSync(reportFile)) {
    return {
      name,
      status: 'failed',
      passed: null,
      failed: null,
      skippedByDesign: null,
      durationMs,
      reason:
        `the process exited with code ${code} but its JSON report ` +
        `(${path.relative(ROOT, reportFile)}) was never written -- cannot verify real counts, so this ` +
        'cannot be reported as anything other than failed.',
    };
  }
  const report = readJson(reportFile, `${name}'s Playwright JSON report`);
  const passed = report.stats.expected + report.stats.flaky;
  const failed = report.stats.unexpected;
  const skippedByDesign = report.stats.skipped + extraSkipped;
  const jsonSaysOk = failed === 0;
  const processSaysOk = code === 0;
  const status = jsonSaysOk && processSaysOk ? 'passed' : 'failed';
  const reason =
    status === 'passed'
      ? undefined
      : jsonSaysOk !== processSaysOk
        ? `disagreement: process exit code ${code} but the JSON report says ${failed} failed -- treated ` +
          'as failed either way, since these should never disagree'
        : `${failed} test(s) failed (process exit code ${code})`;
  return { name, status, passed, failed, skippedByDesign, durationMs, reason };
}

async function runDesktopGroup() {
  const name = 'desktop';
  const reportFile = path.join(TEST_RESULTS_DIR, 'desktop-report.json');
  const startedAt = Date.now();
  const { code } = await runTagged(
    name,
    'npx',
    [
      'playwright',
      'test',
      '--config=playwright.config.ts',
      '--reporter=list,json',
    ],
    {
      env: {
        ...process.env,
        PW_REUSE_SERVER: '1',
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile,
      },
    },
  );
  return summarizePlaywrightGroup(
    name,
    code,
    reportFile,
    Date.now() - startedAt,
  );
}

async function runAndroidGroup(excludedByDesign) {
  const name = 'android';
  const startedAt = Date.now();
  const presence = isAndroidPresent();
  if (!presence.present) {
    process.stdout.write(
      `[${name}] device absent -- not attempting this group: ${presence.reason}\n`,
    );
    return {
      name,
      status: 'not-run',
      passed: null,
      failed: null,
      skippedByDesign: null,
      durationMs: Date.now() - startedAt,
      reason: presence.reason,
    };
  }

  const reportFile = path.join(TEST_RESULTS_DIR, 'android-report.json');
  const { code } = await runTagged(
    name,
    'npx',
    [
      'playwright',
      'test',
      '--config=playwright.device.config.ts',
      '--reporter=list,json',
    ],
    {
      env: {
        ...process.env,
        PW_REUSE_SERVER: '1',
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile,
      },
    },
  );
  return summarizePlaywrightGroup(
    name,
    code,
    reportFile,
    Date.now() - startedAt,
    {
      extraSkipped: excludedByDesign,
    },
  );
}

async function runIosGroup() {
  const name = 'ios';
  const startedAt = Date.now();
  const presence = isIosPresent();
  if (!presence.present) {
    process.stdout.write(
      `[${name}] device absent -- not attempting this group: ${presence.reason}\n`,
    );
    return {
      name,
      status: 'not-run',
      passed: null,
      failed: null,
      skippedByDesign: null,
      durationMs: Date.now() - startedAt,
      reason: presence.reason,
    };
  }

  // This run's own mode, not a stale one a previous invocation left behind
  // -- `startIosSession` also clears this on its own next attempt, but
  // clearing it here too means a group that never even reaches
  // `startIosSession` (e.g. it fails before that) cannot be attributed a
  // leftover mode from an earlier run.
  if (existsSync(IOS_MODE_FILE)) unlinkSync(IOS_MODE_FILE);

  const reportFile = path.join(TEST_RESULTS_DIR, 'ios-report.json');
  const { code } = await runTagged(
    name,
    'npx',
    [
      'vitest',
      'run',
      '--config=vitest.ios.config.ts',
      '--reporter=verbose',
      '--reporter=json',
      `--outputFile.json=${reportFile}`,
    ],
    { env: { ...process.env } },
  );
  const durationMs = Date.now() - startedAt;

  const modeInfo = existsSync(IOS_MODE_FILE)
    ? readJson(IOS_MODE_FILE, "iOS's interaction-mode artifact")
    : null;
  // Design doc s5a, restated for THIS process's own output: a run where
  // taps were never taps must not read like one where they were.
  // `modeInfo.description` is the FULL sentence session.ts already rendered
  // via its own `describeInteractionMode` call -- read verbatim, not
  // recomputed here, because this script cannot import that function
  // directly (see `findIosDeviceOrThrow`'s own comment for the measured
  // reason) and a hand-copied paraphrase could drift from the source of
  // truth the moment either file is edited.
  const modeNote = modeInfo
    ? modeInfo.description
    : '[iOS interaction mode] UNKNOWN -- ios-mode.json was not written this run, which means the ' +
      'session never reached the design doc s5a canary. Treat any iOS result this run as unverified ' +
      'for touch-input claims.';

  if (!existsSync(reportFile)) {
    return {
      name,
      status: 'failed',
      passed: null,
      failed: null,
      skippedByDesign: null,
      durationMs,
      reason: `the process exited with code ${code} but its JSON report was never written`,
      modeNote,
    };
  }
  const report = readJson(reportFile, "iOS's vitest JSON report");
  const passed = report.numPassedTests;
  const failed = report.numFailedTests;
  const skippedByDesign = report.numPendingTests + (report.numTodoTests ?? 0);
  const jsonSaysOk = failed === 0 && report.success === true;
  const processSaysOk = code === 0;
  const status = jsonSaysOk && processSaysOk ? 'passed' : 'failed';
  const reason =
    status === 'passed'
      ? undefined
      : jsonSaysOk !== processSaysOk
        ? `disagreement: process exit code ${code} but the JSON report says ${failed} failed -- treated ` +
          'as failed either way'
        : `${failed} test(s) failed (process exit code ${code})`;

  return {
    name,
    status,
    passed,
    failed,
    skippedByDesign,
    durationMs,
    reason,
    modeNote,
  };
}

// ── cleanup: always runs, whatever happened above ───────────────────────

async function cleanupAdbTunnels() {
  // Measured directly: `adb reverse --remove-all` / `adb forward --remove-all`
  // both exit 0 against a device with nothing mapped -- safe no-ops, so
  // these run unconditionally, not gated on whether the Android group
  // actually attempted anything.
  for (const args of [
    ['forward', '--remove-all'],
    ['reverse', '--remove-all'],
  ]) {
    try {
      execFileSync('adb', args, { stdio: 'ignore' });
    } catch (error) {
      // No device attached at all makes plain `adb` fail outright -- fine,
      // there is nothing to remove. Anything else is logged, not thrown:
      // cleanup must not itself abort the rest of cleanup.
      process.stderr.write(
        `cleanup: \`adb ${args.join(' ')}\` failed (continuing): ${error.message}\n`,
      );
    }
  }
}

/**
 * "one leaked iOS session locks the phone out of every later run" (task
 * brief). If `tests/device/ios/session.ts` left its marker file behind,
 * `teardown()` either never ran (this process was killed) or ran and its
 * own DELETE failed -- either way, close the session directly and free its
 * safaridriver port BY PORT (the same mechanism as the preview server,
 * never a process-name match).
 */
async function cleanupLeakedIosSession() {
  if (!existsSync(IOS_SESSION_MARKER_FILE)) return;
  process.stdout.write(
    '==> Found a leaked iOS WebDriver session marker -- cleaning it up so the phone is not locked ' +
      'out of the next run...\n',
  );
  let marker;
  try {
    marker = readJson(IOS_SESSION_MARKER_FILE, 'the leaked iOS session marker');
  } catch (error) {
    process.stderr.write(
      `cleanup: could not read the iOS session marker: ${error.message}\n`,
    );
    return;
  }
  const { port, sessionId } = marker;
  try {
    await fetch(`http://127.0.0.1:${port}/session/${sessionId}`, {
      method: 'DELETE',
    });
    process.stdout.write(
      `==> Deleted leaked WebDriver session ${sessionId}.\n`,
    );
  } catch (error) {
    process.stderr.write(
      `cleanup: DELETE on the leaked WebDriver session failed (continuing to free its port anyway): ` +
        `${error.message}\n`,
    );
  }
  await killByPort(port).catch((error) =>
    process.stderr.write(
      `cleanup: failed to free safaridriver's port ${port}: ${error.message}\n`,
    ),
  );
  try {
    unlinkSync(IOS_SESSION_MARKER_FILE);
  } catch {
    // Already gone -- fine.
  }
}

// ── reporting ────────────────────────────────────────────────────────────

function cell(value) {
  return value === null || value === undefined ? '-' : String(value);
}

function printSummaryTable(groups, totalDurationMs) {
  const headers = [
    'Group',
    'Passed',
    'Failed',
    'Skipped(design)',
    'Not-run',
    'Duration',
  ];
  const rows = groups.map((g) => [
    g.name,
    g.status === 'not-run' ? '-' : cell(g.passed),
    g.status === 'not-run' ? '-' : cell(g.failed),
    g.status === 'not-run' ? '-' : cell(g.skippedByDesign),
    g.status === 'not-run' ? 'YES' : '-',
    `${(g.durationMs / 1000).toFixed(1)}s`,
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const renderRow = (cells) =>
    cells.map((c, i) => c.padEnd(widths[i])).join('  ');

  process.stdout.write('\n' + renderRow(headers) + '\n');
  process.stdout.write(widths.map((w) => '-'.repeat(w)).join('  ') + '\n');
  for (const row of rows) process.stdout.write(renderRow(row) + '\n');
  process.stdout.write(
    `\nTotal wall-clock: ${(totalDurationMs / 1000).toFixed(1)}s\n`,
  );

  const notes = groups.filter((g) => g.reason || g.modeNote);
  if (notes.length > 0) {
    process.stdout.write('\nNotes:\n');
    for (const g of notes) {
      if (g.reason) process.stdout.write(`  - ${g.name}: ${g.reason}\n`);
      if (g.modeNote) process.stdout.write(`  - ${g.name}: ${g.modeNote}\n`);
    }
  }
  process.stdout.write('\n');
}

// ── main ─────────────────────────────────────────────────────────────────

let previewChild = null;
let cleanedUp = false;

async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  if (previewChild) {
    process.stdout.write('==> Stopping the shared preview server...\n');
    await killByPort(PORT).catch((error) =>
      process.stderr.write(
        `cleanup: failed to free port ${PORT}: ${error.message}\n`,
      ),
    );
  }
  await cleanupAdbTunnels();
  await cleanupLeakedIosSession();
}

// Ctrl+C (or a CI-style SIGTERM) must not skip cleanup -- a leaked iOS
// session locks the phone out of every later run, which is worse than
// letting the interrupted run's own results go unreported. The default
// Node behaviour for these signals is to exit immediately without running
// pending `finally` blocks, so this is not redundant with the try/finally
// in `main()` below -- it is the path that catches what that one cannot.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    process.stdout.write(
      `\n==> Received ${signal}, cleaning up before exit...\n`,
    );
    await cleanup();
    process.exit(130);
  });
}

async function main() {
  mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  const startedAt = Date.now();

  try {
    // MUST run before anything else, not only in the end-of-run `cleanup()`
    // below. Measured directly: `startIosSession` (session.ts) clears its
    // OWN marker file unconditionally the moment it is called, so this
    // run's iOS group would otherwise silently destroy
    // the evidence of a PREVIOUS run's leaked session before ever cleaning
    // it up -- and then fail anyway, because the device still considers
    // itself paired with that orphaned session (Apple allows exactly one).
    // Cleaning up any pre-existing leak here, before the iOS group ever
    // attempts a new session, is what actually prevents "one leaked session
    // locks the phone out of every later run".
    await cleanupLeakedIosSession();

    process.stdout.write(
      '==> Freeing port 4321 (any stale server from a previous run)...\n',
    );
    await killByPort(PORT);

    process.stdout.write('==> Building (npm run build)...\n');
    const build = await runTagged('build', 'npm', ['run', 'build']);
    if (build.code !== 0) {
      throw new Error(
        `\`npm run build\` exited with code ${build.code} -- aborting the whole run.`,
      );
    }

    process.stdout.write(
      '==> Starting the shared preview server (npm run preview -- --host 0.0.0.0)...\n',
    );
    previewChild = spawnTagged('preview', 'npm', [
      'run',
      'preview',
      '--',
      '--host',
      '0.0.0.0',
    ]);
    await waitForHttpOk(`http://localhost:${PORT}/classroom-groups`, {
      timeoutMs: 30_000,
      describe: `the shared preview server to answer on :${PORT}`,
    });

    // Brief step 2(d): a built page references a hashed asset under
    // /_astro/. If that marker is absent, the server on 4321 is not
    // previewing a fresh build -- abort the WHOLE run rather than warn and
    // let three groups measure the wrong bytes.
    const freshnessCheck = await fetch(
      `http://localhost:${PORT}/classroom-groups`,
    );
    const body = await freshnessCheck.text();
    if (!body.includes('/_astro/')) {
      throw new Error(
        'expected the response from /classroom-groups to reference a hashed /_astro/ asset (proof of ' +
          'a fresh `astro build`) -- it does not. The server on port 4321 is not serving a fresh build; ' +
          'aborting the whole run rather than testing the wrong bytes.',
      );
    }
    process.stdout.write(
      '==> Confirmed: the shared server is previewing a fresh build (/_astro/ marker found).\n',
    );

    process.stdout.write(
      '==> Counting @emulated-viewport exclusions (static, source-only fact)...\n',
    );
    const excludedByDesign = await countEmulatedViewportExclusions();
    process.stdout.write(
      `==> ${excludedByDesign} test(s) excluded by @emulated-viewport for the Android group.\n`,
    );

    process.stdout.write(
      '==> Launching desktop, android and ios concurrently...\n\n',
    );
    const groups = await Promise.all([
      runDesktopGroup(),
      runAndroidGroup(excludedByDesign),
      runIosGroup(),
    ]);

    await cleanup();

    printSummaryTable(groups, Date.now() - startedAt);
    const anyBad = groups.some((g) => g.status !== 'passed');
    process.exitCode = anyBad ? 1 : 0;
  } catch (fatal) {
    process.stderr.write(`\nABORTED: ${fatal.message}\n\n`);
    process.exitCode = 1;
    await cleanup();
  }
}

await main();
