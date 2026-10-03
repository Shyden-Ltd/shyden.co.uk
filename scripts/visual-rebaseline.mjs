#!/usr/bin/env node
/**
 * Rebaselines the visual gate for a Dependabot Playwright update (#459).
 *
 * A Playwright release ships new browsers, and new browsers can move pixels
 * while the site is unchanged. For a pull request Dependabot opened that
 * updates Playwright and nothing else, `visual-rebaseline.yml` reruns the
 * gate, recaptures exactly the screenshots it failed and uploads them, and
 * `visual-rebaseline-commit.yml` validates that upload, commits it to the
 * branch, starts CI there and labels the pull request for the operator's
 * review. Any other update keeps a red `visual` for a person to diagnose
 * (operator, 2026-10-03: "we cannot afford to allow any visual bugs go
 * unnoticed and unfixed"). Design:
 * docs/superpowers/specs/2026-10-03-visual-rebaseline-design.md.
 *
 * Every decision is a pure function here, unit-tested in
 * tests/unit/visual-rebaseline.test.ts. `main` only reads files and calls
 * GitHub: one request at a time, each with a time limit, never a retry
 * (operator rule, 2026-10-02), so whatever does not arrive fails by name.
 *
 *   node scripts/visual-rebaseline.mjs qualify                  # capture
 *   node scripts/visual-rebaseline.mjs classify <gate> <list>   # capture
 *   node scripts/visual-rebaseline.mjs stage <out-dir>          # capture
 *   node scripts/visual-rebaseline.mjs find                     # commit
 *   node scripts/visual-rebaseline.mjs commit                   # commit
 */
import { createHash } from 'node:crypto';
import { relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const DEPENDABOT = 'dependabot[bot]';
/** The label that holds a rebaselined pull request for the operator. */
export const LABEL = 'rebaseline-needs-review';
/** The artifact the capture uploads and the commit downloads. */
export const ARTIFACT = 'visual-rebaseline';

const PLAYWRIGHT = '@playwright/test';
/**
 * Playwright's own tree in the lockfile: these entries, and every entry
 * nested inside one (#26 removed `node_modules/playwright/node_modules/
 * fsevents`).
 */
const PLAYWRIGHT_TREES = [
  'node_modules/@playwright/test',
  'node_modules/playwright',
  'node_modules/playwright-core',
];
const DEPENDENCY_FILES = new Set([
  'package.json',
  'package-lock.json',
  'docker/playwright/Dockerfile',
]);

/**
 * The types `qualify` reads and returns, in one block (a docblock sitting
 * directly on another is refused by stranded-docblocks.test.ts).
 *
 * One side of a pull request: its lockfile, manifest and Dockerfile.
 * @typedef {{ lock: string, pkg: string, dockerfile: string | null }} Side
 *
 * What the qualify job learns about a pull request. A renamed file is
 * recorded as `old → new`, which no dependency path matches.
 * @typedef {object} PullRequestFacts
 * @property {string} author
 * @property {string} headRepo
 * @property {string} baseRepo
 * @property {readonly string[]} files
 * @property {number} changedFiles
 * @property {number} behindBy
 * @property {Side} base
 * @property {Side} head
 *
 * @typedef {{ qualifies: true, versions: string }
 *   | { qualifies: false, reason: string }} Verdict
 */

/**
 * @param {string} reason
 * @returns {Verdict}
 */
const refuse = (reason) => ({ qualifies: false, reason });

/**
 * Whether a pull request updates Playwright and nothing else. Not
 * qualifying is an answer; a file list that cannot be trusted is not one, so
 * it throws.
 * @param {PullRequestFacts} pr
 * @returns {Verdict}
 */
export function qualify(pr) {
  if (pr.author !== DEPENDABOT)
    return refuse(`opened by ${pr.author}, not ${DEPENDABOT}`);
  if (pr.headRepo !== pr.baseRepo)
    return refuse(`the head is ${pr.headRepo}, not ${pr.baseRepo}`);
  if (pr.files.length !== pr.changedFiles)
    throw new Error(
      `the file list holds ${pr.files.length} of ${pr.changedFiles} ` +
        'changed files, so it is truncated',
    );
  const others = pr.files.filter((file) => !DEPENDENCY_FILES.has(file));
  if (others.length > 0)
    return refuse(`it changes more than dependencies: ${others.join(', ')}`);
  if (pr.behindBy !== 0)
    return refuse(
      `it is ${pr.behindBy} commit(s) behind its base; ` +
        'bringing it level runs this again',
    );
  const outside =
    lockOutsidePlaywright(pr.base.lock, pr.head.lock) ??
    packageOutsidePlaywright(pr.base.pkg, pr.head.pkg) ??
    dockerfileOutsideFrom(pr.base.dockerfile, pr.head.dockerfile);
  if (outside) return refuse(outside);
  const moved = playwrightVersionsMoved(pr.base.lock, pr.head.lock);
  if (moved.length === 0) return refuse('no Playwright version moved');
  return { qualifies: true, versions: moved.join(', ') };
}

/**
 * @param {string} key a lockfile `packages` key
 * @returns {boolean}
 */
const inPlaywrightTree = (key) =>
  PLAYWRIGHT_TREES.some((tree) => key === tree || key.startsWith(`${tree}/`));

/**
 * A package manifest, or the lockfile's root entry, without its
 * `@playwright/test` pins.
 * @param {any} manifest
 * @returns {any}
 */
function withoutPlaywright(manifest) {
  if (manifest === null || typeof manifest !== 'object') return manifest;
  const copy = structuredClone(manifest);
  for (const field of ['dependencies', 'devDependencies'])
    if (copy[field]) delete copy[field][PLAYWRIGHT];
  return copy;
}

/**
 * Why the lockfile moves something besides Playwright, if it does.
 * @param {string} baseText
 * @param {string} headText
 * @returns {string | undefined}
 */
function lockOutsidePlaywright(baseText, headText) {
  const { packages: before = {}, ...baseRest } = JSON.parse(baseText);
  const { packages: after = {}, ...headRest } = JSON.parse(headText);
  if (!isDeepStrictEqual(baseRest, headRest))
    return 'package-lock.json changes outside its packages';
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (isDeepStrictEqual(before[key], after[key])) continue;
    if (key === '') {
      if (
        !isDeepStrictEqual(
          withoutPlaywright(before[key]),
          withoutPlaywright(after[key]),
        )
      )
        return `package-lock.json's root entry changes more than ${PLAYWRIGHT}`;
      continue;
    }
    if (!inPlaywrightTree(key))
      return `package-lock.json changes ${key}, outside Playwright's tree`;
  }
  return undefined;
}

/**
 * @param {string} baseText
 * @param {string} headText
 * @returns {string | undefined}
 */
function packageOutsidePlaywright(baseText, headText) {
  return isDeepStrictEqual(
    withoutPlaywright(JSON.parse(baseText)),
    withoutPlaywright(JSON.parse(headText)),
  )
    ? undefined
    : `package.json changes more than ${PLAYWRIGHT}`;
}

/**
 * Every line but a `FROM` must be unchanged, in place.
 * @param {string | null} base
 * @param {string | null} head
 * @returns {string | undefined}
 */
function dockerfileOutsideFrom(base, head) {
  if (base === head) return undefined;
  if (base === null || head === null)
    return `docker/playwright/Dockerfile is ${base === null ? 'added' : 'removed'}`;
  /** @param {string} text */
  const rest = (text) =>
    text.split('\n').map((line) => (/^\s*FROM\s/i.test(line) ? 'FROM' : line));
  return isDeepStrictEqual(rest(base), rest(head))
    ? undefined
    : 'docker/playwright/Dockerfile changes more than its FROM pin';
}

/**
 * @param {string} baseText
 * @param {string} headText
 * @returns {string[]} `<name> <from> → <to>` for each entry that moved
 */
function playwrightVersionsMoved(baseText, headText) {
  const before = JSON.parse(baseText).packages ?? {};
  const after = JSON.parse(headText).packages ?? {};
  return PLAYWRIGHT_TREES.flatMap((key) => {
    const from = before[key]?.version;
    const to = after[key]?.version;
    return from === to
      ? []
      : [`${key.slice('node_modules/'.length)} ${from} → ${to}`];
  });
}

/** Where every committed baseline lives, and what its name may hold. */
const BASELINE = /^tests\/e2e\/__screenshots__\/[A-Za-z0-9][\w.-]*-linux\.png$/;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/**
 * @param {unknown} text
 * @returns {string}
 */
const plain = (text) => String(text ?? '').replace(ANSI, '');

/**
 * @param {unknown} text
 * @returns {string}
 */
const firstLine = (text) => plain(text).split('\n')[0] || '(no message)';

/**
 * @param {Uint8Array} content
 * @returns {string} lowercase hex
 */
export const sha256 = (content) =>
  createHash('sha256').update(content).digest('hex');

/**
 * A screenshot the gate failed on pixels alone, at its committed path.
 * @typedef {{ path: string, pixels: number | null }} FailedBaseline
 *
 * What the capture uploads beside the PNGs.
 * @typedef {object} Manifest
 * @property {number} pr
 * @property {string} headSha
 * @property {string} playwright
 * @property {{ path: string, sha256: string, bytes: number, pixels: number | null }[]} files
 */

/**
 * Every test in a Playwright JSON report, or in a `--list` listing, which
 * has the same shape with no results.
 * @param {any} report
 * @returns {{ title: string, results: any[] }[]}
 */
export function testsIn(report) {
  /** @type {{ title: string, results: any[] }[]} */
  const tests = [];
  /** @param {any} suite */
  const walk = (suite) => {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? [])
        tests.push({ title: spec.title, results: test.results ?? [] });
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return tests;
}

/**
 * The committed baselines the gate failed on pixels alone. Anything else
 * refuses by name: an error outside a test, a count unlike the listing's, a
 * test that timed out, was skipped or ran twice, a failure that is not one
 * screenshot comparison. The path comes from the `-expected.png`
 * attachment, which Playwright points at the committed file, never from the
 * error's wording, which a later release may change.
 * @param {any} report the gate's JSON report
 * @param {number} listed how many tests the visual project lists
 * @param {string} root the checkout the attachment paths sit under
 * @returns {FailedBaseline[]}
 */
export function failedBaselines(report, listed, root) {
  if (listed <= 0) throw new Error('the listing holds no visual tests');
  const tests = testsIn(report);
  if (tests.length !== listed)
    throw new Error(
      `the report holds ${tests.length} tests and the listing ${listed}`,
    );
  const outside = report.errors ?? [];
  if (outside.length > 0)
    throw new Error(
      `the run failed outside any test: ${firstLine(outside[0]?.message)}`,
    );
  return tests.flatMap(({ title, results }) => {
    if (results.length !== 1)
      throw new Error(
        `${title} has ${results.length} results, and the gate runs each test once`,
      );
    const [result] = results;
    if (result.status === 'passed') return [];
    if (result.status !== 'failed')
      throw new Error(`${title} ended ${result.status}`);
    return [screenshotFailure(title, result, root)];
  });
}

/**
 * @param {string} title
 * @param {any} result
 * @param {string} root
 * @returns {FailedBaseline}
 */
function screenshotFailure(title, result, root) {
  /** @type {{ name: string, path?: string }[]} */
  const attachments = result.attachments ?? [];
  const errors = result.errors ?? [];
  const expected = attachments.filter((a) => a.name.endsWith('-expected.png'));
  if (
    errors.length !== 1 ||
    expected.length !== 1 ||
    !firstLine(errors[0].message).includes('toHaveScreenshot')
  )
    throw new Error(
      `${title} failed on something besides one screenshot comparison: ` +
        firstLine(errors[0]?.message),
    );
  const stem = expected[0].name.slice(0, -'-expected.png'.length);
  if (!attachments.some((a) => a.name === `${stem}-diff.png`))
    throw new Error(
      `${title}: ${stem} has no diff image, so no comparison ran`,
    );
  const path = relative(root, expected[0].path ?? '')
    .split(sep)
    .join('/');
  if (!BASELINE.test(path))
    throw new Error(`${title}: ${path} is not a committed baseline`);
  const count = /(\d+) pixels \(ratio/.exec(plain(errors[0].message));
  return { path, pixels: count ? Number(count[1]) : null };
}

/**
 * The gate's exit status and its report must agree.
 * @param {number} exitCode
 * @param {readonly FailedBaseline[]} failed
 */
export function gateAgrees(exitCode, failed) {
  if (exitCode === 0 && failed.length > 0)
    throw new Error(
      `the gate exited 0 but its report holds ${failed.length} failed screenshot(s)`,
    );
  if (exitCode !== 0 && failed.length === 0)
    throw new Error(
      `the gate exited ${exitCode} with no failed screenshot in its report`,
    );
}

/**
 * The manifest for the recaptured baselines. A baseline the gate failed
 * that the recapture left byte-identical is a contradiction, and refuses.
 * @param {object} input
 * @param {number} input.pr
 * @param {string} input.headSha
 * @param {string} input.playwright
 * @param {readonly (FailedBaseline & { before: string })[]} input.failed
 * @param {(path: string) => Uint8Array} input.contentOf
 * @returns {Manifest}
 */
export function buildManifest({ pr, headSha, playwright, failed, contentOf }) {
  const files = failed.map(({ path, pixels, before }) => {
    const content = contentOf(path);
    const hash = sha256(content);
    if (hash === before)
      throw new Error(
        `the gate failed ${path}, and the recapture left it unchanged`,
      );
    return { path, sha256: hash, bytes: content.length, pixels };
  });
  return { pr, headSha, playwright, files };
}
