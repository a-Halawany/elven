/**
 * C17.2 C — hosted evidence is proved by code-owned GitHub API facts.
 *
 * Every control drives the real receipt validator and online verifier.  The mocked transport is
 * deliberately injected below the URL constructor: a receipt can mutate identifiers and claims,
 * but it can never choose the endpoint that answers them.
 */
import { describe, expect, it } from 'vitest';

import {
  API_ORIGIN, EXPECTED_BRANCH, EXPECTED_EVENT, EXPECTED_JOB, EXPECTED_REF,
  EXPECTED_RUNNER_ARCH, EXPECTED_RUNNER_OS, EXPECTED_WORKFLOW_REF, REPOSITORY,
  EXPECTED_RUNNER_LABEL,
  artifactNameForDigest, REQUIRED_ARTIFACT_PREFIX, REQUIRED_JOBS,
  REQUIRED_SUPPLY_CHAIN_STEPS, WORKFLOW_NAME,
  WORKFLOW_PATH, apiGet, artifactsUrl, jobsUrl, runUrl, validateReceiptShape,
  verifyHostedRun,
} from '../../../../scripts/gate/lib/hosted-run.mjs';

const SHA = 'a'.repeat(40);
const RUN = '424242';
const ATTEMPT = '2';
const ARTIFACT_DIGEST = 'd'.repeat(64);
const WRAPPER_DIGEST = `sha256:${'e'.repeat(64)}`;

const receipt = () => ({
  hosted: true,
  api_url: runUrl(RUN),
  html_url: `https://github.com/${REPOSITORY}/actions/runs/${RUN}`,
  repository: REPOSITORY,
  run_id: RUN,
  run_number: '17',
  run_attempt: ATTEMPT,
  workflow: WORKFLOW_NAME,
  workflow_ref: EXPECTED_WORKFLOW_REF,
  job: EXPECTED_JOB,
  head_sha: SHA,
  ref: EXPECTED_REF,
  event: EXPECTED_EVENT,
  runner_os: EXPECTED_RUNNER_OS,
  runner_arch: EXPECTED_RUNNER_ARCH,
});

const facts = () => ({
  run: {
    id: Number(RUN), run_number: 17, run_attempt: Number(ATTEMPT), head_sha: SHA,
    repository: { full_name: REPOSITORY }, event: EXPECTED_EVENT,
    head_branch: EXPECTED_BRANCH, status: 'completed', conclusion: 'success',
    name: WORKFLOW_NAME, path: WORKFLOW_PATH,
  },
  jobs: {
    jobs: REQUIRED_JOBS.map((name) => ({
      name, status: 'completed', conclusion: 'success', head_sha: SHA,
      labels: [EXPECTED_RUNNER_LABEL],
      steps: name === EXPECTED_JOB
        ? REQUIRED_SUPPLY_CHAIN_STEPS.map((step) => ({
            name: step, status: 'completed', conclusion: 'success',
          }))
        : [],
    })),
    total_count: REQUIRED_JOBS.length,
  },
  artifacts: {
    artifacts: [{
      name: artifactNameForDigest(ARTIFACT_DIGEST), expired: false, size_in_bytes: 123,
      digest: WRAPPER_DIGEST,
      workflow_run: { id: Number(RUN), head_sha: SHA },
    }],
    total_count: 1,
  },
});

const transport = (body = facts()) => async (url: string) => {
  const payload = url === runUrl(RUN) ? body.run
    : url === jobsUrl(RUN, ATTEMPT) ? body.jobs
      : url === artifactsUrl(RUN) ? body.artifacts : null;
  return new Response(JSON.stringify(payload), {
    status: payload === null ? 404 : 200,
    headers: { 'content-type': 'application/json' },
  });
};

describe('C17.2 C — non-forgeable hosted-run verification', () => {
  it('accepts the complete code-owned run/job/step/artifact contract', async () => {
    const r = await verifyHostedRun(receipt(), {
      expectedHeadSha: SHA, requireHosted: true, requireArtifact: true,
      expectedArtifactDigest: ARTIFACT_DIGEST,
      fetchImpl: transport(),
    });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it.each([
    ['api_url', 'file:///tmp/fake-api.json'],
    ['api_url', 'https://attacker.example/fake'],
    ['html_url', 'https://attacker.example/run'],
    ['repository', 'attacker/elven'],
    ['workflow', 'ATTACKER-WORKFLOW'],
    ['workflow_ref', 'attacker/elven/.github/workflows/evil.yml@refs/heads/evil'],
    ['job', 'build-test'],
    ['ref', 'refs/heads/evil'],
    ['event', 'pull_request'],
    ['runner_os', 'Windows'],
    ['runner_arch', 'ARM64'],
  ] as const)('rejects a forged receipt %s', async (field, value) => {
    const forged: any = receipt();
    forged[field] = value;
    const r = await verifyHostedRun(forged, {
      expectedHeadSha: SHA, requireHosted: true, requireArtifact: true,
      expectedArtifactDigest: ARTIFACT_DIGEST,
      fetchImpl: transport(),
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(new RegExp(field));
  });

  it('rejects hosted:false when hosted evidence is required', () => {
    const r = validateReceiptShape({ hosted: false }, { requireHosted: true });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/hosted=false/);
  });

  it.each([
    ['missing workflow path', (b: any) => { delete b.run.path; }, /workflow path/],
    ['wrong workflow name', (b: any) => { b.run.name = 'evil'; }, /workflow name/],
    ['failed required job', (b: any) => { b.jobs.jobs[0].conclusion = 'failure'; }, /job .* not success/],
    ['missing required-job SHA', (b: any) => { delete b.jobs.jobs[0].head_sha; }, /head_sha/],
    ['duplicate required job', (b: any) => { b.jobs.jobs.push({ ...b.jobs.jobs[0] }); }, /duplicate jobs/],
    ['jobs member is not an array', (b: any) => { b.jobs.jobs = {}; }, /no jobs array/],
    ['jobs total_count does not match the response', (b: any) => { b.jobs.total_count += 1; }, /total_count .*returned jobs length/],
    ['supply-chain job is not completed', (b: any) => {
      b.jobs.jobs.find((j: any) => j.name === EXPECTED_JOB).status = 'in_progress';
    }, /supply-chain job status .*not completed/],
    ['supply-chain job lacks the ubuntu-latest label', (b: any) => {
      b.jobs.jobs.find((j: any) => j.name === EXPECTED_JOB).labels = ['self-hosted'];
    }, /ubuntu-latest.*required/],
    ['missing required step', (b: any) => { b.jobs.jobs.find((j: any) => j.name === EXPECTED_JOB).steps = []; }, /no supply-chain step/],
    ['required step is not completed', (b: any) => {
      b.jobs.jobs.find((j: any) => j.name === EXPECTED_JOB).steps[0].status = 'in_progress';
    }, /supply-chain step .*status .*not completed/],
    ['required step did not succeed', (b: any) => {
      b.jobs.jobs.find((j: any) => j.name === EXPECTED_JOB).steps[0].conclusion = 'failure';
    }, /supply-chain step .*concluded .*failure/],
    ['missing artifact', (b: any) => { b.artifacts.artifacts = []; }, /exactly one is required/],
    ['duplicate artifact', (b: any) => { b.artifacts.artifacts.push({ ...b.artifacts.artifacts[0] }); }, /exactly one/],
    ['artifacts member is not an array', (b: any) => { b.artifacts.artifacts = {}; }, /no artifacts array/],
    ['artifacts total_count does not match the response', (b: any) => { b.artifacts.total_count += 1; }, /total_count .*returned artifacts length/],
    ['expired artifact', (b: any) => { b.artifacts.artifacts[0].expired = true; }, /expired/],
    ['missing artifact SHA binding', (b: any) => { delete b.artifacts.artifacts[0].workflow_run; }, /head_sha/],
    ['artifact is bound to another run id', (b: any) => { b.artifacts.artifacts[0].workflow_run.id = 7; }, /workflow_run\.id/],
    ['wrong inner artifact digest', (b: any) => { b.artifacts.artifacts[0].name = artifactNameForDigest('c'.repeat(64)); }, /supplied evidence ZIP/],
    ['missing wrapper digest', (b: any) => { delete b.artifacts.artifacts[0].digest; }, /wrapper digest/],
  ] as const)('rejects authoritative API facts: %s', async (_label, mutate, pattern) => {
    const b: any = facts();
    mutate(b);
    const r = await verifyHostedRun(receipt(), {
      expectedHeadSha: SHA, requireHosted: true, requireArtifact: true,
      expectedArtifactDigest: ARTIFACT_DIGEST,
      fetchImpl: transport(b),
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(pattern);
  });

  it('refuses a cross-origin redirect and a non-HTTPS endpoint', async () => {
    const redirect = await apiGet(runUrl(RUN), {
      fetchImpl: async () => new Response(null, {
        status: 302, headers: { location: 'https://attacker.example/fake' },
      }),
    });
    expect(redirect.ok).toBe(false);
    expect(redirect.error).toMatch(/refused a 302 redirect/);

    const file = await apiGet('file:///tmp/fake-api.json', { fetchImpl: transport() });
    expect(file.ok).toBe(false);
    expect(file.error).toMatch(/non-HTTPS/);
    expect(API_ORIGIN).toBe('https://api.github.com');
    expect(artifactNameForDigest(ARTIFACT_DIGEST)).toBe(`${REQUIRED_ARTIFACT_PREFIX}${ARTIFACT_DIGEST}`);
  });
});
