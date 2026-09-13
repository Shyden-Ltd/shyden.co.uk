import { describe, it, expect } from 'vitest';
import {
  jobsDownstreamOfAConditionalJob,
  skippedUpstreamFindings,
  workflowJobs,
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
