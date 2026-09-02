/**
 * Quarantine review — PHASE1_PLAN §5, L1-C07.
 *
 * Release and rejection both require a SECOND OPERATOR holding
 * collection_manager, and both require a recorded reason. Neither rule lives
 * here: they are enforced in observation.close_quarantine_case, so a caller that
 * reaches the port by another route meets the same refusal. This service shapes
 * the call and does the one thing the database cannot — moving the bytes.
 *
 * A RELEASED item is admitted through the SAME admission path the acquisition
 * lifecycle uses, not through a shortcut: the same manifest, the same custody
 * chain, the same digest verification. A release that produced a differently
 * shaped evidence object would be a second, weaker admission path.
 */
import { Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { AcquisitionWrites, ObservationReads } from '../observation.capabilities.js';
import { VaultService } from '../vault/vault.service.js';

export interface QuarantineCaseRow {
  case_id: string;
  source_id: string;
  contract_version: number;
  run_id: string | null;
  manifest_id: string | null;
  item_key: string;
  state: string;
  opened_at: Date;
  expires_at: Date;
  reason_class: string | null;
  reason: string | null;
  declared_type: string | null;
  sniffed_type: string | null;
  byte_length: string | number | null;
  content_digest: string | null;
  [k: string]: unknown;
}

@Injectable()
export class QuarantineService {
  constructor(private readonly vault: VaultService) {}

  async list(cap: ObservationReads, state: string | null, limit = 100): Promise<QuarantineCaseRow[]> {
    let q = cap.readQuarantine().selectAll().orderBy('opened_at' as never, 'desc').limit(Math.min(limit, 500));
    if (state !== null) q = q.where('state' as never, '=', state as never);
    return (await q.execute()) as QuarantineCaseRow[];
  }

  async get(cap: ObservationReads, caseId: string): Promise<QuarantineCaseRow | undefined> {
    return (await cap
      .readQuarantine()
      .selectAll()
      .where('case_id' as never, '=', caseId as never)
      .executeTakeFirst()) as QuarantineCaseRow | undefined;
  }

  async events(cap: ObservationReads, caseId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap
      .readQuarantineEvents()
      .selectAll()
      .where('case_id' as never, '=', caseId as never)
      .orderBy('occurred_at' as never)
      .execute()) as Array<Record<string, unknown>>;
  }

  /**
   * Reject a quarantined item. The bytes are RETAINED under their quarantine
   * manifest — a rejection is a decision about admission, not a licence to
   * destroy the evidence of what arrived.
   */
  async reject(
    cap: AcquisitionWrites, ctx: ScopeContext, correlationId: string,
    caseId: string, reason: string,
  ): Promise<{ caseId: string; state: 'rejected' }> {
    await cap.closeQuarantineCase({
      caseId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      outcome: 'rejected', reason, eventId: newId(), correlationId,
    });
    return { caseId, state: 'rejected' };
  }

  /**
   * Release a quarantined item into evidence. The candidate is created and
   * digest-verified BEFORE the transaction, exactly as at §5 8a/8b, so this path
   * carries the same guarantee: the canonical record never references bytes that
   * are not already durable and verified.
   */
  async release(
    cap: AcquisitionWrites, ctx: ScopeContext, actor: string, correlationId: string,
    caseRow: QuarantineCaseRow, reason: string, purposeId: string,
    candidate: { locator: string; contentDigest: string; byteLength: number },
    contract: { classification_ceiling: string; residency: string; acquisition_mode: string; authority_class: string; source_key: string; data_origin: string; contract: Record<string, unknown> },
  ): Promise<{ caseId: string; evdObjectId: string }> {
    const tenantId = ctx.tenantId as string;
    const domainId = ctx.domainId as string;
    const manifestId = newId();
    const obsObjectId = newId();
    const evdObjectId = newId();
    const now = new Date().toISOString();

    await cap.recordManifest({
      manifestId, tenantId, domainId, vault: 'evidence', locator: candidate.locator,
      digest: candidate.contentDigest, byteLength: candidate.byteLength,
      declaredType: caseRow.declared_type, sniffedType: caseRow.sniffed_type,
      activeContentRisk: false,
      classification: contract.classification_ceiling, residency: contract.residency,
      retention: 'default', legalHold: false,
      sourceId: caseRow.source_id, contractVersion: caseRow.contract_version,
      runId: caseRow.run_id, acquisitionMode: contract.acquisition_mode,
      correlationId,
    });

    const base = {
      tenant_id: tenantId, domain_id: domainId, scope: 'DOMAIN' as const,
      object_version: '1', lifecycle_state: 'admitted',
      owning_component: 'CP-OBS-01', accountable_owner: actor,
      time_precision: 'exact', source_clock_quality: 'unknown' as const,
      synthetic_state: contract.data_origin === 'synthetic',
      confidence: null, uncertainty: null, provenance_ref: `SRC:${caseRow.source_id}@${caseRow.contract_version}`,
      contradiction_refs: [], corroboration_refs: [],
      classification: contract.classification_ceiling, purpose_scope: purposeId,
      rights_profile: null, residency_profile: contract.residency, retention_profile: 'default',
      access_policy_ref: null, quality_profile: null, quality_state: null, freshness_state: null,
      ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
      audit_correlation_id: correlationId,
      valid_from: null, valid_to: null, recorded_at: now,
    };

    const obsHeader: CanonicalHeader = {
      ...base,
      object_id: obsObjectId, object_type: 'OBS',
      source_object_ids: [`SRC:${caseRow.source_id}@${caseRow.contract_version}`],
      event_time: null, observation_time: (caseRow.opened_at as Date).toISOString(),
      truth_state: 'observed',
      evidence_refs: [`quarantine-case:${caseRow.case_id}`],
      method_ref: 'quarantine-release@1.0.0',
      // A release is a HUMAN decision and names the human who made it.
      human_refs: [actor],
      schema_ref: 'OBS@v1', content_ref: null,
    };
    const obsPayload = {
      source_key: contract.source_key,
      source_id: caseRow.source_id,
      contract_version: caseRow.contract_version,
      run_id: caseRow.run_id ?? caseRow.case_id,
      item_key: caseRow.item_key,
      acquisition_mode: contract.acquisition_mode,
      authority_class: contract.authority_class,
      observed_at: (caseRow.opened_at as Date).toISOString(),
      publisher_time: null,
      transport: {
        connector: 'quarantine.release', connector_version: '1.0.0',
        method_ref: 'quarantine-release@1.0.0',
        endpoint: null, http_status: null, retained_headers: {},
        tls_verified: null, origin_allowlisted: null,
      },
      parent_obs_id: null, fragment_ref: null,
    };
    assertHeader(obsHeader);
    await cap.admitObject(obsHeader, obsPayload, canonicalHeaderDigest(obsHeader, obsPayload));

    const evdHeader: CanonicalHeader = {
      ...base,
      object_id: evdObjectId, object_type: 'EVD',
      source_object_ids: [`OBS:${obsObjectId}`],
      event_time: null, observation_time: now,
      truth_state: 'observed',
      evidence_refs: [`blob:${manifestId}`],
      method_ref: 'quarantine-release@1.0.0',
      human_refs: [actor],
      schema_ref: 'EVD@v1', content_ref: `vault:evidence/${candidate.locator}`,
    };
    const evdPayload = {
      obs_object_id: obsObjectId, manifest_id: manifestId, locator: candidate.locator,
      content_digest: candidate.contentDigest, byte_length: candidate.byteLength,
      vault: 'evidence', acquisition_mode: contract.acquisition_mode,
      media_type_declared: caseRow.declared_type, media_type_sniffed: caseRow.sniffed_type,
      active_content_risk: false, parent_evd_id: null, fragment: null,
      authenticity: {
        transport_endpoint: 'not_applicable', byte_integrity: 'verified',
        source_origin: 'not_applicable', content_authenticity: 'unknown',
      },
    };
    assertHeader(evdHeader);
    await cap.admitObject(evdHeader, evdPayload, canonicalHeaderDigest(evdHeader, evdPayload));

    await cap.appendCustody({
      eventId: newId(), tenantId, domainId, manifestId,
      obsObjectId, evdObjectId, sourceId: caseRow.source_id,
      contractVersion: caseRow.contract_version, runId: caseRow.run_id,
      event: 'custody.admitted', actor,
      agentPrincipalId: null, agentVersion: null, codeDigest: null,
      connector: 'quarantine.release', connectorVersion: '1.0.0',
      methodRef: 'quarantine-release@1.0.0',
      contentDigest: candidate.contentDigest, digestVerified: true,
      details: {
        released_from_case: caseRow.case_id,
        original_reason_class: caseRow.reason_class,
        release_reason: reason,
      },
      correlationId,
    });

    await cap.closeQuarantineCase({
      caseId: caseRow.case_id, tenantId, domainId,
      outcome: 'admitted', reason, eventId: newId(), correlationId,
    });

    return { caseId: caseRow.case_id, evdObjectId };
  }

  /** The vault work a release needs before its transaction opens. */
  async prepareRelease(
    ctx: ScopeContext, caseRow: QuarantineCaseRow,
  ): Promise<{ locator: string; contentDigest: string; byteLength: number }> {
    const manifestLocator = caseRow['locator'] as string | undefined;
    if (manifestLocator === undefined || caseRow.content_digest === null) {
      throw new Error('quarantine case has no retrievable bytes');
    }
    return this.vault.createAdmittedCandidate(
      { tenantId: ctx.tenantId as string, domainId: ctx.domainId as string },
      manifestLocator,
      caseRow.content_digest,
    );
  }
}

function assertHeader(h: CanonicalHeader): void {
  const v = validateHeader(h);
  if (!v.ok) throw new Error(`canonical header invalid: ${(v.errors ?? []).join('; ')}`);
}
