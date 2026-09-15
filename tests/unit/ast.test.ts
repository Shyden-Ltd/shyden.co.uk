import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { bind, derivationOf, type Bound } from './ast';

/**
 * The resolver both meta-guards stand on (#184).
 *
 * `declarationsIn` used to key every `const` in a file by bare name, so the
 * last declaration won in every scope. `supply-chain.test.ts` declares
 * `const config` four times, and `anchored-presence` read two stripped
 * assertions as raw because line 258's `parseCleanYaml(...)` overwrote the
 * `configBody()` each of those tests actually uses. Every fixture below is a
 * place where a name-keyed or hand-rolled resolver answers differently from
 * the language itself.
 */

/** One fixture, bound, failing loudly if the program dropped it. */
function fixture(source: string): { bound: Bound; sf: ts.SourceFile } {
  const bound = bind(new Map([['fixture.ts', source]]));
  const sf = bound.files.get('fixture.ts');
  if (!sf) throw new Error('the fixture was not bound');
  return { bound, sf };
}

/** The argument of every `use(...)` call in a file, in source order. */
function useArguments(sf: ts.SourceFile): ts.Expression[] {
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'use' &&
      node.arguments[0]
    )
      found.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** What each `use(name)` in a file resolves to, as source text. */
function resolvedIn(bound: Bound, sf: ts.SourceFile): (string | undefined)[] {
  return useArguments(sf).map((arg) => {
    if (!ts.isIdentifier(arg))
      throw new Error(`use() takes a bare name, got ${arg.getText()}`);
    return bound.initializerOf(arg)?.getText();
  });
}

const resolved = (source: string): (string | undefined)[] => {
  const { bound, sf } = fixture(source);
  return resolvedIn(bound, sf);
};

/** Every name each `use(...)` derives from. A set: the order is the walk's. */
const derivedNames = (source: string): Set<string>[] => {
  const { bound, sf } = fixture(source);
  return useArguments(sf).map((arg) => new Set(derivationOf(arg, bound).names));
};

describe('a name resolves to the declaration the language binds it to', () => {
  it('gives same-named consts in sibling tests their own initializers', () => {
    expect(
      resolved(`
        it('a', () => { const config = 'first'; use(config); });
        it('b', () => { const config = 'second'; use(config); });
      `),
    ).toEqual(["'first'", "'second'"]);
  });

  it('lets an inner declaration shadow an outer one only inside its scope', () => {
    expect(
      resolved(`
        const config = 'outer';
        function inner() { const config = 'inner'; use(config); }
        use(config);
      `),
    ).toEqual(["'inner'", "'outer'"]);
  });

  it('still resolves a name declared only in an enclosing scope', () => {
    expect(
      resolved(`
        const config = 'outer';
        it('a', () => { use(config); });
      `),
    ).toEqual(["'outer'"]);
  });

  it('stops at a parameter instead of falling through to an outer const', () => {
    expect(
      resolved(`
        const config = 'outer';
        const read = (config: string) => use(config);
      `),
    ).toEqual([undefined]);
  });

  it('stops at an import instead of reaching into another scope', () => {
    expect(
      resolved(`
        import { config } from './elsewhere';
        it('a', () => { const config = 'local'; });
        use(config);
      `),
    ).toEqual([undefined]);
  });

  it('stops at a function declaration of the same name', () => {
    expect(
      resolved(`
        const config = 'outer';
        it('a', () => { function config() { return 'fn'; } use(config); });
      `),
    ).toEqual([undefined]);
  });

  it('stops at a destructured binding instead of falling through', () => {
    // A binding pulled out of `load()` has no initializer of its own, and
    // `load()` also builds everything destructured beside it. Following it
    // gave `const { allowed, readings } = await page.evaluate(...)` the
    // `.filter()` that builds `allowed`, and `absence-liveness` then called an
    // assertion over `readings` a collector it is not (#184).
    expect(
      resolved(`
        const config = 'outer';
        it('a', () => { const { config } = load(); use(config); });
      `),
    ).toEqual([undefined]);
  });

  it('resolves a shorthand property to the variable, not to the property', () => {
    const { bound, sf } = fixture(`
      const config = 'value';
      use({ config });
    `);
    const [arg] = useArguments(sf);
    if (!arg || !ts.isObjectLiteralExpression(arg))
      throw new Error('the fixture no longer passes an object literal');
    const [property] = arg.properties;
    if (!property || !ts.isShorthandPropertyAssignment(property))
      throw new Error('the fixture no longer uses a shorthand property');
    expect(bound.initializerOf(property.name)?.getText()).toBe("'value'");
  });

  it('keeps top-level declarations in different files apart', () => {
    // A file with no import or export is a SCRIPT to TypeScript, and a
    // script's top-level names share one global scope. These are two such
    // files, which is exactly what a fixture usually is.
    const bound = bind(
      new Map([
        ['a.ts', `const config = 'a'; use(config);`],
        ['b.ts', `const config = 'b'; use(config);`],
      ]),
    );
    const inFile = (name: string) => {
      const sf = bound.files.get(name);
      if (!sf) throw new Error(`${name} was not bound`);
      return resolvedIn(bound, sf);
    };
    expect([inFile('a.ts'), inFile('b.ts')]).toEqual([["'a'"], ["'b'"]]);
  });
});

describe('an expression derives from what its own scope binds', () => {
  it('follows an assertion through the declaration in its own test', () => {
    // The shape measured at supply-chain.test.ts:206.
    expect(
      derivedNames(`
        const configBody = () => withoutYamlComments(dependabot());
        it('watches npm', () => { const config = configBody(); use(config); });
        it('parses it', () => { const config = parseCleanYaml(dependabot()); });
      `),
    ).toEqual([
      new Set(['config', 'configBody', 'withoutYamlComments', 'dependabot']),
    ]);
  });

  it('takes no roots from type positions', () => {
    expect(
      derivedNames(`
        const cast = load() as { updates: string; ignore: Rule[] };
        const checked = make() satisfies Shape;
        const typed = (input: Input): Output => input;
        use(cast); use(checked); use(typed);
      `),
    ).toEqual([
      new Set(['cast', 'load']),
      new Set(['checked', 'make']),
      new Set(['typed', 'input']),
    ]);
  });

  it('keeps the base of a class expression, which is a value, not a type', () => {
    expect(
      derivedNames(`
        const Base = make();
        const Derived = class extends Base {};
        use(Derived);
      `),
    ).toEqual([new Set(['Derived', 'Base', 'make'])]);
  });

  it('reports every initializer it followed, in the order reached', () => {
    const { bound, sf } = fixture(`
      const found = [];
      const view = found;
      use(view);
    `);
    const [arg] = useArguments(sf);
    if (!arg) throw new Error('the fixture no longer calls use()');
    expect(
      derivationOf(arg, bound).initializers.map((init) => init.getText()),
    ).toEqual(['found', '[]']);
  });

  it('terminates on bindings that refer to each other', () => {
    expect(
      derivedNames(`
        let a = b;
        let b = a;
        use(a);
      `),
    ).toEqual([new Set(['a', 'b'])]);
  });
});
