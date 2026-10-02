import ts from 'typescript';
import { declarationsIn } from './playwright-declarations';

/** A loop inside one test that changes page state on each pass. */
export interface LoopedCase {
  /** The test's title, as written in the source. */
  readonly test: string;
  /** The loop's header, whitespace collapsed: `for (const x of XS)`. */
  readonly loop: string;
  /** 1-based line of the loop, for a human to open. */
  readonly line: number;
}

/**
 * What a pass of a loop pays the shared budget for: a navigation, or a change
 * of viewport, theme or media that re-lays-out the page. Matched as a call's
 * own name, bare (`emulateTheme(page, …)`) or as a method (`page.goto(…)`).
 */
const STATEFUL = new Set([
  'goto',
  // A navigation by another name: theme.spec.ts reloaded six stale values in
  // one test, unseen while only `goto` was listed (#390 F150).
  'reload',
  'goBack',
  'goForward',
  'setContent',
  'setViewportSize',
  'emulateTheme',
  'emulateMedia',
  'saveTheme',
]);

/** The one loop allowed inside a test: a population only the page knows. */
const RUNTIME = 'runtime population:';

/** A line comment's own text: its marker's two characters and outer space dropped. */
const lineCommentText = (sf: ts.SourceFile, range: ts.CommentRange): string =>
  range.kind === ts.SyntaxKind.SingleLineCommentTrivia
    ? sf.text.slice(range.pos + 2, range.end).trim()
    : '';

/** A title as written: a template keeps its `${…}`, so an entry naming it is stable. */
const titleOf = (sf: ts.SourceFile, call: ts.CallExpression): string => {
  const first = call.arguments[0];
  if (!first) return '';
  if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))
    return first.text;
  return first.getText(sf).replace(/^`|`$/g, '');
};

const changesState = (
  node: ts.Node,
  stateful: ReadonlySet<string> = STATEFUL,
): boolean => {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(child)) {
      const callee = child.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : '';
      if (stateful.has(name)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
};

/**
 * `seed`, plus every function these files declare whose body changes page
 * state, to a fixed point: a helper calling such a helper is one too.
 * zoom-on-focus.spec.ts looped pages through its own `typedControls`, and
 * classroom-groups-controls.spec.ts through the shared `openRoster`, each
 * `goto` one call away from the loop and out of sight of a name match (#390
 * F152). Keyed by name across files, every body kept: two helpers sharing a
 * name make it stateful if either is, so a collision over-reports rather than
 * hides a site.
 */
export const statefulHelpers = (
  sources: readonly ts.SourceFile[],
  seed: ReadonlySet<string> = STATEFUL,
): ReadonlySet<string> => {
  const bodies: [string, ts.Node][] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body)
      bodies.push([node.name.text, node.body]);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    )
      bodies.push([node.name.text, node.initializer.body]);
    ts.forEachChild(node, collect);
  };
  for (const sf of sources) collect(sf);
  const names = new Set(seed);
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, body] of bodies)
      if (!names.has(name) && changesState(body, names)) {
        names.add(name);
        grew = true;
      }
  }
  return names;
};

/** Whether a `// runtime population:` comment sits directly above `node`. */
const declaresRuntime = (sf: ts.SourceFile, node: ts.Node): boolean =>
  [node, node.parent].some((at) =>
    (ts.getLeadingCommentRanges(sf.text, at.getFullStart()) ?? []).some(
      (range) => lineCommentText(sf, range).startsWith(RUNTIME),
    ),
  );

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** A loop statement's header and body, or a `.forEach(…)` call's. */
const loopParts = (
  sf: ts.SourceFile,
  node: ts.Node,
): { header: string; body: ts.Node } | null => {
  if (
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForStatement(node)
  )
    return {
      header: collapse(
        sf.text.slice(node.getStart(sf), node.statement.getStart(sf)),
      ),
      body: node.statement,
    };
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'forEach' &&
    node.arguments[0]
  )
    return {
      header: collapse(`${node.expression.getText(sf)}(…)`),
      body: node.arguments[0],
    };
  return null;
};

/**
 * Every test this detector reads in `sf`, by title, from the one reader every
 * guard shares. Exported as the population the suite counts: a detector that
 * finds no loop has said nothing unless it also found the tests (#390).
 */
export function testsRead(sf: ts.SourceFile): string[] {
  return declarationsIn(sf)
    .filter(({ kind }) => kind === 'test')
    .map(({ call }) => titleOf(sf, call));
}

/**
 * Every loop inside a test body that changes page state on each pass, unless
 * it declares a runtime population. A loop OUTSIDE a test that generates one
 * test per case is the shape this asks for, so it is never reported.
 * `shared` is what the suite's shared modules make stateful
 * (`statefulHelpers` over them), so an imported helper that navigates counts.
 */
export function loopedCases(
  sf: ts.SourceFile,
  shared: ReadonlySet<string> = STATEFUL,
): LoopedCase[] {
  const cases: LoopedCase[] = [];
  const stateful = statefulHelpers([sf], shared);
  const inTest = (title: string, node: ts.Node): void => {
    const loop = loopParts(sf, node);
    if (loop && changesState(loop.body, stateful) && !declaresRuntime(sf, node))
      cases.push({
        test: title,
        loop: loop.header,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      });
    ts.forEachChild(node, (child) => inTest(title, child));
  };
  // Tests as Playwright declares them, from the one reader every guard
  // shares: this file's own list of test callees missed `test.fail.only`,
  // so a looped body under it passed unread (#390 F155).
  for (const { kind, call, body } of declarationsIn(sf))
    if (kind === 'test') inTest(titleOf(sf, call), body.body);
  return cases;
}
