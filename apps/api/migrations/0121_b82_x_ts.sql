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
