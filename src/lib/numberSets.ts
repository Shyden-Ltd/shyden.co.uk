import { MAX_STUDENTS } from './grouping';

/**
 * One of the three number fields beside "Number of students" (#188), turned
 * into sets of register numbers.
 *
 * `absent` is a flat list of numbers; `pairing` is what "keep these two
 * together" and "keep these two apart" both are, where a SET is the unit.
 * The two share one parser because the typing is identical -- only the
 * "a set of one is meaningless" rule differs (AC5).
 */
export type NumberSetsKind = 'absent' | 'pairing';

export interface NumberSetsOptions {
  /** What `#cg-count` currently holds: the highest number a teacher may name. */
  count: number;
  kind: NumberSetsKind;
}

/**
 * Why a field was refused, and the text that caused it -- spelled exactly as
 * the teacher typed it, so the page can drop it into the sentence without
 * re-deriving it. The same contract `Problem.students` keeps in roster.ts:
 * the caller resolves copy, the pure module resolves facts.
 *
 * `aboveCount` and `aboveMaximum` are deliberately NOT one code. They name
 * the same shape of mistake and need different remedies -- "you typed 25
 * students" versus "this page cannot go above MAX_STUDENTS at all" -- and
 * en.ts already keeps three separate sentences for the size limits for
 * exactly this reason.
 */
export type NumberSetsProblemKind =
  'notAWholeNumber' | 'aboveCount' | 'aboveMaximum' | 'duplicate' | 'lonelySet';

export interface NumberSetsProblem {
  kind: NumberSetsProblemKind;
  text: string;
}

export interface NumberSetsResult {
  /**
   * Comma joins a set, semicolon starts a new one (operator, 2026-09-16):
   * `3,9; 14,15` is two independent units, not one of four.
   *
   * EMPTY whenever `problem` is set. A field that is half-read is the worst
   * of both: it would group on some of what was typed while the page says
   * it refused the rest.
   */
  sets: number[][];
  problem: NumberSetsProblem | null;
}

/**
 * Split on a separator, trim every piece, and drop the empty ones a trailing
 * or doubled separator leaves behind (AC2) -- shared by both levels so the
 * two cannot drift apart on what "empty" means.
 */
const pieces = (text: string, separator: string): string[] =>
  text
    .split(separator)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '');

/**
 * Digits only. `Number` is far too generous for a register number: it reads
 * `''` as 0, `' 7 '` as 7 and `0x10` as 16, so testing the TEXT is what
 * keeps `-3` and `2.5` refusals rather than silent conversions.
 */
const WHOLE_NUMBER = /^[0-9]+$/;

/**
 * One field's text, read left to right, stopping at the FIRST thing wrong.
 * A teacher fixes that, re-reads, and is told about the next -- never handed
 * a list to triage.
 */
export const parseNumberSets = (
  text: string,
  { count, kind }: NumberSetsOptions,
): NumberSetsResult => {
  const refuse = (
    problemKind: NumberSetsProblemKind,
    offending: string,
  ): NumberSetsResult => ({
    sets: [],
    problem: { kind: problemKind, text: offending },
  });

  const sets: number[][] = [];
  // Across the WHOLE field, not per set: `3,9; 9,14` asks for 9 to be in two
  // different units at once, which is the same mistake as typing it twice in
  // one -- and the roster refuses a repeated number rather than quietly
  // de-duplicating it (`rosterProblems`, roster.ts).
  const seen = new Set<number>();

  for (const setText of pieces(text, ';')) {
    const numbers: number[] = [];
    for (const member of pieces(setText, ',')) {
      if (!WHOLE_NUMBER.test(member)) return refuse('notAWholeNumber', member);
      const number = Number(member);
      if (number < 1) return refuse('notAWholeNumber', member);
      if (number > MAX_STUDENTS) return refuse('aboveMaximum', member);
      if (number > count) return refuse('aboveCount', member);
      if (seen.has(number)) return refuse('duplicate', member);
      seen.add(number);
      numbers.push(number);
    }
    // AC5. Checked after the members, so `3` in a pairing field is reported
    // as the lonely set it is rather than passing validation and vanishing.
    if (kind === 'pairing' && numbers.length < 2) {
      return refuse('lonelySet', setText);
    }
    sets.push(numbers);
  }

  return { sets, problem: null };
};
