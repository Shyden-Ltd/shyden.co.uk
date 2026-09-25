import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { filesUnder, searched } from '../source-files';
import { codeWithoutComments } from './source-text';
import { cssRules, type CssRule } from './css-rules';
import {
  customProperties,
  darkBlocks,
  rootBlock,
  rootTokens,
  themeTokens,
  tokensCss,
} from '../palette';
import { SHYTALK_MARK } from '../../src/lib/shytalk-brand';

/**
 * The structure of tokens.css (#142).
 *
 * A token nothing reads is the cheapest evidence that a described feature
 * was never built: `--violet` and `--deep` were documented as "gradient stops
 * in the page atmosphere" while the atmosphere drew from its own tokens.
 */
describe('the token file', () => {
  it('declares no token that nothing reads', () => {
    const tokens = [...rootTokens(tokensCss()).keys()];
    const code = filesUnder('src', (path) => /\.(astro|css|ts)$/.test(path))
      .map((file) => codeWithoutComments(file, readFileSync(file, 'utf8')))
      .join('\n');
    const unread = tokens.filter(
      (name) => !new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(code),
    );

    expect(
      searched(unread, { of: tokens, what: 'tokens on bare :root' }),
    ).toEqual([]);
  });
});

/** A block's declarations as `property: value` lines, sorted. */
const declared = (rule: CssRule): string[] =>
  rule.declarations
    .map(({ property, value }) => `${property}: ${value}`)
    .sort();

/**
 * The two themes (#142 §4). Aurora is written twice, because the unstamped
 * state needs its media query and the stamped state must not. Two copies of a
 * palette drift unless something holds them together, so every block that
 * declares `color-scheme: dark` is found by that declaration and compared.
 */
describe('the two themes (#142)', () => {
  it('declares light on bare :root', () => {
    expect(rootBlock(tokensCss()).declarations).toContainEqual({
      property: 'color-scheme',
      value: 'light',
    });
  });

  it('declares color-scheme only beside a palette', () => {
    // Compared by chain, never by identity: each reader parses afresh, so
    // the same block arrives as a different object from each of them.
    const css = tokensCss();
    const where = ({ chain }: CssRule) => chain.join(' { ');
    const palettes = new Set([rootBlock(css), ...darkBlocks(css)].map(where));
    const declaring = cssRules(css).filter(({ declarations }) =>
      declarations.some(({ property }) => property === 'color-scheme'),
    );
    const stray = declaring.map(where).filter((chain) => !palettes.has(chain));
    expect(
      searched(stray, { of: declaring, what: 'rules declaring color-scheme' }),
    ).toEqual([]);
  });

  it('keeps every dark block screen-only, and has both states it needs', () => {
    const chains = darkBlocks(tokensCss()).map(({ chain }) =>
      chain.join(' { '),
    );
    const onPaper = chains.filter((chain) => !/^@media screen\b/.test(chain));
    expect(searched(onPaper, { of: chains, what: 'dark blocks' })).toEqual([]);
    expect(chains).toEqual(
      expect.arrayContaining([
        "@media screen and (prefers-color-scheme: dark) { :root:not([data-theme='light'])",
        "@media screen { :root[data-theme='dark']",
      ]),
    );
  });

  it('declares the same tokens, with the same values, in every dark block', () => {
    const [first, ...rest] = darkBlocks(tokensCss()).map(declared);
    const drifted = rest.flatMap((block, i) => [
      ...block
        .filter((line) => !first.includes(line))
        .map((line) => `dark block ${i + 2} adds ${line}`),
      ...first
        .filter((line) => !block.includes(line))
        .map((line) => `dark block ${i + 2} lacks ${line}`),
    ]);
    expect(
      searched(drifted, { of: rest, what: 'dark blocks after the first' }),
    ).toEqual([]);
  });

  it('defines no token only inside a dark block', () => {
    const css = tokensCss();
    const root = rootTokens(css);
    const dark = darkBlocks(css).flatMap((block) => [
      ...customProperties(block).keys(),
    ]);
    const orphans = [...new Set(dark)].filter((name) => !root.has(name));
    expect(
      searched(orphans, { of: dark, what: 'tokens the dark blocks declare' }),
    ).toEqual([]);
  });

  it('puts the ShyTalk mark on its own tile in light, and on nothing in dark', () => {
    // The tile's colour now lives in two files (§3.4): SHYTALK_MARK, whose
    // level shytalk-brand.test.ts pins, and this token, held equal to it here.
    const css = tokensCss();
    expect(themeTokens(css, 'light').get('--wordmark-tile')).toBe(
      SHYTALK_MARK.tile,
    );
    expect(themeTokens(css, 'dark').get('--wordmark-tile')).toBe('transparent');
    expect(themeTokens(css, 'dark').get('--wordmark-pad')).toBe('0');
  });
});
