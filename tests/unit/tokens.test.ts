import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { filesUnder, searched } from '../source-files';
import { codeWithoutComments } from './source-text';
import { rootTokens, tokensCss } from '../palette';

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
