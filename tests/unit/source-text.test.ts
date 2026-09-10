import { describe, it, expect } from 'vitest';
import {
  blankCommentLines,
  isCommentLine,
  withoutYamlComments,
  withoutYamlQuotes,
  withoutCommentLines,
  withoutIniComments,
  withoutTsComments,
  withoutMarkupComments,
} from './source-text';

/**
 * The stripper the source-text guards depend on. #24.
 *
 * If this is wrong, every guard built on it is wrong in one of two directions:
 * strip too little and a comment can satisfy an assertion (the defect this
 * exists to prevent), strip too much and real code disappears, which turns a
 * presence check green-by-deletion and an absence check red for no reason.
 */
describe('withoutTsComments', () => {
  it('removes a whole-line comment', () => {
    expect(withoutTsComments('// gone\nconst a = 1;')).not.toContain('gone');
  });

  it('removes a trailing comment but keeps the code before it', () => {
    const out = withoutTsComments('const a = 1; // @emulated-viewport');
    expect(out).toContain('const a = 1;');
    expect(out).not.toContain('@emulated-viewport');
  });

  it('removes block and doc comments', () => {
    expect(withoutTsComments('/** doc */ const a = 1;')).not.toContain('doc');
    expect(withoutTsComments('/* b */const a = 1;')).toContain('const a = 1;');
  });

  it('does NOT treat a URL as a comment', () => {
    // The regex version of this helper eats the rest of the line here, which
    // would hide any real code after a URL on the same line.
    const out = withoutTsComments("const u = 'https://a.test/x'; const b = 2;");
    expect(out).toContain('https://a.test/x');
    expect(out).toContain('const b = 2;');
  });

  it('keeps a comment marker that is inside a string literal', () => {
    // The string is the assertion's subject, not commentary about it.
    expect(withoutTsComments("expect(x).toContain('// TODO');")).toContain(
      "'// TODO'",
    );
  });

  it('keeps an escaped quote from ending the string early', () => {
    const out = withoutTsComments("const a = 'it\\'s'; // gone");
    expect(out).toContain("it\\'s");
    expect(out).not.toContain('gone');
  });

  it('handles template literals', () => {
    expect(withoutTsComments('const a = `a // b`;')).toContain('a // b');
  });
});

describe('withoutYamlComments', () => {
  it('removes an inline comment and drops the blank line it leaves', () => {
    expect(withoutYamlComments('key: v # note\n\nother: w')).toBe(
      'key: v\nother: w',
    );
  });
});

describe('withoutCommentLines', () => {
  it('removes a whole-line comment but leaves a trailing one alone', () => {
    // Trailing `#` in a workflow `run:` block can be inside a shell string,
    // and removing it would change the command being asserted about.
    const out = withoutCommentLines('# gone\nrun: echo "a # b"');
    expect(out).not.toContain('gone');
    expect(out).toContain('echo "a # b"');
  });
});

describe('withoutIniComments', () => {
  // npm's config format opens a comment with EITHER marker, which YAML does
  // not. `node-contract.test.ts` carried this as a private regex until #85 --
  // one of two `#`-dialect strippers the one-home guard could not see,
  // because that guard only ever looked for `//`.
  it('removes a # comment, a ; comment, and both inline', () => {
    // Distinctive tokens on purpose: `not.toContain('a')` would fail on
    // `save-exact` and prove nothing about comment stripping.
    const out = withoutIniComments(
      '# ALPHA\n; BETA\nengine-strict=true # GAMMA\nsave-exact=true ; DELTA',
    );
    for (const gone of ['ALPHA', 'BETA', 'GAMMA', 'DELTA'])
      expect(out, `${gone} survived`).not.toContain(gone);
    expect(out).toContain('engine-strict=true');
    expect(out).toContain('save-exact=true');
  });

  it('leaves a value alone when it carries neither marker', () => {
    expect(withoutIniComments('registry=https://registry.npmjs.org/')).toBe(
      'registry=https://registry.npmjs.org/',
    );
  });

  it('only treats a marker as one when it opens a field', () => {
    // `//registry...:_authToken` is a real .npmrc key. A `;` or `#` must be at
    // the start of a line or after whitespace to open a comment, which is why
    // this is not a naive split on the marker.
    expect(withoutIniComments('key=a;b')).toBe('key=a;b');
  });
});

describe('withoutYamlQuotes', () => {
  /**
   * YAML quoting is a style, not a meaning. `'actions/cache*'` and
   * `"actions/cache*"` are the same scalar, and a guard that matches one but
   * not the other fails on correct configuration.
   *
   * Found by building the org template repository against this repo's own
   * supply-chain guard: the group was written in this file's house style
   * (single quotes, as `'npm'` and `'develop'` are) and the guard reported it
   * ungrouped. A false alarm rather than a false pass, so the safe direction
   * -- but it would have reddened CI on a correct config and sent whoever hit
   * it looking for a problem that was not there.
   */
  it('treats single and double quoted scalars as the same text', () => {
    expect(withoutYamlQuotes("- 'actions/cache*'")).toBe(
      withoutYamlQuotes('- "actions/cache*"'),
    );
  });

  it('leaves an unquoted scalar alone', () => {
    expect(withoutYamlQuotes('- actions/cache*')).toContain('actions/cache*');
  });

  it('does not merge two adjacent scalars into one', () => {
    // `['a','b']` must not become `a,b` in a way that matches a pattern
    // spanning both -- the separator has to survive.
    expect(withoutYamlQuotes("['a','b']")).toBe('[a,b]');
  });
});

describe('withoutMarkupComments', () => {
  /**
   * `.astro` files are HTML as well as TypeScript, and `<!-- … -->` is a
   * comment the TS scanner cannot see.
   *
   * This matters most for `dead-copy.test.ts`, which asserts ABSENCE: a key is
   * dead if nothing references it, so an HTML comment naming a key keeps a
   * dead key looking alive and suppresses the finding with nothing going red.
   */
  it('removes an HTML comment', () => {
    expect(withoutMarkupComments('<!-- heroSubheading -->')).not.toContain(
      'heroSubheading',
    );
  });

  it('removes a multi-line HTML comment', () => {
    expect(
      withoutMarkupComments('<!--\n  removed in #17: heroSubheading\n-->'),
    ).not.toContain('heroSubheading');
  });

  it('leaves the markup around it intact', () => {
    expect(withoutMarkupComments('<p>a</p><!-- x --><p>b</p>')).toBe(
      '<p>a</p><p>b</p>',
    );
  });

  it('does not eat a lone angle bracket in text', () => {
    expect(withoutMarkupComments('<p>a < b</p>')).toContain('a < b');
  });
});

describe('withoutTsComments understands regex literals', () => {
  it('keeps code following a regex literal that contains a quote', () => {
    // The trailing comment is the real assertion: without regex support the
    // scanner opens a fake string at the `'` inside the class, stops seeing
    // comments, and passes this test by emitting the whole input verbatim.
    const kept = withoutTsComments(
      `const a = /['"]/g; // gone\nconst b = 2;\n`,
    );
    expect(kept).toContain('const b = 2;');
    expect(kept).not.toContain('gone');
  });

  it('keeps a regex literal that contains comment syntax', () => {
    const kept = withoutTsComments(
      `const r = /\\/\\*x\\*\\//g; // gone\nconst b = 2;\n`,
    );
    expect(kept).toContain('/\\/\\*x\\*\\//g');
    expect(kept).not.toContain('gone');
    expect(kept).toContain('const b = 2;');
  });

  it('still treats a slash after a value as division, not a regex', () => {
    const kept = withoutTsComments(`const x = a / b; // gone\nconst c = 3;\n`);
    expect(kept).toContain('a / b;');
    expect(kept).not.toContain('gone');
    expect(kept).toContain('const c = 3;');
  });

  it('strips a comment that follows a comment-stripping regex', () => {
    // Characterisation, not a reproduction: this shape survived the old
    // scanner too, because the backslashes keep the slashes non-adjacent.
    // It is here so the line-comment stripper's own shape stays covered.
    const kept = withoutTsComments(
      `const strip = (s: string) => s.replace(/\\/\\/.*$/gm, ''); // gone\nconst b = 2;\n`,
    );
    expect(kept).toContain('const b = 2;');
    expect(kept).not.toContain('gone');
  });
});

describe('blankCommentLines keeps line numbers intact', () => {
  it('blanks a comment line without removing it', () => {
    const out = blankCommentLines('a;\n// note\nb;\n');
    expect(out.split('\n')).toEqual(['a;', '', 'b;', '']);
  });

  it('blanks JSDoc openers and continuations too', () => {
    // A JSDoc quoting `test.fixme(` must not register as a parked test.
    expect(
      blankCommentLines('/**\n * test.fixme(\n */\nc;').split('\n'),
    ).toEqual(['', '', '', 'c;']);
  });

  it('leaves a trailing comment alone — whole lines only', () => {
    expect(blankCommentLines('a; // kept\n')).toBe('a; // kept\n');
  });

  it('exposes the per-line predicate for callers that walk backwards', () => {
    expect(['// x', ' * x', '/* x', 'code'].map(isCommentLine)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});
