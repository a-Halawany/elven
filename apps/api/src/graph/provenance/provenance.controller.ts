/**
 * CP-6 B50 §PV (0120_b50_x_pv) — THE PROVENANCE ROUTES: a further controller on the graph's base path (inside the existing api.graph unit,
 * as B20's ProjectionsController), so the graph controller is untouched. Every route is a POST under the envelope; each answer is the port's
 * with the receipt (policy decision, audit sequence).
 *
 *   READS (graph.provenance.read, audited)
 *     POST …/graph/provenance/explain              {type, id, version}         the backward path, the boundaries, the forward preview
 *     POST …/graph/provenance/diff                 {type, id, from, to}        the change set between two versions + downstream impact
 *     POST …/graph/provenance/graph-diff           {from, to}                  the graph revisions between two heads
 *     POST …/graph/provenance/fitness              {type, id, version}         the evaluation now + the recorded mark
 *     POST …/graph/provenance/alignment            {kind, id, version?}        claim-to-evidence alignment of a briefing / publication / export
 *     POST …/graph/provenance/challenges/list      {subjectId?, state?}        the knowledge challenges
 *     POST …/graph/provenance/agent                {}                          the provenance agent's registry and runs
 *   ACTS (human-gated unless the agent's own)
 *     POST …/graph/provenance/fitness/mark         {type, id, version, route?, note, markId?}       graph.provenance.fitness.mark
 *     POST …/graph/provenance/challenges           {type, id, version, grounds, disputed?, reviewWithinDays?, requestId?}   …challenge.open
 *     POST …/graph/provenance/challenges/:id/review                            …challenge.review
 *     POST …/graph/provenance/challenges/:id/evidence  {ref, digest, note}     …challenge.evidence
 *     POST …/graph/provenance/challenges/:id/decide    {decision, note}        …challenge.decide
 *     POST …/graph/provenance/challenges/:id/withdraw  {reason}                …challenge.withdraw
 *     POST …/graph/provenance/challenges/:id/escalate                          …challenge.escalate
 *     POST …/graph/provenance/agent/register       {ownerPrincipalId, budgets?}  graph.provenance.agent.register (+ identity.principal.create)
 *     POST …/graph/provenance/agent/:agentId/revoke    {reason}                graph.provenance.agent.revoke
 *     POST …/graph/provenance/agent/:agentId/run   {type, id, version}         graph.provenance.agent.trigger (the person) → graph.provenance.construct (the agent)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { ProvenanceCapability } from './provenance.capabilities.js';
import { ProvenanceService, alignmentIntake, diffIntake, graphDiffIntake, optionalUuid, subjectIntake, text, toExplainView, toFitnessView } from './provenance.service.js';

type Row = Record<string, unknown>;
type Body_ = { payload?: Row } | undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const pathId = (v: string, what: string, correlationId: string): string => {
  if (!UUID_RE.test(v)) throw new HttpException(errorBody('EYE_STA_001', correlationId, `${what} ${v} is not an id of this domain`), 404);
  return v.toLowerCase();
};

@Controller('/v1/tenants/:tenantId/domains/:domainId/graph')
export class ProvenanceController {
  constructor(private readonly pipeline: PipelineService, private readonly provenance: ProvenanceService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────────────────── reads ─────────────────────────
  @Post('/provenance/explain')
  async explain(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const s = subjectIntake(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.provenance.read', s.type, s.id), ProvenanceCapability.read,
      async (cap) => toExplainView(await cap.explain({ tenantId, domainId, ...s })));
    return { explain: out.result, receipt: receipt(out) };
  }

  @Post('/provenance/diff')
  async diff(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const d = diffIntake(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.provenance.read', d.type, d.id), ProvenanceCapability.read,
      async (cap) => cap.revisionDiff({ tenantId, domainId, ...d }));
    return { diff: out.result, receipt: receipt(out) };
  }

  @Post('/provenance/graph-diff')
  async graphDiff(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const d = graphDiffIntake(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.provenance.read', 'GRV', null), ProvenanceCapability.read,
      async (cap) => cap.graphRevisionDiff({ tenantId, domainId, ...d }));
    return { diff: out.result, receipt: receipt(out) };
  }

  @Post('/provenance/fitness')
  async fitness(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const s = subjectIntake(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.provenance.read', s.type, s.id), ProvenanceCapability.read,
      async (cap) => toFitnessView(await cap.fitness({ tenantId, domainId, ...s })));
    return { fitness: out.result, receipt: receipt(out) };
  }

  @Post('/provenance/alignment')
  async alignment(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const a = alignmentIntake(body?.payload ?? {}, envelope.correlation_id);
    const objectType = a.kind === 'briefing' ? 'BRF' : a.kind === 'publication' ? 'PUB' : 'RTA';
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.provenance.read', objectType, a.id), ProvenanceCapability.read,
      async (cap) => cap.alignment({ tenantId, domainId, ...a }));
    return { alignment: out.result, receipt: receipt(out) };
  }

  @Post('/provenance/challenges/list')
  async challenges(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const subjectId = optionalUuid(p, 'subjectId', envelope.correlation_id);
    const state = typeof p['state'] === 'string' && p['state'] !== '' ? (p['state'] as string) : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.provenance.read', 'KCH', subjectId), ProvenanceCapability.read,
      async (cap) => cap.challenges({ tenantId, domainId, subjectId, state }));
    return { challenges: out.result, receipt: receipt(out) };
  }

  @Post('/provenance/agent')
  async agent(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.provenance.read', 'AGT', null), ProvenanceCapability.read,
      async (cap) => cap.agentState({ tenantId, domainId }));
    return { agent: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the generic unfit mark ─────────────────────────
  @Post('/provenance/fitness/mark')
  async mark(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const s = subjectIntake(p, envelope.correlation_id);
    const note = text(p, 'note', 8, 2000, envelope.correlation_id, 'what was examined and why the mark is recorded now');
    const route = p['route'] === undefined || p['route'] === null || p['route'] === '' ? null : String(p['route']);
    const markId = optionalUuid(p, 'markId', envelope.correlation_id) ?? newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.provenance.fitness.mark', s.type, s.id), ProvenanceCapability.fitnessMark,
      async (cap) => {
        const r = await cap.markFitness({ tenantId, domainId, ...s, markId, route, note, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: s.type, targetId: s.id, targetVersion: String(s.version), outboxEvent: null };
      });
    return { mark: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the contest path (HX-14) ─────────────────────────
  @Post('/provenance/challenges')
  async open(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const s = subjectIntake(p, envelope.correlation_id);
    const grounds = text(p, 'grounds', 16, 4000, envelope.correlation_id, 'the grounds of the challenge');
    const disputed = Array.isArray(p['disputed']) ? (p['disputed'] as unknown[]).map(String) : [];
    const days = p['reviewWithinDays'] === undefined || p['reviewWithinDays'] === null ? null : Number(p['reviewWithinDays']);
    const requestId = optionalUuid(p, 'requestId', envelope.correlation_id) ?? newId();
    const challengeId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.provenance.challenge.open', 'KCH', challengeId), ProvenanceCapability.challenge,
      async (cap) => {
        const r = await cap.openChallenge({ tenantId, domainId, ...s, challengeId, requestId, grounds, disputed, reviewWithinDays: days, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'KCH', targetId: String(r['challenge_id'] ?? challengeId), targetVersion: null, outboxEvent: null };
      });
    return { challenge: out.result, receipt: receipt(out) };
  }

  private async act(req: EyeRequest, tenantId: string, domainId: string, id: string, action: string,
                    run: (cap: ReturnType<typeof ProvenanceCapability.challenge>, challengeId: string, actor: string, correlationId: string) => Promise<Row>) {
    const { envelope, principal } = ctx(req);
    const challengeId = pathId(id, 'challenge', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, action, 'KCH', challengeId), ProvenanceCapability.challenge,
      async (cap) => ({ result: await run(cap, challengeId, principal.principalId, envelope.correlation_id), targetType: 'KCH', targetId: challengeId, targetVersion: null, outboxEvent: null }));
    return { challenge: out.result, receipt: receipt(out) };
  }

  @Post('/provenance/challenges/:challengeId/review')
  review(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('challengeId') id: string) {
    return this.act(req, tenantId, domainId, id, 'graph.provenance.challenge.review', (cap, challengeId, actor, correlationId) => cap.reviewChallenge({ challengeId, tenantId, domainId, actor, correlationId }));
  }

  @Post('/provenance/challenges/:challengeId/evidence')
  evidence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('challengeId') id: string, @Body() body: Body_) {
    const { envelope } = ctx(req);
    const p = body?.payload ?? {};
    const ref = text(p, 'ref', 5, 200, envelope.correlation_id, 'the evidence as TYPE:id@version');
    const digest = text(p, 'digest', 64, 64, envelope.correlation_id, "the evidence object's content digest");
    const note = text(p, 'note', 8, 2000, envelope.correlation_id, 'what the evidence shows');
    return this.act(req, tenantId, domainId, id, 'graph.provenance.challenge.evidence', (cap, challengeId, actor, correlationId) =>
      cap.submitEvidence({ evidenceId: newId(), challengeId, tenantId, domainId, ref, digest, note, actor, correlationId }));
  }

  @Post('/provenance/challenges/:challengeId/decide')
  decide(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('challengeId') id: string, @Body() body: Body_) {
    const { envelope } = ctx(req);
    const p = body?.payload ?? {};
    const decision = p['decision'];
    if (decision !== 'upheld' && decision !== 'dismissed') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, "decision is 'upheld' or 'dismissed'"), 422);
    const note = text(p, 'note', 16, 4000, envelope.correlation_id, 'the reasons of the decision');
    return this.act(req, tenantId, domainId, id, 'graph.provenance.challenge.decide', (cap, challengeId, actor, correlationId) => cap.decideChallenge({ challengeId, tenantId, domainId, decision, note, actor, correlationId }));
  }

  @Post('/provenance/challenges/:challengeId/withdraw')
  withdraw(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('challengeId') id: string, @Body() body: Body_) {
    const { envelope } = ctx(req);
    const reason = text(body?.payload ?? {}, 'reason', 8, 2000, envelope.correlation_id, 'the reason of the withdrawal');
    return this.act(req, tenantId, domainId, id, 'graph.provenance.challenge.withdraw', (cap, challengeId, actor, correlationId) => cap.withdrawChallenge({ challengeId, tenantId, domainId, reason, actor, correlationId }));
  }

  @Post('/provenance/challenges/:challengeId/escalate')
  escalate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('challengeId') id: string) {
    return this.act(req, tenantId, domainId, id, 'graph.provenance.challenge.escalate', (cap, challengeId, actor, correlationId) => cap.escalateChallenge({ challengeId, tenantId, domainId, actor, correlationId }));
  }

  // ───────────────────────── the provenance agent (AG-014) ─────────────────────────
  @Post('/provenance/agent/register')
  register(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    return this.provenance.registerAgent(envelope, principal, tenantId, domainId, body?.payload ?? {});
  }

  @Post('/provenance/agent/:agentId/revoke')
  revoke(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('agentId') agentId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const id = pathId(agentId, 'provenance agent', envelope.correlation_id);
    const reason = text(body?.payload ?? {}, 'reason', 8, 2000, envelope.correlation_id, 'the reason of the revocation');
    return this.provenance.revokeAgent(envelope, principal, tenantId, domainId, id, reason);
  }

  @Post('/provenance/agent/:agentId/run')
  run(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('agentId') agentId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const id = pathId(agentId, 'provenance agent', envelope.correlation_id);
    return this.provenance.runAgent(envelope, principal, tenantId, domainId, id, subjectIntake(body?.payload ?? {}, envelope.correlation_id));
  }
}
