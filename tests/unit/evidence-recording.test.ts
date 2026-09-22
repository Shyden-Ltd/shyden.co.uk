/**
 * A recording is earned by ACTION, and the rule is derived from the source.
 *
 * Operator, 2026-09-18, reviewing #205's preview: "recordings are pointless
 * and useless on static content", and "if there is some sort of action. I.e.
 * a click, a scroll or orientation change. Then we need a recording.
 * otherwise, screenshot is perfect on it's own."
 *
 * So the policy has two halves that must agree: a spec DECLARES
 * `test.use(recorded)`, and its own source says whether it acts. Neither
 * stands alone. A hand-written list of "the ones that animate" is exactly
 * the shape that opened `#cg-grouping-toggle` and `#cg-sound-toggle` and
 * never `#cg-io-toggle` -- the only one holding a native file input, and the
 * only one that broke. The source is the authority; the declaration is the
 * thing checked against it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { withoutTsComments } from './source-text';
import { specFilesUnder, searched, nonEmpty } from '../source-files';
import { parseSource } from './ast';
import {
  callsIn,
  declarationsIn,
  enclosingDeclaration,
  useCallsIn,
} from '../playwright-declarations';

const E2E = 'tests/e2e';
const HOME = 'tests/e2e/evidence.ts';
const CONFIG = 'playwright.config.ts';

const SPECS = nonEmpty(specFilesUnder(E2E), 'e2e specs');

/**
 * What ACTING is, spelled as the constructs that do it rather than as a
 * judgement about a spec's name. Matched with the leading dot and the opening
 * parenthesis so a test TITLE containing the word "click" is not an action.
 */
const ACTIONS = [
  '.click(',
  '.dblclick(',
  '.tap(',
  '.hover(',
  '.press(',
  '.type(',
  '.fill(',
  '.dragTo(',
  '.selectOption(',
  '.check(',
  '.uncheck(',
  '.setInputFiles(',
  '.scrollIntoViewIfNeeded(',
  '.setViewportSize(',
  'mouse.wheel(',
  'mouse.down(',
  'scrollTo(',
  'scrollBy(',
] as const;

/** Comment-stripped, so a spec's own prose can never satisfy or defeat this. */
const sourceOf = (path: string): string =>
  withoutTsComments(readFileSync(path, 'utf8'));

const VIEWPORT = '.setViewportSize(';

const countOf = (text: string, token: string): number =>
  text.split(token).length - 1;

/**
 * A viewport SET is configuration; a viewport CHANGE is an action.
 *
 * Operator's rule names an "orientation change". Choosing a device before
 * `goto` renders the page once and nothing moves -- measured: `site-meta`,
 * `thai-typography` and `not-found` each call it exactly once, and each is
 * static content. Two calls INSIDE ONE TEST is the page reflowing mid-journey,
 * which is the thing a still cannot show. Counted per test rather than per
 * file because `homepage` calls it twice in two DIFFERENT tests, which is two
 * configurations, not a change.
 */
const viewportChanges = (text: string): boolean =>
  text
    .split(/\b(?:test|it)\s*\(/)
    .some((chunk) => countOf(chunk, VIEWPORT) > 1);

const actionsIn = (text: string): string[] => {
  const found: string[] = ACTIONS.filter(
    (token) => token !== VIEWPORT && text.includes(token),
  );
  if (viewportChanges(text)) found.push(VIEWPORT);
  return found;
};

const declaresRecorded = (text: string): boolean =>
  text.includes('test.use(recorded)');

/**
 * Whether a journey puts ANYTHING on screen -- the question `notRecorded`
 * answers (#292), which is not the question `recorded` answers.
 *
 * A spec EARNS a recording by acting; a journey inside it still renders when
 * it merely navigates, and that recording shows the page. Only a journey that
 * does neither records blank frames, and only that may opt out.
 *
 * The test is its FIXTURES, because they are the whole channel to the
 * browser. A journey that renders nothing touches none of them -- or touches
 * `page.request` alone, which fetches bytes over the page's request context
 * and paints nothing. Anything else (`page.goto`, `page.locator`, a custom
 * fixture, or `page` handed to a helper) is a journey with something on
 * screen, whether or not this file can see what the helper does with it.
 *
 * That last clause is why the rule reads the fixtures rather than following
 * calls: a graph keyed by name cannot see through `tests/e2e/fixtures.ts`,
 * and measured on this corpus it called 18 journeys blank that plainly
 * render. Under-detecting is the UNSAFE direction here -- it would let a
 * journey whose recording a reviewer wants opt out of having one -- so every
 * doubt resolves to "it renders".
 */
const REQUEST = 'request';

/** The names a callback binds from its fixtures object, `{ page, ... }`. */
const fixtureNames = (
  body: ts.ArrowFunction | ts.FunctionExpression,
): Set<string> => {
  const names = new Set<string>();
  const first = body.parameters[0];
  if (first === undefined) return names;
  if (ts.isIdentifier(first.name)) names.add(first.name.text);
  else if (ts.isObjectBindingPattern(first.name))
    for (const element of first.name.elements)
      if (ts.isIdentifier(element.name)) names.add(element.name.text);
  return names;
};

/**
 * Whether `body` reaches the browser through any fixture it binds.
 *
 * `page.request` is the one allowed reach: a fixture used as the object of a
 * `.request` access and nothing else. A bare mention of the name -- handing
 * `page` to a helper -- counts, which is the conservative half.
 */
const reachesTheBrowser = (
  body: ts.ArrowFunction | ts.FunctionExpression,
): boolean => {
  const fixtures = fixtureNames(body);
  if (fixtures.size === 0) return false;
  let reaches = false;
  const visit = (node: ts.Node): void => {
    if (reaches) return;
    if (
      ts.isIdentifier(node) &&
      fixtures.has(node.text) &&
      !(
        ts.isPropertyAccessExpression(node.parent) &&
        node.parent.expression === node &&
        node.parent.name.text === REQUEST
      ) &&
      // The binding in the parameter list is not a use of it.
      !ts.isBindingElement(node.parent) &&
      !ts.isParameter(node.parent)
    )
      reaches = true;
    ts.forEachChild(node, visit);
  };
  // `forEachChild` STOPS at the first child whose callback returns something
  // truthy, so this visitor returns void on purpose (#218's first version
  // visited one child per node).
  ts.forEachChild(body, visit);
  return reaches;
};

/** Each journey a `notRecorded` block holds, and whether it renders. */
interface OptedOut {
  readonly where: string;
  readonly renders: boolean;
}

/**
 * The journeys inside every `test.use(notRecorded)` block in one spec.
 *
 * Parsed from the COMMENT-STRIPPED source, so a spec's own prose can neither
 * satisfy nor defeat this, exactly as the file-level halves above are.
 */
const optedOutIn = (path: string, text: string): OptedOut[] => {
  const sf = parseSource(text, path);
  const declarations = declarationsIn(sf);
  const optedOutBlocks = new Set(
    useCallsIn(sf)
      .filter((use) => use.shared === 'notRecorded')
      .map((use) => enclosingDeclaration(use.call, declarations))
      .filter((owner) => owner !== undefined),
  );
  /**
   * Setup that runs FOR a scope, which is Playwright's HOOKS and nothing
   * else. Reading "the first parameter of any callback" as a fixture is what
   * a first draft did, and a module-level `.map((row) => row.textContent())`
   * then marked the whole file as reaching the browser -- every opted-out
   * journey in it flagged, for a reason none of them had.
   */
  const HOOKS = new Set(['beforeEach', 'beforeAll', 'afterEach', 'afterAll']);
  const scopeReaches = new Set<unknown>();
  for (const call of callsIn(sf)) {
    if (
      !ts.isPropertyAccessExpression(call.expression) ||
      !ts.isIdentifier(call.expression.expression) ||
      call.expression.expression.text !== 'test' ||
      !HOOKS.has(call.expression.name.text)
    )
      continue;
    const callback = call.arguments.find(
      (argument) =>
        ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
    );
    if (
      callback !== undefined &&
      reachesTheBrowser(callback as ts.ArrowFunction | ts.FunctionExpression)
    )
      scopeReaches.add(enclosingDeclaration(call, declarations) ?? 'FILE');
  }
  const out: OptedOut[] = [];
  for (const declaration of declarations.filter((d) => d.kind === 'test')) {
    const ancestors: typeof declarations = [];
    for (
      let owner = enclosingDeclaration(declaration.call, declarations);
      owner !== undefined;
      owner = enclosingDeclaration(owner.call, declarations)
    )
      ancestors.push(owner);
    if (!ancestors.some((owner) => optedOutBlocks.has(owner))) continue;
    out.push({
      where: `${path}:${declaration.line} ${declaration.title}`,
      renders:
        reachesTheBrowser(declaration.body) ||
        scopeReaches.has('FILE') ||
        ancestors.some((owner) => scopeReaches.has(owner)),
    });
  }
  return out;
};

describe('evidence recording is opt-in, and the opt-in is derived', () => {
  it('records nothing by default: the shared config value is the literal off', () => {
    // AC1. The literal is the safety property -- an environment variable here
    // is what made an evidence run record all ~2200 tests. Read from the
    // stripped source, so the comment above it explaining the old value
    // cannot satisfy the guard that replaced it.
    const config = withoutTsComments(readFileSync(CONFIG, 'utf8'));
    // The CONSTRUCT, not the bare string: `process.env.EVIDENCE_DIR` is used
    // legitimately by `outputDir`, so asserting its absence file-wide is red
    // on correct config. What matters is the value bound to `video:`.
    const bound = /video:\s*([^,\n]+)/.exec(config)?.[1]?.trim();
    expect(bound).toBe("'off'");
  });

  it('keeps video in one home: no spec spells it itself', () => {
    // AC5. A spec that writes `video: 'on'` inline opts itself in behind the
    // derivation guard's back, and nothing below would see it.
    const spelled = SPECS.filter((path) => sourceOf(path).includes('video:'));
    expect(
      searched(spelled, { of: SPECS, what: 'specs read for an inline video' }),
    ).toEqual([]);
    // The home really does hold it, so the assertion above is about a rule
    // being kept rather than about the string having vanished from the repo.
    expect(withoutTsComments(readFileSync(HOME, 'utf8'))).toContain('video:');
  });

  it('every spec that acts declares test.use(recorded)', () => {
    // AC4, first direction.
    const missing = SPECS.filter((path) => {
      const text = sourceOf(path);
      return actionsIn(text).length > 0 && !declaresRecorded(text);
    }).map((path) => `${path} acts (${actionsIn(sourceOf(path)).join(' ')})`);
    expect(
      searched(missing, { of: SPECS, what: 'specs checked for a declaration' }),
    ).toEqual([]);
  });

  it('no spec declares test.use(recorded) without acting', () => {
    // AC4, second direction. This is the half that keeps the 255-entry budget:
    // a spec that opts in and never moves spends recordings on stills.
    const idle = SPECS.filter((path) => {
      const text = sourceOf(path);
      return declaresRecorded(text) && actionsIn(text).length === 0;
    });
    expect(
      searched(idle, { of: SPECS, what: 'specs checked for an idle opt-in' }),
    ).toEqual([]);
  });

  it('every construct in the vocabulary is detectable', () => {
    // Anti-vacuity, done with FIXTURES rather than by demanding a real spec
    // use each token. A token no spec uses yet still states the policy for the
    // spec written next week, and deleting it to satisfy a control would
    // narrow the rule to today's code. What must not happen is a branch that
    // cannot match at all, so each is exercised directly.
    const undetected = ACTIONS.filter((token) =>
      token === VIEWPORT
        ? !actionsIn(
            `test('x', async () => { await page${token}a); await page${token}b); })`,
          ).includes(token)
        : !actionsIn(`await page${token}'x');`).includes(token),
    );
    expect(
      searched(undetected, { of: ACTIONS, what: 'action constructs' }),
    ).toEqual([]);
    // The negative control: silence means "no action", not "detector broken".
    expect(
      searched(actionsIn("await expect(page).toHaveTitle('Home');"), {
        of: ACTIONS,
        what: 'action constructs',
      }),
    ).toEqual([]);
    // And a single viewport set is NOT an action, which is the whole rule.
    expect(
      searched(
        actionsIn("test('x', async () => { await page.setViewportSize(a); })"),
        { of: ACTIONS, what: 'action constructs' },
      ),
    ).toEqual([]);
  });

  it('some specs really do act, and some really do not', () => {
    // The population control for the two direction guards above: if every
    // spec landed on one side, both would pass while asserting nothing.
    const acting = SPECS.filter((p) => actionsIn(sourceOf(p)).length > 0);
    const still = SPECS.filter((p) => actionsIn(sourceOf(p)).length === 0);
    expect({ acting: acting.length > 0, still: still.length > 0 }).toEqual({
      acting: true,
      still: true,
    });
  });

  it('a block that opts out of recording really renders nothing (#292)', () => {
    // The opt-out exists so a journey that puts nothing on screen carries no
    // blank video. This is the half that stops it being reached for by a
    // journey whose recording a reviewer would actually watch -- the reverse
    // mistake, and the expensive one, because the evidence is simply gone.
    const optedOut = SPECS.flatMap((path) => optedOutIn(path, sourceOf(path)));
    const rendering = optedOut.filter((j) => j.renders).map((j) => j.where);
    expect(
      searched(rendering, {
        of: optedOut.map((j) => j.where),
        what: 'journeys inside a notRecorded block',
      }),
      rendering.join('\n'),
    ).toEqual([]);
  });

  it('the detector tells a journey that renders from one that does not', () => {
    // The control, on input written HERE. A proof taken from the corpus alone
    // cannot tell a detector that stopped detecting from a corpus that
    // stopped offending -- #112's guard counted six entries and six blanks
    // the same way. Each case below is one this repo really contains.
    const spec = [
      'test.use(recorded);',
      "test.describe('opted out', () => {",
      '  test.use(notRecorded);',
      "  test('reads bytes off disk', async ({ page }) => {",
      "    await page.request.get('/x.m4a');",
      '  });',
      "  test('navigates', async ({ page }) => {",
      "    await page.goto('/');",
      '  });',
      "  test('hands the page to a helper', async ({ page }) => {",
      '    await openTool(page);',
      '  });',
      "  test('reaches through another fixture', async ({ groups }) => {",
      "    await groups.add('Ada');",
      '  });',
      "  test('binds no fixture at all', async () => {",
      '    expect(1).toBe(1);',
      '  });',
      '});',
    ].join('\n');
    const found = optedOutIn('tests/e2e/synthetic.spec.ts', spec);
    expect(found.map((j) => j.where.replace(/^.*? /, ''))).toEqual([
      'reads bytes off disk',
      'navigates',
      'hands the page to a helper',
      'reaches through another fixture',
      'binds no fixture at all',
    ]);
    // `page.request` and no fixture at all are the two that render nothing;
    // handing `page` to a helper counts even though nothing here can see what
    // the helper does with it.
    expect(found.map((j) => j.renders)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });
});
