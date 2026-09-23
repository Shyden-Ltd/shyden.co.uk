# Translation reports — design (#97)

**Status:** DRAFT, waiting for the operator's review. No plan or code exists.
On 2026-09-23 the design was put to him in four parts, each with its content in
the question itself, and "Looks right" was recorded for all four. His review of
this spec confirms those answers, because an earlier "approval", of a design
shown only in a preview panel he could not see, turned out not to be his.
**Ticket:** #97. **Decisions:** #97 comments of 2026-09-10, 2026-09-11 and
2026-09-23 (issuecomment-5788975282), plus the two answers given after that
comment (the string picker and wrangler, section 9).

## 1. Intent

Shyden Ltd has no native speaker for any language but English, so every other
locale is machine output marked BETA. The people best placed to catch a bad
translation are the people reading it (operator, 2026-09-10). Today the BETA
notice tells a visitor the copy may be wrong and gives them nothing to do about
it. This feature lets a visitor report a specific string from the page it
appears on, in their own language, without an account.

**Success:** a visitor can report a string in under a minute without losing
anything on the page, and the operator can see the report and act on it.

## 2. Decisions this spec implements

| Question            | Decision                                                                 | Date       |
| ------------------- | ------------------------------------------------------------------------ | ---------- |
| Route               | A form posting to a same-origin Pages Function, `/api/report`             | 2026-09-11 |
| Where reports go    | A D1 table on the Cloudflare account that serves the site                 | 2026-09-23 |
| Spam                | Honeypot, strict server validation, the free-plan WAF rate-limit rule     | 2026-09-23 |
| Personal data       | None collected                                                           | 2026-09-23 |
| Retention           | _"it's kept until actioned"_                                             | 2026-09-23 |
| Picking the string  | Type-ahead of the page's own strings (`<datalist>`)                       | 2026-09-23 |
| wrangler            | An exact-pinned devDependency                                            | 2026-09-23 |

**Out of scope, proposed as follow-up tickets:** a review script that shows each
report beside its English source string and a back-translation of the
suggestion (#95's engine), without which a Thai report is unreadable to the
operator; and a notification that carries only a count of waiting reports.

## 3. What the visitor sees

### 3.1 Placement

In every **beta locale**, `isBetaLocale(lang)`, derived and never enumerated,
so English never shows it, the footer gains a disclosure directly after the
existing BETA notice (`src/components/Footer.astro`). It is a native
`<details>`, closed by default, so opening it needs no JavaScript. The 404 page
renders its footer in English and so carries no form.

### 3.2 The form

```html
<details class="report" data-report>
  <summary>Report a translation problem</summary>
  <form method="post" action="/api/report" data-report-form>
    <p>Reports go to Shyden Ltd and are deleted once they have been dealt with.</p>
    <input type="hidden" name="locale" value="vi" />
    <input type="hidden" name="page" value="classroom-groups" />
    <label for="report-quote">Which words are wrong?</label>
    <input id="report-quote" name="quote" type="text" list="report-strings"
           required maxlength="1000" autocomplete="off"
           aria-describedby="report-quote-hint" />
    <p id="report-quote-hint">Start typing and choose the words from the list,
       or copy them from the page.</p>
    <datalist id="report-strings"><!-- this page's strings, section 5 --></datalist>
    <label for="report-suggestion">What should it say? (optional)</label>
    <textarea id="report-suggestion" name="suggestion" maxlength="1000"></textarea>
    <label for="report-note">Anything else? (optional)</label>
    <textarea id="report-note" name="note" maxlength="1000"
              aria-describedby="report-note-hint"></textarea>
    <p id="report-note-hint">Please don't include names or contact details.</p>
    <div class="hp" aria-hidden="true">
      <label for="report-website">Leave this field empty</label>
      <input id="report-website" name="website" tabindex="-1" autocomplete="off" />
    </div>
    <button type="submit">Send report</button>
  </form>
</details>
<p id="report-sent" class="report-status" tabindex="-1" data-report-status="sent">…</p>
<!-- likewise report-not-found, report-rejected, report-failed -->
```

The shape is illustrative; the copy is in section 3.5. The page id comes from
the route, derived from `Astro.url.pathname` with the locale prefix removed, so
no page has to pass a prop that could be forgotten.

The honeypot uses the visually-hidden pattern (`clip-path`, 1px box), never
`display: none` (which some bots skip) and never off-screen positioning,
because an absolutely placed box is how this site has produced sideways scroll
at 320px before (see `BetaBadge.astro`). `aria-hidden` and `tabindex="-1"`
keep it away from keyboard and screen-reader users.

The status paragraphs sit **outside** the `<details>`, because the content of a
closed `<details>` is not rendered, and a status must show whether or not the
disclosure is open.

### 3.3 Submitting without losing anything

- **Homepage (no script, no state):** a plain POST. The Function answers `303`
  to the same page with a fragment, `#report-sent` and so on, and CSS `:target`
  shows that status. The homepage keeps shipping zero JavaScript.
- **Tool pages (`/glory-points`, `/classroom-groups`):** `/classroom-groups`
  keeps a teacher's roster in memory only; the page persists just two UI
  preferences. A full-page POST would wipe the class list. Both pages already
  ship a script, so `src/scripts/report-form.ts` exports
  `enhanceReportForm(form)`, which each page's own script calls. It intercepts
  submit, sends the same fields with `fetch` and `Accept: application/json`,
  shows the matching status, and never reloads the page. It resets the form
  only on `sent`, and any network failure shows `failed`. Because the footer
  component carries no `<script>`, nothing new reaches the homepage.

If a tool page's script fails to load, the plain POST still works; there is
then no roster to lose, because the tool itself does not run without its
script.

### 3.4 Accessibility

`<summary>`, both text fields, both textareas and the button have a hit area of
at least 44 × 44 px. Every field has a `<label>`, and hints are joined by
`aria-describedby`. Colours come only from the palette tokens, so the existing
computed-style contrast guards apply. Each input sets `width: 100%` with
`box-sizing: border-box`, because a text input's intrinsic width is what pinned
`#cg-form` wide at 320px in the past. Status paragraphs carry `role="status"`.

### 3.5 Copy (English source, **for operator approval before translation**)

A new `report` section in `src/lib/i18n/site.ts`, machine-drafted for id, zh, vi
and th like every other string. They are BETA like everything else, and they
are reportable themselves.

| Key                      | English                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `report.open`            | Report a translation problem                                                                                      |
| `report.intro`           | Reports go to Shyden Ltd and are deleted once they have been dealt with.                                          |
| `report.quoteLabel`      | Which words are wrong?                                                                                            |
| `report.quoteHint`       | Start typing and choose the words from the list, or copy them from the page.                                      |
| `report.suggestionLabel` | What should it say? (optional)                                                                                    |
| `report.noteLabel`       | Anything else? (optional)                                                                                         |
| `report.noteHint`        | Please don't include names or contact details.                                                                    |
| `report.honeypotLabel`   | Leave this field empty                                                                                            |
| `report.send`            | Send report                                                                                                       |
| `report.sent`            | Thank you. Your report has been sent.                                                                             |
| `report.notFound`        | We couldn't find those words on this page. Choose them from the list, or copy a shorter piece without any names or numbers. |
| `report.rejected`        | That report couldn't be sent. Please check the form and try again.                                                |
| `report.failed`          | Something went wrong and your report wasn't sent. Please try again later.                                        |

## 4. Pages and their strings

A page's **reportable strings** are the catalogue sections it reads, plus the
shared chrome:

| Page id            | Sections                                                          | Measured 2026-09-23, each beta locale |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------- |
| `home`             | `site.home` + chrome                                              | 36 keys, 36 forms                     |
| `glory-points`     | `site.glory` + chrome                                             | 25 keys, 25 forms                     |
| `classroom-groups` | the tool catalogue (`getStrings`) + chrome                        | 193 keys, 196 forms                   |

**Chrome** is every top-level section of the site catalogue except the page
sections (`home`, `glory`) and `notFound`, which only the English-footed 404
renders. So a section added to the header or footer later is included without
anyone remembering to add it, and the new `report` section is included too.
The counts above predate `report`, which adds 13 keys to every page.

These are the facts the table rests on: `HomePage.astro` reads
`getSiteStrings(lang).home`, `GloryPointsPage.astro` reads `.glory`, and
`ClassroomGroupsPage.astro` reads `getStrings(lang)`. The tool strings are
injected by script at runtime, so they are absent from static HTML
(`copy-reaches-a-page.spec.ts`), yet a visitor sees them all the same.

### 4.1 Display forms

Each string is parsed with the existing `parseMessage` (`message.ts`, #136).
Every `plural` or `select` branch becomes its own **form**, and every slot
(`{name}`, `#`) is shown as `…` (U+2026). Measured across all four beta
locales, no key has more than **3** forms, so there is no combinatorial
blow-up.

### 4.2 One home

`src/lib/report.ts` (pure, site-safe) exports `reportableStrings(page, locale)`.
Both the footer's `<datalist>` and the Function's validation import it, so what
is offered and what is accepted cannot drift apart. It must not import
`back-translate.ts` or `translate.ts`, which are CLI-only (`cli-only.test.ts`
guards the site bundle; the Function bundle is added to that guard). If a leaf
walker already exists in a site-safe module it is reused, and if the only one
lives in a CLI-only module it moves to a shared site-safe module that both
import (the "one home" rule).

## 5. Matching a quote

Both the quote and every form are **normalised** first: NFC; zero-width
characters (U+200B–U+200D, U+2060, U+FEFF) removed; every Unicode space
(including NBSP) mapped to U+0020; whitespace runs collapsed; typographic
quotes and apostrophes folded to ASCII; trimmed; lower-cased with
`toLocaleLowerCase(locale)`.

A normalised quote **matches** a key when, for at least one of that key's
forms, one of the following holds:

1. **Exact:** the quote equals the form. This is the type-ahead path.
2. **A piece of fixed wording:** the quote is at least 2 characters and lies
   wholly inside one literal run of the form, meaning the text between two
   slots.
3. **A whole rendered message:** the form, with each slot as a non-empty
   wildcard, matches the entire quote. This covers a pasted error message with
   real numbers in it.

The report stores **every** matching key, usually one. A quote that matches
nothing is `not-found`. A quote that spans a slot without being the whole
message (for example _"You have 30 students"_ out of _"There is no number 7.
You have 30 students."_) does not match, and the `not-found` copy tells the
visitor what to do instead. This is deliberate, because a slot can hold any
text, so fuzzier matching would accept almost anything.

## 6. The endpoint

`functions/api/report/index.js` (`/api/report`) and
`functions/api/report/health.js` (`/api/report/health`) are ESM plumbing only,
like `_middleware.js`. All the logic lives in `src/lib/report.ts`.

### 6.1 `POST /api/report`, checked in this order

| #   | Check                                                                          | Outcome, and what is stored          |
| --- | ------------------------------------------------------------------------------ | ------------------------------------ |
| 1   | Method is POST (any other method: `405`, `Allow: POST`)                        | nothing                              |
| 2   | `Origin` is present and equals the request's own origin                        | else `403`, nothing                  |
| 3   | `Content-Type` is `application/x-www-form-urlencoded`                          | else `415`, nothing                  |
| 4   | Body is at most 64 KiB                                                         | else `413`, nothing                  |
| 5   | Honeypot `website` is empty                                                    | else `sent`, **nothing stored**      |
| 6   | `locale` is a beta locale and `page` is a known page id                        | else `400`, nothing                  |
| 7   | `quote` is 1–1000 characters; `suggestion` and `note` are 0–1000              | else `rejected`, nothing             |
| 8   | `quote` matches a string on that page in that locale (section 5)               | else `not-found`, nothing            |
| 9   | Insert succeeds                                                                | `sent`, one row; else `failed`       |

Lengths are counted in UTF-16 code units, the unit HTML's `maxlength` uses, so
a submission the browser allows is never refused for its length.

**The body cap changed from the approved design's 8 KB.** The form is
urlencoded, so each UTF-8 byte of a non-ASCII character is sent as `%XX`: a Thai
character is 9 bytes on the wire, and one outside the BMP is 12. Three fields
of 1,000 characters is therefore up to about 36 KB. 64 KiB clears that with
room for the hidden fields.

**Redirect mode** (the default): `303`, with a `Location` built only from the
checked `locale` and `page` through `localisePath`, plus `#report-<outcome>`,
for example `/vi/classroom-groups#report-sent`. Nothing the visitor typed
reaches a header. Check 6 cannot build a safe target, so it answers a plain
`400`.

**JSON mode** (`Accept: application/json`, the tool-page script):
`{"outcome":"sent"}` with `200`; `not-found` `422`; `rejected` and check 6
`400`; `failed` `503`; checks 1–4 keep their own codes.

Every response carries `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`, because `_headers` does not apply to
Function responses.

### 6.2 `GET /api/report/health`

This runs `SELECT name FROM pragma_table_info('reports')` and compares the
result with the migration's column set. It answers `200 {"ok":true}` when they
match and `503 {"ok":false}` when the binding is missing, the table is absent
or the columns differ. It proves the binding **and** the migration on dev and
prod without writing a row. It returns no counts and no content.

On dev, both routes sit behind the existing Basic Auth middleware
(`functions/_middleware.js`) like every other path, and the dev sanity suite
already authenticates. On prod, that middleware is a no-op.

### 6.3 Logging

On `failed`, `console.error` records the error's name and message only. It
never records the quote, suggestion, note, or any header. A unit test holds
this.

## 7. Data

```sql
-- migrations/0001_reports.sql
CREATE TABLE reports (
  id          TEXT PRIMARY KEY NOT NULL,   -- crypto.randomUUID()
  received_at TEXT NOT NULL,               -- ISO 8601, UTC, the Function's clock
  locale      TEXT NOT NULL,
  page        TEXT NOT NULL,
  quote       TEXT NOT NULL CHECK (length(quote) BETWEEN 1 AND 1000),
  keys        TEXT NOT NULL,               -- JSON array of matched catalogue keys
  suggestion  TEXT NOT NULL DEFAULT '' CHECK (length(suggestion) <= 1000),
  note        TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000)
);
```

SQLite's `length()` counts code points, which is never more than UTF-16 code
units, so the constraints can never refuse a row the Function accepted. They
are defence in depth, not the check itself. Every write uses a prepared
statement with bound parameters.

**Kept until actioned.** A row exists only while its report is pending, and
dealing with a report deletes it. There is no status column, so nothing is ever
kept "just in case". The runbook (`docs/runbooks/translation-reports.md`) holds
exactly these statements for the D1 console:

```sql
SELECT id, received_at, locale, page, quote, keys, suggestion, note
  FROM reports ORDER BY received_at;
DELETE FROM reports WHERE id = ?;   -- once the report has been dealt with
```

It also records one rule. A ticket raised from a report goes into a **public**
repository, so it carries the locale, the key and, once reviewed, the suggested
wording. It never carries the note.

## 8. Security and privacy

| Threat                             | Control                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| Cross-site form posts, drive-by bots | Origin check (403); honeypot; the WAF rule                                             |
| Junk content                       | Quote must match real page text; length caps; body cap                                   |
| Volume, cost                       | WAF rule; D1 free-tier limits return errors, never charges                              |
| SQL injection                      | Prepared statements only                                                                 |
| Header injection, open redirect    | `Location` built from checked values only                                                |
| Stored XSS                         | Reports are never rendered by the site; review happens in the Cloudflare dashboard      |
| Personal data                      | No contact fields; no IP, cookie or user agent stored; a hint against names in the note  |
| Logs                               | No visitor text in any log line (6.3)                                                    |
| Framing                            | Unchanged: `X-Frame-Options: DENY` on every page                                         |

## 9. Tooling and configuration

**wrangler becomes an exact-pinned devDependency** (operator, 2026-09-23). Both
deploy workflows currently run `npm install -g wrangler@4`, so any 4.x can
arrive at deploy time and bundle the Function differently from the last deploy
of the same commit. The version pinned is whatever `wrangler@4` resolves to
when the plan runs. The workflows switch to the locked copy after `npm ci`;
Dependabot's existing npm ecosystem then covers it, and no global install
remains (a guard asserts this).

**Operator setup (Cloudflare, which an agent session cannot reach).** Steps 1–2
are needed before #97's PR merges, because dev verification calls the health
check and fails closed without them. Step 3 is needed before the prod release.

1. `npx wrangler d1 create shyden-reports-dev`, then
   `npx wrangler d1 create shyden-reports`, then apply
   `migrations/0001_reports.sql` to each with
   `npx wrangler d1 execute <name> --remote --file migrations/0001_reports.sql`.
2. Pages → `shyden-site-dev` → Settings → Bindings → D1 → variable `REPORTS` →
   `shyden-reports-dev`. The same for `shyden-site` → `shyden-reports`.
3. Security → WAF → Rate limiting rules: when `http.request.uri.path` equals
   `/api/report`, counted per IP, more than 2 requests in 10 s → Block for 10 s.

## 10. Testing

TDD: each new export starts as a throwing stub, and every test is seen failing
on its own assertion before any implementation. Any test that passes against a
stub is a finding.

- **Unit (Vitest):** `reportableStrings` against the measured counts, and
  derived. Normalisation: NFC against NFD, zero-width characters, NBSP,
  typographic quotes, case. Matching: all three rules, a slot-spanning
  fragment, multiple keys, 1 and 2 characters. Every check in 6.1 at its
  boundary (1000 and 1001; 64 KiB and one byte more; empty; whitespace only;
  emoji; control characters). The handler is called directly with real
  `Request` objects; the D1 it is given is covered by the next bullet.
- **Functions runtime (Playwright, new `playwright.functions.config.ts`):**
  the real Function on workerd through `wrangler pages dev`, with a local D1
  that has the real migration applied.
  - The homepage with JavaScript **disabled** posts and lands on
    `#report-sent`, and the row is read back from the local database.
  - `/vi/classroom-groups` with a roster typed in submits a report, and the
    **roster is still there** afterwards. This is the hazard in 3.3.
  - A cross-origin POST is refused, and a quote that matches nothing lands on
    `#report-not-found` with no row written.
  - These run as steps inside the existing required `build-and-test` job, so
    they gate without any change to branch protection.
- **E2E against `dist/`** (existing projects): the disclosure is present in
  every beta locale on every page and absent in English, both derived; each
  `<datalist>` equals `reportableStrings(page, locale)` exactly, as a set;
  keyboard reachable; 44px; AA contrast; no horizontal scroll at 320px with the
  disclosure open, in every locale; each `#report-*` status is visible
  (`toBeVisible` + `toHaveText`) when targeted, and the others are
  `toHaveCount(1)` + `toBeHidden`; the homepage still ships zero JavaScript.
  **Completeness:** every catalogue string found in a built page's HTML is in
  that page's reportable set, so a page that starts reading a new section
  without the table in section 4 fails.
- **Dev, after deploy (`dev-sanity.spec.ts`):** the health check returns 200,
  and one real browser submission reaches `#report-sent`. That writes one row
  per dev deploy, in the dev database only, with the note
  `automated dev check <sha>` so it is recognisable.
- **Prod (`prod-sanity.spec.ts`):** the health check only. Nothing is ever
  written in production by automation.
- **Visual:** the footer grows in beta-locale pages that have baselines, so
  those baselines are recaptured in the pinned container, reviewed old against
  new, then compared with nothing written.

**Mutations, each seen red then restored green, with the whole file run each
time:** drop the `isBetaLocale` gate (English shows the form); gate it to `vi`
alone; remove a section from the page table; accept a quote that matches
nothing; store when the honeypot is filled; remove the Origin check; build
`Location` from the `Referer`; raise a length cap to `Infinity`; swap two JSON
status codes; answer the health check without querying; log the quote on
`failed`; remove `preventDefault` from the tool-page script (the roster test
goes red); remove the `:target` rule; put the tool-page script in the footer
(the zero-JS guard goes red); shrink `<summary>` below 44px; give the quote
input `width: 400px` (the 320px guard goes red).

## 11. Assumptions, measured first in the plan

1. wrangler's Pages Functions bundler follows the Function's imports into
   `src/lib/*.ts`, and the i18n modules bundle cleanly for workerd (no Node
   APIs). **Fallback:** a build step that generates the reportable-string table
   as a JavaScript module the Function imports.
2. `wrangler pages dev` can bind a local D1 and apply the migration **without**
   a root wrangler config file. A root config would become the Pages projects'
   source of truth and displace the dashboard bindings of **both** projects,
   so a config file, if one is needed, lives under `tests/`.
3. `Intl.Segmenter` and `String.prototype.normalize` behave the same in workerd
   as in Node 24. The "2 characters" in rule 2 counts graphemes where that
   holds, and code points otherwise.
4. `:target` on the status paragraphs works in all five engines on the
   Playwright matrix.
5. D1 accepts the `CHECK` constraints in section 7 and the
   `pragma_table_info('reports')` query the health check uses. **Fallback:**
   drop the constraints, which are defence in depth only, and read
   `sqlite_schema` instead.

## 12. Acceptance criteria, for the #97 body

1. [x] The route and its sub-decisions are chosen and recorded (#97 comments
   of 2026-09-11 and 2026-09-23).
2. In every beta locale (derived) on every page with a footer, a "Report a
   translation problem" disclosure sits beside the BETA notice. It is absent
   in English.
3. The quote field suggests exactly that page's strings in that locale, and
   the Function accepts only quotes that match them (section 5). A stored
   report carries the locale, the page, the quote and every matched key.
4. Submitting never loses anything on the page. The homepage returns to itself
   with a visible status, and the tool pages submit in place, so a typed
   roster survives.
5. Spam: honeypot, Origin check, strict validation and size caps are each
   unit-tested, and the WAF rule is documented for the operator.
6. No personal data: no contact fields, and no IP, cookie or user agent stored.
   No visitor text appears in any log line.
7. Reports live in D1 (`REPORTS`) and are kept until actioned (deleted on
   action). The runbook documents listing and deleting.
8. `GET /api/report/health` proves the binding and the schema. Both the dev
   and prod sanity suites call it, and dev also submits one real report.
9. wrangler is an exact-pinned devDependency that the deploy workflows use,
   and no floating global install remains.
10. The form is keyboard reachable, has touch targets of at least 44px, meets
    WCAG AA, and causes no horizontal scroll at 320px when open, in every
    locale.
11. No third-party request is added.
12. The English copy in 3.5 is approved by the operator before translation.
13. Mutation-verified both ways (section 10).
