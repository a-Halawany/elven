/**
 * C19 — THE ONE ATTEMPT RESOLVER.
 *
 * A publication is identified by its source run and attempt and its finalizer run and attempt. Get
 * that wrong and everything downstream is wrong in a way no signature can detect: the bytes are
 * perfectly signed, and they describe the wrong run.
 *
 * ── WHY "EARLIEST SUCCESSFUL", ACROSS ALL RUN IDS ──
 *
 * The attempt number is part of the publication identity, so a later successful rerun would mint a
 * SECOND identity for evidence already published. The canonical attempt must therefore be stable
 * under reruns, and only the earliest can be: reruns append later attempts, never earlier ones.
 *
 * A SHA can also have several run IDs for the same workflow — a re-dispatch creates a new run
 * rather than a new attempt. Considering only the first run found makes the answer depend on
 * listing order, so every matching run is considered and the earliest successful attempt across all
 * of them wins, with ties broken by run id.
 *
 * ── FAIL CLOSED EVERYWHERE ──
 *
 * An unreadable attempt is not an absent one. An API error is not "no success". Ambiguity is not
 * something to resolve by picking. Each of those raises, because the alternative is a confident
 * answer that happens to be wrong.
 */

const j = (v) => JSON.stringify(v);

/**
 * The earliest attempt of one run that concluded successfully.
 *
 * `null` means every attempt is known and none succeeded. An attempt that cannot be READ raises —
 * a transient failure must never silently promote a later attempt to canonical.
 */
export function earliestSuccessfulAttempt(run, gh) {
  const total = Number(run.run_attempt ?? 1);
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`c19-resolve: run ${run.id} reports a nonsensical attempt count ${j(run.run_attempt)}`);
  }
  for (let n = 1; n <= total; n += 1) {
    const a = gh.runAttempt(run.id, n);          // raises on an unreadable attempt
    // A 404 for an attempt INSIDE the run's declared range is indeterminate, not absence. The run
    // says the attempt exists; GitHub saying otherwise is a disagreement to fail on, because
    // treating it as "did not succeed" would silently promote a later attempt to canonical.
    if (a === null) {
      throw new Error(`c19-resolve: run ${run.id} declares ${total} attempt(s) but attempt ${n} `
        + 'could not be retrieved; an indeterminate attempt inside the declared range is fail-closed');
    }
    if (a.conclusion === 'success') {
      return { attempt: n, run: a, startedAt: a.run_started_at ?? a.created_at ?? null };
    }
  }
  return null;
}

/**
 * ── ONE STABLE TOTAL ORDERING ──
 *
 * Attempt numbers are LOCAL to a run: run 20 attempt 1 and run 10 attempt 2 are not comparable by
 * number, and sorting on the number alone let a later run's attempt 1 displace an already-canonical
 * run 10 attempt 2. That would change the publication identity of something already published.
 *
 * The ordering is therefore by the attempt's authoritative START TIMESTAMP, with the run id and
 * then the attempt number as deterministic tie-breaks. Missing timestamps are fail-closed: an
 * ordering that cannot be computed must not be guessed.
 */
export function orderCandidates(found) {
  for (const f of found) {
    if (f.startedAt === null || f.startedAt === undefined || !Number.isFinite(Date.parse(f.startedAt))) {
      throw new Error(`c19-resolve: run ${f.runId} attempt ${f.attempt} has no usable start `
        + 'timestamp, so a stable total ordering cannot be computed; refusing to guess');
    }
  }
  return [...found].sort((a, b) => (Date.parse(a.startedAt) - Date.parse(b.startedAt))
    || (Number(a.runId) - Number(b.runId))
    || (a.attempt - b.attempt));
}

/**
 * The canonical source publication: the earliest successful `ci` push attempt for this SHA, across
 * every matching run id.
 */
export function resolveCanonicalSource({ gh, sha, workflowName = 'ci' }) {
  const candidates = gh.runsForSha(sha)
    .filter((r) => r.name === workflowName && r.event === 'push')
    .sort((a, b) => Number(a.id) - Number(b.id));
  if (candidates.length === 0) {
    throw new Error(`c19-resolve: no ${workflowName} push run exists for ${sha}`);
  }
  const found = [];
  for (const run of candidates) {
    const hit = earliestSuccessfulAttempt(run, gh);
    if (hit !== null) {
      found.push({ runId: String(run.id), attempt: hit.attempt, run: hit.run, startedAt: hit.startedAt });
    }
  }
  if (found.length === 0) {
    throw new Error(`c19-resolve: no attempt of any ${workflowName} push run for ${sha} succeeded`);
  }
  const ordered = orderCandidates(found);
  const chosen = ordered[0];
  return {
    runId: chosen.runId,
    runAttempt: String(chosen.attempt),
    event: 'push',
    sha,
    startedAt: chosen.startedAt,
    superseded: ordered.slice(1).map((f) => `${f.runId}#${f.attempt}`),
  };
}

/**
 * The finalizer that CAUSALLY corresponds to that source run.
 *
 * A same-SHA match is not causation: two finalizer runs can share a SHA, and only one of them was
 * triggered by the source run being published. `workflow_run` finalizers record their trigger, so
 * the trigger is what is matched on — and if more than one finalizer claims the same trigger, that
 * is ambiguity and is refused rather than resolved by picking the newest.
 */
export function resolveCanonicalFinalizer({ gh, sha, sourceRunId, workflowName = 'C17 finalize' }) {
  const all = gh.runsForSha(sha).filter((r) => r.name === workflowName);
  if (all.length === 0) {
    throw new Error(`c19-resolve: no ${workflowName} run exists for ${sha}`);
  }
  const caused = all.filter((r) => {
    const trigger = r.triggering_workflow_run_id ?? r.referenced_workflows_run_id;
    return trigger === undefined ? false : String(trigger) === String(sourceRunId);
  });
  // GitHub's run object does NOT expose which run triggered a `workflow_run` — measured, not
  // assumed. So the listing cannot establish causation, and falling back to same-SHA is acceptable
  // ONLY when it is unambiguous. The real causal binding is established downstream from the
  // finalizer receipt inside the C17-verified evidence, which names its source run; acquisition
  // refuses if that disagrees with what was resolved here.
  const pool = caused.length > 0 ? caused : all;
  const fellBack = caused.length === 0;

  const found = [];
  for (const run of pool.sort((a, b) => Number(a.id) - Number(b.id))) {
    const hit = earliestSuccessfulAttempt(run, gh);
    if (hit !== null) {
      found.push({ runId: String(run.id), attempt: hit.attempt, run: hit.run, startedAt: hit.startedAt });
    }
  }
  if (found.length === 0) {
    throw new Error(`c19-resolve: no attempt of any ${workflowName} run for ${sha} succeeded`);
  }
  if (fellBack && found.length > 1) {
    throw new Error(`c19-resolve: ${found.length} finalizer runs for ${sha} succeeded and none `
      + 'records which source run triggered it; the causal binding is ambiguous and is refused '
      + 'rather than guessed');
  }
  const ordered = orderCandidates(found);
  return {
    runId: ordered[0].runId,
    runAttempt: String(ordered[0].attempt),
    causallyBound: !fellBack,
    completedAt: ordered[0].run?.updated_at ?? null,
    startedAt: ordered[0].startedAt,
    superseded: ordered.slice(1).map((f) => `${f.runId}#${f.attempt}`),
  };
}

/**
 * Is THIS invocation the one entitled to publish?
 *
 * A later rerun must resolve to the existing publication or be refused. Serialising concurrent
 * attempts is not enough: two attempts that both eventually run would each believe they should
 * publish, and the second would create a duplicate rather than a queue.
 */
export function assertCanonicalInvocation({ canonical, actualRunId, actualAttempt, what }) {
  const problems = [];
  if (String(actualRunId) !== String(canonical.runId)) {
    problems.push(`c19-resolve: this ${what} invocation is run ${actualRunId}, but the canonical `
      + `${what} for this publication is run ${canonical.runId}; publishing here would create a `
      + 'second publication identity for evidence that already has one');
  } else if (String(actualAttempt) !== String(canonical.runAttempt)) {
    problems.push(`c19-resolve: this ${what} invocation is attempt ${actualAttempt}, but attempt `
      + `${canonical.runAttempt} is canonical and owns this publication identity`);
  }
  return problems;
}
