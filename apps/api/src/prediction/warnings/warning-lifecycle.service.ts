/**
 * THE EARLY-WARNING LIFECYCLE — CP-6 B28 (migration 0088 §W; F-P4-12: V0 C-033, V01-T-021, V02-T-159..162, V03 WRN, ES-47-001..005,
 * AI-57-002/-003, AG-032, MS-16, PR-26-001..006, CAP-FW-03, AT-26, JRN-07, OBJ-19/-21).
 *
 * A warning is no longer only an indicator breach. Every other ORIGIN — a stream rule's fired window, an escalated weak signal, the
 * warnings consumer's graph impact / forecast revision / twin degradation — SUBMITS a candidate to 0088 §0's intake, and this section
 * alone turns candidates into warnings:
 *
 *   the processing   per pending candidate the DEDUPLICATION key (the cause, the sorted affected objectives, the sorted geographies, the
 *                    horizon): folded into the OPEN warning of its key (a member row with its stance — supporting or contradicting —,
 *                    source, evidence, cause, geography and horizon; `warning.clustered`; no new warning, no new EarlyWarningRaised), or
 *                    folded into the STORM's lead when its cause already raised more than the rule's max within the window, or RAISE-DUE.
 *                    Run by the attention tick (step `warning-candidates`, order 5, under executive.attention.tick) and by a person
 *                    (POST …/warnings/candidates/process, human-gated).
 *   the raise        a raise-due candidate is raised in ITS OWN governed write under prediction.warning.raise — the indicator
 *                    evaluation's idiom (a raise is a separate write after the evaluation's): the WRN object admitted, then
 *                    prediction.raise_candidate_warning (prediction.raise_warning, unchanged — no branch, the candidate's declared class,
 *                    the level derived; then the origin, the cluster and its lead), EarlyWarningRaised@v1 from the write (the v1 keys
 *                    only — branch_id and flip_event_id null). THE TICK DOES NOT RAISE: its write is bound to executive.attention.tick
 *                    and raise_warning asserts prediction.warning.raise alone, so a raise-due candidate stays PENDING — counted as
 *                    `raise_owed` on the tick's step, visible on the intake — until a person's processing raises it (stated).
 *   the context      contradicting evidence, the affected objectives / assets / actors / geographies / horizon, the falsification
 *                    conditions, the verification or simulation playbook — the owner's (or a domain administrator's), versioned.
 *   expiry           the tick's step `warning-expiry` (order 6) runs prediction.expire_warnings, which now escalates the warning's live
 *                    attention item AT ONCE (`warning.escalated`): expiry no longer waits for an indicator evaluation.
 *   closure          on a criterion (resolved, falsified — a declared condition held —, duplicate, no longer relevant) with a reason.
 *   feedback         false | late | missed | duplicated | useful — a named human's, once per kind; the EVALUATION (executive, domain
 *                    administrator) measures the rates by origin, T3 and the acknowledgement latency, abstaining below min_sample.
 *   coverage gaps    the active source-impact markers on the warning, its forecast and its members' sources.
 */
import { HttpException, Injectable, type OnModuleInit } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
/* B28 (0088) integrator */
import type { Envelope } from '@eye/contracts';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
/* end B28 integrator */
import { foldControls, controlsOf, type ControlInput } from '../controls.js';
import { WarningLifecycleCapability, type CandidateRaiseWrites, type WarningLifecycleReads } from './warning-lifecycle.capabilities.js';

type Row = Record<string, unknown>;

/** The tick steps this section registers (0088 §W): the candidates processed (order 5) and the windows expired (order 6), both before the escalation (10). */
export const WARNING_CANDIDATES_STEP = 'warning-candidates';
export const WARNING_EXPIRY_STEP = 'warning-expiry';
export const FEEDBACK_KINDS = ['false', 'late', 'missed', 'duplicated', 'useful'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const CLOSURE_CRITERIA = ['resolved', 'falsified', 'duplicate', 'no_longer_relevant'] as const;
/** The response window a candidate that states none is raised with (hours). */
export const DEFAULT_WINDOW_HOURS = 72;
/** The tick's batch: the processing is bounded (the port refuses above 200). */
export const TICK_BATCH = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const bad = (correlationId: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };
const instantOrNull = (p: Row, k: string, correlationId: string): string | null => {
  const v = p[k]; if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) bad(correlationId, `${k} must be an instant (ISO 8601)`);
  return new Date(v as string).toISOString();
};

/* ───────────────────────────── the intakes (422 on a malformed request; the ports decide everything else) ───────────────────────────── */

export interface ContextIntake { expectedVersion: number; contradicting: unknown[]; affected: Row; falsification: unknown[]; playbook: Row | null }
/** The context is set WHOLE at the version read: the four blocks' outer shapes here; their contents, the references and the standing in the port. */
export function validateContext(p: Row, correlationId: string): ContextIntake {
  const v = p['expected_version'];
  if (!Number.isInteger(v) || Number(v) < 0) bad(correlationId, 'payload.expected_version is the context version read (a whole number ≥ 0)');
  if (p['contradicting'] !== undefined && !Array.isArray(p['contradicting'])) bad(correlationId, 'payload.contradicting is a list of {object_id, version?, source_id?, note}');
  if (p['affected'] !== undefined && (p['affected'] === null || typeof p['affected'] !== 'object' || Array.isArray(p['affected']))) bad(correlationId, 'payload.affected is {objectives, assets, actors, geographies, horizon}');
  if (p['falsification'] !== undefined && !Array.isArray(p['falsification'])) bad(correlationId, 'payload.falsification is a list of {condition, indicator_id?}');
  const pb = p['playbook'];
  if (pb !== undefined && pb !== null && (typeof pb !== 'object' || Array.isArray(pb))) bad(correlationId, 'payload.playbook is {kind: verification | simulation, scenario_id, branch_id?, run_id?, note?} or null');
  return { expectedVersion: Number(v), contradicting: (p['contradicting'] as unknown[] | undefined) ?? [], affected: (p['affected'] as Row | undefined) ?? {},
           falsification: (p['falsification'] as unknown[] | undefined) ?? [], playbook: pb === undefined || pb === null ? null : (pb as Row) };
}

export function validateClose(p: Row, correlationId: string): { criterion: string; ref: Row; reason: string } {
  const c = p['criterion'];
  if (typeof c !== 'string' || !(CLOSURE_CRITERIA as readonly string[]).includes(c)) bad(correlationId, `payload.criterion is one of ${CLOSURE_CRITERIA.join(', ')}`);
  const reason = typeof p['reason'] === 'string' ? p['reason'].trim() : '';
  if (reason.length < 8 || reason.length > 2000) bad(correlationId, 'payload.reason says why the warning is closed (8–2000 characters)');
  const ref: Row = {};
  if (p['condition'] !== undefined) ref['condition'] = p['condition'];
  if (p['duplicate_of'] !== undefined) ref['warning_id'] = p['duplicate_of'];
  return { criterion: c as string, ref, reason };
}

export function validateFeedback(p: Row, correlationId: string): { kind: FeedbackKind; note: string | null } {
  const k = p['kind'];
  if (typeof k !== 'string' || !(FEEDBACK_KINDS as readonly string[]).includes(k)) bad(correlationId, `payload.kind is one of ${FEEDBACK_KINDS.join(', ')}`);
  const note = typeof p['note'] === 'string' && p['note'].trim() !== '' ? p['note'].trim() : null;
  if (note !== null && note.length > 2000) bad(correlationId, 'payload.note is at most 2000 characters');
  return { kind: k as FeedbackKind, note };
}

export function validateWarningEvaluation(p: Row, correlationId: string): { windowFrom: string | null; windowTo: string | null; minSample: number } {
  const windowFrom = instantOrNull(p, 'window_from', correlationId);
  const windowTo = instantOrNull(p, 'window_to', correlationId);
  if (windowFrom !== null && windowTo !== null && windowTo < windowFrom) bad(correlationId, 'window_to is at or after window_from');
  const m = p['min_sample'] === undefined || p['min_sample'] === null ? 5 : p['min_sample'];
  if (!Number.isInteger(m) || Number(m) < 1 || Number(m) > 10_000) bad(correlationId, 'min_sample is a whole number in [1, 10000]');
  return { windowFrom, windowTo, minSample: Number(m) };
}

/**
 * THE WINDOW of a candidate's warning, on the DATABASE clock the preflight read: it opens at the raise, closes after the candidate's
 * response window (default 72 h) or at the decision deadline when that comes first; raised at or after the deadline is a MISSED decision
 * (not timely; the window keeps its own length — a report must still be answered); no deadline → T3 unmeasured (timely null).
 */
export function candidateWindow(nowIso: string, windowHours: number | null, deadlineIso: string | null): { opensAt: string; closesAt: string; timely: boolean | null; decisionMissed: boolean } {
  const now = new Date(nowIso).getTime();
  const end = now + (windowHours ?? DEFAULT_WINDOW_HOURS) * 3_600_000;
  const deadline = deadlineIso === null ? null : new Date(deadlineIso).getTime();
  const missed = deadline !== null && now >= deadline;
  const closes = deadline !== null && !missed && deadline < end ? deadline : end;
  return { opensAt: new Date(now).toISOString(), closesAt: new Date(closes).toISOString(), timely: deadline === null ? null : !missed, decisionMissed: missed };
}

@Injectable()
export class WarningLifecycleService implements OnModuleInit {
  constructor(private readonly ticks: AttentionTickRegistry, /* B28 (0088) integrator */ private readonly pipeline: PipelineService /* end B28 integrator */) {}

  /** The two tick steps, each in the tick's own write (executive.attention.tick): the candidates decided (never raised), the windows expired. */
  onModuleInit(): void {
    this.ticks.register({
      name: WARNING_CANDIDATES_STEP, order: 5,
      run: async (c: AttentionTickContext) => {
        const r = await WarningLifecycleCapability.process(c.tx, 'executive.attention.tick').processCandidates({ tenantId: c.tenantId, domainId: c.domainId, limit: TICK_BATCH, actor: c.agentPrincipalId, correlationId: c.correlationId });
        return { seen: r['seen'] ?? 0, clustered: arr(r['clustered']).length, storm: arr(r['storm']).length, refused: arr(r['refused']).length, deferred: arr(r['deferred']).length,
                 raise_owed: arr(r['raise_due']).length, owed: arr(r['raise_due']).map((x) => x['candidate_id']).slice(0, 50),
                 note: 'the tick decides and folds; a raise-due candidate is raised right after the tick by the attention agent in its own write under prediction.warning.raise (the after-tick hook `warning-raise`), or by a person processing the intake' };
      },
    });
    /* B28 (0088) integrator: the owed candidates RAISED after the tick — by the attention agent, each in its own write under
       prediction.warning.raise (the PDP admits attention_agent there, as it admits forecast_agent), through the same raiseCandidate path a
       person's processing uses; a candidate folded or deferred in the meantime is decided again by the preflight (never raised twice). */
    this.ticks.registerAfter({
      name: 'warning-raise',
      run: async (a) => {
        const step = (a.steps[WARNING_CANDIDATES_STEP] ?? {}) as Row;
        const owed = arr(step['owed']).map((x) => String(x));
        const results: Row[] = [];
        for (const candidateId of owed) {
          try {
            const r = await this.raiseAs(a.principal, a.tenantId, a.domainId, candidateId, a.correlationId);
            results.push({ candidate_id: candidateId, decision: r.decision, warning_id: r.decision === 'raised' ? r.result['warning_id'] : null });
          } catch (e) {
            const msg = e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : String((e as Error)?.message ?? e);
            results.push({ candidate_id: candidateId, error: msg.slice(0, 300) });
          }
        }
        return { owed: owed.length, raised: results.filter((x) => x['decision'] === 'raised').length, results };
      },
    });
    /* end B28 integrator */
    this.ticks.register({
      name: WARNING_EXPIRY_STEP, order: 6,
      run: async (c: AttentionTickContext) => ({ expired: await WarningLifecycleCapability.expiry(c.tx, 'executive.attention.tick').expire({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) }),
    });
  }

  /**
   * ONE candidate RAISED (inside a write bound to prediction.warning.raise AND to the warning's id, minted by the caller — the WRN
   * admission checks the capability's target binding): the preflight locks and decides it again (it may fold now —
   * then nothing is admitted and no event published); otherwise the WRN object is admitted and the port raises and binds it. The
   * answer's `outboxEvent` is EarlyWarningRaised@v1 (the evaluation route's key set, the branch and the flip null).
   */
  async raiseCandidate(cap: CandidateRaiseWrites, ctx: ScopeContext, candidateId: string, warningId: string, actor: string, correlationId: string, purposeId: string, opClass: string):
    Promise<{ decision: string; result: Row; outboxEvent: { eventType: string; payload: Row } | null }> {
    const T = ctx.tenantId as string; const D = ctx.domainId as string;
    const pf = await cap.preflight({ candidateId, tenantId: T, domainId: D, actor, correlationId });
    if (pf['decision'] !== 'raise') return { decision: String(pf['decision']), result: pf, outboxEvent: null };
    const c = obj(pf['candidate']);
    const now = iso(pf['now']) as string;
    const deadline = iso(pf['decision_deadline']);
    const win = candidateWindow(now, c['response_window_hours'] === null || c['response_window_hours'] === undefined ? null : Number(c['response_window_hours']), deadline);
    const consequenceClass = String(c['consequence_class']);
    const lvl = await cap.deriveWarningLevel(consequenceClass);
    const evidence = arr(c['evidence']);
    const forecastId = typeof pf['forecast_id'] === 'string' ? pf['forecast_id'] : null;
    const originRef = obj(c['origin_ref']);
    // INHERITED CONTROLS: the canonical rows the candidate's evidence (and its forecast) name, folded fail-closed; a synthetic origin says so.
    const refs = [...new Set([...evidence.map((e) => String(e['object_id'] ?? '')).filter((x) => UUID.test(x)), ...(forecastId === null ? [] : [forecastId])])];
    const rows = await cap.canonicalLatest(refs);
    const inputs: ControlInput[] = rows.map((r) => controlsOf(r) ?? {});
    if (originRef['synthetic'] === true) inputs.push({ synthetic_state: true, classification: 'internal' });
    const controls = foldControls(inputs);
    const title = String(c['title']).slice(0, 256);
    const originKind = String(c['origin_kind']);
    const confidence = c['confidence'] === null || c['confidence'] === undefined ? 0.5 : Number(c['confidence']);
    const consequence = `the ${originKind.replace(/_/g, ' ')} origin reports: ${String(c['title'])}`.slice(0, 2000);
    const warningEvidence: Row[] = [
      { kind: 'candidate', candidate_id: candidateId, origin_kind: originKind, origin_key: c['origin_key'], cause_key: c['cause_key'], dedup_key: pf['dedup_key'] },
      ...evidence.map((e) => ({ kind: 'evidence', ...e })),
    ];
    const recordedAt = now;
    const eventTime = typeof originRef['occurred_at'] === 'string' && !Number.isNaN(Date.parse(originRef['occurred_at'])) ? new Date(originRef['occurred_at']).toISOString() : now;
    const payload = {
      title, origin: { kind: originKind, key: c['origin_key'], ref: originRef, candidate_id: candidateId, cause_key: c['cause_key'], dedup_key: pf['dedup_key'] },
      evidence: warningEvidence, consequence, consequence_class: consequenceClass, consequence_class_source: 'declared', confidence,
      confidence_basis: c['confidence'] === null || c['confidence'] === undefined ? 'not stated by the origin (the neutral 0.5 recorded)' : 'the origin\'s',
      affected: obj(c['affected']), forecast_id: forecastId,
      timing: { mode: 'live', raised_as_of: now, recorded_at: recordedAt, decision_deadline: deadline, timely: win.timely, decision_missed: win.decisionMissed },
      response_window: { opens_at: win.opensAt, closes_at: win.closesAt }, routed_to: `principal:${String(pf['routed_to'])}`, routed_by: pf['routed_by'],
      controls, level: { value: lvl.level, version: lvl.version, urgency: lvl.urgency, response: lvl.response, impact: lvl.impact }, authority: { op_class: opClass },
    };
    const canonicalRefs = rows.map((r) => `${String(r['object_type'])}:${String(r['object_id'])}@${Number(r['object_version'])}`);
    const header: CanonicalHeader = {
      object_id: warningId, object_type: 'WRN', tenant_id: T, domain_id: D, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-PRD-01', accountable_owner: `principal:${String(pf['routed_to'])}`,
      source_object_ids: canonicalRefs, event_time: eventTime, observation_time: now, valid_from: win.opensAt, valid_to: win.closesAt,
      recorded_at: recordedAt, time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'inferred',
      synthetic_state: controls.synthetic_state, confidence: { value: confidence }, uncertainty: null,
      evidence_refs: [...canonicalRefs, `candidate:${candidateId}`], provenance_ref: `candidate:${candidateId}`, method_ref: 'warning-candidate@1.0.0',
      contradiction_refs: evidence.filter((e) => e['stance'] === 'contradicting').map((e) => String(e['object_id'])), corroboration_refs: [], human_refs: [],
      classification: controls.classification, purpose_scope: purposeId,
      rights_profile: controls.rights_profile, residency_profile: controls.residency_profile, retention_profile: controls.retention_profile,
      access_policy_ref: controls.access_policy_ref, quality_profile: null,
      quality_state: null, freshness_state: null, schema_ref: 'WRN@v2', ontology_ref: null, correction_of: null,
      supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const v = validateHeader(header);
    if (!v.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `warning header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    const r = await cap.raiseCandidate({ candidateId, tenantId: T, domainId: D, actor, eventId: newId(), correlationId, raise: {
      warning_id: warningId, title, evidence: warningEvidence, consequence, confidence, opens_at: win.opensAt, closes_at: win.closesAt, routed_to: pf['routed_to'],
      raised_as_of: now, decision_deadline: deadline, timely: win.timely, decision_missed: win.decisionMissed, controls,
      level: lvl.level, level_version: lvl.version, urgency: lvl.urgency, op_class: opClass, forecast_id: forecastId,
    } });
    const result = { ...r, routed_to: pf['routed_to'], routed_by: pf['routed_by'], raised_as_of: now, closes_at: win.closesAt, timely: win.timely, decision_missed: win.decisionMissed,
                     level: lvl.level, level_version: lvl.version, urgency: lvl.urgency, consequence_class: consequenceClass };
    return { decision: 'raised', result, outboxEvent: { eventType: 'EarlyWarningRaised', payload: {
      schema_version: 'v1', warning_id: warningId, routed_to: pf['routed_to'], raised_as_of: now, closes_at: win.closesAt, timing_mode: 'live', timely: win.timely, decision_missed: win.decisionMissed,
      branch_id: null, flip_event_id: null, level: lvl.level, level_version: lvl.version, urgency: lvl.urgency, consequence_class: consequenceClass, consequence_class_source: 'declared', op_class: opClass } } };
  }

  /* B28 (0088) integrator: ONE owed candidate raised by the attention agent (the after-tick hook) — the route's raise write, the agent's envelope. */
  private async raiseAs(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, candidateId: string, correlationId: string) {
    const warningId = newId();
    const envelope = {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`,
      purpose_id: 'prediction', action: 'prediction.warning.raise', side_effect_class: 'reversible', consequence_class: 'C2',
      object_type: 'WRN', object_id: warningId, schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: correlationId, trace_id: 'attention-after-tick',
    } as unknown as Envelope;
    const w = await this.pipeline.write(envelope, principal, { scope: 'DOMAIN' as const, tenantId, domainId, action: 'prediction.warning.raise', objectType: 'WRN', objectId: warningId },
      WarningLifecycleCapability.raise,
      async (cap, scope) => {
        const r = await this.raiseCandidate(cap, scope, candidateId, warningId, principal.principalId, correlationId, 'prediction', 'C2');
        return { result: r, targetType: 'WRN', targetId: r.decision === 'raised' ? String(r.result['warning_id']) : null, targetVersion: r.decision === 'raised' ? '1' : null, outboxEvent: r.outboxEvent };
      });
    return w.result;
  }
  /* end B28 integrator */

  /* ───────────────────────────── the reads ───────────────────────────── */

  /** The intake as it stands, newest first — pending, raised, clustered and refused candidates with their outcome. */
  async candidates(cap: WarningLifecycleReads, p: { state?: unknown; limit?: unknown }): Promise<Row[]> {
    let q = cap.readCandidates().selectAll();
    if (typeof p.state === 'string' && ['pending', 'raised', 'clustered', 'refused'].includes(p.state)) q = q.where('state' as never, '=', p.state as never);
    const limit = Math.min(Math.max(Number(p.limit ?? 200) || 200, 1), 500);
    const rows = (await q.orderBy('submitted_at' as never, 'desc').orderBy('candidate_id' as never).limit(limit).execute()) as Row[];
    return rows.map((r) => ({ ...r, submitted_at: iso(r['submitted_at']), decided_at: iso(r['decided_at']) }));
  }

  /**
   * THE LIFECYCLE of one warning: its origin, the cluster and every member (lead, duplicates, storm members — each with its stance), the
   * CONTRADICTING block (the context's list and the members' contradicting evidence), the affected objectives with their titles, the
   * falsification conditions, the playbook, the closure, the feedback, the coverage gaps and the event history.
   */
  async lifecycle(cap: WarningLifecycleReads, warningId: string): Promise<Row | undefined> {
    const w = (await cap.readWarnings().selectAll().where('warning_id' as never, '=', warningId as never).executeTakeFirst()) as Row | undefined;
    if (w === undefined) return undefined;
    const cluster = w['cluster_id'] === null || w['cluster_id'] === undefined ? null
      : ((await cap.readClusters().selectAll().where('cluster_id' as never, '=', w['cluster_id'] as never).executeTakeFirst()) as Row | undefined) ?? null;
    const members = ((await cap.readMembers().selectAll().where('warning_id' as never, '=', warningId as never).orderBy('joined_at' as never).orderBy('member_id' as never).execute()) as Row[])
      .map((m): Row => ({ ...m, joined_at: iso(m['joined_at']) }));
    const fromMembers = members.filter((m) => m['stance'] === 'contradicting').flatMap((m) => arr(m['evidence']).filter((e) => e['stance'] === 'contradicting')
      .map((e) => ({ ...e, member_id: m['member_id'], origin_kind: m['origin_kind'], origin_key: m['origin_key'], source_id: e['source_id'] ?? m['source_id'], via: 'member' })));
    const affected = obj(w['affected']);
    const objectiveIds = Array.isArray(affected['objectives']) ? (affected['objectives'] as unknown[]).map(String).filter((x) => UUID.test(x)) : [];
    const objectives = objectiveIds.length === 0 ? [] : ((await cap.readStrategy().select(['strategy_object_id', 'title', 'status', 'owner_principal_id'] as never)
      .where('strategy_object_id' as never, 'in', objectiveIds as never).execute()) as Row[]);
    const feedback = ((await cap.readFeedback().selectAll().where('warning_id' as never, '=', warningId as never).orderBy('given_at' as never).execute()) as Row[]).map((f) => ({ ...f, given_at: iso(f['given_at']) }));
    const events = ((await cap.readWarningEvents().selectAll().where('warning_id' as never, '=', warningId as never).orderBy('occurred_at' as never).orderBy('event_id' as never).execute()) as Row[])
      .map((e) => ({ ...e, occurred_at: iso(e['occurred_at']) }));
    const gaps = await cap.coverageGaps(warningId);
    const storm = members.filter((m) => m['member_kind'] === 'storm');
    return {
      warning: w,
      origin: { kind: w['origin_kind'], ref: w['origin_ref'] },
      cluster: cluster === null ? null : { ...cluster, created_at: iso(cluster['created_at']) },
      members,
      storm: storm.length === 0 ? null : { members: storm.length, causes: [...new Set(storm.map((m) => String(m['cause_key'])))], rule: cluster?.['storm_rule'] ?? null,
        note: 'more raises of one cause than the rule admits within its window: the rest are members of this lead, each keeping its own key' },
      contradicting: { context: arr(w['contradicting']), members: fromMembers, count: arr(w['contradicting']).length + fromMembers.length },
      affected: { ...affected, objectives: objectiveIds.map((id) => { const o = objectives.find((x) => String(x['strategy_object_id']) === id); return { objective_id: id, title: o?.['title'] ?? null, status: o?.['status'] ?? null, owner: o?.['owner_principal_id'] ?? null }; }) },
      falsification: arr(w['falsification']), playbook: w['playbook'] ?? null, context_version: Number(w['context_version'] ?? 0),
      closure: w['closure'] ?? null, feedback,
      coverage_gaps: { markers: gaps, count: gaps.length, remediation: null, note: gaps.length === 0 ? 'no active source-impact marker bears on this warning' : 'an active marker says a source this warning rests on is degraded; its remediation is the remediation workflow\'s' },
      events,
    };
  }

  /** The warning evaluations, newest first (append-only). */
  async evaluations(cap: WarningLifecycleReads, p: { limit?: unknown }): Promise<Row[]> {
    const limit = Math.min(Math.max(Number(p.limit ?? 50) || 50, 1), 200);
    const rows = (await cap.readEvaluations().selectAll().orderBy('evaluated_at' as never, 'desc').limit(limit).execute()) as Row[];
    return rows.map((r) => ({ evaluation_id: r['evaluation_id'], window_from: iso(r['window_from']), window_to: iso(r['window_to']), min_sample: r['min_sample'], measures: r['measures'],
      verdict: r['verdict'], reason: r['reason'], evaluated_by: r['evaluated_by'], evaluated_at: iso(r['evaluated_at']) }));
  }
}
