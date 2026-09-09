import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MVP_LOCALES } from '../../src/lib/i18n/metadata';
import {
  DO_NOT_TRANSLATE,
  deeplEndpoint,
  deeplLanguage,
  needsTranslation,
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
