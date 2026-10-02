/**
 * CP-6 B34 client — THE COMMITMENT TRACKER AND THE GOVERNED EXECUTION HANDOFF (migration 0090 §C; F-P6-05; CAP-EO-08, V03-T-372, FEX-18,
 * OBJ-37, V02-T-117).
 *
 * Everything here is the SERVER's: the tracker's severity is C3 only for a transparent reason the server names (overdue, an undisposed
 * residual) — no opaque score; the residual is the server's per-line arithmetic; the timeline's lanes are the server's. The page words
 * them. Execution leaves the product only as a governed HANDOFF — drafted by an item's owner, ISSUED (C3, human-gated) by a holder of
 * execution_authority who is neither the drafter nor the decision's committer — to a SYNTHETIC target (a real ERP is an owner decision).
 * The forms are shown to everyone; the server decides who may, and its refusal is shown as it states it.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };
type Row = Record<string, unknown>;

export const ITEM_KINDS = ['obligation', 'milestone', 'deliverable', 'handoff'] as const;
export const ITEM_STATES = ['open', 'in_progress', 'exception', 'retask_required', 'done', 'waived', 'cancelled'] as const;
export const EXCEPTION_KINDS = ['deadline_missed', 'blocked', 'partial_effect', 'objective_changed', 'scope_change'] as const;
export const HANDOFF_STATES = ['drafted', 'issuing', 'effected', 'partially_effected', 'failed', 'reconciled'] as const;
export const COMPENSATION_KINDS = ['reissue_residual', 'cancel_effected', 'alternate_source', 'accept_residual'] as const;
export const TIMELINE_LANES = ['commitment', 'resource', 'operational', 'deviation', 'governance'] as const;

export interface TrackerItem {
  item_id: string; commitment_id: string; package_id: string; package_title: string; parent_item_id: string | null; kind: string; title: string; owner: string; reviewer: string | null;
  reviewer_basis: string; due_at: string; state: string; overdue: boolean; open_exceptions: number; residual: Array<{ handoff_id: string; line_key: string; residual: number; compensation: Row | null }> | null;
  severity: 'C2' | 'C3' | string; reasons: string[]; objectives: string[]; resources: string[]; version: number;
}
export interface Handoff {
  handoff_id: string; item_id: string; role: string; state: string; failure_class: string | null; attempts: Array<Row>; effects: Array<Row>; residual: Array<{ line_key: string; residual: number }>;
  compensations: Array<Row>; payload_digest: string; lines: Array<Row>; target: Row | null; next_attempt_at: string | null; drafted_by: string; issued_by: string | null;
}
export interface CommitmentDetail {
  commitment: Row; items: Row[]; exceptions: Row[]; closures: Row[]; blockers: string | null; timeline: Array<{ at: string; lane: string; kind: string; item_id: string | null; ref: string; actor: string; details: Row }>;
  handoffs: Handoff[];
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/commitments`;
/** The commitment routes are made under the purpose `decision`; the envelope says C2 like every write — the ISSUE's route pins C3 (the commit's idiom). */
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'decision', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const commitments = {
  tracker: (s: Scope, at: string | null = null) => p<{ tracker: { at: string; items: TrackerItem[]; summary: Record<string, number> }; receipt: Receipt }>(s, '/tracker', 'decision.commitment.read', 'CMI', at === null ? {} : { at }),
  get: (s: Scope, id: string) => p<{ commitment: CommitmentDetail; receipt: Receipt }>(s, `/${id}/get`, 'decision.commitment.read', 'CMT', {}, id),
  targets: (s: Scope) => p<{ targets: Row[]; receipt: Receipt }>(s, '/targets/list', 'decision.commitment.read', 'EXT'),
  declareItem: (s: Scope, commitmentId: string, item: { kind: string; title: string; owner: string; reviewer?: string; dueAt: string; resourceIds?: string[] }) =>
    p<{ item: Row; receipt: Receipt }>(s, `/${commitmentId}/items`, 'decision.commitment.item.declare', 'CMT', item, commitmentId),
  accept: (s: Scope, itemId: string, note: string) => p<{ item: Row; receipt: Receipt }>(s, `/items/${itemId}/accept`, 'decision.commitment.item.accept', 'CMI', { note: note.trim() }, itemId),
  complete: (s: Scope, itemId: string, evidence: string) => p<{ item: Row; receipt: Receipt }>(s, `/items/${itemId}/complete`, 'decision.commitment.item.complete', 'CMI', { evidence: evidence.trim() }, itemId),
  raise: (s: Scope, itemId: string, kind: 'blocked' | 'scope_change', detail: string) =>
    p<{ exception: Row; receipt: Receipt }>(s, `/items/${itemId}/exceptions`, 'decision.commitment.exception.raise', 'CMI', { kind, detail: detail.trim() }, itemId),
  /** resolve | propose_extension | propose_waiver (the owner) · cosign | reject (the REVIEWER, never the proposer). */
  decide: (s: Scope, exceptionId: string, act: string, note: string, newDueAt: string | null = null) =>
    p<{ exception: Row; receipt: Receipt }>(s, `/exceptions/${exceptionId}/decide`, 'decision.commitment.exception.decide', 'CMX', newDueAt === null ? { act, note: note.trim() } : { act, note: note.trim(), newDueAt }, exceptionId),
  draft: (s: Scope, itemId: string, targetKey: string, lines: Row[], compensationId: string | null = null) =>
    p<{ handoff: Row; receipt: Receipt }>(s, `/items/${itemId}/handoffs`, 'decision.execution.draft', 'EXH', compensationId === null ? { targetKey, lines } : { targetKey, lines, compensationId }),
  /** C3, human-gated: execution_authority; the digest of the draft read. */
  issue: (s: Scope, handoffId: string, payloadDigest: string) => p<{ handoff: Row; receipt: Receipt }>(s, `/handoffs/${handoffId}/issue`, 'decision.execution.issue', 'EXH', { payloadDigest }, handoffId),
  compensate: (s: Scope, handoffId: string, c: { kind: string; owner: string; dueAt: string; note: string }) =>
    p<{ compensation: Row; receipt: Receipt }>(s, `/handoffs/${handoffId}/compensations`, 'decision.execution.compensation.assign', 'EXH', c, handoffId),
  cosignCompensation: (s: Scope, compensationId: string, note: string) =>
    p<{ compensation: Row; receipt: Receipt }>(s, `/compensations/${compensationId}/cosign`, 'decision.execution.compensation.cosign', 'EXC', { note: note.trim() }, compensationId),
  reconcile: (s: Scope, handoffId: string) => p<{ handoff: Row; receipt: Receipt }>(s, `/handoffs/${handoffId}/reconcile`, 'decision.execution.reconcile', 'EXH', {}, handoffId),
  proposeClosure: (s: Scope, commitmentId: string, deliverables: Array<{ title: string; evidence: string }>, statement: string) =>
    p<{ closure: Row; receipt: Receipt }>(s, `/${commitmentId}/closure`, 'decision.commitment.closure.propose', 'CMT', { deliverables, statement: statement.trim() }, commitmentId),
  cosignClosure: (s: Scope, closureId: string, commitmentId: string) =>
    p<{ closure: Row; receipt: Receipt }>(s, `/closures/${closureId}/cosign`, 'decision.commitment.close', 'CMT', { commitmentId }, commitmentId),
};

// ───────────────────────── the words (pure; tested in commitments.test.ts) ─────────────────────────

/** An item's severity with the server's REASONS — never a bare colour: C3 names why. */
export function severityMark(item: Pick<TrackerItem, 'severity' | 'reasons'>): { glyph: string; token: string; text: string } {
  if (item.severity === 'C3') return { glyph: '▲', token: '--eye-color-critical', text: `C3 — ${item.reasons.filter((r) => r === 'overdue' || r === 'undisposed_residual').join(', ') || 'stated by the server'}` };
  return { glyph: '●', token: '--eye-color-ink-muted', text: item.reasons.length > 0 ? `C2 — ${item.reasons.join(', ')}` : 'C2' };
}

/** A state, three channels (glyph, uppercase word, colour token). */
export function stateMark(state: string): { glyph: string; token: string; text: string } {
  const m: Record<string, { glyph: string; token: string }> = {
    open: { glyph: '○', token: '--eye-color-ink-muted' }, in_progress: { glyph: '◐', token: '--eye-color-accent-default' }, exception: { glyph: '⚑', token: '--eye-color-warning' },
    retask_required: { glyph: '↻', token: '--eye-color-warning' }, done: { glyph: '●', token: '--eye-color-success' }, waived: { glyph: '↩', token: '--eye-color-ink-muted' },
    cancelled: { glyph: '✕', token: '--eye-color-ink-muted' }, drafted: { glyph: '✎', token: '--eye-color-ink-muted' }, issuing: { glyph: '⇢', token: '--eye-color-accent-default' },
    effected: { glyph: '●', token: '--eye-color-success' }, partially_effected: { glyph: '◑', token: '--eye-color-critical' }, failed: { glyph: '✕', token: '--eye-color-critical' },
    reconciled: { glyph: '✓', token: '--eye-color-success' },
  };
  const s = m[state] ?? { glyph: '?', token: '--eye-color-ink-muted' };
  return { ...s, text: state === 'partially_effected' ? 'PARTIALLY EFFECTED — RESIDUAL' : state === 'retask_required' ? 'RE-TASK REQUIRED — OBJECTIVE CHANGED' : state.replace(/_/g, ' ').toUpperCase() };
}

/** The residual in words, with its compensation owner when one is named (FEX-18: "completed and residual effects, owners, compensation"). */
export function residualWords(r: Array<{ line_key: string; residual: number; compensation?: Row | null }> | null | undefined): string {
  if (r === null || r === undefined || r.length === 0) return 'no residual';
  return r.map((x) => {
    const c = x.compensation ?? null;
    // the compensation row names its owner owner_principal_id (the get route); `owner` is the assign route's answer
    const owner = c === null ? null : (c['owner'] ?? c['owner_principal_id'] ?? null);
    return `${x.line_key}: ${x.residual} outstanding${c === null ? ' — no compensation owner yet' : ` — ${String(c['kind'])} by ${owner === null ? 'an unnamed owner' : `${String(owner).slice(0, 8)}…`} (${String(c['state'])})`}`;
  }).join('; ');
}

/** An effect line: requested, effected and what is left. */
export function effectWords(e: Row): string {
  const req = Number(e['requested_quantity']); const eff = Number(e['effected_quantity']);
  return `${String(e['line_key'])}: ${eff} of ${req} effected${eff < req ? ` (${req - eff} residual)` : ''} — ${String(e['status'])}`;
}

/** The timeline grouped by the server's five lanes, in the lanes' order; each lane's rows in time order. */
export function byLane<T extends { lane: string; at: string }>(rows: T[]): Array<{ lane: string; rows: T[] }> {
  return TIMELINE_LANES.map((lane) => ({ lane, rows: rows.filter((r) => r.lane === lane).sort((a, b) => a.at.localeCompare(b.at)) }));
}

/** An attempt in words — an unbound receipt is evidence, never an effect. */
export function attemptWords(a: Row): string {
  const o = String(a['outcome']);
  const why: Record<string, string> = { unbound: 'the receipt named another handoff or attempt — kept as evidence, not an effect', transport: 'no receipt — retried with backoff', denied: 'the target refused the requester',
    invalid_receipt: 'the answer was not a receipt', target_retired: 'the target is retired', effected: 'every line effected', partial: 'part of the lines effected', rejected: 'no line effected' };
  return `attempt ${String(a['attempt'])}${a['by_tick'] === true ? ' (the tick)' : ''}: ${o}${a['http_status'] === null || a['http_status'] === undefined ? '' : ` (HTTP ${String(a['http_status'])})`} — ${why[o] ?? o}${transportWords(a['transport'])}`;
}

/** B34-F2 (0091): the path that carried an attempt, as the server recorded it — nothing for an attempt recorded before it or never transported. */
export function transportWords(t: unknown): string {
  if (t === 'synthetic-loopback') return ' · via the SYNTHETIC loopback path (the deployment switch on; a synthetic target, no real ERP)';
  if (t === 'production') return ' · via the production egress (vetted)';
  return '';
}

/** The deliverables parsed from the closure form's lines ("title — evidence"); a line without evidence is refused here and by the server. */
export function parseDeliverables(text: string): { ok: true; deliverables: Array<{ title: string; evidence: string }> } | { ok: false; error: string } {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  if (lines.length === 0) return { ok: false, error: 'name at least one deliverable: "title — evidence"' };
  const out: Array<{ title: string; evidence: string }> = [];
  for (const l of lines) {
    const i = l.indexOf('—');
    const title = (i < 0 ? l : l.slice(0, i)).trim(); const evidence = (i < 0 ? '' : l.slice(i + 1)).trim();
    if (title.length < 2 || evidence.length < 8) return { ok: false, error: `"${l}": each deliverable is "title — evidence" (evidence 8+ characters)` };
    out.push({ title, evidence });
  }
  return { ok: true, deliverables: out };
}
