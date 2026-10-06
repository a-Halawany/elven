/**
 * THE HTTP SURFACE OF THE GOVERNED MODEL REGISTRY AND THE ROUTED ISSUE — CP-6 B25 part `registry` (0108 §MR; F-P4-01). The prediction
 * module's envelope, capabilities and receipts; every write is one governed write whose port asserts the route's own action (the EXACT
 * PDP rules of the `B25 registry` block — none under the `prediction.forecast.issue` prefix); the reads are consequential reads
 * (prediction.registry.read, prediction.registry.plan.read). Routes under …/prediction/registry/… and …/prediction/portfolio/issue — no
 * segment meets PredictionController's routes. Nothing here decides a rule a port decides.
 *
 * THE ROUTED ISSUE answers a governed refusal AFTER its write commits: the route row, the registry ledger and `forecast.horizon_refused`
 * (or the quarantine of a failed method) are durable beside the audit row; the request is then refused with the refusal's text and class.
 */
import { Body, Controller, HttpException, Inject, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import type { Tx } from '../../shared/db.js';
import { PredictionCapability } from '../prediction.capabilities.js';
import type { Reader } from '../series/series.service.js';
import { RegistryCapability } from './registry.capabilities.js';
import {
  RegistryService, routedRefusalStatus, validateDecision, validateMethodAct, validatePlanRequest, validatePolicy, validateProposal, validateRoutedIssue, validateTarget,
  validateValidationRun, type PortfolioIssueCap,
} from './registry.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const statusCode = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');

/** The routed issue's capability: the forecast writes, the route's ports, and the transaction the B25 seams are handed. */
const portfolioCapability = (tx: Tx, action: string): PortfolioIssueCap => ({ forecast: PredictionCapability.forecast(tx, action), route: RegistryCapability.route(tx, action), seamTx: tx });

@Controller('/v1/tenants/:tenantId/domains/:domainId/prediction')
export class RegistryController {
  constructor(private readonly pipeline: PipelineService, @Inject(RegistryService) private readonly registry: RegistryService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private reader(req: EyeRequest, tenantId: string, domainId: string): Reader {
    const { envelope, principal } = ctx(req);
    return { principal, tenantId, domainId, correlationId: envelope.correlation_id, purposeId: envelope.purpose_id ?? 'prediction' };
  }

  /* ───────────── the reads ───────────── */

  /** THE REGISTRY: the effective entries (the builtins and the domain's own, each with its state and reason), the targets, the policies, the
   *  latest validations and routes, the registry's ledger. */
  @Post('/registry/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.registry.read', 'FMR', null), RegistryCapability.read,
      async (cap) => ({ at: await cap.now(), methods: await cap.effective(tenantId, domainId), targets: await cap.targets(), policies: await cap.policies(),
        validations: await cap.validations(50), routes: await cap.routes(50), events: await cap.events(null, 100) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** THE PLAN for a target (or a series) at a horizon, as the policy and the registry resolve it now — nothing recorded. */
  @Post('/registry/plan')
  async plan(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validatePlanRequest(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.registry.plan.read', 'FMR', null), RegistryCapability.read,
      async (cap) => {
        const knownAt = p.knownAt ?? await cap.now();
        return cap.plan({ tenantId, domainId, targetKey: p.targetKey, seriesKey: p.seriesKey, horizonCode: p.horizonCode, knownAt, cutoff: p.observedThrough });
      });
    return { plan: out.result, receipt: receipt(out) };
  }

  /* ───────────── methods ───────────── */

  /** PROPOSE an entry (a forecast owner, a steward, an administrator — or an agent drafting): its family's declarations, its steward. */
  @Post('/registry/methods/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateProposal(body.payload ?? {}, envelope.correlation_id);
    const version = Number((body.payload ?? {})['version'] ?? 1);
    const methodId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.registry.method.propose', 'FMR', methodId), RegistryCapability.method,
      async (cap) => {
        const r = await cap.propose({ methodId, tenantId, domainId, key: p.key, version, family: p.family, kinds: p.kinds, horizons: p.horizons, implementationRef: p.implementationRef,
          implementationDigest: p.implementationDigest, parameters: p.parameters, declarations: p.declarations, validation: p.validation, description: p.description, steward: p.steward,
          actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'FMR', targetId: methodId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { method: out.result, receipt: receipt(out) };
  }

  /** DECIDE a proposed entry (approve | reject): its named steward — a named human; never its proposer. */
  @Post('/registry/methods/:methodId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('methodId') methodId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(methodId)) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `forecast method rejected (unknown_method): ${methodId} is not an entry id`), 404);
    const d = validateDecision(body.payload ?? {}, ['approve', 'reject'], 'forecast method', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.registry.method.approve', 'FMR', methodId), RegistryCapability.method,
      async (cap) => {
        const r = await cap.decide({ methodId, tenantId, domainId, decision: d.decision, note: d.note, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'FMR', targetId: methodId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { method: out.result, receipt: receipt(out) };
  }

  /** RETIRE, QUARANTINE (on demand) or REINSTATE an entry by reference — a named human steward or administrator (the port decides which). */
  @Post('/registry/methods/retire')
  async retire(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    return this.methodAct(req, tenantId, domainId, body, 'prediction.registry.method.retire', 'reason', (cap, a) => cap.retire({ ...a, reason: a.text }));
  }
  @Post('/registry/methods/quarantine')
  async quarantine(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    return this.methodAct(req, tenantId, domainId, body, 'prediction.registry.method.quarantine', 'reason', (cap, a) => cap.quarantine({ ...a, reason: a.text }));
  }
  @Post('/registry/methods/reinstate')
  async reinstate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    return this.methodAct(req, tenantId, domainId, body, 'prediction.registry.method.reinstate', 'note', (cap, a) => cap.reinstate({ ...a, note: a.text }));
  }
  private async methodAct(req: EyeRequest, tenantId: string, domainId: string, body: Payload, action: string, field: 'reason' | 'note',
    act: (cap: ReturnType<typeof RegistryCapability.method>, a: { tenantId: string; domainId: string; methodRef: string; text: string; actor: string; correlationId: string }) => Promise<Row>) {
    const { envelope, principal } = ctx(req);
    const p = validateMethodAct(body.payload ?? {}, field, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, action, 'FMR', null), RegistryCapability.method,
      async (cap) => {
        const r = await act(cap, { tenantId, domainId, methodRef: p.methodRef, text: p.text, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'FMR', targetId: String(r['method_id']), targetVersion: String(r['version']), outboxEvent: null };
      });
    return { method: out.result, receipt: receipt(out) };
  }

  /* ───────────── targets ───────────── */

  @Post('/registry/targets/declare')
  async declareTarget(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const t = validateTarget(body.payload ?? {}, envelope.correlation_id);
    const targetId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.registry.target.declare', 'FTG', targetId), RegistryCapability.target,
      async (cap) => {
        const r = await cap.declare({ targetId, tenantId, domainId, key: t.key, kind: t.kind, unit: t.unit, title: t.title, definition: t.definition, sources: t.sources, subject: t.subject,
          riskClass: t.riskClass, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'FTG', targetId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { target: out.result, receipt: receipt(out) };
  }

  @Post('/registry/targets/:targetId/decide')
  async decideTarget(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('targetId') targetId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(targetId)) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `forecast target rejected (unknown_target): ${targetId} is not a target id`), 404);
    const d = validateDecision(body.payload ?? {}, ['approve', 'reject'], 'forecast target', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.registry.target.approve', 'FTG', targetId), RegistryCapability.target,
      async (cap) => {
        const r = await cap.decideTarget({ targetId, tenantId, domainId, decision: d.decision, note: d.note, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'FTG', targetId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { target: out.result, receipt: receipt(out) };
  }

  /* ───────────── horizon policies ───────────── */

  @Post('/registry/policies/publish')
  async publishPolicy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validatePolicy(body.payload ?? {}, envelope.correlation_id);
    const policyId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.registry.policy.publish', 'HZP', policyId), RegistryCapability.policy,
      async (cap) => {
        const r = await cap.publish({ policyId, tenantId, domainId, riskClass: p.riskClass, rules: p.rules, statement: p.statement, steward: p.steward, actor: principal.principalId,
          correlationId: envelope.correlation_id });
        return { result: r, targetType: 'HZP', targetId: policyId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { policy: out.result, receipt: receipt(out) };
  }

  @Post('/registry/policies/:policyId/concur')
  async concurPolicy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('policyId') policyId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(policyId)) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `horizon policy rejected (unknown_policy): ${policyId} is not a policy id`), 404);
    const d = validateDecision(body.payload ?? {}, ['concur', 'reject'], 'horizon policy', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.registry.policy.concur', 'HZP', policyId), RegistryCapability.policy,
      async (cap) => {
        const r = await cap.concur({ policyId, tenantId, domainId, decision: d.decision, note: d.note, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'HZP', targetId: policyId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { policy: out.result, receipt: receipt(out) };
  }

  /* ───────────── validation ───────────── */

  /** RUN AND RECORD a validation (the event backtest or the quantity rolling-origin backtest at the horizon) on the known-at history. */
  @Post('/registry/validations/run')
  async runValidation(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const v = validateValidationRun(body.payload ?? {}, envelope.correlation_id);
    const reader = this.reader(req, tenantId, domainId);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.registry.validation.record', 'MVL', null), RegistryCapability.validation,
      async (cap, scope) => {
        const r = await this.registry.runValidation(cap, scope, reader, v, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'MVL', targetId: String(r['validation_id']), targetVersion: null, outboxEvent: null };
      });
    return { validation: out.result, receipt: receipt(out) };
  }

  /* ───────────── the routed issue ───────────── */

  /**
   * ISSUE THROUGH THE PORTFOLIO: plan (the registry, the target, the horizon policy) → the chosen method on the known-at history → the
   * forecast with its kind, method, policy and language → the route bound (forecast.routed). A refused route answers AFTER the write commits
   * the ledger (forecast.horizon_refused; a failed method's quarantine).
   */
  @Post('/portfolio/issue')
  async issue(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const a = validateRoutedIssue(body.payload ?? {}, envelope.correlation_id);
    const reader = this.reader(req, tenantId, domainId);
    const forecastId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.portfolio.issue', 'FCT', forecastId), portfolioCapability,
      async (cap, scope) => {
        const r = await this.registry.issueRouted(cap, scope, reader, a, principal.principalId, envelope.correlation_id, envelope.purpose_id ?? 'prediction', forecastId);
        if (r.refused !== null) {
          return { result: r, targetType: 'FCT', targetId: forecastId, targetVersion: null, outboxEvent: null,
                   evidence: { outcome: 'success' as const, resultCode: statusCode(routedRefusalStatus(r.refused.refusal_class)), metadata: { refused: r.refused.refusal_class, route_id: r.refused.route_id } } };
        }
        return { result: r, targetType: 'FCT', targetId: forecastId, targetVersion: '1', outboxEvent: null };
      });
    if (out.result.refused !== null) {
      const s = routedRefusalStatus(out.result.refused.refusal_class);
      throw new HttpException({ ...errorBody(statusCode(s), envelope.correlation_id, out.result.refused.refusal), route_id: out.result.refused.route_id,
        refusal_class: out.result.refused.refusal_class, quarantined: out.result.refused.quarantined, plan: out.result.plan }, s);
    }
    return { forecast: out.result.forecast, plan: out.result.plan, receipt: receipt(out) };
  }
}
