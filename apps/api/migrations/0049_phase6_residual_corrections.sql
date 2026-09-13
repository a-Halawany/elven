-- 0049 · Phase 6 — the residual paths of the independent correction review at 9aaf0311
-- (PHASE6_REPORT.md §12). Forward migration: 0041–0048 are untouched; every function here is
-- replaced whole with its signature kept, and every earlier record keeps its digest.
--
--   §1  the option's derivation is ONE function, used by set_option, by the carry-forward of
--       open_version (re-derived under the receiving version's cut-offs) and by propose_version
--       (every option revalidated before the digest is computed)
--   §2  approval eligibility AS OF an instant, and the approvals that stood then
--   §3  the approved criterion binds its twin and its interval (set_choice); record_outcome
--       enforces them (older choices keep the 0048 rules)
--   §4  a replay names every contributor with its controls, layer by layer
--   §5  stop conditions are validated per agent kind at registration
-- ============================================================

-- ============================================================
-- 1. One derivation for every option write.
-- ============================================================
CREATE OR REPLACE FUNCTION decision.derive_option(
  p_tenant uuid, p_domain uuid, p_known_at timestamptz, p_observed_through date, p_consequences jsonb, p_unsimulated_reason text, p_label text
) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, simulation, twin, objects, pg_catalog, pg_temp AS $$
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
    IF v_type <> 'SIM' THEN
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

CREATE OR REPLACE FUNCTION decision.set_option(
  p_option_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_key text, p_title text, p_kind text,
  p_consequences jsonb, p_simulated boolean, p_unsimulated_reason text, p_uncertainty jsonb, p_second_order jsonb, p_risks jsonb, p_opportunities jsonb,
  p_reversibility text, p_synthetic boolean, p_controls jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, simulation, twin, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; d jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.option', 'decision.package.draft']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'option rejected: no such package version in this domain' USING ERRCODE = '23503'; END IF;
  IF v.state <> 'draft' THEN RAISE EXCEPTION 'option rejected: version % is % and immutable; open a new version', p_version, v.state USING ERRCODE = '2F002'; END IF;
  d := decision.derive_option(p_tenant, p_domain, v.known_at, v.observed_through, p_consequences, p_unsimulated_reason, 'option rejected');
  INSERT INTO decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason,
                                uncertainty, second_order, risks, opportunities, reversibility, synthetic_state, controls, set_by, correlation_id)
  VALUES (p_option_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_key, p_title, p_kind, p_consequences, (d ->> 'simulated')::boolean,
          CASE WHEN (d ->> 'simulated')::boolean THEN NULL ELSE p_unsimulated_reason END,
          d -> 'uncertainty', coalesce(p_second_order, '[]'::jsonb), coalesce(p_risks, '[]'::jsonb), coalesce(p_opportunities, '[]'::jsonb),
          p_reversibility, (d ->> 'synthetic_state')::boolean, d -> 'controls', p_actor, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'option.set', p_actor,
          jsonb_build_object('version', p_version, 'key', p_key, 'kind', p_kind, 'simulated', (d ->> 'simulated')::boolean, 'consequences', p_consequences, 'derived_at_port', true), p_correlation);
  RETURN d;
END $$ LANGUAGE plpgsql;

/* The carry-forward: every copied option is re-derived under the RECEIVING version's cut-offs; one that cannot enter them refuses the carry. */
CREATE OR REPLACE FUNCTION decision.open_version(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_known_at timestamptz, p_observed_through date, p_carry_from int,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS int
SECURITY DEFINER SET search_path = decision, simulation, twin, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; v_supersedes int; v_open int; v_state text; opt record; d jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.version']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT state INTO v_state FROM decision.packages_current p WHERE p.package_id = p_package_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF v_state IN ('committed', 'monitoring', 'closed', 'withdrawn') THEN
    RAISE EXCEPTION 'version rejected: package is %; a committed decision is not re-opened, a new package is declared', v_state USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_open FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.state = 'draft';
  IF v_open > 0 THEN RAISE EXCEPTION 'version rejected: the package already has an open draft; propose it or withdraw it' USING ERRCODE = '22023'; END IF;
  IF p_carry_from IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_carry_from AND v.state <> 'draft') THEN
    RAISE EXCEPTION 'version rejected: carry-from source % is not a proposed version of this package', p_carry_from USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_next FROM decision.package_versions WHERE package_id = p_package_id;
  SELECT max(version) INTO v_supersedes FROM decision.package_versions WHERE package_id = p_package_id AND state <> 'draft';
  INSERT INTO decision.package_versions (package_id, version, scope, tenant_id, domain_id, supersedes, state, known_at, observed_through, author_principal_id, correlation_id)
  VALUES (p_package_id, v_next, 'DOMAIN', p_tenant, p_domain, v_supersedes, 'draft', p_known_at, p_observed_through, p_actor, p_correlation);
  IF p_carry_from IS NOT NULL THEN
    UPDATE decision.package_versions n
       SET objectives = o.objectives, constraints = o.constraints, approver_policy = o.approver_policy, monitoring_conditions = o.monitoring_conditions,
           reversibility = o.reversibility, information_value = o.information_value, second_order = o.second_order, risks = o.risks, opportunities = o.opportunities
      FROM decision.package_versions o
     WHERE n.package_id = p_package_id AND n.version = v_next AND o.package_id = p_package_id AND o.version = p_carry_from;
    FOR opt IN SELECT * FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_carry_from ORDER BY x.key LOOP
      d := decision.derive_option(p_tenant, p_domain, p_known_at, p_observed_through, opt.consequences, opt.unsimulated_reason, format('version rejected: carried option %s', opt.key));
      INSERT INTO decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason,
                                    uncertainty, second_order, risks, opportunities, reversibility, synthetic_state, controls, set_by, correlation_id)
      VALUES (gen_random_uuid(), opt.scope, opt.tenant_id, opt.domain_id, opt.package_id, v_next, opt.key, opt.title, opt.kind, opt.consequences, (d ->> 'simulated')::boolean,
              CASE WHEN (d ->> 'simulated')::boolean THEN NULL ELSE opt.unsimulated_reason END,
              d -> 'uncertainty', opt.second_order, opt.risks, opt.opportunities, opt.reversibility, (d ->> 'synthetic_state')::boolean, d -> 'controls', p_actor, p_correlation);
    END LOOP;
  END IF;
  UPDATE decision.packages_current SET current_version = v_next WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.opened', p_actor,
          jsonb_build_object('version', v_next, 'supersedes', v_supersedes, 'known_at', p_known_at, 'observed_through', p_observed_through, 'carried_from', p_carry_from, 'carried_options_rederived', p_carry_from IS NOT NULL), p_correlation);
  RETURN v_next;
END $$ LANGUAGE plpgsql;

/* The proposal revalidates every option under the version's cut-offs before the digest is computed: no write path escapes the derivation. */
CREATE OR REPLACE FUNCTION decision.propose_version(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_expected_digest text, p_header_digest text, p_baseline_run uuid,
  p_synthetic boolean, p_controls jsonb, p_dependencies jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, twin, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; v_digest text; v_options int; v_status_quo int; v_bad int; v_baselines int; d jsonb; v_dec uuid; opt record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND OR v.state <> 'draft' THEN RAISE EXCEPTION 'proposal rejected: version % of package % is not an open draft in this domain', p_version, p_package_id USING ERRCODE = '2F002'; END IF;
  IF jsonb_array_length(v.objectives) = 0 THEN RAISE EXCEPTION 'proposal rejected: a package version names at least one objective' USING ERRCODE = '22023'; END IF;
  SELECT count(*), count(*) FILTER (WHERE kind = 'status_quo') INTO v_options, v_status_quo FROM decision.options o2 WHERE o2.package_id = p_package_id AND o2.version = p_version;
  IF v_options < 2 THEN RAISE EXCEPTION 'proposal rejected: a decision compares at least two options' USING ERRCODE = '22023'; END IF;
  IF v_status_quo <> 1 THEN RAISE EXCEPTION 'proposal rejected: exactly one option is the explicit status quo (do nothing)' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_bad FROM decision.options o2 WHERE o2.package_id = p_package_id AND o2.version = p_version AND o2.uncertainty = '{}'::jsonb;
  IF v_bad > 0 THEN RAISE EXCEPTION 'proposal rejected: % option(s) carry no uncertainty block', v_bad USING ERRCODE = '22023'; END IF;
  -- every option, whatever wrote it, must enter THIS version's cut-offs
  FOR opt IN SELECT * FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p_version ORDER BY x.key LOOP
    PERFORM decision.derive_option(p_tenant, p_domain, v.known_at, v.observed_through, opt.consequences, opt.unsimulated_reason, format('proposal rejected: option %s', opt.key));
  END LOOP;
  IF v.choice IS NULL THEN RAISE EXCEPTION 'proposal rejected: the choice — option, rationale, deadline, trade-offs, action owner, outcome criteria — is what is proposed; it is missing' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM decision.options o2 WHERE o2.package_id = p_package_id AND o2.version = p_version AND o2.key = (v.choice ->> 'option_key')) THEN
    RAISE EXCEPTION 'proposal rejected: the chosen option % is not among this version''s options', v.choice ->> 'option_key' USING ERRCODE = '22023';
  END IF;
  IF v.approver_policy = '{}'::jsonb THEN RAISE EXCEPTION 'proposal rejected: the approver policy is missing' USING ERRCODE = '22023'; END IF;
  IF coalesce(jsonb_array_length(v.approver_policy -> 'roles'), 0) = 0
     AND (SELECT count(*) FROM jsonb_array_elements_text(coalesce(v.approver_policy -> 'principals', '[]'::jsonb)) a WHERE a::uuid <> v.author_principal_id) = 0 THEN
    RAISE EXCEPTION 'proposal rejected: the author cannot be the only approver named by the policy' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v.monitoring_conditions) = 0 THEN RAISE EXCEPTION 'proposal rejected: a committed decision is watched — at least one monitoring condition is required' USING ERRCODE = '22023'; END IF;
  SELECT count(DISTINCT coalesce(r.control_run_id, r.run_id)) INTO v_baselines
    FROM decision.options o2, jsonb_array_elements(o2.consequences) c
    JOIN simulation.runs_current r ON r.run_id = (c ->> 'id')::uuid
   WHERE o2.package_id = p_package_id AND o2.version = p_version AND (c ->> 'kind') = 'run';
  IF v_baselines > 1 THEN RAISE EXCEPTION 'proposal rejected: the options'' simulated consequences rest on % different baselines; one control run is the common baseline', v_baselines USING ERRCODE = '22023'; END IF;
  IF v_baselines = 1 AND p_baseline_run IS DISTINCT FROM (SELECT coalesce(r.control_run_id, r.run_id) FROM decision.options o2, jsonb_array_elements(o2.consequences) c
      JOIN simulation.runs_current r ON r.run_id = (c ->> 'id')::uuid WHERE o2.package_id = p_package_id AND o2.version = p_version AND (c ->> 'kind') = 'run' LIMIT 1) THEN
    RAISE EXCEPTION 'proposal rejected: the declared baseline is not the control the cited runs rest on' USING ERRCODE = '22023';
  END IF;
  UPDATE decision.package_versions SET baseline_run_id = p_baseline_run WHERE package_id = p_package_id AND version = p_version;
  v_digest := decision.version_digest(p_package_id, p_version);
  IF p_expected_digest IS NULL OR v_digest <> p_expected_digest THEN
    RAISE EXCEPTION 'proposal rejected: the version changed between digesting and proposing (% vs %)', p_expected_digest, v_digest USING ERRCODE = '22023';
  END IF;
  UPDATE decision.package_versions
     SET state = 'proposed', version_digest = v_digest, header_digest = p_header_digest, synthetic_state = coalesce(p_synthetic, false),
         controls = coalesce(p_controls, '{}'::jsonb), proposed_by = p_actor, proposed_at = clock_timestamp()
   WHERE package_id = p_package_id AND version = p_version;
  UPDATE decision.package_versions SET state = 'superseded'
   WHERE package_id = p_package_id AND version <> p_version AND state IN ('proposed', 'under_review', 'approved');
  UPDATE decision.packages_current
     SET state = 'proposed', current_version = p_version, synthetic_state = synthetic_state OR coalesce(p_synthetic, false), controls = coalesce(p_controls, controls)
   WHERE package_id = p_package_id;
  SELECT decision_object_id INTO v_dec FROM decision.packages_current WHERE package_id = p_package_id;
  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_dependencies, '[]'::jsonb)) LOOP
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_dec, 'DEC', d ->> 'kind', (d ->> 'id')::uuid,
            format('decision package %s version %s option %s cites it', p_package_id, p_version, d ->> 'key'), 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.proposed', p_actor,
          jsonb_build_object('version', p_version, 'version_digest', v_digest, 'header_digest', p_header_digest, 'choice', v.choice, 'baseline_run_id', p_baseline_run, 'synthetic_state', coalesce(p_synthetic, false), 'options_revalidated', true), p_correlation);
  RETURN jsonb_build_object('version_digest', v_digest, 'baseline_run_id', p_baseline_run);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Eligibility AS OF an instant.
-- ============================================================
/* Whether (and how) a principal could approve under a policy AT an instant: a named human, or a role binding created by then and not revoked by then. */
CREATE OR REPLACE FUNCTION decision.approver_eligibility_as_of(p_principal uuid, p_tenant uuid, p_domain uuid, p_policy jsonb, p_at timestamptz) RETURNS text
STABLE SECURITY DEFINER SET search_path = decision, identity, pg_catalog, pg_temp AS $$
DECLARE r text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_principal AND p.kind = 'human' AND p.tenant_id = p_tenant) THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_policy -> 'principals', '[]'::jsonb)) a WHERE a = p_principal::text) THEN RETURN 'principal'; END IF;
  SELECT b.role_code INTO r FROM identity.role_bindings b
   WHERE b.principal_id = p_principal AND b.tenant_id = p_tenant AND b.created_at <= p_at AND (b.revoked_at IS NULL OR b.revoked_at > p_at)
     AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT')
     AND b.role_code IN (SELECT jsonb_array_elements_text(coalesce(p_policy -> 'roles', '[]'::jsonb)))
   ORDER BY 1 LIMIT 1;
  IF r IS NOT NULL THEN RETURN 'role:' || r; END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.approver_eligibility_as_of(uuid, uuid, uuid, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.approver_eligibility_as_of(uuid, uuid, uuid, jsonb, timestamptz) TO eye_app, eye_commit;

/* The approvals of a version that STOOD at an instant: recorded by then, approve, not revoked by then, not expired by then, of the version's digest, by an approver eligible then. */
CREATE OR REPLACE FUNCTION decision.live_approvals_as_of(p_package_id uuid, p_version int, p_at timestamptz)
RETURNS TABLE (approval_id uuid, approver_principal_id uuid, expires_at timestamptz, eligible_by text)
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (a.approver_principal_id) a.approval_id, a.approver_principal_id, a.expires_at,
         decision.approver_eligibility_as_of(a.approver_principal_id, a.tenant_id, a.domain_id, v.approver_policy, p_at)
    FROM decision.approvals a JOIN decision.package_versions v ON v.package_id = a.package_id AND v.version = a.version
   WHERE a.package_id = p_package_id AND a.version = p_version AND a.decision = 'approve' AND a.recorded_at <= p_at
     AND (a.revoked_at IS NULL OR a.revoked_at > p_at) AND a.expires_at > p_at AND a.version_digest = v.version_digest
     AND decision.approver_eligibility_as_of(a.approver_principal_id, a.tenant_id, a.domain_id, v.approver_policy, p_at) IS NOT NULL
   ORDER BY a.approver_principal_id, a.recorded_at;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.live_approvals_as_of(uuid, int, timestamptz) TO eye_app, eye_commit;

-- ============================================================
-- 3. The approved criterion binds its twin and its interval.
-- ============================================================
CREATE OR REPLACE FUNCTION decision.set_choice(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_choice jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; k jsonb; v_from date; v_to date;
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
    -- THE INTENDED TARGET: the twin the observation is taken on, bound in the signed choice even when no run supplies it
    IF (k ->> 'twin_id') IS NULL OR (k ->> 'twin_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'choice rejected: criterion % names no twin_id; the outcome is observed on a twin the choice binds', k ->> 'key' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM twin.twins_current t WHERE t.twin_id = (k ->> 'twin_id')::uuid AND t.tenant_id = p_tenant AND t.domain_id = p_domain) THEN
      RAISE EXCEPTION 'choice rejected: criterion % names twin %, which is not a twin of this domain', k ->> 'key', k ->> 'twin_id' USING ERRCODE = '23503';
    END IF;
    -- THE INTENDED INTERVAL: the period the quantity is judged over, ending by the criterion's date
    IF jsonb_typeof(k -> 'period') IS DISTINCT FROM 'object' OR coalesce(k -> 'period' ->> 'from', '') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(k -> 'period' ->> 'to', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'choice rejected: criterion % names no period {from, to}; the outcome is judged over an interval the choice binds', k ->> 'key' USING ERRCODE = '22023';
    END IF;
    v_from := (k -> 'period' ->> 'from')::date; v_to := (k -> 'period' ->> 'to')::date;
    IF v_from > v_to THEN RAISE EXCEPTION 'choice rejected: criterion % has a period that ends before it starts', k ->> 'key' USING ERRCODE = '22023'; END IF;
    IF v_to > (k ->> 'by')::date THEN RAISE EXCEPTION 'choice rejected: criterion % has a period ending %, after its date % (by)', k ->> 'key', v_to, k ->> 'by' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT k2 ->> 'key') FROM jsonb_array_elements(p_choice -> 'outcome_criteria') k2) <> jsonb_array_length(p_choice -> 'outcome_criteria') THEN
    RAISE EXCEPTION 'choice rejected: outcome criteria carry distinct keys' USING ERRCODE = '22023';
  END IF;
  UPDATE decision.package_versions SET choice = p_choice WHERE package_id = p_package_id AND version = p_version;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'choice.set', p_actor, jsonb_build_object('version', p_version, 'option_key', p_choice ->> 'option_key', 'action_owner', p_choice ->> 'action_owner'), p_correlation);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decision.record_outcome(
  p_outcome_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_criterion_key text, p_twin_id uuid, p_twin_version int, p_element_key text, p_reconciliation_id uuid,
  p_title text, p_statement text, p_header_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, twin, simulation, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; crit jsonb; e twin.state_elements%ROWTYPE; tv record; rc record; fc jsonb; v_runs uuid[]; v_twins uuid[]; v_simulated boolean; v_value numeric; v_target numeric; v_met boolean; v_sim jsonb; v_cmt uuid; v_rec timestamptz; v_from date; v_to date;
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
  IF (crit ->> 'observed_on') IS DISTINCT FROM ('twin:' || p_element_key) THEN
    RAISE EXCEPTION 'outcome rejected: criterion % is observed on % (observed_on); element % was offered', p_criterion_key, coalesce(crit ->> 'observed_on', 'nothing'), p_element_key USING ERRCODE = '22023';
  END IF;
  -- THE TWIN: the one the signed choice binds; for choices made before that binding existed, the twins the version's options ran on
  IF (crit ->> 'twin_id') IS NOT NULL THEN
    IF (crit ->> 'twin_id')::uuid <> p_twin_id THEN
      RAISE EXCEPTION 'outcome rejected: criterion % is observed on twin % (bound in the approved choice); twin % was offered', p_criterion_key, crit ->> 'twin_id', p_twin_id USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT coalesce(array_agg(DISTINCT r.twin_id), ARRAY[]::uuid[]) INTO v_twins
      FROM decision.options o, jsonb_array_elements(o.consequences) x JOIN simulation.runs_current r ON r.run_id = (x ->> 'id')::uuid
     WHERE o.package_id = p_package_id AND o.version = v.version AND (x ->> 'kind') = 'run';
    IF array_length(v_twins, 1) IS NULL THEN
      RAISE EXCEPTION 'outcome rejected: criterion % binds no twin and no option of the decision was simulated; the observation target is unbound', p_criterion_key USING ERRCODE = '22023';
    END IF;
    IF NOT (p_twin_id = ANY (v_twins)) THEN RAISE EXCEPTION 'outcome rejected: twin % is not a twin the decision''s options rest on', p_twin_id USING ERRCODE = '22023'; END IF;
  END IF;
  -- THE PERIOD: the observation states its period; it covers the interval the choice binds, and ends by the criterion's date
  IF e.valid_to IS NULL THEN RAISE EXCEPTION 'outcome rejected: the observed element states no period (valid_to); the criterion is judged over a period ending by %', crit ->> 'by' USING ERRCODE = '22023'; END IF;
  IF e.valid_to > (crit ->> 'by')::date THEN
    RAISE EXCEPTION 'outcome rejected: the observed period ends %, after the criterion''s date % (by)', e.valid_to, crit ->> 'by' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(crit -> 'period') = 'object' THEN
    v_from := (crit -> 'period' ->> 'from')::date; v_to := (crit -> 'period' ->> 'to')::date;
    IF e.valid_from IS NULL OR e.valid_from > v_from OR e.valid_to < v_to THEN
      RAISE EXCEPTION 'outcome rejected: the observed period % to % does not cover the interval the criterion binds (% to %); an aggregate over another period is not this outcome',
        coalesce(e.valid_from::text, 'unstated'), e.valid_to, v_from, v_to USING ERRCODE = '22023';
    END IF;
  END IF;
  -- THE CHRONOLOGY: the observation entered after the decision
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
-- 4. A replay names every contributor with its controls.
-- ============================================================
/*
 * The contributors of a replay, layer by layer, with the controls their canonical records carry:
 * known evidence, believed claims/forecasts/assumptions/warnings, tested runs, the decided version,
 * and in the observed layer the later versions, outcomes and warnings. A contributor whose record
 * cannot be resolved is reported with `unresolved: true` and fails closed (restricted, synthetic).
 */
CREATE OR REPLACE FUNCTION decision.replay_contributors(p_content jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, objects, pg_catalog, pg_temp AS $$
  WITH refs AS (
    SELECT 'known' AS layer, 'EVD' AS object_type, (x ->> 'id')::uuid AS id, (x ->> 'version')::int AS version FROM jsonb_array_elements(coalesce(p_content -> 'known', '[]'::jsonb)) x
    UNION ALL SELECT 'believed', 'CLM', (x ->> 'id')::uuid, (x ->> 'version')::int FROM jsonb_array_elements(coalesce(p_content -> 'believed' -> 'claims', '[]'::jsonb)) x
    UNION ALL SELECT 'believed', 'FCT', (x ->> 'id')::uuid, (x ->> 'version')::int FROM jsonb_array_elements(coalesce(p_content -> 'believed' -> 'forecasts', '[]'::jsonb)) x
    UNION ALL SELECT 'believed', 'ASU', (x ->> 'id')::uuid, (x ->> 'version')::int FROM jsonb_array_elements(coalesce(p_content -> 'believed' -> 'assumptions', '[]'::jsonb)) x
    UNION ALL SELECT 'believed', 'WRN', (x ->> 'id')::uuid, (x ->> 'version')::int FROM jsonb_array_elements(coalesce(p_content -> 'believed' -> 'warnings', '[]'::jsonb)) x
    UNION ALL SELECT 'tested', 'SIM', (x ->> 'run_id')::uuid, 1 FROM jsonb_array_elements(coalesce(p_content -> 'tested' -> 'runs', '[]'::jsonb)) x
    UNION ALL SELECT 'decided', 'DPK', (p_content ->> 'package_id')::uuid, (p_content ->> 'version')::int
    UNION ALL SELECT 'observed', x ->> 'object_type', (x ->> 'id')::uuid, (x ->> 'version')::int FROM jsonb_array_elements(coalesce(p_content -> 'observed' -> 'later_versions', '[]'::jsonb)) x
    UNION ALL SELECT 'observed', 'OUT', (x ->> 'id')::uuid, 1 FROM jsonb_array_elements(coalesce(p_content -> 'observed' -> 'outcomes', '[]'::jsonb)) x
    UNION ALL SELECT 'observed', 'WRN', (x ->> 'warning_id')::uuid, NULL FROM jsonb_array_elements(coalesce(p_content -> 'observed' -> 'warnings', '[]'::jsonb)) x
  ),
  resolved AS (
    SELECT r.layer, r.object_type, r.id, r.version, o.object_version, o.classification, o.synthetic_state, o.rights_profile, o.residency_profile, o.retention_profile, o.access_policy_ref
      FROM refs r LEFT JOIN LATERAL (
        SELECT * FROM objects.canonical_objects c WHERE c.object_type = r.object_type AND c.object_id = r.id AND (r.version IS NULL OR c.object_version = r.version)
         ORDER BY c.object_version DESC LIMIT 1) o ON true)
  SELECT coalesce(jsonb_agg(jsonb_build_object('layer', layer, 'object_type', object_type, 'id', id, 'version', coalesce(object_version, version),
                                               'unresolved', object_version IS NULL,
                                               'classification', coalesce(classification, 'restricted'), 'synthetic_state', coalesce(synthetic_state, true),
                                               'rights_profile', rights_profile, 'residency_profile', residency_profile, 'retention_profile', retention_profile, 'access_policy_ref', access_policy_ref)
                            ORDER BY layer, object_type, id, coalesce(object_version, version)), '[]'::jsonb)
    FROM resolved;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.replay_contributors(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.replay_contributors(jsonb) TO eye_app, eye_commit;

-- ============================================================
-- 5. Stop conditions per agent kind.
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
    -- every accepted condition is one this agent kind's task enforces: max_items on the decision draft and the briefing; on_degraded on the briefing
    IF (sc ->> 'kind') = 'max_items' AND p_kind NOT IN ('decision', 'briefing') THEN
      RAISE EXCEPTION 'agent rejected: stop condition max_items is not enforced by a % agent''s task; an unenforced control is not accepted', p_kind USING ERRCODE = '22023';
    END IF;
    IF (sc ->> 'kind') = 'on_degraded' AND p_kind <> 'briefing' THEN
      RAISE EXCEPTION 'agent rejected: stop condition on_degraded is not enforced by a % agent''s task; an unenforced control is not accepted', p_kind USING ERRCODE = '22023';
    END IF;
    IF (sc ->> 'kind') = 'max_items' AND (jsonb_typeof(sc -> 'value') <> 'number' OR (sc ->> 'value')::numeric < 0) THEN
      RAISE EXCEPTION 'agent rejected: stop condition max_items names a non-negative value' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  INSERT INTO executive.agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_kind, agent_version, code_digest, owner_principal_id, escalation_principal_id, budgets, stop_conditions, created_by, correlation_id)
  VALUES (p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_kind, p_version, p_code_digest, p_owner, p_escalation, p_budgets, coalesce(p_stop_conditions, '[]'::jsonb), p_actor, p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'principal_id', p_principal, 'kind', p_kind);
END $$ LANGUAGE plpgsql;
