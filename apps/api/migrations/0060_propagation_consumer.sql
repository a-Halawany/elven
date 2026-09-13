-- 0060_propagation_consumer.sql — CP-6 batch B1: the `CorrectionApplied` consumer.
--
-- Since Phase 3 every review has carried the same deferred item: the outbox publishes an
-- applied correction and nothing subscribes, so the dependency walk that marks what
-- rested on the corrected evidence runs only when an operator asks for it. This migration
-- gives the walk an AUTOMATIC actor that is governed exactly as every other agent is:
--
--   * a PROPAGATION AGENT — a registered, revocable, per-domain grant (one active per
--     domain) held by a principal of kind `agent` with ONE business role,
--     `propagation_agent`, whose whole decision surface is `graph.impact.propagate`. It
--     cannot apply a correction, decide a resolution, declare strategy or read evidence
--     bytes. Registration creates its principal on the identity authority and its grant on
--     the commit authority — the shape of observation.agents (0022) and executive.agents
--     (0044/0046). Its session is opened by ITS OWN port under the identity-operation
--     capability and moved forward only by the walk's progress (0057's rule).
--   * an ATTEMPT LEDGER keyed by the outbox row id — the same id the queue job carries —
--     so a redelivered event, a restarted process or two workers holding one event can
--     never walk a corrected object twice: the per-root checkpoint is taken FOR UPDATE
--     inside the walk's own transaction and commits with the impact record.
--   * COVERAGE IS THE DATABASE'S (0027 §2). The attempt mirrors the case's
--     propagation_state after every root was walked; it never computes completeness.
--
-- Forward only. Nothing in identity/tenancy/policy/audit/objects/ctx/canon/config gains a
-- port (Gate-2.2 C14 re-runs at 0021). The one Phase 0 touch is a role row, exactly as
-- 0022/0023/0024/0029/0032/0041 did. The identity authority gains USAGE on the graph
-- schema for its two definer ports and nothing else (0046 precedent).

INSERT INTO identity.roles (code, scope, description) VALUES
  ('propagation_agent', 'DOMAIN',
   'Propagation agent (bounded) — walks the dependency graph from an applied correction under a registered, revocable grant, through the same graph.impact.propagate port an operator uses. Cannot apply a correction, decide a resolution, declare strategy or read evidence bytes.')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 1. The registry: one active propagation agent per domain.
-- ============================================================
CREATE TABLE graph.propagation_agents (
  agent_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  principal_id        uuid NOT NULL UNIQUE,                       -- identity.principals, kind='agent', role propagation_agent
  agent_version       text NOT NULL CHECK (agent_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  code_digest         text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  owner_principal_id  uuid NOT NULL,                              -- the accountable human
  budgets             jsonb NOT NULL CHECK (jsonb_typeof(budgets) = 'object'
                        AND budgets ? 'max_roots_per_event' AND budgets ? 'max_elapsed_ms'
                        AND coalesce(budgets ->> 'backlog_policy', 'leave') IN ('walk', 'leave')),
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at          timestamptz,
  correlation_id      uuid NOT NULL,
  CONSTRAINT gpa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpa_revoked_has_time CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX gpa_one_active_per_domain ON graph.propagation_agents (tenant_id, domain_id) WHERE status = 'active';

CREATE TABLE graph.propagation_agent_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  agent_id           uuid NOT NULL REFERENCES graph.propagation_agents(agent_id),
  event              text NOT NULL CHECK (event IN ('agent.registered', 'agent.revoked')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gpae_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER gpae_append_only BEFORE UPDATE OR DELETE ON graph.propagation_agent_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 2. The attempt ledger: every delivery of a CorrectionApplied event, keyed by the
--    OUTBOX ROW ID (= the queue job id), with the per-root checkpoint.
-- ============================================================
CREATE TABLE graph.propagation_attempts (
  event_id          uuid PRIMARY KEY,                             -- objects.object_outbox.id
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  case_id           uuid NOT NULL,                                -- observation.correction_current
  state             text NOT NULL CHECK (state IN ('received', 'walking', 'complete', 'partial', 'failed')),
  deliveries        int  NOT NULL DEFAULT 1 CHECK (deliveries >= 1),   -- every time the job was handed to a worker
  attempts          int  NOT NULL DEFAULT 0 CHECK (attempts >= 0),     -- every time a walk was begun
  agent_id          uuid REFERENCES graph.propagation_agents(agent_id),
  principal_id      uuid,
  roots             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(roots) = 'array'),        -- the case's corrected objects at first receipt
  roots_walked      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(roots_walked) = 'array'), -- [{root, invalidation_id, truncated, at}]
  last_error        text,
  first_received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_delivered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at       timestamptz,
  correlation_id    uuid NOT NULL,
  CONSTRAINT gpat_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpat_finished CHECK ((state IN ('complete', 'partial', 'failed')) = (finished_at IS NOT NULL))
);
CREATE INDEX gpat_case ON graph.propagation_attempts (case_id, last_delivered_at DESC);
CREATE INDEX gpat_state ON graph.propagation_attempts (tenant_id, domain_id, state);

CREATE TABLE graph.propagation_attempt_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  outbox_event_id    uuid NOT NULL REFERENCES graph.propagation_attempts(event_id),
  event              text NOT NULL CHECK (event IN ('received', 'walking', 'root.walked', 'complete', 'partial', 'failed')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gpate_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gpate_attempt ON graph.propagation_attempt_events (outbox_event_id, occurred_at);
CREATE TRIGGER gpate_append_only BEFORE UPDATE OR DELETE ON graph.propagation_attempt_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- Row-level security and read grants, exactly as every graph table (0024 §RLS).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['propagation_agents', 'propagation_agent_events', 'propagation_attempts', 'propagation_attempt_events'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- 3. Registration and revocation — the administrator's act, on the commit authority.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.register_propagation_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_version text, p_code_digest text,
  p_owner uuid, p_budgets jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.propagation.agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = p_principal AND tenant_id = p_tenant;
  IF NOT FOUND OR v_kind <> 'agent' OR v_status <> 'active' THEN
    RAISE EXCEPTION 'propagation agent rejected: the principal must be an active principal of kind agent in this tenant' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals WHERE id = p_owner AND kind = 'human' AND status = 'active') THEN
    RAISE EXCEPTION 'propagation agent rejected: the accountable owner must be an active human principal' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM graph.propagation_agents WHERE tenant_id = p_tenant AND domain_id = p_domain AND status = 'active') THEN
    RAISE EXCEPTION 'propagation agent rejected: this domain already has an active propagation agent; revoke it first' USING ERRCODE = '23505';
  END IF;
  INSERT INTO graph.propagation_agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_version, code_digest, owner_principal_id, budgets, created_by, correlation_id)
  VALUES (p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_version, p_code_digest, p_owner, p_budgets, p_actor, p_correlation);
  INSERT INTO graph.propagation_agent_events (event_id, scope, tenant_id, domain_id, agent_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, 'agent.registered', p_actor,
          jsonb_build_object('principal_id', p_principal, 'version', p_version, 'code_digest', p_code_digest, 'owner', p_owner, 'budgets', p_budgets), p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'principal_id', p_principal, 'version', p_version, 'code_digest', p_code_digest, 'budgets', p_budgets);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.register_propagation_agent(uuid,uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.register_propagation_agent(uuid,uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.revoke_propagation_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.propagation.agent.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE graph.propagation_agents SET status = 'revoked', revoked_at = clock_timestamp()
   WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revocation rejected: no active propagation agent % in this domain', p_agent_id USING ERRCODE = '23503';
  END IF;
  INSERT INTO graph.propagation_agent_events (event_id, scope, tenant_id, domain_id, agent_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, 'agent.revoked', p_actor, jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.revoke_propagation_agent(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.revoke_propagation_agent(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 4. The agent's own session — the shape of identity.agent_session_open (0022) and
--    executive.decision_agent_session_open (0046) over THIS registry, and 0057's
--    progress-bound extension.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.propagation_agent_session_open(
  p_session uuid, p_agent_id uuid, p_tenant uuid, p_domain uuid, p_agent_version text, p_code_digest text,
  p_refresh_hash text, p_context_key_hash text, p_expires_at timestamptz, p_family uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = graph, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a graph.propagation_agents%ROWTYPE; v_kind text; v_status text;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'agent session denied: identity operation capability required (context is %)', public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM graph.propagation_agents WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent session denied: no such propagation agent in this domain' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'agent session denied: agent grant is revoked' USING ERRCODE = '42501'; END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'agent session denied: agent instance or code digest does not match the registration' USING ERRCODE = '42501';
  END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = a.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'agent session denied: principal is not an active agent principal' USING ERRCODE = '42501';
  END IF;
  PERFORM identity.session_open(p_session, a.principal_id, 'agent_grant', p_refresh_hash, p_context_key_hash, p_expires_at, p_family);
  RETURN a.principal_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propagation_agent_session_open(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propagation_agent_session_open(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) TO eye_identity;

CREATE OR REPLACE FUNCTION graph.propagation_agent_session_extend(
  p_session uuid, p_agent_id uuid, p_tenant uuid, p_domain uuid, p_agent_version text, p_code_digest text, p_expires_at timestamptz
) RETURNS timestamptz
SECURITY DEFINER SET search_path = graph, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a graph.propagation_agents%ROWTYPE; s identity.sessions%ROWTYPE; v_kind text; v_status text; v_new timestamptz;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'agent session extension denied: identity operation capability required (context is %)', public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at > clock_timestamp() + interval '1 day' THEN
    RAISE EXCEPTION 'agent session extension denied: an extension is bounded to one day ahead' USING ERRCODE = '42501';
  END IF;
  -- The grant, re-verified as at opening: an agent revoked mid-walk gets no more authority.
  SELECT * INTO a FROM graph.propagation_agents WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent session extension denied: no such propagation agent in this domain' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'agent session extension denied: agent grant is revoked' USING ERRCODE = '42501'; END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'agent session extension denied: agent instance or code digest does not match the registration' USING ERRCODE = '42501';
  END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = a.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'agent session extension denied: principal is not an active agent principal' USING ERRCODE = '42501';
  END IF;
  -- The session: this agent's, an agent-grant session, still active and not yet expired.
  SELECT * INTO s FROM identity.sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR s.principal_id <> a.principal_id OR s.assurance <> 'agent_grant' THEN
    RAISE EXCEPTION 'agent session extension denied: no such run session for this agent' USING ERRCODE = '42501';
  END IF;
  IF s.status <> 'active' OR s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'agent session extension denied: the run session is no longer active' USING ERRCODE = '42501';
  END IF;
  v_new := greatest(s.expires_at, p_expires_at);
  UPDATE identity.sessions SET expires_at = v_new WHERE id = p_session;
  RETURN v_new;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propagation_agent_session_extend(uuid,uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propagation_agent_session_extend(uuid,uuid,uuid,uuid,text,text,timestamptz) TO eye_identity;
-- The identity authority reaches these TWO definer ports and nothing else in the schema: usage, no table grants.
GRANT USAGE ON SCHEMA graph TO eye_identity;

-- ============================================================
-- 5. The attempt ledger OUTSIDE the agent's authority — a refused grant still has to be
--    recorded. Under the scheduler's bounded machine capability (0038/0039), the exact
--    guard the collection worker's attempt record uses.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.propagation_attempt_receive(p_event_id uuid, p_tenant uuid, p_domain uuid, p_case_id uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.propagation_attempts%ROWTYPE; a graph.propagation_agents%ROWTYPE; v_case_state text; v_prop text; v_roots jsonb;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_tenant IS NULL OR p_domain IS NULL OR p_case_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'propagation attempt requires an event, a tenant, a domain and a case' USING ERRCODE = '23514';
  END IF;
  -- The roots are the case's OWN record of what it corrected (0027), never the payload's.
  SELECT c.state, c.propagation_state,
         coalesce((SELECT jsonb_agg(DISTINCT x ->> 'object_id') FROM jsonb_array_elements(c.affected_resolved) x WHERE x ? 'object_id'), '[]'::jsonb)
    INTO v_case_state, v_prop, v_roots
    FROM observation.correction_current c WHERE c.case_id = p_case_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF v_case_state IS NULL THEN
    RAISE EXCEPTION 'propagation attempt rejected: no correction case % in this scope', p_case_id USING ERRCODE = '23503';
  END IF;
  SELECT * INTO a FROM graph.propagation_agents WHERE tenant_id = p_tenant AND domain_id = p_domain AND status = 'active';
  INSERT INTO graph.propagation_attempts (event_id, scope, tenant_id, domain_id, case_id, state, deliveries, attempts, agent_id, principal_id, roots, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_case_id, 'received', 1, 0, a.agent_id, a.principal_id, v_roots, p_correlation)
  ON CONFLICT (event_id) DO UPDATE
     SET deliveries = graph.propagation_attempts.deliveries + 1,
         last_delivered_at = clock_timestamp(),
         -- A terminal complete/partial attempt is NOT reopened by a redelivery; a failed or interrupted one is.
         state = CASE WHEN graph.propagation_attempts.state IN ('complete', 'partial') THEN graph.propagation_attempts.state ELSE 'received' END,
         finished_at = CASE WHEN graph.propagation_attempts.state IN ('complete', 'partial') THEN graph.propagation_attempts.finished_at ELSE NULL END,
         agent_id = coalesce(a.agent_id, graph.propagation_attempts.agent_id),
         principal_id = coalesce(a.principal_id, graph.propagation_attempts.principal_id)
  RETURNING * INTO r;
  INSERT INTO graph.propagation_attempt_events (event_id, scope, tenant_id, domain_id, outbox_event_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, 'received', NULL,
          jsonb_build_object('delivery', r.deliveries, 'state', r.state, 'case_state', v_case_state, 'case_propagation_state', v_prop), p_correlation);
  RETURN jsonb_build_object('state', r.state, 'deliveries', r.deliveries, 'attempts', r.attempts, 'roots', r.roots, 'roots_walked', r.roots_walked,
    'case_state', v_case_state, 'case_propagation_state', v_prop,
    'agent', CASE WHEN a.agent_id IS NULL THEN NULL
                  ELSE jsonb_build_object('agent_id', a.agent_id, 'principal_id', a.principal_id, 'agent_version', a.agent_version, 'code_digest', a.code_digest, 'budgets', a.budgets) END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propagation_attempt_receive(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propagation_attempt_receive(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.propagation_attempt_finish(p_event_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_error text)
RETURNS text
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.propagation_attempts%ROWTYPE; v_prop text; v_state text; v_n int; v_walked int; v_error text := p_error;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_outcome NOT IN ('walked', 'failed') THEN
    RAISE EXCEPTION 'propagation attempt outcome is walked or failed' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM graph.propagation_attempts WHERE event_id = p_event_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'propagation attempt finish rejected: no attempt for event %', p_event_id USING ERRCODE = '23503'; END IF;
  IF r.state IN ('complete', 'partial') THEN RETURN r.state; END IF;   -- terminal already; a late finish changes nothing
  SELECT propagation_state INTO v_prop FROM observation.correction_current WHERE case_id = r.case_id;
  IF p_outcome = 'failed' THEN
    v_state := 'failed';
  ELSE
    v_n := jsonb_array_length(r.roots); v_walked := jsonb_array_length(r.roots_walked);
    -- THE DATABASE DECIDES COVERAGE (0027 §2): the attempt mirrors the case, it never computes it.
    v_state := CASE WHEN v_walked < v_n THEN 'failed' WHEN v_prop = 'complete' THEN 'complete' ELSE 'partial' END;
    IF v_walked < v_n THEN v_error := format('%s of %s corrected object(s) walked; the rest were not', v_walked, v_n); END IF;
    IF v_state = 'partial' AND v_error IS NULL THEN
      v_error := 'the walk was truncated at its traversal bound or left corrected objects uncovered; the case stays visible as awaiting and an operator may re-walk it';
    END IF;
  END IF;
  UPDATE graph.propagation_attempts SET state = v_state, last_error = left(v_error, 500), finished_at = clock_timestamp() WHERE event_id = p_event_id;
  INSERT INTO graph.propagation_attempt_events (event_id, scope, tenant_id, domain_id, outbox_event_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, v_state, r.principal_id,
          jsonb_build_object('error', left(v_error, 500), 'case_propagation_state', v_prop, 'attempts', r.attempts, 'deliveries', r.deliveries, 'roots_walked', jsonb_array_length(r.roots_walked)), r.correlation_id);
  RETURN v_state;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propagation_attempt_finish(uuid,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propagation_attempt_finish(uuid,uuid,uuid,text,text) TO eye_commit;

-- ============================================================
-- 6. The per-root checkpoint, INSIDE the walk's own transaction under the agent's authority.
--    The row lock taken here is held until record_impact commits, so two workers holding
--    the same event cannot walk one root twice.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.propagation_root_begin(p_event_id uuid, p_tenant uuid, p_domain uuid, p_root uuid)
RETURNS boolean
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.propagation_attempts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM graph.propagation_attempts WHERE event_id = p_event_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'propagation root rejected: no attempt for event %', p_event_id USING ERRCODE = '23503'; END IF;
  IF r.state IN ('complete', 'partial') THEN RETURN false; END IF;
  IF NOT (r.roots ? p_root::text) THEN
    RAISE EXCEPTION 'propagation root rejected: % is not a corrected object of case %', p_root, r.case_id USING ERRCODE = '22023';
  END IF;
  -- Already walked for this event: a typed skip, never a second walk.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r.roots_walked) w WHERE (w ->> 'root')::uuid = p_root) THEN RETURN false; END IF;
  IF r.principal_id IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'propagation root rejected: the walking principal is not the agent the attempt was received for' USING ERRCODE = '42501';
  END IF;
  UPDATE graph.propagation_attempts
     SET state = 'walking', attempts = CASE WHEN state = 'received' THEN attempts + 1 ELSE attempts END
   WHERE event_id = p_event_id;
  IF r.state = 'received' THEN
    INSERT INTO graph.propagation_attempt_events (event_id, scope, tenant_id, domain_id, outbox_event_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, 'walking', public.eye_principal(),
            jsonb_build_object('attempt', r.attempts + 1, 'agent_id', r.agent_id), r.correlation_id);
  END IF;
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propagation_root_begin(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propagation_root_begin(uuid,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.propagation_root_done(p_event_id uuid, p_tenant uuid, p_domain uuid, p_root uuid, p_invalidation_id uuid, p_truncated boolean)
RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.propagation_attempts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM graph.propagation_attempts WHERE event_id = p_event_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND OR r.state <> 'walking' THEN
    RAISE EXCEPTION 'propagation root rejected: attempt for event % is not walking', p_event_id USING ERRCODE = '22023';
  END IF;
  -- The attempt may claim only a walk that exists, is assessed, is linked to ITS case and is of THIS root.
  IF NOT EXISTS (SELECT 1 FROM graph.invalidations_current i
                  WHERE i.invalidation_id = p_invalidation_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain
                    AND i.correction_case_id = r.case_id AND i.trigger_kind = 'evidence_correction'
                    AND i.trigger_object_id = p_root AND i.state = 'assessed') THEN
    RAISE EXCEPTION 'propagation root rejected: invalidation % is not an assessed evidence_correction walk of % for case %', p_invalidation_id, p_root, r.case_id USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r.roots_walked) w WHERE (w ->> 'root')::uuid = p_root) THEN
    RAISE EXCEPTION 'propagation root rejected: % was already walked for event %', p_root, p_event_id USING ERRCODE = '23505';
  END IF;
  UPDATE graph.propagation_attempts
     SET roots_walked = roots_walked || jsonb_build_object('root', p_root, 'invalidation_id', p_invalidation_id, 'truncated', coalesce(p_truncated, false), 'at', clock_timestamp())
   WHERE event_id = p_event_id;
  INSERT INTO graph.propagation_attempt_events (event_id, scope, tenant_id, domain_id, outbox_event_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, 'root.walked', public.eye_principal(),
          jsonb_build_object('root', p_root, 'invalidation_id', p_invalidation_id, 'truncated', coalesce(p_truncated, false), 'agent_id', r.agent_id), r.correlation_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propagation_root_done(uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propagation_root_done(uuid,uuid,uuid,uuid,uuid,boolean) TO eye_commit;

-- ============================================================
-- 7. What a cold process must serve and re-drive (schedule capability; read-only; the
--    shape of observation.schedules_to_reconcile, 0038).
-- ============================================================
CREATE OR REPLACE FUNCTION graph.propagation_domains_to_serve()
RETURNS TABLE (tenant_id uuid, domain_id uuid, agent_id uuid, agent_version text, code_digest text, budgets jsonb)
SECURITY DEFINER SET search_path = graph, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY SELECT a.tenant_id, a.domain_id, a.agent_id, a.agent_version, a.code_digest, a.budgets
    FROM graph.propagation_agents a WHERE a.status = 'active' ORDER BY a.tenant_id, a.domain_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propagation_domains_to_serve() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propagation_domains_to_serve() TO eye_commit;

-- Applied cases whose propagation is not complete, in a domain with an active agent, whose
-- latest apply event has no attempt or a failed one. A case applied BEFORE this migration
-- carries a `CorrectionReceived` apply row (the apply path's event name until 0060, told
-- apart from a submission by a non-empty resolved scope); it is re-driven only when the
-- agent was registered with backlog_policy = 'walk'. The outbox is READ by this definer;
-- nothing in the objects schema changes.
CREATE OR REPLACE FUNCTION graph.propagations_to_reconcile()
RETURNS TABLE (tenant_id uuid, domain_id uuid, event_id uuid, case_id uuid, event_type text, correlation_id uuid, causation_id uuid, attempt_state text)
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT c.tenant_id, c.domain_id, o.id, c.case_id, o.event_type, o.correlation_id, o.causation_id, t.state
      FROM graph.propagation_agents a
      JOIN observation.correction_current c ON c.tenant_id = a.tenant_id AND c.domain_id = a.domain_id
       AND c.state = 'applied' AND c.propagation_state <> 'complete'
      JOIN LATERAL (
        SELECT x.id, x.event_type, x.correlation_id, x.causation_id FROM objects.object_outbox x
         WHERE x.tenant_id = c.tenant_id AND x.domain_id = c.domain_id AND (x.payload ->> 'case_id') = c.case_id::text
           AND (x.event_type = 'CorrectionApplied'
                OR (coalesce(a.budgets ->> 'backlog_policy', 'leave') = 'walk'
                    AND x.event_type = 'CorrectionReceived'
                    AND jsonb_array_length(coalesce(x.payload #> '{propagation_scope,resolved}', '[]'::jsonb)) > 0))
         ORDER BY x.created_at DESC LIMIT 1) o ON true
      LEFT JOIN graph.propagation_attempts t ON t.event_id = o.id
     WHERE a.status = 'active' AND (t.event_id IS NULL OR t.state = 'failed')
     ORDER BY c.received_at;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propagations_to_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propagations_to_reconcile() TO eye_commit;
