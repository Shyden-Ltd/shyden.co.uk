import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { filesUnder, searched } from '../source-files';
import {
  callGraph,
  declarationsIn,
  parseFile,
  rootsThrough,
  where,
} from './ast';
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
 * Two ways out, and this guard accepts either:
 *
 *  - **Stripped** — the text reaches the assertion through a comment
 *    remover. Detected TRANSITIVELY, because `locale-switcher.test.ts`'s
 *    `source()` strips inside itself and its call sites therefore read as
 *    unstripped. Three hand-written derivations for #98 each got this wrong
 *    by looking only at the call site.
 *  - **Anchored** — the matcher is a regex naming the real syntax. Stronger,
 *    and preferred by #98's own AC: stripping removes ONE way of faking the
 *    claim, while an import left behind after the code was deleted is
 *    another. Only an anchor caught that one.
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
const PARSED = new Set(['parse', 'JSON']);
const STRIPPERS = new Set([
  'withoutTsComments',
  'withoutMarkupComments',
  'withoutCommentLines',
  'withoutYamlComments',
  'withoutIniComments',
  'blankCommentLines',
  'strippedSource',
  'withoutYamlQuotes',
]);

const tsFiles = filesUnder('tests', (path) => path.endsWith('.ts'));

/**
 * Both properties are inherited by CALLERS, so both are closed transitively
 * over the whole of `tests/**` -- see `./ast`, which #118 extracted from here
 * so a second meta-guard could reason the same way without a second copy.
 */
const graph = callGraph(tsFiles);
const readers = graph.close(READS_CONTENT);
const strippers = graph.close(STRIPPERS);

function scan() {
  const findings: string[] = [];
  let scanned = 0;
  for (const file of tsFiles.filter((f) => /\.(test|spec)\.ts$/.test(f))) {
    const sf = parseFile(file);
    const decls = declarationsIn(sf);

    const check = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const matcher = node.expression.name.text;
        if (matcher === 'toContain' || matcher === 'toMatch') {
          const expectCall = node.expression.expression;
          const subject = ts.isCallExpression(expectCall)
            ? expectCall.arguments[0]
            : undefined;
          if (subject) {
            const names = rootsThrough(subject, decls);
            const fromContent = names.some((n) => readers.reaches(file, n));
            const parsed = names.some((n) => PARSED.has(n));
            if (fromContent && !parsed) {
              scanned += 1;
              const stripped = names.some((n) => strippers.reaches(file, n));
              const arg = node.arguments[0];
              const anchored =
                arg !== undefined && ts.isRegularExpressionLiteral(arg);
              if (!stripped && !anchored) {
                findings.push(
                  `${where(sf, node)} — ` +
                    node.getText().replace(/\s+/g, ' ').slice(0, 90),
                );
              }
            }
          }
        }
      }
      ts.forEachChild(node, check);
    };
    check(sf);
  }
  return { scanned, findings };
}

const result = scan();

describe('presence assertions over source text are stripped or anchored', () => {
  // The liveness control, and the reason it is a SEPARATE assertion: the
  // verdict below asserts absence, so a detector whose AST walk quietly
  // stopped matching would report zero findings and zero scanned, and only
  // one of those is good news. `event-collectors.test.ts` settled this shape.
  it('scans the presence assertions that actually read source text', () => {
    // 28 today, and the figure is worth stating: the floor sat at 20 while
    // the truth was 27, so a control with that much slack in it is most of
    // the way back to no control at all. #118 moved the number twice --
    // UP as the derivation learned to follow local bindings to a fixed
    // point, then back DOWN as it stopped reading object-literal keys and
    // parameter names as references. Both were corrections, not drift.
    expect(result.scanned).toBeGreaterThan(24);
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
