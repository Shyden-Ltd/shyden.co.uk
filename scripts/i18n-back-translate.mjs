#!/usr/bin/env node
/**
 * Read every translated locale back into English and write the review. #95.
 *
 *   BACK_TRANSLATE_URL=http://localhost:5000 npm run i18n:back-translate
 *
 * The engine is LibreTranslate, which `.github/workflows/back-translation.yml`
 * runs beside the job; locally, the same image does it:
 *
 *   docker run -p 5000:5000 -e LT_LOAD_ONLY=en,id,zh,vi,th libretranslate/libretranslate
 *
 * Environment:
 *
 *   BACK_TRANSLATE_URL      the engine's address. Required: without it the
 *                           run fails, rather than comparing nothing.
 *   BACK_TRANSLATE_API_KEY  only for an engine that asks for one.
 *   BACK_TRANSLATE_ENGINE   the engine's name for the review, e.g. its image.
 *   BACK_TRANSLATE_REPORT   a path to write every comparison to, as JSON.
 *   GITHUB_STEP_SUMMARY     where the review goes in CI; printed otherwise.
 *
 * ADVISORY: a low score never fails the run (operator decision 2026-09-10).
 * It exits 1 only when the run cannot be believed -- no engine, an engine
 * that refused or cannot read a locale, or a locale that compared nothing --
 * because a gate that silently reads nothing reports the same as one that
 * found nothing wrong.
 *
 * The decisions live in `src/lib/i18n/back-translate.ts`, unit-tested without
 * an engine. This file is wiring: read, fetch, write. Node 24 strips
 * TypeScript natively, so the catalogues import directly with no build step.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import {
  TRANSLATED_LOCALES,
  backTranslationUnits,
  chrF,
  engineConfig,
  engineLanguages,
  engineSource,
  libreTranslateBody,
  livenessProblems,
  reviewMarkdown,
  sendable,
  translatedTexts,
} from '../src/lib/i18n/back-translate.ts';

/** Texts per request: small enough that one slow batch is not the whole run. */
const BATCH = 25;

/**
 * One request, its JSON answer, and the engine's own words when it refuses.
 *
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<unknown>}
 */
async function call(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const reason =
      body && typeof body.error === 'string' ? body.error : text.slice(0, 200);
    throw new Error(
      `${init.method ?? 'GET'} ${url} answered ${response.status}: ${reason}`,
    );
  }
  if (body === undefined)
    throw new Error(`${init.method ?? 'GET'} ${url} answered with no JSON`);
  return body;
}

async function main() {
  // Everything it reads is an environment variable, so an argument is a
  // mistake -- `--report x` ignored would be a report nobody finds (#227).
  if (process.argv.length > 2)
    throw new Error(
      `i18n-back-translate.mjs takes no arguments; set BACK_TRANSLATE_* instead (got ${process.argv.slice(2).join(' ')})`,
    );
  const { url, apiKey } = engineConfig(process.env);
  const engine = process.env.BACK_TRANSLATE_ENGINE || 'LibreTranslate';

  // Every locale is resolved before any copy is sent, so an engine that
  // cannot read one of them costs a single request, not a partial run.
  const offered = engineLanguages(await call(`${url}/languages`));
  const plan = TRANSLATED_LOCALES.map((locale) => ({
    locale,
    source: engineSource(locale, offered),
  }));

  /** @type {import('../src/lib/i18n/back-translate.ts').Comparison[]} */
  const comparisons = [];
  for (const { locale, source } of plan) {
    const units = backTranslationUnits(locale);
    // Sent without its slots, and the same text under several keys once. A
    // translation that is nothing but slots is sent nowhere and reads back as
    // nothing, which scores 0 and heads the review.
    const distinct = [
      ...new Set(units.map(({ translation }) => sendable(translation))),
    ].filter((text) => text !== '');
    /** @type {Map<string, string>} */
    const back = new Map([['', '']]);
    for (let at = 0; at < distinct.length; at += BATCH) {
      const texts = distinct.slice(at, at + BATCH);
      const answer = await call(`${url}/translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(libreTranslateBody(texts, source, apiKey)),
      });
      translatedTexts(answer, texts.length).forEach((text, index) =>
        back.set(texts[index], text),
      );
    }
    for (const unit of units) {
      const backTranslation = back.get(sendable(unit.translation));
      // Every distinct translation was sent and every answer checked for
      // count, so this cannot happen -- and if it ever does, it is a broken
      // run, not a unit quietly scored against nothing.
      if (backTranslation === undefined)
        throw new Error(`${locale} ${unit.key}: nothing was read back for it`);
      comparisons.push({
        locale,
        ...unit,
        backTranslation,
        score: chrF(unit.english, backTranslation),
      });
    }
    console.log(
      `${locale}: ${units.length} compared, ${distinct.length} distinct, read as ${source}`,
    );
  }

  const problems = livenessProblems(TRANSLATED_LOCALES, comparisons);
  const page = [
    ...(problems.length > 0
      ? ['**This run cannot be believed:**', ...problems]
      : []),
    reviewMarkdown(comparisons, TRANSLATED_LOCALES, engine),
  ].join('\n\n');
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${page}\n`);
  else console.log(page);
  if (process.env.BACK_TRANSLATE_REPORT)
    writeFileSync(
      process.env.BACK_TRANSLATE_REPORT,
      `${JSON.stringify({ engine, comparisons }, null, 2)}\n`,
    );

  for (const problem of problems) console.error(problem);
  process.exitCode = problems.length > 0 ? 1 : 0;
}

if (import.meta.main)
  await main().catch((error) => {
    console.error(
      `✗ ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
