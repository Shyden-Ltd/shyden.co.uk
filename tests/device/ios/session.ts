/**
 * iOS WebDriver session lifecycle: starts `safaridriver` on a free port,
 * derives the real device and the Mac's reachable address, creates the one
 * WebDriver session the device allows, asserts every precondition with a
 * named cause, and tears both down.
 *
 * See docs/superpowers/specs/2026-08-08-real-device-test-harness-design.md,
 * section 5, for why this exists instead of Playwright.
 *
 * "if (ok) { act() }" with no `else` is a known defect class on this
 * project -- every precondition below asserts its end state and throws a
 * specific, named cause rather than falling through silently.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { waitFor, WebDriver, type WebElement } from './webdriver';

const DEV_SERVER_PORT = 4321;

// ── Precondition 1: the device is present ──────────────────────────────────

interface DevicectlDevice {
  readonly hardwareProperties: {
    readonly udid: string;
    readonly reality: string; // 'physical' | 'simulated' (measured: 'physical' for the real phone)
    readonly deviceType: string; // measured: 'iPhone'
  };
  readonly deviceProperties: {
    readonly name: string;
    readonly osVersionNumber: string;
  };
}

interface DevicectlListOutput {
  readonly result: { readonly devices: readonly DevicectlDevice[] };
}

interface IosDevice {
  readonly udid: string;
  readonly name: string;
  readonly osVersion: string;
}

/**
 * Precondition 1: the device is present per `xcrun devicectl list devices`.
 * `IOS_UDID` overrides which one, when more than one physical iPhone is
 * paired.
 *
 * Measured, not assumed: `xcrun devicectl list devices --json-output -`
 * prints its plain-text table to STDERR and pure JSON to STDOUT when the
 * path argument is `-` (confirmed by redirecting each stream separately),
 * so `execFileSync`'s returned stdout is clean JSON with nothing to strip.
 *
 * Also measured, and the reason this reads a nested field rather than the
 * obvious top-level one: devicectl's top-level `identifier` field is a
 * CoreDevice UUID (e.g. `74563FF8-D1FC-...`), NOT the classic ECID-style
 * UDID `safari:deviceUDID` expects (e.g. `00008150-000954D90A20401C`).
 * Using `identifier` would silently hand safaridriver the wrong value. The
 * real classic UDID lives at `hardwareProperties.udid` (confirmed by
 * walking the full JSON tree for a known UDID string on a live device --
 * it also appears, duplicated, at `properties.hardware.udid`, but
 * `hardwareProperties.udid` is the more directly-typed path here).
 */
function findIosDevice(): IosDevice {
  const raw = execFileSync(
    'xcrun',
    ['devicectl', 'list', 'devices', '--json-output', '-'],
    {
      encoding: 'utf8',
    },
  );

  let parsed: DevicectlListOutput;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `expected \`xcrun devicectl list devices --json-output -\` to print JSON on stdout -- got: ${raw.slice(0, 300)}`,
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

  const [device] = candidates;
  if (!device) {
    // Unreachable given the length checks above; named rather than left to
    // a bare non-null assertion, per this file's own no-silent-guards rule.
    throw new Error(
      'internal error: candidates.length === 1 but candidates[0] is undefined',
    );
  }
  return {
    udid: device.hardwareProperties.udid,
    name: device.deviceProperties.name,
    osVersion: device.deviceProperties.osVersionNumber,
  };
}

// ── Precondition 2: safaridriver started, answers GET /status ─────────────

/** Finds a free TCP port by asking the OS for one and releasing it immediately. */
async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(
          new Error(
            `expected net.Server#address() to return an AddressInfo after listen(0), got: ${JSON.stringify(address)}`,
          ),
        );
        return;
      }
      const { port } = address;
      server.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else resolve(port);
      });
    });
  });
}

/**
 * Precondition 2: `safaridriver` starts and answers `GET /status`.
 *
 * Measured response shape: `{"value":{"message":"","ready":true}}` -- no
 * `build`/`os` sub-objects the generic W3C spec allows for, so this reads
 * only the two fields safaridriver actually sends.
 *
 * Remote Automation is asserted to already be enabled (`safaridriver
 * --enable` already run) rather than run here -- this project does not
 * modify the phone's settings, provisioning or signing.
 */
async function startSafaridriver(port: number): Promise<ChildProcess> {
  const child = spawn('safaridriver', ['-p', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let earlyExit: { code: number | null; signal: NodeJS.Signals | null } | null =
    null;
  child.once('exit', (code, signal) => {
    earlyExit = { code, signal };
  });

  try {
    await waitFor(
      async () => {
        if (earlyExit) {
          const exit: { code: number | null; signal: NodeJS.Signals | null } =
            earlyExit;
          throw new Error(
            `safaridriver exited before answering GET /status (code=${exit.code}, signal=${exit.signal})`,
          );
        }
        const response = await fetch(`http://127.0.0.1:${port}/status`);
        const body = (await response.json()) as { value?: { ready?: boolean } };
        return body.value?.ready === true ? true : undefined;
      },
      {
        timeout: 15_000,
        describe: `safaridriver on port ${port} to answer GET /status with ready:true`,
      },
    );
  } catch (error) {
    child.kill();
    throw error;
  }

  return child;
}

// ── Precondition 3: the LAN IP resolved, and the server answers ───────────

/**
 * Precondition 3a: derives the address the phone will use to reach the Mac.
 *
 * The task brief pins `en0` unconditionally ("derived at runtime
 * (ipconfig getifaddr en0)"). Measured live on this run: `en0`'s address
 * (192.168.1.14, this Mac's Wi-Fi) was reachable from the Mac itself but
 * NOT from the phone -- Safari reported "can't open the page because it
 * couldn't connect to the server" while simultaneously loading
 * https://www.apple.com successfully, meaning the phone had working
 * internet but was not on this Mac's Wi-Fi LAN. The interface that WAS
 * reachable from the phone was `en2`, a 169.254.x.x link-local address
 * that appears while the iPhone is connected over USB (this device's own
 * `devicectl` record shows `transportType: "wired"`).
 *
 * `IOS_LAN_INTERFACE` (default `en0`, matching the brief) lets a caller
 * point this at whichever interface actually reaches the phone, without
 * reintroducing a hardcoded, environment-specific IP: the address is still
 * derived at runtime via `ipconfig getifaddr`, just against a configurable
 * interface name. See task-3a-report.md for the full measurement.
 */
function deriveLanIp(): string {
  const iface = process.env.IOS_LAN_INTERFACE ?? 'en0';
  const raw = execFileSync('ipconfig', ['getifaddr', iface], {
    encoding: 'utf8',
  }).trim();
  if (!raw) {
    throw new Error(
      `\`ipconfig getifaddr ${iface}\` returned no address -- ${iface} has no IPv4 address right now. ` +
        (iface === 'en0'
          ? 'Wi-Fi may be off, or on a different network than the phone. If the phone only reaches this ' +
            'Mac over USB, set IOS_LAN_INTERFACE to that interface instead (e.g. IOS_LAN_INTERFACE=en2).'
          : 'Set IOS_LAN_INTERFACE to the interface that actually reaches the phone.'),
    );
  }
  return raw;
}

/**
 * Precondition 3b: "the server answers on http://<lan-ip>:4321/classroom-groups
 * from the Mac. (If the Mac cannot reach its own LAN IP, neither can the
 * phone.)" -- the brief's own wording and reasoning, implemented exactly.
 *
 * Measured limitation, reported rather than silently patched: this
 * reasoning is a one-way implication, not an if-and-only-if. On this run,
 * the Mac reached its own `en0` address successfully (this check would have
 * PASSED) while the phone genuinely could not reach it -- see
 * `deriveLanIp`'s own comment. This check still catches the case the brief
 * names (a dead/unreachable server), it just cannot catch "phone is on a
 * different network than this interface" by itself -- see task-3a-report.md.
 */
async function assertServerReachable(lanIp: string): Promise<void> {
  const url = `http://${lanIp}:${DEV_SERVER_PORT}/classroom-groups`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(
      `expected the Mac itself to reach ${url} -- fetch threw, so nothing is answering on ` +
        `${lanIp}:${DEV_SERVER_PORT}. Is \`npm run preview -- --host 0.0.0.0\` running? (If the Mac cannot ` +
        'reach its own LAN IP, neither can the phone.)',
      { cause },
    );
  }
  if (!response.ok) {
    throw new Error(
      `expected 2xx from ${url} -- got HTTP ${response.status}. (If the Mac cannot reach its own LAN IP, ` +
        'neither can the phone.)',
    );
  }
}

// ── Precondition 4: the session was created against the intended UDID ─────

async function createVerifiedSession(
  port: number,
  device: IosDevice,
): Promise<WebDriver> {
  const driver = await WebDriver.createSession(`http://127.0.0.1:${port}`, {
    browserName: 'safari',
    platformName: 'iOS',
    'safari:deviceUDID': device.udid,
  });

  const respondedUdid = driver.capabilities['safari:deviceUDID'];
  if (respondedUdid !== device.udid) {
    await driver.deleteSession().catch(() => {});
    throw new Error(
      `expected the session's safari:deviceUDID to echo the requested UDID ${device.udid} -- got ` +
        `${JSON.stringify(respondedUdid)}. A mismatch here means the session was NOT created against the ` +
        'intended real device -- a silently-substituted simulator would otherwise pass as one.',
    );
  }

  // Beyond the brief's own letter, at no extra cost: the response's own
  // `safari:useSimulator` field is a second, direct signal against the
  // exact failure the UDID check above already guards -- "a
  // silently-substituted simulator would otherwise pass as a real device"
  // (task brief, preflight step 4). Not that a simulator could plausibly
  // share a real device's UDID string; this simply reads a field already
  // present in the response and asserts it too.
  const useSimulator = driver.capabilities['safari:useSimulator'];
  if (useSimulator !== false) {
    await driver.deleteSession().catch(() => {});
    throw new Error(
      `expected the session's safari:useSimulator to be false -- got ${JSON.stringify(useSimulator)}. ` +
        'This session is not against the real device.',
    );
  }

  return driver;
}

// ── Public surface ──────────────────────────────────────────────────────

export interface DeviceSession {
  readonly driver: WebDriver;
  readonly baseUrl: string;
  readonly device: IosDevice;
  /** Navigates to `path` on the real server and waits for the page to be interactive. */
  navigateToPath(path: string): Promise<void>;
  /** ALWAYS call this, in a `finally` -- see this file's module doc. */
  teardown(): Promise<void>;
}

/**
 * Runs every precondition in the order the task brief lists them (cheapest,
 * most-likely-to-fail first: no value starting safaridriver if there is no
 * device to ask), then returns a session ready for journeys to drive.
 */
export async function startIosSession(): Promise<DeviceSession> {
  const device = findIosDevice(); // 1: device present

  const port = await pickFreePort();
  const child = await startSafaridriver(port); // 2: safaridriver + /status

  let lanIp: string;
  try {
    lanIp = deriveLanIp(); // 3: LAN IP + reachability
    await assertServerReachable(lanIp);
  } catch (error) {
    child.kill();
    throw error;
  }

  let driver: WebDriver;
  try {
    driver = await createVerifiedSession(port, device); // 4: session + UDID match
  } catch (error) {
    child.kill();
    throw error;
  }

  const baseUrl = `http://${lanIp}:${DEV_SERVER_PORT}`;

  return {
    driver,
    baseUrl,
    device,

    async navigateToPath(path: string): Promise<void> {
      await driver.navigate(`${baseUrl}${path}`);
      // The page's own module script (src/scripts/classroom-groups.ts) is a
      // deferred `type="module"`. `navigate` is specified to block until the
      // load event, which this project has measured to hold in practice
      // (document.readyState was already "complete" immediately after
      // `navigate` returned, on a live check) -- but every journey needs
      // #cg-go to exist regardless, so waiting for it here is a
      // condition-based readiness gate rather than trusting that timing
      // assumption implicitly at every call site.
      await waitFor(
        async () => {
          const found = await driver.findElements('#cg-go');
          return found.length > 0 ? true : undefined;
        },
        {
          timeout: 15_000,
          describe: `#cg-go to exist after navigating to ${path}`,
        },
      );
    },

    async teardown(): Promise<void> {
      // HARD rule: always DELETE /session/{id}, or the next run is locked
      // out -- iOS concurrency is exactly one session, by Apple's design.
      // Guarded so a session that is already gone for some other reason
      // cannot stop safaridriver itself from being killed too.
      try {
        await driver.deleteSession();
      } catch (error) {
        // eslint-disable-next-line no-console -- teardown must not throw past this point
        console.error(
          'Failed to delete the WebDriver session during teardown (continuing to stop safaridriver):',
          error,
        );
      } finally {
        child.kill();
      }
    },
  };
}

export type { WebElement };
