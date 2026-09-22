# Handover — 2026-09-22, #277: every pair has a verdict

Branch **`277-one-home-for-near-duplicate-functions`**, nine commits on top of
`develop` (`13103ac`), head **`9ccab0f8d9d35b72edde75e842ca8d933707b102`**. Nothing is pushed, no PR is
open.

Re-read the SHA with `git rev-parse HEAD` rather than retyping this one.

## State

- `npm run typecheck` — **0 errors, 0 warnings, 0 hints**.
- `npm run test:unit` — **2057 passed, 0 failed**. The two deliberate failures
  the previous handover described are both resolved.
- `npm run format` (`prettier --check .`) — clean.
- `npm run test:e2e` — **running when this was written; read the verdict
  before doing anything else.** Output: `/private/tmp/claude-501/-Users-shyden-Developer-Repos-shyden-co-uk/e8d36821-d766-4456-92d7-535121e7aed6/scratchpad/e2e.txt`.
  Group A, B, C and D all edited e2e specs, so this is the gate that matters.
- The duplication scan reports **0 undecided pairs**, down from 27 at the
  branch point and 21 at the previous handover.

## What landed since the last handover

| SHA       | what                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `038a52b` | the page-overflow measurement (21 copies, 12 files, 3 suites) → `tests/viewport.ts`; `atLeast44` (2 of 3 copies) with it |
| `75e3432` | the "did the page store a name?" probe (4 copies) → `tests/e2e/helpers.ts`                                               |
| `0f392d1` | the source-scanning guard body (4 copies) → `tests/unit/spec-scan.ts`, and ONE derived scope                             |
| `9ecd24f` | the grouping journey (4 copies) → `tests/make-groups.ts`; retires a weaker `locale-parity` copy                          |
| `9ccab0f` | `ast.ts`: a parameter binds its name; the last six pairs recorded SEPARATE                                               |

## The three findings worth keeping, all measured

1. **`download-tagging.test.ts` scanned `tests/e2e` only.** The other three
   guards scanned `specDirs()`. Mutation M6 — an untagged `downloadText`
   call planted in `tests/prod/prod-sanity.spec.ts` — is **RED** with the
   shared scope and **GREEN** with the old one (measured by checking out the
   pre-collapse guard beside the same mutation). Nothing outside
   `tests/e2e` reads a download's bytes today, so the hole was latent.
2. **`classroom-groups-roster.spec.ts`'s privacy probe read two of four
   places.** Its test is 'a typed name never reaches localStorage or
   sessionStorage' — the address bar and the cookie jar went unread. Routing
   it through the one home widened it.
3. **The three inline grouping journeys click `#cg-sound-toggle`
   unconditionally**, where the file-local helper opens it only when hidden.
   Each goes to a fresh page first, so none is broken today.

## The six SEPARATE verdicts, and why they are not a cop-out

All six are the no-horizontal-scroll family. The measurement is already
shared; what remains is the test declaration. Measured on `site-meta.spec.ts`:

- drop the `@emulated-viewport` tag → `viewport-tagging.test.ts` goes RED,
  naming the test and the resizing line. The guard is live.
- generate those same four tests, still untagged, from `tests/viewport.ts` →
  the **whole unit suite is green**. Four untagged viewport tests and no
  guard in the repository can see them, because `specDirs()` derives from
  the directories holding spec files and `tests/` root is not one.

## Then, in order

1. Read the e2e verdict in `/private/tmp/claude-501/-Users-shyden-Developer-Repos-shyden-co-uk/e8d36821-d766-4456-92d7-535121e7aed6/scratchpad/e2e.txt` — every project, by name. A run that
   concludes is not a run that passed.
2. Any e2e failure is most likely `makeGroups` (now idempotent where three
   copies were not) or `expectNothingStored` (now checks url and cookies
   where the roster copy checked neither) — both are deliberate widenings.
3. PR into `develop`. The body must not put a closing keyword beside
   `#277`: check it with
   `node scripts/closing-keywords.mjs <file> "this pull request body"`.

## Follow-ups to file (evidence is in this branch, not yet in a ticket)

- **Nine height-only 44px assertions** across six e2e specs assert
  `box.height >= 44` without the width and without rounding. That is a
  weaker claim than `atLeast44`, and the unrounded form can read 43.9999 for
  a declared `min-height: 44px`. Widening them is a coverage change, not a
  refactor, so it was left alone deliberately — `tests/viewport.ts`'s
  docblock records this.
- **`homepage.spec.ts` keeps a third `atLeast44` copy inline on purpose**,
  because the unproved-loop scanner in `event-collectors.test.ts` matches
  that exact shape. Cross-referenced in both directions now.

## Untouched by this ticket

Everything in the previous handover's waiting list still stands: **#278**
(add `closing-keywords` to `required_status_checks.contexts` on `develop`
and `main` — administration, which the App holds read-only), **#189**,
**#241**, **#249**, **#188**, **#95**.
