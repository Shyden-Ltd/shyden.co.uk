#!/usr/bin/env node
/**
 * Seed a locale catalogue from `en.ts` with DeepL. #21 Stage 5.
 *
 *   npm run i18n:translate -- zh            # DRY RUN — sends nothing
 *   npm run i18n:translate -- zh --send     # actually calls DeepL
 *
 * DRY RUN IS THE DEFAULT, deliberately. A translation run spends a finite
 * free-tier quota and is the kind of thing that gets triggered by a stray
 * shell-history arrow key; the dry run prints exactly what would be sent and
 * how many characters it costs, so the spend is a decision rather than a
 * side effect. It is also what lets this stage ship "built but not run".
 *
 * Committed output, never a build step (#21's acceptance criteria). Nothing
 * here runs in CI: a deploy must not depend on a third-party API being up,
 * and `tests/unit/translate.test.ts` fails if any other npm script reaches
 * this file.
 *
 * The decisions live in `src/lib/i18n/translate.ts`, unit-tested without a
 * key or a network. This file is wiring: read, fetch, write.
 *
 * Node 24 strips TypeScript natively, so the catalogues import directly with
 * no build step and no new dependency — the zero-cost constraint.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { argv, env, exit } from 'node:process';

import {
  DO_NOT_TRANSLATE,
  deeplEndpoint,
  deeplLanguage,
  needsTranslation,
  untranslatedKeys,
  TRANSLATABLE_LOCALES,
} from '../src/lib/i18n/translate.ts';
import { en } from '../src/lib/i18n/en.ts';

const CACHE = 'src/lib/i18n/.translations.json';
/** DeepL accepts up to 50 texts per request. */
const BATCH = 50;

const die = (message) => {
  console.error(`✗ ${message}`);
  exit(1);
};

// ── arguments ──────────────────────────────────────────────────────────────
const args = argv.slice(2);
const send = args.includes('--send');
const target = args.find((a) => !a.startsWith('--'));

if (!target) die('usage: npm run i18n:translate -- <locale> [--send]');
if (!TRANSLATABLE_LOCALES.includes(target))
  die(`${target} is not an MVP locale (${TRANSLATABLE_LOCALES.join(', ')})`);
if (target === 'en') die('en is the source language, not a target');

/**
 * The key, read from the environment or `.env.local`.
 *
 * Never printed, never interpolated into a URL or an error. `.env.local` is
 * gitignored (`.env.*`), and the same value lives as a repo secret.
 */
const apiKey =
  env.DEEPL_API_KEY ??
  (existsSync('.env.local')
    ? (/^DEEPL_API_KEY=(.*)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1] ??
      '')
    : '');

// ── what would be sent ─────────────────────────────────────────────────────
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const known = cache[target] ?? {};

/**
 * Every distinct string in the catalogue that a translator can take.
 *
 * A Set: the same word appears under several keys, and DeepL charges per
 * character sent, not per distinct string. Cached by the SOURCE TEXT rather
 * than a hash of it — no collisions, and the cache file stays reviewable in a
 * diff, which matters when the thing being reviewed is a translation.
 */
const strings = new Set();
const collect = (value) => {
  if (Array.isArray(value)) return value.forEach(collect);
  if (value && typeof value === 'object')
    return Object.values(value).forEach(collect);
  if (needsTranslation(value)) strings.add(value);
};
collect(en);

const pending = [...strings].filter((s) => !(s in known));
const characters = pending.reduce((n, s) => n + s.length, 0);
const manual = untranslatedKeys(en);

console.log(`target        ${target} → DeepL ${deeplLanguage(target)}`);
console.log(`catalogue     ${strings.size} translatable strings`);
console.log(`cached        ${strings.size - pending.length}`);
console.log(
  `to send       ${pending.length} strings, ${characters} characters`,
);
console.log(`needs a human ${manual.length} keys (functions, symbols)`);
console.log(`do-not-send   ${DO_NOT_TRANSLATE.length} protected terms`);

if (!send) {
  console.log('\nDRY RUN — nothing sent. Add --send to spend quota.');
  exit(0);
}

// ── the call ───────────────────────────────────────────────────────────────
if (!apiKey.trim()) die('DEEPL_API_KEY is not set (env or .env.local)');
const endpoint = deeplEndpoint(apiKey);

for (let i = 0; i < pending.length; i += BATCH) {
  const batch = pending.slice(i, i + BATCH);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: batch,
      source_lang: 'EN',
      target_lang: deeplLanguage(target),
      // The names and legal facts come back exactly as they went in.
      ignore_tags: ['x'],
      tag_handling: 'xml',
    }),
  });
  // The status only, never the body: a DeepL error can echo the request.
  if (!response.ok) die(`DeepL responded ${response.status}`);
  const { translations } = await response.json();
  batch.forEach((source, n) => {
    known[source] = translations[n].text;
  });
  console.log(`  ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
}

cache[target] = known;
writeFileSync(CACHE, `${JSON.stringify(cache, null, 2)}\n`);
console.log(`\n✓ cache written to ${CACHE}`);
console.log(
  `  ${manual.length} keys still need a human — see untranslatedKeys`,
);
console.log('  Nothing was added to LOCALES. That is #22.');
