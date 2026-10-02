/**
 * CP-6 B29 §B (0092) — THE MULTI-TIER SUPPLY NETWORK (F-P5-01 clause 3): the family's semantics, its VALIDATOR and its MEASURES. Pure: no
 * clock, no I/O; registered beside the eight families of §A (twin/families/families.ts), so the kind row's element schema is checked at
 * grounding and this family's own rules at admission, exactly as §A's are.
 *
 * THE ELEMENTS (the kind `supply-network`, 0092 §B.1 — five key prefixes, every structured one unit-less):
 *   tier:<n>                    a declared tier, n = 1..N contiguous; value: its label (text)
 *   site:<id>                   value { tier, name, bom? }: tier 0 is the TERMINAL site (exactly one — the plant the network serves),
 *                               1..N a supplier tier; bom = { <material>: quantity consumed per unit the site ships }
 *   material:<id>               value { name, unit }: the unit it is counted in (pcs, t, kg, …)
 *   route:<id>                  value { from, to, material }: the material shipped from one declared site to another
 *   capacity:<site>.<material>  a site's capacity for a material per day, in <the material's unit>/day (a number ≥ 0)
 *
 * THE VALIDATOR (beside the schema check): tiers 1..N; one terminal site; every site's tier declared; every route's endpoints declared
 * sites, its material declared, no route from a site to itself and no cycle; every capacity's site and material declared and its unit the
 * material's unit per day; every route's origin carrying a capacity for what it ships; every material a site receives in its bill of
 * materials (a site that ships what it receives passes it through at 1:1) — so the units along the network are consistent by construction.
 *
 * THE MEASURES:
 *   tier coverage       the declared tiers holding at least one site and at least one route out of it (a gap is a tier with neither);
 *   the CAPACITY BOTTLENECK — the network's throughput to the terminal site per day (each site ships min(its capacity, what its inputs
 *                       allow through its bill of materials); a supplier's output is shared evenly across its routes of a material; the
 *                       terminal takes min over its inbound materials), and the ONE capacity whose relief raises that throughput the most
 *                       (ties: the smaller capacity, then the key) — the site, the material, its capacity and the constrained quantity;
 *   single-source exposure — every (site, inbound material) with exactly one supplier.
 * The FINDINGS the Supply Chain Agent proposes to the twin's owner are read from the same analysis (findingsOf).
 */
/* The shapes §A's families.ts reads (structurally the same — declared here so that families.ts, which registers this family, is not imported
   back: the module graph stays acyclic). */
export interface FamilyElement { key: string; value: unknown; unit: string | null; health?: string | null }
type Measures = Record<string, number | string | boolean | null>;
type ElementSchema = Record<string, { unit: string | null; unit_pattern?: string; description: string; required: boolean }>;

export const SUPPLY_NETWORK_KIND = 'supply-network';
export const SUPPLY_NETWORK_FAMILY_NAME = 'supply-network';
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const UNIT = /^[A-Za-z][A-Za-z0-9_.-]{0,19}$/;

export interface Site { id: string; tier: number; name: string; bom: Record<string, number> }
export interface Material { id: string; name: string; unit: string }
export interface Route { id: string; from: string; to: string; material: string }
export interface Network {
  tiers: number[]; sites: Map<string, Site>; materials: Map<string, Material>; routes: Route[];
  /** capacity per `${site}.${material}` per day */
  capacity: Map<string, { site: string; material: string; value: number; unit: string | null }>;
}

const prefixOf = (key: string): string => key.split(':')[0] as string;
const suffixOf = (key: string): string => (key.includes(':') ? key.slice(key.indexOf(':') + 1) : '');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round = (v: number, places = 4): number => Math.round(v * 10 ** places) / 10 ** places;
/** The complete elements only (an incomplete, unreadable or stale element measures nothing — §A's rule). */
const complete = (elements: readonly FamilyElement[]) => elements.filter((e) => e.health === undefined || e.health === null || e.health === 'complete');

/** Read the network from a version's elements, collecting what cannot be read as errors (the validator reports them; a measure ignores them). */
export function readNetwork(elements: readonly FamilyElement[]): { network: Network; errors: string[] } {
  const errors: string[] = [];
  const network: Network = { tiers: [], sites: new Map(), materials: new Map(), routes: [], capacity: new Map() };
  for (const e of elements) {
    const p = prefixOf(e.key); const s = suffixOf(e.key);
    if (p === 'tier') {
      if (!/^[1-9][0-9]{0,2}$/.test(s)) { errors.push(`${e.key}: a tier is numbered 1..n (tier:1, tier:2, …)`); continue; }
      if (typeof e.value !== 'string' || e.value.trim().length === 0) errors.push(`${e.key}: a tier's value is its label`);
      network.tiers.push(Number(s));
    } else if (p === 'site') {
      if (!ID.test(s)) { errors.push(`${e.key}: a site id is letters, digits, _ or - (no '.')`); continue; }
      const v = e.value;
      if (!isObj(v) || !Number.isInteger(v['tier']) || (v['tier'] as number) < 0 || typeof v['name'] !== 'string' || (v['name'] as string).trim().length === 0) {
        errors.push(`${e.key}: a site's value is { tier: 0 (the terminal) or a declared tier, name }`); continue;
      }
      const bom: Record<string, number> = {};
      if (v['bom'] !== undefined) {
        if (!isObj(v['bom'])) { errors.push(`${e.key}: bom is { <material>: quantity per unit shipped }`); continue; }
        for (const [m, q] of Object.entries(v['bom'])) {
          if (!finite(q) || q <= 0) errors.push(`${e.key}: bom ${m} is a positive quantity per unit shipped`); else bom[m] = q;
        }
      }
      network.sites.set(s, { id: s, tier: v['tier'] as number, name: String(v['name']).trim(), bom });
    } else if (p === 'material') {
      if (!ID.test(s)) { errors.push(`${e.key}: a material id is letters, digits, _ or - (no '.')`); continue; }
      const v = e.value;
      if (!isObj(v) || typeof v['name'] !== 'string' || typeof v['unit'] !== 'string' || !UNIT.test(v['unit'] as string)) {
        errors.push(`${e.key}: a material's value is { name, unit } (the unit it is counted in: pcs, t, kg, …)`); continue;
      }
      network.materials.set(s, { id: s, name: String(v['name']), unit: String(v['unit']) });
    } else if (p === 'route') {
      const v = e.value;
      if (!isObj(v) || typeof v['from'] !== 'string' || typeof v['to'] !== 'string' || typeof v['material'] !== 'string') {
        errors.push(`${e.key}: a route's value is { from: <site>, to: <site>, material: <material> }`); continue;
      }
      network.routes.push({ id: s, from: v['from'] as string, to: v['to'] as string, material: v['material'] as string });
    } else if (p === 'capacity') {
      const dot = s.indexOf('.');
      if (dot <= 0 || dot === s.length - 1 || s.indexOf('.', dot + 1) !== -1) { errors.push(`${e.key}: a capacity is keyed capacity:<site>.<material>`); continue; }
      if (!finite(e.value) || e.value < 0) { errors.push(`${e.key}: a capacity is a finite quantity per day, never negative`); continue; }
      network.capacity.set(s, { site: s.slice(0, dot), material: s.slice(dot + 1), value: e.value, unit: e.unit ?? null });
    }
  }
  network.tiers.sort((a, b) => a - b);
  network.routes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { network, errors };
}

/** THE FAMILY'S RULES (run at admission on every element of the version, after the kind's schema check). */
export function networkRules(elements: readonly FamilyElement[]): string[] {
  const { network: n, errors } = readNetwork(elements);
  // tiers 1..N, contiguous and each once
  n.tiers.forEach((t, i) => { if (t !== i + 1) errors.push(`tier:${t}: the tiers are numbered 1..n without a gap or a repeat (expected tier:${i + 1})`); });
  const declared = new Set(n.tiers);
  const terminals = [...n.sites.values()].filter((s) => s.tier === 0);
  if (n.sites.size > 0 && terminals.length !== 1) errors.push(`site: a network serves exactly one terminal site (tier 0); ${terminals.length} declared${terminals.length > 1 ? ` (${terminals.map((s) => s.id).join(', ')})` : ''}`);
  for (const s of n.sites.values()) {
    if (s.tier > 0 && !declared.has(s.tier)) errors.push(`site:${s.id}: tier ${s.tier} is not a declared tier`);
    for (const m of Object.keys(s.bom)) if (!n.materials.has(m)) errors.push(`site:${s.id}: bom names material ${m}, which is not declared`);
  }
  for (const r of n.routes) {
    if (!n.sites.has(r.from)) errors.push(`route:${r.id}: from ${r.from} — not a declared site`);
    if (!n.sites.has(r.to)) errors.push(`route:${r.id}: to ${r.to} — not a declared site`);
    if (r.from === r.to) errors.push(`route:${r.id}: a route joins two sites, not a site to itself`);
    if (!n.materials.has(r.material)) errors.push(`route:${r.id}: material ${r.material} is not declared`);
    else if (n.sites.has(r.from) && !n.capacity.has(`${r.from}.${r.material}`)) errors.push(`route:${r.id}: its origin ${r.from} declares no capacity for ${r.material} (capacity:${r.from}.${r.material})`);
  }
  for (const [k, c] of n.capacity) {
    if (!n.sites.has(c.site)) errors.push(`capacity:${k}: site ${c.site} is not declared`);
    const m = n.materials.get(c.material);
    if (m === undefined) errors.push(`capacity:${k}: material ${c.material} is not declared`);
    else if (c.unit !== `${m.unit}/day`) errors.push(`capacity:${k}: unit ${c.unit ?? '(none)'} — ${c.material} is counted in ${m.unit}, so its capacity is in ${m.unit}/day`);
  }
  // every material a site receives is in its bill of materials (or is what it ships: a pass-through at 1:1); the terminal may take ONE
  // material without a bill of materials (its throughput is then counted in that material)
  for (const s of n.sites.values()) {
    const inbound = new Set(n.routes.filter((r) => r.to === s.id).map((r) => r.material));
    const shipped = new Set(n.routes.filter((r) => r.from === s.id).map((r) => r.material));
    if (s.tier === 0 && Object.keys(s.bom).length === 0 && inbound.size <= 1) continue;
    for (const m of inbound) if (s.bom[m] === undefined && !shipped.has(m)) errors.push(`site:${s.id}: receives ${m} but its bom does not say how much of it one unit shipped consumes`);
  }
  // no cycle: the network flows toward the terminal
  const cycle = findCycle(n);
  if (cycle !== null) errors.push(`route: the routes form a cycle (${cycle.join(' → ')}); a supply network flows toward its terminal site`);
  return errors;
}

function findCycle(n: Network): string[] | null {
  const out = new Map<string, string[]>();
  for (const r of n.routes) out.set(r.from, [...(out.get(r.from) ?? []), r.to]);
  const state = new Map<string, 1 | 2>(); const stack: string[] = [];
  const visit = (s: string): string[] | null => {
    state.set(s, 1); stack.push(s);
    for (const t of out.get(s) ?? []) {
      if (state.get(t) === 1) return [...stack.slice(stack.indexOf(t)), t];
      if (state.get(t) === undefined) { const c = visit(t); if (c !== null) return c; }
    }
    stack.pop(); state.set(s, 2); return null;
  };
  for (const s of [...out.keys()].sort()) if (state.get(s) === undefined) { const c = visit(s); if (c !== null) return c; }
  return null;
}

// ─────────────────────────────── the analysis ───────────────────────────────
export interface Bottleneck {
  site: string; site_name: string; tier: number; material: string; capacity_per_day: number; unit: string;
  throughput_per_day: number; throughput_unit: string; relieved_throughput_per_day: number | null;
}
export interface SingleSource { site: string; material: string; supplier: string; supplier_tier: number; supplier_capacity_per_day: number | null; unit: string | null }
export interface TierCoverage { tier: number; sites: number; routes: number; covered: boolean }
export interface NetworkAnalysis {
  terminal: string | null; terminal_name: string | null;
  throughput_per_day: number | null; throughput_unit: string | null;
  bottleneck: Bottleneck | null;
  tiers: TierCoverage[]; tier_coverage: number | null;
  single_sources: SingleSource[]; inbound_pairs: number;
}

/** The network's throughput to its terminal site per day, with some capacities relieved (key → ∞); null when nothing reaches it. */
function throughput(n: Network, relieved: ReadonlySet<string> = new Set()): number | null {
  const terminal = [...n.sites.values()].find((s) => s.tier === 0);
  if (terminal === undefined) return null;
  const cap = (site: string, material: string): number => {
    const k = `${site}.${material}`;
    return relieved.has(k) ? Infinity : (n.capacity.get(k)?.value ?? Infinity);
  };
  const outDegree = (site: string, material: string): number => n.routes.filter((r) => r.from === site && r.material === material).length;
  const memo = new Map<string, number>(); const visiting = new Set<string>();
  /** What a site's inputs let it ship, in units shipped (∞ for a site the network models no input of). */
  const inputBound = (s: Site): number => {
    const inbound = n.routes.filter((r) => r.to === s.id);
    if (inbound.length === 0) return Infinity;
    const shipped = new Set(n.routes.filter((r) => r.from === s.id).map((r) => r.material));
    let bound = Infinity;
    for (const m of new Set(inbound.map((r) => r.material))) {
      const arriving = inbound.filter((r) => r.material === m).reduce((acc, r) => acc + flow(r), 0);
      const per = s.bom[m] ?? (shipped.has(m) || s.tier === 0 ? 1 : NaN);
      bound = Math.min(bound, arriving / per);
    }
    return bound;
  };
  const out = (site: string, material: string): number => {
    const k = `${site}.${material}`;
    const m = memo.get(k); if (m !== undefined) return m;
    const s = n.sites.get(site);
    if (s === undefined || visiting.has(k)) return NaN;
    visiting.add(k);
    const v = Math.min(cap(site, material), inputBound(s));
    visiting.delete(k); memo.set(k, v);
    return v;
  };
  const flow = (r: Route): number => out(r.from, r.material) / Math.max(1, outDegree(r.from, r.material));
  const inbound = n.routes.filter((r) => r.to === terminal.id);
  if (inbound.length === 0) return null;
  let t = Infinity;
  for (const m of new Set(inbound.map((r) => r.material))) {
    const arriving = Math.min(inbound.filter((r) => r.material === m).reduce((acc, r) => acc + flow(r), 0), cap(terminal.id, m));
    t = Math.min(t, arriving / (terminal.bom[m] ?? 1));
  }
  return Number.isNaN(t) ? null : t;
}

export function analyseNetwork(elements: readonly FamilyElement[]): NetworkAnalysis {
  const { network: n } = readNetwork(complete(elements));
  const terminal = [...n.sites.values()].find((s) => s.tier === 0) ?? null;
  const inboundOfTerminal = terminal === null ? [] : [...new Set(n.routes.filter((r) => r.to === terminal.id).map((r) => r.material))];
  const throughputUnit = terminal === null ? null
    : Object.keys(terminal.bom).length === 0 && inboundOfTerminal.length === 1 ? `${n.materials.get(inboundOfTerminal[0] as string)?.unit ?? 'units'}/day` : 'units/day';
  const t = throughput(n);
  // THE BOTTLENECK: the one capacity whose relief raises the throughput the most
  let bottleneck: Bottleneck | null = null;
  if (t !== null && Number.isFinite(t)) {
    let best: { key: string; relieved: number } | null = null;
    for (const key of [...n.capacity.keys()].sort()) {
      const r = throughput(n, new Set([key]));
      if (r === null || !(r > t + 1e-9)) continue;
      const c = n.capacity.get(key)!;
      const b = best === null ? null : n.capacity.get(best.key)!;
      if (best === null || r > best.relieved + 1e-9 || (Math.abs(r - best.relieved) <= 1e-9 && c.value < (b as { value: number }).value)) best = { key, relieved: r };
    }
    if (best !== null) {
      const c = n.capacity.get(best.key)!; const s = n.sites.get(c.site)!;
      bottleneck = { site: c.site, site_name: s.name, tier: s.tier, material: c.material, capacity_per_day: round(c.value), unit: c.unit ?? `${n.materials.get(c.material)?.unit ?? 'units'}/day`,
                     throughput_per_day: round(t), throughput_unit: throughputUnit ?? 'units/day', relieved_throughput_per_day: Number.isFinite(best.relieved) ? round(best.relieved) : null };
    }
  }
  const tiers: TierCoverage[] = n.tiers.map((tier) => {
    const sites = [...n.sites.values()].filter((s) => s.tier === tier).map((s) => s.id);
    const routes = n.routes.filter((r) => sites.includes(r.from)).length;
    return { tier, sites: sites.length, routes, covered: sites.length > 0 && routes > 0 };
  });
  const singles: SingleSource[] = []; let pairs = 0;
  for (const s of [...n.sites.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const inbound = n.routes.filter((r) => r.to === s.id);
    for (const m of [...new Set(inbound.map((r) => r.material))].sort()) {
      pairs += 1;
      const suppliers = [...new Set(inbound.filter((r) => r.material === m).map((r) => r.from))];
      if (suppliers.length !== 1) continue;
      const sup = suppliers[0] as string; const c = n.capacity.get(`${sup}.${m}`);
      singles.push({ site: s.id, material: m, supplier: sup, supplier_tier: n.sites.get(sup)?.tier ?? -1, supplier_capacity_per_day: c === undefined ? null : round(c.value), unit: c?.unit ?? null });
    }
  }
  return {
    terminal: terminal?.id ?? null, terminal_name: terminal?.name ?? null,
    throughput_per_day: t === null || !Number.isFinite(t) ? null : round(t), throughput_unit: throughputUnit,
    bottleneck, tiers, tier_coverage: tiers.length === 0 ? null : round(tiers.filter((x) => x.covered).length / tiers.length),
    single_sources: singles, inbound_pairs: pairs,
  };
}

/** The family-derived measures (flat, as §A's families answer them) — read by the composition measures route. */
export function networkMeasures(elements: readonly FamilyElement[]): Measures {
  const a = analyseNetwork(elements);
  return {
    terminal: a.terminal, tiers: a.tiers.length, tiers_covered: a.tiers.filter((x) => x.covered).length, tier_coverage: a.tier_coverage,
    throughput_per_day: a.throughput_per_day, throughput_unit: a.throughput_unit,
    bottleneck: a.bottleneck === null ? null : `${a.bottleneck.site}.${a.bottleneck.material}`,
    bottleneck_tier: a.bottleneck?.tier ?? null, bottleneck_capacity_per_day: a.bottleneck?.capacity_per_day ?? null, bottleneck_unit: a.bottleneck?.unit ?? null,
    relieved_throughput_per_day: a.bottleneck?.relieved_throughput_per_day ?? null,
    single_sources: a.single_sources.length, single_source_exposure: a.inbound_pairs === 0 ? null : round(a.single_sources.length / a.inbound_pairs),
  };
}

// ─────────────────────────────── the findings ───────────────────────────────
export type FindingKind = 'bottleneck' | 'single_source' | 'coverage_gap';
export interface Finding { finding_kind: FindingKind; subject: string; measure: Record<string, unknown>; rationale: string }

/**
 * The FINDINGS a scan proposes, most consequential first: the capacity bottleneck, then each tier coverage gap, then each single source (by
 * subject). A finding's MEASURE is what its re-proposal is judged on — the same numbers are never proposed twice (the port compares digests).
 */
export function findingsOf(a: NetworkAnalysis): Finding[] {
  const out: Finding[] = [];
  const b = a.bottleneck;
  if (b !== null) {
    out.push({ finding_kind: 'bottleneck', subject: `${b.site}.${b.material}`, measure: { ...b, terminal: a.terminal },
      rationale: `${b.site_name} (tier ${b.tier}) at ${b.capacity_per_day} ${b.unit} of ${b.material} bounds the network's throughput to ${a.terminal_name ?? a.terminal} at ${b.throughput_per_day} ${b.throughput_unit}`
        + (b.relieved_throughput_per_day === null ? '; relieved, nothing else modelled bounds it' : `; relieved, the network would carry ${b.relieved_throughput_per_day} ${b.throughput_unit}`) });
  }
  for (const t of a.tiers.filter((x) => !x.covered)) {
    out.push({ finding_kind: 'coverage_gap', subject: `tier:${t.tier}`, measure: { tier: t.tier, sites: t.sites, routes: t.routes },
      rationale: `tier ${t.tier} holds ${t.sites} site(s) and ${t.routes} route(s) out of it: the network is not modelled through this tier` });
  }
  for (const s of [...a.single_sources].sort((x, y) => (`${x.site}.${x.material}` < `${y.site}.${y.material}` ? -1 : 1))) {
    out.push({ finding_kind: 'single_source', subject: `${s.site}.${s.material}`, measure: { ...s },
      rationale: `${s.site} receives ${s.material} from ${s.supplier} (tier ${s.supplier_tier}) alone${s.supplier_capacity_per_day === null ? '' : ` at ${s.supplier_capacity_per_day} ${s.unit ?? ''}`.trimEnd()}: a single-source exposure` });
  }
  return out;
}

/** The kind row's element schema (0092 §B.1 inserts the same object — the unit test holds the two equal). */
export const SUPPLY_NETWORK_SCHEMA: ElementSchema = {
  tier: { unit: null, description: 'a declared tier (tier:1 … tier:n); value: its label', required: true },
  site: { unit: null, description: 'a site (site:<id>); value { tier (0 = the terminal site), name, bom? }', required: true },
  material: { unit: null, description: 'a material (material:<id>); value { name, unit }', required: true },
  route: { unit: null, description: 'a route (route:<id>); value { from: <site>, to: <site>, material }', required: true },
  capacity: { unit: 'units/day', unit_pattern: '^[A-Za-z][A-Za-z0-9_.-]{0,19}/day$', description: 'a site\'s capacity for a material per day (capacity:<site>.<material>), in the material\'s unit per day', required: true },
};
