/**
 * Deterministic fault injection for the §5 acquisition lifecycle (PHASE1_PLAN
 * §5.13, acceptance A4).
 *
 * F01–F46 each name ONE numbered step and ONE durable sub-boundary: a write, an
 * fsync, a rename/link, a digest verification, a transaction begin/commit/abort,
 * an individual row insert, an outbox insert, a queue add, or a checkpoint
 * append. Making those tests executable means the production code has to be able
 * to stop at exactly those points — which is what this module provides.
 *
 * TWO PROPERTIES KEEP IT HONEST:
 *
 *  1. IT IS INERT UNLESS ARMED, AND ARMING IS NOT REACHABLE FROM A REQUEST. The
 *     armed set lives in module state that only the test process populates, and
 *     `arm()` refuses outright when the runtime profile is not `test`. A
 *     production process cannot be talked into injecting a fault by any input.
 *  2. IT INJECTS A CRASH, NOT A BRANCH. `at()` either returns or throws; there is
 *     no "fault mode" parameter threaded through the lifecycle that could make
 *     the tested path differ from the shipped one. The code under test is the
 *     code that ships.
 */
export type InjectionPoint =
  // step 1 — authorize
  | 'f02.after_agent_auth'
  | 'f03.after_scope_resolution'
  | 'f04.after_pdp_decision'
  // step 2 — POL/AUD + run.started (ONE transaction)
  | 'f05.in_run_start_tx_before_commit'
  | 'f06.at_run_start_commit'
  | 'f07.after_run_start_commit'
  // step 3 — pre-egress revalidation
  | 'f09.after_revalidation_before_egress'
  // step 4 — bounded external acquisition
  | 'f10.mid_acquisition'
  | 'f11.after_acquisition_before_open'
  // step 5 — quarantine store
  | 'f12.quarantine_write_partial'
  | 'f13.after_write_before_rename'
  // step 6 — durability + digest verification
  | 'f14.after_fsync_before_reread'
  | 'f15.digest_mismatch'
  // step 7 — validation
  | 'f16.during_validation'
  // step 8a/8b — admitted candidate
  | 'f17.candidate_write_partial'
  | 'f18.after_candidate_fsync_before_reread'
  | 'f19.candidate_digest_mismatch'
  // step 8c/8d — transaction + locked contract re-read
  | 'f20.after_tx_open_before_lock'
  | 'f22.while_holding_contract_lock'
  // step 8e — the seven durable writes, one row at a time
  | 'f23.after_manifest_before_obs'
  | 'f23a.after_obs_before_evd'
  | 'f23b.after_evd_before_custody'
  | 'f23c.after_custody_before_pol'
  | 'f23d.after_pol_before_aud'
  | 'f23e.after_aud_before_outbox'
  | 'f23f.after_outbox_before_commit'
  | 'f24.at_admission_commit'
  | 'f25.after_admission_commit'
  // step 8f — finalize + tombstone
  | 'f26.after_finalized_custody_before_tombstone'
  | 'f27.during_quarantine_tombstone'
  // step 9 — checkpoint
  | 'f28.before_checkpoint_append'
  | 'f29.during_checkpoint_append'
  | 'f30.after_checkpoint_append'
  // step 10 — publish
  | 'f31.queue_add_fails'
  | 'f32.after_queue_add_before_ack'
  // step 11 — sweeper
  | 'f34.during_sweeper_item'
  | 'f35.sweeper_poison_item'
  | 'f36.sweeper_between_classify_and_act'
  // step 12 — idempotency vs. evidence identity
  | 'f37.after_attempt_key_before_lookup'
  | 'f38.during_attempt_lookup'
  | 'f39.replay_before_noop_event'
  | 'f40.during_noop_event_append'
  | 'f41.after_noop_before_response'
  | 'f42.new_observation_before_obs_insert'
  | 'f44.after_shared_digest_resolved_before_commit';

/** Raised by an armed injection point. Distinguishable from a real failure. */
export class InjectedFault extends Error {
  readonly injected = true;
  constructor(readonly point: InjectionPoint) {
    super(`injected fault at ${point}`);
  }
}

const armed = new Set<InjectionPoint>();
let enabled = false;

/**
 * Arm injection points. Refused outside the test profile — an armed injector in
 * a running system would be a way to induce a crash on demand.
 */
export function arm(points: InjectionPoint[], runtimeEnv: string): void {
  if (runtimeEnv !== 'test') {
    throw new Error('fault injection may only be armed in the test runtime profile');
  }
  enabled = true;
  for (const p of points) armed.add(p);
}

export function disarm(): void {
  armed.clear();
  enabled = false;
}

export function isArmed(point: InjectionPoint): boolean {
  return enabled && armed.has(point);
}

/**
 * The injection point itself. One call, no parameters beyond the point name, so
 * a reader can see at a glance which durable boundary a given line sits on.
 */
export function at(point: InjectionPoint): void {
  if (enabled && armed.has(point)) {
    armed.delete(point); // fire once: the retry path must be able to complete
    throw new InjectedFault(point);
  }
}
