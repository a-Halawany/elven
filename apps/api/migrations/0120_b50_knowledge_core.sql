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

-- ═════════════════════════════════════════════════
-- THE FOLD (B50 integration, 2026-10-19): the parts follow §0 in the order §HD, §LC, §CI, §PV, §CL, §TL. Each part applied on its own over
-- 0001–0119 + §0 (wave 2 over wave 1) in its own harness; §LC's copy of objects.assert_header_semantics carries §HD's precision vocabulary
-- (it applies after); §PV's integration section re-declares §CI's graph._open_challenge and §PV's own escalation (D21); §TL's attention
-- vocabulary is widened by union over §CL's. The text of each part is unchanged below its fold line apart from the marked integration edits.
-- ═════════════════════════════════════════════════

-- ═══ FOLD §HD (from 0120_b50_x_hd.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §HD — CP-6 B50: CANONICAL HEADER COMPLETENESS, IDENTITY AND TEMPORAL SEMANTICS (F-P3-01). Applies ALONE on 0001–0119 + 0120 §0.
-- 0001–0119 and 0120 §0 are untouched.
--
-- NO HEADER FIELD IS ADDED AND NOTHING IS BACK-FILLED (DESIGN D2 / D3): the 43-field canonical header, its registry
-- (objects.canonical_field_registry) and the digest of every recorded version stay as they are. What a NEW version carries changes — the
-- shared header builder (apps/api/src/objects/header-builder.ts) states what a writer used to null — and what the header cannot hold
-- without widening is written beside it, in the admission's OWN transaction, by objects.admit_version (re-declared whole, §HD.4):
--   objects.version_operations   per version: the operation, its idempotency key and trace id, and the header's BASIS (where each control
--                                profile came from — source contract, evidence, parent, domain — and, for a null, the domain profile that
--                                governs it; the domain's active ontology version; the fields stated as declared absences)
--   objects.time_qualifiers      per version and axis: the time's kind (exact / bounded / approximate / unknown / recurring / conflicting),
--                                bounds, precision, stated zone, source, rule, conflicts and clock quality — DECLARED by the writer (the
--                                upload intake's document time) or DERIVED from the header's own instant and precision
-- The header's time_precision gets a governed vocabulary (§HD.1). Each type has a HEADER PROFILE (§HD.2): its issuing authority, its quality
-- profile, its trust envelope and the fields mandatory before each decision-active use, which objects._header_usable (§0's hook stub, filled
-- here — §HD.5) checks before a package option, a publication, an export or a gate act uses the object (ES-24-003). Reads (§HD.6): the
-- identity declaration of an object (ES-25-002) and the ten layers' contracts (V00-T-030). A version recorded before 0120 has no side-
-- ledger row and reads "recorded before B50 — not populated".
--
-- THREE CLAIMS: construction (this section, the builder and their harnesses); demonstrated operation (the act — SYNTHETIC personas);
-- real acceptance — never claimed. The comprehensive schema-conformance verification is H1's (F-P3-01's verify stage).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §HD.1 THE GOVERNED time_precision VOCABULARY (ES-26-001) ─────────────────────────────────────────────────────────────────────────────────
-- The list is the same in three places, asserted equal by phase6-header-b50: this table (with each word's meaning and granularity), the
-- canonical CHECK, objects.assert_header_semantics (IMMUTABLE — it cannot read a table) and HEADER_TIME_PRECISIONS (packages/contracts).
-- B50 adds part_of_month and quarter; every word in use (exact, day) and every word the Phase 0 schema admitted (approximate) stays.
CREATE TABLE objects.time_precisions (
  code        text PRIMARY KEY CHECK (code ~ '^[a-z_]{3,20}$'),
  ordinal     int NOT NULL UNIQUE,
  granularity interval,
  meaning     text NOT NULL CHECK (length(btrim(meaning)) >= 8)
);
INSERT INTO objects.time_precisions (code, ordinal, granularity, meaning) VALUES
  ('exact',          0, NULL,              'an instant as the stating clock recorded it'),
  ('second',         1, interval '1 second', 'the instant is known to the second'),
  ('minute',         2, interval '1 minute', 'the instant is known to the minute'),
  ('hour',           3, interval '1 hour',   'the instant is known to the hour'),
  ('day',            4, interval '1 day',    'the day is known, not the time of day'),
  ('part_of_month',  5, NULL,              'a named part of a month (early / mid / late); the time value states its bounds'),
  ('month',          6, interval '1 month',  'the month is known, not the day'),
  ('quarter',        7, interval '3 months', 'the quarter is known, not the month'),
  ('year',           8, interval '1 year',   'the year is known, not the month'),
  ('approximate',    9, NULL,              'an approximate instant; the time value states its centre (and tolerance, when known)'),
  ('unknown',       10, NULL,              'no time is known; the header axis carries none and the time value says why');
ALTER TABLE objects.time_precisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects.time_precisions FORCE ROW LEVEL SECURITY;
CREATE POLICY time_precisions_shared ON objects.time_precisions FOR SELECT TO eye_app, eye_commit USING (true);
REVOKE ALL ON objects.time_precisions FROM PUBLIC;
GRANT SELECT ON objects.time_precisions TO eye_app, eye_commit;

-- the canonical CHECK: every recorded value (exact, day on eye_demo) is in the vocabulary, so it validates
ALTER TABLE objects.canonical_objects ADD CONSTRAINT canonical_time_precision CHECK (time_precision IN
  ('exact', 'second', 'minute', 'hour', 'day', 'part_of_month', 'month', 'quarter', 'year', 'approximate', 'unknown'));

-- objects.assert_header_semantics — 0012 line 658, its LAST definition, copied whole; the time_precision list widened (B50 hd).
CREATE OR REPLACE FUNCTION objects.assert_header_semantics(p_header jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := p_header->>'scope';
  v_recorded timestamptz;
  v_vf timestamptz := NULLIF(p_header->>'valid_from','')::timestamptz;
  v_vt timestamptz := NULLIF(p_header->>'valid_to','')::timestamptz;
BEGIN
  IF v_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'header semantics: scope % is not a canonical scope', v_scope USING ERRCODE = '22023';
  END IF;
  IF (v_scope = 'PLATFORM' AND (p_header->>'tenant_id' IS NOT NULL OR p_header->>'domain_id' IS NOT NULL))
     OR (v_scope = 'TENANT' AND (p_header->>'tenant_id' IS NULL OR p_header->>'domain_id' IS NOT NULL))
     OR (v_scope = 'DOMAIN' AND (p_header->>'tenant_id' IS NULL OR p_header->>'domain_id' IS NULL)) THEN
    RAISE EXCEPTION 'header semantics: scope/identifier combination is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'object_type' !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'header semantics: object_type must be three uppercase letters' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'object_version' !~ '^[1-9][0-9]{0,17}$' THEN
    RAISE EXCEPTION 'header semantics: object_version must be a positive integer string' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'lifecycle_state' NOT IN
     ('proposed','admitted','active','disputed','corrected','withdrawn','superseded','archived','deleted') THEN
    RAISE EXCEPTION 'header semantics: lifecycle_state % is not permitted', p_header->>'lifecycle_state'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'truth_state' NOT IN
     ('observed','asserted','extracted','inferred','assessed','synthetic','decided','disputed','withdrawn') THEN
    RAISE EXCEPTION 'header semantics: truth_state % is not canonical', p_header->>'truth_state'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'time_precision' NOT IN
     ('exact','second','minute','hour','day','part_of_month','month','quarter','year','approximate','unknown') THEN  -- B50 hd: the governed vocabulary (objects.time_precisions)
    RAISE EXCEPTION 'header semantics: time_precision % is not permitted', p_header->>'time_precision'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'source_clock_quality' NOT IN ('trusted','degraded','unknown') THEN
    RAISE EXCEPTION 'header semantics: source_clock_quality % is not permitted',
      p_header->>'source_clock_quality' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_header->'synthetic_state') <> 'boolean' THEN
    RAISE EXCEPTION 'header semantics: synthetic_state must be boolean' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'truth_state' = 'synthetic' AND (p_header->>'synthetic_state')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'header semantics: synthetic truth state requires synthetic_state' USING ERRCODE = '22023';
  END IF;
  -- Structured values must be objects (or null), never scalars smuggled in.
  IF jsonb_typeof(p_header->'confidence') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'uncertainty') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'quality_state') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'freshness_state') NOT IN ('object','null') THEN
    RAISE EXCEPTION 'header semantics: confidence/uncertainty/quality_state/freshness_state must be objects or null'
      USING ERRCODE = '22023';
  END IF;
  -- Reference arrays must be arrays of strings.
  IF jsonb_typeof(p_header->'evidence_refs') <> 'array'
     OR jsonb_typeof(p_header->'source_object_ids') <> 'array'
     OR jsonb_typeof(p_header->'contradiction_refs') <> 'array'
     OR jsonb_typeof(p_header->'corroboration_refs') <> 'array'
     OR jsonb_typeof(p_header->'human_refs') <> 'array' THEN
    RAISE EXCEPTION 'header semantics: reference fields must be arrays' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'schema_ref' !~ '^[A-Z]{3}@v[0-9]+$' THEN
    RAISE EXCEPTION 'header semantics: schema_ref % must be <TYPE>@v<N>', p_header->>'schema_ref'
      USING ERRCODE = '22023';
  END IF;
  IF left(p_header->>'schema_ref', 3) <> p_header->>'object_type' THEN
    RAISE EXCEPTION 'header semantics: schema_ref does not match object_type' USING ERRCODE = '22023';
  END IF;
  -- Temporal constraints.
  IF v_vt IS NOT NULL AND v_vf IS NULL THEN
    RAISE EXCEPTION 'header semantics: valid_to requires valid_from' USING ERRCODE = '22023';
  END IF;
  IF v_vt IS NOT NULL AND v_vf IS NOT NULL AND v_vt <= v_vf THEN
    RAISE EXCEPTION 'header semantics: valid_to must be after valid_from' USING ERRCODE = '22023';
  END IF;
  -- Authoritative recorded_at: present, parseable, and not from the future.
  BEGIN
    v_recorded := (p_header->>'recorded_at')::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'header semantics: recorded_at is not a valid instant' USING ERRCODE = '22023';
  END;
  IF v_recorded IS NULL THEN
    RAISE EXCEPTION 'header semantics: recorded_at is required' USING ERRCODE = '22023';
  END IF;
  IF v_recorded > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'header semantics: recorded_at is in the future' USING ERRCODE = '22023';
  END IF;
  IF (p_header->>'audit_correlation_id') IS NULL THEN
    RAISE EXCEPTION 'header semantics: audit_correlation_id is required' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_header->>'classification','') = '' OR coalesce(p_header->>'purpose_scope','') = ''
     OR coalesce(p_header->>'owning_component','') = '' OR coalesce(p_header->>'accountable_owner','') = '' THEN
    RAISE EXCEPTION 'header semantics: classification, purpose_scope, owning_component and accountable_owner are required'
      USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION objects.assert_header_semantics(jsonb) FROM PUBLIC;

-- §HD.2 THE HEADER PROFILES (ES-24-003, ES-25-002, V00-T-076, ADR-0003 V4) ────────────────────────────────────────────────────────────────────
-- One active profile per registered object type: who ISSUES its identities (the owning component and the port family), its quality profile
-- (the header's quality_profile on every new version), its trust envelope, the header fields MANDATORY before each decision-active use, the
-- jsonb fields that must carry a value (a declared absence does not satisfy them) and the type's own absence reasons. The rows mirror
-- HEADER_PROFILES in header-builder.ts (the harness asserts they agree). Versioned, append-only: a changed profile is a new version; the
-- latest active one governs. Platform reference data: readable by every bound principal; no write grant.
CREATE TABLE objects.header_profiles (
  object_type       text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  profile_version   int NOT NULL CHECK (profile_version >= 1),
  issuing_authority text NOT NULL CHECK (issuing_authority ~ '^CP-[A-Z]{3}-[A-Z0-9]{2,3}$'),
  issued_through    text NOT NULL CHECK (length(btrim(issued_through)) >= 3),
  quality_profile   text NOT NULL CHECK (quality_profile ~ '^quality:[A-Z]{3}@[0-9]+$'),
  mandatory         jsonb NOT NULL CHECK (jsonb_typeof(mandatory) = 'object' AND mandatory ?& ARRAY['decision_option', 'publication', 'export', 'gate']),
  value_required    text[] NOT NULL DEFAULT '{}',
  absence           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(absence) = 'object'),
  envelope          text[] NOT NULL DEFAULT ARRAY['object_id', 'tenant_id', 'accountable_owner', 'source_object_ids', 'recorded_at', 'truth_state', 'confidence',
                                                  'uncertainty', 'classification', 'rights_profile', 'valid_to', 'retention_profile', 'quality_state'],
  state             text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  declared_by       text NOT NULL DEFAULT 'migration:0120',
  declared_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (object_type, profile_version)
);
COMMENT ON TABLE objects.header_profiles IS 'B50 §HD (0120): per canonical type — issuing authority, quality profile, trust envelope, the header fields mandatory per decision-active use (objects._header_usable), the fields that must carry a value, the type''s absence reasons. Mirrors header-builder.ts HEADER_PROFILES.';
CREATE TRIGGER header_profiles_append_only BEFORE UPDATE OR DELETE ON objects.header_profiles FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
INSERT INTO objects.header_profiles (object_type, profile_version, issuing_authority, issued_through, quality_profile, mandatory, value_required, absence) VALUES
    ('APR', 1, 'CP-DEC-01', 'decision.approval', 'quality:APR@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('ASM', 1, 'CP-INT-01', 'intelligence.extraction', 'quality:ASM@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('ASU', 1, 'CP-GRA-01', 'graph.strategy', 'quality:ASU@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('BRF', 1, 'CP-EXE-01', 'executive.briefing.compose', 'quality:BRF@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('CAP', 1, 'CP-GRA-01', 'graph.strategy', 'quality:CAP@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('CLM', 1, 'CP-INT-01', 'intelligence.extraction / intelligence.review', 'quality:CLM@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","method_ref"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","method_ref"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","method_ref"]}'::jsonb, ARRAY['confidence']::text[], '{}'::jsonb),
    ('CMT', 1, 'CP-DEC-01', 'decision.commitment', 'quality:CMT@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('CPF', 1, 'CP-DOM-CI', 'domain.competitor', 'quality:CPF@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('DAS', 1, 'CP-DOM-PKG', 'domain.assessment', 'quality:DAS@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('DEC', 1, 'CP-GRA-01', 'graph.strategy', 'quality:DEC@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('DPG', 1, 'CP-DOM-PKG', 'domain.package', 'quality:DPG@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('DPK', 1, 'CP-DEC-01', 'decision.package', 'quality:DPK@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('DPR', 1, 'CP-DAT-01', 'products.release', 'quality:DPR@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('ENT', 1, 'CP-INT-01', 'intelligence.extraction', 'quality:ENT@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('EVD', 1, 'CP-OBS-01', 'observation.acquisition / observation.quarantine.release', 'quality:EVD@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('EVT', 1, 'CP-INT-01', 'intelligence.extraction', 'quality:EVT@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('FCT', 1, 'CP-PRD-01', 'prediction.forecast', 'quality:FCT@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","uncertainty","method_ref","valid_from","valid_to"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","uncertainty","method_ref","valid_from","valid_to"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","uncertainty","method_ref","valid_from","valid_to"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","uncertainty","method_ref","valid_from","valid_to"]}'::jsonb, ARRAY['uncertainty']::text[], '{"confidence":{"state":"not_applicable","reason":"a quantile forecast states its uncertainty (q10 / q50 / q90), not a confidence"}}'::jsonb),
    ('INI', 1, 'CP-GRA-01', 'graph.strategy', 'quality:INI@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('MEM', 1, 'CP-MEM-01', 'memory.item.record / memory.item.derive', 'quality:MEM@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('MET', 1, 'CP-DAT-01', 'products.metric.certify', 'quality:MET@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('MSR', 1, 'CP-GRA-01', 'graph.strategy', 'quality:MSR@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('OBJ', 1, 'CP-GRA-01', 'graph.strategy', 'quality:OBJ@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('OBS', 1, 'CP-OBS-01', 'observation.acquisition / observation.quarantine.release', 'quality:OBS@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('OUT', 1, 'CP-DEC-01', 'decision.monitoring', 'quality:OUT@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('PLN', 1, 'CP-EXE-01', 'executive.plan', 'quality:PLN@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('PUB', 1, 'CP-EXE-01', 'executive.publication.approve', 'quality:PUB@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('REL', 1, 'CP-INT-01', 'intelligence.extraction', 'quality:REL@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('RPL', 1, 'CP-DEC-01', 'decision.replay', 'quality:RPL@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('RSC', 1, 'CP-GRA-01', 'graph.strategy', 'quality:RSC@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('RSK', 1, 'CP-GRA-01', 'graph.strategy', 'quality:RSK@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('SCN', 1, 'CP-PRD-01', 'prediction.scenario', 'quality:SCN@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('SIM', 1, 'CP-SIM-01', 'simulation.run', 'quality:SIM@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","method_ref"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","method_ref"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","method_ref"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('SRC', 1, 'CP-OBS-01', 'observation.source.register', 'quality:SRC@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('STK', 1, 'CP-GRA-01', 'graph.strategy', 'quality:STK@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('TWN', 1, 'CP-TWN-01', 'twin.version', 'quality:TWN@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('WRN', 1, 'CP-PRD-01', 'prediction.warning', 'quality:WRN@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","valid_from","valid_to","method_ref"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","valid_from","valid_to","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","valid_from","valid_to","method_ref"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","valid_from","valid_to","method_ref"]}'::jsonb, ARRAY['confidence']::text[], '{}'::jsonb)
;
ALTER TABLE objects.header_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects.header_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY header_profiles_shared ON objects.header_profiles FOR SELECT TO eye_app, eye_commit USING (true);
REVOKE ALL ON objects.header_profiles FROM PUBLIC;
GRANT SELECT ON objects.header_profiles TO eye_app, eye_commit;

-- §HD.3 THE SIDE LEDGERS (DESIGN D2) ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Keyed by (object_id, object_version) and referencing the canonical version; written ONLY by objects.admit_version (SECURITY DEFINER, the
-- owner) in the admission's own transaction — no runtime role holds a write grant; append-only; read under the canonical row's own RLS rule.
CREATE TABLE objects.version_operations (
  object_id          uuid NOT NULL,
  object_version     bigint NOT NULL,
  object_type        text NOT NULL,
  scope              text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id          uuid,
  domain_id          uuid,
  operation_id       uuid,                      -- ctx.operation: the governed operation that admitted the version
  bound_action       text NOT NULL,             -- the canonical-write action the context was bound to
  -- The idempotency key: the writer's DECLARED key, else the single-use authority context's nonce (a context admits once: a replayed
  -- context is refused by ctx.issued, so the nonce is the operation's idempotency token). The universal HTTP store is B100's.
  idempotency_key    text NOT NULL CHECK (length(idempotency_key) BETWEEN 3 AND 240),
  idempotency_basis  text NOT NULL CHECK (idempotency_basis IN ('declared', 'authority_context')),
  -- The trace id: the writer's DECLARED id, else the governed operation's correlation id (the header's audit_correlation_id, bound to the
  -- context); ids from a tracing backend are B63's.
  trace_id           text NOT NULL CHECK (length(trace_id) BETWEEN 8 AND 200),
  trace_source       text NOT NULL CHECK (trace_source IN ('declared', 'correlation')),
  header_basis       jsonb NOT NULL CHECK (jsonb_typeof(header_basis) = 'object'),
  -- the policy the admission was decided under (V03-T-052 "access_policy_ref = the bound policy version"): recorded BESIDE the header —
  -- the header's access_policy_ref is a control profile folded by the controls rule and compared by B36's PUB check, so it is not stamped
  policy_bundle      text,
  policy_decision_id uuid,
  recorded_at        timestamptz NOT NULL,
  written_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (object_id, object_version),
  CONSTRAINT vop_version FOREIGN KEY (object_id, object_version) REFERENCES objects.canonical_objects (object_id, object_version)
);
COMMENT ON TABLE objects.version_operations IS 'B50 §HD (0120, DESIGN D2): one row per canonical version admitted after 0120 — its operation, idempotency key, trace id and header basis (the control profiles'' sources, the domain profile governing a null, the active ontology). Absent for a version recorded before B50.';
CREATE UNIQUE INDEX vop_declared_key ON objects.version_operations (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), object_id, idempotency_key)
  WHERE idempotency_basis = 'declared';
CREATE INDEX vop_scope ON objects.version_operations (tenant_id, domain_id, recorded_at);
CREATE TRIGGER version_operations_append_only BEFORE UPDATE OR DELETE ON objects.version_operations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE objects.time_qualifiers (
  object_id      uuid NOT NULL,
  object_version bigint NOT NULL,
  axis           text NOT NULL CHECK (axis IN ('event', 'observation', 'valid_from', 'valid_to', 'recorded', 'document')),
  object_type    text NOT NULL,
  scope          text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id      uuid,
  domain_id      uuid,
  kind           text NOT NULL CHECK (kind IN ('exact', 'bounded', 'approximate', 'unknown', 'recurring', 'conflicting')),
  instant        timestamptz,
  earliest       timestamptz,
  latest         timestamptz,
  time_precision text NOT NULL REFERENCES objects.time_precisions (code),
  zone           text CHECK (zone IS NULL OR zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$|^UTC$'),   -- the zone the value was STATED in; null: not stated
  source         text NOT NULL CHECK (length(btrim(source)) BETWEEN 2 AND 200),
  rule           text,
  conflicts      jsonb CHECK (conflicts IS NULL OR jsonb_typeof(conflicts) = 'array'),
  clock_quality  text NOT NULL CHECK (clock_quality IN ('trusted', 'degraded', 'unknown')),
  declared       boolean NOT NULL,              -- true: stated by the writer (a TimeValue); false: derived from the header's instant and precision
  recorded_at    timestamptz NOT NULL,
  PRIMARY KEY (object_id, object_version, axis),
  CONSTRAINT tq_version FOREIGN KEY (object_id, object_version) REFERENCES objects.canonical_objects (object_id, object_version),
  CONSTRAINT tq_kind CHECK (
    (kind = 'exact' AND instant IS NOT NULL AND earliest IS NULL AND latest IS NULL)
    OR (kind = 'bounded' AND earliest IS NOT NULL AND latest IS NOT NULL AND latest > earliest AND instant IS NULL)
    OR (kind = 'approximate' AND instant IS NOT NULL)
    OR (kind = 'unknown' AND instant IS NULL AND earliest IS NULL AND latest IS NULL AND time_precision = 'unknown')
    OR (kind = 'recurring' AND rule IS NOT NULL)
    OR (kind = 'conflicting' AND instant IS NULL AND conflicts IS NOT NULL AND jsonb_array_length(conflicts) >= 2))
);
COMMENT ON TABLE objects.time_qualifiers IS 'B50 §HD (0120, ES-26-001/-004): per canonical version and axis, the full statement of its time — kind, bounds, precision, stated zone, source, rule, conflicts, clock quality; declared by the writer or derived from the header. Absent for a version recorded before B50.';
CREATE INDEX tq_scope ON objects.time_qualifiers (tenant_id, domain_id, axis, earliest);
CREATE TRIGGER time_qualifiers_append_only BEFORE UPDATE OR DELETE ON objects.time_qualifiers FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['version_operations', 'time_qualifiers'] LOOP
    EXECUTE format('ALTER TABLE objects.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE objects.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY hd_side_read ON objects.%I FOR SELECT TO eye_app, eye_commit USING (public.eye_row_visible(tenant_id, domain_id))', t);
    EXECUTE format('REVOKE ALL ON objects.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON objects.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §HD.4 THE ADMISSION WRITES THE SIDE LEDGERS ──────────────────────────────────────────────────────────────────────────────────────────────
-- objects._time_value_problems: a TimeValue's shape and its kind's rules (the SQL mirror of packages/contracts time.ts timeValueProblems).
CREATE OR REPLACE FUNCTION objects._time_value_problems(v jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE p text[] := '{}'; k text; v_kind text := v ->> 'kind'; ts timestamptz; e timestamptz; l timestamptz;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN RETURN ARRAY['a time value is an object']; END IF;
  FOR k IN SELECT jsonb_object_keys(v) LOOP
    IF k NOT IN ('axis', 'kind', 'instant', 'earliest', 'latest', 'precision', 'zone', 'source', 'rule', 'conflicts', 'clockQuality') THEN p := p || format('unknown field %s', k); END IF;
  END LOOP;
  IF v_kind IS NULL OR v_kind NOT IN ('exact', 'bounded', 'approximate', 'unknown', 'recurring', 'conflicting') THEN p := p || 'kind must be exact, bounded, approximate, unknown, recurring or conflicting'::text; END IF;
  IF (v ->> 'precision') IS NULL OR (v ->> 'precision') NOT IN ('exact', 'second', 'minute', 'hour', 'day', 'part_of_month', 'month', 'quarter', 'year', 'approximate', 'unknown') THEN
    p := p || 'precision must be in the governed vocabulary'::text;
  END IF;
  IF jsonb_typeof(v -> 'zone') = 'string' AND (v ->> 'zone') !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$|^UTC$' THEN p := p || 'zone is an IANA zone name or null'::text; END IF;
  IF coalesce(length(btrim(v ->> 'source')), 0) NOT BETWEEN 2 AND 200 THEN p := p || 'source names who stated the time (2–200 characters)'::text; END IF;
  IF (v ->> 'clockQuality') IS NOT NULL AND (v ->> 'clockQuality') NOT IN ('trusted', 'degraded', 'unknown') THEN p := p || 'clockQuality is trusted, degraded or unknown'::text; END IF;
  BEGIN
    ts := (v ->> 'instant')::timestamptz; e := (v ->> 'earliest')::timestamptz; l := (v ->> 'latest')::timestamptz;
  EXCEPTION WHEN others THEN RETURN p || 'instant, earliest and latest are ISO 8601 instants'::text;
  END;
  CASE v_kind
    WHEN 'exact' THEN IF ts IS NULL OR e IS NOT NULL OR l IS NOT NULL THEN p := p || 'an exact time names its instant and no bounds'::text; END IF;
    WHEN 'bounded' THEN
      IF e IS NULL OR l IS NULL OR l <= e THEN p := p || 'a bounded time names earliest < latest'::text; END IF;
      IF ts IS NOT NULL THEN p := p || 'a bounded time names no single instant'::text; END IF;
      IF (v ->> 'precision') = 'exact' THEN p := p || 'a bounded time is not of exact precision'::text; END IF;
    WHEN 'approximate' THEN
      IF ts IS NULL THEN p := p || 'an approximate time names its centre instant'::text; END IF;
      IF (v ->> 'precision') = 'exact' THEN p := p || 'an approximate time is not of exact precision'::text; END IF;
    WHEN 'unknown' THEN IF ts IS NOT NULL OR e IS NOT NULL OR l IS NOT NULL OR (v ->> 'precision') IS DISTINCT FROM 'unknown' THEN p := p || 'an unknown time names nothing and has precision unknown'::text; END IF;
    WHEN 'recurring' THEN IF coalesce(v ->> 'rule', '') !~ '^(RRULE:)?FREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,+-]+)*$' THEN p := p || 'a recurring time names its RRULE (FREQ=…)'::text; END IF;
    WHEN 'conflicting' THEN
      IF jsonb_typeof(v -> 'conflicts') IS DISTINCT FROM 'array' OR jsonb_array_length(v -> 'conflicts') < 2 THEN p := p || 'a conflicting time names at least two disagreeing sources'::text; END IF;
      IF ts IS NOT NULL THEN p := p || 'a conflicting time names no single instant'::text; END IF;
    ELSE NULL;
  END CASE;
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION objects._time_value_problems(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects._time_value_problems(jsonb) TO eye_app, eye_commit;

-- objects._header_basis: where each control profile of a header came from (DESIGN D3's chain: source contract → evidence → parent → domain),
-- the domain profile that governs a null one (the header carries none — a null is load-bearing for B36's residency gate and the controls fold),
-- the domain's active ontology version (B51 binds it), and the B50-stated fields that are declared absences. INTERNAL (the admit's).
CREATE OR REPLACE FUNCTION objects._header_basis(p_header jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE
  v_tenant uuid := NULLIF(p_header ->> 'tenant_id', '')::uuid; v_domain uuid := NULLIF(p_header ->> 'domain_id', '')::uuid;
  v_id uuid := (p_header ->> 'object_id')::uuid; v_ver bigint := (p_header ->> 'object_version')::bigint;
  v_dom_res text; v_dom_ret text; v_prior jsonb; v_src jsonb; v_cited jsonb; v_ids uuid[]; v_src_ref text[]; f text; val text; frm text; v_out jsonb := '{}'::jsonb;
  v_joined text; v_stated jsonb := '{}'::jsonb; v_ont text;
BEGIN
  SELECT d.residency_profile, d.retention_profile INTO v_dom_res, v_dom_ret FROM tenancy.domains d WHERE d.id = v_domain;
  SELECT jsonb_build_object('rights_profile', o.rights_profile, 'residency_profile', o.residency_profile, 'retention_profile', o.retention_profile, 'access_policy_ref', o.access_policy_ref)
    INTO v_prior FROM objects.canonical_objects o WHERE o.object_id = v_id AND o.object_version = v_ver - 1;
  -- the source contract: the first SRC:<source>@<version> reference (the SRC canonical version IS the contract)
  SELECT regexp_match(r, '^SRC:([0-9a-f-]{36})@([0-9]+)') INTO v_src_ref
    FROM jsonb_array_elements_text(coalesce(p_header -> 'source_object_ids', '[]'::jsonb) || jsonb_build_array(coalesce(p_header ->> 'provenance_ref', ''))) r
   WHERE r ~ '^SRC:[0-9a-f-]{36}@[0-9]+' LIMIT 1;
  IF v_src_ref IS NOT NULL THEN
    SELECT jsonb_build_object('ref', 'SRC:' || o.object_id || '@' || o.object_version, 'rights_profile', o.rights_profile, 'residency_profile', o.residency_profile, 'retention_profile', o.retention_profile, 'access_policy_ref', o.access_policy_ref)
      INTO v_src FROM objects.canonical_objects o WHERE o.object_type = 'SRC' AND o.object_id = v_src_ref[1]::uuid AND o.object_version = v_src_ref[2]::bigint;
  END IF;
  -- the cited canonical objects (evidence_refs + source_object_ids, at most 64): their latest versions' controls
  SELECT array_agg(DISTINCT m[1]::uuid) INTO v_ids FROM (
    SELECT regexp_match(r, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') m
      FROM jsonb_array_elements_text(coalesce(p_header -> 'evidence_refs', '[]'::jsonb) || coalesce(p_header -> 'source_object_ids', '[]'::jsonb)) r LIMIT 64) x WHERE m IS NOT NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('rights_profile', c.rights_profile, 'residency_profile', c.residency_profile, 'retention_profile', c.retention_profile, 'access_policy_ref', c.access_policy_ref)), '[]'::jsonb)
    INTO v_cited FROM (SELECT DISTINCT ON (o.object_id) o.* FROM objects.canonical_objects o WHERE o.object_id = ANY (coalesce(v_ids, '{}')) AND o.object_id <> v_id ORDER BY o.object_id, o.object_version DESC) c;
  FOREACH f IN ARRAY ARRAY['rights_profile', 'residency_profile', 'retention_profile', 'access_policy_ref'] LOOP
    val := p_header ->> f;
    SELECT string_agg(DISTINCT e ->> f, '; ' ORDER BY e ->> f) INTO v_joined FROM jsonb_array_elements(v_cited) e WHERE coalesce(e ->> f, '') <> '';
    frm := CASE
      WHEN val IS NULL THEN 'none'
      WHEN v_src IS NOT NULL AND val = v_src ->> f THEN 'source_contract'
      WHEN val = v_joined OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_cited) e WHERE e ->> f = val) THEN 'evidence'
      WHEN v_prior IS NOT NULL AND val = v_prior ->> f THEN 'parent'
      WHEN f = 'residency_profile' AND val = v_dom_res THEN 'domain'
      WHEN f = 'retention_profile' AND val = v_dom_ret THEN 'domain'
      ELSE 'declared' END;
    v_out := v_out || jsonb_build_object(f, jsonb_build_object('value', val, 'from', frm)
      || CASE WHEN frm = 'source_contract' THEN jsonb_build_object('ref', v_src ->> 'ref') ELSE '{}'::jsonb END
      || CASE WHEN val IS NULL THEN jsonb_build_object('reason', 'no source contract, cited object or prior version carries one; the header states no narrower restriction')
                || CASE WHEN f = 'residency_profile' THEN jsonb_build_object('domain_profile', v_dom_res)
                        WHEN f = 'retention_profile' THEN jsonb_build_object('domain_profile', v_dom_ret) ELSE '{}'::jsonb END
              ELSE '{}'::jsonb END);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['confidence', 'uncertainty', 'quality_state', 'freshness_state'] LOOP
    IF jsonb_typeof(p_header -> f) = 'object' AND (p_header -> f ->> 'state') IN ('not_assessed', 'not_applicable', 'unknown') AND (p_header -> f) ? 'reason' THEN
      v_stated := v_stated || jsonb_build_object(f, p_header -> f ->> 'state');
    END IF;
  END LOOP;
  SELECT g.namespace || ':v' || g.version INTO v_ont FROM graph.ontology_versions g
   WHERE g.tenant_id = v_tenant AND g.domain_id = v_domain AND g.state = 'active' ORDER BY g.activated_at DESC NULLS LAST LIMIT 1;
  RETURN jsonb_build_object('basis_version', 1, 'controls', v_out,
    'ontology', jsonb_build_object('header', p_header ->> 'ontology_ref', 'domain_active', v_ont,
                                   'note', 'B51 binds ontology_ref to the domain''s active ontology version; until then a new version states ontology:none'),
    'limitations', to_jsonb(array_remove(ARRAY[
        CASE WHEN (p_header ->> 'synthetic_state')::boolean THEN 'synthetic content — not a real-world record' END,
        CASE WHEN (p_header ->> 'source_clock_quality') <> 'trusted' THEN 'the source clock is ' || (p_header ->> 'source_clock_quality') END,
        CASE WHEN (p_header ->> 'time_precision') <> 'exact' THEN CASE WHEN (p_header ->> 'time_precision') = 'unknown' THEN 'its time is stated as unknown'
                                                                       ELSE 'its time is stated to ' || replace(p_header ->> 'time_precision', '_', ' ') || ' precision' END END,
        CASE WHEN NULLIF(p_header ->> 'event_time', '') IS NULL THEN 'no event time is stated' END,
        CASE WHEN (p_header ->> 'truth_state') IN ('inferred', 'extracted') THEN (p_header ->> 'truth_state') || ', not reviewed by a person' END], NULL)),
    'absences', v_stated, 'profile', (SELECT p.quality_profile FROM objects.header_profiles p WHERE p.object_type = p_header ->> 'object_type' AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION objects._header_basis(jsonb) FROM PUBLIC;

-- objects._record_admission: the side-ledger rows of one admitted version. INTERNAL — called once, by objects.admit_version, after its insert.
-- p_decl (from the 4-argument admit): {idempotency_key?, trace_id?, time?: [TimeValue + axis]}; null: everything derived.
CREATE OR REPLACE FUNCTION objects._record_admission(p_header jsonb, p_decl jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_id uuid := (p_header ->> 'object_id')::uuid; v_ver bigint := (p_header ->> 'object_version')::bigint; v_type text := p_header ->> 'object_type';
  v_scope text := p_header ->> 'scope'; v_tenant uuid := NULLIF(p_header ->> 'tenant_id', '')::uuid; v_domain uuid := NULLIF(p_header ->> 'domain_id', '')::uuid;
  v_rec timestamptz := (p_header ->> 'recorded_at')::timestamptz; v_prec text := p_header ->> 'time_precision'; v_clock text := p_header ->> 'source_clock_quality';
  t jsonb; k text; v_probs text[]; v_axis text; v_field text; v_at timestamptz; v_expect timestamptz; v_declared text[] := '{}'; v_kind text; v_unit text; v_e timestamptz; v_l timestamptz;
BEGIN
  IF p_decl IS NOT NULL THEN
    IF jsonb_typeof(p_decl) <> 'object' THEN RAISE EXCEPTION 'admission rejected (declaration): the version declaration is an object' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(p_decl) LOOP
      IF k NOT IN ('idempotency_key', 'trace_id', 'time') THEN RAISE EXCEPTION 'admission rejected (declaration): unknown field %', k USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF p_decl ? 'idempotency_key' AND coalesce(length(btrim(p_decl ->> 'idempotency_key')), 0) NOT BETWEEN 3 AND 200 THEN
      RAISE EXCEPTION 'admission rejected (declaration): an idempotency key is 3–200 characters' USING ERRCODE = '22023';
    END IF;
    IF p_decl ? 'trace_id' AND coalesce(length(btrim(p_decl ->> 'trace_id')), 0) NOT BETWEEN 8 AND 200 THEN
      RAISE EXCEPTION 'admission rejected (declaration): a trace id is 8–200 characters' USING ERRCODE = '22023';
    END IF;
    IF p_decl ? 'time' AND jsonb_typeof(p_decl -> 'time') <> 'array' THEN RAISE EXCEPTION 'admission rejected (declaration): time is an array of stated time values' USING ERRCODE = '22023'; END IF;
  END IF;

  INSERT INTO objects.version_operations (object_id, object_version, object_type, scope, tenant_id, domain_id, operation_id, bound_action,
                                          idempotency_key, idempotency_basis, trace_id, trace_source, header_basis, policy_bundle, policy_decision_id, recorded_at)
  VALUES (v_id, v_ver, v_type, v_scope, v_tenant, v_domain, ctx.current_operation(), coalesce(public.eye_bound_action(), '<none>'),
          coalesce(btrim(p_decl ->> 'idempotency_key'), 'ctx:' || coalesce(public.eye_ctx_nonce()::text, ctx.current_operation()::text, p_header ->> 'audit_correlation_id')),
          CASE WHEN p_decl ? 'idempotency_key' THEN 'declared' ELSE 'authority_context' END,
          coalesce(btrim(p_decl ->> 'trace_id'), p_header ->> 'audit_correlation_id'),
          CASE WHEN p_decl ? 'trace_id' THEN 'declared' ELSE 'correlation' END,
          objects._header_basis(p_header), public.eye_bundle_version(), public.eye_policy_decision(), v_rec);

  -- DECLARED time values: each checked, then matched against the header axis it qualifies (the header instant is the value's lower bound,
  -- centre or instant; an unknown / recurring / conflicting value places none)
  FOR t IN SELECT x FROM jsonb_array_elements(coalesce(p_decl -> 'time', '[]'::jsonb)) x LOOP
    v_axis := t ->> 'axis';
    IF v_axis IS NULL OR v_axis NOT IN ('event', 'observation', 'valid_from', 'valid_to', 'recorded', 'document') THEN
      RAISE EXCEPTION 'admission rejected (time): a stated time names its axis (event, observation, valid_from, valid_to, recorded, document)' USING ERRCODE = '22023';
    END IF;
    IF v_axis = ANY (v_declared) THEN RAISE EXCEPTION 'admission rejected (time): the % time is stated twice', v_axis USING ERRCODE = '22023'; END IF;
    v_probs := objects._time_value_problems(t);
    IF cardinality(v_probs) > 0 THEN RAISE EXCEPTION 'admission rejected (time): the % time — %', v_axis, array_to_string(v_probs, '; ') USING ERRCODE = '22023'; END IF;
    v_field := CASE v_axis WHEN 'event' THEN 'event_time' WHEN 'observation' THEN 'observation_time' WHEN 'valid_from' THEN 'valid_from' WHEN 'valid_to' THEN 'valid_to' WHEN 'recorded' THEN 'recorded_at' END;
    IF v_field IS NOT NULL THEN
      v_at := NULLIF(p_header ->> v_field, '')::timestamptz;
      v_expect := CASE t ->> 'kind' WHEN 'exact' THEN (t ->> 'instant')::timestamptz WHEN 'approximate' THEN (t ->> 'instant')::timestamptz
                                    WHEN 'bounded' THEN (t ->> 'earliest')::timestamptz ELSE NULL END;
      IF v_at IS DISTINCT FROM v_expect THEN
        RAISE EXCEPTION 'admission rejected (time): the header''s % (%) is not the stated % time''s instant (%) — a time is never forced to a false instant', v_field, coalesce(v_at::text, 'none'), v_axis, coalesce(v_expect::text, 'none') USING ERRCODE = '22023';
      END IF;
    END IF;
    INSERT INTO objects.time_qualifiers (object_id, object_version, axis, object_type, scope, tenant_id, domain_id, kind, instant, earliest, latest, time_precision,
                                         zone, source, rule, conflicts, clock_quality, declared, recorded_at)
    VALUES (v_id, v_ver, v_axis, v_type, v_scope, v_tenant, v_domain, t ->> 'kind', (t ->> 'instant')::timestamptz, (t ->> 'earliest')::timestamptz, (t ->> 'latest')::timestamptz,
            t ->> 'precision', t ->> 'zone', btrim(t ->> 'source'), t ->> 'rule', t -> 'conflicts', coalesce(t ->> 'clockQuality', CASE WHEN v_axis = 'recorded' THEN 'trusted' ELSE v_clock END), true, v_rec);
    v_declared := v_declared || v_axis;
  END LOOP;

  -- DERIVED qualifiers for every other axis the header carries: the precision word sets the bounds (a day-precision instant is the day
  -- [d, d+1) in UTC — the zone it was stated in is not known, so none is claimed); observation and record times are the system's clocks.
  FOR v_axis, v_field IN SELECT * FROM (VALUES ('event', 'event_time'), ('observation', 'observation_time'), ('valid_from', 'valid_from'), ('valid_to', 'valid_to'), ('recorded', 'recorded_at')) a(x, y) LOOP
    CONTINUE WHEN v_axis = ANY (v_declared);
    v_at := NULLIF(p_header ->> v_field, '')::timestamptz;
    CONTINUE WHEN v_at IS NULL;
    v_kind := 'exact'; v_e := NULL; v_l := NULL; v_unit := NULL;
    IF v_axis IN ('event', 'valid_from', 'valid_to') AND v_prec <> 'exact' THEN
      v_unit := CASE v_prec WHEN 'second' THEN 'second' WHEN 'minute' THEN 'minute' WHEN 'hour' THEN 'hour' WHEN 'day' THEN 'day' WHEN 'month' THEN 'month' WHEN 'quarter' THEN 'quarter' WHEN 'year' THEN 'year' END;
      IF v_unit IS NOT NULL THEN
        v_kind := 'bounded'; v_e := date_trunc(v_unit, v_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
        v_l := v_e + (SELECT p.granularity FROM objects.time_precisions p WHERE p.code = v_prec);
      ELSE v_kind := 'approximate'; END IF;
    END IF;
    INSERT INTO objects.time_qualifiers (object_id, object_version, axis, object_type, scope, tenant_id, domain_id, kind, instant, earliest, latest, time_precision,
                                         zone, source, rule, conflicts, clock_quality, declared, recorded_at)
    VALUES (v_id, v_ver, v_axis, v_type, v_scope, v_tenant, v_domain, v_kind, CASE WHEN v_kind = 'bounded' THEN NULL ELSE v_at END, v_e, v_l,
            CASE WHEN v_axis IN ('event', 'valid_from', 'valid_to') THEN CASE WHEN v_prec = 'unknown' THEN 'approximate' ELSE v_prec END ELSE 'exact' END,
            NULL, 'header (' || (p_header ->> 'owning_component') || ')', NULL, NULL,
            CASE WHEN v_axis = 'recorded' THEN 'trusted' ELSE v_clock END, false, v_rec);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION objects._record_admission(jsonb, jsonb) FROM PUBLIC;

-- objects.admit_version (3 arguments) — 0069 line 93, its LAST definition, copied whole; + the side ledgers written after the insert, in the
-- same transaction (B50 hd). The declaration the 4-argument form hands over travels in a transaction-local setting it sets and this clears.
CREATE OR REPLACE FUNCTION objects.admit_version(
  p_header jsonb, p_payload jsonb, p_digest text
) RETURNS TABLE (object_id uuid, object_version bigint, content_digest text)
SECURITY DEFINER SET search_path = objects, observation, canon, ctx, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_missing text; v_extra text; v_recomputed text;
  v_scope text := p_header->>'scope';
  v_tenant uuid := NULLIF(p_header->>'tenant_id','')::uuid;
  v_domain uuid := NULLIF(p_header->>'domain_id','')::uuid;
  v_action text := public.eye_bound_action();
  v_types text[];
  v_known boolean;
BEGIN
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'admission rejected: authority mode required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  SELECT true, w.object_types INTO v_known, v_types
    FROM observation.canonical_write_actions w WHERE w.action = v_action;
  IF v_known IS NOT TRUE THEN
    RAISE EXCEPTION 'admission rejected: context is bound to action %, not a canonical write',
      coalesce(v_action,'<none>') USING ERRCODE = '42501';
  END IF;
  IF v_types IS NOT NULL AND NOT ((p_header->>'object_type') = ANY (v_types)) THEN
    RAISE EXCEPTION 'admission rejected: action % may not admit a % object',
      v_action, p_header->>'object_type' USING ERRCODE = '42501';
  END IF;
  -- 0069 §2 (B10-F4): a type whose writes are its own port's is NOT admitted by a generic action, whatever the caller's role.
  IF EXISTS (SELECT 1 FROM observation.canonical_write_exclusions x WHERE x.action = v_action AND x.object_type = (p_header->>'object_type')) THEN
    RAISE EXCEPTION 'admission rejected: action % may not admit a % object — it is written through its own port (%)',
      v_action, p_header->>'object_type', (SELECT x.rationale FROM observation.canonical_write_exclusions x WHERE x.action = v_action AND x.object_type = (p_header->>'object_type')) USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
  PERFORM objects.assert_header_binding(p_header);

  SELECT string_agg(field_name, ', ') INTO v_missing
    FROM objects.canonical_field_registry r WHERE NOT (p_header ? r.field_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header missing required field(s): %', v_missing
      USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(k, ', ') INTO v_extra
    FROM jsonb_object_keys(p_header) AS k
   WHERE NOT EXISTS (SELECT 1 FROM objects.canonical_field_registry r WHERE r.field_name = k);
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header carries unregistered field(s): %', v_extra
      USING ERRCODE = '22023';
  END IF;

  PERFORM objects.assert_header_semantics(p_header);

  v_recomputed := canon.sha256_hex(canon.jcs(jsonb_build_object('header', p_header, 'payload', p_payload)));
  IF p_digest IS DISTINCT FROM v_recomputed THEN
    RAISE EXCEPTION 'admission rejected: content digest does not bind the header and payload'
      USING ERRCODE = '42501';
  END IF;
  IF NOT ((public.eye_scope() = 'PLATFORM' AND v_scope = 'PLATFORM' AND v_tenant IS NULL)
          OR public.eye_row_writable(v_scope, v_tenant, v_domain)) THEN
    RAISE EXCEPTION 'admission rejected: context not authorized for the object scope'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO objects.canonical_objects (
    object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state,
    owning_component, accountable_owner, source_object_ids, event_time, observation_time,
    valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state,
    synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref,
    contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope,
    rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile,
    quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes,
    withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest
  ) VALUES (
    (p_header->>'object_id')::uuid, p_header->>'object_type', v_tenant, v_domain, v_scope,
    (p_header->>'object_version')::bigint, p_header->>'lifecycle_state',
    p_header->>'owning_component', p_header->>'accountable_owner',
    coalesce(p_header->'source_object_ids','[]'::jsonb),
    NULLIF(p_header->>'event_time','')::timestamptz, NULLIF(p_header->>'observation_time','')::timestamptz,
    NULLIF(p_header->>'valid_from','')::timestamptz, NULLIF(p_header->>'valid_to','')::timestamptz,
    (p_header->>'recorded_at')::timestamptz, p_header->>'time_precision',
    p_header->>'source_clock_quality', p_header->>'truth_state',
    (p_header->>'synthetic_state')::boolean, p_header->'confidence', p_header->'uncertainty',
    coalesce(p_header->'evidence_refs','[]'::jsonb), p_header->>'provenance_ref', p_header->>'method_ref',
    coalesce(p_header->'contradiction_refs','[]'::jsonb), coalesce(p_header->'corroboration_refs','[]'::jsonb),
    coalesce(p_header->'human_refs','[]'::jsonb), p_header->>'classification', p_header->>'purpose_scope',
    p_header->>'rights_profile', p_header->>'residency_profile', p_header->>'retention_profile',
    p_header->>'access_policy_ref', p_header->>'quality_profile', p_header->'quality_state',
    p_header->'freshness_state', p_header->>'schema_ref', p_header->>'ontology_ref',
    p_header->>'correction_of', p_header->>'supersedes', p_header->>'withdrawal_reason',
    (p_header->>'audit_correlation_id')::uuid, p_header->>'content_ref',
    p_payload, v_recomputed
  );
  -- B50 hd: the side ledgers (objects.version_operations, objects.time_qualifiers) in this transaction; the 4-argument form's declaration, once.
  PERFORM objects._record_admission(p_header, NULLIF(current_setting('eye.b50_admission', true), '')::jsonb);
  PERFORM set_config('eye.b50_admission', '', true);
  RETURN QUERY SELECT (p_header->>'object_id')::uuid, (p_header->>'object_version')::bigint, v_recomputed;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.admit_version(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.admit_version(jsonb, jsonb, text) TO eye_commit;

-- objects.admit_version (4 arguments, NEW): the same admission with the writer's VERSION DECLARATION — its stated time values (the upload
-- intake's document time), and optionally its idempotency key and trace id. Every check is the 3-argument admit's, which it calls.
CREATE OR REPLACE FUNCTION objects.admit_version(
  p_header jsonb, p_payload jsonb, p_digest text, p_declaration jsonb
) RETURNS TABLE (object_id uuid, object_version bigint, content_digest text)
SECURITY DEFINER SET search_path = objects, observation, canon, ctx, public, pg_catalog, pg_temp
AS $$
BEGIN
  IF p_declaration IS NOT NULL AND jsonb_typeof(p_declaration) <> 'object' THEN
    RAISE EXCEPTION 'admission rejected (declaration): the version declaration is an object' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('eye.b50_admission', coalesce(p_declaration, '{}'::jsonb)::text, true);
  RETURN QUERY SELECT a.object_id, a.object_version, a.content_digest FROM objects.admit_version(p_header, p_payload, p_digest) a;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.admit_version(jsonb, jsonb, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.admit_version(jsonb, jsonb, text, jsonb) TO eye_commit;

-- §HD.5 THE HEADER HALF OF THE KNOWLEDGE HOOK (ES-24-003) ─────────────────────────────────────────────────────────────────────────────────
-- objects._header_usable — 0120 §0.1's stub, re-declared WHOLE (same signature, STABLE, invoker, read-only): before a decision-active use, the
-- type's header profile names the fields that must be present (and the ones that must carry a VALUE, not a declared absence); a version
-- admitted after B50 must also carry every field B50 states. A missing field refuses in the class form, naming the fields and the profile.
-- An unknown object is the CALLER's refusal (every caller resolves its citation first — derive_option, the gate's citations, the publication
-- source, the export manifests): the hook returns.
CREATE OR REPLACE FUNCTION objects._header_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE
  o jsonb; pr objects.header_profiles%ROWTYPE; v_post boolean; f text; v jsonb; v_missing text[] := '{}';
BEGIN
  -- B50 hd: the header profile's mandatory fields for p_use
  SELECT to_jsonb(x) INTO o FROM objects.canonical_objects x WHERE x.object_type = p_type AND x.object_id = p_id AND x.object_version = p_version;
  IF o IS NULL THEN RETURN; END IF;
  SELECT * INTO pr FROM objects.header_profiles p WHERE p.object_type = p_type AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'object use rejected (incomplete_header): % % v% has no header profile, so no field is known mandatory for %; a type is profiled before it is decision-active', p_type, p_id, p_version, p_use USING ERRCODE = '22023';
  END IF;
  v_post := EXISTS (SELECT 1 FROM objects.version_operations w WHERE w.object_id = p_id AND w.object_version = p_version);
  FOR f IN SELECT jsonb_array_elements_text(coalesce(pr.mandatory -> p_use, '[]'::jsonb)) LOOP
    v := o -> f;
    IF v IS NULL OR jsonb_typeof(v) = 'null' OR (jsonb_typeof(v) = 'array' AND jsonb_array_length(v) = 0) OR (jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = '') THEN
      v_missing := v_missing || f;
    ELSIF jsonb_typeof(v) = 'string' AND f = 'provenance_ref' AND (v #>> '{}') LIKE 'none:%' THEN
      v_missing := v_missing || (f || ' (stated none)');
    ELSIF f = ANY (pr.value_required) AND jsonb_typeof(v) = 'object' AND (v ->> 'state') IN ('not_assessed', 'not_applicable', 'unknown') AND v ? 'reason' THEN
      v_missing := v_missing || format('%s (declared %s: %s)', f, v ->> 'state', v ->> 'reason');
    END IF;
  END LOOP;
  IF v_post THEN
    FOREACH f IN ARRAY ARRAY['confidence', 'uncertainty', 'quality_state', 'freshness_state', 'ontology_ref', 'quality_profile', 'provenance_ref'] LOOP
      IF (o -> f) IS NULL OR jsonb_typeof(o -> f) = 'null' THEN v_missing := v_missing || (f || ' (not stated)'); END IF;
    END LOOP;
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'object use rejected (incomplete_header): % % v% lacks % for % (header profile %@%)%', p_type, p_id, p_version, array_to_string(v_missing, ', '), p_use, p_type, pr.profile_version,
      CASE WHEN v_post THEN '' ELSE '; the version was recorded before B50 — the fields B50 states are not populated on it' END USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION objects._header_usable(text, uuid, int, text) FROM PUBLIC;

-- §HD.6 THE READS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- objects.identity_declaration (ES-25-002): how an object's identity is declared — the issuing authority (the type's profile and the version's
-- owning component), the namespace (scope · tenant · domain · type), the creation time (v1's record time), the status (the latest version's
-- lifecycle state), the aliases (an entity's registered identifiers), the merges and splits (an entity's resolutions, its split lineage and
-- supersession) and the supersession chain of its versions. The identifier itself embeds nothing mutable (UUIDv7; ES-25-001). Read within the
-- caller's bound tenant and domain.
CREATE OR REPLACE FUNCTION objects.identity_declaration(p_type text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE f objects.canonical_objects%ROWTYPE; l objects.canonical_objects%ROWTYPE; pr objects.header_profiles%ROWTYPE; v_aliases jsonb := '[]'::jsonb; v_merge jsonb := '[]'::jsonb;
        v_split jsonb := '{}'::jsonb; v_chain jsonb; v_entity uuid;
BEGIN
  -- looked up WITHIN the caller's bound tenant and domain: an object of another scope is as unknown as one never recorded (no existence oracle)
  SELECT * INTO f FROM objects.canonical_objects x WHERE x.object_type = p_type AND x.object_id = p_id AND observation.read_scope_ok(x.tenant_id, x.domain_id)
   ORDER BY x.object_version LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'identity rejected (unknown_object): no % % is recorded in the caller''s tenant and domain', p_type, p_id USING ERRCODE = '23503'; END IF;
  PERFORM observation.assert_read_scope(f.tenant_id, f.domain_id, 'an identity declaration');
  SELECT * INTO l FROM objects.canonical_objects x WHERE x.object_id = p_id ORDER BY x.object_version DESC LIMIT 1;
  SELECT * INTO pr FROM objects.header_profiles p WHERE p.object_type = p_type AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1;
  -- an ENT's graph identity: the entity resolved from this claim object, or the entity whose id is this object's
  SELECT coalesce((SELECT e.entity_id FROM graph.entities_current e WHERE e.entity_id = p_id),
                  (SELECT r.entity_id FROM graph.resolutions_current r WHERE r.claim_object_id = p_id ORDER BY r.claim_version DESC LIMIT 1)) INTO v_entity;
  IF v_entity IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('system', i.system_key, 'value', i.identifier_value, 'authority', s.authority, 'authoritative', s.is_authoritative, 'recorded_at', i.recorded_at) ORDER BY i.recorded_at), '[]'::jsonb)
      INTO v_aliases FROM graph.entity_identifiers i JOIN graph.identifier_systems s ON s.tenant_id = i.tenant_id AND s.domain_id = i.domain_id AND s.system_key = i.system_key WHERE i.entity_id = v_entity;
    SELECT coalesce(jsonb_agg(jsonb_build_object('resolution_id', r.resolution_id, 'claim', r.claim_object_id || '@' || r.claim_version, 'method', r.method, 'rule', r.rule_id || '@' || r.rule_version, 'score', r.score) ORDER BY r.claim_version), '[]'::jsonb)
      INTO v_merge FROM graph.resolutions_current r WHERE r.entity_id = v_entity;
    SELECT jsonb_build_object('entity_id', e.entity_id, 'lifecycle_state', e.lifecycle_state, 'split_from', e.split_from, 'superseded_by', e.superseded_by,
                              'split_into', (SELECT coalesce(jsonb_agg(c.entity_id), '[]'::jsonb) FROM graph.entities_current c WHERE c.split_from = e.entity_id))
      INTO v_split FROM graph.entities_current e WHERE e.entity_id = v_entity;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('version', x.object_version, 'lifecycle_state', x.lifecycle_state, 'correction_of', x.correction_of, 'supersedes', x.supersedes, 'recorded_at', x.recorded_at,
                                      'header', CASE WHEN EXISTS (SELECT 1 FROM objects.version_operations w WHERE w.object_id = x.object_id AND w.object_version = x.object_version) THEN 'stated' ELSE 'recorded before B50' END)
                   ORDER BY x.object_version) INTO v_chain FROM objects.canonical_objects x WHERE x.object_id = p_id;
  RETURN jsonb_build_object(
    'object', p_type || ':' || p_id,
    'issuing_authority', jsonb_build_object('profile', coalesce(pr.issuing_authority, f.owning_component), 'issued_through', pr.issued_through, 'owning_component', f.owning_component,
                                            'profile_version', pr.profile_version, 'consistent', pr.issuing_authority IS NULL OR pr.issuing_authority = f.owning_component OR f.owning_component = 'CP-OBJ-01'),
    'namespace', jsonb_build_object('scope', f.scope, 'tenant_id', f.tenant_id, 'domain_id', f.domain_id, 'object_type', p_type, 'identifier_scheme', 'uuid (UUIDv7: time-ordered; embeds no name, region, classification, environment or location — ES-25-001)'),
    'created_at', f.recorded_at, 'status', l.lifecycle_state, 'latest_version', l.object_version,
    'aliases', v_aliases, 'merges', v_merge, 'splits', v_split,
    'supersession', coalesce(v_chain, '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION objects.identity_declaration(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.identity_declaration(text, uuid) TO eye_app, eye_commit;

-- objects.layer_contracts (V00-T-030, C-008, V01-T-045): the TEN layers (B107's LAYERS, generate-components-manifest.mjs) with their published
-- contracts — object schemas, events, interfaces, the provenance / time / identity / policy blocks (the 43-field header, one contract for every
-- layer), quality (the header profiles), failure (the failure domains, what their loss affects, and the degraded-mode contracts declared for
-- them) — and, per layer, the contract kinds MISSING (listed, never omitted). Shared reference data, plus the caller's visible degraded contracts.
CREATE TABLE objects.layer_register (
  layer       smallint PRIMARY KEY CHECK (layer BETWEEN 1 AND 10),
  name        text NOT NULL,
  chapter     text NOT NULL CHECK (chapter ~ '^ES-[0-9]{2}$'),
  units       text[] NOT NULL,
  objects     text[] NOT NULL,
  reads       smallint[] NOT NULL,
  failure     text[] NOT NULL,
  affected    text NOT NULL
);
COMMENT ON TABLE objects.layer_register IS 'B50 §HD (0120): the ten canonical layers as B107''s LAYERS (apps/api/src/governance/conformance/generate-components-manifest.mjs) declares them — the harness asserts they agree; navigation is B80''s workspaces, a deliberate mapping, not a rename (the layer note).';
INSERT INTO objects.layer_register (layer, name, chapter, units, objects, reads, failure, affected) VALUES
  (1, 'World Observation', 'ES-31', ARRAY['api.observation', 'worker.collection'], ARRAY['SRC', 'OBS', 'EVD'], ARRAY[]::smallint[], ARRAY['postgres:observation', 'redis:collection-queue', 'connector egress'],
   'observations stop arriving or arrive late: freshness and coverage read stale with the gap DISCLOSED; warnings, forecasts and briefings that depend on the source show their evidence age; nothing is inferred current'),
  (2, 'Intelligence', 'ES-32', ARRAY['api.intelligence', 'worker.extraction-plan'], ARRAY['CLM', 'ENT', 'EVT', 'REL', 'ASM'], ARRAY[1]::smallint[], ARRAY['postgres:intelligence', 'redis:extraction-queue', 'model gateway'],
   'claims, entities and events are not extracted or reviewed: new evidence stays un-transformed and is shown as such; no claim is promoted without its review; truth states are never upgraded by default'),
  (3, 'Enterprise Memory', 'ES-33', ARRAY['api.objects', 'api.retention', 'api.graph'], ARRAY['OBJ', 'MEM', 'APR', 'RPL'], ARRAY[1, 2]::smallint[], ARRAY['postgres:objects', 'postgres:memory', 'vault filesystem roots'],
   'memory commits, retention actions and exports pause: prior versions stay readable with their provenance; corrections are queued, never lost; a deletion or export is never reported complete before it is'),
  (4, 'Knowledge Graph', 'ES-34', ARRAY['api.graph'], ARRAY['ENT', 'REL', 'DPR'], ARRAY[2, 3]::smallint[], ARRAY['postgres:graph', 'redis:subscription-queue'],
   'graph revisions and traversals degrade: paths are returned partial with incompleteness disclosed; GraphChanged consumers lag visibly; identity resolutions are held, never merged by default'),
  (5, 'Digital Twins', 'ES-35', ARRAY['api.twin'], ARRAY['TWN'], ARRAY[3, 4]::smallint[], ARRAY['postgres:twin', 'redis:estimation-queue'],
   'twin state estimates go stale: twins show their freshness and operating-envelope state; synthetic states stay labelled; branches cannot be run on a stale twin without the disclosure'),
  (6, 'Prediction Engine', 'ES-36', ARRAY['api.prediction'], ARRAY['FCT', 'WRN', 'SIM'], ARRAY[1, 3, 4, 5]::smallint[], ARRAY['postgres:prediction', 'redis:forecast-queue', 'model gateway'],
   'forecasts and warnings are not refreshed: the last forecast version shows its age and fitness; unfit forecasts are withheld from decisions; warnings already raised stay visible with their acknowledgement state'),
  (7, 'Scenario Intelligence', 'ES-37', ARRAY['api.prediction', 'api.domains'], ARRAY['SCN', 'ASU'], ARRAY[4, 5, 6]::smallint[], ARRAY['postgres:prediction'],
   'scenarios, signposts and assumptions are not updated: scenario sets show their coherence state as of their last review; signpost movements are not inferred'),
  (8, 'Simulation Engine', 'ES-38', ARRAY['api.twin'], ARRAY['SIM'], ARRAY[5, 6, 7]::smallint[], ARRAY['postgres:simulation', 'redis:experiment-queue', 'compute budget'],
   'experiments queue or stop at their budget: completed runs stay reproducible from their seeds and versions; partial runs are never presented as results'),
  (9, 'Decision Intelligence', 'ES-39', ARRAY['api.decision'], ARRAY['DEC', 'CMT', 'OUT', 'DPK'], ARRAY[4, 6, 7, 8]::smallint[], ARRAY['postgres:decision'],
   'decision packages cannot be assembled or approved: no recommendation is issued without its evidence and foresight; pending approvals stay pending (never auto-approved); recorded decisions and commitments stay intact and replayable'),
  (10, 'Executive Operating System', 'ES-40', ARRAY['api.executive'], ARRAY['BRF', 'PLN', 'PUB', 'CAP', 'INI', 'RSC', 'MSR', 'STK', 'RSK', 'MET'], ARRAY[6, 7, 9]::smallint[], ARRAY['postgres:executive', 'redis:attention-queue', 'local delivery sinks'],
   'briefings, attention routing and rooms degrade: the workspace marks what is stale; attention items already raised stay owned and visible; escalations are held, never silently dropped; a human gate is never bypassed');
CREATE TRIGGER layer_register_append_only BEFORE UPDATE OR DELETE ON objects.layer_register FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE objects.layer_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects.layer_register FORCE ROW LEVEL SECURITY;
CREATE POLICY layer_register_shared ON objects.layer_register FOR SELECT TO eye_app, eye_commit USING (true);
REVOKE ALL ON objects.layer_register FROM PUBLIC;
GRANT SELECT ON objects.layer_register TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION objects.layer_contracts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(c ORDER BY (c ->> 'layer')::int), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'layer', l.layer, 'name', l.name, 'chapter', l.chapter, 'units', to_jsonb(l.units), 'reads', to_jsonb(l.reads),
      'objects', (SELECT coalesce(jsonb_agg(jsonb_build_object('type', t,
                    'schemas', (SELECT coalesce(jsonb_agg(s.schema_version ORDER BY s.schema_version), '[]'::jsonb) FROM objects.schema_registry s WHERE s.object_type = t),
                    'header_profile', (SELECT p.object_type || '@' || p.profile_version FROM objects.header_profiles p WHERE p.object_type = t AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1),
                    'quality_profile', (SELECT p.quality_profile FROM objects.header_profiles p WHERE p.object_type = t AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1)) ORDER BY t), '[]'::jsonb)
                  FROM unnest(l.objects) t),
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_type', e.event_type, 'interface', e.interface) ORDER BY e.event_type), '[]'::jsonb)
                   FROM graph.subscribable_event_types e WHERE e.interface LIKE 'L' || l.layer || '-I%'),
      'interfaces', (SELECT jsonb_build_object('total', count(*), 'bound', count(*) FILTER (WHERE i.binding_state = 'bound'), 'partial', count(*) FILTER (WHERE i.binding_state = 'partial'),
                                               'unbound', count(*) FILTER (WHERE i.binding_state = 'unbound')) FROM objects.interface_register i WHERE i.layer = l.layer),
      'header', jsonb_build_object('contract', 'the 43-field canonical header (ADR-0003) — identity, time, truth, provenance, policy, quality, schema, correction, audit blocks',
                                   'registry_fields', (SELECT count(*) FROM objects.canonical_field_registry)),
      'failure', jsonb_build_object('domains', to_jsonb(l.failure), 'affected', l.affected,
                                    'degraded_contracts', (SELECT count(*) FROM shell.degraded_contracts d WHERE d.dependency_key = ANY (l.failure)
                                                             AND (d.scope = 'PLATFORM' OR (d.tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR d.domain_id = public.eye_domain()))))),
      'missing', to_jsonb(array_remove(ARRAY[
          CASE WHEN EXISTS (SELECT 1 FROM unnest(l.objects) t WHERE NOT EXISTS (SELECT 1 FROM objects.schema_registry s WHERE s.object_type = t)) THEN 'object_schema' END,
          CASE WHEN EXISTS (SELECT 1 FROM unnest(l.objects) t WHERE NOT EXISTS (SELECT 1 FROM objects.header_profiles p WHERE p.object_type = t AND p.state = 'active')) THEN 'quality_profile' END,
          CASE WHEN NOT EXISTS (SELECT 1 FROM graph.subscribable_event_types e WHERE e.interface LIKE 'L' || l.layer || '-I%') THEN 'subscribable_event' END,
          CASE WHEN NOT EXISTS (SELECT 1 FROM shell.degraded_contracts d WHERE d.dependency_key = ANY (l.failure)
                                  AND (d.scope = 'PLATFORM' OR (d.tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR d.domain_id = public.eye_domain())))) THEN 'degraded_contract' END], NULL))
    ) c FROM objects.layer_register l) x $$;
REVOKE ALL ON FUNCTION objects.layer_contracts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.layer_contracts() TO eye_app, eye_commit;

-- ═══ FOLD §LC (from 0120_b50_x_lc.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §LC — CP-6 B50: THE GOVERNED WORK-OBJECT LIFECYCLE (F-P3-02: PR-06-001/002/003/005/006, CAP-AU-07, AT-06, ADR-006; F-P3-01:
-- V03-T-021, V04-T-006; F-P7-F-03: V01-T-046's "lifecycle coverage" measure, carried). Part-local; applies ALONE on 0001–0119 + the 0120
-- prelude (§0). Folded after §HD at integration. Nothing of 0001–0119 or of §0 is re-declared here except the two definitions named below,
-- each copied WHOLE from its last definition with the change marked `-- B50 lc`.
--
-- THE GAP. The canonical store's lifecycle vocabulary had no draft, reviewed, approved, published or retired (0006:15): ADR-006's eight
-- states were not distinct, no object type declared its lifecycle, a transition was any new version anyone holding a write action admitted,
-- nothing kept a rejected or a duplicated attempt, and nothing could replay where a work object stood at an instant from its own record.
--
-- THE MECHANISM (DESIGN D4, D5).
--   the vocabulary         objects.canonical_objects' lifecycle_state CHECK widened with ADR-006's five absent states (draft, reviewed,
--                          approved, published, retired) — the existing nine keep their meaning; objects.assert_header_semantics (0012)
--                          copied whole with the same list. No header field is added; no version is rewritten (the CHECK only widens).
--   objects.lifecycle_profiles     per canonical type, VERSIONED, APPEND-ONLY, written by migrations only: its own states, the map from each
--                          to ADR-006's canonical words, the canonical record states that AGREE with each module state (the reconciliation
--                          rule), the transition contracts (action, from, to, actor class owner | reviewer | approver, kind forward |
--                          re_entry | compensation, separation, re-entry reasons) and the OWNING PORT. A module-owned type (sources,
--                          exposures, memory, forecasts, warnings, publications, packages, briefings, claims, evidence, graph revisions)
--                          keeps its own port — this machine MAPS its states and never adds a second write path (0069:79 stands); the
--                          work-object types (ASM@v3 first: the person-authored assessment, DESIGN D5) move through objects.transition_lifecycle.
--   objects.lifecycle_transitions  APPEND-ONLY: every attempted transition of a work object — accepted | rejected | compensated — with the
--                          attempted action and command, the last authoritative version, the new version, the refusal (class, code, words),
--                          the kind, the causation and correlation, the re-entry reason, the policy context (decision id, bundle version)
--                          and the idempotency key (a repeat answers the FIRST result — PR-06-005).
--   objects.lifecycle_proposals / objects.lifecycle_proposal_decisions   APPEND-ONLY: views, agents, models, imports and projections PROPOSE;
--                          only the accountable owner DECIDES (accept performs the transition through the same rules; decline records why).
--   objects.lifecycle_current      the current state per work object (a security_invoker view over the ledger).
--   ports                  objects.author_work_object (objects.work_object.author — a named person authors the draft, version 1, written in
--                          SQL through objects.admit_version), objects.transition_lifecycle (objects.lifecycle.transition — the new canonical
--                          version written IN SQL from the prior one through admit: expected version + idempotency key; the owner alone, or
--                          the profile's reviewer / approver; separation re-checked; an invalid, duplicated, out-of-order, stale, untyped or
--                          ownerless transition REJECTED and kept; a compensation restores the state before the last accepted transition and
--                          is kept as COMPENSATED), objects.propose_lifecycle (objects.lifecycle.propose), objects.decide_lifecycle_proposal
--                          (objects.lifecycle.proposal.decide). SECURITY DEFINER, eye_commit, the route's action asserted, the scope of the
--                          established context, the acting principal = eye_principal(), the human / role / separation checks in the port.
--   reads                  objects.lifecycle_profiles_read, objects.lifecycle_objects, objects.lifecycle_history, objects.lifecycle_replay
--                          (the state at an instant from the recorded versions, cross-checked with the ledger), objects.lifecycle_reconcile
--                          (every object of a profiled type whose module state and canonical record disagree, every work-object version
--                          written outside the ledger), objects.lifecycle_export / objects.lifecycle_verify_export (the history exported
--                          with every version's header and payload; re-imported, each digest recomputes and the replay is re-derived).
--   the measure            analytics.mc_v1_lifecycle_coverage (0113 §0.7 contract) registered as `v1_lifecycle_coverage` (V01-T-046).
--   the continuity contract  "lifecycle register unavailable" is DECLARED through B81's shell.degraded_contracts against the dependency that
--                          makes it unavailable — the authoritative audit journal (kind audit, key journal; a transition is refused fail-closed
--                          while the journal cannot record it) — listing objects.lifecycle.* unavailable and objects.lifecycle.read available.
--                          No shell definition changes (the act declares it; the harness proves the evaluation).
--   refusals               the class form `lifecycle transition rejected (<class>): …`, `lifecycle proposal rejected (<class>): …`,
--                          `work object rejected (<class>): …` — 403 actor|authority|separation_of_duties · 404 unknown_* · 409
--                          state|stale|duplicate · 422 the rest. NOTE (the integrator): the three nouns are not mapped centrally yet
--                          (observation-errors.ts); apps/api/src/objects/lifecycle/lifecycle.service.ts maps them meanwhile.
--
-- THREE CLAIMS: construction (this file, phase6-lifecycle-b50.test.ts — every persona, assessment and contract there SYNTHETIC); demonstrated
-- operation (the act: D. Ivanova's Red Sea assessment on eye_demo, SYNTHETIC); real acceptance (PR-06-006 / AT-06: the shared recording path
-- at B111, then R2) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §LC.0 THE VOCABULARY (ADR-006, DESIGN D4) ──────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'objects.canonical_objects'::regclass AND c.conname = 'canonical_objects_lifecycle_state_check') THEN
    RAISE EXCEPTION 'migration 0120 §LC: the 0006 lifecycle_state CHECK (canonical_objects_lifecycle_state_check) was not found';
  END IF;
END $$;
-- B50 lc: the 0006 CHECK copied whole and widened with ADR-006's five absent states (draft, reviewed, approved, published, retired).
ALTER TABLE objects.canonical_objects DROP CONSTRAINT canonical_objects_lifecycle_state_check;
ALTER TABLE objects.canonical_objects ADD CONSTRAINT canonical_objects_lifecycle_state_check CHECK (lifecycle_state IN
    ('proposed','admitted','active','disputed','corrected','withdrawn','superseded','archived','deleted',
     /* B50 lc */ 'draft','reviewed','approved','published','retired'));

/* The 0012 definition copied WHOLE; the one change is the lifecycle list (marked B50 lc). */
CREATE OR REPLACE FUNCTION objects.assert_header_semantics(p_header jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := p_header->>'scope';
  v_recorded timestamptz;
  v_vf timestamptz := NULLIF(p_header->>'valid_from','')::timestamptz;
  v_vt timestamptz := NULLIF(p_header->>'valid_to','')::timestamptz;
BEGIN
  IF v_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'header semantics: scope % is not a canonical scope', v_scope USING ERRCODE = '22023';
  END IF;
  IF (v_scope = 'PLATFORM' AND (p_header->>'tenant_id' IS NOT NULL OR p_header->>'domain_id' IS NOT NULL))
     OR (v_scope = 'TENANT' AND (p_header->>'tenant_id' IS NULL OR p_header->>'domain_id' IS NOT NULL))
     OR (v_scope = 'DOMAIN' AND (p_header->>'tenant_id' IS NULL OR p_header->>'domain_id' IS NULL)) THEN
    RAISE EXCEPTION 'header semantics: scope/identifier combination is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'object_type' !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'header semantics: object_type must be three uppercase letters' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'object_version' !~ '^[1-9][0-9]{0,17}$' THEN
    RAISE EXCEPTION 'header semantics: object_version must be a positive integer string' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'lifecycle_state' NOT IN
     ('proposed','admitted','active','disputed','corrected','withdrawn','superseded','archived','deleted',
      /* B50 lc */ 'draft','reviewed','approved','published','retired') THEN
    RAISE EXCEPTION 'header semantics: lifecycle_state % is not permitted', p_header->>'lifecycle_state'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'truth_state' NOT IN
     ('observed','asserted','extracted','inferred','assessed','synthetic','decided','disputed','withdrawn') THEN
    RAISE EXCEPTION 'header semantics: truth_state % is not canonical', p_header->>'truth_state'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'time_precision' NOT IN
     ('exact','second','minute','hour','day','part_of_month','month','quarter','year','approximate','unknown') THEN  -- B50 hd: the governed vocabulary (objects.time_precisions) — B50 integration: §LC's copy applies after §HD's, so it carries both changes
    RAISE EXCEPTION 'header semantics: time_precision % is not permitted', p_header->>'time_precision'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'source_clock_quality' NOT IN ('trusted','degraded','unknown') THEN
    RAISE EXCEPTION 'header semantics: source_clock_quality % is not permitted',
      p_header->>'source_clock_quality' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_header->'synthetic_state') <> 'boolean' THEN
    RAISE EXCEPTION 'header semantics: synthetic_state must be boolean' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'truth_state' = 'synthetic' AND (p_header->>'synthetic_state')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'header semantics: synthetic truth state requires synthetic_state' USING ERRCODE = '22023';
  END IF;
  -- Structured values must be objects (or null), never scalars smuggled in.
  IF jsonb_typeof(p_header->'confidence') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'uncertainty') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'quality_state') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'freshness_state') NOT IN ('object','null') THEN
    RAISE EXCEPTION 'header semantics: confidence/uncertainty/quality_state/freshness_state must be objects or null'
      USING ERRCODE = '22023';
  END IF;
  -- Reference arrays must be arrays of strings.
  IF jsonb_typeof(p_header->'evidence_refs') <> 'array'
     OR jsonb_typeof(p_header->'source_object_ids') <> 'array'
     OR jsonb_typeof(p_header->'contradiction_refs') <> 'array'
     OR jsonb_typeof(p_header->'corroboration_refs') <> 'array'
     OR jsonb_typeof(p_header->'human_refs') <> 'array' THEN
    RAISE EXCEPTION 'header semantics: reference fields must be arrays' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'schema_ref' !~ '^[A-Z]{3}@v[0-9]+$' THEN
    RAISE EXCEPTION 'header semantics: schema_ref % must be <TYPE>@v<N>', p_header->>'schema_ref'
      USING ERRCODE = '22023';
  END IF;
  IF left(p_header->>'schema_ref', 3) <> p_header->>'object_type' THEN
    RAISE EXCEPTION 'header semantics: schema_ref does not match object_type' USING ERRCODE = '22023';
  END IF;
  -- Temporal constraints.
  IF v_vt IS NOT NULL AND v_vf IS NULL THEN
    RAISE EXCEPTION 'header semantics: valid_to requires valid_from' USING ERRCODE = '22023';
  END IF;
  IF v_vt IS NOT NULL AND v_vf IS NOT NULL AND v_vt <= v_vf THEN
    RAISE EXCEPTION 'header semantics: valid_to must be after valid_from' USING ERRCODE = '22023';
  END IF;
  -- Authoritative recorded_at: present, parseable, and not from the future.
  BEGIN
    v_recorded := (p_header->>'recorded_at')::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'header semantics: recorded_at is not a valid instant' USING ERRCODE = '22023';
  END;
  IF v_recorded IS NULL THEN
    RAISE EXCEPTION 'header semantics: recorded_at is required' USING ERRCODE = '22023';
  END IF;
  IF v_recorded > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'header semantics: recorded_at is in the future' USING ERRCODE = '22023';
  END IF;
  IF (p_header->>'audit_correlation_id') IS NULL THEN
    RAISE EXCEPTION 'header semantics: audit_correlation_id is required' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_header->>'classification','') = '' OR coalesce(p_header->>'purpose_scope','') = ''
     OR coalesce(p_header->>'owning_component','') = '' OR coalesce(p_header->>'accountable_owner','') = '' THEN
    RAISE EXCEPTION 'header semantics: classification, purpose_scope, owning_component and accountable_owner are required'
      USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION objects.assert_header_semantics(jsonb) FROM PUBLIC;

/* The canonical lifecycle words (ADR-006's eight + the existing words they sit beside) — the profiles' maps name only these. */
CREATE OR REPLACE FUNCTION objects.lifecycle_canonical_states() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['draft', 'reviewed', 'approved', 'published', 'corrected', 'withdrawn', 'archived', 'retired',
               'proposed', 'admitted', 'active', 'disputed', 'superseded', 'deleted'] $$;
/* ADR-006's eight work-object states (b50-seams.ts WORK_OBJECT_STATES). */
CREATE OR REPLACE FUNCTION objects.work_object_states() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['draft', 'reviewed', 'approved', 'published', 'corrected', 'withdrawn', 'archived', 'retired'] $$;
/* The re-entry reasons a profile may declare (V03-T-021): a contradiction reopens resolution, a fitness failure invalidates, a policy change
   reopens a decision, a review finding returns a version to its author. */
CREATE OR REPLACE FUNCTION objects.lifecycle_reentry_reasons() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['contradiction', 'fitness_failure', 'policy_change', 'review_finding'] $$;
/* The refusal codes the ledger keeps (the class is what the HTTP answer reads; the code is what was wrong). */
CREATE OR REPLACE FUNCTION objects.lifecycle_refusal_codes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['module_owned', 'unknown_action', 'stale_version', 'invalid_transition', 'target_mismatch', 'untyped_reentry', 'out_of_order',
               'ownerless', 'not_human', 'not_owner', 'not_reviewer', 'not_approver', 'separation', 'changes_not_allowed', 'changes_invalid',
               'nothing_to_compensate', 'reason_required'] $$;
GRANT EXECUTE ON FUNCTION objects.lifecycle_canonical_states(), objects.work_object_states(), objects.lifecycle_reentry_reasons(), objects.lifecycle_refusal_codes() TO eye_app, eye_commit;

-- §LC.1 THE TABLES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE PROFILES (V04-T-006, CAP-AU-07): global (not tenant data), versioned, append-only, written by migrations only. */
CREATE TABLE objects.lifecycle_profiles (
  object_type     text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  version         int  NOT NULL CHECK (version >= 1),
  governance      text NOT NULL CHECK (governance IN ('work_object', 'module', 'canonical', 'revision')),
  owning_port     text NOT NULL CHECK (length(btrim(owning_port)) >= 4),
  schema_ref      text CHECK (schema_ref IS NULL OR schema_ref ~ '^[A-Z]{3}@v[0-9]+$'),
  states          text[] NOT NULL CHECK (cardinality(states) >= 1),
  canonical_map   jsonb NOT NULL CHECK (jsonb_typeof(canonical_map) = 'object'),
  consistent      jsonb NOT NULL CHECK (jsonb_typeof(consistent) = 'object'),
  transitions     jsonb NOT NULL CHECK (jsonb_typeof(transitions) = 'array'),
  reviewer_roles  text[] NOT NULL DEFAULT '{}',
  approver_roles  text[] NOT NULL DEFAULT '{}',
  module_read     text NOT NULL CHECK (length(btrim(module_read)) >= 4),
  description     text NOT NULL CHECK (length(btrim(description)) >= 16),
  declared_in     text NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (object_type, version),
  CONSTRAINT olp_work_object CHECK ((governance = 'work_object') = (owning_port = 'objects.transition_lifecycle')),
  CONSTRAINT olp_work_schema CHECK (governance <> 'work_object' OR schema_ref IS NOT NULL)
);
COMMENT ON TABLE objects.lifecycle_profiles IS 'B50 §LC (V04-T-006, CAP-AU-07, ADR-006): per canonical type, its lifecycle — states, the map to the canonical words, the reconciliation rule, the transition contracts and the owning port; versioned, append-only, written by migrations.';
CREATE TRIGGER olp_append_only BEFORE UPDATE OR DELETE ON objects.lifecycle_profiles FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE LEDGER (PR-06-002, PR-06-005, V03-T-021): every attempted transition of a work object, kept. */
CREATE TABLE objects.lifecycle_transitions (
  transition_id      uuid PRIMARY KEY,
  scope              text NOT NULL CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  object_type        text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  object_id          uuid NOT NULL,
  profile_version    int NOT NULL,
  action             text NOT NULL CHECK (action ~ '^[a-z][a-z_]{2,40}$'),
  kind               text NOT NULL CHECK (kind IN ('forward', 're_entry', 'compensation')),
  outcome            text NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'compensated')),
  from_state         text,
  to_state           text,
  expected_version   int,
  prior_version      int,                     -- the last authoritative version when the attempt was made (NULL only for the creation)
  new_version        int,                     -- the version the transition wrote (accepted / compensated); NULL when rejected
  attempted          jsonb NOT NULL CHECK (jsonb_typeof(attempted) = 'object'),
  refusal_class      text,
  refusal_code       text CHECK (refusal_code IS NULL OR refusal_code = ANY (objects.lifecycle_refusal_codes())),
  refusal_message    text,
  reason             text,
  reentry_reason     text CHECK (reentry_reason IS NULL OR reentry_reason = ANY (objects.lifecycle_reentry_reasons())),
  causation_id       uuid,
  correlation_ref    text CHECK (correlation_ref IS NULL OR length(correlation_ref) BETWEEN 1 AND 200),
  compensates        uuid REFERENCES objects.lifecycle_transitions (transition_id),
  proposal_id        uuid,
  actor_principal_id uuid NOT NULL,
  actor_class        text CHECK (actor_class IS NULL OR actor_class IN ('owner', 'reviewer', 'approver', 'author')),
  policy_decision_id uuid,
  bundle_version     text,
  idempotency_key    text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  command_digest     text NOT NULL CHECK (command_digest ~ '^[0-9a-f]{64}$'),
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT olt_key UNIQUE (tenant_id, domain_id, idempotency_key),
  CONSTRAINT olt_outcome CHECK ((outcome = 'rejected') = (new_version IS NULL) AND (outcome = 'rejected') = (refusal_class IS NOT NULL)
                                AND (outcome = 'rejected') = (refusal_code IS NOT NULL)),
  CONSTRAINT olt_compensation CHECK ((outcome = 'compensated') = (kind = 'compensation' AND compensates IS NOT NULL) OR outcome = 'rejected'),
  CONSTRAINT olt_reentry CHECK (outcome = 'rejected' OR kind <> 're_entry' OR (reentry_reason IS NOT NULL AND causation_id IS NOT NULL)),
  CONSTRAINT olt_versions CHECK (new_version IS NULL OR new_version = coalesce(prior_version, 0) + 1)
);
COMMENT ON TABLE objects.lifecycle_transitions IS 'B50 §LC (PR-06-002/005, V03-T-021): every attempted lifecycle transition of a work object — accepted, rejected or compensated — with the attempted command, the last authoritative version, the causation, correlation and policy context; append-only.';
CREATE UNIQUE INDEX olt_version ON objects.lifecycle_transitions (object_id, new_version) WHERE new_version IS NOT NULL;
CREATE INDEX olt_object ON objects.lifecycle_transitions (object_id, recorded_at);
CREATE INDEX olt_scope ON objects.lifecycle_transitions (tenant_id, domain_id, recorded_at);
CREATE TRIGGER olt_append_only BEFORE UPDATE OR DELETE ON objects.lifecycle_transitions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE PROPOSALS (PR-06-003): views, agents, models, imports and projections propose; the owner decides. */
CREATE TABLE objects.lifecycle_proposals (
  proposal_id           uuid PRIMARY KEY,
  scope                 text NOT NULL CHECK (scope = 'DOMAIN'),
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  object_type           text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  object_id             uuid NOT NULL,
  base_version          int NOT NULL CHECK (base_version >= 1),
  action                text NOT NULL CHECK (action ~ '^[a-z][a-z_]{2,40}$'),
  to_state              text NOT NULL,
  proposer_principal_id uuid NOT NULL,
  proposer_kind         text NOT NULL CHECK (proposer_kind IN ('human', 'agent', 'workload')),
  via                   text NOT NULL CHECK (via IN ('view', 'agent', 'model', 'import', 'projection')),
  reason                text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  reentry_reason        text CHECK (reentry_reason IS NULL OR reentry_reason = ANY (objects.lifecycle_reentry_reasons())),
  causation_id          uuid,
  request_id            uuid NOT NULL UNIQUE,
  proposed_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL
);
COMMENT ON TABLE objects.lifecycle_proposals IS 'B50 §LC (PR-06-003): a lifecycle transition PROPOSED by a view, an agent, a model, an import or a projection — never authoritative; the accountable owner decides; append-only.';
CREATE INDEX olpr_object ON objects.lifecycle_proposals (object_id, proposed_at);
CREATE TRIGGER olpr_append_only BEFORE UPDATE OR DELETE ON objects.lifecycle_proposals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE objects.lifecycle_proposal_decisions (
  proposal_id        uuid PRIMARY KEY REFERENCES objects.lifecycle_proposals (proposal_id),
  scope              text NOT NULL CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  decision           text NOT NULL CHECK (decision IN ('accepted', 'declined')),
  reason             text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  transition_id      uuid REFERENCES objects.lifecycle_transitions (transition_id),
  decided_by         uuid NOT NULL,
  decided_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id         uuid NOT NULL UNIQUE,
  correlation_id     uuid NOT NULL,
  CONSTRAINT olpd_transition CHECK ((decision = 'accepted') = (transition_id IS NOT NULL))
);
COMMENT ON TABLE objects.lifecycle_proposal_decisions IS 'B50 §LC (PR-06-003): the owner''s decision on a lifecycle proposal — accepted (with the transition it performed) or declined (with why); append-only.';
CREATE TRIGGER olpd_append_only BEFORE UPDATE OR DELETE ON objects.lifecycle_proposal_decisions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* RLS: a domain's rows within its tenant (and, for a DOMAIN context, its domain); the profiles to every bound principal. No write grant. */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lifecycle_transitions', 'lifecycle_proposals', 'lifecycle_proposal_decisions'] LOOP
    EXECUTE format('ALTER TABLE objects.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE objects.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY olc_visible ON objects.%I FOR SELECT TO eye_app, eye_commit USING (
        tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON objects.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
ALTER TABLE objects.lifecycle_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects.lifecycle_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY olp_visible ON objects.lifecycle_profiles FOR SELECT TO eye_app, eye_commit USING (public.eye_principal() IS NOT NULL);
GRANT SELECT ON objects.lifecycle_profiles TO eye_app, eye_commit;

/* THE CURRENT STATE per work object (PR-06-002): the latest transition that wrote a version. INVOKER: the ledger's RLS applies. */
CREATE OR REPLACE VIEW objects.lifecycle_current WITH (security_invoker = true) AS
  SELECT DISTINCT ON (t.object_id) t.tenant_id, t.domain_id, t.object_type, t.object_id, t.to_state AS state, t.new_version AS version,
         t.transition_id, t.action, t.kind, t.outcome, t.actor_principal_id, t.recorded_at
    FROM objects.lifecycle_transitions t
   WHERE t.outcome IN ('accepted', 'compensated')
   ORDER BY t.object_id, t.new_version DESC;
GRANT SELECT ON objects.lifecycle_current TO eye_app, eye_commit;

-- §LC.2 THE PROFILES (V04-T-006: every type's lifecycle declared; RSK and MEM exist — the row's "absent" was stale) ──────────────────────
/* The work-object form of an assessment (DESIGN D5): authored by a person, reviewed, approved, published, corrected, retired. ASM@v1/v2
   (the extraction and import forms) keep their own path (intelligence.claim.admit, retention.import.admit). */
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES ('ASM', 'v3', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["form", "title", "statement", "body", "act"],
  "properties": {
    "form": { "const": "work_object" },
    "title": { "type": "string", "minLength": 8, "maxLength": 300 },
    "statement": { "type": "string", "minLength": 16, "maxLength": 8000 },
    "body": { "type": "object" },
    "review": { "type": ["object", "null"] },
    "approval": { "type": ["object", "null"] },
    "act": {
      "type": "object",
      "required": ["action", "by", "at"],
      "properties": { "action": { "type": "string" }, "by": { "type": "string" }, "at": { "type": "string" }, "reason": { "type": ["string", "null"] },
                      "transition_id": { "type": ["string", "null"] }, "kind": { "type": "string" } }
    }
  }
}'::jsonb, 'breaking');

INSERT INTO objects.lifecycle_profiles (object_type, version, governance, owning_port, schema_ref, states, canonical_map, consistent, transitions, reviewer_roles, approver_roles, module_read, description, declared_in) VALUES
  ('ASM', 1, 'work_object', 'objects.transition_lifecycle', 'ASM@v3',
   ARRAY['draft', 'reviewed', 'approved', 'published', 'corrected', 'superseded', 'withdrawn', 'archived', 'retired'],
   '{"draft":"draft","reviewed":"reviewed","approved":"approved","published":"published","corrected":"corrected","superseded":"superseded","withdrawn":"withdrawn","archived":"archived","retired":"retired"}',
   '{"draft":["draft"],"reviewed":["reviewed"],"approved":["approved"],"published":["published"],"corrected":["corrected"],"superseded":["superseded"],"withdrawn":["withdrawn"],"archived":["archived"],"retired":["retired"]}',
   '[{"action":"review","from":["draft"],"to":"reviewed","actor":"reviewer","kind":"forward","separation":["author"],"reason":"findings"},
     {"action":"approve","from":["reviewed"],"to":"approved","actor":"approver","kind":"forward","separation":["author","reviewer"],"reason":"rationale"},
     {"action":"publish","from":["reviewed","approved"],"to":"published","actor":"owner","kind":"forward","separation":[]},
     {"action":"correct","from":["published","corrected"],"to":"corrected","actor":"owner","kind":"forward","separation":[],"changes":true,"reason":"what changed and why"},
     {"action":"supersede","from":["published","corrected"],"to":"superseded","actor":"owner","kind":"forward","separation":[],"reason":"what supersedes it"},
     {"action":"withdraw","from":["reviewed","approved","published","corrected"],"to":"withdrawn","actor":"owner","kind":"forward","separation":[],"reason":"why it is withdrawn"},
     {"action":"archive","from":["published","corrected","superseded"],"to":"archived","actor":"owner","kind":"forward","separation":[]},
     {"action":"retire","from":["published","corrected","superseded","archived"],"to":"retired","actor":"owner","kind":"forward","separation":[],"reason":"why it is retired"},
     {"action":"reopen","from":["reviewed","approved","published","corrected"],"to":"draft","actor":"owner","kind":"re_entry","separation":[],"reentry_reasons":["contradiction","fitness_failure","policy_change","review_finding"],"reason":"what reopened it"},
     {"action":"compensate","from":["*"],"to":"*","actor":"owner","kind":"compensation","separation":[],"reason":"why the last transition is undone"}]',
   ARRAY['knowledge_owner', 'domain_analyst', 'domain_specialist', 'record_authority'], ARRAY['knowledge_owner', 'record_authority', 'decision_approver'],
   'objects.lifecycle_transitions (the ledger) and the canonical versions it wrote',
   'The person-authored assessment (DESIGN D5): one work-object state machine — authored as a draft by its owner, reviewed by another person, optionally approved by a third, published, corrected, superseded, archived or retired by its owner, withdrawn (terminal: MET-008''s rule — a withdrawn record changes only by a correction); a return to draft only as a typed re-entry', '0120 §LC'),
  ('SRC', 1, 'module', 'observation.transition_contract', NULL,
   ARRAY['draft', 'approved', 'active', 'suspended', 'retired', 'superseded'],
   '{"draft":"draft","approved":"approved","active":"published","suspended":"withdrawn","retired":"retired","superseded":"superseded"}',
   '{"draft":["admitted"],"approved":["admitted"],"active":["admitted"],"suspended":["admitted"],"retired":["admitted"],"superseded":["admitted"]}',
   '[{"action":"approve","from":["draft"],"to":"approved","actor":"approver","kind":"forward","separation":["author"],"roles":["collection_manager"]},
     {"action":"activate","from":["approved","suspended"],"to":"active","actor":"approver","kind":"forward","separation":[],"roles":["collection_manager"]},
     {"action":"suspend","from":["active"],"to":"suspended","actor":"owner","kind":"forward","separation":[],"roles":["collection_manager"]},
     {"action":"retire","from":["approved","active","suspended"],"to":"retired","actor":"owner","kind":"forward","separation":[],"roles":["collection_manager"]},
     {"action":"supersede","from":["draft","approved","active","suspended"],"to":"superseded","actor":"owner","kind":"forward","separation":[],"roles":["collection_manager"]}]',
   '{}', ARRAY['collection_manager'], 'observation.source_contracts_current.lifecycle_state (the SRC canonical object is the immutable contract record: admitted)',
   'A source contract: draft → approved → active → suspended → retired (or superseded by a new contract version) — the collection service''s port; the canonical SRC object is the contract''s immutable record', '0120 §LC'),
  ('RSK', 1, 'module', 'prediction.exposure.*', NULL,
   ARRAY['identified', 'assessed', 'accepted', 'contested', 'sponsored', 'closed'],
   '{"identified":"draft","assessed":"reviewed","accepted":"approved","contested":"reviewed","sponsored":"published","closed":"retired"}',
   '{"identified":["active"],"assessed":["active"],"accepted":["active"],"contested":["active"],"sponsored":["active"],"closed":["active","archived"]}',
   '[{"action":"assess","from":["identified","contested"],"to":"assessed","actor":"owner","kind":"forward","separation":[],"roles":["risk_owner"]},
     {"action":"accept","from":["assessed"],"to":"accepted","actor":"approver","kind":"forward","separation":["author"],"roles":["risk_owner"]},
     {"action":"contest","from":["assessed","accepted"],"to":"contested","actor":"reviewer","kind":"re_entry","separation":[],"reentry_reasons":["contradiction"]},
     {"action":"sponsor","from":["accepted"],"to":"sponsored","actor":"approver","kind":"forward","separation":[],"roles":["opportunity_sponsor"]},
     {"action":"close","from":["assessed","accepted","sponsored"],"to":"closed","actor":"owner","kind":"forward","separation":[],"roles":["risk_owner"]}]',
   '{}', ARRAY['risk_owner'], 'prediction.exposure_current.state',
   'An exposure (risk or opportunity): identified → assessed → accepted → sponsored → closed, a contest returning it to review — the exposure service''s port', '0120 §LC'),
  ('MEM', 1, 'module', 'memory.item.*', NULL,
   ARRAY['active', 'withdrawn'],
   '{"active":"published","withdrawn":"withdrawn"}',
   '{"active":["active"],"withdrawn":["active","withdrawn"]}',
   '[{"action":"record","from":[],"to":"active","actor":"owner","kind":"forward","separation":[],"roles":["knowledge_owner"]},
     {"action":"supersede","from":["active"],"to":"active","actor":"owner","kind":"forward","separation":[],"roles":["record_authority"]},
     {"action":"withdraw","from":["active"],"to":"withdrawn","actor":"owner","kind":"forward","separation":[],"roles":["record_authority"]}]',
   '{}', '{}', 'memory.items_current.state (each version a canonical MEM object; a superseded version stays replayable)',
   'A memory item: recorded, superseded by a new version (the prior replayable), withdrawn — the memory service''s ports', '0120 §LC'),
  ('FCT', 1, 'module', 'prediction.forecast.*', NULL,
   ARRAY['issued', 'superseded', 'resolved', 'withdrawn'],
   '{"issued":"published","superseded":"superseded","resolved":"archived","withdrawn":"withdrawn"}',
   '{"issued":["active"],"superseded":["active","superseded"],"resolved":["active","archived"],"withdrawn":["active","withdrawn"]}',
   '[{"action":"issue","from":[],"to":"issued","actor":"owner","kind":"forward","separation":[],"roles":["forecast_owner"]},
     {"action":"supersede","from":["issued"],"to":"superseded","actor":"owner","kind":"forward","separation":[],"roles":["forecast_owner"]},
     {"action":"resolve","from":["issued","superseded"],"to":"resolved","actor":"owner","kind":"forward","separation":[],"roles":["forecast_owner"]},
     {"action":"withdraw","from":["issued","superseded"],"to":"withdrawn","actor":"owner","kind":"forward","separation":[],"roles":["forecast_owner"]}]',
   '{}', '{}', 'prediction.forecasts_current.state', 'A forecast: issued, superseded by a revision, resolved against its outcome, withdrawn — the forecasting service''s ports', '0120 §LC'),
  ('WRN', 1, 'module', 'prediction.warning.*', NULL,
   ARRAY['raised', 'acknowledged', 'expired', 'closed'],
   '{"raised":"published","acknowledged":"published","expired":"retired","closed":"withdrawn"}',
   '{"raised":["active"],"acknowledged":["active"],"expired":["active"],"closed":["active","withdrawn"]}',
   '[{"action":"raise","from":[],"to":"raised","actor":"owner","kind":"forward","separation":[]},
     {"action":"acknowledge","from":["raised"],"to":"acknowledged","actor":"reviewer","kind":"forward","separation":[]},
     {"action":"expire","from":["raised"],"to":"expired","actor":"owner","kind":"forward","separation":[]},
     {"action":"close","from":["raised","acknowledged"],"to":"closed","actor":"owner","kind":"forward","separation":[]}]',
   '{}', '{}', 'prediction.warnings_current.state', 'A warning: raised, acknowledged (a response, not an approval), expired unanswered, closed — the warning service''s ports', '0120 §LC'),
  ('PUB', 1, 'module', 'executive.publication.*', NULL,
   ARRAY['drafted', 'approved', 'delivered', 'corrected', 'withdrawn', 'archived'],
   '{"drafted":"draft","approved":"approved","delivered":"published","corrected":"corrected","withdrawn":"withdrawn","archived":"archived"}',
   '{"drafted":["active"],"approved":["active"],"delivered":["active"],"corrected":["active"],"withdrawn":["active","withdrawn"],"archived":["archived"]}',
   '[{"action":"approve","from":["drafted"],"to":"approved","actor":"approver","kind":"forward","separation":["author"]},
     {"action":"deliver","from":["approved"],"to":"delivered","actor":"owner","kind":"forward","separation":[]},
     {"action":"correct","from":["delivered"],"to":"corrected","actor":"owner","kind":"forward","separation":[]},
     {"action":"withdraw","from":["approved","delivered","corrected"],"to":"withdrawn","actor":"owner","kind":"forward","separation":[]},
     {"action":"archive","from":["delivered","corrected","withdrawn"],"to":"archived","actor":"owner","kind":"forward","separation":[]}]',
   '{}', '{}', 'executive.publications.state', 'A publication: drafted, approved on its exact bytes, delivered, corrected, withdrawn, archived — the publishing service''s ports', '0120 §LC'),
  ('DPK', 1, 'module', 'decision.package.*', NULL,
   ARRAY['draft', 'proposed', 'under_review', 'approved', 'committed', 'monitoring', 'closed', 'rejected', 'withdrawn', 'reopened'],
   '{"draft":"draft","proposed":"proposed","under_review":"reviewed","approved":"approved","committed":"published","monitoring":"published","closed":"archived","rejected":"withdrawn","withdrawn":"withdrawn","reopened":"draft"}',
   '{"draft":["active"],"proposed":["active"],"under_review":["active"],"approved":["active"],"committed":["active"],"monitoring":["active"],"closed":["active","archived"],"rejected":["active","withdrawn"],"withdrawn":["active","withdrawn"],"reopened":["active"]}',
   '[{"action":"propose","from":["draft","reopened"],"to":"proposed","actor":"owner","kind":"forward","separation":[]},
     {"action":"review","from":["proposed"],"to":"under_review","actor":"reviewer","kind":"forward","separation":["author"]},
     {"action":"approve","from":["under_review"],"to":"approved","actor":"approver","kind":"forward","separation":["author"],"roles":["decision_approver"]},
     {"action":"commit","from":["approved"],"to":"committed","actor":"approver","kind":"forward","separation":[],"roles":["decision_authority"]},
     {"action":"reopen","from":["committed","monitoring"],"to":"reopened","actor":"owner","kind":"re_entry","separation":[],"reentry_reasons":["policy_change","contradiction"],"roles":["decision_owner"]},
     {"action":"close","from":["committed","monitoring"],"to":"closed","actor":"owner","kind":"forward","separation":[]}]',
   ARRAY['domain_analyst'], ARRAY['decision_approver', 'decision_authority'], 'decision.packages_current.state',
   'A decision package: drafted, proposed, reviewed, approved, committed, monitored, closed — a policy change reopening it (decision.reopen_package) — the decision service''s ports', '0120 §LC'),
  ('BRF', 1, 'module', 'briefing.compose', NULL,
   ARRAY['composed'], '{"composed":"published"}', '{"composed":["active"]}',
   '[{"action":"compose","from":[],"to":"composed","actor":"owner","kind":"forward","separation":[]}]',
   '{}', '{}', 'executive.briefings (an immutable snapshot; a later briefing supersedes it)', 'A briefing: an immutable snapshot of what is known, superseded by a later composition — the briefing port', '0120 §LC'),
  ('CLM', 1, 'canonical', 'intelligence.claim.admit / intelligence.review.decide', NULL,
   ARRAY['admitted', 'active', 'corrected', 'withdrawn', 'superseded'],
   '{"admitted":"admitted","active":"published","corrected":"corrected","withdrawn":"withdrawn","superseded":"superseded"}',
   '{"admitted":["admitted"],"active":["active"],"corrected":["corrected"],"withdrawn":["withdrawn"],"superseded":["superseded"]}',
   '[{"action":"admit","from":[],"to":"active","actor":"owner","kind":"forward","separation":[]},
     {"action":"correct","from":["active","corrected"],"to":"corrected","actor":"reviewer","kind":"forward","separation":[]},
     {"action":"withdraw","from":["active","corrected"],"to":"withdrawn","actor":"reviewer","kind":"forward","separation":[]}]',
   ARRAY['extraction_manager', 'domain_analyst'], '{}', 'objects.canonical_objects.lifecycle_state (the canonical record is the lifecycle)',
   'A claim: admitted by extraction, corrected or withdrawn by review — the extraction and review ports; the canonical record carries the state', '0120 §LC'),
  ('EVD', 1, 'canonical', 'observation.item.admit / observation.correction.apply', NULL,
   ARRAY['admitted', 'corrected', 'withdrawn'],
   '{"admitted":"admitted","corrected":"corrected","withdrawn":"withdrawn"}',
   '{"admitted":["admitted"],"corrected":["corrected"],"withdrawn":["withdrawn"]}',
   '[{"action":"admit","from":[],"to":"admitted","actor":"owner","kind":"forward","separation":[]},
     {"action":"correct","from":["admitted","corrected"],"to":"corrected","actor":"approver","kind":"forward","separation":[],"roles":["collection_manager","executive"]},
     {"action":"withdraw","from":["admitted","corrected"],"to":"withdrawn","actor":"approver","kind":"forward","separation":[],"roles":["collection_manager","executive"]}]',
   '{}', ARRAY['collection_manager', 'executive'], 'objects.canonical_objects.lifecycle_state (the canonical record is the lifecycle)',
   'Evidence: admitted by collection, corrected or withdrawn by a correction case (a new version; nothing overwritten) — the observation ports', '0120 §LC'),
  ('GRV', 1, 'revision', 'graph.revisions (graph.apply_revision)', NULL,
   ARRAY['committed'], '{"committed":"published"}', '{"committed":[]}',
   '[{"action":"revise","from":[],"to":"committed","actor":"owner","kind":"forward","separation":[]}]',
   '{}', '{}', 'graph.revisions (an atomic multi-object revision: expected revision + idempotency key, one step of the head)',
   'A graph revision: committed atomically with its expected revision and idempotency key — no canonical object; B51 owns the atomic multi-object revisions', '0120 §LC');

DO $$
DECLARE p record; t jsonb; s text;
BEGIN
  FOR p IN SELECT * FROM objects.lifecycle_profiles LOOP
    FOREACH s IN ARRAY p.states LOOP
      IF NOT (p.canonical_map ? s) OR NOT ((p.canonical_map ->> s) = ANY (objects.lifecycle_canonical_states())) THEN
        RAISE EXCEPTION 'migration 0120 §LC: profile %@% maps its state % to no canonical word', p.object_type, p.version, s;
      END IF;
      IF NOT (p.consistent ? s) THEN RAISE EXCEPTION 'migration 0120 §LC: profile %@% states no reconciliation rule for %', p.object_type, p.version, s; END IF;
    END LOOP;
    FOR t IN SELECT * FROM jsonb_array_elements(p.transitions) LOOP
      IF coalesce(t ->> 'actor', '') NOT IN ('owner', 'reviewer', 'approver') OR coalesce(t ->> 'kind', '') NOT IN ('forward', 're_entry', 'compensation') THEN
        RAISE EXCEPTION 'migration 0120 §LC: profile %@% transition % has no actor class or kind', p.object_type, p.version, t ->> 'action';
      END IF;
      IF t ->> 'kind' = 're_entry' AND jsonb_array_length(coalesce(t -> 'reentry_reasons', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'migration 0120 §LC: profile %@% re-entry % declares no reason', p.object_type, p.version, t ->> 'action';
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM objects.lifecycle_profiles) <> 12 THEN RAISE EXCEPTION 'migration 0120 §LC: expected 12 lifecycle profiles'; END IF;
END $$;

-- §LC.3 THE WRITE ACTIONS (DESIGN D5): the work object is written by its own actions — never by the generic ones ──────────────────────────
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('objects.work_object.author', ARRAY['ASM'], 'B50 §LC (DESIGN D5): a named person authors a work object (the assessment, ASM@v3) as a draft, version 1, its accountable owner; nothing else is admitted'),
  ('objects.lifecycle.transition', ARRAY['ASM'], 'B50 §LC (PR-06-001/003/005): a work object''s next version written by its lifecycle transition from the prior one — the owner (or the profile''s reviewer / approver), the expected version, the idempotency key'),
  ('objects.lifecycle.proposal.decide', ARRAY['ASM'], 'B50 §LC (PR-06-003): the owner''s acceptance of a proposed lifecycle transition performs it — the same rules as objects.lifecycle.transition');
INSERT INTO observation.canonical_write_exclusions (action, object_type, rationale) VALUES
  ('objects.create',  'ASM', 'B50 §LC: an assessment is authored through objects.work_object.author (the work object) or admitted by extraction (intelligence.claim.admit) — never through the generic create'),
  ('objects.correct', 'ASM', 'B50 §LC: an assessment changes through its lifecycle (objects.lifecycle.transition: correct) or its review (intelligence.review.decide) — never through the generic correct')
ON CONFLICT (action, object_type) DO NOTHING;

-- §LC.4 THE SHARED HELPERS (internal; no runtime grant) ──────────────────────────────────────────────────────────────────────────────────
/* An instant as the TS header rebuild writes it (Date.toISOString: UTC, milliseconds) — the stored row must rebuild to the digest. */
CREATE OR REPLACE FUNCTION objects._lc_iso(p timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END $$;
REVOKE ALL ON FUNCTION objects._lc_iso(timestamptz) FROM PUBLIC;

/* The 43-field header of a stored version, exactly as apps/api/src/objects/objects.service.ts rebuildHeaderFromRow rebuilds it. */
CREATE OR REPLACE FUNCTION objects._lc_header(r objects.canonical_objects) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'object_id', r.object_id, 'object_type', r.object_type, 'tenant_id', r.tenant_id, 'domain_id', r.domain_id, 'scope', r.scope,
    'object_version', r.object_version::text, 'lifecycle_state', r.lifecycle_state, 'owning_component', r.owning_component,
    'accountable_owner', r.accountable_owner, 'source_object_ids', r.source_object_ids,
    'event_time', objects._lc_iso(r.event_time), 'observation_time', objects._lc_iso(r.observation_time), 'valid_from', objects._lc_iso(r.valid_from),
    'valid_to', objects._lc_iso(r.valid_to), 'recorded_at', objects._lc_iso(r.recorded_at), 'time_precision', r.time_precision,
    'source_clock_quality', r.source_clock_quality, 'truth_state', r.truth_state, 'synthetic_state', r.synthetic_state,
    'confidence', CASE WHEN r.confidence IS NULL OR jsonb_typeof(r.confidence) = 'null' THEN 'null'::jsonb ELSE r.confidence END,
    'uncertainty', CASE WHEN r.uncertainty IS NULL OR jsonb_typeof(r.uncertainty) = 'null' THEN 'null'::jsonb ELSE r.uncertainty END,
    'evidence_refs', r.evidence_refs, 'provenance_ref', r.provenance_ref, 'method_ref', r.method_ref, 'contradiction_refs', r.contradiction_refs,
    'corroboration_refs', r.corroboration_refs, 'human_refs', r.human_refs, 'classification', r.classification, 'purpose_scope', r.purpose_scope,
    'rights_profile', r.rights_profile, 'residency_profile', r.residency_profile, 'retention_profile', r.retention_profile,
    'access_policy_ref', r.access_policy_ref, 'quality_profile', r.quality_profile,
    'quality_state', CASE WHEN r.quality_state IS NULL OR jsonb_typeof(r.quality_state) = 'null' THEN 'null'::jsonb ELSE r.quality_state END,
    'freshness_state', CASE WHEN r.freshness_state IS NULL OR jsonb_typeof(r.freshness_state) = 'null' THEN 'null'::jsonb ELSE r.freshness_state END,
    'schema_ref', r.schema_ref, 'ontology_ref', r.ontology_ref, 'correction_of', r.correction_of, 'supersedes', r.supersedes,
    'withdrawal_reason', r.withdrawal_reason, 'audit_correlation_id', r.audit_correlation_id, 'content_ref', r.content_ref)
$$;
REVOKE ALL ON FUNCTION objects._lc_header(objects.canonical_objects) FROM PUBLIC;

/* The owner named by an accountable_owner (`principal:<uuid>`) when it is an ACTIVE HUMAN; NULL otherwise (the object is then ownerless). */
CREATE OR REPLACE FUNCTION objects._lc_owner(p_owner text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  IF p_owner IS NULL OR p_owner !~* '^principal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
  v := substr(p_owner, 11)::uuid;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v AND p.kind = 'human' AND p.status = 'active') THEN RETURN NULL; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION objects._lc_owner(text) FROM PUBLIC;

/* The latest profile of a type (NULL row when none). */
CREATE OR REPLACE FUNCTION objects._lc_profile(p_type text) RETURNS objects.lifecycle_profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT p.* FROM objects.lifecycle_profiles p WHERE p.object_type = p_type ORDER BY p.version DESC LIMIT 1 $$;
REVOKE ALL ON FUNCTION objects._lc_profile(text) FROM PUBLIC;

/* A transition's answer (b50-seams.ts TransitionOutcome, snake-case). */
CREATE OR REPLACE FUNCTION objects._lc_outcome(t objects.lifecycle_transitions, p_repeated boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('transition_id', t.transition_id, 'outcome', t.outcome, 'object_type', t.object_type, 'object_id', t.object_id,
    'action', t.action, 'kind', t.kind, 'from', t.from_state, 'to', t.to_state, 'object_version', t.new_version,
    'last_authoritative_version', coalesce(t.new_version, t.prior_version), 'attempted_action', t.action, 'attempted', t.attempted,
    'refusal', CASE WHEN t.refusal_class IS NULL THEN NULL ELSE jsonb_build_object('class', t.refusal_class, 'code', t.refusal_code, 'message', t.refusal_message) END,
    'repeated', p_repeated, 'recorded_at', t.recorded_at, 'causation_id', t.causation_id, 'reentry_reason', t.reentry_reason, 'compensates', t.compensates,
    'proposal_id', t.proposal_id, 'actor_principal_id', t.actor_principal_id, 'actor_class', t.actor_class)
$$;
REVOKE ALL ON FUNCTION objects._lc_outcome(objects.lifecycle_transitions, boolean) FROM PUBLIC;

/* The acting principal: the bound principal, never another (a forged call fails loudly; nothing is recorded under another's name). */
CREATE OR REPLACE FUNCTION objects._lc_actor(p_noun text, p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION '% rejected (actor): no principal is bound to this context', p_noun USING ERRCODE = '42501'; END IF;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal, never on behalf of another', p_noun USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION objects._lc_actor(text, uuid) FROM PUBLIC;

/* The work object's payload validated in the port (ASM@v3's shape; TS validates nothing here — the port is the boundary). */
CREATE OR REPLACE FUNCTION objects._lc_content_problem(p_title text, p_statement text, p_body jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 8 AND 300 THEN 'the title says what is assessed in 8 to 300 characters'
    WHEN p_statement IS NULL OR length(btrim(p_statement)) NOT BETWEEN 16 AND 8000 THEN 'the statement is the assessment itself, 16 to 8000 characters'
    WHEN p_body IS NULL OR jsonb_typeof(p_body) <> 'object' THEN 'the body is an object of named sections'
    WHEN length(p_body::text) > 60000 THEN 'the body is at most 60000 characters'
  END $$;
REVOKE ALL ON FUNCTION objects._lc_content_problem(text, text, jsonb) FROM PUBLIC;

/* Write a version: the header and payload digest-bound exactly as admit recomputes it. Returns the digest. */
CREATE OR REPLACE FUNCTION objects._lc_admit(p_header jsonb, p_payload jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, canon, pg_catalog, pg_temp AS $$
DECLARE
  h jsonb := p_header; t text := p_header ->> 'object_type'; f text; v_qp text; v_digest text;
BEGIN
  /* B50 integration (§HD × §LC): a version admitted after B50 STATES the fields B50 states (objects._header_usable refuses one that does not).
     A lifecycle version is built from its prior one, which may predate B50 — so what the prior left empty is stated here, by the same rules
     as §HD's builder (src/objects/header-builder.ts): a declared absence for confidence / uncertainty / quality, freshness not applicable (a
     transition restates the object; its age is its record time), ontology:none until B51, the type's header profile, provenance by reference. */
  FOREACH f IN ARRAY ARRAY['confidence', 'uncertainty', 'quality_state'] LOOP
    IF h -> f IS NULL OR jsonb_typeof(h -> f) = 'null' THEN
      h := jsonb_set(h, ARRAY[f], jsonb_build_object('state', 'not_assessed', 'reason', format('the governed lifecycle (B50 §LC) does not assess %s for %s', f, t)));
    END IF;
  END LOOP;
  IF h -> 'freshness_state' IS NULL OR jsonb_typeof(h -> 'freshness_state') = 'null' THEN
    h := jsonb_set(h, '{freshness_state}', jsonb_build_object('state', 'not_applicable', 'reason', 'a lifecycle transition restates the object; its age is its record time'));
  END IF;
  IF h -> 'ontology_ref' IS NULL OR jsonb_typeof(h -> 'ontology_ref') = 'null' THEN h := jsonb_set(h, '{ontology_ref}', to_jsonb('ontology:none'::text)); END IF;
  IF h -> 'quality_profile' IS NULL OR jsonb_typeof(h -> 'quality_profile') = 'null' THEN
    SELECT 'quality:' || p.object_type || '@' || p.profile_version INTO v_qp FROM objects.header_profiles p WHERE p.object_type = t AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1;
    IF v_qp IS NOT NULL THEN h := jsonb_set(h, '{quality_profile}', to_jsonb(v_qp)); END IF;
  END IF;
  IF h -> 'provenance_ref' IS NULL OR jsonb_typeof(h -> 'provenance_ref') = 'null' THEN
    h := jsonb_set(h, '{provenance_ref}', to_jsonb('none:the version''s provenance is its prior version and the recorded lifecycle transition'::text));
  END IF;
  /* end B50 integration */
  v_digest := canon.sha256_hex(canon.jcs(jsonb_build_object('header', h, 'payload', p_payload)));
  -- today's admit path (DESIGN D2: §HD's re-declared admit writes its side ledgers in the same transaction — the swap point is HERE).
  PERFORM objects.admit_version(h, p_payload, v_digest);
  RETURN v_digest;
END $$;
REVOKE ALL ON FUNCTION objects._lc_admit(jsonb, jsonb) FROM PUBLIC;

-- §LC.5 AUTHORING THE WORK OBJECT (DESIGN D5, PR-06-001) ─────────────────────────────────────────────────────────────────────────────────
/* A named person authors a work object as a DRAFT, version 1: its accountable owner is the author. The request's idempotency key replayed
   by the same person with the same command answers the recorded object (no second object); with a different command it is refused. */
CREATE OR REPLACE FUNCTION objects.author_work_object(p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_title text, p_statement text,
  p_body jsonb, p_evidence_refs jsonb, p_classification text, p_purpose_scope text, p_synthetic boolean, p_idempotency_key text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_actor uuid; p objects.lifecycle_profiles%ROWTYPE; v_problem text; v_cmd text; x objects.lifecycle_transitions%ROWTYPE;
  v_now timestamptz := date_trunc('milliseconds', clock_timestamp()); v_header jsonb; v_payload jsonb; v_id uuid := gen_random_uuid(); v_refs jsonb := coalesce(p_evidence_refs, '[]'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.work_object.author']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := objects._lc_actor('work object', p_actor);
  IF onboarding.principal_kind(v_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'work object rejected (actor): authoring a work object is a named person''s act; an agent proposes, never authors' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'work object rejected (idempotency): the request carries an idempotency key of 8 to 200 characters (a retry reuses it)' USING ERRCODE = '22023';
  END IF;
  v_cmd := canon.sha256_hex(canon.jcs(jsonb_build_object('act', 'author', 'type', p_object_type, 'title', btrim(coalesce(p_title, '')), 'statement', btrim(coalesce(p_statement, '')),
             'body', coalesce(p_body, '{}'::jsonb), 'evidence_refs', v_refs, 'classification', p_classification, 'purpose_scope', p_purpose_scope, 'synthetic', coalesce(p_synthetic, false))));
  SELECT * INTO x FROM objects.lifecycle_transitions t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF x.actor_principal_id = v_actor AND x.command_digest = v_cmd AND x.action = 'create' THEN RETURN objects._lc_outcome(x, true); END IF;
    RAISE EXCEPTION 'work object rejected (duplicate): the idempotency key % was used for a different command — a new act takes a new key', p_idempotency_key USING ERRCODE = '22023';
  END IF;
  p := objects._lc_profile(p_object_type);
  IF p.object_type IS NULL OR p.governance <> 'work_object' THEN
    RAISE EXCEPTION 'work object rejected (type): % is not a work-object type (its lifecycle is %)', coalesce(p_object_type, '<none>'), coalesce(p.owning_port, 'not declared') USING ERRCODE = '22023';
  END IF;
  v_problem := objects._lc_content_problem(p_title, p_statement, p_body);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'work object rejected (content): %', v_problem USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_refs) <> 'array' OR jsonb_array_length(v_refs) > 50 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_refs) e WHERE jsonb_typeof(e) <> 'string') THEN
    RAISE EXCEPTION 'work object rejected (evidence): the evidence references are a list of at most 50 references' USING ERRCODE = '22023';
  END IF;
  IF p_classification IS NULL OR p_classification NOT IN ('public', 'internal', 'confidential', 'restricted') THEN
    RAISE EXCEPTION 'work object rejected (classification): the classification is public, internal, confidential or restricted' USING ERRCODE = '22023';
  END IF;
  IF p_purpose_scope IS NULL OR length(btrim(p_purpose_scope)) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'work object rejected (purpose): the purpose scope names the purpose the assessment serves' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_object_id) THEN
    RAISE EXCEPTION 'work object rejected (duplicate): object % already exists', p_object_id USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('form', 'work_object', 'title', btrim(p_title), 'statement', btrim(p_statement), 'body', p_body, 'review', NULL, 'approval', NULL,
                 'act', jsonb_build_object('action', 'create', 'by', 'principal:' || v_actor, 'at', objects._lc_iso(v_now), 'reason', NULL, 'transition_id', v_id, 'kind', 'forward'));
  v_header := jsonb_build_object(
    'object_id', p_object_id, 'object_type', p_object_type, 'tenant_id', p_tenant, 'domain_id', p_domain, 'scope', 'DOMAIN', 'object_version', '1',
    'lifecycle_state', 'draft', 'owning_component', 'CP-OBJ-01', 'accountable_owner', 'principal:' || v_actor, 'source_object_ids', '[]'::jsonb,
    'event_time', NULL, 'observation_time', NULL, 'valid_from', NULL, 'valid_to', NULL, 'recorded_at', objects._lc_iso(v_now), 'time_precision', 'exact',
    'source_clock_quality', 'trusted', 'truth_state', CASE WHEN coalesce(p_synthetic, false) THEN 'synthetic' ELSE 'assessed' END, 'synthetic_state', coalesce(p_synthetic, false),
    'confidence', 'null'::jsonb, 'uncertainty', 'null'::jsonb, 'evidence_refs', v_refs, 'provenance_ref', NULL, 'method_ref', NULL, 'contradiction_refs', '[]'::jsonb,
    'corroboration_refs', '[]'::jsonb, 'human_refs', jsonb_build_array('principal:' || v_actor), 'classification', p_classification, 'purpose_scope', btrim(p_purpose_scope),
    'rights_profile', NULL, 'residency_profile', NULL, 'retention_profile', NULL, 'access_policy_ref', NULL, 'quality_profile', NULL, 'quality_state', 'null'::jsonb,
    'freshness_state', 'null'::jsonb, 'schema_ref', p.schema_ref, 'ontology_ref', NULL, 'correction_of', NULL, 'supersedes', NULL, 'withdrawal_reason', NULL,
    'audit_correlation_id', public.eye_correlation(), 'content_ref', NULL);
  INSERT INTO objects.lifecycle_transitions (transition_id, scope, tenant_id, domain_id, object_type, object_id, profile_version, action, kind, outcome, from_state, to_state,
      expected_version, prior_version, new_version, attempted, reason, actor_principal_id, actor_class, policy_decision_id, bundle_version, idempotency_key, command_digest, recorded_at, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_object_type, p_object_id, p.version, 'create', 'forward', 'accepted', NULL, 'draft', 0, NULL, 1,
      jsonb_build_object('action', 'create', 'to', 'draft', 'expected_version', 0, 'title', btrim(p_title)), NULL, v_actor, 'author', public.eye_policy_decision(), public.eye_bundle_version(),
      p_idempotency_key, v_cmd, v_now, p_correlation)
  RETURNING * INTO x;
  PERFORM objects._lc_admit(v_header, v_payload);
  RETURN objects._lc_outcome(x, false);
END $$;
REVOKE ALL ON FUNCTION objects.author_work_object(uuid, uuid, text, uuid, text, text, jsonb, jsonb, text, text, boolean, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.author_work_object(uuid, uuid, text, uuid, text, text, jsonb, jsonb, text, text, boolean, text, uuid, uuid) TO eye_commit;

-- §LC.6 THE TRANSITION (PR-06-001/003/005, V03-T-021) ─────────────────────────────────────────────────────────────────────────────────────
/* THE CORE (internal): one attempted transition of a work object. Every attempt on a resolved object is KEPT — accepted (the new version
   written in SQL from the prior one through admit), rejected (the attempted command, the last authoritative version, the refusal) or
   compensated. It never RAISES for a refusal of the attempt itself (a raise would roll the record back); it raises only for what is not an
   attempt on a known object of this scope (the acting principal, the key reused for another command, an unknown object). */
CREATE OR REPLACE FUNCTION objects._lifecycle_apply(p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_expected_version int, p_action text, p_to text,
  p_reason text, p_idempotency_key text, p_causation_id uuid, p_correlation_ref text, p_reentry_reason text, p_changes jsonb, p_proposal_id uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, observation, identity, governance, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_cmd text; x objects.lifecycle_transitions%ROWTYPE; o objects.canonical_objects%ROWTYPE; base objects.canonical_objects%ROWTYPE; p objects.lifecycle_profiles%ROWTYPE;
  tr jsonb; v_kind text := 'forward'; v_class text; v_code text; v_msg text; v_owner uuid; v_author uuid; v_reviewer uuid; v_actor_class text; v_to text;
  v_last objects.lifecycle_transitions%ROWTYPE; v_has_last boolean; v_comp objects.lifecycle_transitions%ROWTYPE; v_now timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_id uuid := gen_random_uuid(); v_header jsonb; v_payload jsonb; v_changes jsonb := coalesce(p_changes, '{}'::jsonb); v_human_refs jsonb; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_attempted jsonb; v_outcome text; v_restore_from int;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'lifecycle transition rejected (idempotency): the command carries an idempotency key of 8 to 200 characters (a retry reuses it)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_changes) <> 'object' THEN RAISE EXCEPTION 'lifecycle transition rejected (changes): the changes are an object' USING ERRCODE = '22023'; END IF;
  v_cmd := canon.sha256_hex(canon.jcs(jsonb_build_object('object', p_object_id, 'expected_version', p_expected_version, 'action', p_action, 'to', p_to, 'reason', v_reason,
             'causation', p_causation_id, 'reentry_reason', p_reentry_reason, 'changes', v_changes, 'proposal', p_proposal_id)));
  -- THE IDEMPOTENCY KEY: a repeat by the same person with the same command answers the FIRST result (accepted or rejected) — no second effect.
  SELECT * INTO x FROM objects.lifecycle_transitions t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF x.actor_principal_id = p_actor AND x.command_digest = v_cmd THEN RETURN objects._lc_outcome(x, true); END IF;
    RAISE EXCEPTION 'lifecycle transition rejected (duplicate): the idempotency key % was used for a different command — a new act takes a new key', p_idempotency_key USING ERRCODE = '22023';
  END IF;
  -- ONE transition of an object at a time: the second of two concurrent attempts waits, then reads the version the first wrote (stale).
  PERFORM pg_advisory_xact_lock(hashtextextended('objects.lifecycle:' || p_object_id::text, 0));
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = p_object_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain ORDER BY c.object_version DESC LIMIT 1;
  IF NOT FOUND OR o.object_type IS DISTINCT FROM p_object_type THEN
    RAISE EXCEPTION 'lifecycle transition rejected (unknown_object): no % object % is recorded in this domain', coalesce(p_object_type, '<none>'), p_object_id USING ERRCODE = '23503';
  END IF;
  p := objects._lc_profile(o.object_type);
  SELECT * INTO v_last FROM objects.lifecycle_transitions t WHERE t.object_id = o.object_id AND t.outcome IN ('accepted', 'compensated') ORDER BY t.new_version DESC LIMIT 1;
  v_has_last := FOUND;
  v_attempted := jsonb_strip_nulls(jsonb_build_object('action', p_action, 'to', p_to, 'expected_version', p_expected_version, 'reason', v_reason, 'causation_id', p_causation_id,
                   'correlation_ref', p_correlation_ref, 'reentry_reason', p_reentry_reason, 'changes', CASE WHEN v_changes = '{}'::jsonb THEN NULL ELSE v_changes END, 'proposal_id', p_proposal_id,
                   'state_at_attempt', o.lifecycle_state, 'version_at_attempt', o.object_version));

  -- THE RULES, the first failing one is the refusal (every one re-checked HERE, whatever the route or the page decided).
  IF p.object_type IS NULL OR p.governance <> 'work_object' OR o.schema_ref IS DISTINCT FROM p.schema_ref THEN
    v_class := 'profile'; v_code := 'module_owned';
    v_msg := CASE WHEN p.governance = 'work_object'
                  THEN format('%s %s is the %s form, moved by its own port (extraction review or the governed import); this machine moves %s', o.object_type, o.object_id, o.schema_ref, p.schema_ref)
                  ELSE format('%s %s is not moved by this machine — its lifecycle is %s''s', o.object_type, o.object_id, coalesce(p.owning_port, 'not declared')) END;
  END IF;
  IF v_class IS NULL THEN
    SELECT e INTO tr FROM jsonb_array_elements(p.transitions) e WHERE e ->> 'action' = p_action;
    IF tr IS NULL THEN v_class := 'transition'; v_code := 'unknown_action';
      v_msg := format('%s is not a transition of %s (%s)', coalesce(p_action, '<none>'), o.object_type, (SELECT string_agg(e ->> 'action', ', ') FROM jsonb_array_elements(p.transitions) e));
    ELSE v_kind := tr ->> 'kind'; v_actor_class := tr ->> 'actor';
    END IF;
  END IF;
  IF v_class IS NULL AND p_expected_version IS DISTINCT FROM o.object_version::int THEN
    v_class := 'stale'; v_code := 'stale_version';
    v_msg := format('the command expected version %s; the authoritative version is %s (%s) — re-read the object and decide again', coalesce(p_expected_version::text, '<none>'), o.object_version, o.lifecycle_state);
  END IF;
  -- the out-of-order test: a cause named from this object's own ledger must be its LATEST transition (an older one is a stale chain)
  IF v_class IS NULL AND p_causation_id IS NOT NULL AND v_kind <> 're_entry'
     AND EXISTS (SELECT 1 FROM objects.lifecycle_transitions t WHERE t.transition_id = p_causation_id AND t.object_id = o.object_id)
     AND (NOT v_has_last OR v_last.transition_id <> p_causation_id) THEN
    v_class := 'state'; v_code := 'out_of_order';
    v_msg := format('the command follows transition %s, which is not the latest (%s) — it arrived out of order', p_causation_id, coalesce(v_last.transition_id::text, '<none>'));
  END IF;
  IF v_class IS NULL AND v_kind = 'compensation' THEN
    IF NOT v_has_last OR v_last.action = 'create' OR v_last.kind = 'compensation' THEN
      v_class := 'state'; v_code := 'nothing_to_compensate'; v_msg := 'there is no accepted transition to compensate (the creation and a compensation are not undone)';
    ELSIF p_causation_id IS DISTINCT FROM v_last.transition_id THEN
      v_class := 'state'; v_code := 'out_of_order'; v_msg := format('a compensation names the transition it undoes: the latest is %s', v_last.transition_id);
    ELSE v_to := v_last.from_state; v_restore_from := v_last.prior_version;
    END IF;
  ELSIF v_class IS NULL THEN
    v_to := tr ->> 'to';
    IF NOT (o.lifecycle_state = ANY (ARRAY(SELECT jsonb_array_elements_text(tr -> 'from')))) THEN
      v_class := 'state'; v_code := 'invalid_transition';
      v_msg := format('%s is offered from %s; the object is %s', p_action, (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(tr -> 'from') s), o.lifecycle_state);
    END IF;
  END IF;
  IF v_class IS NULL AND p_to IS NOT NULL AND p_to IS DISTINCT FROM v_to THEN
    v_class := 'transition'; v_code := 'target_mismatch'; v_msg := format('%s leads to %s, not %s', p_action, v_to, p_to);
  END IF;
  IF v_class IS NULL AND v_kind = 're_entry' THEN
    IF p_reentry_reason IS NULL OR NOT (p_reentry_reason = ANY (ARRAY(SELECT jsonb_array_elements_text(tr -> 'reentry_reasons')))) OR p_causation_id IS NULL THEN
      v_class := 'reentry'; v_code := 'untyped_reentry';
      v_msg := format('a return to %s is a typed re-entry: it names its reason (%s) and the event that caused it (causation)', v_to, (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(tr -> 'reentry_reasons') s));
    END IF;
  END IF;
  IF v_class IS NULL AND tr ? 'reason' AND (v_reason IS NULL OR length(v_reason) < 8) THEN
    v_class := 'reason'; v_code := 'reason_required'; v_msg := format('%s records %s (8+ characters)', p_action, tr ->> 'reason');
  END IF;
  IF v_class IS NULL THEN
    v_owner := objects._lc_owner(o.accountable_owner);
    IF v_owner IS NULL THEN v_class := 'state'; v_code := 'ownerless';
      v_msg := format('the accountable owner %s is not an active person — the object cannot identify its owner; it is reconciled before it moves', o.accountable_owner);
    END IF;
  END IF;
  IF v_class IS NULL AND onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    v_class := 'actor'; v_code := 'not_human'; v_msg := 'an authoritative transition is a named person''s act; an agent, a model, an import or a projection proposes';
  END IF;
  IF v_class IS NULL THEN
    IF v_actor_class = 'owner' AND p_actor IS DISTINCT FROM v_owner THEN
      v_class := 'authority'; v_code := 'not_owner'; v_msg := format('%s is the accountable owner''s act (%s); you may propose it', p_action, o.accountable_owner);
    ELSIF v_actor_class = 'reviewer' AND NOT governance.holds_role(p_actor, p_tenant, p_domain, p.reviewer_roles) THEN
      v_class := 'authority'; v_code := 'not_reviewer'; v_msg := format('%s is the act of a %s', p_action, array_to_string(p.reviewer_roles, ' or '));
    ELSIF v_actor_class = 'approver' AND NOT governance.holds_role(p_actor, p_tenant, p_domain, p.approver_roles) THEN
      v_class := 'authority'; v_code := 'not_approver'; v_msg := format('%s is the act of a %s', p_action, array_to_string(p.approver_roles, ' or '));
    END IF;
  END IF;
  IF v_class IS NULL THEN
    SELECT t.actor_principal_id INTO v_author FROM objects.lifecycle_transitions t WHERE t.object_id = o.object_id AND t.action = 'create' AND t.outcome = 'accepted';
    v_author := coalesce(v_author, v_owner);
    -- the reviewer of the CURRENT cycle (since the last return to draft)
    SELECT t.actor_principal_id INTO v_reviewer FROM objects.lifecycle_transitions t
     WHERE t.object_id = o.object_id AND t.action = 'review' AND t.outcome = 'accepted'
       AND t.new_version > coalesce((SELECT max(z.new_version) FROM objects.lifecycle_transitions z WHERE z.object_id = o.object_id AND z.outcome IN ('accepted', 'compensated') AND z.to_state = 'draft'), 0)
     ORDER BY t.new_version DESC LIMIT 1;
    IF tr -> 'separation' ? 'author' AND p_actor = v_author THEN
      v_class := 'separation_of_duties'; v_code := 'separation'; v_msg := format('%s is never done by the author of the work object (0042''s rule)', p_action);
    ELSIF tr -> 'separation' ? 'reviewer' AND p_actor = v_reviewer THEN
      v_class := 'separation_of_duties'; v_code := 'separation'; v_msg := format('%s is never done by the reviewer of this version', p_action);
    END IF;
  END IF;
  IF v_class IS NULL THEN
    IF v_changes <> '{}'::jsonb AND coalesce((tr ->> 'changes')::boolean, false) IS NOT TRUE
       AND NOT (p_action = 'review' AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(v_changes) k WHERE k <> 'evidence_refs')) THEN
      v_class := 'transition'; v_code := 'changes_not_allowed';
      v_msg := format('%s changes no content (a review may name the evidence it read); a content change is a correction', p_action);
    ELSIF EXISTS (SELECT 1 FROM jsonb_object_keys(v_changes) k WHERE k NOT IN ('title', 'statement', 'body', 'evidence_refs')) THEN
      v_class := 'transition'; v_code := 'changes_invalid'; v_msg := 'the changes name title, statement, body or evidence_refs only';
    ELSIF p_action = 'correct' AND (v_changes = '{}'::jsonb OR objects._lc_content_problem(coalesce(v_changes ->> 'title', o.payload ->> 'title'), coalesce(v_changes ->> 'statement', o.payload ->> 'statement'),
                                                                    coalesce(v_changes -> 'body', o.payload -> 'body')) IS NOT NULL) THEN
      v_class := 'transition'; v_code := 'changes_invalid';
      v_msg := coalesce('the correction: ' || objects._lc_content_problem(coalesce(v_changes ->> 'title', o.payload ->> 'title'), coalesce(v_changes ->> 'statement', o.payload ->> 'statement'), coalesce(v_changes -> 'body', o.payload -> 'body')),
                        'a correction names what changes (title, statement, body or evidence_refs)');
    END IF;
  END IF;

  IF v_class IS NOT NULL THEN
    INSERT INTO objects.lifecycle_transitions (transition_id, scope, tenant_id, domain_id, object_type, object_id, profile_version, action, kind, outcome, from_state, to_state,
        expected_version, prior_version, new_version, attempted, refusal_class, refusal_code, refusal_message, reason, reentry_reason, causation_id, correlation_ref, compensates, proposal_id,
        actor_principal_id, actor_class, policy_decision_id, bundle_version, idempotency_key, command_digest, recorded_at, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, o.object_type, o.object_id, coalesce(p.version, 0), CASE WHEN coalesce(p_action, '') ~ '^[a-z][a-z_]{2,40}$' THEN p_action ELSE 'unknown' END,
        CASE WHEN v_kind IN ('forward', 're_entry', 'compensation') THEN v_kind ELSE 'forward' END, 'rejected', o.lifecycle_state, coalesce(v_to, p_to), p_expected_version, o.object_version, NULL,
        v_attempted, v_class, v_code, format('lifecycle transition rejected (%s): %s', v_class, v_msg), v_reason,
        CASE WHEN p_reentry_reason = ANY (objects.lifecycle_reentry_reasons()) THEN p_reentry_reason END, p_causation_id, p_correlation_ref, NULL, p_proposal_id,
        p_actor, v_actor_class, public.eye_policy_decision(), public.eye_bundle_version(), p_idempotency_key, v_cmd, v_now, p_correlation)
    RETURNING * INTO x;
    RETURN objects._lc_outcome(x, false);
  END IF;

  -- ACCEPTED (or COMPENSATED): the next version, written from the prior one (the restored one, for a compensation).
  IF v_kind = 'compensation' THEN
    SELECT * INTO base FROM objects.canonical_objects c WHERE c.object_id = o.object_id AND c.object_version = v_restore_from;
    SELECT * INTO v_comp FROM objects.lifecycle_transitions t WHERE t.transition_id = v_last.transition_id;
  ELSE base := o;
  END IF;
  v_human_refs := CASE WHEN o.human_refs @> jsonb_build_array('principal:' || p_actor) THEN o.human_refs ELSE o.human_refs || jsonb_build_array('principal:' || p_actor) END;
  v_payload := base.payload;
  IF p_action = 'correct' THEN
    IF v_changes ? 'title' THEN v_payload := jsonb_set(v_payload, '{title}', to_jsonb(btrim(v_changes ->> 'title'))); END IF;
    IF v_changes ? 'statement' THEN v_payload := jsonb_set(v_payload, '{statement}', to_jsonb(btrim(v_changes ->> 'statement'))); END IF;
    IF v_changes ? 'body' THEN v_payload := jsonb_set(v_payload, '{body}', v_changes -> 'body'); END IF;
  END IF;
  IF p_action = 'review' THEN
    v_payload := jsonb_set(v_payload, '{review}', jsonb_build_object('reviewer', 'principal:' || p_actor, 'version', o.object_version, 'findings', v_reason,
                   'evidence_refs', coalesce(v_changes -> 'evidence_refs', '[]'::jsonb), 'at', objects._lc_iso(v_now)));
  ELSIF p_action = 'approve' THEN
    v_payload := jsonb_set(v_payload, '{approval}', jsonb_build_object('approver', 'principal:' || p_actor, 'version', o.object_version, 'rationale', v_reason, 'at', objects._lc_iso(v_now)));
  ELSIF v_to = 'draft' THEN
    v_payload := v_payload || jsonb_build_object('review', NULL, 'approval', NULL);   -- a re-entry opens a new cycle: the next review is a new one
  END IF;
  v_payload := jsonb_set(v_payload, '{act}', jsonb_build_object('action', p_action, 'by', 'principal:' || p_actor, 'at', objects._lc_iso(v_now), 'reason', v_reason, 'transition_id', v_id, 'kind', v_kind));
  v_header := objects._lc_header(base) || jsonb_build_object(
    'object_version', (o.object_version + 1)::text, 'lifecycle_state', v_to, 'recorded_at', objects._lc_iso(v_now), 'audit_correlation_id', public.eye_correlation(),
    'human_refs', v_human_refs,
    'evidence_refs', CASE WHEN p_action = 'correct' AND jsonb_typeof(v_changes -> 'evidence_refs') = 'array' THEN v_changes -> 'evidence_refs' ELSE base.evidence_refs END,
    'correction_of', CASE WHEN p_action = 'correct' OR v_kind = 'compensation' THEN o.object_id::text || '@' || o.object_version ELSE base.correction_of END,
    'truth_state', CASE WHEN v_to = 'withdrawn' THEN 'withdrawn' ELSE base.truth_state END,
    'withdrawal_reason', CASE WHEN v_to = 'withdrawn' THEN v_reason ELSE base.withdrawal_reason END);
  v_outcome := CASE WHEN v_kind = 'compensation' THEN 'compensated' ELSE 'accepted' END;
  INSERT INTO objects.lifecycle_transitions (transition_id, scope, tenant_id, domain_id, object_type, object_id, profile_version, action, kind, outcome, from_state, to_state,
      expected_version, prior_version, new_version, attempted, reason, reentry_reason, causation_id, correlation_ref, compensates, proposal_id,
      actor_principal_id, actor_class, policy_decision_id, bundle_version, idempotency_key, command_digest, recorded_at, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, o.object_type, o.object_id, p.version, p_action, v_kind, v_outcome, o.lifecycle_state, v_to, p_expected_version, o.object_version, o.object_version + 1,
      v_attempted, v_reason, CASE WHEN v_kind = 're_entry' THEN p_reentry_reason END, p_causation_id, p_correlation_ref, CASE WHEN v_kind = 'compensation' THEN v_comp.transition_id END, p_proposal_id,
      p_actor, v_actor_class, public.eye_policy_decision(), public.eye_bundle_version(), p_idempotency_key, v_cmd, v_now, p_correlation)
  RETURNING * INTO x;
  PERFORM objects._lc_admit(v_header, v_payload);
  RETURN objects._lc_outcome(x, false);
END $$;
REVOKE ALL ON FUNCTION objects._lifecycle_apply(uuid, uuid, text, uuid, int, text, text, text, text, uuid, text, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;

/* THE PORT (objects.lifecycle.transition). */
CREATE OR REPLACE FUNCTION objects.transition_lifecycle(p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_expected_version int, p_action text, p_to text,
  p_reason text, p_idempotency_key text, p_causation_id uuid, p_correlation_ref text, p_reentry_reason text, p_changes jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.lifecycle.transition']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := objects._lc_actor('lifecycle transition', p_actor);
  RETURN objects._lifecycle_apply(p_tenant, p_domain, p_object_type, p_object_id, p_expected_version, p_action, p_to, p_reason, p_idempotency_key, p_causation_id, p_correlation_ref,
                                  p_reentry_reason, p_changes, NULL, v_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION objects.transition_lifecycle(uuid, uuid, text, uuid, int, text, text, text, text, uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.transition_lifecycle(uuid, uuid, text, uuid, int, text, text, text, text, uuid, text, text, jsonb, uuid, uuid) TO eye_commit;

-- §LC.7 PROPOSALS (PR-06-003) ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A view, an agent, a model, an import or a projection PROPOSES a transition — never authoritative. The proposal names the version it read
   (stale refused), an action of the profile and why. The request id replayed by the same principal answers the recorded proposal. */
CREATE OR REPLACE FUNCTION objects.propose_lifecycle(p_request_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_base_version int, p_action text,
  p_reason text, p_via text, p_reentry_reason text, p_causation_id uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, observation, identity, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; v_kind text; o objects.canonical_objects%ROWTYPE; p objects.lifecycle_profiles%ROWTYPE; tr jsonb; r objects.lifecycle_proposals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.lifecycle.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := objects._lc_actor('lifecycle proposal', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'lifecycle proposal rejected (request): the proposal carries a request id (a retry reuses it)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM objects.lifecycle_proposals x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF r.proposer_principal_id = v_actor AND r.object_id = p_object_id AND r.action = p_action THEN
      RETURN to_jsonb(r) || jsonb_build_object('replayed', true);
    END IF;
    RAISE EXCEPTION 'lifecycle proposal rejected (duplicate): the request id % was used for another proposal', p_request_id USING ERRCODE = '22023';
  END IF;
  v_kind := (SELECT x.kind FROM identity.principals x WHERE x.id = v_actor AND x.status = 'active');
  IF v_kind IS NULL THEN RAISE EXCEPTION 'lifecycle proposal rejected (actor): the proposer is not an active principal' USING ERRCODE = '42501'; END IF;
  IF p_via IS NULL OR p_via NOT IN ('view', 'agent', 'model', 'import', 'projection') THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (via): a proposal comes from a view, an agent, a model, an import or a projection' USING ERRCODE = '22023';
  END IF;
  IF (v_kind = 'human' AND p_via <> 'view') OR (v_kind = 'agent' AND p_via NOT IN ('agent', 'model')) OR (v_kind = 'workload' AND p_via NOT IN ('import', 'projection')) THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (via): a % proposes through %', v_kind,
      CASE v_kind WHEN 'human' THEN 'a view' WHEN 'agent' THEN 'an agent or a model' ELSE 'an import or a projection' END USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = p_object_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain ORDER BY c.object_version DESC LIMIT 1;
  IF NOT FOUND OR o.object_type IS DISTINCT FROM p_object_type THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (unknown_object): no % object % is recorded in this domain', coalesce(p_object_type, '<none>'), p_object_id USING ERRCODE = '23503';
  END IF;
  p := objects._lc_profile(o.object_type);
  IF p.object_type IS NULL OR p.governance <> 'work_object' OR o.schema_ref IS DISTINCT FROM p.schema_ref THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (profile): % % is moved by %''s own port, not by a lifecycle proposal', o.object_type, o.object_id, coalesce(p.owning_port, 'an undeclared') USING ERRCODE = '22023';
  END IF;
  SELECT e INTO tr FROM jsonb_array_elements(p.transitions) e WHERE e ->> 'action' = p_action AND e ->> 'kind' <> 'compensation';
  IF tr IS NULL THEN RAISE EXCEPTION 'lifecycle proposal rejected (transition): % is not a transition a proposal may name', coalesce(p_action, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_base_version IS DISTINCT FROM o.object_version::int THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (stale): the proposal read version %; the authoritative version is % (%)', coalesce(p_base_version::text, '<none>'), o.object_version, o.lifecycle_state USING ERRCODE = '22023';
  END IF;
  IF NOT (o.lifecycle_state = ANY (ARRAY(SELECT jsonb_array_elements_text(tr -> 'from')))) THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (state): % is offered from %; the object is %', p_action, (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(tr -> 'from') s), o.lifecycle_state USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'lifecycle proposal rejected (reason): a proposal says why (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF tr ->> 'kind' = 're_entry' AND (p_reentry_reason IS NULL OR NOT (p_reentry_reason = ANY (ARRAY(SELECT jsonb_array_elements_text(tr -> 'reentry_reasons')))) OR p_causation_id IS NULL) THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (reentry): a proposed return names its reason (%) and its cause', (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(tr -> 'reentry_reasons') s) USING ERRCODE = '22023';
  END IF;
  INSERT INTO objects.lifecycle_proposals (proposal_id, scope, tenant_id, domain_id, object_type, object_id, base_version, action, to_state, proposer_principal_id, proposer_kind, via,
      reason, reentry_reason, causation_id, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, o.object_type, o.object_id, o.object_version, p_action, tr ->> 'to', v_actor, v_kind, p_via,
      btrim(p_reason), CASE WHEN tr ->> 'kind' = 're_entry' THEN p_reentry_reason END, p_causation_id, p_request_id, p_correlation)
  RETURNING * INTO r;
  RETURN to_jsonb(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION objects.propose_lifecycle(uuid, uuid, uuid, text, uuid, int, text, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.propose_lifecycle(uuid, uuid, uuid, text, uuid, int, text, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* THE OWNER DECIDES (objects.lifecycle.proposal.decide): accept performs the proposed transition under the owner's own name through the same
   rules (the expected version the owner read; the proposal is its cause) — accepted when the transition is; a refused acceptance leaves the
   proposal open and the refusal in the ledger. Decline records why. A decided proposal is not decided again. */
CREATE OR REPLACE FUNCTION objects.decide_lifecycle_proposal(p_request_id uuid, p_tenant uuid, p_domain uuid, p_object_id uuid, p_proposal_id uuid, p_decision text, p_reason text,
  p_expected_version int, p_idempotency_key text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, observation, identity, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r objects.lifecycle_proposals%ROWTYPE; d objects.lifecycle_proposal_decisions%ROWTYPE; o objects.canonical_objects%ROWTYPE; v_out jsonb; v_owner uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.lifecycle.proposal.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := objects._lc_actor('lifecycle proposal', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'lifecycle proposal rejected (request): the decision carries a request id (a retry reuses it)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM objects.lifecycle_proposal_decisions x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF d.decided_by = v_actor AND d.proposal_id = p_proposal_id THEN RETURN to_jsonb(d) || jsonb_build_object('replayed', true); END IF;
    RAISE EXCEPTION 'lifecycle proposal rejected (duplicate): the request id % was used for another decision', p_request_id USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM objects.lifecycle_proposals x WHERE x.proposal_id = p_proposal_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_id = p_object_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lifecycle proposal rejected (unknown_proposal): no proposal % on object % in this domain', p_proposal_id, p_object_id USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM objects.lifecycle_proposal_decisions x WHERE x.proposal_id = p_proposal_id) THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (state): proposal % is decided already', p_proposal_id USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accept', 'decline') THEN RAISE EXCEPTION 'lifecycle proposal rejected (decision): the owner accepts or declines' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'lifecycle proposal rejected (reason): the decision says why (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = r.object_id ORDER BY c.object_version DESC LIMIT 1;
  v_owner := objects._lc_owner(o.accountable_owner);
  IF onboarding.principal_kind(v_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (actor): deciding a proposal is the owner''s act; an agent never decides' USING ERRCODE = '42501';
  END IF;
  IF v_owner IS NULL OR v_actor IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (authority): only the accountable owner (%) decides a proposal on this object', o.accountable_owner USING ERRCODE = '42501';
  END IF;
  IF p_decision = 'decline' THEN
    INSERT INTO objects.lifecycle_proposal_decisions (proposal_id, scope, tenant_id, domain_id, decision, reason, transition_id, decided_by, request_id, correlation_id)
    VALUES (r.proposal_id, 'DOMAIN', p_tenant, p_domain, 'declined', btrim(p_reason), NULL, v_actor, p_request_id, p_correlation) RETURNING * INTO d;
    RETURN to_jsonb(d) || jsonb_build_object('replayed', false, 'transition', NULL);
  END IF;
  v_out := objects._lifecycle_apply(p_tenant, p_domain, r.object_type, r.object_id, p_expected_version, r.action, r.to_state, coalesce(btrim(p_reason), r.reason), p_idempotency_key,
                                    coalesce(r.causation_id, r.proposal_id), NULL, r.reentry_reason, '{}'::jsonb, r.proposal_id, v_actor, p_correlation);
  IF v_out ->> 'outcome' <> 'accepted' THEN
    RETURN jsonb_build_object('proposal_id', r.proposal_id, 'decision', NULL, 'replayed', false, 'transition', v_out);
  END IF;
  INSERT INTO objects.lifecycle_proposal_decisions (proposal_id, scope, tenant_id, domain_id, decision, reason, transition_id, decided_by, request_id, correlation_id)
  VALUES (r.proposal_id, 'DOMAIN', p_tenant, p_domain, 'accepted', btrim(p_reason), (v_out ->> 'transition_id')::uuid, v_actor, p_request_id, p_correlation) RETURNING * INTO d;
  RETURN to_jsonb(d) || jsonb_build_object('replayed', false, 'transition', v_out);
END $$;
REVOKE ALL ON FUNCTION objects.decide_lifecycle_proposal(uuid, uuid, uuid, uuid, uuid, text, text, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.decide_lifecycle_proposal(uuid, uuid, uuid, uuid, uuid, text, text, int, text, uuid, uuid) TO eye_commit;

-- §LC.8 THE READS (definer, guarded by the N-01 read scope; reads only) ───────────────────────────────────────────────────────────────────
/* Every type's latest lifecycle profile (global declarations; any bound principal). */
CREATE OR REPLACE FUNCTION objects.lifecycle_profiles_read() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_principal() IS NULL AND NOT coalesce((SELECT r.rolsuper OR r.rolbypassrls FROM pg_catalog.pg_roles r WHERE r.rolname = session_user), false) THEN
    RAISE EXCEPTION 'read rejected (scope): the lifecycle profiles are read by a bound principal' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.object_type) FROM (
    SELECT DISTINCT ON (x.object_type) x.* FROM objects.lifecycle_profiles x ORDER BY x.object_type, x.version DESC) p), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_profiles_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_profiles_read() TO eye_app, eye_commit;

/* The work objects of a type in the domain: the latest version of each, its state, its owner, and whether the ledger agrees with it. */
CREATE OR REPLACE FUNCTION objects.lifecycle_objects(p_tenant uuid, p_domain uuid, p_type text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, pg_catalog, pg_temp AS $$
DECLARE p objects.lifecycle_profiles%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the work objects of the domain');
  p := objects._lc_profile(p_type);
  IF p.object_type IS NULL OR p.governance <> 'work_object' THEN
    RAISE EXCEPTION 'lifecycle read rejected (type): % is not a work-object type', coalesce(p_type, '<none>') USING ERRCODE = '22023';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(j ORDER BY j ->> 'recorded_at' DESC) FROM (
    SELECT jsonb_build_object('object_type', o.object_type, 'object_id', o.object_id, 'version', o.object_version, 'state', o.lifecycle_state, 'title', o.payload ->> 'title',
             'owner', o.accountable_owner, 'synthetic', o.synthetic_state, 'classification', o.classification, 'recorded_at', o.recorded_at, 'content_digest', o.content_digest,
             'ledger', CASE WHEN c.object_id IS NULL THEN 'absent' WHEN c.version = o.object_version AND c.state = o.lifecycle_state THEN 'agrees' ELSE 'disagrees' END) AS j
      FROM (SELECT DISTINCT ON (x.object_id) x.* FROM objects.canonical_objects x
             WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = p.object_type AND x.schema_ref = p.schema_ref
             ORDER BY x.object_id, x.object_version DESC) o
      LEFT JOIN LATERAL (SELECT t.to_state AS state, t.new_version AS version, t.object_id FROM objects.lifecycle_transitions t
                          WHERE t.object_id = o.object_id AND t.outcome IN ('accepted', 'compensated') ORDER BY t.new_version DESC LIMIT 1) c ON true
     ORDER BY o.recorded_at DESC LIMIT least(greatest(coalesce(p_limit, 50), 1), 500)) z), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_objects(uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_objects(uuid, uuid, text, int) TO eye_app, eye_commit;

/* ONE object's lifecycle: its versions, every attempted transition (accepted, rejected, compensated), its proposals with their decisions, the
   ledger's current state, and what is UNRESOLVED (attempts refused since the last accepted transition, open proposals) — never hidden. */
CREATE OR REPLACE FUNCTION objects.lifecycle_history(p_tenant uuid, p_domain uuid, p_object_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, pg_catalog, pg_temp AS $$
DECLARE o objects.canonical_objects%ROWTYPE; p objects.lifecycle_profiles%ROWTYPE; v_last timestamptz; c record;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lifecycle of a work object');
  SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.object_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'lifecycle read rejected (unknown_object): no object % is recorded in this domain', p_object_id USING ERRCODE = '23503'; END IF;
  p := objects._lc_profile(o.object_type);
  SELECT t.to_state AS state, t.new_version AS version, t.transition_id, t.recorded_at INTO c FROM objects.lifecycle_transitions t
   WHERE t.object_id = o.object_id AND t.outcome IN ('accepted', 'compensated') ORDER BY t.new_version DESC LIMIT 1;
  v_last := c.recorded_at;
  RETURN jsonb_build_object(
    'object', jsonb_build_object('object_type', o.object_type, 'object_id', o.object_id, 'version', o.object_version, 'state', o.lifecycle_state, 'truth_state', o.truth_state,
               'synthetic', o.synthetic_state, 'classification', o.classification, 'owner', o.accountable_owner, 'owning_component', o.owning_component, 'schema_ref', o.schema_ref,
               'recorded_at', o.recorded_at, 'content_digest', o.content_digest, 'title', o.payload ->> 'title', 'statement', o.payload ->> 'statement', 'body', o.payload -> 'body',
               'review', o.payload -> 'review', 'approval', o.payload -> 'approval', 'act', o.payload -> 'act', 'evidence_refs', o.evidence_refs, 'human_refs', o.human_refs,
               'correction_of', o.correction_of, 'withdrawal_reason', o.withdrawal_reason),
    'profile', CASE WHEN p.object_type IS NULL THEN NULL ELSE to_jsonb(p) END,
    'governed_here', p.governance = 'work_object' AND o.schema_ref = p.schema_ref,
    'versions', (SELECT jsonb_agg(jsonb_build_object('version', v.object_version, 'state', v.lifecycle_state, 'truth_state', v.truth_state, 'recorded_at', v.recorded_at,
                   'content_digest', v.content_digest, 'act', v.payload -> 'act', 'correction_of', v.correction_of) ORDER BY v.object_version)
                   FROM objects.canonical_objects v WHERE v.object_id = o.object_id),
    'transitions', coalesce((SELECT jsonb_agg(objects._lc_outcome(t, false) ORDER BY t.recorded_at, t.transition_id) FROM objects.lifecycle_transitions t WHERE t.object_id = o.object_id), '[]'::jsonb),
    'proposals', coalesce((SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('decision', CASE WHEN d.proposal_id IS NULL THEN NULL ELSE to_jsonb(d) END) ORDER BY r.proposed_at)
                   FROM objects.lifecycle_proposals r LEFT JOIN objects.lifecycle_proposal_decisions d ON d.proposal_id = r.proposal_id WHERE r.object_id = o.object_id), '[]'::jsonb),
    'current', CASE WHEN c.state IS NULL THEN NULL ELSE jsonb_build_object('state', c.state, 'version', c.version, 'transition_id', c.transition_id) END,
    'agreement', CASE WHEN c.state IS NULL THEN CASE WHEN p.governance = 'work_object' AND o.schema_ref = p.schema_ref THEN 'absent' ELSE 'not_governed_here' END
                      WHEN c.version = o.object_version AND c.state = o.lifecycle_state THEN 'agrees' ELSE 'disagrees' END,
    'unresolved', jsonb_build_object(
       'refused_since_last', coalesce((SELECT jsonb_agg(jsonb_build_object('transition_id', t.transition_id, 'action', t.action, 'class', t.refusal_class, 'code', t.refusal_code,
                                         'message', t.refusal_message, 'at', t.recorded_at, 'by', t.actor_principal_id) ORDER BY t.recorded_at)
                                       FROM objects.lifecycle_transitions t WHERE t.object_id = o.object_id AND t.outcome = 'rejected' AND (v_last IS NULL OR t.recorded_at > v_last)), '[]'::jsonb),
       'open_proposals', (SELECT count(*) FROM objects.lifecycle_proposals r WHERE r.object_id = o.object_id
                            AND NOT EXISTS (SELECT 1 FROM objects.lifecycle_proposal_decisions d WHERE d.proposal_id = r.proposal_id))),
    'read_at', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_history(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_history(uuid, uuid, uuid) TO eye_app, eye_commit;

/* REPLAY (CAP-AU-07): where the object stood AT an instant — the latest version recorded by then (the authoritative record), cross-checked with
   the ledger's transitions recorded by then; what happened LATER is counted, never folded in. Before the first version: not yet recorded. */
CREATE OR REPLACE FUNCTION objects.lifecycle_replay(p_tenant uuid, p_domain uuid, p_object_id uuid, p_as_of timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, pg_catalog, pg_temp AS $$
DECLARE o objects.canonical_objects%ROWTYPE; t objects.lifecycle_transitions%ROWTYPE; v_found boolean; v_tfound boolean; v_type text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lifecycle replay of a work object');
  IF p_as_of IS NULL THEN RAISE EXCEPTION 'lifecycle read rejected (as_of): a replay names its instant' USING ERRCODE = '22023'; END IF;
  SELECT x.object_type INTO v_type FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain LIMIT 1;
  IF v_type IS NULL THEN RAISE EXCEPTION 'lifecycle read rejected (unknown_object): no object % is recorded in this domain', p_object_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.recorded_at <= p_as_of ORDER BY x.object_version DESC LIMIT 1;
  v_found := FOUND;
  SELECT * INTO t FROM objects.lifecycle_transitions x WHERE x.object_id = p_object_id AND x.outcome IN ('accepted', 'compensated') AND x.recorded_at <= p_as_of ORDER BY x.new_version DESC LIMIT 1;
  v_tfound := FOUND;
  RETURN jsonb_build_object('object_id', p_object_id, 'object_type', v_type, 'as_of', p_as_of, 'known', v_found,
    'state', CASE WHEN v_found THEN o.lifecycle_state END, 'version', CASE WHEN v_found THEN o.object_version END, 'recorded_at', CASE WHEN v_found THEN o.recorded_at END,
    'title', CASE WHEN v_found THEN o.payload ->> 'title' END, 'content_digest', CASE WHEN v_found THEN o.content_digest END,
    'act', CASE WHEN v_found THEN o.payload -> 'act' END,
    'ledger', CASE WHEN v_tfound THEN jsonb_build_object('state', t.to_state, 'version', t.new_version, 'transition_id', t.transition_id, 'action', t.action, 'kind', t.kind) END,
    'agrees', CASE WHEN NOT v_found THEN NULL WHEN NOT v_tfound THEN NULL ELSE t.new_version = o.object_version AND t.to_state = o.lifecycle_state END,
    'later', jsonb_build_object('versions', (SELECT count(*) FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.recorded_at > p_as_of),
                                'attempts', (SELECT count(*) FROM objects.lifecycle_transitions x WHERE x.object_id = p_object_id AND x.recorded_at > p_as_of)),
    'note', CASE WHEN NOT v_found THEN 'nothing of this object was recorded by this instant' END);
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_replay(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_replay(uuid, uuid, uuid, timestamptz) TO eye_app, eye_commit;

/* THE MODULE STATE of an object of a module-owned type, read from its owning module (NULL when the module holds no row for it). */
CREATE OR REPLACE FUNCTION objects._lc_module_state(p_type text, p_id uuid, p_tenant uuid, p_domain uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE v text;
BEGIN
  CASE p_type
    WHEN 'SRC' THEN SELECT c.lifecycle_state INTO v FROM observation.source_contracts_current c WHERE c.src_object_id = p_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain LIMIT 1;
    WHEN 'RSK' THEN SELECT e.state INTO v FROM prediction.exposure_current e WHERE e.exposure_id = p_id;
    WHEN 'MEM' THEN SELECT m.state INTO v FROM memory.items_current m WHERE m.item_id = p_id AND m.tenant_id = p_tenant AND m.domain_id = p_domain;
    WHEN 'FCT' THEN SELECT f.state INTO v FROM prediction.forecasts_current f WHERE f.forecast_id = p_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain;
    WHEN 'WRN' THEN SELECT w.state INTO v FROM prediction.warnings_current w WHERE w.warning_id = p_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain;
    WHEN 'PUB' THEN SELECT x.state INTO v FROM executive.publications x WHERE x.publication_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    WHEN 'DPK' THEN SELECT x.state INTO v FROM decision.packages_current x WHERE x.package_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    WHEN 'BRF' THEN SELECT 'composed' INTO v FROM executive.briefings b WHERE b.briefing_id = p_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    ELSE v := NULL;
  END CASE;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION objects._lc_module_state(text, uuid, uuid, uuid) FROM PUBLIC;

/* RECONCILE (PR-06-002): every object of a profiled type in the domain whose lifecycle does not agree —
     work object   the ledger's current state / version against the latest canonical version; a version written outside the ledger
     module        the module's state (read from the owning module) against the canonical record through the profile's rule; a module state
                   the profile does not know; a module row with no canonical record (module rows whose type writes no canonical object are
                   not walked from this side)
     canonical     a canonical state the profile does not know
   Reads only; the disagreements are listed (the first 200, with the total) — a reconciliation is a person's act on the owning port. */
CREATE OR REPLACE FUNCTION objects.lifecycle_reconcile(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lifecycle reconciliation of the domain');
  WITH prof AS (SELECT DISTINCT ON (x.object_type) x.* FROM objects.lifecycle_profiles x ORDER BY x.object_type, x.version DESC),
  latest AS (SELECT DISTINCT ON (o.object_id) o.object_id, o.object_type, o.object_version, o.lifecycle_state, o.schema_ref
               FROM objects.canonical_objects o JOIN prof ON prof.object_type = o.object_type
              WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_id, o.object_version DESC),
  judged AS (
    SELECT l.object_type, l.object_id, l.object_version, l.lifecycle_state, pr.governance,
           CASE WHEN pr.governance = 'module' THEN objects._lc_module_state(l.object_type, l.object_id, p_tenant, p_domain) END AS module_state,
           c.to_state AS ledger_state, c.new_version AS ledger_version,
           CASE WHEN pr.governance = 'work_object' THEN (SELECT count(*) FROM objects.canonical_objects v WHERE v.object_id = l.object_id
               AND NOT EXISTS (SELECT 1 FROM objects.lifecycle_transitions t WHERE t.object_id = v.object_id AND t.new_version = v.object_version AND t.outcome IN ('accepted', 'compensated')))
                ELSE 0 END AS outside,
           pr.states, pr.consistent, pr.canonical_map, pr.schema_ref AS pschema, l.schema_ref
      FROM latest l JOIN prof pr ON pr.object_type = l.object_type
      LEFT JOIN LATERAL (SELECT t.to_state, t.new_version FROM objects.lifecycle_transitions t WHERE t.object_id = l.object_id AND t.outcome IN ('accepted', 'compensated') ORDER BY t.new_version DESC LIMIT 1) c ON true),
  problems AS (
    SELECT j.*, CASE
        WHEN j.governance = 'work_object' AND j.schema_ref = j.pschema AND j.ledger_state IS NULL THEN 'no ledger record: the work object was written outside the lifecycle'
        WHEN j.governance = 'work_object' AND j.schema_ref = j.pschema AND j.outside > 0 THEN format('%s version(s) written outside the lifecycle ledger', j.outside)
        WHEN j.governance = 'work_object' AND j.schema_ref = j.pschema AND (j.ledger_version <> j.object_version OR j.ledger_state <> j.lifecycle_state)
          THEN format('the ledger says %s v%s; the canonical record says %s v%s', j.ledger_state, j.ledger_version, j.lifecycle_state, j.object_version)
        WHEN j.governance = 'module' AND j.module_state IS NULL THEN 'the owning module holds no row for this canonical record'
        WHEN j.governance = 'module' AND NOT (j.module_state = ANY (j.states)) THEN format('the module state %s is not in the %s profile', j.module_state, j.object_type)
        WHEN j.governance = 'module' AND NOT (j.consistent -> j.module_state ? j.lifecycle_state)
          THEN format('the module says %s (%s); the canonical record says %s', j.module_state, j.canonical_map ->> j.module_state, j.lifecycle_state)
        WHEN j.governance = 'canonical' AND NOT (j.lifecycle_state = ANY (j.states)) THEN format('the canonical state %s is not in the %s profile', j.lifecycle_state, j.object_type)
      END AS problem
      FROM judged j)
  SELECT jsonb_build_object('total', (SELECT count(*) FROM problems q WHERE q.problem IS NOT NULL),
           'items', coalesce((SELECT jsonb_agg(z.j) FROM (SELECT jsonb_build_object('object_type', q.object_type, 'object_id', q.object_id, 'version', q.object_version,
                                 'canonical_state', q.lifecycle_state, 'module_state', q.module_state, 'mapped', CASE WHEN q.module_state IS NOT NULL THEN q.canonical_map ->> q.module_state END,
                                 'ledger_state', q.ledger_state, 'problem', q.problem) AS j
                               FROM problems q WHERE q.problem IS NOT NULL ORDER BY q.object_type, q.object_id LIMIT 200) z), '[]'::jsonb))
    INTO v_rows;
  RETURN jsonb_build_object('read_at', clock_timestamp(), 'disagreements', v_rows -> 'items', 'total_disagreements', coalesce((v_rows ->> 'total')::int, 0),
    'checked', (SELECT coalesce(jsonb_object_agg(k.object_type, k.n), '{}'::jsonb) FROM (
                  SELECT o.object_type, count(DISTINCT o.object_id) AS n FROM objects.canonical_objects o
                   WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type IN (SELECT x.object_type FROM objects.lifecycle_profiles x) GROUP BY 1) k),
    'rule', 'work objects: the ledger against the canonical versions; module types: the module''s state against the canonical record through the profile''s reconciliation rule; canonical types: the state within the profile');
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_reconcile(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_reconcile(uuid, uuid) TO eye_app, eye_commit;

/* EXPORT (PR-06-006's export / re-import evidence): one object's lifecycle as a self-verifying document — every version's header and payload
   (each digest recomputable), every transition (accepted, rejected, compensated), the replay, and the document's own digest. */
CREATE OR REPLACE FUNCTION objects.lifecycle_export(p_tenant uuid, p_domain uuid, p_object_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, canon, pg_catalog, pg_temp AS $$
DECLARE v_doc jsonb; v_type text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lifecycle export of a work object');
  SELECT x.object_type INTO v_type FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain LIMIT 1;
  IF v_type IS NULL THEN RAISE EXCEPTION 'lifecycle read rejected (unknown_object): no object % is recorded in this domain', p_object_id USING ERRCODE = '23503'; END IF;
  v_doc := jsonb_build_object('format', 'eye-lifecycle-export/1', 'object_id', p_object_id, 'object_type', v_type, 'exported_at', objects._lc_iso(clock_timestamp()),
    'versions', (SELECT jsonb_agg(jsonb_build_object('version', v.object_version, 'header', objects._lc_header(v), 'payload', v.payload, 'content_digest', v.content_digest) ORDER BY v.object_version)
                   FROM objects.canonical_objects v WHERE v.object_id = p_object_id),
    'transitions', coalesce((SELECT jsonb_agg(jsonb_build_object('transition_id', t.transition_id, 'action', t.action, 'kind', t.kind, 'outcome', t.outcome, 'from', t.from_state, 'to', t.to_state,
                   'prior_version', t.prior_version, 'new_version', t.new_version, 'refusal_code', t.refusal_code, 'actor', t.actor_principal_id, 'recorded_at', objects._lc_iso(t.recorded_at),
                   'causation_id', t.causation_id, 'compensates', t.compensates) ORDER BY t.recorded_at, t.transition_id)
                   FROM objects.lifecycle_transitions t WHERE t.object_id = p_object_id), '[]'::jsonb),
    'replay', (SELECT jsonb_agg(jsonb_build_object('version', v.object_version, 'state', v.lifecycle_state, 'recorded_at', objects._lc_iso(v.recorded_at)) ORDER BY v.object_version)
                 FROM objects.canonical_objects v WHERE v.object_id = p_object_id));
  RETURN v_doc || jsonb_build_object('digest', canon.sha256_hex(canon.jcs(v_doc)));
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_export(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_export(uuid, uuid, uuid) TO eye_app, eye_commit;

/* RE-IMPORT VERIFICATION: an exported document read back — its own digest, every version's digest recomputed from its header and payload, the
   versions contiguous and of this object, every written version matched by the transition that wrote it, and the replay re-derived. Reads
   nothing stored: a document that verifies here verifies on any installation. */
CREATE OR REPLACE FUNCTION objects.lifecycle_verify_export(p_doc jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, canon, pg_catalog, pg_temp AS $$
DECLARE v_problems text[] := ARRAY[]::text[]; v jsonb; n int := 0; v_replay jsonb := '[]'::jsonb; t jsonb;
BEGIN
  IF p_doc IS NULL OR jsonb_typeof(p_doc) <> 'object' OR p_doc ->> 'format' IS DISTINCT FROM 'eye-lifecycle-export/1' THEN
    RETURN jsonb_build_object('valid', false, 'problems', jsonb_build_array('not an eye-lifecycle-export/1 document'));
  END IF;
  IF canon.sha256_hex(canon.jcs(p_doc - 'digest')) IS DISTINCT FROM p_doc ->> 'digest' THEN v_problems := v_problems || 'the document digest does not bind its content'::text; END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(coalesce(p_doc -> 'versions', '[]'::jsonb)) LOOP
    n := n + 1;
    IF (v ->> 'version')::int IS DISTINCT FROM n THEN v_problems := v_problems || format('version %s follows %s: the versions are not contiguous', v ->> 'version', n - 1); END IF;
    IF v -> 'header' ->> 'object_version' IS DISTINCT FROM v ->> 'version' OR v -> 'header' ->> 'object_id' IS DISTINCT FROM p_doc ->> 'object_id' THEN
      v_problems := v_problems || format('version %s: the header names another object or version', v ->> 'version');
    END IF;
    IF canon.sha256_hex(canon.jcs(jsonb_build_object('header', v -> 'header', 'payload', v -> 'payload'))) IS DISTINCT FROM v ->> 'content_digest' THEN
      v_problems := v_problems || format('version %s: its content digest does not recompute from its header and payload', v ->> 'version');
    END IF;
    SELECT x INTO t FROM jsonb_array_elements(coalesce(p_doc -> 'transitions', '[]'::jsonb)) x WHERE x ->> 'new_version' = v ->> 'version' AND x ->> 'outcome' IN ('accepted', 'compensated');
    IF jsonb_array_length(coalesce(p_doc -> 'transitions', '[]'::jsonb)) > 0 THEN
      IF t IS NULL THEN v_problems := v_problems || format('version %s: no transition in the document wrote it', v ->> 'version');
      ELSIF t ->> 'to' IS DISTINCT FROM v -> 'header' ->> 'lifecycle_state' THEN
        v_problems := v_problems || format('version %s: the transition says %s, the version says %s', v ->> 'version', t ->> 'to', v -> 'header' ->> 'lifecycle_state');
      END IF;
    END IF;
    v_replay := v_replay || jsonb_build_array(jsonb_build_object('version', (v ->> 'version')::int, 'state', v -> 'header' ->> 'lifecycle_state', 'recorded_at', v -> 'header' ->> 'recorded_at'));
    t := NULL;
  END LOOP;
  IF n = 0 THEN v_problems := v_problems || 'the document carries no version'::text; END IF;
  IF v_replay IS DISTINCT FROM p_doc -> 'replay' THEN v_problems := v_problems || 'the replay re-derived from the versions differs from the exported replay'::text; END IF;
  RETURN jsonb_build_object('valid', cardinality(v_problems) = 0, 'problems', to_jsonb(v_problems), 'versions', n, 'replay', v_replay, 'object_id', p_doc ->> 'object_id');
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_verify_export(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_verify_export(jsonb) TO eye_app, eye_commit;

-- §LC.9 THE MEASURE (V01-T-046: "lifecycle coverage", served unsupported with carrier B50 until now) ─────────────────────────────────────
/* V1 LIFECYCLE COVERAGE (rate; dimension object_type; 0113 §0.7 contract). READING — population: every canonical object of the domain that
   exists at the window's end (its first version recorded by min(p_to, p_as_of)); its state read at that instant (replay: nothing later).
   Numerator: the object is UNDER A DECLARED LIFECYCLE — its type's profile was declared by then and (a work object) the version standing then
   was written by a transition of the ledger, or (a module or canonical type) the canonical record's state is one the profile admits.
   Denominator: every object of the population; each one outside the numerator says why (no profile for its type or form; a version written
   outside the ledger; a state the profile does not know). Where no profile was declared by the window's end the result is INDETERMINATE
   (said: the register did not exist then — a 0 % would be a false reading). SCOPE: ignored — the lifecycle register is domain-wide. */
CREATE OR REPLACE FUNCTION analytics.mc_v1_lifecycle_coverage(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := least(p_to, p_as_of); v_type text := p_cohort ->> 'object_type'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb;
        v_newest timestamptz; v_reasons jsonb := '[]'::jsonb; v_profiles int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lifecycle coverage of the domain''s records (V1)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'V1-lifecycle-coverage', 'a lifecycle state is recorded with its version', p_params); END IF;
  SELECT count(DISTINCT o.object_id) INTO v_bound FROM objects.canonical_objects o
   WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= v_at AND (v_type IS NULL OR o.object_type = v_type);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'V1-lifecycle-coverage', v_bound, v_cap, 'record'); END IF;
  SELECT count(*) INTO v_profiles FROM objects.lifecycle_profiles x WHERE x.declared_at <= v_at;
  WITH latest AS (
    SELECT DISTINCT ON (o.object_id) o.object_id, o.object_type, o.object_version, o.lifecycle_state, o.schema_ref, o.recorded_at
      FROM objects.canonical_objects o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= v_at AND (v_type IS NULL OR o.object_type = v_type)
     ORDER BY o.object_id, o.object_version DESC),
  prof AS (SELECT DISTINCT ON (x.object_type) x.* FROM objects.lifecycle_profiles x WHERE x.declared_at <= v_at ORDER BY x.object_type, x.version DESC),
  judged AS (
    SELECT l.*, pr.governance, pr.schema_ref AS pschema,
      CASE
        WHEN pr.object_type IS NULL THEN format('no lifecycle profile declares %s', l.object_type)
        WHEN pr.governance = 'work_object' AND l.schema_ref IS DISTINCT FROM pr.schema_ref
          THEN format('the %s form has no lifecycle profile (the work-object profile governs %s)', l.schema_ref, pr.schema_ref)
        WHEN pr.governance = 'work_object' AND NOT EXISTS (SELECT 1 FROM objects.lifecycle_transitions t WHERE t.object_id = l.object_id AND t.new_version = l.object_version
                                                             AND t.outcome IN ('accepted', 'compensated') AND t.recorded_at <= v_at)
          THEN format('version %s was written outside the lifecycle ledger', l.object_version)
        WHEN pr.governance = 'module' AND NOT EXISTS (SELECT 1 FROM jsonb_each(pr.consistent) e, jsonb_array_elements_text(e.value) s WHERE s = l.lifecycle_state)
          THEN format('the canonical state %s is not one the %s profile admits', l.lifecycle_state, l.object_type)
        WHEN pr.governance = 'canonical' AND NOT (l.lifecycle_state = ANY (pr.states)) THEN format('the canonical state %s is not in the %s profile', l.lifecycle_state, l.object_type)
      END AS why_not
      FROM latest l LEFT JOIN prof pr ON pr.object_type = l.object_type)
  SELECT coalesce(jsonb_agg(analytics.mca_rec('record', format('%s:%s', j.object_type, j.object_id), CASE WHEN j.why_not IS NULL THEN 'numerator' ELSE 'denominator' END, j.why_not,
                    jsonb_strip_nulls(jsonb_build_object('object_type', j.object_type, 'governance', coalesce(j.governance, 'none'), 'state', j.lifecycle_state, 'version', j.object_version,
                                                         'recorded_at', j.recorded_at))) ORDER BY j.object_type, j.object_id), '[]'::jsonb),
         max(j.recorded_at)
    INTO v_recs, v_newest FROM judged j;
  IF v_profiles = 0 THEN
    v_reasons := v_reasons || to_jsonb('no lifecycle profile was declared by the window''s end: the lifecycle register did not exist then — a coverage reading for this window would be false'::text);
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'read_at', v_at, 'profiles_in_force', v_profiles, 'scope_rule', 'ignored: the lifecycle register is domain-wide')), 'object_type', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_v1_lifecycle_coverage(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('v1_lifecycle_coverage', 'analytics.mc_v1_lifecycle_coverage', 'rate', ARRAY['object_type'],
  ARRAY['objects.canonical_objects', 'objects.lifecycle_profiles', 'objects.lifecycle_transitions'], 'ignored: the lifecycle register is domain-wide',
  'V1 lifecycle coverage (V01-T-046): objects existing at the window''s end that stand under a declared lifecycle — a work object''s version written by its ledger, a module or canonical type''s state admitted by its profile', '0120 §LC');

-- §LC.10 THE CHECKS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM analytics.computation_registry r WHERE r.computation_key = 'v1_lifecycle_coverage' AND r.registered_in = '0120 §LC') THEN
    RAISE EXCEPTION 'migration 0120 §LC: the lifecycle coverage computation is not registered';
  END IF;
  IF (SELECT count(*) FROM observation.canonical_write_actions w WHERE w.action IN ('objects.work_object.author', 'objects.lifecycle.transition', 'objects.lifecycle.proposal.decide') AND w.object_types = ARRAY['ASM']) <> 3 THEN
    RAISE EXCEPTION 'migration 0120 §LC: the three work-object write actions are not pinned to ASM';
  END IF;
END $$;

-- ═══ FOLD §CI (from 0120_b50_x_ci.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §CI — CP-6 B50: IMPACT TRAVERSAL, TRIGGERS AND AFFECTED-PRODUCT CLASSES (F-P3-05's reach: V03-T-294, V03-T-304, ES-30-003,
-- AI-27-005, AI-43-005, DP-24-001, DAT-OP-10; F-P3-03: V03-T-203, AI-06-004, AI-29-005; re-verified: V02-T-129, V03-T-028, DAT-SM-08).
-- Part-local file (folded into the one 0120 at integration, after §0, §HD, §LC, §PV); applies ALONE on 0001–0119 + the prelude (0120 §0).
--
-- THE GAP. The walk (graph/strategy/impact.service.ts, walker 1.0.0) reached assumptions, objectives, decisions, commitments, forecasts,
-- scenarios, warnings, twins, simulations, briefings, memory items and the B32 strategy nodes — and stopped there: a DECISION PACKAGE whose
-- option cites the corrected evidence, a PUBLICATION that published a briefing resting on it, an EXPORT PACKAGE that shipped its manifest
-- and the EVALUATION DATASETS (backtests, frozen information sets, method validations) and LESSONS learned on it were not in the answer. Each
-- reached object was listed, never CLASSED: nothing said which conclusions may no longer be safe, which need a governed re-run, which wait
-- for their owner, which are already current. And only corrections, withdrawals, edge retractions and entity splits opened a walk: a legal
-- request, a model incident, an ontology correction, a data-quality finding, a rights change, an integrity failure or a human challenge had
-- no way in.
--
-- THE MECHANISM.
-- (CI.1) THE TRIGGERS: graph.invalidations_current.trigger_kind widened (the CHECK copied whole from 0025:49) with the seven kinds; one
--   SEEDING PORT per kind (graph.seed_<kind>) — the named steward's act (the role re-checked in the port, a human, the acting principal the
--   session's) on one object of the domain with its reason and its kind's basis (the request, the method, the ontology version, the finding,
--   the source's rights state, the manifest, the challenge) — records graph.impact_triggers (state recorded). THE WALK IS THE AGENT'S: the
--   domain's propagation agent (0060) walks a recorded trigger automatically through its own session and the same governed path as a
--   correction's walk (impact_trigger_receive under the schedule capability, then impact_trigger_begin / _done inside the walk's transaction
--   under graph.impact.propagate, the agent's principal only), and a refused or failed walk is recorded on the trigger
--   (impact_trigger_fail) with its reason; impact_triggers_to_walk lists what a cold process re-drives. Never an operator-only walk.
-- (CI.2) THE WALK'S NEW BUCKETS read through ONE relation, graph.walk_product_citations (security_invoker: the caller's RLS): a decision
--   package VERSION by its options' consequence citations and by the DEC it is for; a publication VERSION by its source (a briefing, or a
--   report = a decision package); an export package by the evidence of each manifest its approved scope executed (retention.scope_items);
--   a frozen information set by the evidence versions it froze and the forecast that pins it; a backtest and a method validation by the
--   series (and, for a model incident, the method) they validated; a lesson by the package and the memory item it was learned into.
-- (CI.3) THE CLASSES: graph.affected_class_rules — the VERSIONED classification rule (affected-class@1, its digest; read-only, a new version
--   is a migration and a new walker); graph.affected_products — one APPEND-ONLY row per product an assessed walk reached, with its bucket, its
--   class (current | stale | challenged | withdrawn | recompute | human_review), the rule version, the FACTS the class was derived from
--   (read from the database at record time, never taken from the caller), the accountable owner, the reach and the path. graph.record_impact
--   (re-declared whole from 0089 §G8) writes them for every bucket (the existing and the new) in the walk's own transaction.
--   graph.case_affected_products is the STABLE READ §CL closes against: per correction case, the products of the latest walk of each root.
--
-- THE PRINCIPLES. The walk reports; it does not decide: recompute is a governed re-run REQUEST to the owner (closed by their act — §CL),
-- human_review the owner's acknowledgement, and no decision, commitment, forecast, briefing, publication or export is rewritten here. THREE
-- CLAIMS: construction (this file, its harness phase6-impact-b50); demonstrated operation (the act, SYNTHETIC); real acceptance never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ─── §CI.1 THE TRIGGER VOCABULARY — the CHECK copied whole from 0025:49, the seven B50 kinds added ───────────────────────────────────────
ALTER TABLE graph.invalidations_current
  DROP CONSTRAINT invalidations_current_trigger_kind_check;
ALTER TABLE graph.invalidations_current
  ADD CONSTRAINT invalidations_current_trigger_kind_check
  CHECK (trigger_kind IN (
    'claim_correction', 'claim_withdrawal', 'edge_retraction',
    'entity_split', 'evidence_correction', 'manual',
    -- B50 ci: the seven triggers (V03-T-304, AI-29-005), each seeded by its own port (§CI.4)
    'legal_request', 'model_incident', 'ontology_correction', 'data_quality_finding', 'rights_change', 'integrity_failure', 'human_challenge'));

-- ─── §CI.2 THE VERSIONED CLASSIFICATION RULE ─────────────────────────────────────────────────────────────────────────────────────────────
-- A rule names its precedence (the facts that override the kind's class, in order) and the class of each product kind. Seeded once; a
-- changed rule is a NEW version (a migration — the walker's method names the rule version, so a new rule is a new walker, 0060's discipline).
CREATE TABLE graph.affected_class_rules (
  rule_version  text PRIMARY KEY CHECK (rule_version ~ '^affected-class@[0-9]+$'),
  rule          jsonb NOT NULL CHECK (jsonb_typeof(rule) = 'object' AND jsonb_typeof(rule -> 'precedence') = 'array' AND jsonb_typeof(rule -> 'kinds') = 'object'),
  rule_digest   text NOT NULL CHECK (rule_digest ~ '^[0-9a-f]{64}$'),
  statement     text NOT NULL CHECK (length(btrim(statement)) >= 16),
  active        boolean NOT NULL,
  declared_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX gacr_one_active ON graph.affected_class_rules (active) WHERE active;
CREATE TRIGGER gacr_append_only BEFORE UPDATE OR DELETE ON graph.affected_class_rules FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
INSERT INTO graph.affected_class_rules (rule_version, rule, rule_digest, statement, active)
SELECT 'affected-class@1', r, encode(sha256(convert_to(r::text, 'UTF8')), 'hex'),
       'B50 (0120 §CI): withdrawn products first, then products under an open challenge, then products that already reflect the change (current); otherwise the kind''s class — a derived product is recomputed (a governed re-run request to its owner), a published or cited view is stale, a person''s decision, commitment, memory or package is the owner''s review.',
       true
  FROM (SELECT jsonb_build_object(
          'precedence', jsonb_build_array(
            jsonb_build_object('fact', 'withdrawn', 'class', 'withdrawn'),
            jsonb_build_object('fact', 'challenged', 'class', 'challenged'),
            jsonb_build_object('fact', 'current', 'class', 'current')),
          'kinds', jsonb_build_object(
            'claim', 'stale', 'entity', 'stale', 'edge', 'stale',
            'assumption', 'human_review', 'objective', 'human_review', 'decision', 'human_review', 'commitment', 'human_review', 'strategy_node', 'human_review',
            'forecast', 'recompute', 'twin', 'recompute', 'simulation', 'recompute',
            'scenario', 'stale', 'warning', 'stale', 'briefing', 'stale', 'publication', 'stale',
            'memory_item', 'human_review', 'decision_package', 'human_review', 'lesson', 'human_review',
            'export_package', 'recompute', 'information_set', 'recompute', 'backtest', 'recompute', 'method_validation', 'recompute'),
          'fallback', 'human_review') AS r) x;
ALTER TABLE graph.affected_class_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.affected_class_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY gacr_visible ON graph.affected_class_rules FOR SELECT TO eye_app, eye_commit USING (true);
REVOKE ALL ON graph.affected_class_rules FROM PUBLIC;
GRANT SELECT ON graph.affected_class_rules TO eye_app, eye_commit;
COMMENT ON TABLE graph.affected_class_rules IS 'B50 §CI (0120; AI-06-004): the VERSIONED rule that classes every product a walk reached — current, stale, challenged, withdrawn, recompute, human_review. The precedence (withdrawn, challenged, current) overrides the kind''s class. Read-only: a new rule is a new version (a migration) and a new walker.';

-- THE CLASS of one product under a rule, from its facts (pure: the same rule and facts give the same class).
CREATE OR REPLACE FUNCTION graph.classify_affected(p_rule jsonb, p_kind text, p_facts jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE p jsonb;
BEGIN
  FOR p IN SELECT * FROM jsonb_array_elements(coalesce(p_rule -> 'precedence', '[]'::jsonb)) LOOP
    IF coalesce((p_facts ->> (p ->> 'fact'))::boolean, false) THEN RETURN p ->> 'class'; END IF;
  END LOOP;
  RETURN coalesce(p_rule -> 'kinds' ->> p_kind, p_rule ->> 'fallback', 'human_review');
END $$;
REVOKE ALL ON FUNCTION graph.classify_affected(jsonb, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.classify_affected(jsonb, text, jsonb) TO eye_app, eye_commit;

-- ─── §CI.3 THE AFFECTED PRODUCTS (append-only; one row per product an assessed walk reached) ─────────────────────────────────────────────
CREATE TABLE graph.affected_products (
  affected_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  invalidation_id    uuid NOT NULL REFERENCES graph.invalidations_current (invalidation_id),
  correction_case_id uuid,
  trigger_kind       text NOT NULL,
  trigger_object_id  uuid NOT NULL,
  bucket             text NOT NULL CHECK (bucket IN ('assumptions', 'objectives', 'decisions', 'commitments', 'strategy_nodes', 'forecasts', 'scenarios', 'warnings',
                       'twins', 'simulations', 'briefings', 'memory_items', 'graph_state', 'decision_packages', 'publications', 'export_packages', 'evaluation_datasets', 'lessons')),
  product_kind       text NOT NULL CHECK (product_kind IN ('claim', 'entity', 'edge', 'assumption', 'objective', 'decision', 'commitment', 'strategy_node', 'forecast', 'scenario',
                       'warning', 'twin', 'simulation', 'briefing', 'memory_item', 'decision_package', 'publication', 'export_package', 'information_set', 'backtest',
                       'method_validation', 'lesson')),
  object_type        text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$|^[a-z][a-z_]{2,40}$'),
  product_id         uuid NOT NULL,
  product_version    int CHECK (product_version IS NULL OR product_version >= 1),
  product_ref        text NOT NULL,
  title              text NOT NULL,
  class              text NOT NULL CHECK (class IN ('current', 'stale', 'challenged', 'withdrawn', 'recompute', 'human_review')),
  rule_version       text NOT NULL REFERENCES graph.affected_class_rules (rule_version),
  facts              jsonb NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  owner_principal_id uuid,
  reached_via        text NOT NULL,
  hop                int NOT NULL CHECK (hop >= 0),
  path               jsonb NOT NULL CHECK (jsonb_typeof(path) = 'array'),
  recorded_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gap_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gap_once UNIQUE NULLS NOT DISTINCT (invalidation_id, product_kind, product_id, product_version)
);
CREATE INDEX gap_case ON graph.affected_products (correction_case_id, recorded_at) WHERE correction_case_id IS NOT NULL;
CREATE INDEX gap_product ON graph.affected_products (tenant_id, domain_id, product_id, recorded_at DESC);
CREATE TRIGGER gap_append_only BEFORE UPDATE OR DELETE ON graph.affected_products FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE graph.affected_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.affected_products FORCE ROW LEVEL SECURITY;
CREATE POLICY graph_isolation ON graph.affected_products
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON graph.affected_products FROM PUBLIC;
GRANT SELECT ON graph.affected_products TO eye_app, eye_commit;
COMMENT ON TABLE graph.affected_products IS 'B50 §CI (0120; AI-06-004, V03-T-203, V03-T-294, ES-30-003, DAT-OP-10): every product an assessed walk reached, CLASSED under the versioned rule from facts the database read at record time (withdrawn, challenged, current, the kind) — with its bucket, its accountable owner, how it was reached and the path from the changed object. Append-only: a later walk records its own rows; the latest walk of a root is the answer (graph.case_affected_products).';

/*
 * THE STABLE READ §CL CLOSES AGAINST (security_invoker: the caller's RLS): per correction case, the products of the LATEST assessed walk of
 * each corrected root (a re-walk of a root supersedes its earlier rows; another root's rows stand). Columns are the contract:
 *   case_id, invalidation_id, root (the trigger object), affected_id, bucket, product_kind, object_type, product_id, product_version,
 *   product_ref, title, class, rule_version, owner_principal_id, reached_via, hop, path, facts, recorded_at.
 * A material product is one whose class is not `current`.
 */
CREATE VIEW graph.case_affected_products WITH (security_invoker = true) AS
  SELECT a.correction_case_id AS case_id, a.invalidation_id, a.trigger_object_id AS root, a.affected_id, a.bucket, a.product_kind, a.object_type,
         a.product_id, a.product_version, a.product_ref, a.title, a.class, a.rule_version, a.owner_principal_id, a.reached_via, a.hop, a.path,
         a.facts, a.recorded_at, a.tenant_id, a.domain_id
    FROM graph.affected_products a
   WHERE a.correction_case_id IS NOT NULL
     AND a.invalidation_id = (SELECT i.invalidation_id FROM graph.invalidations_current i
                               WHERE i.correction_case_id = a.correction_case_id AND i.trigger_object_id = a.trigger_object_id AND i.state = 'assessed'
                               ORDER BY i.assessed_at DESC, i.invalidation_id DESC LIMIT 1);
REVOKE ALL ON graph.case_affected_products FROM PUBLIC;
GRANT SELECT ON graph.case_affected_products TO eye_app, eye_commit;
COMMENT ON VIEW graph.case_affected_products IS 'B50 §CI (0120): THE STABLE READ for §CL — per correction case, the classed products of the latest assessed walk of each corrected root. A material product is one whose class is not current.';

-- ─── §CI.4 THE WALK'S NEW BUCKETS, as one relation the walk reads (security_invoker: every underlying table's RLS applies to the caller) ──
-- One row per (product, what it cites). cites_kind follows graph.dependencies' vocabulary where it can (claim, evidence, forecast, warning,
-- run, assumption — an option's consequence kinds — and strategy for the DEC a package is for), plus briefing / decision_package /
-- memory_item / backtest (product to product) and series / method (cites_ref: the key an evaluation record validated). subject_ref is the
-- series the product itself is about (an information set, a backtest, a validation) — a reached one widens the walk to the series' other
-- evaluation records.
CREATE VIEW graph.walk_product_citations WITH (security_invoker = true) AS
  SELECT 'decision_package'::text AS product_kind, 'DPK'::text AS object_type, o.package_id AS product_id, o.version AS product_version,
         (c ->> 'kind') AS cites_kind, (c ->> 'id')::uuid AS cites_id, NULL::text AS cites_ref, (c ->> 'version')::int AS cited_version,
         p.title, p.owner_principal_id, v.known_at AS product_at, NULL::text AS subject_ref, o.tenant_id, o.domain_id
    FROM decision.options o
    JOIN decision.package_versions v ON v.package_id = o.package_id AND v.version = o.version
    JOIN decision.packages_current p ON p.package_id = o.package_id
    CROSS JOIN LATERAL jsonb_array_elements(o.consequences) c
  UNION ALL
  SELECT 'decision_package', 'DPK', v.package_id, v.version, 'strategy', p.decision_object_id, NULL, NULL, p.title, p.owner_principal_id, v.known_at, NULL, v.tenant_id, v.domain_id
    FROM decision.package_versions v JOIN decision.packages_current p ON p.package_id = v.package_id
  UNION ALL
  SELECT 'publication', 'PUB', pv.publication_id, pv.version, CASE pv.source_kind WHEN 'briefing' THEN 'briefing' ELSE 'decision_package' END, pv.source_id, NULL, pv.source_version,
         pb.title, pv.drafted_by, pv.drafted_at, NULL, pv.tenant_id, pv.domain_id
    FROM executive.publication_versions pv JOIN executive.publications pb ON pb.publication_id = pv.publication_id
  UNION ALL
  SELECT 'export_package', 'export_package', x.action_id, NULL, 'evidence', e.object_id, si.ref, e.object_version,
         'export package ' || x.action_id::text || ' (' || x.object_count || ' object(s))', x.built_by, x.built_at, NULL, x.tenant_id, x.domain_id
    FROM retention.export_packages x
    JOIN retention.scope_items si ON si.action_id = x.action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute'
    JOIN (SELECT o.object_id, o.object_version, o.tenant_id, o.domain_id, o.payload ->> 'manifest_id' AS manifest_id
            FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.payload ? 'manifest_id') e
      ON e.manifest_id = si.ref AND e.tenant_id = x.tenant_id AND e.domain_id = x.domain_id
  UNION ALL
  SELECT 'information_set', 'information_set', s.information_set_id, NULL, 'evidence', (ev ->> 'evidence_object_id')::uuid, NULL, (ev ->> 'evidence_version')::int,
         'information set for ' || s.series_key || ' known at ' || to_char(s.known_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), s.frozen_by, s.frozen_at, s.series_key, s.tenant_id, s.domain_id
    FROM prediction.information_sets s CROSS JOIN LATERAL jsonb_array_elements(s.evidence) ev
   WHERE ev ? 'evidence_object_id'
  UNION ALL
  SELECT 'information_set', 'information_set', s.information_set_id, NULL, 'forecast', f.forecast_id, NULL, NULL,
         'information set for ' || s.series_key || ' known at ' || to_char(s.known_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), s.frozen_by, s.frozen_at, s.series_key, s.tenant_id, s.domain_id
    FROM prediction.forecasts_current f JOIN prediction.information_sets s ON s.information_set_id = f.information_set_id
  UNION ALL
  SELECT 'backtest', 'backtest', b.backtest_id, NULL, 'series', NULL, b.series_key, NULL,
         'backtest of ' || b.method || ' on ' || b.series_key || ' (' || b.horizon_code || ')', b.computed_by, b.computed_at, b.series_key, b.tenant_id, b.domain_id
    FROM prediction.backtests b
  UNION ALL
  SELECT 'backtest', 'backtest', b.backtest_id, NULL, 'method', NULL, b.method, NULL,
         'backtest of ' || b.method || ' on ' || b.series_key || ' (' || b.horizon_code || ')', b.computed_by, b.computed_at, b.series_key, b.tenant_id, b.domain_id
    FROM prediction.backtests b
  UNION ALL
  SELECT 'method_validation', 'method_validation', m.validation_id, NULL, k.kind, k.id, k.ref, NULL,
         'validation of ' || m.method_ref || ' on ' || m.series_key || ' (' || m.horizon_code || ')', m.computed_by, m.computed_at, m.series_key, m.tenant_id, m.domain_id
    FROM prediction.method_validations m
    CROSS JOIN LATERAL (VALUES ('series'::text, NULL::uuid, m.series_key), ('method', NULL, m.method_ref), ('backtest', m.backtest_id, NULL)) k(kind, id, ref)
  UNION ALL
  SELECT 'lesson', 'lesson', l.lesson_id, NULL, k.kind, k.id, NULL, k.version, l.title, l.linked_by, l.linked_at, NULL, l.tenant_id, l.domain_id
    FROM decision.lessons l
    CROSS JOIN LATERAL (VALUES ('decision_package'::text, l.package_id, NULL::int), ('memory_item', l.memory_item_id, l.memory_version)) k(kind, id, version);
REVOKE ALL ON graph.walk_product_citations FROM PUBLIC;
GRANT SELECT ON graph.walk_product_citations TO eye_app, eye_commit;
COMMENT ON VIEW graph.walk_product_citations IS 'B50 §CI (0120; V03-T-294, ES-30-003, AI-27-005, DP-24-001, DAT-OP-10): the products the walk reaches beyond graph.dependencies — decision package versions (option citations, the DEC), publication versions (their source), export packages (each executed manifest''s evidence), frozen information sets, backtests, method validations (the series and the method they validated) and lessons — one row per (product, what it cites), read as the caller (security_invoker).';

-- ─── §CI.5 THE TRIGGERS' LEDGER (the seven B50 kinds; the walk is the propagation agent's) ─────────────────────────────────────────────────
-- One row per recorded trigger: the object it names (its type, id and the version recorded then), the steward's reason and the kind's basis,
-- the walk's state (recorded → walking → walked | failed; a failed trigger is re-driven) and the invalidation it produced. Only the ports
-- below write it; the events are append-only. A human_challenge is OPEN until the deciding person closes it (closed_*: never its opener).
CREATE TABLE graph.impact_triggers (
  trigger_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  trigger_kind    text NOT NULL CHECK (trigger_kind IN ('legal_request', 'model_incident', 'ontology_correction', 'data_quality_finding', 'rights_change', 'integrity_failure', 'human_challenge')),
  object_type     text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  object_id       uuid NOT NULL,
  object_version  int CHECK (object_version IS NULL OR object_version >= 1),
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  basis           jsonb NOT NULL CHECK (jsonb_typeof(basis) = 'object'),
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  state           text NOT NULL DEFAULT 'recorded' CHECK (state IN ('recorded', 'walking', 'walked', 'failed')),
  attempts        int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  agent_id        uuid,
  last_error      text,
  invalidation_id uuid,
  walked_at       timestamptz,
  closed_by       uuid,
  closed_at       timestamptz,
  close_reason    text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT git_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT git_walked CHECK ((state = 'walked') = (invalidation_id IS NOT NULL AND walked_at IS NOT NULL)),
  CONSTRAINT git_closed CHECK ((closed_at IS NULL) = (closed_by IS NULL) AND (closed_at IS NULL) = (close_reason IS NULL) AND (closed_at IS NULL OR trigger_kind = 'human_challenge'))
);
CREATE INDEX git_domain_state ON graph.impact_triggers (tenant_id, domain_id, state, recorded_at);
CREATE INDEX git_object ON graph.impact_triggers (object_id, trigger_kind);
CREATE TABLE graph.impact_trigger_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  trigger_id         uuid NOT NULL REFERENCES graph.impact_triggers (trigger_id),
  event              text NOT NULL CHECK (event IN ('trigger.recorded', 'trigger.received', 'trigger.walking', 'trigger.walked', 'trigger.failed', 'trigger.closed')),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gite_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gite_trigger ON graph.impact_trigger_events (trigger_id, occurred_at);
CREATE TRIGGER gite_append_only BEFORE UPDATE OR DELETE ON graph.impact_trigger_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
-- The ledger row takes only the ports' transitions; its identity never moves.
CREATE OR REPLACE FUNCTION graph.impact_triggers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table graph.impact_triggers is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF NEW.trigger_id IS DISTINCT FROM OLD.trigger_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.trigger_kind IS DISTINCT FROM OLD.trigger_kind OR NEW.object_type IS DISTINCT FROM OLD.object_type OR NEW.object_id IS DISTINCT FROM OLD.object_id
     OR NEW.object_version IS DISTINCT FROM OLD.object_version OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.basis IS DISTINCT FROM OLD.basis
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR (OLD.state = 'walked' AND (NEW.state IS DISTINCT FROM 'walked' OR NEW.invalidation_id IS DISTINCT FROM OLD.invalidation_id))
     OR (OLD.closed_at IS NOT NULL AND (NEW.closed_at IS DISTINCT FROM OLD.closed_at OR NEW.closed_by IS DISTINCT FROM OLD.closed_by)) THEN
    RAISE EXCEPTION 'an impact trigger''s record does not change; only its walk''s state moves (once walked, it stays walked) and a challenge closes once' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER git_guard BEFORE UPDATE OR DELETE ON graph.impact_triggers FOR EACH ROW EXECUTE FUNCTION graph.impact_triggers_guard();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['impact_triggers', 'impact_trigger_events'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY graph_isolation ON graph.%I USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('REVOKE ALL ON graph.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
COMMENT ON TABLE graph.impact_triggers IS 'B50 §CI (0120; V03-T-304, AI-29-005): the seven B50 impact triggers — legal request, model incident, ontology correction, data-quality finding, rights change, integrity failure, human challenge — each recorded by its steward''s port on one object of the domain with its reason and basis, and WALKED BY THE DOMAIN''S PROPAGATION AGENT (0060) automatically; a refused or failed walk is recorded with its reason and re-driven.';

-- ─── §CI.6 THE FACTS a class is derived from (read from the database at record time; never the caller's) ─────────────────────────────────
-- THE OPEN-CHALLENGE QUESTION (a seam: §PV's graph.knowledge_challenges joins it at integration — the integrator re-declares this stub
-- WHOLE adding that table). Today: an open simulation challenge on a run (0081), an unresolved package challenge on a version (0094), and an
-- unwalked or walked human_challenge trigger on the object not yet closed (§CI.5) — a challenge is open until the deciding person's act closes it (§PV).
CREATE OR REPLACE FUNCTION graph._open_challenge(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS boolean
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT (p_kind = 'simulation' AND EXISTS (SELECT 1 FROM simulation.challenges c WHERE c.run_id = p_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state IN ('open', 'rerun_requested')))
      OR (p_kind = 'decision_package' AND EXISTS (SELECT 1 FROM decision.challenges c WHERE c.package_id = p_id AND (p_version IS NULL OR c.version = p_version) AND c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.resolved_at IS NULL))
      OR EXISTS (SELECT 1 FROM graph.impact_triggers t WHERE t.object_id = p_id AND t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.trigger_kind = 'human_challenge' AND t.closed_at IS NULL);
$$;
REVOKE ALL ON FUNCTION graph._open_challenge(uuid, uuid, text, uuid, int) FROM PUBLIC;

/*
 * The facts of one product: exists (it resolves in this tenant and domain), withdrawn, challenged, current (it already reflects the change),
 * the owner, the title, the version. "Current" is asked only of a CORRECTION (evidence_correction, claim_correction, claim_withdrawal — the
 * kinds that record a new version of the changed object): a product that took its input after the change, or cites the changed object at its
 * latest version, is current. A trigger of the other kinds (a finding about the object as it is) leaves nothing current.
 */
CREATE OR REPLACE FUNCTION graph.affected_facts(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int, p_trigger_kind text, p_trigger uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE
  v_corr boolean := p_trigger_kind IN ('evidence_correction', 'claim_correction', 'claim_withdrawal');
  t record; r record; v_exists boolean := false; v_withdrawn boolean := false; v_current boolean := false; v_owner uuid; v_title text; v_state text; v_version int := p_version;
BEGIN
  -- the changed object's latest version (a canonical object; an entity or edge trigger has none)
  SELECT o.object_version, o.recorded_at, o.content_digest, o.object_type, o.payload ->> 'manifest_id' AS manifest_id INTO t
    FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1;
  IF p_kind IN ('assumption', 'objective', 'decision', 'commitment', 'strategy_node') THEN
    SELECT s.title, s.status, s.owner_principal_id, s.object_version INTO r FROM graph.strategy_current s WHERE s.strategy_object_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.status; v_owner := r.owner_principal_id; v_withdrawn := r.status = 'withdrawn'; v_version := coalesce(v_version, r.object_version);
  ELSIF p_kind = 'forecast' THEN
    SELECT f.series_key || ' · ' || f.horizon_code || ' · ' || f.method AS title, f.state, f.issued_by INTO r FROM prediction.forecasts_current f WHERE f.forecast_id = p_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.state; v_owner := r.issued_by; v_withdrawn := r.state = 'withdrawn';
  ELSIF p_kind = 'scenario' THEN
    SELECT s.title, s.state, s.owner_principal_id, s.current_version INTO r FROM prediction.scenarios_current s WHERE s.scenario_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.state; v_owner := r.owner_principal_id; v_withdrawn := r.state = 'retired'; v_version := coalesce(v_version, r.current_version);
  ELSIF p_kind = 'warning' THEN
    SELECT w.title, w.state, w.routed_to INTO r FROM prediction.warnings_current w WHERE w.warning_id = p_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.state; v_owner := r.routed_to;
  ELSIF p_kind = 'twin' THEN
    SELECT w.title, w.owner_principal_id INTO r FROM twin.twins_current w WHERE w.twin_id = p_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_owner := r.owner_principal_id;
  ELSIF p_kind = 'simulation' THEN
    SELECT s.run_kind || ' run on twin version ' || s.twin_version AS title, s.state, s.validity, s.operator_principal_id INTO r FROM simulation.runs_current s WHERE s.run_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.state; v_owner := r.operator_principal_id; v_withdrawn := r.validity = 'invalidated';
  ELSIF p_kind = 'briefing' THEN
    SELECT b.known_at, b.composed_at, b.composed_by INTO r FROM executive.briefings b WHERE b.briefing_id = p_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    v_exists := FOUND; v_owner := r.composed_by; v_title := 'briefing composed ' || to_char(r.composed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    v_current := v_corr AND v_exists AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > r.known_at);
  ELSIF p_kind = 'memory_item' THEN
    SELECT m.title, m.state, m.owner_principal_id, m.recorded_at, m.object_version INTO r FROM memory.items_current m WHERE m.item_id = p_id AND m.tenant_id = p_tenant AND m.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.state; v_owner := r.owner_principal_id; v_withdrawn := r.state = 'withdrawn'; v_version := coalesce(v_version, r.object_version);
    v_current := v_corr AND v_exists AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > r.recorded_at);
  ELSIF p_kind = 'claim' THEN
    SELECT o.object_type, o.lifecycle_state, o.object_version INTO r FROM objects.canonical_objects o WHERE o.object_id = p_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1;
    v_exists := FOUND; v_title := r.object_type || ' ' || p_id::text; v_state := r.lifecycle_state; v_withdrawn := r.lifecycle_state IN ('withdrawn', 'deleted'); v_version := coalesce(v_version, r.object_version);
    -- current: the corrected claim itself, or a claim whose latest lineage was derived from the corrected evidence's latest version
    v_current := v_corr AND v_exists AND (p_id = p_trigger
                 OR (t.object_type = 'EVD' AND EXISTS (SELECT 1 FROM intelligence.claim_lineage l WHERE l.claim_object_id = p_id AND l.claim_version = r.object_version
                                                          AND l.evidence_object_id = p_trigger AND l.evidence_digest = t.content_digest)));
  ELSIF p_kind = 'entity' THEN
    SELECT e.canonical_name, e.lifecycle_state INTO r FROM graph.entities_current e WHERE e.entity_id = p_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
    v_exists := FOUND; v_title := r.canonical_name; v_state := r.lifecycle_state; v_withdrawn := r.lifecycle_state = 'retired';
  ELSIF p_kind = 'edge' THEN
    SELECT e.predicate, e.state, e.retracted_at INTO r FROM graph.edges_current e WHERE e.edge_id = p_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
    v_exists := FOUND; v_title := 'edge ' || r.predicate; v_state := r.state; v_withdrawn := r.retracted_at IS NOT NULL;
  ELSIF p_kind = 'decision_package' THEN
    SELECT p.title, p.state AS pstate, v.state AS vstate, p.owner_principal_id INTO r FROM decision.package_versions v JOIN decision.packages_current p ON p.package_id = v.package_id
     WHERE v.package_id = p_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.pstate || '/' || r.vstate; v_owner := r.owner_principal_id;
    v_withdrawn := r.pstate IN ('withdrawn', 'rejected') OR r.vstate = 'rejected';
    -- current: the version cites the changed object directly, and only at its latest version
    v_current := v_corr AND v_exists AND t.object_version IS NOT NULL
                 AND EXISTS (SELECT 1 FROM decision.options o, jsonb_array_elements(o.consequences) c WHERE o.package_id = p_id AND o.version = p_version AND (c ->> 'id')::uuid = p_trigger)
                 AND NOT EXISTS (SELECT 1 FROM decision.options o, jsonb_array_elements(o.consequences) c WHERE o.package_id = p_id AND o.version = p_version AND (c ->> 'id')::uuid = p_trigger
                                    AND coalesce((c ->> 'version')::int, 0) < t.object_version);
  ELSIF p_kind = 'publication' THEN
    SELECT pb.title, pb.state AS pstate, pv.state AS vstate, pv.drafted_by, pv.source_kind, pv.source_id INTO r FROM executive.publication_versions pv JOIN executive.publications pb ON pb.publication_id = pv.publication_id
     WHERE pv.publication_id = p_id AND pv.version = p_version AND pv.tenant_id = p_tenant AND pv.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.pstate || '/' || r.vstate; v_owner := r.drafted_by; v_withdrawn := r.pstate = 'withdrawn' OR r.vstate = 'withdrawn';
    -- current: it publishes a briefing that already reflected the change
    v_current := v_corr AND v_exists AND r.source_kind = 'briefing'
                 AND EXISTS (SELECT 1 FROM executive.briefings b WHERE b.briefing_id = r.source_id AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > b.known_at));
  ELSIF p_kind = 'export_package' THEN
    SELECT x.built_by, x.revoked_at, x.object_count, x.built_at INTO r FROM retention.export_packages x WHERE x.action_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    v_exists := FOUND; v_title := 'export package ' || p_id::text || ' (' || r.object_count || ' object(s))'; v_owner := r.built_by; v_withdrawn := r.revoked_at IS NOT NULL;
    v_state := CASE WHEN r.revoked_at IS NULL THEN 'built' ELSE 'revoked' END;
    -- current: it was BUILT after the change (the build exports each manifest's LATEST evidence version — 0120 §0's export check — so a
    -- package built after the correction carries the corrected version; a correction keeps the manifest and marks the record)
    v_current := v_corr AND v_exists AND t.recorded_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > r.built_at);
  ELSIF p_kind = 'information_set' THEN
    SELECT s.series_key, s.frozen_by, s.known_at, s.evidence INTO r FROM prediction.information_sets s WHERE s.information_set_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    v_exists := FOUND; v_title := 'information set for ' || r.series_key; v_owner := r.frozen_by; v_state := 'frozen';
    v_current := v_corr AND v_exists AND t.object_version IS NOT NULL
                 AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.evidence) ev WHERE (ev ->> 'evidence_object_id')::uuid = p_trigger)
                 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.evidence) ev WHERE (ev ->> 'evidence_object_id')::uuid = p_trigger AND coalesce((ev ->> 'evidence_version')::int, 0) < t.object_version);
  ELSIF p_kind = 'backtest' THEN
    SELECT b.method, b.series_key, b.computed_by, b.computed_at INTO r FROM prediction.backtests b WHERE b.backtest_id = p_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    v_exists := FOUND; v_title := 'backtest of ' || r.method || ' on ' || r.series_key; v_owner := r.computed_by; v_state := 'computed';
    v_current := v_corr AND v_exists AND t.recorded_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > r.computed_at);
  ELSIF p_kind = 'method_validation' THEN
    SELECT m.method_ref, m.series_key, m.computed_by, m.computed_at INTO r FROM prediction.method_validations m WHERE m.validation_id = p_id AND m.tenant_id = p_tenant AND m.domain_id = p_domain;
    v_exists := FOUND; v_title := 'validation of ' || r.method_ref || ' on ' || r.series_key; v_owner := r.computed_by; v_state := 'computed';
    v_current := v_corr AND v_exists AND t.recorded_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > r.computed_at);
  ELSIF p_kind = 'lesson' THEN
    SELECT l.title, l.linked_by INTO r FROM decision.lessons l WHERE l.lesson_id = p_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_owner := r.linked_by; v_state := 'linked';
  END IF;
  RETURN jsonb_build_object('exists', v_exists, 'withdrawn', coalesce(v_withdrawn, false), 'current', coalesce(v_current, false),
                            'challenged', v_exists AND (p_trigger_kind = 'human_challenge' OR graph._open_challenge(p_tenant, p_domain, p_kind, p_id, p_version)),
                            'state', v_state, 'owner', v_owner, 'title', v_title, 'version', v_version,
                            'trigger_kind', p_trigger_kind, 'change_version', t.object_version);
END $$;
REVOKE ALL ON FUNCTION graph.affected_facts(uuid, uuid, text, uuid, int, text, uuid) FROM PUBLIC;

/*
 * The walk's buckets CLASSED and recorded (internal: called by graph.record_impact in the walk's own transaction, as its definer; §CI.7). Each item
 * of each bucket resolves to (kind, type, id, version); its facts are read here; the class is the active rule's; one append-only row per
 * product. An item that does not resolve in this tenant and domain is not recorded and is COUNTED (products_unresolved) — a walk of the
 * domain's own rows never produces one. Answers the counts per class, the rule version and the counts.
 */
CREATE OR REPLACE FUNCTION graph._classify_walk(p_invalidation uuid, p_tenant uuid, p_domain uuid, p_case uuid, p_trigger_kind text, p_trigger uuid,
                                                p_buckets jsonb, p_products jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE
  v_rule graph.affected_class_rules%ROWTYPE; b record; it jsonb; v_id uuid; v_ver int; v_type text; v_kind text; v_bucket text; v_f jsonb; v_class text;
  v_classes jsonb := '{}'::jsonb; v_n int := 0; v_unresolved int := 0; v_ref text;
BEGIN
  SELECT * INTO v_rule FROM graph.affected_class_rules WHERE active;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact rejected (state): no active affected-class rule is declared' USING ERRCODE = '22023'; END IF;
  FOR b IN
    SELECT x.bucket, x.kind, x.type, x.key, e.value AS item
      FROM (VALUES ('assumptions', 'assumption', 'ASU', 'strategy_object_id'), ('objectives', 'objective', 'OBJ', 'strategy_object_id'),
                   ('decisions', 'decision', 'DEC', 'strategy_object_id'), ('commitments', 'commitment', 'CMT', 'strategy_object_id'),
                   ('strategy_nodes', 'strategy_node', NULL, 'strategy_object_id'), ('forecasts', 'forecast', 'FCT', 'forecast_id'),
                   ('twins', 'twin', 'TWN', 'twin_id'), ('simulations', 'simulation', 'SIM', 'run_id'), ('warnings', 'warning', 'WRN', 'warning_id'),
                   ('briefings', 'briefing', 'BRF', 'briefing_id'), ('memory_items', 'memory_item', 'MEM', 'item_id')) x(bucket, kind, type, key)
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(p_buckets -> x.bucket, '[]'::jsonb)) e
    UNION ALL
    SELECT e.value ->> 'bucket', e.value ->> 'product_kind', e.value ->> 'object_type', 'product_id', e.value
      FROM jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) e
  LOOP
    it := b.item; v_bucket := b.bucket; v_kind := b.kind;
    v_id := NULLIF(it ->> b.key, '')::uuid;
    v_ver := NULLIF(it ->> 'product_version', '')::int;
    v_type := coalesce(b.type, it ->> 'object_type');
    IF v_id IS NULL OR v_kind IS NULL OR v_type IS NULL OR v_bucket IS NULL THEN v_unresolved := v_unresolved + 1; CONTINUE; END IF;
    v_f := graph.affected_facts(p_tenant, p_domain, v_kind, v_id, v_ver, p_trigger_kind, p_trigger);
    IF NOT coalesce((v_f ->> 'exists')::boolean, false) THEN v_unresolved := v_unresolved + 1; CONTINUE; END IF;
    v_ver := coalesce(v_ver, NULLIF(v_f ->> 'version', '')::int);
    v_class := graph.classify_affected(v_rule.rule, v_kind, v_f);
    v_ref := v_type || ':' || v_id::text || CASE WHEN v_ver IS NULL THEN '' ELSE '@' || v_ver::text END;
    INSERT INTO graph.affected_products (scope, tenant_id, domain_id, invalidation_id, correction_case_id, trigger_kind, trigger_object_id, bucket, product_kind, object_type,
                                         product_id, product_version, product_ref, title, class, rule_version, facts, owner_principal_id, reached_via, hop, path,
                                         recorded_by, correlation_id)
    VALUES ('DOMAIN', p_tenant, p_domain, p_invalidation, p_case, p_trigger_kind, p_trigger, v_bucket, v_kind, v_type,
            v_id, v_ver, v_ref, left(coalesce(NULLIF(it ->> 'title', ''), v_f ->> 'title', v_ref), 500), v_class, v_rule.rule_version, v_f - 'owner' - 'title',
            NULLIF(v_f ->> 'owner', '')::uuid, left(coalesce(NULLIF(it ->> 'reached_via', ''), 'reached by the walk'), 1000), greatest(coalesce((it ->> 'hop')::int, 0), 0),
            CASE WHEN jsonb_typeof(it -> 'path') = 'array' AND jsonb_array_length(it -> 'path') > 0 THEN it -> 'path' ELSE jsonb_build_array(v_ref) END,
            p_actor, p_correlation)
    ON CONFLICT ON CONSTRAINT gap_once DO NOTHING;
    IF FOUND THEN
      v_n := v_n + 1;
      v_classes := jsonb_set(v_classes, ARRAY[v_class], to_jsonb(coalesce((v_classes ->> v_class)::int, 0) + 1));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('rule_version', v_rule.rule_version, 'products', v_n, 'classes', v_classes, 'products_unresolved', v_unresolved);
END $$;
REVOKE ALL ON FUNCTION graph._classify_walk(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb, uuid, uuid) FROM PUBLIC;

-- ─── §CI.7 graph.record_impact RE-DECLARED — 0089 §G8 (its LAST definition) copied WHOLE; the only changes, marked `B50 ci`: the twenty-first
-- argument p_products (the new buckets: scenarios, graph state, decision packages, publications, export packages, evaluation datasets, lessons),
-- every bucket classed by graph._classify_walk before the case's coverage is reconciled, and the counts in the invalidation.assessed details
-- (products, classes, rule_version, products_unresolved). The twenty-argument signature is dropped (a call naming twenty still resolves:
-- the twenty-first defaults to '[]').
DROP FUNCTION IF EXISTS graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb);
CREATE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_forecasts jsonb, p_twins jsonb, p_simulations jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid,
  p_warnings jsonb, p_briefings jsonb, p_memory_items jsonb DEFAULT '[]'::jsonb,
  /* B32 (0089) graph */ p_strategy_nodes jsonb DEFAULT '[]'::jsonb, /* end B32 graph */
  /* B50 ci */ p_products jsonb DEFAULT '[]'::jsonb /* end B50 ci */
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, prediction, twin, simulation, executive, memory, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; cov record; f jsonb; t jsonb; r jsonb; w jsonb; b jsonb; mi jsonb; v_versions int[]; v_version int; v_marked jsonb := '[]'::jsonb; v_routes text[]; v_trigger_kind text; v_trigger_id uuid;
  v_cov_state text; v_cov_roots int := 0; v_cov_covered int := 0; v_cov_outstanding int := 0;
  /* B50 ci */ v_classified jsonb; /* end B50 ci */
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE graph.invalidations_current
     SET affected_assumptions = coalesce(p_assumptions, '[]'::jsonb),
         affected_objectives  = coalesce(p_objectives,  '[]'::jsonb),
         affected_decisions   = coalesce(p_decisions,   '[]'::jsonb),
         affected_commitments = coalesce(p_commitments, '[]'::jsonb),
         affected_forecasts   = coalesce(p_forecasts,   '[]'::jsonb),
         affected_twins       = coalesce(p_twins,       '[]'::jsonb),
         affected_simulations = coalesce(p_simulations, '[]'::jsonb),
         affected_warnings    = coalesce(p_warnings,    '[]'::jsonb),
         affected_briefings   = coalesce(p_briefings,   '[]'::jsonb),
         affected_memory_items = coalesce(p_memory_items, '[]'::jsonb),
         /* B32 (0089) graph */ affected_strategy_nodes = coalesce(p_strategy_nodes, '[]'::jsonb), /* end B32 graph */
         statement = p_statement,
         truncated = coalesce(p_truncated, false),
         unexplored = coalesce(p_unexplored, '[]'::jsonb),
         state = 'assessed', assessed_at = clock_timestamp()
   WHERE invalidation_id = p_invalidation_id
   RETURNING correction_case_id, trigger_kind, trigger_object_id INTO v_case, v_trigger_kind, v_trigger_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'impact rejected: no such invalidation' USING ERRCODE = '23503';
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(p_forecasts, '[]'::jsonb)) LOOP
    UPDATE prediction.forecasts_current
       SET attention_state = 'assumption_unverified',
           attention_reason = format('invalidation %s: %s', p_invalidation_id, f ->> 'reached_via'),
           updated_at = clock_timestamp()
     WHERE forecast_id = (f ->> 'forecast_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain
       AND state IN ('issued');
    IF FOUND THEN
      INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (f ->> 'forecast_id')::uuid, 'forecast.attention', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', f ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;

  FOR t IN SELECT * FROM jsonb_array_elements(coalesce(p_twins, '[]'::jsonb)) LOOP
    -- every route: `via_ids` when the walk recorded several, `via_id` for one
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[]) INTO v_routes
      FROM (SELECT t ->> 'via_id' AS x WHERE (t ->> 'via_id') IS NOT NULL
            UNION ALL SELECT y #>> '{}' FROM jsonb_array_elements(coalesce(t -> 'via_ids', '[]'::jsonb)) y) s WHERE x IS NOT NULL;
    SELECT coalesce(array_agg(DISTINCT v.version ORDER BY v.version), ARRAY[]::int[]) INTO v_versions
      FROM twin.twin_versions v
      JOIN twin.state_elements e ON e.twin_id = v.twin_id AND e.version = v.version
     WHERE v.twin_id = (t ->> 'twin_id')::uuid AND v.tenant_id = p_tenant AND v.domain_id = p_domain
       AND v.state = 'admitted' AND v.verification_state = 'verified'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c WHERE (c ->> 'id') = ANY (v_routes));
    FOREACH v_version IN ARRAY v_versions LOOP
      PERFORM twin.mark_unverified((t ->> 'twin_id')::uuid, p_tenant, p_domain, v_version,
        format('invalidation %s: %s', p_invalidation_id, t ->> 'reached_via'), p_invalidation_id, p_actor, gen_random_uuid(), p_correlation);
      v_marked := v_marked || jsonb_build_object('twin_id', t ->> 'twin_id', 'version', v_version);
    END LOOP;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_simulations, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM simulation.runs_current s WHERE s.run_id = (r ->> 'run_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (r ->> 'run_id')::uuid, 'run.unverified', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', r ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;

  -- B8 §8 (AU-MEM-0031): a WARNING the walk reached is marked for attention (once; the warning row's own fields stay immutable),
  -- a BRIEFING composed before the change is RE-FLAGGED by event (the briefing is append-only; its content keeps its digest).
  FOR w IN SELECT * FROM jsonb_array_elements(coalesce(p_warnings, '[]'::jsonb)) LOOP
    UPDATE prediction.warnings_current
       SET attention_state = 'input_unverified', attention_reason = format('invalidation %s: %s', p_invalidation_id, w ->> 'reached_via')
     WHERE warning_id = (w ->> 'warning_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain AND attention_state = 'none' AND state IN ('raised', 'acknowledged');
    IF FOUND THEN
      INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (w ->> 'warning_id')::uuid, 'warning.attention', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', w ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;
  FOR b IN SELECT * FROM jsonb_array_elements(coalesce(p_briefings, '[]'::jsonb)) LOOP
    -- a briefing composed BEFORE the change it rests on: for a corrected object, the object has a version recorded after the
    -- briefing's known-at (a briefing composed on the corrected version is not re-flagged by the correction it already saw)
    IF EXISTS (SELECT 1 FROM executive.briefings x
                WHERE x.briefing_id = (b ->> 'briefing_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain
                  AND (v_trigger_kind NOT IN ('evidence_correction', 'claim_correction', 'claim_withdrawal')
                       OR EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_trigger_id AND o.recorded_at > x.known_at)))
       AND NOT EXISTS (SELECT 1 FROM executive.briefing_events e WHERE e.briefing_id = (b ->> 'briefing_id')::uuid AND e.event = 'briefing.re_flagged' AND e.details ->> 'invalidation_id' = p_invalidation_id::text) THEN
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (b ->> 'briefing_id')::uuid, 'briefing.re_flagged', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', b ->> 'reached_via', 'correction_case_id', v_case), p_correlation);
    END IF;
  END LOOP;

  -- 0066 §3: memory items resting on what changed — an ACTIVE item recorded before the change (for a corrected object, the
  -- object has a version recorded after the item's record instant) is marked for the knowledge owner's attention once per
  -- invalidation; the item itself (a version of the institutional record) is never rewritten by a walk.
  -- B19 (0079): a claim_withdrawal walk marks basis_withdrawn when the trigger object's LATEST version is withdrawn (else
  -- basis_corrected: the walk reached the item, but no withdrawal stands); an item already basis_withdrawn keeps that mark (a
  -- later correction walk of the same object does not downgrade it) — the event still records the invalidation, with the
  -- trigger kind and the state left on the item.
  FOR mi IN SELECT * FROM jsonb_array_elements(coalesce(p_memory_items, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM memory.items_current x
                WHERE x.item_id = (mi ->> 'item_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active'
                  AND (v_trigger_kind NOT IN ('evidence_correction', 'claim_correction', 'claim_withdrawal')
                       OR EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_trigger_id AND o.recorded_at > x.recorded_at)))
       AND NOT EXISTS (SELECT 1 FROM memory.item_events e WHERE e.item_id = (mi ->> 'item_id')::uuid AND e.event = 'memory.attention' AND e.details ->> 'invalidation_id' = p_invalidation_id::text) THEN
      UPDATE memory.items_current
         SET attention_state = CASE WHEN attention_state = 'basis_withdrawn'
                                      OR (v_trigger_kind = 'claim_withdrawal'
                                          AND coalesce((SELECT o.lifecycle_state FROM objects.canonical_objects o
                                                         WHERE o.object_id = v_trigger_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                                                         ORDER BY o.object_version DESC LIMIT 1), '') = 'withdrawn')
                                    THEN 'basis_withdrawn' ELSE 'basis_corrected' END,
             attention_reason = left('invalidation ' || p_invalidation_id::text || ': ' || coalesce(mi ->> 'reached_via', 'what this record rests on changed'), 500)
       WHERE item_id = (mi ->> 'item_id')::uuid;
      INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
      SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.item_id, 'memory.attention', x.object_version, p_actor,
             jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', mi ->> 'reached_via', 'correction_case_id', v_case, 'trigger_kind', v_trigger_kind, 'attention_state', x.attention_state), p_correlation
        FROM memory.items_current x WHERE x.item_id = (mi ->> 'item_id')::uuid;
    END IF;
  END LOOP;

  -- B50 ci: every product the walk reached — the existing buckets and the new ones (scenarios, graph state, decision packages, publications,
  -- export packages, evaluation datasets, lessons) — CLASSED under the active rule from the facts read here, one append-only row each (§CI.6).
  v_classified := graph._classify_walk(p_invalidation_id, p_tenant, p_domain, v_case, v_trigger_kind, v_trigger_id,
    jsonb_build_object('assumptions', p_assumptions, 'objectives', p_objectives, 'decisions', p_decisions, 'commitments', p_commitments,
                       'strategy_nodes', p_strategy_nodes, 'forecasts', p_forecasts, 'twins', p_twins, 'simulations', p_simulations,
                       'warnings', p_warnings, 'briefings', p_briefings, 'memory_items', p_memory_items),
    p_products, p_actor, p_correlation);
  -- end B50 ci

  IF v_case IS NOT NULL THEN
    SELECT * INTO cov FROM graph.case_propagation_coverage(v_case);
    v_cov_state := coalesce(cov.state, 'partial');
    v_cov_roots := coalesce(cov.roots, 0);
    v_cov_covered := coalesce(cov.covered, 0);
    v_cov_outstanding := coalesce(cov.missing, 0) + coalesce(cov.truncated_latest, 0);
    UPDATE observation.correction_current
       SET propagation_unresolved = coalesce(cov.sentence, p_statement),
           propagation_assessment_id = p_invalidation_id,
           propagation_state = v_cov_state
     WHERE case_id = v_case AND tenant_id = p_tenant AND domain_id = p_domain;
  END IF;

  INSERT INTO graph.invalidation_events (event_id, scope, tenant_id, domain_id, invalidation_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_invalidation_id, 'invalidation.assessed', p_actor, jsonb_build_object(
      'assumptions', jsonb_array_length(coalesce(p_assumptions, '[]'::jsonb)),
      'objectives',  jsonb_array_length(coalesce(p_objectives,  '[]'::jsonb)),
      'decisions',   jsonb_array_length(coalesce(p_decisions,   '[]'::jsonb)),
      'commitments', jsonb_array_length(coalesce(p_commitments, '[]'::jsonb)),
      'forecasts',   jsonb_array_length(coalesce(p_forecasts,   '[]'::jsonb)),
      'twins',       jsonb_array_length(coalesce(p_twins,       '[]'::jsonb)),
      'twin_versions_unverified', v_marked,
      'simulations', jsonb_array_length(coalesce(p_simulations, '[]'::jsonb)),
      'warnings',    jsonb_array_length(coalesce(p_warnings,    '[]'::jsonb)),
      'briefings',   jsonb_array_length(coalesce(p_briefings,   '[]'::jsonb)),
      'memory_items', jsonb_array_length(coalesce(p_memory_items, '[]'::jsonb)),
      /* B32 (0089) graph */ 'strategy_nodes', jsonb_array_length(coalesce(p_strategy_nodes, '[]'::jsonb)), /* end B32 graph */
      /* B50 ci */ 'products', v_classified -> 'products', 'classes', v_classified -> 'classes', 'rule_version', v_classified -> 'rule_version',
      'products_unresolved', v_classified -> 'products_unresolved', /* end B50 ci */
      'truncated', coalesce(p_truncated, false),
      'unexplored', jsonb_array_length(coalesce(p_unexplored, '[]'::jsonb)),
      'correction_case_id', v_case, 'case_propagation_state', v_cov_state,
      'roots', v_cov_roots, 'roots_covered', v_cov_covered,
      'roots_outstanding', v_cov_outstanding, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) TO eye_commit;


-- ─── §CI.8 THE SEEDING PORTS — one per trigger kind; the shared preflight and insert are internal ─────────────────────────────────────────────────────────
-- The body every seeding port runs: the action bound (graph.impact.trigger.<kind>), the scope, the acting principal = the session's, a NAMED
-- ACTIVE HUMAN holding one of the kind's roles at the domain (re-checked here, never only in the PDP), the object's type among the kind's,
-- the object resolved in this tenant and domain (its latest canonical version; an entity or an edge by its row), the reason; then the row
-- and its event. Refusals in the class form `impact trigger rejected (<class>): …` — actor / authority 42501 (403), unknown_object 23503
-- (404), use / basis / reason 22023 (422).
CREATE OR REPLACE FUNCTION graph._trigger_preflight(p_kind text, p_roles text[], p_types text[], p_tenant uuid, p_domain uuid,
  p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb, p_actor uuid) RETURNS int
LANGUAGE plpgsql SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_found boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.trigger.' || p_kind]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'impact trigger rejected (actor): the acting principal is not the session''s' USING ERRCODE = '42501';
  END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION 'impact trigger rejected (authority): a % is recorded by a named person holding % in this domain', replace(p_kind, '_', ' '), array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
  IF p_object_type IS NULL OR NOT (p_object_type = ANY (p_types)) THEN
    RAISE EXCEPTION 'impact trigger rejected (use): a % names a %, not a %', replace(p_kind, '_', ' '), array_to_string(p_types, ', '), coalesce(p_object_type, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'impact trigger rejected (reason): a trigger states its reason (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_basis IS NULL OR jsonb_typeof(p_basis) <> 'object' THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): the basis is an object' USING ERRCODE = '22023';
  END IF;
  IF p_object_type = 'ENT' THEN
    v_found := EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_object_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain);
  ELSIF p_object_type = 'REL' THEN
    v_found := EXISTS (SELECT 1 FROM graph.edges_current e WHERE e.edge_id = p_object_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain);
  ELSE
    SELECT o.object_version INTO v_version FROM objects.canonical_objects o
     WHERE o.object_id = p_object_id AND o.object_type = p_object_type AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1;
    v_found := FOUND;
  END IF;
  IF NOT v_found THEN
    RAISE EXCEPTION 'impact trigger rejected (unknown_object): % % is not recorded in this domain', p_object_type, p_object_id USING ERRCODE = '23503';
  END IF;
  RETURN v_version;
END $$;
REVOKE ALL ON FUNCTION graph._trigger_preflight(text, text[], text[], uuid, uuid, text, uuid, text, jsonb, uuid) FROM PUBLIC;

-- The row and its event, once the port's preflight and its kind's basis have passed.
CREATE OR REPLACE FUNCTION graph._trigger_insert(p_kind text, p_version int, p_trigger_id uuid, p_tenant uuid, p_domain uuid,
  p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_version int := p_version;
BEGIN
  INSERT INTO graph.impact_triggers (trigger_id, scope, tenant_id, domain_id, trigger_kind, object_type, object_id, object_version, reason, basis, recorded_by, correlation_id)
  VALUES (p_trigger_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_object_type, p_object_id, v_version, btrim(p_reason), p_basis, p_actor, p_correlation);
  INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.recorded', p_actor,
          jsonb_build_object('trigger_kind', p_kind, 'object_type', p_object_type, 'object_id', p_object_id, 'object_version', v_version, 'basis', p_basis), p_correlation);
  RETURN jsonb_build_object('trigger_id', p_trigger_id, 'trigger_kind', p_kind, 'object_type', p_object_type, 'object_id', p_object_id, 'object_version', v_version,
                            'state', 'recorded', 'reason', btrim(p_reason), 'basis', p_basis);
END $$;
REVOKE ALL ON FUNCTION graph._trigger_insert(text, int, uuid, uuid, uuid, text, uuid, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;

-- A basis field the kind requires: text of at least p_min characters.
CREATE OR REPLACE FUNCTION graph._basis_text(p_kind text, p_basis jsonb, p_key text, p_min int) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_basis IS NULL OR jsonb_typeof(p_basis -> p_key) IS DISTINCT FROM 'string' OR length(btrim(p_basis ->> p_key)) < p_min THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): a % names its % (at least % characters)', replace(p_kind, '_', ' '), replace(p_key, '_', ' '), p_min USING ERRCODE = '22023';
  END IF;
  RETURN btrim(p_basis ->> p_key);
END $$;
REVOKE ALL ON FUNCTION graph._basis_text(text, jsonb, text, int) FROM PUBLIC;

-- LEGAL REQUEST (privacy officer / record authority): evidence or a claim a legal request reaches — the request's reference and legal basis.
CREATE OR REPLACE FUNCTION graph.seed_legal_request(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int;
BEGIN
  v_version := graph._trigger_preflight('legal_request', ARRAY['privacy_officer', 'record_authority'], ARRAY['EVD', 'CLM'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  PERFORM graph._basis_text('legal_request', p_basis, 'request_ref', 4);
  PERFORM graph._basis_text('legal_request', p_basis, 'legal_basis', 4);
  RETURN graph._trigger_insert('legal_request', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- MODEL INCIDENT (method steward): a forecast or run produced by a method under incident — the method named must be the object's own.
CREATE OR REPLACE FUNCTION graph.seed_model_incident(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_method text;
BEGIN
  v_version := graph._trigger_preflight('model_incident', ARRAY['method_steward'], ARRAY['FCT', 'SIM'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  v_method := graph._basis_text('model_incident', p_basis, 'method_ref', 2);
  PERFORM graph._basis_text('model_incident', p_basis, 'incident', 8);
  IF p_object_type = 'FCT' AND NOT EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = p_object_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain
                                             AND v_method IN (f.method, coalesce(f.method_ref, ''), f.method || '@' || f.method_version)) THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): forecast % was not produced by method %', p_object_id, v_method USING ERRCODE = '22023';
  END IF;
  IF p_object_type = 'SIM' AND NOT EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.run_id = p_object_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.model_ref = v_method) THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): run % was not produced by model %', p_object_id, v_method USING ERRCODE = '22023';
  END IF;
  RETURN graph._trigger_insert('model_incident', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- ONTOLOGY CORRECTION (ontology steward): an entity or edge whose typing a recorded ontology version of this domain corrects.
CREATE OR REPLACE FUNCTION graph.seed_ontology_correction(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_ref text;
BEGIN
  v_version := graph._trigger_preflight('ontology_correction', ARRAY['ontology_steward'], ARRAY['ENT', 'REL'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  v_ref := graph._basis_text('ontology_correction', p_basis, 'ontology_version_id', 36);
  IF v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR NOT EXISTS (SELECT 1 FROM graph.ontology_versions v WHERE v.version_id = v_ref::uuid AND v.tenant_id = p_tenant AND v.domain_id = p_domain) THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): % is not an ontology version of this domain', v_ref USING ERRCODE = '22023';
  END IF;
  RETURN graph._trigger_insert('ontology_correction', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- DATA-QUALITY FINDING (data steward): evidence or a claim found deficient on a named quality dimension.
CREATE OR REPLACE FUNCTION graph.seed_data_quality_finding(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_dim text;
BEGIN
  v_version := graph._trigger_preflight('data_quality_finding', ARRAY['data_steward'], ARRAY['EVD', 'CLM'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  v_dim := graph._basis_text('data_quality_finding', p_basis, 'dimension', 4);
  IF v_dim NOT IN ('completeness', 'accuracy', 'timeliness', 'consistency', 'validity', 'uniqueness') THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): % is not a quality dimension (completeness, accuracy, timeliness, consistency, validity, uniqueness)', v_dim USING ERRCODE = '22023';
  END IF;
  PERFORM graph._basis_text('data_quality_finding', p_basis, 'finding', 8);
  RETURN graph._trigger_insert('data_quality_finding', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- RIGHTS CHANGE: evidence whose source's rights state is no longer confirmed — the source named must be the evidence's, its CURRENT rights
-- state the one stated (the transition is the source contract's own port, observation.set_rights_state; this records what rests on it).
CREATE OR REPLACE FUNCTION graph.seed_rights_change(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_src text; v_state text;
BEGIN
  v_version := graph._trigger_preflight('rights_change', ARRAY['data_steward', 'privacy_officer', 'record_authority', 'collection_manager'], ARRAY['EVD'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  v_src := graph._basis_text('rights_change', p_basis, 'source_id', 36);
  v_state := graph._basis_text('rights_change', p_basis, 'rights_state', 6);
  IF v_src !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_object_id AND o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                       AND o.provenance_ref LIKE 'SRC:' || lower(v_src) || '@%') THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): evidence % was not acquired from source %', p_object_id, v_src USING ERRCODE = '22023';
  END IF;
  IF v_state NOT IN ('pending', 'withdrawn') OR NOT EXISTS (SELECT 1 FROM observation.source_contracts_current s WHERE s.source_id = v_src::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.rights_state = v_state) THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): source % does not currently state rights %; record the change on the source contract first', v_src, v_state USING ERRCODE = '22023';
  END IF;
  RETURN graph._trigger_insert('rights_change', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- INTEGRITY FAILURE (record authority / data steward): evidence whose vault custody failed — the manifest named must be the evidence's own.
CREATE OR REPLACE FUNCTION graph.seed_integrity_failure(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_manifest text;
BEGIN
  v_version := graph._trigger_preflight('integrity_failure', ARRAY['record_authority', 'data_steward'], ARRAY['EVD'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  v_manifest := graph._basis_text('integrity_failure', p_basis, 'manifest_id', 36);
  PERFORM graph._basis_text('integrity_failure', p_basis, 'failure', 8);
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_object_id AND o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                    AND o.payload ->> 'manifest_id' = lower(v_manifest)) THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): manifest % is not a manifest of evidence %', v_manifest, p_object_id USING ERRCODE = '22023';
  END IF;
  RETURN graph._trigger_insert('integrity_failure', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- HUMAN CHALLENGE (any named person of the domain; §PV's contest path calls it with its challenge's reference): a claim, an assessment, a
-- warning, a forecast or an assumption is contested — everything resting on it reads challenged until the deciding person closes it.
CREATE OR REPLACE FUNCTION graph.seed_human_challenge(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int;
BEGIN
  v_version := graph._trigger_preflight('human_challenge', ARRAY['domain_admin', 'domain_analyst', 'domain_specialist', 'knowledge_owner', 'forecast_owner', 'risk_owner', 'decision_owner', 'strategy_owner', 'data_steward',
          'method_steward', 'ontology_steward', 'executive', 'collection_manager', 'extraction_manager', 'resolution_manager', 'record_authority', 'privacy_officer'], ARRAY['CLM', 'ASM', 'WRN', 'FCT', 'ASU', 'EVT'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  PERFORM graph._basis_text('human_challenge', p_basis, 'statement', 8);
  RETURN graph._trigger_insert('human_challenge', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

DO $$
DECLARE k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['legal_request', 'model_incident', 'ontology_correction', 'data_quality_finding', 'rights_change', 'integrity_failure', 'human_challenge'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION graph.seed_%s(uuid, uuid, uuid, text, uuid, text, jsonb, uuid, uuid, uuid) FROM PUBLIC', k);
    EXECUTE format('GRANT EXECUTE ON FUNCTION graph.seed_%s(uuid, uuid, uuid, text, uuid, text, jsonb, uuid, uuid, uuid) TO eye_commit', k);
  END LOOP;
END $$;

-- CLOSE A HUMAN CHALLENGE (the deciding person: a knowledge owner or the domain administrator, never its opener): the challenge stops
-- classing what rests on the object `challenged` at the next walk; the walk already recorded keeps its rows (append-only).
CREATE OR REPLACE FUNCTION graph.close_human_challenge(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.impact_triggers%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.trigger.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'impact trigger rejected (actor): the acting principal is not the session''s' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM graph.impact_triggers WHERE trigger_id = p_trigger_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact trigger rejected (unknown_trigger): no trigger % in this domain', p_trigger_id USING ERRCODE = '23503'; END IF;
  IF r.trigger_kind <> 'human_challenge' THEN RAISE EXCEPTION 'impact trigger rejected (use): only a human challenge is closed; a % stands on its record', replace(r.trigger_kind, '_', ' ') USING ERRCODE = '22023'; END IF;
  IF r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'impact trigger rejected (state): the challenge was closed at %', r.closed_at USING ERRCODE = '22023'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'domain_admin']) THEN
    RAISE EXCEPTION 'impact trigger rejected (authority): a challenge is closed by a named knowledge owner or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_actor = r.recorded_by THEN
    RAISE EXCEPTION 'impact trigger rejected (separation_of_duties): the person who opened a challenge does not close it' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'impact trigger rejected (reason): a closure states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE graph.impact_triggers SET closed_by = p_actor, closed_at = clock_timestamp(), close_reason = btrim(p_reason) WHERE trigger_id = p_trigger_id RETURNING * INTO r;
  INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.closed', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('trigger_id', r.trigger_id, 'closed_by', r.closed_by, 'closed_at', r.closed_at, 'close_reason', r.close_reason);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.close_human_challenge(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.close_human_challenge(uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

-- ─── §CI.9 THE AGENT'S WALK OF A TRIGGER (0060's shape: the receipt under the schedule capability; the checkpoint inside the walk) ──────────
-- RECEIVE: what the walker needs — the trigger, the domain's ACTIVE propagation agent (null: none — the trigger waits, visible) — and one
-- receipt event. A walked trigger answers as walked (a durable no-op).
CREATE OR REPLACE FUNCTION graph.impact_trigger_receive(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.impact_triggers%ROWTYPE; a graph.propagation_agents%ROWTYPE;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  SELECT * INTO r FROM graph.impact_triggers WHERE trigger_id = p_trigger_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact trigger rejected (unknown_trigger): no trigger % in this domain', p_trigger_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO a FROM graph.propagation_agents WHERE tenant_id = p_tenant AND domain_id = p_domain AND status = 'active';
  IF r.state <> 'walked' THEN
    INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.received', NULL,
            jsonb_build_object('state', r.state, 'attempts', r.attempts, 'agent_id', a.agent_id), p_correlation);
  END IF;
  RETURN jsonb_build_object('trigger_id', r.trigger_id, 'trigger_kind', r.trigger_kind, 'object_type', r.object_type, 'object_id', r.object_id, 'object_version', r.object_version,
    'basis', r.basis, 'state', r.state, 'attempts', r.attempts, 'invalidation_id', r.invalidation_id,
    'agent', CASE WHEN a.agent_id IS NULL THEN NULL
                  ELSE jsonb_build_object('agent_id', a.agent_id, 'principal_id', a.principal_id, 'agent_version', a.agent_version, 'code_digest', a.code_digest, 'budgets', a.budgets) END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.impact_trigger_receive(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.impact_trigger_receive(uuid, uuid, uuid, uuid) TO eye_commit;

-- BEGIN (inside the walk's transaction, under graph.impact.propagate): the row locked until the impact record commits; FALSE for a walked
-- trigger (a typed skip, never a second walk); only the domain's ACTIVE propagation agent walks a trigger.
CREATE OR REPLACE FUNCTION graph.impact_trigger_begin(p_trigger_id uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.impact_triggers%ROWTYPE; v_agent uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM graph.impact_triggers WHERE trigger_id = p_trigger_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact trigger rejected (unknown_trigger): no trigger % in this domain', p_trigger_id USING ERRCODE = '23503'; END IF;
  IF r.state = 'walked' THEN RETURN false; END IF;
  SELECT a.agent_id INTO v_agent FROM graph.propagation_agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.status = 'active' AND a.principal_id = public.eye_principal();
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'impact trigger rejected (actor): a trigger is walked by the domain''s active propagation agent, not by %', public.eye_principal() USING ERRCODE = '42501';
  END IF;
  UPDATE graph.impact_triggers SET state = 'walking', attempts = attempts + 1, agent_id = v_agent, last_error = NULL WHERE trigger_id = p_trigger_id;
  INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.walking', public.eye_principal(), jsonb_build_object('attempt', r.attempts + 1, 'agent_id', v_agent), r.correlation_id);
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.impact_trigger_begin(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.impact_trigger_begin(uuid, uuid, uuid) TO eye_commit;

-- DONE: the trigger may claim only an ASSESSED walk of ITS kind of ITS object, opened by the walking agent.
CREATE OR REPLACE FUNCTION graph.impact_trigger_done(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_invalidation_id uuid) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.impact_triggers%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM graph.impact_triggers WHERE trigger_id = p_trigger_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND OR r.state <> 'walking' THEN
    RAISE EXCEPTION 'impact trigger rejected (state): trigger % is not walking', p_trigger_id USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM graph.invalidations_current i WHERE i.invalidation_id = p_invalidation_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain
                    AND i.trigger_kind = r.trigger_kind AND i.trigger_object_id = r.object_id AND i.state = 'assessed' AND i.opened_by = public.eye_principal()) THEN
    RAISE EXCEPTION 'impact trigger rejected (unknown_invalidation): % is not an assessed % walk of % by this agent', p_invalidation_id, r.trigger_kind, r.object_id USING ERRCODE = '23503';
  END IF;
  UPDATE graph.impact_triggers SET state = 'walked', invalidation_id = p_invalidation_id, walked_at = clock_timestamp() WHERE trigger_id = p_trigger_id;
  INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.walked', public.eye_principal(),
          jsonb_build_object('invalidation_id', p_invalidation_id, 'agent_id', r.agent_id,
                             'truncated', (SELECT i.truncated FROM graph.invalidations_current i WHERE i.invalidation_id = p_invalidation_id)), r.correlation_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.impact_trigger_done(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.impact_trigger_done(uuid, uuid, uuid, uuid) TO eye_commit;

-- FAIL (schedule capability): a walk that could not run or did not finish, with its reason; a walked trigger is never failed afterwards.
CREATE OR REPLACE FUNCTION graph.impact_trigger_fail(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_error text) RETURNS text
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.impact_triggers%ROWTYPE;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  SELECT * INTO r FROM graph.impact_triggers WHERE trigger_id = p_trigger_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact trigger rejected (unknown_trigger): no trigger % in this domain', p_trigger_id USING ERRCODE = '23503'; END IF;
  IF r.state = 'walked' THEN RETURN 'walked'; END IF;
  UPDATE graph.impact_triggers SET state = 'failed', last_error = left(coalesce(p_error, 'no reason recorded'), 500) WHERE trigger_id = p_trigger_id;
  INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.failed', NULL, jsonb_build_object('error', left(coalesce(p_error, 'no reason recorded'), 500), 'attempts', r.attempts), r.correlation_id);
  RETURN 'failed';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.impact_trigger_fail(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.impact_trigger_fail(uuid, uuid, uuid, text) TO eye_commit;

-- WHAT A COLD PROCESS RE-DRIVES (schedule capability; read-only): unwalked triggers — recorded, failed, or walking with no progress for ten
-- minutes (an interrupted walk) — in domains with an active propagation agent.
CREATE OR REPLACE FUNCTION graph.impact_triggers_to_walk() RETURNS TABLE (trigger_id uuid, tenant_id uuid, domain_id uuid, state text, attempts int)
SECURITY DEFINER SET search_path = graph, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY SELECT t.trigger_id, t.tenant_id, t.domain_id, t.state, t.attempts FROM graph.impact_triggers t
    WHERE (t.state IN ('recorded', 'failed')
           OR (t.state = 'walking' AND NOT EXISTS (SELECT 1 FROM graph.impact_trigger_events e WHERE e.trigger_id = t.trigger_id AND e.occurred_at > clock_timestamp() - interval '10 minutes')))
      AND EXISTS (SELECT 1 FROM graph.propagation_agents a WHERE a.tenant_id = t.tenant_id AND a.domain_id = t.domain_id AND a.status = 'active')
    ORDER BY t.recorded_at, t.trigger_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.impact_triggers_to_walk() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.impact_triggers_to_walk() TO eye_commit;

-- ═══ FOLD §PV (from 0120_b50_x_pv.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §PV — CP-6 B50 part §PV: PROVENANCE, EXPLANATION, UNFIT MARKING AND THE CONTEST PATH (F-P3-03 + HX-14). Folded into 0120 after §LC.
-- Applies ALONE on 0001–0119 + the 0120 §0 prelude. Nothing applied or committed is edited; the one existing function re-declared is §PV's
-- own hook stub objects._lineage_usable (0120 §0.1), copied whole with its signature, volatility (STABLE), invoker security and search path.
--
--   §PV.1  the vocabulary: references, the rule and method versions                                    (helpers, IMMUTABLE, no grant)
--   §PV.2  the ledgers: product_fitness_marks · knowledge_challenges (+ events, evidence) · provenance_agents (+ events) · provenance_runs ·
--          provenance_edges — FORCE RLS, SELECT to eye_app / eye_commit, no write grant (the ports write); append-only where marked
--   §PV.3  the lineage closure (internal): the backward walk over recorded lineage — the header's evidence_refs / source_object_ids /
--          correction_of, a claim's claim_lineage (its byte span and evidence digest), a package option's citations, a publication's source —
--          bounded (depth, nodes), every unresolved reference, broken custody and unverifiable artifact named as a GAP, never dropped
--   §PV.4  graph.explain(type, id, version): the backward PATH with the denied / abstained / challenged / overridden / corrected / failed
--          nodes (ES-28-004), the boundaries crossed (synchronous, event, workflow, agent, model, human; the TOOL boundary carried to B70),
--          and the forward impact as a read-only preview (the recorded walk's buckets are §CI's)
--   §PV.5  graph.revision_diff(type, id, from, to) and graph.graph_revision_diff(from, to) (V03-T-192)
--   §PV.6  the generic UNFIT: graph.product_fitness (the evaluation, read) · graph.mark_product_fitness (the governed mark) · the hook
--          objects._lineage_usable (consequential use and export refused for a product marked unfit, or resting on one) (DP-23-005)
--   §PV.7  graph.alignment_check(kind, id, version): claim-to-evidence alignment of briefings, publications and exports, with the
--          audience filtering disclosed; TRANSLATION carried to B85 (AI-29-001, AI-29-003)
--   §PV.8  the contest path (HX-14): knowledge challenges on claims / assessments / warnings / forecasts in B21's shape (open →
--          under_review → upheld | dismissed | withdrawn; reviewer ≠ opener ≠ owner; evidence submission; escalation on the DB clock);
--          a decision is ROUTED to B35's appeal / B36's gate challenge, a run to B21's simulation challenge — never duplicated
--   §PV.9  the provenance agent (AG-014): 0060's registry shape, role provenance_agent, deterministic (no model); its ONE surface
--          graph.provenance_construct builds graph.provenance_edges from recorded lineage and reports every gap (it cannot conceal)
--
-- WHY graph.provenance_edges AND NOT graph.dependencies: graph.dependencies (0024 §7) is the PERSON-DECLARED strategy table — "never inferred",
-- its dependent a strategy object (FK to graph.strategy_current). Product lineage edges an agent constructs from recorded lineage are a
-- different fact with a different authority, so they live in their own append-only ledger, each edge naming its basis and its run.
--
-- REFUSAL NOUNS (the CLASS form `<noun> rejected (<class>): …`; reported to the integrator for observation-errors.ts):
--   `provenance rejected` (the reads), `product fitness rejected` (the mark), `knowledge challenge rejected` (§PV.8),
--   `provenance agent rejected` (§PV.9); the hook raises §0's `object use rejected (unfit)` (already mapped, 409).
-- THREE CLAIMS: construction (this migration and phase6-provenance-b50); demonstrated operation (the act — SYNTHETIC); real acceptance — never.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §PV.1 THE VOCABULARY ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.pv_fitness_rule() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b50-pv-fitness-1' $$;
CREATE OR REPLACE FUNCTION graph.pv_explain_method() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b50-pv-explain-1' $$;
CREATE OR REPLACE FUNCTION graph.pv_claim_types() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['ENT', 'EVT', 'CLM', 'REL', 'ASM'] $$;
/* What the carried boundaries are carried to (DESIGN D12): no tool gateway exists (B70, F-P7A-05); no translation exists (B85). */
CREATE OR REPLACE FUNCTION graph.pv_carried() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_array(
  jsonb_build_object('what', 'tool', 'state', 'carried', 'carrier', 'B70 — the tool gateway (F-P7A-05); no tool boundary exists to record a call across'),
  jsonb_build_object('what', 'translation', 'state', 'carried', 'carrier', 'B85 — no translation exists (DESIGN D12); alignment through translation is not claimed')) $$;
GRANT EXECUTE ON FUNCTION graph.pv_fitness_rule(), graph.pv_explain_method(), graph.pv_claim_types(), graph.pv_carried() TO eye_app, eye_commit;

/* A reference as the header records it: `TYP:<uuid>@<version>` · `TYP:<uuid>` · `blob:<manifest uuid>` · a bare uuid · anything else (opaque). */
CREATE OR REPLACE FUNCTION graph.pv_ref(p text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p ~ '^[A-Z]{3}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(@[1-9][0-9]{0,8})?$'
      THEN jsonb_build_object('form', 'typed', 'type', substring(p from 1 for 3), 'id', lower(substring(p from 5 for 36)),
                              'version', CASE WHEN position('@' in p) > 0 THEN split_part(p, '@', 2)::int END)
    WHEN p ~ '^blob:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN jsonb_build_object('form', 'manifest', 'type', NULL, 'id', lower(substring(p from 6)), 'version', NULL)
    WHEN p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(@[1-9][0-9]{0,8})?$'
      THEN jsonb_build_object('form', 'bare', 'type', NULL, 'id', lower(split_part(p, '@', 1)), 'version', CASE WHEN position('@' in p) > 0 THEN split_part(p, '@', 2)::int END)
    ELSE jsonb_build_object('form', 'opaque', 'type', NULL, 'id', NULL, 'version', NULL) END
$$;
REVOKE ALL ON FUNCTION graph.pv_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.pv_ref(text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION graph.pv_iso(p timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END
$$;
REVOKE ALL ON FUNCTION graph.pv_iso(timestamptz) FROM PUBLIC;

/* The accountable owner as a principal id ('principal:<uuid>' → the uuid; an agent's or a system's owner → NULL). */
CREATE OR REPLACE FUNCTION graph.pv_owner(p text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p ~* '^principal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN substring(p from 11)::uuid END
$$;
REVOKE ALL ON FUNCTION graph.pv_owner(text) FROM PUBLIC;

/* One explanation node in the seam's shape (ExplainNode, b50-seams.ts): node_id, kind, ref, label, outcome, at, actor, parents, span, boundary. */
CREATE OR REPLACE FUNCTION graph.pv_node(p_node text, p_kind text, p_ref text, p_label text, p_outcome text, p_at timestamptz, p_actor text, p_span jsonb, p_boundary text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('node_id', p_node, 'kind', p_kind, 'ref', p_ref, 'label', left(coalesce(p_label, p_kind), 400), 'outcome', p_outcome,
                            'at', graph.pv_iso(p_at), 'actor', p_actor, 'parents', '[]'::jsonb, 'span', p_span, 'boundary', p_boundary)
$$;
REVOKE ALL ON FUNCTION graph.pv_node(text, text, text, text, text, timestamptz, text, jsonb, text) FROM PUBLIC;

-- §PV.2 THE LEDGERS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE GENERIC UNFIT MARK (DP-23-005): the verdict is the EVALUATION's (graph.pv_fitness_eval under the rule version), never the caller's;
   the gaps it found are kept with it; an unfit mark routes the product to a recompute or an adjudication with its owner; a later mark
   (a re-evaluation after the gap is closed) supersedes — nothing is erased. The current mark of a version is its latest. Append-only. */
CREATE TABLE graph.product_fitness_marks (
  mark_id           uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  object_type       text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  object_id         uuid NOT NULL,
  object_version    int  NOT NULL CHECK (object_version >= 1),
  object_digest     text NOT NULL CHECK (object_digest ~ '^[0-9a-f]{64}$'),
  verdict           text NOT NULL CHECK (verdict IN ('fit', 'unfit', 'unknown')),
  reasons           text[] NOT NULL DEFAULT '{}' CHECK (reasons <@ ARRAY['incomplete_lineage', 'broken_custody', 'unverifiable_artifact', 'unsupported_claim']),
  gaps              jsonb NOT NULL CHECK (jsonb_typeof(gaps) = 'array'),
  examined          int  NOT NULL CHECK (examined >= 0),
  truncated         boolean NOT NULL,
  rule_version      text NOT NULL,
  route             text CHECK (route IS NULL OR route IN ('recompute', 'adjudication')),
  routed_to         uuid,
  note              text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  supersedes        uuid REFERENCES graph.product_fitness_marks (mark_id),
  marked_by         uuid NOT NULL,
  marked_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT gpfm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpfm_unfit_reasons CHECK ((verdict = 'unfit') = (cardinality(reasons) >= 1)),
  CONSTRAINT gpfm_unfit_routed CHECK ((verdict = 'unfit') = (route IS NOT NULL))
);
COMMENT ON TABLE graph.product_fitness_marks IS 'B50 §PV (0120; DP-23-005): the generic UNFIT mark of a product version — the evaluation''s verdict (incomplete lineage, broken custody, an unverifiable artifact, an unlabelled unsupported claim) with its gaps, recorded by a named person; an unfit mark is routed (recompute | adjudication) to the owner; consequential use and export refuse it (objects._lineage_usable). Append-only: the latest mark of a version is current, a re-evaluation supersedes.';
CREATE INDEX gpfm_object ON graph.product_fitness_marks (object_id, object_version, marked_at DESC);
CREATE TRIGGER gpfm_append_only BEFORE UPDATE OR DELETE ON graph.product_fitness_marks FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE CONTEST PATH (HX-14), B21's shape (simulation.challenges 0081:853): one row per challenge with its state; the events beside it. */
CREATE TABLE graph.knowledge_challenges (
  challenge_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  subject_kind       text NOT NULL CHECK (subject_kind IN ('claim', 'assessment', 'warning', 'forecast')),
  subject_type       text NOT NULL CHECK (subject_type IN ('CLM', 'ENT', 'EVT', 'REL', 'ASM', 'WRN', 'FCT')),
  subject_id         uuid NOT NULL,
  subject_version    int  NOT NULL CHECK (subject_version >= 1),
  subject_digest     text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  subject_owner      uuid,
  grounds            text NOT NULL CHECK (length(btrim(grounds)) BETWEEN 16 AND 4000),
  disputed           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(disputed) = 'array'),
  state              text NOT NULL CHECK (state IN ('open', 'under_review', 'upheld', 'dismissed', 'withdrawn')),
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  review_by          timestamptz NOT NULL,
  reviewer           uuid,
  review_started_at  timestamptz,
  decided_by         uuid,
  decided_at         timestamptz,
  decision_note      text,
  withdrawn_at       timestamptz,
  withdrawal_reason  text,
  escalations        int  NOT NULL DEFAULT 0 CHECK (escalations BETWEEN 0 AND 5),
  escalated_at       timestamptz,
  request_id         uuid NOT NULL UNIQUE,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gkc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gkc_review_bound CHECK ((reviewer IS NULL) = (review_started_at IS NULL) AND (state <> 'under_review' OR reviewer IS NOT NULL)),
  CONSTRAINT gkc_decided CHECK ((state IN ('upheld', 'dismissed')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_note IS NOT NULL)),
  CONSTRAINT gkc_withdrawn CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL AND withdrawal_reason IS NOT NULL)),
  -- SEPARATION OF DUTIES (HX-14): the reviewer and the decider are neither the opener nor the subject's owner; the opener is not the owner.
  CONSTRAINT gkc_separation CHECK ((reviewer IS NULL OR (reviewer <> opened_by AND reviewer IS DISTINCT FROM subject_owner))
                                   AND (decided_by IS NULL OR (decided_by <> opened_by AND decided_by IS DISTINCT FROM subject_owner))
                                   AND opened_by IS DISTINCT FROM subject_owner)
);
COMMENT ON TABLE graph.knowledge_challenges IS 'B50 §PV (0120; HX-14): the contest path of a decision-active intelligence product (a claim, an assessment, a warning, a forecast) — grounds, evidence, a reviewer who is neither the opener nor the owner, the outcome (upheld | dismissed | withdrawn), escalation when overdue on the database clock. A decision is contested through B35''s appeal or B36''s gate challenge, a run through B21''s simulation challenge (routed, never duplicated).';
CREATE UNIQUE INDEX gkc_one_live_per_opener ON graph.knowledge_challenges (subject_id, subject_version, opened_by) WHERE state IN ('open', 'under_review');
CREATE INDEX gkc_subject ON graph.knowledge_challenges (subject_id, subject_version, opened_at);
CREATE INDEX gkc_domain_state ON graph.knowledge_challenges (tenant_id, domain_id, state, review_by);

CREATE TABLE graph.knowledge_challenge_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  challenge_id       uuid NOT NULL REFERENCES graph.knowledge_challenges (challenge_id),
  event              text NOT NULL CHECK (event IN ('challenge.opened', 'challenge.review_started', 'challenge.evidence_submitted', 'challenge.upheld',
                                                    'challenge.dismissed', 'challenge.withdrawn', 'challenge.escalated')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gkce_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gkce_challenge ON graph.knowledge_challenge_events (challenge_id, occurred_at);
CREATE TRIGGER gkce_append_only BEFORE UPDATE OR DELETE ON graph.knowledge_challenge_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.knowledge_challenge_evidence (
  evidence_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  challenge_id       uuid NOT NULL REFERENCES graph.knowledge_challenges (challenge_id),
  ref                text NOT NULL,
  object_type        text NOT NULL,
  object_id          uuid NOT NULL,
  object_version     int  NOT NULL,
  object_digest      text NOT NULL CHECK (object_digest ~ '^[0-9a-f]{64}$'),
  note               text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  party              text NOT NULL CHECK (party IN ('opener', 'owner', 'reviewer')),
  submitted_by       uuid NOT NULL,
  submitted_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gkcv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gkcv_challenge ON graph.knowledge_challenge_evidence (challenge_id, submitted_at);
CREATE TRIGGER gkcv_append_only BEFORE UPDATE OR DELETE ON graph.knowledge_challenge_evidence FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE PROVENANCE AGENT (AG-014), 0060's registry shape: one active per domain, a principal of kind agent with ONE role. */
INSERT INTO identity.roles (code, scope, description) VALUES
  ('provenance_agent', 'DOMAIN',
   'Provenance agent (bounded, deterministic — no model) — constructs product lineage edges (graph.provenance_edges) from RECORDED lineage under a registered, revocable grant, and reports every gap where production history is incomplete; exactly graph.provenance.construct. Cannot mark fitness, decide a challenge, correct, approve or read evidence bytes.')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE graph.provenance_agents (
  agent_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  principal_id        uuid NOT NULL UNIQUE,
  agent_version       text NOT NULL CHECK (agent_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  code_digest         text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  owner_principal_id  uuid NOT NULL,
  budgets             jsonb NOT NULL CHECK (jsonb_typeof(budgets) = 'object' AND budgets ? 'max_depth' AND budgets ? 'max_nodes'),
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at          timestamptz,
  revoked_by          uuid,
  revoke_reason       text,
  correlation_id      uuid NOT NULL,
  CONSTRAINT gpva_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpva_revoked CHECK ((status = 'revoked') = (revoked_at IS NOT NULL) AND (revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL))
);
CREATE UNIQUE INDEX gpva_one_active_per_domain ON graph.provenance_agents (tenant_id, domain_id) WHERE status = 'active';

CREATE TABLE graph.provenance_agent_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  agent_id           uuid NOT NULL REFERENCES graph.provenance_agents (agent_id),
  event              text NOT NULL CHECK (event IN ('agent.registered', 'agent.revoked')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gpvae_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER gpvae_append_only BEFORE UPDATE OR DELETE ON graph.provenance_agent_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* One construction run: the subject, what it constructed, what already stood, and EVERY gap it found (the agent cannot conceal). Append-only. */
CREATE TABLE graph.provenance_runs (
  run_id             uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  agent_id           uuid NOT NULL REFERENCES graph.provenance_agents (agent_id),
  principal_id       uuid NOT NULL,
  agent_version      text NOT NULL,
  code_digest        text NOT NULL,
  subject_type       text NOT NULL,
  subject_id         uuid NOT NULL,
  subject_version    int  NOT NULL,
  outcome            text NOT NULL CHECK (outcome IN ('complete', 'incomplete')),
  examined           int  NOT NULL CHECK (examined >= 0),
  edges_constructed  int  NOT NULL CHECK (edges_constructed >= 0),
  edges_existing     int  NOT NULL CHECK (edges_existing >= 0),
  gaps               jsonb NOT NULL CHECK (jsonb_typeof(gaps) = 'array'),
  truncated          boolean NOT NULL,
  budgets            jsonb NOT NULL,
  started_at         timestamptz NOT NULL,
  finished_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gpvr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpvr_incomplete CHECK ((outcome = 'incomplete') = (jsonb_array_length(gaps) > 0 OR truncated))
);
CREATE INDEX gpvr_subject ON graph.provenance_runs (subject_id, subject_version, finished_at DESC);
CREATE TRIGGER gpvr_append_only BEFORE UPDATE OR DELETE ON graph.provenance_runs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A constructed product lineage edge: the dependent version rests on the upstream version, on a recorded basis. Append-only, unique. */
CREATE TABLE graph.provenance_edges (
  edge_id            uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  dependent_type     text NOT NULL,
  dependent_id       uuid NOT NULL,
  dependent_version  int  NOT NULL,
  upstream_type      text NOT NULL,
  upstream_id        uuid NOT NULL,
  upstream_version   int  NOT NULL,
  basis              text NOT NULL CHECK (basis IN ('evidence_refs', 'source_object_ids', 'claim_lineage', 'correction_of', 'option_citation', 'publication_source')),
  span               jsonb CHECK (span IS NULL OR jsonb_typeof(span) = 'object'),
  version_resolution text NOT NULL CHECK (version_resolution IN ('recorded', 'latest_at_construction', 'evidence_digest')),
  run_id             uuid NOT NULL REFERENCES graph.provenance_runs (run_id) DEFERRABLE INITIALLY DEFERRED,
  constructed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT gpve_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpve_one UNIQUE (dependent_id, dependent_version, upstream_id, upstream_version, basis)
);
CREATE INDEX gpve_dependent ON graph.provenance_edges (dependent_id, dependent_version);
CREATE INDEX gpve_upstream ON graph.provenance_edges (upstream_id, upstream_version);
CREATE TRIGGER gpve_append_only BEFORE UPDATE OR DELETE ON graph.provenance_edges FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

REVOKE ALL ON graph.product_fitness_marks, graph.knowledge_challenges, graph.knowledge_challenge_events, graph.knowledge_challenge_evidence,
              graph.provenance_agents, graph.provenance_agent_events, graph.provenance_runs, graph.provenance_edges FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_fitness_marks', 'knowledge_challenges', 'knowledge_challenge_events', 'knowledge_challenge_evidence',
                           'provenance_agents', 'provenance_agent_events', 'provenance_runs', 'provenance_edges'] LOOP
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

-- §PV.3 THE LINEAGE CLOSURE (internal; no grant — reached only from the definer ports below, which run as the owner) ────────────────────────
/* A recorded object of the tenant (this domain, or a tenant / platform object) by type, id and version; NULL version = the latest. */
CREATE OR REPLACE FUNCTION graph.pv_resolve(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS objects.canonical_objects
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT o.* FROM objects.canonical_objects o
   WHERE o.object_id = p_id AND (p_type IS NULL OR o.object_type = p_type) AND (p_version IS NULL OR o.object_version = p_version)
     AND ((o.tenant_id = p_tenant AND o.domain_id = p_domain) OR (o.tenant_id = p_tenant AND o.domain_id IS NULL) OR o.tenant_id IS NULL)
   ORDER BY o.object_version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION graph.pv_resolve(uuid, uuid, text, uuid, int) FROM PUBLIC;

/* The direct upstream of one object version, as RECORDED: the header's evidence_refs and source_object_ids, its correction_of, a claim's
   lineage (the evidence version whose bytes digest the lineage names, with the byte span), a package version's option citations, a
   publication version's source. One row per distinct reference and basis. */
CREATE OR REPLACE FUNCTION graph.pv_upstream(p_tenant uuid, p_domain uuid, o objects.canonical_objects)
RETURNS TABLE (ref text, basis text, span jsonb, resolution text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, decision, executive, pg_catalog, pg_temp AS $$
DECLARE l intelligence.claim_lineage%ROWTYPE; v_evd int;
BEGIN
  RETURN QUERY SELECT DISTINCT r.v, 'evidence_refs'::text, NULL::jsonb, 'recorded'::text FROM jsonb_array_elements_text(coalesce(o.evidence_refs, '[]'::jsonb)) r(v);
  RETURN QUERY SELECT DISTINCT r.v, 'source_object_ids'::text, NULL::jsonb, 'recorded'::text FROM jsonb_array_elements_text(coalesce(o.source_object_ids, '[]'::jsonb)) r(v)
                WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(o.evidence_refs, '[]'::jsonb)) e(v) WHERE e.v = r.v);
  IF o.correction_of IS NOT NULL THEN
    RETURN QUERY SELECT o.object_type || ':' || o.correction_of, 'correction_of'::text, NULL::jsonb, 'recorded'::text;
  END IF;
  IF o.object_type = ANY (graph.pv_claim_types()) THEN
    SELECT * INTO l FROM intelligence.claim_lineage x WHERE x.claim_object_id = o.object_id AND x.claim_version = o.object_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF FOUND THEN
      SELECT e.object_version INTO v_evd FROM objects.canonical_objects e
       WHERE e.object_id = l.evidence_object_id AND e.object_type = 'EVD' AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.payload ->> 'content_digest' = l.evidence_digest
       ORDER BY e.object_version DESC LIMIT 1;
      RETURN QUERY SELECT 'EVD:' || l.evidence_object_id::text || CASE WHEN v_evd IS NULL THEN '' ELSE '@' || v_evd END, 'claim_lineage'::text,
                          jsonb_build_object('start', l.byte_start, 'end', l.byte_end, 'evidence_digest', l.evidence_digest), CASE WHEN v_evd IS NULL THEN 'latest_at_construction' ELSE 'evidence_digest' END;
    END IF;
  END IF;
  IF o.object_type = 'DPK' THEN
    RETURN QUERY SELECT DISTINCT (CASE c ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' WHEN 'warning' THEN 'WRN' END)
                          || ':' || (c ->> 'id') || CASE WHEN (c ->> 'version') ~ '^[1-9][0-9]{0,8}$' THEN '@' || (c ->> 'version') ELSE '' END,
                          'option_citation'::text, jsonb_build_object('option', op.key), 'recorded'::text
                   FROM decision.options op CROSS JOIN LATERAL jsonb_array_elements(op.consequences) c
                  WHERE op.package_id = o.object_id AND op.version = o.object_version AND op.tenant_id = p_tenant AND op.domain_id = p_domain
                    AND c ->> 'kind' IN ('run', 'forecast', 'claim', 'evidence', 'assumption', 'warning');
  END IF;
  IF o.object_type = 'PUB' THEN
    RETURN QUERY SELECT DISTINCT (CASE pv.source_kind WHEN 'briefing' THEN 'BRF' ELSE 'DPK' END) || ':' || pv.source_id::text || '@' || pv.source_version,
                          'publication_source'::text, jsonb_build_object('publication_version', pv.version), 'recorded'::text
                   FROM executive.publication_versions pv
                  WHERE pv.publication_id = o.object_id AND pv.pub_object_version = o.object_version AND pv.tenant_id = p_tenant AND pv.domain_id = p_domain;
  END IF;
END $$;
REVOKE ALL ON FUNCTION graph.pv_upstream(uuid, uuid, objects.canonical_objects) FROM PUBLIC;

/* The custody and artifact identity of one evidence version: its manifest recorded in this domain under the same bytes digest, its byte
   integrity verified, and a custody chain that establishes it (acquired → admitted / imported / restored) with no integrity failure after the
   last establishing event. Answers {custody: intact | broken, artifact: verified | unverifiable, problems[], events[]}. */
CREATE OR REPLACE FUNCTION graph.pv_evd_custody(p_tenant uuid, p_domain uuid, o objects.canonical_objects) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, objects, pg_catalog, pg_temp AS $$
DECLARE v_manifest uuid; v_digest text := o.payload ->> 'content_digest'; m observation.blob_manifests%ROWTYPE; v_problems jsonb := '[]'::jsonb;
        v_custody text := 'intact'; v_artifact text := 'verified'; v_last_ok timestamptz; v_failed timestamptz; v_events jsonb;
BEGIN
  IF coalesce(o.payload ->> 'manifest_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_manifest := (o.payload ->> 'manifest_id')::uuid; END IF;
  IF v_manifest IS NULL THEN
    v_artifact := 'unverifiable'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact', 'reason', 'the evidence names no blob manifest'));
  ELSE
    SELECT * INTO m FROM observation.blob_manifests b WHERE b.manifest_id = v_manifest AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    IF NOT FOUND THEN
      v_artifact := 'unverifiable'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact', 'reason', format('manifest %s is not recorded in this domain', v_manifest)));
    ELSIF m.content_digest IS DISTINCT FROM v_digest THEN
      v_artifact := 'unverifiable'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact',
        'reason', format('the manifest records bytes digest %s; the evidence names %s', left(m.content_digest, 12), left(coalesce(v_digest, '<none>'), 12))));
    END IF;
  END IF;
  IF o.payload ? 'authenticity' AND coalesce(o.payload #>> '{authenticity,byte_integrity}', '') <> 'verified' THEN
    v_artifact := 'unverifiable'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact',
      'reason', format('byte integrity is %s, not verified', coalesce(o.payload #>> '{authenticity,byte_integrity}', '<unstated>'))));
  END IF;
  SELECT max(e.occurred_at) INTO v_last_ok FROM observation.custody_events e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND (e.evd_object_id = o.object_id OR (v_manifest IS NOT NULL AND e.manifest_id = v_manifest))
     AND e.event IN ('custody.admitted', 'custody.imported', 'custody.restored', 'custody.verified', 'custody.finalized')
     AND (e.content_digest IS NULL OR e.content_digest = v_digest);
  SELECT max(e.occurred_at) INTO v_failed FROM observation.custody_events e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND (e.evd_object_id = o.object_id OR (v_manifest IS NOT NULL AND e.manifest_id = v_manifest))
     AND (e.event = 'custody.integrity_failed' OR e.digest_verified = false OR (e.content_digest IS NOT NULL AND e.content_digest <> v_digest));
  IF v_last_ok IS NULL THEN
    v_custody := 'broken'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'broken_custody', 'reason', 'no custody event establishes this evidence (admitted, imported, restored or verified under its digest)'));
  ELSIF v_failed IS NOT NULL AND v_failed >= v_last_ok THEN
    v_custody := 'broken'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'broken_custody',
      'reason', format('custody failed integrity at %s, after the last verified custody at %s', graph.pv_iso(v_failed), graph.pv_iso(v_last_ok))));
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'at', graph.pv_iso(e.occurred_at), 'actor', e.actor, 'digest_verified', e.digest_verified,
                                               'digest_matches', CASE WHEN e.content_digest IS NULL THEN NULL ELSE e.content_digest = v_digest END) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
    INTO v_events FROM observation.custody_events e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND (e.evd_object_id = o.object_id OR (v_manifest IS NOT NULL AND e.manifest_id = v_manifest));
  RETURN jsonb_build_object('custody', v_custody, 'artifact', v_artifact, 'manifest_id', v_manifest, 'bytes_digest', v_digest, 'problems', v_problems, 'events', v_events);
END $$;
REVOKE ALL ON FUNCTION graph.pv_evd_custody(uuid, uuid, objects.canonical_objects) FROM PUBLIC;

/* THE BACKWARD CLOSURE of one product version over recorded lineage, breadth first, bounded by depth and nodes. Answers
   {root, objects[{key, type, id, version, depth, digest, lifecycle, truth_state, synthetic, recorded_at, owner, method_ref, human_refs, audit_correlation_id, title}],
    edges[{from, to, ref, basis, span, resolution}], gaps[{kind, ref, at, reason}], truncated, examined} — or NULL when the root is not recorded.
   A gap is every reference that does not resolve, an extracted claim without its lineage, an evidence digest the lineage names that is not
   the evidence's, broken custody, an unverifiable artifact: kept, never dropped (DP-23-005 "the gap preserved"). */
CREATE OR REPLACE FUNCTION graph.pv_closure(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_max_depth int, p_max_nodes int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, observation, pg_catalog, pg_temp AS $$
DECLARE
  root objects.canonical_objects; o objects.canonical_objects; t objects.canonical_objects;
  v_queue jsonb; v_seen text[] := '{}'; v_objects jsonb := '[]'::jsonb; v_edges jsonb := '[]'::jsonb; v_gaps jsonb := '[]'::jsonb;
  v_truncated boolean := false; q jsonb; i int := 0; u record; r jsonb; v_key text; v_to text; v_depth int; c jsonb; l intelligence.claim_lineage%ROWTYPE; v_evd_digest text;
BEGIN
  root := graph.pv_resolve(p_tenant, p_domain, p_type, p_id, p_version);
  IF root.object_id IS NULL OR root.domain_id IS DISTINCT FROM p_domain THEN RETURN NULL; END IF;
  v_queue := jsonb_build_array(jsonb_build_object('type', root.object_type, 'id', root.object_id, 'version', root.object_version, 'depth', 0));
  WHILE i < jsonb_array_length(v_queue) LOOP
    q := v_queue -> i; i := i + 1;
    v_key := (q ->> 'type') || ':' || (q ->> 'id') || '@' || (q ->> 'version');
    CONTINUE WHEN v_key = ANY (v_seen);
    IF coalesce(array_length(v_seen, 1), 0) >= p_max_nodes THEN v_truncated := true; EXIT; END IF;
    v_seen := v_seen || v_key; v_depth := (q ->> 'depth')::int;
    o := graph.pv_resolve(p_tenant, p_domain, q ->> 'type', (q ->> 'id')::uuid, (q ->> 'version')::int);
    v_objects := v_objects || jsonb_build_array(jsonb_build_object('key', v_key, 'type', o.object_type, 'id', o.object_id, 'version', o.object_version, 'depth', v_depth,
      'digest', o.content_digest, 'lifecycle', o.lifecycle_state, 'truth_state', o.truth_state, 'synthetic', o.synthetic_state, 'recorded_at', graph.pv_iso(o.recorded_at),
      'owner', o.accountable_owner, 'owning_component', o.owning_component, 'method_ref', o.method_ref, 'human_refs', o.human_refs, 'audit_correlation_id', o.audit_correlation_id,
      'classification', o.classification,
      'title', left(coalesce(o.payload ->> 'title', o.payload ->> 'statement', o.payload ->> 'subject', o.payload ->> 'label', o.object_type || ' ' || o.object_id::text), 200)));
    -- an EXTRACTED claim carries its lineage row (0023 §5); its evidence digest is the evidence's bytes digest
    IF o.object_type = ANY (graph.pv_claim_types()) THEN
      SELECT * INTO l FROM intelligence.claim_lineage x WHERE x.claim_object_id = o.object_id AND x.claim_version = o.object_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND AND o.truth_state = 'extracted' THEN
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'incomplete_lineage', 'ref', v_key, 'at', v_key, 'reason', 'an extracted claim without its lineage row (no evidence span, no method, no admission decision)'));
      ELSIF FOUND THEN
        SELECT e.payload ->> 'content_digest' INTO v_evd_digest FROM objects.canonical_objects e
         WHERE e.object_id = l.evidence_object_id AND e.object_type = 'EVD' AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.payload ->> 'content_digest' = l.evidence_digest LIMIT 1;
        IF v_evd_digest IS NULL THEN
          v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact', 'ref', 'EVD:' || l.evidence_object_id, 'at', v_key,
            'reason', format('the lineage names evidence bytes %s; no version of evidence %s in this domain carries them', left(l.evidence_digest, 12), l.evidence_object_id)));
        END IF;
      END IF;
    END IF;
    IF o.object_type = 'EVD' THEN
      c := graph.pv_evd_custody(p_tenant, p_domain, o);
      FOR r IN SELECT * FROM jsonb_array_elements(c -> 'problems') LOOP
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', r ->> 'kind', 'ref', v_key, 'at', v_key, 'reason', r ->> 'reason'));
      END LOOP;
    END IF;
    FOR u IN SELECT * FROM graph.pv_upstream(p_tenant, p_domain, o) LOOP
      r := graph.pv_ref(u.ref);
      v_to := NULL;
      IF r ->> 'form' = 'manifest' THEN
        IF NOT EXISTS (SELECT 1 FROM observation.blob_manifests b WHERE b.manifest_id = (r ->> 'id')::uuid AND b.tenant_id = p_tenant AND b.domain_id = p_domain) THEN
          v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact', 'ref', u.ref, 'at', v_key, 'reason', 'the artifact manifest is not recorded in this domain'));
        END IF;
        v_edges := v_edges || jsonb_build_array(jsonb_build_object('from', v_key, 'to', NULL, 'ref', u.ref, 'basis', u.basis, 'span', u.span, 'resolution', 'artifact'));
        CONTINUE;
      ELSIF r ->> 'form' = 'opaque' THEN
        v_edges := v_edges || jsonb_build_array(jsonb_build_object('from', v_key, 'to', NULL, 'ref', u.ref, 'basis', u.basis, 'span', u.span, 'resolution', 'opaque'));
        CONTINUE;
      END IF;
      t := graph.pv_resolve(p_tenant, p_domain, r ->> 'type', (r ->> 'id')::uuid, (r ->> 'version')::int);
      IF t.object_id IS NULL THEN
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'incomplete_lineage', 'ref', u.ref, 'at', v_key, 'reason', format('%s does not resolve to a recorded object of this tenant (basis %s)', u.ref, u.basis)));
        v_edges := v_edges || jsonb_build_array(jsonb_build_object('from', v_key, 'to', NULL, 'ref', u.ref, 'basis', u.basis, 'span', u.span, 'resolution', 'unresolved'));
        CONTINUE;
      END IF;
      v_to := t.object_type || ':' || t.object_id || '@' || t.object_version;
      v_edges := v_edges || jsonb_build_array(jsonb_build_object('from', v_key, 'to', v_to, 'ref', u.ref, 'basis', u.basis, 'span', u.span,
        'resolution', CASE WHEN u.resolution <> 'recorded' THEN u.resolution WHEN r ->> 'version' IS NULL THEN 'latest_at_construction' ELSE 'recorded' END));
      IF v_depth + 1 > p_max_depth THEN v_truncated := true; CONTINUE; END IF;
      IF NOT (v_to = ANY (v_seen)) THEN
        v_queue := v_queue || jsonb_build_array(jsonb_build_object('type', t.object_type, 'id', t.object_id, 'version', t.object_version, 'depth', v_depth + 1));
      END IF;
    END LOOP;
  END LOOP;
  IF i < jsonb_array_length(v_queue) THEN v_truncated := true; END IF;
  RETURN jsonb_build_object('root', root.object_type || ':' || root.object_id || '@' || root.object_version, 'objects', v_objects, 'edges', v_edges, 'gaps', v_gaps,
                            'truncated', v_truncated, 'examined', jsonb_array_length(v_objects), 'bounds', jsonb_build_object('max_depth', p_max_depth, 'max_nodes', p_max_nodes));
END $$;
REVOKE ALL ON FUNCTION graph.pv_closure(uuid, uuid, text, uuid, int, int, int) FROM PUBLIC;

/* The FORWARD side as a read-only PREVIEW (never a recorded walk; the walk's buckets and classes are §CI's graph.affected_products): what
   names this object today — claims whose lineage reads it, constructed edges, package options citing it, briefings and publications sourced
   on it, declared strategy dependencies on it, and the invalidations already recorded for it. Bounded (50 per bucket). */
CREATE OR REPLACE FUNCTION graph.pv_downstream(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, decision, executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('preview', true, 'note', 'a read-only preview of what names this version today; the recorded impact walk (its buckets and affected classes) is graph.record_impact / graph.affected_products',
    'claims', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', l.claim_type || ':' || l.claim_object_id || '@' || l.claim_version, 'span', jsonb_build_object('start', l.byte_start, 'end', l.byte_end)) x
                 FROM intelligence.claim_lineage l WHERE p_type = 'EVD' AND l.evidence_object_id = p_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain LIMIT 50) s),
    'constructed', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', e.dependent_type || ':' || e.dependent_id || '@' || e.dependent_version, 'basis', e.basis) x
                 FROM graph.provenance_edges e WHERE e.upstream_id = p_id AND (p_version IS NULL OR e.upstream_version = p_version) AND e.tenant_id = p_tenant AND e.domain_id = p_domain LIMIT 50) s),
    'options', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', 'DPK:' || op.package_id || '@' || op.version, 'option', op.key) x
                 FROM decision.options op WHERE op.tenant_id = p_tenant AND op.domain_id = p_domain AND EXISTS (SELECT 1 FROM jsonb_array_elements(op.consequences) c WHERE c ->> 'id' = p_id::text) LIMIT 50) s),
    'briefings', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', 'BRF:' || b.object_id || '@' || b.object_version) x
                 FROM objects.canonical_objects b WHERE b.object_type = 'BRF' AND b.tenant_id = p_tenant AND b.domain_id = p_domain
                  AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(b.source_object_ids || b.evidence_refs) s WHERE position(p_id::text in s) > 0) LIMIT 50) s),
    'publications', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', 'PUB:' || pv.publication_id || ' v' || pv.version, 'state', pv.state) x
                 FROM executive.publication_versions pv WHERE pv.source_id = p_id AND pv.tenant_id = p_tenant AND pv.domain_id = p_domain LIMIT 50) s),
    'strategy', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', d.dependent_type || ':' || d.dependent_object_id, 'rationale', d.rationale) x
                 FROM graph.dependencies d WHERE d.depends_on_id = p_id AND d.state = 'active' AND d.tenant_id = p_tenant AND d.domain_id = p_domain LIMIT 50) s),
    'invalidations', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'opened_at'), '[]'::jsonb) FROM (SELECT jsonb_build_object('invalidation_id', v.invalidation_id, 'trigger_kind', v.trigger_kind, 'state', v.state,
                 'opened_at', graph.pv_iso(v.opened_at), 'correction_case_id', v.correction_case_id, 'statement', v.statement,
                 'affected', jsonb_build_object('assumptions', v.affected_assumptions, 'objectives', v.affected_objectives, 'decisions', v.affected_decisions, 'commitments', v.affected_commitments)) x
                 FROM graph.invalidations_current v WHERE v.trigger_object_id = p_id AND v.tenant_id = p_tenant AND v.domain_id = p_domain LIMIT 50) s))
$$;
REVOKE ALL ON FUNCTION graph.pv_downstream(uuid, uuid, text, uuid, int) FROM PUBLIC;

-- §PV.4 graph.explain ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE BACKWARD PATH of one product version (V03-T-194, ES-28-004, AI-06-003, AI-29-004). Object nodes from the closure (the product, its
   claims, evidence, sources); for each, the nodes of what produced or contested it — its method; the extraction run, the model gateway
   call (model, weights, prompt version), the retrieval and admission policy decisions and the review case of a claim; the abstentions of
   the same run; the PDP denials naming it; the knowledge, simulation and decision challenges and appeals on it; a package's approvals,
   signatures, gate actions, overrides, agent runs and recorded PDP denials; a forecast's fitness assessments and withdrawal; a run's
   failure or invalidation; the corrections recorded on it; the fitness marks; the provenance agent's runs; the propagation attempts; the
   memory reads; the audit request (synchronous) and the outbox event (event) of its write. Each node carries its OUTCOME — ok, denied,
   abstained, challenged, overridden, corrected, failed, unresolved — and its BOUNDARY; the tool boundary is carried (B70). An object node's
   `parents` are what it rests on: its upstream objects and the nodes of its production and contest. STABLE; read scope enforced. */
CREATE OR REPLACE FUNCTION graph.explain(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, observation, decision, executive, simulation, prediction, memory, policy, audit, pg_catalog, pg_temp AS $$
DECLARE
  cl jsonb; ob jsonb; e jsonb; g jsonb; x record; y record; v_nodes jsonb := '[]'::jsonb; v_ids text[] := '{}'; v_attach jsonb := '{}'::jsonb;
  v_key text; v_oid uuid; v_ver int; v_type text; v_corr uuid; v_n int := 0; v_out jsonb := '[]'::jsonb; v_parents jsonb; v_root jsonb;
  v_counts jsonb; v_bounds jsonb; v_kind text; l intelligence.claim_lineage%ROWTYPE; v_node jsonb; v_gid text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the explanation of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance rejected (subject): an explanation names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  cl := graph.pv_closure(p_tenant, p_domain, p_type, p_id, p_version, 12, 400);
  IF cl IS NULL THEN
    RAISE EXCEPTION 'provenance rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  FOR ob IN SELECT * FROM jsonb_array_elements(cl -> 'objects') LOOP
    v_key := ob ->> 'key'; v_oid := (ob ->> 'id')::uuid; v_ver := (ob ->> 'version')::int; v_type := ob ->> 'type'; v_corr := (ob ->> 'audit_correlation_id')::uuid;
    -- (a) the method
    IF ob ->> 'method_ref' IS NOT NULL THEN
      v_gid := 'method:' || (ob ->> 'method_ref');
      IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid; v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'method', ob ->> 'method_ref', 'method ' || (ob ->> 'method_ref'), 'ok', NULL, NULL, NULL, NULL)); END IF;
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END IF;
    -- (b) the people named on the version (human boundary)
    FOR x IN SELECT DISTINCT h.v FROM jsonb_array_elements_text(coalesce(ob -> 'human_refs', '[]'::jsonb)) h(v) LOOP
      v_gid := 'human:' || x.v || ':' || v_key; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'human_action', x.v, 'recorded by a named person', 'ok', (ob ->> 'recorded_at')::timestamptz, x.v, NULL, 'human'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (c) the request that wrote it (synchronous boundary: the audit correlation) and the event it published (event boundary: the outbox causation)
    FOR x IN SELECT ae.partition_id, ae.audit_seq, ae.action, ae.actor, ae.outcome, ae.occurred_at FROM audit.audit_events ae
              WHERE ae.correlation_id = v_corr AND ae.tenant_id = p_tenant ORDER BY ae.audit_seq LIMIT 4 LOOP
      v_gid := 'audit:' || x.partition_id || ':' || x.audit_seq;
      IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'human_action', 'audit:' || x.audit_seq, 'request ' || x.action || ' (' || x.outcome || ')',
          CASE WHEN x.outcome = 'success' THEN 'ok' WHEN x.outcome = 'denied' THEN 'denied' ELSE 'failed' END, graph.revision_instant(x.occurred_at), x.actor, NULL, 'synchronous')); END IF;
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    FOR x IN SELECT ob2.id, ob2.event_type, ob2.status, ob2.created_at FROM objects.object_outbox ob2 WHERE ob2.correlation_id = v_corr AND ob2.tenant_id = p_tenant ORDER BY ob2.created_at LIMIT 4 LOOP
      v_gid := 'event:' || x.id;
      IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'workflow', 'outbox:' || x.id, 'event ' || x.event_type || ' (' || x.status || ')', CASE WHEN x.status = 'failed' THEN 'failed' ELSE 'ok' END, x.created_at, NULL, NULL, 'event')); END IF;
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (d) a claim: its lineage — the extraction run (agent), the gateway call (model), the two policy decisions, the review case, the run's abstentions
    IF v_type = ANY (graph.pv_claim_types()) THEN
      SELECT * INTO l FROM intelligence.claim_lineage z WHERE z.claim_object_id = v_oid AND z.claim_version = v_ver AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
      IF FOUND THEN
        v_gid := 'xmethod:' || l.method_id;
        IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
          SELECT m.name, m.method_key, m.method_version, m.lifecycle_state INTO y FROM intelligence.methods_current m WHERE m.method_id = l.method_id;
          v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'method', 'method:' || l.method_id, CASE WHEN y.method_key IS NULL THEN 'extraction method ' || l.method_id ELSE 'extraction method ' || y.method_key || ' v' || y.method_version || ' (' || y.lifecycle_state || ')' END,
            CASE WHEN y.method_key IS NULL THEN 'unresolved' ELSE 'ok' END, NULL, NULL, NULL, NULL)); END IF;
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        v_gid := 'run:' || l.run_id;
        IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
          SELECT bool_or(re.event IN ('run.failed', 'run.budget_exceeded')) failed, bool_or(re.event = 'run.abstained') abstained, max(re.occurred_at) at, count(*) n INTO y
            FROM intelligence.run_events re WHERE re.run_id = l.run_id AND re.tenant_id = p_tenant;
          v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'agent_run', 'extraction-run:' || l.run_id, 'extraction run ' || l.run_id || ' (' || l.mode || ')',
            CASE WHEN coalesce(y.failed, false) THEN 'failed' WHEN coalesce(y.abstained, false) THEN 'abstained' WHEN coalesce(y.n, 0) = 0 THEN 'unresolved' ELSE 'ok' END, y.at, NULL, NULL, 'agent')); END IF;
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        IF l.call_id IS NOT NULL THEN
          v_gid := 'model:' || l.call_id;
          IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
            SELECT gc.model_id, gc.prompt_version, gc.runtime_version, gc.outcome, gc.occurred_at INTO y FROM intelligence.gateway_calls gc WHERE gc.call_id = l.call_id;
            v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'model_call', 'gateway:' || l.call_id,
              CASE WHEN y.model_id IS NULL THEN 'model call (not recorded)' ELSE 'model ' || y.model_id || ' · prompt ' || y.prompt_version || ' · runtime ' || y.runtime_version || ' (' || y.outcome || ')' END,
              CASE y.outcome WHEN 'completed' THEN 'ok' WHEN 'abstained' THEN 'abstained' WHEN 'refused' THEN 'denied' WHEN 'failed' THEN 'failed' ELSE 'unresolved' END, y.occurred_at, NULL, NULL, 'model')); END IF;
          v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        END IF;
        FOR x IN SELECT d.id, d.decision, d.action, d.reason, d.created_at, d.principal_id FROM policy.policy_decisions d WHERE d.id IN (l.retrieval_decision_id, l.admission_decision_id) LOOP
          v_gid := 'policy:' || x.id;
          IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
            v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'policy_decision', 'policy:' || x.id, 'policy ' || x.action || ': ' || x.decision, CASE WHEN x.decision IN ('allow', 'allow_with_obligations') THEN 'ok' ELSE 'denied' END, x.created_at, x.principal_id, NULL, 'synchronous')); END IF;
          v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        END LOOP;
        FOR x IN SELECT rc.case_id, rc.state, rc.queued_reason, rc.decision_reason, rc.decided_at, rc.opened_at, rc.decider_principal_id, rc.claim_object_id FROM intelligence.review_current rc
                  WHERE (rc.claim_object_id = v_oid AND rc.claim_version = v_ver) OR (rc.run_id = l.run_id AND rc.queued_reason = 'abstained') ORDER BY rc.opened_at LIMIT 20 LOOP
          v_gid := 'review:' || x.case_id;
          IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
            v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'review:' || x.case_id,
              CASE WHEN x.claim_object_id IS NULL THEN 'the extraction ABSTAINED in this run (' || x.state || ')' ELSE 'review ' || x.state || ' (' || x.queued_reason || ')' || coalesce(': ' || x.decision_reason, '') END,
              CASE WHEN x.claim_object_id IS NULL THEN 'abstained' WHEN x.state = 'approved' THEN 'ok' WHEN x.state = 'rejected' THEN 'denied' WHEN x.state = 'corrected' THEN 'corrected' ELSE 'unresolved' END,
              coalesce(x.decided_at, x.opened_at), x.decider_principal_id::text, NULL, 'human')); END IF;
          v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        END LOOP;
        FOR x IN SELECT gc.call_id, gc.outcome, gc.occurred_at, gc.model_id FROM intelligence.gateway_calls gc WHERE gc.run_id = l.run_id AND gc.outcome IN ('abstained', 'refused', 'failed') AND gc.call_id IS DISTINCT FROM l.call_id LIMIT 10 LOOP
          v_gid := 'model:' || x.call_id;
          IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
            v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'model_call', 'gateway:' || x.call_id, 'a model call of the same run ' || x.outcome || ' (' || x.model_id || ')',
              CASE x.outcome WHEN 'abstained' THEN 'abstained' WHEN 'refused' THEN 'denied' ELSE 'failed' END, x.occurred_at, NULL, NULL, 'model')); END IF;
          v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        END LOOP;
      END IF;
    END IF;
    -- (e) the PDP denials naming the object (a denied path, not only audit)
    FOR x IN SELECT d.id, d.decision, d.action, d.reason, d.created_at, d.principal_id FROM policy.policy_decisions d
              WHERE d.object_id = v_oid AND d.tenant_id = p_tenant AND d.decision IN ('deny', 'indeterminate') ORDER BY d.created_at LIMIT 20 LOOP
      v_gid := 'policy:' || x.id;
      IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'policy_decision', 'policy:' || x.id, 'denied: ' || x.action || ' — ' || left(x.reason, 200), 'denied', x.created_at, x.principal_id, NULL, 'synchronous')); END IF;
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (f) the contest: knowledge challenges (§PV.8), simulation challenges (B21), decision challenges (B36), appeals (B35)
    FOR x IN SELECT k.challenge_id, k.state, k.grounds, k.opened_at, k.opened_by, k.decided_at FROM graph.knowledge_challenges k WHERE k.subject_id = v_oid AND k.subject_version = v_ver AND k.tenant_id = p_tenant ORDER BY k.opened_at LOOP
      v_gid := 'challenge:' || x.challenge_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'knowledge-challenge:' || x.challenge_id, 'knowledge challenge ' || x.state || ': ' || left(x.grounds, 160),
        CASE WHEN x.state IN ('open', 'under_review', 'upheld') THEN 'challenged' ELSE 'ok' END, coalesce(x.decided_at, x.opened_at), x.opened_by::text, NULL, 'human'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    IF v_type = 'SIM' THEN
      FOR x IN SELECT s.challenge_id, s.state, s.kind, s.opened_at, s.opened_by FROM simulation.challenges s WHERE s.run_id = v_oid AND s.tenant_id = p_tenant ORDER BY s.opened_at LOOP
        v_gid := 'simchallenge:' || x.challenge_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'simulation-challenge:' || x.challenge_id, 'simulation challenge (' || x.kind || ') ' || x.state,
          CASE WHEN x.state IN ('open', 'rerun_requested', 'upheld') THEN 'challenged' ELSE 'ok' END, x.opened_at, x.opened_by::text, NULL, 'human'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT r.state, r.validity, r.invalidated_at, r.invalidation, r.operator_principal_id, r.opened_at FROM simulation.runs_current r WHERE r.run_id = v_oid AND r.tenant_id = p_tenant LOOP
        v_gid := 'simrun:' || v_oid; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'agent_run', 'simulation-run:' || v_oid, 'simulation run ' || x.state || CASE WHEN x.validity = 'invalidated' THEN ', invalidated (' || coalesce(x.invalidation ->> 'trigger', '?') || ')' ELSE '' END,
          CASE WHEN x.state = 'failed' THEN 'failed' WHEN x.validity = 'invalidated' THEN 'corrected' WHEN x.state IN ('opened', 'partial') THEN 'unresolved' ELSE 'ok' END, coalesce(x.invalidated_at, x.opened_at), x.operator_principal_id::text, NULL, 'workflow'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
    END IF;
    FOR x IN SELECT a.case_id, a.state, a.outcome, a.opened_at, a.appellant_principal_id FROM decision.appeal_cases a WHERE a.subject_id = v_oid AND a.tenant_id = p_tenant ORDER BY a.opened_at LIMIT 10 LOOP
      v_gid := 'appeal:' || x.case_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'appeal:' || x.case_id, 'appeal ' || x.state || coalesce(' (' || x.outcome || ')', ''),
        CASE WHEN x.outcome = 'dismissed' THEN 'ok' ELSE 'challenged' END, x.opened_at, x.appellant_principal_id::text, NULL, 'human'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (g) a decision package version: approvals, signatures, gate actions (workflow), overrides, challenges, recorded PDP denials, agent runs
    IF v_type = 'DPK' THEN
      FOR x IN SELECT a.approval_id, a.decision, a.revoked_at, a.recorded_at, a.approver_principal_id, a.eligible_by FROM decision.approvals a WHERE a.package_id = v_oid AND a.version = v_ver ORDER BY a.recorded_at LOOP
        v_gid := 'approval:' || x.approval_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'approval', 'approval:' || x.approval_id, x.decision || ' by ' || x.eligible_by || CASE WHEN x.revoked_at IS NULL THEN '' ELSE ' — revoked' END,
          CASE WHEN x.revoked_at IS NOT NULL THEN 'overridden' WHEN x.decision = 'reject' THEN 'denied' ELSE 'ok' END, x.recorded_at, x.approver_principal_id::text, NULL, 'human'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT s.signature_id, s.subject_kind, s.bound_action, s.signed_at, s.signer, s.key_id FROM executive.signatures s
                WHERE s.tenant_id = p_tenant AND ((s.subject_id = v_oid AND s.subject_version = v_ver) OR s.subject_id IN (SELECT a.approval_id FROM decision.approvals a WHERE a.package_id = v_oid AND a.version = v_ver)) ORDER BY s.signed_at LOOP
        v_gid := 'signature:' || x.signature_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'signature', 'signature:' || x.signature_id, 'signed (' || x.subject_kind || ', ' || x.bound_action || ', key ' || x.key_id || ')', 'ok', x.signed_at, x.signer::text, NULL, 'human'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT ga.action_id, ga.action, ga.from_state, ga.to_state, ga.at, ga.actor_principal_id FROM decision.gate_actions ga WHERE ga.package_id = v_oid AND ga.version = v_ver ORDER BY ga.at LOOP
        v_gid := 'gate:' || x.action_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'workflow', 'gate-action:' || x.action_id, 'gate ' || x.action || ' (' || x.from_state || ' → ' || x.to_state || ')',
          CASE WHEN x.action = 'reject' THEN 'denied' ELSE 'ok' END, x.at, x.actor_principal_id::text, NULL, 'workflow'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT go.override_id, go.kind, go.granted_by, go.expires_at FROM decision.gate_overrides go WHERE go.package_id = v_oid AND go.version = v_ver LOOP
        v_gid := 'override:' || x.override_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'approval', 'gate-override:' || x.override_id, x.kind || ' override of the gate', 'overridden', NULL, x.granted_by::text, NULL, 'human'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT dc.challenge_id, dc.resolution, dc.raised_at, dc.challenger_principal_id FROM decision.challenges dc WHERE dc.package_id = v_oid AND dc.version = v_ver ORDER BY dc.raised_at LOOP
        v_gid := 'dchallenge:' || x.challenge_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'decision-challenge:' || x.challenge_id, 'gate challenge ' || coalesce(x.resolution, 'raised'),
          CASE WHEN x.resolution = 'dismissed' THEN 'ok' ELSE 'challenged' END, x.raised_at, x.challenger_principal_id::text, NULL, 'human'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT pd.denial_id, pd.action, pd.reason, pd.denied_at, pd.principal_id FROM decision.pdp_denials pd WHERE pd.package_id = v_oid AND (pd.package_version IS NULL OR pd.package_version = v_ver) ORDER BY pd.denied_at LIMIT 20 LOOP
        v_gid := 'pdpdenial:' || x.denial_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'policy_decision', 'pdp-denial:' || x.denial_id, 'denied: ' || x.action || ' — ' || left(x.reason, 200), 'denied', x.denied_at, x.principal_id::text, NULL, 'synchronous'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT ar.run_id, ar.task, ar.outcome, ar.agent_kind, ar.agent_version, ar.started_at, ar.principal_id FROM executive.agent_runs ar WHERE ar.package_id = v_oid AND ar.tenant_id = p_tenant ORDER BY ar.started_at LIMIT 10 LOOP
        v_gid := 'agentrun:' || x.run_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'agent_run', 'agent-run:' || x.run_id, x.agent_kind || '@' || x.agent_version || ' ' || x.task || ' (' || x.outcome || ')',
          CASE x.outcome WHEN 'faulted' THEN 'failed' WHEN 'refused' THEN 'denied' WHEN 'finished' THEN 'ok' ELSE 'unresolved' END, x.started_at, x.principal_id::text, NULL, 'agent'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
    END IF;
    -- (h) a forecast: its fitness assessments (the evaluator, B21) and its withdrawal
    IF v_type = 'FCT' THEN
      FOR x IN SELECT fa.assessment_id, fa.verdict, fa.fitness_class, fa.rule_version, fa.assessed_at, fa.assessed_by FROM prediction.forecast_fitness_assessments fa WHERE fa.forecast_id = v_oid AND fa.tenant_id = p_tenant ORDER BY fa.assessed_at LIMIT 10 LOOP
        v_gid := 'fitness-assessment:' || x.assessment_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'forecast-fitness:' || x.assessment_id, 'fitness ' || x.verdict || coalesce(' (' || x.fitness_class || ')', '') || ' under ' || x.rule_version,
          CASE x.verdict WHEN 'fit' THEN 'ok' WHEN 'unfit' THEN 'failed' ELSE 'unresolved' END, x.assessed_at, x.assessed_by::text, NULL, 'synchronous'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
    END IF;
    -- (i) the corrections: a later version correcting this one, the invalidations recorded on it
    FOR x IN SELECT c2.object_version, c2.recorded_at, c2.lifecycle_state, c2.withdrawal_reason FROM objects.canonical_objects c2
              WHERE c2.object_id = v_oid AND c2.object_version > v_ver AND (c2.correction_of = v_oid::text || '@' || v_ver OR c2.supersedes = v_oid::text || '@' || v_ver OR c2.lifecycle_state IN ('corrected', 'withdrawn'))
              ORDER BY c2.object_version LIMIT 5 LOOP
      v_gid := 'correction:' || v_oid || '@' || x.object_version; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'correction', v_type || ':' || v_oid || '@' || x.object_version, 'a later version ' || x.object_version || ' is ' || x.lifecycle_state || coalesce(': ' || x.withdrawal_reason, ''), 'corrected', x.recorded_at, NULL, NULL, NULL));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    FOR x IN SELECT iv.invalidation_id, iv.trigger_kind, iv.state, iv.opened_at, iv.opened_by FROM graph.invalidations_current iv WHERE iv.trigger_object_id = v_oid AND iv.tenant_id = p_tenant ORDER BY iv.opened_at LIMIT 10 LOOP
      v_gid := 'invalidation:' || x.invalidation_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'correction', 'invalidation:' || x.invalidation_id, 'impact recorded: ' || x.trigger_kind || ' (' || x.state || ')', 'corrected', x.opened_at, x.opened_by::text, NULL, NULL));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (j) the fitness marks (the evaluator's rule, recorded by a person) and the provenance agent's runs on it (agent)
    FOR x IN SELECT fm.mark_id, fm.verdict, fm.reasons, fm.rule_version, fm.marked_at, fm.marked_by FROM graph.product_fitness_marks fm WHERE fm.object_id = v_oid AND fm.object_version = v_ver AND fm.tenant_id = p_tenant ORDER BY fm.marked_at LOOP
      v_gid := 'fitness-mark:' || x.mark_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'fitness-mark:' || x.mark_id, 'fitness ' || x.verdict || CASE WHEN cardinality(x.reasons) > 0 THEN ' (' || array_to_string(x.reasons, ', ') || ')' ELSE '' END || ' under ' || x.rule_version,
        CASE x.verdict WHEN 'fit' THEN 'ok' WHEN 'unfit' THEN 'failed' ELSE 'unresolved' END, x.marked_at, x.marked_by::text, NULL, 'human'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    FOR x IN SELECT pr.run_id, pr.outcome, pr.edges_constructed, pr.finished_at, pr.principal_id, pr.agent_version FROM graph.provenance_runs pr WHERE pr.subject_id = v_oid AND pr.subject_version = v_ver AND pr.tenant_id = p_tenant ORDER BY pr.finished_at DESC LIMIT 3 LOOP
      v_gid := 'provenance-run:' || x.run_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'agent_run', 'provenance-run:' || x.run_id, 'provenance agent ' || x.agent_version || ': ' || x.outcome || ' (' || x.edges_constructed || ' edges constructed)',
        CASE x.outcome WHEN 'complete' THEN 'ok' ELSE 'unresolved' END, x.finished_at, x.principal_id::text, NULL, 'agent'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (k) the propagation agent's attempts that walked it (agent) and the memory reads of it (context)
    FOR x IN SELECT pa.event_id, pa.state, pa.last_delivered_at, pa.principal_id FROM graph.propagation_attempts pa WHERE pa.tenant_id = p_tenant AND pa.domain_id = p_domain AND position(v_oid::text in pa.roots::text) > 0 ORDER BY pa.last_delivered_at LIMIT 5 LOOP
      v_gid := 'propagation:' || x.event_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'agent_run', 'propagation-attempt:' || x.event_id, 'propagation walk ' || x.state, CASE x.state WHEN 'failed' THEN 'failed' WHEN 'partial' THEN 'unresolved' WHEN 'complete' THEN 'ok' ELSE 'unresolved' END,
        x.last_delivered_at, x.principal_id::text, NULL, 'agent'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    IF v_type = 'MEM' THEN
      FOR x IN SELECT ma.access_id, ma.purpose_id, ma.accessed_at, ma.reader_principal_id FROM memory.item_access ma WHERE ma.item_id = v_oid AND ma.object_version = v_ver ORDER BY ma.accessed_at DESC LIMIT 5 LOOP
        v_gid := 'memory-read:' || x.access_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'human_action', 'memory-access:' || x.access_id, 'read as context under purpose ' || x.purpose_id, 'ok', x.accessed_at, x.reader_principal_id::text, NULL, 'synchronous'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
    END IF;
  END LOOP;
  -- the gaps as nodes (unresolved), each on the object it was found at
  FOR g IN SELECT * FROM jsonb_array_elements(cl -> 'gaps') LOOP
    v_n := v_n + 1; v_gid := 'gap:' || v_n; v_ids := v_ids || v_gid;
    v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, CASE WHEN g ->> 'kind' IN ('broken_custody', 'unverifiable_artifact') THEN 'evidence' ELSE 'source' END, g ->> 'ref', (g ->> 'kind') || ': ' || (g ->> 'reason'), 'unresolved', NULL, NULL, NULL, NULL));
    v_attach := jsonb_set(v_attach, ARRAY[g ->> 'at'], coalesce(v_attach -> (g ->> 'at'), '[]'::jsonb) || to_jsonb(v_gid));
  END LOOP;
  -- the object nodes last: parents = the upstream objects and the attached nodes
  FOR ob IN SELECT * FROM jsonb_array_elements(cl -> 'objects') LOOP
    v_key := ob ->> 'key'; v_type := ob ->> 'type';
    SELECT coalesce(jsonb_agg(DISTINCT to_jsonb('obj:' || (ed ->> 'to'))), '[]'::jsonb) INTO v_parents FROM jsonb_array_elements(cl -> 'edges') ed WHERE ed ->> 'from' = v_key AND ed ->> 'to' IS NOT NULL;
    v_kind := CASE WHEN v_key = cl ->> 'root' THEN 'product' WHEN v_type = 'EVD' THEN 'evidence' WHEN v_type IN ('SRC', 'OBS') THEN 'source' WHEN v_type = ANY (graph.pv_claim_types()) THEN 'claim' ELSE 'product' END;
    v_node := graph.pv_node('obj:' || v_key, v_kind, v_key, (ob ->> 'title') || ' (' || (ob ->> 'lifecycle') || ', ' || (ob ->> 'truth_state') || CASE WHEN (ob ->> 'synthetic')::boolean THEN ', synthetic' ELSE '' END || ')',
      CASE WHEN ob ->> 'lifecycle' IN ('corrected', 'superseded', 'withdrawn', 'deleted') THEN 'corrected' WHEN ob ->> 'lifecycle' = 'disputed' THEN 'challenged' ELSE 'ok' END,
      (ob ->> 'recorded_at')::timestamptz, ob ->> 'owner', NULL, NULL);
    v_node := jsonb_set(v_node, '{parents}', v_parents || coalesce(v_attach -> v_key, '[]'::jsonb));
    v_node := v_node || jsonb_build_object('depth', (ob ->> 'depth')::int, 'digest', ob ->> 'digest', 'classification', ob ->> 'classification');
    -- the span this object is read at by its dependents (a claim's evidence)
    SELECT ed -> 'span' INTO v_bounds FROM jsonb_array_elements(cl -> 'edges') ed WHERE ed ->> 'to' = v_key AND ed ->> 'basis' = 'claim_lineage' LIMIT 1;
    IF v_bounds IS NOT NULL THEN v_node := jsonb_set(v_node, '{span}', v_bounds); END IF;
    IF v_key = cl ->> 'root' THEN v_root := v_node; END IF;
    v_out := v_out || jsonb_build_array(v_node);
  END LOOP;
  v_out := v_out || v_nodes;
  SELECT jsonb_object_agg(o, n) INTO v_counts FROM (SELECT nd ->> 'outcome' o, count(*) n FROM jsonb_array_elements(v_out) nd GROUP BY 1) s;
  SELECT jsonb_object_agg(b, n) INTO v_bounds FROM (SELECT coalesce(nd ->> 'boundary', 'none') b, count(*) n FROM jsonb_array_elements(v_out) nd GROUP BY 1) s;
  RETURN jsonb_build_object(
    'ref', cl ->> 'root', 'root', 'obj:' || (cl ->> 'root'), 'method', graph.pv_explain_method(), 'as_of', graph.pv_iso(clock_timestamp()),
    'product', jsonb_build_object('type', p_type, 'id', p_id, 'version', p_version, 'digest', v_root ->> 'digest', 'label', v_root ->> 'label', 'outcome', v_root ->> 'outcome'),
    'nodes', v_out, 'edges', cl -> 'edges', 'outcomes', coalesce(v_counts, '{}'::jsonb),
    'boundaries', jsonb_build_object('synchronous', coalesce((v_bounds ->> 'synchronous')::int, 0), 'event', coalesce((v_bounds ->> 'event')::int, 0), 'workflow', coalesce((v_bounds ->> 'workflow')::int, 0),
                                     'agent', coalesce((v_bounds ->> 'agent')::int, 0), 'model', coalesce((v_bounds ->> 'model')::int, 0), 'human', coalesce((v_bounds ->> 'human')::int, 0),
                                     'tool', jsonb_build_object('nodes', 0, 'state', 'carried', 'carrier', 'B70 — the tool gateway (F-P7A-05)')),
    'gaps', cl -> 'gaps', 'truncated', (cl ->> 'truncated')::boolean, 'incomplete', jsonb_array_length(cl -> 'gaps') > 0 OR (cl ->> 'truncated')::boolean,
    'examined', (cl ->> 'examined')::int, 'bounds', cl -> 'bounds', 'carried', graph.pv_carried(),
    'forward', graph.pv_downstream(p_tenant, p_domain, p_type, p_id, p_version));
END $$;
REVOKE ALL ON FUNCTION graph.explain(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.explain(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

-- §PV.5 THE REVISION DIFF (V03-T-192) ──────────────────────────────────────────────────────────────────────────────────────────────────────
/* The JSON-pointer changes between two documents: added / removed / changed leaves (arrays compared by position). IMMUTABLE. */
CREATE OR REPLACE FUNCTION graph.pv_json_diff(a jsonb, b jsonb, p_path text) RETURNS SETOF jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE k text; i int; n int;
BEGIN
  IF a IS NOT DISTINCT FROM b THEN RETURN; END IF;
  IF a IS NULL OR b IS NULL OR jsonb_typeof(a) <> jsonb_typeof(b) OR jsonb_typeof(a) NOT IN ('object', 'array') THEN
    RETURN NEXT jsonb_build_object('pointer', CASE WHEN p_path = '' THEN '/' ELSE p_path END, 'op', CASE WHEN a IS NULL THEN 'added' WHEN b IS NULL THEN 'removed' ELSE 'changed' END, 'before', a, 'after', b);
    RETURN;
  END IF;
  IF jsonb_typeof(a) = 'object' THEN
    FOR k IN SELECT x FROM (SELECT jsonb_object_keys(a) x UNION SELECT jsonb_object_keys(b)) s ORDER BY x LOOP
      RETURN QUERY SELECT * FROM graph.pv_json_diff(a -> k, b -> k, p_path || '/' || replace(replace(k, '~', '~0'), '/', '~1'));
    END LOOP;
  ELSE
    n := greatest(jsonb_array_length(a), jsonb_array_length(b));
    FOR i IN 0 .. n - 1 LOOP
      RETURN QUERY SELECT * FROM graph.pv_json_diff(a -> i, b -> i, p_path || '/' || i);
    END LOOP;
  END IF;
END $$;
REVOKE ALL ON FUNCTION graph.pv_json_diff(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.pv_json_diff(jsonb, jsonb, text) TO eye_app, eye_commit;

/* The change set between two versions of one object: the header fields changed (the 43-field header, content_digest beside it), the payload's
   JSON-pointer changes, the CORRECTION CHAIN between them (every version in (from, to] with its lifecycle, correction_of, supersedes,
   withdrawal reason, digest), and the DOWNSTREAM IMPACT — the invalidations recorded for the object since the from-version, and the
   read-only forward preview of the to-version. */
CREATE OR REPLACE FUNCTION graph.revision_diff(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_from int, p_to int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, pg_catalog, pg_temp AS $$
DECLARE a objects.canonical_objects%ROWTYPE; b objects.canonical_objects%ROWTYPE; ha jsonb; hb jsonb; v_header jsonb; v_payload jsonb; v_chain jsonb; v_inv jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a revision diff');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL THEN
    RAISE EXCEPTION 'provenance rejected (subject): a revision diff names the object as type (three capitals) and id' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from < 1 OR p_to <= p_from THEN
    RAISE EXCEPTION 'provenance rejected (versions): a revision diff compares an earlier version with a later one (from % to %)', coalesce(p_from::text, '-'), coalesce(p_to::text, '-') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM objects.canonical_objects o WHERE o.object_type = p_type AND o.object_id = p_id AND o.object_version = p_from AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'provenance rejected (unknown_version): % % v% is not recorded in this domain', p_type, p_id, p_from USING ERRCODE = '23503'; END IF;
  SELECT * INTO b FROM objects.canonical_objects o WHERE o.object_type = p_type AND o.object_id = p_id AND o.object_version = p_to AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'provenance rejected (unknown_version): % % v% is not recorded in this domain', p_type, p_id, p_to USING ERRCODE = '23503'; END IF;
  ha := to_jsonb(a) - 'payload' - 'object_version'; hb := to_jsonb(b) - 'payload' - 'object_version';
  SELECT coalesce(jsonb_agg(jsonb_build_object('field', k, 'before', ha -> k, 'after', hb -> k) ORDER BY k), '[]'::jsonb) INTO v_header
    FROM (SELECT jsonb_object_keys(ha) k UNION SELECT jsonb_object_keys(hb)) s WHERE (ha -> k) IS DISTINCT FROM (hb -> k);
  SELECT coalesce(jsonb_agg(d ORDER BY d ->> 'pointer'), '[]'::jsonb) INTO v_payload FROM graph.pv_json_diff(a.payload, b.payload, '') d;
  SELECT coalesce(jsonb_agg(jsonb_build_object('version', o.object_version, 'lifecycle', o.lifecycle_state, 'truth_state', o.truth_state, 'correction_of', o.correction_of, 'supersedes', o.supersedes,
                                               'withdrawal_reason', o.withdrawal_reason, 'recorded_at', graph.pv_iso(o.recorded_at), 'digest', o.content_digest) ORDER BY o.object_version), '[]'::jsonb)
    INTO v_chain FROM objects.canonical_objects o WHERE o.object_id = p_id AND o.object_type = p_type AND o.object_version > p_from AND o.object_version <= p_to AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  SELECT coalesce(jsonb_agg(jsonb_build_object('invalidation_id', v.invalidation_id, 'trigger_kind', v.trigger_kind, 'state', v.state, 'opened_at', graph.pv_iso(v.opened_at),
                                               'correction_case_id', v.correction_case_id, 'statement', v.statement,
                                               'affected', jsonb_build_object('assumptions', v.affected_assumptions, 'objectives', v.affected_objectives, 'decisions', v.affected_decisions, 'commitments', v.affected_commitments))
                            ORDER BY v.opened_at), '[]'::jsonb)
    INTO v_inv FROM graph.invalidations_current v WHERE v.trigger_object_id = p_id AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.opened_at >= a.recorded_at;
  RETURN jsonb_build_object('object', jsonb_build_object('type', p_type, 'id', p_id), 'from', jsonb_build_object('version', p_from, 'digest', a.content_digest, 'recorded_at', graph.pv_iso(a.recorded_at), 'record', to_jsonb(a)),
    'to', jsonb_build_object('version', p_to, 'digest', b.content_digest, 'recorded_at', graph.pv_iso(b.recorded_at), 'record', to_jsonb(b)),
    'header', v_header, 'payload', v_payload, 'chain', v_chain,
    'impact', jsonb_build_object('recorded', v_inv, 'preview', graph.pv_downstream(p_tenant, p_domain, p_type, p_id, p_to)));
END $$;
REVOKE ALL ON FUNCTION graph.revision_diff(uuid, uuid, text, uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.revision_diff(uuid, uuid, text, uuid, int, int) TO eye_app, eye_commit;

/* The domain's GRAPH revisions compared by head number: every accepted revision in (from, to] with its items (graph.revision_items 0084),
   the counts summed, and the head now. */
CREATE OR REPLACE FUNCTION graph.graph_revision_diff(p_tenant uuid, p_domain uuid, p_from bigint, p_to bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_head bigint; v_revs jsonb; v_counts jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a graph revision diff');
  SELECT h.head INTO v_head FROM graph.revision_heads h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain;
  v_head := coalesce(v_head, 0);
  IF p_from IS NULL OR p_to IS NULL OR p_from < 0 OR p_to <= p_from THEN
    RAISE EXCEPTION 'provenance rejected (versions): a graph revision diff compares an earlier head with a later one (from % to %)', coalesce(p_from::text, '-'), coalesce(p_to::text, '-') USING ERRCODE = '22023';
  END IF;
  IF p_to > v_head THEN
    RAISE EXCEPTION 'provenance rejected (unknown_revision): the domain''s graph is at revision %; % is not recorded', v_head, p_to USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('revision', r.revision, 'revision_id', r.revision_id, 'expected_revision', r.expected_revision, 'committed_by', r.committed_by,
                                               'committed_at', graph.pv_iso(r.committed_at), 'idempotency_key', r.idempotency_key, 'ontology_version_id', r.ontology_version_id, 'counts', r.counts,
                                               'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal', i.ordinal, 'kind', i.kind, 'ref_id', i.ref_id, 'local_ref', i.local_ref, 'provenance', i.provenance) ORDER BY i.ordinal), '[]'::jsonb)
                                                          FROM graph.revision_items i WHERE i.revision_id = r.revision_id)) ORDER BY r.revision), '[]'::jsonb)
    INTO v_revs FROM graph.revisions r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.revision > p_from AND r.revision <= p_to;
  SELECT coalesce(jsonb_object_agg(k, s), '{}'::jsonb) INTO v_counts FROM (SELECT c.key k, sum((c.value)::text::numeric) s FROM graph.revisions r CROSS JOIN LATERAL jsonb_each(r.counts) c
     WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.revision > p_from AND r.revision <= p_to AND jsonb_typeof(c.value) = 'number' GROUP BY c.key) s;
  RETURN jsonb_build_object('from', p_from, 'to', p_to, 'head', v_head, 'revisions', v_revs, 'counts', v_counts,
    'unrecorded', (p_to - p_from) - jsonb_array_length(v_revs),
    'note', 'a head step without a ledger row is a graph write outside a change set (an edge assertion, a retraction, an entity event): it moved the head and is counted in unrecorded');
END $$;
REVOKE ALL ON FUNCTION graph.graph_revision_diff(uuid, uuid, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.graph_revision_diff(uuid, uuid, bigint, bigint) TO eye_app, eye_commit;

-- §PV.7 ALIGNMENT (internal core first; §PV.6's evaluation reads it) ───────────────────────────────────────────────────────────────────────
/* One citation's alignment: does it resolve to a recorded object of this domain; is it bound to evidence (a claim: its lineage span; evidence
   itself; a derived product: upstream recorded); otherwise which LABEL it carries (assumption, hypothesis, synthetic, inferred, assessed,
   asserted) — an unsupported, unlabelled citation is the unfit case (AI-29-001 → DP-23-005). */
CREATE OR REPLACE FUNCTION graph.pv_cite(p_tenant uuid, p_domain uuid, p_ref text, p_via text, p_classification text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, pg_catalog, pg_temp AS $$
DECLARE r jsonb := graph.pv_ref(p_ref); o objects.canonical_objects; l intelligence.claim_lineage%ROWTYPE; v_span jsonb; v_bound boolean := false; v_label text;
BEGIN
  IF r ->> 'form' NOT IN ('typed', 'bare') THEN
    RETURN jsonb_build_object('ref', p_ref, 'via', p_via, 'resolves', false, 'bound', false, 'label', NULL, 'aligned', false, 'reason', 'not a reference to a recorded object');
  END IF;
  o := graph.pv_resolve(p_tenant, p_domain, r ->> 'type', (r ->> 'id')::uuid, (r ->> 'version')::int);
  IF o.object_id IS NULL THEN
    RETURN jsonb_build_object('ref', p_ref, 'via', p_via, 'resolves', false, 'bound', false, 'label', NULL, 'aligned', false, 'reason', 'does not resolve in this domain');
  END IF;
  IF o.object_type = ANY (graph.pv_claim_types()) THEN
    SELECT * INTO l FROM intelligence.claim_lineage x WHERE x.claim_object_id = o.object_id AND x.claim_version = o.object_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF FOUND THEN v_bound := true; v_span := jsonb_build_object('evidence', 'EVD:' || l.evidence_object_id, 'start', l.byte_start, 'end', l.byte_end); END IF;
  ELSIF o.object_type IN ('EVD', 'OBS', 'SRC') THEN v_bound := true;
  ELSE v_bound := jsonb_array_length(o.evidence_refs) > 0 OR jsonb_array_length(o.source_object_ids) > 0;
  END IF;
  v_label := CASE WHEN o.synthetic_state THEN 'synthetic' WHEN o.object_type IN ('ASU') THEN 'assumption'
                  WHEN coalesce(o.payload ->> 'label', o.payload ->> 'support_label') IN ('assumption', 'hypothesis', 'synthetic', 'unsupported') THEN coalesce(o.payload ->> 'label', o.payload ->> 'support_label')
                  WHEN o.truth_state IN ('inferred', 'assessed', 'asserted', 'decided') THEN o.truth_state ELSE NULL END;
  RETURN jsonb_build_object('ref', o.object_type || ':' || o.object_id || '@' || o.object_version, 'via', p_via, 'resolves', true, 'bound', v_bound, 'span', v_span, 'label', v_label,
    'truth_state', o.truth_state, 'classification', o.classification, 'aligned', v_bound OR v_label IS NOT NULL,
    'above_audience', CASE WHEN p_classification IS NULL THEN NULL ELSE array_position(ARRAY['public', 'internal', 'confidential', 'restricted'], o.classification) > array_position(ARRAY['public', 'internal', 'confidential', 'restricted'], p_classification) END,
    'reason', CASE WHEN v_bound THEN 'bound to evidence' WHEN v_label IS NOT NULL THEN 'unsupported, labelled ' || v_label ELSE 'unsupported and unlabelled' END);
END $$;
REVOKE ALL ON FUNCTION graph.pv_cite(uuid, uuid, text, text, text) FROM PUBLIC;

/* The citations of a briefing (its items, its sources, its narrative's cites), a publication version (its source briefing / report and the
   audience ceiling), or an export package (its executed manifests' evidence, custody, and the claims of the relationship closure). */
CREATE OR REPLACE FUNCTION graph.pv_alignment(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, executive, retention, observation, pg_catalog, pg_temp AS $$
DECLARE b executive.briefings%ROWTYPE; pub executive.publications%ROWTYPE; pv executive.publication_versions%ROWTYPE; x record; v_cites jsonb := '[]'::jsonb; v_extra jsonb := '{}'::jsonb;
        v_item_ids text[]; v_cited text[]; v_ceiling text; v_inner jsonb; o objects.canonical_objects; c jsonb; v_excluded jsonb;
BEGIN
  IF p_kind = 'briefing' THEN
    SELECT * INTO b FROM executive.briefings z WHERE z.briefing_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
    IF NOT FOUND THEN RETURN NULL; END IF;
    -- the lines that CITE a recorded object (evidence, a claim of any type, a run, a memory item, a warning, a forecast) are checked; the
    -- lines that report a LEDGER EVENT (a package or dissent event, a branch event, an acknowledgement, an indicator, a disputed note) carry
    -- no claim to align — they are counted and disclosed, never passed off as evidence
    FOR x IN SELECT it.value AS item FROM jsonb_array_elements(b.items) it LOOP
      IF x.item ? 'id' AND x.item ->> 'kind' IN ('evidence', 'claim', 'run', 'memory', 'warning', 'forecast') THEN
        v_cites := v_cites || jsonb_build_array(graph.pv_cite(p_tenant, p_domain, coalesce(CASE x.item ->> 'kind' WHEN 'memory' THEN 'MEM' WHEN 'forecast' THEN 'FCT' WHEN 'warning' THEN 'WRN'
            WHEN 'run' THEN 'SIM' WHEN 'evidence' THEN 'EVD' END || ':', '') || (x.item ->> 'id') || CASE WHEN (x.item ->> 'version') ~ '^[1-9][0-9]{0,8}$' THEN '@' || (x.item ->> 'version') ELSE '' END,
            'item ' || coalesce(x.item ->> 'item_id', x.item ->> 'id'), NULL) || jsonb_build_object('item_id', x.item ->> 'item_id'));
      END IF;
    END LOOP;
    SELECT array_agg(it ->> 'item_id') INTO v_item_ids FROM jsonb_array_elements(b.items) it;
    SELECT array_agg(c2 #>> '{}') INTO v_cited FROM jsonb_array_elements(b.narrative_cites) c2;
    -- a narrative cite that is no line of the briefing is misaligned; a line the narrative does not cite is disclosed as an omission (compression)
    FOR x IN SELECT c2 #>> '{}' AS cite FROM jsonb_array_elements(b.narrative_cites) c2 LOOP
      IF NOT (x.cite = ANY (coalesce(v_item_ids, '{}'))) THEN
        v_cites := v_cites || jsonb_build_array(jsonb_build_object('ref', x.cite, 'via', 'narrative', 'resolves', false, 'bound', false, 'label', NULL, 'aligned', false, 'reason', 'the narrative cites a line the briefing does not carry'));
      END IF;
    END LOOP;
    v_extra := jsonb_build_object('narrative', b.narrative IS NOT NULL, 'narrative_cites', jsonb_array_length(b.narrative_cites),
      'event_lines', (SELECT count(*) FROM jsonb_array_elements(b.items) it WHERE NOT (it ->> 'kind' IN ('evidence', 'claim', 'run', 'memory', 'warning', 'forecast'))),
      'omitted_from_narrative', CASE WHEN b.narrative IS NULL THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM unnest(coalesce(v_item_ids, '{}')) i WHERE NOT (i = ANY (coalesce(v_cited, '{}')))) END,
      'degraded', b.degraded, 'composed_via', b.composed_via);
    RETURN jsonb_build_object('kind', 'briefing', 'subject', 'BRF:' || p_id, 'citations', v_cites, 'disclosures', v_extra);
  ELSIF p_kind = 'publication' THEN
    SELECT * INTO pub FROM executive.publications z WHERE z.publication_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO pv FROM executive.publication_versions z WHERE z.publication_id = p_id AND z.version = coalesce(p_version, pub.current_version);
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_ceiling := pub.classification;
    IF pv.source_kind = 'briefing' THEN
      v_inner := graph.pv_alignment(p_tenant, p_domain, 'briefing', pv.source_id, NULL);
      FOR c IN SELECT * FROM jsonb_array_elements(coalesce(v_inner -> 'citations', '[]'::jsonb)) LOOP
        v_cites := v_cites || jsonb_build_array(c || jsonb_build_object('above_audience', CASE WHEN c ->> 'classification' IS NULL THEN NULL ELSE
          array_position(ARRAY['public', 'internal', 'confidential', 'restricted'], c ->> 'classification') > array_position(ARRAY['public', 'internal', 'confidential', 'restricted'], v_ceiling) END));
      END LOOP;
    ELSE
      v_cites := jsonb_build_array(graph.pv_cite(p_tenant, p_domain, 'DPK:' || pv.source_id || '@' || pv.source_version, 'report source', v_ceiling));
    END IF;
    v_extra := jsonb_build_object('source', pv.source_kind || ':' || pv.source_id || '@' || pv.source_version, 'state', pv.state,
      'audience', jsonb_build_object('classification', v_ceiling, 'audience', pub.audience,
        'above_ceiling', (SELECT count(*) FROM jsonb_array_elements(v_cites) z WHERE (z ->> 'above_audience')::boolean),
        'note', 'a citation above the publication''s classification is withheld from its audience; the count is disclosed, never the content'),
      'inner', CASE WHEN v_inner IS NULL THEN NULL ELSE v_inner -> 'disclosures' END);
    RETURN jsonb_build_object('kind', 'publication', 'subject', 'PUB:' || p_id || ' v' || pv.version, 'citations', v_cites, 'disclosures', v_extra);
  ELSIF p_kind = 'export' THEN
    IF NOT EXISTS (SELECT 1 FROM retention.export_packages z WHERE z.action_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain)
       AND NOT EXISTS (SELECT 1 FROM retention.actions_current z WHERE z.action_id = p_id AND z.kind = 'customer_export' AND z.tenant_id = p_tenant AND z.domain_id = p_domain) THEN RETURN NULL; END IF;
    FOR x IN SELECT si.ref, si.disposition, si.reason FROM retention.scope_items si WHERE si.action_id = p_id AND si.item_kind = 'manifest' ORDER BY si.dependency_order, si.ref LOOP
      IF x.disposition <> 'execute' THEN CONTINUE; END IF;
      SELECT * INTO o FROM objects.canonical_objects e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.object_type = 'EVD' AND (e.payload ->> 'manifest_id') = x.ref ORDER BY e.object_version DESC LIMIT 1;
      IF o.object_id IS NULL THEN
        v_cites := v_cites || jsonb_build_array(jsonb_build_object('ref', 'blob:' || x.ref, 'via', 'manifest', 'resolves', false, 'bound', false, 'label', NULL, 'aligned', false, 'reason', 'no evidence object carries this manifest'));
      ELSE
        c := graph.pv_evd_custody(p_tenant, p_domain, o);
        v_cites := v_cites || jsonb_build_array(graph.pv_cite(p_tenant, p_domain, 'EVD:' || o.object_id || '@' || o.object_version, 'manifest ' || x.ref, NULL)
          || jsonb_build_object('custody', c ->> 'custody', 'artifact', c ->> 'artifact', 'aligned', (c ->> 'custody') = 'intact' AND (c ->> 'artifact') = 'verified'));
        -- the relationship closure (B15 links.json): every claim read from this evidence carries its lineage
        FOR c IN SELECT jsonb_build_object('ref', l.claim_type || ':' || l.claim_object_id || '@' || l.claim_version) j FROM intelligence.claim_lineage l WHERE l.evidence_object_id = o.object_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain LIMIT 50 LOOP
          v_cites := v_cites || jsonb_build_array(graph.pv_cite(p_tenant, p_domain, c ->> 'ref', 'closure of EVD:' || o.object_id, NULL));
        END LOOP;
      END IF;
    END LOOP;
    SELECT coalesce(jsonb_agg(jsonb_build_object('manifest', si.ref, 'disposition', si.disposition, 'reason', si.reason)), '[]'::jsonb) INTO v_excluded
      FROM retention.scope_items si WHERE si.action_id = p_id AND si.item_kind = 'manifest' AND si.disposition <> 'execute';
    v_extra := jsonb_build_object('withheld', v_excluded, 'note', 'a manifest the approved scope excludes or holds (its classification above the ceiling, a hold) is withheld; it is listed, never carried');
    RETURN jsonb_build_object('kind', 'export', 'subject', 'RTA:' || p_id, 'citations', v_cites, 'disclosures', v_extra);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION graph.pv_alignment(uuid, uuid, text, uuid, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION graph.alignment_check(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE a jsonb; n int; v_aligned int; v_labelled int; v_unlabelled int; v_unresolved int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'an alignment check');
  IF p_kind IS NULL OR p_kind NOT IN ('briefing', 'publication', 'export') THEN
    RAISE EXCEPTION 'provenance rejected (kind): an alignment check reads a briefing, a publication or an export (not %)', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  a := graph.pv_alignment(p_tenant, p_domain, p_kind, p_id, p_version);
  IF a IS NULL THEN RAISE EXCEPTION 'provenance rejected (unknown_object): no % % in this domain', p_kind, p_id USING ERRCODE = '23503'; END IF;
  SELECT count(*), count(*) FILTER (WHERE (c ->> 'aligned')::boolean AND (c ->> 'bound')::boolean), count(*) FILTER (WHERE NOT coalesce((c ->> 'bound')::boolean, false) AND c ->> 'label' IS NOT NULL),
         count(*) FILTER (WHERE NOT coalesce((c ->> 'aligned')::boolean, false) AND c ->> 'label' IS NULL), count(*) FILTER (WHERE NOT coalesce((c ->> 'resolves')::boolean, false))
    INTO n, v_aligned, v_labelled, v_unlabelled, v_unresolved FROM jsonb_array_elements(a -> 'citations') c;
  RETURN a || jsonb_build_object('summary', jsonb_build_object('citations', n, 'bound', v_aligned, 'unsupported_labelled', v_labelled, 'unsupported_unlabelled', v_unlabelled, 'unresolved', v_unresolved),
    'verdict', CASE WHEN v_unlabelled > 0 THEN 'misaligned' ELSE 'aligned' END,
    'translation', jsonb_build_object('state', 'carried', 'carrier', 'B85 — no translation exists (DESIGN D12)'), 'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION graph.alignment_check(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.alignment_check(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

-- §PV.6 THE GENERIC UNFIT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE EVALUATION under graph.pv_fitness_rule(): the closure's gaps (incomplete lineage, broken custody, an unverifiable artifact), an UPHELD
   knowledge challenge on any version in the closure and a briefing's unlabelled unsupported citation (unsupported_claim), an upstream
   version whose current mark is unfit (its reasons). unfit when any gap stands; unknown when the walk was truncated with none found; fit
   only when the whole recorded history was examined and none stands. Internal; no grant. */
CREATE OR REPLACE FUNCTION graph.pv_fitness_eval(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, decision, pg_catalog, pg_temp AS $$
DECLARE cl jsonb; v_gaps jsonb; ob jsonb; x record; a jsonb; v_reasons text[]; v_verdict text;
BEGIN
  cl := graph.pv_closure(p_tenant, p_domain, p_type, p_id, p_version, 12, 400);
  IF cl IS NULL THEN RETURN NULL; END IF;
  v_gaps := cl -> 'gaps';
  FOR ob IN SELECT * FROM jsonb_array_elements(cl -> 'objects') LOOP
    FOR x IN SELECT k.challenge_id, k.decision_note FROM graph.knowledge_challenges k WHERE k.subject_id = (ob ->> 'id')::uuid AND k.subject_version = (ob ->> 'version')::int AND k.state = 'upheld' AND k.tenant_id = p_tenant LOOP
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'unsupported_claim', 'ref', ob ->> 'key', 'at', ob ->> 'key', 'reason', format('knowledge challenge %s was upheld: %s', x.challenge_id, left(x.decision_note, 200))));
    END LOOP;
    -- the EXISTING contest machinery feeds the same rule: an upheld (or partly upheld) B35 appeal on a claim or a forecast in the closure
    FOR x IN SELECT a.case_id, a.outcome, a.rationale FROM decision.appeal_cases a WHERE a.subject_id = (ob ->> 'id')::uuid AND a.tenant_id = p_tenant AND a.outcome IN ('upheld', 'partly_upheld')
               AND (a.subject_version IS NULL OR a.subject_version = (ob ->> 'version')::int) LOOP
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'unsupported_claim', 'ref', ob ->> 'key', 'at', ob ->> 'key', 'reason', format('appeal %s was %s: %s', x.case_id, replace(x.outcome, '_', ' '), left(coalesce(x.rationale, ''), 200))));
    END LOOP;
    IF ob ->> 'key' <> cl ->> 'root' THEN
      FOR x IN SELECT DISTINCT ON (fm.object_id, fm.object_version) fm.mark_id, fm.verdict, fm.reasons FROM graph.product_fitness_marks fm
                WHERE fm.object_id = (ob ->> 'id')::uuid AND fm.object_version = (ob ->> 'version')::int ORDER BY fm.object_id, fm.object_version, fm.marked_at DESC LOOP
        IF x.verdict = 'unfit' THEN
          v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', x.reasons[1], 'ref', ob ->> 'key', 'at', ob ->> 'key', 'reason', format('rests on %s, marked unfit (%s) by mark %s', ob ->> 'key', array_to_string(x.reasons, ', '), x.mark_id)));
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF p_type = 'BRF' THEN
    a := graph.pv_alignment(p_tenant, p_domain, 'briefing', p_id, NULL);
    FOR ob IN SELECT * FROM jsonb_array_elements(coalesce(a -> 'citations', '[]'::jsonb)) LOOP
      IF NOT coalesce((ob ->> 'aligned')::boolean, false) AND ob ->> 'label' IS NULL THEN
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'unsupported_claim', 'ref', ob ->> 'ref', 'at', cl ->> 'root', 'reason', format('the briefing cites %s (%s): %s', ob ->> 'ref', ob ->> 'via', ob ->> 'reason')));
      END IF;
    END LOOP;
  END IF;
  SELECT coalesce(array_agg(DISTINCT g ->> 'kind' ORDER BY g ->> 'kind'), '{}') INTO v_reasons FROM jsonb_array_elements(v_gaps) g;
  v_verdict := CASE WHEN cardinality(v_reasons) > 0 THEN 'unfit' WHEN (cl ->> 'truncated')::boolean THEN 'unknown' ELSE 'fit' END;
  RETURN jsonb_build_object('ref', cl ->> 'root', 'verdict', v_verdict, 'reasons', to_jsonb(v_reasons), 'gaps', v_gaps, 'examined', (cl ->> 'examined')::int, 'truncated', (cl ->> 'truncated')::boolean,
                            'rule_version', graph.pv_fitness_rule(), 'evaluated_at', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION graph.pv_fitness_eval(uuid, uuid, text, uuid, int) FROM PUBLIC;

/* The current mark of a version (its latest), or NULL. Internal; read by the hook, the read and the mark port. */
CREATE OR REPLACE FUNCTION graph.pv_current_mark(p_id uuid, p_version int) RETURNS graph.product_fitness_marks
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT fm.* FROM graph.product_fitness_marks fm WHERE fm.object_id = p_id AND fm.object_version = p_version ORDER BY fm.marked_at DESC, fm.mark_id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION graph.pv_current_mark(uuid, int) FROM PUBLIC;

/* THE READ: the evaluation now (never stored, never "fit by inference": `fit` only when the whole recorded history was examined) beside the
   RECORDED mark (the one consequential use reads) and the mark history. */
CREATE OR REPLACE FUNCTION graph.product_fitness(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, pg_catalog, pg_temp AS $$
DECLARE v_eval jsonb; m graph.product_fitness_marks;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the fitness of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance rejected (subject): a fitness read names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  v_eval := graph.pv_fitness_eval(p_tenant, p_domain, p_type, p_id, p_version);
  IF v_eval IS NULL THEN RAISE EXCEPTION 'provenance rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503'; END IF;
  m := graph.pv_current_mark(p_id, p_version);
  RETURN jsonb_build_object('ref', v_eval ->> 'ref', 'evaluation', v_eval,
    'mark', CASE WHEN m.mark_id IS NULL THEN NULL ELSE jsonb_build_object('mark_id', m.mark_id, 'verdict', m.verdict, 'reasons', to_jsonb(m.reasons), 'gaps', m.gaps, 'route', m.route, 'routed_to', m.routed_to,
                                       'rule_version', m.rule_version, 'marked_by', m.marked_by, 'marked_at', graph.pv_iso(m.marked_at), 'note', m.note, 'supersedes', m.supersedes) END,
    'refuses_use', m.verdict IS NOT DISTINCT FROM 'unfit',
    'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('mark_id', fm.mark_id, 'verdict', fm.verdict, 'reasons', to_jsonb(fm.reasons), 'marked_at', graph.pv_iso(fm.marked_at), 'marked_by', fm.marked_by, 'route', fm.route)
                 ORDER BY fm.marked_at), '[]'::jsonb) FROM graph.product_fitness_marks fm WHERE fm.object_id = p_id AND fm.object_version = p_version AND fm.tenant_id = p_tenant));
END $$;
REVOKE ALL ON FUNCTION graph.product_fitness(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.product_fitness(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

/* THE MARK (its own governed port; DP-23-005). A named person (knowledge owner, data steward, domain administrator) records the EVALUATION's
   verdict — never one the caller names — with its gaps; an unfit verdict is ROUTED (recompute: the owner re-runs; adjudication: a person
   decides the gap) to the product's owner; a fit or unknown verdict over a current unfit mark lifts it (the history keeps both). A mark id
   replayed by the same person for the same version answers the recorded mark. */
CREATE OR REPLACE FUNCTION graph.mark_product_fitness(p_mark_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_route text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); o objects.canonical_objects; v_eval jsonb; prev graph.product_fitness_marks; r graph.product_fitness_marks%ROWTYPE; v_reasons text[]; v_route text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.fitness.mark']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_actor IS NULL OR p_actor IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'product fitness rejected (actor): the mark is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  PERFORM governance.assert_approver('product fitness', v_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'data_steward', 'domain_admin'], NULL, NULL, 'marking a product''s fitness');
  IF p_mark_id IS NULL THEN RAISE EXCEPTION 'product fitness rejected (request): a mark carries its id (the command identity a retry reuses)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM graph.product_fitness_marks fm WHERE fm.mark_id = p_mark_id;
  IF FOUND THEN
    IF r.marked_by <> v_actor OR r.object_id <> p_id OR r.object_version <> p_version THEN
      RAISE EXCEPTION 'product fitness rejected (duplicate): mark % already records another act; a new mark takes a new id', p_mark_id USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('mark_id', r.mark_id, 'verdict', r.verdict, 'reasons', to_jsonb(r.reasons), 'gaps', r.gaps, 'route', r.route, 'routed_to', r.routed_to, 'rule_version', r.rule_version,
                              'marked_at', graph.pv_iso(r.marked_at), 'supersedes', r.supersedes, 'replayed', true);
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN
    RAISE EXCEPTION 'product fitness rejected (note): a mark states its note in 8 to 2000 characters (what was examined, why now)' USING ERRCODE = '22023';
  END IF;
  o := graph.pv_resolve(p_tenant, p_domain, p_type, p_id, p_version);
  IF o.object_id IS NULL OR o.domain_id IS DISTINCT FROM p_domain THEN
    RAISE EXCEPTION 'product fitness rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.fitness:' || p_id::text || '@' || p_version, 0));
  v_eval := graph.pv_fitness_eval(p_tenant, p_domain, p_type, p_id, p_version);
  SELECT coalesce(array_agg(x), '{}') INTO v_reasons FROM jsonb_array_elements_text(v_eval -> 'reasons') x;
  IF v_eval ->> 'verdict' = 'unfit' THEN
    v_route := coalesce(p_route, '');
    IF v_route NOT IN ('recompute', 'adjudication') THEN
      RAISE EXCEPTION 'product fitness rejected (route): the evaluation finds % unfit (%); the mark routes it — recompute (the owner re-runs it) or adjudication (a person decides the gap)', o.object_type || ':' || p_id || '@' || p_version, array_to_string(v_reasons, ', ') USING ERRCODE = '22023';
    END IF;
  ELSE v_route := NULL;
  END IF;
  prev := graph.pv_current_mark(p_id, p_version);
  INSERT INTO graph.product_fitness_marks (mark_id, scope, tenant_id, domain_id, object_type, object_id, object_version, object_digest, verdict, reasons, gaps, examined, truncated, rule_version,
                                           route, routed_to, note, supersedes, marked_by, correlation_id)
  VALUES (p_mark_id, 'DOMAIN', p_tenant, p_domain, o.object_type, p_id, p_version, o.content_digest, v_eval ->> 'verdict', v_reasons, v_eval -> 'gaps', (v_eval ->> 'examined')::int, (v_eval ->> 'truncated')::boolean,
          v_eval ->> 'rule_version', v_route, CASE WHEN v_route IS NULL THEN NULL ELSE graph.pv_owner(o.accountable_owner) END, btrim(p_note), prev.mark_id, v_actor, p_correlation)
  RETURNING * INTO r;
  RETURN jsonb_build_object('mark_id', r.mark_id, 'ref', o.object_type || ':' || p_id || '@' || p_version, 'verdict', r.verdict, 'reasons', to_jsonb(r.reasons), 'gaps', r.gaps, 'route', r.route,
    'routed_to', r.routed_to, 'rule_version', r.rule_version, 'marked_at', graph.pv_iso(r.marked_at), 'supersedes', r.supersedes,
    'lifted', prev.verdict IS NOT DISTINCT FROM 'unfit' AND r.verdict <> 'unfit', 'refuses_use', r.verdict = 'unfit', 'replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.mark_product_fitness(uuid, uuid, uuid, text, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.mark_product_fitness(uuid, uuid, uuid, text, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* THE HOOK — §PV's stub (0120 §0.1) re-declared WHOLE: the same signature, STABLE, invoker, the same search path; read-only. Consequential use
   (a package option, a publication, a gate act) and EXPORT refuse a product whose current mark is UNFIT, or one resting — through the
   provenance agent's constructed edges, eight steps at most — on a version whose current mark is unfit. No mark is no refusal: the hook reads
   the governed record, it never evaluates (a STABLE caller cannot record what an evaluation finds). */
CREATE OR REPLACE FUNCTION objects._lineage_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE m record;
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
  RETURN;
END $$;
REVOKE ALL ON FUNCTION objects._lineage_usable(text, uuid, int, text) FROM PUBLIC;

-- §PV.8 THE CONTEST PATH (HX-14) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.pv_challenge_answer(k graph.knowledge_challenges, p_replayed boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('challenge_id', k.challenge_id, 'subject', jsonb_build_object('kind', k.subject_kind, 'type', k.subject_type, 'id', k.subject_id, 'version', k.subject_version, 'digest', k.subject_digest, 'owner', k.subject_owner),
    'state', k.state, 'grounds', k.grounds, 'disputed', k.disputed, 'opened_by', k.opened_by, 'opened_at', graph.pv_iso(k.opened_at), 'review_by', graph.pv_iso(k.review_by),
    'reviewer', k.reviewer, 'review_started_at', graph.pv_iso(k.review_started_at), 'decided_by', k.decided_by, 'decided_at', graph.pv_iso(k.decided_at), 'decision_note', k.decision_note,
    'withdrawn_at', graph.pv_iso(k.withdrawn_at), 'withdrawal_reason', k.withdrawal_reason, 'escalations', k.escalations, 'escalated_at', graph.pv_iso(k.escalated_at),
    'overdue', k.state IN ('open', 'under_review') AND clock_timestamp() > k.review_by, 'replayed', p_replayed)
$$;
REVOKE ALL ON FUNCTION graph.pv_challenge_answer(graph.knowledge_challenges, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION graph.pv_challenge_event(k graph.knowledge_challenges, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  INSERT INTO graph.knowledge_challenge_events (event_id, scope, tenant_id, domain_id, challenge_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', k.tenant_id, k.domain_id, k.challenge_id, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION graph.pv_challenge_event(graph.knowledge_challenges, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The acting person: the bound principal, named by the route, an active human. */
CREATE OR REPLACE FUNCTION graph.pv_challenge_actor(p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, onboarding, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): the act is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF onboarding.principal_kind(v) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): contesting, reviewing and deciding a challenge are a named person''s acts; an agent never does them' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION graph.pv_challenge_actor(uuid) FROM PUBLIC;

/* A challenge of the domain, locked. */
CREATE OR REPLACE FUNCTION graph.pv_challenge_lock(p_challenge uuid, p_tenant uuid, p_domain uuid) RETURNS graph.knowledge_challenges
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE k graph.knowledge_challenges;
BEGIN
  SELECT * INTO k FROM graph.knowledge_challenges x WHERE x.challenge_id = p_challenge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'knowledge challenge rejected (unknown_challenge): no challenge % in this domain', coalesce(p_challenge::text, '<none>') USING ERRCODE = '23503'; END IF;
  RETURN k;
END $$;
REVOKE ALL ON FUNCTION graph.pv_challenge_lock(uuid, uuid, uuid) FROM PUBLIC;

/* OPEN: a person contests a decision-active intelligence product's version with grounds (16+ characters) and what is disputed; the review is
   due on the DATABASE clock (p_review_within_days, 1–30, default 7). A decision package or a decision is ROUTED to its own contest paths; a
   run to its simulation challenge; the product's own owner corrects it, never challenges it. */
CREATE OR REPLACE FUNCTION graph.open_knowledge_challenge(p_challenge_id uuid, p_request_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int,
    p_grounds text, p_disputed jsonb, p_review_within_days int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; o objects.canonical_objects; k graph.knowledge_challenges; v_kind text; v_owner uuid; v_live uuid; v_days int := coalesce(p_review_within_days, 7);
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  IF p_request_id IS NULL OR p_challenge_id IS NULL THEN
    RAISE EXCEPTION 'knowledge challenge rejected (request): an opening carries its challenge id and request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO k FROM graph.knowledge_challenges x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF k.opened_by <> v_actor OR k.subject_id <> p_id OR k.tenant_id <> p_tenant OR k.domain_id <> p_domain THEN
      RAISE EXCEPTION 'knowledge challenge rejected (duplicate): request % already opened another challenge; a new challenge takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN graph.pv_challenge_answer(k, true);
  END IF;
  IF p_type IN ('DPK', 'DEC', 'APR', 'CMT') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (routed): a decision is contested through its own paths — an appeal (decision.appeal.open, B35) or a gate challenge (decision.challenge.raise, B36); it is not duplicated here' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'SIM' THEN
    RAISE EXCEPTION 'knowledge challenge rejected (routed): a simulation run is contested through its simulation challenge (simulation.challenge.open, B21); it is not duplicated here' USING ERRCODE = '22023';
  END IF;
  v_kind := CASE WHEN p_type IN ('CLM', 'ENT', 'EVT', 'REL') THEN 'claim' WHEN p_type = 'ASM' THEN 'assessment' WHEN p_type = 'WRN' THEN 'warning' WHEN p_type = 'FCT' THEN 'forecast' END;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'knowledge challenge rejected (subject): % is not a decision-active intelligence product (claims CLM/ENT/EVT/REL, an assessment ASM, a warning WRN, a forecast FCT)', coalesce(p_type, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_grounds IS NULL OR length(btrim(p_grounds)) < 16 OR length(p_grounds) > 4000 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (grounds): a challenge states its grounds in 16 to 4000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_disputed IS NOT NULL AND (jsonb_typeof(p_disputed) <> 'array' OR jsonb_array_length(p_disputed) > 20 OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_disputed) d WHERE jsonb_typeof(d) <> 'string' OR length(d #>> '{}') NOT BETWEEN 1 AND 300)) THEN
    RAISE EXCEPTION 'knowledge challenge rejected (disputed): disputed is up to twenty strings (the statements, fields or spans disputed)' USING ERRCODE = '22023';
  END IF;
  IF v_days < 1 OR v_days > 30 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (review_within): the review is due within 1 to 30 days' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_type = p_type AND x.object_id = p_id AND x.object_version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'knowledge challenge rejected (unknown_subject): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  IF o.lifecycle_state IN ('withdrawn', 'deleted') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): % % v% is %; there is nothing decision-active to contest', p_type, p_id, p_version, o.lifecycle_state USING ERRCODE = '22023';
  END IF;
  v_owner := graph.pv_owner(o.accountable_owner);
  IF v_owner IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'knowledge challenge rejected (separation_of_duties): the owner of % % v% corrects it (a correction), never challenges it', p_type, p_id, p_version USING ERRCODE = '42501';
  END IF;
  SELECT x.challenge_id INTO v_live FROM graph.knowledge_challenges x WHERE x.subject_id = p_id AND x.subject_version = p_version AND x.opened_by = v_actor AND x.state IN ('open', 'under_review');
  IF v_live IS NOT NULL THEN
    RAISE EXCEPTION 'knowledge challenge rejected (duplicate): challenge % by this person on % v% is live; it is decided or withdrawn before another is opened', v_live, p_id, p_version USING ERRCODE = '23505';
  END IF;
  INSERT INTO graph.knowledge_challenges (challenge_id, scope, tenant_id, domain_id, subject_kind, subject_type, subject_id, subject_version, subject_digest, subject_owner, grounds, disputed, state,
                                          opened_by, review_by, request_id, correlation_id)
  VALUES (p_challenge_id, 'DOMAIN', p_tenant, p_domain, v_kind, p_type, p_id, p_version, o.content_digest, v_owner, btrim(p_grounds), coalesce(p_disputed, '[]'::jsonb), 'open',
          v_actor, clock_timestamp() + make_interval(days => v_days), p_request_id, p_correlation)
  RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.opened', v_actor, jsonb_build_object('subject', p_type || ':' || p_id || '@' || p_version, 'digest', o.content_digest, 'review_by', graph.pv_iso(k.review_by)), p_correlation);
  RETURN graph.pv_challenge_answer(k, false);
END $$;
REVOKE ALL ON FUNCTION graph.open_knowledge_challenge(uuid, uuid, uuid, uuid, text, uuid, int, text, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.open_knowledge_challenge(uuid, uuid, uuid, uuid, text, uuid, int, text, jsonb, int, uuid, uuid) TO eye_commit;

/* TAKE FOR REVIEW: a knowledge owner, data steward or domain administrator who is neither the opener nor the owner (re-checked here). */
CREATE OR REPLACE FUNCTION graph.review_knowledge_challenge(p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  PERFORM governance.assert_approver('knowledge challenge', v_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'data_steward', 'domain_admin'], k.opened_by,
                                     CASE WHEN k.subject_owner IS NULL THEN NULL ELSE ARRAY[k.subject_owner] END, 'reviewing a knowledge challenge');
  IF k.state <> 'open' THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; a review is started on an open challenge', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  UPDATE graph.knowledge_challenges SET state = 'under_review', reviewer = v_actor, review_started_at = clock_timestamp() WHERE challenge_id = p_challenge_id RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.review_started', v_actor, jsonb_build_object('reviewer', v_actor), p_correlation);
  RETURN graph.pv_challenge_answer(k, false);
END $$;
REVOKE ALL ON FUNCTION graph.review_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.review_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* EVIDENCE: a party (the opener, the owner, the reviewer) submits a recorded object of this domain under its digest, with a note. */
CREATE OR REPLACE FUNCTION graph.submit_knowledge_challenge_evidence(p_evidence_id uuid, p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_ref text, p_digest text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges; r jsonb := graph.pv_ref(p_ref); o objects.canonical_objects; v_party text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.evidence']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  v_party := CASE WHEN v_actor = k.opened_by THEN 'opener' WHEN v_actor = k.subject_owner THEN 'owner' WHEN v_actor = k.reviewer THEN 'reviewer' END;
  IF v_party IS NULL THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): evidence is submitted by a party to challenge % (its opener, the subject''s owner or its reviewer)', p_challenge_id USING ERRCODE = '42501';
  END IF;
  IF k.state NOT IN ('open', 'under_review') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; evidence is submitted while it is live', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  IF r ->> 'form' <> 'typed' OR r ->> 'version' IS NULL THEN
    RAISE EXCEPTION 'knowledge challenge rejected (evidence): evidence names a recorded object as TYPE:id@version (e.g. EVD:…@1)' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (note): evidence states what it shows in 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_type = r ->> 'type' AND x.object_id = (r ->> 'id')::uuid AND x.object_version = (r ->> 'version')::int AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'knowledge challenge rejected (unknown_evidence): % is not recorded in this domain', p_ref USING ERRCODE = '23503'; END IF;
  IF o.content_digest IS DISTINCT FROM p_digest THEN
    RAISE EXCEPTION 'knowledge challenge rejected (evidence): % carries digest %, not the submitted %', p_ref, o.content_digest, coalesce(p_digest, '<none>') USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.knowledge_challenge_evidence (evidence_id, scope, tenant_id, domain_id, challenge_id, ref, object_type, object_id, object_version, object_digest, note, party, submitted_by, correlation_id)
  VALUES (p_evidence_id, 'DOMAIN', p_tenant, p_domain, p_challenge_id, o.object_type || ':' || o.object_id || '@' || o.object_version, o.object_type, o.object_id, o.object_version, o.content_digest, btrim(p_note), v_party, v_actor, p_correlation);
  PERFORM graph.pv_challenge_event(k, 'challenge.evidence_submitted', v_actor, jsonb_build_object('evidence_id', p_evidence_id, 'ref', o.object_type || ':' || o.object_id || '@' || o.object_version, 'party', v_party), p_correlation);
  RETURN graph.pv_challenge_answer(k, false) || jsonb_build_object('evidence', jsonb_build_object('evidence_id', p_evidence_id, 'ref', o.object_type || ':' || o.object_id || '@' || o.object_version, 'digest', o.content_digest, 'party', v_party));
END $$;
REVOKE ALL ON FUNCTION graph.submit_knowledge_challenge_evidence(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.submit_knowledge_challenge_evidence(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* DECIDE: the reviewer who took it (the role and the separation re-checked) upholds or dismisses with a note (16+ characters). An upheld
   challenge enters the product's fitness evaluation (unsupported_claim) — the MARK stays its own act (§PV.6). */
CREATE OR REPLACE FUNCTION graph.decide_knowledge_challenge(p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  PERFORM governance.assert_approver('knowledge challenge', v_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'data_steward', 'domain_admin'], k.opened_by,
                                     CASE WHEN k.subject_owner IS NULL THEN NULL ELSE ARRAY[k.subject_owner] END, 'deciding a knowledge challenge');
  IF p_decision IS NULL OR p_decision NOT IN ('upheld', 'dismissed') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (decision): a decision upholds or dismisses the challenge' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 16 OR length(p_note) > 4000 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (note): a decision states its reasons in 16 to 4000 characters' USING ERRCODE = '22023';
  END IF;
  IF k.state <> 'under_review' THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; a challenge is decided under review', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  IF k.reviewer IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): challenge % is under review by another person; its reviewer decides it', p_challenge_id USING ERRCODE = '42501';
  END IF;
  UPDATE graph.knowledge_challenges SET state = p_decision, decided_by = v_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note) WHERE challenge_id = p_challenge_id RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.' || p_decision, v_actor, jsonb_build_object('note', btrim(p_note), 'evidence', (SELECT count(*) FROM graph.knowledge_challenge_evidence e WHERE e.challenge_id = p_challenge_id)), p_correlation);
  RETURN graph.pv_challenge_answer(k, false) || jsonb_build_object('next', CASE WHEN p_decision = 'upheld' THEN 'the product''s fitness evaluation now reads unsupported_claim; a knowledge owner records the mark (graph.provenance.fitness.mark), which routes it to a recompute or an adjudication' ELSE 'nothing changes in the product' END);
END $$;
REVOKE ALL ON FUNCTION graph.decide_knowledge_challenge(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.decide_knowledge_challenge(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* WITHDRAW: the opener's act alone, while live, with a reason (8+ characters). */
CREATE OR REPLACE FUNCTION graph.withdraw_knowledge_challenge(p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges; v_prior text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  IF k.opened_by <> v_actor THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): a challenge is withdrawn by its opener; the acting person did not open challenge %', p_challenge_id USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (reason): a withdrawal states its reason in 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF k.state NOT IN ('open', 'under_review') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; only a live challenge is withdrawn', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  v_prior := k.state;
  UPDATE graph.knowledge_challenges SET state = 'withdrawn', withdrawn_at = clock_timestamp(), withdrawal_reason = btrim(p_reason) WHERE challenge_id = p_challenge_id RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.withdrawn', v_actor, jsonb_build_object('reason', btrim(p_reason), 'prior_state', v_prior), p_correlation);
  RETURN graph.pv_challenge_answer(k, false);
END $$;
REVOKE ALL ON FUNCTION graph.withdraw_knowledge_challenge(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.withdraw_knowledge_challenge(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* ESCALATE: once the review is OVERDUE on the database clock, a party or a domain administrator escalates it (at most five times); the next
   review is due two days on. The escalation names the domain administrators; routing it into the attention queue needs an attention class
   (executive.attention_signal_classes, re-declared by §CL) — the integrator's fold, reported. */
CREATE OR REPLACE FUNCTION graph.escalate_knowledge_challenge(p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges; v_now timestamptz := clock_timestamp(); v_was timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.escalate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  IF NOT (v_actor = k.opened_by OR v_actor IS NOT DISTINCT FROM k.subject_owner OR v_actor IS NOT DISTINCT FROM k.reviewer
          OR governance.holds_role(v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'knowledge_owner'])) THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): an overdue challenge is escalated by a party to it or a domain administrator' USING ERRCODE = '42501';
  END IF;
  IF k.state NOT IN ('open', 'under_review') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; only a live challenge is escalated', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  IF v_now <= k.review_by THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is not overdue; its review is due by % (the database clock reads %)', p_challenge_id, graph.pv_iso(k.review_by), graph.pv_iso(v_now) USING ERRCODE = '22023';
  END IF;
  IF k.escalations >= 5 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % was escalated five times; the domain administrator decides it', p_challenge_id USING ERRCODE = '22023';
  END IF;
  v_was := k.review_by;
  UPDATE graph.knowledge_challenges SET escalations = escalations + 1, escalated_at = v_now, review_by = v_now + interval '2 days' WHERE challenge_id = p_challenge_id RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.escalated', v_actor, jsonb_build_object('was_due', graph.pv_iso(v_was), 'escalations', k.escalations, 'escalate_to_roles', jsonb_build_array('domain_admin'),
    'next_due', graph.pv_iso(k.review_by)), p_correlation);
  RETURN graph.pv_challenge_answer(k, false) || jsonb_build_object('escalated_to_roles', jsonb_build_array('domain_admin'), 'was_due', graph.pv_iso(v_was));
END $$;
REVOKE ALL ON FUNCTION graph.escalate_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.escalate_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* THE READ: the domain's challenges (or one subject's), each with its events and evidence; and where a decision or a run is contested instead. */
CREATE OR REPLACE FUNCTION graph.knowledge_challenges_read(p_tenant uuid, p_domain uuid, p_subject uuid, p_state text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, decision, simulation, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the knowledge challenges');
  IF p_state IS NOT NULL AND p_state NOT IN ('open', 'under_review', 'upheld', 'dismissed', 'withdrawn', 'live') THEN
    RAISE EXCEPTION 'provenance rejected (state): a challenge state is open, under_review, upheld, dismissed, withdrawn or live (not %)', p_state USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('as_of', graph.pv_iso(clock_timestamp()),
    'challenges', (SELECT coalesce(jsonb_agg(graph.pv_challenge_answer(k, false) || jsonb_build_object(
        'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor_principal_id, 'at', graph.pv_iso(e.occurred_at), 'details', e.details) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                     FROM graph.knowledge_challenge_events e WHERE e.challenge_id = k.challenge_id),
        'evidence', (SELECT coalesce(jsonb_agg(jsonb_build_object('evidence_id', v.evidence_id, 'ref', v.ref, 'digest', v.object_digest, 'note', v.note, 'party', v.party, 'by', v.submitted_by, 'at', graph.pv_iso(v.submitted_at)) ORDER BY v.submitted_at), '[]'::jsonb)
                     FROM graph.knowledge_challenge_evidence v WHERE v.challenge_id = k.challenge_id)) ORDER BY k.opened_at DESC), '[]'::jsonb)
      FROM graph.knowledge_challenges k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND (p_subject IS NULL OR k.subject_id = p_subject)
        AND (p_state IS NULL OR k.state = p_state OR (p_state = 'live' AND k.state IN ('open', 'under_review')))),
    -- the EXISTING contest machinery on the same subject, beside the knowledge challenges (read, never duplicated): B35 appeals, B21 simulation challenges
    'appeals', CASE WHEN p_subject IS NULL THEN NULL ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('case_id', a.case_id, 'subject_kind', a.subject_kind, 'state', a.state, 'outcome', a.outcome,
                 'opened_at', graph.pv_iso(a.opened_at), 'deadline_at', graph.pv_iso(a.deadline_at), 'adjudicator', a.adjudicator_principal_id) ORDER BY a.opened_at), '[]'::jsonb)
                 FROM decision.appeal_cases a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.subject_id = p_subject) END,
    'simulation_challenges', CASE WHEN p_subject IS NULL THEN NULL ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('challenge_id', s.challenge_id, 'kind', s.kind, 'state', s.state, 'opened_at', graph.pv_iso(s.opened_at)) ORDER BY s.opened_at), '[]'::jsonb)
                 FROM simulation.challenges s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.run_id = p_subject) END,
    'routes', jsonb_build_object('decision', 'an appeal (decision.appeal.open, B35) or a gate challenge (decision.challenge.raise, B36)', 'run', 'a simulation challenge (simulation.challenge.open, B21)',
                                 'claim_or_forecast', 'also an appeal (decision.appeal.open, B35) when the contest is of a decision''s use of it; an upheld appeal enters the same fitness evaluation'));
END $$;
REVOKE ALL ON FUNCTION graph.knowledge_challenges_read(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.knowledge_challenges_read(uuid, uuid, uuid, text) TO eye_app, eye_commit;

-- §PV.9 THE PROVENANCE AGENT (AG-014) ──────────────────────────────────────────────────────────────────────────────────────────────────────
/* Registration (0060's shape): an administrator registers an ACTIVE agent principal of this tenant holding provenance_agent in this domain, an
   accountable human owner and the bounds; one active agent per domain. */
CREATE OR REPLACE FUNCTION graph.register_provenance_agent(p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_version text, p_code_digest text,
    p_owner uuid, p_budgets jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, identity, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); v_kind text; v_status text; v_depth int; v_nodes int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_actor IS NULL OR p_actor IS DISTINCT FROM v_actor OR onboarding.principal_kind(v_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'provenance agent rejected (actor): a registration is a named person''s act, recorded under the acting principal' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_principal AND p.tenant_id = p_tenant;
  IF NOT FOUND OR v_kind <> 'agent' OR v_status <> 'active' THEN
    RAISE EXCEPTION 'provenance agent rejected (principal): the principal must be an active principal of kind agent in this tenant' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_principal AND b.role_code = 'provenance_agent' AND b.revoked_at IS NULL AND b.domain_id = p_domain) THEN
    RAISE EXCEPTION 'provenance agent rejected (principal): the principal holds no provenance_agent binding in this domain' USING ERRCODE = '42501';
  END IF;
  IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_owner AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'provenance agent rejected (owner): the accountable owner must be an active human principal' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' OR p_code_digest IS NULL OR p_code_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'provenance agent rejected (identity): the agent version is semantic (x.y.z) and its code digest sha-256 hex' USING ERRCODE = '22023';
  END IF;
  v_depth := CASE WHEN coalesce(p_budgets ->> 'max_depth', '') ~ '^[0-9]{1,3}$' THEN (p_budgets ->> 'max_depth')::int END;
  v_nodes := CASE WHEN coalesce(p_budgets ->> 'max_nodes', '') ~ '^[0-9]{1,5}$' THEN (p_budgets ->> 'max_nodes')::int END;
  IF v_depth IS NULL OR v_depth < 1 OR v_depth > 16 OR v_nodes IS NULL OR v_nodes < 1 OR v_nodes > 2000 THEN
    RAISE EXCEPTION 'provenance agent rejected (budgets): the bounds are max_depth 1–16 and max_nodes 1–2000' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM graph.provenance_agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.status = 'active') THEN
    RAISE EXCEPTION 'provenance agent rejected (duplicate): this domain already has an active provenance agent; revoke it first' USING ERRCODE = '23505';
  END IF;
  INSERT INTO graph.provenance_agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_version, code_digest, owner_principal_id, budgets, created_by, correlation_id)
  VALUES (p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_version, p_code_digest, p_owner, jsonb_build_object('max_depth', v_depth, 'max_nodes', v_nodes), v_actor, p_correlation);
  INSERT INTO graph.provenance_agent_events (event_id, scope, tenant_id, domain_id, agent_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, 'agent.registered', v_actor,
          jsonb_build_object('principal_id', p_principal, 'version', p_version, 'code_digest', p_code_digest, 'owner', p_owner, 'budgets', jsonb_build_object('max_depth', v_depth, 'max_nodes', v_nodes)), p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'principal_id', p_principal, 'version', p_version, 'code_digest', p_code_digest, 'owner', p_owner, 'budgets', jsonb_build_object('max_depth', v_depth, 'max_nodes', v_nodes), 'status', 'active');
END $$;
REVOKE ALL ON FUNCTION graph.register_provenance_agent(uuid, uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.register_provenance_agent(uuid, uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.revoke_provenance_agent(p_agent_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal();
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.agent.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_actor IS NULL OR p_actor IS DISTINCT FROM v_actor OR onboarding.principal_kind(v_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'provenance agent rejected (actor): a revocation is a named person''s act, recorded under the acting principal' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'provenance agent rejected (reason): a revocation states its reason (8+ characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE graph.provenance_agents SET status = 'revoked', revoked_at = clock_timestamp(), revoked_by = v_actor, revoke_reason = btrim(p_reason)
   WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'provenance agent rejected (unknown_agent): no active provenance agent % in this domain', p_agent_id USING ERRCODE = '23503'; END IF;
  INSERT INTO graph.provenance_agent_events (event_id, scope, tenant_id, domain_id, agent_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, 'agent.revoked', v_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'status', 'revoked');
END $$;
REVOKE ALL ON FUNCTION graph.revoke_provenance_agent(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.revoke_provenance_agent(uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* The agent's own session (identity.agent_session_open's shape over THIS registry; 0060 §4): an identity-operation context, an active
   registration whose version and code digest are the code's, an active agent principal. */
CREATE OR REPLACE FUNCTION graph.provenance_agent_session_open(p_session uuid, p_agent_id uuid, p_tenant uuid, p_domain uuid, p_agent_version text, p_code_digest text,
    p_refresh_hash text, p_context_key_hash text, p_expires_at timestamptz, p_family uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a graph.provenance_agents%ROWTYPE; v_kind text; v_status text;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'agent session denied: identity operation capability required (context is %)', public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at > clock_timestamp() + interval '1 day' THEN
    RAISE EXCEPTION 'agent session denied: a provenance run session is bounded to one day' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM graph.provenance_agents x WHERE x.agent_id = p_agent_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent session denied: no such provenance agent in this domain' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'agent session denied: agent grant is revoked' USING ERRCODE = '42501'; END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'agent session denied: agent instance or code digest does not match the registration' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = a.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'agent session denied: principal is not an active agent principal' USING ERRCODE = '42501';
  END IF;
  PERFORM identity.session_open(p_session, a.principal_id, 'agent_grant', p_refresh_hash, p_context_key_hash, p_expires_at, p_family);
  RETURN a.principal_id;
END $$;
REVOKE ALL ON FUNCTION graph.provenance_agent_session_open(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.provenance_agent_session_open(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, uuid) TO eye_identity;

/* THE ONE SURFACE: the domain's active provenance agent (the acting principal, its version and code digest the registration's) constructs the
   lineage edges of a product's recorded history — every resolved upstream reference of every version in the bounded closure, idempotently —
   and records the run with EVERY gap it found (an unresolved reference, a claim without lineage, broken custody, an unverifiable artifact, the
   bound reached). It never constructs an edge to what does not resolve, never marks fitness, never decides: deterministic, no model. A run id
   replayed answers the recorded run. */
CREATE OR REPLACE FUNCTION graph.provenance_construct(p_run_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_agent_version text, p_code_digest text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); a graph.provenance_agents%ROWTYPE; r graph.provenance_runs%ROWTYPE; cl jsonb; ed jsonb; f jsonb; t jsonb; v_new int := 0; v_old int := 0;
        v_started timestamptz := clock_timestamp(); v_gaps jsonb; v_trunc boolean; n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.construct']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM graph.provenance_agents x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'active';
  IF NOT FOUND OR v_actor IS DISTINCT FROM a.principal_id THEN
    RAISE EXCEPTION 'provenance agent rejected (authority): only the domain''s active provenance agent constructs lineage edges' USING ERRCODE = '42501';
  END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'provenance agent rejected (authority): the agent''s version or code digest is not the registration''s (% / %)', a.agent_version, left(a.code_digest, 12) USING ERRCODE = '42501';
  END IF;
  IF p_run_id IS NULL THEN RAISE EXCEPTION 'provenance agent rejected (request): a run carries its id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM graph.provenance_runs x WHERE x.run_id = p_run_id;
  IF FOUND THEN
    IF r.subject_id <> p_id OR r.subject_version <> p_version OR r.agent_id <> a.agent_id THEN
      RAISE EXCEPTION 'provenance agent rejected (duplicate): run % already constructed another subject; a new run takes a new id', p_run_id USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('run_id', r.run_id, 'outcome', r.outcome, 'examined', r.examined, 'edges_constructed', r.edges_constructed, 'edges_existing', r.edges_existing, 'gaps', r.gaps, 'truncated', r.truncated, 'replayed', true);
  END IF;
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance agent rejected (subject): a construction names a recorded product as type, id and version' USING ERRCODE = '22023';
  END IF;
  cl := graph.pv_closure(p_tenant, p_domain, p_type, p_id, p_version, (a.budgets ->> 'max_depth')::int, (a.budgets ->> 'max_nodes')::int);
  IF cl IS NULL THEN
    RAISE EXCEPTION 'provenance agent rejected (unknown_object): % % v% is not recorded in this domain; there is no history to construct', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  -- the run row first (the edges reference it; deferred), its counts from what follows
  v_gaps := cl -> 'gaps'; v_trunc := (cl ->> 'truncated')::boolean;
  IF v_trunc THEN v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'incomplete_lineage', 'ref', cl ->> 'root', 'at', cl ->> 'root',
    'reason', format('the bound was reached (max_depth %s, max_nodes %s); history beyond it was not examined', a.budgets ->> 'max_depth', a.budgets ->> 'max_nodes'))); END IF;
  FOR ed IN SELECT * FROM jsonb_array_elements(cl -> 'edges') LOOP
    CONTINUE WHEN ed ->> 'to' IS NULL;
    f := graph.pv_ref(ed ->> 'from'); t := graph.pv_ref(ed ->> 'to');
    INSERT INTO graph.provenance_edges (edge_id, scope, tenant_id, domain_id, dependent_type, dependent_id, dependent_version, upstream_type, upstream_id, upstream_version, basis, span, version_resolution, run_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, f ->> 'type', (f ->> 'id')::uuid, (f ->> 'version')::int, t ->> 'type', (t ->> 'id')::uuid, (t ->> 'version')::int, ed ->> 'basis',
            CASE WHEN jsonb_typeof(ed -> 'span') = 'object' THEN ed -> 'span' END, CASE WHEN ed ->> 'resolution' IN ('recorded', 'latest_at_construction', 'evidence_digest') THEN ed ->> 'resolution' ELSE 'recorded' END, p_run_id)
    ON CONFLICT ON CONSTRAINT gpve_one DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 1 THEN v_new := v_new + 1; ELSE v_old := v_old + 1; END IF;
  END LOOP;
  INSERT INTO graph.provenance_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_version, code_digest, subject_type, subject_id, subject_version, outcome, examined,
                                     edges_constructed, edges_existing, gaps, truncated, budgets, started_at, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, a.agent_id, v_actor, a.agent_version, a.code_digest, p_type, p_id, p_version,
          CASE WHEN jsonb_array_length(v_gaps) > 0 OR v_trunc THEN 'incomplete' ELSE 'complete' END, (cl ->> 'examined')::int, v_new, v_old, v_gaps, v_trunc, a.budgets, v_started, p_correlation)
  RETURNING * INTO r;
  RETURN jsonb_build_object('run_id', r.run_id, 'subject', cl ->> 'root', 'outcome', r.outcome, 'examined', r.examined, 'edges_constructed', r.edges_constructed, 'edges_existing', r.edges_existing,
                            'gaps', r.gaps, 'truncated', r.truncated, 'agent', jsonb_build_object('agent_id', a.agent_id, 'version', a.agent_version, 'code_digest', a.code_digest), 'replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.provenance_construct(uuid, uuid, uuid, text, uuid, int, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.provenance_construct(uuid, uuid, uuid, text, uuid, int, text, text, uuid) TO eye_commit;

/* The registry and the latest runs (read scope enforced). */
CREATE OR REPLACE FUNCTION graph.provenance_agent_state(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the provenance agent');
  RETURN jsonb_build_object(
    'agents', (SELECT coalesce(jsonb_agg(jsonb_build_object('agent_id', a.agent_id, 'principal_id', a.principal_id, 'version', a.agent_version, 'code_digest', a.code_digest, 'owner', a.owner_principal_id,
                 'budgets', a.budgets, 'status', a.status, 'created_at', graph.pv_iso(a.created_at), 'revoked_at', graph.pv_iso(a.revoked_at), 'revoke_reason', a.revoke_reason) ORDER BY a.created_at DESC), '[]'::jsonb)
               FROM graph.provenance_agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain),
    'runs', (SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', r.run_id, 'subject', r.subject_type || ':' || r.subject_id || '@' || r.subject_version, 'outcome', r.outcome, 'examined', r.examined,
                 'edges_constructed', r.edges_constructed, 'edges_existing', r.edges_existing, 'gaps', jsonb_array_length(r.gaps), 'finished_at', graph.pv_iso(r.finished_at)) ORDER BY r.finished_at DESC), '[]'::jsonb)
             FROM (SELECT * FROM graph.provenance_runs x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.finished_at DESC LIMIT 50) r));
END $$;
REVOKE ALL ON FUNCTION graph.provenance_agent_state(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.provenance_agent_state(uuid, uuid) TO eye_app, eye_commit;

-- ═══ B50 integration (§CI × §PV) ═══
-- graph._open_challenge — §CI's stub (0120 §CI), re-declared WHOLE here (§PV folds after §CI) to add §PV's KNOWLEDGE CHALLENGES: an object whose
-- open or under-review knowledge challenge names it is `challenged` in the affected-product classification (AI-06-004). Nothing else changes.
CREATE OR REPLACE FUNCTION graph._open_challenge(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS boolean
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT (p_kind = 'simulation' AND EXISTS (SELECT 1 FROM simulation.challenges c WHERE c.run_id = p_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state IN ('open', 'rerun_requested')))
      OR (p_kind = 'decision_package' AND EXISTS (SELECT 1 FROM decision.challenges c WHERE c.package_id = p_id AND (p_version IS NULL OR c.version = p_version) AND c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.resolved_at IS NULL))
      OR EXISTS (SELECT 1 FROM graph.impact_triggers t WHERE t.object_id = p_id AND t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.trigger_kind = 'human_challenge' AND t.closed_at IS NULL)
      -- B50 integration: §PV's knowledge challenges (open or under review), any version of the subject unless one is named
      OR EXISTS (SELECT 1 FROM graph.knowledge_challenges k WHERE k.subject_id = p_id AND (p_version IS NULL OR k.subject_version = p_version) AND k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.state IN ('open', 'under_review'));
$$;
REVOKE ALL ON FUNCTION graph._open_challenge(uuid, uuid, text, uuid, int) FROM PUBLIC;

-- ═══ B50 integration (§PV × §CL) ═══
-- graph._pv_raise_overdue: an ESCALATED (overdue) knowledge challenge routed to the subject's owner as an attention item of §CL's class
-- `knowledge_challenge_overdue` (the 0107 idiom §CL's _cl_raise follows: evaluated under the domain's ACTIVE policy, routed, its event
-- recorded); one item per escalation — a repeated call answers the item it made.
CREATE OR REPLACE FUNCTION graph._pv_raise_overdue(k graph.knowledge_challenges, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, executive, identity, pg_catalog, pg_temp AS $$
DECLARE pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid := gen_random_uuid();
        v_cause uuid := md5('b50pv:' || k.challenge_id::text || ':' || k.escalations::text)::uuid; x executive.attention_items%ROWTYPE;
BEGIN
  SELECT * INTO x FROM executive.attention_items i WHERE i.tenant_id = k.tenant_id AND i.domain_id = k.domain_id AND i.signal_class = 'knowledge_challenge_overdue' AND i.subject_id = k.challenge_id AND i.cause_event_id = v_cause;
  IF FOUND THEN RETURN jsonb_build_object('item_id', x.item_id, 'repeated', true, 'state', x.state, 'owner', x.owner_principal_id); END IF;
  v_owner := CASE WHEN decision.is_active_human(k.subject_owner, k.tenant_id) THEN k.subject_owner END;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = k.tenant_id AND a.domain_id = k.domain_id AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'knowledge_challenge_overdue',
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, 'knowledge_challenge_overdue', v_eval ->> 'outcome', v_owner, k.tenant_id, k.domain_id);
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', k.tenant_id, k.domain_id, 'knowledge_challenge_overdue', 'knowledge_challenge', k.challenge_id, v_cause, 'KnowledgeChallengeOverdue',
          left(format('Challenge of %s %s is overdue (escalation %s; next review by %s)', k.subject_type, left(k.subject_id::text, 8), k.escalations, graph.pv_iso(k.review_by)), 512),
          v_eval ->> 'outcome', v_state, v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
          jsonb_build_object('challenge_id', k.challenge_id, 'subject', k.subject_type || ':' || k.subject_id || '@' || k.subject_version, 'escalations', k.escalations,
                             'review_by', graph.pv_iso(k.review_by), 'link', '/graph/challenges'),
          (v_route ->> 'due_at')::timestamptz, coalesce((v_route ->> 'escalations')::int, 0), coalesce(p_correlation, gen_random_uuid()));
  PERFORM executive.attention_event(v_item, k.tenant_id, k.domain_id,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END, p_actor,
            jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                               'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'KnowledgeChallengeOverdue', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)),
            coalesce(p_correlation, gen_random_uuid()));
  RETURN jsonb_build_object('item_id', v_item, 'repeated', false, 'state', v_state, 'owner', v_owner, 'outcome', v_eval ->> 'outcome');
END $$;
REVOKE ALL ON FUNCTION graph._pv_raise_overdue(graph.knowledge_challenges, uuid, uuid) FROM PUBLIC;

-- graph.escalate_knowledge_challenge re-declared WHOLE: the same port, the overdue challenge now routed (above).
CREATE OR REPLACE FUNCTION graph.escalate_knowledge_challenge(p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges; v_now timestamptz := clock_timestamp(); v_was timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.escalate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  IF NOT (v_actor = k.opened_by OR v_actor IS NOT DISTINCT FROM k.subject_owner OR v_actor IS NOT DISTINCT FROM k.reviewer
          OR governance.holds_role(v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'knowledge_owner'])) THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): an overdue challenge is escalated by a party to it or a domain administrator' USING ERRCODE = '42501';
  END IF;
  IF k.state NOT IN ('open', 'under_review') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; only a live challenge is escalated', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  IF v_now <= k.review_by THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is not overdue; its review is due by % (the database clock reads %)', p_challenge_id, graph.pv_iso(k.review_by), graph.pv_iso(v_now) USING ERRCODE = '22023';
  END IF;
  IF k.escalations >= 5 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % was escalated five times; the domain administrator decides it', p_challenge_id USING ERRCODE = '22023';
  END IF;
  v_was := k.review_by;
  UPDATE graph.knowledge_challenges SET escalations = escalations + 1, escalated_at = v_now, review_by = v_now + interval '2 days' WHERE challenge_id = p_challenge_id RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.escalated', v_actor, jsonb_build_object('was_due', graph.pv_iso(v_was), 'escalations', k.escalations, 'escalate_to_roles', jsonb_build_array('domain_admin'),
    'next_due', graph.pv_iso(k.review_by)), p_correlation);
  -- B50 integration (§PV × §CL): the overdue challenge is ROUTED into the attention queue under §CL's class knowledge_challenge_overdue
  RETURN graph.pv_challenge_answer(k, false) || jsonb_build_object('escalated_to_roles', jsonb_build_array('domain_admin'), 'was_due', graph.pv_iso(v_was),
    'attention', graph._pv_raise_overdue(k, v_actor, p_correlation));
END $$;
REVOKE ALL ON FUNCTION graph.escalate_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.escalate_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- ═══ FOLD §CL (from 0120_b50_x_cl.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §CL — CP-6 B50: CORRECTION-PROPAGATION CLOSURE — ACKNOWLEDGEMENT, FREEZE AND ESCALATION (F-P3-05's closure: V03-T-297, V03-T-301,
-- V03-T-302, ES-30-005, DP-24-002, DP-24-005, DP-24-006, DQM-020, DF-12, PR-24-001/-002/-003, CAP-UM-12, JRN-05, HX-18; built for the B+X rows
-- PR-24-006 and AT-24; re-verified: V03-T-300, MS-06, DCN-09, PR-24-005). Part-local file (folded into the one 0120 at integration, after §0,
-- §HD, §LC, §CI, §PV); applies ALONE on 0001–0119 + the prelude + the wave-1 files (it sorts after them).
--
-- THE GAP. A correction case read CLOSED the moment it was applied: observation.close_correction_case (0022:1570) sets closed_at at
-- 'applied', and nothing afterwards asked whether a single affected product had been reconciled. The walk (§CI) now reaches and CLASSES every
-- product, but a stale briefing, a forecast owed a re-run or a decision owed its owner's review stayed decision-active with nobody owning it;
-- a subscription consumer whose delivery failed was a ledger row; there was no window after which anyone was told, nothing froze, and
-- MET-010 measured to the end of the WALK, not to the consumers' closure.
--
-- THE MECHANISM (DESIGN D7, D8, D9).
-- (CL.1) THE CLOSURE RECORD graph.correction_closures — one per correction case, OPENED by the database when a case is applied after 0120
--   (an AFTER trigger on observation.correction_current; the apply and its closed_at are kept as they were: closed_at is the APPLY instant);
--   an older applied case gets one only through the governed ADOPT act (never automatically: D9). A case is CLOSED only through
--   graph.close_correction_case, which refuses unless (a) the impact scope is known (propagation complete, no truncated walk), (b) the
--   correction authority is not disputed (no open challenge on a corrected object), (c) EVERY material consumer is closed — each affected
--   product whose class is not `current` acknowledged, recomputed or under an unexpired BOUNDED EXCEPTION (reason, expiry, owner), each
--   subscription consumer delivered or, after a failure, acknowledged or excepted — and (d) the projections RECONCILE (graph.rebuild_projections
--   — re-declared whole only to admit the close's own action — every row 0 / 0 / 0, every representation current, no partition withdrawn).
--   The record then states the reached consumers, the failed deliveries, the residual exposure (products closed by an exception), every
--   acknowledgement and the projection check, with the AUDIT DIGEST (sha256) over all of it; the case's freezes lift.
-- (CL.2) THE ACKNOWLEDGEMENTS graph.consumer_acknowledgements (append-only; the latest row per (case, consumer) is its state): acknowledged |
--   recomputed (naming the recomputed record, which must exist and post-date the apply) | bounded_exception | failed (a delivery failure,
--   recorded by the sweep). WHO: the product's accountable owner (an active human), or — only when the product has none — a knowledge owner
--   or the domain administrator; a subscription consumer's owner or the domain administrator. A human_review product (a decision, a
--   commitment, a package, a memory record, a lesson) is acknowledged by its owner and NEVER by the correction authority (the person who
--   applied the case — PR-24-003), and is never `recomputed`: no automatic rewrite of a human decision or commitment (V03-T-300).
-- (CL.3) THE CLOSURE CONTRACT graph.closure_contracts — declared and VERSIONED per domain by the domain administrator (append-only): an
--   acknowledgement window per consumer class (stale, challenged, withdrawn, recompute, human_review, subscription), in seconds, and the
--   longest a bounded exception may run. A window under an hour is declared SYNTHETIC (a demonstration contract — B28's fast-expiry precedent).
-- (CL.4) THE SWEEP graph.sweep_correction_closures — an attention-tick step (executive.attention.tick, the attention agent) and a person's
--   route (graph.closure.sweep), waiting on the DATABASE clock: a consumer past its window, or a subscription delivery that FAILED (an
--   immediate stall), STALLS the case; on a stall every pending material product of the case FREEZES and each stalled consumer is routed to
--   its owner as an attention item of the new class `correction_propagation_stall` (executive.attention_items under the active policy;
--   escalated by executive.escalate_attention_due when unacknowledged past its deadline). A withdrawn product still reached freezes at once;
--   a truncated walk (impact scope unknown) freezes its corrected object at once.
-- (CL.5) THE FREEZE graph.publication_freezes + the hook objects.publication_frozen (§0's stub, re-declared whole: STABLE, invoker, read-only)
--   — THE REACH (this part's decision): a live freeze answers for (a) the frozen object itself (any version when the freeze names none), (b)
--   any product a walk of the freezing case reached THROUGH the frozen product (its path names it — it cites it, directly or transitively),
--   and (c) a decision-package version whose option cites the frozen object directly. §0's re-declared ports then refuse publication
--   approval and delivery and the export build (`publication rejected (held)` / `export rejected (held)`). The frozen product itself stays
--   VISIBLE: the reads answer the frozen marker and the case link (never hidden, never suppressed).
-- (CL.6) MET-010 v2 — analytics.mc_met010_correction_propagation re-declared: the end instant is the closure record's closed_at (material
--   consumer closure), not the walk; registered again (computation version 2).
-- (CL.7) THE READS — the case page's one read (identity, authority, target versions, reason, effective time, replacement, impacted graph,
--   propagation state, per-consumer acknowledgement, freezes, escalations, closure, the correction impact NOTICE of HX-18), the list with
--   each case's closure state (an 'applied' case reads open until its closure record closes, or "not tracked" before B50), the adoptable cases.
--
-- THE VOCABULARY: executive.attention_signal_classes() and the attention_items CHECKs copied whole from 0115 (their last definition) with
-- `correction_propagation_stall` (§CL) and `knowledge_challenge_overdue` (for §PV's overdue challenges — the class only; §PV routes it), and
-- the subject kinds `correction_case` and `knowledge_challenge`.
-- THE REFUSAL NOUN (one, the class form): `correction closure rejected (<class>): …` — reported to the integrator for observation-errors.ts.
-- THREE CLAIMS: construction (this file, phase6-closure-b50); demonstrated operation (the act — SYNTHETIC personas, a SYNTHETIC short
-- window); real acceptance never claimed (PR-24-006 / AT-24 → B111's recording path, then R2).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ─── §CL.0 THE VOCABULARIES (0115 §0.3a's function and both CHECKs, copied whole; the B50 classes and subject kinds added) ─────────────────
CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  -- B34 (0090)
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  -- B36 (0094)
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  -- B90 (0095)
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  -- B27 (0097)
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  -- B31 (0099)
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  -- B35 (0101)
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due',
  -- B30 (0103)
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint',
  -- B91 (0105)
  'commercial.usage', 'commercial.entitlement',
  -- B25 (0108)
  'forecast.disagreement',
  -- B33 (0111)
  'supply.dependency', 'supply.disruption', 'domain.alert', 'domain.package',
  -- B92 (0113)
  'analytics.metric', 'analytics.privacy', 'analytics.experience',
  -- B94 (0114)
  'onboarding.migration', 'onboarding.drift', 'implementation.readiness', 'service.case', 'support.access', 'responsibility.gap',
  -- B107 (0115)
  'governance.exception', 'governance.acceptance', 'governance.conformance', 'governance.conflict', 'governance.ownership',
  -- B50 cl (0120 §CL): a correction's consumer past its acknowledgement window or failed; §PV's knowledge challenge past its review
  'correction_propagation_stall', 'knowledge_challenge_overdue'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due',
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint',
  'commercial.usage', 'commercial.entitlement',
  'forecast.disagreement',
  'supply.dependency', 'supply.disruption', 'domain.alert', 'domain.package',
  'analytics.metric', 'analytics.privacy', 'analytics.experience',
  -- B94 (0114)
  'onboarding.migration', 'onboarding.drift', 'implementation.readiness', 'service.case', 'support.access', 'responsibility.gap',
  -- B107 (0115)
  'governance.exception', 'governance.acceptance', 'governance.conformance', 'governance.conflict', 'governance.ownership',
  -- B50 cl (0120 §CL)
  'correction_propagation_stall', 'knowledge_challenge_overdue'));
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_subject_kind_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (
  'forecast', 'scenario', 'warning', 'source', 'claim', 'package', 'review',
  'exposure', 'health_change', 'commitment_item',
  'plan', 'publication', 'strategy_object', 'queue',
  'product', 'subscription', 'metric', 'asset',
  'branch', 'scenario_set',
  -- B31 (0099)
  'run', 'experiment',
  -- B35 (0101)
  'recommendation', 'appeal_case', 'outcome_assessment',
  -- B30 (0103)
  'twin', 'twin_version', 'twin_estimate', 'twin_branch', 'behaviour_model',
  -- B91 (0105)
  'meter', 'budget', 'entitlement', 'contract',
  -- B25 (0108)
  'ensemble_run',
  -- B33 (0111)
  'supply_inference', 'supply_disruption', 'domain_package', 'domain_assessment', 'competitor_profile', 'watchlist',
  -- B92 (0113)
  'metric_definition', 'metric_result', 'telemetry_definition', 'experience_finding', 'operating_review',
  -- B94 (0114)
  'onboarding_programme', 'config_baseline', 'migration_wave', 'cutover', 'implementation_programme', 'readiness_gate', 'service_case',
  'support_grant', 'responsibility_matrix',
  -- B107 (0115)
  'acceptance_record', 'governance_exception', 'release_candidate', 'conformance_finding', 'stewardship_case', 'design_contribution', 'change_proposal',
  -- B50 cl (0120 §CL)
  'correction_case', 'knowledge_challenge'));

-- ─── §CL.1 THE CLOSURE CONTRACT (declared, versioned, append-only; per domain) ─────────────────────────────────────────────────────────────
CREATE TABLE graph.closure_contracts (
  contract_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  version            int  NOT NULL CHECK (version >= 1),
  windows            jsonb NOT NULL CHECK (jsonb_typeof(windows) = 'object'),     -- {consumer class: acknowledgement window in seconds}
  exception_max_days int  NOT NULL CHECK (exception_max_days BETWEEN 1 AND 365),
  synthetic          boolean NOT NULL,                                            -- a demonstration contract (a window under an hour)
  statement          text NOT NULL CHECK (length(btrim(statement)) BETWEEN 16 AND 2000),
  contract_digest    text NOT NULL CHECK (contract_digest ~ '^[0-9a-f]{64}$'),
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gclc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gclc_version UNIQUE (tenant_id, domain_id, version)
);
CREATE TRIGGER gclc_append_only BEFORE UPDATE OR DELETE ON graph.closure_contracts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE graph.closure_contracts IS 'B50 §CL (0120; DF-12, DESIGN D8): the domain''s DECLARED closure contract, versioned and append-only (the newest version is in force): an acknowledgement window per consumer class (stale, challenged, withdrawn, recompute, human_review, subscription — seconds) and the longest a bounded exception may run. Declared by the domain administrator; a window under an hour is a SYNTHETIC demonstration contract.';

-- ─── §CL.2 THE CLOSURE RECORD (one per correction case; its events append-only) ───────────────────────────────────────────────────────────
CREATE TABLE graph.correction_closures (
  closure_id             uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  case_id                uuid NOT NULL UNIQUE,
  opened_at              timestamptz NOT NULL,                 -- the APPLY instant (observation.correction_current.closed_at): the windows run from it
  opened_via             text NOT NULL CHECK (opened_via IN ('applied', 'adopted')),
  adopted_by             uuid,
  adopted_at             timestamptz,
  adopt_reason           text,
  state                  text NOT NULL CHECK (state IN ('open', 'stalled', 'closed')),
  stalled_at             timestamptz,
  stall_reasons          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stall_reasons) = 'array'),
  closed_at              timestamptz,
  closed_by              uuid,
  statement              text,
  reached_consumers      int,
  failed_deliveries      jsonb,
  residual_exposure      jsonb,
  acknowledgements       jsonb,
  projections            jsonb,
  projections_reconciled boolean,
  contract_version       int,
  audit_digest           text CHECK (audit_digest IS NULL OR audit_digest ~ '^[0-9a-f]{64}$'),
  record                 jsonb,
  correlation_id         uuid NOT NULL,
  CONSTRAINT gccl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gccl_adopted CHECK ((opened_via = 'adopted') = (adopted_by IS NOT NULL AND adopted_at IS NOT NULL AND length(btrim(coalesce(adopt_reason, ''))) >= 16)),
  CONSTRAINT gccl_stalled CHECK ((stalled_at IS NULL) = (state = 'open' OR (state = 'closed' AND stalled_at IS NULL))),
  CONSTRAINT gccl_closed CHECK ((state = 'closed') = (closed_at IS NOT NULL AND closed_by IS NOT NULL AND audit_digest IS NOT NULL AND record IS NOT NULL AND projections_reconciled IS TRUE))
);
CREATE INDEX gccl_domain_state ON graph.correction_closures (tenant_id, domain_id, state, opened_at);
COMMENT ON TABLE graph.correction_closures IS 'B50 §CL (0120; V03-T-297, ES-30-005, DP-24-002): THE PROPAGATION-CLOSURE RECORD of a correction case — opened by the database at the apply (after 0120) or by the governed adopt act (an older case), stalled by the sweep, CLOSED only by graph.close_correction_case: the reached consumers, the failed deliveries, the residual exposure, every acknowledgement, the projection check and the audit digest over them. observation.correction_current.closed_at stays the APPLY instant; the case is closed when this record is.';

CREATE TABLE graph.correction_closure_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  closure_id         uuid NOT NULL REFERENCES graph.correction_closures (closure_id),
  case_id            uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('closure.opened', 'closure.adopted', 'contract.bound', 'consumer.acknowledged', 'consumer.recomputed', 'consumer.excepted',
                                                    'consumer.failed', 'closure.stalled', 'product.frozen', 'freeze.lifted', 'consumer.escalated', 'closure.closed')),
  consumer_ref       text,
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gcce_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gcce_case ON graph.correction_closure_events (case_id, occurred_at);
CREATE TRIGGER gcce_append_only BEFORE UPDATE OR DELETE ON graph.correction_closure_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- The record changes only forward and only through the ports: its identity never; a closed record never.
CREATE OR REPLACE FUNCTION graph.correction_closures_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'correction closure rejected (state): a closure record is never deleted' USING ERRCODE = '22023'; END IF;
  IF OLD.state = 'closed' THEN RAISE EXCEPTION 'correction closure rejected (state): the closure of case % is closed; a closed record never changes', OLD.case_id USING ERRCODE = '22023'; END IF;
  IF NEW.closure_id <> OLD.closure_id OR NEW.case_id <> OLD.case_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.domain_id <> OLD.domain_id OR NEW.scope <> OLD.scope
     OR NEW.opened_at <> OLD.opened_at OR NEW.opened_via <> OLD.opened_via OR NEW.adopted_by IS DISTINCT FROM OLD.adopted_by OR NEW.adopted_at IS DISTINCT FROM OLD.adopted_at
     OR NEW.adopt_reason IS DISTINCT FROM OLD.adopt_reason THEN
    RAISE EXCEPTION 'correction closure rejected (state): the identity of a closure record never changes' USING ERRCODE = '22023';
  END IF;
  IF OLD.state = 'stalled' AND NEW.state = 'open' THEN RAISE EXCEPTION 'correction closure rejected (state): a stalled case stays stalled until it closes' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gccl_guard BEFORE UPDATE OR DELETE ON graph.correction_closures FOR EACH ROW EXECUTE FUNCTION graph.correction_closures_guard();

-- ─── §CL.3 THE ACKNOWLEDGEMENTS (append-only; the latest row per (case, consumer) is the consumer's state) ──────────────────────────────────
CREATE TABLE graph.consumer_acknowledgements (
  ack_id               uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  closure_id           uuid NOT NULL REFERENCES graph.correction_closures (closure_id),
  case_id              uuid NOT NULL,
  consumer_kind        text NOT NULL CHECK (consumer_kind IN ('affected_product', 'subscription')),
  consumer_ref         text NOT NULL CHECK (length(consumer_ref) BETWEEN 3 AND 200),
  product_kind         text,
  object_type          text,
  product_id           uuid,
  product_version      int,
  affected_id          uuid,
  affected_class       text CHECK (affected_class IS NULL OR affected_class IN ('current', 'stale', 'challenged', 'withdrawn', 'recompute', 'human_review')),
  subscription_id      uuid,
  delivery_event_id    uuid,
  state                text NOT NULL CHECK (state IN ('acknowledged', 'recomputed', 'bounded_exception', 'failed')),
  note                 text,
  recompute_ref        text,
  exception_reason     text,
  exception_expires_at timestamptz,
  exception_owner      uuid,
  recorded_by          uuid NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT gcak_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gcak_product CHECK ((consumer_kind = 'affected_product') = (product_id IS NOT NULL AND affected_class IS NOT NULL)),
  CONSTRAINT gcak_subscription CHECK ((consumer_kind = 'subscription') = (subscription_id IS NOT NULL)),
  CONSTRAINT gcak_exception CHECK ((state = 'bounded_exception') = (exception_reason IS NOT NULL AND exception_expires_at IS NOT NULL AND exception_owner IS NOT NULL)),
  CONSTRAINT gcak_recomputed CHECK ((state = 'recomputed') = (recompute_ref IS NOT NULL)),
  CONSTRAINT gcak_failed CHECK (state <> 'failed' OR (consumer_kind = 'subscription' AND delivery_event_id IS NOT NULL)),
  CONSTRAINT gcak_note CHECK (state IN ('failed', 'bounded_exception') OR length(btrim(coalesce(note, ''))) >= 8),
  CONSTRAINT gcak_no_rewrite CHECK (NOT (state = 'recomputed' AND affected_class = 'human_review'))
);
CREATE INDEX gcak_case ON graph.consumer_acknowledgements (case_id, consumer_ref, recorded_at DESC);
CREATE UNIQUE INDEX gcak_failed_once ON graph.consumer_acknowledgements (case_id, subscription_id, delivery_event_id) WHERE state = 'failed';
CREATE TRIGGER gcak_append_only BEFORE UPDATE OR DELETE ON graph.consumer_acknowledgements FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE graph.consumer_acknowledgements IS 'B50 §CL (0120; V03-T-301, DP-24-002, PR-24-003): per correction case, per affected product (§CI''s graph.case_affected_products) and per subscription consumer: acknowledged | recomputed (the re-run record named) | bounded exception (reason, expiry, owner) | failed (a delivery failure, recorded by the sweep). Append-only: the latest row per (case, consumer) is its state. A human_review product is its owner''s acknowledgement — never the correction authority''s, never a recompute (no automatic rewrite of a human decision, V03-T-300).';

-- ─── §CL.4 THE FREEZES ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE graph.publication_freezes (
  freeze_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  closure_id         uuid NOT NULL REFERENCES graph.correction_closures (closure_id),
  case_id            uuid NOT NULL,
  object_type        text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$|^[a-z][a-z_]{2,40}$'),
  object_id          uuid NOT NULL,
  object_version     int CHECK (object_version IS NULL OR object_version >= 1),   -- NULL: every version
  product_ref        text NOT NULL,
  reason_kind        text NOT NULL CHECK (reason_kind IN ('stall', 'delivery_failed', 'scope_unknown', 'withdrawn_active', 'manual')),
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  frozen_by          uuid NOT NULL,
  frozen_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  lifted_at          timestamptz,
  lifted_by          uuid,
  lift_kind          text CHECK (lift_kind IS NULL OR lift_kind IN ('closure', 'consumer_closed')),
  lift_reason        text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gpfz_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpfz_lift CHECK ((lifted_at IS NULL) = (lifted_by IS NULL) AND (lifted_at IS NULL) = (lift_kind IS NULL) AND (lifted_at IS NULL OR length(btrim(coalesce(lift_reason, ''))) >= 8))
);
CREATE UNIQUE INDEX gpfz_one_live ON graph.publication_freezes (case_id, object_id, coalesce(object_version, 0)) WHERE lifted_at IS NULL;
CREATE INDEX gpfz_object ON graph.publication_freezes (object_id) WHERE lifted_at IS NULL;
CREATE OR REPLACE FUNCTION graph.publication_freezes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'correction closure rejected (state): a freeze is never deleted; it is lifted' USING ERRCODE = '22023'; END IF;
  IF OLD.lifted_at IS NOT NULL THEN RAISE EXCEPTION 'correction closure rejected (state): freeze % is already lifted', OLD.freeze_id USING ERRCODE = '22023'; END IF;
  IF (NEW.freeze_id, NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.closure_id, NEW.case_id, NEW.object_type, NEW.object_id, NEW.object_version, NEW.product_ref, NEW.reason_kind, NEW.reason, NEW.frozen_by, NEW.frozen_at, NEW.correlation_id)
     IS DISTINCT FROM (OLD.freeze_id, OLD.scope, OLD.tenant_id, OLD.domain_id, OLD.closure_id, OLD.case_id, OLD.object_type, OLD.object_id, OLD.object_version, OLD.product_ref, OLD.reason_kind, OLD.reason, OLD.frozen_by, OLD.frozen_at, OLD.correlation_id) THEN
    RAISE EXCEPTION 'correction closure rejected (state): a freeze changes only by being lifted' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gpfz_guard BEFORE UPDATE OR DELETE ON graph.publication_freezes FOR EACH ROW EXECUTE FUNCTION graph.publication_freezes_guard();
COMMENT ON TABLE graph.publication_freezes IS 'B50 §CL (0120; DP-24-005, DF-12, DESIGN D7): a correction case''s FREEZE of an affected product (or, when the impact scope is unknown, of its corrected object): set by the sweep on a stall, a failed delivery, a truncated walk or a withdrawn product still reached, or by a steward; lifted when the case closes or once the product''s consumer is closed. Read by objects.publication_frozen (the reach: the object, what reached it through the frozen product, a package option citing it). The frozen product stays visible with its marker and the case link.';

-- Row-level security and read grants, exactly as every graph table (0024 §RLS); no write grant (the ports write as their definer).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['closure_contracts', 'correction_closures', 'correction_closure_events', 'consumer_acknowledgements', 'publication_freezes'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('REVOKE ALL ON graph.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

COMMENT ON COLUMN observation.correction_current.closed_at IS 'The instant the case left its intake (applied, rejected or failed — 0022). B50 §CL (0120): for an APPLIED case this is the apply instant, NOT the closure of its propagation: the case is closed when its graph.correction_closures record is (graph.correction_closure_state).';

-- ─── §CL.5 THE CLOSURE OPENS AT THE APPLY (a case applied after 0120; the apply itself unchanged) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph._cl_open_on_apply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid(); v_corr uuid := gen_random_uuid();
BEGIN
  IF NEW.state = 'applied' AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM 'applied') THEN
    INSERT INTO graph.correction_closures (closure_id, scope, tenant_id, domain_id, case_id, opened_at, opened_via, state, correlation_id)
    VALUES (v_id, 'DOMAIN', NEW.tenant_id, NEW.domain_id, NEW.case_id, coalesce(NEW.closed_at, clock_timestamp()), 'applied', 'open', v_corr)
    ON CONFLICT (case_id) DO NOTHING;
    IF FOUND THEN
      INSERT INTO graph.correction_closure_events (event_id, scope, tenant_id, domain_id, closure_id, case_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', NEW.tenant_id, NEW.domain_id, v_id, NEW.case_id, 'closure.opened', public.eye_principal(),
              jsonb_build_object('opened_at', coalesce(NEW.closed_at, clock_timestamp()), 'kind', NEW.kind, 'statement', 'the case was applied; it closes when every material consumer is acknowledged, recomputed or under a bounded exception and the projections reconcile'), v_corr);
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION graph._cl_open_on_apply() FROM PUBLIC;
CREATE TRIGGER gccl_open_on_apply AFTER INSERT OR UPDATE OF state ON observation.correction_current FOR EACH ROW EXECUTE FUNCTION graph._cl_open_on_apply();

-- ─── §CL.6 THE INTERNALS (no runtime grant: reachable only from inside the ports, as their definer) ───────────────────────────────────────
-- The acting principal of a person's act: the session's, a human, the actor named.
CREATE OR REPLACE FUNCTION graph._cl_person(p_actor uuid, p_tenant uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = graph, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'correction closure rejected (actor): the act is the acting principal''s own (the session''s principal)' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'correction closure rejected (actor): a person''s act — an agent or an inactive principal does not take it' USING ERRCODE = '42501';
  END IF;
  RETURN p_actor;
END $$;
REVOKE ALL ON FUNCTION graph._cl_person(uuid, uuid) FROM PUBLIC;

-- Who applied the case (the correction authority): the actor of its case.applied event.
CREATE OR REPLACE FUNCTION graph._cl_applier(p_case uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT NULLIF(regexp_replace(e.actor, '^principal:', ''), e.actor)::uuid
    FROM observation.correction_events e WHERE e.case_id = p_case AND e.event = 'case.applied' AND e.actor ~ '^principal:[0-9a-f-]{36}$'
   ORDER BY e.occurred_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION graph._cl_applier(uuid) FROM PUBLIC;

-- The contract in force (the newest version), or NULL.
CREATE OR REPLACE FUNCTION graph._cl_contract(p_tenant uuid, p_domain uuid) RETURNS graph.closure_contracts
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT k FROM graph.closure_contracts k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain ORDER BY k.version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION graph._cl_contract(uuid, uuid) FROM PUBLIC;

/*
 * THE CONSUMERS of a case and their state now (one row each): every product of the case's latest walk of each root (§CI's stable read; a
 * product reached from two roots is ONE consumer, its most material class kept) and every subscription that received one of the case's
 * change events (GraphChanged / MemoryCorrected carrying the case id). state:
 *   current            a product already reflecting the change (not material; closes nothing)
 *   pending            a material product with no closing act, or a subscription with a delivery not yet finished
 *   acknowledged / recomputed / bounded_exception   the latest act (an exception only while unexpired: else exception_expired)
 *   delivered          a subscription whose deliveries of the case's events all APPLIED (the subscription ledger's own acknowledgement)
 *   failed             a subscription with a failed or refused delivery and no later acknowledgement or exception
 * deadline: the apply (or the product's walk, if later) + the contract's window for its class — NULL without a contract (no time stall);
 * a failed delivery's deadline is its failure (an immediate stall).
 */
CREATE OR REPLACE FUNCTION graph._cl_consumers(p_tenant uuid, p_domain uuid, p_case uuid, p_now timestamptz, p_windows jsonb, p_opened_at timestamptz)
RETURNS TABLE (consumer_kind text, consumer_ref text, product_kind text, object_type text, product_id uuid, product_version int, class text, material boolean,
               owner_principal_id uuid, title text, bucket text, affected_id uuid, invalidation_id uuid, reached_at timestamptz, path jsonb,
               subscription_id uuid, delivery_state text, failure_class text, failed_event_id uuid, failed_at timestamptz,
               ack_id uuid, ack_state text, ack_by uuid, ack_at timestamptz, ack_note text, recompute_ref text, exception_reason text, exception_expires_at timestamptz, exception_owner uuid,
               state text, closing boolean, deadline timestamptz, overdue boolean)
LANGUAGE sql STABLE SET search_path = graph, objects, pg_catalog, pg_temp AS $$
  WITH prod AS (
    SELECT DISTINCT ON (a.product_ref) a.*
      FROM graph.case_affected_products a
     WHERE a.case_id = p_case AND a.tenant_id = p_tenant AND a.domain_id = p_domain
     ORDER BY a.product_ref, (a.class = 'current'), CASE a.class WHEN 'withdrawn' THEN 0 WHEN 'challenged' THEN 1 WHEN 'human_review' THEN 2 WHEN 'recompute' THEN 3 WHEN 'stale' THEN 4 ELSE 5 END, a.recorded_at DESC
  ), deliv AS (
    SELECT d.subscription_id, s.consumer_kind AS sub_kind, s.owner_principal_id AS sub_owner,
           CASE WHEN bool_or(d.state IN ('failed', 'refused')) THEN 'failed' WHEN bool_and(d.state = 'applied') THEN 'applied' ELSE 'pending' END AS dstate,
           (array_agg(d.failure_class ORDER BY d.finished_at DESC NULLS LAST) FILTER (WHERE d.state IN ('failed', 'refused')))[1] AS fclass,
           (array_agg(d.event_id ORDER BY d.finished_at DESC NULLS LAST) FILTER (WHERE d.state IN ('failed', 'refused')))[1] AS fevent,
           max(d.finished_at) FILTER (WHERE d.state IN ('failed', 'refused')) AS fat,
           min(d.first_received_at) AS first_at
      FROM graph.subscription_deliveries d
      JOIN objects.object_outbox o ON o.id = d.event_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain
      JOIN graph.subscriptions s ON s.subscription_id = d.subscription_id
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND o.event_type IN ('GraphChanged', 'MemoryCorrected') AND o.payload #>> '{change,correction_case_id}' = p_case::text
     GROUP BY d.subscription_id, s.consumer_kind, s.owner_principal_id
  ), consumers AS (
    SELECT 'affected_product'::text AS ck, p.product_ref AS cref, p.product_kind AS pk, p.object_type AS ot, p.product_id AS pid, p.product_version AS pv, p.class AS cls,
           p.class <> 'current' AS mat, p.owner_principal_id AS own, p.title AS ttl, p.bucket AS bkt, p.affected_id AS aid, p.invalidation_id AS iid, p.recorded_at AS rat, p.path AS pth,
           NULL::uuid AS sid, NULL::text AS ds, NULL::text AS fc, NULL::uuid AS fe, NULL::timestamptz AS fat
      FROM prod p
    UNION ALL
    SELECT 'subscription', 'SUB:' || x.subscription_id::text, NULL, NULL, NULL, NULL, NULL, true, x.sub_owner, 'subscription consumer ' || x.sub_kind, NULL, NULL, NULL, x.first_at, '[]'::jsonb,
           x.subscription_id, x.dstate, x.fclass, x.fevent, x.fat
      FROM deliv x
  )
  SELECT c.ck, c.cref, c.pk, c.ot, c.pid, c.pv, c.cls, c.mat, c.own, c.ttl, c.bkt, c.aid, c.iid, c.rat, c.pth,
         c.sid, c.ds, c.fc, c.fe, c.fat,
         k.ack_id, k.state, k.recorded_by, k.recorded_at, k.note, k.recompute_ref, k.exception_reason, k.exception_expires_at, k.exception_owner,
         s.st,
         s.st IN ('current', 'acknowledged', 'recomputed', 'bounded_exception', 'delivered'),
         CASE WHEN s.st IN ('current', 'acknowledged', 'recomputed', 'bounded_exception', 'delivered') THEN NULL
              WHEN c.ck = 'subscription' AND s.st = 'failed' THEN c.fat
              WHEN p_windows IS NULL OR NOT (p_windows ? coalesce(c.cls, 'subscription')) THEN NULL
              ELSE greatest(p_opened_at, coalesce(c.rat, p_opened_at)) + make_interval(secs => (p_windows ->> coalesce(c.cls, 'subscription'))::numeric::double precision) END,
         CASE WHEN s.st IN ('current', 'acknowledged', 'recomputed', 'bounded_exception', 'delivered') THEN false
              WHEN c.ck = 'subscription' AND s.st = 'failed' THEN true
              WHEN p_windows IS NULL OR NOT (p_windows ? coalesce(c.cls, 'subscription')) THEN false
              ELSE greatest(p_opened_at, coalesce(c.rat, p_opened_at)) + make_interval(secs => (p_windows ->> coalesce(c.cls, 'subscription'))::numeric::double precision) <= p_now END
    FROM consumers c
    LEFT JOIN LATERAL (SELECT a.* FROM graph.consumer_acknowledgements a WHERE a.case_id = p_case AND a.consumer_ref = c.cref ORDER BY a.recorded_at DESC, a.ack_id DESC LIMIT 1) k ON true
    CROSS JOIN LATERAL (SELECT CASE
        WHEN c.ck = 'affected_product' AND NOT c.mat THEN 'current'
        WHEN k.state = 'bounded_exception' AND k.exception_expires_at <= p_now THEN 'exception_expired'
        WHEN c.ck = 'affected_product' THEN coalesce(k.state, 'pending')
        -- a subscription: a failure stands until an act recorded AFTER it closes it; an applied ledger is its own acknowledgement
        WHEN c.ds = 'failed' AND k.state IN ('acknowledged', 'bounded_exception') AND k.recorded_at >= c.fat THEN k.state
        WHEN c.ds = 'failed' THEN 'failed'
        WHEN c.ds = 'applied' THEN 'delivered'
        WHEN k.state = 'bounded_exception' THEN 'bounded_exception'
        ELSE 'pending' END AS st) s
$$;
REVOKE ALL ON FUNCTION graph._cl_consumers(uuid, uuid, uuid, timestamptz, jsonb, timestamptz) FROM PUBLIC;

-- The consumers as jsonb (the reads and the record).
CREATE OR REPLACE FUNCTION graph._cl_consumers_json(p_tenant uuid, p_domain uuid, p_case uuid, p_now timestamptz, p_windows jsonb, p_opened_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'consumer_kind', c.consumer_kind, 'consumer_ref', c.consumer_ref, 'product_kind', c.product_kind, 'object_type', c.object_type, 'product_id', c.product_id,
           'product_version', c.product_version, 'class', c.class, 'material', c.material, 'owner', c.owner_principal_id, 'title', c.title, 'bucket', c.bucket,
           'affected_id', c.affected_id, 'invalidation_id', c.invalidation_id, 'reached_at', c.reached_at, 'path', c.path,
           'subscription_id', c.subscription_id, 'delivery_state', c.delivery_state, 'failure_class', c.failure_class, 'failed_event_id', c.failed_event_id, 'failed_at', c.failed_at,
           'state', c.state, 'closing', c.closing, 'deadline', c.deadline, 'overdue', c.overdue,
           'ack', CASE WHEN c.ack_id IS NULL THEN NULL ELSE jsonb_build_object('ack_id', c.ack_id, 'state', c.ack_state, 'by', c.ack_by, 'at', c.ack_at, 'note', c.ack_note,
                     'recompute_ref', c.recompute_ref, 'exception', CASE WHEN c.ack_state = 'bounded_exception' THEN jsonb_build_object('reason', c.exception_reason, 'expires_at', c.exception_expires_at, 'owner', c.exception_owner) END) END,
           'frozen', EXISTS (SELECT 1 FROM graph.publication_freezes f WHERE f.case_id = p_case AND f.lifted_at IS NULL AND f.object_id = c.product_id))
         ORDER BY c.consumer_kind, c.material DESC, c.consumer_ref), '[]'::jsonb)
    FROM graph._cl_consumers(p_tenant, p_domain, p_case, p_now, p_windows, p_opened_at) c
$$;
REVOKE ALL ON FUNCTION graph._cl_consumers_json(uuid, uuid, uuid, timestamptz, jsonb, timestamptz) FROM PUBLIC;

-- The case's corrected objects (the walk roots) and whether the impact scope is known.
CREATE OR REPLACE FUNCTION graph._cl_scope(p_tenant uuid, p_domain uuid, p_case uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, observation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'propagation_state', c.propagation_state,
    'roots', coalesce((SELECT jsonb_agg(DISTINCT x ->> 'object_id') FROM jsonb_array_elements(c.affected_resolved) x WHERE x ? 'object_id'), '[]'::jsonb),
    'walks', coalesce((SELECT jsonb_agg(jsonb_build_object('invalidation_id', i.invalidation_id, 'root', i.trigger_object_id, 'state', i.state, 'truncated', i.truncated, 'assessed_at', i.assessed_at) ORDER BY i.opened_at)
                         FROM graph.invalidations_current i WHERE i.correction_case_id = p_case AND i.tenant_id = p_tenant AND i.domain_id = p_domain), '[]'::jsonb),
    'truncated_roots', coalesce((SELECT jsonb_agg(DISTINCT l.trigger_object_id) FROM (
        SELECT DISTINCT ON (i.trigger_object_id) i.trigger_object_id, i.truncated FROM graph.invalidations_current i
         WHERE i.correction_case_id = p_case AND i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'assessed'
         ORDER BY i.trigger_object_id, i.assessed_at DESC) l WHERE l.truncated), '[]'::jsonb),
    'disputed_roots', coalesce((SELECT jsonb_agg(DISTINCT x ->> 'object_id') FROM jsonb_array_elements(c.affected_resolved) x
                                 WHERE x ? 'object_id' AND graph._open_challenge(p_tenant, p_domain, 'evidence', (x ->> 'object_id')::uuid, NULL)), '[]'::jsonb),
    'held_roots', coalesce((SELECT jsonb_agg(DISTINCT h.evd_object_id) FROM observation.legal_holds h, jsonb_array_elements(c.affected_resolved) x
                             WHERE x ? 'object_id' AND h.evd_object_id = (x ->> 'object_id')::uuid AND h.lifted_at IS NULL AND h.tenant_id = p_tenant AND h.domain_id = p_domain), '[]'::jsonb))
    FROM observation.correction_current c WHERE c.case_id = p_case AND c.tenant_id = p_tenant AND c.domain_id = p_domain
$$;
REVOKE ALL ON FUNCTION graph._cl_scope(uuid, uuid, uuid) FROM PUBLIC;

-- The projection reconciliation (ES-30-005): the six projections against their logs, now, plus any withdrawn partition.
CREATE OR REPLACE FUNCTION graph._cl_projections(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_rows jsonb; v_ok boolean; v_withdrawn jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('projection', r.projection, 'live_rows', r.live_rows, 'rebuilt_rows', r.rebuilt_rows, 'mismatched', r.mismatched, 'missing', r.missing,
                                               'unexpected', r.unexpected, 'representation_ok', r.representation_ok) ORDER BY r.projection), '[]'::jsonb),
         coalesce(bool_and(r.mismatched = 0 AND r.missing = 0 AND r.unexpected = 0 AND r.representation_ok), true)
    INTO v_rows, v_ok FROM graph.rebuild_projections() r;
  SELECT coalesce(jsonb_agg(p.projection ORDER BY p.projection), '[]'::jsonb) INTO v_withdrawn FROM graph.projection_partitions p
   WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state = 'withdrawn';
  RETURN jsonb_build_object('reconciled', v_ok AND jsonb_array_length(v_withdrawn) = 0, 'rows', v_rows, 'withdrawn', v_withdrawn, 'checked_at', clock_timestamp(),
                            'representation_version', graph.projection_representation_version());
END $$;
REVOKE ALL ON FUNCTION graph._cl_projections(uuid, uuid) FROM PUBLIC;

-- What still holds the case open, in words (the close port's refusals and the page's readiness are this one function).
CREATE OR REPLACE FUNCTION graph._cl_readiness(p_tenant uuid, p_domain uuid, p_case uuid, p_now timestamptz, p_with_projections boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE c graph.correction_closures; k graph.closure_contracts; cs observation.correction_current; v_scope jsonb; v_cons jsonb; v_open jsonb; v_reasons jsonb := '[]'::jsonb; v_proj jsonb := NULL;
BEGIN
  SELECT * INTO c FROM graph.correction_closures x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  SELECT * INTO cs FROM observation.correction_current x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  k := graph._cl_contract(p_tenant, p_domain);
  v_scope := graph._cl_scope(p_tenant, p_domain, p_case);
  v_cons := graph._cl_consumers_json(p_tenant, p_domain, p_case, p_now, k.windows, coalesce(c.opened_at, cs.closed_at, p_now));
  IF cs.state IS DISTINCT FROM 'applied' THEN v_reasons := v_reasons || to_jsonb(format('the case is %s, not applied', coalesce(cs.state, 'unknown'))); END IF;
  IF c.closure_id IS NULL THEN v_reasons := v_reasons || to_jsonb('the case has no closure record: it was applied before B50 — adopt it to track its closure'::text); END IF;
  IF coalesce(v_scope ->> 'propagation_state', 'pending') <> 'complete' THEN
    v_reasons := v_reasons || to_jsonb(format('the impact scope is not known: the propagation is %s (every corrected object is walked, none truncated, before the case closes)', coalesce(v_scope ->> 'propagation_state', 'pending')));
  END IF;
  IF jsonb_array_length(coalesce(v_scope -> 'truncated_roots', '[]'::jsonb)) > 0 THEN
    v_reasons := v_reasons || to_jsonb(format('the latest walk of %s corrected object(s) was truncated: the impact scope is incomplete', jsonb_array_length(v_scope -> 'truncated_roots')));
  END IF;
  IF jsonb_array_length(coalesce(v_scope -> 'disputed_roots', '[]'::jsonb)) > 0 THEN
    v_reasons := v_reasons || to_jsonb(format('the correction authority is disputed: an open challenge names %s corrected object(s); the challenge is decided first', jsonb_array_length(v_scope -> 'disputed_roots')));
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('ref', x ->> 'consumer_ref', 'state', x ->> 'state', 'class', x ->> 'class', 'owner', x ->> 'owner')), '[]'::jsonb) INTO v_open
    FROM jsonb_array_elements(v_cons) x WHERE NOT (x ->> 'closing')::boolean;
  IF jsonb_array_length(v_open) > 0 THEN
    v_reasons := v_reasons || to_jsonb(format('%s material consumer(s) are not closed (each is acknowledged, recomputed or under a bounded exception): %s', jsonb_array_length(v_open),
                                              (SELECT string_agg(format('%s %s', y ->> 'ref', y ->> 'state'), ', ') FROM (SELECT y FROM jsonb_array_elements(v_open) y LIMIT 8) q)));
  END IF;
  IF p_with_projections THEN
    v_proj := graph._cl_projections(p_tenant, p_domain);
    IF NOT (v_proj ->> 'reconciled')::boolean THEN
      v_reasons := v_reasons || to_jsonb('the projections do not reconcile with their logs (graph.rebuild_projections): rebuild them first'::text);
    END IF;
  END IF;
  RETURN jsonb_build_object('ready', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons, 'open_consumers', v_open, 'consumers', v_cons, 'scope', v_scope, 'projections', v_proj,
                            'contract_version', k.version, 'at', p_now);
END $$;
REVOKE ALL ON FUNCTION graph._cl_readiness(uuid, uuid, uuid, timestamptz, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION graph._cl_event(c graph.correction_closures, p_event text, p_ref text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO graph.correction_closure_events (event_id, scope, tenant_id, domain_id, closure_id, case_id, event, consumer_ref, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', c.tenant_id, c.domain_id, c.closure_id, c.case_id, p_event, p_ref, p_actor, coalesce(p_details, '{}'::jsonb), coalesce(p_correlation, gen_random_uuid()));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION graph._cl_event(graph.correction_closures, text, text, uuid, jsonb, uuid) FROM PUBLIC;

-- The closure record of a case, locked, or the class-form refusal.
CREATE OR REPLACE FUNCTION graph._cl_lock(p_tenant uuid, p_domain uuid, p_case uuid) RETURNS graph.correction_closures
LANGUAGE plpgsql SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE c graph.correction_closures;
BEGIN
  SELECT * INTO c FROM graph.correction_closures x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM observation.correction_current x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
      RAISE EXCEPTION 'correction closure rejected (state): case % has no closure record (applied before B50 or not applied); an applied case is adopted first', p_case USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'correction closure rejected (unknown_case): no correction case % in this domain', p_case USING ERRCODE = '23503';
  END IF;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION graph._cl_lock(uuid, uuid, uuid) FROM PUBLIC;

-- One consumer of a case (the act's subject), or the class-form refusal.
CREATE OR REPLACE FUNCTION graph._cl_consumer(p_tenant uuid, p_domain uuid, c graph.correction_closures, p_ref text, p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE k graph.closure_contracts; v jsonb;
BEGIN
  k := graph._cl_contract(p_tenant, p_domain);
  SELECT x INTO v FROM jsonb_array_elements(graph._cl_consumers_json(p_tenant, p_domain, c.case_id, p_now, k.windows, c.opened_at)) x WHERE x ->> 'consumer_ref' = p_ref;
  IF v IS NULL THEN RAISE EXCEPTION 'correction closure rejected (unknown_consumer): % is not a consumer of correction case %', coalesce(p_ref, '<none>'), c.case_id USING ERRCODE = '23503'; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION graph._cl_consumer(uuid, uuid, graph.correction_closures, text, timestamptz) FROM PUBLIC;

-- Who closes one consumer: the product's accountable owner (an active human), or — only when it has none — a knowledge owner or the domain
-- administrator; a subscription's owner or the domain administrator. A human_review product is never the correction authority's (PR-24-003).
CREATE OR REPLACE FUNCTION graph._cl_assert_closer(p_tenant uuid, p_domain uuid, c graph.correction_closures, v jsonb, p_actor uuid, p_extra_roles text[]) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_owner uuid := NULLIF(v ->> 'owner', '')::uuid; v_applier uuid := graph._cl_applier(c.case_id); v_basis text;
BEGIN
  IF v ->> 'class' = 'human_review' AND p_actor IS NOT DISTINCT FROM v_applier THEN
    RAISE EXCEPTION 'correction closure rejected (separation_of_duties): % is a human review — its owner decides whether the prior decision needs review; the correction authority who applied case % never acknowledges it', v ->> 'consumer_ref', c.case_id USING ERRCODE = '42501';
  END IF;
  IF v_owner IS NOT NULL AND decision.is_active_human(v_owner, p_tenant) THEN
    IF p_actor = v_owner THEN RETURN 'the accountable owner'; END IF;
    IF p_extra_roles IS NOT NULL AND executive.holds_role(p_actor, p_tenant, p_domain, p_extra_roles) THEN RETURN 'a holder of ' || array_to_string(p_extra_roles, ' / '); END IF;
    RAISE EXCEPTION 'correction closure rejected (authority): % is owned by %; its owner closes it', v ->> 'consumer_ref', v_owner USING ERRCODE = '42501';
  END IF;
  IF executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'domain_admin'] || coalesce(p_extra_roles, '{}'::text[])) THEN
    v_basis := 'no active human owns it: a knowledge owner or the domain administrator';
    RETURN v_basis;
  END IF;
  RAISE EXCEPTION 'correction closure rejected (authority): % has no active human owner; a knowledge owner or the domain administrator closes it', v ->> 'consumer_ref' USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION graph._cl_assert_closer(uuid, uuid, graph.correction_closures, jsonb, uuid, text[]) FROM PUBLIC;

-- A recompute names the re-run record: a canonical version recorded after the apply (TYPE:id@version), or an evaluation / export record made after it.
CREATE OR REPLACE FUNCTION graph._cl_recompute_ok(p_tenant uuid, p_domain uuid, p_ref text, p_after timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE m text[];
BEGIN
  m := regexp_match(coalesce(p_ref, ''), '^([A-Z]{3}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@([0-9]{1,9})$');
  IF m IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = m[1] AND o.object_id = m[2]::uuid AND o.object_version = m[3]::int
                                                              AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at > p_after);
  END IF;
  m := regexp_match(coalesce(p_ref, ''), '^(export_package|backtest|method_validation|information_set):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  IF m IS NULL THEN
    RAISE EXCEPTION 'correction closure rejected (recompute_ref): a recompute names its re-run record — TYPE:<id>@<version> (a canonical version) or export_package | backtest | method_validation | information_set:<id>' USING ERRCODE = '22023';
  END IF;
  RETURN CASE m[1]
    WHEN 'export_package' THEN EXISTS (SELECT 1 FROM retention.export_packages x WHERE x.action_id = m[2]::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.built_at > p_after)
    WHEN 'backtest' THEN EXISTS (SELECT 1 FROM prediction.backtests x WHERE x.backtest_id = m[2]::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.computed_at > p_after)
    WHEN 'method_validation' THEN EXISTS (SELECT 1 FROM prediction.method_validations x WHERE x.validation_id = m[2]::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.computed_at > p_after)
    ELSE EXISTS (SELECT 1 FROM prediction.information_sets x WHERE x.information_set_id = m[2]::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.frozen_at > p_after) END;
END $$;
REVOKE ALL ON FUNCTION graph._cl_recompute_ok(uuid, uuid, text, timestamptz) FROM PUBLIC;

-- A freeze (idempotent per case and object): answers true when a new freeze row was written.
CREATE OR REPLACE FUNCTION graph._cl_freeze(c graph.correction_closures, p_type text, p_id uuid, p_version int, p_ref text, p_kind text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF p_id IS NULL THEN RETURN false; END IF;
  INSERT INTO graph.publication_freezes (freeze_id, scope, tenant_id, domain_id, closure_id, case_id, object_type, object_id, object_version, product_ref, reason_kind, reason, frozen_by, correlation_id)
  VALUES (v_id, 'DOMAIN', c.tenant_id, c.domain_id, c.closure_id, c.case_id, p_type, p_id, p_version, p_ref, p_kind, left(p_reason, 2000), p_actor, coalesce(p_correlation, gen_random_uuid()))
  ON CONFLICT (case_id, object_id, coalesce(object_version, 0)) WHERE lifted_at IS NULL DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM graph._cl_event(c, 'product.frozen', p_ref, p_actor, jsonb_build_object('freeze_id', v_id, 'reason_kind', p_kind, 'reason', p_reason, 'object_type', p_type, 'object_id', p_id, 'object_version', p_version), p_correlation);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION graph._cl_freeze(graph.correction_closures, text, uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;

-- A stalled consumer routed to its owner (the 0107 idiom: evaluated under the domain's ACTIVE policy, routed, its event recorded); one item
-- per (case, consumer) — a repeated sweep answers the item it made.
CREATE OR REPLACE FUNCTION graph._cl_raise(c graph.correction_closures, v jsonb, p_reason text, p_contract int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, executive, identity, pg_catalog, pg_temp AS $$
DECLARE pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid := gen_random_uuid();
        v_cause uuid := md5('b50cl:' || c.case_id::text || ':' || (v ->> 'consumer_ref'))::uuid; x executive.attention_items%ROWTYPE;
BEGIN
  SELECT * INTO x FROM executive.attention_items i WHERE i.tenant_id = c.tenant_id AND i.domain_id = c.domain_id AND i.signal_class = 'correction_propagation_stall' AND i.subject_id = c.case_id AND i.cause_event_id = v_cause;
  IF FOUND THEN RETURN jsonb_build_object('item_id', x.item_id, 'repeated', true, 'state', x.state, 'owner', x.owner_principal_id); END IF;
  v_owner := CASE WHEN decision.is_active_human(NULLIF(v ->> 'owner', '')::uuid, c.tenant_id) THEN NULLIF(v ->> 'owner', '')::uuid END;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = c.tenant_id AND a.domain_id = c.domain_id AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'correction_propagation_stall',
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, 'correction_propagation_stall', v_eval ->> 'outcome', v_owner, c.tenant_id, c.domain_id);
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', c.tenant_id, c.domain_id, 'correction_propagation_stall', 'correction_case', c.case_id, v_cause, 'CorrectionPropagationStalled',
          left(format('Correction %s: %s is not closed (%s)', left(c.case_id::text, 8), coalesce(v ->> 'title', v ->> 'consumer_ref'), p_reason), 512), v_eval ->> 'outcome', v_state,
          v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
          jsonb_build_object('case_id', c.case_id, 'closure_id', c.closure_id, 'consumer_ref', v ->> 'consumer_ref', 'consumer_kind', v ->> 'consumer_kind', 'class', v -> 'class',
                             'state', v ->> 'state', 'deadline', v -> 'deadline', 'reason', p_reason, 'contract_version', p_contract, 'owner', v -> 'owner',
                             'link', '/observation/corrections/' || c.case_id::text),
          (v_route ->> 'due_at')::timestamptz, coalesce((v_route ->> 'escalations')::int, 0), coalesce(p_correlation, gen_random_uuid()));
  PERFORM executive.attention_event(v_item, c.tenant_id, c.domain_id,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END, p_actor,
            jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                               'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'CorrectionPropagationStalled', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)),
            coalesce(p_correlation, gen_random_uuid()));
  PERFORM graph._cl_event(c, 'consumer.escalated', v ->> 'consumer_ref', p_actor, jsonb_build_object('item_id', v_item, 'state', v_state, 'owner', v_owner, 'reason', p_reason), p_correlation);
  RETURN jsonb_build_object('item_id', v_item, 'repeated', false, 'state', v_state, 'owner', v_owner, 'outcome', v_eval ->> 'outcome');
END $$;
REVOKE ALL ON FUNCTION graph._cl_raise(graph.correction_closures, jsonb, text, int, uuid, uuid) FROM PUBLIC;

-- ─── §CL.7 THE HOOK — objects.publication_frozen (§0's stub re-declared WHOLE: the same signature, STABLE, invoker, read-only) ──────────────
-- THE REACH (DESIGN D7, this part's decision): a live freeze of a correction case answers for (a) the frozen object itself — every version
-- when the freeze names none; (b) any product a walk of that case reached THROUGH the frozen product (a path element names the frozen
-- object: the product cites it, directly or transitively — a briefing resting on a frozen warning, a publication of a frozen package); (c) a
-- decision-package version one of whose options cites the frozen object directly. The current tenant scopes the answer (the callers run
-- under the request's context; a superuser read sees the object's own rows).
CREATE OR REPLACE FUNCTION objects.publication_frozen(p_type text, p_id uuid, p_version int, OUT frozen boolean, OUT case_id uuid)
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE v_case uuid; v_tenant uuid := public.eye_tenant();
BEGIN
  -- B50 cl (a): the object itself
  SELECT f.case_id INTO v_case FROM graph.publication_freezes f
   WHERE f.lifted_at IS NULL AND f.object_id = p_id AND (f.object_version IS NULL OR p_version IS NULL OR f.object_version = p_version)
     AND (v_tenant IS NULL OR f.tenant_id = v_tenant)
   ORDER BY f.frozen_at, f.freeze_id LIMIT 1;
  -- B50 cl (b): reached through a frozen product by a walk of the freezing case
  IF v_case IS NULL THEN
    SELECT f.case_id INTO v_case FROM graph.publication_freezes f
      JOIN graph.affected_products a ON a.correction_case_id = f.case_id AND a.product_id = p_id AND a.tenant_id = f.tenant_id
                                     AND (a.product_version IS NULL OR p_version IS NULL OR a.product_version = p_version)
     WHERE f.lifted_at IS NULL AND f.object_id <> p_id AND (v_tenant IS NULL OR f.tenant_id = v_tenant)
       AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(a.path) x WHERE split_part(split_part(x, ':', 2), '@', 1) = f.object_id::text)
     ORDER BY f.frozen_at, f.freeze_id LIMIT 1;
  END IF;
  -- B50 cl (c): a package version whose option cites the frozen object
  IF v_case IS NULL AND p_type = 'DPK' THEN
    SELECT f.case_id INTO v_case FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) cq
      JOIN graph.publication_freezes f ON f.lifted_at IS NULL AND f.object_id::text = cq ->> 'id' AND f.tenant_id = o.tenant_id
     WHERE o.package_id = p_id AND o.version = p_version AND (v_tenant IS NULL OR f.tenant_id = v_tenant)
     ORDER BY f.frozen_at, f.freeze_id LIMIT 1;
  END IF;
  frozen := v_case IS NOT NULL;
  case_id := v_case;
  -- end B50 cl
END $$;
REVOKE ALL ON FUNCTION objects.publication_frozen(text, uuid, int) FROM PUBLIC;

-- ─── §CL.8 THE PORTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- DECLARE the domain's closure contract (a new version; the domain administrator; human-gated).
CREATE OR REPLACE FUNCTION graph.declare_closure_contract(p_contract_id uuid, p_tenant uuid, p_domain uuid, p_windows jsonb, p_exception_max_days int, p_synthetic boolean,
                                                          p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.closure_contracts; v_digest text; v_version int; v_key text; v_val jsonb; v_min numeric;
        v_classes text[] := ARRAY['stale', 'challenged', 'withdrawn', 'recompute', 'human_review', 'subscription'];
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.contract.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  IF NOT executive.holds_role(v_actor, p_tenant, p_domain, ARRAY['domain_admin']) THEN
    RAISE EXCEPTION 'correction closure rejected (authority): a closure contract is declared by the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_windows IS NULL OR jsonb_typeof(p_windows) <> 'object' THEN
    RAISE EXCEPTION 'correction closure rejected (windows): the contract names an acknowledgement window per consumer class (%)', array_to_string(v_classes, ', ') USING ERRCODE = '22023';
  END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_windows) LOOP
    IF NOT (v_key = ANY (v_classes)) THEN RAISE EXCEPTION 'correction closure rejected (windows): % is not a consumer class (%)', v_key, array_to_string(v_classes, ', ') USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(v_val) <> 'number' OR (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric) OR (v_val #>> '{}')::numeric < 1 OR (v_val #>> '{}')::numeric > 31536000 THEN
      RAISE EXCEPTION 'correction closure rejected (windows): the window of % is a whole number of seconds from 1 to 31536000 (a year)', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM unnest(v_classes) c WHERE NOT (p_windows ? c)) THEN
    RAISE EXCEPTION 'correction closure rejected (windows): every consumer class has its window (%)', array_to_string(v_classes, ', ') USING ERRCODE = '22023';
  END IF;
  SELECT min((x.value #>> '{}')::numeric) INTO v_min FROM jsonb_each(p_windows) x;
  IF v_min < 3600 AND NOT coalesce(p_synthetic, false) THEN
    RAISE EXCEPTION 'correction closure rejected (synthetic): a window under an hour (% s) is a demonstration contract — declare it synthetic', v_min USING ERRCODE = '22023';
  END IF;
  IF p_exception_max_days IS NULL OR p_exception_max_days < 1 OR p_exception_max_days > 365 THEN
    RAISE EXCEPTION 'correction closure rejected (exception_max_days): a bounded exception runs 1 to 365 days at most' USING ERRCODE = '22023';
  END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) NOT BETWEEN 16 AND 2000 THEN
    RAISE EXCEPTION 'correction closure rejected (statement): the contract states its basis in 16 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.closure_contract:' || p_tenant::text || ':' || p_domain::text, 0));
  IF EXISTS (SELECT 1 FROM graph.closure_contracts x WHERE x.contract_id = p_contract_id) THEN
    SELECT * INTO k FROM graph.closure_contracts x WHERE x.contract_id = p_contract_id;
    IF k.tenant_id <> p_tenant OR k.domain_id <> p_domain THEN RAISE EXCEPTION 'correction closure rejected (duplicate): contract id % is taken', p_contract_id USING ERRCODE = '23505'; END IF;
    RETURN to_jsonb(k) || jsonb_build_object('repeated', true);
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('windows', p_windows, 'exception_max_days', p_exception_max_days, 'synthetic', coalesce(p_synthetic, false))::text, 'UTF8')), 'hex');
  k := graph._cl_contract(p_tenant, p_domain);
  IF k.contract_id IS NOT NULL AND k.contract_digest = v_digest THEN
    RAISE EXCEPTION 'correction closure rejected (duplicate): the windows are unchanged from version %; a version records a change', k.version USING ERRCODE = '22023';
  END IF;
  v_version := coalesce(k.version, 0) + 1;
  INSERT INTO graph.closure_contracts (contract_id, scope, tenant_id, domain_id, version, windows, exception_max_days, synthetic, statement, contract_digest, declared_by, correlation_id)
  VALUES (p_contract_id, 'DOMAIN', p_tenant, p_domain, v_version, p_windows, p_exception_max_days, coalesce(p_synthetic, false), btrim(p_statement), v_digest, v_actor, p_correlation)
  RETURNING * INTO k;
  RETURN to_jsonb(k) || jsonb_build_object('repeated', false, 'supersedes', CASE WHEN v_version = 1 THEN NULL ELSE v_version - 1 END);
END $$;
REVOKE ALL ON FUNCTION graph.declare_closure_contract(uuid, uuid, uuid, jsonb, int, boolean, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.declare_closure_contract(uuid, uuid, uuid, jsonb, int, boolean, text, uuid, uuid) TO eye_commit;

-- ACKNOWLEDGE (or RECOMPUTED) one consumer of a case — its closer (graph._cl_assert_closer); idempotent on the ack id.
CREATE OR REPLACE FUNCTION graph.acknowledge_consumer(p_ack_id uuid, p_tenant uuid, p_domain uuid, p_case uuid, p_consumer_ref text, p_state text, p_note text, p_recompute_ref text,
                                                      p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c graph.correction_closures; v jsonb; a graph.consumer_acknowledgements; v_basis text; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  SELECT * INTO a FROM graph.consumer_acknowledgements x WHERE x.ack_id = p_ack_id;
  IF FOUND THEN
    IF a.case_id <> p_case OR a.consumer_ref <> p_consumer_ref OR a.recorded_by <> v_actor THEN RAISE EXCEPTION 'correction closure rejected (duplicate): acknowledgement id % is another act''s', p_ack_id USING ERRCODE = '23505'; END IF;
    RETURN to_jsonb(a) || jsonb_build_object('repeated', true);
  END IF;
  c := graph._cl_lock(p_tenant, p_domain, p_case);
  IF c.state = 'closed' THEN RAISE EXCEPTION 'correction closure rejected (state): correction case % is closed', p_case USING ERRCODE = '22023'; END IF;
  IF p_state NOT IN ('acknowledged', 'recomputed') THEN RAISE EXCEPTION 'correction closure rejected (ack_state): an acknowledgement is acknowledged or recomputed (an exception is its own act)' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'correction closure rejected (note): the acknowledgement says what was reviewed, in 8 to 2000 characters' USING ERRCODE = '22023'; END IF;
  v := graph._cl_consumer(p_tenant, p_domain, c, p_consumer_ref, v_now);
  IF NOT (v ->> 'material')::boolean THEN RAISE EXCEPTION 'correction closure rejected (state): % is current — it already reflects the correction and needs no acknowledgement', p_consumer_ref USING ERRCODE = '22023'; END IF;
  IF (v ->> 'state') IN ('acknowledged', 'recomputed') THEN RAISE EXCEPTION 'correction closure rejected (state): % is already %', p_consumer_ref, v ->> 'state' USING ERRCODE = '22023'; END IF;
  IF v ->> 'consumer_kind' = 'subscription' AND p_state = 'recomputed' THEN RAISE EXCEPTION 'correction closure rejected (ack_state): a subscription consumer is acknowledged (after its failure) or excepted, never recomputed' USING ERRCODE = '22023'; END IF;
  IF v ->> 'consumer_kind' = 'subscription' AND v ->> 'state' <> 'failed' THEN RAISE EXCEPTION 'correction closure rejected (state): subscription % is %; its own ledger acknowledges an applied delivery, a person acknowledges a failed one', p_consumer_ref, v ->> 'state' USING ERRCODE = '22023'; END IF;
  IF p_state = 'recomputed' AND v ->> 'class' = 'human_review' THEN
    RAISE EXCEPTION 'correction closure rejected (no_rewrite): % is a person''s decision or commitment — it is reviewed and acknowledged by its owner, never recomputed (no automatic rewrite)', p_consumer_ref USING ERRCODE = '22023';
  END IF;
  v_basis := graph._cl_assert_closer(p_tenant, p_domain, c, v, v_actor, CASE WHEN v ->> 'consumer_kind' = 'subscription' THEN ARRAY['domain_admin'] ELSE NULL END);
  IF p_state = 'recomputed' AND NOT graph._cl_recompute_ok(p_tenant, p_domain, p_recompute_ref, c.opened_at) THEN
    RAISE EXCEPTION 'correction closure rejected (unknown_recompute): % is not a record of this domain made after the correction was applied', p_recompute_ref USING ERRCODE = '23503';
  END IF;
  INSERT INTO graph.consumer_acknowledgements (ack_id, scope, tenant_id, domain_id, closure_id, case_id, consumer_kind, consumer_ref, product_kind, object_type, product_id, product_version,
                                               affected_id, affected_class, subscription_id, state, note, recompute_ref, recorded_by, correlation_id)
  VALUES (p_ack_id, 'DOMAIN', p_tenant, p_domain, c.closure_id, p_case, v ->> 'consumer_kind', p_consumer_ref, v ->> 'product_kind', v ->> 'object_type', NULLIF(v ->> 'product_id', '')::uuid,
          NULLIF(v ->> 'product_version', '')::int, NULLIF(v ->> 'affected_id', '')::uuid, v ->> 'class', NULLIF(v ->> 'subscription_id', '')::uuid, p_state, btrim(p_note),
          CASE WHEN p_state = 'recomputed' THEN p_recompute_ref END, v_actor, p_correlation)
  RETURNING * INTO a;
  PERFORM graph._cl_event(c, CASE p_state WHEN 'recomputed' THEN 'consumer.recomputed' ELSE 'consumer.acknowledged' END, p_consumer_ref, v_actor,
                          jsonb_build_object('ack_id', p_ack_id, 'class', v -> 'class', 'basis', v_basis, 'recompute_ref', a.recompute_ref, 'prior_state', v ->> 'state'), p_correlation);
  RETURN to_jsonb(a) || jsonb_build_object('repeated', false, 'basis', v_basis, 'prior_state', v ->> 'state');
END $$;
REVOKE ALL ON FUNCTION graph.acknowledge_consumer(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.acknowledge_consumer(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid) TO eye_commit;

-- A BOUNDED EXCEPTION for one consumer: reason, expiry (within the contract's limit), the owner who answers for it. Under a legal hold on a
-- corrected object, the exception is the record authority's (V03-T-302).
CREATE OR REPLACE FUNCTION graph.except_consumer(p_ack_id uuid, p_tenant uuid, p_domain uuid, p_case uuid, p_consumer_ref text, p_reason text, p_expires_at timestamptz, p_owner uuid,
                                                 p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c graph.correction_closures; v jsonb; a graph.consumer_acknowledgements; k graph.closure_contracts; v_now timestamptz := clock_timestamp(); v_max int; v_basis text; v_held jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.except']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  SELECT * INTO a FROM graph.consumer_acknowledgements x WHERE x.ack_id = p_ack_id;
  IF FOUND THEN
    IF a.case_id <> p_case OR a.consumer_ref <> p_consumer_ref OR a.recorded_by <> v_actor THEN RAISE EXCEPTION 'correction closure rejected (duplicate): acknowledgement id % is another act''s', p_ack_id USING ERRCODE = '23505'; END IF;
    RETURN to_jsonb(a) || jsonb_build_object('repeated', true);
  END IF;
  c := graph._cl_lock(p_tenant, p_domain, p_case);
  IF c.state = 'closed' THEN RAISE EXCEPTION 'correction closure rejected (state): correction case % is closed', p_case USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 16 AND 2000 THEN RAISE EXCEPTION 'correction closure rejected (reason): a bounded exception states its reason in 16 to 2000 characters' USING ERRCODE = '22023'; END IF;
  k := graph._cl_contract(p_tenant, p_domain);
  v_max := coalesce(k.exception_max_days, 30);
  IF p_expires_at IS NULL OR p_expires_at <= v_now OR p_expires_at > v_now + make_interval(days => v_max) THEN
    RAISE EXCEPTION 'correction closure rejected (expiry): a bounded exception expires after now and within % day(s)%', v_max, CASE WHEN k.contract_id IS NULL THEN ' (no contract declared: 30 days)' ELSE format(' (contract version %s)', k.version) END USING ERRCODE = '22023';
  END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN
    RAISE EXCEPTION 'correction closure rejected (owner): a bounded exception names its owner — an active human of this tenant' USING ERRCODE = '22023';
  END IF;
  v := graph._cl_consumer(p_tenant, p_domain, c, p_consumer_ref, v_now);
  IF NOT (v ->> 'material')::boolean THEN RAISE EXCEPTION 'correction closure rejected (state): % is current — it needs no exception', p_consumer_ref USING ERRCODE = '22023'; END IF;
  IF (v ->> 'state') IN ('acknowledged', 'recomputed', 'delivered') THEN RAISE EXCEPTION 'correction closure rejected (state): % is already %', p_consumer_ref, v ->> 'state' USING ERRCODE = '22023'; END IF;
  v_basis := graph._cl_assert_closer(p_tenant, p_domain, c, v, v_actor, ARRAY['record_authority', 'domain_admin']);
  v_held := graph._cl_scope(p_tenant, p_domain, p_case) -> 'held_roots';
  IF jsonb_array_length(coalesce(v_held, '[]'::jsonb)) > 0 AND NOT executive.holds_role(p_owner, p_tenant, p_domain, ARRAY['record_authority']) THEN
    RAISE EXCEPTION 'correction closure rejected (held): a corrected object of case % is under legal hold — the exception is routed to the record authority (its owner holds record_authority)', p_case USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.consumer_acknowledgements (ack_id, scope, tenant_id, domain_id, closure_id, case_id, consumer_kind, consumer_ref, product_kind, object_type, product_id, product_version,
                                               affected_id, affected_class, subscription_id, state, exception_reason, exception_expires_at, exception_owner, recorded_by, correlation_id)
  VALUES (p_ack_id, 'DOMAIN', p_tenant, p_domain, c.closure_id, p_case, v ->> 'consumer_kind', p_consumer_ref, v ->> 'product_kind', v ->> 'object_type', NULLIF(v ->> 'product_id', '')::uuid,
          NULLIF(v ->> 'product_version', '')::int, NULLIF(v ->> 'affected_id', '')::uuid, v ->> 'class', NULLIF(v ->> 'subscription_id', '')::uuid, 'bounded_exception',
          btrim(p_reason), p_expires_at, p_owner, v_actor, p_correlation)
  RETURNING * INTO a;
  PERFORM graph._cl_event(c, 'consumer.excepted', p_consumer_ref, v_actor,
                          jsonb_build_object('ack_id', p_ack_id, 'class', v -> 'class', 'basis', v_basis, 'reason', btrim(p_reason), 'expires_at', p_expires_at, 'owner', p_owner,
                                             'legal_hold', jsonb_array_length(coalesce(v_held, '[]'::jsonb)) > 0), p_correlation);
  RETURN to_jsonb(a) || jsonb_build_object('repeated', false, 'basis', v_basis, 'prior_state', v ->> 'state');
END $$;
REVOKE ALL ON FUNCTION graph.except_consumer(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.except_consumer(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid, uuid) TO eye_commit;

-- FREEZE an affected product of an open case by a steward's act (a consumer that cannot reconcile; DP-24-005).
CREATE OR REPLACE FUNCTION graph.freeze_consumer_product(p_tenant uuid, p_domain uuid, p_case uuid, p_consumer_ref text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c graph.correction_closures; v jsonb; v_new boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.freeze']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  IF NOT executive.holds_role(v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'collection_manager', 'knowledge_owner', 'data_steward']) THEN
    RAISE EXCEPTION 'correction closure rejected (authority): a freeze is a domain administrator''s, collection manager''s, knowledge owner''s or data steward''s act' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 16 AND 2000 THEN RAISE EXCEPTION 'correction closure rejected (reason): a freeze states its reason in 16 to 2000 characters' USING ERRCODE = '22023'; END IF;
  c := graph._cl_lock(p_tenant, p_domain, p_case);
  IF c.state = 'closed' THEN RAISE EXCEPTION 'correction closure rejected (state): correction case % is closed', p_case USING ERRCODE = '22023'; END IF;
  v := graph._cl_consumer(p_tenant, p_domain, c, p_consumer_ref, clock_timestamp());
  IF v ->> 'consumer_kind' <> 'affected_product' OR NOT (v ->> 'material')::boolean OR (v ->> 'closing')::boolean THEN
    RAISE EXCEPTION 'correction closure rejected (state): % is not an open material product of case % (it is %)', p_consumer_ref, p_case, v ->> 'state' USING ERRCODE = '22023';
  END IF;
  v_new := graph._cl_freeze(c, v ->> 'object_type', NULLIF(v ->> 'product_id', '')::uuid, NULLIF(v ->> 'product_version', '')::int, p_consumer_ref, 'manual', btrim(p_reason), v_actor, p_correlation);
  RETURN jsonb_build_object('case_id', p_case, 'consumer_ref', p_consumer_ref, 'frozen', true, 'repeated', NOT v_new);
END $$;
REVOKE ALL ON FUNCTION graph.freeze_consumer_product(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.freeze_consumer_product(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- LIFT one freeze before the case closes — only once what it guards is resolved: the product's consumer closed, or (a corrected object frozen
-- for an unknown scope) the propagation complete with no truncated walk. The correction authority or the domain administrator; human-gated.
CREATE OR REPLACE FUNCTION graph.lift_publication_freeze(p_freeze_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; f graph.publication_freezes; c graph.correction_closures; k graph.closure_contracts; v jsonb; v_scope jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.freeze.lift']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  IF NOT executive.holds_role(v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'collection_manager']) THEN
    RAISE EXCEPTION 'correction closure rejected (authority): a freeze is lifted by the correction authority (collection manager) or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 16 AND 2000 THEN RAISE EXCEPTION 'correction closure rejected (reason): lifting a freeze states its reason in 16 to 2000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO f FROM graph.publication_freezes x WHERE x.freeze_id = p_freeze_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'correction closure rejected (unknown_freeze): no freeze % in this domain', p_freeze_id USING ERRCODE = '23503'; END IF;
  IF f.lifted_at IS NOT NULL THEN RAISE EXCEPTION 'correction closure rejected (state): freeze % was lifted at %', p_freeze_id, f.lifted_at USING ERRCODE = '22023'; END IF;
  c := graph._cl_lock(p_tenant, p_domain, f.case_id);
  IF f.reason_kind = 'scope_unknown' THEN
    v_scope := graph._cl_scope(p_tenant, p_domain, f.case_id);
    IF v_scope ->> 'propagation_state' <> 'complete' OR jsonb_array_length(v_scope -> 'truncated_roots') > 0 THEN
      RAISE EXCEPTION 'correction closure rejected (held): the impact scope of case % is still unknown (propagation %, % truncated walk(s)); the freeze stands', f.case_id, v_scope ->> 'propagation_state', jsonb_array_length(v_scope -> 'truncated_roots') USING ERRCODE = '22023';
    END IF;
  ELSE
    k := graph._cl_contract(p_tenant, p_domain);
    SELECT x INTO v FROM jsonb_array_elements(graph._cl_consumers_json(p_tenant, p_domain, f.case_id, clock_timestamp(), k.windows, c.opened_at)) x WHERE x ->> 'product_id' = f.object_id::text LIMIT 1;
    IF v IS NOT NULL AND NOT (v ->> 'closing')::boolean THEN
      RAISE EXCEPTION 'correction closure rejected (held): % is still % — it is acknowledged, recomputed or excepted before its freeze lifts', f.product_ref, v ->> 'state' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE graph.publication_freezes SET lifted_at = clock_timestamp(), lifted_by = v_actor, lift_kind = 'consumer_closed', lift_reason = btrim(p_reason) WHERE freeze_id = p_freeze_id RETURNING * INTO f;
  PERFORM graph._cl_event(c, 'freeze.lifted', f.product_ref, v_actor, jsonb_build_object('freeze_id', p_freeze_id, 'lift_kind', 'consumer_closed', 'reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(f);
END $$;
REVOKE ALL ON FUNCTION graph.lift_publication_freeze(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.lift_publication_freeze(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/*
 * THE SWEEP (DF-12, DP-24-005; DESIGN D8) — on the DATABASE clock. The attention tick's step (executive.attention.tick, the attention agent)
 * and a person's route (graph.closure.sweep: the correction authority or the domain administrator). Per open or stalled case of the domain
 * (bounded: 100 per call, oldest first):
 *   1. every FAILED or REFUSED delivery of the case's change events is recorded once as a `failed` consumer row (the ledger's evidence);
 *   2. a truncated walk freezes its corrected object (impact scope unknown); a WITHDRAWN product still reached freezes at once;
 *   3. a consumer past its window (the contract in force) or with a failed delivery STALLS the case: the case is stalled, every pending
 *      material product freezes, and each stalled consumer is routed to its owner as a correction_propagation_stall attention item.
 * Idempotent: a freeze is once per (case, object); an item once per (case, consumer); the stall once.
 */
CREATE OR REPLACE FUNCTION graph.sweep_correction_closures(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_now timestamptz := clock_timestamp(); k graph.closure_contracts; c graph.correction_closures; v jsonb; r record; v_scope jsonb; v_cons jsonb;
        v_stalled jsonb; v_out jsonb := '[]'::jsonb; v_frozen int; v_failed int; v_items jsonb; v_reason text; v_root text; v_n int := 0;
BEGIN
  v_action := observation.assert_authority(ARRAY['executive.attention.tick', 'graph.closure.sweep']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'correction closure rejected (actor): the sweep runs as the acting principal' USING ERRCODE = '42501'; END IF;
  IF v_action = 'graph.closure.sweep' THEN
    PERFORM graph._cl_person(p_actor, p_tenant);
    IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'collection_manager']) THEN
      RAISE EXCEPTION 'correction closure rejected (authority): a person''s sweep is the correction authority''s (collection manager) or the domain administrator''s' USING ERRCODE = '42501';
    END IF;
  END IF;
  k := graph._cl_contract(p_tenant, p_domain);
  FOR c IN SELECT * FROM graph.correction_closures x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('open', 'stalled') ORDER BY x.opened_at, x.closure_id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
    v_n := v_n + 1; v_frozen := 0; v_failed := 0; v_items := '[]'::jsonb; v_stalled := '[]'::jsonb;
    -- 1. the failed deliveries, recorded once each
    FOR r IN SELECT d.subscription_id, d.event_id, d.state, d.failure_class, d.last_error, d.finished_at
               FROM graph.subscription_deliveries d JOIN objects.object_outbox o ON o.id = d.event_id
              WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state IN ('failed', 'refused') AND o.event_type IN ('GraphChanged', 'MemoryCorrected')
                AND o.payload #>> '{change,correction_case_id}' = c.case_id::text
                AND NOT EXISTS (SELECT 1 FROM graph.consumer_acknowledgements a WHERE a.case_id = c.case_id AND a.subscription_id = d.subscription_id AND a.delivery_event_id = d.event_id AND a.state = 'failed') LOOP
      INSERT INTO graph.consumer_acknowledgements (ack_id, scope, tenant_id, domain_id, closure_id, case_id, consumer_kind, consumer_ref, subscription_id, delivery_event_id, state, note, recorded_by, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, c.closure_id, c.case_id, 'subscription', 'SUB:' || r.subscription_id::text, r.subscription_id, r.event_id, 'failed',
              left(format('delivery %s %s%s', r.state, coalesce(r.failure_class, 'unclassed'), CASE WHEN r.last_error IS NULL THEN '' ELSE ': ' || r.last_error END), 2000), p_actor, coalesce(p_correlation, gen_random_uuid()));
      PERFORM graph._cl_event(c, 'consumer.failed', 'SUB:' || r.subscription_id::text, p_actor, jsonb_build_object('delivery_event_id', r.event_id, 'state', r.state, 'failure_class', r.failure_class, 'finished_at', r.finished_at), p_correlation);
      v_failed := v_failed + 1;
    END LOOP;
    -- 2. the immediate freezes: an unknown scope, a withdrawn product still reached
    v_scope := graph._cl_scope(p_tenant, p_domain, c.case_id);
    FOR v_root IN SELECT jsonb_array_elements_text(coalesce(v_scope -> 'truncated_roots', '[]'::jsonb)) LOOP
      IF graph._cl_freeze(c, coalesce((SELECT o.object_type FROM objects.canonical_objects o WHERE o.object_id = v_root::uuid LIMIT 1), 'EVD'), v_root::uuid, NULL,
                          coalesce((SELECT o.object_type FROM objects.canonical_objects o WHERE o.object_id = v_root::uuid LIMIT 1), 'EVD') || ':' || v_root,
                          'scope_unknown', 'the latest walk of this corrected object was truncated: what rests on it is not fully known', p_actor, p_correlation) THEN v_frozen := v_frozen + 1; END IF;
    END LOOP;
    v_cons := graph._cl_consumers_json(p_tenant, p_domain, c.case_id, v_now, k.windows, c.opened_at);
    FOR v IN SELECT x FROM jsonb_array_elements(v_cons) x WHERE x ->> 'consumer_kind' = 'affected_product' AND x ->> 'class' = 'withdrawn' AND NOT (x ->> 'closing')::boolean LOOP
      IF graph._cl_freeze(c, v ->> 'object_type', NULLIF(v ->> 'product_id', '')::uuid, NULLIF(v ->> 'product_version', '')::int, v ->> 'consumer_ref', 'withdrawn_active',
                          'a withdrawn product is still reached by the correction and must not stay decision-active', p_actor, p_correlation) THEN v_frozen := v_frozen + 1; END IF;
    END LOOP;
    -- 3. the stall: a consumer past its window, or a failed delivery
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_stalled FROM jsonb_array_elements(v_cons) x WHERE (x ->> 'overdue')::boolean;
    IF jsonb_array_length(v_stalled) > 0 THEN
      IF c.state = 'open' THEN
        UPDATE graph.correction_closures SET state = 'stalled', stalled_at = v_now,
               stall_reasons = (SELECT coalesce(jsonb_agg(jsonb_build_object('consumer_ref', x ->> 'consumer_ref', 'state', x ->> 'state', 'deadline', x -> 'deadline',
                                                                             'reason', CASE WHEN x ->> 'state' = 'failed' THEN 'delivery_failed' ELSE 'window_passed' END)), '[]'::jsonb) FROM jsonb_array_elements(v_stalled) x)
         WHERE closure_id = c.closure_id RETURNING * INTO c;
        PERFORM graph._cl_event(c, 'closure.stalled', NULL, p_actor, jsonb_build_object('stalled', c.stall_reasons, 'contract_version', k.version, 'at', v_now), p_correlation);
      END IF;
      v_reason := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_stalled) x WHERE x ->> 'state' = 'failed') THEN 'delivery_failed' ELSE 'stall' END;
      FOR v IN SELECT x FROM jsonb_array_elements(v_cons) x WHERE x ->> 'consumer_kind' = 'affected_product' AND (x ->> 'material')::boolean AND NOT (x ->> 'closing')::boolean LOOP
        IF graph._cl_freeze(c, v ->> 'object_type', NULLIF(v ->> 'product_id', '')::uuid, NULLIF(v ->> 'product_version', '')::int, v ->> 'consumer_ref', v_reason,
                            CASE v_reason WHEN 'delivery_failed' THEN 'a consumer''s delivery of the correction failed: the case stalled and its open products freeze until they are owned'
                                          ELSE 'a consumer is past its acknowledgement window: the case stalled and its open products freeze until they are owned' END, p_actor, p_correlation) THEN v_frozen := v_frozen + 1; END IF;
      END LOOP;
      FOR v IN SELECT x FROM jsonb_array_elements(v_stalled) x LOOP
        v_items := v_items || graph._cl_raise(c, v, CASE WHEN v ->> 'state' = 'failed' THEN 'its delivery failed' ELSE 'past its acknowledgement window' END, k.version, p_actor, p_correlation);
      END LOOP;
    END IF;
    v_out := v_out || jsonb_build_object('case_id', c.case_id, 'state', c.state, 'stalled', jsonb_array_length(v_stalled), 'frozen_now', v_frozen, 'failed_recorded', v_failed, 'items', v_items);
  END LOOP;
  RETURN jsonb_build_object('at', v_now, 'by', v_action, 'contract_version', k.version, 'cases', v_n, 'swept', v_out);
END $$;
REVOKE ALL ON FUNCTION graph.sweep_correction_closures(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.sweep_correction_closures(uuid, uuid, uuid, uuid) TO eye_commit;

/*
 * CLOSE a correction case (ES-30-005, V03-T-297) — the correction authority (collection manager) or the domain administrator; human-gated.
 * Refused unless graph._cl_readiness says ready WITH the projection check; then the record is written whole and digested, the case's freezes
 * lift, its stall items close (their purpose served), and the closure instant is the one MET-010 v2 measures to.
 */
CREATE OR REPLACE FUNCTION graph.close_correction_case(p_tenant uuid, p_domain uuid, p_case uuid, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c graph.correction_closures; cs observation.correction_current; v_now timestamptz := clock_timestamp(); v_ready jsonb; v_cons jsonb; v_failed jsonb; v_residual jsonb;
        v_acks jsonb; v_record jsonb; v_digest text; v_lifted int; v_items int := 0; v_item executive.attention_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  IF NOT executive.holds_role(v_actor, p_tenant, p_domain, ARRAY['collection_manager', 'domain_admin']) THEN
    RAISE EXCEPTION 'correction closure rejected (authority): a correction case is closed by the correction authority (collection manager) or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) NOT BETWEEN 16 AND 2000 THEN
    RAISE EXCEPTION 'correction closure rejected (statement): the closure states what was reconciled, in 16 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  c := graph._cl_lock(p_tenant, p_domain, p_case);
  IF c.state = 'closed' THEN RAISE EXCEPTION 'correction closure rejected (state): correction case % was closed at % by %', p_case, c.closed_at, c.closed_by USING ERRCODE = '22023'; END IF;
  v_ready := graph._cl_readiness(p_tenant, p_domain, p_case, v_now, true);
  IF NOT (v_ready ->> 'ready')::boolean THEN
    RAISE EXCEPTION 'correction closure rejected (held): case % does not close yet — %', p_case, (SELECT string_agg(r, '; ') FROM jsonb_array_elements_text(v_ready -> 'reasons') r) USING ERRCODE = '22023';
  END IF;
  SELECT * INTO cs FROM observation.correction_current x WHERE x.case_id = p_case;
  v_cons := v_ready -> 'consumers';
  SELECT coalesce(jsonb_agg(jsonb_build_object('ref', a.consumer_ref, 'subscription_id', a.subscription_id, 'delivery_event_id', a.delivery_event_id, 'failure', a.note, 'recorded_at', a.recorded_at) ORDER BY a.recorded_at), '[]'::jsonb)
    INTO v_failed FROM graph.consumer_acknowledgements a WHERE a.case_id = p_case AND a.state = 'failed';
  SELECT coalesce(jsonb_agg(jsonb_build_object('ref', y ->> 'consumer_ref', 'class', y -> 'class', 'exception', y #> '{ack,exception}') ORDER BY y ->> 'consumer_ref'), '[]'::jsonb)
    INTO v_residual FROM jsonb_array_elements(v_cons) y WHERE y ->> 'state' = 'bounded_exception';
  SELECT coalesce(jsonb_agg(jsonb_build_object('ack_id', a.ack_id, 'consumer_kind', a.consumer_kind, 'consumer_ref', a.consumer_ref, 'state', a.state, 'class', a.affected_class, 'by', a.recorded_by,
                                               'at', a.recorded_at, 'note', a.note, 'recompute_ref', a.recompute_ref,
                                               'exception', CASE WHEN a.state = 'bounded_exception' THEN jsonb_build_object('reason', a.exception_reason, 'expires_at', a.exception_expires_at, 'owner', a.exception_owner) END)
                            ORDER BY a.recorded_at, a.ack_id), '[]'::jsonb)
    INTO v_acks FROM graph.consumer_acknowledgements a WHERE a.case_id = p_case;
  v_record := jsonb_build_object(
    'schema', 'eye.correction-closure/1', 'closure_id', c.closure_id, 'case_id', p_case,
    'case', jsonb_build_object('kind', cs.kind, 'source_id', cs.source_id, 'reason', cs.reason, 'received_at', cs.received_at, 'applied_at', cs.closed_at, 'applied_by', graph._cl_applier(p_case),
                               'target_versions', cs.affected_resolved, 'propagation_state', cs.propagation_state),
    'opened_at', c.opened_at, 'opened_via', c.opened_via, 'stalled_at', c.stalled_at, 'stall_reasons', c.stall_reasons,
    'closed_at', v_now, 'closed_by', v_actor, 'statement', btrim(p_statement), 'contract_version', v_ready -> 'contract_version',
    'reached_consumers', jsonb_array_length(v_cons), 'consumers', v_cons, 'failed_deliveries', v_failed, 'residual_exposure', v_residual, 'acknowledgements', v_acks,
    'projections', v_ready -> 'projections', 'scope', v_ready -> 'scope',
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event', e.event, 'ref', e.consumer_ref, 'actor', e.actor_principal_id, 'at', e.occurred_at) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                 FROM graph.correction_closure_events e WHERE e.case_id = p_case),
    'correction_events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event', e.event, 'actor', e.actor, 'at', e.occurred_at) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                            FROM observation.correction_events e WHERE e.case_id = p_case));
  v_digest := encode(sha256(convert_to(v_record::text, 'UTF8')), 'hex');
  UPDATE graph.correction_closures SET state = 'closed', closed_at = v_now, closed_by = v_actor, statement = btrim(p_statement), reached_consumers = jsonb_array_length(v_cons),
         failed_deliveries = v_failed, residual_exposure = v_residual, acknowledgements = v_acks, projections = v_ready -> 'projections', projections_reconciled = true,
         contract_version = NULLIF(v_ready ->> 'contract_version', '')::int, audit_digest = v_digest, record = v_record
   WHERE closure_id = c.closure_id;
  -- the case's freezes lift (their purpose served); its stall items close
  UPDATE graph.publication_freezes SET lifted_at = v_now, lifted_by = v_actor, lift_kind = 'closure', lift_reason = 'the correction case closed with every material consumer owned'
   WHERE case_id = p_case AND lifted_at IS NULL;
  GET DIAGNOSTICS v_lifted = ROW_COUNT;
  FOR v_item IN SELECT * FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'correction_propagation_stall' AND i.subject_id = p_case AND i.state <> 'closed' FOR UPDATE LOOP
    UPDATE executive.attention_items SET state = 'closed', closed_at = v_now, closed_by = v_actor, suppressed_until = NULL, updated_at = v_now WHERE item_id = v_item.item_id;
    PERFORM executive.attention_event(v_item.item_id, p_tenant, p_domain, 'item.closed', v_actor, jsonb_build_object('from_state', v_item.state, 'note', 'the correction case closed (graph.close_correction_case)', 'case_id', p_case), coalesce(p_correlation, gen_random_uuid()));
    v_items := v_items + 1;
  END LOOP;
  SELECT * INTO c FROM graph.correction_closures WHERE closure_id = c.closure_id;
  PERFORM graph._cl_event(c, 'closure.closed', NULL, v_actor, jsonb_build_object('audit_digest', v_digest, 'reached_consumers', jsonb_array_length(v_cons), 'freezes_lifted', v_lifted, 'items_closed', v_items), p_correlation);
  RETURN v_record || jsonb_build_object('audit_digest', v_digest, 'freezes_lifted', v_lifted, 'items_closed', v_items, 'duration_seconds', round(extract(epoch FROM (v_now - cs.received_at))::numeric, 3));
END $$;
REVOKE ALL ON FUNCTION graph.close_correction_case(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.close_correction_case(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ADOPT an older applied case (DESIGN D9): a closure record for a case applied before 0120 — the correction authority's or the domain
-- administrator's governed act, never automatic. The windows run from the APPLY instant: an old case's consumers are past them at once
-- (the answer says how many), so its open products freeze at the next sweep.
CREATE OR REPLACE FUNCTION graph.adopt_correction_case(p_tenant uuid, p_domain uuid, p_case uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; cs observation.correction_current; c graph.correction_closures; k graph.closure_contracts; v_now timestamptz := clock_timestamp(); v_cons jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.closure.adopt']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph._cl_person(p_actor, p_tenant);
  IF NOT executive.holds_role(v_actor, p_tenant, p_domain, ARRAY['collection_manager', 'domain_admin']) THEN
    RAISE EXCEPTION 'correction closure rejected (authority): an older case is adopted by the correction authority (collection manager) or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 16 AND 2000 THEN RAISE EXCEPTION 'correction closure rejected (reason): the adoption states its reason in 16 to 2000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cs FROM observation.correction_current x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'correction closure rejected (unknown_case): no correction case % in this domain', p_case USING ERRCODE = '23503'; END IF;
  IF cs.state <> 'applied' THEN RAISE EXCEPTION 'correction closure rejected (state): case % is %; only an applied case is adopted', p_case, cs.state USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM graph.correction_closures x WHERE x.case_id = p_case) THEN
    RAISE EXCEPTION 'correction closure rejected (duplicate): case % already has a closure record', p_case USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.correction_closures (closure_id, scope, tenant_id, domain_id, case_id, opened_at, opened_via, adopted_by, adopted_at, adopt_reason, state, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_case, coalesce(cs.closed_at, v_now), 'adopted', v_actor, v_now, btrim(p_reason), 'open', p_correlation)
  RETURNING * INTO c;
  k := graph._cl_contract(p_tenant, p_domain);
  v_cons := graph._cl_consumers_json(p_tenant, p_domain, p_case, v_now, k.windows, c.opened_at);
  PERFORM graph._cl_event(c, 'closure.adopted', NULL, v_actor, jsonb_build_object('reason', btrim(p_reason), 'applied_at', cs.closed_at, 'contract_version', k.version), p_correlation);
  RETURN to_jsonb(c) || jsonb_build_object('consumers', jsonb_array_length(v_cons),
    'past_window', (SELECT count(*) FROM jsonb_array_elements(v_cons) x WHERE (x ->> 'overdue')::boolean),
    'statement', 'the windows run from the apply instant: a consumer already past its window stalls the case at the next sweep, and the case''s open products freeze');
END $$;
REVOKE ALL ON FUNCTION graph.adopt_correction_case(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.adopt_correction_case(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ─── §CL.9 THE READS (guarded by observation.assert_read_scope; granted to eye_app, eye_commit) ────────────────────────────────────────────
-- Each case of the domain with its closure state: an 'applied' case reads OPEN until its closure record closes; a case applied before B50
-- without a record reads "not tracked" (adopt it). The consumers' counts are the current state.
CREATE VIEW graph.correction_closure_state WITH (security_invoker = true) AS
  SELECT c.case_id, c.tenant_id, c.domain_id, c.kind, c.state AS case_state, c.received_at, c.closed_at AS applied_at, c.propagation_state,
         CASE WHEN c.state <> 'applied' THEN c.state WHEN x.closure_id IS NULL THEN 'not_tracked' ELSE x.state END AS closure_state,
         x.closure_id, x.opened_via, x.stalled_at, x.closed_at AS closure_closed_at, x.closed_by AS closure_closed_by, x.audit_digest
    FROM observation.correction_current c LEFT JOIN graph.correction_closures x ON x.case_id = c.case_id;
REVOKE ALL ON graph.correction_closure_state FROM PUBLIC;
GRANT SELECT ON graph.correction_closure_state TO eye_app, eye_commit;
COMMENT ON VIEW graph.correction_closure_state IS 'B50 §CL (0120; ES-30-005): every correction case with its CLOSURE state — an applied case is open (or stalled) until its closure record closes; not_tracked = applied before B50 and not adopted. observation.correction_current.closed_at is the apply instant (applied_at here), never the closure.';

CREATE OR REPLACE FUNCTION graph.correction_closures_list(p_tenant uuid, p_domain uuid, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the correction cases and their closure');
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(s) - 'tenant_id' - 'domain_id' ORDER BY s.received_at DESC), '[]'::jsonb)
            FROM (SELECT * FROM graph.correction_closure_state z WHERE z.tenant_id = p_tenant AND z.domain_id = p_domain ORDER BY z.received_at DESC LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)) s);
END $$;
REVOKE ALL ON FUNCTION graph.correction_closures_list(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.correction_closures_list(uuid, uuid, int) TO eye_app, eye_commit;

-- The applied cases with no closure record (the adopt act LISTS them; it adopts none by itself — DESIGN D9).
CREATE OR REPLACE FUNCTION graph.adoptable_correction_cases(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, public, pg_catalog, pg_temp AS $$
DECLARE k graph.closure_contracts;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the correction cases applied before B50');
  k := graph._cl_contract(p_tenant, p_domain);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('case_id', c.case_id, 'kind', c.kind, 'source_id', c.source_id, 'reason', c.reason, 'received_at', c.received_at, 'applied_at', c.closed_at,
            'propagation_state', c.propagation_state, 'days_since_apply', round(extract(epoch FROM (clock_timestamp() - c.closed_at))::numeric / 86400, 1),
            'material_products', (SELECT count(*) FROM graph.case_affected_products a WHERE a.case_id = c.case_id AND a.class <> 'current'),
            'past_window_if_adopted', CASE WHEN k.contract_id IS NULL THEN NULL ELSE
               (SELECT count(*) FROM graph._cl_consumers(p_tenant, p_domain, c.case_id, clock_timestamp(), k.windows, c.closed_at) x WHERE x.overdue) END)
            ORDER BY c.received_at), '[]'::jsonb)
            FROM observation.correction_current c
           WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state = 'applied' AND NOT EXISTS (SELECT 1 FROM graph.correction_closures x WHERE x.case_id = c.case_id));
END $$;
REVOKE ALL ON FUNCTION graph.adoptable_correction_cases(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.adoptable_correction_cases(uuid, uuid) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION graph.closure_contract_read(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the domain''s closure contract');
  RETURN jsonb_build_object('current', (SELECT to_jsonb(k) FROM graph.closure_contracts k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain ORDER BY k.version DESC LIMIT 1),
                            'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('version', k.version, 'declared_at', k.declared_at, 'declared_by', k.declared_by, 'synthetic', k.synthetic, 'contract_digest', k.contract_digest) ORDER BY k.version), '[]'::jsonb)
                                           FROM graph.closure_contracts k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain));
END $$;
REVOKE ALL ON FUNCTION graph.closure_contract_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.closure_contract_read(uuid, uuid) TO eye_app, eye_commit;

/*
 * THE CASE PAGE'S ONE READ (DP-24-002, PR-24-002, HX-18): the correction's identity, authority (who applied it), target versions, reason,
 * effective time, replacement, the impacted graph (its walks), the propagation state; every consumer with its acknowledgement, deadline and
 * freeze; the freezes; the escalations; the closure record; the readiness in words (with the projection check when p_check is true — an
 * explicit, audited read); and the correction impact NOTICE: the original, the correction, the affected products, the decisions, the required
 * reviews and the closure on one record. Nothing here is a write.
 */
CREATE OR REPLACE FUNCTION graph.correction_closure_read(p_tenant uuid, p_domain uuid, p_case uuid, p_check boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE cs observation.correction_current; c graph.correction_closures; k graph.closure_contracts; v_now timestamptz := clock_timestamp(); v_ready jsonb; v_cons jsonb; v_notice jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a correction case and its closure');
  SELECT * INTO cs FROM observation.correction_current x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'correction closure rejected (unknown_case): no correction case % in this domain', p_case USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM graph.correction_closures x WHERE x.case_id = p_case;
  k := graph._cl_contract(p_tenant, p_domain);
  v_ready := graph._cl_readiness(p_tenant, p_domain, p_case, v_now, coalesce(p_check, false));
  v_cons := v_ready -> 'consumers';
  v_notice := jsonb_build_object(
    'schema', 'eye.correction-impact-notice/1',
    'original', (SELECT coalesce(jsonb_agg(jsonb_build_object('object_id', x ->> 'object_id', 'from_version', x -> 'from', 'to_version', x -> 'to')), '[]'::jsonb) FROM jsonb_array_elements(cs.affected_resolved) x),
    'correction', jsonb_build_object('case_id', p_case, 'kind', cs.kind, 'reason', cs.reason, 'received_at', cs.received_at, 'applied_at', cs.closed_at, 'applied_by', graph._cl_applier(p_case)),
    'affected_products', (SELECT coalesce(jsonb_agg(jsonb_build_object('ref', y ->> 'consumer_ref', 'title', y ->> 'title', 'class', y ->> 'class', 'state', y ->> 'state', 'frozen', y -> 'frozen', 'owner', y -> 'owner')
                                                    ORDER BY y ->> 'consumer_ref'), '[]'::jsonb) FROM jsonb_array_elements(v_cons) y WHERE y ->> 'consumer_kind' = 'affected_product' AND (y ->> 'material')::boolean),
    'decisions', (SELECT coalesce(jsonb_agg(jsonb_build_object('ref', y ->> 'consumer_ref', 'title', y ->> 'title', 'kind', y ->> 'product_kind', 'state', y ->> 'state', 'owner', y -> 'owner')
                                            ORDER BY y ->> 'consumer_ref'), '[]'::jsonb) FROM jsonb_array_elements(v_cons) y WHERE y ->> 'product_kind' IN ('decision', 'decision_package', 'commitment')),
    'required_review', (SELECT coalesce(jsonb_agg(jsonb_build_object('ref', y ->> 'consumer_ref', 'title', y ->> 'title', 'owner', y -> 'owner', 'state', y ->> 'state', 'deadline', y -> 'deadline')
                                                  ORDER BY y ->> 'consumer_ref'), '[]'::jsonb) FROM jsonb_array_elements(v_cons) y WHERE y ->> 'class' = 'human_review'),
    'closure', CASE WHEN c.closure_id IS NULL THEN jsonb_build_object('state', 'not_tracked') ELSE jsonb_build_object('state', c.state, 'closed_at', c.closed_at, 'closed_by', c.closed_by, 'audit_digest', c.audit_digest) END,
    'completeness', 'an affected product listed here does not claim current completeness until its consumer is closed; delivery of this notice to its recipients is B84''s (NOT-08/-13)');
  RETURN jsonb_build_object(
    'case', jsonb_build_object('case_id', p_case, 'kind', cs.kind, 'state', cs.state, 'source_id', cs.source_id, 'channel', cs.channel, 'publisher_ref', cs.publisher_ref, 'reason', cs.reason,
                               'received_at', cs.received_at, 'applied_at', cs.closed_at, 'applied_by', graph._cl_applier(p_case), 'target_versions', cs.affected_resolved,
                               'propagation_state', cs.propagation_state, 'propagation_statement', cs.propagation_unresolved, 'failure_reason', cs.failure_reason,
                               'closed_at_meaning', 'closed_at on the case is the apply instant; the case is closed when its closure record is'),
    'tracked', c.closure_id IS NOT NULL,
    'closure', CASE WHEN c.closure_id IS NULL THEN NULL ELSE to_jsonb(c) - 'record' END,
    'record', c.record,
    'contract', CASE WHEN k.contract_id IS NULL THEN NULL ELSE to_jsonb(k) END,
    'consumers', v_cons,
    'freezes', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.frozen_at, f.freeze_id), '[]'::jsonb) FROM graph.publication_freezes f WHERE f.case_id = p_case),
    'escalations', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'state', i.state, 'owner', i.owner_principal_id, 'route_roles', to_jsonb(i.route_roles), 'due_at', i.due_at,
                                                                 'escalations', i.escalations, 'title', i.title, 'consumer_ref', i.details ->> 'consumer_ref', 'created_at', i.created_at) ORDER BY i.created_at), '[]'::jsonb)
                      FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'correction_propagation_stall' AND i.subject_id = p_case),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'ref', e.consumer_ref, 'actor', e.actor_principal_id, 'details', e.details, 'at', e.occurred_at) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                 FROM graph.correction_closure_events e WHERE e.case_id = p_case),
    'readiness', jsonb_build_object('ready', v_ready -> 'ready', 'reasons', v_ready -> 'reasons', 'projections_checked', coalesce(p_check, false), 'projections', v_ready -> 'projections'),
    'scope', v_ready -> 'scope',
    'notice', v_notice,
    -- the state the page's Command Review binds: a changed consumer, freeze or closure is a new state (the review is void, never updated)
    'state_digest', encode(sha256(convert_to(jsonb_build_object('consumers', (SELECT coalesce(jsonb_agg(jsonb_build_object('ref', y ->> 'consumer_ref', 'state', y ->> 'state', 'frozen', y -> 'frozen')
                                                                      ORDER BY y ->> 'consumer_kind', y ->> 'consumer_ref'), '[]'::jsonb) FROM jsonb_array_elements(v_cons) y),
                                                                'closure', c.state, 'contract', k.version)::text, 'UTF8')), 'hex'),
    'as_of', v_now);
END $$;
REVOKE ALL ON FUNCTION graph.correction_closure_read(uuid, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.correction_closure_read(uuid, uuid, uuid, boolean) TO eye_app, eye_commit;

-- ─── §CL.10 graph.rebuild_projections RE-DECLARED — 0080 §4 (its LAST definition) copied WHOLE; the only change, marked `B50 cl`: the close's
-- own action admitted (the closure re-checks the projections inside its write, ES-30-005). ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint, missing bigint, unexpected bigint, representation_ok boolean)
SECURITY DEFINER SET search_path = graph, memory, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid; v_current text := graph.projection_representation_version();
BEGIN
  -- 0063: the retrieval subscriber verifies the projections after a change; 0080: the rebuild re-checks under its own action.
  PERFORM observation.assert_authority(ARRAY['graph.read', 'observation.read', 'graph.retrieval.subscription.apply', 'graph.projection.rebuild',
                                             /* B50 cl: the correction closure re-checks the projections before the case closes */ 'graph.closure.close' /* end B50 cl */]);
  v_tenant := public.eye_tenant();
  v_domain := public.eye_domain();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'projection rebuild rejected: no tenant is established in this context' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH live AS (SELECT x.entity_id AS id, x.lifecycle_state AS state FROM graph.entities_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.entity_id AS id, e.state FROM graph.expected_entities(v_tenant, v_domain) e)
  SELECT 'entities_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'entities_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.resolution_id AS id, x.state FROM graph.resolutions_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.resolution_id AS id, e.state FROM graph.expected_resolutions(v_tenant, v_domain) e)
  SELECT 'resolutions_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'resolutions_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.edge_id AS id, x.state FROM graph.edges_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.edge_id AS id, e.state FROM graph.expected_edges(v_tenant, v_domain) e)
  SELECT 'edges_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'edges_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.strategy_object_id AS id, x.object_type, x.verification_state FROM graph.strategy_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.strategy_object_id AS id, e.state FROM graph.expected_strategy(v_tenant, v_domain) e)
  SELECT 'strategy_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.object_type = 'ASU' AND e.state IS NOT NULL AND l.verification_state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'strategy_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.invalidation_id AS id, x.state FROM graph.invalidations_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.invalidation_id AS id, e.state FROM graph.expected_invalidations(v_tenant, v_domain) e)
  SELECT 'invalidations_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'invalidations_current', v_current);

  -- the memory row (C6): state, version and the three policy columns against the canonical version the log names; the
  -- e.classification IS NOT NULL guard — a log version with no canonical row is the content tier's absence, named by the rebuild
  -- as unrebuildable, not a policy drift
  RETURN QUERY
  WITH live AS (SELECT x.item_id AS id, x.state, x.object_version, x.classification, x.audience_roles, x.audience_purposes FROM memory.items_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.item_id AS id, e.state, e.object_version, e.classification, e.audience_roles, e.audience_purposes FROM memory.expected_items(v_tenant, v_domain) e)
  SELECT 'memory_items_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id
           WHERE l.state IS DISTINCT FROM e.state OR l.object_version IS DISTINCT FROM e.object_version
              OR (e.classification IS NOT NULL AND (l.classification IS DISTINCT FROM e.classification OR l.audience_roles IS DISTINCT FROM e.audience_roles OR l.audience_purposes IS DISTINCT FROM e.audience_purposes))),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'memory_items_current', v_current);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.rebuild_projections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.rebuild_projections() TO eye_app, eye_commit;

-- ─── §CL.11 MET-010 v2 (DQM-020) — analytics.mc_met010_correction_propagation re-declared: the end instant is the CLOSURE RECORD's ─────────
/* MET-010 CORRECTION PROPAGATION TIME v2 (duration, seconds; App M: "time from accepted correction to all affected products reconciled or
   constrained"; DQM-020 "to material consumer closure"). READING — population: corrections ACCEPTED in the window (observation.correction_events
   `case.applied`). Start: the acceptance instant. End — THE CLOSURE INSTANT: graph.correction_closures.closed_at, the moment every material
   consumer was acknowledged, recomputed or under a bounded exception and the projections reconciled (B50 §CL; v1 ended at the walk). A case
   whose closure is open or stalled, or a case applied before B50 and not adopted (no record), is EXCLUDED as censored and said; when censored
   cases are more than half the accepted ones the median is INDETERMINATE. The DECLARED closure contract (graph.closure_contracts) is named in
   the quality notes: the duration is measured; its breach is the contract's windows and the definition's threshold. DIMENSIONS: tenant and
   domain (the call), the asset (the scope rule), the deployment (the instance), the window (the period), the correction kind (cohort
   `correction_kind`) and per record the reached consumers and the product kinds. */
CREATE OR REPLACE FUNCTION analytics.mc_met010_correction_propagation(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, observation, graph, public, pg_catalog, pg_temp AS $$
DECLARE v_newest timestamptz; v_src uuid[] := analytics.mcb_scope_sources(p_tenant, p_domain, p_scope); v_recs jsonb; v_cens int; v_total int; v_reasons jsonb := '[]'::jsonb; v_contract int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the propagation of the domain''s corrections (MET-010)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('duration', 'MET-010', 'a correction is accepted and propagated in record time', p_params); END IF;
  SELECT max(k.version) INTO v_contract FROM graph.closure_contracts k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.declared_at <= p_as_of;
  WITH acc AS (
    SELECT DISTINCT ON (e.case_id) e.case_id, e.occurred_at AS accepted_at, c.source_id, c.kind
      FROM observation.correction_events e JOIN observation.correction_current c ON c.case_id = e.case_id
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'case.applied' AND e.occurred_at >= p_from AND e.occurred_at < p_to AND e.occurred_at <= p_as_of
       AND (v_src IS NULL OR c.source_id = ANY (v_src))
       AND (p_cohort ->> 'correction_kind' IS NULL OR c.kind = p_cohort ->> 'correction_kind')
     ORDER BY e.case_id, e.occurred_at),
  judged AS (
    SELECT a.*, x.closure_id, x.state AS closure_state, CASE WHEN x.state = 'closed' AND x.closed_at <= p_as_of THEN x.closed_at END AS closed_at, x.reached_consumers,
           (SELECT coalesce(jsonb_agg(DISTINCT y ->> 'product_kind') FILTER (WHERE y ->> 'product_kind' IS NOT NULL), '[]'::jsonb) FROM jsonb_array_elements(coalesce(x.record -> 'consumers', '[]'::jsonb)) y) AS product_kinds
      FROM acc a LEFT JOIN graph.correction_closures x ON x.case_id = a.case_id)
  SELECT coalesce(jsonb_agg(CASE WHEN j.closed_at IS NOT NULL THEN
                              jsonb_build_object('kind', 'correction', 'id', j.case_id, 'role', 'included',
                                'detail', jsonb_strip_nulls(jsonb_build_object('value', round(greatest(0, extract(epoch FROM (j.closed_at - j.accepted_at)))::numeric, 3), 'accepted_at', j.accepted_at,
                                                           'closed_at', j.closed_at, 'closure', 'material consumer closure (the closure record)', 'correction_kind', j.kind,
                                                           'consumers', j.reached_consumers, 'product_kinds', j.product_kinds)))
                            ELSE jsonb_build_object('kind', 'correction', 'id', j.case_id, 'role', 'excluded',
                                'reason', CASE WHEN j.closure_id IS NULL THEN 'censored: applied before B50 and not adopted — no closure record'
                                               ELSE 'censored: the closure is ' || j.closure_state || ' as of the as-of (no closure instant yet)' END,
                                'detail', jsonb_build_object('accepted_at', j.accepted_at, 'closure_state', coalesce(j.closure_state, 'not_tracked'), 'closure', 'censored')) END
                            ORDER BY j.accepted_at, j.case_id), '[]'::jsonb),
         count(*) FILTER (WHERE j.closed_at IS NULL), count(*),
         max(j.accepted_at)
    INTO v_recs, v_cens, v_total, v_newest FROM judged j;
  IF v_total > 0 AND v_cens * 2 > v_total THEN
    v_reasons := v_reasons || to_jsonb(format('%s of %s accepted corrections are not closed (censored): a median over the closed ones alone would be survivor-biased', v_cens, v_total));
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'duration', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'censored', v_cens, 'accepted', v_total, 'unit', 'seconds', 'computation_version', 2,
      'scope_rule', CASE WHEN p_scope IS NULL THEN 'the domain' ELSE 'corrections of sources feeding the scope''s series or entities' END,
      'closure_contract_version', v_contract,
      'notes', jsonb_build_array('v2 (B50 §CL): the closure instant = the closure record''s closed_at — every material consumer acknowledged, recomputed or under a bounded exception and the projections reconciled; v1 ended at the walk',
                                 CASE WHEN v_contract IS NULL THEN 'no closure contract is declared in this domain: the duration is measured; its breach is the definition''s threshold'
                                      ELSE format('the domain''s declared closure contract (version %s) names the acknowledgement windows per consumer class', v_contract) END,
                                 'a case applied before B50 and not adopted has no closure record and is censored, never estimated'))), 'closure', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met010_correction_propagation(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met010_correction_propagation', 'analytics.mc_met010_correction_propagation', 'duration', ARRAY['correction_kind']::text[],
  ARRAY['observation.correction_events', 'observation.correction_current', 'graph.correction_closures', 'graph.closure_contracts', 'prediction.series_registry', 'observation.source_contracts_current'],
  'a correction concerns the scope when its source feeds a series of the scope''s series_keys or of an entity in its entity_ids; a NULL scope is the domain',
  'MET-010 v2: seconds from an accepted correction to its MATERIAL CONSUMER CLOSURE (the closure record''s closed_at); open, stalled and untracked cases censored and said', '0120 §CL');

-- ─── §CL.12 THE MIGRATION'S OWN CHECKS ───────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT ('correction_propagation_stall' = ANY (executive.attention_signal_classes())) OR NOT ('knowledge_challenge_overdue' = ANY (executive.attention_signal_classes())) THEN
    RAISE EXCEPTION 'migration 0120 §CL: the attention classes are not declared';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM analytics.computation_registry r WHERE r.function_name = 'analytics.mc_met010_correction_propagation' AND r.registered_in = '0120 §CL' AND r.version >= 2) THEN
    RAISE EXCEPTION 'migration 0120 §CL: MET-010 v2 is not registered';
  END IF;
  IF (SELECT p.provolatile FROM pg_proc p WHERE p.oid = 'objects.publication_frozen(text, uuid, integer)'::regprocedure) <> 's'
     OR (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'objects.publication_frozen(text, uuid, integer)'::regprocedure) THEN
    RAISE EXCEPTION 'migration 0120 §CL: objects.publication_frozen must stay STABLE and invoker';
  END IF;
END $$;

-- ═══ FOLD §TL (from 0120_b50_x_tl.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §TL — CP-6 B50 part §TL: THE TIMELINE, THE AS-OF EXPLORER AND THE SOURCE-TO-PRODUCT TRACE (F-P3-04: PR-22-001/002/003/005/006,
-- CAP-UM-10, AT-22). Folded into 0120 LAST (§0, §HD, §LC, §CI, §PV, §CL, §TL). Applies ALONE on 0001–0119 + the 0120 §0 prelude + the wave-1
-- parts (§HD, §LC, §CI, §PV): it USES them and re-implements none — §HD's objects.time_qualifiers (the stated time values and their
-- precision), §LC's objects.lifecycle_transitions / objects.lifecycle_replay, §PV's graph.explain (the trace IS the explanation projected),
-- §PV's fitness marks and knowledge challenges. Nothing applied or committed is edited; NO existing function is re-declared (the attention
-- vocabulary is WIDENED by union, §TL.5, so it composes with §CL's widening whichever folds first).
--
--   §TL.1  the vocabulary (helpers, IMMUTABLE): the method version, the instant as UTC text, the clearance ranks, the audience-governed types
--          (the B10 header-only rule: objects.service.ts AUDIENCE_GOVERNED), the reference's uuid, the clock reading of one version
--   §TL.2  the citation state (graph.tl_cite_state, a guarded DEFINER read): does a header citation still resolve inside the tenant — so a
--          citation into a domain the caller cannot see is not misread as broken; the missing intervals (graph.tl_missing_intervals,
--          INVOKER): the declared incomplete acquisition ranges and the source-health gaps of the linked sources, as known at the instant
--   §TL.3  graph.timeline(subject | scope, from, to, axis, as_of, clearance, limit) — SECURITY INVOKER (the caller's RLS): the canonical
--          versions on the chosen axis (event | observation | valid | record) as known at as_of (bitemporal: recorded_at <= as_of), each
--          with its four times, its §HD qualifiers, its clock reading and the correction recorded LATER; the event ledgers of the subject
--          (lifecycle attempts, warning / package events, decision-time snapshots, custody, challenges, fitness marks, correction cases,
--          invalidations); the existing as-of reads (the known-at version, objects.lifecycle_replay, prediction.warning_as_of,
--          prediction.scenario_version_as_of, the recorded decision replays); and the DISCLOSURE — later corrections, missing intervals,
--          policy filtering (COUNTS withheld by classification / audience, never their content), clock skew, broken lineage, bounds
--   §TL.4  graph.trace(type, id, version, clearance) — SECURITY INVOKER: §PV's graph.explain projected source → evidence → claims → product
--          (→ decision), each object node with its clock, its later correction and its policy filtering; the unresolved edges PRESERVED;
--          the missing intervals of the sources it rests on; the chapter CONTINUITY read through B81's shell.degraded_state (a degraded
--          source with or without a declared contract); the decision-time snapshots; the reconciliation already routed
--   §TL.5  the reconciliation: graph.route_trace_reconciliation (graph.timeline.reconcile — human-gated): an INCOMPLETE trace (conflicting
--          time, diverging clocks, broken lineage, unavailable evidence, a degraded continuity) routed as ONE attention item to the
--          product's accountable owner (else the knowledge roles), idempotent per (product version, problem set); the attention class
--          `knowledge.trace_reconciliation` and subject kind `canonical_object` added to the vocabulary by union
--   §TL.6  grants
--
-- REFUSAL NOUNS (the CLASS form; reported to the integrator for observation-errors.ts): `timeline rejected (<class>)`, `trace rejected
-- (<class>)`, `trace reconciliation rejected (<class>)` — 403 actor|authority · 404 unknown_object|unknown_scope · 409 state|duplicate ·
-- 422 subject|axis|window|future|clearance|limit|reason.
--
-- WHAT A VIEW NEVER DOES (PR-22-003): it never rewrites, re-orders by authority or conceals — a later correction is SHOWN ('corrected on …'),
-- a missing interval is SHOWN, a policy filter is COUNTED (classification above the reader's clearance: the item is withheld and counted;
-- an audience-governed type: the header is shown, the content withheld and counted), a clock divergence is FLAGGED, a citation that no
-- longer resolves is LISTED. The 19 host-clock read sites of the API stay H1's (DESIGN D19); every instant here is the DATABASE clock.
-- THREE CLAIMS: construction (this file and phase6-timeline-b50, its fixtures SYNTHETIC); demonstrated operation (the act — SYNTHETIC);
-- real acceptance (PR-22-006 / AT-22: the shared recording path at B111, then R2) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §TL.1 THE VOCABULARY ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.tl_method() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b50-tl-timeline-1' $$;
CREATE OR REPLACE FUNCTION graph.tl_axes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['event', 'observation', 'valid', 'record'] $$;
/* The attention class and subject kind of a routed reconciliation (§TL.5). */
CREATE OR REPLACE FUNCTION graph.tl_attention_class() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'knowledge.trace_reconciliation' $$;

CREATE OR REPLACE FUNCTION graph.tl_iso(p timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END
$$;

/* The clearance ranks (apps/api/src/shared/clearance.ts CLEARANCE_RANK); an unknown classification ranks highest (withheld), an unknown
   clearance lowest — the read never widens by a word it does not know. */
CREATE OR REPLACE FUNCTION graph.tl_rank(p text, p_default int) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p WHEN 'public' THEN 0 WHEN 'internal' THEN 1 WHEN 'confidential' THEN 2 WHEN 'restricted' THEN 3 ELSE p_default END
$$;

/* The B10 header-only rule (objects.service.ts AUDIENCE_GOVERNED): the content of these types is read through their own governed reads,
   within their audiences — a timeline shows their header and withholds their content (counted, reason audience). */
CREATE OR REPLACE FUNCTION graph.tl_audience_governed() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['MEM', 'BRF'] $$;

/* The first uuid a reference carries ('CLM:<uuid>@3', 'SRC:<uuid>@1', '<uuid>@2', 'blob:<uuid>'), or NULL. */
CREATE OR REPLACE FUNCTION graph.tl_ref_uuid(p text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT lower(substring(p from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'))::uuid
$$;

/* A text bound read as an instant when it is one ('2024-01-14', '2024-01-14T00:00:00Z'), else NULL (an acquisition range's bound may be a
   sequence or a cursor; such a range is never dropped — it is shown as not placed on the axis). STABLE: the cast reads the session zone. */
CREATE OR REPLACE FUNCTION graph.tl_try_ts(p text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}([T ][0-9:.]+)?(Z|[+-]\d{2}(:?\d{2})?)?$' THEN RETURN NULL; END IF;
  RETURN CASE WHEN p ~ '^\d{4}-\d{2}-\d{2}$' THEN (p || 'T00:00:00Z')::timestamptz ELSE p::timestamptz END;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

/* THE CLOCK READING of one version (PR-22-005, CAP-UM-10, DESIGN D19): every flag it carries and the one the seam shows (the worst first):
   conflict (a §HD qualifier states conflicting times — the sources disagree) · observation_after_record (observed after it was recorded:
   the source clock and the record clock diverge) · unknown / degraded (the header's source_clock_quality, or a qualifier's clock quality) ·
   trusted. p_q: the version's qualifiers as [{axis, kind, clock_quality, conflicts}] or NULL (recorded before B50). */
CREATE OR REPLACE FUNCTION graph.tl_clock(p_observed timestamptz, p_recorded timestamptz, p_quality text, p_q jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_flags text[] := ARRAY[]::text[]; q jsonb; v_detail jsonb := '[]'::jsonb;
BEGIN
  FOR q IN SELECT * FROM jsonb_array_elements(coalesce(p_q, '[]'::jsonb)) LOOP
    IF q ->> 'kind' = 'conflicting' AND NOT ('conflict' = ANY (v_flags)) THEN
      v_flags := v_flags || 'conflict'::text;
      v_detail := v_detail || jsonb_build_object('flag', 'conflict', 'axis', q ->> 'axis', 'conflicts', q -> 'conflicts');
    END IF;
  END LOOP;
  IF p_observed IS NOT NULL AND p_recorded IS NOT NULL AND p_observed > p_recorded THEN
    v_flags := v_flags || 'observation_after_record'::text;
    v_detail := v_detail || jsonb_build_object('flag', 'observation_after_record', 'observed_at', to_char(p_observed AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'recorded_at', to_char(p_recorded AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'ahead_by', (p_observed - p_recorded)::text);
  END IF;
  IF p_quality = 'unknown' OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_q, '[]'::jsonb)) x WHERE x ->> 'clock_quality' = 'unknown') THEN
    v_flags := v_flags || 'unknown'::text; v_detail := v_detail || jsonb_build_object('flag', 'unknown', 'source_clock_quality', p_quality);
  ELSIF p_quality = 'degraded' OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_q, '[]'::jsonb)) x WHERE x ->> 'clock_quality' = 'degraded') THEN
    v_flags := v_flags || 'degraded'::text; v_detail := v_detail || jsonb_build_object('flag', 'degraded', 'source_clock_quality', p_quality);
  END IF;
  RETURN jsonb_build_object('clock', CASE WHEN 'conflict' = ANY (v_flags) THEN 'conflict' WHEN 'observation_after_record' = ANY (v_flags) THEN 'observation_after_record'
                                          WHEN 'unknown' = ANY (v_flags) THEN 'unknown' WHEN 'degraded' = ANY (v_flags) THEN 'degraded' ELSE 'trusted' END,
                            'flags', to_jsonb(v_flags), 'detail', v_detail);
END $$;

-- §TL.2 THE CITATION STATE AND THE MISSING INTERVALS ────────────────────────────────────────────────────────────────────────────────────
/* Does one header citation still RESOLVE? (PR-22-005 "a cited version that no longer resolves"). Over what §PV's closure resolves (this
   domain, a tenant-level object, a platform object — graph.pv_resolve's rule, so the timeline and the trace agree): resolved | unresolved
   (no such object, or no such version) | deleted (the cited object's latest version is deleted) | artifact (a blob manifest recorded in
   this domain) | opaque (not a typed citation — a method name, a URL: never a break). A DEFINER read because a DOMAIN reader's RLS hides
   tenant-level and platform objects, which still resolve; it returns only the state, the type and the version — never content. Guarded by
   the caller's bound scope (0102 N-01). */
CREATE OR REPLACE FUNCTION graph.tl_cite_state(p_tenant uuid, p_domain uuid, p_ref text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_id uuid; v_type text; v_version int; v_latest int; v_latest_state text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the state of a citation');
  IF p_ref IS NULL OR btrim(p_ref) = '' THEN RETURN jsonb_build_object('ref', p_ref, 'state', 'opaque'); END IF;
  IF p_ref ~* '^blob:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_id := graph.tl_ref_uuid(p_ref);
    RETURN jsonb_build_object('ref', p_ref, 'form', 'manifest', 'state',
      CASE WHEN EXISTS (SELECT 1 FROM observation.blob_manifests b WHERE b.manifest_id = v_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain) THEN 'artifact' ELSE 'unresolved' END);
  END IF;
  IF p_ref !~* '^([A-Z]{3}:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(@[1-9][0-9]{0,8})?$' THEN
    RETURN jsonb_build_object('ref', p_ref, 'form', 'opaque', 'state', 'opaque');
  END IF;
  v_id := graph.tl_ref_uuid(p_ref);
  v_type := CASE WHEN p_ref ~ '^[A-Z]{3}:' THEN substring(p_ref from 1 for 3) END;
  v_version := CASE WHEN position('@' in p_ref) > 0 THEN split_part(p_ref, '@', 2)::int END;
  SELECT max(o.object_version)::int INTO v_latest FROM objects.canonical_objects o
   WHERE o.object_id = v_id AND (v_type IS NULL OR o.object_type = v_type)
     AND ((o.tenant_id = p_tenant AND o.domain_id = p_domain) OR (o.tenant_id = p_tenant AND o.domain_id IS NULL) OR o.tenant_id IS NULL);
  IF v_latest IS NULL THEN
    RETURN jsonb_build_object('ref', p_ref, 'form', 'typed', 'type', v_type, 'id', v_id, 'version', v_version, 'state', 'unresolved', 'reason', 'no recorded object of this tenant carries this id');
  END IF;
  IF v_version IS NOT NULL AND v_version > v_latest THEN
    RETURN jsonb_build_object('ref', p_ref, 'form', 'typed', 'type', v_type, 'id', v_id, 'version', v_version, 'state', 'unresolved', 'latest', v_latest,
      'reason', format('version %s is not recorded; the latest is %s', v_version, v_latest));
  END IF;
  SELECT o.lifecycle_state INTO v_latest_state FROM objects.canonical_objects o
   WHERE o.object_id = v_id AND o.object_version = v_latest AND ((o.tenant_id = p_tenant AND o.domain_id = p_domain) OR (o.tenant_id = p_tenant AND o.domain_id IS NULL) OR o.tenant_id IS NULL);
  IF v_latest_state = 'deleted' THEN
    RETURN jsonb_build_object('ref', p_ref, 'form', 'typed', 'type', v_type, 'id', v_id, 'version', v_version, 'state', 'deleted', 'latest', v_latest,
      'reason', format('the cited object is deleted (version %s)', v_latest));
  END IF;
  RETURN jsonb_build_object('ref', p_ref, 'form', 'typed', 'type', v_type, 'id', v_id, 'version', v_version, 'state', 'resolved', 'latest', v_latest);
END $$;

/* THE MISSING INTERVALS of the linked sources (PR-22-003), as KNOWN at the instant: (a) the declared incomplete acquisition ranges
   (observation.acquisition_incomplete_ranges, 0084 §4) declared by then — resolved only if resolved by then (a later resolution is said);
   (b) the source-health gaps (observation.source_health_events: degraded | failed | suspended | unknown until the next healthy
   evaluation known by then). A range whose bounds are not instants is shown unplaced, never dropped. INVOKER (the caller's RLS). */
CREATE OR REPLACE FUNCTION graph.tl_missing_intervals(p_tenant uuid, p_domain uuid, p_sources uuid[], p_from timestamptz, p_to timestamptz, p_as_of timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, observation, pg_catalog, pg_temp AS $$
  WITH src AS (SELECT DISTINCT ON (c.source_id) c.source_id, c.source_key FROM observation.source_contracts_current c
                WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_id = ANY (coalesce(p_sources, ARRAY[]::uuid[])) ORDER BY c.source_id, c.contract_version DESC),
  ranges AS (
    SELECT jsonb_build_object('basis', 'acquisition_incomplete_ranges', 'range_id', r.range_id, 'source_id', r.source_id, 'source_key', s.source_key,
             'from', r.range_from, 'to', r.range_to, 'placed', graph.tl_try_ts(r.range_from) IS NOT NULL AND graph.tl_try_ts(r.range_to) IS NOT NULL,
             'reason', r.reason_class, 'detail', r.detail, 'declared_at', graph.tl_iso(r.declared_at),
             'resolved_at', CASE WHEN r.resolved_at IS NOT NULL AND r.resolved_at <= p_as_of THEN graph.tl_iso(r.resolved_at) END,
             'resolved_later', r.resolved_at IS NOT NULL AND r.resolved_at > p_as_of) AS x,
           coalesce(graph.tl_try_ts(r.range_from), r.declared_at) AS k
      FROM observation.acquisition_incomplete_ranges r JOIN src s ON s.source_id = r.source_id
     WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.declared_at <= p_as_of
       AND (graph.tl_try_ts(r.range_from) IS NULL OR graph.tl_try_ts(r.range_to) IS NULL
            OR (graph.tl_try_ts(r.range_from) < p_to AND graph.tl_try_ts(r.range_to) > p_from))),
  health AS (
    SELECT h.source_id, s.source_key, h.new_state, h.reason, h.lag_class, h.evaluated_at,
           (SELECT min(k.evaluated_at) FROM observation.source_health_events k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.source_id = h.source_id
             AND k.new_state = 'healthy' AND k.evaluated_at > h.evaluated_at AND k.evaluated_at <= p_as_of) AS healed_at
      FROM observation.source_health_events h JOIN src s ON s.source_id = h.source_id
     WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.new_state IN ('degraded', 'failed', 'suspended', 'unknown') AND h.evaluated_at <= p_as_of),
  gaps AS (
    SELECT jsonb_build_object('basis', 'source_health_events', 'source_id', g.source_id, 'source_key', g.source_key, 'from', graph.tl_iso(min(g.evaluated_at)),
             'to', graph.tl_iso(g.healed_at), 'placed', true, 'reason', 'source_health:' || (array_agg(g.new_state ORDER BY g.evaluated_at DESC))[1],
             'detail', (array_agg(g.reason || ' (lag class ' || g.lag_class || ')' ORDER BY g.evaluated_at DESC))[1], 'open', g.healed_at IS NULL) AS x,
           min(g.evaluated_at) AS k
      FROM health g GROUP BY g.source_id, g.source_key, g.healed_at
     HAVING min(g.evaluated_at) < p_to AND coalesce(g.healed_at, 'infinity'::timestamptz) > p_from)
  SELECT coalesce(jsonb_agg(u.x ORDER BY u.k, u.x ->> 'source_key'), '[]'::jsonb) FROM (SELECT * FROM ranges UNION ALL SELECT * FROM gaps) u
$$;

/* The SOURCES a set of canonical versions rests on (one hop): their own provenance_ref ('SRC:<id>@n' — a source id or the SRC object's id),
   the SRC objects they cite, and the provenance of the evidence / observations they cite. INVOKER. */
CREATE OR REPLACE FUNCTION graph.tl_linked_sources(p_tenant uuid, p_domain uuid, p_versions jsonb) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
  WITH v AS (SELECT (e ->> 'id')::uuid AS id, (e ->> 'version')::int AS version FROM jsonb_array_elements(coalesce(p_versions, '[]'::jsonb)) e),
  rows AS (SELECT o.* FROM objects.canonical_objects o JOIN v ON v.id = o.object_id AND v.version = o.object_version),
  cited AS (SELECT DISTINCT graph.tl_ref_uuid(r.ref) AS id FROM rows o CROSS JOIN LATERAL jsonb_array_elements_text(o.evidence_refs || o.source_object_ids) r(ref)),
  hop AS (SELECT DISTINCT ON (c.object_id) c.provenance_ref, c.object_type, c.object_id FROM objects.canonical_objects c JOIN cited ON cited.id = c.object_id
           WHERE c.tenant_id = p_tenant ORDER BY c.object_id, c.object_version DESC),
  ids AS (SELECT graph.tl_ref_uuid(o.provenance_ref) AS id FROM rows o WHERE o.provenance_ref ~ '^SRC:'
          UNION SELECT o.object_id FROM rows o WHERE o.object_type = 'SRC'
          UNION SELECT h.object_id FROM hop h WHERE h.object_type = 'SRC'
          UNION SELECT graph.tl_ref_uuid(h.provenance_ref) FROM hop h WHERE h.provenance_ref ~ '^SRC:')
  SELECT coalesce(array_agg(DISTINCT c.source_id), ARRAY[]::uuid[]) FROM observation.source_contracts_current c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.source_id IN (SELECT id FROM ids) OR c.src_object_id IN (SELECT id FROM ids))
$$;

-- §TL.3 graph.timeline ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE TIMELINE (PR-22-001/002/003, CAP-UM-10): what happened, what was known, what was believed and what changed — over a SUBJECT (one
   object: every version) or a governed SCOPE (an APPROVED analytics.scopes row of B92: the objects it names by entity / objective id, and
   the objects whose header cites one of them), on one AXIS, in the window [p_from, p_to), AS KNOWN AT p_as_of (NULL: now, the database
   clock). SECURITY INVOKER: the rows are the caller's under its own RLS; nothing outside them is read except the guarded citation state.
   The reader's CLEARANCE (the route's clearanceOf) filters by classification; the filter is COUNTED. STABLE: reading records nothing. */
CREATE OR REPLACE FUNCTION graph.timeline(p_tenant uuid, p_domain uuid, p_subject_type text, p_subject_id uuid, p_scope_key text,
                                          p_from timestamptz, p_to timestamptz, p_axis text, p_as_of timestamptz, p_clearance text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = graph, objects, observation, prediction, decision, executive, analytics, pg_catalog, pg_temp AS $$
DECLARE
  v_now timestamptz := clock_timestamp(); v_as_of timestamptz; v_limit int := coalesce(p_limit, 200); v_rank int;
  v_members uuid[]; v_scope analytics.scopes%ROWTYPE; v_subject jsonb; v_ids uuid[];
  v_items jsonb; v_events jsonb; v_reads jsonb := '{}'::jsonb; v_missing jsonb; v_sources uuid[];
  v_total int; v_withheld_class int; v_audience int; v_untimed int; v_broken jsonb; v_corrections int; v_clock jsonb; v_clock_n int;
  v_selected jsonb; v_latest int; v_known int; v_unattributed int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the timeline');
  -- THE ASK, refused in the class form
  IF (p_subject_id IS NULL) = (p_scope_key IS NULL) THEN
    RAISE EXCEPTION 'timeline rejected (subject): a timeline names ONE subject (an object type and id) or ONE governed scope (its key), not both and not neither' USING ERRCODE = '22023';
  END IF;
  IF p_subject_id IS NOT NULL AND (p_subject_type IS NULL OR p_subject_type !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION 'timeline rejected (subject): the subject names its object type (three capitals) with its id' USING ERRCODE = '22023';
  END IF;
  IF p_axis IS NULL OR NOT (p_axis = ANY (graph.tl_axes())) THEN
    RAISE EXCEPTION 'timeline rejected (axis): the axis is one of % (given %)', array_to_string(graph.tl_axes(), ', '), coalesce(p_axis, 'none') USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'timeline rejected (window): the window names its start and its end, the end after the start' USING ERRCODE = '22023';
  END IF;
  IF p_as_of IS NOT NULL AND p_as_of > v_now THEN
    RAISE EXCEPTION 'timeline rejected (future): the as-of instant % is after now (% on the database clock); a timeline reconstructs what was recorded, never a future', graph.tl_iso(p_as_of), graph.tl_iso(v_now) USING ERRCODE = '22023';
  END IF;
  IF p_clearance IS NULL OR graph.tl_rank(p_clearance, -1) < 0 THEN
    RAISE EXCEPTION 'timeline rejected (clearance): the reader''s clearance is public, internal, confidential or restricted' USING ERRCODE = '22023';
  END IF;
  IF v_limit < 1 OR v_limit > 1000 THEN
    RAISE EXCEPTION 'timeline rejected (limit): a timeline lists 1 to 1000 versions (given %)', v_limit USING ERRCODE = '22023';
  END IF;
  v_as_of := coalesce(p_as_of, v_now);
  v_rank := graph.tl_rank(p_clearance, 0);

  -- THE SELECTION: the subject's versions, or the scope's members
  IF p_subject_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_subject_id AND o.object_type = p_subject_type) THEN
      -- DENIAL PRIVACY: an object that does not exist and one outside the caller's rows answer the same words
      RAISE EXCEPTION 'timeline rejected (unknown_object): no authorized % object matches this subject', p_subject_type USING ERRCODE = '23503';
    END IF;
    v_members := ARRAY[p_subject_id];
    v_subject := jsonb_build_object('kind', 'subject', 'type', p_subject_type, 'id', p_subject_id);
  ELSE
    SELECT * INTO v_scope FROM analytics.scopes s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.scope_key = p_scope_key AND s.state = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'timeline rejected (unknown_scope): no approved governed scope % in this domain (a proposed, rejected or retired scope is not a timeline''s scope)', p_scope_key USING ERRCODE = '23503';
    END IF;
    v_members := v_scope.entity_ids || v_scope.objective_ids;
    v_subject := jsonb_build_object('kind', 'scope', 'scope_key', v_scope.scope_key, 'version', v_scope.version, 'title', v_scope.title, 'digest', v_scope.digest,
      'members', jsonb_build_object('entities', cardinality(v_scope.entity_ids), 'objectives', cardinality(v_scope.objective_ids)),
      'unmatched', jsonb_build_object('series_keys', to_jsonb(v_scope.series_keys), 'geographies', to_jsonb(v_scope.geographies),
        'note', 'the scope''s series and geographies are named by the scope; this read places objects by the entity and objective ids they are or cite, and says so'));
  END IF;

  -- THE CANDIDATES: every version KNOWN at the instant (bitemporal: recorded at or before as_of) with its axis span and its §HD qualifiers;
  -- the window on the axis; the policy filter (above the reader's clearance: withheld, counted, nothing of it shown); the bound
  WITH cand AS (
    SELECT o, q.q,
           CASE p_axis WHEN 'event' THEN coalesce((q.q -> 'event' ->> 'instant')::timestamptz, (q.q -> 'event' ->> 'earliest')::timestamptz, o.event_time)
                       WHEN 'observation' THEN coalesce((q.q -> 'observation' ->> 'instant')::timestamptz, (q.q -> 'observation' ->> 'earliest')::timestamptz, o.observation_time)
                       WHEN 'valid' THEN o.valid_from ELSE o.recorded_at END AS a_start,
           CASE p_axis WHEN 'event' THEN coalesce((q.q -> 'event' ->> 'latest')::timestamptz, (q.q -> 'event' ->> 'instant')::timestamptz, o.event_time)
                       WHEN 'observation' THEN coalesce((q.q -> 'observation' ->> 'latest')::timestamptz, (q.q -> 'observation' ->> 'instant')::timestamptz, o.observation_time)
                       WHEN 'valid' THEN coalesce(o.valid_to, 'infinity'::timestamptz) ELSE o.recorded_at END AS a_end
      FROM objects.canonical_objects o
      LEFT JOIN LATERAL (SELECT jsonb_object_agg(t.axis, jsonb_build_object('axis', t.axis, 'kind', t.kind, 'instant', graph.tl_iso(t.instant), 'earliest', graph.tl_iso(t.earliest),
                           'latest', graph.tl_iso(t.latest), 'precision', t.time_precision, 'zone', t.zone, 'source', t.source, 'rule', t.rule, 'conflicts', t.conflicts,
                           'clock_quality', t.clock_quality, 'declared', t.declared)) AS q
                           FROM objects.time_qualifiers t WHERE t.object_id = o.object_id AND t.object_version = o.object_version) q ON true
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= v_as_of
       AND (CASE WHEN p_subject_id IS NOT NULL THEN o.object_id = p_subject_id AND o.object_type = p_subject_type
                 ELSE o.object_id = ANY (v_members)
                      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(o.source_object_ids || o.evidence_refs) c(v) WHERE graph.tl_ref_uuid(c.v) = ANY (v_members))
                      OR graph.tl_ref_uuid(o.payload ->> 'entity_id') = ANY (v_members) OR graph.tl_ref_uuid(o.payload ->> 'objective_id') = ANY (v_members) END)),
  win AS (SELECT c.* FROM cand c WHERE c.a_start IS NOT NULL AND c.a_start < p_to AND coalesce(c.a_end, c.a_start) >= p_from),
  vis AS (SELECT w.* FROM win w WHERE graph.tl_rank((w.o).classification, 99) <= v_rank),
  sel AS (SELECT v.* FROM vis v ORDER BY v.a_start, (v.o).recorded_at, (v.o).object_id, (v.o).object_version LIMIT v_limit),
  enriched AS (
    SELECT s.*, (s.o).object_type = ANY (graph.tl_audience_governed()) AS header_only,
           graph.tl_clock((s.o).observation_time, (s.o).recorded_at, (s.o).source_clock_quality, (SELECT jsonb_agg(x) FROM jsonb_each(s.q) e(k, x))) AS clk,
           (SELECT jsonb_build_object('version', n.object_version, 'at', graph.tl_iso(n.recorded_at), 'by', coalesce(n.human_refs ->> 0, n.accountable_owner), 'lifecycle', n.lifecycle_state,
                     'correction_of', n.correction_of, 'supersedes', n.supersedes, 'withdrawal_reason', n.withdrawal_reason, 'known_at_as_of', n.recorded_at <= v_as_of)
              FROM objects.canonical_objects n WHERE n.object_id = (s.o).object_id AND n.object_version > (s.o).object_version
             ORDER BY n.object_version LIMIT 1) AS later,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('case_id', cc.case_id, 'kind', cc.kind, 'state', cc.state, 'received_at', graph.tl_iso(cc.received_at),
                     'known_at_as_of', cc.received_at <= v_as_of) ORDER BY cc.received_at), '[]'::jsonb)
              FROM observation.correction_current cc
             WHERE cc.tenant_id = p_tenant AND cc.domain_id = p_domain AND cc.received_at > (s.o).recorded_at
               AND EXISTS (SELECT 1 FROM jsonb_array_elements(cc.affected_resolved) a WHERE a ->> 'object_id' = (s.o).object_id::text)) AS cases,
           (SELECT coalesce(jsonb_agg(st ORDER BY st ->> 'ref'), '[]'::jsonb)
              FROM (SELECT DISTINCT r.v FROM jsonb_array_elements_text((s.o).evidence_refs || (s.o).source_object_ids) r(v)
                    UNION SELECT (s.o).object_type || ':' || (s.o).correction_of WHERE (s.o).correction_of ~ '^[0-9a-fA-F-]{36}@[1-9][0-9]*$') rr
             CROSS JOIN LATERAL graph.tl_cite_state(p_tenant, p_domain, rr.v) st WHERE st ->> 'state' IN ('unresolved', 'deleted')) AS broken,
           (SELECT max(m.object_version) FROM objects.canonical_objects m WHERE m.object_id = (s.o).object_id AND m.recorded_at <= v_as_of) AS known_version
      FROM sel s),
  items AS (
    SELECT e.*, jsonb_build_object(
             'ref', (e.o).object_type || ':' || (e.o).object_id || '@' || (e.o).object_version, 'object_type', (e.o).object_type, 'object_id', (e.o).object_id, 'version', (e.o).object_version,
             'title', CASE WHEN e.header_only THEN format('%s %s — its content is read through its own governed read (header only here)', (e.o).object_type, left((e.o).object_id::text, 8))
                           ELSE left(coalesce((e.o).payload ->> 'title', (e.o).payload ->> 'statement', (e.o).payload ->> 'subject', (e.o).payload ->> 'label', (e.o).object_type || ' ' || (e.o).object_id::text), 300) END,
             'header_only', e.header_only,
             'event_time', graph.tl_iso((e.o).event_time), 'observed_at', graph.tl_iso((e.o).observation_time), 'valid_from', graph.tl_iso((e.o).valid_from), 'valid_to', graph.tl_iso((e.o).valid_to),
             'recorded_at', graph.tl_iso((e.o).recorded_at), 'axis_start', graph.tl_iso(e.a_start), 'axis_end', CASE WHEN e.a_end = 'infinity'::timestamptz THEN NULL ELSE graph.tl_iso(e.a_end) END,
             'time_precision', (e.o).time_precision, 'source_clock_quality', (e.o).source_clock_quality,
             'time', CASE WHEN e.q IS NULL THEN NULL ELSE (SELECT jsonb_agg(x ORDER BY x ->> 'axis') FROM jsonb_each(e.q) j(k, x)) END, 'time_stated', e.q IS NOT NULL,
             'clock', e.clk ->> 'clock', 'clock_flags', e.clk -> 'flags', 'clock_detail', e.clk -> 'detail',
             'lifecycle', (e.o).lifecycle_state, 'truth_state', (e.o).truth_state, 'synthetic', (e.o).synthetic_state, 'classification', (e.o).classification,
             'owner', (e.o).accountable_owner, 'digest', (e.o).content_digest, 'believed_at_as_of', (e.o).object_version = e.known_version,
             'corrected_later', e.later, 'correction_cases', e.cases, 'broken_lineage', e.broken) AS j
      FROM enriched e)
  SELECT (SELECT count(*) FROM cand c WHERE c.a_start IS NULL),
         (SELECT count(*) FROM win w WHERE graph.tl_rank((w.o).classification, 99) > v_rank),
         (SELECT count(*) FROM vis),
         (SELECT coalesce(jsonb_agg(i.j ORDER BY i.a_start, (i.o).recorded_at, (i.o).object_id, (i.o).object_version), '[]'::jsonb) FROM items i),
         (SELECT coalesce(jsonb_agg(jsonb_build_object('id', (i.o).object_id, 'version', (i.o).object_version)), '[]'::jsonb) FROM items i),
         (SELECT count(*) FROM items i WHERE i.header_only),
         (SELECT coalesce(jsonb_agg(jsonb_build_object('ref', i.j ->> 'ref', 'cites', b ->> 'ref', 'state', b ->> 'state', 'reason', b ->> 'reason') ORDER BY i.j ->> 'ref', b ->> 'ref'), '[]'::jsonb)
            FROM items i CROSS JOIN LATERAL jsonb_array_elements(i.broken) b),
         (SELECT count(*) FROM items i WHERE i.later IS NOT NULL OR jsonb_array_length(i.cases) > 0),
         (SELECT count(*) FROM items i WHERE i.clk ->> 'clock' <> 'trusted'),
         (SELECT jsonb_build_object('degraded', count(*) FILTER (WHERE i.clk -> 'flags' ? 'degraded'), 'unknown', count(*) FILTER (WHERE i.clk -> 'flags' ? 'unknown'),
                                    'observation_after_record', count(*) FILTER (WHERE i.clk -> 'flags' ? 'observation_after_record'), 'conflict', count(*) FILTER (WHERE i.clk -> 'flags' ? 'conflict')) FROM items i),
         (SELECT coalesce(array_agg(DISTINCT (i.o).object_id), ARRAY[]::uuid[]) FROM items i)
    INTO v_untimed, v_withheld_class, v_total, v_items, v_selected, v_audience, v_broken, v_corrections, v_clock_n, v_clock, v_ids;
  IF p_subject_id IS NOT NULL THEN v_ids := v_ids || p_subject_id; END IF;

  -- THE EVENT LEDGERS of the selected objects (record time: occurred in the window, known by the instant)
  WITH ev AS (
    SELECT 'lifecycle'::text AS ledger, 'lifecycle.' || t.outcome || ':' || t.action AS event, t.recorded_at AS at, t.actor_principal_id::text AS actor,
           t.object_type || ':' || t.object_id AS ref,
           jsonb_build_object('from', t.from_state, 'to', t.to_state, 'new_version', t.new_version, 'refusal_code', t.refusal_code, 'kind', t.kind) AS details
      FROM objects.lifecycle_transitions t WHERE t.object_id = ANY (v_ids)
    UNION ALL
    SELECT 'warning', e.event, e.occurred_at, e.actor_principal_id::text, 'WRN:' || e.warning_id, jsonb_build_object('level', e.details ->> 'level', 'context_version', e.details ->> 'context_version')
      FROM prediction.warning_events e WHERE e.warning_id = ANY (v_ids)
    UNION ALL
    SELECT 'package', e.event, e.occurred_at, e.actor_principal_id::text, 'DPK:' || e.package_id, jsonb_build_object('version', e.details ->> 'version')
      FROM decision.package_events e WHERE e.package_id = ANY (v_ids)
    UNION ALL
    SELECT 'decision_snapshot', 'replay.recorded', x.replayed_at, x.reader_principal_id::text, 'DPK:' || x.package_id || '@' || x.version,
           jsonb_build_object('replay_id', x.replay_id, 'version', x.version, 'known_at', graph.tl_iso(x.known_at), 'observed_through', x.observed_through, 'decided_at', graph.tl_iso(x.decided_at),
                              'as_of', graph.tl_iso(x.as_of), 'content_digest', x.content_digest, 'header_digest', x.header_digest, 'unavailable', jsonb_array_length(x.unavailable))
      FROM decision.replays x WHERE x.package_id = ANY (v_ids)
    UNION ALL
    SELECT 'custody', c.event, c.occurred_at, c.actor, 'EVD:' || c.evd_object_id, jsonb_build_object('manifest_id', c.manifest_id, 'digest_verified', c.digest_verified)
      FROM observation.custody_events c WHERE c.evd_object_id = ANY (v_ids)
    UNION ALL
    SELECT 'challenge', e.event, e.occurred_at, e.actor_principal_id::text, k.subject_type || ':' || k.subject_id || '@' || k.subject_version, jsonb_build_object('challenge_id', k.challenge_id, 'state', k.state)
      FROM graph.knowledge_challenge_events e JOIN graph.knowledge_challenges k ON k.challenge_id = e.challenge_id WHERE k.subject_id = ANY (v_ids)
    UNION ALL
    SELECT 'fitness', 'fitness.marked:' || m.verdict, m.marked_at, m.marked_by::text, m.object_type || ':' || m.object_id || '@' || m.object_version,
           jsonb_build_object('mark_id', m.mark_id, 'verdict', m.verdict, 'reasons', to_jsonb(m.reasons), 'route', m.route)
      FROM graph.product_fitness_marks m WHERE m.object_id = ANY (v_ids)
    UNION ALL
    SELECT 'correction', ce.event, ce.occurred_at, ce.actor, 'case:' || cc.case_id, jsonb_build_object('case_id', cc.case_id, 'kind', cc.kind)
      FROM observation.correction_events ce JOIN observation.correction_current cc ON cc.case_id = ce.case_id
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(cc.affected_resolved) a WHERE (a ->> 'object_id') = ANY (SELECT unnest(v_ids)::text))
    UNION ALL
    SELECT 'invalidation', 'invalidation.' || i.state, i.opened_at, i.opened_by::text, 'INV:' || i.invalidation_id,
           jsonb_build_object('invalidation_id', i.invalidation_id, 'trigger_kind', i.trigger_kind, 'trigger_object_id', i.trigger_object_id, 'correction_case_id', i.correction_case_id)
      FROM graph.invalidations_current i WHERE i.trigger_object_id = ANY (v_ids))
  SELECT coalesce(jsonb_agg(jsonb_build_object('ledger', ev.ledger, 'event', ev.event, 'at', graph.tl_iso(ev.at), 'actor', ev.actor, 'ref', ev.ref, 'details', ev.details)
                            ORDER BY ev.at, ev.ledger, ev.event), '[]'::jsonb)
    INTO v_events FROM (SELECT * FROM ev WHERE ev.at >= p_from AND ev.at < p_to AND ev.at <= v_as_of ORDER BY ev.at LIMIT v_limit) ev;

  -- THE EXISTING AS-OF READS (a subject only): the known-at version, the lifecycle replay, the warning / scenario / decision as-of reads
  IF p_subject_id IS NOT NULL THEN
    SELECT max(o.object_version) FILTER (WHERE o.recorded_at <= v_as_of), max(o.object_version) INTO v_known, v_latest
      FROM objects.canonical_objects o WHERE o.object_id = p_subject_id AND o.object_type = p_subject_type;
    v_reads := jsonb_build_object('known_at', jsonb_build_object('version', v_known, 'latest', v_latest, 'versions_after', coalesce(v_latest, 0) - coalesce(v_known, 0),
      'statement', CASE WHEN v_known IS NULL THEN format('no version of this object was recorded by %s', graph.tl_iso(v_as_of))
                        WHEN v_known = v_latest THEN format('version %s was believed at %s and is the latest recorded', v_known, graph.tl_iso(v_as_of))
                        ELSE format('version %s was believed at %s; %s later version(s) were recorded after it (the latest is %s)', v_known, graph.tl_iso(v_as_of), v_latest - v_known, v_latest) END));
    IF EXISTS (SELECT 1 FROM objects.lifecycle_profiles lp WHERE lp.object_type = p_subject_type) THEN
      BEGIN
        v_reads := v_reads || jsonb_build_object('lifecycle', objects.lifecycle_replay(p_tenant, p_domain, p_subject_id, v_as_of));
      EXCEPTION WHEN others THEN v_reads := v_reads || jsonb_build_object('lifecycle', jsonb_build_object('unavailable', SQLERRM));
      END;
    END IF;
    IF p_subject_type = 'WRN' THEN
      BEGIN
        v_reads := v_reads || jsonb_build_object('warning', prediction.warning_as_of(p_subject_id, v_as_of));
      EXCEPTION WHEN others THEN v_reads := v_reads || jsonb_build_object('warning', jsonb_build_object('unavailable', SQLERRM));
      END;
    ELSIF p_subject_type = 'SCN' THEN
      v_reads := v_reads || jsonb_build_object('scenario', jsonb_build_object('version', prediction.scenario_version_as_of(p_subject_id, v_as_of)));
    ELSIF p_subject_type = 'DPK' THEN
      v_reads := v_reads || jsonb_build_object('decision', (SELECT jsonb_build_object('replays', coalesce(jsonb_agg(jsonb_build_object('replay_id', x.replay_id, 'version', x.version, 'known_at', graph.tl_iso(x.known_at),
          'decided_at', graph.tl_iso(x.decided_at), 'as_of', graph.tl_iso(x.as_of), 'content_digest', x.content_digest, 'replayed_at', graph.tl_iso(x.replayed_at)) ORDER BY x.replayed_at), '[]'::jsonb),
          'statement', 'the decision-time snapshots recorded for this package (decision.replays, 0043): what the decision was taken with, reconstructed and digested at the replay') FROM decision.replays x
         WHERE x.package_id = p_subject_id AND x.replayed_at <= v_as_of));
    END IF;
  END IF;

  -- THE MISSING INTERVALS of the sources the selection rests on
  v_sources := graph.tl_linked_sources(p_tenant, p_domain, v_selected);
  v_missing := graph.tl_missing_intervals(p_tenant, p_domain, v_sources, p_from, p_to, v_as_of);
  SELECT count(*) INTO v_unattributed FROM observation.acquisition_incomplete_ranges r
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.declared_at <= v_as_of AND (r.resolved_at IS NULL OR r.resolved_at > v_as_of) AND NOT (r.source_id = ANY (v_sources));

  RETURN jsonb_build_object(
    'method', graph.tl_method(), 'subject', v_subject,
    'window', jsonb_build_object('from', graph.tl_iso(p_from), 'to', graph.tl_iso(p_to), 'axis', p_axis),
    'as_of', graph.tl_iso(v_as_of), 'live', p_as_of IS NULL, 'read_at', graph.tl_iso(v_now), 'clearance', p_clearance,
    'items', v_items, 'events', v_events, 'as_of_reads', v_reads,
    'sources', to_jsonb(v_sources),
    'disclosure', jsonb_build_object(
      'missing_intervals', v_missing,
      'unattributed_open_ranges', v_unattributed,
      'withheld', jsonb_build_object('count', v_withheld_class + v_audience,
                                     'reason', CASE WHEN v_withheld_class >= v_audience AND v_withheld_class > 0 THEN 'classification' WHEN v_audience > 0 THEN 'audience' ELSE 'policy' END),
      'withheld_by_reason', jsonb_build_object('classification', v_withheld_class, 'audience', v_audience),
      'clock_flags', v_clock_n, 'clock', v_clock,
      'broken_lineage', v_broken,
      'corrections_later', v_corrections,
      'untimed', v_untimed,
      'bounds', jsonb_build_object('limit', v_limit, 'listed', jsonb_array_length(v_items), 'matched', v_total, 'truncated', v_total > v_limit),
      'incomplete', jsonb_array_length(v_missing) > 0 OR v_withheld_class + v_audience > 0 OR v_clock_n > 0 OR jsonb_array_length(v_broken) > 0 OR v_total > v_limit),
    'claim', 'a projection of what was recorded, as known at the instant — it rewrites, re-orders by authority and conceals nothing: a later correction is shown, a missing interval is shown, a policy filter is counted, a clock divergence is flagged, a citation that no longer resolves is listed');
END $$;

-- §TL.4 graph.trace ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE SOURCE-TO-PRODUCT TRACE (PR-22-001/005, AT-22): §PV's graph.explain PROJECTED — the object nodes staged source → evidence → claim →
   product (→ decision: a package version, and the decision-time snapshots recorded for it), the production and contest nodes as STEPS of
   the object they attach to, the gaps and unresolved edges PRESERVED. Each object node read again under the CALLER's rows: its clock, its
   later correction, its policy filtering (another domain's object the caller cannot read, a classification above the clearance, an
   audience-governed type — the label withheld and counted, the node kept). The missing intervals of the sources it rests on; the CHAPTER
   CONTINUITY through B81's shell.degraded_state (each such source's contract in force, or its undeclared degradation); the reconciliation
   items already routed. INCOMPLETE — with every reason — when any of these is found. SECURITY INVOKER. */
CREATE OR REPLACE FUNCTION graph.trace(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_clearance text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = graph, objects, observation, decision, executive, shell, pg_catalog, pg_temp AS $$
DECLARE
  x jsonb; v_nd jsonb; o objects.canonical_objects; v_rank int; v_nodes jsonb := '[]'::jsonb; v_steps jsonb := '[]'::jsonb; v_ref jsonb; v_stage text; v_q jsonb;
  v_clk jsonb; v_later jsonb; v_withheld jsonb := jsonb_build_object('classification', 0, 'audience', 0, 'not_visible', 0); v_label text; v_versions jsonb := '[]'::jsonb;
  v_sources uuid[]; v_missing jsonb; v_cont jsonb := '[]'::jsonb; s record; v_dg jsonb; v_snap jsonb := '[]'::jsonb; v_reasons jsonb := '[]'::jsonb; v_limits jsonb := '[]'::jsonb;
  v_unresolved jsonb; v_routed jsonb; v_clock_n int := 0; v_corr int := 0; v_now timestamptz := clock_timestamp(); v_obj_ids text[]; v_subject jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the trace of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'trace rejected (subject): a trace names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  IF p_clearance IS NULL OR graph.tl_rank(p_clearance, -1) < 0 THEN
    RAISE EXCEPTION 'trace rejected (clearance): the reader''s clearance is public, internal, confidential or restricted' USING ERRCODE = '22023';
  END IF;
  v_rank := graph.tl_rank(p_clearance, 0);
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = p_id AND c.object_type = p_type AND c.object_version = p_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trace rejected (unknown_object): no authorized % version % matches this link', p_type, p_version USING ERRCODE = '23503';
  END IF;
  IF graph.tl_rank(o.classification, 99) > v_rank THEN
    RAISE EXCEPTION 'trace rejected (clearance): the product is classified %, above the reader''s clearance %; its trace is not shown', o.classification, p_clearance USING ERRCODE = '42501';
  END IF;
  -- the product's own header facts (B81's ObjectHeader on the trace page): as recorded, with how many versions exist
  v_subject := jsonb_build_object('type', o.object_type, 'id', o.object_id, 'version', o.object_version,
    'title', left(coalesce(o.payload ->> 'title', o.payload ->> 'statement', o.payload ->> 'subject', o.payload ->> 'label', o.object_type || ' ' || o.object_id::text), 300),
    'header_only', o.object_type = ANY (graph.tl_audience_governed()), 'lifecycle', o.lifecycle_state, 'truth_state', o.truth_state, 'synthetic', o.synthetic_state,
    'classification', o.classification, 'owner', o.accountable_owner, 'recorded_at', graph.tl_iso(o.recorded_at), 'event_time', graph.tl_iso(o.event_time),
    'observed_at', graph.tl_iso(o.observation_time), 'valid_from', graph.tl_iso(o.valid_from), 'valid_to', graph.tl_iso(o.valid_to), 'digest', o.content_digest,
    'versions', (SELECT count(*) FROM objects.canonical_objects v WHERE v.object_id = o.object_id), 'latest', (SELECT max(v.object_version) FROM objects.canonical_objects v WHERE v.object_id = o.object_id));
  IF (v_subject ->> 'header_only')::boolean THEN
    v_subject := v_subject || jsonb_build_object('title', format('%s %s — its content is read through its own governed read (header only here)', o.object_type, left(o.object_id::text, 8)));
  END IF;
  x := graph.explain(p_tenant, p_domain, p_type, p_id, p_version);

  -- the object nodes, staged and read again under the caller's rows
  FOR v_nd IN SELECT * FROM jsonb_array_elements(x -> 'nodes') e WHERE e ->> 'node_id' LIKE 'obj:%' LOOP
    v_ref := graph.pv_ref(v_nd ->> 'ref');
    o := NULL;
    SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = (v_ref ->> 'id')::uuid AND c.object_version = (v_ref ->> 'version')::int AND c.object_type = v_ref ->> 'type';
    v_stage := CASE WHEN v_ref ->> 'type' IN ('DPK', 'DEC') THEN 'decision' WHEN v_nd ->> 'kind' IN ('source', 'evidence', 'claim', 'product') THEN v_nd ->> 'kind' ELSE 'product' END;
    v_label := v_nd ->> 'label'; v_clk := NULL; v_later := NULL; v_q := NULL;
    IF o.object_id IS NULL THEN
      v_label := 'not visible to you — recorded in another domain of the tenant, or outside your rows (the node is kept; its content is not shown)';
      v_withheld := jsonb_set(v_withheld, '{not_visible}', to_jsonb((v_withheld ->> 'not_visible')::int + 1));
    ELSE
      v_versions := v_versions || jsonb_build_object('id', o.object_id, 'version', o.object_version);
      IF graph.tl_rank(o.classification, 99) > v_rank THEN
        v_label := format('withheld — classified %s, above your clearance %s (the node is kept)', o.classification, p_clearance);
        v_withheld := jsonb_set(v_withheld, '{classification}', to_jsonb((v_withheld ->> 'classification')::int + 1));
      ELSIF o.object_type = ANY (graph.tl_audience_governed()) THEN
        v_label := format('%s %s — its content is read through its own governed read (header only here)', o.object_type, left(o.object_id::text, 8));
        v_withheld := jsonb_set(v_withheld, '{audience}', to_jsonb((v_withheld ->> 'audience')::int + 1));
      END IF;
      SELECT jsonb_agg(jsonb_build_object('axis', t.axis, 'kind', t.kind, 'clock_quality', t.clock_quality, 'conflicts', t.conflicts, 'instant', graph.tl_iso(t.instant),
                                          'earliest', graph.tl_iso(t.earliest), 'latest', graph.tl_iso(t.latest), 'precision', t.time_precision, 'zone', t.zone, 'source', t.source, 'declared', t.declared))
        INTO v_q FROM objects.time_qualifiers t WHERE t.object_id = o.object_id AND t.object_version = o.object_version;
      v_clk := graph.tl_clock(o.observation_time, o.recorded_at, o.source_clock_quality, v_q);
      IF v_clk ->> 'clock' <> 'trusted' THEN v_clock_n := v_clock_n + 1; END IF;
      SELECT jsonb_build_object('version', l.object_version, 'at', graph.tl_iso(l.recorded_at), 'by', coalesce(l.human_refs ->> 0, l.accountable_owner), 'lifecycle', l.lifecycle_state)
        INTO v_later FROM objects.canonical_objects l WHERE l.object_id = o.object_id AND l.object_version > o.object_version ORDER BY l.object_version LIMIT 1;
      IF v_later IS NOT NULL THEN v_corr := v_corr + 1; END IF;
    END IF;
    v_nodes := v_nodes || (v_nd || jsonb_build_object('stage', v_stage, 'label', v_label, 'visible', o.object_id IS NOT NULL,
      'event_time', graph.tl_iso(o.event_time), 'observed_at', graph.tl_iso(o.observation_time), 'valid_from', graph.tl_iso(o.valid_from), 'valid_to', graph.tl_iso(o.valid_to),
      'recorded_at', graph.tl_iso(o.recorded_at), 'time', v_q, 'clock', coalesce(v_clk ->> 'clock', 'unknown'), 'clock_flags', coalesce(v_clk -> 'flags', '[]'::jsonb),
      'clock_detail', coalesce(v_clk -> 'detail', '[]'::jsonb), 'corrected_later', v_later));
  END LOOP;
  -- the gap nodes (unresolved) are kept as nodes of their stage; the production / contest nodes are STEPS of the objects resting on them
  FOR v_nd IN SELECT * FROM jsonb_array_elements(x -> 'nodes') e WHERE e ->> 'node_id' LIKE 'gap:%' LOOP
    v_nodes := v_nodes || (v_nd || jsonb_build_object('stage', CASE WHEN v_nd ->> 'kind' = 'evidence' THEN 'evidence' ELSE 'source' END, 'visible', true, 'clock', 'unknown', 'clock_flags', '[]'::jsonb,
      'clock_detail', '[]'::jsonb, 'corrected_later', NULL));
  END LOOP;
  SELECT coalesce(jsonb_agg(e || jsonb_build_object('of', (SELECT coalesce(jsonb_agg(p ->> 'node_id'), '[]'::jsonb) FROM jsonb_array_elements(x -> 'nodes') p
                                                           WHERE p ->> 'node_id' LIKE 'obj:%' AND p -> 'parents' ? (e ->> 'node_id')))), '[]'::jsonb)
    INTO v_steps FROM jsonb_array_elements(x -> 'nodes') e WHERE e ->> 'node_id' NOT LIKE 'obj:%' AND e ->> 'node_id' NOT LIKE 'gap:%';
  SELECT coalesce(jsonb_agg(n ORDER BY CASE n ->> 'stage' WHEN 'source' THEN 0 WHEN 'evidence' THEN 1 WHEN 'claim' THEN 2 WHEN 'product' THEN 3 ELSE 4 END,
                               coalesce((n ->> 'depth')::int, 0) DESC, n ->> 'node_id'), '[]'::jsonb) INTO v_nodes FROM jsonb_array_elements(v_nodes) n;

  -- the unresolved edges, preserved (PR-22-005: "the unresolved edge preserved")
  SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO v_unresolved FROM jsonb_array_elements(x -> 'edges') e WHERE e ->> 'to' IS NULL AND e ->> 'resolution' IN ('unresolved');

  -- the decision-time snapshots of the packages in the trace
  SELECT array_agg(n ->> 'ref') INTO v_obj_ids FROM jsonb_array_elements(v_nodes) n WHERE n ->> 'stage' = 'decision';
  SELECT coalesce(jsonb_agg(jsonb_build_object('node_id', 'replay:' || r.replay_id, 'kind', 'decision_snapshot', 'stage', 'decision', 'ref', 'DPK:' || r.package_id || '@' || r.version,
           'label', format('the decision-time snapshot of version %s: known at %s, decided at %s, digest %s', r.version, graph.tl_iso(r.known_at), graph.tl_iso(r.decided_at), left(r.content_digest, 12)),
           'known_at', graph.tl_iso(r.known_at), 'decided_at', graph.tl_iso(r.decided_at), 'as_of', graph.tl_iso(r.as_of), 'content_digest', r.content_digest, 'replayed_at', graph.tl_iso(r.replayed_at),
           'unavailable', r.unavailable) ORDER BY r.replayed_at), '[]'::jsonb)
    INTO v_snap FROM decision.replays r WHERE ('DPK:' || r.package_id || '@' || r.version) = ANY (coalesce(v_obj_ids, ARRAY[]::text[]));

  -- the sources it rests on: their missing intervals and the chapter continuity (B81's degraded contracts)
  v_sources := graph.tl_linked_sources(p_tenant, p_domain, v_versions);
  v_missing := graph.tl_missing_intervals(p_tenant, p_domain, v_sources, '-infinity'::timestamptz, 'infinity'::timestamptz, v_now);
  SELECT coalesce(jsonb_agg(m), '[]'::jsonb) INTO v_missing FROM jsonb_array_elements(v_missing) m WHERE m ->> 'resolved_at' IS NULL;
  FOR s IN SELECT DISTINCT ON (c.source_id) c.source_id, c.source_key FROM observation.source_contracts_current c
            WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_id = ANY (v_sources) ORDER BY c.source_id, c.contract_version DESC LOOP
    v_dg := shell.degraded_state(p_tenant, p_domain, NULL, 'source', s.source_key);
    IF (v_dg ->> 'degraded')::boolean THEN
      v_cont := v_cont || jsonb_build_object('dependency', jsonb_build_object('kind', 'source', 'key', s.source_key), 'source_id', s.source_id,
        'contracts', (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM jsonb_array_elements(v_dg -> 'contracts') c WHERE (c ->> 'in_force')::boolean),
        'undeclared', v_dg -> 'undeclared', 'unavailable_functions', v_dg -> 'unavailable_functions');
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'state', i.state, 'outcome', i.outcome, 'owner', i.owner_principal_id, 'route_roles', to_jsonb(i.route_roles),
           'created_at', graph.tl_iso(i.created_at), 'version', (i.details ->> 'version')::int, 'problems', i.details -> 'problems') ORDER BY i.created_at), '[]'::jsonb)
    INTO v_routed FROM executive.attention_items i
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = graph.tl_attention_class() AND i.subject_id = p_id;

  -- THE REASONS a trace is incomplete (each said; the reconciliation routes exactly these)
  IF jsonb_array_length(x -> 'gaps') > 0 OR jsonb_array_length(v_unresolved) > 0 THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'broken_lineage', 'count', jsonb_array_length(x -> 'gaps'),
      'detail', (SELECT coalesce(jsonb_agg(DISTINCT g ->> 'kind'), '[]'::jsonb) FROM jsonb_array_elements(x -> 'gaps') g));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(x -> 'gaps') g WHERE g ->> 'kind' IN ('broken_custody', 'unverifiable_artifact')) THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'evidence_unavailable', 'count', (SELECT count(*) FROM jsonb_array_elements(x -> 'gaps') g WHERE g ->> 'kind' IN ('broken_custody', 'unverifiable_artifact')));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ? 'conflict') THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'time_conflict', 'count', (SELECT count(*) FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ? 'conflict'));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ?| ARRAY['observation_after_record', 'degraded']) THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'clock_divergence', 'count', (SELECT count(*) FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ?| ARRAY['observation_after_record', 'degraded']));
  END IF;
  -- an UNKNOWN source clock is the source's own stated limitation (an uploaded document's clock is unknown). B50 integration (DESIGN D20):
  -- it is STATED as a limitation of the trace, never a reason it is incomplete — nothing is missing that an owner could reconcile (a
  -- degraded clock or an observation after its record time stays clock_divergence, which is).
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ? 'unknown') THEN
    v_limits := v_limits || jsonb_build_object('limitation', 'clock_unknown', 'count', (SELECT count(*) FROM jsonb_array_elements(v_nodes) n WHERE n -> 'clock_flags' ? 'unknown'));
  END IF;
  IF jsonb_array_length(v_missing) > 0 THEN v_reasons := v_reasons || jsonb_build_object('reason', 'missing_interval', 'count', jsonb_array_length(v_missing)); END IF;
  IF jsonb_array_length(v_cont) > 0 THEN v_reasons := v_reasons || jsonb_build_object('reason', 'continuity_degraded', 'count', jsonb_array_length(v_cont)); END IF;
  IF (v_withheld ->> 'not_visible')::int + (v_withheld ->> 'classification')::int > 0 THEN
    v_reasons := v_reasons || jsonb_build_object('reason', 'policy_filtered', 'count', (v_withheld ->> 'not_visible')::int + (v_withheld ->> 'classification')::int);
  END IF;
  IF (x ->> 'truncated')::boolean THEN v_reasons := v_reasons || jsonb_build_object('reason', 'bounded', 'count', (x ->> 'examined')::int); END IF;

  RETURN jsonb_build_object(
    'method', graph.tl_method(), 'explain_method', x ->> 'method', 'ref', x ->> 'ref', 'root', x ->> 'root', 'read_at', graph.tl_iso(v_now), 'clearance', p_clearance,
    'product', x -> 'product', 'subject', v_subject, 'nodes', v_nodes, 'steps', v_steps, 'edges', x -> 'edges', 'unresolved_edges', v_unresolved, 'gaps', x -> 'gaps',
    'decision_snapshots', v_snap, 'sources', to_jsonb(v_sources), 'missing_intervals', v_missing, 'continuity',
    jsonb_build_object('state', CASE WHEN jsonb_array_length(v_cont) > 0 THEN 'degraded' ELSE 'normal' END, 'dependencies', v_cont,
                       'basis', 'shell.degraded_state of each source the trace rests on (B81 §DG): a contract in force, or a degradation no contract declares'),
    'disclosure', jsonb_build_object('withheld', jsonb_build_object('count', (v_withheld ->> 'classification')::int + (v_withheld ->> 'audience')::int + (v_withheld ->> 'not_visible')::int,
                                       'reason', CASE WHEN (v_withheld ->> 'classification')::int > 0 THEN 'classification' WHEN (v_withheld ->> 'audience')::int > 0 THEN 'audience' ELSE 'policy' END),
                                     'withheld_by_reason', v_withheld, 'clock_flags', v_clock_n, 'corrections_later', v_corr, 'truncated', (x ->> 'truncated')::boolean, 'examined', x -> 'examined'),
    'reasons', v_reasons, 'limitations', v_limits, 'incomplete', jsonb_array_length(v_reasons) > 0, 'reconciliation', v_routed, 'carried', x -> 'carried',
    'claim', 'the explanation projected source → evidence → claims → product: every unresolved edge kept, every filter counted, every clock divergence flagged; reading it records and changes nothing');
END $$;

-- §TL.5 THE RECONCILIATION ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- THE VOCABULARY, WIDENED BY UNION: the attention class `knowledge.trace_reconciliation` and the subject kind `canonical_object`. The list
-- function and the two CHECKs are read as they stand at this point of the fold and re-stated with §TL's entries appended — so §CL's
-- widening (correction_propagation_stall), folded before or after, is kept either way (copying 0115's literal here would drop it).
DO $$
DECLARE v_classes text[]; v_def text; v_vals text[];
BEGIN
  v_classes := executive.attention_signal_classes();
  IF NOT ('knowledge.trace_reconciliation' = ANY (v_classes)) THEN
    v_classes := v_classes || ARRAY['knowledge.trace_reconciliation'];   -- B50 tl: the trace reconciliation (PR-22-005)
    EXECUTE format('CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$ SELECT ARRAY[%s] $f$',
                   (SELECT string_agg(quote_literal(c), ', ' ORDER BY n) FROM unnest(v_classes) WITH ORDINALITY u(c, n)));
  END IF;
  -- the two CHECKs, re-stated as IN-lists (pg_get_constraintdef renders them ARRAY['…'::text, …] again, so a later union reads them the same way)
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = 'executive.attention_items'::regclass AND c.conname = 'attention_items_signal_class_check';
  SELECT array_agg(r.m[1] ORDER BY r.n) INTO v_vals FROM regexp_matches(v_def, '''([^'']+)''', 'g') WITH ORDINALITY r(m, n);
  IF NOT ('knowledge.trace_reconciliation' = ANY (v_vals)) THEN
    v_vals := v_vals || ARRAY['knowledge.trace_reconciliation'];
    ALTER TABLE executive.attention_items DROP CONSTRAINT attention_items_signal_class_check;
    EXECUTE format('ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (%s))',
                   (SELECT string_agg(quote_literal(c), ', ' ORDER BY n) FROM unnest(v_vals) WITH ORDINALITY u(c, n)));
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = 'executive.attention_items'::regclass AND c.conname = 'attention_items_subject_kind_check';
  SELECT array_agg(r.m[1] ORDER BY r.n) INTO v_vals FROM regexp_matches(v_def, '''([^'']+)''', 'g') WITH ORDINALITY r(m, n);
  IF NOT ('canonical_object' = ANY (v_vals)) THEN
    v_vals := v_vals || ARRAY['canonical_object'];
    ALTER TABLE executive.attention_items DROP CONSTRAINT attention_items_subject_kind_check;
    EXECUTE format('ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (%s))',
                   (SELECT string_agg(quote_literal(c), ', ' ORDER BY n) FROM unnest(v_vals) WITH ORDINALITY u(c, n)));
  END IF;
END $$;

/* ROUTE THE RECONCILIATION of an incomplete trace (PR-22-005 "reconciliation routed"): the PORT reads the trace itself (never the caller's
   claim of a problem) and refuses a complete one; it raises ONE attention item per (product version, problem set) — a repeat answers the
   item it made — owned by the product's accountable owner when that owner is an active person of the tenant (else the knowledge roles are
   accountable), evaluated under the domain's ACTIVE attention policy (no rule for the class: abstained → deprioritized, still visible and
   owned). The requester: a person — the product's owner, a knowledge owner, a data steward, a record authority, an analyst or a domain
   administrator; re-checked here. Nothing in the product changes: the reconciliation is the owner's to do. */
CREATE OR REPLACE FUNCTION graph.route_trace_reconciliation(p_item_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_note text,
                                                            p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, governance, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); o objects.canonical_objects; t jsonb; v_problems jsonb; v_cause uuid; v_owner uuid; x executive.attention_items%ROWTYPE;
        pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.timeline.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'trace reconciliation rejected (actor): the reconciliation is routed by the acting principal' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'trace reconciliation rejected (actor): a reconciliation is routed by a person, never an agent' USING ERRCODE = '42501';
  END IF;
  IF p_item_id IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'trace reconciliation rejected (request): the request names its item id and its correlation' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN
    RAISE EXCEPTION 'trace reconciliation rejected (reason): the request says what the owner should reconcile (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = p_id AND c.object_type = p_type AND c.object_version = p_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trace reconciliation rejected (unknown_object): no % version % of this domain matches', p_type, p_version USING ERRCODE = '23503';
  END IF;
  v_owner := graph.pv_owner(o.accountable_owner);
  IF NOT (v_actor IS NOT DISTINCT FROM v_owner
          OR governance.holds_role(v_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'data_steward', 'record_authority', 'domain_analyst', 'domain_admin'])) THEN
    RAISE EXCEPTION 'trace reconciliation rejected (authority): a reconciliation is routed by the product''s owner, a knowledge owner, a data steward, a record authority, an analyst or a domain administrator' USING ERRCODE = '42501';
  END IF;
  t := graph.trace(p_tenant, p_domain, p_type, p_id, p_version, 'restricted');
  IF NOT (t ->> 'incomplete')::boolean THEN
    RAISE EXCEPTION 'trace reconciliation rejected (state): the trace of % v% is complete — nothing is routed for reconciliation', p_type, p_version USING ERRCODE = '22023';
  END IF;
  v_problems := t -> 'reasons';
  v_cause := md5(p_type || ':' || p_id || '@' || p_version || '|' || v_problems::text)::uuid;
  SELECT * INTO x FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = graph.tl_attention_class() AND i.subject_id = p_id AND i.cause_event_id = v_cause;
  IF FOUND THEN
    RETURN jsonb_build_object('item_id', x.item_id, 'repeated', true, 'state', x.state, 'outcome', x.outcome, 'owner', x.owner_principal_id, 'route_roles', to_jsonb(x.route_roles),
                              'problems', x.details -> 'problems', 'ref', p_type || ':' || p_id || '@' || p_version);
  END IF;
  v_owner := CASE WHEN v_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v_owner AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN v_owner END;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, graph.tl_attention_class(),
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, graph.tl_attention_class(), v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, graph.tl_attention_class(), 'canonical_object', p_id, v_cause, 'TraceIncomplete',
          left(format('Reconcile the trace of %s v%s: %s', p_type, p_version, (SELECT string_agg(r ->> 'reason', ', ') FROM jsonb_array_elements(v_problems) r)), 512),
          v_eval ->> 'outcome', v_state, v_owner,
          CASE WHEN v_owner IS NULL AND jsonb_array_length(coalesce(v_route -> 'route_roles', '[]'::jsonb)) = 0 THEN ARRAY['knowledge_owner', 'data_steward']
               ELSE ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')) END,
          pol.policy_id, pol.version, v_eval,
          jsonb_build_object('ref', p_type || ':' || p_id || '@' || p_version, 'type', p_type, 'id', p_id, 'version', p_version, 'problems', v_problems, 'note', btrim(p_note),
                             'unresolved_edges', t -> 'unresolved_edges', 'missing_intervals', t -> 'missing_intervals', 'continuity', t -> 'continuity', 'requested_by', v_actor,
                             'accountable_owner', o.accountable_owner, 'method', graph.tl_method()),
          (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
  PERFORM executive.attention_event(p_item_id, p_tenant, p_domain,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
            v_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                        'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'TraceIncomplete', 'problems', v_problems), p_correlation);
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item_id;
  RETURN jsonb_build_object('item_id', x.item_id, 'repeated', false, 'state', x.state, 'outcome', x.outcome, 'owner', x.owner_principal_id, 'route_roles', to_jsonb(x.route_roles),
                            'problems', v_problems, 'ref', p_type || ':' || p_id || '@' || p_version, 'evaluation', v_eval);
END $$;

-- §TL.6 GRANTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION graph.tl_method(), graph.tl_axes(), graph.tl_attention_class(), graph.tl_iso(timestamptz), graph.tl_rank(text, int), graph.tl_audience_governed(),
                       graph.tl_ref_uuid(text), graph.tl_try_ts(text), graph.tl_clock(timestamptz, timestamptz, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.tl_method(), graph.tl_axes(), graph.tl_attention_class(), graph.tl_iso(timestamptz), graph.tl_rank(text, int), graph.tl_audience_governed(),
                          graph.tl_ref_uuid(text), graph.tl_try_ts(text), graph.tl_clock(timestamptz, timestamptz, text, jsonb) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION graph.tl_cite_state(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.tl_cite_state(uuid, uuid, text) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION graph.tl_missing_intervals(uuid, uuid, uuid[], timestamptz, timestamptz, timestamptz), graph.tl_linked_sources(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.tl_missing_intervals(uuid, uuid, uuid[], timestamptz, timestamptz, timestamptz), graph.tl_linked_sources(uuid, uuid, jsonb) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION graph.timeline(uuid, uuid, text, uuid, text, timestamptz, timestamptz, text, timestamptz, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.timeline(uuid, uuid, text, uuid, text, timestamptz, timestamptz, text, timestamptz, text, int) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION graph.trace(uuid, uuid, text, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.trace(uuid, uuid, text, uuid, int, text) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION graph.route_trace_reconciliation(uuid, uuid, uuid, text, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.route_trace_reconciliation(uuid, uuid, uuid, text, uuid, int, text, uuid, uuid) TO eye_commit;
