-- ============================================================
-- 0035 — PHASE 5 · one consolidated correction pass against the Codex review of
-- f66a958d. Forward only: 0032–0034 are untouched; what they defined is replaced
-- here where the review found it wanting.
--
--   §1  elements: a predicted element carries its forecast's validation state;
--       a claim-derived element without a truth state fails the CHECK closed
--   §2  the state-set digest binds the inherited validation
--   §3  ground_element: the port refuses a NULL claim basis and a predicted element
--       without its validation state
--   §4  open_version: CARRY-FORWARD re-evaluates health under the NEW cut-offs
--   §5  unusable_inputs: the inputs the SELECTED component actually uses
--   §6  runs: scenario binding columns, shock basis, world cut-off required
--   §7  open_run: binds the scenario version and branch; refuses a contradicting
--       shock, a missing world cut-off, an unusable required input
--   §8  complete_run: the run depends on the scenario it applied
--   §9  record_impact: every citation route marks its versions
--   §10 record_reconciliation: admitted, compatible, same target, LATER observation
--   §11 SIM@v2
-- ============================================================

-- ============================================================
-- 1. Elements.
-- ============================================================
ALTER TABLE twin.state_elements
  ADD COLUMN inherited_validation text
    CHECK (inherited_validation IS NULL OR inherited_validation IN ('validated', 'validated_retrospective', 'unvalidated', 'validation_impossible'));
COMMENT ON COLUMN twin.state_elements.inherited_validation IS
  'the validation state of the forecast version a PREDICTED element cites, carried exactly; a run inherits it into its own validation status';

/*
 * FAIL CLOSED. `tse_observed_basis` and `tse_estimated_basis` evaluate to SQL NULL when a
 * claim-derived element carries no truth state, and a CHECK that evaluates to NULL
 * passes. A claim citation now REQUIRES the basis truth state, so the basis checks
 * always have something to decide on. NOT VALID: rows written before this migration are
 * history; every row written from here on is checked.
 */
ALTER TABLE twin.state_elements
  ADD CONSTRAINT tse_claim_basis_named CHECK (twin.citation_count(citations, 'claim') = 0 OR basis_truth_state IS NOT NULL) NOT VALID;
ALTER TABLE twin.state_elements
  ADD CONSTRAINT tse_predicted_validation CHECK (kind <> 'predicted' OR inherited_validation IS NOT NULL) NOT VALID;

-- ============================================================
-- 2. The state-set digest binds the inherited validation.
-- ============================================================
CREATE OR REPLACE FUNCTION twin.state_set_digest(p_twin_id uuid, p_version int) RETURNS text
STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to(coalesce((
    SELECT jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value,
                                        'unit', e.unit, 'material', e.material, 'citations', e.citations, 'health', e.health,
                                        'valid_from', e.valid_from, 'valid_to', e.valid_to, 'confidence', e.confidence,
                                        'synthetic_state', e.synthetic_state, 'inherited_validation', e.inherited_validation) ORDER BY e.key)::text
      FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_version), '[]'), 'UTF8')), 'hex');
$$ LANGUAGE sql;

-- ============================================================
-- 3. ground_element: the port refuses what the CHECKs refuse, in words.
-- ============================================================
DROP FUNCTION twin.ground_element(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,text,jsonb,text,date,date,numeric,boolean,jsonb,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION twin.ground_element(
  p_element_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_version int, p_key text, p_kind text, p_basis text,
  p_value jsonb, p_unit text, p_citations jsonb, p_health text, p_valid_from date, p_valid_to date, p_confidence numeric,
  p_synthetic boolean, p_controls jsonb, p_inherited_validation text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_material boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.ground']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_version
                   AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'draft') THEN
    RAISE EXCEPTION 'grounding rejected: version % of twin % is not an open draft in this domain', p_version, p_twin_id USING ERRCODE = '2F002';
  END IF;
  IF NOT twin.citations_ok(p_citations) THEN
    RAISE EXCEPTION 'grounding rejected: citations must be an array of {kind, id, version, digest} binding exact objects' USING ERRCODE = '22023';
  END IF;
  IF twin.citation_count(p_citations, 'claim') > 0 AND p_basis IS NULL THEN
    RAISE EXCEPTION 'grounding rejected: % cites a claim and names no truth state for it — a derived claim keeps its truth state', p_key USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'predicted' AND p_inherited_validation IS NULL THEN
    RAISE EXCEPTION 'grounding rejected: % is predicted and carries no validation state from its forecast', p_key USING ERRCODE = '22023';
  END IF;
  v_material := twin.key_is_material(p_twin_id, p_key);
  IF v_material AND (twin.citation_count(p_citations, 'evidence') + twin.citation_count(p_citations, 'claim') + twin.citation_count(p_citations, 'forecast')
                     + twin.citation_count(p_citations, 'assumption') + twin.citation_count(p_citations, 'run')) = 0 THEN
    RAISE EXCEPTION 'grounding rejected: % is material for this twin and is substantiated by nothing but an entity — an entity names a subject, it substantiates no value', p_key
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO twin.state_elements (
    element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, basis_truth_state, value, unit, material, citations,
    health, valid_from, valid_to, confidence, synthetic_state, controls, inherited_validation, grounded_by, correlation_id
  ) VALUES (
    p_element_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_version, p_key, p_kind, p_basis, p_value, p_unit, v_material, p_citations,
    p_health, p_valid_from, p_valid_to, p_confidence, coalesce(p_synthetic, false), coalesce(p_controls, '{}'::jsonb), p_inherited_validation, p_actor, p_correlation);
  UPDATE twin.twin_versions SET element_count = element_count + 1 WHERE twin_id = p_twin_id AND version = p_version;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'element.grounded', p_actor,
          jsonb_build_object('version', p_version, 'key', p_key, 'kind', p_kind, 'material', v_material, 'health', p_health,
                             'citations', p_citations, 'synthetic_state', coalesce(p_synthetic, false), 'inherited_validation', p_inherited_validation), p_correlation);
  RETURN v_material;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.ground_element(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,text,jsonb,text,date,date,numeric,boolean,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.ground_element(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,text,jsonb,text,date,date,numeric,boolean,jsonb,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 4. open_version: CARRY-FORWARD re-evaluates health under the NEW cut-offs.
--    A copied element keeps its value and citations; what it may claim to be
--    under a different known_at and observed_through is decided again: a cited
--    object recorded after the new known_at is not yet known (incomplete); a
--    withdrawn or retired one is unreadable; an observation dated (its event time —
--    a record's stated document time) after the new world cut-off is not yet observed
--    (incomplete); a validity that ended before it is stale.
-- ============================================================
CREATE OR REPLACE FUNCTION twin.open_version(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_branch text, p_forked_from int, p_known_at timestamptz, p_observed_through date,
  p_carry_from int, p_except text[], p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS int
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; v_supersedes int; v_open int; v_health jsonb := '{}'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.version']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM twin.twins_current t WHERE t.twin_id = p_twin_id AND t.tenant_id = p_tenant AND t.domain_id = p_domain) THEN
    RAISE EXCEPTION 'version rejected: no such twin in this domain' USING ERRCODE = '23503';
  END IF;
  SELECT count(*) INTO v_open FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.branch_id = p_branch AND v.state = 'draft';
  IF v_open > 0 THEN
    RAISE EXCEPTION 'version rejected: branch % already has an open draft; admit it or ground into it', p_branch USING ERRCODE = '22023';
  END IF;
  IF p_forked_from IS NOT NULL AND NOT EXISTS (SELECT 1 FROM twin.twin_versions v
      WHERE v.twin_id = p_twin_id AND v.version = p_forked_from AND v.state = 'admitted') THEN
    RAISE EXCEPTION 'version rejected: fork source % is not an admitted version of this twin', p_forked_from USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_next FROM twin.twin_versions WHERE twin_id = p_twin_id;
  SELECT max(version) INTO v_supersedes FROM twin.twin_versions WHERE twin_id = p_twin_id AND branch_id = p_branch AND state = 'admitted';
  INSERT INTO twin.twin_versions (
    twin_id, version, scope, tenant_id, domain_id, branch_id, forked_from_version, supersedes, state, known_at, observed_through,
    opened_by, correlation_id
  ) VALUES (p_twin_id, v_next, 'DOMAIN', p_tenant, p_domain, p_branch, p_forked_from, v_supersedes, 'draft', p_known_at, p_observed_through,
            p_actor, p_correlation);
  IF p_carry_from IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_carry_from AND v.state = 'admitted') THEN
      RAISE EXCEPTION 'version rejected: carry-from source % is not an admitted version of this twin', p_carry_from USING ERRCODE = '23503';
    END IF;
    INSERT INTO twin.state_elements (
      element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, basis_truth_state, value, unit, material, citations,
      health, valid_from, valid_to, confidence, synthetic_state, controls, inherited_validation, grounded_by, correlation_id)
    SELECT gen_random_uuid(), e.scope, e.tenant_id, e.domain_id, e.twin_id, v_next, e.key, e.kind, e.basis_truth_state, e.value, e.unit,
           e.material, e.citations,
           CASE
             WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c
                            JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                                                             AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                           WHERE (c ->> 'kind') <> 'entity' AND o.lifecycle_state IN ('withdrawn', 'retired')) THEN 'unreadable'
             WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c
                            JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                                                             AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                           WHERE (c ->> 'kind') <> 'entity' AND o.recorded_at > p_known_at) THEN 'incomplete'
             WHEN e.kind IN ('observed', 'estimated') AND p_observed_through IS NOT NULL AND e.valid_from IS NOT NULL AND e.valid_from > p_observed_through THEN 'incomplete'
             WHEN e.kind IN ('observed', 'estimated') AND p_observed_through IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c
                            JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                                                             AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                           WHERE (c ->> 'kind') = 'evidence' AND o.event_time IS NOT NULL AND (o.event_time AT TIME ZONE 'UTC')::date > p_observed_through) THEN 'incomplete'
             WHEN p_observed_through IS NOT NULL AND e.valid_to IS NOT NULL AND e.valid_to < p_observed_through THEN 'stale'
             ELSE e.health END,
           e.valid_from, e.valid_to, e.confidence, e.synthetic_state, e.controls, e.inherited_validation, p_actor, p_correlation
      FROM twin.state_elements e
     WHERE e.twin_id = p_twin_id AND e.version = p_carry_from AND NOT (e.key = ANY (coalesce(p_except, ARRAY[]::text[])));
    UPDATE twin.twin_versions SET element_count = (SELECT count(*) FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = v_next)
     WHERE twin_id = p_twin_id AND version = v_next;
    SELECT coalesce(jsonb_object_agg(h, n), '{}'::jsonb) INTO v_health
      FROM (SELECT e.health h, count(*) n FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = v_next GROUP BY e.health) x;
  END IF;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'version.opened', p_actor,
          jsonb_build_object('version', v_next, 'branch_id', p_branch, 'forked_from_version', p_forked_from, 'supersedes', v_supersedes,
                             'known_at', p_known_at, 'observed_through', p_observed_through, 'carried_from', p_carry_from, 'except', to_jsonb(p_except),
                             'carried_health', v_health), p_correlation);
  RETURN v_next;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 5. The inputs the SELECTED component actually uses.
--    `missing_required_keys` answers for the version as a whole (any component). A
--    run is for ONE component, and for that component a required prefix is satisfied
--    only by a COMPLETE element that is the component's own (`prefix:component`), a
--    global one (`prefix`), or — for shipments — a shipment of that component.
-- ============================================================
CREATE OR REPLACE FUNCTION twin.unusable_inputs(p_twin_id uuid, p_version int, p_component text) RETURNS jsonb
STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH req AS (
    SELECT DISTINCT unnest(k.material_keys || m.required_inputs) AS prefix
      FROM twin.twins_current t JOIN twin.twin_kind_schemas k ON k.kind = t.kind
      JOIN twin.behaviour_models m ON m.method_ref = t.behaviour_model_ref
     WHERE t.twin_id = p_twin_id),
  /* The components this version holds inventory for: a key suffixed with ANOTHER component is that component's, not ours;
     a key suffixed with something that is no component (a production line, a route) is shared context. */
  comps AS (
    SELECT DISTINCT split_part(e.key, ':', 2) AS c FROM twin.state_elements e
     WHERE e.twin_id = p_twin_id AND e.version = p_version AND e.key LIKE 'inventory.on_hand:%'),
  cand AS (
    SELECT r.prefix, e.key, e.health
      FROM req r
      LEFT JOIN twin.state_elements e
        ON e.twin_id = p_twin_id AND e.version = p_version AND split_part(e.key, ':', 1) = r.prefix
       AND (e.key = r.prefix OR split_part(e.key, ':', 2) = p_component
            OR (r.prefix <> 'shipment' AND split_part(e.key, ':', 2) <> '' AND NOT EXISTS (SELECT 1 FROM comps WHERE comps.c = split_part(e.key, ':', 2)))
            OR (r.prefix = 'shipment' AND coalesce(e.value ->> 'component', p_component) = p_component))),
  verdict AS (
    SELECT prefix,
           CASE WHEN count(key) = 0 THEN 'missing'
                WHEN bool_or(health = 'complete') THEN NULL
                ELSE (array_agg(health ORDER BY CASE health WHEN 'unreadable' THEN 0 WHEN 'stale' THEN 1 ELSE 2 END))[1] END AS problem,
           coalesce(jsonb_agg(jsonb_build_object('key', key, 'health', health)) FILTER (WHERE key IS NOT NULL), '[]'::jsonb) AS candidates
      FROM cand GROUP BY prefix)
  SELECT coalesce(jsonb_agg(jsonb_build_object('input', prefix, 'problem', problem, 'candidates', candidates) ORDER BY prefix), '[]'::jsonb)
    FROM verdict WHERE problem IS NOT NULL;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.unusable_inputs(uuid,int,text) TO eye_app, eye_commit;

-- ============================================================
-- 6. Runs: the scenario binding, the shock basis, the world cut-off.
-- ============================================================
ALTER TABLE simulation.runs_current
  ADD COLUMN scenario_version      int  CHECK (scenario_version IS NULL OR scenario_version >= 1),
  ADD COLUMN scenario_branch_state text CHECK (scenario_branch_state IS NULL OR scenario_branch_state IN ('open', 'flipped', 'closed')),
  ADD COLUMN scenario_flip_event   uuid,
  /* Runs opened before this migration recorded no basis for their shock: they say so. */
  ADD COLUMN shock_basis           text NOT NULL DEFAULT 'unrecorded'
    CHECK (shock_basis IN ('none', 'hypothetical', 'scenario-branch-flipped', 'unrecorded'));
COMMENT ON COLUMN simulation.runs_current.shock_basis IS
  'none: no shock; hypothetical: a shock the operator asserted with no scenario behind it; scenario-branch-flipped: the bound scenario branch is FLIPPED; unrecorded: opened before 0035';
ALTER TABLE simulation.runs_current
  ADD CONSTRAINT sim_world_cutoff CHECK (observed_through IS NOT NULL) NOT VALID,
  ADD CONSTRAINT sim_scenario_bound CHECK (scenario_id IS NULL OR (scenario_version IS NOT NULL AND scenario_branch_id IS NOT NULL AND scenario_branch_state IS NOT NULL)) NOT VALID,
  ADD CONSTRAINT sim_shock_basis_consistent CHECK (
    shock_basis = 'unrecorded'
    OR (shock_basis = 'none' AND NOT shock)
    OR (shock_basis = 'hypothetical' AND shock AND scenario_id IS NULL)
    OR (shock_basis = 'scenario-branch-flipped' AND shock AND scenario_id IS NOT NULL AND scenario_branch_state = 'flipped')) NOT VALID;

CREATE OR REPLACE FUNCTION simulation.runs_immutable() RETURNS trigger
SET search_path = simulation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'simulation runs are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'simulation run % is % and immutable; a correction is a new run that names it', OLD.run_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  IF NEW.run_id <> OLD.run_id OR NEW.twin_id <> OLD.twin_id OR NEW.twin_version <> OLD.twin_version OR NEW.initial_state <> OLD.initial_state
     OR NEW.initial_state_digest <> OLD.initial_state_digest OR NEW.inputs_digest <> OLD.inputs_digest OR NEW.interventions <> OLD.interventions
     OR NEW.constraints <> OLD.constraints OR NEW.assumptions <> OLD.assumptions OR NEW.implementation_digest <> OLD.implementation_digest
     OR NEW.environment_digest <> OLD.environment_digest OR NEW.stochastic_mode <> OLD.stochastic_mode OR NEW.seed IS DISTINCT FROM OLD.seed
     OR NEW.samples IS DISTINCT FROM OLD.samples OR NEW.control_run_id IS DISTINCT FROM OLD.control_run_id OR NEW.run_kind <> OLD.run_kind
     OR NEW.scenario_id IS DISTINCT FROM OLD.scenario_id OR NEW.scenario_branch_id IS DISTINCT FROM OLD.scenario_branch_id
     OR NEW.scenario_version IS DISTINCT FROM OLD.scenario_version OR NEW.scenario_branch_state IS DISTINCT FROM OLD.scenario_branch_state
     OR NEW.shock <> OLD.shock OR NEW.shock_basis <> OLD.shock_basis OR NEW.controls <> OLD.controls THEN
    RAISE EXCEPTION 'the experiment contract of run % is bound at opening and cannot change', OLD.run_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

/* The classification rank the controls fold uses; an unknown level is restricted. */
CREATE OR REPLACE FUNCTION simulation.classification_rank(p text) RETURNS int
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p WHEN 'public' THEN 0 WHEN 'internal' THEN 1 WHEN 'confidential' THEN 2 ELSE 3 END;
$$ LANGUAGE sql;

-- ============================================================
-- 7. open_run: the scenario is RESOLVED and BOUND; the shock has a basis; the world
--    cut-off and the selected component's inputs are required.
-- ============================================================
DROP FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,boolean,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,uuid,uuid,uuid);
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
  v_unusable jsonb; b prediction.branches_current%ROWTYPE; v_scn_version int; v_expected_basis text; v_flip uuid;
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
   * THE SCENARIO. A scenario names the branch whose state gives the shock its basis; the
   * run binds the exact SCN canonical version and the branch's state at opening. A shock
   * that contradicts the branch is refused; a shock with no scenario is a HYPOTHETICAL and
   * is recorded as one — it never reads as an observed flip.
   */
  IF p_scenario_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'run rejected: scenario % is not an authorized scenario in this domain', p_scenario_id USING ERRCODE = '23503';
    END IF;
    SELECT * INTO b FROM prediction.branches_current WHERE branch_id = p_scenario_branch_id AND scenario_id = p_scenario_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'run rejected: branch % is not a branch of scenario %', p_scenario_branch_id, p_scenario_id USING ERRCODE = '22023';
    END IF;
    IF b.state IS DISTINCT FROM p_scenario_branch_state THEN
      RAISE EXCEPTION 'run rejected: branch % is % now, not %', p_scenario_branch_id, b.state, p_scenario_branch_state USING ERRCODE = '22023';
    END IF;
    IF p_shock <> (b.state = 'flipped') THEN
      RAISE EXCEPTION 'run rejected: the shock contradicts the bound branch: branch % is % (a shock without a flipped branch is a hypothetical and names no scenario)', p_scenario_branch_id, b.state USING ERRCODE = '22023';
    END IF;
    SELECT max(o.object_version)::int INTO v_scn_version FROM objects.canonical_objects o
     WHERE o.object_type = 'SCN' AND o.object_id = p_scenario_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
    IF v_scn_version IS NULL OR v_scn_version <> p_scenario_version THEN
      RAISE EXCEPTION 'run rejected: scenario % is at version %, not %', p_scenario_id, v_scn_version, p_scenario_version USING ERRCODE = '22023';
    END IF;
    v_flip := b.flip_event_id;
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
  /* Controls: folded by the service from the twin version and the scenario; never LESS restricted than the twin's. */
  v_controls := coalesce(p_controls, v.controls);
  IF simulation.classification_rank(v_controls ->> 'classification') < simulation.classification_rank(v.controls ->> 'classification')
     OR (coalesce((v.controls ->> 'synthetic_state')::boolean, false) AND NOT coalesce((v_controls ->> 'synthetic_state')::boolean, false)) THEN
    RAISE EXCEPTION 'run rejected: the controls offered are less restricted than the twin version''s' USING ERRCODE = '22023';
  END IF;
  -- The snapshot: every element of the version, with citations, health, inherited validation and controls, in key order.
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
REVOKE ALL ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 8. complete_run: the run rests on its twin version, its control, AND the scenario it applied.
-- ============================================================
CREATE OR REPLACE FUNCTION simulation.complete_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_outputs jsonb, p_outputs_digest text, p_sensitivity jsonb, p_outside_envelope boolean, p_header_digest text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = simulation, twin, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run.complete']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM simulation.runs_current WHERE run_id = p_run_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'completion rejected: no such run in this domain' USING ERRCODE = '23503'; END IF;
  IF r.state <> 'opened' THEN RAISE EXCEPTION 'completion rejected: run % is already %', p_run_id, r.state USING ERRCODE = '2F002'; END IF;
  UPDATE simulation.runs_current
     SET outputs = p_outputs, outputs_digest = p_outputs_digest, sensitivity = p_sensitivity, outside_envelope = coalesce(p_outside_envelope, false),
         header_digest = p_header_digest, state = 'completed', completed_at = clock_timestamp()
   WHERE run_id = p_run_id;
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.completed', p_actor,
          jsonb_build_object('outputs_digest', p_outputs_digest, 'inputs_digest', r.inputs_digest, 'header_digest', p_header_digest, 'outside_envelope', coalesce(p_outside_envelope, false)), p_correlation);
  INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'SIM', 'twin', r.twin_id,
          format('run on twin version %s (branch %s)', r.twin_version, r.branch_id), 'active', p_actor, p_correlation)
  ON CONFLICT DO NOTHING;
  IF r.control_run_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'SIM', 'run', r.control_run_id, 'intervention run compared against this control', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
  IF r.scenario_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'SIM', 'strategy', r.scenario_id,
            format('run applied scenario version %s, branch %s (%s)', r.scenario_version, r.scenario_branch_id, r.scenario_branch_state), 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 9. record_impact: EVERY citation route the walk found marks its versions. A twin
--    reached both through the corrected evidence and through a claim derived from it
--    has two routes; a version citing either is marked.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_forecasts jsonb, p_twins jsonb, p_simulations jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, prediction, twin, simulation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; cov record; f jsonb; t jsonb; r jsonb; v_versions int[]; v_version int; v_marked jsonb := '[]'::jsonb; v_routes text[];
  v_cov_state text; v_cov_roots int := 0; v_cov_covered int := 0; v_cov_outstanding int := 0;
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
         statement = p_statement,
         truncated = coalesce(p_truncated, false),
         unexplored = coalesce(p_unexplored, '[]'::jsonb),
         state = 'assessed', assessed_at = clock_timestamp()
   WHERE invalidation_id = p_invalidation_id
   RETURNING correction_case_id INTO v_case;
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
      'truncated', coalesce(p_truncated, false),
      'unexplored', jsonb_array_length(coalesce(p_unexplored, '[]'::jsonb)),
      'correction_case_id', v_case, 'case_propagation_state', v_cov_state,
      'roots', v_cov_roots, 'roots_covered', v_cov_covered,
      'roots_outstanding', v_cov_outstanding, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 10. record_reconciliation: both versions ADMITTED; compatible units; the same
--     target day when both name one; and the observation must cite evidence RECORDED
--     AFTER the simulated or predicted value was established. An earlier count is not
--     a later confirmation; matching target dates are exactly what is expected.
-- ============================================================
CREATE OR REPLACE FUNCTION twin.record_reconciliation(
  p_reconciliation_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_key text, p_from_version int, p_against_version int, p_note text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a twin.state_elements%ROWTYPE; b twin.state_elements%ROWTYPE; v_diff jsonb; v_basis_at timestamptz; v_observed_at timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.ground']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM twin.state_elements WHERE twin_id = p_twin_id AND version = p_from_version AND key = p_key AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation rejected: no element % in version %', p_key, p_from_version USING ERRCODE = '23503'; END IF;
  IF a.kind NOT IN ('simulated', 'predicted') THEN
    RAISE EXCEPTION 'reconciliation rejected: % in version % is %, not simulated or predicted', p_key, p_from_version, a.kind USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_from_version AND v.state = 'admitted') THEN
    RAISE EXCEPTION 'reconciliation rejected: version % is a draft, not admitted; a reconciliation compares admitted state', p_from_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO b FROM twin.state_elements WHERE twin_id = p_twin_id AND version = p_against_version AND key = p_key AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation rejected: no element % in version %', p_key, p_against_version USING ERRCODE = '23503'; END IF;
  IF b.kind <> 'observed' OR b.health <> 'complete' THEN
    RAISE EXCEPTION 'reconciliation rejected: % in version % is not a complete OBSERVED element', p_key, p_against_version USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_against_version AND v.state = 'admitted') THEN
    RAISE EXCEPTION 'reconciliation rejected: version % is not admitted', p_against_version USING ERRCODE = '22023';
  END IF;
  IF a.unit IS DISTINCT FROM b.unit THEN
    RAISE EXCEPTION 'reconciliation rejected: units differ (% against %); a difference between them would mean nothing', coalesce(a.unit, 'none'), coalesce(b.unit, 'none') USING ERRCODE = '22023';
  END IF;
  IF a.valid_from IS NOT NULL AND b.valid_from IS NOT NULL AND a.valid_from <> b.valid_from THEN
    RAISE EXCEPTION 'reconciliation rejected: different targets — the % value is for % and the observation for %; a reconciliation compares the same day', a.kind, a.valid_from, b.valid_from USING ERRCODE = '22023';
  END IF;
  -- When the simulated / predicted value was ESTABLISHED: the cited run's completion, or the cited forecast's record time.
  SELECT max(x.at) INTO v_basis_at FROM (
    SELECT r.completed_at AS at FROM jsonb_array_elements(a.citations) c JOIN simulation.runs_current r ON r.run_id = (c ->> 'id')::uuid WHERE (c ->> 'kind') = 'run'
    UNION ALL
    SELECT o.recorded_at FROM jsonb_array_elements(a.citations) c JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int WHERE (c ->> 'kind') = 'forecast') x;
  -- When the observation's evidence was RECORDED: the earliest of its cited records.
  SELECT min(o.recorded_at) INTO v_observed_at FROM jsonb_array_elements(b.citations) c
    JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int WHERE (c ->> 'kind') <> 'entity';
  IF v_basis_at IS NULL OR v_observed_at IS NULL OR v_observed_at <= v_basis_at THEN
    RAISE EXCEPTION 'reconciliation rejected: the observation cites evidence recorded % — not after the % value was established (%); a reconciliation needs a LATER observation',
      v_observed_at, a.kind, v_basis_at USING ERRCODE = '22023';
  END IF;
  v_diff := CASE
    WHEN jsonb_typeof(a.value) = 'number' AND jsonb_typeof(b.value) = 'number'
      THEN jsonb_build_object('numeric', (b.value::text)::numeric - (a.value::text)::numeric,
                              'relative', CASE WHEN (a.value::text)::numeric = 0 THEN NULL ELSE ((b.value::text)::numeric - (a.value::text)::numeric) / (a.value::text)::numeric END,
                              'unit', a.unit, 'target', a.valid_from, 'established_at', v_basis_at, 'observed_recorded_at', v_observed_at)
    ELSE jsonb_build_object('equal', a.value = b.value, 'unit', a.unit, 'target', a.valid_from, 'established_at', v_basis_at, 'observed_recorded_at', v_observed_at) END;
  INSERT INTO twin.reconciliations (reconciliation_id, scope, tenant_id, domain_id, twin_id, key, from_version, from_kind, from_value, from_citations,
                                    against_version, against_value, against_citations, difference, note, recorded_by, correlation_id)
  VALUES (p_reconciliation_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_key, p_from_version, a.kind, a.value, a.citations,
          p_against_version, b.value, b.citations, v_diff, p_note, p_actor, p_correlation);
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'element.grounded', p_actor,
          jsonb_build_object('reconciliation', p_reconciliation_id, 'key', p_key, 'from_version', p_from_version, 'against_version', p_against_version, 'difference', v_diff), p_correlation);
  RETURN v_diff;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 11. SIM@v2: the scenario binding and the shock basis are part of the object.
-- ============================================================
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('SIM', 'v2', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["twin","run_kind","control_run_id","scenario","shock","shock_basis","component","cutoffs","initial_state_digest","model","environment","stochastic",
               "interventions","constraints","assumptions","inputs_digest","outputs_digest","totals","sensitivity","validation_status","operator"],
  "properties": {
    "twin": { "type": "object", "required": ["twin_id","version","branch_id"],
              "properties": { "twin_id": { "type": "string" }, "version": { "type": "integer" }, "branch_id": { "type": "string" } } },
    "run_kind": { "enum": ["control","intervention"] },
    "control_run_id": { "type": ["string","null"] },
    "corrects_run_id": { "type": ["string","null"] },
    "scenario": { "type": ["object","null"], "required": ["scenario_id","version","branch_id","branch_state"],
                  "properties": { "scenario_id": { "type": "string" }, "version": { "type": "integer", "minimum": 1 }, "branch_id": { "type": "string" },
                                  "branch_state": { "enum": ["open","flipped","closed"] }, "flip_event_id": { "type": ["string","null"] } } },
    "shock": { "type": "boolean" },
    "shock_basis": { "enum": ["none","hypothetical","scenario-branch-flipped"] },
    "component": { "type": "string" },
    "cutoffs": { "type": "object", "required": ["known_at","observed_through"], "properties": { "known_at": { "type": "string" }, "observed_through": { "type": "string" } } },
    "initial_state_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "model": { "type": "object", "required": ["ref","implementation_digest"], "properties": { "ref": { "type": "string" }, "implementation_digest": { "type": "string" } } },
    "environment": { "type": "object", "required": ["digest"] },
    "stochastic": { "type": "object", "required": ["mode"] },
    "interventions": { "type": "array", "minItems": 1 },
    "constraints": { "type": "object" },
    "assumptions": { "type": "object" },
    "inputs_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "outputs_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "totals": { "type": "object" },
    "sensitivity": { "type": "object" },
    "outside_envelope": { "type": "boolean" },
    "validation_status": { "type": "string" },
    "inherited_validation": { "type": "array", "items": { "type": "object", "required": ["key","forecast","state"],
                              "properties": { "key": { "type": "string" }, "forecast": { "type": "string" }, "state": { "type": "string" } } } },
    "operator": { "type": "string" }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;
