import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A real device has exactly ONE adopted browser context for the whole run
 * (`browser.newContext()` measured to fail against it -- "Protocol error
 * (Target.createBrowserContext): Failed to create browser context.", see
 * tests/e2e/fixtures.ts's own `context` fixture comment). `test.use({
 * javaScriptEnabled: false })` -- and any future per-test context option
 * like it -- only takes effect on a context Playwright creates fresh, so
 * on the real device it is silently inert: JavaScript keeps running. Every
 * test inside a `test.describe(...)` block that calls
 * `test.use({ javaScriptEnabled: false })` must carry the
 * `@requires-isolated-context` tag so `android-chrome`'s own `grepInvert`
 * (playwright.device.config.ts) excludes it, the same "physically
 * impossible on one real device" treatment `@emulated-viewport` already
 * gets for the screen (tests/unit/viewport-tagging.test.ts). This file is
 * what keeps that true: an exclusion list nobody checks rots the moment
 * someone adds a test.
 *
 * THE APPROXIMATION, STATED PLAINLY (same house standard as
 * viewport-tagging.test.ts): this scans SOURCE TEXT, not a real parse (no
 * new npm dependency is available to add one), on rules chosen to match
 * what this repo's Prettier config actually produces, verified against
 * every real call site this guard scans, not assumed:
 *
 * 1. A `test.use(...)` call's own options are read as the raw text between
 *    its opening paren and the next literal `);` -- not a parsed object --
 *    exactly the technique tests/unit/viewport-tagging.test.ts's own
 *    `extractViewportUseHits` already uses and documents, for the identical
 *    reason: an options value can itself contain braces (a nested object),
 *    so brace-matching is the wrong tool and a `);` terminator is safe for
 *    every option shape either file's corpus actually writes.
 *
 * 2. A `test.describe(...)` block's own BODY SPAN (the lines that belong to
 *    it, not a nested block or a later sibling) is found by indentation,
 *    not brace-counting: Prettier always places a block's closing `});` at
 *    the SAME indentation as the line that opened the block -- verified by
 *    reading every `test.describe(` in tests/e2e and tests/device, not
 *    assumed. Brace-counting was considered and rejected: this exact corpus
 *    writes `` `${path}: says so, in its own language` `` -- a template
 *    literal whose `${` / `}` are not code-structural braces at all, which
 *    would misdirect a naive counter. Indentation never has this problem,
 *    because it never looks inside a literal's own contents.
 *
 * Full-line `//` comments are blanked before either rule runs, same
 * near-misses and same technique as viewport-tagging.test.ts (a literal
 * `test.describe(` or `test.use(`-shaped substring inside a prose comment
 * must not be read as real code).
 */

const REQUIRES_ISOLATED_CONTEXT_TAG = '@requires-isolated-context';
const SCAN_DIRS = [join('tests', 'e2e'), join('tests', 'device')];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** Blanks every line whose trimmed content starts with `//`, keeping line count (and every
 * other line's number) identical -- identical technique to viewport-tagging.test.ts. */
function blankComments(text: string): string {
  return text
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

/** Indentation (count of leading spaces) of the line containing character `index`. */
function indentOfLineAt(text: string, index: number): number {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const line = text.slice(lineStart, index);
  return line.length - line.trimStart().length;
}

const JS_DISABLED_RE = /\btest\.use\(/g;

interface JsDisabledHit {
  line: number;
  index: number;
}

/** Every `test.use(...)` call in `text` whose own options mention `javaScriptEnabled: false`
 * -- see the file header's rule 1 for why `);` (not brace-matching) is the call's terminator. */
function findJsDisabledHits(text: string): JsDisabledHit[] {
  const hits: JsDisabledHit[] = [];
  JS_DISABLED_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = JS_DISABLED_RE.exec(text))) {
    const closeIndex = text.indexOf(');', match.index);
    const span =
      closeIndex === -1
        ? text.slice(match.index)
        : text.slice(match.index, closeIndex);
    if (/\bjavaScriptEnabled\s*:\s*false\b/.test(span)) {
      hits.push({ line: lineNumberAt(text, match.index), index: match.index });
    }
  }
  return hits;
}

/** A line whose trimmed content is exactly `test.describe(` followed eventually by a `{` that
 * opens the callback -- deliberately broad (no title/args validation): this only needs to find
 * WHERE a describe opens and at what indentation, not validate its shape. A `test.describe.`-
 * suffixed variant (`.serial`, `.only`, ...) counts too; `test.describe.configure(...)` (no
 * callback, a plain function call ending `);`) does not, because it never opens with `=> {`. */
const DESCRIBE_OPEN_RE = /\btest\.describe(?:\.\w+)*\([^\n]*=>\s*\{\s*$/gm;

interface DescribeBody {
  openLine: number;
  indent: number;
  bodyStart: number;
  bodyEnd: number;
  closeFound: boolean;
}

/** The nearest `test.describe(...) => {` opening AT OR BEFORE `beforeIndex`, and its own body
 * span (see the file header's rule 2). Returns `undefined` if no describe opens before
 * `beforeIndex` at all -- the caller turns that into an actionable "orphan" finding, not
 * silence, matching viewport-tagging.test.ts's own `orphanMessage` precedent. */
function findEnclosingDescribeBody(
  text: string,
  beforeIndex: number,
): DescribeBody | undefined {
  DESCRIBE_OPEN_RE.lastIndex = 0;
  let best: { index: number; end: number } | undefined;
  let match: RegExpExecArray | null;
  while ((match = DESCRIBE_OPEN_RE.exec(text))) {
    if (match.index > beforeIndex) break; // matches are in file order
    best = { index: match.index, end: match.index + match[0].length };
  }
  if (!best) return undefined;

  const indent = indentOfLineAt(text, best.index);
  const bodyStart = best.end;
  const closeRe = /^( *)\}\);[ \t]*$/gm;
  closeRe.lastIndex = bodyStart;
  let close: RegExpExecArray | null;
  let bodyEnd = text.length;
  let closeFound = false;
  while ((close = closeRe.exec(text))) {
    if (close[1].length === indent) {
      bodyEnd = close.index;
      closeFound = true;
      break;
    }
  }
  return {
    openLine: lineNumberAt(text, best.index),
    indent,
    bodyStart,
    bodyEnd,
    closeFound,
  };
}

// Group 1: the `.word` suffix chain (`.only`/`.skip`/`.fixme`, or none). Group 2: which quote
// opened the title. Group 3: the title text. Group 4: a flat `{ ... }` options object
// immediately following, if present -- same shape as viewport-tagging.test.ts's own
// DECLARATION_RE, reused here rather than imported (see this repo's own established trade-off:
// small, clearly-commented duplication over coupling two independent Vitest files together).
const TEST_DECLARATION_RE =
  /\btest((?:\.\w+)*)\(\s*(['"`])((?:(?!\2)[^\r\n])*)\2(?:\s*,\s*\{([^{}]*)\})?/g;
const TEST_KIND_SUFFIXES = new Set(['', '.only', '.skip', '.fixme']);

interface TestDeclaration {
  line: number;
  title: string;
  tagged: boolean;
}

function findTestDeclarations(text: string): TestDeclaration[] {
  const out: TestDeclaration[] = [];
  TEST_DECLARATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TEST_DECLARATION_RE.exec(text))) {
    if (!TEST_KIND_SUFFIXES.has(match[1])) continue; // test.describe(/test.step(/... -- not a test()
    const optionsObject = match[4];
    out.push({
      line: lineNumberAt(text, match.index),
      title: match[3],
      tagged:
        optionsObject !== undefined &&
        optionsObject.includes(REQUIRES_ISOLATED_CONTEXT_TAG),
    });
  }
  return out;
}

function orphanMessage(file: string, hit: JsDisabledHit): string {
  return (
    `${file}:${hit.line} calls test.use({ javaScriptEnabled: false }), but no enclosing ` +
    'test.describe(...) => { ... } opening was found above it in this file -- nothing to ' +
    'attribute this call to (Playwright does not support calling test.use() outside a describe ' +
    'or at the top of a test body).'
  );
}

function unclosedMessage(file: string, body: DescribeBody): string {
  return (
    `${file}:${body.openLine} -- the enclosing test.describe(...) block never reached a \`});\` ` +
    `at its own indentation (${body.indent} spaces) before end of file -- cannot determine which ` +
    'tests are inside it, so cannot check they are tagged. This scanner expects Prettier-' +
    'formatted output; run `npm run format` and re-check.'
  );
}

function untaggedMessage(file: string, decl: TestDeclaration): string {
  return (
    `${file}:${decl.line} -- test('${decl.title}') is inside a describe block whose ` +
    'test.use({ javaScriptEnabled: false }) is inert on the real-device harness (JavaScript ' +
    `keeps running -- see tests/e2e/fixtures.ts) but is not tagged \`${REQUIRES_ISOLATED_CONTEXT_TAG}\` ` +
    `-- tag it \`${REQUIRES_ISOLATED_CONTEXT_TAG}\` so android-chrome excludes it by design ` +
    'instead of failing (or passing for the wrong reason).'
  );
}

function staleTagMessage(file: string, decl: TestDeclaration): string {
  return (
    `${file}:${decl.line} -- test('${decl.title}') is tagged \`${REQUIRES_ISOLATED_CONTEXT_TAG}\` ` +
    'but is not inside any describe block whose test.use({ javaScriptEnabled: false }) this ' +
    'scanner could find -- stale tag, silently costing real-device coverage for a test that no ' +
    'longer needs excluding. Remove the tag, or restore the javaScriptEnabled: false use it is ' +
    'supposed to describe.'
  );
}

/** The whole guard, as one pure function of (path, source text) -> finding messages -- kept
 * separate from the filesystem walk so the self-test block below can prove every branch red
 * and green on tiny synthetic input, not just trust the real corpus to exercise all of them. */
function analyze(file: string, rawText: string): string[] {
  const text = blankComments(rawText);
  const hits = findJsDisabledHits(text);
  const findings: string[] = [];

  // One affected span per hit (usually exactly one hit in the whole corpus today, but a
  // describe could in principle gain a second, redundant test.use({ javaScriptEnabled: false })
  // -- harmless to process twice, never under-covers).
  const affectedSpans: Array<{ start: number; end: number }> = [];
  for (const hit of hits) {
    const body = findEnclosingDescribeBody(text, hit.index);
    if (!body) {
      findings.push(orphanMessage(file, hit));
      continue;
    }
    if (!body.closeFound) {
      findings.push(unclosedMessage(file, body));
      continue;
    }
    affectedSpans.push({ start: body.bodyStart, end: body.bodyEnd });
  }

  const declarations = findTestDeclarations(text);
  for (const decl of declarations) {
    // Re-locate this declaration's own char index precisely enough to test span membership --
    // line number is unambiguous here since every span boundary is also a line boundary.
    const declIndex = text
      .split('\n')
      .slice(0, decl.line - 1)
      .join('\n').length;
    const inAffectedSpan = affectedSpans.some(
      (span) => declIndex >= span.start && declIndex < span.end,
    );
    if (inAffectedSpan && !decl.tagged) {
      findings.push(untaggedMessage(file, decl));
    } else if (!inAffectedSpan && decl.tagged) {
      findings.push(staleTagMessage(file, decl));
    }
  }

  return findings;
}

describe('a real device cannot isolate a JavaScript-disabled context', () => {
  it('every test inside a javaScriptEnabled:false describe is tagged @requires-isolated-context, and no tag is stale', () => {
    const files = SCAN_DIRS.flatMap(listSourceFiles);

    // Same self-check viewport-tagging.test.ts/baseurl-guard.spec.ts use on themselves: a walk
    // that silently found zero files would pass for the wrong reason.
    expect(
      files.length,
      `expected to find .ts files under ${SCAN_DIRS.join(', ')}; found none, which means this ` +
        "guard's own file-walk is broken, not that the suite has nothing to check",
    ).toBeGreaterThan(0);

    const findings = files.flatMap((file) =>
      analyze(file, readFileSync(file, 'utf8')),
    );
    expect(findings, findings.join('\n')).toEqual([]);
  });
});

// Proof the mechanism itself works, red and green, independent of whatever the real corpus
// happens to contain today -- "a guard nobody has watched fail is decoration" applies to the
// guard's own building blocks too, not only to the tags it is checking for.
describe('analyze() -- the scanner proven on synthetic input, not just trusted', () => {
  it('flags an untagged test inside a javaScriptEnabled:false describe, naming file, line and title', () => {
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test.describe('no script', () => {",
      '  test.use({ javaScriptEnabled: false });',
      '',
      "  test('shows the fallback notice', async ({ page }) => {",
      "    await page.goto('/');",
      '  });',
      '});',
      '',
    ].join('\n');

    const findings = analyze('synthetic.spec.ts', src);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('synthetic.spec.ts:6');
    expect(findings[0]).toContain('shows the fallback notice');
    expect(findings[0]).toContain(REQUIRES_ISOLATED_CONTEXT_TAG);
  });

  it('accepts the identical test once tagged', () => {
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test.describe('no script', () => {",
      '  test.use({ javaScriptEnabled: false });',
      '',
      "  test('shows the fallback notice', { tag: '@requires-isolated-context' }, async ({ page }) => {",
      "    await page.goto('/');",
      '  });',
      '});',
      '',
    ].join('\n');

    expect(analyze('synthetic.spec.ts', src)).toEqual([]);
  });

  it('flags a tag on a test with no enclosing javaScriptEnabled:false describe as stale', () => {
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test.describe('normal', () => {",
      "  test('does nothing special', { tag: '@requires-isolated-context' }, async ({ page }) => {",
      "    await page.goto('/');",
      '  });',
      '});',
      '',
    ].join('\n');

    const findings = analyze('synthetic.spec.ts', src);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('stale');
    expect(findings[0]).toContain('does nothing special');
  });

  it('does not reach into an unrelated sibling describe that happens to share a file', () => {
    // The real shape this corpus has today: "with JavaScript blocked" and "when storage is
    // unavailable" are SIBLING describes in the same file -- a test in the second must never be
    // flagged just because the first, earlier one, disables JavaScript.
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test.describe('with JavaScript blocked', () => {",
      '  test.use({ javaScriptEnabled: false });',
      '',
      "  test('shows the notice', { tag: '@requires-isolated-context' }, async ({ page }) => {",
      "    await page.goto('/');",
      '  });',
      '});',
      '',
      "test.describe('when storage is unavailable', () => {",
      "  test('still works', async ({ page }) => {",
      "    await page.goto('/');",
      '  });',
      '});',
      '',
    ].join('\n');

    expect(analyze('synthetic.spec.ts', src)).toEqual([]);
  });

  it('does not mistake a runtime test.use(...) call for one disabling JavaScript', () => {
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test.describe('viewport only', () => {",
      '  test.use({ viewport: { width: 320, height: 800 } });',
      '',
      "  test('fits', { tag: '@emulated-viewport' }, async ({ page }) => {",
      "    await page.goto('/');",
      '  });',
      '});',
      '',
    ].join('\n');

    expect(analyze('synthetic.spec.ts', src)).toEqual([]);
  });

  it('reports an orphan test.use({ javaScriptEnabled: false }) with no enclosing describe', () => {
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      '// Malformed on purpose: no test.describe(...) => { above this line.',
      'test.use({ javaScriptEnabled: false });',
      '',
    ].join('\n');

    const findings = analyze('synthetic.spec.ts', src);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('no enclosing');
  });

  it('is not confused by a template-literal title containing brace-like interpolation', () => {
    // The exact shape classroom-groups-privacy.spec.ts's own corpus uses --
    // `${path}` inside a title is not a code-structural brace, and a
    // brace-counting boundary detector would misread it. This file uses
    // indentation instead specifically to survive this.
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test.describe('no script', () => {",
      '  test.use({ javaScriptEnabled: false });',
      '',
      "  for (const path of ['/a', '/b']) {",
      '    test(',
      '      `${path}: says so`,',
      "      { tag: '@requires-isolated-context' },",
      '      async ({ page }) => {',
      '        await page.goto(path);',
      '      },',
      '    );',
      '  }',
      '});',
      '',
    ].join('\n');

    expect(analyze('synthetic.spec.ts', src)).toEqual([]);
  });

  it('ignores a javaScriptEnabled:false-shaped call when it appears only in a comment', () => {
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      '// Example: test.use({ javaScriptEnabled: false }); -- do not do this here.',
      "test.describe('normal', () => {",
      "  test('does nothing special', async ({ page }) => {",
      "    await page.goto('/');",
      '  });',
      '});',
      '',
    ].join('\n');

    expect(analyze('synthetic.spec.ts', src)).toEqual([]);
  });
});
