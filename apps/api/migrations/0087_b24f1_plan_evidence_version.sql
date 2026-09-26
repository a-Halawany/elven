-- 0087 — CP-6 B24-F1 (2026-09-26): A PLAN EXECUTION IS DONE ONLY AGAINST THE EVIDENCE VERSION IT WAS QUEUED FOR.
--
-- THE FINDING (the bounded B24 review of 2026-09-25, B24-F1). 0086 §P queues one execution per (method, method version, evidence object,
-- evidence VERSION), but the worker handed the orchestrator the evidence object only, and the orchestrator read the object's CURRENT
-- version: a plan queued on version 1 whose evidence was corrected (version 2) before its drain ran against version 2, and
-- record_plan_execution marked the version-1 execution done — the ledger's identity said one version, the run read another.
--
-- THE CORRECTION (forward; 0084–0086 are applied and untouched):
--   * the worker pins the queued version: the orchestrator reads exactly that version, or — when a later canonical version exists —
--     refuses BEFORE any run starts (the TypeScript half: EvidenceVersionSuperseded);
--   * intelligence.record_plan_execution (0086 §P copied whole + ONE guard): a `done` outcome names the evidence version the run read
--     (details.evd_version), and it must equal the execution's own — anything else is refused, `plan execution rejected
--     (evidence_version): …` (22023);
--   * intelligence.reselect_plan_execution (NEW, the scheduler's capability, as the other worker ports): an EXPLICIT reselection — the
--     running version-n execution is recorded `refused` with the reason and the successor named, and ONE pending execution is queued
--     for the same method version on the CURRENT evidence version (the ledger's UNIQUE identity: an execution already queued for it is
--     named, never duplicated), its event `reselected` naming where it came from. Only a LIVE successor is reselected: a withdrawn
--     current version is not extracted — the worker records the refusal alone;
--   * plan_execution_events' event CHECK admits `reselected`.
--
-- NOT HERE (stated): a correction does not publish ObservationRecorded, so nothing queues a plan for a corrected version until an
-- execution queued on the older version drains (then it is reselected here) — a correction arriving after that execution finished is
-- not re-extracted automatically; the interface register (unchanged, 50/0/0).

ALTER TABLE intelligence.plan_execution_events DROP CONSTRAINT plan_execution_events_event_check;
ALTER TABLE intelligence.plan_execution_events ADD CONSTRAINT plan_execution_events_event_check
  CHECK (event IN ('queued', 'claimed', 'done', 'refused', 'failed', 'requeued', 'reselected'));

-- Record: the outcome of a claimed execution — done (the run id required, and the evidence version it read equal to the execution's),
-- refused (a governance answer: the grant, the policy, the method's state, an unreadable or superseded evidence), failed (an infrastructure
-- or run failure; re-claimed while under the attempt budget).
CREATE OR REPLACE FUNCTION intelligence.record_plan_execution(p_execution_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_run_id uuid, p_error text, p_details jsonb)
RETURNS text
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e intelligence.plan_executions%ROWTYPE; v_max int; v_exhausted boolean := false;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_outcome NOT IN ('done', 'refused', 'failed') THEN
    RAISE EXCEPTION 'plan execution rejected: an outcome is done, refused or failed' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'done' AND p_run_id IS NULL THEN
    RAISE EXCEPTION 'plan execution rejected: a done execution names its run' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM intelligence.plan_executions x WHERE x.execution_id = p_execution_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan execution rejected: execution % is not an execution of this domain', p_execution_id USING ERRCODE = '23503'; END IF;
  IF e.state <> 'running' THEN
    RAISE EXCEPTION 'plan execution rejected: execution % is %, not running; only a claimed execution records an outcome', p_execution_id, e.state USING ERRCODE = '23514';
  END IF;
  -- B24-F1: done only against the version the execution was queued for — the run's own report of the version it read.
  IF p_outcome = 'done' AND (p_details ->> 'evd_version') IS DISTINCT FROM e.evd_version::text THEN
    RAISE EXCEPTION 'plan execution rejected (evidence_version): execution % was queued for evidence version %; the run reports version %', p_execution_id, e.evd_version, coalesce(p_details ->> 'evd_version', 'none') USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'failed' THEN
    SELECT (a.budgets ->> 'max_attempts')::int INTO v_max FROM intelligence.extraction_agents a WHERE a.agent_id = e.agent_id;
    v_exhausted := e.attempts >= coalesce(v_max, 1);
  END IF;
  UPDATE intelligence.plan_executions
     SET state = p_outcome, run_id = coalesce(p_run_id, run_id), last_error = CASE WHEN p_outcome = 'done' THEN NULL ELSE left(p_error, 500) END,
         outcome = coalesce(p_details, '{}'::jsonb) || jsonb_build_object('attempt', e.attempts, 'exhausted', v_exhausted), finished_at = clock_timestamp()
   WHERE execution_id = p_execution_id;
  INSERT INTO intelligence.plan_execution_events (event_id, scope, tenant_id, domain_id, execution_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_execution_id, p_outcome, e.principal_id,
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('run_id', p_run_id, 'error', left(p_error, 500), 'attempt', e.attempts, 'agent_id', e.agent_id, 'exhausted', v_exhausted), e.correlation_id);
  RETURN p_outcome;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.record_plan_execution(uuid,uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.record_plan_execution(uuid,uuid,uuid,text,uuid,text,jsonb) TO eye_commit;

-- Reselect: a running execution whose evidence was superseded by a LIVE later version is refused, and the same method version is queued
-- on the current version — explicitly, recorded on both rows. Idempotent on the ledger's identity.
CREATE OR REPLACE FUNCTION intelligence.reselect_plan_execution(p_execution_id uuid, p_tenant uuid, p_domain uuid, p_current_version int, p_reason text)
RETURNS jsonb
SECURITY DEFINER SET search_path = intelligence, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e intelligence.plan_executions%ROWTYPE; c record; v_new uuid; v_queued boolean := false; px intelligence.plan_executions%ROWTYPE;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'plan execution rejected: a reselection carries a reason of 8+ characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM intelligence.plan_executions x WHERE x.execution_id = p_execution_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan execution rejected: execution % is not an execution of this domain', p_execution_id USING ERRCODE = '23503'; END IF;
  IF e.state <> 'running' THEN
    RAISE EXCEPTION 'plan execution rejected: execution % is %, not running; only a claimed execution is reselected', p_execution_id, e.state USING ERRCODE = '23514';
  END IF;
  SELECT o.object_version::int AS v, o.lifecycle_state, o.truth_state INTO c
    FROM objects.canonical_objects o
   WHERE o.object_id = e.evd_object_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain
   ORDER BY o.object_version DESC LIMIT 1;
  IF NOT FOUND OR c.v <> p_current_version OR c.v <= e.evd_version THEN
    RAISE EXCEPTION 'plan execution rejected (evidence_version): evidence % is at version %; a reselection names the current version, later than the queued %',
      e.evd_object_id, coalesce(c.v::text, 'none'), e.evd_version USING ERRCODE = '22023';
  END IF;
  IF c.lifecycle_state = 'withdrawn' OR c.truth_state = 'withdrawn' THEN
    RAISE EXCEPTION 'plan execution rejected (evidence_version): evidence % version % is withdrawn; a withdrawn version is not extracted', e.evd_object_id, c.v USING ERRCODE = '22023';
  END IF;
  INSERT INTO intelligence.plan_executions (execution_id, scope, tenant_id, domain_id, selection_id, method_id, method_key, method_version, evd_object_id, evd_version, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, e.selection_id, e.method_id, e.method_key, e.method_version, e.evd_object_id, c.v, e.correlation_id)
  ON CONFLICT ON CONSTRAINT ipx_once DO NOTHING
  RETURNING execution_id INTO v_new;
  IF v_new IS NOT NULL THEN
    v_queued := true;
    INSERT INTO intelligence.plan_execution_events (event_id, scope, tenant_id, domain_id, execution_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_new, 'reselected', e.principal_id,
            jsonb_build_object('from_execution', e.execution_id, 'from_version', e.evd_version, 'evd_version', c.v, 'reason', p_reason), e.correlation_id);
  ELSE
    SELECT * INTO px FROM intelligence.plan_executions x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.method_id = e.method_id AND x.method_version = e.method_version
       AND x.evd_object_id = e.evd_object_id AND x.evd_version = c.v;
    v_new := px.execution_id;
  END IF;
  UPDATE intelligence.plan_executions
     SET state = 'refused', last_error = left(format('superseded: evidence version %s is current (%s); %s', c.v, c.lifecycle_state, p_reason), 500),
         outcome = jsonb_build_object('superseded_by_version', c.v, 'reselected_execution_id', v_new, 'queued', v_queued, 'attempt', e.attempts, 'exhausted', false),
         finished_at = clock_timestamp()
   WHERE execution_id = e.execution_id;
  INSERT INTO intelligence.plan_execution_events (event_id, scope, tenant_id, domain_id, execution_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, e.execution_id, 'refused', e.principal_id,
          jsonb_build_object('reason', 'evidence_version_superseded', 'superseded_by_version', c.v, 'reselected_execution_id', v_new, 'queued', v_queued,
                             'attempt', e.attempts, 'agent_id', e.agent_id, 'error', p_reason), e.correlation_id);
  RETURN jsonb_build_object('execution_id', e.execution_id, 'state', 'refused', 'evd_version', e.evd_version,
                            'reselected', jsonb_build_object('execution_id', v_new, 'evd_version', c.v, 'queued', v_queued));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.reselect_plan_execution(uuid,uuid,uuid,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.reselect_plan_execution(uuid,uuid,uuid,int,text) TO eye_commit;
