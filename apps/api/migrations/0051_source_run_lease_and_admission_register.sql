-- ============================================================
-- 0051 · Two P1 defects of SOURCE_INTEGRATION_STATUS.md §9.6.1, at the database
--       boundary, where they hold for every caller.
--
-- P1-1  ONE COLLECTION RUN PER SOURCE AT A TIME.
--       `eye.connector.per_source_concurrency` is a BullMQ worker setting: it bounds
--       what the WORKER runs, and says nothing about the operator route, which runs
--       the governed path in the API process. On 2026-09-10 an operator trigger was
--       accepted while a scheduled walk was in flight and both walked the same window.
--       A cap in one caller cannot serialise two callers; the condition therefore
--       lives here, as a UNIQUENESS CONDITION ON THE OPEN ATTEMPT — one lease row per
--       source, primary-keyed by the source — and `run.started` is refused unless the
--       run holds it. An operator route, a scheduler tick, a future caller nobody has
--       written yet: all three meet the same row.
--
--       A LEASE IS NOT A LOCK THAT CAN BE LOST. It carries a heartbeat and an
--       expiry, so a run whose process died does not hold a source forever: the next
--       attempt takes an EXPIRED lease over and the takeover is recorded on the row
--       it replaces, rather than being silently indistinguishable from a first claim.
--
-- P1-2  ADMISSION IDEMPOTENCY ON THE IDENTITY THAT MATTERS.
--       `attempt_key_unique` is (source, contract version, run, item key): it stops
--       the SAME run admitting an item twice and nothing else. A new run — a
--       crash-retry, a concurrent walk, a re-walk after an interruption — carries a
--       new run id and passes straight through it. What must not happen twice is not
--       an attempt but an ADMISSION OF THE SAME CONTENT UNDER THE SAME ITEM KEY, so
--       the register below is keyed by (source, item key) and carries the digest
--       currently held under it. The claim runs INSIDE the admitting transaction, so
--       a concurrent admission is serialised by the row rather than by a read made
--       minutes earlier.
--
--       PHASE 1'S RULE IS PRESERVED, NOT WEAKENED. "Identical bytes at a later
--       observation time are a NEW observation" is about a FORWARD POLL, whose item
--       key carries the retrieval instant and never repeats. Only DETERMINISTIC items
--       — a backfill window, or a row framed out of one — are registered here, and
--       for those the plan's rule is already the opposite (§5.12, Phase 4 §4a):
--       retrieving 2019-01 again with the same digest is the same observation of the
--       same window and no-ops. This makes that rule hold at admission instead of at
--       a read taken before the page was walked.
--
--       A REVISION IS STILL A REVISION. Different bytes under a held key update the
--       register to the next version of the SAME evidence object, exactly as the
--       lifecycle already admits it. A claim that names a different evidence object,
--       or a version that is not the next one, is a CONFLICT — the answer a second
--       concurrent walk gets — and is reported, never overwritten.
--
-- Forward only. Nothing here edits an applied migration; `append_run_event` is
-- replaced in full (its Phase 1 body is unchanged apart from the lease clauses).
-- ============================================================

-- ============================================================
-- 1. The per-source run lease.
-- ============================================================
CREATE TABLE observation.source_run_leases (
  -- ONE ROW PER SOURCE. The primary key IS the serialisation: a second attempt does
  -- not get to decide whether it may run, it gets a unique-key answer from the database.
  source_id        uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  run_id           uuid NOT NULL,
  contract_version int  NOT NULL,
  trigger_kind     text NOT NULL CHECK (trigger_kind IN ('operator', 'scheduler', 'sweeper')),
  acquired_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Advanced by every run event the holder appends. A lease whose holder stopped
  -- appending events for longer than `lease_seconds` is stale and may be taken over.
  heartbeat_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_seconds    int NOT NULL CHECK (lease_seconds BETWEEN 30 AND 86400),
  -- What this lease displaced, when it displaced an expired one. Null for a clean claim.
  took_over_from   uuid,
  correlation_id   uuid NOT NULL,
  CONSTRAINT lease_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
ALTER TABLE observation.source_run_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation.source_run_leases FORCE ROW LEVEL SECURITY;
CREATE POLICY observation_isolation ON observation.source_run_leases
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON observation.source_run_leases TO eye_app, eye_commit;

/*
 * Claim the source. Returns the answer as jsonb so a refusal carries WHO holds the
 * source and since when — an operator told "refused" and nothing else cannot tell a
 * live walk from a stuck one.
 *
 *   {"granted": true,  "run_id": …, "took_over_from": … | null}
 *   {"granted": false, "refusal_class": "source_run_in_flight",
 *    "holder_run_id": …, "holder_trigger": …, "holder_contract_version": …,
 *    "acquired_at": …, "heartbeat_at": …, "expires_at": …}
 *
 * The same run claiming its own lease again is granted (idempotent re-entry).
 */
CREATE OR REPLACE FUNCTION observation.acquire_source_run_lease(
  p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int,
  p_run_id uuid, p_trigger text, p_lease_seconds int, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_held observation.source_run_leases%ROWTYPE;
  v_expired boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.run.start']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  -- The row is the mutex. Taking it FOR UPDATE means two claims arriving together
  -- are ordered by the database, not by whichever process read first.
  SELECT * INTO v_held FROM observation.source_run_leases
   WHERE source_id = p_source_id FOR UPDATE;

  IF FOUND THEN
    IF v_held.run_id = p_run_id THEN
      UPDATE observation.source_run_leases
         SET heartbeat_at = clock_timestamp()
       WHERE source_id = p_source_id;
      RETURN jsonb_build_object('granted', true, 'run_id', p_run_id, 'took_over_from', NULL, 'reentrant', true);
    END IF;
    v_expired := v_held.heartbeat_at + make_interval(secs => v_held.lease_seconds) < clock_timestamp();
    IF NOT v_expired THEN
      RETURN jsonb_build_object(
        'granted', false,
        'refusal_class', 'source_run_in_flight',
        'holder_run_id', v_held.run_id,
        'holder_trigger', v_held.trigger_kind,
        'holder_contract_version', v_held.contract_version,
        'acquired_at', to_char(v_held.acquired_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'heartbeat_at', to_char(v_held.heartbeat_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'expires_at', to_char((v_held.heartbeat_at + make_interval(secs => v_held.lease_seconds)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    END IF;
    -- EXPIRED. The holder stopped reporting; the source is released to this attempt
    -- and the takeover is recorded, so a stuck run is visible as a takeover rather
    -- than as a claim that met nothing.
    UPDATE observation.source_run_leases
       SET run_id = p_run_id, contract_version = p_contract_version, trigger_kind = p_trigger,
           acquired_at = clock_timestamp(), heartbeat_at = clock_timestamp(),
           lease_seconds = p_lease_seconds, took_over_from = v_held.run_id,
           correlation_id = p_correlation
     WHERE source_id = p_source_id;
    RETURN jsonb_build_object('granted', true, 'run_id', p_run_id, 'took_over_from', v_held.run_id);
  END IF;

  INSERT INTO observation.source_run_leases (
    source_id, scope, tenant_id, domain_id, run_id, contract_version, trigger_kind,
    lease_seconds, correlation_id
  ) VALUES (
    p_source_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_contract_version,
    coalesce(p_trigger, 'operator'), coalesce(p_lease_seconds, 900), p_correlation);
  RETURN jsonb_build_object('granted', true, 'run_id', p_run_id, 'took_over_from', NULL);
EXCEPTION WHEN unique_violation THEN
  -- Two first claims raced to the INSERT. The loser is refused, exactly as it would
  -- have been had it read the row a moment later.
  SELECT * INTO v_held FROM observation.source_run_leases WHERE source_id = p_source_id;
  RETURN jsonb_build_object(
    'granted', false, 'refusal_class', 'source_run_in_flight',
    'holder_run_id', v_held.run_id, 'holder_trigger', v_held.trigger_kind,
    'holder_contract_version', v_held.contract_version,
    'acquired_at', to_char(v_held.acquired_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'heartbeat_at', to_char(v_held.heartbeat_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expires_at', to_char((v_held.heartbeat_at + make_interval(secs => v_held.lease_seconds)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.acquire_source_run_lease(uuid,uuid,uuid,int,uuid,text,int,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.acquire_source_run_lease(uuid,uuid,uuid,int,uuid,text,int,uuid) TO eye_commit;

/* Release the lease this run holds. Releasing a lease held by another run is a no-op. */
CREATE OR REPLACE FUNCTION observation.release_source_run_lease(
  p_tenant uuid, p_domain uuid, p_source_id uuid, p_run_id uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_deleted int;
BEGIN
  PERFORM observation.assert_authority(ARRAY[
    'observation.run.start', 'observation.run.finish', 'observation.run.cancel',
    'observation.run.checkpoint', 'observation.sweeper.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  DELETE FROM observation.source_run_leases
   WHERE source_id = p_source_id AND run_id = p_run_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.release_source_run_lease(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.release_source_run_lease(uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 2. `append_run_event`, replaced: the lease is the precondition of `run.started`.
-- ============================================================
/*
 * Unchanged from migration 0022 except for three clauses, marked below. Putting the
 * check HERE rather than in the service is the whole point: the lease cannot be
 * skipped by a caller that forgot it, because opening a run is the only way to
 * collect and this is the only way to open one.
 */
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

  -- run.started is the ONLY event that may create the projection row, and it
  -- shares this transaction with POL + AUD (F05/F06).
  IF p_event = 'run.started' THEN
    -- ── 0051, clause 1: NO RUN OPENS WITHOUT THE SOURCE'S LEASE ────────────────
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
    -- ── 0051, clause 2: THE RUN'S OWN EVENTS ARE ITS HEARTBEAT ─────────────────
    -- A walk that is progressing says so by doing its work; nothing separate has to
    -- remember to renew, and nothing renews a run that has stopped.
    UPDATE observation.source_run_leases
       SET heartbeat_at = clock_timestamp()
     WHERE source_id = p_source_id AND run_id = p_run_id;
    -- ── 0051, clause 3: A TERMINAL EVENT RELEASES THE SOURCE ───────────────────
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
-- 3. The admission register: one row per (source, deterministic item key).
-- ============================================================
CREATE TABLE observation.admitted_items (
  source_id        uuid NOT NULL,
  item_key         text NOT NULL,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  -- The digest CURRENTLY held under this key. Equal incoming bytes are a no-op;
  -- different bytes are a revision of the same evidence object.
  content_digest   text NOT NULL,
  evd_object_id    uuid NOT NULL,
  obs_object_id    uuid,
  object_version   int  NOT NULL,
  contract_version int  NOT NULL,
  run_id           uuid,
  first_admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_admitted_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  revisions        int NOT NULL DEFAULT 0,
  PRIMARY KEY (source_id, item_key),
  CONSTRAINT admitted_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
ALTER TABLE observation.admitted_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation.admitted_items FORCE ROW LEVEL SECURITY;
CREATE POLICY observation_isolation ON observation.admitted_items
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON observation.admitted_items TO eye_app, eye_commit;
-- NOT stamped as a business effect: this is a projection of the admission written in
-- the admission's own transaction, exactly like collection_runs_current. Stamping it
-- would count one effect twice.

/*
 * Claim the admission of one deterministic item, INSIDE the admitting transaction.
 *
 *   {"outcome": "admitted", …}  nothing was held under this key: the caller's
 *                               evidence object is now the one held.
 *   {"outcome": "revised",  …}  different bytes under a held key, and the caller
 *                               named the next version of the SAME object: accepted.
 *   {"outcome": "noop", "evd_object_id": …, "object_version": …}
 *                               these exact bytes are already held under this key.
 *                               The caller admits nothing and records the no-op.
 *   {"outcome": "conflict", …}  a DIFFERENT evidence object holds this key with
 *                               different bytes — a second walk that read its prior
 *                               evidence before the first walk committed. Reported;
 *                               never overwritten.
 */
CREATE OR REPLACE FUNCTION observation.claim_item_admission(
  p_tenant uuid, p_domain uuid, p_source_id uuid, p_item_key text,
  p_content_digest text, p_evd_object_id uuid, p_obs_object_id uuid,
  p_object_version int, p_contract_version int, p_run_id uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_held observation.admitted_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.item.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

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
REVOKE ALL ON FUNCTION observation.claim_item_admission(uuid,uuid,uuid,text,text,uuid,uuid,int,int,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.claim_item_admission(uuid,uuid,uuid,text,text,uuid,uuid,int,int,uuid) TO eye_commit;

-- ============================================================
-- 4. The register, built from the evidence already held.
-- ============================================================
/*
 * A register that starts empty would let the FIRST walk after this migration admit a
 * second copy of everything already held — the exact defect it exists to stop. It is
 * therefore seeded from the canonical objects: for each deterministic item key of
 * each source, the LATEST evidence object held under it, which is what the idempotent
 * path already compares incoming bytes against.
 *
 * DETERMINISTIC KEYS ONLY. A forward poll's key carries its retrieval instant and
 * never repeats, so registering one would add a row per poll and protect nothing;
 * `@backfill:` is the marker the traversal writes into every deterministic key
 * (rest.connector `nextRequest`) and the marker `latestEvidenceByPollKeys` already
 * uses to tell the two apart.
 *
 * Where a key holds SEVERAL evidence objects — the 2,133 duplicate copies of
 * §9.6.1 — the latest is registered, because that is the one the idempotent path
 * reaches today. The duplicates are not touched here: removing them is a governed
 * correction, not a migration.
 */
INSERT INTO observation.admitted_items (
  source_id, item_key, scope, tenant_id, domain_id, content_digest,
  evd_object_id, obs_object_id, object_version, contract_version, run_id,
  first_admitted_at, last_admitted_at, revisions)
SELECT s.source_id, s.item_key, 'DOMAIN', s.tenant_id, s.domain_id, s.content_digest,
       s.evd_object_id, s.obs_object_id, s.object_version, s.contract_version, s.run_id,
       s.first_seen, s.recorded_at, greatest(s.object_version - 1, 0)
  FROM (
    SELECT DISTINCT ON (o.payload ->> 'source_id', o.payload ->> 'item_key')
           (o.payload ->> 'source_id')::uuid AS source_id,
           o.payload ->> 'item_key'          AS item_key,
           o.tenant_id, o.domain_id,
           e.payload ->> 'content_digest'    AS content_digest,
           e.object_id                       AS evd_object_id,
           o.object_id                       AS obs_object_id,
           e.object_version                  AS object_version,
           coalesce((o.payload ->> 'contract_version')::int, 1) AS contract_version,
           (o.payload ->> 'run_id')::uuid    AS run_id,
           o.recorded_at                     AS first_seen,
           e.recorded_at                     AS recorded_at
      FROM objects.canonical_objects o
      JOIN LATERAL (
        SELECT * FROM objects.canonical_objects e
         WHERE e.object_type = 'EVD' AND e.payload ->> 'obs_object_id' = o.object_id::text
         ORDER BY e.object_version DESC LIMIT 1) e ON true
     WHERE o.object_type = 'OBS'
       AND o.payload ->> 'item_key' LIKE '%@backfill:%'
       AND o.payload ->> 'source_id' IS NOT NULL
     ORDER BY o.payload ->> 'source_id', o.payload ->> 'item_key',
              o.recorded_at DESC, o.object_version DESC
  ) s
ON CONFLICT (source_id, item_key) DO NOTHING;

-- ============================================================
-- 5. What a reader counts as a distinct observation.
-- ============================================================
/*
 * The readiness register showed 4,984 "evidence objects" for a source holding 2,851
 * distinct observations: it counted canonical EVD ROWS, so every duplicate copy — and,
 * once corrections start landing, every superseded version — counted again.
 *
 * The three questions are answered SEPARATELY by the read port added beside this
 * migration (`ObservationReads.evidenceCounts`), because collapsing them is how 2,133
 * duplicates came to be reported as evidence:
 *   objects_held          — distinct EVD objects, at any version. Nothing is deleted,
 *                           so this never falls; it is the custody figure.
 *   distinct_observations — distinct item keys observed. One window observed twice is
 *                           one observation of that window.
 *   superseded_objects    — objects whose LATEST version is corrected or withdrawn:
 *                           held, retrievable, and not standing as current evidence.
 *
 * It is a read, under the caller's own capability and the row-level policies of
 * objects.canonical_objects, and therefore deliberately NOT a view here: a view would
 * run under its owner's privileges and quietly widen what a domain reader can count.
 */
