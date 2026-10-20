/**
 * B82 §0 (the integrator's prelude) — THE SEAMS the web parts code against (§TS truth, uncertainty, the AI notice, freshness; §EV evidence,
 * citation, custody, rights, verification; §CF the chart frame and the quantitative charts; §GM the graph and map canvases; §SC the
 * scenario, decision, risk and operations charts; §PX provenance, explanation, dissent, trust). Types, the chart GRAMMAR and the file /
 * export contract. The server's row shapes are apps/api/src/graph/b82-seams.ts; these are the same contracts as the pages read them.
 *
 * THE ONE BEHAVIOUR HERE is `assertGrammar(spec)` — pure, total, deterministic: the problems of a ChartSpec, empty when every declaration a
 * chart must carry is present (UX-ADR-015, CMP-057, VIZ-36, GLB-07). ChartFrame (components/chart-frame.tsx) refuses to draw a chart whose
 * spec has a problem and renders the problems instead. §CF owns the grammar's growth after the prelude (a new rule is an addition here,
 * folded by the integrator; a rule is never relaxed).
 *
 * DESIGN: D3 — no chart or map library: hand-written SVG in React, geometry in pure `lib/*-b82.ts` with vitest. D5 — no new colour token:
 * series are told apart by direct labels, dash patterns and marker shapes; a colour is only ever a TOKEN NAME (`color.*`), never a raw value,
 * and never the only channel. D9 — no new permission. D6 — TruthBadge (a B107 inventory key) is wrapped, never edited.
 *
 * THE LIBRARY stays in top-level `apps/web/components/*.tsx` (B107's inventory reads `^apps/web/components/[^/]+\.tsx$`); LIBRARY_B82 names
 * each part's file and exports (appended to B80's LIBRARY, B81's LIBRARY_B81 and B50's LIBRARY_B50 at the fold). Each component arrives
 * `proposed`; the DSA approves it in the act. THREE CLAIMS: construction; demonstrated operation (SYNTHETIC, `claim = 'demonstration'`);
 * real acceptance (B111's shared path, then H3) — never claimed.
 */

/* ───────────────────────── §TS DISPLAY TRUTH ───────────────────────── */
export type StoredTruthState = 'observed' | 'asserted' | 'extracted' | 'inferred' | 'assessed' | 'synthetic' | 'decided' | 'disputed' | 'withdrawn';
/** The three DERIVED display states (contracts truth-state.ts: recommended / corrected / indeterminate) — computed by objects.display_truth. */
export type DerivedDisplayState = 'recommended' | 'corrected' | 'indeterminate';
export type DisplayTruthState = StoredTruthState | DerivedDisplayState;
export type DisplayReasonCode =
  | 'recommendation_type' | 'correction_of' | 'corrected_by' | 'contradiction' | 'unfit' | 'declared_absence' | 'weak_provenance' | 'withdrawn_input' | 'unresolvable';
export const DISPLAY_TRUTH_RULE_VERSION = 'b82-ts-display-1';
export interface DisplayTruth {
  ref: string;                    // 'TYPE:id@version'
  stored: StoredTruthState;       // the header's truth_state, unchanged
  display: DisplayTruthState;     // what the badge shows
  basis: string;                  // the rule's words for why display differs from stored (or "as stored")
  ruleVersion: string;
  reasons: Array<{ code: DisplayReasonCode; detail: string; ref?: string | null }>;
  /** what the object may not be used for while it reads INDETERMINATE (or a corrected original); null when unconstrained */
  constrainedUse: string | null;
  correctionOf: string | null;
  correctedBy: string | null;
}

/* ───────────────────────── §EV CITATIONS, RIGHTS, VERIFICATION ───────────────────────── */
export type CitationKind = 'evidence' | 'claim' | 'entity' | 'forecast' | 'assumption' | 'run' | 'twin' | 'scenario' | 'warning' | 'estimate';
/** A citation names one exact version; the digest binds what was cited (null only where the citing record carried none — said so). */
export interface CitationRef { kind: CitationKind; id: string; version: number; digest: string | null }
export type LeafOutcome = 'resolved' | 'stale_citation' | 'corrected' | 'withdrawn' | 'rights_expired' | 'unverifiable' | 'inaccessible';
/** A verification that cannot be made is UNAVAILABLE — never FAILED (UX-57, a key not on file). */
export type VerificationOutcome = 'verified' | 'failed' | 'unavailable';
export interface RightsTerms {
  termsId: string; version: number; sourceId: string; contractVersion: number;
  /** null = "no expiry declared" (stated, never blank) */ expiresAt: string | null;
  purposes: string[]; prohibitedUses: string[]; attribution: string | null;
  declaredBy: string; declaredAt: string; state: 'in_force' | 'expired' | 'withdrawn';
}
export interface CitationLeaf {
  path: string[];                 // refs from the cited object down to this leaf
  evidence: { id: string; version: number; digest: string; byteStart: number; byteEnd: number; mediaType: string | null } | null;
  digestOk: boolean | null;       // null = not re-checked on this read
  custody: { events: number; lastEventAt: string | null } | null;
  rights: RightsTerms | null;
  tier: 'hot' | 'cold' | 'archived' | null;
  correction: { correctionOf: string | null; correctedBy: string | null };
  outcome: LeafOutcome;
  detail: string | null;
}
export interface CitationResolution {
  ref: CitationRef;
  /** the worst of the leaves' outcomes */ outcome: LeafOutcome;
  leaves: CitationLeaf[];
  truncated: boolean; depth: number; method: string; asOf: string;
}

/* ───────────────────────── §CF THE CHART GRAMMAR ───────────────────────── */
/** Every visual kind of the library (VIZ-01…36, CMP-060…064); a spec names one. */
export const CHART_KINDS = [
  'time_series', 'event_timeline', 'probability_band', 'horizon_matrix', 'distribution', 'calibration_plot', 'waterfall', 'variance_bridge',
  'correlation_matrix', 'scatter', 'control_chart',
  'scenario_fan', 'scenario_comparison', 'sensitivity_tornado', 'risk_matrix', 'opportunity_portfolio', 'health_decomposition', 'run_comparison',
  'twin_state_diff', 'option_matrix', 'evidence_coverage', 'status_board', 'alert_queue', 'audit_timeline',
  'graph', 'knowledge_graph', 'strategy_graph', 'dependency_network', 'provenance_graph', 'hierarchy_tree', 'treemap', 'sankey',
  'map', 'geospatial_map', 'flow_map', 'choropleth',
] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

/** Which time the horizontal (or ordering) axis is: B50's four axes, a forecast's horizon, or none (a chart that is not about time). */
export type TimeBasis = 'event' | 'observation' | 'valid' | 'record' | 'horizon' | 'none';
/** A declared absence: stated with its reason, never blank. */
export interface Absent { absent: string }
export interface ChartTime {
  basis: TimeBasis;
  /** the last instant the data could include (ISO), or why there is none */ cutoff: string | Absent;
  /** the instant the read was made (ISO) */ asOf: string;
}
export interface ChartUnit { measure: string; unit: string }
/** Where the values come from: a cited version, a named read, or a SYNTHETIC catalogue specimen (DESIGN D13 — said so; never mixed). */
export type ChartSource =
  | { citation: CitationRef; label: string }
  | { read: string; label: string }
  | { specimen: string };
export type UncertaintyKind = 'interval' | 'band' | 'distribution' | 'range' | 'ordinal' | 'not_quantified' | 'not_applicable';
export interface ChartUncertainty {
  kind: UncertaintyKind;
  /** the sentence a reader is given — never empty; `not_quantified` says why, `not_applicable` says why not */ statement: string;
  /** a band's or interval's coverage in (0, 1), e.g. 0.8 for q10–q90 */ level?: number;
}
export type DashPattern = 'solid' | 'dashed' | 'dotted' | 'dash-dot';
export type MarkerShape = 'none' | 'circle' | 'square' | 'triangle' | 'diamond' | 'cross';
export interface LegendEntry {
  key: string; label: string;
  dash: DashPattern; marker: MarkerShape;
  /** a token NAME (`color.*` from packages/tokens) — never a raw colour; optional, and never the only channel (D5) */ token?: string;
  /** the series is labelled in place on the drawing */ directLabel?: boolean;
}
export type AlternativeColumnKind = 'text' | 'number' | 'instant' | 'date' | 'state';
export interface AlternativeColumn { key: string; label: string; kind: AlternativeColumnKind; /** required for a number column; one of spec.units */ unit?: string }
export interface ChartAlternative {
  /** the text summary a screen reader hears first (what the chart shows, the range, the notable points) */ summary: string;
  columns: AlternativeColumn[];
  definitions?: Array<{ term: string; definition: string }>;
}
export interface ChartSpec {
  kind: ChartKind;
  title: string;
  /** what the values ARE (observed transits, a model forecast, a declared relation …) */ basis: string;
  time: ChartTime;
  units: ChartUnit[];
  sources: ChartSource[];
  uncertainty: ChartUncertainty;
  legend: LegendEntry[];
  alternative: ChartAlternative;
}
/** A row of the table alternative, keyed by the alternative's column keys (null = unknown, rendered "unknown"). */
export type AlternativeRow = Readonly<Record<string, string | number | null>>;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const isInstant = (v: unknown): v is string => typeof v === 'string' && ISO_INSTANT.test(v.trim()) && Number.isFinite(Date.parse(v.trim()));
const filled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;
const TOKEN_NAME = /^color\.[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/;
const dupes = (xs: string[]): string[] => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

/**
 * THE GRAMMAR. Returns every problem of the spec as `<field>: <problem>` (stable order: kind, title, basis, time, units, sources,
 * uncertainty, legend, alternative), or [] when the chart may be drawn. Pure; never throws on any input shape.
 *  kind         one of CHART_KINDS
 *  title        non-empty
 *  basis        non-empty — what the values are
 *  time         a known basis; as-of an ISO instant; cutoff an ISO instant (not after as-of) or a declared absence with its reason
 *  units        at least one; each names its measure and unit; no measure twice
 *  sources      at least one; each labelled (a citation names kind, id and a version ≥ 1); a specimen is never mixed with real sources
 *  uncertainty  a known kind with a statement; a band / interval with a level in (0, 1)
 *  legend       at least one entry; keys and labels unique and non-empty; colour only as a token name; entries told apart without colour —
 *               distinct (dash, marker) pairs unless every entry is labelled in place
 *  alternative  a summary; at least one column; keys unique; a number column names its unit, and that unit is one of `units`
 */
export function assertGrammar(spec: ChartSpec): string[] {
  const out: string[] = [];
  const s = (spec ?? {}) as Partial<ChartSpec>;
  if (!(CHART_KINDS as readonly string[]).includes(String(s.kind))) out.push(`kind: "${String(s.kind)}" is not a library chart kind`);
  if (!filled(s.title)) out.push('title: missing — a chart states what it shows');
  if (!filled(s.basis)) out.push('basis: missing — a chart states what its values are (observed, forecast, declared …)');

  const t = s.time as Partial<ChartTime> | undefined;
  if (t === undefined || t === null || typeof t !== 'object') out.push('time: missing — the time basis, the cutoff and the as-of instant');
  else {
    if (!['event', 'observation', 'valid', 'record', 'horizon', 'none'].includes(String(t.basis))) out.push(`time: the basis "${String(t.basis)}" is not one of event, observation, valid, record, horizon, none`);
    if (!isInstant(t.asOf)) out.push('time: the as-of instant is missing or not an ISO instant');
    const c = t.cutoff as unknown;
    if (typeof c === 'string') {
      if (!isInstant(c)) out.push('time: the cutoff is not an ISO instant');
      else if (isInstant(t.asOf) && Date.parse(c) > Date.parse(t.asOf)) out.push('time: the cutoff is after the as-of instant');
    } else if (c === null || typeof c !== 'object' || !filled((c as Absent).absent)) out.push('time: the cutoff is missing — an instant, or a declared absence with its reason');
  }

  const units = Array.isArray(s.units) ? s.units : null;
  if (units === null || units.length === 0) out.push('units: missing — at least one measure with its unit');
  else {
    units.forEach((u, i) => { if (!filled(u?.measure) || !filled(u?.unit)) out.push(`units: entry ${i + 1} names no measure or no unit`); });
    for (const d of dupes(units.map((u) => String(u?.measure)))) out.push(`units: the measure "${d}" is declared twice`);
  }

  const sources = Array.isArray(s.sources) ? s.sources : null;
  if (sources === null || sources.length === 0) out.push('sources: missing — at least one cited version, named read or specimen');
  else {
    let specimens = 0;
    sources.forEach((src, i) => {
      const x = (src ?? {}) as Record<string, unknown>;
      if ('specimen' in x) { specimens += 1; if (!filled(x['specimen'])) out.push(`sources: entry ${i + 1} is a specimen without its statement`); return; }
      if (!filled(x['label'])) out.push(`sources: entry ${i + 1} has no label`);
      if ('citation' in x) {
        const c = (x['citation'] ?? {}) as Partial<CitationRef>;
        if (!filled(c.kind) || !filled(c.id) || typeof c.version !== 'number' || !Number.isInteger(c.version) || c.version < 1) out.push(`sources: entry ${i + 1} cites no exact version (kind, id, version ≥ 1)`);
      } else if (!('read' in x) || !filled(x['read'])) out.push(`sources: entry ${i + 1} is neither a citation, a named read nor a specimen`);
    });
    if (specimens > 0 && specimens < sources.length) out.push('sources: a SYNTHETIC specimen is mixed with real sources');
  }

  const u = s.uncertainty as Partial<ChartUncertainty> | undefined;
  if (u === undefined || u === null || typeof u !== 'object') out.push('uncertainty: missing — a statement, even "not quantified" with its reason');
  else {
    if (!['interval', 'band', 'distribution', 'range', 'ordinal', 'not_quantified', 'not_applicable'].includes(String(u.kind))) out.push(`uncertainty: the kind "${String(u.kind)}" is not known`);
    if (!filled(u.statement)) out.push('uncertainty: the statement is missing');
    if ((u.kind === 'band' || u.kind === 'interval') && !(typeof u.level === 'number' && u.level > 0 && u.level < 1)) out.push('uncertainty: a band or interval states its level in (0, 1)');
  }

  const legend = Array.isArray(s.legend) ? s.legend : null;
  if (legend === null || legend.length === 0) out.push('legend: missing — at least one entry');
  else {
    legend.forEach((e, i) => {
      if (!filled(e?.key) || !filled(e?.label)) out.push(`legend: entry ${i + 1} has no key or no label`);
      if (!['solid', 'dashed', 'dotted', 'dash-dot'].includes(String(e?.dash))) out.push(`legend: entry ${i + 1} declares no dash pattern`);
      if (!['none', 'circle', 'square', 'triangle', 'diamond', 'cross'].includes(String(e?.marker))) out.push(`legend: entry ${i + 1} declares no marker shape`);
      if (e?.token !== undefined && (RAW_COLOUR.test(String(e.token)) || !TOKEN_NAME.test(String(e.token)))) out.push(`legend: entry ${i + 1}'s colour is not a token name (color.*)`);
    });
    for (const d of dupes(legend.map((e) => String(e?.key)))) out.push(`legend: the key "${d}" is used twice`);
    for (const d of dupes(legend.map((e) => String(e?.label)))) out.push(`legend: the label "${d}" is used twice`);
    if (legend.length > 1 && !legend.every((e) => e?.directLabel === true)) {
      for (const d of dupes(legend.map((e) => `${String(e?.dash)}+${String(e?.marker)}`))) out.push(`legend: two entries share ${d.replace('+', ' with marker ')} — told apart by colour alone`);
    }
  }

  const alt = s.alternative as Partial<ChartAlternative> | undefined;
  if (alt === undefined || alt === null || typeof alt !== 'object') out.push('alternative: missing — the table alternative is mandatory');
  else {
    if (!filled(alt.summary)) out.push('alternative: the text summary is missing');
    const cols = Array.isArray(alt.columns) ? alt.columns : null;
    if (cols === null || cols.length === 0) out.push('alternative: no columns — the table alternative carries the values');
    else {
      const declared = new Set((units ?? []).map((x) => String(x?.unit)));
      cols.forEach((c, i) => {
        if (!filled(c?.key) || !filled(c?.label)) out.push(`alternative: column ${i + 1} has no key or no label`);
        if (!['text', 'number', 'instant', 'date', 'state'].includes(String(c?.kind))) out.push(`alternative: column ${i + 1} has no known kind`);
        if (c?.kind === 'number') {
          if (!filled(c.unit)) out.push(`alternative: the number column "${String(c.key)}" names no unit`);
          else if (!declared.has(c.unit)) out.push(`alternative: the number column "${String(c.key)}" uses the unit "${c.unit}", which units does not declare`);
        }
      });
      for (const d of dupes(cols.map((c) => String(c?.key)))) out.push(`alternative: the column key "${d}" is used twice`);
    }
  }
  return out;
}

/* ───────────────────────── §GM GRAPH AND MAP CANVASES ───────────────────────── */
/** B20's projection watermark as a canvas states it (from the read's projection block), or why there is none. */
export interface ProjectionWatermark { revision: number | null; verifiedAt: string | null; lagEvents: number; degraded: boolean; label: string | null }
export interface GraphNode { id: string; kind: string; label: string; ref?: string | null; truth?: DisplayTruthState | null; at?: string | null }
export interface GraphEdge { id: string; from: string; to: string; type: string; directed: boolean; at?: string | null; evidence?: string[] }
/** A TASK-BOUNDED graph view (UX-ADR-016): a stated question and caps; GraphCanvas refuses an unbounded request. */
export interface GraphSpec {
  question: string;
  caps: { nodes: number; depth: number; edges?: number };
  nodes: GraphNode[];
  edges: GraphEdge[];
  watermark: ProjectionWatermark | Absent;
}
export type GeoPosition = [number, number];   // [longitude, latitude], degrees, EPSG:4326
export type GeoGeometry =
  | { type: 'Point'; coordinates: GeoPosition }
  | { type: 'LineString'; coordinates: GeoPosition[] }
  | { type: 'Polygon'; coordinates: GeoPosition[][] };
/** A governed geographic reference (graph.geo_references, §GM): typed by a named data steward, never imported; versioned and retirable. */
export interface GeoReference {
  referenceId: string; version: number; key: string; label: string; geometry: GeoGeometry; crs: 'EPSG:4326';
  sourceStatement: string; licenceStatement: string;
  linked: { type: string; id: string } | null; chokepointKey: string | null;
  declaredBy: string; declaredAt: string; state: 'active' | 'retired';
}
export type MapLayerKind = 'point' | 'line' | 'flow' | 'choropleth';
export interface MapLayer {
  key: string; label: string; kind: MapLayerKind;
  features: GeoReference[];
  /** a flow layer's width measure, a choropleth's value measure (its unit one of the chart spec's) */ measure?: ChartUnit;
  /** SYNTHETIC catalogue specimen (D13 / Q4: the choropleth until a boundary asset is admitted) */ specimen?: boolean;
}
/** No basemap, no tiles, no network (D4): a graticule, the declared references, a scale bar. */
export interface MapSpec {
  crs: 'EPSG:4326';
  projection: 'equirectangular';
  layers: MapLayer[];
  scale: { bar: true; unit: 'km' | 'nmi' };
  /** [west, south, east, north] in degrees; absent = the layers' bounds */ extent?: [number, number, number, number];
}

/* ───────────────────────── §PX PROVENANCE AND TRUST ───────────────────────── */
export type ProvenanceStrengthValue = 'strong' | 'partial' | 'weak' | 'broken' | 'unknown';
export type ProvenanceReasonCode =
  | 'not_computed' | 'gap' | 'truncated' | 'unresolved_citation' | 'unsigned_human_step' | 'undigested_model_call' | 'withdrawn_input' | 'corrected_input' | 'unfit';
/** graph.provenance_strength — §0's stub answers `unknown` / `not_computed` (rule b82-px-strength-0); §PX's read replaces it. */
export interface ProvenanceStrength { ref: string; strength: ProvenanceStrengthValue; reasons: Array<{ code: ProvenanceReasonCode; detail: string; nodeId?: string | null }>; ruleVersion: string; asOf: string }
export type TrustFacet = 'signature' | 'lineage' | 'custody' | 'policy' | 'evaluation' | 'correction' | 'rights' | 'freshness';
export interface TrustFacetState { facet: TrustFacet; outcome: VerificationOutcome | 'not_checked'; detail: string; checkedAt: string | null; checkedBy: string | null }
/** A person's recorded, withdrawable statement ("I inspected these facets of this version") — never an approval, never an agent's, never
 *  the producer's or owner's (the 0042 separation copied). It enables no command. */
export interface Attestation {
  attestationId: string; subject: string; facets: TrustFacet[]; statement: string;
  attestedBy: string; attestedAt: string; withdrawnAt: string | null; withdrawnBy: string | null; withdrawReason: string | null;
}
/** Facets, never a score; the digest binds what was shown. */
export interface TrustEnvelope { subject: string; facets: TrustFacetState[]; provenance: ProvenanceStrength; attestations: Attestation[]; ruleVersion: string; digest: string; asOf: string }

/* ───────────────────────── THE LIBRARY'S NEW FILES AND EXPORTS ───────────────────────── */
/** One file per part (each its own top-level component file — no shared hotspot); §0's ChartFrame skeleton is completed by §CF. */
export const LIBRARY_B82 = {
  frame:     { part: '§0 → §CF', files: ['components/chart-frame.tsx'], exports: ['ChartFrame'] },
  truth:     { part: '§TS', files: ['components/truth.tsx'], exports: ['TruthStateLabel', 'UncertaintyStatement', 'ProbabilityValue', 'ConfidenceClass', 'RangeValue', 'EstimateValue', 'AiNotice', 'FreshnessWatermark'] },
  evidence:  { part: '§EV', files: ['components/evidence.tsx'], exports: ['EvidenceCard', 'CitationLink', 'SourcePreview', 'EvidenceViewer', 'CustodyTimeline', 'RightsNotice', 'VerificationPanel', 'EvidenceDisclosure'] },
  chart:     { part: '§CF', files: ['components/chart.tsx'], exports: ['ChartLegend', 'DataTooltip', 'AccessibleAlternative', 'TimeSeries', 'EventTimeline', 'ProbabilityBand', 'HorizonMatrix', 'Distribution', 'CalibrationPlot', 'Waterfall', 'VarianceBridge', 'CorrelationMatrix', 'Scatter', 'ControlChart'] },
  canvas:    { part: '§GM', files: ['components/canvas.tsx'], exports: ['GraphCanvas', 'KnowledgeGraphView', 'StrategyGraphView', 'DependencyNetwork', 'ProvenanceGraph', 'HierarchyTree', 'Treemap', 'Sankey', 'MapCanvas', 'GeospatialMap', 'FlowMap', 'Choropleth'] },
  strategic: { part: '§SC', files: ['components/strategic-charts.tsx'], exports: ['ScenarioFan', 'ScenarioComparison', 'SensitivityTornado', 'RiskMatrix', 'OpportunityPortfolio', 'HealthDecomposition', 'RunComparison', 'TwinStateDiff', 'OptionMatrix', 'EvidenceCoverage', 'StatusBoard', 'AlertQueue', 'AuditTimeline'] },
  trust:     { part: '§PX', files: ['components/trust.tsx'], exports: ['ProvenanceTrail', 'ExplanationLayers', 'AlternativeExplanations', 'DissentList', 'MethodDisclosure', 'TruthComparison', 'SupportComparison', 'TrustIndicator'] },
} as const;
