/**
 * The service-portal client — CP-6 B94 §SV (0114_b94_x_sv; F-P7-F-06: PR-69-001/002/005/006, CAP-DL-09 the service portal, CAP-DL-10 the
 * customer-success workspace; carryover a: premium support routed from the tenant's live licence).
 *
 * Every response is returned VERBATIM. The helpers below only WORD what the record says: a case's state, its routing (tier, licence version,
 * objectives — premium never weakens governance and opening a case is never licence-gated), its SLA objectives (met / met late / breached /
 * running — never "healthy" by inference), a bundle item's disposition and reason, which acts the case's state admits (the server decides —
 * the page disables what the state cannot reach, with the reason), a DATE as the day it names. Nothing here computes or decides.
 * BOUNDARY: SYNTHETIC records demonstrate the software; real customer acceptance and joint value review are R2.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export type Scope = { tenantId: string; domainId: string };
export interface Receipt { policyDecisionId: string; auditSeq: number }
export type CaseState = 'open' | 'triaged' | 'awaiting_access' | 'diagnosing' | 'workaround_offered' | 'resolved' | 'closed' | 'cannot_reproduce' | 'degraded_guidance';
export interface Objective { objective: 'response' | 'resolution'; due_at: string | null; met_at: string | null; state: 'met' | 'met_late' | 'breached' | 'running' | 'stopped'; minutes_left: number | null; note: string }
export interface Routing {
  tier: 'premium' | 'standard'; severity: string; reason: string; read_at?: string; licence: { licence_id: string; version: number; state: string; package_key: string; premium_listed: boolean } | null;
  objectives: { response_minutes: number; resolution_minutes: number; update_minutes: number }; named_support: string | null; queue: string;
  contract: { contract_id: string; version: number; support_tier: string | null; descriptive: boolean } | null; policy: { version: number; digest: string }; regraded_from?: string;
}
export interface CaseRow {
  case_id: string; case_ref: string; title: string; severity: string; affected_capability: string; object_refs: Array<{ kind: string; id: string; label: string | null }>; description: string;
  state: CaseState; routing: Routing; opened_by: string; opened_by_name: string | null; opened_at: string; updated_at: string; closed_at: string | null; version: number;
  response_due_at: string | null; resolution_due_at: string | null; responded_at: string | null; resolved_at: string | null; resolution: string | null; guidance: string | null;
  workaround: Row | null; workaround_executed: Row | null; problem_id: string | null; known_error_id: string | null; reopen_count: number; closure: Row | null; sla?: Objective[];
}
export interface BundleItem { kind: string; id: string; disposition: 'included' | 'redacted' | 'withheld'; reason?: string; redactions?: string[]; content?: unknown }
export interface Bundle { bundle_id: string; case_version: number; side: 'customer' | 'support'; grant_id: string | null; items: BundleItem[]; counts: Row; digest: string; assembled_at: string }
export interface CaseDetail {
  case: CaseRow; sla: Objective[]; notes: Row[]; bundles: Bundle[]; commitments: Row[]; breaches: Row[]; drills: Row[]; timers: Row[]; tasks: Row[]; items: Row[]; grants: Row[];
  access_log: Row[]; ledger: Row[]; read_at: string; boundary: string; receipt: Receipt;
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/service`;
function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action === 'service.read';
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'service',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}
const R = 'service.read';
export const service = {
  list: (s: Scope, state: string | null = null) => p<{ cases: CaseRow[]; breaches: Row[]; commitments: Row[]; policies: Row[]; routing: Record<string, Routing>; read_at: string; boundary: string; receipt: Receipt }>(s, '/cases/list', R, 'service_case', { state }),
  read: (s: Scope, id: string) => p<CaseDetail>(s, `/cases/${id}/read`, R, 'service_case', {}, id),
  policies: (s: Scope) => p<{ policies: Row[]; routing: Record<string, Routing>; governance: string; receipt: Receipt }>(s, '/policies', R, 'service_case'),
  problems: (s: Scope) => p<{ problems: Row[]; links: Row[]; known_errors: Row[]; known_error_uses: Row[]; changes: Row[]; ledger: Row[]; receipt: Receipt }>(s, '/problems/list', R, 'service_problem'),
  open: (s: Scope, b: { title: string; severity: string; capability: string; objects: Array<{ kind: string; id: string }>; description: string }) =>
    p<{ case: CaseRow; routing: Routing; receipt: Receipt }>(s, '/cases/open', 'service.case.open', 'service_case', b),
  triage: (s: Scope, id: string, b: { expectedVersion: number; severity?: string | null; note: string }) => p<{ case: CaseRow; receipt: Receipt }>(s, `/cases/${id}/triage`, 'service.case.triage', 'service_case', b, id),
  note: (s: Scope, id: string, b: { kind?: string; body: string }) => p<{ note: Row; receipt: Receipt }>(s, `/cases/${id}/notes`, 'service.case.note', 'service_case', b, id),
  progress: (s: Scope, id: string, b: { expectedVersion: number; to: string; statement: string }) => p<{ case: CaseRow; receipt: Receipt }>(s, `/cases/${id}/progress`, 'service.case.progress', 'service_case', b, id),
  proposeWorkaround: (s: Scope, id: string, b: { expectedVersion: number; steps: string; act: { action: string; object_type?: string; object_id?: string }; risk?: string | null }) =>
    p<{ case: CaseRow; receipt: Receipt }>(s, `/cases/${id}/workaround/propose`, 'service.case.workaround.propose', 'service_case', b, id),
  executeWorkaround: (s: Scope, id: string, b: { expectedVersion: number; policyDecisionId: string; note?: string | null }) =>
    p<{ case: CaseRow; receipt: Receipt }>(s, `/cases/${id}/workaround/execute`, 'service.case.workaround.execute', 'service_case', b, id),
  reuseKnownError: (s: Scope, id: string, b: { expectedVersion: number; knownErrorId: string }) => p<{ case: CaseRow; receipt: Receipt }>(s, `/cases/${id}/known-error/reuse`, 'service.case.known_error.reuse', 'service_case', b, id),
  bundle: (s: Scope, id: string) => p<{ bundle: Bundle; receipt: Receipt }>(s, `/cases/${id}/bundles/assemble`, 'service.case.bundle', 'service_case', {}, id),
  close: (s: Scope, id: string, b: { expectedVersion: number; outcome: 'resolved' | 'not_reproduced'; note: string }) => p<{ case: CaseRow; receipt: Receipt }>(s, `/cases/${id}/close`, 'service.case.close', 'service_case', b, id),
  reopen: (s: Scope, id: string, b: { expectedVersion: number; regression: string }) => p<{ case: CaseRow; receipt: Receipt }>(s, `/cases/${id}/reopen`, 'service.case.reopen', 'service_case', b, id),
  commit: (s: Scope, id: string, b: { kind: string; statement: string; dueAt: string }) => p<{ commitment: Row; receipt: Receipt }>(s, `/cases/${id}/commitments/record`, 'service.commitment.record', 'service_commitment', b, id),
  settle: (s: Scope, id: string, b: { outcome: 'met' | 'withdrawn'; note: string }) => p<{ commitment: Row; receipt: Receipt }>(s, `/commitments/${id}/settle`, 'service.commitment.settle', 'service_commitment', b, id),
  drill: (s: Scope, id: string, b: { objective: 'response' | 'resolution'; reason: string }) => p<{ drill: Row; receipt: Receipt }>(s, `/cases/${id}/sla/drill`, 'service.sla.drill', 'service_case', b, id),
  openProblem: (s: Scope, b: { title: string; statement: string; cases: string[] }) => p<{ problem: Row; receipt: Receipt }>(s, '/problems/open', 'service.problem.open', 'service_problem', b),
  publishKnownError: (s: Scope, id: string, b: { title: string; symptom: string; workaround: string; act?: Row }) => p<{ known_error: Row; receipt: Receipt }>(s, `/problems/${id}/known-errors/publish`, 'service.problem.known_error', 'known_error', b, id),
  proposeChange: (s: Scope, b: { problemId: string; title: string; description: string; expectedEffect: string }) => p<{ change: Row; receipt: Receipt }>(s, '/changes/propose', 'service.change.propose', 'service_change', b),
  decideChange: (s: Scope, id: string, b: { expectedVersion: number; decision: 'approve' | 'reject'; reason: string }) => p<{ change: Row; receipt: Receipt }>(s, `/changes/${id}/decide`, 'service.change.decide', 'service_change', b, id),
  success: (s: Scope) => p<{ success: Success; inputs_digest: string; inputs: Row; receipt: Receipt }>(s, '/customer-success/read', R, 'value_review'),
  recordReview: (s: Scope, b: { periodFrom: string; periodTo: string; outcomes: string; inputsDigest: string }) => p<{ review: Row; receipt: Receipt }>(s, '/value-reviews/record', 'service.value_review.record', 'value_review', b),
  decideReview: (s: Scope, id: string, b: { digest: string; decision: 'acknowledged' | 'withheld'; note: string }) => p<{ review: Row; receipt: Receipt }>(s, `/value-reviews/${id}/decide`, 'service.value_review.acknowledge', 'value_review', b, id),
};
export interface Success {
  health: { state: string; snapshots: Row[]; note: string }; adoption: { measures: Row[]; determinate: number; indeterminate: number; note: string }; outcomes: { results: Row[] };
  value: Row & { state: string; carrier?: string | null; note: string; reason?: string }; licence: { standing: Row | null; term_end: string | null; days_to_term_end: number | null; routing: Routing | null; note: string };
  cases: { open: number; by_severity: Record<string, number>; breaches: number; drills: number; commitments_open: number; commitments_breached: number }; reviews: Row[]; read_at: string; boundary: string;
}

/* ───────────── the words (never judging) ───────────── */
export interface Mark { glyph: string; token: string; text: string }
const STATE: Record<CaseState, Mark> = {
  open: { glyph: '○', token: '--eye-color-info', text: 'open — awaiting triage' },
  triaged: { glyph: '◔', token: '--eye-color-info', text: 'triaged' },
  awaiting_access: { glyph: '⏸', token: '--eye-color-warning', text: 'awaiting access — the customer approves support access' },
  diagnosing: { glyph: '◑', token: '--eye-color-info', text: 'diagnosing' },
  workaround_offered: { glyph: '◕', token: '--eye-color-warning', text: 'workaround offered — the customer executes it' },
  resolved: { glyph: '◉', token: '--eye-color-accent-strong', text: 'resolved — awaiting the customer\'s confirmation (not closed)' },
  closed: { glyph: '●', token: '--eye-color-ink-muted', text: 'closed — the customer confirmed' },
  cannot_reproduce: { glyph: '?', token: '--eye-color-warning', text: 'cannot reproduce — the customer confirms or reopens' },
  degraded_guidance: { glyph: '◐', token: '--eye-color-critical', text: 'degraded — safe guidance in force; NOT recovered' },
};
export function stateMark(s: string): Mark { return STATE[s as CaseState] ?? { glyph: '·', token: '--eye-color-ink-muted', text: s }; }

const OBJ: Record<Objective['state'], Mark> = {
  met: { glyph: '✓', token: '--eye-color-accent-strong', text: 'met' },
  met_late: { glyph: '✓!', token: '--eye-color-warning', text: 'met late' },
  breached: { glyph: '✕', token: '--eye-color-critical', text: 'breached' },
  running: { glyph: '◷', token: '--eye-color-info', text: 'running' },
  stopped: { glyph: '–', token: '--eye-color-ink-muted', text: 'no objective' },
};
export function objectiveMark(o: Objective): Mark { return OBJ[o.state]; }
/** "response · running · 23 min left (due 2026-10-13 09:30 UTC)" — the minutes are the server's instant's, as read. */
export function objectiveLine(o: Objective): string {
  const due = o.due_at === null ? 'no due instant' : `due ${instantUtc(o.due_at)}`;
  const left = o.state === 'running' && o.minutes_left !== null ? ` · ${durationWords(o.minutes_left)} left` : o.state === 'breached' && o.minutes_left !== null ? ` · ${durationWords(-o.minutes_left)} past due` : '';
  const met = o.met_at !== null ? ` · met ${instantUtc(o.met_at)}` : '';
  return `${o.objective} · ${OBJ[o.state].text}${left} (${due})${met}`;
}
export function durationWords(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}
export const instantUtc = (v: unknown): string => {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return '—';
  const d = new Date(v);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
};
/** A DATE renders as the day it names (never shifted by a time zone). */
export const dayOf = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '—');

/** The routing as the record says it: tier, objectives, named support, the licence version it was read from. */
export function routingLine(r: Routing): string {
  const lic = r.licence === null ? 'no licence (uncontracted)' : `licence v${r.licence.version} (${r.licence.state})`;
  const named = r.tier === 'premium' && r.named_support !== null ? ` · named support: ${r.named_support}` : '';
  return `${r.tier.toUpperCase()} · ${r.severity}: response ${durationWords(r.objectives.response_minutes)}, resolution ${durationWords(r.objectives.resolution_minutes)}${named} · read from ${lic}`;
}
export const ROUTING_GOVERNANCE = 'Premium support changes the objectives and names the support only — it never approves, grants or gates anything; opening a case is never licence-gated.';

export function dispositionMark(d: BundleItem['disposition']): Mark {
  return d === 'included' ? { glyph: '●', token: '--eye-color-accent-strong', text: 'included' }
    : d === 'redacted' ? { glyph: '◐', token: '--eye-color-warning', text: 'redacted' } : { glyph: '⊘', token: '--eye-color-critical', text: 'withheld' };
}
/** One bundle item, worded: its disposition and why (the redactions or the withholding reason, verbatim). */
export function bundleItemLine(i: BundleItem): string {
  const why = i.disposition === 'withheld' ? (i.reason ?? 'withheld') : i.disposition === 'redacted' ? (i.redactions ?? []).join('; ') : '';
  return `${i.kind} · ${dispositionMark(i.disposition).text}${why === '' ? '' : ` — ${why}`}`;
}

export type CaseAct = 'triage' | 'progress' | 'workaround.propose' | 'workaround.execute' | 'known_error.reuse' | 'bundle' | 'close' | 'reopen' | 'note' | 'commitment' | 'drill';
export const ACT_FROM: Record<CaseAct, readonly CaseState[]> = {
  triage: ['open'],
  progress: ['open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'degraded_guidance'],
  'workaround.propose': ['triaged', 'awaiting_access', 'diagnosing', 'degraded_guidance'],
  'workaround.execute': ['workaround_offered'],
  'known_error.reuse': ['open', 'triaged', 'awaiting_access', 'diagnosing', 'degraded_guidance'],
  bundle: ['open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'resolved', 'cannot_reproduce', 'degraded_guidance'],
  close: ['resolved', 'cannot_reproduce'],
  reopen: ['resolved', 'cannot_reproduce', 'closed'],
  note: ['open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'resolved', 'cannot_reproduce', 'degraded_guidance'],
  commitment: ['open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'resolved', 'cannot_reproduce', 'degraded_guidance'],
  drill: ['open', 'triaged', 'awaiting_access', 'diagnosing', 'workaround_offered', 'resolved', 'cannot_reproduce', 'degraded_guidance'],
};
export const PROGRESS_FROM: Record<string, readonly CaseState[]> = {
  awaiting_access: ['open', 'triaged', 'diagnosing'],
  diagnosing: ['triaged', 'awaiting_access', 'workaround_offered', 'degraded_guidance'],
  cannot_reproduce: ['triaged', 'awaiting_access', 'diagnosing'],
  degraded_guidance: ['triaged', 'awaiting_access', 'diagnosing', 'workaround_offered'],
  resolved: ['triaged', 'diagnosing', 'workaround_offered', 'degraded_guidance'],
};
/** Whether the case's state admits the act (the page disables it with the reason; the server decides). */
export function actReason(act: CaseAct, state: CaseState, roles: ReadonlySet<string>): string | null {
  if (!ACT_FROM[act].includes(state)) return `the case is ${state.replace(/_/g, ' ')} — ${act.replace('.', ' ')} is reached from ${ACT_FROM[act].join(', ').replace(/_/g, ' ')}`;
  const admin = roles.has('domain_admin');
  const engineer = roles.has('support_engineer');
  if (['triage', 'progress', 'workaround.propose', 'known_error.reuse', 'commitment', 'drill'].includes(act) && !admin && !engineer) return 'the domain admin (or support under a live grant) performs it';
  if (act === 'drill' && !admin) return 'an SLA drill is the domain admin\'s (human-gated)';
  if (['workaround.execute', 'close', 'reopen'].includes(act) && engineer) return 'the customer\'s own act — support never performs it';
  return null;
}
export function progressReason(to: string, state: CaseState): string | null {
  const from = PROGRESS_FROM[to];
  if (from === undefined) return `${to} is not a progress target`;
  return from.includes(state) ? null : `${to.replace(/_/g, ' ')} is reached from ${from.join(', ').replace(/_/g, ' ')}`;
}

/** The value status (MET-040): unsupported until B76 — said, never a number. */
export function valueLine(v: Success['value']): string {
  return v.state === 'supported' ? `${String(v['metric_key'] ?? 'MET-040')} supported (v${String(v['version'] ?? '?')})` : `realized value UNSUPPORTED — ${String(v.reason ?? '')} (carrier ${v.carrier ?? 'B76'})`;
}

/**
 * A selection guard: the response of the LATEST selection wins; an older, slower answer is dropped (never rendered over a newer choice).
 * `begin()` returns a token; `current(token)` says whether its answer may be rendered.
 */
export function selectionGuard() {
  let seq = 0;
  return { begin: (): number => ++seq, current: (token: number): boolean => token === seq };
}
