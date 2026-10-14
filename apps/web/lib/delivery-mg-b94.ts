/**
 * The governed-migration client — CP-6 B94 §MG (0114 §MG; CAP-DL-06, JRN-23, PR-67-003/-005/-006, UX-66-003..006). Every response is returned
 * VERBATIM: the helpers below only WORD what the record says — the server decides what is approved, held, reconciled, activated or accepted
 * (the ports re-check every approver); nothing here computes a disposition, an eligibility the port does not re-check, or a digest.
 *
 * THREE CLAIMS: an approval or acceptance by a SYNTHETIC persona demonstrates the software only; real customer acceptance is R2.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface Scope { tenantId: string; domainId: string }
export interface Blocking { kind: string; reason?: string; state?: string; responsibility?: string; escalation_path?: string; route?: string; blocking?: number; counts?: Row;
  unmapped_columns?: string[]; missing_columns?: string[]; mapping_version?: number; approved_version?: number | null; status?: string; observed?: Row }
export interface MappingColumn { column: string; field: string | null; transforms: string[]; ignore: boolean }
export interface Mapping { version: number; spec: { key_column: string; columns: MappingColumn[] }; digest: string; basis: string; rationale: string; state: string; proposed_by: string;
  proposed_by_name: string | null; proposed_by_kind: string; proposed_at: string; decided_by: string | null; decided_by_name: string | null; decided_at: string | null; decision_reason: string | null; signature_id: string | null }
export interface Rehearsal { rehearsal_id: string; seq: number; kind: 'rehearsal' | 'post_cutover'; mapping_version: number | null; mapping_digest: string | null; mapping_state: string | null; input: Row;
  columns: string[]; unmapped_columns: string[]; missing_columns: string[]; counts: Row; blocking: number; input_digest: string | null; plan_digest: string; equal: boolean | null; ran_by_name: string | null; ran_by_kind: string; ran_at: string }
export interface StagingRow { row_no: number; legacy_id: string | null; name: string | null; values: Row; disposition: string; reasons: string[]; formula_cells: string[]; match_entity_id: string | null; match_name: string | null }
export interface Cutover { cutover_id: string; rehearsal_id: string; plan_digest: string; mapping_version: number; state: string; held: boolean; held_reasons: Blocking[]; requested_by: string; requested_by_name: string | null;
  requested_at: string; approved_by: string | null; approved_by_name: string | null; approved_at: string | null; signature_id: string | null; executed_by_kind: string | null; executed_at: string | null; execution: Row | null;
  verified_at: string | null; activated_at: string | null; rolled_back_at: string | null }
export interface Eligibility { eligible: boolean; reason: string }
export interface WaveDetail {
  wave: Row; mappings: Mapping[]; approved_mapping: Mapping | null; rehearsals: Rehearsal[]; staging: Record<string, StagingRow[]>; cutovers: Cutover[]; current_cutover: Cutover | null;
  cutover_detail: { blocking_now: Blocking[]; post_observed: Row | null; executed: Row[]; rollback_plan: Row | null; signatures: Row[] } | null; rollbacks: Row[]; acceptances: Row[];
  owner: Row | null; domain: Row | null; evidences: Row[]; mapping_signatures: Row[]; items: Row[]; ledger: Row[]; replay: Row; read_at: string;
  viewer: { principal_id: string; kind: string; roles: string[]; approve_mapping: Eligibility; approve_cutover: Eligibility; execute_rollback: Eligibility; accept: Eligibility; operate: Eligibility; activate: Eligibility };
  approval_rule: string; boundary: string; receipt: Receipt;
}

const PURPOSE = 'onboarding';
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/onboarding/migration`;
const dom = (s: Scope, action: string, objectType: string, objectId: string | null = null) => ({ scope: 'DOMAIN' as const, tenant_id: s.tenantId, domain_id: s.domainId, purpose_id: PURPOSE,
  action, object_type: objectType, object_id: objectId, consequence_class: 'C2' as const, side_effect_class: action === 'onboarding.read' ? 'none' as const : 'reversible' as const });

export const migration = {
  /** The tenant's programmes and waves (a TENANT session, or any principal bound in the tenant). */
  overview(tenantId: string): Promise<ApiResult<{ programmes: Row[]; waves: Row[]; boundary: string; receipt: Receipt }>> {
    return call(`/v1/tenants/${tenantId}/onboarding/migration/list`, { scope: 'TENANT', tenant_id: tenantId, domain_id: null, purpose_id: PURPOSE, action: 'onboarding.read', object_type: 'migration_wave', side_effect_class: 'none' });
  },
  read(s: Scope, waveId: string): Promise<ApiResult<WaveDetail>> { return call(`${base(s)}/waves/${waveId}/read`, dom(s, 'onboarding.read', 'migration_wave', waveId)); },
  suggest(s: Scope, waveId: string, evidenceId: string): Promise<ApiResult<{ suggestions: Array<MappingColumn & { basis: string; suggested: true; approved: false }>; columns: string[]; note: string; receipt: Receipt }>> {
    return call(`${base(s)}/waves/${waveId}/suggest`, dom(s, 'onboarding.read', 'migration_wave', waveId), { evidenceId });
  },
  open(s: Scope, p: { programmeId: string; key: string; title: string; sourceId: string; identifierSystem: string; identifierAuthority: string }): Promise<ApiResult<{ wave: Row; receipt: Receipt }>> {
    return call(`${base(s)}/waves/open`, dom(s, 'onboarding.wave.open', 'migration_wave'), p);
  },
  withdraw(s: Scope, waveId: string, reason: string): Promise<ApiResult<{ wave: Row; receipt: Receipt }>> { return call(`${base(s)}/waves/${waveId}/withdraw`, dom(s, 'onboarding.wave.withdraw', 'migration_wave', waveId), { reason }); },
  propose(s: Scope, waveId: string, p: { spec: Mapping['spec']; basis: 'manual' | 'adopted_suggestions'; rationale: string }): Promise<ApiResult<{ mapping: Mapping; receipt: Receipt }>> {
    return call(`${base(s)}/waves/${waveId}/mappings/propose`, dom(s, 'onboarding.mapping.propose', 'migration_wave', waveId), p);
  },
  decide(s: Scope, waveId: string, version: number, p: { digest: string; decision: 'approve' | 'reject'; reason: string }): Promise<ApiResult<{ mapping: Mapping; receipt: Receipt }>> {
    return call(`${base(s)}/waves/${waveId}/mappings/${version}/decide`, dom(s, 'onboarding.mapping.approve', 'migration_wave', waveId), p);
  },
  rehearse(s: Scope, waveId: string, p: { evidenceId: string; mappingVersion: number | null }): Promise<ApiResult<{ rehearsal: Rehearsal; receipt: Receipt }>> {
    return call(`${base(s)}/waves/${waveId}/rehearsals/run`, dom(s, 'onboarding.rehearsal.run', 'migration_wave', waveId), p);
  },
  request(s: Scope, waveId: string, rehearsalId: string): Promise<ApiResult<{ cutover: Cutover; held: boolean; blocking: Blocking[]; receipt: Receipt }>> {
    return call(`${base(s)}/waves/${waveId}/cutover/request`, dom(s, 'onboarding.cutover.request', 'cutover'), { rehearsalId });
  },
  recheck(s: Scope, cutoverId: string): Promise<ApiResult<{ cutover: Cutover; held: boolean; blocking: Blocking[]; receipt: Receipt }>> {
    return call(`${base(s)}/cutovers/${cutoverId}/recheck`, dom(s, 'onboarding.cutover.recheck', 'cutover', cutoverId));
  },
  approve(s: Scope, cutoverId: string, p: { digest: string; reason: string }): Promise<ApiResult<{ held: boolean; cutover: Cutover; receipt: Receipt }>> {
    return call(`${base(s)}/cutovers/${cutoverId}/approve`, dom(s, 'onboarding.cutover.approve', 'cutover', cutoverId), p);
  },
  execute(s: Scope, cutoverId: string): Promise<ApiResult<{ cutover: Cutover; failures: Row[]; receipt: Receipt }>> { return call(`${base(s)}/cutovers/${cutoverId}/execute`, dom(s, 'onboarding.cutover.execute', 'cutover', cutoverId)); },
  reconcile(s: Scope, cutoverId: string): Promise<ApiResult<{ reconciliation: Rehearsal; held: boolean; receipt: Receipt }>> { return call(`${base(s)}/cutovers/${cutoverId}/reconcile`, dom(s, 'onboarding.cutover.reconcile', 'cutover', cutoverId)); },
  activate(s: Scope, cutoverId: string): Promise<ApiResult<{ activation: Row; receipt: Receipt }>> {
    return call(`/v1/tenants/${s.tenantId}/onboarding/migration/domains/${s.domainId}/activate`, { scope: 'TENANT', tenant_id: s.tenantId, domain_id: null, purpose_id: PURPOSE,
      action: 'tenancy.domain.activate', object_type: 'domain', object_id: s.domainId, consequence_class: 'C2' }, { cutoverId });
  },
  rehearseRollback(s: Scope, cutoverId: string): Promise<ApiResult<{ rollback: Row; receipt: Receipt }>> { return call(`${base(s)}/cutovers/${cutoverId}/rollback/rehearse`, dom(s, 'onboarding.rollback.rehearse', 'cutover', cutoverId)); },
  executeRollback(s: Scope, cutoverId: string, p: { rehearsalId: string; digest: string; reason: string }): Promise<ApiResult<{ rollback: Row; receipt: Receipt }>> {
    return call(`${base(s)}/cutovers/${cutoverId}/rollback/execute`, dom(s, 'onboarding.rollback.execute', 'cutover', cutoverId), p);
  },
  candidate(s: Scope, waveId: string, p: { journeys: string[]; roles: string[]; baselineDigest: string | null }): Promise<ApiResult<{ candidate: Row; digest: string; claim: string; note: string; receipt: Receipt }>> {
    return call(`${base(s)}/waves/${waveId}/acceptance/candidate`, dom(s, 'onboarding.read', 'migration_wave', waveId), p);
  },
  decideAcceptance(s: Scope, waveId: string, p: { decision: 'accept' | 'withhold'; journeys: string[]; roles: string[]; baselineDigest: string | null; digest: string; reason: string }): Promise<ApiResult<{ acceptance: Row; receipt: Receipt }>> {
    return call(`${base(s)}/waves/${waveId}/acceptance/decide`, dom(s, 'onboarding.acceptance.decide', 'migration_wave', waveId), p);
  },
};

// ───────────────────────── pure wording (unit-tested) ─────────────────────────
/** A state, VISIBLY distinct: a held object is HELD whatever its progression; a proposal is never worded or coloured like an approval. */
export function stateBadge(state: string, held = false): { text: string; token: string; glyph: string } {
  if (held) return { text: `HELD (${state.replace(/_/g, ' ')})`, token: '--eye-color-critical', glyph: '⏸' };
  switch (state) {
    case 'proposed': case 'requested': return { text: `${state.toUpperCase()} — awaiting the customer authority`, token: '--eye-color-uncertain', glyph: '○' };
    case 'approved': case 'cutover_approved': return { text: 'APPROVED by the customer authority', token: '--eye-color-accent-strong', glyph: '✓' };
    case 'reconciled': case 'verified': return { text: state === 'verified' ? 'VERIFIED — the post-cutover reconciliation equals the rehearsal' : 'RECONCILED against the approved mapping', token: '--eye-color-success', glyph: '✓' };
    case 'executed': return { text: 'EXECUTED — not yet reconciled', token: '--eye-color-warning', glyph: '…' };
    case 'activated': return { text: 'ACTIVATED', token: '--eye-color-success', glyph: '●' };
    case 'accepted': return { text: 'ACCEPTED (demonstration)', token: '--eye-color-success', glyph: '★' };
    case 'rolled_back': case 'withdrawn': case 'rejected': case 'superseded': return { text: state.replace(/_/g, ' ').toUpperCase(), token: '--eye-color-ink-muted', glyph: '—' };
    default: return { text: state.replace(/_/g, ' '), token: '--eye-color-ink-default', glyph: '·' };
  }
}

/** One blocking item, in words, with its route to closure (UX-66-005). */
export function blockingLine(b: Blocking): string {
  switch (b.kind) {
    case 'owner_gap': return `No resolved accountable owner for ${b.responsibility ?? 'the responsibility'} (${b.state ?? 'undeclared'}): ${b.reason ?? ''}${b.escalation_path ? ` — escalation: ${b.escalation_path}` : ''}`;
    case 'reconciliation': return `The reconciliation has ${String(b.blocking ?? '?')} blocking item(s)${(b.unmapped_columns ?? []).length > 0 ? `; unmapped columns: ${(b.unmapped_columns ?? []).join(', ')}` : ''} — ${b.route ?? 'remediate and rehearse again'}`;
    case 'mapping_not_approved': return `The rehearsal ran mapping v${String(b.mapping_version ?? '?')}; the approved mapping is ${b.approved_version === null || b.approved_version === undefined ? 'none' : `v${b.approved_version}`}`;
    case 'rehearsal_superseded': return 'A later rehearsal exists — request the cutover on the latest';
    case 'domain_state': return `The target domain is ${b.status ?? '?'}, not draft`;
    case 'post_cutover': return `The post-cutover reconciliation differs from the approved rehearsal (${String((b.observed ?? {})['observed'] ?? '?')} of ${String((b.observed ?? {})['expected'] ?? '?')} observed) — the domain stays draft`;
    case 'cutover': return 'The cutover is held (see the cutover)';
    default: return `${b.kind}${b.reason ? `: ${b.reason}` : ''}`;
  }
}

/** The reconciliation report's counts, in the clause's order (CAP-DL-06). */
export function countsLine(c: Row): string {
  const n = (k: string) => Number(c[k] ?? 0);
  return `${n('rows')} rows · mapped ${n('mapped')} (would create ${n('would_create')}, would match ${n('would_match')}) · rejected ${n('rejected')} (missing key ${n('rejected_missing_key')}, formula cell ${n('rejected_formula_cell')}, bad value ${n('rejected_bad_value')}) · ambiguous ${n('ambiguous')} · conflict ${n('conflict')} · unmapped columns ${n('unmapped_columns')}`;
}

/** The DIFF of two rehearsals' staging (UX-66-003: a correction is visible): each row whose disposition changed, appeared or disappeared. */
export function diffRehearsals(before: StagingRow[], after: StagingRow[]): Array<{ row_no: number; legacy_id: string | null; before: string | null; after: string | null; reasons: string[] }> {
  const key = (r: StagingRow) => String(r.row_no);
  const b = new Map(before.map((r) => [key(r), r])); const a = new Map(after.map((r) => [key(r), r]));
  const out: Array<{ row_no: number; legacy_id: string | null; before: string | null; after: string | null; reasons: string[] }> = [];
  for (const k of [...new Set([...b.keys(), ...a.keys()])].sort((x, y) => Number(x) - Number(y))) {
    const x = b.get(k); const y = a.get(k);
    if (x !== undefined && y !== undefined && x.disposition === y.disposition && x.legacy_id === y.legacy_id) continue;
    out.push({ row_no: Number(k), legacy_id: y?.legacy_id ?? x?.legacy_id ?? null, before: x?.disposition ?? null, after: y?.disposition ?? null, reasons: x?.reasons ?? [] });
  }
  return out;
}

/** What approving the cutover WILL do (a consequence preview — the deliberate act's content, UX-66-004). */
export function consequencePreview(r: Rehearsal | null, domainName: string): string {
  if (r === null) return 'No rehearsal is named.';
  const c = r.counts; const create = Number(c['would_create'] ?? 0); const match = Number(c['would_match'] ?? 0);
  return `Approving authorizes the migration of ${create + match} legacy rows into "${domainName}": ${create} new organization entities with their legacy identifiers, ${match} identifier(s) attached to existing entities; rejected or ambiguous rows are never written. Execution may be automated but writes ONLY these approved rows; the domain stays draft until the post-cutover reconciliation equals this rehearsal and the tenant administrator activates it. The legacy risk ratings ride as provenance — no exposure is registered.`;
}

export const shortDigest = (d: unknown): string => (typeof d === 'string' && d.length >= 12 ? `${d.slice(0, 12)}…` : String(d ?? '—'));

/** A disabled control says why (never a silent grey button). */
export function disabledReason(e: Eligibility | undefined, extra: string | null = null): string | null {
  if (e === undefined) return 'eligibility unknown — refresh';
  if (!e.eligible) return e.reason;
  return extra;
}

/** A stale-response guard: only the latest request of a kind may set the page (a selection can change mid-flight). */
export function latestOnly(): { next: () => number; isLatest: (n: number) => boolean } {
  let current = 0;
  return { next: () => { current += 1; return current; }, isLatest: (n: number) => n === current };
}

/** The suggestions turned into a draft spec for the lead to REVIEW — nothing is proposed until the lead proposes it; a column without a
 *  confident field is LEFT OUT (neither mapped nor ignored: the lead decides, and a rehearsal counts it as unmapped until then). */
export function draftFromSuggestions(s: Array<MappingColumn>): Mapping['spec'] {
  const columns = s.filter((x) => x.field !== null).map((x) => ({ column: x.column, field: x.field, transforms: x.transforms, ignore: false }));
  return { key_column: columns.find((c) => c.field === 'legacy_id')?.column ?? '', columns };
}
