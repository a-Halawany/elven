/**
 * DECISION REPLAY — Phase 6 (L9), stage P6-M3.
 *
 * The reconstruction is the database's (decision.replay_layers): five layers under
 * the version's cut-offs and the bound upper as_of, never through a current
 * projection. This service binds the invocation — reader, purpose, instant, the
 * availability list at that instant — beside the content, admits the RPL record and
 * returns both. Two replays under the same cut-offs and as_of carry the same content
 * digest whatever the reader or the instant; their invocation records differ.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { ReplayWrites } from '../decision.capabilities.js';

@Injectable()
export class ReplayService {
  async replay(cap: ReplayWrites, ctx: ScopeContext, packageId: string, version: number, asOf: string | null, reader: string, purpose: string, correlationId: string, replayId: string = newId()) {
    const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const v = (await cap.readVersions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (p === undefined || v === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized package version matches'), 404);
    if (p['decided_at'] === null || p['decided_at'] === undefined || Number(p['committed_version']) !== version) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId, `version ${version} is ${String(v['state'])}, not committed; a replay reconstructs what a decision was taken with`), 409);
    }
    const r = await cap.replayLayers({ packageId, version, asOf });
    const content = r['content'] as Record<string, unknown>;
    const contentDigest = String(r['content_digest']);
    const unavailable = r['unavailable'] as unknown[];
    const summary = r['summary'] as Record<string, unknown>;
    const cutoffs = content['cutoffs'] as Record<string, unknown>;
    const replayedAt = new Date().toISOString();
    const commitment = (content['decided'] as Record<string, unknown>)['commitment'] as Record<string, unknown>;
    const invocation = { reader: `principal:${reader}`, purpose, replayed_at: replayedAt, as_of: cutoffs['as_of'], unavailable };
    const payload = { package_id: packageId, version, cutoffs, content_digest: contentDigest, content, invocation };
    const header: CanonicalHeader = {
      object_id: replayId, object_type: 'RPL', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-DEC-01', accountable_owner: `principal:${reader}`,
      source_object_ids: [`DPK:${packageId}@${version}`, `CMT:${String(commitment['commitment_id'])}@1`],
      event_time: null, observation_time: null, valid_from: null, valid_to: null, recorded_at: replayedAt, time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'asserted', synthetic_state: v['synthetic_state'] === true, confidence: null, uncertainty: null,
      evidence_refs: [], provenance_ref: `principal:${reader}`, method_ref: 'decision-replay@1.0.0', contradiction_refs: [], corroboration_refs: [],
      human_refs: [`principal:${reader}`], classification: String((v['controls'] as Record<string, unknown> | null)?.['classification'] ?? 'internal'), purpose_scope: purpose,
      rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: { content_digest: contentDigest, unavailable: unavailable.length, excluded: (content['excluded'] as unknown[]).length }, freshness_state: null,
      schema_ref: 'RPL@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `replay header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    const headerDigest = canonicalHeaderDigest(header, payload);
    await cap.admitObject(header, payload, headerDigest);
    await cap.recordReplay({ replayId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, asOf: String(cutoffs['as_of']), contentDigest, headerDigest, reader, purpose, unavailable, summary, eventId: newId(), correlationId });
    return { replayId, packageId, version, contentDigest, headerDigest, asOf: cutoffs['as_of'], cutoffs, layers: { known: content['known'], believed: content['believed'], tested: content['tested'], decided: content['decided'], observed: content['observed'] },
             excluded: content['excluded'], unavailable, summary, invocation };
  }
}
