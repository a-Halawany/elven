/**
 * The implementation client — CP-6 B94 part `§IM+§AD` (0114 §IM; WS-20, CAP-DL-07/08, PR-68-001..006): the implementation programme, its
 * readiness items and the go-live gate (evaluated LIVE by the server), go-live (approve | withhold), enablement (accessible training paths,
 * training and competence records), cohorts and adoption measures, shadow findings.
 *
 * Every response is returned VERBATIM. The helpers below only WORD what the record says and decide what the page may OFFER (an approval
 * control is offered to a named sponsor or authority who is not an implementation lead, on the gate's exact digest, with its consequence
 * stated) — the PORT decides who may act; a refusal is shown in the server's words. Nothing here computes readiness: a gate is never shown
 * ready, complete or authorized by inference. Every persona and record on the demonstration is SYNTHETIC; an in-product go-live demonstrates
 * the software — the customer's own acceptance is R2.
 */
import { call, type ApiResult, type Session } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface GateLine { kind: string; item_key: string; title: string; reason: string | null; accountable_role: string; overridable: boolean }
export interface GateItem {
  item_id: string; version: number; item_key: string; kind: string; title: string; blocking: boolean; accountable_role: string; state: 'satisfied' | 'unsatisfied' | 'accepted_residual';
  reason: string | null; facts: Row; digest: string; overridable: boolean; residual: Row | null;
}
export interface Gate {
  programme_id: string; programme_version: number; programme_state: string; domain_id: string; state: 'ready' | 'held' | 'accepted' | 'withdrawn'; digest: string;
  items: GateItem[]; measures: Row[]; blocking: GateLine[]; owner_gap: boolean; evaluated_at: string; rule: string; raised?: Row[]; task?: Row | null;
}
export interface Programme {
  programme_id: string; version: number; programme_key: string; title: string; target_domain_id: string; domain_name?: string; domain_status?: string; onboarding_programme_id: string | null;
  deployment_profile: string; owner_principal_id: string; owner_name?: string; state: string; held_reasons: string[]; plan: Row; digest: string; effective_from: string; opened_at?: string;
}
export interface ProgrammeDetail {
  programme: Programme; gate: Gate; readiness: Row[]; residuals: Row[]; decisions: Row[];
  enablement: { coverage: { paths: Row[]; competence: Row[]; note: string }; paths: Row[]; records: { training: Row[]; competence: Row[] } };
  cohorts: Row[]; measures: Row[]; shadow: { findings: Row[]; reviews: Row[] }; items: Row[]; changes: Row[]; versions: Row[]; evaluations: Row[]; attention: Row[]; tasks: Row[];
  cadences: Row[]; ledger: Row[]; read_at: string; boundary: string; receipt: Receipt;
}

// ── the context (WS-20: tenant, domain, role always visible) ────────────────────────────────────────────────
export interface Context { scope: 'PLATFORM' | 'TENANT' | 'DOMAIN' | null; tenantId: string | null; domainId: string | null; roles: string[] }
export function contextOf(session: Session | null): Context {
  const s = session?.scope ?? null;
  return { scope: s?.scope ?? null, tenantId: s?.tenantId ?? null, domainId: s?.domainId ?? null, roles: [...new Set((session?.bindings ?? []).map((b) => b.roleCode))].sort() };
}
export function contextLine(c: Context): string {
  if (c.scope === null || c.tenantId === null) return 'no tenant in this session — the implementation workspace is a tenant\'s';
  return `tenant ${c.tenantId}${c.domainId !== null ? ` · domain ${c.domainId}` : ' · tenant scope'} · roles ${c.roles.length === 0 ? 'none' : c.roles.join(', ')}`;
}

const tenantBase = (t: string) => `/v1/tenants/${t}/implementation`;
const domainBase = (t: string, d: string) => `/v1/tenants/${t}/domains/${d}/implementation`;
const T = (t: string, action: string, objectId: string | null = null, read = false) =>
  ({ scope: 'TENANT' as const, tenant_id: t, domain_id: null, purpose_id: 'implementation', action, object_type: 'IMP', object_id: objectId, ...(read ? { side_effect_class: 'none' as const } : {}) });
const D = (t: string, d: string, action: string, objectId: string | null = null, read = false) =>
  ({ scope: 'DOMAIN' as const, tenant_id: t, domain_id: d, purpose_id: 'implementation', action, object_type: 'IMP', object_id: objectId, ...(read ? { side_effect_class: 'none' as const } : {}) });

// ── the reads ───────────────────────────────────────────────────────────────────────────────────────────────
export function listProgrammes(t: string, d: string | null): Promise<ApiResult<{ programmes: Array<Programme & { gate: Partial<Gate> }>; read_at: string; boundary: string; receipt: Receipt }>> {
  return d === null ? call(`${tenantBase(t)}/programmes/list`, T(t, 'implementation.read', null, true)) : call(`${domainBase(t, d)}/programmes/list`, D(t, d, 'implementation.read', null, true));
}
/** The programme as the workspace shows it, read on its TARGET domain (a tenant session reads there too: its TENANT binding counts). */
export function readProgramme(t: string, d: string, id: string): Promise<ApiResult<ProgrammeDetail>> {
  return call(`${domainBase(t, d)}/programmes/${id}/read`, D(t, d, 'implementation.read', id, true));
}
export function myRecords(t: string, d: string): Promise<ApiResult<{ training: Row[]; competence: Row[]; note: string; receipt: Receipt }>> {
  return call(`${domainBase(t, d)}/my-records`, D(t, d, 'implementation.self.read', null, true));
}

// ── the acts ────────────────────────────────────────────────────────────────────────────────────────────────
export const acts = {
  open: (t: string, p: { key: string; title: string; targetDomainId: string; plan: Row; onboardingProgrammeId?: string | null }) =>
    call<{ programme: Programme; receipt: Receipt }>(`${tenantBase(t)}/programmes/open`, T(t, 'implementation.programme.open'), p),
  transition: (t: string, id: string, act: 'start' | 'hold' | 'resume' | 'withdraw', p: { expectedVersion: number; reason: string }) =>
    call<{ programme: Programme; receipt: Receipt }>(`${tenantBase(t)}/programmes/${id}/${act}`, T(t, `implementation.programme.${act}`, id), p),
  item: (t: string, id: string, p: Row) => call<{ item: Row; receipt: Receipt }>(`${tenantBase(t)}/programmes/${id}/items/record`, T(t, 'implementation.item.record', id), p),
  proposeChange: (t: string, id: string, p: { title: string; description: string }) =>
    call<{ change: Row; receipt: Receipt }>(`${tenantBase(t)}/programmes/${id}/changes/propose`, T(t, 'implementation.change.propose', null), p),
  decideChange: (t: string, changeId: string, p: { decision: 'approve' | 'reject'; digest: string; reason: string }) =>
    call<{ change: Row; receipt: Receipt }>(`${tenantBase(t)}/changes/${changeId}/decide`, T(t, 'implementation.change.approve', changeId), p),
  evaluate: (t: string, d: string, id: string) => call<{ gate: Gate; receipt: Receipt }>(`${domainBase(t, d)}/programmes/${id}/gate/evaluate`, D(t, d, 'implementation.gate.evaluate', id)),
  golive: (t: string, d: string, id: string, p: { decision: 'approve' | 'withhold'; gateDigest: string; cadenceId?: string | null; journeys?: string[]; reason: string }) =>
    call<{ decision: Row; receipt: Receipt }>(`${domainBase(t, d)}/programmes/${id}/golive/decide`, D(t, d, 'implementation.golive.approve', id), p),
  declareReadiness: (t: string, d: string, id: string, p: Row) => call<{ item: Row; receipt: Receipt }>(`${domainBase(t, d)}/programmes/${id}/readiness/declare`, D(t, d, 'implementation.readiness.declare', id), p),
  confirm: (t: string, d: string, itemId: string, p: { version: number; digest: string; statement: string }) =>
    call<{ confirmation: Row; receipt: Receipt }>(`${domainBase(t, d)}/readiness/${itemId}/confirm`, D(t, d, 'implementation.readiness.confirm', itemId), p),
  acceptResidual: (t: string, d: string, itemId: string, p: { version: number; digest: string; reason: string }) =>
    call<{ acceptance: Row; receipt: Receipt }>(`${domainBase(t, d)}/readiness/${itemId}/accept-residual`, D(t, d, 'implementation.readiness.accept_residual', itemId), p),
  retire: (t: string, d: string, itemId: string, p: { expectedVersion: number; reason: string }) =>
    call<{ item: Row; receipt: Receipt }>(`${domainBase(t, d)}/readiness/${itemId}/retire`, D(t, d, 'implementation.readiness.retire', itemId), p),
  declarePath: (t: string, d: string, p: Row) => call<{ path: Row; receipt: Receipt }>(`${domainBase(t, d)}/training/paths/declare`, D(t, d, 'implementation.training.path.declare', null), p),
  attest: (t: string, d: string, pathId: string, p: { version: number; digest: string; verdict: 'accessible' | 'inaccessible'; statement: string }) =>
    call<{ attestation: Row; receipt: Receipt }>(`${domainBase(t, d)}/training/paths/${pathId}/attest`, D(t, d, 'implementation.training.path.attest', pathId), p),
  train: (t: string, d: string, p: { pathId: string; version: number; subject: string; state: 'complete' | 'not_yet' }) =>
    call<{ record: Row; receipt: Receipt }>(`${domainBase(t, d)}/training/records/record`, D(t, d, 'implementation.training.record', null), { ...p, purpose: 'enablement_readiness' }),
  competence: (t: string, d: string, p: { competenceKey: string; role: string; subject: string; outcome: 'complete' | 'not_yet' }) =>
    call<{ record: Row; receipt: Receipt }>(`${domainBase(t, d)}/competence/record`, D(t, d, 'implementation.competence.record', null), { ...p, purpose: 'enablement_readiness' }),
  cohort: (t: string, d: string, id: string, p: { dimensions: { role: string; wave: string } }) =>
    call<{ cohort: Row; receipt: Receipt }>(`${domainBase(t, d)}/programmes/${id}/cohorts/declare`, D(t, d, 'implementation.cohort.declare', null), p),
  resolveShadow: (t: string, d: string, findingId: string, remediation: string) =>
    call<{ finding: Row; receipt: Receipt }>(`${domainBase(t, d)}/shadow/${findingId}/resolve`, D(t, d, 'implementation.shadow.resolve', findingId), { remediation }),
  reviewShadow: (t: string, d: string, id: string, statement: string) =>
    call<{ review: Row; receipt: Receipt }>(`${domainBase(t, d)}/programmes/${id}/shadow/review`, D(t, d, 'implementation.shadow.review', null), { statement }),
};

// ── wording and eligibility (the page OFFERS; the port DECIDES) ───────────────────────────────────────────────
const GATE_TEXT: Record<string, { text: string; token: string }> = {
  ready: { text: 'READY — every blocking item satisfied or accepted as signed residual risk', token: '--eye-color-success' },
  held: { text: 'HELD — go-live is refused while any blocking item stands', token: '--eye-color-warning' },
  accepted: { text: 'ACCEPTED — go-live approved and signed (a demonstration on SYNTHETIC records; customer acceptance is R2)', token: '--eye-color-accent-strong' },
  withdrawn: { text: 'WITHDRAWN', token: '--eye-color-ink-muted' },
};
export function gateLabel(state: string): { text: string; token: string } { return GATE_TEXT[state] ?? { text: state.toUpperCase(), token: '--eye-color-ink-muted' }; }

const ITEM_TEXT: Record<string, { text: string; token: string; mark: string }> = {
  satisfied: { text: 'satisfied (live)', token: '--eye-color-success', mark: '●' },
  unsatisfied: { text: 'unsatisfied', token: '--eye-color-critical', mark: '○' },
  accepted_residual: { text: 'accepted as residual risk (signed) — not satisfied', token: '--eye-color-warning', mark: '◐' },
};
export function itemLabel(state: string): { text: string; token: string; mark: string } { return ITEM_TEXT[state] ?? { text: state, token: '--eye-color-ink-muted', mark: '?' }; }

/** One blocking line in the server's words; an item that cannot be overridden says so. */
export function blockingLine(b: GateLine): string {
  return `${b.title} — ${b.reason ?? 'unsatisfied'}${!b.overridable && ['role_filled', 'owner_resolved', 'accessibility_attested'].includes(b.kind) ? ' (not overridable: it is filled, never waived)' : ''} · escalates to ${b.accountable_role}`;
}

/** Who the page OFFERS the go-live controls to: a named human sponsor or onboarding authority who is not an implementation lead, while the
 *  gate is READY (approve) or not accepted (withhold). The port re-checks every rule; this only avoids offering a control that would refuse. */
export function goliveEligibility(c: Context, gate: Pick<Gate, 'state'> | null): { approve: boolean; withhold: boolean; reason: string } {
  const approver = c.roles.includes('customer_sponsor') || c.roles.includes('onboarding_authority');
  if (!approver) return { approve: false, withhold: false, reason: 'go-live is the customer sponsor\'s or the onboarding authority\'s act — this session holds neither' };
  if (c.roles.includes('implementation_lead')) return { approve: false, withhold: false, reason: 'an implementation lead never approves or accepts on the customer\'s behalf (separation of duties), even holding an approving role' };
  if (gate === null) return { approve: false, withhold: false, reason: 'the gate has not been read' };
  if (gate.state === 'accepted' || gate.state === 'withdrawn') return { approve: false, withhold: false, reason: `the programme is ${gate.state}` };
  if (gate.state !== 'ready') return { approve: false, withhold: true, reason: 'the gate is HELD: approval is refused until every blocking item is satisfied — no measure, cohort result or percentage releases it' };
  return { approve: true, withhold: true, reason: 'eligible: a named approver on the exact digest shown' };
}

/** The consequence of an approval, stated before it is made. */
export function consequencePreview(p: { title: string; version: number } | null, gate: Pick<Gate, 'digest'> | null, journeys: string[], cadence: string | null): string {
  if (p === null || gate === null) return 'nothing selected';
  return `Approving signs go-live of “${p.title}” v${p.version} at gate digest ${gate.digest.slice(0, 12)}…, accepts the operating cadence ${cadence ?? '(none chosen)'} and ${journeys.length} priority journey(s), `
    + 'and records the acceptance (exact versions, roles, paths, cohorts, shadow review, measures) as a DEMONSTRATION — the customer\'s own acceptance is R2. It cannot be undone; withholding changes nothing.';
}

/** A cohort count shown only at or above k — below k INDETERMINATE (never a percentage of fewer than k people). */
export function cohortShare(complete: number, holders: number, k = 5): string {
  if (holders < k) return `INDETERMINATE — ${holders} holder(s), below k = ${k}: no share is shown`;
  return `${complete} of ${holders} (${Math.round((complete / holders) * 100)} %)`;
}

/** A measure's latest result, worded honestly (an indeterminate or unsupported result is never shown as a value). */
export function measureLine(m: Row): string {
  const latest = (m['latest'] ?? null) as Row | null;
  if (latest === null) return `${String(m['metric_key'])} v${String(m['version'])} — not computed yet`;
  const reasons = Array.isArray(latest['reasons']) ? (latest['reasons'] as unknown[]).map(String) : [];
  if (latest['state'] !== 'determinate') return `${String(m['metric_key'])} — ${String(latest['state']).toUpperCase()} (${String(latest['period_key'])}): ${reasons.join('; ') || 'no reason recorded'}`;
  return `${String(m['metric_key'])} — ${String(latest['value'])} (${String(latest['period_key'])})`;
}

/** A DATE renders as the day it names (YYYY-MM-DD is never shifted through a time zone). */
export function dayText(v: unknown): string {
  const s = String(v ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s === '' ? '—' : s;
}

/** A guard against stale responses when the page loads by selection: only the latest request's answer is applied. */
export function latestGuard(): { next: () => number; current: (n: number) => boolean } {
  let seq = 0;
  return { next: () => ++seq, current: (n: number) => n === seq };
}
