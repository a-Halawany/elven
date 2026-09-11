-- ============================================================
-- 0057 · A run session lives as long as the run makes progress.
--
-- THE FINDING (demonstration, 2026-09-10 23:17–23:32 UTC; SOURCE_INTEGRATION_STATUS.md
-- §9.11.7 item 3, recorded then as "the scheduled chokepoints walk stalled mid-page"):
-- the walk did not stall. Its agent run session was opened with a FIXED expiry —
-- max(eye.identity.access_ttl_seconds, 900) = 15 minutes — and the walk, 12,856 run
-- events at about five admissions a second, outlived it: at 23:32:31.094, exactly 900 s
-- after the session opened at 23:17:31.021, the next admission was refused
-- ("authority insufficient for this operation"), the lifecycle's terminal `run.failed`
-- was refused for the same reason and swallowed, the run projection stayed `started`,
-- and the source lease sat until its own expiry. The worker's attempt row recorded the
-- failure and its reason; the run's own ledger did not, which is why it read as a stall.
--
-- THE CORRECTION. A run session is not a standing credential and still is not one:
-- it opens with the same bounded expiry, and it is EXTENDED only by the run's own
-- progress — the same principle as the source lease of 0051, whose heartbeat is the
-- run's events. `identity.agent_session_extend` re-verifies the grant exactly as
-- `agent_session_open` did (agent active, instance and code digest as registered,
-- principal an active agent) and moves the session's expiry forward to the requested
-- instant, never backward; the lifecycle calls it through the identity authority after
-- every committed page checkpoint. A run that stops making progress keeps its bounded
-- expiry; a run that keeps walking keeps its authority.
--
-- Forward only. `agent_session_open` is untouched.
-- ============================================================
CREATE OR REPLACE FUNCTION identity.agent_session_extend(
  p_session uuid, p_agent_id uuid, p_tenant uuid, p_domain uuid,
  p_agent_version text, p_code_digest text, p_expires_at timestamptz
) RETURNS timestamptz
SECURITY DEFINER SET search_path = identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a observation.agents%ROWTYPE; s identity.sessions%ROWTYPE; v_kind text; v_status text; v_new timestamptz;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'agent session extension denied: identity operation capability required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at > clock_timestamp() + interval '1 day' THEN
    RAISE EXCEPTION 'agent session extension denied: an extension is bounded to one day ahead' USING ERRCODE = '42501';
  END IF;

  -- The grant, re-verified as at opening: an agent revoked mid-run gets no more authority.
  SELECT * INTO a FROM observation.agents
   WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent session extension denied: no such agent in this domain' USING ERRCODE = '42501';
  END IF;
  IF a.status <> 'active' THEN
    RAISE EXCEPTION 'agent session extension denied: agent grant is revoked' USING ERRCODE = '42501';
  END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'agent session extension denied: agent instance or code digest does not match the registration'
      USING ERRCODE = '42501';
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
REVOKE ALL ON FUNCTION identity.agent_session_extend(uuid,uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.agent_session_extend(uuid,uuid,uuid,uuid,text,text,timestamptz) TO eye_identity;

-- ============================================================
-- 2. The outbox publisher's capability is issued and consumed in ONE backend call.
--
-- THE FINDING (demonstration, 2026-09-10, during the governed correction of the 2,133
-- duplicate copies; SOURCE_INTEGRATION_STATUS.md §9.11.7 item 2): the API process ended on
-- an unhandled rejection from OutboxPublisher.publishPending — `capability denied: mode
-- publish required (context is none)`, raised by ctx.assert_capability inside
-- objects.outbox_lease. The publisher issued its context (ctx.issue_publish) and leased
-- in two round trips of one transaction; a publish context carries a 60-second wall-clock
-- expiry, so a process that stalls between the two — the correction was one multi-minute
-- transaction on the same process — arrives at the lease with an EXPIRED context, which
-- eye_ctx3 reads as no context at all. The publisher had no catch on that first
-- transaction, and the interval callback's rejection was nobody's, so Node ended the
-- process.
--
-- THE CORRECTION, at the database boundary: one function issues the publish capability
-- and takes (or acknowledges) the lease in the same backend call, so nothing can elapse
-- between issuance and use. The publisher's ports are otherwise unchanged and remain the
-- only mutation available to eye_publisher; the wrappers are granted to that role alone
-- and call the same SECURITY DEFINER ports. (The process-side correction — the tick never
-- escapes as an unhandled rejection; a refused tick is reported and retried — is in
-- apps/api/src/objects/outbox.publisher.ts.)
-- ============================================================
CREATE OR REPLACE FUNCTION objects.outbox_lease_as_publisher(p_limit int, p_lease_seconds int DEFAULT 60)
RETURNS TABLE (id uuid, lease_id uuid, event_type text, payload jsonb,
               correlation_id uuid, causation_id uuid, tenant_id uuid, domain_id uuid)
SECURITY DEFINER SET search_path = objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.issue_publish(NULL::uuid);
  RETURN QUERY SELECT * FROM objects.outbox_lease(p_limit, p_lease_seconds);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_lease_as_publisher(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_lease_as_publisher(int, int) TO eye_publisher;

CREATE OR REPLACE FUNCTION objects.outbox_ack_as_publisher(p_id uuid, p_lease_id uuid, p_from text, p_to text)
RETURNS boolean
SECURITY DEFINER SET search_path = objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.issue_publish(p_id);
  RETURN objects.outbox_ack_leased(p_id, p_lease_id, p_from, p_to);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_ack_as_publisher(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_ack_as_publisher(uuid, uuid, text, text) TO eye_publisher;

-- Every capability issuance deletes contexts that expired more than an hour ago from
-- ctx.issued; the table had no index on expires_at, so that delete was a sequential
-- scan on every governed operation. Hygiene, not a correction of the finding above.
CREATE INDEX IF NOT EXISTS issued_expires_at_idx ON ctx.issued (expires_at);
