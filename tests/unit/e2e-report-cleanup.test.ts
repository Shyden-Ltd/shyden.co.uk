import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `scripts/test-e2e.mjs` cleans up the report it keeps for itself (#390).
 *
 * The report of a run with no `EVIDENCE_DIR` lands in a temp directory that
 * nothing but the reconciliation reads. Its removal sat in a `finally` around
 * code that ends in `process.exit()`, which ends the process without running
 * any `finally`: every run left its directory behind, 739 of them in one
 * session's `$TMPDIR`, each holding a whole report after a real run.
 *
 * `npx` is a stand-in that lists three tests and runs none, so the script
 * reaches its no-report refusal in milliseconds; `TMPDIR` is a scratch
 * directory, so what the run leaves there is all it left.
 */

const SCRIPT = path.resolve(import.meta.dirname, '../../scripts/test-e2e.mjs');

const NPX = `#!/bin/sh
if [ "$3" = "--list" ]; then printf '%s\\n' 'Total: 3 tests in 1 file'; exit 0; fi
exit 1
`;

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'e2e-cleanup-'));
  mkdirSync(path.join(dir, 'bin'));
  mkdirSync(path.join(dir, 'tmp'));
  writeFileSync(path.join(dir, 'bin', 'npx'), NPX);
  chmodSync(path.join(dir, 'bin', 'npx'), 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${path.join(dir, 'bin')}:/bin:/usr/bin`,
      TMPDIR: path.join(dir, 'tmp'),
      ...env,
    },
  });

describe('the report a run keeps for itself (#390)', () => {
  it('is removed when the run ends, even by a refusal', () => {
    const result = run();
    const own = path.join(dir, 'tmp', `e2e-reconcile-${result.pid}`);
    // The refusal names the report it could not read, which is the proof the
    // run used this directory: its absence below is then a removal.
    expect(result.stderr).toContain('E2E RECONCILIATION FAILED');
    expect(result.stderr).toContain(own);
    expect(result.status).toBe(1);
    expect(existsSync(own)).toBe(false);
  });

  it("leaves an evidence directory alone, which is the operator's", () => {
    const evidence = path.join(dir, 'evidence');
    const result = run({ EVIDENCE_DIR: evidence });
    expect(result.status).toBe(1);
    expect(existsSync(evidence)).toBe(true);
  });
});
