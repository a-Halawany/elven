-- 0048 · Phase 6 — the seven findings of the independent review of PR #46 at 09abd095, corrected
-- at the ports (PHASE6_REPORT.md §11). Forward migration: nothing in 0041–0047 is rewritten;
-- every function here is replaced whole (or, where its return type changes, dropped and
-- created anew), and every earlier record keeps the digest it was recorded with.
--
--   §1  eligibility is CURRENT: a revoked role binding is no binding (approver_eligibility, holds_role)
--   §2  set_option binds its inputs itself: identity and digest, known_at, observed_through, the
--       run's own cut-offs; uncertainty, controls and synthetic state are derived from the records
--   §3  set_choice: an outcome criterion names the element it is observed on (observed_on = twin:<key>)
--   §4  record_outcome: the criterion's element, the decision's twin, a period ending by the
--       criterion's date, an observation that entered after the decision
--   §5  compose_briefing: the prior is bound by its KNOWN_AT — the next briefing covers
--       (prior.known_at, known_at]; the watermark names it
--   §6  replay_layers: the observed layer reads warning state and OUT status AS OF as_of
--   §7  agents: stop conditions are validated at registration; the run session port looks the
--       registration up itself under the identity-operation capability (no borrowed reader)
-- ============================================================

-- ============================================================
-- 1. Eligibility is current.
-- ============================================================
CREATE OR REPLACE FUNCTION decision.approver_eligibility(p_principal uuid, p_tenant uuid, p_domain uuid, p_policy jsonb) RETURNS text
STABLE SECURITY DEFINER SET search_path = decision, identity, pg_catalog, pg_temp AS $$
DECLARE r text;
BEGIN
  IF NOT decision.is_active_human(p_principal, p_tenant) THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_policy -> 'principals', '[]'::jsonb)) a WHERE a = p_principal::text) THEN RETURN 'principal'; END IF;
  SELECT b.role_code INTO r FROM identity.role_bindings b
   WHERE b.principal_id = p_principal AND b.tenant_id = p_tenant AND b.revoked_at IS NULL
     AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT')
     AND b.role_code IN (SELECT jsonb_array_elements_text(coalesce(p_policy -> 'roles', '[]'::jsonb)))
   ORDER BY 1 LIMIT 1;
  IF r IS NOT NULL THEN RETURN 'role:' || r; END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decision.holds_role(p_principal uuid, p_tenant uuid, p_domain uuid, p_role text) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_principal AND b.role_code = p_role AND b.tenant_id = p_tenant
                   AND b.revoked_at IS NULL AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'));
$$ LANGUAGE sql;

-- ============================================================
-- 2. The option binds its inputs at the port.
-- ============================================================
/* The classification rank the fold uses; an unknown level is restricted (the shape of simulation.classification_rank). */
CREATE OR REPLACE FUNCTION decision.classification_rank(p text) RETURNS int
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p WHEN 'public' THEN 0 WHEN 'internal' THEN 1 WHEN 'confidential' THEN 2 WHEN 'restricted' THEN 3 ELSE 3 END;
$$ LANGUAGE sql;

/* Fold the controls of a set of inputs (jsonb array of {synthetic_state, classification, rights_profile, residency_profile, retention_profile, access_policy_ref}) — the shape of prediction/controls.ts foldControls. */
CREATE OR REPLACE FUNCTION decision.fold_controls(p_inputs jsonb) RETURNS jsonb
IMMUTABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  WITH i AS (SELECT x FROM jsonb_array_elements(coalesce(p_inputs, '[]'::jsonb)) x),
  cls AS (SELECT CASE WHEN jsonb_typeof(x -> 'classification') = 'string' THEN x ->> 'classification' ELSE 'restricted' END c FROM i),
  best AS (SELECT c FROM cls ORDER BY decision.classification_rank(c) DESC, c LIMIT 1),
  prof AS (
    SELECT k, string_agg(v, '; ' ORDER BY v) v FROM (
      SELECT DISTINCT k, x ->> k v FROM i, unnest(ARRAY['rights_profile', 'residency_profile', 'retention_profile', 'access_policy_ref']) k
       WHERE jsonb_typeof(x -> k) = 'string' AND length(x ->> k) > 0) d GROUP BY k)
  SELECT CASE WHEN (SELECT count(*) FROM i) = 0 THEN
    jsonb_build_object('synthetic_state', true, 'classification', 'restricted', 'rights_profile', NULL, 'residency_profile', NULL, 'retention_profile', NULL, 'access_policy_ref', NULL, 'inputs', 0)
  ELSE jsonb_build_object(
    'synthetic_state', (SELECT bool_or(NOT (jsonb_typeof(x -> 'synthetic_state') = 'boolean' AND (x ->> 'synthetic_state')::boolean = false)) FROM i),
    'classification', CASE WHEN (SELECT decision.classification_rank(c) FROM best) = 3 THEN 'restricted' ELSE (SELECT c FROM best) END,
    'rights_profile', (SELECT v FROM prof WHERE k = 'rights_profile'), 'residency_profile', (SELECT v FROM prof WHERE k = 'residency_profile'),
    'retention_profile', (SELECT v FROM prof WHERE k = 'retention_profile'), 'access_policy_ref', (SELECT v FROM prof WHERE k = 'access_policy_ref'),
    'inputs', (SELECT count(*) FROM i)) END;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.classification_rank(text) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION decision.fold_controls(jsonb) TO eye_app, eye_commit;

DROP FUNCTION decision.set_option(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,boolean,text,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid);
/*
 * The option's consequences are BOUND here: each citation names a recorded object of its kind,
 * at the version and digest recorded; it was recorded by the version's known_at and its event falls
 * by observed_through; a cited run is completed (it may complete after known_at) and rests on inputs
 * — its twin version's known_at and observed_through — that obey the version's cut-offs. Uncertainty,
 * controls and synthetic state are DERIVED from those records; the caller's p_uncertainty, p_controls,
 * p_synthetic and p_simulated are not consulted. Returns what was derived.
 */
CREATE FUNCTION decision.set_option(
  p_option_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_key text, p_title text, p_kind text,
  p_consequences jsonb, p_simulated boolean, p_unsimulated_reason text, p_uncertainty jsonb, p_second_order jsonb, p_risks jsonb, p_opportunities jsonb,
  p_reversibility text, p_synthetic boolean, p_controls jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, simulation, twin, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v record; c jsonb; o record; r record; tv record; tw record;
  v_type text; v_basis jsonb := '[]'::jsonb; v_inputs jsonb := '[]'::jsonb; v_b jsonb; v_simulated boolean := false;
  v_uncertainty jsonb; v_controls jsonb; v_synthetic boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.option', 'decision.package.draft']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'option rejected: no such package version in this domain' USING ERRCODE = '23503'; END IF;
  IF v.state <> 'draft' THEN RAISE EXCEPTION 'option rejected: version % is % and immutable; open a new version', p_version, v.state USING ERRCODE = '2F002'; END IF;
  IF NOT decision.citations_ok(p_consequences) THEN RAISE EXCEPTION 'option rejected: consequences must be typed citations with id, version and digest' USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_consequences) LOOP
    v_type := CASE c ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' WHEN 'warning' THEN 'WRN' END;
    IF v_type IS NULL THEN RAISE EXCEPTION 'option rejected: consequence kind % is not one an option cites', c ->> 'kind' USING ERRCODE = '22023'; END IF;
    SELECT * INTO o FROM objects.canonical_objects x
     WHERE x.object_type = v_type AND x.object_id = (c ->> 'id')::uuid AND x.object_version = (c ->> 'version')::int AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'option rejected: citation %@% is not a recorded % in this domain', c ->> 'id', c ->> 'version', v_type USING ERRCODE = '23503'; END IF;
    IF o.content_digest IS DISTINCT FROM (c ->> 'digest') THEN
      RAISE EXCEPTION 'option rejected: citation %@% carries digest %, not the recorded digest %', c ->> 'id', c ->> 'version', c ->> 'digest', o.content_digest USING ERRCODE = '22023';
    END IF;
    IF o.lifecycle_state IN ('withdrawn', 'deleted') THEN RAISE EXCEPTION 'option rejected: citation %@% is %; a consequence cannot rest on it', c ->> 'id', c ->> 'version', o.lifecycle_state USING ERRCODE = '22023'; END IF;
    IF v_type <> 'SIM' THEN
      IF o.recorded_at > v.known_at THEN
        RAISE EXCEPTION 'option rejected: citation %@% was recorded at %, after the version''s known_at %', c ->> 'id', c ->> 'version', decision.iso(o.recorded_at), decision.iso(v.known_at) USING ERRCODE = '22023';
      END IF;
      IF v.observed_through IS NOT NULL AND o.event_time IS NOT NULL AND o.event_time::date > v.observed_through THEN
        RAISE EXCEPTION 'option rejected: citation %@% has event time %, after the version''s observed_through %', c ->> 'id', c ->> 'version', decision.iso(o.event_time), v.observed_through USING ERRCODE = '22023';
      END IF;
      v_b := jsonb_build_object('kind', c ->> 'kind', 'id', c ->> 'id', 'version', (c ->> 'version')::int, 'digest', o.content_digest, 'object_type', v_type,
                                'truth_state', o.truth_state, 'synthetic_state', o.synthetic_state, 'lifecycle_state', o.lifecycle_state, 'quality_state', o.quality_state,
                                'classification', o.classification, 'recorded_at', decision.iso(o.recorded_at), 'event_time', decision.iso(o.event_time));
    ELSE
      SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = (c ->> 'id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND OR r.state <> 'completed' THEN RAISE EXCEPTION 'option rejected: run % is not a completed run in this domain', c ->> 'id' USING ERRCODE = '23503'; END IF;
      IF r.known_at > v.known_at THEN
        RAISE EXCEPTION 'option rejected: run % rests on inputs known at %, after the version''s known_at %; a run may complete later, its inputs may not', c ->> 'id', decision.iso(r.known_at), decision.iso(v.known_at) USING ERRCODE = '22023';
      END IF;
      IF v.observed_through IS NOT NULL AND r.observed_through IS NOT NULL AND r.observed_through > v.observed_through THEN
        RAISE EXCEPTION 'option rejected: run % rests on observations through %, after the version''s observed_through %', c ->> 'id', r.observed_through, v.observed_through USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'option rejected: no consequence cites a completed run; say why the option is unsimulated' USING ERRCODE = '22023';
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
  INSERT INTO decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason,
                                uncertainty, second_order, risks, opportunities, reversibility, synthetic_state, controls, set_by, correlation_id)
  VALUES (p_option_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_key, p_title, p_kind, p_consequences, v_simulated, CASE WHEN v_simulated THEN NULL ELSE p_unsimulated_reason END,
          v_uncertainty, coalesce(p_second_order, '[]'::jsonb), coalesce(p_risks, '[]'::jsonb), coalesce(p_opportunities, '[]'::jsonb),
          p_reversibility, v_synthetic, v_controls, p_actor, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'option.set', p_actor,
          jsonb_build_object('version', p_version, 'key', p_key, 'kind', p_kind, 'simulated', v_simulated, 'consequences', p_consequences, 'derived_at_port', true), p_correlation);
  RETURN jsonb_build_object('uncertainty', v_uncertainty, 'controls', v_controls, 'synthetic_state', v_synthetic, 'simulated', v_simulated);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.set_option(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,boolean,text,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.set_option(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,boolean,text,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 3. The choice: an outcome criterion names the element it is observed on.
-- ============================================================
CREATE OR REPLACE FUNCTION decision.set_choice(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_choice jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; k jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.choice']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT v.state INTO v_state FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'choice rejected: no such package version in this domain' USING ERRCODE = '23503'; END IF;
  IF v_state <> 'draft' THEN RAISE EXCEPTION 'choice rejected: version % is % and immutable; a different choice is a new version', p_version, v_state USING ERRCODE = '2F002'; END IF;
  IF p_choice IS NULL OR jsonb_typeof(p_choice) <> 'object' THEN RAISE EXCEPTION 'choice rejected: the choice must be an object' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = (p_choice ->> 'option_key')) THEN
    RAISE EXCEPTION 'choice rejected: option % is not an option of this version', p_choice ->> 'option_key' USING ERRCODE = '23503';
  END IF;
  IF length(btrim(coalesce(p_choice ->> 'rationale', ''))) < 8 THEN RAISE EXCEPTION 'choice rejected: the rationale is the human''s own words, at least eight characters' USING ERRCODE = '22023'; END IF;
  IF (p_choice ->> 'decision_deadline') IS NULL OR (p_choice ->> 'decision_deadline') !~ '^\d{4}-\d{2}-\d{2}' THEN RAISE EXCEPTION 'choice rejected: decision_deadline must be a date' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_choice -> 'accepted_trade_offs') <> 'array' THEN RAISE EXCEPTION 'choice rejected: accepted_trade_offs must be an array' USING ERRCODE = '22023'; END IF;
  IF NOT decision.is_active_human((p_choice ->> 'action_owner')::uuid, p_tenant) THEN RAISE EXCEPTION 'choice rejected: action_owner must be a named, active human principal in this tenant' USING ERRCODE = '23503'; END IF;
  IF jsonb_typeof(p_choice -> 'outcome_criteria') <> 'array' OR jsonb_array_length(p_choice -> 'outcome_criteria') = 0 THEN
    RAISE EXCEPTION 'choice rejected: at least one measurable outcome criterion is required' USING ERRCODE = '22023';
  END IF;
  FOR k IN SELECT * FROM jsonb_array_elements(p_choice -> 'outcome_criteria') LOOP
    IF jsonb_typeof(k) <> 'object' OR NOT (k ? 'key' AND k ? 'quantity' AND k ? 'unit' AND k ? 'target' AND k ? 'comparator' AND k ? 'by' AND k ? 'observed_on') THEN
      RAISE EXCEPTION 'choice rejected: each outcome criterion carries key, quantity, unit, target, comparator, by and observed_on' USING ERRCODE = '22023';
    END IF;
    IF NOT ((k ->> 'comparator') IN ('<=', '>=', '=', '<', '>')) THEN RAISE EXCEPTION 'choice rejected: comparator must be one of <=, >=, =, <, >' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(k -> 'target') <> 'number' THEN RAISE EXCEPTION 'choice rejected: an outcome target is a number' USING ERRCODE = '22023'; END IF;
    IF (k ->> 'by') !~ '^\d{4}-\d{2}-\d{2}' THEN RAISE EXCEPTION 'choice rejected: an outcome criterion''s by is a date' USING ERRCODE = '22023'; END IF;
    IF (k ->> 'observed_on') !~ '^twin:[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' THEN
      RAISE EXCEPTION 'choice rejected: criterion % is observed on a twin element, named twin:<element key> (observed_on)', k ->> 'key' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT k2 ->> 'key') FROM jsonb_array_elements(p_choice -> 'outcome_criteria') k2) <> jsonb_array_length(p_choice -> 'outcome_criteria') THEN
    RAISE EXCEPTION 'choice rejected: outcome criteria carry distinct keys' USING ERRCODE = '22023';
  END IF;
  UPDATE decision.package_versions SET choice = p_choice WHERE package_id = p_package_id AND version = p_version;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'choice.set', p_actor, jsonb_build_object('version', p_version, 'option_key', p_choice ->> 'option_key', 'action_owner', p_choice ->> 'action_owner'), p_correlation);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 4. The outcome is bound to the approved criterion.
-- ============================================================
CREATE OR REPLACE FUNCTION decision.record_outcome(
  p_outcome_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_criterion_key text, p_twin_id uuid, p_twin_version int, p_element_key text, p_reconciliation_id uuid,
  p_title text, p_statement text, p_header_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, twin, simulation, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; crit jsonb; e twin.state_elements%ROWTYPE; tv record; rc record; fc jsonb; v_runs uuid[]; v_twins uuid[]; v_simulated boolean; v_value numeric; v_target numeric; v_met boolean; v_sim jsonb; v_cmt uuid; v_rec timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.outcome']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'outcome rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'outcome rejected: an outcome is recorded by a named, active human' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outcome rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.state NOT IN ('committed', 'monitoring') THEN RAISE EXCEPTION 'outcome rejected: package is %; outcomes are recorded on a committed decision', p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id;
  v_cmt := c.commitment_id;
  IF p_actor <> p.owner_principal_id AND p_actor::text IS DISTINCT FROM (v.choice ->> 'action_owner') THEN
    RAISE EXCEPTION 'outcome rejected: an outcome is recorded by the package owner or the choice''s action owner' USING ERRCODE = '42501';
  END IF;
  SELECT k INTO crit FROM jsonb_array_elements(v.choice -> 'outcome_criteria') k WHERE (k ->> 'key') = p_criterion_key;
  IF crit IS NULL THEN RAISE EXCEPTION 'outcome rejected: % is not an outcome criterion of the approved choice', p_criterion_key USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM decision.outcomes o WHERE o.package_id = p_package_id AND o.version = v.version AND o.criterion_key = p_criterion_key) THEN
    RAISE EXCEPTION 'outcome rejected: criterion % already has its outcome; nothing is overwritten', p_criterion_key USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM twin.state_elements x WHERE x.twin_id = p_twin_id AND x.version = p_twin_version AND x.key = p_element_key AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'outcome rejected: no element % in twin %@%', p_element_key, p_twin_id, p_twin_version USING ERRCODE = '23503'; END IF;
  IF e.kind <> 'observed' OR e.health <> 'complete' THEN RAISE EXCEPTION 'outcome rejected: % in twin %@% is % (%), not a complete OBSERVED element', p_element_key, p_twin_id, p_twin_version, e.kind, e.health USING ERRCODE = '22023'; END IF;
  SELECT * INTO tv FROM twin.twin_versions x WHERE x.twin_id = p_twin_id AND x.version = p_twin_version;
  IF NOT FOUND OR tv.state <> 'admitted' THEN RAISE EXCEPTION 'outcome rejected: twin version % is not admitted', p_twin_version USING ERRCODE = '22023'; END IF;
  IF e.unit IS DISTINCT FROM (crit ->> 'unit') THEN RAISE EXCEPTION 'outcome rejected: the observed element is in %, the criterion in %; same quantity, same unit', coalesce(e.unit, 'no unit'), crit ->> 'unit' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(e.value) <> 'number' THEN RAISE EXCEPTION 'outcome rejected: the observed value is not a number' USING ERRCODE = '22023'; END IF;
  -- THE ELEMENT THE CRITERION NAMES: observed_on = twin:<key>, bound at the choice
  IF (crit ->> 'observed_on') IS DISTINCT FROM ('twin:' || p_element_key) THEN
    RAISE EXCEPTION 'outcome rejected: criterion % is observed on % (observed_on); element % was offered', p_criterion_key, coalesce(crit ->> 'observed_on', 'nothing'), p_element_key USING ERRCODE = '22023';
  END IF;
  -- THE DECISION'S TWIN: the twins the version's options ran on, when any option was simulated
  SELECT coalesce(array_agg(DISTINCT r.twin_id), ARRAY[]::uuid[]) INTO v_twins
    FROM decision.options o, jsonb_array_elements(o.consequences) x JOIN simulation.runs_current r ON r.run_id = (x ->> 'id')::uuid
   WHERE o.package_id = p_package_id AND o.version = v.version AND (x ->> 'kind') = 'run';
  IF array_length(v_twins, 1) IS NOT NULL AND NOT (p_twin_id = ANY (v_twins)) THEN
    RAISE EXCEPTION 'outcome rejected: twin % is not a twin the decision''s options rest on', p_twin_id USING ERRCODE = '22023';
  END IF;
  -- THE PERIOD: the observation states its period and it ends by the criterion's date
  IF e.valid_to IS NULL THEN RAISE EXCEPTION 'outcome rejected: the observed element states no period (valid_to); the criterion is judged over a period ending by %', crit ->> 'by' USING ERRCODE = '22023'; END IF;
  IF e.valid_to > (crit ->> 'by')::date THEN
    RAISE EXCEPTION 'outcome rejected: the observed period ends %, after the criterion''s date % (by)', e.valid_to, crit ->> 'by' USING ERRCODE = '22023';
  END IF;
  -- THE CHRONOLOGY: the observation entered after the decision — its twin version, and the evidence it cites, were recorded after decided_at
  IF tv.known_at <= p.decided_at THEN
    RAISE EXCEPTION 'outcome rejected: the observation was known at %, before the decision at % (decided_at); an outcome is observed after the decision', decision.iso(tv.known_at), decision.iso(p.decided_at) USING ERRCODE = '22023';
  END IF;
  FOR fc IN SELECT * FROM jsonb_array_elements(e.citations) LOOP
    IF (fc ->> 'kind') = 'evidence' THEN
      SELECT recorded_at INTO v_rec FROM objects.canonical_objects x WHERE x.object_type = 'EVD' AND x.object_id = (fc ->> 'id')::uuid AND x.object_version = coalesce((fc ->> 'version')::int, 1);
      IF v_rec IS NOT NULL AND v_rec <= p.decided_at THEN
        RAISE EXCEPTION 'outcome rejected: the cited evidence %@% was recorded at %, before the decision at %; an already-known observation is not an outcome', fc ->> 'id', coalesce(fc ->> 'version', '1'), decision.iso(v_rec), decision.iso(p.decided_at) USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  v_value := (e.value #>> '{}')::numeric; v_target := (crit ->> 'target')::numeric;
  v_met := CASE crit ->> 'comparator' WHEN '<=' THEN v_value <= v_target WHEN '>=' THEN v_value >= v_target WHEN '=' THEN v_value = v_target WHEN '<' THEN v_value < v_target WHEN '>' THEN v_value > v_target END;
  -- was the chosen option simulated? then the reconciliation of the chosen run's simulated element against THIS observed element is required
  SELECT coalesce(array_agg((x ->> 'id')::uuid), ARRAY[]::uuid[]) INTO v_runs
    FROM decision.options o, jsonb_array_elements(o.consequences) x
   WHERE o.package_id = p_package_id AND o.version = v.version AND o.key = (v.choice ->> 'option_key') AND (x ->> 'kind') = 'run';
  v_simulated := array_length(v_runs, 1) IS NOT NULL;
  IF v_simulated THEN
    IF p_reconciliation_id IS NULL THEN
      RAISE EXCEPTION 'outcome rejected: the chosen option was simulated; record the reconciliation of the chosen run''s simulated element against this observed element first, and cite it' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO rc FROM twin.reconciliations x WHERE x.reconciliation_id = p_reconciliation_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'outcome rejected: no such reconciliation in this domain' USING ERRCODE = '23503'; END IF;
    IF rc.twin_id <> p_twin_id OR rc.key <> p_element_key OR rc.against_version <> p_twin_version OR rc.from_kind <> 'simulated' THEN
      RAISE EXCEPTION 'outcome rejected: reconciliation % does not compare a simulated element against %@%/%', p_reconciliation_id, p_twin_id, p_twin_version, p_element_key USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(rc.from_citations) fc2 WHERE (fc2 ->> 'kind') = 'run' AND (fc2 ->> 'id')::uuid = ANY (v_runs)) THEN
      RAISE EXCEPTION 'outcome rejected: the reconciled simulated element does not cite a run of the chosen option %', v.choice ->> 'option_key' USING ERRCODE = '22023';
    END IF;
    v_sim := jsonb_build_object('twin_id', rc.twin_id, 'version', rc.from_version, 'key', rc.key, 'value', rc.from_value, 'citations', rc.from_citations, 'difference', rc.difference);
  ELSIF p_reconciliation_id IS NOT NULL THEN
    RAISE EXCEPTION 'outcome rejected: the chosen option was not simulated; no reconciliation applies' USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, parent_objective_id, owner_principal_id, correlation_id)
  VALUES (p_outcome_id, 'DOMAIN', p_tenant, p_domain, 'OUT', 1, p_title, p_statement, 'active', 'not_applicable', NULL, p_actor, p_correlation);
  INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_outcome_id, 'strategy.declared', p_actor,
          jsonb_build_object('object_type', 'OUT', 'title', p_title, 'version', 1, 'status', 'active', 'via', 'decision.outcome', 'package_id', p_package_id, 'criterion_key', p_criterion_key, 'met', v_met), p_correlation);
  INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id) VALUES
    (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_outcome_id, 'OUT', 'strategy', v_cmt, format('the outcome of commitment %s on criterion %s', v_cmt, p_criterion_key), 'active', p_actor, p_correlation),
    (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_outcome_id, 'OUT', 'twin', p_twin_id, format('observed on twin %s version %s element %s', p_twin_id, p_twin_version, p_element_key), 'active', p_actor, p_correlation);
  IF v_simulated THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_outcome_id, 'OUT', 'run', rid, 'the simulated consequence the outcome is reconciled against', 'active', p_actor, p_correlation FROM unnest(v_runs) rid;
  END IF;
  INSERT INTO decision.outcomes (outcome_id, scope, tenant_id, domain_id, package_id, version, criterion_key, criterion, observed_value, unit, target, comparator, met, observed_on, simulated, reconciliation_id, header_digest, recorded_by, correlation_id)
  VALUES (p_outcome_id, 'DOMAIN', p_tenant, p_domain, p_package_id, v.version, p_criterion_key, crit, e.value, e.unit, v_target, crit ->> 'comparator', v_met,
          jsonb_build_object('twin_id', p_twin_id, 'version', p_twin_version, 'key', p_element_key, 'element_id', e.element_id, 'citations', e.citations, 'valid_from', e.valid_from, 'valid_to', e.valid_to, 'known_at', decision.iso(tv.known_at)),
          v_sim, p_reconciliation_id, p_header_digest, p_actor, p_correlation);
  UPDATE decision.packages_current SET state = 'monitoring' WHERE package_id = p_package_id AND state = 'committed';
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'outcome.recorded', p_actor,
          jsonb_build_object('version', v.version, 'outcome_id', p_outcome_id, 'criterion_key', p_criterion_key, 'observed_value', e.value, 'target', v_target, 'comparator', crit ->> 'comparator', 'met', v_met, 'reconciliation_id', p_reconciliation_id), p_correlation);
  RETURN jsonb_build_object('outcome_id', p_outcome_id, 'met', v_met, 'observed_value', e.value, 'target', v_target, 'comparator', crit ->> 'comparator', 'simulated', v_sim, 'reconciliation_id', p_reconciliation_id);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 5. The briefing's prior is bound by its known_at.
-- ============================================================
CREATE OR REPLACE FUNCTION executive.compose_briefing(
  p_briefing_id uuid, p_tenant uuid, p_domain uuid, p_room_id uuid, p_package_id uuid, p_composer uuid, p_via text, p_agent_id uuid, p_known_at timestamptz,
  p_prior uuid, p_watermark jsonb, p_sources jsonb, p_items jsonb, p_windows jsonb, p_source_states jsonb, p_degraded boolean,
  p_narrative text, p_narrative_cites jsonb, p_content_digest text, p_header_digest text, p_controls jsonb, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; pr record; c jsonb; v_ids jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['briefing.compose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_composer IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'briefing rejected: composed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_via = 'agent' THEN
    IF NOT EXISTS (SELECT 1 FROM executive.agents a WHERE a.agent_id = p_agent_id AND a.principal_id = p_composer AND a.agent_kind = 'briefing' AND a.status = 'active' AND a.tenant_id = p_tenant AND a.domain_id = p_domain) THEN
      RAISE EXCEPTION 'briefing rejected: the composing principal is not an active briefing agent of this domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_via <> 'human' THEN
    RAISE EXCEPTION 'briefing rejected: composed_via is human or agent' USING ERRCODE = '22023';
  END IF;
  IF p_room_id IS NOT NULL THEN
    SELECT * INTO r FROM executive.rooms_current x WHERE x.room_id = p_room_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'briefing rejected: no such room in this domain' USING ERRCODE = '23503'; END IF;
    IF p_via = 'human' AND NOT executive.is_member(p_room_id, p_composer) THEN
      RAISE EXCEPTION 'briefing rejected: a room briefing is composed by a member of the room' USING ERRCODE = '42501';
    END IF;
    IF p_package_id IS DISTINCT FROM r.package_id THEN RAISE EXCEPTION 'briefing rejected: the package is not the room''s' USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_prior IS NOT NULL THEN
    SELECT * INTO pr FROM executive.briefings x WHERE x.briefing_id = p_prior AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'briefing rejected: the prior briefing does not exist in this domain' USING ERRCODE = '23503'; END IF;
    IF pr.room_id IS DISTINCT FROM p_room_id THEN RAISE EXCEPTION 'briefing rejected: the prior briefing belongs to another room' USING ERRCODE = '22023'; END IF;
    IF pr.known_at > p_known_at THEN
      RAISE EXCEPTION 'briefing rejected: the prior briefing''s known_at (%) is after this briefing''s known_at (%); a briefing follows a prior that knew no more than it', decision.iso(pr.known_at), decision.iso(p_known_at) USING ERRCODE = '22023';
    END IF;
    IF (p_watermark ->> 'prior_briefing_id') IS DISTINCT FROM p_prior::text THEN RAISE EXCEPTION 'briefing rejected: the watermark does not name the prior it follows' USING ERRCODE = '22023'; END IF;
    IF (p_watermark ->> 'prior_known_at')::timestamptz IS DISTINCT FROM pr.known_at THEN RAISE EXCEPTION 'briefing rejected: the watermark''s prior_known_at is not the prior''s known_at' USING ERRCODE = '22023'; END IF;
  ELSIF (p_watermark ->> 'prior_briefing_id') IS NOT NULL THEN
    RAISE EXCEPTION 'briefing rejected: the watermark names a prior the briefing does not bind' USING ERRCODE = '22023';
  END IF;
  IF (p_watermark ->> 'known_at')::timestamptz IS DISTINCT FROM p_known_at THEN RAISE EXCEPTION 'briefing rejected: the watermark''s known_at is not the briefing''s' USING ERRCODE = '22023'; END IF;
  IF p_narrative IS NOT NULL THEN
    IF length(btrim(p_narrative)) < 8 THEN RAISE EXCEPTION 'briefing rejected: a narrative says something or is absent' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(jsonb_agg(i ->> 'item_id'), '[]'::jsonb) INTO v_ids FROM jsonb_array_elements(p_items) i;
    FOR c IN SELECT * FROM jsonb_array_elements(coalesce(p_narrative_cites, '[]'::jsonb)) LOOP
      IF NOT (v_ids @> jsonb_build_array(c)) THEN RAISE EXCEPTION 'briefing rejected: the narrative cites %, which is not an item of this briefing', c USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF jsonb_array_length(coalesce(p_narrative_cites, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'briefing rejected: a narrative cites the items it summarises' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO executive.briefings (briefing_id, scope, tenant_id, domain_id, room_id, package_id, composed_by, composed_via, agent_id, known_at, prior_briefing_id, watermark, sources, items, windows, source_states, degraded,
                                   narrative, narrative_cites, content_digest, header_digest, controls, correlation_id)
  VALUES (p_briefing_id, 'DOMAIN', p_tenant, p_domain, p_room_id, p_package_id, p_composer, p_via, p_agent_id, p_known_at, p_prior, p_watermark, p_sources, p_items, p_windows, coalesce(p_source_states, '[]'::jsonb), coalesce(p_degraded, false),
          p_narrative, CASE WHEN p_narrative IS NULL THEN '[]'::jsonb ELSE coalesce(p_narrative_cites, '[]'::jsonb) END, p_content_digest, p_header_digest, coalesce(p_controls, '{}'::jsonb), p_correlation);
  IF p_room_id IS NOT NULL THEN
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'briefing.composed', p_composer,
            jsonb_build_object('briefing_id', p_briefing_id, 'prior_briefing_id', p_prior, 'known_at', p_known_at, 'content_digest', p_content_digest, 'items', jsonb_array_length(p_items), 'degraded', coalesce(p_degraded, false), 'via', p_via), p_correlation);
  END IF;
  RETURN jsonb_build_object('briefing_id', p_briefing_id, 'content_digest', p_content_digest);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 6. The replay's observed layer reads state AS OF as_of.
-- ============================================================
/* A warning's state as of an instant, from its own event history (raised → acknowledged | expired | closed). */
CREATE OR REPLACE FUNCTION decision.warning_state_as_of(p_warning uuid, p_at timestamptz) RETURNS text
STABLE SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT CASE e.event WHEN 'warning.raised' THEN 'raised' WHEN 'warning.acknowledged' THEN 'acknowledged' WHEN 'warning.expired' THEN 'expired' ELSE 'closed' END
                     FROM prediction.warning_events e WHERE e.warning_id = p_warning AND e.occurred_at <= p_at ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1), 'raised');
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.warning_state_as_of(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.warning_state_as_of(uuid, timestamptz) TO eye_app, eye_commit;

/* A strategy object's status as of an instant, from its events (declared → closed | withdrawn). */
CREATE OR REPLACE FUNCTION decision.strategy_status_as_of(p_object uuid, p_at timestamptz) RETURNS text
STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT CASE e.event WHEN 'strategy.closed' THEN 'closed' WHEN 'strategy.withdrawn' THEN 'withdrawn' ELSE coalesce(e.details ->> 'status', 'active') END
                     FROM graph.strategy_events e WHERE e.strategy_object_id = p_object AND e.event IN ('strategy.declared', 'strategy.closed', 'strategy.withdrawn') AND e.occurred_at <= p_at
                    ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1), 'active');
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.strategy_status_as_of(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.strategy_status_as_of(uuid, timestamptz) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION decision.replay_layers(p_package_id uuid, p_version int, p_as_of timestamptz) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, twin, prediction, observation, objects, policy, audit, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  p record; v record; c record;
  v_tenant uuid := public.eye_tenant(); v_domain uuid := public.eye_domain();
  v_known timestamptz; v_obs date; v_dec timestamptz; v_asof timestamptz;
  v_known_l jsonb; v_believed jsonb; v_tested jsonb; v_decided jsonb; v_observed jsonb; v_excluded jsonb; v_unavailable jsonb;
  v_content jsonb; v_digest text;
  v_run_ids uuid[]; v_branches uuid[]; v_indicators uuid[];
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'replay rejected: no authority context' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = v_tenant AND (public.eye_scope() = 'TENANT' OR x.domain_id = v_domain);
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no authorized package matches' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no such version' USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND OR p.decided_at IS NULL THEN
    RAISE EXCEPTION 'replay rejected: version % of package % is %, not committed; a replay reconstructs what a DECISION was taken with', p_version, p_package_id, v.state USING ERRCODE = '22023';
  END IF;
  v_known := v.known_at; v_obs := v.observed_through; v_dec := p.decided_at; v_asof := coalesce(p_as_of, clock_timestamp());
  IF v_asof < v_dec THEN RAISE EXCEPTION 'replay rejected: as_of (%) is before decided_at (%); the observed layer starts at the decision', decision.iso(v_asof), decision.iso(v_dec) USING ERRCODE = '22023'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS rp_cites (kind text, object_type text, id uuid, version int, digest text, via text) ON COMMIT DROP;
  DELETE FROM rp_cites;
  INSERT INTO rp_cites
    SELECT DISTINCT x ->> 'kind',
           CASE x ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' WHEN 'warning' THEN 'WRN' END,
           (x ->> 'id')::uuid, (x ->> 'version')::int, x ->> 'digest', 'option:' || o.key
      FROM decision.options o, jsonb_array_elements(o.consequences) x
     WHERE o.package_id = p_package_id AND o.version = p_version;
  SELECT coalesce(array_agg(DISTINCT id), ARRAY[]::uuid[]) INTO v_run_ids FROM rp_cites WHERE kind = 'run';
  INSERT INTO rp_cites
    SELECT DISTINCT ON ((x ->> 'id'), (x ->> 'version')) x ->> 'kind',
           CASE x ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' END,
           (x ->> 'id')::uuid, (x ->> 'version')::int, NULL, 'twin:' || r.twin_id || '@' || r.twin_version || ':' || e.key
      FROM simulation.runs_current r
      JOIN twin.state_elements e ON e.twin_id = r.twin_id AND e.version = r.twin_version
      CROSS JOIN LATERAL jsonb_array_elements(e.citations) x
     WHERE r.run_id = ANY (v_run_ids) AND (x ->> 'kind') IN ('evidence', 'claim', 'forecast', 'assumption')
       AND NOT EXISTS (SELECT 1 FROM rp_cites q WHERE q.id = (x ->> 'id')::uuid AND q.version IS NOT DISTINCT FROM (x ->> 'version')::int)
     ORDER BY (x ->> 'id'), (x ->> 'version'), r.twin_id, r.twin_version, e.key;
  SELECT coalesce(array_agg(DISTINCT b), ARRAY[]::uuid[]) INTO v_branches FROM (
    SELECT (m ->> 'branch_id')::uuid b FROM jsonb_array_elements(v.monitoring_conditions) m WHERE (m ->> 'kind') = 'warning' AND (m ->> 'branch_id') IS NOT NULL
    UNION SELECT r.scenario_branch_id FROM simulation.runs_current r WHERE r.run_id = ANY (v_run_ids) AND r.scenario_branch_id IS NOT NULL) s;
  SELECT coalesce(array_agg(DISTINCT (m ->> 'indicator_id')::uuid), ARRAY[]::uuid[]) INTO v_indicators
    FROM jsonb_array_elements(v.monitoring_conditions) m WHERE (m ->> 'kind') = 'indicator' AND (m ->> 'indicator_id') IS NOT NULL;

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'layer', x ->> 'id', (x ->> 'version')::int), '[]'::jsonb) INTO v_excluded FROM (
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', CASE WHEN o.recorded_at > v_known THEN 'recorded after known_at' ELSE 'event after observed_through' END,
                              'recorded_at', decision.iso(o.recorded_at)) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
     WHERE q.object_type IN ('EVD', 'CLM', 'FCT', 'ASU', 'WRN')
       AND (o.recorded_at > v_known OR (v_obs IS NOT NULL AND o.event_time IS NOT NULL AND o.event_time::date > v_obs))
    UNION ALL
    SELECT jsonb_build_object('layer', 'tested', 'id', r.run_id, 'version', 1, 'via', 'run',
                              'reason', CASE WHEN r.state <> 'completed' THEN 'not completed' ELSE 'completed after decided_at' END, 'recorded_at', decision.iso(r.completed_at)) x
      FROM simulation.runs_current r WHERE r.run_id = ANY (v_run_ids) AND (r.state <> 'completed' OR r.completed_at > v_dec)) s;

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'layer', x ->> 'id', (x ->> 'version')::int), '[]'::jsonb) INTO v_unavailable FROM (
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' WHEN q.object_type = 'SIM' THEN 'tested' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', 'not accessible to the reader or not recorded') x
      FROM rp_cites q WHERE q.object_type <> 'SIM' AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = q.id AND o.object_version = q.version
                                                                     AND o.tenant_id = v_tenant AND (public.eye_scope() = 'TENANT' OR o.domain_id = v_domain))
    UNION ALL
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', 'withdrawn', 'at', decision.iso(w.recorded_at), 'by_version', w.object_version, 'withdrawal_reason', w.withdrawal_reason) x
      FROM rp_cites q JOIN LATERAL (SELECT * FROM objects.canonical_objects o2 WHERE o2.object_id = q.id AND o2.object_version > q.version AND o2.lifecycle_state = 'withdrawn' ORDER BY o2.object_version LIMIT 1) w ON true
     WHERE q.object_type <> 'SIM'
    UNION ALL
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', 'withdrawn', 'at', NULL, 'by_version', q.version, 'withdrawal_reason', o.withdrawal_reason) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
     WHERE q.object_type <> 'SIM' AND o.lifecycle_state IN ('withdrawn', 'deleted')
       AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o2 WHERE o2.object_id = q.id AND o2.object_version > q.version AND o2.lifecycle_state = 'withdrawn')
    UNION ALL
    SELECT jsonb_build_object('layer', 'known', 'id', q.id, 'version', q.version, 'via', q.via, 'reason', 'governed-deleted', 'at', decision.iso(t.tombstoned_at), 'tombstone_reason', t.reason) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
      JOIN observation.blob_tombstones t ON t.manifest_id = (o.payload ->> 'manifest_id')::uuid
     WHERE q.object_type = 'EVD') s;

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int), '[]'::jsonb) INTO v_known_l FROM (
    SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'cited_digest', q.digest, 'via', q.via, 'object_type', o.object_type,
                              'recorded_at', decision.iso(o.recorded_at), 'observation_time', decision.iso(o.observation_time), 'event_time', decision.iso(o.event_time),
                              'truth_state', o.truth_state, 'synthetic_state', o.synthetic_state, 'classification', o.classification, 'rights_profile', o.rights_profile,
                              'provenance_ref', o.provenance_ref, 'correction_of', o.correction_of) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
     WHERE q.object_type = 'EVD' AND o.recorded_at <= v_known
       AND (v_obs IS NULL OR o.event_time IS NULL OR o.event_time::date <= v_obs)) s;

  SELECT jsonb_build_object(
    'claims', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'recorded_at', decision.iso(o.recorded_at), 'synthetic_state', o.synthetic_state) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'CLM' AND o.recorded_at <= v_known AND (v_obs IS NULL OR o.event_time IS NULL OR o.event_time::date <= v_obs)) s), '[]'::jsonb),
    'forecasts', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'quality_state', o.quality_state,
                                  'validation_state', o.payload ->> 'validation_state', 'recorded_at', decision.iso(o.recorded_at), 'synthetic_state', o.synthetic_state) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'FCT' AND o.recorded_at <= v_known AND (v_obs IS NULL OR o.event_time IS NULL OR o.event_time::date <= v_obs)) s), '[]'::jsonb),
    'assumptions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'recorded_at', decision.iso(o.recorded_at),
                                  'verification_at_known_at', coalesce((SELECT e.details ->> 'state' FROM graph.strategy_events e WHERE e.strategy_object_id = q.id AND e.event LIKE 'assumption.%' AND e.occurred_at <= v_known ORDER BY e.occurred_at DESC LIMIT 1), 'unverified')) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'ASU' AND o.recorded_at <= v_known) s), '[]'::jsonb),
    'warnings', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'recorded_at', decision.iso(o.recorded_at)) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'WRN' AND o.recorded_at <= v_known) s), '[]'::jsonb),
    'branches', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'branch_id') FROM (
        SELECT jsonb_build_object('branch_id', b.branch_id, 'scenario_id', b.scenario_id, 'name', b.name, 'kind', b.kind, 'state_as_of', prediction.branch_state_as_of(b.branch_id, v_known, v_obs),
                                  'known_at', decision.iso(v_known), 'observed_through', v_obs) x
          FROM prediction.branches_current b WHERE b.branch_id = ANY (v_branches) AND b.added_at <= v_known) s), '[]'::jsonb),
    'twins', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'twin_id') FROM (
        SELECT DISTINCT jsonb_build_object('twin_id', t.twin_id, 'title', t.title, 'validation_status', t.validation ->> 'status', 'limitations', t.validation -> 'limitations', 'behaviour_model_ref', t.behaviour_model_ref) x
          FROM simulation.runs_current r JOIN twin.twins_current t ON t.twin_id = r.twin_id WHERE r.run_id = ANY (v_run_ids) AND t.declared_at <= v_known) s), '[]'::jsonb)
  ) INTO v_believed;

  SELECT jsonb_build_object(
    'runs', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'run_id') FROM (
        SELECT jsonb_build_object('run_id', r.run_id, 'run_kind', r.run_kind, 'control_run_id', r.control_run_id, 'twin_id', r.twin_id, 'twin_version', r.twin_version, 'branch_id', r.branch_id,
                                  'known_at', decision.iso(r.known_at), 'observed_through', r.observed_through, 'inputs_digest', r.inputs_digest, 'initial_state_digest', r.initial_state_digest,
                                  'outputs_digest', r.outputs_digest, 'implementation_digest', r.implementation_digest, 'environment_digest', r.environment_digest, 'header_digest', r.header_digest,
                                  'outside_envelope', r.outside_envelope, 'completed_at', decision.iso(r.completed_at), 'interventions', r.interventions) x
          FROM simulation.runs_current r WHERE r.run_id = ANY (v_run_ids) AND r.state = 'completed' AND r.completed_at <= v_dec) s), '[]'::jsonb),
    'reproductions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'reproduced_at', x ->> 'reproduction_id') FROM (
        SELECT jsonb_build_object('reproduction_id', rp.reproduction_id, 'run_id', rp.run_id, 'verdict', rp.verdict, 'expected_digest', rp.expected_digest, 'actual_digest', rp.actual_digest,
                                  'environment_matches', rp.environment_matches, 'cold_process', rp.cold_process, 'reproduced_at', decision.iso(rp.reproduced_at)) x
          FROM simulation.reproductions rp WHERE rp.run_id = ANY (v_run_ids) AND rp.reproduced_at <= v_dec) s), '[]'::jsonb),
    'twin_versions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'twin_id', (x ->> 'version')::int) FROM (
        SELECT DISTINCT jsonb_build_object('twin_id', tv.twin_id, 'version', tv.version, 'branch_id', tv.branch_id, 'state_set_digest', tv.state_set_digest, 'header_digest', tv.header_digest,
                                  'known_at', decision.iso(tv.known_at), 'observed_through', tv.observed_through, 'admitted_at', decision.iso(tv.admitted_at), 'completeness', tv.completeness, 'synthetic_state', tv.synthetic_state,
                                  'verification_at_decided_at', coalesce((SELECT CASE WHEN e.event = 'version.unverified' THEN 'unverified' ELSE 'verified' END FROM twin.twin_events e
                                                                           WHERE e.twin_id = tv.twin_id AND (e.details ->> 'version')::int = tv.version AND e.event IN ('version.unverified', 'version.reverified') AND e.occurred_at <= v_dec
                                                                           ORDER BY e.occurred_at DESC LIMIT 1), 'verified')) x
          FROM simulation.runs_current r JOIN twin.twin_versions tv ON tv.twin_id = r.twin_id AND tv.version = r.twin_version
         WHERE r.run_id = ANY (v_run_ids) AND tv.state = 'admitted' AND tv.admitted_at <= v_dec) s), '[]'::jsonb)
  ) INTO v_tested;

  SELECT jsonb_build_object(
    'version', jsonb_build_object('package_id', v.package_id, 'version', v.version, 'version_digest', v.version_digest, 'header_digest', v.header_digest, 'known_at', decision.iso(v.known_at),
                                  'observed_through', v.observed_through, 'proposed_at', decision.iso(v.proposed_at), 'proposed_by', v.proposed_by, 'choice', v.choice, 'objectives', v.objectives,
                                  'approver_policy', v.approver_policy, 'monitoring_conditions', v.monitoring_conditions, 'baseline_run_id', v.baseline_run_id, 'synthetic_state', v.synthetic_state, 'supersedes', v.supersedes),
    'decision_object_id', p.decision_object_id,
    'options', coalesce((SELECT jsonb_agg(jsonb_build_object('key', o.key, 'title', o.title, 'kind', o.kind, 'simulated', o.simulated, 'unsimulated_reason', o.unsimulated_reason, 'consequences', o.consequences, 'uncertainty', o.uncertainty) ORDER BY o.key)
                         FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version), '[]'::jsonb),
    'dissent', coalesce((SELECT jsonb_agg(jsonb_build_object('dissent_id', d.dissent_id, 'principal_id', d.principal_id, 'position', d.position, 'rationale', d.rationale, 'citation', d.citation, 'recorded_at', decision.iso(d.recorded_at)) ORDER BY d.recorded_at, d.dissent_id)
                         FROM decision.dissent d WHERE d.package_id = p_package_id AND d.version = p_version AND d.recorded_at <= v_dec), '[]'::jsonb),
    'prior_dissent', coalesce((SELECT jsonb_agg(jsonb_build_object('dissent_id', d.dissent_id, 'version', d.version, 'principal_id', d.principal_id, 'position', d.position, 'rationale', d.rationale, 'citation', d.citation, 'recorded_at', decision.iso(d.recorded_at)) ORDER BY d.recorded_at, d.dissent_id)
                               FROM decision.dissent d WHERE d.package_id = p_package_id AND d.version <> p_version AND d.recorded_at <= v_dec), '[]'::jsonb),
    'approvals', coalesce((SELECT jsonb_agg(jsonb_build_object('approval_id', a.approval_id, 'approver', a.approver_principal_id, 'decision', a.decision, 'version_digest', a.version_digest, 'eligible_by', a.eligible_by,
                                                               'expires_at', decision.iso(a.expires_at), 'recorded_at', decision.iso(a.recorded_at), 'header_digest', a.header_digest,
                                                               'revoked_before_decision', a.revoked_at IS NOT NULL AND a.revoked_at <= v_dec) ORDER BY a.recorded_at, a.approval_id)
                           FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.recorded_at <= v_dec), '[]'::jsonb),
    'commitment', jsonb_build_object('commitment_id', c.commitment_id, 'committed_by', c.committed_by, 'version_digest', c.version_digest, 'approvals', c.approvals, 'op_class', c.op_class, 'bound_action', c.bound_action,
                                     'header_digest', c.header_digest, 'committed_at', decision.iso(c.committed_at), 'decided_at', decision.iso(v_dec), 'policy_decision_id', c.policy_decision_id),
    'policy', (SELECT jsonb_build_object('policy_decision_id', pd.id, 'decision', pd.decision, 'obligations', pd.obligations, 'consequence_class', pd.consequence_class, 'action', pd.action, 'recorded_at', decision.iso(pd.created_at))
                 FROM policy.policy_decisions pd WHERE pd.id = c.policy_decision_id),
    'audit', (SELECT jsonb_build_object('partition_id', ae.partition_id, 'audit_seq', ae.audit_seq, 'row_hash', ae.row_hash, 'occurred_at', ae.occurred_at, 'outcome', ae.outcome)
                FROM audit.audit_events ae WHERE ae.correlation_id = c.correlation_id AND ae.action = 'decision.commit' AND ae.outcome = 'success' ORDER BY ae.audit_seq LIMIT 1)
  ) INTO v_decided;

  -- ── observed: strictly (decided_at, as_of]; every mutable state read AS OF as_of from the record's own events ──
  SELECT jsonb_build_object(
    'later_versions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'recorded_at', x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT DISTINCT jsonb_build_object('id', o2.object_id, 'version', o2.object_version, 'object_type', o2.object_type, 'lifecycle_state', o2.lifecycle_state, 'truth_state', o2.truth_state, 'correction_of', o2.correction_of,
                                  'withdrawal_reason', o2.withdrawal_reason, 'digest', o2.content_digest, 'recorded_at', decision.iso(o2.recorded_at), 'cited_version', q.version) x
          FROM rp_cites q JOIN objects.canonical_objects o2 ON o2.object_id = q.id AND o2.object_version > q.version
         WHERE q.object_type <> 'SIM' AND o2.recorded_at > v_dec AND o2.recorded_at <= v_asof) s), '[]'::jsonb),
    'tombstones', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'at', x ->> 'id') FROM (
        SELECT DISTINCT jsonb_build_object('id', q.id, 'version', q.version, 'reason', t.reason, 'at', decision.iso(t.tombstoned_at)) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
          JOIN observation.blob_tombstones t ON t.manifest_id = (o.payload ->> 'manifest_id')::uuid
         WHERE q.object_type = 'EVD' AND t.tombstoned_at > v_dec AND t.tombstoned_at <= v_asof) s), '[]'::jsonb),
    'reproductions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'reproduced_at', x ->> 'reproduction_id') FROM (
        SELECT jsonb_build_object('reproduction_id', rp.reproduction_id, 'run_id', rp.run_id, 'verdict', rp.verdict, 'actual_digest', rp.actual_digest, 'reason', rp.reason, 'reproduced_at', decision.iso(rp.reproduced_at)) x
          FROM simulation.reproductions rp WHERE rp.run_id = ANY (v_run_ids) AND rp.reproduced_at > v_dec AND rp.reproduced_at <= v_asof) s), '[]'::jsonb),
    'reconciliations', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'recorded_at', x ->> 'reconciliation_id') FROM (
        SELECT jsonb_build_object('reconciliation_id', rc.reconciliation_id, 'twin_id', rc.twin_id, 'key', rc.key, 'from_version', rc.from_version, 'from_kind', rc.from_kind, 'from_value', rc.from_value,
                                  'against_version', rc.against_version, 'against_value', rc.against_value, 'difference', rc.difference, 'note', rc.note, 'recorded_at', decision.iso(rc.recorded_at)) x
          FROM twin.reconciliations rc
         WHERE rc.recorded_at > v_dec AND rc.recorded_at <= v_asof
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(rc.from_citations) fc WHERE (fc ->> 'kind') = 'run' AND (fc ->> 'id')::uuid = ANY (v_run_ids))) s), '[]'::jsonb),
    -- the OUT as it was admitted (its canonical record is immutable) with its status as of as_of from its events
    'outcomes', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'recorded_at', x ->> 'id') FROM (
        SELECT DISTINCT jsonb_build_object('id', s.strategy_object_id, 'title', coalesce(co.payload ->> 'title', s.title), 'statement', coalesce(co.payload ->> 'statement', s.statement),
                                           'status', decision.strategy_status_as_of(s.strategy_object_id, v_asof), 'content_digest', co.content_digest, 'recorded_at', decision.iso(d.created_at), 'depends_on', d.depends_on_id) x
          FROM graph.dependencies d JOIN graph.strategy_current s ON s.strategy_object_id = d.dependent_object_id AND s.object_type = 'OUT'
          LEFT JOIN objects.canonical_objects co ON co.object_type = 'OUT' AND co.object_id = s.strategy_object_id AND co.object_version = 1
         WHERE d.dependent_type = 'OUT' AND d.depends_on_id IN (c.commitment_id, p.decision_object_id) AND d.created_at > v_dec AND d.created_at <= v_asof) s), '[]'::jsonb),
    -- warnings raised in the interval, with the state they had AS OF as_of
    'warnings', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'raised_at', x ->> 'warning_id') FROM (
        SELECT jsonb_build_object('warning_id', w.warning_id, 'title', w.title, 'state', decision.warning_state_as_of(w.warning_id, v_asof), 'branch_id', w.branch_id, 'indicator_id', w.indicator_id, 'routed_to', w.routed_to,
                                  'raised_at', decision.iso(w.raised_at), 'response_window_closes_at', decision.iso(w.response_window_closes_at),
                                  'acknowledged_at', CASE WHEN w.acknowledged_at IS NOT NULL AND w.acknowledged_at <= v_asof THEN decision.iso(w.acknowledged_at) END) x
          FROM prediction.warnings_current w
         WHERE (w.branch_id = ANY (v_branches) OR w.indicator_id = ANY (v_indicators)) AND w.raised_at > v_dec AND w.raised_at <= v_asof) s), '[]'::jsonb),
    'branch_flips', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT jsonb_build_object('event_id', e.event_id, 'branch_id', e.branch_id, 'event', e.event, 'occurred_at', decision.iso(e.occurred_at), 'details', e.details) x
          FROM prediction.scenario_events e WHERE e.branch_id = ANY (v_branches) AND e.event IN ('branch.flipped', 'branch.closed') AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb),
    'approval_revocations', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'revoked_at', x ->> 'approval_id') FROM (
        SELECT jsonb_build_object('approval_id', a.approval_id, 'approver', a.approver_principal_id, 'revoked_at', decision.iso(a.revoked_at), 'reason', a.revoked_reason) x
          FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.revoked_at > v_dec AND a.revoked_at <= v_asof) s), '[]'::jsonb),
    'assumption_events', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT jsonb_build_object('event_id', e.event_id, 'assumption_id', e.strategy_object_id, 'event', e.event, 'state', e.details ->> 'state', 'reason', e.details ->> 'reason', 'occurred_at', decision.iso(e.occurred_at)) x
          FROM graph.strategy_events e WHERE e.strategy_object_id IN (SELECT id FROM rp_cites WHERE object_type = 'ASU') AND e.event LIKE 'assumption.%' AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb),
    'twin_events', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT DISTINCT jsonb_build_object('event_id', e.event_id, 'twin_id', e.twin_id, 'event', e.event, 'version', (e.details ->> 'version')::int, 'occurred_at', decision.iso(e.occurred_at)) x
          FROM twin.twin_events e JOIN simulation.runs_current r ON r.twin_id = e.twin_id AND (e.details ->> 'version')::int = r.twin_version
         WHERE r.run_id = ANY (v_run_ids) AND e.event IN ('version.unverified', 'version.reverified') AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb),
    'package_events', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT jsonb_build_object('event_id', e.event_id, 'event', e.event, 'actor', e.actor_principal_id, 'occurred_at', decision.iso(e.occurred_at), 'details', e.details) x
          FROM decision.package_events e WHERE e.package_id = p_package_id AND e.event NOT IN ('replay.recorded') AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb)
  ) INTO v_observed;

  v_content := jsonb_build_object(
    'package_id', p_package_id, 'version', p_version,
    'cutoffs', jsonb_build_object('known_at', decision.iso(v_known), 'observed_through', v_obs, 'decided_at', decision.iso(v_dec), 'as_of', decision.iso(v_asof)),
    'known', v_known_l, 'believed', v_believed, 'tested', v_tested, 'decided', v_decided, 'observed', v_observed, 'excluded', v_excluded);
  v_digest := encode(sha256(convert_to(v_content::text, 'UTF8')), 'hex');
  RETURN jsonb_build_object('content', v_content, 'content_digest', v_digest, 'unavailable', v_unavailable,
                            'summary', jsonb_build_object('known', jsonb_array_length(v_known_l), 'claims', jsonb_array_length(v_believed -> 'claims'), 'forecasts', jsonb_array_length(v_believed -> 'forecasts'),
                                                          'assumptions', jsonb_array_length(v_believed -> 'assumptions'), 'branches', jsonb_array_length(v_believed -> 'branches'),
                                                          'runs', jsonb_array_length(v_tested -> 'runs'), 'reproductions', jsonb_array_length(v_tested -> 'reproductions'),
                                                          'dissent', jsonb_array_length(v_decided -> 'dissent'), 'prior_dissent', jsonb_array_length(v_decided -> 'prior_dissent'), 'approvals', jsonb_array_length(v_decided -> 'approvals'),
                                                          'excluded', jsonb_array_length(v_excluded), 'unavailable', jsonb_array_length(v_unavailable)));
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 7. Agents: stop conditions validated; the run session port looks the registration up itself.
-- ============================================================
CREATE OR REPLACE FUNCTION executive.register_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_kind text, p_version text, p_code_digest text, p_owner uuid, p_escalation uuid,
  p_budgets jsonb, p_stop_conditions jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text; sc jsonb; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_kind NOT IN ('decision', 'briefing', 'reporting') THEN RAISE EXCEPTION 'agent rejected: kind is decision, briefing or reporting' USING ERRCODE = '22023'; END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = p_principal AND tenant_id = p_tenant;
  IF NOT FOUND OR v_kind <> 'agent' OR v_status <> 'active' THEN RAISE EXCEPTION 'agent rejected: the principal must be an active principal of kind agent in this tenant' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_owner, p_tenant) THEN RAISE EXCEPTION 'agent rejected: the owner is the accountable human, never another agent' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_escalation, p_tenant) THEN RAISE EXCEPTION 'agent rejected: the escalation target is a named human' USING ERRCODE = '42501'; END IF;
  IF p_budgets IS NULL OR jsonb_typeof(p_budgets) <> 'object' OR NOT (p_budgets ? 'max_reads' AND p_budgets ? 'max_gateway_calls' AND p_budgets ? 'max_elapsed_ms') THEN
    RAISE EXCEPTION 'agent rejected: budgets name max_reads, max_gateway_calls and max_elapsed_ms' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['max_reads', 'max_gateway_calls', 'max_elapsed_ms'] LOOP
    IF jsonb_typeof(p_budgets -> k) <> 'number' OR (p_budgets ->> k)::numeric < 0 OR (p_budgets ->> k)::numeric <> floor((p_budgets ->> k)::numeric) THEN
      RAISE EXCEPTION 'agent rejected: budget % is a non-negative integer', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_stop_conditions IS NOT NULL AND jsonb_typeof(p_stop_conditions) <> 'array' THEN RAISE EXCEPTION 'agent rejected: stop_conditions is an array' USING ERRCODE = '22023'; END IF;
  FOR sc IN SELECT * FROM jsonb_array_elements(coalesce(p_stop_conditions, '[]'::jsonb)) LOOP
    IF jsonb_typeof(sc) <> 'object' OR (sc ->> 'kind') NOT IN ('max_items', 'on_degraded') THEN
      RAISE EXCEPTION 'agent rejected: stop condition % is not one this runtime supports (max_items, on_degraded)', coalesce(sc ->> 'kind', sc::text) USING ERRCODE = '22023';
    END IF;
    IF (sc ->> 'kind') = 'max_items' AND (jsonb_typeof(sc -> 'value') <> 'number' OR (sc ->> 'value')::numeric < 0) THEN
      RAISE EXCEPTION 'agent rejected: stop condition max_items names a non-negative value' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  INSERT INTO executive.agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_kind, agent_version, code_digest, owner_principal_id, escalation_principal_id, budgets, stop_conditions, created_by, correlation_id)
  VALUES (p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_kind, p_version, p_code_digest, p_owner, p_escalation, p_budgets, coalesce(p_stop_conditions, '[]'::jsonb), p_actor, p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'principal_id', p_principal, 'kind', p_kind);
END $$ LANGUAGE plpgsql;

/*
 * The run session, opened from the registration alone: under the identity-operation capability
 * the port reads executive.agents itself, so a scheduled tick on a cold process needs no reader
 * at all — no human's cached principal, no borrowed authority. Returns the registration the run
 * is bound to; the session it opens is the agent's own (assurance agent_grant).
 */
CREATE OR REPLACE FUNCTION executive.decision_agent_run_open(
  p_session uuid, p_agent_id uuid, p_tenant uuid, p_domain uuid, p_refresh_hash text, p_context_key_hash text, p_expires_at timestamptz, p_family uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE; v_kind text; v_status text;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'agent session denied: identity operation capability required (context is %)', public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM executive.agents WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent session denied: no such agent in this domain' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'agent session denied: agent grant is revoked' USING ERRCODE = '42501'; END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = a.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'agent session denied: principal is not an active agent principal' USING ERRCODE = '42501'; END IF;
  PERFORM identity.session_open(p_session, a.principal_id, 'agent_grant', p_refresh_hash, p_context_key_hash, p_expires_at, p_family);
  RETURN jsonb_build_object('principal_id', a.principal_id, 'agent_kind', a.agent_kind, 'agent_version', a.agent_version, 'code_digest', a.code_digest,
                            'budgets', a.budgets, 'stop_conditions', a.stop_conditions, 'escalation_principal_id', a.escalation_principal_id, 'owner_principal_id', a.owner_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.decision_agent_run_open(uuid,uuid,uuid,uuid,text,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.decision_agent_run_open(uuid,uuid,uuid,uuid,text,text,timestamptz,uuid) TO eye_identity;

/*
 * The planner's reconciliation reads under the SCHEDULE capability, which carries no tenant —
 * every FORCE-RLS table hides its rows from it, so a cold process could never schedule a room
 * (the startup reconciliation found nothing; the room was scheduled only by a human's later
 * call). The eligible rooms are read by a port that asserts the same capability the collection
 * worker already holds — the shape of observation.schedules_to_reconcile — and nothing else.
 */
CREATE OR REPLACE FUNCTION executive.briefings_to_reconcile()
RETURNS TABLE (tenant_id text, domain_id text, room_id text, agent_id text, review_every_days int)
SECURITY DEFINER SET search_path = executive, decision, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT r.tenant_id::text, r.domain_id::text, r.room_id::text, a.agent_id::text, r.review_every_days
      FROM executive.rooms_current r
      JOIN decision.packages_current p ON p.package_id = r.package_id AND p.state NOT IN ('closed', 'withdrawn', 'rejected')
      JOIN LATERAL (SELECT x.agent_id FROM executive.agents x WHERE x.tenant_id = r.tenant_id AND x.domain_id = r.domain_id AND x.agent_kind = 'briefing' AND x.status = 'active' ORDER BY x.created_at DESC LIMIT 1) a ON true
     ORDER BY r.opened_at;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.briefings_to_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.briefings_to_reconcile() TO eye_commit;
