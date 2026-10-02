/**
 * CP-6 B32 client — THE DECOMPOSABLE STRATEGIC HEALTH SCORE (migration 0089 §H; F-P6-08; VIZ-12 "gauge without decomposition" is the
 * anti-pattern).
 *
 * The score is the SERVER's: computed in the database from the health input contract under a definition one person proposed and
 * another approved; every component carries its evidence, confidence, trend, freshness, contribution and sensitivity; a stale, missing or
 * inconsistent input is excluded AND declared; a dimension below the coverage floor is INDETERMINATE and has no number, and so has the
 * aggregate when any dimension is. The page shows status and coverage BEFORE any number, and no number where the server recorded none.
 *
 * The one computation here is the ALTERNATIVE-WEIGHT VIEW (C-034: "alternative-weight view"; UX-43-003: "adjust an authorized view,
 * simulate sensitivity") — `whatIf` recomposes ONE dimension from the components the server recorded, with weights the viewer types, by
 * the server's own rule (the weight-renormalised mean over the included components, indeterminate below the coverage floor). It is a
 * VIEW: nothing is recorded, nothing is a score; a new weight becomes real only as a new definition version two people approve.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

export const INPUT_KINDS = ['indicator', 'measure', 'risk', 'opportunity', /* B36 (0094 §S2) */ 'capability', 'execution', 'outcome', 'quality'] as const;
/* B36 (0094 §S) strategy: the score completed — the vocabularies of the exceptions and the signature kind. */
export const EXCEPTION_KINDS = ['exclude', 'relax_bound'] as const;
export const EXCEPTION_STATES = ['requested', 'approved', 'refused'] as const;
export const EXCEPTION_APPROVER_ROLES = ['executive', 'domain_admin', 'platform_admin'] as const;
export const SNAPSHOT_APPROVER_ROLES = ['executive', 'platform_admin'] as const;
/* end B36 strategy */
export const SNAPSHOT_STATUSES = ['complete', 'partial', 'indeterminate'] as const;
export const COMPONENT_STATES = ['included', 'stale', 'missing', 'inconsistent'] as const;
export const CHANGE_STATES = ['raised', 'acknowledged', 'challenged', 'upheld', 'dismissed', 'withdrawn'] as const;
export const CHALLENGE_KINDS = ['input', 'weight', 'threshold', 'formula', 'interpretation'] as const;
/** The roles the server admits (the PDP rules of 0089 §H — the server decides; the page only says who may). */
export const PROPOSER_ROLES = ['executive', 'domain_admin', 'strategy_owner', 'platform_admin'] as const;
export const APPROVER_ROLES = ['executive', 'domain_admin', 'platform_admin'] as const;

export interface Band { key: string; min: number }
export interface Sensitivity { key?: string; weight_plus_10pct: number | null; weight_minus_10pct: number | null; swing: number | null; if_0: number | null; if_100: number | null }
export interface DecisionLink { decision_id: string; title: string; via_objective: string }
export interface HealthComponent {
  key: string; dimension: string; label: string; input_kind: string; input_id: string; input_version?: number | null; value: number | null; unit?: string | null; direction: string;
  normalised: number | null; weight: number; contribution: number | null; evidence: Array<{ object_id: string; version: number }>; confidence: number | null; confidence_basis?: string;
  low_confidence: boolean; trend: number | { prior_normalised: number; delta: number } | null; observed_at: string | null; freshness_days: number | null; stale_after_days: number | null;
  state: (typeof COMPONENT_STATES)[number] | string; stale: boolean; missing: boolean; reason: string | null; critical: boolean; critical_failure: boolean;
  sensitivity: Sensitivity | null; decision_links: DecisionLink[]; lineage: Record<string, unknown>;
}
export interface HealthDimension {
  key: string; label: string; weight: number; objective_ids: string[]; bands: Band[]; value: number | null; coverage: number; status: string; band: string | null; band_basis: string;
  critical_failures: string[]; low_confidence: string[]; reasons: string[]; components: string[]; bounds: { if_excluded_at_0: number | null; if_excluded_at_100: number | null };
  trend: { prior_value: number; delta: number } | null; decision_links?: DecisionLink[];
}
export interface HealthResult {
  formula_version: string; at: string; status: string; aggregate: number | null; coverage: number; rule: string; min_coverage: number; min_confidence: number | null;
  counts: Record<string, number>; reasons: string[]; aggregate_trend: { prior_value: number; delta: number } | null; aggregate_sensitivity: Sensitivity[] | null;
  dimensions: HealthDimension[]; components: HealthComponent[]; peer: { peer: null; reason: string };
}
export interface HealthChange {
  change_id: string; snapshot_id: string; prior_snapshot_id: string; definition_version: number; definition_approved_by: string; subject: string; subject_label: string;
  from_value: number | null; to_value: number | null; delta: number | null; from_band: string | null; to_band: string | null; triggers: string[]; direction: string;
  gaming_flags: Array<{ flag: string; detail?: string; component?: string; band?: string; floor?: number; value?: number; from_value?: number | null; to_value?: number; edit_id?: string; owner?: string; edited_at?: string; window_days?: number }>;
  /* B36 (0094 §S1): the anti-gaming measure on the change itself */
  owner_edit_flag?: boolean; owner_edit_ids?: string[];
  state: (typeof CHANGE_STATES)[number] | string; raised_at: string | null; acknowledged_by: string | null; acknowledged_at: string | null; challenge_kind: string | null; challenge_statement: string | null;
  challenged_by: string | null; decided_by: string | null; decision_note: string | null; withdrawal_reason: string | null; authorizes_action: false; what_follows?: string;
  events?: Array<{ event: string; actor: string; occurred_at: string | null; details: Record<string, unknown> }>;
}
export interface HealthSnapshot {
  snapshot_id: string; definition_id: string; definition_version: number; formula_version: string; model_digest: string; at: string | null; computed_at: string | null; kind: 'current' | 'as_of' | string;
  prior_snapshot_id: string | null; replay_of: string | null; reproduced: boolean | null; status: string; aggregate: number | null; coverage: number | null; inputs_digest: string; result_digest: string;
  computed_by?: string; result?: HealthResult; components?: HealthComponent[]; changes?: HealthChange[]; inputs?: Array<Record<string, unknown>>; peer?: { peer: null; reason: string };
}
export interface HealthDefinition {
  definition_id: string; version: number; state: string; model: Record<string, unknown>; model_digest: string; formula_version: string; changed_sections: string[]; reason: string;
  basis_version: number | null; gaming_review_required: boolean; gaming_reasons: Array<Record<string, unknown>>; proposed_by: string; proposed_at: string | null; approved_by: string | null;
  approved_at: string | null; approval_note: string | null; gaming_review_note: string | null; supersedes: number | null; refused_by: string | null; refusal_reason: string | null; superseded_at: string | null;
}
export interface Comparison {
  snapshot: HealthSnapshot; baseline: HealthSnapshot; definition_version: number; formula_version: string;
  aggregate: { from: number | null; to: number | null; delta: number | null; withheld?: string; qualified?: string | null };
  dimensions: Array<{ key: string; label: string; from: number | null; to: number | null; delta: number | null; withheld?: string; qualified?: string | null; from_band: string | null; to_band: string | null }>;
  peer: { peer: null; reason: string };
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
/** The health routes are made under the purpose `executive` (the attention governance's idiom). */
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'executive', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const health = {
  definitions: (s: Scope) => p<{ definitions: HealthDefinition[]; active: HealthDefinition | null; pending: HealthDefinition | null; receipt: Receipt }>(s, '/executive/health/definitions/list', 'executive.health.read', 'HSD', { limit: 50 }),
  /** Human-gated; the model validated whole by the server; awaits a SECOND person. */
  propose: (s: Scope, model: Record<string, unknown>, reason: string) =>
    p<{ definition: HealthDefinition; receipt: Receipt }>(s, '/executive/health/definitions/propose', 'executive.health.definition.propose', 'HSD', { model, reason: reason.trim() }),
  /** Human-gated; never the proposer; the anti-gaming review where the proposal is flagged. */
  approve: (s: Scope, id: string, note: string, gamingReview: string) =>
    p<{ definition: HealthDefinition; receipt: Receipt }>(s, `/executive/health/definitions/${id}/approve`, 'executive.health.definition.approve', 'HSD',
      gamingReview.trim() === '' ? { note: note.trim() } : { note: note.trim(), gaming_review: gamingReview.trim() }, id),
  refuse: (s: Scope, id: string, reason: string) =>
    p<{ definition: HealthDefinition; receipt: Receipt }>(s, `/executive/health/definitions/${id}/refuse`, 'executive.health.definition.approve', 'HSD', { reason: reason.trim() }, id),
  /** Now, or an earlier instant (an as_of replay that says whether it reproduces the snapshot recorded there). */
  compute: (s: Scope, at: string | null) => p<{ snapshot: HealthSnapshot & { result: HealthResult; changes: HealthChange[] }; receipt: Receipt }>(s, '/executive/health/compute', 'executive.health.compute', 'HSS', at === null ? {} : { at }),
  snapshots: (s: Scope, definitionId: string | null = null) => p<{ snapshots: HealthSnapshot[]; receipt: Receipt }>(s, '/executive/health/snapshots/list', 'executive.health.read', 'HSS', definitionId === null ? { limit: 50 } : { limit: 50, definitionId }),
  snapshot: (s: Scope, id: string) => p<{ snapshot: HealthSnapshot & { result: HealthResult; components: HealthComponent[]; changes: HealthChange[] }; receipt: Receipt }>(s, `/executive/health/snapshots/${id}/get`, 'executive.health.read', 'HSS', {}, id),
  /** Refused (409) across definitions or formula versions; the peer comparison declared absent. */
  compare: (s: Scope, snapshotId: string, baselineId: string | null) =>
    p<{ comparison: Comparison; receipt: Receipt }>(s, '/executive/health/compare', 'executive.health.read', 'HSS', baselineId === null || baselineId === '' ? { snapshot_id: snapshotId } : { snapshot_id: snapshotId, baseline_id: baselineId }, snapshotId),
  changes: (s: Scope, snapshotId: string | null = null) => p<{ changes: HealthChange[]; receipt: Receipt }>(s, '/executive/health/changes/list', 'executive.health.read', 'HSC', snapshotId === null ? { limit: 100 } : { limit: 100, snapshotId }),
  acknowledge: (s: Scope, id: string, note: string) =>
    p<{ change: HealthChange; receipt: Receipt }>(s, `/executive/health/changes/${id}/acknowledge`, 'executive.health.change.acknowledge', 'HSC', note.trim() === '' ? {} : { note: note.trim() }, id),
  challenge: (s: Scope, id: string, kind: string, statement: string) =>
    p<{ change: HealthChange; receipt: Receipt }>(s, `/executive/health/changes/${id}/challenge`, 'executive.health.change.challenge', 'HSC', { kind, statement: statement.trim() }, id),
  withdraw: (s: Scope, id: string, reason: string) =>
    p<{ change: HealthChange; receipt: Receipt }>(s, `/executive/health/changes/${id}/withdraw`, 'executive.health.change.challenge', 'HSC', { reason: reason.trim() }, id),
  /** Human-gated; neither the challenger nor the definition's approver. */
  decide: (s: Scope, id: string, decision: 'upheld' | 'dismissed', note: string) =>
    p<{ change: HealthChange; receipt: Receipt }>(s, `/executive/health/changes/${id}/decide`, 'executive.health.change.decide', 'HSC', { decision, note: note.trim() }, id),
};

// ───────────────────────── the words and the view (pure; tested in health.test.ts) ─────────────────────────

/** A score's status, three channels: glyph, uppercase word, colour token — INDETERMINATE says there is no number. */
export function statusMark(status: string): { glyph: string; token: string; text: string } {
  switch (status) {
    case 'complete': return { glyph: '●', token: '--eye-color-success', text: 'COMPLETE' };
    case 'partial': return { glyph: '◐', token: '--eye-color-warning', text: 'PARTIAL — READ THE DECOMPOSITION' };
    case 'indeterminate': return { glyph: '○', token: '--eye-color-uncertain', text: 'INDETERMINATE — NO SCORE' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: status.toUpperCase() };
  }
}

/** A score in words: its value (one decimal), or the explicit absence of one — never a number for an indeterminate score. */
export function scoreWords(value: number | null | undefined, status: string): string {
  if (status === 'indeterminate' || value === null || value === undefined) return 'no score (indeterminate)';
  return value.toFixed(1);
}

/** Coverage as a percentage of the included weight. */
export function coverageWords(coverage: number | null | undefined): string {
  return typeof coverage === 'number' ? `${Math.round(coverage * 1000) / 10} % of the weight covered` : 'coverage not recorded';
}

/** A component's freshness badge: "9 d stale", "missing", "inconsistent", or its age when current. */
export function freshnessBadge(c: Pick<HealthComponent, 'state' | 'freshness_days' | 'stale_after_days'>): { text: string; token: string } {
  const days = typeof c.freshness_days === 'number' ? Math.floor(c.freshness_days) : null;
  switch (c.state) {
    case 'stale': return { text: `${days ?? '?'} d stale (bound ${c.stale_after_days ?? '?'} d)`, token: '--eye-color-warning' };
    case 'missing': return { text: 'missing', token: '--eye-color-critical' };
    case 'inconsistent': return { text: 'inconsistent', token: '--eye-color-critical' };
    default: return { text: days === null ? 'current' : `${days} d old`, token: '--eye-color-ink-muted' };
  }
}

/** The trend in words: the change of a component's score (or a dimension's value) since the prior snapshot. */
export function trendWords(t: number | { delta: number } | null | undefined): string {
  const d = typeof t === 'number' ? t : t === null || t === undefined ? null : t.delta;
  if (d === null) return 'no prior';
  if (d === 0) return '→ 0';
  return `${d > 0 ? '↑ +' : '↓ '}${Math.round(d * 100) / 100}`;
}

/** The sensitivity in words: the dimension at ±10 % weight, and at a score of 0 and of 100 (for an excluded input: the missing-data analysis). */
export function sensitivityWords(s: Sensitivity | null | undefined): string {
  if (s === null || s === undefined) return 'not recorded';
  const n = (v: number | null) => (v === null ? '—' : String(Math.round(v * 100) / 100));
  return `±10 % weight: ${n(s.weight_minus_10pct)}–${n(s.weight_plus_10pct)} (swing ${n(s.swing)}); at 0: ${n(s.if_0)}, at 100: ${n(s.if_100)}`;
}

/** A change's state, three channels. */
export function changeMark(state: string): { glyph: string; token: string; text: string } {
  const m: Record<string, { glyph: string; token: string }> = {
    raised: { glyph: '⚑', token: '--eye-color-warning' }, acknowledged: { glyph: '✓', token: '--eye-color-ink-muted' }, challenged: { glyph: '?', token: '--eye-color-uncertain' },
    upheld: { glyph: '✕', token: '--eye-color-critical' }, dismissed: { glyph: '●', token: '--eye-color-success' }, withdrawn: { glyph: '↩', token: '--eye-color-ink-muted' },
  };
  const s = m[state] ?? { glyph: '?', token: '--eye-color-ink-muted' };
  return { ...s, text: state === 'upheld' ? 'UPHELD — CHALLENGE STANDS' : state.toUpperCase() };
}

/** An anti-gaming flag in words (shown; it gates nothing). */
export function gamingFlagWords(f: HealthChange['gaming_flags'][number]): string {
  if (f.flag === 'restated_input') return `restated input: ${f.component ?? '?'} ${String(f.from_value ?? '?')} → ${String(f.to_value ?? '?')} for the same observation, before a favourable change`;
  if (f.flag === 'on_threshold') return `sits on a threshold: ${String(f.value ?? '?')} is within a point of the ${f.band ?? '?'} floor ${String(f.floor ?? '?')}`;
  /* B36 (0094 §S1): the owner-edit flag — the owner restated the input inside the window before a favourable change */
  if (f.flag === 'owner_edit') return `owner edit: ${f.component ?? '?'} restated ${String(f.from_value ?? 'none')} → ${String(f.to_value ?? '?')} by its owner inside the ${String(f.window_days ?? '?')}-day window before this favourable change`;
  return f.detail ?? f.flag;
}

/** Where a value falls on the 0–100 bar: its percentage (clamped) — null draws no bar. */
export function barPercent(value: number | null | undefined): number | null {
  return typeof value === 'number' ? Math.max(0, Math.min(100, value)) : null;
}

/**
 * THE ALTERNATIVE-WEIGHT VIEW of one dimension (a VIEW, never a score): the components the server recorded, with the weights the
 * viewer typed (the others as recorded), recomposed by the server's rule — the weight-renormalised mean over the INCLUDED components,
 * null below the coverage floor. A typed weight is taken as given; the coverage is the included share of the typed total. The same
 * rule for every input kind: the component's score (normalised) already carries its direction.
 */
export function whatIf(components: Array<Pick<HealthComponent, 'key' | 'state' | 'normalised' | 'weight'>>, weights: Record<string, number>, minCoverage: number):
  { value: number | null; coverage: number; total: number } {
  let total = 0; let covered = 0; let sum = 0;
  for (const c of components) {
    const w = typeof weights[c.key] === 'number' && Number.isFinite(weights[c.key]) && (weights[c.key] as number) >= 0 ? (weights[c.key] as number) : c.weight;
    total += w;
    if (c.state === 'included' && typeof c.normalised === 'number') { covered += w; sum += w * c.normalised; }
  }
  const coverage = total > 0 ? covered / total : 0;
  const value = covered > 0 && coverage >= minCoverage ? Math.round((sum / covered) * 100) / 100 : null;
  return { value, coverage: Math.round(coverage * 10000) / 10000, total: Math.round(total * 10000) / 10000 };
}

/** A proposal's model parsed from the editor's text (the server validates it whole; this only says whether it is an object). */
export function parseModel(text: string): { ok: true; model: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const v = JSON.parse(text) as unknown;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'the model is a JSON object {dimensions, components, min_coverage, change_points, min_confidence?}' };
    return { ok: true, model: v as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ───────────────────────── B36 (0094 §S) strategy: the score completed — the contract with owners, the exceptions, the signed approval ───────────────────────── */
export interface HealthInputEdit { edit_id: string; editor: string; from_value: number | null; to_value: number; reason: string; edited_at: string | null }
export interface HealthInput {
  input_id: string; definition_id: string; component_key: string; input_kind: string; input_ref: string; owner_principal_id: string | null; owner_basis: string;
  value: number | null; unit: string | null; as_of: string | null; digest: string; owner_stated: boolean; edits: number; last_edit_id: string | null; refreshed_at: string | null; history: HealthInputEdit[];
}
export interface OwnerEditAnalysis {
  definition_id: string | null; definition_version: number | null; window_days: number | null; rule?: string;
  owners: Array<{ owner: string; edits: number; flagged_edits: number; components: string[]; last_edit_at: string | null; flags: Array<{ edit_id: string; component_key: string; change_id: string; subject: string }> }>;
  totals: { edits: number; flagged_edits: number };
}
/** §0's executive context of the reader (null when none was set: the whole domain, horizon 90d, effective now). */
export interface ExecutiveContext { context_id: string; objective_id: string | null; horizon: string; scenario_id: string | null; classification: string; effective_at: string | null; set_at: string | null; digest: string }
export interface HealthContract { definition_id: string | null; inputs: HealthInput[]; owner_edits: OwnerEditAnalysis; context: ExecutiveContext | null; note?: string }
export interface HealthException {
  exception_id: string; definition_id: string; component_key: string; kind: (typeof EXCEPTION_KINDS)[number] | string; relaxed_stale_after_days: number | null; reason: string; expires_at: string | null;
  state: (typeof EXCEPTION_STATES)[number] | string; requested_by: string; requested_at: string | null; approved_by: string | null; approved_at: string | null; approval_note: string | null;
  refused_by: string | null; refused_at: string | null; refusal_reason: string | null; in_force_now?: boolean;
}
export interface SignatureRow { signature_id: string; signer: string; key_id: string; algorithm: string; signature: string; subject_digest: string; bound_action: string; signed_at: string | null }
export interface ApprovalPreview {
  snapshot_id: string; kind: string; at: string | null; definition_version: number; formula_version: string; status: string; aggregate: number | null; coverage: number | null; result_digest: string; inputs_digest: string;
  acceptable: boolean; consequence: string; exceptions_in_force: Array<Record<string, unknown>>; owner_stated_inputs: Array<{ component_key: string; owner: string | null; edit_id: string | null; as_of: string | null }>;
  changes: Array<{ change_id: string; subject: string; direction: string; from_value: number | null; to_value: number | null; owner_edit_flag: boolean; owner_edit_ids: string[]; gaming_flags: HealthChange['gaming_flags'] }>;
  approvals: Array<{ approval_id: string; approved_by: string; approved_at: string | null; note: string }>; signatures: SignatureRow[];
}
export const healthCompletion = {
  contract: (s: Scope, definitionId: string | null = null) => p<{ contract: HealthContract; receipt: Receipt }>(s, '/executive/health/inputs/list', 'executive.health.read', 'HSD', definitionId === null ? {} : { definitionId }),
  /** THE OWNER-CORRECTION ROUTE (human-gated; the input's owner only — the server refuses anyone else). */
  setInput: (s: Scope, componentKey: string, value: number, reason: string) =>
    p<{ edit: Record<string, unknown>; receipt: Receipt }>(s, '/executive/health/inputs/set', 'executive.health.input.set', 'HSD', { component_key: componentKey, value, reason: reason.trim() }),
  ownerEdits: (s: Scope, definitionId: string | null = null) => p<{ analysis: OwnerEditAnalysis; receipt: Receipt }>(s, '/executive/health/owner-edits', 'executive.health.read', 'HSD', definitionId === null ? {} : { definitionId }),
  exceptions: (s: Scope) => p<{ exceptions: HealthException[]; receipt: Receipt }>(s, '/executive/health/exceptions/list', 'executive.health.read', 'HSX', { limit: 100 }),
  requestException: (s: Scope, a: { componentKey: string; kind: 'exclude' | 'relax_bound'; relaxedDays: number | null; reason: string; expiresAt: string }) =>
    p<{ exception: HealthException; receipt: Receipt }>(s, '/executive/health/exceptions/request', 'executive.health.exception.request', 'HSX',
      { component_key: a.componentKey, kind: a.kind, ...(a.relaxedDays === null ? {} : { relaxed_stale_after_days: a.relaxedDays }), reason: a.reason.trim(), expires_at: a.expiresAt }),
  /** Human-gated; the executive's authority; never the requester. */
  decideException: (s: Scope, id: string, decision: 'approve' | 'refuse', note: string) =>
    p<{ exception: HealthException; receipt: Receipt }>(s, `/executive/health/exceptions/${id}/approve`, 'executive.health.exception.approve', 'HSX', { decision, note: note.trim() }, id),
  approvalPreview: (s: Scope, snapshotId: string) => p<{ preview: ApprovalPreview; receipt: Receipt }>(s, `/executive/health/snapshots/${snapshotId}/approval-preview`, 'executive.health.read', 'HSS', {}, snapshotId),
  /** Human-gated; the executive accepts the digest PREVIEWED; signed beyond the audit chain in the same write. */
  approveSnapshot: (s: Scope, snapshotId: string, resultDigest: string, note: string) =>
    p<{ approval: Record<string, unknown> & { signature?: SignatureRow }; receipt: Receipt }>(s, `/executive/health/snapshots/${snapshotId}/approve`, 'executive.health.snapshot.approve', 'HSS', { result_digest: resultDigest, note: note.trim() }, snapshotId),
};

/** An input's owner and last edit, in words: "owner 1a2b3c4d… · last restated 2 edit(s), 91 → 93.5". */
export function ownerLine(i: Pick<HealthInput, 'owner_principal_id' | 'owner_basis' | 'edits' | 'history' | 'owner_stated'>): string {
  const who = i.owner_principal_id === null ? `no owner — ${i.owner_basis}` : `owner ${i.owner_principal_id.slice(0, 8)}… (${i.owner_basis})`;
  if (i.edits === 0 || i.history.length === 0) return `${who} · never restated`;
  const last = i.history[0]!;
  return `${who} · ${i.edits} edit(s), last ${last.from_value === null ? 'none' : last.from_value} → ${last.to_value}${i.owner_stated ? ' (the owner\'s statement is what the score reads)' : ''}`;
}
/** An exception in words: its kind, its standing and its window. */
export function exceptionLine(x: Pick<HealthException, 'kind' | 'relaxed_stale_after_days' | 'state' | 'expires_at' | 'in_force_now' | 'component_key'>): string {
  const what = x.kind === 'exclude' ? `${x.component_key} excluded` : `${x.component_key} bound relaxed to ${String(x.relaxed_stale_after_days ?? '?')} d`;
  const standing = x.state === 'approved' ? (x.in_force_now === false ? 'approved — expired' : 'APPROVED — in force') : x.state === 'refused' ? 'refused — no effect' : 'requested — no effect until approved';
  return `${what} · ${standing}${x.expires_at === null ? '' : ` · until ${x.expires_at}`}`;
}
/** The active context in words (§0): the objective, the horizon, the scenario, the classification ceiling, the effective instant. */
export function contextLine(c: ExecutiveContext | null): string {
  if (c === null) return 'no context set — the whole domain, horizon 90d, the reader\'s own classification ceiling, effective now';
  return `objective ${c.objective_id === null ? 'the whole domain' : `${c.objective_id.slice(0, 8)}…`} · horizon ${c.horizon} · scenario ${c.scenario_id === null ? 'none' : `${c.scenario_id.slice(0, 8)}…`} · ceiling ${c.classification} · effective ${c.effective_at ?? 'now'}`;
}
/** A signature in words — never "signed" without the key and the digest it binds. */
export function signatureLine(s: SignatureRow | null | undefined): string {
  if (s === null || s === undefined) return 'not signed';
  return `signed ${s.algorithm} with key ${s.key_id} over ${s.subject_digest.slice(0, 12)}… by ${s.signer.slice(0, 8)}… (${s.bound_action})`;
}
