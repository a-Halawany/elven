/**
 * The onboarding workspace client — CP-6 B94 §ON (0114_b94_x_on; CAP-DL-04/-05, CAP-PD-04/-05, UX-66-001/-002, JRN-01, PR-67-001/-002).
 *
 * Every response is returned VERBATIM (the programme with its versions, the steps, the sponsor intent, the draft domain, the baselines with
 * their signatures, the drift and the rollback plan, the ledger). The helpers below only WORD what the record says: states visibly distinct
 * (a PROPOSED baseline never looks like an APPROVED one), a DATE is the day it names, a digest is shown exactly (shortened only with its full
 * text available), freshness is the age of the server's read, and an approval control states who may approve and why not. Nothing here
 * approves or decides — the server's refusal is shown in the server's words.
 *
 * CONSTRUCTION: an approval made on this page by a SYNTHETIC persona demonstrates the software; real customer acceptance is R2.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export type Receipt = { policyDecisionId: string; auditSeq: number };
export interface Mark { glyph: string; token: string; text: string }
export type Binding = { roleCode: string; scope: string; tenantId: string | null; domainId: string | null };

export interface Programme {
  programme_id: string; version: number; programme_key: string; title: string; target_domain_id: string | null; deployment_profile: string; owner_principal_id: string;
  state: string; held_reasons: Array<{ reason: string; held_by: string; held_by_roles: string[]; held_at: string; state_before: string | null }>; plan: Row; digest: string;
  effective_from: string; superseded_at?: string | null; owner_name?: string | null; target_domain_name?: string | null; target_domain_status?: string | null;
  intent_version?: number | null; step_states?: Record<string, number> | null;
}
export interface Step {
  step_id: string; programme_id: string; step_key: string; ordinal: number; version: number; state: string; realized_by: Row | null; evidence: Row[]; compensation: { action: string; description: string } | null;
  held_reason: string | null; reverted_by: Row | null; digest: string; updated_at: string; updated_by_name: string | null;
}
export interface Intent {
  intent_id: string; version: number; sponsor_principal_id: string; sponsor_name: string | null; objectives: string[]; scope_statement: string; success_measures: string[]; constraints: string[];
  target_domain_name: string; deployment_profile: string; digest: string; recorded_at: string; superseded_at: string | null;
}
export interface Baseline {
  baseline_id: string; version: number; domain_id: string; programme_id: string | null; pointers: Row; digest: string; basis: 'capture' | 'promotion'; promoted_from: number | null; absorbed: DriftChange[];
  state: string; captured_by: string; captured_at: string; proposed_by: string | null; proposed_at: string | null; decided_by: string | null; decided_at: string | null; decision_reason: string | null;
  signature_id: string | null; effective_from: string | null; superseded_at: string | null; captured_by_name: string | null; proposed_by_name: string | null; decided_by_name: string | null;
  signatures: Array<{ signature_id: string; signer: string; key_id: string; algorithm: string; subject_digest: string; signed_at: string }>;
}
export interface DriftChange { section: string; key: string | null; change: 'added' | 'removed' | 'changed'; baseline: unknown; observed: unknown }
export interface Drift { state: 'no_baseline' | 'in_sync' | 'drifted'; reason?: string; baseline_id?: string; version?: number; digest?: string; effective_from?: string; observed: Row; observed_digest: string; changes: DriftChange[] }
export interface RollbackStep { section: string; key: string | null; change: string; action: string; role: string; restores: string; gap: string | null }
export interface LedgerEvent { event_id: string; subject_kind: string; subject_id: string; version: number | null; event: string; actor_principal_id: string; actor_name: string | null; details: Row; occurred_at: string }
export interface ProgrammeDetail {
  programme: Programme; versions: Programme[]; steps: Step[]; intent: Intent | null; intents: Intent[];
  domain: (Row & { id: string; name?: string; status?: string; activated_at?: string | null; lifecycle?: Row[] }) | null;
  baselines: Baseline[]; drift: Drift | null; rollback_plan: RollbackStep[]; drift_events: Row[]; items: Row[]; ledger: LedgerEvent[]; read_at: string;
  step_defaults: Record<string, { realizes: string; compensation: { action: string; description: string } }>; boundary: string; receipt: Receipt;
}
export interface BaselineView { domain: Row | null; baselines: Baseline[]; drift: Drift; rollback_plan: RollbackStep[]; drift_events: Row[]; items: Row[]; ledger: LedgerEvent[]; read_at: string; boundary: string; receipt: Receipt }

/* ───────────── the calls ───────────── */
const T = (tenantId: string, action: string, objectType = 'OBP', objectId: string | null = null) =>
  ({ scope: 'TENANT' as const, tenant_id: tenantId, domain_id: null, action, object_type: objectType, object_id: objectId, purpose_id: 'onboarding', side_effect_class: action.endsWith('.read') ? 'none' as const : 'reversible' as const, consequence_class: 'C2' as const });
const D = (tenantId: string, domainId: string, action: string, objectId: string | null = null) =>
  ({ scope: 'DOMAIN' as const, tenant_id: tenantId, domain_id: domainId, action, object_type: 'OCB', object_id: objectId, purpose_id: 'onboarding', side_effect_class: action.endsWith('.read') ? 'none' as const : 'reversible' as const, consequence_class: 'C2' as const });
const base = (t: string) => `/v1/tenants/${t}/onboarding`;
const dbase = (t: string, d: string) => `/v1/tenants/${t}/domains/${d}/onboarding/baselines`;

export const onboarding = {
  list: (t: string): Promise<ApiResult<{ programmes: Programme[]; step_keys: string[]; read_at: string; receipt: Receipt }>> => call(`${base(t)}/programmes/list`, T(t, 'onboarding.read')),
  read: (t: string, p: string): Promise<ApiResult<ProgrammeDetail>> => call(`${base(t)}/programmes/${p}/read`, T(t, 'onboarding.read', 'OBP', p)),
  history: (t: string, p: string): Promise<ApiResult<{ replay: { versions: Row[]; consistent: boolean; mismatches: string[] }; receipt: Receipt }>> => call(`${base(t)}/programmes/${p}/history`, T(t, 'onboarding.read', 'OBP', p)),
  open: (t: string, payload: { key: string; title: string; deploymentProfile?: string; plan?: Row }): Promise<ApiResult<{ programme: Programme; receipt: Receipt }>> =>
    call(`${base(t)}/programmes/open`, T(t, 'onboarding.programme.open'), payload),
  revise: (t: string, p: string, payload: { expectedVersion: number; title?: string; plan?: Row; deploymentProfile?: string; reason: string }): Promise<ApiResult<{ programme: Programme; receipt: Receipt }>> =>
    call(`${base(t)}/programmes/${p}/revise`, T(t, 'onboarding.programme.revise', 'OBP', p), payload),
  transition: (t: string, p: string, act: 'hold' | 'resume' | 'withdraw', payload: { expectedVersion: number; reason: string }): Promise<ApiResult<{ programme: Programme; receipt: Receipt }>> =>
    call(`${base(t)}/programmes/${p}/${act}`, T(t, `onboarding.programme.${act}`, 'OBP', p), payload),
  intent: (t: string, p: string, payload: { expectedVersion: number; objectives: string[]; scopeStatement: string; successMeasures: string[]; constraints: string[]; targetDomainName: string; deploymentProfile: string }):
    Promise<ApiResult<{ intent: Intent; receipt: Receipt }>> => call(`${base(t)}/programmes/${p}/intent`, T(t, 'onboarding.intent.record', 'OSI', p), payload),
  planStep: (t: string, p: string, payload: { stepKey: string; compensation?: { action: string; description: string } }): Promise<ApiResult<{ step: Step; receipt: Receipt }>> =>
    call(`${base(t)}/programmes/${p}/steps/plan`, T(t, 'onboarding.step.plan', 'OST'), payload),
  recordStep: (t: string, s: string, payload: { expectedVersion: number; state: 'in_progress' | 'done'; realizedBy?: Row; evidence?: Row[]; compensation?: Row }): Promise<ApiResult<{ step: Step; receipt: Receipt }>> =>
    call(`${base(t)}/steps/${s}/record`, T(t, 'onboarding.step.record', 'OST', s), payload),
  holdStep: (t: string, s: string, payload: { expectedVersion: number; reason: string }): Promise<ApiResult<{ step: Step; receipt: Receipt }>> =>
    call(`${base(t)}/steps/${s}/hold`, T(t, 'onboarding.step.hold', 'OST', s), payload),
  revertStep: (t: string, s: string, payload: { expectedVersion: number; compensatingAct: Row; reason: string }): Promise<ApiResult<{ step: Step; receipt: Receipt }>> =>
    call(`${base(t)}/steps/${s}/revert`, T(t, 'onboarding.step.revert', 'OST', s), payload),
  draftDomain: (t: string, p: string, name: string): Promise<ApiResult<{ domain: Row; programme: Programme; receipt: Receipt }>> =>
    call(`${base(t)}/programmes/${p}/domain-draft`, T(t, 'tenancy.domain.draft', 'CID'), { name }),
  baselines: (t: string, d: string): Promise<ApiResult<BaselineView>> => call(`${dbase(t, d)}/read`, D(t, d, 'onboarding.read')),
  capture: (t: string, d: string, programmeId: string | null): Promise<ApiResult<{ baseline: Baseline; receipt: Receipt }>> => call(`${dbase(t, d)}/capture`, D(t, d, 'onboarding.baseline.capture'), { programmeId }),
  promote: (t: string, d: string): Promise<ApiResult<{ baseline: Baseline; receipt: Receipt }>> => call(`${dbase(t, d)}/promote`, D(t, d, 'onboarding.baseline.promote')),
  propose: (t: string, d: string, b: string, v: number, digest: string): Promise<ApiResult<{ baseline: Baseline; receipt: Receipt }>> =>
    call(`${dbase(t, d)}/${b}/versions/${v}/propose`, D(t, d, 'onboarding.baseline.propose', b), { digest }),
  decide: (t: string, d: string, b: string, v: number, payload: { decision: 'approve' | 'reject'; digest: string; reason: string }): Promise<ApiResult<{ baseline: Baseline & { signature: Row | null }; receipt: Receipt }>> =>
    call(`${dbase(t, d)}/${b}/versions/${v}/decide`, D(t, d, 'onboarding.baseline.decide', b), payload),
  recordDrift: (t: string, d: string): Promise<ApiResult<{ drift: Row; receipt: Receipt }>> => call(`${dbase(t, d)}/drift/record`, D(t, d, 'onboarding.baseline.drift')),
};

/* ───────────── the words ───────────── */
/** A programme state — the five are visibly distinct (glyph + words, never colour alone). */
export function programmeMark(state: string): Mark {
  switch (state) {
    case 'planned': return { glyph: '◇', token: '--eye-color-ink-muted', text: 'PLANNED' };
    case 'in_progress': return { glyph: '◐', token: '--eye-color-accent-strong', text: 'IN PROGRESS' };
    case 'held': return { glyph: '⏸', token: '--eye-color-warning', text: 'HELD' };
    case 'accepted': return { glyph: '●', token: '--eye-color-success', text: 'ACCEPTED (by the customer authority)' };
    case 'withdrawn': return { glyph: '⊘', token: '--eye-color-ink-muted', text: 'WITHDRAWN' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
export function stepMark(state: string): Mark {
  switch (state) {
    case 'planned': return { glyph: '○', token: '--eye-color-ink-muted', text: 'planned' };
    case 'in_progress': return { glyph: '◐', token: '--eye-color-accent-strong', text: 'in progress' };
    case 'done': return { glyph: '●', token: '--eye-color-success', text: 'done' };
    case 'held': return { glyph: '⏸', token: '--eye-color-warning', text: 'held' };
    case 'reverted': return { glyph: '↺', token: '--eye-color-critical', text: 'reverted (compensated)' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: state };
  }
}
/** A baseline state: a DRAFT or PROPOSED version never reads like an APPROVED one (UX: proposals are not approvals). */
export function baselineMark(state: string): Mark {
  switch (state) {
    case 'draft': return { glyph: '◇', token: '--eye-color-ink-muted', text: 'DRAFT (captured, not proposed)' };
    case 'proposed': return { glyph: '◌', token: '--eye-color-warning', text: 'PROPOSED — awaiting the onboarding authority' };
    case 'approved': return { glyph: '●', token: '--eye-color-success', text: 'APPROVED and SIGNED (desired state)' };
    case 'rejected': return { glyph: '✕', token: '--eye-color-critical', text: 'REJECTED' };
    case 'superseded': return { glyph: '○', token: '--eye-color-ink-muted', text: 'SUPERSEDED' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
/** Drift is never inferred: no approved baseline is said as such, not as "in line". */
export function driftMark(d: Pick<Drift, 'state' | 'changes'> | null): Mark {
  if (d === null) return { glyph: '○', token: '--eye-color-ink-muted', text: 'no target domain yet — nothing to compare' };
  if (d.state === 'no_baseline') return { glyph: '○', token: '--eye-color-ink-muted', text: 'NO APPROVED BASELINE — drift is not inferred' };
  if (d.state === 'in_sync') return { glyph: '■', token: '--eye-color-success', text: 'IN LINE with the approved baseline' };
  return { glyph: '◩', token: '--eye-color-warning', text: `DRIFTED — ${d.changes.length} pointer(s) differ from the approved baseline` };
}
export const short = (digest: unknown): string => (typeof digest === 'string' && /^[0-9a-f]{64}$/.test(digest) ? `${digest.slice(0, 12)}…` : '—');
/** A DATE (YYYY-MM-DD…) as the day it names — never shifted by a time zone. */
export const dayOf = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '—');
/** Freshness: the age of the server's read at `now` (ms since epoch). */
export function freshness(readAt: string | null | undefined, now: number): string {
  if (readAt === null || readAt === undefined) return 'not read';
  const t = Date.parse(readAt);
  if (Number.isNaN(t)) return 'not read';
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 60 ? `read ${s} s ago` : s < 3600 ? `read ${Math.round(s / 60)} min ago` : `read ${Math.round(s / 3600)} h ago`;
}
const val = (v: unknown): string => (v === null || v === undefined ? 'nothing' : typeof v === 'object' ? (('version' in (v as Row)) ? `v${String((v as Row)['version'])}` : JSON.stringify(v)) : String(v));
/** One drifted pointer in words. */
export function changeLine(c: DriftChange): string {
  const where = c.key === null ? c.section : `${c.section}.${c.key}`;
  if (c.change === 'added') return `${where}: added after the baseline (now ${val(c.observed)})`;
  if (c.change === 'removed') return `${where}: removed since the baseline (was ${val(c.baseline)})`;
  return `${where}: ${val(c.baseline)} in the baseline → ${val(c.observed)} observed`;
}
/** The pointers of a baseline, summarized per section (counts, never persons). */
export function pointerSummary(p: Row): string[] {
  const n = (k: string) => Object.keys((p[k] ?? {}) as Row).length;
  const census = Object.entries((p['role_census'] ?? {}) as Record<string, number>).map(([r, c]) => `${r} ×${c}`).join(', ');
  return [
    `attention policy: ${p['attention_policy'] === null || p['attention_policy'] === undefined ? 'none' : val(p['attention_policy'])}`,
    `analytics purposes: ${n('analytics_purposes')}`, `active packages: ${n('packages')}`, `workflow definitions: ${n('workflow_definitions')}`,
    `active source contracts: ${n('source_contracts')}`, `role census: ${census === '' ? 'none' : census}`,
    `licence: ${p['licence'] === null || p['licence'] === undefined ? 'none (uncontracted)' : val(p['licence'])}`,
  ];
}

/**
 * ELIGIBILITY to decide a baseline, as the PORT will judge it (the page disables the control with the reason; the server decides): a named
 * human holding onboarding_authority in the tenant, not an implementation lead, not the proposer or the capturer, on a PROPOSED version.
 */
export function decisionEligibility(b: Pick<Baseline, 'state' | 'proposed_by' | 'captured_by'>, me: { principalId: string; bindings: Binding[] }, tenantId: string): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const holds = (role: string) => me.bindings.some((x) => x.roleCode === role && x.scope === 'TENANT' && x.tenantId === tenantId);
  if (b.state !== 'proposed') reasons.push(`the version is ${b.state}; only a proposed version is decided`);
  if (!holds('onboarding_authority')) reasons.push('the decision is the onboarding authority\'s (you hold no onboarding_authority binding in this tenant)');
  if (holds('implementation_lead')) reasons.push('an implementation lead never approves on the customer\'s behalf (separation of duties)');
  if (b.proposed_by === me.principalId) reasons.push('the proposer never approves their own proposal');
  if (b.captured_by === me.principalId) reasons.push('the principal who captured the version never approves it');
  return { eligible: reasons.length === 0, reasons };
}
/** The CONSEQUENCE of approving `next` (the preview beside the control): what becomes the desired state, what it supersedes, what changes. */
export function consequencePreview(next: Pick<Baseline, 'version' | 'pointers' | 'digest' | 'absorbed' | 'basis' | 'promoted_from'>, approved: Pick<Baseline, 'version' | 'pointers'> | null, changes: DriftChange[]): string[] {
  const lines = [`v${next.version} (digest ${short(next.digest)}) becomes the domain's desired configuration; drift is measured against it from now on.`];
  lines.push(approved === null ? 'No approved baseline is superseded (this is the first).' : `Approved v${approved.version} is SUPERSEDED (kept on record, never deleted).`);
  const diff = next.basis === 'promotion' ? next.absorbed : changes;
  if (diff.length > 0) lines.push(`${diff.length} pointer(s) differ from v${approved?.version ?? next.promoted_from ?? '?'}: ${diff.map(changeLine).join('; ')}.`);
  lines.push('Your signature (Ed25519 over the digest) is recorded with the approval; the open drift items of the domain close.');
  return lines;
}
/** The step graph's next legal moves (disabled with the reason; the port is the authority). */
export function stepMoves(state: string, programmeState: string): Array<{ to: string; allowed: boolean; reason: string | null }> {
  const closed = programmeState === 'withdrawn' || programmeState === 'accepted';
  const held = programmeState === 'held';
  const why = closed ? `the programme is ${programmeState}` : null;
  return [
    { to: 'in_progress', allowed: !closed && !held && state !== 'done', reason: why ?? (held ? 'the programme is held' : state === 'done' ? 'a done step changes only by its revert' : null) },
    { to: 'done', allowed: !closed && !held && state !== 'done', reason: why ?? (held ? 'the programme is held' : state === 'done' ? 'already done' : null) },
    { to: 'held', allowed: !closed && (state === 'planned' || state === 'in_progress'), reason: why ?? (state === 'planned' || state === 'in_progress' ? null : `a ${state} step is not held`) },
    { to: 'reverted', allowed: !closed && state === 'done', reason: why ?? (state === 'done' ? null : 'only a done step is reverted') },
  ];
}
/** A stale-response guard for a page that loads by selection: only the latest request's answer is applied. */
export function latestOnly(): { next: () => number; current: (n: number) => boolean } {
  let seq = 0;
  return { next: () => ++seq, current: (n: number) => n === seq };
}
