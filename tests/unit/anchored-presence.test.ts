import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { filesUnder } from '../source-files';

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

const parse = (file: string) =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

const declaredName = (node: ts.Node): string | null => {
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

/** Which named functions read file CONTENT, and which strip comments. */
function buildIndex() {
  const calls = new Map<string, Set<string>>();
  const reads = new Set<string>();
  const strips = new Set<string>();
  for (const file of tsFiles) {
    const visit = (node: ts.Node, owner: string | null) => {
      let mine = owner;
      const isFn =
        ts.isFunctionDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node);
      if (isFn) {
        const name = declaredName(node);
        if (name) {
          mine = name;
          if (!calls.has(mine)) calls.set(mine, new Set());
        }
      }
      if (
        mine &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression)
      ) {
        const called = node.expression.text;
        calls.get(mine)?.add(called);
        if (READS_CONTENT.has(called)) reads.add(mine);
        if (STRIPPERS.has(called)) strips.add(mine);
      }
      ts.forEachChild(node, (child) => visit(child, mine));
    };
    visit(parse(file), null);
  }
  // Transitive closure: a caller inherits the property of what it calls.
  const close = (seed: Iterable<string>): Set<string> => {
    const set = new Set(seed);
    for (let pass = 0; pass < 6; pass += 1)
      for (const [fn, called] of calls)
        for (const name of called) if (set.has(name)) set.add(fn);
    return set;
  };
  return { readers: close(reads), strippers: close([...strips, ...STRIPPERS]) };
}

/** Every identifier feeding an expression, innermost callee first. */
const roots = (node: ts.Node | undefined, acc: string[] = []): string[] => {
  if (!node) return acc;
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression)) acc.push(node.expression.text);
    else if (ts.isPropertyAccessExpression(node.expression))
      roots(node.expression.expression, acc);
    node.arguments.forEach((arg) => roots(arg, acc));
    return acc;
  }
  if (ts.isPropertyAccessExpression(node)) return roots(node.expression, acc);
  if (ts.isIdentifier(node)) {
    acc.push(node.text);
    return acc;
  }
  ts.forEachChild(node, (child) => roots(child, acc));
  return acc;
};

function scan() {
  const { readers, strippers } = buildIndex();
  const findings: string[] = [];
  let scanned = 0;
  for (const file of tsFiles.filter((f) => /\.(test|spec)\.ts$/.test(f))) {
    const sf = parse(file);
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
            let names = roots(subject);
            for (const name of [...names]) {
              const decl = decls.get(name);
              if (decl) names = names.concat(roots(decl));
            }
            const fromContent = names.some(
              (n) => readers.has(n) || READS_CONTENT.has(n),
            );
            const parsed = names.some((n) => PARSED.has(n));
            if (fromContent && !parsed) {
              scanned += 1;
              const stripped = names.some((n) => strippers.has(n));
              const arg = node.arguments[0];
              const anchored =
                arg !== undefined && ts.isRegularExpressionLiteral(arg);
              if (!stripped && !anchored) {
                const { line } = sf.getLineAndCharacterOfPosition(
                  node.getStart(),
                );
                findings.push(
                  `${relative(process.cwd(), file)}:${line + 1} — ` +
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
    expect(result.scanned).toBeGreaterThan(20);
    expect(tsFiles.length).toBeGreaterThan(30);
  });

  it('finds none reading raw source with an unanchored matcher', () => {
    expect(result.findings, result.findings.join('\n')).toEqual([]);
  });
});
