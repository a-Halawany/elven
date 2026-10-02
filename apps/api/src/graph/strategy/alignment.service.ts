/**
 * THE STRATEGY GRAPH'S ALIGNMENT, MEASURES AND HUMAN AUTHORITY — CP-6 B32 (migration 0089 §G; F-P6-09: V8 PR-37-001..006,
 * CAP-DS-08, AT-37, PER-09).
 *
 * The prelude gave the graph six new TYPES (capability, initiative, resource, measure, stakeholder, risk/opportunity); this service
 * gives them what they mean:
 *
 *   ALIGNMENTS    a person's declared relationship between two active strategy objects, typed by its ends (supports OBJ→CAP,
 *                 builds INI→CAP, resources RSC→INI, measures MSR→OBJ, affects STK→OBJ, conflicts_with OBJ↔OBJ | INI↔INI), with
 *                 a declared strength, the claims and evidence it cites and its rationale — MIRRORED into graph.dependencies so the
 *                 SAME impact walk (never a second walker) and every GraphChanged reach reach them;
 *   MEASURES      an MSR object's measure (the objective, unit, direction, target, the freshness window) and its observations, each
 *                 read from a named claim or evidence object — fresh, stale or never observed at an instant;
 *   AUTHORITY     PR-37-003: "AI may detect misalignment and recommend options; human authorities set objectives, approve measures
 *                 and trade-offs, allocate resources" — four acts on the DIGEST of the version read, by a named active human eligible
 *                 by role, never the subject's declarer, expiring (human-gated at the PDP: an agent's attempt is refused there and
 *                 its denial recorded);
 *   OWNERSHIP     an owner transfer to an active human with a planning role;
 *   THE GAP VIEW  per objective × capability, the five criteria of alignment_rule@1 each with its basis and the count met — a
 *                 transparent count, never a weighted score (ES-47-002: nothing ranked hides a missing component);
 *   DETECTIONS    conflict, stale measure, dependency cycle (with its path) and missing owner, each with its DECLARED CONTINUITY
 *                 (hold | expose_affected_scope | route_to_owner) and whom it is routed to.
 *
 * The rules are the PORTS' (0089 §G): every refusal is the port's own text (`strategy alignment rejected (…)`, `strategy measure
 * rejected (…)`, `strategy authority rejected (…)`, `strategy owner rejected (…)`); the validation here refuses the caller's
 * malformed request early and in plain words (422) and never decides a rule the port decides.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { StrategyAlignmentReads, StrategyAlignmentWrites } from '../graph.capabilities.js';

export const ALIGNMENT_KINDS = ['supports', 'builds', 'resources', 'measures', 'affects', 'conflicts_with'] as const;
export type AlignmentKind = (typeof ALIGNMENT_KINDS)[number];
export const AUTHORITY_ACTS = ['set_objective', 'approve_measure', 'approve_tradeoff', 'allocate_resource'] as const;
export type AuthorityAct = (typeof AUTHORITY_ACTS)[number];
export const CONTINUITY = ['hold', 'expose_affected_scope', 'route_to_owner'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
type Row = Record<string, unknown>;

function refuse(correlationId: string, msg: string): never {
  throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422);
}
const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const instant = (v: unknown, what: string, correlationId: string): string => {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) refuse(correlationId, `${what} must be an instant (ISO 8601)`);
  return new Date(v as string).toISOString();
};

export interface AlignmentIntake { kind: AlignmentKind; from: string; to: string; strength: 'weak' | 'moderate' | 'strong'; evidence: Array<{ kind: 'claim' | 'evidence'; id: string }>; rationale: string }
export function validateAlignment(p: Record<string, unknown>, correlationId: string): AlignmentIntake {
  const kind = text(p['kind']);
  if (kind === null || !(ALIGNMENT_KINDS as readonly string[]).includes(kind)) refuse(correlationId, `kind must be one of ${ALIGNMENT_KINDS.join(', ')}`);
  for (const k of ['from', 'to']) if (typeof p[k] !== 'string' || !UUID.test(p[k] as string)) refuse(correlationId, `${k} must be the id of a strategy object`);
  const strength = text(p['strength']) ?? 'moderate';
  if (!['weak', 'moderate', 'strong'].includes(strength)) refuse(correlationId, "strength must be 'weak', 'moderate' or 'strong'");
  const rationale = text(p['rationale']);
  if (rationale === null || rationale.trim().length < 8) refuse(correlationId, 'rationale is at least 8 characters: an unexplained alignment is not one');
  const ev = p['evidence'] ?? [];
  if (!Array.isArray(ev) || ev.length > 32) refuse(correlationId, 'evidence is a list of at most 32 {kind: claim | evidence, id}');
  const evidence = (ev as unknown[]).map((x) => {
    const e = (x ?? {}) as Row;
    if (!['claim', 'evidence'].includes(String(e['kind'])) || typeof e['id'] !== 'string' || !UUID.test(e['id'])) refuse(correlationId, 'each evidence item is {kind: claim | evidence, id: uuid}');
    return { kind: e['kind'] as 'claim' | 'evidence', id: e['id'] as string };
  });
  return { kind: kind as AlignmentKind, from: p['from'] as string, to: p['to'] as string, strength: strength as AlignmentIntake['strength'], evidence, rationale: rationale as string };
}

export interface MeasureIntake { objectiveId: string; unit: string; direction: 'higher_better' | 'lower_better'; targetValue: number; targetDate: string | null; freshnessDays: number }
export function validateMeasure(p: Record<string, unknown>, correlationId: string): MeasureIntake {
  if (typeof p['objectiveId'] !== 'string' || !UUID.test(p['objectiveId'])) refuse(correlationId, 'objectiveId must be the id of the objective the measure measures');
  const unit = text(p['unit']);
  if (unit === null || unit.trim().length < 1 || unit.length > 64) refuse(correlationId, 'unit is 1 to 64 characters');
  const direction = text(p['direction']);
  if (direction !== 'higher_better' && direction !== 'lower_better') refuse(correlationId, "direction must be 'higher_better' or 'lower_better'");
  const target = Number(p['targetValue']);
  if (p['targetValue'] === null || p['targetValue'] === undefined || !Number.isFinite(target)) refuse(correlationId, 'targetValue must be a finite number');
  const date = p['targetDate'] === undefined || p['targetDate'] === null || p['targetDate'] === '' ? null : text(p['targetDate']);
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) refuse(correlationId, 'targetDate is a date (YYYY-MM-DD) or absent');
  const freshness = Number(p['freshnessDays']);
  if (!Number.isFinite(freshness) || freshness <= 0 || freshness > 3660) refuse(correlationId, 'freshnessDays is a number of days in (0, 3660]');
  return { objectiveId: p['objectiveId'] as string, unit: unit as string, direction: direction as MeasureIntake['direction'], targetValue: target, targetDate: date, freshnessDays: freshness };
}

export interface ObservationIntake { value: number; observedAt: string; sourceKind: 'claim' | 'evidence'; sourceId: string; note: string | null }
export function validateObservation(p: Record<string, unknown>, correlationId: string): ObservationIntake {
  const value = Number(p['value']);
  if (p['value'] === null || p['value'] === undefined || p['value'] === '' || !Number.isFinite(value)) refuse(correlationId, 'value must be a finite number');
  const observedAt = instant(p['observedAt'], 'observedAt', correlationId);
  const source = (p['source'] ?? {}) as Row;
  if (!['claim', 'evidence'].includes(String(source['kind'])) || typeof source['id'] !== 'string' || !UUID.test(source['id'])) {
    refuse(correlationId, 'source is the {kind: claim | evidence, id} the value was read from — an observation names its source');
  }
  const note = p['note'] === undefined || p['note'] === null ? null : text(p['note']);
  if (note !== null && note.length > 2000) refuse(correlationId, 'note is at most 2000 characters');
  return { value, observedAt, sourceKind: source['kind'] as 'claim' | 'evidence', sourceId: source['id'] as string, note };
}

export interface AuthorityIntake { actKind: AuthorityAct; subjectDigest: string; decision: 'approve' | 'reject'; rationale: string; expiresAt: string }
export function validateAuthority(p: Record<string, unknown>, correlationId: string, actKind?: AuthorityAct): AuthorityIntake {
  const kind = actKind ?? text(p['actKind']);
  if (kind === null || !(AUTHORITY_ACTS as readonly string[]).includes(kind)) refuse(correlationId, `actKind must be one of ${AUTHORITY_ACTS.join(', ')}`);
  const digest = text(p['subjectDigest']);
  if (digest === null || !HEX64.test(digest)) refuse(correlationId, 'subjectDigest is the digest of the subject version the approver read (64 hex)');
  const decision = text(p['decision']) ?? 'approve';
  if (decision !== 'approve' && decision !== 'reject') refuse(correlationId, "decision must be 'approve' or 'reject'");
  const rationale = text(p['rationale']);
  if (rationale === null || rationale.trim().length < 8) refuse(correlationId, 'rationale is at least 8 characters: an authority act says why');
  const expiresAt = instant(p['expiresAt'], 'expiresAt', correlationId);
  return { actKind: kind as AuthorityAct, subjectDigest: digest as string, decision: decision as 'approve' | 'reject', rationale: rationale as string, expiresAt };
}

export function validateOwner(p: Record<string, unknown>, correlationId: string): { owner: string; reason: string } {
  if (typeof p['ownerPrincipalId'] !== 'string' || !UUID.test(p['ownerPrincipalId'])) refuse(correlationId, 'ownerPrincipalId must be the id of the new owner');
  const reason = text(p['reason']);
  if (reason === null || reason.trim().length < 8) refuse(correlationId, 'reason is at least 8 characters');
  return { owner: p['ownerPrincipalId'] as string, reason: reason as string };
}

/** The instant a read is AS OF: the caller's, or now — always stated in the answer. */
export function atOf(v: unknown, correlationId: string): string {
  return v === undefined || v === null || v === '' ? new Date().toISOString() : instant(v, 'at', correlationId);
}

/** The subject kind an authority act names. */
export const SUBJECT_OF: Readonly<Record<AuthorityAct, 'strategy' | 'measure' | 'alignment'>> = Object.freeze({
  set_objective: 'strategy', approve_measure: 'measure', approve_tradeoff: 'alignment', allocate_resource: 'alignment',
});

@Injectable()
export class StrategyAlignmentService {
  async declareAlignment(cap: StrategyAlignmentWrites, ctx: ScopeContext, a: { alignmentId: string; intake: AlignmentIntake; actor: string; correlationId: string }): Promise<Row> {
    return cap.declareAlignment({ alignmentId: a.alignmentId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, kind: a.intake.kind, from: a.intake.from, to: a.intake.to,
      strength: a.intake.strength, evidence: a.intake.evidence, rationale: a.intake.rationale, actor: a.actor, correlationId: a.correlationId });
  }

  async retireAlignment(cap: StrategyAlignmentWrites, ctx: ScopeContext, a: { alignmentId: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return cap.retireAlignment({ alignmentId: a.alignmentId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, reason: a.reason, actor: a.actor, correlationId: a.correlationId });
  }

  async defineMeasure(cap: StrategyAlignmentWrites, ctx: ScopeContext, a: { measureId: string; intake: MeasureIntake; actor: string; correlationId: string }): Promise<Row> {
    return cap.defineMeasure({ measureId: a.measureId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, ...a.intake, actor: a.actor, correlationId: a.correlationId });
  }

  async observe(cap: StrategyAlignmentWrites, ctx: ScopeContext, a: { measureId: string; intake: ObservationIntake; actor: string; correlationId: string }): Promise<Row> {
    const r = await cap.recordMeasureObservation({ observationId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, measureId: a.measureId, ...a.intake,
      actor: a.actor, correlationId: a.correlationId });
    // the freshness the observation leaves — the gap view's read (graph.measure_freshness, its as-of rule unchanged) at a DATABASE instant
    // never earlier than this observation's recorded_at (B32-F1: a JavaScript millisecond clock could precede the row's microsecond stamp)
    const read = await cap.measureFreshnessAfterObservation({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, observationId: String(r['observation_id']) });
    const fr = read.rows.find((x) => String(x['measure_id']) === a.measureId);
    return { ...r, freshness: fr === undefined ? null : { state: fr['state'], age_days: fr['age_days'], freshness_days: fr['freshness_days'], last_observed_at: fr['last_observed_at'], read_at: read.at } };
  }

  async authority(cap: StrategyAlignmentWrites, ctx: ScopeContext, a: { subjectId: string; intake: AuthorityIntake; actor: string; correlationId: string }): Promise<Row> {
    return cap.recordAuthorityAct({ actId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, actKind: a.intake.actKind, subjectId: a.subjectId,
      subjectDigest: a.intake.subjectDigest, decision: a.intake.decision, rationale: a.intake.rationale, expiresAt: a.intake.expiresAt, actor: a.actor, correlationId: a.correlationId });
  }

  async assignOwner(cap: StrategyAlignmentWrites, ctx: ScopeContext, a: { objectId: string; owner: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return cap.assignStrategyOwner({ objectId: a.objectId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, owner: a.owner, reason: a.reason, actor: a.actor,
      eventId: newId(), correlationId: a.correlationId });
  }

  /** The gap view AS OF an instant: every row with its criteria, reasons and holds — verbatim from graph.alignment_gaps (its order: held, fewest met, titles). */
  async gaps(cap: StrategyAlignmentReads, ctx: ScopeContext, a: { objectiveId: string | null; at: string }): Promise<{ at: string; rule: string | null; rows: Row[]; summary: Row }> {
    const rows = await cap.alignmentGaps({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, objectiveId: a.objectiveId, at: a.at });
    const reasons: Record<string, number> = {};
    for (const r of rows) for (const g of (r['gap_reasons'] as string[] | null) ?? []) reasons[g] = (reasons[g] ?? 0) + 1;
    const claims: Record<string, number> = {};
    for (const r of rows) claims[String(r['alignment_claim'])] = (claims[String(r['alignment_claim'])] ?? 0) + 1;
    return { at: a.at, rule: rows.length === 0 ? null : String(rows[0]!['rule']), rows: rows.map(({ rule: _r, ...x }) => x), summary: { rows: rows.length, by_claim: claims, by_reason: reasons } };
  }

  /** The detections AS OF an instant, each with its declared continuity and whom it is routed to — verbatim from graph.strategy_detections. */
  async detections(cap: StrategyAlignmentReads, ctx: ScopeContext, a: { at: string }): Promise<{ at: string; detections: Row[]; counts: Row }> {
    const rows = await cap.strategyDetections({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, at: a.at });
    const byKind: Record<string, number> = {};
    for (const r of rows) if (r['state'] === 'open') byKind[String(r['detection_kind'])] = (byKind[String(r['detection_kind'])] ?? 0) + 1;
    return { at: a.at, detections: rows, counts: { open: rows.filter((r) => r['state'] === 'open').length, resolved: rows.filter((r) => r['state'] === 'resolved').length, open_by_kind: byKind } };
  }

  /** The measures AS OF an instant: definition, approval standing, freshness — and the observations of each (newest first). */
  async measures(cap: StrategyAlignmentReads, ctx: ScopeContext, a: { at: string }): Promise<{ at: string; measures: Row[] }> {
    const rows = await cap.measureFreshness({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, at: a.at });
    const obs = rows.length === 0 ? [] : (await cap.readMeasureObservations().selectAll()
      .where('measure_id' as never, 'in', rows.map((r) => r['measure_id']) as never)
      .orderBy('observed_at' as never, 'desc').execute()) as Row[];
    return { at: a.at, measures: rows.map((r) => ({ ...r, subject: { kind: 'measure', version: r['definition_version'], digest: r['definition_digest'] },
      history: obs.filter((o) => String(o['measure_id']) === String(r['measure_id'])).slice(0, 50) })) };
  }

  /** The alignments (active first), each with its digest (what an authority act names) and its events; the acts on each. */
  async alignments(cap: StrategyAlignmentReads, a: { includeRetired: boolean }): Promise<Row[]> {
    let q = cap.readAlignments().selectAll();
    if (!a.includeRetired) q = q.where('state' as never, '=', 'active' as never);
    const rows = (await q.orderBy('declared_at' as never, 'desc').limit(1000).execute()) as Row[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r['alignment_id']);
    const acts = (await cap.readAuthorityActs().selectAll().where('subject_id' as never, 'in', ids as never).orderBy('recorded_at' as never, 'desc').execute()) as Row[];
    return rows.map((r) => ({ ...r, subject: { kind: 'alignment', version: 1, digest: r['digest'] }, acts: acts.filter((x) => String(x['subject_id']) === String(r['alignment_id'])) }));
  }

  /** The authority acts naming a subject (newest first) — the record PR-37-003 asks for. */
  async acts(cap: StrategyAlignmentReads, a: { subjectId: string | null }): Promise<Row[]> {
    let q = cap.readAuthorityActs().selectAll();
    if (a.subjectId !== null) q = q.where('subject_id' as never, '=', a.subjectId as never);
    return (await q.orderBy('recorded_at' as never, 'desc').limit(500).execute()) as Row[];
  }
}
