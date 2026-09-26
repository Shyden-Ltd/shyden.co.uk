# Translation reports — runbook (#97)

Reports from the footer form land in the D1 table `reports`: database
`shyden-reports` on prod, `shyden-reports-dev` on dev, each bound to its Pages
project as `REPORTS`. A row exists only while its report is pending. Dealing
with a report deletes it; nothing is kept "just in case".

Run these in the Cloudflare dashboard's D1 console.

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
