import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { filesUnder, nonEmpty, searched } from '../source-files';
import { withoutCssComments, withoutTsComments } from './source-text';
import { SHYTALK_MARK, asComputedRgb } from '../../src/lib/shytalk-brand';

/**
 * ShyTalk's brand mark has exactly one home (#17).
 *
 * The values belong to a product this repo does not own, so they WILL change.
 * The guard is not against them changing — it is against them being spelled
 * out in more than one place, which is what makes changing them expensive and
 * what makes a passing test a coincidence.
 */
/**
 * The only two places these values may be spelled out.
 *
 * `HOME` holds the value. `PIN` asserts the value is the RIGHT one, and must
 * write the literals to do it — a pin that reads them from `HOME` compares
 * the source against itself and passes at any colour (#117). Every other
 * spelling is a copy, and copies are what make a rebrand expensive.
 */
const HOME = 'src/lib/shytalk-brand.ts';
const PIN = 'tests/unit/shytalk-brand.test.ts';
const ALLOWED = new Set([HOME, PIN]);
const SCAN = ['src', 'tests'];

/**
 * Every way a brand colour can be written: the hex, and the bare CHANNEL
 * TRIPLE.
 *
 * The triple rather than a wrapped `rgb(...)`, because the first version of
 * this guard searched for `rgb(208, 188, 255)` and missed
 * `rgba(208, 188, 255, 0.3)` sitting in a text-shadow two lines from a hit it
 * did find. A guard that knows one syntax is a guard against that syntax.
 */
const spellings = (): string[] =>
  Object.values(SHYTALK_MARK).flatMap((hex) => [
    hex.toLowerCase(),
    asComputedRgb(hex).replace(/^rgb\(|\)$/g, ''),
  ]);

const scannedFiles = (): string[] =>
  nonEmpty(
    SCAN.flatMap((dir) =>
      filesUnder(dir, (p) => /\.(ts|tsx|astro|css)$/.test(p)),
    ),
    `source files under ${SCAN.join(', ')}`,
  );

describe("ShyTalk's brand mark has one home", () => {
  /**
   * The LEVEL, pinned literally and separately from everything derived.
   *
   * Every other assertion here compares the repo against `SHYTALK_MARK`, so
   * moving a value moves both sides together and proves only the
   * relationship (#117). These are the actual colours of the real product.
   */
  it('is the mark the real product uses', () => {
    expect(SHYTALK_MARK.shy).toBe('#e8e0f0');
    expect(SHYTALK_MARK.talk).toBe('#d0bcff');
    expect(SHYTALK_MARK.tile).toBe('#0f0d15');
  });

  it('converts a hex to the form a computed style reports', () => {
    expect(asComputedRgb('#e8e0f0')).toBe('rgb(232, 224, 240)');
    expect(asComputedRgb('#0f0d15')).toBe('rgb(15, 13, 21)');
    expect(asComputedRgb('#fff')).toBe('rgb(255, 255, 255)');
  });

  it('searches the channel triple, so rgba() cannot hide a brand colour', () => {
    // The concrete miss this closes: `rgba(208, 188, 255, 0.3)` in a
    // text-shadow, two lines from a hex the guard DID catch.
    expect(spellings()).toContain('208, 188, 255');
    expect(spellings().some((s) => s.startsWith('rgb('))).toBe(false);
  });

  it('exempts exactly two files, and both exist', () => {
    // An exemption naming a path that does not exist exempts nothing and
    // reads identically to one that works.
    const files = scannedFiles();
    for (const allowed of ALLOWED) {
      expect(files, `${allowed} is not in the scanned set`).toContain(allowed);
    }
    expect(ALLOWED.size).toBe(2);
  });

  it('is spelled out nowhere else in the repo', () => {
    const files = scannedFiles();
    const forms = spellings();

    const offenders = files.flatMap((file) => {
      if (ALLOWED.has(file)) return [];
      const raw = readFileSync(file, 'utf8');
      // Comments stripped: a comment NAMING the colour is documentation, and
      // a guard tripped by its own explanation is noise. The assertion is
      // about what the code spells out.
      const code = file.endsWith('.css')
        ? withoutCssComments(raw)
        : withoutTsComments(withoutCssComments(raw));
      const lower = code.toLowerCase();
      return forms
        .filter((form) => lower.includes(form.toLowerCase()))
        .map((form) => `${file} spells out ${form}`);
    });

    expect(
      searched(offenders, { of: files, what: 'source files scanned' }),
    ).toEqual([]);
  });
});
