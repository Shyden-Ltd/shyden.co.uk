# Translation reports — runbook (#97)

Reports from the footer form land in the D1 table `reports`: database
`shyden-reports` on prod, `shyden-reports-dev` on dev, each bound to its Pages
project as `REPORTS`. A row exists only while its report is pending. Dealing
with a report deletes it; nothing is kept "just in case".

**A review starts with the script** (#348). It reads the table and changes
nothing, and prints each report beside the English its text was translated
from and what its suggestion says in English:

```sh
BACK_TRANSLATE_URL=http://localhost:5000 npm run reports:review shyden-reports
```

Name `shyden-reports-dev` for dev. The engine is the LibreTranslate container
whose `docker run` line heads `scripts/i18n-back-translate.mjs`. Without
`BACK_TRANSLATE_URL` the script prints everything else, and each report says
no back-translation was made.

Then, in the Cloudflare dashboard's D1 console:

```sql
SELECT id, received_at, locale, page, quote, keys, suggestion, note
  FROM reports ORDER BY received_at;
-- once a report has been dealt with, with <id> replaced by its id from the SELECT
DELETE FROM reports WHERE id = '<id>';
-- dev database only: the rows the dev sanity suite writes, one per dev deploy
DELETE FROM reports WHERE note LIKE 'automated dev check %';
```

**A ticket raised from a report goes into a public repository.** It carries
the locale, the key and, once reviewed, the suggested wording. It never
carries the note.

`GET /api/report/health` answers `200 {"ok":true}` when the binding and the
table's columns match `migrations/0001_reports.sql`, and `503` otherwise. The
dev and prod sanity suites call it after every deploy.

## The rate limit (operator, before the production release)

The endpoint validates every report, but only Cloudflare can count requests
per visitor. In the dashboard, Security → WAF → Rate limiting rules:

- When `http.request.uri.path` equals `/api/report`, counted per IP, more than 2 requests in 10 s → Block for 10 s.

Then confirm which Workers plan the account is on. On Free, D1's daily limits
answer with errors, which the endpoint reports as `failed`. On Paid, usage
beyond the included amount is billed, and this rule is the only cap on cost.
