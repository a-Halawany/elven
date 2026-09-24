/**
 * SIMULATION CAPABILITIES — Phase 5 (L8), stage P5-M3. Narrow interfaces over
 * SECURITY DEFINER ports; the experiment contract is bound at opening, the
 * outputs at completion, and a reproduction is recorded with its verdict.
 *
 * CP-6 B18 (0078): the completion carries its RESOURCE EVIDENCE to the port (`p_resource` — a signature change; a
 * stale caller fails loudly at the port); a completed run's result is INVALIDATED (simulation.invalidate_run) by a
 * person under `simulation.run.invalidate` or by the reproduce write itself under `simulation.reproduce` on an
 * unreproducible verdict caused by a withdrawn or retired input — the withdrawn SIM version admitted first in the same
 * write (`admitObject` on the invalidating capability, the FULL canonical row read by `runObject` for its header), and
 * the subscriptions matching the GraphChanged the service writes beside the event (`changeSubscriptions`).
 *
 * CP-6 B21 (0081, L8-I04, OBJ-29): `simulation.open_run` gains two arguments — the ACKNOWLEDGEMENT of a run whose own
 * contract lies outside the operating envelope (`p_envelope_ack`, a twin owner's or the domain administrator's) and the
 * CHALLENGE a re-run answers (`p_challenge_id`) — and answers the run's `twin_fitness`, `envelope`, `envelope_ack` and
 * `challenge_id`; the CHALLENGE ports (open, request a re-run, withdraw, decide — the upheld path invalidating under the
 * decide route's own action, trigger `challenge`) and the PROMOTION (`simulation.promote_result`) are the writes of
 * ChallengeWrites and PromoteWrites; the challenge, challenge-event and promotion tables are read back on the reads.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';
import type { CitedObjectRow, EnvelopeCheck } from './twin.capabilities.js';

/** B18 (D15, AU-TWN-0033): the resource evidence of an execution — what it took, on which process — measured by the service around the run; on the row (`p_resource`) and in SimulationCompleted. */
export interface Resource { elapsed_ms: number; samples_run: number; process: { node: string; platform: string; arch: string }; memory_rss_bytes: number }

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SimulationReads {
  readonly action: string;
  readRuns(): any;
  readRunEvents(): any;
  readReproductions(): any;
  /** B21 (0081): the challenges (simulation.challenges), their event ledger (simulation.challenge_events) and the promotions (simulation.promotions); the run's fitness and envelope columns ride readRuns(). */
  readChallenges(): any;
  readChallengeEvents(): any;
  readPromotions(): any;
  readTwins(): any;
  readVersions(): any;
  readElements(): any;
  readBehaviourModels(): any;
  /** The scenario trees and their branches (Phase 4), so a run binds the exact branch state it applies. */
  readScenarios(): any;
  readBranches(): any;
  /** The exact canonical object version a citation names (latest when version is null), under RLS. */
  citedObject(a: { objectType: string; id: string; version: number | null }): Promise<CitedObjectRow | undefined>;
  /** The version an object stood at, as of a record instant — what a run bound under its own cut-off may use. */
  versionAsOf(a: { objectType: string; id: string; at: string }): Promise<number | null>;
  /**
   * A scenario branch's state under BOTH of a run's cut-offs: a flip recorded after
   * `at` had not been written yet, and a flip caused by an observation after
   * `observedThrough` is one this run's world has not seen. The two instants come back
   * with it, so a refusal can say which clock refused and on what day.
   */
  branchStateAsOf(a: { branchId: string; at: string; observedThrough: string | null }):
    Promise<{ state: string; flipRecordedAt: string | null; flipObservedAt: string | null } | undefined>;
  /** The citations the SELECTED component's required inputs rest on — the selection rule lives in the port. */
  requiredCitations(a: { twinId: string; version: number; component: string }): Promise<Array<{ key: string; kind: string; id: string; version: number; digest: string }>>;
  rebuildProjections(): Promise<Array<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>>;
  /** B18 (0078): what is subscribed to a GraphChanged of this kind at publication — evidence for the event, never authority (the 0065 shape). */
  changeSubscriptions(a: { tenantId: string; domainId: string; changeKind: string }): Promise<Array<{ subscription_id: string; consumer_kind: string }>>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type ShockBasis = 'none' | 'hypothetical' | 'scenario-branch-flipped';

export interface OpenRunArgs {
  runId: string; tenantId: string; domainId: string; twinId: string; twinVersion: number; runKind: 'control' | 'intervention';
  controlRunId: string | null; correctsRunId: string | null;
  scenarioId: string | null; scenarioBranchId: string | null; scenarioVersion: number | null; scenarioBranchState: string | null;
  shock: boolean; shockBasis: ShockBasis; component: string;
  modelRef: string; implementationDigest: string; environmentDigest: string; environment: unknown;
  stochasticMode: 'deterministic' | 'seeded'; rng: string | null; seed: number | null; samples: number | null; jitter: unknown | null;
  interventions: unknown[]; constraints: Record<string, unknown>; assumptions: Record<string, unknown>; inputsDigest: string; validationStatus: string;
  /** Folded by the service from the twin version and the scenario; the port refuses anything less restricted than the twin's. */
  controls: unknown;
  /** B21 (0081, D3 b): the acknowledgement of a run whose own contract lies OUTSIDE the envelope — `{ acknowledge: true, reason }` by a twin owner or the domain administrator (the port checks the holder); null otherwise. */
  envelopeAck: { acknowledge: boolean; reason: string } | null;
  /** B21 (0081, D11): the challenge this run is the RE-RUN of (`rerun_requested`, on the run `correctsRunId` names); null for an ordinary run. */
  challengeId: string | null;
  actor: string; eventId: string; correlationId: string;
}
export interface OpenedRun {
  initial_state: unknown[]; initial_state_digest: string; known_at: string; observed_through: string | null; branch_id: string;
  synthetic_state: boolean; controls: unknown; verification_state: string; scenario_flip_event: string | null;
  /** B21 (0081): the twin version's fitness_state copied at opening; the run's OWN envelope check (horizon_days from the constraints); the acknowledgement recorded, if any; the challenge answered, if any. */
  twin_fitness: string; envelope: EnvelopeCheck; envelope_ack: Record<string, unknown> | null; challenge_id: string | null;
}

export interface RunWrites extends SimulationReads {
  openRun(a: OpenRunArgs): Promise<OpenedRun>;
}
export interface CompleteWrites extends SimulationReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  /** B18 (0078): `resource` — the evidence measured around the execution — lands on the row and in run.completed (`p_resource`). */
  completeRun(a: { runId: string; tenantId: string; domainId: string; outputs: unknown; outputsDigest: string; sensitivity: unknown; outsideEnvelope: boolean;
                   headerDigest: string; resource: Resource; actor: string; eventId: string; correlationId: string }): Promise<void>;
  failRun(a: { runId: string; tenantId: string; domainId: string; failure: string; actor: string; eventId: string; correlationId: string }): Promise<void>;
}
/**
 * B18 (0078, L8-I05): the INVALIDATION of a completed run's result — the withdrawn SIM version admitted, then the port
 * (simulation.invalidate_run: validity, the reason, the trigger and its reference, the dependants named, run.invalidated).
 * Held by the invalidate route (`simulation.run.invalidate`) and by the reproduce write (`simulation.reproduce`).
 */
export interface InvalidateWrites extends SimulationReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  /** B21 (0081): the trigger vocabulary gains `challenge` — an upheld challenge invalidates under simulation.challenge.decide with the challenge as the reference. */
  invalidateRun(a: { runId: string; tenantId: string; domainId: string; reason: string; trigger: 'operator' | 'reproduction' | 'challenge'; triggerRef: string | null;
                     actor: string; eventId: string; correlationId: string }): Promise<Record<string, unknown>>;
  /**
   * C14: the FULL objects.canonical_objects row of a run's SIM object — the latest version, or the exact one named — under RLS
   * (the B17 latestRowOf idiom): the withdrawn header is built from every header field, never from citedObject's subset.
   */
  runObject(a: { runId: string; tenantId: string; domainId: string; version: number | null }): Promise<Record<string, unknown> | undefined>;
}
/** A reproduction records its verdict and, on an unreproducible one caused by a withdrawn or retired input, invalidates in the same write. */
export interface ReproduceWrites extends InvalidateWrites {
  recordReproduction(a: { reproductionId: string; tenantId: string; domainId: string; runId: string; verdict: 'reproduced' | 'mismatch' | 'unreproducible';
                          expected: string; actual: string | null; reason: string; environmentDigest: string; environmentMatches: boolean; cold: boolean;
                          actor: string; eventId: string; correlationId: string }): Promise<void>;
}
/**
 * B21 (0081, L8-I04): the CHALLENGE of a completed run's result — a typed dispute opened by a person (one live challenge
 * per run per opener), sent to a governed re-run, withdrawn by its opener, or DECIDED by someone who is neither the opener
 * nor the run's operator; an UPHELD decision invalidates the run in the same write (the InvalidateWrites it extends:
 * `admitObject`, `runObject`, `invalidateRun` with trigger `challenge`, `changeSubscriptions`). Every port takes the run
 * beside the challenge (C6: the route is bound to the run; a challenge that is not the run's is refused by the port).
 */
export interface ChallengeWrites extends InvalidateWrites {
  openChallenge(a: { challengeId: string; runId: string; tenantId: string; domainId: string; kind: string; statement: string; disputed: unknown;
                     actor: string; eventId: string; correlationId: string }): Promise<Record<string, unknown>>;
  requestRerun(a: { challengeId: string; runId: string; tenantId: string; domainId: string; note: string | null; actor: string; eventId: string; correlationId: string }): Promise<Record<string, unknown>>;
  withdrawChallenge(a: { challengeId: string; runId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Record<string, unknown>>;
  decideChallenge(a: { challengeId: string; runId: string; tenantId: string; domainId: string; decision: string; note: string; actor: string; eventId: string; correlationId: string }): Promise<Record<string, unknown>>;
}
/** B21 (0081, OBJ-29): a reviewer other than the operator promotes a completed, valid, undisputed result as fit for a stated use (simulation.promote_result); no outbox event — the state rides the reads. */
export interface PromoteWrites extends SimulationReads {
  promoteResult(a: { promotionId: string; runId: string; tenantId: string; domainId: string; promotedFor: string; limitations: string[]; note: string;
                     actor: string; eventId: string; correlationId: string }): Promise<Record<string, unknown>>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class SimulationCapabilityImpl implements RunWrites, CompleteWrites, InvalidateWrites, ReproduceWrites, ChallengeWrites, PromoteWrites {
  readonly #tx: Tx; readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { const r = await q.execute(this.#tx); return r.rows as T[]; }

  readRuns(): any { return this.from('simulation.runs_current'); }
  readRunEvents(): any { return this.from('simulation.run_events'); }
  readReproductions(): any { return this.from('simulation.reproductions'); }
  readChallenges(): any { return this.from('simulation.challenges'); }
  readChallengeEvents(): any { return this.from('simulation.challenge_events'); }
  readPromotions(): any { return this.from('simulation.promotions'); }
  readTwins(): any { return this.from('twin.twins_current'); }
  readVersions(): any { return this.from('twin.twin_versions'); }
  readElements(): any { return this.from('twin.state_elements'); }
  readBehaviourModels(): any { return this.from('twin.behaviour_models'); }
  readScenarios(): any { return this.from('prediction.scenarios_current'); }
  readBranches(): any { return this.from('prediction.branches_current'); }

  async versionAsOf(a: { objectType: string; id: string; at: string }): Promise<number | null> {
    const rows = await this.call<{ v: number | null }>(sql`select max(o.object_version)::int as v from objects.canonical_objects o
       where o.object_type = ${a.objectType} and o.object_id = ${a.id}::uuid and o.recorded_at <= ${a.at}::timestamptz`);
    const v = rows[0]?.v;
    return v === null || v === undefined ? null : Number(v);
  }

  async branchStateAsOf(a: { branchId: string; at: string; observedThrough: string | null }):
    Promise<{ state: string; flipRecordedAt: string | null; flipObservedAt: string | null } | undefined> {
    const rows = await this.call<{ s: string | null; recorded: string | null; observed: string | null }>(sql`
      select prediction.branch_state_as_of(${a.branchId}::uuid, ${a.at}::timestamptz, ${a.observedThrough}::date) as s,
             to_char(b.flipped_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as recorded,
             prediction.branch_flip_observed_at(${a.branchId}::uuid)::text as observed
        from prediction.branches_current b where b.branch_id = ${a.branchId}::uuid`);
    const r = rows[0];
    if (r === undefined || r.s === null) return undefined;
    return { state: r.s, flipRecordedAt: r.recorded, flipObservedAt: r.observed };
  }

  async requiredCitations(a: { twinId: string; version: number; component: string }): Promise<Array<{ key: string; kind: string; id: string; version: number; digest: string }>> {
    const rows = await this.call<{ c: Array<{ key: string; kind: string; id: string; version: number; digest: string }> }>(
      sql`select twin.required_citations(${a.twinId}::uuid, ${a.version}::int, ${a.component}) as c`);
    return rows[0]?.c ?? [];
  }

  async citedObject(a: { objectType: string; id: string; version: number | null }): Promise<CitedObjectRow | undefined> {
    const rows = await this.call<CitedObjectRow>(sql`
      select o.object_id::text, o.object_type, o.object_version::int, o.content_digest, o.lifecycle_state, o.truth_state,
             o.synthetic_state, o.classification, o.rights_profile, o.residency_profile, o.retention_profile, o.access_policy_ref,
             to_char(o.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as recorded_at,
             to_char(o.observation_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as observation_time,
             to_char(o.event_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as event_time,
             o.quality_state, o.payload
        from objects.canonical_objects o
       where o.object_type = ${a.objectType} and o.object_id = ${a.id}::uuid
         and (${a.version}::int is null or o.object_version = ${a.version}::int)
       order by o.object_version desc limit 1`);
    return rows[0];
  }

  async rebuildProjections() {
    return this.call<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>(
      sql`select projection, live_rows::text, rebuilt_rows::text, mismatched::text from simulation.rebuild_projections()`);
  }
  async changeSubscriptions(a: { tenantId: string; domainId: string; changeKind: string }): Promise<Array<{ subscription_id: string; consumer_kind: string }>> {
    const rows = await this.call<{ s: Array<{ subscription_id: string; consumer_kind: string }> }>(sql`select graph.subscriptions_matching(${a.tenantId}::uuid, ${a.domainId}::uuid, 'GraphChanged', ${a.changeKind}) as s`);
    return rows[0]?.s ?? [];
  }
  async runObject(a: { runId: string; tenantId: string; domainId: string; version: number | null }): Promise<Record<string, unknown> | undefined> {
    let q = this.from('objects.canonical_objects').selectAll()
      .where('object_type' as never, '=', 'SIM' as never).where('object_id' as never, '=', a.runId as never)
      .where('tenant_id' as never, '=', a.tenantId as never).where('domain_id' as never, '=', a.domainId as never);
    if (a.version !== null) q = q.where('object_version' as never, '=', a.version as never);
    return (await q.orderBy('object_version' as never, 'desc').limit(1).executeTakeFirst()) as Record<string, unknown> | undefined;
  }

  async openRun(a: OpenRunArgs): Promise<OpenedRun> {
    const rows = await this.call<{ r: OpenedRun }>(sql`select simulation.open_run(
      ${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.twinVersion}::int, ${a.runKind}, ${a.controlRunId}::uuid, ${a.correctsRunId}::uuid,
      ${a.scenarioId}::uuid, ${a.scenarioBranchId}::uuid, ${a.scenarioVersion}::int, ${a.scenarioBranchState}, ${a.shock}, ${a.shockBasis}, ${a.component},
      ${a.modelRef}, ${a.implementationDigest}, ${a.environmentDigest}, ${JSON.stringify(a.environment)}::jsonb,
      ${a.stochasticMode}, ${a.rng}, ${a.seed}::bigint, ${a.samples}::int, ${a.jitter === null ? null : JSON.stringify(a.jitter)}::jsonb,
      ${JSON.stringify(a.interventions)}::jsonb, ${JSON.stringify(a.constraints)}::jsonb, ${JSON.stringify(a.assumptions)}::jsonb, ${a.inputsDigest}, ${a.validationStatus},
      ${JSON.stringify(a.controls ?? {})}::jsonb, ${a.envelopeAck === null ? null : JSON.stringify(a.envelopeAck)}::jsonb, ${a.challengeId}::uuid,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r;
    if (r === undefined) throw new Error('open_run returned no row');
    return r;
  }

  // ───────────────────────── B21 (0081): the challenge ports and the promotion ─────────────────────────
  /** simulation.open_challenge(uuid,uuid,uuid,uuid,text,text,jsonb,uuid,uuid,uuid) — the port's jsonb answer, whole. */
  async openChallenge(a: Parameters<ChallengeWrites['openChallenge']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select simulation.open_challenge(
      ${a.challengeId}::uuid, ${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.statement},
      ${a.disputed === null || a.disputed === undefined ? null : JSON.stringify(a.disputed)}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  /** simulation.request_rerun(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid): (p_challenge_id, p_run_id, …) — C6. */
  async requestRerun(a: Parameters<ChallengeWrites['requestRerun']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select simulation.request_rerun(
      ${a.challengeId}::uuid, ${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  /** simulation.withdraw_challenge(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid): (p_challenge_id, p_run_id, …) — C6. */
  async withdrawChallenge(a: Parameters<ChallengeWrites['withdrawChallenge']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select simulation.withdraw_challenge(
      ${a.challengeId}::uuid, ${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  /** simulation.decide_challenge(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid): (p_challenge_id, p_run_id, …, p_decision, p_note, …) — C6. */
  async decideChallenge(a: Parameters<ChallengeWrites['decideChallenge']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select simulation.decide_challenge(
      ${a.challengeId}::uuid, ${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.note},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  /** simulation.promote_result(uuid,uuid,uuid,uuid,text,text[],text,uuid,uuid,uuid) — the port's jsonb answer, whole. */
  async promoteResult(a: Parameters<PromoteWrites['promoteResult']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select simulation.promote_result(
      ${a.promotionId}::uuid, ${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.promotedFor}, ${a.limitations}::text[], ${a.note},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }

  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(
      ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }

  async completeRun(a: Parameters<CompleteWrites['completeRun']>[0]): Promise<void> {
    await this.call(sql`select simulation.complete_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.outputs)}::jsonb, ${a.outputsDigest},
      ${JSON.stringify(a.sensitivity)}::jsonb, ${a.outsideEnvelope}, ${a.headerDigest}, ${JSON.stringify(a.resource)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async invalidateRun(a: Parameters<InvalidateWrites['invalidateRun']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select simulation.invalidate_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.trigger},
      ${a.triggerRef}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async failRun(a: Parameters<CompleteWrites['failRun']>[0]): Promise<void> {
    await this.call(sql`select simulation.fail_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.failure}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async recordReproduction(a: Parameters<ReproduceWrites['recordReproduction']>[0]): Promise<void> {
    await this.call(sql`select simulation.record_reproduction(${a.reproductionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.verdict},
      ${a.expected}, ${a.actual}, ${a.reason}, ${a.environmentDigest}, ${a.environmentMatches}, ${a.cold}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const SimulationCapability = {
  read(tx: Tx, action: string): SimulationReads { return new SimulationCapabilityImpl(tx, action); },
  run(tx: Tx, action: string): RunWrites { return new SimulationCapabilityImpl(tx, action); },
  complete(tx: Tx, action: string): CompleteWrites { return new SimulationCapabilityImpl(tx, action); },
  reproduce(tx: Tx, action: string): ReproduceWrites { return new SimulationCapabilityImpl(tx, action); },
  /** B18 (0078): the invalidate route's capability — a person's act on a completed run's result. */
  invalidate(tx: Tx, action: string): InvalidateWrites { return new SimulationCapabilityImpl(tx, action); },
  /** B21 (0081): the four challenge routes' capability (open, rerun, withdraw, decide — the upheld path invalidates on it). */
  challenge(tx: Tx, action: string): ChallengeWrites { return new SimulationCapabilityImpl(tx, action); },
  /** B21 (0081, OBJ-29): the promote route's capability (simulation.result.promote, human-gated). */
  promote(tx: Tx, action: string): PromoteWrites { return new SimulationCapabilityImpl(tx, action); },
};
