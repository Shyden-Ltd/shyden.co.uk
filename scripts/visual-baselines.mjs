#!/usr/bin/env node
/**
 * Regenerate the visual-regression baselines (#33).
 *
 * The ONLY way a baseline changes. CI never passes `--update-snapshots`,
 * because a run that can rewrite the baseline it is checking against asserts
 * nothing at all -- and a changed baseline should arrive as a reviewable diff
 * in a pull request, like any other change to what this repo claims is
 * correct.
 *
 * It runs in Docker rather than on your machine, and that is the whole point.
 * Playwright rasterises text with the fonts it can find, so a macOS laptop
 * and a Linux runner produce different pixels for identical HTML. Baselines
 * captured here are captured in the SAME image `ci.yml`'s `visual` job
 * compares them in, which is what makes the comparison mean anything.
 *
 *   npm run test:visual:update          # every baseline
 *   npm run test:visual:update -- -g home   # just the ones matching
 *
 * Anything after `--` is forwarded to `playwright test`.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * The image version FOLLOWS the installed library, rather than being written
 * down twice. A browser bundle from a different release than the library
 * driving it fails in ways neither one reports clearly.
 */
const { version } = require('@playwright/test/package.json');
const image = `mcr.microsoft.com/playwright:v${version}-noble`;

const docker = spawnSync('docker', ['--version'], { stdio: 'ignore' });
if (docker.status !== 0) {
  console.error(
    'docker is not available, and baselines captured outside the pinned\n' +
      `image (${image}) are not the ones CI compares against -- Playwright\n` +
      'writes the platform into the filename, so they would not even be read.\n' +
      'Start Docker, or let the visual job in CI show you the diff instead.',
  );
  process.exit(1);
}

const forwarded = process.argv.slice(2);
console.log(`Capturing baselines in ${image}`);
if (forwarded.length) console.log(`  forwarding: ${forwarded.join(' ')}`);

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
    [
      'npm ci --no-audit --no-fund',
      `npx playwright test --project=visual --update-snapshots ${forwarded.join(' ')}`,
    ].join(' && '),
  ],
  { stdio: 'inherit' },
);

if (run.status !== 0) {
  console.error(
    '\nBaseline capture failed. Nothing was written, so the committed\n' +
      'baselines are unchanged -- review the output above before retrying.',
  );
}
process.exit(run.status ?? 1);
