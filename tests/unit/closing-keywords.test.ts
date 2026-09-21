import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nonEmpty, searched } from '../source-files';
import { parseCleanYaml, workflowJobs } from '../workflow-jobs';
import { closingKeywordOffences } from '../../scripts/closing-keywords.mjs';

/**
 * The rule: no message may put a closing keyword next to an issue number, for
 * any reason at all.
 *
 * It has fired twice in this repository, and the second time in a form the
 * guard written after the first could not see:
 *
 *   1. `DOES NOT CLOSE #44` (commit 983fb7e) closed #44. GitHub's parser has
 *      no model of negation; it found `CLOSE #44` inside the sentence written
 *      to keep the issue open, and the issue sat closed for a day while every
 *      handover recorded it as deliberately open.
 *   2. `I will close #89 by hand once both are in` (PR #92's body) closed #89
 *      on the merge. That is not a negation, so the guard built for the first
 *      incident matched nothing. A parser has no model of TENSE or INTENT
 *      either: `close #N` is `close #N`.
 *
 * NO EXCEPTION, and that is an operator decision (2026-09-21), taken against
 * the measurement rather than a preference: no closing keyword appears beside
 * an issue number in the last 300 commit bodies or the last 40 pull request
 * bodies. The capability the exception would preserve has never once been
 * used, and an allowance branch nothing exercises is the vacuity this repo
 * keeps finding (#118, #112). An issue is retired with `gh issue close`.
 *
 * Over-refusal is deliberate where the two disagree. `closing #5` is not a
 * keyword GitHub acts on, and it is still refused, because the cost of that
 * is rewording one sentence and the cost of the other direction is an issue
 * closing with an acceptance criterion outstanding.
 */

interface Fixture {
  readonly text: string;
  readonly why: string;
}

/** Messages the guard must refuse, each with the form it represents. */
const REFUSED: readonly Fixture[] = [
  {
    text: 'DOES NOT CLOSE #44. This is the measurement the ticket requires first.',
    why: 'incident 1, verbatim from 983fb7e — the negated form',
  },
  {
    text: 'I will close #89 by hand once both are in',
    why: 'incident 2, verbatim from PR #92 — future intent, which no negation guard sees',
  },
  {
    text: 'this would close #12 if it merged first',
    why: 'the conditional form',
  },
  {
    text: 'Closes #65',
    why: 'a genuine closing keyword — refused too, by operator decision',
  },
  { text: 'Fixes #7', why: 'the fix inflection' },
  { text: 'Resolved #3', why: 'the resolve inflection, past tense' },
  { text: 'merged without resolving #7', why: 'the without form' },
  { text: 'never closes #3', why: 'the never form' },
  { text: 'Closes: #65', why: 'the colon form GitHub also reads' },
  {
    text: 'fixes Shyden-Ltd/shyden.co.uk#12',
    why: 'the cross-repository form',
  },
  { text: 'closes GH-12', why: 'the GH- reference form' },
  {
    text: 'and never write close #7 while explaining this very rule',
    why: 'explaining the rule is how the standing note says it happens',
  },
];

/** Messages the guard must leave alone, each with the reason it is safe. */
const ACCEPTED: readonly Fixture[] = [
  {
    text: 'Refs #44 — the ticket stays open.',
    why: 'the phrasing the refusal tells the author to use',
  },
  { text: 'Refs #227', why: 'a bare reference trailer' },
  { text: 'docs: tidy a comment', why: 'no issue reference at all' },
  {
    text: 'the fix for #157 landed on develop',
    why: 'a keyword and a number in one sentence, but NOT adjacent',
  },
  {
    text: '#65 was closed by hand, as the rule requires',
    why: 'reversed order — GitHub closes on nothing here',
  },
  {
    text: 'renamed the prefix#5 identifier',
    why: 'fix inside a longer word: there is no word boundary before it',
  },
  {
    text: 'affixes #9 to the header',
    why: 'fix inside affixes — the same trap with the number adjacent',
  },
];

describe('the closing-keyword rule, in its one home', () => {
  it.each(REFUSED)('refuses "$text" — $why', ({ text }) => {
    const offences = closingKeywordOffences(text);
    expect(offences).toHaveLength(1);
    expect(offences[0]).toMatchObject({ line: 1, text });
  });

  it('leaves every safe phrasing alone', () => {
    const wrongly = ACCEPTED.filter(
      ({ text }) => closingKeywordOffences(text).length > 0,
    );
    expect(
      searched(wrongly, {
        of: ACCEPTED.map(({ text }) => text),
        what: 'safe phrasings',
      }),
    ).toEqual([]);
  });

  it('reports the line a multi-line message offends on, not the first', () => {
    const body = ['fix(gauntlet): a folder per group', '', 'Closes #230', ''];
    expect(closingKeywordOffences(body.join('\n'))).toEqual([
      { line: 3, text: 'Closes #230' },
    ]);
  });

  it('reports every offending line, not only the first', () => {
    const body = 'Closes #1\nRefs #2\nFixes #3';
    expect(closingKeywordOffences(body).map(({ line }) => line)).toEqual([
      1, 3,
    ]);
  });

  it('reports two offending lines in a row', () => {
    // Not the same case as the one above, and the difference is the point. A
    // `g` flag on the pattern would carry `lastIndex` from one `.test()` to
    // the next, and the fixture above HIDES that: its clean middle line fails
    // to match, which resets `lastIndex` to 0 before the third is judged.
    // Here line 1's match ends at index 9 and line 2 is 8 characters long, so
    // a carried offset starts the search past the end and the second offence
    // is dropped in silence.
    expect(
      closingKeywordOffences('Closes #1\nFixes #2').map(({ line }) => line),
    ).toEqual([1, 2]);
  });

  it('finds nothing in an empty message', () => {
    expect(closingKeywordOffences('')).toEqual([]);
  });
});

/**
 * The command line, which is how BOTH media reach the rule: `.githooks/
 * commit-msg` hands it a message file, and `build-and-test` hands it the pull
 * request body. A script that exits 0 in silence is indistinguishable from
 * one whose entry point never ran, so its refusals are asserted too (#221,
 * #276).
 */
describe('the closing-keyword command line', () => {
  const CLI = 'scripts/closing-keywords.mjs';

  function runCli(args: readonly string[]): { ok: boolean; output: string } {
    try {
      execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe' });
      return { ok: true, output: '' };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string };
      return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  }

  function fileHolding(text: string): string {
    const file = join(mkdtempSync(join(tmpdir(), 'closing-keywords-')), 'MSG');
    writeFileSync(file, text);
    return file;
  }

  it('refuses no argument at all, rather than exiting 0 in silence', () => {
    const { ok, output } = runCli([]);
    expect(ok).toBe(false);
    expect(output).toContain('usage:');
  });

  it('refuses a second file, which would be checked and never reported', () => {
    const { ok, output } = runCli([fileHolding('Refs #1'), 'a label', 'extra']);
    expect(ok).toBe(false);
    expect(output).toContain('usage:');
  });

  it('refuses a file it cannot read, naming the path', () => {
    const { ok, output } = runCli(['does/not/exist']);
    expect(ok).toBe(false);
    expect(output).toContain('does/not/exist');
  });

  it('names the medium it was given, so the author knows what to edit', () => {
    const { ok, output } = runCli([
      fileHolding('I will close #89 by hand once both are in'),
      'this pull request body',
    ]);
    expect(ok).toBe(false);
    expect(output).toContain('this pull request body');
  });

  it('passes a clean file', () => {
    expect(runCli([fileHolding('feat: x\n\nRefs #278\n')]).ok).toBe(true);
  });
});

/**
 * The medium that actually caused the second incident.
 *
 * `gh pr create` runs no git hook, so a pull request body never meets
 * `.githooks/commit-msg` -- and a body is what closed #89. The rule reaches
 * it from CI instead, which is the only place every author passes through.
 *
 * DERIVED, not named. The workflow that carries the check is found by looking
 * for the script, so moving or renaming the file cannot leave this guard
 * quietly passing over a workflow nobody runs (#49, #80).
 */
describe('the rule covers a pull request body, not only a commit message', () => {
  const WORKFLOWS = '.github/workflows';
  const SCRIPT = 'scripts/closing-keywords.mjs';

  interface Trigger {
    readonly on?: { readonly pull_request?: { readonly types?: string[] } };
  }

  /** Every workflow file whose jobs invoke the rule, with its parsed trigger. */
  function workflowsRunningTheRule() {
    const files = nonEmpty(
      readdirSync(WORKFLOWS),
      `workflow files in ${WORKFLOWS}`,
    );
    return files.flatMap((file) => {
      const text = readFileSync(`${WORKFLOWS}/${file}`, 'utf8');
      const jobs = workflowJobs(text, file);
      const runs = jobs.flatMap((job) => job.runs);
      return runs.some((run) => run.includes(SCRIPT))
        ? [{ file, runs, trigger: parseCleanYaml(text, file) as Trigger }]
        : [];
    });
  }

  it('is invoked by exactly one workflow', () => {
    expect(workflowsRunningTheRule().map(({ file }) => file)).toEqual([
      'pr-body.yml',
    ]);
  });

  it('re-runs when the body is EDITED, which is the whole point', () => {
    // Declaring `types:` REPLACES the defaults rather than adding to them, so
    // the three that would otherwise be implied are asserted too: dropping
    // `synchronize` would stop checking a body on every later push, and
    // nothing would go red. An exact set, because both directions matter.
    const [only] = workflowsRunningTheRule();
    expect(only?.trigger.on?.pull_request?.types?.slice().sort()).toEqual([
      'edited',
      'opened',
      'reopened',
      'synchronize',
    ]);
  });

  it('never expands the body into a shell command', () => {
    // A pull request body is written by whoever opened the PR, including on a
    // fork. `${{ github.event.pull_request.body }}` inside a `run:` script is
    // substituted BEFORE the shell sees it, so a body containing a backtick or
    // `$(...)` executes on the runner. It reaches the script through the
    // environment instead, where it is data.
    const [only] = workflowsRunningTheRule();
    const expanded = (only?.runs ?? []).filter((run) =>
      run.includes('github.event.pull_request.body'),
    );
    expect(
      searched(expanded, {
        of: only?.runs ?? [],
        what: `run: scripts in ${only?.file ?? 'no workflow'}`,
      }),
    ).toEqual([]);
  });
});
