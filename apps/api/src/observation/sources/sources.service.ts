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
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { ObservationReads, RegistryWrites } from '../observation.capabilities.js';
import { validateSourceContract, type SourceContractV1 } from './source-contract.js';

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
