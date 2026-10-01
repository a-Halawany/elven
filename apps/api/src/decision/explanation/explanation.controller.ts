/**
 * THE HTTP SURFACE OF EXPLANATION AND APPEAL — CP-6 B35 part `explanation` (migration 0101 §E; F-P6-03). Two controllers of their own:
 * …/decisions/explanations/… (generate, the unified surface, one explanation, render, the dry faithfulness check) and …/decisions/appeals/…
 * (open, list, read, assign, adjudicate, close). Every write is one governed write whose port asserts the route's own action (an EXACT PDP
 * rule, the B35 explanation block); every read is a consequential read under decision.explanation.read / decision.appeal.read. No segment
 * here meets a DecisionController route (its `/:packageId/<literal>` shapes never take `explanations` / `appeals` with these literals).
 * Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { ExplanationCapability } from './explanation.capabilities.js';
import { APPEAL_STATES, APPEAL_SUBJECT_KINDS, assertUuid, itemsByCategory, validateAdjudicate, validateAssign, validateClose, validateOpen, validateRender, validateSentences, validateSubject } from './explanation.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const XREAD = 'decision.explanation.read';
const AREAD = 'decision.appeal.read';
const route = (tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) => ({ scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId });
const notFound = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_STA_001', correlationId, text), 404); };
const withCategories = (x: Row | null): Row | null => (x === null ? null : { ...x, by_category: itemsByCategory(((x['items'] ?? []) as Array<{ category?: unknown }>)) });

@Controller('/v1/tenants/:tenantId/domains/:domainId/decisions/explanations')
export class ExplanationController {
  constructor(private readonly pipeline: PipelineService) {}

  /** GENERATE the explanation of a subject from its preserved state (the same state returns the standing explanation, unchanged: true). */
  @Post('/generate')
  async generate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const s = validateSubject(body.payload ?? {}, envelope.correlation_id);
    const explanationId = newId();
    const out = await this.pipeline.write(envelope, principal, route(tenantId, domainId, 'decision.explanation.generate', 'XPL', explanationId), ExplanationCapability.generate,
      async (cap) => {
        const r = await cap.generate({ explanationId, tenantId, domainId, subjectKind: s.subjectKind, subjectId: s.subjectId, subjectVersion: s.subjectVersion, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'XPL', targetId: String(r['explanation_id']), targetVersion: String(r['explanation_version']), outboxEvent: null };
      });
    return { explanation: withCategories(out.result), receipt: receipt(out) };
  }

  /** THE UNIFIED EXPLANATION SURFACE of a subject: the subject now, the current explanation (renderings, faithfulness), the versions, the cases. */
  @Post('/surface')
  async surface(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const s = validateSubject(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, route(tenantId, domainId, XREAD, 'XPL', s.subjectId), ExplanationCapability.read,
      async (cap) => ({ at: await cap.now(), surface: await cap.surface(s) }));
    if (out.result.surface === null) notFound(envelope.correlation_id, `explanation rejected (unknown_subject): ${s.subjectKind} ${s.subjectId} is not visible in this domain`);
    const sf = out.result.surface as Row;
    return { at: out.result.at, surface: { ...sf, explanation: withCategories((sf['explanation'] ?? null) as Row | null) }, receipt: receipt(out) };
  }

  /** ONE EXPLANATION with its read-time state (current | stale | superseded; contested, corrected), renderings and cases. */
  @Post('/:explanationId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('explanationId') explanationId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(explanationId, 'explanation', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, route(tenantId, domainId, XREAD, 'XPL', explanationId), ExplanationCapability.read,
      async (cap) => cap.explanation(explanationId));
    if (out.result === null) notFound(envelope.correlation_id, `explanation rejected (unknown_explanation): ${explanationId} is not an explanation of this domain`);
    return { explanation: withCategories(out.result), receipt: receipt(out) };
  }

  /** A DRY faithfulness check of sentences against an explanation's items (nothing is written; the render port runs the same rule). */
  @Post('/:explanationId/check')
  async check(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('explanationId') explanationId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(explanationId, 'explanation', envelope.correlation_id);
    const sentences = validateSentences((body.payload ?? {})['sentences'], envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, route(tenantId, domainId, XREAD, 'XPL', explanationId), ExplanationCapability.read,
      async (cap) => cap.check({ explanationId, sentences: sentences as unknown as Row[] }));
    if (out.result === null) notFound(envelope.correlation_id, `explanation rejected (unknown_explanation): ${explanationId} is not an explanation of this domain`);
    return { check: out.result, receipt: receipt(out) };
  }

  /** RENDER the current explanation for an audience (a named human, or the decision agent — renders only); refused when unfaithful. */
  @Post('/:explanationId/render')
  async render(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('explanationId') explanationId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(explanationId, 'explanation', envelope.correlation_id);
    const r0 = validateRender(body.payload ?? {}, envelope.correlation_id);
    const renderingId = newId();
    const out = await this.pipeline.write(envelope, principal, route(tenantId, domainId, 'decision.explanation.render', 'XPL', explanationId), ExplanationCapability.render,
      async (cap) => {
        const r = await cap.render({ renderingId, tenantId, domainId, explanationId, audience: r0.audience as unknown as Row, sentences: r0.sentences as unknown as Row[], actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'XPL', targetId: explanationId, targetVersion: null, outboxEvent: null };
      });
    return { rendering: out.result, receipt: receipt(out) };
  }
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/decisions/appeals')
export class AppealController {
  constructor(private readonly pipeline: PipelineService) {}

  /** OPEN a contest or appeal (standing v1; the subject never altered; the bench and the owners notified). */
  @Post('/open')
  async open(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const o = validateOpen(body.payload ?? {}, envelope.correlation_id);
    const caseId = newId(); const eventId = newId();
    const out = await this.pipeline.write(envelope, principal, route(tenantId, domainId, 'decision.appeal.open', 'APL', caseId), ExplanationCapability.open,
      async (cap) => {
        const r = await cap.open({ caseId, tenantId, domainId, ...o, actor: principal.principalId, eventId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'APL', targetId: caseId, targetVersion: null, outboxEvent: null };
      });
    return { case: out.result, receipt: receipt(out) };
  }

  /** THE CASES of the domain (optionally a state, a subject kind). */
  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const state = typeof p['state'] === 'string' && (APPEAL_STATES as readonly string[]).includes(p['state']) ? (p['state'] as string) : null;
    const subjectKind = typeof p['subjectKind'] === 'string' && (APPEAL_SUBJECT_KINDS as readonly string[]).includes(p['subjectKind']) ? (p['subjectKind'] as string) : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, route(tenantId, domainId, AREAD, 'APL', null), ExplanationCapability.read,
      async (cap) => ({ at: await cap.now(), cases: await cap.appeals({ state, subjectKind, limit: 100 }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** ONE CASE: its ledger, whether it is overdue, the subject now. */
  @Post('/:caseId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(caseId, 'case', envelope.correlation_id, 'appeal');
    const out = await this.pipeline.consequentialRead(envelope, principal, route(tenantId, domainId, AREAD, 'APL', caseId), ExplanationCapability.read, async (cap) => cap.appealCase(caseId));
    if (out.result === null) notFound(envelope.correlation_id, `appeal rejected (unknown_case): ${caseId} is not an appeal case of this domain`);
    return { case: out.result, receipt: receipt(out) };
  }

  /** ASSIGN the adjudicator (a member of the bench who is neither the appellant nor a subject owner names a bench member). */
  @Post('/:caseId/assign')
  async assign(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(caseId, 'case', envelope.correlation_id, 'appeal');
    const a = validateAssign(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, route(tenantId, domainId, 'decision.appeal.adjudicate', 'APL', caseId), ExplanationCapability.adjudicate,
      async (cap) => {
        const r = await cap.assign({ tenantId, domainId, caseId, adjudicator: a.adjudicator, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'APL', targetId: caseId, targetVersion: null, outboxEvent: null };
      });
    return { case: out.result, receipt: receipt(out) };
  }

  /** ADJUDICATE (the assigned adjudicator): upheld | dismissed | partly_upheld, the rationale, the correction; the effect recorded. */
  @Post('/:caseId/adjudicate')
  async adjudicate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(caseId, 'case', envelope.correlation_id, 'appeal');
    const a = validateAdjudicate(body.payload ?? {}, envelope.correlation_id);
    const eventId = newId();
    const out = await this.pipeline.write(envelope, principal, route(tenantId, domainId, 'decision.appeal.adjudicate', 'APL', caseId), ExplanationCapability.adjudicate,
      async (cap) => {
        const r = await cap.adjudicate({ tenantId, domainId, caseId, ...a, actor: principal.principalId, eventId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'APL', targetId: caseId, targetVersion: null, outboxEvent: null };
      });
    return { case: out.result, receipt: receipt(out) };
  }

  /** CLOSE: the adjudicator closes an adjudicated case (resolved); the appellant withdraws an unadjudicated one (withdrawn). */
  @Post('/:caseId/close')
  async close(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(caseId, 'case', envelope.correlation_id, 'appeal');
    const c = validateClose(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, route(tenantId, domainId, 'decision.appeal.close', 'APL', caseId), ExplanationCapability.close,
      async (cap) => {
        const r = await cap.close({ tenantId, domainId, caseId, note: c.note, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'APL', targetId: caseId, targetVersion: null, outboxEvent: null };
      });
    return { case: out.result, receipt: receipt(out) };
  }
}
