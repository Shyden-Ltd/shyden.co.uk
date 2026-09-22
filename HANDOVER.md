# Handover — 2026-09-22, #277 in progress

Branch **`277-one-home-for-near-duplicate-functions`**, four commits on top of
`develop` (`13103ac`). Nothing is pushed, no PR is open, nothing is running.

Read the SHA with `git rev-parse HEAD` — never retype a tail.

## State

`npm run typecheck` is clean (0 errors, 0 hints). `npm run test:unit` is
**2054 passed, 2 failed**, and both failures are deliberate:

- `duplication.test.ts` — "finds no cross-file duplicate that has not been
  given a verdict": **21 pairs still undecided**. This is the ticket's own
  worklist and goes green when every pair has a verdict.
- `absence-liveness.test.ts` — flags `duplication.test.ts`'s own "carries no
  verdict for a pair that no longer exists" assertion, correctly: `SEPARATE`
  is empty, so that assertion is vacuous. Resolved by the verdicts below, or
  by restructuring that test — see **Decision outstanding**.

The e2e suite has **not** been run whole. Targeted runs that did pass on
chromium: the three contrast tests (3 passed) and
`print-legibility.spec.ts` + `locale-beta.spec.ts` (18 passed).

## Commits

| SHA       | what                                                                                                  | pairs left |
| --------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| `5e031d6` | the scan (`tests/unit/duplication.ts`) and the guard, red on purpose                                  | 27         |
| `2e95074` | `src/`: blank `Student` (4 copies) → `grouping.ts`; `button` (4 copies) → new `src/scripts/dom.ts`    | 25         |
| `488079a` | reporters: the whole JSONL writer → `tests/reporters/dashboard-jsonl.ts`, with 11 new assertions      | 23         |
| `8430c02` | the WCAG formula (5 copies) → `tests/wcag.ts`; `contrastRatio` reads in the browser, computes in node | 21         |

## The scan

`npx vitest run tests/unit/duplication.test.ts` prints the live list in the
failure message. 6s. It derives its file set from `git ls-files`, prints every
function-like node at ANY depth with `removeComments`, and compares cross-file
pairs by banded Levenshtein at `DUPLICATE_RATIO = 0.85`,
`MIN_PRINTED_LENGTH = 120`.

## The 21 remaining pairs, and the verdict each needs

**Group A — the "no horizontal scroll at Npx" family (11 pairs).**
`classroom-groups-controls.spec.ts:363/399/422/445`, `glory-points.spec.ts:154/159`,
`site-meta.spec.ts:35/40`, `chrome.spec.ts:290`, `classroom-groups-roster.spec.ts:410`,
`prod-sanity.spec.ts:94`. All are `setViewportSize` → `goto` → measure
`scrollWidth - clientWidth` → `toBeLessThanOrEqual(0)`. Intended home:
one helper in `tests/e2e/helpers.ts` (`expectNoHorizontalScroll(page)` or
`overflowOf(page)`). CLAUDE.md's own note — "a hand-written list of things to
check will miss the one that breaks" — is about exactly this family.

**Group B — the meta-guard bodies (5 pairs).**
`isolated-context-tagging.test.ts:150`, `viewport-tagging.test.ts:231`,
`parked-tests.test.ts:249`, `download-tagging.test.ts:107`. All are
`files.flatMap(analyze)` → `expect(searched(findings, …)).toEqual([])`.
Candidate home: a shared `expectClean({ files, analyze, what })`. **Judge
before collapsing** — each file's `analyze` differs, and the shared shape may
be the repo's guard IDIOM rather than a duplicate.

**Group C — three singles.**

- `atLeast44` (1.000) `chrome.spec.ts:224` ↔ `glory-points.spec.ts:132` —
  identical touch-target assertion. Collapse into `helpers.ts`.
- the storage/cookie probe (1.000) `classroom-groups-io.spec.ts:579` ↔
  `classroom-groups-privacy.spec.ts:558`. Collapse into `helpers.ts`.
- `locale-parity.spec.ts:65` ↔ `locale-routing.test.ts:41` (0.867) — the same
  `localisePath` vs `urlFor` assertion in an e2e spec and a unit test. The
  unit one derives its paths from `sitePaths()`; the e2e one uses a hand-list
  `PAGES`. **Check whether PAGES ⊆ sitePaths() before deciding** — if it is,
  the e2e copy is a pure assertion costing a browser and should go.

**Group D — dev/prod sanity (2 pairs).**
`prod-sanity.spec.ts:70` ↔ `dev-sanity.spec.ts:27`, and
`classroom-groups-privacy.spec.ts:329` ↔ `prod-sanity.spec.ts:70`: the
"deal 8 students into groups of 4" journey. Likely verdict **deliberately
separate** — `tests/prod/` and `tests/dev/` are separate suites against
separate targets and CLAUDE.md says prod asserts what only rendering can.
Whatever is decided, write the reason into `SEPARATE`.

**Below the scan's floor, already decided, needing only the write-up in the
ticket:**

- `isLocale` ↔ `isMvpLocale` — **separate**. `MVP_LOCALES` is deliberately
  wider than `LOCALES` (`metadata.ts` says so, `locale-metadata.test.ts:41`
  pins the seam). They are equal by value today and must not be collapsed.
  Add a cross-reference comment to each.
- `findIosDeviceOrThrow` ↔ `findIosDevice` — **separate**, reason already
  written in both files and measured (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`
  from constructor parameter properties). Worth re-verifying the claim on the
  pinned Node before recording it as still true.

## Decision outstanding

If every pair collapses, `SEPARATE` ends empty and the "carries no verdict for
a pair that no longer exists" test is vacuous — which is what
`absence-liveness` is flagging now. Either Group D supplies the first real
entry, or that test is restructured. **Do not widen `absence-liveness` to
accept the current shape** — that is the trivial escape hatch #118 exists
about.

## Then, in order

1. Every pair has a verdict; unit suite green.
2. **Mutation-verify the guard**: paste a real function body into a second
   file and watch it go red; remove a `SEPARATE` entry and watch that go red
   too. Both directions, per CLAUDE.md.
3. Run the **whole** e2e suite, alone, nothing else running — Group A, B and C
   all edit e2e specs. `npm run test:e2e`.
4. `npm run format` is `prettier --check`; use `npx prettier --write`.
5. PR into `develop`. Body must not put a closing keyword beside `#277` —
   check with `node scripts/closing-keywords.mjs <file> "body"`.

## Follow-up to file (evidence is in this session, not yet in a ticket)

**`ast.ts`'s call graph resolves a call by BARE NAME** when a file has no local
binding for it. Adding `tests/unit/duplication.ts` with a function called
`declarationsIn` — a name `tests/playwright-declarations.ts` already owns for
something else — made `absence-liveness` report **25 assertions in four
untouched files** as unproved. Measured: `reaches()` for `analyze`, `scan`,
`scanned` and `locatorLoops` all flipped `false` → `true` purely from the new
file's presence. It errs toward a false alarm, which is the safe direction,
but a false alarm is what gets a working control deleted. Renaming mine to
`functionBodiesIn` cleared it; the fragility is untouched.

## Untouched by this ticket

Everything in the previous handover's "Waiting on Shyden" table still stands:
**#278** (add `closing-keywords` to `required_status_checks.contexts` on
`develop` and `main` — administration, the App holds it read-only), **#189**,
**#241**, **#249**, **#188**, **#95**.
