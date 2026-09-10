import { describe, it, expect } from 'vitest';
import { nonEmpty } from '../source-files';
import { en } from '../../src/lib/i18n/en';
import { zh } from '../../src/lib/i18n/zh';
import { vi } from '../../src/lib/i18n/vi';
import { th } from '../../src/lib/i18n/th';
import { LOCALES } from '../../src/lib/i18n';
import {
  needsTranslation,
  untranslatedKeys,
} from '../../src/lib/i18n/translate';

/**
 * What is still English in a catalogue that claims to be another language.
 *
 * #22 seeded zh, vi and th from DeepL. Two kinds of key did not come back
 * translated, and both are invisible on the page — a Chinese error message in
 * English looks like a message, not like a gap:
 *
 * 1. THE 51 PARAMETERISED MESSAGES. Every one is an arrow function, a
 *    translator returns prose rather than a function body, and the operator's
 *    instruction (2026-09-09) was that these are listed for a human rather
 *    than guessed at. `scripts/i18n-scaffold.mjs` emits them as `en.<key>`, so
 *    they are the English function BY REFERENCE.
 *
 * 2. STRINGS DEEPL HANDED BACK UNCHANGED. Mostly legitimate — `M` and `F` are
 *    the roster's sex labels, single letters with nothing to translate — but
 *    `rosterColApart` came back as the English word "Apart" in Chinese, which
 *    is a miss, not a decision.
 *
 * This file is the difference between those being TRACKED and merely being
 * true. The sets are asserted exactly: a new gap fails, and a gap somebody
 * closes also fails until they take it off the list. That is the same
 * contract tests/unit/parked-tests.test.ts holds `test.fixme` to, for the
 * same reason — #32 shipped a real bug behind a comment claiming it was
 * tracked when no ticket existed.
 */

const MACHINE_SEEDED = { zh, vi, th } as const;

/**
 * Locales this file deliberately does not check, and who checks them instead.
 *
 * `en` is the source. `id` is hand-written, and `tests/unit/i18n.test.ts`
 * already asserts its identical-to-English strings against its own
 * `ALLOWED_IDENTICAL` list -- which is where `speedNormal` ("Normal" is the
 * Indonesian word too) is documented. A second list of the same thing here
 * would be a second thing to keep in step, and this repo has been bitten by
 * exactly that. The completeness check below is what stops a locale falling
 * between the two files.
 */
const CHECKED_ELSEWHERE = ['en', 'id'] as const;

/** Every leaf path in the English catalogue, `errors.TOO_MANY_STUDENTS` style. */
/**
 * The recursion, kept private so an empty sub-walk stays ordinary HERE.
 *
 * A function, a number or an empty object contributes nothing, and must be
 * allowed to. The refusal belongs to the top-level form and nowhere else --
 * the shape `walk`/`filesUnder` settled on in tests/source-files.ts (#84).
 */
function walkLeaves(table: unknown, path = ''): string[] {
  if (Array.isArray(table))
    return table.flatMap((v, i) => walkLeaves(v, `${path}[${i}]`));
  if (table && typeof table === 'object')
    return Object.entries(table).flatMap(([k, v]) =>
      walkLeaves(v, path ? `${path}.${k}` : k),
    );
  return [path];
}

/**
 * Every leaf path in a catalogue, PROVED non-empty before a guard reads it.
 *
 * Same reasoning as `deepStrings` in i18n.test.ts and as `filesUnder` in
 * tests/source-files.ts: a walker that returns `[]` makes every absence
 * assertion downstream of it pass having read nothing (#84).
 */
function leafPaths(table: unknown): string[] {
  return nonEmpty(walkLeaves(table), 'catalogue leaf paths');
}

function valueAt(table: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => {
    const match = /^(.*?)((?:\[\d+\])*)$/.exec(part)!;
    let next: unknown = match[1]
      ? (node as Record<string, unknown>)?.[match[1]]
      : node;
    for (const index of match[2].match(/\d+/g) ?? [])
      next = (next as unknown[])?.[Number(index)];
    return next;
  }, table);
}

const sameAsEnglish = (table: unknown, predicate: (v: unknown) => boolean) =>
  leafPaths(en)
    .filter((p) => predicate(valueAt(en, p)))
    .filter((p) => valueAt(table, p) === valueAt(en, p));

/**
 * The English strings each locale still carries, by key.
 *
 * `M` and `F` are the roster's own sex labels. They are single letters with
 * no prose in them, they are what `CSV_LOCALES[locale].sex` must agree with,
 * and DeepL returns them unchanged in every language — so they are expected
 * here rather than a gap. `rosterColApart` in Chinese is a genuine miss.
 */
const ENGLISH_STRINGS: Record<string, readonly string[]> = {
  zh: ['rosterColApart', 'rosterSexMale', 'rosterSexFemale'],
  vi: ['rosterSexMale', 'rosterSexFemale'],
  th: ['rosterSexMale', 'rosterSexFemale'],
};

describe('what is still English in each catalogue', () => {
  it('accounts for every locale the site serves', () => {
    // A locale in LOCALES that is neither checked here nor named above would
    // simply go unchecked -- the exclusion-list failure this repo has now paid
    // for twice. Adding a sixth language fails here until it is classified.
    expect([...LOCALES].sort()).toEqual(
      [...CHECKED_ELSEWHERE, ...Object.keys(MACHINE_SEEDED)].sort(),
    );
  });

  for (const [locale, table] of Object.entries(MACHINE_SEEDED)) {
    it(`${locale}: every parameterised message is the English function, by reference`, () => {
      const stillEnglish = sameAsEnglish(
        table,
        (v) => typeof v === 'function',
      ).sort();
      const everyFunction = untranslatedKeys(en)
        .filter((p) => typeof valueAt(en, p) === 'function')
        .sort();

      // All 51, exactly: one translated is progress and must come off this
      // list; one MISSING would mean a hand-written body nobody reviewed.
      expect(stillEnglish).toEqual(everyFunction);
    });

    it(`${locale}: carries exactly the documented English strings`, () => {
      const stillEnglish = sameAsEnglish(table, needsTranslation).sort();
      expect(
        stillEnglish,
        'an English string appeared in, or disappeared from, this catalogue -- ' +
          'update ENGLISH_STRINGS above so the gap stays tracked',
      ).toEqual([...ENGLISH_STRINGS[locale]].sort());
    });

    it(`${locale}: has no empty or whitespace-only copy`, () => {
      const blank = leafPaths(en)
        .filter((p) => typeof valueAt(table, p) === 'string')
        .filter((p) => (valueAt(table, p) as string).trim() === '');
      expect(blank, 'a blank string renders as nothing at all').toEqual([]);
    });
  }
});
