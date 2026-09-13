import { describe, it, expect } from 'vitest';
import {
  RUNNER_DEFAULT_TIMEOUT_MINUTES,
  jobsDownstreamOfAConditionalJob,
  skippedUpstreamFindings,
  unboundedJobFindings,
  workflowJobs,
  type WorkflowJob,
} from '../workflow-jobs';
import { searched } from '../source-files';

/**
 * The rule behind the pipeline guard, proved on fixtures before it is trusted
 * on a real workflow (#157).
 *
 * Each case is one way `verify-dev` could be written. The shipped one is run
 * 34742940098: deployed, verify skipped, no `dev-verified`. These fixtures are
 * the mutation matrix kept permanently, so a later edit to the rule that stops
 * seeing one of them goes red here rather than passing a real workflow.
 */

/** release-dev.yml's graph after #159: one of two gates skips on every event. */
const releaseDevShape = (verifyCondition: string): string => `
jobs:
  gate:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
  test:
    if: github.event_name != 'push'
    runs-on: ubuntu-latest
  deploy:
    needs: [gate, test]
    if: >-
      !failure() && !cancelled() &&
      (needs.gate.result == 'success' || needs.test.result == 'success')
    runs-on: ubuntu-latest
  verify:
    needs: deploy
${verifyCondition}    runs-on: ubuntu-latest
`;

const findingsFor = (verifyCondition: string): string[] =>
  skippedUpstreamFindings(
    workflowJobs(releaseDevShape(verifyCondition), 'fixture.yml'),
  );

const NO_STATUS_FUNCTION = /^verify's if: calls none of always\(\)/;

describe('a job downstream of a conditional job states its own condition (#157)', () => {
  it('flags the job as shipped: no condition, so the skipped gate skips it too', () => {
    expect(findingsFor('')).toEqual([
      expect.stringMatching(/^verify declares no if:.*deploy, gate, test/),
    ]);
  });

  it('flags a condition calling no status function, since success() is still added', () => {
    expect(findingsFor("    if: needs.deploy.result == 'success'\n")).toEqual([
      expect.stringMatching(NO_STATUS_FUNCTION),
    ]);
  });

  it('is not satisfied by a status function in a trailing YAML comment', () => {
    expect(
      findingsFor("    if: needs.deploy.result == 'success' # !cancelled()\n"),
    ).toEqual([expect.stringMatching(NO_STATUS_FUNCTION)]);
  });

  it('is not satisfied by a status function inside a string literal', () => {
    expect(
      findingsFor(
        "    if: needs.deploy.result == 'success' && github.event_name != 'always()'\n",
      ),
    ).toEqual([expect.stringMatching(NO_STATUS_FUNCTION)]);
  });

  it('flags an explicit success(), which the skipped gate makes false as well', () => {
    expect(
      findingsFor(
        "    if: ${{ !cancelled() && success() && needs.deploy.result == 'success' }}\n",
      ),
    ).toEqual([expect.stringMatching(/^verify's if: calls success\(\)/)]);
  });

  it('flags a status function alone, which would verify a deploy that never happened', () => {
    expect(findingsFor('    if: ${{ !cancelled() }}\n')).toEqual([
      expect.stringMatching(
        /^verify's if: never requires needs\.deploy\.result == 'success'/,
      ),
    ]);
  });

  it('refuses an unquoted leading !, which YAML reads as a tag, not an expression', () => {
    expect(() =>
      findingsFor("    if: !cancelled() && needs.deploy.result == 'success'\n"),
    ).toThrow(/not clean YAML/);
  });

  it('passes the condition release-dev.yml ships, judged over a live population', () => {
    const jobs = workflowJobs(
      releaseDevShape(
        "    if: >-\n      !cancelled() && needs.deploy.result == 'success'\n",
      ),
      'fixture.yml',
    );
    const downstream = jobsDownstreamOfAConditionalJob(jobs).map(
      ({ job }) => job.id,
    );
    expect(downstream).toEqual(['deploy', 'verify']);
    expect(
      searched(skippedUpstreamFindings(jobs), {
        of: downstream,
        what: 'fixture jobs downstream of a conditional job',
      }),
    ).toEqual([]);
  });

  it('follows a skip through every hop, not only the nearest need', () => {
    const jobs = workflowJobs(
      `
jobs:
  gate:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
  deploy:
    needs:
      - gate
    runs-on: ubuntu-latest
  verify:
    needs: deploy
    runs-on: ubuntu-latest
`,
      'fixture.yml',
    );
    expect(skippedUpstreamFindings(jobs)).toEqual([
      expect.stringMatching(
        /^deploy declares no if:.*whenever gate is skipped/,
      ),
      expect.stringMatching(
        /^verify declares no if:.*whenever gate is skipped/,
      ),
    ]);
  });

  it('leaves a graph with no conditional job alone', () => {
    const jobs = workflowJobs(
      `
jobs:
  deploy:
    runs-on: ubuntu-latest
  verify:
    needs: deploy
    runs-on: ubuntu-latest
`,
      'fixture.yml',
    );
    expect(
      searched(jobsDownstreamOfAConditionalJob(jobs), {
        of: jobs,
        what: 'fixture jobs',
      }),
    ).toEqual([]);
  });

  it('refuses a need naming a job the workflow does not define', () => {
    const jobs = workflowJobs(
      `
jobs:
  verify:
    needs: deplyo
    runs-on: ubuntu-latest
`,
      'fixture.yml',
    );
    expect(() => skippedUpstreamFindings(jobs)).toThrow(
      /job 'verify' needs 'deplyo', which the workflow does not define/,
    );
  });
});

/** A workflow holding one job, so each case states only the lines it is about. */
const onlyJob = (lines: string): WorkflowJob => {
  const [job, ...others] = workflowJobs(
    `jobs:\n  only:\n    runs-on: ubuntu-latest\n${lines}`,
    'fixture.yml',
  );
  if (job === undefined || others.length > 0)
    throw new Error('a fixture here defines exactly one job');
  return job;
};

describe("a job's own budget and scripts, as the runner reads them (#157)", () => {
  it('reads a job-level timeout-minutes as minutes', () => {
    expect(onlyJob('    timeout-minutes: 45\n').timeoutMinutes).toBe(45);
  });

  it('reads a budget carrying a trailing comment, which a whole-line match reads as none', () => {
    expect(onlyJob('    timeout-minutes: 45 # was 25\n').timeoutMinutes).toBe(
      45,
    );
  });

  it('reads no budget from a comment, even one sitting above the real line', () => {
    expect(
      onlyJob('    # timeout-minutes: 45\n    timeout-minutes: 20\n')
        .timeoutMinutes,
    ).toBe(20);
    expect(
      onlyJob('    # timeout-minutes: 45\n').timeoutMinutes,
    ).toBeUndefined();
  });

  it("takes a job's budget from the job alone, never from a step inside it", () => {
    const steps =
      '    steps:\n      - run: npm ci\n        timeout-minutes: 45\n';
    expect(onlyJob(`    timeout-minutes: 30\n${steps}`).timeoutMinutes).toBe(
      30,
    );
    // The job around a budgeted step still runs on the runner's default.
    expect(onlyJob(steps).timeoutMinutes).toBeUndefined();
  });

  it('refuses a budget it cannot read as minutes, rather than judging a guess', () => {
    expect(() => onlyJob('    timeout-minutes: ${{ vars.BUDGET }}\n')).toThrow(
      /fixture\.yml job 'only': timeout-minutes is not a number of minutes/,
    );
  });

  it("lists each step's run script in file order, and none for a uses: step", () => {
    expect(
      onlyJob(
        '    steps:\n' +
          '      - uses: actions/checkout@v7\n' +
          '      - run: npm ci\n' +
          '      - name: e2e\n' +
          '        run: |\n' +
          '          npm run build\n' +
          '          npm run test:e2e\n',
      ).runs,
    ).toEqual(['npm ci', 'npm run build\nnpm run test:e2e\n']);
  });

  it('reads a script from run: alone, never from a step name or a comment', () => {
    expect(
      onlyJob(
        '    steps:\n' +
          '      # - run: npm run test:e2e\n' +
          '      - name: npm run test:e2e\n' +
          '        run: npm ci\n',
      ).runs,
    ).toEqual(['npm ci']);
  });

  it('lists no scripts for a job with no steps', () => {
    expect(onlyJob('').runs).toEqual([]);
  });

  it('refuses steps that are not a list of mappings with script runs', () => {
    expect(() => onlyJob('    steps: npm test\n')).toThrow(
      /fixture\.yml job 'only': steps is not a list/,
    );
    expect(() => onlyJob('    steps:\n      - npm test\n')).toThrow(
      /fixture\.yml job 'only': step 1 is not a mapping/,
    );
    expect(() => onlyJob('    steps:\n      - run: [npm, test]\n')).toThrow(
      /fixture\.yml job 'only': step 1's run is not a script/,
    );
  });
});

/** One job per budget line, named job0, job1, … in order. */
const jobsBudgeted = (...budgets: string[]): WorkflowJob[] =>
  workflowJobs(
    `jobs:\n${budgets
      .map((budget, i) => `  job${i}:\n    runs-on: ubuntu-latest\n${budget}`)
      .join('')}`,
    'fixture.yml',
  );

const OUT_OF_RANGE = 'is not a whole number of minutes from 1 to 359';

describe('no job runs on the runner default budget (#157)', () => {
  it('pins the default a job with no budget inherits, as GitHub documents it', () => {
    expect(RUNNER_DEFAULT_TIMEOUT_MINUTES).toBe(360);
  });

  it('flags a job declaring no budget, naming what the runner gives it', () => {
    expect(unboundedJobFindings(jobsBudgeted(''))).toEqual([
      'job0 declares no timeout-minutes, so the runner gives it 360 minutes',
    ]);
  });

  it('flags a budget at the default or above, which bounds nothing the default does not', () => {
    expect(
      unboundedJobFindings(
        jobsBudgeted(
          '    timeout-minutes: 360\n',
          '    timeout-minutes: 720\n',
        ),
      ),
    ).toEqual([
      `job0's timeout-minutes of 360 ${OUT_OF_RANGE}`,
      `job1's timeout-minutes of 720 ${OUT_OF_RANGE}`,
    ]);
  });

  it('flags a budget that is no whole, positive number of minutes', () => {
    expect(
      unboundedJobFindings(
        jobsBudgeted(
          '    timeout-minutes: 0\n',
          '    timeout-minutes: -5\n',
          '    timeout-minutes: 2.5\n',
        ),
      ),
    ).toEqual([
      `job0's timeout-minutes of 0 ${OUT_OF_RANGE}`,
      `job1's timeout-minutes of -5 ${OUT_OF_RANGE}`,
      `job2's timeout-minutes of 2.5 ${OUT_OF_RANGE}`,
    ]);
  });

  it('passes whole minutes from 1 to 359, judged over a live population', () => {
    const jobs = jobsBudgeted(
      '    timeout-minutes: 1\n',
      '    timeout-minutes: 359\n',
    );
    expect(
      searched(unboundedJobFindings(jobs), { of: jobs, what: 'fixture jobs' }),
    ).toEqual([]);
  });
});
