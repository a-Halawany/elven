-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 — CP-6 B50: THE KNOWLEDGE CORE — canonical header completeness, identity and temporal semantics (F-P3-01); the governed work-object
-- lifecycle state machine (F-P3-02); provenance, lineage and forward-impact completeness (F-P3-03); the timeline, as-of and decision-grade
-- trace explorer (F-P3-04); correction-propagation closure (F-P3-05); and V01-T-046 (F-P7-F-03's "lifecycle coverage" measure, carried).
-- 0001–0119 are applied or committed and untouched.
--
-- §0 PRELUDE (the integrator): THE KNOWLEDGE HOOKS and THE SHARED PORTS THAT CALL THEM. "Decision-active" (DESIGN D17 / Q18) is a use: an
-- object cited by a package option, the source of a publication version at its approval and delivery, an object an export package carries
-- at its build, an object a gate act makes decision-ready. Each such port asks ONE question before it acts — objects.assert_usable(type, id,
-- version, use) — and the publication and export ports a second — objects.publication_frozen(type, id, version). Here both are INERT
-- stubs: assert_usable dispatches to objects._header_usable (§HD fills it: the type's mandatory header fields for that use) and
-- objects._lineage_usable (§PV fills it: incomplete lineage, broken custody, an unverifiable artifact — the generic unfit); both return
-- without refusing. publication_frozen (§CL fills it: graph.publication_freezes) answers frozen = false. The shared ports are re-declared
-- HERE, each copied WHOLE from its last definition with the call marked `-- B50 §0`, so no two parts re-declare the same function:
--   decision.derive_option         (0078)        per cited object                          assert_usable(…, 'decision_option')
--   executive.approve_publication  (0094 §D)     the version's source (BRF / DPK)          assert_usable(…, 'publication') + publication_frozen
--   executive.deliver_publication  (0094 §D)     the version's source (BRF / DPK)          assert_usable(…, 'publication') + publication_frozen
--   retention.record_export_package (0073)       the EVD of each executed manifest         assert_usable(…, 'export')      + publication_frozen
--   decision.gate_act              (0119 §HA)    the 'ready' act: every option citation    assert_usable(…, 'gate')
-- Nothing else in these bodies moves: every existing check keeps its order and text (the hook comes after them), the grants are re-stated as
-- they were, no signature changes. The parts' tables and ports follow in their sections, folded in the order §0, §HD, §LC, §PV, §CI, §CL, §TL.
--
-- THE PRINCIPLES (binding on every part): a correction never rewrites what was historically available, and never a human decision or
-- commitment (recompute is a re-run REQUEST to the owner; human_review is the owner's acknowledgement); unresolved impact stays visible until
-- owned and closed; absence is stated, never blank, and old versions read "recorded before B50" (no back-fill, no header field added — the
-- 43-field header and its digests stay intact); a view never conceals a later correction, a missing interval or a policy filter. THREE
-- CLAIMS: construction (this migration and its harnesses); demonstrated operation (the act — SYNTHETIC personas, `claim = 'demonstration'`);
-- real acceptance (B111's recording path, then R2/H3) — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §0.1 THE HOOKS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- INTERNAL (the 0094 helper idiom): no runtime grant — reachable only from inside the SECURITY DEFINER ports above, which run as the owner.
-- STABLE, and they never write: decision.derive_option is STABLE, so a hook that wrote would fail there (a marking is recorded by its own
-- port). A refusal is RAISEd by the hook in the class form `object use rejected (<class>): …` (observation-errors.ts `B50 §0`):
-- (unknown_object) 23503 → 404 · (incomplete_header) / (unfit) 22023 → 409 · (use) 22023 → 422. A part fills ITS hook by re-declaring
-- the stub WHOLE with the same signature, volatility and return type; assert_usable itself is §0's and is never re-declared.
CREATE OR REPLACE FUNCTION objects._header_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
BEGIN
  -- §HD fills this: the type's header profile (objects.header_profiles) names the fields mandatory for p_use; a missing one refuses (ES-24-003).
  RETURN;
END $$;
REVOKE ALL ON FUNCTION objects._header_usable(text, uuid, int, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION objects._lineage_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
BEGIN
  -- §PV fills this: graph.product_fitness — incomplete lineage, broken custody or an unverifiable artifact makes the product unfit (DP-23-005).
  RETURN;
END $$;
REVOKE ALL ON FUNCTION objects._lineage_usable(text, uuid, int, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION objects.assert_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
BEGIN
  IF p_use IS NULL OR p_use NOT IN ('decision_option', 'publication', 'export', 'gate') THEN
    RAISE EXCEPTION 'object use rejected (use): % is not a decision-active use (decision_option, publication, export, gate)', coalesce(p_use, '<none>') USING ERRCODE = '22023';
  END IF;
  PERFORM objects._header_usable(p_type, p_id, p_version, p_use);
  PERFORM objects._lineage_usable(p_type, p_id, p_version, p_use);
END $$;
REVOKE ALL ON FUNCTION objects.assert_usable(text, uuid, int, text) FROM PUBLIC;

-- frozen: TRUE while an open correction case has frozen publication of this object or of a product it cites (§CL decides the reach);
-- case_id names the case for the port's refusal (`publication rejected (held)` / `export rejected (held)` — 409).
CREATE OR REPLACE FUNCTION objects.publication_frozen(p_type text, p_id uuid, p_version int, OUT frozen boolean, OUT case_id uuid)
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
BEGIN
  -- §CL fills this from graph.publication_freezes.
  frozen := false;
  case_id := NULL;
END $$;
REVOKE ALL ON FUNCTION objects.publication_frozen(text, uuid, int) FROM PUBLIC;

-- §0.2 THE SHARED PORTS, re-declared (each copied WHOLE from its last definition; the only change is the marked B50 §0 call) ──────────────────

-- §0.2a decision.derive_option — 0078 (B18) line 401, its LAST definition, copied whole; + one assert_usable per cited object, after the citation
-- resolves (recorded in this domain, its digest, not withdrawn / deleted) and before its kind's own gates. Every caller (set_option, the
-- carry-forward, propose, the reopen's carry — 0049, 0078, 0083, 0090, 0101) reaches it unchanged.
CREATE OR REPLACE FUNCTION decision.derive_option(
  p_tenant uuid, p_domain uuid, p_known_at timestamptz, p_observed_through date, p_consequences jsonb, p_unsimulated_reason text, p_label text
) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, simulation, twin, prediction, objects, pg_catalog, pg_temp AS $$
DECLARE
  c jsonb; o record; r record; tv record; tw record;
  v_type text; v_basis jsonb := '[]'::jsonb; v_inputs jsonb := '[]'::jsonb; v_b jsonb; v_simulated boolean := false;
  v_uncertainty jsonb; v_controls jsonb; v_synthetic boolean;
BEGIN
  IF NOT decision.citations_ok(p_consequences) THEN RAISE EXCEPTION '%: consequences must be typed citations with id, version and digest', p_label USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_consequences) LOOP
    v_type := CASE c ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' WHEN 'warning' THEN 'WRN' END;
    IF v_type IS NULL THEN RAISE EXCEPTION '%: consequence kind % is not one an option cites', p_label, c ->> 'kind' USING ERRCODE = '22023'; END IF;
    SELECT * INTO o FROM objects.canonical_objects x
     WHERE x.object_type = v_type AND x.object_id = (c ->> 'id')::uuid AND x.object_version = (c ->> 'version')::int AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION '%: citation %@% is not a recorded % in this domain', p_label, c ->> 'id', c ->> 'version', v_type USING ERRCODE = '23503'; END IF;
    IF o.content_digest IS DISTINCT FROM (c ->> 'digest') THEN
      RAISE EXCEPTION '%: citation %@% carries digest %, not the recorded digest %', p_label, c ->> 'id', c ->> 'version', c ->> 'digest', o.content_digest USING ERRCODE = '22023';
    END IF;
    IF o.lifecycle_state IN ('withdrawn', 'deleted') THEN RAISE EXCEPTION '%: citation %@% is %; a consequence cannot rest on it', p_label, c ->> 'id', c ->> 'version', o.lifecycle_state USING ERRCODE = '22023'; END IF;
    PERFORM objects.assert_usable(v_type, (c ->> 'id')::uuid, (c ->> 'version')::int, 'decision_option');  -- B50 §0: the cited object is usable for a package option (§HD header, §PV lineage)
    IF v_type <> 'SIM' THEN
      -- B18 (0078): a withdrawn forecast's issued version is still active in canonical_objects (the withdrawn version is v2); the row's state refuses it.
      IF v_type = 'FCT' AND EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = (c ->> 'id')::uuid AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.state = 'withdrawn') THEN
        RAISE EXCEPTION '%: forecast % was withdrawn as unfit (%: %); a consequence cannot rest on it', p_label, c ->> 'id',
          (SELECT f.withdrawal ->> 'unfit_class' FROM prediction.forecasts_current f WHERE f.forecast_id = (c ->> 'id')::uuid), (SELECT f.withdrawal ->> 'reason' FROM prediction.forecasts_current f WHERE f.forecast_id = (c ->> 'id')::uuid) USING ERRCODE = '22023';
      END IF;
      IF o.recorded_at > p_known_at THEN
        RAISE EXCEPTION '%: citation %@% was recorded at %, after the version''s known_at %', p_label, c ->> 'id', c ->> 'version', decision.iso(o.recorded_at), decision.iso(p_known_at) USING ERRCODE = '22023';
      END IF;
      IF p_observed_through IS NOT NULL AND o.event_time IS NOT NULL AND o.event_time::date > p_observed_through THEN
        RAISE EXCEPTION '%: citation %@% has event time %, after the version''s observed_through %', p_label, c ->> 'id', c ->> 'version', decision.iso(o.event_time), p_observed_through USING ERRCODE = '22023';
      END IF;
      v_b := jsonb_build_object('kind', c ->> 'kind', 'id', c ->> 'id', 'version', (c ->> 'version')::int, 'digest', o.content_digest, 'object_type', v_type,
                                'truth_state', o.truth_state, 'synthetic_state', o.synthetic_state, 'lifecycle_state', o.lifecycle_state, 'quality_state', o.quality_state,
                                'classification', o.classification, 'recorded_at', decision.iso(o.recorded_at), 'event_time', decision.iso(o.event_time));
    ELSE
      SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = (c ->> 'id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND OR r.state <> 'completed' THEN RAISE EXCEPTION '%: run % is not a completed run in this domain', p_label, c ->> 'id' USING ERRCODE = '23503'; END IF;
      -- B18 (0078): an invalidated result, and a result resting on a withdrawn forecast, are not decision-citable.
      IF r.validity = 'invalidated' THEN
        RAISE EXCEPTION '%: run % was invalidated at % (%: %); a consequence cannot rest on an invalidated result', p_label, c ->> 'id', decision.iso(r.invalidated_at), r.invalidation ->> 'trigger', r.invalidation ->> 'reason' USING ERRCODE = '22023';
      END IF;
      -- (alias fc, not c: c is the loop's variable and would be substituted)
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(r.initial_state, '[]'::jsonb)) el, jsonb_array_elements(coalesce(el -> 'citations', '[]'::jsonb)) fc
                   JOIN prediction.forecasts_current f ON f.forecast_id = (fc ->> 'id')::uuid AND f.tenant_id = p_tenant AND f.domain_id = p_domain
                  WHERE (fc ->> 'kind') = 'forecast' AND f.state = 'withdrawn') THEN
        RAISE EXCEPTION '%: run % rests on a forecast withdrawn as unfit; a consequence cannot rest on it until the run is re-issued on a live forecast', p_label, c ->> 'id' USING ERRCODE = '22023';
      END IF;
      IF r.known_at > p_known_at THEN
        RAISE EXCEPTION '%: run % rests on inputs known at %, after the version''s known_at %; a run may complete later, its inputs may not', p_label, c ->> 'id', decision.iso(r.known_at), decision.iso(p_known_at) USING ERRCODE = '22023';
      END IF;
      IF p_observed_through IS NOT NULL AND r.observed_through IS NOT NULL AND r.observed_through > p_observed_through THEN
        RAISE EXCEPTION '%: run % rests on observations through %, after the version''s observed_through %', p_label, c ->> 'id', r.observed_through, p_observed_through USING ERRCODE = '22023';
      END IF;
      SELECT * INTO tv FROM twin.twin_versions x WHERE x.twin_id = r.twin_id AND x.version = r.twin_version;
      SELECT * INTO tw FROM twin.twins_current x WHERE x.twin_id = r.twin_id;
      v_simulated := true;
      v_b := jsonb_build_object('kind', 'run', 'id', c ->> 'id', 'version', (c ->> 'version')::int, 'digest', o.content_digest, 'object_type', 'SIM',
                                'truth_state', o.truth_state, 'synthetic_state', o.synthetic_state, 'lifecycle_state', o.lifecycle_state, 'quality_state', o.quality_state,
                                'classification', o.classification, 'recorded_at', decision.iso(o.recorded_at),
                                'run_kind', r.run_kind, 'control_run_id', r.control_run_id, 'twin_id', r.twin_id, 'twin_version', r.twin_version,
                                'known_at', decision.iso(r.known_at), 'observed_through', r.observed_through, 'completed_at', decision.iso(r.completed_at),
                                'validation_status', r.validation_status,
                                'outside_envelope', coalesce(r.outside_envelope, false) OR coalesce((r.sensitivity ->> 'outside_envelope')::boolean, false),
                                'sensitivity', jsonb_build_object('relative', r.sensitivity -> 'relative', 'factors', coalesce(r.sensitivity -> 'factors', '[]'::jsonb), 'outside_envelope', r.sensitivity -> 'outside_envelope'),
                                'inherited_validation', coalesce((SELECT jsonb_agg(jsonb_build_object('key', e ->> 'key', 'state', e ->> 'inherited_validation', 'citations', e -> 'citations'))
                                                                    FROM jsonb_array_elements(coalesce(r.initial_state, '[]'::jsonb)) e
                                                                   WHERE (e ->> 'kind') = 'predicted' AND (e ->> 'inherited_validation') IS NOT NULL), '[]'::jsonb),
                                'twin_validation', jsonb_build_object('status', tw.validation ->> 'status', 'limitations', tw.validation -> 'limitations',
                                                                      'version_state', tv.state, 'version_completeness', tv.completeness, 'version_synthetic_state', tv.synthetic_state));
    END IF;
    v_basis := v_basis || v_b;
    v_inputs := v_inputs || jsonb_build_object('synthetic_state', o.synthetic_state, 'classification', o.classification, 'rights_profile', o.rights_profile,
                                               'residency_profile', o.residency_profile, 'retention_profile', o.retention_profile, 'access_policy_ref', o.access_policy_ref);
  END LOOP;
  IF NOT v_simulated AND length(btrim(coalesce(p_unsimulated_reason, ''))) < 8 THEN
    RAISE EXCEPTION '%: no consequence cites a completed run; say why the option is unsimulated', p_label USING ERRCODE = '22023';
  END IF;
  v_uncertainty := jsonb_build_object(
    'method', 'derived-at-port@2', 'citations', jsonb_array_length(v_basis),
    'synthetic_inputs', (SELECT count(*) FROM jsonb_array_elements(v_basis) b WHERE (b ->> 'synthetic_state')::boolean),
    'unvalidated_runs', (SELECT count(*) FROM jsonb_array_elements(v_basis) b WHERE (b ->> 'kind') = 'run' AND coalesce(b ->> 'validation_status', '') NOT IN ('validated', 'validated_retrospective')),
    'outside_envelope_runs', (SELECT count(*) FROM jsonb_array_elements(v_basis) b WHERE (b ->> 'kind') = 'run' AND (b ->> 'outside_envelope')::boolean),
    'truth_states', coalesce((SELECT jsonb_agg(t ORDER BY t) FROM (SELECT DISTINCT b ->> 'truth_state' t FROM jsonb_array_elements(v_basis) b) s), '[]'::jsonb),
    'basis', v_basis);
  v_controls := CASE WHEN jsonb_array_length(v_inputs) = 0 THEN decision.fold_controls('[{"synthetic_state": false, "classification": "internal"}]'::jsonb) ELSE decision.fold_controls(v_inputs) END;
  v_synthetic := jsonb_array_length(v_inputs) > 0 AND (v_controls ->> 'synthetic_state')::boolean;
  RETURN jsonb_build_object('uncertainty', v_uncertainty, 'controls', v_controls, 'synthetic_state', v_synthetic, 'simulated', v_simulated);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.derive_option(uuid,uuid,timestamptz,date,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.derive_option(uuid,uuid,timestamptz,date,jsonb,text,text) TO eye_app, eye_commit;

-- §0.2b executive.approve_publication — 0094 §D line 6328, its LAST definition, copied whole; + the source's use and freeze, after every
-- existing check (they keep their precedence) and before the version is approved. The source is the version's binding: a briefing edition
-- (BRF, source_version = its canonical version) or a report render (DPK, the package version = its canonical version — executive.publication_source).
CREATE OR REPLACE FUNCTION executive.approve_publication(
  p_publication_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_signature_id uuid, p_object_version bigint, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p executive.publications%ROWTYPE; v executive.publication_versions%ROWTYPE; x executive.external_drafts%ROWTYPE; v_ev uuid;
        /* B50 §0 */ v_src_type text; v_frz record; /* end B50 §0 */
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): approved by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM executive.publications q WHERE q.publication_id = p_publication_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_publication): no publication % in this domain', p_publication_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM executive.publication_versions q WHERE q.publication_id = p_publication_id AND q.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_version): publication % has no version %', p_publication_id, p_version USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'decision_authority']) THEN
    RAISE EXCEPTION 'publication rejected (authority): a publication is approved by a human holding executive or decision_authority in this domain' USING ERRCODE = '42501';
  END IF;
  IF p_actor = v.drafted_by THEN RAISE EXCEPTION 'publication rejected (separation): the drafter of version % does not approve it', p_version USING ERRCODE = '42501'; END IF;
  IF p.state IN ('withdrawn', 'archived') THEN RAISE EXCEPTION 'publication rejected (state): publication % is %', p_publication_id, p.state USING ERRCODE = '22023'; END IF;
  IF v.state <> 'drafted' THEN RAISE EXCEPTION 'publication rejected (state): version % is %, not drafted; an approved version is immutable', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM v.bytes_digest THEN
    RAISE EXCEPTION 'publication rejected (stale_digest): the digest confirmed (%) is not the bytes'' (%); the approval binds the exact bytes', left(coalesce(p_digest, '<none>'), 16), left(v.bytes_digest, 16) USING ERRCODE = '22023';
  END IF;
  IF p.external IS NOT NULL THEN
    SELECT * INTO x FROM executive.external_drafts d WHERE d.publication_id = p_publication_id AND d.version = p_version;
    IF NOT FOUND OR x.gate_state <> 'approved' THEN
      RAISE EXCEPTION 'publication rejected (external_review): the external communication draft is % — an external publication is approved only after its review is approved', coalesce(x.gate_state, 'missing') USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature_id AND s.subject_kind = 'publication' AND s.subject_id = p_publication_id AND s.subject_version = p_version AND s.subject_digest = v.bytes_digest AND s.signer = p_actor AND s.bound_action = 'executive.publication.approve') THEN
    RAISE EXCEPTION 'publication rejected (signature): the approval carries the approver''s signature over the bytes'' digest, recorded in this write' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_publication_id AND o.object_type = 'PUB' AND o.object_version = p_object_version AND o.lifecycle_state = 'active' AND o.payload ->> 'version' = p_version::text AND o.payload #>> '{bytes,sha256}' = v.bytes_digest) THEN
    RAISE EXCEPTION 'publication rejected (object): the canonical PUB version % carrying these bytes'' digest is admitted in this write', p_object_version USING ERRCODE = '22023';
  END IF;
  -- B50 §0: the source the version binds (BRF edition / DPK version) is usable for a publication and not frozen by a correction case
  v_src_type := CASE v.source_kind WHEN 'briefing' THEN 'BRF' ELSE 'DPK' END;
  PERFORM objects.assert_usable(v_src_type, v.source_id, v.source_version, 'publication');
  SELECT f.frozen, f.case_id INTO v_frz FROM objects.publication_frozen(v_src_type, v.source_id, v.source_version) f;
  IF v_frz.frozen THEN
    RAISE EXCEPTION 'publication rejected (held): its source % % v% is frozen by correction case %; it is approved once the case closes or the freeze is lifted', v.source_kind, v.source_id, v.source_version, coalesce(v_frz.case_id::text, '<unnamed>') USING ERRCODE = '22023';
  END IF;
  -- end B50 §0
  UPDATE executive.publication_versions SET state = 'approved', approved_by = p_actor, approved_at = clock_timestamp(), approval_digest = p_digest, signature_id = p_signature_id, pub_object_version = p_object_version
   WHERE publication_id = p_publication_id AND version = p_version;
  IF p.current_version = p_version THEN UPDATE executive.publications SET state = 'approved', updated_at = clock_timestamp() WHERE publication_id = p_publication_id; END IF;
  v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, p_version, p_tenant, p_domain, 'publication.approved', p_actor,
            jsonb_build_object('digest', p_digest, 'signature_id', p_signature_id, 'pub_object_version', p_object_version, 'external_draft', CASE WHEN x.draft_id IS NULL THEN NULL ELSE jsonb_build_object('draft_id', x.draft_id, 'reviewed_by', x.reviewed_by) END), p_correlation);
  RETURN jsonb_build_object('publication_id', p_publication_id, 'version', p_version, 'state', 'approved', 'approved_by', p_actor, 'approval_digest', p_digest, 'signature_id', p_signature_id, 'pub_object_version', p_object_version, 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.approve_publication(uuid,uuid,uuid,int,text,uuid,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.approve_publication(uuid,uuid,uuid,int,text,uuid,bigint,uuid,uuid) TO eye_commit;

-- §0.2c executive.deliver_publication — 0094 §D line 6375, its LAST definition, copied whole; + the same two questions before any recipient is placed.
CREATE OR REPLACE FUNCTION executive.deliver_publication(p_publication_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p executive.publications%ROWTYPE; v executive.publication_versions%ROWTYPE; v_rcpt jsonb; r jsonb; v_id uuid; v_placed jsonb := '[]'::jsonb; v_ev uuid;
        /* B50 §0 */ v_src_type text; v_frz record; /* end B50 §0 */
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.deliver']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): delivered by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM executive.publications q WHERE q.publication_id = p_publication_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_publication): no publication % in this domain', p_publication_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM executive.publication_versions q WHERE q.publication_id = p_publication_id AND q.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_version): publication % has no version %', p_publication_id, p_version USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'executive_operator', 'decision_authority']) THEN
    RAISE EXCEPTION 'publication rejected (authority): a publication is delivered by a human holding executive, executive_operator or decision_authority in this domain' USING ERRCODE = '42501';
  END IF;
  IF p.state IN ('withdrawn', 'archived') THEN RAISE EXCEPTION 'publication rejected (state): publication % is %', p_publication_id, p.state USING ERRCODE = '22023'; END IF;
  IF v.state NOT IN ('approved', 'delivered') THEN RAISE EXCEPTION 'publication rejected (state): version % is %; only an approved version is delivered', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p.external IS NOT NULL AND NOT EXISTS (SELECT 1 FROM executive.external_drafts d WHERE d.publication_id = p_publication_id AND d.version = p_version AND d.gate_state = 'approved') THEN
    RAISE EXCEPTION 'publication rejected (external_review): an external communication is delivered only after its review is approved' USING ERRCODE = '22023';
  END IF;
  -- B50 §0: the source the version binds is usable for a publication and not frozen by a correction case (nothing is placed while it is)
  v_src_type := CASE v.source_kind WHEN 'briefing' THEN 'BRF' ELSE 'DPK' END;
  PERFORM objects.assert_usable(v_src_type, v.source_id, v.source_version, 'publication');
  SELECT f.frozen, f.case_id INTO v_frz FROM objects.publication_frozen(v_src_type, v.source_id, v.source_version) f;
  IF v_frz.frozen THEN
    RAISE EXCEPTION 'publication rejected (held): its source % % v% is frozen by correction case %; it is delivered once the case closes or the freeze is lifted', v.source_kind, v.source_id, v.source_version, coalesce(v_frz.case_id::text, '<unnamed>') USING ERRCODE = '22023';
  END IF;
  -- end B50 §0
  v_rcpt := executive.publication_recipients(p_tenant, p_domain, p.audience);
  IF jsonb_array_length(v_rcpt) = 0 AND p.external IS NULL THEN RAISE EXCEPTION 'publication rejected (audience): the audience resolves to nobody now' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(v_rcpt) LOOP
    IF EXISTS (SELECT 1 FROM executive.publication_deliveries d WHERE d.publication_id = p_publication_id AND d.version = p_version AND d.recipient_principal_id = (r ->> 'principal_id')::uuid AND d.channel = 'in_app' AND d.kind = 'publication' AND d.state = 'delivered') THEN CONTINUE; END IF;
    v_id := gen_random_uuid();
    INSERT INTO executive.publication_deliveries (delivery_id, scope, tenant_id, domain_id, publication_id, version, recipient_principal_id, channel, kind, state, receipt_id, receipt, provider_ref, synthetic_state, delivered_by, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_publication_id, p_version, (r ->> 'principal_id')::uuid, 'in_app', 'publication', 'delivered', gen_random_uuid(),
            jsonb_build_object('channel', 'in_app', 'proof', 'the publication stands in the recipient''s in-app list (executive.publication_deliveries, readable under the recipient''s own RLS)', 'via', r ->> 'via', 'bytes_digest', v.bytes_digest),
            'in_app:' || p_publication_id::text || '@' || p_version, false, p_actor, p_correlation);
    v_placed := v_placed || jsonb_build_object('delivery_id', v_id, 'recipient', r ->> 'principal_id', 'display_name', r ->> 'display_name', 'via', r ->> 'via');
  END LOOP;
  UPDATE executive.publication_versions SET state = 'delivered' WHERE publication_id = p_publication_id AND version = p_version AND state = 'approved';
  IF p.current_version = p_version THEN UPDATE executive.publications SET state = 'delivered', updated_at = clock_timestamp() WHERE publication_id = p_publication_id; END IF;
  v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, p_version, p_tenant, p_domain, 'publication.delivered', p_actor,
            jsonb_build_object('recipients', jsonb_array_length(v_rcpt), 'in_app_placed', jsonb_array_length(v_placed), 'channels', to_jsonb(p.channels), 'external', p.external), p_correlation);
  RETURN jsonb_build_object('publication_id', p_publication_id, 'version', p_version, 'state', 'delivered', 'recipients', v_rcpt, 'in_app', v_placed, 'channels', to_jsonb(p.channels),
                            'external', p.external, 'external_recipient', CASE WHEN p.external IS NULL THEN NULL ELSE 'external:' || (p.external ->> 'kind') || ':' || btrim(p.external ->> 'name') END,
                            'title', p.title, 'bytes_digest', v.bytes_digest, 'format', v.format, 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.deliver_publication(uuid,uuid,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.deliver_publication(uuid,uuid,uuid,int,uuid,uuid) TO eye_commit;

-- §0.2d retention.record_export_package — 0073 (B13) line 395, its LAST definition (the export build's record: `export.built`), copied whole;
-- + the use and freeze of the EVD of every executed manifest, before the package is recorded. The scope's items are MANIFESTS (retention.scope_items);
-- the canonical object each carries is its EVD (the custody loop's own lookup). links.json's relationship closure (0075, B15) is built in
-- TypeScript from those EVDs and is not a scope item, so the hook takes the EVDs as the roots (§PV/§CL may walk from them).
CREATE OR REPLACE FUNCTION retention.record_export_package(
  p_action_id uuid, p_tenant uuid, p_domain uuid, p_approval_id uuid, p_manifest_digest text, p_package_digest text, p_signature jsonb,
  p_object_count int, p_excluded_count int, p_byte_total bigint, p_archive_digest text, p_signing_key_id text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; i RECORD; m RECORD; v_evd uuid; v_obs uuid; v_prefix text; v_execute int; v_at timestamptz; v_expires timestamptz; v_scheme text; v_active text;
        /* B50 §0 */ v_use RECORD; v_frz RECORD; /* end B50 §0 */
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'export rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'executing' OR a.kind <> 'customer_export' THEN RAISE EXCEPTION 'export rejected: % is not an executing customer export', p_action_id USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM retention.approvals ap WHERE ap.approval_id = p_approval_id AND ap.action_id = p_action_id AND ap.scope_digest = a.scope_digest AND ap.revoked_at IS NULL AND ap.expires_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'export rejected: approval % is not a live approval on the resolved scope of %', p_approval_id, p_action_id USING ERRCODE = '42501';
  END IF;
  IF p_manifest_digest !~ '^[0-9a-f]{64}$' OR p_package_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'export rejected: the manifest and package digests are sha-256 hex' USING ERRCODE = '22023'; END IF;
  IF p_archive_digest IS NULL OR p_archive_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'export rejected: the archive digest is sha-256 hex' USING ERRCODE = '22023'; END IF;
  -- B13 (D3; C5): the scheme. The tenant's active key decides which scheme a package built now may carry.
  v_scheme := p_signature ->> 'scheme';
  v_active := retention.active_export_signing_key(p_tenant);
  IF p_signature IS NULL OR jsonb_typeof(p_signature) <> 'object' OR v_scheme IS NULL OR v_scheme NOT IN ('eye-digest-chain/1', 'eye-customer-export/2') THEN
    RAISE EXCEPTION 'export rejected: the signature scheme is eye-digest-chain/1 or eye-customer-export/2' USING ERRCODE = '22023';
  END IF;
  IF v_scheme = 'eye-digest-chain/1' THEN
    IF v_active IS NOT NULL THEN RAISE EXCEPTION 'export rejected: the tenant has an active signing key; the package carries scheme eye-customer-export/2' USING ERRCODE = '22023'; END IF;
    IF p_signing_key_id IS NOT NULL THEN RAISE EXCEPTION 'export rejected: a digest-chain package names no signing key' USING ERRCODE = '22023'; END IF;
  ELSE
    IF p_signing_key_id IS NULL OR p_signature ->> 'key_id' IS DISTINCT FROM p_signing_key_id OR p_signing_key_id IS DISTINCT FROM v_active THEN
      RAISE EXCEPTION 'export rejected: a key-based signature names the tenant''s active signing key (% is not %)', coalesce(p_signature ->> 'key_id', '<none>'), coalesce(v_active, '<none>') USING ERRCODE = '22023';
    END IF;
    IF p_signature ->> 'algorithm' IS DISTINCT FROM 'Ed25519' THEN RAISE EXCEPTION 'export rejected: a key-based signature''s algorithm is Ed25519' USING ERRCODE = '22023'; END IF;
    IF (p_signature ->> 'signature') IS NULL OR (p_signature ->> 'signature') !~ '^[A-Za-z0-9+/]{86}==$' THEN RAISE EXCEPTION 'export rejected: a key-based signature is the base64 of 64 bytes' USING ERRCODE = '22023'; END IF;
    IF length(decode(p_signature ->> 'signature', 'base64')) <> 64 THEN RAISE EXCEPTION 'export rejected: a key-based signature is the base64 of 64 bytes' USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_signature ->> 'package_digest' IS DISTINCT FROM p_package_digest
     OR p_signature #>> '{bound_to,scope_digest}' IS DISTINCT FROM a.scope_digest
     OR p_signature #>> '{bound_to,approval_id}' IS DISTINCT FROM p_approval_id::text
     OR p_signature #>> '{bound_to,action_id}' IS DISTINCT FROM p_action_id::text THEN
    RAISE EXCEPTION 'export rejected: the signature block binds the package digest to this action, its resolved scope and the live approval' USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::int INTO v_execute FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute';
  IF p_object_count IS DISTINCT FROM v_execute THEN
    RAISE EXCEPTION 'export rejected: the package lists % object(s); the approved scope executes %', p_object_count, v_execute USING ERRCODE = '22023';
  END IF;
  -- A tombstoned manifest never enters a recorded package, and a package is never recorded for a source whose rights are no longer confirmed:
  -- begin_execution checked both before the build; the record checks them again at its own instant (the build reads up to 200 blobs).
  IF EXISTS (SELECT 1 FROM retention.scope_items si JOIN observation.blob_tombstones t ON t.manifest_id = si.ref::uuid
              WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute') THEN
    RAISE EXCEPTION 'retention execution rejected (scope_changed): a manifest in the approved scope was tombstoned during the build — %; the scope is resolved again',
      (SELECT string_agg(si.ref, ', ') FROM retention.scope_items si JOIN observation.blob_tombstones t ON t.manifest_id = si.ref::uuid WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
              JOIN observation.source_contracts_current s ON s.source_id = bm.source_id AND s.contract_version = bm.contract_version
              WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' AND s.rights_state <> 'confirmed') THEN
    RAISE EXCEPTION 'retention execution rejected (rights_changed): the rights of a source in the approved scope are no longer confirmed at the record of the package; the scope is resolved again' USING ERRCODE = '22023';
  END IF;
  -- B50 §0: the evidence object of every manifest the approved scope executes (its latest version — the one the custody loop below names) is
  -- usable for an export and not frozen by a correction case; refused before anything is recorded. A manifest with no EVD has nothing canonical to check.
  FOR v_use IN SELECT e.object_id, e.object_version FROM retention.scope_items si
                 CROSS JOIN LATERAL (SELECT o.object_id, o.object_version FROM objects.canonical_objects o
                                      WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = si.ref::uuid
                                      ORDER BY o.object_version DESC LIMIT 1) e
                WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order, si.ref LOOP
    PERFORM objects.assert_usable('EVD', v_use.object_id, v_use.object_version::int, 'export');
    SELECT f.frozen, f.case_id INTO v_frz FROM objects.publication_frozen('EVD', v_use.object_id, v_use.object_version::int) f;
    IF v_frz.frozen THEN
      RAISE EXCEPTION 'export rejected (held): evidence % v% in the approved scope is frozen by correction case %; the package is built once the case closes or the freeze is lifted', v_use.object_id, v_use.object_version, coalesce(v_frz.case_id::text, '<unnamed>') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- end B50 §0
  v_prefix := p_tenant::text || '/' || p_domain::text || '/' || p_action_id::text || '/';
  -- B13 (D4; C5): built_at and expires_at from ONE instant; the interval from the ACTION's selector (validated at the open, or at the schedule's declaration).
  v_at := clock_timestamp();
  v_expires := v_at + coalesce(NULLIF(a.selector ->> 'expires_after', '')::interval, interval '30 days');
  INSERT INTO retention.export_packages (action_id, scope, tenant_id, domain_id, destination, locator_prefix, scope_digest, approval_id, classification_ceiling, object_count, excluded_count, byte_total, manifest_digest, package_digest, signature, built_by, built_at, correlation_id, archive_digest, expires_at, signing_key_id)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, 'export', v_prefix, a.scope_digest, p_approval_id, a.selector ->> 'classification_ceiling', p_object_count, coalesce(p_excluded_count, 0), p_byte_total, p_manifest_digest, p_package_digest, p_signature, p_actor, v_at, p_correlation, p_archive_digest, v_expires, p_signing_key_id);
  FOR i IN SELECT si.ref FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order LOOP
    SELECT bm.manifest_id, bm.source_id, bm.contract_version, bm.run_id, bm.content_digest, bm.locator INTO m FROM observation.blob_manifests bm WHERE bm.manifest_id = i.ref::uuid;
    SELECT o.object_id, (o.payload ->> 'obs_object_id')::uuid INTO v_evd, v_obs FROM objects.canonical_objects o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.manifest_id ORDER BY o.object_version DESC LIMIT 1;
    INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, m.manifest_id, v_obs, v_evd, m.source_id, m.contract_version, m.run_id, 'custody.exported', 'principal:' || p_actor::text, m.content_digest, true,
            jsonb_build_object('action_id', p_action_id, 'package_digest', p_package_digest, 'destination', 'export', 'locator_prefix', v_prefix, 'file', m.manifest_id::text || '.bin'), p_correlation);
  END LOOP;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'export.built', p_actor, jsonb_build_object('approval_id', p_approval_id, 'manifest_digest', p_manifest_digest, 'package_digest', p_package_digest, 'objects', p_object_count, 'excluded', coalesce(p_excluded_count, 0), 'bytes', p_byte_total, 'locator_prefix', v_prefix,
                                                                                              'archive_digest', p_archive_digest, 'signing_key_id', p_signing_key_id, 'scheme', v_scheme, 'expires_at', v_expires), p_correlation);
  RETURN jsonb_build_object('action_id', p_action_id, 'locator_prefix', v_prefix, 'package_digest', p_package_digest, 'manifest_digest', p_manifest_digest, 'objects', p_object_count, 'excluded', coalesce(p_excluded_count, 0), 'bytes', p_byte_total,
                            'archive_digest', p_archive_digest, 'signing_key_id', p_signing_key_id, 'expires_at', v_expires);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_export_package(uuid,uuid,uuid,uuid,text,text,jsonb,int,int,bigint,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_export_package(uuid,uuid,uuid,uuid,text,text,jsonb,int,int,bigint,text,text,uuid,uuid) TO eye_commit;

-- §0.2e decision.gate_act — 0119 §HA line 2841, its LAST definition (B81's two trailing parameters kept), copied whole; + the use of every
-- citation of the version's options on the 'ready' act (decision-ready makes them decision-active; the other six acts — review, acknowledge,
-- defer, reject, request_information, resume — record a reading or a refusal and are never refused for what the package cites).
CREATE OR REPLACE FUNCTION decision.gate_act(
  p_action_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_action text, p_rationale text, p_next_review_at timestamptz,
  p_info_request text, p_package_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid,
  /* B81 ha: the defer's conditions and owner (PAT-08) */ p_conditions jsonb DEFAULT NULL, p_owner uuid DEFAULT NULL /* end B81 ha */
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_to text; v_standing text; v_ip jsonb; v_task jsonb; v_task_id uuid; v_live int; v_quorum int; v_event text; v_open text[] := ARRAY['proposed', 'under_review', 'approved'];
        /* B81 ha */ v_conditions jsonb; v_owner uuid; v_c jsonb; /* end B81 ha */
        /* B50 §0 */ v_cite jsonb; /* end B50 §0 */
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('review', 'acknowledge', 'ready', 'defer', 'reject', 'request_information', 'resume') THEN
    RAISE EXCEPTION 'gate rejected (action): % is not a gate act (review, acknowledge, ready, defer, reject, request_information, resume)', coalesce(p_action, '<none>') USING ERRCODE = '22023';
  END IF;
  PERFORM observation.assert_authority(ARRAY['decision.gate.' || p_action, /* B36 (0094) gates */ 'decision.board.' || p_action /* end B36 gates */]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'gate rejected: a gate act is the acting principal''s own, never on behalf of another' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'gate rejected: only a named, active member acts at the gate' USING ERRCODE = '42501'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 OR length(p_rationale) > 4000 THEN
    RAISE EXCEPTION 'gate rejected (rationale): a gate act states its rationale (8 to 4000 characters)' USING ERRCODE = '22023';
  END IF;
  -- B81 ha: the conditions and the owner belong to a defer only (a request for information keeps its asked-for text; a reject its rationale)
  IF p_action <> 'defer' AND (p_conditions IS NOT NULL OR p_owner IS NOT NULL) THEN
    RAISE EXCEPTION 'gate rejected (conditions): conditions and an owner are recorded on a defer only, not on a %', replace(p_action, '_', ' ') USING ERRCODE = '22023';
  END IF;
  IF p_action = 'defer' THEN
    v_conditions := coalesce(p_conditions, '[]'::jsonb);
    IF jsonb_typeof(v_conditions) <> 'array' OR jsonb_array_length(v_conditions) > 12 THEN
      RAISE EXCEPTION 'gate rejected (conditions): a defer lists at most 12 conditions' USING ERRCODE = '22023';
    END IF;
    FOR v_c IN SELECT x FROM jsonb_array_elements(v_conditions) AS t(x) LOOP
      IF jsonb_typeof(v_c) <> 'string' OR length(btrim(v_c #>> '{}')) < 4 OR length(v_c #>> '{}') > 500 THEN
        RAISE EXCEPTION 'gate rejected (conditions): each condition of a defer is a statement of 4 to 500 characters' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(x #>> '{}')) ORDER BY o), '[]'::jsonb) INTO v_conditions FROM jsonb_array_elements(v_conditions) WITH ORDINALITY AS t(x, o);
    IF (SELECT count(DISTINCT lower(x #>> '{}')) FROM jsonb_array_elements(v_conditions) AS t(x)) <> jsonb_array_length(v_conditions) THEN
      RAISE EXCEPTION 'gate rejected (conditions): a defer states each condition once' USING ERRCODE = '22023';
    END IF;
    v_owner := coalesce(p_owner, p_actor);
  END IF;
  -- end B81 ha
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate rejected: no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF p.state IN ('withdrawn', 'closed') OR v.state NOT IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested') THEN
    RAISE EXCEPTION 'gate rejected (state): version % is % (the package is %); the gate acts on a proposed version not yet committed, rejected or superseded', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  v_to := v.state;
  IF p_action IN ('review', 'acknowledge') THEN
    v_event := CASE p_action WHEN 'review' THEN 'gate.reviewed' ELSE 'gate.acknowledged' END;
  ELSIF p_action = 'ready' THEN
    IF NOT (v.state = ANY (v_open)) THEN RAISE EXCEPTION 'gate rejected (state): version % is %; decision-ready is marked on a proposed, reviewed or approved version', p_version, v.state USING ERRCODE = '22023'; END IF;
    IF p_actor IN (v.author_principal_id, p.owner_principal_id) OR p_actor = v.proposed_by OR p_actor::text = (v.choice ->> 'action_owner')
       OR EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = p_actor AND a.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'gate rejected (independence): the reviewer who marks a version decision-ready is independent — not its author, proposer, owner, action owner nor an approver of it' USING ERRCODE = '42501';
    END IF;
    v_ip := decision.information_package(p_tenant, p_domain, p_package_id, p_version);
    IF p_package_digest IS NULL OR p_package_digest IS DISTINCT FROM (v_ip ->> 'digest') THEN
      RAISE EXCEPTION 'gate rejected (stale_package): the information package read (%) is not the package now (%); read it again', coalesce(p_package_digest, '<none>'), v_ip ->> 'digest' USING ERRCODE = '22023';
    END IF;
    -- B50 §0: what the version's options cite is usable for a gate act — decision-ready is the act that makes them decision-active (the kind→type map is derive_option's)
    FOR v_cite IN SELECT x FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) WITH ORDINALITY AS t(x, n)
                   WHERE o.package_id = p_package_id AND o.version = p_version ORDER BY o.key, t.n LOOP
      PERFORM objects.assert_usable(CASE v_cite ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' WHEN 'warning' THEN 'WRN' END,
                                    (v_cite ->> 'id')::uuid, (v_cite ->> 'version')::int, 'gate');
    END LOOP;
    -- end B50 §0
    v_event := 'version.ready';
  ELSE
    v_standing := decision.gate_standing(p_actor, p_tenant, p_domain, p_package_id, p_version);
    IF v_standing IS NULL THEN
      RAISE EXCEPTION 'gate rejected (authority): principal % is neither the package owner, an approver the policy admits, nor a decision authority', p_actor USING ERRCODE = '42501';
    END IF;
    IF p_action IN ('defer', 'request_information') THEN
      IF NOT (v.state = ANY (v_open)) THEN RAISE EXCEPTION 'gate rejected (state): version % is already %; resume it first', p_version, v.state USING ERRCODE = '22023'; END IF;
      IF p_next_review_at IS NULL OR p_next_review_at <= clock_timestamp() OR p_next_review_at > clock_timestamp() + interval '180 days' THEN
        RAISE EXCEPTION 'gate rejected (next_review): a % names its next review, in the future and within 180 days', replace(p_action, '_', ' ') USING ERRCODE = '22023';
      END IF;
      IF p_action = 'request_information' AND (p_info_request IS NULL OR length(btrim(p_info_request)) < 8) THEN
        RAISE EXCEPTION 'gate rejected (info_request): a request for information says what is asked (8+ characters)' USING ERRCODE = '22023';
      END IF;
      -- B81 ha: the defer's owner holds standing at this gate (the person who must resume it can) — re-checked here, never trusted from the caller
      IF p_action = 'defer' AND v_owner IS DISTINCT FROM p_actor AND decision.gate_standing(v_owner, p_tenant, p_domain, p_package_id, p_version) IS NULL THEN
        RAISE EXCEPTION 'gate rejected (owner): the owner of the next review (%) is a named, active member with standing at this gate — the package owner, an approver the policy admits, or a decision authority', v_owner USING ERRCODE = '22023';
      END IF;
      -- end B81 ha
      v_to := CASE p_action WHEN 'defer' THEN 'deferred' ELSE 'information_requested' END;
      v_event := CASE p_action WHEN 'defer' THEN 'version.deferred' ELSE 'version.information_requested' END;
      v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'gate.review', 'gate.review:' || p_action_id::text, decision.gate_subject(p_package_id, p_version),
        format('%s: review %s version %s by %s', CASE p_action WHEN 'defer' THEN 'Deferred' ELSE 'Information requested' END, p.title, p_version, to_char(p_next_review_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')),
        CASE p_action WHEN 'defer' THEN /* B81 ha: the defer's owner (the deferring person unless another is named) */ v_owner /* end B81 ha */ ELSE p.owner_principal_id END, '{}', jsonb_build_object('gate_action_id', p_action_id), p_next_review_at,
        jsonb_build_object('principal', p.owner_principal_id, 'max_escalations', 1, 'extend_minutes', 1440), NULL, p_action, p_actor, p_correlation);
      v_task_id := (v_task ->> 'task_id')::uuid;
    ELSIF p_action = 'reject' THEN
      v_to := 'rejected'; v_event := 'version.rejected_by_owner';
    ELSE -- resume
      IF v.state NOT IN ('deferred', 'information_requested') THEN RAISE EXCEPTION 'gate rejected (state): version % is %; only a deferred or information-requested version resumes', p_version, v.state USING ERRCODE = '22023'; END IF;
      v_quorum := (v.approver_policy ->> 'quorum')::int;
      SELECT count(*) INTO v_live FROM decision.live_approvals(p_package_id, p_version);
      v_to := CASE WHEN v_live >= v_quorum THEN 'approved' WHEN v_live > 0 THEN 'under_review' ELSE 'proposed' END;
      v_event := 'version.resumed';
      PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.review'], 'resumed', p_action_id, p_actor, p_correlation);
    END IF;
  END IF;
  INSERT INTO decision.gate_actions (action_id, scope, tenant_id, domain_id, package_id, version, action, actor_principal_id, rationale, next_review_at, info_request, information_package_digest, from_state, to_state, task_id, correlation_id,
                                     /* B81 ha */ defer_conditions, defer_owner_principal_id /* end B81 ha */)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_action, p_actor, btrim(p_rationale),
          CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
          CASE WHEN p_action = 'ready' THEN p_package_digest END, v.state, v_to, v_task_id, p_correlation,
          /* B81 ha */ v_conditions, v_owner /* end B81 ha */);
  IF v_to <> v.state THEN
    UPDATE decision.package_versions SET state = v_to WHERE package_id = p_package_id AND version = p_version;
    IF p.current_version = p_version THEN UPDATE decision.packages_current SET state = v_to WHERE package_id = p_package_id; END IF;
  END IF;
  IF p_action = 'reject' THEN
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve', 'gate.review', 'gate.ready_review', 'gate.delegated_approval'],
                                          'the version was rejected at the gate', p_actor, p_correlation);
  ELSIF p_action = 'ready' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.ready_review'], 'ready', p_action_id, p_actor, p_correlation);
  END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, v_event, p_actor,
          jsonb_strip_nulls(jsonb_build_object('version', p_version, 'action_id', p_action_id, 'action', p_action, 'rationale', btrim(p_rationale), 'from_state', v.state, 'to_state', v_to,
                             'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'info_request', CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
                             'information_package_digest', CASE WHEN p_action = 'ready' THEN p_package_digest END, 'standing', v_standing, 'task_id', v_task_id,
                             /* B81 ha */ 'conditions', v_conditions, 'owner', v_owner /* end B81 ha */)), p_correlation);
  RETURN jsonb_strip_nulls(jsonb_build_object('action_id', p_action_id, 'package_id', p_package_id, 'version', p_version, 'action', p_action, 'from_state', v.state, 'to_state', v_to,
                            'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'task_id', v_task_id, 'standing', v_standing, 'event', v_event,
                            /* B81 ha */ 'conditions', v_conditions, 'owner', v_owner /* end B81 ha */));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid, jsonb, uuid) TO eye_commit;
