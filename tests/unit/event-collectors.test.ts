import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  callsIn,
  declarationsIn,
  enclosingDeclaration,
  type Declaration,
} from '../playwright-declarations';
import { specDirs } from '../spec-dirs';
import { searched, tsFilesUnder } from '../source-files';
import { parseSource } from './ast';
import { withoutTsComments } from './source-text';

/**
 * Browser events that exist only to be COLLECTED and asserted on later, as
 * opposed to `dialog` and `download`, which a test HANDLES in the moment.
 *
 * The distinction matters because collecting is where the vacuity lives. A
 * collected event arrives over the browser protocol asynchronously, so a test
 * that reads the array the instant an action returns is racing delivery.
 * CI proved it on 2026-09-09 (run 34391533802): six `fetch` calls had been
 * issued and `expect(audioRequests).toHaveLength(6)` saw `[]`.
 *
 * That is survivable as a flake. The same expression asserting ABSENCE is
 * not — eight sites read `toEqual([])` the same instant, including
 * `the homepage still ships no JavaScript`, which would have certified a
 * homepage full of JavaScript for exactly the reason CI demonstrated. #79.
 */
const COLLECTED_EVENTS = [
  'request',
  'requestfailed',
  'requestfinished',
  'response',
  'console',
  'pageerror',
] as const;

const SUBSCRIBES = new RegExp(
  `\\.on\\(\\s*['"\`](?:${COLLECTED_EVENTS.join('|')})['"\`]`,
);

/**
 * Where a subscription is allowed to live. Everything else must take a
 * recorder from here, because a recorder can refuse to answer when it has
 * seen nothing at all — a convention at the call site cannot.
 */
const RECORDERS = 'tests/e2e/recorders.ts';

/** Every file a spec could put a collector in — derived, never listed (#67). */
const SCANNED = specDirs().flatMap(tsFilesUnder).sort();

export function subscribesToACollectedEvent(source: string): boolean {
  return SUBSCRIBES.test(withoutTsComments(source));
}

describe('browser-event collectors have exactly one home', () => {
  it('scans every spec directory', () => {
    // Anti-vacuity: an empty scan satisfies the assertion below, which is the
    // very failure mode this ticket is about.
    expect(SCANNED.length).toBeGreaterThan(20);
    expect(SCANNED).toContain('tests/e2e/classroom-groups.spec.ts');
    expect(SCANNED).toContain(RECORDERS);
  });

  it('is subscribed to only in recorders.ts', () => {
    expect(
      SCANNED.filter((path) =>
        subscribesToACollectedEvent(readFileSync(path, 'utf8')),
      ),
    ).toEqual([RECORDERS]);
  });

  it('catches a hand-rolled collector', () => {
    expect(
      subscribesToACollectedEvent(`
        const errors: string[] = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      `),
    ).toBe(true);
  });

  it('is not fired by a comment describing one', () => {
    expect(
      subscribesToACollectedEvent(`
        // Deliberately NOT page.on('request', ...) — see recorders.ts, which
        // refuses to answer when it has recorded nothing at all.
        const seen = recordRequests(page);
      `),
    ).toBe(false);
  });

  it('leaves dialog and download handlers alone', () => {
    // These are handled in the moment, not collected and asserted later, so
    // they carry none of the delivery race this guard exists to stop.
    expect(
      subscribesToACollectedEvent(`
        page.on('dialog', (d) => d.dismiss());
        page.on('download', (d) => saved.push(d.suggestedFilename()));
      `),
    ).toBe(false);
  });
});

/**
 * A loop over a locator list, and whether anything proved the list non-empty
 * before it ran.
 *
 * `.all()` resolves to `[]` when nothing matches — it neither waits nor fails
 * — so a selector that drifts turns the loop into a no-op and the test goes
 * green having checked nothing its title claims. `chrome.spec.ts` proved that
 * and wrote the lesson out in a comment; `classroom-groups-io.spec.ts` was
 * written afterwards without it, and its WCAG 44px touch-target guard passed
 * with the selector pointed at a class that does not exist. A convention at
 * the call site is not a control (#87, after #79 and #84).
 *
 * Returns EVERY loop, proved or not, so the liveness of this detector reads
 * off the same data as its verdict: a reader that quietly stopped finding
 * loops would report zero unproved loops and zero loops, and only one of
 * those is a healthy suite.
 */
export interface LocatorLoop {
  /** The locator, as written: a variable name, or the selector it inlines. */
  readonly subject: string;
  readonly proved: boolean;
}

/** Matchers that fail on an empty list: a count, or a visible element. */
const PROVES_NOT_EMPTY = new Set(['toHaveCount', 'toBeVisible']);
/** Calls that pick one element, so a visible one proves the list has one. */
const PICKS_ONE = new Set(['first', 'last', 'nth']);

/** A `for (… of await <locator>.all())` loop, when `call` is its `.all()`. */
function loopOver(
  call: ts.CallExpression,
): { loop: ts.ForOfStatement; locator: ts.Expression } | undefined {
  const { expression: callee, parent: awaited } = call;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    callee.name.text !== 'all' ||
    call.arguments.length > 0 ||
    !ts.isAwaitExpression(awaited)
  )
    return undefined;
  const loop = awaited.parent;
  return ts.isForOfStatement(loop) && loop.expression === awaited
    ? { loop, locator: callee.expression }
    : undefined;
}

/**
 * The locator `call` proves is not empty -- `expect(x).toHaveCount(n)`, or
 * `expect(x.first()).toBeVisible()` -- or undefined when it proves no such
 * thing. A negated check hangs its matcher off `.not`, not off `expect()`,
 * so it is not read as one: it passes on an empty list.
 */
function provenLocator(call: ts.CallExpression): ts.Expression | undefined {
  const matcher = call.expression;
  if (
    !ts.isPropertyAccessExpression(matcher) ||
    !PROVES_NOT_EMPTY.has(matcher.name.text)
  )
    return undefined;
  const asserted = matcher.expression;
  if (
    !ts.isCallExpression(asserted) ||
    !ts.isIdentifier(asserted.expression) ||
    asserted.expression.text !== 'expect'
  )
    return undefined;
  const [subject] = asserted.arguments;
  if (
    subject !== undefined &&
    ts.isCallExpression(subject) &&
    ts.isPropertyAccessExpression(subject.expression) &&
    PICKS_ONE.has(subject.expression.name.text)
  )
    return subject.expression.expression;
  return subject;
}

/**
 * Where `node` runs: the test or group whose callback holds it, else the
 * outermost function holding it (a helper), else the file. A proof vouches
 * only for a loop with the same owner. A count asserted in a DIFFERENT test
 * proves nothing about this one, and the whole file would otherwise vouch
 * for every loop in it.
 */
function ownerOf(node: ts.Node, declarations: readonly Declaration[]): ts.Node {
  const declaration = enclosingDeclaration(node, declarations);
  if (declaration !== undefined) return declaration.body;
  let owner: ts.Node = node.getSourceFile();
  for (let at = node.parent; at !== undefined; at = at.parent)
    if (ts.isFunctionLike(at)) owner = at;
  return owner;
}

/**
 * `node`'s tokens in order. Layout is not among them: trivia never is, a
 * comma closing a list is how prettier wraps one, and a string's quotes are
 * how it is spelled.
 */
function tokensOf(node: ts.Node): string[] {
  const children = node.getChildren();
  if (children.length === 0)
    return [
      ts.isStringLiteralLike(node) ? JSON.stringify(node.text) : node.getText(),
    ];
  return children.flatMap((child, at) =>
    child.kind === ts.SyntaxKind.CommaToken && at === children.length - 1
      ? []
      : tokensOf(child),
  );
}

/** Whether two expressions are the same code, however each is laid out. */
function sameCode(a: ts.Node, b: ts.Node): boolean {
  const [left, right] = [tokensOf(a), tokensOf(b)];
  return (
    left.length === right.length &&
    left.every((token, at) => token === right[at])
  );
}

/**
 * The first string or template literal in `node`, in source order. Here the
 * early stop is the point: `ts.forEachChild` returns the first truthy result.
 */
const firstStringIn = (node: ts.Node): ts.Node | undefined =>
  ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)
    ? node
    : ts.forEachChild(node, firstStringIn);

/** A bare `links`, or the selector string inside `page.locator('.x')`. */
const subjectOf = (locator: ts.Expression): string =>
  (firstStringIn(locator) ?? locator).getText();

export function locatorLoops(source: string): LocatorLoop[] {
  const sf = parseSource(source);
  const declarations = declarationsIn(sf);
  const calls = callsIn(sf);
  const proofs = calls.flatMap((call) => {
    const locator = provenLocator(call);
    return locator === undefined
      ? []
      : [{ at: call.getStart(), owner: ownerOf(call, declarations), locator }];
  });
  return calls.flatMap((call) => {
    const over = loopOver(call);
    if (over === undefined) return [];
    const owner = ownerOf(over.loop, declarations);
    return [
      {
        subject: subjectOf(over.locator),
        proved: proofs.some(
          (proof) =>
            proof.at < over.loop.getStart() &&
            proof.owner === owner &&
            sameCode(proof.locator, over.locator),
        ),
      },
    ];
  });
}

/** A synthetic spec, one argument per line. */
const spec = (...lines: string[]): string => lines.join('\n');

describe('a locator list cannot be looped unproved', () => {
  it('sees the loops it is scanning for', () => {
    // The detector's own liveness. Zero unproved loops means nothing if the
    // regex found zero loops.
    expect(
      SCANNED.flatMap((path) => locatorLoops(readFileSync(path, 'utf8')))
        .length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('catches a loop with nothing proving the list is not empty', () => {
    expect(
      locatorLoops(
        "test('x', async () => {\n  for (const a of await links.all()) f(a);\n});",
      ),
    ).toEqual([{ subject: 'links', proved: false }]);
  });

  it('accepts a count, and accepts a visibility check on the first', () => {
    expect(
      locatorLoops(
        "test('x', async () => {\n  await expect(links).toHaveCount(3);\n  for (const a of await links.all()) f(a);\n});",
      ),
    ).toEqual([{ subject: 'links', proved: true }]);
    expect(
      locatorLoops(
        "test('x', async () => {\n  await expect(btns.first()).toBeVisible();\n  for (const b of await btns.all()) f(b);\n});",
      ),
    ).toEqual([{ subject: 'btns', proved: true }]);
  });

  it('reads an inlined locator by its selector, not by a variable name', () => {
    expect(
      locatorLoops(
        "test('x', async () => {\n  await expect(page.locator('.z')).toHaveCount(2);\n  for (const c of await page.locator('.z').all()) f(c);\n});",
      ),
    ).toEqual([{ subject: "'.z'", proved: true }]);
  });

  it('is not satisfied by a count asserted in a DIFFERENT test', () => {
    // Without the enclosing-test window the whole file would vouch for every
    // loop in it, which is how a guard decays into a formality.
    expect(
      locatorLoops(
        "test('a', async () => {\n  await expect(links).toHaveCount(3);\n});\ntest('b', async () => {\n  for (const a of await links.all()) f(a);\n});",
      ),
    ).toEqual([{ subject: 'links', proved: false }]);
  });

  it('is not fired by a comment describing one', () => {
    // chrome.spec.ts spells `.all()` out in prose at length, so this is a live
    // false-positive risk, not a hypothetical.
    expect(
      locatorLoops(
        "// for (const a of await links.all()) would be unproved here\ntest('x', () => {});",
      ),
    ).toEqual([]);
  });

  it('is not satisfied by the test above a parked one (test.fixme)', () => {
    // A parked test is still a test: its loop runs the day it is unparked.
    expect(
      locatorLoops(
        spec(
          "test('a', async () => {",
          '  await expect(links).toHaveCount(3);',
          '});',
          "test.fixme('b', async () => {",
          '  for (const a of await links.all()) f(a);',
          '});',
        ),
      ),
    ).toEqual([{ subject: 'links', proved: false }]);
  });

  it('reads a loop in a group hook as the group, not the test above it', () => {
    expect(
      locatorLoops(
        spec(
          "test('a', async () => {",
          '  await expect(links).toHaveCount(3);',
          '});',
          "test.describe('g', () => {",
          '  test.beforeEach(async () => {',
          '    for (const a of await links.all()) f(a);',
          '  });',
          '});',
        ),
      ),
    ).toEqual([{ subject: 'links', proved: false }]);
  });

  it('is not satisfied by the test above a helper that holds the loop', () => {
    expect(
      locatorLoops(
        spec(
          "test('a', async () => {",
          '  await expect(links).toHaveCount(3);',
          '});',
          'async function each(links) {',
          '  for (const a of await links.all()) f(a);',
          '}',
        ),
      ),
    ).toEqual([{ subject: 'links', proved: false }]);
  });

  it('accepts a helper that proves its own locator first', () => {
    expect(
      locatorLoops(
        spec(
          'async function each(links) {',
          '  await expect(links.first()).toBeVisible();',
          '  for (const a of await links.all()) f(a);',
          '}',
        ),
      ),
    ).toEqual([{ subject: 'links', proved: true }]);
  });

  it('reads a loop inside test.step as its test', () => {
    expect(
      locatorLoops(
        spec(
          "test('x', async () => {",
          '  await expect(links).toHaveCount(3);',
          "  await test.step('each', async () => {",
          '    for (const a of await links.all()) f(a);',
          '  });',
          '});',
        ),
      ),
    ).toEqual([{ subject: 'links', proved: true }]);
  });

  it('is not satisfied by a proof after the loop', () => {
    expect(
      locatorLoops(
        spec(
          "test('x', async () => {",
          '  for (const a of await links.all()) f(a);',
          '  await expect(links).toHaveCount(3);',
          '});',
        ),
      ),
    ).toEqual([{ subject: 'links', proved: false }]);
  });

  it('accepts a proof prettier wrapped across lines', () => {
    expect(
      locatorLoops(
        spec(
          "test('x', async ({ page }) => {",
          '  await expect(',
          "    page.locator('#cg-roster tbody tr'),",
          '  ).toHaveCount(3);',
          "  for (const row of await page.locator('#cg-roster tbody tr').all()) f(row);",
          '});',
        ),
      ),
    ).toEqual([{ subject: "'#cg-roster tbody tr'", proved: true }]);
  });

  it('sees a loop prettier wrapped across lines', () => {
    expect(
      locatorLoops(
        spec(
          "test('x', async ({ page }) => {",
          "  await expect(page.locator('.z').first()).toBeVisible();",
          '  for (const c of await page',
          "    .locator('.z')",
          '    .all()) f(c);',
          '});',
        ),
      ),
    ).toEqual([{ subject: "'.z'", proved: true }]);
  });

  it('is not satisfied by a different locator whose name contains this one', () => {
    expect(
      locatorLoops(
        spec(
          "test('x', async () => {",
          '  await expect(linksInFooter).toHaveCount(3);',
          '  for (const a of await links.all()) f(a);',
          '});',
        ),
      ),
    ).toEqual([{ subject: 'links', proved: false }]);
  });

  it('is not satisfied by a negated check', () => {
    // `.not.toBeVisible()` passes on an empty list: it proves the opposite.
    expect(
      locatorLoops(
        spec(
          "test('x', async () => {",
          '  await expect(links.first()).not.toBeVisible();',
          '  for (const a of await links.all()) f(a);',
          '});',
        ),
      ),
    ).toEqual([{ subject: 'links', proved: false }]);
  });

  it('every .all() loop proves its locator is not empty first', () => {
    const unproved = SCANNED.flatMap((path) =>
      locatorLoops(readFileSync(path, 'utf8'))
        .filter((loop) => !loop.proved)
        .map((loop) => `${path}: ${loop.subject}`),
    );
    expect(
      searched(unproved, { of: SCANNED, what: 'scanned e2e specs' }),
      unproved.join('\n'),
    ).toEqual([]);
  });
});
