import { execFileSync } from 'node:child_process';

/**
 * May this commit be deployed to dev without re-running the whole suite?
 *
 * `release-dev.yml` used to re-run the entire merge gate on every push to
 * `develop`: the same seven steps `ci.yml` runs, ~26 minutes, against a tree
 * that had already passed them. That duplicate was also the ONLY place the
 * suite ran under a `timeout-minutes`, which is how run 34676066071 was
 * cancelled at 24m02s while both the deploy and the verify job were skipped —
 * a failure that posts no red gate and reads as "nothing happened" (#155).
 *
 * The obvious fix does not work, and finding that out first is what produced
 * this design. `ci.yml` triggers on `pull_request` ONLY, so it has never run
 * against a merge commit: there is no `build-and-test` status sitting there to
 * read, and a gate querying `/statuses` would find nothing at all.
 *
 * What is true is that `develop` sets `strict: true`, so a PR cannot merge
 * unless it is up to date with its base — which makes the merge commit's TREE
 * identical to the tested head's tree. Measured on 6695877: the merge commit
 * and its second parent 49fd9c5 are both tree
 * eb26eb490c6c84e670315b1103199d4006fa5998.
 *
 * So this verifies tree equality instead of trusting a status to exist, which
 * is strictly stronger: it refuses BY CONSTRUCTION whenever the deployed bytes
 * are not the bytes that passed — a direct push or a squash/rebase merge (one
 * parent), a dispatched branch, or any tree that differs.
 *
 * The only dangerous failure here is a false GREEN, so every ambiguous case
 * refuses: an unresolvable tree, an absent check-run, a null conclusion. An
 * absent result must never be indistinguishable from a passing one (#146).
 */

/**
 * The checks that gate a merge into `develop`.
 *
 * A literal pin against the branch-protection contexts
 * (`["build-and-test","visual"]`, `strict: true`, `enforce_admins: true`).
 * `visual` belongs here: a gate that forgot it would deploy a tree whose visual
 * regressions were never judged, and #33 exists because a suite that detects
 * but does not block is decoration.
 */
export const REQUIRED_CHECKS = ['build-and-test', 'visual'];

/** @param {unknown} sha */
const short = (sha) => String(sha ?? '').slice(0, 7);

/**
 * Sort key for "which run of this name is current".
 *
 * A run still going has no `completedAt` and is by definition not superseded,
 * so it sorts LAST and therefore decides — matching branch protection, where a
 * pending required check does not satisfy the rule.
 *
 *  @param {{ completedAt?: string | null } | undefined} run
 */
const finishedAt = (run) =>
  run?.completedAt ? Date.parse(run.completedAt) : Number.POSITIVE_INFINITY;

/**
 * One GitHub check-run, reduced to the three fields that decide anything.
 *
 * @typedef {{
 *   name: string,
 *   conclusion: string | null,
 *   completedAt: string | null,
 * }} CheckRun
 */

/**
 * Annotated rather than left to inference: TypeScript reads `parents = []` as
 * `never[]` and `treeOf = {}` as `{}`, so every real argument became a type
 * error and the suite could not be type-checked at all. `astro check` caught
 * it, which is the whole reason this repo turned type-checking on (#115).
 *
 * @param {{
 *   sha: string,
 *   parents?: readonly string[],
 *   treeOf?: Record<string, string | undefined>,
 *   checks?: readonly CheckRun[],
 * }} input
 * @returns {{ deploy: boolean, reason: string }}
 */
export const decideDeploy = ({
  sha,
  parents = [],
  treeOf = {},
  checks = [],
}) => {
  if (parents.length < 2) {
    return {
      deploy: false,
      reason:
        `${short(sha)} has ${parents.length} parent(s). Only a merge commit carries a second ` +
        `parent whose tree was tested; a direct push, a squash merge or a rebase merge does ` +
        `not, so the suite has to run here.`,
    };
  }

  const tested = parents[1];
  const mergeTree = treeOf[sha];
  const testedTree = treeOf[tested];

  if (!mergeTree || !testedTree) {
    return {
      deploy: false,
      reason:
        `could not resolve a tree for ${short(mergeTree ? tested : sha)} — refusing rather ` +
        `than assuming the trees are equal.`,
    };
  }

  if (mergeTree !== testedTree) {
    return {
      deploy: false,
      reason:
        `tree mismatch: ${short(sha)} is ${short(mergeTree)} but its tested head ` +
        `${short(tested)} is ${short(testedTree)}. The bytes being deployed are not the ` +
        `bytes that passed.`,
    };
  }

  for (const name of REQUIRED_CHECKS) {
    const runs = checks.filter((run) => run?.name === name);
    if (runs.length === 0) {
      return {
        deploy: false,
        reason:
          `no ${name} check-run on the tested head ${short(tested)}. An absent result is ` +
          `not a pass — that equivalence is the defect this gate exists to avoid.`,
      };
    }
    const current = runs.reduce((a, b) =>
      finishedAt(b) >= finishedAt(a) ? b : a,
    );
    if (current.conclusion !== 'success') {
      return {
        deploy: false,
        reason:
          `${name} on ${short(tested)} is ${current.conclusion ?? 'still running'}, not ` +
          `success. Deploying would publish a tree whose gate did not pass.`,
      };
    }
  }

  return {
    deploy: true,
    reason:
      `tree ${short(mergeTree)} is identical to tested head ${short(tested)}, which passed ` +
      `${REQUIRED_CHECKS.join(' + ')}.`,
  };
};

/** @param {...string} args */
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/**
 * @param {string} repo
 * @param {string} sha
 * @param {string} token
 */
const checkRunsFor = async (repo, sha, token) => {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    },
  );
  if (!res.ok)
    throw new Error(`check-runs for ${short(sha)}: HTTP ${res.status}`);
  const body =
    /** @type {{ check_runs?: { name: string, status: string, conclusion: string | null, completed_at: string | null }[] }} */ (
      await res.json()
    );
  return (body.check_runs ?? []).map((run) => ({
    name: run.name,
    conclusion: run.conclusion,
    completedAt: run.completed_at,
  }));
};

const main = async () => {
  const sha = process.env.GITHUB_SHA ?? git('rev-parse', 'HEAD');
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    // Refusing is the safe direction: without the API this cannot prove anything.
    console.error(
      'deploy-gate: GITHUB_REPOSITORY and GITHUB_TOKEN are required',
    );
    process.exit(1);
  }

  const parents = git('rev-list', '--parents', '-n', '1', sha)
    .split(/\s+/)
    .slice(1);
  const treeOf = Object.fromEntries(
    [sha, ...parents].map((ref) => {
      try {
        return [ref, git('rev-parse', `${ref}^{tree}`)];
      } catch {
        return [ref, undefined];
      }
    }),
  );
  const checks =
    parents.length > 1 ? await checkRunsFor(repo, parents[1], token) : [];

  const { deploy, reason } = decideDeploy({ sha, parents, treeOf, checks });
  console.log(`deploy-gate: ${deploy ? 'PROCEED' : 'REFUSE'} — ${reason}`);
  if (!deploy) process.exit(1);
};

// Only when run, never when imported: `tests/unit/deploy-gate.test.ts` imports
// `decideDeploy`. Matching the entry file's name would run `main()` for any
// entry file whose name ended the same way (#221,
// `tests/unit/script-entry.test.ts`).
if (import.meta.main) await main();
