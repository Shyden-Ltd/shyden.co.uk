# Classroom Group Creator v2 — Stage 4: CSV import, export and the two-language handover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher save a class list and open it again next lesson, in their own language — and save it in both languages without the roster ever touching storage or a URL.

**Architecture:** The whole CSV format lives in **one pure module**, `src/lib/csv.ts`, which knows nothing about the DOM. Parsing returns either a roster or **every** problem — never the first one — because a teacher who has to make three round trips to a spreadsheet will stop using the tool. Language is a parameter, not a global: the same functions serve both locales, and the locale's column names come from a table so a mismatch is a unit-test failure rather than a shipped one. The two-language handover uses `BroadcastChannel` between same-origin tabs, so the roster crosses in memory and is never written anywhere.

**Tech Stack:** TypeScript, Vitest, Playwright. **No CSV library** — the format we emit is ours, and a parser strict enough for it is smaller than the argument for a dependency on a site that ships no third-party runtime code.

**Depends on:** Stages 1–3 complete. Needs `Student` (stage 1); `getRoster` / `setRoster` and `MAX_ROSTER` (stage 3); and the `dirty` rule stage 3 wired into `setRoster`, which this stage clears on export and on import.

**Traceability:** ticks **C-01…C-31, O/W-01…W-13, X-07, S-06, S-07, S-08, Y-02, Y-03, Y-04**.

## Global Constraints

All of stages 2 and 3, plus:

- **CSV only.** No `.xlsx`. A spreadsheet library is a few hundred KB on a site that currently ships almost no JavaScript, and CSV opens natively in Excel, Numbers and Sheets.
- **The file must match the language of the page** — headers *and* values.
- **A bad file is rejected whole.** Nothing is imported, and the roster on screen is untouched.
- **Every problem is listed**, with the row, what was wrong, and what is accepted.
- **`#` lines are never students.** `# Class:` / `# Kelas:` are read as metadata; every other `#` line is discarded.
- **The roster never reaches storage or a URL** — including during the handover. Asserted after every operation.
- Tests observed RED first. Commit per task.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/csv.ts` | **New.** The format: `serialise`, `parse`, `detectLocale`, the column tables, filename building. Pure. |
| `src/lib/csv-locale.ts` | **New.** The two column/value tables and nothing else. Separate from `csv.ts` so the language question has one file to read when a third locale arrives. |
| `src/scripts/io-ui.ts` | **New.** The Import/export section: buttons, file input, the error panel, the handover. |
| `src/scripts/classroom-groups.ts` | Modified: exposes the roster, wires `io-ui`. |
| `src/components/pages/ClassroomGroupsPage.astro` | Modified: the `cg-io` body. |
| `src/lib/i18n/en.ts`, `id.ts` | Copy. |
| `tests/unit/csv.test.ts` | **New.** The bulk of this stage's proof. |
| `tests/e2e/classroom-groups-io.spec.ts` | **New.** |

---

## Task 1: The column tables

Smallest possible first task, because everything else reads from it.

**Files:** Create `src/lib/csv-locale.ts`, `tests/unit/csv.test.ts`

**Interfaces:**
```ts
export type Locale = 'en' | 'id';
export interface CsvLocale {
  classComment: string;                 // '# Class:' | '# Kelas:'
  columns: Record<CsvColumn, string>;   // number/name/sex/absent/together/apart
  sex: { M: string; F: string };
  absentYes: string;
  absentNo: string;
  groupColumn: string;
}
export const CSV_LOCALES: Record<Locale, CsvLocale>;
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('CSV_LOCALES', () => {
  it('has English headers', () => {
    expect(Object.values(CSV_LOCALES.en.columns))
      .toEqual(['number', 'name', 'sex', 'absent', 'together', 'apart']);
  });

  it('has Indonesian headers', () => {
    expect(Object.values(CSV_LOCALES.id.columns))
      .toEqual(['nomor', 'nama', 'jenis kelamin', 'tidak hadir', 'bersama', 'terpisah']);
  });

  it('translates the values, not only the headers', () => {
    expect(CSV_LOCALES.en.sex).toEqual({ M: 'M', F: 'F' });
    expect(CSV_LOCALES.id.sex).toEqual({ M: 'L', F: 'P' });
    expect(CSV_LOCALES.en.absentYes).toBe('yes');
    expect(CSV_LOCALES.id.absentYes).toBe('ya');
    expect(CSV_LOCALES.id.absentNo).toBe('tidak');
  });

  it('has the same column keys in both locales', () => {
    // A missing column in one language is a file the other page cannot read,
    // and nothing else in this repo would catch it -- there is no type checker.
    expect(Object.keys(CSV_LOCALES.en.columns).sort())
      .toEqual(Object.keys(CSV_LOCALES.id.columns).sort());
  });

  it('shares no header word between the locales', () => {
    // detectLocale distinguishes files by their headers. Any word appearing in
    // both tables would make that ambiguous, so this is a design invariant and
    // not a nicety.
    const en = new Set(Object.values(CSV_LOCALES.en.columns));
    const shared = Object.values(CSV_LOCALES.id.columns).filter((c) => en.has(c));
    expect(shared).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, watch fail, implement, commit**

```bash
git add src/lib/csv-locale.ts tests/unit/csv.test.ts
git commit -m "feat(csv): the two column tables, in their own file

Separate from the parser so the language question has one file to read
when a third locale arrives.

Two invariants are asserted rather than assumed: the locales have the
same column keys, and share no header word. The second is what makes
detecting a file's language unambiguous, so it is a design rule and not
a nicety."
```

---

## Task 2: Serialising

**Files:** `src/lib/csv.ts`, `tests/unit/csv.test.ts`
**Traceability:** C-03…C-07, C-25, C-27

**Interfaces:**
```ts
export function serialiseRoster(roster: Student[], className: string, locale: Locale): string;
export function serialiseGroups(
  groups: Student[][], className: string, on: string, locale: Locale): string;
/** ISO date, injected everywhere rather than read from a clock inside a formatter. */
export function todayISO(now?: Date): string;
/** A class name made safe for a filename. The class name itself is never altered. */
export function safeFilePart(className: string): string;
export function fileName(
  kind: 'class-list' | 'groups', className: string, on: string, locale: Locale): string;
/** Headers plus example rows, all of them comment lines. */
export function emptyTemplate(locale: Locale): string;
```

> `todayISO` is exported because **stage 5 prints the date on the sheet** and must use the same
> formatter — two date formats on two artefacts describing the same shuffle is exactly the kind of
> small inconsistency nobody notices until a teacher does. It takes `now` as a parameter so a test
> can pin it; a formatter that reads the clock internally cannot be tested without freezing time.

- [ ] **Step 1: Write the failing tests**

```ts
const roster = [
  student({ number: 1, name: 'Ana', sex: 'F', together: 'A' }),
  student({ number: 4, name: 'Dewi', sex: 'F', absent: true }),
  student({ number: 6 }),
];

describe('serialiseRoster', () => {
  it('writes the English shape', () => {
    expect(serialiseRoster(roster, '7B', 'en')).toBe(
      '# Class: 7B\n' +
      'number,name,sex,absent,together,apart\n' +
      '1,Ana,F,,A,\n' +
      '4,Dewi,F,yes,,\n' +
      '6,,,,,\n');
  });

  it('writes the Indonesian shape', () => {
    expect(serialiseRoster(roster, '7B', 'id')).toBe(
      '# Kelas: 7B\n' +
      'nomor,nama,jenis kelamin,tidak hadir,bersama,terpisah\n' +
      '1,Ana,P,,A,\n' +
      '4,Dewi,P,ya,,\n' +
      '6,,,,,\n');
  });

  it('leaves the absent column blank for everyone who is in', () => {
    const line = serialiseRoster([student({ number: 1 })], '', 'en').split('\n')[1];
    expect(line).toBe('number,name,sex,absent,together,apart');
    expect(serialiseRoster([student({ number: 1 })], '', 'en').split('\n')[2]).toBe('1,,,,,');
  });

  it('omits the class comment when there is no class name', () => {
    expect(serialiseRoster([student({ number: 1 })], '', 'en').startsWith('#')).toBe(false);
  });

  it('quotes a name containing a comma', () => {
    expect(serialiseRoster([student({ number: 1, name: 'Wong, Mei' })], '', 'en'))
      .toContain('1,"Wong, Mei",,,,');
  });

  it('quotes a name containing a quote, doubling it', () => {
    expect(serialiseRoster([student({ number: 1, name: 'Jo "Jojo" Tan' })], '', 'en'))
      .toContain('1,"Jo ""Jojo"" Tan",,,,');
  });
});

describe('todayISO and the filename helpers', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(todayISO(new Date('2026-08-06T23:30:00Z'))).toBe('2026-08-06');
  });

  it('builds the four filenames', () => {
    expect(fileName('class-list', '7B', '2026-08-06', 'en')).toBe('7B-class-list-2026-08-06.csv');
    expect(fileName('class-list', '7B', '2026-08-06', 'id')).toBe('7B-daftar-kelas-2026-08-06.csv');
    expect(fileName('groups', '7B', '2026-08-06', 'en')).toBe('7B-groups-2026-08-06.csv');
    expect(fileName('groups', '7B', '2026-08-06', 'id')).toBe('7B-kelompok-2026-08-06.csv');
  });

  it('drops the class part when there is no class name', () => {
    expect(fileName('class-list', '', '2026-08-06', 'en')).toBe('class-list-2026-08-06.csv');
  });

  it('makes a class name safe for a filename', () => {
    expect(safeFilePart('Year 7 / Set B')).toBe('Year-7-Set-B');
    expect(safeFilePart('7B: top set')).toBe('7B-top-set');
    expect(safeFilePart('  7B  ')).toBe('7B');
  });

  it('never returns a leading or trailing dash, or a run of them', () => {
    expect(safeFilePart('///7B///')).toBe('7B');
    expect(safeFilePart('a // b')).toBe('a-b');
  });

  it('returns an empty string for a name made entirely of unusable characters', () => {
    // …so fileName falls back to the unnamed form rather than producing "-.csv".
    expect(safeFilePart('///')).toBe('');
    expect(fileName('class-list', '///', '2026-08-06', 'en')).toBe('class-list-2026-08-06.csv');
  });
});

describe('serialiseGroups', () => {
  it('writes one row per student with a group column', () => {
    expect(serialiseGroups(
      [[roster[0]], [roster[2]]], '7B', '2026-08-06', 'en')).toBe(
      '# Class: 7B\n# Groups made 2026-08-06\ngroup,number,name\n1,1,Ana\n2,6,\n');
  });
});
```

- [ ] **Step 2: Run, watch fail, implement**

The quoting rules are the part worth getting right in one place:

```ts
/** RFC-4180 quoting: quote when the value contains a comma, quote or newline. */
const cell = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
```

- [ ] **Step 3: Commit**

```bash
git add -u src/ tests/
git commit -m "feat(csv): serialising a roster and a set of groups

Both languages, headers and values. The absent column is blank for
everyone present so it stays quiet until somebody is out.

Quoting is RFC-4180 and lives in one function, because a name with a
comma in it is not an edge case in a country where many people have
one."
```

---

## Task 3: Parsing, and every problem at once

The largest task here, and the one a teacher will feel.

**Files:** `src/lib/csv.ts`, `tests/unit/csv.test.ts`
**Traceability:** C-01, C-02, C-08…C-10, C-14…C-16, C-21, C-22, C-23, C-24, X-07

**Interfaces:**
```ts
export type ParseResult =
  | { ok: true; roster: Student[]; className: string }
  | { ok: false; problems: CsvProblem[] };
export interface CsvProblem { row: number | null; message: string }
export function parseRoster(text: string, locale: Locale, t: Strings): ParseResult;
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('parseRoster', () => {
  it('accepts a file with nothing but a number column', () => {
    const out = parseRoster('number\n1\n2\n3\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(out.roster.every((s) => s.name === null && s.sex === null && !s.absent)).toBe(true);
  });

  it('accepts partial rows', () => {
    const out = parseRoster('number,name,sex\n1,Ana,\n2,,M\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster[0]).toMatchObject({ number: 1, name: 'Ana', sex: null });
    expect(out.roster[1]).toMatchObject({ number: 2, name: null, sex: 'M' });
  });

  it('round-trips the class name', () => {
    const out = parseRoster('# Class: 7B\nnumber\n1\n', 'en', en);
    expect(out.ok && out.className).toBe('7B');
  });

  it('accepts blank, no and NO as present', () => {
    for (const v of ['', 'no', 'NO', 'No']) {
      const out = parseRoster(`number,absent\n1,${v}\n`, 'en', en);
      expect(out.ok && out.roster[0].absent, v).toBe(false);
    }
  });

  it('accepts tidak as present on the Indonesian page', () => {
    const out = parseRoster('nomor,tidak hadir\n1,tidak\n', 'id', id);
    expect(out.ok && out.roster[0].absent).toBe(false);
  });

  it('refuses anything else in the absent column, by name', () => {
    const out = parseRoster('number,absent\n1,maybe\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message)
      .toBe("Row 1 — absent 'maybe' not understood. Use yes, no, or leave blank.");
  });

  it('lists EVERY problem, not just the first', () => {
    const out = parseRoster(
      'number,name,sex\n' +
      '1,Ana,F\n' +
      '2,Budi,Male\n' +      // row 2 — bad sex
      '1,Citra,F\n' +        // row 3 — duplicate number
      ',Dewi,F\n',           // row 4 — no number
      'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems).toHaveLength(3);
    expect(out.problems.map((p) => p.row)).toEqual([2, 3, 4]);
    expect(out.problems[1].message).toBe('Row 3 — number 1 is already used by row 1.');
    expect(out.problems[2].message).toBe('Row 4 — number is blank. Every student needs one.');
  });

  it('ignores every # line except the class comment', () => {
    const out = parseRoster(
      '# Class: 7B\nnumber,name\n# 1,Ana\n# my notes\n2,Budi\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster).toHaveLength(1);
    expect(out.roster[0].name).toBe('Budi');
  });

  it('imports nothing from an untouched template', () => {
    // `emptyTemplate` is the same exported function the download button calls,
    // so this proves the artefact a teacher actually receives -- not a copy of
    // it written in the test, which would pass while the real one drifted.
    const out = parseRoster(emptyTemplate('en'), 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster).toEqual([]);
  });

  it('does not import a real child called Example One', () => {
    // The reason examples are comment lines rather than recognised by content.
    const out = parseRoster('number,name\n1,Example One\n', 'en', en);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roster[0].name).toBe('Example One');
  });

  it('rejects a file of more than MAX_ROSTER rows, naming both numbers', () => {
    const rows = Array.from({ length: 101 }, (_, i) => `${i + 1}`).join('\n');
    const out = parseRoster(`number\n${rows}\n`, 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message)
      .toBe('This file has 101 students. Student details holds up to 100.');
  });

  it('handles CRLF line endings, which is what Excel writes', () => {
    const out = parseRoster('number,name\r\n1,Ana\r\n', 'en', en);
    expect(out.ok && out.roster[0].name).toBe('Ana');
  });

  it('handles a UTF-8 BOM, which is also what Excel writes', () => {
    const out = parseRoster('﻿number,name\n1,Ana\n', 'en', en);
    expect(out.ok).toBe(true);
  });

  it('reads quoted cells containing commas', () => {
    const out = parseRoster('number,name\n1,"Wong, Mei"\n', 'en', en);
    expect(out.ok && out.roster[0].name).toBe('Wong, Mei');
  });
});
```

> The CRLF and BOM cases are not padding. Excel writes both, Excel is what a teacher will use, and a parser that only handles what our own serialiser emits will fail on the first real file it meets.

- [ ] **Step 2: Run and watch all fail**

- [ ] **Step 3: Implement**

Collect problems into an array and return them all; **never return early on the first**. Row numbers count data rows, not file lines, so a `#` line does not shift them — assert that with the "ignores every # line" case above.

- [ ] **Step 4: Commit**

```bash
git add -u src/ tests/
git commit -m "feat(csv): parsing, with every problem listed at once

A bad file is rejected whole and reports all of its problems, because a
teacher who has to make three round trips to a spreadsheet stops using
the tool.

Handles CRLF and a UTF-8 BOM because that is what Excel writes, and a
parser that only reads what our own serialiser emits fails on the first
real file it meets.

Example rows are comment lines, so a real child called Example One
imports normally -- which is the bug that recognising examples by their
contents would have caused."
```

---

## Task 4: Detecting the wrong language

**Files:** `src/lib/csv.ts`, `tests/unit/csv.test.ts`
**Traceability:** C-11, C-12, C-13

- [ ] **Step 1: Write the failing tests**

```ts
describe('detectLocale', () => {
  it('recognises an English file', () =>
    expect(detectLocale('number,name,sex\n1,Ana,F\n')).toBe('en'));

  it('recognises an Indonesian file', () =>
    expect(detectLocale('nomor,nama,jenis kelamin\n1,Ana,P\n')).toBe('id'));

  it('recognises one by its class comment alone', () =>
    expect(detectLocale('# Kelas: 7B\nnomor\n1\n')).toBe('id'));

  it('returns null for something that is neither', () =>
    expect(detectLocale('foo,bar\n1,2\n')).toBe(null));

  it('is not confused by a name that looks like a header', () =>
    expect(detectLocale('number,name\n1,nomor\n')).toBe('en'));
});

describe('importing the wrong language', () => {
  it('is refused with a link, in the language of the PAGE', () => {
    const out = importFile('nomor,nama\n1,Ana\n', 'en', en);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toBe(
      'This looks like a Bahasa Indonesia class list. Open the Indonesian version of this page to import it.');
  });

  it('is refused the other way round, in Indonesian', () => {
    const out = importFile('number,name\n1,Ana\n', 'id', id);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems[0].message).toContain('bahasa Inggris');
  });
});
```

- [ ] **Step 2: Run, watch fail, implement, commit**

```bash
git add -u src/ tests/
git commit -m "feat(csv): recognise a file in the wrong language and say so

Detected by its headers, which the locale tables guarantee share no
word. The refusal is written in the language of the page the teacher is
on, not the language of the file, and links to the page that can read
it."
```

---

## Task 5: The Import/export section

**Files:** Create `src/scripts/io-ui.ts`, `tests/e2e/classroom-groups-io.spec.ts`; modify the Astro page
**Traceability:** C-14, C-17, C-18, C-19, C-20, C-26, C-28…C-31, S-06…S-08

- [ ] **Step 1: Add this stage's helpers to the shared file**

`tests/e2e/helpers.ts` was created in stage 3. **Add to it; do not start a second one.**

```ts
export const upload = async (page: Page, name: string, body: string) => {
  await page.locator('#cg-import').setInputFiles({
    name, mimeType: 'text/csv', buffer: Buffer.from(body, 'utf8'),
  });
};

export const downloadText = async (page: Page, button: string | RegExp) => {
  const [d] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ]);
  return (await (await d.createReadStream())!.toArray()).join('');
};

/** Build a roster on a named locale's page — the handover needs both. */
export const buildRosterAtPath = async (
  page: Page, path: string, students: Array<[('M'|'F'|null), string?]>,
) => {
  await page.goto(path);
  await buildRoster(page, students);
};

export const downloadName = async (page: Page, button: string | RegExp) => {
  const [d] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ]);
  return d.suggestedFilename();
};
```

- [ ] **Step 2: Write the failing tests**

```ts
import { buildRoster, rosterOf, upload, downloadText, downloadName, todayISO } from './helpers';

test('a bad file changes nothing on screen, and lists every problem', async ({ page }) => {
  await rosterOf(page, 3);
  await page.locator('#cg-io-toggle').click();
  await upload(page, 'bad.csv',
    'number,name,sex\n1,Ana,F\n2,Budi,Male\n1,Citra,F\n');
  await expect(page.getByText('Row 2 — sex \'Male\' not understood. Use M, F, or leave blank.')).toBeVisible();
  await expect(page.getByText('Row 3 — number 1 is already used by row 1.')).toBeVisible();
  await expect(page.locator('.cg-student')).toHaveCount(3);   // untouched
});

test('importing over a roster always warns, even when the counts match', async ({ page }) => {
  await rosterOf(page, 3);
  await page.locator('#cg-io-toggle').click();
  await upload(page, 'three.csv', 'number\n1\n2\n3\n');
  await expect(page.getByText(
    'This will replace your current class list — 3 students, 3 named.')).toBeVisible();
  await expect(page.locator('.cg-student')).toHaveCount(3);   // not yet replaced
});

test('the export button appears for groups only once groups exist', async ({ page }) => {
  await rosterOf(page, 6);
  await page.locator('#cg-io-toggle').click();
  await expect(page.getByRole('button', { name: 'Export groups' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Make groups' }).click();
  await expect(page.getByRole('button', { name: 'Export groups' })).toBeVisible();
});

test('the template is the roster once there is one', async ({ page }) => {
  await buildRoster(page, [['F', 'Ana'], ['M', 'Budi']]);
  await page.locator('#cg-io-toggle').click();
  const text = await downloadText(page, 'Download template');
  expect(text).toContain('1,Ana,F,,,');
  expect(text).toContain('2,Budi,M,,,');
  // and it is a real roster, not the example rows
  expect(text).not.toContain('# 1,Ana');
});

test('the template with no roster is example COMMENT rows only', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.locator('#cg-io-toggle').click();
  const text = await downloadText(page, 'Download template');
  expect(text).toContain('# 1,Ana,F,,A,');
  // every non-header line is a comment, so importing it unedited adds nobody
  const body = text.split('\n').slice(1).filter((l) => l.trim() !== '');
  expect(body.every((l) => l.startsWith('#'))).toBe(true);
});

test('the filename carries the class and the date', async ({ page }) => {
  await rosterOf(page, 2);
  await page.getByLabel('Class (optional)').fill('7B');
  await page.locator('#cg-io-toggle').click();
  const name = await downloadName(page, 'Export class list');
  expect(name).toMatch(/^7B-class-list-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('a class name with a slash still produces a usable filename', async ({ page }) => {
  await rosterOf(page, 2);
  await page.getByLabel('Class (optional)').fill('Year 7 / Set B');
  await page.locator('#cg-io-toggle').click();
  const name = await downloadName(page, 'Export class list');
  expect(name).toBe(`Year-7-Set-B-class-list-${todayISO()}.csv`);
  // and the class name itself is untouched
  await expect(page.getByLabel('Class (optional)')).toHaveValue('Year 7 / Set B');
  await expect(page.locator('#cg-results-h')).not.toHaveText(/Year-7-Set-B/);
});

test('exporting clears the unsaved-changes warning', async ({ page }) => {
  // The other half of stage 3's `dirty` rule: setRoster(next, { saved: true }).
  await rosterOf(page, 3);
  await page.locator('#cg-io-toggle').click();
  await expect(page.locator('#cg-io .state')).toHaveText('unsaved changes — export to keep them');
  await downloadName(page, 'Export class list');
  await expect(page.locator('#cg-io .state')).toHaveText('nothing to save yet');
});

test('a successful import clears it too', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.locator('#cg-io-toggle').click();
  await upload(page, 'ok.csv', 'number,name\n1,Ana\n2,Budi\n');
  await expect(page.locator('.cg-student')).toHaveCount(2);
  await expect(page.locator('#cg-io .state')).toHaveText('nothing to save yet');
});

test('the header says there are unsaved changes, permanently', async ({ page }) => {
  await rosterOf(page, 2);
  await expect(page.locator('#cg-io .state'))
    .toHaveText('unsaved changes — export to keep them');
  await page.waitForFunction(() => true);              // no timer to outlast
  await expect(page.locator('#cg-io .state'))
    .toHaveText('unsaved changes — export to keep them');
});
```

- [ ] **Step 3: Run, watch fail, implement, commit**

```bash
git add src/scripts/io-ui.ts tests/e2e/helpers.ts tests/e2e/classroom-groups-io.spec.ts && git add -u src/
git commit -m "feat(classroom): the Import/export section

A bad file leaves the screen exactly as it was and lists every problem.
Importing over a roster always warns, including when the counts match,
because the same count can be a completely different class.

A class name is made filesystem-safe for the filename only and is never
altered on the page or in the file."
```

---

## Task 6: Both languages, from either side

**Files:** `io-ui.ts`, locales, `classroom-groups-io.spec.ts`
**Traceability:** W-01…W-13, Y-02, Y-03, Y-04

- [ ] **Step 1: Write the failing tests**

```ts
test.describe('exporting in both languages', () => {
  for (const [from, to, firstFile, secondFile] of [
    ['/classroom-groups', '/id/classroom-groups', 'class-list', 'daftar-kelas'],
    ['/id/classroom-groups', '/classroom-groups', 'daftar-kelas', 'class-list'],
  ] as const) {
    test(`works starting from ${from}`, async ({ page, context }) => {
      await buildRosterAtPath(page, from, [['F', 'Ana'], ['M', 'Budi']]);
      await page.locator('#cg-io-toggle').click();

      const [download, newPage] = await Promise.all([
        page.waitForEvent('download'),
        context.waitForEvent('page'),
        page.getByRole('button', { name: /both languages|kedua bahasa/ }).click(),
      ]);

      expect(download.suggestedFilename()).toContain(firstFile);
      await newPage.waitForLoadState();
      expect(new URL(newPage.url()).pathname).toBe(to);
      await expect(newPage.locator('.cg-student')).toHaveCount(2);
      await expect(newPage.locator('.cg-student').first().getByLabel(/Name|Nama/))
        .toHaveValue('Ana');

      const second = await Promise.all([
        newPage.waitForEvent('download'),
        newPage.getByRole('button', { name: /Export class list|Ekspor daftar kelas/ }).click(),
      ]);
      expect(second[0].suggestedFilename()).toContain(secondFile);
    });
  }

  test('nothing is written to storage and nothing is in a URL', async ({ page, context }) => {
    await buildRosterAtPath(page, '/classroom-groups', [['F', 'Ana']]);
    await page.locator('#cg-io-toggle').click();
    const [, newPage] = await Promise.all([
      page.waitForEvent('download'),
      context.waitForEvent('page'),
      page.getByRole('button', { name: /both languages/ }).click(),
    ]);
    await newPage.waitForLoadState();
    for (const p of [page, newPage]) {
      const seen = await p.evaluate(() => [
        JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }), location.href,
      ].join(' '));
      expect(seen).not.toContain('Ana');
    }
  });

  test('the source keeps the roster until the new tab acknowledges', async ({ page, context }) => {
    await buildRosterAtPath(page, '/classroom-groups', [['F', 'Ana']]);
    await page.locator('#cg-io-toggle').click();
    const [, newPage] = await Promise.all([
      page.waitForEvent('download'),
      context.waitForEvent('page'),
      page.getByRole('button', { name: /both languages/ }).click(),
    ]);
    await newPage.waitForLoadState();
    await expect(newPage.locator('.cg-student')).toHaveCount(1);
    await expect(page.locator('.cg-student')).toHaveCount(1);   // still there
  });

  test('a blocked tab is reported and the roster is kept', async ({ page, context }) => {
    await context.addInitScript(() => { window.open = () => null; });
    await buildRosterAtPath(page, '/classroom-groups', [['F', 'Ana']]);
    await page.locator('#cg-io-toggle').click();
    await page.getByRole('button', { name: /both languages/ }).click();
    await expect(page.getByText(
      'The second tab could not be opened. Your class list is still here — allow pop-ups and try again.'
    )).toBeVisible();
    await expect(page.locator('.cg-student')).toHaveCount(1);
  });
});
```

- [ ] **Step 2: Run, watch fail, implement**

```ts
/**
 * The roster crosses in memory, over a channel both tabs already share.
 *
 * sessionStorage was the operator's first instinct and is rejected: it writes
 * children's names into browser-managed storage for the length of a page load,
 * which can survive a crash on a shared classroom machine. A URL is worse --
 * that is the exact defect closed as C1 in PR #8.
 */
const channel = new BroadcastChannel('cg-handover');
```

The receiving tab asks; the sending tab replies once and then, **only after an `ack`**, forgets. A timeout reports plainly and keeps the roster.

- [ ] **Step 3: Commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): export in both languages, from either side

The page you are on exports first, in its own language, then hands the
roster to the other over a BroadcastChannel -- in memory, nothing
written, nothing in a URL. The source forgets only once the second tab
acknowledges, so a blocked pop-up loses nothing and says so.

Both directions are tested by the same parameterised case, because
\"bidirectional\" is precisely the kind of claim that gets made about
code that only works one way."
```

---

## Task 7: Stage sweep

- [ ] **Step 1: Full run, five projects, both locales**

```bash
npm test; echo "exit=$?"
```

- [ ] **Step 2: Prove the roster still never persists**

Re-run stage 3's Y-01…Y-04 cases **after** an import, an export and a handover. New code paths, same invariant.

- [ ] **Step 3: Tick the matrix rows listed at the top of this plan**

- [ ] **Step 4: Commit**

```bash
git add -u docs/ tests/
git commit -m "test(csv): the roster still never persists, after the new paths

Import, export and the handover are three new opportunities to write
something. The invariant is re-asserted after each rather than assumed
to hold because it held before."
```

---

## Self-review

**Spec coverage** — §9 in full: shape (T2), validation (T3), language (T4), import over a roster and templates and filenames (T5), the bidirectional handover (T6).

**Placeholders** — none.

**Type consistency** — `Locale` is defined once in `csv-locale.ts` and imported by `csv.ts` and `io-ui.ts`; `ParseResult` mirrors stage 1's `GroupingOutcome` discriminated-union shape deliberately, so the page has one error-rendering habit rather than two; `MAX_ROSTER` comes from stage 3's `roster.ts`, never redefined.

**Linkage out** — stage 5 imports **`todayISO`** from `csv.ts` for the printed sheet's date, so one
formatter serves both artefacts. It also adds its own helpers to `tests/e2e/helpers.ts` rather than
starting a third file. Nothing else is owed.
