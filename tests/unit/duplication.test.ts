import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_RATIO,
  MIN_PRINTED_LENGTH,
  functionBodiesIn,
  functionBodiesOf,
  duplicatePairs,
  similarity,
  type DuplicatePair,
} from './duplication';
import { searched, trackedFiles } from '../source-files';

/**
 * Every file a duplicate could live in, from git rather than a list.
 *
 * #24's sweep worked from the file list written into its own issue and
 * covered only those files; #60 and #65 then found six survivors. #277's own
 * ticket named six pairs, and deriving the set from disk found twenty-seven.
 */
const SCANNED = trackedFiles(
  (path) => /^(src|tests|scripts)\//.test(path) && /\.(ts|mjs)$/.test(path),
);

const DECLARATIONS = SCANNED.flatMap(functionBodiesIn);
const PAIRS = duplicatePairs(DECLARATIONS);

/** `file:name <-> file:name`, without line numbers, which drift. */
const keyOf = (pair: DuplicatePair): string =>
  [`${pair.a.file}:${pair.a.name}`, `${pair.b.file}:${pair.b.name}`]
    .sort()
    .join('  <->  ');

/**
 * Pairs read and deliberately left separate, each with the reason a reader
 * needs before deciding to collapse it after all.
 *
 * An entry here is a VERDICT, not a suppression: the liveness test below
 * fails when one stops matching a real pair, so a line cannot outlive the
 * code it excuses and quietly start excusing something else.
 */
const SEPARATE: ReadonlyMap<string, string> = new Map([]);

describe('a function body has one home across files', () => {
  it('scans the whole tracked tree, not a list', () => {
    // Anti-vacuity: an empty scan satisfies every assertion below.
    expect(SCANNED.length).toBeGreaterThan(100);
    expect(SCANNED).toContain('src/lib/grouping.ts');
    expect(SCANNED).toContain('scripts/test-devices.mjs');
    expect(DECLARATIONS.length).toBeGreaterThan(1000);
  });

  it('finds no cross-file duplicate that has not been given a verdict', () => {
    const findings = PAIRS.filter((pair) => !SEPARATE.has(keyOf(pair))).map(
      (pair) =>
        `${pair.ratio.toFixed(3)}  ${pair.a.name} ${pair.a.at}  <->  ${pair.b.name} ${pair.b.at}`,
    );
    expect(
      searched(findings, { of: DECLARATIONS, what: 'function bodies' }),
      findings.join('\n'),
    ).toEqual([]);
  });

  it('carries no verdict for a pair that no longer exists', () => {
    // An allow-list entry outliving its code is how a guard stops guarding:
    // the next duplicate between those two files inherits the excuse.
    const live = new Set(PAIRS.map(keyOf));
    expect([...SEPARATE.keys()].filter((key) => !live.has(key))).toEqual([]);
  });
});

describe('the scan itself', () => {
  it('scores an identical body at 1 and an unrelated one at 0', () => {
    const body = 'x'.repeat(MIN_PRINTED_LENGTH);
    expect(similarity(body, body)).toBe(1);
    expect(similarity(body, 'y'.repeat(MIN_PRINTED_LENGTH))).toBe(0);
  });

  it('scores a one-character change just under 1', () => {
    const body = 'x'.repeat(100);
    const ratio = similarity(body, `${body.slice(0, 99)}y`);
    expect(ratio).toBeGreaterThan(DUPLICATE_RATIO);
    expect(ratio).toBeLessThan(1);
  });

  it('reports 0 rather than a ratio it stopped measuring', () => {
    // The banded distance aborts once the pair cannot come in under the
    // threshold, so there is no measured ratio below it to report, and no
    // caller may read one.
    expect(
      similarity('a'.repeat(200), `${'a'.repeat(100)}${'b'.repeat(100)}`),
    ).toBe(0);
  });

  it('ignores the name a body is assigned to', () => {
    // The renamed copies are the ones a name-based scan cannot see:
    // `anonymousStudent`, `isMvpLocale`, `findIosDevice` (#277).
    const shape = (name: string) =>
      [
        `const ${name} = (value: number): number => {`,
        '  const c = value / 255;',
        '  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;',
        '};',
      ].join('\n');
    const [a] = functionBodiesOf(shape('channel'), 'a.ts');
    const [b] = functionBodiesOf(shape('lin'), 'b.ts');
    expect(similarity(a.text, b.text)).toBe(1);
  });

  it('ignores comments, so prose is not behaviour', () => {
    const body = (note: string) =>
      [
        'const f = (value: number): number => {',
        `  /* ${note} */`,
        '  const c = value / 255;',
        '  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;',
        '};',
      ].join('\n');
    const [a] = functionBodiesOf(body('one reason'), 'a.ts');
    const [b] = functionBodiesOf(body('a completely different reason'), 'b.ts');
    expect(similarity(a.text, b.text)).toBe(1);
  });

  it('finds a body nested inside another function', () => {
    // #227's scan compared top-level declarations only, which is why three
    // copies of the luminance formula sat inside `page.evaluate()` callbacks
    // unreported until #277.
    const nested = `
      const outer = async () => {
        const inner = (value: number): number => {
          const c = value / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return inner(1);
      };`;
    const names = functionBodiesOf(nested, 'a.ts').map((d) => d.name);
    expect(names).toContain('inner');
    expect(names).toContain('outer');
  });

  it('reports a duplicated region once, at its outermost match', () => {
    const source = `
      const outer = async (value: number) => {
        const inner = (v: number): number => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return inner(value) + inner(value) + inner(value);
      };`;
    const pairs = duplicatePairs([
      ...functionBodiesOf(source, 'a.ts'),
      ...functionBodiesOf(source, 'b.ts'),
    ]);
    // Both `outer` and `inner` match across the two files; only `outer` is
    // reported, because a report that lists the same finding at every depth
    // is one a reader triages by scrolling past.
    expect(pairs.map((pair) => [pair.a.name, pair.b.name])).toEqual([
      ['outer', 'outer'],
    ]);
  });

  it('never pairs two bodies in the same file', () => {
    const source = `
      const first = (value: number): number => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const second = (value: number): number => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };`;
    expect(duplicatePairs(functionBodiesOf(source, 'a.ts'))).toEqual([]);
  });

  it('ignores a body shorter than the floor', () => {
    const source = 'const f = (a: number) => a + 1;';
    expect(functionBodiesOf(source, 'a.ts')).toEqual([]);
  });
});
