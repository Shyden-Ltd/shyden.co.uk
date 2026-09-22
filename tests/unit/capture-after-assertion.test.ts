import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { specDirs } from '../spec-dirs';
import { searched, tsFilesUnder } from '../source-files';
import { blankCommentLines } from './source-text';
import { expectNothingFound, type Analyze } from './spec-scan';

/**
 * An evidence capture belongs AFTER the assertion it documents (#261).
 *
 * `tests/e2e/evidence.ts` builds `shoot` on one property, and the evidence
 * page prints that property to the operator in words
 * (`scripts/build-evidence-page.mjs`): "Playwright stops a test at its first
 * failed expectation, so a present image IS the result."
 *
 * That sentence is only true while every capture sits below the assertion it
 * claims to document. A capture taken FIRST photographs the page whether the
 * assertion goes on to pass or fail, and the picture still reaches the page
 * under a caption telling the operator its presence is the proof. The run's
 * status dot marks the test failed, so it is not invisible -- but a picture
 * that looks like proof and is not is the exact failure `evidence.ts` opens
 * by warning about, and it is worse than no picture at all.
 *
 * Two captures shipped that way, both added by the ticket that asked for
 * them: `classroom-groups-print.spec.ts` shot the register above the only
 * `expect` in its test, in the two tests that decide which columns reach
 * paper. Nothing could see it -- the suite was green, because the ordering
 * changes no verdict.
 *
 * What counts as an assertion is a CONSTRUCT question, not a string one. A
 * first cut of this scan matched the literal `expect(` token and reported
 * `homepage.spec.ts`'s overflow capture, whose assertion is
 * `expectNoHorizontalScroll(page)` -- real, and behind a helper. Reporting a
 * correct site is not a harmless false alarm: it is how a guard gets widened
 * around the code it flagged until it stops meaning anything (#118). So an
 * assertion here is any call named `expect` or `expectSomething`, wherever it
 * is reached from, which covers `reported.expectNone(...)` as well.
 *
 * The boundary resets at each `test(`/`test.describe(` AND at each capture, so
 * the ordinary journey rhythm -- assert, shoot, assert, shoot -- passes, while
 * a second capture leaning on the first one's assertion does not.
 *
 * Comments are blanked rather than removed so a finding can name its line, and
 * so this file's own prose cannot satisfy the scan it describes.
 */

/** `test(`, `test.describe(`, `test.beforeEach(` -- a new scope begins. */
const SCOPE = /^\s*test(?:\.\w+)?\s*\(/;

/** `expect(`, `expectNoHorizontalScroll(`, `reported.expectNone(`. */
const ASSERTION = /\bexpect(?:[A-Z]\w*)?\s*\(|\btoHaveScreenshot\s*\(/;

/** The capture call itself, never its definition (`const shoot = async (`). */
const CAPTURE = /\bshoot\s*\(/;

const capturesBeforeAssertion: Analyze = (file, source) => {
  const findings: string[] = [];
  let asserted = false;

  blankCommentLines(source)
    .split('\n')
    .forEach((line, index) => {
      if (SCOPE.test(line)) asserted = false;
      if (ASSERTION.test(line)) asserted = true;
      if (CAPTURE.test(line)) {
        if (!asserted) {
          findings.push(
            `${file}:${index + 1} — shoot() runs before anything is asserted, ` +
              `so a present image is not the result`,
          );
        }
        asserted = false;
      }
    });

  return findings;
};

/**
 * Every capture site the scan above can see, as `file:line`.
 *
 * The liveness control for this guard, and it is a different question from the
 * one `expectNothingFound` already answers. That control proves FILES were
 * scanned; it cannot notice that `shoot` was renamed, which would leave the
 * scan matching nothing and reporting a clean tree forever. #112 is the
 * precedent: the guard written to remove a vacuity class carried that class
 * itself, because its own control was never mutated.
 */
const capturesSeen = (): string[] =>
  specDirs()
    .flatMap(tsFilesUnder)
    .flatMap((file) =>
      blankCommentLines(readFileSync(file, 'utf8'))
        .split('\n')
        .flatMap((line, index) =>
          CAPTURE.test(line) ? [`${file}:${index + 1}`] : [],
        ),
    );

describe('an evidence capture documents an assertion that already passed', () => {
  it('never runs before the assertion it claims to document', () => {
    expectNothingFound(capturesBeforeAssertion);
  });

  it('is reading real captures, so a clean scan means something', () => {
    const captures = capturesSeen();
    expect(
      searched(captures, {
        of: captures,
        what: 'evidence captures in the spec directories',
      }),
    ).not.toEqual([]);
  });
});
