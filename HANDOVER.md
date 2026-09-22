# Handover — 2026-09-22: #277 is merged, deployed to dev and verified

Branch **`develop`**, level with `origin/develop`. Nothing is running,
nothing is waiting. `277-one-home-for-near-duplicate-functions` is merged
and deleted both locally and on the remote.

**This file is the only thing in the working tree, and it is uncommitted on
purpose.** `develop` refuses a direct push — every change reaches it through
a pull request — and a docs-only PR would burn a full CI run, so this handover
is not worth one. It travels the way every previous handover did: commit it on
the next ticket's branch, with that ticket's first commit. Until then do not
run `git checkout -- HANDOVER.md`, which reverts to HEAD and would destroy it.

No SHA is written here as a fact to rely on. Read the head with
`git rev-parse HEAD` and compare it to whatever any run or status reports
before trusting it.

## What landed

PR **#293** merged into `develop` as a **merge commit** (`874ba41`, two
parents), so `scripts/deploy-gate.mjs` could prove the merged tree equals
its second parent's — verified by hand before merging: both trees are
`2c137e9`.

Gates, each read by name rather than off a run's conclusion:

| where                    | job                               | result                 |
| ------------------------ | --------------------------------- | ---------------------- |
| CI `35695207300`         | `build-and-test`                  | success                |
| CI `35695207300`         | `visual`                          | success                |
| PR body `35695207302`    | `closing-keywords`                | success                |
| deploy-dev `35700714482` | `Gate — this tree already passed` | success                |
| deploy-dev `35700714482` | `Comprehensive web tests`         | **skipped, by design** |
| deploy-dev `35700714482` | `Deploy to Dev`                   | success                |
| deploy-dev `35700714482` | `Verify dev + dev-verified`       | success                |

`dev-verified = success`, read **off the commit** `874ba41`, not off the
run. The skip above is the gate working: the suite already passed on the
PR, so it is not run twice. The job that must never skip is
`Verify dev + dev-verified`, and it ran.

`develop`'s required contexts are `build-and-test` and `visual`, with
`strict=true`. `closing-keywords` is green but **not required** — that is
#278, repository administration, which the App holds read-only.

**#277 is closed.** The duplication scan reports 0 undecided pairs, down
from 27 at the branch point.

## Filed this session

**#294** — nine touch-target assertions check height alone and none of the
44px reads are rounded. The evidence came out of #277 and was deliberately
left there: widening an assertion is coverage, not refactoring.

Its scope was **derived from disk, and the handover it came from was wrong**:
nine height-only sites across **four** e2e specs, not six, plus two sites in
`tests/device/ios/journeys.journey.ts` that assert both dimensions unrounded
and cannot take `atLeast44` at all, because they measure a WebDriver `rect`
rather than a Playwright `Locator`. Two sites are not simple conversions and
the ticket says why: `classroom-groups-roster.spec.ts:173` measures
`el.closest('label')` in-page on purpose, and `homepage.spec.ts:235-236`
keeps an inline copy the unproved-loop scanner matches by shape.

## Then, in order — a cold session can start here

1. Nothing is in flight. Pick the next ticket off the open board; there is
   no wait to resume and no gate outstanding.
2. Candidates, all previously noted as untouched: **#189** (full-screen board
   clips a wrapped group card), **#249**, **#188**, **#294** (just filed),
   **#241**, **#95**.
3. **This is a dev deploy, not a release.** A promotion PR `develop → main`
   is a release action and is Shyden's alone, after his manual test. Do not
   open one because `dev-verified` went green.

## Environment note, not a code problem

`claude-mem` cannot save memories: the observer's allowance on the provider
is exhausted (since 2026-09-21T21:28:27Z), reporting _"Provider reported the
inference allowance exhausted"_. Nothing from any session is being captured
until it resets or the observer is pointed at another provider in
`~/.claude-mem/settings.json`. **Do not restart the worker** — that clears
the backoff protecting the provider.
