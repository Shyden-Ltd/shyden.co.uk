import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withoutTsComments } from './source-text';

/**
 * Comment stripping lives in one place. Seven private copies had accumulated
 * across the suites by #65, and one of them — `locale-switcher.test.ts` —
 * used the naive `/\/\/.*$/gm` that eats everything after `https:` in a URL,
 * the exact bug `withoutTsComments` exists to prevent.
 *
 * Finding a stripper is done BY the shared stripper: remove a file's real
 * comments, and every comment marker still standing is inside a string or a
 * regex — code that MATCHES comment syntax rather than code that IS a
 * comment. Requiring a delimited literal (`'//'`, or `\/\/` escaped inside a
 * regex) is what stops a URL in a string from registering.
 *
 * KNOWN LIMIT, stated so nobody trusts this further than it goes: it detects
 * only source-comment markers. A line filter keyed on a single character —
 * `line.startsWith('#')`, the form #65 removed from `git-hooks.test.ts` — is
 * not detectable by text, because the marker a legitimate CALLER passes to
 * `withoutCommentLines(text, '#')` is that same character.
 */
const COMMENT_SYNTAX_LITERAL = /(['"`])\/[/*]\1|\\\/\\[/*]|<!--/;

/** `https:\/\/` inside a regex is a URL, not a comment. */
const URL_ESCAPE = /https?:\\\/\\\//g;

/** `withoutCommentLines(text, '//')` passes a marker; it does not define one. */
const MARKER_ARGUMENT = /,\s*(['"`])\/[/*]\1/g;

/** Every place a source-text guard could live, from disk — never a list. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|mjs)$/.test(entry.name) ? [path] : [];
  });
}

const SCANNED = [...sourceFiles('tests'), ...sourceFiles('scripts')].sort();

function definesACommentStripper(path: string): boolean {
  const code = withoutTsComments(readFileSync(path, 'utf8'))
    .replace(URL_ESCAPE, '')
    .replace(MARKER_ARGUMENT, '');
  return COMMENT_SYNTAX_LITERAL.test(code);
}

describe('comment stripping has exactly one home', () => {
  it('scans the whole test and script tree', () => {
    // Anti-vacuity: an empty scan would satisfy the assertion below.
    expect(SCANNED.length).toBeGreaterThan(20);
    expect(SCANNED).toContain('tests/unit/source-text.ts');
  });

  it('is implemented only in source-text.ts', () => {
    expect(SCANNED.filter(definesACommentStripper)).toEqual([
      // The suite that proves the strippers work: it must quote the very
      // markers they remove, or it would be asserting on nothing.
      'tests/unit/source-text.test.ts',
      // The shared home. Everything else imports from here.
      'tests/unit/source-text.ts',
      // The detector itself: the one other file that must name comment
      // syntax, in order to find it anywhere else.
      'tests/unit/stripper-homes.test.ts',
    ]);
  });
});
