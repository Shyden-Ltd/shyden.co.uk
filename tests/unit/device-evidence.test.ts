import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaType } from '../../scripts/build-evidence-page.mjs';
import {
  EVIDENCE_MANIFEST,
  manifestRow,
  slug,
} from '../../scripts/evidence-files.mjs';
import {
  resetDeviceCaptureCounters,
  shootDevice,
  shrinkToCssScale,
} from '../device/ios/evidence';

/**
 * The evidence contract, proved for the leg that cannot use `shoot`.
 *
 * `tests/e2e/evidence.ts` is Playwright-only: it reads `test.info()` for the
 * project name, so it cannot be called from the iOS journeys, which run under
 * Vitest and drive a real phone over WebDriver. AC11 of #189 wants the
 * reported case confirmed on that phone, and an operator can only judge it if
 * the capture reaches the same page as every other shot.
 *
 * So the device leg writes the SAME manifest, through the SAME `manifestRow`
 * and `slug` -- which is why those two moved to the contract module. A second
 * implementation of either would be a second naming scheme the day one of them
 * changed, and the page would show a picture nobody could trace to a run.
 */

/**
 * A real 1x1 PNG, base64, exactly as WebDriver's `GET /screenshot` returns it.
 *
 * Real bytes rather than a placeholder string on purpose: the seam this file
 * protects is that the page builder can still recognise what the device leg
 * writes. Every existing capture is a JPEG; this leg cannot encode one without
 * a new dependency, so it writes PNG -- and a fake payload would assert
 * nothing about whether that survives `mediaType`.
 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** A driver that counts its own calls, so "did not capture" is provable. */
const fakeDriver = (b64 = PNG_BASE64) => {
  let calls = 0;
  return {
    calls: () => calls,
    screenshot: async () => {
      calls += 1;
      return b64;
    },
  };
};

const evidenceDir = () => mkdtempSync(join(tmpdir(), 'device-evidence-'));

const rowsIn = (dir: string) =>
  readFileSync(join(dir, EVIDENCE_MANIFEST), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));

afterEach(() => {
  vi.unstubAllEnvs();
  resetDeviceCaptureCounters();
});

describe('the device leg writes the same evidence every other leg does', () => {
  it('captures nothing, and does not even ask the phone, when EVIDENCE_DIR is unset', async () => {
    vi.stubEnv('EVIDENCE_DIR', '');
    const driver = fakeDriver();

    const file = await shootDevice(driver, {
      project: 'ios-safari-real-device',
      title: 'Journey 14 -- the board on a refused grant',
      label: 'nothing out of reach',
    });

    expect(file, 'an unasked-for capture reported no file').toBeNull();
    expect(
      driver.calls(),
      'a screenshot round-trip to a real phone costs a second per shot, so an ' +
        'ordinary run must not pay it',
    ).toBe(0);
  });

  it('writes the image and exactly one manifest row, through the shared row builder', async () => {
    const dir = evidenceDir();
    vi.stubEnv('EVIDENCE_DIR', dir);
    const driver = fakeDriver();
    const at = new Date('2026-09-16T12:00:00.000Z');

    const file = await shootDevice(
      driver,
      {
        project: 'ios-safari-real-device',
        title: 'Journey 14 -- the board on a refused grant',
        label: 'nothing out of reach',
      },
      () => at,
    );

    // The positive control for the test above: the same helper DOES call the
    // phone once a directory is asked for, so `toBe(0)` there is a decision
    // this code makes and not a fake driver that never worked.
    expect(driver.calls(), 'the phone was asked exactly once').toBe(1);

    expect(file).toBe(
      join(
        slug('ios-safari-real-device'),
        `${slug('Journey 14 -- the board on a refused grant')}__01-${slug('nothing out of reach')}.png`,
      ),
    );
    expect(existsSync(join(dir, file!)), `${file} was written`).toBe(true);

    const rows = rowsIn(dir);
    expect(rows).toEqual([
      manifestRow(
        {
          project: 'ios-safari-real-device',
          title: 'Journey 14 -- the board on a refused grant',
          order: 1,
          label: 'nothing out of reach',
          file: file!,
        },
        at,
      ),
    ]);
  });

  it('writes bytes the page builder can still recognise -- the seam, not the sides', async () => {
    const dir = evidenceDir();
    vi.stubEnv('EVIDENCE_DIR', dir);

    const file = await shootDevice(fakeDriver(), {
      project: 'ios-safari-real-device',
      title: 'Journey 14 -- the board on a refused grant',
      label: 'nothing out of reach',
    });

    // Asserting the builder's own sniffer against the device leg's own bytes.
    // Either side alone proves nothing: the builder is happy with PNG in the
    // abstract, and this leg is happy to write whatever WebDriver hands back.
    expect(mediaType(readFileSync(join(dir, file!)))).toBe('image/png');
  });

  it('leaves a capture alone rather than losing it when it cannot be resampled', () => {
    const dir = evidenceDir();
    const notAnImage = join(dir, 'not-an-image.png');
    writeFileSync(notAnImage, 'this is not a PNG', 'utf8');

    // DEGRADES, never throws: a capture at the wrong scale is still evidence,
    // while a journey that threw here would lose the assertion it documents.
    expect(shrinkToCssScale(notAnImage)).toBe(false);
    expect(readFileSync(notAnImage, 'utf8')).toBe('this is not a PNG');
  });

  it('does not UPSCALE a capture that is already within CSS scale', async () => {
    const dir = evidenceDir();
    vi.stubEnv('EVIDENCE_DIR', dir);

    // `sips -Z` resamples to fit a MAXIMUM dimension, so an unguarded call
    // would blow this 1x1 fixture up to 912x912 -- bigger bytes to say less.
    const file = await shootDevice(fakeDriver(), {
      project: 'ios-safari-real-device',
      title: 'Journey 14 -- the projector board on a refused grant',
      label: 'nothing out of reach',
    });

    const written = readFileSync(join(dir, file!));
    expect(written.length, 'a 1x1 capture was not resampled upwards').toBe(
      Buffer.from(PNG_BASE64, 'base64').length,
    );
  });

  it('numbers repeat captures within one journey, and starts each journey again at one', async () => {
    const dir = evidenceDir();
    vi.stubEnv('EVIDENCE_DIR', dir);
    const driver = fakeDriver();
    const journey = {
      project: 'ios-safari-real-device',
      title: 'Journey 14 -- the board on a refused grant',
    };

    await shootDevice(driver, { ...journey, label: 'before full screen' });
    await shootDevice(driver, { ...journey, label: 'nothing out of reach' });
    await shootDevice(driver, {
      ...journey,
      title: 'Journey 1 -- groups render',
      label: 'twelve students',
    });

    expect(rowsIn(dir).map((r) => [r.title, r.order, r.label])).toEqual([
      [journey.title, 1, 'before full screen'],
      [journey.title, 2, 'nothing out of reach'],
      ['Journey 1 -- groups render', 1, 'twelve students'],
    ]);
  });
});
