import { execFileSync } from 'node:child_process';

/**
 * Chrome losing foreground mid-run: observed live, at least twice, independently, across this
 * real-device harness's own history -- 147 failed and 62 failed in otherwise-clean runs, versus
 * the usual ~6. `adb shell dumpsys window` showed `com.google.android.googlequicksearchbox`
 * (the phone's configured default assistant -- `adb shell settings get secure assistant`) had
 * taken foreground; pending, unread notifications from that same package (a weather briefing)
 * were present in the notification shade when this was investigated, though
 * `fullscreenIntent=null` on both rules out the most common direct "notification self-launches
 * an activity" mechanism, so the exact trigger remains unconfirmed (screen-sleep and
 * `stay_on_while_plugged_in` were both measured and ruled out -- see
 * docs/superpowers/specs/2026-08-08-real-device-test-harness-design.md for the harness this
 * module is part of).
 *
 * `tests/device/android-preflight.setup.ts`'s own precondition 3 ("Chrome is launched and is
 * the foreground app") only runs ONCE, at the very start of a run -- nothing re-checked it
 * during the ~150s that follow. This module is the fix: a cheap (median ~68ms, measured)
 * re-usable check, called once per test by tests/e2e/fixtures.ts's `page` fixture, BEFORE that
 * test's own actions begin, with one bounded recovery attempt.
 *
 * Deliberately NOT merged into android-preflight.setup.ts's own precondition 3, which already
 * ships, is already reviewed, and already works from a cold start -- this is the same
 * mechanism (identical `am start` intent, identical `dumpsys window` substring check), kept as
 * a small, clearly cross-referenced duplicate rather than a refactor of already-proven code
 * that this triage task has no independent reason to touch. If `dumpsys window`'s own output
 * shape ever changes, both call sites need updating together.
 */

export const CHROME_PACKAGE = 'com.android.chrome';

/**
 * Every `mCurrentFocus=` line from `adb shell dumpsys window` -- there is more than one (one is
 * routinely `null`), so callers check "does ANY line name the package", never trust the first
 * match alone. Identical extraction to android-preflight.setup.ts's own precondition 3.
 */
export function currentFocusLines(): string {
  return execFileSync('adb', ['shell', 'dumpsys', 'window'])
    .toString()
    .split('\n')
    .filter((line) => line.includes('mCurrentFocus='))
    .join('\n');
}

export function isChromeForeground(): boolean {
  return currentFocusLines().includes(CHROME_PACKAGE);
}

/**
 * Launches Chrome to about:blank and polls (condition-based, never a blind sleep) for it to
 * become the reported foreground app -- the identical intent android-preflight.setup.ts's own
 * precondition 3 already proves works from a cold launch. Throws, naming what was actually in
 * foreground instead, if Chrome does not reclaim it within `timeoutMs`.
 */
export async function relaunchChromeAndWaitForeground(
  timeoutMs = 5_000,
): Promise<void> {
  execFileSync('adb', [
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'about:blank',
    CHROME_PACKAGE,
  ]);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (isChromeForeground()) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Chrome did not reclaim the foreground within ${timeoutMs}ms of relaunching it -- ` +
          `current \`dumpsys window\` mCurrentFocus line(s): ${currentFocusLines() || '(none at all)'}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * The per-test guard: if Chrome already holds the foreground, this costs one `dumpsys window`
 * call (median ~68ms) and returns immediately. If something else has taken it, this is
 * `tests/device/chrome-foreground.ts`'s whole reason to exist -- it logs LOUDLY (never a quiet
 * one-line warning easy to scroll past) exactly what was found instead, attempts ONE bounded
 * recovery, and either succeeds (this test proceeds against a freshly-confirmed-foreground
 * Chrome, exactly as if the interruption never happened) or throws a clearly-named error that
 * fails THIS test with the real cause stated outright.
 *
 * Deliberately a PRE-check only (before the test's own actions, not also after): a post-check
 * cannot retroactively change a test's already-recorded verdict, so its only added value is
 * shrinking the window before the NEXT test's own pre-check would catch the same loss anyway --
 * judged not worth doubling this guard's already-nonzero per-test cost for. What this design
 * guarantees: no test ever KNOWINGLY starts against the wrong foreground app. What it does NOT
 * guarantee: if focus is stolen DURING a test's own execution (after its pre-check already
 * passed), that one test's own result is not specially flagged -- but the blast radius is
 * bounded to that single test, because the VERY NEXT test's pre-check catches it before any
 * further test can run against the wrong app. This is what turns an unbounded cascade (147
 * failures) into, at worst, one confusing result per genuine interruption, and turns a
 * PERSISTENT interruption into every affected test failing with the SAME clearly-named cause --
 * trivially recognisable as one root cause, never mistaken for 147 unrelated product defects.
 */
export async function ensureChromeForegroundOrRecover(
  testTitle: string,
): Promise<void> {
  if (isChromeForeground()) return;

  const foundInstead = currentFocusLines();
  process.stderr.write(
    '\n' +
      '!'.repeat(70) +
      '\n' +
      `!! Chrome lost the foreground before "${testTitle}" could start.\n` +
      `!! Expected ${CHROME_PACKAGE}; \`dumpsys window\` shows:\n` +
      `!!   ${foundInstead || '(no mCurrentFocus line at all)'}\n` +
      '!! Attempting one bounded recovery (relaunch Chrome, wait up to 5s)...\n' +
      '!'.repeat(70) +
      '\n\n',
  );

  await relaunchChromeAndWaitForeground(5_000);

  process.stderr.write(
    `==> Recovered: Chrome is foreground again before "${testTitle}". Continuing.\n`,
  );
}
