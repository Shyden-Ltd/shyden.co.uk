import { parseDocument } from 'yaml';
import { stringLeaves } from './catalogue-leaves';
import { withoutCommentLines } from './unit/source-text';

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
  /**
   * The runner labels the job asks for. `runs-on:` may be a single label or a
   * list of them and both mean the same thing to the runner, so both arrive
   * here as a list -- a guard reading this cannot be satisfied by whichever
   * spelling a workflow happens to use (#244).
   */
  readonly runsOn: readonly string[];
  /**
   * The environment the job names; `undefined` when it names none. A job in
   * an environment reads that environment's secrets. A job in none reads
   * repository secrets, which reach a workflow on any branch (#241).
   */
  readonly environment: string | undefined;
  /**
   * Every secret the job reads through an expression, the workflow's own
   * `env:` included, since each job reads that too. Names are upper-cased,
   * because secret names are case-insensitive, then de-duplicated and sorted.
   */
  readonly secrets: readonly string[];
}

const isMapping = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const withoutStringLiterals = (condition: string): string =>
  condition.replace(/'(?:[^']|'')*'/g, "''");

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

/**
 * The runner labels a job asks for, normalised to a list.
 *
 * FAILS CLOSED on anything else. A job with no `runs-on` cannot run at all,
 * and the mapping form (`group:`/`labels:`) is a runner-group request this
 * repository does not use -- reading either as an empty list would make an
 * absence assertion over the labels green without a label having been read,
 * which is the one failure this guard exists to prevent (#118).
 */
function runsOnOf(job: Record<string, unknown>, where: string): string[] {
  const value = job['runs-on'];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value))
    return value.map((label: unknown, index) => {
      if (typeof label !== 'string')
        throw new Error(`${where}: runs-on label ${index + 1} is not a string`);
      return label;
    });
  throw new Error(`${where} declares no runs-on as a label or list of labels`);
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

function environmentOf(
  job: Record<string, unknown>,
  where: string,
): string | undefined {
  const { environment } = job;
  if (environment === undefined) return undefined;
  const name = isMapping(environment) ? environment.name : environment;
  if (typeof name !== 'string' || name.trim() === '')
    throw new Error(`${where}: environment names no environment`);
  if (name.includes('${{'))
    throw new Error(
      `${where}: environment is an expression, which only the runner can resolve`,
    );
  return name;
}

const EXPRESSION = /\$\{\{([\s\S]*?)\}\}/g;
const BRACKETED_SECRET = /(?<![\w.])secrets\s*\[\s*'((?:[^']|'')*)'\s*\]/gi;
const DOTTED_SECRET = /(?<![\w.])secrets\s*\.\s*([A-Za-z_]\w*)/gi;
const SECRETS_CONTEXT = /(?<![\w.])secrets(?!\w)/i;

/**
 * The secrets `value` reads through its `${{ }}` expressions.
 *
 * The runner expands an expression wherever it sits in a string, including a
 * shell comment in a `run:` script, so every one counts. Text outside an
 * expression reads nothing, and neither does a string literal inside one. A
 * reference to the whole context is refused, because it hands over every
 * secret and leaves no name to judge.
 */
function secretsReadIn(value: unknown, where: string): string[] {
  return stringLeaves(value).flatMap(([, text]) =>
    [...text.matchAll(EXPRESSION)].flatMap(([, expression]) => {
      const bracketed = [...expression.matchAll(BRACKETED_SECRET)].map(
        ([, name]) => name,
      );
      const rest = withoutStringLiterals(
        expression.replace(BRACKETED_SECRET, "''"),
      );
      const dotted = [...rest.matchAll(DOTTED_SECRET)].map(([, name]) => name);
      if (SECRETS_CONTEXT.test(rest.replace(DOTTED_SECRET, '')))
        throw new Error(`${where} reads every secret: name each one it needs`);
      return [...bracketed, ...dotted].map((name) => name.toUpperCase());
    }),
  );
}

function secretsOf(
  job: Record<string, unknown>,
  shared: readonly string[],
  where: string,
): string[] {
  if (job.secrets === 'inherit')
    throw new Error(`${where} reads every secret: name each one it needs`);
  return [...new Set([...shared, ...secretsReadIn(job, where)])].sort();
}

/**
 * A YAML file's value, refusing YAML the parser only WARNS about.
 *
 * `if: !cancelled() && …` is the case in point: a plain scalar starting with
 * `!` is a YAML tag, so the expression the author wrote is not the value the
 * runner reads. A guard that judged the parser's best effort would judge a
 * condition nobody wrote. The Dependabot config's guards read through here
 * too (`supply-chain.test.ts`).
 */
export function parseCleanYaml(text: string, file: string): unknown {
  const doc = parseDocument(text);
  const problems = [...doc.errors, ...doc.warnings];
  if (problems.length > 0)
    throw new Error(
      `${file} is not clean YAML: ${problems.map((p) => p.message).join('; ')}`,
    );
  return doc.toJS();
}

/** Every job in a workflow, in file order. */
export function workflowJobs(text: string, file: string): WorkflowJob[] {
  const root = parseCleanYaml(text, file);
  const jobs = isMapping(root) ? root.jobs : undefined;
  if (!isMapping(jobs)) throw new Error(`${file} has no jobs mapping`);
  const shared = secretsReadIn(
    isMapping(root) ? root.env : undefined,
    `${file}'s env`,
  );
  return Object.entries(jobs).map(([id, body]) => {
    const where = `${file} job '${id}'`;
    if (!isMapping(body)) throw new Error(`${where} is not a mapping`);
    return {
      id,
      needs: needsOf(body, where),
      condition: conditionOf(body, where),
      timeoutMinutes: timeoutMinutesOf(body, where),
      runs: runsOf(body, where),
      runsOn: runsOnOf(body, where),
      environment: environmentOf(body, where),
      secrets: secretsOf(body, shared, where),
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

/** A commit status posted through the API: the `-f context=<name>` it sends. */
const POSTED_STATUS = /-f\s+context=(\S+)/g;

/**
 * Every context `required_status_checks.contexts` could match for one
 * workflow, derived rather than listed.
 *
 * TWO SPECIES, and a guard knowing only the first would call `dev-verified`
 * unproducible while `main`'s protection requires it. A CHECK RUN is named
 * after the job's `name:`, falling back to the job id when it declares none.
 * A COMMIT STATUS is posted by a script and named in the call that posts it.
 *
 * An ordinary job carries NO `workflow / job` prefix — that spelling belongs
 * to required workflows and reusable calls. Requiring it here adds a context
 * nothing can ever report, so every pull request hangs waiting for a check
 * its base cannot produce, repairable only by an administrator (#284).
 */
export function producibleContexts(text: string, file: string): string[] {
  const root = parseCleanYaml(text, file);
  const jobs = isMapping(root) ? root.jobs : undefined;
  if (!isMapping(jobs)) throw new Error(`${file} has no jobs mapping`);

  const contexts = Object.entries(jobs).map(([id, body]) => {
    const declared = isMapping(body) ? body.name : undefined;
    return typeof declared === 'string' ? declared : id;
  });

  // The PARSED scripts, shell comments stripped. A `#` line inside a `run:`
  // block is script text the YAML parser keeps rather than a YAML comment it
  // drops, so a commented-out status post would otherwise widen this set and
  // soften every guard that reads it.
  for (const job of workflowJobs(text, file))
    for (const run of job.runs)
      for (const [, context] of withoutCommentLines(run).matchAll(
        POSTED_STATUS,
      ))
        contexts.push(context);

  return contexts;
}
