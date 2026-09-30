/**
 * The content file for a release's evidence page (#362), written for the
 * builder that renders every ticket's page. It holds no release prose: every
 * word specific to a release comes from `docs/releases/<base7>.json`.
 *
 * Two modes. Building reads a capture's report and manifest, and refuses a
 * head whose `dev-verified` is not success, because the page describes the
 * tree on dev. `--check` reads a Playwright listing before the merge, when
 * the release head is still a branch with no `dev-verified` and no capture
 * exists. It validates the release file and writes nothing, so a mistyped
 * title surfaces before the merge instead of after a capture.
 *
 * A listing cannot say which tests capture, so `--check` passes a title that
 * runs but shoots nothing, such as a looped test's `/` case that returns
 * before its `shoot`. Only building sees that, from the manifest, and it
 * refuses (#362: `palette-controls`' homepage case, cited for #337).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { capturesOfThisRun, flattenReport } from './build-evidence-page.mjs';
import { EVIDENCE_MANIFEST, EVIDENCE_REPORT } from './evidence-files.mjs';
import { inventoryFor } from './release-inventory.mjs';
import { changeMapOf, releaseOf, renderChangeMap } from './release-map.mjs';
import { messageOf } from './errors.mjs';

/**
 * Every test title a listing holds, as the builder writes a journey's title
 * (describes and test, the file dropped). A listing carries no results, so
 * `flattenReport`, which yields one row per result, cannot read it.
 *
 * @param {any} listing
 * @returns {Set<string>}
 */
export const listedTitles = (listing) => {
  /** @type {Set<string>} */
  const titles = new Set();
  /**
   * @param {any} suite
   * @param {string[]} path
   */
  const walk = (suite, path) => {
    for (const child of suite.suites ?? [])
      walk(child, child.title ? [...path, child.title] : path);
    for (const spec of suite.specs ?? [])
      titles.add([...path, spec.title].join(' > '));
  };
  for (const file of listing.suites ?? []) walk(file, []);
  return titles;
};

/**
 * @param {object} input
 * @param {import('./release-map.mjs').Release} input.release
 * @param {{ base: string, head: string, entries: import('./release-inventory.mjs').Entry[] }} input.inventory
 * @param {any} input.report the capture's report, or a listing when checking
 * @param {any[] | null} input.manifest the capture's manifest rows, or null when checking
 * @param {string | null} input.devVerified the head's dev-verified state
 */
export const releaseContentOf = ({
  release,
  inventory,
  report,
  manifest,
  devVerified,
}) => {
  const checking = manifest === null;
  if (!checking && devVerified !== 'success')
    throw new Error(
      `build-release-content: ${inventory.head} reads dev-verified=${devVerified ?? 'absent'}; a release page describes a tree dev has verified`,
    );
  /** @type {Map<string, string[]>} */
  const statuses = new Map();
  if (!checking)
    for (const row of flattenReport(report))
      statuses.set(row.title, [...(statuses.get(row.title) ?? []), row.status]);
  const map = changeMapOf({
    inventory,
    release,
    journeys: checking
      ? listedTitles(report)
      : new Set(
          capturesOfThisRun(manifest, report).current.map(
            (/** @type {{ title: string }} */ r) => r.title,
          ),
        ),
    statuses: checking ? null : statuses,
  });
  if (checking) return null;
  const { changeMap, others } = renderChangeMap(map);
  const head7 = inventory.head.slice(0, 7);
  return {
    title: release.headline,
    eyebrow: `Release ${inventory.base.slice(0, 7)} → ${head7}`,
    headline: release.headline,
    lede: release.lede,
    ids: [
      { label: 'Production', value: inventory.base },
      { label: 'Release head', value: inventory.head },
      { label: 'dev-verified', value: devVerified },
    ],
    sections: [
      { heading: 'What changes for a visitor', html: changeMap },
      { heading: 'Everything else in the release', html: others },
    ],
    checks: [
      ...release.checks,
      ...map.rows.flatMap(({ entry, classification }) =>
        classification.kind === 'gap'
          ? [
              {
                id: `gap-${entry.sha.slice(0, 7)}`,
                group: release.gapGroup,
                label: `${entry.subject}: ${classification.check}`,
              },
            ]
          : [],
      ),
    ],
    signoff: release.signoff,
    signoffKey: `release-${head7}`,
  };
};

const USAGE =
  'usage: build-release-content.mjs --release <file.json> --head <sha> (--evidence <dir> --out <content.json> | --check --listing <listing.json>)';

/** @param {string} sha */
const devVerifiedOf = (sha) => {
  const state = execFileSync(
    'gh',
    [
      'api',
      `repos/{owner}/{repo}/commits/${sha}/statuses`,
      '--jq',
      '[.[] | select(.context == "dev-verified")][0].state // ""',
    ],
    { encoding: 'utf8' },
  ).trim();
  return state === '' ? null : state;
};

const main = () => {
  /** @type {{ release?: string, head?: string, evidence?: string, out?: string, check?: boolean, listing?: string }} */
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        release: { type: 'string' },
        head: { type: 'string' },
        evidence: { type: 'string' },
        out: { type: 'string' },
        check: { type: 'boolean' },
        listing: { type: 'string' },
      },
    }));
  } catch (error) {
    console.error(`build-release-content: ${messageOf(error)}`);
    console.error(USAGE);
    process.exit(2);
  }
  const checking = values.check === true;
  if (
    !values.release ||
    !values.head ||
    (checking ? !values.listing : !values.evidence || !values.out)
  ) {
    console.error(USAGE);
    process.exit(2);
  }
  try {
    const release = releaseOf(JSON.parse(readFileSync(values.release, 'utf8')));
    const inventory = inventoryFor({
      base: release.base,
      head: values.head,
      git: (args) =>
        execFileSync('git', args, {
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024,
        }),
    });
    if (checking) {
      releaseContentOf({
        release,
        inventory,
        report: JSON.parse(readFileSync(values.listing ?? '', 'utf8')),
        manifest: null,
        devVerified: null,
      });
      console.log(
        `build-release-content: ${values.release} holds for ${inventory.head}`,
      );
      return;
    }
    const dir = values.evidence ?? '';
    const content = releaseContentOf({
      release,
      inventory,
      report: JSON.parse(readFileSync(join(dir, EVIDENCE_REPORT), 'utf8')),
      manifest: readFileSync(join(dir, EVIDENCE_MANIFEST), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
      devVerified: devVerifiedOf(inventory.head),
    });
    writeFileSync(values.out ?? '', `${JSON.stringify(content, null, 2)}\n`);
    console.log(`build-release-content: wrote ${values.out}`);
  } catch (error) {
    console.error(messageOf(error));
    process.exit(1);
  }
};

if (import.meta.main) main();
