/**
 * B33 §CI — the PURE logic of competitor intelligence (unit-tested in test/unit/phase6-competitor-b33.test.ts): the competitor package's
 * manifest content (§CI owns it; §PK's ports declare, certify and activate it), and the Domain Intelligence Agent's DETERMINISTIC reading of
 * extracted claims into proposals — events, profile changes and one interpretation per evidence item. Nothing here is a probability derived
 * from narrative: an interpretation's confidence is the LOWEST extraction confidence of the claims it rests on, stated as such.
 */
type Row = Record<string, unknown>;

/** The package functions the PACKAGE_GATE is asked about (domain.package_function_state(..., fn)). */
export const COMPETITOR_FUNCTIONS = ['profile', 'collect', 'assess', 'compare', 'alert', 'twin'] as const;
export type CompetitorFunction = typeof COMPETITOR_FUNCTIONS[number];

export const EVENT_KINDS = ['plant_opened', 'plant_closed', 'capacity_change', 'product_launched', 'market_entry', 'market_exit', 'acquisition', 'partnership', 'pricing_move', 'other'] as const;
export const FACT_KINDS = ['product', 'market', 'capability', 'objective', 'facility', 'movement', 'dependency', 'strategy'] as const;
export const PROPOSAL_STATES = ['proposed', 'approved', 'declined', 'withdrawn', 'superseded'] as const;

/** How a claim's predicate is read: the event it records and the fact it sets. Declared in the package manifest (competitor.predicate_map). */
export interface PredicateRule { event: typeof EVENT_KINDS[number] | null; fact: typeof FACT_KINDS[number] | null; label: string }
export const DEFAULT_PREDICATE_MAP: Record<string, PredicateRule> = {
  opens_plant: { event: 'plant_opened', fact: 'facility', label: 'opened a plant in' },
  closes_plant: { event: 'plant_closed', fact: 'facility', label: 'closed its plant in' },
  expands_capacity: { event: 'capacity_change', fact: 'capability', label: 'changed its capacity at' },
  launches_product: { event: 'product_launched', fact: 'product', label: 'launched' },
  enters_market: { event: 'market_entry', fact: 'market', label: 'entered the market' },
  exits_market: { event: 'market_exit', fact: 'market', label: 'left the market' },
  acquires: { event: 'acquisition', fact: 'movement', label: 'acquired' },
  partners_with: { event: 'partnership', fact: 'dependency', label: 'partnered with' },
  reports_capacity: { event: null, fact: 'capability', label: 'reports a capacity of' },
};

/**
 * THE COMPETITOR PACKAGE'S MANIFEST (§PK's manifest form; §CI owns its content). It REFERENCES the core — the graph's organization and place
 * types, the twin families competitor and market (0092) — and never forks them. Every source named is SYNTHETIC or a public feed used for
 * discovery only (GDELT cannot contain a fictional competitor); a real competitor-intelligence acceptance needs licensed registries, filings
 * and newswires (external). Signing/publisher (B77), all-layer namespaces (B78), marketplace (B112) are not built here.
 */
export function competitorManifest(semver = '1.0.0', sources: string[] = []): Row {
  return {
    ontology_extension: {
      namespace: 'pkg:competitor',
      entity_types: [{ type: 'competitor', maps_to: 'organization' }, { type: 'plant_site', maps_to: 'place' }, { type: 'gear_motor_line', maps_to: 'product' }],
      predicates: Object.keys(DEFAULT_PREDICATE_MAP).map((p) => ({ predicate: p, domain: 'organization' })),
    },
    source_set: sources.map((s) => ({ source_key: s, purposes: ['intelligence'], required: false })),
    indicators: [],
    models: [],
    assessment_templates: [{ key: 'competitor-movement', statement: '<competitor> <movement> <place> effective <date>', material: true }],
    watchlist_templates: [{ key: 'new-capacity-in-our-markets', event_kinds: ['plant_opened', 'capacity_change'], fact_kinds: ['facility', 'capability'] }],
    controls: { classification_ceiling: 'internal', purposes: ['intelligence'], retention: '24 months' },
    risk_meaning: { maps_to: 'prediction.risk_taxonomy', categories: ['competitive'] },
    release: { semver, core_compatibility: '>=0111', requires: [], conflicts: [] },
    competitor: {
      functions: [...COMPETITOR_FUNCTIONS],
      predicate_map: DEFAULT_PREDICATE_MAP,
      material: { event_kinds: ['plant_opened', 'plant_closed', 'capacity_change', 'market_entry', 'market_exit', 'acquisition'], fact_kinds: ['facility', 'capability', 'market'], min_confidence: 0.8 },
      diversity: { min_publishers: 2 },
      coverage: { default_freshness_days: 30 },
      twin: { key: 'capacity.per_month', unit: 'units/month', capacity_detail: 'capacity_per_month', families: { competitor: 'competitor', market: 'market' }, link: { from: 'market', to: 'competitor' } },
      boundary: 'B33 in-tenant certified package; signing/publisher B77, all-layer namespaces B78, marketplace B112, parity B111, signed acceptance R2',
    },
  };
}

/** A key-safe name: `Tangier, Morocco` → `tangier-morocco`. */
export function slug(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'unnamed';
}

export interface BacklogClaim {
  claim_id: string; claim_version: number; claim_type: string; claim_digest: string; payload: Row; recorded_at: string;
  evidence_id: string; evidence_version: number | null; evidence_digest: string | null; places: Array<{ entity_id: string; name: string }>;
}
export interface ProposalDraft {
  evidenceId: string; content: Row; claims: string[]; recordedThrough: string; unmapped: Array<{ claim_id: string; predicate: string }>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

/**
 * THE AGENT'S READING (deterministic): the claims of ONE evidence item about ONE competitor → one proposal (events, changes, interpretation),
 * or null when nothing maps or nothing would change. A fact whose value the head already holds is not proposed again.
 */
export function draftFromEvidence(competitor: { name: string }, headFacts: Row[], claims: BacklogClaim[], predicateMap: Record<string, PredicateRule>, todayDay: string): ProposalDraft | null {
  if (claims.length === 0) return null;
  const evidenceId = claims[0]!.evidence_id;
  const evCite = claims[0]!.evidence_version !== null && claims[0]!.evidence_digest !== null
    ? [{ kind: 'evidence', id: evidenceId, version: claims[0]!.evidence_version, digest: claims[0]!.evidence_digest }] : [];
  const events: Row[] = []; const changes: Row[] = []; const unmapped: Array<{ claim_id: string; predicate: string }> = []; const used: BacklogClaim[] = [];
  const statements: string[] = [];
  const held = new Map(headFacts.map((f) => [String(f['key']), f]));
  const seenKeys = new Set<string>();
  for (const c of [...claims].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.claim_id.localeCompare(b.claim_id))) {
    const predicate = String(c.payload['predicate'] ?? '');
    const rule = predicateMap[predicate];
    if (rule === undefined) { unmapped.push({ claim_id: c.claim_id, predicate }); continue; }
    const q = (c.payload['qualifiers'] ?? {}) as Row;
    const object = String(c.payload['object_value'] ?? '').trim();
    const confidence = num(c.payload['confidence']) ?? 0;
    const cite = [{ kind: 'claim', id: c.claim_id, version: c.claim_version, digest: c.claim_digest }, ...evCite];
    const place = c.places[0] ?? null;
    const effective = typeof q['effective_date'] === 'string' && DAY.test(q['effective_date']) ? q['effective_date'] : todayDay;
    const capacity = num(q['capacity_per_month']);
    if (rule.event !== null) {
      events.push({ kind: rule.event, effective_date: effective, place_entity_id: place?.entity_id ?? null, place: place?.name ?? (object || null),
                    market: typeof q['market'] === 'string' ? q['market'] : null,
                    details: { claim: c.claim_id, predicate, object_value: object, ...(capacity === null ? {} : { capacity_per_month: capacity }),
                               ...(typeof q['product'] === 'string' ? { product: q['product'] } : {}) },
                    citations: cite });
    }
    if (rule.fact !== null) {
      const name = rule.fact === 'capability' ? 'capacity' : slug(place?.name ?? object);
      const key = `${rule.fact}:${name}`;
      let value: Row;
      if (rule.fact === 'capability') value = { amount: capacity ?? num(object), unit: typeof q['unit'] === 'string' ? q['unit'] : 'units/month', period: typeof q['period'] === 'string' ? q['period'] : 'month',
                                                population: typeof q['population'] === 'string' ? q['population'] : 'all products' };
      else if (rule.fact === 'facility') value = { place: place?.name ?? object, status: rule.event === 'plant_closed' ? 'closed' : 'operating', since: effective,
                                                   ...(capacity === null ? {} : { capacity_per_month: capacity }), ...(typeof q['product'] === 'string' ? { product: q['product'] } : {}) };
      else value = { name: object, since: effective, ...(typeof q['market'] === 'string' ? { market: q['market'] } : {}) };
      if (!seenKeys.has(key)) {
        const prior = held.get(key);
        if (prior === undefined || JSON.stringify(prior['value']) !== JSON.stringify(value)) {
          changes.push({ op: prior === undefined ? 'add' : 'replace', fact: { key, kind: rule.fact, value, citations: cite, confidence } });
          seenKeys.add(key);
        }
      }
    }
    statements.push(`${competitor.name} ${rule.label} ${place?.name ?? object}${rule.event === null ? '' : ` effective ${effective}`}${capacity === null ? '' : ` (capacity ${capacity} units/month)`}`);
    used.push(c);
  }
  if (events.length === 0 && changes.length === 0) return null;
  const effectiveFrom = events.map((e) => String(e['effective_date'])).sort()[0] ?? todayDay;
  const confidence = Math.min(...used.map((c) => num(c.payload['confidence']) ?? 0));
  const interpretation = {
    statement: `${statements.join('; ')} — read from ${used.length} extracted claim(s) of one evidence item; the agent proposes, a named analyst approves`,
    confidence: Math.round(confidence * 1000) / 1000,
    confidence_basis: 'the lowest extraction confidence of the claims cited (never derived from narrative)',
    citations: [...used.map((c) => ({ kind: 'claim', id: c.claim_id, version: c.claim_version, digest: c.claim_digest })), ...evCite],
  };
  return { evidenceId, content: { effective_from: effectiveFrom, events, changes, interpretation }, claims: used.map((c) => c.claim_id),
           recordedThrough: claims.map((c) => c.recorded_at).sort().at(-1)!, unmapped };
}

/** Group the backlog by competitor and evidence, oldest first (the scan's order). */
export function groupBacklog(rows: Row[]): Array<{ competitorId: string; name: string; packageKey: string; groups: BacklogClaim[][]; recordedThrough: string }> {
  const byCompetitor = new Map<string, { competitorId: string; name: string; packageKey: string; byEvidence: Map<string, BacklogClaim[]>; recordedThrough: string }>();
  for (const r of rows) {
    const id = String(r['competitor_id']);
    let c = byCompetitor.get(id);
    if (c === undefined) { c = { competitorId: id, name: String(r['name']), packageKey: String(r['package_key']), byEvidence: new Map(), recordedThrough: '' }; byCompetitor.set(id, c); }
    const claim: BacklogClaim = {
      claim_id: String(r['claim_id']), claim_version: Number(r['claim_version']), claim_type: String(r['claim_type']), claim_digest: String(r['claim_digest']),
      payload: (r['payload'] ?? {}) as Row, recorded_at: String(r['recorded_at']), evidence_id: String(r['evidence_id']),
      evidence_version: r['evidence_version'] === null || r['evidence_version'] === undefined ? null : Number(r['evidence_version']),
      evidence_digest: r['evidence_digest'] === null || r['evidence_digest'] === undefined ? null : String(r['evidence_digest']),
      places: Array.isArray(r['places']) ? (r['places'] as Array<{ entity_id: string; name: string }>) : [],
    };
    const list = c.byEvidence.get(claim.evidence_id) ?? [];
    list.push(claim);
    c.byEvidence.set(claim.evidence_id, list);
    if (claim.recorded_at > c.recordedThrough) c.recordedThrough = claim.recorded_at;
  }
  return [...byCompetitor.values()].map((c) => ({
    competitorId: c.competitorId, name: c.name, packageKey: c.packageKey, recordedThrough: c.recordedThrough,
    groups: [...c.byEvidence.values()].sort((a, b) => (a.map((x) => x.recorded_at).sort()[0] ?? '').localeCompare(b.map((x) => x.recorded_at).sort()[0] ?? '')),
  }));
}

/** The watermark a competitor's scan may advance to: everything read when nothing waits, else just before the first group left waiting. */
export function watermarkOf(processed: BacklogClaim[][], waiting: BacklogClaim[][]): string | null {
  const all = processed.flat().map((c) => c.recorded_at).sort();
  if (waiting.length === 0) return all.at(-1) ?? null;
  const firstWaiting = waiting.flat().map((c) => c.recorded_at).sort()[0]!;
  const before = all.filter((t) => t < firstWaiting);
  return before.at(-1) ?? null;
}

/** A DATE as the day it names (the driver reads a DATE as the local midnight: its local components are the day). */
export function dayOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
