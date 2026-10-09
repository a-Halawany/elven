/**
 * CP-6 B33 §SC (0111) — SUPPLY-CHAIN INTELLIGENCE, the pure part (no clock, no I/O; every figure a caller seeds is SYNTHETIC unless it says so):
 *
 *   UNCERTAINTY (SC1; AI-53-003)   the network's tier coverage split declared / validated / inferred, and per tier what is UNKNOWN (the
 *                                  parent, the country, the contract), what is unvalidated and what is single-sourced — counted, never imputed.
 *   RECORDS (SC2)                  the shipment / customs / supplier records an evidence version holds (CSV), parsed deterministically.
 *   HIDDEN TIERS (SC2; PR-30-003)  the rule the Supply Chain Agent applies: a vendor whose bill of materials needs material M that NO declared
 *                                  route brings it, AND records citing evidence that name a shipper of M to it → a HIDDEN supplier one tier
 *                                  behind it, with a confidence from the records' count and agreement (never from narrative), its evidence,
 *                                  and whether it names a counterparty (SENSITIVE). A shipper whose name matches a declared site elsewhere in
 *                                  the network is an IDENTITY CONFLICT: the inference is ISOLATED (never validated as it stands).
 *   THE MAP (SC3; JRN-11)          a disruption on chokepoints / places → every network route passing it DERATED, the throughput to the
 *                                  terminal recomputed, and through the network's live links the affected LINE's run rate, its days of cover
 *                                  from the inventory elements and the line-stop exposure; inferred-but-unvalidated sites EXCLUDED and listed,
 *                                  identity conflicts ISOLATED, stale inputs FLAGGED; coverage and confidence stated.
 *   ALTERNATIVES (SC4/SC5)         an option evaluated on its scenario branch: the run rate restored under the same disruption, the time to
 *                                  effect against the cover, the constraint verdict, the cost; FEASIBLE, INFEASIBLE (reasons) or INDETERMINATE
 *                                  (a coverage gap, stale inputs, an unvalidated dependency) — only a feasible option is recommendable.
 */
import { createHash } from 'node:crypto';
import {
  readNetwork, readExtras, withoutSites, deratedFlows, analyseNetwork,
  type FamilyElement, type Network, type NetworkExtras, type ProvenanceBasis,
} from '../supply-network/network.js';

type Row = Record<string, unknown>;
const round = (v: number, places = 4): number => Math.round(v * 10 ** places) / 10 ** places;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const norm = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const slug = (s: string): string => norm(s).replace(/ /g, '-').slice(0, 40).replace(/-+$/g, '');
/** The canonical JSON a digest is taken over (keys sorted, recursively) — the SQL side digests the same text it is handed. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export const digestOf = (v: unknown): string => createHash('sha256').update(canonical(v), 'utf8').digest('hex');
const complete = (elements: readonly FamilyElement[]) => elements.filter((e) => e.health === undefined || e.health === null || e.health === 'complete');

// ─────────────────────────────── SC1: the uncertainty roll-up ───────────────────────────────
export interface TierUncertainty {
  tier: number; sites: number; declared: number; validated: number; inferred: number;
  unknown_parent: number; unknown_country: number; unknown_contract: number; single_source: number; routes: number; covered: boolean;
}
export interface SiteView {
  id: string; tier: number; name: string; basis: ProvenanceBasis; inference_id: string | null; country: string | null; city: string | null; entity_id: string | null;
  ownership: { parent: string | null; share: number | null; confidence: number } | null; contract: { ref: string; until: string | null; confidence: number } | null;
  geo_confidence: number | null; confidence: number | null; unknown: string[];
}
export interface Uncertainty {
  tiers: TierUncertainty[];
  coverage: { sites: number; declared: number; validated: number; inferred: number; declared_share: number | null; validated_share: number | null; inferred_share: number | null };
  sites: SiteView[];
  routes: Array<{ id: string; from: string; to: string; material: string; mode: string | null; via: string[]; lead_days: number | null; confidence: number | null; unknown: string[] }>;
  /** a vendor's bill of materials names a material no declared route brings it: the network is not modelled behind it for that material */
  unsourced: Array<{ site: string; tier: number; material: string }>;
  rule: string;
}

/** The terminal is the plant itself: its own country and parent are known to its owner, so it is never counted unknown. */
export function uncertaintyOf(elements: readonly FamilyElement[]): Uncertainty {
  const els = complete(elements);
  const { network: n } = readNetwork(els);
  const x = readExtras(els);
  const singles = new Set(analyseNetwork(els).single_sources.map((s) => s.supplier));
  const sites: SiteView[] = [...n.sites.values()].sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1)).map((s) => {
    const e = x.sites.get(s.id);
    const unknown: string[] = [];
    if (s.tier > 0) {
      if (e?.ownership === null || e?.ownership === undefined || e.ownership.parent === null) unknown.push('parent');
      if (e?.country === null || e?.country === undefined) unknown.push('country');
      if (e?.contract === null || e?.contract === undefined) unknown.push('contract');
      if (e?.geo === null || e?.geo === undefined) unknown.push('geo_confidence');
    }
    return { id: s.id, tier: s.tier, name: s.name, basis: e?.provenance.basis ?? 'declared', inference_id: e?.provenance.inference_id ?? null, country: e?.country ?? null,
             city: e?.city ?? null, entity_id: e?.entity_id ?? null, ownership: e?.ownership ?? null, contract: e?.contract ?? null, geo_confidence: e?.geo?.confidence ?? null,
             confidence: e?.provenance.confidence ?? null, unknown };
  });
  const tiers: TierUncertainty[] = n.tiers.map((tier) => {
    const at = sites.filter((s) => s.tier === tier);
    const routes = n.routes.filter((r) => at.some((s) => s.id === r.from)).length;
    return {
      tier, sites: at.length, declared: at.filter((s) => s.basis === 'declared').length, validated: at.filter((s) => s.basis === 'validated').length,
      inferred: at.filter((s) => s.basis === 'inferred').length, unknown_parent: at.filter((s) => s.unknown.includes('parent')).length,
      unknown_country: at.filter((s) => s.unknown.includes('country')).length, unknown_contract: at.filter((s) => s.unknown.includes('contract')).length,
      single_source: at.filter((s) => singles.has(s.id)).length, routes, covered: at.length > 0 && routes > 0,
    };
  });
  const suppliers = sites.filter((s) => s.tier > 0);
  const share = (k: number) => (suppliers.length === 0 ? null : round(k / suppliers.length));
  const declared = suppliers.filter((s) => s.basis === 'declared').length; const validated = suppliers.filter((s) => s.basis === 'validated').length;
  const inferred = suppliers.filter((s) => s.basis === 'inferred').length;
  const routes = n.routes.map((r) => {
    const e = x.routes.get(r.id);
    const unknown: string[] = [];
    if (e === undefined || e.via.length === 0) unknown.push('via');
    if (e?.lead_days === null || e?.lead_days === undefined) unknown.push('lead_days');
    if (e?.confidence === null || e?.confidence === undefined) unknown.push('confidence');
    return { id: r.id, from: r.from, to: r.to, material: r.material, mode: e?.mode ?? null, via: e?.via ?? [], lead_days: e?.lead_days ?? null, confidence: e?.confidence ?? null, unknown };
  });
  return {
    tiers, coverage: { sites: suppliers.length, declared, validated, inferred, declared_share: share(declared), validated_share: share(validated), inferred_share: share(inferred) },
    sites, routes, unsourced: unsourcedOf(n),
    rule: 'uncertainty@1 — per supplier site: parent, country, contract, geo confidence UNKNOWN when not declared (never imputed); provenance declared / validated / inferred; single source from the B29 analysis; a vendor input no declared route brings is unsourced',
  };
}

/** Every (site, material) a supplier's bill of materials names that no route brings it. */
export function unsourcedOf(n: Network): Array<{ site: string; tier: number; material: string }> {
  const out: Array<{ site: string; tier: number; material: string }> = [];
  for (const s of [...n.sites.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (s.tier < 1) continue;
    for (const m of Object.keys(s.bom).sort()) if (!n.routes.some((r) => r.to === s.id && r.material === m)) out.push({ site: s.id, tier: s.tier, material: m });
  }
  return out;
}

// ─────────────────────────────── SC2: the records an evidence version holds ───────────────────────────────
export const RECORD_KINDS = ['shipment', 'customs', 'supplier'] as const;
export interface SupplyRecord {
  record_id: string | null; record_kind: typeof RECORD_KINDS[number]; consignee: string; shipper: string | null; shipper_country: string | null; shipper_city: string | null;
  material: string; quantity: number | null; unit: string | null; date: string | null; via: string[]; contract_ref: string | null; synthetic: boolean | null;
}
/** A CSV line split on commas outside double quotes. */
function cells(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i] as string;
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
/**
 * The supply records of one evidence version: a CSV whose header names at least record_kind, consignee, shipper (may be empty — an unnamed
 * shipper) and material; optional shipper_country, shipper_city, quantity, unit, date (YYYY-MM-DD), via ('|'-separated keys), contract_ref,
 * record_id, synthetic. Anything else (another CSV, a series) holds no supply record — `recognised: false`, never an error.
 */
export function parseSupplyRecords(text: string): { recognised: boolean; records: SupplyRecord[]; rejected: number } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { recognised: false, records: [], rejected: 0 };
  const header = cells(lines[0] as string).map((h) => h.toLowerCase());
  const col = (k: string) => header.indexOf(k);
  if (['record_kind', 'consignee', 'shipper', 'material'].some((k) => col(k) < 0)) return { recognised: false, records: [], rejected: 0 };
  const records: SupplyRecord[] = []; let rejected = 0;
  for (const line of lines.slice(1)) {
    const c = cells(line);
    const get = (k: string): string | null => { const i = col(k); const v = i < 0 ? '' : (c[i] ?? ''); return v === '' ? null : v; };
    const kind = (get('record_kind') ?? '').toLowerCase();
    const consignee = get('consignee'); const material = get('material');
    const qty = get('quantity'); const date = get('date'); const country = get('shipper_country');
    if (!(RECORD_KINDS as readonly string[]).includes(kind) || consignee === null || material === null
        || (qty !== null && !(Number.isFinite(Number(qty)) && Number(qty) >= 0)) || (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date))
        || (country !== null && !/^[A-Z]{2}$/.test(country))) { rejected += 1; continue; }
    const syn = get('synthetic');
    records.push({
      record_id: get('record_id'), record_kind: kind as SupplyRecord['record_kind'], consignee, shipper: get('shipper'), shipper_country: country, shipper_city: get('shipper_city'),
      material, quantity: qty === null ? null : Number(qty), unit: get('unit'), date, via: (get('via') ?? '').split('|').map((v) => v.trim().toLowerCase()).filter((v) => /^[a-z0-9][a-z0-9-]{0,60}$/.test(v)),
      contract_ref: get('contract_ref'), synthetic: syn === null ? null : ['true', '1', 'yes'].includes(syn.toLowerCase()),
    });
  }
  return { recognised: true, records, rejected };
}

// ─────────────────────────────── SC2: the hidden-tier rule ───────────────────────────────
export interface EvidenceRef { kind: 'evidence'; id: string; version: number; digest: string }
export interface RecordRead { evidence: EvidenceRef; records: SupplyRecord[] }
export interface InferenceCandidate {
  /** the site the hidden supplier stands behind, and the input it supplies */
  behind_site: string; behind_tier: number; material: string;
  proposed_site: string; proposed_value: Row; proposed_route: Row & { from: string; to: string; material: string };
  observed_flow_per_day: number | null; flow_unit: string | null;
  confidence: number; sensitive: boolean; sensitivity: string[];
  basis: Row; evidence: EvidenceRef[]; evidence_digest: string;
  isolated: boolean; conflict: Row | null;
  /** the digest a validator quotes: the candidate as proposed (the agent's identity aside) */
  proposal_digest: string;
  rationale: string;
}
export const HIDDEN_TIER_RULE = 'hidden-tier@1 — a vendor whose bill of materials names material M that no declared route brings it, and records (shipment / customs / '
  + 'supplier) citing evidence that name a shipper of M to it: a hidden supplier one tier behind it. Confidence = agreement × (1 − 0.5^agreeing), where agreeing = the '
  + 'records naming the chosen shipper and agreement = agreeing / all records of M to that vendor (count and agreement only, never narrative). Sensitive when it names a '
  + 'counterparty or a contract. A shipper matching a declared site of the network is an identity conflict: the inference is isolated.';

const matchesSite = (n: Network, siteId: string, consignee: string): boolean => {
  const s = n.sites.get(siteId);
  return s !== undefined && (norm(consignee) === norm(siteId) || norm(consignee) === norm(s.name));
};
const matchesMaterial = (n: Network, materialId: string, label: string): boolean => {
  const m = n.materials.get(materialId);
  return norm(label) === norm(materialId) || (m !== undefined && norm(label) === norm(m.name));
};

/** The hidden suppliers the records support behind the network's unsourced vendor inputs (deterministic: the same reads, the same answer). */
export function inferHiddenTiers(elements: readonly FamilyElement[], reads: readonly RecordRead[]): InferenceCandidate[] {
  const els = complete(elements);
  const { network: n } = readNetwork(els);
  const x = readExtras(els);
  const out: InferenceCandidate[] = [];
  for (const u of unsourcedOf(n)) {
    const behind = x.sites.get(u.site);
    if (behind?.provenance.basis === 'inferred') continue;   // never infer behind an unvalidated inference
    const hits: Array<{ r: SupplyRecord; ev: EvidenceRef }> = [];
    for (const rd of reads) for (const r of rd.records) if (matchesSite(n, u.site, r.consignee) && matchesMaterial(n, u.material, r.material)) hits.push({ r, ev: rd.evidence });
    if (hits.length === 0) continue;
    // group by the shipper's identity as recorded (name, country, city) — an unnamed shipper groups by its country
    const groups = new Map<string, Array<{ r: SupplyRecord; ev: EvidenceRef }>>();
    for (const h of hits) {
      const k = `${norm(h.r.shipper ?? '')}|${h.r.shipper_country ?? ''}|${norm(h.r.shipper_city ?? '')}`;
      groups.set(k, [...(groups.get(k) ?? []), h]);
    }
    const [key, chosen] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))[0] as [string, Array<{ r: SupplyRecord; ev: EvidenceRef }>];
    const first = chosen[0]!.r;
    const agreeing = chosen.length; const agreement = agreeing / hits.length;
    const confidence = round(agreement * (1 - 0.5 ** agreeing), 3);
    const name = first.shipper ?? `Unnamed ${n.materials.get(u.material)?.name ?? u.material} supplier${first.shipper_country === null ? '' : ` (${first.shipper_country})`}`;
    const place = first.shipper_city ?? first.shipper_country ?? 'unknown';
    let proposed = `${slug(place)}-${slug(u.material)}`.slice(0, 60);
    while (n.sites.has(proposed)) proposed = `${proposed.slice(0, 56)}-${digestOf([proposed, key]).slice(0, 3)}`;
    // via: the routing the records agree on (the most frequent list), else unknown
    const vias = new Map<string, number>();
    for (const h of chosen) if (h.r.via.length > 0) { const k = h.r.via.join('|'); vias.set(k, (vias.get(k) ?? 0) + 1); }
    const via = [...vias.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0].split('|') ?? [];
    // the observed flow: the quantities over the days the records span (a LOWER bound of the capacity, stated as such)
    const dated = chosen.filter((h) => h.r.quantity !== null && h.r.date !== null);
    const unit = n.materials.get(u.material)?.unit ?? null;
    let flow: number | null = null;
    if (dated.length > 0 && dated.every((h) => h.r.unit === null || h.r.unit === unit)) {
      const days = dated.map((h) => Date.parse(`${h.r.date as string}T00:00:00Z`)).sort((a, b) => a - b);
      const span = Math.max(1, Math.round(((days[days.length - 1] as number) - (days[0] as number)) / 86_400_000) + 1);
      flow = round(dated.reduce((acc, h) => acc + (h.r.quantity as number), 0) / span, 2);
    }
    const evidence = [...new Map(chosen.map((h) => [`${h.ev.id}@${h.ev.version}`, h.ev])).values()].sort((a, b) => (`${a.id}@${a.version}` < `${b.id}@${b.version}` ? -1 : 1));
    const contractRef = chosen.find((h) => h.r.contract_ref !== null)?.r.contract_ref ?? null;
    const sensitivity = [...(first.shipper !== null ? ['a named counterparty'] : []), ...(contractRef !== null ? [`a contract (${contractRef})`] : [])];
    // identity: a shipper whose name is a declared site of the network that does NOT ship this material to this vendor contradicts the declaration
    const clash = [...n.sites.values()].find((s) => first.shipper !== null && norm(s.name) === norm(first.shipper));
    const conflict = clash === undefined ? null : { site: clash.id, reason: `the records name ${first.shipper}, which the network declares as site ${clash.id} (tier ${clash.tier}${x.sites.get(clash.id)?.country ? `, ${x.sites.get(clash.id)?.country}` : ''}) — and it ships no ${u.material} to ${u.site}: an identity conflict, isolated until the network or the records are corrected` };
    const proposedValue: Row = { tier: u.tier + 1, name, ...(first.shipper_country === null ? {} : { country: first.shipper_country }), ...(first.shipper_city === null ? {} : { city: first.shipper_city }),
                                 provenance: { basis: 'inferred', confidence } };
    const route = { from: proposed, to: u.site, material: u.material, ...(via.length === 0 ? {} : { via }), confidence };
    const basis: Row = { rule: HIDDEN_TIER_RULE, records: hits.length, agreeing, agreement: round(agreement, 4), shipper: first.shipper, shipper_country: first.shipper_country, shipper_city: first.shipper_city,
                         record_kinds: [...new Set(chosen.map((h) => h.r.record_kind))].sort(), record_ids: chosen.map((h) => h.r.record_id).filter((v) => v !== null).sort(), contract_ref: contractRef,
                         alternatives: [...groups.entries()].filter(([k]) => k !== key).map(([, g]) => ({ shipper: g[0]!.r.shipper, country: g[0]!.r.shipper_country, records: g.length })) };
    const evidenceDigest = digestOf(evidence.map((e) => `${e.id}@${e.version}:${e.digest}`));
    const core = { behind_site: u.site, material: u.material, proposed_site: proposed, proposed_value: proposedValue, proposed_route: route, observed_flow_per_day: flow, confidence, evidence_digest: evidenceDigest };
    out.push({
      behind_site: u.site, behind_tier: u.tier, material: u.material, proposed_site: proposed, proposed_value: proposedValue, proposed_route: route,
      observed_flow_per_day: flow, flow_unit: unit === null ? null : `${unit}/day`, confidence, sensitive: sensitivity.length > 0, sensitivity, basis, evidence, evidence_digest: evidenceDigest,
      isolated: conflict !== null, conflict, proposal_digest: digestOf(core),
      rationale: `${n.sites.get(u.site)?.name ?? u.site} (tier ${u.tier}) needs ${u.material} that no declared route brings it; ${agreeing} of ${hits.length} record(s) name ${name}`
        + `${first.shipper_city === null ? '' : ` in ${first.shipper_city}`}${first.shipper_country === null ? '' : ` (${first.shipper_country})`} as its shipper — a hidden tier-${u.tier + 1} supplier, confidence ${confidence}`
        + (conflict === null ? '' : ` — ISOLATED: ${String(conflict.reason)}`),
    });
  }
  return out;
}

// ─────────────────────────────── SC3: the disruption map ───────────────────────────────
export interface DisruptionSpec { chokepoints: string[]; places: Array<{ country?: string | null; city?: string | null }>; derating: number; duration_days: number | null }
export interface LinkedTwin { twin_id: string; title: string; version: number | null; owner: string | null; elements: FamilyElement[]; freshness: string | null; mapping: Array<{ from: string; to: string }> }
export interface NetworkInput {
  twin_id: string; title: string; version: number; owner: string | null; elements: FamilyElement[]; freshness: string | null; links: LinkedTwin[];
}
export interface LineImpact {
  twin_id: string; title: string; version: number | null; owner: string | null; lines: Array<{ line: string; capacity_per_day: number }>; line_capacity_per_day: number;
  supply_before_per_day: number | null; supply_after_per_day: number | null; run_rate_before_per_day: number | null; run_rate_after_per_day: number | null;
  shortfall_per_day: number | null; cover_days: number | null; cover_basis: Row[]; line_stop_days: number | null; utilisation_before: number | null; utilisation_after: number | null;
  stale: boolean;
}
export interface NetworkMap {
  twin_id: string; title: string; version: number; owner: string | null; terminal: string | null; unit: string | null;
  affected_routes: Array<{ route: string; from: string; to: string; material: string; via: string[]; passes: number; why: string[] }>;
  throughput_before_per_day: number | null; throughput_after_per_day: number | null;
  excluded: Array<{ site: string; reason: string }>; isolated: Array<{ sites: string[]; reason: string }>;
  lines: LineImpact[]; coverage: Row; confidence: number | null; stale: boolean; stale_reasons: string[];
}
export interface DisruptionMap {
  networks: NetworkMap[]; affected: boolean; stale: boolean; stale_reasons: string[]; telemetry: Row | null;
  summary: string; method: string;
}
export const MAP_METHOD = 'supply-map@1 — every route whose via names a disrupted chokepoint, or whose origin site lies in a disrupted place, passes (1 − derating) of its flow; '
  + 'the throughput to the terminal is recomputed by the B29 network algorithm; INFERRED (unvalidated) sites are excluded, sites resolved to one graph entity isolated; '
  + 'through each live link the downstream line\'s run rate = min(Σ line capacity, supply); cover = the terminal\'s inventory of each inbound material ÷ (its bill-of-materials '
  + 'quantity × the shortfall), the least of them; the line-stop days = the disruption\'s duration − the cover (when stated); stale = a read twin\'s head stale by its policy';

const lineKey = /^line\.capacity_per_day:(.+)$/;
function excludedOf(n: Network, x: NetworkExtras): { exclude: Set<string>; excluded: NetworkMap['excluded']; isolated: NetworkMap['isolated'] } {
  const exclude = new Set<string>(); const excluded: NetworkMap['excluded'] = []; const isolated: NetworkMap['isolated'] = [];
  for (const [id, e] of [...x.sites].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (n.sites.has(id) && e.provenance.basis === 'inferred') { exclude.add(id); excluded.push({ site: id, reason: 'not mapped: an inferred site not yet validated by a named analyst' }); }
  }
  const byEntity = new Map<string, string[]>();
  for (const [id, e] of x.sites) if (e.entity_id !== null && n.sites.has(id)) byEntity.set(e.entity_id, [...(byEntity.get(e.entity_id) ?? []), id]);
  for (const [entity, ids] of [...byEntity].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (ids.length < 2) continue;
    ids.sort(); ids.forEach((id) => exclude.add(id));
    isolated.push({ sites: ids, reason: `identity conflict: sites ${ids.join(', ')} resolve to one graph entity (${entity}) — isolated until the network declares one of them` });
  }
  return { exclude, excluded, isolated };
}

/** The terminal's inbound materials the full network brings but the reduced one (sites excluded or isolated) no longer does. */
export function lostInputs(full: Network, reduced: Network): string[] {
  const inbound = (n: Network) => { const t = [...n.sites.values()].find((s) => s.tier === 0); return new Set(t === undefined ? [] : n.routes.filter((r) => r.to === t.id).map((r) => r.material)); };
  const after = inbound(reduced);
  return [...inbound(full)].filter((m) => !after.has(m)).sort();
}

/**
 * THE COVER: at the run rate the line ran at before, each inbound material of the terminal is demanded at rate × its bill-of-materials quantity;
 * what still ARRIVES under the disruption leaves a deficit; the terminal's inventory of that material bridges deficit ÷ on-hand days. The cover
 * is the least of them; a material in deficit without an inventory element makes the cover UNKNOWN (never assumed).
 */
export function coverOf(n: Network, x: NetworkExtras, arriving: ReadonlyMap<string, number>, rate: number): { cover_days: number | null; basis: Row[]; unknown: boolean } {
  const terminal = [...n.sites.values()].find((s) => s.tier === 0);
  if (terminal === undefined) return { cover_days: null, basis: [], unknown: true };
  const basis: Row[] = []; let least = Infinity; let unknown = false; let deficit = false;
  for (const m of [...new Set(n.routes.filter((r) => r.to === terminal.id).map((r) => r.material))].sort()) {
    const per = terminal.bom[m] ?? 1; const demand = rate * per; const arr = arriving.get(m) ?? 0; const def = Math.max(0, demand - arr);
    const row: Row = { material: m, demand_per_day: round(demand, 4), arriving_per_day: round(arr, 4), deficit_per_day: round(def, 4) };
    if (def <= 1e-9) { basis.push(row); continue; }
    deficit = true;
    const inv = x.inventory.get(`${terminal.id}.${m}`);
    if (inv === undefined) { unknown = true; basis.push({ ...row, on_hand: null, note: 'no inventory element: the cover of this input is unknown' }); continue; }
    const days = inv.value / def;
    basis.push({ ...row, on_hand: inv.value, unit: inv.unit, days: round(days, 2) });
    least = Math.min(least, days);
  }
  return { cover_days: !deficit || unknown || !Number.isFinite(least) ? null : round(least, 2), basis, unknown };
}

export function mapDisruption(spec: DisruptionSpec, networks: readonly NetworkInput[], telemetry: { twin_id: string; version: number | null; freshness: string | null } | null): DisruptionMap {
  const choke = new Set(spec.chokepoints);
  const places = spec.places.map((p) => ({ country: p.country ?? null, city: p.city === null || p.city === undefined ? null : norm(p.city) }));
  const passes = round(Math.max(0, Math.min(1, 1 - spec.derating)), 6);
  const maps: NetworkMap[] = [];
  const staleReasons: string[] = [];
  if (telemetry !== null && telemetry.freshness === 'stale') staleReasons.push(`the telemetry twin ${telemetry.twin_id} (v${String(telemetry.version)}) is stale by its freshness policy: telemetry is late`);
  if (telemetry !== null && telemetry.version === null) staleReasons.push(`the telemetry twin ${telemetry.twin_id} has no admitted head`);
  for (const net of networks) {
    const els = complete(net.elements);
    const { network: full } = readNetwork(els);
    const x = readExtras(els);
    const { exclude, excluded, isolated } = excludedOf(full, x);
    const n = withoutSites(full, exclude);
    const derate = new Map<string, number>(); const affected: NetworkMap['affected_routes'] = [];
    for (const r of n.routes) {
      const why: string[] = [];
      const via = x.routes.get(r.id)?.via ?? [];
      for (const v of via) if (choke.has(v)) why.push(`via ${v}`);
      const origin = x.sites.get(r.from);
      for (const p of places) {
        if (origin === undefined) continue;
        if (p.city !== null && origin.city !== null && norm(origin.city) === p.city) why.push(`origin in ${origin.city}`);
        else if (p.city === null && p.country !== null && origin.country === p.country) why.push(`origin in ${p.country}`);
      }
      if (why.length > 0) { derate.set(r.id, passes); affected.push({ route: r.id, from: r.from, to: r.to, material: r.material, via, passes, why }); }
    }
    const fb = deratedFlows(n); const fa = deratedFlows(n, derate);
    // an input of the terminal that reaches it only through excluded or isolated sites: the throughput cannot be judged (never shown as complete)
    const lost = lostInputs(full, n);
    const before = lost.length > 0 ? null : fb.throughput; const after = lost.length > 0 ? null : fa.throughput;
    const terminal = [...n.sites.values()].find((s) => s.tier === 0) ?? null;
    const inbound = terminal === null ? [] : [...new Set(n.routes.filter((r) => r.to === terminal.id).map((r) => r.material))].sort();
    const unit = terminal === null ? null : Object.keys(terminal.bom).length === 0 && inbound.length === 1 ? `${n.materials.get(inbound[0] as string)?.unit ?? 'units'}/day` : 'units/day';
    const netStale: string[] = [];
    if (net.freshness === 'stale') netStale.push(`the network ${net.title} (v${net.version}) is stale by its freshness policy`);
    const lines: LineImpact[] = [];
    for (const l of net.links) {
      const caps = complete(l.elements).filter((e) => lineKey.test(e.key) && finite(e.value)).map((e) => ({ line: (lineKey.exec(e.key) as RegExpExecArray)[1] as string, capacity_per_day: e.value as number }));
      const lineCap = caps.reduce((a, c) => a + c.capacity_per_day, 0);
      const supB = before === null || !Number.isFinite(before) ? null : round(before, 4);
      const supA = after === null || !Number.isFinite(after) ? null : round(after, 4);
      const rateB = supB === null ? null : round(Math.min(lineCap, supB), 4); const rateA = supA === null ? null : round(Math.min(lineCap, supA), 4);
      const shortfall = rateB === null || rateA === null ? null : round(Math.max(0, rateB - rateA), 4);
      const cv = shortfall === null || shortfall === 0 || rateB === null ? { cover_days: null, basis: [] as Row[], unknown: false } : coverOf(n, x, fa.arriving, rateB);
      const stopDays = shortfall === 0 ? 0 : spec.duration_days === null || shortfall === null || cv.cover_days === null ? null : round(Math.max(0, spec.duration_days - cv.cover_days), 2);
      const lStale = l.freshness === 'stale';
      if (lStale) netStale.push(`the linked twin ${l.title} (v${String(l.version)}) is stale by its freshness policy`);
      if (caps.length === 0) continue;
      lines.push({ twin_id: l.twin_id, title: l.title, version: l.version, owner: l.owner, lines: caps.sort((a, b) => (a.line < b.line ? -1 : 1)), line_capacity_per_day: round(lineCap, 4),
                   supply_before_per_day: supB, supply_after_per_day: supA, run_rate_before_per_day: rateB, run_rate_after_per_day: rateA, shortfall_per_day: shortfall, cover_days: cv.cover_days,
                   cover_basis: cv.basis, line_stop_days: stopDays, utilisation_before: rateB === null || lineCap === 0 ? null : round(rateB / lineCap, 4),
                   utilisation_after: rateA === null || lineCap === 0 ? null : round(rateA / lineCap, 4), stale: lStale });
    }
    const confs = affected.map((a) => x.routes.get(a.route)?.confidence).filter((c): c is number => finite(c));
    const u = uncertaintyOf(els);
    maps.push({
      twin_id: net.twin_id, title: net.title, version: net.version, owner: net.owner, terminal: terminal?.id ?? null, unit,
      affected_routes: affected, throughput_before_per_day: before === null || !Number.isFinite(before) ? null : round(before, 4),
      throughput_after_per_day: after === null || !Number.isFinite(after) ? null : round(after, 4), excluded, isolated, lines,
      coverage: { tiers: u.tiers.map((t) => ({ tier: t.tier, covered: t.covered, declared: t.declared, validated: t.validated, inferred: t.inferred })), unsourced: u.unsourced,
                  excluded: excluded.length, isolated: isolated.length, routes_with_unknown_via: u.routes.filter((r) => r.unknown.includes('via')).length,
                  incomplete: lost.map((m) => `the terminal's ${m} reaches it only through excluded or isolated sites: the throughput is not computed`),
                  note: u.routes.some((r) => r.unknown.includes('via')) ? 'a route without a declared via cannot be judged against a chokepoint: it is counted unaffected and listed here' : null },
      confidence: confs.length === 0 ? null : Math.min(...confs), stale: netStale.length > 0, stale_reasons: netStale,
    });
    staleReasons.push(...netStale);
  }
  const affectedAny = maps.some((m) => m.affected_routes.length > 0);
  const worst = maps.flatMap((m) => m.lines).sort((a, b) => (b.shortfall_per_day ?? 0) - (a.shortfall_per_day ?? 0))[0];
  const summary = !affectedAny ? 'no route of the domain\'s supply networks passes the disrupted chokepoints or places'
    : `${maps.reduce((a, m) => a + m.affected_routes.length, 0)} route(s) derated to ${round(passes * 100, 2)} %`
      + (worst === undefined ? '' : `; ${worst.lines.map((l) => l.line).join(', ')} runs at ${String(worst.run_rate_after_per_day)} of ${String(worst.run_rate_before_per_day)} per day`
        + (worst.cover_days === null ? ' (cover unknown)' : `, ${worst.cover_days} day(s) of cover`))
      + (staleReasons.length === 0 ? '' : ' — STALE inputs: not current');
  return { networks: maps, affected: affectedAny, stale: staleReasons.length > 0, stale_reasons: staleReasons, telemetry: telemetry === null ? null : { ...telemetry }, summary, method: MAP_METHOD };
}

// ─────────────────────────────── SC4/SC5: an alternative's feasibility ───────────────────────────────
export const ALTERNATIVE_KINDS = ['sourcing', 'inventory', 'routing'] as const;
export type AlternativeKind = typeof ALTERNATIVE_KINDS[number];
export type Verdict = 'feasible' | 'infeasible' | 'indeterminate';
export interface AlternativeInput {
  kind: AlternativeKind; spec: DisruptionSpec; network: NetworkMap; line: LineImpact | null;
  head: FamilyElement[]; branch: FamilyElement[];
  constraint: { outcome: string; reason: string | null } | null;
  cost: { amount: number | null; currency: string | null; basis: string } | null;
  /** the share of the pre-disruption run rate an option must restore (default 0.95) */
  restoreShare?: number;
}
export interface AlternativeEvaluation {
  verdict: Verdict; recommendable: boolean; reasons: string[]; coverage_limits: string[];
  throughput_on_branch_per_day: number | null; run_rate_with_option_per_day: number | null; run_rate_before_per_day: number | null; restored_share: number | null;
  effect_after_days: number | null; cover_days: number | null; cover_with_option_days: number | null; duration_days: number | null;
  changed_routes: Row[]; added_sites: string[]; relies_on_unvalidated: string[];
  constraint: Row | null; cost: Row | null; method: string;
}
export const FEASIBILITY_METHOD = 'feasibility@1 — on the option\'s branch, under the SAME disruption (the same chokepoints, places and derating): the run rate restored ≥ the '
  + 'restore share of the pre-disruption run rate (or, for an inventory option, the cover reaching the disruption\'s duration); the time to effect (the added lead days of the '
  + 'routes it adds or changes) within the cover; the constraint engine satisfied when sets are named; INDETERMINATE when an input is stale, the cover or a lead time is unknown, '
  + 'or the option rests on an unvalidated site; only a feasible option is recommendable';

export function evaluateAlternative(a: AlternativeInput): AlternativeEvaluation {
  const restoreShare = a.restoreShare ?? 0.95;
  const reasons: string[] = []; const limits: string[] = []; let indeterminate = false; let infeasible = false;
  const headN = readNetwork(complete(a.head)).network; const headX = readExtras(complete(a.head));
  const brEls = complete(a.branch);
  const brN = readNetwork(brEls).network; const brX = readExtras(brEls);
  const { exclude } = excludedOf(brN, brX);
  const n = withoutSites(brN, exclude);
  // what the option changes: routes added or re-routed, sites added
  const changed: Row[] = []; let effect: number | null = 0;
  for (const r of brN.routes) {
    const old = headN.routes.find((h) => h.id === r.id);
    const nx = brX.routes.get(r.id); const ox = headX.routes.get(r.id);
    if (old === undefined) {
      changed.push({ route: r.id, change: 'added', from: r.from, to: r.to, material: r.material, lead_days: nx?.lead_days ?? null, via: nx?.via ?? [] });
      if (nx?.lead_days === null || nx?.lead_days === undefined) effect = null; else if (effect !== null) effect = Math.max(effect, nx.lead_days);
    } else if (JSON.stringify(nx?.via ?? []) !== JSON.stringify(ox?.via ?? []) || (nx?.lead_days ?? null) !== (ox?.lead_days ?? null) || old.from !== r.from || old.to !== r.to) {
      const added = nx?.lead_days === null || nx?.lead_days === undefined ? null : Math.max(0, nx.lead_days - (ox?.lead_days ?? 0));
      changed.push({ route: r.id, change: 'rerouted', via_before: ox?.via ?? [], via: nx?.via ?? [], lead_days_before: ox?.lead_days ?? null, lead_days: nx?.lead_days ?? null, added_lead_days: added });
      if (added === null) effect = null; else if (effect !== null) effect = Math.max(effect, added);
    }
  }
  const addedSites = [...brN.sites.keys()].filter((s) => !headN.sites.has(s)).sort();
  const unvalidated = [...brX.sites].filter(([id, e]) => e.provenance.basis === 'inferred' && brN.sites.has(id)).map(([id]) => id).sort();
  const reliesOn = unvalidated.filter((id) => addedSites.includes(id) || changed.some((c) => c['from'] === id));
  // the same disruption on the branch
  const choke = new Set(a.spec.chokepoints); const passes = Math.max(0, Math.min(1, 1 - a.spec.derating));
  const derate = new Map<string, number>();
  for (const r of n.routes) {
    const via = brX.routes.get(r.id)?.via ?? []; const origin = brX.sites.get(r.from);
    const hit = via.some((v) => choke.has(v)) || a.spec.places.some((p) => origin !== undefined && ((p.city ?? null) !== null && origin.city !== null ? norm(origin.city) === norm(p.city as string) : (p.country ?? null) !== null && origin.country === p.country));
    if (hit) derate.set(r.id, passes);
  }
  const fo = deratedFlows(n, derate);
  const t = lostInputs(brN, n).length > 0 ? null : fo.throughput;
  const onBranch = t === null || !Number.isFinite(t) ? null : round(t, 4);
  const line = a.line;
  const before = line?.run_rate_before_per_day ?? a.network.throughput_before_per_day;
  const withOpt = onBranch === null ? null : line === null ? onBranch : round(Math.min(line.line_capacity_per_day, onBranch), 4);
  const restored = before === null || before === 0 || withOpt === null ? null : round(withOpt / before, 4);
  const cover = line?.cover_days ?? null; const duration = a.spec.duration_days;
  // the cover the BRANCH gives (its inventory, against what still arrives with the option, at the pre-disruption run rate)
  const shortfallWith = before === null || withOpt === null ? null : Math.max(0, before - withOpt);
  const cvWith = before === null || shortfallWith === null || shortfallWith <= 1e-9 ? null : coverOf(n, brX, fo.arriving, before);
  const coverWith: number | null = cvWith === null ? null : cvWith.cover_days;
  if (a.network.stale || (line?.stale ?? false)) { indeterminate = true; reasons.push(`inputs are stale: ${a.network.stale_reasons.join('; ') || 'the linked line is stale'} — the option cannot be judged current`); }
  if (reliesOn.length > 0) { indeterminate = true; reasons.push(`the option rests on unvalidated inferred site(s) ${reliesOn.join(', ')}: a coverage gap, never recommended until validated`); }
  if (unvalidated.length > 0) limits.push(`unvalidated inferred site(s) excluded from the evaluation: ${unvalidated.join(', ')}`);
  for (const tcov of a.network.coverage['tiers'] as Array<{ tier: number; covered: boolean }> ?? []) if (!tcov.covered) limits.push(`tier ${tcov.tier} is not covered by the network: the option is judged without it`);
  for (const uns of (a.network.coverage['unsourced'] as Array<{ site: string; material: string }> | undefined) ?? []) limits.push(`${uns.site}'s ${uns.material} is unsourced in the network (a hidden tier may stand behind it)`);
  if (a.network.excluded.length > 0) limits.push(`${a.network.excluded.length} inferred site(s) not mapped`);
  if (a.network.isolated.length > 0) limits.push(`${a.network.isolated.length} identity conflict(s) isolated`);
  if (a.kind === 'inventory') {
    if (duration === null) { indeterminate = true; reasons.push('the disruption states no duration: whether the stock bridges it cannot be judged'); }
    else if (cvWith === null && withOpt !== null && before !== null && withOpt >= before * restoreShare) reasons.push('with the option the line runs at its pre-disruption rate');
    else if (coverWith === null) { indeterminate = true; reasons.push('the cover with the option is unknown (an inbound material without an inventory element)'); }
    else if (coverWith < duration) { infeasible = true; reasons.push(`the stock covers ${coverWith} day(s) of a ${duration}-day disruption: the line stops before it ends`); }
    else reasons.push(`the stock covers ${coverWith} day(s), the disruption's ${duration} day(s) included`);
  } else {
    if (restored === null) { indeterminate = true; reasons.push('the run rate with the option cannot be computed (nothing reaches the terminal on the branch)'); }
    else if (restored < restoreShare) { infeasible = true; reasons.push(`the option restores ${round(restored * 100, 2)} % of the pre-disruption run rate (${String(withOpt)} of ${String(before)} per day), below the ${round(restoreShare * 100, 2)} % required`); }
    else reasons.push(`the option restores ${round(restored * 100, 2)} % of the pre-disruption run rate (${String(withOpt)} of ${String(before)} per day)`);
    if (effect === null) { indeterminate = true; reasons.push('a route the option adds or changes states no lead days: the time to effect is unknown'); }
    else if (line !== null && line.shortfall_per_day !== null && line.shortfall_per_day > 0) {
      if (cover === null) { indeterminate = true; reasons.push(`the time to effect is ${effect} day(s) but the cover is unknown`); }
      else if (effect > cover) { infeasible = true; reasons.push(`the option takes effect after ${effect} day(s), beyond the ${cover} day(s) of cover: the line stops first`); }
      else reasons.push(`the option takes effect after ${effect} day(s), within the ${cover} day(s) of cover`);
    }
  }
  if (a.constraint !== null) {
    if (a.constraint.outcome === 'violated') { infeasible = true; reasons.push(`a business rule is violated: ${a.constraint.reason ?? 'see the constraint verdict'}`); }
    else if (a.constraint.outcome === 'indeterminate') { indeterminate = true; reasons.push(`the constraint engine could not decide: ${a.constraint.reason ?? 'indeterminate'}`); }
    else reasons.push('the named business rules are satisfied');
  }
  const verdict: Verdict = indeterminate ? 'indeterminate' : infeasible ? 'infeasible' : 'feasible';
  return {
    verdict, recommendable: verdict === 'feasible', reasons, coverage_limits: [...new Set(limits)],
    throughput_on_branch_per_day: onBranch, run_rate_with_option_per_day: withOpt, run_rate_before_per_day: before, restored_share: restored,
    effect_after_days: effect, cover_days: cover, cover_with_option_days: coverWith, duration_days: duration, changed_routes: changed, added_sites: addedSites,
    relies_on_unvalidated: reliesOn, constraint: a.constraint === null ? null : { ...a.constraint }, cost: a.cost === null ? null : { ...a.cost }, method: FEASIBILITY_METHOD,
  };
}

/** The quantities and edges a constraint set is checked on (a run_input subject — the B29 engine's shape; never recorded as a plan check). */
export function alternativeSubject(ref: string, ev: AlternativeEvaluation, branch: readonly FamilyElement[], asOf: string | null) {
  const quantities: Array<{ key: string; date: string | null; value: number; unit: string | null }> = [];
  const q = (key: string, v: number | null, unit: string | null) => { if (v !== null && Number.isFinite(v)) quantities.push({ key, date: asOf, value: v, unit }); };
  q('alternative.run_rate_per_day', ev.run_rate_with_option_per_day, 'units/day'); q('alternative.restored_share', ev.restored_share, 'ratio');
  q('alternative.effect_after_days', ev.effect_after_days, 'days'); q('alternative.cover_days', ev.cover_days, 'days'); q('alternative.cover_with_option_days', ev.cover_with_option_days, 'days');
  if (ev.cost !== null && finite(ev.cost['amount'])) q('alternative.cost', ev.cost['amount'] as number, typeof ev.cost['currency'] === 'string' ? ev.cost['currency'] as string : null);
  const edges: Array<{ from: string; to: string; kind: string }> = [];
  for (const e of complete(branch)) {
    if (finite(e.value)) quantities.push({ key: e.key, date: asOf, value: e.value, unit: e.unit });
    else if (isObj(e.value) && typeof e.value['from'] === 'string' && typeof e.value['to'] === 'string') edges.push({ from: String(e.value['from']), to: String(e.value['to']), kind: 'route' });
  }
  return { kind: 'run_input' as const, ref: ref.slice(0, 200), quantities, ...(edges.length === 0 ? {} : { edges }) };
}
