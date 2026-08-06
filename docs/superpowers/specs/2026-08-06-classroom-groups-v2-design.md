# Classroom Group Creator v2 — design

**Date:** 2026-08-06
**Status:** design agreed in brainstorming; three questions still open (see the end)
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

- **Arrangement B.** On wide screens the four collapsed sections sit two-by-two, so the button rises
  and results start above the fold. On a phone they stack. Identical content either way.
- **Top row:** Class (optional) · Students · Split by (per group / number of groups).
- **Sections:** How does this work? · Customise students · Together & apart · Import / export ·
  Sound & animation.
- **How-to is EXPANDED by default.** If the teacher collapses it, remember that in `localStorage`
  and honour it next visit. This is a UI preference, not class data — the roster is never stored.
- The long intro paragraph is cut to one line; the three how-to steps move into the collapsed
  section. Together these are most of today's scrolling.
- **Every collapsed header reports its own state**, so collapsing never means forgetting:
  - `▸ Customise students · nothing customised` → `· 24 named` → `· 24 named · 2 absent`
  - `▸ Together & apart · none` → `· 2 together · 1 apart`
  - `▸ Import / export · nothing to save yet` → `· unsaved changes — export to keep them`
  That last one is where the operator's "advise them to export so they don't lose their changes"
  lives: permanently on the header, not a toast that vanishes before it is read.
- **Customise students expands in place** inside the form — not an overlay, drawer or separate page.
  Chosen because expanding is allowed to scroll, so the simplest option is also sufficient, and it
  behaves identically on phone and desktop with no focus trap or second layout to test.

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
  opening Customise students.

### Sex

- Blank (neutral) / `M` / `F`. **Blank is the default**, so a teacher who never opens the table gets
  neutral avatars for everyone and is never asked.

### Absence

- An absent student's **row stays, greyed out**, so tomorrow they are one tick away.
- The **class size drops** and groups are built from those present.
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

### The Students box and the roster

- With no roster, the box is a plain count of anonymous students.
- **Box higher than the roster:** the extra are added as anonymous students (24 named + 6 anonymous).
- **Box lower than the roster:** show a warning describing the mismatch **and what will happen**
  before continuing. Do not silently correct, and do not silently drop anyone.

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
  *"18 of your 24 students have no sex set. Open Customise students and set M or F for everyone to
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

**Always warn first**, naming what will be lost — including how much of it was customised. Never
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

- A **print option** with a choice of **class list**, **group results**, or **both**.
- A genuine **print-friendly view**: no form, no collapsed sections, no site chrome; class name and
  date at the top.
- **Must work in greyscale as well as colour.** This is why the avatars carry hair length as well as
  colour, and why nothing may depend on colour alone.

---

## 11. Persistence and privacy

- **The roster is never persisted.** Saving is what export is for. When a teacher has customised
  anything, the Import/export header says `unsaved changes — export to keep them`.
- **UI preferences may be persisted** (the how-to collapsed state). No personal data.
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
scroll; how-to open by default and its collapse remembered across a reload; each section header
reports its state in every state.

**Roster** — number assigned 1…N; override accepted; duplicates refused; gaps allowed but warned;
absent row greyed, excluded from groups, absent from results; unnamed row renders "Student N";
fixed-width cells so an empty name does not resize the row.

**Constraints** — together placed as a unit; apart mutually separated; together+apart contradiction
refused as typed; a together-unit larger than the group size refused, naming the clash.

**Sex options** — disabled with a reason unless every student has M or F; mix spreads evenly;
separate warns and names who lands in the other sex's group; contradiction with together blocked
with a reason.

**Count vs roster** — higher box tops up with anonymous students; lower box warns and states the
outcome before continuing.

**Reshuffle** — pinned groups survive; unpinned redealt; constraints still honoured.

**CSV** — minimum file (number column only); partial rows; class-name round trip; every value in
both languages; wrong-language file recognised and refused with a link; bad file rejected whole with
*every* problem listed; import over an existing roster always warns; template with and without an
existing roster.

**Both-language export** — works from English and from Indonesian; nothing written to storage;
nothing in the URL; source forgets only after acknowledgement; blocked tab reported and roster kept.

**Print** — class list, groups, both; greyscale legible; no form or chrome on the sheet.

**i18n** — every new string in both locales; whole rendered sentences asserted, not fragments; the
existing rendered-text seam scan must stay green.

---

## 14. Delivery

Staged, **merged behind the scenes and deployed once at the end**, so the live page never sits in a
half-migrated state:

1. **Data model + engine** — Student records, number identity, together/apart letters, absence,
   sex-based grouping, pinned groups.
2. **Compact layout** — arrangement B, collapsed sections with state headers, class name, how-to.
3. **Customise students + avatars** — the table, the new avatars, removal of themes and the two
   replaced controls.
4. **CSV import/export + templates + validation + both-language handover.**
5. **Print views.**

---

## 15. Open questions

Still to decide before implementation:

1. **What the printed class list shows** — full register with absences and letters (usable as a
   paper register), or just numbers and names, or only students present.
2. **Whether avatars appear on printed sheets** — names only saves ink and prints identically
   everywhere; keeping them helps younger children; or make it a choice at print time.
3. **The class-size cap.** The engine currently refuses above 500. A roster table renders a row of
   five controls per student, so 500 is 2,500 form elements — sluggish on a phone and slow for a
   screen reader. Options: lower it to ~100, keep 500, or keep 500 for anonymous counts and cap the
   table lower.
