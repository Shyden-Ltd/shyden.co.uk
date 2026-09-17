import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { searched } from '../source-files';

/**
 * The scan that found the shipped defects, encoded so it runs every time.
 *
 * Three sentences went to production saying "Company No.17110487",
 * "Registered office:71-75 Shelton Street" and "tidak ada.Kembali ke beranda"
 * — in both languages, for weeks. Nobody edited that copy. In JSX and Astro,
 * whitespace between two nodes survives only while they share a line, so
 * `prettier` re-wrapping a long line silently deletes a space from the
 * rendered text. The formatter changes what the page SAYS.
 *
 * Those three are now pinned as whole sentences by chrome/homepage/site-meta.
 * That protects the three that were found. This protects the ones that have
 * not happened yet: any NEW multi-node sentence, on any page, in any locale.
 *
 * What it cannot see: a seam between two lowercase words with no punctuation
 * at the join ("the endand the beginning"). Reviewing rendered text is still
 * a job. This catches the shape that has actually bitten, twice.
 */

/**
 * Punctuation glued directly to what follows it.
 *
 * Held as source strings, not RegExp literals, and compiled fresh at every
 * use. A shared `/g` regex carries `lastIndex` between calls, so the second
 * test to touch one would silently start scanning from halfway through the
 * page — the kind of defect that shows up as one flaky run in twenty.
 */
const GLUE_PATTERNS: Array<{ source: string; why: string }> = [
  {
    // "ends.Kembali" · "apart,And" — sentence or clause boundary with the
    // space missing. A real sentence never runs a capital onto punctuation.
    source: '[a-z][.,:][A-Z]',
    why: 'punctuation glued to the next sentence',
  },
  {
    // "No.17110487" — the exact defect that shipped.
    source: '[a-z]\\.\\d',
    why: 'a word glued to a number',
  },
  {
    // "office:71-75" — the other one. Anchored on a letter before the colon
    // so clock times ("9:30") are not swept up.
    source: '[a-z]:\\d',
    why: 'a label glued to its value',
  },
];

const scan = (text: string) =>
  GLUE_PATTERNS.flatMap(({ source, why }) =>
    [...text.matchAll(new RegExp(source, 'g'))].map((m) => ({
      why,
      at: m.index ?? 0,
    })),
  );

/**
 * Every page the site publishes, read from the sitemap rather than listed
 * here — a new page is covered the day it is added, without anyone
 * remembering to come back and add it. The 404 is appended because it is
 * deliberately absent from the sitemap.
 */
async function publishedPaths(page: Page): Promise<string[]> {
  const xml = await (await page.request.get('/sitemap-0.xml')).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => new URL(m[1]).pathname,
  );
  expect(paths.length).toBeGreaterThan(0); // an empty sitemap must not pass
  return [...paths, '/definitely-not-a-page'];
}

/**
 * The text a visitor actually reads, with the conditional fields revealed.
 *
 * innerText and not textContent: textContent concatenates block elements with
 * no separator at all, so every `</p><p>` would look like a defect. innerText
 * inserts the line breaks the layout implies, which is precisely the join
 * being tested. `hidden` is stripped first so the fields behind the radio
 * buttons are scanned too.
 */
const renderedText = (page: Page) =>
  page.evaluate(() => {
    document
      .querySelectorAll('[hidden]')
      .forEach((el) => el.removeAttribute('hidden'));
    return document.body.innerText;
  });

/**
 * Joins that are meant to be there. Four on the whole site, and both shapes
 * are ordinary typography rather than accidents.
 */
const INTENTIONAL_JOINS: Array<{ left: RegExp; right: RegExp; why: string }> = [
  {
    left: /Shy$/,
    right: /^Talk/,
    why: 'the ShyTalk wordmark is one word rendered in two colours',
  },
  {
    left: /\S$/,
    right: /^[.,]$/,
    why: 'punctuation closing a sentence that ended in a link',
  },
];

/**
 * Every place two neighbouring nodes render side by side on one line with no
 * gap between them.
 *
 * This is the seam defect stated as what a visitor sees, rather than guessed
 * at from punctuation. The purely textual scan above cannot see the homepage
 * case at all — "…what you're building." followed by an email address glues
 * letter to letter, with no punctuation at the join to match on. Verified:
 * deleting that page's `{' '}` leaves the pattern scan green and fails this.
 *
 * Measured rather than reasoned about, because the obvious implementations
 * are both wrong. Comparing text alone reports 172 joins on this site, nearly
 * all of them block elements that legitimately touch. Filtering by CSS
 * `display` still mis-reads inline-blocks that CSS margins hold apart. Asking
 * the browser where the boxes actually landed reports ten (two shapes, in five
 * languages), and all ten are deliberate.
 *
 * Both sides of a join are read as the lines of text a visitor can see, and
 * nothing else (#198). At phone width every page failed on a join nobody could
 * see: the header's last text box was an `.sr` label inside the closed
 * language menu, and the "line" it touched was the hero section's 550px
 * border box, which `Range.getClientRects()` returns alongside the text
 * inside it. Hidden text is left out of the neighbours too, so the visible
 * text either side of it is compared directly.
 */
const visualJoins = (page: Page) =>
  page.evaluate(() => {
    const out: Array<{ left: string; right: string; tag: string }> = [];
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

    type Edges = { left: number; top: number; right: number; bottom: number };
    type Seen = { text: string; lines: DOMRect[] };

    // A computed length in px: `4px`, or `50%` of `size`. NaN for anything
    // else (a calc(), say), so a clip this cannot read is never applied.
    const px = (value: string, size: number) =>
      /^-?[\d.]+px$/.test(value)
        ? parseFloat(value)
        : /^-?[\d.]+%$/.test(value)
          ? (parseFloat(value) / 100) * size
          : NaN;

    // What an element's `clip-path: inset()` and `clip: rect()` leave showing.
    // Both cut the element and everything inside it, which is how an `.sr`
    // label keeps its layout and shows nothing. Other clip-path shapes are not
    // read, so they cut nothing here: a clip this misreads can only add a
    // join, never hide one.
    const clipCache = new Map<Element, Edges[]>();
    const clipsOf = (el: Element): Edges[] => {
      const cached = clipCache.get(el);
      if (cached) return cached;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const clips: Edges[] = [];

      const inset = /^inset\(([^)]*)\)/.exec(style.clipPath);
      if (inset) {
        const [t, r = t, b = t, l = r] = inset[1]
          .split(' round ')[0]
          .trim()
          .split(/\s+/);
        clips.push({
          left: box.left + px(l, box.width),
          top: box.top + px(t, box.height),
          right: box.right - px(r, box.width),
          bottom: box.bottom - px(b, box.height),
        });
      }

      const rect = /^rect\(([^)]*)\)/.exec(style.clip);
      if (rect && ['absolute', 'fixed'].includes(style.position)) {
        const [t, r, b, l] = rect[1].split(/,\s*|\s+/);
        const offset = (value: string, auto: number) =>
          value === 'auto' ? auto : px(value, 0);
        clips.push({
          left: box.left + offset(l, 0),
          top: box.top + offset(t, 0),
          right: box.left + offset(r, box.width),
          bottom: box.top + offset(b, box.height),
        });
      }

      const readable = clips.filter((clip) =>
        Object.values(clip).every(Number.isFinite),
      );
      clipCache.set(el, readable);
      return readable;
    };

    // A line of text cut down to what every clip above it leaves showing, or
    // null when that is nothing.
    const showing = (line: DOMRect, parent: Element): DOMRect | null => {
      let { left, top, right, bottom } = line;
      for (let el: Element | null = parent; el; el = el.parentElement) {
        for (const clip of clipsOf(el)) {
          left = Math.max(left, clip.left);
          top = Math.max(top, clip.top);
          right = Math.min(right, clip.right);
          bottom = Math.min(bottom, clip.bottom);
        }
      }
      return right > left && bottom > top
        ? new DOMRect(left, top, right - left, bottom - top)
        : null;
    };

    // The rest of the ways to keep text in the layout and paint none of it:
    // inside a closed <details>, `visibility: hidden`, `opacity: 0`. Each
    // option is passed under both of its names, because Safari shipped the
    // older ones first.
    const painted = (el: Element) => {
      if (typeof el.checkVisibility !== 'function') {
        throw new Error(
          'Element.checkVisibility() is missing, so this browser cannot say ' +
            'which text a visitor sees. Every join it reported would be a guess.',
        );
      }
      return el.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
        checkOpacity: true,
        checkVisibilityCSS: true,
      });
    };

    // What a visitor sees of a node: its text, and the lines that text sits
    // on, in document order. Only text nodes have lines, so an element's own
    // border box never stands in for one.
    const seenCache = new Map<Node, Seen>();
    const seen = (node: Node): Seen => {
      const cached = seenCache.get(node);
      if (cached) return cached;
      let result: Seen = { text: '', lines: [] };

      if (node instanceof Text) {
        const parent = node.parentElement;
        if (parent && painted(parent)) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const lines = [...range.getClientRects()]
            .filter((r) => r.width > 0)
            .map((r) => showing(r, parent))
            .filter((r): r is DOMRect => r !== null);
          if (lines.length) result = { text: node.data, lines };
        }
      } else if (node instanceof Element && !skip.has(node.tagName)) {
        const parts = [...node.childNodes].map(seen);
        result = {
          text: parts.map((part) => part.text).join(''),
          lines: parts.flatMap((part) => part.lines),
        };
      }

      seenCache.set(node, result);
      return result;
    };

    const walk = (el: Element) => {
      if (skip.has(el.tagName)) return;
      const kids = [...el.childNodes].map(seen).filter((kid) => kid.text);

      for (let i = 0; i < kids.length - 1; i++) {
        const left = kids[i];
        const right = kids[i + 1];
        if (!left.text.trim() || !right.text.trim()) continue;
        // A space on either side of the join means the join is fine.
        if (/\s$/.test(left.text) || /^\s/.test(right.text)) continue;

        const a = left.lines.at(-1);
        const b = right.lines[0];
        if (!a || !b) continue;

        const sameLine =
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
        if (sameLine && b.left - a.right < 1) {
          out.push({ tag: el.tagName, left: left.text, right: right.text });
        }
      }
      for (const child of el.children) walk(child);
    };

    walk(document.body);
    return out;
  });

/**
 * Cases for the join detector itself.
 *
 * Each case is laid out on its own: the left text ends at the middle of the
 * page, the right text starts there, both on the same top edge, and the two
 * are neighbours with nothing between them. So they touch, and the only thing
 * that can keep a join from being reported is the detector ruling a side out.
 * What comes back is the names of the cases whose join was reported, read off
 * the right-hand text, which every case leaves in view.
 *
 * Built as elements, not parsed from HTML: a stray newline in a markup string
 * becomes a text node, and that node, not the right text, would then be the
 * neighbour the detector compares.
 */
type Fixture = string | [tag: string, style: string, ...children: Fixture[]];

const LEFT = 'position: absolute; top: 0; right: 50%; white-space: nowrap';
const RIGHT = 'position: absolute; top: 0; left: 50%; white-space: nowrap';
const ONE_PIXEL = 'width: 1px; height: 1px; overflow: hidden';

async function joinsReportedFor(
  page: Page,
  cases: Record<string, { left: Fixture; right?: Fixture }>,
): Promise<string[]> {
  const rows: Fixture[] = Object.entries(cases).map(
    ([name, { left, right }]) => [
      'div',
      'position: relative; height: 5em',
      left,
      right ?? ['span', RIGHT, `${name}-right`],
    ],
  );

  await page.goto('/');
  await page.evaluate((fixtures) => {
    const build = (fixture: Fixture): Node => {
      if (typeof fixture === 'string') return document.createTextNode(fixture);
      const [tag, style, ...children] = fixture;
      const el = document.createElement(tag);
      el.setAttribute('style', style);
      el.append(...children.map(build));
      return el;
    };
    document.body.replaceChildren(...fixtures.map(build));
  }, rows);

  const names = (await visualJoins(page)).map((join) =>
    join.right.replace(/-right$/, ''),
  );
  return [...new Set(names)].sort();
}

test.describe('rendered text — no sentence may lose a space to the formatter', () => {
  test('every published page, in every language', async ({ page }) => {
    const paths = await publishedPaths(page);
    const findings: string[] = [];

    for (const path of paths) {
      await page.goto(path);
      const text = await renderedText(page);

      for (const { why, at } of scan(text)) {
        const context = text.slice(Math.max(0, at - 45), at + 45).trim();
        findings.push(`${path}: ${why} -> …${context}…`);
      }
    }

    // Reported all at once: a scan that stops at the first hit turns one
    // review pass into six.
    expect(
      searched(findings, { of: paths, what: 'built pages visited' }),
      findings.join('\n'),
    ).toEqual([]);
  });

  test('no two words are rendered touching, on any page', async ({ page }) => {
    // Where a box lands depends on the width it was laid out at, so the width
    // is part of what was searched: at 1280px this test passed for weeks while
    // every page failed it at phone width (#198).
    const width = page.viewportSize()?.width;
    const paths = await publishedPaths(page);
    const findings: string[] = [];

    for (const path of paths) {
      await page.goto(path);
      for (const join of await visualJoins(page)) {
        const allowed = INTENTIONAL_JOINS.some(
          ({ left, right }) => left.test(join.left) && right.test(join.right),
        );
        if (allowed) continue;
        findings.push(
          `${path} <${join.tag.toLowerCase()}>: ` +
            `…${join.left.slice(-40).trim()}⟨NO SPACE⟩${join.right.slice(0, 40).trim()}…`,
        );
      }
    }

    expect(
      searched(findings, {
        of: width ? paths : [],
        what: `built pages visited at ${width}px wide`,
      }),
      `at ${width}px wide:\n${findings.join('\n')}`,
    ).toEqual([]);
  });

  test('no unfilled [[placeholder]] reaches a page', async ({ page }) => {
    // release.yml refuses to ship a `[[…]]` placeholder, but that guard only
    // runs at release — by which point the fix costs a re-dispatch and an
    // approval. The same check belongs here, where it runs on every PR.
    const paths = await publishedPaths(page);
    const findings: string[] = [];

    for (const path of paths) {
      await page.goto(path);
      const text = await renderedText(page);
      for (const m of text.matchAll(/\[\[[^\]]{1,60}\]\]/g)) {
        findings.push(`${path}: ${m[0]}`);
      }
    }
    expect(
      searched(findings, { of: paths, what: 'built pages visited' }),
      findings.join('\n'),
    ).toEqual([]);
  });

  test('the scan can actually see a broken seam', async ({ page }) => {
    // A detector nobody has watched fail is a detector nobody should trust.
    // This injects the exact defect that shipped and asserts the scan finds
    // it — so a future refactor that quietly stops matching fails here rather
    // than going green over a broken page.
    await page.goto('/');
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.textContent = 'Company No.17110487 · Registered office:71-75 Shelton';
      document.body.appendChild(p);
    });

    const text = await renderedText(page);
    expect([...new Set(scan(text).map((h) => h.why))].sort()).toEqual([
      'a label glued to its value',
      'a word glued to a number',
    ]);
  });

  test('the touching-words check only counts text a visitor can see', async ({
    page,
  }) => {
    // Every case lays its left text out flush against its right text, on one
    // line. Only `visible` can be seen, so only `visible` is a join. The rest
    // are the ways this site keeps text in the layout while hiding it: the
    // closed language menu and its `.sr` label are what failed every page at
    // phone width (#198).
    const reported = await joinsReportedFor(page, {
      visible: { left: ['span', LEFT, 'visible-left'] },
      invisible: {
        left: ['span', `${LEFT}; visibility: hidden`, 'invisible-left'],
      },
      transparent: {
        left: ['span', `${LEFT}; opacity: 0`, 'transparent-left'],
      },
      closed: {
        left: [
          'details',
          '',
          ['summary', 'position: absolute; top: 0; left: 0', 'menu'],
          ['span', LEFT, 'closed-left'],
        ],
      },
      'clip-path': {
        left: [
          'span',
          `${LEFT}; ${ONE_PIXEL}; clip-path: inset(50%)`,
          'clip-path-left',
        ],
      },
      'clip-rect': {
        left: [
          'span',
          `${LEFT}; ${ONE_PIXEL}; clip: rect(0 0 0 0)`,
          'clip-rect-left',
        ],
      },
    });

    expect(reported).toEqual(['visible']);
  });

  test('the touching-words check compares lines of text, never an element box', async ({
    page,
  }) => {
    // `box` puts its right text 3em below the line its left text sits on, and
    // gives the paragraph holding it a border box that starts ON that line.
    // A detector that reads the paragraph's box reports a join nobody can see,
    // which is how the hero section's 550px box came to "touch" the header.
    const reported = await joinsReportedFor(page, {
      line: {
        left: ['span', LEFT, 'line-left'],
        right: ['div', RIGHT, ['p', 'margin: 0', 'line-right']],
      },
      box: {
        left: ['span', LEFT, 'box-left'],
        right: [
          'div',
          RIGHT,
          ['p', 'margin: 0; padding-top: 3em', 'box-right'],
        ],
      },
    });

    expect(reported).toEqual(['line']);
  });
});
