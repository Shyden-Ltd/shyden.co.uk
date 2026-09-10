import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

/**
 * The TypeScript-AST machinery the meta-guards share (#118).
 *
 * Two guards in this suite reason about the suite itself.
 * `anchored-presence.test.ts` (#98) asks whether a presence assertion reads
 * stripped text; `absence-liveness.test.ts` (#118) asks whether an absence
 * assertion proves its population was live. Both need the same four things:
 * parse a file, name what a node is declared as, follow an expression back to
 * the identifiers feeding it, and close a call graph transitively.
 *
 * They live here rather than in either guard because #80's lesson is that a
 * "one home" rule which only sees the function it was written for accumulates
 * the duplication it forbids -- `stripper-homes.test.ts` enforced one home for
 * comment strippers while carrying its own private copy of the file walker,
 * one of nine. A second AST indexer copied into a second meta-guard is that
 * same mistake, one layer up. Generalise the machinery; keep the RULES apart,
 * because they answer different questions and a merged guard would report a
 * single verdict for two unrelated defects.
 *
 * A regex cannot do any of this. `expect(x).toEqual([])` inside a string, a
 * matcher reached through a `.not`, an assertion split over four lines by
 * prettier -- all of them are why `tests/unit/source-text.ts` exists for the
 * lexical questions and this exists for the structural ones.
 */

/** A file parsed with parent pointers, which `declaredName` needs. */
export const parseFile = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

/**
 * The name a function is known by, whether declared or assigned.
 *
 * `function walk() {}` and `const walk = () => {}` are the same thing to a
 * call graph and different things to the AST, and this repo writes both.
 */
export const declaredName = (node: ts.Node): string | null => {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  const parent = node.parent;
  if (
    parent &&
    ts.isVariableDeclaration(parent) &&
    ts.isIdentifier(parent.name)
  )
    return parent.name.text;
  return null;
};

/**
 * Every identifier feeding an expression, innermost callee first.
 *
 * `withoutTsComments(readFileSync(p, 'utf8'))` yields both names, so a caller
 * can ask what an expression is ultimately made of rather than what its
 * outermost call happens to be.
 */
export const rootsOf = (
  node: ts.Node | undefined,
  acc: string[] = [],
): string[] => {
  if (!node) return acc;
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression)) acc.push(node.expression.text);
    else if (ts.isPropertyAccessExpression(node.expression))
      rootsOf(node.expression.expression, acc);
    node.arguments.forEach((arg) => rootsOf(arg, acc));
    return acc;
  }
  if (ts.isPropertyAccessExpression(node)) return rootsOf(node.expression, acc);
  if (ts.isIdentifier(node)) {
    acc.push(node.text);
    return acc;
  }
  // The braces are load-bearing. `ts.forEachChild` STOPS at the first
  // child whose callback returns something truthy, and `rootsOf` returns
  // `acc` -- an array, always truthy. Written point-free it visited exactly
  // one child per node, so an arrow function yielded its parameter and never
  // its body. Inherited from #98, where it quietly narrowed that guard too.
  ts.forEachChild(node, (child) => {
    rootsOf(child, acc);
  });
  return acc;
};

/**
 * Every identifier feeding an expression, following local `const` bindings
 * to a fixed point.
 *
 * One hop is not enough and the shortfall hides exactly the guards that
 * matter. `locale-beta.test.ts` writes `const source = withoutTsComments(
 * readFileSync(INDEX))` and then asserts over `source.match(...)`, so the
 * `readFileSync` is two hops from the assertion. #98's derivation stopped at
 * one and reached it only by accident, resolving the local string to an
 * unrelated `source()` function three files away -- the right answer for the
 * wrong reason, which stopped being right the moment that accident was fixed.
 */
export function rootsThrough(
  node: ts.Expression,
  decls: ReadonlyMap<string, ts.Expression>,
): string[] {
  const seen = new Set<string>();
  const queue = rootsOf(node);
  const out: string[] = [];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    const decl = decls.get(name);
    if (decl) queue.push(...rootsOf(decl));
  }
  return out;
}

export interface Closure {
  /**
   * Whether `name`, resolved from inside `file`, reaches the seed.
   *
   * The file matters. Three different `scan` functions live in this suite --
   * two read the filesystem and `parked-tests.test.ts`'s takes a string --
   * and a graph keyed by bare name gave the pure one the impure one's
   * property, flagging five behavioural assertions as unproved. A local
   * declaration shadows every same-named one elsewhere, exactly as the
   * module system does. A name NOT declared locally is an import, and there
   * the union of same-named declarations is the honest over-approximation.
   */
  reaches(file: string, name: string): boolean;
}

export interface CallGraph {
  /**
   * Every function reaching any of `seed`, at any depth.
   *
   * A property like "reads file content" or "refuses an empty result" is
   * inherited by callers, and this repo reaches those primitives through
   * three and four hops of helper -- #98's first derivation looked only a few
   * lines around a `readFileSync` and missed six sites for exactly that.
   */
  close(seed: Iterable<string>): Closure;
}

/** Index every named function across `files` and how they call each other. */
export function callGraph(files: readonly string[]): CallGraph {
  const keyOf = (file: string, name: string) => `${file}::${name}`;
  /** `file::name` to the bare names it calls. */
  const calls = new Map<string, Set<string>>();
  const fileOf = new Map<string, string>();
  const keysByName = new Map<string, string[]>();
  /**
   * Every name bound at all in a file, functions and variables alike.
   *
   * A local binding shadows an import whatever its shape.
   * `parked-tests.test.ts` builds a `const source` string; three files away,
   * `locale-switcher.test.ts` declares a `source()` that reads a file. Take
   * only functions into account and the string inherits the reader's
   * property, which flagged five behavioural assertions as unproved.
   */
  const bound = new Map<string, Set<string>>();

  for (const file of files) {
    const visit = (node: ts.Node, owner: string | null) => {
      let mine = owner;
      const isFn =
        ts.isFunctionDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node);
      if (isFn) {
        const name = declaredName(node);
        if (name) {
          mine = keyOf(file, name);
          if (!calls.has(mine)) {
            calls.set(mine, new Set());
            fileOf.set(mine, file);
            keysByName.set(name, [...(keysByName.get(name) ?? []), mine]);
          }
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
        bound.set(file, (bound.get(file) ?? new Set()).add(node.name.text));
      if (mine && ts.isCallExpression(node) && ts.isIdentifier(node.expression))
        calls.get(mine)?.add(node.expression.text);
      ts.forEachChild(node, (child) => visit(child, mine));
    };
    visit(parseFile(file), null);
  }

  const resolve = (file: string, name: string): string[] => {
    const local = keyOf(file, name);
    if (calls.has(local)) return [local];
    if (bound.get(file)?.has(name)) return [];
    return keysByName.get(name) ?? [];
  };

  return {
    close(seed) {
      const seeds = new Set(seed);
      const reached = new Set<string>();
      // Fixed point rather than a fixed pass count: a chain longer than the
      // passes would silently truncate, and a truncated closure reports a
      // guard as unproved when it is fine -- a false alarm that gets a real
      // control deleted.
      let grew = true;
      while (grew) {
        grew = false;
        for (const [key, callees] of calls) {
          if (reached.has(key)) continue;
          const file = fileOf.get(key) ?? '';
          for (const callee of callees)
            if (
              seeds.has(callee) ||
              resolve(file, callee).some((k) => reached.has(k))
            ) {
              reached.add(key);
              grew = true;
              break;
            }
        }
      }
      return {
        reaches: (file, name) =>
          seeds.has(name) ||
          resolve(file, name).some((key) => reached.has(key)),
      };
    },
  };
}

/** Every `const x = <expr>` in a file, for resolving an identifier one hop. */
export function declarationsIn(sf: ts.SourceFile): Map<string, ts.Expression> {
  const decls = new Map<string, ts.Expression>();
  const collect = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    )
      decls.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(sf);
  return decls;
}

/** `path/to/file.ts:42`, repo-relative, for a finding a human has to open. */
export const where = (sf: ts.SourceFile, node: ts.Node): string =>
  `${relative(process.cwd(), sf.fileName)}:` +
  `${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
