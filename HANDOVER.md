# Handover — 2026-09-26 ~14:30Z: #348 shipped to dev; #350 next

Nothing local is running: no waiter, no preview, no container. The main checkout is on `develop` at `24798a5`, level with `origin/develop`; only this file is modified. This session's scratchpad (`$S`) is `/private/tmp/claude-501/-Users-shyden-Developer-Repos-shyden-co-uk/25c97635-9ff3-41a1-acd5-5108fe08142d/scratchpad`. It holds `wait-pr.sh <pr> <sha-file>`, `wait-dev.sh <sha-file>`, `board-done.sh <n> Done` (asserts the board title before it writes), and `mut348.py` (a mutation harness that refuses a target with uncommitted work).

## Done this session: #348, the translation-reports review script

- `npm run reports:review <shyden-reports-dev|shyden-reports>`:
  - pure decisions in `src/lib/report-review.ts`;
  - wiring in `scripts/reports-review.mjs`;
  - the engine client shared with `i18n-back-translate.mjs` in `scripts/back-translate-client.mjs`.
- Plan `docs/superpowers/plans/2026-09-26-reports-review.md`: three review passes, the last clean.
- 22 mutations red as predicted.
- PR #358 merged as `24798a5`, with 15 checks read by name (`back-translation review` among them).
- deploy-dev run 36248541244, job by job: success. `dev-verified` = success.
- Closed, and on Done.
- Memory saved: `a-mutation-harness-refuses-a-dirty-target`.

## Next: #350 (a report route for the 404's translated `notFound` blocks)

- A UI feature, so a plan reviewed to zero first. The operator's rule: run the plan's code, not only read it.
- Facts already read:
  - `src/pages/404.astro` builds `others` from `LOCALES` minus the default, each with `copy: getSiteStrings(locale).notFound`.
  - The footer's report form is inside `src/components/Footer.astro`, gated by `isBetaLocale(lang)` (`reportPage`, line ~62).
  - AC4 pins the page's script inventory (`tests/e2e/theme-script.spec.ts`).
  - AC6 needs the 404's visual baselines recaptured in the pinned container, which is a whole-machine job.
- Then **#349**. Its AC1 is a question for the operator: ask it with `AskUserQuestion`, with the content inside the question.
- Then **#354**, which needs the real iPhone.

## Parked: #205 (PR #213, branch `205-evidence-carousel`)

Unchanged from the previous handover:

- Head `307c0fb`; it needs its branch updated.
- The preview https://claude.ai/artifact/W5a4cfGN89NQ6ZtW4hoZmG is waiting for the operator to use it.
- **Then:**
  1. `ArtifactComments` watch, then read.
  2. `ArtifactData list signoff/preview-205/items`.
  3. Record it on PR #213, checked with `node scripts/closing-keywords.mjs`.
  4. Update the branch and read the checks by name.
  5. Merge with a merge commit, read `dev-verified`, and close #205.

## For the operator (production stays yours)

- **#205's preview:** open a journey, download one screenshot and one recording, then press "Send review to Claude".
- **Before #97 reaches prod:** the runbook's WAF rate-limit rule on `/api/report`, and confirming the Workers plan.
- **Noticed, not changed:**
  - `shyden-site` (prod) carries a `DEV_PASSWORD` env var.
  - `shyden-reports-dev` holds 5 `automated dev check` rows, which the runbook's second `DELETE` clears.
- **For your end-of-board read:**
  - #189, #352, #351, #355 and #348 on dev.
  - #346: 200 clean Firefox repeats are on the issue. Retire it, or keep it open?
  - zh `site.nav.contact` in `AWAITING_READ`.
  - #142's page: https://claude.ai/artifact/D4FaM5xxu2rjdoKen6UsPk
  - #319's page: https://claude.ai/artifact/Bb9kLd4i2oN9rMnvZsC9hk
- Nothing was opened towards `main`.

## The operating mode, from 2026-09-24 (unchanged)

The operator: _"review the plan on a /loop until there's no findings, then approve it. do this for all future plans. once all tickets are completed, i will manually test and review and make suggestions to improve after that. for now, just complete everything by yourself making sure you self-review everything comprehensively"_. Then: _"dont forget to pause to clear the session though"_.

- **A ticket merges into `develop` on a comprehensive self-review:**
  - CI green, read by name on the head being merged;
  - mutations wherever guards changed;
  - a full read of the diff;
  - a grep of `tests/dev`, `tests/prod` and `tests/device` for every changed fact.
- **Production stays the operator's.** Never open or merge a `develop` → `main` promotion.
- **Pause to clear at every boundary.**

## Environment notes, not code problems

- **Mutations: commit first.** A mutation harness that reverts with `git checkout --` destroys uncommitted work in its target. `mut348.py` now refuses a dirty target.
- **`absence-liveness.test.ts`** wants `searched(x, { of, what })` inside the assertion itself. A helper returning an empty collector is traced and flagged.
- **An artifact page runs in a sandboxed frame that Chrome automation cannot scroll.**
- **Old branches meet `checkJs`**, over every `.js`/`.mjs` under `scripts/`.
- **wrangler's OAuth login expires.** The operator re-runs `! npx wrangler login`. `wrangler pages dev` loads `.env.local` unasked.
- **Shell:**
  - `sips` crop is a silent no-op.
  - In zsh, never `echo ==`, and brace every variable before a colon.
  - macOS `git grep -E` has no `\b`.
  - The Bash `grep` wrapper skips `.github/` and gitignored paths. Use `command grep`.
- **The Shyden Site board** is `PVT_kwDOEOcG584BiyCS`. Assert its title before any write. Never touch project 1.
- **Previews:** one per project; stop it with `npx astro preview stop`.
- **`gh project item-list 2` truncates.** Use `--limit 1000` and check against `totalCount`.
