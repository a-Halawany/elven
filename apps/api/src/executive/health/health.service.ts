/**
 * THE DECOMPOSABLE STRATEGIC HEALTH SCORE — CP-6 B32 (migration 0089 §H; F-P6-08; C-034, V00-T-099, V01-T-025, V02-T-220/-221,
 * V03-T-186, AI-56-004, ADR-018, PR-43-001..006, CAP-EO-05, AT-43, UX-43-001..006, VIZ-12).
 *
 * THE DEFINITION is a versioned model — dimensions (weight, objectives, threshold bands), components (the contract input each reads,
 * weight, direction, normalisation, freshness bound, criticality), the coverage floor and the change threshold. One named human
 * PROPOSES a version; ANOTHER approves (activates) or refuses it (PR-43-003: humans approve dimensions, measures, weights and
 * thresholds). A proposal moving a weight or a threshold beyond the anti-gaming policy is flagged; its approver records the review.
 *
 * THE SCORE is computed in the database (executive.compute_health_score) from executive.health_measure_inputs ONLY, under the active
 * definition: every component with its evidence, confidence, trend, freshness, contribution and sensitivity; stale, missing and
 * inconsistent inputs EXCLUDED AND DECLARED; a dimension below the coverage floor INDETERMINATE (no value); a critical failure forcing
 * PARTIAL; the aggregate NULL when any dimension is indeterminate. A snapshot at an earlier instant is an AS_OF replay that says whether
 * it reproduces the snapshot recorded there. AI may compute and explain; nothing here decides.
 *
 * THE CHANGES a current snapshot raises (a band crossing, a move beyond the threshold, a (de)termination) are acknowledged (a receipt),
 * challenged, and decided by a person who is neither the challenger nor the definition's approver — or withdrawn. A score change
 * triggers review, never action (V01-T-025). COMPARISON to a baseline is refused across definitions or formula versions (PR-43-005:
 * prevent misleading comparison); a peer comparison is declared absent — no peer input exists in this product.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { ExecutiveReads } from '../executive.capabilities.js';

type Row = Record<string, unknown>;
export const INPUT_KINDS = ['indicator', 'measure', 'risk', 'opportunity', /* B36 (0094 §S2) */ 'capability', 'execution', 'outcome', 'quality'] as const;
export const DEFINITION_STATES = ['proposed', 'active', 'superseded', 'refused'] as const;
export const SNAPSHOT_STATUSES = ['complete', 'partial', 'indeterminate'] as const;
export const CHANGE_STATES = ['raised', 'acknowledged', 'challenged', 'upheld', 'dismissed', 'withdrawn'] as const;
export const CHALLENGE_KINDS = ['input', 'weight', 'threshold', 'formula', 'interpretation'] as const;
export const COMPONENT_STATES = ['included', 'stale', 'missing', 'inconsistent'] as const;
/** The declared absence of a peer comparison (no peer input exists; nothing is invented). */
export const PEER_ABSENT = { peer: null, reason: 'no peer input in this product' } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const bad = (correlationId: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };
const text = (p: Row, k: string): string => (typeof p[k] === 'string' ? (p[k] as string).trim() : '');
const limitOf = (v: unknown, dflt: number, max: number) => Math.min(Math.max(Number(v ?? dflt) || dflt, 1), max);

/** The intake of a proposal: the model object and the reason (the port validates the model whole — 22023 names the key). */
export function validatePropose(p: Row, correlationId: string): { model: Row; reason: string } {
  const model = p['model'];
  if (model === null || typeof model !== 'object' || Array.isArray(model)) bad(correlationId, 'payload.model is the score model {dimensions, components, min_coverage, change_points, min_confidence?}');
  const reason = text(p, 'reason');
  if (reason.length < 8 || reason.length > 2000) bad(correlationId, 'payload.reason says why the definition changes (8–2000 characters)');
  return { model: model as Row, reason };
}

/** The intake of an approval: the note, and the anti-gaming review when the proposal is flagged (the port decides whether it is). */
export function validateApprove(p: Row, correlationId: string): { note: string; gamingReview: string | null } {
  const note = text(p, 'note');
  if (note.length < 8 || note.length > 2000) bad(correlationId, 'payload.note says why the definition is approved (8–2000 characters)');
  const review = text(p, 'gaming_review');
  if (review.length > 2000) bad(correlationId, 'payload.gaming_review is at most 2000 characters');
  return { note, gamingReview: review === '' ? null : review };
}

/** The intake of a refusal: the reason. */
export function validateRefuse(p: Row, correlationId: string): { reason: string } {
  const reason = text(p, 'reason');
  if (reason.length < 8 || reason.length > 2000) bad(correlationId, 'payload.reason says why the definition is refused (8–2000 characters)');
  return { reason };
}

/** The intake of a computation: an optional instant at or before now (default now — the port refuses a future one). */
export function validateCompute(p: Row, correlationId: string): { at: string | null } {
  const v = p['at'];
  if (v === undefined || v === null || v === '') return { at: null };
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) bad(correlationId, 'payload.at is an instant (ISO 8601) at or before now');
  return { at: new Date(v as string).toISOString() };
}

/** The intake of an acknowledgement: an optional note. */
export function validateAcknowledge(p: Row, correlationId: string): { note: string | null } {
  const note = text(p, 'note');
  if (note.length > 2000) bad(correlationId, 'payload.note is at most 2000 characters');
  return { note: note === '' ? null : note };
}

/** The intake of a challenge: what it disputes and its case. */
export function validateChallenge(p: Row, correlationId: string): { kind: (typeof CHALLENGE_KINDS)[number]; statement: string } {
  const kind = p['kind'];
  if (typeof kind !== 'string' || !(CHALLENGE_KINDS as readonly string[]).includes(kind)) bad(correlationId, `payload.kind is one of ${CHALLENGE_KINDS.join(', ')}`);
  const statement = text(p, 'statement');
  if (statement.length < 8 || statement.length > 4000) bad(correlationId, 'payload.statement states the case (8–4000 characters)');
  return { kind: kind as (typeof CHALLENGE_KINDS)[number], statement };
}

/** The intake of a decision on a challenge: upheld or dismissed, with a note. */
export function validateDecideChange(p: Row, correlationId: string): { decision: 'upheld' | 'dismissed'; note: string } {
  const decision = p['decision'];
  if (decision !== 'upheld' && decision !== 'dismissed') bad(correlationId, 'payload.decision is upheld or dismissed');
  const note = text(p, 'note');
  if (note.length < 8 || note.length > 2000) bad(correlationId, 'payload.note says why (8–2000 characters)');
  return { decision: decision as 'upheld' | 'dismissed', note };
}

/** The intake of a withdrawal: the reason. */
export function validateWithdraw(p: Row, correlationId: string): { reason: string } {
  const reason = text(p, 'reason');
  if (reason.length < 8 || reason.length > 2000) bad(correlationId, 'payload.reason says why the challenge is withdrawn (8–2000 characters)');
  return { reason };
}

/** A snapshot row, as the reads answer it (the aggregate a number or null — never a number for an indeterminate score). */
function snapshotOf(r: Row): Row {
  return {
    snapshot_id: r['snapshot_id'], definition_id: r['definition_id'], definition_version: r['definition_version'], formula_version: r['formula_version'], model_digest: r['model_digest'],
    at: iso(r['at']), computed_at: iso(r['computed_at']), kind: r['kind'], prior_snapshot_id: r['prior_snapshot_id'] ?? null, replay_of: r['replay_of'] ?? null, reproduced: r['reproduced'] ?? null,
    status: r['status'], aggregate: r['status'] === 'indeterminate' ? null : num(r['aggregate']), coverage: num(r['coverage']),
    inputs_digest: r['inputs_digest'], result_digest: r['result_digest'], computed_by: r['computed_by'],
  };
}
function definitionOf(r: Row): Row {
  return {
    definition_id: r['definition_id'], version: r['version'], state: r['state'], model: r['model'], model_digest: r['model_digest'], formula_version: r['formula_version'],
    changed_sections: r['changed_sections'], reason: r['reason'], basis_version: r['basis_version'] ?? null, gaming_review_required: r['gaming_review_required'], gaming_reasons: r['gaming_reasons'],
    proposed_by: r['proposed_by'], proposed_at: iso(r['proposed_at']), approved_by: r['approved_by'] ?? null, approved_at: iso(r['approved_at']), approval_note: r['approval_note'] ?? null,
    gaming_review_note: r['gaming_review_note'] ?? null, supersedes: r['supersedes'] ?? null, refused_by: r['refused_by'] ?? null, refused_at: iso(r['refused_at']),
    refusal_reason: r['refusal_reason'] ?? null, superseded_at: iso(r['superseded_at']),
  };
}
function changeOf(r: Row): Row {
  return {
    change_id: r['change_id'], snapshot_id: r['snapshot_id'], prior_snapshot_id: r['prior_snapshot_id'], definition_id: r['definition_id'], definition_version: r['definition_version'],
    definition_approved_by: r['definition_approved_by'], subject: r['subject'], subject_label: r['subject_label'], from_value: num(r['from_value']), to_value: num(r['to_value']),
    delta: num(r['delta']), from_band: r['from_band'] ?? null, to_band: r['to_band'] ?? null, triggers: r['triggers'], direction: r['direction'], gaming_flags: r['gaming_flags'],
    state: r['state'], raised_at: iso(r['raised_at']), acknowledged_by: r['acknowledged_by'] ?? null, acknowledged_at: iso(r['acknowledged_at']), acknowledgement_note: r['acknowledgement_note'] ?? null,
    challenge_kind: r['challenge_kind'] ?? null, challenge_statement: r['challenge_statement'] ?? null, challenged_by: r['challenged_by'] ?? null, challenged_at: iso(r['challenged_at']),
    decided_by: r['decided_by'] ?? null, decided_at: iso(r['decided_at']), decision_note: r['decision_note'] ?? null, withdrawn_at: iso(r['withdrawn_at']), withdrawal_reason: r['withdrawal_reason'] ?? null,
    authorizes_action: false,
  };
}

@Injectable()
export class HealthService {
  /** The domain's definition versions, newest first — the active one, the pending proposal, the refused and the superseded, never hidden. */
  async definitions(cap: ExecutiveReads, p: { state?: unknown; limit?: unknown }): Promise<Row> {
    let q = cap.readHealthDefinitions().selectAll();
    if (typeof p.state === 'string' && (DEFINITION_STATES as readonly string[]).includes(p.state)) q = q.where('state' as never, '=', p.state as never);
    const rows = (await q.orderBy('version' as never, 'desc').limit(limitOf(p.limit, 50, 200)).execute()) as Row[];
    const all = rows.map(definitionOf);
    return { definitions: all, active: all.find((d) => d['state'] === 'active') ?? null, pending: all.find((d) => d['state'] === 'proposed') ?? null };
  }

  async definition(cap: ExecutiveReads, id: string, correlationId: string): Promise<Row> {
    const r = (await cap.readHealthDefinitions().selectAll().where('definition_id' as never, '=', id as never).executeTakeFirst()) as Row | undefined;
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no such health score definition in this domain'), 404);
    return definitionOf(r);
  }

  /** The snapshots, newest first — the status and coverage beside every aggregate (an indeterminate one has none). */
  async snapshots(cap: ExecutiveReads, p: { definitionId?: unknown; kind?: unknown; limit?: unknown }): Promise<Row[]> {
    let q = cap.readHealthSnapshots().select(['snapshot_id', 'definition_id', 'definition_version', 'formula_version', 'model_digest', 'at', 'computed_at', 'kind', 'prior_snapshot_id', 'replay_of',
      'reproduced', 'status', 'aggregate', 'coverage', 'inputs_digest', 'result_digest', 'computed_by'] as never);
    if (typeof p.definitionId === 'string' && UUID.test(p.definitionId)) q = q.where('definition_id' as never, '=', p.definitionId as never);
    if (p.kind === 'current' || p.kind === 'as_of') q = q.where('kind' as never, '=', p.kind as never);
    const rows = (await q.orderBy('at' as never, 'desc').orderBy('computed_at' as never, 'desc').limit(limitOf(p.limit, 50, 200)).execute()) as Row[];
    return rows.map(snapshotOf);
  }

  /** One snapshot DECOMPOSED: the result (dimensions, reasons, sensitivity), every component row, the changes it raised, the peer's absence. */
  async snapshot(cap: ExecutiveReads, id: string, correlationId: string): Promise<Row> {
    const r = (await cap.readHealthSnapshots().selectAll().where('snapshot_id' as never, '=', id as never).executeTakeFirst()) as Row | undefined;
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no such health score snapshot in this domain'), 404);
    const components = (await cap.readHealthComponents().selectAll().where('snapshot_id' as never, '=', id as never).execute()) as Row[];
    const order = new Map<string, number>(((r['result'] as Row | null)?.['components'] as Row[] | undefined ?? []).map((c, i) => [String(c['key']), i]));
    components.sort((a, b) => (order.get(String(a['component_key'])) ?? 0) - (order.get(String(b['component_key'])) ?? 0));
    const changes = (await cap.readHealthChanges().selectAll().where('snapshot_id' as never, '=', id as never).orderBy('subject' as never, 'asc').execute()) as Row[];
    return {
      ...snapshotOf(r), result: r['result'], inputs: r['inputs'],
      components: components.map((c) => ({
        key: c['component_key'], dimension: c['dimension_key'], label: c['label'], input_kind: c['input_kind'], input_id: c['input_id'], input_version: c['input_version'] ?? null,
        value: num(c['value']), unit: c['unit'] ?? null, direction: c['direction'], normalised: num(c['normalised']), weight: num(c['weight']), contribution: num(c['contribution']),
        evidence: c['evidence'], confidence: num(c['confidence']), low_confidence: c['low_confidence'], trend: num(c['trend']), observed_at: iso(c['observed_at']),
        freshness_days: num(c['freshness_days']), stale_after_days: num(c['stale_after_days']), state: c['state'], stale: c['stale'], missing: c['missing'], reason: c['reason'] ?? null,
        critical: c['critical'], critical_failure: c['critical_failure'], sensitivity: c['sensitivity'], decision_links: c['decision_links'], lineage: c['lineage'],
      })),
      changes: changes.map(changeOf),
      peer: PEER_ABSENT,
    };
  }

  /** The score changes, newest first, with their log. */
  async changes(cap: ExecutiveReads, p: { state?: unknown; snapshotId?: unknown; limit?: unknown }): Promise<Row[]> {
    let q = cap.readHealthChanges().selectAll();
    if (typeof p.state === 'string' && (CHANGE_STATES as readonly string[]).includes(p.state)) q = q.where('state' as never, '=', p.state as never);
    if (typeof p.snapshotId === 'string' && UUID.test(p.snapshotId)) q = q.where('snapshot_id' as never, '=', p.snapshotId as never);
    const rows = (await q.orderBy('raised_at' as never, 'desc').limit(limitOf(p.limit, 100, 500)).execute()) as Row[];
    if (rows.length === 0) return [];
    const events = (await cap.readHealthChangeEvents().selectAll().where('change_id' as never, 'in', rows.map((r) => r['change_id']) as never).orderBy('occurred_at' as never, 'asc').execute()) as Row[];
    return rows.map((r) => ({ ...changeOf(r), events: events.filter((e) => e['change_id'] === r['change_id'])
      .map((e) => ({ event: e['event'], actor: e['actor_principal_id'], details: e['details'], occurred_at: iso(e['occurred_at']) })) }));
  }

  /**
   * COMPARISON to a BASELINE (V00-T-099): the snapshot against the baseline named (default: the first current snapshot of the same
   * definition). REFUSED (409) across definitions or formula versions — scores under different models are not comparable (PR-43-005);
   * a subject indeterminate on either side is WITHHELD with its reason, never compared; a partial side qualifies the comparison. The
   * peer comparison is declared absent.
   */
  async compare(cap: ExecutiveReads, p: { snapshotId?: unknown; baselineId?: unknown }, correlationId: string): Promise<Row> {
    if (typeof p.snapshotId !== 'string' || !UUID.test(p.snapshotId)) bad(correlationId, 'payload.snapshot_id names the snapshot compared');
    if (p.baselineId !== undefined && p.baselineId !== null && (typeof p.baselineId !== 'string' || !UUID.test(p.baselineId))) bad(correlationId, 'payload.baseline_id names the baseline snapshot (or is omitted: the first current snapshot of the same definition)');
    const read = async (id: string, what: string): Promise<Row> => {
      const r = (await cap.readHealthSnapshots().selectAll().where('snapshot_id' as never, '=', id as never).executeTakeFirst()) as Row | undefined;
      if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `health comparison rejected: no such ${what} snapshot in this domain`), 404);
      return r;
    };
    const a = await read(p.snapshotId as string, 'compared');
    let b: Row | undefined;
    if (typeof p.baselineId === 'string') b = await read(p.baselineId, 'baseline');
    else {
      b = (await cap.readHealthSnapshots().selectAll().where('definition_id' as never, '=', a['definition_id'] as never).where('kind' as never, '=', 'current' as never)
        .orderBy('at' as never, 'asc').limit(1).executeTakeFirst()) as Row | undefined;
      if (b === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'health comparison rejected: the definition has no current snapshot to serve as the baseline'), 404);
    }
    if (a['definition_id'] !== b['definition_id']) {
      throw new HttpException(errorBody('EYE_STA_002', correlationId, `health comparison rejected (definition): the snapshot was computed under definition version ${String(a['definition_version'])}, the baseline under version ${String(b['definition_version'])}; scores under different definitions are not compared`), 409);
    }
    if (a['formula_version'] !== b['formula_version']) {
      throw new HttpException(errorBody('EYE_STA_002', correlationId, `health comparison rejected (formula): formula ${String(a['formula_version'])} against ${String(b['formula_version'])}; scores under different formulas are not compared`), 409);
    }
    const ra = (a['result'] ?? {}) as Row; const rb = (b['result'] ?? {}) as Row;
    const side = (label: string, x: unknown, y: unknown, sx: unknown, sy: unknown): Row => {
      const to = num(x); const from = num(y);
      if (to === null || from === null) return { subject: label, from, to, delta: null, withheld: `${from === null ? 'the baseline' : 'the snapshot'} is indeterminate here — not compared` };
      return { subject: label, from, to, delta: Math.round((to - from) * 100) / 100, qualified: sx !== 'complete' || sy !== 'complete' ? `partial on ${sx !== 'complete' ? 'the snapshot' : 'the baseline'} — coverage below 1 or a critical failure; read the decomposition` : null };
    };
    const dimsA = (ra['dimensions'] as Row[] | undefined) ?? []; const dimsB = (rb['dimensions'] as Row[] | undefined) ?? [];
    return {
      snapshot: snapshotOf(a), baseline: snapshotOf(b), same_definition: true, definition_version: a['definition_version'], formula_version: a['formula_version'],
      aggregate: side('aggregate', a['status'] === 'indeterminate' ? null : a['aggregate'], b['status'] === 'indeterminate' ? null : b['aggregate'], a['status'], b['status']),
      dimensions: dimsA.map((d) => {
        const o = dimsB.find((x) => x['key'] === d['key']);
        return { key: d['key'], label: d['label'], ...side(`dimension:${String(d['key'])}`, d['value'], o?.['value'] ?? null, d['status'], o?.['status']), from_band: o?.['band'] ?? null, to_band: d['band'] ?? null };
      }),
      peer: PEER_ABSENT,
    };
  }
}
