/**
 * CP-6 B82 §GM — THE CANVASES' DECLARATIONS AND THE READS' ADAPTERS as pure functions: every graph view, tree, treemap, sankey and map of
 * components/canvas.tsx renders through §0's ChartFrame with a ChartSpec built HERE, and each passes assertGrammar (lib/b82-seams.ts: title,
 * basis, time basis + cutoff + as-of, units, sources, uncertainty, legend, the table alternative) — canvas-b82.test.ts proves it kind by kind.
 *
 * THE ADAPTERS turn today's reads into task-bounded GraphSpecs (UX-ADR-016): the knowledge graph from /graph/neighbourhood and /path
 * (VIZ-13), the Strategy Graph's objects and what each rests on (VIZ-14), the supply network's tiers, sites, routes and inferred
 * dependencies (VIZ-15), the provenance of a product from graph.explain (VIZ-31 — every node, never collapsed), the strategy hierarchy
 * (VIZ-20); and the corridor's MapSpec from the geographic-reference layer (CMP-064, VIZ-16/18). Nothing is inferred on the client: a
 * value the read does not state is said to be absent, in words. CONSTRUCTION only; every specimen is SYNTHETIC.
 */
import type { AlternativeColumn, ChartKind, ChartSource, ChartSpec, GeoReference, GraphEdge, GraphNode, GraphSpec, LegendEntry, MapLayer, MapSpec, ProjectionWatermark, Absent } from './b82-seams';
import type { EdgeRow, EntityRow, ProjectionBlock, StrategyRow } from './graph';
import type { Inference, Uncertainty } from './supply-b33';
import type { ExplainView } from './provenance-b50';
import { geometryProblem as geometryProblemOf, geometryText, type TreeIn, type TreemapItem, type SankeyLinkIn, type SankeyNodeIn } from './canvas-b82';

type Row = Record<string, unknown>;
export const CANVAS_RULE_VERSION = 'b82-gm-canvas-1';

/* ═════════════════════════════ 1 · THE WATERMARK ═════════════════════════════ */
/** B20's projection block as the canvas states it, or the declared absence (with its reason) when the read carries none. */
export function watermarkOf(p: ProjectionBlock | null | undefined, absentReason = 'this read carries no projection block — it is computed from the record on read'): ProjectionWatermark | Absent {
  if (p === null || p === undefined) return { absent: absentReason };
  return { revision: p.revision, verifiedAt: p.verified_at, lagEvents: p.lag_events, degraded: p.degraded, label: p.label ?? (p.condition === 'current' ? 'projection current' : `projection ${p.condition}`) };
}
export function watermarkText(w: ProjectionWatermark | Absent): string {
  if ('absent' in w) return `No projection watermark: ${w.absent}.`;
  return `Projection ${w.revision === null ? 'revision not stated' : `revision ${w.revision}`}${w.verifiedAt === null ? ', never verified' : `, verified ${w.verifiedAt}`}`
    + `${w.lagEvents > 0 ? `, ${w.lagEvents} event(s) behind` : ', not behind'}${w.degraded ? ' — DEGRADED' : ''}${w.label === null ? '' : ` (${w.label})`}.`;
}

/* ═════════════════════════════ 2 · THE ADAPTERS (task-bounded GraphSpecs) ═════════════════════════════ */

/** VIZ-13 — the knowledge graph of ONE neighbourhood or path answer: entities, typed directed relationships with their valid time and the
 *  evidence each cites; capped at 40 entities and the hops asked. */
export function knowledgeGraphOf(a: { question: string; edges: readonly EdgeRow[]; entities: readonly EntityRow[]; depth: number; projection: ProjectionBlock | null | undefined }): GraphSpec {
  const ids = [...new Set(a.edges.flatMap((e) => [e.subject_entity_id, e.object_entity_id]))];
  const byId = new Map(a.entities.map((e) => [e.entity_id, e]));
  const nodes: GraphNode[] = ids.map((id) => {
    const e = byId.get(id);
    return { id, kind: e?.entity_type ?? 'entity (not in the entity list read)', label: e?.canonical_name ?? `${id.slice(0, 8)}…`, ref: `ENT:${id}`, at: e?.updated_at ?? null };
  });
  const edges: GraphEdge[] = a.edges.map((e) => ({
    id: e.edge_id, from: e.subject_entity_id, to: e.object_entity_id, type: e.predicate, directed: true, at: e.valid_from,
    evidence: [e.evidence_object_id].filter((x) => typeof x === 'string' && x !== ''),
  }));
  return { question: a.question, caps: { nodes: 40, depth: Math.max(1, Math.min(4, Math.round(a.depth))), edges: 120 }, nodes, edges, watermark: watermarkOf(a.projection) };
}

const STRATEGY_WORDS: Readonly<Record<string, string>> = {
  OBJ: 'objective', ASU: 'assumption', DEC: 'decision', CMT: 'commitment', OUT: 'outcome', CAP: 'capability', INI: 'initiative', RSC: 'resource', MSR: 'measure', STK: 'stakeholder', RSK: 'risk / opportunity',
};
/** VIZ-14 — the Strategy Graph: each object (its type, status, verification) and what it RESTS ON (another object, or an entity — the
 *  evidence it stands on); the owner is not stated on this read and is said so. Capped at 80 objects. */
export function strategyGraphOf(rows: readonly StrategyRow[], entities: readonly EntityRow[]): GraphSpec {
  const ent = new Map(entities.map((e) => [e.entity_id, e]));
  const nodes: GraphNode[] = rows.map((r) => ({
    id: r.strategy_object_id, kind: STRATEGY_WORDS[r.object_type] ?? r.object_type, ref: `${r.object_type}:${r.strategy_object_id}@${r.object_version}`,
    label: `${r.title} · ${r.status}${r.object_type === 'ASU' ? ` · ${r.verification_state.replace(/_/g, ' ').toUpperCase()}` : ''}`, at: r.updated_at,
  }));
  const extra = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  for (const r of rows) for (const d of r.dependencies ?? []) {
    if (d.depends_on_kind === 'entity' && !extra.has(d.depends_on_id)) {
      const e = ent.get(d.depends_on_id);
      extra.set(d.depends_on_id, { id: d.depends_on_id, kind: 'entity (evidence it rests on)', label: e?.canonical_name ?? `${d.depends_on_id.slice(0, 8)}…`, ref: `ENT:${d.depends_on_id}` });
    }
    edges.push({ id: d.dependency_id, from: r.strategy_object_id, to: d.depends_on_id, type: 'rests on', directed: true, evidence: [d.rationale] });
  }
  return { question: 'What does each strategy object rest on, and what would a correction reach?', caps: { nodes: 80, depth: 6, edges: 200 },
    nodes: [...nodes, ...extra.values()], edges: edges.filter((e) => nodes.some((n) => n.id === e.from) && (nodes.some((n) => n.id === e.to) || extra.has(e.to))),
    watermark: { absent: 'the Strategy Graph is read from its register, not from a projection' } };
}

/** VIZ-15 — the supply network: sites by TIER (the declared rank: the deepest tier first, the line last), routes as directed flows with
 *  their material, mode and lead time; an inferred dependency the agent proposed is a DASHED edge until validated (never mapped).
 *  Coverage, single sources and alternatives are stated per site in the table. Capped at 80 sites. */
export function dependencyNetworkOf(u: Uncertainty, inferences: readonly Inference[]): GraphSpec & { rank: Record<string, number> } {
  const maxTier = Math.max(0, ...u.sites.map((s) => s.tier));
  const rank: Record<string, number> = {};
  const nodes: GraphNode[] = u.sites.map((s) => {
    rank[s.id] = maxTier - s.tier;
    const into = u.routes.filter((r) => r.to === s.id).length;
    return { id: s.id, kind: `tier ${s.tier} · ${s.basis}`, label: `${s.name}${into === 1 ? ' · single source' : into > 1 ? ` · ${into} alternatives` : ''}`, ref: s.entity_id === null ? null : `ENT:${s.entity_id}` };
  });
  const edges: GraphEdge[] = u.routes.map((r) => ({ id: r.id, from: r.from, to: r.to, type: `${r.material}${r.mode === null ? '' : ` by ${r.mode}`}${r.lead_days === null ? '' : ` · ${r.lead_days} d`}`, directed: true, evidence: [] }));
  for (const i of inferences) {
    if (!['proposed', 'validated'].includes(i.state)) continue;
    if (!nodes.some((n) => n.id === i.proposed_site)) { rank[i.proposed_site] = maxTier - (i.behind_tier + 1); nodes.push({ id: i.proposed_site, kind: `tier ${i.behind_tier + 1} · INFERRED`, label: `${i.proposed_site} · inferred, not mapped` }); }
    edges.push({ id: `inf:${i.inference_id}`, from: i.proposed_site, to: i.behind_site, type: `inferred ${i.material} (${i.state})`, directed: true, evidence: i.evidence.map((e) => `${e.kind}:${e.id}@${e.version}`) });
  }
  for (const k of Object.keys(rank)) rank[k] = rank[k]! - Math.min(...Object.values(rank));
  return { question: 'Which tiers, sites and routes does this network depend on, and where is it single-sourced?', caps: { nodes: 80, depth: Math.max(1, maxTier + 2), edges: 200 },
    nodes, edges, watermark: { absent: 'the network is read from the twin\'s admitted version, not from a projection' }, rank };
}

/** VIZ-31 — the provenance of ONE product from graph.explain: every node (artifacts with versions and digests, people, agent runs, model
 *  calls, reviews, signatures) and every parent link — NEVER collapsed; above the library's ceiling the drawing is refused and the table
 *  still lists every node. */
export function provenanceGraphOf(v: ExplainView): GraphSpec {
  const nodes: GraphNode[] = v.nodes.map((n) => ({
    id: n.nodeId, kind: n.kind, ref: n.ref, at: n.at,
    label: `${n.label}${n.outcome !== 'ok' ? ` · ${n.outcome.toUpperCase()}` : ''}${n.actor === null ? '' : ` · ${n.actor}`}`,
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = v.nodes.flatMap((n) => n.parents.filter((p) => ids.has(p)).map((p) => ({ id: `${p}>${n.nodeId}`, from: p, to: n.nodeId, type: 'input of', directed: true, at: n.at })));
  return { question: `How was ${v.product.type} ${v.product.id.slice(0, 8)}… v${v.product.version} produced — every artifact, actor, time and signature?`,
    caps: { nodes: Math.max(1, Math.min(150, nodes.length)), depth: Math.max(1, Math.min(12, v.bounds.max_depth)), edges: 400 }, nodes, edges,
    watermark: { absent: `the explanation is computed from the record on read (${v.method}, as of ${v.asOf})${v.truncated ? '; the walk was TRUNCATED at its bounds' : ''}` } };
}

/** VIZ-20 — the strategy HIERARCHY: an object's parent is the first strategy object it rests on (declaration order); an object resting on
 *  none hangs from the root, which is the domain's Strategy Graph itself (stated, never invented as an object). */
export function strategyHierarchyOf(rows: readonly StrategyRow[]): TreeIn[] {
  const ids = new Set(rows.map((r) => r.strategy_object_id));
  const parentOf = (r: StrategyRow): string => {
    const p = (r.dependencies ?? []).find((d) => d.depends_on_kind === 'strategy' && ids.has(d.depends_on_id) && d.depends_on_id !== r.strategy_object_id);
    return p === undefined ? 'root' : p.depends_on_id;
  };
  // a cycle through "first rests on" would make no tree: an object whose chain returns to itself hangs from the root instead (said in the row)
  const items: TreeIn[] = rows.map((r) => ({ id: r.strategy_object_id, parent: parentOf(r), label: r.title, kind: STRATEGY_WORDS[r.object_type] ?? r.object_type, version: r.object_version, state: r.status }));
  const parent = new Map(items.map((i) => [i.id, i.parent]));
  for (const i of items) {
    const seen = new Set<string>(); let p: string | null | undefined = i.parent;
    while (p !== null && p !== undefined && p !== 'root') { if (p === i.id || seen.has(p)) { i.parent = 'root'; i.state = `${i.state ?? ''} (rests on a cycle — shown under the root)`.trim(); break; } seen.add(p); p = parent.get(p); }
    parent.set(i.id, i.parent);
  }
  return [{ id: 'root', parent: null, label: 'Strategy Graph (this domain)', kind: 'scope', version: null, state: null }, ...items];
}

/** The corridor's MAP from the geographic-reference layer: the chokepoints, ports and sites as POINTS, the routes as LINES (a flow layer
 *  when transit values are supplied — the width legend always drawn), areas as POLYGONS. No basemap (D4). */
export function corridorMapOf(refs: readonly GeoReference[], flows?: { measure: { measure: string; unit: string } }): MapSpec {
  const active = refs.filter((r) => r.state === 'active');
  const points = active.filter((r) => r.geometry.type === 'Point');
  const lines = active.filter((r) => r.geometry.type === 'LineString');
  const areas = active.filter((r) => r.geometry.type === 'Polygon');
  const layers: MapLayer[] = [];
  if (areas.length > 0) layers.push({ key: 'areas', label: 'Declared areas', kind: 'choropleth', features: areas, specimen: false });
  if (lines.length > 0) layers.push(flows === undefined ? { key: 'routes', label: 'Routes', kind: 'line', features: lines } : { key: 'flows', label: 'Routes by transits', kind: 'flow', features: lines, measure: flows.measure });
  if (points.length > 0) layers.push({ key: 'places', label: 'Chokepoints, ports and sites', kind: 'point', features: points });
  return { crs: 'EPSG:4326', projection: 'equirectangular', layers, scale: { bar: true, unit: 'km' } };
}
/** A server row (graph.geo_layer, snake_case) as the web seam states it. */
export function geoReferenceOf(r: Row): GeoReference {
  const linked = r['linked'] as Row | null;
  return {
    referenceId: String(r['reference_id']), version: Number(r['version']), key: String(r['key']), label: String(r['label']), geometry: r['geometry'] as GeoReference['geometry'], crs: 'EPSG:4326',
    sourceStatement: String(r['source_statement'] ?? ''), licenceStatement: String(r['licence_statement'] ?? ''),
    linked: linked === null || linked === undefined ? null : { type: String(linked['type']), id: String(linked['id']) }, chokepointKey: r['chokepoint_key'] === null || r['chokepoint_key'] === undefined ? null : String(r['chokepoint_key']),
    declaredBy: String(r['declared_by'] ?? ''), declaredAt: String(r['declared_at'] ?? ''), state: r['state'] === 'retired' ? 'retired' : 'active',
  };
}

/* ═════════════════════════════ 3 · THE CHART SPECS (each passes assertGrammar) ═════════════════════════════ */

const GRAPH_COLUMNS: AlternativeColumn[] = [
  { key: 'from', label: 'From', kind: 'text' }, { key: 'relation', label: 'Relation', kind: 'text' }, { key: 'to', label: 'To', kind: 'text' },
  { key: 'direction', label: 'Direction', kind: 'text' }, { key: 'at', label: 'Time', kind: 'instant' }, { key: 'evidence', label: 'Evidence cited', kind: 'number', unit: 'items' },
];
const SOLID: LegendEntry = { key: 'recorded', label: 'Recorded relation (solid)', dash: 'solid', marker: 'none', directLabel: true };
export interface GraphSpecArgs { kind: Extract<ChartKind, 'graph' | 'knowledge_graph' | 'strategy_graph' | 'dependency_network' | 'provenance_graph'>; title: string; basis: string; sources: ChartSource[]; asOf: string; cutoff?: string | null; legend?: LegendEntry[]; summary: string; timeBasis?: 'valid' | 'record' | 'none' }
export function graphChartSpec(a: GraphSpecArgs): ChartSpec {
  return {
    kind: a.kind, title: a.title, basis: a.basis,
    time: { basis: a.timeBasis ?? 'record', cutoff: a.cutoff ?? { absent: 'the read states no cutoff — it is as of the read itself' }, asOf: a.asOf },
    units: [{ measure: 'evidence cited per relation', unit: 'items' }], sources: a.sources,
    uncertainty: { kind: 'not_quantified', statement: 'Relations are drawn as recorded; their confidence and any inference are stated per relation in the table, never by position or size.' },
    legend: a.legend ?? [SOLID],
    alternative: { summary: a.summary, columns: GRAPH_COLUMNS, definitions: [{ term: 'Layer', definition: 'Columns run from what is upstream to what depends on it; position never states importance.' }] },
  };
}
export const INFERRED_LEGEND: LegendEntry = { key: 'inferred', label: 'Inferred, not validated (dashed)', dash: 'dashed', marker: 'none', directLabel: true };

const MAP_COLUMNS: AlternativeColumn[] = [
  { key: 'label', label: 'Reference', kind: 'text' }, { key: 'kind', label: 'Kind', kind: 'text' }, { key: 'position', label: 'Coordinates (EPSG:4326)', kind: 'text' },
  { key: 'uncertainty', label: 'Positional uncertainty', kind: 'number', unit: 'm' }, { key: 'value', label: 'Value', kind: 'text' },
  { key: 'source', label: 'Source', kind: 'text' }, { key: 'licence', label: 'Licence', kind: 'text' }, { key: 'version', label: 'Version · declared', kind: 'text' },
];
export interface MapSpecArgs { kind: Extract<ChartKind, 'map' | 'geospatial_map' | 'flow_map' | 'choropleth'>; title: string; basis: string; sources: ChartSource[]; asOf: string; cutoff?: string | null; legend?: LegendEntry[]; summary: string; extraUnits?: Array<{ measure: string; unit: string }>; uncertainty?: string }
export function mapChartSpec(a: MapSpecArgs): ChartSpec {
  return {
    kind: a.kind, title: a.title, basis: a.basis,
    time: { basis: 'record', cutoff: a.cutoff ?? { absent: 'positions are declared references, not observations — no observation cutoff applies' }, asOf: a.asOf },
    units: [{ measure: 'positional uncertainty', unit: 'm' }, ...(a.extraUnits ?? [])], sources: a.sources,
    uncertainty: { kind: 'range', statement: a.uncertainty ?? 'Each position carries the uncertainty its steward declared (a radius in metres, in the table); the projection is equirectangular — east–west distances stretch away from the standard parallel.' },
    legend: a.legend ?? [{ key: 'place', label: 'Declared place (marker)', dash: 'solid', marker: 'circle', directLabel: true }, { key: 'route', label: 'Declared route (line)', dash: 'solid', marker: 'none', directLabel: true }],
    alternative: { summary: a.summary, columns: MAP_COLUMNS, definitions: [
      { term: 'EPSG:4326', definition: 'WGS 84 longitude and latitude in degrees; the register holds no other coordinate system.' },
      { term: 'No basemap', definition: 'No coastline, boundary, tile or network layer is drawn — only the declared references, a graticule and a scale bar.' },
    ] },
  };
}
/** VIZ-18's declarations: the width ALWAYS with its legend; the period, the units, the coverage; the register named as a source beside the
 *  measured one — unless the drawing is a SYNTHETIC specimen (a specimen is never mixed with real sources). */
export function flowMapChartSpec(a: { title: string; measure: { measure: string; unit: string }; period: string; coverage: string; source: ChartSource; asOf: string; routes: number }): ChartSpec {
  const legend: LegendEntry[] = [
    { key: 'flow', label: `Flow — line width ∝ ${a.measure.measure} (${a.measure.unit})`, dash: 'solid', marker: 'none', directLabel: true },
    { key: 'unknown', label: 'No value for the period (hairline, dotted)', dash: 'dotted', marker: 'none', directLabel: true },
    { key: 'chokepoint', label: 'Chokepoint (diamond)', dash: 'solid', marker: 'diamond', directLabel: true },
  ];
  const register: ChartSource = { read: 'graph.geo_layer', label: `the geographic-reference register, as of ${a.asOf}` };
  return mapChartSpec({ kind: 'flow_map', title: a.title, basis: `${a.measure.measure} along declared routes (direction: each route's declared order), over ${a.period}`,
    sources: 'specimen' in a.source ? [a.source] : [a.source, register], asOf: a.asOf, legend, extraUnits: [a.measure],
    summary: `${a.routes} route(s) with ${a.measure.measure} over ${a.period}; coverage: ${a.coverage}. The value of each route is in the table; widths are linear from the legend's reference widths.` });
}
export function mapRows(refs: readonly GeoReference[], values?: Readonly<Record<string, string>>, uncertaintyM?: Readonly<Record<string, number>>): Array<Record<string, string | number | null>> {
  return refs.map((r) => ({
    label: r.label, kind: r.geometry.type === 'Point' ? (r.chokepointKey !== null ? `chokepoint (${r.chokepointKey})` : 'place') : r.geometry.type === 'LineString' ? 'route' : 'area',
    position: geometryText(r.geometry), uncertainty: uncertaintyM?.[r.key] ?? null, value: values?.[r.key] ?? null,
    source: r.sourceStatement, licence: r.licenceStatement, version: `v${r.version} · ${r.state}${r.declaredAt === '' ? '' : ` · ${r.declaredAt}`}`,
  }));
}

export function treeChartSpec(a: { title: string; basis: string; sources: ChartSource[]; asOf: string; summary: string; rule: string }): ChartSpec {
  return {
    kind: 'hierarchy_tree', title: a.title, basis: a.basis, time: { basis: 'record', cutoff: { absent: 'a register read as of the read itself' }, asOf: a.asOf },
    units: [{ measure: 'depth below the root', unit: 'levels' }], sources: a.sources,
    uncertainty: { kind: 'not_applicable', statement: 'A hierarchy of recorded relations — nothing here is estimated.' },
    legend: [{ key: 'parent', label: 'Parent relation (line)', dash: 'solid', marker: 'none', directLabel: true }],
    alternative: { summary: a.summary, columns: [
      { key: 'path', label: 'Path from the root', kind: 'text' }, { key: 'label', label: 'Item', kind: 'text' }, { key: 'kind', label: 'Kind', kind: 'text' },
      { key: 'version', label: 'Version', kind: 'text' }, { key: 'state', label: 'State', kind: 'state' }, { key: 'depth', label: 'Depth', kind: 'number', unit: 'levels' },
    ], definitions: [{ term: 'Nesting rule', definition: a.rule }] },
  };
}
export function treemapChartSpec(a: { title: string; basis: string; sources: ChartSource[]; asOf: string; cutoff?: string | null; unit: string; measure: string; summary: string; rule: string; uncertainty?: string }): ChartSpec {
  return {
    kind: 'treemap', title: a.title, basis: a.basis, time: { basis: 'record', cutoff: a.cutoff ?? { absent: 'the aggregate states no cutoff' }, asOf: a.asOf },
    units: [{ measure: a.measure, unit: a.unit }, { measure: 'share of the total', unit: '%' }], sources: a.sources,
    uncertainty: { kind: 'not_quantified', statement: a.uncertainty ?? 'Areas show shares of the total only — compare exact values in the table, never by area.' },
    legend: [{ key: 'group', label: 'Group (outlined)', dash: 'solid', marker: 'square', directLabel: true }, { key: 'part', label: 'Part (labelled cell)', dash: 'dotted', marker: 'none', directLabel: true }],
    alternative: { summary: a.summary, columns: [
      { key: 'group', label: 'Group', kind: 'text' }, { key: 'label', label: 'Part', kind: 'text' }, { key: 'value', label: a.measure, kind: 'number', unit: a.unit }, { key: 'share', label: 'Share of the total', kind: 'number', unit: '%' },
    ], definitions: [{ term: 'Nesting rule', definition: a.rule }] },
  };
}
export function sankeyChartSpec(a: { title: string; basis: string; sources: ChartSource[]; asOf: string; cutoff?: string | null; unit: string; measure: string; summary: string; omissions: string[] }): ChartSpec {
  return {
    kind: 'sankey', title: a.title, basis: a.basis, time: { basis: 'record', cutoff: a.cutoff ?? { absent: 'the specimen states no period' }, asOf: a.asOf },
    units: [{ measure: a.measure, unit: a.unit }], sources: a.sources,
    uncertainty: { kind: 'not_quantified', statement: 'Flows are drawn as stated; the conservation check names every node where what arrives differs from what leaves.' },
    legend: [{ key: 'flow', label: 'Flow (band width ∝ quantity)', dash: 'solid', marker: 'none', directLabel: true }],
    alternative: { summary: a.summary, columns: [
      { key: 'from', label: 'From', kind: 'text' }, { key: 'to', label: 'To', kind: 'text' }, { key: 'value', label: a.measure, kind: 'number', unit: a.unit },
    ], definitions: [
      { term: 'Conservation rule', definition: 'At every intermediate node what leaves equals what arrives (within 0.5 %); a source only emits and a sink only receives.' },
      { term: 'Omissions', definition: a.omissions.length === 0 ? 'none declared' : a.omissions.join('; ') },
    ] },
  };
}

/* ═════════════════════════════ 4 · THE SYNTHETIC SPECIMENS (the catalogue; D13 — said so) ═════════════════════════════ */
export const SPECIMEN_AS_OF = '2026-10-19T08:00:00Z';
export const SPECIMEN_SOURCE: ChartSource = { specimen: 'a SYNTHETIC catalogue specimen — no record read, no product journey' };
export const SANKEY_SPECIMEN: { nodes: SankeyNodeIn[]; links: SankeyLinkIn[]; omissions: string[] } = {
  nodes: [{ id: 'ningbo', label: 'Ningbo (SYNTHETIC)' }, { id: 'suez', label: 'via Suez (SYNTHETIC)' }, { id: 'cape', label: 'via the Cape (SYNTHETIC)' }, { id: 'rtm', label: 'Rotterdam (SYNTHETIC)' }, { id: 'rgb', label: 'Regensburg line (SYNTHETIC)' }],
  links: [{ from: 'ningbo', to: 'suez', value: 120 }, { from: 'ningbo', to: 'cape', value: 80 }, { from: 'suez', to: 'rtm', value: 120 }, { from: 'cape', to: 'rtm', value: 80 }, { from: 'rtm', to: 'rgb', value: 200 }],
  omissions: ['air freight is not shown (SYNTHETIC specimen)'],
};
export const TREEMAP_SPECIMEN: TreemapItem[] = [
  { id: 'a', label: 'Magnet supply (SYNTHETIC)', value: 42, group: 'Supply risk' }, { id: 'b', label: 'Transit delay (SYNTHETIC)', value: 27, group: 'Supply risk' },
  { id: 'c', label: 'Insurance withdrawal (SYNTHETIC)', value: 13, group: 'Market risk' }, { id: 'd', label: 'Freight rate (SYNTHETIC)', value: 9, group: 'Market risk' },
  { id: 'e', label: 'Port congestion (SYNTHETIC)', value: 6, group: 'Operations' },
];
/** Declared references for the catalogue (SYNTHETIC — typed for the specimen, never a record). */
export const GEO_SPECIMEN: GeoReference[] = [
  { referenceId: 'spec-1', version: 1, key: 'chokepoint.bab-el-mandeb', label: 'Bab el-Mandeb (SYNTHETIC)', geometry: { type: 'Point', coordinates: [43.33, 12.58] }, crs: 'EPSG:4326', sourceStatement: 'catalogue specimen (SYNTHETIC)', licenceStatement: 'catalogue specimen (SYNTHETIC)', linked: null, chokepointKey: 'portwatch:chokepoint4', declaredBy: 'specimen', declaredAt: '', state: 'active' },
  { referenceId: 'spec-2', version: 1, key: 'chokepoint.suez', label: 'Suez Canal (SYNTHETIC)', geometry: { type: 'Point', coordinates: [32.35, 30.6] }, crs: 'EPSG:4326', sourceStatement: 'catalogue specimen (SYNTHETIC)', licenceStatement: 'catalogue specimen (SYNTHETIC)', linked: null, chokepointKey: 'portwatch:chokepoint1', declaredBy: 'specimen', declaredAt: '', state: 'active' },
  { referenceId: 'spec-3', version: 1, key: 'chokepoint.cape', label: 'Cape of Good Hope (SYNTHETIC)', geometry: { type: 'Point', coordinates: [18.47, -34.36] }, crs: 'EPSG:4326', sourceStatement: 'catalogue specimen (SYNTHETIC)', licenceStatement: 'catalogue specimen (SYNTHETIC)', linked: null, chokepointKey: 'portwatch:chokepoint7', declaredBy: 'specimen', declaredAt: '', state: 'active' },
  { referenceId: 'spec-4', version: 1, key: 'port.rotterdam', label: 'Rotterdam (SYNTHETIC)', geometry: { type: 'Point', coordinates: [4.05, 51.95] }, crs: 'EPSG:4326', sourceStatement: 'catalogue specimen (SYNTHETIC)', licenceStatement: 'catalogue specimen (SYNTHETIC)', linked: null, chokepointKey: null, declaredBy: 'specimen', declaredAt: '', state: 'active' },
  { referenceId: 'spec-5', version: 1, key: 'route.suez', label: 'Suez route (SYNTHETIC)', geometry: { type: 'LineString', coordinates: [[121.9, 29.9], [43.33, 12.58], [32.35, 30.6], [4.05, 51.95]] }, crs: 'EPSG:4326', sourceStatement: 'catalogue specimen (SYNTHETIC)', licenceStatement: 'catalogue specimen (SYNTHETIC)', linked: null, chokepointKey: null, declaredBy: 'specimen', declaredAt: '', state: 'active' },
  { referenceId: 'spec-6', version: 1, key: 'route.cape', label: 'Cape route (SYNTHETIC)', geometry: { type: 'LineString', coordinates: [[121.9, 29.9], [18.47, -34.36], [4.05, 51.95]] }, crs: 'EPSG:4326', sourceStatement: 'catalogue specimen (SYNTHETIC)', licenceStatement: 'catalogue specimen (SYNTHETIC)', linked: null, chokepointKey: null, declaredBy: 'specimen', declaredAt: '', state: 'active' },
];
/** Two SYNTHETIC areas for the choropleth specimen (D13 / Q4: no boundary dataset is admitted — these squares are not regions of the world). */
export const CHOROPLETH_SPECIMEN: { areas: GeoReference[]; data: Array<{ key: string; numerator: number | null; denominator: number | null }> } = {
  areas: [
    { referenceId: 'spec-a1', version: 1, key: 'area.a', label: 'Specimen area A (SYNTHETIC)', geometry: { type: 'Polygon', coordinates: [[[0, 40], [10, 40], [10, 50], [0, 50], [0, 40]]] }, crs: 'EPSG:4326', sourceStatement: 'catalogue specimen (SYNTHETIC)', licenceStatement: 'catalogue specimen (SYNTHETIC)', linked: null, chokepointKey: null, declaredBy: 'specimen', declaredAt: '', state: 'active' },
    { referenceId: 'spec-a2', version: 1, key: 'area.b', label: 'Specimen area B (SYNTHETIC)', geometry: { type: 'Polygon', coordinates: [[[10, 40], [20, 40], [20, 50], [10, 50], [10, 40]]] }, crs: 'EPSG:4326', sourceStatement: 'catalogue specimen (SYNTHETIC)', licenceStatement: 'catalogue specimen (SYNTHETIC)', linked: null, chokepointKey: null, declaredBy: 'specimen', declaredAt: '', state: 'active' },
    { referenceId: 'spec-a3', version: 1, key: 'area.c', label: 'Specimen area C (SYNTHETIC)', geometry: { type: 'Polygon', coordinates: [[[20, 40], [30, 40], [30, 50], [20, 50], [20, 40]]] }, crs: 'EPSG:4326', sourceStatement: 'catalogue specimen (SYNTHETIC)', licenceStatement: 'catalogue specimen (SYNTHETIC)', linked: null, chokepointKey: null, declaredBy: 'specimen', declaredAt: '', state: 'active' },
  ],
  data: [{ key: 'area.a', numerator: 12, denominator: 400 }, { key: 'area.b', numerator: 30, denominator: 500 }, { key: 'area.c', numerator: 7, denominator: null }],
};

/* ═════════════════════════════ 5 · THE DECLARATION FORM'S INTAKE (/graph/geo) ═════════════════════════════ */
export type GeoKind = 'chokepoint' | 'port' | 'site' | 'route' | 'area';
export const GEO_KIND_WORDS: Readonly<Record<GeoKind, string>> = { chokepoint: 'Chokepoint (a point)', port: 'Port (a point)', site: 'Site (a point)', route: 'Route (a line)', area: 'Area (a polygon)' };
export interface GeoForm { kind: GeoKind; positions: string }
/**
 * The positions a steward TYPES ("longitude, latitude" — a point; several separated by ";" — a line, or an area whose ring this closes) as
 * a GeoJSON geometry, or the problem in words (the same check the register's port runs; the port remains the authority — nothing here is
 * recorded or assumed accepted).
 */
export function geometryFromForm(f: GeoForm): { geometry: GeoReference['geometry'] | null; problem: string | null } {
  const parts = f.positions.split(';').map((p) => p.trim()).filter((p) => p !== '');
  const ps: Array<[number, number]> = [];
  for (const [i, p] of parts.entries()) {
    const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(p);
    if (m === null) return { geometry: null, problem: `position ${i + 1} ("${p}") is not "longitude, latitude" — type two numbers in degrees, longitude first` };
    ps.push([Number(m[1]), Number(m[2])]);
  }
  const want = f.kind === 'route' ? 'LineString' : f.kind === 'area' ? 'Polygon' : 'Point';
  if (ps.length === 0) return { geometry: null, problem: 'type the position(s): "longitude, latitude", several separated by ";"' };
  let g: GeoReference['geometry'];
  if (want === 'Point') {
    if (ps.length !== 1) return { geometry: null, problem: `a ${f.kind} is one position; ${ps.length} were typed` };
    g = { type: 'Point', coordinates: ps[0]! };
  } else if (want === 'LineString') g = { type: 'LineString', coordinates: ps };
  else {
    const ring = ps.length > 0 && (ps[0]![0] !== ps[ps.length - 1]![0] || ps[0]![1] !== ps[ps.length - 1]![1]) ? [...ps, ps[0]!] : ps;
    g = { type: 'Polygon', coordinates: [ring] };
  }
  const problem = geometryProblemOf(g);
  return problem === null ? { geometry: g, problem: null } : { geometry: null, problem };
}
