/**
 * DECISION REVIEW — CP-6 B35 part `reopen` (migration 0101 §P; F-P6-06: V02-T-014, R-24, V10-T-055, ES-39-008, V00-T-040; the B35 pieces
 * of F-P4-08 (relevance outside an active set, a review cadence on a set) and F-P4-09 (the cadence miss routed as a task); §B36.12 row 11).
 *
 *   THE REOPEN        decision.reopen_package re-declared: the causes challenge_upheld, appeal_upheld and conditions_changed beside the three
 *                     older ones; a reopened decision's scenarios TASKED to their owners (decision.reversion) with a reversion request.
 *   THE OUTCOME       an assessment in four separate fields — observed, inferred (method, confidence), counterfactual (basis), changed conditions.
 *   THE TERMS         baseline, replay horizon, evidence standard on a version (the owner's).
 *   THE REPLAY        its initiator and reason beside decision.replays; whether it falls within the horizon.
 *   THE METRICS       completeness (missing and disputed evidence surfaced), evidence coverage, time-to-decision, reversibility, outcome linkage.
 *   THE LESSONS       a hypothesis or lesson recorded as a governed memory object (memory.item.record) and linked to its assessment.
 *   THE SETS          a review cadence per scenario set; the tick step `review-cadence` routes a miss (decision.review_due) and meets it on review;
 *                     the tick step `cited-scenario-relevance` scores the scenarios live packages cite outside every active set.
 * This service validates what a route hands in (the SHAPE, in plain words) and registers the two tick steps; the ports decide every rule.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { ReviewCapability, type ReopenCauseKind } from './review.capabilities.js';

type Row = Record<string, unknown>;

export const CITED_RELEVANCE_STEP = 'cited-scenario-relevance';
export const CITED_RELEVANCE_ORDER = 72;
export const REVIEW_CADENCE_STEP = 'review-cadence';
export const REVIEW_CADENCE_ORDER = 73;
export const REOPEN_CAUSES: readonly ReopenCauseKind[] = ['input_invalidated', 'condition_breach', 'policy_changed', 'challenge_upheld', 'appeal_upheld', 'conditions_changed'];
export const EVIDENCE_KINDS = ['warning', 'signal', 'indicator', 'forecast', 'scenario', 'run', 'claim', 'evidence'] as const;
export const INFERENCE_METHODS = ['attribution_rule', 'difference_in_differences', 'simulation_comparison', 'regression', 'expert_judgment'] as const;
export const EVIDENCE_STANDARDS = ['decision_grade', 'reviewed', 'indicative'] as const;
export const BASELINE_KINDS = ['run', 'outcome_criterion', 'stated'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const need = (v: unknown, min: number, max: number, cls: string, what: string, correlationId: string): string => {
  if (!text(v, min, max)) refuse(correlationId, `review rejected (${cls}): ${what} (${min} to ${max} characters)`);
  return (v as string).trim();
};

export function assertUuid(v: unknown, what: string, correlationId: string, noun = 'review'): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${what}): a uuid is required`);
  return v as string;
}
export function versionOf(v: unknown, correlationId: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1) refuse(correlationId, 'review rejected (version): a version is a positive integer');
  return n;
}
const optionalInt = (v: unknown, cls: string, correlationId: string): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) refuse(correlationId, `review rejected (${cls}): the version read is a positive integer`);
  return v as number;
};

export interface ChangeCommand { title: string; statement: string; evidence: Row[] }
/** A change of conditions: a name (4–256), a statement (16–4000), 1–20 recorded objects that evidence it [{kind, id, note?}]. */
export function validateChange(p: Row, correlationId: string): ChangeCommand {
  const title = need(p['title'], 4, 256, 'title', 'a change of conditions is named', correlationId);
  const statement = need(p['statement'], 16, 4000, 'statement', 'a change of conditions states what changed', correlationId);
  const ev = p['evidence'];
  if (!Array.isArray(ev) || ev.length < 1 || ev.length > 20) refuse(correlationId, 'review rejected (evidence): a change of conditions names 1 to 20 recorded objects that evidence it [{kind, id, note?}]');
  const evidence = (ev as unknown[]).map((e, i) => {
    if (!isObject(e) || !(EVIDENCE_KINDS as readonly string[]).includes(String(e['kind'])) || typeof e['id'] !== 'string' || !UUID.test(e['id'] as string)) {
      refuse(correlationId, `review rejected (evidence): item ${i + 1} is {kind ${EVIDENCE_KINDS.join('|')}, id, note?}`);
    }
    const r = e as Row;
    if (r['note'] !== undefined && r['note'] !== null && !text(r['note'], 0, 500)) refuse(correlationId, `review rejected (evidence): item ${i + 1}'s note is at most 500 characters`);
    return { kind: String(r['kind']), id: String(r['id']).toLowerCase(), ...(typeof r['note'] === 'string' && r['note'].trim() !== '' ? { note: r['note'].trim() } : {}) };
  });
  return { title, statement, evidence };
}

export interface CauseCommand { kind: ReopenCauseKind; ref: string }
/** A reopen's cause: one of the six recorded kinds, named by the id of what was recorded. */
export function validateCause(v: unknown, correlationId: string): CauseCommand {
  if (!isObject(v) || !(REOPEN_CAUSES as readonly string[]).includes(String(v['kind'])) || typeof v['ref'] !== 'string' || !UUID.test(v['ref'] as string)) {
    refuse(correlationId, `reopen rejected (cause): a cause is {kind ${REOPEN_CAUSES.join(' | ')}, ref} — the id of what was recorded`);
  }
  return { kind: (v as Row)['kind'] as ReopenCauseKind, ref: String((v as Row)['ref']) };
}

export function validateResolution(p: Row, correlationId: string): { resolution: 'reversioned' | 'declined'; note: string } {
  const r = p['resolution'];
  if (r !== 'reversioned' && r !== 'declined') refuse(correlationId, 'review rejected (resolution): a reversion request is reversioned or declined');
  const note = need(p['note'], r === 'declined' ? 16 : 8, 2000, 'note', r === 'declined' ? 'a declined re-versioning says why' : 'the resolution says what was re-versioned', correlationId);
  return { resolution: r as 'reversioned' | 'declined', note };
}

/** The four fields are separate statements: none repeats another (compared without case or surrounding space). */
export function separationProblem(a: { observed: string; inferred: string; counterfactual: string; changed: string[] }): string | null {
  const n = (s: string) => s.trim().toLowerCase();
  const three = [n(a.observed), n(a.inferred), n(a.counterfactual)];
  if (three[0] === three[1]) return 'the inferred contribution repeats the observed result';
  if (three[0] === three[2]) return 'the counterfactual claim repeats the observed result';
  if (three[1] === three[2]) return 'the counterfactual claim repeats the inferred contribution';
  const hit = a.changed.find((c) => three.includes(n(c)));
  return hit === undefined ? null : `the changed condition "${hit}" repeats another field`;
}

export interface OutcomeCommand { observed: Row; inferred: Row; counterfactual: Row; changed: Row[]; supersedes: string | null }
/** The assessment's SHAPE: observed {outcomeIds 1..20, statement}, inferred {statement, method, confidence 0..1, magnitude?, unit?},
 *  counterfactual {claim, basis {kind run, runId} | {kind stated_model, model}}, changedConditions [{condition, effect?, evidence?}] 0..20. */
export function validateOutcome(p: Row, correlationId: string): OutcomeCommand {
  const o = isObject(p['observed']) ? p['observed'] : {};
  const ids = o['outcomeIds'];
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20 || ids.some((x) => typeof x !== 'string' || !UUID.test(x))) {
    refuse(correlationId, 'review rejected (observed): the observed result names 1 to 20 recorded outcomes of the commitment (outcomeIds)');
  }
  const observed = { outcome_ids: ids as string[], statement: need(o['statement'], 16, 2000, 'observed', 'the observed result is stated', correlationId) };
  const i = isObject(p['inferred']) ? p['inferred'] : {};
  if (!(INFERENCE_METHODS as readonly string[]).includes(String(i['method'])) || typeof i['confidence'] !== 'number' || i['confidence'] < 0 || i['confidence'] > 1) {
    refuse(correlationId, `review rejected (inferred): the inferred contribution names its method (${INFERENCE_METHODS.join(' | ')}) and a confidence in [0, 1]`);
  }
  if (i['magnitude'] !== undefined && i['magnitude'] !== null && typeof i['magnitude'] !== 'number') refuse(correlationId, 'review rejected (inferred): the magnitude is a number');
  const inferred = { statement: need(i['statement'], 16, 2000, 'inferred', 'the inferred contribution is stated', correlationId), method: i['method'], confidence: i['confidence'],
                     magnitude: i['magnitude'] ?? null, unit: typeof i['unit'] === 'string' ? i['unit'].trim() : null };
  const c = isObject(p['counterfactual']) ? p['counterfactual'] : {};
  const b = isObject(c['basis']) ? c['basis'] : {};
  let basis: Row = {};
  if (b['kind'] === 'run') basis = { kind: 'run', run_id: assertUuid(b['runId'], 'counterfactual', correlationId) };
  else if (b['kind'] === 'stated_model') basis = { kind: 'stated_model', model: need(b['model'], 16, 2000, 'counterfactual', 'a stated model says how the counterfactual was reasoned', correlationId) };
  else refuse(correlationId, 'review rejected (counterfactual): the counterfactual claim names its basis — {kind run, runId} or {kind stated_model, model}');
  const counterfactual = { claim: need(c['claim'], 16, 2000, 'counterfactual', 'the counterfactual claim is stated', correlationId), basis };
  const ch = p['changedConditions'] ?? [];
  if (!Array.isArray(ch) || ch.length > 20) refuse(correlationId, 'review rejected (changed_conditions): the changed conditions are a list (0 to 20) [{condition, effect?, evidence?}]');
  const changed = (ch as unknown[]).map((x, k) => {
    if (!isObject(x)) refuse(correlationId, `review rejected (changed_conditions): condition ${k + 1} is {condition, effect?, evidence?}`);
    const r = x as Row;
    const ev = r['evidence'] ?? [];
    if (!Array.isArray(ev)) refuse(correlationId, `review rejected (changed_conditions): condition ${k + 1}'s evidence is a list [{kind, id}]`);
    return { condition: need(r['condition'], 8, 500, 'changed_conditions', 'a changed condition is named', correlationId), effect: typeof r['effect'] === 'string' ? r['effect'].trim() : null, evidence: ev };
  });
  const sep = separationProblem({ observed: observed.statement, inferred: inferred.statement, counterfactual: counterfactual.claim, changed: changed.map((x) => x.condition) });
  if (sep !== null) refuse(correlationId, `review rejected (separation): the four fields are separate statements — ${sep}`);
  const sup = p['supersedes'] === undefined || p['supersedes'] === null ? null : assertUuid(p['supersedes'], 'supersedes', correlationId);
  return { observed, inferred, counterfactual, changed, supersedes: sup };
}

export interface TermsCommand { baseline: Row; horizonDays: number; standard: string; note: string; expected: number | null }
export function validateTerms(p: Row, correlationId: string): TermsCommand {
  const b = isObject(p['baseline']) ? p['baseline'] : {};
  if (!(BASELINE_KINDS as readonly string[]).includes(String(b['kind']))) refuse(correlationId, 'review rejected (baseline): the baseline is {kind run | outcome_criterion | stated, ref, statement}');
  const ref = b['kind'] === 'stated' ? null : b['kind'] === 'run' ? assertUuid(b['ref'], 'baseline', correlationId) : need(b['ref'], 1, 128, 'baseline', 'an outcome criterion baseline names the criterion key', correlationId);
  const baseline = { kind: b['kind'], ref, statement: need(b['statement'], 8, 2000, 'baseline', 'the baseline is stated', correlationId) };
  const h = p['replayHorizonDays'];
  if (typeof h !== 'number' || !Number.isInteger(h) || h < 1 || h > 3650) refuse(correlationId, 'review rejected (replay_horizon): the replay horizon is 1 to 3650 days after the commitment');
  if (!(EVIDENCE_STANDARDS as readonly string[]).includes(String(p['evidenceStandard']))) refuse(correlationId, 'review rejected (evidence_standard): the evidence standard is decision_grade, reviewed or indicative');
  return { baseline, horizonDays: h as number, standard: String(p['evidenceStandard']), note: need(p['evidenceNote'], 8, 2000, 'evidence_note', 'the evidence standard says what it requires', correlationId),
           expected: optionalInt(p['expectedVersion'], 'stale', correlationId) };
}

export function validateReplay(p: Row, correlationId: string): { reason: string; asOf: string | null } {
  const reason = need(p['reason'], 8, 2000, 'reason', 'a replay states why it is run', correlationId);
  const asOf = typeof p['asOf'] === 'string' && !Number.isNaN(new Date(p['asOf']).getTime()) ? new Date(p['asOf']).toISOString() : null;
  return { reason, asOf };
}

export function validateLesson(p: Row, correlationId: string): { kind: 'hypothesis' | 'lesson'; memoryItemId: string } {
  if (p['kind'] !== 'hypothesis' && p['kind'] !== 'lesson') refuse(correlationId, 'review rejected (kind): a link is a hypothesis or a lesson');
  return { kind: p['kind'] as 'hypothesis' | 'lesson', memoryItemId: assertUuid(p['memoryItemId'], 'memory_item', correlationId) };
}

export function validateCadence(p: Row, correlationId: string): { everyDays: number; anchorAt: string | null; rationale: string; expected: number | null } {
  const d = p['everyDays'];
  if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 366) refuse(correlationId, 'review rejected (every_days): a cadence is every 1 to 366 days');
  let anchorAt: string | null = null;
  if (p['anchorAt'] !== undefined && p['anchorAt'] !== null && p['anchorAt'] !== '') {
    if (typeof p['anchorAt'] !== 'string' || Number.isNaN(new Date(p['anchorAt']).getTime())) refuse(correlationId, 'review rejected (anchor): the anchor is an instant');
    anchorAt = new Date(p['anchorAt'] as string).toISOString();
  }
  return { everyDays: d as number, anchorAt, rationale: need(p['rationale'], 8, 2000, 'rationale', 'a cadence says why the set is reviewed this often', correlationId),
           expected: optionalInt(p['expectedVersion'], 'stale', correlationId) };
}

@Injectable()
export class DecisionReviewService implements OnModuleInit {
  private readonly log = new Logger('decision.review');
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The two tick steps (the sets service's idiom: the registry found when the executive module is loaded). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the review cadences and the cited relevance are not swept by the tick'); return; }
    registry.register({ name: CITED_RELEVANCE_STEP, order: CITED_RELEVANCE_ORDER, run: async (c: AttentionTickContext) => this.relevance(c) });
    registry.register({ name: REVIEW_CADENCE_STEP, order: REVIEW_CADENCE_ORDER, run: async (c: AttentionTickContext) => this.cadence(c) });
  }
  /** `cited-scenario-relevance`: the scenarios live packages cite outside every active set, scored by B27's rule — judged by the port. */
  private async relevance(c: AttentionTickContext): Promise<Row> {
    return ReviewCapability.relevance(c.tx, 'executive.attention.tick').scoreCited({ tenantId: c.tenantId, domainId: c.domainId, trigger: 'tick', actor: c.agentPrincipalId, correlationId: c.correlationId });
  }
  /** `review-cadence`: each active set's review due; a miss routed once to its owner, met by the review that follows — judged by the port. */
  private async cadence(c: AttentionTickContext): Promise<Row> {
    return ReviewCapability.cadence(c.tx, 'executive.attention.tick').sweep({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }
}
