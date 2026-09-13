-- 0045 · Phase 6, P6-M5 — monitoring conditions bound to what exists, breaches routed
-- to their owner, outcomes reconciled against the approved choice, closure
-- (PHASE6_BUILD_PLAN.md §3 monitoring row; F6; §6a rule 10).
--
-- After commitment a package is watched: its conditions name existing indicators,
-- scenario branches and a review cadence. A warning raised on one of them after the
-- decision is a BREACH — recorded once, routed to the condition's owner with the
-- warning's response window, surfaced on the room and in the next briefing. A review
-- falling due without a review event is "review overdue", recorded once per due date.
-- An outcome is recorded by a human as an OUT strategy object — the second and last
-- bounded write Phase 6 makes into the strategy graph — for one of the approved
-- choice's outcome criteria, citing an admitted OBSERVED twin element of the same
-- unit; where the criterion was simulated, Phase 5's reconciliation of the chosen
-- run's simulated element against that observed element is required and cited, the
-- difference recorded, nothing overwritten. Closing records the lessons as text.
--
--   §1  condition breaches, outcomes
--   §2  ports: evaluate_conditions, record_outcome, close_package
--   §3  decision.outcome → ['OUT']; RLS
-- ============================================================
CREATE TABLE decision.condition_breaches (
  breach_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_id         uuid NOT NULL,
  version            int  NOT NULL,
  condition_index    int  NOT NULL CHECK (condition_index >= 0),
  condition          jsonb NOT NULL,
  warning_id         uuid NOT NULL,
  routed_to          uuid NOT NULL,
  response_window_closes_at timestamptz,
  detected_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dcb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dcb_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions(package_id, version),
  CONSTRAINT dcb_once UNIQUE (package_id, version, condition_index, warning_id)
);
CREATE TRIGGER dcb_append_only BEFORE UPDATE OR DELETE ON decision.condition_breaches
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE decision.outcomes (
  outcome_id         uuid PRIMARY KEY,                       -- = the OUT strategy object id
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_id         uuid NOT NULL,
  version            int  NOT NULL,
  criterion_key      text NOT NULL,
  criterion          jsonb NOT NULL,
  observed_value     jsonb NOT NULL,
  unit               text,
  target             numeric NOT NULL,
  comparator         text NOT NULL CHECK (comparator IN ('<=', '>=', '=', '<', '>')),
  met                boolean NOT NULL,
  observed_on        jsonb NOT NULL,                         -- { twin_id, version, key, element_id, citations }
  simulated          jsonb,                                  -- { twin_id, version, key, value, run_id } when the criterion was simulated
  reconciliation_id  uuid,
  header_digest      text NOT NULL CHECK (header_digest ~ '^[0-9a-f]{64}$'),
  recorded_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dout_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dout_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions(package_id, version),
  CONSTRAINT dout_once UNIQUE (package_id, version, criterion_key)
);
CREATE TRIGGER dout_append_only BEFORE UPDATE OR DELETE ON decision.outcomes
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 2. Ports.
-- ============================================================
/* Evaluate the committed version's conditions against what was recorded after the decision. Idempotent: a breach is recorded once. */
CREATE OR REPLACE FUNCTION decision.evaluate_conditions(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; r record; cond record; w record; v_new int := 0; v_overdue boolean := false; v_room_overdue boolean := false; v_breaches jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.monitor']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'monitoring rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.committed_version IS NULL THEN RAISE EXCEPTION 'monitoring rejected: package is %; conditions are watched after commitment', p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  SELECT * INTO r FROM executive.rooms_current x WHERE x.package_id = p_package_id;
  FOR cond IN SELECT value AS c, (ordinality - 1)::int AS idx FROM jsonb_array_elements(v.monitoring_conditions) WITH ORDINALITY LOOP
    IF (cond.c ->> 'kind') IN ('indicator', 'warning') THEN
      FOR w IN SELECT * FROM prediction.warnings_current x
                WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.raised_at > p.decided_at
                  AND ((cond.c ->> 'kind') = 'indicator' AND x.indicator_id = (cond.c ->> 'indicator_id')::uuid
                    OR (cond.c ->> 'kind') = 'warning' AND x.branch_id = (cond.c ->> 'branch_id')::uuid)
                ORDER BY x.raised_at LOOP
        IF NOT EXISTS (SELECT 1 FROM decision.condition_breaches b WHERE b.package_id = p_package_id AND b.version = v.version AND b.condition_index = cond.idx AND b.warning_id = w.warning_id) THEN
          INSERT INTO decision.condition_breaches (breach_id, scope, tenant_id, domain_id, package_id, version, condition_index, condition, warning_id, routed_to, response_window_closes_at, correlation_id)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, v.version, cond.idx, cond.c, w.warning_id, (cond.c ->> 'owner')::uuid, w.response_window_closes_at, p_correlation);
          INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'condition.breached', p_actor,
                  jsonb_build_object('version', v.version, 'condition_index', cond.idx, 'kind', cond.c ->> 'kind', 'warning_id', w.warning_id, 'warning_title', w.title, 'routed_to', cond.c ->> 'owner',
                                     'response_window_closes_at', w.response_window_closes_at, 'warning_routed_to', w.routed_to), p_correlation);
          IF r.room_id IS NOT NULL THEN
            INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
            VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.room_id, 'condition.breached', p_actor,
                    jsonb_build_object('package_id', p_package_id, 'condition_index', cond.idx, 'warning_id', w.warning_id, 'warning_title', w.title, 'routed_to', cond.c ->> 'owner', 'response_window_closes_at', w.response_window_closes_at), p_correlation);
          END IF;
          v_new := v_new + 1;
        END IF;
      END LOOP;
    ELSIF (cond.c ->> 'kind') = 'review' AND r.room_id IS NOT NULL THEN
      IF r.next_review_at < clock_timestamp() THEN
        v_overdue := true;
        IF NOT EXISTS (SELECT 1 FROM decision.package_events e WHERE e.package_id = p_package_id AND e.event = 'review.overdue' AND (e.details ->> 'next_review_at')::timestamptz = r.next_review_at) THEN
          INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'review.overdue', p_actor,
                  jsonb_build_object('version', v.version, 'condition_index', cond.idx, 'room_id', r.room_id, 'next_review_at', r.next_review_at, 'routed_to', cond.c ->> 'owner'), p_correlation);
          INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.room_id, 'review.overdue', p_actor, jsonb_build_object('package_id', p_package_id, 'next_review_at', r.next_review_at, 'routed_to', cond.c ->> 'owner'), p_correlation);
          v_room_overdue := true;
        END IF;
      END IF;
    END IF;
  END LOOP;
  IF p.state = 'committed' AND v_new > 0 THEN UPDATE decision.packages_current SET state = 'monitoring' WHERE package_id = p_package_id; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('breach_id', b.breach_id, 'condition_index', b.condition_index, 'kind', b.condition ->> 'kind', 'warning_id', b.warning_id, 'routed_to', b.routed_to,
                                               'response_window_closes_at', b.response_window_closes_at, 'detected_at', b.detected_at) ORDER BY b.detected_at, b.condition_index), '[]'::jsonb)
    INTO v_breaches FROM decision.condition_breaches b WHERE b.package_id = p_package_id AND b.version = v.version;
  RETURN jsonb_build_object('package_id', p_package_id, 'version', v.version, 'state', (SELECT state FROM decision.packages_current WHERE package_id = p_package_id),
                            'new_breaches', v_new, 'breaches', v_breaches, 'review_overdue', v_overdue, 'review_overdue_recorded_now', v_room_overdue,
                            'next_review_at', r.next_review_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.evaluate_conditions(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.evaluate_conditions(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/*
 * OUTCOME: the second bounded write into the strategy graph, under decision.outcome,
 * writing one OUT and nothing else. It cites an admitted OBSERVED twin element of the
 * criterion's unit; where the chosen option was simulated, the reconciliation of the
 * chosen run's simulated element against that observed element is required.
 */
CREATE OR REPLACE FUNCTION decision.record_outcome(
  p_outcome_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_criterion_key text, p_twin_id uuid, p_twin_version int, p_element_key text, p_reconciliation_id uuid,
  p_title text, p_statement text, p_header_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, twin, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; crit jsonb; e twin.state_elements%ROWTYPE; rc record; v_runs uuid[]; v_simulated boolean; v_value numeric; v_target numeric; v_met boolean; v_sim jsonb; v_cmt uuid;
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
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions tv WHERE tv.twin_id = p_twin_id AND tv.version = p_twin_version AND tv.state = 'admitted') THEN
    RAISE EXCEPTION 'outcome rejected: twin version % is not admitted', p_twin_version USING ERRCODE = '22023';
  END IF;
  IF e.unit IS DISTINCT FROM (crit ->> 'unit') THEN RAISE EXCEPTION 'outcome rejected: the observed element is in %, the criterion in %; same quantity, same unit', coalesce(e.unit, 'no unit'), crit ->> 'unit' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(e.value) <> 'number' THEN RAISE EXCEPTION 'outcome rejected: the observed value is not a number' USING ERRCODE = '22023'; END IF;
  v_value := (e.value #>> '{}')::numeric; v_target := (crit ->> 'target')::numeric;
  v_met := CASE crit ->> 'comparator' WHEN '<=' THEN v_value <= v_target WHEN '>=' THEN v_value >= v_target WHEN '=' THEN v_value = v_target WHEN '<' THEN v_value < v_target WHEN '>' THEN v_value > v_target END;
  -- was the chosen option simulated? then the reconciliation of the chosen run's simulated element against THIS observed element is required
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
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(rc.from_citations) fc WHERE (fc ->> 'kind') = 'run' AND (fc ->> 'id')::uuid = ANY (v_runs)) THEN
      RAISE EXCEPTION 'outcome rejected: the reconciled simulated element does not cite a run of the chosen option %', v.choice ->> 'option_key' USING ERRCODE = '22023';
    END IF;
    v_sim := jsonb_build_object('twin_id', rc.twin_id, 'version', rc.from_version, 'key', rc.key, 'value', rc.from_value, 'citations', rc.from_citations, 'difference', rc.difference);
  ELSIF p_reconciliation_id IS NOT NULL THEN
    RAISE EXCEPTION 'outcome rejected: the chosen option was not simulated; no reconciliation applies' USING ERRCODE = '22023';
  END IF;
  -- the bounded OUT, into Phase 3's own tables
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
          jsonb_build_object('twin_id', p_twin_id, 'version', p_twin_version, 'key', p_element_key, 'element_id', e.element_id, 'citations', e.citations), v_sim, p_reconciliation_id, p_header_digest, p_actor, p_correlation);
  UPDATE decision.packages_current SET state = 'monitoring' WHERE package_id = p_package_id AND state = 'committed';
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'outcome.recorded', p_actor,
          jsonb_build_object('version', v.version, 'outcome_id', p_outcome_id, 'criterion_key', p_criterion_key, 'observed_value', e.value, 'target', v_target, 'comparator', crit ->> 'comparator', 'met', v_met, 'reconciliation_id', p_reconciliation_id), p_correlation);
  RETURN jsonb_build_object('outcome_id', p_outcome_id, 'met', v_met, 'observed_value', e.value, 'target', v_target, 'comparator', crit ->> 'comparator', 'simulated', v_sim, 'reconciliation_id', p_reconciliation_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_outcome(uuid,uuid,uuid,uuid,text,uuid,int,text,uuid,text,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_outcome(uuid,uuid,uuid,uuid,text,uuid,int,text,uuid,text,text,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION decision.close_package(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_lessons text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v_outcomes int; v_criteria int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'closure rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'closure rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'closure rejected: the package owner closes it' USING ERRCODE = '42501'; END IF;
  IF p.state NOT IN ('committed', 'monitoring') THEN RAISE EXCEPTION 'closure rejected: package is %; a committed decision is closed with its outcomes', p.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_lessons, ''))) < 8 THEN RAISE EXCEPTION 'closure rejected: the lessons are recorded as text, at least eight characters' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_outcomes FROM decision.outcomes o WHERE o.package_id = p_package_id AND o.version = p.committed_version;
  SELECT jsonb_array_length(v.choice -> 'outcome_criteria') INTO v_criteria FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p.committed_version;
  IF v_outcomes = 0 THEN RAISE EXCEPTION 'closure rejected: no outcome is recorded; a decision closes on what was observed, not on what was intended' USING ERRCODE = '22023'; END IF;
  UPDATE decision.packages_current SET state = 'closed' WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.closed', p_actor,
          jsonb_build_object('version', p.committed_version, 'lessons', p_lessons, 'outcomes_recorded', v_outcomes, 'criteria', v_criteria,
                             'outcomes', (SELECT coalesce(jsonb_agg(jsonb_build_object('outcome_id', o.outcome_id, 'criterion_key', o.criterion_key, 'met', o.met) ORDER BY o.criterion_key), '[]'::jsonb) FROM decision.outcomes o WHERE o.package_id = p_package_id AND o.version = p.committed_version)), p_correlation);
  RETURN jsonb_build_object('state', 'closed', 'outcomes_recorded', v_outcomes, 'criteria', v_criteria);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.close_package(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.close_package(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 3. Write action, RLS.
-- ============================================================
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('decision.outcome', ARRAY['OUT'], 'Recording an outcome admits the bounded OUT and nothing else')
ON CONFLICT (action) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['condition_breaches', 'outcomes'] LOOP
    EXECUTE format('ALTER TABLE decision.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE decision.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY decision_isolation ON decision.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON decision.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
