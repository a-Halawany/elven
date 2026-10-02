/**
 * CP-6 B29 §A (0092) client — twin families, composition contracts, links, coupling proposals and the dependency-completeness measure.
 * Every read and write goes through the governed envelope (/twin-composition); the panel shows what the record says. A coupling is
 * PROPOSED by the upstream's admission and applied or declined by the DOWNSTREAM owner only — the server refuses anyone else, and the
 * panel shows the refusal in the server's words.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

export interface Completeness {
  twin_id: string; kind: string; family: string | null; required: string[]; linked: string[]; direct: string[]; satisfied: string[]; missing: string[];
  required_count: number; satisfied_count: number; ratio: number;
}
export interface Contract {
  twin_id: string; contract_version: number; state: 'current' | 'superseded'; exposed: Record<string, { unit: string | null; cadence: string }>;
  approved_uses: { method_families: string[]; decision_classes: string[] }; published_by: string; published_at: string;
}
export interface Link {
  link_id: string; upstream_twin_id: string; downstream_twin_id: string; mapping: Array<{ from: string; to: string }>; use_class: string;
  contract_version: number; state: 'live' | 'retired'; declared_at: string; retired_at: string | null; retire_reason: string | null;
}
export interface CoupledElement { key: string; from_key: string; kind: string; value: unknown; unit: string | null }
export interface Proposal {
  proposal_id: string; link_id: string; upstream_twin_id: string; upstream_version: number; downstream_twin_id: string;
  upstream_citation: { kind: 'twin'; id: string; version: number; digest: string }; elements: CoupledElement[];
  state: 'proposed' | 'applied' | 'declined' | 'superseded'; proposed_at: string; decided_by: string | null; decided_at: string | null;
  decision_note: string | null; applied_version: number | null;
}
export interface FamilyMeasures { twin_id: string; kind: string; family: string | null; version: number | null; as_of?: string | null; measures: Record<string, number | string | boolean | null> }
export interface Kind {
  kind: string; family: string | null; description: string; element_schema: Record<string, { unit: string | null; description: string; required: boolean }>;
  material_keys: string[]; required_dependencies: string[]; default_methods: string[]; scope: 'product' | 'domain';
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/twin-composition`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'twin', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const composition = {
  kinds: (s: Scope) => p<{ kinds: Kind[]; receipt: Receipt }>(s, '/kinds/list', 'twin.read', 'TWN'),
  completeness: (s: Scope, twinId: string) => p<{ completeness: Completeness; receipt: Receipt }>(s, `/twins/${twinId}/completeness`, 'twin.read', 'TWN', {}, twinId),
  measures: (s: Scope, twinId: string) => p<{ measures: FamilyMeasures; receipt: Receipt }>(s, `/twins/${twinId}/measures`, 'twin.read', 'TWN', {}, twinId),
  contracts: (s: Scope, twinId: string) => p<{ contracts: Contract[]; receipt: Receipt }>(s, `/twins/${twinId}/contracts/list`, 'twin.read', 'TWN', {}, twinId),
  links: (s: Scope, twinId: string) => p<{ links: Link[]; receipt: Receipt }>(s, '/links/list', 'twin.read', 'TWN', { twinId }, twinId),
  proposals: (s: Scope, twinId: string) => p<{ proposals: Proposal[]; receipt: Receipt }>(s, '/couplings/list', 'twin.read', 'TWN', { twinId }, twinId),
  apply: (s: Scope, proposalId: string) => p<{ applied: { proposal_id: string; version: number; opened: boolean; keys: string[] }; receipt: Receipt }>(
    s, `/couplings/${proposalId}/apply`, 'twin.coupling.apply', 'CPL', {}, proposalId),
  decline: (s: Scope, proposalId: string, reason: string) => p<{ declined: { proposal_id: string; state: string }; receipt: Receipt }>(
    s, `/couplings/${proposalId}/decline`, 'twin.coupling.decline', 'CPL', { reason }, proposalId),
};

export interface Badge { glyph: string; token: string; text: string }

/** L5-C06 as glyph + label + token (never colour alone): complete, partial (n of m, the missing named), or nothing required. */
export function completenessLabel(c: Pick<Completeness, 'required_count' | 'satisfied_count' | 'missing'> | null | undefined): Badge {
  if (c === null || c === undefined) return { glyph: '?', token: '--eye-color-ink-muted', text: 'dependency completeness not read' };
  if (c.required_count === 0) return { glyph: '○', token: '--eye-color-ink-muted', text: 'no dependencies required by this kind' };
  if (c.missing.length === 0) return { glyph: '●', token: '--eye-color-success', text: `complete — ${c.satisfied_count} of ${c.required_count} required families linked` };
  return { glyph: '◐', token: '--eye-color-warning', text: `${c.satisfied_count} of ${c.required_count} required families linked — missing ${c.missing.map(familyWords).join(', ')}` };
}
/** A required entry reads as its families: 'supply-chain|supply-network' → 'supply-chain or supply-network'. */
export const familyWords = (r: string): string => r.split('|').join(' or ');

/** One line per coupled element: `to ← from = value unit` — the upstream key named, never merged into the downstream's. */
export function proposalLines(p: Pick<Proposal, 'elements'>): string[] {
  return p.elements.map((e) => `${e.key} ← ${e.from_key} = ${typeof e.value === 'object' && e.value !== null ? JSON.stringify(e.value) : String(e.value)}${e.unit ? ` ${e.unit}` : ''} (${e.kind})`);
}
/** The upstream a proposal cites, as the citation names it: `twin 1234abcd…@v3 (digest 9f8e7d6c…)`. */
export function upstreamLine(p: Pick<Proposal, 'upstream_citation'>): string {
  const c = p.upstream_citation;
  return `twin ${c.id.slice(0, 8)}…@v${c.version} (digest ${c.digest.slice(0, 8)}…)`;
}
/** A measure's value as the server gave it: a ratio shown as a percentage beside the figure, an absent measure as "not derivable". */
export function measureText(name: string, v: number | string | boolean | null | undefined): string {
  if (v === null || v === undefined) return 'not derivable from the admitted state';
  if (typeof v === 'number' && /(utilisation|ratio|coverage|share)$/.test(name)) return `${v} (${Math.round(v * 1000) / 10}%)`;
  return String(v);
}
