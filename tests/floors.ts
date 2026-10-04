/**
 * The ratchet on guard liveness floors (#468).
 *
 * A liveness floor proves a guard read its population: `absence-liveness`
 * judging nothing because its reader went blind must not look like a clean
 * suite. Written as `toBeGreaterThan(measured - 1)`, a floor is tight only on
 * the day it is measured, because growth never fails it: `absence-liveness`
 * was set to `> 420` against a real 421 in #467 and read 424 an hour after
 * it merged, so its reader could have lost three assertions in silence.
 *
 * So each floor is a figure recorded in `tests/floors.json` and checked for
 * EQUALITY. Fewer than recorded is a reader that lost units, or a corpus that
 * really shrank, which only a person can tell apart, so the figure is lowered
 * by hand with the reason in the commit. More than recorded is a population
 * that grew, and `npm run floors:record` raises it. Neither direction moves
 * on its own, so every floor is exact on every commit.
 *
 * Runner-neutral: vitest calls it today and Playwright will (#446 Group 5),
 * so it imports neither and returns the breach as text for the caller's own
 * `expect`:
 *
 *     expect(floorBreach('absence-liveness/sites', sites.length)).toBeUndefined();
 *
 * placed AFTER the guard's verdict, so a population that grew never hides a
 * finding. The id is a string literal in exactly one place under `tests/`
 * (`literal-floors.test.ts` holds that).
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOORS_FILE, RECORD_ENV } from '../scripts/record-floors.mjs';

// One home for both, in the recorder that writes the file and sets the
// variable (review pass 2).
export { FLOORS_FILE, RECORD_ENV };

export type Floors = Readonly<Record<string, number>>;

export const readFloors = (file: string = FLOORS_FILE): Floors =>
  JSON.parse(readFileSync(file, 'utf8')) as Floors;

const THIS_FILE = relative(process.cwd(), fileURLToPath(import.meta.url));

/**
 * The repository-relative `file:line` that called the check: the first stack
 * frame outside this file and outside node_modules.
 */
const callSite = (stack: string): string => {
  for (const line of stack.split('\n').slice(1)) {
    // V8 writes `at name (where:line:column)` or `at where:line:column`, and
    // `where` is a path or a file URL.
    const frame =
      /\((.+):(\d+):\d+\)$/.exec(line) ?? /^\s*at (.+):(\d+):\d+$/.exec(line);
    if (!frame) continue;
    const path = frame[1].startsWith('file:')
      ? fileURLToPath(frame[1])
      : frame[1];
    const file = relative(process.cwd(), path);
    if (file !== THIS_FILE && !file.includes('node_modules'))
      return `${file}:${frame[2]}`;
  }
  // Refused, never guessed: the recorder tells two call sites apart by this.
  throw new Error(`cannot tell which file called floorBreach:\n${stack}`);
};

export interface FloorOptions {
  /** The recorded figures; read from `FLOORS_FILE` when judging, if absent. */
  readonly floors?: Floors;
  /**
   * Where to record, `null` to judge. Absent means the environment decides
   * (`RECORD_ENV`): a test of this module passes `null`, so a record run
   * never mistakes its fixtures for real floors.
   */
  readonly record?: string | null;
}

/**
 * Nothing when `actual` equals the figure recorded for `id`; otherwise the
 * breach, naming the id, both numbers and what to do. In record mode it
 * writes `{ id, actual, site }` and says nothing, so one run sees every floor.
 * Something that is not a count is refused in both modes.
 */
export function floorBreach(
  id: string,
  actual: number,
  options: FloorOptions = {},
): string | undefined {
  if (!Number.isInteger(actual) || actual < 0)
    return `${id}: ${actual} is not a count`;
  const record =
    options.record === undefined
      ? (process.env[RECORD_ENV] ?? null)
      : options.record;
  if (record !== null) {
    const site = callSite(new Error().stack ?? '');
    appendFileSync(record, JSON.stringify({ id, actual, site }) + '\n');
    return undefined;
  }
  const measured = (options.floors ?? readFloors())[id];
  if (measured === undefined)
    return `${id} is not recorded in ${FLOORS_FILE}: run npm run floors:record`;
  if (actual < measured)
    return (
      `${id}: read ${actual}, recorded ${measured}. The reader lost ` +
      `${measured - actual}, or the corpus shrank: if it shrank, lower the ` +
      `figure in ${FLOORS_FILE} by hand and say why in the commit.`
    );
  if (actual > measured)
    return (
      `${id}: read ${actual}, recorded ${measured}. The population grew by ` +
      `${actual - measured}: run npm run floors:record, read what it moved, ` +
      `and commit ${FLOORS_FILE}.`
    );
  return undefined;
}
