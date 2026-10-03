import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { filesUnder, searched } from '../source-files';
import { bindFiles, callGraph, derivationOf, where } from './ast';

/**
 * An absence assertion must prove its POPULATION was live (#118).
 *
 * `expect(findings).toEqual([])` is green in two different worlds: the guard
 * ran over a real subject and found nothing, and the guard was handed nothing
 * to run over. #84 measured what that costs -- twelve tests passed while
 * scanning zero files -- and put the control inside the file walk. #79 did
 * the same for browser events, inside the recorder. Neither generalised to
 * the third and largest case: a guard that BUILDS a list, from a file walk, a
 * match set, or a table read, and then asserts the list is empty.
 *
 * The control now lives inside the assertion's own expression:
 *
 *     expect(searched(findings, { of: files, what: 'files' })).toEqual([]);
 *
 * Two structural shapes are in scope, and both are shapes rather than names,
 * because #80 found nine copies of one walker sharing only two names:
 *
 *  - **A collector** — a variable initialised empty and accumulated into, or
 *    produced by `.filter()` / `.flatMap()`. Its emptiness says nothing until
 *    you know the thing it accumulated FROM was not empty.
 *  - **A discovery** — a subject whose derivation transitively reaches the
 *    filesystem. `const result = scan()` three hops above a `readFileSync` is
 *    the shape `anchored-presence.test.ts` uses on itself.
 *
 * Deliberately OUT of scope, and this is the distinction the ticket's "109
 * absence assertions" figure missed: an assertion over a self-contained call,
 * `expect(rosterWarnings([], en)).toEqual([])`. Its population is the literal
 * written beside it. Requiring a control there would buy nothing and would
 * teach every author to write `of: 1` to get past it -- a mandatory control
 * with a trivial escape hatch is a ritual, and rituals are how the vacuity
 * this ticket exists to remove got written in the first place.
 *
 * `.not.toEqual([])` is a PRESENCE assertion and is skipped: it fails, loudly,
 * on an empty population, so it cannot hide one.
 *
 * The scan covers EVERY `.ts` under `tests/`, not just `*.test.ts` and
 * `*.spec.ts`. That filter looked like a definition and was really a
 * hand-drawn boundary -- the kind #24's sweep was built on and #60 and #65
 * then found survivors outside. It excluded `tests/e2e/recorders.ts`, which
 * is where #79's collector-liveness lesson was learned and which carries
 * three absence assertions of its own. Derive the scope from the filesystem,
 * including for your own guard.
 */

/** Reaching any of these means the subject came from outside the test. */
const DISCOVERY = new Set([
  'readFileSync',
  'readdirSync',
  'filesUnder',
  'listSourceFiles',
]);

/** Shapes that accumulate: emptiness is meaningless without the source. */
const DERIVING = new Set(['filter', 'flatMap']);

const tsFiles = filesUnder('tests', (path) => path.endsWith('.ts'));
const discoverers = callGraph(tsFiles).close(DISCOVERY);

/** Bound once: each name resolves in its own scope, not by name (#184). */
const bound = bindFiles(tsFiles);

const EQUALITY = new Set(['toEqual', 'toStrictEqual', 'toBe']);

const isZero = (arg: ts.Expression | undefined): boolean =>
  arg !== undefined && ts.isNumericLiteral(arg) && arg.text === '0';

/**
 * Every spelling of "this is empty" -- `.toEqual([])`, `.toStrictEqual([])`,
 * `.toHaveLength(0)`, and a `.length` or `.size` held equal to 0 -- and never
 * a `.not` inverse. For the last two the subject is what the count is OF:
 * `expect(found.length).toBe(0)` asserts `found` empty (#390 F159).
 */
function absenceSubject(node: ts.CallExpression): ts.Expression | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const matcher = node.expression.name.text;
  const arg = node.arguments[0];
  const emptyList =
    (matcher === 'toEqual' || matcher === 'toStrictEqual') &&
    arg !== undefined &&
    ts.isArrayLiteralExpression(arg) &&
    arg.elements.length === 0;
  const noLength = matcher === 'toHaveLength' && isZero(arg);
  const zeroCount = EQUALITY.has(matcher) && isZero(arg);
  if (!emptyList && !noLength && !zeroCount) return null;

  // Walk back through any modifier chain (`.not`, `.resolves`). A `.not`
  // anywhere in it inverts the claim, so the assertion is not an absence one.
  let target: ts.Node = node.expression.expression;
  while (ts.isPropertyAccessExpression(target)) {
    if (target.name.text === 'not') return null;
    target = target.expression;
  }
  if (!ts.isCallExpression(target) || !ts.isIdentifier(target.expression))
    return null;
  if (target.expression.text !== 'expect') return null;
  const subject = target.arguments[0];
  if (subject === undefined) return null;
  if (!zeroCount) return subject;
  // A bare number held to 0 is a value, not a population.
  return ts.isPropertyAccessExpression(subject) &&
    (subject.name.text === 'length' || subject.name.text === 'size')
    ? subject.expression
    : null;
}

/** Why this subject needs a control, or null if it carries its own. */
function unproved(subject: ts.Expression, file: string): string | null {
  // Already routed through the helper: the population is in the expression.
  if (
    ts.isCallExpression(subject) &&
    ts.isIdentifier(subject.expression) &&
    subject.expression.text === 'searched'
  )
    return null;

  const { names, initializers } = derivationOf(subject, bound);
  if (names.some((name) => discoverers.reaches(file, name)))
    return 'derives from the filesystem';

  // No filesystem question inside the loop: every identifier in a followed
  // initializer is already one of `names`, which the check above has asked.
  for (const init of initializers) {
    if (ts.isArrayLiteralExpression(init) && init.elements.length === 0)
      return 'a collector: initialised empty and accumulated into';
    if (
      ts.isNewExpression(init) &&
      ts.isIdentifier(init.expression) &&
      (init.expression.text === 'Set' || init.expression.text === 'Map') &&
      (init.arguments?.length ?? 0) === 0
    )
      return `a collector: an empty ${init.expression.text}`;
    if (
      ts.isCallExpression(init) &&
      ts.isPropertyAccessExpression(init.expression) &&
      DERIVING.has(init.expression.name.text)
    )
      return `derived by .${init.expression.name.text}() over a population`;
  }
  return null;
}

function scan() {
  const findings: string[] = [];
  let absences = 0;
  let proved = 0;
  for (const [file, sf] of bound.files) {
    const check = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const subject = absenceSubject(node);
        if (subject) {
          absences += 1;
          const why = unproved(subject, file);
          if (why === null) proved += 1;
          else
            findings.push(
              `${where(sf, node)} — ${why}: ` +
                subject.getText().replace(/\s+/g, ' ').slice(0, 70),
            );
        }
      }
      ts.forEachChild(node, check);
    };
    check(sf);
  }
  return { absences, proved, findings };
}

const result = scan();

describe('absence assertions prove the population they searched', () => {
  // Separate from the verdict, and load-bearing: the verdict below is itself
  // an absence assertion, so a detector whose AST walk quietly stopped
  // matching would report zero findings over zero absences -- and only one of
  // those is good news. This is the shape `event-collectors.test.ts` settled.
  it('finds the absence assertions it is meant to be judging', () => {
    // Measured 262 TypeScript files under tests/ on 2026-10-03 (#446). Stated
    // tight, so a reader that comes back one short fails.
    expect(tsFiles.length).toBeGreaterThan(261);
    // 394 today. The floor is stated against a measured figure rather
    // than left comfortably low, for the reason `anchored-presence`
    // records: a control with slack in it is most of the way back to
    // no control at all. #184 found it at 100 over a real 154, and showed
    // what that slack costs: with the `toHaveLength(0)` branch of
    // `absenceSubject` dead, this test stayed green. #390 F161 found it
    // there again, at 153 over a real 391, with the same branch dead and
    // the same test green; F159's spellings brought the figure to 394,
    // and #446 measured 399 on 2026-10-03.
    expect(result.absences).toBeGreaterThan(398);
    expect(result.proved).toBeGreaterThan(0);
  });

  it('reads an absence however it is spelled, and never its inverse', () => {
    // Only `toEqual([])` and `toHaveLength(0)` were read, so an absence
    // written `expect(found.length).toBe(0)` over a file walk was never
    // judged (#390 F159).
    const sf = ts.createSourceFile(
      'fixture.test.ts',
      [
        'expect(a).toEqual([]);',
        'expect(b).toStrictEqual([]);',
        'expect(c).toHaveLength(0);',
        'expect(d.length).toBe(0);',
        'expect(e.size).toBe(0);',
        'expect(f.length).toEqual(0);',
        'expect(g.length).toStrictEqual(0);',
        'expect(h).not.toEqual([]);',
        'expect(i.length).not.toBe(0);',
        'expect(j.length).toBe(1);',
        'expect(k).toBe(0);',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
    );
    const subjects: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const subject = absenceSubject(node);
        if (subject) subjects.push(subject.getText(sf));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(subjects).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('finds none whose population could be empty without saying so', () => {
    expect(
      searched(result.findings, {
        of: result.absences,
        what: 'absence assertions',
      }),
    ).toEqual([]);
  });
});
