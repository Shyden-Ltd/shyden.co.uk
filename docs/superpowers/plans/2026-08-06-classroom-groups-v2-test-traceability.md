# Classroom Group Creator v2 — test traceability matrix

**Every decision in the spec, and the test that proves it.**

This is the gate. A stage is not done when its code works; it is done when **every row belonging to
it is ticked**, and a row is ticked only when a test exists that was **observed failing first**.

- **Spec:** `docs/superpowers/specs/2026-08-06-classroom-groups-v2-design.md`
- **Suites:** `U` = Vitest (`tests/unit/`) · `P` = Playwright (`tests/e2e/`, 5 projects) · `D` = real
  device gauntlet, which no CI run can substitute for
- **Stage:** 1 engine · 2 layout · 3 student details + avatars · 4 CSV · 5 print + projector

## Rules this matrix enforces

1. **A row with no test is not done**, however obviously the code works.
2. **Observed RED first.** A test that has never failed has never been shown to test anything. Where
   a behaviour already works — the leftovers rows, most of §12 — the test must be *mutation-checked*:
   break the thing it covers, watch it go red, restore it. Record the mutation used.
3. **Assert rendered text, not tags.** `expect(page.getByText('…'))` on the whole sentence, in
   **both locales**. A count of elements proves nothing about what the page says.
4. **No `waitForTimeout`.** Condition-based waits only. `expect(await x.count())` is banned — it
   snapshots instead of retrying.
5. **The e2e suite measures `dist/`.** `playwright.config.ts` builds and previews. Anything asserted
   against `astro dev` is asserting about bytes nobody receives.
6. **Both locales, every string.** A row that involves copy is not ticked until `/` and `/id/` both
   assert the whole rendered sentence.

---

## A · The layout rule — stage 2

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| L-01 | Collapsed default fits without vertical scrolling at 320px — measured, not met: `test.fixme` in classroom-groups.spec.ts ("the no-scroll rule, measured") records the real numbers; closing it needs more than the top-row and naming-picker savings already banked, out of this stage's scope | P | ☐ |
| L-02 | …at 375px — same `test.fixme`, same reason | P | ☐ |
| L-03 | …at 768px — met: not `test.fixme`. `#cg-go`'s own bottom edge sits inside the viewport, with room to spare | P | ☐ |
| L-04 | …at 1280px — measured, not met: `test.fixme`, but for a different reason than 320/375 — the tool's own content is short enough, but starts far enough down the page (site header + hero) that this short, wide viewport (800px tall) still cuts the button off; the naming/theme picker's own removal (stage 3) is enough to close this one on its own | P | ☐ |
| L-05 | **No horizontal page scroll at any of those four widths, in any state** | P | ☐ |
| L-06 | …including with Student details open and a 100-student roster loaded — **stage 3**, not stage 2: the section has no body until then | P | ☐ |
| L-07 | Expanding a section is allowed to scroll vertically — this is not a failure | P | ☐ |
| L-08 | Every interactive target is ≥44px in both dimensions | P | ☐ |
| L-09 | Accent `#0A7D66` still meets AA against its background | P | ☐ |
| L-10 | Sections sit two-by-two ≥768px and stacked below | P | ☐ |
| L-11 | Content is identical in both arrangements — same text, same controls | P | ☐ |

## B · How to use — stage 2

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| H-01 | Sits **above the form** and outside the tool's four sections | P | ☐ |
| H-02 | Holds **both parts** — what this is, and how to use it | P | ☐ |
| H-03 | Both parts collapse **together**, under one header | P | ☐ |
| H-04 | **Collapsed by default** on a first visit with JavaScript (reversed from "expanded" by design spec §2's operator ruling 2) | P | ☐ |
| H-05 | Collapsed state is remembered across a reload | P | ☐ |
| H-06 | The `▸ How to use` header is present **and operable** when collapsed | P | ☐ |
| H-07 | The remembered state is `localStorage` only — no class data written | P | ☐ |
| H-08 | Both parts render in full in **both locales** | P | ✓ |
| H-09 | The raw markup ships unhidden, so the who/why paragraph is **reachable with JavaScript disabled** | P | ☐ |

## C · Section headers report their state — stage 2

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| S-01 | `Student details · none added` with no roster | P | ☐ |
| S-02 | → `· 24 named` once named | P | ☐ |
| S-03 | → `· 24 named · 2 absent` | P | ☐ |
| S-04 | → `· 24 named · 2 absent · 2 together · 1 apart` | P | ☐ |
| S-05 | `Grouping options · none` → `· mixed by sex` → `· mixed by sex · leftovers in one group` | P | ☐ |
| S-06 | `Import / export · nothing to save yet` | P | ☐ |
| S-07 | → `· unsaved changes — export to keep them` after any edit | P | ☐ |
| S-08 | That warning is **permanent on the header**, not a toast that fades | P | ☐ |
| S-09 | Every state string renders in both locales | P | ☐ |
| S-10 | The section is named **Student details** / **Detail siswa**, never "Customise students" | P | ☐ |

## D · The roster — stages 1 and 3

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| R-01 | Numbers assigned 1…N | U+P | ☐ |
| R-02 | The teacher may override a number | P | ☐ |
| R-03 | Gaps are allowed and group successfully | U | ☐ |
| R-04 | A gap raises a **non-blocking** warning naming the missing numbers | P | ☐ |
| R-05 | A duplicate is refused **as it is typed**, not at shuffle time | P | ☐ |
| R-06 | …naming who already holds it | P | ☐ |
| R-07 | The engine refuses a duplicate too, carrying the number | U | ☐ |
| R-08 | A new student takes **one past the highest**, never the first free gap: 1,2,3,5 → 6 | P | ☐ |
| R-09 | An unnamed row renders "Student N" everywhere it appears | U+P | ☐ |
| R-10 | **Fixed-width cells** — an empty name box is the same size as a full one | P | ☐ |
| R-11 | A long name does not push the letters off a phone screen | P | ☐ |
| R-12 | Identity is the number: two children called Ana are separated independently | U | ☐ |

## E · The roster reflows — stage 3

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| F-01 | Below the breakpoint the roster renders as **one card per student** | P | ☐ |
| F-02 | At and above it, the table | P | ☐ |
| F-03 | **Same content in both** — every control present, same values | P | ☐ |
| F-04 | **Same behaviour in both** — editing a name, sex, absence and both letters works in each | P | ☐ |
| F-05 | The absent tint, stripe and pill all appear on the **card**, not only the row | P | ☐ |
| F-06 | No horizontal scroll in card layout at 320px | P | ☐ |
| F-07 | The name field takes the full remaining width on a card | P | ☐ |
| F-08 | **The ~600px breakpoint is confirmed on real hardware**, both orientations | D | ☐ |

## F · Absence — stages 1 and 3

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| A-01 | The column is **`Absent`**; ticking it marks a student out | P | ☐ |
| A-02 | **Nothing in the row is disabled** — the name is still editable | P | ☐ |
| A-03 | …the sex is still editable | P | ☐ |
| A-04 | …both letters are still editable | P | ☐ |
| A-05 | Row background `#fff6e3` | P | ☐ |
| A-06 | Left stripe `#d9a441` | P | ☐ |
| A-07 | A pill reading **`absent`** beside the tick | P | ☐ |
| A-08 | The ticked box carries the fact **without colour** — assert it with colour removed | P | ☐ |
| A-09 | Row text keeps full contrast — this is a tint, not a grey-out | P | ☐ |
| A-10 | The consequence line is on screen **whether or not anyone is marked** | P | ☐ |
| A-11 | Absent students are excluded from grouping | U | ☐ |
| A-12 | …and absent from the results entirely | U+P | ☐ |
| A-13 | Group sizes come from those present, not from the roster | U | ☐ |
| A-14 | Everyone absent reads as "no students" | U | ☐ |
| A-15 | Absent students still count against `MAX_STUDENTS` — the roster is built first | U | ☐ |
| A-16 | An absent student's **together letter constrains nobody** | U | ☐ |
| A-17 | …and their **apart letter constrains nobody** | U | ☐ |
| A-18 | A together-unit whose other members are all absent places its member normally | U | ☐ |
| A-19 | The count line reads `24 students · 22 here · 2 absent` | P | ☐ |
| A-20 | The word is **absent**, never "away", in every surface and both locales | P | ☐ |

## G · Together and apart — stage 1

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| T-01 | Students sharing a together letter are placed as one unit | U | ☐ |
| T-02 | Two different together letters have no rule between them | U | ☐ |
| T-03 | Students sharing an apart letter are **mutually** separated — a set, not a pair | U | ☐ |
| T-04 | Two different apart letters are unrelated | U | ☐ |
| T-05 | An apart conflict applies to the **whole unit**, not just the student carrying it | U | ☐ |
| T-06 | The dropdown grows as needed — B appears once A is used | P | ☐ |
| T-07 | Together + apart on the same pair is refused **as typed** | P | ☐ |
| T-08 | …and by the engine, naming both students by number | U | ☐ |
| T-09 | The same apart letter on students **not** kept together is allowed | U | ☐ |
| T-10 | A together-unit larger than the group is refused, naming letter, unit and size | U | ☐ |
| T-11 | …reached by **growing the unit** | U | ☐ |
| T-12 | …and reached by **shrinking the groups** — one check catches both | U | ☐ |
| T-13 | Impossibility is proven by a clique and reported **by number** | U | ☐ |
| T-14 | "No arrangement exists" and "I stopped looking" stay distinct | U | ☐ |
| T-15 | The `SEARCH_NODE_CAP` path is reachable and reports `SEARCH_GAVE_UP` | U | ☐ |

## H · The Students box — stages 1, 2 and 3

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| B-01 | Typeable with no list | P | ☐ |
| B-02 | Becomes a **read-out** the moment a list exists | P | ☐ |
| B-03 | **The reason is rendered, not implied** — a disabled box with no explanation fails | P | ☐ |
| B-04 | Emptying the list makes it typeable again | P | ☐ |
| B-05 | …**keeping the number it was reporting** | P | ☐ |
| B-06 | `+ Add student` raises it by one | P | ☐ |
| B-07 | `+ Add several…` is an **inline** number field and confirm — no dialog, no `prompt()` | P | ☐ |
| B-08 | …and raises it by the number given | P | ☐ |
| B-09 | Removing a row lowers it | P | ☐ |
| B-10 | Ticking a student absent does **not** change it | P | ☐ |
| B-11 | …while the here/absent line and the groups both follow | P | ☐ |
| B-12 | **No code path produces a box that disagrees with the list** | P | ☐ |

## I · Size limits — stages 1 and 3

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| X-01 | The box refuses above 500 | U+P | ☐ |
| X-02 | Student details **refuses to open** above 100, and says why | P | ☐ |
| X-03 | …leaving the count alone, so the teacher can still shuffle | P | ☐ |
| X-04 | `+ Add student` disables at 100, stating the limit | P | ☐ |
| X-05 | `+ Add several…` disables at 100, stating the limit | P | ☐ |
| X-06 | …and refuses a number that would cross it, saying how many rows are free | P | ☐ |
| X-07 | An import of 101 rows is rejected whole, naming the count and the limit | P | ☐ |
| X-08 | There is **no way** to type the box past `MAX_ROSTER` with a list present | P | ☐ |

## J · Sex options and leftovers — stages 1 and 2

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| G-01 | Both switches are **off by default** | P | ✓ |
| G-02 | Both live in the **Grouping options** section | P | ✓ |
| G-03 | Disabled unless every student **being grouped** has M or F | U+P* | ✓* |
| G-04 | **An absent student with no sex does not disable them** | U+P* | ✓* |
| G-05 | Disabled message names the count: "3 of the 22 students being grouped…" | U+P* | ✓* |
| G-06 | A **separate message** covers having no list at all | P | ✓ |
| G-07 | Unticking an absence re-disables them **with its own message naming the student** | U+P | ✓ stage 3 T9 |
| G-08 | Mix spreads M and F evenly | U | ☐ |
| G-09 | Mix does the best it can when the numbers do not divide | U | ☐ |
| G-10 | Separate makes single-sex groups when the numbers divide | U | ☐ |
| G-11 | Separate **warns and names** who lands in a group of the other sex | U+P | ✓ stage 3 T9 |
| G-12 | A together-unit spanning both sexes is refused under separate | U | ☐ |
| G-13 | …and allowed under mix and under off | U | ☐ |
| G-14 | `sexMode: 'off'` is a complete no-op | U | ☐ |
| G-15 | Leftovers **spread** keeps largest and smallest within one | U | ☐ |
| G-16 | Leftovers **bunch** puts the remainder in one group | U | ☐ |
| G-17 | A spare student in a together unit goes where the unit goes | U | ☐ |
| G-18 | Bunch never builds a leftover group violating an apart letter | U | ☐ |
| G-19 | Both leftovers options render and work in both locales | P | ✓ |

**Stage 2, Task 4 status** (rows marked `*` above): the two switches and the
leftovers control are built (`ClassroomGroupsPage.astro`, `#cg-grouping-body`)
and `sexWhy` (`src/lib/sexOptions.ts`) implements the full disabled-reason
rule G-03/G-04/G-05 describe, proven exhaustively at the unit level against
synthetic rosters (`tests/unit/sexOptions.test.ts`, 12 tests, including G-04's
absent-exclusion and the vacuous all-absent case) — their suite is corrected
here from `P` to `U+P` because that unit coverage now exists. At the page
level there is no roster until stage 3 (`#cg-students-body` is still empty),
so the *only* branch a real browser can reach today is "no list at all" —
`sexWhyNoList`, G-06's own row, asserted end-to-end in both locales. The
"some students being grouped have no sex set" instance G-05 names, and the
enabled↔disabled *transition* G-03/G-04 describe, are real and tested at the
unit level but **not reachable from the page this stage**; ticked `✓*` on
that basis, not because a browser has been driven through them — see
`tests/e2e/classroom-groups-controls.spec.ts`'s own `Grouping options`
describe block for the exact split. G-07's distinct, name-specific message
("Dewi is back…") was deliberately not built: it needs to know WHICH
control's toggle caused an enabled→disabled transition, which requires
Student details' absence checkbox (stage 3) to exist — see `sexOptions.ts`'s
own doc comment. G-11's page half is the brief's own owed item (Step 4): the
spillover warning cannot be driven through the page without a roster fixture;
`tests/e2e/classroom-groups-controls.spec.ts` carries it as `test.fixme`, not
`test.skip`, so it stays named in every run's summary until stage 3 closes it.

## K · Partial reshuffle — stages 1 and 2

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| N-01 | Every group card carries a pin | P | ☐ |
| N-02 | Pinned groups survive a reshuffle untouched | U+P | ☐ |
| N-03 | Unpinned students are redealt | U | ☐ |
| N-04 | No student appears twice | U | ☐ |
| N-05 | Apart letters still honoured among those redealt | U | ☐ |
| N-06 | Together units still honoured among those redealt | U | ☐ |
| N-07 | Sex options still honoured among those redealt | U | ☐ |
| N-08 | A pinned student since marked absent is dropped from the pin | U | ☐ |
| N-09 | A together-unit split across a pinned boundary is **refused**, naming both | U | ☐ |
| N-10 | Every group pinned, with students left over, fails honestly | U | ☐ |

## L · Results and staleness — stages 2 and 5

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| E-01 | Class name is optional; blank blocks nothing | P | ☐ |
| E-02 | It heads the results: `7B — your groups` | P | ☐ |
| E-03 | It is **not** repeated on every group card | P | ☐ |
| E-04 | Groups are always numbered | P | ☐ |
| E-05 | **A rename updates the results and marks nothing stale** | P | ✓ stage 3 T9 |
| E-06 | Marking absent marks them out of date | P | ✓ stage 3 T9 |
| E-07 | Marking present marks them out of date | P | ✓ stage 3 T9 |
| E-08 | Adding a student marks them out of date | P | ✓ stage 3 T9 |
| E-09 | Removing a student marks them out of date | P | ✓ stage 3 T9 |
| E-10 | Changing a letter marks them out of date | P | ✓ stage 3 T9 |
| E-11 | Changing a sex under a sex option marks them out of date | P | ✓ stage 3 T9 |
| E-12 | Changing group size or leftovers marks them out of date | P | ☐ |
| E-13 | The badge **states which change did it** | P | ☐ |
| E-14 | Old groups stay visible, dimmed | P | ☐ |
| E-15 | **Export groups refuses while stale**, and says why | P | ☐ |
| E-16 | **Print refuses while stale**, and says why | P | ☐ |
| E-17 | **Full screen refuses while stale**, and says why | P | ☐ |
| E-18 | Shuffling clears the badge | P | ☐ |
| E-19 | Undoing the change clears the badge | P | ☐ |

> E-15, E-16 and E-17 are asserted **separately**. One of the three silently succeeding is exactly
> how a wrong sheet reaches a classroom.

## M · Avatars — stage 3

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| V-01 | Boy: bg `hsl(214 92% 88%)`, body `hsl(218 85% 46%)` | P | ☐ |
| V-02 | Girl: bg `hsl(334 95% 92%)`, body `hsl(332 85% 60%)` | P | ☐ |
| V-03 | Neutral: bg `hsl(150 40% 86%)`, body `hsl(150 42% 42%)` | P | ☐ |
| V-04 | Blank sex is the default — a teacher who never opens the table gets neutrals | P | ☐ |
| V-05 | **Hair length differs** short / medium / long | P | ☐ |
| V-06 | The three remain distinguishable **with colour removed** | P | ☐ |
| V-07 | Rendered at 34px in group cards | P | ☐ |
| V-08 | Each carries an accessible label | P | ☐ |

## N · CSV — stage 4

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| C-01 | A file with only a `number` column imports that many anonymous students | P | ☐ |
| C-02 | Partial rows import, everything else blank | P | ☐ |
| C-03 | Class name round-trips via `# Class:` | P | ☐ |
| C-04 | English headers and values | P | ☐ |
| C-05 | Indonesian headers and values — `nomor,nama,jenis kelamin,tidak hadir,bersama,terpisah` | P | ☐ |
| C-06 | `M`/`F` on EN, `L`/`P` on ID | P | ☐ |
| C-07 | `absent` blank for everyone present | P | ☐ |
| C-08 | `absent` accepts `no` as present | P | ☐ |
| C-09 | …and `tidak` on the Indonesian page | P | ☐ |
| C-10 | Anything else in that column is refused **by name** | P | ☐ |
| C-11 | An Indonesian file on the English page is **recognised**, refused, and links to `/id/` | P | ☐ |
| C-12 | An English file on the Indonesian page is refused and links to `/` | P | ☐ |
| C-13 | The refusal is in the **language of the page**, not of the file | P | ☐ |
| C-14 | A bad file is rejected **whole** — nothing imported, roster untouched | P | ☐ |
| C-15 | **Every** problem is listed, not just the first | P | ☐ |
| C-16 | Each names the row, what was wrong, and what is accepted | P | ☐ |
| C-17 | Import over a roster **always warns**, naming what will be lost | P | ☐ |
| C-18 | …**including when the counts match** | P | ☐ |
| C-19 | Template with no roster carries headers + example rows | P | ☐ |
| C-20 | Template with a roster **is** the roster | P | ☐ |
| C-21 | **Every `#` line is ignored** — example rows and a teacher's own note | P | ☐ |
| C-22 | …except `# Class:` / `# Kelas:`, which are read as metadata | P | ☐ |
| C-23 | A downloaded template imported unedited adds **no students at all** | P | ☐ |
| C-24 | …including one whose example row is named "Example One" | P | ☐ |
| C-25 | Export class list produces the roster | P | ☐ |
| C-26 | Export groups appears **only once groups exist** | P | ☐ |
| C-27 | Export groups is **one row per student** with a `group` column | P | ☐ |
| C-28 | Filenames carry the class name and the date | P | ☐ |
| C-29 | A class name with `/`, `\`, `:` or a control character produces a usable filename | P | ☐ |
| C-30 | …and the class name is **unchanged** on the page, in `# Class:` and in the heading | P | ☐ |
| C-31 | With no class name: `class-list-2026-08-06.csv` | P | ☐ |

## O · Both-language export — stage 4

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| W-01 | Offered from the **English** page | P | ☐ |
| W-02 | Offered from the **Indonesian** page | P | ☐ |
| W-03 | The teacher is told what will happen before it happens | P | ☐ |
| W-04 | The current page's file saves **first**, in its own language | P | ☐ |
| W-05 | A new tab opens on the other locale | P | ☐ |
| W-06 | The roster arrives over an **in-memory** channel | P | ☐ |
| W-07 | **Nothing is written to storage** — `localStorage` and `sessionStorage` both asserted empty of roster data | P | ☐ |
| W-08 | **Nothing is in the URL** | P | ☐ |
| W-09 | The source tab forgets the roster **only after acknowledgement** | P | ☐ |
| W-10 | A blocked tab is reported plainly | P | ☐ |
| W-11 | …and the roster is **kept** where it is | P | ☐ |
| W-12 | A tab that never asks within the timeout is reported, roster kept | P | ☐ |
| W-13 | The whole flow's copy is in the language of the **starting** page | P | ☐ |

## P · Print — stage 5

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| Q-01 | The panel offers class list / group results / both | P | ☐ |
| Q-02 | **Both** is the default | P | ☐ |
| Q-03 | All three tick boxes start ticked | P | ☐ |
| Q-04 | All four choices are remembered across a reload | P | ☐ |
| Q-05 | Combination 1: absent ✓ letters ✓ | P | ☐ |
| Q-06 | Combination 2: absent ✓ letters ✗ | P | ☐ |
| Q-07 | Combination 3: absent ✗ letters ✓ | P | ☐ |
| Q-08 | Combination 4: absent ✗ letters ✗ | P | ☐ |
| Q-09 | **Showing absent students always prints the `Absent` column**, letters on or off | P | ☐ |
| Q-10 | Unticking letters leaves the `Absent` column alone | P | ☐ |
| Q-11 | Hiding absent students drops them entirely | P | ☐ |
| Q-12 | …and the numbers then jump (1,2,3,5) | P | ☐ |
| Q-13 | …and the sheet still states how many are absent | P | ☐ |
| Q-14 | Avatars on: faces print | P | ☐ |
| Q-15 | Avatars off: names only | P | ☐ |
| Q-16 | The sheet carries class name and date | P | ☐ |
| Q-17 | No form, no site header, no footer on the sheet | P | ☐ |
| Q-18 | **Legible in greyscale** — asserted with colour removed | P | ☐ |
| Q-19 | Group results print minus absent students | P | ☐ |
| Q-20 | Printed rows carry **neither** the tint **nor** the pill | P | ☐ |
| Q-21 | Every panel string in both locales | P | ☐ |

## Q · Full screen — stage 5

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| Z-01 | The button appears **only once groups exist** | P | ☐ |
| Z-02 | The Fullscreen API path works | P | ☐ |
| Z-03 | The overlay fallback works | P | ☐ |
| Z-04 | **A refused `requestFullscreen` lands in the fallback**, never in nothing happening | P | ☐ |
| Z-05 | No form or site chrome on the board | P | ☐ |
| Z-06 | Class name heads it; groups numbered | P | ☐ |
| Z-07 | Type shrinks to fit | P | ☐ |
| Z-08 | …and stops at the floor — names ≥24px, headings ≥32px | P | ☐ |
| Z-09 | Below the floor the board scrolls rather than shrinking | P | ☐ |
| Z-10 | The control bar fades | P | ☐ |
| Z-11 | …and returns on pointer-move | P | ☐ |
| Z-12 | …and on tap | P | ☐ |
| Z-13 | …and on any key | P | ☐ |
| Z-14 | **It does not fade while a control inside it holds focus** | P | ☐ |
| Z-15 | Escape exits while the bar is visible | P | ☐ |
| Z-16 | Escape exits while the bar is faded | P | ☐ |
| Z-17 | Pins still work on the board | P | ☐ |
| Z-18 | Shuffle again works on the board | P | ☐ |
| Z-19 | **A shuffle done on the board is what the page shows on exit** | P | ☐ |
| Z-20 | Scroll position is restored on exit | P | ☐ |
| Z-21 | The reveal animation plays | P | ☐ |
| Z-22 | …suppressed by the Sound & animation switch | P | ☐ |
| Z-23 | …suppressed by `prefers-reduced-motion` | P | ☐ |
| Z-24 | **Warnings appear on the board**, not only on the page behind it | P | ☐ |
| Z-25 | **The type floor is read from the back of a room, off a real projector** | D | ☐ |

## R · Persistence and privacy — stages 2, 4 and 5

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| Y-01 | **The roster is never persisted** — reload loses it | P | ☐ |
| Y-02 | No roster data in `localStorage` at any point | P | ☐ |
| Y-03 | No roster data in `sessionStorage` at any point | P | ☐ |
| Y-04 | No roster data in the URL at any point | P | ☐ |
| Y-05 | The how-to collapsed state persists | P | ☐ |
| Y-06 | The four print choices persist | P | ☐ |
| Y-07 | …and **nothing else** is written | P | ☐ |
| Y-08 | New privacy copy renders in full, in English | P | ☐ |
| Y-09 | …and in Indonesian | P | ☐ |
| Y-10 | The old wording "No class list ever leaves this page" is **gone** | P | ☐ |
| Y-11 | No third-party requests from any page state | P | ☐ |

## S · Removals — stage 3

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| K-01 | The theme `<select>` is gone from the page | P | ☐ |
| K-02 | `themeNames` / `themes` gone from **both** locale files | U | ☐ |
| K-03 | `THEME_KEYS` and the themed branch of `groupName()` gone | U | ☐ |
| K-04 | The **naming radio** is gone from the page | P | ☐ |
| K-05 | `namingLabel` / `namingNumbered` / `namingThemed` gone from both locales | U | ☐ |
| K-06 | The paste-names box is gone | P | ☐ |
| K-07 | `namesLabel` / `namesHelp` gone from both locales | U | ☐ |
| K-08 | The free-text keep-apart box is gone | P | ☐ |
| K-09 | `keepApart*` copy keys gone from both locales | U | ☐ |
| K-10 | `parseKeepApart` is no longer exported | U | ☐ |
| K-11 | `KEEP_APART_NEEDS_NAMES` and `KEEP_APART_UNKNOWN_NAME` are gone | U | ☐ |
| K-12 | `dead-copy.test.ts` proves **nothing renders** any removed key | U | ☐ |
| K-13 | `i18n.test.ts` proves both locales still have identical key sets | U | ☐ |
| K-14 | No test anywhere still asserts a removed feature | U+P | ☐ |

## T · The suite itself

| # | Requirement | Suite | ✓ |
|---|---|---|---|
| M-01 | `rendered-text.spec.ts` seam scan stays green | P | ✓ |
| M-02 | Every new sentence asserted **whole**, not by fragment | P | ✓ |
| M-03 | Every new string asserted in **both** locales | P | ✓ |
| M-04 | The four existing e2e suites are **extended**, not duplicated | P | ☐ |
| M-05 | Tests for a removed feature are deleted in the **same stage** that removes it | P | ☐ |
| M-06 | No `waitForTimeout` anywhere in the new tests | P | ☐ |
| M-07 | No `expect(await x.count())` anywhere in the new tests | P | ☐ |
| M-08 | All five Playwright projects pass — chromium, firefox, webkit, mobile-chrome, mobile-safari | P | ☐ |
| M-09 | `npm run test:unit` and `npm run test:e2e` both exit 0 — **exit code checked, not output read** | U+P | ☐ |
| M-10 | `needsJs` still covers the whole tool | P | ☐ |
| M-11 | The homepage still ships **zero** JavaScript | P | ☐ |
| M-12 | Every error code has a test that reaches it | U | ☐ |
| M-13 | Every warning code has a test that reaches it | U | ☐ |
| M-14 | Real mobile-device browser gauntlet, both platforms | D | ☐ |

---

## Totals

| Area | Rows | Stages |
|---|---|---|
| A Layout | 11 | 2 |
| B How to use | 9 | 2 |
| C Section headers | 10 | 2 |
| D The roster | 12 | 1, 3 |
| E The roster reflows | 8 | 3 |
| F Absence | 20 | 1, 3 |
| G Together and apart | 15 | 1 |
| H The Students box | 12 | 1, 2, 3 |
| I Size limits | 8 | 1, 3 |
| J Sex options and leftovers | 19 | 1, 2 |
| K Partial reshuffle | 10 | 1, 2 |
| L Results and staleness | 19 | 2, 5 |
| M Avatars | 8 | 3 |
| N CSV | 31 | 4 |
| O Both-language export | 13 | 4 |
| P Print | 21 | 5 |
| Q Full screen | 25 | 5 |
| R Persistence and privacy | 11 | 2, 4, 5 |
| S Removals | 14 | 3 |
| T The suite itself | 14 | all |
| **Total** | **290** | |

By suite — counted from the table, not estimated:

| Suite | Rows |
|---|---|
| Playwright only | 226 |
| Vitest only | 52 |
| Both | 9 |
| Real device only | 3 |

The three that no CI run can settle are **E-F-08** (the roster breakpoint), **Z-25** (the projector
type floor) and **M-14** (the gauntlet itself).

**No stage ships with an unticked row.** If a row turns out to be untestable as written, that is a
finding about the spec, not a licence to skip it — bring it back rather than leaving it blank.
