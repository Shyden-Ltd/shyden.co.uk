import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderCatalogue } from '../../scripts/i18n-scaffold.mjs';
import { translatableSentences } from '../../src/lib/i18n/translate';
import { messageOf } from '../../scripts/errors.mjs';

/**
 * `scripts/i18n-scaffold.mjs` renders zh, vi and th from `en.ts` and the
 * DeepL cache. Until #390's review nothing ran it past the argv refusal in
 * `script-entry.test.ts`, so the behaviour its own docblock calls the
 * important one -- refusing to overwrite a reviewed catalogue -- was held up
 * by nothing but that docblock.
 */

const SUMMARY = '{count, plural, one {# pupil} other {# pupils}} in {names}';

/** Every copy shape `render` handles: bare and quoted keys, arrays, a
 *  symbol that stays as it is, a number, and a message. */
const FIXTURE = {
  title: 'Groups',
  mark: '#',
  size: 4,
  card: { heading: 'Your class', steps: ['Add pupils', '—'] },
  'class-list': { empty: 'No pupils yet' },
  summary: SUMMARY,
};

const SENTENCES = [
  'Groups',
  'Your class',
  'Add pupils',
  'No pupils yet',
  '{count} pupils in {names}',
];

/** A draft that shows it came from the cache: `«sentence»`. */
const drafts = (without: string[] = []) =>
  Object.fromEntries(
    SENTENCES.filter((s) => !without.includes(s)).map((s) => [s, `«${s}»`]),
  );

const ja = (
  known: Record<string, string>,
  pluralForms: Intl.LDMLPluralRule[] = ['other'],
) => ({
  target: 'ja',
  known,
  pluralForms,
});

const fail = (catalogue: unknown, locale: ReturnType<typeof ja>) => {
  try {
    renderCatalogue(catalogue, locale);
  } catch (error) {
    return messageOf(error);
  }
  throw new Error('renderCatalogue returned where it should have refused');
};

/** Load a rendered source the way a page would: as a module. */
const load = async (source: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-'));
  const file = join(dir, 'ja.ts');
  writeFileSync(file, source);
  return ((await import(file)) as { ja: unknown }).ja;
};

describe('renderCatalogue', () => {
  it('replaces every string with its cached draft and keeps the shape', async () => {
    expect(await load(renderCatalogue(FIXTURE, ja(drafts())))).toEqual({
      title: '«Groups»',
      mark: '#',
      size: 4,
      card: { heading: '«Your class»', steps: ['«Add pupils»', '—'] },
      'class-list': { empty: '«No pupils yet»' },
      summary: '«{count} pupils in {names}»',
    });
  });

  it('writes the typed header for the target and ends the statement', () => {
    const source = renderCatalogue(FIXTURE, ja(drafts()));
    expect(source.startsWith("import type { Catalogue } from './en';\n")).toBe(
      true,
    );
    expect(source).toMatch(/^export const ja: Catalogue = \{$/m);
    expect(source.endsWith('\n};\n')).toBe(true);
  });

  it('quotes a key that is not an identifier, and only that key', () => {
    const source = renderCatalogue(FIXTURE, ja(drafts()));
    expect(source).toContain('\n  "class-list": {\n');
    expect(source).toContain('\n  title: "«Groups»",\n');
  });

  it.each([
    ['Groups', 'title'],
    ['Your class', 'card.heading'],
    ['Add pupils', 'card.steps[0]'],
    ['No pupils yet', '["class-list"].empty'],
  ])('refuses a missing draft for %j, naming %s', (sentence, path) => {
    expect(fail(FIXTURE, ja(drafts([sentence])))).toBe(
      `no translation cached for ${path}: ${JSON.stringify(sentence)} — ` +
        'run "npm run i18n:translate -- ja --send" first',
    );
  });

  it('refuses a message with a sentence that has no draft', () => {
    expect(fail(FIXTURE, ja(drafts(['{count} pupils in {names}'])))).toBe(
      'summary: no translation for "{count} pupils in {names}" — ' +
        '"npm run i18n:translate -- ja --send" drafts any sentence that is missing',
    );
  });

  it('refuses a message whose language has plural forms beyond "other"', () => {
    expect(fail(FIXTURE, ja(drafts(), ['one', 'other']))).toBe(
      `summary: ${JSON.stringify(SUMMARY)}: the language has the plural forms ` +
        'one, other, and a draft cut from "other" alone would be wrong for the ' +
        'rest — "npm run i18n:translate -- ja --send" drafts any sentence that ' +
        'is missing',
    );
  });

  it('refuses a function, naming where it is', () => {
    expect(fail({ card: { greet: () => 'hi' } }, ja(drafts()))).toBe(
      'card.greet is a function. A catalogue holds copy and templates (#136).',
    );
  });

  it('reads a draft only from the cache itself, never its prototype', () => {
    // `{}.constructor` is `Object`: read as a draft, it rendered as the
    // bare word `undefined`, which is what JSON.stringify makes of a function.
    expect(fail({ word: 'constructor' }, ja({}))).toBe(
      'no translation cached for word: "constructor" — ' +
        'run "npm run i18n:translate -- ja --send" first',
    );
  });
});

const SCRIPT = fileURLToPath(
  new URL('../../scripts/i18n-scaffold.mjs', import.meta.url),
);
const OUT = join('src', 'lib', 'i18n', 'ja.ts');
const REVIEWED = '// reviewed by hand\n';

/** A working directory holding `cache` as the DeepL cache, and optionally a
 *  catalogue that has already been reviewed. */
const workspace = (cache?: unknown, reviewed = false) => {
  const cwd = mkdtempSync(join(tmpdir(), 'scaffold-main-'));
  mkdirSync(join(cwd, 'src', 'lib', 'i18n'), { recursive: true });
  if (cache !== undefined)
    writeFileSync(
      join(cwd, 'src', 'lib', 'i18n', '.translations.json'),
      JSON.stringify(cache),
    );
  if (reviewed) writeFileSync(join(cwd, OUT), REVIEWED);
  return cwd;
};

const scaffold = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

/** A draft for every sentence the English catalogues hold: itself. */
const everyDraft = () =>
  Object.fromEntries([...translatableSentences()].map((s) => [s, s]));

describe('main', () => {
  it('writes the catalogue when every sentence has a draft', () => {
    const cwd = workspace({ ja: everyDraft() });
    const run = scaffold(cwd, 'ja');
    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(`✓ src/lib/i18n/ja.ts\n`);
    expect(run.status).toBe(0);
    expect(readFileSync(join(cwd, OUT), 'utf8')).toMatch(
      /^export const ja: Catalogue = \{$/m,
    );
  });

  it('refuses to overwrite a reviewed catalogue, and leaves it as it was', () => {
    const cwd = workspace({ ja: everyDraft() }, true);
    const run = scaffold(cwd, 'ja');
    expect(run.stderr).toBe(
      '✗ src/lib/i18n/ja.ts already exists. It is a review surface — ' +
        're-rendering would discard any correction made to it. Pass --force ' +
        'only if nothing in it has been reviewed yet.\n',
    );
    expect(run.status).toBe(1);
    expect(readFileSync(join(cwd, OUT), 'utf8')).toBe(REVIEWED);
  });

  it.each([[['ja', '--force']], [['--force', 'ja']]])(
    'overwrites with --force, wherever it stands: %j',
    (args) => {
      const cwd = workspace({ ja: everyDraft() }, true);
      const run = scaffold(cwd, ...args);
      expect(run.stderr).toBe('');
      expect(run.status).toBe(0);
      expect(readFileSync(join(cwd, OUT), 'utf8')).toMatch(
        /^export const ja: Catalogue = \{$/m,
      );
    },
  );

  it('writes nothing when a draft is missing, even with --force', () => {
    const known = everyDraft();
    delete known['Classroom Group Creator'];
    const cwd = workspace({ ja: known }, true);
    const run = scaffold(cwd, 'ja', '--force');
    expect(run.stderr).toBe(
      '✗ no translation cached for title: "Classroom Group Creator" — ' +
        'run "npm run i18n:translate -- ja --send" first\n',
    );
    expect(run.status).toBe(1);
    expect(readFileSync(join(cwd, OUT), 'utf8')).toBe(REVIEWED);
  });

  it("renders with the target language's own plural forms", () => {
    // Russian has four, so the first plural message is refused rather than
    // drafted from "other"; every language drafted so far has "other" alone.
    const cwd = workspace({ ru: everyDraft() });
    const run = scaffold(cwd, 'ru');
    expect(run.stderr).toMatch(
      /^✗ groupedNote: .* the language has the plural forms few, many, one, other, /,
    );
    expect(run.status).toBe(1);
    expect(existsSync(join(cwd, 'src', 'lib', 'i18n'))).toBe(true);
    expect(existsSync(join(cwd, 'src', 'lib', 'i18n', 'ru.ts'))).toBe(false);
  });

  it.each([
    [
      ['ja', '--froce'],
      '✗ unknown option --froce — usage: npm run i18n:scaffold -- <locale> [--force]\n',
    ],
    [
      ['ja', 'th'],
      '✗ name one locale, not 2 (ja, th) — usage: npm run i18n:scaffold -- <locale> [--force]\n',
    ],
  ])('refuses %j before it writes anything', (args, says) => {
    const cwd = workspace({ ja: everyDraft(), th: everyDraft() }, true);
    const run = scaffold(cwd, ...args);
    expect(run.stderr).toBe(says);
    expect(run.status).toBe(1);
    expect(readFileSync(join(cwd, OUT), 'utf8')).toBe(REVIEWED);
  });

  it('refuses when there is no cache at all', () => {
    const cwd = workspace();
    const run = scaffold(cwd, 'ja');
    expect(run.stderr).toBe(
      '✗ src/lib/i18n/.translations.json does not exist — run i18n:translate first\n',
    );
    expect(run.status).toBe(1);
    expect(existsSync(join(cwd, 'src', 'lib', 'i18n'))).toBe(true);
    expect(existsSync(join(cwd, OUT))).toBe(false);
  });

  it.each(['ko', 'constructor'])(
    'refuses a locale the cache has no drafts for: %s',
    (target) => {
      const run = scaffold(workspace({ ja: everyDraft() }), target);
      expect(run.stderr).toBe(
        `✗ no cached translations for "${target}" — run i18n:translate\n`,
      );
      expect(run.status).toBe(1);
    },
  );
});
