# Automated visual rebaseline for Dependabot pull requests (#459)

Status: design, self-approved after review passes (operator rule 2026-09-24).
Decisions taken by the operator, 2026-10-03:

1. **Automate the rebaseline** instead of keeping a local command
   (AskUserQuestion).
2. **No new secret.** The commit is pushed with the job's own short-lived
   `GITHUB_TOKEN`, and CI on the new head is started by dispatching `ci.yml`
   (AskUserQuestion).
3. **Playwright-only updates, nothing else.** A side review pointed out that
   the first draft acted on any dependency-only pull request, Astro
   included, which could bake a real visual change into a baseline. The
   operator: _"we cannot afford to allow any visual bugs go unnoticed and
   unfixed"_.
4. **A real merge lock, not a note** (after the plan was approved; #459
   comment 5967363108). A side review found that only a label and a rule in
   `CLAUDE.md` stood between a bot-written baseline and `develop`, while
   agents merge green pull requests there without asking. The operator chose
   a required check, `operator-review`, scoped to bot rebaselines (Unit 4).

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
- A pull request carrying a bot rebaseline merges only after the operator
  has approved it at its current head, and a required check enforces that
  (decision 4, Unit 4). Nothing commits a rebaseline before that check is
  required.
- No retries anywhere (operator rule 2026-10-02). Anything that does not
  arrive fails by name.
- Privilege is split. The job that runs pull-request code holds a read-only
  token and no secrets. The job that writes never checks out, installs or
  executes pull-request code, and never executes anything from the artifact.
- It acts only for pull requests **opened by** `dependabot[bot]` from this
  repository (not a fork) that update **Playwright and nothing else**, and
  whose head is level with `develop`. Operator, 2026-10-03: *"we cannot
  afford to allow any visual bugs go unnoticed and unfixed"*. Only a browser
  change is a reason for pixels to move with the site unchanged. Any other
  dependency (Astro above all, which builds every page) can change how the
  site really looks, so a red `visual` on such a PR stays red for a person to
  diagnose, exactly as today, even when Playwright is in the same group.

## Threat model

A Playwright update installs third-party code, and the capture job runs
it. A hostile dependency could therefore read the capture job's token (read
only, and it already runs in CI with the same token) and forge the artifact.
The forgery can reach the repository only as PNG bytes at paths that are
already baselines, after the validator checks the signature, size, hash and
path of each one, and only as a diff the operator must approve before it
merges (Unit 4). It cannot add a file, touch code or a workflow, or reach the
write token, which lives in a job that never runs pull-request code. The
manifest's strings are pattern-checked before any of them is written into a
comment.

## Architecture

Four new workflows and one new trigger on an existing one. Units 1-3 make
the rebaseline; Unit 4 holds its merge until the operator approves it.

```
Dependabot PR (Playwright only)
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
  validate artifact (fail-closed) ─► lock required? ─► PR head unchanged?
  ─► commit via Git Data API (fast-forward only) ─► dispatch ci.yml on the
  branch ─► comment
  │ workflow_dispatch
  ▼
ci.yml (unchanged jobs, so check names stay `build-and-test`, `visual`, …)

Every PR                          Operator's review
  │ pull_request_target             │ pull_request_review
  │                                 ▼
  │                         operator-review-relay.yml  (no permissions)
  │                                 │ workflow_run (completed)
  ▼                                 ▼
operator-review.yml   (default-branch code; statuses: write)
  pending ─► verdict ─► commit status `operator-review` on the PR head
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
  check, so a skip blocks nothing). It then decides, as a pure function in
  `scripts/visual-rebaseline.mjs`, unit-tested, and fail-closed. It qualifies
  only when all of these hold:
  1. the head repository equals the base repository;
  2. the PR's file list (`GET /pulls/{n}/files`, paginated, compared against
     the `changed_files` count so a truncated list refuses) holds only
     `package.json`, `package-lock.json` and `docker/playwright/Dockerfile`;
  3. **Playwright only:** `package-lock.json` read at the base and at the
     head (contents API) differs only in (a) the root `""` entry's
     `devDependencies["@playwright/test"]`, and (b) entries that are, or sit
     inside, `node_modules/@playwright/test`, `node_modules/playwright` or
     `node_modules/playwright-core` (Playwright's own tree, such as
     `node_modules/playwright/node_modules/fsevents`); and at least one of
     the three changed version. `package.json` differs in nothing but the
     `@playwright/test` value, and the Dockerfile, if touched, differs only
     in its `FROM` pin. Measured against the one real Playwright bump here
     (#26, `c6af312`, 1.61.1 to 1.63.0): it changed exactly the root
     `devDependencies` value, the three entries, and removed
     `node_modules/playwright/node_modules/fsevents`, so a rule naming only
     the three entries would have refused it. A group PR carrying Astro, a
     font, or anything else beside Playwright does not qualify;
  4. the head is level with the base (`GET /compare/{base}...{head}` reports
     `behind_by: 0`). A PR behind `develop` is skipped with that reason:
     branch protection is strict, so it must be brought level before it can
     merge, and that push runs the workflow again.

  Not qualifying is a success with a logged reason, never red. A
  Dockerfile-only PR (Dependabot's docker update bringing the pin level)
  moves no Playwright version, so it does not qualify: a red `visual` there
  is not a browser update, and a person diagnoses it.
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
- **locked?** Also before writing anything, it reads `GET /branches/develop`
  and refuses by name unless the branch's protection lists `operator-review`
  (Unit 4) among its required status checks, in `contexts` or in `checks`. A
  `contents: read` token sees both (measured, run 37112752013: HTTP 200,
  `contexts` `build-and-test`, `visual`, `closing-keywords`, and `checks`
  with each `app_id`). So until the operator has required the lock, a
  rebaseline captures and uploads but never commits.
- **guard against staleness:** the PR's current head must equal the
  manifest's head SHA. If Dependabot has rebased in between, it refuses by
  name. The next capture run will handle the new head.
- **commit** through the Git Data API: blobs, a tree on top of the head's
  tree, a commit whose parent is the head, then `PATCH refs/heads/<branch>`
  with `force: false`, so it can only fast-forward. The commit message names
  #459, the files and the versions. It names no author, so the commit takes
  the token's identity, `github-actions[bot]`, which Unit 4 keys on.
  Once a commit lands that Dependabot did not write, Dependabot stops
  rebasing the branch, so a later `develop` change is brought in with an
  ordinary update-branch. That push runs the capture again, which finds the
  gate passing and does nothing, and moves the head, so `operator-review`
  waits for the operator's approval at the new head (Unit 4).
- **dispatch** `ci.yml` on the branch
  (`POST /actions/workflows/ci.yml/dispatches`). GitHub exempts
  `workflow_dispatch` and `repository_dispatch` from the rule that a
  `GITHUB_TOKEN` starts no workflow; the dispatch is the one that runs
  `ci.yml` itself.
- **comment** on the PR: a table of each baseline, its pixel count and the
  Playwright version, and the line "Rebaselined automatically (#459).
  `operator-review` holds the merge until the operator approves the PNG diff
  at this head." It also adds the label `rebaseline-needs-review`, which makes
  the state visible on every listing; the lock does not read it. The label is
  created when this lands, and a failed label call fails the job by name.

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

### Unit 4: the `operator-review` lock (decision 4)

A required check that holds the merge until the operator has approved an
automatic rebaseline. It replaces a process rule that agents, who merge
green pull requests into `develop` without asking, could only remember.

**The verdict** is a pure function, `reviewVerdict`, in
`scripts/operator-review.mjs`, unit-tested and fail-closed. Its inputs are the
pull request's commits (each with its author login and changed paths), its
reviews, and the current head.

- **Locked** when any commit whose author login is `github-actions[bot]`
  changed a path under `tests/e2e/__screenshots__/`. It is keyed on the
  commit, not the label, because the agent App can remove a label. Agent CSS
  work, committed under the operator's authorship, keeps its current flow
  (decision 4). A commit on a screenshot whose author login is `null` (an
  email GitHub links to no account) locks too, so an identity that fails to
  resolve fails closed rather than open. On `develop`'s last 40 commits every
  author resolved: `ShydenMcM` 25, `shyden-agent[bot]` 14 (the App's API
  merges, committer `web-flow`), `dependabot[bot]` 1. Unit 2's commit names
  no author, so it takes the token's identity, as the App's API merges take
  the App's; the lock proof below measures that it resolves.
- **Unlocked:** `success`, "No automatic rebaseline in this pull request".
- **Locked:** `success` only when the operator's latest decisive review (his
  last review whose state is `APPROVED`, `CHANGES_REQUESTED` or `DISMISSED`;
  a `COMMENTED` review decides nothing, as in GitHub's own rule) is
  `APPROVED` and its `commit_id` is the current head. Otherwise `failure`,
  "Waiting for the operator to approve the rebaseline at <sha7>". Any later
  push moves the head, so the check goes red again. Only the login
  `ShydenMcM` counts; an agent's or Dependabot's approval never does.
- **Refusals** (the job fails and the status stays `pending`): a commit list
  shorter than the pull request's own `commits` count (the list endpoint
  stops at 250); a commit whose file list is truncated (`GET /commits/{sha}`
  pages at 300 files); any API call that fails or runs out of time.

**The workflows.**

- `operator-review.yml`, `name: Operator review`, the trusted half. `on:
  pull_request_target` (opened, synchronize, reopened) and `workflow_run` on
  `Operator review relay` (completed), whatever the relay's conclusion,
  since the verdict reads everything it needs itself. Both run the default
  branch's copy of the file, so a pull request cannot change the verdict.
  `permissions: contents: read, pull-requests: read, statuses: write`. It
  checks out only the default branch (no `ref:`, `persist-credentials:
  false`), installs nothing (the script uses Node's own `fetch`), and runs
  only `node scripts/operator-review.mjs`. It takes the pull request's number
  from `pull_request.number`, or from the relay's
  `workflow_run.pull_requests[0].number` (measured: populated after both a
  `pull_request_target` run and a `pull_request_review` run, runs 37112762418
  and 37112773792); an empty list fails by name. Before any read it posts
  `pending` on the payload's head, so an earlier `success` there cannot
  outlive a run that dies (a dismissal followed by a failed read, say). It
  then reads the current head from `GET /pulls/{n}`, since a newer push may
  have moved it, posts `pending` there too if it differs, and posts the
  verdict on it. The status context is `operator-review`.
- `operator-review-relay.yml`, `name: Operator review relay`, `on:
  pull_request_review` (submitted, dismissed). A review fires no
  `pull_request_target`, so this workflow exists only to complete and so fire
  the trusted half. `permissions: {}`, no checkout, one step that prints the
  pull request number. It runs the pull request's own copy of the file, which
  is why it decides nothing.

**A commit status, not a job's check run.** The relay's run belongs to the
default branch: measured, run 37112762418 has `head_sha` `9578a53` on
`develop`, while the pull request's head was `719be94`. A check run named
`operator-review` from that job would land on `develop`'s commit and never
satisfy the pull request. A status is posted on the SHA the verdict names
(measured: HTTP 201 from both triggers, creator `github-actions[bot]`). A
commit status satisfies a required check, as `main`'s `dev-verified` already
shows.

**Fail-closed by construction.** The rebaseline commit (Unit 2) is pushed
with `GITHUB_TOKEN`, which starts no `pull_request_target`, so the new head
carries no `operator-review`, and a missing required check blocks the merge
just as a red one does. The first verdict on that head comes from the
operator's review.

**Requiring it is the operator's.** Adding `operator-review` to `develop`'s
required checks is administration, which the agent App holds read-only. The
order is forced, as for every new gate here: merge first, then require, or
every open pull request waits on a check its base cannot produce. Pull
requests opened before the merge get the status on their next push. It is
added with no app pinned, as `dev-verified` is, since the agent App cannot
post a status at all. Unit 2's **locked?** step keeps the automation off until
it is done.

**Dependabot as the actor is still to be measured.** The docs say
`pull_request_target` "does not have these limitations" (the read-only token
that `pull_request` and `pull_request_review` get when Dependabot triggers
them), but no Dependabot pull request was open on 2026-10-03. The probe
merged in #460 stays on `develop` until one is, and records whether that run
can post a status. This work does not merge before it has: if it cannot, a
Dependabot pull request would never get its green `operator-review`, and the
design goes back to the operator. This work removes the probe.

**What the lock does not stop.** It stops an agent merging an unreviewed
rebaseline by mistake. It does not stop a deliberate bypass: a pull request
that edits a workflow could post the status from a `pull_request` or
`pull_request_review` run, which run the branch's copy; a commit could claim
`github-actions[bot]` as its author; a merged change could rewrite
`operator-review.yml`. Each is a workflow or authorship edit, visible in the
diff, and none happens by accident.

## Error handling

Every refusal names its cause in the log and in the job summary (written with
`tee`, so it reads back through the API, as #224 learned). No step retries.
Each network call has a time limit. A run that cannot decide fails, never
passes: an unclassifiable report, a truncated file list, an artifact with an
unexpected entry, a moved head.

## Testing

- **Unit (pure functions, `tests/unit/visual-rebaseline.test.ts`), one test
  per case:**
  - qualify: author; fork; each dependency path; any other path; the
    truncated list; a head behind the base; a Playwright bump alone
    qualifies, including a fixture copied from #26's real lockfile diff
    (root `devDependencies` value, three entries, nested `fsevents`
    removed); Playwright grouped with Astro, with a font, or with any other
    package does not; a lockfile entry added or removed outside Playwright's
    tree does not; a root-entry change other than the `@playwright/test`
    value does not; a `package.json` change outside `@playwright/test` does
    not; a Dockerfile change outside `FROM` does not; a Dockerfile-only PR
    does not.
  - report classification: screenshot-only, mixed, timeout, missing
    baseline, count mismatch.
  - validate: each refusal above; locked?: the check named in `contexts`, in
    `checks`, in neither, and a branch with no protection.
  - verdict (`tests/unit/operator-review.test.ts`): no bot commit; a bot
    commit outside the screenshots; a bot commit on a screenshot with no
    review; a commit on a screenshot whose author login is `null`; approved
    at the head; approved at an older commit; approved by the App, and by
    Dependabot; approved then changes requested; approved then commented;
    approved then dismissed; a truncated commit list; a truncated file list.

  Fixtures are written in the test, never imported from the code under test.
- **Wiring guards (`pipeline-wiring.test.ts`), each mutation-verified RED and
  restored GREEN:** no `ci.yml` job passes `--update-snapshots`, and the
  config keeps `'none'`; the capture workflow has no write scope, no secrets
  and `persist-credentials: false`; the commit workflow is `workflow_run`
  only, never checks out a ref other than the default, installs only with
  `npm ci --ignore-scripts`, and runs `node` only on scripts from that
  default-branch checkout; no step in either workflow retries; `ci.yml`'s
  triggers are exactly the three above; and the commit workflow's trigger
  names the capture workflow's `name:`. For the lock: `operator-review.yml`
  is started by `pull_request_target` and a `workflow_run` naming the relay's
  `name:`, and nothing else; it checks out no ref and keeps no token,
  installs nothing, runs only `node scripts/operator-review.mjs`, and holds
  exactly its three scopes; the relay is started by `pull_request_review`
  `submitted` and `dismissed` and nothing else (without `dismissed`, a
  dismissed approval would keep its `success`), declares `permissions: {}`
  and checks nothing out; the commit workflow's **locked?** step comes before
  its first write. Each guard counts the jobs or steps it judges, with a floor
  at the measured figure minus one, and plants each construct in each form
  the workflows write it (global rule 2026-10-02, point e).
- **End-to-end on the real runner, after the develop merge.** GitHub fires
  `workflow_run` only for a workflow file on the default branch, and the
  dispatch needs `ci.yml`'s new trigger there too, so nothing before the
  merge can exercise the chain. A real drift arriving between the merge and
  the proof would write nothing until the operator has required
  `operator-review` (Unit 2's **locked?**), and after that the lock holds
  whatever it wrote, which is the bound on that window. So the operator
  requires the check first. The first proof run then establishes three
  things in order, and if any fails the work stops and goes to the operator:
  the commit workflow's token can push to the Dependabot branch, it can
  dispatch `ci.yml` there, and branch protection accepts the dispatched run's
  checks on that head (every required check but `operator-review` reads
  `success`, and `mergeStateStatus` reads `CLEAN` once the operator has
  approved).
  - *Positive:* a Dependabot pull request whose diff against `develop` is
    Playwright-only and moves pixels turns `visual` red; capture and commit
    run, the dispatched CI is green on the new head, and the PNG diff shows
    in the file view. No such pull request exists while the repository is on
    the latest Playwright, so the proof makes one: on an open Dependabot pull
    request, one commit (pushed as the App, so the pull request's author
    stays `dependabot[bot]`) returns that pull request's own change to the base
    and sets Playwright to a release measured to drift. The five releases
    measured so far (1.59.1 to 1.62.1) move no pixel past the gate, so the
    proof first searches further back for one that does, through the shipped
    capture workflow after the merge (the operator deferred the throwaway
    search, #459 comment 5966311423; CI renders only in noble images, so
    1.45.3 to 1.58.2 are measurable). If none does, that goes to the operator
    before anything is built on the proof.
  - *Negative:* the same pull request with a source file also changed gets no
    rebaseline, and so does one where Playwright is grouped with another
    package (the font candidate measured 2026-10-03,
    `@fontsource-variable/instrument-sans` 5.2.4, whose
    `latin-wght-normal.woff2` differs from 5.3.0's: a real pixel change that
    must stay red).
  - *Dependabot as the actor:* afterwards, `@dependabot recreate` rebuilds the
    pull request from scratch, discarding the proof's commits. The capture
    workflow then runs under Dependabot's own restricted token and ends green,
    qualifying or not as the rule decides for the rebuilt diff.
  - *The lock,* once the operator has required `operator-review`: an agent's
    pull request gets `success`; on the positive proof's pull request, the
    rebaseline's head has no `operator-review` and `mergeStateStatus` reads
    `BLOCKED`; an App review changes nothing; the operator's approval turns
    it `success`; a later push turns it `failure` again. Before any of this,
    the probe's row for a Dependabot-triggered `pull_request_target` must
    read HTTP 201 (Unit 4).
  - Every run ID is recorded on #459.

## Out of scope

Rebaselining non-Dependabot pull requests (a person changing CSS runs
`npm run test:visual:update` and reviews it, as today); any Dependabot update
other than Playwright alone, Astro, fonts and group pull requests included
(decision 3: a red `visual` there may be a real visual change, so a person
diagnoses it); any baseline outside `tests/e2e/__screenshots__`; merging
automatically.

## Review log

Reviewed to zero on 2026-10-03, one pass at a time, each pass running the
mechanical checks (prettier, line length, placeholders, cited issues exist,
and from pass 22 the whole unit suite, whose guards read this file) and
reading the whole document.

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
| 14 | after decision 3: a rule naming only the three lockfile entries would have refused #26, the one real Playwright bump (root `devDependencies` value, nested `fsevents`); Dockerfile-only PRs stated as not qualifying |
| 15 | no Playwright-only Dependabot PR exists to prove on, so the proof makes one; "qualifying" on recreate was wrong; Dockerfile-only test missing |
| 16 | `md-swap.py` (the helper built after pass 9) dropped a trailing blank line, gluing the decisions list to a heading; tool fixed and tested |
| 17 | Out of scope did not name the non-Playwright updates decision 3 excludes |
| 18 | none |
| 19 | after decision 4 (Unit 4, measured by the #460 probe): constraints and diagram lacked the lock and Unit 2's **locked?**; threat model cited no enforcement; an unresolved author login would have failed open (now locks; logins on develop measured); Unit 2 claimed an author it does not set; `pending` was posted only after a read that could fail; the proof expected `CLEAN` where the lock makes it `BLOCKED`, and could not commit before the check is required; stale "first task measures 1.40 to 1.58"; a `null`-author test missing; three ragged lines |
| 20 | update-branch after a rebaseline did not say the lock re-arms; the trusted half could have been gated on the relay's conclusion; no guard pinned the relay's `dismissed` trigger (dropping it would fail open); "author stays `dependabot[bot]`" read as the commit's author beside a lock keyed on it; two ragged lines |
| 21 | logged as none, but its checks never ran the unit suite, which reads this file: the pre-push hook's `documents only a context something in this repository can report` read the **locked?** sentence's API path as a context claimed as required, because it sat just before the protection field's name (reworded) |
| 22 | this log's own row 21 quoted that same shape and tripped the same guard (reworded); checks now include the whole unit suite |
| 23 | the log's own introduction still listed the checks without the unit suite |
| 24 | none |
