/**
 * CP-6 B81 §SI (F-P7-E-02) — THE FEDERATED SEARCH, as pure adapters + a thin client. It FEDERATES the existing governed reads — each its
 * own audited read under its own action and the server's own permission trimming — and never an executive.search (a governed write per
 * call: it stays on /home):
 *
 *   graph      graph.controller /search (graph.read, SRC) — entities, claims, evidence, with B20's projection block and completeness; it
 *              matches ONE phrase per read, so the reading's phrases are read one by one
 *   strategy   /graph/strategy/list (graph.read, OBJ) — objectives, capabilities, stakeholders … filtered here by the reading's phrases
 *   catalog    /products/catalog/search (products.catalog.search, CAT) — B90's discoverable entries; its hidden count is the catalog's own
 *   exposures  /prediction/exposures/list (prediction.exposure.read, RSK) — B32's register, filtered here by the phrases
 *   packages   /decisions/list (decision.read, DPK) — decision packages, filtered here by the phrases (the command's objects)
 *
 * A leg the server REFUSES (403 — the permission trimming) or that fails is DECLARED (PartialResult, §DG) in the server's words — never
 * silently dropped, never "N hidden" invented. A bounded scan, a withdrawn or lagging projection is declared from the read's own flags.
 *
 *   resultsOf / legsOf   the saved search's intake (0119 §SI shell.search.save): the result set (leg · kind · id · version · label) and one
 *                        entry per read with its receipt (the port verifies each — the policy version and the cutoff are derived there)
 *   driftOf              D10 / Q14: a saved search reopens its EXACT stored set; the live re-run's differences are shown BESIDE it (added ·
 *                        removed · changed version), never as the saved result
 *   narrowTo             the person's choice in a clarification narrows the ambiguous phrase to the chosen record (the others leave the set)
 *
 * THREE CLAIMS: construction (this module and its test); demonstrated operation (the act's palette scene, SYNTHETIC); real acceptance (H3)
 * — never claimed.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';
import { graph, type ProjectionBlock, type SearchResult, type StrategyRow } from './graph';
import { catalog, type SearchAnswer } from './catalog-b90';
import { exposures, type ExposureRow } from './exposures';
import { decisions, type Package } from './decisions';
import { mergePartial, partialFromProjection, partialFromSearch, partialOf, COMPLETE, type PartialDeclaration } from './degraded-b81';
import { objectHref } from './object-b81';
import { STRATEGY_KINDS, type IntentHit, type Reading } from './intent-b81';

/* ═════════════════════════════ THE LEGS ═════════════════════════════ */
export type LegKey = 'graph' | 'strategy' | 'catalog' | 'exposures' | 'packages';
export const LEGS: Readonly<Record<LegKey, { label: string; action: string; objectType: string; reads: string }>> = {
  graph: { label: 'Knowledge graph', action: 'graph.read', objectType: 'SRC', reads: 'entities, claims and evidence' },
  strategy: { label: 'Strategy graph', action: 'graph.read', objectType: 'OBJ', reads: 'objectives, capabilities, stakeholders and the other strategy objects' },
  catalog: { label: 'Data catalog', action: 'products.catalog.search', objectType: 'CAT', reads: 'discoverable data products, schemas and sources' },
  exposures: { label: 'Exposure register', action: 'prediction.exposure.read', objectType: 'RSK', reads: 'risks and opportunities' },
  packages: { label: 'Decision packages', action: 'decision.read', objectType: 'DPK', reads: 'decision packages' },
};
export const LEG_KEYS: readonly LegKey[] = ['graph', 'strategy', 'catalog', 'exposures', 'packages'];
export type LegState = 'complete' | 'bounded' | 'partial' | 'refused' | 'failed';
export interface FederatedHit extends IntentHit {
  leg: LegKey; version: number | null; detail: string; matchedOn: string;
  /** what the link opens: the record's own page, or its list (the record's page is declared at a later stage) */ opens: 'object' | 'list';
}
export interface LegOutcome { leg: LegKey; phrase: string | null; state: LegState; receipt: string | null; note: string | null; partial: PartialDeclaration; count: number }
type Err = { status: number; message: string };

const say = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const contains = (label: string, phrases: readonly string[]) => phrases.some((p) => label.toLowerCase().includes(p.toLowerCase()));
const firstMatching = (label: string, phrases: readonly string[]) => phrases.find((p) => label.toLowerCase().includes(p.toLowerCase())) ?? '';

/** A leg the server answered with a refusal (403: the permission trimming) or a failure — declared in the server's words, never dropped. */
export function refusedLeg(leg: LegKey, e: Err, phrase: string | null = null): LegOutcome {
  const refused = e.status === 403;
  const words = e.message || (refused ? 'the server refused this read' : 'the read could not be completed');
  return { leg, phrase, state: refused ? 'refused' : 'failed', receipt: null, note: words, count: 0,
    partial: partialOf({ missingSources: [`${LEGS[leg].label} (${refused ? 'not searched — the server refused it for you' : 'not searched — the read failed'}: ${words})`],
      impact: refused ? `${LEGS[leg].reads} you may not read are absent, not hidden — nothing is counted for them` : `${LEGS[leg].reads} are missing until the read succeeds — run the search again` }) };
}

/** graph.controller /search for ONE phrase: its hits, its B20 projection block and its scan bounds (from the flags). */
export function graphLeg(answer: { search: SearchResult; receipt: Receipt }, phrase: string): { outcome: LegOutcome; hits: FederatedHit[] } {
  const s = answer.search;
  const partial = mergePartial(partialFromProjection(s.projection as ProjectionBlock | null), partialFromSearch(s));
  const bounded = !(s.complete.entities && s.complete.objects);
  const hits: FederatedHit[] = [...s.entities, ...s.claims, ...s.evidence].map((h) => {
    const type = h.kind === 'entity' ? 'ENT' : h.kind === 'claim' ? 'CLM' : 'EVD';
    const href = objectHref({ type, id: h.id, version: null, asOf: null });
    const v = h.extra['object_version'];
    return { key: `${type}:${h.id}`, leg: 'graph', kind: h.kind, id: h.id, version: typeof v === 'number' ? v : null, label: h.label, detail: h.detail, matchedOn: h.matched_on,
      href: href ?? '/graph/search', opens: href === null ? 'list' : 'object' };
  });
  return { outcome: { leg: 'graph', phrase, state: bounded ? 'bounded' : partial.complete ? 'complete' : 'partial', receipt: answer.receipt.policyDecisionId, note: s.note, partial, count: hits.length }, hits };
}
/** /graph/strategy/list filtered by the phrases (the list is the governed read; the match is here, said as such). */
export function strategyLeg(answer: { strategy: StrategyRow[]; projection: ProjectionBlock; receipt: Receipt }, phrases: readonly string[], limit = 300): { outcome: LegOutcome; hits: FederatedHit[] } {
  const partial = mergePartial(partialFromProjection(answer.projection), answer.strategy.length >= limit ? partialOf({ bounds: `the strategy list is read up to ${limit} objects`, impact: 'an object beyond the bound is not matched' }) : COMPLETE);
  const hits: FederatedHit[] = answer.strategy.filter((s) => s.status !== 'withdrawn' && contains(s.title, phrases)).map((s) => ({
    key: `${s.object_type}:${s.strategy_object_id}`, leg: 'strategy', kind: STRATEGY_KINDS[s.object_type] ?? s.object_type.toLowerCase(), id: s.strategy_object_id, version: s.object_version,
    label: s.title, detail: `${STRATEGY_KINDS[s.object_type] ?? s.object_type} v${s.object_version} — ${s.status}, ${s.verification_state}`,
    matchedOn: `the title contains “${firstMatching(s.title, phrases)}”`, href: '/graph/strategy', opens: 'list' as const }));
  return { outcome: { leg: 'strategy', phrase: null, state: partial.complete ? 'complete' : 'partial', receipt: answer.receipt.policyDecisionId, note: null, partial, count: hits.length }, hits };
}
/** /products/catalog/search (the catalog matches server-side; its hidden count is ITS rule — DAT-TR-01 — said in its words). */
export function catalogLeg(answer: { search: SearchAnswer; receipt: Receipt }): { outcome: LegOutcome; hits: FederatedHit[] } {
  const s = answer.search;
  const partial = s.hidden > 0 ? partialOf({ filters: [`the catalog counts ${s.hidden} entr${s.hidden === 1 ? 'y' : 'ies'} it does not serve (${s.hidden_by.undiscoverable} undiscoverable, ${s.hidden_by.clearance} above your clearance ${s.clearance})`],
    impact: 'those entries are counted by the catalog\'s own rule and never shown' }) : COMPLETE;
  const hits: FederatedHit[] = s.hits.map((a) => ({ key: `CAT:${a.asset_id}`, leg: 'catalog', kind: a.kind, id: a.asset_id, version: null, label: a.title,
    detail: `${a.kind} · ${a.trusted ? 'trusted' : 'untrusted'} · ${a.classification}`, matchedOn: 'the catalog search matched it', href: '/graph/data/catalog', opens: 'list' as const }));
  return { outcome: { leg: 'catalog', phrase: null, state: partial.complete ? 'complete' : 'partial', receipt: answer.receipt.policyDecisionId, note: null, partial, count: hits.length }, hits };
}
/** /prediction/exposures/list filtered by the phrases (title and statement). */
export function exposuresLeg(answer: { risks: ExposureRow[]; opportunities: ExposureRow[]; receipt: Receipt }, phrases: readonly string[]): { outcome: LegOutcome; hits: FederatedHit[] } {
  const rows = [...answer.risks, ...answer.opportunities];
  const hits: FederatedHit[] = rows.filter((e) => contains(`${e.title ?? ''} ${e.statement ?? ''}`, phrases)).map((e) => ({
    key: `RSK:${e.exposure_id}`, leg: 'exposures', kind: 'exposure', id: e.exposure_id, version: e.current_version, label: e.title ?? e.exposure_id,
    detail: `${e.polarity} · ${e.category_key} · ${e.state} · v${e.current_version}`, matchedOn: `the title or statement contains “${firstMatching(`${e.title ?? ''} ${e.statement ?? ''}`, phrases)}”`,
    href: '/prediction/exposures', opens: 'list' as const }));
  return { outcome: { leg: 'exposures', phrase: null, state: 'complete', receipt: answer.receipt.policyDecisionId, note: null, partial: COMPLETE, count: hits.length }, hits };
}
/** /decisions/list filtered by the phrases — the objects a decision command acts on. */
export function packagesLeg(answer: { packages: Package[]; receipt: Receipt }, phrases: readonly string[]): { outcome: LegOutcome; hits: FederatedHit[] } {
  const hits: FederatedHit[] = answer.packages.filter((p) => contains(`${p.title} ${p.statement}`, phrases)).map((p) => ({
    key: `DPK:${p.package_id}`, leg: 'packages', kind: 'package', id: p.package_id, version: p.current_version, label: p.title,
    detail: `decision package · ${p.state.replace(/_/g, ' ')}${p.current_version === null ? '' : ` · v${p.current_version}`}${p.synthetic_state ? ' · SYNTHETIC' : ''}`,
    matchedOn: `the title or statement contains “${firstMatching(`${p.title} ${p.statement}`, phrases)}”`, href: `/decisions/packages/${p.package_id}`, opens: 'object' as const }));
  return { outcome: { leg: 'packages', phrase: null, state: 'complete', receipt: answer.receipt.policyDecisionId, note: null, partial: COMPLETE, count: hits.length }, hits };
}

/* ═════════════════════════════ THE FEDERATION ═════════════════════════════ */
export interface Federated { phrases: string[]; legs: LegOutcome[]; hits: FederatedHit[]; partial: PartialDeclaration; readAt: string }
/** One canonical order (leg, kind, label, key); a record found by two reads of the same leg once. */
export function federate(parts: ReadonlyArray<{ outcome: LegOutcome; hits: readonly FederatedHit[] }>, phrases: readonly string[], readAt: string): Federated {
  const seen = new Map<string, FederatedHit>();
  for (const p of parts) for (const h of p.hits) if (!seen.has(`${h.leg}|${h.key}`)) seen.set(`${h.leg}|${h.key}`, h);
  const hits = [...seen.values()].sort((a, b) => LEG_KEYS.indexOf(a.leg) - LEG_KEYS.indexOf(b.leg) || a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  return { phrases: [...phrases], legs: parts.map((p) => p.outcome), hits, partial: mergePartial(...parts.map((p) => p.outcome.partial)), readAt };
}
/** The kinds the reading named come first (the scope), then the rest — nothing is dropped by a kind word. */
export function rankHits(hits: readonly FederatedHit[], kinds: readonly string[]): { scoped: FederatedHit[]; other: FederatedHit[] } {
  if (kinds.length === 0) return { scoped: [...hits], other: [] };
  return { scoped: hits.filter((h) => kinds.includes(h.kind)), other: hits.filter((h) => !kinds.includes(h.kind)) };
}
/** The person's CHOICE in a clarification: the ambiguous phrase now means the chosen record — the other alternatives leave the set. */
export function narrowTo(hits: readonly FederatedHit[], reading: Reading, choiceKey: string | null): FederatedHit[] {
  if (choiceKey === null || reading.kind !== 'ambiguous') return [...hits];
  const others = new Set(reading.alternatives.map((a) => a.key).filter((k) => k !== choiceKey));
  return hits.filter((h) => !others.has(h.key));
}

/* ═════════════════════════════ THE SAVED SEARCH (0119 §SI) ═════════════════════════════ */
export interface SavedResult { leg: string; kind: string; id: string; version: number | null; label: string }
export interface SavedLeg { leg: LegKey; receipt: string | null; state: LegState; note: string | null }
export const resultsOf = (hits: readonly FederatedHit[]): SavedResult[] => hits.map((h) => ({ leg: h.leg, kind: h.kind, id: h.id, version: h.version, label: h.label.slice(0, 300) }));
export const legsOf = (legs: readonly LegOutcome[]): SavedLeg[] => {
  const out: SavedLeg[] = []; const refused = new Set<LegKey>();
  for (const l of legs) {
    if (l.receipt === null) { if (refused.has(l.leg)) continue; refused.add(l.leg); }
    out.push({ leg: l.leg, receipt: l.receipt, state: l.state, note: l.note === null ? null : l.note.slice(0, 500) });
  }
  return out;
};
export interface Drift {
  /** the live re-run returns exactly the saved ids and versions */ exact: boolean;
  added: SavedResult[]; removed: SavedResult[]; changed: Array<{ key: string; label: string; saved: number | null; live: number | null }>; unchanged: number;
  statement: string;
}
const keyOf = (r: SavedResult) => `${r.leg}|${r.kind}|${r.id}`;
/** D10 / Q14: the saved set against a live re-run — what was added, removed or moved to another version. The saved set stays the saved set. */
export function driftOf(saved: readonly SavedResult[], live: readonly SavedResult[]): Drift {
  const s = new Map(saved.map((r) => [keyOf(r), r])); const l = new Map(live.map((r) => [keyOf(r), r]));
  const added = live.filter((r) => !s.has(keyOf(r)));
  const removed = saved.filter((r) => !l.has(keyOf(r)));
  const changed = saved.filter((r) => l.has(keyOf(r)) && (l.get(keyOf(r))!.version ?? null) !== (r.version ?? null))
    .map((r) => ({ key: keyOf(r), label: r.label, saved: r.version, live: l.get(keyOf(r))!.version }));
  const unchanged = saved.length - removed.length - changed.length;
  const exact = added.length === 0 && removed.length === 0 && changed.length === 0;
  const statement = exact ? 'The live re-run returns exactly the saved records and versions.'
    : `Since the cutoff: ${say(added.length, 'record')} added, ${say(removed.length, 'record')} no longer returned, ${say(changed.length, 'record')} at another version — the saved result set below is unchanged.`;
  return { exact, added, removed, changed, unchanged, statement };
}

/* ═════════════════════════════ THE CLIENT ═════════════════════════════ */
/**
 * THE FEDERATED RUN: the governed reads, one after another (each its own audited read; the graph search once per phrase, at most 4).
 * Nothing here writes: saving the search and recording the intent are the person's own acts (below).
 */
export async function runFederated(s: Scope, phrases: readonly string[], legs: readonly LegKey[] = LEG_KEYS): Promise<Federated> {
  const parts: Array<{ outcome: LegOutcome; hits: FederatedHit[] }> = [];
  const err = (r: { status: number; error?: { message: string } }): Err => ({ status: r.status, message: r.error?.message ?? 'the read could not be completed' });
  const ps = phrases.slice(0, 4);
  if (legs.includes('graph')) for (const p of ps) { const r = await graph.search(s, p); parts.push(r.ok && r.data !== undefined ? graphLeg(r.data, p) : { outcome: refusedLeg('graph', err(r), p), hits: [] }); }
  if (legs.includes('strategy')) { const r = await graph.listStrategy(s); parts.push(r.ok && r.data !== undefined ? strategyLeg(r.data, ps) : { outcome: refusedLeg('strategy', err(r)), hits: [] }); }
  if (legs.includes('catalog')) { const r = await catalog.search(s, ps.join(' '), null); parts.push(r.ok && r.data !== undefined ? catalogLeg(r.data) : { outcome: refusedLeg('catalog', err(r)), hits: [] }); }
  if (legs.includes('exposures')) { const r = await exposures.list(s); parts.push(r.ok && r.data !== undefined ? exposuresLeg(r.data, ps) : { outcome: refusedLeg('exposures', err(r)), hits: [] }); }
  if (legs.includes('packages')) { const r = await decisions.list(s); parts.push(r.ok && r.data !== undefined ? packagesLeg(r.data, ps) : { outcome: refusedLeg('packages', err(r)), hits: [] }); }
  return federate(parts, ps, new Date().toISOString());
}

export interface SavedSearchVersion {
  saved_search_id: string; name: string; version: number; supersedes: string | null; query: string; intent: Record<string, unknown>; filters: Record<string, unknown>;
  legs: Array<{ leg: LegKey; state: LegState; note: string | null; receipt?: string; read_at?: string; policy_version?: string; basis: string }>;
  results: SavedResult[]; result_count: number; result_digest: string; digest_ok?: boolean; policy_version: string; policy_digest: string | null;
  cutoff: string; read_from: string; intent_record_id: string | null; saved_at: string; latest_version?: number;
}
export interface SearchesRead {
  read_at: string; claim: string; exact: SavedSearchVersion | null;
  saved: Array<{ name: string; versions: number; current: { saved_search_id: string; version: number; query: string; result_count: number; result_digest: string; policy_version: string; cutoff: string; saved_at: string; legs: Array<{ leg: string; state: string }> };
                 history: Array<{ saved_search_id: string; version: number; result_count: number; result_digest: string; cutoff: string; saved_at: string }> }>;
  intents: Array<{ intent_id: string; mode: string; input: string; interpreter: string; kind: string; alternatives: number; clarification: string | null; choice: string | null; outcome: string; command_action: string | null; recorded_at: string }>;
}
export interface SaveSearchIntake { name: string; expectedVersion: number; query: string; intent: Record<string, unknown> | null; filters: Record<string, unknown> | null; legs: SavedLeg[]; results: SavedResult[]; intentRecordId: string | null }
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/shell`;
const envOf = (s: Scope, action: string, objectType: string) => ({
  scope: 'DOMAIN' as const, tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: null,
  side_effect_class: (action.endsWith('.read') ? 'none' : 'reversible') as 'none' | 'reversible', consequence_class: 'C1' as const, purpose_id: 'navigation',
});
/** The SAVED-SEARCH and INTENT actions this module issues (the shell guard test reads them): one read, two personal records — no business write. */
export const SEARCH_ACTIONS = { reads: ['shell.search.read'], personal: ['shell.search.save', 'shell.intent.record'] } as const;
/** The caller's OWN saved searches of this domain and recent intent records; `savedSearchId` = that version exactly as saved. */
export function readSearches(s: Scope, savedSearchId: string | null = null, history = 5): Promise<ApiResult<{ searches: SearchesRead; receipt: Receipt }>> {
  return call(`${base(s)}/search/read`, envOf(s, 'shell.search.read', 'SRH'), { savedSearchId, history });
}
/** A new version of the person's saved search — asked for by the person; refused `(stale)` when it read an older version. */
export function saveSearch(s: Scope, intake: SaveSearchIntake): Promise<ApiResult<{ savedSearch: SavedSearchVersion; receipt: Receipt }>> {
  return call(`${base(s)}/search/save`, envOf(s, 'shell.search.save', 'SRH'), intake);
}
/** One intent record — what was typed, how it was read, what was offered, what the person chose. It executes nothing. */
export function recordIntent(s: Scope, intake: Record<string, unknown>): Promise<ApiResult<{ intent: Record<string, unknown> & { intent_id: string }; receipt: Receipt }>> {
  return call(`${base(s)}/intents/record`, envOf(s, 'shell.intent.record', 'ITN'), intake);
}
