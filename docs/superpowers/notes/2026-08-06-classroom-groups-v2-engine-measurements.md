# Classroom Group Creator v2 — engine measurements (stage 1: data model and engine)

## Scope and method

This document records the empirical measurements behind specific comments in
`src/lib/grouping.ts` and `tests/unit/grouping.test.ts` — the pure grouping
engine behind the `/classroom-groups` page's data model and placement logic.
Those comments describe things that were *measured*, not derived from the
type system or asserted by inspection: this repository has no compile-time
type checker in CI, so every guarantee here is proven either by a runtime
test or by a runtime measurement, never assumed. This document is where the
measurement itself — the roster shape, the seed range, the counts, the
timings — is written down in full, so a source comment can cite a short,
stable claim ("measured X, see this document's <section>") without carrying
the whole investigation inline.

All timings are wall-clock, taken on the machine and commit in use at the
time, and are not a performance guarantee for any other machine or future
commit — they establish scale (milliseconds versus seconds), not a promise.
All seed-based measurements use this module's own seeded random source (the
test suite's `seeded(n)` helper), so they reproduce exactly given the same
engine and the same seed.

Two constants recur throughout: `SEARCH_NODE_CAP` (200,000 — the
backtracking search's node budget; exhausting it means "the search stopped
looking," never "no arrangement exists") and `MAX_STUDENTS` (500 — the
page's hard ceiling on roster size), both exported from `src/lib/grouping.ts`.

---

## SEARCH_NODE_CAP: the historical pathological shape is dead, a new one replaces it

`assign` is the backtracking search that places blocks (a together-letter
unit, or a lone student) into groups, trying each block against each group
in turn and backtracking on conflict. `SEARCH_NODE_CAP` bounds how many of
those backtracking steps it will take before giving up and reporting
"stopped looking" rather than either hanging the browser or wrongly
claiming no arrangement exists.

### The historical numbers

Before this engine's blocks-and-two-pass design existed, the cap was set by
measuring an uncapped search against a keep-apart roster shaped like several
same-size, mutually-exclusive cliques — for example, several disjoint groups
of three students who must all be kept apart from each other, repeated at
increasing scale. Against the search functions as they existed at that
time: 24 students took 27ms, 36 took 471ms, 42 took 7.3s, and 48 took
121.7s — a curve steep enough that an unbounded search on a larger class
could hang the page.

These numbers are kept as the historical reason the cap exists and roughly
what scale of runaway search it was meant to prevent. They are **not** a
current measurement — the search they were taken against no longer exists
in this form (blocks replaced students as the unit of placement, and
placement became a two-pass process). They should not be read as a claim
about how the current engine behaves.

### Re-measured against the current engine: a negative result

The same shape — disjoint cliques, all the same size — was rebuilt against
the current, block-based, two-pass engine and re-measured rather than
assumed to still be dangerous. Tried:

- *m* disjoint triangles (groups of 3 students who must all be kept apart)
  into 3 groups, *m* = 8 to 20 (24 to 60 students)
- the same shape with group capacity matching the clique size exactly (zero
  slack)
- a "Latin square" shape — *K* disjoint cliques of size *K*, into exactly
  *K* groups of size *K*, zero slack anywhere — for *K* up to 22 (484
  students, just under the 500-student ceiling)
- the *K* = 22 shape re-run across 150 different seeds

**Every one of these resolved in low single-digit milliseconds or less,
including at 484 students.** This is a negative result, not just a smaller
positive number: the shape itself — many disjoint cliques, all the same
size — no longer produces any search difficulty on this engine, at any
scale tried, up to just under the roster ceiling.

The likely reason: the current placer tries groups in a fixed ascending
order for every block. A perfectly *regular* conflict shape — every clique
the same size, every group the same capacity — lets first-fit self-balance
into a valid arrangement without the search ever needing to backtrack,
however large it is scaled. There is nothing irregular for the search to
get wrong.

### The shape that does defeat it

Uneven clique sizes are what actually reproduces pathological search
behaviour. Six disjoint apart-letter cliques, sized 20, 19, 18, 17, 16 and
15 (105 students total, no together-letters), placed into exactly 20
groups:

Swept across seeds 1–400: **334 of 400 seeds exhausted the search budget**
(reported as "stopped looking," never as "no arrangement exists"); the
remaining 66 succeeded, worst case 82.87ms (seed 366). This is a common
outcome for this shape, not one unlucky seed — the test suite's own default
seed (seed 1) is among the 334 that exhaust the budget, reproducibly, at
roughly 51–57ms across repeated runs.

Every block in this input is a singleton (no together-letters), so the
search's second pass — which sorts blocks largest-first and only runs if
the first pass exhausts the budget — has no size difference to act on: a
stable sort over all-equal-size blocks is the identity permutation, so the
second pass replays the first pass's exhausted search node-for-node rather
than trying a genuinely different order. Confirmed directly (not just
argued from the stable-sort property) by temporarily instrumenting both
passes on this exact input: both report `gaveUp: true, found: false`, and
the second pass's order was byte-identical to the first's. Both passes are
genuinely defeated here, not one giving up while the other quietly rescues
it.

This shape — six uneven-sized disjoint cliques — is the current reference
pathological input for keep-apart search behaviour: it is what
`tests/unit/grouping.test.ts` uses for its exhausted-budget coverage, and
what a future change to the search should be re-checked against, in place
of the historical same-size-clique numbers above.

---

## Together letters: two-pass placement and arrangement variety

Together-letters collapse students sharing a letter into one **block** that
must be placed as a unit. Placement tries the blocks in one order via
`assign`; `placeBlocks` decides that order in two passes: the first tries
the blocks in a freshly shuffled order (this is what supplies arrangement
variety — the search meets blocks in an unpredictable order, so the
backtracking fill lands differently seed to seed); only if that exhausts
`SEARCH_NODE_CAP` does a second pass run, with the same blocks sorted
largest-first (first-fit-decreasing), which resolves some inputs the first
pass cannot but is deterministic and shuffle-independent.

### The single-pass regression, and what fixed it

At one point in this module's history, the placement order was **always**
sorted largest-first — no shuffled first pass at all — a reasonable-looking
"most-constrained-first" heuristic. Sorting is deterministic: for a roster
whose blocks are a fixed multiset of sizes, the sorted order is the same on
every seed, so **every seed produced the exact same arrangement** — a
shuffle-and-reassign is a first-class action on the results page, and this
collapsed it to a no-op for any roster with together-letters. Introducing
the current two-pass shape (shuffle first, sort-and-retry only on
exhaustion) restored the variety while keeping whatever the sorted pass
alone used to resolve.

### Before/after: three measurements

Measured with a canonical partition representation — each group's student
numbers sorted ascending and joined, then the groups themselves sorted and
joined — so which physical output slot a group lands in (itself randomised
separately) doesn't count as a different arrangement; only which students
actually ended up together does.

- **8 students (two together-pairs, four unlettered), 2 groups, 200
  seeds.** Sorted-only placement: 1 distinct partition (always the same
  split), 0 failures. Shuffle-first placement: **7 distinct partitions**, 0
  failures — the mathematical ceiling for this roster (either the two pairs
  share a group and the four unlettered students share the other — 1 way —
  or the pairs split across groups and the four unlettered students divide
  2-and-2 between them — `C(4,2) = 6` ways — 1 + 6 = 7 total). Restoring
  the shuffle does not merely add variety here, it restores *all* of it.
- **12 students ([2,2,2,1,1,1,1,1,1] — three together-pairs, six
  unlettered), 2 groups, 200 seeds.** Sorted-only: 1 distinct partition.
  Shuffle-first: **45 distinct partitions**.
- **A roster where one student's group either does or does not also
  contain a second, unrelated student, 30 seeds.** Sorted-only: 30/30 seeds
  "does," 0/30 "does not" — the together-relationship was true on every
  seed, which cannot distinguish "the feature works" from "the feature
  always produces this one answer." Shuffle-first: 12/30 "does," 18/30
  "does not" — genuine variety, both outcomes well clear of the edge.

### Mutation evidence

Two changes were tested against these variety guarantees:

- **Re-sorting the first pass too** (collapsing back to the single-pass,
  always-sorted behaviour): both the 7-of-200-partitions test and the
  together/apart-split test fail — the partition count drops to 1, and the
  split drops to "always together, never apart" — exactly the regression
  the shuffle-first pass exists to prevent.
- **A conflict rule that does not exist in the shipped code** (treating two
  different together-letters as mutually exclusive): the together/apart-
  split test correctly fails (the two letters could no longer share a group
  on any seed), but the partition-count test correctly **keeps passing** —
  with the two letters forced apart, the remaining `C(4,2) = 6` partitions
  are still all reachable, comfortably above the test's own threshold. This
  is not a missed catch: it confirms the two tests examine different
  failure modes (a collapse to too few outcomes, versus permanent
  separation) and neither is a substitute for the other.

---

## Together letters: two small provenance notes

### Why the absent-student test uses count: 2

A test asserting that an absent student's together-letter is ignored
(`ignores the letter of an absent student`) originally requested 3 groups
against a 3-student roster where one student is absent — matching the
number of ROSTER entries rather than the number of PRESENT students. Run
exactly as originally written, against the engine as it stood at the time:
the request failed with `TOO_MANY_GROUPS`, not because the together-letter
was mishandled, but because the too-many-groups guard compares the
requested group count against present students (2, once the absentee is
excluded), and 3 > 2 trips it before the together logic is ever reached.
Changing the requested count to 2 (matching present students) lets the test
reach the behaviour its name describes.

### The 15-buddy-pairs gave-up input, timed across two engine shapes

A 30-student roster built from 15 same-size together-pairs, requested as 10
groups, exhausts `SEARCH_NODE_CAP`: all 15 blocks are the same size (2), so
the largest-first second pass has no size difference to sort on and is
exactly as much of a no-op here as it would be for an all-singleton roster.

- Against the engine with the largest-first sort added but before the
  shuffled first pass existed: **11ms** to exhaust the budget once (a
  single pass).
- Against the current two-pass engine, on the same input: both passes now
  exhaust the budget (confirmed by instrumenting each pass: both report
  `gaveUp: true, groups: null`) — because, again, all 15 blocks are the
  same size, so the second pass's sort is a no-op and it replays the first
  pass's exhausted search. Measured at **17–23ms** across repeated runs —
  roughly double the single-pass number, consistent with two full
  exhaustions of the same-cost search rather than one.

---

## Together letters: pass-2 rescue, proven on a real input

The two-pass design exists specifically so a roster that defeats a shuffled
placement order can still succeed under a largest-first retry. Two existing
tests touch the "gave up" codes, but neither actually exercises that
rescue: the 15-buddy-pairs input above defeats *both* passes identically
(no size difference for the second pass to use), and a separate
arrangement-variety test resolves entirely within the first pass. Until the
measurement below, nothing in the suite showed the second pass ever turning
a would-be failure into a success.

### Finding a fixture

A fixture needs blocks that genuinely differ in size (or a largest-first
sort is a no-op) and needs the first, shuffled pass to give up *reliably*,
not on one lucky seed.

Two shape families were tried and rejected before finding one that works:

- A hand-built spread of block sizes 1 through 6 gave up on only 1 of 60
  seeds tried — too rare to be anything but a lucky seed, so it was
  discarded.
- Tightening group capacity close to the largest block size (several
  combinations of block sizes 4/5/6 against small group counts) produced
  high give-up rates under the shuffled pass alone (up to 60 of 60 seeds) —
  but restoring the second pass showed the *full* engine also failed on all
  of them, with the same code. This is not a rescue gap: `assign`
  completing a search without giving up is a complete, order-independent
  proof that no arrangement exists at that group count, and several of
  these tight shapes genuinely have no valid arrangement at all. A high
  give-up rate under the first pass alone does not distinguish "hard but
  solvable" from "impossible" — only checking the full two-pass engine's
  success rate tells them apart, and these shapes were discarded once that
  check showed them impossible, not merely hard.

The working fixture: **five together-letters of 3 students each (15
students), five together-letters of 2 students each (10 students), five
unlettered singles (5 students) — 30 students, 15 blocks total — requested
as 10 groups of exactly 3.** This is the classic bin-packing shape where a
block of 2 needs exactly one block of 1 to fill its group; a random order
can strand a 2-block's would-be partner in the wrong group early, forcing
deep backtracking to recover, while largest-first placement tends to avoid
the trap by placing the 3-blocks and 2-blocks first, while every group is
still empty.

### Pass 1 alone, and the full engine

With the second pass temporarily disabled (a one-line, immediately-reverted
change, confirmed reverted via a clean `git diff` before committing
anything), the fixture above was run through the public grouping function
for seeds 1–300:

**The shuffled pass alone gave up on exactly 63 of 300 seeds (21%), and
proved no-arrangement on 0 of 300** — every failure among the 63 is genuine
search exhaustion on a feasible input, not a fixture that happens to be
unsolvable. The 63 seeds: 1, 6, 9, 12, 15, 20, 22, 35, 40, 41, 47, 56, 59,
60, 65, 67, 71, 77, 79, 85, 90, 91, 93, 96, 106, 107, 108, 110, 114, 122,
123, 124, 128, 132, 133, 135, 139, 148, 152, 159, 173, 179, 187, 192, 199,
203, 216, 217, 219, 222, 224, 226, 238, 247, 256, 261, 263, 264, 265, 267,
277, 286, 297.

With the second pass restored — the real, committed engine — every one of
those 63 seeds was re-run and checked for validity, not just success: **all
63 of 63 succeeded**, each with all 30 students present exactly once (no
duplicates, none invented), every together-letter's students sharing one
group, and every group at exactly the requested size of 3. Zero exceptions,
zero partial rescues.

Seed 1 (the test suite's default seed, used by the committed test for this
fixture) is one of the 63 — it was not searched for specially; it is simply
the first entry in a uniform 63-wide spread, so the committed test's choice
of seed reads as representative, not cherry-picked.

### Timing

Across the 63-seed full-engine validity run: average 9.541ms, minimum
8.483ms, maximum 12.566ms. Seed 1 alone, measured separately: 12.566ms for
the full engine (both passes: the first pass spends its full ~200,000-node
budget before giving up, then the second pass's sorted order succeeds
quickly) and 13.588ms for the first pass alone (the disabled-second-pass
measurement build) — consistent with each other, and with the expectation
that most of the cost is the first pass's exhaustion. All timings are from
one machine, one run, and establish scale only, not a guarantee.

### What this proves, and what it does not

Disabling the second pass entirely reddens the committed rescue test with
the exact "stopped looking" code, at seed 1 specifically — direct proof the
test depends on the second pass running, not merely on the roster being
generically solvable.

A second, different change was also tried: making the second pass reshuffle
from scratch (drawing fresh randomness) rather than re-sorting the first
pass's own already-shuffled order by size. This change does **not** fail
the rescue test, or any other test in the suite — for this particular
roster and seed, a fresh reshuffle-then-sort still happens to find a valid
arrangement, because largest-first placement is not sensitive to which
permutation of same-size blocks it started from. This is a known, reported
gap: the committed test proves the second pass *rescues* a would-be
failure, but does not prove it specifically *reuses* the first pass's
random draws rather than drawing a second, independent source of
randomness. Catching that would need a test that pins the reuse itself (for
instance, the exact number of random-source calls consumed) rather than the
arrangement's success — out of scope for what this fixture was built to
prove, and recorded here rather than silently assumed covered.

---

## Apart letters: structural passes, sweeps, and their mutation proofs

Apart-letters make two blocks mutually exclusive — they can never share a
group. `buildConflicts` turns the apart-letters into a conflict graph
between blocks; `assign`'s placement search refuses to seat a block in a
group that already holds one of its conflicts.

### The five original tests: which passed structurally, not by feature

When the five original tests for this behaviour were run against the
engine **before** the conflict graph read anything from the `apart` field,
only one failed for the expected reason (proving the search really was
ignoring apart-letters at that point). The other four passed anyway — not
because the feature worked, but because each test's own shape made its
assertion true regardless:

- One used a single group, so "does X end up with Y" is true by
  construction — everyone is in the one group either way.
- One placed two present students into two groups of exactly one each —
  capacity alone separates them, whatever the conflict logic does.
- One placed a together-block of size 2 into a group of exactly size 2 —
  the block can only ever occupy that whole group alone, so its groupmate
  is forced apart from anyone else by capacity, not by the apart-letter.
- One used a coincidental seed where the unconstrained shuffle happened to
  interleave the conflicting students one per group anyway (confirmed by
  independently replicating that exact shuffle in isolation).

None of these four is a defect in the test — each is simply weaker cover
than its name implies, on its own. What actually holds the guarantee
broadly is the sweep described below.

### Mutation evidence for the structural claim

Two mutations confirm the above rather than merely assert it:

- **Disabling the placement search's conflict check entirely** (so a block
  can be seated next to one of its own conflicts): the four
  structurally-passing tests above stay green, exactly as predicted — none
  of them depends on the conflict check at all. The sweep described below,
  and the exhausted-budget test, correctly fail under this same change.
- **Merging every apart-letter into one shared bucket** (so two *different*
  letters would also conflict, not just two holders of the same letter):
  the test asserting that two different letters are unrelated (`treats two
  different letters as unrelated`) correctly fails — `expected false to be
  true`, because the two now-conflicting singleton students can no longer
  both fit in the one requested group. This confirms the test's real job:
  it does not (and structurally cannot, with only one group) prove
  same-letter separation, but it does catch over-separation — a bug that
  would conflict every letter-holder with every other, regardless of which
  letter they hold.

### The guarantee holds broadly: two sweeps

Two sweeps re-derive the separation guarantee directly from each student's
`apart` field — never through `buildConflicts` or any other engine
internal — across a spread of roster sizes, modes and seeds, so the
guarantee is shown broadly rather than pinned only on small hand-picked
rosters.

**Sweep 1** — class sizes 4, 6, 9, 12, 16, 20, 25 and 30, three
apart-letters distributed cyclically, up to three group-count/per-group
modes per size (skipping any that would request more groups than
students), 8 seeds each: **184 attempts** (a fixed count — every valid
(mode, seed) combination the sweep's own loop structure produces,
independent of outcome), of which **179 succeeded**. Every success is
checked for the invariant (no group holds two present students sharing an
apart-letter); the test asserts the attempt and success counts stay
comfortably above a floor, so the invariant is shown to be exercised on
real successes, not held vacuously because every attempt happened to fail.

**Sweep 2** — a fixed 12-student roster mixing together-letters (making
blocks of size 2, so block index and student index diverge — the one shape
that can expose a bug that swaps a block index for a student index or vice
versa) with apart-letters, across four modes and 25 seeds each: **100
attempts, 100 successes**. Both the apart-invariant and the
together-invariant (a together-block's students are never split) are
checked on every success.

Mutation evidence for both sweeps: **inflating the reported conflict
clique** to include every conflicted student rather than the true maximal
clique drops sweep 1's successes from 179 to 24 (caught decisively) while
sweep 2's successes only drop from 100 to 25 — still above its own floor,
because three of its four modes are crippled by the inflated clique but the
fourth (where the true clique size already equals the group count) lets
every seed through regardless. This is not a missed catch: the two sweeps
target different bugs (a broad separation guarantee, versus a
block/student-index mix-up), and the clique-inflation bug is what a
different, dedicated test (see below) is built to catch — and does,
decisively.

### The absence boundary: proven by mutation

A boundary case: four students sharing an apart-letter, one of them absent,
requested as exactly 3 groups. The present clique is exactly 3 students —
equal to the group count — so the request succeeds; if the absent
student's letter ever leaked into the conflict graph, the effective clique
would be 4, exceeding the group count, and the request would be refused
instead.

A simpler, pre-existing test (two present apart-letter-holders, one absent,
into two groups of one each) cannot see this failure at all: two students
into two singleton groups are separated by capacity alone, regardless of
whether the apart-letter or absence-filtering does anything.

Mutation: feeding the conflict-graph builder the *unfiltered* roster
(including the absent student) while block indices still address the
*present*-only list — an index misalignment that, for this specific roster
ordering, has the absent student's letter read where a present student's
should be. Result: the boundary test fails (`expected false to be true` —
the request that should succeed now fails), while the simpler pre-existing
test stays green under the identical change — confirming the boundary test
really does guard a stronger, different guarantee, not a rephrasing of the
simpler one.

### The deleted separates-whole-units test

An earlier test asserted that a together-block's apart-conflict moves with
the whole block: two students together on one letter, one of them apart
from a third student, four students total into two groups of two. Because
the together-block has size 2 and the only groups available are also size
2, the block can only ever occupy an entire group by itself — its
third-party conflict ends up separated by **capacity alone**, whatever the
apart-conflict-checking code does.

This was confirmed, not just reasoned about: with the placement search's
conflict check disabled entirely, this test **stays green** — on two
separate occasions, once as part of a whole-suite check of everything not
expected to depend on the conflict check, and once again individually, to
verify before removing it that the removal was justified rather than taken
on trust. Under the identical change, the test that replaced its intended
guarantee (the together-plus-apart sweep described above, under "Sweep 2")
correctly **fails** (`expected 2 to be less than or equal to 1`). Adding
filler students to relieve the capacity pressure — the obvious way to make
the original test meaningful — was tried and the test still passed, so the
test was removed rather than repaired, and its guarantee is carried by the
sweep instead, under genuine search pressure across 100 attempts rather
than one fixed small roster.

---

## Both rules at once: attribution, and the gave-up/proven split

When both together-letters and apart-letters are live in the same request
and the placement search fails, the failure cannot honestly be pinned on
one rule or the other — a failed search proves only that no arrangement was
found within the budget, not which constraint caused it. The engine reports
a dedicated "both rules" code (split, like the single-rule codes, into a
proven-impossible variant and a "stopped looking" variant) rather than
guessing.

The "stopped looking" variant was confirmed live and reproducible, not just
constructed as an error-code sample: the 30-student, 15-same-size-buddy-
pair, 10-group input described above (which already exhausts the search
budget on the together-letters alone, since all 15 blocks are the same
size) reliably reaches the both-rules "stopped looking" code once a single
apart-letter is added across two students in different pairs — confirmed by
running it directly, reproducibly, on repeated runs.

---

## mix: the boy/girl weave — the alternation defect, the five-shape table, and the rejected weighted merge

`weaveBySex` interleaves a placement order's boy-blocks and girl-blocks so
that `assign`'s ascending, first-fit group filling does not accidentally
seat all the boys before any girl (or vice versa). It only reorders an
already-shuffled sequence into a boy/girl/rest pattern — it does not itself
consume any randomness, and does not decide *which* boy or girl fills a
given slot, only which slots are "boy slots" and which are "girl slots".

### The alternation defect, and the first spread check

The first version of the weave alternated strictly: emit a boy, then a
girl, one pair at a time. Once the shorter list (say, girls) is exhausted,
this appends the **entire remainder** of the longer list as one contiguous
run — and because group-filling proceeds in ascending order, that run
always lands as a single-sex group.

Measured directly: four boys and two girls, requested as three groups of
two. Swept across seeds 1–30 under the alternating weave: **5 of 30 seeds
placed both girls in the same group** (`[8, 12, 28, 29, 30]`) — the one
outcome the feature exists to prevent. The same result was reproduced
afterward by disabling only the weave (leaving everything else, including
the unset-sex guard, intact) against the fixed engine, reproducing the
identical seed list — confirming both runs are the same underlying claim
about the same code path.

### The five-shape table

The alternating weave's defect above generalises: measured directly against
the live source (200 seeds per shape, `groupCount` mode, boys numbered
before girls), "ideal" meaning the boys-per-group split is as even as the
numbers allow:

| Shape | off (no weave) hits ideal | mix, alternating weave | mix, ratio-merge weave (shipped) |
|---|---|---|---|
| 2 boys, 4 girls → 2 groups | 107/200 (53.5%) | 0/200 | **200/200** |
| 4 boys, 8 girls → 4 groups | 37/200 (18.5%) | 0/200 | **200/200** |
| 4 boys, 8 girls → 3 groups | 115/200 (57.5%) | 0/200 | **200/200** |
| 8 boys, 4 girls → 4 groups | 43/200 (21.5%) | 0/200 | **200/200** |
| 6 boys, 3 girls → 3 groups | 54/200 (27.0%) | 0/200 | **200/200** |

The alternating weave made its own goal *less* likely than not weaving at
all on every one of these five shapes (0% versus 18.5–57.5%). The
replacement — a ratio merge that emits from whichever side (boys or girls)
has fallen furthest behind its true share of the two block *counts*, rather
than a fixed one-for-one alternation — reaches the ideal split on every
seed of every shape tried, and does so **deterministically**: for
singleton-block rosters, the boy/girl position pattern this merge produces
depends only on the two block counts, never on the shuffle, so two of the
five shapes are pinned as always-true assertions rather than "at least once
in 200 seeds."

### The block-size-weighted merge: tried, measured, and rejected

Before shipping the block-*count* ratio merge above, a block-*size*-
weighted variant was built and measured, not dismissed by intuition:
instead of counting one turn per block regardless of size, it counts one
turn per **student**, so a 4-student together-block counts as four turns'
worth of "debt" against the other side.

Measured on a roster designed to stress this: a 4-student together-block
plus 4 lone boys and 8 lone girls, into 4 groups. (A block the exact size
of a group cannot share it with anyone, so one group is forced to be
all-boys regardless of algorithm; the best any ordering can do for the rest
is one all-boy group plus a `{2M2F, 1M3F, 1M3F}` split of the remainder.)

| Merge | Reaches the best possible split |
|---|---|
| No weave (off) | 58/100 |
| Block-count ratio merge (shipped) | 100/100 (also 500/500 at a higher seed count) |
| Student-count-weighted merge (rejected) | **36/100 — worse than not weaving at all** |

The reason the weighted version loses: weighting turns a block's size into
a forward-looking "debt" against the other side that persists *after* the
block is already placed. The 4-student block pushes the boys' running
total up by 4 in one step, so the merge then owes the girls four turns in a
row before a boy-turn is allowed again — clumping the very thing the weave
is meant to spread, even though the large block has already claimed its own
group and has no further claim on the rest. The block-count merge has no
memory of a block's size once its single turn is taken, which is exactly
why it does not make this mistake. **Decision: the shipped weave counts
blocks, not students.**

Two further together-block shapes were measured to show the cost of this
decision honestly, beyond the case that motivated it:

- A 3-student girl-block plus 3 lone boys and 6 lone girls, into 3 groups
  of 4: the shipped merge reaches the ideal split 92/300 (30.7%) of the
  time versus 46/300 (15.3%) for no weave — better than not weaving, by
  roughly 2x, but not perfect. This is the residual imperfection the
  block-count approach accepts in exchange for never doing worse than not
  weaving at all.
- Two 4-boy together-blocks plus 8 lone girls, into 4 groups of 4: the
  shipped merge and no-weave are **identical**, 300/300, both always
  producing two all-girl groups and two all-boy groups — every boy is
  locked into one of two capacity-exact blocks, so no ordering of blocks
  can move a boy into either all-girl group. This is a hard capacity limit,
  not a regression.

---

## mix: byte-identical under off and separate

**SUPERSEDED for `separate` by Task 8b.** This section's claim held while
`separate` was Task 8a's deliberate placeholder (placing exactly like
`off`); Task 8b replaced `separate`'s placement with its own per-sex logic,
so `separate` no longer places like `off` in general (that was always the
point of the change -- see task-8b-report.md, not cited here since
`.superpowers/sdd/…/task-N-report.md` files are gitignored). The
measurement below is kept as a historical record of what was true at the
time, not a current guarantee. The claim that IS still current --
`off` and `mix` are unaffected by any of Task 8b's changes -- is verified
in "off and mix: byte-identical after Task 8b" further down.

Sex-based mixing only changes behaviour when the mode is `mix`; the `off`
and `separate` modes must be unaffected, byte-for-byte, both before this
feature existed and after every later change to it -- true as stated,
for the period up to and including Task 8a.

### Original measurement

The engine was run across both the `off` and `separate` modes, over 7
roster/mode shapes × 20 seeds (280 cases total) — including a roster large
enough to exhaust `SEARCH_NODE_CAP` on both search passes (the most
sensitive possible witness to any change in how the placement order is
built), and every roster carrying a mix of set and unset `sex` values
specifically to check that sex data present-but-unused does not leak into
the output. Every case's full output (`{ok, groups}` or `{ok, error}`) was
diffed against the engine exactly as it stood before this feature was
added.

**Result: 280 of 280 cases byte-identical, 0 mismatches.**

### Re-check after the guard's own condition changed

After the unset-sex guard was widened (see "mix: the unset-sex guard —
precedence, and what it refuses" below — it moved from refusing only
literal `null` to refusing anything that is not exactly `'M'` or `'F'`),
the same style of check was repeated: 3 roster shapes × 2 group modes × 20
seeds × alternating leftovers-handling (240 cases total), across `off` and
`separate`, with off-domain `sex` values (`undefined`, an empty string,
`'m'`, `0`) and an absent student deliberately included, to stress exactly
the values the widened guard now cares about.

**Result: 240 of 240 cases identical.**

Together, these two measurements are what justify scoping the unset-sex
guard, and the weave itself, to `sexMode === 'mix'` specifically, rather
than "anything other than `off`": a broader condition would have started
refusing, or altering the output of, `separate` rosters that succeed
unchanged today.

---

## mix: arrangement variety survives the weave

The weave only decides which *slots* in the placement order are boy-slots
versus girl-slots; it consumes no randomness of its own, so whoever
actually fills each slot still comes from the same shuffled input as every
other mode. This was measured, not just argued from the code's structure.

### Singleton-block shapes

Distinct partitions (which students end up sharing a group, independent of
output-slot order) over 200 seeds, four roster/mode shapes:

| Roster | Mode | Distinct partitions / 200 seeds | Theoretical maximum |
|---|---|---|---|
| 4 boys, 4 girls | 4 groups of 2 | 24 | 24 (4! — a perfect matching) |
| 4 boys, 2 girls | 3 groups of 2 | 12 | 12 (4×3 — an injective pairing) |
| 5 boys, 1 girl | 3 groups | 15 | not derived |
| 10 boys, 10 girls | 5 groups of 4 | 200 (no repeats in 200 seeds) | not derived |

The first two shapes hit their derived theoretical maximum exactly, over
this sample — every possible arrangement was seen at least once in 200
seeds, confirming the shuffled input (not the weave's fixed alternation
pattern) is what supplies the variety.

### Together-block shapes, and mutation evidence

The measurements above use singleton blocks only. A separate check used
three boy-pairs and six girl-pairs (18 students as 9 together-blocks) into
3 groups of 6 — a shape where which boy-pair and which two girl-pairs share
a group is a multinomial count (`6! / (2!·2!·2!) = 90` distinct partitions
at the theoretical maximum). Measured on the shipped engine: **78 distinct
partitions over 200 seeds**.

This was proven by mutation rather than by comparing against an earlier,
differently-broken version of the weave — deliberately, because the earlier
alternating weave's boy-per-group *shape* was also wrong on this same
roster (that is the alternation defect described above), yet it happened
to produce *more* raw partition variety on it (127 of 200) than the fixed
version's 78 — raw partition count and a correctly-balanced sex split are
different claims, so comparing against the old, broken weave would not have
isolated a variety-specific regression.

Instead: weaving over a fixed, sorted block order instead of the genuinely
shuffled order (a one-line change at the weave's call site) was applied and
run against exactly this test. Result: **1 distinct partition over 200
seeds, not 78** — a wrong-answer failure, not a crash. The boys-per-group
shape stayed correct (every group still 2 boys and 4 girls, every seed)
because that shape comes from the ratio merge's counting, not from the
shuffle — only *who* fills each slot collapsed, which is exactly what this
test exists to catch.

---

## mix: sexOf and what rest actually means

The weave classifies each block by sex using `sexOf`, which reads only the
block's **first** present-order member — it does not check whether every
member of a multi-student together-block agrees on sex. A block falls into
the weave's `rest` list (neither boys nor girls) only when that first
member's own sex is unset — not whenever a block's members merely *differ*.

Consequently, a together-block spanning both sexes (for example, a
together-pair of one boy and one girl) does **not** fall into `rest` — it
is silently classified by whichever sex its first member happens to have.
This is provably the *only* possible outcome once the unset-sex guard
(below) has already run: every present student the guard lets through has
a sex of exactly `'M'` or `'F'`, so a block's first member — always a
present student — can never be unset by the time the weave runs. `rest` is
therefore reachable in `weaveBySex`'s own general behaviour (confirmed
directly by calling it with unset-sex students, independent of
`buildGroups`), but **not** reachable through the `mix` code path
specifically, because the guard has already ruled that out.

A dedicated test confirms a mixed-sex together-block does not crash, is not
refused, and does not break the together-constraint — but does **not** pin
which bucket (boys or girls) the weave classifies such a block into, since
that is an implementation detail no design requirement commits to.
Confirmed by mutation: reading the block's *last* member instead of its
first still passes every test in the suite — no committed test
distinguishes `sexOf`'s specific choice of representative member, only that
a mixed-sex block is handled safely. This is recorded here as a known,
deliberate limit rather than a gap discovered later.

---

## mix: the unset-sex guard — precedence, and what it refuses

### Why it fires before mode and rule validation

The guard that refuses to run `mix` unless every present student already
has a sex set fires early in `buildGroups` — before the requested group
size/count is validated, and before together-letter or apart-letter rules
are checked — on the same tier as the pre-existing checks for a usable
roster (duplicate student numbers, an empty roster).

This placement was a deliberate choice, not the only reasonable one: the
page this engine serves disables the `mix` switch entirely until every
student already has a sex set, so in practice nobody using the real page
can ever trigger this guard — whereas an invalid group count, or a
together-letter clashing with an apart-letter, are mistakes a person
filling in the form can genuinely make. The guard nonetheless fires first,
reasoned the same way as the pre-existing roster-usability checks: all of
them ask "is this roster's data usable" before anything downstream spends
effort validating the request's *shape* or the rules' *self-consistency* —
a property of the data, checked ahead of a property of the request,
regardless of how likely any particular caller is to trigger it. Two tests
pin this ordering directly, each on a roster with two problems live at once
(an unset sex *and* an invalid group count; an unset sex *and* a
together/apart clash) — confirmed by mutation: moving the guard to run
after both other checks makes both tests fail with the *other* error code
instead, a wrong-answer failure in each case, not a crash.

### What slipped through before the fix

The guard originally refused only a sex value of exactly `null`. Measured
directly: a roster of 6 students where one student's sex is `undefined`
(rather than `null`) — a value a non-TypeScript caller could easily send,
since this repository has no runtime type checker — requested under `mix`
into 3 groups, returned **success, with only 5 students** in the result.
The sixth (the one with `sex: undefined`) was silently dropped: it matched
neither the boy list, the girl list, nor the unset-list in the weave's old
two-way split, so it never reached the output at all — no error, nothing
to tell a teacher who would otherwise have printed and used that incomplete
list.

The same silent drop was confirmed for every other off-domain value tried —
an empty string, `'m'`, `'male'`, and the number `0` — all of them, like
`undefined`, are not `=== null` and so slipped past the old guard
identically.

The fix widened both the guard and the weave's own classification to treat
anything that is not *exactly* `'M'` or `'F'` as unset, rather than
special-casing `null`:

- The guard now refuses a roster containing any of those five off-domain
  values (and any other non-`'M'`/`'F'` value), reported with the specific
  student numbers affected.
- The weave's own block-classifying function was changed to a total,
  three-way classification (boy / girl / neither) over the same rule, and
  is the one function in this module exported purely so that its "every
  input index lands in exactly one output list, never zero, never two"
  guarantee can be proven directly, independent of whether `buildGroups`'s
  guard is what happens to be protecting it today.

---

## off and mix: byte-identical after Task 8b

Task 8b rewrote `separate`'s placement entirely (see "mix: byte-identical
under off and separate" above, now superseded for `separate`). `off` and
`mix` must be completely unaffected -- neither one's code path was meant
to change at all, and the changes needed to make that true by
CONSTRUCTION, not just by testing: `buildGroups` now branches to a new,
separate function (`buildSeparateGroups`) the instant `sexMode ===
'separate'` is seen, immediately before the block of code `off`/`mix` run
(the two-pass `placeBlocks` call and its failure attribution), so every
statement `off` and `mix` execute is textually identical, in the identical
order, to the commit before this task (`b7cf318`). The two guards added
earlier in `buildGroups` (scoping `togetherUnitTooLarge` and the keep-apart
clique pre-check to `sexMode !== 'separate'`) are the only other change on
the shared path, and for `off`/`mix` that condition is always true, so
those two checks run unconditionally, exactly as before.

### Method

A standalone script (`npx tsx`, not part of the repo or committed) imports
`buildGroups` from two copies of `src/lib/grouping.ts`: one from `git show
b7cf318:src/lib/grouping.ts` (Task 8a's final state, immediately before
this task), one the working tree as this task left it. For every case, it
builds a FRESH `random` closure per engine (a shared, stateful closure
across both calls was tried first and produced spurious mismatches --
recorded here so nobody repeats the mistake investigating a future
regression) and compares `JSON.stringify({ok, groups} | {ok, error})`,
plus asserts the new `warnings` field is `[]` on every success (`off` and
`mix` must never populate it -- only `separate`'s spill does).

### Cases

10 roster/mode shapes × 2 sexModes (`off`, `mix`) × 20 seeds = **400
cases**:

- Two bare counts (`perGroup`, `groupCount`) and a single-student edge case.
- A together/apart-letter roster at two different group modes.
- A together/apart-letter roster with absences.
- A 60-student together/apart-letter roster at `groupCount: 12`.
- An 11-student roster exercising uneven leftover spread.
- The 105-student six-clique shape from "apart letters: structural passes,
  sweeps, and their mutation proofs" above (sized 20/19/18/17/16/15 into 20
  groups) -- the most sensitive witness available to any change in how the
  placement order is built, since it sits right at `SEARCH_NODE_CAP`.
- An 18-student roster mixing valid and off-domain `sex` values (`undefined`,
  `''`, `'m'`, `0`, `'male'`) with an absent student -- stresses the exact
  values the widened unset-sex guard (Task 8a) cares about; `mix` refuses
  this identically old vs new (compared via the `error` field, same as any
  other case), `off` succeeds identically (it never reads `sex`).

**Result: 400 of 400 cases byte-identical, 0 mismatches.**
