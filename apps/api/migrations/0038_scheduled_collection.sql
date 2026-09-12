-- 0038 · Scheduled collection: a bounded machine capability for the scheduler, the
-- persisted schedules it must reconcile at startup, and the record of every automatic
-- attempt — so that readiness can tell a configured schedule from an observed run.
--
-- WHY A NEW CAPABILITY. Migration 0011 removed ctx.issue_system and replaced it with
-- one operation-specific capability per machine path (publish, verify, identity_op,
-- bootstrap). The scheduler is such a path: at process start it must list the
-- persisted schedule entries of EVERY domain to restore them in Redis, and after each
-- job it must record what happened, whether or not a run was opened. Neither read nor
-- write has a human principal behind it, and neither may carry domain business
-- authority. So: mode 'schedule', operation class 'scheduler', one bound action, two
-- ports that assert exactly that capability and serve nothing else. The context is
-- granted to eye_commit, the pool the process already holds; no new database role and
-- no new credential.
--
-- WHAT IS NOT CHANGED. observation.scheduler_entries and its sched_scoped_names
-- constraint (the stored logical queue and scheduler identities) are untouched; the
-- Redis-facing names are derived in code and never persisted. The agent-authorized
-- acquisition path is untouched: a job still opens the agent's session from the
-- registry and re-verifies agent, contract version and lifecycle at execution.

-- ============================================================
-- 1. The context builder accepts the 'schedule' mode.
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.build(p_session uuid, p_principal uuid, p_scope text, p_tenant uuid, p_domain uuid, p_assurance text, p_purpose text, p_epoch bigint, p_mode text, p_opclass text, p_action text, p_target text, p_correlation uuid, p_policy_decision uuid, p_bundle text, p_ttl_seconds integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_nonce uuid := gen_random_uuid();
  -- clock_timestamp() is WALL CLOCK: transaction-stable now() cannot expire a
  -- context inside a long transaction (Gate-2.1 finding 6).
  v_iat timestamptz := clock_timestamp();
  v_exp timestamptz := clock_timestamp() + make_interval(secs => p_ttl_seconds);
  v_payload text;
BEGIN
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 300 THEN
    RAISE EXCEPTION 'context denied: ttl out of bounds' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('authority','evidence','publish','verify','identity_op','bootstrap','schedule') THEN
    RAISE EXCEPTION 'context denied: unknown mode %', p_mode USING ERRCODE = '42501';
  END IF;
  DELETE FROM ctx.issued WHERE expires_at < clock_timestamp() - interval '1 hour';
  INSERT INTO ctx.issued (nonce, session_id, expires_at, op_class, bound_action)
    VALUES (v_nonce, coalesce(p_session, '00000000-0000-0000-0000-000000000000'),
            v_exp, p_opclass, p_action);
  v_payload := concat_ws('|', 'v3',
    coalesce(p_session::text,''), coalesce(p_principal::text,''), p_scope,
    coalesce(p_tenant::text,''), coalesce(p_domain::text,''),
    coalesce(p_assurance,''), coalesce(p_purpose,''),
    to_char(v_iat, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    to_char(v_exp, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    v_nonce::text, coalesce(p_epoch,0)::text, p_mode, coalesce(p_opclass,''),
    coalesce(p_action,''), coalesce(p_target,''), coalesce(p_correlation::text,''),
    pg_backend_pid()::text, pg_current_xact_id()::text,
    coalesce(p_policy_decision::text,''), coalesce(p_bundle,''));
  RETURN v_payload || '|' || ctx.sign_payload(v_payload);
END $function$;

-- ============================================================
-- 1b. The live-authority check treats 'schedule' as the machine capability it is:
--     no session, no principal, scope fixed by the port — exactly like publish,
--     verify and bootstrap. Everything else in the function is unchanged.
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.assert_live_authority()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ctx', 'identity', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_mode text := public.eye_ctx_mode();
  v_session uuid := public.eye_session();
  v_principal uuid := public.eye_principal();
  v_scope text := public.eye_scope();
  v_tenant uuid := public.eye_tenant();
  v_domain uuid := public.eye_domain();
  v_epoch_ctx bigint := NULLIF(public.eye_ctx3(12), '')::bigint;
  s RECORD; v_epoch bigint; v_ok boolean;
BEGIN
  IF v_mode IN ('publish','verify','bootstrap','schedule') THEN
    RETURN;  -- machine capabilities carry no session; scope is fixed by the port
  END IF;
  -- identity_op is SESSION-LESS BY CONSTRUCTION: the request that most needs
  -- evidence is the one with no session at all (a failed login, a rejected
  -- envelope, a refused capability). Its authority is the identity role plus the
  -- operation allowlist plus the issuance record — not a session. The bound
  -- subject is EVIDENCE METADATA, and is deliberately not revalidated here: a
  -- deactivated principal's rejection must still be recordable, or deactivating a
  -- principal would silently switch off the evidence about it.
  IF v_mode = 'identity_op' THEN
    RETURN;
  END IF;
  IF v_session IS NULL OR v_principal IS NULL THEN
    RAISE EXCEPTION 'authority revoked: context carries no subject' USING ERRCODE = '42501';
  END IF;
  SELECT id, principal_id, status, expires_at, assurance INTO s
    FROM identity.sessions WHERE id = v_session FOR SHARE;
  IF s.id IS NULL OR s.status <> 'active' OR s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'authority revoked: session is not active' USING ERRCODE = '42501';
  END IF;
  IF s.principal_id IS DISTINCT FROM v_principal THEN
    RAISE EXCEPTION 'authority revoked: session/principal mismatch' USING ERRCODE = '42501';
  END IF;
  -- A bootstrap-assurance session may not ACT, but its refusals must still be
  -- recordable: evidence mode can only ever write denial/failure rows (see
  -- audit.commit_event and policy.commit_decision), so permitting it here cannot
  -- produce a fabricated success — while forbidding it would leave the one case
  -- that most needs evidence with none at all.
  IF s.assurance = 'bootstrap_rotation' AND v_mode NOT IN ('identity_op','evidence') THEN
    RAISE EXCEPTION 'authority revoked: bootstrap assurance cannot act' USING ERRCODE = '42501';
  END IF;
  SELECT revocation_epoch INTO v_epoch FROM identity.principals
   WHERE id = v_principal AND status = 'active' FOR SHARE;
  IF v_epoch IS NULL THEN
    RAISE EXCEPTION 'authority revoked: principal is not active' USING ERRCODE = '42501';
  END IF;
  IF v_epoch_ctx IS DISTINCT FROM v_epoch THEN
    RAISE EXCEPTION 'authority revoked: revocation epoch changed' USING ERRCODE = '42501';
  END IF;
  -- A CURRENT qualifying binding must still exist for the context's scope.
  IF v_scope = 'PLATFORM' THEN
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                    WHERE b.principal_id = v_principal AND b.scope = 'PLATFORM' AND b.revoked_at IS NULL)
      INTO v_ok;
  ELSIF v_scope = 'TENANT' THEN
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                    WHERE b.principal_id = v_principal AND b.revoked_at IS NULL
                      AND (b.scope = 'PLATFORM' OR (b.scope = 'TENANT' AND b.tenant_id = v_tenant)))
      INTO v_ok;
  ELSIF v_scope = 'DOMAIN' THEN
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                    WHERE b.principal_id = v_principal AND b.revoked_at IS NULL
                      AND (b.scope = 'PLATFORM'
                           OR (b.scope = 'TENANT' AND b.tenant_id = v_tenant)
                           OR (b.scope = 'DOMAIN' AND b.tenant_id = v_tenant AND b.domain_id = v_domain)))
      INTO v_ok;
  ELSE
    v_ok := false;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'authority revoked: no current qualifying binding' USING ERRCODE = '42501';
  END IF;
END $function$;

-- ============================================================
-- 2. The scheduler's capability: one mode, one operation class, one action.
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.issue_schedule(p_reason text, p_ttl_seconds int DEFAULT 60)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_reason IS NULL OR length(p_reason) < 3 THEN
    RAISE EXCEPTION 'schedule capability requires a reason' USING ERRCODE = '42501';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 300 THEN
    RAISE EXCEPTION 'schedule capability ttl out of bounds' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    NULL, NULL, 'NONE', NULL, NULL, 'machine', 'observation.scheduling', 0,
    'schedule', 'scheduler', 'observation.schedule.reconcile', '*',
    NULL, NULL, NULL, p_ttl_seconds), true);
  PERFORM set_config('eye.ctx_reason', p_reason, true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_schedule(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_schedule(text, int) TO eye_commit;

-- ============================================================
-- 3. Every automatic attempt, whether or not a run was opened.
-- ============================================================
CREATE TABLE observation.scheduled_attempts (
  attempt_id       uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  source_id        uuid NOT NULL,
  contract_version int  NOT NULL,
  scheduler_id     text NOT NULL,
  job_id           text NOT NULL,
  trigger          text NOT NULL CHECK (trigger IN ('scheduler')),
  started_at       timestamptz NOT NULL,
  finished_at      timestamptz NOT NULL,
  -- finished/failed/cancelled/budget_exceeded: a run was opened and ended so;
  -- refused: no run was opened (agent revoked, contract inactive, connector mismatch, grant refused).
  outcome          text NOT NULL CHECK (outcome IN ('finished', 'failed', 'cancelled', 'budget_exceeded', 'refused')),
  run_id           uuid,
  reason           text,
  items_admitted   int NOT NULL DEFAULT 0,
  items_noop       int NOT NULL DEFAULT 0,
  items_quarantined int NOT NULL DEFAULT 0,
  CONSTRAINT sa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sa_run_iff_opened CHECK ((outcome = 'refused') = (run_id IS NULL))
);
CREATE INDEX scheduled_attempts_source_idx ON observation.scheduled_attempts (source_id, started_at DESC);
ALTER TABLE observation.scheduled_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation.scheduled_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY observation_isolation ON observation.scheduled_attempts
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON observation.scheduled_attempts TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION observation.record_scheduled_attempt(
  p_attempt_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int,
  p_scheduler_id text, p_job_id text, p_started_at timestamptz, p_finished_at timestamptz,
  p_outcome text, p_run_id uuid, p_reason text, p_admitted int, p_noop int, p_quarantined int
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_tenant IS NULL OR p_domain IS NULL THEN
    RAISE EXCEPTION 'scheduled attempt requires a tenant and a domain' USING ERRCODE = '23514';
  END IF;
  INSERT INTO observation.scheduled_attempts (
    attempt_id, scope, tenant_id, domain_id, source_id, contract_version, scheduler_id, job_id,
    trigger, started_at, finished_at, outcome, run_id, reason, items_admitted, items_noop, items_quarantined
  ) VALUES (
    p_attempt_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, p_scheduler_id, p_job_id,
    'scheduler', p_started_at, p_finished_at, p_outcome, p_run_id, left(p_reason, 500),
    coalesce(p_admitted, 0), coalesce(p_noop, 0), coalesce(p_quarantined, 0));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_scheduled_attempt(uuid,uuid,uuid,uuid,int,text,text,timestamptz,timestamptz,text,uuid,text,int,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_scheduled_attempt(uuid,uuid,uuid,uuid,int,text,text,timestamptz,timestamptz,text,uuid,text,int,int,int) TO eye_commit;

-- ============================================================
-- 4. The persisted schedules the scheduler must serve — eligible ones only.
-- ============================================================
-- An entry is eligible when it is 'scheduled', its exact contract version is ACTIVE,
-- LIVE and rights-CONFIRMED, and the source has an ACTIVE agent for that connector
-- kind. Everything else is returned nowhere: a schedule for a superseded or
-- suspended contract is not restored, and nothing here changes its row. The port
-- returns technical scheduling facts and the agent's identity — no evidence, no
-- contract body beyond budgets — and the worker re-verifies all of it at execution.
CREATE OR REPLACE FUNCTION observation.schedules_to_reconcile()
RETURNS TABLE (
  tenant_id uuid, domain_id uuid, source_id uuid, contract_version int,
  scheduler_id text, queue_name text, cadence_seconds int, jitter_seconds int,
  connector_kind text, agent_id uuid, agent_version text, code_digest text, budgets jsonb
)
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT e.tenant_id, e.domain_id, e.source_id, e.contract_version,
           e.scheduler_id, e.queue_name, e.cadence_seconds, e.jitter_seconds,
           c.connector_kind, a.agent_id, a.agent_version, a.code_digest,
           coalesce(c.contract #> '{security_and_operations,budgets}', '{}'::jsonb)
      FROM observation.scheduler_entries e
      JOIN observation.source_contracts_current c
        ON c.source_id = e.source_id AND c.contract_version = e.contract_version
      JOIN LATERAL (
        SELECT ag.agent_id, ag.agent_version, ag.code_digest
          FROM observation.agents ag
         WHERE ag.source_id = e.source_id AND ag.status = 'active'
           AND ag.connector = 'observation.' || c.connector_kind
         ORDER BY ag.created_at DESC LIMIT 1) a ON true
     WHERE e.status = 'scheduled'
       AND c.lifecycle_state = 'active'
       AND c.acquisition_mode = 'live'
       AND c.rights_state = 'confirmed'
     ORDER BY e.tenant_id, e.domain_id, e.source_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.schedules_to_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.schedules_to_reconcile() TO eye_commit;
