import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EVIDENCE_MANIFEST,
  manifestRow,
  slug,
} from '../../../scripts/evidence-files.mjs';

/**
 * Capture, from the leg that cannot use `shoot`.
 *
 * `tests/e2e/evidence.ts` reads `test.info()` for the project name and the
 * title, which only exists under Playwright. These journeys run under Vitest
 * and drive a real iPhone over WebDriver, so `shoot` is not merely
 * inconvenient here -- it is uncallable.
 *
 * #189 AC11 is why this exists: the reported clipping case has to be confirmed
 * on a real phone, and an operator can only judge it by seeing it. The desktop
 * suite has to STUB the refused fullscreen grant (`addInitScript`); the phone
 * refuses natively, which is the whole point of asking for one.
 *
 * Two properties copied deliberately from `shoot`, because they are what make
 * the evidence worth anything:
 *
 * 1. **Captured DURING the run, never retrofitted**, and called AFTER the
 *    assertion it documents -- so the existence of the image is itself the
 *    result. Vitest stops a test at the first failed `expect`, exactly as
 *    Playwright does, so a missing shot is a failed or unreached assertion.
 * 2. **Free when not wanted.** Gated on `EVIDENCE_DIR`. A screenshot is a
 *    round trip to a physical device, so an ordinary gauntlet must not pay for
 *    captures nobody asked for.
 *
 * The format is PNG, not the JPEG every other leg writes: WebDriver returns
 * base64 PNG and re-encoding would mean a new dependency, which is an operator
 * decision. Nothing downstream cares -- `mediaType` in the page builder sniffs
 * MAGIC BYTES rather than the extension, and throws on anything it cannot
 * recognise instead of emitting a src the browser cannot paint. That seam is
 * asserted in `tests/unit/device-evidence.test.ts` against this leg's own
 * bytes, because neither side proves it alone.
 */

/**
 * The only thing a capture needs from a driver.
 *
 * Structural, not `WebDriver`, so the unit test can prove the counter, the
 * paths and the manifest row without a phone in the room -- and so that "did
 * not capture" is provable by a driver that counts its own calls.
 */
export interface Screenshotter {
  /** Base64 PNG, as WebDriver's `GET /screenshot` returns it. */
  screenshot(): Promise<string>;
}

/** What one capture says about itself; `order` is this module's to assign. */
export interface DeviceCapture {
  project: string;
  title: string;
  label: string;
}

const counters = new Map<string, number>();

/**
 * Forget the per-journey capture numbering.
 *
 * Exported for the unit test alone. A counter that survived between test cases
 * would number the second case's first shot `02`, and the assertion would then
 * be describing test order rather than the journey.
 */
export const resetDeviceCaptureCounters = (): void => counters.clear();

/**
 * Record one assertion as an image plus a manifest line.
 *
 * `EVIDENCE_DIR` is read HERE rather than once at module load, unlike
 * `tests/e2e/evidence.ts`. The device harness spawns each group with its own
 * environment (`scripts/test-devices.mjs`), and a module-level read is also a
 * value no test can change without resetting the module registry.
 *
 * Returns the manifest-relative path it wrote, or `null` when no evidence was
 * asked for, so a caller can assert what happened rather than infer it.
 */
export const shootDevice = async (
  driver: Screenshotter,
  capture: DeviceCapture,
  now: () => Date = () => new Date(),
): Promise<string | null> => {
  const dir = process.env.EVIDENCE_DIR;
  if (!dir) return null;

  const { project, title, label } = capture;
  const key = `${project}|${title}`;
  const order = (counters.get(key) ?? 0) + 1;
  counters.set(key, order);

  const file = join(
    slug(project),
    `${slug(title)}__${String(order).padStart(2, '0')}-${slug(label)}.png`,
  );

  mkdirSync(join(dir, slug(project)), { recursive: true });
  writeFileSync(
    join(dir, file),
    Buffer.from(await driver.screenshot(), 'base64'),
  );
  appendFileSync(
    join(dir, EVIDENCE_MANIFEST),
    JSON.stringify(manifestRow({ project, title, order, label, file }, now())) +
      '\n',
    'utf8',
  );

  return file;
};
