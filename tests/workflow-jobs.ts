import { parseDocument } from 'yaml';

/**
 * The job graph of a GitHub Actions workflow, PARSED.
 *
 * Most workflow guards in this repo ask whether a filename or a job name
 * APPEARS, which comment-stripped text answers exactly. The question here is
 * structural — which job needs which, and what a condition says once YAML has
 * dropped comments, unfolded `>-` blocks and resolved quoting — and line
 * matching cannot answer it: a trailing `# !cancelled()` is a comment to the
 * runner and a match to a regex. `yaml` was declared for exactly this, by
 * operator decision (2026-09-13, #157); the small-tree rule otherwise stands.
 */
export interface WorkflowJob {
  readonly id: string;
  readonly needs: readonly string[];
  /** The job-level `if:`, unwrapped from `${{ }}`; `undefined` when absent. */
  readonly condition: string | undefined;
  /**
   * The job's OWN `timeout-minutes`; `undefined` when absent, which the runner
   * reads as its default. A step's budget is not the job's: a step can declare
   * one while the job around it runs unbounded.
   */
  readonly timeoutMinutes: number | undefined;
  /** Each step's `run:` script, in file order; a `uses:` step runs none. */
  readonly runs: readonly string[];
}

const isMapping = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function needsOf(job: Record<string, unknown>, where: string): string[] {
  const { needs } = job;
  if (needs === undefined) return [];
  if (typeof needs === 'string') return [needs];
  if (Array.isArray(needs) && needs.every((need) => typeof need === 'string'))
    return needs;
  throw new Error(`${where}: needs is neither a job id nor a list of job ids`);
}

function conditionOf(
  job: Record<string, unknown>,
  where: string,
): string | undefined {
  const condition = job.if;
  if (condition === undefined) return undefined;
  if (typeof condition === 'boolean') return String(condition);
  if (typeof condition !== 'string')
    throw new Error(`${where}: if is neither an expression nor a boolean`);
  return condition
    .trim()
    .replace(/^\$\{\{([\s\S]*)\}\}$/, '$1')
    .trim();
}

function timeoutMinutesOf(
  job: Record<string, unknown>,
  where: string,
): number | undefined {
  const budget = job['timeout-minutes'];
  if (budget === undefined) return undefined;
  if (typeof budget !== 'number')
    throw new Error(`${where}: timeout-minutes is not a number of minutes`);
  return budget;
}

function runsOf(job: Record<string, unknown>, where: string): string[] {
  const { steps } = job;
  if (steps === undefined) return [];
  if (!Array.isArray(steps)) throw new Error(`${where}: steps is not a list`);
  return steps.flatMap((step: unknown, index) => {
    const which = `${where}: step ${index + 1}`;
    if (!isMapping(step)) throw new Error(`${which} is not a mapping`);
    if (step.run === undefined) return [];
    if (typeof step.run !== 'string')
      throw new Error(`${which}'s run is not a script`);
    return [step.run];
  });
}

/**
 * Every job in a workflow, in file order.
 *
 * Refuses YAML the parser only WARNS about. `if: !cancelled() && …` is the
 * case in point: a plain scalar starting with `!` is a YAML tag, so the
 * expression the author wrote is not the value the runner reads. A guard that
 * judged the parser's best effort would judge a condition nobody wrote.
 */
export function workflowJobs(text: string, file: string): WorkflowJob[] {
  const doc = parseDocument(text);
  const problems = [...doc.errors, ...doc.warnings];
  if (problems.length > 0)
    throw new Error(
      `${file} is not clean YAML: ${problems.map((p) => p.message).join('; ')}`,
    );
  const root: unknown = doc.toJS();
  const jobs = isMapping(root) ? root.jobs : undefined;
  if (!isMapping(jobs)) throw new Error(`${file} has no jobs mapping`);
  return Object.entries(jobs).map(([id, body]) => {
    const where = `${file} job '${id}'`;
    if (!isMapping(body)) throw new Error(`${where} is not a mapping`);
    return {
      id,
      needs: needsOf(body, where),
      condition: conditionOf(body, where),
      timeoutMinutes: timeoutMinutesOf(body, where),
      runs: runsOf(body, where),
    };
  });
}

/** What the runner gives a job that declares no `timeout-minutes` of its own. */
export const RUNNER_DEFAULT_TIMEOUT_MINUTES = 360;

/**
 * A finding for every job the runner would let hang for its default budget.
 *
 * Absent is 360 minutes of a hung runner, and so is 360 written out. Zero, a
 * negative or a fraction is no budget the runner documents, so it is reported
 * rather than trusted as a bound (#157).
 */
export function unboundedJobFindings(jobs: readonly WorkflowJob[]): string[] {
  const ceiling = RUNNER_DEFAULT_TIMEOUT_MINUTES - 1;
  return jobs.flatMap(({ id, timeoutMinutes }) => {
    if (timeoutMinutes === undefined)
      return [
        `${id} declares no timeout-minutes, so the runner gives it ${RUNNER_DEFAULT_TIMEOUT_MINUTES} minutes`,
      ];
    const bounded =
      Number.isInteger(timeoutMinutes) &&
      timeoutMinutes >= 1 &&
      timeoutMinutes <= ceiling;
    return bounded
      ? []
      : [
          `${id}'s timeout-minutes of ${timeoutMinutes} is not a whole number of minutes from 1 to ${ceiling}`,
        ];
  });
}

/**
 * Status functions that REPLACE the `success()` the runner adds to any
 * condition naming none of them. `success()` itself is not one: it is the
 * very check a skipped upstream job makes false.
 */
const REPLACES_IMPLICIT_SUCCESS =
  /(?<![\w.])(?:always|cancelled|failure)\(\s*\)/;
const CALLS_SUCCESS = /(?<![\w.])success\(\s*\)/;

/** A condition with its string literals emptied, so `'always()'` is no call. */
const withoutStringLiterals = (condition: string): string =>
  condition.replace(/'(?:[^']|'')*'/g, "''");

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const requiresSuccessOf = (condition: string, need: string): boolean =>
  new RegExp(
    String.raw`needs\.${escapeRegExp(need)}\.result\s*==\s*'success'`,
  ).test(condition);

/** The jobs upstream of `job`, transitively, that declare a condition. */
function conditionalAncestors(
  job: WorkflowJob,
  byId: ReadonlyMap<string, WorkflowJob>,
): string[] {
  const seen = new Set<string>();
  const conditional: string[] = [];
  const visit = (id: string, from: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const upstream = byId.get(id);
    if (upstream === undefined)
      throw new Error(
        `job '${from}' needs '${id}', which the workflow does not define`,
      );
    if (upstream.condition !== undefined) conditional.push(id);
    upstream.needs.forEach((need) => visit(need, id));
  };
  job.needs.forEach((need) => visit(need, job.id));
  return conditional;
}

export interface DownstreamJob {
  readonly job: WorkflowJob;
  /** The conditional jobs upstream of it, any one of which may be skipped. */
  readonly skippable: readonly string[];
}

/**
 * The jobs a skipped upstream job can silently take down with it (#157).
 *
 * A job whose condition calls no status function carries an implicit
 * `success()`, and the runner judges it over EVERY job upstream, not only the
 * ones it names in `needs`. Measured, not read: run 34742940098 skipped
 * `verify-dev` although its only need, `deploy-dev`, had succeeded — because
 * `deploy-dev` needs two gates, and one of them is skipped by design.
 */
export function jobsDownstreamOfAConditionalJob(
  jobs: readonly WorkflowJob[],
): DownstreamJob[] {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  return jobs
    .map((job) => ({ job, skippable: conditionalAncestors(job, byId) }))
    .filter(({ skippable }) => skippable.length > 0);
}

/**
 * Why each job downstream of a conditional job could be wrongly skipped, or
 * could run when it should not. Empty only when every such job states a
 * condition that (a) replaces the implicit `success()` and (b) still requires
 * each job it needs to have SUCCEEDED — without (b), `!cancelled()` alone
 * would verify a deploy that never happened.
 */
export function skippedUpstreamFindings(
  jobs: readonly WorkflowJob[],
): string[] {
  return jobsDownstreamOfAConditionalJob(jobs).flatMap(({ job, skippable }) => {
    const upstream = skippable.join(', ');
    if (job.condition === undefined)
      return [
        `${job.id} declares no if:, so its implicit success() is false whenever ${upstream} is skipped and it never runs`,
      ];
    const calls = withoutStringLiterals(job.condition);
    const findings: string[] = [];
    if (!REPLACES_IMPLICIT_SUCCESS.test(calls))
      findings.push(
        `${job.id}'s if: calls none of always(), cancelled(), failure(), so the runner still adds success(), which a skipped ${upstream} makes false`,
      );
    if (CALLS_SUCCESS.test(calls))
      findings.push(
        `${job.id}'s if: calls success(), which a skipped ${upstream} makes false`,
      );
    for (const need of job.needs)
      if (!requiresSuccessOf(job.condition, need))
        findings.push(
          `${job.id}'s if: never requires needs.${need}.result == 'success', so it can run after ${need} was skipped or failed`,
        );
    return findings;
  });
}
