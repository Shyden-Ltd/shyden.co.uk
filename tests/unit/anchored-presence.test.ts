import { describe, it, expect } from 'vitest';
import { filesUnder, searched } from '../source-files';
import { bind, bindFiles, callGraph, type Closure } from './ast';
import { scanPresence, type PresenceClosures } from './presence-detector';
/**
 * A presence assertion over source text must be STRIPPED or ANCHORED.
 *
 * Four sweeps established the absence direction of this class: a guard
 * asserting something is missing, fouled by a comment naming it. That one
 * goes RED, so you find out. The presence direction stays GREEN, and keeps
 * staying green after the thing it guards is deleted (#98).
 *
 * `.gitignore` carried the sharpest example: `toContain('.env.*')` was
 * satisfied by `# .env.*` while the rule ignored nothing, and that rule is
 * what stands between a real API key and a public repo.
 *
 * Three ways out, and this guard accepts any of them:
 *
 *  - **Stripped** — the text reaches the assertion through a comment
 *    remover. Detected TRANSITIVELY, because `locale-switcher.test.ts`'s
 *    `source()` strips inside itself and its call sites therefore read as
 *    unstripped. Three hand-written derivations for #98 each got this wrong
 *    by looking only at the call site.
 *  - **Anchored** — the matcher is a regex whose every top-level alternative
 *    starts with `^`, pinning the real syntax to a line. Any regex used to
 *    count, and `toMatch(/foo/)` matches exactly the text `toContain('foo')`
 *    does (#183). Stronger than stripping, and preferred by #98's own AC:
 *    stripping removes ONE way of faking the claim, while an import left
 *    behind after the code was deleted is another. Only an anchor caught it.
 *  - **Comment-derived** — the text is BUILT from comments
 *    (`isMarkerCommentLine`, `commentsIn`), so the assertion is about the
 *    documentation by design, and a comment satisfying it is the point:
 *    `.env.example` explaining the `:fx` suffix. Recognised from the
 *    derivation, closed over callers like the strippers, never from a list
 *    of exempt sites.
 *
 * Deliberately NOT flagged, both measured rather than assumed:
 *
 *  - a list of file NAMES (`readdirSync`, `specDirs()`, `pageNames()`). A
 *    comment cannot hide in a filename. Including these produced twelve
 *    false positives and no real findings.
 *  - PARSED data (`JSON.parse`). JSON carries no comments, so
 *    `pkg.scripts['test:e2e']` cannot be satisfied by one.
 */

const READS_CONTENT = new Set(['readFileSync']);
const STRIPPERS = new Set([
  'withoutTsComments',
  'withoutMarkupComments',
  'withoutCommentLines',
  'withoutYamlComments',
  'withoutIniComments',
  'blankCommentLines',
  'withoutAstroComments',
  'withoutYamlQuotes',
]);
const COMMENT_READERS = new Set(['isMarkerCommentLine', 'commentsIn']);

const tsFiles = filesUnder('tests', (path) => path.endsWith('.ts'));

/**
 * Both properties are inherited by CALLERS, so both are closed transitively
 * over the whole of `tests/**` -- see `./ast`, which #118 extracted from here
 * so a second meta-guard could reason the same way without a second copy.
 */
const graph = callGraph(tsFiles);
const readers = graph.close(READS_CONTENT);
const strippers = graph.close(STRIPPERS);
const commentReaders = graph.close(COMMENT_READERS);

/**
 * Every file bound into one program, so a local name resolves to the
 * declaration its own scope sees. Resolved by bare name, `config` at
 * `supply-chain.test.ts:206` reached another test's `parseCleanYaml(...)`, and
 * a stripped assertion read as raw (#184).
 */
const bound = bindFiles(tsFiles);

const result = scanPresence(bound, { readers, strippers, commentReaders });

/** A closure whose seeds are the whole answer, so a fixture needs no graph. */
const seeded = (...names: string[]): Closure => ({
  reaches: (_file, name) => names.includes(name),
});

const FIXTURE_CLOSURES: PresenceClosures = {
  readers: seeded('readFileSync'),
  strippers: seeded('withoutTsComments'),
  commentReaders: seeded('isMarkerCommentLine', 'commentsIn'),
};

/** The line of every assertion the detector flags in one fixture test file. */
function flaggedLines(source: string): number[] {
  const bound = bind(new Map([['fixture.test.ts', source]]));
  return scanPresence(bound, FIXTURE_CLOSURES).findings.map((finding) =>
    Number(/^fixture\.test\.ts:(\d+) /.exec(finding)?.[1]),
  );
}

/** Each matcher on its own line under one raw read, so a line names a case. */
const overRaw = (...matchers: string[]): string =>
  [
    "const raw = readFileSync('x.ts', 'utf8');",
    ...matchers.map((matcher) => `expect(raw).${matcher};`),
  ].join('\n');

describe('the detector counts only a real anchor (#183)', () => {
  it('flags an unanchored regex over raw source, as it flags toContain', () => {
    expect(flaggedLines(overRaw("toContain('foo')", 'toMatch(/foo/)'))).toEqual(
      [2, 3],
    );
  });

  it('accepts a regex whose every alternative starts at a line', () => {
    expect(
      flaggedLines(
        overRaw('toMatch(/^foo$/m)', 'toMatch(/^foo/)', 'toMatch(/^a|^b/m)'),
      ),
    ).toEqual([]);
  });

  it('does not count `$` alone, or an anchor on only one alternative', () => {
    expect(
      flaggedLines(overRaw('toMatch(/foo$/m)', 'toMatch(/^a|b/m)')),
    ).toEqual([2, 3]);
  });

  it('does not read an escaped caret or a negated class as an anchor', () => {
    expect(
      flaggedLines(overRaw('toMatch(/\\^foo/)', 'toMatch(/[^x]foo/)')),
    ).toEqual([2, 3]);
  });

  it('splits alternatives only at the top level', () => {
    expect(
      flaggedLines(
        overRaw(
          'toMatch(/^[a|b]c/)',
          'toMatch(/^(a|b)c/)',
          'toMatch(/^a\\|b/)',
        ),
      ),
    ).toEqual([]);
  });

  it('flags a string handed to toMatch, which is a substring test', () => {
    expect(flaggedLines(overRaw("toMatch('foo')"))).toEqual([2]);
  });

  it('accepts stripped text with any matcher', () => {
    expect(
      flaggedLines(
        [
          "const code = withoutTsComments(readFileSync('x.ts', 'utf8'));",
          "expect(code).toContain('foo');",
          'expect(code).toMatch(/foo/);',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('accepts text derived from the comments, which asserts documentation', () => {
    expect(
      flaggedLines(
        [
          "const example = readFileSync('.env.example', 'utf8');",
          'const docs = example',
          "  .split('\\n')",
          "  .filter((line) => isMarkerCommentLine(line, '#'))",
          "  .join('\\n');",
          'expect(docs).toMatch(/:fx\\b/);',
          'const prose = commentsIn(parseSource(example)).map((c) => c.pos);',
          "expect(prose).toContain('timeout');",
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('scans only content reads in test files, and never parsed data', () => {
    const scanOf = (file: string, source: string) =>
      scanPresence(bind(new Map([[file, source]])), FIXTURE_CLOSURES);
    const parsed = [
      "const pkg = JSON.parse(readFileSync('package.json', 'utf8'));",
      "expect(pkg.scripts).toContain('test');",
    ].join('\n');

    expect(scanOf('fixture.test.ts', overRaw("toContain('foo')"))).toEqual({
      scanned: 1,
      findings: [expect.stringMatching(/^fixture\.test\.ts:2 /)],
    });
    expect(scanOf('helper.ts', overRaw("toContain('foo')")).scanned).toBe(0);
    expect(scanOf('fixture.test.ts', parsed).scanned).toBe(0);
  });
});

describe('presence assertions over source text are stripped or anchored', () => {
  // The liveness control, and the reason it is a SEPARATE assertion: the
  // verdict below asserts absence, so a detector whose AST walk quietly
  // stopped matching would report zero findings and zero scanned, and only
  // one of those is good news. `event-collectors.test.ts` settled this shape.
  it('scans the presence assertions that actually read source text', () => {
    // 45 today, and the figure is worth stating: the floor sat at 20 while
    // the truth was 27, so a control with that much slack in it is most of
    // the way back to no control at all. #118 moved the number twice --
    // UP as the derivation learned to follow local bindings to a fixed
    // point, then back DOWN as it stopped reading object-literal keys and
    // parameter names as references. Both were corrections, not drift.
    // #184 found this comment still saying 28 over a real 42, and moved the
    // figure to 45: resolving names by scope brought in three assertions a
    // file-wide map had been sending to another test's declaration.
    expect(result.scanned).toBeGreaterThan(44);
    expect(tsFiles.length).toBeGreaterThan(30);
  });

  it('finds none reading raw source with an unanchored matcher', () => {
    expect(
      searched(result.findings, {
        of: result.scanned,
        what: 'presence assertions over source text',
      }),
      result.findings.join('\n'),
    ).toEqual([]);
  });
});
