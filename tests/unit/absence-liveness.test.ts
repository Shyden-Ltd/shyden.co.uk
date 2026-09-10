import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { filesUnder, searched } from '../source-files';
import {
  callGraph,
  declarationsIn,
  parseFile,
  rootsOf,
  rootsThrough,
  where,
} from './ast';

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

/** `.toEqual([])` or `.toHaveLength(0)` — and never their `.not` inverses. */
function absenceSubject(node: ts.CallExpression): ts.Expression | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const matcher = node.expression.name.text;
  const arg = node.arguments[0];
  const isAbsence =
    (matcher === 'toEqual' &&
      arg !== undefined &&
      ts.isArrayLiteralExpression(arg) &&
      arg.elements.length === 0) ||
    (matcher === 'toHaveLength' &&
      arg !== undefined &&
      ts.isNumericLiteral(arg) &&
      arg.text === '0');
  if (!isAbsence) return null;

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
  return target.arguments[0] ?? null;
}

/** Why this subject needs a control, or null if it carries its own. */
function unproved(
  subject: ts.Expression,
  decls: Map<string, ts.Expression>,
  file: string,
): string | null {
  // Already routed through the helper: the population is in the expression.
  if (
    ts.isCallExpression(subject) &&
    ts.isIdentifier(subject.expression) &&
    subject.expression.text === 'searched'
  )
    return null;

  const names = rootsThrough(subject, decls);
  if (names.some((name) => discoverers.reaches(file, name)))
    return 'derives from the filesystem';

  for (const name of names) {
    const init = decls.get(name);
    if (!init) continue;
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
    if (rootsOf(init).some((n) => discoverers.reaches(file, n)))
      return 'derives from the filesystem';
  }
  return null;
}

function scan() {
  const findings: string[] = [];
  let absences = 0;
  let proved = 0;
  for (const file of tsFiles) {
    const sf = parseFile(file);
    const decls = declarationsIn(sf);
    const check = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const subject = absenceSubject(node);
        if (subject) {
          absences += 1;
          const why = unproved(subject, decls, file);
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
    expect(tsFiles.length).toBeGreaterThan(30);
    // 112 today. The floor is stated against a measured figure rather
    // than left comfortably low, for the reason `anchored-presence`
    // records: a control with slack in it is most of the way back to
    // no control at all.
    expect(result.absences).toBeGreaterThan(100);
    expect(result.proved).toBeGreaterThan(0);
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
