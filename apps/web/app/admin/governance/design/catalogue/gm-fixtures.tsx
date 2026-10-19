'use client';
/**
 * CP-6 B82 §GM — the catalogue's section for THE GRAPH AND MAP CANVASES (components/canvas.tsx; LIBRARY_B82.canvas): every canvas kind with
 * a SYNTHETIC specimen — the generic GraphCanvas and its refusal of an unbounded view (UX-ADR-016), the knowledge graph, the Strategy Graph,
 * the dependency network, the provenance graph, the hierarchy tree, the treemap, the sankey (a specimen only — no material-flow read exists,
 * D13), the map canvas, the geospatial map, the flow map and the choropleth (a specimen only until a boundary dataset is admitted — Q4).
 * Nothing here calls a server; every value is SYNTHETIC; rendering here is construction evidence (the viz walk reads each table alternative
 * through the accessibility tree).
 */
import { GraphCanvas, KnowledgeGraphView, StrategyGraphView, DependencyNetwork, ProvenanceGraph, HierarchyTree, Treemap, Sankey, MapCanvas, GeospatialMap, FlowMap, Choropleth } from '../../../../../components/canvas';
import { Panel } from '../../../../../components/layers';
import { LIBRARY_B82, type GraphSpec } from '../../../../../lib/b82-seams';
import {
  CHOROPLETH_SPECIMEN, GEO_SPECIMEN, SANKEY_SPECIMEN, SPECIMEN_AS_OF as AS_OF, SPECIMEN_SOURCE as SPEC, TREEMAP_SPECIMEN, corridorMapOf, graphChartSpec, mapChartSpec, mapRows,
} from '../../../../../lib/canvas-specs-b82';
import type { EdgeRow, EntityRow, StrategyRow } from '../../../../../lib/graph';
import type { Uncertainty } from '../../../../../lib/supply-b33';
import type { ExplainView } from '../../../../../lib/provenance-b50';

/** The library exports this section renders (the catalogue's RENDERED set). */
export const GM_RENDERED: readonly string[] = LIBRARY_B82.canvas.exports;

const GRAPH: GraphSpec = {
  question: 'Which suppliers stand behind the Regensburg line, two hops out? (SYNTHETIC)', caps: { nodes: 12, depth: 3 },
  nodes: [{ id: 'n', kind: 'supplier', label: 'Ningbo Magnets' }, { id: 'b', kind: 'supplier', label: 'Baotou Oxide' }, { id: 'r', kind: 'port', label: 'Rotterdam' }, { id: 'l', kind: 'site', label: 'Regensburg line' }],
  edges: [{ id: 'e1', from: 'b', to: 'n', type: 'supplies oxide', directed: true }, { id: 'e2', from: 'n', to: 'r', type: 'ships via', directed: true }, { id: 'e3', from: 'r', to: 'l', type: 'delivers to', directed: true }],
  watermark: { absent: 'a SYNTHETIC catalogue specimen — no projection was read' },
};
const UNBOUNDED: GraphSpec = { ...GRAPH, question: 'Everything (SYNTHETIC)', caps: { nodes: 2, depth: 1 } };
const ENTITIES = [{ entity_id: 'e1', entity_type: 'organisation', canonical_name: 'Ningbo Magnets (SYNTHETIC)', updated_at: AS_OF }, { entity_id: 'e2', entity_type: 'site', canonical_name: 'Regensburg (SYNTHETIC)', updated_at: AS_OF }, { entity_id: 'e3', entity_type: 'port', canonical_name: 'Rotterdam (SYNTHETIC)', updated_at: AS_OF }] as EntityRow[];
const EDGES = [{ edge_id: 'k1', subject_entity_id: 'e1', predicate: 'ships_via', object_entity_id: 'e3', valid_from: '2026-01-01T00:00:00Z', evidence_object_id: 'ev-1' }, { edge_id: 'k2', subject_entity_id: 'e3', predicate: 'supplies', object_entity_id: 'e2', valid_from: '2026-02-01T00:00:00Z', evidence_object_id: 'ev-2' }] as EdgeRow[];
const STRATEGY = [
  { strategy_object_id: 's1', object_type: 'OBJ', object_version: 1, title: 'Keep the line running (SYNTHETIC)', status: 'active', verification_state: 'not_applicable', updated_at: AS_OF, dependencies: [{ dependency_id: 'd1', depends_on_kind: 'strategy', depends_on_id: 's2', rationale: 'supply' }] },
  { strategy_object_id: 's2', object_type: 'ASU', object_version: 2, title: 'Magnets arrive weekly (SYNTHETIC)', status: 'active', verification_state: 'unverified', updated_at: AS_OF, dependencies: [{ dependency_id: 'd2', depends_on_kind: 'entity', depends_on_id: 'e1', rationale: 'the supplier' }] },
  { strategy_object_id: 's3', object_type: 'CMT', object_version: 1, title: 'Hold four weeks of cover (SYNTHETIC)', status: 'active', verification_state: 'not_applicable', updated_at: AS_OF, dependencies: [{ dependency_id: 'd3', depends_on_kind: 'strategy', depends_on_id: 's1', rationale: 'serves the objective' }] },
] as StrategyRow[];
const SUPPLY = {
  tiers: [{ tier: 0 }, { tier: 1 }, { tier: 2 }], coverage: { sites: 3, declared: 3, validated: 0, inferred: 0, declared_share: 1, validated_share: 0, inferred_share: 0 },
  sites: [{ id: 'line', tier: 0, name: 'Regensburg line (SYNTHETIC)', basis: 'declared', entity_id: null }, { id: 't1', tier: 1, name: 'Ningbo (SYNTHETIC)', basis: 'declared', entity_id: null }, { id: 't1b', tier: 1, name: 'Busan (SYNTHETIC)', basis: 'declared', entity_id: null }, { id: 't2', tier: 2, name: 'Baotou (SYNTHETIC)', basis: 'declared', entity_id: null }],
  routes: [{ id: 'r1', from: 't1', to: 'line', material: 'magnets', mode: 'sea', via: ['Suez'], lead_days: 38 }, { id: 'r1b', from: 't1b', to: 'line', material: 'magnets', mode: 'sea', via: ['Cape'], lead_days: 45 }, { id: 'r2', from: 't2', to: 't1', material: 'oxide', mode: 'rail', via: [], lead_days: 9 }],
  unsourced: [], rule: 'specimen',
} as unknown as Uncertainty;
const EXPLAIN = {
  ref: 'DPK:p@1', root: 'p', method: 'b50-pv-explain-1', asOf: AS_OF, product: { type: 'DPK', id: 'p0000000-0000-7000-8000-000000000000', version: 1, digest: null, label: 'Reroute package (SYNTHETIC)', outcome: null },
  nodes: [
    { nodeId: 'src', kind: 'source', ref: 'SRC:portwatch', label: 'PortWatch (SYNTHETIC)', outcome: 'ok', at: '2026-10-01T00:00:00Z', actor: null, parents: [] },
    { nodeId: 'ev', kind: 'evidence', ref: 'EVD:ev@2', label: 'Transit fragment v2', outcome: 'corrected', at: '2026-10-02T00:00:00Z', actor: null, parents: ['src'] },
    { nodeId: 'run', kind: 'agent_run', ref: 'SIM:run@1', label: 'Corridor run v1', outcome: 'ok', at: '2026-10-03T00:00:00Z', actor: 'simulation agent', parents: ['ev'] },
    { nodeId: 'p', kind: 'product', ref: 'DPK:p@1', label: 'Reroute package', outcome: 'ok', at: '2026-10-04T00:00:00Z', actor: 'L. Brandt (SYNTHETIC)', parents: ['run'] },
    { nodeId: 'sig', kind: 'signature', ref: 'SIG:s1', label: 'Approval signature', outcome: 'ok', at: '2026-10-05T00:00:00Z', actor: 'S. Okafor (SYNTHETIC)', parents: ['p'] },
  ],
  outcomes: {}, boundaries: {}, gaps: [], truncated: false, incomplete: false, examined: 5, bounds: { max_depth: 8, max_nodes: 200 }, carried: [], forward: { preview: false },
} as unknown as ExplainView;

export function GmCatalogue() {
  const corridor = corridorMapOf(GEO_SPECIMEN);
  return (
    <Panel title="Graph and map canvases (B82 §GM) — SYNTHETIC specimens">
      <p className="eye-dt-counts">Every drawing below is hand-written SVG over a SYNTHETIC specimen; each declares its grammar and carries its table alternative. No tile, basemap or network request exists.</p>
      <section aria-label="GraphCanvas specimen"><h3 className="eye-text-label">GraphCanvas — a task-bounded view (CMP-063)</h3>
        <GraphCanvas spec={GRAPH} chart={graphChartSpec({ kind: 'graph', title: 'Suppliers behind the line (SYNTHETIC)', basis: 'a SYNTHETIC specimen', sources: [SPEC], asOf: AS_OF, summary: '4 nodes and 3 relations of the specimen.' })} /></section>
      <section aria-label="GraphCanvas refusal specimen"><h3 className="eye-text-label">GraphCanvas — an unbounded view is not drawn (UX-ADR-016)</h3>
        <GraphCanvas spec={UNBOUNDED} chart={graphChartSpec({ kind: 'graph', title: 'An unbounded question (SYNTHETIC)', basis: 'a SYNTHETIC specimen', sources: [SPEC], asOf: AS_OF, summary: 'The table still lists every relation.' })} /></section>
      <section aria-label="KnowledgeGraphView specimen"><h3 className="eye-text-label">KnowledgeGraphView (VIZ-13)</h3>
        <KnowledgeGraphView question="What is within two hops of Ningbo Magnets? (SYNTHETIC)" edges={EDGES} entities={ENTITIES} depth={2} projection={null} asOf={AS_OF} /></section>
      <section aria-label="StrategyGraphView specimen"><h3 className="eye-text-label">StrategyGraphView (VIZ-14)</h3>
        <StrategyGraphView rows={STRATEGY} entities={ENTITIES} asOf={AS_OF} /></section>
      <section aria-label="DependencyNetwork specimen"><h3 className="eye-text-label">DependencyNetwork (VIZ-15)</h3>
        <DependencyNetwork uncertainty={SUPPLY} inferences={[]} asOf={AS_OF} title="Regensburg magnets (SYNTHETIC)" /></section>
      <section aria-label="ProvenanceGraph specimen"><h3 className="eye-text-label">ProvenanceGraph (VIZ-31)</h3>
        <ProvenanceGraph view={EXPLAIN} /></section>
      <section aria-label="HierarchyTree specimen"><h3 className="eye-text-label">HierarchyTree (VIZ-20)</h3>
        <HierarchyTree items={[{ id: 'root', parent: null, label: 'Strategy Graph (SYNTHETIC)', kind: 'scope' }, { id: 'o', parent: 'root', label: 'Keep the line running', kind: 'objective', version: 1, state: 'active' },
          { id: 'c', parent: 'o', label: 'Hold four weeks of cover', kind: 'commitment', version: 1, state: 'active' }, { id: 'a', parent: 'o', label: 'Magnets arrive weekly', kind: 'assumption', version: 2, state: 'active' }]}
          title="Strategy hierarchy (SYNTHETIC)" basis="a SYNTHETIC specimen" source={SPEC} asOf={AS_OF} rule="An item hangs from the first object it rests on." /></section>
      <section aria-label="Treemap specimen"><h3 className="eye-text-label">Treemap (VIZ-21)</h3>
        <Treemap items={TREEMAP_SPECIMEN} title="Exposure by driver (SYNTHETIC)" basis="a SYNTHETIC specimen of an exposure aggregate" source={SPEC} asOf={AS_OF} measure="exposure" unit="EUR m" /></section>
      <section aria-label="Sankey specimen"><h3 className="eye-text-label">Sankey (VIZ-19) — specimen only: no material-flow read exists</h3>
        <Sankey nodes={SANKEY_SPECIMEN.nodes} links={SANKEY_SPECIMEN.links} omissions={SANKEY_SPECIMEN.omissions} title="Magnet flow by route (SYNTHETIC)" basis="a SYNTHETIC specimen" source={SPEC} asOf={AS_OF} measure="containers" unit="TEU" /></section>
      <section aria-label="MapCanvas specimen"><h3 className="eye-text-label">MapCanvas (CMP-064)</h3>
        <MapCanvas map={corridor} rows={mapRows(GEO_SPECIMEN)} chart={mapChartSpec({ kind: 'map', title: 'Corridor references (SYNTHETIC)', basis: 'SYNTHETIC specimen references', sources: [SPEC], asOf: AS_OF, summary: 'Six specimen references.' })} /></section>
      <section aria-label="GeospatialMap specimen"><h3 className="eye-text-label">GeospatialMap (VIZ-16)</h3>
        <GeospatialMap refs={GEO_SPECIMEN} title="Corridor places and routes (SYNTHETIC)" asOf={AS_OF} source={SPEC} dash={{ 'route.cape': 'dashed' }} /></section>
      <section aria-label="FlowMap specimen"><h3 className="eye-text-label">FlowMap (VIZ-18)</h3>
        <FlowMap refs={GEO_SPECIMEN} values={{ 'route.suez': 41, 'route.cape': 23 }} measure={{ measure: 'transits', unit: 'vessels per day' }} period="the 30 days to 2026-10-18 (SYNTHETIC)"
          coverage="two routes of the corridor; air freight not shown (SYNTHETIC)" title="Transits by route (SYNTHETIC)" asOf={AS_OF} source={SPEC} dash={{ 'route.cape': 'dashed' }} /></section>
      <section aria-label="Choropleth specimen"><h3 className="eye-text-label">Choropleth (VIZ-17) — specimen only until a boundary dataset is admitted</h3>
        <Choropleth areas={CHOROPLETH_SPECIMEN.areas} data={CHOROPLETH_SPECIMEN.data} rateName="delayed share" numerator="delayed shipments" denominator="all shipments" period="Q3 2026 (SYNTHETIC)"
          title="Delayed share by specimen area (SYNTHETIC)" asOf={AS_OF} source={SPEC} /></section>
    </Panel>
  );
}
