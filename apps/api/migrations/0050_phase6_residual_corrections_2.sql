-- 0050 · Phase 6 — the residual paths of the independent review at 07edd9dc (PHASE6_REPORT.md §13).
-- Forward migration: 0041–0049 are untouched; each function here is replaced whole with its
-- signature kept, and every earlier record keeps its digest.
--
--   §1  record_outcome: the observed period IS the criterion's interval (a superset aggregate is
--       not this outcome); choices admitted before 0049 keep the 0048 rules
--   §2  replay_contributors: a reconciliation shown in the observed layer contributes both of its
--       sides (the twin versions, bound exactly) and every record either side cites
-- ============================================================

-- ============================================================
-- 1. The observed period is the criterion's interval.
-- ============================================================
CREATE OR REPLACE FUNCTION decision.record_outcome(
  p_outcome_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_criterion_key text, p_twin_id uuid, p_twin_version int, p_element_key text, p_reconciliation_id uuid,
  p_title text, p_statement text, p_header_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, twin, simulation, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; crit jsonb; e twin.state_elements%ROWTYPE; tv record; rc record; fc jsonb; v_runs uuid[]; v_twins uuid[]; v_simulated boolean; v_value numeric; v_target numeric; v_met boolean; v_sim jsonb; v_cmt uuid; v_rec timestamptz; v_from date; v_to date;
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
  SELECT * INTO tv FROM twin.twin_versions x WHERE x.twin_id = p_twin_id AND x.version = p_twin_version;
  IF NOT FOUND OR tv.state <> 'admitted' THEN RAISE EXCEPTION 'outcome rejected: twin version % is not admitted', p_twin_version USING ERRCODE = '22023'; END IF;
  IF e.unit IS DISTINCT FROM (crit ->> 'unit') THEN RAISE EXCEPTION 'outcome rejected: the observed element is in %, the criterion in %; same quantity, same unit', coalesce(e.unit, 'no unit'), crit ->> 'unit' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(e.value) <> 'number' THEN RAISE EXCEPTION 'outcome rejected: the observed value is not a number' USING ERRCODE = '22023'; END IF;
  IF (crit ->> 'observed_on') IS DISTINCT FROM ('twin:' || p_element_key) THEN
    RAISE EXCEPTION 'outcome rejected: criterion % is observed on % (observed_on); element % was offered', p_criterion_key, coalesce(crit ->> 'observed_on', 'nothing'), p_element_key USING ERRCODE = '22023';
  END IF;
  -- THE TWIN: the one the signed choice binds; for choices made before that binding existed, the twins the version's options ran on
  IF (crit ->> 'twin_id') IS NOT NULL THEN
    IF (crit ->> 'twin_id')::uuid <> p_twin_id THEN
      RAISE EXCEPTION 'outcome rejected: criterion % is observed on twin % (bound in the approved choice); twin % was offered', p_criterion_key, crit ->> 'twin_id', p_twin_id USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT coalesce(array_agg(DISTINCT r.twin_id), ARRAY[]::uuid[]) INTO v_twins
      FROM decision.options o, jsonb_array_elements(o.consequences) x JOIN simulation.runs_current r ON r.run_id = (x ->> 'id')::uuid
     WHERE o.package_id = p_package_id AND o.version = v.version AND (x ->> 'kind') = 'run';
    IF array_length(v_twins, 1) IS NULL THEN
      RAISE EXCEPTION 'outcome rejected: criterion % binds no twin and no option of the decision was simulated; the observation target is unbound', p_criterion_key USING ERRCODE = '22023';
    END IF;
    IF NOT (p_twin_id = ANY (v_twins)) THEN RAISE EXCEPTION 'outcome rejected: twin % is not a twin the decision''s options rest on', p_twin_id USING ERRCODE = '22023'; END IF;
  END IF;
  -- THE PERIOD: the observation states its period; it covers the interval the choice binds, and ends by the criterion's date
  IF e.valid_to IS NULL THEN RAISE EXCEPTION 'outcome rejected: the observed element states no period (valid_to); the criterion is judged over a period ending by %', crit ->> 'by' USING ERRCODE = '22023'; END IF;
  IF e.valid_to > (crit ->> 'by')::date THEN
    RAISE EXCEPTION 'outcome rejected: the observed period ends %, after the criterion''s date % (by)', e.valid_to, crit ->> 'by' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(crit -> 'period') = 'object' THEN
    v_from := (crit -> 'period' ->> 'from')::date; v_to := (crit -> 'period' ->> 'to')::date;
    -- 0050: the observation states the criterion's OWN period. A shorter period is not the interval; a longer one that
    -- merely covers it is an aggregate over another period whose value does not represent this interval (a quarter's
    -- total is not March's). No derivation from a superset is attempted here: an interval aggregate is established by an
    -- observation over exactly that interval, or not at all.
    IF e.valid_from IS NULL OR e.valid_from <> v_from OR e.valid_to <> v_to THEN
      RAISE EXCEPTION 'outcome rejected: the observed period % to % is not the interval the criterion binds (% to %); an aggregate over another period — shorter, or longer and merely covering it — does not represent this interval; observe the criterion''s own period',
        coalesce(e.valid_from::text, 'unstated'), e.valid_to, v_from, v_to USING ERRCODE = '22023';
    END IF;
  END IF;
  -- THE CHRONOLOGY: the observation entered after the decision
  IF tv.known_at <= p.decided_at THEN
    RAISE EXCEPTION 'outcome rejected: the observation was known at %, before the decision at % (decided_at); an outcome is observed after the decision', decision.iso(tv.known_at), decision.iso(p.decided_at) USING ERRCODE = '22023';
  END IF;
  FOR fc IN SELECT * FROM jsonb_array_elements(e.citations) LOOP
    IF (fc ->> 'kind') = 'evidence' THEN
      SELECT recorded_at INTO v_rec FROM objects.canonical_objects x WHERE x.object_type = 'EVD' AND x.object_id = (fc ->> 'id')::uuid AND x.object_version = coalesce((fc ->> 'version')::int, 1);
      IF v_rec IS NOT NULL AND v_rec <= p.decided_at THEN
        RAISE EXCEPTION 'outcome rejected: the cited evidence %@% was recorded at %, before the decision at %; an already-known observation is not an outcome', fc ->> 'id', coalesce(fc ->> 'version', '1'), decision.iso(v_rec), decision.iso(p.decided_at) USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  v_value := (e.value #>> '{}')::numeric; v_target := (crit ->> 'target')::numeric;
  v_met := CASE crit ->> 'comparator' WHEN '<=' THEN v_value <= v_target WHEN '>=' THEN v_value >= v_target WHEN '=' THEN v_value = v_target WHEN '<' THEN v_value < v_target WHEN '>' THEN v_value > v_target END;
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
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(rc.from_citations) fc2 WHERE (fc2 ->> 'kind') = 'run' AND (fc2 ->> 'id')::uuid = ANY (v_runs)) THEN
      RAISE EXCEPTION 'outcome rejected: the reconciled simulated element does not cite a run of the chosen option %', v.choice ->> 'option_key' USING ERRCODE = '22023';
    END IF;
    v_sim := jsonb_build_object('twin_id', rc.twin_id, 'version', rc.from_version, 'key', rc.key, 'value', rc.from_value, 'citations', rc.from_citations, 'difference', rc.difference);
  ELSIF p_reconciliation_id IS NOT NULL THEN
    RAISE EXCEPTION 'outcome rejected: the chosen option was not simulated; no reconciliation applies' USING ERRCODE = '22023';
  END IF;
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
          jsonb_build_object('twin_id', p_twin_id, 'version', p_twin_version, 'key', p_element_key, 'element_id', e.element_id, 'citations', e.citations, 'valid_from', e.valid_from, 'valid_to', e.valid_to, 'known_at', decision.iso(tv.known_at)),
          v_sim, p_reconciliation_id, p_header_digest, p_actor, p_correlation);
  UPDATE decision.packages_current SET state = 'monitoring' WHERE package_id = p_package_id AND state = 'committed';
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'outcome.recorded', p_actor,
          jsonb_build_object('version', v.version, 'outcome_id', p_outcome_id, 'criterion_key', p_criterion_key, 'observed_value', e.value, 'target', v_target, 'comparator', crit ->> 'comparator', 'met', v_met, 'reconciliation_id', p_reconciliation_id), p_correlation);
  RETURN jsonb_build_object('outcome_id', p_outcome_id, 'met', v_met, 'observed_value', e.value, 'target', v_target, 'comparator', crit ->> 'comparator', 'simulated', v_sim, 'reconciliation_id', p_reconciliation_id);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 2. A reconciliation contributes both sides and what they cite.
-- ============================================================
/*
 * 0049 enumerated the observed layer's later versions, outcomes and warnings. A reconciliation
 * recorded after the decision shows a later OBSERVATION beside the simulated value: its twin
 * version (both sides, by exact version), the run the simulated side cites and the evidence or
 * claims the observed side cites carry restrictions of their own, which the replay that shows
 * the reconciliation inherits. They are named here from the reconciliation record itself, so a
 * reader whose clearance does not cover them is refused before anything is admitted; a
 * reconciliation whose record cannot be resolved fails closed like any other contributor.
 */
CREATE OR REPLACE FUNCTION decision.replay_contributors(p_content jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, objects, twin, pg_catalog, pg_temp AS $$
  WITH recs AS (
    SELECT (x ->> 'reconciliation_id')::uuid AS reconciliation_id FROM jsonb_array_elements(coalesce(p_content -> 'observed' -> 'reconciliations', '[]'::jsonb)) x
  ),
  rc AS (
    SELECT r.reconciliation_id, t.twin_id, t.from_version, t.against_version, t.from_citations, t.against_citations
      FROM recs r LEFT JOIN twin.reconciliations t ON t.reconciliation_id = r.reconciliation_id
  ),
  refs AS (
    SELECT 'known' AS layer, 'EVD' AS object_type, (x ->> 'id')::uuid AS id, (x ->> 'version')::int AS version FROM jsonb_array_elements(coalesce(p_content -> 'known', '[]'::jsonb)) x
    UNION ALL SELECT 'believed', 'CLM', (x ->> 'id')::uuid, (x ->> 'version')::int FROM jsonb_array_elements(coalesce(p_content -> 'believed' -> 'claims', '[]'::jsonb)) x
    UNION ALL SELECT 'believed', 'FCT', (x ->> 'id')::uuid, (x ->> 'version')::int FROM jsonb_array_elements(coalesce(p_content -> 'believed' -> 'forecasts', '[]'::jsonb)) x
    UNION ALL SELECT 'believed', 'ASU', (x ->> 'id')::uuid, (x ->> 'version')::int FROM jsonb_array_elements(coalesce(p_content -> 'believed' -> 'assumptions', '[]'::jsonb)) x
    UNION ALL SELECT 'believed', 'WRN', (x ->> 'id')::uuid, (x ->> 'version')::int FROM jsonb_array_elements(coalesce(p_content -> 'believed' -> 'warnings', '[]'::jsonb)) x
    UNION ALL SELECT 'tested', 'SIM', (x ->> 'run_id')::uuid, 1 FROM jsonb_array_elements(coalesce(p_content -> 'tested' -> 'runs', '[]'::jsonb)) x
    UNION ALL SELECT 'decided', 'DPK', (p_content ->> 'package_id')::uuid, (p_content ->> 'version')::int
    UNION ALL SELECT 'observed', x ->> 'object_type', (x ->> 'id')::uuid, (x ->> 'version')::int FROM jsonb_array_elements(coalesce(p_content -> 'observed' -> 'later_versions', '[]'::jsonb)) x
    UNION ALL SELECT 'observed', 'OUT', (x ->> 'id')::uuid, 1 FROM jsonb_array_elements(coalesce(p_content -> 'observed' -> 'outcomes', '[]'::jsonb)) x
    UNION ALL SELECT 'observed', 'WRN', (x ->> 'warning_id')::uuid, NULL FROM jsonb_array_elements(coalesce(p_content -> 'observed' -> 'warnings', '[]'::jsonb)) x
    -- 0050: the reconciliation's two sides (exact twin versions) …
    UNION ALL SELECT 'observed', 'TWN', rc.twin_id, rc.from_version FROM rc
    UNION ALL SELECT 'observed', 'TWN', rc.twin_id, rc.against_version FROM rc
    -- … and what each side cites (the run of the simulated side; the evidence, claims, forecasts of the observed side)
    UNION ALL SELECT 'observed', CASE c ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'evidence' THEN 'EVD' WHEN 'claim' THEN 'CLM' WHEN 'forecast' THEN 'FCT' WHEN 'assumption' THEN 'ASU' END,
                     (c ->> 'id')::uuid, coalesce((c ->> 'version')::int, 1)
      FROM rc, jsonb_array_elements(coalesce(rc.from_citations, '[]'::jsonb) || coalesce(rc.against_citations, '[]'::jsonb)) c
     WHERE (c ->> 'kind') IN ('run', 'evidence', 'claim', 'forecast', 'assumption')
    -- a reconciliation whose record cannot be found is itself an unresolved contributor
    UNION ALL SELECT 'observed', 'RCN', rc.reconciliation_id, NULL FROM rc WHERE rc.twin_id IS NULL
  ),
  resolved AS (
    SELECT r.layer, r.object_type, r.id, r.version, o.object_version, o.classification, o.synthetic_state, o.rights_profile, o.residency_profile, o.retention_profile, o.access_policy_ref
      FROM refs r LEFT JOIN LATERAL (
        SELECT * FROM objects.canonical_objects c WHERE c.object_type = r.object_type AND c.object_id = r.id AND (r.version IS NULL OR c.object_version = r.version)
         ORDER BY c.object_version DESC LIMIT 1) o ON true)
  SELECT coalesce(jsonb_agg(jsonb_build_object('layer', layer, 'object_type', object_type, 'id', id, 'version', coalesce(object_version, version),
                                               'unresolved', object_version IS NULL,
                                               'classification', coalesce(classification, 'restricted'), 'synthetic_state', coalesce(synthetic_state, true),
                                               'rights_profile', rights_profile, 'residency_profile', residency_profile, 'retention_profile', retention_profile, 'access_policy_ref', access_policy_ref)
                            ORDER BY layer, object_type, id, coalesce(object_version, version)), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (layer, object_type, id, coalesce(object_version, version)) * FROM resolved ORDER BY layer, object_type, id, coalesce(object_version, version)) d;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.replay_contributors(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.replay_contributors(jsonb) TO eye_app, eye_commit;
