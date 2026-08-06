# Classroom Group Creator v2 — design

**Date:** 2026-08-06
**Status:** design agreed in brainstorming; no questions open
**Supersedes nothing** — extends the tool shipped in PR #8 (`7b9336b`), live at
`shyden.co.uk/classroom-groups` and `/id/classroom-groups`.

Every decision below was made explicitly by the operator during brainstorming. Where a decision
removes something that is live today, or where one instruction constrains another, that is called
out rather than smoothed over.

---

## 1. Why

The tool works but scrolls. The operator wants it compact enough to fit one screen by default, and
at the same time wants considerably more in it: per-student customisation, a class name, and
import/export. More content in less space, resolved by collapsing everything that isn't needed to
make a group.

---

## 2. The rule that shapes the layout

**The default, collapsed state must fit without scrolling on every device, phone included. Once the
teacher expands something, scrolling is expected and fine.**

That single clarification makes the goal achievable and dictates the design: everything is collapsed
by default and opening is a deliberate act.

---

## 3. Layout

- **Arrangement B.** On wide screens the three collapsed sections sit side by side, so the button
  rises and results start above the fold. On a phone they stack. Identical content either way.
- **Top row:** Class (optional) · Students · Split by (per group / number of groups).
- **Sections, inside the tool:** Student details · Together & apart · Import / export ·
  Sound & animation.

### How to use — at the very top, outside the tool

**How to use is not one of the tool's sections.** It sits at the very top of the page, above the
form, because it is the page's summary and description rather than part of the feature. It is
**one section holding two parts**, and both collapse together under a single header:

1. **What this is** — what the tool does, and why: fair random groups, no favourites, no arguments,
   and nothing about the class leaves the browser.
2. **How to use it** — the three steps.

- **Expanded by default.** If the teacher collapses it, remember that in `localStorage` and honour it
  next visit. This is a UI preference, not class data — the roster is never stored.
- **Collapsed, the header `▸ How to use` remains**, so it can always be opened again. Collapsing it
  is the single biggest saving on the page: today's long intro paragraph and three how-to steps are
  most of the scrolling.

### Section headers report their own state

**Every collapsed header reports its own state**, so collapsing never means forgetting:

- `▸ Student details · none added` → `· 24 named` → `· 24 named · 2 away`
- `▸ Together & apart · none` → `· 2 together · 1 apart`
- `▸ Import / export · nothing to save yet` → `· unsaved changes — export to keep them`

That last one is where the operator's "advise them to export so they don't lose their changes"
lives: permanently on the header, not a toast that vanishes before it is read.

**Student details expands in place** inside the form — not an overlay, drawer or separate page.
Chosen because expanding is allowed to scroll, so the simplest option is also sufficient, and it
behaves identically on phone and desktop with no focus trap or second layout to test.

### Naming

The section is **Student details**, not "Customise students". It holds facts about students — name,
sex, whether they are here — which is a register, not a customisation. Proposed Indonesian:
**`Detail siswa`**, and **`Cara menggunakan`** for How to use. Both go through the normal locale
review; they are recorded here so the rename is not quietly dropped in one language.

---

## 4. The data model

A student stops being a name and becomes a record:

```ts
interface Student {
  number: number;              // the ID — required, always present
  name: string | null;         // optional
  sex: 'M' | 'F' | null;       // null = neutral, the default
  present: boolean;            // default true
  together: string | null;     // letter; same letter = same group
  apart: string | null;        // letter; same letter = mutually separated
}
```

**Identity moves from the name to the number.** This fixes a real defect that exists today: keep-apart
matches by name, so a class containing two children called Ana separates *both* from Budi because
the engine cannot tell them apart. With numbers as IDs every constraint is unambiguous.

### Numbers

- The tool assigns `1…N`. **The teacher may override them.**
- Whole numbers, **unique**, **gaps allowed** — a real register number survives a round trip.
- A gap raises a **non-blocking warning**: the class list appears to be incomplete, check it by
  opening Student details.

### Sex

- Blank (neutral) / `M` / `F`. **Blank is the default**, so a teacher who never opens the table gets
  neutral avatars for everyone and is never asked.

### Absence

- An absent student's **row stays, greyed out**, so tomorrow they are one tick away.
- **The number being grouped drops; the class size does not.** Groups are built from those present,
  while the Students box stays at 24 — see *The Students box* below.
- Absent students **do not appear in the results at all**.

### Together / apart

- Both are a **letter per student**, chosen from a dropdown that **grows as needed** (A, then B once
  A is used, and so on).
- **Together:** students sharing a letter are placed as one unit.
- **Apart:** students sharing a letter are **mutually separated** — everyone marked X goes in a
  different group from everyone else marked X.
  - *Accepted consequence:* this is a set, not a pair. "Ana away from Budi, and Ana away from Citra,
    but Budi and Citra together" can no longer be expressed. The operator chose this knowingly.
- **A pair marked both together and apart is refused in the table, as it is typed**, naming the
  clash: *"Ana and Budi are kept together, so they cannot also be kept apart."*

### The Students box — an input, then a read-out

Two things could claim to know how big the class is: the box and the list. Every mismatch problem
comes from letting them disagree, so **they are never both in charge**.

- **With no list, the box is the input.** Type a number, get that many anonymous students, up to
  `MAX_STUDENTS`. This path is unchanged and a teacher can use the whole tool without ever opening
  Student details.
- **The moment a list exists, the box becomes a read-out.** It reports the list and cannot be typed
  into. Underneath it, in every state, **the reason is shown**:

  > **Students** · 24
  > *Set by your list. Add or remove students in Student details to change it.*

  Never a bare greyed-out box. A disabled control that does not say why is a defect.
- **Changing the class size is then a list operation**, in Student details:
  - `+ Add student` — one row.
  - `+ Add several…` — asks how many and adds that many unnamed rows, for the teacher who has 24
    named and six more to come.
  - Removing a row removes the student.
- **Emptying the list** returns the box to being an input.

**What this buys.** The count and the list cannot disagree, so there is no mismatch to warn about,
none to block, and no rule about which students get dropped when a number shrinks — because a number
can no longer shrink out from under the list. The earlier draft warned about the mismatch and a later
revision blocked it; removing the contradiction is better than either.

**Absence does not touch the box.** Ticking a student away leaves it at 24 — it is the size of the
class, not of tonight's group work. The line beneath does the arithmetic (`24 students · 22 here ·
2 away`) and groups are built from those present.

### Two size limits, not one

The engine refuses above 500 today. That limit was set when a student was a number; a student is now
a row of five controls, so 500 named students would put 2,500 form elements on the page — slow on a
phone and slow to read out. The two costs are different, so they get different limits:

| Limit | Value | Applies to |
|---|---|---|
| `MAX_STUDENTS` | **500** | The Students box — a plain count of anonymous students |
| `MAX_ROSTER` | **100** | Student details — students with a row of their own |

100 is roughly twice the largest real class, so no teacher meets it by accident.

Every way of exceeding `MAX_ROSTER` has a stated outcome. None of them may fail silently:

- **Opening Student details with the count above 100** — the section refuses to open and says why:
  *"Student details holds up to 100 students. Lower the number to list this class individually."* The
  count itself is left alone; the teacher can still shuffle all 500 anonymously.
- **Adding a row at 100** — both `+ Add student` and `+ Add several…` are disabled and state the
  limit; `+ Add several…` also refuses a number that would cross it, saying how many rows are free.
- **Importing a file with more than 100 rows** — rejected whole, like any other invalid file, with the
  row count and the limit in the message.

There is no fifth case: with a list present the box is a read-out, so it cannot be typed past the
limit at all.

---

## 5. Avatars

Direction **C — friendly faces**, at the **Bold** strength.

| | background | body |
|---|---|---|
| Boy | `hsl(214 92% 88%)` | `hsl(218 85% 46%)` |
| Girl | `hsl(334 95% 92%)` | `hsl(332 85% 60%)` |
| Neutral | `hsl(150 40% 86%)` | `hsl(150 42% 42%)` |

Shared: hair `hsl(24 40% 24%)`, face `hsl(32 55% 78%)`, eyes/mouth `hsl(215 30% 20%)`.
Simple dot eyes and a smile; 40×40 viewBox; rendered at 34px in group cards.

**Two signals, not one.** Colour *and* hair length (short / medium / long) both differ. Colour alone
would fail the roughly 1 in 12 boys who cannot separate pink from blue, and would not survive a
greyscale printout. This is deliberate and must not be "simplified" away.

**Removed:** the group-name themes (Animals / Colours / Planets), their `themeNames`/`themes` tables
in both locales, `THEME_KEYS`, the themed branch of `groupName()`, and the theme `<select>`. Groups
are always numbered. This deletes a shipped feature; the operator chose it knowingly.

---

## 6. Grouping by sex

Two optional switches, both **off by default**:

- **Mix boys and girls evenly** — spread M and F as evenly as the numbers allow.
- **Keep boys and girls separate** — single-sex groups.

Rules:

- **Both are DISABLED unless every student on the list has `M` or `F`.** When disabled, say why:
  *"18 of your 24 students have no sex set. Open Student details and set M or F for everyone to
  use these."* This removes the question of where a neutral student goes in a single-sex group.
- **Separate mode warns when the counts don't divide**, and **names the students who end up in a
  group of the other sex**.
- **A contradiction with together/apart is blocked, with the reason stated** — e.g. Ana (F) and Budi
  (M) bound together while single-sex groups are requested. Blocked, not silently resolved.

---

## 7. Partial reshuffle

**In scope.** Each group card carries a pin. **Shuffle again** leaves pinned groups untouched and
redeals everyone else. Pinned students are a third constraint alongside together, apart and the sex
options, and interactions between them must be specified and tested (see open questions — none
outstanding here, but the engine work is real).

---

## 8. Class name and results

- Class name is **optional**. Blank is fine and nothing is blocked.
- It **heads the results**: `7B — your groups`. Groups themselves are numbered.
- It is **not** repeated on every group card.

### Full screen — the projector view

A **Full screen** button on the results, appearing only once groups exist. The groups go on the board
and the class reads them off it, which is what this tool is actually for.

- **Fullscreen API where available, full-viewport overlay where not.** iOS Safari does not grant
  `requestFullscreen` on arbitrary elements, so the fallback is not optional and is not a degraded
  experience — it is a real full-viewport layer with the same content. Both paths are tested; a
  refused promise must land in the fallback, never in nothing happening.
- **Only the groups.** Class name at the top, numbered groups, avatars and names. No form, no site
  header, no footer.
- **Type scales to fit, down to a floor.** Everything on one board wherever it fits. Student names
  never render below **24px** and group headings never below **32px**; past that the board scrolls
  instead of shrinking further. Those figures are a starting point to be **checked on a real
  projector**, in keeping with this repo's device-verification rule — not settled by looking at a
  laptop.
- **Controls fade, but never trap.** A bar carrying *Shuffle again*, *Print* and *Close* fades after
  about three seconds and returns on pointer-move, tap or any key.
  - **It must never fade while any control inside it has focus**, or a keyboard user loses the
    controls they are using. This is a defect the fade would otherwise introduce and must be tested.
  - **Escape always exits**, faded or not.
- **Pins still work**, so the teacher can keep the group that worked and re-roll the rest in front of
  the class.
- **The reveal animation plays**, honouring the existing Sound & animation switch and
  `prefers-reduced-motion`. It is wasted on a laptop the teacher is looking at alone; on the board it
  is the moment the children are waiting for.
- **Exiting returns to the same results, unchanged**, at the same scroll position.

---

## 9. CSV import and export

### Shape

```
# Class: 7B
number,name,sex,present,together,apart
1,Ana,F,yes,A,
2,Budi,M,yes,A,
3,Citra,F,yes,,X
4,Dewi,F,no,,
5,Eko,M,yes,,X
6,,,yes,,
```

- **CSV only.** No `.xlsx` — it would need a spreadsheet library of a few hundred KB on a site that
  currently ships almost no JavaScript and no third-party runtime dependencies. CSV opens natively
  in Excel, Numbers and Sheets.
- **Only `number` is required.** A file containing nothing but a `number` column is valid and
  imports that many anonymous students. Everything else may be blank per row.
- **Class name travels as a `# Class:` comment line** above the headers, so it round-trips. Excel
  shows it as a first row; the importer reads it.

### Language

The file must match the language of the page — **headers and values both**.

| | English page | Indonesian page |
|---|---|---|
| headers | `number,name,sex,present,together,apart` | `nomor,nama,jenis kelamin,hadir,bersama,terpisah` |
| class comment | `# Class:` | `# Kelas:` |
| sex | `M` / `F` / blank | `L` / `P` / blank |
| present | `yes` / `no` | `ya` / `tidak` |

A file in the wrong language is **recognised as such**, refused, and offers a link to the correct
page — *"This looks like a Bahasa Indonesia class list. Open the Indonesian version of this page to
import it."* The refusal is written in the language of the page the teacher is on, not the file.

### Validation

- **A bad file is rejected whole.** Nothing is imported.
- **Every problem is listed**, not just the first: row number, what was wrong, what is accepted.
  *"Row 7 — sex 'Male' not understood. Use M, F, or leave blank." / "Row 12 — number 5 is already
  used by row 5." / "Row 19 — number is blank. Every student needs one."*

### Import over an existing roster

**Always warn first**, naming what will be lost — including how much of it was filled in by hand. Never
silent, even when the counts match, because the same count can be a completely different class.

### Exports

Two buttons, and the groups one appears only once groups exist.

- **Export class list** — the roster, for reuse next lesson.
- **Export groups** — the arrangement just made, **one row per student** with a `group` column:

```
# Class: 7B
# Groups made 2026-08-06
group,number,name
1,1,Ana
1,2,Budi
2,5,Eko
```

Chosen over one-row-per-group because it sorts, filters and pivots, and handles uneven group sizes
without ragged blank columns. *A is data; B was a picture — and for a picture you print.*

### Templates

**Context-sensitive.** With no class list on screen, the template carries the headers plus clearly
marked example rows the importer recognises and skips, so a teacher who forgets to delete them does
not import "Example One". With a class list already present, the template is **your roster**.

### Exporting in both languages — bidirectional

Available from **either** page; the page you are on always exports first, in its own language.

1. Teacher chooses "also export in the other language", and is told what will happen.
2. The current page's file saves.
3. A **new tab** opens on the other locale's page and **asks the first tab for the roster over an
   in-memory, same-origin channel**. Nothing is written to storage; nothing goes in a URL.
4. The teacher verifies the translated roster there and exports it.
5. The source tab forgets the roster **only once the new tab acknowledges receipt**.

If the tab is blocked, or never asks within a timeout, say so plainly and keep the roster where it
is. The handover must never lose data by failing silently.

*Rejected alternatives, and why:* `sessionStorage` (the operator's first instinct) writes children's
names into browser-managed storage for the length of a page load, which can survive a crash on a
shared classroom machine. Putting the roster in a URL is the exact defect closed as C1 in PR #8.

### Filenames

`7B-class-list-2026-08-06.csv` · `7B-daftar-kelas-2026-08-06.csv`
`7B-groups-2026-08-06.csv` · `7B-kelompok-2026-08-06.csv`
With no class name: `class-list-2026-08-06.csv`. The date prevents successive saves overwriting
each other.

---

## 10. Printing

A **print panel**, not a bare print button. The teacher decides what goes on the paper — the operator
was explicit that this is theirs to choose, not ours to fix.

```
Print                              ×

What to print
  ( ) Class list
  ( ) Group results
  (•) Both

On the class list
  [x] Show students who are away
  [x] Show sex and the together/apart letters

[x] Include avatars

              [ Cancel ]   [ Print ]
```

**What to print** — class list, group results, or both. Both is the default.

**The two class-list tick boxes are independent**, which is why they are tick boxes rather than three
named sheets: all four combinations are reachable, including *only who is here, with the letters* —
a combination the named sheets could not express.

- *Show students who are away* — off drops absent students from the sheet entirely. The remaining
  numbers then jump (1, 2, 3, 5) because a number belongs to a student, not to a position. The sheet
  says how many are away so the gap is never a mystery.
- *Show sex and the together/apart letters* — off prints numbers and names only.

**Include avatars** — off prints names only: identical on every printer, and the least ink. On, faces
print as line drawings, and hair length still separates boy from girl with no colour at all.

**All three tick boxes start ticked**, *What to print* starts on *Both*, and **the panel remembers
all four choices** for next time — UI preferences, no personal data, consistent with section 11.

The sheet itself is a genuine **print-friendly view**: no form, no collapsed sections, no site
chrome; class name and date at the top. **It must work in greyscale as well as colour** — this is why
the avatars carry hair length as well as colour, and why nothing may depend on colour alone.

Group results print as they appear, minus absent students, who by section 4 are never in the results
at all — the *away* tick box governs the class list only.

---

## 11. Persistence and privacy

- **The roster is never persisted.** Saving is what export is for. When a teacher has changed
  anything, the Import/export header says `unsaved changes — export to keep them`.
- **UI preferences may be persisted** — the how-to collapsed state, and the four print-panel choices.
  No personal data: a tick box is not a child.
- Privacy copy changes, because the roster can now reach a second tab:

  > **EN** — Everything happens in your browser. Your class list is never sent anywhere, and is
  > forgotten when you close the page.
  >
  > **ID** — Semuanya berjalan di peramban Anda. Daftar kelas Anda tidak pernah dikirim ke mana pun,
  > dan dilupakan saat Anda menutup halaman.

  The old wording — "No class list ever leaves this page" — is no longer strictly true and must go.

---

## 12. Removed, deliberately

| Removed | Why |
|---|---|
| Group themes (Animals / Colours / Planets) + both locale tables | Avatars chosen instead; groups always numbered |
| "Paste names, one per line" box | The table and import replace it |
| Free-text keep-apart box | Replaced by the Apart letter in the table |

All three are live today. Each is a decision, not an oversight.

---

## 13. Testing — tests first, observed RED

The operator was explicit: **write the Playwright tests first, watch them fail, then make them pass
with real code.** Every clarification in this document is a test. Non-exhaustively:

**Layout** — collapsed default fits without scrolling at 320/375/768/1280; expanding is allowed to
scroll; How to use sits above the form and outside the tool's sections; both its parts collapse
together under one header; it is open by default and its collapse is remembered across a reload;
the `▸ How to use` header is still present and operable when collapsed; each section header reports
its state in every state; the section is named Student details in both locales.

**Roster** — number assigned 1…N; override accepted; duplicates refused; gaps allowed but warned;
absent row greyed, excluded from groups, absent from results; unnamed row renders "Student N";
fixed-width cells so an empty name does not resize the row.

**Constraints** — together placed as a unit; apart mutually separated; together+apart contradiction
refused as typed; a together-unit larger than the group size refused, naming the clash.

**Sex options** — disabled with a reason unless every student has M or F; mix spreads evenly;
separate warns and names who lands in the other sex's group; contradiction with together blocked
with a reason.

**The Students box** — typeable with no list; becomes a read-out the moment a list exists, and
**the reason is rendered, not merely implied** — a disabled box with no explanation is a failing
test; emptying the list makes it typeable again; `+ Add student` and `+ Add several…` change it;
removing a row lowers it; ticking a student away does **not** change it while the here/away line and
the groups both follow; no code path can produce a box that disagrees with the list.

**Reshuffle** — pinned groups survive; unpinned redealt; constraints still honoured.

**Full screen** — button appears only once groups exist; the API path and the overlay fallback are
both exercised, and a refused `requestFullscreen` lands in the fallback rather than doing nothing;
no form or site chrome on the board; type shrinks to fit and stops at the floor, below which the
board scrolls; the control bar fades and returns on pointer, tap and key; **it does not fade while a
control inside it holds focus**; Escape exits whether the bar is visible or not; pins still work;
the reveal plays and is suppressed by both the Sound & animation switch and `prefers-reduced-motion`;
exiting restores the same groups and scroll position.

**CSV** — minimum file (number column only); partial rows; class-name round trip; every value in
both languages; wrong-language file recognised and refused with a link; bad file rejected whole with
*every* problem listed; import over an existing roster always warns; template with and without an
existing roster.

**Both-language export** — works from English and from Indonesian; nothing written to storage;
nothing in the URL; source forgets only after acknowledgement; blocked tab reported and roster kept.

**Print** — class list, groups, both; each of the four tick boxes changes the sheet in the way it
says, and the two class-list boxes are proved independent by testing all four combinations; absent
students dropped *and* the away count still stated; numbers still jump when they are dropped;
avatars present and absent; choices survive a reload; greyscale legible; no form or chrome on the
sheet.

**Size limits** — the box refuses above 500; Student details refuses to open above 100 and says
why while leaving the count alone; the add control disables at 100 stating the limit; an import of
101 rows is rejected whole naming the count and the limit; raising the box above 100 with a roster
present tops up anonymously instead of failing.

**i18n** — every new string in both locales; whole rendered sentences asserted, not fragments; the
existing rendered-text seam scan must stay green.

---

## 14. Delivery

Staged, **merged behind the scenes and deployed once at the end**, so the live page never sits in a
half-migrated state:

1. **Data model + engine** — Student records, number identity, together/apart letters, absence,
   sex-based grouping, pinned groups.
2. **Compact layout** — arrangement B, collapsed sections with state headers, class name, how-to.
3. **Student details + avatars** — the table, the new avatars, removal of themes and the two
   replaced controls.
4. **CSV import/export + templates + validation + both-language handover.**
5. **Print panel and print views, and the full-screen projector view.**

The two size limits (section 4) belong to stage 1 for `MAX_STUDENTS` and stage 3 for `MAX_ROSTER`,
since the roster limit has nothing to constrain until the table exists.

---

## 15. Open questions

**None.** The three that were open when this document was first written are now decided and written
into the sections above:

| Question | Decision | Where |
|---|---|---|
| What the printed class list shows | The teacher decides, via two independent tick boxes | §10 |
| Whether avatars print | The teacher decides, at print time, remembered | §10 |
| The class-size cap | Two limits: 500 to shuffle, 100 to list individually | §4 |

The first two share an answer worth stating plainly: **where we could not name a single right sheet,
we handed the choice to the teacher rather than guessing on their behalf.**
