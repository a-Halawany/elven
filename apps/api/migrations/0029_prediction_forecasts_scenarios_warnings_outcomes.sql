-- ============================================================
-- 0029 — PHASE 4 · PREDICTION + SCENARIO INTELLIGENCE (L6–L7).
--
-- The `prediction` schema: forecasts, backtests, outcomes and calibration;
-- scenario trees, branches and indicators; early warnings with response
-- windows. In the shape of 0022–0024: append-only event logs beside rebuildable
-- projections, scope triple NOT NULL, FORCE ROW LEVEL SECURITY on every table,
-- SECURITY DEFINER ports asserting the caller's own bound action, and canonical
-- objects (FCT, SCN, WRN) with the 43-column header.
--
--   §1  roles          forecast_owner, forecast_agent
--   §2  series         the governed registry of what can be forecast
--   §3  forecasts      events + projection; a forecast names its distribution,
--                      drivers, assumptions and evidence or it is not admitted
--   §4  backtests      the record of how a method scored against the baseline
--   §5  outcomes       the ledger every forecast is scored against
--   §6  scenarios      trees, branches, indicators, evaluations; a branch FLIPS
--                      on a breached indicator and the flip is an event
--   §7  warnings       evidence + consequence + confidence + a response window,
--                      routed to a named owner, acknowledged or not
--   §8  the Strategy Graph learns three dependents (FCT, SCN, WRN) and one
--                      target kind (forecast), so Phase 3's propagation reaches
--                      a forecast and says so
--   §9  ports, write actions, schemas, projection rebuild
-- ============================================================

-- ============================================================
-- 1. Roles.
-- ============================================================
INSERT INTO identity.roles (code, scope, description) VALUES
  ('forecast_owner', 'DOMAIN',
   'Forecast owner — registers series, issues forecasts, declares scenario trees, defines indicators, acknowledges warnings and records outcomes. Owns the calibration record.'),
  ('forecast_agent', 'DOMAIN',
   'Forecast agent — runs forecasting, backtests, outcome scoring and indicator evaluation as a job. Cannot declare a scenario, define an indicator or acknowledge a warning.')
ON CONFLICT (code) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS prediction;
GRANT USAGE ON SCHEMA prediction TO eye_app, eye_commit;

-- ============================================================
-- 2. The series registry.
-- ============================================================
/*
 * A series is a NAMED, GOVERNED way of reading a number out of evidence: which
 * source, which parser (a deterministic, version-pinned method — never a model),
 * which field, which unit, what attribution the publisher requires, and which
 * entity it is about. Nothing is forecast that is not registered here, so what
 * a forecast rests on is always a reviewable declaration.
 */
CREATE TABLE prediction.series_registry (
  series_key         text NOT NULL,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  source_key         text NOT NULL,
  parser_ref         text NOT NULL CHECK (parser_ref ~ '^[a-z0-9-]+@[0-9.]+$'),
  value_field        text NOT NULL,
  /** Publisher's own selector inside a source (e.g. a PortWatch portid), or null. */
  selector           text,
  unit               text NOT NULL,
  seasonality_days   int  NOT NULL DEFAULT 1 CHECK (seasonality_days >= 1),
  subject_entity_id  uuid,
  attribution        text,
  description        text NOT NULL CHECK (length(btrim(description)) >= 8),
  registered_by      uuid NOT NULL,
  registered_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (tenant_id, domain_id, series_key),
  CONSTRAINT ser_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

-- ============================================================
-- 3. Forecasts.
-- ============================================================
CREATE TABLE prediction.forecast_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  forecast_id        uuid NOT NULL,
  event              text NOT NULL CHECK (event IN (
    'forecast.issued', 'forecast.superseded', 'forecast.resolved', 'forecast.withdrawn',
    'forecast.attention')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT fct_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX fct_events_fct ON prediction.forecast_events (forecast_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.forecast_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/*
 * THE FORECAST, AS A ROW. The canonical FCT object carries the same content
 * under the 43-column header; this projection is what screens and scoring read.
 *
 * T4 IS A CONSTRAINT, NOT A PROMISE: a forecast with no drivers, no evidence, no
 * assumptions declared, or a distribution whose quantiles are out of order is
 * refused here, before any screen could show it.
 */
CREATE TABLE prediction.forecasts_current (
  forecast_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  series_key         text NOT NULL,
  subject_entity_id  uuid,
  horizon_code       text NOT NULL CHECK (horizon_code IN ('30d','90d','180d','1y','3y','5y')),
  horizon_days       int  NOT NULL CHECK (horizon_days >= 1),
  -- The last observation the forecast used (world time) and the instant it was
  -- allowed to know (record time). Every read behind it was bounded by both.
  origin_at          date NOT NULL,
  known_at           timestamptz NOT NULL,
  target_at          date NOT NULL,
  issued_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  method             text NOT NULL,
  method_version     text NOT NULL,
  baseline_method    text NOT NULL,
  quantiles          jsonb NOT NULL,
  path               jsonb NOT NULL DEFAULT '[]'::jsonb,
  drivers            jsonb NOT NULL,
  assumptions        uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  evidence_refs      jsonb NOT NULL,
  refresh_cadence    text NOT NULL,
  -- WHAT THIS FORECAST IS ALLOWED TO CLAIM ABOUT ITSELF.
  validation_state   text NOT NULL CHECK (validation_state IN (
                       'unvalidated', 'validated', 'validation_impossible')),
  validation_note    text NOT NULL CHECK (length(btrim(validation_note)) >= 8),
  label              text NOT NULL CHECK (label IN ('replay demonstration', 'live')),
  skill              jsonb,
  statement          text NOT NULL CHECK (length(btrim(statement)) >= 8),
  state              text NOT NULL CHECK (state IN ('issued', 'superseded', 'resolved', 'withdrawn')),
  superseded_by      uuid,
  attention_state    text NOT NULL DEFAULT 'none' CHECK (attention_state IN ('none', 'assumption_unverified')),
  attention_reason   text,
  issued_by          uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT fct_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT fct_target_after_origin CHECK (target_at > origin_at),
  CONSTRAINT fct_names_drivers CHECK (jsonb_typeof(drivers) = 'array' AND jsonb_array_length(drivers) >= 1),
  CONSTRAINT fct_names_evidence CHECK (jsonb_typeof(evidence_refs) = 'array' AND jsonb_array_length(evidence_refs) >= 1),
  CONSTRAINT fct_names_assumptions CHECK (cardinality(assumptions) >= 1),
  CONSTRAINT fct_quantiles_ordered CHECK (
    (quantiles ->> 'q10')::numeric <= (quantiles ->> 'q50')::numeric
    AND (quantiles ->> 'q50')::numeric <= (quantiles ->> 'q90')::numeric),
  CONSTRAINT fct_superseded_names_successor CHECK (state <> 'superseded' OR superseded_by IS NOT NULL)
);
CREATE INDEX fct_series ON prediction.forecasts_current (tenant_id, domain_id, series_key, horizon_code, state);
CREATE INDEX fct_issued ON prediction.forecasts_current (tenant_id, domain_id, issued_at DESC);

-- ============================================================
-- 4. Backtests.
-- ============================================================
/*
 * A backtest is the only thing that can make a forecast `validated`. It records
 * both models on the same origins with the same cut-offs, and the numbers are
 * stored whether or not they flatter the method (D3).
 */
CREATE TABLE prediction.backtests (
  backtest_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  series_key         text NOT NULL,
  horizon_code       text NOT NULL,
  horizon_days       int  NOT NULL CHECK (horizon_days >= 1),
  method             text NOT NULL,
  method_version     text NOT NULL,
  baseline_method    text NOT NULL,
  window_from        date NOT NULL,
  window_to          date NOT NULL,
  origins            int  NOT NULL CHECK (origins >= 0),
  coverage_80        numeric,
  pinball_mean       numeric,
  baseline_coverage_80 numeric,
  baseline_pinball_mean numeric,
  skill_vs_baseline  numeric,
  t1_met             boolean,
  t2_met             boolean,
  verdict            text NOT NULL CHECK (length(btrim(verdict)) >= 8),
  known_at_discipline text NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_by        uuid NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT bkt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT bkt_window CHECK (window_to > window_from)
);
CREATE INDEX bkt_series ON prediction.backtests (tenant_id, domain_id, series_key, horizon_code, computed_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.backtests
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 5. The outcome ledger.
-- ============================================================
/*
 * What actually happened to a thing the platform predicted, and how far off it
 * was. Append-only: a score is never revised in place. The observed value names
 * the evidence it was read from and the instant it became known.
 */
CREATE TABLE prediction.outcome_ledger (
  outcome_id         uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  forecast_id        uuid NOT NULL,
  series_key         text NOT NULL,
  horizon_code       text NOT NULL,
  method             text NOT NULL,
  target_at          date NOT NULL,
  observed_value     numeric NOT NULL,
  observed_evidence_object_id uuid NOT NULL,
  observed_evidence_version   bigint NOT NULL,
  observed_evidence_digest    text NOT NULL,
  known_at           timestamptz NOT NULL,
  q10                numeric NOT NULL,
  q50                numeric NOT NULL,
  q90                numeric NOT NULL,
  covered            boolean NOT NULL,
  abs_error          numeric NOT NULL,
  pinball_mean       numeric NOT NULL,
  label              text NOT NULL,
  recorded_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT out_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX out_forecast ON prediction.outcome_ledger (forecast_id);
CREATE INDEX out_series ON prediction.outcome_ledger (tenant_id, domain_id, series_key, horizon_code, recorded_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.outcome_ledger
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 6. Scenarios, branches, indicators, evaluations.
-- ============================================================
CREATE TABLE prediction.scenario_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  scenario_id        uuid NOT NULL,
  branch_id          uuid,
  event              text NOT NULL CHECK (event IN (
    'scenario.declared', 'branch.added', 'branch.flipped', 'branch.closed', 'scenario.closed')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT scn_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX scn_events_scn ON prediction.scenario_events (scenario_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.scenario_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE prediction.scenarios_current (
  scenario_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  title              text NOT NULL CHECK (length(title) BETWEEN 2 AND 256),
  statement          text NOT NULL CHECK (length(statement) BETWEEN 2 AND 4096),
  forecast_id        uuid,
  subject_entity_id  uuid,
  owner_principal_id uuid NOT NULL,
  review_cadence     text NOT NULL,
  state              text NOT NULL CHECK (state IN ('active', 'closed')),
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT scn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

CREATE TABLE prediction.indicators_current (
  indicator_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  series_key         text NOT NULL,
  description        text NOT NULL CHECK (length(btrim(description)) >= 8),
  comparator         text NOT NULL CHECK (comparator IN ('<', '<=', '>', '>=')),
  threshold          numeric NOT NULL,
  consecutive_days   int  NOT NULL CHECK (consecutive_days >= 1),
  owner_principal_id uuid NOT NULL,
  state              text NOT NULL CHECK (state IN ('active', 'retired')),
  last_value         numeric,
  last_observation_at date,
  last_evaluated_at  timestamptz,
  streak             int  NOT NULL DEFAULT 0,
  breached           boolean NOT NULL DEFAULT false,
  breached_at        timestamptz,
  defined_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT ind_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

CREATE TABLE prediction.indicator_evaluations (
  evaluation_id      uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  indicator_id       uuid NOT NULL,
  evaluated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  known_at           timestamptz NOT NULL,
  observation_at     date NOT NULL,
  value              numeric NOT NULL,
  evidence_object_id uuid NOT NULL,
  evidence_version   bigint NOT NULL,
  satisfied          boolean NOT NULL,
  streak             int  NOT NULL,
  breached           boolean NOT NULL,
  actor_principal_id uuid NOT NULL,
  correlation_id     uuid NOT NULL,
  CONSTRAINT ieval_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX ieval_ind ON prediction.indicator_evaluations (indicator_id, evaluated_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.indicator_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE prediction.branches_current (
  branch_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  scenario_id        uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  name               text NOT NULL CHECK (length(name) BETWEEN 2 AND 128),
  kind               text NOT NULL CHECK (kind IN ('baseline', 'upside', 'downside')),
  statement          text NOT NULL CHECK (length(statement) BETWEEN 2 AND 4096),
  indicator_id       uuid REFERENCES prediction.indicators_current (indicator_id),
  signpost           text,
  owner_principal_id uuid NOT NULL,
  review_cadence     text NOT NULL,
  response_window_hours int NOT NULL DEFAULT 72 CHECK (response_window_hours >= 1),
  consequence        text NOT NULL CHECK (length(btrim(consequence)) >= 8),
  state              text NOT NULL CHECK (state IN ('open', 'flipped', 'closed')),
  flipped_at         timestamptz,
  flip_event_id      uuid,
  flip_correlation_id uuid,
  added_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT brn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  -- A branch that can flip names the indicator that flips it. The baseline never flips.
  CONSTRAINT brn_flippable_has_indicator CHECK (kind = 'baseline' OR indicator_id IS NOT NULL),
  CONSTRAINT brn_flipped_has_receipt CHECK (state <> 'flipped' OR (flipped_at IS NOT NULL AND flip_event_id IS NOT NULL))
);
CREATE INDEX brn_scenario ON prediction.branches_current (scenario_id);
CREATE INDEX brn_indicator ON prediction.branches_current (indicator_id) WHERE state = 'open';

-- ============================================================
-- 7. Warnings.
-- ============================================================
CREATE TABLE prediction.warning_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  warning_id         uuid NOT NULL,
  event              text NOT NULL CHECK (event IN (
    'warning.raised', 'warning.acknowledged', 'warning.expired', 'warning.closed')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT wrn_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX wrn_events_wrn ON prediction.warning_events (warning_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON prediction.warning_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/*
 * D6 IS THREE CONSTRAINTS: a warning routes to a NAMED owner, it carries a
 * response window that closes after it opens, and its acknowledgement — or the
 * absence of one — is a recorded state, never an inference.
 */
CREATE TABLE prediction.warnings_current (
  warning_id         uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  branch_id          uuid,
  indicator_id       uuid,
  forecast_id        uuid,
  title              text NOT NULL CHECK (length(title) BETWEEN 2 AND 256),
  evidence           jsonb NOT NULL,
  consequence        text NOT NULL CHECK (length(btrim(consequence)) >= 8),
  confidence         numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  response_window_opens_at  timestamptz NOT NULL,
  response_window_closes_at timestamptz NOT NULL,
  routed_to          uuid NOT NULL,
  raised_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  raised_by          uuid NOT NULL,
  state              text NOT NULL CHECK (state IN ('raised', 'acknowledged', 'expired', 'closed')),
  acknowledged_at    timestamptz,
  acknowledged_by    uuid,
  acknowledgement    text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT wrn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT wrn_window CHECK (response_window_closes_at > response_window_opens_at),
  CONSTRAINT wrn_names_evidence CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1),
  CONSTRAINT wrn_ack_has_actor CHECK (state <> 'acknowledged' OR (acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL))
);
CREATE INDEX wrn_routed ON prediction.warnings_current (tenant_id, domain_id, routed_to, state);
CREATE INDEX wrn_raised ON prediction.warnings_current (tenant_id, domain_id, raised_at DESC);

-- ============================================================
-- Row-level security on every table in the schema (0024 §9, repeated here).
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'series_registry', 'forecast_events', 'forecasts_current', 'backtests', 'outcome_ledger',
    'scenario_events', 'scenarios_current', 'indicators_current', 'indicator_evaluations',
    'branches_current', 'warning_events', 'warnings_current'
  ] LOOP
    EXECUTE format('ALTER TABLE prediction.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE prediction.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY prediction_isolation ON prediction.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON prediction.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- 8. The Strategy Graph learns what rests on a forecast.
-- ============================================================
/*
 * D7: correcting a claim a forecast rests on must reach the forecast. A forecast
 * rests on assumptions (ASU) and on the evidence its series read; a scenario
 * rests on its forecast; a warning rests on its branch. All three are dependents
 * in the SAME dependency table Phase 3 walks, so no second propagation exists.
 */
ALTER TABLE graph.dependencies DROP CONSTRAINT dependencies_dependent_type_check;
ALTER TABLE graph.dependencies ADD CONSTRAINT dependencies_dependent_type_check
  CHECK (dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT', 'FCT', 'SCN', 'WRN'));
/*
 * The dependent used to be a foreign key into graph.strategy_current. A forecast,
 * a scenario or a warning lives in its own projection, so the reference is
 * checked by TYPE instead — the same guarantee (a dependency names a row that
 * exists), one table per dependent type, and no dependent may point at a row of
 * the wrong kind.
 */
ALTER TABLE graph.dependencies DROP CONSTRAINT dependencies_dependent_object_id_fkey;
CREATE OR REPLACE FUNCTION graph.dependency_dependent_exists() RETURNS trigger
SET search_path = graph, prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT') THEN
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: % % is not a strategy object', NEW.dependent_type, NEW.dependent_object_id
        USING ERRCODE = '23503';
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
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dependent_exists BEFORE INSERT OR UPDATE ON graph.dependencies
  FOR EACH ROW EXECUTE FUNCTION graph.dependency_dependent_exists();
ALTER TABLE graph.dependencies DROP CONSTRAINT dependencies_depends_on_kind_check;
ALTER TABLE graph.dependencies ADD CONSTRAINT dependencies_depends_on_kind_check
  CHECK (depends_on_kind IN ('claim', 'entity', 'edge', 'strategy', 'forecast', 'evidence'));

ALTER TABLE graph.invalidations_current
  ADD COLUMN affected_forecasts jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN graph.invalidations_current.affected_forecasts IS
  'forecasts the walk reached — marked for attention, never re-issued by the walk';

-- record_impact learns the forecasts bucket; the 0027 signature is retired.
CREATE OR REPLACE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_forecasts jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, prediction, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; cov record; f jsonb;
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
         statement = p_statement,
         truncated = coalesce(p_truncated, false),
         unexplored = coalesce(p_unexplored, '[]'::jsonb),
         state = 'assessed', assessed_at = clock_timestamp()
   WHERE invalidation_id = p_invalidation_id
   RETURNING correction_case_id INTO v_case;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'impact rejected: no such invalidation' USING ERRCODE = '23503';
  END IF;

  -- A REACHED FORECAST IS MARKED FOR ATTENTION, NOT RE-ISSUED. The walk reports;
  -- re-forecasting is a person's or a job's decision, taken with the receipt in
  -- hand. The mark and its event are what make the forecast SURFACE (D7).
  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(p_forecasts, '[]'::jsonb)) LOOP
    UPDATE prediction.forecasts_current
       SET attention_state = 'assumption_unverified',
           attention_reason = format('invalidation %s: %s', p_invalidation_id, f ->> 'reached_via'),
           updated_at = clock_timestamp()
     WHERE forecast_id = (f ->> 'forecast_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain
       AND state IN ('issued');
    IF FOUND THEN
      INSERT INTO prediction.forecast_events (
        event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id
      ) VALUES (
        gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (f ->> 'forecast_id')::uuid, 'forecast.attention',
        p_actor, jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', f ->> 'reached_via'),
        p_correlation);
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

  INSERT INTO graph.invalidation_events (
    event_id, scope, tenant_id, domain_id, invalidation_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_invalidation_id, 'invalidation.assessed',
    p_actor, jsonb_build_object(
      'assumptions', jsonb_array_length(coalesce(p_assumptions, '[]'::jsonb)),
      'objectives',  jsonb_array_length(coalesce(p_objectives,  '[]'::jsonb)),
      'decisions',   jsonb_array_length(coalesce(p_decisions,   '[]'::jsonb)),
      'commitments', jsonb_array_length(coalesce(p_commitments, '[]'::jsonb)),
      'forecasts',   jsonb_array_length(coalesce(p_forecasts,   '[]'::jsonb)),
      'truncated', coalesce(p_truncated, false),
      'unexplored', jsonb_array_length(coalesce(p_unexplored, '[]'::jsonb)),
      'correction_case_id', v_case, 'case_propagation_state', v_cov_state,
      'roots', v_cov_roots, 'roots_covered', v_cov_covered,
      'roots_outstanding', v_cov_outstanding, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid) TO eye_commit;
DROP FUNCTION IF EXISTS graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid);

-- ============================================================
-- 9. Ports.
-- ============================================================

CREATE OR REPLACE FUNCTION prediction.register_series(
  p_tenant uuid, p_domain uuid, p_series_key text, p_source_key text, p_parser_ref text,
  p_value_field text, p_selector text, p_unit text, p_seasonality int, p_subject uuid,
  p_attribution text, p_description text, p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.series.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO prediction.series_registry (
    series_key, scope, tenant_id, domain_id, source_key, parser_ref, value_field, selector, unit,
    seasonality_days, subject_entity_id, attribution, description, registered_by, correlation_id
  ) VALUES (
    p_series_key, 'DOMAIN', p_tenant, p_domain, p_source_key, p_parser_ref, p_value_field, p_selector,
    p_unit, coalesce(p_seasonality, 1), p_subject, p_attribution, p_description, p_actor, p_correlation)
  ON CONFLICT (tenant_id, domain_id, series_key) DO NOTHING;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.register_series(uuid,uuid,text,text,text,text,text,text,int,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.register_series(uuid,uuid,text,text,text,text,text,text,int,uuid,text,text,uuid,uuid) TO eye_commit;

/*
 * ISSUING A FORECAST supersedes the previous issued forecast for the same
 * series, subject and horizon, links the new one into the Strategy Graph as a
 * dependent of every assumption it names (and of the evidence it read, as
 * `evidence` targets), and records the issue event — one operation.
 */
CREATE OR REPLACE FUNCTION prediction.issue_forecast(
  p_forecast_id uuid, p_tenant uuid, p_domain uuid, p_series_key text, p_subject uuid,
  p_horizon_code text, p_horizon_days int, p_origin_at date, p_known_at timestamptz, p_target_at date,
  p_method text, p_method_version text, p_baseline_method text, p_quantiles jsonb, p_path jsonb,
  p_drivers jsonb, p_assumptions uuid[], p_evidence_refs jsonb, p_refresh_cadence text,
  p_validation_state text, p_validation_note text, p_label text, p_skill jsonb, p_statement text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; a uuid; e jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.forecast.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM prediction.series_registry s
                  WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.series_key = p_series_key) THEN
    RAISE EXCEPTION 'forecast rejected: series % is not registered in this domain', p_series_key USING ERRCODE = '23503';
  END IF;
  -- Every named assumption must be a live assumption in THIS domain.
  FOREACH a IN ARRAY coalesce(p_assumptions, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s
                    WHERE s.strategy_object_id = a AND s.object_type = 'ASU'
                      AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'forecast rejected: % is not an assumption in this domain', a USING ERRCODE = '23503';
    END IF;
  END LOOP;

  INSERT INTO prediction.forecasts_current (
    forecast_id, scope, tenant_id, domain_id, series_key, subject_entity_id, horizon_code, horizon_days,
    origin_at, known_at, target_at, method, method_version, baseline_method, quantiles, path, drivers,
    assumptions, evidence_refs, refresh_cadence, validation_state, validation_note, label, skill,
    statement, state, issued_by, correlation_id
  ) VALUES (
    p_forecast_id, 'DOMAIN', p_tenant, p_domain, p_series_key, p_subject, p_horizon_code, p_horizon_days,
    p_origin_at, p_known_at, p_target_at, p_method, p_method_version, p_baseline_method, p_quantiles,
    coalesce(p_path, '[]'::jsonb), p_drivers, coalesce(p_assumptions, ARRAY[]::uuid[]), p_evidence_refs,
    p_refresh_cadence, p_validation_state, p_validation_note, p_label, p_skill, p_statement, 'issued',
    p_actor, p_correlation);

  INSERT INTO prediction.forecast_events (
    event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.issued', p_actor,
    jsonb_build_object('series_key', p_series_key, 'horizon', p_horizon_code, 'method', p_method,
                       'origin_at', p_origin_at, 'known_at', p_known_at, 'target_at', p_target_at,
                       'quantiles', p_quantiles, 'validation_state', p_validation_state, 'label', p_label),
    p_correlation);

  -- The previous issued forecast for the same question is superseded, with its own event.
  FOR r IN SELECT f.forecast_id FROM prediction.forecasts_current f
            WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.series_key = p_series_key
              AND f.horizon_code = p_horizon_code AND f.subject_entity_id IS NOT DISTINCT FROM p_subject
              AND f.state = 'issued' AND f.forecast_id <> p_forecast_id
            FOR UPDATE
  LOOP
    UPDATE prediction.forecasts_current SET state = 'superseded', superseded_by = p_forecast_id,
           updated_at = clock_timestamp() WHERE forecast_id = r.forecast_id;
    INSERT INTO prediction.forecast_events (
      event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.forecast_id, 'forecast.superseded', p_actor,
      jsonb_build_object('superseded_by', p_forecast_id), p_correlation);
  END LOOP;

  -- Into the Strategy Graph: the forecast rests on its assumptions and on the evidence it read.
  FOREACH a IN ARRAY coalesce(p_assumptions, ARRAY[]::uuid[]) LOOP
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'FCT', 'strategy', a,
      'the forecast is only as good as this assumption; if it stops being verified the forecast must be looked at again',
      'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(p_evidence_refs) LOOP
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'FCT', 'evidence',
      (e ->> 'evidence_object_id')::uuid,
      'a value the forecast was fitted on was read from this evidence; a correction to it changes the fit',
      'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION prediction.record_backtest(
  p_backtest_id uuid, p_tenant uuid, p_domain uuid, p_series_key text, p_horizon_code text,
  p_horizon_days int, p_method text, p_method_version text, p_baseline_method text,
  p_window_from date, p_window_to date, p_origins int, p_coverage numeric, p_pinball numeric,
  p_baseline_coverage numeric, p_baseline_pinball numeric, p_skill numeric, p_t1 boolean, p_t2 boolean,
  p_verdict text, p_discipline text, p_details jsonb, p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.backtest.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO prediction.backtests (
    backtest_id, scope, tenant_id, domain_id, series_key, horizon_code, horizon_days, method,
    method_version, baseline_method, window_from, window_to, origins, coverage_80, pinball_mean,
    baseline_coverage_80, baseline_pinball_mean, skill_vs_baseline, t1_met, t2_met, verdict,
    known_at_discipline, details, computed_by, correlation_id
  ) VALUES (
    p_backtest_id, 'DOMAIN', p_tenant, p_domain, p_series_key, p_horizon_code, p_horizon_days, p_method,
    p_method_version, p_baseline_method, p_window_from, p_window_to, p_origins, p_coverage, p_pinball,
    p_baseline_coverage, p_baseline_pinball, p_skill, p_t1, p_t2, p_verdict, p_discipline,
    coalesce(p_details, '{}'::jsonb), p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_backtest(uuid,uuid,uuid,text,text,int,text,text,text,date,date,int,numeric,numeric,numeric,numeric,numeric,boolean,boolean,text,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_backtest(uuid,uuid,uuid,text,text,int,text,text,text,date,date,int,numeric,numeric,numeric,numeric,numeric,boolean,boolean,text,text,jsonb,uuid,uuid) TO eye_commit;

/* An outcome resolves the forecast it scores. Append-only; one outcome per forecast. */
CREATE OR REPLACE FUNCTION prediction.record_outcome(
  p_outcome_id uuid, p_tenant uuid, p_domain uuid, p_forecast_id uuid, p_observed numeric,
  p_evidence_object_id uuid, p_evidence_version bigint, p_evidence_digest text, p_known_at timestamptz,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f prediction.forecasts_current%ROWTYPE; q10 numeric; q50 numeric; q90 numeric;
        v_pin numeric; v_cov boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.outcome.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO f FROM prediction.forecasts_current
   WHERE forecast_id = p_forecast_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outcome rejected: no such forecast in this domain' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.outcome_ledger o WHERE o.forecast_id = p_forecast_id) THEN
    RAISE EXCEPTION 'outcome rejected: forecast % is already scored; a score is never revised in place', p_forecast_id
      USING ERRCODE = '23505';
  END IF;
  q10 := (f.quantiles ->> 'q10')::numeric; q50 := (f.quantiles ->> 'q50')::numeric; q90 := (f.quantiles ->> 'q90')::numeric;
  -- Pinball loss, averaged over the three declared quantiles.
  v_pin := (
    (CASE WHEN p_observed >= q10 THEN 0.1 * (p_observed - q10) ELSE 0.9 * (q10 - p_observed) END)
  + (CASE WHEN p_observed >= q50 THEN 0.5 * (p_observed - q50) ELSE 0.5 * (q50 - p_observed) END)
  + (CASE WHEN p_observed >= q90 THEN 0.9 * (p_observed - q90) ELSE 0.1 * (q90 - p_observed) END)) / 3;
  v_cov := p_observed >= q10 AND p_observed <= q90;
  INSERT INTO prediction.outcome_ledger (
    outcome_id, scope, tenant_id, domain_id, forecast_id, series_key, horizon_code, method, target_at,
    observed_value, observed_evidence_object_id, observed_evidence_version, observed_evidence_digest,
    known_at, q10, q50, q90, covered, abs_error, pinball_mean, label, recorded_by, correlation_id
  ) VALUES (
    p_outcome_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, f.series_key, f.horizon_code, f.method,
    f.target_at, p_observed, p_evidence_object_id, p_evidence_version, p_evidence_digest, p_known_at,
    q10, q50, q90, v_cov, abs(p_observed - q50), v_pin, f.label, p_actor, p_correlation);
  UPDATE prediction.forecasts_current SET state = CASE WHEN state = 'issued' THEN 'resolved' ELSE state END,
         updated_at = clock_timestamp() WHERE forecast_id = p_forecast_id;
  INSERT INTO prediction.forecast_events (
    event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.resolved', p_actor,
    jsonb_build_object('outcome_id', p_outcome_id, 'observed', p_observed, 'covered', v_cov,
                       'pinball_mean', v_pin, 'evidence_object_id', p_evidence_object_id),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_outcome(uuid,uuid,uuid,uuid,numeric,uuid,bigint,text,timestamptz,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_outcome(uuid,uuid,uuid,uuid,numeric,uuid,bigint,text,timestamptz,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION prediction.declare_scenario(
  p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_statement text,
  p_forecast_id uuid, p_subject uuid, p_owner uuid, p_review_cadence text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_forecast_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = p_forecast_id
         AND f.tenant_id = p_tenant AND f.domain_id = p_domain) THEN
    RAISE EXCEPTION 'scenario rejected: no such forecast in this domain' USING ERRCODE = '23503';
  END IF;
  INSERT INTO prediction.scenarios_current (
    scenario_id, scope, tenant_id, domain_id, title, statement, forecast_id, subject_entity_id,
    owner_principal_id, review_cadence, state, correlation_id
  ) VALUES (
    p_scenario_id, 'DOMAIN', p_tenant, p_domain, p_title, p_statement, p_forecast_id, p_subject,
    p_owner, p_review_cadence, 'active', p_correlation);
  INSERT INTO prediction.scenario_events (
    event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.declared', p_actor,
    jsonb_build_object('title', p_title, 'forecast_id', p_forecast_id, 'owner', p_owner), p_correlation);
  -- A scenario built on a forecast rests on it.
  IF p_forecast_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, 'SCN', 'forecast', p_forecast_id,
      'the scenario tree is built on this forecast; if the forecast is questioned so is every branch',
      'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_scenario(uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_scenario(uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION prediction.define_indicator(
  p_indicator_id uuid, p_tenant uuid, p_domain uuid, p_series_key text, p_description text,
  p_comparator text, p_threshold numeric, p_consecutive int, p_owner uuid, p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.indicator.define']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM prediction.series_registry s
                  WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.series_key = p_series_key) THEN
    RAISE EXCEPTION 'indicator rejected: series % is not registered in this domain', p_series_key USING ERRCODE = '23503';
  END IF;
  INSERT INTO prediction.indicators_current (
    indicator_id, scope, tenant_id, domain_id, series_key, description, comparator, threshold,
    consecutive_days, owner_principal_id, state, correlation_id
  ) VALUES (
    p_indicator_id, 'DOMAIN', p_tenant, p_domain, p_series_key, p_description, p_comparator, p_threshold,
    p_consecutive, p_owner, 'active', p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.define_indicator(uuid,uuid,uuid,text,text,text,numeric,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.define_indicator(uuid,uuid,uuid,text,text,text,numeric,int,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION prediction.add_branch(
  p_branch_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_name text, p_kind text,
  p_statement text, p_indicator_id uuid, p_signpost text, p_owner uuid, p_review_cadence text,
  p_response_hours int, p_consequence text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id
                   AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.state = 'active') THEN
    RAISE EXCEPTION 'branch rejected: no active scenario % in this domain', p_scenario_id USING ERRCODE = '23503';
  END IF;
  IF p_indicator_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM prediction.indicators_current i
      WHERE i.indicator_id = p_indicator_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain) THEN
    RAISE EXCEPTION 'branch rejected: no such indicator in this domain' USING ERRCODE = '23503';
  END IF;
  INSERT INTO prediction.branches_current (
    branch_id, scope, tenant_id, domain_id, scenario_id, name, kind, statement, indicator_id, signpost,
    owner_principal_id, review_cadence, response_window_hours, consequence, state, correlation_id
  ) VALUES (
    p_branch_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_name, p_kind, p_statement, p_indicator_id,
    p_signpost, p_owner, p_review_cadence, coalesce(p_response_hours, 72), p_consequence, 'open', p_correlation);
  INSERT INTO prediction.scenario_events (
    event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'branch.added', p_actor,
    jsonb_build_object('name', p_name, 'kind', p_kind, 'indicator_id', p_indicator_id, 'owner', p_owner),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,uuid,uuid,uuid) TO eye_commit;

/*
 * EVALUATING AN INDICATOR records the observation it was evaluated against and
 * updates the streak. When the streak reaches the declared run of consecutive
 * days the indicator is BREACHED, and every OPEN branch that names it FLIPS —
 * each flip its own event with its own id, returned to the caller so the
 * warning that follows can cite it. A flip is a fact with a receipt, not a
 * re-render.
 */
CREATE OR REPLACE FUNCTION prediction.evaluate_indicator(
  p_evaluation_id uuid, p_tenant uuid, p_domain uuid, p_indicator_id uuid, p_known_at timestamptz,
  p_observation_at date, p_value numeric, p_evidence_object_id uuid, p_evidence_version bigint,
  p_actor uuid, p_correlation uuid
) RETURNS TABLE (out_breached boolean, out_streak int, out_branch_id uuid, out_flip_event_id uuid)
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i prediction.indicators_current%ROWTYPE; v_sat boolean; v_streak int; v_breached boolean; b record;
        v_flip uuid; v_any boolean := false;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.indicator.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO i FROM prediction.indicators_current
   WHERE indicator_id = p_indicator_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evaluation rejected: no such indicator in this domain' USING ERRCODE = '23503';
  END IF;
  IF i.last_observation_at IS NOT NULL AND p_observation_at <= i.last_observation_at THEN
    RAISE EXCEPTION 'evaluation rejected: observation % is not after the last evaluated observation %',
      p_observation_at, i.last_observation_at USING ERRCODE = '22023';
  END IF;
  v_sat := CASE i.comparator
    WHEN '<'  THEN p_value <  i.threshold
    WHEN '<=' THEN p_value <= i.threshold
    WHEN '>'  THEN p_value >  i.threshold
    ELSE           p_value >= i.threshold END;
  v_streak := CASE WHEN v_sat THEN i.streak + 1 ELSE 0 END;
  v_breached := v_streak >= i.consecutive_days;

  INSERT INTO prediction.indicator_evaluations (
    evaluation_id, scope, tenant_id, domain_id, indicator_id, known_at, observation_at, value,
    evidence_object_id, evidence_version, satisfied, streak, breached, actor_principal_id, correlation_id
  ) VALUES (
    p_evaluation_id, 'DOMAIN', p_tenant, p_domain, p_indicator_id, p_known_at, p_observation_at, p_value,
    p_evidence_object_id, p_evidence_version, v_sat, v_streak, v_breached, p_actor, p_correlation);

  UPDATE prediction.indicators_current
     SET last_value = p_value, last_observation_at = p_observation_at, last_evaluated_at = clock_timestamp(),
         streak = v_streak,
         breached = CASE WHEN v_breached THEN true ELSE i.breached AND v_sat END,
         breached_at = CASE WHEN v_breached AND NOT i.breached THEN clock_timestamp() ELSE i.breached_at END
   WHERE indicator_id = p_indicator_id;

  IF v_breached THEN
    FOR b IN SELECT br.branch_id, br.scenario_id FROM prediction.branches_current br
              WHERE br.indicator_id = p_indicator_id AND br.state = 'open' FOR UPDATE
    LOOP
      v_flip := gen_random_uuid();
      UPDATE prediction.branches_current
         SET state = 'flipped', flipped_at = clock_timestamp(), flip_event_id = v_flip,
             flip_correlation_id = p_correlation
       WHERE branch_id = b.branch_id;
      INSERT INTO prediction.scenario_events (
        event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
      ) VALUES (
        v_flip, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'branch.flipped', p_actor,
        jsonb_build_object('indicator_id', p_indicator_id, 'evaluation_id', p_evaluation_id,
                           'observation_at', p_observation_at, 'value', p_value, 'streak', v_streak,
                           'threshold', i.threshold, 'comparator', i.comparator,
                           'consecutive_days', i.consecutive_days),
        p_correlation);
      v_any := true;
      out_breached := true; out_streak := v_streak; out_branch_id := b.branch_id; out_flip_event_id := v_flip;
      RETURN NEXT;
    END LOOP;
  END IF;
  IF NOT v_any THEN
    out_breached := v_breached; out_streak := v_streak; out_branch_id := NULL; out_flip_event_id := NULL;
    RETURN NEXT;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.evaluate_indicator(uuid,uuid,uuid,uuid,timestamptz,date,numeric,uuid,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.evaluate_indicator(uuid,uuid,uuid,uuid,timestamptz,date,numeric,uuid,bigint,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION prediction.raise_warning(
  p_warning_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_indicator_id uuid, p_forecast_id uuid,
  p_title text, p_evidence jsonb, p_consequence text, p_confidence numeric,
  p_opens_at timestamptz, p_closes_at timestamptz, p_routed_to uuid,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_routed_to AND p.status = 'active'
                   AND p.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'warning rejected: it must route to a named, active principal in this tenant' USING ERRCODE = '23503';
  END IF;
  INSERT INTO prediction.warnings_current (
    warning_id, scope, tenant_id, domain_id, branch_id, indicator_id, forecast_id, title, evidence,
    consequence, confidence, response_window_opens_at, response_window_closes_at, routed_to,
    raised_by, state, correlation_id
  ) VALUES (
    p_warning_id, 'DOMAIN', p_tenant, p_domain, p_branch_id, p_indicator_id, p_forecast_id, p_title,
    p_evidence, p_consequence, p_confidence, p_opens_at, p_closes_at, p_routed_to, p_actor, 'raised',
    p_correlation);
  INSERT INTO prediction.warning_events (
    event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_warning_id, 'warning.raised', p_actor,
    jsonb_build_object('routed_to', p_routed_to, 'closes_at', p_closes_at, 'branch_id', p_branch_id,
                       'confidence', p_confidence, 'title', p_title),
    p_correlation);
  IF p_branch_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning_id, 'WRN', 'strategy',
      (SELECT s.scenario_id FROM prediction.branches_current b JOIN prediction.scenarios_current s USING (scenario_id)
        WHERE b.branch_id = p_branch_id),
      'the warning was raised because this scenario''s branch flipped', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION prediction.acknowledge_warning(
  p_warning_id uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS text
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w prediction.warnings_current%ROWTYPE; v_late boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO w FROM prediction.warnings_current
   WHERE warning_id = p_warning_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acknowledgement rejected: no such warning in this domain' USING ERRCODE = '23503';
  END IF;
  IF w.state <> 'raised' THEN
    RAISE EXCEPTION 'acknowledgement rejected: the warning is %', w.state USING ERRCODE = '22023';
  END IF;
  -- Acknowledging after the window closed is recorded AS late, never quietly.
  v_late := clock_timestamp() > w.response_window_closes_at;
  UPDATE prediction.warnings_current
     SET state = 'acknowledged', acknowledged_at = clock_timestamp(), acknowledged_by = p_actor,
         acknowledgement = p_note
   WHERE warning_id = p_warning_id;
  INSERT INTO prediction.warning_events (
    event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_warning_id, 'warning.acknowledged', p_actor,
    jsonb_build_object('note', p_note, 'late', v_late, 'closes_at', w.response_window_closes_at),
    p_correlation);
  RETURN CASE WHEN v_late THEN 'acknowledged_late' ELSE 'acknowledged' END;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.acknowledge_warning(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.acknowledge_warning(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* A warning nobody acknowledged before its window closed is EXPIRED — a recorded failure, not silence. */
CREATE OR REPLACE FUNCTION prediction.expire_warnings(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS int
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; n int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.raise', 'prediction.indicator.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR r IN SELECT warning_id, response_window_closes_at FROM prediction.warnings_current
            WHERE tenant_id = p_tenant AND domain_id = p_domain AND state = 'raised'
              AND response_window_closes_at < clock_timestamp() FOR UPDATE
  LOOP
    UPDATE prediction.warnings_current SET state = 'expired' WHERE warning_id = r.warning_id;
    INSERT INTO prediction.warning_events (
      event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.warning_id, 'warning.expired', p_actor,
      jsonb_build_object('closed_at', r.response_window_closes_at,
                         'reason', 'the response window closed without an acknowledgement'), p_correlation);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.expire_warnings(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.expire_warnings(uuid,uuid,uuid,uuid) TO eye_commit;

-- ── canonical write actions and schemas ────────────────────────────────────
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('prediction.forecast.issue', ARRAY['FCT'],
   'Issuing a forecast admits a forecast object and nothing else'),
  ('prediction.scenario.declare', ARRAY['SCN'],
   'Declaring a scenario tree admits a scenario object and nothing else'),
  ('prediction.warning.raise', ARRAY['WRN'],
   'Raising an early warning admits a warning object and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('FCT', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["series_key","horizon","origin_at","known_at","target_at","method","baseline_method",
               "distribution","drivers","assumptions","evidence","validation","label","statement"],
  "properties": {
    "series_key": { "type": "string", "minLength": 2 },
    "subject_entity_id": { "type": ["string","null"] },
    "horizon": { "type": "object", "required": ["code","days"],
                 "properties": { "code": { "enum": ["30d","90d","180d","1y","3y","5y"] }, "days": { "type": "integer", "minimum": 1 } } },
    "origin_at": { "type": "string" },
    "known_at": { "type": "string" },
    "target_at": { "type": "string" },
    "method": { "type": "object", "required": ["name","version"],
                "properties": { "name": { "type": "string" }, "version": { "type": "string" }, "parameters": { "type": "object" } } },
    "baseline_method": { "type": "string" },
    "distribution": { "type": "object", "required": ["q10","q50","q90"],
                      "properties": { "q10": { "type": "number" }, "q50": { "type": "number" }, "q90": { "type": "number" },
                                      "unit": { "type": "string" }, "path": { "type": "array" } } },
    "drivers": { "type": "array", "minItems": 1, "items": { "type": "object",
                 "required": ["series_key","role","evidence_object_id"],
                 "properties": { "series_key": { "type": "string" }, "role": { "type": "string" }, "share": { "type": ["number","null"] },
                                 "evidence_object_id": { "type": "string" }, "evidence_version": { "type": "integer" },
                                 "evidence_digest": { "type": "string" }, "attribution": { "type": ["string","null"] } } } },
    "assumptions": { "type": "array", "minItems": 1, "items": { "type": "string" } },
    "evidence": { "type": "array", "minItems": 1, "items": { "type": "object",
                  "required": ["evidence_object_id","evidence_version","evidence_digest"] } },
    "refresh_cadence": { "type": "string" },
    "validation": { "type": "object", "required": ["state","note"],
                    "properties": { "state": { "enum": ["unvalidated","validated","validation_impossible"] },
                                    "note": { "type": "string" }, "backtest_id": { "type": ["string","null"] },
                                    "skill": { "type": ["object","null"] } } },
    "label": { "enum": ["replay demonstration","live"] },
    "statement": { "type": "string", "minLength": 8 },
    "narrative": { "type": ["object","null"] }
  }
}'::jsonb, 'backward'),
('SCN', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["title","statement","owner","review_cadence","branches"],
  "properties": {
    "title": { "type": "string", "minLength": 2 },
    "statement": { "type": "string", "minLength": 2 },
    "forecast_id": { "type": ["string","null"] },
    "subject_entity_id": { "type": ["string","null"] },
    "owner": { "type": "string" },
    "review_cadence": { "type": "string" },
    "branches": { "type": "array", "minItems": 1, "items": { "type": "object",
                  "required": ["branch_id","name","kind","statement","owner","consequence"],
                  "properties": { "branch_id": { "type": "string" }, "name": { "type": "string" },
                                  "kind": { "enum": ["baseline","upside","downside"] }, "statement": { "type": "string" },
                                  "indicator": { "type": ["object","null"] }, "signpost": { "type": ["string","null"] },
                                  "owner": { "type": "string" }, "review_cadence": { "type": "string" },
                                  "response_window_hours": { "type": "integer" }, "consequence": { "type": "string" } } } }
  }
}'::jsonb, 'backward'),
('WRN', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["title","evidence","consequence","confidence","response_window","routed_to"],
  "properties": {
    "title": { "type": "string", "minLength": 2 },
    "branch_id": { "type": ["string","null"] },
    "indicator_id": { "type": ["string","null"] },
    "forecast_id": { "type": ["string","null"] },
    "flip_event_id": { "type": ["string","null"] },
    "evidence": { "type": "array", "minItems": 1 },
    "consequence": { "type": "string", "minLength": 8 },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "response_window": { "type": "object", "required": ["opens_at","closes_at"],
                         "properties": { "opens_at": { "type": "string" }, "closes_at": { "type": "string" } } },
    "routed_to": { "type": "string" }
  }
}'::jsonb, 'backward');

-- ── projection rebuild (the A11 property, extended to Phase 4) ─────────────
CREATE OR REPLACE FUNCTION prediction.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint)
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid;
BEGIN
  v_tenant := public.eye_tenant(); v_domain := public.eye_domain();
  -- forecasts: every forecast_id with an issue event has exactly one projection row.
  RETURN QUERY
    WITH issued AS (SELECT DISTINCT forecast_id FROM prediction.forecast_events
                     WHERE tenant_id = v_tenant AND domain_id = v_domain AND event = 'forecast.issued'),
         live AS (SELECT forecast_id FROM prediction.forecasts_current WHERE tenant_id = v_tenant AND domain_id = v_domain)
    SELECT 'forecasts_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM issued),
           (SELECT count(*) FROM (SELECT forecast_id FROM issued EXCEPT SELECT forecast_id FROM live) x)
         + (SELECT count(*) FROM (SELECT forecast_id FROM live EXCEPT SELECT forecast_id FROM issued) y);
  -- branches: a flipped branch has its flip event; an open branch has none.
  RETURN QUERY
    WITH flips AS (SELECT DISTINCT branch_id FROM prediction.scenario_events
                    WHERE tenant_id = v_tenant AND domain_id = v_domain AND event = 'branch.flipped'),
         live AS (SELECT branch_id FROM prediction.branches_current
                   WHERE tenant_id = v_tenant AND domain_id = v_domain AND state = 'flipped')
    SELECT 'branches_current(flipped)'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM flips),
           (SELECT count(*) FROM (SELECT branch_id FROM flips EXCEPT SELECT branch_id FROM live) x)
         + (SELECT count(*) FROM (SELECT branch_id FROM live EXCEPT SELECT branch_id FROM flips) y);
  -- warnings: state follows the last event.
  RETURN QUERY
    WITH last AS (SELECT DISTINCT ON (warning_id) warning_id, event FROM prediction.warning_events
                   WHERE tenant_id = v_tenant AND domain_id = v_domain ORDER BY warning_id, occurred_at DESC),
         expect AS (SELECT warning_id, CASE event WHEN 'warning.raised' THEN 'raised' WHEN 'warning.acknowledged' THEN 'acknowledged'
                                                  WHEN 'warning.expired' THEN 'expired' ELSE 'closed' END AS state FROM last),
         live AS (SELECT warning_id, state FROM prediction.warnings_current WHERE tenant_id = v_tenant AND domain_id = v_domain)
    SELECT 'warnings_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
           (SELECT count(*) FROM (SELECT * FROM expect EXCEPT SELECT * FROM live) x)
         + (SELECT count(*) FROM (SELECT * FROM live EXCEPT SELECT * FROM expect) y);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.rebuild_projections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.rebuild_projections() TO eye_app, eye_commit;
