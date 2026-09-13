import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { filesUnder, nonEmpty, searched } from '../source-files';
import { stringLeaves } from './catalogue-leaves';
import { blankCommentLines } from './source-text';
import { en } from '../../src/lib/i18n/en';
import {
  MessageSyntaxError,
  describeMessage,
  isMessageTemplate,
} from '../../src/lib/i18n/message';
import {
  assembleMessage,
  buildRequestBody,
  messageUnits,
  translationUnits,
  unprotectTerms,
} from '../../src/lib/i18n/translate';

/**
 * #136. A message goes to the translator as the sentences it can say, never
 * as its syntax.
 *
 * Sent whole, `{n, plural, one {# group} other {# groups}}` is prose to DeepL:
 * it translates "other", moves the braces, and hands back something no parser
 * accepts. So the harness cuts a template into sentences, the translator takes
 * those, and the template is rebuilt around what comes back -- then checked,
 * because a translation that drops a slot still reads as a sentence.
 *
 * Every language the harness drafts for has one plural form, "other" (CLDR,
 * through Intl.PluralRules), so a plural is sent as its "other" sentence. A
 * language with more forms is refused rather than handed a draft that is wrong
 * for all but one of them.
 */

/** A translator that knows exactly these sentences. */
const translator =
  (table: Readonly<Record<string, string>>) =>
  (unit: string): string | undefined =>
    table[unit];

const OTHER_ONLY = ['other'];

describe('a message is sent as the sentences it can say', () => {
  it('sends a message whose slots are all named, as it is', () => {
    expect(messageUnits('{names} are marked to stay together.')).toEqual([
      '{names} are marked to stay together.',
    ]);
  });

  it('sends a plural as its "other" sentence, with the count as a named slot', () => {
    expect(
      messageUnits('{n, plural, one {# group} other {# groups}} left'),
    ).toEqual(['{n} groups left']);
  });

  it('sends a choice as one whole sentence per branch, in the order written', () => {
    expect(
      messageUnits('{sex, select, M {Boys} other {Girls}} joined {names}.'),
    ).toEqual(['Boys joined {names}.', 'Girls joined {names}.']);
  });

  it('collapses a plural inside each branch of a choice', () => {
    expect(
      messageUnits(
        '{s, select, over {{n, plural, one {# too many} other {# too many}}} other {Fine}}',
      ),
    ).toEqual(['{n} too many', 'Fine']);
  });

  it('refuses a message it could not rebuild, rather than guessing', () => {
    expect(() =>
      messageUnits(
        '{a, select, x {One} other {Two}} {b, select, y {Three} other {Four}}',
      ),
    ).toThrow(/one select/);
    expect(() =>
      messageUnits('{n, plural, =0 {No one} other {# left}}'),
    ).toThrow(/=0/);
  });

  it('protects every slot in the request, so a placeholder comes back as it went', () => {
    const [text] = buildRequestBody(['{names} joined {n} groups.'], 'zh').text;
    expect(text).toBe('<x>{names}</x> joined <x>{n}</x> groups.');
    expect(unprotectTerms('<x>{names}</x> 加入了 <x>{n}</x> 个小组。')).toBe(
      '{names} 加入了 {n} 个小组。',
    );
  });

  it('sends copy as it is, a message as its sentences, and a symbol not at all', () => {
    expect(translationUnits('Add a student')).toEqual(['Add a student']);
    expect(
      translationUnits('{n, plural, one {# group} other {# groups}}'),
    ).toEqual(['{n} groups']);
    expect(translationUnits('#')).toEqual([]);
  });

  it('sends no syntax for any real English message', () => {
    const units = nonEmpty(
      stringLeaves(en)
        .filter(([, text]) => isMessageTemplate(text))
        .flatMap(([, text]) => translationUnits(text)),
      'sentences sent for English messages',
    );
    const withSyntax = units.filter((unit) => {
      const { plurals, selects } = describeMessage(unit);
      return plurals.length + selects.length > 0;
    });
    expect(
      searched(withSyntax, {
        of: units,
        what: 'sentences sent for English messages',
      }),
    ).toEqual([]);
  });
});

describe('a translated message is rebuilt, and checked', () => {
  it('rebuilds a plural as its one sentence', () => {
    expect(
      assembleMessage(
        '{n, plural, one {# group} other {# groups}} left',
        translator({ '{n} groups left': '剩下 {n} 个小组' }),
        OTHER_ONLY,
      ),
    ).toBe('剩下 {n} 个小组');
  });

  it('rebuilds a choice around its translated sentences', () => {
    expect(
      assembleMessage(
        '{sex, select, M {Boys} other {Girls}} joined {names}.',
        translator({
          'Boys joined {names}.': '男孩加入了 {names}。',
          'Girls joined {names}.': '女孩加入了 {names}。',
        }),
        OTHER_ONLY,
      ),
    ).toBe(
      '{sex, select, M {男孩加入了 {names}。} other {女孩加入了 {names}。}}',
    );
  });

  it('refuses a sentence nobody translated', () => {
    expect(() =>
      assembleMessage('{names} left.', translator({}), OTHER_ONLY),
    ).toThrow(/\{names\} left\./);
  });

  it('refuses a translation that loses a slot, invents one or repeats one', () => {
    const unit = '{names} left after {n} rounds.';
    for (const translation of [
      '{names} 离开了。',
      '{names} 和 {who} 在 {n} 轮后离开了。',
      '{names} 在 {n} 轮后离开了 {names}。',
    ])
      expect(
        () =>
          assembleMessage(
            unit,
            translator({ [unit]: translation }),
            OTHER_ONLY,
          ),
        translation,
      ).toThrow(/slots/);
  });

  it('refuses a translation that is not a template', () => {
    expect(() =>
      assembleMessage(
        '{names} left.',
        translator({ '{names} left.': '{names 离开了。' }),
        OTHER_ONLY,
      ),
    ).toThrow(MessageSyntaxError);
  });

  it('refuses a language whose plurals need more than "other"', () => {
    // Russian has one, few, many and other. A draft cut from "other" alone
    // would be wrong for three of them and still read as right.
    const russian = ['few', 'many', 'one', 'other'];
    expect(() =>
      assembleMessage(
        '{n, plural, one {# group} other {# groups}}',
        translator({ '{n} groups': '{n} групп' }),
        russian,
      ),
    ).toThrow(/few, many, one, other/);
    // A message with no plural has nothing to collapse, in any language.
    expect(
      assembleMessage(
        '{names} left.',
        translator({ '{names} left.': '{names} ушли.' }),
        russian,
      ),
    ).toBe('{names} ушли.');
  });

  it('is how the scaffold writes every message', () => {
    const scaffold = blankCommentLines(
      readFileSync(join('scripts', 'i18n-scaffold.mjs'), 'utf8'),
    );
    expect(
      scaffold,
      'the scaffold must rebuild each message from its translated sentences',
    ).toMatch(/assembleMessage\(/);
  });
});

describe('the harness runs under plain Node', () => {
  it('loads every module a script imports from src/', () => {
    // The scripts run on Node's type stripping, which refuses TypeScript that
    // needs compiling -- a constructor parameter property is enough -- and
    // cannot resolve an import written without its extension. Vitest accepts
    // both, so only loading each module the way a script does proves it runs.
    const modules = nonEmpty(
      [
        ...new Set(
          filesUnder('scripts', (path) => path.endsWith('.mjs')).flatMap(
            (script) =>
              [
                ...blankCommentLines(readFileSync(script, 'utf8')).matchAll(
                  /from '(\.\.\/src\/[^']+)'/g,
                ),
              ].map(([, specifier]) => resolve(dirname(script), specifier)),
          ),
        ),
      ],
      'src modules the scripts import',
    );
    const refused = modules.flatMap((module) => {
      const run = spawnSync(
        process.execPath,
        [
          '--no-warnings',
          '--input-type=module',
          '-e',
          `await import(${JSON.stringify(pathToFileURL(module).href)});`,
        ],
        { encoding: 'utf8' },
      );
      if (run.status === 0) return [];
      const stderr = run.stderr.trim();
      return [
        `${relative('.', module)}: ${stderr.split('\n').find((line) => line.includes('Error')) ?? stderr}`,
      ];
    });
    expect(
      searched(refused, {
        of: modules,
        what: 'src modules the scripts import',
      }),
    ).toEqual([]);
  });
});
