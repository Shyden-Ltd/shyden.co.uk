# Handover — 2026-09-22: #292 is shipped and retired, #291 is under way

**Branch `291-upload-evidence-assets-from-a-script`, off `develop` at
`702f07d6`.** No SHA here is a fact to rely on without re-reading
(`git rev-parse HEAD`).

## Done this session, and verified

1. **#292 is shipped and retired.** PR #304 merged to `develop` as `702f07d6`
   with a merge commit (parents `95bdc1b` and `8f79e701`, the tested head).
   CI run 35748665512 was confirmed against `gh pr view 304 --json headRefOid`
   before the merge (#121) — `build-and-test`, `visual` and `closing-keywords`
   all `pass`. Dev deploy run 35753109360, every job read BY NAME: gate
   `success`, `Deploy to Dev` `success`, `Verify dev + dev-verified`
   **`success` and not skipped** (the #157 trap; `Comprehensive web tests` is
   skipped by design, the gate having proved the tree). `dev-verified` read
   OFF THE COMMIT: `state: success`. Issue closed, board read back as
   `project=Shyden Site issue=#292 status=Done`.

2. **#291's design question is answered and posted to the ticket**
   (comment 5779853716). The assets listing returns each asset's id, byte
   count and **sha256**, and no filename — so the map is derived by content
   hash, never transcribed, and resumability falls out of the same mechanism.
   Measured on the `Asset Store Probe` artifact. The one clause the medium
   refuses is AC1's literal "the script uploads": there is no CLI for the
   asset store, so the script prints the batches and the agent makes the
   `Artifact` calls.

3. **#291 is started, TDD, 4 tests green.**
   `scripts/upload-evidence-assets.mjs` + `tests/unit/upload-assets.test.ts`.
   `parseAssetListing` reads the listing's own text and refuses three ways: a
   line the format does not explain, a text with no header, and a listing
   holding fewer assets than its header declares (the listing PAGES, so a page
   taken for the whole store re-uploads everything beyond it). An empty store
   reads as empty, because that is what a first run sees.

## Then, in order — a cold session can start here

1. **Continue #291's test list**, drafted at
   `scratchpad/291-test-list.md`. Next is the sha256 join itself: the map
   pairs every key with the id whose sha256 matches its file, with a liveness
   control proving two different files land on different ids (a join returning
   `listing[0].id` for everything must go RED).
2. Then batching (≤25 per call, derived from the plan), the byte-count
   refusal, and the `PROBES` entry in `tests/unit/script-entry.test.ts`
   (`status: 2`, `says: 'usage: upload-evidence-assets.mjs'`) with the entry
   behind `import.meta.main` (#276).
3. Mutation-verify in both directions, predictions written FIRST, and run the
   WHOLE file per mutation (a filtered run is how a vacuous guard survives).
4. `npm run format` here is `prettier --check` — use `npx prettier --write`.

## Waiting on Shyden — nothing here is mine to do

- **#189** (P0), unchanged: evidence page
  https://claude.ai/artifact/Go5PdbKiroPHAJNA1gkeNr needs his sign-off, and
  AC11 needs the reported case confirmed on a **real iOS device**.
- **#241** is blocked on him: repository administration (secrets into
  environments, splitting the Cloudflare token). The App cannot do either.
- **#278** needs one administration step: `closing-keywords` is not a gate
  until it joins `required_status_checks.contexts`. It ran `pass` on #304.
- **#299's amended AC2 wants one eyeball**: the next Dependabot pull request
  should carry `dependencies` + `npm` (or `+ github-actions`) and **no**
  `Labels` comment.

## Environment note, not a code problem

`claude-mem` still cannot save memories: the observer's allowance on the
provider is exhausted (since 2026-09-21T21:28:27Z) — _"Provider reported the
inference allowance exhausted"_. **Do not restart the worker** — that clears
the backoff protecting the provider. File-based memory under
`~/.claude/projects/.../memory/` is unaffected and was written to this session.
