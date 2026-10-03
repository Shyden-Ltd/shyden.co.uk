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

/** The largest baseline today is 578 KB (measured 2026-10-03). */
export const MAX_PNG_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MANIFEST_KEYS = ['files', 'headSha', 'playwright', 'pr'];
const FILE_KEYS = ['bytes', 'path', 'pixels', 'sha256'];

/**
 * An artifact-derived string, quoted and cut, so a newline in it cannot
 * start a workflow command when the error reaches the log.
 * @param {unknown} value
 * @returns {string}
 */
const quoted = (value) => JSON.stringify(String(value).slice(0, 120));

/**
 * A number as itself; anything else, quoted.
 * @param {unknown} value
 * @returns {string}
 */
const shown = (value) =>
  typeof value === 'number' ? String(value) : quoted(value);

/**
 * @param {unknown} value
 * @param {readonly string[]} keys sorted
 * @returns {value is Record<string, any>}
 */
const hasExactly = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), keys);

/**
 * @param {string} path
 * @returns {string[]} every directory above the file
 */
const ancestorsOf = (path) =>
  path
    .split('/')
    .slice(0, -1)
    .map((_, index, parts) => parts.slice(0, index + 1).join('/'));

/**
 * @typedef {{ name: string, kind: 'file' | 'directory' | 'other',
 *   content?: Uint8Array }} Entry
 */

/**
 * The artifact, checked from its manifest down to each file's bytes, or a
 * refusal by name. Nothing in it is trusted: the manifest is bound to the
 * run that produced it, every path must already be a baseline at the head,
 * and every file must be exactly the PNG the manifest describes.
 * @param {object} input
 * @param {readonly Entry[]} input.entries the downloaded artifact, walked with lstat
 * @param {{ pr: number, headSha: string }} input.run the triggering run's own facts
 * @param {ReadonlySet<string>} input.headPaths every file at the pull request's head
 * @returns {{ manifest: Manifest, files: { path: string, content: Uint8Array }[] }}
 */
export function validateArtifact({ entries, run, headPaths }) {
  const manifestEntry = entries.find(
    (entry) => entry.name === 'manifest.json' && entry.kind === 'file',
  );
  if (!manifestEntry?.content)
    throw new Error('the artifact holds no manifest.json');
  /** @type {unknown} */
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestEntry.content));
  } catch {
    throw new Error('manifest.json is not JSON');
  }
  if (!hasExactly(manifest, MANIFEST_KEYS))
    throw new Error(
      `manifest.json's keys are not exactly ${MANIFEST_KEYS.join(', ')}`,
    );
  if (!Number.isSafeInteger(manifest.pr) || manifest.pr <= 0)
    throw new Error('manifest.json names no pull request number');
  if (
    typeof manifest.headSha !== 'string' ||
    !/^[0-9a-f]{40}$/.test(manifest.headSha)
  )
    throw new Error('manifest.json names no head SHA');
  if (
    typeof manifest.playwright !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(manifest.playwright)
  )
    throw new Error('manifest.json names no Playwright version');
  if (manifest.pr !== run.pr)
    throw new Error(
      `manifest.json names #${manifest.pr}, and the capture ran for #${run.pr}`,
    );
  if (manifest.headSha !== run.headSha)
    throw new Error(
      `manifest.json names ${manifest.headSha}, and the capture ran on ${run.headSha}`,
    );
  if (!Array.isArray(manifest.files) || manifest.files.length === 0)
    throw new Error('manifest.json lists no files');
  /** @type {Set<string>} */
  const listed = new Set();
  for (const file of manifest.files) {
    if (!hasExactly(file, FILE_KEYS))
      throw new Error(`a file's keys are not exactly ${FILE_KEYS.join(', ')}`);
    if (
      typeof file.path !== 'string' ||
      file.path.includes('..') ||
      !BASELINE.test(file.path)
    )
      throw new Error(`${quoted(file.path)} is not a baseline path`);
    if (listed.has(file.path)) throw new Error(`${file.path} is listed twice`);
    listed.add(file.path);
    if (!headPaths.has(file.path))
      throw new Error(
        `${file.path} is not a baseline at the head, and a rebaseline adds no file`,
      );
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256))
      throw new Error(`${file.path} has no sha256`);
    if (
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 1 ||
      file.bytes > MAX_PNG_BYTES
    )
      throw new Error(
        `${file.path} declares ${shown(file.bytes)} bytes, outside 1 to ${MAX_PNG_BYTES}`,
      );
    if (
      file.pixels !== null &&
      (!Number.isSafeInteger(file.pixels) || file.pixels < 0)
    )
      throw new Error(
        `${file.path} has a pixel count of ${shown(file.pixels)}`,
      );
  }
  const expected = new Set(['manifest.json', ...listed]);
  const needed = new Set([...listed].flatMap(ancestorsOf));
  /** @type {Map<string, Uint8Array>} */
  const contents = new Map();
  for (const entry of entries) {
    if (entry.kind === 'directory' && needed.has(entry.name)) continue;
    if (entry.kind !== 'file' || !expected.has(entry.name) || !entry.content)
      throw new Error(
        `the artifact holds ${entry.kind} ${quoted(entry.name)}, which the manifest does not list`,
      );
    contents.set(entry.name, entry.content);
  }
  for (const name of expected)
    if (!contents.has(name)) throw new Error(`the artifact is missing ${name}`);
  /** @type {Manifest} */
  const checked = /** @type {Manifest} */ (manifest);
  const files = checked.files.map(({ path, bytes, sha256: hash }) => {
    const content = /** @type {Uint8Array} */ (contents.get(path));
    if (!PNG_SIGNATURE.every((byte, index) => content[index] === byte))
      throw new Error(`${path} is not a PNG`);
    if (content.length !== bytes)
      throw new Error(
        `${path} holds ${content.length} bytes, and the manifest says ${bytes}`,
      );
    if (sha256(content) !== hash)
      throw new Error(`${path} does not hash to its manifest entry`);
    return { path, content };
  });
  return { manifest: checked, files };
}

/**
 * Whether a parsed workflow can be started by `workflow_dispatch`.
 * @param {unknown} workflow
 * @returns {boolean}
 */
export function dispatchable(workflow) {
  const on =
    workflow !== null && typeof workflow === 'object'
      ? /** @type {Record<string, unknown>} */ (workflow).on
      : undefined;
  if (typeof on === 'string') return on === 'workflow_dispatch';
  if (Array.isArray(on)) return on.includes('workflow_dispatch');
  return (
    on !== null &&
    typeof on === 'object' &&
    Object.hasOwn(on, 'workflow_dispatch')
  );
}

/**
 * @param {number | null} pixels
 * @returns {string}
 */
const countOf = (pixels) => (pixels === null ? 'not reported' : String(pixels));

/**
 * The pull request comment. Every value in it passed `validateArtifact`'s
 * patterns first.
 * @param {Manifest} manifest
 * @param {string} commitSha
 * @returns {string}
 */
export function commentBody(manifest, commitSha) {
  return [
    'Rebaselined automatically (#459). `operator-review` holds the merge until the operator approves the PNG diff at this head.',
    '',
    `Playwright ${manifest.playwright}, commit ${commitSha}.`,
    '',
    '| Baseline | Differing pixels at the gate |',
    '| --- | --- |',
    ...manifest.files.map(
      ({ path, pixels }) => `| \`${path}\` | ${countOf(pixels)} |`,
    ),
    '',
    `Labelled \`${LABEL}\`.`,
  ].join('\n');
}

/**
 * @param {Manifest} manifest
 * @returns {string}
 */
export function commitMessage(manifest) {
  return [
    `Rebaseline ${manifest.files.length} screenshot(s) for Playwright ${manifest.playwright} (Refs #459)`,
    '',
    "The visual gate failed these on pixels alone after Dependabot's",
    'Playwright update, and visual-rebaseline.yml recaptured them in the',
    "gate's own image. operator-review holds the merge until the operator",
    'approves the PNG diff at this head.',
    '',
    ...manifest.files.map(({ path, pixels }) =>
      pixels === null
        ? `- ${path} (count not reported)`
        : `- ${path} (${pixels} px)`,
    ),
  ].join('\n');
}
