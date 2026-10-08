-- 0109 — B25-F (2026-10-08): the B25 review's findings B25-F1 and B25-F2 on the ensemble manager, corrected. 0108 is applied and frozen
-- and is not edited; each function below is re-declared whole, copied from its live definition (0108), the changed lines marked `-- 0109`.
--
-- B25-F1 (DURABLE ENSEMBLE EXECUTION PLANS). The ensemble manager's members were run from the router's IN-PROCESS cache (tenant:domain:
-- method_ref → entry and target): a later plan overwrote what an earlier admitted run executed, a restart lost it, and the run's ROUTE stayed
-- `planned` for ever. The run now persists its plan (ensemble_runs.plan: the route, the target version with its definition digest, each
-- member's entry pin — TypeScript, no SQL: the plan column is the run's own and fixed at admission) and its route is CLOSED with it:
--   · prediction.bind_forecast_route binds an ENSEMBLE run's route to the ensemble forecast the run issued (the forecast names its combination
--     rule, ensemble:<rule>, not a method of the plan): the forecast is a run's own ensemble forecast of this domain, at least two members
--     were issued under it, and every member names a method the route's plan made AVAILABLE; route.issued and forecast.routed carry the
--     members. A single routed forecast binds exactly as before. A failed run's route is REFUSED through the existing
--     prediction.refuse_forecast_route (`forecast rejected (ensemble): run … FAILED — …`), unchanged.
-- B25-F2 (ENSEMBLE OUTPUT COMPATIBILITY). A member whose output answers another question (an effect, an objective's scenario band, another
-- unit, another temporal aggregation) is EXCLUDED and DISCLOSED as `incompatible`: the exclusion class joins the members' vocabulary (the
-- table's check and prediction.pen_record_attempts_and_exclusions), and — like `not_combined` — it requires a SUCCEEDED attempt (the
-- semantics are read from what the member computed).
-- Signatures, owners, grants and every other rule are unchanged (CREATE OR REPLACE keeps the grants; the REVOKEs are restated).

ALTER TABLE prediction.ensemble_members DROP CONSTRAINT ensemble_members_exclusion_class_check;
ALTER TABLE prediction.ensemble_members ADD CONSTRAINT ensemble_members_exclusion_class_check
  CHECK (exclusion_class IS NULL OR exclusion_class IN ('unavailable', 'unimplemented', 'kind', 'failed', 'budget', 'not_combined', 'not_run', 'incompatible'));   -- 0109: + incompatible

CREATE OR REPLACE FUNCTION prediction.bind_forecast_route(p_route_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r prediction.forecast_routes%ROWTYPE; f record; v_members text[];   -- 0109
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.portfolio.issue', 'prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast rejected (actor): a route is bound by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM prediction.forecast_routes x WHERE x.route_id = p_route_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast rejected (unknown_route): % is not a route of this domain', p_route_id USING ERRCODE = '23503'; END IF;
  IF r.outcome <> 'planned' THEN RAISE EXCEPTION 'forecast rejected (state): route % is %, not planned', p_route_id, r.outcome USING ERRCODE = '23514'; END IF;
  SELECT x.forecast_id, x.method_ref, x.horizon_code, x.forecast_kind, x.validation_state, x.ensemble_id, x.ensemble_role INTO f   -- 0109: + the ensemble lineage
    FROM prediction.forecasts_current x WHERE x.forecast_id = r.forecast_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast rejected (unknown_forecast): route % names forecast %, which was not issued', p_route_id, r.forecast_id USING ERRCODE = '23503'; END IF;
  IF f.ensemble_role = 'ensemble' THEN
    -- 0109 (B25-F1): an ENSEMBLE run's route binds to the ensemble forecast the run issued — it names its combination rule, not a method;
    -- every member issued under it must name a method the route's plan made AVAILABLE, and an ensemble combines at least two
    IF f.ensemble_id IS DISTINCT FROM f.forecast_id OR NOT EXISTS (SELECT 1 FROM prediction.ensemble_runs e WHERE e.ensemble_forecast_id = f.forecast_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain) THEN   -- 0109
      RAISE EXCEPTION 'forecast rejected (method): forecast % is not the ensemble forecast of a run of this domain', r.forecast_id USING ERRCODE = '23514';   -- 0109
    END IF;   -- 0109
    v_members := ARRAY(SELECT m.method_ref FROM prediction.forecasts_current m WHERE m.ensemble_id = f.forecast_id AND m.ensemble_role = 'member' AND m.tenant_id = p_tenant AND m.domain_id = p_domain ORDER BY m.method_ref);   -- 0109
    IF cardinality(v_members) < 2 THEN   -- 0109
      RAISE EXCEPTION 'forecast rejected (method): ensemble % has % member(s) issued; an ensemble route binds to at least two', r.forecast_id, cardinality(v_members) USING ERRCODE = '23514';   -- 0109
    END IF;   -- 0109
    IF EXISTS (SELECT 1 FROM unnest(v_members) u WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.plan -> 'methods') x WHERE x ->> 'method_ref' = u AND (x ->> 'available')::boolean)) THEN   -- 0109
      RAISE EXCEPTION 'forecast rejected (method): ensemble % has a member (%) the route''s plan did not make available', r.forecast_id, array_to_string(v_members, ', ') USING ERRCODE = '23514';   -- 0109
    END IF;   -- 0109
  ELSIF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.plan -> 'methods') x WHERE x ->> 'method_ref' = f.method_ref AND (x ->> 'available')::boolean) THEN   -- 0109: ELSIF (the single-method rule, unchanged)
    RAISE EXCEPTION 'forecast rejected (method): forecast % names %, which the route''s plan did not make available', r.forecast_id, coalesce(f.method_ref, '<no method_ref>') USING ERRCODE = '23514';
  END IF;
  UPDATE prediction.forecast_routes SET outcome = 'issued', method_ref = f.method_ref, issued_at = clock_timestamp() WHERE route_id = r.route_id RETURNING * INTO r;
  PERFORM prediction.pmr_event(p_tenant, p_domain, 'route', r.route_id, coalesce(r.target_key, r.series_key) || ' ' || r.horizon_code, 'route.issued', p_actor,
    jsonb_build_object('forecast_id', r.forecast_id, 'method_ref', f.method_ref) || CASE WHEN v_members IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('ensemble_members', to_jsonb(v_members)) END, p_correlation);   -- 0109: + the members
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.forecast_id, 'forecast.routed', p_actor,
    jsonb_build_object('route_id', r.route_id, 'method_ref', f.method_ref, 'forecast_kind', f.forecast_kind, 'validation_state', f.validation_state, 'confidence_language', r.plan ->> 'confidence_language',
                       'policy', (r.plan -> 'policy') - 'rule' - 'kind_rule',
                       'planned', (SELECT jsonb_agg(jsonb_build_object('method_ref', x ->> 'method_ref', 'family', x ->> 'family', 'available', x -> 'available', 'reason', x -> 'unavailable_reason')) FROM jsonb_array_elements(r.plan -> 'methods') x))
      || CASE WHEN v_members IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('ensemble_members', to_jsonb(v_members)) END,   -- 0109: + the members
    p_correlation);
  RETURN to_jsonb(r) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.bind_forecast_route(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.bind_forecast_route(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION prediction.pen_record_attempts_and_exclusions(p_run prediction.ensemble_runs, p_attempts jsonb, p_excluded jsonb, p_on_forecast boolean, p_actor uuid, p_correlation uuid)
RETURNS jsonb SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE x jsonb; m prediction.ensemble_members%ROWTYPE; v_out jsonb := '[]'::jsonb; v_cls text; v_n int; p_run_failing boolean := NOT p_on_forecast;
BEGIN
  IF jsonb_typeof(coalesce(p_attempts, '[]'::jsonb)) <> 'array' OR jsonb_typeof(coalesce(p_excluded, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'ensemble rejected (outcome): attempts and excluded are lists' USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_attempts, '[]'::jsonb)) LOOP
    SELECT * INTO m FROM prediction.ensemble_members WHERE run_id = p_run.run_id AND ordinal = (x ->> 'ordinal')::int;
    IF NOT FOUND THEN RAISE EXCEPTION 'ensemble rejected (outcome): attempt names member % — not a member of run %', x ->> 'ordinal', p_run.run_id USING ERRCODE = '22023'; END IF;
    IF (x ->> 'attempt')::int > (p_run.budget ->> 'attempts')::int THEN
      RAISE EXCEPTION 'ensemble rejected (budget): member % was attempted % time(s); the run''s budget allows %', m.ordinal, x ->> 'attempt', p_run.budget ->> 'attempts' USING ERRCODE = '22023';
    END IF;
    INSERT INTO prediction.ensemble_attempts (attempt_id, scope, tenant_id, domain_id, run_id, ordinal, method_ref, attempt, outcome, error, duration_ms, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_run.tenant_id, p_run.domain_id, p_run.run_id, m.ordinal, m.method_ref, (x ->> 'attempt')::int, x ->> 'outcome',
            CASE WHEN x ->> 'outcome' = 'failed' THEN left(coalesce(x ->> 'error', 'failed'), 1000) END, greatest(0, coalesce((x ->> 'duration_ms')::int, 0)), p_correlation);
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_excluded, '[]'::jsonb)) LOOP
    SELECT * INTO m FROM prediction.ensemble_members WHERE run_id = p_run.run_id AND ordinal = (x ->> 'ordinal')::int FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ensemble rejected (outcome): exclusion names member % — not a member of run %', x ->> 'ordinal', p_run.run_id USING ERRCODE = '22023'; END IF;
    IF m.state <> 'planned' THEN RAISE EXCEPTION 'ensemble rejected (outcome): member % of run % is %, not excludable', m.ordinal, p_run.run_id, m.state USING ERRCODE = '22023'; END IF;
    v_cls := x ->> 'class';
    IF v_cls IS NULL OR v_cls NOT IN ('unavailable', 'unimplemented', 'kind', 'failed', 'budget', 'not_combined', 'not_run', 'incompatible') OR coalesce(length(btrim(x ->> 'reason')), 0) < 8 THEN   -- 0109: + incompatible
      RAISE EXCEPTION 'ensemble rejected (outcome): an exclusion names its class (unavailable | unimplemented | kind | failed | budget | not_combined | not_run | incompatible) and its reason' USING ERRCODE = '22023';   -- 0109
    END IF;
    IF v_cls = 'unavailable' AND m.available THEN RAISE EXCEPTION 'ensemble rejected (outcome): member % was planned available; it is not excluded as unavailable', m.ordinal USING ERRCODE = '22023'; END IF;
    IF NOT m.available AND v_cls <> 'unavailable' THEN RAISE EXCEPTION 'ensemble rejected (outcome): member % was planned unavailable (%); it is excluded as unavailable', m.ordinal, m.unavailable_reason USING ERRCODE = '22023'; END IF;
    SELECT count(*) INTO v_n FROM prediction.ensemble_attempts a WHERE a.run_id = p_run.run_id AND a.ordinal = m.ordinal;
    IF v_cls IN ('not_combined', 'not_run') AND NOT p_run_failing THEN
      RAISE EXCEPTION 'ensemble rejected (outcome): member % — not_combined and not_run are a FAILED run''s classes', m.ordinal USING ERRCODE = '22023';
    END IF;
    IF v_cls = 'not_combined' AND NOT EXISTS (SELECT 1 FROM prediction.ensemble_attempts a WHERE a.run_id = p_run.run_id AND a.ordinal = m.ordinal AND a.outcome = 'succeeded') THEN
      RAISE EXCEPTION 'ensemble rejected (outcome): member % is excluded as computed-but-not-combined with no succeeded attempt recorded', m.ordinal USING ERRCODE = '22023';
    END IF;
    IF v_cls = 'not_run' AND v_n > 0 THEN
      RAISE EXCEPTION 'ensemble rejected (outcome): member % was attempted; it is not excluded as not run', m.ordinal USING ERRCODE = '22023';
    END IF;
    IF v_cls = 'incompatible' AND NOT EXISTS (SELECT 1 FROM prediction.ensemble_attempts a WHERE a.run_id = p_run.run_id AND a.ordinal = m.ordinal AND a.outcome = 'succeeded') THEN   -- 0109
      RAISE EXCEPTION 'ensemble rejected (outcome): member % is excluded as incompatible with no succeeded attempt recorded — its output''s semantics are read from what it computed', m.ordinal USING ERRCODE = '22023';   -- 0109
    END IF;   -- 0109
    IF v_cls = 'failed' AND NOT EXISTS (SELECT 1 FROM prediction.ensemble_attempts a WHERE a.run_id = p_run.run_id AND a.ordinal = m.ordinal AND a.outcome = 'failed') THEN
      RAISE EXCEPTION 'ensemble rejected (outcome): member % is excluded as failed with no failed attempt recorded', m.ordinal USING ERRCODE = '22023';
    END IF;
    UPDATE prediction.ensemble_members SET state = 'excluded', exclusion_class = v_cls, exclusion_reason = x ->> 'reason', attempts = v_n
     WHERE run_id = p_run.run_id AND ordinal = m.ordinal;
    INSERT INTO prediction.ensemble_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_run.tenant_id, p_run.domain_id, p_run.run_id, 'ensemble.member_excluded', p_actor,
            jsonb_build_object('ordinal', m.ordinal, 'method_ref', m.method_ref, 'class', v_cls, 'reason', x ->> 'reason', 'attempts', v_n), p_correlation);
    IF p_on_forecast THEN
      INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_run.tenant_id, p_run.domain_id, p_run.ensemble_forecast_id, 'forecast.member_excluded', p_actor,
              jsonb_build_object('run_id', p_run.run_id, 'ordinal', m.ordinal, 'method_ref', m.method_ref, 'class', v_cls, 'reason', x ->> 'reason', 'attempts', v_n), p_correlation);
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('ordinal', m.ordinal, 'method_ref', m.method_ref, 'class', v_cls, 'reason', x ->> 'reason', 'attempts', v_n));
  END LOOP;
  -- the issued members' attempt counts
  UPDATE prediction.ensemble_members mm SET attempts = (SELECT count(*) FROM prediction.ensemble_attempts a WHERE a.run_id = mm.run_id AND a.ordinal = mm.ordinal)
   WHERE mm.run_id = p_run.run_id AND mm.state = 'issued';
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pen_record_attempts_and_exclusions(prediction.ensemble_runs, jsonb, jsonb, boolean, uuid, uuid) FROM PUBLIC;
