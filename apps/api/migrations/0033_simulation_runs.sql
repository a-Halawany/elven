-- ============================================================
-- 0033 — PHASE 5 · SIMULATION (L8), stage P5-M3: runs, reproductions, SIM@v1.
--
-- A run is an EXPERIMENT CONTRACT (Vol 0 §15, C-023): twin version and branch,
-- an immutable resolved initial-state snapshot with its citations and controls
-- under two cut-offs, run kind (control | intervention) with a compatible
-- control case, interventions, constraints, assumptions, the exact behaviour-
-- model implementation digest, the runtime/environment digest, the stochastic
-- mode with RNG, seed and sample count, the responsible operator; then outputs
-- and `outputs_digest` over deterministic semantic outputs only. Completed runs
-- are immutable; a correction is a new run linked to the original. A
-- reproduction re-executes from the STORED contract and records its verdict —
-- reproduced, mismatch, or unreproducible — never substituting later state.
--
--   §1  runs (events + projection), immutability, control-case compatibility
--   §2  reproductions and sensitivity
--   §3  ports
--   §4  SIM as a Strategy Graph dependent; write action; schema SIM@v1; RLS; rebuild
-- ============================================================
CREATE SCHEMA IF NOT EXISTS simulation;
GRANT USAGE ON SCHEMA simulation TO eye_app, eye_commit;

-- P5-M2 pinned the implementation of supply-flow@1; the registry now binds it.
UPDATE twin.behaviour_models SET implementation_digest = '7f129e6ffcde2e982a7128bc8f3cd835dce8c055571481adb6b9dfa2d5368d9d'
 WHERE method_ref = 'supply-flow@1' AND implementation_digest IS NULL;

-- ============================================================
-- 1. Runs.
-- ============================================================
CREATE TABLE simulation.run_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  run_id             uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('run.opened', 'run.completed', 'run.failed', 'run.reproduced', 'run.unverified')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT sre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sre_run ON simulation.run_events (run_id, occurred_at);
CREATE TRIGGER sre_append_only BEFORE UPDATE OR DELETE ON simulation.run_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE simulation.runs_current (
  run_id                 uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  twin_id                uuid NOT NULL,
  twin_version           int  NOT NULL,
  branch_id              text NOT NULL,
  run_kind               text NOT NULL CHECK (run_kind IN ('control', 'intervention')),
  control_run_id         uuid REFERENCES simulation.runs_current(run_id),
  corrects_run_id        uuid REFERENCES simulation.runs_current(run_id),
  scenario_id            uuid,
  scenario_branch_id     uuid,
  shock                  boolean NOT NULL,
  component              text NOT NULL,
  /* The two cut-offs the initial state was resolved under, copied from the twin version and never inferred. */
  known_at               timestamptz NOT NULL,
  observed_through       date,
  /* The IMMUTABLE resolved initial state: every element with its citations and inherited controls. */
  initial_state          jsonb NOT NULL,
  initial_state_digest   text NOT NULL CHECK (initial_state_digest ~ '^[0-9a-f]{64}$'),
  model_ref              text NOT NULL REFERENCES twin.behaviour_models(method_ref),
  implementation_digest  text NOT NULL CHECK (implementation_digest ~ '^[0-9a-f]{64}$'),
  environment_digest     text NOT NULL CHECK (environment_digest ~ '^[0-9a-f]{64}$'),
  environment            jsonb NOT NULL,
  stochastic_mode        text NOT NULL CHECK (stochastic_mode IN ('deterministic', 'seeded')),
  rng                    text,
  seed                   bigint,
  samples                int,
  jitter                 jsonb,
  interventions          jsonb NOT NULL CHECK (jsonb_typeof(interventions) = 'array' AND jsonb_array_length(interventions) >= 1),
  constraints            jsonb NOT NULL CHECK (jsonb_typeof(constraints) = 'object'),
  assumptions            jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'object'),
  inputs_digest          text NOT NULL CHECK (inputs_digest ~ '^[0-9a-f]{64}$'),
  outputs                jsonb,
  outputs_digest         text CHECK (outputs_digest IS NULL OR outputs_digest ~ '^[0-9a-f]{64}$'),
  sensitivity            jsonb,
  validation_status      text NOT NULL,
  outside_envelope       boolean NOT NULL DEFAULT false,
  state                  text NOT NULL CHECK (state IN ('opened', 'completed', 'failed')),
  failure                text,
  controls               jsonb NOT NULL DEFAULT '{}'::jsonb,
  header_digest          text CHECK (header_digest IS NULL OR header_digest ~ '^[0-9a-f]{64}$'),
  operator_principal_id  uuid NOT NULL,
  opened_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at           timestamptz,
  correlation_id         uuid NOT NULL,
  FOREIGN KEY (twin_id, twin_version) REFERENCES twin.twin_versions(twin_id, version),
  CONSTRAINT sim_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sim_control_shape CHECK (
    (run_kind = 'control' AND control_run_id IS NULL AND interventions = '[{"type": "none"}]'::jsonb)
    OR (run_kind = 'intervention' AND control_run_id IS NOT NULL)),
  CONSTRAINT sim_seeded_declares CHECK (stochastic_mode <> 'seeded' OR (rng IS NOT NULL AND seed IS NOT NULL AND samples IS NOT NULL AND samples >= 1 AND jitter IS NOT NULL)),
  CONSTRAINT sim_deterministic_draws_nothing CHECK (stochastic_mode <> 'deterministic' OR (rng IS NULL AND seed IS NULL AND samples IS NULL AND jitter IS NULL)),
  CONSTRAINT sim_completed_bound CHECK (state <> 'completed' OR (outputs IS NOT NULL AND outputs_digest IS NOT NULL AND sensitivity IS NOT NULL AND header_digest IS NOT NULL AND completed_at IS NOT NULL)),
  CONSTRAINT sim_failed_says_why CHECK (state <> 'failed' OR failure IS NOT NULL),
  CONSTRAINT sim_not_own_control CHECK (control_run_id IS NULL OR control_run_id <> run_id)
);
CREATE INDEX sim_twin ON simulation.runs_current (twin_id, twin_version, run_kind);
CREATE INDEX sim_control ON simulation.runs_current (control_run_id);

/* A completed run is immutable. An opened run may become completed or failed exactly once. */
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
     OR NEW.samples IS DISTINCT FROM OLD.samples OR NEW.control_run_id IS DISTINCT FROM OLD.control_run_id OR NEW.run_kind <> OLD.run_kind THEN
    RAISE EXCEPTION 'the experiment contract of run % is bound at opening and cannot change', OLD.run_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sim_immutable BEFORE UPDATE OR DELETE ON simulation.runs_current
  FOR EACH ROW EXECUTE FUNCTION simulation.runs_immutable();

-- ============================================================
-- 2. Reproductions.
-- ============================================================
CREATE TABLE simulation.reproductions (
  reproduction_id       uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  run_id                uuid NOT NULL REFERENCES simulation.runs_current(run_id),
  verdict               text NOT NULL CHECK (verdict IN ('reproduced', 'mismatch', 'unreproducible')),
  expected_digest       text NOT NULL,
  actual_digest         text,
  reason                text NOT NULL,
  environment_digest    text NOT NULL,
  environment_matches   boolean NOT NULL,
  cold_process          boolean NOT NULL,
  operator_principal_id uuid NOT NULL,
  reproduced_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT srp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT srp_verdict_digest CHECK ((verdict = 'reproduced') = (actual_digest IS NOT NULL AND actual_digest = expected_digest))
);
CREATE INDEX srp_run ON simulation.reproductions (run_id, reproduced_at);
CREATE TRIGGER srp_append_only BEFORE UPDATE OR DELETE ON simulation.reproductions
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 3. Ports.
-- ============================================================
/*
 * OPEN a run: the initial state is snapshotted HERE from the admitted twin version —
 * complete, with citations and controls — so the run never re-reads the twin. An
 * incomplete version cannot run. An intervention run must name a COMPLETED control on
 * the same twin version with the same initial-state digest, implementation digest,
 * assumptions and constraints; anything else is refused.
 */
CREATE OR REPLACE FUNCTION simulation.open_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_twin_version int, p_run_kind text, p_control_run_id uuid, p_corrects uuid,
  p_scenario_id uuid, p_scenario_branch_id uuid, p_shock boolean, p_component text,
  p_model_ref text, p_implementation_digest text, p_environment_digest text, p_environment jsonb,
  p_stochastic_mode text, p_rng text, p_seed bigint, p_samples int, p_jitter jsonb,
  p_interventions jsonb, p_constraints jsonb, p_assumptions jsonb, p_inputs_digest text, p_validation_status text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v twin.twin_versions%ROWTYPE; v_state jsonb; v_digest text; c simulation.runs_current%ROWTYPE; v_pinned text; v_controls jsonb; v_synthetic boolean;
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
  -- The snapshot: every element of the version, with citations and controls, in key order.
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value, 'unit', e.unit,
                                               'material', e.material, 'citations', e.citations, 'health', e.health, 'valid_from', e.valid_from,
                                               'valid_to', e.valid_to, 'confidence', e.confidence, 'synthetic_state', e.synthetic_state, 'controls', e.controls)
                            ORDER BY e.key), '[]'::jsonb)
    INTO v_state FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_twin_version;
  v_digest := encode(sha256(convert_to(v_state::text, 'UTF8')), 'hex');
  IF p_run_kind = 'intervention' THEN
    SELECT * INTO c FROM simulation.runs_current WHERE run_id = p_control_run_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected: control run % is not an authorized run in this domain', p_control_run_id USING ERRCODE = '23503'; END IF;
    IF c.run_kind <> 'control' THEN RAISE EXCEPTION 'run rejected: % is not a control run', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.state <> 'completed' THEN RAISE EXCEPTION 'run rejected: control run % is not completed', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.twin_id <> p_twin_id OR c.twin_version <> p_twin_version OR c.initial_state_digest <> v_digest OR c.implementation_digest <> p_implementation_digest
       OR c.assumptions <> p_assumptions OR c.constraints <> p_constraints OR c.shock <> p_shock OR c.component <> p_component THEN
      RAISE EXCEPTION 'run rejected: control run % is not compatible (it must share the twin version, initial state, implementation, assumptions, constraints, shock and component)', p_control_run_id
        USING ERRCODE = '22023';
    END IF;
  END IF;
  v_controls := v.controls; v_synthetic := v.synthetic_state;
  INSERT INTO simulation.runs_current (
    run_id, scope, tenant_id, domain_id, twin_id, twin_version, branch_id, run_kind, control_run_id, corrects_run_id, scenario_id, scenario_branch_id, shock, component,
    known_at, observed_through, initial_state, initial_state_digest, model_ref, implementation_digest, environment_digest, environment,
    stochastic_mode, rng, seed, samples, jitter, interventions, constraints, assumptions, inputs_digest, validation_status, state, controls,
    operator_principal_id, correlation_id
  ) VALUES (
    p_run_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_twin_version, v.branch_id, p_run_kind, p_control_run_id, p_corrects, p_scenario_id, p_scenario_branch_id, p_shock, p_component,
    v.known_at, v.observed_through, v_state, v_digest, p_model_ref, p_implementation_digest, p_environment_digest, p_environment,
    p_stochastic_mode, p_rng, p_seed, p_samples, p_jitter, p_interventions, p_constraints, p_assumptions, p_inputs_digest,
    p_validation_status || CASE WHEN v.verification_state = 'unverified' THEN '; twin version UNVERIFIED (a cited input was corrected)' ELSE '' END,
    'opened', v_controls, p_actor, p_correlation);
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.opened', p_actor,
          jsonb_build_object('twin_id', p_twin_id, 'twin_version', p_twin_version, 'run_kind', p_run_kind, 'control_run_id', p_control_run_id,
                             'initial_state_digest', v_digest, 'inputs_digest', p_inputs_digest, 'stochastic_mode', p_stochastic_mode), p_correlation);
  RETURN jsonb_build_object('initial_state', v_state, 'initial_state_digest', v_digest, 'known_at', v.known_at, 'observed_through', v.observed_through,
                            'branch_id', v.branch_id, 'synthetic_state', v_synthetic, 'controls', v_controls, 'verification_state', v.verification_state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,boolean,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,boolean,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,uuid,uuid,uuid) TO eye_commit;

/* COMPLETE a run: bind outputs, their digest and the sensitivity; immutable from here. The SIM canonical object is admitted by the service under the same bound action first. */
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
  -- What the run rests on, in the SAME dependency table Phase 3 walks: its twin version, and its control.
  INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'SIM', 'twin', r.twin_id,
          format('run on twin version %s (branch %s)', r.twin_version, r.branch_id), 'active', p_actor, p_correlation)
  ON CONFLICT DO NOTHING;
  IF r.control_run_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'SIM', 'run', r.control_run_id, 'intervention run compared against this control', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.complete_run(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.complete_run(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION simulation.fail_run(p_run_id uuid, p_tenant uuid, p_domain uuid, p_failure text, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run.complete', 'simulation.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE simulation.runs_current SET state = 'failed', failure = p_failure WHERE run_id = p_run_id AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'opened';
  IF NOT FOUND THEN RAISE EXCEPTION 'no opened run % in this domain', p_run_id USING ERRCODE = '23503'; END IF;
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.failed', p_actor, jsonb_build_object('failure', p_failure), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.fail_run(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.fail_run(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION simulation.record_reproduction(
  p_reproduction_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_verdict text, p_expected text, p_actual text, p_reason text,
  p_environment_digest text, p_environment_matches boolean, p_cold boolean, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.reproduce']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.run_id = p_run_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'completed') THEN
    RAISE EXCEPTION 'reproduction rejected: run % is not a completed run in this domain', p_run_id USING ERRCODE = '23503';
  END IF;
  INSERT INTO simulation.reproductions (reproduction_id, scope, tenant_id, domain_id, run_id, verdict, expected_digest, actual_digest, reason,
                                        environment_digest, environment_matches, cold_process, operator_principal_id, correlation_id)
  VALUES (p_reproduction_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_verdict, p_expected, p_actual, p_reason, p_environment_digest, p_environment_matches, p_cold, p_actor, p_correlation);
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.reproduced', p_actor,
          jsonb_build_object('verdict', p_verdict, 'expected', p_expected, 'actual', p_actual, 'reason', p_reason, 'environment_matches', p_environment_matches, 'cold_process', p_cold), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.record_reproduction(uuid,uuid,uuid,uuid,text,text,text,text,text,boolean,boolean,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.record_reproduction(uuid,uuid,uuid,uuid,text,text,text,text,text,boolean,boolean,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 4. SIM as a Strategy Graph dependent; write action; schema; RLS; rebuild.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.dependency_dependent_exists() RETURNS trigger
SET search_path = graph, prediction, twin, simulation, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT') THEN
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: % % is not a strategy object', NEW.dependent_type, NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'FCT' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: FCT % is not a forecast', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'SCN' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: SCN % is not a scenario', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'WRN' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.warnings_current w WHERE w.warning_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: WRN % is not a warning', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'TWN' THEN
    IF NOT EXISTS (SELECT 1 FROM twin.twins_current t WHERE t.twin_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: TWN % is not a twin', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'SIM' THEN
    IF NOT EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.run_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: SIM % is not a simulation run', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('simulation.run.complete', ARRAY['SIM'], 'Completing a simulation run admits a simulation object and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('SIM', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["twin","run_kind","control_run_id","shock","component","cutoffs","initial_state_digest","model","environment","stochastic",
               "interventions","constraints","assumptions","inputs_digest","outputs_digest","totals","sensitivity","validation_status","operator"],
  "properties": {
    "twin": { "type": "object", "required": ["twin_id","version","branch_id"],
              "properties": { "twin_id": { "type": "string" }, "version": { "type": "integer" }, "branch_id": { "type": "string" } } },
    "run_kind": { "enum": ["control","intervention"] },
    "control_run_id": { "type": ["string","null"] },
    "corrects_run_id": { "type": ["string","null"] },
    "scenario": { "type": ["object","null"] },
    "shock": { "type": "boolean" },
    "component": { "type": "string" },
    "cutoffs": { "type": "object", "required": ["known_at","observed_through"], "properties": { "known_at": { "type": "string" }, "observed_through": { "type": ["string","null"] } } },
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
    "operator": { "type": "string" }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['run_events', 'runs_current', 'reproductions'] LOOP
    EXECUTE format('ALTER TABLE simulation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE simulation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY simulation_isolation ON simulation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON simulation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION simulation.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint)
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid;
BEGIN
  v_tenant := public.eye_tenant(); v_domain := public.eye_domain();
  RETURN QUERY
    WITH last_state AS (
      SELECT DISTINCT ON (run_id) run_id, CASE event WHEN 'run.completed' THEN 'completed' WHEN 'run.failed' THEN 'failed' ELSE 'opened' END AS st
        FROM simulation.run_events WHERE tenant_id = v_tenant AND domain_id = v_domain AND event IN ('run.opened', 'run.completed', 'run.failed')
       ORDER BY run_id, occurred_at DESC),
         live AS (SELECT run_id, state AS st FROM simulation.runs_current WHERE tenant_id = v_tenant AND domain_id = v_domain)
    SELECT 'runs_current(state)'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM last_state),
           (SELECT count(*) FROM (SELECT * FROM last_state EXCEPT SELECT * FROM live) x);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.rebuild_projections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.rebuild_projections() TO eye_app, eye_commit;
