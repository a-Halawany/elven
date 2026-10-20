/**
 * B82 §GM — the canvases' contract as pure functions (lib/canvas-b82.ts, lib/canvas-specs-b82.ts): the bound (UX-ADR-016), the
 * deterministic layered layout, the keyboard traversal, the tree, the treemap, the sankey's conservation rule, the map's projection, scale
 * bar and graticule, the flow widths and their legend, the choropleth's normalised rates — and every canvas kind's ChartSpec passing §0's
 * grammar. The geometry check is proved equal to the register's SQL on the shared cases (canvas-b82.fixtures.json; the SQL half is
 * phase6-geography-b82 GM6). Every figure is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertGrammar, LIBRARY_B82, type GraphEdge, type GraphNode, type GraphSpec } from './b82-seams';
import {
  GRAPH_CEILING, boundsOf, choroplethBreaks, choroplethRates, classOf, describeNode, equirectangular, flowWidths, geometryProblem, geometryText, graphProblems,
  graphRows, graticule, layeredLayout, mirrorLayout, paddedExtent, readingOrder, sankeyCheck, sankeyLayout, scaleBar, traverse, treeLayout, treeProblems,
  treemapLayout, treemapProblems, type TreeIn,
} from './canvas-b82';
import {
  CHOROPLETH_SPECIMEN, GEO_SPECIMEN, SANKEY_SPECIMEN, SPECIMEN_AS_OF, SPECIMEN_SOURCE, TREEMAP_SPECIMEN, corridorMapOf, dependencyNetworkOf, geoReferenceOf,
  flowMapChartSpec, graphChartSpec, knowledgeGraphOf, mapChartSpec, mapRows, provenanceGraphOf, sankeyChartSpec, strategyGraphOf, strategyHierarchyOf, treeChartSpec,
  treemapChartSpec, watermarkOf, watermarkText, routeFlows, transitSeriesOf, transitWindow,
} from './canvas-specs-b82';
import type { EdgeRow, EntityRow, StrategyRow } from './graph';
import type { ExplainView } from './provenance-b50';
import type { Uncertainty } from './supply-b33';

const WEB = join(__dirname, '..');
const n = (id: string, kind = 'entity'): GraphNode => ({ id, kind, label: id.toUpperCase() });
const e = (id: string, from: string, to: string, type = 'supplies'): GraphEdge => ({ id, from, to, type, directed: true });
const SPEC = (over: Partial<GraphSpec> = {}): GraphSpec => ({
  question: 'Who supplies the Regensburg line, two hops out?', caps: { nodes: 10, depth: 3 },
  nodes: [n('a'), n('b'), n('c'), n('d')], edges: [e('1', 'a', 'b'), e('2', 'a', 'c'), e('3', 'b', 'd'), e('4', 'c', 'd')],
  watermark: { absent: 'computed on read (SYNTHETIC)' }, ...over,
});

describe('UX-ADR-016 / CMP-063 — the bound: a graph view answers a stated question under caps, or is not drawn', () => {
  it('a bounded view has no problem', () => { expect(graphProblems(SPEC())).toEqual([]); });
  it('no question, no caps, caps over the ceiling, an answer over its caps — each refused in words (no hairball)', () => {
    expect(graphProblems(SPEC({ question: '' }))[0]).toMatch(/^question: a graph view answers a stated question/);
    expect(graphProblems(SPEC({ caps: { nodes: 0, depth: 1 } }))[0]).toMatch(/^caps: the view states its node and depth caps/);
    expect(graphProblems(SPEC({ caps: { nodes: GRAPH_CEILING.nodes + 1, depth: 2 } }))).toContain(`caps: ${GRAPH_CEILING.nodes + 1} nodes is over the library's ceiling of ${GRAPH_CEILING.nodes} — narrow the question`);
    const big = SPEC({ caps: { nodes: 3, depth: 3 } });
    expect(graphProblems(big)).toEqual(['nodes: 4 nodes exceed this view\'s cap of 3 — the answer is not drawn; narrow the question (fewer hops, one relation type)']);
    expect(graphProblems(SPEC({ caps: { nodes: 10, depth: 3, edges: 2 } }))).toEqual(['edges: 4 edges exceed this view\'s cap of 2']);
  });
  it('the depth cap counts the drawn layers; ids are unique; every edge joins drawn nodes; the watermark is stated or declared absent', () => {
    expect(graphProblems(SPEC({ caps: { nodes: 10, depth: 1 } }))).toEqual(['depth: the answer spans 3 layers, over this view\'s depth cap of 1']);
    expect(graphProblems(SPEC({ nodes: [n('a'), n('a'), n('b'), n('c'), n('d')] }))).toContain('nodes: the id "a" is used twice');
    expect(graphProblems(SPEC({ edges: [e('9', 'a', 'zz')] }))).toEqual(['edges: 1 edge(s) name a node the view does not carry (e.g. 9)']);
    expect(graphProblems(SPEC({ watermark: { absent: ' ' } }))).toEqual(['watermark: the projection the answer was served from is stated, or its absence is declared with its reason']);
    expect(graphProblems(null as unknown as GraphSpec).length).toBeGreaterThan(0);   // never throws
  });
});

describe('CMP-063 — the deterministic layered layout', () => {
  it('the same input gives the same layout; layers by longest path; no two nodes overlap', () => {
    const a = layeredLayout(SPEC().nodes, SPEC().edges); const b = layeredLayout(SPEC().nodes, SPEC().edges);
    expect(b).toEqual(a);
    expect(a.byLayer).toEqual([['a'], ['b', 'c'], ['d']]);
    expect(a.layers).toBe(3);
    const boxes = a.nodes.map((x) => [x.x, x.y, x.x + x.w, x.y + x.h] as const);
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const [p, q] = [boxes[i]!, boxes[j]!];
      expect(p[2] <= q[0] || q[2] <= p[0] || p[3] <= q[1] || q[3] <= p[1], `${i}/${j} overlap`).toBe(true);
    }
    expect(a.width).toBeGreaterThan(0); expect(a.height).toBeGreaterThan(0);
  });
  it('a cycle is broken deterministically and the reversed relation named; a declared rank (a supply tier) fixes the layer', () => {
    const c = layeredLayout([n('a'), n('b'), n('c')], [e('1', 'a', 'b'), e('2', 'b', 'c'), e('3', 'c', 'a')]);
    expect(c.reversed).toEqual(['3']);
    expect(c.byLayer).toEqual([['a'], ['b'], ['c']]);
    const r = layeredLayout([n('x'), n('y'), n('z')], [e('1', 'x', 'z')], { rank: (v) => ({ x: 0, y: 0, z: 2 } as Record<string, number>)[v.id] ?? null });
    expect(r.byLayer).toEqual([['x', 'y'], [], ['z']]);
  });
  it('the barycentre sweeps untangle a crossing (stable ties); the reading order is layer by layer', () => {
    const nodes = [n('a'), n('b'), n('c'), n('d')];
    const l = layeredLayout(nodes, [e('1', 'a', 'd'), e('2', 'b', 'c')]);
    expect(l.byLayer).toEqual([['a', 'b'], ['d', 'c']]);
    expect(readingOrder(l)).toEqual(['a', 'b', 'd', 'c']);
  });
  it('the RTL mirror keeps every node inside the drawing and reverses the columns', () => {
    const l = layeredLayout(SPEC().nodes, SPEC().edges); const m = mirrorLayout(l);
    expect(m.nodes.find((x) => x.id === 'a')!.x).toBe(l.width - l.nodes.find((x) => x.id === 'a')!.x - l.nodes[0]!.w);
    expect(Math.min(...m.nodes.map((x) => x.x))).toBeGreaterThanOrEqual(0);
    expect(m.nodes.find((x) => x.id === 'd')!.x).toBeLessThan(m.nodes.find((x) => x.id === 'a')!.x);
  });
});

describe('CMP-063 — keyboard traversal node by node', () => {
  const l = layeredLayout(SPEC().nodes, SPEC().edges);
  it('Home / End; Right follows a relation, Left follows one back; Down / Up within a column; other keys move nothing', () => {
    expect(traverse(l, null, 'Home')).toBe('a');
    expect(traverse(l, 'a', 'End')).toBe('d');
    expect(traverse(l, 'a', 'ArrowRight')).toBe('b');
    expect(traverse(l, 'b', 'ArrowRight')).toBe('d');
    expect(traverse(l, 'd', 'ArrowLeft')).toBe('b');
    expect(traverse(l, 'b', 'ArrowDown')).toBe('c');
    expect(traverse(l, 'c', 'ArrowDown')).toBeNull();
    expect(traverse(l, 'c', 'ArrowUp')).toBe('b');
    expect(traverse(l, 'd', 'ArrowRight')).toBeNull();
    expect(traverse(l, 'a', 'Tab')).toBeNull();
    expect(traverse(l, null, 'ArrowDown')).toBe('a');
  });
  it('right-to-left swaps the two arrows; the announcement names the node and every connection', () => {
    expect(traverse(l, 'a', 'ArrowLeft', true)).toBe('b');
    expect(describeNode(SPEC(), 'b')).toBe('B (entity) · 1 outgoing: supplies → D · 1 incoming: supplies ← A');
    expect(describeNode(SPEC(), 'a')).toMatch(/2 outgoing: supplies → B; supplies → C · no incoming connection$/);
  });
  it('the table alternative lists every relation and every unconnected node', () => {
    const rows = graphRows({ nodes: [...SPEC().nodes, n('lone')], edges: SPEC().edges });
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ from: 'A (entity)', relation: 'supplies', to: 'B (entity)', direction: 'directed', at: null, evidence: null });
    expect(rows[4]).toMatchObject({ from: 'LONE (entity)', relation: 'no connection in this answer' });
  });
});

describe('VIZ-13 / VIZ-14 / VIZ-15 / VIZ-31 — the adapters build bounded views from today\'s reads', () => {
  const ENT: EntityRow[] = [{ entity_id: 'e1', entity_type: 'organisation', canonical_name: 'Ningbo Magnets (SYNTHETIC)' }, { entity_id: 'e2', entity_type: 'site', canonical_name: 'Regensburg (SYNTHETIC)' }] as EntityRow[];
  const EDGES: EdgeRow[] = [{ edge_id: 'x1', subject_entity_id: 'e1', predicate: 'supplies', object_entity_id: 'e2', valid_from: '2026-01-01T00:00:00Z', evidence_object_id: 'ev1' }] as EdgeRow[];
  it('the knowledge graph: identity, typed directed edges with valid time and evidence, the projection watermark', () => {
    const g = knowledgeGraphOf({ question: 'Who supplies Regensburg, two hops out?', edges: EDGES, entities: ENT, depth: 2, projection: null });
    expect(graphProblems(g)).toEqual([]);
    expect(g.edges[0]).toEqual({ id: 'x1', from: 'e1', to: 'e2', type: 'supplies', directed: true, at: '2026-01-01T00:00:00Z', evidence: ['ev1'] });
    expect(g.nodes.map((x) => x.kind)).toEqual(['organisation', 'site']);
    expect(watermarkText(g.watermark)).toMatch(/^No projection watermark: this read carries no projection block/);
    expect(watermarkText(watermarkOf({ revision: 7, verified_at: '2026-10-19T00:00:00Z', lag_events: 2, degraded: true, label: 'withdrawn', condition: 'withdrawn' } as never)))
      .toBe('Projection revision 7, verified 2026-10-19T00:00:00Z, 2 event(s) behind — DEGRADED (withdrawn).');
  });
  it('the Strategy Graph: types, status, verification, what each rests on (entities as evidence); the hierarchy has one stated root', () => {
    const rows = [
      { strategy_object_id: 's1', object_type: 'OBJ', object_version: 1, title: 'Keep the line running', status: 'active', verification_state: 'not_applicable', updated_at: '2026-10-01T00:00:00Z', dependencies: [{ dependency_id: 'd1', depends_on_kind: 'strategy', depends_on_id: 's2', rationale: 'rests on supply' }] },
      { strategy_object_id: 's2', object_type: 'ASU', object_version: 2, title: 'Magnets arrive weekly', status: 'active', verification_state: 'unverified', updated_at: '2026-10-01T00:00:00Z', dependencies: [{ dependency_id: 'd2', depends_on_kind: 'entity', depends_on_id: 'e1', rationale: 'the supplier' }] },
    ] as StrategyRow[];
    const g = strategyGraphOf(rows, ENT);
    expect(graphProblems(g)).toEqual([]);
    expect(g.nodes.map((x) => x.kind)).toEqual(['objective', 'assumption', 'entity (evidence it rests on)']);
    expect(g.nodes[1]!.label).toBe('Magnets arrive weekly · active · UNVERIFIED');
    const h = strategyHierarchyOf(rows);
    expect(treeProblems(h)).toEqual([]);
    expect(h.map((x) => [x.id, x.parent])).toEqual([['root', null], ['s1', 's2'], ['s2', 'root']]);
    const cyc = strategyHierarchyOf([{ ...rows[0]!, dependencies: [{ dependency_id: 'a', depends_on_kind: 'strategy', depends_on_id: 's2', rationale: 'x' }] }, { ...rows[1]!, dependencies: [{ dependency_id: 'b', depends_on_kind: 'strategy', depends_on_id: 's1', rationale: 'y' }] }]);
    expect(treeProblems(cyc)).toEqual([]);
  });
  it('the dependency network: tiers as ranks, single sources and alternatives stated, an inferred dependency dashed until validated', () => {
    const u = { tiers: [{ tier: 1 }, { tier: 2 }], coverage: { sites: 3, declared: 2, validated: 0, inferred: 1 },
      sites: [{ id: 'line', tier: 0, name: 'Regensburg line', basis: 'declared', entity_id: null }, { id: 't1', tier: 1, name: 'Ningbo', basis: 'declared', entity_id: null }, { id: 't2', tier: 2, name: 'Baotou', basis: 'declared', entity_id: null }],
      routes: [{ id: 'r1', from: 't1', to: 'line', material: 'magnets', mode: 'sea', via: [], lead_days: 38 }, { id: 'r2', from: 't2', to: 't1', material: 'oxide', mode: null, via: [], lead_days: null }] } as unknown as Uncertainty;
    const net = dependencyNetworkOf(u, [{ inference_id: 'i1', state: 'proposed', proposed_site: 'hidden', behind_site: 't2', behind_tier: 2, material: 'ore', evidence: [] } as never]);
    expect(graphProblems(net)).toEqual([]);
    expect(net.rank).toEqual({ line: 3, t1: 2, t2: 1, hidden: 0 });
    expect(net.nodes.find((x) => x.id === 'line')!.label).toBe('Regensburg line · single source');
    expect(net.edges.find((x) => x.id === 'inf:i1')).toMatchObject({ from: 'hidden', to: 't2', type: 'inferred ore (proposed)' });
    expect(layeredLayout(net.nodes, net.edges, { rank: (v) => net.rank[v.id] ?? null }).byLayer).toEqual([['hidden'], ['t2'], ['t1'], ['line']]);
  });
  it('the provenance graph: every node of graph.explain drawn (never collapsed), parents as input links', () => {
    const v = { ref: 'DPK:p@1', root: 'p', method: 'b50-pv-explain-1', asOf: '2026-10-19T00:00:00Z', product: { type: 'DPK', id: 'p0000000-x', version: 1, digest: null, label: null, outcome: null },
      nodes: [{ nodeId: 'p', kind: 'product', ref: 'DPK:p@1', label: 'Package', outcome: 'ok', at: null, actor: null, parents: ['c'] }, { nodeId: 'c', kind: 'claim', ref: 'CLM:c@2', label: 'Claim', outcome: 'corrected', at: null, actor: 'K. Müller', parents: ['ev'] },
        { nodeId: 'ev', kind: 'evidence', ref: 'EVD:ev@1', label: 'Evidence', outcome: 'ok', at: null, actor: null, parents: [] }, { nodeId: 's', kind: 'signature', ref: 'SIG:s', label: 'Signature', outcome: 'ok', at: null, actor: 'L. Brandt', parents: ['p'] }],
      outcomes: {}, boundaries: {}, gaps: [], truncated: false, incomplete: false, examined: 4, bounds: { max_depth: 8, max_nodes: 200 }, carried: [], forward: { preview: false } } as unknown as ExplainView;
    const g = provenanceGraphOf(v);
    expect(graphProblems(g)).toEqual([]);
    expect(g.nodes).toHaveLength(4);
    expect(g.edges.map((x) => x.id).sort()).toEqual(['c>p', 'ev>c', 'p>s']);
    expect(g.nodes[1]!.label).toBe('Claim · CORRECTED · K. Müller');
  });
  it('the provenance graph: a node graph.explain lists once per path (a correction reached twice) is ONE node, its parents united — drawn, not refused', () => {
    const corr = { nodeId: 'inv', kind: 'correction', ref: 'invalidation:inv', label: 'impact recorded', outcome: 'corrected', at: null, actor: null, parents: [] as string[] };
    const v = { ref: 'EVD:e@2', root: 'e', method: 'b50-pv-explain-1', asOf: '2026-10-19T00:00:00Z', product: { type: 'EVD', id: 'e0000000-x', version: 2, digest: null, label: null, outcome: null },
      nodes: [{ nodeId: 'e', kind: 'evidence', ref: 'EVD:e@2', label: 'Evidence v2', outcome: 'ok', at: null, actor: null, parents: ['e1', 'inv'] }, { ...corr, parents: ['e1'] },
        { nodeId: 'e1', kind: 'evidence', ref: 'EVD:e@1', label: 'Evidence v1', outcome: 'corrected', at: null, actor: null, parents: [] }, { ...corr, parents: ['src'] },
        { nodeId: 'src', kind: 'source', ref: 'SRC:s@1', label: 'Source', outcome: 'ok', at: null, actor: null, parents: [] }],
      outcomes: {}, boundaries: {}, gaps: [], truncated: false, incomplete: false, examined: 5, bounds: { max_depth: 8, max_nodes: 200 }, carried: [], forward: { preview: false } } as unknown as ExplainView;
    const g = provenanceGraphOf(v);
    expect(graphProblems(g)).toEqual([]);
    expect(g.nodes.map((n) => n.id)).toEqual(['e', 'inv', 'e1', 'src']);
    expect(g.edges.map((x) => x.id).sort()).toEqual(['e1>e', 'e1>inv', 'inv>e', 'src>inv']);
  });
});

describe('VIZ-20 / VIZ-21 / VIZ-19 — the tree, the treemap, the sankey', () => {
  const T: TreeIn[] = [{ id: 'r', parent: null, label: 'Root', kind: 'scope' }, { id: 'a', parent: 'r', label: 'A', kind: 'k' }, { id: 'b', parent: 'r', label: 'B', kind: 'k' }, { id: 'a1', parent: 'a', label: 'A1', kind: 'k' }];
  it('a hierarchy has one root, known parents and no cycle; the layout centres a parent on its children, pre-order', () => {
    expect(treeProblems(T)).toEqual([]);
    expect(treeProblems([...T, { id: 'r2', parent: null, label: 'R2', kind: 'k' }])[0]).toMatch(/2 roots — a hierarchy has one root/);
    expect(treeProblems([{ id: 'x', parent: 'y', label: 'X', kind: 'k' }, { id: 'y', parent: 'x', label: 'Y', kind: 'k' }])).toContain('no root — a hierarchy names its root');
    const l = treeLayout(T);
    expect(l.preorder).toEqual(['r', 'a', 'a1', 'b']);
    const y = (id: string) => l.nodes.find((x) => x.id === id)!.y;
    expect(y('r')).toBe((y('a') + y('b')) / 2);
    expect(y('a')).toBe(y('a1'));
  });
  it('the treemap: each cell\'s area is its share of the whole; groups nest their parts; a negative part is refused', () => {
    const t = treemapLayout(TREEMAP_SPECIMEN, 640, 360);
    const total = TREEMAP_SPECIMEN.reduce((a, i) => a + i.value, 0);
    expect(t.total).toBe(total);
    for (const c of t.cells) expect(Math.abs((c.w * c.h) / (640 * 360) - c.value / total)).toBeLessThan(0.002);
    for (const c of t.cells) { const g = t.groups.find((x) => x.group === c.group)!; expect(c.x >= g.x - 0.01 && c.y >= g.y - 0.01 && c.x + c.w <= g.x + g.w + 0.01 && c.y + c.h <= g.y + g.h + 0.01).toBe(true); }
    expect(t.groups.map((g) => g.group)).toEqual(['Supply risk', 'Market risk', 'Operations']);
    expect(treemapLayout(TREEMAP_SPECIMEN, 640, 360)).toEqual(t);
    expect(treemapProblems([{ id: 'n', label: 'N', value: -3, group: 'g' }])[0]).toMatch(/is negative \(-3\) — a part-to-whole drawing cannot show it/);
  });
  it('the sankey: the conservation rule holds on the specimen; a leak, a cycle and a zero flow are refused in words; bands are proportional', () => {
    const c = sankeyCheck(SANKEY_SPECIMEN.nodes, SANKEY_SPECIMEN.links);
    expect(c.problems).toEqual([]);
    expect(c.balance.find((b) => b.node === 'rtm')).toMatchObject({ inflow: 200, outflow: 200, role: 'through', conserved: true });
    const leak = sankeyCheck(SANKEY_SPECIMEN.nodes, SANKEY_SPECIMEN.links.map((l) => (l.from === 'rtm' ? { ...l, value: 150 } : l)));
    expect(leak.problems).toEqual(['Rotterdam (SYNTHETIC): 200 arrive and 150 leave — not conserved (residual 50); declare the loss or the omission']);
    expect(sankeyCheck([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], [{ from: 'a', to: 'b', value: 0 }]).problems[0]).toMatch(/has no positive value/);
    expect(sankeyCheck([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], [{ from: 'a', to: 'b', value: 5 }, { from: 'b', to: 'a', value: 5 }]).problems).toContain('the flows form a cycle — a sankey draws an acyclic transfer');
    const lay = sankeyLayout(SANKEY_SPECIMEN.nodes, SANKEY_SPECIMEN.links, 640, 300);
    const suez = lay.links.find((l) => l.from === 'ningbo' && l.to === 'suez')!; const cape = lay.links.find((l) => l.from === 'ningbo' && l.to === 'cape')!;
    expect(suez.width / cape.width).toBeCloseTo(120 / 80, 5);
    expect(lay.nodes.find((x) => x.id === 'rgb')!.column).toBe(3);
  });
});

describe('CMP-064 / VIZ-16 / VIZ-17 / VIZ-18 — the map: EPSG:4326, equirectangular, a scale bar, no basemap', () => {
  const fx = JSON.parse(readFileSync(join(WEB, 'lib', 'canvas-b82.fixtures.json'), 'utf8')) as { cases: Array<{ name: string; geometry: unknown; problem: string | null }> };
  it('the geometry check mirrors the register\'s SQL on every shared case', () => {
    expect(fx.cases.length).toBeGreaterThanOrEqual(15);
    for (const c of fx.cases) {
      const p = geometryProblem(c.geometry);
      if (c.problem === null) expect(p, c.name).toBeNull(); else expect(p ?? '', c.name).toContain(c.problem);
    }
  });
  it('the projection maps the extent onto the drawing; distance per pixel is true on the standard parallel; the scale bar is a nice length', () => {
    const ext = paddedExtent(boundsOf(GEO_SPECIMEN)!);
    const p = equirectangular(ext, 720);
    expect(p.project([ext[0], ext[3]])).toEqual([0, 0]);
    const [x, y] = p.project([ext[2], ext[1]]);
    expect(Math.abs(x - 720)).toBeLessThan(0.02); expect(Math.abs(y - p.height)).toBeLessThan(0.02);
    expect(p.kmPerPx).toBeCloseTo(111.32 / p.k, 9);
    const bar = scaleBar(p, 180);
    expect([1, 2, 5].some((m) => [1, 10, 100, 1000, 10000].some((e10) => bar.length === m * e10))).toBe(true);
    expect(bar.px).toBeLessThanOrEqual(180);
    expect(scaleBar(p, 180, 'nmi').label).toMatch(/nautical miles$/);
  });
  it('the graticule labels its lines; the padded extent stays on the globe; a position reads in words', () => {
    const g = graticule([0, 40, 30, 50]);
    expect(g.step).toBe(5);
    expect(g.meridians.map((m) => m.label)).toEqual(['0°', '5°E', '10°E', '15°E', '20°E', '25°E', '30°E']);
    expect(g.parallels[0]!.label).toBe('40°N');
    const pe = paddedExtent([178, 88, 180, 90]);
    expect(pe[2]).toBe(180); expect(pe[3]).toBe(90); expect(pe[0]).toBeGreaterThanOrEqual(-180); expect(pe[1]).toBeGreaterThanOrEqual(-90);
    expect(geometryText({ type: 'Point', coordinates: [43.33, 12.58] })).toBe('12.58° N, 43.33° E');
    expect(geometryText({ type: 'Point', coordinates: [-70.5, -33.4] })).toBe('33.4° S, 70.5° W');
  });
  it('flow widths are linear in the value with a legend of reference widths; an unknown value is marked, never a width of zero', () => {
    const f = flowWidths([{ key: 'suez', value: 40 }, { key: 'cape', value: 20 }, { key: 'none', value: null }]);
    expect(f.widths).toEqual({ suez: 12, cape: 6.75, none: null });
    expect(f.legend.map((x) => x.value)).toEqual([10, 20, 40]);
    expect(flowWidths([{ key: 'x', value: null }]).legend).toEqual([]);
  });
  it('the choropleth: a rate needs its denominator (missing data named, never zero); quantile breaks; classes', () => {
    const r = choroplethRates(CHOROPLETH_SPECIMEN.data);
    expect(r.map((x) => x.rate)).toEqual([0.03, 0.06, null]);
    expect(r[2]!.missing).toBe('no denominator recorded');
    expect(choroplethRates([{ key: 'z', numerator: 3, denominator: 0 }])[0]!.missing).toBe('the denominator is zero — no rate');
    const b = choroplethBreaks(r.map((x) => x.rate), 4);
    expect(b).toEqual([0.03, 0.06]);
    expect(classOf(0.03, b)).toBe(0); expect(classOf(0.06, b)).toBe(1); expect(classOf(null, b)).toBeNull();
    expect(choroplethBreaks([1, 2, 3, 4], 2, 'equal')).toEqual([2.5, 4]);
  });
  it('the corridor map from the layer: points, lines (or flows) and areas in their own layers; a retired reference is not drawn', () => {
    const refs = [...GEO_SPECIMEN, { ...GEO_SPECIMEN[0]!, key: 'gone', state: 'retired' as const }];
    const m = corridorMapOf(refs);
    expect(m.layers.map((l) => [l.key, l.kind, l.features.length])).toEqual([['routes', 'line', 2], ['places', 'point', 4]]);
    expect(corridorMapOf(GEO_SPECIMEN, { measure: { measure: 'transits', unit: 'vessels per day' } }).layers[0]!.kind).toBe('flow');
    const row = geoReferenceOf({ reference_id: 'r', version: 2, key: 'k', label: 'L', geometry: { type: 'Point', coordinates: [1, 2] }, source_statement: 's', licence_statement: 'l', linked: { type: 'ENT', id: 'e' }, chokepoint_key: null, declared_by: 'p', declared_at: 't', state: 'retired' });
    expect(row).toMatchObject({ referenceId: 'r', version: 2, crs: 'EPSG:4326', linked: { type: 'ENT', id: 'e' }, state: 'retired' });
    expect(mapRows([GEO_SPECIMEN[0]!], { 'chokepoint.bab-el-mandeb': '41 vessels' })[0]).toMatchObject({ kind: 'chokepoint (portwatch:chokepoint4)', position: '12.58° N, 43.33° E', value: '41 vessels' });
  });
});

describe('VIZ-18 — the corridor\'s flows on /graph/geo: a route by the transits at the first chokepoint it passes', () => {
  it('the series a chokepoint names; the window mean; the routes valued by the stated rule; a route passing none has no value', () => {
    expect(transitSeriesOf('portwatch:chokepoint4')).toBe('portwatch:chokepoint4:n_total');
    const w = transitWindow('portwatch:chokepoint4', Array.from({ length: 40 }, (_, i) => ({ date: `2026-09-${String(i % 30 + 1).padStart(2, '0')}T${String(Math.floor(i / 30)).padStart(2, '0')}:00:00Z`, value: i < 10 ? 999 : 40 })));
    expect(w).toMatchObject({ points: 30 });
    expect(transitWindow('x', [])).toEqual({ chokepointKey: 'x', mean: null, points: 0, from: null, to: null });
    const f = routeFlows(GEO_SPECIMEN, [{ chokepointKey: 'portwatch:chokepoint4', mean: 41.5, points: 30, from: '2026-09-01', to: '2026-09-30' }]);
    expect(f.values).toEqual({ 'route.suez': 41.5, 'route.cape': null });
    expect(f.via['route.suez']).toBe('Bab el-Mandeb (SYNTHETIC)');
    expect(f.coverage).toBe('1 of 2 route(s) pass a chokepoint whose transit series was read (portwatch:chokepoint4)');
    expect(routeFlows(GEO_SPECIMEN, []).period).toBe('no transit series read');
  });
});

describe('every canvas kind declares its grammar (§0 assertGrammar) — the library contract', () => {
  it('graph, knowledge graph, strategy graph, dependency network, provenance graph, tree, treemap, sankey, maps — zero problems', () => {
    const specs = [
      ...(['graph', 'knowledge_graph', 'strategy_graph', 'dependency_network', 'provenance_graph'] as const).map((kind) => graphChartSpec({ kind, title: `A ${kind} (SYNTHETIC)`, basis: 'recorded relations', sources: [SPECIMEN_SOURCE], asOf: SPECIMEN_AS_OF, summary: 'rows' })),
      treeChartSpec({ title: 'Tree', basis: 'recorded', sources: [SPECIMEN_SOURCE], asOf: SPECIMEN_AS_OF, summary: 's', rule: 'r' }),
      treemapChartSpec({ title: 'Treemap', basis: 'b', sources: [SPECIMEN_SOURCE], asOf: SPECIMEN_AS_OF, unit: 'EUR m', measure: 'exposure', summary: 's', rule: 'r' }),
      sankeyChartSpec({ title: 'Sankey', basis: 'b', sources: [SPECIMEN_SOURCE], asOf: SPECIMEN_AS_OF, unit: 'TEU', measure: 'containers', summary: 's', omissions: [] }),
      ...(['map', 'geospatial_map', 'flow_map', 'choropleth'] as const).map((kind) => mapChartSpec({ kind, title: `A ${kind}`, basis: 'declared', sources: [SPECIMEN_SOURCE], asOf: SPECIMEN_AS_OF, summary: 's', extraUnits: [{ measure: 'transits', unit: 'vessels per day' }] })),
    ];
    for (const s of specs) expect(assertGrammar(s), s.kind).toEqual([]);
    // a flow map over a specimen never mixes in the register as a real source; over a read it names both
    const fm = (source: Parameters<typeof flowMapChartSpec>[0]['source']) => flowMapChartSpec({ title: 'Flows', measure: { measure: 'transits', unit: 'vessels per day' }, period: '30 days', coverage: 'two routes', source, asOf: SPECIMEN_AS_OF, routes: 2 });
    expect(assertGrammar(fm(SPECIMEN_SOURCE))).toEqual([]);
    expect(fm(SPECIMEN_SOURCE).sources).toHaveLength(1);
    const real = fm({ read: 'portwatch:chokepoint4:n_total', label: 'PortWatch transits' });
    expect(assertGrammar(real)).toEqual([]);
    expect(real.sources).toHaveLength(2);
    expect(new Set(specs.map((s) => s.kind)).size).toBe(12);
  });
  it('LIBRARY_B82 names this part\'s file and its twelve exports; the component file exports each of them', () => {
    expect(LIBRARY_B82.canvas.files).toEqual(['components/canvas.tsx']);
    const src = readFileSync(join(WEB, 'components', 'canvas.tsx'), 'utf8');
    for (const name of LIBRARY_B82.canvas.exports) expect(src, name).toMatch(new RegExp(`export function ${name}\\(`));
    expect(src).not.toMatch(/\bfetch\(|https?:\/\/|from ['"](d3|leaflet|mapbox-gl|maplibre-gl|ol)\b|\{z\}\/\{x\}/i);   // D4: no tiles, no network, no library
  });
});
