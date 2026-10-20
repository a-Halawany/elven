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

-- ═════════════════════════════════════════════════
-- THE FOLD (B82 integration, 2026-10-19): the parts follow §0 in the order §TS, §EV, §GM, §PX (§CF and §SC are web only). Each part applied on
-- its own over 0001–0120 + §0 (§PX over wave 1) in its own harness; §PX re-declares §0's graph.provenance_strength whole (the computed
-- strength). The text of each part is unchanged below its fold line.
-- ═════════════════════════════════════════════════

-- ═══ FOLD §TS (from 0121_b82_x_ts.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0121 §TS (B82 part `ts`; folded into 0121 after §0) — DISPLAY TRUTH: RECOMMENDED / CORRECTED / INDETERMINATE DERIVED IN A READ, NEVER STORED
-- (F-P7-E-07: TS-06, TS-08, TS-10, HX-02, UX-06-004/-005/-006, UX-ADR-005/-009, REL-06/-07).
--
-- The canonical header keeps its nine stored truth states (0006:30-31; contracts truth-state.ts:9-19) and its 43 fields: no header field, no
-- back-fill, no new truth_state value, no table. The three DISPLAY states are the contract's own rule (truth-state.ts:56-71 — "recommended:
-- derived from object type (Recommendation) + truth state; never stored", "corrected: new version linked via correction_of; display state
-- derived from linkage", "indeterminate: shown when required truth state is unresolvable; storage keeps object non-decision-active"):
--
--   objects.display_truth(p_tenant uuid, p_domain uuid, p_refs jsonb) RETURNS jsonb
--     p_refs = [{ type, id, version }] (1–200; a recommendation is { type: 'REC', id, version: 1 } — its content is immutable);
--     answers one row per ref IN THE ORDER ASKED (apps/api/src/graph/b82-seams.ts DisplayTruthRow):
--       { ref, stored, display, basis, rule_version, reasons[{code, detail, ref}], constrained_use, correction_of, corrected_by }
--     plus two ADDITIVE fields the pages read beside it: `lifecycle` (the stored lifecycle state — a separate dimension, never collapsed into
--     the truth state) and `agent_authored` (the record's author is an agent — the AI notice's trigger; never a reason to show it decided).
--
-- THE RULE (b82-ts-display-1), in precedence order:
--   1. stored WITHDRAWN stays WITHDRAWN (identity and history retained; the reasons still listed).
--   2. INDETERMINATE when a required state cannot be resolved — any of: an open contradiction or one adjudicated "both stand"
--      (intelligence.contradictions, 0066 §5); the latest fitness mark UNFIT (graph.product_fitness_marks, B50 §PV); a declared absence of a
--      field the type's header profile requires a VALUE for (objects.header_profiles.value_required — CLM / WRN confidence, FCT uncertainty);
--      a BROKEN provenance strength (graph.provenance_strength — §0's stub answers `unknown`, which adds nothing; §PX computes it); a later
--      version of the object WITHDRAWN, or a cited input version withdrawn; a DECIDED version no recorded human stands behind.
--   3. CORRECTED when the version is a correction (correction_of) — linked to the preserved original.
--   4. RECOMMENDED for a recommendation (decision.recommendations, B35) that is not withdrawn — advisory, never a decision; a recommendation
--      never reads DECIDED (the decision is the package's own record), whoever authored it.
--   5. otherwise the stored state, unchanged ("as stored").
--   A WEAK provenance strength adds the reason `weak_provenance` without changing the display; a corrected ORIGINAL keeps its stored state and
--   says "superseded by correction vN" (corrected_by, constrained_use).
--
-- THE READ (the 0120 idiom): STABLE, SECURITY DEFINER, a fixed search path, observation.assert_read_scope FIRST (`read rejected (scope)`), every
-- object looked up WITHIN the caller's tenant and domain (an object of another scope is as unknown as one never recorded — no existence oracle);
-- REVOKE ALL FROM PUBLIC; EXECUTE to eye_app and eye_commit. It writes nothing (gate22's machine classification reads it as a non-mutator).
-- Refusals in the CLASS form (the integrator maps the noun `display truth` centrally): `display truth rejected (refs)` 22023 → 422 (a malformed
-- request), `display truth rejected (unknown_object)` / `(unknown_version)` 23503 → 404.
--
-- THREE CLAIMS: construction (this read and phase6-truth-b82); demonstrated operation (the act, SYNTHETIC); real acceptance (UX-06-006: the
-- shared recording path at B111, then H3) — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION objects.display_truth(p_tenant uuid, p_domain uuid, p_refs jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, intelligence, graph, decision, identity, observation, pg_catalog, pg_temp AS $$
DECLARE
  r jsonb; v_type text; v_id uuid; v_ver int; v_key text; o objects.canonical_objects%ROWTYPE; rec decision.recommendations%ROWTYPE;
  v_reasons jsonb; v_ind boolean; v_display text; v_stored text; v_basis text; v_constrained text; v_corr_of text; v_corr_by text;
  v_lifecycle text; v_agent boolean; x record; v_strength jsonb; pr objects.header_profiles%ROWTYPE; f text; v jsonb; v_out jsonb := '[]'::jsonb;
  v_human boolean; v_later record; v_n int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the display truth of a product');
  IF p_refs IS NULL OR jsonb_typeof(p_refs) <> 'array' OR jsonb_array_length(p_refs) = 0 OR jsonb_array_length(p_refs) > 200 THEN
    RAISE EXCEPTION 'display truth rejected (refs): a display-truth read names 1 to 200 recorded products as [{ type, id, version }]' USING ERRCODE = '22023';
  END IF;
  -- every ref's shape first (a malformed request is refused whole, before anything is looked up)
  FOR r IN SELECT e FROM jsonb_array_elements(p_refs) AS t(e) LOOP
    v_n := v_n + 1;
    IF jsonb_typeof(r) <> 'object' OR coalesce(r ->> 'type', '') !~ '^[A-Z]{3}$'
       OR coalesce(r ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(r ->> 'version', '') !~ '^[1-9][0-9]{0,8}$' THEN
      RAISE EXCEPTION 'display truth rejected (refs): ref % names no recorded product as { type (three capitals), id (a uuid), version (1 or more) }', v_n USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR r IN SELECT e FROM jsonb_array_elements(p_refs) AS t(e) LOOP
    v_type := r ->> 'type'; v_id := (r ->> 'id')::uuid; v_ver := (r ->> 'version')::int; v_key := v_type || ':' || v_id::text || '@' || v_ver::text;
    v_reasons := '[]'::jsonb; v_ind := false; v_constrained := NULL; v_corr_of := NULL; v_corr_by := NULL; v_agent := false;

    -- ── a RECOMMENDATION (B35): no stored truth state; derived RECOMMENDED from its type, never DECIDED ──
    IF v_type = 'REC' THEN
      SELECT * INTO rec FROM decision.recommendations d WHERE d.recommendation_id = v_id AND d.tenant_id = p_tenant AND d.domain_id = p_domain;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'display truth rejected (unknown_object): % is not recorded in this tenant and domain', v_key USING ERRCODE = '23503';
      END IF;
      IF v_ver <> 1 THEN
        RAISE EXCEPTION 'display truth rejected (unknown_version): a recommendation''s content is immutable — it has version 1 only (asked %)', v_key USING ERRCODE = '23503';
      END IF;
      v_agent := rec.author_kind = 'agent';
      v_lifecycle := rec.state;
      v_stored := 'asserted';
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'recommendation_type', 'ref', NULL,
        'detail', format('a recommendation (%s) authored by %s on package %s v%s option %s — advisory; the decision is the package''s own record',
                         replace(rec.state, '_', ' '), CASE WHEN v_agent THEN 'the Decision Agent (AI)' ELSE 'a named person' END, rec.package_id, rec.version, rec.option_key)));
      IF rec.state = 'withdrawn' THEN
        v_display := 'withdrawn';
        v_basis := format('a recommendation carries no stored truth state (recorded as its author''s attributable proposal, asserted); withdrawn %s: %s', graph.pv_iso(rec.withdrawn_at), coalesce(rec.withdrawal_reason, ''));
        v_constrained := 'withdrawn — kept for history; not offered for consideration';
      ELSE
        v_display := 'recommended';
        v_basis := 'a recommendation carries no stored truth state (recorded as its author''s attributable proposal, asserted); its type makes it RECOMMENDED — advisory, not a decision';
        v_constrained := CASE rec.state
          WHEN 'superseded' THEN format('advisory, not a decision — superseded by recommendation %s (%s)', rec.superseded_by, coalesce(rec.superseded_reason, ''))
          WHEN 'declined' THEN 'advisory, not a decision — declined for consideration by its reviewer'
          WHEN 'accepted_for_consideration' THEN 'advisory, not a decision — accepted FOR CONSIDERATION by a named reviewer; the decision is still the package''s'
          ELSE 'advisory, not a decision — awaiting a named reviewer who is not its author' END;
      END IF;
      v_out := v_out || jsonb_build_array(jsonb_build_object('ref', v_key, 'stored', v_stored, 'display', v_display, 'basis', v_basis, 'rule_version', 'b82-ts-display-1',
        'reasons', v_reasons, 'constrained_use', v_constrained, 'correction_of', NULL, 'corrected_by', NULL, 'lifecycle', v_lifecycle, 'agent_authored', v_agent));
      CONTINUE;
    END IF;

    -- ── a CANONICAL object version, looked up within the caller's tenant and domain ──
    SELECT * INTO o FROM objects.canonical_objects c
     WHERE c.object_id = v_id AND c.object_version = v_ver AND c.object_type = v_type AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_id = v_id AND c.object_type = v_type AND c.tenant_id = p_tenant AND c.domain_id = p_domain) THEN
        RAISE EXCEPTION 'display truth rejected (unknown_version): % — the object is recorded here, that version is not', v_key USING ERRCODE = '23503';
      END IF;
      RAISE EXCEPTION 'display truth rejected (unknown_object): % is not recorded in this tenant and domain', v_key USING ERRCODE = '23503';
    END IF;
    v_stored := o.truth_state; v_lifecycle := o.lifecycle_state;
    v_agent := o.accountable_owner LIKE 'agent:%'
      OR EXISTS (SELECT 1 FROM identity.principals p WHERE p.kind = 'agent' AND p.id::text = regexp_replace(o.accountable_owner, '^principal:', ''));

    -- (a) the correction linkage (0006: correction_of = '<id>@<version>'; a correction is a new version of the same object)
    IF o.correction_of IS NOT NULL THEN
      v_corr_of := v_type || ':' || o.correction_of;
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'correction_of', 'ref', v_corr_of, 'detail', format('this version corrects %s (the original is preserved)', v_corr_of)));
    END IF;
    SELECT c.object_version, c.recorded_at INTO v_later FROM objects.canonical_objects c
     WHERE c.object_id = v_id AND c.object_version > v_ver AND c.correction_of = v_id::text || '@' || v_ver::text ORDER BY c.object_version LIMIT 1;
    IF FOUND THEN
      v_corr_by := v_type || ':' || v_id::text || '@' || v_later.object_version::text;
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'corrected_by', 'ref', v_corr_by,
        'detail', format('superseded by correction v%s (recorded %s) — this version is the preserved original', v_later.object_version, graph.pv_iso(v_later.recorded_at))));
      v_constrained := format('superseded by correction v%s — the preserved original; read the correction for any decision-active use', v_later.object_version);
    END IF;

    -- (b) contradictions not resolved by adjudication (open, or adjudicated "both stand")
    FOR x IN SELECT k.contradiction_id, k.state, k.adjudication,
                    CASE WHEN k.a_object_id = v_id AND k.a_version = v_ver THEN k.b_object_id ELSE k.a_object_id END AS other_id,
                    CASE WHEN k.a_object_id = v_id AND k.a_version = v_ver THEN k.b_version ELSE k.a_version END AS other_ver
               FROM intelligence.contradictions k
              WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain
                AND ((k.a_object_id = v_id AND k.a_version = v_ver) OR (k.b_object_id = v_id AND k.b_version = v_ver))
                AND (k.state = 'open' OR k.adjudication = 'both_stand')
              ORDER BY k.detected_at LOOP
      v_ind := true;
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'contradiction', 'ref', 'CLM:' || x.other_id::text || '@' || x.other_ver::text,
        'detail', CASE WHEN x.state = 'open' THEN format('contradiction %s is open — contradicted by CLM:%s@%s, not yet adjudicated', x.contradiction_id, x.other_id, x.other_ver)
                       ELSE format('contradiction %s was adjudicated "both stand" — CLM:%s@%s stands beside it', x.contradiction_id, x.other_id, x.other_ver) END));
    END LOOP;

    -- (c) the latest fitness mark (B50 §PV): UNFIT
    FOR x IN SELECT fm.mark_id, fm.verdict, fm.reasons, fm.marked_at FROM graph.product_fitness_marks fm
              WHERE fm.object_id = v_id AND fm.object_version = v_ver AND fm.tenant_id = p_tenant ORDER BY fm.marked_at DESC LIMIT 1 LOOP
      IF x.verdict = 'unfit' THEN
        v_ind := true;
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'unfit', 'ref', NULL,
          'detail', format('marked UNFIT (%s) by mark %s at %s', array_to_string(x.reasons, ', '), x.mark_id, graph.pv_iso(x.marked_at))));
      END IF;
    END LOOP;

    -- (d) a declared absence of a field the type's header profile requires a VALUE for (a decision-active use cannot rest on it)
    SELECT * INTO pr FROM objects.header_profiles p WHERE p.object_type = v_type AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1;
    IF FOUND THEN
      FOREACH f IN ARRAY pr.value_required LOOP
        v := to_jsonb(o) -> f;
        IF v IS NOT NULL AND jsonb_typeof(v) = 'object' AND (v ->> 'state') IN ('not_assessed', 'not_applicable', 'unknown') THEN
          v_ind := true;
          v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'declared_absence', 'ref', NULL,
            'detail', format('%s is a declared absence (%s: %s) — header profile %s@%s requires a value for a decision-active use', f, v ->> 'state', coalesce(v ->> 'reason', ''), v_type, pr.profile_version)));
        END IF;
      END LOOP;
    END IF;

    -- (e) the provenance strength (§0's stub answers `unknown`, which adds nothing; §PX computes strong | partial | weak | broken)
    v_strength := graph.provenance_strength(p_tenant, p_domain, v_type, v_id, v_ver);
    IF v_strength ->> 'strength' IN ('weak', 'broken') THEN
      IF v_strength ->> 'strength' = 'broken' THEN v_ind := true; END IF;
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'weak_provenance', 'ref', NULL,
        'detail', format('provenance strength %s (%s)', upper(v_strength ->> 'strength'),
                         coalesce((SELECT string_agg(z ->> 'detail', '; ') FROM jsonb_array_elements(coalesce(v_strength -> 'reasons', '[]'::jsonb)) z), 'no reason given'))));
    END IF;

    -- (f) withdrawn: a later version of the object, or a cited input version
    SELECT c.object_version, c.recorded_at, c.withdrawal_reason INTO v_later FROM objects.canonical_objects c
     WHERE c.object_id = v_id AND c.object_version > v_ver AND (c.truth_state = 'withdrawn' OR c.lifecycle_state = 'withdrawn') ORDER BY c.object_version LIMIT 1;
    IF FOUND AND o.truth_state <> 'withdrawn' THEN
      v_ind := true;
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'withdrawn_input', 'ref', v_type || ':' || v_id::text || '@' || v_later.object_version::text,
        'detail', format('the object was withdrawn at v%s (recorded %s%s) — this earlier version is not current', v_later.object_version, graph.pv_iso(v_later.recorded_at),
                         CASE WHEN v_later.withdrawal_reason IS NULL THEN '' ELSE ': ' || v_later.withdrawal_reason END)));
    END IF;
    FOR x IN SELECT DISTINCT m[1] AS t, m[2]::uuid AS id, m[3]::int AS ver
               FROM (SELECT regexp_match(e, '^([A-Z]{3}):([0-9a-fA-F-]{36})(?:@([0-9]{1,9}))?$') AS m
                       FROM (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(o.evidence_refs) = 'array' THEN o.evidence_refs ELSE '[]'::jsonb END)
                             UNION ALL SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(o.source_object_ids) = 'array' THEN o.source_object_ids ELSE '[]'::jsonb END)) s(e)
                      LIMIT 500) q
              WHERE m IS NOT NULL LOOP
      IF EXISTS (SELECT 1 FROM objects.canonical_objects c
                  WHERE c.object_id = x.id AND c.object_type = x.t AND c.tenant_id = p_tenant AND c.truth_state = 'withdrawn'
                    AND (x.ver IS NULL OR c.object_version = x.ver)
                    AND (x.ver IS NOT NULL OR c.object_version = (SELECT max(c2.object_version) FROM objects.canonical_objects c2 WHERE c2.object_id = x.id))) THEN
        v_ind := true;
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'withdrawn_input', 'ref', x.t || ':' || x.id::text || coalesce('@' || x.ver::text, ''),
          'detail', format('a cited input %s:%s%s is WITHDRAWN', x.t, x.id, coalesce('@' || x.ver::text, ' (its current version)'))));
      END IF;
    END LOOP;

    -- (g) DECIDED with no recorded human standing behind it (an agent never decides — UX-ADR-009)
    IF o.truth_state = 'decided' THEN
      v_human := EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(o.human_refs) = 'array' THEN o.human_refs ELSE '[]'::jsonb END) h(v)
                          JOIN identity.principals p ON p.id::text = regexp_replace(h.v, '^principal:', '') AND p.kind = 'human');
      IF NOT v_human THEN
        v_ind := true;
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('code', 'unresolvable', 'ref', NULL,
          'detail', 'stored DECIDED but no recorded human stands behind this version — a decision is a named human''s act; an agent never decides'));
      END IF;
    END IF;

    -- THE RULE, in precedence order
    IF o.truth_state = 'withdrawn' THEN
      v_display := 'withdrawn';
      v_basis := CASE WHEN jsonb_array_length(v_reasons) = 0 THEN 'as stored — withdrawn; identity and history retained' ELSE 'stored WITHDRAWN stays withdrawn; identity and history retained (the reasons below are kept for the record)' END;
      v_constrained := coalesce('withdrawn' || CASE WHEN o.withdrawal_reason IS NULL THEN '' ELSE ': ' || o.withdrawal_reason END || ' — not for current use', v_constrained);
    ELSIF v_ind THEN
      v_display := 'indeterminate';
      v_basis := format('stored %s; a required state cannot be resolved (%s) — shown INDETERMINATE', upper(o.truth_state),
                        (SELECT string_agg(DISTINCT z ->> 'code', ', ') FROM jsonb_array_elements(v_reasons) z WHERE z ->> 'code' NOT IN ('correction_of', 'corrected_by')));
      v_constrained := 'not for a decision-active use (derive an option, approve, publish, export) until resolved' || coalesce('; ' || v_constrained, '');
    ELSIF o.correction_of IS NOT NULL THEN
      v_display := 'corrected';
      v_basis := format('stored %s; this version is a correction of %s (linked; the original preserved) — shown CORRECTED', upper(o.truth_state), v_corr_of);
    ELSE
      v_display := o.truth_state;
      v_basis := 'as stored';
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('ref', v_key, 'stored', v_stored, 'display', v_display, 'basis', v_basis, 'rule_version', 'b82-ts-display-1',
      'reasons', v_reasons, 'constrained_use', v_constrained, 'correction_of', v_corr_of, 'corrected_by', v_corr_by, 'lifecycle', v_lifecycle, 'agent_authored', v_agent));
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION objects.display_truth(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.display_truth(uuid, uuid, jsonb) TO eye_app, eye_commit;
COMMENT ON FUNCTION objects.display_truth(uuid, uuid, jsonb) IS 'B82 §TS (0121; TS-06/08/10, HX-02): the DISPLAY truth of products — RECOMMENDED / CORRECTED / INDETERMINATE derived in a read (rule b82-ts-display-1), never stored; one row per ref in the order asked, with the stored state, the basis, the reasons and the constrained use. A guarded read: the caller''s tenant and domain only.';

-- ═══ FOLD §EV (from 0121_b82_x_ev.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0121 §EV — CP-6 B82: EVIDENCE, CITATION, CUSTODY, RIGHTS, VERIFICATION (F-P7-E-07 chapter 26: UX-26-001…006, CMP-025…028, CMP-030…032,
-- HX-01, UX-ADR-006, REL-08; CAP-UM-02's chapter-26 half). The part's own file while it is built; the integrator folds it into 0121 in the
-- order §0, §TS, §EV, §GM, §PX. Applies ALONE on 0001–0120 + the prelude (0121_b82_trust_evidence_visualization.sql).
--
-- WHAT THIS SECTION ADDS
--   observation.rights_terms (+ observation.rights_terms_events)   the RIGHTS TERMS of one source contract version, in a SEPARATE record
--        (DESIGN D10): the expiry ("no expiry declared" when none), the permitted purposes, the prohibited uses, the attribution — declared,
--        revised and withdrawn by a named data steward or collection manager (human-gated; the port re-checks the role, the person, the
--        acting principal); append-only, versioned per series (source, contract version). The source contract and its schema are UNCHANGED
--        (contract v2 authority_and_rights, 0028:48-66, is read, never rewritten). The state `expired` is DERIVED at read time (expires_at
--        ≤ now), never stored.
--   observation.declare_rights_terms / observation.withdraw_rights_terms   the two ports (eye_commit)
--   observation.rights_terms_read                                          the read (eye_app, eye_commit; read scope asserted)
--   graph.resolve_citation(p_tenant, p_domain, p_refs jsonb, p_depth int)  THE CITATION RESOLUTION: each {kind, id, version, digest} →
--        the cited version (its digest checked: a digest binding the version or, for evidence, its bytes) → the recorded lineage
--        (B50's closure: header evidence_refs / source_object_ids, a claim's byte span, correction_of, option citations, publication
--        sources — bounded by p_depth) → every EVIDENCE leaf with its bytes digest, span, custody, rights, tier and correction state, and an
--        outcome: resolved | stale_citation | corrected | withdrawn | rights_expired | unverifiable | inaccessible; the citation's outcome is
--        the worst of its own and its leaves'. A read: STABLE, SECURITY DEFINER, the caller's scope asserted first (the route's PDP action is
--        the EXISTING graph.provenance.read — no new permission, DESIGN D9). It reads no bytes: the bytes are re-hashed by the segment
--        read (the EXISTING observation.evidence.retrieve authority, TypeScript), which is the only path to them.
--   objects._lineage_usable                                                RE-DECLARED WHOLE from its last definition (0120:4749, B50 pv): every
--        B50 check kept in order and text; ADDED after them (marked `-- B82 ev`): a decision-active use (an option, a publication, an export,
--        a gate act) is REFUSED when the evidence it rests on — the object itself, a claim's lineage evidence, the header's evidence_refs,
--        the constructed upstream (eight steps, B50's reach) — failed integrity after its last verified custody (integrity_failed), cannot
--        be reached or was governed-deleted (inaccessible), or rests on rights terms that expired or were withdrawn (rights_expired).
--        Refusals only added (UX-26-004); no port's meaning changes.
--
-- D9 (DESIGN): NO new permission to read evidence. The two new PDP actions are the rights terms' acts (observation.rights.declare,
-- observation.rights.withdraw — the data steward and the collection manager, human-gated); no role gains observation.read or
-- observation.evidence.retrieve; the decision roles resolve a citation SHORT OF THE BYTES (graph.provenance.read, which they already hold).
--
-- THE REFUSAL NOUNS (class form; mapped centrally by the integrator — NOT mapped here):
--   `citation resolution rejected (<class>)`  (citations) / (citation) / (depth) 22023 → 422
--   `rights terms rejected (<class>)`         (actor) / (authority) 42501 → 403 · (unknown_source) / (unknown_terms) 23503 → 404 ·
--                                             (stale) / (state) / (duplicate) 23514 / 23505 → 409 · (request) / (purposes) / (prohibited_uses) /
--                                             (attribution) / (reason) / (expiry) 22023 → 422
--   `object use rejected (<class>)`           (integrity_failed) / (inaccessible) / (rights_expired) 22023 → 409 (B50 §0's noun; the three new
--                                             classes join its 409 row at the fold)
--   `evidence segment rejected (<class>)`     raised by the TypeScript route (span) 422 · (oversize) 422 · (version) 404
--
-- THREE CLAIMS: CONSTRUCTION (this file and phase6-evidence-b82); DEMONSTRATED OPERATION (the act — SYNTHETIC personas, `claim =
-- 'demonstration'`); REAL ACCEPTANCE (B111's shared recording path, then H3) — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §EV.1 THE RIGHTS TERMS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.rights_terms (
  terms_id          uuid NOT NULL,
  version           int  NOT NULL CHECK (version >= 1),
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  source_id         uuid NOT NULL,
  contract_version  int  NOT NULL CHECK (contract_version >= 1),
  state             text NOT NULL CHECK (state IN ('in_force', 'withdrawn')),
  expires_at        timestamptz,                              -- NULL: no expiry declared (stated so by every read, never blank)
  purposes          jsonb NOT NULL CHECK (jsonb_typeof(purposes) = 'array'),
  prohibited_uses   jsonb NOT NULL CHECK (jsonb_typeof(prohibited_uses) = 'array'),
  attribution       text CHECK (attribution IS NULL OR length(btrim(attribution)) BETWEEN 2 AND 512),
  reason            text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  declared_by       uuid NOT NULL,
  declared_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  supersedes        int,
  request_id        uuid NOT NULL UNIQUE,
  correlation_id    uuid NOT NULL,
  PRIMARY KEY (terms_id, version),
  CONSTRAINT ort_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ort_supersedes CHECK ((version = 1 AND supersedes IS NULL) OR (version > 1 AND supersedes = version - 1)),
  CONSTRAINT ort_first_in_force CHECK (version > 1 OR state = 'in_force')
);
COMMENT ON TABLE observation.rights_terms IS 'B82 §EV (DESIGN D10; CMP-031, UX-26-002/004): the versioned RIGHTS TERMS of one source contract version — expiry (NULL = no expiry declared), permitted purposes, prohibited uses, attribution — declared, revised or withdrawn by a named data steward or collection manager; a separate record (the source contract unchanged). Expired is derived at read time (expires_at <= now). Append-only.';
CREATE UNIQUE INDEX ort_series ON observation.rights_terms (tenant_id, domain_id, source_id, contract_version, version);
CREATE INDEX ort_source ON observation.rights_terms (source_id, contract_version, version DESC);
CREATE TRIGGER ort_append_only BEFORE UPDATE OR DELETE ON observation.rights_terms FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.rights_terms_events (
  event_id          uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  terms_id          uuid NOT NULL,
  terms_version     int  NOT NULL,
  source_id         uuid NOT NULL,
  contract_version  int  NOT NULL,
  event             text NOT NULL CHECK (event IN ('rights.declared', 'rights.revised', 'rights.withdrawn')),
  actor             uuid NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  details           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id    uuid NOT NULL,
  FOREIGN KEY (terms_id, terms_version) REFERENCES observation.rights_terms (terms_id, version),
  CONSTRAINT orte_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.rights_terms_events IS 'B82 §EV: the ledger of the rights-terms acts (declared, revised, withdrawn) — who, when, what changed; append-only.';
CREATE INDEX orte_terms ON observation.rights_terms_events (terms_id, occurred_at);
CREATE TRIGGER orte_append_only BEFORE UPDATE OR DELETE ON observation.rights_terms_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

REVOKE ALL ON observation.rights_terms, observation.rights_terms_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rights_terms', 'rights_terms_events'] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY ort_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §EV.2 THE RIGHTS HELPERS (internal; no runtime grant) ───────────────────────────────────────────────────────────────────────────────────
/* The state a reader is given: withdrawn as recorded; expired when the declared expiry is at or before the instant; in force otherwise. */
CREATE OR REPLACE FUNCTION observation.rt_state(r observation.rights_terms, p_at timestamptz) RETURNS text
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN r.terms_id IS NULL THEN NULL
              WHEN r.state = 'withdrawn' THEN 'withdrawn'
              WHEN r.expires_at IS NOT NULL AND r.expires_at <= p_at THEN 'expired'
              ELSE 'in_force' END
$$;
REVOKE ALL ON FUNCTION observation.rt_state(observation.rights_terms, timestamptz) FROM PUBLIC;

/* One version in the seam's shape (RightsTermsRow, apps/api/src/graph/b82-seams.ts) + the recorded state, the reason and the expiry in words. */
CREATE OR REPLACE FUNCTION observation.rt_json(r observation.rights_terms, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN r.terms_id IS NULL THEN NULL ELSE jsonb_build_object(
    'terms_id', r.terms_id, 'version', r.version, 'source_id', r.source_id, 'contract_version', r.contract_version,
    'expires_at', graph.pv_iso(r.expires_at), 'purposes', r.purposes, 'prohibited_uses', r.prohibited_uses, 'attribution', r.attribution,
    'declared_by', r.declared_by, 'declared_at', graph.pv_iso(r.declared_at), 'state', observation.rt_state(r, p_at), 'recorded_state', r.state,
    'reason', r.reason, 'supersedes', r.supersedes,
    'expiry_statement', CASE WHEN r.expires_at IS NULL THEN 'no expiry declared'
                             WHEN r.expires_at <= p_at THEN 'expired at ' || graph.pv_iso(r.expires_at)
                             ELSE 'expires at ' || graph.pv_iso(r.expires_at) END) END
$$;
REVOKE ALL ON FUNCTION observation.rt_json(observation.rights_terms, timestamptz) FROM PUBLIC;

/* The current (latest) version of one series, or a row of NULLs. Reached only from the definer functions below (which run as the owner). */
CREATE OR REPLACE FUNCTION observation.rt_current(p_tenant uuid, p_domain uuid, p_source uuid, p_contract_version int) RETURNS observation.rights_terms
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT r.* FROM observation.rights_terms r
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.source_id = p_source AND r.contract_version = p_contract_version
   ORDER BY r.version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION observation.rt_current(uuid, uuid, uuid, int) FROM PUBLIC;

/* A list of short statements (purposes, prohibited uses): its problem in words, or NULL. */
CREATE OR REPLACE FUNCTION observation.rt_list_problem(p jsonb, p_what text, p_min int) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN p_what || ' is a list of short statements'
    WHEN jsonb_array_length(p) < p_min OR jsonb_array_length(p) > 20 THEN p_what || ' holds ' || p_min || ' to 20 statements'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(p) x WHERE jsonb_typeof(x) <> 'string' OR length(btrim(x #>> '{}')) < 2 OR length(x #>> '{}') > 200)
      THEN 'each of the ' || p_what || ' is 2 to 200 characters'
    WHEN (SELECT count(DISTINCT lower(btrim(x #>> '{}'))) FROM jsonb_array_elements(p) x) <> jsonb_array_length(p) THEN p_what || ' name each statement once'
  END
$$;
REVOKE ALL ON FUNCTION observation.rt_list_problem(jsonb, text, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.rt_list(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(btrim(x #>> '{}')) ORDER BY o), '[]'::jsonb) FROM jsonb_array_elements(p) WITH ORDINALITY AS t(x, o)
$$;
REVOKE ALL ON FUNCTION observation.rt_list(jsonb) FROM PUBLIC;

/* The acting principal: the bound principal and the actor the route names are one (an agent or a system is refused by assert_approver). */
CREATE OR REPLACE FUNCTION observation.rt_actor(p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'rights terms rejected (actor): the act is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION observation.rt_actor(uuid) FROM PUBLIC;

-- §EV.3 DECLARE (version 1) OR REVISE (the next version) ────────────────────────────────────────────────────────────────────────────────────
/* A named data steward or collection manager declares the rights terms of one source contract version recorded in this domain, or revises
   the version they READ (p_expected_version; 0 when none). A request id replayed by the same person for the same series answers the
   recorded version (`replayed`), never a second one; by another person or for another series it is refused (duplicate). */
CREATE OR REPLACE FUNCTION observation.declare_rights_terms(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int, p_expected_version int,
  p_expires_at timestamptz, p_purposes jsonb, p_prohibited_uses jsonb, p_attribution text, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r observation.rights_terms%ROWTYPE; prev observation.rights_terms%ROWTYPE; v_has_prev boolean; v_problem text;
        v_id uuid; v_version int; v_purposes jsonb; v_prohibited jsonb; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.rights.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.rt_actor(p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'rights terms rejected (request): a declaration carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  -- THE REPLAY: the same request id answers what it recorded; never a second effect
  SELECT * INTO r FROM observation.rights_terms t WHERE t.request_id = p_request_id;
  IF FOUND THEN
    IF r.declared_by IS DISTINCT FROM v_actor OR r.source_id IS DISTINCT FROM p_source_id OR r.contract_version IS DISTINCT FROM p_contract_version
       OR r.tenant_id IS DISTINCT FROM p_tenant OR r.domain_id IS DISTINCT FROM p_domain OR r.state <> 'in_force' THEN
      RAISE EXCEPTION 'rights terms rejected (duplicate): request % already recorded another act; a new declaration takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.rt_json(r, v_at) || jsonb_build_object('replayed', true);
  END IF;
  -- WHO: a named active person holding data_steward or collection_manager here (never an agent, never a system)
  PERFORM governance.assert_approver('rights terms', v_actor, p_tenant, p_domain, ARRAY['data_steward', 'collection_manager'], NULL, NULL, 'declaring a source''s rights terms');
  IF p_source_id IS NULL OR p_contract_version IS NULL OR NOT EXISTS (
       SELECT 1 FROM observation.source_contracts_current s
        WHERE s.source_id = p_source_id AND s.contract_version = p_contract_version AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
    RAISE EXCEPTION 'rights terms rejected (unknown_source): source % contract version % is not recorded in this domain', coalesce(p_source_id::text, '<none>'), coalesce(p_contract_version::text, '<none>') USING ERRCODE = '23503';
  END IF;
  v_problem := observation.rt_list_problem(p_purposes, 'purposes', 1);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'rights terms rejected (purposes): % (what the evidence of this source may be used for)', v_problem USING ERRCODE = '22023'; END IF;
  v_problem := observation.rt_list_problem(coalesce(p_prohibited_uses, '[]'::jsonb), 'prohibited uses', 0);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'rights terms rejected (prohibited_uses): %', v_problem USING ERRCODE = '22023'; END IF;
  v_purposes := observation.rt_list(p_purposes); v_prohibited := observation.rt_list(coalesce(p_prohibited_uses, '[]'::jsonb));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_purposes) a JOIN jsonb_array_elements_text(v_prohibited) b ON lower(a) = lower(b)) THEN
    RAISE EXCEPTION 'rights terms rejected (prohibited_uses): a use is either permitted or prohibited, never both' USING ERRCODE = '22023';
  END IF;
  IF p_attribution IS NOT NULL AND (length(btrim(p_attribution)) < 2 OR length(p_attribution) > 512) THEN
    RAISE EXCEPTION 'rights terms rejected (attribution): an attribution, when the terms require one, is 2 to 512 characters' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at < timestamptz '2000-01-01' THEN
    RAISE EXCEPTION 'rights terms rejected (expiry): the expiry is an instant on or after 2000-01-01, or none (no expiry declared)' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'rights terms rejected (reason): a reason of 8 to 2000 characters says where the terms come from (the licence, the agreement, the notice)' USING ERRCODE = '22023';
  END IF;
  -- one act at a time per series; the declarer revises only the version they read
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.rights:' || p_tenant || ':' || p_domain || ':' || p_source_id || ':' || p_contract_version, 0));
  prev := observation.rt_current(p_tenant, p_domain, p_source_id, p_contract_version);
  v_has_prev := prev.terms_id IS NOT NULL;
  IF coalesce(p_expected_version, -1) IS DISTINCT FROM (CASE WHEN v_has_prev THEN prev.version ELSE 0 END) THEN
    RAISE EXCEPTION 'rights terms rejected (stale): the rights terms of source % v% are at version %; this declaration read %', p_source_id, p_contract_version,
      CASE WHEN v_has_prev THEN prev.version ELSE 0 END, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  v_id := CASE WHEN v_has_prev THEN prev.terms_id ELSE gen_random_uuid() END;
  v_version := CASE WHEN v_has_prev THEN prev.version + 1 ELSE 1 END;
  INSERT INTO observation.rights_terms (terms_id, version, scope, tenant_id, domain_id, source_id, contract_version, state, expires_at, purposes, prohibited_uses,
                                        attribution, reason, declared_by, supersedes, request_id, correlation_id)
  VALUES (v_id, v_version, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, 'in_force', p_expires_at, v_purposes, v_prohibited,
          nullif(btrim(coalesce(p_attribution, '')), ''), btrim(p_reason), v_actor, CASE WHEN v_version > 1 THEN v_version - 1 END, p_request_id, p_correlation)
  RETURNING * INTO r;
  INSERT INTO observation.rights_terms_events (event_id, scope, tenant_id, domain_id, terms_id, terms_version, source_id, contract_version, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_id, v_version, p_source_id, p_contract_version,
          CASE WHEN v_version = 1 THEN 'rights.declared' ELSE 'rights.revised' END, v_actor,
          jsonb_build_object('expires_at', graph.pv_iso(p_expires_at), 'purposes', v_purposes, 'prohibited_uses', v_prohibited, 'supersedes', r.supersedes,
                             'previous_state', CASE WHEN v_has_prev THEN prev.state END), p_correlation);
  RETURN observation.rt_json(r, v_at) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.declare_rights_terms(uuid, uuid, uuid, uuid, int, int, timestamptz, jsonb, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.declare_rights_terms(uuid, uuid, uuid, uuid, int, int, timestamptz, jsonb, jsonb, text, text, uuid, uuid) TO eye_commit;

-- §EV.4 WITHDRAW ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The rights are withdrawn (the publisher revoked them, the agreement ended): a new version in state `withdrawn`, its reason stated; the
   evidence of that source contract version is then refused at every decision-active use (objects._lineage_usable). A later declaration
   (rights granted again) is a new version. */
CREATE OR REPLACE FUNCTION observation.withdraw_rights_terms(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_terms_id uuid, p_expected_version int, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r observation.rights_terms%ROWTYPE; prev observation.rights_terms%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.rights.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.rt_actor(p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'rights terms rejected (request): a withdrawal carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM observation.rights_terms t WHERE t.request_id = p_request_id;
  IF FOUND THEN
    IF r.declared_by IS DISTINCT FROM v_actor OR r.terms_id IS DISTINCT FROM p_terms_id OR r.state <> 'withdrawn' THEN
      RAISE EXCEPTION 'rights terms rejected (duplicate): request % already recorded another act; a new withdrawal takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.rt_json(r, v_at) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('rights terms', v_actor, p_tenant, p_domain, ARRAY['data_steward', 'collection_manager'], NULL, NULL, 'withdrawing a source''s rights terms');
  SELECT * INTO prev FROM observation.rights_terms t WHERE t.terms_id = p_terms_id AND t.tenant_id = p_tenant AND t.domain_id = p_domain ORDER BY t.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rights terms rejected (unknown_terms): rights terms % are not recorded in this domain', coalesce(p_terms_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'rights terms rejected (reason): a withdrawal states its reason in 8 to 2000 characters (what ended the rights, and since when)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.rights:' || p_tenant || ':' || p_domain || ':' || prev.source_id || ':' || prev.contract_version, 0));
  SELECT * INTO prev FROM observation.rights_terms t WHERE t.terms_id = p_terms_id ORDER BY t.version DESC LIMIT 1;
  IF prev.state = 'withdrawn' THEN
    RAISE EXCEPTION 'rights terms rejected (state): rights terms % are withdrawn since version %; a new declaration grants them again', p_terms_id, prev.version USING ERRCODE = '23514';
  END IF;
  IF p_expected_version IS DISTINCT FROM prev.version THEN
    RAISE EXCEPTION 'rights terms rejected (stale): rights terms % are at version %; this withdrawal read %', p_terms_id, prev.version, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  INSERT INTO observation.rights_terms (terms_id, version, scope, tenant_id, domain_id, source_id, contract_version, state, expires_at, purposes, prohibited_uses,
                                        attribution, reason, declared_by, supersedes, request_id, correlation_id)
  VALUES (prev.terms_id, prev.version + 1, 'DOMAIN', p_tenant, p_domain, prev.source_id, prev.contract_version, 'withdrawn', prev.expires_at, prev.purposes, prev.prohibited_uses,
          prev.attribution, btrim(p_reason), v_actor, prev.version, p_request_id, p_correlation)
  RETURNING * INTO r;
  INSERT INTO observation.rights_terms_events (event_id, scope, tenant_id, domain_id, terms_id, terms_version, source_id, contract_version, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.terms_id, r.version, r.source_id, r.contract_version, 'rights.withdrawn', v_actor,
          jsonb_build_object('supersedes', r.supersedes, 'reason', r.reason), p_correlation);
  RETURN observation.rt_json(r, v_at) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.withdraw_rights_terms(uuid, uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.withdraw_rights_terms(uuid, uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

-- §EV.5 THE RIGHTS READ ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Per contract version of one source recorded in this domain: the contract's own rights statement (contract v2 authority_and_rights, read
   as recorded), the current rights terms (or "no rights terms declared — no expiry declared"), the full history and the ledger. */
CREATE OR REPLACE FUNCTION observation.rights_terms_read(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_versions jsonb := '[]'::jsonb; s record; cur observation.rights_terms;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the rights terms of a source');
  IF p_source_id IS NULL OR NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'rights terms rejected (unknown_source): source % is not recorded in this domain', coalesce(p_source_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  FOR s IN SELECT x.contract_version, x.rights_state, x.lifecycle_state, x.name, x.contract -> 'authority_and_rights' AS ar
             FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.contract_version DESC LOOP
    cur := observation.rt_current(p_tenant, p_domain, p_source_id, s.contract_version);
    v_versions := v_versions || jsonb_build_array(jsonb_build_object(
      'contract_version', s.contract_version, 'contract_state', s.lifecycle_state, 'source_name', s.name,
      'contract_rights', jsonb_build_object('rights_state', s.rights_state, 'licence', s.ar ->> 'licence', 'permitted_use', coalesce(s.ar -> 'permitted_use', '[]'::jsonb),
                                            'purposes', coalesce(s.ar -> 'purposes', '[]'::jsonb), 'attribution', s.ar ->> 'attribution', 'retention', s.ar ->> 'retention',
                                            'legal_basis', s.ar ->> 'legal_basis'),
      'current', observation.rt_json(cur, v_at),
      'statement', CASE WHEN cur.terms_id IS NULL THEN 'no rights terms declared for this contract version — no expiry declared'
                        ELSE coalesce(observation.rt_state(cur, v_at), '') || ' · ' || (observation.rt_json(cur, v_at) ->> 'expiry_statement') END,
      'history', (SELECT coalesce(jsonb_agg(observation.rt_json(t, v_at) ORDER BY t.version), '[]'::jsonb) FROM observation.rights_terms t
                   WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.source_id = p_source_id AND t.contract_version = s.contract_version),
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'terms_version', e.terms_version, 'actor', e.actor, 'at', graph.pv_iso(e.occurred_at), 'details', e.details)
                   ORDER BY e.occurred_at, e.event_id), '[]'::jsonb) FROM observation.rights_terms_events e
                   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.source_id = p_source_id AND e.contract_version = s.contract_version)));
  END LOOP;
  RETURN jsonb_build_object('source_id', p_source_id, 'versions', v_versions, 'as_of', graph.pv_iso(v_at));
END $$;
REVOKE ALL ON FUNCTION observation.rights_terms_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.rights_terms_read(uuid, uuid, uuid) TO eye_app, eye_commit;

-- §EV.6 ONE EVIDENCE VERSION'S STATE (internal; no runtime grant) ─────────────────────────────────────────────────────────────────────────
/* What a reader and a decision-active use need to know about one evidence version, from STORED rows only (no bytes are read here):
   the bytes digest and the manifest's; custody — the last verified event (admitted / imported / restored / verified / finalized, or a
   retrieval that verified the digest) against the last integrity failure (an integrity failure AFTER the last verified custody is
   `integrity_failed`); the last retrieval (`custody.retrieval_degraded` last = the tier's root could not be reached); a tombstone (the
   bytes governed-deleted); the tier; the rights terms of its source contract version (expired / withdrawn); a later correction or
   withdrawal; the cited span within the bytes (out of range = unverifiable). The outcome is the worst finding, every reason kept. */
CREATE OR REPLACE FUNCTION graph.ev_evidence_state(p_tenant uuid, p_domain uuid, p_id uuid, p_version int, p_span_start int, p_span_end int, p_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, objects, pg_catalog, pg_temp AS $$
DECLARE
  e objects.canonical_objects; m observation.blob_manifests%ROWTYPE; v_has_m boolean := false; v_manifest uuid; v_digest text; v_len bigint; v_media text;
  v_last_ok timestamptz; v_failed timestamptz; v_last_read text; v_failed_flag boolean := false; v_unreachable boolean := false; v_tomb boolean := false;
  v_tier text := 'hot'; v_src uuid; v_cv int; rt observation.rights_terms; v_rights_state text; v_contract_rights text;
  v_corrected_by text; v_withdrawn_since int; v_events int; v_last_at timestamptz; v_outcome text := 'resolved'; v_reasons text[] := '{}'; v_detail text[] := '{}';
  v_digest_ok boolean; v_start bigint; v_end bigint; v_artifact_ok boolean := true;
BEGIN
  SELECT * INTO e FROM objects.canonical_objects o
   WHERE o.object_type = 'EVD' AND o.object_id = p_id AND o.object_version = p_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ref', 'EVD:' || p_id || '@' || p_version, 'evidence', NULL, 'digest_ok', NULL, 'custody', NULL, 'rights', NULL, 'tier', NULL,
      'correction', jsonb_build_object('correction_of', NULL, 'corrected_by', NULL), 'outcome', 'inaccessible', 'reasons', jsonb_build_array('not_recorded'),
      'integrity_failed', false, 'unreachable', false, 'tombstoned', false, 'rights_state', NULL,
      'detail', format('evidence %s v%s is not recorded in this domain (or is not visible to this reader)', p_id, p_version));
  END IF;
  v_digest := e.payload ->> 'content_digest';
  v_len := CASE WHEN (e.payload ->> 'byte_length') ~ '^[0-9]{1,15}$' THEN (e.payload ->> 'byte_length')::bigint END;
  v_media := coalesce(e.payload ->> 'media_type_sniffed', e.payload ->> 'media_type_declared');
  IF coalesce(e.payload ->> 'manifest_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_manifest := (e.payload ->> 'manifest_id')::uuid; END IF;
  IF v_manifest IS NOT NULL THEN
    SELECT * INTO m FROM observation.blob_manifests b WHERE b.manifest_id = v_manifest AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    v_has_m := FOUND;
  END IF;
  IF v_len IS NULL AND v_has_m THEN v_len := m.byte_length; END IF;
  -- custody (B21.2's rows and phase 1's; the B50 reading of "established", plus a retrieval that verified the digest)
  SELECT count(*)::int, max(c.occurred_at) INTO v_events, v_last_at FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest));
  SELECT max(c.occurred_at) INTO v_last_ok FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest))
     AND (c.event IN ('custody.admitted', 'custody.imported', 'custody.restored', 'custody.verified', 'custody.finalized') OR (c.event = 'custody.retrieved' AND c.digest_verified IS TRUE))
     AND (c.content_digest IS NULL OR c.content_digest = v_digest);
  SELECT max(c.occurred_at) INTO v_failed FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest))
     AND (c.event = 'custody.integrity_failed' OR c.digest_verified IS FALSE);
  v_failed_flag := v_failed IS NOT NULL AND (v_last_ok IS NULL OR v_failed >= v_last_ok);
  SELECT c.event INTO v_last_read FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest))
     AND c.event IN ('custody.retrieved', 'custody.retrieval_degraded', 'custody.integrity_failed')
   ORDER BY c.occurred_at DESC, c.event_id DESC LIMIT 1;
  v_unreachable := v_last_read IS NOT DISTINCT FROM 'custody.retrieval_degraded';
  v_tomb := v_manifest IS NOT NULL AND EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = v_manifest);
  IF v_manifest IS NOT NULL THEN
    SELECT CASE WHEN tr.tier = 'archive' THEN 'archived' ELSE 'hot' END INTO v_tier FROM observation.blob_tier_records tr
     WHERE tr.manifest_id = v_manifest ORDER BY tr.moved_at DESC, tr.record_id DESC LIMIT 1;
    v_tier := coalesce(v_tier, 'hot');
  END IF;
  -- the rights terms of the source contract version the evidence was collected under (provenance_ref SRC:<id>@<contract version>)
  IF coalesce(e.provenance_ref, '') ~* '^SRC:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[1-9][0-9]{0,8}$' THEN
    v_src := substring(e.provenance_ref from 5 for 36)::uuid; v_cv := split_part(e.provenance_ref, '@', 2)::int;
    rt := observation.rt_current(p_tenant, p_domain, v_src, v_cv);
    v_rights_state := observation.rt_state(rt, p_at);
    SELECT s.rights_state INTO v_contract_rights FROM observation.source_contracts_current s WHERE s.source_id = v_src AND s.contract_version = v_cv AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  END IF;
  -- a later correction of this version; a withdrawal (this version, or a later one)
  SELECT 'EVD:' || x.object_id || '@' || x.object_version INTO v_corrected_by FROM objects.canonical_objects x
   WHERE x.object_type = 'EVD' AND x.object_id = p_id AND x.object_version > p_version AND x.correction_of IN (p_id::text || '@' || p_version, 'EVD:' || p_id::text || '@' || p_version)
   ORDER BY x.object_version LIMIT 1;
  SELECT min(x.object_version) INTO v_withdrawn_since FROM objects.canonical_objects x
   WHERE x.object_type = 'EVD' AND x.object_id = p_id AND x.object_version >= p_version AND x.lifecycle_state IN ('withdrawn', 'deleted');
  -- the span: the cited bytes within the evidence's bytes (the whole object when the citation names no span)
  v_start := coalesce(p_span_start, 0); v_end := coalesce(p_span_end, v_len);
  -- THE FINDINGS (every one kept; the outcome is the worst)
  IF v_tomb THEN v_reasons := v_reasons || text 'tombstoned'; v_detail := v_detail || text 'the bytes were governed-deleted (tombstoned); the record remains'; END IF;
  IF v_unreachable THEN v_reasons := v_reasons || text 'tier_unreachable'; v_detail := v_detail || text 'the last retrieval found the tier''s root unreachable (EYE-DEG-001); nothing about the bytes was verified or refuted since'; END IF;
  IF NOT v_has_m THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'no_manifest'; v_detail := v_detail || text 'no blob manifest is recorded for these bytes in this domain';
  ELSIF m.content_digest IS DISTINCT FROM v_digest THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'digest_mismatch'; v_detail := v_detail || format('the manifest records bytes digest %s…; the evidence names %s…', left(m.content_digest, 12), left(coalesce(v_digest, '<none>'), 12));
  END IF;
  IF v_failed_flag THEN
    v_reasons := v_reasons || text 'integrity_failed';
    v_detail := v_detail || format('the bytes failed integrity at %s, after the last verified custody%s', graph.pv_iso(v_failed), CASE WHEN v_last_ok IS NULL THEN '' ELSE ' at ' || graph.pv_iso(v_last_ok) END);
  END IF;
  IF e.payload ? 'authenticity' AND coalesce(e.payload #>> '{authenticity,byte_integrity}', '') <> 'verified' THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'byte_integrity_unverified'; v_detail := v_detail || format('byte integrity is recorded as %s, not verified', coalesce(e.payload #>> '{authenticity,byte_integrity}', '<unstated>'));
  END IF;
  IF v_start < 0 OR v_end IS NULL OR v_end < v_start OR (v_len IS NOT NULL AND v_end > v_len) THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'span_out_of_range';
    v_detail := v_detail || format('the cited span %s–%s does not lie within the %s recorded bytes', v_start, coalesce(v_end::text, '?'), coalesce(v_len::text, 'unknown number of'));
  END IF;
  IF v_rights_state IN ('expired', 'withdrawn') THEN
    v_reasons := v_reasons || ('rights_' || v_rights_state);
    v_detail := v_detail || format('the rights terms of its source contract (v%s) are %s (%s)', rt.version, v_rights_state, observation.rt_json(rt, p_at) ->> 'expiry_statement');
  END IF;
  IF v_withdrawn_since IS NOT NULL THEN
    v_reasons := v_reasons || text 'withdrawn';
    v_detail := v_detail || CASE WHEN v_withdrawn_since = p_version THEN 'this version is withdrawn' ELSE format('withdrawn since v%s', v_withdrawn_since) END;
  END IF;
  IF v_corrected_by IS NOT NULL THEN v_reasons := v_reasons || text 'corrected'; v_detail := v_detail || format('corrected since by %s', v_corrected_by); END IF;
  v_outcome := CASE
    WHEN v_tomb OR v_unreachable THEN 'inaccessible'
    WHEN v_failed_flag OR NOT v_artifact_ok THEN 'unverifiable'
    WHEN v_rights_state IN ('expired', 'withdrawn') THEN 'rights_expired'
    WHEN v_withdrawn_since IS NOT NULL THEN 'withdrawn'
    WHEN v_corrected_by IS NOT NULL THEN 'corrected'
    ELSE 'resolved' END;
  v_digest_ok := CASE WHEN NOT v_has_m THEN NULL WHEN m.content_digest IS DISTINCT FROM v_digest OR v_failed_flag THEN false ELSE true END;
  RETURN jsonb_build_object(
    'ref', 'EVD:' || p_id || '@' || p_version,
    'evidence', jsonb_build_object('id', p_id, 'version', p_version, 'digest', v_digest, 'byte_start', v_start, 'byte_end', v_end, 'media_type', v_media, 'byte_length', v_len,
                                   'content_digest', e.content_digest, 'lifecycle', e.lifecycle_state, 'truth_state', e.truth_state, 'synthetic', e.synthetic_state,
                                   'recorded_at', graph.pv_iso(e.recorded_at), 'source_id', v_src, 'contract_version', v_cv,
                                   'fragment', CASE WHEN e.payload ? 'fragment' THEN (e.payload -> 'fragment') || jsonb_build_object('parent_evd_id', e.payload ->> 'parent_evd_id') END),
    'digest_ok', v_digest_ok,
    'custody', jsonb_build_object('events', coalesce(v_events, 0), 'last_event_at', graph.pv_iso(v_last_at), 'last_verified_at', graph.pv_iso(v_last_ok), 'last_failed_at', graph.pv_iso(v_failed),
                                  'state', CASE WHEN v_failed_flag THEN 'integrity_failed' WHEN v_last_ok IS NULL THEN 'not_established' ELSE 'intact' END),
    'rights', observation.rt_json(rt, p_at), 'contract_rights_state', v_contract_rights,
    'tier', CASE WHEN v_manifest IS NULL THEN NULL ELSE v_tier END,
    'correction', jsonb_build_object('correction_of', CASE WHEN e.correction_of IS NULL THEN NULL ELSE 'EVD:' || regexp_replace(e.correction_of, '^EVD:', '') END, 'corrected_by', v_corrected_by),
    'outcome', v_outcome, 'reasons', to_jsonb(v_reasons), 'detail', CASE WHEN cardinality(v_detail) = 0 THEN NULL ELSE array_to_string(v_detail, '; ') END,
    'integrity_failed', v_failed_flag, 'unreachable', v_unreachable, 'tombstoned', v_tomb, 'rights_state', v_rights_state);
END $$;
REVOKE ALL ON FUNCTION graph.ev_evidence_state(uuid, uuid, uuid, int, int, int, timestamptz) FROM PUBLIC;

/* The seven outcomes, least to most severe (the citation's outcome is the worst of its own and its leaves'). */
CREATE OR REPLACE FUNCTION graph.ev_rank(p text) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(array_position(ARRAY['resolved', 'corrected', 'stale_citation', 'withdrawn', 'rights_expired', 'unverifiable', 'inaccessible'], p), 7)
$$;
CREATE OR REPLACE FUNCTION graph.ev_worst(a text, b text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN b IS NULL THEN a WHEN a IS NULL THEN b WHEN graph.ev_rank(b) > graph.ev_rank(a) THEN b ELSE a END
$$;
/* A citation kind → the canonical object type it names (decision.citations_ok 0041, twin.citations_ok 0111); estimate names no object type. */
CREATE OR REPLACE FUNCTION graph.ev_kind_type(p_kind text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p_kind WHEN 'evidence' THEN 'EVD' WHEN 'claim' THEN 'CLM' WHEN 'entity' THEN 'ENT' WHEN 'forecast' THEN 'FCT' WHEN 'assumption' THEN 'ASU'
                     WHEN 'run' THEN 'SIM' WHEN 'twin' THEN 'TWN' WHEN 'scenario' THEN 'SCN' WHEN 'warning' THEN 'WRN' END
$$;
REVOKE ALL ON FUNCTION graph.ev_rank(text), graph.ev_worst(text, text), graph.ev_kind_type(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.ev_rank(text), graph.ev_worst(text, text), graph.ev_kind_type(text) TO eye_app, eye_commit;

-- §EV.7 THE CITATION RESOLUTION ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* graph.resolve_citation(p_tenant, p_domain, p_refs, p_depth) — one answer per citation, in the order asked (CitationResolutionRow):
     { ref: {kind, id, version, digest}, outcome, own: {outcome, digest_binds, detail, object}, leaves: [CitationLeafRow + reasons], truncated,
       depth, method: 'b82-ev-resolve-1', as_of }
   THE CITED VERSION: recorded in this domain (else inaccessible — denied and absent read the same); its digest: the version's canonical
   digest (`digest_binds: 'version'`), or for evidence the bytes digest (`'bytes'` — what a twin's state element carries), or none carried
   (`'none'`, stated); any other digest is a STALE citation. A later correction of the version (corrected_by), a withdrawal of it or of a
   later version (withdrawn since), an invalidated run, a withdrawn forecast — each stated, each an outcome.
   THE LEAVES: an evidence citation is its own leaf; any other kind descends the RECORDED lineage (graph.pv_closure — B50's closure, bounded
   by p_depth steps and 200 objects) to every evidence version it reaches, each leaf with its path from the cited object, the claim's byte
   span where the lineage records one, and graph.ev_evidence_state. An unresolved reference on the way is an `unverifiable` leaf with its
   reason; a lineage that reaches no evidence says so (an `unverifiable` leaf: "reaches no evidence bytes"). At most 100 leaves (truncated). */
CREATE OR REPLACE FUNCTION graph.resolve_citation(p_tenant uuid, p_domain uuid, p_refs jsonb, p_depth int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, observation, twin, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE
  c jsonb; v_out jsonb := '[]'::jsonb; v_depth int := coalesce(p_depth, 4); v_type text; o objects.canonical_objects; v_found boolean; v_at timestamptz := clock_timestamp();
  v_own text; v_own_detail text[]; v_binds text; v_leaves jsonb; cl jsonb; ob jsonb; ed jsonb; v_parent jsonb; v_path jsonb; v_cur text; v_i int; v_span jsonb;
  st jsonb; v_outcome text; v_truncated boolean; v_corrected_by text; v_withdrawn_since int; v_key text; v_root text; v_n int; g jsonb; v_est record; v_rd record;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the resolution of a citation');
  IF p_refs IS NULL OR jsonb_typeof(p_refs) <> 'array' OR jsonb_array_length(p_refs) < 1 OR jsonb_array_length(p_refs) > 50 THEN
    RAISE EXCEPTION 'citation resolution rejected (citations): a resolution names 1 to 50 citations, each {kind, id, version, digest}' USING ERRCODE = '22023';
  END IF;
  IF v_depth < 1 OR v_depth > 8 THEN
    RAISE EXCEPTION 'citation resolution rejected (depth): the lineage is descended 1 to 8 steps (asked %)', v_depth USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT x FROM jsonb_array_elements(p_refs) x LOOP
    IF jsonb_typeof(c) <> 'object' OR jsonb_typeof(c -> 'kind') IS DISTINCT FROM 'string'
       OR NOT ((c ->> 'kind') = ANY (ARRAY['evidence', 'claim', 'entity', 'forecast', 'assumption', 'run', 'twin', 'scenario', 'warning', 'estimate']))
       OR jsonb_typeof(c -> 'id') IS DISTINCT FROM 'string' OR (c ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(c -> 'version') IS DISTINCT FROM 'number' OR (c ->> 'version') !~ '^[1-9][0-9]{0,8}$'
       OR NOT (c -> 'digest' IS NULL OR jsonb_typeof(c -> 'digest') = 'null' OR (jsonb_typeof(c -> 'digest') = 'string' AND (c ->> 'digest') ~ '^[0-9a-f]{64}$')) THEN
      RAISE EXCEPTION 'citation resolution rejected (citation): % is not a citation — {kind (evidence, claim, entity, forecast, assumption, run, twin, scenario, warning, estimate), id, version ≥ 1, digest (64 hex) or null}',
        left(c::text, 200) USING ERRCODE = '22023';
    END IF;
    v_own := 'resolved'; v_own_detail := '{}'; v_binds := 'none'; v_leaves := '[]'::jsonb; v_truncated := false; v_corrected_by := NULL; v_withdrawn_since := NULL;
    v_type := graph.ev_kind_type(c ->> 'kind');
    -- ── an ESTIMATE (twin.estimates — no canonical object): the inputs digest; the resolver does not descend into an estimate's inputs ──
    IF c ->> 'kind' = 'estimate' THEN
      SELECT x.estimate_id, x.inputs_digest, x.twin_id INTO v_est FROM twin.estimates x WHERE x.estimate_id = (c ->> 'id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND THEN
        v_own := 'inaccessible'; v_own_detail := v_own_detail || format('estimate %s is not recorded in this domain (or is not visible to this reader)', c ->> 'id');
      ELSE
        IF c ->> 'digest' IS NULL THEN v_own_detail := v_own_detail || 'the citing record carried no digest'::text;
        ELSIF c ->> 'digest' = v_est.inputs_digest THEN v_binds := 'version';
        ELSE v_own := 'stale_citation'; v_own_detail := v_own_detail || format('the citation carries digest %s…; the estimate''s inputs digest is %s…', left(c ->> 'digest', 12), left(v_est.inputs_digest, 12));
        END IF;
        v_leaves := jsonb_build_array(jsonb_build_object('path', jsonb_build_array('estimate:' || (c ->> 'id')), 'evidence', NULL, 'digest_ok', NULL, 'custody', NULL, 'rights', NULL, 'tier', NULL,
          'correction', jsonb_build_object('correction_of', NULL, 'corrected_by', NULL), 'outcome', 'unverifiable', 'reasons', jsonb_build_array('not_descended'),
          'detail', format('an estimate''s inputs are read on its twin (%s); the citation resolver does not descend into an estimate', v_est.twin_id)));
      END IF;
      v_outcome := v_own;
      FOR ob IN SELECT x FROM jsonb_array_elements(v_leaves) x LOOP v_outcome := graph.ev_worst(v_outcome, ob ->> 'outcome'); END LOOP;
      v_out := v_out || jsonb_build_array(jsonb_build_object('ref', jsonb_build_object('kind', c ->> 'kind', 'id', lower(c ->> 'id'), 'version', (c ->> 'version')::int, 'digest', c ->> 'digest'),
        'outcome', v_outcome, 'own', jsonb_build_object('outcome', v_own, 'digest_binds', v_binds, 'detail', CASE WHEN cardinality(v_own_detail) = 0 THEN NULL ELSE array_to_string(v_own_detail, '; ') END, 'object', NULL),
        'leaves', v_leaves, 'truncated', false, 'depth', v_depth, 'method', 'b82-ev-resolve-1', 'as_of', graph.pv_iso(v_at)));
      CONTINUE;
    END IF;
    -- ── THE CITED VERSION ──
    SELECT * INTO o FROM objects.canonical_objects x
     WHERE x.object_type = v_type AND x.object_id = (c ->> 'id')::uuid AND x.object_version = (c ->> 'version')::int AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    v_found := FOUND;
    IF NOT v_found THEN
      v_own := 'inaccessible';
      v_own_detail := v_own_detail || format('%s %s v%s is not recorded in this domain (or is not visible to this reader)', v_type, c ->> 'id', c ->> 'version');
    ELSE
      v_root := o.object_type || ':' || o.object_id || '@' || o.object_version;
      IF c ->> 'digest' IS NULL THEN v_binds := 'none'; v_own_detail := v_own_detail || 'the citing record carried no digest; the version is named, not bound'::text;
      ELSIF c ->> 'digest' = o.content_digest THEN v_binds := 'version';
      ELSIF v_type = 'EVD' AND c ->> 'digest' = o.payload ->> 'content_digest' THEN v_binds := 'bytes';
      ELSE
        v_own := graph.ev_worst(v_own, 'stale_citation');
        v_own_detail := v_own_detail || format('the citation carries digest %s…; %s records %s…', left(c ->> 'digest', 12), v_root, left(o.content_digest, 12));
      END IF;
      SELECT x.object_type || ':' || x.object_id || '@' || x.object_version INTO v_corrected_by FROM objects.canonical_objects x
       WHERE x.object_type = o.object_type AND x.object_id = o.object_id AND x.object_version > o.object_version
         AND x.correction_of IN (o.object_id::text || '@' || o.object_version, o.object_type || ':' || o.object_id::text || '@' || o.object_version)
       ORDER BY x.object_version LIMIT 1;
      IF v_corrected_by IS NOT NULL THEN v_own := graph.ev_worst(v_own, 'corrected'); v_own_detail := v_own_detail || format('corrected since by %s', v_corrected_by); END IF;
      SELECT min(x.object_version) INTO v_withdrawn_since FROM objects.canonical_objects x
       WHERE x.object_type = o.object_type AND x.object_id = o.object_id AND x.object_version >= o.object_version AND x.lifecycle_state IN ('withdrawn', 'deleted');
      IF v_withdrawn_since IS NOT NULL THEN
        v_own := graph.ev_worst(v_own, 'withdrawn');
        v_own_detail := v_own_detail || CASE WHEN v_withdrawn_since = o.object_version THEN 'this version is withdrawn' ELSE format('withdrawn since v%s', v_withdrawn_since) END;
      END IF;
      IF v_type = 'SIM' THEN
        SELECT r.validity, r.invalidated_at INTO v_rd FROM simulation.runs_current r WHERE r.run_id = o.object_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
        IF FOUND AND v_rd.validity = 'invalidated' THEN v_own := graph.ev_worst(v_own, 'withdrawn'); v_own_detail := v_own_detail || format('the run was invalidated at %s', graph.pv_iso(v_rd.invalidated_at)); END IF;
      ELSIF v_type = 'FCT' THEN
        IF EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = o.object_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.state = 'withdrawn') THEN
          v_own := graph.ev_worst(v_own, 'withdrawn'); v_own_detail := v_own_detail || 'the forecast was withdrawn as unfit'::text;
        END IF;
      END IF;
      -- ── THE LEAVES ──
      IF v_type = 'EVD' THEN
        st := graph.ev_evidence_state(p_tenant, p_domain, o.object_id, o.object_version::int, NULL::int, NULL::int, v_at);
        v_leaves := jsonb_build_array(jsonb_build_object('path', jsonb_build_array(v_root)) || (st - 'ref'));
      ELSE
        cl := graph.pv_closure(p_tenant, p_domain, o.object_type, o.object_id, o.object_version::int, v_depth, 200);
        v_truncated := coalesce((cl ->> 'truncated')::boolean, false);
        -- the first parent of each object (breadth first), to state each leaf's path from the cited version
        v_parent := '{}'::jsonb;
        FOR ed IN SELECT x FROM jsonb_array_elements(coalesce(cl -> 'edges', '[]'::jsonb)) x LOOP
          IF ed ->> 'to' IS NOT NULL AND ed ->> 'to' <> v_root AND NOT (v_parent ? (ed ->> 'to')) THEN v_parent := v_parent || jsonb_build_object(ed ->> 'to', ed ->> 'from'); END IF;
        END LOOP;
        v_n := 0;
        FOR ob IN SELECT x FROM jsonb_array_elements(coalesce(cl -> 'objects', '[]'::jsonb)) x WHERE x ->> 'type' = 'EVD' LOOP
          IF v_n >= 100 THEN v_truncated := true; EXIT; END IF;
          v_key := ob ->> 'key';
          v_path := jsonb_build_array(v_key); v_cur := v_key; v_i := 0;
          WHILE v_parent ? v_cur AND v_i < 16 LOOP v_cur := v_parent ->> v_cur; v_path := jsonb_build_array(v_cur) || v_path; v_i := v_i + 1; END LOOP;
          IF v_path ->> 0 IS DISTINCT FROM v_root THEN v_path := jsonb_build_array(v_root) || v_path; END IF;
          SELECT x -> 'span' INTO v_span FROM jsonb_array_elements(cl -> 'edges') x WHERE x ->> 'to' = v_key AND x ->> 'basis' = 'claim_lineage' AND jsonb_typeof(x -> 'span') = 'object' LIMIT 1;
          st := graph.ev_evidence_state(p_tenant, p_domain, (ob ->> 'id')::uuid, (ob ->> 'version')::int,
                  CASE WHEN v_span IS NULL THEN NULL ELSE (v_span ->> 'start')::int END, CASE WHEN v_span IS NULL THEN NULL ELSE (v_span ->> 'end')::int END, v_at);
          v_leaves := v_leaves || jsonb_build_array(jsonb_build_object('path', v_path, 'span_basis', CASE WHEN v_span IS NULL THEN 'whole_object' ELSE 'claim_lineage' END) || (st - 'ref'));
          v_n := v_n + 1;
        END LOOP;
        -- references on the way that resolve to no evidence bytes: unverifiable leaves with their reasons (the gap preserved)
        FOR g IN SELECT x FROM jsonb_array_elements(coalesce(cl -> 'gaps', '[]'::jsonb)) x
                  WHERE x ->> 'kind' IN ('incomplete_lineage', 'unverifiable_artifact') AND coalesce(x ->> 'ref', '') NOT IN (SELECT y ->> 'key' FROM jsonb_array_elements(cl -> 'objects') y) LOOP
          IF v_n >= 100 THEN v_truncated := true; EXIT; END IF;
          v_leaves := v_leaves || jsonb_build_array(jsonb_build_object('path', jsonb_build_array(v_root, g ->> 'ref'), 'evidence', NULL, 'digest_ok', NULL, 'custody', NULL, 'rights', NULL, 'tier', NULL,
            'correction', jsonb_build_object('correction_of', NULL, 'corrected_by', NULL), 'outcome', 'unverifiable', 'reasons', jsonb_build_array(g ->> 'kind'), 'detail', g ->> 'reason'));
          v_n := v_n + 1;
        END LOOP;
        IF jsonb_array_length(v_leaves) = 0 THEN
          v_leaves := jsonb_build_array(jsonb_build_object('path', jsonb_build_array(v_root), 'evidence', NULL, 'digest_ok', NULL, 'custody', NULL, 'rights', NULL, 'tier', NULL,
            'correction', jsonb_build_object('correction_of', NULL, 'corrected_by', NULL), 'outcome', 'unverifiable', 'reasons', jsonb_build_array(CASE WHEN v_truncated THEN 'truncated' ELSE 'no_evidence' END),
            'detail', CASE WHEN v_truncated THEN format('the recorded lineage of %s was cut at %s steps before it reached evidence bytes', v_root, v_depth)
                           ELSE format('the recorded lineage of %s reaches no evidence bytes within %s steps', v_root, v_depth) END));
        END IF;
      END IF;
    END IF;
    v_outcome := v_own;
    FOR ob IN SELECT x FROM jsonb_array_elements(v_leaves) x LOOP v_outcome := graph.ev_worst(v_outcome, ob ->> 'outcome'); END LOOP;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'ref', jsonb_build_object('kind', c ->> 'kind', 'id', lower(c ->> 'id'), 'version', (c ->> 'version')::int, 'digest', c ->> 'digest'),
      'outcome', v_outcome,
      'own', jsonb_build_object('outcome', v_own, 'digest_binds', v_binds, 'detail', CASE WHEN cardinality(v_own_detail) = 0 THEN NULL ELSE array_to_string(v_own_detail, '; ') END,
        'object', CASE WHEN v_found THEN jsonb_build_object('type', o.object_type, 'lifecycle', o.lifecycle_state, 'truth_state', o.truth_state, 'synthetic', o.synthetic_state,
          'recorded_at', graph.pv_iso(o.recorded_at), 'digest', o.content_digest, 'correction_of', o.correction_of, 'corrected_by', v_corrected_by,
          'title', left(coalesce(o.payload ->> 'title', o.payload ->> 'statement', o.payload ->> 'subject', o.payload ->> 'label', o.object_type || ' ' || o.object_id::text), 200)) END),
      'leaves', v_leaves, 'truncated', v_truncated, 'depth', v_depth, 'method', 'b82-ev-resolve-1', 'as_of', graph.pv_iso(v_at)));
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION graph.resolve_citation(uuid, uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.resolve_citation(uuid, uuid, jsonb, int) TO eye_app, eye_commit;

-- §EV.8 THE HOOK — objects._lineage_usable re-declared WHOLE from 0120:4749 (B50 pv); the additions marked `-- B82 ev` ────────────────────────
/* THE HOOK — §PV's stub (0120 §0.1) re-declared WHOLE: the same signature, STABLE, invoker, the same search path; read-only. Consequential use
   (a package option, a publication, a gate act) and EXPORT refuse a product whose current mark is UNFIT, or one resting — through the
   provenance agent's constructed edges, eight steps at most — on a version whose current mark is unfit. No mark is no refusal: the hook reads
   the governed record, it never evaluates (a STABLE caller cannot record what an evaluation finds).
   B82 ev (UX-26-004): AFTER the B50 checks, unchanged, the EVIDENCE the use rests on — the object itself (an EVD), a claim's lineage evidence,
   the header's evidence_refs, the constructed upstream (the same eight steps) — is refused when its bytes failed integrity after the last
   verified custody (integrity_failed), when its tier's root was unreachable at the last retrieval or the bytes were governed-deleted
   (inaccessible), or when the rights terms of its source contract version expired or were withdrawn (rights_expired). Refusals only added. */
CREATE OR REPLACE FUNCTION objects._lineage_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE m record;
        o record; ev record; st jsonb;   -- B82 ev
BEGIN
  -- B50 pv: the product's own current mark
  SELECT fm.mark_id, fm.verdict, fm.reasons, fm.route, fm.marked_at INTO m FROM graph.product_fitness_marks fm
   WHERE fm.object_id = p_id AND fm.object_version = p_version ORDER BY fm.marked_at DESC, fm.mark_id DESC LIMIT 1;
  IF FOUND AND m.verdict = 'unfit' THEN
    RAISE EXCEPTION 'object use rejected (unfit): % % v% is marked unfit (%) by mark % at %; it is not used for %; the mark routed it to %',
      p_type, p_id, p_version, array_to_string(m.reasons, ', '), m.mark_id, to_char(m.marked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), p_use, m.route USING ERRCODE = '22023';
  END IF;
  -- B50 pv: an upstream version (the constructed lineage edges) whose current mark is unfit
  WITH RECURSIVE up(id, version, depth, path) AS (
    SELECT e.upstream_id, e.upstream_version, 1, ARRAY[e.upstream_id::text || '@' || e.upstream_version] FROM graph.provenance_edges e WHERE e.dependent_id = p_id AND e.dependent_version = p_version
    UNION
    SELECT e.upstream_id, e.upstream_version, u.depth + 1, u.path || (e.upstream_id::text || '@' || e.upstream_version) FROM up u JOIN graph.provenance_edges e ON e.dependent_id = u.id AND e.dependent_version = u.version
     WHERE u.depth < 8 AND NOT ((e.upstream_id::text || '@' || e.upstream_version) = ANY (u.path)))
  SELECT x.mark_id, x.object_type, x.object_id, x.object_version, x.reasons, x.route INTO m
    FROM (SELECT DISTINCT u.id, u.version FROM up u) u2
    CROSS JOIN LATERAL (SELECT fm.* FROM graph.product_fitness_marks fm WHERE fm.object_id = u2.id AND fm.object_version = u2.version ORDER BY fm.marked_at DESC, fm.mark_id DESC LIMIT 1) x
   WHERE x.verdict = 'unfit' ORDER BY x.marked_at, x.mark_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'object use rejected (unfit): % % v% rests on % % v%, marked unfit (%) by mark %; it is not used for % until the upstream mark is lifted (routed to %)',
      p_type, p_id, p_version, m.object_type, m.object_id, m.object_version, array_to_string(m.reasons, ', '), m.mark_id, p_use, m.route USING ERRCODE = '22023';
  END IF;
  -- B82 ev: the evidence this use rests on (the object itself, a claim's lineage evidence, the header's evidence_refs, the constructed upstream)
  SELECT x.tenant_id, x.domain_id, x.evidence_refs INTO o FROM objects.canonical_objects x                                         -- B82 ev
   WHERE x.object_type = p_type AND x.object_id = p_id AND x.object_version = p_version LIMIT 1;                                    -- B82 ev
  IF FOUND AND o.tenant_id IS NOT NULL AND o.domain_id IS NOT NULL THEN                                                            -- B82 ev
    FOR ev IN                                                                                                                      -- B82 ev
      WITH RECURSIVE up(id, version, type, depth, path) AS (
        SELECT e.upstream_id, e.upstream_version, e.upstream_type, 1, ARRAY[e.upstream_id::text || '@' || e.upstream_version] FROM graph.provenance_edges e WHERE e.dependent_id = p_id AND e.dependent_version = p_version
        UNION
        SELECT e.upstream_id, e.upstream_version, e.upstream_type, u.depth + 1, u.path || (e.upstream_id::text || '@' || e.upstream_version) FROM up u JOIN graph.provenance_edges e ON e.dependent_id = u.id AND e.dependent_version = u.version
         WHERE u.depth < 8 AND NOT ((e.upstream_id::text || '@' || e.upstream_version) = ANY (u.path)))
      SELECT DISTINCT y.id, y.version FROM (
        SELECT p_id AS id, p_version AS version WHERE p_type = 'EVD'
        UNION ALL
        SELECT l.evidence_object_id, (SELECT max(e2.object_version) FROM objects.canonical_objects e2 WHERE e2.object_type = 'EVD' AND e2.object_id = l.evidence_object_id
                                         AND e2.tenant_id = o.tenant_id AND e2.domain_id = o.domain_id AND e2.payload ->> 'content_digest' = l.evidence_digest)
          FROM intelligence.claim_lineage l WHERE l.claim_object_id = p_id AND l.claim_version = p_version
        UNION ALL
        SELECT (z.r ->> 'id')::uuid, coalesce((z.r ->> 'version')::int, (SELECT max(e3.object_version) FROM objects.canonical_objects e3 WHERE e3.object_type = 'EVD' AND e3.object_id = (z.r ->> 'id')::uuid
                                                                           AND e3.tenant_id = o.tenant_id AND e3.domain_id = o.domain_id))
          FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(o.evidence_refs) = 'array' THEN o.evidence_refs ELSE '[]'::jsonb END) t(v) CROSS JOIN LATERAL (SELECT graph.pv_ref(t.v) AS r) z
         WHERE z.r ->> 'form' = 'typed' AND z.r ->> 'type' = 'EVD'
        UNION ALL
        SELECT u.id, u.version FROM up u WHERE u.type = 'EVD') y
       WHERE y.id IS NOT NULL AND y.version IS NOT NULL
       LIMIT 200
    LOOP                                                                                                                           -- B82 ev
      st := graph.ev_evidence_state(o.tenant_id, o.domain_id, ev.id, ev.version::int, NULL::int, NULL::int, clock_timestamp());                   -- B82 ev
      IF (st ->> 'integrity_failed')::boolean THEN                                                                                 -- B82 ev
        RAISE EXCEPTION 'object use rejected (integrity_failed): % % v% rests on EVD % v%, whose bytes failed integrity after their last verified custody (%); it is not used for % until the bytes verify again',
          p_type, p_id, p_version, ev.id, ev.version, st ->> 'detail', p_use USING ERRCODE = '22023';
      END IF;
      IF (st ->> 'tombstoned')::boolean OR (st ->> 'unreachable')::boolean THEN                                                     -- B82 ev
        RAISE EXCEPTION 'object use rejected (inaccessible): % % v% rests on EVD % v%, whose bytes cannot be reached (%); it is not used for % while they cannot be verified',
          p_type, p_id, p_version, ev.id, ev.version, st ->> 'detail', p_use USING ERRCODE = '22023';
      END IF;
      IF st ->> 'rights_state' IN ('expired', 'withdrawn') THEN                                                                     -- B82 ev
        RAISE EXCEPTION 'object use rejected (rights_expired): % % v% rests on EVD % v%, whose source''s rights terms are % (%); it is not used for % until rights are declared again',
          p_type, p_id, p_version, ev.id, ev.version, st ->> 'rights_state', st #>> '{rights,expiry_statement}', p_use USING ERRCODE = '22023';
      END IF;
    END LOOP;                                                                                                                      -- B82 ev
  END IF;                                                                                                                          -- B82 ev
  RETURN;
END $$;
REVOKE ALL ON FUNCTION objects._lineage_usable(text, uuid, int, text) FROM PUBLIC;

-- ═══ FOLD §GM (from 0121_b82_x_gm.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0121 §GM — CP-6 B82, part `gm`: THE GRAPH AND MAP CANVASES (F-P7-E-21: CMP-063, CMP-064, VIZ-13…21, VIZ-31, UX-ADR-016) and the sticky
-- region boundaries (F-P7-E-04: UX-19-003, web only) — THE GOVERNED GEOGRAPHIC-REFERENCE REGISTER the map canvas draws (DESIGN D4, Q4).
--
-- NO GEOGRAPHY EXISTS on any database before this file (no latitude / longitude, no GeoJSON, no geometry column; places are names and keys
-- only — the PortWatch chokepoint keys, the B33 route `via` lists). A map therefore draws ONLY what a NAMED DATA STEWARD has typed here:
--   graph.geo_references        one row per VERSION of a reference (append-only): a point (a chokepoint, a port, a site), a line (a route)
--                               or a polygon (an area) as GeoJSON VALIDATED IN SQL (graph.geo_geometry_problem), the CRS fixed EPSG:4326
--                               (longitude, latitude in degrees — WGS 84), the declared positional uncertainty in metres, the SOURCE and
--                               LICENCE statements the steward typed, the linked graph entity (an object of the domain) and the PortWatch
--                               chokepoint key; a revision is the next version, a RETIREMENT is the next version in state `retired` —
--                               nothing is erased, every version keeps who typed it and why.
--   graph.geo_reference_events  the ledger (declared | revised | retired), append-only.
--   graph.declare_geo_reference / graph.retire_geo_reference   the two human-gated PORTS (graph.geo.declare / graph.geo.retire):
--                               the bound action, the domain scope, the acting principal = public.eye_principal(), a NAMED ACTIVE HUMAN
--                               holding data_steward (governance.assert_approver — an agent never declares or retires a reference), the
--                               request id a retry reuses (the recorded answer, `replayed`), the version read (stale refused).
--   graph.geo_layer(p_tenant, p_domain, p_scope jsonb)   the READ the canvases draw (STABLE, SECURITY DEFINER, read scope asserted):
--                               the current version of each reference, its history on request, the bounds, the counts and the statement
--                               of what the map is NOT (no basemap, no tiles, no coastline, no boundary dataset, no network).
--
-- NO TILES, NO NETWORK, NO BASEMAP (D4): nothing here fetches, imports or vendors a coastline or a boundary dataset — that is the owner's
-- decision through the supply-chain controls' own amendment. Until then the CHOROPLETH is a SYNTHETIC catalogue specimen (D13); a polygon
-- typed here is a declared area, never an administrative boundary.
--
-- Refusal noun `geographic reference` in the CLASS form `geographic reference rejected (<class>): …` — 403 actor|authority ·
-- 404 unknown_reference|unknown_linked · 409 stale|state|duplicate · 422 the rest (crs, geometry, key, label, kind, statements, uncertainty,
-- reason, request, layer_scope). The integrator maps the noun centrally (observation-errors.ts); until then the route maps it locally
-- (apps/api/src/graph/geo/geo.service.ts asGeoRefusal).
--
-- Applies ALONE on 0001–0120 + the prelude (0121 §0). Re-declares nothing of an earlier migration. No permission is added to any role
-- (D9): the PDP rows graph.geo.read / .declare / .retire are this part's own actions (the `/* B82 gm */` block of pdp.service.ts).
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this file and phase6-geography-b82 — every reference there SYNTHETIC); DEMONSTRATED OPERATION
-- (the act: F. Aydın types the corridor's references — SYNTHETIC persona, the coordinates hers); REAL ACCEPTANCE — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §GM.1 THE CONSTANTS AND THE GEOMETRY CHECK (IMMUTABLE; mirrored by apps/web/lib/canvas-b82.ts geometryProblem) ───────────────────────────
CREATE OR REPLACE FUNCTION graph.geo_rule_version() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b82-gm-geo-1' $$;
CREATE OR REPLACE FUNCTION graph.geo_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['chokepoint', 'port', 'site', 'route', 'area'] $$;
/* Which geometry each kind carries: a place is a point, a route a line, an area a polygon. */
CREATE OR REPLACE FUNCTION graph.geo_kind_geometry(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kind WHEN 'chokepoint' THEN 'Point' WHEN 'port' THEN 'Point' WHEN 'site' THEN 'Point' WHEN 'route' THEN 'LineString' WHEN 'area' THEN 'Polygon' END
$$;
GRANT EXECUTE ON FUNCTION graph.geo_rule_version(), graph.geo_kinds(), graph.geo_kind_geometry(text) TO eye_app, eye_commit;

/* One GeoJSON position: [longitude, latitude], two finite numbers, longitude in [-180, 180], latitude in [-90, 90] (EPSG:4326 axis order as
   GeoJSON writes it). NULL = valid; otherwise the problem in words. */
CREATE OR REPLACE FUNCTION graph.geo_position_problem(p jsonb, p_where text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_lon numeric; v_lat numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) <> 2 OR jsonb_typeof(p -> 0) <> 'number' OR jsonb_typeof(p -> 1) <> 'number' THEN
    RETURN p_where || ' is not a position [longitude, latitude] of two numbers';
  END IF;
  v_lon := (p ->> 0)::numeric; v_lat := (p ->> 1)::numeric;
  IF v_lon < -180 OR v_lon > 180 THEN RETURN p_where || ' has longitude ' || v_lon::text || ', outside -180 to 180 degrees'; END IF;
  IF v_lat < -90 OR v_lat > 90 THEN RETURN p_where || ' has latitude ' || v_lat::text || ', outside -90 to 90 degrees (positions are [longitude, latitude])'; END IF;
  RETURN NULL;
END $$;

/* A GeoJSON geometry of the three admitted types, validated whole: Point (one position); LineString (2–1000 positions, not all the same);
   Polygon (1–20 linear rings, each 4–1000 positions, closed — the last position equals the first). Nothing else (no Multi*, no
   GeometryCollection, no `crs` member — the CRS is the register's, fixed). NULL = valid. */
CREATE OR REPLACE FUNCTION graph.geo_geometry_problem(p jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_type text; c jsonb; v_problem text; i int; j int; ring jsonb; v_keys text[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the geometry is a GeoJSON object {type, coordinates}'; END IF;
  SELECT array_agg(k ORDER BY k) INTO v_keys FROM jsonb_object_keys(p) k;
  IF v_keys IS DISTINCT FROM ARRAY['coordinates', 'type'] THEN
    RETURN 'the geometry carries exactly type and coordinates (the CRS is the register''s, EPSG:4326 — never a member of the geometry)';
  END IF;
  v_type := p ->> 'type'; c := p -> 'coordinates';
  IF v_type = 'Point' THEN
    RETURN graph.geo_position_problem(c, 'the point');
  ELSIF v_type = 'LineString' THEN
    IF jsonb_typeof(c) <> 'array' OR jsonb_array_length(c) < 2 OR jsonb_array_length(c) > 1000 THEN RETURN 'a line has 2 to 1000 positions'; END IF;
    FOR i IN 0 .. jsonb_array_length(c) - 1 LOOP
      v_problem := graph.geo_position_problem(c -> i, 'position ' || (i + 1)::text || ' of the line');
      IF v_problem IS NOT NULL THEN RETURN v_problem; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT e) FROM jsonb_array_elements(c) e) < 2 THEN RETURN 'a line joins at least two different positions'; END IF;
    RETURN NULL;
  ELSIF v_type = 'Polygon' THEN
    IF jsonb_typeof(c) <> 'array' OR jsonb_array_length(c) < 1 OR jsonb_array_length(c) > 20 THEN RETURN 'a polygon has 1 to 20 rings'; END IF;
    FOR i IN 0 .. jsonb_array_length(c) - 1 LOOP
      ring := c -> i;
      IF jsonb_typeof(ring) <> 'array' OR jsonb_array_length(ring) < 4 OR jsonb_array_length(ring) > 1000 THEN RETURN 'ring ' || (i + 1)::text || ' of the polygon has 4 to 1000 positions'; END IF;
      FOR j IN 0 .. jsonb_array_length(ring) - 1 LOOP
        v_problem := graph.geo_position_problem(ring -> j, 'position ' || (j + 1)::text || ' of ring ' || (i + 1)::text);
        IF v_problem IS NOT NULL THEN RETURN v_problem; END IF;
      END LOOP;
      IF (ring -> 0) <> (ring -> (jsonb_array_length(ring) - 1)) THEN RETURN 'ring ' || (i + 1)::text || ' of the polygon is not closed (its last position repeats its first)'; END IF;
      IF (SELECT count(DISTINCT e) FROM jsonb_array_elements(ring) e) < 3 THEN RETURN 'ring ' || (i + 1)::text || ' of the polygon encloses no area (fewer than three different positions)'; END IF;
    END LOOP;
    RETURN NULL;
  END IF;
  RETURN 'the geometry type ' || coalesce(v_type, '<none>') || ' is not admitted (Point, LineString or Polygon)';
END $$;
GRANT EXECUTE ON FUNCTION graph.geo_position_problem(jsonb, text), graph.geo_geometry_problem(jsonb) TO eye_app, eye_commit;

/* Every position of a geometry, flattened (for the bounds). */
CREATE OR REPLACE FUNCTION graph.geo_positions(p jsonb) RETURNS TABLE (lon numeric, lat numeric)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  -- the casts are guarded (an inlined call over a constant may evaluate the list before the filter)
  SELECT CASE WHEN p ->> 'type' = 'Point' THEN (p #>> '{coordinates,0}')::numeric END, CASE WHEN p ->> 'type' = 'Point' THEN (p #>> '{coordinates,1}')::numeric END
   WHERE p ->> 'type' = 'Point'
  UNION ALL
  SELECT (e ->> 0)::numeric, (e ->> 1)::numeric FROM jsonb_array_elements(CASE WHEN p ->> 'type' = 'LineString' THEN p -> 'coordinates' ELSE '[]'::jsonb END) e
  UNION ALL
  SELECT (e ->> 0)::numeric, (e ->> 1)::numeric FROM jsonb_array_elements(CASE WHEN p ->> 'type' = 'Polygon' THEN p -> 'coordinates' ELSE '[]'::jsonb END) r, jsonb_array_elements(r) e
$$;
GRANT EXECUTE ON FUNCTION graph.geo_positions(jsonb) TO eye_app, eye_commit;

-- §GM.2 THE TABLES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE graph.geo_references (
  reference_id        uuid NOT NULL,
  version             int  NOT NULL CHECK (version >= 1),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  reference_key       text NOT NULL CHECK (reference_key ~ '^[a-z0-9][a-z0-9._:-]{1,79}$'),
  label               text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 200),
  feature_kind        text NOT NULL CHECK (feature_kind = ANY (graph.geo_kinds())),
  geometry            jsonb NOT NULL CHECK (graph.geo_geometry_problem(geometry) IS NULL),
  crs                 text NOT NULL CHECK (crs = 'EPSG:4326'),
  uncertainty_m       numeric NOT NULL CHECK (uncertainty_m >= 0 AND uncertainty_m <= 2000000),
  source_statement    text NOT NULL CHECK (length(btrim(source_statement)) BETWEEN 8 AND 1000),
  licence_statement   text NOT NULL CHECK (length(btrim(licence_statement)) BETWEEN 8 AND 1000),
  linked_type         text CHECK (linked_type IS NULL OR linked_type ~ '^[A-Z]{3}$'),
  linked_id           uuid,
  chokepoint_key      text CHECK (chokepoint_key IS NULL OR chokepoint_key ~ '^[a-z0-9][a-z0-9._:-]{1,79}$'),
  state               text NOT NULL CHECK (state IN ('active', 'retired')),
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  supersedes          int,
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (reference_id, version),
  CONSTRAINT ggr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ggr_kind_geometry CHECK (geometry ->> 'type' = graph.geo_kind_geometry(feature_kind)),
  CONSTRAINT ggr_linked CHECK ((linked_type IS NULL) = (linked_id IS NULL)),
  CONSTRAINT ggr_supersedes CHECK ((version = 1 AND supersedes IS NULL) OR (version > 1 AND supersedes = version - 1)),
  CONSTRAINT ggr_retired_last CHECK (state = 'active' OR version > 1)
);
COMMENT ON TABLE graph.geo_references IS 'B82 §GM (CMP-064, VIZ-16/18; DESIGN D4): the governed geographic references a map draws — a point, line or polygon in EPSG:4326 typed by a named data steward with its positional uncertainty and its source and licence statements, linked to a graph object and a chokepoint key; one row per version (a revision the next version, a retirement the next version in state retired); append-only. No basemap, no tiles, no imported dataset.';
CREATE INDEX ggr_domain ON graph.geo_references (tenant_id, domain_id, reference_key, version DESC);
CREATE INDEX ggr_reference ON graph.geo_references (reference_id, version DESC);
CREATE TRIGGER ggr_append_only BEFORE UPDATE OR DELETE ON graph.geo_references FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.geo_reference_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  reference_id        uuid NOT NULL,
  version             int  NOT NULL,
  event               text NOT NULL CHECK (event IN ('geo.declared', 'geo.revised', 'geo.retired')),
  actor_principal_id  uuid NOT NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  FOREIGN KEY (reference_id, version) REFERENCES graph.geo_references (reference_id, version),
  CONSTRAINT ggre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX ggre_reference ON graph.geo_reference_events (reference_id, occurred_at);
CREATE TRIGGER ggre_append_only BEFORE UPDATE OR DELETE ON graph.geo_reference_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* RLS (the 0120 graph idiom): within the bound tenant, and the bound domain for a DOMAIN context. SELECT only; the ports write. */
REVOKE ALL ON graph.geo_references, graph.geo_reference_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['geo_references', 'geo_reference_events'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §GM.3 THE ROW AS THE SEAM STATES IT (GeoReferenceRow, apps/api/src/graph/b82-seams.ts) ──────────────────────────────────────────────────
/* `retired_by` / `retired_at` are the retiring version's declarer and instant (a retirement is a version). */
CREATE OR REPLACE FUNCTION graph.geo_row(r graph.geo_references) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'reference_id', r.reference_id, 'version', r.version, 'key', r.reference_key, 'label', r.label, 'kind', r.feature_kind,
    'geometry', r.geometry, 'crs', r.crs, 'uncertainty_m', r.uncertainty_m,
    'source_statement', r.source_statement, 'licence_statement', r.licence_statement,
    'linked', CASE WHEN r.linked_id IS NULL THEN NULL ELSE jsonb_build_object('type', r.linked_type, 'id', r.linked_id) END,
    'chokepoint_key', r.chokepoint_key,
    'declared_by', r.declared_by, 'declared_at', graph.pv_iso(r.declared_at), 'state', r.state, 'reason', r.reason, 'supersedes', r.supersedes,
    'retired_by', CASE WHEN r.state = 'retired' THEN r.declared_by END, 'retired_at', CASE WHEN r.state = 'retired' THEN graph.pv_iso(r.declared_at) END)
$$;
REVOKE ALL ON FUNCTION graph.geo_row(graph.geo_references) FROM PUBLIC;

-- §GM.4 THE PORTS (human-gated; graph.geo.declare / graph.geo.retire) ──────────────────────────────────────────────────────────────────────
/* The acting person: the bound principal, named by the route, a NAMED ACTIVE HUMAN holding data_steward in this domain (re-checked here —
   the PDP's human gate is not trusted alone). */
CREATE OR REPLACE FUNCTION graph.geo_actor(p_actor uuid, p_tenant uuid, p_domain uuid, p_what text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, governance, onboarding, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'geographic reference rejected (actor): the act is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  PERFORM governance.assert_approver('geographic reference', v, p_tenant, p_domain, ARRAY['data_steward'], NULL, NULL, p_what);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION graph.geo_actor(uuid, uuid, uuid, text) FROM PUBLIC;

/* The current (latest) version of a reference of this domain, or NULL. */
CREATE OR REPLACE FUNCTION graph.geo_current(p_tenant uuid, p_domain uuid, p_reference uuid) RETURNS graph.geo_references
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT r.* FROM graph.geo_references r WHERE r.reference_id = p_reference AND r.tenant_id = p_tenant AND r.domain_id = p_domain ORDER BY r.version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION graph.geo_current(uuid, uuid, uuid) FROM PUBLIC;

/* DECLARE a reference (p_reference NULL, p_expected_version 0) or REVISE one (its id and the version read): the key, the label, the kind and
   its geometry, the CRS (EPSG:4326 only — another is refused, never converted), the positional uncertainty, the source and licence
   statements, the linked graph object (recorded in this domain) and the chokepoint key, the reason. The key is unique among the domain's
   ACTIVE references. A request id replayed by the same steward answers the recorded version (`replayed`); by another person or for another
   reference it is refused (duplicate). A retired reference is not revised (state) — a new reference is declared. */
CREATE OR REPLACE FUNCTION graph.declare_geo_reference(p_request_id uuid, p_tenant uuid, p_domain uuid, p_reference uuid, p_expected_version int,
    p_key text, p_label text, p_kind text, p_geometry jsonb, p_crs text, p_uncertainty_m numeric, p_source_statement text, p_licence_statement text,
    p_linked_type text, p_linked_id uuid, p_chokepoint_key text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r graph.geo_references%ROWTYPE; prev graph.geo_references%ROWTYPE; v_problem text; v_id uuid; v_version int;
        v_key text := lower(btrim(coalesce(p_key, ''))); v_cp text := NULLIF(lower(btrim(coalesce(p_chokepoint_key, ''))), '');
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.geo.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.geo_actor(p_actor, p_tenant, p_domain, 'declaring or revising a geographic reference');
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'geographic reference rejected (request): a declaration carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM graph.geo_references g WHERE g.request_id = p_request_id;
  IF FOUND THEN
    IF r.declared_by IS DISTINCT FROM v_actor OR r.tenant_id IS DISTINCT FROM p_tenant OR r.domain_id IS DISTINCT FROM p_domain OR r.reference_key IS DISTINCT FROM v_key
       OR (p_reference IS NOT NULL AND r.reference_id IS DISTINCT FROM p_reference) OR r.state <> 'active' THEN
      RAISE EXCEPTION 'geographic reference rejected (duplicate): request % already recorded another act; a new declaration takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN graph.geo_row(r) || jsonb_build_object('replayed', true);
  END IF;
  IF v_key !~ '^[a-z0-9][a-z0-9._:-]{1,79}$' THEN
    RAISE EXCEPTION 'geographic reference rejected (key): the key is 2–80 lower-case letters, digits, dots, colons, underscores or hyphens (e.g. chokepoint.bab-el-mandeb)' USING ERRCODE = '22023';
  END IF;
  IF p_label IS NULL OR length(btrim(p_label)) < 2 OR length(btrim(p_label)) > 200 THEN
    RAISE EXCEPTION 'geographic reference rejected (label): the label a reader sees is 2 to 200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR NOT (p_kind = ANY (graph.geo_kinds())) THEN
    RAISE EXCEPTION 'geographic reference rejected (kind): the kind is one of %', array_to_string(graph.geo_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_crs IS DISTINCT FROM 'EPSG:4326' THEN
    RAISE EXCEPTION 'geographic reference rejected (crs): the register holds EPSG:4326 (WGS 84, [longitude, latitude] in degrees) only; % is not converted here — type the position in EPSG:4326', coalesce(p_crs, '<none>') USING ERRCODE = '22023';
  END IF;
  v_problem := graph.geo_geometry_problem(p_geometry);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'geographic reference rejected (geometry): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_geometry ->> 'type' IS DISTINCT FROM graph.geo_kind_geometry(p_kind) THEN
    RAISE EXCEPTION 'geographic reference rejected (geometry): a % is drawn as a %, not a %', p_kind, graph.geo_kind_geometry(p_kind), p_geometry ->> 'type' USING ERRCODE = '22023';
  END IF;
  IF p_uncertainty_m IS NULL OR p_uncertainty_m < 0 OR p_uncertainty_m > 2000000 THEN
    RAISE EXCEPTION 'geographic reference rejected (uncertainty): the positional uncertainty is stated in metres (0 to 2,000,000) — how far the true place may be from the typed one' USING ERRCODE = '22023';
  END IF;
  IF p_source_statement IS NULL OR length(btrim(p_source_statement)) < 8 OR length(btrim(p_source_statement)) > 1000 THEN
    RAISE EXCEPTION 'geographic reference rejected (source): the source statement says where the position comes from, in 8 to 1000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_licence_statement IS NULL OR length(btrim(p_licence_statement)) < 8 OR length(btrim(p_licence_statement)) > 1000 THEN
    RAISE EXCEPTION 'geographic reference rejected (licence): the licence statement says under what terms the position may be used, in 8 to 1000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(btrim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'geographic reference rejected (reason): a reason of 8 to 2000 characters says why the reference is declared or revised' USING ERRCODE = '22023';
  END IF;
  IF v_cp IS NOT NULL AND v_cp !~ '^[a-z0-9][a-z0-9._:-]{1,79}$' THEN
    RAISE EXCEPTION 'geographic reference rejected (chokepoint): the chokepoint key is 2–80 lower-case letters, digits, dots, colons, underscores or hyphens (e.g. portwatch:chokepoint4)' USING ERRCODE = '22023';
  END IF;
  IF (p_linked_type IS NULL) <> (p_linked_id IS NULL) OR (p_linked_type IS NOT NULL AND p_linked_type !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION 'geographic reference rejected (linked): a linked object is named by its type (three capitals) and its id together' USING ERRCODE = '22023';
  END IF;
  IF p_linked_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_linked_id AND o.object_type = p_linked_type
                                                AND o.tenant_id = p_tenant AND (o.domain_id = p_domain OR o.domain_id IS NULL)) THEN
    RAISE EXCEPTION 'geographic reference rejected (unknown_linked): no % % is recorded in this domain', p_linked_type, p_linked_id USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.geo:' || p_tenant::text || ':' || p_domain::text || ':' || coalesce(p_reference::text, v_key), 0));
  IF p_reference IS NULL THEN
    IF coalesce(p_expected_version, -1) <> 0 THEN
      RAISE EXCEPTION 'geographic reference rejected (stale): a new reference is declared from version 0; this declaration read %', coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
    END IF;
    v_id := gen_random_uuid(); v_version := 1;
  ELSE
    prev := graph.geo_current(p_tenant, p_domain, p_reference);
    IF prev.reference_id IS NULL THEN
      RAISE EXCEPTION 'geographic reference rejected (unknown_reference): no reference % in this domain', p_reference USING ERRCODE = '23503';
    END IF;
    IF prev.state = 'retired' THEN
      RAISE EXCEPTION 'geographic reference rejected (state): % was retired at version %; a retired reference is not revised — declare a new one', prev.reference_key, prev.version USING ERRCODE = '23514';
    END IF;
    IF coalesce(p_expected_version, -1) <> prev.version THEN
      RAISE EXCEPTION 'geographic reference rejected (stale): % is at version %; this revision read %', prev.reference_key, prev.version, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
    END IF;
    v_id := prev.reference_id; v_version := prev.version + 1;
  END IF;
  -- one ACTIVE reference per key in the domain (another reference holding it refuses; the same reference keeps or changes its own)
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.geo.key:' || p_tenant::text || ':' || p_domain::text || ':' || v_key, 0));
  IF EXISTS (SELECT 1 FROM graph.geo_references g
              WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.reference_key = v_key AND g.reference_id <> v_id
                AND g.state = 'active' AND g.version = (SELECT max(x.version) FROM graph.geo_references x WHERE x.reference_id = g.reference_id)) THEN
    RAISE EXCEPTION 'geographic reference rejected (duplicate): the key % is held by another active reference of this domain; revise that one or retire it first', v_key USING ERRCODE = '23505';
  END IF;
  INSERT INTO graph.geo_references (reference_id, version, scope, tenant_id, domain_id, reference_key, label, feature_kind, geometry, crs, uncertainty_m,
                                    source_statement, licence_statement, linked_type, linked_id, chokepoint_key, state, reason, supersedes, declared_by, request_id, correlation_id)
  VALUES (v_id, v_version, 'DOMAIN', p_tenant, p_domain, v_key, btrim(p_label), p_kind, p_geometry, 'EPSG:4326', p_uncertainty_m,
          btrim(p_source_statement), btrim(p_licence_statement), p_linked_type, p_linked_id, v_cp, 'active', btrim(p_reason),
          CASE WHEN v_version > 1 THEN v_version - 1 END, v_actor, p_request_id, p_correlation)
  RETURNING * INTO r;
  INSERT INTO graph.geo_reference_events (event_id, scope, tenant_id, domain_id, reference_id, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_id, v_version, CASE WHEN v_version = 1 THEN 'geo.declared' ELSE 'geo.revised' END, v_actor,
          jsonb_build_object('key', v_key, 'kind', p_kind, 'geometry_type', p_geometry ->> 'type', 'chokepoint_key', v_cp, 'supersedes', r.supersedes), p_correlation);
  RETURN graph.geo_row(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.declare_geo_reference(uuid, uuid, uuid, uuid, int, text, text, text, jsonb, text, numeric, text, text, text, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.declare_geo_reference(uuid, uuid, uuid, uuid, int, text, text, text, jsonb, text, numeric, text, text, text, uuid, text, text, uuid, uuid) TO eye_commit;

/* RETIRE a reference at the version read: the next version, in state `retired`, keeping the geometry and statements it retires (the history
   reads what was drawn until then); the reason says why (a mistyped point, a closed site). A retired reference is drawn no more and its key
   is free for a new reference. A replayed request id answers the recorded retirement. Not undone — a new reference is declared instead. */
CREATE OR REPLACE FUNCTION graph.retire_geo_reference(p_request_id uuid, p_tenant uuid, p_domain uuid, p_reference uuid, p_expected_version int, p_reason text,
    p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r graph.geo_references%ROWTYPE; prev graph.geo_references%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.geo.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.geo_actor(p_actor, p_tenant, p_domain, 'retiring a geographic reference');
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'geographic reference rejected (request): a retirement carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM graph.geo_references g WHERE g.request_id = p_request_id;
  IF FOUND THEN
    IF r.declared_by IS DISTINCT FROM v_actor OR r.reference_id IS DISTINCT FROM p_reference OR r.state <> 'retired' THEN
      RAISE EXCEPTION 'geographic reference rejected (duplicate): request % already recorded another act; a new retirement takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN graph.geo_row(r) || jsonb_build_object('replayed', true);
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(btrim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'geographic reference rejected (reason): a retirement states its reason in 8 to 2000 characters (what was wrong, what replaces it)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.geo:' || p_tenant::text || ':' || p_domain::text || ':' || coalesce(p_reference::text, '-'), 0));
  prev := graph.geo_current(p_tenant, p_domain, p_reference);
  IF prev.reference_id IS NULL THEN
    RAISE EXCEPTION 'geographic reference rejected (unknown_reference): no reference % in this domain', coalesce(p_reference::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF prev.state = 'retired' THEN
    RAISE EXCEPTION 'geographic reference rejected (state): % is already retired (version %)', prev.reference_key, prev.version USING ERRCODE = '23514';
  END IF;
  IF coalesce(p_expected_version, -1) <> prev.version THEN
    RAISE EXCEPTION 'geographic reference rejected (stale): % is at version %; this retirement read %', prev.reference_key, prev.version, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  INSERT INTO graph.geo_references (reference_id, version, scope, tenant_id, domain_id, reference_key, label, feature_kind, geometry, crs, uncertainty_m,
                                    source_statement, licence_statement, linked_type, linked_id, chokepoint_key, state, reason, supersedes, declared_by, request_id, correlation_id)
  VALUES (prev.reference_id, prev.version + 1, 'DOMAIN', p_tenant, p_domain, prev.reference_key, prev.label, prev.feature_kind, prev.geometry, prev.crs, prev.uncertainty_m,
          prev.source_statement, prev.licence_statement, prev.linked_type, prev.linked_id, prev.chokepoint_key, 'retired', btrim(p_reason), prev.version, v_actor, p_request_id, p_correlation)
  RETURNING * INTO r;
  INSERT INTO graph.geo_reference_events (event_id, scope, tenant_id, domain_id, reference_id, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.reference_id, r.version, 'geo.retired', v_actor,
          jsonb_build_object('key', r.reference_key, 'retired_version', prev.version), p_correlation);
  RETURN graph.geo_row(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.retire_geo_reference(uuid, uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.retire_geo_reference(uuid, uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

-- §GM.5 THE READ (graph.geo.read at the route) ────────────────────────────────────────────────────────────────────────────────────────────
/* THE LAYER the canvases draw. p_scope (an object; every member optional): `keys` (reference keys), `kinds` (feature kinds),
   `reference_id` (one reference — its HISTORY is returned too), `include_retired` (a retired reference's last version is listed, marked).
   The answer: the CRS, the current version of each matching reference (ordered by kind then key), the history on request, the bounds
   [west, south, east, north] of what is returned (null when nothing is), the counts, the rule version, the as-of instant, and the
   statement of what the map is NOT. STABLE, SECURITY DEFINER, the caller's scope asserted first. */
CREATE OR REPLACE FUNCTION graph.geo_layer(p_tenant uuid, p_domain uuid, p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE v_scope jsonb := coalesce(p_scope, '{}'::jsonb); v_keys text[]; v_kinds text[]; v_ref uuid; v_retired boolean; v_refs jsonb; v_hist jsonb; v_bounds jsonb; v_counts jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the geographic reference layer');
  IF jsonb_typeof(v_scope) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_scope) k WHERE k NOT IN ('keys', 'kinds', 'reference_id', 'include_retired')) THEN
    RAISE EXCEPTION 'geographic reference rejected (layer_scope): a layer is asked by keys, kinds, reference_id and include_retired only' USING ERRCODE = '22023';
  END IF;
  IF v_scope ? 'keys' THEN
    IF jsonb_typeof(v_scope -> 'keys') <> 'array' OR jsonb_array_length(v_scope -> 'keys') > 200 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_scope -> 'keys') e WHERE jsonb_typeof(e) <> 'string') THEN
      RAISE EXCEPTION 'geographic reference rejected (layer_scope): keys is a list of at most 200 reference keys' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(lower(e #>> '{}')) INTO v_keys FROM jsonb_array_elements(v_scope -> 'keys') e;
  END IF;
  IF v_scope ? 'kinds' THEN
    IF jsonb_typeof(v_scope -> 'kinds') <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_scope -> 'kinds') e WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') = ANY (graph.geo_kinds()))) THEN
      RAISE EXCEPTION 'geographic reference rejected (layer_scope): kinds is a list of %', array_to_string(graph.geo_kinds(), ', ') USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(e #>> '{}') INTO v_kinds FROM jsonb_array_elements(v_scope -> 'kinds') e;
  END IF;
  IF v_scope ? 'reference_id' THEN
    IF jsonb_typeof(v_scope -> 'reference_id') <> 'string' OR (v_scope ->> 'reference_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'geographic reference rejected (layer_scope): reference_id is the id of one reference' USING ERRCODE = '22023';
    END IF;
    v_ref := (v_scope ->> 'reference_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM graph.geo_references g WHERE g.reference_id = v_ref AND g.tenant_id = p_tenant AND g.domain_id = p_domain) THEN
      RAISE EXCEPTION 'geographic reference rejected (unknown_reference): no reference % in this domain', v_ref USING ERRCODE = '23503';
    END IF;
  END IF;
  IF v_scope ? 'include_retired' AND jsonb_typeof(v_scope -> 'include_retired') <> 'boolean' THEN
    RAISE EXCEPTION 'geographic reference rejected (layer_scope): include_retired is true or false' USING ERRCODE = '22023';
  END IF;
  v_retired := coalesce((v_scope ->> 'include_retired')::boolean, false) OR v_ref IS NOT NULL;
  WITH cur AS (
    SELECT DISTINCT ON (g.reference_id) g.* FROM graph.geo_references g
     WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain
     ORDER BY g.reference_id, g.version DESC
  ), sel AS (
    SELECT c.* FROM cur c
     WHERE (v_retired OR c.state = 'active')
       AND (v_keys IS NULL OR c.reference_key = ANY (v_keys))
       AND (v_kinds IS NULL OR c.feature_kind = ANY (v_kinds))
       AND (v_ref IS NULL OR c.reference_id = v_ref)
  )
  SELECT coalesce(jsonb_agg(graph.geo_row(s) ORDER BY array_position(graph.geo_kinds(), s.feature_kind), s.reference_key), '[]'::jsonb),
         (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_array(min(p.lon), min(p.lat), max(p.lon), max(p.lat)) END
            FROM sel s2, LATERAL graph.geo_positions(s2.geometry) p),
         jsonb_build_object('returned', count(*), 'active', count(*) FILTER (WHERE s.state = 'active'), 'retired', count(*) FILTER (WHERE s.state = 'retired'))
    INTO v_refs, v_bounds, v_counts
    FROM sel s;
  IF v_ref IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(graph.geo_row(g) ORDER BY g.version), '[]'::jsonb) INTO v_hist FROM graph.geo_references g
     WHERE g.reference_id = v_ref AND g.tenant_id = p_tenant AND g.domain_id = p_domain;
  END IF;
  RETURN jsonb_build_object(
    'crs', 'EPSG:4326', 'references', v_refs, 'history', v_hist, 'bounds', v_bounds, 'counts', v_counts,
    'rule_version', graph.geo_rule_version(), 'as_of', graph.pv_iso(clock_timestamp()),
    'statement', 'Declared references only: each position typed by a named data steward in EPSG:4326 with its source, licence and positional uncertainty. No basemap, no tiles, no coastline or boundary dataset, no network.');
END $$;
REVOKE ALL ON FUNCTION graph.geo_layer(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.geo_layer(uuid, uuid, jsonb) TO eye_app, eye_commit;

-- ═══ FOLD §PX (from 0121_b82_x_px.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0121 §PX — CP-6 B82, part `px` (folded into 0121 after §0, §TS, §EV, §GM): THE PROVENANCE TRAIL'S STRENGTH, THE TRUST ENVELOPE, THE
-- RECORDED VERIFICATIONS, THE ATTESTATIONS AND THE TRUST INVESTIGATION (F-P7-E-07: ch27 + ch57 — UX-57-001…005, CMP-022, CMP-029, WS-18,
-- UX-27-004/005; F-P7-E-01: C-047).
--
--   graph.provenance_strength   §0's stub RE-DECLARED WHOLE (same signature, volatility, security, search path, return type and grants):
--                               strong | partial | weak | broken WITH ITS REASONS, from graph.explain (B50, method b50-pv-explain-1): the
--                               gaps (an integrity gap — broken custody, an unverifiable artifact — is BROKEN; an unresolved reference
--                               WEAK), truncation, unresolved citations, unsigned human steps (an approval no signature binds), undigested
--                               model calls (a gateway call without its weights digest), withdrawn and corrected inputs, an UNFIT mark.
--                               A malformed subject stays `provenance rejected (subject)` (22023 → 422); an object not recorded in the
--                               caller's domain is now `provenance rejected (unknown_object)` (23503 → 404). Rule b82-px-strength-1.
--   graph.trust_envelope        the READ of a product version's trust as FACETS, NEVER A SCORE (signature, lineage, custody, policy,
--                               evaluation, correction, rights, freshness — each verified | failed | unavailable | not_checked with its
--                               words), the provenance strength, the attestations, the recorded verifications, the open investigations,
--                               TRUST INDETERMINATE when a facet failed or could not be verified (with the constrained use), and the
--                               DIGEST that binds what was shown (an attestation names it). Rule b82-px-envelope-1.
--   graph.trust_verifications   APPEND-ONLY: one recorded "verify again" — the subject version, the facet, the outcome verified | failed |
--                               unavailable (a verification that cannot be made is UNAVAILABLE, never FAILED), what was examined, the
--                               verifier, the subject's digest. Port graph.verify_trust (graph.trust.verify; a named person).
--   graph.trust_attestations    APPEND-ONLY (+ graph.trust_attestation_events): a PERSON's recorded, withdrawable statement "I inspected
--                               these facets of this version" (DESIGN D11) — NEVER an approval, never a release, it enables NO command;
--                               never an agent's, never the producer's or the owner's (the 0042 separation copied); it binds the envelope
--                               digest the attester read (a changed envelope refuses it: stale). Ports graph.attest_trust /
--                               graph.withdraw_trust_attestation (graph.trust.attest / graph.trust.withdraw).
--   graph.open_trust_investigation   an INVESTIGATION raises ONE attention item of the new class `trust_investigation` (the class list and
--                               the CHECK widened BY UNION — 0120 §TL's idiom), routed to the product's accountable owner under the domain's
--                               attention policy; nothing in the product changes (graph.trust.investigate; a named person).
--   graph.trust_overview        the READ the Trust and Governance workspace (/graph/trust, WS-18) draws: provenance strength by product,
--                               models (gateway calls), agents (agent runs), data rights, policy denials, exceptions (gate overrides),
--                               open challenges and appeals, investigations, attestations, verifications.
--   graph.px_signatures         the subject's recorded signatures (the verifier's input; eye_commit only).
--
-- THE HUMAN-AUTHORITY BOUNDARY (UX-27-004, UX-57-004): an indicator informs, an accountable person decides. No command anywhere reads a
-- facet, a strength or an attestation to become eligible; display truth never derives DECIDED from confidence. Every act here is a named
-- human's (the PDP's human gate and the port's own re-check); an agent is refused.
--
-- Refusal nouns (CLASS form; mapped centrally, observation-errors.ts B82 block): `trust verification`, `trust attestation`,
-- `trust investigation` — 403 actor|authority|separation_of_duties · 404 unknown_* · 409 state|stale|duplicate · 422 the rest. The reads keep
-- B50's `provenance` noun (subject → 422, unknown_object → 404).
--
-- Applies ALONE on 0001–0120 + 0121 §0 (+ §TS, §EV, §GM — §EV's graph.ev_evidence_state is read for custody and rights). No role gains a
-- permission it held not before (D9): the PDP rows graph.trust.* are this part's own actions (`/* B82 px */` in pdp.service.ts).
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this file and phase6-trust-b82 — every row there SYNTHETIC); DEMONSTRATED OPERATION (the act —
-- E. Lindqvist verifies, attests and investigates; SYNTHETIC personas); REAL ACCEPTANCE (UX-27-006 / UX-57-006: B111's shared recording
-- path, then H3) — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §PX.1 THE CONSTANTS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.px_strength_rule() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b82-px-strength-1' $$;
CREATE OR REPLACE FUNCTION graph.px_envelope_rule() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b82-px-envelope-1' $$;
CREATE OR REPLACE FUNCTION graph.px_facets() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['signature', 'lineage', 'custody', 'policy', 'evaluation', 'correction', 'rights', 'freshness'] $$;
CREATE OR REPLACE FUNCTION graph.px_attention_class() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'trust_investigation' $$;
/* Who may verify, attest and investigate (re-checked in the ports; the PDP rows name the same roles). An AUDITOR holds at TENANT. */
CREATE OR REPLACE FUNCTION graph.px_verifiers() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['auditor', 'record_authority', 'data_steward', 'knowledge_owner', 'method_steward', 'domain_analyst', 'domain_admin', 'decision_approver', 'privacy_officer'] $$;
CREATE OR REPLACE FUNCTION graph.px_attesters() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['auditor', 'record_authority', 'data_steward', 'knowledge_owner', 'method_steward', 'domain_analyst', 'decision_approver', 'risk_owner'] $$;
CREATE OR REPLACE FUNCTION graph.px_investigators() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['auditor', 'record_authority', 'data_steward', 'knowledge_owner', 'method_steward', 'domain_analyst', 'decision_approver', 'risk_owner',
               'decision_owner', 'decision_authority', 'executive', 'domain_admin', 'forecast_owner', 'strategy_owner'] $$;
GRANT EXECUTE ON FUNCTION graph.px_strength_rule(), graph.px_envelope_rule(), graph.px_facets(), graph.px_attention_class(),
                          graph.px_verifiers(), graph.px_attesters(), graph.px_investigators() TO eye_app, eye_commit;

-- §PX.2 THE STRENGTH OF AN EXPLANATION (internal; the read below and the envelope share it) ─────────────────────────────────────────────
/* The strength of one graph.explain answer: every finding kept as a reason (code, detail, node_id) and the strength the WORST of them
   (0 strong · 1 partial · 2 weak · 3 broken):
     BROKEN   an integrity gap — broken custody or an unverifiable artifact anywhere on the backward path;
     WEAK     an unresolved reference (unresolved_citation), another gap, an UNFIT fitness mark on the product or an input;
     PARTIAL  the walk truncated at its bounds, a withdrawn or corrected input, an approval no signature binds (unsigned_human_step), a
              model call without its recorded weights digest (undigested_model_call);
     STRONG   none of these. Never a number: the reasons are the answer. */
CREATE OR REPLACE FUNCTION graph.px_strength_of(p_tenant uuid, p_domain uuid, x jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, pg_catalog, pg_temp AS $$
DECLARE g jsonb; n jsonb; v_reasons jsonb := '[]'::jsonb; v_level int := 0; v_i int := 0; v_root text := x ->> 'ref'; v_ref jsonb; v_uuid uuid; v_later record;
        c record; y record; v_seen text[] := '{}';
BEGIN
  -- (1) the gaps, each kept (B50's closure never drops one)
  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(x -> 'gaps', '[]'::jsonb)) LOOP
    v_i := v_i + 1;
    IF g ->> 'kind' IN ('broken_custody', 'unverifiable_artifact') THEN
      v_level := greatest(v_level, 3);
      v_reasons := v_reasons || jsonb_build_object('code', 'gap', 'node_id', 'gap:' || v_i, 'detail', format('BROKEN — %s at %s: %s', replace(g ->> 'kind', '_', ' '), g ->> 'at', g ->> 'reason'));
    ELSIF g ->> 'kind' = 'incomplete_lineage' THEN
      v_level := greatest(v_level, 2);
      v_reasons := v_reasons || jsonb_build_object('code', 'unresolved_citation', 'node_id', 'gap:' || v_i, 'detail', format('%s (at %s)', g ->> 'reason', g ->> 'at'));
    ELSE
      v_level := greatest(v_level, 2);
      v_reasons := v_reasons || jsonb_build_object('code', 'gap', 'node_id', 'gap:' || v_i, 'detail', format('%s at %s: %s', replace(coalesce(g ->> 'kind', 'gap'), '_', ' '), g ->> 'at', g ->> 'reason'));
    END IF;
  END LOOP;
  -- (2) truncation
  IF coalesce((x ->> 'truncated')::boolean, false) THEN
    v_level := greatest(v_level, 1);
    v_reasons := v_reasons || jsonb_build_object('code', 'truncated', 'node_id', NULL,
      'detail', format('the backward walk reached its bounds after %s objects (max depth %s, max nodes %s) — what lies beyond is not examined', x ->> 'examined', x #>> '{bounds,max_depth}', x #>> '{bounds,max_nodes}'));
  END IF;
  -- (3) the nodes: model calls, approvals, the inputs
  FOR n IN SELECT * FROM jsonb_array_elements(coalesce(x -> 'nodes', '[]'::jsonb)) LOOP
    EXIT WHEN jsonb_array_length(v_reasons) >= 60;
    IF n ->> 'kind' = 'model_call' AND coalesce(n ->> 'ref', '') ~* '^gateway:[0-9a-f-]{36}$' THEN
      SELECT gc.model_id, gc.model_weights_digest, gc.prompt_version INTO y FROM intelligence.gateway_calls gc WHERE gc.call_id = substring(n ->> 'ref' from 9)::uuid AND gc.tenant_id = p_tenant;
      IF NOT FOUND OR coalesce(y.model_weights_digest, '') = '' THEN
        v_level := greatest(v_level, 1);
        v_reasons := v_reasons || jsonb_build_object('code', 'undigested_model_call', 'node_id', n ->> 'node_id',
          'detail', CASE WHEN NOT FOUND THEN format('the model call %s is not recorded — the model, its weights and its prompt cannot be named', n ->> 'ref')
                         ELSE format('model %s (prompt %s) is recorded without its weights digest — the exact model cannot be re-identified', y.model_id, coalesce(y.prompt_version, 'unrecorded')) END);
      END IF;
    ELSIF n ->> 'kind' = 'approval' AND n ->> 'outcome' = 'ok' AND coalesce(n ->> 'ref', '') ~* '^approval:[0-9a-f-]{36}$' THEN
      v_uuid := substring(n ->> 'ref' from 10)::uuid;
      IF NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.subject_id = v_uuid AND s.tenant_id = p_tenant) THEN
        v_level := greatest(v_level, 1);
        v_reasons := v_reasons || jsonb_build_object('code', 'unsigned_human_step', 'node_id', n ->> 'node_id',
          'detail', format('%s — no signature binds this approval to the version it approved', n ->> 'label'));
      END IF;
    ELSIF n ->> 'node_id' LIKE 'obj:%' THEN
      v_ref := graph.pv_ref(n ->> 'ref');
      CONTINUE WHEN v_ref ->> 'form' <> 'typed' OR v_ref ->> 'version' IS NULL OR (n ->> 'ref') = ANY (v_seen);
      v_seen := v_seen || (n ->> 'ref');
      SELECT o.object_type, o.object_id, o.object_version, o.lifecycle_state, o.truth_state INTO c FROM objects.canonical_objects o
       WHERE o.object_type = v_ref ->> 'type' AND o.object_id = (v_ref ->> 'id')::uuid AND o.object_version = (v_ref ->> 'version')::int AND o.tenant_id = p_tenant;
      CONTINUE WHEN NOT FOUND;
      -- an UNFIT mark (the latest) on the product or on an input — never on the product's OWN earlier version (a correction's original: the
      -- correction is what remedies it; act rehearsal finding — a correction of an UNFIT claim could never read better than WEAK)
      SELECT fm.verdict, fm.reasons, fm.marked_at INTO y FROM graph.product_fitness_marks fm
       WHERE fm.object_id = c.object_id AND fm.object_version = c.object_version AND fm.tenant_id = p_tenant ORDER BY fm.marked_at DESC LIMIT 1;
      IF FOUND AND y.verdict = 'unfit' AND ((n ->> 'ref') = v_root OR (graph.pv_ref(v_root) ->> 'id') <> c.object_id::text) THEN
        v_level := greatest(v_level, 2);
        v_reasons := v_reasons || jsonb_build_object('code', 'unfit', 'node_id', n ->> 'node_id',
          'detail', format('%s is marked UNFIT (%s) at %s', n ->> 'ref', array_to_string(y.reasons, ', '), graph.pv_iso(y.marked_at)));
      END IF;
      -- the product itself, and its own earlier versions (a correction's original): their correction or withdrawal is its display truth, not its provenance
      CONTINUE WHEN (n ->> 'ref') = v_root OR (graph.pv_ref(v_root) ->> 'id') = c.object_id::text;
      IF c.lifecycle_state IN ('withdrawn', 'deleted') OR c.truth_state = 'withdrawn' THEN
        v_level := greatest(v_level, 1);
        v_reasons := v_reasons || jsonb_build_object('code', 'withdrawn_input', 'node_id', n ->> 'node_id', 'detail', format('the input %s is WITHDRAWN', n ->> 'ref'));
        CONTINUE;
      END IF;
      SELECT o.object_version, o.lifecycle_state, o.truth_state, o.correction_of, o.withdrawal_reason INTO v_later FROM objects.canonical_objects o
       WHERE o.object_id = c.object_id AND o.object_type = c.object_type AND o.tenant_id = p_tenant AND o.object_version > c.object_version
         AND (o.truth_state = 'withdrawn' OR o.lifecycle_state = 'withdrawn' OR o.correction_of IN (c.object_id::text || '@' || c.object_version, c.object_type || ':' || c.object_id::text || '@' || c.object_version))
       ORDER BY o.object_version LIMIT 1;
      IF FOUND THEN
        v_level := greatest(v_level, 1);
        IF v_later.truth_state = 'withdrawn' OR v_later.lifecycle_state = 'withdrawn' THEN
          v_reasons := v_reasons || jsonb_build_object('code', 'withdrawn_input', 'node_id', n ->> 'node_id',
            'detail', format('the input %s was withdrawn since (v%s%s) — the product rests on a version no longer current', n ->> 'ref', v_later.object_version, coalesce(': ' || v_later.withdrawal_reason, '')));
        ELSE
          v_reasons := v_reasons || jsonb_build_object('code', 'corrected_input', 'node_id', n ->> 'node_id',
            'detail', format('the input %s was corrected since by v%s (the original preserved)', n ->> 'ref', v_later.object_version));
        END IF;
      ELSIF c.lifecycle_state IN ('corrected', 'superseded') THEN
        v_level := greatest(v_level, 1);
        v_reasons := v_reasons || jsonb_build_object('code', 'corrected_input', 'node_id', n ->> 'node_id', 'detail', format('the input %s is %s', n ->> 'ref', upper(c.lifecycle_state)));
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'ref', v_root,
    'strength', CASE v_level WHEN 0 THEN 'strong' WHEN 1 THEN 'partial' WHEN 2 THEN 'weak' ELSE 'broken' END,
    'reasons', v_reasons, 'rule_version', graph.px_strength_rule(), 'as_of', graph.pv_iso(clock_timestamp()),
    'basis', format('graph.explain (%s): %s nodes, %s gaps, %s; strength is the worst finding — broken (integrity gap), weak (unresolved reference, other gap, unfit), partial (truncated, withdrawn or corrected input, unsigned approval, undigested model call)',
                    x ->> 'method', jsonb_array_length(coalesce(x -> 'nodes', '[]'::jsonb)), jsonb_array_length(coalesce(x -> 'gaps', '[]'::jsonb)),
                    CASE WHEN coalesce((x ->> 'truncated')::boolean, false) THEN 'truncated' ELSE 'not truncated' END));
END $$;
REVOKE ALL ON FUNCTION graph.px_strength_of(uuid, uuid, jsonb) FROM PUBLIC;

-- §PX.3 graph.provenance_strength — §0's stub RE-DECLARED WHOLE ──────────────────────────────────────────────────────────────────────────
/* A READ (the 0120 idiom): STABLE, SECURITY DEFINER, the SAME fixed search path, the caller's scope asserted first (`read rejected (scope)`),
   the subject's shape checked (`provenance rejected (subject)` 22023 → 422). B82 px: the object is looked up in the caller's tenant AND
   domain (`provenance rejected (unknown_object)` 23503 → 404 — another scope's object is as unknown as one never recorded); the strength is
   graph.explain's, read through graph.px_strength_of. The answer keeps the stub's shape (ProvenanceStrengthRow) and adds `basis`. */
CREATE OR REPLACE FUNCTION graph.provenance_strength(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the provenance strength of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance rejected (subject): a provenance-strength read names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  -- B82 px: the strength is computed (rule b82-px-strength-1) — §0's stub answered `unknown` without looking
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_type = p_type AND c.object_id = p_id AND c.object_version = p_version
                    AND c.tenant_id = p_tenant AND c.domain_id = p_domain) THEN
    RAISE EXCEPTION 'provenance rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  RETURN graph.px_strength_of(p_tenant, p_domain, graph.explain(p_tenant, p_domain, p_type, p_id, p_version));
  -- end B82 px
END $$;
REVOKE ALL ON FUNCTION graph.provenance_strength(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.provenance_strength(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

-- §PX.4 THE LEDGERS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE graph.trust_verifications (
  verification_id     uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  subject_type        text NOT NULL CHECK (subject_type ~ '^[A-Z]{3}$'),
  subject_id          uuid NOT NULL,
  subject_version     int  NOT NULL CHECK (subject_version >= 1),
  subject_digest      text NOT NULL,
  facet               text NOT NULL CHECK (facet = ANY (graph.px_facets())),
  outcome             text NOT NULL CHECK (outcome IN ('verified', 'failed', 'unavailable')),
  detail              text NOT NULL CHECK (length(btrim(detail)) BETWEEN 4 AND 4000),
  examined            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(examined) = 'object'),
  rule_version        text NOT NULL,
  verifier            uuid NOT NULL,
  verified_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT gtv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE graph.trust_verifications IS 'B82 §PX (UX-57-002/003): one recorded verification of one facet of one product version — the outcome the SERVER computed (verified | failed | unavailable; a verification that cannot be made is unavailable, never failed), what was examined, the verifier, the subject digest. Append-only.';
CREATE INDEX gtv_subject ON graph.trust_verifications (tenant_id, subject_id, subject_version, facet, verified_at DESC);
CREATE TRIGGER gtv_append_only BEFORE UPDATE OR DELETE ON graph.trust_verifications FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.trust_attestations (
  attestation_id      uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  subject_type        text NOT NULL CHECK (subject_type ~ '^[A-Z]{3}$'),
  subject_id          uuid NOT NULL,
  subject_version     int  NOT NULL CHECK (subject_version >= 1),
  subject_digest      text NOT NULL,
  envelope_digest     text NOT NULL CHECK (envelope_digest ~ '^[0-9a-f]{64}$'),
  facets              text[] NOT NULL CHECK (cardinality(facets) >= 1 AND facets <@ graph.px_facets()),
  statement           text NOT NULL CHECK (length(btrim(statement)) BETWEEN 16 AND 2000),
  attested_by         uuid NOT NULL,
  attested_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT gta_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE graph.trust_attestations IS 'B82 §PX (UX-57-003/004, DESIGN D11): a PERSON''s recorded statement that they inspected the named facets of one product version, bound to the envelope digest they read — never an approval or a release, never an agent''s, never the producer''s or owner''s; it enables no command. Withdrawn through graph.trust_attestation_events. Append-only.';
CREATE INDEX gta_subject ON graph.trust_attestations (tenant_id, subject_id, subject_version, attested_at DESC);
CREATE TRIGGER gta_append_only BEFORE UPDATE OR DELETE ON graph.trust_attestations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.trust_attestation_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  attestation_id      uuid NOT NULL REFERENCES graph.trust_attestations (attestation_id),
  event               text NOT NULL CHECK (event IN ('trust.attested', 'trust.attestation_withdrawn')),
  actor_principal_id  uuid NOT NULL,
  reason              text,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  request_id          uuid NOT NULL UNIQUE,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT gtae_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gtae_reason CHECK (event <> 'trust.attestation_withdrawn' OR length(btrim(coalesce(reason, ''))) BETWEEN 8 AND 2000)
);
CREATE UNIQUE INDEX gtae_one_withdrawal ON graph.trust_attestation_events (attestation_id) WHERE event = 'trust.attestation_withdrawn';
CREATE INDEX gtae_attestation ON graph.trust_attestation_events (attestation_id, occurred_at);
CREATE TRIGGER gtae_append_only BEFORE UPDATE OR DELETE ON graph.trust_attestation_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* RLS (the 0120 graph idiom): within the bound tenant, and the bound domain for a DOMAIN context. SELECT only; the ports write. */
REVOKE ALL ON graph.trust_verifications, graph.trust_attestations, graph.trust_attestation_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trust_verifications', 'trust_attestations', 'trust_attestation_events'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §PX.5 THE ROWS AS THE SEAM STATES THEM ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.px_attestation_row(a graph.trust_attestations) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('attestation_id', a.attestation_id, 'subject', a.subject_type || ':' || a.subject_id || '@' || a.subject_version,
    'facets', to_jsonb(a.facets), 'statement', a.statement, 'attested_by', a.attested_by, 'attested_at', graph.pv_iso(a.attested_at),
    'envelope_digest', a.envelope_digest, 'subject_digest', a.subject_digest,
    'withdrawn_at', graph.pv_iso(w.occurred_at), 'withdrawn_by', w.actor_principal_id, 'withdraw_reason', w.reason,
    'state', CASE WHEN w.event_id IS NULL THEN 'standing' ELSE 'withdrawn' END,
    'kind', 'a recorded statement of inspection — not an approval, not a release; it enables no command')
  FROM (SELECT 1) one LEFT JOIN graph.trust_attestation_events w ON w.attestation_id = a.attestation_id AND w.event = 'trust.attestation_withdrawn'
$$;
REVOKE ALL ON FUNCTION graph.px_attestation_row(graph.trust_attestations) FROM PUBLIC;

CREATE OR REPLACE FUNCTION graph.px_verification_row(v graph.trust_verifications) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('verification_id', v.verification_id, 'subject', v.subject_type || ':' || v.subject_id || '@' || v.subject_version, 'facet', v.facet,
    'outcome', v.outcome, 'detail', v.detail, 'examined', v.examined, 'subject_digest', v.subject_digest, 'rule_version', v.rule_version,
    'verifier', v.verifier, 'verified_at', graph.pv_iso(v.verified_at))
$$;
REVOKE ALL ON FUNCTION graph.px_verification_row(graph.trust_verifications) FROM PUBLIC;

-- §PX.6 THE FACETS (computed by the server from stored rows; never the caller's) ─────────────────────────────────────────────────────────
/* One facet of one product version, LIVE, from its explanation `x`: {facet, outcome, detail, examined}. `signature` is not computed here
   (its verification needs the deployment's key — the service verifies, graph.verify_trust records); a read shows the latest recorded one.
     lineage     the backward closure: no gap and not truncated → verified; an integrity gap or an unresolved reference → failed; only
                 truncated → unavailable (nothing beyond the bounds was verified or refuted)
     custody     every evidence version on the path (§EV's graph.ev_evidence_state): integrity failed or custody not established → failed;
                 a tier unreachable or the bytes tombstoned → unavailable; no evidence on the path → not_checked
     rights      the rights terms of each evidence's source contract: expired or withdrawn → failed; all in force → verified; none
                 declared → not_checked (the source contract's own rights stand)
     correction  the product or an input corrected or withdrawn since → failed; else verified
     policy      the policy decisions on the production path (a claim's retrieval and admission decisions): a denial or an EXPIRED decision
                 → failed; all allowed → verified; none recorded → not_checked
     evaluation  a forecast's latest fitness assessment, else the product's latest fitness mark: fit → verified, unfit → failed, none →
                 not_checked
     freshness   the header's freshness assessment: stale → failed; assessed / current → verified; none → not_checked */
CREATE OR REPLACE FUNCTION graph.px_facet(p_tenant uuid, p_domain uuid, o objects.canonical_objects, x jsonb, p_facet text, p_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE n jsonb; g jsonb; v_ref jsonb; s jsonb; v_out text; v_detail text[] := '{}'; v_failed int := 0; v_unavail int := 0; v_ok int := 0; v_none int := 0; y record;
        v_integrity int := 0; v_unres int := 0; v_ex jsonb := '{}'::jsonb; v_root text := x ->> 'ref';
BEGIN
  IF p_facet = 'lineage' THEN
    FOR g IN SELECT * FROM jsonb_array_elements(coalesce(x -> 'gaps', '[]'::jsonb)) LOOP
      IF g ->> 'kind' IN ('broken_custody', 'unverifiable_artifact') THEN v_integrity := v_integrity + 1; ELSE v_unres := v_unres + 1; END IF;
      IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s at %s: %s', replace(g ->> 'kind', '_', ' '), g ->> 'at', g ->> 'reason'); END IF;
    END LOOP;
    v_ex := jsonb_build_object('examined', x -> 'examined', 'gaps', jsonb_array_length(coalesce(x -> 'gaps', '[]'::jsonb)), 'truncated', x -> 'truncated', 'method', x -> 'method');
    IF v_integrity + v_unres > 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', v_ex,
        'detail', format('%s gap(s) on the backward path (%s integrity, %s unresolved): %s', v_integrity + v_unres, v_integrity, v_unres, array_to_string(v_detail, '; ')));
    ELSIF coalesce((x ->> 'truncated')::boolean, false) THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'unavailable', 'examined', v_ex,
        'detail', format('the walk reached its bounds after %s objects — nothing beyond them was verified or refuted', x ->> 'examined'));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'verified', 'examined', v_ex, 'detail', format('%s object(s) on the backward path resolve; no gap recorded', x ->> 'examined'));
  ELSIF p_facet IN ('custody', 'rights') THEN
    FOR n IN SELECT * FROM jsonb_array_elements(coalesce(x -> 'nodes', '[]'::jsonb)) LOOP
      CONTINUE WHEN n ->> 'node_id' NOT LIKE 'obj:EVD:%';
      v_ref := graph.pv_ref(n ->> 'ref');
      CONTINUE WHEN v_ref ->> 'version' IS NULL;
      s := graph.ev_evidence_state(p_tenant, p_domain, (v_ref ->> 'id')::uuid, (v_ref ->> 'version')::int, NULL, NULL, p_at);
      IF p_facet = 'custody' THEN
        IF (s ->> 'integrity_failed')::boolean OR s #>> '{custody,state}' = 'not_established' OR (s ->> 'digest_ok') = 'false' THEN
          v_failed := v_failed + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: custody %s%s', n ->> 'ref', replace(coalesce(s #>> '{custody,state}', 'unknown'), '_', ' '), coalesce(' — ' || (s ->> 'detail'), '')); END IF;
        ELSIF (s ->> 'unreachable')::boolean OR (s ->> 'tombstoned')::boolean THEN
          v_unavail := v_unavail + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: %s', n ->> 'ref', coalesce(s ->> 'detail', 'the bytes cannot be reached')); END IF;
        ELSE v_ok := v_ok + 1; END IF;
      ELSE
        IF s ->> 'rights_state' IN ('expired', 'withdrawn') THEN
          v_failed := v_failed + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: rights %s (%s)', n ->> 'ref', s ->> 'rights_state', coalesce(s #>> '{rights,expiry_statement}', '')); END IF;
        ELSIF s ->> 'rights_state' = 'in_force' THEN v_ok := v_ok + 1;
        ELSE v_none := v_none + 1; END IF;
      END IF;
    END LOOP;
    v_ex := jsonb_build_object('evidence', v_ok + v_failed + v_unavail + v_none, 'verified', v_ok, 'failed', v_failed, 'unavailable', v_unavail, 'none_declared', v_none);
    IF v_ok + v_failed + v_unavail + v_none = 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', v_ex, 'detail', 'no evidence version lies on the backward path — nothing to check');
    ELSIF v_failed > 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', v_ex, 'detail', format('%s of %s evidence version(s) fail: %s', v_failed, v_ok + v_failed + v_unavail + v_none, array_to_string(v_detail, '; ')));
    ELSIF v_unavail > 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'unavailable', 'examined', v_ex, 'detail', format('%s evidence version(s) could not be checked: %s', v_unavail, array_to_string(v_detail, '; ')));
    ELSIF p_facet = 'rights' AND v_ok = 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', v_ex, 'detail', format('no rights terms are declared for the %s evidence version(s) on the path — the source contracts'' own rights stand', v_none));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'verified', 'examined', v_ex,
      'detail', CASE WHEN p_facet = 'custody' THEN format('custody established and intact for %s evidence version(s)', v_ok)
                     ELSE format('rights terms in force for %s evidence version(s)%s', v_ok, CASE WHEN v_none > 0 THEN format('; %s with no terms declared', v_none) ELSE '' END) END);
  ELSIF p_facet = 'correction' THEN
    SELECT c.object_version, c.lifecycle_state, c.truth_state INTO y FROM objects.canonical_objects c
     WHERE c.object_id = o.object_id AND c.object_type = o.object_type AND c.tenant_id = p_tenant AND c.object_version > o.object_version
       AND (c.truth_state = 'withdrawn' OR c.lifecycle_state = 'withdrawn' OR c.correction_of IN (o.object_id::text || '@' || o.object_version, o.object_type || ':' || o.object_id::text || '@' || o.object_version))
     ORDER BY c.object_version LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', jsonb_build_object('later_version', y.object_version),
        'detail', format('this version is %s by v%s — read the later version for any current use', CASE WHEN y.truth_state = 'withdrawn' OR y.lifecycle_state = 'withdrawn' THEN 'withdrawn' ELSE 'corrected' END, y.object_version));
    END IF;
    SELECT count(*) FILTER (WHERE r ->> 'code' IN ('withdrawn_input', 'corrected_input')) AS k,
           string_agg(r ->> 'detail', '; ') FILTER (WHERE r ->> 'code' IN ('withdrawn_input', 'corrected_input')) AS d INTO y
      FROM jsonb_array_elements(graph.px_strength_of(p_tenant, p_domain, x) -> 'reasons') r;
    IF y.k > 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', jsonb_build_object('inputs_changed', y.k), 'detail', format('%s input(s) changed since: %s', y.k, left(y.d, 1200)));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'verified', 'examined', '{}'::jsonb, 'detail', 'no correction or withdrawal is recorded on this version or on its inputs');
  ELSIF p_facet = 'policy' THEN
    FOR n IN SELECT * FROM jsonb_array_elements(coalesce(x -> 'nodes', '[]'::jsonb)) LOOP
      CONTINUE WHEN n ->> 'kind' <> 'policy_decision' OR coalesce(n ->> 'ref', '') !~* '^policy:[0-9a-f-]{36}$' OR n ->> 'label' LIKE 'denied:%';
      SELECT d.decision, d.action, d.expires_at INTO y FROM policy.policy_decisions d WHERE d.id = substring(n ->> 'ref' from 8)::uuid;
      CONTINUE WHEN NOT FOUND;
      IF y.decision NOT IN ('allow', 'allow_with_obligations') THEN
        v_failed := v_failed + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: %s', y.action, y.decision); END IF;
      ELSIF y.expires_at IS NOT NULL AND y.expires_at <= p_at THEN
        v_failed := v_failed + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: allowed, EXPIRED at %s', y.action, graph.pv_iso(y.expires_at)); END IF;
      ELSE v_ok := v_ok + 1; END IF;
    END LOOP;
    v_ex := jsonb_build_object('decisions', v_ok + v_failed, 'allowed', v_ok, 'failed', v_failed);
    IF v_ok + v_failed = 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', v_ex, 'detail', 'no policy decision is recorded on the production path (retrieval and admission of its claims)');
    ELSIF v_failed > 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', v_ex, 'detail', format('%s policy decision(s) on the production path deny or have expired: %s', v_failed, array_to_string(v_detail, '; ')));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'verified', 'examined', v_ex, 'detail', format('%s policy decision(s) on the production path allowed and in force', v_ok));
  ELSIF p_facet = 'evaluation' THEN
    IF o.object_type = 'FCT' THEN
      SELECT fa.verdict, fa.fitness_class, fa.rule_version, fa.assessed_at INTO y FROM prediction.forecast_fitness_assessments fa
       WHERE fa.forecast_id = o.object_id AND fa.tenant_id = p_tenant ORDER BY fa.assessed_at DESC LIMIT 1;
      IF FOUND THEN
        RETURN jsonb_build_object('facet', p_facet, 'outcome', CASE y.verdict WHEN 'fit' THEN 'verified' WHEN 'unfit' THEN 'failed' ELSE 'unavailable' END,
          'examined', jsonb_build_object('rule_version', y.rule_version, 'assessed_at', graph.pv_iso(y.assessed_at)),
          'detail', format('forecast fitness %s%s under %s at %s', y.verdict, coalesce(' (' || y.fitness_class || ')', ''), y.rule_version, graph.pv_iso(y.assessed_at)));
      END IF;
    END IF;
    SELECT fm.verdict, fm.reasons, fm.rule_version, fm.marked_at INTO y FROM graph.product_fitness_marks fm
     WHERE fm.object_id = o.object_id AND fm.object_version = o.object_version AND fm.tenant_id = p_tenant ORDER BY fm.marked_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', CASE y.verdict WHEN 'fit' THEN 'verified' WHEN 'unfit' THEN 'failed' ELSE 'unavailable' END,
        'examined', jsonb_build_object('rule_version', y.rule_version, 'marked_at', graph.pv_iso(y.marked_at)),
        'detail', format('fitness mark %s%s under %s at %s', y.verdict, CASE WHEN cardinality(y.reasons) > 0 THEN ' (' || array_to_string(y.reasons, ', ') || ')' ELSE '' END, y.rule_version, graph.pv_iso(y.marked_at)));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', '{}'::jsonb, 'detail', 'not evaluated — no fitness assessment or mark is recorded for this version');
  ELSIF p_facet = 'freshness' THEN
    IF o.freshness_state IS NULL OR jsonb_typeof(o.freshness_state) <> 'object' THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', '{}'::jsonb, 'detail', 'no freshness assessment is recorded on this version');
    ELSIF o.freshness_state ->> 'state' = 'stale' THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', o.freshness_state,
        'detail', format('STALE under %s%s', coalesce(o.freshness_state ->> 'method', 'its method'), coalesce(format(' — stale by %s day(s)', o.freshness_state ->> 'stale_by_days'), '')));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'verified', 'examined', o.freshness_state,
      'detail', format('%s under %s%s', coalesce(o.freshness_state ->> 'state', 'assessed'), coalesce(o.freshness_state ->> 'method', 'its method'), coalesce(' as of ' || (o.freshness_state ->> 'as_of'), '')));
  END IF;
  RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', '{}'::jsonb, 'detail', 'not computed by a read');
END $$;
REVOKE ALL ON FUNCTION graph.px_facet(uuid, uuid, objects.canonical_objects, jsonb, text, timestamptz) FROM PUBLIC;

/* The subject's recorded signatures (the version's own, and — for a decision package version — its approvals'): the verifier's input.
   A guarded read (N-01, 0102): the caller's bound tenant and domain asserted first; the rows looked up within them only. */
CREATE OR REPLACE FUNCTION graph.px_signatures(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the signatures of a product');
  SELECT coalesce(jsonb_agg(jsonb_build_object('signature_id', s.signature_id, 'subject_kind', s.subject_kind, 'subject_id', s.subject_id, 'subject_version', s.subject_version,
                                               'subject_digest', s.subject_digest, 'signer', s.signer, 'key_id', s.key_id, 'algorithm', s.algorithm, 'signature', s.signature,
                                               'bound_action', s.bound_action, 'signed_at', graph.pv_iso(s.signed_at)) ORDER BY s.signed_at, s.signature_id), '[]'::jsonb) INTO v
    FROM executive.signatures s
   WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain
     AND ((s.subject_id = p_id AND (s.subject_version IS NULL OR s.subject_version = p_version))
          OR (p_type = 'DPK' AND s.subject_id IN (SELECT a.approval_id FROM decision.approvals a WHERE a.package_id = p_id AND a.version = p_version)));
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION graph.px_signatures(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.px_signatures(uuid, uuid, text, uuid, int) TO eye_commit;

-- §PX.7 THE TRUST ENVELOPE (the read) ───────────────────────────────────────────────────────────────────────────────────────────────────
/* FACETS, NEVER A SCORE. Each facet: {facet, outcome, detail, checked_at, checked_by, basis, examined} — `basis` says whether the read
   computed it now (`computed`) or shows the latest RECORDED verification (`recorded`; the signature facet always — its key is the
   server's); a later recorded verification of a computed facet is listed under `verifications`. TRUST INDETERMINATE when any facet FAILED
   or could NOT be verified (unavailable), or the provenance is BROKEN: the reasons, the constrained use and the routes (verify again,
   open an investigation). The DIGEST binds the subject, its digest, every facet's outcome and words, the strength and its reason codes, and
   the attestations' ids and states — an attestation names it. STABLE; the caller's scope first. */
CREATE OR REPLACE FUNCTION graph.trust_envelope(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE o objects.canonical_objects; x jsonb; v_now timestamptz := clock_timestamp(); f text; v_facets jsonb := '[]'::jsonb; v_row jsonb; rv graph.trust_verifications%ROWTYPE;
        v_strength jsonb; v_att jsonb; v_ver jsonb; v_inv jsonb; v_reasons jsonb := '[]'::jsonb; v_digest text; v_ref text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the trust envelope of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance rejected (subject): a trust envelope names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_type = p_type AND c.object_id = p_id AND c.object_version = p_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'provenance rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  v_ref := p_type || ':' || p_id || '@' || p_version;
  x := graph.explain(p_tenant, p_domain, p_type, p_id, p_version);
  v_strength := graph.px_strength_of(p_tenant, p_domain, x);
  FOREACH f IN ARRAY graph.px_facets() LOOP
    SELECT * INTO rv FROM graph.trust_verifications t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.subject_id = p_id AND t.subject_version = p_version AND t.facet = f
     ORDER BY t.verified_at DESC, t.verification_id DESC LIMIT 1;
    IF f = 'signature' THEN
      IF rv.verification_id IS NULL THEN
        v_row := jsonb_build_object('facet', f, 'outcome', 'not_checked', 'examined', jsonb_build_object('signatures', jsonb_array_length(graph.px_signatures(p_tenant, p_domain, p_type, p_id, p_version))),
          'detail', CASE WHEN jsonb_array_length(graph.px_signatures(p_tenant, p_domain, p_type, p_id, p_version)) = 0 THEN 'no signature is recorded on this version'
                         ELSE 'not verified yet — a signature is verified on request with the deployment''s key (verify again)' END,
          'checked_at', NULL, 'checked_by', NULL, 'basis', 'recorded');
      ELSE
        v_row := jsonb_build_object('facet', f, 'outcome', rv.outcome, 'detail', rv.detail, 'examined', rv.examined, 'checked_at', graph.pv_iso(rv.verified_at), 'checked_by', rv.verifier, 'basis', 'recorded');
      END IF;
    ELSE
      v_row := graph.px_facet(p_tenant, p_domain, o, x, f, v_now) || jsonb_build_object('checked_at', graph.pv_iso(v_now), 'checked_by', NULL, 'basis', 'computed');
      IF rv.verification_id IS NOT NULL THEN
        v_row := v_row || jsonb_build_object('recorded', jsonb_build_object('outcome', rv.outcome, 'detail', rv.detail, 'verified_at', graph.pv_iso(rv.verified_at), 'verifier', rv.verifier));
      END IF;
    END IF;
    v_facets := v_facets || v_row;
    IF v_row ->> 'outcome' IN ('failed', 'unavailable') THEN
      v_reasons := v_reasons || jsonb_build_object('facet', f, 'outcome', v_row ->> 'outcome', 'detail', v_row ->> 'detail');
    END IF;
  END LOOP;
  IF v_strength ->> 'strength' = 'broken' THEN
    v_reasons := v_reasons || jsonb_build_object('facet', 'provenance', 'outcome', 'broken', 'detail', 'the provenance is BROKEN — an integrity gap on the backward path');
  END IF;
  SELECT coalesce(jsonb_agg(graph.px_attestation_row(a) ORDER BY a.attested_at DESC), '[]'::jsonb) INTO v_att FROM graph.trust_attestations a
   WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.subject_id = p_id AND a.subject_version = p_version;
  SELECT coalesce(jsonb_agg(graph.px_verification_row(t) ORDER BY t.verified_at DESC), '[]'::jsonb) INTO v_ver FROM (
    SELECT * FROM graph.trust_verifications t0 WHERE t0.tenant_id = p_tenant AND t0.domain_id = p_domain AND t0.subject_id = p_id AND t0.subject_version = p_version
     ORDER BY t0.verified_at DESC LIMIT 20) t;
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'state', i.state, 'title', i.title, 'owner', i.owner_principal_id, 'facet', i.details ->> 'facet',
                                               'opened_at', graph.pv_iso(i.created_at)) ORDER BY i.created_at DESC), '[]'::jsonb) INTO v_inv
    FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = graph.px_attention_class() AND i.subject_id = p_id
     AND i.details ->> 'version' = p_version::text AND i.state NOT IN ('closed', 'resolved');
  v_digest := encode(sha256(convert_to(jsonb_build_object(
      'subject', v_ref, 'subject_digest', o.content_digest, 'rule', graph.px_envelope_rule(),
      'facets', (SELECT jsonb_agg(jsonb_build_object('facet', e ->> 'facet', 'outcome', e ->> 'outcome', 'detail', e ->> 'detail')) FROM jsonb_array_elements(v_facets) e),
      'strength', v_strength ->> 'strength', 'reasons', (SELECT coalesce(jsonb_agg(r ->> 'code'), '[]'::jsonb) FROM jsonb_array_elements(v_strength -> 'reasons') r),
      'attestations', (SELECT coalesce(jsonb_agg(jsonb_build_array(a ->> 'attestation_id', a ->> 'state')), '[]'::jsonb) FROM jsonb_array_elements(v_att) a))::text, 'UTF8')), 'hex');
  RETURN jsonb_build_object(
    'subject', v_ref, 'subject_digest', o.content_digest, 'title', left(coalesce(o.payload ->> 'title', o.payload ->> 'statement', o.payload ->> 'subject', o.payload ->> 'label', o.object_type || ' ' || o.object_id::text), 200),
    'owner', o.accountable_owner, 'facets', v_facets, 'provenance', v_strength, 'attestations', v_att, 'verifications', v_ver, 'investigations', v_inv,
    'indeterminate', jsonb_array_length(v_reasons) > 0, 'reasons', v_reasons,
    'constrained_use', CASE WHEN jsonb_array_length(v_reasons) > 0
                            THEN 'TRUST INDETERMINATE — not for a decision-active use until each failing or unverifiable facet is verified again or investigated; the failing evidence is kept as recorded'
                            END,
    'routes', jsonb_build_object('verify', 'graph.trust.verify', 'investigate', 'graph.trust.investigate', 'attest', 'graph.trust.attest',
                                 'note', 'an indicator informs; an accountable person decides — no command reads these facets to become eligible'),
    'rule_version', graph.px_envelope_rule(), 'digest', v_digest, 'as_of', graph.pv_iso(v_now));
END $$;
REVOKE ALL ON FUNCTION graph.trust_envelope(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.trust_envelope(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

-- §PX.8 THE PORTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The acting PERSON: the bound principal, named by the route, an ACTIVE HUMAN holding one of the roles at a covering scope (an auditor at
   TENANT counts) — re-checked here, the PDP's human gate not trusted alone. */
CREATE OR REPLACE FUNCTION graph.px_actor(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_what text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, identity, governance, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal, never on behalf of another', p_noun USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION '% rejected (actor): % is a named person''s act — an agent or a system never verifies, attests or investigates trust', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT governance.holds_role(v, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is the act of a %', p_noun, p_what, array_to_string(p_roles, ', ') USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION graph.px_actor(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* The subject version, recorded in the caller's domain, or the refusal under the noun. */
CREATE OR REPLACE FUNCTION graph.px_subject(p_noun text, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS objects.canonical_objects
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, pg_catalog, pg_temp AS $$
DECLARE o objects.canonical_objects;
BEGIN
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION '% rejected (subject): the subject is a recorded product named by type (three capitals), id and version', p_noun USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_type = p_type AND c.object_id = p_id AND c.object_version = p_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION '% rejected (unknown_object): % % v% is not recorded in this domain', p_noun, p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION graph.px_subject(text, uuid, uuid, text, uuid, int) FROM PUBLIC;

/* VERIFY AGAIN one facet of one product version (graph.trust.verify): the SERVER computes the outcome from stored rows (px_facet) — for
   `signature` the service hands the verifier's outcome per recorded signature (the key is the deployment's) and the port checks it names
   EXACTLY the subject's recorded signatures (none omitted, none foreign): any failed → failed; else any unavailable → unavailable (never
   failed); all verified → verified; none recorded → unavailable ("nothing to verify"). Recorded append-only; a request id replayed by the
   same person answers the recorded verification. */
CREATE OR REPLACE FUNCTION graph.verify_trust(p_request_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_facet text, p_signatures jsonb,
                                              p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; o objects.canonical_objects; r graph.trust_verifications%ROWTYPE; v jsonb; v_rec jsonb; v_given text[]; v_have text[]; v_failed int; v_unavail int; v_n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.trust.verify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.px_actor('trust verification', p_actor, p_tenant, p_domain, graph.px_verifiers(), 'verifying the trust of a product');
  IF p_request_id IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'trust verification rejected (request): a verification carries its request id (the command identity a retry reuses) and its correlation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM graph.trust_verifications t WHERE t.request_id = p_request_id;
  IF FOUND THEN
    IF r.verifier IS DISTINCT FROM v_actor OR r.subject_id IS DISTINCT FROM p_id OR r.subject_version IS DISTINCT FROM p_version OR r.facet IS DISTINCT FROM p_facet THEN
      RAISE EXCEPTION 'trust verification rejected (duplicate): request % already recorded another verification; a new verification takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN graph.px_verification_row(r) || jsonb_build_object('replayed', true);
  END IF;
  IF p_facet IS NULL OR NOT (p_facet = ANY (graph.px_facets())) THEN
    RAISE EXCEPTION 'trust verification rejected (facet): the facet is one of %', array_to_string(graph.px_facets(), ', ') USING ERRCODE = '22023';
  END IF;
  o := graph.px_subject('trust verification', p_tenant, p_domain, p_type, p_id, p_version);
  IF p_facet = 'signature' THEN
    v_rec := graph.px_signatures(p_tenant, p_domain, p_type, p_id, p_version);
    IF p_signatures IS NULL OR jsonb_typeof(p_signatures) <> 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_signatures) e WHERE jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'outcome', '') NOT IN ('verified', 'failed', 'unavailable')
                                                                       OR coalesce(e ->> 'signature_id', '') !~* '^[0-9a-f-]{36}$') THEN
      RAISE EXCEPTION 'trust verification rejected (signatures): a signature verification carries the verifier''s outcome (verified, failed, unavailable) for each recorded signature' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(lower(e ->> 'signature_id') ORDER BY lower(e ->> 'signature_id')), '{}') INTO v_given FROM jsonb_array_elements(p_signatures) e;
    SELECT coalesce(array_agg(lower(e ->> 'signature_id') ORDER BY lower(e ->> 'signature_id')), '{}') INTO v_have FROM jsonb_array_elements(v_rec) e;
    IF v_given IS DISTINCT FROM v_have THEN
      RAISE EXCEPTION 'trust verification rejected (signatures): the verification names % signature(s); % are recorded on % — every recorded signature is verified, none other', cardinality(v_given), cardinality(v_have), p_type || ':' || p_id || '@' || p_version USING ERRCODE = '22023';
    END IF;
    SELECT count(*) FILTER (WHERE e ->> 'outcome' = 'failed'), count(*) FILTER (WHERE e ->> 'outcome' = 'unavailable'), count(*) INTO v_failed, v_unavail, v_n FROM jsonb_array_elements(p_signatures) e;
    v := jsonb_build_object('facet', 'signature',
      'outcome', CASE WHEN v_n = 0 THEN 'unavailable' WHEN v_failed > 0 THEN 'failed' WHEN v_unavail > 0 THEN 'unavailable' ELSE 'verified' END,
      'detail', CASE WHEN v_n = 0 THEN 'no signature is recorded on this version — nothing to verify'
                     ELSE format('%s signature(s): %s', v_n, (SELECT string_agg(format('%s %s%s', left(e ->> 'signature_id', 8), upper(e ->> 'outcome'), coalesce(' — ' || (e ->> 'reason'), '')), '; ') FROM jsonb_array_elements(p_signatures) e)) END,
      'examined', jsonb_build_object('signatures', p_signatures));
  ELSE
    IF p_signatures IS NOT NULL AND jsonb_typeof(p_signatures) <> 'null' THEN
      RAISE EXCEPTION 'trust verification rejected (signatures): only the signature facet carries the verifier''s outcomes; % is computed by the server', p_facet USING ERRCODE = '22023';
    END IF;
    v := graph.px_facet(p_tenant, p_domain, o, graph.explain(p_tenant, p_domain, p_type, p_id, p_version), p_facet, clock_timestamp());
    IF v ->> 'outcome' = 'not_checked' THEN
      v := v || jsonb_build_object('outcome', 'unavailable', 'detail', 'nothing to verify — ' || (v ->> 'detail'));
    END IF;
  END IF;
  INSERT INTO graph.trust_verifications (verification_id, scope, tenant_id, domain_id, subject_type, subject_id, subject_version, subject_digest, facet, outcome, detail, examined,
                                         rule_version, verifier, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_type, p_id, p_version, o.content_digest, p_facet, v ->> 'outcome', left(v ->> 'detail', 4000), coalesce(v -> 'examined', '{}'::jsonb),
          graph.px_envelope_rule(), v_actor, p_request_id, p_correlation)
  RETURNING * INTO r;
  PERFORM governance.ledger(p_tenant, p_domain, 'trust_verification', r.verification_id, p_version, 'trust.verified', v_actor,
                            jsonb_build_object('subject', p_type || ':' || p_id || '@' || p_version, 'facet', p_facet, 'outcome', r.outcome), p_correlation);
  RETURN graph.px_verification_row(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.verify_trust(uuid, uuid, uuid, text, uuid, int, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.verify_trust(uuid, uuid, uuid, text, uuid, int, text, jsonb, uuid, uuid) TO eye_commit;

/* The producers of a product version (the people who made it): its accountable owner, the people named on it (human_refs), and — for a
   decision package version — the human authors of recommendations on it. The attester is none of them (the 0042 separation copied). */
CREATE OR REPLACE FUNCTION graph.px_producers(o objects.canonical_objects) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT u) FILTER (WHERE u IS NOT NULL), '{}') FROM (
    SELECT graph.pv_owner(o.accountable_owner) u
    UNION ALL SELECT CASE WHEN h.v ~* '^(principal:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN regexp_replace(h.v, '^principal:', '')::uuid END
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(o.human_refs) = 'array' THEN o.human_refs ELSE '[]'::jsonb END) h(v)
    UNION ALL SELECT r.author_principal_id FROM decision.recommendations r
      WHERE o.object_type = 'DPK' AND r.package_id = o.object_id AND r.version = o.object_version AND r.author_kind = 'human' AND r.tenant_id = o.tenant_id) s
$$;
REVOKE ALL ON FUNCTION graph.px_producers(objects.canonical_objects) FROM PUBLIC;

/* ATTEST (graph.trust.attest): a named person records that they inspected the named facets of this version, against the envelope digest
   they read. NEVER an approval: nothing reads an attestation to admit a command. Refused: an agent (actor); a role outside the attesters
   (authority); the producer or the owner (separation_of_duties); a changed envelope (stale — read it again); the same person's standing
   attestation of the same facets of the same version (duplicate). */
CREATE OR REPLACE FUNCTION graph.attest_trust(p_request_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_facets text[], p_statement text,
                                              p_envelope_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; o objects.canonical_objects; a graph.trust_attestations%ROWTYPE; v_env jsonb; v_facets text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.trust.attest']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.px_actor('trust attestation', p_actor, p_tenant, p_domain, graph.px_attesters(), 'attesting what was inspected of a product');
  IF p_request_id IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'trust attestation rejected (request): an attestation carries its request id and its correlation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM graph.trust_attestations t WHERE t.request_id = p_request_id;
  IF FOUND THEN
    IF a.attested_by IS DISTINCT FROM v_actor OR a.subject_id IS DISTINCT FROM p_id OR a.subject_version IS DISTINCT FROM p_version THEN
      RAISE EXCEPTION 'trust attestation rejected (duplicate): request % already recorded another act; a new attestation takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN graph.px_attestation_row(a) || jsonb_build_object('replayed', true);
  END IF;
  o := graph.px_subject('trust attestation', p_tenant, p_domain, p_type, p_id, p_version);
  IF v_actor = ANY (graph.px_producers(o)) THEN
    RAISE EXCEPTION 'trust attestation rejected (separation_of_duties): an attestation is never made by the product''s producer or owner — an independent person inspects it' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(DISTINCT f ORDER BY f) INTO v_facets FROM unnest(coalesce(p_facets, '{}')) f;
  IF v_facets IS NULL OR NOT (v_facets <@ graph.px_facets()) THEN
    RAISE EXCEPTION 'trust attestation rejected (facets): an attestation names the facets inspected, among %', array_to_string(graph.px_facets(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) < 16 OR length(btrim(p_statement)) > 2000 THEN
    RAISE EXCEPTION 'trust attestation rejected (statement): the statement says what was inspected and how, in 16 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_envelope_digest IS NULL OR p_envelope_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'trust attestation rejected (digest): an attestation names the envelope digest the attester read (64 hex)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.trust.attest:' || p_id::text || '@' || p_version, 0));
  v_env := graph.trust_envelope(p_tenant, p_domain, p_type, p_id, p_version);
  IF v_env ->> 'digest' IS DISTINCT FROM p_envelope_digest THEN
    RAISE EXCEPTION 'trust attestation rejected (stale): the trust envelope of % changed since it was read (now %…) — read it again before attesting', p_type || ':' || p_id || '@' || p_version, left(v_env ->> 'digest', 12) USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM graph.trust_attestations t WHERE t.subject_id = p_id AND t.subject_version = p_version AND t.attested_by = v_actor AND t.facets = v_facets AND t.tenant_id = p_tenant
               AND NOT EXISTS (SELECT 1 FROM graph.trust_attestation_events w WHERE w.attestation_id = t.attestation_id AND w.event = 'trust.attestation_withdrawn')) THEN
    RAISE EXCEPTION 'trust attestation rejected (duplicate): your attestation of these facets of this version stands — withdraw it first to record another' USING ERRCODE = '23505';
  END IF;
  INSERT INTO graph.trust_attestations (attestation_id, scope, tenant_id, domain_id, subject_type, subject_id, subject_version, subject_digest, envelope_digest, facets, statement,
                                        attested_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_type, p_id, p_version, o.content_digest, p_envelope_digest, v_facets, btrim(p_statement), v_actor, p_request_id, p_correlation)
  RETURNING * INTO a;
  INSERT INTO graph.trust_attestation_events (event_id, scope, tenant_id, domain_id, attestation_id, event, actor_principal_id, details, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, a.attestation_id, 'trust.attested', v_actor,
          jsonb_build_object('subject', p_type || ':' || p_id || '@' || p_version, 'facets', to_jsonb(v_facets), 'envelope_digest', p_envelope_digest,
                             'indeterminate', v_env -> 'indeterminate'), gen_random_uuid(), p_correlation);
  RETURN graph.px_attestation_row(a) || jsonb_build_object('replayed', false, 'indeterminate_when_attested', v_env -> 'indeterminate');
END $$;
REVOKE ALL ON FUNCTION graph.attest_trust(uuid, uuid, uuid, text, uuid, int, text[], text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.attest_trust(uuid, uuid, uuid, text, uuid, int, text[], text, text, uuid, uuid) TO eye_commit;

/* WITHDRAW one's own attestation (graph.trust.withdraw), with the reason; the attestation stays on record, marked withdrawn. */
CREATE OR REPLACE FUNCTION graph.withdraw_trust_attestation(p_request_id uuid, p_tenant uuid, p_domain uuid, p_attestation uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; a graph.trust_attestations%ROWTYPE; e graph.trust_attestation_events%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.trust.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.px_actor('trust attestation', p_actor, p_tenant, p_domain, graph.px_attesters(), 'withdrawing an attestation');
  IF p_request_id IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'trust attestation rejected (request): a withdrawal carries its request id and its correlation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM graph.trust_attestation_events w WHERE w.request_id = p_request_id;
  IF FOUND THEN
    IF e.actor_principal_id IS DISTINCT FROM v_actor OR e.attestation_id IS DISTINCT FROM p_attestation OR e.event <> 'trust.attestation_withdrawn' THEN
      RAISE EXCEPTION 'trust attestation rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    SELECT * INTO a FROM graph.trust_attestations t WHERE t.attestation_id = p_attestation;
    RETURN graph.px_attestation_row(a) || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO a FROM graph.trust_attestations t WHERE t.attestation_id = p_attestation AND t.tenant_id = p_tenant AND t.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trust attestation rejected (unknown_attestation): no attestation % in this domain', coalesce(p_attestation::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF a.attested_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'trust attestation rejected (actor): an attestation is withdrawn only by the person who made it' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(btrim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'trust attestation rejected (reason): a withdrawal says why, in 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM graph.trust_attestation_events w WHERE w.attestation_id = p_attestation AND w.event = 'trust.attestation_withdrawn') THEN
    RAISE EXCEPTION 'trust attestation rejected (state): the attestation is already withdrawn' USING ERRCODE = '23514';
  END IF;
  INSERT INTO graph.trust_attestation_events (event_id, scope, tenant_id, domain_id, attestation_id, event, actor_principal_id, reason, details, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_attestation, 'trust.attestation_withdrawn', v_actor, btrim(p_reason),
          jsonb_build_object('subject', a.subject_type || ':' || a.subject_id || '@' || a.subject_version), p_request_id, p_correlation);
  RETURN graph.px_attestation_row(a) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.withdraw_trust_attestation(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.withdraw_trust_attestation(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §PX.9 THE INVESTIGATION (an attention item of the class `trust_investigation`) ─────────────────────────────────────────────────────────
/* THE VOCABULARY, WIDENED BY UNION (0120 §TL's idiom): the class list and the CHECK are read as they stand and re-stated with the class
   appended — so every earlier widening is kept. The subject kind `canonical_object` exists since 0120 §TL. */
DO $$
DECLARE v_classes text[]; v_def text; v_vals text[];
BEGIN
  v_classes := executive.attention_signal_classes();
  IF NOT ('trust_investigation' = ANY (v_classes)) THEN
    v_classes := v_classes || ARRAY['trust_investigation'];   -- B82 px: the trust investigation (UX-57-003)
    EXECUTE format('CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$ SELECT ARRAY[%s] $f$',
                   (SELECT string_agg(quote_literal(c), ', ' ORDER BY n) FROM unnest(v_classes) WITH ORDINALITY u(c, n)));
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = 'executive.attention_items'::regclass AND c.conname = 'attention_items_signal_class_check';
  SELECT array_agg(r.m[1] ORDER BY r.n) INTO v_vals FROM regexp_matches(v_def, '''([^'']+)''', 'g') WITH ORDINALITY r(m, n);
  IF NOT ('trust_investigation' = ANY (v_vals)) THEN
    v_vals := v_vals || ARRAY['trust_investigation'];
    ALTER TABLE executive.attention_items DROP CONSTRAINT attention_items_signal_class_check;
    EXECUTE format('ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (%s))',
                   (SELECT string_agg(quote_literal(c), ', ' ORDER BY n) FROM unnest(v_vals) WITH ORDINALITY u(c, n)));
  END IF;
END $$;

/* OPEN AN INVESTIGATION (graph.trust.investigate): a named person asks the product's owner to investigate its trust — optionally one facet
   — with a note. ONE item per (product version, facet) while open: a repeat answers the item it made (`repeated`). Owned by the accountable
   owner when that owner is an active person of the tenant (else the knowledge owner and the data steward are routed), evaluated under the
   domain's ACTIVE attention policy (no rule for the class: abstained → deprioritized, still visible and owned). The envelope as read is kept
   in the item. Nothing in the product changes. */
CREATE OR REPLACE FUNCTION graph.open_trust_investigation(p_item_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_facet text, p_note text,
                                                          p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, governance, observation, objects, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; o objects.canonical_objects; v_env jsonb; v_cause uuid; v_owner uuid; x executive.attention_items%ROWTYPE; pol executive.attention_policies%ROWTYPE;
        v_eval jsonb; v_route jsonb; v_state text; v_ref text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.trust.investigate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.px_actor('trust investigation', p_actor, p_tenant, p_domain, graph.px_investigators(), 'opening a trust investigation');
  IF p_item_id IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'trust investigation rejected (request): the request names its item id and its correlation' USING ERRCODE = '22023';
  END IF;
  IF p_facet IS NOT NULL AND NOT (p_facet = ANY (graph.px_facets() || ARRAY['provenance'])) THEN
    RAISE EXCEPTION 'trust investigation rejected (facet): the facet is one of %, provenance — or none (the whole envelope)', array_to_string(graph.px_facets(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN
    RAISE EXCEPTION 'trust investigation rejected (reason): the request says what the owner should investigate (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  o := graph.px_subject('trust investigation', p_tenant, p_domain, p_type, p_id, p_version);
  v_ref := p_type || ':' || p_id || '@' || p_version;
  v_cause := md5('trust:' || v_ref || '|' || coalesce(p_facet, '*'))::uuid;
  SELECT * INTO x FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = graph.px_attention_class() AND i.subject_id = p_id
     AND i.cause_event_id = v_cause AND i.state NOT IN ('closed', 'resolved');
  IF FOUND THEN
    RETURN jsonb_build_object('item_id', x.item_id, 'repeated', true, 'state', x.state, 'outcome', x.outcome, 'owner', x.owner_principal_id, 'route_roles', to_jsonb(x.route_roles),
                              'ref', v_ref, 'facet', p_facet, 'title', x.title);
  END IF;
  v_env := graph.trust_envelope(p_tenant, p_domain, p_type, p_id, p_version);
  v_owner := graph.pv_owner(o.accountable_owner);
  v_owner := CASE WHEN v_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v_owner AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN v_owner END;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, graph.px_attention_class(),
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, graph.px_attention_class(), v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, graph.px_attention_class(), 'canonical_object', p_id, v_cause, 'TrustInvestigationOpened',
          left(format('Investigate the trust of %s v%s%s: %s', p_type, p_version, coalesce(' (' || p_facet || ')', ''), btrim(p_note)), 512),
          v_eval ->> 'outcome', v_state, v_owner,
          CASE WHEN v_owner IS NULL AND jsonb_array_length(coalesce(v_route -> 'route_roles', '[]'::jsonb)) = 0 THEN ARRAY['knowledge_owner', 'data_steward']
               ELSE ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')) END,
          pol.policy_id, pol.version, v_eval,
          jsonb_build_object('ref', v_ref, 'type', p_type, 'id', p_id, 'version', p_version, 'facet', p_facet, 'note', btrim(p_note), 'requested_by', v_actor,
                             'accountable_owner', o.accountable_owner, 'envelope_digest', v_env ->> 'digest', 'indeterminate', v_env -> 'indeterminate',
                             'reasons', v_env -> 'reasons', 'strength', v_env #>> '{provenance,strength}', 'rule_version', graph.px_envelope_rule()),
          (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
  PERFORM executive.attention_event(p_item_id, p_tenant, p_domain,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
            v_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                        'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'TrustInvestigationOpened', 'facet', p_facet), p_correlation);
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item_id;
  RETURN jsonb_build_object('item_id', x.item_id, 'repeated', false, 'state', x.state, 'outcome', x.outcome, 'owner', x.owner_principal_id, 'route_roles', to_jsonb(x.route_roles),
                            'ref', v_ref, 'facet', p_facet, 'title', x.title, 'envelope_digest', v_env ->> 'digest', 'evaluation', v_eval);
END $$;
REVOKE ALL ON FUNCTION graph.open_trust_investigation(uuid, uuid, uuid, text, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.open_trust_investigation(uuid, uuid, uuid, text, uuid, int, text, text, uuid, uuid) TO eye_commit;

-- §PX.10 THE TRUST AND GOVERNANCE WORKSPACE'S READ (WS-18, /graph/trust) ─────────────────────────────────────────────────────────────────
/* p_scope (every member optional): `types` (object types of the products listed; default DPK, BRF, FCT, SIM), `limit` (products, 1–25,
   default 12), `days` (the window of the counts, 1–365, default 30). Each product's provenance strength is computed (graph.explain per
   product — bounded by `limit`); the rest are counts and lists of what is recorded: models (gateway calls by model, prompt and runtime with
   their outcomes and whether the weights digest is recorded), agents (agent runs by kind and version with their outcomes), data rights
   (the rights terms of the domain by state), policy denials (by action), exceptions (gate overrides in force), open contest (knowledge and
   simulation challenges, appeals), trust investigations, attestations, verifications. STABLE; the caller's scope first. */
CREATE OR REPLACE FUNCTION graph.trust_overview(p_tenant uuid, p_domain uuid, p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_scope jsonb := coalesce(p_scope, '{}'::jsonb); v_types text[] := ARRAY['DPK', 'BRF', 'FCT', 'SIM']; v_limit int := 12; v_days int := 30; v_since timestamptz; v_now timestamptz := clock_timestamp();
        v_products jsonb := '[]'::jsonb; o record; s jsonb; v_models jsonb; v_agents jsonb; v_rights jsonb; v_denials jsonb; v_exc jsonb; v_contest jsonb; v_inv jsonb; v_att jsonb; v_ver jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the trust and governance overview');
  IF jsonb_typeof(v_scope) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_scope) k WHERE k NOT IN ('types', 'limit', 'days')) THEN
    RAISE EXCEPTION 'provenance rejected (overview_scope): the overview is asked by types, limit and days only' USING ERRCODE = '22023';
  END IF;
  IF v_scope ? 'types' THEN
    IF jsonb_typeof(v_scope -> 'types') <> 'array' OR jsonb_array_length(v_scope -> 'types') NOT BETWEEN 1 AND 12
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_scope -> 'types') e WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~ '^[A-Z]{3}$') THEN
      RAISE EXCEPTION 'provenance rejected (overview_scope): types is a list of 1 to 12 object types (three capitals)' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(e #>> '{}') INTO v_types FROM jsonb_array_elements(v_scope -> 'types') e;
  END IF;
  IF v_scope ? 'limit' THEN
    IF jsonb_typeof(v_scope -> 'limit') <> 'number' OR (v_scope ->> 'limit') !~ '^[0-9]+$' OR (v_scope ->> 'limit')::int NOT BETWEEN 1 AND 25 THEN
      RAISE EXCEPTION 'provenance rejected (overview_scope): limit is 1 to 25 products' USING ERRCODE = '22023';
    END IF;
    v_limit := (v_scope ->> 'limit')::int;
  END IF;
  IF v_scope ? 'days' THEN
    IF jsonb_typeof(v_scope -> 'days') <> 'number' OR (v_scope ->> 'days') !~ '^[0-9]+$' OR (v_scope ->> 'days')::int NOT BETWEEN 1 AND 365 THEN
      RAISE EXCEPTION 'provenance rejected (overview_scope): days is 1 to 365' USING ERRCODE = '22023';
    END IF;
    v_days := (v_scope ->> 'days')::int;
  END IF;
  v_since := v_now - make_interval(days => v_days);
  -- the products: the latest version of the most recently recorded products of the asked types, each with its provenance strength
  FOR o IN SELECT * FROM (SELECT DISTINCT ON (c.object_id) c.object_type, c.object_id, c.object_version, c.recorded_at, c.lifecycle_state, c.truth_state, c.accountable_owner,
                  left(coalesce(c.payload ->> 'title', c.payload ->> 'statement', c.payload ->> 'subject', c.payload ->> 'label', c.object_type || ' ' || c.object_id::text), 160) AS title
             FROM objects.canonical_objects c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.object_type = ANY (v_types)
            ORDER BY c.object_id, c.object_version DESC) z ORDER BY z.recorded_at DESC, z.object_id LIMIT v_limit LOOP
    s := graph.px_strength_of(p_tenant, p_domain, graph.explain(p_tenant, p_domain, o.object_type, o.object_id, o.object_version::int));
    v_products := v_products || jsonb_build_object('ref', o.object_type || ':' || o.object_id || '@' || o.object_version, 'type', o.object_type, 'id', o.object_id, 'version', o.object_version,
      'title', o.title, 'lifecycle', o.lifecycle_state, 'truth_state', o.truth_state, 'owner', o.accountable_owner, 'recorded_at', graph.pv_iso(o.recorded_at),
      'strength', s ->> 'strength', 'reasons', s -> 'reasons',
      'attestations', (SELECT count(*) FROM graph.trust_attestations a WHERE a.subject_id = o.object_id AND a.subject_version = o.object_version AND a.tenant_id = p_tenant
                         AND NOT EXISTS (SELECT 1 FROM graph.trust_attestation_events w WHERE w.attestation_id = a.attestation_id AND w.event = 'trust.attestation_withdrawn')));
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('model', q.model_id, 'prompt_version', q.prompt_version, 'runtime_version', q.runtime_version, 'calls', q.n, 'outcomes', q.outcomes,
             'weights_digest_recorded', q.digested, 'last_at', graph.pv_iso(q.last_at)) ORDER BY q.n DESC, q.model_id), '[]'::jsonb) INTO v_models FROM (
    SELECT r.model_id, r.prompt_version, r.runtime_version, sum(r.n)::int n, jsonb_object_agg(r.outcome, r.n) outcomes, bool_and(r.digested) digested, max(r.last_at) last_at FROM (
      SELECT g.model_id, g.prompt_version, g.runtime_version, coalesce(g.outcome, 'unrecorded') outcome, count(*) n, bool_and(coalesce(g.model_weights_digest, '') <> '') digested, max(g.occurred_at) last_at
        FROM intelligence.gateway_calls g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.occurred_at >= v_since GROUP BY 1, 2, 3, 4) r
     GROUP BY 1, 2, 3 ORDER BY sum(r.n) DESC LIMIT 25) q;
  SELECT coalesce(jsonb_agg(jsonb_build_object('agent', q.agent_kind, 'version', q.agent_version, 'runs', q.n, 'outcomes', q.outcomes, 'last_at', graph.pv_iso(q.last_at)) ORDER BY q.n DESC, q.agent_kind), '[]'::jsonb) INTO v_agents FROM (
    SELECT r.agent_kind, r.agent_version, sum(r.n)::int n, jsonb_object_agg(r.outcome, r.n) outcomes, max(r.last_at) last_at FROM (
      SELECT ar.agent_kind, ar.agent_version, coalesce(ar.outcome, 'running') outcome, count(*) n, max(ar.started_at) last_at FROM executive.agent_runs ar
       WHERE ar.tenant_id = p_tenant AND ar.domain_id = p_domain AND ar.started_at >= v_since GROUP BY 1, 2, 3) r GROUP BY 1, 2 LIMIT 25) q;
  SELECT jsonb_build_object('in_force', count(*) FILTER (WHERE observation.rt_state(t, v_now) = 'in_force'), 'expired', count(*) FILTER (WHERE observation.rt_state(t, v_now) = 'expired'),
                            'withdrawn', count(*) FILTER (WHERE observation.rt_state(t, v_now) = 'withdrawn'),
                            'not_in_force', coalesce(jsonb_agg(observation.rt_json(t, v_now)) FILTER (WHERE observation.rt_state(t, v_now) <> 'in_force'), '[]'::jsonb))
    INTO v_rights FROM (SELECT DISTINCT ON (r.source_id, r.contract_version) r.* FROM observation.rights_terms r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain
                         ORDER BY r.source_id, r.contract_version, r.version DESC) t;
  SELECT coalesce(jsonb_agg(jsonb_build_object('action', q.action, 'decision', q.decision, 'count', q.n, 'last_at', graph.pv_iso(q.last_at), 'last_reason', q.reason) ORDER BY q.n DESC, q.action), '[]'::jsonb) INTO v_denials FROM (
    SELECT d.action, d.decision, count(*) n, max(d.created_at) last_at, (array_agg(left(d.reason, 200) ORDER BY d.created_at DESC))[1] reason FROM policy.policy_decisions d
     WHERE d.tenant_id = p_tenant AND (d.domain_id = p_domain OR d.domain_id IS NULL) AND d.decision IN ('deny', 'indeterminate') AND d.created_at >= v_since
     GROUP BY d.action, d.decision ORDER BY count(*) DESC LIMIT 25) q;
  SELECT coalesce(jsonb_agg(jsonb_build_object('override_id', g.override_id, 'package', 'DPK:' || g.package_id || '@' || g.version, 'kind', g.kind, 'granted_by', g.granted_by,
             'granted_at', graph.pv_iso(g.granted_at), 'expires_at', graph.pv_iso(g.expires_at), 'review_due_at', graph.pv_iso(g.review_due_at), 'reviewed', g.reviewed_at IS NOT NULL,
             'rationale', left(g.rationale, 300)) ORDER BY g.granted_at DESC), '[]'::jsonb) INTO v_exc
    FROM decision.gate_overrides g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND (g.expires_at IS NULL OR g.expires_at > v_now);
  SELECT jsonb_build_object(
    'knowledge_challenges', (SELECT coalesce(jsonb_agg(jsonb_build_object('challenge_id', k.challenge_id, 'subject', k.subject_type || ':' || k.subject_id || '@' || k.subject_version, 'state', k.state,
                               'opened_at', graph.pv_iso(k.opened_at), 'grounds', left(k.grounds, 200)) ORDER BY k.opened_at DESC), '[]'::jsonb)
                               FROM (SELECT * FROM graph.knowledge_challenges k0 WHERE k0.tenant_id = p_tenant AND k0.domain_id = p_domain AND k0.state IN ('open', 'under_review') ORDER BY k0.opened_at DESC LIMIT 25) k),
    'simulation_challenges', (SELECT count(*) FROM simulation.challenges sc WHERE sc.tenant_id = p_tenant AND sc.domain_id = p_domain AND sc.state IN ('open', 'rerun_requested')),
    'appeals', (SELECT count(*) FROM decision.appeal_cases ac WHERE ac.tenant_id = p_tenant AND ac.domain_id = p_domain AND ac.state IN ('opened', 'under_review'))) INTO v_contest;
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'ref', i.details ->> 'ref', 'facet', i.details ->> 'facet', 'state', i.state, 'owner', i.owner_principal_id,
             'route_roles', to_jsonb(i.route_roles), 'title', i.title, 'opened_at', graph.pv_iso(i.created_at)) ORDER BY i.created_at DESC), '[]'::jsonb) INTO v_inv
    FROM (SELECT * FROM executive.attention_items i0 WHERE i0.tenant_id = p_tenant AND i0.domain_id = p_domain AND i0.signal_class = graph.px_attention_class() ORDER BY i0.created_at DESC LIMIT 25) i;
  SELECT coalesce(jsonb_agg(graph.px_attestation_row(a) ORDER BY a.attested_at DESC), '[]'::jsonb) INTO v_att
    FROM (SELECT * FROM graph.trust_attestations a0 WHERE a0.tenant_id = p_tenant AND a0.domain_id = p_domain ORDER BY a0.attested_at DESC LIMIT 25) a;
  SELECT coalesce(jsonb_agg(graph.px_verification_row(t) ORDER BY t.verified_at DESC), '[]'::jsonb) INTO v_ver
    FROM (SELECT * FROM graph.trust_verifications t0 WHERE t0.tenant_id = p_tenant AND t0.domain_id = p_domain ORDER BY t0.verified_at DESC LIMIT 25) t;
  RETURN jsonb_build_object(
    'products', v_products, 'models', v_models, 'agents', v_agents, 'rights', v_rights, 'policy_denials', v_denials, 'exceptions', v_exc, 'contest', v_contest,
    'investigations', v_inv, 'attestations', v_att, 'verifications', v_ver,
    'window', jsonb_build_object('days', v_days, 'since', graph.pv_iso(v_since)), 'types', to_jsonb(v_types), 'limit', v_limit,
    'statement', 'Facets and records, never a trust score: each product''s provenance strength with its reasons, and the models, agents, rights, denials, exceptions, contest, investigations, attestations and verifications as recorded. An attestation is a person''s statement of inspection, never an approval.',
    'rule_version', graph.px_envelope_rule(), 'strength_rule', graph.px_strength_rule(), 'as_of', graph.pv_iso(v_now));
END $$;
REVOKE ALL ON FUNCTION graph.trust_overview(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.trust_overview(uuid, uuid, jsonb) TO eye_app, eye_commit;
