/**
 * B94 §SA (0114_b94_x_sa) — THE PURE LOGIC of responsibility, ownership and support access: the reconciliation's FINDINGS (desired — the
 * signed matrix — against the observed state: owners resolved live, operator and authority holders, support engineers' other roles, live
 * grants, the attention routes, the agents' owners, the contract's support boundary), the grant window, the status of a grant on a clock,
 * and the consequence preview an approver reads. Nothing here decides a rule a port decides: the gaps that HOLD an act are decided live in
 * the database (service.owner_resolution); these findings are the record of what reconciliation saw.
 *
 * THREE CLAIMS, never mixed: construction (this code and its tests); demonstrated operation (the act on SYNTHETIC NORDWERK records); real
 * customer acceptance / production admission (R1/R2 — never claimed here).
 */

type Row = Record<string, unknown>;

export const GRANT_ACTIONS = ['diagnose.source', 'diagnose.runs', 'diagnose.health', 'diagnose.schedule', 'case.note', 'case.bundle', 'case.workaround'] as const;
export type GrantAction = (typeof GRANT_ACTIONS)[number];
export const DIAGNOSTICS = ['source', 'runs', 'health', 'schedule'] as const;
export type Diagnostic = (typeof DIAGNOSTICS)[number];
export const GRANT_MINUTES = { min: 15, max: 1440, default: 240 } as const;
/** The shared vocabulary (the prelude's §0): each key's accountable owner role. */
export const VOCABULARY: Readonly<Record<string, string>> = {
  'domain.operation': 'domain_admin', 'risk.ownership': 'risk_owner', 'data.migration': 'onboarding_authority', 'support.access': 'domain_admin',
  'evidence.custody': 'data_steward', 'decision.ownership': 'decision_owner',
};
export const PROFILES = ['local-dev', 'saas', 'private-cloud', 'on-premise'] as const;

/** The grant's duration: the default when not named; refused outside 15 min – 24 h (the port re-checks). */
export function grantMinutes(v: unknown): { ok: true; minutes: number } | { ok: false; reason: string } {
  if (v === undefined || v === null) return { ok: true, minutes: GRANT_MINUTES.default };
  if (typeof v !== 'number' || !Number.isInteger(v)) return { ok: false, reason: 'durationMinutes is a whole number of minutes' };
  if (v < GRANT_MINUTES.min || v > GRANT_MINUTES.max) return { ok: false, reason: `a grant lasts ${GRANT_MINUTES.min} minutes to 24 hours (asked ${v})` };
  return { ok: true, minutes: v };
}

export type GrantStatus = 'pending' | 'live' | 'expired_unswept' | 'lapsed' | 'revoked' | 'denied' | 'withdrawn';
/** A grant's status on a clock (the database's instant): an approved grant past its expiry is EXPIRED before any sweep marks it lapsed. */
export function grantStatus(g: { state: string; expires_at?: string | null }, nowIso: string): GrantStatus {
  switch (g.state) {
    case 'requested': return 'pending';
    case 'approved': return g.expires_at !== null && g.expires_at !== undefined && Date.parse(g.expires_at) <= Date.parse(nowIso) ? 'expired_unswept' : 'live';
    case 'lapsed': case 'revoked': case 'denied': case 'withdrawn': return g.state;
    default: return 'denied';
  }
}

/** What the approver approves, in words (the port records the same preview on the grant). */
export function consequencePreview(g: { case_ref?: unknown; purpose?: unknown; action_scope?: unknown; object_scope?: unknown; duration_minutes?: unknown }): string[] {
  const sources = (((g.object_scope ?? {}) as Row)['sources'] ?? []) as unknown[];
  const actions = (Array.isArray(g.action_scope) ? g.action_scope : []) as string[];
  const minutes = Number(g.duration_minutes ?? 0);
  return [
    `For case ${String(g.case_ref ?? '?')}: ${String(g.purpose ?? '')}`,
    `The engineer may: ${actions.join(', ') || 'nothing'} — on ${sources.length} named source${sources.length === 1 ? '' : 's'} only`,
    `For ${minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 === 0 ? '' : ` ${minutes % 60} min`}` : `${minutes} min`} from the approval; then the access lapses by itself`,
    'Never: a write to customer decisions, evidence, policy or source state; evidence content; another source',
    'Every read is logged with the grant; you can revoke it at any moment',
  ];
}

export type FindingClass = 'gap' | 'drift';
export interface Finding { class: FindingClass; kind: string; key: string | null; detail: string }

/**
 * THE RECONCILIATION FINDINGS (IA-04-002): `gap` — no unambiguous accountable owner (unfilled, ambiguous, undeclared; no approved matrix);
 * `drift` — the observed state departs from the declaration without (yet) stopping an act: an operator role or customer authority nobody
 * holds, a vocabulary responsibility the matrix does not declare, a support engineer who also holds customer roles, a live grant whose
 * engineer no longer holds the role, a support / gap class the attention policy does not route (or routes to nobody), an agent whose owner
 * or escalation principal is not live, the contract's support boundary changed since the matrix was approved (descriptive — never a matrix
 * change, IA-04-003). Ordered deterministically.
 */
export function reconcileFindings(observed: Row): Finding[] {
  const out: Finding[] = [];
  const matrix = (observed['matrix'] ?? null) as Row | null;
  const rows = (Array.isArray(observed['rows']) ? observed['rows'] : []) as Row[];
  if (matrix === null) {
    out.push({ class: 'gap', kind: 'matrix_undeclared', key: null, detail: 'the domain has no approved responsibility matrix for this profile' });
  } else {
    for (const r of rows) {
      const key = String(r['key']); const res = (r['resolution'] ?? {}) as Row; const state = String(res['state'] ?? 'undeclared');
      if (state !== 'resolved') out.push({ class: 'gap', kind: `owner_${state}`, key, detail: String(res['reason'] ?? `the owner of ${key} is ${state}`) });
      if (Number(r['operator_holders'] ?? 0) === 0) out.push({ class: 'drift', kind: 'operator_unfilled', key, detail: `nobody holds the operator role ${String(r['operator_role'])}` });
      if (Number(r['authority_holders'] ?? 0) === 0) out.push({ class: 'drift', kind: 'authority_unfilled', key, detail: `nobody holds the customer authority ${String(r['customer_authority'])}` });
    }
    const declared = new Set(rows.map((r) => String(r['key'])));
    const vocab = ((observed['vocabulary'] ?? VOCABULARY) as Row);
    for (const k of Object.keys(vocab).sort()) if (!declared.has(k)) out.push({ class: 'drift', kind: 'responsibility_undeclared', key: k, detail: `the matrix does not declare ${k} (owner ${String(vocab[k])})` });
    const declaredBoundary = (matrix['support_boundary'] ?? null) as Row | null;
    const boundary = (observed['support_boundary'] ?? null) as Row | null;
    if ((declaredBoundary?.['digest'] ?? null) !== (boundary?.['digest'] ?? null)) {
      out.push({ class: 'drift', kind: 'support_boundary_changed', key: null,
        detail: `the contract's support boundary is ${boundary === null ? 'absent' : `tier ${String(boundary['tier'])} (contract v${String(boundary['version'])})`} but the matrix v${String(matrix['version'])} was approved with ${declaredBoundary === null ? 'none' : `tier ${String(declaredBoundary['tier'])}`} — a new matrix version, not the contract, transfers responsibility` });
    }
  }
  for (const e of (Array.isArray(observed['engineers']) ? observed['engineers'] : []) as Row[]) {
    const other = (Array.isArray(e['other_roles']) ? e['other_roles'] : []) as string[];
    if (other.length > 0) out.push({ class: 'drift', kind: 'support_privilege', key: null, detail: `support engineer ${String(e['principal'])} also holds ${other.join(', ')} — support access never rides on customer roles` });
  }
  for (const g of (Array.isArray(observed['live_grants']) ? observed['live_grants'] : []) as Row[]) {
    if (g['engineer_holds_role'] !== true) out.push({ class: 'drift', kind: 'grant_without_role', key: null, detail: `live grant ${String(g['grant_id'])}'s engineer no longer holds support_engineer` });
  }
  const routes = (observed['routes'] ?? {}) as Row;
  for (const c of ['support.access', 'responsibility.gap']) {
    const r = (routes[c] ?? {}) as Row; const roles = r['route_roles'];
    if (!Array.isArray(roles) || roles.length === 0) out.push({ class: 'drift', kind: 'class_unrouted', key: c, detail: `the attention policy does not route ${c} (its items are deprioritized, never hidden)` });
    else if (Number(r['holders'] ?? 0) === 0) out.push({ class: 'drift', kind: 'route_unfilled', key: c, detail: `${c} routes to ${(roles as string[]).join(', ')} but nobody holds them` });
  }
  for (const a of (Array.isArray(observed['agents']) ? observed['agents'] : []) as Row[]) {
    if (a['owner_active'] !== true) out.push({ class: 'drift', kind: 'agent_owner_inactive', key: null, detail: `agent ${String(a['agent_id'])} (${String(a['kind'])}) has no live owner` });
    if (a['escalation_active'] !== true) out.push({ class: 'drift', kind: 'agent_escalation_inactive', key: null, detail: `agent ${String(a['agent_id'])} (${String(a['kind'])}) escalates to no live principal` });
  }
  const rank = (f: Finding) => (f.class === 'gap' ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.kind.localeCompare(b.kind) || String(a.key ?? '').localeCompare(String(b.key ?? '')) || a.detail.localeCompare(b.detail));
}

/** The matrix rows a request proposes, shaped (the port validates every rule; this only refuses what is not even a row). */
export function matrixRows(v: unknown): { ok: true; rows: Row[] } | { ok: false; reason: string } {
  if (!Array.isArray(v) || v.length === 0) return { ok: false, reason: 'rows is a non-empty list of responsibilities' };
  const rows: Row[] = [];
  for (const r of v as unknown[]) {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) return { ok: false, reason: 'each row is an object' };
    const x = r as Row;
    const s = (k: string) => (typeof x[k] === 'string' ? String(x[k]).trim() : '');
    rows.push({ key: s('key'), title: s('title'), owner_role: s('ownerRole') || s('owner_role'), owner_principal_id: (s('ownerPrincipalId') || s('owner_principal_id')) || null,
      operator_role: s('operatorRole') || s('operator_role'), customer_authority: s('customerAuthority') || s('customer_authority'), access_path: s('accessPath') || s('access_path'),
      evidence_producer: s('evidenceProducer') || s('evidence_producer'), escalation_path: s('escalationPath') || s('escalation_path') });
  }
  return { ok: true, rows };
}
