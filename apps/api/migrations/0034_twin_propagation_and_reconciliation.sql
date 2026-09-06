-- ============================================================
-- 0034 — PHASE 5 · stage P5-M5: corrections reach twins and runs through the
-- OPERATOR-INITIATED walk; reconciliation of simulated/predicted state against
-- later observation.
--
-- Nothing here is automatic. The CorrectionApplied consumer stays deferred: a
-- correction case becomes `awaiting` (Phase 1), an authorised operator runs the
-- dependency walk (Phase 3's graph.impact.propagate), and the impact record marks
-- the twin versions that cite the changed object UNVERIFIED by event and names
-- the runs built on them. Until the walk runs, a twin reports the awaiting case as
-- `propagation pending`.
-- ============================================================

ALTER TABLE graph.invalidations_current
  ADD COLUMN affected_twins jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN affected_simulations jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN graph.invalidations_current.affected_twins IS
  'twin versions the walk reached — marked unverified by event, never re-grounded by the walk';
COMMENT ON COLUMN graph.invalidations_current.affected_simulations IS
  'simulation runs the walk reached — immutable; surfaced with an event so a reader sees they rest on changed state';

DROP FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_forecasts jsonb, p_twins jsonb, p_simulations jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, prediction, twin, simulation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; cov record; f jsonb; t jsonb; r jsonb; v_versions int[]; v_version int; v_marked jsonb := '[]'::jsonb;
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

  /*
   * A REACHED TWIN: every admitted, still-verified version that CITES the object the walk
   * came through is marked unverified — by event, through the twin port, which is the only
   * way a version's verification state changes. The walk never re-grounds anything.
   */
  FOR t IN SELECT * FROM jsonb_array_elements(coalesce(p_twins, '[]'::jsonb)) LOOP
    SELECT coalesce(array_agg(DISTINCT v.version ORDER BY v.version), ARRAY[]::int[]) INTO v_versions
      FROM twin.twin_versions v
      JOIN twin.state_elements e ON e.twin_id = v.twin_id AND e.version = v.version
     WHERE v.twin_id = (t ->> 'twin_id')::uuid AND v.tenant_id = p_tenant AND v.domain_id = p_domain
       AND v.state = 'admitted' AND v.verification_state = 'verified'
       AND (t ->> 'via_id') IS NOT NULL
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c WHERE (c ->> 'id') = (t ->> 'via_id'));
    FOREACH v_version IN ARRAY v_versions LOOP
      PERFORM twin.mark_unverified((t ->> 'twin_id')::uuid, p_tenant, p_domain, v_version,
        format('invalidation %s: %s', p_invalidation_id, t ->> 'reached_via'), p_invalidation_id, p_actor, gen_random_uuid(), p_correlation);
      v_marked := v_marked || jsonb_build_object('twin_id', t ->> 'twin_id', 'version', v_version);
    END LOOP;
  END LOOP;

  /* A REACHED RUN is immutable: it is surfaced with an event, never altered. */
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
REVOKE ALL ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- Reconciliation: a simulated or predicted element against a later observation.
-- The difference is RECORDED; neither element changes.
-- ============================================================
CREATE TABLE twin.reconciliations (
  reconciliation_id   uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  twin_id             uuid NOT NULL,
  key                 text NOT NULL,
  /* the simulated / predicted element */
  from_version        int  NOT NULL,
  from_kind           text NOT NULL CHECK (from_kind IN ('simulated', 'predicted')),
  from_value          jsonb NOT NULL,
  from_citations      jsonb NOT NULL,
  /* the observed element it is reconciled against */
  against_version     int  NOT NULL,
  against_value       jsonb NOT NULL,
  against_citations   jsonb NOT NULL,
  difference          jsonb NOT NULL,
  note                text NOT NULL CHECK (length(btrim(note)) >= 4),
  recorded_by         uuid NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT trc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  FOREIGN KEY (twin_id, from_version) REFERENCES twin.twin_versions(twin_id, version),
  FOREIGN KEY (twin_id, against_version) REFERENCES twin.twin_versions(twin_id, version)
);
CREATE INDEX trc_twin ON twin.reconciliations (twin_id, key, recorded_at);
CREATE TRIGGER trc_append_only BEFORE UPDATE OR DELETE ON twin.reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE twin.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE twin.reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY twin_isolation ON twin.reconciliations USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON twin.reconciliations TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION twin.record_reconciliation(
  p_reconciliation_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_key text, p_from_version int, p_against_version int, p_note text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a twin.state_elements%ROWTYPE; b twin.state_elements%ROWTYPE; v_diff jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.ground']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM twin.state_elements WHERE twin_id = p_twin_id AND version = p_from_version AND key = p_key AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation rejected: no element % in version %', p_key, p_from_version USING ERRCODE = '23503'; END IF;
  IF a.kind NOT IN ('simulated', 'predicted') THEN
    RAISE EXCEPTION 'reconciliation rejected: % in version % is %, not simulated or predicted', p_key, p_from_version, a.kind USING ERRCODE = '22023';
  END IF;
  SELECT * INTO b FROM twin.state_elements WHERE twin_id = p_twin_id AND version = p_against_version AND key = p_key AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation rejected: no element % in version %', p_key, p_against_version USING ERRCODE = '23503'; END IF;
  IF b.kind <> 'observed' OR b.health <> 'complete' THEN
    RAISE EXCEPTION 'reconciliation rejected: % in version % is not a complete OBSERVED element', p_key, p_against_version USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_against_version AND v.state = 'admitted') THEN
    RAISE EXCEPTION 'reconciliation rejected: version % is not admitted', p_against_version USING ERRCODE = '22023';
  END IF;
  v_diff := CASE
    WHEN jsonb_typeof(a.value) = 'number' AND jsonb_typeof(b.value) = 'number'
      THEN jsonb_build_object('numeric', (b.value::text)::numeric - (a.value::text)::numeric,
                              'relative', CASE WHEN (a.value::text)::numeric = 0 THEN NULL ELSE ((b.value::text)::numeric - (a.value::text)::numeric) / (a.value::text)::numeric END)
    ELSE jsonb_build_object('equal', a.value = b.value) END;
  INSERT INTO twin.reconciliations (reconciliation_id, scope, tenant_id, domain_id, twin_id, key, from_version, from_kind, from_value, from_citations,
                                    against_version, against_value, against_citations, difference, note, recorded_by, correlation_id)
  VALUES (p_reconciliation_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_key, p_from_version, a.kind, a.value, a.citations,
          p_against_version, b.value, b.citations, v_diff, p_note, p_actor, p_correlation);
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'element.grounded', p_actor,
          jsonb_build_object('reconciliation', p_reconciliation_id, 'key', p_key, 'from_version', p_from_version, 'against_version', p_against_version, 'difference', v_diff), p_correlation);
  RETURN v_diff;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.record_reconciliation(uuid,uuid,uuid,uuid,text,int,int,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.record_reconciliation(uuid,uuid,uuid,uuid,text,int,int,text,uuid,uuid,uuid) TO eye_commit;
