/**
 * STRATEGIC PLANNING AND INITIATIVE GOVERNANCE — CP-6 B36 part `planning` (migration 0094 §P; F-P6-10; WS-16).
 *
 *   THE OBJECTS     a PLAN for an objective set and a horizon with its budget and AUTHORITY CEILING; its INITIATIVES are the Strategy
 *                   Graph's INI objects (0089) bound by id — one object, two views — with their objective linkage, sponsor, owner and budget
 *                   share; milestones proven by graph.measures rows; dependencies (a cycle refused); the plan's measures bound by id.
 *   THE AUTHORITY   propose (the strategy lead, or the Planning Agent — the one act AI performs here) → align → prioritise (the lead) →
 *                   fund → approve (the executive or the decision authority, within the plan's authority; never the proposer) → BASELINE
 *                   (a signed version: §0 record_signature kind plan_baseline; the PLN object admitted) → pause / close (the sponsor);
 *                   REPLAY = executive.plan_as_of. The ports decide every rule; this service validates the request early, in plain words.
 *   THE DETECTION   the attention tick's step `plan-variance` (order 55, after the strategy detections): executive.detect_plan_variance
 *                   raises each variance once and ROUTES it (class plan.variance) to the initiative's owner; the five breaches are opened
 *                   once per cause and resolved when the cause is gone. A commitment on a package citing an initiative of a plan with an
 *                   OPEN breach is HELD (the port's trigger) until the executive acknowledges it.
 *   MONEY           ISO-4217 text + a decimal string with at most two places (numeric(18,2) in the record) — never a float.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { AttentionTickRegistry, type AttentionTickContext } from '../attention/tick.js';
import { SignatureService } from '../signatures/signature.service.js';
import { PlanningCapability, type InitiativeWrites, type PlanWrites, type PlanningReads } from './planning.capabilities.js';

export const PLAN_VARIANCE_STEP = 'plan-variance';
export const PLAN_VARIANCE_ORDER = 55;
export const HORIZONS = ['30d', '90d', '12m', '36m'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const DEPENDENCY_KINDS = ['finish_to_start', 'shares_resource'] as const;
export const INITIATIVE_STATES = ['proposed', 'aligned', 'prioritised', 'funded', 'approved', 'paused', 'closed'] as const;
export const BREACH_KINDS = ['lost_linkage', 'infeasible', 'budget_over_authority', 'conflicting_dependencies', 'drift_without_review'] as const;
/** The transition each state admits next, and WHO holds it (the PDP names the roles; the port asserts the person). */
export const TRANSITION_OF: Readonly<Record<string, { next: string; by: string }>> = Object.freeze({
  proposed: { next: 'align', by: 'the strategy lead' },
  aligned: { next: 'prioritise', by: 'the strategy lead' },
  prioritised: { next: 'fund', by: 'the executive or the decision authority, within the plan\'s authority' },
  funded: { next: 'approve', by: 'the executive or the decision authority — never the proposer' },
  approved: { next: 'baseline', by: 'the executive (a signed version of the plan)' },
});

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };

/** A money amount as the record keeps it: a decimal string with at most two places (an integer accepted); a float is refused. */
export function moneyOf(v: unknown, what: string, correlationId: string): string {
  const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : '') : text(v);
  if (!MONEY.test(s)) bad(correlationId, `${what} is a decimal amount with at most two places (as a string, e.g. "1250000.00"), never a float`);
  return s;
}
export function assertUuid(v: unknown, what: string, correlationId: string): string {
  const s = text(v);
  if (!UUID.test(s)) bad(correlationId, `${what} is a uuid`);
  return s;
}
function reasonOf(v: unknown, what: string, correlationId: string): string {
  const s = text(v);
  if (s.length < 8 || s.length > 2000) bad(correlationId, `${what} is 8 to 2000 characters: a governed act says why`);
  return s;
}

export function validatePlan(p: Row, correlationId: string) {
  const title = text(p['title']); const statement = text(p['statement']); const horizon = text(p['horizon']);
  if (title.length < 2 || title.length > 256) bad(correlationId, 'title is 2 to 256 characters');
  if (statement.length < 2 || statement.length > 4096) bad(correlationId, 'statement is 2 to 4096 characters');
  if (!(HORIZONS as readonly string[]).includes(horizon)) bad(correlationId, `horizon is one of ${HORIZONS.join(', ')}`);
  const objectiveIds = Array.isArray(p['objectiveIds']) ? (p['objectiveIds'] as unknown[]).map((o, n) => assertUuid(o, `objectiveIds[${n}]`, correlationId)) : [];
  if (objectiveIds.length === 0) bad(correlationId, 'objectiveIds names at least one objective (OBJ) of the Strategy Graph');
  const currency = text(p['currency']).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) bad(correlationId, 'currency is an ISO-4217 code');
  const budgetTotal = moneyOf(p['budgetTotal'], 'budgetTotal', correlationId);
  const budgetAuthority = moneyOf(p['budgetAuthority'], 'budgetAuthority', correlationId);
  const classification = p['classification'] === undefined || p['classification'] === null ? null : text(p['classification']);
  if (classification !== null && !(CLASSIFICATIONS as readonly string[]).includes(classification)) bad(correlationId, `classification is one of ${CLASSIFICATIONS.join(', ')}`);
  const cadence = p['reviewCadenceDays'] === undefined || p['reviewCadenceDays'] === null ? null : Number(p['reviewCadenceDays']);
  if (cadence !== null && !(Number.isInteger(cadence) && cadence >= 1 && cadence <= 366)) bad(correlationId, 'reviewCadenceDays is a whole number of days from 1 to 366');
  return { title, statement, horizon, objectiveIds, currency, budgetTotal, budgetAuthority, classification, reviewCadenceDays: cadence };
}
export function validateAuthority(p: Row, correlationId: string) {
  return { authority: moneyOf(p['authority'], 'authority', correlationId), reason: reasonOf(p['reason'], 'reason', correlationId) };
}
export function validateNote(p: Row, correlationId: string, required: boolean) {
  const note = text(p['note']);
  if (required && note.length < 8) bad(correlationId, 'note is 8 characters or more');
  if (note.length > 2000) bad(correlationId, 'note is at most 2000 characters');
  return { note: note.length === 0 ? null : note };
}
export function validateProposal(p: Row, correlationId: string) {
  return {
    initiativeId: assertUuid(p['initiativeId'], 'initiativeId (the INI object of the Strategy Graph)', correlationId),
    planId: assertUuid(p['planId'], 'planId', correlationId),
    objectiveId: assertUuid(p['objectiveId'], 'objectiveId', correlationId),
    sponsor: assertUuid(p['sponsor'], 'sponsor', correlationId),
    owner: assertUuid(p['owner'], 'owner', correlationId),
    budgetShare: moneyOf(p['budgetShare'] ?? '0', 'budgetShare', correlationId),
    rationale: reasonOf(p['rationale'], 'rationale', correlationId),
  };
}
export function validateAlign(p: Row, correlationId: string) {
  const objectiveIds = Array.isArray(p['objectiveIds']) ? (p['objectiveIds'] as unknown[]).map((o, n) => assertUuid(o, `objectiveIds[${n}]`, correlationId)) : [];
  return { objectiveIds, rationale: reasonOf(p['rationale'], 'rationale', correlationId) };
}
export function validatePriority(p: Row, correlationId: string) {
  const priority = Number(p['priority']);
  if (!(Number.isInteger(priority) && priority >= 1 && priority <= 1000)) bad(correlationId, 'priority is a rank from 1 to 1000');
  return { priority, rationale: reasonOf(p['rationale'], 'rationale', correlationId) };
}
export function validateFunding(p: Row, correlationId: string) {
  return { amount: moneyOf(p['amount'], 'amount', correlationId), rationale: reasonOf(p['rationale'], 'rationale', correlationId) };
}
export function validateReason(p: Row, correlationId: string, key = 'rationale') {
  return { [key]: reasonOf(p[key], key, correlationId) } as Record<string, string>;
}
export function validateMilestone(p: Row, correlationId: string) {
  const name = text(p['name']); const dueDate = text(p['dueDate']);
  if (name.length < 2 || name.length > 256) bad(correlationId, 'name is 2 to 256 characters');
  if (!DATE.test(dueDate) || Number.isNaN(Date.parse(dueDate))) bad(correlationId, 'dueDate is a calendar day (YYYY-MM-DD)');
  const tv = p['targetValue'];
  const targetValue = typeof tv === 'number' && Number.isFinite(tv) ? String(tv) : text(tv);
  if (!/^-?\d{1,18}(\.\d{1,6})?$/.test(targetValue)) bad(correlationId, 'targetValue is a decimal number');
  return { initiativeId: assertUuid(p['initiativeId'], 'initiativeId', correlationId), name, dueDate, measureId: assertUuid(p['measureId'], 'measureId', correlationId), targetValue };
}
export function validateDependency(p: Row, correlationId: string) {
  const kind = text(p['kind']);
  if (!(DEPENDENCY_KINDS as readonly string[]).includes(kind)) bad(correlationId, `kind is one of ${DEPENDENCY_KINDS.join(', ')}`);
  return { from: assertUuid(p['from'], 'from', correlationId), to: assertUuid(p['to'], 'to', correlationId), kind, rationale: reasonOf(p['rationale'], 'rationale', correlationId) };
}
export function validateMeasureBind(p: Row, correlationId: string) {
  const key = p['quantityKey'] === undefined || p['quantityKey'] === null ? '' : text(p['quantityKey']);
  if (key.length > 128) bad(correlationId, 'quantityKey is at most 128 characters');
  return { measureId: assertUuid(p['measureId'], 'measureId', correlationId), quantityKey: key.length === 0 ? null : key };
}
export function validateAcknowledgement(p: Row, correlationId: string) {
  return { authorization: reasonOf(p['authorization'], 'authorization', correlationId) };
}
export function validateAsOf(p: Row, correlationId: string): string | null {
  if (p['at'] === undefined || p['at'] === null || p['at'] === '') return null;
  const s = text(p['at']);
  if (Number.isNaN(Date.parse(s))) bad(correlationId, 'at is an instant (ISO-8601)');
  return s;
}

/** The sensitivity's summary in words (the page shows the server's statuses; this names the count — never a percentage). */
export function sensitivitySummary(milestones: Array<{ status: string }>): { at_risk: number; on_track: number; unmapped: number; no_value: number; line: string } {
  const c = { at_risk: 0, on_track: 0, unmapped: 0, no_value: 0 };
  for (const m of milestones) if (m.status in c) c[m.status as keyof typeof c] += 1;
  const line = `${c.at_risk} at risk · ${c.on_track} on track · ${c.unmapped} unmapped · ${c.no_value} without a value at their date`;
  return { ...c, line };
}

@Injectable()
export class PlanningService implements OnModuleInit {
  private readonly log = new Logger('executive.planning');
  constructor(private readonly moduleRef: ModuleRef, private readonly signatures: SignatureService) {}

  /** The tick step (the commitment service's idiom: the registry found when the executive module is loaded). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the plan variances are not scheduled'); return; }
    registry.register({ name: PLAN_VARIANCE_STEP, order: PLAN_VARIANCE_ORDER, run: async (c: AttentionTickContext) => this.detect(c) });
  }
  private async detect(c: AttentionTickContext): Promise<Row> {
    return PlanningCapability.tick(c.tx, 'executive.attention.tick').detectPlanVariance({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }

  /**
   * THE BASELINE: the port writes the version and answers its digest; the executive's SIGNATURE is recorded through §0's port under this
   * same action (kind plan_baseline, subject = the plan at that version); then the PLN object is admitted (the snapshot as its payload).
   * A deployment without a signing key refuses the whole act (409 `signature rejected (unbound)`): a baseline is never unsigned.
   */
  async baseline(cap: PlanWrites, a: { versionId: string; planId: string; tenantId: string; domainId: string; note: string | null; actor: string; correlationId: string; purposeId: string }): Promise<Row> {
    const v = await cap.baselinePlan(a);
    const version = Number(v['version']); const digest = String(v['digest']);
    const signature = await this.signatures.sign(cap, { tenantId: a.tenantId, domainId: a.domainId, action: 'executive.plan.baseline', kind: 'plan_baseline', subjectId: a.planId, subjectVersion: version, subjectDigest: digest, actor: a.actor, correlationId: a.correlationId });
    const now = await cap.now();
    const snapshot = (v['snapshot'] ?? {}) as Row;
    const payload: Row = { ...snapshot, version, baseline_digest: digest };
    const header: CanonicalHeader = {
      object_id: a.planId, object_type: 'PLN', tenant_id: a.tenantId, domain_id: a.domainId, scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active',
      owning_component: 'CP-EXE-01', accountable_owner: `principal:${a.actor}`, source_object_ids: [], event_time: null, observation_time: now, valid_from: now, valid_to: null,
      recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'decided', synthetic_state: false, confidence: null, uncertainty: null,
      evidence_refs: [], provenance_ref: `principal:${a.actor}`, method_ref: 'plan-baseline@1.0.0', contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${a.actor}`],
      classification: String(snapshot['classification'] ?? 'internal'), purpose_scope: a.purposeId, rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'PLN@v1', ontology_ref: null, correction_of: null,
      supersedes: version > 1 ? `${a.planId}@${version - 1}` : null, withdrawal_reason: null, audit_correlation_id: a.correlationId, content_ref: null,
    };
    const ok = validateHeader(header);
    if (!ok.ok) throw new HttpException(errorBody('EYE_REQ_001', a.correlationId, `plan header invalid: ${(ok.errors ?? []).join('; ')}`), 422);
    const admitted = await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    return { ...v, signature, object: { object_type: 'PLN', object_id: a.planId, object_version: version, content_digest: admitted.contentDigest } };
  }

  /**
   * THE APPROVAL's canonical trace: the next version of the INI object (the prior payload carried whole, the planning approval in
   * metrics.planning) admitted under executive.initiative.approve; the version number recorded on the planning view.
   */
  async approve(cap: InitiativeWrites, a: { initiativeId: string; tenantId: string; domainId: string; rationale: string; actor: string; correlationId: string; purposeId: string }): Promise<Row> {
    const r = await cap.approveInitiative(a);
    const prior = await cap.latestObjectVersion(a.initiativeId);
    if (prior === null) throw new HttpException(errorBody('EYE_STA_001', a.correlationId, `initiative rejected (unknown_initiative): ${a.initiativeId} has no canonical INI object`), 404);
    const version = prior.version + 1;
    const now = await cap.now();
    const h = prior.header;
    const metrics = (typeof prior.payload['metrics'] === 'object' && prior.payload['metrics'] !== null ? prior.payload['metrics'] : {}) as Row;
    const payload: Row = { ...prior.payload, metrics: { ...metrics, planning: { plan_id: r['plan_id'], initiative_id: a.initiativeId, state: 'approved', sponsor: r['sponsor_principal_id'], owner: r['owner_principal_id'],
      funded_amount: r['funded_amount'], priority: r['priority'], approved_by: a.actor, approved_at: r['approved_at'], rationale: a.rationale, planning_version: r['version'], planning_digest: r['digest'] } } };
    const header: CanonicalHeader = {
      object_id: a.initiativeId, object_type: 'INI', tenant_id: a.tenantId, domain_id: a.domainId, scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active',
      owning_component: String(h['owning_component'] ?? 'CP-GRA-01'), accountable_owner: String(h['accountable_owner'] ?? `principal:${a.actor}`),
      source_object_ids: Array.isArray(h['source_object_ids']) ? (h['source_object_ids'] as string[]) : [], event_time: null, observation_time: now, valid_from: null, valid_to: null,
      recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'decided', synthetic_state: false, confidence: null, uncertainty: null,
      evidence_refs: Array.isArray(h['evidence_refs']) ? (h['evidence_refs'] as string[]) : [], provenance_ref: `principal:${a.actor}`, method_ref: 'initiative-approval@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${a.actor}`], classification: String(h['classification'] ?? 'internal'), purpose_scope: a.purposeId,
      rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null, quality_profile: null, quality_state: null, freshness_state: null,
      schema_ref: String(h['schema_ref'] ?? 'INI@v1'), ontology_ref: null, correction_of: null, supersedes: `${a.initiativeId}@${prior.version}`, withdrawal_reason: null,
      audit_correlation_id: a.correlationId, content_ref: null,
    };
    const ok = validateHeader(header);
    if (!ok.ok) throw new HttpException(errorBody('EYE_REQ_001', a.correlationId, `initiative header invalid: ${(ok.errors ?? []).join('; ')}`), 422);
    const admitted = await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.recordInitiativeObjectVersion({ initiativeId: a.initiativeId, tenantId: a.tenantId, domainId: a.domainId, version, actor: a.actor });
    return { ...r, approved_object_version: version, object: { object_type: 'INI', object_id: a.initiativeId, object_version: version, content_digest: admitted.contentDigest } };
  }

  async plans(cap: PlanningReads, a: { state: string | null; limit: number }): Promise<Row[]> {
    let q = cap.readPlans().selectAll();
    if (a.state !== null) q = q.where('state' as never, '=', a.state as never);
    return (await q.orderBy('declared_at' as never, 'desc').limit(Math.min(Math.max(a.limit, 1), 500)).execute()) as Row[];
  }
  async view(cap: PlanningReads, planId: string, correlationId: string): Promise<Row> {
    const v = await cap.planView(planId);
    if (v === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, `plan rejected (unknown_plan): ${planId} is not a plan of this domain`), 404);
    return v;
  }
  async asOf(cap: PlanningReads, planId: string, at: string | null, correlationId: string): Promise<Row> {
    const v = await cap.planAsOf(planId, at ?? await cap.now());
    if (v === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, `plan rejected (unknown_plan): ${planId} is not a plan of this domain`), 404);
    return v;
  }
  async sensitivity(cap: PlanningReads, planId: string, runId: string): Promise<Row> {
    const s = await cap.planSensitivity(planId, runId);
    const ms = Array.isArray(s['milestones']) ? (s['milestones'] as Array<{ status: string }>) : [];
    return { ...s, summary: s['available'] === true ? sensitivitySummary(ms) : null };
  }
  /** The initiatives of the domain (Part S's plan links read the same rows through graph.strategy_plan_links). */
  async initiatives(cap: PlanningReads, a: { planId: string | null; objectiveId: string | null; limit: number }): Promise<Row[]> {
    let q = cap.readInitiatives().selectAll();
    if (a.planId !== null) q = q.where('plan_id' as never, '=', a.planId as never);
    if (a.objectiveId !== null) q = q.where('objective_id' as never, '=', a.objectiveId as never);
    return (await q.orderBy('proposed_at' as never, 'desc').limit(Math.min(Math.max(a.limit, 1), 500)).execute()) as Row[];
  }
}
