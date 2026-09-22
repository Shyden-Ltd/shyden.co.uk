import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dockerArgs } from '../../scripts/visual.mjs';

/**
 * `npm run test:visual -- --grep "student added"` reached Playwright as
 * `--grep student` plus a file filter `added` (#202): the script joined the
 * forwarded arguments into the one string it handed to `sh -c`, and the
 * container's shell split them again. It failed loudly only because `added`
 * matched no spec file. A leftover word that DOES match one runs a different
 * set of tests, and under `--update` rewrites baselines nobody asked for.
 *
 * Nothing here starts Docker. Each test reads the argument vector the script
 * hands to `docker`, then runs its in-container step on this machine's `sh`
 * with `rm`, `npm` and `npx` replaced by shell functions, so `npx` reports the
 * exact vector Playwright would receive, one NUL after each argument (the one
 * byte no argument can hold). PATH points nowhere, so a command the step
 * grows later fails the run here instead of running on the host.
 */

const IMAGE = 'visual-runner.test:image';

const SHADOWS = String.raw`rm() { :; }
npm() { :; }
npx() { printf '%s\0' "$@"; }`;

/** What Playwright receives when the container runs `docker ...argv`. */
function playwrightReceives(argv: string[]): string[] {
  const at = argv.indexOf(IMAGE);
  expect(argv.slice(at + 1, at + 3), 'the container runs `sh -c`').toEqual([
    'sh',
    '-c',
  ]);
  const [step, ...operands] = argv.slice(at + 3);
  const run = spawnSync('/bin/sh', ['-c', `${SHADOWS}\n${step}`, ...operands], {
    encoding: 'utf8',
    env: { PATH: '/nonexistent' },
  });
  expect(run.status, run.stderr).toBe(0);
  const received = run.stdout.split('\0');
  expect(received.pop(), 'every argument ends in a NUL').toBe('');
  return received;
}

const comparing = (forwarded: string[]) =>
  playwrightReceives(
    dockerArgs({ image: IMAGE, cwd: '/repo', update: false, forwarded }),
  );

const OWN_FLAGS = ['playwright', 'test', '--project=visual', '--workers=2'];

describe('forwarding arguments into the visual container (#202)', () => {
  it('keeps an argument holding a space whole: the failure #200 measured', () => {
    expect(comparing(['--grep', 'student added'])).toEqual([
      ...OWN_FLAGS,
      '--grep',
      'student added',
    ]);
  });

  it('passes shell metacharacters through without interpreting them', () => {
    const forwarded = [
      '$(echo injected)',
      'a;b',
      '*',
      `doesn't "wrap"`,
      'x|y&z',
    ];

    expect(comparing(forwarded)).toEqual([...OWN_FLAGS, ...forwarded]);
  });

  it('keeps every byte: edge spaces, a newline, Thai text, an empty argument', () => {
    const forwarded = ['  padded  ', 'line\nbreak', 'นักเรียน', ''];

    expect(comparing(forwarded)).toEqual([...OWN_FLAGS, ...forwarded]);
  });

  it('forwards the same way when capturing, where a stray word rewrites baselines', () => {
    expect(
      playwrightReceives(
        dockerArgs({
          image: IMAGE,
          cwd: '/repo',
          update: true,
          forwarded: ['--grep', 'student added'],
        }),
      ),
    ).toEqual([
      'playwright',
      'test',
      '--project=visual',
      '--update-snapshots=all',
      '--workers=2',
      '--grep',
      'student added',
    ]);
  });

  it('adds no empty argument when nothing is forwarded', () => {
    // `"$@"` with no operands expands to nothing at all. A form that yields
    // one empty word instead (`"$*"` does) hands Playwright an argument
    // nobody passed.
    expect(comparing([])).toEqual(OWN_FLAGS);
  });

  // That the file still acts when run as a script, from any checkout, is held
  // with every other script that decides so in `script-entry.test.ts` (#221).
});

/**
 * The container renders on the architecture CI compares on (#224).
 *
 * The baselines were captured on the operator's arm64 Mac and are compared on
 * CI's `x86_64` runner. Measured on run 35657436585: **every one of the ten**
 * differs at zero per-pixel tolerance, between 25% and 48% of all pixels. The
 * gate saw none of it, because `threshold: 0.1` scores a YIQ distance of ~352
 * as identical — so what the tolerance was really buying was a whole
 * architecture's worth of text rasterisation, and a real regression smaller
 * than that noise would ship green. That is #33 in a different medium.
 *
 * Operator decision, 2026-09-21: pin the architecture in the local capture
 * rather than record a reason not to, and re-capture all ten on it.
 */
describe('the visual container renders on CI architecture (#224)', () => {
  const argsFor = (update: boolean) =>
    dockerArgs({ image: IMAGE, cwd: '/repo', update, forwarded: [] });

  it('pins linux/amd64 when comparing', () => {
    const argv = argsFor(false);
    expect(argv[argv.indexOf('--platform') + 1]).toBe('linux/amd64');
  });

  it('pins it when CAPTURING too, which is where it decides the pixels', () => {
    // A comparison on the wrong architecture is a false red someone
    // investigates. A CAPTURE on the wrong architecture writes the drift into
    // the committed file, where it is invisible and permanent.
    const argv = argsFor(true);
    expect(argv[argv.indexOf('--platform') + 1]).toBe('linux/amd64');
  });

  it('pins it BEFORE the image, which is the only place docker reads it', () => {
    // `docker run [OPTIONS] IMAGE [COMMAND]`. A `--platform` after the image
    // name is not an option at all — it is handed to the entrypoint, where it
    // means nothing, and docker runs the host's architecture without a word.
    // Presence is not the assertion; position is.
    const argv = argsFor(false);
    expect(argv.indexOf('--platform')).toBeGreaterThan(-1);
    expect(argv.indexOf('--platform')).toBeLessThan(argv.indexOf(IMAGE));
  });
});
