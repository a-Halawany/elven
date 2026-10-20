/**
 * B92 §OR (0113_b92_x_or) — THE OPERATING REVIEW SERVICE (PR-70-001: the role-appropriate measurement capability's accountable business
 * review). open (analytics.review.open), assemble (analytics.review.assemble — CITES results, computes nothing), hold / decide / close (the
 * chair's; human-gated), note (analytics.review.note), and the reads under analytics.read (audited): the review list, the review with its
 * cited results, drill-downs, series, notes, follow-through and signature; the series of a metric for a scope (sparse history explicit).
 * The compute service's read / write / derive / route idiom; every rule is the port's; a refusal is the port's text in the class form
 * `operating review rejected (<class>): …`.
 * CLAIMS: software capability; a review on eye_demo is a SYNTHETIC demonstration; the signed acceptance of the business review is R2's.
 */
import { Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { ANALYTICS_READ } from '../compute/compute.service.js';
import { ReviewCapability, type ReviewReads, type ReviewWrites } from './review.capabilities.js';
import { decorateReview, decorateSeries, recordedComputations, registryByKey, reviewComputationKeys, reviewResultIds } from '../computation-versions.js';

type Row = Record<string, unknown>;
export const REVIEW_OBJECT = 'AOR';
export const REVIEW_BOUNDARY = 'the operating review (B92 §OR): it cites results and computes nothing; a metric with no result is listed not computed; an indeterminate result is shown with its reasons, never as 0. The close is the named chair\'s digest-bound act (an Ed25519 signature would need the integrator\'s signature kind). A demonstration on synthetic records never closes a clause that needs the real integration; the signed acceptance of the business review is R2\'s.';

@Injectable()
export class AnalyticsReviewService {
  constructor(private readonly pipeline: PipelineService) {}

  route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
    return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action === ANALYTICS_READ ? 'none' : 'reversible', message_id: newId() } as Envelope;
  }
  read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectId: string | null, fn: (cap: ReviewReads) => Promise<T>) {
    return this.pipeline.consequentialRead(this.derive(env, ANALYTICS_READ, REVIEW_OBJECT, objectId), p, this.route(t, d, ANALYTICS_READ, REVIEW_OBJECT, objectId), ReviewCapability.read, async (cap) => fn(cap));
  }
  write<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectId: string | null, fn: (cap: ReviewWrites) => Promise<T>) {
    return this.pipeline.write(this.derive(env, action, REVIEW_OBJECT, objectId), p, this.route(t, d, action, REVIEW_OBJECT, objectId), ReviewCapability.write,
      async (cap) => ({ result: await fn(cap), targetType: REVIEW_OBJECT, targetId: objectId, targetVersion: null, outboxEvent: null }));
  }
  static receipt(o: { policyDecisionId: string; auditSeq: number }) { return { policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq }; }

  async open(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { title: string; period: string; scopeKey: string | null; metricKeys: string[]; chair: string; participantRoles: string[] }) {
    const reviewId = newId();
    const out = await this.write(env, p, t, d, 'analytics.review.open', reviewId, (cap) => cap.open({ reviewId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { review: out.result, boundary: REVIEW_BOUNDARY, receipt: AnalyticsReviewService.receipt(out) };
  }
  async assemble(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, reviewId: string, pins: Record<string, string>) {
    const out = await this.write(env, p, t, d, 'analytics.review.assemble', reviewId, (cap) => cap.assemble({ reviewId, tenantId: t, domainId: d, pins, actor: p.principalId, correlationId: env.correlation_id }));
    return { assembly: out.result, receipt: AnalyticsReviewService.receipt(out) };
  }
  async hold(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, reviewId: string) {
    const out = await this.write(env, p, t, d, 'analytics.review.hold', reviewId, (cap) => cap.hold({ reviewId, tenantId: t, domainId: d, actor: p.principalId, correlationId: env.correlation_id }));
    return { review: out.result, receipt: AnalyticsReviewService.receipt(out) };
  }
  async note(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, reviewId: string, b: { metricKey: string | null; body: string }) {
    const noteId = newId();
    const out = await this.write(env, p, t, d, 'analytics.review.note', reviewId, (cap) => cap.note({ noteId, reviewId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { note: out.result, receipt: AnalyticsReviewService.receipt(out) };
  }
  async decide(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, reviewId: string,
               b: { metricKey: string | null; kind: string; action: string | null; owner: string | null; dueOn: string | null; reason: string }) {
    const followupId = newId();
    const out = await this.write(env, p, t, d, 'analytics.review.decide', reviewId, (cap) => cap.decide({ followupId, reviewId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { followthrough: out.result, receipt: AnalyticsReviewService.receipt(out) };
  }
  async close(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, reviewId: string, b: { digest: string; statement: string }) {
    const out = await this.write(env, p, t, d, 'analytics.review.close', reviewId, (cap) => cap.close({ reviewId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { review: out.result, receipt: AnalyticsReviewService.receipt(out) };
  }

  async list(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, q: { period: string | null; state: string | null; limit: number }) {
    const out = await this.read(env, p, t, d, null, async (cap) => ({ reviews: await cap.list(q), read_at: await cap.now() }));
    return { ...out.result, boundary: REVIEW_BOUNDARY, receipt: AnalyticsReviewService.receipt(out) };
  }
  async review(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, reviewId: string) {
    // B82-F mt: the SQL read unchanged (its digest is the review's own); per metric the registry's computation NOW, per series period the computation its result ran
    const out = await this.read(env, p, t, d, reviewId, async (cap) => {
      const review = await cap.review(reviewId);
      return { review: decorateReview(review, await registryByKey(cap.tx, reviewComputationKeys(review)), await recordedComputations(cap.tx, reviewResultIds(review))), read_at: await cap.now() };
    });
    return { ...out.result, boundary: REVIEW_BOUNDARY, receipt: AnalyticsReviewService.receipt(out) };
  }
  async series(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, q: { metricKey: string; scopeKey: string | null; through: string | null; count: number }) {
    const out = await this.read(env, p, t, d, null, async (cap) => {
      const series = await cap.series({ tenantId: t, domainId: d, ...q });
      const ids = (Array.isArray(series['periods']) ? (series['periods'] as Row[]) : []).map((x) => x['result_id']).filter((x): x is string => typeof x === 'string');
      return { series: decorateSeries(series, await recordedComputations(cap.tx, ids)), read_at: await cap.now() };   // B82-F mt
    });
    return { ...out.result, receipt: AnalyticsReviewService.receipt(out) };
  }
}
