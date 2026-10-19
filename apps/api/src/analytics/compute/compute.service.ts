/**
 * B92 §0 (0113 §0.7–§0.9) — THE COMPUTE SERVICE: a governed computation of a product metric (analytics.metric.compute — an analyst, the owner, or
 * an agent: AI may compute; it never approves), its replay at its own as-of (analytics.metric.replay), and the reads (analytics.read, audited):
 * a result with its definition, scope and RECORDS — the drill-down definition → result → records — the results list and the computation
 * registry. Every rule is the port's; a refusal is the port's text in the class form `metric computation rejected (<class>): …`.
 */
import { Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { ComputeCapability, type ComputeReads, type ComputeWrites } from './compute.capabilities.js';

type Row = Record<string, unknown>;
export const ANALYTICS_READ = 'analytics.read';
export const BOUNDARY = 'product analytics (B92): signed acceptance records → R2; accessibility conformance → B107/H3; deployment parity → B106; customer onboarding time → B94. A synthetic demonstration never closes a clause that needs the real integration.';

@Injectable()
export class AnalyticsComputeService {
  constructor(private readonly pipeline: PipelineService) {}

  route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
    return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope;
  }
  read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectType: string | null, objectId: string | null, fn: (cap: ComputeReads) => Promise<T>) {
    return this.pipeline.consequentialRead(this.derive(env, ANALYTICS_READ, objectType, objectId), p, this.route(t, d, ANALYTICS_READ, objectType, objectId), ComputeCapability.read, async (cap) => fn(cap));
  }
  write<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null,
           fn: (cap: ComputeWrites) => Promise<{ result: T; targetType?: string | null; targetId?: string | null; targetVersion?: string | null }>) {
    return this.pipeline.write(this.derive(env, action, objectType, objectId), p, this.route(t, d, action, objectType, objectId), ComputeCapability.write,
      async (cap) => { const r = await fn(cap); return { result: r.result, targetType: r.targetType ?? objectType, targetId: r.targetId ?? objectId, targetVersion: r.targetVersion ?? null, outboxEvent: null }; });
  }
  static receipt(o: { policyDecisionId: string; auditSeq: number }) { return { policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq }; }

  async compute(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { metricKey: string; period: string; scopeKey: string | null; cohort: Row; asOf: string | null; preview: boolean }) {
    const resultId = newId();
    const out = await this.write(env, p, t, d, 'analytics.metric.compute', 'AMR', resultId, async (cap) => ({
      result: await cap.compute({ resultId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { result: out.result, boundary: BOUNDARY, receipt: AnalyticsComputeService.receipt(out) };
  }
  async replay(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, resultId: string) {
    const replayId = newId();
    const out = await this.write(env, p, t, d, 'analytics.metric.replay', 'AMR', resultId, async (cap) => ({
      result: await cap.replay({ replayId, tenantId: t, domainId: d, resultId, actor: p.principalId, correlationId: env.correlation_id }), targetId: replayId,
    }));
    return { replay: out.result, receipt: AnalyticsComputeService.receipt(out) };
  }
  async result(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, resultId: string, recordsLimit: number) {
    const out = await this.read(env, p, t, d, 'AMR', resultId, async (cap) => {
      const result = await cap.result(resultId, recordsLimit);
      if (result === null) return { result, read_at: await cap.now() };
      // B82-F mt: beside the computation the result RECORDED (key, version, digest), the registry's row NOW for the same key (else the definition's)
      const key = (result['computation_key'] ?? (result['definition'] as Row | null)?.['computation_key'] ?? null) as string | null;
      return { result: { ...result, computation_now: await cap.computationNow(key) }, read_at: await cap.now() };
    });
    return { ...out.result, boundary: BOUNDARY, receipt: AnalyticsComputeService.receipt(out) };
  }
  async results(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, q: { metricKey: string | null; period: string | null; scopeKey: string | null; limit: number }) {
    const out = await this.read(env, p, t, d, 'AMR', null, async (cap) => ({ results: await cap.results(q), read_at: await cap.now() }));
    return { ...out.result, receipt: AnalyticsComputeService.receipt(out) };
  }
  async registry(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'AMR', null, async (cap) => ({ computations: await cap.registry(), read_at: await cap.now() }));
    return { ...out.result, receipt: AnalyticsComputeService.receipt(out) };
  }
}
