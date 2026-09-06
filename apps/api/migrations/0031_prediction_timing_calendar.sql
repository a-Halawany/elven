-- 0031 — Phase 4, second bounded correction pass (Codex review of aec404c1).
--
-- FORWARD ONLY. Adds: a warning's RESPONSE timeliness separately from its issuance
-- timeliness, with the replay clock honoured on expiry and acknowledgement and the
-- audit clock kept beside it; a missed decision recorded truthfully with a valid
-- window; and the publication calendar a series declares, without which no outcome
-- is ever scored from a stand-in observation.

-- ── warnings: response timeliness, the replay clock, the missed decision ─────
ALTER TABLE prediction.warnings_current
  ADD COLUMN acknowledged_as_of timestamptz,
  ADD COLUMN response_timely    boolean,
  ADD COLUMN expired_as_of      timestamptz,
  ADD COLUMN decision_missed    boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN prediction.warnings_current.acknowledged_as_of IS
  'The instant the response is AS OF: the audit clock for a live warning, the replay instant the responder states for a replayed one. acknowledged_at stays the audit clock.';
COMMENT ON COLUMN prediction.warnings_current.response_timely IS
  'Whether the response (acknowledgement) came before the window closed, judged on the same clock the window is on. Distinct from timely, which is about issuance against the decision deadline.';
COMMENT ON COLUMN prediction.warnings_current.expired_as_of IS
  'The instant on the warning''s own clock at which the window was found closed without an answer.';
COMMENT ON COLUMN prediction.warnings_current.decision_missed IS
  'True when the warning was raised at or after the decision deadline: the decision it served could no longer be taken. The window still opens (a report must still be answered) and is valid.';

-- ── series: the publication calendar ──────────────────────────────────────────
ALTER TABLE prediction.series_registry ADD COLUMN publication_calendar jsonb;
COMMENT ON COLUMN prediction.series_registry.publication_calendar IS
  'The publisher''s calendar as the registrar attests it: {"rule":"daily"|"business-days","closures":[dates],"authority":text}. NULL means no calendar is attested and an outcome is scored only from the target day''s own observation.';
ALTER TABLE prediction.series_registry ADD CONSTRAINT ser_calendar_shape CHECK (
  publication_calendar IS NULL OR (
    jsonb_typeof(publication_calendar) = 'object'
    AND (publication_calendar ->> 'rule') IN ('daily', 'business-days')
    AND jsonb_typeof(coalesce(publication_calendar -> 'closures', '[]'::jsonb)) = 'array'
    AND length(btrim(coalesce(publication_calendar ->> 'authority', ''))) >= 8));

DROP FUNCTION prediction.register_series(uuid,uuid,text,text,text,text,text,text,int,uuid,text,text,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.register_series(
  p_tenant uuid, p_domain uuid, p_series_key text, p_source_key text, p_parser_ref text,
  p_value_field text, p_selector text, p_unit text, p_seasonality int, p_subject uuid,
  p_attribution text, p_description text, p_calendar jsonb, p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.series.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO prediction.series_registry (
    series_key, scope, tenant_id, domain_id, source_key, parser_ref, value_field, selector, unit,
    seasonality_days, subject_entity_id, attribution, description, publication_calendar, registered_by, correlation_id
  ) VALUES (
    p_series_key, 'DOMAIN', p_tenant, p_domain, p_source_key, p_parser_ref, p_value_field, p_selector,
    p_unit, coalesce(p_seasonality, 1), p_subject, p_attribution, p_description, p_calendar, p_actor, p_correlation)
  ON CONFLICT (tenant_id, domain_id, series_key) DO NOTHING;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.register_series(uuid,uuid,text,text,text,text,text,text,int,uuid,text,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.register_series(uuid,uuid,text,text,text,text,text,text,int,uuid,text,text,jsonb,uuid,uuid) TO eye_commit;

-- ── raise_warning: the missed decision is a fact on the record ───────────────
DROP FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,timestamptz,text,timestamptz,boolean,jsonb,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.raise_warning(
  p_warning_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_indicator_id uuid, p_forecast_id uuid,
  p_title text, p_evidence jsonb, p_consequence text, p_confidence numeric,
  p_opens_at timestamptz, p_closes_at timestamptz, p_routed_to uuid,
  p_flip_event_id uuid, p_raised_as_of timestamptz, p_timing_mode text, p_decision_deadline timestamptz,
  p_timely boolean, p_decision_missed boolean, p_controls jsonb,
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
  -- The deadline and the timeliness must agree: raised at or after the deadline is a missed decision, never timely.
  IF p_decision_deadline IS NOT NULL AND p_raised_as_of >= p_decision_deadline AND (p_timely IS DISTINCT FROM false OR p_decision_missed IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'warning rejected: raised at or after its decision deadline but not recorded as a missed decision' USING ERRCODE = '22023';
  END IF;
  IF p_decision_deadline IS NOT NULL AND p_raised_as_of < p_decision_deadline AND p_timely IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'warning rejected: raised before its decision deadline but not recorded as timely' USING ERRCODE = '22023';
  END IF;
  -- ONE WARNING PER FLIP. A second raise for the same flip is refused by the unique index.
  INSERT INTO prediction.warnings_current (
    warning_id, scope, tenant_id, domain_id, branch_id, indicator_id, forecast_id, title, evidence,
    consequence, confidence, response_window_opens_at, response_window_closes_at, routed_to,
    raised_by, state, correlation_id, flip_event_id, raised_as_of, timing_mode, decision_deadline, timely,
    decision_missed, controls
  ) VALUES (
    p_warning_id, 'DOMAIN', p_tenant, p_domain, p_branch_id, p_indicator_id, p_forecast_id, p_title,
    p_evidence, p_consequence, p_confidence, p_opens_at, p_closes_at, p_routed_to, p_actor, 'raised',
    p_correlation, p_flip_event_id, coalesce(p_raised_as_of, clock_timestamp()), coalesce(p_timing_mode, 'live'),
    p_decision_deadline, p_timely, coalesce(p_decision_missed, false), coalesce(p_controls, '{}'::jsonb));
  INSERT INTO prediction.warning_events (
    event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_warning_id, 'warning.raised', p_actor,
    jsonb_build_object('routed_to', p_routed_to, 'closes_at', p_closes_at, 'branch_id', p_branch_id,
                       'confidence', p_confidence, 'title', p_title, 'flip_event_id', p_flip_event_id,
                       'raised_as_of', p_raised_as_of, 'timing_mode', p_timing_mode,
                       'decision_deadline', p_decision_deadline, 'timely', p_timely,
                       'decision_missed', coalesce(p_decision_missed, false)),
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
REVOKE ALL ON FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,timestamptz,text,timestamptz,boolean,boolean,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,timestamptz,text,timestamptz,boolean,boolean,jsonb,uuid,uuid,uuid) TO eye_commit;

-- ── acknowledge: the response is AS OF an instant on the warning's own clock ───
DROP FUNCTION prediction.acknowledge_warning(uuid,uuid,uuid,text,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.acknowledge_warning(
  p_warning_id uuid, p_tenant uuid, p_domain uuid, p_note text, p_as_of timestamptz, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS text
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w prediction.warnings_current%ROWTYPE; v_as_of timestamptz; v_late boolean;
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
  -- A live warning is answered on the audit clock; a replayed one on the replay instant the responder states.
  IF w.timing_mode = 'replay' THEN
    IF p_as_of IS NULL THEN
      RAISE EXCEPTION 'acknowledgement rejected: a replayed warning must be answered AS OF a replay instant' USING ERRCODE = '22023';
    END IF;
    IF p_as_of < w.raised_as_of THEN
      RAISE EXCEPTION 'acknowledgement rejected: the response instant precedes the warning (raised as of %)', w.raised_as_of USING ERRCODE = '22023';
    END IF;
    v_as_of := p_as_of;
  ELSE
    v_as_of := clock_timestamp();
  END IF;
  -- Answering after the window closed is recorded AS late, never quietly.
  v_late := v_as_of > w.response_window_closes_at;
  UPDATE prediction.warnings_current
     SET state = 'acknowledged', acknowledged_at = clock_timestamp(), acknowledged_by = p_actor,
         acknowledgement = p_note, acknowledged_as_of = v_as_of, response_timely = NOT v_late
   WHERE warning_id = p_warning_id;
  INSERT INTO prediction.warning_events (
    event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_warning_id, 'warning.acknowledged', p_actor,
    jsonb_build_object('note', p_note, 'late', v_late, 'closes_at', w.response_window_closes_at,
                       'acknowledged_as_of', v_as_of, 'timing_mode', w.timing_mode),
    p_correlation);
  RETURN CASE WHEN v_late THEN 'acknowledged_late' ELSE 'acknowledged' END;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.acknowledge_warning(uuid,uuid,uuid,text,timestamptz,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.acknowledge_warning(uuid,uuid,uuid,text,timestamptz,uuid,uuid,uuid) TO eye_commit;

-- ── expire: each warning on its own clock ─────────────────────────────────────
DROP FUNCTION prediction.expire_warnings(uuid,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.expire_warnings(p_tenant uuid, p_domain uuid, p_replay_as_of timestamptz, p_actor uuid, p_correlation uuid)
RETURNS int
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; n int := 0; v_as_of timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.raise', 'prediction.indicator.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  -- Live warnings expire on the audit clock. Replayed warnings expire only when a REPLAY clock is
  -- supplied and has passed their window; a live sweep says nothing about a replayed window.
  FOR r IN SELECT warning_id, response_window_closes_at, timing_mode FROM prediction.warnings_current
            WHERE tenant_id = p_tenant AND domain_id = p_domain AND state = 'raised'
              AND ((timing_mode = 'live' AND response_window_closes_at < clock_timestamp())
                OR (timing_mode = 'replay' AND p_replay_as_of IS NOT NULL AND response_window_closes_at < p_replay_as_of))
            FOR UPDATE
  LOOP
    v_as_of := CASE WHEN r.timing_mode = 'replay' THEN p_replay_as_of ELSE clock_timestamp() END;
    UPDATE prediction.warnings_current SET state = 'expired', expired_as_of = v_as_of, response_timely = false
     WHERE warning_id = r.warning_id;
    INSERT INTO prediction.warning_events (
      event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.warning_id, 'warning.expired', p_actor,
      jsonb_build_object('closed_at', r.response_window_closes_at, 'expired_as_of', v_as_of, 'timing_mode', r.timing_mode,
                         'reason', 'the response window closed without an acknowledgement'), p_correlation);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.expire_warnings(uuid,uuid,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.expire_warnings(uuid,uuid,timestamptz,uuid,uuid) TO eye_commit;
