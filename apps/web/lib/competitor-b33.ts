/**
 * The competitor intelligence client — CP-6 B33 §CI (0111_b33_x_competitor.sql; F-P4-15 ch.29, JRN-10, CAP-FW-06).
 *
 * Every response is returned VERBATIM: the competitor bound to its graph organization, its TEMPORAL profile versions (effective from a day,
 * recorded at an instant; approved | limited | superseded), the events and the interpretation an analyst approved, the proposals (the agent's
 * or a person's) with their materiality, source diversity, identity basis and open contradictions as the PORT computed them, the
 * comparisons with their declared basis, the watchlists and the alerts routed under the published policy, the revalidations, the challenges,
 * the decision uses. The helpers below only word what the record says — nothing here approves, compares or judges. A refusal is shown in
 * the server's own words (`competitor profile|comparison|assessment|watchlist rejected (<class>): …`).
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type ProfileState = 'approved' | 'limited' | 'superseded';
export type ProposalState = 'proposed' | 'approved' | 'declined' | 'withdrawn' | 'superseded';
export interface LimitReason { class: string; reason: string; state?: string; fact?: string }
export interface Fact { key: string; kind: string; value: Row; citations: Row[]; confidence: number; limited?: boolean; limited_reasons?: LimitReason[]; from_proposal?: string }
export interface ProfileVersion {
  competitor_id: string; version: number; effective_from: string; facts: Fact[]; state: ProfileState; limited_reasons: LimitReason[]; cause: string; proposal_id: string | null;
  approved_by: string; approved_at: string; supersedes: number | null; superseded_at: string | null; package_version: number; source_diversity: Diversity | Row; identity: Row;
  cpf_digest: string | null; recorded_at: string; state_then?: string;
}
export interface Diversity {
  evidence: number; publishers: number; contracts: number; independent_publishers: number; publisher_list: string[]; contract_list: string[]; unknown_origin: number;
  correlated: Array<{ kind: 'same_publisher' | 'same_bytes'; evidence: string[]; publisher?: string; sources?: string[] }>; single_origin: boolean; threshold: number; below_threshold: boolean;
}
export interface Presented { state: 'current' | 'limited' | 'none'; reasons: string[] }
export interface Coverage { freshness_days: number; newest_evidence_at: string | null; state: 'fresh' | 'stale' | 'none'; as_of: string }
export interface CompetitorRow {
  competitor_id: string; package_key: string; entity_id: string; name: string; owner_principal_id: string; twin_id: string | null; state: string; created_at: string;
  head: ProfileVersion | null; coverage: Coverage; open_revalidations: Row[]; open_proposals: number; presented: Presented;
}
export interface Overview { competitors: CompetitorRow[]; packages: Record<string, Record<string, { state: string; reason: string }>>; agents: Array<{ agent_id: string }>; now: string }
export interface Proposal {
  proposal_id: string; competitor_id: string; base_version: number | null; content: Row; content_digest: string; material: boolean; material_reasons: string[]; citations: Row[];
  source_diversity: Diversity; identity: Row; contradictions: Row[]; state: ProposalState; proposed_by: string; proposed_via: 'person' | 'agent'; agent_id: string | null; run_id: string | null;
  proposed_at: string; decided_by: string | null; decided_at: string | null; decision_reason: string | null; result_version: number | null;
}
export interface CompetitorDetail {
  competitor: Row; head: ProfileVersion | null; presented: Presented; coverage: Coverage; versions: ProfileVersion[]; events: Row[]; assessments: Row[]; proposals: Proposal[];
  alerts: Row[]; items: Row[]; revalidations: Row[]; challenges: Row[]; decision_uses: Row[]; twin_proposals: Row[]; ledger: Row[];
}
export interface Replay { competitor: Row; known_at: string; effective_on: string | null; believed: ProfileVersion | null; held: ProfileVersion | null; events: Row[]; note: string }
export interface Basis { basis_key: string; version: number; title: string; metrics: Row[]; state: 'active' | 'superseded'; digest: string; declared_at: string }
export interface Comparison { comparison_id: string; basis_key: string; basis_version: number; competitor_ids: string[]; rows: Row[]; source_diversity: Diversity; state: 'current' | 'limited' | 'suspended'; limited_reasons: LimitReason[]; suspended_reason: string | null; compared_at: string }
export interface Watchlist { watchlist_id: string; title: string; owner_principal_id: string; competitor_ids: string[]; rules: Row[]; freshness_days: number; state: string; created_at: string }

/* ───────────── the words ───────────── */
/** What a reader is shown: never current-and-complete when limited (the reasons, in words). */
export function presentedMark(p: Presented | null | undefined): { glyph: string; token: string; text: string } {
  if (p === null || p === undefined || p.state === 'none') return { glyph: '○', token: '--eye-color-ink-muted', text: 'NO APPROVED PROFILE' };
  if (p.state === 'limited') return { glyph: '◑', token: '--eye-color-warning', text: `LIMITED — ${p.reasons.join('; ')}` };
  return { glyph: '●', token: '--eye-color-success', text: 'CURRENT' };
}
/** A profile version's state in words — a limited one says why. */
export function versionLine(v: Pick<ProfileVersion, 'version' | 'state' | 'effective_from' | 'limited_reasons' | 'cause'> & { state_then?: string }): string {
  const st = v.state_then ?? v.state;
  const why = st === 'limited' ? ` (${v.limited_reasons.map((l) => l.reason).join('; ')})` : '';
  return `v${v.version} · effective from ${v.effective_from} · ${st.toUpperCase()}${why} · by ${v.cause}`;
}
/** A fact's value in one line. */
export function factLine(f: Fact): string {
  const v = f.value ?? {};
  const body = v['amount'] !== undefined ? `${String(v['amount'])} ${String(v['unit'] ?? '')} per ${String(v['period'] ?? '')} (${String(v['population'] ?? '')})`
    : v['place'] !== undefined ? `${String(v['place'])}${v['status'] === undefined ? '' : ` — ${String(v['status'])}`}${v['capacity_per_month'] === undefined ? '' : ` — ${String(v['capacity_per_month'])} units/month`}`
    : String(v['name'] ?? JSON.stringify(v));
  return `${f.key}: ${body} · confidence ${Math.round(Number(f.confidence) * 100)}% · ${f.citations.length} citation(s)${f.limited === true ? ` · LIMITED (${(f.limited_reasons ?? []).map((l) => l.class).join(', ')})` : ''}`;
}
/** Source diversity in words — the independent origins counted, correlated sources named, never imputed. */
export function diversityLine(d: Diversity | Row | null | undefined): string {
  if (d === null || d === undefined || (d as Row)['independent_publishers'] === undefined) return 'not measured';
  const x = d as Diversity;
  const corr = x.correlated.length === 0 ? '' : ` · correlated: ${x.correlated.map((c) => (c.kind === 'same_bytes' ? `the same bytes through ${(c.sources ?? []).length} sources` : `${c.evidence.length} items of ${c.publisher ?? '?'}`)).join('; ')}`;
  return `${x.independent_publishers} independent publisher(s) of ${x.publishers} · ${x.contracts} contract(s) · ${x.evidence} evidence item(s)${x.unknown_origin > 0 ? ` · ${x.unknown_origin} of unknown origin` : ''}${corr}${x.below_threshold ? ` · BELOW THE THRESHOLD OF ${x.threshold}` : ''}`;
}
/** The identity basis of a proposal or version in words. */
export function identityLine(i: Row | null | undefined): string {
  if (i === null || i === undefined || i['state'] === undefined) return 'not recorded';
  return `${String(i['state']).toUpperCase()} — ${String(i['resolved'] ?? 0)} resolved through the graph, ${String(i['mistaken'] ?? 0)} mistaken, ${String(i['unresolved'] ?? 0)} unresolved`;
}
/** A proposal's change in one line per part. */
export function changeLines(content: Row): string[] {
  const out: string[] = [];
  for (const e of (content['events'] ?? []) as Row[]) out.push(`event ${String(e['kind'])} · ${String(e['place'] ?? e['market'] ?? '')} · effective ${String(e['effective_date'])}`);
  for (const c of (content['changes'] ?? []) as Row[]) out.push(`${String(c['op'])} ${String((c['fact'] as Row)['key'])}`);
  const i = content['interpretation'] as Row | null | undefined;
  if (i !== null && i !== undefined) out.push(`interpretation (confidence ${Math.round(Number(i['confidence']) * 100)}%): ${String(i['statement'])}`);
  return out;
}
/** A comparison's state in words; a suspended one says why. */
export function comparisonLine(c: Pick<Comparison, 'state' | 'basis_key' | 'basis_version' | 'limited_reasons' | 'suspended_reason'>): string {
  if (c.state === 'suspended') return `SUSPENDED — ${c.suspended_reason ?? ''}`;
  if (c.state === 'limited') return `LIMITED on ${c.basis_key} v${c.basis_version} — ${c.limited_reasons.map((l) => l.reason).join('; ')}`;
  return `CURRENT on ${c.basis_key} v${c.basis_version}`;
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/domain-competitors`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'intelligence',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}
const R = 'domain.competitor.read';
export const competitors = {
  overview: (s: Scope) => p<{ overview: Overview; receipt: Receipt }>(s, '/overview', R, 'DCI'),
  read: (s: Scope, id: string) => p<{ competitor: CompetitorDetail; receipt: Receipt }>(s, `/competitors/${id}/read`, R, 'DCI', {}, id),
  asOf: (s: Scope, id: string, knownAt: string | null, effectiveOn: string | null) =>
    p<{ replay: Replay; receipt: Receipt }>(s, `/competitors/${id}/as-of`, R, 'DCI', { knownAt, effectiveOn }, id),
  declare: (s: Scope, payload: { packageKey: string; entityId: string; name: string; ownerPrincipalId: string }) =>
    p<{ competitor: Row; receipt: Receipt }>(s, '/competitors/declare', 'domain.competitor.declare', 'DCI', payload),
  propose: (s: Scope, competitorId: string, content: Row) => p<{ proposal: Row; receipt: Receipt }>(s, '/proposals/propose', 'domain.competitor.propose', 'DCP', { competitorId, content }),
  withdraw: (s: Scope, proposalId: string, reason: string) => p<{ proposal: Row; receipt: Receipt }>(s, `/proposals/${proposalId}/withdraw`, 'domain.competitor.propose', 'DCP', { reason }, proposalId),
  /** the named analyst's decision, bound to the content digest read, written against the competitor (its new profile version) */
  decide: (s: Scope, proposalId: string, competitorId: string, decision: 'approved' | 'declined', digest: string, reason: string | null) =>
    p<{ decision: Row; receipt: Receipt }>(s, `/proposals/${proposalId}/decide`, 'domain.competitor.assessment.approve', 'DCI', { decision, digest, reason, competitorId }, competitorId),
  revalidate: (s: Scope, id: string) => p<{ revalidation: Row; receipt: Receipt }>(s, `/competitors/${id}/revalidate`, 'domain.competitor.revalidate', 'DCI', {}, id),
  comparisons: (s: Scope) => p<{ bases: Basis[]; comparisons: Comparison[]; receipt: Receipt }>(s, '/comparisons/list', R, 'DCC'),
  basis: (s: Scope, payload: { packageKey: string; basisKey: string; title: string; metrics: Row[] }) => p<{ basis: Row; receipt: Receipt }>(s, '/comparisons/basis', 'domain.competitor.compare', 'DCB', payload),
  compare: (s: Scope, basisKey: string, competitorIds: string[]) => p<{ comparison: Comparison; receipt: Receipt }>(s, '/comparisons/run', 'domain.competitor.compare', 'DCC', { basisKey, competitorIds }),
  watchlists: (s: Scope) => p<{ watchlists: Watchlist[]; receipt: Receipt }>(s, '/watchlists/list', R, 'DCW'),
  declareWatchlist: (s: Scope, payload: Row) => p<{ watchlist: Row; receipt: Receipt }>(s, '/watchlists/declare', 'domain.competitor.watchlist', 'DCW', payload),
  retireWatchlist: (s: Scope, id: string, reason: string) => p<{ watchlist: Row; receipt: Receipt }>(s, `/watchlists/${id}/retire`, 'domain.competitor.watchlist', 'DCW', { reason }, id),
  challenge: (s: Scope, assessmentId: string, reason: string, proposed: Row) =>
    p<{ challenge: Row; receipt: Receipt }>(s, `/assessments/${assessmentId}/challenge`, 'domain.competitor.challenge', 'DCH', { reason, proposed }),
  decideChallenge: (s: Scope, challengeId: string, decision: 'upheld' | 'dismissed', reason: string) =>
    p<{ challenge: Row; receipt: Receipt }>(s, `/challenges/${challengeId}/decide`, 'domain.competitor.challenge.decide', 'DCH', { decision, reason }, challengeId),
  cite: (s: Scope, competitorId: string, packageId: string, version: number, note: string) =>
    p<{ use: Row; receipt: Receipt }>(s, `/competitors/${competitorId}/decision-use`, 'domain.competitor.decision.cite', 'DCU', { packageId, version, note }),
};
