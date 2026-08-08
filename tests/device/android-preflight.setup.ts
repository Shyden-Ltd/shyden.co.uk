import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

/**
 * Runs before the `android-chrome` project (wired via `dependencies` in
 * playwright.device.config.ts) and establishes, then asserts, every precondition the real
 * device needs. Each precondition is its own test with a written-out failure message, so a
 * red run names its cause instead of surfacing as a generic downstream timeout -- see
 * docs/superpowers/specs/2026-08-08-real-device-test-harness-design.md ("Preconditions are
 * asserted, never assumed").
 *
 * These tests use no Playwright browser/context/page fixture: they talk to the device only
 * through `adb` and a plain HTTP request, because the thing being verified here is whether a
 * browser can be reached at all.
 *
 * Serial mode: order matters (Brave must be stopped before Chrome is asserted foreground;
 * the tunnels must be mapped before the CDP endpoint is asked to answer), and there is no
 * value in running precondition 4 once precondition 1 has already shown there is no device to
 * ask.
 */
test.describe.configure({ mode: 'serial' });

test.describe('android device preflight', () => {
  test('1. adb sees exactly one device, ready', () => {
    const raw = execFileSync('adb', ['devices']).toString();
    const devices = raw
      .split('\n')
      .slice(1) // drop the "List of devices attached" header line
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [serial, state] = line.split(/\s+/);
        return { serial, state };
      });

    expect(
      devices,
      `expected \`adb devices\` to list exactly one device in state 'device' (unplugged, ` +
        `offline, or unauthorized otherwise); got: ${JSON.stringify(devices)}`,
    ).toEqual([expect.objectContaining({ state: 'device' })]);
  });

  test('2. the screen is awake and unlocked', () => {
    const power = execFileSync('adb', ['shell', 'dumpsys', 'power']).toString();
    expect(
      power,
      "expected `dumpsys power` to report mWakefulness=Awake -- the phone's screen is " +
        'asleep; wake it and keep it awake before running the device suite',
    ).toContain('mWakefulness=Awake');

    // KeyguardStateMonitor.mIsShowing is Android's own signal for "the lock screen is
    // currently showing". Confirmed present exactly once in `dumpsys window policy` on this
    // device, so a plain substring match is unambiguous.
    const policy = execFileSync('adb', [
      'shell',
      'dumpsys',
      'window',
      'policy',
    ]).toString();
    expect(
      policy,
      'expected KeyguardStateMonitor.mIsShowing=false in `dumpsys window policy` -- the ' +
        'phone is locked; unlock it before running the device suite',
    ).toContain('mIsShowing=false');
  });

  test('3. Chrome is launched and is the foreground app', async () => {
    // A leftover Brave in the foreground is what caused 30s click timeouts during design-doc
    // measurement (rendering freezes in a backgrounded app; Playwright's actionability check
    // waits for a stable bounding box and never gets one). Force-stop it before launching
    // Chrome so this precondition cannot pass by accident.
    execFileSync('adb', ['shell', 'am', 'force-stop', 'com.brave.browser']);
    execFileSync('adb', [
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      'about:blank',
      'com.android.chrome',
    ]);

    const currentFocusLines = () =>
      execFileSync('adb', ['shell', 'dumpsys', 'window'])
        .toString()
        .split('\n')
        .filter((line) => line.includes('mCurrentFocus='))
        .join('\n');

    // `dumpsys window` prints more than one mCurrentFocus line (one is routinely `null`), so
    // this polls the whole set rather than trusting the first match. Condition-based wait, not
    // a blind sleep: a cold launch can take longer than the very next `adb` round-trip.
    await expect
      .poll(currentFocusLines, {
        message:
          'expected one of the mCurrentFocus lines in `dumpsys window` to name ' +
          'com.android.chrome within 5s of `am start` -- Chrome did not become the ' +
          'foreground app, which is the single most expensive failure mode this preflight ' +
          'exists to catch (it otherwise presents as a bare 30s click timeout)',
        timeout: 5_000,
      })
      .toContain('com.android.chrome');
  });

  test('4. the Chrome DevTools abstract socket exists', () => {
    const unixSockets = execFileSync('adb', [
      'shell',
      'cat',
      '/proc/net/unix',
    ]).toString();
    expect(
      unixSockets,
      'expected /proc/net/unix to list @chrome_devtools_remote -- Chrome only creates this ' +
        'socket once it is running with USB debugging enabled; the previous precondition ' +
        'launched Chrome, so its absence here means that launch did not take',
    ).toContain('@chrome_devtools_remote');
  });

  test('5. adb forward and reverse tunnels are mapped', () => {
    execFileSync('adb', [
      'forward',
      'tcp:9222',
      'localabstract:chrome_devtools_remote',
    ]);
    execFileSync('adb', ['reverse', 'tcp:4321', 'tcp:4321']);

    const forwardList = execFileSync('adb', ['forward', '--list']).toString();
    const reverseList = execFileSync('adb', ['reverse', '--list']).toString();

    expect(
      forwardList,
      "expected `adb forward --list` to map tcp:9222 to the device's chrome_devtools_remote " +
        `socket; got: ${forwardList.trim() || '(empty)'}`,
    ).toContain('tcp:9222 localabstract:chrome_devtools_remote');

    expect(
      reverseList,
      "expected `adb reverse --list` to map tcp:4321 to tcp:4321, so the device's " +
        `localhost:4321 reaches the Mac's dev server; got: ${reverseList.trim() || '(empty)'}`,
    ).toContain('tcp:4321 tcp:4321');
  });

  test('6. the CDP endpoint answers and reports Chrome', async () => {
    const response = await fetch('http://127.0.0.1:9222/json/version');
    expect(
      response.ok,
      `expected HTTP 200 from http://127.0.0.1:9222/json/version over the forwarded tunnel; ` +
        `got HTTP ${response.status}`,
    ).toBe(true);

    const body = await response.json();
    expect(
      body.Browser,
      "expected the CDP /json/version response's 'Browser' field to name Chrome; got: " +
        JSON.stringify(body),
    ).toContain('Chrome');
  });
});
