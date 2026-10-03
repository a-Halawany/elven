/**
 * The metadata catalog client — CP-6 B90 part `catalog` (0095 §K; F-P7-F-11; DAT-TR-01).
 *
 * Every response is returned VERBATIM (the Graph client's rule): an asset's flags, its trusted and discoverable marks, its lineage, the
 * search's hidden count, the coverage debt — rendered exactly as the server computed them AS OF the instant the answer states. Nothing is
 * judged here: the words below name what the server said. The steward's and the owner's acts are the person's OWN; the server refuses
 * anyone the policy or the port does not name.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export type CatalogKind = 'schema' | 'field' | 'source' | 'product' | 'staging' | 'external';
export type FlagKind = 'unowned' | 'stale' | 'duplicate' | 'inconsistent' | 'orphan' | 'lineage_missing' | 'ownership_lapsed';
export type LineageKind = 'derives_from' | 'feeds' | 'serves' | 'describes';
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';

export interface Flag { kind: FlagKind; since: string; reason: string }
export interface AssetRow {
  asset_id: string; tenant_id: string; domain_id: string; kind: CatalogKind; ref: string; title: string; description: string | null;
  owner_principal_id: string | null; owner_name: string | null; classification: Classification; contracts: Record<string, unknown>; locations: unknown[]; glossary_terms: string[];
  quality: Record<string, unknown>; slo: Record<string, unknown>; consumers: Record<string, unknown>; release: Record<string, unknown>; lifecycle_state: string;
  discoverable: boolean; trusted: boolean; flags: Flag[]; last_observed_at: string | null; recertify_by: string | null; registered_by: string; registered_at: string; updated_at: string; stale_now: boolean;
}
export interface Neighbour { edge_id: string; kind: LineageKind; asset_id: string; asset_kind: CatalogKind; ref: string; title: string; trusted: boolean; discoverable: boolean; declared_at: string; evidence: Record<string, unknown> }
export interface TermRow { term_id: string; term: string; definition: string; owner_principal_id: string; owner_name: string | null; version: number; since: string; updated_at: string | null }
export interface CatalogEvent { event_id: string; event: string; occurred_at: string; actor_principal_id: string | null; details: Record<string, unknown> }
export interface ProductFacts { product_id: string; product_key: string; kind: string; state: string; released_version: number | null; owner_principal_id: string; slo: Record<string, { value: number; threshold: number | null; met: boolean; observed_at: string; source: string }> }
export interface AssetView extends AssetRow { upstream: Neighbour[]; downstream: Neighbour[]; terms: TermRow[]; product: ProductFacts | null; events: CatalogEvent[]; rank?: number }
export interface SearchAnswer { at: string; q: string; clearance: string; kinds: string[]; total: number; hidden: number; hidden_by: { undiscoverable: number; clearance: number }; hits: AssetView[] }
export interface KindStats { total: number; owned: number; trusted: number; discoverable: number; lineage_covered: number; flagged: Record<string, number> }
export interface Coverage {
  at: string; kinds: Record<string, KindStats>;
  totals: { total: number; owned: number; unowned: number; trusted: number; untrusted: number; discoverable: number; undiscoverable: number; lineage_covered: number; flagged: number; stale_now: number };
  flagged_by_kind: Record<string, number>; last_reconciliation: RunRow | null; open_items: number; staleness_period: string; recertification_period: string;
}
export interface RunRow { run_id: string; trigger: 'tick' | 'steward'; started_at: string; finished_at: string; counts: { seen: number; created: number; flagged_by_kind: Record<string, number>; cleared: number; attention_items: number }; actor_principal_id: string }
export interface TrustAnswer { known: boolean; asset_id?: string; kind: string; ref: string; title?: string; trusted: boolean; discoverable: boolean; flags: Flag[]; as_of: string; note?: string }
export interface EdgeRow { edge_id: string; from_asset_id: string; to_asset_id: string; kind: LineageKind; evidence: Record<string, unknown>; declared_by: string; declared_at: string; from_title: string; to_title: string; from_kind: CatalogKind; to_kind: CatalogKind }

/* ───────────── what the screen says, in words (glyph + text, never colour alone) ───────────── */
export const KIND_LABEL: Record<CatalogKind, string> = {
  schema: 'schema', field: 'canonical field', source: 'source', product: 'data product', staging: 'staging asset', external: 'external asset',
};
export const FLAG_LABEL: Record<FlagKind, string> = {
  unowned: '⚑ unowned — coverage debt: no named owner',
  stale: '⌛ stale — not seen in its registry within the staleness period (untrusted)',
  duplicate: '⧉ duplicate — another entry of the kind carries the same title',
  inconsistent: '≠ inconsistent — the steward found the registries disagree (untrusted)',
  orphan: '⊘ orphan — no registry row, or a staging asset with no owner and no lineage (undiscoverable)',
  lineage_missing: '⋯ lineage missing — a released product with no lineage edge',
  ownership_lapsed: '⌛ ownership lapsed — the recertification is overdue (untrusted)',
};
export const LINEAGE_LABEL: Record<LineageKind, string> = { derives_from: 'derives from', feeds: 'feeds', serves: 'serves', describes: 'describes' };
export const CATALOG_KINDS: CatalogKind[] = ['schema', 'field', 'source', 'product', 'staging', 'external'];
export const FLAG_KINDS: FlagKind[] = ['unowned', 'stale', 'duplicate', 'inconsistent', 'orphan', 'lineage_missing', 'ownership_lapsed'];
export const LINEAGE_KINDS: LineageKind[] = ['derives_from', 'feeds', 'serves', 'describes'];
export const CLASSIFICATIONS: Classification[] = ['public', 'internal', 'confidential', 'restricted'];

/** A DATE or an instant renders as the day it names (no timezone shift). */
export function dayOf(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m === null ? v : m[1]!;
}
/** The trust line: the server's two marks in words, with the flags that cause them. */
export function trustLine(a: Pick<AssetRow, 'trusted' | 'discoverable' | 'flags' | 'stale_now'>): string {
  const causes = a.flags.map((f) => f.kind);
  const untrust = causes.filter((k) => k === 'stale' || k === 'ownership_lapsed' || k === 'inconsistent');
  if (a.stale_now && !untrust.includes('stale')) untrust.push('stale');
  const trusted = a.trusted && !a.stale_now;
  const t = trusted ? '✓ trusted' : `✗ UNTRUSTED (${untrust.map((k) => k.replace('_', ' ')).join(', ') || 'by the steward'})`;
  const d = a.discoverable ? '◎ discoverable' : `⊘ undiscoverable (${causes.includes('orphan') ? 'orphan' : 'by the steward'})`;
  return `${t} · ${d}`;
}
export function flagLine(f: Flag): string {
  return `${FLAG_LABEL[f.kind] ?? f.kind} · since ${dayOf(f.since)} — ${f.reason}`;
}
/** A neighbour in words: upstream reads "X (kind) derives from → this"; downstream "this → feeds Y (kind)". */
export function lineageLine(direction: 'upstream' | 'downstream', n: Pick<Neighbour, 'kind' | 'title' | 'asset_kind' | 'trusted'>): string {
  const who = `${n.title} (${KIND_LABEL[n.asset_kind] ?? n.asset_kind}${n.trusted ? '' : ', untrusted'})`;
  return direction === 'upstream' ? `${who} — ${LINEAGE_LABEL[n.kind] ?? n.kind} → this asset` : `this asset — ${LINEAGE_LABEL[n.kind] ?? n.kind} → ${who}`;
}
/** The coverage debt of one kind in words: never a percentage. */
export function coverageLine(kind: string, s: KindStats): string {
  const flags = Object.entries(s.flagged).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k.replace('_', ' ')} ${n}`).join(', ');
  return `${KIND_LABEL[kind as CatalogKind] ?? kind}: ${s.total} total · ${s.owned} owned · ${s.trusted} trusted · ${s.discoverable} discoverable · ${s.lineage_covered} with lineage${flags === '' ? '' : ` · flags: ${flags}`}`;
}
export function hiddenLine(s: Pick<SearchAnswer, 'total' | 'hidden' | 'hidden_by'>): string {
  if (s.hidden === 0) return `${s.total} match(es), nothing hidden`;
  return `${s.total} match(es) · ${s.hidden} hidden: ${s.hidden_by.undiscoverable} undiscoverable, ${s.hidden_by.clearance} above your clearance`;
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/products/catalog`;
async function p<T>(s: Scope, path: string, action: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read') || action.endsWith('.search');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'CAT', object_id: objectId, purpose_id: 'executive',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}

export const catalog = {
  search: (s: Scope, q: string, kinds: CatalogKind[] | null, limit = 50) => p<{ search: SearchAnswer; receipt: Receipt }>(s, '/search', 'products.catalog.search', { q, kinds, limit }),
  coverage: (s: Scope) => p<{ coverage: Coverage; runs: RunRow[]; receipt: Receipt }>(s, '/coverage', 'products.catalog.read'),
  list: (s: Scope, q: { kind?: CatalogKind; flag?: FlagKind; limit?: number } = {}) => p<{ at: string; assets: AssetRow[]; receipt: Receipt }>(s, '/assets/list', 'products.catalog.read', q),
  terms: (s: Scope) => p<{ at: string; terms: TermRow[]; receipt: Receipt }>(s, '/terms/list', 'products.catalog.read'),
  read: (s: Scope, assetId: string) => p<{ at: string; asset: AssetView; receipt: Receipt }>(s, `/assets/${assetId}/read`, 'products.catalog.read', {}, assetId),
  trust: (s: Scope, kind: CatalogKind, ref: string) => p<{ trust: TrustAnswer; receipt: Receipt }>(s, '/trust', 'products.catalog.read', { kind, ref }),
  register: (s: Scope, payload: { kind: CatalogKind; ref: string; title: string; description?: string; ownerPrincipalId?: string | null; classification?: Classification; glossaryTerms?: string[]; locations?: unknown[]; contracts?: Record<string, unknown> }) =>
    p<{ asset: AssetRow; receipt: Receipt }>(s, '/assets/register', 'products.catalog.asset.register', payload),
  setOwner: (s: Scope, assetId: string, ownerPrincipalId: string) => p<{ asset: AssetRow; receipt: Receipt }>(s, `/assets/${assetId}/owner`, 'products.catalog.owner.set', { ownerPrincipalId }, assetId),
  recertify: (s: Scope, assetId: string) => p<{ asset: AssetRow; receipt: Receipt }>(s, `/assets/${assetId}/recertify`, 'products.catalog.recertify', {}, assetId),
  flag: (s: Scope, assetId: string, kind: FlagKind, reason: string, clear: boolean) => p<{ asset: AssetRow; receipt: Receipt }>(s, `/assets/${assetId}/flag`, 'products.catalog.flag', { kind, reason, clear }, assetId),
  declareLineage: (s: Scope, payload: { fromAssetId: string; toAssetId: string; kind: LineageKind; evidence?: Record<string, unknown> }) =>
    p<{ edge: EdgeRow; receipt: Receipt }>(s, '/lineage/declare', 'products.catalog.lineage.declare', payload, payload.fromAssetId),
  defineTerm: (s: Scope, payload: { term: string; definition: string; ownerPrincipalId: string }) => p<{ term: TermRow; receipt: Receipt }>(s, '/terms/define', 'products.catalog.term.define', payload),
  reconcile: (s: Scope) => p<{ run: RunRow; receipt: Receipt }>(s, '/reconcile', 'products.catalog.reconcile'),
};
