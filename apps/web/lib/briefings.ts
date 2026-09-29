/**
 * CP-6 B36 (0094 §B): the briefing studio's WORDS for BRF@v3 — the audience contract as the form holds it and as the server wants it,
 * the expiry between the datetime-local input and an instant, the lines an omission / a suppression / a disputed item / a band render
 * as, and the suppression policy's form. Nothing here judges: every band, omission, suppression and expiry is the server's; the helpers
 * only word what the record says (the attention lib's rule).
 */
import type { BriefingAudience, BriefingDisputed, BriefingOmission, BriefingPolicy, BriefingSuppression, BriefingUncertainty } from './decisions';

/** The reader roles of briefing.read (pdp.service.ts) plus B36's two — the audience picker's options (the server's default names them all). */
export const AUDIENCE_ROLES = ['executive', 'executive_operator', 'board_member', 'decision_owner', 'decision_approver', 'decision_authority', 'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator', 'domain_analyst', 'domain_admin', 'tenant_admin', 'auditor', 'platform_admin', 'briefing_agent', 'reporting_agent'] as const;
export const AUDIENCE_CHANNELS = ['in-app', 'demo-mailbox', 'email', 'sms', 'teams'] as const;
export const LOCALES = ['en', 'en-GB', 'de-DE', 'fr-FR', 'ar-EG'] as const;
export const EXCLUDABLE = ['disputed', 'indicator'] as const;
/** The composer's item kinds — the suppression policy is per class. */
export const ITEM_KINDS = ['evidence', 'claim', 'run', 'branch', 'warning', 'warning-acknowledged', 'memory', 'package', 'dissent', 'disputed', 'indicator'] as const;
export const OMISSION_TEXT: Record<BriefingOmission['kind'], string> = {
  source_degraded: 'source degraded', source_blocked: 'source blocked', memory_unavailable: 'memory unavailable', below_clearance: 'below the composer\'s clearance', suppressed: 'withheld under policy', outage: 'outage — urgent items retained',
};

export interface AudienceForm { roles: string[]; locale: string; plainLanguage: boolean; screenReader: boolean; channels: string[]; exclude: string[] }
export const DEFAULT_AUDIENCE_FORM: AudienceForm = { roles: ['executive', 'decision_owner', 'decision_approver', 'decision_authority'], locale: 'en', plainLanguage: false, screenReader: false, channels: ['in-app'], exclude: [] };

/** The contract as the server wants it (executive.briefing_audience_ok's shape). */
export function audiencePayload(f: AudienceForm): BriefingAudience {
  const a: BriefingAudience = { roles: [...f.roles], locale: f.locale, accessibility: { plain_language: f.plainLanguage, screen_reader: f.screenReader }, channels: [...f.channels] };
  if (f.exclude.length > 0) a.exclude = f.exclude.filter((x): x is 'disputed' | 'indicator' => x === 'disputed' || x === 'indicator');
  return a;
}
/** What is wrong with the form, in words, before the server is asked — or null. */
export function audienceProblem(f: AudienceForm): string | null {
  if (f.roles.length === 0) return 'name at least one audience role';
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(f.locale)) return 'the locale is a language tag such as en or de-DE';
  if (f.channels.length === 0) return 'name at least one channel';
  return null;
}
/** A board audience (every role board_member): the disputed section is carried only with the owner's note. */
export const isBoardAudience = (roles: readonly string[]): boolean => roles.length > 0 && roles.every((r) => r === 'board_member');

/** An instant → the datetime-local input's value (the viewer's local wall clock, minute precision). */
export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** The datetime-local input's value → an instant (ISO); null when empty or malformed. */
export function fromDatetimeLocal(v: string): string | null {
  if (v.trim() === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** The default expiry the studio offers: the cadence (7 days) after now. */
export function defaultExpiryLocal(nowMs: number): string { return toDatetimeLocal(new Date(nowMs + 7 * 86_400_000).toISOString()); }

/** The band as a mark: glyph, token and text — the attention lib's vocabulary, one rule. */
export function bandMark(band: BriefingUncertainty['band'] | string): { glyph: string; token: string; text: string } {
  switch (band) {
    case 'high': return { glyph: '●', token: '--eye-color-ink-default', text: 'HIGH' };
    case 'medium': return { glyph: '◐', token: '--eye-color-uncertain', text: 'MEDIUM' };
    case 'low': return { glyph: '○', token: '--eye-color-warning', text: 'LOW' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: 'UNKNOWN' };
  }
}
/** Why the band is what it is — the server's rules, joined. */
export function uncertaintyLine(u: BriefingUncertainty | undefined): string {
  if (u === undefined) return 'no band (an edition before BRF@v3)';
  const b = u.basis;
  return `${bandMark(u.band).text}: ${b.rules_applied.join('; ')} · ${b.independent_sources} source(s) · ${b.freshness_hours} h old (bound ${b.freshness_bound_hours} h) · source ${b.source_state}`;
}
export function omissionLine(o: BriefingOmission): string {
  const what = o.object ?? o.source;
  return `${OMISSION_TEXT[o.kind] ?? o.kind}${what === null ? '' : ` — ${what}`}: ${o.reason}`;
}
export function suppressionLine(s: BriefingSuppression): string {
  return `${s.item_id} (${s.kind}) withheld under policy v${s.rule.policy_version}: ${s.because.join('; ')}`;
}
export function disputedLine(d: BriefingDisputed): string {
  return `${d.basis}${d.subject === null ? '' : ` on ${d.subject}`} as of ${d.as_of}${d.owner_note === null ? '' : ` — owner's note: ${d.owner_note}`}`;
}
/** "2 omissions declared" — the count the narrative names. */
export const omissionsCount = (n: number): string => (n === 0 ? 'no omission declared' : n === 1 ? '1 omission declared' : `${n} omissions declared`);

/* ───────────── the suppression policy's form ───────────── */
export interface PolicyForm { minSources: string; maxStalenessHours: string; minConfidence: string; classOverrides: Array<{ kind: string; minSources: string; maxStalenessHours: string; minConfidence: string }> }
export const DEFAULT_POLICY_FORM: PolicyForm = { minSources: '1', maxStalenessHours: '168', minConfidence: '', classOverrides: [] };
const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));
/** The rules as the server wants them (executive.briefing_policy_rules_ok's shape); a problem in words instead when the form is not one. */
export function policyRulesPayload(f: PolicyForm): { rules: BriefingPolicy['rules'] } | { problem: string } {
  const ms = num(f.minSources); const st = num(f.maxStalenessHours); const mc = num(f.minConfidence);
  if (ms === null || !Number.isInteger(ms) || ms < 1) return { problem: 'the default minimum of independent sources is a whole number of at least 1' };
  if (st === null || !(st >= 1)) return { problem: 'the default maximum staleness is at least 1 hour' };
  if (mc !== null && !(mc >= 0 && mc <= 1)) return { problem: 'the default minimum confidence is between 0 and 1, or empty for none' };
  const rules: BriefingPolicy['rules'] = { default: { min_sources: ms, max_staleness_hours: st, min_confidence: mc } };
  const classes: NonNullable<BriefingPolicy['rules']['classes']> = {};
  for (const o of f.classOverrides) {
    if (!(ITEM_KINDS as readonly string[]).includes(o.kind)) return { problem: `${o.kind} is not an item kind` };
    const r: { min_sources?: number; max_staleness_hours?: number; min_confidence?: number | null } = {};
    const oms = num(o.minSources); const ost = num(o.maxStalenessHours); const omc = num(o.minConfidence);
    if (oms !== null) { if (!Number.isInteger(oms) || oms < 1) return { problem: `${o.kind}: the minimum of sources is a whole number of at least 1` }; r.min_sources = oms; }
    if (ost !== null) { if (!(ost >= 1)) return { problem: `${o.kind}: the maximum staleness is at least 1 hour` }; r.max_staleness_hours = ost; }
    if (omc !== null) { if (!(omc >= 0 && omc <= 1)) return { problem: `${o.kind}: the minimum confidence is between 0 and 1` }; r.min_confidence = omc; }
    if (Object.keys(r).length === 0) return { problem: `${o.kind}: an override gives at least one of the three` };
    classes[o.kind] = r;
  }
  if (Object.keys(classes).length > 0) rules.classes = classes;
  return { rules };
}
/** The policy in force, as lines. */
export function policyLines(p: BriefingPolicy | null): string[] {
  if (p === null) return ['no suppression policy is published: nothing is withheld'];
  const d = p.rules.default;
  const out = [`v${p.version} · default: ≥ ${d.min_sources} source(s), ≤ ${d.max_staleness_hours} h old${d.min_confidence === null ? '' : `, confidence ≥ ${d.min_confidence}`}`];
  for (const [k, r] of Object.entries(p.rules.classes ?? {})) {
    const parts: string[] = [];
    if (r.min_sources !== undefined) parts.push(`≥ ${r.min_sources} source(s)`);
    if (r.max_staleness_hours !== undefined) parts.push(`≤ ${r.max_staleness_hours} h old`);
    if (r.min_confidence !== undefined && r.min_confidence !== null) parts.push(`confidence ≥ ${r.min_confidence}`);
    out.push(`${k}: ${parts.join(', ')}`);
  }
  return out;
}
/** The edition's expiry, in words: the instant, EXPIRED when the server says so, and when the tick recorded it. */
export function expiryLine(b: { expires_at?: string | null; expired?: boolean; expired_at?: string | null }, fmt: (v: unknown) => string): string {
  if (b.expires_at === null || b.expires_at === undefined) return 'no expiry (an edition before BRF@v3)';
  if (b.expired === true) return `EXPIRED — expired ${fmt(b.expires_at)}${b.expired_at ? `; recorded by the tick ${fmt(b.expired_at)}` : '; not yet recorded by the tick'}`;
  return `expires ${fmt(b.expires_at)}`;
}
