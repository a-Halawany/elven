/**
 * C17.2 C — HOSTED-RUN VERIFICATION THAT CANNOT BE FORGED BY THE RECEIPT.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────────
 * The previous check read `api_url` out of the receipt and handed it to `curl`. So the receipt
 * chose which server answered the question the receipt was being asked. Proved by execution
 * before this was written: a receipt naming `file:///tmp/fake-api.json` produced
 * `github_api=verified id=… conclusion=success` from a file the attacker wrote. Every other field
 * — repository, workflow, job, attempt, ref, runner — was likewise only compared against itself,
 * and `{"hosted": false}` merely produced a note even when `--online` was requested.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────────
 * The receipt may supply only IDENTIFIERS, and only ones this module validates by shape. The
 * ENDPOINT is constructed here, in code, from a code-owned repository and a strictly numeric run
 * id. Nothing in the receipt can influence which host is contacted, the scheme used, or which
 * path is requested. Redirects away from the API origin are refused rather than followed.
 *
 * Everything the receipt claims is then checked against what the API returns, and the API's
 * answer is authoritative on every field.
 */
import { createHash } from 'node:crypto';

/** CODE-OWNED. The receipt cannot name a different repository and be believed. */
export const REPOSITORY = 'a-Halawany/elven';
export const API_ORIGIN = 'https://api.github.com';
export const WORKFLOW_PATH = '.github/workflows/ci.yml';
export const EXPECTED_EVENT = 'push';
export const EXPECTED_BRANCH = 'main';

/** Every job that must exist and must have succeeded. */
export const REQUIRED_JOBS = Object.freeze(['build-test', 'supply-chain', 'browser-regression']);

/** Steps in `supply-chain` that must exist and must have succeeded, by name. */
export const REQUIRED_SUPPLY_CHAIN_STEPS = Object.freeze([
  'C17 official CycloneDX validation + licence obligations (blocking)',
  'Package + verify the C17 evidence archive (tracked packager, blocking)',
]);

/** The artifact the finalizer must find bound to the same run. */
export const REQUIRED_ARTIFACT = 'c17-evidence-archive';

const NUMERIC = /^[1-9][0-9]{0,17}$/;
const SHA40 = /^[0-9a-f]{40}$/;

/**
 * Validate the receipt's own shape BEFORE any network use, and return only the identifiers this
 * module is willing to act on. A field that fails here is never used to build a URL.
 */
export function validateReceiptShape(receipt, { requireHosted }) {
  const problems = [];
  if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return { ok: false, problems: ['run receipt is not an object'], ids: null };
  }
  if (receipt.hosted !== true) {
    // A local package is legitimate — but it is NOT hosted evidence, and delivery requires
    // hosted evidence. Previously this produced a note even under --online.
    if (requireHosted) {
      problems.push(
        'run receipt declares hosted=false. Delivery verification requires evidence produced by a '
        + 'hosted run; a locally packaged archive cannot satisfy it.',
      );
    }
    return { ok: problems.length === 0, problems, ids: null, local: true };
  }
  for (const field of ['run_id', 'run_attempt', 'head_sha', 'repository', 'workflow', 'job']) {
    if (typeof receipt[field] !== 'string' || receipt[field].length === 0) {
      problems.push(`run receipt has no '${field}'`);
    }
  }
  if (problems.length > 0) return { ok: false, problems, ids: null };

  // Shape, strictly. A run id is a positive integer and nothing else: this is what stops a path
  // segment, a scheme, or a traversal from reaching the constructed URL.
  if (!NUMERIC.test(receipt.run_id)) {
    problems.push(`run receipt run_id ${JSON.stringify(receipt.run_id)} is not a positive integer`);
  }
  if (!NUMERIC.test(receipt.run_attempt)) {
    problems.push(`run receipt run_attempt ${JSON.stringify(receipt.run_attempt)} is not a positive integer`);
  }
  if (!SHA40.test(receipt.head_sha)) {
    problems.push(`run receipt head_sha ${JSON.stringify(receipt.head_sha)} is not a 40-character git object id`);
  }
  // The repository is CODE-OWNED; the receipt must agree with it rather than choose it.
  if (receipt.repository !== REPOSITORY) {
    problems.push(
      `run receipt names repository ${JSON.stringify(receipt.repository)}; this gate only accepts `
      + `evidence from ${REPOSITORY}`,
    );
  }
  if (!REQUIRED_JOBS.includes(receipt.job)) {
    problems.push(
      `run receipt names job ${JSON.stringify(receipt.job)}, which is not one of the required jobs `
      + `(${REQUIRED_JOBS.join(', ')})`,
    );
  }
  // An api_url in the receipt is IGNORED for fetching. If present it must at least agree with
  // what this module would construct, so a mismatch is reported rather than silently tolerated.
  if (receipt.api_url !== undefined) {
    const expected = runUrl(receipt.run_id);
    if (receipt.api_url !== expected) {
      problems.push(
        `run receipt api_url ${JSON.stringify(receipt.api_url)} is not the endpoint this gate `
        + `constructs (${expected}). The receipt does not choose which server is asked.`,
      );
    }
  }
  if (problems.length > 0) return { ok: false, problems, ids: null };
  return {
    ok: true,
    problems,
    local: false,
    ids: {
      runId: receipt.run_id,
      runAttempt: receipt.run_attempt,
      headSha: receipt.head_sha,
      job: receipt.job,
      workflow: receipt.workflow,
    },
  };
}

/** Endpoints, CONSTRUCTED. Only a validated numeric id is interpolated. */
export const runUrl = (runId) => `${API_ORIGIN}/repos/${REPOSITORY}/actions/runs/${runId}`;
export const jobsUrl = (runId, attempt) => `${API_ORIGIN}/repos/${REPOSITORY}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`;
export const artifactsUrl = (runId) => `${API_ORIGIN}/repos/${REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`;

/**
 * Fetch JSON from the GitHub API, over HTTPS, from that origin only, without following a
 * cross-origin redirect. `fetchImpl` exists so a control can drive this without a network.
 */
export async function apiGet(url, { fetchImpl = globalThis.fetch, token = null } = {}) {
  const parsed = (() => { try { return new URL(url); } catch { return null; } })();
  if (parsed === null) return { ok: false, error: `'${url}' is not a URL` };
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: `refused a non-HTTPS endpoint (${parsed.protocol}//): C17 contacts ${API_ORIGIN} only` };
  }
  if (parsed.origin !== API_ORIGIN) {
    return { ok: false, error: `refused endpoint origin ${parsed.origin}: C17 contacts ${API_ORIGIN} only` };
  }
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'eye-c17-verifier' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    // manual redirect: a 3xx to another origin must fail rather than be followed.
    res = await fetchImpl(url, { headers, redirect: 'manual' });
  } catch (e) {
    return { ok: false, error: `request to ${parsed.pathname} failed: ${e instanceof Error ? e.message : e}` };
  }
  if (res.status >= 300 && res.status < 400) {
    const to = res.headers?.get?.('location') ?? '(none)';
    return { ok: false, error: `refused a ${res.status} redirect to ${to}` };
  }
  if (!res.ok) return { ok: false, error: `${parsed.pathname} returned HTTP ${res.status}` };
  try {
    return { ok: true, body: await res.json() };
  } catch (e) {
    return { ok: false, error: `${parsed.pathname} did not return JSON: ${e instanceof Error ? e.message : e}` };
  }
}

/**
 * Verify a hosted run against the public API. Every claim is checked against the API's answer;
 * the receipt is never its own witness.
 */
export async function verifyHostedRun(receipt, {
  expectedHeadSha, requireHosted = true, fetchImpl = globalThis.fetch, token = null,
  requireArtifact = true,
} = {}) {
  const problems = [];
  const notes = [];
  const shape = validateReceiptShape(receipt, { requireHosted });
  if (!shape.ok) return { ok: false, problems: shape.problems, notes };
  if (shape.local === true) {
    notes.push('run_receipt=LOCAL (not produced by a hosted run)');
    return { ok: true, problems, notes, local: true };
  }
  const { runId, runAttempt, headSha } = shape.ids;
  if (expectedHeadSha !== undefined && headSha !== expectedHeadSha) {
    problems.push(`run receipt head_sha ${headSha} != the source receipt's ${expectedHeadSha}`);
  }

  const run = await apiGet(runUrl(runId), { fetchImpl, token });
  if (!run.ok) return { ok: false, problems: [...problems, `hosted-run verification failed: ${run.error}`], notes };
  const b = run.body;
  const check = (label, actual, want) => {
    if (String(actual) !== String(want)) {
      problems.push(`GitHub reports ${label} ${JSON.stringify(actual)}; the evidence requires ${JSON.stringify(want)}`);
    }
  };
  check('run id', b.id, runId);
  check('run attempt', b.run_attempt, runAttempt);
  check('head_sha', b.head_sha, headSha);
  check('repository', b.repository?.full_name, REPOSITORY);
  check('event', b.event, EXPECTED_EVENT);
  check('head_branch', b.head_branch, EXPECTED_BRANCH);
  check('status', b.status, 'completed');
  check('conclusion', b.conclusion, 'success');
  if (typeof b.path === 'string' && b.path !== WORKFLOW_PATH) {
    problems.push(`GitHub reports workflow path ${JSON.stringify(b.path)}; the evidence requires ${WORKFLOW_PATH}`);
  }
  notes.push(
    `github_run=${b.id} attempt=${b.run_attempt} head_sha=${b.head_sha} event=${b.event} `
    + `branch=${b.head_branch} path=${b.path} conclusion=${b.conclusion}`,
  );

  // ── JOBS: every required job must exist and have succeeded ──────────────────
  const jobs = await apiGet(jobsUrl(runId, runAttempt), { fetchImpl, token });
  if (!jobs.ok) {
    problems.push(`jobs endpoint failed: ${jobs.error}`);
  } else {
    const byName = new Map((jobs.body.jobs ?? []).map((j) => [j.name, j]));
    for (const name of REQUIRED_JOBS) {
      const j = byName.get(name);
      if (j === undefined) { problems.push(`GitHub reports no job named '${name}' for this run`); continue; }
      if (j.conclusion !== 'success') {
        problems.push(`GitHub reports job '${name}' concluded ${JSON.stringify(j.conclusion)}, not success`);
      }
      if (j.head_sha !== undefined && j.head_sha !== headSha) {
        problems.push(`GitHub reports job '${name}' at head_sha ${j.head_sha}, not ${headSha}`);
      }
    }
    const sc = byName.get('supply-chain');
    if (sc !== undefined) {
      const steps = new Map((sc.steps ?? []).map((s) => [s.name, s]));
      for (const name of REQUIRED_SUPPLY_CHAIN_STEPS) {
        const st = steps.get(name);
        if (st === undefined) {
          problems.push(`GitHub reports no supply-chain step named '${name}'`);
        } else if (st.conclusion !== 'success') {
          problems.push(`GitHub reports supply-chain step '${name}' concluded ${JSON.stringify(st.conclusion)}`);
        }
      }
    }
    notes.push(`github_jobs=${[...byName.keys()].filter((n) => REQUIRED_JOBS.includes(n)).sort().join(',')}`);
  }

  // ── ARTIFACTS: the evidence archive must be bound to THIS run ───────────────
  if (requireArtifact) {
    const arts = await apiGet(artifactsUrl(runId), { fetchImpl, token });
    if (!arts.ok) {
      problems.push(`artifacts endpoint failed: ${arts.error}`);
    } else {
      const found = (arts.body.artifacts ?? []).filter((a) => a.name === REQUIRED_ARTIFACT);
      if (found.length === 0) {
        problems.push(`GitHub reports no '${REQUIRED_ARTIFACT}' artifact for run ${runId}`);
      } else {
        for (const a of found) {
          const sha = a.workflow_run?.head_sha;
          if (sha !== undefined && sha !== headSha) {
            problems.push(`artifact '${a.name}' is bound to head_sha ${sha}, not ${headSha}`);
          }
        }
        notes.push(`github_artifact=${REQUIRED_ARTIFACT} count=${found.length}`);
      }
    }
  }
  return { ok: problems.length === 0, problems, notes, local: false };
}

export const digestOf = (b) => createHash('sha256').update(b).digest('hex');
