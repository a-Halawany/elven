/**
 * CP-6 B40 §VA (0123_b40_x_va; F-P1-02) — THE AUTHENTICITY, EVIDENCE-ATTRIBUTE, INHERITANCE AND RETENTION-REGISTER ROUTES: a further
 * controller inside the existing api.observation unit (the B82 idiom — ObservationController untouched).
 *
 *   POST …/domains/:d/observation/authenticity/keys/read          {sourceId?}       the key register (observation.authenticity.read)
 *   POST …/domains/:d/observation/authenticity/keys/declare       {sourceId, keyRef, kind, publicKeyPem | pin, validFrom?, validTo?, rotatedFrom?, reason,
 *                                                                   requestId?}     observation.authenticity.key.declare (human-gated)
 *   POST …/domains/:d/observation/authenticity/keys/:keyId/retire {reason}          observation.authenticity.key.retire (human-gated)
 *   POST …/domains/:d/observation/authenticity/evidence/:evdId/read {}              an evidence object's outcome + attributes per version (observation.authenticity.read)
 *   POST …/domains/:d/observation/evidence/:evdId/attributes/set  {version, attribute, value, reason, requestId?}
 *                                                                                   observation.evidence.attribute.set (a data steward, human-gated)
 *   POST …/domains/:d/observation/obligations/read                {type, id, version} the inherited obligations (objects.obligations.read)
 *   POST …/domains/:d/observation/transformation-rules/read       {}                the rule register (objects.obligations.read)
 *   POST …/domains/:d/observation/transformation-rules/propose    {obligation, transformation, from, to, objectTypes, rationale, requestId?}
 *                                                                                   objects.transformation_rule.propose (a data steward, human-gated)
 *   POST …/domains/:d/observation/transformation-rules/:ruleId/decide {decision, reason}  objects.transformation_rule.decide (the privacy officer)
 *   POST …/domains/:d/observation/transformation-rules/:ruleId/retire {reason}           objects.transformation_rule.retire (the privacy officer)
 *   POST /v1/tenants/:t/observation/retention-register/read       {}                the per-tenant retention register (retention.register.read, TENANT)
 *
 * Metadata only (D9): no route here serves evidence bytes or payload content. The answers are the ports', with the receipt. CONSTRUCTION only.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { VaCapability } from './authenticity.capabilities.js';

type Row = Record<string, unknown>;
type Body_ = { payload?: Row } | undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = '/v1/tenants/:tenantId/domains/:domainId/observation';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const unprocessable = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };
const pathId = (v: string, what: string, correlationId: string): string => {
  if (!UUID_RE.test(v)) throw new HttpException(errorBody('EYE_STA_001', correlationId, `${what} ${v} is not an id of this domain`), 404);
  return v.toLowerCase();
};
const optUuid = (v: unknown, noun: string, what: string, corr: string): string | null =>
  v === undefined || v === null || v === '' ? null : typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : unprocessable(corr, `${noun} rejected (request): ${what} is an id (a uuid)`);
const reqUuid = (v: unknown, noun: string, what: string, corr: string): string =>
  typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : unprocessable(corr, `${noun} rejected (request): ${what} is an id (a uuid)`);
const text = (v: unknown, noun: string, what: string, corr: string): string => (typeof v === 'string' ? v : unprocessable(corr, `${noun} rejected (request): ${what} is text`));
const optText = (v: unknown, noun: string, what: string, corr: string): string | null =>
  v === undefined || v === null || v === '' ? null : typeof v === 'string' ? v : unprocessable(corr, `${noun} rejected (request): ${what} is text or null`);
const optInstant = (v: unknown, noun: string, what: string, corr: string): string | null =>
  v === undefined || v === null || v === '' ? null : typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : unprocessable(corr, `${noun} rejected (request): ${what} is an ISO instant or null`);
const requestIdOf = (v: unknown): string => (typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : newId());

@Controller()
export class AuthenticityController {
  constructor(private readonly pipeline: PipelineService) {}

  // ───────────────────────── the publisher keys ─────────────────────────
  @Post(`${BASE}/authenticity/keys/read`)
  async readKeys(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const sourceId = optUuid(body?.payload?.['sourceId'], 'publisher key', 'sourceId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.authenticity.read', objectType: sourceId === null ? 'PBK' : 'SRC', objectId: sourceId },
      VaCapability.read, async (cap) => cap.keys({ tenantId, domainId, sourceId }));
    return { keys: out.result, receipt: receipt(out) };
  }

  @Post(`${BASE}/authenticity/keys/declare`)
  async declareKey(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {}; const corr = envelope.correlation_id; const n = 'publisher key';
    const sourceId = reqUuid(p['sourceId'], n, 'sourceId', corr);
    const a = {
      requestId: requestIdOf(p['requestId']), tenantId, domainId, sourceId, keyRef: text(p['keyRef'], n, 'keyRef', corr), kind: text(p['kind'], n, 'kind', corr),
      publicKeyPem: optText(p['publicKeyPem'], n, 'publicKeyPem', corr), pin: optText(p['pin'], n, 'pin', corr),
      validFrom: optInstant(p['validFrom'], n, 'validFrom', corr), validTo: optInstant(p['validTo'], n, 'validTo', corr),
      rotatedFrom: optUuid(p['rotatedFrom'], n, 'rotatedFrom', corr), reason: text(p['reason'], n, 'reason', corr), actor: principal.principalId, correlationId: corr,
    };
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.authenticity.key.declare', objectType: 'SRC', objectId: sourceId },
      VaCapability.declareKey,
      async (cap) => {
        const r = await cap.declare(a);
        return { result: r, targetType: 'PBK', targetId: String(r['key_id'] ?? sourceId), targetVersion: null, outboxEvent: null };
      });
    return { key: out.result, receipt: receipt(out) };
  }

  @Post(`${BASE}/authenticity/keys/:keyId/retire`)
  async retireKey(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('keyId') keyIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const keyId = pathId(keyIdRaw, 'publisher key', corr);
    const reason = text(body?.payload?.['reason'], 'publisher key', 'reason', corr);
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.authenticity.key.retire', objectType: 'PBK', objectId: keyId },
      VaCapability.retireKey,
      async (cap) => ({ result: await cap.retire({ tenantId, domainId, keyId, reason, actor: principal.principalId, correlationId: corr }), targetType: 'PBK', targetId: keyId, targetVersion: null, outboxEvent: null }));
    return { key: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── one evidence object: authenticity + attributes ─────────────────────────
  @Post(`${BASE}/authenticity/evidence/:evdId/read`)
  async readEvidence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('evdId') evdIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const evdId = pathId(evdIdRaw, 'evidence', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.authenticity.read', objectType: 'EVD', objectId: evdId },
      VaCapability.read, async (cap) => cap.evidence({ tenantId, domainId, evdId }));
    return { authenticity: out.result, receipt: receipt(out) };
  }

  @Post(`${BASE}/evidence/:evdId/attributes/set`)
  async setAttribute(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('evdId') evdIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id; const n = 'evidence attribute';
    const evdId = pathId(evdIdRaw, 'evidence', corr);
    const p = body?.payload ?? {};
    const version = Number.isSafeInteger(p['version']) && (p['version'] as number) >= 1 ? p['version'] as number : unprocessable(corr, `${n} rejected (request): version is the evidence version (an integer of 1 or more)`);
    const a = { requestId: requestIdOf(p['requestId']), tenantId, domainId, evdId, version, attribute: text(p['attribute'], n, 'attribute', corr), value: p['value'] ?? null,
                reason: text(p['reason'], n, 'reason', corr), actor: principal.principalId, correlationId: corr };
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.evidence.attribute.set', objectType: 'EVD', objectId: evdId },
      VaCapability.setAttribute,
      async (cap) => ({ result: await cap.setAttribute(a), targetType: 'EVD', targetId: evdId, targetVersion: String(version), outboxEvent: null }));
    return { attribute: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── inheritance and the transformation rules ─────────────────────────
  @Post(`${BASE}/obligations/read`)
  async readObligations(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id; const p = body?.payload ?? {};
    const type = typeof p['type'] === 'string' && /^[A-Z]{3}$/.test(p['type']) ? p['type'] : unprocessable(corr, 'obligations rejected (subject): type is a recorded object type (three capitals)');
    const id = reqUuid(p['id'], 'obligations', 'id', corr);
    const version = Number.isSafeInteger(p['version']) && (p['version'] as number) >= 1 ? p['version'] as number : unprocessable(corr, 'obligations rejected (subject): version is an integer of 1 or more');
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'objects.obligations.read', objectType: type, objectId: id },
      VaCapability.obligations, async (cap) => cap.inherited({ tenantId, domainId, type, id, version }));
    return { obligations: out.result, receipt: receipt(out) };
  }

  @Post(`${BASE}/transformation-rules/read`)
  async readRules(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'objects.obligations.read', objectType: 'TRR', objectId: null },
      VaCapability.obligations, async (cap) => cap.rules({ tenantId, domainId }));
    return { rules: out.result, receipt: receipt(out) };
  }

  @Post(`${BASE}/transformation-rules/propose`)
  async proposeRule(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id; const n = 'transformation rule'; const p = body?.payload ?? {};
    const objectTypes = Array.isArray(p['objectTypes']) && (p['objectTypes'] as unknown[]).every((x) => typeof x === 'string') ? p['objectTypes'] as string[]
      : unprocessable(corr, `${n} rejected (object_types): objectTypes is a list of derived object types`);
    const a = { requestId: requestIdOf(p['requestId']), tenantId, domainId, obligation: text(p['obligation'], n, 'obligation', corr), transformation: text(p['transformation'], n, 'transformation', corr),
                from: text(p['from'], n, 'from', corr), to: text(p['to'], n, 'to', corr), objectTypes, rationale: text(p['rationale'], n, 'rationale', corr),
                actor: principal.principalId, correlationId: corr };
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'objects.transformation_rule.propose', objectType: 'TRR', objectId: null },
      VaCapability.proposeRule,
      async (cap) => { const r = await cap.propose(a); return { result: r, targetType: 'TRR', targetId: String(r['rule_id'] ?? ''), targetVersion: null, outboxEvent: null }; });
    return { rule: out.result, receipt: receipt(out) };
  }

  @Post(`${BASE}/transformation-rules/:ruleId/decide`)
  async decideRule(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('ruleId') ruleIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id; const n = 'transformation rule';
    const ruleId = pathId(ruleIdRaw, n, corr);
    const decision = text(body?.payload?.['decision'], n, 'decision', corr); const reason = text(body?.payload?.['reason'], n, 'reason', corr);
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'objects.transformation_rule.decide', objectType: 'TRR', objectId: ruleId },
      VaCapability.decideRule,
      async (cap) => ({ result: await cap.decide({ tenantId, domainId, ruleId, decision, reason, actor: principal.principalId, correlationId: corr }), targetType: 'TRR', targetId: ruleId, targetVersion: null, outboxEvent: null }));
    return { rule: out.result, receipt: receipt(out) };
  }

  @Post(`${BASE}/transformation-rules/:ruleId/retire`)
  async retireRule(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('ruleId') ruleIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id; const n = 'transformation rule';
    const ruleId = pathId(ruleIdRaw, n, corr);
    const reason = text(body?.payload?.['reason'], n, 'reason', corr);
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'objects.transformation_rule.retire', objectType: 'TRR', objectId: ruleId },
      VaCapability.retireRule,
      async (cap) => ({ result: await cap.retireRule({ tenantId, domainId, ruleId, reason, actor: principal.principalId, correlationId: corr }), targetType: 'TRR', targetId: ruleId, targetVersion: null, outboxEvent: null }));
    return { rule: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the per-tenant retention register (TENANT) ─────────────────────────
  @Post('/v1/tenants/:tenantId/observation/retention-register/read')
  async readRegister(@Req() req: EyeRequest, @Param('tenantId') tenantIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const tenantId = pathId(tenantIdRaw, 'tenant', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'TENANT', tenantId, domainId: null, action: 'retention.register.read', objectType: 'RET', objectId: null },
      VaCapability.register, async (cap) => cap.register({ tenantId }));
    return { register: out.result, receipt: receipt(out) };
  }
}
