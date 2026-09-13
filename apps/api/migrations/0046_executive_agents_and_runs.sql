-- 0046 · Phase 6, P6-M6 — the three bounded agents, their runs, budgets, stops,
-- escalations and refusals; the workflow contract read from governed events
-- (PHASE6_BUILD_PLAN.md §3 agents row and agent session path; F7; §6a rule 8).
--
-- An agent is a principal of kind 'agent' registered in executive.agents with its
-- contract kind, version, code digest, the accountable human, the human a stop
-- escalates to, budgets and stop conditions. A run is opened by the agent under ITS
-- OWN session (executive.decision_agent_session_open — the shape of Phase 1's
-- identity.agent_session_open, placed in this schema so the Phase 0 authority matrix
-- frozen at 0021 stays untouched), carries its trigger (an operator or the scheduler),
-- spends its budget, and closes as finished, stopped (budget or stop condition, with
-- an escalation to the named human), refused (its attempt at an action it has no
-- grant for was refused at the PDP and recorded) or faulted. Nothing learns or
-- self-modifies.
-- ============================================================
CREATE TABLE executive.agent_runs (
  run_id               uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  agent_id             uuid NOT NULL REFERENCES executive.agents(agent_id),
  principal_id         uuid NOT NULL,
  agent_kind           text NOT NULL,
  agent_version        text NOT NULL,
  code_digest          text NOT NULL,
  task                 text NOT NULL CHECK (task IN ('draft', 'briefing', 'report', 'monitor')),
  trigger_kind         text NOT NULL CHECK (trigger_kind IN ('operator', 'scheduler')),
  trigger_principal_id uuid,
  trigger_ref          text,
  room_id              uuid,
  package_id           uuid,
  budget               jsonb NOT NULL,
  spent                jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome              text NOT NULL DEFAULT 'running' CHECK (outcome IN ('running', 'finished', 'stopped', 'refused', 'faulted')),
  stop_reason          text,
  escalated_to         uuid,
  refusals             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(refusals) = 'array'),
  outputs              jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at          timestamptz,
  correlation_id       uuid NOT NULL,
  CONSTRAINT xar_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xar_closed CHECK ((outcome = 'running') = (finished_at IS NULL))
);
CREATE INDEX xar_agent ON executive.agent_runs (agent_id, started_at);
/* A run closes once; a closed run is immutable. */
CREATE OR REPLACE FUNCTION executive.agent_runs_close_once() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'agent runs are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.outcome <> 'running' THEN RAISE EXCEPTION 'agent run % is closed and immutable', OLD.run_id USING ERRCODE = '2F002'; END IF;
  IF NEW.run_id <> OLD.run_id OR NEW.agent_id <> OLD.agent_id OR NEW.principal_id <> OLD.principal_id OR NEW.task <> OLD.task OR NEW.trigger_kind <> OLD.trigger_kind
     OR NEW.budget <> OLD.budget OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'agent run % changes only by closing', OLD.run_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xar_close_once BEFORE UPDATE OR DELETE ON executive.agent_runs
  FOR EACH ROW EXECUTE FUNCTION executive.agent_runs_close_once();

-- ============================================================
-- Ports.
-- ============================================================
CREATE OR REPLACE FUNCTION executive.register_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_kind text, p_version text, p_code_digest text, p_owner uuid, p_escalation uuid,
  p_budgets jsonb, p_stop_conditions jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_kind NOT IN ('decision', 'briefing', 'reporting') THEN RAISE EXCEPTION 'agent rejected: kind is decision, briefing or reporting' USING ERRCODE = '22023'; END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = p_principal AND tenant_id = p_tenant;
  IF NOT FOUND OR v_kind <> 'agent' OR v_status <> 'active' THEN RAISE EXCEPTION 'agent rejected: the principal must be an active principal of kind agent in this tenant' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_owner, p_tenant) THEN RAISE EXCEPTION 'agent rejected: the owner is the accountable human, never another agent' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_escalation, p_tenant) THEN RAISE EXCEPTION 'agent rejected: the escalation target is a named human' USING ERRCODE = '42501'; END IF;
  IF p_budgets IS NULL OR jsonb_typeof(p_budgets) <> 'object' OR NOT (p_budgets ? 'max_reads' AND p_budgets ? 'max_gateway_calls' AND p_budgets ? 'max_elapsed_ms') THEN
    RAISE EXCEPTION 'agent rejected: budgets name max_reads, max_gateway_calls and max_elapsed_ms' USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_kind, agent_version, code_digest, owner_principal_id, escalation_principal_id, budgets, stop_conditions, created_by, correlation_id)
  VALUES (p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_kind, p_version, p_code_digest, p_owner, p_escalation, p_budgets, coalesce(p_stop_conditions, '[]'::jsonb), p_actor, p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'principal_id', p_principal, 'kind', p_kind);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.register_agent(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.register_agent(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,jsonb,jsonb,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION executive.revoke_agent(p_agent_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS void
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE executive.agents SET status = 'revoked', revoked_at = clock_timestamp() WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'revocation rejected: no active agent % in this domain', p_agent_id USING ERRCODE = '23503'; END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.revoke_agent(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.revoke_agent(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* The agent's own session — Phase 1's shape: identity-operation context, active registration, matching version and digest, active agent principal. */
CREATE OR REPLACE FUNCTION executive.decision_agent_session_open(
  p_session uuid, p_agent_id uuid, p_tenant uuid, p_domain uuid, p_agent_version text, p_code_digest text,
  p_refresh_hash text, p_context_key_hash text, p_expires_at timestamptz, p_family uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE; v_kind text; v_status text;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'agent session denied: identity operation capability required (context is %)', public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM executive.agents WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent session denied: no such agent in this domain' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'agent session denied: agent grant is revoked' USING ERRCODE = '42501'; END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'agent session denied: agent instance or code digest does not match the registration' USING ERRCODE = '42501';
  END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = a.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'agent session denied: principal is not an active agent principal' USING ERRCODE = '42501'; END IF;
  PERFORM identity.session_open(p_session, a.principal_id, 'agent_grant', p_refresh_hash, p_context_key_hash, p_expires_at, p_family);
  RETURN a.principal_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.decision_agent_session_open(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.decision_agent_session_open(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) TO eye_identity;
-- The identity authority reaches this ONE definer port and nothing else in the schema: usage, no table grants.
GRANT USAGE ON SCHEMA executive TO eye_identity;

/* A run is opened by the agent, under its own session, with its trigger recorded. */
CREATE OR REPLACE FUNCTION executive.open_agent_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_agent_id uuid, p_task text, p_trigger_kind text, p_trigger_principal uuid, p_trigger_ref text, p_room_id uuid, p_package_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM executive.agents WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND OR a.status <> 'active' THEN RAISE EXCEPTION 'run rejected: no active agent % in this domain', p_agent_id USING ERRCODE = '42501'; END IF;
  IF a.principal_id IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'run rejected: a run is opened by the agent itself, under its own session' USING ERRCODE = '42501'; END IF;
  IF p_task NOT IN ('draft', 'briefing', 'report', 'monitor') THEN RAISE EXCEPTION 'run rejected: task is draft, briefing, report or monitor' USING ERRCODE = '22023'; END IF;
  IF (a.agent_kind = 'decision' AND p_task <> 'draft') OR (a.agent_kind = 'briefing' AND p_task NOT IN ('briefing', 'monitor')) OR (a.agent_kind = 'reporting' AND p_task <> 'report') THEN
    RAISE EXCEPTION 'run rejected: a % agent does not run the task %', a.agent_kind, p_task USING ERRCODE = '42501';
  END IF;
  INSERT INTO executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_principal_id, trigger_ref, room_id, package_id, budget, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, a.principal_id, a.agent_kind, a.agent_version, a.code_digest, p_task, p_trigger_kind, p_trigger_principal, p_trigger_ref, p_room_id, p_package_id, a.budgets, p_correlation);
  RETURN jsonb_build_object('run_id', p_run_id, 'budget', a.budgets, 'stop_conditions', a.stop_conditions, 'escalation_principal_id', a.escalation_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION executive.close_agent_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_spent jsonb, p_stop_reason text, p_refusals jsonb, p_outputs jsonb, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.agent_runs%ROWTYPE; a executive.agents%ROWTYPE; v_esc uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM executive.agent_runs WHERE run_id = p_run_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'close rejected: no such run' USING ERRCODE = '23503'; END IF;
  IF r.principal_id IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'close rejected: a run is closed by the agent that opened it' USING ERRCODE = '42501'; END IF;
  IF r.outcome <> 'running' THEN RAISE EXCEPTION 'close rejected: run is already %', r.outcome USING ERRCODE = '22023'; END IF;
  IF p_outcome NOT IN ('finished', 'stopped', 'refused', 'faulted') THEN RAISE EXCEPTION 'close rejected: outcome is finished, stopped, refused or faulted' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM executive.agents WHERE agent_id = r.agent_id;
  IF p_outcome IN ('stopped', 'refused', 'faulted') THEN v_esc := a.escalation_principal_id; END IF;
  UPDATE executive.agent_runs SET outcome = p_outcome, spent = coalesce(p_spent, '{}'::jsonb), stop_reason = p_stop_reason, refusals = coalesce(p_refusals, '[]'::jsonb), outputs = coalesce(p_outputs, '{}'::jsonb),
         escalated_to = v_esc, finished_at = clock_timestamp()
   WHERE run_id = p_run_id;
  IF v_esc IS NOT NULL AND r.room_id IS NOT NULL THEN
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.room_id, 'agent.escalated', r.principal_id,
            jsonb_build_object('run_id', p_run_id, 'agent_id', r.agent_id, 'agent_kind', r.agent_kind, 'outcome', p_outcome, 'reason', p_stop_reason, 'escalated_to', v_esc, 'refusals', coalesce(p_refusals, '[]'::jsonb)), p_correlation);
  END IF;
  RETURN jsonb_build_object('run_id', p_run_id, 'outcome', p_outcome, 'escalated_to', v_esc);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.close_agent_run(uuid,uuid,uuid,text,jsonb,text,jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.close_agent_run(uuid,uuid,uuid,text,jsonb,text,jsonb,jsonb,uuid) TO eye_commit;

/* The workflow contract of a package: its steps as the governed events record them. */
CREATE OR REPLACE FUNCTION executive.workflow_of(p_package_id uuid) RETURNS jsonb
STABLE SET search_path = decision, executive, pg_catalog, pg_temp AS $$
  WITH ev AS (SELECT event, actor_principal_id, occurred_at FROM decision.package_events WHERE package_id = p_package_id),
  steps(step, ordinal, events) AS (VALUES
    ('draft', 1, ARRAY['version.opened', 'option.set', 'terms.set', 'choice.set']), ('propose', 2, ARRAY['version.proposed']),
    ('review', 3, ARRAY['review.recorded', 'dissent.recorded', 'version.rejected']), ('approve', 4, ARRAY['version.approved']),
    ('commit', 5, ARRAY['package.committed']), ('monitor', 6, ARRAY['condition.breached', 'review.overdue', 'outcome.recorded']), ('close', 7, ARRAY['package.closed'])),
  per_step AS (
    SELECT s.step, s.ordinal, count(e.event) AS n, min(e.occurred_at) AS first_at, max(e.occurred_at) AS last_at,
           coalesce(jsonb_agg(DISTINCT e.actor_principal_id) FILTER (WHERE e.actor_principal_id IS NOT NULL), '[]'::jsonb) AS actors
      FROM steps s LEFT JOIN ev e ON e.event = ANY (s.events)
     GROUP BY s.step, s.ordinal)
  SELECT jsonb_agg(jsonb_build_object('step', step, 'ordinal', ordinal, 'status', CASE WHEN n > 0 THEN 'recorded' ELSE 'pending' END, 'events', n,
                                      'first_at', decision.iso(first_at), 'last_at', decision.iso(last_at), 'actors', actors) ORDER BY ordinal)
    FROM per_step
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION executive.workflow_of(uuid) TO eye_app, eye_commit;

ALTER TABLE executive.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive.agent_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY executive_isolation ON executive.agent_runs
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON executive.agent_runs TO eye_app, eye_commit;
