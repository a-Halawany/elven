/**
 * B25 §CX (0108; L6-C02, V03-T-319, AI-48-002) — THE FEATURE AND CONTEXT ASSEMBLER, assembler@1: pure, deterministic, unit-tested.
 *
 * The database half (prediction.pcx_grounding_context) READS: the evidence versions known at the cut-off, the subject's graph context as
 * of the cut-off (entity, edges, events — both time axes), the twin snapshot served at the cut-off (or exactly the pinned version), the
 * assumptions as of the cut-off and the policy versions. This half SHAPES them into the MANIFEST and its FEATURES (the model inputs: each
 * a key, a source, a digest and — when scalar — a value) and DIGESTS the canonical manifest (sha-256 over JCS). It decides nothing the port
 * re-checks blindly: a required gap, an empty evidence pin or an unknown assumption is carried into the manifest and REFUSED by the port
 * (`information set rejected (incomplete | unknown_assumption | …)`).
 *
 * VERSIONED BEHAVIOUR. ASSEMBLER_VERSION names this shaping; a change to what a manifest contains or how it is digested is a new version
 * (a replay under another assembler is reported by the environment, and its manifest digest will differ by construction).
 *
 * PINS. What a replay must NOT re-read is pinned and copied from the frozen manifest: the revision head at the freeze, the policy versions in
 * force at the freeze, and the twin's served mode. Everything else is re-read as of the pinned cut-off and must digest the same.
 */
import { canonicalDigest } from '../../shared/forecast-environment.js';

export const ASSEMBLER_VERSION = 'assembler@1';
export const MANIFEST_SCHEMA = 'information-set@1';

type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v.filter(isObj) as Row[]) : []);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : v === null || v === undefined ? null : String(v));

/** The request a set is frozen for — the forecast's question at its cut-off. */
export interface InformationSetRequest {
  series_key: string; subject_entity_id: string | null; target_key: string | null;
  known_at: string; observed_through: string | null; assumptions: string[];
}

export interface Feature { key: string; source: string; digest: string; value?: string | number | boolean | null }
export interface CoverageGap { key: string; required: boolean; reason: string }

export interface Manifest {
  schema: string; assembler_version: string;
  request: InformationSetRequest;
  evidence: Row[];
  graph: { revision_head: number; known_at: string; subject: Row | null; edge_count: number; edges_digest: string; event_count: number; events_digest: string; neighbours: string[]; withdrawn_partitions: string[] };
  twin: { twin_id: string; version: number; branch_id: string | null; mode: string | null; state_set_digest: string; header_digest: string; known_at: string | null;
          observed_through: string | null; admitted_at: string | null; synthetic: boolean; element_count: number; elements_digest: string } | null;
  features: Feature[];
  assumptions: Row[];
  policy: Row;
  coverage_gaps: CoverageGap[];
}

/** What a replay copies from the frozen manifest instead of re-reading. */
export interface ManifestPins { revisionHead: number; policy: Row; twinMode: string | null; pinnedGaps: CoverageGap[] }

/** The gaps a pin carries with it: the policy's and the twin resolution's (a replay reads the pinned twin version, never resolves one). */
export const PINNED_GAP_PREFIXES: ReadonlyArray<string> = ['policy.', 'twin.snapshot'];
const pinnedGap = (key: string): boolean => PINNED_GAP_PREFIXES.some((p) => key.startsWith(p));

/** The pins of a frozen manifest (what its replay copies). */
export function pinsOf(m: Manifest): ManifestPins {
  return { revisionHead: m.graph.revision_head, policy: m.policy, twinMode: m.twin?.mode ?? null, pinnedGaps: m.coverage_gaps.filter((g) => pinnedGap(g.key)) };
}

/** The request in its canonical form (assumptions sorted and de-duplicated; absent optionals are null). */
export function canonicalRequest(r: { seriesKey: string; subjectEntityId: string | null; targetKey: string | null; knownAt: string; observedThrough: string | null; assumptions: string[] }): InformationSetRequest {
  return {
    series_key: r.seriesKey, subject_entity_id: r.subjectEntityId ?? null, target_key: r.targetKey ?? null,
    known_at: r.knownAt, observed_through: r.observedThrough ?? null, assumptions: [...new Set(r.assumptions)].sort(),
  };
}

/** A twin element's scalar value, when it has one (a number, a string or a boolean; or an object's numeric `value`). */
export function scalarOf(v: unknown): string | number | boolean | null | undefined {
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (isObj(v) && (typeof v['value'] === 'number' || typeof v['value'] === 'string' || typeof v['value'] === 'boolean')) return v['value'] as string | number | boolean;
  return undefined;
}

const byKey = <T extends { key: string }>(a: T, b: T): number => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const sortBy = (rows: Row[], ...keys: string[]): Row[] => [...rows].sort((a, b) => {
  for (const k of keys) { const x = String(a[k] ?? ''); const y = String(b[k] ?? ''); if (x !== y) return x < y ? -1 : 1; }
  return 0;
});

/** The FEATURES — the model inputs the context offers, each with its source and digest (L6-C02). */
export function featuresOf(seriesKey: string, ctx: Row): Feature[] {
  const out: Feature[] = [];
  const evidence = sortBy(arr(ctx['evidence']), 'evidence_object_id', 'evidence_version');
  out.push({ key: 'evidence.versions', source: `series:${seriesKey}`, digest: canonicalDigest(evidence), value: evidence.length });
  const subject = isObj(ctx['subject']) ? ctx['subject'] : null;
  if (subject !== null) {
    out.push({ key: 'graph.subject', source: `graph.entity:${String(subject['entity_id'])}`, digest: canonicalDigest(subject), value: str(subject['entity_type']) });
    const edges = sortBy(arr(ctx['edges']), 'edge_id');
    out.push({ key: 'graph.edges', source: `graph.edges_current@${String(ctx['known_at'])}`, digest: canonicalDigest(edges), value: edges.length });
    const preds = [...new Set(edges.map((e) => String(e['predicate'])))].sort();
    for (const p of preds) {
      const sub = edges.filter((e) => String(e['predicate']) === p);
      out.push({ key: `graph.edges.${p}`, source: `graph.edges_current@${String(ctx['known_at'])}`, digest: canonicalDigest(sub), value: sub.length });
    }
    const events = sortBy(arr(ctx['events']), 'occurred_at', 'event_id');
    out.push({ key: 'graph.events', source: 'graph.entity_events+edge_events', digest: canonicalDigest(events), value: events.length });
  }
  const twin = isObj(ctx['twin']) ? ctx['twin'] : null;
  if (twin !== null) {
    const src = `twin:${String(twin['twin_id'])}@v${String(twin['version'])}`;
    for (const el of sortBy(arr(twin['elements']), 'key')) {
      const value = scalarOf(el['value']);
      out.push({ key: `twin.${String(el['key'])}`, source: src, digest: canonicalDigest(el), ...(value === undefined ? {} : { value }) });
    }
  }
  for (const a of sortBy(arr(ctx['assumptions']), 'id')) {
    out.push({ key: `assumption.${String(a['id'])}`, source: 'graph.strategy:ASU', digest: canonicalDigest(a), value: str(a['verification_state']) });
  }
  return out.sort(byKey);
}

/**
 * THE MANIFEST of a context read for a request — canonical, digestible. `pins` (a replay) copies the revision head, the policy and the
 * twin's served mode from the frozen manifest; without pins (a freeze) they are what the read found, the PDP bundle version added.
 */
export function assembleManifest(request: InformationSetRequest, ctx: Row, opts: { pdpBundle: string; pins?: ManifestPins }): { manifest: Manifest; digest: string } {
  const evidence = sortBy(arr(ctx['evidence']), 'evidence_object_id', 'evidence_version');
  const subject = isObj(ctx['subject']) ? ctx['subject'] : null;
  const edges = sortBy(arr(ctx['edges']), 'edge_id');
  const events = sortBy(arr(ctx['events']), 'occurred_at', 'event_id');
  const neighbours = (Array.isArray(ctx['neighbours']) ? (ctx['neighbours'] as unknown[]).map(String) : []).sort();
  const t = isObj(ctx['twin']) ? ctx['twin'] : null;
  const elements = t === null ? [] : sortBy(arr(t['elements']), 'key');
  const twin: Manifest['twin'] = t === null ? null : {
    twin_id: String(t['twin_id']), version: Number(t['version']), branch_id: str(t['branch_id']),
    mode: opts.pins !== undefined ? opts.pins.twinMode : str(t['mode']),
    state_set_digest: String(t['state_set_digest']), header_digest: String(t['header_digest']), known_at: str(t['known_at']),
    observed_through: str(t['observed_through']), admitted_at: str(t['admitted_at']), synthetic: t['synthetic'] === true,
    element_count: elements.length, elements_digest: canonicalDigest(elements),
  };
  const read: CoverageGap[] = arr(ctx['gaps']).map((g) => ({ key: String(g['key']), required: g['required'] === true, reason: String(g['reason']) }));
  const gaps: CoverageGap[] = opts.pins === undefined ? read : [...read.filter((g) => !pinnedGap(g.key)), ...opts.pins.pinnedGaps];
  if (ctx['series'] === null || ctx['series'] === undefined) {
    gaps.push({ key: 'series', required: true, reason: `series ${request.series_key} is not registered in this domain` });
  }
  if (evidence.length === 0 && ctx['series'] !== null && ctx['series'] !== undefined) {
    gaps.push({ key: 'evidence.versions', required: true, reason: `no evidence version of series ${request.series_key} was known at ${request.known_at}` });
  }
  for (const u of Array.isArray(ctx['unknown_assumptions']) ? (ctx['unknown_assumptions'] as unknown[]) : []) {
    gaps.push({ key: `assumption.${String(u)}`, required: true, reason: `${String(u)} is not an assumption (ASU) of this domain` });
  }
  const policy: Row = opts.pins !== undefined ? opts.pins.policy : { ...(isObj(ctx['policy']) ? ctx['policy'] : {}), pdp_bundle: opts.pdpBundle };
  const manifest: Manifest = {
    schema: MANIFEST_SCHEMA, assembler_version: ASSEMBLER_VERSION, request,
    evidence,
    graph: {
      revision_head: opts.pins !== undefined ? opts.pins.revisionHead : Number(ctx['revision_head'] ?? 0),
      known_at: String(ctx['known_at'] ?? request.known_at), subject, edge_count: edges.length, edges_digest: canonicalDigest(edges),
      event_count: events.length, events_digest: canonicalDigest(events), neighbours,
      withdrawn_partitions: (Array.isArray(ctx['withdrawn_partitions']) ? (ctx['withdrawn_partitions'] as unknown[]).map(String) : []).sort(),
    },
    twin,
    features: featuresOf(request.series_key, ctx),
    assumptions: sortBy(arr(ctx['assumptions']), 'id'),
    policy,
    coverage_gaps: gaps.sort(byKey),
  };
  return { manifest, digest: canonicalDigest(manifest) };
}

/** The required gaps — the inputs whose absence refuses the freeze (the port raises `incomplete` on the first). */
export const requiredGaps = (m: Manifest): CoverageGap[] => m.coverage_gaps.filter((g) => g.required);

export interface Divergence { what: string; original?: unknown; replayed?: unknown; note?: string }

/**
 * WHAT DIVERGED between two manifests of the same request — section by section, then feature by feature (added, removed, changed digest).
 * `ignore` names sections a comparison does not hold against the other (the fresh grounding ignores the request's cut-off).
 */
export function compareManifests(a: Manifest, b: Manifest, ignore: ReadonlyArray<string> = []): Divergence[] {
  const out: Divergence[] = [];
  const skip = new Set(ignore);
  const sec = (what: string, x: unknown, y: unknown): void => {
    if (skip.has(what)) return;
    const dx = canonicalDigest(x ?? null); const dy = canonicalDigest(y ?? null);
    if (dx !== dy) out.push({ what, original: dx, replayed: dy });
  };
  sec('request', a.request, b.request);
  sec('evidence', a.evidence, b.evidence);
  if (!skip.has('graph.revision_head') && a.graph.revision_head !== b.graph.revision_head) out.push({ what: 'graph.revision_head', original: a.graph.revision_head, replayed: b.graph.revision_head });
  sec('graph.subject', a.graph.subject, b.graph.subject);
  if (!skip.has('graph.edges') && a.graph.edges_digest !== b.graph.edges_digest) out.push({ what: 'graph.edges', original: a.graph.edge_count, replayed: b.graph.edge_count });
  if (!skip.has('graph.events') && a.graph.events_digest !== b.graph.events_digest) out.push({ what: 'graph.events', original: a.graph.event_count, replayed: b.graph.event_count });
  sec('graph.withdrawn_partitions', a.graph.withdrawn_partitions, b.graph.withdrawn_partitions);
  sec('twin', a.twin, b.twin);
  sec('assumptions', a.assumptions, b.assumptions);
  sec('policy', a.policy, b.policy);
  sec('coverage_gaps', a.coverage_gaps, b.coverage_gaps);
  if (!skip.has('features')) {
    const fa = new Map(a.features.map((f) => [f.key, f])); const fb = new Map(b.features.map((f) => [f.key, f]));
    for (const k of [...new Set([...fa.keys(), ...fb.keys()])].sort()) {
      const x = fa.get(k); const y = fb.get(k);
      if (x === undefined) out.push({ what: `feature:${k}`, note: 'added', replayed: y?.value ?? null });
      else if (y === undefined) out.push({ what: `feature:${k}`, note: 'removed', original: x.value ?? null });
      else if (x.digest !== y.digest) out.push({ what: `feature:${k}`, original: x.value ?? null, replayed: y.value ?? null });
    }
  }
  return out;
}

/** The digest of a forecast's output — the quantiles and the path, as stored. */
export function outputDigest(quantiles: unknown, path: unknown): string {
  return canonicalDigest({ quantiles: quantiles ?? null, path: path ?? [] });
}

/** The summary a forecast carries in its FCT@v2 payload (`information_set`) and the seam answers. */
export function summaryOf(setId: string, digest: string, m: Manifest): Row {
  return {
    id: setId, manifest_digest: digest, assembler_version: m.assembler_version,
    graph: { revision_head: m.graph.revision_head, known_at: m.graph.known_at, subject_entity_id: m.graph.subject?.['entity_id'] ?? null, edges: m.graph.edge_count, events: m.graph.event_count },
    twin: m.twin === null ? null : { twin_id: m.twin.twin_id, version: m.twin.version, state_set_digest: m.twin.state_set_digest, header_digest: m.twin.header_digest },
    evidence: m.evidence.length,
    feature_keys: m.features.map((f) => f.key),
    assumptions: m.assumptions.map((a) => ({ id: a['id'], version: a['version'] ?? null })),
    coverage_gaps: m.coverage_gaps.map((g) => ({ key: g.key, reason: g.reason })),
  };
}
