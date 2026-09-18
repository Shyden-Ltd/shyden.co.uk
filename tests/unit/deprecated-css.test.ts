import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filesUnder, searched } from '../source-files';
import { astroStyleViews, withoutCssComments } from './source-text';

/**
 * CSS Masking deprecates `clip` in favour of `clip-path`, and a deprecated
 * property can lose support (#200). This site hides text from sight, while
 * keeping it for screen readers, with `clip-path: inset(50%)`, as
 * `BetaBadge.astro` does. Two recipes for one job means the next hidden label
 * copies whichever it finds first, so the old one is kept out here.
 *
 * Reads CSS with its comments stripped, so a comment naming the old recipe
 * cannot trip the guard. Reads each `<style>` body, never the whole `.astro`
 * file: template text such as "don't" opens a quote the CSS stripper never
 * sees closed, and every comment below it would then be read as CSS.
 */

/**
 * A `clip` declaration: the property where a declaration starts, in any case.
 * `clip-path`, a custom property such as `--clip`, and the `clip` keyword of
 * `overflow` are not one.
 */
const CLIP_DECLARATION = /(?:^|[{;])\s*(clip\s*:[^;}]*)/gi;

/** Every `clip` declaration in `css`, read with its comments stripped. */
const clipDeclarations = (css: string): string[] =>
  [...withoutCssComments(css).matchAll(CLIP_DECLARATION)].map(
    ([, declaration]) => declaration.trim(),
  );

/** Each stylesheet under `dir`: a `.css` file whole, an `.astro` file's `<style>`s. */
const stylesheetsUnder = (dir: string): Array<{ file: string; css: string }> =>
  filesUnder(dir, (path) => /\.(astro|css)$/.test(path)).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const sheets = file.endsWith('.astro') ? astroStyleViews(text) : [text];
    return sheets.map((css) => ({ file, css }));
  });

describe('no stylesheet declares the deprecated clip property (#200)', () => {
  it('reads a clip declaration however it is spelled', () => {
    const css = [
      '.a { position: absolute; clip: rect(0 0 0 0); }',
      '.b{CLIP:auto}',
      '@media (min-width: 600px) { .c { clip :rect(1px, 2px, 3px, 4px) } }',
    ].join('\n');
    expect(clipDeclarations(css)).toEqual([
      'clip: rect(0 0 0 0)',
      'CLIP:auto',
      'clip :rect(1px, 2px, 3px, 4px)',
    ]);
  });

  it('is not tripped by clip-path, a custom property, the keyword or a comment', () => {
    const css = [
      '.a { clip-path: inset(50%); }',
      '.b { --clip: 1px; overflow: clip; }',
      '.c { /* was: position: absolute; clip: rect(0 0 0 0); */ }',
    ].join('\n');
    expect(clipDeclarations(css)).toEqual([]);
  });

  it('finds none in any stylesheet under src/', () => {
    const sheets = stylesheetsUnder('src');
    const findings = sheets.flatMap(({ file, css }) =>
      clipDeclarations(css).map((declaration) => `${file}: ${declaration}`),
    );
    expect(
      searched(findings, {
        of: sheets.map(({ css }) => css),
        what: 'stylesheets under src/',
      }),
    ).toEqual([]);
  });
});
