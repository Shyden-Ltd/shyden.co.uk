import { describe, expect, it } from 'vitest';
import {
  ATMOSPHERE,
  atmosphereLayers,
  computedForm,
  darkBlocks,
  rootTokens,
  subsets,
  themeTokens,
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

describe('the themes', () => {
  const css = [
    ':root {\n  color-scheme: light;\n  --bg: #eef1f4;\n  --ink: #111821;\n  --font: serif;\n}',
    "@media screen and (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n    color-scheme: dark;\n    --bg: #04070d;\n    --ink: #eaf2ff;\n  }\n}",
    "@media screen {\n  :root[data-theme='dark'] {\n    color-scheme: dark;\n    --bg: #04070d;\n    --ink: #eaf2ff;\n  }\n  :root[data-theme-switch] {\n    --switch-display: inline-flex;\n  }\n}",
    '@media print {\n  :root {\n    --bg: #fff;\n  }\n}',
  ].join('\n');

  it('finds every dark block by its color-scheme, never by its selector', () => {
    expect(darkBlocks(css).map(({ chain }) => chain.join(' { '))).toEqual([
      "@media screen and (prefers-color-scheme: dark) { :root:not([data-theme='light'])",
      "@media screen { :root[data-theme='dark']",
    ]);
  });

  it('reads light from bare :root, and dark as bare :root with a dark block laid over it', () => {
    expect([...themeTokens(css, 'light')]).toEqual([
      ['--bg', '#eef1f4'],
      ['--ink', '#111821'],
      ['--font', 'serif'],
    ]);
    expect([...themeTokens(css, 'dark')]).toEqual([
      ['--bg', '#04070d'],
      ['--ink', '#eaf2ff'],
      ['--font', 'serif'],
    ]);
  });

  it('refuses a dark theme that no block declares', () => {
    expect(() => themeTokens(':root {\n  --bg: #fff;\n}', 'dark')).toThrow(
      'no block in src/styles/tokens.css declares color-scheme: dark',
    );
  });

  it('writes a colour the way getComputedStyle reports it', () => {
    expect(computedForm('#eef1f4')).toBe('rgb(238, 241, 244)');
    expect(computedForm('rgb(17 24 33 / 0.05)')).toBe('rgba(17, 24, 33, 0.05)');
    expect(computedForm('transparent')).toBe('rgba(0, 0, 0, 0)');
    expect(() => computedForm('currentColor')).toThrow('not a colour');
  });
});
