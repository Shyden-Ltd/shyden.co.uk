import { spawnSync } from 'node:child_process';
import type { Download } from '@playwright/test';
import { describe, it, expect } from 'vitest';
import {
  DEVICE_DOWNLOADS,
  DEVICE_DOWNLOAD_BEHAVIOUR,
  deviceDownloadText,
  emptyDeviceDownloadsArgs,
  forDeviceShell,
} from '../device/device-downloads';

/**
 * The real phone the device suite drives is a person's own phone, and #308 made the suite write
 * to it and delete from it. These pin that the writing and the deleting stay inside one folder
 * of the suite's own.
 */
describe('the phone download folder (#308)', () => {
  // A literal pin, separate from the shape rule below: every other assertion here is built from
  // the same constant, so a wrong value would move both sides together and pass.
  it('is exactly the folder the suite owns', () => {
    expect(DEVICE_DOWNLOADS).toBe('/sdcard/Download/shyden-gauntlet');
  });

  it('is one folder of its own under Downloads, never Downloads itself', () => {
    const parent = '/sdcard/Download/';
    expect(DEVICE_DOWNLOADS.startsWith(parent)).toBe(true);
    // One path segment of plain characters: no slash, no `..`, no glob, no space, not empty.
    expect(DEVICE_DOWNLOADS.slice(parent.length)).toMatch(
      /^[a-z0-9][a-z0-9-]*$/,
    );
  });

  it('is the only thing the suite ever deletes on the phone', () => {
    expect(emptyDeviceDownloadsArgs()).toEqual([
      'shell',
      'rm',
      '-rf',
      '/sdcard/Download/shyden-gauntlet',
    ]);
  });

  it('is where Chrome is told to save, with the events Playwright needs', () => {
    expect(DEVICE_DOWNLOAD_BEHAVIOUR).toEqual({
      behavior: 'allow',
      downloadPath: '/sdcard/Download/shyden-gauntlet',
      eventsEnabled: true,
    });
  });
});

/**
 * `adb exec-out` joins its arguments with spaces and hands the line to the phone's `sh`, so this
 * quoting is all that stands between a download's suggested name and that shell. Each name is
 * run through a real POSIX `sh` here, which quotes as the phone's does, and must come back as the
 * one argument it went in as.
 */
describe('a filename quoted for the phone shell', () => {
  const echoedBySh = (value: string): string => {
    const run = spawnSync(
      'sh',
      ['-c', `printf '%s|' ${forDeviceShell(value)}`],
      {
        encoding: 'utf8',
      },
    );
    expect(run.status, run.stderr).toBe(0);
    return run.stdout;
  };

  it.each([
    'groups.csv',
    'class 4B groups.csv',
    "Ana's class.csv",
    "''",
    '$(echo injected).csv',
    '`id`.csv',
    'a;b&&c|d.csv',
    'line\nbreak.csv',
    '',
  ])('reaches the shell as one argument, unchanged: %j', (value) => {
    expect(echoedBySh(value)).toBe(`${value}|`);
  });
});

/**
 * #308: every export in the phone run ended `canceled` with no bytes while its tests passed. A
 * download that did not complete must be refused, naming the file and Chrome's reason, before
 * anything is read off the phone.
 */
describe('reading back a download that did not complete', () => {
  const failedDownload = (failure: string): Download =>
    ({
      failure: async () => failure,
      suggestedFilename: () => 'groups.csv',
    }) as unknown as Download;

  it('throws naming the file and the reason', async () => {
    await expect(
      deviceDownloadText(failedDownload('canceled')),
    ).rejects.toThrow(
      'the download "groups.csv" did not complete on the phone: canceled',
    );
  });
});
