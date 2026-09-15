import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

/**
 * The TypeScript-AST machinery the meta-guards share (#118).
 *
 * Two guards in this suite reason about the suite itself.
 * `anchored-presence.test.ts` (#98) asks whether a presence assertion reads
 * stripped text; `absence-liveness.test.ts` (#118) asks whether an absence
 * assertion proves its population was live. Both need the same five things:
 * parse a file, bind it so a name resolves by scope, name what a node is
 * declared as, follow an expression back to what it is made of, and close a
 * call graph transitively.
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

/**
 * Source text parsed with parent pointers, which `declaredName` needs. Takes
 * text rather than a path so a detector can be handed a fixture that is not
 * on disk.
 */
export const parseSource = (text: string, file = 'source.ts'): ts.SourceFile =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

/** A file parsed with parent pointers (`parseSource`). */
export const parseFile = (file: string): ts.SourceFile =>
  parseSource(readFileSync(file, 'utf8'), file);

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
 * Source files bound into one TypeScript program, so a name resolves the way
 * the language resolves it (#184).
 *
 * Resolved by bare name, as this module once did it, the last `const` of a name
 * won in every scope of its file. `supply-chain.test.ts` declares
 * `const config` in four tests, and two stripped assertions read as raw
 * because the fourth test's `parseCleanYaml(...)` overwrote the
 * `configBody()` their own tests declare. Scoping is the binder's job, and a
 * hand-written scope walk is one more approximation to get wrong -- block
 * scope, `var` hoisting, parameters, catch clauses -- so the checker is asked
 * instead, the way `commentsIn` asks the scanner rather than the text.
 */
export interface Bound {
  /** Every file, keyed by the name it was bound under. */
  readonly files: ReadonlyMap<string, ts.SourceFile>;
  /**
   * The initializer of the variable `id` refers to. A parameter, an import, a
   * function, a class or a destructured binding binds the name with no
   * initializer of its own, so it answers `undefined` -- and ends the search
   * there, instead of letting an outer declaration of the same name answer in
   * its place. A destructured binding stops rather than following its whole
   * source, because that source builds every sibling too: `readings` would be
   * judged by the `.filter()` that builds `allowed` beside it.
   */
  initializerOf(id: ts.Identifier): ts.Expression | undefined;
}

/**
 * Bind `sources`, each file's name to its text, into one program.
 *
 * Binding is all that is wanted: no lib, no module resolution, no type
 * checking. `moduleDetection: Force` makes every file a module, because a file
 * with no import or export is otherwise a SCRIPT, and scripts share one global
 * scope -- two fixtures each declaring `config` would both resolve to
 * whichever was bound first.
 */
export function bind(sources: ReadonlyMap<string, string>): Bound {
  const options: ts.CompilerOptions = {
    noLib: true,
    noResolve: true,
    types: [],
    target: ts.ScriptTarget.Latest,
    moduleDetection: ts.ModuleDetectionKind.Force,
  };
  const parsed = new Map<string, ts.SourceFile>();
  const host: ts.CompilerHost = {
    // Parsed here, with the program's own options, rather than handed over
    // pre-parsed: those options are what carry `moduleDetection` to the file.
    getSourceFile: (name, languageVersionOrOptions) => {
      const text = sources.get(name);
      if (text === undefined) return undefined;
      const sf = ts.createSourceFile(
        name,
        text,
        languageVersionOrOptions,
        true,
      );
      parsed.set(name, sf);
      return sf;
    },
    fileExists: (name) => sources.has(name),
    readFile: (name) => sources.get(name),
    writeFile: () => {},
    getDefaultLibFileName: () => 'lib.d.ts',
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const checker = ts
    .createProgram([...sources.keys()], options, host)
    .getTypeChecker();

  const files = new Map<string, ts.SourceFile>();
  for (const name of sources.keys()) {
    const sf = parsed.get(name);
    if (!sf) throw new Error(`${name} was not bound into the program`);
    files.set(name, sf);
  }

  return {
    files,
    initializerOf(id) {
      // `{ config }` names a property AND a variable, and the property -- the
      // one `getSymbolAtLocation` answers with -- has no initializer.
      const symbol = ts.isShorthandPropertyAssignment(id.parent)
        ? checker.getShorthandAssignmentValueSymbol(id.parent)
        : checker.getSymbolAtLocation(id);
      const declaration = symbol?.valueDeclaration;
      return declaration && ts.isVariableDeclaration(declaration)
        ? declaration.initializer
        : undefined;
    },
  };
}

/** `bind` over files on disk, each keyed by the path it was read from. */
export const bindFiles = (paths: readonly string[]): Bound =>
  bind(new Map(paths.map((path) => [path, readFileSync(path, 'utf8')])));

/**
 * What an expression is made of, following the bindings its own scope sees to
 * a fixed point. Bindings, never names: a name followed through a file-wide
 * map reaches whichever same-named declaration the file holds last (#184).
 */
export interface Derivation {
  /** Every identifier name the expression is built from. */
  readonly names: readonly string[];
  /** Every variable initializer followed on the way, in the order reached. */
  readonly initializers: readonly ts.Expression[];
}

/**
 * Every identifier feeding an expression, innermost callee first, as nodes so
 * each one can be resolved from where it stands. `withoutTsComments(
 * readFileSync(p))` yields both callees, so a caller can ask what an expression
 * is made of rather than what its outermost call happens to be.
 *
 * A type position contributes nothing, for the reason a key or a parameter
 * name does not: a type is not a reference. The one type-shaped node that
 * holds a value is a heritage clause -- `class extends Base` evaluates `Base`.
 */
function identifiersIn(
  node: ts.Node | undefined,
  acc: ts.Identifier[] = [],
): ts.Identifier[] {
  if (!node) return acc;
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression)) acc.push(node.expression);
    else if (ts.isPropertyAccessExpression(node.expression))
      identifiersIn(node.expression.expression, acc);
    node.arguments.forEach((arg) => identifiersIn(arg, acc));
    return acc;
  }
  if (ts.isPropertyAccessExpression(node))
    return identifiersIn(node.expression, acc);
  // A key is a BINDING, not a reference. `{ config: {} }` in a test factory
  // was resolving its key to a `config` helper that reads a file, which made
  // a deliberately-empty boundary case read as a filesystem scan. Parameter
  // names leak the same way, so only a default value counts there.
  if (ts.isPropertyAssignment(node))
    return identifiersIn(node.initializer, acc);
  if (ts.isParameter(node)) return identifiersIn(node.initializer, acc);
  if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node))
    return acc;
  if (ts.isIdentifier(node)) {
    acc.push(node);
    return acc;
  }
  // The braces are load-bearing. `ts.forEachChild` STOPS at the first child
  // whose callback returns something truthy, and this returns `acc` -- an
  // array, always truthy. Written point-free it visited exactly one child per
  // node, so an arrow function yielded its parameter and never its body.
  // Inherited from #98, where it quietly narrowed that guard too.
  ts.forEachChild(node, (child) => {
    identifiersIn(child, acc);
  });
  return acc;
}

/**
 * What `node` is made of, each identifier resolved in its own scope.
 *
 * To a fixed point, because one hop hides exactly the guards that matter.
 * `locale-beta.test.ts` writes `const source = withoutTsComments(
 * readFileSync(INDEX))` and then asserts over `source.match(...)`, so the
 * `readFileSync` is two hops from the assertion. #98's derivation stopped at
 * one and reached it only by accident, resolving the local string to an
 * unrelated `source()` function three files away -- the right answer for the
 * wrong reason, which stopped being right the moment that accident was fixed.
 */
export function derivationOf(node: ts.Expression, bound: Bound): Derivation {
  const names = new Set<string>();
  const initializers: ts.Expression[] = [];
  const queue = identifiersIn(node);
  while (queue.length > 0) {
    const id = queue.shift() as ts.Identifier;
    names.add(id.text);
    const init = bound.initializerOf(id);
    if (init === undefined || initializers.includes(init)) continue;
    initializers.push(init);
    queue.push(...identifiersIn(init));
  }
  return { names: [...names], initializers };
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

/**
 * Every comment in a parsed file, in source order, each exactly once.
 *
 * Asked of the parser, never the text, because only the parser knows where a
 * comment can be: `/**` inside a string, a template or a regex literal is
 * content, and telling a regex from a division takes the grammar (#65).
 *
 * A comment is trivia before some token, so this asks at every token's full
 * start, and asks twice. `getLeadingCommentRanges` returns only the comments
 * after a line break; the ones still on the previous token's line come from
 * `getTrailingCommentRanges`, and either call alone silently drops the other
 * half. Tokens, not just nodes: the trivia before a closing `}` starts no
 * node, and `ts.forEachChild` never visits a token.
 *
 * Two places look like trivia and are not. A JSDoc node's own children sit
 * INSIDE a comment, and JSX text is content the scanner copies verbatim, so
 * asking at either reads a `/**` written just after a `{@link}`, or between
 * two JSX tags, as a comment that does not exist.
 */
export function commentsIn(sf: ts.SourceFile): ts.CommentRange[] {
  const text = sf.getFullText();
  const found = new Map<number, ts.CommentRange>();
  const jsxText: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJSDoc(node)) return;
    if (ts.isJsxText(node)) {
      jsxText.push(node);
      return;
    }
    const at = node.getFullStart();
    for (const range of [
      ...(ts.getLeadingCommentRanges(text, at) ?? []),
      ...(ts.getTrailingCommentRanges(text, at) ?? []),
    ])
      found.set(range.pos, range);
    node.getChildren(sf).forEach(visit);
  };
  visit(sf);
  // A list's full start can fall where JSX text begins, so a range is dropped
  // by where it STARTS, not by which node it was asked for.
  return [...found.values()]
    .filter(
      (range) =>
        !jsxText.some((node) => range.pos >= node.pos && range.pos < node.end),
    )
    .sort((a, b) => a.pos - b.pos);
}

/** `path/to/file.ts:42`, repo-relative, for a finding a human has to open. */
export const where = (sf: ts.SourceFile, node: ts.Node): string =>
  `${relative(process.cwd(), sf.fileName)}:` +
  `${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
