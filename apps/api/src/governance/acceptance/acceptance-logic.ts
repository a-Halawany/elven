/**
 * B107 §AR (0115_b107_x_ar) — THE PURE RULES of scope-specific acceptance: the vocabularies (mirroring the SQL functions governance.ar_*), the
 * request-shape checks a route answers before any port runs, the opt-in request gate's exemptions (the entitlement gate's list plus
 * governance.*), the action-prefix match, and the mirrors of the effective scope (FEX-31) and the expansion (ES-71-004) the workspace words.
 * No database here; the PORTS decide every rule (they re-check what the routes check).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (this code and its harnesses); DEMONSTRATED OPERATION (the act — every record claim =
 * 'demonstration'); REAL ACCEPTANCE by named independent and customer authorities (R2) — never claimed, never recordable here.
 */
import { entitlementExemption, type Exemption } from '../../commercial/entitlements/entitlement-gate.js';

export const RECORD_KINDS = ['capability', 'operational', 'release', 'design'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export const OBLIGATIONS = ['product', 'independent_assurance', 'operations', 'security', 'privacy', 'ai_fitness', 'data', 'business', 'customer', 'design'] as const;
export type Obligation = (typeof OBLIGATIONS)[number];
/** governance.ar_obligation_roles — who may attest each obligation (the demonstration's staffing; the real people are H2's). */
export const OBLIGATION_ROLES: Record<Obligation, readonly string[]> = {
  product: ['product_authority'], independent_assurance: ['independent_assurance'], operations: ['operations_authority'], security: ['independent_assurance'],
  privacy: ['privacy_officer'], ai_fitness: ['independent_assurance'], data: ['data_steward'], business: ['executive', 'customer_sponsor'],
  customer: ['customer_sponsor', 'onboarding_authority'], design: ['design_system_authority'],
};
/** governance.ar_min_obligations — a proposer may add obligations, never remove these. */
export const MIN_OBLIGATIONS: Record<RecordKind, readonly Obligation[]> = {
  capability: ['product', 'independent_assurance', 'customer'], operational: ['operations', 'independent_assurance', 'customer'],
  release: ['product', 'independent_assurance'], design: ['design', 'independent_assurance'],
};
export const EVIDENCE_KINDS = ['test_report', 'journey_evidence', 'build', 'release_candidate', 'conformance', 'exercise', 'drill', 'incident', 'change', 'readiness',
  'runbook', 'dashboard', 'alert', 'on_call', 'incident_roles', 'capacity', 'backup', 'recovery', 'degraded_mode', 'customer_communications', 'escalation',
  'security_review', 'privacy_review', 'accessibility', 'resilience', 'support_readiness', 'parity', 'deployment',
  'migration_acceptance', 'golive_decision', 'admission_record', 'value_review', 'design_package', 'other'] as const;
export const EVIDENCE_SUBJECTS = ['onboarding.migration_acceptance', 'implementation.golive_decision', 'service.admission_record', 'service.value_review', 'service.control_drill',
  'service.joint_exercise', 'executive.signature', 'governance.artifact', 'external'] as const;
/** governance.ar_slots — the evidence a kind expects; an absent current item is an OPEN CONDITION (ES-71-003, TS-020, PR-71-006). */
export const SLOTS: Record<RecordKind, readonly string[]> = {
  operational: ['runbook', 'dashboard', 'alert', 'on_call', 'incident_roles', 'capacity', 'backup', 'recovery', 'degraded_mode', 'customer_communications', 'escalation'],
  capability: ['security_review', 'privacy_review', 'accessibility', 'resilience', 'recovery', 'support_readiness', 'parity'],
  release: [], design: [],
};
export const OPERATIONAL_SCOPE_KEYS = ['artifacts', 'integrations', 'data_classes', 'workloads', 'products', 'infrastructure'] as const;
export const SCOPE_KEYS = ['capability_version', 'journeys', 'roles', 'deployment_profile', 'entitlement', 'data_versions', 'model_versions', 'configuration_digest', 'consequence_class', 'period'] as const;
export const PROFILES = ['local-dev', 'saas', 'private-cloud', 'on-premise'] as const;
export const CLASSES = ['C0', 'C1', 'C2', 'C3', 'C4'] as const;
export const ACT_TRIGGERS = ['material_change', 'incident', 'control_failure', 'model_withdrawal', 'agent_withdrawal', 'slo_exhaustion'] as const;
export const IN_FORCE = ['accepted', 'constrained', 'suspended', 'lapsed'] as const;
/** JRN-24: Trace → build → test → assure → deploy → exercise → customer verify → attest. */
export const JOURNEY_STAGES = ['trace', 'build', 'test', 'assure', 'deploy', 'exercise', 'customer_verify', 'attest'] as const;

type Row = Record<string, unknown>;

/** PAT-48 "no blanket acceptance": the first blanket value (a '*', 'all', 'any', 'every', '%', 'everything', 'everyone' string or an empty
 *  list) in a scope, as its dotted path — or null. Mirrors governance.ar_blanket. */
export function blanketPath(v: unknown, path: string[] = []): string | null {
  const BLANKET = new Set(['*', 'all', 'any', 'every', '%', 'everything', 'everyone']);
  if (typeof v === 'string') return path.length > 0 && BLANKET.has(v.trim().toLowerCase()) ? path.join('.') : null;
  if (Array.isArray(v)) {
    if (path.length > 0 && v.length === 0) return path.join('.');
    const hits = v.map((x, i) => blanketPath(x, [...path, `[${i}]`])).filter((x): x is string => x !== null);
    return hits.sort()[0] ?? null;
  }
  if (v !== null && typeof v === 'object') {
    const hits = Object.entries(v as Row).map(([k, x]) => blanketPath(x, [...path, k])).filter((x): x is string => x !== null);
    return hits.sort()[0] ?? null;
  }
  return null;
}

/** The request-shape check of a scope (the route answers it before the port; the port re-checks everything): the missing keys. */
export function missingScopeKeys(scope: Row, kind: RecordKind): string[] {
  const keys: string[] = [...SCOPE_KEYS, ...(kind === 'operational' ? OPERATIONAL_SCOPE_KEYS : [])];
  return keys.filter((k) => scope[k] === undefined || scope[k] === null);
}

/** The obligations a version will require: the kind's minimum plus the proposer's, sorted, unique. */
export function requiredObligations(kind: RecordKind, extra: readonly string[]): string[] {
  return [...new Set([...MIN_OBLIGATIONS[kind], ...extra])].sort();
}

/** governance.ar_class_rank. */
export const classRank = (c: unknown): number | null => { const i = (CLASSES as readonly string[]).indexOf(String(c)); return i < 0 ? null : i + 1; };

/** FEX-31 (mirror of governance.ar_effective_scope): the accepted scope minus what the affected items cover. */
export function effectiveScope(scope: Row, affected: ReadonlyArray<{ covers?: Row }>): Row & { removed: { journeys: string[]; roles: string[]; data: string[] } } {
  const cut = { journeys: new Set<string>(), roles: new Set<string>(), data: new Set<string>() };
  for (const a of affected) {
    const c = (a.covers ?? {}) as Record<string, unknown>;
    for (const k of ['journeys', 'roles', 'data'] as const) for (const x of (Array.isArray(c[k]) ? c[k] : []) as unknown[]) cut[k].add(String(x));
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const data = Object.fromEntries(Object.entries((scope['data_versions'] ?? {}) as Row).filter(([k]) => !cut.data.has(k)));
  return { ...scope, journeys: list(scope['journeys']).filter((j) => !cut.journeys.has(j)), roles: list(scope['roles']).filter((r) => !cut.roles.has(r)), data_versions: data,
           removed: { journeys: [...cut.journeys].sort(), roles: [...cut.roles].sort(), data: [...cut.data].sort() } };
}

/** ES-71-004 (mirror of governance.ar_expansion): what a proposed scope adds beyond the previously accepted one. */
export function expansion(prior: Row, next: Row): string[] {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const keys = (v: unknown) => Object.keys((v ?? {}) as Row);
  const out: string[] = [];
  if (next['domain'] !== prior['domain']) out.push(`domain ${String(next['domain'])}`);
  for (const j of list(next['journeys'])) if (!list(prior['journeys']).includes(j)) out.push(`journey ${j}`);
  for (const r of list(next['roles'])) if (!list(prior['roles']).includes(r)) out.push(`role ${r}`);
  if (next['deployment_profile'] !== prior['deployment_profile']) out.push(`deployment profile ${String(next['deployment_profile'])}`);
  for (const k of keys(next['data_versions'])) if (!keys(prior['data_versions']).includes(k)) out.push(`data ${k}`);
  for (const k of keys(next['model_versions'])) if (!keys(prior['model_versions']).includes(k)) out.push(`model ${k}`);
  if ((classRank(next['consequence_class']) ?? 0) > (classRank(prior['consequence_class']) ?? 0)) out.push(`consequence class ${String(next['consequence_class'])}`);
  return out;
}

// ───────────────────────── THE OPT-IN REQUEST GATE (Q5) ─────────────────────────
/** Never gated by acceptance: the entitlement gate's exemptions (a human gate, the mandatory controls, warnings and attention, corrections and
 *  withdrawals, reads of existing records) and the governance acts themselves (accepting is never gated by acceptance). */
export type AcceptanceExemption = Exemption | 'governance';
export function acceptanceGateExemption(action: string, humanGated = false): AcceptanceExemption | null {
  if (action.split('.')[0] === 'governance') return 'governance';
  return entitlementExemption(action, humanGated);
}
/** Does an action fall under an enforced prefix (`domain.supply.` covers `domain.supply.x`; a prefix without the trailing dot is exact)? */
export function matchesPrefix(action: string, prefix: string): boolean {
  return prefix.endsWith('.') ? action.startsWith(prefix) : action === prefix;
}
export function matchingCapability(action: string, enforced: ReadonlyArray<{ capability: string; prefixes: readonly string[] }>): string | null {
  let best: { cap: string; len: number } | null = null;
  for (const e of enforced) for (const p of e.prefixes) if (matchesPrefix(action, p) && (best === null || p.length > best.len)) best = { cap: e.capability, len: p.length };
  return best?.cap ?? null;
}

/** The journey's current stage in words (the first not done), from governance.ar_journey's answer. */
export function journeyText(j: { stages?: Array<{ stage: string; done: boolean }>; current?: string | null } | null): string {
  if (j === null || j.stages === undefined) return 'no journey';
  const done = j.stages.filter((s) => s.done).map((s) => s.stage);
  return j.current === null || j.current === undefined ? `complete (${done.join(' → ')})` : `at ${j.current.replace('_', ' ')} — done: ${done.join(', ') || 'none'}`;
}

/** The earliest instant at which a record in force must be reconciled again (the timer's due instant; mirrors the attest port). */
export function nextCheck(r: { evidence: ReadonlyArray<{ valid_until: string }>; conditions: ReadonlyArray<{ due: string }>; period_to: string; review_date?: string | null }, now: Date): string | null {
  const dayAfter = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString();
  const all = [...r.evidence.map((e) => new Date(e.valid_until).toISOString()), ...r.conditions.map((c) => dayAfter(c.due)), dayAfter(r.period_to),
               ...(r.review_date ? [dayAfter(r.review_date)] : [])].filter((x) => Date.parse(x) > now.getTime()).sort();
  return all[0] ?? null;
}

/** OBJ-40 / PAT-48 — the CONSEQUENCE PREVIEW of attesting a version, in words (exact scope, versions, evidence and its expiry, conditions,
 *  exceptions, what stays out). The server's record is the only input; nothing is inferred. */
export function consequencePreview(r: { kind: string; subject_key: string; scope_tuple: Row; obligations: string[]; evidence: Array<Row>; conditions: Array<Row>; exceptions: Array<Row> }): string[] {
  const s = r.scope_tuple;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).join(', ') : '—');
  const obj = (v: unknown) => Object.entries((v ?? {}) as Row).map(([k, x]) => `${k}@${String(x)}`).join(', ') || 'none';
  const period = (s['period'] ?? {}) as Row;
  const expiries = r.evidence.map((e) => String(e['valid_until'])).sort();
  const lines = [
    `When every obligation (${r.obligations.join(', ')}) is attested, ${r.subject_key} becomes ACCEPTED for exactly this scope — and nothing outside it:`,
    `· tenant ${String(s['tenant'])} · domain ${String(s['domain'])} · deployment profile ${String(s['deployment_profile'])} · entitlement ${String(s['entitlement'])}`,
    `· capability version ${String(s['capability_version'])} · journeys ${list(s['journeys'])} · roles ${list(s['roles'])}`,
    `· data ${obj(s['data_versions'])} · models ${obj(s['model_versions'])} · configuration ${String(s['configuration_digest']).slice(0, 16)}… · consequence class up to ${String(s['consequence_class'])}`,
    `· period ${String(period['from'])} → ${String(period['to'])}`,
    `Evidence: ${r.evidence.length} item(s); the first expires ${expiries[0] ?? '—'} — at that instant the capability is CONSTRAINED to the unaffected part of this scope and expansion is held until re-acceptance.`,
    r.conditions.length === 0 ? 'Conditions: none (unconditional within the scope).' : `Conditions: ${r.conditions.length} open — ${r.conditions.map((c) => `${String(c['key'])} by ${String(c['due'])}`).join('; ')} (an overdue condition constrains the acceptance).`,
    r.exceptions.length === 0 ? 'Exceptions carried: none.' : `Exceptions carried: ${r.exceptions.map((e) => `${String(e['key'])} (expires ${String(e['expires_at'] ?? '—')})`).join('; ')}.`,
  ];
  if (r.kind === 'release') lines.push(`Release candidate: ${String(((s['release'] ?? {}) as Row)['key'] ?? r.subject_key)} — a local release-candidate record (B65 substituted), not a signed release.`);
  lines.push('Claim: demonstration — real acceptance by named independent and customer authorities is R2 and is not made here.');
  return lines;
}
