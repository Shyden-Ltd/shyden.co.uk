import ts from 'typescript';

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
  'setViewportSize',
  'emulateTheme',
  'emulateMedia',
  'saveTheme',
]);

/** The one loop allowed inside a test: a population only the page knows. */
const RUNTIME = /^\/\/\s*runtime population:/;

/** `test(…)` and its run modifiers; `test.describe`, `.use` and `.step` are not tests. */
const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);

const isTestCall = (call: ts.CallExpression): boolean => {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'test';
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'test' &&
    TEST_MODIFIERS.has(callee.name.text)
  );
};

const callbackOf = (
  call: ts.CallExpression,
): ts.FunctionLikeDeclaration | null => {
  const last = call.arguments[call.arguments.length - 1];
  return last && (ts.isArrowFunction(last) || ts.isFunctionExpression(last))
    ? last
    : null;
};

/** A title as written: a template keeps its `${…}`, so an entry naming it is stable. */
const titleOf = (sf: ts.SourceFile, call: ts.CallExpression): string => {
  const first = call.arguments[0];
  if (!first) return '';
  if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))
    return first.text;
  return first.getText(sf).replace(/^`|`$/g, '');
};

const changesState = (node: ts.Node): boolean => {
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
      if (STATEFUL.has(name)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
};

/** Whether a `// runtime population:` comment sits directly above `node`. */
const declaresRuntime = (sf: ts.SourceFile, node: ts.Node): boolean =>
  [node, node.parent].some((at) =>
    (ts.getLeadingCommentRanges(sf.text, at.getFullStart()) ?? []).some(
      (range) => RUNTIME.test(sf.text.slice(range.pos, range.end)),
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
 * Every loop inside a test body that changes page state on each pass, unless
 * it declares a runtime population. A loop OUTSIDE a test that generates one
 * test per case is the shape this asks for, so it is never reported.
 */
export function loopedCases(sf: ts.SourceFile): LoopedCase[] {
  const cases: LoopedCase[] = [];
  const inTest = (title: string, node: ts.Node): void => {
    const loop = loopParts(sf, node);
    if (loop && changesState(loop.body) && !declaresRuntime(sf, node))
      cases.push({
        test: title,
        loop: loop.header,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      });
    ts.forEachChild(node, (child) => inTest(title, child));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTestCall(node)) {
      const callback = callbackOf(node);
      if (callback?.body) {
        inTest(titleOf(sf, node), callback.body);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return cases;
}
