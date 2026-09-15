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
  | 'f44.after_shared_digest_resolved_before_commit'
  // CP-6 B11 — the archive executor's copy into the archive tier (0070 §2; D3): before the write, and after the rename before the port records the move
  | 'b11.archive_copy_partial'
  | 'b11.archive_after_copy_before_record'
  // CP-6 B11 closure (0071; Codex B11-F1) — the rollback cleanup of the copies an execution created, before the first removal (a HOLD point)
  | 'b11.archive_cleanup_before_remove';

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
  // A hold still armed, or fired and not yet released, is released when the test disarms, so the code under test never waits on a test
  // that has moved on (a failed assertion, an afterAll).
  for (const h of holds.values()) h.release();
  holds.clear();
  for (const h of fired) h.release();
  fired.clear();
}

/*
 * A HOLD (CP-6 B11 closure, 0071; Codex B11-F1). A fault makes the code under test CRASH at a boundary; a hold makes it WAIT
 * there — not a branch, not a crash: the same shipped code runs, delayed until the test releases it — so two governed
 * executions can be interleaved deterministically at a durable boundary (an archive copy made, the record not yet written;
 * the rollback cleanup about to remove what the execution created) with the other execution running against the real
 * database and vault in between. The same two properties hold: a hold can only be armed in the test profile, and `pause()`
 * is inert (returns at once) unless a hold is armed at its point. A hold fires once. Holds are placed only where a
 * cross-execution interleaving is meaningful; `pause()` is async, `at()` stays synchronous.
 */
interface Hold { reached: () => void; released: Promise<void>; release: () => void }
const holds = new Map<InjectionPoint, Hold>();
/** Holds that fired and are waiting for their release (so `disarm()` can release them too). */
const fired = new Set<Hold>();

/** Arm a hold at a point: `reached` resolves when the code under test arrives there; `release()` lets it continue. */
export function hold(point: InjectionPoint, runtimeEnv: string): { reached: Promise<void>; release: () => void } {
  if (runtimeEnv !== 'test') {
    throw new Error('a hold may only be armed in the test runtime profile');
  }
  let reachedResolve: () => void = () => undefined; let releaseResolve: () => void = () => undefined;
  const reached = new Promise<void>((r) => { reachedResolve = r; });
  const released = new Promise<void>((r) => { releaseResolve = r; });
  const h: Hold = { reached: reachedResolve, released, release: () => { releaseResolve(); fired.delete(h); } };
  holds.set(point, h);
  return { reached, release: h.release };
}

/** The hold point itself: returns at once unless a hold is armed here, in which case the code under test waits for its release. */
export async function pause(point: InjectionPoint): Promise<void> {
  const h = holds.get(point);
  if (h === undefined) return;
  holds.delete(point); // fire once: the next execution through this point does not wait
  fired.add(h);
  h.reached();
  await h.released;
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
