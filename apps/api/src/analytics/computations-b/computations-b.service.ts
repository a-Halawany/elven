/**
 * B92 §MCB — THE COMPUTATIONS-B SERVICE: the two human-gated acts this part's metrics need as inputs (the compute itself is the prelude's
 * port — analytics.metric.compute — over the fifteen computations registered in 0113_b92_x_mcb.sql):
 *   * analytics.temporal.declare — a NAMED product analytics owner declares which time fields a record of an object type must carry (MET-009);
 *   * analytics.search.review — a NAMED product analyst or owner, never the searcher, reviews a recorded search (MET-014; role-level only).
 * And their reads (analytics.read, audited). Every rule is the port's; a refusal is the port's text in the class form.
 * The idiom is the prelude's compute service (read / write / derive / route).
 */
import { Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { ANALYTICS_READ } from '../compute/compute.service.js';
import { McbCapability, type McbReads, type McbWrites } from './computations-b.capabilities.js';

export const TEMPORAL_DECLARE = 'analytics.temporal.declare';
export const SEARCH_REVIEW = 'analytics.search.review';

@Injectable()
export class AnalyticsComputationsBService {
  constructor(private readonly pipeline: PipelineService) {}

  route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
    return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope;
  }
  read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectType: string | null, fn: (cap: McbReads) => Promise<T>) {
    return this.pipeline.consequentialRead(this.derive(env, ANALYTICS_READ, objectType, null), p, this.route(t, d, ANALYTICS_READ, objectType, null), McbCapability.read, async (cap) => fn(cap));
  }
  write<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string, objectId: string, fn: (cap: McbWrites) => Promise<T>) {
    return this.pipeline.write(this.derive(env, action, objectType, objectId), p, this.route(t, d, action, objectType, objectId), McbCapability.write,
      async (cap) => ({ result: await fn(cap), targetType: objectType, targetId: objectId, targetVersion: null, outboxEvent: null }));
  }
  static receipt(o: { policyDecisionId: string; auditSeq: number }) { return { policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq }; }

  async declareTemporal(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { objectType: string; required: string[]; retire: boolean; reason: string; expectedVersion: number }) {
    const requirementId = newId();
    const out = await this.write(env, p, t, d, TEMPORAL_DECLARE, 'ATR', requirementId, (cap) =>
      cap.declareTemporal({ requirementId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { requirement: out.result, receipt: AnalyticsComputationsBService.receipt(out) };
  }
  async reviewSearch(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { searchId: string; verdict: string; queryClass: string; reason: string }) {
    const reviewId = newId();
    const out = await this.write(env, p, t, d, SEARCH_REVIEW, 'ASR', reviewId, (cap) =>
      cap.reviewSearch({ reviewId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { review: out.result, receipt: AnalyticsComputationsBService.receipt(out) };
  }
  async temporalRequirements(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'ATR', async (cap) => ({ requirements: await cap.temporalRequirements(), read_at: await cap.now() }));
    return { ...out.result, receipt: AnalyticsComputationsBService.receipt(out) };
  }
  async searchReviews(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, limit: number) {
    const out = await this.read(env, p, t, d, 'ASR', async (cap) => ({ searches: await cap.searchReviews(limit), read_at: await cap.now() }));
    return { ...out.result, receipt: AnalyticsComputationsBService.receipt(out) };
  }
}
