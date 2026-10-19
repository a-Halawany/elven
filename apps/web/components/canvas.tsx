'use client';
/**
 * CP-6 B82 §GM — THE GRAPH AND MAP CANVASES of the shared library (F-P7-E-21: CMP-063 GraphCanvas, CMP-064 MapCanvas; VIZ-13 knowledge
 * graph, VIZ-14 strategy graph, VIZ-15 dependency network, VIZ-16 geospatial map, VIZ-17 choropleth, VIZ-18 flow map, VIZ-19 sankey, VIZ-20
 * hierarchy tree, VIZ-21 treemap, VIZ-31 provenance graph; UX-ADR-016). Hand-written SVG (DESIGN D3 — no chart or map library, no
 * dependency); every geometry is lib/canvas-b82.ts's (pure, tested), every declaration lib/canvas-specs-b82.ts's; each canvas composes §0's
 * ChartFrame (components/chart-frame.tsx) with a spec that passes assertGrammar — the declarations always shown, the TABLE ALTERNATIVE always
 * rendered (never behind a toggle), a SYNTHETIC specimen said so.
 *
 *   GraphCanvas         a TASK-BOUNDED graph view (a stated question, node / depth / edge caps, the projection watermark): an unbounded
 *                       answer is NOT DRAWN and the problem is said in words — the table still lists every node and relation (no hairball,
 *                       nothing collapsed). Deterministic layered layout. KEYBOARD TRAVERSAL node by node through the traversal control
 *                       beside the drawing (arrows follow relations and columns, Home / End, Enter opens) with the node's connections
 *                       announced; the drawing itself stays an image (role="img" in the frame) and highlights the node in focus.
 *   KnowledgeGraphView · StrategyGraphView · DependencyNetwork · ProvenanceGraph   GraphCanvas over the reads' adapters.
 *   HierarchyTree · Treemap · Sankey   the tree (root, parent relation, version, scope), the part-to-whole (total, unit, nesting rule), the
 *                       flow composition (source / target, conservation rule, units, omissions).
 *   MapCanvas           EPSG:4326, equirectangular, a graticule and a SCALE BAR, NO basemap, NO tiles, NO network (D4); point, line, flow
 *                       and choropleth layers of DECLARED references; never mirrored (geography does not turn with the reading direction).
 *   GeospatialMap · FlowMap · Choropleth   MapCanvas with its layer; a flow's width always with its legend; a choropleth always a normalised
 *                       rate (numerator / denominator), its breaks and its missing data — a SYNTHETIC specimen until a boundary dataset is
 *                       admitted on the owner's word (Q4).
 *
 * D5: no new colour token — dash patterns, markers, hatching and direct labels tell things apart; colours are semantic tokens in
 * app/globals.css (the `B82 gm` block), forced colours kept. Wide drawings OWN their inline scroll (UX-19-003). CONSTRUCTION only.
 */
import { useEffect, useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ChartFrame } from './chart-frame';
import type { ChartSource, ChartSpec, DashPattern, GeoReference, GraphEdge, GraphNode, GraphSpec, LegendEntry, MapSpec } from '../lib/b82-seams';
import {
  TRAVERSAL_KEYS, boundsOf, choroplethBreaks, choroplethRates, classOf, describeNode, equirectangular, flowWidths, geoPath, graphProblems, graphRows,
  graticule, layeredLayout, mirrorLayout, paddedExtent, readingOrder, sankeyCheck, sankeyLayout, scaleBar, traverse, treeLayout, treeProblems,
  treemapLayout, treemapProblems, type ChoroIn, type Extent, type SankeyLinkIn, type SankeyNodeIn, type TreeIn, type TreemapItem,
} from '../lib/canvas-b82';
import {
  INFERRED_LEGEND, dependencyNetworkOf, graphChartSpec, knowledgeGraphOf, mapChartSpec, mapRows, provenanceGraphOf, sankeyChartSpec, strategyGraphOf,
  treeChartSpec, treemapChartSpec, watermarkText,
} from '../lib/canvas-specs-b82';
import type { EdgeRow, EntityRow, ProjectionBlock, StrategyRow } from '../lib/graph';
import type { Inference, Uncertainty } from '../lib/supply-b33';
import type { ExplainView } from '../lib/provenance-b50';

const DASH: Readonly<Record<DashPattern, string | undefined>> = { solid: undefined, dashed: '6 4', dotted: '2 3', 'dash-dot': '6 3 2 3' };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The document's reading direction (a graph's layers mirror for RTL; a map never does). */
function useRtl(): boolean {
  const [rtl, setRtl] = useState(false);
  useEffect(() => {
    const read = () => setRtl(document.documentElement.getAttribute('dir') === 'rtl');
    read();
    const m = new MutationObserver(read); m.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
    return () => m.disconnect();
  }, []);
  return rtl;
}

function Problems({ title, problems, what }: { title: string; problems: readonly string[]; what: string }) {
  if (problems.length === 0) return null;
  return (
    <div className="eye-canvas-refused" role="note" aria-label={`${title}: not drawn`}>
      <p>Not drawn: {what} The table alternative below still lists everything the read returned.</p>
      <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}

/* ───────────────────────── GraphCanvas (CMP-063, UX-ADR-016) ───────────────────────── */

export function GraphCanvas({ spec, chart, rank, edgeDash, onOpen }: {
  /** the bounded view: question, caps, nodes, edges, watermark */ spec: GraphSpec;
  /** the declarations (lib/canvas-specs-b82 graphChartSpec) */ chart: ChartSpec;
  /** a declared layer per node (e.g. a supply tier); otherwise longest path */ rank?: Readonly<Record<string, number>>;
  /** the dash of an edge (the legend says what each dash means) */ edgeDash?: (e: GraphEdge) => DashPattern;
  /** Enter on (or a double click of) a node — e.g. open its object page */ onOpen?: (n: GraphNode) => void;
}) {
  const rtl = useRtl();
  const hintId = useId(); const markerId = `${useId().replace(/:/g, '')}-arrow`;
  const problems = useMemo(() => graphProblems(spec), [spec]);
  const layout = useMemo(() => {
    if (problems.length > 0) return null;
    const l = layeredLayout(spec.nodes, spec.edges, rank === undefined ? {} : { rank: (n) => rank[n.id] ?? null });
    return rtl ? mirrorLayout(l) : l;
  }, [spec, rank, rtl, problems]);
  const order = useMemo(() => (layout === null ? spec.nodes.map((n) => n.id) : readingOrder(layout)), [layout, spec]);
  const rows = useMemo(() => graphRows(spec, order), [spec, order]);
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => { if (current !== null && !spec.nodes.some((n) => n.id === current)) setCurrent(null); }, [spec, current]);
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (layout === null) return;
    if (e.key === 'Enter' && current !== null && onOpen !== undefined) { e.preventDefault(); onOpen(spec.nodes.find((n) => n.id === current)!); return; }
    if (e.key === 'Escape') { setCurrent(null); return; }
    if (!(TRAVERSAL_KEYS as readonly string[]).includes(e.key)) return;
    const next = traverse(layout, current, e.key, rtl);
    if (next !== null) { e.preventDefault(); setCurrent(next); }
  };
  const lit = useMemo(() => new Set(current === null ? [] : spec.edges.filter((e) => e.from === current || e.to === current).map((e) => e.id)), [current, spec]);
  const labelled = spec.edges.length <= 40;
  return (
    <div className="eye-canvas" data-canvas="graph">
      <p className="eye-canvas-question"><strong>Question:</strong> {spec.question} <span className="eye-canvas-meta">· caps {spec.caps.nodes} nodes, {spec.caps.depth} hops{spec.caps.edges === undefined ? '' : `, ${spec.caps.edges} relations`} · {spec.nodes.length} nodes and {spec.edges.length} relations in this answer</span></p>
      <p className="eye-canvas-meta">{watermarkText(spec.watermark)}</p>
      <Problems title={chart.title} problems={problems} what="this answer is not bounded the way a graph view must be (UX-ADR-016)." />
      {layout !== null && layout.reversed.length > 0 && <p className="eye-canvas-meta">{layout.reversed.length} relation(s) close a cycle; they are drawn against the column order and listed in the table like every other.</p>}
      {layout !== null && (
        <div className="eye-canvas-traverse" role="group" tabIndex={0} aria-label={`${chart.title}: move through the graph node by node`} aria-describedby={hintId} onKeyDown={onKey}>
          <p id={hintId} className="eye-canvas-meta">Focus here, then: Right and Left follow a relation across the columns, Down and Up move within a column, Home and End jump to the first and last node{onOpen === undefined ? '' : ', Enter opens the node'}, Escape clears.</p>
          <p aria-live="polite" className="eye-canvas-current">{current === null ? 'No node in focus.' : describeNode(spec, current)}</p>
        </div>
      )}
      <ChartFrame spec={chart} rows={rows}>
        {layout === null ? undefined : (
          <div className="eye-canvas-scroll">
            <svg className="eye-canvas-svg" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} focusable="false">
              <defs>
                <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 Z" className="eye-canvas-arrow" />
                </marker>
              </defs>
              <g>
                {layout.edges.map((e) => (
                  <g key={e.id} className="eye-canvas-edge" data-lit={lit.has(e.id) ? 'true' : undefined}>
                    <path d={e.path} fill="none" strokeDasharray={DASH[edgeDash?.(e.edge) ?? 'solid']} markerEnd={e.edge.directed ? `url(#${markerId})` : undefined} />
                    {labelled && <text x={e.mid[0]} y={e.mid[1] - 4} textAnchor="middle" className="eye-canvas-edge-label">{clip(e.edge.type, 28)}</text>}
                  </g>
                ))}
              </g>
              <g>
                {layout.nodes.map((n) => (
                  <g key={n.id} className="eye-canvas-node" data-current={current === n.id ? 'true' : undefined} onClick={() => setCurrent(n.id)}
                    onDoubleClick={() => onOpen?.(n.node)}>
                    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={6} />
                    <text x={n.x + 8} y={n.y + 18} className="eye-canvas-node-label">{clip(n.node.label, 24)}</text>
                    <text x={n.x + 8} y={n.y + 34} className="eye-canvas-node-kind">{clip(n.node.kind, 28)}</text>
                  </g>
                ))}
              </g>
            </svg>
          </div>
        )}
      </ChartFrame>
    </div>
  );
}

const src = (read: string, label: string): ChartSource => ({ read, label });

/* ───────────────────────── the graph views (VIZ-13, VIZ-14, VIZ-15, VIZ-31) ───────────────────────── */

export function KnowledgeGraphView({ question, edges, entities, depth, projection, asOf, onOpen }: {
  question: string; edges: readonly EdgeRow[]; entities: readonly EntityRow[]; depth: number; projection: ProjectionBlock | null | undefined;
  /** the instant the answer is for (known at) */ asOf: string; onOpen?: (n: GraphNode) => void;
}) {
  const spec = useMemo(() => knowledgeGraphOf({ question, edges, entities, depth, projection }), [question, edges, entities, depth, projection]);
  const chart = useMemo(() => graphChartSpec({
    kind: 'knowledge_graph', title: 'Knowledge graph — this answer', basis: 'recorded relationships between resolved entities, each citing its claim and evidence',
    sources: [src('graph.neighbourhood / graph.path', 'the graph read')], asOf, timeBasis: 'valid',
    summary: `${spec.nodes.length} entities and ${spec.edges.length} typed, directed relationships valid at the instant asked; each row names the relation, its valid-from time and the evidence it cites.`,
  }), [spec, asOf]);
  return <GraphCanvas spec={spec} chart={chart} onOpen={onOpen} />;
}

export function StrategyGraphView({ rows, entities, asOf, onOpen }: { rows: readonly StrategyRow[]; entities: readonly EntityRow[]; asOf: string; onOpen?: (n: GraphNode) => void }) {
  const spec = useMemo(() => strategyGraphOf(rows, entities), [rows, entities]);
  const chart = useMemo(() => graphChartSpec({
    kind: 'strategy_graph', title: 'Strategy Graph — what each object rests on', basis: 'declared strategy objects and the dependencies each names (with its rationale)',
    sources: [src('graph.strategy list', 'the Strategy Graph register')], asOf,
    summary: `${rows.length} strategy objects (type, status, an assumption's verification) and ${spec.edges.length} "rests on" relations; the owner is not stated on this read. The evidence column counts the rationale each dependency records.`,
  }), [spec, rows.length, asOf]);
  return <GraphCanvas spec={spec} chart={chart} onOpen={onOpen} />;
}

export function DependencyNetwork({ uncertainty, inferences, asOf, title }: { uncertainty: Uncertainty; inferences: readonly Inference[]; asOf: string; title: string }) {
  const net = useMemo(() => dependencyNetworkOf(uncertainty, inferences), [uncertainty, inferences]);
  const { rank, ...spec } = net;
  const inferred = spec.edges.some((e) => e.id.startsWith('inf:'));
  const chart = useMemo(() => graphChartSpec({
    kind: 'dependency_network', title: `Dependency network — ${title}`, basis: 'declared, validated and inferred supplier sites by tier, and the routes between them',
    sources: [src('twins.supply network', 'the twin\'s admitted version')], asOf,
    legend: inferred ? [{ key: 'recorded', label: 'Declared or validated route (solid)', dash: 'solid', marker: 'none', directLabel: true }, INFERRED_LEGEND] : undefined,
    summary: `${spec.nodes.length} sites in ${uncertainty.tiers.length} tier(s), ${uncertainty.routes.length} routes; coverage: ${uncertainty.coverage.declared} declared, ${uncertainty.coverage.validated} validated, ${uncertainty.coverage.inferred} inferred. A site with one route in is single-sourced; more routes in are its alternatives.`,
  }), [spec, uncertainty, asOf, title, inferred]);
  return <GraphCanvas spec={spec} chart={chart} rank={rank} edgeDash={(e) => (e.id.startsWith('inf:') ? 'dashed' : 'solid')} />;
}

export function ProvenanceGraph({ view, onOpen }: { view: ExplainView; onOpen?: (n: GraphNode) => void }) {
  const spec = useMemo(() => provenanceGraphOf(view), [view]);
  const chart = useMemo(() => graphChartSpec({
    kind: 'provenance_graph', title: `Provenance — ${view.product.type} v${view.product.version}`, basis: `the recorded transformation and custody path (${view.method}) — artifacts with versions, actors, times and signatures`,
    sources: [src('graph.explain', 'the provenance read')], asOf: view.asOf,
    summary: `${spec.nodes.length} nodes (every one drawn — never collapsed) and ${spec.edges.length} input links${view.truncated ? '; the walk was TRUNCATED at its bounds' : ''}${view.gaps.length > 0 ? `; ${view.gaps.length} gap(s) recorded` : ''}.`,
  }), [spec, view]);
  return <GraphCanvas spec={spec} chart={chart} onOpen={onOpen} />;
}

/* ───────────────────────── HierarchyTree (VIZ-20) ───────────────────────── */

export function HierarchyTree({ items, title, basis, source, asOf, rule }: { items: readonly TreeIn[]; title: string; basis: string; source: ChartSource; asOf: string; rule: string }) {
  const problems = useMemo(() => treeProblems(items), [items]);
  const layout = useMemo(() => (problems.length > 0 ? null : treeLayout(items)), [items, problems]);
  const rows = useMemo(() => {
    const parent = new Map(items.map((i) => [i.id, i.parent]));
    const label = new Map(items.map((i) => [i.id, i.label]));
    const pathOf = (id: string): string[] => { const out: string[] = []; let p = parent.get(id) ?? null; let guard = 0; while (p !== null && guard < 50) { out.unshift(label.get(p) ?? p); p = parent.get(p) ?? null; guard += 1; } return out; };
    const order = layout?.preorder ?? items.map((i) => i.id);
    return order.map((id) => { const i = items.find((x) => x.id === id)!; const path = pathOf(id); return { path: path.length === 0 ? '(root)' : path.join(' › '), label: i.label, kind: i.kind, version: i.version === null || i.version === undefined ? 'not versioned' : `v${i.version}`, state: i.state ?? null, depth: path.length }; });
  }, [items, layout]);
  const chart = useMemo(() => treeChartSpec({ title, basis, sources: [source], asOf, rule, summary: `${items.length} items under one root, listed depth-first; each row gives its path from the root, its kind, version and state.` }), [title, basis, source, asOf, rule, items.length]);
  return (
    <div className="eye-canvas" data-canvas="tree">
      <Problems title={title} problems={problems} what="these items do not form one tree." />
      <ChartFrame spec={chart} rows={rows}>
        {layout === null ? undefined : (
          <div className="eye-canvas-scroll">
            <svg className="eye-canvas-svg" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} focusable="false">
              {layout.links.map((l) => <path key={`${l.from}>${l.to}`} d={l.path} fill="none" className="eye-canvas-link" />)}
              {layout.nodes.map((n) => (
                <g key={n.id} className="eye-canvas-node">
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={6} />
                  <text x={n.x + 8} y={n.y + 16} className="eye-canvas-node-label">{clip(n.item.label, 24)}</text>
                  <text x={n.x + 8} y={n.y + 31} className="eye-canvas-node-kind">{clip(`${n.item.kind}${n.item.version === null || n.item.version === undefined ? '' : ` · v${n.item.version}`}`, 28)}</text>
                </g>
              ))}
            </svg>
          </div>
        )}
      </ChartFrame>
    </div>
  );
}

/* ───────────────────────── Treemap (VIZ-21) ───────────────────────── */

export function Treemap({ items, title, basis, source, asOf, measure, unit, rule, cutoff }: {
  items: readonly TreemapItem[]; title: string; basis: string; source: ChartSource; asOf: string; measure: string; unit: string; rule?: string; cutoff?: string | null;
}) {
  const W = 640; const H = 360;
  const problems = useMemo(() => treemapProblems(items), [items]);
  const t = useMemo(() => treemapLayout(items, W, H), [items]);
  const total = items.reduce((a, i) => a + (Number.isFinite(i.value) ? i.value : 0), 0);
  const rows = useMemo(() => items.map((i) => ({ group: i.group, label: i.label, value: i.value, share: total > 0 ? Math.round((i.value / total) * 1000) / 10 : null })), [items, total]);
  const nesting = rule ?? 'Groups first, largest total first; then the parts inside each group, largest first; ties by name.';
  const chart = useMemo(() => treemapChartSpec({ title, basis, sources: [source], asOf, cutoff, unit, measure, rule: nesting,
    summary: `Total ${total.toLocaleString('en')} ${unit} across ${items.length} parts in ${new Set(items.map((i) => i.group)).size} group(s); each row gives the part's value and its share of the total.` }), [title, basis, source, asOf, cutoff, unit, measure, nesting, total, items]);
  return (
    <div className="eye-canvas" data-canvas="treemap">
      <p className="eye-canvas-meta">Total: {total.toLocaleString('en')} {unit}. Areas show shares only — compare exact values in the table.</p>
      <Problems title={title} problems={problems} what="these values do not make a whole of parts." />
      <ChartFrame spec={chart} rows={rows}>
        {problems.length > 0 ? undefined : (
          <svg className="eye-canvas-svg eye-canvas-fit" viewBox={`0 0 ${W} ${H}`} focusable="false">
            {t.groups.map((g) => <rect key={`g-${g.group}`} x={g.x} y={g.y} width={g.w} height={g.h} className="eye-canvas-tm-group" />)}
            {t.cells.map((c) => (
              <g key={c.id} className="eye-canvas-tm-cell">
                <rect x={c.x + 2} y={c.y + 2} width={Math.max(0, c.w - 4)} height={Math.max(0, c.h - 4)} rx={3} />
                {c.w > 90 && c.h > 34 && <text x={c.x + 8} y={c.y + 18} className="eye-canvas-node-label">{clip(c.label, Math.floor(c.w / 7))}</text>}
                {c.w > 90 && c.h > 50 && <text x={c.x + 8} y={c.y + 34} className="eye-canvas-node-kind">{`${c.value.toLocaleString('en')} ${unit} · ${Math.round(c.share * 1000) / 10} %`}</text>}
              </g>
            ))}
          </svg>
        )}
      </ChartFrame>
    </div>
  );
}

/* ───────────────────────── Sankey (VIZ-19) ───────────────────────── */

export function Sankey({ nodes, links, title, basis, source, asOf, measure, unit, omissions, cutoff }: {
  nodes: readonly SankeyNodeIn[]; links: readonly SankeyLinkIn[]; title: string; basis: string; source: ChartSource; asOf: string; measure: string; unit: string;
  /** what the flows leave out (said, never hidden) */ omissions: readonly string[]; cutoff?: string | null;
}) {
  const W = 640; const H = 300;
  const check = useMemo(() => sankeyCheck(nodes, links), [nodes, links]);
  const lay = useMemo(() => sankeyLayout(nodes, links, W, H), [nodes, links]);
  const rows = useMemo(() => links.map((l) => ({ from: nodes.find((n) => n.id === l.from)?.label ?? l.from, to: nodes.find((n) => n.id === l.to)?.label ?? l.to, value: l.value })), [links, nodes]);
  const chart = useMemo(() => sankeyChartSpec({ title, basis, sources: [source], asOf, cutoff, unit, measure, omissions: [...omissions],
    summary: `${links.length} flows between ${nodes.length} nodes; ${check.balance.filter((b) => b.role === 'through').every((b) => b.conserved) ? 'every intermediate node conserves its flow' : 'a node does not conserve its flow — see the note'}.` }), [title, basis, source, asOf, cutoff, unit, measure, omissions, links.length, nodes.length, check]);
  return (
    <div className="eye-canvas" data-canvas="sankey">
      <Problems title={title} problems={check.problems} what="the flows break the conservation rule or the drawing's shape." />
      <ChartFrame spec={chart} rows={rows}>
        {check.problems.length > 0 ? undefined : (
          <svg className="eye-canvas-svg eye-canvas-fit" viewBox={`-4 -4 ${W + 8} ${H + 8}`} focusable="false">
            {lay.links.map((l) => <path key={`${l.from}>${l.to}`} d={l.path} className="eye-canvas-band" />)}
            {lay.nodes.map((n) => (
              <g key={n.id} className="eye-canvas-sk-node">
                <rect x={n.x} y={n.y} width={n.w} height={Math.max(1, n.h)} />
                <text x={n.x + (n.x > W / 2 ? -6 : n.w + 6)} y={n.y + n.h / 2 + 4} textAnchor={n.x > W / 2 ? 'end' : 'start'} className="eye-canvas-node-label">{`${clip(n.label, 28)} · ${n.throughput.toLocaleString('en')} ${unit}`}</text>
              </g>
            ))}
          </svg>
        )}
      </ChartFrame>
    </div>
  );
}

/* ───────────────────────── MapCanvas (CMP-064) and its layers (VIZ-16, VIZ-17, VIZ-18) ───────────────────────── */

export interface MapDraw {
  /** the width of a flow line per reference key (px) — a FlowMap's; null = unknown, drawn as a hairline and marked */ widths?: Readonly<Record<string, number | null>>;
  /** the dash of a line per reference key */ dash?: Readonly<Record<string, DashPattern>>;
  /** a choropleth class per area key (null = no data — hatched) */ classes?: Readonly<Record<string, number | null>>;
  /** what the drawing's own legend states (flow widths, classes) */ legend?: ReactNode;
}

export function MapCanvas({ map, chart, rows, draw, width = 720 }: {
  map: MapSpec; chart: ChartSpec; rows: ReadonlyArray<Record<string, string | number | null>>; draw?: MapDraw; width?: number;
}) {
  const features = useMemo(() => map.layers.flatMap((l) => l.features), [map]);
  const b = useMemo(() => boundsOf(features), [features]);
  const extent: Extent | null = useMemo(() => map.extent ?? (b === null ? null : paddedExtent(b)), [map.extent, b]);
  const proj = useMemo(() => (extent === null ? null : equirectangular(extent, width)), [extent, width]);
  const grat = useMemo(() => (extent === null ? null : graticule(extent)), [extent]);
  const bar = useMemo(() => (proj === null ? null : scaleBar(proj, width / 4, map.scale.unit)), [proj, width, map.scale.unit]);
  const hatchId = `${useId().replace(/:/g, '')}-hatch`;
  const problems = map.crs !== 'EPSG:4326' ? [`the map holds ${String(map.crs)}; only EPSG:4326 is drawn`] : [];
  return (
    <div className="eye-canvas" data-canvas="map">
      <p className="eye-canvas-meta">
        EPSG:4326 · equirectangular{proj === null ? '' : `, standard parallel ${proj.standardParallel}°`} · no basemap, no tiles, no coastline or boundary dataset, no network
        {bar === null ? '' : ` · scale bar ${bar.label}`}{extent === null ? '' : ` · extent ${extent.map((v) => Math.round(v * 100) / 100).join(', ')} (W, S, E, N)`}
      </p>
      <Problems title={chart.title} problems={problems} what="this map is not in the register's coordinate system." />
      {features.length === 0 && <p className="eye-canvas-meta" role="note">No declared reference matches this map: nothing is drawn. A data steward declares references on the geographic-reference register.</p>}
      <ChartFrame spec={chart} rows={rows}>
        {proj === null || grat === null || extent === null || problems.length > 0 ? undefined : (
          <svg className="eye-canvas-svg eye-canvas-fit eye-canvas-map" viewBox={`0 0 ${width} ${proj.height + 40}`} focusable="false" direction="ltr">
            <defs>
              <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" className="eye-canvas-hatch" /></pattern>
            </defs>
            <rect x={0} y={0} width={width} height={proj.height} className="eye-canvas-map-frame" />
            {grat.meridians.map((m) => { const [x] = proj.project([m.lon, extent[1]]); return <g key={`m${m.lon}`}><line x1={x} y1={0} x2={x} y2={proj.height} className="eye-canvas-grat" /><text x={x + 3} y={proj.height - 4} className="eye-canvas-grat-label">{m.label}</text></g>; })}
            {grat.parallels.map((p) => { const [, y] = proj.project([extent[0], p.lat]); return <g key={`p${p.lat}`}><line x1={0} y1={y} x2={width} y2={y} className="eye-canvas-grat" /><text x={3} y={y - 3} className="eye-canvas-grat-label">{p.label}</text></g>; })}
            {map.layers.filter((l) => l.kind === 'choropleth').flatMap((l) => l.features).map((f) => {
              const cls = draw?.classes?.[f.key];
              const d = geoPath(f.geometry, proj);
              if (d === null || f.geometry.type !== 'Polygon') return null;
              const ring = f.geometry.coordinates[0]!.slice(0, -1);
              const [cx, cy] = proj.project([ring.reduce((a, q) => a + q[0], 0) / ring.length, ring.reduce((a, q) => a + q[1], 0) / ring.length]);
              const none = cls === null || cls === undefined;
              return (
                <g key={f.key}>
                  <path d={d} className="eye-canvas-area" data-class={none ? 'none' : String(cls)} fill={none ? `url(#${hatchId})` : undefined} />
                  <text x={cx} y={cy} textAnchor="middle" className="eye-canvas-node-label">{clip(f.label, 22)}</text>
                  <text x={cx} y={cy + 15} textAnchor="middle" className="eye-canvas-node-kind">{none ? 'no data' : `class ${cls + 1}`}</text>
                </g>
              );
            })}
            {map.layers.filter((l) => l.kind === 'line' || l.kind === 'flow').flatMap((l) => l.features.map((f) => ({ f, flow: l.kind === 'flow' }))).map(({ f, flow }) => {
              const d = geoPath(f.geometry, proj); const w = flow ? draw?.widths?.[f.key] : undefined;
              return d === null ? null : (
                <g key={f.key} className="eye-canvas-route" data-unknown={flow && (w === null || w === undefined) ? 'true' : undefined}>
                  <path d={d} fill="none" strokeWidth={flow ? (w ?? 1) : 2} strokeDasharray={DASH[draw?.dash?.[f.key] ?? 'solid']} />
                </g>
              );
            })}
            {map.layers.filter((l) => l.kind === 'point').flatMap((l) => l.features).map((f) => {
              if (f.geometry.type !== 'Point') return null;
              const [x, y] = proj.project(f.geometry.coordinates);
              return (
                <g key={f.key} className="eye-canvas-place" data-chokepoint={f.chokepointKey !== null ? 'true' : undefined}>
                  {f.chokepointKey !== null ? <path d={`M${x},${y - 7} L${x + 7},${y} L${x},${y + 7} L${x - 7},${y} Z`} /> : <circle cx={x} cy={y} r={5} />}
                  <text x={x + 9} y={y + 4} className="eye-canvas-node-label">{clip(f.label, 30)}</text>
                </g>
              );
            })}
            {bar !== null && (
              <g className="eye-canvas-scalebar" transform={`translate(12, ${proj.height + 14})`}>
                <line x1={0} y1={8} x2={bar.px} y2={8} /><line x1={0} y1={3} x2={0} y2={13} /><line x1={bar.px} y1={3} x2={bar.px} y2={13} />
                <text x={bar.px + 8} y={12} className="eye-canvas-grat-label">{`${bar.label} (true along ${proj.standardParallel}°)`}</text>
              </g>
            )}
          </svg>
        )}
      </ChartFrame>
      {draw?.legend}
    </div>
  );
}

const refsSource = (asOf: string): ChartSource => ({ read: 'graph.geo_layer', label: `the geographic-reference register, as of ${asOf}` });

/** VIZ-16 — the declared places and routes (CRS, time, scale, source, uncertainty, the boundaries stated as absent). */
export function GeospatialMap({ refs, title, asOf, source, uncertaintyM, dash }: {
  refs: readonly GeoReference[]; title: string; asOf: string; source?: ChartSource; uncertaintyM?: Readonly<Record<string, number>>; dash?: Readonly<Record<string, DashPattern>>;
}) {
  const active = useMemo(() => refs.filter((r) => r.state === 'active'), [refs]);
  const map: MapSpec = useMemo(() => ({ crs: 'EPSG:4326', projection: 'equirectangular', scale: { bar: true, unit: 'km' },
    layers: [{ key: 'routes', label: 'Routes', kind: 'line', features: active.filter((r) => r.geometry.type === 'LineString') }, { key: 'places', label: 'Places', kind: 'point', features: active.filter((r) => r.geometry.type === 'Point') }] }), [active]);
  const legend: LegendEntry[] = [
    { key: 'chokepoint', label: 'Chokepoint (diamond)', dash: 'solid', marker: 'diamond', directLabel: true },
    { key: 'place', label: 'Port or site (circle)', dash: 'solid', marker: 'circle', directLabel: true },
    { key: 'route', label: 'Route (line)', dash: 'solid', marker: 'none', directLabel: true },
    ...(dash !== undefined && Object.values(dash).includes('dashed') ? [{ key: 'alt', label: 'Alternative route (dashed)', dash: 'dashed' as const, marker: 'none' as const, directLabel: true }] : []),
  ];
  const chart = mapChartSpec({ kind: 'geospatial_map', title, basis: 'declared geographic references — positions typed by a named data steward, never imported', sources: [source ?? refsSource(asOf)], asOf, legend,
    summary: `${active.length} declared reference(s): ${active.filter((r) => r.geometry.type === 'Point').length} place(s) and ${active.filter((r) => r.geometry.type === 'LineString').length} route(s). Each row gives the coordinates, the declared positional uncertainty, the source and the licence.` });
  return <MapCanvas map={map} chart={chart} rows={mapRows(active, undefined, uncertaintyM)} draw={{ dash }} />;
}

/** VIZ-18 — routes drawn by a measured movement: direction (the route's declared order), units, period, source, coverage — the width
 *  ALWAYS with its legend; a route with no value is a marked hairline, never omitted. */
export function FlowMap({ refs, values, measure, period, coverage, title, asOf, source, uncertaintyM, dash }: {
  refs: readonly GeoReference[]; values: Readonly<Record<string, number | null>>; measure: { measure: string; unit: string };
  period: string; coverage: string; title: string; asOf: string; source: ChartSource; uncertaintyM?: Readonly<Record<string, number>>; dash?: Readonly<Record<string, DashPattern>>;
}) {
  const active = useMemo(() => refs.filter((r) => r.state === 'active'), [refs]);
  const lines = active.filter((r) => r.geometry.type === 'LineString'); const points = active.filter((r) => r.geometry.type === 'Point');
  const fw = useMemo(() => flowWidths(lines.map((l) => ({ key: l.key, value: values[l.key] ?? null }))), [lines, values]);
  const map: MapSpec = { crs: 'EPSG:4326', projection: 'equirectangular', scale: { bar: true, unit: 'km' },
    layers: [{ key: 'flows', label: 'Flows', kind: 'flow', features: lines, measure }, { key: 'places', label: 'Places', kind: 'point', features: points }] };
  const legend: LegendEntry[] = [
    { key: 'flow', label: `Flow — line width ∝ ${measure.measure} (${measure.unit})`, dash: 'solid', marker: 'none', directLabel: true },
    { key: 'unknown', label: 'No value for the period (hairline, dotted)', dash: 'dotted', marker: 'none', directLabel: true },
    { key: 'chokepoint', label: 'Chokepoint (diamond)', dash: 'solid', marker: 'diamond', directLabel: true },
  ];
  const chart = mapChartSpec({ kind: 'flow_map', title, basis: `${measure.measure} along declared routes (direction: each route's declared order), over ${period}`, sources: [source, refsSource(asOf)], asOf,
    legend, extraUnits: [measure], summary: `${lines.length} route(s) with ${measure.measure} over ${period}; coverage: ${coverage}. The value of each route is in the table; widths are linear from the legend's reference widths.` });
  const vals: Record<string, string> = {};
  for (const l of lines) vals[l.key] = values[l.key] === null || values[l.key] === undefined ? `no value for ${period}` : `${values[l.key]!.toLocaleString('en')} ${measure.unit}`;
  const dashFor: Record<string, DashPattern> = { ...(dash ?? {}) };
  for (const l of lines) if (fw.widths[l.key] === null) dashFor[l.key] = 'dotted';
  return (
    <MapCanvas map={map} chart={chart} rows={mapRows([...lines, ...points], vals, uncertaintyM)} draw={{ widths: fw.widths, dash: dashFor,
      legend: (
        <figure className="eye-canvas-legend" aria-label={`${title}: flow width legend`}>
          <figcaption className="eye-canvas-meta">Width legend — {measure.measure} ({measure.unit}), {period}; coverage: {coverage}</figcaption>
          <svg viewBox={`0 0 260 ${fw.legend.length * 18 + 4}`} className="eye-canvas-legend-svg" role="img" aria-label={fw.legend.map((x) => `${x.value.toLocaleString('en')} ${measure.unit}: ${x.px} px`).join('; ') || 'no measured value'}>
            {fw.legend.map((x, i) => (
              <g key={x.value} className="eye-canvas-route"><path d={`M4,${i * 18 + 10} L80,${i * 18 + 10}`} strokeWidth={x.px} fill="none" /><text x={90} y={i * 18 + 14} className="eye-canvas-grat-label">{`${x.value.toLocaleString('en')} ${measure.unit}`}</text></g>
            ))}
          </svg>
        </figure>
      ) }} />
  );
}

/** VIZ-17 — a NORMALISED rate per declared area (numerator / denominator — never an absolute count by area), its class breaks, its missing
 *  data hatched and named, its time and source. A SYNTHETIC specimen until a boundary dataset is admitted (Q4 — the areas are not regions). */
export function Choropleth({ areas, data, rateName, numerator, denominator, period, title, asOf, source, method = 'quantile' }: {
  areas: readonly GeoReference[]; data: readonly ChoroIn[]; rateName: string; numerator: string; denominator: string; period: string; title: string; asOf: string; source: ChartSource;
  method?: 'quantile' | 'equal';
}) {
  const rates = useMemo(() => choroplethRates(data), [data]);
  const breaks = useMemo(() => choroplethBreaks(rates.map((r) => r.rate), 4, method), [rates, method]);
  const classes: Record<string, number | null> = {}; const vals: Record<string, string> = {};
  for (const r of rates) { classes[r.key] = classOf(r.rate, breaks); vals[r.key] = r.rate === null ? `missing — ${r.missing}` : `${(r.rate * 100).toFixed(2)} % (class ${classOf(r.rate, breaks)! + 1} of ${breaks.length})`; }
  const map: MapSpec = { crs: 'EPSG:4326', projection: 'equirectangular', scale: { bar: true, unit: 'km' }, layers: [{ key: 'areas', label: 'Areas', kind: 'choropleth', features: [...areas], measure: { measure: rateName, unit: 'rate (%)' }, specimen: 'specimen' in source }] };
  const legend: LegendEntry[] = [
    ...breaks.map((b, i) => ({ key: `c${i}`, label: `Class ${i + 1}: up to ${(b * 100).toFixed(2)} %`, dash: 'solid' as const, marker: (['square', 'circle', 'triangle', 'diamond'] as const)[i % 4]!, directLabel: true })),
    { key: 'missing', label: 'Missing data (hatched)', dash: 'dotted', marker: 'cross', directLabel: true },
  ];
  const chart = mapChartSpec({ kind: 'choropleth', title, basis: `${rateName} = ${numerator} ÷ ${denominator}, per declared area, over ${period} — a normalised rate, never an absolute count by area`, sources: [source], asOf,
    legend, extraUnits: [{ measure: rateName, unit: 'rate (%)' }], uncertainty: `Classes by ${method === 'quantile' ? 'quantile (equal counts)' : 'equal intervals'}; an area with no numerator or no denominator is MISSING (hatched), never zero.`,
    summary: `${areas.length} area(s); ${rates.filter((r) => r.rate === null).length} with missing data. Breaks: ${breaks.map((b) => `${(b * 100).toFixed(2)} %`).join(', ') || 'none'}.` });
  return (
    <MapCanvas map={map} chart={chart} rows={mapRows(areas, vals)} draw={{ classes,
      legend: <p className="eye-canvas-meta">Classes: {breaks.map((b, i) => `class ${i + 1} up to ${(b * 100).toFixed(2)} %`).join('; ') || 'no rate'} · a deeper shade of the one uncertainty token = a higher class, each area labelled with its class · hatched = missing data.</p> }} />
  );
}
