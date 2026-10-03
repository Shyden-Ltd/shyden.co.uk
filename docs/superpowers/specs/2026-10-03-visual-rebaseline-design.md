# Automated visual rebaseline for Dependabot pull requests (#459)

Status: design, self-approved after review passes (operator rule 2026-09-24).
Decisions taken by the operator, 2026-10-03, both through AskUserQuestion:

1. **Automate the rebaseline** instead of keeping a local command.
2. **No new secret.** The commit is pushed with the job's own short-lived
   `GITHUB_TOKEN`, and CI on the new head is started by dispatching `ci.yml`.

## Why, and what was measured first

A Playwright update ships new browsers, and new browsers can move pixels, so
the `visual` gate could go red on a Dependabot pull request while the site is
unchanged. Today the fix is `npm run test:visual:update` in the pinned
container and a review by eye.

Measured on the real runner (throwaway run 37099208646, 2026-10-03): today's
28 baselines, captured on 1.63.0, rendered by 1.59.1, 1.60.0, 1.61.1, 1.62.0
and 1.62.1, each in its own digest-pinned image, with 1.63.0 as the control.
The gate passed 28/28 on every leg. At zero tolerance every leg stayed inside
the control's noise band (at most 10 differing pixels per screenshot, against
the control's 6). Drift so far: **0 gate failures in 5 releases**. This
feature is insurance, and its end-to-end proof must induce a drift, because
history will not supply one.

## Constraints

- The gate (`ci.yml` job `visual`) never rewrites what it checks.
  `playwright.config.ts` keeps `updateSnapshots: 'none'`, and no `ci.yml` job
  passes `--update-snapshots`. Only the capture job below recaptures, in a
  throwaway checkout whose output reaches the repository solely as a commit
  the operator reviews.
- A baseline changes only as a reviewable diff in the pull request.
- No retries anywhere (operator rule 2026-10-02). Anything that does not
  arrive fails by name.
- Privilege is split. The job that runs pull-request code holds a read-only
  token and no secrets. The job that writes never checks out, installs or
  executes pull-request code, and never executes anything from the artifact.
- It acts only for pull requests **opened by** `dependabot[bot]` from this
  repository (not a fork), whose changed files are all dependency files, and
  whose head is level with `develop`.

## Threat model

A Dependabot pull request installs third-party code, and the capture job runs
it. A hostile dependency could therefore read the capture job's token (read
only, and it already runs in CI with the same token) and forge the artifact.
The forgery can reach the repository only as PNG bytes at paths that are
already baselines, after the validator checks the signature, size, hash and
path of each one, and only as a diff the operator reviews before it merges. It
cannot add a file, touch code or a workflow, or reach the write token, which
lives in a job that never runs pull-request code. The manifest's strings are
pattern-checked before any of them is written into a comment.

## Architecture

Two new workflows and one new trigger on an existing one.

```
Dependabot PR (deps only)
  │ pull_request
  ▼
visual-rebaseline.yml           (read-only token, no secrets, runs PR code)
  qualify ─► image ─► capture
                        ├─ gate passes            → nothing to do, success
                        ├─ any non-screenshot fail → fail by name, no artifact
                        └─ only screenshot fails  → recapture (=all), keep the
                                                    gate-failed files only,
                                                    upload artifact + manifest
  │ workflow_run (completed, success)
  ▼
visual-rebaseline-commit.yml    (contents/actions/pull-requests: write;
                                 default-branch code only, no PR checkout)
  validate artifact (fail-closed) ─► PR head unchanged? ─► commit via Git
  Data API (fast-forward only) ─► dispatch ci.yml on the branch ─► comment
  │ workflow_dispatch
  ▼
ci.yml (unchanged jobs, so check names stay `build-and-test`, `visual`, …)
```

### Unit 1: `visual-rebaseline.yml` (capture, unprivileged)

Workflow `name: Visual rebaseline capture`, which Unit 2's trigger names
exactly (a guard asserts the two agree).

- `on: pull_request`. `permissions: contents: read, pull-requests: read` at
  the workflow level (declaring any scope sets every other to none, and
  qualify reads the PR's file list), `persist-credentials: false` on every
  checkout, no `secrets.*` reference, and every job bounded by
  `timeout-minutes`.
- **qualify** carries a job-level `if:` on the PR author, so every other
  pull request skips the whole workflow at no cost (it is not a required
  check, so a skip blocks nothing). It then decides from the event and two
  reads, as a pure function in `scripts/visual-rebaseline.mjs`, unit-tested.
  It qualifies only when the head repository equals the base repository; the
  pull request's file list (`GET /pulls/{n}/files`, paginated, compared
  against the `changed_files` count so a truncated list refuses) holds only
  `package.json`, `package-lock.json` or `docker/playwright/Dockerfile`; and
  the head is level with the base (`GET /compare/{base}...{head}` reports
  `behind_by: 0`). A PR behind `develop` is skipped with that reason: branch
  protection is strict, so it must be brought level before it can merge, and
  that push runs the workflow again. Not qualifying is a success with a
  logged reason, never red.
- **image** runs `scripts/playwright-image.mjs`, exactly as `ci.yml` does, so
  capture renders in the gate's image.
- **capture** runs in that image (`linux/amd64`, as the gate does), on a
  checkout of the PR's **head SHA** (`ref: github.event.pull_request.head.sha`),
  not the merge ref a `pull_request` checkout defaults to, because the commit
  lands on the head. Being level with the base, the head and the merge ref
  hold the same tree.
  1. Runs the gate (`npx playwright test --project=visual`, with `VISUAL=1`
     as `ci.yml` sets it, since the project is declared only under that
     variable) with the JSON reporter into a file, letting it fail.
  2. Classifies the report with a pure function: every failed test must have
     failed only on `toHaveScreenshot` mismatches, and the report's own test
     total must equal the listed visual total. Anything else (a timeout, a
     missing baseline, a crash, a count mismatch) fails the job by name and
     uploads nothing.
  3. If nothing failed: success, no artifact.
  4. Otherwise recaptures with `--update-snapshots=all` (measured
     deterministic, #134) and takes `git diff --name-only`. The files kept are
     exactly the screenshots the gate failed. A gate-failed screenshot with no
     git change is a contradiction and fails the job.
  5. Uploads an artifact holding those PNGs and `manifest.json`: for each file
     its repository path, sha256, byte size and the gate's differing-pixel
     count, plus the PR number, the head SHA the capture ran on, and the
     Playwright version.

### Unit 2: `visual-rebaseline-commit.yml` (commit, privileged)

- `on: workflow_run: workflows: ['Visual rebaseline capture'], types:
  [completed]`. It runs from the default branch's copy of the file, so a pull
  request cannot change it. It proceeds only when the triggering run
  concluded `success` and came from a `pull_request` event. A run with no
  artifact (the gate passed, or the PR did not qualify) is a logged success
  with nothing to do.
- `permissions: contents: write, actions: write, pull-requests: write`
  (commit, dispatch, comment), nothing else. It checks out only the default
  branch and installs only the default branch's lockfile, with
  `npm ci --ignore-scripts`, because the dispatchability check parses YAML
  with the repository's `yaml` package (a structural question, which this
  repository answers by parsing, never by matching text). Nothing from the
  pull request is checked out, installed or run. The artifact is downloaded
  into an empty directory and walked with `lstat`.
- **validate**, a pure function in `scripts/visual-rebaseline.mjs`, refuses
  the whole artifact by name unless all of these hold: the manifest parses and
  has exactly the documented keys; every path matches
  `tests/e2e/__screenshots__/<name>-linux.png`, has no `..` and is a regular
  file in the artifact (no symlinks); every path already exists in the PR
  head's tree (read through the API, so no new files); each file begins with
  the PNG signature, is under 2 MB (the largest baseline today is 578 KB),
  and has the manifest's sha256 and size; the artifact holds exactly the
  manifest's files; and the PR number, head SHA and version match fixed
  patterns (digits, 40 hex, semver) before any of them reaches a comment.
- **dispatchable?** Before writing anything, it reads `ci.yml` at the PR head
  (contents API) and confirms its parsed `on:` has `workflow_dispatch`. A
  Dependabot branch cut before Unit 3 landed lacks it, and a commit there
  would leave the head with no checks, so it refuses by name and writes
  nothing. (Dependabot's next rebase brings the trigger in.)
- **guard against staleness:** the PR's current head must equal the
  manifest's head SHA. If Dependabot has rebased in between, it refuses by
  name. The next capture run will handle the new head.
- **commit** through the Git Data API: blobs, a tree on top of the head's
  tree, a commit whose parent is the head, then `PATCH refs/heads/<branch>`
  with `force: false`, so it can only fast-forward. The commit message names
  #459, the files and the versions. The author is `github-actions[bot]`.
  Once a commit lands that Dependabot did not write, Dependabot stops
  rebasing the branch, so a later `develop` change is brought in with an
  ordinary update-branch. That push runs the capture again, which finds the
  gate passing and does nothing.
- **dispatch** `ci.yml` on the branch
  (`POST /actions/workflows/ci.yml/dispatches`). GitHub exempts
  `workflow_dispatch` and `repository_dispatch` from the rule that a
  `GITHUB_TOKEN` starts no workflow; the dispatch is the one that runs
  `ci.yml` itself.
- **comment** on the PR: a table of each baseline, its pixel count and the
  Playwright version, and the line "Rebaselined automatically (#459). The
  operator reviews the PNG diff before this merges." It also adds the label
  `rebaseline-needs-review`. The label is created when this lands, and a
  failed label call fails the job by name.

### Why the commit workflow's token can write

GitHub restricts runs that Dependabot triggers *"from `push`, `pull_request`,
`pull_request_review`, or `pull_request_review_comment` events"*: those get
*"a read-only `GITHUB_TOKEN`"* and no Actions secrets (GitHub docs,
*Troubleshooting Dependabot on GitHub Actions*, read 2026-10-03).
`workflow_run` is not on that list, so the commit workflow receives exactly
the permissions it declares. The capture workflow declares read-only
regardless, because it runs pull-request code.

### Unit 3: `ci.yml` gains `workflow_dispatch`

`on:` becomes `pull_request`, `workflow_call` and `workflow_dispatch`.
Nothing else changes, and job names stay as they are, which is what branch
protection and `scripts/deploy-gate.mjs` match. Measured: the gate reads
`/commits/{sha}/check-runs` by name, with no event filter. A dispatched run
has no PR number, so its concurrency key already falls back to the run id
(a group of one). The dispatched run checks out the branch head, which is
the tree the merge ref would hold because qualify requires the PR to be
level. No `ci.yml` job needs pull-request context: the `workflow_call` path
from `deploy-dev.yml` already runs every job without it (#163). The
`pipeline-wiring` trigger pin is updated in the same change.

## The operator's review

A pull request labelled `rebaseline-needs-review` is not merged into
`develop` by an agent until the operator has approved it (a PR review, or
approval stated in the session and recorded on the PR). This is a process
rule, held by `CLAUDE.md` and memory. The label makes it visible on every
listing.

## Error handling

Every refusal names its cause in the log and in the job summary (written with
`tee`, so it reads back through the API, as #224 learned). No step retries.
Each network call has a time limit. A run that cannot decide fails, never
passes: an unclassifiable report, a truncated file list, an artifact with an
unexpected entry, a moved head.

## Testing

- **Unit (pure functions, `tests/unit/visual-rebaseline.test.ts`):** qualify
  (author, fork, each dependency path, any other path, the truncated list, a
  head behind the base), report classification (screenshot-only, mixed,
  timeout, missing baseline, count mismatch), and validate (each refusal
  above), one test per case. Fixtures are written in the test, never imported
  from the code under test.
- **Wiring guards (`pipeline-wiring.test.ts`), each mutation-verified RED and
  restored GREEN:** no `ci.yml` job passes `--update-snapshots`, and the
  config keeps `'none'`; the capture workflow has no write scope, no secrets
  and `persist-credentials: false`; the commit workflow is `workflow_run`
  only, never checks out a ref other than the default, installs only with
  `npm ci --ignore-scripts`, and runs `node` only on scripts from that
  default-branch checkout; no step in either workflow retries; `ci.yml`'s
  triggers are exactly the three above; and the commit workflow's trigger
  names the capture workflow's `name:`. Each guard counts the jobs or steps it
  judges, with a floor at the measured figure minus one, and plants each
  construct in each form the workflows write it (global rule 2026-10-02,
  point e).
- **End-to-end on the real runner, after the develop merge.** GitHub fires
  `workflow_run` only for a workflow file on the default branch, and the
  dispatch needs `ci.yml`'s new trigger there too, so nothing before the
  merge can exercise the chain. A real drift arriving between the merge and
  the proof would run the chain unproven; whatever it wrote would still be a
  labelled diff that the operator reviews before it merges, which is the
  bound on that window. The first proof run establishes three things in
  order, and if any fails the work stops and goes to the operator: the commit
  workflow's token can push to the Dependabot branch, it can dispatch
  `ci.yml` there, and branch protection accepts the dispatched run's checks
  on that head (`mergeStateStatus` reads `CLEAN` once they pass).
  - *Positive:* on a Dependabot pull request, a dependency-only commit that
    moves pixels turns `visual` red; capture and commit run, the dispatched CI
    is green on the new head, and the PNG diff shows in the file view. The
    candidate, measured 2026-10-03: `@fontsource-variable/instrument-sans`
    5.2.4 ships a different `latin-wght-normal.woff2` from 5.3.0 (sha1
    `3fcfaf5f0e…` against `adbdfd9a78…`), so pinning 5.2.4 changes the body
    face. If it moves no pixel, the plan finds another before the proof.
  - *Negative:* the same pull request with a source file also changed gets no
    rebaseline.
  - *Dependabot as the actor:* afterwards, `@dependabot recreate` rebuilds the
    pull request from scratch, discarding the proof's commits, and shows the
    capture workflow qualifying under Dependabot's own restricted token and
    passing with nothing to do.
  - Every run ID is recorded on #459.

## Out of scope

Rebaselining non-Dependabot pull requests (a person changing CSS runs
`npm run test:visual:update` and reviews it, as today); any baseline outside
`tests/e2e/__screenshots__`; merging automatically.

## Review log

Reviewed to zero on 2026-10-03, one pass at a time, each pass running the
mechanical checks (prettier, line length, placeholders, cited issues exist)
and reading the whole document.

| Pass | Findings |
| --- | --- |
| 1 | `workflow_run` and dispatch need default-branch files, so the proof follows the merge; dispatch to a branch without the trigger would strand the PR; token rules quoted from the docs; label must exist; author check moved to a job-level `if:` |
| 2 | validator imports; artifact walked with `lstat`; no artifact is a success; capture rendered the merge ref, not the head (now head SHA, PR level with base); dispatched run's checkout; size limit measured (578 KB) |
| 3 | constraints missed "level with develop"; no threat model |
| 4 | placeholder workflow name; qualify tests missed "behind base" |
| 5 | false claim that the feature "can only refuse" before the proof; Dependabot stops rebasing after a foreign commit; two ragged lines |
| 6 | the positive proof needed a measured dependency-only drift (Instrument Sans 5.2.4); closing a real Dependabot PR replaced by `@dependabot recreate` |
| 7-9 | two Edit anchors ended mid-line and glued old text on; a sentence inserted mid-paragraph; capture needs `pull-requests: read` |
| 10 | capture omitted `VISUAL=1` |
| 11 | "no `npm ci`" contradicted parsing YAML (now the default branch's lockfile, `--ignore-scripts`); dispatch was not the only exempt event |
| 12 | one ragged bullet |
| 13 | none |
