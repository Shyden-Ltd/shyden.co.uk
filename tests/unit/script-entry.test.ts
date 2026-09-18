import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { filesUnder, searched } from '../source-files';
import { parseFile, parseSource, where } from './ast';
import { scriptCheckout, type ScriptCheckout } from './script-checkout';

/**
 * A script asks "was I run directly?" with `import.meta.main`, and with
 * nothing else (#221).
 *
 * `scripts/` spelled that question three ways, every one a comparison against
 * `process.argv[1]`, and every one wrong for some checkout:
 *
 * - against a `file://` template around the raw path, which fails on any
 *   character a URL encodes, a space included, because `import.meta.url` is
 *   encoded and `argv[1]` is not;
 * - against `fileURLToPath(import.meta.url)`, which fails through a symlink,
 *   because Node resolves the link in the URL and not in `argv[1]`;
 * - with `endsWith` on the script's own name, which is true for ANY entry file
 *   whose name ends that way.
 *
 * Every failure is silent: `main()` never runs, the process exits 0, and
 * whatever runs next reads a stale result or none. Node has answered the
 * question itself since v24.2.0, so no path is compared at all; the floor that
 * guarantees it is pinned in `node-contract.test.ts`.
 *
 * Judged on the parse tree, so a comment can neither trip a rule nor satisfy
 * one.
 */

/** `process.argv[1]`, with or without `?.`. */
const isArgvEntry = (node: ts.Node): boolean =>
  ts.isElementAccessExpression(node) &&
  ts.isNumericLiteral(node.argumentExpression) &&
  node.argumentExpression.text === '1' &&
  ts.isPropertyAccessExpression(node.expression) &&
  node.expression.name.text === 'argv' &&
  ts.isIdentifier(node.expression.expression) &&
  node.expression.expression.text === 'process';

/** Where a file reads `process.argv[1]`. */
const argvEntryReads = (sf: ts.SourceFile): string[] => {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (isArgvEntry(node)) found.push(where(sf, node));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
};

/** `import.meta.main`, spelled exactly. */
const isImportMetaMain = (node: ts.Node): boolean =>
  ts.isPropertyAccessExpression(node) &&
  node.name.text === 'main' &&
  ts.isMetaProperty(node.expression) &&
  node.expression.keywordToken === ts.SyntaxKind.ImportKeyword;

/** Every `main()` call made while the file loads, outside any function body. */
const loadTimeMainCalls = (sf: ts.SourceFile): ts.CallExpression[] => {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'main'
    )
      calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return calls;
};

/** A condition a call sits under, and whether the call runs when it holds. */
interface Gate {
  readonly condition: ts.Expression;
  readonly holds: boolean;
}

const SHORT_CIRCUIT = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/**
 * Every condition between a call and the top of its file, innermost first.
 * The call runs when an `if`, a `?:` or an `&&` holds, and when an `else`,
 * the other arm of a `?:`, an `||` or a `??` fails.
 */
const gatesOf = (call: ts.Node): Gate[] => {
  const gates: Gate[] = [];
  let child: ts.Node = call;
  for (let node = call.parent; node; child = node, node = node.parent) {
    if (ts.isIfStatement(node) && child !== node.expression)
      gates.push({
        condition: node.expression,
        holds: child === node.thenStatement,
      });
    else if (ts.isConditionalExpression(node) && child !== node.condition)
      gates.push({ condition: node.condition, holds: child === node.whenTrue });
    else if (
      ts.isBinaryExpression(node) &&
      child === node.right &&
      SHORT_CIRCUIT.has(node.operatorToken.kind)
    )
      gates.push({
        condition: node.left,
        holds:
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken,
      });
  }
  return gates;
};

/** A load-time `main()` call some condition decides. */
interface Decision {
  readonly at: string;
  /** Each condition as written, `not (...)` where the call needs it to fail. */
  readonly under: readonly string[];
  readonly byImportMetaMain: boolean;
}

/**
 * Every place a file decides whether to run `main()` as it loads. A call no
 * condition governs is not a decision: it runs every time, so it can never
 * be skipped in silence.
 */
const entryDecisions = (sf: ts.SourceFile): Decision[] =>
  loadTimeMainCalls(sf)
    .map((call) => ({ call, gates: gatesOf(call) }))
    .filter(({ gates }) => gates.length > 0)
    .map(({ call, gates }) => ({
      at: where(sf, call),
      under: gates.map(({ condition, holds }) =>
        holds ? condition.getText(sf) : `not (${condition.getText(sf)})`,
      ),
      byImportMetaMain:
        gates.length === 1 &&
        gates[0].holds &&
        isImportMetaMain(gates[0].condition),
    }));

/** A fixture parsed as a module, as every script is. */
const fixture = (body: string) =>
  parseSource(`import 'node:process';\n${body}\n`, 'fixture.mjs');

/** What the rules make of a fixture: how many decisions, and the wrong ones. */
const judge = (body: string) => {
  const decisions = entryDecisions(fixture(body));
  return {
    decided: decisions.length,
    wrong: decisions.filter((d) => !d.byImportMetaMain).map((d) => d.under),
  };
};

describe('the entry-check rules read the parse tree (#221)', () => {
  it.each([
    ['if (import.meta.main) main();'],
    ['if (import.meta.main) await main();'],
    ['import.meta.main && main();'],
    ['import.meta.main ? main() : null;'],
    ['// if (process.argv[1] === x) main();\nif (import.meta.main) main();'],
  ])('accepts a decision made by import.meta.main alone: %s', (body) => {
    expect(judge(body)).toEqual({ decided: 1, wrong: [] });
  });

  it.each([
    ['await main();'],
    ['main().catch(() => process.exit(1));'],
    ["process.on('SIGINT', () => {\n  if (x) main();\n});"],
  ])('sees no decision where nothing is decided at load: %s', (body) => {
    expect(judge(body)).toEqual({ decided: 0, wrong: [] });
  });

  it.each([
    [
      'if (import.meta.url === `file://${process.argv[1]}`) main();',
      [['import.meta.url === `file://${process.argv[1]}`']],
    ],
    [
      'if (process.argv[1] === fileURLToPath(import.meta.url)) main();',
      [['process.argv[1] === fileURLToPath(import.meta.url)']],
    ],
    [
      "if (process.argv[1]?.endsWith('x.mjs')) await main();",
      [["process.argv[1]?.endsWith('x.mjs')"]],
    ],
    ['// import.meta.main\nif (x) main();', [['x']]],
    ['if (import.meta.main && x) main();', [['import.meta.main && x']]],
    [
      'if (import.meta.main) {\n  if (x) main();\n}',
      [['x', 'import.meta.main']],
    ],
    ['if (import.meta.main) {\n} else main();', [['not (import.meta.main)']]],
    ['import.meta.main || main();', [['not (import.meta.main)']]],
    ['x ? null : main();', [['not (x)']]],
  ])('reports any other decision: %s', (body, wrong) => {
    expect(judge(body)).toEqual({ decided: 1, wrong });
  });

  it.each([
    ['console.log(process.argv[1]);', 1],
    ["process.argv[1]?.endsWith('x');", 1],
    ['const a = process.argv?.[1];', 1],
    ['process.argv.slice(2);', 0],
    ['process.argv[2];', 0],
    ['other.argv[1];', 0],
    ['process.env[1];', 0],
    ['// process.argv[1]', 0],
  ])('counts the reads of process.argv[1] in: %s', (body, reads) => {
    expect(argvEntryReads(fixture(body))).toHaveLength(reads);
  });
});

/** Every file the rules can read: modules in JavaScript or TypeScript. */
const MODULE = /\.[cm]?[jt]s$/;

const files = filesUnder('scripts', () => true);
const modules = files.filter((file) => MODULE.test(file));
const decisionsIn = (file: string) => entryDecisions(parseFile(file));

/**
 * Each script that decides whether it was run directly, run as a script with
 * an input it refuses. A refusal is the cheapest proof that `main()` ran: a
 * non-zero exit carrying the script's own words, where a skipped `main()` is
 * a silent 0.
 */
interface Probe {
  readonly args: readonly string[];
  /** Variables to set; `undefined` removes one the parent had. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly status: number;
  /** Words only the script's own refusal prints. */
  readonly says: string;
}

const PROBES: Readonly<Record<string, Probe>> = {
  // Without its three paths it prints its usage and refuses.
  'build-evidence-page.mjs': {
    args: [],
    status: 2,
    says: 'usage: build-evidence-page.mjs',
  },
  // Without the API it can prove nothing, so it refuses to proceed.
  'deploy-gate.mjs': {
    args: [],
    env: { GITHUB_REPOSITORY: undefined, GITHUB_TOKEN: undefined },
    status: 1,
    says: 'GITHUB_REPOSITORY and GITHUB_TOKEN are required',
  },
  // Playwright rejects the option, so the run writes no report, and the
  // reconciliation refuses rather than call that a pass.
  'test-e2e.mjs': {
    args: ['--no-such-flag'],
    env: { EVIDENCE_DIR: undefined },
    status: 1,
    says: 'E2E RECONCILIATION FAILED',
  },
  // With no `docker` on PATH it refuses rather than compare nothing (#202).
  'visual.mjs': {
    args: [],
    env: { PATH: '/nonexistent' },
    status: 1,
    says: 'docker is not available',
  },
};

const runAsScript = (script: string, probe: Probe) => {
  const env = { ...process.env };
  for (const [name, value] of Object.entries(probe.env ?? {}))
    if (value === undefined) delete env[name];
    else env[name] = value;
  return spawnSync(process.execPath, [script, ...probe.args], {
    encoding: 'utf8',
    env,
  });
};

describe('a script asks whether it was run directly with import.meta.main alone (#221)', () => {
  it('reads every file under scripts/', () => {
    const unread = files.filter((file) => !MODULE.test(file));
    expect(
      searched(unread, { of: files, what: 'files under scripts/' }),
      'a file these rules cannot parse is a file they do not guard',
    ).toEqual([]);
  });

  it('never reads process.argv[1]', () => {
    const reads = modules.flatMap((file) => argvEntryReads(parseFile(file)));
    expect(searched(reads, { of: modules, what: 'scripts' })).toEqual([]);
  });

  it('decides on import.meta.main alone', () => {
    const decisions = modules.flatMap(decisionsIn);
    const wrong = decisions.filter((d) => !d.byImportMetaMain);
    expect(
      searched(wrong, { of: decisions, what: 'load-time main() decisions' }),
    ).toEqual([]);
  });

  it('probes exactly the scripts that decide', () => {
    const deciding = modules
      .filter((file) => decisionsIn(file).length > 0)
      .map((file) => relative('scripts', file))
      .sort();
    expect(deciding).toEqual(Object.keys(PROBES).sort());
  });
});

describe('every script that decides still acts when run as one (#221)', () => {
  let checkout: ScriptCheckout;
  beforeAll(() => {
    checkout = scriptCheckout();
  });
  afterAll(() => checkout.remove());

  const places: Readonly<Record<string, () => string>> = {
    'this checkout': () => 'scripts',
    'a checkout whose path holds a space': () => checkout.spaced,
    'a checkout reached through a symlink': () => checkout.linked,
  };

  for (const [script, probe] of Object.entries(PROBES))
    for (const [place, dir] of Object.entries(places))
      it(`${script} refuses from ${place}`, () => {
        const run = runAsScript(join(dir(), script), probe);
        expect(`${run.stdout}${run.stderr}`).toContain(probe.says);
        expect(run.status).toBe(probe.status);
      });
});
