import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A real phone has one screen. `page.setViewportSize(...)` and
 * `test.use({ viewport })` both measure an emulator -- on a real device CDP will
 * happily "resize" a 411px phone to 1280x800 and report numbers describing nothing
 * physical (see playwright.device.config.ts). Every test that manipulates the
 * viewport must carry the `@emulated-viewport` tag so `android-chrome`'s
 * `grepInvert` can exclude it, and this file is what keeps that true: an exclusion
 * list nobody checks rots the moment someone adds a test.
 *
 * This scans SOURCE TEXT rather than importing and introspecting the specs (the
 * house pattern -- see tests/e2e/baseurl-guard.spec.ts): Playwright specs can only
 * run under the Playwright test runner, so a Vitest file that wants to check them
 * has no way to load them as modules and ask "what tag does this test carry" --
 * text is the only surface available.
 *
 * THE APPROXIMATION, STATED PLAINLY (the brief's own demand): a full JS parse
 * would need a real parser dependency (none is available -- "no new npm
 * dependencies"), so this walks the text with regexes instead, on two rules that
 * were chosen to match what this repo's Prettier config (.prettierrc.json) and
 * house style actually produce, verified by reading every real call site this
 * guard scans, not assumed:
 *
 * 1. A DECLARATION is `test(`, `test.only(`, `test.skip(`, `test.fixme(`,
 *    `test.describe(`, or `test.describe.` + one of those, followed (after only
 *    whitespace -- a wrapped title still counts) by a quote character. Requiring a
 *    quote immediately after the parenthesis is what tells a declaration apart
 *    from the *runtime* conditional overloads that share the same spelling:
 *    `test.skip(browserName === 'webkit', 'reason')` and (introduced by this very
 *    task) `test.fixme(!fits, 'reason')` both open with an expression, never a
 *    quote, so this rule is blind to them by construction. What would defeat it: a
 *    declaration whose title is passed by variable reference (`test(title, ...)`)
 *    rather than written as a literal at the call site. Every declaration in this
 *    repo writes its title inline, verified by inspection -- the one place that
 *    would otherwise have needed a computed title (the four `${width}x${height}`
 *    tests classroom-groups.spec.ts generates in a loop) writes the template
 *    literal out twice, once per branch, rather than hoisting it to a variable,
 *    specifically so this rule can see it. A declaration reached only through an
 *    aliased callee (`const run = test; run('title', ...)`) is equally invisible --
 *    proven below as its own, actionable finding rather than silence, because
 *    that shape existed in this file's own first draft (see the file's own
 *    "structural mismatch" test below and classroom-groups.spec.ts's git history).
 *
 * 2. The declaration's own OPTIONS OBJECT, if present, is read from
 *    `, { ...flat content... }` immediately after the title -- no nested braces.
 *    Every `TestDetails` this suite writes is `{ tag: '@emulated-viewport' }`; a
 *    details object using `annotation` (which nests an object of its own) would
 *    defeat this, but nothing here writes one.
 *
 * A test/describe boundary is attributed to a viewport call by nearest-preceding
 * line, exactly as the brief itself suggests ("line ranges between successive
 * test(/test.describe( declarations... prefer over trying to parse JS properly"):
 * declarations are collected in file order, and a viewport call belongs to the
 * last declaration whose own line is at or before the call's line. This is exact
 * for every real shape in this codebase (verified: a test body cannot contain
 * another test()/describe() declaration, so "nearest preceding declaration, of
 * either kind" always finds the right one -- nesting depth is never needed to
 * decide it), and it needs no brace-matching at all.
 *
 * Full-line `//` comments are blanked before either rule runs (`blankComments`),
 * because prose in this very repo says things a naive scanner would misread as
 * code: classroom-groups.spec.ts:1068 reads "...so `/id/*`, so an Indonesian
 * visitor..." (a literal `/*` substring with no comment ever closing it) and
 * classroom-groups-controls.spec.ts:1069 reads "...`test.fixme(title, body)`
 * does..." (a declaration-shaped substring with no quoted title after it -- rule 1
 * already survives this one unaided, since `title` is a bare word, not a quote,
 * but it is exactly the kind of near-miss this file blanks comments to stop
 * trusting to luck). Block comments (`/** ... *`+`/`) are NOT stripped: the
 * scanned corpus carries a handful, verified by inspection to contain neither a
 * viewport call nor a quoted example declaration, so nothing here currently
 * depends on stripping them -- a doc comment that started quoting a fake
 * `test('...', ...)` call verbatim would be misread as real.
 */

const EMULATED_VIEWPORT_TAG = '@emulated-viewport';
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

/** Blanks every line whose trimmed content starts with `//`, keeping line count
 * (and therefore every other line's number) identical -- see the file-level
 * comment above for the two real near-misses this exists to stop. */
function blankComments(text: string): string {
  return text
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

type Kind = 'test' | 'describe';

interface Declaration {
  kind: Kind;
  title: string;
  line: number;
  tagged: boolean;
}

interface ViewportHit {
  line: number;
  api: 'page.setViewportSize(...)' | 'test.use({ viewport })';
}

// Suffix (the chain of `.word`s after the bare `test`) -> what kind of
// declaration it is. Deliberately narrow: `.step`, `.use`, `.beforeEach`,
// `.slow`, `.fail`, `.describe.configure`, etc. are real Playwright API but none
// of them registers a new test or describe, so a match against one of those
// must never reset "which declaration is this line inside".
const DECLARATION_KIND_BY_SUFFIX: Partial<Record<string, Kind>> = {
  '': 'test',
  '.only': 'test',
  '.skip': 'test',
  '.fixme': 'test',
  '.describe': 'describe',
  '.describe.only': 'describe',
  '.describe.skip': 'describe',
  '.describe.fixme': 'describe',
};

// See the file-level comment's rule 1/2. Group 1: the `.word` suffix chain.
// Group 2: which quote character opened the title (reused to find its own
// close, so a double-quoted title may contain an apostrophe and vice versa --
// both delimiters are real in this corpus). Group 3: the title text. Group 4:
// the *content* of a flat `{ ... }` options object immediately following, if
// one is there.
const DECLARATION_RE =
  /\btest((?:\.\w+)*)\(\s*(['"`])((?:(?!\2)[^\r\n])*)\2(?:\s*,\s*\{([^{}]*)\})?/g;

function extractDeclarations(text: string): Declaration[] {
  const declarations: Declaration[] = [];
  DECLARATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DECLARATION_RE.exec(text))) {
    const kind = DECLARATION_KIND_BY_SUFFIX[match[1]];
    if (!kind) continue; // test.step(/test.use(/test.beforeEach(/... -- not a declaration
    const optionsObject = match[4];
    declarations.push({
      kind,
      title: match[3],
      line: lineNumberAt(text, match.index),
      tagged:
        optionsObject !== undefined &&
        optionsObject.includes(EMULATED_VIEWPORT_TAG),
    });
  }
  return declarations;
}

const SET_VIEWPORT_SIZE_RE = /\.setViewportSize\s*\(/g;

function extractSetViewportSizeHits(text: string): ViewportHit[] {
  const hits: ViewportHit[] = [];
  SET_VIEWPORT_SIZE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SET_VIEWPORT_SIZE_RE.exec(text))) {
    hits.push({
      line: lineNumberAt(text, match.index),
      api: 'page.setViewportSize(...)',
    });
  }
  return hits;
}

const TEST_USE_RE = /\btest\.use\(/g;

function extractViewportUseHits(text: string): ViewportHit[] {
  const hits: ViewportHit[] = [];
  TEST_USE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TEST_USE_RE.exec(text))) {
    // `test.use({...})` takes one flat, literal options object in every call this
    // suite writes (`{ javaScriptEnabled: false }` is the one existing site) --
    // Playwright's `use()` fixture overrides are primitive/simple values, never a
    // function, so the next literal `);` is a safe stand-in for "where this call
    // ends". A value containing its own `);` substring (a function-valued option)
    // would defeat it; nothing here writes one.
    const closeIndex = text.indexOf(');', match.index);
    const span =
      closeIndex === -1
        ? text.slice(match.index)
        : text.slice(match.index, closeIndex);
    if (/\bviewport\s*:/.test(span)) {
      hits.push({
        line: lineNumberAt(text, match.index),
        api: 'test.use({ viewport })',
      });
    }
  }
  return hits;
}

/** The last declaration at or before `line` -- see the file-level comment on why
 * nesting depth is never needed to make this exact for this codebase. */
function findEnclosing(
  declarations: Declaration[],
  line: number,
): Declaration | undefined {
  let candidate: Declaration | undefined;
  for (const decl of declarations) {
    if (decl.line > line) break; // declarations are already in file order
    candidate = decl;
  }
  return candidate;
}

function describeWhat(decl: Declaration): string {
  return decl.kind === 'test'
    ? `test('${decl.title}')`
    : `test.describe('${decl.title}')`;
}

function orphanMessage(file: string, hit: ViewportHit): string {
  return (
    `${file}:${hit.line} calls ${hit.api}, but no enclosing test(...) or ` +
    `test.describe(...) declaration was found above it in this file -- nothing to ` +
    'attribute this call to.'
  );
}

function structuralMismatchMessage(
  file: string,
  hit: ViewportHit,
  enclosing: Declaration,
): string {
  if (hit.api === 'page.setViewportSize(...)') {
    return (
      `${file}:${hit.line} calls page.setViewportSize(...), but the nearest enclosing ` +
      `declaration is test.describe('${enclosing.title}') at line ${enclosing.line}, not a ` +
      "test() -- this call is not written inside any individual test's own body (for " +
      'example, reached through a variable bound to test/test.fixme rather than the literal ' +
      'token), so it cannot be attributed to one test for tagging. Fix: register it via a ' +
      'literal test(...)/test.fixme(...)/test.only(...) call, not through an intermediate ' +
      'variable, so each declaration can be tagged on its own.'
    );
  }
  return (
    `${file}:${hit.line} calls test.use({ viewport }), but the nearest enclosing declaration ` +
    `is test('${enclosing.title}') at line ${enclosing.line}, not a describe -- test.use() ` +
    'configures every test in its enclosing describe, and Playwright does not support ' +
    'calling it inside a running test body. Fix: move it to the top of the enclosing describe.'
  );
}

function untaggedMessage(
  file: string,
  decl: Declaration,
  lines: number[],
): string {
  const plural = lines.length > 1 ? 's' : '';
  return (
    `${file}:${decl.line} -- ${describeWhat(decl)} manipulates the viewport (line${plural} ` +
    `${lines.join(', ')}) but is not tagged \`${EMULATED_VIEWPORT_TAG}\` -- tag it ` +
    `\`${EMULATED_VIEWPORT_TAG}\`: a real device cannot resize its screen.`
  );
}

function staleTagMessage(file: string, decl: Declaration): string {
  return (
    `${file}:${decl.line} -- ${describeWhat(decl)} is tagged \`${EMULATED_VIEWPORT_TAG}\` but ` +
    'its own body never calls page.setViewportSize(...) or test.use({ viewport }) -- stale ' +
    'tag, silently costing real-device coverage. Remove the tag, or add the viewport call the ' +
    'tag is supposed to describe.'
  );
}

/** The whole guard, as one pure function of (path, source text) -> finding
 * messages -- kept separate from the filesystem walk below so the "self-test"
 * describe block can prove every branch of it red and green on tiny synthetic
 * input, not just trust the real corpus to happen to exercise all of them. */
function analyze(file: string, rawText: string): string[] {
  const text = blankComments(rawText);
  const declarations = extractDeclarations(text);
  const hits = [
    ...extractSetViewportSizeHits(text),
    ...extractViewportUseHits(text),
  ];

  const findings: string[] = [];
  // Two separate sets on purpose. `cleanTouches` drives the "needs a tag" check
  // below and must hold ONLY hits that were attributed to the right kind of
  // declaration -- a malformed (mismatched) hit already gets its own, more
  // useful finding and must not ALSO claim its enclosing declaration as
  // "correctly touches the viewport, just untagged". `anyTouch` drives stale-tag
  // suppression and deliberately includes mismatched hits too: the root cause
  // there is the structural problem, not a stale tag, so that declaration must
  // not ALSO be reported as stale underneath the structural finding -- one root
  // cause, one message. Without this split, a single malformed call site
  // produced two overlapping findings for the same describe (caught by this
  // file's own "aliased callee" synthetic test going from 1 expected finding to
  // 2 actual before this split existed).
  const cleanTouches = new Map<Declaration, number[]>();
  const anyTouch = new Set<Declaration>();

  for (const hit of hits) {
    const enclosing = findEnclosing(declarations, hit.line);
    if (!enclosing) {
      findings.push(orphanMessage(file, hit));
      continue;
    }
    const mismatched =
      (enclosing.kind === 'describe' &&
        hit.api === 'page.setViewportSize(...)') ||
      (enclosing.kind === 'test' && hit.api === 'test.use({ viewport })');
    anyTouch.add(enclosing);
    if (mismatched) {
      findings.push(structuralMismatchMessage(file, hit, enclosing));
      continue;
    }
    cleanTouches.set(enclosing, [
      ...(cleanTouches.get(enclosing) ?? []),
      hit.line,
    ]);
  }

  for (const [decl, lines] of cleanTouches) {
    if (!decl.tagged) findings.push(untaggedMessage(file, decl, lines));
  }
  for (const decl of declarations) {
    if (decl.tagged && !anyTouch.has(decl))
      findings.push(staleTagMessage(file, decl));
  }

  return findings;
}

describe('a real phone cannot resize its own screen', () => {
  it('every test that manipulates the viewport is tagged @emulated-viewport, and no tag is stale', () => {
    const files = SCAN_DIRS.flatMap(listSourceFiles);

    // Same self-check tests/e2e/baseurl-guard.spec.ts uses on itself: a walk that
    // silently found zero files would pass for the wrong reason.
    expect(
      files.length,
      `expected to find .ts files under ${SCAN_DIRS.join(', ')}; found none, which means ` +
        "this guard's own file-walk is broken, not that the suite has nothing to check",
    ).toBeGreaterThan(0);

    const findings = files.flatMap((file) =>
      analyze(file, readFileSync(file, 'utf8')),
    );
    expect(findings, findings.join('\n')).toEqual([]);
  });
});

// Proof the mechanism itself works, red and green, independent of whatever the
// real corpus happens to contain today -- "a guard nobody has watched fail is
// decoration" applies to the guard's own building blocks too, not only to the
// tags it is checking for.
describe('analyze() -- the scanner proven on synthetic input, not just trusted', () => {
  it('flags an untagged test that resizes the viewport, naming file, line and title', () => {
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test('shrinks to a phone width', async ({ page }) => {",
      '  await page.setViewportSize({ width: 320, height: 800 });',
      "  await page.goto('/');",
      '});',
      '',
    ].join('\n');

    const findings = analyze('synthetic.spec.ts', src);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('synthetic.spec.ts:3'); // the `test(` line
    expect(findings[0]).toContain('shrinks to a phone width');
    expect(findings[0]).toContain(EMULATED_VIEWPORT_TAG);
  });

  it('accepts the identical test once the tag is added', () => {
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test('shrinks to a phone width', { tag: '@emulated-viewport' }, async ({ page }) => {",
      '  await page.setViewportSize({ width: 320, height: 800 });',
      "  await page.goto('/');",
      '});',
      '',
    ].join('\n');

    expect(analyze('synthetic.spec.ts', src)).toEqual([]);
  });

  it('flags a tag on a test whose body never touches the viewport as stale', () => {
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test('does nothing viewport-related', { tag: '@emulated-viewport' }, async ({ page }) => {",
      "  await page.goto('/');",
      '});',
      '',
    ].join('\n');

    const findings = analyze('synthetic.spec.ts', src);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('stale');
    expect(findings[0]).toContain('does nothing viewport-related');
  });

  it('does not mistake a runtime test.skip(condition, reason) call for a new declaration', () => {
    // The exact shape of chrome.spec.ts:122 and head-and-sitemap.spec.ts:85: a
    // *runtime* conditional skip, called INSIDE an already-open test body. If this
    // were misread as a second declaration, the setViewportSize below it would be
    // orphaned (attributed to nothing) rather than correctly attributed to the
    // outer, already-tagged test.
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test('desktop nav', { tag: '@emulated-viewport' }, async ({ page, browserName }) => {",
      "  test.skip(browserName === 'webkit', 'not relevant on WebKit');",
      '  await page.setViewportSize({ width: 1280, height: 800 });',
      '});',
      '',
    ].join('\n');

    expect(analyze('synthetic.spec.ts', src)).toEqual([]);
  });

  it('attributes test.use({ viewport }) to its enclosing describe, both directions', () => {
    const untagged = [
      "import { test, expect } from './fixtures';",
      '',
      "test.describe('narrow screens', () => {",
      '  test.use({ viewport: { width: 320, height: 568 } });',
      '',
      "  test('fits', async ({ page }) => {",
      "    await page.goto('/');",
      '  });',
      '});',
      '',
    ].join('\n');

    const untaggedFindings = analyze('synthetic.spec.ts', untagged);
    expect(untaggedFindings).toHaveLength(1);
    expect(untaggedFindings[0]).toContain('narrow screens');
    expect(untaggedFindings[0]).toContain(EMULATED_VIEWPORT_TAG);

    const tagged = untagged.replace(
      "test.describe('narrow screens', () => {",
      "test.describe('narrow screens', { tag: '@emulated-viewport' }, () => {",
    );
    expect(analyze('synthetic.spec.ts', tagged)).toEqual([]);
  });

  it('reports a setViewportSize reached through an aliased callee as a structural problem, not silence', () => {
    // The exact shape classroom-groups.spec.ts's own first draft used before this
    // task's own restructuring: `const run = fits ? test : test.fixme; run(...)`.
    // The literal token `run(` is not `test(`, so rule 1 cannot see it as a
    // declaration -- this proves that gap surfaces as a loud, actionable finding
    // rather than the call silently going unattributed.
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      "test.describe('generated', () => {",
      '  const run = test;',
      "  run('generated title', async ({ page }) => {",
      '    await page.setViewportSize({ width: 320, height: 800 });',
      '  });',
      '});',
      '',
    ].join('\n');

    const findings = analyze('synthetic.spec.ts', src);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('generated');
    expect(findings[0]).toContain('not a test()');
  });

  it('ignores setViewportSize and a declaration-shaped call when they appear only in a comment', () => {
    // The two real near-misses this file's own header comment names:
    // classroom-groups.spec.ts:1068 ("/id/*" inside a `//` line) and
    // classroom-groups-controls.spec.ts:1069 (`test.fixme(title, body)` inside a
    // `//` line, describing the API rather than calling it).
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      '// Example: await page.setViewportSize({ width: 320, height: 800 });',
      '// See also `test.fixme(title, body)` for the declaration form.',
      '// Cloudflare serves /id/* too, so this is not stranded in English.',
      "test('does not actually touch the viewport', async ({ page }) => {",
      "  await page.goto('/');",
      '});',
      '',
    ].join('\n');

    expect(analyze('synthetic.spec.ts', src)).toEqual([]);
  });

  it('tolerates a wrapped title (test( on one line, the quoted title on the next)', () => {
    // Prettier wraps a call onto one argument per line once it stops fitting the
    // configured print width -- several real titles in this corpus are long
    // enough on their own to force this once the tag argument is added (see
    // classroom-groups.spec.ts:874's own title, 104 characters before the tag).
    const src = [
      "import { test, expect } from './fixtures';",
      '',
      'test(',
      "  'a title long enough that prettier wraps every argument onto its own line',",
      "  { tag: '@emulated-viewport' },",
      '  async ({ page }) => {',
      '    await page.setViewportSize({ width: 320, height: 900 });',
      "    await page.goto('/');",
      '  },',
      ');',
      '',
    ].join('\n');

    expect(analyze('synthetic.spec.ts', src)).toEqual([]);
  });
});
