/**
 * Record the guards' liveness floors (#468): `npm run floors:record`.
 *
 * Runs the unit suite with `FLOORS_RECORD` set, so every `floorBreach` call
 * writes the count it saw instead of judging it (`tests/floors.ts`), then
 * raises `tests/floors.json` to match. It checks EVERYTHING before writing
 * anything, and refuses the whole record when:
 *
 * - a figure would FALL. A falling count is what a blind reader looks like,
 *   and so is a corpus that really shrank; only a person can tell the two
 *   apart, so a fall is a hand edit with the reason in the commit;
 * - a recorded id was asserted by no test, so the file names a floor that no
 *   longer exists (or a run that did not reach it);
 * - one id was asserted from two places, or read two values: two guards
 *   sharing a figure would let either go blind behind the other;
 * - the run itself failed.
 *
 * CI never records, for the reason CI never passes `--update-snapshots`: a
 * run that can rewrite the figure it checks against asserts nothing.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { die } from './errors.mjs';

const FLOORS_FILE = 'tests/floors.json';

/**
 * @typedef {{ id: string, actual: number, site: string }} Observation
 */

/**
 * The next figures, and every reason not to write them. The caller writes
 * `next` only when `refusals` is empty.
 *
 * @param {Readonly<Record<string, number>>} recorded
 * @param {readonly Observation[]} seen
 * @returns {{ next: Record<string, number>, refusals: string[] }}
 */
export const decideRecord = (recorded, seen) => {
  /** @type {Map<string, Observation[]>} */
  const byId = new Map();
  for (const observation of seen)
    byId.set(observation.id, [
      ...(byId.get(observation.id) ?? []),
      observation,
    ]);

  /** @type {Record<string, number>} */
  const next = { ...recorded };
  /** @type {string[]} */
  const refusals = [];
  for (const [id, observations] of byId) {
    const sites = [...new Set(observations.map(({ site }) => site))];
    const values = [...new Set(observations.map(({ actual }) => actual))];
    if (sites.length > 1) {
      refusals.push(`${id} is asserted from two places: ${sites.join(', ')}`);
      continue;
    }
    if (values.length > 1) {
      refusals.push(`${id} read two different values: ${values.join(', ')}`);
      continue;
    }
    const [actual] = values;
    const measured = recorded[id];
    if (measured !== undefined && actual < measured) {
      refusals.push(
        `${id} would fall from ${measured} to ${actual}: a blind reader looks ` +
          `like this. If the corpus really shrank, lower it in ${FLOORS_FILE} ` +
          `by hand and say why in the commit.`,
      );
      continue;
    }
    next[id] = actual;
  }
  for (const id of Object.keys(recorded))
    if (!byId.has(id))
      refusals.push(
        `${id} is recorded but no test asserted it: remove it from ` +
          `${FLOORS_FILE} with the floor that used it, or run the whole suite`,
      );
  return { next, refusals };
};

/**
 * One line per figure that moved, largest move first: `id: 100 -> 125 (+25)`,
 * or `id: new, 3`.
 *
 * Printed because a raise is accepted on its direction alone. A change that
 * adds five units and quietly makes the reader miss three records +2, and
 * nothing goes red; only a person reading each delta against the diff that
 * caused it can see that (operator, 2026-10-03). A guard with an independent
 * cross-check (#469) catches it mechanically; until every guard has one, the
 * delta is what gets read.
 *
 * @param {Readonly<Record<string, number>>} recorded
 * @param {Readonly<Record<string, number>>} next
 * @returns {string[]}
 */
export const describeMoves = (recorded, next) =>
  Object.keys(next)
    .filter((id) => next[id] !== recorded[id])
    .map((id) => ({ id, delta: next[id] - (recorded[id] ?? 0) }))
    .sort((a, b) => b.delta - a.delta || (a.id < b.id ? -1 : 1))
    .map(({ id }) =>
      recorded[id] === undefined
        ? `${id}: new, ${next[id]}`
        : `${id}: ${recorded[id]} -> ${next[id]} (+${next[id] - recorded[id]})`,
    );

/**
 * The file's text: ids sorted, two-space indented, a final newline, which is
 * also what prettier writes, so a record never leaves the tree unformatted.
 *
 * @param {Readonly<Record<string, number>>} floors
 * @returns {string}
 */
export const floorsText = (floors) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(floors).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
    null,
    2,
  ) + '\n';

/**
 * @returns {void}
 */
const main = () => {
  if (env.CI) die('CI never records floors: run npm run floors:record locally');

  /** @type {Readonly<Record<string, number>>} */
  const recorded = existsSync(FLOORS_FILE)
    ? JSON.parse(readFileSync(FLOORS_FILE, 'utf8'))
    : {};

  // Collected inside the try and judged after it: `die` exits at once, which
  // skips any `finally` still pending, and the scratch directory would leak.
  const dir = mkdtempSync(join(tmpdir(), 'floors-record-'));
  /** @type {number | null} */
  let status;
  /** @type {Observation[]} */
  let seen = [];
  try {
    const record = join(dir, 'seen.jsonl');
    status = spawnSync('npx', ['vitest', 'run'], {
      stdio: 'inherit',
      env: { ...env, FLOORS_RECORD: record },
    }).status;
    if (existsSync(record))
      seen = readFileSync(record, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (status !== 0)
    die(
      `the unit suite failed in record mode (exit ${status}): nothing recorded`,
    );
  const { next, refusals } = decideRecord(recorded, seen);
  if (refusals.length > 0) die(`nothing recorded:\n  ${refusals.join('\n  ')}`);

  const moves = describeMoves(recorded, next);
  writeFileSync(FLOORS_FILE, floorsText(next));
  console.log(
    moves.length === 0
      ? `${FLOORS_FILE}: every floor already matches (${seen.length} read)`
      : [
          `${FLOORS_FILE}: ${moves.length} floor(s) moved:`,
          ...moves.map((move) => `  ${move}`),
          'Read each one against your diff: a raise smaller than the units you',
          'added is a reader that lost some. Put these lines in the commit.',
        ].join('\n'),
  );
};

// Only when run, never when imported: the unit suite imports the decision.
if (import.meta.main) main();
