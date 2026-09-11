-- ============================================================
-- 0030 — PHASE 4 · BOUNDED CORRECTION OF 737ca81a.
--
-- Forward and additive. 0028–0029 stand; every change below is a new column,
-- a widened check, or a replaced port. Answers the seven groups Codex raised:
--
--   §1  validation is BOUND to the record that earned it — a backtest carries
--       its knowledge mode, its evidence vintage and the history it saw
--   §2  controls are INHERITED — forecasts, scenarios and warnings carry the
--       synthetic state, classification, rights, residency, retention and
--       access policy of what they rest on
--   §3  a flipped branch OWES a warning until one is raised, and a warning is
--       unique per flip
--   §4  replay timing is explicit — a warning records the instant it was raised
--       AS OF, its decision deadline and its timeliness, apart from audit time
--   §5  an outcome records the day actually observed and any substitution
-- ============================================================

-- ============================================================
-- 1. Validation bound to the applicable record.
-- ============================================================
ALTER TABLE prediction.backtests
  ADD COLUMN known_at timestamptz,
  ADD COLUMN observations int,
  ADD COLUMN mode text NOT NULL DEFAULT 'retrospective'
    CHECK (mode IN ('retrospective', 'historical'));
COMMENT ON COLUMN prediction.backtests.mode IS
  'retrospective = one evidence vintage (known_at) cut by publisher date per origin; '
  'historical = each origin read only evidence RECORDED by that origin — historical knowledge, not hindsight';

ALTER TABLE prediction.forecasts_current DROP CONSTRAINT forecasts_current_validation_state_check;
ALTER TABLE prediction.forecasts_current ADD CONSTRAINT forecasts_current_validation_state_check
  CHECK (validation_state IN ('unvalidated', 'validated', 'validated_retrospective', 'validation_impossible'));
ALTER TABLE prediction.forecasts_current ADD COLUMN backtest_id uuid;

-- ============================================================
-- 2. Inherited controls.
-- ============================================================
ALTER TABLE prediction.forecasts_current ADD COLUMN controls jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE prediction.scenarios_current ADD COLUMN controls jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE prediction.warnings_current  ADD COLUMN controls jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- 3. The warning a flip owes.
-- ============================================================
ALTER TABLE prediction.branches_current
  ADD COLUMN warning_state text NOT NULL DEFAULT 'none' CHECK (warning_state IN ('none', 'owed', 'raised')),
  ADD COLUMN decision_deadline timestamptz;
ALTER TABLE prediction.warnings_current
  ADD COLUMN flip_event_id uuid,
  ADD COLUMN raised_as_of timestamptz,
  ADD COLUMN timing_mode text NOT NULL DEFAULT 'live' CHECK (timing_mode IN ('live', 'replay')),
  ADD COLUMN decision_deadline timestamptz,
  ADD COLUMN timely boolean;
UPDATE prediction.warnings_current SET raised_as_of = raised_at WHERE raised_as_of IS NULL;
ALTER TABLE prediction.warnings_current ALTER COLUMN raised_as_of SET NOT NULL;
CREATE UNIQUE INDEX wrn_one_per_flip ON prediction.warnings_current (flip_event_id) WHERE flip_event_id IS NOT NULL;
-- Flips already on record that have a warning are settled; those without one are owed.
UPDATE prediction.branches_current b SET warning_state = CASE
  WHEN EXISTS (SELECT 1 FROM prediction.warnings_current w WHERE w.branch_id = b.branch_id) THEN 'raised'
  ELSE 'owed' END
 WHERE b.state = 'flipped';

-- ============================================================
-- 5. Outcomes record the day observed.
-- ============================================================
/*
 * The ledger is append-only, so rows scored before this migration keep a NULL
 * `observed_on`: they were scored under the old rule and the record says so
 * rather than being rewritten to look compliant. The port requires it from now on.
 */
ALTER TABLE prediction.outcome_ledger
  ADD COLUMN observed_on date,
  ADD COLUMN substitution text NOT NULL DEFAULT 'none';
COMMENT ON COLUMN prediction.outcome_ledger.observed_on IS
  'the day actually observed; NULL only on rows scored before 0030, when the target day was assumed';

-- ============================================================
-- Ports.
-- ============================================================
DROP FUNCTION IF EXISTS prediction.record_backtest(uuid,uuid,uuid,text,text,int,text,text,text,date,date,int,numeric,numeric,numeric,numeric,numeric,boolean,boolean,text,text,jsonb,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.record_backtest(
  p_backtest_id uuid, p_tenant uuid, p_domain uuid, p_series_key text, p_horizon_code text,
  p_horizon_days int, p_method text, p_method_version text, p_baseline_method text,
  p_window_from date, p_window_to date, p_origins int, p_coverage numeric, p_pinball numeric,
  p_baseline_coverage numeric, p_baseline_pinball numeric, p_skill numeric, p_t1 boolean, p_t2 boolean,
  p_verdict text, p_discipline text, p_details jsonb, p_known_at timestamptz, p_observations int, p_mode text,
  p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.backtest.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO prediction.backtests (
    backtest_id, scope, tenant_id, domain_id, series_key, horizon_code, horizon_days, method,
    method_version, baseline_method, window_from, window_to, origins, coverage_80, pinball_mean,
    baseline_coverage_80, baseline_pinball_mean, skill_vs_baseline, t1_met, t2_met, verdict,
    known_at_discipline, details, known_at, observations, mode, computed_by, correlation_id
  ) VALUES (
    p_backtest_id, 'DOMAIN', p_tenant, p_domain, p_series_key, p_horizon_code, p_horizon_days, p_method,
    p_method_version, p_baseline_method, p_window_from, p_window_to, p_origins, p_coverage, p_pinball,
    p_baseline_coverage, p_baseline_pinball, p_skill, p_t1, p_t2, p_verdict, p_discipline,
    coalesce(p_details, '{}'::jsonb), p_known_at, p_observations, p_mode, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_backtest(uuid,uuid,uuid,text,text,int,text,text,text,date,date,int,numeric,numeric,numeric,numeric,numeric,boolean,boolean,text,text,jsonb,timestamptz,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_backtest(uuid,uuid,uuid,text,text,int,text,text,text,date,date,int,numeric,numeric,numeric,numeric,numeric,boolean,boolean,text,text,jsonb,timestamptz,int,text,uuid,uuid) TO eye_commit;

DROP FUNCTION IF EXISTS prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.issue_forecast(
  p_forecast_id uuid, p_tenant uuid, p_domain uuid, p_series_key text, p_subject uuid,
  p_horizon_code text, p_horizon_days int, p_origin_at date, p_known_at timestamptz, p_target_at date,
  p_method text, p_method_version text, p_baseline_method text, p_quantiles jsonb, p_path jsonb,
  p_drivers jsonb, p_assumptions uuid[], p_evidence_refs jsonb, p_refresh_cadence text,
  p_validation_state text, p_validation_note text, p_label text, p_skill jsonb, p_statement text,
  p_backtest_id uuid, p_controls jsonb,
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
    statement, state, issued_by, correlation_id, backtest_id, controls
  ) VALUES (
    p_forecast_id, 'DOMAIN', p_tenant, p_domain, p_series_key, p_subject, p_horizon_code, p_horizon_days,
    p_origin_at, p_known_at, p_target_at, p_method, p_method_version, p_baseline_method, p_quantiles,
    coalesce(p_path, '[]'::jsonb), p_drivers, coalesce(p_assumptions, ARRAY[]::uuid[]), p_evidence_refs,
    p_refresh_cadence, p_validation_state, p_validation_note, p_label, p_skill, p_statement, 'issued',
    p_actor, p_correlation, p_backtest_id, coalesce(p_controls, '{}'::jsonb));

  INSERT INTO prediction.forecast_events (
    event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.issued', p_actor,
    jsonb_build_object('series_key', p_series_key, 'horizon', p_horizon_code, 'method', p_method,
                       'origin_at', p_origin_at, 'known_at', p_known_at, 'target_at', p_target_at,
                       'quantiles', p_quantiles, 'validation_state', p_validation_state, 'label', p_label,
                       'backtest_id', p_backtest_id, 'controls', p_controls),
    p_correlation);

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
REVOKE ALL ON FUNCTION prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.issue_forecast(uuid,uuid,uuid,text,uuid,text,int,date,timestamptz,date,text,text,text,jsonb,jsonb,jsonb,uuid[],jsonb,text,text,text,text,jsonb,text,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

DROP FUNCTION IF EXISTS prediction.declare_scenario(uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.declare_scenario(
  p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_statement text,
  p_forecast_id uuid, p_subject uuid, p_owner uuid, p_review_cadence text, p_controls jsonb,
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
    owner_principal_id, review_cadence, state, correlation_id, controls
  ) VALUES (
    p_scenario_id, 'DOMAIN', p_tenant, p_domain, p_title, p_statement, p_forecast_id, p_subject,
    p_owner, p_review_cadence, 'active', p_correlation, coalesce(p_controls, '{}'::jsonb));
  INSERT INTO prediction.scenario_events (
    event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.declared', p_actor,
    jsonb_build_object('title', p_title, 'forecast_id', p_forecast_id, 'owner', p_owner, 'controls', p_controls), p_correlation);
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
REVOKE ALL ON FUNCTION prediction.declare_scenario(uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_scenario(uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid) TO eye_commit;

DROP FUNCTION IF EXISTS prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.add_branch(
  p_branch_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_name text, p_kind text,
  p_statement text, p_indicator_id uuid, p_signpost text, p_owner uuid, p_review_cadence text,
  p_response_hours int, p_consequence text, p_decision_deadline timestamptz,
  p_actor uuid, p_event_id uuid, p_correlation uuid
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
    owner_principal_id, review_cadence, response_window_hours, consequence, state, correlation_id, decision_deadline
  ) VALUES (
    p_branch_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_name, p_kind, p_statement, p_indicator_id,
    p_signpost, p_owner, p_review_cadence, coalesce(p_response_hours, 72), p_consequence, 'open', p_correlation,
    p_decision_deadline);
  INSERT INTO prediction.scenario_events (
    event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'branch.added', p_actor,
    jsonb_build_object('name', p_name, 'kind', p_kind, 'indicator_id', p_indicator_id, 'owner', p_owner,
                       'decision_deadline', p_decision_deadline),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,timestamptz,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,timestamptz,uuid,uuid,uuid) TO eye_commit;

-- A flip OWES a warning: the port says so on the branch, in the same transaction as the flip.
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
             flip_correlation_id = p_correlation, warning_state = 'owed'
       WHERE branch_id = b.branch_id;
      INSERT INTO prediction.scenario_events (
        event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
      ) VALUES (
        v_flip, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'branch.flipped', p_actor,
        jsonb_build_object('indicator_id', p_indicator_id, 'evaluation_id', p_evaluation_id,
                           'observation_at', p_observation_at, 'value', p_value, 'streak', v_streak,
                           'threshold', i.threshold, 'comparator', i.comparator,
                           'consecutive_days', i.consecutive_days, 'evidence_object_id', p_evidence_object_id,
                           'evidence_version', p_evidence_version),
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

DROP FUNCTION IF EXISTS prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.raise_warning(
  p_warning_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_indicator_id uuid, p_forecast_id uuid,
  p_title text, p_evidence jsonb, p_consequence text, p_confidence numeric,
  p_opens_at timestamptz, p_closes_at timestamptz, p_routed_to uuid,
  p_flip_event_id uuid, p_raised_as_of timestamptz, p_timing_mode text, p_decision_deadline timestamptz,
  p_timely boolean, p_controls jsonb,
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
  -- ONE WARNING PER FLIP. A second raise for the same flip is refused by the unique index.
  INSERT INTO prediction.warnings_current (
    warning_id, scope, tenant_id, domain_id, branch_id, indicator_id, forecast_id, title, evidence,
    consequence, confidence, response_window_opens_at, response_window_closes_at, routed_to,
    raised_by, state, correlation_id, flip_event_id, raised_as_of, timing_mode, decision_deadline, timely, controls
  ) VALUES (
    p_warning_id, 'DOMAIN', p_tenant, p_domain, p_branch_id, p_indicator_id, p_forecast_id, p_title,
    p_evidence, p_consequence, p_confidence, p_opens_at, p_closes_at, p_routed_to, p_actor, 'raised',
    p_correlation, p_flip_event_id, coalesce(p_raised_as_of, clock_timestamp()), coalesce(p_timing_mode, 'live'),
    p_decision_deadline, p_timely, coalesce(p_controls, '{}'::jsonb));
  INSERT INTO prediction.warning_events (
    event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_warning_id, 'warning.raised', p_actor,
    jsonb_build_object('routed_to', p_routed_to, 'closes_at', p_closes_at, 'branch_id', p_branch_id,
                       'confidence', p_confidence, 'title', p_title, 'flip_event_id', p_flip_event_id,
                       'raised_as_of', p_raised_as_of, 'timing_mode', p_timing_mode,
                       'decision_deadline', p_decision_deadline, 'timely', p_timely),
    p_correlation);
  IF p_branch_id IS NOT NULL THEN
    UPDATE prediction.branches_current SET warning_state = 'raised' WHERE branch_id = p_branch_id;
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
REVOKE ALL ON FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,timestamptz,text,timestamptz,boolean,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,timestamptz,text,timestamptz,boolean,jsonb,uuid,uuid,uuid) TO eye_commit;

DROP FUNCTION IF EXISTS prediction.record_outcome(uuid,uuid,uuid,uuid,numeric,uuid,bigint,text,timestamptz,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.record_outcome(
  p_outcome_id uuid, p_tenant uuid, p_domain uuid, p_forecast_id uuid, p_observed numeric,
  p_evidence_object_id uuid, p_evidence_version bigint, p_evidence_digest text, p_known_at timestamptz,
  p_observed_on date, p_substitution text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f prediction.forecasts_current%ROWTYPE; q10 numeric; q50 numeric; q90 numeric;
        v_pin numeric; v_cov boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.outcome.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_observed_on IS NULL THEN
    RAISE EXCEPTION 'outcome rejected: the day actually observed must be recorded' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO f FROM prediction.forecasts_current
   WHERE forecast_id = p_forecast_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outcome rejected: no such forecast in this domain' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.outcome_ledger o WHERE o.forecast_id = p_forecast_id) THEN
    RAISE EXCEPTION 'outcome rejected: forecast % is already scored; a score is never revised in place', p_forecast_id
      USING ERRCODE = '23505';
  END IF;
  -- NEVER BEFORE THE TARGET. The observation must be dated at or after the target day, or be a
  -- declared substitution for a day the publication calendar does not cover — and in that case
  -- it must lie inside the three days before the target, and the target must have passed.
  IF p_observed_on > f.target_at THEN
    RAISE EXCEPTION 'outcome rejected: the observation % is after the target %', p_observed_on, f.target_at USING ERRCODE = '22023';
  END IF;
  IF p_observed_on < f.target_at THEN
    IF coalesce(p_substitution, 'none') = 'none' OR p_observed_on < f.target_at - 3 OR p_known_at::date <= f.target_at THEN
      RAISE EXCEPTION 'outcome rejected: % is before the target % and no admissible substitution was declared', p_observed_on, f.target_at
        USING ERRCODE = '22023';
    END IF;
  END IF;
  q10 := (f.quantiles ->> 'q10')::numeric; q50 := (f.quantiles ->> 'q50')::numeric; q90 := (f.quantiles ->> 'q90')::numeric;
  v_pin := (
    (CASE WHEN p_observed >= q10 THEN 0.1 * (p_observed - q10) ELSE 0.9 * (q10 - p_observed) END)
  + (CASE WHEN p_observed >= q50 THEN 0.5 * (p_observed - q50) ELSE 0.5 * (q50 - p_observed) END)
  + (CASE WHEN p_observed >= q90 THEN 0.9 * (p_observed - q90) ELSE 0.1 * (q90 - p_observed) END)) / 3;
  v_cov := p_observed >= q10 AND p_observed <= q90;
  INSERT INTO prediction.outcome_ledger (
    outcome_id, scope, tenant_id, domain_id, forecast_id, series_key, horizon_code, method, target_at,
    observed_value, observed_evidence_object_id, observed_evidence_version, observed_evidence_digest,
    known_at, q10, q50, q90, covered, abs_error, pinball_mean, label, recorded_by, correlation_id,
    observed_on, substitution
  ) VALUES (
    p_outcome_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, f.series_key, f.horizon_code, f.method,
    f.target_at, p_observed, p_evidence_object_id, p_evidence_version, p_evidence_digest, p_known_at,
    q10, q50, q90, v_cov, abs(p_observed - q50), v_pin, f.label, p_actor, p_correlation,
    p_observed_on, coalesce(p_substitution, 'none'));
  UPDATE prediction.forecasts_current SET state = CASE WHEN state = 'issued' THEN 'resolved' ELSE state END,
         updated_at = clock_timestamp() WHERE forecast_id = p_forecast_id;
  INSERT INTO prediction.forecast_events (
    event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.resolved', p_actor,
    jsonb_build_object('outcome_id', p_outcome_id, 'observed', p_observed, 'observed_on', p_observed_on,
                       'substitution', p_substitution, 'covered', v_cov, 'pinball_mean', v_pin,
                       'evidence_object_id', p_evidence_object_id),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_outcome(uuid,uuid,uuid,uuid,numeric,uuid,bigint,text,timestamptz,date,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_outcome(uuid,uuid,uuid,uuid,numeric,uuid,bigint,text,timestamptz,date,text,uuid,uuid,uuid) TO eye_commit;
