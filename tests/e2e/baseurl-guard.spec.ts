import { readFileSync } from 'node:fs';
import { specDirs } from '../spec-dirs';
import { join } from 'node:path';
import { test, expect, BASE_URL_AWARE_APIS } from './fixtures';
import { searched, tsFilesUnder } from '../source-files';

// This file's own path, relative to the repo root -- excluded from the scan below. The guard
// necessarily talks ABOUT the APIs it looks for (see BASE_URL_AWARE_APIS's `reason` strings,
// which name them); excluding itself means that talk never has to dodge its own detection
// patterns by careful wording elsewhere in this file.
const SELF = join('tests', 'e2e', 'baseurl-guard.spec.ts');

const SCAN_DIRS = specDirs();

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

test('every baseURL-aware API call on a relative literal is one the device fixtures actually resolve', () => {
  const files = SCAN_DIRS.flatMap(tsFilesUnder).filter((file) => file !== SELF);

  // `tsFilesUnder` proves its own result non-empty (#84), so the sibling
  // copies of this check are gone. This one survives for a reason the
  // collector cannot see: the list is NARROWED afterwards, by filtering out
  // SELF, and a collector has no view of a filter its caller applies.
  expect(
    files.length,
    `every .ts file under ${SCAN_DIRS.join(', ')} is this spec itself, so the ` +
      'scan below has nothing left to check',
  ).toBeGreaterThan(0);

  const unresolved = BASE_URL_AWARE_APIS.filter((entry) => !entry.resolved);
  const findings: string[] = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const { api, pattern, reason } of unresolved) {
      pattern.lastIndex = 0; // shared, `g`-flagged regex -- reset before reusing on new text
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) {
        findings.push(
          `${file}:${lineNumberAt(text, match.index)} calls \`${api}(...)\` with a ` +
            `relative-looking literal, but ${api} is not patched to resolve baseURL on the ` +
            `real-device path (${reason}). Fix: pass an absolute URL, or patch ${api} in ` +
            "tests/e2e/fixtures.ts's page/context fixture the same way page.goto and " +
            'page.request.* are patched, then flip its BASE_URL_AWARE_APIS row to resolved: true.',
        );
      }
    }
  }

  expect(
    searched(findings, { of: files, what: 'spec files scanned' }),
    findings.join('\n'),
  ).toEqual([]);
});
