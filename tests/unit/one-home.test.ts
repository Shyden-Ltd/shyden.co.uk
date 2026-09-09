import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withoutTsComments } from './source-text';
import { filesUnder } from '../source-files';

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

/** Every place a guard could live, from disk — never a list. */
const SCANNED = ['tests', 'scripts']
  .flatMap((dir) => filesUnder(dir, (path) => /\.(ts|mjs)$/.test(path)))
  .sort();

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
    // Sorted, because `SCANNED` is — an allow-list written in reading order
    // fails for a reason that has nothing to do with what it guards.
    expect(SCANNED.filter(definesACommentStripper)).toEqual([
      // The detector itself: the one other file that must name comment
      // syntax, in order to find it anywhere else. Renamed from
      // `stripper-homes.test.ts` in #80, when it grew a second rule.
      'tests/unit/one-home.test.ts',
      // The suite that proves the strippers work: it must quote the very
      // markers they remove, or it would be asserting on nothing.
      'tests/unit/source-text.test.ts',
      // The shared home. Everything else imports from here.
      'tests/unit/source-text.ts',
    ]);
  });
});

/**
 * Walking a directory tree lives in one place too.
 *
 * #65 gave comment stripping a home after seven private copies had grown, one
 * of them silently broken. The rule above was written for that one function,
 * so it could not see the next duplication — and the next duplication grew
 * inside this very file — the walk this guard used to carry was the sixth of
 * NINE private directory walkers (#80), in three implementations whose
 * exclusions disagreed. `dead-copy.test.ts` reached for `statSync().
 * isDirectory()` where the others used `withFileTypes`; `download-tagging.
 * test.ts` skipped neither dotfiles nor `node_modules` where the four
 * identical copies skipped both. Whichever copy the next guard reached for
 * would have decided what that guard could see — #67's failure exactly.
 *
 * Detection is deliberately structural rather than name-based: a copy called
 * `collect`, `walk` or `listM4aFiles` is the same defect as one called
 * `listSourceFiles`, and only two of the nine shared a name.
 *
 * Takes SOURCE, not a path, so the mutation tests below can hand it text that
 * is not on disk — a detector nobody has watched catch anything is worth as
 * much as the guards #79 found asserting on an empty array.
 */
const READS_A_DIRECTORY = /\breaddirSync\s*\(/;
const RECURSES_INTO_SUBDIRECTORIES = /\bisDirectory\s*\(\s*\)/;

export function definesADirectoryWalker(source: string): boolean {
  const code = withoutTsComments(source);
  return (
    READS_A_DIRECTORY.test(code) && RECURSES_INTO_SUBDIRECTORIES.test(code)
  );
}

describe('walking a directory tree has exactly one home', () => {
  it('is implemented only in source-files.ts', () => {
    expect(
      SCANNED.filter((path) =>
        definesADirectoryWalker(readFileSync(path, 'utf8')),
      ),
    ).toEqual([
      // The shared home. Every scan in the suite recurses through here.
      'tests/source-files.ts',
      // The detector itself: the one other file that must name the syntax,
      // in order to find it anywhere else.
      'tests/unit/one-home.test.ts',
    ]);
  });

  it('catches a walker whatever it is called', () => {
    expect(
      definesADirectoryWalker(`
        const gather = (dir: string): string[] =>
          readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
            entry.isDirectory() ? gather(join(dir, entry.name)) : [entry.name],
          );
      `),
    ).toBe(true);
  });

  it('catches the statSync variant, which shares no call with the others', () => {
    expect(
      definesADirectoryWalker(`
        const collect = (dir: string): string[] =>
          readdirSync(dir).flatMap((entry) =>
            statSync(join(dir, entry)).isDirectory() ? collect(join(dir, entry)) : [entry],
          );
      `),
    ).toBe(true);
  });

  it('is not fired by a comment describing one', () => {
    // The suppression direction: a guard that a comment can satisfy is not a
    // guard. Comments come off before matching, both ways.
    expect(
      definesADirectoryWalker(`
        // Deliberately flat: readdirSync(dir) with no entry.isDirectory()
        // recursion, because Astro puts every page at the top level.
        const pages = readdirSync('src/pages');
      `),
    ).toBe(false);
  });

  it('is not fired by reading a single directory', () => {
    expect(
      definesADirectoryWalker(`
        const assets = readdirSync('dist/_astro').filter((n) => n.endsWith('.m4a'));
      `),
    ).toBe(false);
  });
});
