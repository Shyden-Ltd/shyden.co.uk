import { describe, expect, it } from 'vitest';
import { filesUnder, nonEmpty, searched } from '../source-files';

/**
 * The shared directory walk (#80). Nine private copies had grown, in three
 * implementations whose exclusions disagreed — so the behaviour every guard
 * now inherits is pinned here rather than left to whichever copy a future
 * guard happened to reach for.
 */
describe('filesUnder', () => {
  it('recurses, and returns paths a caller can read', () => {
    const specs = filesUnder('tests', (path) => path.endsWith('.spec.ts'));
    // Anti-vacuity: an empty walk would satisfy every "no offenders" guard in
    // the suite at once — the exact failure #79 found in the e2e collectors.
    expect(specs.length).toBeGreaterThan(10);
    // Proof it went DOWN, not just listed the top level.
    expect(specs).toContain('tests/e2e/classroom-groups-print.spec.ts');
  });

  it('applies the caller predicate to the whole path, not the basename', () => {
    const inE2eOnly = filesUnder('tests', (path) =>
      path.startsWith('tests/e2e/'),
    );
    expect(inE2eOnly.every((path) => path.startsWith('tests/e2e/'))).toBe(true);
  });

  it('returns a stable order, so a guard reads the same list on every OS', () => {
    const once = filesUnder('tests', () => true);
    expect(once).toEqual([...once].sort());
  });

  it('skips dotfiles and node_modules, which only four of the nine did', () => {
    const all = filesUnder('tests', () => true);
    expect(
      all.filter((path) => path.split('/').some((s) => s.startsWith('.'))),
    ).toEqual([]);
    expect(all.filter((path) => path.includes('node_modules'))).toEqual([]);
  });
});

/**
 * The liveness control #84 moved OFF the call sites and INTO the collector.
 *
 * Eleven guards hand-wrote `expect(files.length).toBeGreaterThan(0)`, five of
 * them copying a comment that cites a sibling; four forgot, and twelve tests
 * passed while scanning zero files. `recorders.ts` already settled the shape
 * for browser events in #79 — the collector, not a convention, is what a
 * caller cannot forget.
 */
describe('nonEmpty', () => {
  it('passes a populated list straight through, untouched', () => {
    expect(nonEmpty(['a', 'b'], 'letters')).toEqual(['a', 'b']);
  });

  it('throws, naming what it was scanning, when the list is empty', () => {
    expect(() => nonEmpty([], 'every .ts file under tests/')).toThrow(
      /every \.ts file under tests\//,
    );
  });

  it('blames the guard, not the subject: the message is the whole point', () => {
    // "found none" reads like a clean result. The message has to say that the
    // WALK is broken, or the next reader triages the wrong thing entirely.
    expect(() => nonEmpty([], 'x')).toThrow(/broken/);
  });
});

describe('filesUnder refuses to answer blind', () => {
  it('throws rather than returning an empty list a guard would trust', () => {
    expect(() => filesUnder('tests', () => false)).toThrow(/tests/);
  });

  it('still descends through directories that hold no match themselves', () => {
    // The refusal belongs to the TOP-LEVEL call only. `tests/` holds
    // directories with no `.spec.ts` in them, so a recursion that refused an
    // empty sub-result could never complete a walk at all.
    expect(
      filesUnder('tests', (path) => path.endsWith('.spec.ts')).length,
    ).toBeGreaterThan(10);
  });
});

/**
 * The liveness control for absence assertions (#118).
 *
 * `nonEmpty` above guards a WALK. This guards an ASSERTION: `expect(x).
 * toEqual([])` is green when the guard works and when the guard looked at
 * nothing, and 108 absence assertions in this suite could not tell those
 * apart. The population goes in the same expression as the finding, so a
 * call site has nowhere to forget it.
 *
 * The content rule is #112's lesson made mechanical. That guard asserted its
 * header list had six entries and stayed green with all six Thai headers
 * blanked -- six empty strings are six entries. Counting the array is not
 * counting the content, so the count here is of SUBSTANTIVE members and the
 * rule lives in the one home rather than at 55 call sites.
 */
describe('searched -- the population a finding list was drawn from', () => {
  it('returns the findings untouched, so the caller still owns the verdict', () => {
    const findings = ['a'];
    expect(searched(findings, { of: ['x', 'y'], what: 'rows' })).toBe(findings);
  });

  it('refuses a population that is empty', () => {
    expect(() => searched([], { of: [], what: 'files' })).toThrow(/no files/);
  });

  it('refuses a population of BLANK strings -- #112 exactly', () => {
    // The Thai headers, blanked. Six entries, no content.
    expect(() => searched([], { of: ['', '  ', ''], what: 'headers' })).toThrow(
      /no headers/,
    );
  });

  it('refuses a population of empty containers', () => {
    expect(() => searched([], { of: [[], {}], what: 'catalogues' })).toThrow(
      /no catalogues/,
    );
  });

  it('refuses a population of null and undefined', () => {
    expect(() =>
      searched([], { of: [null, undefined], what: 'locales' }),
    ).toThrow(/no locales/);
  });

  it('accepts a population where only SOME members carry content', () => {
    // A partly-blank population is a real subject, not a dead walk: the
    // blanks may be what the caller is hunting.
    expect(searched([], { of: ['', 'real'], what: 'rows' })).toEqual([]);
  });

  it('accepts a plain count, which cannot be content-checked', () => {
    expect(searched([], { of: 3, what: 'pairs' })).toEqual([]);
    expect(() => searched([], { of: 0, what: 'pairs' })).toThrow(/no pairs/);
  });

  it('counts a zero and a false as content -- they are values, not blanks', () => {
    expect(searched([], { of: [0], what: 'widths' })).toEqual([]);
    expect(searched([], { of: [false], what: 'flags' })).toEqual([]);
  });

  it('names the population in the message, so a failure says what died', () => {
    expect(() => searched([], { of: [], what: 'built pages' })).toThrow(
      /built pages/,
    );
  });
});
