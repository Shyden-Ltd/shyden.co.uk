#!/usr/bin/env node
/**
 * Render a locale catalogue from `en.ts` and the DeepL cache. #22.
 *
 *   npm run i18n:scaffold -- zh          # writes src/lib/i18n/zh.ts
 *   npm run i18n:scaffold -- zh --force  # overwrite one that already exists
 *
 * SEPARATE FROM THE TRANSLATOR ON PURPOSE. `i18n-translate.mjs` spends quota
 * and fills `.translations.json`; this spends nothing and only shapes what is
 * already there. Splitting them is what makes a re-render free and repeatable
 * after a review, instead of a reason to call DeepL again.
 *
 * REFUSES TO OVERWRITE by default, and that is the important behaviour. These
 * catalogues are a REVIEW SURFACE: the machine output is a first draft, and the
 * corrections a human makes to it live in the file, not in the cache. A
 * generator that clobbered them would quietly undo every review that had ever
 * been done. `--force` exists for the one case that is safe -- re-rendering
 * before anybody has reviewed anything.
 *
 * EVERY MESSAGE IS REBUILT, NOT COPIED (#136). A message is a template, and the
 * translator was sent the whole sentences it can say; `assembleMessage` puts
 * the translations back into a template and refuses one that lost, invented or
 * repeated a slot. Until #136 the 51 messages were arrow functions a
 * translator could not take, emitted here as `en.<path>` references, so every
 * machine-seeded catalogue carried them in English.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { die, messageOf } from './errors.mjs';
import { argv } from 'node:process';

import { isMessageTemplate } from '../src/lib/i18n/message.ts';
import {
  assembleMessage,
  needsTranslation,
} from '../src/lib/i18n/translate.ts';
import { en } from '../src/lib/i18n/en.ts';

const CACHE = 'src/lib/i18n/.translations.json';

/**
 * One locale's rendering context: which locale, the drafts cached for it, and
 * the plural forms it has. Bound once and threaded through `render`, because
 * `render` recurses and reading these off module scope is what made this file
 * do its work as it loaded (#276).
 *
 * @typedef {object} Locale
 * @property {string} target
 * @property {Record<string, string>} known
 * @property {readonly Intl.LDMLPluralRule[]} pluralForms
 */

/**
 *  A key that needs quoting in an object literal (`'class-list'`).
 *
 *  @param {string} key
 */
const plainKey = (key) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);

/**
 * The TypeScript source for one value. `path` is carried so a refusal names
 * the key it happened at.
 *
 * @param {unknown} value
 * @param {string} path
 * @param {number} indent
 * @param {Locale} locale the target, its drafts and its plural forms
 * @returns {string} declared, because this recurses: without a return type
 *   TypeScript cannot infer one from a function that calls itself.
 */
function render(value, path, indent, locale) {
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);

  if (typeof value === 'function')
    die(`${path} is a function. A catalogue holds copy and templates (#136).`);

  if (Array.isArray(value)) {
    const items = value.map(
      (/** @type {unknown} */ v, /** @type {number} */ i) =>
        render(v, `${path}[${i}]`, indent + 1, locale),
    );
    return `[\n${items.map((/** @type {string} */ s) => inner + s).join(',\n')},\n${pad}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(
      /** @returns {string} */ ([key, v]) => {
        const name = plainKey(key) ? key : JSON.stringify(key);
        // No leading dot at the root, or a key comes out as `..errors.X`.
        const child = plainKey(key)
          ? path
            ? `${path}.${key}`
            : key
          : `${path}[${JSON.stringify(key)}]`;
        return `${inner}${name}: ${render(v, child, indent + 1, locale)}`;
      },
    );
    return `{\n${entries.join(',\n')},\n${pad}}`;
  }

  if (typeof value === 'string' && isMessageTemplate(value)) {
    try {
      return JSON.stringify(
        assembleMessage(
          value,
          (sentence) => locale.known[sentence],
          locale.pluralForms,
        ),
      );
    } catch (error) {
      die(
        `${path}: ${messageOf(error)} — "npm run i18n:translate -- ${locale.target} ` +
          '--send" drafts any sentence that is missing',
      );
    }
  }

  if (needsTranslation(value)) {
    const translated = locale.known[value];
    if (translated === undefined)
      die(
        `no translation cached for ${path}: ${JSON.stringify(value)} — ` +
          `run "npm run i18n:translate -- ${locale.target} --send" first`,
      );
    return JSON.stringify(translated);
  }

  // Punctuation and symbols: `#`, `—`. The same in every language by design,
  // and `tests/unit/i18n.test.ts` already accepts them as legitimately equal.
  return JSON.stringify(value);
}

const headerFor = (
  /** @type {string} */ target,
) => `import type { Catalogue } from './en';

/**
 * ${target} — generated by \`scripts/i18n-scaffold.mjs\` from en.ts and the DeepL
 * cache (#22), then REVIEWED BY HAND. Re-rendering discards those reviews, so
 * the generator refuses to overwrite this file without \`--force\`.
 *
 * Every message is a template rebuilt from DeepL's translation of the
 * sentences it can say, and checked to fill exactly the slots English fills
 * (#136).
 *
 * MACHINE-TRANSLATED COPY IS A FIRST DRAFT. It has been checked for structure
 * — placeholders intact, protected names preserved, nothing empty — and NOT
 * for fluency, which needs a speaker of this language.
 */
export const ${target}: Catalogue = `;

/**
 * Render the catalogue for the locale named on the command line.
 *
 * EVERY EFFECT IS IN HERE, reached only under `import.meta.main` (#276).
 * Until then all of it ran at module scope, so importing this file read the
 * cache, wrote a catalogue over a reviewed one, and could exit the importing
 * process through `die`.
 *
 * @returns {void}
 */
export function main() {
  const args = argv.slice(2);
  const force = args.includes('--force');
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) die('name a locale: npm run i18n:scaffold -- zh');

  if (!existsSync(CACHE))
    die(`${CACHE} does not exist — run i18n:translate first`);
  const cache = JSON.parse(readFileSync(CACHE, 'utf8'));
  const known = cache[target];
  if (!known)
    die(`no cached translations for "${target}" — run i18n:translate`);

  const out = `src/lib/i18n/${target}.ts`;
  if (existsSync(out) && !force)
    die(
      `${out} already exists. It is a review surface — re-rendering would ` +
        'discard any correction made to it. Pass --force only if nothing in ' +
        'it has been reviewed yet.',
    );

  /**
   * The plural forms the target language has, from CLDR through Intl. Every
   * language drafted so far has "other" alone, and `assembleMessage` refuses a
   * message with a plural for one that has more.
   */
  const PLURAL_FORMS = new Intl.PluralRules(target).resolvedOptions()
    .pluralCategories;

  const body = render(en, '', 0, {
    target,
    known,
    pluralForms: PLURAL_FORMS,
  });
  writeFileSync(out, `${headerFor(target)}${body};\n`);
  console.log(`✓ ${out}`);
}

if (import.meta.main) main();
