-- ============================================================
-- 0036 — PHASE 5 · the four residuals of the review of 1a05af89.
-- Forward only: 0032–0035 are untouched.
--
--   §1  twin.required_citations   — the exact citations the SELECTED component's
--                                   required inputs rest on (one selection rule,
--                                   shared by the port and the service)
--   §2  twin.unavailable_inputs   — of those, the ones whose object is no longer
--                                   standing (withdrawn or retired), or gone
--   §3  prediction.scenario_version_as_of / branch_state_as_of — the scenario and
--                                   its branch AS THEY STOOD at a record instant
--   §4  simulation.open_run       — a NEW run establishes availability now, and
--                                   binds the scenario under its own record cut-off
-- ============================================================

-- ============================================================
-- 1. The citations the selected component's required inputs rest on.
--    The selection rule is the one twin.unusable_inputs uses: the component's own
--    key, a shared key (a suffix that is no component of this version), or a
--    shipment of that component. An ENTITY citation names a subject and
--    substantiates nothing, so it is not an input to establish.
-- ============================================================
CREATE OR REPLACE FUNCTION twin.required_citations(p_twin_id uuid, p_version int, p_component text) RETURNS jsonb
STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH req AS (
    SELECT DISTINCT unnest(k.material_keys || m.required_inputs) AS prefix
      FROM twin.twins_current t JOIN twin.twin_kind_schemas k ON k.kind = t.kind
      JOIN twin.behaviour_models m ON m.method_ref = t.behaviour_model_ref
     WHERE t.twin_id = p_twin_id),
  comps AS (
    SELECT DISTINCT split_part(e.key, ':', 2) AS c FROM twin.state_elements e
     WHERE e.twin_id = p_twin_id AND e.version = p_version AND e.key LIKE 'inventory.on_hand:%'),
  used AS (
    SELECT e.key, e.citations
      FROM req r
      JOIN twin.state_elements e
        ON e.twin_id = p_twin_id AND e.version = p_version AND split_part(e.key, ':', 1) = r.prefix
       AND (e.key = r.prefix OR split_part(e.key, ':', 2) = p_component
            OR (r.prefix <> 'shipment' AND split_part(e.key, ':', 2) <> '' AND NOT EXISTS (SELECT 1 FROM comps WHERE comps.c = split_part(e.key, ':', 2)))
            OR (r.prefix = 'shipment' AND coalesce(e.value ->> 'component', p_component) = p_component)))
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('key', u.key, 'kind', c ->> 'kind', 'id', c ->> 'id',
                                                        'version', (c ->> 'version')::int, 'digest', c ->> 'digest')), '[]'::jsonb)
    FROM used u, LATERAL jsonb_array_elements(u.citations) c
   WHERE (c ->> 'kind') <> 'entity';
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.required_citations(uuid,int,text) TO eye_app, eye_commit;

-- ============================================================
-- 2. Of those, the inputs that are no longer available.
--
--    A version's stored health says what was true when it was grounded. It cannot
--    decide a NEW run: a document withdrawn since is not a source this run may
--    use, however complete the version was. The object's LATEST canonical version
--    decides — a withdrawal supersedes the cited version with a withdrawn one —
--    and an object this reader cannot see at all is unavailable too.
-- ============================================================
CREATE OR REPLACE FUNCTION twin.unavailable_inputs(p_twin_id uuid, p_version int, p_component text) RETURNS jsonb
STABLE SET search_path = twin, objects, pg_catalog, pg_temp AS $$
  WITH cited AS (SELECT value AS c FROM jsonb_array_elements(twin.required_citations(p_twin_id, p_version, p_component))),
  latest AS (
    SELECT cited.c AS c, (SELECT o.lifecycle_state FROM objects.canonical_objects o
                           WHERE o.object_id = (cited.c ->> 'id')::uuid
                           ORDER BY o.object_version DESC LIMIT 1) AS state
      FROM cited)
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', l.c ->> 'key', 'kind', l.c ->> 'kind', 'id', l.c ->> 'id',
                                               'version', l.c ->> 'version', 'problem', coalesce(l.state, 'not available to this reader'))
                            ORDER BY l.c ->> 'key'), '[]'::jsonb)
    FROM latest l WHERE l.state IS NULL OR l.state IN ('withdrawn', 'retired');
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.unavailable_inputs(uuid,int,text) TO eye_app, eye_commit;

-- ============================================================
-- 3. The scenario and its branch AS THEY STOOD at a record instant.
--
--    A run reads the twin under two cut-offs, and the scenario it binds is part of
--    what it reads: a tree admitted after the run's record cut-off, or a branch that
--    flipped after it, was not known then and cannot give this run's shock its basis.
--    A branch's flip carries its instant (`flipped_at`); a closure does not, so a
--    closed branch reads as closed and can never be a shock basis anyway.
-- ============================================================
CREATE OR REPLACE FUNCTION prediction.scenario_version_as_of(p_scenario_id uuid, p_at timestamptz) RETURNS int
STABLE SET search_path = prediction, objects, pg_catalog, pg_temp AS $$
  SELECT max(o.object_version)::int FROM objects.canonical_objects o
   WHERE o.object_type = 'SCN' AND o.object_id = p_scenario_id AND o.recorded_at <= p_at;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION prediction.scenario_version_as_of(uuid,timestamptz) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.branch_state_as_of(p_branch_id uuid, p_at timestamptz) RETURNS text
STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT CASE
           WHEN b.state = 'flipped' AND (b.flipped_at IS NULL OR b.flipped_at > p_at) THEN 'open'
           ELSE b.state END
    FROM prediction.branches_current b WHERE b.branch_id = p_branch_id;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION prediction.branch_state_as_of(uuid,timestamptz) TO eye_app, eye_commit;

-- ============================================================
-- 4. open_run: availability now, and the scenario under this run's record cut-off.
--    The signature is unchanged; the offered scenario version and branch state are
--    re-verified against the version's own `known_at` rather than against today.
-- ============================================================
CREATE OR REPLACE FUNCTION simulation.open_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_twin_version int, p_run_kind text, p_control_run_id uuid, p_corrects uuid,
  p_scenario_id uuid, p_scenario_branch_id uuid, p_scenario_version int, p_scenario_branch_state text, p_shock boolean, p_shock_basis text, p_component text,
  p_model_ref text, p_implementation_digest text, p_environment_digest text, p_environment jsonb,
  p_stochastic_mode text, p_rng text, p_seed bigint, p_samples int, p_jitter jsonb,
  p_interventions jsonb, p_constraints jsonb, p_assumptions jsonb, p_inputs_digest text, p_validation_status text, p_controls jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v twin.twin_versions%ROWTYPE; v_state jsonb; v_digest text; c simulation.runs_current%ROWTYPE; v_pinned text; v_controls jsonb; v_synthetic boolean;
  v_unusable jsonb; v_unavailable jsonb; b prediction.branches_current%ROWTYPE; v_scn_version int; v_branch_state text; v_expected_basis text; v_flip uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM twin.twin_versions WHERE twin_id = p_twin_id AND version = p_twin_version AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND OR v.state <> 'admitted' THEN
    RAISE EXCEPTION 'run rejected: version % of twin % is not an admitted version in this domain', p_twin_version, p_twin_id USING ERRCODE = '23503';
  END IF;
  IF v.completeness <> 'complete' THEN
    RAISE EXCEPTION 'run rejected: twin version % is incomplete (missing %); a run cannot use inputs the twin does not hold', p_twin_version, v.missing_keys::text USING ERRCODE = '22023';
  END IF;
  IF v.observed_through IS NULL THEN
    RAISE EXCEPTION 'run rejected: twin version % has no world-time cut-off (observed_through); a run reads the twin under two cut-offs', p_twin_version USING ERRCODE = '22023';
  END IF;
  v_unusable := twin.unusable_inputs(p_twin_id, p_twin_version, p_component);
  IF jsonb_array_length(v_unusable) > 0 THEN
    RAISE EXCEPTION 'run rejected: inputs for component % are not usable: %', p_component, v_unusable::text USING ERRCODE = '22023';
  END IF;
  /*
   * AVAILABILITY NOW. The version's stored health is what was true when it was
   * grounded; a NEW run is asked for now, and an input whose document has since been
   * withdrawn is not one this run may use.
   */
  v_unavailable := twin.unavailable_inputs(p_twin_id, p_twin_version, p_component);
  IF jsonb_array_length(v_unavailable) > 0 THEN
    RAISE EXCEPTION 'run rejected: required inputs for component % are no longer available: %', p_component, v_unavailable::text USING ERRCODE = '22023';
  END IF;
  SELECT implementation_digest INTO v_pinned FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF v_pinned IS NULL THEN
    RAISE EXCEPTION 'run rejected: behaviour model % has no pinned implementation', p_model_ref USING ERRCODE = '22023';
  END IF;
  IF v_pinned <> p_implementation_digest THEN
    RAISE EXCEPTION 'run rejected: the implementation offered (%) is not the pinned implementation of % (%)', p_implementation_digest, p_model_ref, v_pinned USING ERRCODE = '22023';
  END IF;
  IF p_run_kind = 'control' AND (p_control_run_id IS NOT NULL OR p_interventions <> '[{"type": "none"}]'::jsonb) THEN
    RAISE EXCEPTION 'run rejected: a control run applies `none` and references no control' USING ERRCODE = '22023';
  END IF;
  /*
   * THE SCENARIO, UNDER THIS RUN'S RECORD CUT-OFF. The tree must have been admitted at
   * or before the version's `known_at`, and the branch's state is the state it was in
   * then — a flip recorded afterwards is later information and gives this run nothing.
   */
  IF p_scenario_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'run rejected: scenario % is not an authorized scenario in this domain', p_scenario_id USING ERRCODE = '23503';
    END IF;
    SELECT * INTO b FROM prediction.branches_current WHERE branch_id = p_scenario_branch_id AND scenario_id = p_scenario_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'run rejected: branch % is not a branch of scenario %', p_scenario_branch_id, p_scenario_id USING ERRCODE = '22023';
    END IF;
    v_scn_version := prediction.scenario_version_as_of(p_scenario_id, v.known_at);
    IF v_scn_version IS NULL THEN
      RAISE EXCEPTION 'run rejected: scenario % was recorded after this version''s known_at (%); it was not known at record time', p_scenario_id, v.known_at USING ERRCODE = '22023';
    END IF;
    IF v_scn_version IS DISTINCT FROM p_scenario_version THEN
      RAISE EXCEPTION 'run rejected: scenario % stood at version % at this version''s known_at (%), not %', p_scenario_id, v_scn_version, v.known_at, p_scenario_version USING ERRCODE = '22023';
    END IF;
    v_branch_state := prediction.branch_state_as_of(p_scenario_branch_id, v.known_at);
    IF v_branch_state IS DISTINCT FROM p_scenario_branch_state THEN
      RAISE EXCEPTION 'run rejected: branch % was % at this version''s known_at (%), not %', p_scenario_branch_id, v_branch_state, v.known_at, p_scenario_branch_state USING ERRCODE = '22023';
    END IF;
    IF p_shock <> (v_branch_state = 'flipped') THEN
      RAISE EXCEPTION 'run rejected: the shock contradicts the bound branch: branch % was % at this run''s record cut-off (a shock without a flipped branch is a hypothetical and names no scenario)', p_scenario_branch_id, v_branch_state USING ERRCODE = '22023';
    END IF;
    v_flip := CASE WHEN v_branch_state = 'flipped' THEN b.flip_event_id ELSE NULL END;
    v_expected_basis := CASE WHEN p_shock THEN 'scenario-branch-flipped' ELSE 'none' END;
  ELSE
    IF p_scenario_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'run rejected: a scenario branch was named without its scenario' USING ERRCODE = '22023';
    END IF;
    v_expected_basis := CASE WHEN p_shock THEN 'hypothetical' ELSE 'none' END;
  END IF;
  IF p_shock_basis IS DISTINCT FROM v_expected_basis THEN
    RAISE EXCEPTION 'run rejected: the shock basis offered (%) is not what the binding establishes (%)', p_shock_basis, v_expected_basis USING ERRCODE = '22023';
  END IF;
  v_controls := coalesce(p_controls, v.controls);
  IF simulation.classification_rank(v_controls ->> 'classification') < simulation.classification_rank(v.controls ->> 'classification')
     OR (coalesce((v.controls ->> 'synthetic_state')::boolean, false) AND NOT coalesce((v_controls ->> 'synthetic_state')::boolean, false)) THEN
    RAISE EXCEPTION 'run rejected: the controls offered are less restricted than the twin version''s' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value, 'unit', e.unit,
                                               'material', e.material, 'citations', e.citations, 'health', e.health, 'valid_from', e.valid_from,
                                               'valid_to', e.valid_to, 'confidence', e.confidence, 'synthetic_state', e.synthetic_state, 'controls', e.controls,
                                               'inherited_validation', e.inherited_validation)
                            ORDER BY e.key), '[]'::jsonb)
    INTO v_state FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_twin_version;
  v_digest := encode(sha256(convert_to(v_state::text, 'UTF8')), 'hex');
  IF p_run_kind = 'intervention' THEN
    SELECT * INTO c FROM simulation.runs_current WHERE run_id = p_control_run_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected: control run % is not an authorized run in this domain', p_control_run_id USING ERRCODE = '23503'; END IF;
    IF c.run_kind <> 'control' THEN RAISE EXCEPTION 'run rejected: % is not a control run', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.state <> 'completed' THEN RAISE EXCEPTION 'run rejected: control run % is not completed', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.twin_id <> p_twin_id OR c.twin_version <> p_twin_version OR c.initial_state_digest <> v_digest OR c.implementation_digest <> p_implementation_digest
       OR c.assumptions <> p_assumptions OR c.constraints <> p_constraints OR c.shock <> p_shock OR c.component <> p_component
       OR c.scenario_id IS DISTINCT FROM p_scenario_id OR c.scenario_branch_id IS DISTINCT FROM p_scenario_branch_id
       OR c.scenario_version IS DISTINCT FROM p_scenario_version OR c.shock_basis <> p_shock_basis THEN
      RAISE EXCEPTION 'run rejected: control run % is not compatible (it must share the twin version, initial state, implementation, assumptions, constraints, scenario binding, shock and component)', p_control_run_id
        USING ERRCODE = '22023';
    END IF;
  END IF;
  v_synthetic := coalesce((v_controls ->> 'synthetic_state')::boolean, v.synthetic_state);
  INSERT INTO simulation.runs_current (
    run_id, scope, tenant_id, domain_id, twin_id, twin_version, branch_id, run_kind, control_run_id, corrects_run_id,
    scenario_id, scenario_branch_id, scenario_version, scenario_branch_state, scenario_flip_event, shock, shock_basis, component,
    known_at, observed_through, initial_state, initial_state_digest, model_ref, implementation_digest, environment_digest, environment,
    stochastic_mode, rng, seed, samples, jitter, interventions, constraints, assumptions, inputs_digest, validation_status, state, controls,
    operator_principal_id, correlation_id
  ) VALUES (
    p_run_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_twin_version, v.branch_id, p_run_kind, p_control_run_id, p_corrects,
    p_scenario_id, p_scenario_branch_id, p_scenario_version, p_scenario_branch_state, v_flip, p_shock, p_shock_basis, p_component,
    v.known_at, v.observed_through, v_state, v_digest, p_model_ref, p_implementation_digest, p_environment_digest, p_environment,
    p_stochastic_mode, p_rng, p_seed, p_samples, p_jitter, p_interventions, p_constraints, p_assumptions, p_inputs_digest,
    p_validation_status || CASE WHEN v.verification_state = 'unverified' THEN '; twin version UNVERIFIED (a cited input was corrected)' ELSE '' END,
    'opened', v_controls, p_actor, p_correlation);
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.opened', p_actor,
          jsonb_build_object('twin_id', p_twin_id, 'twin_version', p_twin_version, 'run_kind', p_run_kind, 'control_run_id', p_control_run_id,
                             'initial_state_digest', v_digest, 'inputs_digest', p_inputs_digest, 'stochastic_mode', p_stochastic_mode,
                             'scenario_id', p_scenario_id, 'scenario_version', p_scenario_version, 'scenario_branch_id', p_scenario_branch_id,
                             'scenario_branch_state', p_scenario_branch_state, 'shock_basis', p_shock_basis), p_correlation);
  RETURN jsonb_build_object('initial_state', v_state, 'initial_state_digest', v_digest, 'known_at', v.known_at, 'observed_through', v.observed_through,
                            'branch_id', v.branch_id, 'synthetic_state', v_synthetic, 'controls', v_controls, 'verification_state', v.verification_state,
                            'scenario_flip_event', v_flip);
END $$ LANGUAGE plpgsql;
