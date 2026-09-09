/**
 * DECISION REPLAY — Phase 6 (L9), stage P6-M3.
 *
 * The reconstruction is the database's (decision.replay_layers): five layers under
 * the version's cut-offs and the bound upper as_of, never through a current
 * projection. This service binds the invocation — reader, purpose, instant, the
 * availability list at that instant — beside the content, admits the RPL record and
 * returns both. Two replays under the same cut-offs and as_of carry the same content
 * digest whatever the reader or the instant; their invocation records differ.
 *
 * Review of PR #46, item 4: a replay is read under the reader's authority NOW — the
 * purpose the package was proposed for, a clearance that covers the version's folded
 * classification, and membership of the package's room where one exists. Item 3: the
 * RPL inherits the version's controls (rights, residency, retention, access policy) and
 * those of the evidence it replays.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { foldControls, type ControlInput } from '../../prediction/controls.js';
import { assertClearance, assertPurpose, denyRead } from '../clearance.js';
import { unfoldProfiles } from '../packages/package.service.js';
import { versionControls } from '../approvals/approval.service.js';
import type { ReplayWrites } from '../decision.capabilities.js';

@Injectable()
export class ReplayService {
  async replay(cap: ReplayWrites, ctx: ScopeContext, packageId: string, version: number, asOf: string | null, reader: AuthenticatedPrincipal, purpose: string, correlationId: string, replayId: string = newId()) {
    const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const v = (await cap.readVersions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (p === undefined || v === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized package version matches'), 404);
    if (p['decided_at'] === null || p['decided_at'] === undefined || Number(p['committed_version']) !== version) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId, `version ${version} is ${String(v['state'])}, not committed; a replay reconstructs what a decision was taken with`), 409);
    }
    // the reader's authority now
    const vc = versionControls(v);
    assertClearance(reader, vc.classification, 'decision', correlationId);
    const dpk = (await cap.readCanonicalObjects().select(['purpose_scope' as never]).where('object_type' as never, '=', 'DPK' as never).where('object_id' as never, '=', packageId as never)
      .where('object_version' as never, '=', String(version) as never).executeTakeFirst()) as { purpose_scope: string | null } | undefined;
    assertPurpose(purpose, dpk?.purpose_scope ?? null, 'decision replay', correlationId);
    const room = (await cap.readRooms().select(['room_id' as never]).where('package_id' as never, '=', packageId as never).executeTakeFirst()) as { room_id: string } | undefined;
    if (room !== undefined && !(await cap.isMember({ roomId: room.room_id, principal: reader.principalId }))) {
      denyRead(correlationId, 'a replay of a package with a room is read by the room\'s members; a stored decision lends no reader the room\'s authority');
    }
    const r = await cap.replayLayers({ packageId, version, asOf });
    const content = r['content'] as Record<string, unknown>;
    const contentDigest = String(r['content_digest']);
    const unavailable = r['unavailable'] as unknown[];
    const summary = r['summary'] as Record<string, unknown>;
    const cutoffs = content['cutoffs'] as Record<string, unknown>;
    const replayedAt = new Date().toISOString();
    const commitment = (content['decided'] as Record<string, unknown>)['commitment'] as Record<string, unknown>;
    const invocation = { reader: `principal:${reader.principalId}`, purpose, replayed_at: replayedAt, as_of: cutoffs['as_of'], unavailable };
    const payload = { package_id: packageId, version, cutoffs, content_digest: contentDigest, content, invocation };
    // the controls: the version's fold, and those of the evidence the known layer replays
    const known = (content['known'] as Array<Record<string, unknown>>) ?? [];
    const controls = foldControls(unfoldProfiles([
      { synthetic_state: vc.synthetic_state, classification: vc.classification, rights_profile: vc.rights_profile, residency_profile: vc.residency_profile, retention_profile: vc.retention_profile, access_policy_ref: vc.access_policy_ref },
      ...known.map((k): ControlInput => ({ synthetic_state: k['synthetic_state'], classification: k['classification'], rights_profile: k['rights_profile'] ?? null })),
    ]));
    const header: CanonicalHeader = {
      object_id: replayId, object_type: 'RPL', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-DEC-01', accountable_owner: `principal:${reader.principalId}`,
      source_object_ids: [`DPK:${packageId}@${version}`, `CMT:${String(commitment['commitment_id'])}@1`],
      event_time: null, observation_time: null, valid_from: null, valid_to: null, recorded_at: replayedAt, time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'asserted', synthetic_state: controls.synthetic_state, confidence: null, uncertainty: null,
      evidence_refs: [], provenance_ref: `principal:${reader.principalId}`, method_ref: 'decision-replay@1.0.0', contradiction_refs: [], corroboration_refs: [],
      human_refs: [`principal:${reader.principalId}`], classification: controls.classification, purpose_scope: purpose,
      rights_profile: controls.rights_profile, residency_profile: controls.residency_profile, retention_profile: controls.retention_profile, access_policy_ref: controls.access_policy_ref,
      quality_profile: null, quality_state: { content_digest: contentDigest, unavailable: unavailable.length, excluded: (content['excluded'] as unknown[]).length, controls_inputs: controls.inputs }, freshness_state: null,
      schema_ref: 'RPL@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `replay header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    const headerDigest = canonicalHeaderDigest(header, payload);
    await cap.admitObject(header, payload, headerDigest);
    await cap.recordReplay({ replayId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, asOf: String(cutoffs['as_of']), contentDigest, headerDigest, reader: reader.principalId, purpose, unavailable, summary, eventId: newId(), correlationId });
    return { replayId, packageId, version, contentDigest, headerDigest, asOf: cutoffs['as_of'], cutoffs, layers: { known: content['known'], believed: content['believed'], tested: content['tested'], decided: content['decided'], observed: content['observed'] },
             excluded: content['excluded'], unavailable, summary, invocation };
  }
}
