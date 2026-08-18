/**
 * C17.2 — the WORKFLOW's own structure, and the two receipt contracts.
 *
 * Run 32060986572 (`workflow_dispatch` on c17.2 at 3c526af) failed on a GitHub ArtifactService
 * timeout. That was genuinely upstream — but it MASKED four deterministic defects, because the
 * blocking packager was never reached and so never asked its questions:
 *
 *   1. the receipt validator required `push`/`main` unconditionally, so an offline candidate
 *      preflight of a branch dispatch could not pass at all;
 *   2. the blocking packager ran AFTER an auxiliary upload, so an upload outage SKIPPED it;
 *   3. no job carried `timeout-minutes`, leaving only the 6-hour platform default;
 *   4. artifact names were not attempt-scoped, so a rerun collides or is indistinguishable from a
 *      superseded attempt.
 *
 * These controls read both workflows as PARSED YAML and exercise the real validator and the real
 * attempt-aware artifact selection. A regex over the file would have matched the nested
 * step-level `timeout-minutes` and reported a job bound that does not exist.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  validateReceiptShape, verifyHostedRun, artifactNameForDigest, artifactPrefixForAttempt,
  finalizerArtifactName, finalizerArtifactPrefixForAttempt,
  REQUIRED_ARTIFACT_PREFIX, FINALIZED_ARTIFACT_PREFIX, REPOSITORY, WORKFLOW_PATH, WORKFLOW_NAME,
  EXPECTED_JOB, EXPECTED_RUNNER_LABEL, REQUIRED_JOBS, REQUIRED_SUPPLY_CHAIN_STEPS,
  runUrl, jobsUrl, artifactsUrl,
} from '../../../../scripts/gate/lib/hosted-run.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
const CI = parseYaml(readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8')) as any;
const FINALIZE = parseYaml(
  readFileSync(join(REPO, '.github/workflows/c17-finalize.yml'), 'utf8'),
) as any;
const SHA = 'a'.repeat(40);
const DIGEST = 'c'.repeat(64);

type Step = Record<string, any>;
const supplyChainSteps = (): Step[] => CI.jobs['supply-chain'].steps as Step[];
const stepNamed = (steps: Step[], fragment: string): Step => {
  const found = steps.find((s) => typeof s.name === 'string' && s.name.includes(fragment));
  expect(found, `a step named like '${fragment}' must exist`).toBeDefined();
  return found as Step;
};
const allUploads = (): Array<{ where: string; step: Step }> => {
  const out: Array<{ where: string; step: Step }> = [];
  for (const [doc, label] of [[CI, 'ci'], [FINALIZE, 'c17-finalize']] as const) {
    for (const [jobName, job] of Object.entries(doc.jobs as Record<string, any>)) {
      for (const step of (job.steps ?? []) as Step[]) {
        if (String(step.uses ?? '').startsWith('actions/upload-artifact')) {
          out.push({ where: `${label}:${jobName}`, step });
        }
      }
    }
  }
  return out;
};

/** A structurally valid delivery receipt, parameterised by what a real run would report. */
const receipt = (over: Record<string, unknown> = {}) => ({
  hosted: true,
  api_url: `https://api.github.com/repos/${REPOSITORY}/actions/runs/32060990001`,
  html_url: `https://github.com/${REPOSITORY}/actions/runs/32060990001`,
  repository: REPOSITORY,
  run_id: '32060990001',
  run_number: '8',
  run_attempt: '1',
  workflow: WORKFLOW_NAME,
  workflow_ref: `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`,
  job: EXPECTED_JOB,
  head_sha: SHA,
  ref: 'refs/heads/main',
  event: 'push',
  runner_os: 'Linux',
  runner_arch: 'X64',
  ...over,
});

/** A branch dispatch receipt, as the candidate preflight actually produces. */
const dispatchReceipt = (over: Record<string, unknown> = {}) => receipt({
  event: 'workflow_dispatch',
  ref: 'refs/heads/c17.2',
  workflow_ref: `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/c17.2`,
  ...over,
});

/** A fetch that counts. Candidate and offline paths must never reach it. */
const countingFetch = () => {
  const state = { calls: 0 };
  const fetchImpl = async () => {
    state.calls += 1;
    throw new Error('this verification path must not touch the network');
  };
  return { state, fetchImpl };
};

/**
 * A COMPLETE fake delivery API: run + jobs + artifacts, with accurate total_count everywhere
 * and the code-owned `ubuntu-latest` label on the supply-chain job, so the positive control
 * exercises every check the real verifier makes rather than a truncated subset.
 */
const deliveryApi = (
  artifacts: Array<Record<string, unknown>>,
  { runId = '32060990001', attempt = '2' } = {},
) => {
  const bodies = new Map<string, unknown>([
    [runUrl(runId), {
      id: Number(runId), run_number: 8, run_attempt: Number(attempt), head_sha: SHA,
      repository: { full_name: REPOSITORY }, event: 'push', head_branch: 'main',
      status: 'completed', conclusion: 'success', name: WORKFLOW_NAME, path: WORKFLOW_PATH,
    }],
    [jobsUrl(runId, attempt), {
      total_count: REQUIRED_JOBS.length,
      jobs: REQUIRED_JOBS.map((name) => ({
        name, status: 'completed', conclusion: 'success', head_sha: SHA,
        labels: [EXPECTED_RUNNER_LABEL],
        steps: name === EXPECTED_JOB
          ? REQUIRED_SUPPLY_CHAIN_STEPS.map((step) => ({
            name: step, status: 'completed', conclusion: 'success',
          }))
          : [],
      })),
    }],
    [artifactsUrl(runId), { total_count: artifacts.length, artifacts }],
  ]);
  return async (url: string) => {
    const body = bodies.get(String(url));
    return new Response(JSON.stringify(body ?? null), {
      status: body === undefined ? 404 : 200,
      headers: { 'content-type': 'application/json' },
    });
  };
};

const sourceArtifact = (name: string) => ({
  name, expired: false, size_in_bytes: 123,
  digest: `sha256:${'e'.repeat(64)}`,
  workflow_run: { id: 32060990001, head_sha: SHA },
});

const deliverAttempt2 = (artifacts: Array<Record<string, unknown>>) => verifyHostedRun(
  receipt({ run_attempt: '2' }),
  {
    expectedHeadSha: SHA, requireHosted: true, requireArtifact: true,
    expectedArtifactDigest: DIGEST, profile: 'delivery', level: 'online',
    fetchImpl: deliveryApi(artifacts) as never,
  },
);

describe('C17.2 — workflow structure', () => {
  it('declares the exact job-level timeouts: 30, 30 and 120 minutes, read from PARSED YAML', () => {
    // Parsed, not regex-matched: a regex over the file text matches the step-level
    // `timeout-minutes` nested inside supply-chain and would report a job bound that is absent.
    const jobs = CI.jobs as Record<string, any>;
    expect(Object.keys(jobs).sort()).toEqual(['browser-regression', 'build-test', 'supply-chain']);
    expect(jobs['build-test']['timeout-minutes']).toBe(30);
    expect(jobs['browser-regression']['timeout-minutes']).toBe(30);
    expect(jobs['supply-chain']['timeout-minutes']).toBe(120);
  });

  it('the BLOCKING C17 packager precedes every artifact upload in supply-chain', () => {
    const steps = supplyChainSteps();
    const packagerIndex = steps.findIndex(
      (s) => typeof s.name === 'string' && s.name.includes('Package + verify the C17 evidence archive'),
    );
    expect(packagerIndex, 'the packager step must exist').toBeGreaterThanOrEqual(0);
    const uploadIndexes = steps
      .map((s, i) => ({ i, uses: String(s.uses ?? '') }))
      .filter((s) => s.uses.startsWith('actions/upload-artifact'))
      .map((s) => s.i);
    expect(uploadIndexes.length, 'there must be uploads to order against').toBeGreaterThan(0);
    for (const i of uploadIndexes) {
      expect(i, `upload at step ${i} must come AFTER the packager at ${packagerIndex}`)
        .toBeGreaterThan(packagerIndex);
    }
  });

  it('the packager is skipped ONLY on pull_request, and never via always()', () => {
    const packager = stepNamed(supplyChainSteps(), 'Package + verify the C17 evidence archive');
    expect(packager.id).toBe('c17_package');
    // The one deliberate exclusion: a PR run executes the gates but packages no release archive.
    expect(packager.if).toBe("github.event_name != 'pull_request'");
    expect(String(packager.if)).not.toContain('always()');
  });

  it('a pull_request run RETAINS the real C15–C17 gates unconditionally', () => {
    const steps = supplyChainSteps();
    for (const fragment of [
      'C15 supply-chain gate',
      'C16 target-resolved closure gate',
      'C17 official CycloneDX validation',
    ]) {
      const gate = stepNamed(steps, fragment);
      expect(gate.if, `${gate.name} must not be conditioned`).toBeUndefined();
    }
  });

  it('the packager states the caller-owned receipt profile from the triggering event', () => {
    const packager = stepNamed(supplyChainSteps(), 'Package + verify the C17 evidence archive');
    expect(String(packager.run)).toContain(
      "--profile ${{ github.event_name == 'push' && 'delivery' || 'candidate' }}",
    );
  });

  it('exactly EIGHT uploads exist across both workflows, every one attempt-scoped', () => {
    // Seven were pinned at C17.2; C18 ADDS its dual-path evidence upload (same contract:
    // attempt-scoped name, deterministic runner.temp path, producer-outcome guard). This count
    // is the completeness pin — a new upload must be added HERE deliberately, with the same
    // properties, never silently.
    const uploads = allUploads();
    expect(uploads).toHaveLength(8);
    for (const { where, step } of uploads) {
      const name = String(step.with?.name ?? '');
      expect(name, `upload '${name}' in ${where} must scope an attempt`)
        .toMatch(/-a\$\{\{ github\.run_attempt \}\}/);
    }
  });

  it('every upload path line is a deterministic ${{ runner.temp }} directory', () => {
    for (const { where, step } of allUploads()) {
      const path = String(step.with?.path ?? '');
      const lines = path.split('\n').map((line) => line.trim()).filter(Boolean);
      expect(lines.length, `upload in ${where} must declare a path`).toBeGreaterThan(0);
      // `if-no-files-found: warn` tolerates a nonempty path that matched nothing; it does NOT
      // protect against the path INPUT itself collapsing to the empty string when the step
      // that would have populated an env var never ran. The contract is stronger than "no env":
      // every path is a deterministic directory under the runner temp root.
      for (const line of lines) {
        expect(line, `upload path '${line}' in ${where} must live under runner.temp`)
          .toMatch(/^\$\{\{ runner\.temp \}\}\//);
      }
    }
  });

  it('digest-dependent uploads are guarded on their producer step outcomes', () => {
    const steps = supplyChainSteps();
    expect(stepNamed(steps, 'Package final C15 + C16 evidence').id).toBe('evidence_zip');
    const c17Upload = stepNamed(steps, 'Upload the C17 evidence archive');
    expect(c17Upload.if).toBe("always() && steps.c17_package.outcome == 'success'");
    const finalZipUpload = stepNamed(steps, 'Upload the inspectable final-evidence ZIP');
    expect(finalZipUpload.if).toBe("always() && steps.evidence_zip.outcome == 'success'");
    const finalizeSteps = FINALIZE.jobs.finalize.steps as Step[];
    expect(stepNamed(finalizeSteps, 'Create + verify the finalized cross-host evidence').id)
      .toBe('finalize_package');
    const finalizedUpload = stepNamed(finalizeSteps, 'Upload the FINALIZED cross-host evidence');
    expect(finalizedUpload.if).toBe("always() && steps.finalize_package.outcome == 'success'");
  });

  it('raw diagnostic uploads may stay always(), and both carry static paths', () => {
    const steps = supplyChainSteps();
    for (const fragment of ['Upload C15 + C16 + C17 raw gate evidence', 'Upload C17 licence + schema evidence']) {
      const upload = stepNamed(steps, fragment);
      expect(upload.if).toBe('always()');
      expect(String(upload.with?.path)).toContain('${{ runner.temp }}/');
    }
  });

  it('the finalizer download lands OUTSIDE the repository workspace and is consumed from there', () => {
    // The first live finalizer run (32116543012) failed because the source artifact was
    // downloaded to a repository-relative `incoming` directory: the artifact's sidecar and
    // staging tree are not gitignored, so the checkout was dirty and the final-mode C17
    // regeneration inside source-archive verification correctly refused. The download must be
    // a runner-temp path, the verification step must consume exactly that path, and no bare
    // repository-relative `find incoming` may remain anywhere in the finalizer.
    const steps = FINALIZE.jobs.finalize.steps as Step[];
    const download = stepNamed(steps, 'Download the archive the SOURCE run produced');
    expect(download.with?.path).toBe('${{ runner.temp }}/incoming');
    const verify = stepNamed(steps, 'Verify the source C17 archive online and hosted');
    const run = String(verify.run);
    expect(run).toContain('INCOMING="$RUNNER_TEMP/incoming"');
    expect(run.match(/find "\$INCOMING"/g) ?? []).toHaveLength(2);
    for (const step of steps) {
      expect(String(step.run ?? ''), `step '${step.name}' must not use a repo-relative incoming path`)
        .not.toMatch(/find\s+incoming/);
    }
  });

  it('the finalizer downloads the SOURCE attempt and uploads its OWN attempt', () => {
    const steps = FINALIZE.jobs.finalize.steps as Step[];
    const download = stepNamed(steps, 'Download the archive the SOURCE run produced');
    expect(download.with?.pattern).toBe(
      `${REQUIRED_ARTIFACT_PREFIX}a${'${{ github.event.workflow_run.run_attempt }}'}-*`,
    );
    const upload = stepNamed(steps, 'Upload the FINALIZED cross-host evidence');
    expect(upload.with?.name).toBe(
      `${FINALIZED_ARTIFACT_PREFIX}a${'${{ github.run_attempt }}'}-${'${{ env.C17_FINALIZED_SHA256 }}'}`,
    );
    const verify = stepNamed(steps, 'Verify the source C17 archive online and hosted');
    expect(String(verify.run)).toContain('--profile delivery --online --require-hosted');
  });

  it('the recovery contract states that a partial re-run cannot produce evidence', () => {
    const text = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');
    expect(text).toMatch(/CANDIDATE PREFLIGHT ONLY/);
    expect(text).toMatch(/never only the failed jobs/);
  });
});

describe('C17.2 — the two receipt contracts', () => {
  it('CANDIDATE offline: a branch dispatch receipt passes, with ZERO fetch calls', async () => {
    const { state, fetchImpl } = countingFetch();
    const r = await verifyHostedRun(dispatchReceipt(), {
      expectedHeadSha: SHA, requireHosted: false, requireArtifact: false,
      profile: 'candidate', level: 'offline', fetchImpl,
    });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(state.calls, 'a candidate preflight is offline by contract').toBe(0);
  });

  it.each([
    ['online verification', { level: 'online', requireHosted: false }],
    ['--require-hosted', { level: 'offline', requireHosted: true }],
  ] as const)('CANDIDATE combined with %s is refused BEFORE any fetch', async (_label, over) => {
    const { state, fetchImpl } = countingFetch();
    const r = await verifyHostedRun(dispatchReceipt(), {
      expectedHeadSha: SHA, requireArtifact: false, profile: 'candidate',
      level: over.level, requireHosted: over.requireHosted, fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/candidate preflight cannot be verified online or with --require-hosted/);
    expect(state.calls).toBe(0);
  });

  it('requiring hosted evidence WITHOUT online verification is refused for delivery too', async () => {
    const { state, fetchImpl } = countingFetch();
    const r = await verifyHostedRun(receipt(), {
      expectedHeadSha: SHA, requireHosted: true, requireArtifact: false,
      profile: 'delivery', level: 'offline', fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/demands authoritative online verification/);
    expect(state.calls).toBe(0);
  });

  it('DELIVERY offline: a push/main receipt passes structural self-verification, no network', async () => {
    const { state, fetchImpl } = countingFetch();
    const r = await verifyHostedRun(receipt(), {
      expectedHeadSha: SHA, requireHosted: false, requireArtifact: false,
      profile: 'delivery', level: 'offline', fetchImpl,
    });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(state.calls).toBe(0);
  });

  it('DELIVERY online: the complete authoritative API contract passes', async () => {
    const r = await deliverAttempt2([sourceArtifact(artifactNameForDigest('2', DIGEST))]);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('DELIVERY: a branch dispatch receipt is REJECTED by shape', () => {
    const r = validateReceiptShape(dispatchReceipt(), { requireHosted: true, profile: 'delivery' });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/event is "workflow_dispatch"|ref is "refs\/heads\/c17\.2"/);
  });

  it('the head_sha binding holds in EVERY profile: a wrong expected SHA is rejected', async () => {
    for (const [profile, rec] of [['candidate', dispatchReceipt()], ['delivery', receipt()]] as const) {
      const r = await verifyHostedRun(rec, {
        expectedHeadSha: 'b'.repeat(40), requireHosted: false, requireArtifact: false,
        profile, level: 'offline',
        fetchImpl: countingFetch().fetchImpl,
      });
      expect(r.ok, `${profile} must reject a wrong expected SHA`).toBe(false);
      expect(r.problems.join('\n')).toMatch(/head_sha a{40} != the source receipt's b{40}/);
    }
  });

  it('a MISSING expected SHA is refused rather than skipping the binding', async () => {
    const r = await verifyHostedRun(dispatchReceipt(), {
      expectedHeadSha: undefined, requireHosted: false, requireArtifact: false,
      profile: 'candidate', level: 'offline',
      fetchImpl: countingFetch().fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/no source SHA was supplied to bind/);
  });

  it.each([
    ['workflow_ref disagreeing with its own ref', { workflow_ref: `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/other` }, /disagrees with its own ref/],
    ['a workflow_ref for another workflow', { workflow_ref: `${REPOSITORY}/.github/workflows/other.yml@refs/heads/c17.2` }, /does not name/],
    ['a tag rather than a branch', { ref: 'refs/tags/v1' }, /is not a canonical branch ref/],
    ['a branch with a space', { ref: 'refs/heads/evil branch' }, /is not a canonical branch ref/],
    ['a dot-dot branch', { ref: 'refs/heads/..' }, /is not a canonical branch ref/],
    ['an embedded dot-dot', { ref: 'refs/heads/foo..bar' }, /is not a canonical branch ref/],
    ['a trailing slash', { ref: 'refs/heads/foo/' }, /is not a canonical branch ref/],
    ['an empty component', { ref: 'refs/heads//foo' }, /is not a canonical branch ref/],
    ['a dot-leading component', { ref: 'refs/heads/.hidden' }, /is not a canonical branch ref/],
    ['a .lock suffix', { ref: 'refs/heads/foo.lock' }, /is not a canonical branch ref/],
    ['a reflog-style @{', { ref: 'refs/heads/foo@{bar' }, /is not a canonical branch ref/],
    ['a pull_request event', { event: 'pull_request' }, /is workflow_dispatch and nothing else/],
  ])('CANDIDATE offline still rejects %s', (_label, over, pattern) => {
    const r = validateReceiptShape(dispatchReceipt(over), { requireHosted: false, profile: 'candidate' });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(pattern);
  });

  it('CANDIDATE accepts normal and nested canonical branch names', () => {
    for (const ref of ['refs/heads/c17.2', 'refs/heads/feature/c17.2-fixups']) {
      const r = validateReceiptShape(
        dispatchReceipt({ ref, workflow_ref: `${REPOSITORY}/${WORKFLOW_PATH}@${ref}` }),
        { requireHosted: false, profile: 'candidate' },
      );
      expect(r.problems, `${ref} is canonical and must be accepted`).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });

  it('ONLINE verification intrinsically rejects hosted:false, regardless of requireHosted', async () => {
    // The exported core must be authoritative on its own: a caller passing requireHosted:false
    // with level online must NOT be able to reach a green verdict for a local package. The
    // package verifier maps requireHosted for its own callers, but that mapping must never be
    // what stands between a local archive and a hosted claim.
    const { state, fetchImpl } = countingFetch();
    const r = await verifyHostedRun({ hosted: false }, {
      expectedHeadSha: 'a'.repeat(40), profile: 'delivery', level: 'online',
      requireHosted: false, requireArtifact: true, fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.local).toBe(true);
    expect(r.problems.join('\n')).toMatch(/hosted=false/);
    expect(state.calls, 'the rejection must precede any fetch').toBe(0);
  });

  it('OFFLINE local verification remains legitimate — flagged, never promoted', async () => {
    const { state, fetchImpl } = countingFetch();
    const r = await verifyHostedRun({ hosted: false }, {
      expectedHeadSha: 'a'.repeat(40), profile: 'delivery', level: 'offline',
      requireHosted: false, requireArtifact: false, fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(r.local).toBe(true);
    expect(state.calls).toBe(0);
  });

  it('an unknown or missing PROFILE is refused rather than defaulting to the laxer contract', async () => {
    for (const profile of ['whatever', undefined] as const) {
      const shape = validateReceiptShape(receipt(), { requireHosted: false, profile: profile as never });
      expect(shape.ok).toBe(false);
      expect(shape.problems.join('\n')).toMatch(/is not one of candidate, delivery/);
      const r = await verifyHostedRun(receipt(), {
        expectedHeadSha: SHA, requireHosted: false, requireArtifact: false,
        profile: profile as never, level: 'offline',
        fetchImpl: countingFetch().fetchImpl,
      });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/is not one of candidate, delivery/);
    }
  });

  it('an unknown or missing LEVEL is refused the same way', async () => {
    for (const level of ['sorta-online', undefined] as const) {
      const r = await verifyHostedRun(receipt(), {
        expectedHeadSha: SHA, requireHosted: false, requireArtifact: false,
        profile: 'delivery', level: level as never,
        fetchImpl: countingFetch().fetchImpl,
      });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/is not one of offline, online/);
    }
  });
});

describe('C17.2 — attempt-scoped SOURCE artifact selection', () => {
  it('accepts the artifact produced by the receipt\'s OWN attempt', async () => {
    const r = await deliverAttempt2([sourceArtifact(artifactNameForDigest('2', DIGEST))]);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('ignores an older attempt beside the current exact artifact, and notes it', async () => {
    const r = await deliverAttempt2([
      sourceArtifact(artifactNameForDigest('1', DIGEST)),
      sourceArtifact(artifactNameForDigest('2', DIGEST)),
    ]);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.notes.join('\n')).toMatch(/older_attempts_ignored=1/);
  });

  it('REJECTS when only a superseded attempt\'s artifact exists, even with the right digest', async () => {
    const r = await deliverAttempt2([sourceArtifact(artifactNameForDigest('1', DIGEST))]);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/no 'c17-evidence-archive-a2-\*' artifact for attempt 2/);
    expect(r.problems.join('\n')).toMatch(/superseded attempt.*cannot satisfy this receipt/s);
  });

  it('an old exact artifact cannot RESCUE a wrong current one', async () => {
    const r = await deliverAttempt2([
      sourceArtifact(artifactNameForDigest('1', DIGEST)),
      sourceArtifact(artifactNameForDigest('2', 'd'.repeat(64))),
    ]);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/delivered archive requires 'c17-evidence-archive-a2-c{64}'/);
  });

  it('REJECTS multiple current-attempt artifacts', async () => {
    const r = await deliverAttempt2([
      sourceArtifact(artifactNameForDigest('2', DIGEST)),
      sourceArtifact(artifactNameForDigest('2', 'd'.repeat(64))),
    ]);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/2 'c17-evidence-archive-a2-\*' artifacts for attempt 2/);
  });

  it('REJECTS a legacy unscoped artifact name', async () => {
    const r = await deliverAttempt2([sourceArtifact(`${REQUIRED_ARTIFACT_PREFIX}${DIGEST}`)]);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/no 'c17-evidence-archive-a2-\*' artifact for attempt 2/);
  });

  it('there is ONE naming implementation, attempt-aware, for source and finalizer alike', () => {
    expect(artifactNameForDigest('2', DIGEST)).toBe(`${artifactPrefixForAttempt('2')}${DIGEST}`);
    expect(artifactNameForDigest('2', DIGEST)).toBe(`${REQUIRED_ARTIFACT_PREFIX}a2-${DIGEST}`);
    expect(artifactNameForDigest('1', DIGEST)).not.toBe(artifactNameForDigest('2', DIGEST));
    expect(finalizerArtifactName('3', DIGEST)).toBe(`${finalizerArtifactPrefixForAttempt('3')}${DIGEST}`);
    expect(finalizerArtifactName('3', DIGEST)).toBe(`${FINALIZED_ARTIFACT_PREFIX}a3-${DIGEST}`);
  });
});
