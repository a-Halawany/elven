-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0121 — CP-6 B82: THE TRUST, EVIDENCE, PROVENANCE AND EXPLANATION EXPERIENCE (F-P7-E-07) and THE EVIDENCE-BEARING STRATEGIC VISUALIZATION
-- LIBRARY (F-P7-E-21), with the rows of B80's / B81's features carried here (§RE: C-047, UX-19-003, CAP-UM-02 and the eight ratchets).
-- 0001–0120 are applied or committed and untouched.
--
-- §0 PRELUDE (the integrator): ONE shared read the parts would otherwise both declare — graph.provenance_strength(tenant, domain, type, id,
-- version), here an INERT STUB that answers `unknown` (it never looks at the object). §TS's objects.display_truth calls it for the
-- weak-provenance reason; §PX replaces it WHOLE (same signature, volatility, security, return type and grants) with the real strength —
-- strong | partial | weak | broken, with reasons from graph.explain's gaps, truncation, unresolved citations, unsigned human steps and
-- undigested model calls. No table, no role, no permission (DESIGN D9: NO new permission), no object type, no vocabulary.
--
-- THE PARTS, each in its own section of this file at the fold (their own files 0121_b82_x_<part>.sql while they are built):
--   §TS  truth, uncertainty, the AI notice, freshness   objects.display_truth (RECOMMENDED / CORRECTED / INDETERMINATE derived in a read,
--                                                       never stored; the nine stored truth states and the 43-field header untouched)
--   §EV  evidence, citation, custody, rights           observation.rights_terms (+ events) and its port; graph.resolve_citation; the bounded
--                                                       segment read; objects._lineage_usable re-declared WHOLE from 0120 (refusals only added)
--   §CF  the chart frame and the quantitative charts    web only (one correlation read beside the exposures' declare route, if any SQL)
--   §GM  the graph and map canvases (+ UX-19-003)       graph.geo_references (+ events; EPSG:4326, typed by a named data steward) and
--                                                       graph.geo_layer
--   §SC  scenario, decision, risk, operations charts    web only
--   §PX  provenance, explanation, dissent, trust        graph.provenance_strength (replacing §0's stub), graph.trust_envelope,
--                                                       graph.trust_verifications, graph.trust_attestations (+ events), the investigation
--                                                       attention class
-- FOLDED in the order §0, §TS, §EV, §GM, §PX (§CF and §SC carry no SQL beyond §CF's read, folded after §GM if it exists).
--
-- THE PRINCIPLES (binding on every part): presentation never changes meaning; display truth is DERIVED, never stored; a citation resolves to
-- exactly what it names or says why it cannot (stale, corrected, withdrawn, rights expired, unverifiable, inaccessible); a verification that
-- cannot be made is UNAVAILABLE, never FAILED; trust is shown as facets, never as a score; an attestation is a person's recorded statement —
-- never an approval, never by an agent, never by the producer or owner; every chart declares its grammar and carries its table alternative;
-- no chart or map library, no new colour token, no tiles and no network for a map. THREE CLAIMS: construction (this migration and its
-- harnesses); demonstrated operation (the act — SYNTHETIC personas, `claim = 'demonstration'`); real acceptance (B111's shared recording
-- path, then H3) — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §0.1 THE PROVENANCE-STRENGTH STUB ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- A READ (the 0120 idiom): STABLE, SECURITY DEFINER, a fixed search path, the caller's scope asserted first (observation.assert_read_scope —
-- `read rejected (scope)` 42501), the subject's shape checked (`provenance rejected (subject)` 22023 → 422, the noun B50 mapped). The stub
-- never reads the object: an unknown id answers `unknown` too (§PX's version refuses it `provenance rejected (unknown_object)` 23503 → 404).
-- The answer's shape is the contract §PX keeps (apps/api/src/graph/b82-seams.ts ProvenanceStrengthRow):
--   { ref: 'TYPE:id@version', strength: 'unknown', reasons: [{ code: 'not_computed', detail }], rule_version: 'b82-px-strength-0', as_of }
-- Granted like every guarded read: REVOKE ALL FROM PUBLIC; EXECUTE to eye_app and eye_commit.
CREATE OR REPLACE FUNCTION graph.provenance_strength(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the provenance strength of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance rejected (subject): a provenance-strength read names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  -- B82 §0: the stub. §PX replaces this function WHOLE; until then nothing is inferred — the strength is unknown, and says why.
  RETURN jsonb_build_object(
    'ref', p_type || ':' || p_id::text || '@' || p_version::text,
    'strength', 'unknown',
    'reasons', jsonb_build_array(jsonb_build_object('code', 'not_computed', 'detail', 'the provenance strength is not computed yet (B82 §0 stub; §PX computes it)')),
    'rule_version', 'b82-px-strength-0',
    'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION graph.provenance_strength(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.provenance_strength(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;
