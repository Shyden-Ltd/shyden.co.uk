import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOOK = '.githooks/commit-msg';

/** Runs the real hook against a real message file, as git would. */
function runHook(message: string): { ok: boolean; output: string } {
  const file = join(
    mkdtempSync(join(tmpdir(), 'commit-msg-')),
    'COMMIT_EDITMSG',
  );
  writeFileSync(file, message);
  try {
    execFileSync(HOOK, [file], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('the commit-msg hook stops a negated closing keyword', () => {
  it('rejects the exact message that closed #44', () => {
    // Verbatim from 983fb7e. GitHub read `CLOSE #44` inside it and closed the
    // issue the sentence was written to keep open.
    const { ok, output } = runHook(
      'chore: measure e2e timings\n\nDOES NOT CLOSE #44. This is the measurement the ticket requires first.\n',
    );
    expect(ok).toBe(false);
    expect(output).toContain('Refs #');
  });

  it('rejects the lower-case variant, and `without`/`never` too', () => {
    for (const phrase of [
      'Does not close #44',
      'this does not fix #12',
      'merged without resolving #7',
      'never closes #3',
    ]) {
      // Asserting the REASON, not just the rejection: with no hook at all
      // `execFileSync` throws ENOENT and every "rejects" case passes on
      // nothing. That is the same vacuity this repo keeps finding.
      const { ok, output } = runHook(`feat: x\n\n${phrase}\n`);
      expect(ok).toBe(false);
      expect(output).toContain('Refs #');
    }
  });

  it('accepts a real closing keyword', () => {
    expect(runHook('feat: x\n\nCloses #65\n').ok).toBe(true);
  });

  it('accepts the phrasing it tells you to use', () => {
    expect(runHook('feat: x\n\nRefs #44 — the ticket stays open.\n').ok).toBe(
      true,
    );
  });

  it('accepts a message with no issue reference at all', () => {
    expect(runHook('docs: tidy a comment\n').ok).toBe(true);
  });
});
