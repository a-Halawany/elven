/**
 * Source registry service — PHASE1_PLAN §7, L1-C01, acceptance A1.
 *
 * Registration writes TWO things in one governed transaction: the immutable SRC
 * canonical object (the contract as an object, versioned and digest-bound through
 * the existing objects.admit_version path — ADR-P1-01) and the registry
 * projection the acquisition path locks. The SRC object is what a reviewer reads
 * two years later; the projection is what the runtime enforces. They are written
 * together so they cannot disagree.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { ObservationReads, RegistryWrites } from '../observation.capabilities.js';
import { validateSourceContract, type SourceContractV1 } from './source-contract.js';
import { SchedulerService, type ScheduleRuntime } from '../scheduling/scheduler.service.js';

export interface SourceReadiness {
  /** live · live-unscheduled · replay · operator-upload · blocked-rights · blocked-credential · inactive */
  verdict: 'live' | 'live-unscheduled' | 'replay' | 'operator-upload' | 'blocked-rights' | 'blocked-credential' | 'inactive';
  reason: string;
  credential: string;
  scheduled: boolean; cadence_seconds: number | null;
  /**
   * Whether THIS deployment executes schedule entries at all. A schedule entry is a
   * recorded intention; a run is an observed fact. With the scheduler disabled the
   * entry is recorded and nothing polls, so every run shown here was operator-triggered.
   */
  scheduler_enabled: boolean;
  /**
   * Three distinct things about AUTOMATIC collection: the configured schedule entry
   * (a stored intention), the runtime (this deployment's scheduler flag, whether this
   * process runs a worker for the domain, the Redis scheduler and its next fire
   * time), and the observed attempts the worker recorded — the only evidence that a
   * scheduled run happened. A flag or an operator's collect is neither.
   */
  automatic: {
    schedule_entry: { status: string; cadence_seconds: number; scheduler_id: string } | null;
    runtime: ScheduleRuntime;
    last_attempt: ScheduledAttempt | null;
    last_success: ScheduledAttempt | null;
    attempts: { finished: number; failed: number; cancelled: number; budget_exceeded: number; refused: number };
  };
  last_run: { run_id: string; state: string; mode: string; finished_at: string | null; admitted: number; quarantined: number; noop: number; failure: string | null } | null;
  evidence_objects: number;
  health: { state: string; lag_class: string | null; evaluated_at: string } | null;
}

export interface ScheduledAttempt {
  attempt_id: string; job_id: string; outcome: string; run_id: string | null; reason: string | null;
  started_at: string; finished_at: string; admitted: number; noop: number; quarantined: number;
}

export interface SourceRow {
  source_id: string;
  contract_version: number;
  source_key: string;
  name: string;
  publisher: string;
  authority_class: string;
  connector_kind: string;
  acquisition_mode: string;
  data_origin: string;
  lifecycle_state: string;
  rights_state: string;
  registrar_principal_id: string;
  approver_principal_id: string | null;
  contract: SourceContractV1;
  [k: string]: unknown;
}

function bad(corr: string, msg: string, status = 422): HttpException {
  return new HttpException(errorBody('EYE_REQ_001', corr, msg), status);
}

@Injectable()
export class SourcesService {
  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig, private readonly scheduler: SchedulerService) {}
  /**
   * Register a source contract as `draft`. It cannot self-approve and it cannot
   * be activated here — both are separate governed actions with their own
   * decisions, which is what makes the separation of duties real.
   */
  async register(
    cap: RegistryWrites,
    ctx: ScopeContext,
    actor: string,
    correlationId: string,
    contract: unknown,
    sourceId: string,
  ): Promise<{ sourceId: string; contractVersion: number; srcObjectId: string; lifecycleState: 'draft' }> {
    const v = validateSourceContract(contract);
    if (!v.ok) {
      throw bad(correlationId, `source contract invalid: ${v.errors.join('; ')}`);
    }
    const c = contract as SourceContractV1;
    const contractVersion = c.lifecycle.contract_version;
    const tenantId = ctx.tenantId as string;
    const domainId = ctx.domainId as string;
    const principalId = actor.replace(/^principal:/, '');

    // The SRC canonical object: the contract, immutable and digest-bound.
    const recordedAt = new Date().toISOString();
    const header: CanonicalHeader = {
      object_id: sourceId,
      object_type: 'SRC',
      tenant_id: tenantId,
      domain_id: domainId,
      scope: 'DOMAIN',
      object_version: String(contractVersion),
      lifecycle_state: 'admitted',
      owning_component: 'CP-OBS-01',
      accountable_owner: actor,
      source_object_ids: [],
      event_time: c.lifecycle.effective_from,
      observation_time: recordedAt,
      valid_from: c.lifecycle.effective_from,
      valid_to: c.lifecycle.effective_to ?? null,
      recorded_at: recordedAt,
      time_precision: 'exact',
      source_clock_quality: 'trusted',
      // A registered contract is ASSERTED by the registrar. It is not an
      // observation of the world and must not claim to be one.
      truth_state: 'asserted',
      synthetic_state: c.data_origin === 'synthetic',
      confidence: null,
      uncertainty: null,
      evidence_refs: [],
      provenance_ref: null,
      method_ref: 'source-registration@1.0.0',
      contradiction_refs: [],
      corroboration_refs: [],
      human_refs: [actor],
      classification: c.authority_and_rights.classification_ceiling,
      purpose_scope: c.authority_and_rights.purposes[0] ?? 'observation',
      rights_profile: c.authority_and_rights.licence,
      residency_profile: c.authority_and_rights.residency,
      retention_profile: c.authority_and_rights.retention,
      access_policy_ref: null,
      quality_profile: null,
      quality_state: null,
      freshness_state: null,
      // SRC@v2 (migration 0028) adds the optional backfill declaration and the
      // publisher's attribution notice; a contract using neither is still a v1.
      schema_ref: c.security_and_operations.backfill !== undefined
        || c.authority_and_rights.attribution != null ? 'SRC@v2' : 'SRC@v1',
      ontology_ref: null,
      correction_of: null,
      supersedes: c.lifecycle.supersedes_version != null
        ? `${sourceId}@${c.lifecycle.supersedes_version}` : null,
      withdrawal_reason: null,
      audit_correlation_id: correlationId,
      content_ref: null,
    };
    const hv = validateHeader(header);
    if (!hv.ok) throw bad(correlationId, `canonical header invalid: ${(hv.errors ?? []).join('; ')}`);
    const payload = contract as unknown as Record<string, unknown>;
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));

    await cap.registerSource({
      sourceId, contractVersion, tenantId, domainId,
      srcObjectId: sourceId, srcObjectVersion: contractVersion,
      sourceKey: c.source_key, name: c.name, publisher: c.publisher,
      authorityClass: c.authority_class, connectorKind: c.connector_kind,
      acquisitionMode: c.acquisition_mode, dataOrigin: c.data_origin,
      rightsState: c.authority_and_rights.rights_state,
      registrar: principalId,
      cadenceSeconds: c.connector_kind === 'upload' ? null : c.identity.cadence_seconds,
      freshnessThresholdSeconds: c.security_and_operations.freshness_expectation.threshold_seconds,
      coverageUniverseVersion: c.security_and_operations.coverage_expectations.universe_version,
      schemaDriftTolerance: c.security_and_operations.expected_schema.drift_tolerance,
      classificationCeiling: c.authority_and_rights.classification_ceiling,
      residency: c.authority_and_rights.residency,
      purposes: c.authority_and_rights.purposes,
      endpoints: c.identity.endpoints,
      contract: payload,
      eventId: newId(),
      correlationId,
    });

    return { sourceId, contractVersion, srcObjectId: sourceId, lifecycleState: 'draft' };
  }

  /**
   * Approve or reject. The registrar-≠-approver rule and the collection_manager
   * requirement are BOTH enforced in the database port, not here — this method
   * exists to shape the call, not to be the guard.
   */
  async approve(
    cap: RegistryWrites,
    ctx: ScopeContext,
    correlationId: string,
    sourceId: string,
    contractVersion: number,
    decision: 'approve' | 'reject',
    reason: string,
  ): Promise<{ sourceId: string; lifecycleState: string }> {
    await cap.approveSource({
      sourceId, contractVersion,
      tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      decision, reason, eventId: newId(), correlationId,
    });
    return { sourceId, lifecycleState: decision === 'approve' ? 'approved' : 'retired' };
  }

  async transition(
    cap: RegistryWrites,
    ctx: ScopeContext,
    correlationId: string,
    sourceId: string,
    contractVersion: number,
    target: string,
    reason: string,
  ): Promise<{ sourceId: string; lifecycleState: string }> {
    await cap.transitionContract({
      sourceId, contractVersion,
      tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      target, reason, eventId: newId(), correlationId,
    });
    return { sourceId, lifecycleState: target };
  }

  async setRights(
    cap: RegistryWrites,
    ctx: ScopeContext,
    correlationId: string,
    sourceId: string,
    contractVersion: number,
    rightsState: string,
    evidence: string,
  ): Promise<{ sourceId: string; rightsState: string }> {
    await cap.setRightsState({
      sourceId, contractVersion,
      tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      rightsState, evidence, eventId: newId(), correlationId,
    });
    return { sourceId, rightsState };
  }

  async list(cap: ObservationReads, limit = 100): Promise<SourceRow[]> {
    return (await cap
      .readSourceContracts()
      .selectAll()
      .orderBy('created_at' as never, 'desc')
      .limit(Math.min(limit, 500))
      .execute()) as SourceRow[];
  }

  /**
   * READINESS, per registered source, from stored records alone: what the source IS
   * (live, replay or operator upload), what stands between it and live collection
   * (unresolved reuse rights, a credential this deployment does not bind, a superseded
   * or suspended contract), whether anything is scheduled, the last governed run, the
   * evidence held, and the latest recorded health verdict. It activates nothing and
   * consults no clock: an operator reads it to know what is real, what is replayed and
   * what is blocked, and by what.
   */
  async readiness(cap: ObservationReads, limit = 100): Promise<Array<SourceRow & { readiness: SourceReadiness }>> {
    const rows = await this.list(cap, limit);
    const out: Array<SourceRow & { readiness: SourceReadiness }> = [];
    for (const s of rows) {
      const sourceId = String(s.source_id);
      const schedule = (await cap.readSchedulerEntries().selectAll()
        .where('source_id' as never, '=', sourceId as never).where('contract_version' as never, '=', s.contract_version as never)
        .executeTakeFirst()) as Record<string, unknown> | undefined;
      const lastRun = (await cap.readRuns().selectAll()
        .where('source_id' as never, '=', sourceId as never).where('contract_version' as never, '=', s.contract_version as never)
        .orderBy('started_at' as never, 'desc').limit(1).executeTakeFirst()) as Record<string, unknown> | undefined;
      const health = (await cap.readHealthEvents().select(['new_state', 'lag_class', 'evaluated_at'])
        .where('source_id' as never, '=', sourceId as never)
        .orderBy('evaluated_at' as never, 'desc').orderBy('event_id' as never, 'desc').limit(1).executeTakeFirst()) as { new_state: string; lag_class: string | null; evaluated_at: Date | string } | undefined;
      const evidence = (await cap.readCanonicalObjects()
        .select(sql<string>`count(*)`.as('n'))
        .where('object_type' as never, '=', 'EVD' as never)
        .where('provenance_ref' as never, 'like', `SRC:${sourceId}@%` as never)
        .executeTakeFirst()) as { n: string | number } | undefined;
      const attemptsRaw = (await cap.readScheduledAttempts().selectAll()
        .where('source_id' as never, '=', sourceId as never).where('contract_version' as never, '=', s.contract_version as never)
        .orderBy('started_at' as never, 'desc').limit(50).execute()) as Array<Record<string, unknown>>;
      const attempt = (a: Record<string, unknown>): ScheduledAttempt => ({
        attempt_id: String(a['attempt_id']), job_id: String(a['job_id']), outcome: String(a['outcome']),
        run_id: (a['run_id'] as string | null) ?? null, reason: (a['reason'] as string | null) ?? null,
        started_at: new Date(String(a['started_at'])).toISOString(), finished_at: new Date(String(a['finished_at'])).toISOString(),
        admitted: Number(a['items_admitted'] ?? 0), noop: Number(a['items_noop'] ?? 0), quarantined: Number(a['items_quarantined'] ?? 0),
      });
      const attempts = attemptsRaw.map(attempt);
      const counts = { finished: 0, failed: 0, cancelled: 0, budget_exceeded: 0, refused: 0 };
      for (const a of attempts) if (a.outcome in counts) counts[a.outcome as keyof typeof counts] += 1;
      const runtime = await this.scheduler.describe(String(s.tenant_id), String(s.domain_id), sourceId);
      const contract = ((s.contract ?? {}) as unknown) as Record<string, unknown>;
      const so = (contract['security_and_operations'] ?? {}) as Record<string, unknown>;
      const credentialRef = typeof so['credential_ref'] === 'string' ? (so['credential_ref'] as string) : null;
      const mode = String(s.acquisition_mode);
      const lifecycle = String(s.lifecycle_state);
      const rights = String(s.rights_state);
      const upload = String(s.connector_kind) === 'upload';
      const scheduled = schedule !== undefined && schedule['status'] === 'scheduled';
      const schedulerEnabled = this.cfg['eye.scheduler.enabled'];
      // The verdict, in the product's words. Order matters: a contract that is not active is
      // not collecting whatever its mode says; an upload source is never polled; and a
      // credential the deployment does not bind blocks collection BEFORE the mode is
      // consulted — a live contract with a schedule entry and an unbound credential is
      // blocked, not live (the review's P2: the live branch used to be consulted first).
      // Schedule and run facts are carried separately whatever the verdict.
      let verdict: SourceReadiness['verdict']; let reason: string;
      if (lifecycle !== 'active') { verdict = 'inactive'; reason = `contract version ${String(s.contract_version)} is ${lifecycle}`; }
      else if (upload) { verdict = 'operator-upload'; reason = 'records arrive only when an operator uploads them; nothing is polled'; }
      else if (credentialRef !== null) { verdict = 'blocked-credential'; reason = `the contract names credential ${credentialRef}, and this deployment binds no source credential${mode === 'live' ? (scheduled ? '; the schedule entry cannot be served' : '; nothing is scheduled') : ''}`; }
      else if (mode === 'live') {
        verdict = scheduled ? 'live' : 'live-unscheduled';
        reason = verdict === 'live'
          ? `live under contract version ${String(s.contract_version)}; schedule entry every ${String(schedule?.['cadence_seconds'])} s${schedulerEnabled ? (runtime.worker_running ? '; a worker serves it here' : '; scheduler enabled but no worker runs here') : ' (this deployment runs no scheduler: runs are operator-triggered)'}`
          : 'the contract is live but no collection is scheduled for it';
      } else if (rights !== 'confirmed') { verdict = 'blocked-rights'; reason = `reuse rights are ${rights}: the source stays in replay until the publisher's terms are resolved`; }
      else { verdict = 'replay'; reason = 'rights confirmed and no credential needed: live collection needs a new contract version declaring it, approved and activated by a second operator'; }
      out.push({ ...s, readiness: {
        verdict, reason, credential: credentialRef === null ? 'none required' : `reference ${credentialRef} (not bound in this deployment)`,
        scheduled, cadence_seconds: schedule === undefined ? null : Number(schedule['cadence_seconds']), scheduler_enabled: schedulerEnabled,
        automatic: {
          schedule_entry: schedule === undefined ? null : { status: String(schedule['status']), cadence_seconds: Number(schedule['cadence_seconds']), scheduler_id: String(schedule['scheduler_id']) },
          runtime,
          last_attempt: attempts[0] ?? null,
          last_success: attempts.find((a) => a.outcome === 'finished') ?? null,
          attempts: counts,
        },
        last_run: lastRun === undefined ? null : { run_id: String(lastRun['run_id']), state: String(lastRun['state']), mode: String(lastRun['acquisition_mode']),
          finished_at: lastRun['finished_at'] === null || lastRun['finished_at'] === undefined ? null : new Date(String(lastRun['finished_at'])).toISOString(),
          admitted: Number(lastRun['items_admitted'] ?? 0), quarantined: Number(lastRun['items_quarantined'] ?? 0), noop: Number(lastRun['items_noop'] ?? 0), failure: (lastRun['failure_reason'] as string | null) ?? null },
        evidence_objects: Number(evidence?.n ?? 0),
        health: health === undefined ? null : { state: health.new_state, lag_class: health.lag_class, evaluated_at: new Date(String(health.evaluated_at)).toISOString() },
      } });
    }
    return out;
  }

  async get(cap: ObservationReads, sourceId: string, correlationId: string): Promise<SourceRow> {
    const rows = (await cap
      .readSourceContracts()
      .selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .orderBy('contract_version' as never, 'desc')
      .execute()) as SourceRow[];
    const row = rows[0];
    if (row === undefined) {
      // The same shape a foreign-scope probe receives: a caller learns nothing
      // about whether the source exists elsewhere.
      throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized source contract matches'), 404);
    }
    return row;
  }

  /** The approval trail the UI shows: who registered, who approved, and when. */
  async approvalTrail(cap: ObservationReads, sourceId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap
      .readSourceContractEvents()
      .selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .orderBy('occurred_at' as never)
      .execute()) as Array<Record<string, unknown>>;
  }
}
