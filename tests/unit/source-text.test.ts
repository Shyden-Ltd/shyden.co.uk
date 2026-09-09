import { describe, it, expect } from 'vitest';
import {
  withoutYamlComments,
  withoutCommentLines,
  withoutTsComments,
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
