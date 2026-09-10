#!/usr/bin/env node
/**
 * Run the visual-regression suite in the pinned container (#33).
 *
 *   npm run test:visual                  # compare against the baselines
 *   npm run test:visual:update           # rewrite them
 *   npm run test:visual -- -g home       # anything after `--` is forwarded
 *
 * BOTH go through Docker, and that is the point. Playwright writes the
 * platform into every snapshot filename, so a run on a macOS laptop does not
 * read `-linux` baselines -- it finds none, writes `-darwin` ones, and
 * reports a confident pass over a comparison it never made. That failure is
 * silent, it looks like success, and it leaves files in the tree that CI will
 * never open. Pinning the image on both sides is what makes the comparison
 * mean anything, since a bare runner and this image rasterise text with
 * different font packages.
 *
 * `--update-snapshots` is reachable ONLY through `test:visual:update`, never
 * from CI. A run that can rewrite the baseline it is checking against asserts
 * nothing, and a changed baseline belongs in a pull request as a reviewable
 * diff like any other claim about what is correct.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * The image version FOLLOWS the installed library rather than being written
 * down twice; `tests/unit/pipeline-wiring.test.ts` asserts `ci.yml` names the
 * same one. A browser bundle from a different release than the library
 * driving it fails in ways neither reports clearly.
 */
const { version } = require('@playwright/test/package.json');
const image = `mcr.microsoft.com/playwright:v${version}-noble`;

const argv = process.argv.slice(2);
const update = argv.includes('--update');
const forwarded = argv.filter((arg) => arg !== '--update');

if (spawnSync('docker', ['--version'], { stdio: 'ignore' }).status !== 0) {
  console.error(
    `docker is not available, and this suite does not fall back to running\n` +
      `here: a local run would compare nothing and pass. Start Docker, or\n` +
      `read the diff from the visual job in CI, which uses ${image}.`,
  );
  process.exit(1);
}

console.log(`${update ? 'Capturing baselines' : 'Comparing'} in ${image}`);
if (forwarded.length) console.log(`  forwarding: ${forwarded.join(' ')}`);

const playwright = [
  'npx playwright test --project=visual',
  update ? '--update-snapshots' : '',
  // Chromium is memory-hungry and the host has under 4 GiB; the default
  // worker count is derived from CPUs and has killed a container run here
  // before. Two is what CI's e2e job was measured at.
  '--workers=2',
  ...forwarded,
]
  .filter(Boolean)
  .join(' ');

const run = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    // Chromium exhausts the default 64MB /dev/shm and crashes mid-run.
    '--ipc=host',
    '-v',
    `${process.cwd()}:/work`,
    // An ANONYMOUS volume over node_modules, so `npm ci` inside the container
    // installs Linux binaries into the container's own layer instead of
    // overwriting the macOS ones on the host. Without this the next local
    // `npm test` fails on a native module built for the wrong platform.
    '-v',
    '/work/node_modules',
    '-w',
    '/work',
    '-e',
    'VISUAL=1',
    image,
    'sh',
    '-c',
    `npm ci --no-audit --no-fund && ${playwright}`,
  ],
  { stdio: 'inherit' },
);

if (run.status !== 0 && update)
  console.error(
    '\nCapture failed, so the committed baselines are unchanged. Read the\n' +
      'output above before retrying.',
  );
process.exit(run.status ?? 1);
