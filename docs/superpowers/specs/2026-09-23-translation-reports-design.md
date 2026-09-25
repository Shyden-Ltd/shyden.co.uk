# Translation reports — design (#97)

**Status:** IN REVIEW. It is reviewed in passes until a pass finds nothing,
then self-approved (operator, 2026-09-24: _"review the plan on a /loop until
there's no findings, then approve it. do this for all future plans"_). The
passes are logged in section 13. No plan or code exists yet.
On 2026-09-23 the design was put to him in four parts, each with its content in
the question itself, and "Looks right" was recorded for all four. That was
needed because an earlier "approval", of a design shown only in a preview
panel he could not see, turned out not to be his.
**Ticket:** #97. **Decisions:** #97 comments of 2026-09-10, 2026-09-11 and
2026-09-23 (issuecomment-5788975282), plus the two answers given after that
comment (the string picker and wrangler, the last two rows of section 2).

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
renders its footer in English and so carries no form. That leaves one gap on
purpose: the 404 shows its `notFound` copy in every language at once, so the
translated `notFound` strings are the only visitor-facing copy with no report
route. The page is served for any unknown path, so it has no locale to post.
The gap is proposed as a follow-up ticket rather than solved here.

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
    <datalist id="report-strings"><!-- this page's strings, section 4 --></datalist>
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
the route, derived from `Astro.url.pathname` with the locale prefix and any
trailing slash removed, so no page has to pass a prop that could be forgotten.
The empty path is `home`. A path that is not in section 4's table renders no
form, and the E2E presence check (section 10) walks every built beta-locale
page and fails on one with a footer and no form, so a new page cannot go
without one quietly.

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
  shows that status. The homepage keeps its one script, the inline theme
  script (#142), and gains nothing (`theme-script.spec.ts` pins that
  inventory on every built page).
- **Tool pages (`/glory-points`, `/classroom-groups`):** `/classroom-groups`
  keeps a teacher's roster in memory only; the page persists just two UI
  preferences. A full-page POST would wipe the class list. Both pages already
  ship a script, so `src/scripts/report-form.ts` exports
  `enhanceReportForm(form)`, which each page's own script calls. It intercepts
  submit, sends the same fields with `fetch` and `Accept: application/json`,
  shows the matching status and moves focus to it, as the fragment does on
  the homepage, and never reloads the page. It resets the form
  only on `sent`, and any network failure shows `failed`. Because the footer
  component carries no `<script>`, nothing new reaches the homepage.

If a tool page's script fails to load, the plain POST still works; there is
then no roster to lose, because the tool itself does not run without its
script.

### 3.4 Accessibility

`<summary>`, the quote field, both textareas and the button have a hit area of
at least 44 × 44 px. Every field has a `<label>`, and hints are joined by
`aria-describedby`. Colours come only from the palette tokens, so the existing
computed-style contrast guards apply. Each input sets `width: 100%` with
`box-sizing: border-box`, because a text input's intrinsic width is what pinned
`#cg-form` wide at 320px in the past. Status paragraphs carry `role="status"`
and `tabindex="-1"`. A live region does not reliably announce text that was
already in it and only becomes visible, so the status is announced by moving
focus to it: the fragment does that on the homepage (navigating to a fragment
focuses a focusable target), and the tool-page script does it explicitly.

### 3.5 Copy (English source, **approved by the operator on 2026-09-23**)

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

| Page id            | Sections                                                          | Measured 2026-09-25, each beta locale |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------- |
| `home`             | `site.home` + chrome                                              | 37 keys, 37 forms                     |
| `glory-points`     | `site.glory` + chrome                                             | 29 keys, 29 forms                     |
| `classroom-groups` | the raw tool catalogue (`Catalogue`, as in `id.ts`) + chrome      | 197 keys, 200 forms                   |

**Chrome** is every top-level entry of the site catalogue except the page
sections (`home`, `glory`) and `notFound`, which only the English-footed 404
renders. That takes in the sections (`nav`, `footer`, `language`) and the bare
strings (`menuLabel`, `themeDarkMode`, `skipToContent`) alike. So an entry
added to the header or footer later is included without anyone remembering to
add it, and the new `report` section is included too. The counts above predate
`report`, which adds 13 keys to every page. They moved between 2026-09-23 and
2026-09-25 (36/25/193 then), because #142 added `themeDarkMode` and the glory
copy grew. That is why the tests derive the sets and pin no count.

The tool strings are walked in the **raw** catalogue, never through
`getStrings`. `getStrings` compiles every message into a function (#136), so a
walker over its result that collects string leaves never sees any message at
all. Measured: 139 keys through `getStrings` against 197 in the raw
catalogue, and every missing key is a message.

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
walks the modules the site ships, and `functions/` is added to what it walks).
If a leaf walker already exists in a site-safe module it is reused, and if the
only one
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
| 5   | `locale` is a beta locale and `page` is a known page id                        | else `400`, nothing                  |
| 6   | Honeypot `website` is empty                                                    | else `sent`, **nothing stored**      |
| 7   | `quote` is 1–1000 units and not blank; `suggestion` and `note` are 0–1000     | else `rejected`, nothing             |
| 8   | `quote` matches a string on that page in that locale (section 5)               | else `not-found`, nothing            |
| 9   | Insert succeeds                                                                | `sent`, one row; else `failed`       |

Check 5 comes before the honeypot because the honeypot's decoy `sent` is a
redirect, and a redirect needs a checked `locale` and `page` to build its
target. With the honeypot first, a bot that fills it and sends a made-up
`page` would reach a redirect with nothing safe to point at.

Lengths are counted in UTF-16 code units, the unit HTML's `maxlength` uses,
after every CRLF is folded to LF. The fold matters because a textarea's
`maxlength` counts a line break as one unit, while submission sends every line
break as CRLF, so an unfolded count would refuse a note the browser allowed.
With the fold, a submission the browser allows is never refused for its
length. Stored text keeps LF. Lengths are taken on the submitted text, before
section 5's normalisation; a quote that normalises to nothing (whitespace or
zero-width characters only) is blank, and so `rejected`.

**The body cap changed from the approved design's 8 KB.** The form is
urlencoded, so each UTF-8 byte of a non-ASCII character is sent as `%XX`. A
UTF-16 code unit therefore costs at most 9 bytes on the wire: a Thai character
is one unit and 9 bytes, and a character outside the BMP is two units and 12
bytes. Three fields of 1,000 units come to at most about 27 KB, and 64 KiB
clears that with room for the hidden fields.

The browser sends `Origin` on this form's POST because the site's
`Referrer-Policy` is `strict-origin-when-cross-origin` (`public/_headers`).
Under `no-referrer`, the Fetch standard serialises a POST's `Origin` as
`null`, so check 2 would refuse every real report. The Functions-runtime tests
in section 10 submit from a real browser, so a change to that header goes red
there.

**Redirect mode** (the default): `303`, with a `Location` built only from the
checked `locale` and `page` through `localisePath`, plus `#report-<outcome>`,
for example `/vi/classroom-groups#report-sent`. The path is the form the
site's own links use. If the host adds a trailing-slash redirect, the fragment
survives it, because a redirect whose `Location` has no fragment keeps the
request's. The homepage test in section 10 lands on the fragment through
`wrangler pages dev`, and the dev submission lands on it through Cloudflare.
Nothing the visitor typed reaches a header. Check 5 cannot build a safe
target, so it answers a plain `400`.

**JSON mode** (`Accept: application/json`, the tool-page script):
`{"outcome":"sent"}` with `200` (the honeypot's decoy too); `not-found` `422`;
`rejected` and check 5 `400`; `failed` `503`; checks 1–4 keep their own codes.

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
-- dev database only: the rows the dev sanity suite writes (section 10)
DELETE FROM reports WHERE note LIKE 'automated dev check %';
```

It also records one rule. A ticket raised from a report goes into a **public**
repository, so it carries the locale, the key and, once reviewed, the suggested
wording. It never carries the note.

## 8. Security and privacy

| Threat                             | Control                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| Cross-site form posts, drive-by bots | Origin check (403); honeypot; the WAF rule                                             |
| Junk content                       | Quote must match real page text; length caps; body cap                                   |
| Volume, cost                       | WAF rule; on the Workers Free plan D1's limits return errors, never charges (plan unconfirmed, operator setup step 4) |
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
check and fails closed without them. Steps 3 and 4 are needed before the prod
release.

1. `npx wrangler d1 create shyden-reports-dev`, then
   `npx wrangler d1 create shyden-reports`, then apply
   `migrations/0001_reports.sql` to each with
   `npx wrangler d1 execute <name> --remote --file migrations/0001_reports.sql`.
2. Pages → `shyden-site-dev` → Settings → Bindings → D1 → variable `REPORTS` →
   `shyden-reports-dev`. The same for `shyden-site` → `shyden-reports`.
3. Security → WAF → Rate limiting rules: when `http.request.uri.path` equals
   `/api/report`, counted per IP, more than 2 requests in 10 s → Block for 10 s.
4. Confirm which Workers plan the account is on. On Free, D1's daily limits
   answer with errors, which the Function reports as `failed`. On Paid, usage
   beyond the included amount is billed, and the WAF rule is then the only
   cap on cost. Nothing in this spec has measured the plan.

## 10. Testing

TDD: each new export starts as a throwing stub, and every test is seen failing
on its own assertion before any implementation. Any test that passes against a
stub is a finding.

- **Unit (Vitest):** `reportableStrings` derived from the catalogues, never
  pinned to a count: every leaf of each page's sections is present, a message
  key contributes one form per branch, and a key added to a chrome entry
  appears on every page. Normalisation: NFC against NFD, zero-width
  characters, NBSP, typographic quotes, case. Matching: all three rules, a
  slot-spanning fragment, multiple keys, 1 and 2 characters. Every check in
  6.1 at its boundary (1000 and 1001; 64 KiB and one byte more; empty;
  whitespace only; emoji; control characters; a note of 1000 units that
  arrives as more because its line breaks are CRLF). The order of checks 5
  and 6: a filled honeypot with an unknown `page` answers `400`, never a
  redirect. The handler is called directly with real `Request` objects; the D1
  it is given is covered by the next bullet.
- **Functions runtime (Playwright, new `playwright.functions.config.ts`):**
  the real Function on workerd through `wrangler pages dev`, with a local D1
  that has the real migration applied.
  - The homepage with JavaScript **disabled** posts and lands on
    `#report-sent`, and the row is read back from the local database.
  - `/vi/classroom-groups` with a roster typed in submits a report, and the
    **roster is still there** afterwards. This is the hazard in 3.3.
  - A cross-origin POST is refused, and a quote that matches nothing lands on
    `#report-not-found` with no row written.
  - These run as a new `functions` job in `ci.yml`, and `build-and-test`
    gains it in its `needs`. `build-and-test` has had no steps of its own since
    #163. It is the aggregate that branch protection and
    `scripts/deploy-gate.mjs` read, and it fails unless every job it needs
    succeeded. A job it needs therefore gates with no change to branch
    protection, and `pipeline-wiring.test.ts` derives that rule, so it goes
    red if the job is added without the `needs` entry.
- **E2E against `dist/`** (existing projects): the disclosure is present in
  every beta locale on every page and absent in English, both derived from
  the pages actually built into `dist/` (the presence check in 3.2); each
  `<datalist>` equals `reportableStrings(page, locale)` exactly, as a set;
  keyboard reachable; 44px; AA contrast; no horizontal scroll at 320px with the
  disclosure open, in every locale; each `#report-*` status is visible
  (`toBeVisible` + `toHaveText`) and focused (`toBeFocused`) when targeted,
  and the others are `toHaveCount(1)` + `toBeHidden`; the homepage's script
  inventory is still the inline theme script alone (`theme-script.spec.ts`).
  **Completeness:** every catalogue string found on a built page is in that
  page's reportable set, so a page that starts reading a new section without
  the table in section 4 fails. The strings are read from the rendered DOM
  after the page's script has run, never from the static HTML, because the
  tool strings arrive by script (section 4) and a static read would never
  find one. The scan goes through `searched(...)`, so a scan that finds
  nothing fails rather than passing.
- **Dev, after deploy (`dev-sanity.spec.ts`):** the health check returns 200,
  and one real browser submission reaches `#report-sent`. That writes one row
  per dev deploy, in the dev database only, with the note
  `automated dev check <sha>` so it is recognisable. Those rows are never
  "actioned", so the runbook carries the one statement that clears them:
  `DELETE FROM reports WHERE note LIKE 'automated dev check %';`, run against
  the dev database only.
- **Prod (`prod-sanity.spec.ts`):** the health check only. Nothing is ever
  written in production by automation.
- **Both deployed-site tests are `@deployed-only`** (#335). A pull request
  runs `tests/dev` and `tests/prod` against a preview of its own `dist/`
  (`sanity-on-build`), and a preview runs no Pages Function, so the health
  check and the dev submission cannot pass there. Each carries
  `tag: '@deployed-only'` and a `deployed-only` annotation giving that reason,
  as `sanity-on-build.test.ts` requires.
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
(the script-inventory guard in `theme-script.spec.ts` goes red); shrink
`<summary>` below 44px; give the quote input `width: 400px` (the 320px guard
goes red); move the honeypot check above check 5; count a note's length
before folding CRLF; drop the tool-page script's focus move (`toBeFocused`
goes red); set `Referrer-Policy: no-referrer` (the Functions-runtime
submission goes red on check 2).

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
4. `:target` on the status paragraphs, and focus landing on the targeted
   `tabindex="-1"` paragraph after the redirect, both work in all five
   engines on the Playwright matrix. **Fallback for focus**, if an engine does
   not move it: the status is still shown by `:target` and still carries
   `role="status"`, and the `toBeFocused` assertion is skipped for that engine
   with an annotation giving the measured reason. The homepage gains no
   script to force it.
5. D1 accepts the `CHECK` constraints in section 7 and the
   `pragma_table_info('reports')` query the health check uses. **Fallback:**
   drop the constraints, which are defence in depth only, and read
   `sqlite_schema` instead.
6. `wrangler pages dev` applies `dist/_headers` to the pages it serves, so
   the `Referrer-Policy` mutation in section 10 reaches the browser there.
   **Fallback:** a unit test reads `public/_headers` and pins a
   `Referrer-Policy` under which a same-origin POST keeps its `Origin`, and
   that test is the one that goes red.

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
   with a visible status that takes focus, and the tool pages submit in place
   and focus the status the same way, so a typed roster survives.
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
12. [x] The English copy in 3.5 is approved by the operator before translation
    (2026-09-23).
13. Mutation-verified both ways (section 10).

## 13. Review log

Each pass runs the mechanical checks and then reads the whole document. The
checks are: every path, export and command it names exists on `develop`; every
measured number is re-measured; every rule it cites from `CLAUDE.md` still
holds; and every section agrees with the others.

**Pass 1 (2026-09-25, against `develop` at 9782fa4): 11 findings, all fixed.**

1. The status still said "waiting for the operator's review". Plans and specs
   have been self-approved after review passes since 2026-09-24.
2. "The homepage keeps shipping zero JavaScript" (3.3, 10 twice) went stale
   with #142, which gave every page the inline theme script. The guard it
   relies on is `theme-script.spec.ts`'s inventory.
3. The counts in section 4 were stale: 36/25/193 keys are now 37/29/197, and
   the forms are 37/29/200. The unit tests had pinned them; they now derive
   the sets instead.
4. "Chrome is every top-level section" missed the bare top-level strings
   (`menuLabel`, `themeDarkMode`, `skipToContent`).
5. The tool strings named `getStrings`, whose result hides every message
   behind a function: 139 keys against 197. The raw catalogue is named now.
6. Checks 5 and 6 were in the wrong order: the honeypot's decoy redirect came
   before `locale` and `page` were checked, so it had no safe target.
7. `maxlength` counts a textarea line break as one unit and submission sends
   it as CRLF, so an unfolded length check refused notes the browser allowed.
   The body cap's worst case was also 36 KB where it is 27 KB.
8. Section 10 put the Functions tests "as steps inside `build-and-test`",
   which has had no steps of its own since #163. It is a `functions` job that
   `build-and-test` needs now.
9. The dev and prod health checks, and the dev submission, would run against
   `sanity-on-build`'s preview (#335), which runs no Function. They are
   `@deployed-only` now, and the dev rows have a runbook statement to clear
   them.
10. 3.4 named "both text fields" where the form has one, and a status that
    only becomes visible is not reliably announced by a live region. Focus now
    moves to the status, as a new assertion, a new mutation and an assumption
    with a fallback.
11. The Origin check silently depended on `Referrer-Policy`: under
    `no-referrer` a POST's `Origin` is `null`, and every real report would be
    refused. The dependency is stated in 6.1 and has a mutation.

**Pass 2 (2026-09-25, a full read after pass 1's fixes): 8 findings, all
fixed.** Checked again: the 404's footer language (`404.astro`), the
preferences the tool page stores (`classroom-groups.ts`), and how
`cli-only.test.ts` works.

1. The `<datalist>` comment in 3.2 pointed at section 5 (matching) for the
   page's strings, which are section 4.
2. 3.2 called the "page with a footer has no form" check the completeness
   check, a name section 10 gives a different test. It is the presence check
   now, derived from the pages built into `dist/`, and section 10 says so.
3. The 404 shows `notFound` in every language, so its translated copy is the
   one visitor-facing copy with no route. 3.1 states the gap and proposes a
   follow-up, where before it implied the copy was English only.
4. Check 7 said "characters" where every other length is in UTF-16 units.
5. Nothing said whether lengths are taken before or after normalisation, or
   what a whitespace-only quote gets. Lengths are taken before it, and a
   blank quote is `rejected`.
6. "The Function bundle is added to that guard" did not match how
   `cli-only.test.ts` works: it walks the modules the site ships, not a
   bundle. It says `functions/` is added to that walk now.
7. The `Referrer-Policy` mutation assumed that `wrangler pages dev` serves
   `_headers`. That is assumption 6 now, with a fallback.
8. The section 10 E2E bullet did not say the presence set is derived from
   `dist/`.

**Pass 3 (2026-09-25, a full read after pass 2's fixes, with every path the
spec names checked on `origin/develop`, since this branch is 128 commits behind
it): 8 findings, all fixed.**

1. The header said both post-comment answers were in section 9, but the
   string picker is not. It points at section 2's last two rows now.
2. A pass-2 edit left a broken line wrap in 4.2.
3. The redirect relied on the fragment surviving a trailing-slash redirect by
   the host, and did not say so. 6.1 states it now, with the two tests that
   prove it.
4. "D1 free-tier limits return errors, never charges" is true only on the
   Workers Free plan, which nobody has confirmed. Section 8 says so now, and
   operator setup gains step 4.
5. The completeness check read "a built page's HTML". The tool strings are
   not in the HTML, so for `/classroom-groups` it could never find one: a
   vacuous guard. It reads the rendered DOM after the script has run, through
   `searched(...)`.
6. AC 4 did not carry pass 1's focus requirement.
7. The operator-setup timing sentence did not cover the new step 4.
8. The mechanical path check ran against this branch first, where
   `theme-script.spec.ts` and `sanity-on-build.test.ts` do not exist yet. Both
   were re-checked on `origin/develop`, where they do. `develop` is merged into
   this branch before the plan is written.

**Pass 4 (2026-09-25, a full read on this branch after `develop` was merged
in, at f15e1f7): 1 finding, fixed.** Every path the spec names now exists here,
except the seven files it creates. Every export it names exists; the check was
run twice, because macOS `git grep -E` has no `\b` and the first run reported
all six missing. The counts in section 4 re-measure the same. The site's own
links use `localisePath('/classroom-groups', lang)`, the form 6.1's redirect
builds.

1. A pass-3 edit left a 100-character line in 6.1.
