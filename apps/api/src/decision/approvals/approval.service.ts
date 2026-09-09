/**
 * APPROVALS AND COMMITMENT — Phase 6 (L9), stage P6-M2.
 *
 * An approval is a named human's signature on the digest they read: the service
 * admits an APR canonical object carrying that digest and the port refuses it unless
 * it is the version's own. Revocation is the approver's own act. Commitment is the
 * exact C3 action: the service builds the bounded CMT payload from the committed
 * choice — in Phase 3's own strategy schema, so the graph reads it as any other CMT —
 * admits it under decision.commit, and the port verifies the C3 class and bound
 * action in the authority context, recounts the live quorum under a package lock,
 * and writes the CMT row and its dependencies.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { ApproveWrites, CommitWrites } from '../decision.capabilities.js';

const bad = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
const state = (correlationId: string, msg: string, status = 409): never => { throw new HttpException(errorBody('EYE_STA_001', correlationId, msg), status); };

export interface ApprovalIntake { decision: 'approve' | 'reject'; versionDigest: string; rationale: string; conditions: unknown[] }

export function validateApprovalIntake(m: Partial<ApprovalIntake>, correlationId: string): ApprovalIntake {
  if (m.decision !== 'approve' && m.decision !== 'reject') bad(correlationId, "decision must be 'approve' or 'reject'");
  if (typeof m.versionDigest !== 'string' || !/^[0-9a-f]{64}$/.test(m.versionDigest)) bad(correlationId, 'versionDigest must be the 64-hex digest of the version being approved — an approval signs what was read');
  if (typeof m.rationale !== 'string' || m.rationale.trim().length < 8) bad(correlationId, 'rationale must be at least eight characters');
  return { decision: m.decision as ApprovalIntake['decision'], versionDigest: m.versionDigest as string, rationale: m.rationale as string, conditions: Array.isArray(m.conditions) ? m.conditions : [] };
}

/** The controls a derived record inherits from the version it rests on (review of PR #46, item 3). */
export function versionControls(v: Record<string, unknown>): { classification: string; rights_profile: string | null; residency_profile: string | null; retention_profile: string | null; access_policy_ref: string | null; synthetic_state: boolean } {
  const c = (v['controls'] ?? {}) as Record<string, unknown>;
  const str = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 ? x : null);
  return { classification: typeof c['classification'] === 'string' ? c['classification'] : 'internal', rights_profile: str(c['rights_profile']), residency_profile: str(c['residency_profile']),
           retention_profile: str(c['retention_profile']), access_policy_ref: str(c['access_policy_ref']), synthetic_state: v['synthetic_state'] === true || c['synthetic_state'] === true };
}

const dayOf = (v: unknown): string | null => (v === null || v === undefined ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)));

@Injectable()
export class ApprovalService {
  async approve(cap: ApproveWrites, ctx: ScopeContext, packageId: string, version: number, intake: ApprovalIntake, approver: string, purposeId: string, correlationId: string, approvalId: string = newId()) {
    const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const v = (await cap.readVersions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (p === undefined || v === undefined) state(correlationId, 'no authorized package version matches', 404);
    const pv = v as Record<string, unknown>;
    if (!['proposed', 'under_review', 'approved'].includes(String(pv['state']))) state(correlationId, `version ${version} is ${String(pv['state'])}; only a proposed version is approved`);
    if (pv['version_digest'] !== intake.versionDigest) state(correlationId, `the digest approved is not the digest of version ${version}; an approval signs what was read`);
    const now = new Date().toISOString();
    const inherited = versionControls(pv);
    const payload = { package_id: packageId, version, version_digest: intake.versionDigest, approver: `principal:${approver}`, decision: intake.decision, rationale: intake.rationale, conditions: intake.conditions };
    const header: CanonicalHeader = {
      object_id: approvalId, object_type: 'APR', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-DEC-01', accountable_owner: `principal:${approver}`,
      source_object_ids: [`DPK:${packageId}@${version}`], event_time: null, observation_time: null, valid_from: null, valid_to: null, recorded_at: now,
      time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'asserted', synthetic_state: inherited.synthetic_state, confidence: null, uncertainty: null,
      evidence_refs: [], provenance_ref: `principal:${approver}`, method_ref: 'human-approval@1.0.0', contradiction_refs: [], corroboration_refs: [],
      human_refs: [`principal:${approver}`], classification: inherited.classification, purpose_scope: purposeId, rights_profile: inherited.rights_profile, residency_profile: inherited.residency_profile, retention_profile: inherited.retention_profile,
      access_policy_ref: inherited.access_policy_ref, quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'APR@v1', ontology_ref: null,
      correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const check = validateHeader(header);
    if (!check.ok) bad(correlationId, `approval header invalid: ${(check.errors ?? []).join('; ')}`);
    const headerDigest = canonicalHeaderDigest(header, payload);
    await cap.admitObject(header, payload, headerDigest);
    const r = await cap.recordApproval({ approvalId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, approver, decision: intake.decision,
      versionDigest: intake.versionDigest, rationale: intake.rationale, conditions: intake.conditions, headerDigest, eventId: newId(), correlationId });
    return { approvalId, packageId, version, decision: intake.decision, state: r.state, liveApprovals: Number(r.live_approvals), quorum: Number(r.quorum), expiresAt: r.expires_at, eligibleBy: r.eligible_by };
  }

  async revoke(cap: ApproveWrites, ctx: ScopeContext, approvalId: string, reason: string, correlationId: string) {
    const r = await cap.revokeApproval({ approvalId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, reason, eventId: newId(), correlationId });
    return { approvalId, state: r.state, liveApprovals: Number(r.live_approvals), quorum: Number(r.quorum) };
  }

  /** The exact C3 commit: the bounded CMT, in Phase 3's strategy schema, admitted under decision.commit. */
  async commit(cap: CommitWrites, ctx: ScopeContext, packageId: string, version: number, versionDigest: string, committer: string, purposeId: string, correlationId: string, commitmentId: string) {
    const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const v = (await cap.readVersions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (p === undefined || v === undefined) state(correlationId, 'no authorized package version matches', 404);
    const pkg = p as Record<string, unknown>; const pv = v as Record<string, unknown>;
    if (pkg['committed_version'] !== null && pkg['committed_version'] !== undefined) state(correlationId, `package is already committed at version ${String(pkg['committed_version'])}`);
    if (pv['state'] !== 'approved') state(correlationId, `version ${version} is ${String(pv['state'])}, not approved`);
    if (typeof versionDigest !== 'string' || pv['version_digest'] !== versionDigest) state(correlationId, `the digest committed is not the digest of version ${version}`);
    const live = await cap.liveApprovals({ packageId, version });
    const choice = pv['choice'] as Record<string, unknown>;
    const option = (await cap.readOptions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never)
      .where('key' as never, '=', String(choice['option_key']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (option === undefined) state(correlationId, 'the chosen option is not readable');
    const criteria = choice['outcome_criteria'] as Array<Record<string, unknown>>;
    const title = `Commit: ${String(pkg['title'])} — ${String((option as Record<string, unknown>)['title'])}`;
    const statement = `${String(choice['rationale'])} Deadline ${String(choice['decision_deadline'])}; action owner principal:${String(choice['action_owner'])}; accepted trade-offs: ${(choice['accepted_trade_offs'] as unknown[]).map(String).join('; ') || 'none stated'}.`;
    const now = new Date().toISOString();
    const inherited = versionControls(pv);
    const runs = ((option as Record<string, unknown>)['consequences'] as Array<{ kind: string; id: string; version: number }>).filter((c) => c.kind === 'run');
    const payload = {
      strategy_kind: 'commitment', title, statement, status: 'active', horizon: String(choice['decision_deadline']), owner: `principal:${committer}`, parent_objective_id: null,
      verification: { state: 'not_applicable', reason: null, at: null },
      rests_on: [
        { kind: 'strategy', id: String(pkg['decision_object_id']), rationale: `the commitment executes decision ${String(pkg['decision_object_id'])} through package ${packageId} version ${version}` },
        ...(pv['objectives'] as string[]).map((o) => ({ kind: 'strategy', id: o, rationale: 'the objective the committed decision serves' })),
      ],
      metrics: {
        package_id: packageId, package_version: version, version_digest: versionDigest, option_key: choice['option_key'], baseline_run_id: pv['baseline_run_id'] ?? null,
        runs: runs.map((r) => `SIM:${r.id}@${r.version}`), outcome_criteria: criteria, monitoring_conditions: pv['monitoring_conditions'],
        approvals: live.map((a) => `APR:${a.approval_id}@1`), observed_through: dayOf(pv['observed_through']),
      },
    };
    const header: CanonicalHeader = {
      object_id: commitmentId, object_type: 'CMT', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-DEC-01', accountable_owner: `principal:${committer}`,
      source_object_ids: [`DPK:${packageId}@${version}`, ...live.map((a) => `APR:${a.approval_id}@1`), ...runs.map((r) => `SIM:${r.id}@${r.version}`)],
      event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'asserted', synthetic_state: pv['synthetic_state'] === true, confidence: null, uncertainty: null,
      evidence_refs: [`strategy:${String(pkg['decision_object_id'])}`], provenance_ref: `principal:${committer}`, method_ref: 'decision-commit@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [...new Set([`principal:${committer}`, ...live.map((a) => `principal:${a.approver_principal_id}`)])],
      classification: inherited.classification, purpose_scope: purposeId, rights_profile: inherited.rights_profile, residency_profile: inherited.residency_profile, retention_profile: inherited.retention_profile, access_policy_ref: inherited.access_policy_ref,
      quality_profile: null, quality_state: { completeness: 'complete', verification: 'committed', op_class: 'C3' }, freshness_state: null, schema_ref: 'CMT@v1', ontology_ref: null,
      correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const check = validateHeader(header);
    if (!check.ok) bad(correlationId, `commitment header invalid: ${(check.errors ?? []).join('; ')}`);
    const headerDigest = canonicalHeaderDigest(header, payload);
    await cap.admitObject(header, payload, headerDigest);
    const r = await cap.commitPackage({ commitmentId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, committer, versionDigest, headerDigest, title, statement, eventId: newId(), correlationId });
    return { commitmentId: r.commitment_id, packageId, version, approvals: r.approvals, opClass: r.op_class, decidedAt: r.decided_at, title };
  }
}
