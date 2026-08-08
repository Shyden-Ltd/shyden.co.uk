import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, BASE_URL_AWARE_APIS } from './fixtures';

// This file's own path, relative to the repo root -- excluded from the scan below. The guard
// necessarily talks ABOUT the APIs it looks for (see BASE_URL_AWARE_APIS's `reason` strings,
// which name them); excluding itself means that talk never has to dodge its own detection
// patterns by careful wording elsewhere in this file.
const SELF = join('tests', 'e2e', 'baseurl-guard.spec.ts');

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

test('every baseURL-aware API call on a relative literal is one the device fixtures actually resolve', () => {
  const files = SCAN_DIRS.flatMap(listSourceFiles).filter((file) => file !== SELF);

  // A silent guard that scanned zero files would pass for the wrong reason -- prove the walk
  // actually found the suite before trusting it found nothing wrong with the suite.
  expect(
    files.length,
    `expected to find .ts files under ${SCAN_DIRS.join(', ')}; found none, which means this ` +
      "guard's own file-walk is broken, not that the suite has nothing to check"
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
            'page.request.* are patched, then flip its BASE_URL_AWARE_APIS row to resolved: true.'
        );
      }
    }
  }

  expect(findings, findings.join('\n')).toEqual([]);
});
