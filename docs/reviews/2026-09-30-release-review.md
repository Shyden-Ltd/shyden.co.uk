# Pre-release review ledger (#390)

Derived by `ledger.py` from `git diff a3a5adb1c6ae015a50fcdc391f8520c017a51159..5480797301e17bacdc6cac75b60566c5d89d9520` — 397 rows, equal to
`git diff --name-only | wc -l`. Never edit the file list by hand: re-derive it if `develop` moves.

Columns: **Review** is `—` until the file is read in full; **Mutations** is `n/n RED` (run/red).

| # | Kind | St | File | +/- | Review | Findings | Mutations |
|---|---|---|---|---|---|---|---|
| 1 | src | A | `src/components/BetaBadge.astro` | +76/-0 | — |  |  |
| 2 | src | M | `src/components/Button.astro` | +13/-5 | — |  |  |
| 3 | src | A | `src/components/Flag.astro` | +59/-0 | — |  |  |
| 4 | src | M | `src/components/Footer.astro` | +32/-30 | — |  |  |
| 5 | src | M | `src/components/Header.astro` | +45/-42 | — |  |  |
| 6 | src | A | `src/components/LanguageSwitcher.astro` | +200/-0 | — |  |  |
| 7 | src | A | `src/components/Marquee.astro` | +103/-0 | — |  |  |
| 8 | src | A | `src/components/PhoneFrame.astro` | +100/-0 | — |  |  |
| 9 | src | A | `src/components/ReportForm.astro` | +187/-0 | — |  |  |
| 10 | src | D | `src/components/ServiceCard.astro` | +0/-22 | — |  |  |
| 11 | src | A | `src/components/ThemeSwitch.astro` | +78/-0 | — |  |  |
| 12 | src | M | `src/components/WorkCard.astro` | +36/-25 | — |  |  |
| 13 | src | M | `src/components/pages/ClassroomGroupsPage.astro` | +594/-205 | — |  |  |
| 14 | src | M | `src/components/pages/GloryPointsPage.astro` | +24/-9 | — |  |  |
| 15 | src | M | `src/components/pages/HomePage.astro` | +175/-36 | — |  |  |
| 16 | src | A | `src/env.d.ts` | +15/-0 | — |  |  |
| 17 | src | M | `src/layouts/BaseLayout.astro` | +35/-13 | — |  |  |
| 18 | src | A | `src/lib/catalogue-leaves.ts` | +39/-0 | read in full | none | 4 run: 4 RED |
| 19 | src | M | `src/lib/csv-locale.ts` | +125/-11 | diff read (all five tables, superseded words, sex and yes/no tokens, file names) | F10: sex tokens held to the roster only by literal pins: relationship test added. F12: zh `# 类：` read "Category:": now 班级; th file and class field disagreed (ชั้นเรียน/คลาส): aligned, test added. Operator decision 2026-09-30: yes/no tokens 否/có/ไม่ใช่. Stale "no type checker" docblocks corrected (F15). vi superseded comment now covers apart | L1-L10: 10/10 RED (L4 L6 L7 L8 L9 predicted GREEN, each caught by a pin not read first). CLa-CLh: 8/8 RED |
| 20 | src | M | `src/lib/csv.ts` | +59/-26 | diff read (superseded columns, message arguments) | F9: detectLocale scored en and id only, so zh/vi/th files were parsed as the page's language: fixed (derived over LOCALES) with tests | 7 run: 6 RED, CV2 RED once F9 was fixed and its test isolated |
| 21 | src | M | `src/lib/fit.ts` | +57/-0 | diff read (fontThatFits, 57 lines) | floor for unmeasured room pinned exactly (the old test asserted only finite and positive) | 8 run: 5 RED, FT1 FT2 FT8 equivalent |
| 22 | src | M | `src/lib/gloryPoints.ts` | +10/-7 | diff read (rename + locale metadata) | none | 2 run: 2 RED |
| 23 | src | M | `src/lib/grouping.ts` | +17/-2 | diff read (anonymousStudent exported) | none | 1 run: 1 RED |
| 24 | src | A | `src/lib/i18n/.translations.json` | +830/-0 | — | drafts held the wrong senses too (id "sisa makanan", "dibagi" beside a hand-corrected catalogue): corrected with every catalogue fix, so a re-seed cannot restore them |  |
| 25 | src | A | `src/lib/i18n/back-translate.ts` | +538/-0 | read in full (tranche 3) | F30 (20 test gaps); two codes in one script misreported as unreadable (fixed); F23 csvCopy reason | 67 run (44 RED); the 20 whole-suite-confirmed gaps now RED (BT48 as BT48n, BT48z); BT1 BT14 BT49 equivalent; BT59 RED |
| 26 | src | M | `src/lib/i18n/en.ts` | +359/-166 | — |  |  |
| 27 | src | A | `src/lib/i18n/feature-terms.ts` | +97/-0 | — | F11/F18/F20 guards: mix, leftovers, sound, classList, gloryPoints, bean, coin added from their controls' words (glossary awaits the operator's read) | FTa-FTh, GLc GLd: RED |
| 28 | src | A | `src/lib/i18n/flags.ts` | +115/-0 | read in full (tranche 3) | none | in lmf: FL1 FL2 equivalent (sprite and <use> share flagSymbolId); FL5 is the visual suite's |
| 29 | src | M | `src/lib/i18n/id.ts` | +152/-132 | — |  |  |
| 30 | src | M | `src/lib/i18n/index.ts` | +252/-53 | read in full (tranche 3) | F25 comments; F27 bare prefix untested, ternary built one string twice (simplified); F29 | 63 run (58 RED); IX11 RE9 RE10 GREEN over 2,924, now RED; IX4 IX13 equivalent (IX13's code removed); new IXs1 RED |
| 31 | src | A | `src/lib/i18n/label-check.ts` | +167/-0 | read in full; checkNamedLabels added | F17 guard: checkLabels' any-witness rule hid 23 sentences naming a label in other words | NLa-NLg: 6 RED, NLf GREEN (fixture carried the first rendering): fixed, NLfb RED |
| 32 | src | A | `src/lib/i18n/locales.ts` | +22/-0 | read in full (tranche 3) | none | in lmf |
| 33 | src | A | `src/lib/i18n/message.ts` | +431/-0 | read in full (tranche 3) | F21 (tests only; parser correct) | 37 run: 34 RED after F21 (was 23: MS3 MS5-8 MS11 MS12 MS14 MS14b MS20 MS35 now RED); 3 equivalent (MS22, MS39/MS40 caches) |
| 34 | src | A | `src/lib/i18n/metadata.ts` | +116/-0 | read in full (tranche 3) | F26 marquee named MVP_LOCALES, not LOCALES (fixed); F28; F25 | lmf 16 run (9 RED); MD2 and MD7 RED over the whole suite (sitemap-config, marquee); MD6 gap, RED after F28; new MD7n MF1 RED; MD8 equivalent |
| 35 | src | M | `src/lib/i18n/site.ts` | +461/-61 | translated units read (home, glory, report, nav, 404) | F20: zh/vi/th Glory result line was English's own function: each now its own. Glory currency names inconsistent in all three: operator decision 2026-09-30 (English app names, coin translated), applied; th glory lead named its input differently (F17) | GLa GLb GLc GLd: RED |
| 36 | src | A | `src/lib/i18n/th.ts` | +278/-0 | every translated unit read beside en | F11 (stateMixed equal to stateSeparated). F12 class loanword. F17: 7 sentences named Student details unlike its heading, 2 named Shuffle again unlike its button. F18: Sound off = express an opinion, Export groups a noun, Group results = company earnings, university students, "pieces", printed-from. F19: สาวๆ, เปลี่ยนมัน. All fixed | FTb NLb GLd: RED |
| 37 | src | A | `src/lib/i18n/translate.ts` | +598/-0 | read in full (tranche 3) | F22 protectTerms double-wrapped a middle term and wrapped every position for an empty one (fixed); F23 CSV sex hold-back a no-op (removed); F24 deeplDrafts added; F25; F31 walk via catalogueLeaves | 51 run (37 RED); after fixes TR4 TR5a-c TR13 TR35 TR36 TR47 TR48 RED; TR8 TR11 TR23 TR26 left with their code; TR43 equivalent; new NP1-3 CS1-2 DD1-4 9/9 RED |
| 38 | src | A | `src/lib/i18n/vi.ts` | +286/-0 | every translated unit read beside en | F11 state labels. F17: 4 sentences named Student details unlike the pinned heading. F18: Sound off = speak up, nhập khẩu/xuất khẩu (trade), Export groups a noun, list of classes x2, printed-at, number-blank lost "number". F19: hoạt hình, a capitalised state, Hàng/Dòng, slot order. All fixed | FTc FTg GLc: RED |
| 39 | src | A | `src/lib/i18n/zh.ts` | +258/-0 | every translated unit read beside en (265 keys across zh/vi/th) | F11 state labels (mixed = sorted by sex, leftover food). F17: 7 sentences named Student details unlike its heading, 2 named Shuffle again unlike its button. F18: Sound off = speak freely, 进出口 (trade), list "now open to the public", list "still in that tab", course list x3, 分班/座位, printed-from. F19: 群组, 男孩/女孩, 已恢复, 保留我所拥有的. All fixed | FTa FTf NLa FTh and seeded regressions: RED |
| 40 | src | A | `src/lib/is-record.ts` | +11/-0 | read in full | none | 2 run: 2 RED |
| 41 | src | A | `src/lib/numberSets.ts` | +217/-0 | read in full (217 lines) | NS14 NS16 NS20 NS21 untested (NS16: apart typed alone would reach the engine as the bare count): tests added | 21 run: 17 RED + 4 re-run RED |
| 42 | src | A | `src/lib/report-review.ts` | +254/-0 | read in full (254 lines) | RR12 RR18 RR21 RR22 untested: tests added. Error paths print id/locale/keys unescaped: trusted, since only the endpoint writes rows | 22 run: 17 RED + RR11 control + 4 re-run RED |
| 43 | src | A | `src/lib/report.ts` | +573/-0 | read in full (574 lines) | 8 behaviours no test observed (R1 R5 R8 R10 R22 R33 R49 R53): tests added in the review branch. WAF rate-limit rule (spec 9.3) is operator dashboard config, not proven here | 62 run: 49 RED unit + R25/R54 RED in tests/functions; R15 R31 R44 equivalent (explained in the commit); R53 re-run as R53b RED |
| 44 | src | M | `src/lib/roster.ts` | +37/-10 | diff read (LETTERS, message arguments) | none; RO1 equivalent (slice already caps) | 6 run: 5 RED, RO1 equivalent |
| 45 | src | M | `src/lib/sections.ts` | +5/-5 | diff read (message arguments) | none | 2 run: 2 RED |
| 46 | src | M | `src/lib/sexOptions.ts` | +4/-2 | diff read (message arguments) | none | 2 run: 2 RED |
| 47 | src | A | `src/lib/shytalk-brand.ts` | +54/-0 | read in full (54 lines) | F13: `edge`/`muted` used nowhere and `talk`'s hover-edge doc stale: removed/reworded; `asRgba` (homepage glow) untested: test added | B1 B2 RED; B4 GREEN over the whole suite (gap), B4b RED after the test |
| 48 | src | A | `src/lib/shytalk-showcase.ts` | +40/-0 | read in full (40 lines) | F14: docblock named a capture pass as a consumer; git log -S shows none ever existed: reworded | S1-S4: 4/4 RED |
| 49 | src | A | `src/lib/waiting-reports.ts` | +152/-0 | read in full (152 lines) | W4, W19 untested: tests added (an unanchored UUID could carry a path) | 22 run: 19 RED + W4b/W19b RED; W6 equivalent |
| 50 | src | M | `src/pages/404.astro` | +62/-20 | — |  |  |
| 51 | src | A | `src/pages/[locale]/classroom-groups.astro` | +33/-0 | — |  |  |
| 52 | src | A | `src/pages/[locale]/glory-points.astro` | +33/-0 | — |  |  |
| 53 | src | A | `src/pages/[locale]/index.astro` | +33/-0 | — |  |  |
| 54 | src | D | `src/pages/id/classroom-groups.astro` | +0/-5 | — |  |  |
| 55 | src | D | `src/pages/id/glory-points.astro` | +0/-5 | — |  |  |
| 56 | src | D | `src/pages/id/index.astro` | +0/-5 | — |  |  |
| 57 | src | M | `src/scripts/classroom-groups.ts` | +264/-51 | — | F16: the Grouping options header ignored the sex switches (live on prod too): fixed with an e2e test; TDZ comment corrected (F15) | HSa HSb: 2/2 RED (e2e, chromium) |
| 58 | src | A | `src/scripts/dom.ts` | +33/-0 | — |  |  |
| 59 | src | M | `src/scripts/glory-points.ts` | +20/-3 | — |  |  |
| 60 | src | M | `src/scripts/io-ui.ts` | +118/-30 | — |  |  |
| 61 | src | M | `src/scripts/projector.ts` | +87/-31 | — |  |  |
| 62 | src | A | `src/scripts/report-form.ts` | +90/-0 | — |  |  |
| 63 | src | M | `src/scripts/roster-ui.ts` | +95/-53 | — |  |  |
| 64 | src | A | `src/scripts/theme.inline.js` | +41/-0 | — |  |  |
| 65 | src | M | `src/styles/tokens.css` | +488/-19 | — |  |  |
| 66 | functions | M | `functions/_lib/lockdown.js` | +12/-1 | read in full; diff is JSDoc only | stale 'no API' comment corrected | n/a: no behaviour in the diff |
| 67 | functions | M | `functions/_middleware.js` | +3/-0 | read in full; diff is JSDoc only | FN3 GREEN in every pre-merge suite: #394 | FN3 GREEN, filed #394 |
| 68 | functions | A | `functions/api/report/health.js` | +12/-0 | read in full | as index.js | FN2 RED (after fix) |
| 69 | functions | A | `functions/api/report/index.js` | +13/-0 | read in full | plumbing test asserted the import only: body now pinned | FN1 RED (after fix) |
| 70 | scripts | A | `.githooks/commit-msg` | +33/-0 | — |  |  |
| 71 | scripts | A | `.githooks/pre-push` | +30/-0 | — |  |  |
| 72 | scripts | A | `scripts/back-translate-client.mjs` | +67/-0 | read in full (tranche 4) | F34 an unreachable engine printed only 'fetch failed' (ECONNREFUSED sat on cause): call() now names the request and the cause. Non-JSON refusal excerpt, method in the message, 200-not-JSON and short-answer refusals were untested | 7 run: CL4 CL5 RED before; CL1-3 CL6 GREEN now RED; CL7 (cause dropped) RED |
| 73 | scripts | A | `scripts/build-evidence-page.mjs` | +1584/-0 | — |  |  |
| 74 | scripts | A | `scripts/build-release-content.mjs` | +214/-0 | — | (not yet read in full) F35 private messageOf copy replaced (tranche 4) | OH1-class covered by the one-home rule |
| 75 | scripts | A | `scripts/closing-keywords.mjs` | +123/-0 | — |  |  |
| 76 | scripts | M | `scripts/dashboard.mjs` | +48/-86 | — |  |  |
| 77 | scripts | A | `scripts/dependabot-labels.mjs` | +194/-0 | — |  |  |
| 78 | scripts | A | `scripts/deploy-gate.mjs` | +222/-0 | — |  |  |
| 79 | scripts | A | `scripts/e2e-shards.mjs` | +366/-0 | — |  |  |
| 80 | scripts | A | `scripts/errors.mjs` | +73/-0 | read in full (tranche 4) | F35 five private copies of messageOf's line (build-release-content, signoff-status, tests/device/ios/webdriver.ts, translate.test.ts, and one this review wrote into i18n-scaffold.test.ts) now import it; one-home.test.ts rule readsACaughtMessage keeps it single, one fixture per clause | 7 run on the rule: OH1 (copy re-added) RED, OH2 (copy as a comment) GREEN as intended, OH3-OH7 (each clause dropped) RED |
| 81 | scripts | A | `scripts/evidence-files.mjs` | +124/-0 | — |  |  |
| 82 | scripts | A | `scripts/evidence-signoff.mjs` | +132/-0 | — |  |  |
| 83 | scripts | A | `scripts/i18n-back-translate.mjs` | +122/-0 | read in full (tranche 4) | F33 the stand-in harness asserted refusals only: score, once-per-locale sending, engine name, printed review, cannot-be-believed header, progress line and error prefix now pinned. Private messageOf copy replaced by the import; its new errors.mjs import was outside back-translation.yml path filter (pipeline-wiring.test.ts caught it in the whole suite), now watched | 12 run: 3 RED before (BS8 BS10 BS11), 8 GREEN now RED (BS1-6 BS9, BS12 new); BS7 GREEN, residual: no catalogue has a slot-only translation, so the empty-text filter guards a case today's data cannot reach |
| 84 | scripts | A | `scripts/i18n-scaffold.mjs` | +200/-0 | read in full (tranche 4) | F32 rendering untested past the argv refusal, incl. the overwrite refusal its docblock calls the important one: render throws, renderCatalogue exported, main driven in a scratch cwd. Bug: drafts and the locale read through Object.prototype ('constructor' rendered as undefined; i18n:scaffold -- constructor crashed in Intl.PluralRules), now Object.hasOwn. plainKey docblock inverted | 19 run: 19 RED (SC1-SC17, SC2a/b, SC5a/b), re-run after the anchored-presence fix: 19 RED |
| 85 | scripts | A | `scripts/i18n-translate.mjs` | +280/-0 | read in full (tranche 3) | F24 drafts paired by index with no count check (deeplDrafts); misleading needs-a-human report removed; F25 | none: network wiring; its decisions moved to deeplDrafts (DD1-4 RED) |
| 86 | scripts | A | `scripts/install-hooks.mjs` | +86/-0 | — |  |  |
| 87 | scripts | A | `scripts/release-inventory.mjs` | +299/-0 | — |  |  |
| 88 | scripts | A | `scripts/release-map.mjs` | +165/-0 | — |  |  |
| 89 | scripts | A | `scripts/reports-review.mjs` | +132/-0 | read in full (132 lines) | none | 5 run: 5 RED |
| 90 | scripts | A | `scripts/signoff-status.mjs` | +113/-0 | — | (not yet read in full) F35 private messageOf copy replaced (tranche 4) | OH1 RED |
| 91 | scripts | M | `scripts/test-devices.mjs` | +238/-69 | — |  |  |
| 92 | scripts | A | `scripts/test-e2e.mjs` | +842/-0 | — |  |  |
| 93 | scripts | A | `scripts/upload-evidence-assets.mjs` | +237/-0 | — |  |  |
| 94 | scripts | A | `scripts/visual.mjs` | +169/-0 | — |  |  |
| 95 | scripts | A | `scripts/waiting-reports.mjs` | +196/-0 | read in full (196 lines) | S2 S3 S6 S9 S12 untested; S6 was real: a GitHub 403 in JSON printed 'Posted.' and exited 0. Tests added | 16 run: 11 RED + 5 re-run RED |
| 96 | workflow | A | `.github/dependabot.yml` | +110/-0 | — |  |  |
| 97 | workflow | A | `.github/workflows/back-translation.yml` | +82/-0 | — |  |  |
| 98 | workflow | M | `.github/workflows/ci.yml` | +394/-9 | — |  |  |
| 99 | workflow | A | `.github/workflows/deploy-dev.yml` | +203/-0 | — |  |  |
| 100 | workflow | R from '.github/workflows/release-prod.yml' | `.github/workflows/deploy-prod.yml` | +73/-26 | — |  |  |
| 101 | workflow | A | `.github/workflows/pr-body.yml` | +100/-0 | — |  |  |
| 102 | workflow | D | `.github/workflows/release-dev.yml` | +0/-114 | — |  |  |
| 103 | workflow | M | `.github/workflows/release-tag.yml` | +3/-2 | — |  |  |
| 104 | workflow | M | `.github/workflows/rollback.yml` | +77/-14 | — |  |  |
| 105 | workflow | A | `.github/workflows/waiting-reports.yml` | +56/-0 | read in full | Y5: 14 of 15 checkouts across the workflows persisted the token: #395 (PR #396) | 7 run: 6 RED, Y5 GREEN, filed #395 |
| 106 | config | A | `.env.example` | +12/-0 | — |  |  |
| 107 | config | M | `.gitignore` | +6/-0 | — |  |  |
| 108 | config | A | `.npmrc` | +8/-0 | — |  |  |
| 109 | config | M | `.prettierignore` | +1/-0 | — |  |  |
| 110 | config | M | `astro.config.mjs` | +19/-1 | — |  |  |
| 111 | config | A | `docker/libretranslate/Dockerfile` | +18/-0 | — |  |  |
| 112 | config | A | `ithout)\[\[:space:\]\]\|'(zznevermatch)[[:space:]]\|` | +1/-0 | read: one line of the commit-msg regex | F1: junk from a9e193e, deleted; tests/unit/tracked-paths.test.ts refuses such names | F1-M1..M4 RED, M5 GREEN as planned |
| 113 | config | A | `migrations/0001_reports.sql` | +11/-0 | — |  |  |
| 114 | config | M | `package-lock.json` | +1865/-704 | audited, not read line by line (generated) | #391 | n/a |
| 115 | config | M | `package.json` | +35/-12 | read | npm audit: 4 vulnerabilities, fixed by #391 (PR #392) | install-scripts.test.ts RED against the stale grant |
| 116 | config | M | `playwright.config.ts` | +329/-6 | — |  |  |
| 117 | config | M | `playwright.dev.config.ts` | +18/-6 | — |  |  |
| 118 | config | M | `playwright.device.config.ts` | +29/-13 | — |  |  |
| 119 | config | A | `playwright.functions.config.ts` | +37/-0 | — |  |  |
| 120 | config | A | `playwright.prod.config.ts` | +55/-0 | — |  |  |
| 121 | config | M | `tsconfig.json` | +16/-1 | — |  |  |
| 122 | config | M | `vitest.config.ts` | +11/-1 | — |  |  |
| 123 | test | A | `tests/base-url-calls.ts` | +337/-0 | — |  |  |
| 124 | test | A | `tests/beta-badges.ts` | +22/-0 | — |  |  |
| 125 | test | A | `tests/board-geometry.ts` | +86/-0 | — |  |  |
| 126 | test | A | `tests/catalogue-leaves.ts` | +7/-0 | — |  |  |
| 127 | test | M | `tests/dev/dev-sanity.spec.ts` | +182/-50 | — |  |  |
| 128 | test | M | `tests/device/android-preflight.setup.ts` | +45/-22 | — |  |  |
| 129 | test | M | `tests/device/chrome-foreground.ts` | +51/-16 | — |  |  |
| 130 | test | A | `tests/device/device-downloads.ts` | +76/-0 | — |  |  |
| 131 | test | A | `tests/device/ios/evidence.ts` | +173/-0 | — |  |  |
| 132 | test | M | `tests/device/ios/journeys.journey.ts` | +265/-6 | — |  |  |
| 133 | test | A | `tests/device/ios/server-process.ts` | +103/-0 | — |  |  |
| 134 | test | M | `tests/device/ios/session.ts` | +33/-47 | — |  |  |
| 135 | test | M | `tests/device/ios/webdriver.ts` | +71/-12 | — |  |  |
| 136 | test | M | `tests/device/real-device.spec.ts` | +1/-1 | — |  |  |
| 137 | test | A | `tests/e2e/approved-copy.spec.ts` | +206/-0 | — |  |  |
| 138 | test | M | `tests/e2e/baseurl-guard.spec.ts` | +23/-57 | — |  |  |
| 139 | test | M | `tests/e2e/chrome.spec.ts` | +99/-80 | — |  |  |
| 140 | test | M | `tests/e2e/classroom-groups-announcements.spec.ts` | +51/-1 | — |  |  |
| 141 | test | M | `tests/e2e/classroom-groups-controls.spec.ts` | +195/-104 | — |  |  |
| 142 | test | M | `tests/e2e/classroom-groups-io.spec.ts` | +263/-145 | — |  |  |
| 143 | test | M | `tests/e2e/classroom-groups-print.spec.ts` | +401/-1 | — |  |  |
| 144 | test | M | `tests/e2e/classroom-groups-privacy.spec.ts` | +151/-61 | — |  |  |
| 145 | test | M | `tests/e2e/classroom-groups-projector.spec.ts` | +220/-5 | — |  |  |
| 146 | test | M | `tests/e2e/classroom-groups-roster.spec.ts` | +476/-105 | — |  |  |
| 147 | test | M | `tests/e2e/classroom-groups.spec.ts` | +739/-251 | — |  |  |
| 148 | test | A | `tests/e2e/copy-reaches-a-page.spec.ts` | +351/-0 | — |  |  |
| 149 | test | A | `tests/e2e/db-stand-in.ts` | +354/-0 | — |  |  |
| 150 | test | A | `tests/e2e/disabled-controls.spec.ts` | +555/-0 | — |  |  |
| 151 | test | A | `tests/e2e/evidence-page.spec.ts` | +1519/-0 | — |  |  |
| 152 | test | A | `tests/e2e/evidence.ts` | +116/-0 | — |  |  |
| 153 | test | A | `tests/e2e/feature-words.spec.ts` | +327/-0 | — |  |  |
| 154 | test | M | `tests/e2e/fixtures.ts` | +73/-77 | — |  |  |
| 155 | test | A | `tests/e2e/glory-points-locale.spec.ts` | +70/-0 | — |  |  |
| 156 | test | M | `tests/e2e/glory-points.spec.ts` | +6/-17 | — |  |  |
| 157 | test | M | `tests/e2e/head-and-sitemap.spec.ts` | +88/-52 | — |  |  |
| 158 | test | A | `tests/e2e/header-room.spec.ts` | +270/-0 | — |  |  |
| 159 | test | M | `tests/e2e/helpers.ts` | +255/-2 | — |  |  |
| 160 | test | M | `tests/e2e/homepage.spec.ts` | +254/-51 | — |  |  |
| 161 | test | A | `tests/e2e/language-switcher.spec.ts` | +256/-0 | — |  |  |
| 162 | test | A | `tests/e2e/locale-beta.spec.ts` | +236/-0 | — |  |  |
| 163 | test | A | `tests/e2e/locale-parity.spec.ts` | +95/-0 | — |  |  |
| 164 | test | A | `tests/e2e/locale-sampling.ts` | +39/-0 | — |  |  |
| 165 | test | A | `tests/e2e/not-found-report.spec.ts` | +184/-0 | — |  |  |
| 166 | test | A | `tests/e2e/not-found.spec.ts` | +83/-0 | — |  |  |
| 167 | test | A | `tests/e2e/palette-controls.spec.ts` | +196/-0 | — |  |  |
| 168 | test | A | `tests/e2e/print-legibility.spec.ts` | +247/-0 | — |  |  |
| 169 | test | A | `tests/e2e/published-paths.ts` | +19/-0 | — |  |  |
| 170 | test | A | `tests/e2e/recorders.ts` | +175/-0 | — |  |  |
| 171 | test | M | `tests/e2e/rendered-text.spec.ts` | +308/-43 | — |  |  |
| 172 | test | A | `tests/e2e/report-completeness.spec.ts` | +100/-0 | — |  |  |
| 173 | test | A | `tests/e2e/report-form.spec.ts` | +192/-0 | — |  |  |
| 174 | test | A | `tests/e2e/report-presence.spec.ts` | +125/-0 | — |  |  |
| 175 | test | M | `tests/e2e/site-meta.spec.ts` | +11/-12 | — |  |  |
| 176 | test | A | `tests/e2e/skip-link.spec.ts` | +89/-0 | — |  |  |
| 177 | test | A | `tests/e2e/text-over-ribbon.spec.ts` | +255/-0 | — |  |  |
| 178 | test | A | `tests/e2e/thai-typography.spec.ts` | +137/-0 | — |  |  |
| 179 | test | A | `tests/e2e/theme-gallery.spec.ts` | +132/-0 | — |  |  |
| 180 | test | A | `tests/e2e/theme-script.spec.ts` | +127/-0 | — |  |  |
| 181 | test | A | `tests/e2e/theme.spec.ts` | +573/-0 | — |  |  |
| 182 | test | A | `tests/e2e/visual.spec.ts` | +222/-0 | — |  |  |
| 183 | test | A | `tests/e2e/zoom-on-focus.spec.ts` | +109/-0 | — |  |  |
| 184 | test | A | `tests/engines.ts` | +11/-0 | — |  |  |
| 185 | test | A | `tests/evidence-fixture.ts` | +82/-0 | — |  |  |
| 186 | test | A | `tests/fetch-trap.mjs` | +25/-0 | — |  |  |
| 187 | test | A | `tests/functions/local.mjs` | +62/-0 | — |  |  |
| 188 | test | A | `tests/functions/report.spec.ts` | +210/-0 | — |  |  |
| 189 | test | A | `tests/functions/serve.mjs` | +59/-0 | — |  |  |
| 190 | test | A | `tests/functions/wrangler.toml` | +10/-0 | — |  |  |
| 191 | test | A | `tests/git-env-setup.ts` | +10/-0 | — |  |  |
| 192 | test | A | `tests/git-env.ts` | +52/-0 | — |  |  |
| 193 | test | A | `tests/layout-widths.ts` | +95/-0 | — |  |  |
| 194 | test | A | `tests/make-groups.ts` | +45/-0 | — |  |  |
| 195 | test | A | `tests/palette.ts` | +293/-0 | — |  |  |
| 196 | test | A | `tests/playwright-declarations.ts` | +294/-0 | — |  |  |
| 197 | test | A | `tests/prod/prod-sanity.spec.ts` | +183/-0 | — |  |  |
| 198 | test | A | `tests/report-health.ts` | +14/-0 | — |  |  |
| 199 | test | A | `tests/reporters/dashboard-jsonl.ts` | +136/-0 | — |  |  |
| 200 | test | M | `tests/reporters/jsonl-reporter.ts` | +8/-79 | — |  |  |
| 201 | test | M | `tests/reporters/jsonl-vitest.ts` | +17/-63 | — |  |  |
| 202 | test | A | `tests/reporters/nav-timing-reporter.ts` | +161/-0 | — |  |  |
| 203 | test | A | `tests/reporters/test-identity.ts` | +42/-0 | — |  |  |
| 204 | test | A | `tests/sanity-on-build.ts` | +70/-0 | — |  |  |
| 205 | test | A | `tests/shytalk-links.ts` | +60/-0 | — |  |  |
| 206 | test | A | `tests/site-pages.ts` | +102/-0 | — |  |  |
| 207 | test | A | `tests/source-files.ts` | +211/-0 | — |  |  |
| 208 | test | A | `tests/spec-dirs.ts` | +20/-0 | — |  |  |
| 209 | test | A | `tests/themes.ts` | +62/-0 | — |  |  |
| 210 | test | A | `tests/unit/absence-liveness.test.ts` | +186/-0 | — |  |  |
| 211 | test | A | `tests/unit/anchored-presence.test.ts` | +303/-0 | — |  |  |
| 212 | test | A | `tests/unit/ast.test.ts` | +452/-0 | — |  |  |
| 213 | test | A | `tests/unit/ast.ts` | +592/-0 | — |  |  |
| 214 | test | A | `tests/unit/astro-css-strip.test.ts` | +150/-0 | — |  |  |
| 215 | test | A | `tests/unit/back-translate.test.ts` | +824/-0 | read in full (tranche 3) | F30 | via back-translate.ts |
| 216 | test | A | `tests/unit/base-url-calls.test.ts` | +441/-0 | — |  |  |
| 217 | test | A | `tests/unit/board-geometry.test.ts` | +110/-0 | — |  |  |
| 218 | test | A | `tests/unit/browser-matrix.test.ts` | +556/-0 | — |  |  |
| 219 | test | A | `tests/unit/build-release-content.test.ts` | +203/-0 | — |  |  |
| 220 | test | A | `tests/unit/capture-after-assertion.test.ts` | +114/-0 | — |  |  |
| 221 | test | A | `tests/unit/catalogue-leaves.test.ts` | +41/-0 | — |  |  |
| 222 | test | A | `tests/unit/classroom-groups-placement.test.ts` | +49/-0 | — |  |  |
| 223 | test | A | `tests/unit/cli-only.test.ts` | +93/-0 | — |  |  |
| 224 | test | A | `tests/unit/closing-keywords.test.ts` | +347/-0 | — |  |  |
| 225 | test | A | `tests/unit/collection-needs-no-build.test.ts` | +384/-0 | — |  |  |
| 226 | test | A | `tests/unit/colour-literals.test.ts` | +263/-0 | — |  |  |
| 227 | test | A | `tests/unit/commit-msg-hook.test.ts` | +84/-0 | — |  |  |
| 228 | test | A | `tests/unit/contrast.test.ts` | +632/-0 | — |  |  |
| 229 | test | A | `tests/unit/css-rules.test.ts` | +213/-0 | — |  |  |
| 230 | test | A | `tests/unit/css-rules.ts` | +319/-0 | — |  |  |
| 231 | test | M | `tests/unit/csv.test.ts` | +470/-60 | — |  |  |
| 232 | test | A | `tests/unit/dashboard-jsonl.test.ts` | +141/-0 | — |  |  |
| 233 | test | M | `tests/unit/dead-copy.test.ts` | +50/-22 | — |  |  |
| 234 | test | A | `tests/unit/dependabot-labels.test.ts` | +133/-0 | — |  |  |
| 235 | test | A | `tests/unit/deploy-gate.test.ts` | +234/-0 | — |  |  |
| 236 | test | A | `tests/unit/deprecated-css.test.ts` | +89/-0 | — |  |  |
| 237 | test | A | `tests/unit/device-downloads.test.ts` | +45/-0 | — |  |  |
| 238 | test | A | `tests/unit/device-evidence.test.ts` | +200/-0 | — |  |  |
| 239 | test | A | `tests/unit/download-readers.test.ts` | +129/-0 | — |  |  |
| 240 | test | D | `tests/unit/download-tagging.test.ts` | +0/-156 | — |  |  |
| 241 | test | A | `tests/unit/duplication.test.ts` | +242/-0 | — |  |  |
| 242 | test | A | `tests/unit/duplication.ts` | +320/-0 | — |  |  |
| 243 | test | A | `tests/unit/e2e-reconciliation.test.ts` | +343/-0 | — |  |  |
| 244 | test | A | `tests/unit/e2e-shards.test.ts` | +451/-0 | — |  |  |
| 245 | test | A | `tests/unit/e2e-timings.test.ts` | +190/-0 | — |  |  |
| 246 | test | A | `tests/unit/engine-dependence.test.ts` | +204/-0 | — |  |  |
| 247 | test | A | `tests/unit/engine-dependence.ts` | +151/-0 | — |  |  |
| 248 | test | A | `tests/unit/event-collectors.test.ts` | +499/-0 | — |  |  |
| 249 | test | A | `tests/unit/evidence-checks.test.ts` | +110/-0 | — |  |  |
| 250 | test | A | `tests/unit/evidence-fixture.test.ts` | +124/-0 | — |  |  |
| 251 | test | A | `tests/unit/evidence-page.test.ts` | +2298/-0 | — |  |  |
| 252 | test | A | `tests/unit/evidence-recording.test.ts` | +405/-0 | — |  |  |
| 253 | test | A | `tests/unit/evidence-signoff.test.ts` | +240/-0 | — |  |  |
| 254 | test | A | `tests/unit/excluded-by-design.test.ts` | +102/-0 | — |  |  |
| 255 | test | M | `tests/unit/factories.ts` | +12/-7 | — |  |  |
| 256 | test | A | `tests/unit/feature-terms.test.ts` | +380/-0 | — |  |  |
| 257 | test | M | `tests/unit/fit.test.ts` | +82/-1 | — |  |  |
| 258 | test | A | `tests/unit/fixtures/messages-before-136.json` | +2675/-0 | — |  |  |
| 259 | test | A | `tests/unit/flags.test.ts` | +114/-0 | — |  |  |
| 260 | test | A | `tests/unit/git-env.test.ts` | +190/-0 | — |  |  |
| 261 | test | A | `tests/unit/git-hooks.test.ts` | +129/-0 | — |  |  |
| 262 | test | M | `tests/unit/gloryPoints.test.ts` | +48/-2 | — |  |  |
| 263 | test | M | `tests/unit/grouping.test.ts` | +80/-39 | — |  |  |
| 264 | test | M | `tests/unit/i18n.test.ts` | +382/-390 | — |  |  |
| 265 | test | A | `tests/unit/install-scripts.test.ts` | +138/-0 | — |  |  |
| 266 | test | A | `tests/unit/is-record.test.ts` | +19/-0 | — |  |  |
| 267 | test | M | `tests/unit/isolated-context-tagging.test.ts` | +268/-256 | — |  |  |
| 268 | test | A | `tests/unit/label-check.test.ts` | +305/-0 | — |  |  |
| 269 | test | A | `tests/unit/layout-widths.test.ts` | +101/-0 | — |  |  |
| 270 | test | A | `tests/unit/literal-grounds.test.ts` | +363/-0 | — |  |  |
| 271 | test | A | `tests/unit/locale-beta.test.ts` | +104/-0 | — |  |  |
| 272 | test | A | `tests/unit/locale-fallbacks.test.ts` | +141/-0 | — |  |  |
| 273 | test | A | `tests/unit/locale-metadata.test.ts` | +183/-0 | read in full (tranche 3) | F28; F25 | via metadata.ts |
| 274 | test | A | `tests/unit/locale-routing.test.ts` | +104/-0 | — |  |  |
| 275 | test | A | `tests/unit/locale-switcher.test.ts` | +187/-0 | — |  |  |
| 276 | test | M | `tests/unit/lockdown.test.ts` | +2/-2 | — |  |  |
| 277 | test | A | `tests/unit/marquee.test.ts` | +40/-0 | read in full | F26 staged-locale case | via metadata.ts |
| 278 | test | A | `tests/unit/message-catalogue.test.ts` | +77/-0 | — |  |  |
| 279 | test | A | `tests/unit/message-characterisation.test.ts` | +144/-0 | — |  |  |
| 280 | test | A | `tests/unit/message-parity.test.ts` | +243/-0 | — |  |  |
| 281 | test | A | `tests/unit/message.test.ts` | +243/-0 | read in full (tranche 3) | F21 reasons and positions pinned; 7 edge cases | via message.ts |
| 282 | test | A | `tests/unit/nav-timings.test.ts` | +413/-0 | — |  |  |
| 283 | test | A | `tests/unit/no-dated-render.test.ts` | +38/-0 | — |  |  |
| 284 | test | A | `tests/unit/node-contract.test.ts` | +157/-0 | — |  |  |
| 285 | test | A | `tests/unit/numberSets.test.ts` | +476/-0 | — |  |  |
| 286 | test | A | `tests/unit/one-home.test.ts` | +447/-0 | — |  |  |
| 287 | test | A | `tests/unit/palette.test.ts` | +235/-0 | — |  |  |
| 288 | test | A | `tests/unit/parked-tests.test.ts` | +248/-0 | — |  |  |
| 289 | test | M | `tests/unit/pipeline-wiring.test.ts` | +2400/-43 | — |  |  |
| 290 | test | A | `tests/unit/playwright-declarations.test.ts` | +346/-0 | — |  |  |
| 291 | test | A | `tests/unit/presence-detector.ts` | +160/-0 | — |  |  |
| 292 | test | A | `tests/unit/release-inventory.test.ts` | +276/-0 | — |  |  |
| 293 | test | A | `tests/unit/release-map.test.ts` | +190/-0 | — |  |  |
| 294 | test | A | `tests/unit/release-prose.test.ts` | +32/-0 | — |  |  |
| 295 | test | A | `tests/unit/report-copy.test.ts` | +33/-0 | — |  |  |
| 296 | test | A | `tests/unit/report-endpoint.test.ts` | +508/-0 | — |  |  |
| 297 | test | A | `tests/unit/report-form.test.ts` | +32/-0 | — |  |  |
| 298 | test | A | `tests/unit/report-review.test.ts` | +532/-0 | — |  |  |
| 299 | test | A | `tests/unit/report.test.ts` | +484/-0 | — |  |  |
| 300 | test | M | `tests/unit/roster.test.ts` | +7/-2 | — |  |  |
| 301 | test | A | `tests/unit/route-coverage.test.ts` | +165/-0 | — |  |  |
| 302 | test | A | `tests/unit/sanity-on-build.test.ts` | +217/-0 | — |  |  |
| 303 | test | A | `tests/unit/scoped-classes.test.ts` | +272/-0 | — |  |  |
| 304 | test | A | `tests/unit/scoped-classes.ts` | +515/-0 | — |  |  |
| 305 | test | A | `tests/unit/scratch-git-home.test.ts` | +87/-0 | — |  |  |
| 306 | test | A | `tests/unit/script-checkout.ts` | +62/-0 | — |  |  |
| 307 | test | A | `tests/unit/script-entry.test.ts` | +773/-0 | — |  |  |
| 308 | test | M | `tests/unit/sections.test.ts` | +6/-2 | — |  |  |
| 309 | test | A | `tests/unit/server-process.test.ts` | +260/-0 | — |  |  |
| 310 | test | M | `tests/unit/sexOptions.test.ts` | +6/-2 | — |  |  |
| 311 | test | M | `tests/unit/sfx.test.ts` | +74/-0 | — |  |  |
| 312 | test | M | `tests/unit/sfxAssets.test.ts` | +40/-4 | — |  |  |
| 313 | test | A | `tests/unit/shipped-defaults.test.ts` | +502/-0 | — |  |  |
| 314 | test | A | `tests/unit/shytalk-brand.test.ts` | +128/-0 | — |  |  |
| 315 | test | A | `tests/unit/shytalk-showcase.test.ts` | +149/-0 | — |  |  |
| 316 | test | A | `tests/unit/signoff-status.test.ts` | +231/-0 | — |  |  |
| 317 | test | A | `tests/unit/site-pages.test.ts` | +69/-0 | — |  |  |
| 318 | test | A | `tests/unit/sitemap-config.test.ts` | +63/-0 | — |  |  |
| 319 | test | A | `tests/unit/source-files.test.ts` | +156/-0 | — |  |  |
| 320 | test | A | `tests/unit/source-text.test.ts` | +714/-0 | — |  |  |
| 321 | test | A | `tests/unit/source-text.ts` | +636/-0 | — |  |  |
| 322 | test | A | `tests/unit/spec-dirs.test.ts` | +24/-0 | — |  |  |
| 323 | test | A | `tests/unit/spec-scan.ts` | +48/-0 | — |  |  |
| 324 | test | M | `tests/unit/staleness.test.ts` | +6/-2 | — |  |  |
| 325 | test | A | `tests/unit/stranded-docblocks.test.ts` | +372/-0 | — |  |  |
| 326 | test | A | `tests/unit/supply-chain.test.ts` | +456/-0 | — |  |  |
| 327 | test | A | `tests/unit/tokens.test.ts` | +153/-0 | — |  |  |
| 328 | test | A | `tests/unit/translate-messages.test.ts` | +312/-0 | read in full (tranche 3) | F22 (TR35 TR36 TR47 TR48; /=0/ matched the template) | via translate.ts |
| 329 | test | A | `tests/unit/translate.test.ts` | +663/-0 | read in full (tranche 3) | F22 F24 F25 | via translate.ts |
| 330 | test | A | `tests/unit/typecheck-scope.test.ts` | +87/-0 | — |  |  |
| 331 | test | A | `tests/unit/unit-budget.test.ts` | +24/-0 | — |  |  |
| 332 | test | A | `tests/unit/upload-assets.test.ts` | +233/-0 | — |  |  |
| 333 | test | A | `tests/unit/verified-labels.test.ts` | +448/-0 | — |  |  |
| 334 | test | M | `tests/unit/viewport-tagging.test.ts` | +321/-287 | — |  |  |
| 335 | test | A | `tests/unit/visual-runner.test.ts` | +151/-0 | — |  |  |
| 336 | test | A | `tests/unit/wait-for.test.ts` | +154/-0 | — |  |  |
| 337 | test | A | `tests/unit/waiting-reports-script.test.ts` | +364/-0 | — |  |  |
| 338 | test | A | `tests/unit/waiting-reports.test.ts` | +309/-0 | — |  |  |
| 339 | test | A | `tests/unit/wcag.test.ts` | +195/-0 | — |  |  |
| 340 | test | A | `tests/unit/webdriver-status.test.ts` | +51/-0 | — |  |  |
| 341 | test | A | `tests/unit/workflow-jobs.test.ts` | +568/-0 | — |  |  |
| 342 | test | A | `tests/viewport.ts` | +116/-0 | — |  |  |
| 343 | test | A | `tests/wcag.ts` | +87/-0 | — |  |  |
| 344 | test | A | `tests/workflow-jobs.ts` | +530/-0 | — |  |  |
| 345 | doc | M | `CLAUDE.md` | +17/-5 | not code: prose, read for claims the code contradicts |  |  |
| 346 | doc | A | `HANDOVER.md` | +83/-0 | not code: prose, read for claims the code contradicts |  |  |
| 347 | doc | M | `README.md` | +134/-17 | not code: prose, read for claims the code contradicts |  |  |
| 348 | doc | A | `docs/releases/a3a5adb.json` | +367/-0 | not code: prose, read for claims the code contradicts |  |  |
| 349 | doc | A | `docs/runbooks/translation-reports.md` | +93/-0 | not code: prose, read for claims the code contradicts |  |  |
| 350 | doc | A | `docs/superpowers/plans/2026-09-24-light-mode-1-groundwork.md` | +1553/-0 | not code: prose, read for claims the code contradicts |  |  |
| 351 | doc | A | `docs/superpowers/plans/2026-09-24-light-mode-2-studio.md` | +3592/-0 | not code: prose, read for claims the code contradicts |  |  |
| 352 | doc | A | `docs/superpowers/plans/2026-09-25-prod-sanity-stale-facts.md` | +43/-0 | not code: prose, read for claims the code contradicts |  |  |
| 353 | doc | A | `docs/superpowers/plans/2026-09-25-sanity-on-build.md` | +77/-0 | not code: prose, read for claims the code contradicts |  |  |
| 354 | doc | A | `docs/superpowers/plans/2026-09-26-not-found-report.md` | +919/-0 | not code: prose, read for claims the code contradicts |  |  |
| 355 | doc | A | `docs/superpowers/plans/2026-09-26-reports-review.md` | +110/-0 | not code: prose, read for claims the code contradicts |  |  |
| 356 | doc | A | `docs/superpowers/plans/2026-09-26-translation-reports.md` | +3593/-0 | not code: prose, read for claims the code contradicts |  |  |
| 357 | doc | A | `docs/superpowers/plans/2026-09-26-waiting-reports-count.md` | +2147/-0 | not code: prose, read for claims the code contradicts |  |  |
| 358 | doc | A | `docs/superpowers/plans/2026-09-27-release-evidence-page.md` | +2124/-0 | not code: prose, read for claims the code contradicts |  |  |
| 359 | doc | M | `docs/superpowers/specs/2026-07-23-shyden-homepage-design.md` | +1/-1 | not code: prose, read for claims the code contradicts |  |  |
| 360 | doc | M | `docs/superpowers/specs/2026-08-06-classroom-groups-v2-design.md` | +5/-0 | not code: prose, read for claims the code contradicts |  |  |
| 361 | doc | M | `docs/superpowers/specs/2026-08-08-real-device-test-harness-design.md` | +3/-1 | not code: prose, read for claims the code contradicts |  |  |
| 362 | doc | A | `docs/superpowers/specs/2026-09-23-light-mode-design.md` | +433/-0 | not code: prose, read for claims the code contradicts |  |  |
| 363 | doc | A | `docs/superpowers/specs/2026-09-23-translation-reports-design.md` | +964/-0 | not code: prose, read for claims the code contradicts |  |  |
| 364 | doc | A | `docs/superpowers/specs/2026-09-27-release-evidence-page-design.md` | +191/-0 | not code: prose, read for claims the code contradicts |  |  |
| 365 | baseline | A | `src/assets/shytalk/room-en.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 366 | baseline | A | `src/assets/shytalk/room-id.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 367 | baseline | A | `src/assets/shytalk/room-th.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 368 | baseline | A | `src/assets/shytalk/room-vi.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 369 | baseline | A | `src/assets/shytalk/room-zh.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 370 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-desktop-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 371 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-desktop-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 372 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-docked-desktop-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 373 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-docked-desktop-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 374 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-docked-mobile-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 375 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-docked-mobile-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 376 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-mobile-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 377 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-mobile-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 378 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-roster-desktop-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 379 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-roster-desktop-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 380 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-roster-mobile-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 381 | baseline | A | `tests/e2e/__screenshots__/classroom-groups-roster-mobile-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 382 | baseline | A | `tests/e2e/__screenshots__/glory-points-desktop-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 383 | baseline | A | `tests/e2e/__screenshots__/glory-points-desktop-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 384 | baseline | A | `tests/e2e/__screenshots__/glory-points-mobile-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 385 | baseline | A | `tests/e2e/__screenshots__/glory-points-mobile-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 386 | baseline | A | `tests/e2e/__screenshots__/home-en-desktop-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 387 | baseline | A | `tests/e2e/__screenshots__/home-en-desktop-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 388 | baseline | A | `tests/e2e/__screenshots__/home-en-mobile-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 389 | baseline | A | `tests/e2e/__screenshots__/home-en-mobile-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 390 | baseline | A | `tests/e2e/__screenshots__/home-id-desktop-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 391 | baseline | A | `tests/e2e/__screenshots__/home-id-desktop-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 392 | baseline | A | `tests/e2e/__screenshots__/home-id-mobile-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 393 | baseline | A | `tests/e2e/__screenshots__/home-id-mobile-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 394 | baseline | A | `tests/e2e/__screenshots__/not-found-desktop-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 395 | baseline | A | `tests/e2e/__screenshots__/not-found-desktop-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 396 | baseline | A | `tests/e2e/__screenshots__/not-found-mobile-light-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
| 397 | baseline | A | `tests/e2e/__screenshots__/not-found-mobile-linux.png` | +-/-- | not code: a PNG baseline, judged by the visual suite |  |  |
