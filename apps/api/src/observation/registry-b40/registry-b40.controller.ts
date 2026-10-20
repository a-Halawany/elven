/**
 * CP-6 B40 §RG (0123_b40_x_rg) — THE SOURCE REGISTRY, STEWARDSHIP, THE RIGHTS LIFECYCLE AND REVOCATION IMPACT (F-P1-01): a further controller on the
 * observation base path (inside the existing api.observation unit, beside ObservationController — which is untouched but for the v1–v3 rights
 * route's marked re-pointing), every route under its own EXACT PDP rule (pdp.service.ts, the B40 rg block):
 *
 *   POST …/observation/registry/candidates/read                 {}                                      observation.registry.read
 *   POST …/observation/registry/candidates/propose              {name, publisher, howFound, termsUrl, purposes, assessment, requestId?}
 *                                                                                                       observation.source.discover (human-gated)
 *   POST …/observation/registry/candidates/:candidateId/decline {reason}                                observation.source.discover (human-gated)
 *   POST …/observation/registry/candidates/:candidateId/draft   {kind?}                                 observation.registry.read — the prefilled SRC@v4 draft
 *   POST …/observation/registry/candidates/:candidateId/promote {contract}                              observation.source.register — the registration and
 *                                                                                                       the promotion in ONE transaction
 *   POST …/observation/registry/sources/:sourceId/read          {}                                      observation.registry.read
 *   POST …/observation/registry/sources/:sourceId/evaluate      {contractVersion, authority, rightsEvidence, coverageFit, cost, risks, contractTests,
 *                                                                recommendation, reason, requestId?}  observation.source.evaluate (human-gated)
 *   POST …/observation/registry/sources/:sourceId/rights        {contractVersion, operation, purposes?, reason, evidence?, deletionObligation?, requestId?}
 *                                                                                                       observation.source.change_rights (human-gated):
 *        a WITHDRAWAL removes the Redis schedule in the same operation and announces SourceHealthChanged {state: suspended, cause: rights} (B22's
 *        source-health consumer sets the markers through observation.mark_source_impact — no new interface row); a RESTORATION that resumed the
 *        suspended version re-schedules it and announces {state: active, cause: rights} (the markers cleared). A replayed request has no effect.
 *   POST …/observation/registry/sources/:sourceId/impact        {}                                      observation.rights.impact.read
 *   POST …/observation/registry/sources/:sourceId/preview       {change: {operation, purposes?, contract_version?}}
 *                                                                                                       observation.source.change_impact.read (CAP-OB-02)
 *   POST …/observation/registry/sources/:sourceId/customer-approval {contractVersion, decision, scopeStatement, reason, claim, requestId?}
 *                                                                                                       observation.source.customer_approve (human-gated)
 *   POST …/observation/registry/sources/:sourceId/stewardship   {expectedVersion, steward, state, reviewDue, reason, requestId?}
 *                                                                                                       observation.source.stewardship (human-gated)
 *   POST …/observation/registry/sources/:sourceId/incidents/open {kind, statement, owner, requestId?}  observation.source.incident (human-gated)
 *   POST …/observation/registry/incidents/:incidentId/resolve   {resolution}                            observation.source.incident (human-gated)
 *
 * The answers are the ports' with the receipt (never optimistic). The refusal nouns are the ports' class form (`<noun> rejected (<class>)`), not
 * mapped centrally yet (the integrator maps them). D9: no route here returns evidence content. CONSTRUCTION only.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { SourcesService } from '../sources/sources.service.js';
import { SchedulerService } from '../scheduling/scheduler.service.js';
import { CollectionOrchestrator } from '../acquisition/orchestrator.service.js';
import { RegistryB40Capability } from './registry.capabilities.js';
import { draftContractFromCandidate, type CandidateRow, type DraftKind } from './draft.js';

type Row = Record<string, unknown>;
type Body_ = { payload?: Row } | undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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
const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);
const requestIdOf = (p: Row): string => (typeof p['requestId'] === 'string' && UUID_RE.test(p['requestId']) ? (p['requestId'] as string).toLowerCase() : newId());
const version = (v: unknown): number | null => (Number.isSafeInteger(v) && (v as number) >= 1 ? (v as number) : null);

@Controller('/v1/tenants/:tenantId/domains/:domainId/observation')
export class RegistryB40Controller {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly sources: SourcesService,
    private readonly scheduler: SchedulerService,
    private readonly orchestrator: CollectionOrchestrator,
  ) {}

  // ───────────────────────── discovery (JRN-02) ─────────────────────────
  @Post('/registry/candidates/read')
  async candidates(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.registry.read', objectType: 'SRC', objectId: null },
      RegistryB40Capability.read, async (cap) => cap.candidates({ tenantId, domainId }));
    return { candidates: (out.result as Row)['candidates'] ?? [], asOf: (out.result as Row)['as_of'] ?? null, receipt: receipt(out) };
  }

  @Post('/registry/candidates/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const p = body?.payload ?? {};
    const name = text(p['name']) ?? unprocessable(corr, 'source candidate rejected (name): name is the source as its publisher names it');
    const publisher = text(p['publisher']) ?? unprocessable(corr, 'source candidate rejected (publisher): publisher names who publishes it');
    const howFound = text(p['howFound']) ?? unprocessable(corr, 'source candidate rejected (how_found): howFound says how the source was found');
    const termsUrl = p['termsUrl'] === undefined || p['termsUrl'] === null || p['termsUrl'] === '' ? null : text(p['termsUrl']) ?? unprocessable(corr, 'source candidate rejected (terms_url): termsUrl is an https address or empty');
    const purposes = strings(p['purposes']) ?? unprocessable(corr, 'source candidate rejected (purposes): purposes is a list of what the source is proposed for');
    const assessment = text(p['assessment']) ?? unprocessable(corr, 'source candidate rejected (assessment): assessment states the proposer\'s view of the source');
    const requestId = requestIdOf(p);
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.source.discover', objectType: 'SRC', objectId: null },
      RegistryB40Capability.discovery,
      async (cap) => {
        const r = await cap.propose({ requestId, tenantId, domainId, name, publisher, howFound, termsUrl, purposes, assessment, actor: principal.principalId, correlationId: corr });
        return { result: r, targetType: 'SRC', targetId: String(r['candidate_id'] ?? requestId), targetVersion: null, outboxEvent: null };
      });
    return { candidate: out.result, receipt: receipt(out) };
  }

  @Post('/registry/candidates/:candidateId/decline')
  async decline(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('candidateId') candidateRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const candidateId = pathId(candidateRaw, 'source candidate', corr);
    const reason = text(body?.payload?.['reason']) ?? unprocessable(corr, 'source candidate rejected (reason): a decline states its reason');
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.source.discover', objectType: 'SRC', objectId: candidateId },
      RegistryB40Capability.discovery,
      async (cap) => ({ result: await cap.decline({ tenantId, domainId, candidateId, reason, actor: principal.principalId, correlationId: corr }), targetType: 'SRC', targetId: candidateId, targetVersion: null, outboxEvent: null }));
    return { candidate: out.result, receipt: receipt(out) };
  }

  /** THE PREFILLED DRAFT: the candidate's SRC@v4 contract skeleton and what it still lacks (a read; nothing is registered). */
  @Post('/registry/candidates/:candidateId/draft')
  async draft(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('candidateId') candidateRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const candidateId = pathId(candidateRaw, 'source candidate', corr);
    const kindRaw = body?.payload?.['kind'] ?? 'rss';
    const kind = (['rss', 'rest', 'upload'] as const).includes(kindRaw as DraftKind) ? kindRaw as DraftKind : unprocessable(corr, 'source candidate rejected (kind): the draft kind is rss, rest or upload');
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.registry.read', objectType: 'SRC', objectId: candidateId },
      RegistryB40Capability.read, async (cap) => cap.candidates({ tenantId, domainId }));
    const c = ((out.result as Row)['candidates'] as Row[] | undefined ?? []).find((x) => x['candidate_id'] === candidateId);
    if (c === undefined) throw new HttpException(errorBody('EYE_STA_001', corr, `source candidate ${candidateId} is not recorded in this domain`), 404);
    const today = new Date().toISOString().slice(0, 10);
    const d = draftContractFromCandidate(c as unknown as CandidateRow, kind, today);
    return { draft: { candidateId, state: c['state'], kind, contract: d.contract, missing: d.missing }, receipt: receipt(out) };
  }

  /** THE PROMOTION: the (completed) draft registered as a DRAFT SRC@v4 contract and the candidate promoted, in ONE governed transaction. */
  @Post('/registry/candidates/:candidateId/promote')
  async promote(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('candidateId') candidateRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const candidateId = pathId(candidateRaw, 'source candidate', corr);
    const contract = body?.payload?.['contract'];
    if (contract === undefined || contract === null || typeof contract !== 'object') unprocessable(corr, 'source candidate rejected (contract): the completed SRC@v4 contract is required');
    const sourceId = newId();
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.source.register', objectType: 'SRC', objectId: sourceId },
      RegistryB40Capability.promotion,
      async (cap, scope) => {
        const r = await this.sources.register(cap.registry, scope, `principal:${principal.principalId}`, corr, contract, sourceId);
        const c = await cap.promote({ tenantId, domainId, candidateId, sourceId, contractVersion: r.contractVersion, actor: principal.principalId, correlationId: corr });
        return { result: { source: r, candidate: c }, targetType: 'SRC', targetId: sourceId, targetVersion: String(r.contractVersion), outboxEvent: null };
      });
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the registry record ─────────────────────────
  @Post('/registry/sources/:sourceId/read')
  async record(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceRaw: string) {
    const { envelope, principal } = ctx(req);
    const sourceId = pathId(sourceRaw, 'source', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.registry.read', objectType: 'SRC', objectId: sourceId },
      RegistryB40Capability.read, async (cap) => cap.record({ tenantId, domainId, sourceId }));
    return { registry: out.result, receipt: receipt(out) };
  }

  @Post('/registry/sources/:sourceId/evaluate')
  async evaluate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const sourceId = pathId(sourceRaw, 'source', corr);
    const p = body?.payload ?? {};
    const contractVersion = version(p['contractVersion']) ?? unprocessable(corr, 'source evaluation rejected (request): contractVersion is the version evaluated');
    const tests = Array.isArray(p['contractTests']) ? (p['contractTests'] as Row[]).map((t) => ({ name: String(t?.['name'] ?? ''), outcome: String(t?.['outcome'] ?? ''), note: typeof t?.['note'] === 'string' ? t['note'] as string : null }))
      : unprocessable(corr, 'source evaluation rejected (contract_tests): contractTests is a list of { name, outcome, note }');
    const a = {
      requestId: requestIdOf(p), tenantId, domainId, sourceId, contractVersion,
      authority: text(p['authority']) ?? unprocessable(corr, 'source evaluation rejected (authority): authority is assessed'),
      rightsEvidence: text(p['rightsEvidence']) ?? unprocessable(corr, 'source evaluation rejected (rights_evidence): rightsEvidence is stated'),
      coverageFit: text(p['coverageFit']) ?? unprocessable(corr, 'source evaluation rejected (coverage_fit): coverageFit is stated'),
      cost: text(p['cost']) ?? unprocessable(corr, 'source evaluation rejected (cost): cost is stated'),
      risks: strings(p['risks'] ?? []) ?? unprocessable(corr, 'source evaluation rejected (risks): risks is a list'),
      contractTests: tests,
      recommendation: text(p['recommendation']) ?? unprocessable(corr, 'source evaluation rejected (recommendation): recommendation is approve, reject or revise'),
      reason: text(p['reason']) ?? unprocessable(corr, 'source evaluation rejected (reason): the recommendation states its reason'),
      actor: principal.principalId, correlationId: corr,
    };
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.source.evaluate', objectType: 'SRC', objectId: sourceId },
      RegistryB40Capability.evaluation,
      async (cap) => ({ result: await cap.evaluate(a), targetType: 'SRC', targetId: sourceId, targetVersion: String(contractVersion), outboxEvent: null }));
    return { evaluation: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the rights lifecycle (DESIGN D4) ─────────────────────────
  @Post('/registry/sources/:sourceId/rights')
  async changeRights(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const sourceId = pathId(sourceRaw, 'source', corr);
    const p = body?.payload ?? {};
    const contractVersion = version(p['contractVersion']) ?? unprocessable(corr, 'rights change rejected (request): contractVersion is the latest contract version you read');
    const operation = text(p['operation']);
    if (operation === null || !['narrow', 'withdraw', 'restore'].includes(operation)) unprocessable(corr, 'rights change rejected (operation): operation is narrow, withdraw or restore');
    const purposes = p['purposes'] === undefined || p['purposes'] === null ? null : strings(p['purposes']) ?? unprocessable(corr, 'rights change rejected (purposes): purposes is a list');
    const reason = text(p['reason']) ?? unprocessable(corr, 'rights change rejected (reason): a rights change states its reason');
    const evidence = p['evidence'] === undefined || p['evidence'] === null || p['evidence'] === '' ? null : text(p['evidence']) ?? unprocessable(corr, 'rights change rejected (evidence): evidence is text');
    const deletionObligation = p['deletionObligation'] === undefined || p['deletionObligation'] === null || p['deletionObligation'] === '' ? null
      : text(p['deletionObligation']) ?? unprocessable(corr, 'rights change rejected (deletion_obligation): deletionObligation is text, or empty for none');
    const requestId = requestIdOf(p);
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.source.change_rights', objectType: 'SRC', objectId: sourceId },
      RegistryB40Capability.rights,
      async (cap, scope) => {
        const r = await cap.change({ requestId, tenantId, domainId, sourceId, contractVersion, operation: operation as string, purposes, reason, evidence, deletionObligation,
          actor: principal.principalId, correlationId: corr });
        const replayed = r['replayed'] === true;
        let outboxEvent: { eventType: string; payload: Row } | null = null;
        let schedule: string = 'unchanged';
        if (!replayed && operation === 'withdraw') {
          // the schedule entry was removed by the port; the Redis job leaves in the same operation (collection prohibited from this instant)
          await this.scheduler.unschedule(tenantId, domainId, sourceId);
          schedule = 'removed';
          outboxEvent = { eventType: 'SourceHealthChanged', payload: { schema_version: 'v1', source_id: sourceId, contract_version: r['suspended_version'] ?? contractVersion,
            state: 'suspended', reason: `rights withdrawn: ${reason}`.slice(0, 500), cause: 'rights', rights_change_id: r['change_id'] } };
        }
        if (!replayed && operation === 'restore' && version(r['reactivated_version']) !== null) {
          await this.orchestrator.syncSchedule(cap.registry, scope, sourceId, r['reactivated_version'] as number, 'active');
          schedule = 'restored';
          outboxEvent = { eventType: 'SourceHealthChanged', payload: { schema_version: 'v1', source_id: sourceId, contract_version: r['reactivated_version'],
            state: 'active', reason: `rights restored: ${reason}`.slice(0, 500), cause: 'rights', rights_change_id: r['change_id'] } };
        }
        return { result: { ...r, schedule_runtime: schedule }, targetType: 'SRC', targetId: sourceId, targetVersion: String(contractVersion), outboxEvent };
      });
    return { change: out.result, receipt: receipt(out) };
  }

  @Post('/registry/sources/:sourceId/impact')
  async impact(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceRaw: string) {
    const { envelope, principal } = ctx(req);
    const sourceId = pathId(sourceRaw, 'source', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.rights.impact.read', objectType: 'SRC', objectId: sourceId },
      RegistryB40Capability.read, async (cap) => cap.impact({ tenantId, domainId, sourceId }));
    return { impact: out.result, receipt: receipt(out) };
  }

  @Post('/registry/sources/:sourceId/preview')
  async preview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const sourceId = pathId(sourceRaw, 'source', corr);
    const change = body?.payload?.['change'];
    if (change === undefined || change === null || typeof change !== 'object' || Array.isArray(change)) unprocessable(corr, 'source registry rejected (operation): change names the operation previewed');
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.source.change_impact.read', objectType: 'SRC', objectId: sourceId },
      RegistryB40Capability.read, async (cap) => cap.preview({ tenantId, domainId, sourceId, change: change as Row }));
    return { preview: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the customer approval (D13) ─────────────────────────
  @Post('/registry/sources/:sourceId/customer-approval')
  async customerApproval(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const sourceId = pathId(sourceRaw, 'source', corr);
    const p = body?.payload ?? {};
    const a = {
      requestId: requestIdOf(p), tenantId, domainId, sourceId,
      contractVersion: version(p['contractVersion']) ?? unprocessable(corr, 'customer approval rejected (request): contractVersion is the version approved'),
      decision: text(p['decision']) ?? unprocessable(corr, 'customer approval rejected (decision): decision is approve or decline'),
      scopeStatement: text(p['scopeStatement']) ?? unprocessable(corr, 'customer approval rejected (scope_statement): scopeStatement states the use approved'),
      reason: text(p['reason']) ?? unprocessable(corr, 'customer approval rejected (reason): the decision states its reason'),
      claim: text(p['claim']) ?? 'demonstration',
      actor: principal.principalId, correlationId: corr,
    };
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.source.customer_approve', objectType: 'SRC', objectId: sourceId },
      RegistryB40Capability.customer,
      async (cap) => ({ result: await cap.approve(a), targetType: 'SRC', targetId: sourceId, targetVersion: String(a.contractVersion), outboxEvent: null }));
    return { approval: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── stewardship ─────────────────────────
  @Post('/registry/sources/:sourceId/stewardship')
  async stewardship(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const sourceId = pathId(sourceRaw, 'source', corr);
    const p = body?.payload ?? {};
    const expected = Number.isSafeInteger(p['expectedVersion']) && (p['expectedVersion'] as number) >= 0 ? p['expectedVersion'] as number
      : unprocessable(corr, 'stewardship rejected (request): expectedVersion is the stewardship version you read (0 when none)');
    const steward = typeof p['steward'] === 'string' && UUID_RE.test(p['steward']) ? (p['steward'] as string).toLowerCase() : unprocessable(corr, 'stewardship rejected (steward): steward is a principal id');
    const reviewDue = typeof p['reviewDue'] === 'string' && DAY_RE.test(p['reviewDue']) ? p['reviewDue'] as string : unprocessable(corr, 'stewardship rejected (review_due): reviewDue is a date (YYYY-MM-DD)');
    const a = { requestId: requestIdOf(p), tenantId, domainId, sourceId, expectedVersion: expected, steward,
      state: text(p['state']) ?? unprocessable(corr, 'stewardship rejected (state_value): state is assigned, under_review or lapsed'), reviewDue,
      reason: text(p['reason']) ?? unprocessable(corr, 'stewardship rejected (reason): the change states its reason'), actor: principal.principalId, correlationId: corr };
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.source.stewardship', objectType: 'SRC', objectId: sourceId },
      RegistryB40Capability.stewardship,
      async (cap) => ({ result: await cap.change(a), targetType: 'SRC', targetId: sourceId, targetVersion: null, outboxEvent: null }));
    return { stewardship: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── source incidents (PER-11) ─────────────────────────
  @Post('/registry/sources/:sourceId/incidents/open')
  async openIncident(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const sourceId = pathId(sourceRaw, 'source', corr);
    const p = body?.payload ?? {};
    const a = { requestId: requestIdOf(p), tenantId, domainId, sourceId,
      kind: text(p['kind']) ?? unprocessable(corr, 'source incident rejected (kind): kind is outage, rights, quality, access, manipulation or other'),
      statement: text(p['statement']) ?? unprocessable(corr, 'source incident rejected (statement): the incident is stated'),
      owner: typeof p['owner'] === 'string' && UUID_RE.test(p['owner']) ? (p['owner'] as string).toLowerCase() : unprocessable(corr, 'source incident rejected (owner): owner is the collection manager who owns it'),
      actor: principal.principalId, correlationId: corr };
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.source.incident', objectType: 'SRC', objectId: sourceId },
      RegistryB40Capability.incidents,
      async (cap) => { const r = await cap.open(a); return { result: r, targetType: 'SRC', targetId: sourceId, targetVersion: null, outboxEvent: null }; });
    return { incident: out.result, receipt: receipt(out) };
  }

  @Post('/registry/incidents/:incidentId/resolve')
  async resolveIncident(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('incidentId') incidentRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const incidentId = pathId(incidentRaw, 'source incident', corr);
    const resolution = text(body?.payload?.['resolution']) ?? unprocessable(corr, 'source incident rejected (resolution): the resolution is stated');
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.source.incident', objectType: 'SRC', objectId: incidentId },
      RegistryB40Capability.incidents,
      async (cap) => ({ result: await cap.resolve({ tenantId, domainId, incidentId, resolution, actor: principal.principalId, correlationId: corr }), targetType: 'SRC', targetId: incidentId, targetVersion: null, outboxEvent: null }));
    return { incident: out.result, receipt: receipt(out) };
  }
}
