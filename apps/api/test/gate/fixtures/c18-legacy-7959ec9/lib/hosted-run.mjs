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
export const WORKFLOW_NAME = 'ci';
export const EXPECTED_EVENT = 'push';
export const EXPECTED_BRANCH = 'main';
export const EXPECTED_REF = `refs/heads/${EXPECTED_BRANCH}`;
export const EXPECTED_JOB = 'supply-chain';
export const EXPECTED_RUNNER_OS = 'Linux';
export const EXPECTED_RUNNER_ARCH = 'X64';
export const EXPECTED_RUNNER_LABEL = 'ubuntu-latest';
export const EXPECTED_WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@${EXPECTED_REF}`;

/** Every job that must exist and must have succeeded. */
export const REQUIRED_JOBS = Object.freeze(['build-test', 'supply-chain', 'browser-regression']);

/** Steps in `supply-chain` that must exist and must have succeeded, by name. */
export const REQUIRED_SUPPLY_CHAIN_STEPS = Object.freeze([
  'C17 official CycloneDX validation + licence obligations (blocking)',
  'Package + verify the C17 evidence archive (tracked packager, blocking)',
]);

/**
 * Bind the exact INNER evidence ZIP digest into GitHub's authoritative artifact name. The REST
 * `digest` describes Actions' wrapper ZIP, not the file inside it, so a fixed artifact name proves
 * only that something was uploaded. The digest suffix proves which C17 ZIP it contained.
 */
export const REQUIRED_ARTIFACT_PREFIX = 'c17-evidence-archive-';
export const FINALIZED_ARTIFACT_PREFIX = 'c17-evidence-finalized-';

/**
 * THE artifact contract, attempt-aware, in one place.
 *
 *   c17-evidence-archive-a<source_run_attempt>-<inner_sha256>
 *   c17-evidence-finalized-a<finalizer_run_attempt>-<inner_sha256>
 *
 * The attempt is part of the NAME for two reasons that pull the same way. Actions refuses to
 * overwrite an existing artifact name, so a rerun of a job whose upload already succeeded would
 * die on the collision; and an unscoped name leaves a superseded attempt's bytes
 * indistinguishable from the current attempt's, which is worse — it would let an artifact built
 * from a different job set satisfy this receipt.
 *
 * There is deliberately no second helper. An earlier revision added a parallel
 * `attemptArtifactName` beside the unscoped `artifactNameForDigest`, so the workflow uploaded one
 * shape while the verifier demanded the other; the run would have failed delivery verification
 * with both halves believing they were right.
 */
export const artifactPrefixForAttempt = (attempt) => `${REQUIRED_ARTIFACT_PREFIX}a${attempt}-`;
export const artifactNameForDigest = (attempt, digest) => `${artifactPrefixForAttempt(attempt)}${digest}`;
export const finalizerArtifactPrefixForAttempt = (attempt) => `${FINALIZED_ARTIFACT_PREFIX}a${attempt}-`;
export const finalizerArtifactName = (attempt, digest) => `${finalizerArtifactPrefixForAttempt(attempt)}${digest}`;

/**
 * Select the ONE artifact this receipt's attempt must have produced.
 *
 * `all` is the complete API response array, already total_count-validated by the caller. Older
 * attempts are ignored — they are legitimately present after a rerun — but they can never satisfy
 * the current receipt, and an older artifact with the right digest cannot rescue a current
 * attempt whose artifact is wrong.
 */
export function selectAttemptArtifact(all, { prefixForAttempt, attempt, digest, familyPrefix, label }) {
  const problems = [];
  const notes = [];
  const family = all.filter((a) => typeof a?.name === 'string' && a.name.startsWith(familyPrefix));
  const currentPrefix = prefixForAttempt(attempt);
  const current = family.filter((a) => a.name.startsWith(currentPrefix));
  const older = family.filter((a) => !a.name.startsWith(currentPrefix));
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
    problems.push(`${label} requires the exact inner archive SHA-256; got ${JSON.stringify(digest)}`);
    return { problems, notes, artifact: null };
  }
  const required = `${currentPrefix}${digest}`;
  if (current.length === 0) {
    problems.push(
      `GitHub reports no '${currentPrefix}*' artifact for attempt ${attempt}`
      + (older.length > 0
        ? `; ${older.length} artifact(s) from a superseded attempt (${older.map((a) => a.name).join(', ')}) `
          + 'cannot satisfy this receipt'
        : ''),
    );
    return { problems, notes, artifact: null };
  }
  if (current.length !== 1) {
    problems.push(
      `GitHub reports ${current.length} '${currentPrefix}*' artifacts for attempt ${attempt} `
      + `(${current.map((a) => a.name).join(', ')}); exactly one is required`,
    );
    return { problems, notes, artifact: null };
  }
  if (current[0].name !== required) {
    problems.push(
      `GitHub reports '${current[0].name}' for attempt ${attempt}, but the delivered archive `
      + `requires '${required}'`,
    );
    return { problems, notes, artifact: null };
  }
  if (older.length > 0) notes.push(`${label}_older_attempts_ignored=${older.length}`);
  return { problems, notes, artifact: current[0] };
}

/**
 * C17.2 — TWO CONTRACTS, because a candidate preflight and a delivery are different questions.
 *
 * The single contract required `event: push` and `ref: refs/heads/main` unconditionally, even for
 * OFFLINE verification of a candidate. That made a branch `workflow_dispatch` run — the only kind
 * this repository can produce before `main` moves — impossible to verify at all, so the preflight
 * that is supposed to gate the fast-forward could never run. The artifact-service timeout hid
 * this: the packager never executed, so nothing ever asked the question.
 *
 * CANDIDATE  (offline preflight): a structurally valid `workflow_dispatch` receipt on any branch
 *            is acceptable, because it is not being offered as evidence. What it MUST still do is
 *            bind: run-receipt.head_sha has to equal source-receipt.source_sha, so a preflight
 *            cannot vouch for a different commit than the one packaged.
 * DELIVERY   (online / --require-hosted): strictly `push` on `main`, and every claim
 *            authenticated against the GitHub API. Nothing is relaxed here.
 */
/**
 * PROFILE — what KIND of run produced the receipt. Caller-owned, never inferred from the
 * receipt: an untrusted document must not choose which rules it is judged by.
 *
 *   candidate : `workflow_dispatch` on a canonical branch ref. Offline preflight ONLY. Used to
 *               gate a fast-forward; never offered as evidence.
 *   delivery  : `push` on refs/heads/main. The evidence-bearing case.
 *
 * LEVEL — HOW MUCH is checked. Orthogonal to profile, which is the distinction the previous
 * single `mode` collapsed:
 *
 *   offline   : structure, code-owned identity, and the head_sha binding. No network.
 *   online    : everything offline does, plus authoritative GitHub API verification of the run,
 *               its jobs, its attempt, its artifacts and the inner archive digest.
 *
 * The four combinations are NOT all legal, and the illegal ones fail closed:
 *   candidate+offline  → the preflight. Legal.
 *   candidate+online   → REFUSED. A dispatch receipt can never be authoritative evidence, so
 *                        asking the API about it would lend it standing it must not have.
 *   delivery+offline   → legal, and necessary: the source CI run verifies its OWN archive before
 *                        uploading it, at which point its own conclusions do not yet exist.
 *   delivery+online    → the authoritative check a reviewer runs afterwards.
 */
export const RECEIPT_PROFILES = Object.freeze(['candidate', 'delivery']);
export const VERIFICATION_LEVELS = Object.freeze(['offline', 'online']);
/** A candidate receipt is a dispatch, and only a dispatch. */
export const CANDIDATE_EVENT = 'workflow_dispatch';

/**
 * A COMPLETE deterministic validator for `refs/heads/<branch>`, implementing
 * git-check-ref-format(1) rather than approximating it with a character class. The previous
 * permissive regex accepted refs git itself refuses — `refs/heads/..`, `refs/heads/foo.lock`,
 * `refs/heads/foo@{bar` — and a ref no real dispatch can carry is exactly the kind of value an
 * attacker-authored receipt would.
 *
 * Rules enforced (git-check-ref-format): no empty components (so no leading, trailing or double
 * slash); no component beginning with '.' or ending with '.lock'; no '..' anywhere; no ASCII
 * control characters, space, '~', '^', ':', '?', '*', '[' or '\'; no '@{'; not the single
 * component '@'; the branch cannot end with '.'.
 */
export function isCanonicalBranchRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('refs/heads/')) return false;
  const branch = ref.slice('refs/heads/'.length);
  if (branch.length === 0 || branch.endsWith('.')) return false;
  if (branch.includes('..') || branch.includes('@{') || branch.includes('\\')) return false;
  for (const ch of branch) {
    const code = ch.codePointAt(0);
    if (code < 0x20 || code === 0x7f) return false;
    if (' ~^:?*['.includes(ch)) return false;
  }
  for (const component of branch.split('/')) {
    if (component.length === 0) return false;
    if (component.startsWith('.') || component.endsWith('.lock')) return false;
    if (component === '@') return false;
  }
  return true;
}

const NUMERIC = /^[1-9][0-9]{0,17}$/;
const SHA40 = /^[0-9a-f]{40}$/;

/**
 * Validate the receipt's own shape BEFORE any network use, and return only the identifiers this
 * module is willing to act on. A field that fails here is never used to build a URL.
 */
export function validateReceiptShape(receipt, { requireHosted, profile }) {
  if (!RECEIPT_PROFILES.includes(profile)) {
    return {
      ok: false,
      problems: [
        `receipt profile ${JSON.stringify(profile)} is not one of ${RECEIPT_PROFILES.join(', ')}. `
        + 'The profile is caller-owned and must be stated explicitly; it is never inferred from the '
        + 'receipt, because an untrusted document must not choose the rules it is judged by.',
      ],
      ids: null,
    };
  }
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
  for (const field of [
    'api_url', 'html_url', 'repository', 'run_id', 'run_number', 'run_attempt', 'workflow',
    'workflow_ref', 'job', 'head_sha', 'ref', 'event', 'runner_os', 'runner_arch',
  ]) {
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
  if (!NUMERIC.test(receipt.run_number)) {
    problems.push(`run receipt run_number ${JSON.stringify(receipt.run_number)} is not a positive integer`);
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
  const exact = (field, want) => {
    if (receipt[field] !== want) {
      problems.push(`run receipt ${field} is ${JSON.stringify(receipt[field])}; expected ${JSON.stringify(want)}`);
    }
  };
  exact('workflow', WORKFLOW_NAME);
  exact('job', EXPECTED_JOB);
  exact('runner_os', EXPECTED_RUNNER_OS);
  exact('runner_arch', EXPECTED_RUNNER_ARCH);
  if (profile === 'delivery') {
    // Delivery is the evidence-bearing case: push, on main, from the exact workflow ref.
    exact('workflow_ref', EXPECTED_WORKFLOW_REF);
    exact('ref', EXPECTED_REF);
    exact('event', EXPECTED_EVENT);
  } else {
    // Candidate preflight: a dispatch on a branch is legitimate and must still be well formed.
    // What is NOT relaxed is the head_sha binding, checked by the caller against the source
    // receipt, and the shape of everything else.
    if (receipt.event !== CANDIDATE_EVENT) {
      problems.push(
        `run receipt event is ${JSON.stringify(receipt.event)}; a candidate preflight is `
        + `${CANDIDATE_EVENT} and nothing else`,
      );
    }
    if (!isCanonicalBranchRef(receipt.ref)) {
      problems.push(`run receipt ref ${JSON.stringify(receipt.ref)} is not a canonical branch ref`);
    }
    const wantPrefix = `${REPOSITORY}/${WORKFLOW_PATH}@`;
    if (!receipt.workflow_ref.startsWith(wantPrefix)) {
      problems.push(
        `run receipt workflow_ref ${JSON.stringify(receipt.workflow_ref)} does not name `
        + `${wantPrefix}<ref>`,
      );
    }
    if (receipt.workflow_ref !== `${wantPrefix}${receipt.ref}`) {
      problems.push(
        `run receipt workflow_ref ${JSON.stringify(receipt.workflow_ref)} disagrees with its own `
        + `ref ${JSON.stringify(receipt.ref)}`,
      );
    }
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
  exact('html_url', `https://github.com/${REPOSITORY}/actions/runs/${receipt.run_id}`);
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
      runNumber: receipt.run_number,
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
  requireArtifact = true, expectedArtifactDigest = null, profile, level,
} = {}) {
  const problems = [];
  const notes = [];
  if (!RECEIPT_PROFILES.includes(profile)) {
    return {
      ok: false,
      problems: [`receipt profile ${JSON.stringify(profile)} is not one of ${RECEIPT_PROFILES.join(', ')}`],
      notes,
    };
  }
  if (!VERIFICATION_LEVELS.includes(level)) {
    return {
      ok: false,
      problems: [`verification level ${JSON.stringify(level)} is not one of ${VERIFICATION_LEVELS.join(', ')}`],
      notes,
    };
  }
  // The illegal combinations, refused before anything else happens.
  if (profile === 'candidate' && (level === 'online' || requireHosted)) {
    return {
      ok: false,
      problems: [
        'a candidate preflight cannot be verified online or with --require-hosted. A '
        + 'workflow_dispatch receipt is not evidence, and asking the API about it would lend it '
        + 'standing it must not have.',
      ],
      notes,
    };
  }
  if (requireHosted && level !== 'online') {
    return {
      ok: false,
      problems: [
        'requiring hosted evidence demands authoritative online verification of the run, its jobs '
        + 'and its artifacts. Select online verification as well, or drop the hosted requirement; '
        + 'an offline pass under --require-hosted would claim an authority it never checked.',
      ],
      notes,
    };
  }
  const shape = validateReceiptShape(receipt, { requireHosted, profile });
  if (!shape.ok) {
    return {
      ok: false, problems: shape.problems, notes, local: shape.local === true, profile, level,
    };
  }
  if (shape.local === true) {
    // ONLINE verification is intrinsically about a hosted run: there is nothing the GitHub API
    // could authenticate for a locally packaged archive, so a local receipt fails online
    // verification REGARDLESS of the caller's requireHosted value. A caller must not be able to
    // reach a green online verdict by forgetting the second flag.
    if (level === 'online') {
      return {
        ok: false,
        problems: [
          'run receipt declares hosted=false. Online verification authenticates a hosted run '
          + 'against the GitHub API, and a locally packaged archive has no run the API could '
          + 'vouch for — this fails regardless of --require-hosted.',
        ],
        notes,
        local: true,
        profile,
        level,
      };
    }
    notes.push('run_receipt=LOCAL (not produced by a hosted run)');
    return { ok: true, problems, notes, local: true, profile, level };
  }
  const { runId, runAttempt, runNumber, headSha } = shape.ids;
  // THE BINDING, in every profile and at every level, stated exactly once. A verification that
  // vouched for a different commit than the one packaged would be worse than none.
  if (expectedHeadSha === undefined || expectedHeadSha === null) {
    problems.push('no source SHA was supplied to bind the run receipt against');
  } else if (headSha !== expectedHeadSha) {
    problems.push(`run receipt head_sha ${headSha} != the source receipt's ${expectedHeadSha}`);
  }
  notes.push(`profile=${profile} level=${level} event=${receipt.event} ref=${receipt.ref}`);
  if (level === 'offline') {
    // Structural self-verification. Legal for BOTH profiles: a candidate preflight is offline by
    // contract, and the source CI run must verify its own archive before its conclusions exist.
    // The verifier returns HERE, before any network access, rather than leaving a caller to
    // discard problems it did not want.
    return {
      ok: problems.length === 0, problems, notes, local: false, profile, level,
    };
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
  check('run number', b.run_number, runNumber);
  check('head_sha', b.head_sha, headSha);
  check('repository', b.repository?.full_name, REPOSITORY);
  check('event', b.event, EXPECTED_EVENT);
  check('head_branch', b.head_branch, EXPECTED_BRANCH);
  check('status', b.status, 'completed');
  check('conclusion', b.conclusion, 'success');
  check('workflow name', b.name, WORKFLOW_NAME);
  check('workflow path', b.path, WORKFLOW_PATH);
  notes.push(
    `github_run=${b.id} attempt=${b.run_attempt} head_sha=${b.head_sha} event=${b.event} `
    + `branch=${b.head_branch} path=${b.path} conclusion=${b.conclusion}`,
  );

  // ── JOBS: every required job must exist and have succeeded ──────────────────
  const jobs = await apiGet(jobsUrl(runId, runAttempt), { fetchImpl, token });
  if (!jobs.ok) {
    problems.push(`jobs endpoint failed: ${jobs.error}`);
  } else {
    const allJobs = Array.isArray(jobs.body?.jobs) ? jobs.body.jobs : [];
    if (!Array.isArray(jobs.body?.jobs)) {
      problems.push('GitHub jobs response has no jobs array');
    }
    if (!Number.isInteger(jobs.body?.total_count)
      || jobs.body.total_count !== allJobs.length) {
      problems.push(
        `GitHub jobs response total_count ${JSON.stringify(jobs.body?.total_count)} does not equal `
        + `the returned jobs length ${allJobs.length}`,
      );
    }
    const byName = new Map();
    for (const j of allJobs) {
      if (byName.has(j.name)) problems.push(`GitHub reports duplicate jobs named '${j.name}'`);
      else byName.set(j.name, j);
    }
    for (const name of REQUIRED_JOBS) {
      const j = byName.get(name);
      if (j === undefined) { problems.push(`GitHub reports no job named '${name}' for this run`); continue; }
      if (j.conclusion !== 'success') {
        problems.push(`GitHub reports job '${name}' concluded ${JSON.stringify(j.conclusion)}, not success`);
      }
      if (j.head_sha !== headSha) {
        problems.push(`GitHub reports job '${name}' at head_sha ${JSON.stringify(j.head_sha)}, not ${headSha}`);
      }
    }
    const sc = byName.get('supply-chain');
    if (sc !== undefined) {
      if (sc.status !== 'completed') {
        problems.push(`GitHub reports supply-chain job status ${JSON.stringify(sc.status)}, not completed`);
      }
      if (!Array.isArray(sc.labels) || !sc.labels.includes(EXPECTED_RUNNER_LABEL)) {
        problems.push(
          `GitHub reports supply-chain job labels ${JSON.stringify(sc.labels)}; `
          + `the code-owned '${EXPECTED_RUNNER_LABEL}' label is required`,
        );
      }
      const steps = new Map();
      if (!Array.isArray(sc.steps)) {
        problems.push('GitHub supply-chain job has no steps array');
      }
      for (const s of Array.isArray(sc.steps) ? sc.steps : []) {
        if (steps.has(s.name)) problems.push(`GitHub reports duplicate supply-chain steps named '${s.name}'`);
        else steps.set(s.name, s);
      }
      for (const name of REQUIRED_SUPPLY_CHAIN_STEPS) {
        const st = steps.get(name);
        if (st === undefined) {
          problems.push(`GitHub reports no supply-chain step named '${name}'`);
        } else {
          if (st.status !== 'completed') {
            problems.push(
              `GitHub reports supply-chain step '${name}' status ${JSON.stringify(st.status)}, not completed`,
            );
          }
          if (st.conclusion !== 'success') {
            problems.push(`GitHub reports supply-chain step '${name}' concluded ${JSON.stringify(st.conclusion)}`);
          }
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
      const all = Array.isArray(arts.body?.artifacts) ? arts.body.artifacts : [];
      if (!Array.isArray(arts.body?.artifacts)) {
        problems.push('GitHub artifacts response has no artifacts array');
      }
      // total_count is validated over the COMPLETE response, before any filtering, so a truncated
      // or padded page cannot hide or invent an artifact.
      if (!Number.isInteger(arts.body?.total_count) || arts.body.total_count !== all.length) {
        problems.push(
          `GitHub artifacts response total_count ${JSON.stringify(arts.body?.total_count)} does not equal `
          + `the returned artifacts length ${all.length}`,
        );
      }
      const picked = selectAttemptArtifact(all, {
        prefixForAttempt: artifactPrefixForAttempt,
        attempt: runAttempt,
        digest: expectedArtifactDigest,
        familyPrefix: REQUIRED_ARTIFACT_PREFIX,
        label: 'source evidence artifact',
      });
      problems.push(...picked.problems);
      notes.push(...picked.notes);
      const a = picked.artifact;
      if (a !== null) {
        if (a.expired !== false) {
          problems.push(`artifact '${a.name}' is expired or does not declare expired=false`);
        }
        if (!Number.isInteger(a.size_in_bytes) || a.size_in_bytes <= 0) {
          problems.push(`artifact '${a.name}' has invalid size_in_bytes ${JSON.stringify(a.size_in_bytes)}`);
        }
        if (a.workflow_run?.head_sha !== headSha) {
          problems.push(`artifact '${a.name}' is bound to head_sha ${JSON.stringify(a.workflow_run?.head_sha)}, not ${headSha}`);
        }
        if (a.workflow_run?.id !== Number(runId)) {
          problems.push(
            `artifact '${a.name}' is bound to workflow_run.id ${JSON.stringify(a.workflow_run?.id)}, not ${runId}`,
          );
        }
        if (typeof a.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(a.digest)) {
          problems.push(`artifact '${a.name}' has no valid GitHub wrapper digest`);
        }
        notes.push(
          `github_artifact=${a.name} inner_sha256=${expectedArtifactDigest} wrapper_digest=${a.digest}`,
        );
      }
    }
  }
  return { ok: problems.length === 0, problems, notes, local: false, profile, level };
}

export const digestOf = (b) => createHash('sha256').update(b).digest('hex');
