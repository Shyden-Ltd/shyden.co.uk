import { describe, expect, it } from 'vitest';
import {
  ATMOSPHERE,
  atmosphereLayers,
  rootTokens,
  subsets,
  worstContrast,
} from '../palette';

describe('rootTokens', () => {
  it('reads the bare :root block, never the print block or a theme block', () => {
    const css = [
      '@media print {\n  :root { --bg: #fff; }\n}',
      ':root {\n  --bg: #04070d;\n  --ink: #eaf2ff;\n}',
      ":root[data-theme='dark'] { --bg: #000; }",
    ].join('\n');
    expect([...rootTokens(css)]).toEqual([
      ['--bg', '#04070d'],
      ['--ink', '#eaf2ff'],
    ]);
  });

  it('refuses a stylesheet with no bare :root, or with two', () => {
    expect(() => rootTokens('@media print { :root { --a: #fff; } }')).toThrow(
      'found 0',
    );
    expect(() =>
      rootTokens(':root { --a: #fff; }\n:root { --b: #000; }'),
    ).toThrow('found 2');
  });
});

describe('atmosphereLayers', () => {
  const before = (background: string): string =>
    `body::before {\n  content: '';\n  background: ${background};\n}\n` +
    '@media print {\n  body::before { display: none; }\n}\n';

  it('lists the layers top-first, in declaration order, one token each', () => {
    expect(
      atmosphereLayers(
        before(
          'radial-gradient(60rem 40rem at 12% -8%, var(--a), transparent 70%), ' +
            'linear-gradient(100deg, transparent 30%, var(--b) 50%, transparent 70%)',
        ),
      ),
    ).toEqual(['--a', '--b']);
  });

  it('refuses a layer it could not score', () => {
    expect(() =>
      atmosphereLayers(
        before(
          'radial-gradient(#fff, transparent), linear-gradient(var(--a), transparent)',
        ),
      ),
    ).toThrow('layer 1 names 0 tokens');
    expect(() =>
      atmosphereLayers(before('linear-gradient(var(--a), var(--b))')),
    ).toThrow('layer 1 names 2 tokens');
  });

  it('refuses a stylesheet with no screen body::before', () => {
    expect(() =>
      atmosphereLayers(
        '@media print { body::before { background: var(--a); } }',
      ),
    ).toThrow('body::before');
  });
});

describe('subsets', () => {
  it('lists all 2^n subsets, each keeping the original order', () => {
    const all = subsets(['a', 'b', 'c']);
    expect(all).toHaveLength(8);
    expect(all).toContainEqual([]);
    expect(all).toContainEqual(['a', 'c']);
    expect(all).toContainEqual(['a', 'b', 'c']);
    expect(all.filter((s) => s.join('') !== [...s].sort().join(''))).toEqual(
      [],
    );
  });
});

describe('worstContrast', () => {
  // Studio's shape (#142 spec §6.1): dark ink on a white ground, one layer
  // that darkens it and one, on top, that lightens it again. Every layer at
  // once passes; the darkening layer alone does not.
  const from = new Map([
    ['--bg', '#ffffff'],
    ['--ink', '#6f6f6f'],
    ['--shaft', 'rgb(255 255 255 / 0.9)'],
    ['--pool', 'rgb(0 0 0 / 0.15)'],
  ]);
  const layers = ['--shaft', '--pool'];

  it('finds the worst subset where every layer at once passes', () => {
    const everyLayer = worstContrast(
      ['--ink'],
      ['--shaft', '--pool', '--bg'],
      [],
      from,
    );
    expect(
      typeof everyLayer === 'string' ? 0 : everyLayer.ratio,
    ).toBeGreaterThan(4.5);
    expect(
      worstContrast(['--ink'], [ATMOSPHERE, '--bg'], layers, from),
    ).toEqual({
      ratio: expect.closeTo(3.56, 1),
      subset: ['--pool'],
    });
  });

  it('scores a pair that names no atmosphere once, as written', () => {
    expect(worstContrast(['--ink'], ['--bg'], layers, from)).toEqual({
      ratio: expect.closeTo(5.03, 1),
      subset: [],
    });
  });

  it('puts the same subset under the foreground and its ground', () => {
    // A border drawn over the atmosphere sits on the same pixel as the ground
    // it is judged against. Scored with independent subsets, the border over
    // no layer against the ground under the pool would read 1.49:1.
    const withBorder = new Map([...from, ['--line', 'rgb(0 0 0 / 0.3)']]);
    expect(
      worstContrast(
        ['--line', ATMOSPHERE, '--bg'],
        [ATMOSPHERE, '--bg'],
        ['--pool'],
        withBorder,
      ),
    ).toEqual({ ratio: expect.closeTo(2.04, 1), subset: ['--pool'] });
  });

  it('reports a stack it cannot flatten, rather than a ratio', () => {
    expect(worstContrast(['--missing'], ['--bg'], [], from)).toBe(
      '--missing is not defined in src/styles/tokens.css',
    );
  });
});
