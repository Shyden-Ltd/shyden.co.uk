import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { floorBreach, readFloors, FLOORS_FILE } from '../floors';
import { searched } from '../source-files';
import {
  decideRecord,
  describeMoves,
  floorsText,
} from '../../scripts/record-floors.mjs';

/**
 * The ratchet on guard liveness floors (#468): a floor is a recorded figure,
 * checked for equality, so a reader that loses one unit fails AND a
 * population that grew fails until the figure is recorded. Growth used to
 * pass in silence: `absence-liveness` was set to `> 420` against a real 421
 * in #467 and read 424 an hour after it merged.
 */
describe('floorBreach', () => {
  const judging = { floors: { 'guard/units': 10 }, record: null };

  it('says nothing when the reader saw exactly the recorded figure', () => {
    expect(floorBreach('guard/units', 10, judging)).toBeUndefined();
  });

  it('names a reader that came back one short, and the hand edit a shrink needs', () => {
    expect(floorBreach('guard/units', 9, judging)).toBe(
      'guard/units: read 9, recorded 10. The reader lost 1, or the corpus ' +
        'shrank: if it shrank, lower the figure in tests/floors.json by hand ' +
        'and say why in the commit.',
    );
  });

  it('names a population that grew, and the command that records it', () => {
    expect(floorBreach('guard/units', 11, judging)).toBe(
      'guard/units: read 11, recorded 10. The population grew by 1: run ' +
        'npm run floors:record, read what it moved, and commit tests/floors.json.',
    );
  });

  it('refuses an id nobody recorded', () => {
    expect(floorBreach('guard/other', 10, judging)).toBe(
      'guard/other is not recorded in tests/floors.json: run npm run floors:record',
    );
  });

  it('names the file it reads the figures from', () => {
    expect(FLOORS_FILE).toBe('tests/floors.json');
  });

  it.each([
    ['a fraction', 9.5],
    ['a negative', -1],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
  ])('refuses %s as a count, recording or not', (_, actual) => {
    const dir = mkdtempSync(join(tmpdir(), 'floors-'));
    try {
      const record = join(dir, 'seen.jsonl');
      for (const mode of [null, record])
        expect(
          floorBreach('guard/units', actual, { ...judging, record: mode }),
        ).toBe(`guard/units: ${actual} is not a count`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('in record mode, writes what it saw and where, and lets the run go on', () => {
    const dir = mkdtempSync(join(tmpdir(), 'floors-'));
    try {
      const record = join(dir, 'seen.jsonl');
      expect(
        floorBreach('guard/units', 12, { ...judging, record }),
      ).toBeUndefined();
      expect(
        floorBreach('guard/new', 3, { ...judging, record }),
      ).toBeUndefined();
      const lines = readFileSync(record, 'utf8')
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(lines.map(({ id, actual }) => [id, actual])).toEqual([
        ['guard/units', 12],
        ['guard/new', 3],
      ]);
      for (const { site } of lines)
        expect(site).toMatch(/^tests\/unit\/floors\.test\.ts:\d+$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads the recorded figures as whole numbers keyed by id', () => {
    const recorded = Object.entries(readFloors());
    const malformed = recorded
      .filter(
        ([id, measured]) =>
          !/^[a-z0-9-]+(\/[a-z0-9-]+)+$/.test(id) ||
          !Number.isInteger(measured) ||
          measured < 0,
      )
      .map(([id]) => id);
    expect(
      searched(malformed, {
        of: recorded.map(([id]) => id),
        what: `ids in ${FLOORS_FILE}`,
      }),
    ).toEqual([]);
  });
});

describe('decideRecord', () => {
  const at = (id: string, actual: number, site = 'tests/unit/a.test.ts:1') => ({
    id,
    actual,
    site,
  });

  it('keeps every figure the run saw unchanged', () => {
    expect(decideRecord({ 'a/b': 4 }, [at('a/b', 4)])).toEqual({
      next: { 'a/b': 4 },
      refusals: [],
    });
  });

  it('raises a figure that grew and adds an id seen for the first time', () => {
    expect(
      decideRecord({ 'a/b': 4 }, [at('a/b', 6), at('c/d', 2, 'x.ts:9')]),
    ).toEqual({ next: { 'a/b': 6, 'c/d': 2 }, refusals: [] });
  });

  it('never lowers a figure: a fall is a blind reader until a person says otherwise', () => {
    const { refusals } = decideRecord({ 'a/b': 4, 'c/d': 1 }, [
      at('a/b', 3),
      at('c/d', 2, 'x.ts:9'),
    ]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('a/b');
    expect(refusals[0]).toContain('would fall from 4 to 3');
  });

  it('refuses a recorded id the run never asserted', () => {
    const { refusals } = decideRecord({ 'a/b': 4, 'gone/x': 7 }, [
      at('a/b', 4),
    ]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('gone/x');
    expect(refusals[0]).toContain('no test asserted it');
  });

  it('refuses an id asserted from two places', () => {
    const { refusals } = decideRecord({}, [
      at('a/b', 4, 'tests/unit/a.test.ts:1'),
      at('a/b', 4, 'tests/unit/b.test.ts:2'),
    ]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('a/b');
    expect(refusals[0]).toContain('tests/unit/a.test.ts:1');
    expect(refusals[0]).toContain('tests/unit/b.test.ts:2');
  });

  it('refuses an id that read two different values', () => {
    const { refusals } = decideRecord({}, [at('a/b', 4), at('a/b', 5)]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('a/b');
    expect(refusals[0]).toContain('4, 5');
  });

  it('accepts one id read twice from one place with one value', () => {
    expect(decideRecord({}, [at('a/b', 4), at('a/b', 4)])).toEqual({
      next: { 'a/b': 4 },
      refusals: [],
    });
  });

  it('reports every refusal at once, not the first', () => {
    const { refusals } = decideRecord({ 'a/b': 4, 'gone/x': 1 }, [
      at('a/b', 3),
      at('c/d', 1),
      at('c/d', 2),
    ]);
    expect(refusals).toHaveLength(3);
  });
});

describe('describeMoves', () => {
  it('says nothing when no figure moved', () => {
    expect(describeMoves({ 'a/b': 4 }, { 'a/b': 4 })).toEqual([]);
  });

  it('prints every figure that moved, its delta, largest first, so a raise is read', () => {
    // A change that adds five units and quietly loses three records +2 and
    // nothing goes red; only a person reading the delta against the diff
    // can see it, so the recorder shows each one (operator, 2026-10-03).
    expect(
      describeMoves(
        { 'a/b': 4, 'c/d': 100, 'e/f': 7 },
        { 'a/b': 6, 'c/d': 125, 'e/f': 7, 'g/h': 3 },
      ),
    ).toEqual(['c/d: 100 -> 125 (+25)', 'g/h: new, 3', 'a/b: 4 -> 6 (+2)']);
  });
});

describe('floorsText', () => {
  it('writes ids sorted, two-space indented, with a final newline', () => {
    expect(floorsText({ 'z/a': 2, 'a/z': 1 })).toBe(
      '{\n  "a/z": 1,\n  "z/a": 2\n}\n',
    );
  });
});
