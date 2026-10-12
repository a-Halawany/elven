/**
 * B92 §CO (0113 §CO) — THE COMPARABILITY SERVICE: the cohort comparison (analytics.comparison.run — an analyst, the owner or the attention
 * agent: AI may compute), the cost reconciliation (analytics.reconciliation.run — an analyst or the owner), the governed semantic objects of
 * B90's layer (products.semantic.declare / certify / withdraw — named humans; DP-44-001) and their reads (analytics.read, products.semantic.read
 * — audited). The standing evaluation and the after-result step are the database's (the prelude's compute body calls them); this service only
 * orchestrates what the ports do not: a comparison asked for by PERIOD and COHORT first reads the named cohort object and computes each side
 * through the prelude's compute surface — each in its OWN governed transaction, BEFORE the comparison's write (the long-read rule) — and then
 * compares the two results. Every rule is a port's; a refusal is the port's text in the class form `<noun> rejected (<class>): …`.
 *
 * THE CLAIMS: software capability (proven on SYNTHETIC rows by phase6-comparability-b92); the synthetic demonstration is the act's; the signed
 * acceptance (AT-70, PR-70-006) is R2's.
 */
import { Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AnalyticsComputeService, ANALYTICS_READ } from '../compute/compute.service.js';
import { refuseAnalytics } from '../seams.js';
import { ComparabilityCapability, type ComparabilityReads, type ComparabilityWrites } from './comparability.capabilities.js';

type Row = Record<string, unknown>;
export const SEMANTIC_READ = 'products.semantic.read';
export const CO_BOUNDARY = 'comparability (B92 §CO): software capability proven on SYNTHETIC rows; B91 meters no analytics dimension (its vocabulary is closed) — the analytics cost is metered here and reconciled against B91, never silently passed; the signed acceptance (AT-70, PR-70-006) → R2.';

/** One side of a comparison: an existing result, or a computation asked for by period (+ scope, + a cohort or a certified cohort object). */
export type Side = { resultId: string } | { period: string; scopeKey: string | null; cohort: Row | null; cohortObjectId: string | null; asOf: string | null };

@Injectable()
export class ComparabilityService {
  constructor(private readonly pipeline: PipelineService, private readonly compute: AnalyticsComputeService) {}

  route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
    return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope;
  }
  read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null, fn: (cap: ComparabilityReads) => Promise<T>) {
    return this.pipeline.consequentialRead(this.derive(env, action, objectType, objectId), p, this.route(t, d, action, objectType, objectId), ComparabilityCapability.read, async (cap) => fn(cap));
  }
  write<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null,
           fn: (cap: ComparabilityWrites) => Promise<{ result: T; targetType?: string | null; targetId?: string | null; targetVersion?: string | null }>) {
    return this.pipeline.write(this.derive(env, action, objectType, objectId), p, this.route(t, d, action, objectType, objectId), ComparabilityCapability.write,
      async (cap) => { const r = await fn(cap); return { result: r.result, targetType: r.targetType ?? objectType, targetId: r.targetId ?? objectId, targetVersion: r.targetVersion ?? null, outboxEvent: null }; });
  }
  static receipt(o: { policyDecisionId: string; auditSeq: number }) { return { policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq }; }

  // ───────────────────────── the cohort comparison ─────────────────────────
  /** A side asked for by period: its cohort object read first (its criteria ARE the side's cohort), then computed through the prelude's port. */
  private async resolve(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, metricKey: string | null, side: Side, label: string): Promise<{ resultId: string; cohortObjectId: string | null; computed: Row | null }> {
    if ('resultId' in side) return { resultId: side.resultId, cohortObjectId: null, computed: null };
    if (metricKey === null) throw refuseAnalytics('cohort comparison', 'request', `side ${label} is asked for by period: payload.metricKey names the metric`, env.correlation_id);
    let cohort: Row = side.cohort ?? {};
    if (side.cohortObjectId !== null) {
      const obj = (await this.read(env, p, t, d, SEMANTIC_READ, 'SOB', side.cohortObjectId, async (cap) => cap.semanticObject(side.cohortObjectId as string))).result;
      if (obj === null) throw refuseAnalytics('cohort comparison', 'unknown_semantic_object', `${side.cohortObjectId} is not a semantic object of this domain`, env.correlation_id, 404);
      const versions = Array.isArray(obj['versions']) ? (obj['versions'] as Row[]) : [];
      const v = Number(obj['certified_version'] ?? obj['current_version']);
      const def = (versions.find((x) => Number(x['version']) === v)?.['definition'] ?? {}) as Row;
      cohort = (def['criteria'] ?? {}) as Row;
    }
    const out = await this.compute.compute(env, p, t, d, { metricKey, period: side.period, scopeKey: side.scopeKey, cohort, asOf: side.asOf, preview: false });
    return { resultId: String((out.result as Row)['result_id']), cohortObjectId: side.cohortObjectId, computed: out.result as Row };
  }
  async runComparison(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { metricKey: string | null; a: Side; b: Side; cohortObjectA: string | null; cohortObjectB: string | null }) {
    const sa = await this.resolve(env, p, t, d, b.metricKey, b.a, 'a');
    const sb = await this.resolve(env, p, t, d, b.metricKey, b.b, 'b');
    const comparisonId = newId();
    const out = await this.write(env, p, t, d, 'analytics.comparison.run', 'ACM', comparisonId, async (cap) => ({
      result: await cap.compare({ comparisonId, tenantId: t, domainId: d, resultA: sa.resultId, resultB: sb.resultId, cohortObjectA: sa.cohortObjectId ?? b.cohortObjectA,
                                  cohortObjectB: sb.cohortObjectId ?? b.cohortObjectB, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { comparison: out.result, computed: { a: sa.computed, b: sb.computed }, boundary: CO_BOUNDARY, receipt: ComparabilityService.receipt(out) };
  }
  async comparisons(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, metricKey: string | null, limit: number) {
    const out = await this.read(env, p, t, d, ANALYTICS_READ, 'ACM', null, async (cap) => ({ comparisons: await cap.comparisons(metricKey, limit), read_at: await cap.now() }));
    return { ...out.result, receipt: ComparabilityService.receipt(out) };
  }
  async comparison(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, id: string) {
    const out = await this.read(env, p, t, d, ANALYTICS_READ, 'ACM', id, async (cap) => ({ comparison: await cap.comparison(id), read_at: await cap.now() }));
    return { ...out.result, receipt: ComparabilityService.receipt(out) };
  }

  // ───────────────────────── the cost reconciliation ─────────────────────────
  async reconcile(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { period: string; tolerance: number | null }) {
    const reconciliationId = newId();
    const out = await this.write(env, p, t, d, 'analytics.reconciliation.run', 'ARC', reconciliationId, async (cap) => ({
      result: await cap.reconcile({ reconciliationId, tenantId: t, domainId: d, period: b.period, tolerance: b.tolerance, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { reconciliation: out.result, boundary: CO_BOUNDARY, receipt: ComparabilityService.receipt(out) };
  }
  async reconciliations(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, limit: number) {
    const out = await this.read(env, p, t, d, ANALYTICS_READ, 'ARC', null, async (cap) => ({ reconciliations: await cap.reconciliations(limit), read_at: await cap.now() }));
    return { ...out.result, receipt: ComparabilityService.receipt(out) };
  }
  async costs(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, period: string | null, limit: number) {
    const out = await this.read(env, p, t, d, ANALYTICS_READ, 'ARC', null, async (cap) => ({ costs: await cap.costs(period, limit), read_at: await cap.now() }));
    return { ...out.result, receipt: ComparabilityService.receipt(out) };
  }

  // ───────────────────────── DP-44-001: the governed semantic objects ─────────────────────────
  async declare(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { objectId: string | null; key: string; kind: string; title: string; definition: Row; owner: string }) {
    const objectId = b.objectId ?? newId();
    const out = await this.write(env, p, t, d, 'products.semantic.declare', 'SOB', objectId, async (cap) => ({
      result: await cap.declare({ objectId, tenantId: t, domainId: d, key: b.key, kind: b.kind, title: b.title, definition: b.definition, owner: b.owner, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { object: out.result, receipt: ComparabilityService.receipt(out) };
  }
  async certify(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectId: string, b: { version: number; digest: string; expiresAt: string; reason: string }) {
    const certificationId = newId();
    const out = await this.write(env, p, t, d, 'products.semantic.certify', 'SOB', objectId, async (cap) => ({
      result: await cap.certify({ certificationId, objectId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { object: out.result, receipt: ComparabilityService.receipt(out) };
  }
  async withdraw(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'products.semantic.withdraw', 'SOB', objectId, async (cap) => ({
      result: await cap.withdraw({ objectId, tenantId: t, domainId: d, reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { object: out.result, receipt: ComparabilityService.receipt(out) };
  }
  async semanticObject(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectId: string) {
    const out = await this.read(env, p, t, d, SEMANTIC_READ, 'SOB', objectId, async (cap) => ({ object: await cap.semanticObject(objectId), read_at: await cap.now() }));
    return { ...out.result, receipt: ComparabilityService.receipt(out) };
  }
  async semanticObjects(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, kind: string | null) {
    const out = await this.read(env, p, t, d, SEMANTIC_READ, 'SOB', null, async (cap) => ({ objects: await cap.semanticObjects(kind), read_at: await cap.now() }));
    return { ...out.result, receipt: ComparabilityService.receipt(out) };
  }
}
