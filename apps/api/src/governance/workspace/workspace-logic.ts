/**
 * B107 §PG — the workspace's PURE logic: the request shapes a route checks before any port runs (ids are ids, instants are instants, days are
 * days — so a malformed request is the caller's 422 in the class form, never a database cast error), the approval-eligibility wording and the
 * consequence preview. Nothing here decides a rule a port decides: the ports re-check every human, role, separation-of-duties, expiry and
 * hold rule; these helpers only refuse what is malformed and EXPLAIN what the server will decide.
 */
export type Row = Record<string, unknown>;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HEX64 = /^[0-9a-f]{64}$/;
export const DAY = /^\d{4}-\d{2}-\d{2}$/;
export type Check = { ok: true } | { ok: false; field: string; reason: string };
const OK: Check = { ok: true };
const bad = (field: string, reason: string): Check => ({ ok: false, field, reason });

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
export const isInstant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
export const isDay = (v: unknown): v is string => typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const uuidList = (v: unknown): boolean => Array.isArray(v) && v.every(isUuid);

/** The act classes and duties of a decision-rights matrix (governance.ws_act_classes / ws_duties). */
export const ACT_CLASSES = ['baseline', 'decision_rights', 'exception', 'conflict', 'change', 'record', 'release'] as const;
export const DUTIES = ['propose', 'review', 'approve', 'operate', 'audit'] as const;
export const CHANGE_CLASSES = ['interface', 'object', 'policy', 'model', 'agent', 'workflow', 'deployment', 'requirement', 'capability', 'baseline', 'data_contract'] as const;
export const CHANGE_PLANS = ['consumer_impact', 'compatibility', 'migration', 'replay', 'rollback', 'evidence'] as const;
export const CONFLICT_KINDS = ['cross_volume', 'requirement', 'authority_unresolved', 'dependency_unresolved', 'data_contract'] as const;
export const RECORD_KINDS = ['decision_record', 'standard', 'debt', 'deprecation'] as const;
export const SCOPE_KEYS = ['capability_version', 'journeys', 'roles', 'tenant_or_domain', 'deployment_profile', 'entitlement', 'data_versions', 'model_versions',
  'configuration_digest', 'consequence_class', 'period'] as const;
/** The constitutional boundaries (governance.ws_constitutional_invariants): no ordinary exception waives them. */
export const CONSTITUTIONAL = ['human_authority', 'provenance', 'temporal_truth', 'tenant_isolation', 'append_only_audit', 'tamper_detection', 'fail_closed_authorization',
  'explainability', 'claim_separation', 'separation_of_duties', 'supply_chain_authorization'] as const;

/** An evidence list's SHAPE: [{kind, ref, digest (64 hex), captured_at (instant), valid_until? (instant)}]. Currency is the port's. */
export function evidenceShape(v: unknown, field = 'evidence'): Check {
  if (!Array.isArray(v) || v.length === 0) return bad(field, 'at least one evidence item {kind, ref, digest, captured_at, valid_until?}');
  for (const e of v as Row[]) {
    if (typeof e !== 'object' || e === null) return bad(field, 'an evidence item is an object');
    if (typeof e['digest'] !== 'string' || !HEX64.test(e['digest'])) return bad(field, 'an evidence item\'s digest is 64 hex');
    if (!isInstant(e['captured_at'])) return bad(field, 'an evidence item\'s captured_at is an instant (ISO 8601)');
    if (e['valid_until'] !== undefined && e['valid_until'] !== null && !isInstant(e['valid_until'])) return bad(field, 'valid_until is an instant (ISO 8601) or absent');
  }
  return OK;
}

/** An exception proposal's SHAPE (new or renewal: a renewal may omit what it keeps, but restates its expiry and its CURRENT evidence). */
export function exceptionShape(p: Row, renewal: boolean): Check {
  for (const k of ['systemScope', 'affectedArtifacts'] as const) if (p[k] !== undefined && !uuidList(p[k])) return bad(k, `${k} is a list of artifact ids`);
  if (!renewal && (!Array.isArray(p['systemScope']) || (p['systemScope'] as unknown[]).length === 0)) return bad('systemScope', 'the system scope names at least one artifact id');
  for (const k of ['owner', 'requirementArtifact'] as const) if (p[k] !== undefined && p[k] !== null && !isUuid(p[k])) return bad(k, `${k} is an id`);
  if (!renewal && !isUuid(p['owner'])) return bad('owner', 'the owner is a named principal\'s id');
  if (!isInstant(p['expiresAt'])) return bad('expiresAt', 'expiresAt is an instant (ISO 8601) — "later" is not an expiry');
  if (p['startsAt'] !== undefined && p['startsAt'] !== null && !isInstant(p['startsAt'])) return bad('startsAt', 'startsAt is an instant (ISO 8601)');
  const cs = p['customerScope'];
  if (cs !== undefined) {
    if (typeof cs !== 'object' || cs === null) return bad('customerScope', 'the customer scope is {all: true} or {tenants: [...], domains: [{tenant, domain}]}');
    const c = cs as Row;
    if (c['tenants'] !== undefined && !uuidList(c['tenants'])) return bad('customerScope', 'tenants is a list of tenant ids');
    if (c['domains'] !== undefined && !(Array.isArray(c['domains']) && (c['domains'] as Row[]).every((d) => typeof d === 'object' && d !== null && isUuid(d['tenant']) && isUuid(d['domain'])))) {
      return bad('customerScope', 'domains is a list of {tenant, domain} ids');
    }
  } else if (!renewal) return bad('customerScope', 'the customer scope is stated');
  if (p['affectedInvariants'] !== undefined && !(Array.isArray(p['affectedInvariants']) && (p['affectedInvariants'] as unknown[]).every((x) => typeof x === 'string'))) {
    return bad('affectedInvariants', 'affectedInvariants is a list of invariant names');
  }
  for (const k of ['expandsAuthority', 'removesControl'] as const) if (p[k] !== undefined && typeof p[k] !== 'boolean') return bad(k, `${k} is true or false`);
  return evidenceShape(p['evidence']);
}

export function changeShape(p: Row): Check {
  if (!(CHANGE_CLASSES as readonly string[]).includes(String(p['changeClass'] ?? ''))) return bad('changeClass', `the change class is one of ${CHANGE_CLASSES.join(', ')}`);
  if (!Array.isArray(p['subjects']) || (p['subjects'] as unknown[]).length === 0 || !uuidList(p['subjects'])) return bad('subjects', 'subjects is a non-empty list of artifact ids');
  if (p['builders'] !== undefined && !uuidList(p['builders'])) return bad('builders', 'builders is a list of principal ids');
  if (p['plans'] !== undefined && (typeof p['plans'] !== 'object' || p['plans'] === null || Array.isArray(p['plans']))) return bad('plans', `plans is an object of ${CHANGE_PLANS.join(', ')}`);
  for (const k of ['altersIdentity', 'constitutional', 'crossVolume'] as const) if (p[k] !== undefined && typeof p[k] !== 'boolean') return bad(k, `${k} is true or false`);
  return OK;
}

export function conflictShape(p: Row): Check {
  if (!(CONFLICT_KINDS as readonly string[]).includes(String(p['kind'] ?? ''))) return bad('kind', `the kind is one of ${CONFLICT_KINDS.join(', ')}`);
  if (!Array.isArray(p['conflicting']) || !uuidList(p['conflicting'])) return bad('conflicting', 'conflicting is a list of artifact ids');
  for (const k of ['impacted', 'affectedReleases'] as const) if (p[k] !== undefined && !uuidList(p[k])) return bad(k, `${k} is a list of artifact ids`);
  return OK;
}

export function resolutionShape(p: Row): Check {
  if (p['mode'] !== 'closure' && p['mode'] !== 'amendment') return bad('mode', 'the mode is closure or amendment');
  if (!isUuid(p['prevailing'])) return bad('prevailing', 'prevailing is an artifact id');
  if (p['mode'] === 'amendment' && !isUuid(p['changeProposal'])) return bad('changeProposal', 'an amendment names an approved change proposal');
  if (typeof p['rationale'] !== 'string' || p['rationale'].trim().length < 20) return bad('rationale', 'a rationale of at least 20 characters');
  return OK;
}

export function recordShape(p: Row, amendment: boolean): Check {
  if (!amendment && !(RECORD_KINDS as readonly string[]).includes(String(p['kind'] ?? ''))) return bad('kind', `the kind is one of ${RECORD_KINDS.join(', ')}`);
  if (p['owner'] !== undefined && !isUuid(p['owner'])) return bad('owner', 'the owner is a principal id');
  if (!amendment && !isUuid(p['owner'])) return bad('owner', 'the accountable owner is named');
  if (p['dependencies'] !== undefined && !uuidList(p['dependencies'])) return bad('dependencies', 'dependencies is a list of artifact ids');
  if (p['supersedesRecord'] !== undefined && p['supersedesRecord'] !== null && !isUuid(p['supersedesRecord'])) return bad('supersedesRecord', 'supersedesRecord is a record id');
  if (p['reviewCadenceDays'] !== undefined && !(Number.isInteger(p['reviewCadenceDays']) && Number(p['reviewCadenceDays']) >= 1 && Number(p['reviewCadenceDays']) <= 730)) {
    return bad('reviewCadenceDays', 'a review cadence of 1–730 days');
  }
  const d = (p['details'] ?? {}) as Row;
  if (p['details'] !== undefined && (typeof p['details'] !== 'object' || p['details'] === null || Array.isArray(p['details']))) return bad('details', 'details is an object');
  if (d['dueOn'] !== undefined && !isDay(d['dueOn'])) return bad('details', 'dueOn is a day (YYYY-MM-DD)');
  if (d['sunsetOn'] !== undefined && !isDay(d['sunsetOn'])) return bad('details', 'sunsetOn is a day (YYYY-MM-DD)');
  if (d['subject'] !== undefined && !isUuid(d['subject'])) return bad('details', 'the deprecated subject is an artifact id');
  return OK;
}

export function rightsShape(rows: unknown): Check {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) return bad('rows', 'a matrix is a non-empty list of rows (at most 500)');
  for (const r of rows as Row[]) {
    if (typeof r !== 'object' || r === null || typeof r['subject'] !== 'string' || typeof r['role'] !== 'string') return bad('rows', 'each row names a subject and a role');
    if (!(DUTIES as readonly string[]).includes(String(r['duty']))) return bad('rows', `the duty is one of ${DUTIES.join(', ')}`);
    if (r['principal'] !== undefined && r['principal'] !== null && !isUuid(r['principal'])) return bad('rows', 'a named principal is an id');
    if (r['delegate'] !== undefined && r['delegate'] !== null) {
      const d = r['delegate'] as Row;
      if (typeof d !== 'object' || !isUuid(d['to']) || !isDay(d['until'])) return bad('rows', 'a delegation is {to: principal id, until: YYYY-MM-DD}');
    }
  }
  return OK;
}

export function scopeShape(s: unknown): Check {
  if (typeof s !== 'object' || s === null || Array.isArray(s)) return bad('scope', 'the scope tuple is an object');
  const missing = SCOPE_KEYS.filter((k) => { const v = (s as Row)[k]; return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0); });
  if (missing.length > 0) return bad('scope', `the decision is bound to the exact scope; missing: ${missing.join(', ')}`);
  if (!HEX64.test(String((s as Row)['configuration_digest']))) return bad('scope', 'configuration_digest is 64 hex');
  if (!/^C[0-4]$/.test(String((s as Row)['consequence_class']))) return bad('scope', 'consequence_class is C0–C4');
  return OK;
}

/** The eligibility of a caller for an approval, in words (the port decides; this explains). Every reason that would refuse is listed. */
export function eligibility(a: { callerKind: 'human' | 'agent' | string; caller: string; callerRoles: string[]; requiredRoles: string[]; proposer: string | null;
                                  owner?: string | null; builders?: string[]; componentOwners?: string[]; expands?: boolean; state: string; openState: string;
                                  held?: string[]; rights?: { governed: boolean; allowed: boolean; reason?: string } }): { can_decide: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (a.callerKind !== 'human') reasons.push('a named human decides; an agent prepares evidence and proposals only');
  if (!a.requiredRoles.some((r) => a.callerRoles.includes(r))) reasons.push(`you hold none of ${a.requiredRoles.join(' / ')} at PLATFORM`);
  if (a.proposer !== null && a.caller === a.proposer) reasons.push('you proposed it — never self-approved');
  if (a.owner !== undefined && a.owner !== null && a.caller === a.owner) reasons.push('you own it — the approver is independent of the owner');
  if ((a.builders ?? []).includes(a.caller)) reasons.push('you are a declared builder of the subject — never approved by its builder');
  if (a.expands === true && (a.componentOwners ?? []).includes(a.caller)) reasons.push('you own a component whose authority it expands (ES-02-004)');
  if (a.state !== a.openState) reasons.push(`it is ${a.state}`);
  for (const h of a.held ?? []) reasons.push(`HELD: ${h}`);
  if (a.rights !== undefined && a.rights.governed && !a.rights.allowed) reasons.push(a.rights.reason ?? 'the approved decision-rights matrix assigns this approval to someone else');
  return { can_decide: reasons.length === 0, reasons };
}

/** The effective state of an exception on a clock (an approved exception past its expiry is never shown in force). */
export function exceptionEffectiveState(state: string, expiresAt: string, now: Date): string {
  return state === 'approved' && Date.parse(expiresAt) <= now.getTime() ? 'expired (sweep pending)' : state;
}

/** The constitutional invariants a proposal names (the port refuses them; the page warns before). */
export function constitutionalIn(invariants: string[]): string[] {
  return invariants.map((x) => x.trim().toLowerCase()).filter((x) => (CONSTITUTIONAL as readonly string[]).includes(x));
}
