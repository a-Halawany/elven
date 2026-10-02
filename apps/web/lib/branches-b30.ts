/**
 * The twin state and branch explorer client — CP-6 B30 part `branches` (0103 §BR; F-P5-03: WS-14, CAP-DS-07, FEX-14).
 *
 * Every response is returned VERBATIM: the branch tree (fork points, heads, drafts), the merges with the server's diverging keys and the
 * owner's resolutions, the frozen snapshot with its warning and expiry, the freshness the server judged by the database's day against the
 * owner's SLO (per element, and the dependency uncertainty through the twin's links), the confidence roll-up, the ledger, and — through the
 * existing as-of route — the state of a branch at an instant. The helpers below only WORD what the record says: nothing here computes an
 * age, judges staleness, decides a merge or imputes a confidence. Every figure is SYNTHETIC.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;

export interface BranchNode { branch_id: string; forked_from: number | null; head: number | null; draft: number | null; versions: number[]; withdrawn: number[] }
export interface VersionRow {
  twin_id: string; version: number; branch_id: string; forked_from_version: number | null; supersedes: number | null; state: 'draft' | 'admitted' | 'withdrawn';
  known_at: string; observed_through: string | null; completeness: string; element_count: number; verification_state: string; fitness_state: string; admitted_at: string | null;
}
export interface ElementSide { kind: string; value: unknown; unit: string | null }
export interface Diverging { key: string; change: 'changed' | 'added' | 'removed'; conflict: boolean; source: ElementSide | null; target: ElementSide | null; base: ElementSide | null }
export interface Resolution { key: string; ordinal: number; resolution: 'keep_target' | 'take_branch' | 'reconciled'; kind: string | null; value: unknown; unit: string | null; citations: Row[]; note: string; resolved_by: string; resolved_at: string }
export type MergeState = 'open' | 'reconciled' | 'completing' | 'merged' | 'refused' | 'withdrawn';
export interface Merge {
  merge_id: string; twin_id: string; source_branch: string; target_branch: string; source_version: number; target_version: number; base_version: number | null;
  diverging: Diverging[]; state: MergeState; reason: string; opened_by: string; opened_at: string; completing_by: string | null; completing_at: string | null;
  merged_version: number | null; merged_at: string | null; closed_by: string | null; closed_at: string | null; close_reason: string | null;
  resolutions: Resolution[]; unresolved: string[]; expected?: Row | null; events?: Row[];
}
export interface Freeze { freeze_id: string; twin_id: string; branch_id: string; version: number; validation_id: string; warning: string; expires_at: string; frozen_by: string; frozen_at: string;
  lifted_by: string | null; lifted_at: string | null; lift_reason: string | null }
export interface Policy { twin_id: string; version: number; max_age_days: number; key_max_age: Record<string, number>; near_expiry_hours: number; note: string; set_by: string; set_at: string }
export interface Age {
  version: number; branch_id: string; verification_state: string; basis: 'observed_through' | 'known_at'; reference_day: string; today: string; age_days: number;
  policy: { version: number; max_age_days: number; key_max_age: Record<string, number>; near_expiry_hours: number } | null; state: 'fresh' | 'stale' | 'unknown'; stale_by_days: number | null;
}
export interface ElementFreshness { key: string; kind: string; health: string; valid_from: string | null; valid_to: string | null; age_days: number; max_age_days: number | null; state: 'fresh' | 'stale' | 'expired' | 'unbounded' }
export interface Upstream { twin_id: string; title: string; link_id: string; head_version: number | null; cited_version: number | null; behind: boolean; verification_state: string | null; freshness: string; age_days: number | null }
export interface Freshness extends Age {
  twin_id: string; state_of_version: string; known_at: string; observed_through: string | null; fitness_state: string; elements: ElementFreshness[]; stale_elements: number;
  dependency: { state: 'none' | 'certain' | 'uncertain'; upstream: Upstream[]; rule: string }; method: string;
}
export interface Served {
  twin_id: string; as_of: string; mode: 'frozen' | 'head' | 'none'; version: number | null; branch_id: string; head_version: number | null; runs_allowed: boolean;
  freeze_id?: string; validation_id?: string; warning?: string; expires_at?: string; expired?: boolean; nearing_expiry?: boolean; frozen_by?: string; frozen_at?: string; freshness: Age | null;
}
export interface ConfidenceGroup { component?: string; kind?: string; elements: number; stated: number; weakest: number | null; mean: number | null; coverage: number; unhealthy: number; kinds?: string[] }
export interface Confidence { twin_id: string; version: number; overall: { elements: number; stated: number; weakest: number | null; mean: number | null; coverage: number | null; unhealthy: number };
  components: ConfidenceGroup[]; kinds: ConfidenceGroup[]; method: string }
export interface Explorer {
  twin: { twin_id: string; title: string; kind: string; owner_principal_id: string; behaviour_model_ref: string; synthetic_state: boolean };
  branches: BranchNode[]; versions: VersionRow[]; merges: Merge[]; freezes: Freeze[]; policy: Policy | null; policies: Policy[]; served: Served | null;
  head_freshness: Freshness | null; head_confidence: Confidence | null; restores: Array<{ event_id: string; details: Row; occurred_at: string }>;
  events: Array<{ event_id: string; event: string; subject_id: string; actor_principal_id: string | null; details: Row; occurred_at: string }>; read_at: string;
}

/* ───────────── the words ───────────── */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** THE FRESHNESS BANNER — the server's judgement in words (never colour alone). `level` picks the token. */
export function freshnessBanner(f: Pick<Age, 'version' | 'age_days' | 'state' | 'policy' | 'stale_by_days' | 'basis' | 'reference_day'> | null | undefined):
  { level: 'stale' | 'fresh' | 'unknown'; glyph: string; token: string; text: string } {
  if (f === null || f === undefined) return { level: 'unknown', glyph: '○', token: '--eye-color-ink-muted', text: 'NO ADMITTED STATE — nothing is served' };
  const basis = f.basis === 'observed_through' ? `its state is observed through ${f.reference_day}` : `its state was known on ${f.reference_day}`;
  if (f.state === 'stale') {
    return { level: 'stale', glyph: '◍', token: '--eye-color-warning',
      text: `STALE — the served snapshot v${f.version} is ${plural(f.age_days, 'day')} stale: ${basis}; the freshness SLO is ${plural(f.policy?.max_age_days ?? 0, 'day')} (v${f.policy?.version ?? '?'}), exceeded by ${plural(f.stale_by_days ?? 0, 'day')}` };
  }
  if (f.state === 'fresh') {
    return { level: 'fresh', glyph: '●', token: '--eye-color-success',
      text: `FRESH — the served snapshot v${f.version} is ${plural(f.age_days, 'day')} old: ${basis}; within the freshness SLO of ${plural(f.policy?.max_age_days ?? 0, 'day')}` };
  }
  return { level: 'unknown', glyph: '○', token: '--eye-color-ink-muted', text: `NO FRESHNESS SLO — the served snapshot v${f.version} is ${plural(f.age_days, 'day')} old (${basis}); its owner has set no policy` };
}

/** The served state: a frozen snapshot (with its warning and expiry) or the head. */
export function servedLine(s: Served | null | undefined): string {
  if (s === null || s === undefined || s.mode === 'none') return 'nothing is served — no admitted version on actual';
  if (s.mode === 'head') return `the head v${s.version} of actual is served`;
  const exp = s.expired === true ? `EXPIRED at ${s.expires_at} — a run on it is refused` : `${s.nearing_expiry === true ? 'NEARING EXPIRY' : 'expires'} at ${s.expires_at}`;
  return `FROZEN — the validated snapshot v${s.version} is served instead of the head v${s.head_version ?? '?'}: “${s.warning ?? ''}” · ${exp}`;
}

/** A merge's state, in words. */
export function mergeStateMark(m: Pick<Merge, 'state' | 'unresolved' | 'diverging' | 'merged_version'>): { glyph: string; token: string; text: string } {
  switch (m.state) {
    case 'open': return { glyph: '◌', token: '--eye-color-warning', text: `OPEN — merging back is refused until reconciliation: ${m.unresolved.length} of ${m.diverging.length} diverging key(s) unresolved` };
    case 'reconciled': return { glyph: '◍', token: '--eye-color-accent-default', text: 'RECONCILED — every diverging key is resolved; the twin\'s owner may complete it' };
    case 'completing': return { glyph: '▶', token: '--eye-color-accent-default', text: 'COMPLETING — the plan is fixed and actual is held until its admission' };
    case 'merged': return { glyph: '●', token: '--eye-color-success', text: `MERGED — admitted on actual as v${m.merged_version ?? '?'}` };
    case 'refused': return { glyph: '✕', token: '--eye-color-critical', text: 'REFUSED by the twin\'s owner' };
    case 'withdrawn': return { glyph: '—', token: '--eye-color-ink-muted', text: 'WITHDRAWN' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(m.state).toUpperCase() };
  }
}

const side = (s: ElementSide | null): string => (s === null ? 'absent' : `${JSON.stringify(s.value)}${s.unit ? ` ${s.unit}` : ''} (${s.kind})`);
/** One diverging key: the branch's value against actual's (and the fork point's), as the server computed it. */
export function divergingLine(d: Diverging): string {
  return `${d.key}: branch ${side(d.source)} · actual ${side(d.target)}${d.base === null ? '' : ` · fork point ${side(d.base)}`}${d.conflict ? ' · CONFLICT (actual changed it too)' : ''}`;
}
/** A resolution, in words. */
export function resolutionLine(r: Resolution | undefined): string {
  if (r === undefined) return 'UNRESOLVED';
  if (r.resolution === 'keep_target') return `keep actual's value — ${r.note}`;
  if (r.resolution === 'take_branch') return `take the branch's element — ${r.note}`;
  return `reconciled: ${JSON.stringify(r.value)}${r.unit ? ` ${r.unit}` : ''} (${r.kind}, citing ${r.citations.length}) — ${r.note}`;
}
/** A confidence group: the weakest link and the mean of what is STATED, with the coverage — never imputed. */
export function confidenceLine(g: Pick<ConfidenceGroup, 'elements' | 'stated' | 'weakest' | 'mean' | 'coverage' | 'unhealthy'>): string {
  if (g.stated === 0) return `no stated confidence (0 of ${g.elements})${g.unhealthy > 0 ? ` · ${g.unhealthy} unhealthy` : ''}`;
  return `weakest ${g.weakest} · mean ${g.mean} · ${g.stated} of ${g.elements} stated (${Math.round(g.coverage * 1000) / 10}%)${g.unhealthy > 0 ? ` · ${g.unhealthy} unhealthy` : ''}`;
}
/** The dependency uncertainty, in words. */
export function dependencyLine(d: Freshness['dependency'] | undefined): string {
  if (d === undefined || d.state === 'none') return 'no upstream twin (no live link)';
  const ups = d.upstream.map((u) => `${u.title} v${u.head_version ?? '—'} ${u.freshness}${u.verification_state === 'unverified' ? ' UNVERIFIED' : ''}${u.behind ? ` (this version cites v${u.cited_version})` : ''}`).join('; ');
  return `${d.state === 'uncertain' ? 'UNCERTAIN' : 'certain'} — ${ups}`;
}
/** A ledger row, in words. */
export function branchEventLine(e: { event: string; details: Row }): string {
  const d = e.details;
  switch (e.event) {
    case 'merge.opened': return `merge of ${String(d['source_branch'])} v${String(d['source_version'])} into actual v${String(d['target_version'])} opened — ${((d['diverging_keys'] ?? []) as string[]).length} diverging key(s)`;
    case 'merge.key_resolved': return `${String(d['key'])} resolved ${String(d['resolution'])}`;
    case 'merge.merged': return `merged as actual v${String(d['merged_version'])}`;
    case 'checkpoint.restored': return `checkpoint v${String(d['from_version'])} restored on ${String(d['branch_id'])} as draft v${String(d['draft_version'])} — ${String(d['reason'] ?? '')}`;
    case 'snapshot.frozen': return `v${String(d['version'])} frozen until ${String(d['expires_at'])}`;
    case 'snapshot.lifted': return `freeze of v${String(d['version'])} lifted — ${String(d['reason'] ?? '')}`;
    case 'freshness.policy_set': return `freshness SLO v${String(d['version'])}: ${String(d['max_age_days'])} day(s)`;
    case 'freshness.breached': return `v${String(d['version'])} ${String(d['age_days'])} days old, past the SLO of ${String(d['max_age_days'])}`;
    case 'freeze.expiring': case 'freeze.expired': return `the frozen v${String(d['version'])} ${e.event === 'freeze.expired' ? 'expired' : 'nears expiry'} at ${String(d['expires_at'])}`;
    default: return e.event.replace('.', ' ');
  }
}
/** A datetime-local value (the viewer's local wall clock) as an instant, or null. */
export function instantOfLocal(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/twin-branches`;
async function p<T>(s: Scope, path: string, action: string, payload: Record<string, unknown> = {}, objectId: string | null = null, root = base(s)): Promise<ApiResult<T>> {
  const read = action === 'twin.read';
  return call<T>(`${root}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'TWN', object_id: objectId, purpose_id: 'twin',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}
const READ = 'twin.read';

export const branches = {
  explorer: (s: Scope, twinId: string) => p<{ explorer: Explorer; receipt: Receipt }>(s, `/twins/${twinId}/explorer`, READ, {}, twinId),
  freshness: (s: Scope, twinId: string, v: number) => p<{ freshness: Freshness; receipt: Receipt }>(s, `/twins/${twinId}/versions/${v}/freshness`, READ, {}, twinId),
  confidence: (s: Scope, twinId: string, v: number) => p<{ confidence: Confidence; receipt: Receipt }>(s, `/twins/${twinId}/versions/${v}/confidence`, READ, {}, twinId),
  diff: (s: Scope, twinId: string, v: number, against?: number) => p<{ diff: { version: number; against: number | null; keys: Diverging[] }; receipt: Receipt }>(s, `/twins/${twinId}/versions/${v}/diff`, READ, against === undefined ? {} : { against }, twinId),
  served: (s: Scope, twinId: string, asOf?: string) => p<{ served: Served; receipt: Receipt }>(s, `/twins/${twinId}/served`, READ, asOf === undefined ? {} : { asOf }, twinId),
  /** TIME TRAVEL: the existing twin route — the latest admitted version of a branch at or before an instant. */
  asOf: (s: Scope, twinId: string, branchId: string, instant: string) =>
    p<{ asOf: string; branchId: string; version: Row | null; receipt: Receipt }>(s, `/${twinId}/as-of`, READ, { branchId, instant }, twinId, `/v1/tenants/${s.tenantId}/domains/${s.domainId}/twins`),
  merge: (s: Scope, mergeId: string) => p<{ merge: Merge; receipt: Receipt }>(s, `/merges/${mergeId}/read`, READ),
  setPolicy: (s: Scope, twinId: string, payload: { maxAgeDays: number; keyMaxAge?: Record<string, number>; nearExpiryHours?: number; note: string }) =>
    p<{ policy: Policy; receipt: Receipt }>(s, `/twins/${twinId}/freshness-policy`, 'twin.freshness.policy', payload, twinId),
  openMerge: (s: Scope, twinId: string, sourceBranch: string, reason: string) => p<{ merge: Merge; receipt: Receipt }>(s, `/twins/${twinId}/merges/open`, 'twin.branch.merge', { sourceBranch, reason }, twinId),
  resolve: (s: Scope, mergeId: string, payload: { key: string; resolution: string; note: string; kind?: string; value?: unknown; unit?: string; citations?: Array<{ kind: string; id: string; version?: number }> }) =>
    p<{ merge: Merge; receipt: Receipt }>(s, `/merges/${mergeId}/resolve`, 'twin.branch.reconcile', payload),
  complete: (s: Scope, mergeId: string) => p<{ merge: Merge; admitted: Row; receipts: Row[]; receipt: Receipt }>(s, `/merges/${mergeId}/complete`, 'twin.branch.merge'),
  close: (s: Scope, mergeId: string, outcome: 'refused' | 'withdrawn', reason: string) => p<{ merge: Merge; receipt: Receipt }>(s, `/merges/${mergeId}/close`, 'twin.branch.merge', { outcome, reason }),
  restore: (s: Scope, twinId: string, branchId: string, fromVersion: number, reason: string) =>
    p<{ restore: Row; receipts: Row[]; receipt: Receipt }>(s, `/twins/${twinId}/restore`, 'twin.branch.restore', { branchId, fromVersion, reason }, twinId),
  freeze: (s: Scope, twinId: string, payload: { warning: string; expiresAt: string; branchId?: string; version?: number }) =>
    p<{ freeze: Freeze; receipt: Receipt }>(s, `/twins/${twinId}/freeze`, 'twin.snapshot.freeze', payload, twinId),
  lift: (s: Scope, freezeId: string, reason: string) => p<{ freeze: Freeze; receipt: Receipt }>(s, `/freezes/${freezeId}/lift`, 'twin.snapshot.freeze', { reason }),
};
