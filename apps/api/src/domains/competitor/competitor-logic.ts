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
export function competitorManifest(semver = '1.0.0', sources: string[] = [], opts: { purposes?: string[]; riskCategory?: string } = {}): Row {
  /* B33 act-found (the eye_demo staging): the manifest is declared, certified and activated through §PK's ports (domain.dpk_assert_manifest,
     the conformance suite), so it takes §PK's FORM — the ontology extension's `mappings` (it was `entity_types`, refused "ontology_extension.mappings
     lists the package's types…"), the material event kinds, a watchlist template with rules, `risk_meaning` as a list of {category_key, meaning}
     on the taxonomy in force (it was an object, refused "risk_meaning is a list"), and the purposes each source is used for (a contract that does not
     permit them fails the suite's purpose check). The `competitor` block §CI reads (domain.dci_manifest) is unchanged. */
  const purposes = opts.purposes ?? ['intelligence'];
  return {
    ontology_extension: {
      namespace: 'pkg:competitor',
      mappings: [{ type: 'competitor', maps_to: 'organization' }, { type: 'plant_site', maps_to: 'place' }, { type: 'gear_motor_line', maps_to: 'product' }],
      predicates: Object.keys(DEFAULT_PREDICATE_MAP).map((p) => ({ predicate: p, domain: 'organization' })),
      event_kinds: ['plant_opened', 'plant_closed', 'capacity_change', 'market_entry', 'market_exit', 'acquisition'],
    },
    source_set: sources.map((s) => ({ source_key: s, purposes, required: false })),
    indicators: [],
    models: [],
    assessment_templates: [{ key: 'competitor-movement', statement: '<competitor> <movement> <place> effective <date>', material: true }],
    watchlist_templates: [{ key: 'new-capacity-in-our-markets', title: 'New capacity in our markets', event_kinds: ['plant_opened', 'capacity_change'], fact_kinds: ['facility', 'capability'],
                            rules: [{ rule_key: 'new-capacity', on: 'event', kinds: ['plant_opened', 'capacity_change'] }] }],
    controls: { classification_ceiling: 'internal', purposes, retention: '24 months',
                inputs: { real_public: [], synthetic: [...sources],
                          licensed_for_acceptance: ['company registries and filings (e.g. Orbis, OpenCorporates — licensed)', 'licensed newswires and trade press'] } },
    risk_meaning: [{ category_key: opts.riskCategory ?? 'market', meaning: 'a competitor\'s new capacity or market move is a market risk (or an opportunity) for NORDWERK\'s gear-motor line' }],
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
  content: Row; claims: string[]; evidence: string[]; recordedThrough: string; unmapped: Array<{ claim_id: string; predicate: string }>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
const evidenceCite = (c: BacklogClaim): Row[] => (c.evidence_version !== null && c.evidence_digest !== null ? [{ kind: 'evidence', id: c.evidence_id, version: c.evidence_version, digest: c.evidence_digest }] : []);
const claimCite = (c: BacklogClaim): Row => ({ kind: 'claim', id: c.claim_id, version: c.claim_version, digest: c.claim_digest });
/** citations merged without repeats (kind + id + version) */
const mergeCites = (a: Row[], b: Row[]): Row[] => {
  const seen = new Set(a.map((x) => `${String(x['kind'])}:${String(x['id'])}@${String(x['version'])}`));
  return [...a, ...b.filter((x) => { const k = `${String(x['kind'])}:${String(x['id'])}@${String(x['version'])}`; if (seen.has(k)) return false; seen.add(k); return true; })];
};

/**
 * THE AGENT'S READING (deterministic): the claims read for ONE competitor in one run → ONE proposal (events, changes, interpretation), or
 * null when nothing maps or nothing would change. The same movement reported by several evidence items (the release and the trade press)
 * is ONE event and ONE fact citing all of them — so the source diversity is measured over what corroborates it. A fact whose value the head
 * already holds is not proposed again. The interpretation's confidence is the LOWEST extraction confidence cited (never from narrative).
 */
export function draftFromClaims(competitor: { name: string }, headFacts: Row[], claims: BacklogClaim[], predicateMap: Record<string, PredicateRule>, todayDay: string): ProposalDraft | null {
  if (claims.length === 0) return null;
  const events = new Map<string, Row>(); const facts = new Map<string, Row>(); const unmapped: Array<{ claim_id: string; predicate: string }> = [];
  const used: BacklogClaim[] = []; const statements = new Map<string, string>();
  const held = new Map(headFacts.map((f) => [String(f['key']), f]));
  for (const c of [...claims].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.claim_id.localeCompare(b.claim_id))) {
    const predicate = String(c.payload['predicate'] ?? '');
    const rule = predicateMap[predicate];
    if (rule === undefined) { unmapped.push({ claim_id: c.claim_id, predicate }); continue; }
    const q = (c.payload['qualifiers'] ?? {}) as Row;
    const object = String(c.payload['object_value'] ?? '').trim();
    const confidence = num(c.payload['confidence']) ?? 0;
    const cite = [claimCite(c), ...evidenceCite(c)];
    const place = c.places[0] ?? null;
    const where = place?.name ?? object;
    const effective = typeof q['effective_date'] === 'string' && DAY.test(q['effective_date']) ? q['effective_date'] : todayDay;
    const capacity = num(q['capacity_per_month']);
    if (rule.event !== null) {
      const k = `${rule.event}|${slug(where)}|${effective}`;
      const prior = events.get(k);
      if (prior === undefined) {
        events.set(k, { kind: rule.event, effective_date: effective, place_entity_id: place?.entity_id ?? null, place: where || null,
                        market: typeof q['market'] === 'string' ? q['market'] : null,
                        details: { predicate, object_value: object, ...(capacity === null ? {} : { capacity_per_month: capacity }), ...(typeof q['product'] === 'string' ? { product: q['product'] } : {}) },
                        citations: cite });
      } else prior['citations'] = mergeCites(prior['citations'] as Row[], cite);
    }
    if (rule.fact !== null) {
      const name = rule.fact === 'capability' ? 'capacity' : slug(where);
      const key = `${rule.fact}:${name}`;
      let value: Row;
      if (rule.fact === 'capability') value = { amount: capacity ?? num(object), unit: typeof q['unit'] === 'string' ? q['unit'] : 'units/month', period: typeof q['period'] === 'string' ? q['period'] : 'month',
                                                population: typeof q['population'] === 'string' ? q['population'] : 'all products' };
      else if (rule.fact === 'facility') value = { place: where, status: rule.event === 'plant_closed' ? 'closed' : 'operating', since: effective,
                                                   ...(capacity === null ? {} : { capacity_per_month: capacity }), ...(typeof q['product'] === 'string' ? { product: q['product'] } : {}) };
      else value = { name: object, since: effective, ...(typeof q['market'] === 'string' ? { market: q['market'] } : {}) };
      const prior = facts.get(key);
      if (prior !== undefined) {
        const f = prior['fact'] as Row;
        f['citations'] = mergeCites(f['citations'] as Row[], cite);
        f['confidence'] = Math.min(Number(f['confidence']), confidence);
      } else {
        const h = held.get(key);
        if (h === undefined || JSON.stringify(h['value']) !== JSON.stringify(value)) facts.set(key, { op: h === undefined ? 'add' : 'replace', fact: { key, kind: rule.fact, value, citations: cite, confidence } });
      }
    }
    statements.set(`${rule.label}|${slug(where)}`, `${competitor.name} ${rule.label} ${where}${rule.event === null ? '' : ` effective ${effective}`}${capacity === null ? '' : ` (capacity ${capacity} units/month)`}`);
    used.push(c);
  }
  if (events.size === 0 && facts.size === 0) return null;
  const evs = [...events.values()];
  const effectiveFrom = evs.map((e) => String(e['effective_date'])).sort()[0] ?? todayDay;
  const confidence = Math.min(...used.map((c) => num(c.payload['confidence']) ?? 0));
  const evidence = [...new Set(used.map((c) => c.evidence_id))];
  const interpretation = {
    statement: `${[...statements.values()].join('; ')} — read from ${used.length} extracted claim(s) of ${evidence.length} evidence item(s); the agent proposes, a named analyst approves`,
    confidence: Math.round(confidence * 1000) / 1000,
    confidence_basis: 'the lowest extraction confidence of the claims cited (never derived from narrative)',
    citations: used.reduce<Row[]>((acc, c) => mergeCites(acc, [claimCite(c), ...evidenceCite(c)]), []),
  };
  return { content: { effective_from: effectiveFrom, events: evs, changes: [...facts.values()], interpretation }, claims: used.map((c) => c.claim_id), evidence,
           recordedThrough: claims.map((c) => c.recorded_at).sort().at(-1)!, unmapped };
}

/** The backlog by competitor, oldest first (the scan's order). */
export function groupBacklog(rows: Row[]): Array<{ competitorId: string; name: string; packageKey: string; claims: BacklogClaim[]; recordedThrough: string }> {
  const byCompetitor = new Map<string, { competitorId: string; name: string; packageKey: string; claims: BacklogClaim[]; recordedThrough: string }>();
  for (const r of rows) {
    const id = String(r['competitor_id']);
    let c = byCompetitor.get(id);
    if (c === undefined) { c = { competitorId: id, name: String(r['name']), packageKey: String(r['package_key']), claims: [], recordedThrough: '' }; byCompetitor.set(id, c); }
    const claim: BacklogClaim = {
      claim_id: String(r['claim_id']), claim_version: Number(r['claim_version']), claim_type: String(r['claim_type']), claim_digest: String(r['claim_digest']),
      payload: (r['payload'] ?? {}) as Row, recorded_at: String(r['recorded_at']), evidence_id: String(r['evidence_id']),
      evidence_version: r['evidence_version'] === null || r['evidence_version'] === undefined ? null : Number(r['evidence_version']),
      evidence_digest: r['evidence_digest'] === null || r['evidence_digest'] === undefined ? null : String(r['evidence_digest']),
      places: Array.isArray(r['places']) ? (r['places'] as Array<{ entity_id: string; name: string }>) : [],
    };
    c.claims.push(claim);
    if (claim.recorded_at > c.recordedThrough) c.recordedThrough = claim.recorded_at;
  }
  return [...byCompetitor.values()].sort((a, b) => (a.claims.map((x) => x.recorded_at).sort()[0] ?? '').localeCompare(b.claims.map((x) => x.recorded_at).sort()[0] ?? ''));
}

/** A DATE as the day it names (the driver reads a DATE as the local midnight: its local components are the day). */
export function dayOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
