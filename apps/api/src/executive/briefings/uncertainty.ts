/**
 * BRF@v3's PURE RULES — CP-6 B36 part `briefing` (migration 0094 §B). Nothing here reads a database; the composer
 * (briefing.service.ts) feeds these functions the records it read and stores what they answer inside the content, so the
 * content digest covers every band, omission, suppression, disputed line and retained item.
 *
 *   uncertaintyOf        b1 — the band beside every displayed conclusion, COMPUTED from what the cited object carries (its recorded
 *                        confidence, its freshness, the state of its source, its truth state, the count of independent sources) and
 *                        never asserted by a caller; an item with nothing to rest on reads `unknown` — no number is invented, the
 *                        basis names what each band rests on.
 *   suppressionOf        b4 — the unsafe-product rule under the policy in force at known_at: an item below the class's minimum of
 *                        independent sources, above its maximum staleness or below its minimum confidence is NOT rendered; it is
 *                        recorded as suppressed (the item, the rule, the measure) and declared as an omission. No weaker conclusion
 *                        fills the gap.
 *   urgentRetained       b6 — under degraded sources the PRIOR edition's urgent items (a critical warning; a warning still inside its
 *                        response window at the new known_at) are retained with their ORIGINAL as-of and a retained_from marker,
 *                        never re-derived from unavailable data; the outage is declared as an omission.
 *   DEFAULT_AUDIENCE     b3 — the audience contract an edition composed without one carries (the briefing.read roles, plain in-app).
 *   readerInAudience     b3 — whether a reader's roles meet the contract (an administrator is admitted to every audience, 0066 §3).
 */
type Row = Record<string, unknown>;
export type Band = 'high' | 'medium' | 'low' | 'unknown';
export type SourceState = 'live' | 'replayed' | 'degraded' | 'blocked' | 'operator-upload' | 'internal';

export interface UncertaintyBasis {
  /** The confidence the cited object RECORDS (0..1) — a warning's, a signal's, an attention item's, a header's confidence.value; null when it records none. */
  confidence: number | null;
  /** Where the confidence came from: the record, or nothing. */
  confidence_source: 'record' | 'none';
  freshness_hours: number;
  /** The freshness bound the band was judged against (the policy's max_staleness_hours for the class, or the default 168 h). */
  freshness_bound_hours: number;
  source_state: SourceState;
  truth_state: string;
  /** 1 + the corroboration refs the record carries (an item with none rests on one source). */
  independent_sources: number;
  /** The rules that moved the band, in the order applied — the reader sees WHY, not a score. */
  rules_applied: string[];
}
export interface Uncertainty { band: Band; basis: UncertaintyBasis }

const ORDER: Band[] = ['low', 'medium', 'high'];
const lower = (b: Band): Band => (b === 'unknown' ? 'unknown' : ORDER[Math.max(0, ORDER.indexOf(b) - 1)] as Band);
const raise = (b: Band): Band => (b === 'unknown' ? 'unknown' : ORDER[Math.min(2, ORDER.indexOf(b) + 1)] as Band);

/** A recorded confidence's band (the attention section's rule: high ≥ 0.8, medium ≥ 0.5, low below). */
export function bandOfConfidence(c: number): Band { return c >= 0.8 ? 'high' : c >= 0.5 ? 'medium' : 'low'; }

/**
 * The band and its basis. Categorical throughout: a recorded confidence gives the starting band; without one the truth state does
 * (observed / asserted / decided / assessed → medium; extracted / inferred / synthetic → low; disputed / withdrawn / other → unknown);
 * staleness beyond the bound lowers it one step; a degraded or blocked source lowers it one step (and, with no recorded confidence,
 * leaves nothing to rest on: unknown); two or more independent sources raise it one step. `unknown` never moves.
 */
export function uncertaintyOf(a: { confidence: unknown; freshnessHours: number; freshnessBoundHours?: number | undefined; sourceState: SourceState; truthState: string; corroborationRefs?: unknown }): Uncertainty {
  const c = typeof a.confidence === 'number' && Number.isFinite(a.confidence) && a.confidence >= 0 && a.confidence <= 1 ? a.confidence : null;
  const bound = a.freshnessBoundHours ?? 168;
  const n = 1 + (Array.isArray(a.corroborationRefs) ? a.corroborationRefs.length : 0);
  const rules: string[] = [];
  let band: Band;
  if (c !== null) { band = bandOfConfidence(c); rules.push(`recorded confidence ${c} → ${band}`); }
  else if (['observed', 'asserted', 'decided', 'assessed'].includes(a.truthState)) { band = 'medium'; rules.push(`no recorded confidence; truth state ${a.truthState} → medium`); }
  else if (['extracted', 'inferred', 'synthetic'].includes(a.truthState)) { band = 'low'; rules.push(`no recorded confidence; truth state ${a.truthState} → low`); }
  else { band = 'unknown'; rules.push(`no recorded confidence; truth state ${a.truthState} → unknown`); }
  if ((a.sourceState === 'degraded' || a.sourceState === 'blocked') && band !== 'unknown') {
    if (c === null) { band = 'unknown'; rules.push(`source ${a.sourceState} and no recorded confidence → unknown`); }
    else { band = lower(band); rules.push(`source ${a.sourceState} → one band lower (${band})`); }
  }
  if (band !== 'unknown' && a.freshnessHours > bound) { band = lower(band); rules.push(`${a.freshnessHours} h old, beyond ${bound} h → one band lower (${band})`); }
  if (band !== 'unknown' && n >= 2) { band = raise(band); rules.push(`${n} independent sources → one band higher (${band})`); }
  return { band, basis: { confidence: c, confidence_source: c === null ? 'none' : 'record', freshness_hours: a.freshnessHours, freshness_bound_hours: bound, source_state: a.sourceState, truth_state: a.truthState, independent_sources: n, rules_applied: rules } };
}

/* ───────────────────────── b4 the suppression policy ───────────────────────── */
export interface PolicyRule { min_sources: number; max_staleness_hours: number; min_confidence: number | null }
export interface BriefingPolicy { version: number; rules: { default: PolicyRule; classes?: Record<string, Partial<PolicyRule>> } }
export interface Suppression { item_id: string; kind: string; rule: PolicyRule & { class: string; policy_version: number }; measure: { independent_sources: number; freshness_hours: number; confidence: number | null }; because: string[] }

/** The rule for an item class under a policy: the class's partial rule over the default. */
export function ruleFor(policy: BriefingPolicy, kind: string): PolicyRule {
  const c = policy.rules.classes?.[kind] ?? {};
  return { min_sources: c.min_sources ?? policy.rules.default.min_sources, max_staleness_hours: c.max_staleness_hours ?? policy.rules.default.max_staleness_hours, min_confidence: c.min_confidence === undefined ? policy.rules.default.min_confidence : c.min_confidence };
}

/** Whether an item's evidence is below the policy; null when it stands. The measure is the item's own basis — nothing is re-derived. */
export function suppressionOf(policy: BriefingPolicy | null, item: { item_id: string; kind: string; uncertainty: Uncertainty }): Suppression | null {
  if (policy === null) return null;
  const r = ruleFor(policy, item.kind);
  const b = item.uncertainty.basis;
  const because: string[] = [];
  if (b.independent_sources < r.min_sources) because.push(`${b.independent_sources} independent source(s), the policy asks ${r.min_sources}`);
  if (b.freshness_hours > r.max_staleness_hours) because.push(`${b.freshness_hours} h old, the policy allows ${r.max_staleness_hours} h`);
  if (r.min_confidence !== null && b.confidence !== null && b.confidence < r.min_confidence) because.push(`recorded confidence ${b.confidence}, the policy asks ${r.min_confidence}`);
  if (because.length === 0) return null;
  return { item_id: item.item_id, kind: item.kind, rule: { ...r, class: item.kind, policy_version: policy.version }, measure: { independent_sources: b.independent_sources, freshness_hours: b.freshness_hours, confidence: b.confidence }, because };
}

/* ───────────────────────── b2 omissions ───────────────────────── */
export type OmissionKind = 'source_degraded' | 'source_blocked' | 'memory_unavailable' | 'below_clearance' | 'suppressed' | 'outage';
export interface Omission { kind: OmissionKind; object: string | null; source: string | null; reason: string }
export const omission = (kind: OmissionKind, a: { object?: string | null; source?: string | null; reason: string }): Omission => ({ kind, object: a.object ?? null, source: a.source ?? null, reason: a.reason });

/* ───────────────────────── b6 urgent-state retention ───────────────────────── */
/**
 * The prior edition's URGENT items to retain under an outage: a warning raised at level critical, or a warning whose response window
 * is still open at the new known_at (state raised then). Each copy keeps its original `at` and freshness (the prior's as-of) and is
 * marked `retained_from` (the prior briefing) and `retained_as_of` (the prior's known_at); one already composed afresh is not doubled.
 */
export function urgentRetained(a: { priorBriefingId: string; priorKnownAt: string; priorItems: Row[]; knownAt: string; presentIds: ReadonlySet<string> }): Row[] {
  const out: Row[] = [];
  for (const i of a.priorItems) {
    if (i['kind'] !== 'warning') continue;
    const id = String(i['item_id']);
    if (a.presentIds.has(id)) continue;
    const d = (i['details'] ?? {}) as Row;
    const closes = typeof d['response_window_closes_at'] === 'string' ? d['response_window_closes_at'] : null;
    const urgent = d['level'] === 'critical' || (d['state'] === 'raised' && closes !== null && closes > a.knownAt);
    if (!urgent) continue;
    out.push({ ...i, retained_from: a.priorBriefingId, retained_as_of: a.priorKnownAt });
  }
  return out.sort((x, y) => (String(x['item_id']) < String(y['item_id']) ? -1 : 1));
}

/* ───────────────────────── b3 the audience contract ───────────────────────── */
export interface Audience { roles: string[]; locale: string; accessibility: { plain_language: boolean; screen_reader: boolean }; channels: string[]; exclude?: Array<'disputed' | 'indicator'> }
/** The reader roles of briefing.read (pdp.service.ts) plus B36's two: the contract an edition composed without one carries. */
export const DEFAULT_AUDIENCE_ROLES: readonly string[] = Object.freeze(['platform_admin', 'tenant_admin', 'auditor', 'domain_admin', 'domain_analyst', 'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator',
  'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'briefing_agent', 'reporting_agent', 'board_member', 'executive_operator']);
export const DEFAULT_AUDIENCE: Audience = Object.freeze({ roles: [...DEFAULT_AUDIENCE_ROLES], locale: 'en', accessibility: { plain_language: false, screen_reader: false }, channels: ['in-app'] }) as Audience;
export const AUDIENCE_CHANNELS = ['in-app', 'demo-mailbox', 'email', 'sms', 'teams'] as const;
const ADMIN_ROLES = new Set(['platform_admin', 'tenant_admin', 'domain_admin']);

/** The contract as the client sent it, checked to the migration's shape (executive.briefing_audience_ok); a problem in words, or null. */
export function audienceProblem(a: unknown): string | null {
  if (a === null || typeof a !== 'object' || Array.isArray(a)) return 'the audience is an object { roles, locale, accessibility, channels }';
  const o = a as Row;
  const roles = o['roles'];
  if (!Array.isArray(roles) || roles.length === 0 || !roles.every((r) => typeof r === 'string' && /^[a-z][a-z0-9_]{2,39}$/.test(r))) return 'audience.roles is a non-empty list of role codes';
  if (typeof o['locale'] !== 'string' || !/^[a-z]{2}(-[A-Z]{2})?$/.test(o['locale'])) return 'audience.locale is a language tag such as en or de-DE';
  const acc = o['accessibility'] as Row | undefined;
  if (acc === null || typeof acc !== 'object' || typeof acc['plain_language'] !== 'boolean' || typeof acc['screen_reader'] !== 'boolean') return 'audience.accessibility is { plain_language: boolean, screen_reader: boolean }';
  const ch = o['channels'];
  if (!Array.isArray(ch) || ch.length === 0 || !ch.every((c) => (AUDIENCE_CHANNELS as readonly string[]).includes(String(c)))) return `audience.channels is a non-empty list of ${AUDIENCE_CHANNELS.join(' | ')}`;
  if (o['exclude'] !== undefined && (!Array.isArray(o['exclude']) || !o['exclude'].every((x) => x === 'disputed' || x === 'indicator'))) return 'audience.exclude lists disputed and/or indicator';
  for (const k of Object.keys(o)) if (!['roles', 'locale', 'accessibility', 'channels', 'exclude'].includes(k)) return `audience carries an unknown key ${k}`;
  return null;
}

/** Whether a reader holding these roles is within the audience (an administrator always is). */
export function readerInAudience(audience: Audience | null, readerRoles: readonly string[]): boolean {
  if (audience === null) return true;
  if (readerRoles.some((r) => ADMIN_ROLES.has(r))) return true;
  return audience.roles.some((r) => readerRoles.includes(r));
}

/** A BOARD audience: every role in the contract is board_member — disputed items are carried only with the owner's note. */
export const isBoardAudience = (audience: Audience): boolean => audience.roles.length > 0 && audience.roles.every((r) => r === 'board_member');

/** The expiry an edition composed without one carries: the room's cadence (7 days) after known_at. */
export const DEFAULT_EXPIRY_DAYS = 7;
export function defaultExpiry(knownAt: string): string { return new Date(new Date(knownAt).getTime() + DEFAULT_EXPIRY_DAYS * 86_400_000).toISOString(); }
