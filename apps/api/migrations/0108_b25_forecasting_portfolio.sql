-- 0108 — CP-6 B25 (2026-10-06): FORECASTING PORTFOLIO I — grounded context, multi-method horizons, ensembles (F-P4-01, F-P4-02, F-P4-03;
-- the carried F-P5-03 forecast-provenance ENVIRONMENT, V03-T-196). This file is built as a PRELUDE (§0, the integrator) and three parts folded
-- in apply order: §CX context, information set, replay, environment (F-P4-03) · §MR the governed model registry, routing, horizon policy,
-- the method families, event/state/regime forecasts (F-P4-01) · §EN ensembles, disagreement, model-path availability, the judgement overlay
-- (F-P4-02). 0001–0107 are applied and frozen and untouched.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0 PRELUDE — the shared seams (the integrator, before the parts)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.1 The forecast row gains B25's columns (all additive; every earlier forecast reads as a single quantity forecast):
--   forecast_kind (quantity | event | state | regime), target_key (§MR's governed target), method_ref (§MR's registry key@version),
--   ensemble_id / ensemble_role (§EN: a member names its ensemble; an ensemble names itself), information_set_id (§CX's frozen manifest),
--   environment_digest / environment (§CX; V03-T-196), horizon_policy (§MR's policy version applied), outcome_spec (an event's definition,
--   a state/regime's categories).
ALTER TABLE prediction.forecasts_current
  ADD COLUMN forecast_kind text NOT NULL DEFAULT 'quantity' CHECK (forecast_kind IN ('quantity', 'event', 'state', 'regime')),
  ADD COLUMN target_key text,
  ADD COLUMN method_ref text,
  ADD COLUMN ensemble_id uuid,
  ADD COLUMN ensemble_role text CHECK (ensemble_role IS NULL OR ensemble_role IN ('member', 'ensemble')),
  ADD COLUMN information_set_id uuid,
  ADD COLUMN environment_digest text CHECK (environment_digest IS NULL OR environment_digest ~ '^[0-9a-f]{64}$'),
  ADD COLUMN environment jsonb CHECK (environment IS NULL OR jsonb_typeof(environment) = 'object'),
  ADD COLUMN horizon_policy jsonb CHECK (horizon_policy IS NULL OR jsonb_typeof(horizon_policy) = 'object'),
  ADD COLUMN outcome_spec jsonb CHECK (outcome_spec IS NULL OR jsonb_typeof(outcome_spec) = 'object'),
  ADD CONSTRAINT fct_ensemble_named CHECK ((ensemble_role IS NULL) = (ensemble_id IS NULL)),
  ADD CONSTRAINT fct_ensemble_self CHECK (ensemble_role IS DISTINCT FROM 'ensemble' OR ensemble_id = forecast_id),
  ADD CONSTRAINT fct_environment_pair CHECK ((environment IS NULL) = (environment_digest IS NULL));
CREATE INDEX fct_ensemble ON prediction.forecasts_current (ensemble_id) WHERE ensemble_id IS NOT NULL;
CREATE INDEX fct_information_set ON prediction.forecasts_current (information_set_id) WHERE information_set_id IS NOT NULL;

-- §0.2 The quantiles are ordered for a QUANTITY or an EVENT forecast (an event's are a probability's credible band); a STATE or REGIME
-- forecast carries category probabilities in its payload and an empty quantile object.
ALTER TABLE prediction.forecasts_current DROP CONSTRAINT fct_quantiles_ordered;
ALTER TABLE prediction.forecasts_current ADD CONSTRAINT fct_quantiles_ordered CHECK (
  forecast_kind IN ('state', 'regime')
  OR ((quantiles ->> 'q10')::numeric <= (quantiles ->> 'q50')::numeric AND (quantiles ->> 'q50')::numeric <= (quantiles ->> 'q90')::numeric));

-- §0.3 The validation vocabulary gains `scenario_language`: a forecast that speaks in regime / scenario language at a long horizon and
-- CLAIMS NO EMPIRICAL VALIDATION (V00-T-051's 5y treatment) — never presented as validated.
ALTER TABLE prediction.forecasts_current DROP CONSTRAINT forecasts_current_validation_state_check;
ALTER TABLE prediction.forecasts_current ADD CONSTRAINT forecasts_current_validation_state_check CHECK (validation_state IN (
  'unvalidated', 'validated', 'validated_retrospective', 'validation_impossible', 'scenario_language'));

-- §0.4 The forecast event vocabulary, widened ONCE for the three parts.
ALTER TABLE prediction.forecast_events DROP CONSTRAINT forecast_events_event_check;
ALTER TABLE prediction.forecast_events ADD CONSTRAINT forecast_events_event_check CHECK (event IN (
  'forecast.issued', 'forecast.superseded', 'forecast.resolved', 'forecast.withdrawn', 'forecast.attention', 'forecast.fitness_assessed',
  'forecast.information_set_frozen', 'forecast.replayed',                                  -- §CX
  'forecast.horizon_refused', 'forecast.routed',                                           -- §MR
  'forecast.ensembled', 'forecast.member_excluded', 'forecast.overlay_added', 'forecast.overlay_withdrawn'));   -- §EN

-- §0.5 FCT v2: v1's fields plus what forecasts already carry (controls; the validation states in use) and B25's optional sections.
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('FCT', 'v2', $fct${"type": "object", "$schema": "https://json-schema.org/draft/2020-12/schema", "required": ["series_key", "horizon", "origin_at", "known_at", "target_at", "method", "baseline_method", "distribution", "drivers", "assumptions", "evidence", "validation", "label", "statement"], "properties": {"label": {"enum": ["replay demonstration", "live"]}, "method": {"type": "object", "required": ["name", "version"], "properties": {"name": {"type": "string"}, "version": {"type": "string"}, "parameters": {"type": "object"}}}, "drivers": {"type": "array", "items": {"type": "object", "required": ["series_key", "role", "evidence_object_id"], "properties": {"role": {"type": "string"}, "share": {"type": ["number", "null"]}, "series_key": {"type": "string"}, "attribution": {"type": ["string", "null"]}, "evidence_digest": {"type": "string"}, "evidence_version": {"type": "integer"}, "evidence_object_id": {"type": "string"}}}, "minItems": 1}, "horizon": {"type": "object", "required": ["code", "days"], "properties": {"code": {"enum": ["30d", "90d", "180d", "1y", "3y", "5y"]}, "days": {"type": "integer", "minimum": 1}}}, "evidence": {"type": "array", "items": {"type": "object", "required": ["evidence_object_id", "evidence_version", "evidence_digest"]}, "minItems": 1}, "known_at": {"type": "string"}, "narrative": {"type": ["object", "null"]}, "origin_at": {"type": "string"}, "statement": {"type": "string", "minLength": 8}, "target_at": {"type": "string"}, "series_key": {"type": "string", "minLength": 2}, "validation": {"type": "object", "required": ["state", "note"], "properties": {"note": {"type": "string"}, "skill": {"type": ["object", "null"]}, "state": {"enum": ["unvalidated", "validated", "validated_retrospective", "validation_impossible", "scenario_language"]}, "backtest_id": {"type": ["string", "null"]}}}, "assumptions": {"type": "array", "items": {"type": "string"}, "minItems": 1}, "distribution": {"type": "object", "required": [], "properties": {"q10": {"type": "number"}, "q50": {"type": "number"}, "q90": {"type": "number"}, "path": {"type": "array"}, "unit": {"type": "string"}, "categories": {"type": "array"}}}, "baseline_method": {"type": "string"}, "refresh_cadence": {"type": "string"}, "subject_entity_id": {"type": ["string", "null"]}, "controls": {"type": "object"}, "forecast_kind": {"enum": ["quantity", "event", "state", "regime"]}, "target_key": {"type": ["string", "null"]}, "method_ref": {"type": ["string", "null"]}, "horizon_policy": {"type": ["object", "null"]}, "outcome": {"type": ["object", "null"]}, "ensemble": {"type": ["object", "null"]}, "information_set": {"type": ["object", "null"]}, "environment": {"type": ["object", "null"]}, "disagreement": {"type": ["object", "null"]}, "excluded_models": {"type": ["array", "null"]}}, "additionalProperties": false}$fct$::jsonb, 'backward')
ON CONFLICT DO NOTHING;

-- §0.6 prediction.issue_forecast re-declared (copied whole from its last declaration, 0030; the changes marked `-- 0108 §0`): the trailing
-- p_extras writes §0.1's columns, the issued event carries them, and SUPERSESSION follows the lineage (an ensemble's members coexist).
-- The parts never re-declare it; each validates its own references in its own section (a trigger or a port).
DROP FUNCTION IF EXISTS prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,jsonb,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.issue_forecast(
  p_forecast_id uuid, p_tenant uuid, p_domain uuid, p_series_key text, p_subject uuid,
  p_horizon_code text, p_horizon_days int, p_origin_at date, p_known_at timestamptz, p_target_at date,
  p_method text, p_method_version text, p_baseline_method text, p_quantiles jsonb, p_path jsonb,
  p_drivers jsonb, p_assumptions uuid[], p_evidence_refs jsonb, p_refresh_cadence text,
  p_validation_state text, p_validation_note text, p_label text, p_skill jsonb, p_statement text,
  p_backtest_id uuid, p_controls jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid,
  p_extras jsonb DEFAULT '{}'::jsonb   -- 0108 §0: B25's columns (forecast_kind, target_key, method_ref, ensemble_id, ensemble_role, information_set_id, environment, horizon_policy, outcome_spec)
) RETURNS void
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; a uuid; e jsonb;
        v_kind text := coalesce(p_extras ->> 'forecast_kind', 'quantity'); v_role text := p_extras ->> 'ensemble_role'; v_ens uuid := (p_extras ->> 'ensemble_id')::uuid;   -- 0108 §0
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.forecast.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM prediction.series_registry s
                  WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.series_key = p_series_key) THEN
    RAISE EXCEPTION 'forecast rejected: series % is not registered in this domain', p_series_key USING ERRCODE = '23503';
  END IF;
  FOREACH a IN ARRAY coalesce(p_assumptions, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s
                    WHERE s.strategy_object_id = a AND s.object_type = 'ASU'
                      AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'forecast rejected: % is not an assumption in this domain', a USING ERRCODE = '23503';
    END IF;
  END LOOP;
  -- A validation claim must name the backtest that earned it, and that backtest must be this
  -- series and horizon, computed on evidence known no later than this forecast's cut-off.
  IF p_validation_state IN ('validated', 'validated_retrospective') THEN
    IF p_backtest_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM prediction.backtests b WHERE b.backtest_id = p_backtest_id
           AND b.tenant_id = p_tenant AND b.domain_id = p_domain
           AND b.series_key = p_series_key AND b.horizon_code = p_horizon_code
           AND b.method_version = p_method_version
           AND coalesce(b.known_at, b.computed_at) <= p_known_at
           AND b.window_to <= p_origin_at
           AND ((p_validation_state = 'validated' AND b.mode = 'historical')
                OR (p_validation_state = 'validated_retrospective' AND b.mode = 'retrospective'))) THEN
      RAISE EXCEPTION 'forecast rejected: validation_state % names no applicable backtest (same series, horizon and method version; evidence known by %; history ending by %)',
        p_validation_state, p_known_at, p_origin_at USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO prediction.forecasts_current (
    forecast_id, scope, tenant_id, domain_id, series_key, subject_entity_id, horizon_code, horizon_days,
    origin_at, known_at, target_at, method, method_version, baseline_method, quantiles, path, drivers,
    assumptions, evidence_refs, refresh_cadence, validation_state, validation_note, label, skill,
    statement, state, issued_by, correlation_id, backtest_id, controls,
    forecast_kind, target_key, method_ref, ensemble_id, ensemble_role, information_set_id, environment_digest, environment, horizon_policy, outcome_spec   -- 0108 §0
  ) VALUES (
    p_forecast_id, 'DOMAIN', p_tenant, p_domain, p_series_key, p_subject, p_horizon_code, p_horizon_days,
    p_origin_at, p_known_at, p_target_at, p_method, p_method_version, p_baseline_method, p_quantiles,
    coalesce(p_path, '[]'::jsonb), p_drivers, coalesce(p_assumptions, ARRAY[]::uuid[]), p_evidence_refs,
    p_refresh_cadence, p_validation_state, p_validation_note, p_label, p_skill, p_statement, 'issued',
    p_actor, p_correlation, p_backtest_id, coalesce(p_controls, '{}'::jsonb),
    v_kind, p_extras ->> 'target_key', p_extras ->> 'method_ref', v_ens, v_role, (p_extras ->> 'information_set_id')::uuid,   -- 0108 §0
    p_extras #>> '{environment,digest}', p_extras -> 'environment', p_extras -> 'horizon_policy', p_extras -> 'outcome_spec');

  INSERT INTO prediction.forecast_events (
    event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.issued', p_actor,
    jsonb_build_object('series_key', p_series_key, 'horizon', p_horizon_code, 'method', p_method,
                       'origin_at', p_origin_at, 'known_at', p_known_at, 'target_at', p_target_at,
                       'quantiles', p_quantiles, 'validation_state', p_validation_state, 'label', p_label,
                       'backtest_id', p_backtest_id, 'controls', p_controls)
      || CASE WHEN p_extras = '{}'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('b25', p_extras - 'environment' || jsonb_build_object('environment_digest', p_extras #>> '{environment,digest}')) END,   -- 0108 §0
    p_correlation);

  /* 0108 §0 — SUPERSESSION BY LINEAGE (the cross-method problem): an ensemble MEMBER supersedes nothing and is superseded only with
     its ensemble; a new ENSEMBLE supersedes the prior ensemble of the same key (series, horizon, subject, kind, target) and that
     ensemble's members; a SINGLE forecast supersedes prior singles of the same key — the legacy rule, unchanged for singles. Two
     methods' members of one ensemble therefore stand side by side. */
  FOR r IN SELECT f.forecast_id FROM prediction.forecasts_current f
            WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.series_key = p_series_key
              AND f.horizon_code = p_horizon_code AND f.subject_entity_id IS NOT DISTINCT FROM p_subject
              AND f.state = 'issued' AND f.forecast_id <> p_forecast_id
              AND f.forecast_kind = v_kind AND f.target_key IS NOT DISTINCT FROM (p_extras ->> 'target_key')   -- 0108 §0
              AND v_role IS DISTINCT FROM 'member'                                                               -- 0108 §0
              AND ((v_role IS NULL AND f.ensemble_role IS NULL)                                                  -- 0108 §0
                   OR (v_role = 'ensemble' AND (f.ensemble_role = 'ensemble'
                        OR (f.ensemble_role = 'member' AND f.ensemble_id <> v_ens AND EXISTS (SELECT 1 FROM prediction.forecasts_current g
                              WHERE g.forecast_id = f.ensemble_id AND g.state = 'issued')))))
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
REVOKE ALL ON FUNCTION prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,jsonb,uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,jsonb,uuid,uuid,uuid,jsonb) TO eye_commit;
