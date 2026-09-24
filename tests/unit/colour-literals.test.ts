import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { filesUnder, searched } from '../source-files';
import { astroCode, codeWithoutComments, stylesheetCss } from './source-text';
import {
  codeColourLiterals,
  colourLiterals,
  cssRules,
  onPaper,
} from './css-rules';
import { TOKENS_FILE } from '../palette';

/**
 * No colour a theme cannot see (#142 spec §6.6).
 *
 * Theme logic lives only in tokens.css; components read tokens and never test
 * the theme. So a colour written straight into a component is the one thing a
 * theme cannot reach. Every literal outside tokens.css is refused unless it is
 * allowlisted here with its reason. Paper is exempt by rule, not by entry
 * (`onPaper`): no theme reaches it.
 */

type Literal = { file: string; rule?: readonly string[]; literal: string };

/** A file's code outside its CSS: an `.astro` file's non-style half, or all of a `.ts` file. */
const codeOf = (file: string, text: string): string =>
  file.endsWith('.astro') ? astroCode(text) : codeWithoutComments(file, text);

const literalsIn = (file: string, text: string): Literal[] => [
  ...(file.endsWith('.ts')
    ? []
    : stylesheetCss(file, text).flatMap((css) =>
        cssRules(css)
          .filter(({ chain }) => !onPaper(chain))
          .flatMap(({ chain, declarations }) =>
            declarations.flatMap(({ value }) =>
              colourLiterals(value).map((literal) => ({
                file,
                rule: chain,
                literal,
              })),
            ),
          ),
      )),
  ...(file.endsWith('.css')
    ? []
    : codeColourLiterals(codeOf(file, text)).map((literal) => ({
        file,
        literal,
      }))),
];

const REASON = {
  callout:
    'a light callout on /classroom-groups: it paints its own ground, ink and edge, so it reads the same over either theme (literal-grounds.test.ts holds the pairing)',
  shadow:
    'a shadow: black at low alpha darkens any ground, and nothing is read against it',
  hairline:
    "a flag's hairline: it keeps a flag with a white edge distinct on a light ground, and is invisible but harmless on a dark one",
  scrim:
    "the print panel's backdrop: a black scrim dims either ground, and holds no text",
  brand:
    "ShyTalk's own brand constants (#142 spec §3.4): the same in both themes by design",
  flags: 'national flag artwork: a flag keeps its own colours in every theme',
  avatars:
    'student avatar artwork: each avatar paints its own disc behind its figure, so it reads the same over either theme',
  issue:
    'an issue number in prose, not a colour: `#161` is hex-shaped, and no detector can tell the two apart',
} as const;

type Allowance = {
  file: string;
  /** The rule's whole chain; absent for a colour written in code. */
  rule?: readonly string[];
  /** Absent for a file whose every literal is its purpose. */
  literals?: readonly string[];
  reason: string;
};

const CG = 'src/components/pages/ClassroomGroupsPage.astro';

const ALLOWED: Allowance[] = [
  {
    file: 'src/components/Flag.astro',
    rule: ['.flag'],
    literals: ['rgb(0 0 0 / 0.18)'],
    reason: REASON.hairline,
  },
  {
    file: 'src/components/LanguageSwitcher.astro',
    rule: ['ul'],
    literals: ['rgb(0 0 0 / 0.12)'],
    reason: REASON.shadow,
  },
  {
    file: CG,
    rule: ['#cg-roster .cg-student.is-absent'],
    literals: ['#fff6e3', '#1a1a1a', '#d9a441'],
    reason: REASON.callout,
  },
  {
    file: CG,
    rule: ['#cg-roster .cg-absent-pill'],
    literals: ['#8a6a10', '#fff'],
    reason: REASON.callout,
  },
  {
    file: CG,
    rule: [
      '@media (min-width: 768px)',
      '#cg-roster .cg-student.is-absent > td:first-child',
    ],
    literals: ['#d9a441'],
    reason: REASON.callout,
  },
  {
    file: CG,
    rule: ['.cg-io-both-target .flag'],
    literals: ['rgb(0 0 0 / 0.18)'],
    reason: REASON.hairline,
  },
  {
    file: CG,
    rule: ['.cg-print-panel::backdrop'],
    literals: ['rgb(0 0 0 / 45%)'],
    reason: REASON.scrim,
  },
  {
    file: CG,
    rule: ['.cg-roster-limit-message'],
    literals: ['#b3261e', '#8c1d18', '#fdecea'],
    reason: REASON.callout,
  },
  {
    file: CG,
    rule: ['.error'],
    literals: ['#b3261e', '#8c1d18', '#fdecea'],
    reason: REASON.callout,
  },
  {
    file: CG,
    rule: ['.roster-warning'],
    literals: ['#956b1e', '#fff6e3', '#1a1a1a'],
    reason: REASON.callout,
  },
  {
    file: CG,
    rule: ['.stale-notice'],
    literals: ['#956b1e', '#fff6e3', '#1a1a1a'],
    reason: REASON.callout,
  },
  { file: 'src/lib/shytalk-brand.ts', reason: REASON.brand },
  { file: 'src/lib/i18n/flags.ts', reason: REASON.flags },
  { file: 'src/lib/avatars.ts', reason: REASON.avatars },
  {
    file: 'src/lib/i18n/back-translate.ts',
    literals: ['#161'],
    reason: REASON.issue,
  },
];

const sameChain = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((header, i) => header === b[i]);

const allows = (allowance: Allowance, found: Literal): boolean =>
  allowance.file === found.file &&
  (allowance.rule === undefined ||
    (found.rule !== undefined && sameChain(allowance.rule, found.rule))) &&
  (allowance.literals === undefined ||
    allowance.literals.includes(found.literal));

const describeLiteral = ({ file, rule, literal }: Literal): string =>
  `${file} :: ${rule === undefined ? '(code)' : rule.join(' { ')} writes ${literal}`;

const literalsUnderSrc = (): Literal[] =>
  filesUnder(
    'src',
    (path) => /\.(astro|css|ts)$/.test(path) && path !== TOKENS_FILE,
  ).flatMap((file) => literalsIn(file, readFileSync(file, 'utf8')));

describe('no colour a theme cannot see (#142)', () => {
  it('writes no colour literal outside tokens.css but the allowed ones', () => {
    const found = literalsUnderSrc();
    const refused = found
      .filter(
        (literal) => !ALLOWED.some((allowance) => allows(allowance, literal)),
      )
      .map(describeLiteral);
    expect(
      searched(refused, {
        of: found.map(describeLiteral),
        what: 'colour literals under src/',
      }),
    ).toEqual([]);
  });

  it('allows nothing the reader cannot find', () => {
    const found = literalsUnderSrc();
    const idle = ALLOWED.flatMap((allowance) =>
      (allowance.literals ?? [undefined]).flatMap((literal) =>
        found.some(
          (f) =>
            allows({ ...allowance, literals: undefined }, f) &&
            (literal === undefined || f.literal === literal),
        )
          ? []
          : [
              `${allowance.file} :: ${allowance.rule?.join(' { ') ?? '(code)'} ${literal ?? '(any)'}`,
            ],
      ),
    );
    expect(
      searched(idle, {
        of: found.map(describeLiteral),
        what: 'colour literals under src/',
      }),
    ).toEqual([]);
  });

  it('reads CSS by rule and skips paper, and reads code whole', () => {
    const control = literalsIn('x.css', '.a { color: #fff; }');
    expect(control.map(describeLiteral)).toEqual(['x.css :: .a writes #fff']);
    expect(
      searched(literalsIn('x.css', '@media print { .a { color: #fff; } }'), {
        of: control,
        what: 'the same rule on screen',
      }),
    ).toEqual([]);
    expect(
      literalsIn(
        'x.astro',
        '---\nconst c = \'white\';\n---\n<p style="color: red">&#123;</p>\n<style>\n  .b { border: 1px solid oklch(70% 0.1 200); }\n</style>\n',
      ).map(describeLiteral),
    ).toEqual([
      'x.astro :: .b writes oklch(70% 0.1 200)',
      'x.astro :: (code) writes white',
      'x.astro :: (code) writes red',
    ]);
  });
});
