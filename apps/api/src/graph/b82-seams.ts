/**
 * B82 §0 (migration 0121 §0) — THE SERVER-SIDE SEAMS of the trust, evidence and visualization stage: the SQL reads' signatures and the
 * snake_case row shapes every part codes against (§TS display truth; §EV citation resolution, rights terms, the segment read; §GM
 * geographic references; §PX provenance strength, the trust envelope, verifications, attestations), the rule versions and the refusal nouns
 * the integrator maps at the fold. Types and constants only — no behaviour. Parts add nothing here — ask the integrator. The web reads the
 * same contracts in camelCase (apps/web/lib/b82-seams.ts).
 *
 * THE STUB (0121 §0.1; a guarded read — STABLE, SECURITY DEFINER, `observation.assert_read_scope` first, REVOKE ALL FROM PUBLIC, EXECUTE to
 * eye_app and eye_commit):
 *   graph.provenance_strength(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb   §0's stub → §PX's read
 * It answers `unknown` with the reason `not_computed` for ANY subject of the right shape (it never looks); a malformed subject is refused
 * `provenance rejected (subject)` (22023 → 422). §TS's objects.display_truth calls it (the `weak_provenance` reason only when the answer is
 * weak or broken — `unknown` adds no reason); §PX re-declares it WHOLE with the same signature, volatility, security, return type and grants.
 *
 * D9 (DESIGN): NO new permission. The parts' new ports take PDP actions in their own `/* B82 <part> *\/` blocks; no role gains evidence read.
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (the software and its harnesses); DEMONSTRATED OPERATION (the act — SYNTHETIC personas,
 * `claim = 'demonstration'`); REAL ACCEPTANCE (B111's shared recording path, then H3 — never claimed).
 */

/* ── THE SQL READS (their exact signatures; regprocedure text as pg_proc prints it) ── */
export const B82_READS = {
  provenanceStrength: { fn: 'graph.provenance_strength(uuid, uuid, text, uuid, integer)', owner: '§0 → §PX', returns: 'jsonb', stub: true },
  displayTruth:       { fn: 'objects.display_truth(uuid, uuid, jsonb)', owner: '§TS', returns: 'jsonb', stub: false },
  resolveCitation:    { fn: 'graph.resolve_citation(uuid, uuid, jsonb, integer)', owner: '§EV', returns: 'jsonb', stub: false },
  geoLayer:           { fn: 'graph.geo_layer(uuid, uuid, jsonb)', owner: '§GM', returns: 'jsonb', stub: false },
  trustEnvelope:      { fn: 'graph.trust_envelope(uuid, uuid, text, uuid, integer)', owner: '§PX', returns: 'jsonb', stub: false },
} as const;

/** The rule / method versions each read stamps on its answer. */
export const PROVENANCE_STRENGTH_STUB_VERSION = 'b82-px-strength-0';
export const PROVENANCE_STRENGTH_RULE_VERSION = 'b82-px-strength-1';
export const DISPLAY_TRUTH_RULE_VERSION = 'b82-ts-display-1';
export const CITATION_RESOLUTION_METHOD = 'b82-ev-resolve-1';
export const TRUST_ENVELOPE_RULE_VERSION = 'b82-px-envelope-1';

/** A product named as the 0120 reads name it: 'TYPE:id@version'. */
export type ObjectRefText = string;

/* ── §PX PROVENANCE STRENGTH (§0's stub answers `unknown`) ── */
export const PROVENANCE_STRENGTHS = ['strong', 'partial', 'weak', 'broken', 'unknown'] as const;
export type ProvenanceStrengthValue = (typeof PROVENANCE_STRENGTHS)[number];
export const PROVENANCE_REASON_CODES = [
  'not_computed', 'gap', 'truncated', 'unresolved_citation', 'unsigned_human_step', 'undigested_model_call', 'withdrawn_input', 'corrected_input', 'unfit',
] as const;
export type ProvenanceReasonCode = (typeof PROVENANCE_REASON_CODES)[number];
export interface ProvenanceStrengthRow {
  ref: ObjectRefText;
  strength: ProvenanceStrengthValue;
  reasons: Array<{ code: ProvenanceReasonCode; detail: string; node_id?: string | null }>;
  rule_version: string;
  as_of: string;
}

/* ── §TS DISPLAY TRUTH (derived in a read, never stored) ── */
export const STORED_TRUTH_STATES = ['observed', 'asserted', 'extracted', 'inferred', 'assessed', 'synthetic', 'decided', 'disputed', 'withdrawn'] as const;
export type StoredTruthState = (typeof STORED_TRUTH_STATES)[number];
export const DERIVED_DISPLAY_STATES = ['recommended', 'corrected', 'indeterminate'] as const;
export type DisplayTruthState = StoredTruthState | (typeof DERIVED_DISPLAY_STATES)[number];
export const DISPLAY_REASON_CODES = [
  'recommendation_type', 'correction_of', 'corrected_by', 'contradiction', 'unfit', 'declared_absence', 'weak_provenance', 'withdrawn_input', 'unresolvable',
] as const;
export type DisplayReasonCode = (typeof DISPLAY_REASON_CODES)[number];
/** objects.display_truth(p_tenant, p_domain, p_refs jsonb) — p_refs: [{ type, id, version }]; one row per ref, in the order asked. */
export interface DisplayTruthRow {
  ref: ObjectRefText;
  stored: StoredTruthState;
  display: DisplayTruthState;
  basis: string;
  rule_version: string;
  reasons: Array<{ code: DisplayReasonCode; detail: string; ref?: ObjectRefText | null }>;
  /** what an INDETERMINATE (or a CORRECTED original) may not be used for; null when unconstrained */
  constrained_use: string | null;
  correction_of: ObjectRefText | null;
  corrected_by: ObjectRefText | null;
}

/* ── §EV CITATIONS, RIGHTS, VERIFICATION ── */
/** The citation kinds the decision options carry (0041 / 0111) and the object type each resolves to. */
export const CITATION_KIND_TYPES = {
  evidence: 'EVD', claim: 'CLM', entity: 'ENT', forecast: 'FCT', assumption: 'ASU', run: 'SIM', twin: 'TWN', scenario: 'SCN', warning: 'WRN', estimate: null,
} as const;
export type CitationKind = keyof typeof CITATION_KIND_TYPES;
export interface CitationRefRow { kind: CitationKind; id: string; version: number; digest: string | null }
export const LEAF_OUTCOMES = ['resolved', 'stale_citation', 'corrected', 'withdrawn', 'rights_expired', 'unverifiable', 'inaccessible'] as const;
export type LeafOutcome = (typeof LEAF_OUTCOMES)[number];
export const VERIFICATION_OUTCOMES = ['verified', 'failed', 'unavailable'] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];
export interface RightsTermsRow {
  terms_id: string; version: number; source_id: string; contract_version: number;
  /** null = "no expiry declared" (stated, never blank) */ expires_at: string | null;
  purposes: string[]; prohibited_uses: string[]; attribution: string | null;
  declared_by: string; declared_at: string; state: 'in_force' | 'expired' | 'withdrawn';
}
export interface CitationLeafRow {
  path: ObjectRefText[];
  evidence: { id: string; version: number; digest: string; byte_start: number; byte_end: number; media_type: string | null } | null;
  digest_ok: boolean | null;
  custody: { events: number; last_event_at: string | null } | null;
  rights: RightsTermsRow | null;
  tier: 'hot' | 'cold' | 'archived' | null;
  correction: { correction_of: ObjectRefText | null; corrected_by: ObjectRefText | null };
  outcome: LeafOutcome;
  detail: string | null;
}
/** graph.resolve_citation(p_tenant, p_domain, p_refs jsonb, p_depth int) — one row per ref; its outcome is the worst of its leaves. */
export interface CitationResolutionRow {
  ref: CitationRefRow; outcome: LeafOutcome; leaves: CitationLeafRow[]; truncated: boolean; depth: number; method: string; as_of: string;
}

/* ── §GM GEOGRAPHIC REFERENCES (EPSG:4326; typed by a named data steward; no tiles, no network) ── */
export const GEO_CRS = 'EPSG:4326' as const;
/** GeoJSON positions are [longitude, latitude] in degrees. */
export type GeoPosition = [number, number];
export type GeoGeometryRow =
  | { type: 'Point'; coordinates: GeoPosition }
  | { type: 'LineString'; coordinates: GeoPosition[] }
  | { type: 'Polygon'; coordinates: GeoPosition[][] };
export interface GeoReferenceRow {
  reference_id: string; version: number; key: string; label: string; geometry: GeoGeometryRow; crs: typeof GEO_CRS;
  source_statement: string; licence_statement: string;
  linked: { type: string; id: string } | null; chokepoint_key: string | null;
  declared_by: string; declared_at: string; state: 'active' | 'retired'; retired_by: string | null; retired_at: string | null;
}

/* ── §PX TRUST ── */
export const TRUST_FACETS = ['signature', 'lineage', 'custody', 'policy', 'evaluation', 'correction', 'rights', 'freshness'] as const;
export type TrustFacet = (typeof TRUST_FACETS)[number];
export interface TrustFacetRow { facet: TrustFacet; outcome: VerificationOutcome | 'not_checked'; detail: string; checked_at: string | null; checked_by: string | null }
export interface AttestationRow {
  attestation_id: string; subject: ObjectRefText; facets: TrustFacet[]; statement: string;
  attested_by: string; attested_at: string; withdrawn_at: string | null; withdrawn_by: string | null; withdraw_reason: string | null;
}
/** graph.trust_envelope(...) — facets, never a score; its digest binds what was shown. */
export interface TrustEnvelopeRow {
  subject: ObjectRefText; facets: TrustFacetRow[]; provenance: ProvenanceStrengthRow; attestations: AttestationRow[];
  rule_version: string; digest: string; as_of: string;
}

/**
 * THE REFUSAL NOUNS the parts raise (class form `<noun> rejected (<class>): …`), MAPPED CENTRALLY by the integrator at the fold
 * (observation-errors.ts, a `B82` block): 403 actor|authority|separation_of_duties|access · 404 unknown_* · 409 state|stale|duplicate|held|
 * expired · 422 otherwise. `provenance` and `read` are already mapped (B50 §PV; N-01).
 */
export const B82_REFUSAL_NOUNS = {
  '§TS': ['display truth'],
  '§EV': ['citation resolution', 'evidence segment', 'rights terms'],
  '§GM': ['geographic reference'],
  '§PX': ['trust verification', 'trust attestation', 'trust investigation'],
} as const;
