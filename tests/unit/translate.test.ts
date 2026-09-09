import { describe, it, expect } from 'vitest';
import { blankCommentLines } from './source-text';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MVP_LOCALES } from '../../src/lib/i18n/metadata';
import { en } from '../../src/lib/i18n/en';
import { siteEn } from '../../src/lib/i18n/site';
import { CSV_LOCALES } from '../../src/lib/csv-locale';
import {
  CSV_KEYS_NOT_TRANSLATED,
  DO_NOT_TRANSLATE,
  buildRequestBody,
  escapeXml,
  deeplEndpoint,
  deeplLanguage,
  needsTranslation,
  protectTerms,
  unescapeXml,
  unprotectTerms,
  untranslatedKeys,
  TRANSLATABLE_LOCALES,
} from '../../src/lib/i18n/translate';

/**
 * #21 Stage 5. The DeepL harness, minus the network.
 *
 * Built and NOT run — operator instruction, 2026-09-09. `LOCALES` stays
 * `['en','id']` and no translation is committed by this stage. What ships is
 * the logic, unit-tested, so that when #22 does run it the decisions have
 * already been reviewed: which host the key routes to, what DeepL calls each
 * language, and which strings must never be sent at all.
 *
 * Pure, exactly as CLAUDE.md requires of `gloryPoints.ts` and `grouping.ts`:
 * `scripts/i18n-translate.mjs` only wires the I/O and the fetch. Everything
 * below can therefore be tested without a key, without a network, and without
 * spending a character of a free-tier quota.
 */

/**
 * Every distinct translatable string the harness collects -- all three
 * catalogues, not just `en`.
 *
 * Walked here rather than imported from the script, so this does not depend
 * on the thing it checks. Scoped to `en` alone until #22, which is half of
 * why the 400 on "Registered in England & Wales." went unpredicted: the guard
 * was looking at a catalogue the offending string was not in. A hand-written
 * list of things to check misses the one that breaks -- CLAUDE.md's own words,
 * and the second time this repo has paid for it.
 */
function collectCatalogue(): string[] {
  const out = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === 'object')
      return Object.values(value).forEach(walk);
    if (needsTranslation(value)) out.add(value as string);
  };
  walk(en);
  walk(siteEn);
  walk(
    Object.fromEntries(
      Object.entries(CSV_LOCALES.en).filter(
        ([key]) => !CSV_KEYS_NOT_TRANSLATED.includes(key),
      ),
    ),
  );
  return [...out];
}

describe('the DeepL key decides the host', () => {
  it('routes a free key to the free host', () => {
    // The whole reason this function exists. A Free-plan key ends `:fx` and
    // is REJECTED by api.deepl.com — the request does not fail over, it 403s.
    expect(deeplEndpoint('abc123:fx')).toContain('api-free.deepl.com');
  });

  it('routes a pro key to the paid host', () => {
    expect(deeplEndpoint('abc123')).toContain('api.deepl.com');
    expect(deeplEndpoint('abc123')).not.toContain('api-free');
  });

  it('survives the whitespace a real .env file carries', () => {
    // `DEEPL_API_KEY=abc:fx\n` read naively keeps the newline, and
    // `endsWith(':fx')` is then false — a Free key silently sent to the paid
    // host, which is a 403 at the end of a long run.
    expect(deeplEndpoint(' abc123:fx\n')).toContain('api-free.deepl.com');
  });

  it('never puts the key in the URL it returns', () => {
    // DeepL authenticates by header. A key in a URL reaches logs, CI output
    // and error messages — this is the one place it could leak by accident.
    const url = deeplEndpoint('super-secret-key:fx');
    expect(url).not.toContain('super-secret-key');
  });

  it('refuses an empty key rather than guessing a host', () => {
    expect(() => deeplEndpoint('')).toThrow();
    expect(() => deeplEndpoint('   ')).toThrow();
  });
});

describe('every MVP language has a DeepL code', () => {
  it('names one for each, with Chinese as Simplified', () => {
    for (const locale of MVP_LOCALES) {
      expect(deeplLanguage(locale), `${locale} has no DeepL code`).toBeTruthy();
    }
    // The ticket is explicit: ZH is Simplified. DeepL's plain `ZH` is
    // Simplified, but naming the variant leaves nothing to a default that
    // could change under us.
    expect(deeplLanguage('zh')).toBe('ZH-HANS');
    expect(deeplLanguage('en')).toBe('EN-GB');
  });

  it('offers exactly the MVP locales as targets, derived not copied', () => {
    // The script runs under plain Node and cannot load `metadata.ts` (its
    // `'./index'` import has no extension), so it takes the list from here.
    // This is what stops that becoming a hand-maintained second copy.
    expect([...TRANSLATABLE_LOCALES].sort()).toEqual([...MVP_LOCALES].sort());
  });

  it('asks for British English, matching the copy the site is written in', () => {
    // `EN` is ambiguous at DeepL and resolves to American English. The site
    // is British throughout (CLAUDE.md, and `en_GB` in LOCALE_METADATA).
    expect(deeplLanguage('en')).not.toBe('EN-US');
  });
});

describe('what must never be sent to a translator', () => {
  it('holds the names and the legal facts', () => {
    for (const term of [
      'Shyden',
      'ShyTalk',
      'Glory Points',
      '17110487', // the company number, as it appears in the footer
    ]) {
      expect(
        DO_NOT_TRANSLATE.some((t) => t === term),
        `${term} is translatable — a company name or a legal fact is not copy`,
      ).toBe(true);
    }
  });

  it('leaves a function alone, because a function is code', () => {
    // The catalogues hold arrow functions for every parameterised message
    // (`ioHandoverSent`, the whole of `errors`). A translator returns prose,
    // not a function body, so these are copied and flagged for a human.
    expect(needsTranslation('Add a student')).toBe(true);
    expect(needsTranslation((n: number) => `${n}`)).toBe(false);
    expect(needsTranslation('')).toBe(false);
  });

  it('leaves punctuation and symbols alone', () => {
    // `rosterColNumber` is "#" and carries no language of its own — already
    // an accepted identical string in tests/unit/i18n.test.ts.
    expect(needsTranslation('#')).toBe(false);
    expect(needsTranslation('—')).toBe(false);
  });
});

/**
 * #22. `DO_NOT_TRANSLATE` was a list nothing consulted.
 *
 * The block above asserts the list HOLDS the right terms, and that is all it
 * ever asserted. `scripts/i18n-translate.mjs` imported the list, printed its
 * LENGTH ("do-not-send 6 protected terms") and sent the batch raw; the
 * `ignore_tags: ['x']` on the request protected nothing, because nothing ever
 * emitted an `<x>` tag. The run for zh/vi/th returned "Shyden" intact in all
 * three languages by DeepL's own proper-noun handling -- luck, not a control.
 * Presence is not the assertion, exactly as the supply-chain guard (#23) and
 * the prod-smoke path list (#21 Stage 4) both learned.
 *
 * Only one of the six terms occurs in today's catalogue, which is why nothing
 * looked wrong. The tests below assert the EFFECT: that the text handed to
 * DeepL carries the tags, and that what comes back is unwrapped again.
 */
describe('protected terms are wrapped before they are sent', () => {
  it('wraps a protected term in the tag the request tells DeepL to ignore', () => {
    expect(protectTerms('Built for teachers, by Shyden.')).toBe(
      'Built for teachers, by <x>Shyden</x>.',
    );
  });

  it('wraps the longest match first, so a name is never split', () => {
    // 'Shyden' is a prefix of 'Shyden Ltd'. Shortest-first would produce
    // `<x>Shyden</x> Ltd` and hand "Ltd" to the translator on its own.
    expect(
      protectTerms(escapeXml('Shyden Ltd is registered in England & Wales.')),
    ).toBe('<x>Shyden Ltd</x> is registered in <x>England &amp; Wales</x>.');
  });

  it('leaves a string with no protected term untouched', () => {
    const plain = 'Split a class fairly in one click.';
    expect(protectTerms(plain)).toBe(plain);
  });

  it('round-trips: unprotect undoes protect exactly', () => {
    for (const source of [
      'Built for teachers, by Shyden.',
      'Shyden Ltd, company 17110487, England & Wales.',
      'Nothing protected here at all.',
    ]) {
      expect(unprotectTerms(protectTerms(source))).toBe(source);
    }
  });

  it('strips the tags DeepL returns around a translated sentence', () => {
    // What actually comes back: the tag survives, the prose around it does not.
    expect(unprotectTerms('由 <x>Shyden</x> 专为教师打造。')).toBe(
      '由 Shyden 专为教师打造。',
    );
  });

  it('builds a request whose every text is protected', () => {
    const body = buildRequestBody(['Built by Shyden.', 'No names here.'], 'zh');
    expect(body.text).toEqual(['Built by <x>Shyden</x>.', 'No names here.']);
    expect(body.target_lang).toBe('ZH-HANS');
    expect(body.source_lang).toBe('EN');
    // The tag name in the payload must be the one protectTerms emits, or the
    // wrapping is decoration and the term is translated anyway.
    expect(body.ignore_tags).toContain('x');
    expect(body.tag_handling).toBe('xml');
  });

  it('is actually wired into the script, not merely available to it', () => {
    // The bug this whole block exists for was a pure function that was never
    // called. A source scan is the only surface available: the script is a
    // top-level-await module that calls the network on import.
    const script = blankCommentLines(
      readFileSync(join('scripts', 'i18n-translate.mjs'), 'utf8'),
    );
    expect(script, 'the request body must come from buildRequestBody').toMatch(
      /buildRequestBody\(/,
    );
    expect(script, 'the response must be unwrapped again').toMatch(
      /unprotectTerms\(/,
    );
  });

  it('escapes the ampersand that made DeepL answer 400', () => {
    // The footer's "Registered in England & Wales." A bare `&` is a malformed
    // entity to an XML parser, and `tag_handling: 'xml'` means DeepL is one.
    expect(escapeXml('England & Wales')).toBe('England &amp; Wales');
    expect(escapeXml('a < b > c')).toBe('a &lt; b &gt; c');
  });

  it('escapes the ampersand FIRST so it does not eat its own output', () => {
    // `<` -> `&lt;` -> `&amp;lt;` if `&` is escaped second. The round trip
    // below is what actually pins this; this names the reason.
    expect(escapeXml('<')).toBe('&lt;');
    expect(unescapeXml(escapeXml('&lt; is how you write <'))).toBe(
      '&lt; is how you write <',
    );
  });

  it('protects a term that carries an ampersand, in its escaped form', () => {
    // `DO_NOT_TRANSLATE` said 'England and Wales' until #22 and therefore
    // matched nothing: the copy has always said '&'.
    const body = buildRequestBody(['Registered in England & Wales.'], 'zh');
    expect(body.text[0]).toBe('Registered in <x>England &amp; Wales</x>.');
  });

  it("collects all three catalogues, not just the tool's", () => {
    // The round-trip guard below walks THIS file's copy of the collection, so
    // it cannot notice the HARNESS collecting less -- mutation-verified:
    // narrowing the walk to `en` alone left every test green, because no
    // string in `en` carries an ampersand and the round trip then holds
    // trivially. This binds the script to the three sources by name, which is
    // the direction that actually goes wrong: site copy was invisible to the
    // translator for an entire release because nothing asserted it was seen.
    const script = blankCommentLines(
      readFileSync(join('scripts', 'i18n-translate.mjs'), 'utf8'),
    );
    for (const [source, why] of [
      ['collect(en)', "the tool's own catalogue"],
      ['collect(siteEn)', 'header, footer, homepage and 404 copy'],
      ['CSV_LOCALES', 'every word a downloaded file carries'],
    ]) {
      expect(script, `the harness must collect ${why}`).toContain(source);
    }
  });

  it('round-trips every real catalogue string through the whole pipeline', () => {
    // The assertion that would have predicted the 400, over exactly what the
    // harness sends: escape, protect, then back again must be the identity.
    const broken = collectCatalogue().filter(
      (source) =>
        unescapeXml(unprotectTerms(protectTerms(escapeXml(source)))) !== source,
    );
    expect(
      broken,
      'these strings do not survive the request pipeline unchanged',
    ).toEqual([]);
  });
});

describe('the harness reports what a human still has to write', () => {
  it('lists every key it could not translate', () => {
    const report = untranslatedKeys({
      greeting: 'Hello',
      count: (n: number) => `${n}`,
      symbol: '#',
      nested: { deep: 'Yes', fn: () => 'x' },
    });
    expect(report.sort()).toEqual(['count', 'nested.fn', 'symbol']);
  });
});

describe('the harness never runs itself', () => {
  it('is not wired into build, dev or any test command', () => {
    // "Committed output, not a build step" — the ticket. A translate step in
    // `build` would spend quota on every CI run and make a deploy depend on a
    // third-party API being up.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    for (const [name, cmd] of Object.entries<string>(pkg.scripts)) {
      if (name === 'i18n:translate') continue;
      expect(cmd, `${name} runs the translator`).not.toContain(
        'i18n-translate',
      );
      expect(cmd, `${name} runs the translator`).not.toContain(
        'i18n:translate',
      );
    }
    expect(pkg.scripts['i18n:translate']).toBeTruthy();
  });

  it('documents the key without carrying one', () => {
    // `.env.example` is the committed half of a gitignored pair. It has to
    // name the variable — nobody can guess `DEEPL_API_KEY` — and must never
    // hold a value, which is the failure mode a committed example file has.
    const example = readFileSync('.env.example', 'utf8');
    expect(example).toContain('DEEPL_API_KEY=');
    expect(
      /^DEEPL_API_KEY=.+$/m.test(example),
      '.env.example carries a VALUE — that is a leaked key',
    ).toBe(false);
    // The suffix rule is the one thing a newcomer gets wrong, so it is
    // written where they will be looking when they paste the key.
    expect(example).toContain(':fx');
    expect(readFileSync('.gitignore', 'utf8')).toContain('.env.*');
  });

  it('is not imported by anything the site ships', () => {
    // This module is for the CLI. Reaching it from a page would put the
    // glossary — and whatever it grows into — in the browser bundle.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (
          /\.(ts|astro)$/.test(e.name) &&
          p !== 'src/lib/i18n/translate.ts'
        ) {
          if (readFileSync(p, 'utf8').includes('i18n/translate'))
            offenders.push(p);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});
