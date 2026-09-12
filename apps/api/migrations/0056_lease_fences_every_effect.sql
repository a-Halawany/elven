-- ============================================================
-- 0056 · The source run lease fences EVERY effect, not only `run.started`.
--
-- The reviewer's reproduction (2026-09-11, R3, on the unchanged 0051/0052 functions):
-- A acquires and starts; A stops reporting past its lease; B takes the expired lease
-- over (recorded, `took_over_from = A`); A resumes — and A's `item.admitted` was
-- accepted, A's fresh `claim_item_admission` answered `admitted`, and both run
-- projections stayed `started`. 0051 checked the lease at `run.started` only; every
-- later event updated the projection and then heartbeat-updated the lease row WHERE
-- run_id = its own, without noticing that zero rows matched. A run that had lost the
-- source could not renew or release B's lease (both statements were scoped to its own
-- run id), but it could keep admitting.
--
-- THE FENCE. One function, `observation.assert_run_holds_source`, locks the source's
-- lease row FOR UPDATE — the same lock `acquire_source_run_lease` takes, so an
-- effect and a takeover are ORDERED by the database, never interleaved — and raises
-- unless the row names the calling run AND the lease has not expired. It is called:
--
--   * by `append_run_event` for every event that is neither `run.started` (0051's
--     own check) nor TERMINAL. `item.fetched`, `item.admitted`, `item.revised`,
--     `item.quarantined`, `item.noop`, `run.checkpointed` and every other progress
--     event are effects of a walk, and a walk that lost the source has no business
--     recording them;
--   * by `claim_item_admission`, INSIDE the admitting transaction, before the
--     register row is read — so a late result from work that was in flight when the
--     lease changed hands is refused before it can claim anything.
--
-- TERMINAL EVENTS ARE NOT FENCED. `run.failed`, `run.cancelled`, `run.finished` and
-- `run.budget_exceeded` record how a run ENDED; a displaced run must be able to say
-- that it was displaced (the lifecycle records `run.failed` with the refusal as its
-- reason), and the sweeper must be able to close a run whose process died. The
-- release clause is unchanged: a terminal event deletes the lease WHERE run_id is the
-- run's own, so a displaced run's ending never touches the holder's lease.
--
-- AN EXPIRED HOLDER IS FENCED TOO. A run whose own heartbeat is older than its lease
-- has, by the lease's own definition, stopped reporting: anyone may take the source
-- from it at any instant. Letting it continue on the strength of "nobody has taken it
-- yet" would make the outcome depend on the race. It is refused with a distinct
-- reason and must RE-ACQUIRE — `acquire_source_run_lease` already grants the same
-- run its own lease again (reentrant) and refreshes the heartbeat — or end. A walk
-- whose single page takes longer than `eye.connector.run_lease_seconds` (900 s) ends
-- as `failed` with that reason and the next attempt resumes from the page checkpoint.
--
-- Forward only. `append_run_event` and `claim_item_admission` are replaced in full;
-- their 0051/0052 bodies are unchanged apart from the fence, marked below. The lease
-- table, acquire and release are untouched.
-- ============================================================

CREATE OR REPLACE FUNCTION observation.assert_run_holds_source(
  p_source_id uuid, p_run_id uuid, p_effect text
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_held observation.source_run_leases%ROWTYPE;
BEGIN
  -- The row is the mutex (0051 §1): FOR UPDATE orders this effect against any
  -- concurrent acquire, so a takeover either happened before this check or waits
  -- until this transaction has committed.
  SELECT * INTO v_held FROM observation.source_run_leases
   WHERE source_id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'run rejected: % refused — run % holds no source run lease (the source is not held by any run; the lease was released or taken over and released)',
      p_effect, p_run_id
      USING ERRCODE = '55P03';
  END IF;
  IF v_held.run_id <> p_run_id THEN
    RAISE EXCEPTION
      'run rejected: % refused — run % no longer holds the source run lease (held by run % since %, took over from %): a run that lost its lease may not admit, progress or checkpoint',
      p_effect, p_run_id, v_held.run_id,
      to_char(v_held.acquired_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      coalesce(v_held.took_over_from::text, '(a clean claim)')
      USING ERRCODE = '55P03';
  END IF;
  IF v_held.heartbeat_at + make_interval(secs => v_held.lease_seconds) < clock_timestamp() THEN
    RAISE EXCEPTION
      'run rejected: % refused — run % holds an EXPIRED source run lease (last heartbeat %, lease % s): it must re-acquire the lease before any further effect, or end',
      p_effect, p_run_id,
      to_char(v_held.heartbeat_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      v_held.lease_seconds
      USING ERRCODE = '55P03';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.assert_run_holds_source(uuid,uuid,text) FROM PUBLIC;
-- Called only from the two SECURITY DEFINER ports below; no role executes it directly.

-- ============================================================
-- 1. `append_run_event`, replaced: progress is fenced; terminal events are not.
-- ============================================================
CREATE OR REPLACE FUNCTION observation.append_run_event(
  p_event_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_source_id uuid,
  p_contract_version int, p_agent_principal uuid, p_agent_version text, p_code_digest text,
  p_connector text, p_connector_version text, p_acquisition_mode text,
  p_event text, p_details jsonb, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_terminal boolean := p_event IN ('run.finished', 'run.failed', 'run.cancelled', 'run.budget_exceeded');
  v_lease uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY[
    'observation.run.start', 'observation.item.admit', 'observation.item.quarantine',
    'observation.run.checkpoint', 'observation.run.finish', 'observation.run.cancel',
    'observation.sweeper.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  IF p_event = 'run.started' THEN
    -- 0051, clause 1: no run opens without the source's lease.
    SELECT run_id INTO v_lease FROM observation.source_run_leases
     WHERE source_id = p_source_id AND run_id = p_run_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION
        'run rejected: a collection run for this source may only open while holding the source run lease (run % holds none)', p_run_id
        USING ERRCODE = '55P03';
    END IF;
    INSERT INTO observation.collection_runs_current (
      run_id, scope, tenant_id, domain_id, source_id, contract_version,
      agent_principal_id, agent_version, code_digest, connector, connector_version,
      acquisition_mode, state, started_at, last_event_at
    ) VALUES (
      p_run_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
      p_agent_principal, p_agent_version, p_code_digest, p_connector, p_connector_version,
      p_acquisition_mode, 'started', clock_timestamp(), clock_timestamp());
  ELSE
    -- ── 0056: EVERY NON-TERMINAL EVENT IS AN EFFECT OF THE RUN THAT HOLDS THE SOURCE ──
    -- Checked BEFORE the projection is touched, under the lease row's lock.
    IF NOT v_terminal THEN
      PERFORM observation.assert_run_holds_source(p_source_id, p_run_id, p_event);
    END IF;
    UPDATE observation.collection_runs_current
       SET last_event_at = clock_timestamp(),
           items_fetched     = items_fetched     + (p_event = 'item.fetched')::int,
           items_admitted    = items_admitted    + (p_event = 'item.admitted')::int,
           items_quarantined = items_quarantined + (p_event = 'item.quarantined')::int,
           items_noop        = items_noop        + (p_event = 'item.noop')::int,
           state = CASE
             WHEN p_event = 'run.finished'        THEN 'finished'
             WHEN p_event = 'run.failed'          THEN 'failed'
             WHEN p_event = 'run.cancelled'       THEN 'cancelled'
             WHEN p_event = 'run.budget_exceeded' THEN 'budget_exceeded'
             ELSE state END,
           finished_at = CASE WHEN v_terminal THEN clock_timestamp() ELSE finished_at END,
           failure_reason = CASE WHEN v_terminal AND p_event <> 'run.finished'
                                 THEN coalesce(p_details ->> 'reason', failure_reason)
                                 ELSE failure_reason END
     WHERE run_id = p_run_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'run event rejected: no started run % in this domain', p_run_id USING ERRCODE = '23503';
    END IF;
    -- 0051, clause 2: the run's own events are its heartbeat (its own lease only).
    UPDATE observation.source_run_leases
       SET heartbeat_at = clock_timestamp()
     WHERE source_id = p_source_id AND run_id = p_run_id;
    -- 0051, clause 3: a terminal event releases the source (its own lease only —
    -- a displaced run's ending never touches the holder's lease).
    IF v_terminal THEN
      DELETE FROM observation.source_run_leases
       WHERE source_id = p_source_id AND run_id = p_run_id;
    END IF;
  END IF;

  INSERT INTO observation.collection_run_events (
    event_id, scope, tenant_id, domain_id, run_id, source_id, contract_version,
    agent_principal_id, agent_version, code_digest, connector, connector_version,
    acquisition_mode, event, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_source_id, p_contract_version,
    p_agent_principal, p_agent_version, p_code_digest, p_connector, p_connector_version,
    p_acquisition_mode, p_event, p_details, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.append_run_event(uuid,uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,text,text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.append_run_event(uuid,uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,text,text,jsonb,uuid) TO eye_commit;

-- ============================================================
-- 2. `claim_item_admission`, replaced: the claim is fenced before the register is read.
-- ============================================================
CREATE OR REPLACE FUNCTION observation.claim_item_admission(
  p_tenant uuid, p_domain uuid, p_source_id uuid, p_item_key text,
  p_content_digest text, p_evd_object_id uuid, p_obs_object_id uuid,
  p_object_version int, p_contract_version int, p_run_id uuid,
  p_readmit_unavailable boolean DEFAULT false
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_held observation.admitted_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.item.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  -- ── 0056: ONLY THE RUN THAT HOLDS THE SOURCE MAY CLAIM AN ADMISSION ──────────
  -- Under the lease row's lock, inside the admitting transaction: a late result from
  -- work that was in flight when the lease changed hands is refused here, before it
  -- reads — let alone writes — the register.
  PERFORM observation.assert_run_holds_source(p_source_id, p_run_id, 'item admission claim');

  SELECT * INTO v_held FROM observation.admitted_items
   WHERE source_id = p_source_id AND item_key = p_item_key FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO observation.admitted_items (
      source_id, item_key, scope, tenant_id, domain_id, content_digest,
      evd_object_id, obs_object_id, object_version, contract_version, run_id
    ) VALUES (
      p_source_id, p_item_key, 'DOMAIN', p_tenant, p_domain, p_content_digest,
      p_evd_object_id, p_obs_object_id, p_object_version, p_contract_version, p_run_id);
    RETURN jsonb_build_object('outcome', 'admitted', 'evd_object_id', p_evd_object_id,
                              'object_version', p_object_version);
  END IF;

  -- 0052: what is held cannot be reused; the caller established that by reading.
  IF p_readmit_unavailable THEN
    UPDATE observation.admitted_items
       SET content_digest = p_content_digest, evd_object_id = p_evd_object_id,
           obs_object_id = p_obs_object_id, object_version = p_object_version,
           contract_version = p_contract_version, run_id = p_run_id,
           last_admitted_at = clock_timestamp()
     WHERE source_id = p_source_id AND item_key = p_item_key;
    RETURN jsonb_build_object('outcome', 'admitted', 'evd_object_id', p_evd_object_id,
                              'object_version', p_object_version,
                              'replaced_evd_object_id', v_held.evd_object_id,
                              'replaced_object_version', v_held.object_version);
  END IF;

  IF v_held.content_digest = p_content_digest THEN
    RETURN jsonb_build_object('outcome', 'noop', 'evd_object_id', v_held.evd_object_id,
                              'object_version', v_held.object_version,
                              'content_digest', v_held.content_digest,
                              'first_admitted_at', to_char(v_held.first_admitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                              'run_id', v_held.run_id);
  END IF;

  IF v_held.evd_object_id = p_evd_object_id AND p_object_version = v_held.object_version + 1 THEN
    UPDATE observation.admitted_items
       SET content_digest = p_content_digest, obs_object_id = p_obs_object_id,
           object_version = p_object_version, contract_version = p_contract_version,
           run_id = p_run_id, last_admitted_at = clock_timestamp(), revisions = revisions + 1
     WHERE source_id = p_source_id AND item_key = p_item_key;
    RETURN jsonb_build_object('outcome', 'revised', 'evd_object_id', p_evd_object_id,
                              'object_version', p_object_version,
                              'prior_digest', v_held.content_digest);
  END IF;

  RETURN jsonb_build_object('outcome', 'conflict',
                            'held_evd_object_id', v_held.evd_object_id,
                            'held_object_version', v_held.object_version,
                            'held_digest', v_held.content_digest,
                            'held_run_id', v_held.run_id,
                            'claimed_evd_object_id', p_evd_object_id,
                            'claimed_object_version', p_object_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.claim_item_admission(uuid,uuid,uuid,text,text,uuid,uuid,int,int,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.claim_item_admission(uuid,uuid,uuid,text,text,uuid,uuid,int,int,uuid,boolean) TO eye_commit;
