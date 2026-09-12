-- 0065 — CP-6 batch B8: ordered publication across ticks, lease recovery and publisher processes; a replay
--        reaches the history a registration skipped; one server per domain; the remaining correction-failure
--        conditions; the flows' telemetry; the interface register and the log's retention contract.
--
-- WHY (Codex's two B7 findings, 2026-09-12, reproduced at the database/queue boundary —
--      evidence/cp6/repro-event-delivery-before.txt, apps/api/test/int/phase6-repro-event-delivery.test.ts).
--   B7-F1  A failed publish could be OVERTAKEN on the next batch, within one publisher process. 0064's lease excluded
--          rows under a live lease and the publisher halted a partition for one tick only: with 51 rows in A and one
--          in B and a transient queue fault on A:1, the first tick leased A:1–49 and B:1, A:1 failed, B:1 published;
--          the next tick leased the never-leased A:50 and A:51 and published them while A:1 was still pending under
--          its lease — B:1, A:50, A:51, then (once the lease lapsed) A:1… — and every halted row had consumed an
--          attempt it was never given (ten such ticks would have dead-lettered rows never tried). A single elected
--          publisher would not have repaired it: the same process overtook itself across ticks.
--   B7-F2  An explicit replay OMITTED the history a `leave` registration skipped. The replay rewound the cursor and
--          reopened existing delivery rows, but the subscription's served point (served_from_seq) stayed at its
--          registration, and the reconciliation — bounded by that point for rows never received — re-drove only what
--          the subscription had already received: events 1–2 stayed excluded although the replay had returned them.
--
-- WHAT
--   §1 THE LEASE IS PARTITION-ORDERED ACROSS TIME AND PROCESSES. A row is leasable only while no earlier pending row
--      of its partition is held by a live lease — so a partition waits behind its first unfinished publish across
--      ticks, across lease recovery and across publisher processes (leases serialise on an advisory lock; the claim
--      waits for an in-flight acknowledgement instead of skipping it), while every other partition keeps progressing.
--      A new port releases the rows a tick leased but never tried (the halted tail) with their attempt refunded, so
--      the attempt budget counts real attempts only. The routing decision — whether a domain has an active
--      subscription of the event's type — is computed here from the registry, not from a process-local set, so any
--      publisher process routes the same way. A partition telemetry view shows the head, its lease and dead letters.
--   §2 A REPLAY MOVES THE SERVED POINT. A replay from a point before the subscription's served point durably lowers
--      it to that point (the subscription now serves from there — after a restart too) and records the move; the
--      reconciliation's scoped re-drive then delivers the rows the subscription never received. Ordinary operation
--      (a `leave` registration serving from its registration; other subscriptions untouched) is unchanged.
--   §3 ONE SERVER PER DOMAIN (cross-process ordering on the consumer side). A domain's subscription queue is served
--      by the one process holding the domain's serving claim (a bounded lease renewed on the reconciliation tick and
--      released on shutdown; lapsed claims are taken over); every process may still ENQUEUE re-drives. Hand-overs
--      are recorded.
--   §4 The remaining AU-MEM-0039 conditions, §5 the flows' telemetry, §6 the interface register and the log's
--      retention/replay contract — each in its own section below.

-- ============================================================
-- §1 Ordered publication across ticks, lease recovery and publisher processes (B7-F1).
-- ============================================================
DROP FUNCTION IF EXISTS objects.outbox_lease_as_publisher(int, int);
DROP FUNCTION IF EXISTS objects.outbox_lease(int, int);
CREATE FUNCTION objects.outbox_lease(p_limit int, p_lease_seconds int DEFAULT 60)
RETURNS TABLE (id uuid, lease_id uuid, event_type text, payload jsonb,
               correlation_id uuid, causation_id uuid, tenant_id uuid, domain_id uuid, partition_key text, partition_seq bigint, schema_version text,
               subscribed boolean)
SECURITY DEFINER SET search_path = objects, graph, public, pg_catalog, pg_temp AS $$
DECLARE
  v_lease uuid := gen_random_uuid();
  v_ttl int := least(greatest(coalesce(p_lease_seconds, 60), 1), 300);
  v_budget constant int := 10;
BEGIN
  PERFORM ctx.assert_capability('publish', 'outbox', 'objects.outbox.publish');
  -- ONE LEASE AT A TIME across every publisher process: the head-of-partition rule below is decided on one consistent
  -- view, never on two overlapping ones (two processes could otherwise each see the other's rows as free).
  PERFORM pg_advisory_xact_lock(hashtext('objects.outbox_lease'));
  UPDATE objects.object_outbox o
     SET status = 'dead_letter', lease_id = NULL, leased_until = NULL
   WHERE o.status = 'pending'
     AND o.attempts >= v_budget
     AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp());
  RETURN QUERY
  WITH pending AS (
    SELECT o.id, o.partition_key, o.partition_seq,
           (o.leased_until IS NOT NULL AND o.leased_until >= clock_timestamp()) AS held
      FROM objects.object_outbox o
     WHERE o.status = 'pending'
  ), prefix AS (
    -- A row is leasable only while NO earlier pending row of its partition (itself included) is held by a live lease:
    -- a partition waits behind its first unfinished publish — across ticks, across lease recovery (the failed row keeps
    -- its lease as its retry backoff) and across processes — and the other partitions keep progressing.
    SELECT p.id, p.partition_key, p.partition_seq,
           bool_or(p.held) OVER (PARTITION BY p.partition_key ORDER BY p.partition_seq ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS blocked
      FROM pending p
  ), ranked AS (
    -- FAIR ACROSS PARTITIONS, ORDERED WITHIN (0064): each partition's lowest leasable sequences first, round-robin.
    SELECT f.id, f.partition_key, f.partition_seq,
           row_number() OVER (PARTITION BY f.partition_key ORDER BY f.partition_seq) AS rn
      FROM prefix f
     WHERE NOT f.blocked
  ), chosen AS (
    SELECT r.id FROM ranked r ORDER BY r.rn, r.partition_key, r.partition_seq LIMIT least(greatest(coalesce(p_limit, 50), 1), 500)
  ), claimed AS (
    -- FOR UPDATE without SKIP LOCKED: a row an acknowledgement is committing is WAITED for, never skipped — skipping
    -- the head of a partition would lease the row behind it.
    SELECT o.id FROM objects.object_outbox o WHERE o.id IN (SELECT c.id FROM chosen c)
       AND o.status = 'pending' AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp())
     FOR UPDATE
  ), leased AS (
    UPDATE objects.object_outbox o
       SET lease_id = v_lease,
           leased_until = clock_timestamp() + make_interval(secs => v_ttl),
           attempts = o.attempts + 1
      FROM claimed c WHERE o.id = c.id
      RETURNING o.id, o.lease_id, o.event_type, o.payload, o.correlation_id,
                o.causation_id, o.tenant_id, o.domain_id, o.partition_key, o.partition_seq, o.schema_version
  )
  SELECT l.id, l.lease_id, l.event_type, l.payload, l.correlation_id, l.causation_id, l.tenant_id, l.domain_id, l.partition_key, l.partition_seq, l.schema_version,
         -- THE ROUTING DECISION, from the registry: a GraphChanged/MemoryCorrected row of a domain with an active
         -- subscription of its type is routed to the domain's subscription queue by whichever process publishes it.
         (l.event_type IN ('GraphChanged', 'MemoryCorrected') AND l.tenant_id IS NOT NULL AND l.domain_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM graph.subscriptions s WHERE s.tenant_id = l.tenant_id AND s.domain_id = l.domain_id AND s.status = 'active' AND l.event_type = ANY (s.event_types))) AS subscribed
    FROM leased l ORDER BY l.partition_key, l.partition_seq;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_lease(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_lease(int, int) TO eye_publisher;

CREATE FUNCTION objects.outbox_lease_as_publisher(p_limit int, p_lease_seconds int DEFAULT 60)
RETURNS TABLE (id uuid, lease_id uuid, event_type text, payload jsonb,
               correlation_id uuid, causation_id uuid, tenant_id uuid, domain_id uuid, partition_key text, partition_seq bigint, schema_version text,
               subscribed boolean)
SECURITY DEFINER SET search_path = objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.issue_publish(NULL::uuid);
  RETURN QUERY SELECT * FROM objects.outbox_lease(p_limit, p_lease_seconds);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_lease_as_publisher(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_lease_as_publisher(int, int) TO eye_publisher;

-- The rows a tick leased but never tried — the tail behind a failed publish — are given back at the end of the
-- tick with their attempt REFUNDED: the attempt budget (0015: ten, then dead letter) counts real attempts only. Tied
-- to the lease token; only the holder can release; the failed row itself keeps its lease as its retry backoff.
CREATE FUNCTION objects.outbox_release_untried(p_lease_id uuid, p_ids uuid[])
RETURNS int
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
DECLARE v_n int;
BEGIN
  PERFORM ctx.assert_capability('publish', 'outbox', 'objects.outbox.publish');
  UPDATE objects.object_outbox
     SET lease_id = NULL, leased_until = NULL, attempts = greatest(attempts - 1, 0)
   WHERE id = ANY (p_ids) AND status = 'pending' AND lease_id = p_lease_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_release_untried(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_release_untried(uuid, uuid[]) TO eye_publisher;

CREATE FUNCTION objects.outbox_release_untried_as_publisher(p_lease_id uuid, p_ids uuid[])
RETURNS int
SECURITY DEFINER SET search_path = objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.issue_publish(NULL::uuid);
  RETURN objects.outbox_release_untried(p_lease_id, p_ids);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_release_untried_as_publisher(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_release_untried_as_publisher(uuid, uuid[]) TO eye_publisher;


-- ============================================================
-- §2 A replay moves the served point (B7-F2). The replay ports are (re)defined in §6 together with the retention
--    contract they are bounded by: the served point moves back to the replayed point and never forward; the cursor
--    only moves back and a NULL cursor stays NULL; the reconciliation re-drives every never-received row at or after
--    the served point.
-- ============================================================
COMMENT ON COLUMN graph.subscriptions.served_from_seq IS 'Outbox rows of the tenant''s partition at or after this SEQUENCE are this subscription''s: the partition''s next sequence at registration for backlog_policy leave, 0 for replay; an explicit replay from an earlier point moves it back to that point (0065) and never forward. The sequence is the declared cursor; served_from (an instant) is the record of when.';

-- ============================================================
-- §3 One server per domain: the serving claim (cross-process ordering on the consumer side).
-- ============================================================
CREATE TABLE graph.subscription_domain_serving (
  tenant_id     uuid NOT NULL,
  domain_id     uuid NOT NULL,
  holder        text NOT NULL,
  claimed_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_until timestamptz NOT NULL,
  renewals      int NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, domain_id)
);
COMMENT ON TABLE graph.subscription_domain_serving IS 'Which process serves a domain''s subscription queue: a bounded claim renewed on the reconciliation tick, released on shutdown, taken over when lapsed — so one worker at a time consumes the domain''s ordered queue (B8 §3).';
CREATE TABLE graph.subscription_serving_events (
  event_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  domain_id    uuid NOT NULL,
  event        text NOT NULL CHECK (event IN ('claimed', 'renewed', 'taken_over', 'released', 'stood_down')),
  holder       text NOT NULL,
  previous     text,
  occurred_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  details      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX subscription_serving_events_domain_idx ON graph.subscription_serving_events (tenant_id, domain_id, occurred_at);
REVOKE ALL ON graph.subscription_domain_serving, graph.subscription_serving_events FROM PUBLIC;
-- Row-level security and read grants, exactly as every graph table (0024 §RLS, 0063); the ports below are SECURITY DEFINER.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscription_domain_serving', 'subscription_serving_events'] LOOP
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

-- Claim (or renew) the serving of a domain for p_ttl_seconds. Returns the holder of record and whether it is the
-- caller: a live claim by another holder is refused (the caller must not serve); a lapsed one is taken over.
CREATE OR REPLACE FUNCTION graph.subscription_domain_claim(p_tenant uuid, p_domain uuid, p_holder text, p_ttl_seconds int, p_take_over_from text DEFAULT NULL)
RETURNS TABLE (holder text, claimed_until timestamptz, mine boolean, taken_over boolean)
SECURITY DEFINER SET search_path = graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.subscription_domain_serving%ROWTYPE; v_ttl int := least(greatest(coalesce(p_ttl_seconds, 150), 5), 3600); v_prev text; v_event text; v_inserted int;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_holder IS NULL OR length(btrim(p_holder)) < 4 THEN RAISE EXCEPTION 'a serving claim names its holder' USING ERRCODE = '22023'; END IF;
  -- Two processes claiming a never-claimed domain at once: the insert is idempotent and the row is then locked by both in turn.
  INSERT INTO graph.subscription_domain_serving (tenant_id, domain_id, holder, claimed_until)
  VALUES (p_tenant, p_domain, p_holder, clock_timestamp() + make_interval(secs => v_ttl))
  ON CONFLICT (tenant_id, domain_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  SELECT * INTO r FROM graph.subscription_domain_serving x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF v_inserted = 1 AND r.holder = p_holder THEN
    v_event := 'claimed';
  ELSIF r.holder = p_holder THEN
    UPDATE graph.subscription_domain_serving x SET claimed_until = clock_timestamp() + make_interval(secs => v_ttl), renewals = x.renewals + 1
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain RETURNING * INTO r;
    v_event := 'renewed';
  ELSIF r.claimed_until < clock_timestamp() OR (p_take_over_from IS NOT NULL AND r.holder = p_take_over_from) THEN
    -- lapsed — or held by a holder the caller states is DEAD (a process of the caller's own host whose pid is gone; the reason is recorded)
    v_prev := r.holder;
    UPDATE graph.subscription_domain_serving x SET holder = p_holder, claimed_at = clock_timestamp(), claimed_until = clock_timestamp() + make_interval(secs => v_ttl), renewals = 0
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain RETURNING * INTO r;
    v_event := 'taken_over';
  ELSE
    RETURN QUERY SELECT r.holder, r.claimed_until, false, false;
    RETURN;
  END IF;
  IF v_event <> 'renewed' THEN
    INSERT INTO graph.subscription_serving_events (tenant_id, domain_id, event, holder, previous, details)
    VALUES (p_tenant, p_domain, v_event, p_holder, v_prev, jsonb_build_object('claimed_until', r.claimed_until, 'reason', CASE WHEN v_event = 'taken_over' AND p_take_over_from IS NOT NULL THEN 'the holder''s process is not alive on this host' WHEN v_event = 'taken_over' THEN 'the claim lapsed' END));
  END IF;
  RETURN QUERY SELECT r.holder, r.claimed_until, true, v_event = 'taken_over';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_domain_claim(uuid, uuid, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_domain_claim(uuid, uuid, text, int, text) TO eye_commit;

-- Release the caller's own claim (a shutdown, a stand-down); another holder's claim is untouched.
CREATE OR REPLACE FUNCTION graph.subscription_domain_release(p_tenant uuid, p_domain uuid, p_holder text, p_reason text)
RETURNS boolean
SECURITY DEFINER SET search_path = graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_n int;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  DELETE FROM graph.subscription_domain_serving x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.holder = p_holder;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 1 THEN
    INSERT INTO graph.subscription_serving_events (tenant_id, domain_id, event, holder, details)
    VALUES (p_tenant, p_domain, CASE WHEN p_reason = 'stand-down' THEN 'stood_down' ELSE 'released' END, p_holder, jsonb_build_object('reason', p_reason));
  END IF;
  RETURN v_n = 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_domain_release(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_domain_release(uuid, uuid, text, text) TO eye_commit;

-- The domains to serve now say who serves them.
DROP FUNCTION IF EXISTS graph.subscription_domains_to_serve();
CREATE FUNCTION graph.subscription_domains_to_serve()
RETURNS TABLE (tenant_id uuid, domain_id uuid, subscriptions int, holder text, claimed_until timestamptz)
SECURITY DEFINER SET search_path = graph, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT s.tenant_id, s.domain_id, count(*)::int, v.holder, v.claimed_until
      FROM graph.subscriptions s
      LEFT JOIN graph.subscription_domain_serving v ON v.tenant_id = s.tenant_id AND v.domain_id = s.domain_id
     WHERE s.status = 'active'
     GROUP BY s.tenant_id, s.domain_id, v.holder, v.claimed_until
     ORDER BY s.tenant_id, s.domain_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_domains_to_serve() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_domains_to_serve() TO eye_commit;

-- ============================================================
-- §4 The remaining correction-failure conditions (AU-MEM-0039) are the consumers' (memory-mappings: provenance_incomplete;
--    decisions: material_change) — the ledger already carries both classes (0064 §3). The unresolved item's class and
--    route are recorded on the item (details.failure_class / disposition) and become the delivery's.
-- ============================================================

-- ============================================================
-- §5 The flows' telemetry (AU-MEM-0041): forecast, scenario (warnings), reconciliation and simulation — execution state
--    (step durations, end-to-end age, retries, completion, unresolved dependency), product state (freshness, coverage,
--    uncertainty, invalidation, affected consumers, decision-active) and recovery state (last durable transition,
--    causation, accountable owner), as views over the ledgers. The invoker's rows (security_invoker over forced RLS).
-- ============================================================
CREATE INDEX IF NOT EXISTS object_outbox_forecast_issued ON objects.object_outbox ((payload ->> 'forecast_id')) WHERE event_type = 'ForecastIssued';
CREATE OR REPLACE VIEW prediction.forecast_telemetry WITH (security_invoker = true) AS
SELECT f.tenant_id, f.domain_id, f.forecast_id, f.series_key, f.horizon_code, f.subject_entity_id, f.state, f.label,
       -- execution state
       (EXTRACT(EPOCH FROM (f.issued_at - f.known_at)) * 1000)::bigint AS issue_lag_ms,
       (SELECT (EXTRACT(EPOCH FROM (x.published_at - x.created_at)) * 1000)::bigint FROM objects.object_outbox x WHERE x.event_type = 'ForecastIssued' AND (x.payload ->> 'forecast_id') = f.forecast_id::text LIMIT 1) AS publish_ms,
       (SELECT (EXTRACT(EPOCH FROM (o.recorded_at - f.target_at::timestamptz)) * 1000)::bigint FROM prediction.outcome_ledger o WHERE o.forecast_id = f.forecast_id LIMIT 1) AS score_lag_ms,
       (EXTRACT(EPOCH FROM (coalesce((SELECT o.recorded_at FROM prediction.outcome_ledger o WHERE o.forecast_id = f.forecast_id LIMIT 1),
                                      (SELECT e.occurred_at FROM prediction.forecast_events e WHERE e.forecast_id = f.forecast_id AND e.event IN ('forecast.superseded', 'forecast.withdrawn') ORDER BY e.occurred_at LIMIT 1),
                                      clock_timestamp()) - f.issued_at)) * 1000)::bigint AS end_to_end_ms,
       f.state IN ('superseded', 'resolved', 'withdrawn') AS completed,
       0 AS retries,
       f.attention_state <> 'none' AS unresolved_dependency,
       -- product state
       (EXTRACT(EPOCH FROM (clock_timestamp() - f.issued_at)) * 1000)::bigint AS age_ms,
       f.refresh_cadence, f.target_at, (f.target_at - current_date) AS days_to_target,
       (f.quantiles ->> 'q10')::numeric AS q10, (f.quantiles ->> 'q50')::numeric AS q50, (f.quantiles ->> 'q90')::numeric AS q90,
       ((f.quantiles ->> 'q90')::numeric - (f.quantiles ->> 'q10')::numeric) AS interval_width,
       f.validation_state,
       (SELECT b.coverage_80 FROM prediction.backtests b WHERE b.backtest_id = f.backtest_id) AS backtest_coverage_80,
       (SELECT o.covered FROM prediction.outcome_ledger o WHERE o.forecast_id = f.forecast_id LIMIT 1) AS outcome_covered,
       f.attention_state <> 'none' AS invalidated, f.attention_reason,
       (SELECT count(*)::int FROM graph.dependencies d WHERE d.depends_on_kind = 'forecast' AND d.depends_on_id = f.forecast_id AND d.state = 'active') AS affected_consumers,
       EXISTS (SELECT 1 FROM graph.dependencies d JOIN decision.packages_current p ON p.decision_object_id = d.dependent_object_id
                WHERE d.dependent_type = 'DEC' AND d.state = 'active' AND d.depends_on_kind = 'forecast' AND d.depends_on_id = f.forecast_id AND p.state IN ('approved', 'committed', 'monitoring')) AS decision_active,
       -- trust and recovery state
       f.method, f.method_version, f.backtest_id, f.superseded_by, f.issued_by AS accountable_owner, f.correlation_id,
       (SELECT e.event FROM prediction.forecast_events e WHERE e.forecast_id = f.forecast_id ORDER BY e.occurred_at DESC LIMIT 1) AS last_transition,
       (SELECT e.occurred_at FROM prediction.forecast_events e WHERE e.forecast_id = f.forecast_id ORDER BY e.occurred_at DESC LIMIT 1) AS last_transition_at,
       CASE WHEN f.validation_state = 'validation_impossible' THEN 'provenance_incomplete' WHEN f.attention_state <> 'none' THEN 'unresolved_dependency' END AS failure_class,
       f.issued_at, f.known_at
  FROM prediction.forecasts_current f;
GRANT SELECT ON prediction.forecast_telemetry TO eye_app, eye_commit;

CREATE OR REPLACE VIEW prediction.warning_telemetry WITH (security_invoker = true) AS
SELECT w.tenant_id, w.domain_id, w.warning_id, w.branch_id, b.scenario_id, w.indicator_id, w.forecast_id, w.state, w.level, w.urgency, w.consequence_class, w.confidence, w.timing_mode,
       -- execution state
       (SELECT (EXTRACT(EPOCH FROM (ev.evaluated_at - ev.known_at)) * 1000)::bigint FROM prediction.scenario_events fe JOIN prediction.indicator_evaluations ev ON ev.evaluation_id = (fe.details ->> 'evaluation_id')::uuid WHERE fe.event_id = w.flip_event_id) AS evaluate_ms,
       (EXTRACT(EPOCH FROM (w.raised_at - b.flipped_at)) * 1000)::bigint AS flip_to_raise_ms,
       (EXTRACT(EPOCH FROM (w.acknowledged_at - w.raised_at)) * 1000)::bigint AS response_ms,
       (EXTRACT(EPOCH FROM (w.response_window_closes_at - w.response_window_opens_at)) * 1000)::bigint AS window_ms,
       (EXTRACT(EPOCH FROM (w.decision_deadline - w.raised_as_of)) * 1000)::bigint AS deadline_slack_ms,
       (EXTRACT(EPOCH FROM (coalesce(w.acknowledged_at, w.expired_as_of, clock_timestamp()) - coalesce(b.flipped_at, w.raised_at))) * 1000)::bigint AS end_to_end_ms,
       w.state IN ('acknowledged', 'expired', 'closed') AS completed,
       0 AS retries,
       b.warning_state = 'owed' AS unresolved_dependency,
       -- product state
       (EXTRACT(EPOCH FROM (clock_timestamp() - w.raised_at)) * 1000)::bigint AS age_ms,
       w.timely, w.response_timely, w.decision_missed,
       (SELECT count(*)::int FROM prediction.branches_current x WHERE x.scenario_id = b.scenario_id) AS scenario_branches,
       (SELECT count(DISTINCT x.kind)::int FROM prediction.branches_current x WHERE x.scenario_id = b.scenario_id) AS scenario_branch_kinds,
       (SELECT s.attention_state <> 'none' FROM prediction.scenarios_current s WHERE s.scenario_id = b.scenario_id) AS invalidated,
       (SELECT count(*)::int FROM graph.dependencies d WHERE d.depends_on_kind = 'strategy' AND d.depends_on_id = b.scenario_id AND d.state = 'active') AS affected_consumers,
       EXISTS (SELECT 1 FROM graph.dependencies d JOIN decision.packages_current p ON p.decision_object_id = d.dependent_object_id
                WHERE d.dependent_type = 'DEC' AND d.state = 'active' AND d.depends_on_kind = 'forecast' AND d.depends_on_id IN (w.warning_id, w.forecast_id) AND p.state IN ('approved', 'committed', 'monitoring')) AS decision_active,
       -- trust and recovery state
       w.routed_to AS accountable_owner, w.raised_by, w.flip_event_id AS causation_event_id, w.correlation_id,
       (SELECT e.event FROM prediction.warning_events e WHERE e.warning_id = w.warning_id ORDER BY e.occurred_at DESC LIMIT 1) AS last_transition,
       (SELECT e.occurred_at FROM prediction.warning_events e WHERE e.warning_id = w.warning_id ORDER BY e.occurred_at DESC LIMIT 1) AS last_transition_at,
       CASE WHEN w.state = 'expired' THEN 'consumer_unavailable' WHEN w.decision_missed THEN 'material_change' WHEN b.warning_state = 'owed' THEN 'unresolved_dependency' END AS failure_class,
       w.raised_at, w.raised_as_of, b.flipped_at
  FROM prediction.warnings_current w
  LEFT JOIN prediction.branches_current b ON b.branch_id = w.branch_id;
GRANT SELECT ON prediction.warning_telemetry TO eye_app, eye_commit;

CREATE OR REPLACE VIEW twin.reconciliation_telemetry WITH (security_invoker = true) AS
SELECT r.tenant_id, r.domain_id, r.reconciliation_id, r.twin_id, r.key, r.from_version, r.from_kind, r.against_version,
       -- execution state
       (EXTRACT(EPOCH FROM (r.recorded_at - (r.difference ->> 'established_at')::timestamptz)) * 1000)::bigint AS basis_age_ms,
       (EXTRACT(EPOCH FROM (r.recorded_at - (r.difference ->> 'observed_recorded_at')::timestamptz)) * 1000)::bigint AS observation_lag_ms,
       (EXTRACT(EPOCH FROM (av.admitted_at - av.opened_at)) * 1000)::bigint AS against_admit_ms,
       (EXTRACT(EPOCH FROM (r.recorded_at - av.admitted_at)) * 1000)::bigint AS end_to_end_ms,
       true AS completed, 0 AS retries,
       fv.verification_state = 'unverified' AS unresolved_dependency,
       -- product state
       (EXTRACT(EPOCH FROM (clock_timestamp() - r.recorded_at)) * 1000)::bigint AS age_ms,
       (r.difference ->> 'numeric')::numeric AS numeric_difference, (r.difference ->> 'relative')::numeric AS relative_difference, r.difference ->> 'unit' AS unit,
       av.known_at, av.observed_through, av.completeness, av.element_count,
       fv.verification_state = 'unverified' AS invalidated,
       (SELECT count(*)::int FROM graph.dependencies d WHERE d.depends_on_kind = 'twin' AND d.depends_on_id = r.twin_id AND d.state = 'active') AS affected_consumers,
       EXISTS (SELECT 1 FROM graph.dependencies d JOIN decision.packages_current p ON p.decision_object_id = d.dependent_object_id
                WHERE d.dependent_type = 'DEC' AND d.state = 'active' AND d.depends_on_kind = 'twin' AND d.depends_on_id = r.twin_id AND p.state IN ('approved', 'committed', 'monitoring')) AS decision_active,
       -- trust and recovery state
       fv.verification_state AS from_verification_state, av.verification_state AS against_verification_state, fv.state_set_digest AS from_digest, av.state_set_digest AS against_digest,
       r.recorded_by AS accountable_owner, r.correlation_id,
       'element.grounded'::text AS last_transition, r.recorded_at AS last_transition_at,
       CASE WHEN fv.verification_state = 'unverified' THEN 'unresolved_dependency' END AS failure_class,
       r.recorded_at
  FROM twin.reconciliations r
  JOIN twin.twin_versions fv ON fv.twin_id = r.twin_id AND fv.version = r.from_version
  JOIN twin.twin_versions av ON av.twin_id = r.twin_id AND av.version = r.against_version;
GRANT SELECT ON twin.reconciliation_telemetry TO eye_app, eye_commit;

CREATE OR REPLACE VIEW simulation.run_telemetry WITH (security_invoker = true) AS
SELECT r.tenant_id, r.domain_id, r.run_id, r.twin_id, r.twin_version, r.run_kind, r.control_run_id, r.corrects_run_id, r.state, r.component, r.stochastic_mode,
       -- execution state
       (EXTRACT(EPOCH FROM (coalesce(r.completed_at, ev.failed_at, clock_timestamp()) - r.opened_at)) * 1000)::bigint AS execute_ms,
       (EXTRACT(EPOCH FROM (r.opened_at - r.known_at)) * 1000)::bigint AS information_age_ms,
       (EXTRACT(EPOCH FROM (coalesce(r.completed_at, ev.failed_at, clock_timestamp()) - r.opened_at)) * 1000)::bigint AS end_to_end_ms,
       r.state IN ('completed', 'failed') AS completed,
       (SELECT count(*)::int FROM simulation.runs_current c WHERE c.corrects_run_id = r.run_id) AS retries,
       (SELECT count(*)::int FROM simulation.reproductions p WHERE p.run_id = r.run_id) AS reproductions,
       EXISTS (SELECT 1 FROM simulation.reproductions p WHERE p.run_id = r.run_id AND p.verdict = 'reproduced') AS reproduced,
       (ev.unverified OR v.verification_state = 'unverified') AS unresolved_dependency,
       -- product state
       (EXTRACT(EPOCH FROM (clock_timestamp() - coalesce(r.completed_at, r.opened_at))) * 1000)::bigint AS age_ms,
       r.known_at, r.observed_through, r.outside_envelope, r.validation_status, r.samples, r.scenario_branch_state, r.shock_basis,
       jsonb_array_length(coalesce(r.initial_state, '[]'::jsonb)) AS initial_elements,
       (ev.unverified OR v.verification_state = 'unverified') AS invalidated,
       (SELECT count(*)::int FROM graph.dependencies d WHERE d.depends_on_kind = 'run' AND d.depends_on_id = r.run_id AND d.state = 'active') AS affected_consumers,
       (EXISTS (SELECT 1 FROM graph.dependencies d JOIN decision.packages_current p ON p.decision_object_id = d.dependent_object_id
                 WHERE d.dependent_type = 'DEC' AND d.state = 'active' AND d.depends_on_kind = 'run' AND d.depends_on_id = r.run_id AND p.state IN ('approved', 'committed', 'monitoring'))
        OR EXISTS (SELECT 1 FROM decision.package_versions pv JOIN decision.packages_current p ON p.package_id = pv.package_id WHERE pv.baseline_run_id = r.run_id AND p.state IN ('approved', 'committed', 'monitoring'))) AS decision_active,
       -- trust and recovery state
       r.model_ref, r.implementation_digest, r.environment_digest, r.inputs_digest, r.outputs_digest, v.verification_state AS twin_verification_state,
       r.operator_principal_id AS accountable_owner, r.correlation_id,
       ev.last_event AS last_transition, ev.last_at AS last_transition_at,
       CASE r.state
         WHEN 'failed' THEN CASE WHEN r.failure ~* 'budget|timeout' THEN 'budget'
                                 WHEN r.failure ~* 'refused|grant|authority' THEN 'authority_disputed'
                                 WHEN r.failure ~* 'not admitted|not available|withdrawn|retired|no pinned|incomplete|missing' THEN 'provenance_incomplete'
                                 ELSE 'infrastructure' END
         WHEN 'completed' THEN CASE WHEN r.outside_envelope THEN 'material_change'
                                    WHEN ev.unverified OR v.verification_state = 'unverified' THEN 'unresolved_dependency'
                                    WHEN EXISTS (SELECT 1 FROM simulation.reproductions p WHERE p.run_id = r.run_id AND p.verdict <> 'reproduced') THEN 'material_change' END
       END AS failure_class,
       r.failure, r.opened_at, r.completed_at
  FROM simulation.runs_current r
  LEFT JOIN LATERAL (SELECT max(e.occurred_at) FILTER (WHERE e.event = 'run.failed') AS failed_at, bool_or(e.event = 'run.unverified') AS unverified,
                            (array_agg(e.event ORDER BY e.occurred_at DESC))[1] AS last_event, max(e.occurred_at) AS last_at
                       FROM simulation.run_events e WHERE e.run_id = r.run_id) ev ON true
  LEFT JOIN twin.twin_versions v ON v.twin_id = r.twin_id AND v.version = r.twin_version;
GRANT SELECT ON simulation.run_telemetry TO eye_app, eye_commit;

-- ============================================================
-- §6 The interface register (AU-DP-0071, V04-T-005: the fifty canonical layer interfaces under their identities) and the
--    log's retention/replay contract (SC-11, ES-19-005: replay within retention; a retained floor per partition).
-- ============================================================
CREATE TABLE objects.interface_register (
  interface_id   text PRIMARY KEY CHECK (interface_id ~ '^L([1-9]|10)-I0[1-5]$'),
  layer          smallint NOT NULL CHECK (layer BETWEEN 1 AND 10),
  layer_name     text NOT NULL,
  name           text NOT NULL,
  style          text NOT NULL CHECK (style IN ('command', 'command/query', 'command/stream', 'command/event', 'workflow command', 'human command', 'query', 'domain event', 'workflow event', 'audit event', 'governance event')),
  contract       text NOT NULL,
  transport      text NOT NULL CHECK (transport IN ('command', 'event', 'query', 'stream', 'human')),
  reliability    text NOT NULL,
  failure        text NOT NULL,
  -- what THIS product binds to the interface today, and how far: bound (the named surface exists under this contract),
  -- partial (a surface exists that serves part of the contract), unbound (nothing yet) — the audit's own judgement, kept here
  -- so the register never claims more than the requirement rows do.
  binding_state  text NOT NULL CHECK (binding_state IN ('bound', 'partial', 'unbound')),
  bound_to       text,
  schema_version text CHECK (schema_version IS NULL OR schema_version ~ '^v[0-9]+$'),
  ordering_scope text NOT NULL DEFAULT 'the audit chain partition (platform | tenant:<id>); sequence assigned at enqueue (0064)',
  requirement    text NOT NULL,
  registered_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
COMMENT ON TABLE objects.interface_register IS 'The fifty canonical layer interfaces (Volume 3 App C, Volume 4 App C: L1-I01 .. L10-I05 — ten layers of five; the requirement rows write the range as L1-I01 … L9-I05) under their L<n>-I<nn> identities: the semantic contract, the transport profile (Volume 4), the reliability and failure contract, and what this product binds to each today — B8 §6 (AU-DP-0071 / V04-T-005).';
GRANT SELECT ON objects.interface_register TO eye_app, eye_commit;

INSERT INTO objects.interface_register (interface_id, layer, layer_name, name, style, contract, transport, reliability, failure, binding_state, bound_to, schema_version, requirement) VALUES
-- the three recurring Volume 4 profiles: CMD / EVT / QRY / STRM / HUM
('L1-I01', 1, 'World Observation', 'RegisterSource', 'command', 'Creates or versions a governed source contract after authorization and rights checks.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'POST /v1/tenants/:t/domains/:d/observation/sources/register (observation.source.register) → observation.source_contracts_current', NULL, 'V3:L1-I01'),
('L1-I02', 1, 'World Observation', 'Acquire', 'command/stream', 'Collects content or state under contract, purpose, rate, and residency constraints.', 'stream', 'At-least-once segments under stable partition key', 'Backpressure, resume, or explicit incomplete range', 'partial', 'observation.acquisition (runs, windows, the scheduler''s collection jobs) — the command form; no flow-controlled stream form', NULL, 'V3:L1-I02'),
('L1-I03', 1, 'World Observation', 'ObservationRecorded', 'domain event', 'Announces an immutable observation and evidence reference.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'outbox event ObservationRecorded (lifecycle.service, orchestrator.service); no registered consumer', 'v1', 'V3:L1-I03'),
('L1-I04', 1, 'World Observation', 'SourceHealthChanged', 'domain event', 'Reports freshness, completeness, authenticity, latency, or coverage state changes.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'outbox event SourceHealthChanged (orchestrator.service, observation.controller); no registered consumer', 'v1', 'V3:L1-I04'),
('L1-I05', 1, 'World Observation', 'CorrectionReceived', 'domain event', 'Introduces source correction, withdrawal, or supersession without destroying prior history.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'bound', 'outbox events CorrectionReceived / CorrectionApplied / CorrectionFailed; the propagation consumer (0060) serves CorrectionApplied on the domain queue', 'v1', 'V3:L1-I05'),
('L2-I01', 2, 'Intelligence', 'TransformEvidence', 'command', 'Runs a declared transformation plan against immutable evidence.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'intelligence extraction runs (intelligence.runs_current, the extraction orchestrator)', NULL, 'V3:L2-I01'),
('L2-I02', 2, 'Intelligence', 'IntelligenceObjectProposed', 'domain event', 'Publishes a claim, event, entity, relationship, or assessment candidate with lineage.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'outbox events ClaimsExtracted / IntelligenceObjectAdmitted (claims; lineage in intelligence.claim_lineage); no registered consumer', 'v1', 'V3:L2-I02'),
('L2-I03', 2, 'Intelligence', 'ContradictionDetected', 'domain event', 'Links incompatible assertions without collapsing them into a single truth state.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'unbound', NULL, NULL, 'V3:L2-I03'),
('L2-I04', 2, 'Intelligence', 'ReviewRequested', 'workflow event', 'Routes ambiguous, high-impact, low-confidence, or policy-sensitive output to accountable humans.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'intelligence.review_current (queued cases, the review route intelligence.review.decide → ClaimReviewed, MemoryCorrected); the routing to a person is the queue, not a published workflow event', 'v1', 'V3:L2-I04'),
('L2-I05', 2, 'Intelligence', 'TransformationEvaluated', 'domain event', 'Records quality, safety, cost, latency, and fitness for the producing version.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'unbound', NULL, NULL, 'V3:L2-I05'),
('L3-I01', 3, 'Enterprise Memory', 'CommitMemory', 'command', 'Persists a governed object version with policy, provenance, classification, and temporal metadata.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'objects.admit_object and the admission ports (objects.canonical_objects; the header field registry)', NULL, 'V3:L3-I01'),
('L3-I02', 3, 'Enterprise Memory', 'RetrieveContext', 'query', 'Returns policy-filtered memory and explanation links for an explicit purpose.', 'query', 'No state change; consistency and staleness explicit', 'Return partial/stale only with declared product state', 'partial', 'the governed reads (pipeline.consequentialRead) and graph retrieval checks; no single purpose-bound context query', NULL, 'V3:L3-I02'),
('L3-I03', 3, 'Enterprise Memory', 'MemoryCorrected', 'domain event', 'Versions a correction and identifies affected downstream objects.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'bound', 'outbox event MemoryCorrected (0063) on the domain subscription queue; six registered consumer kinds with per-item checkpoints', 'v1', 'V3:L3-I03'),
('L3-I04', 3, 'Enterprise Memory', 'RetentionActionDue', 'domain event', 'Initiates archive, review, legal hold, deletion, or customer export workflow.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'unbound', 'legal holds are placed and lifted through observation.legal_holds (0064); no retention-action event', NULL, 'V3:L3-I04'),
('L3-I05', 3, 'Enterprise Memory', 'DeletionVerified', 'audit event', 'Proves scope, authorization, execution, and residual references for a deletion action.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'withdrawals are recorded, non-destructive (correction_of); no deletion workflow with residual inventory', NULL, 'V3:L3-I05'),
('L4-I01', 4, 'Knowledge Graph', 'ResolveIdentity', 'command/query', 'Returns or proposes canonical identity with evidence, confidence, and stewardship state.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'graph resolution ports and routes (graph.resolutions_current; EntityResolved)', 'v1', 'V3:L4-I01'),
('L4-I02', 4, 'Knowledge Graph', 'CommitGraphRevision', 'command', 'Applies an atomic, validated node, edge, ontology, and provenance change set.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'partial', 'entity, edge and strategy writes are each atomic governed writes; no change-set command', NULL, 'V3:L4-I02'),
('L4-I03', 4, 'Knowledge Graph', 'GraphChanged', 'domain event', 'Publishes affected identities, relationships, temporal scopes, and downstream subscriptions.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'bound', 'outbox event GraphChanged (0063) on the domain subscription queue; the subscription registry and delivery ledger', 'v1', 'V3:L4-I03'),
('L4-I04', 4, 'Knowledge Graph', 'TraverseContext', 'query', 'Returns policy-filtered paths with provenance, time, truth state, and confidence.', 'query', 'No state change; consistency and staleness explicit', 'Return partial/stale only with declared product state', 'bound', 'graph neighbourhood and path routes (bounded, incompleteness disclosed)', NULL, 'V3:L4-I04'),
('L4-I05', 4, 'Knowledge Graph', 'OntologyChangeProposed', 'workflow event', 'Initiates compatibility, migration, domain, and governance review.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'unbound', NULL, NULL, 'V3:L4-I05'),
('L5-I01', 5, 'Digital Twins', 'CreateTwinDefinition', 'command', 'Declares boundary, identity, evidence, behaviors, owners, validation, and limitations.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'POST /v1/tenants/:t/domains/:d/twins/declare (twin.declare → twin.twins_current)', NULL, 'V3:L5-I01'),
('L5-I02', 5, 'Digital Twins', 'ReconcileTwin', 'command', 'Produces a new observed-state snapshot from evidence and graph revisions.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'twin versions grounded and admitted; twin.record_reconciliation', NULL, 'V3:L5-I02'),
('L5-I03', 5, 'Digital Twins', 'BranchTwin', 'command', 'Creates an isolated synthetic branch for scenario or simulation use.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'twin versions on a branch (twin.twin_versions.branch_id)', NULL, 'V3:L5-I03'),
('L5-I04', 5, 'Digital Twins', 'TwinStateChanged', 'domain event', 'Publishes version, changed variables, confidence, freshness, and dependency impacts.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'twin.twin_events (version.admitted, version.unverified) — a ledger, not a published event', NULL, 'V3:L5-I04'),
('L5-I05', 5, 'Digital Twins', 'ValidateTwin', 'command/event', 'Evaluates state and model fitness inside the declared operating envelope.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'twin validation state declared at declaration; the reconciliation difference; no fitness evaluation act', NULL, 'V3:L5-I05'),
('L6-I01', 6, 'Prediction', 'RequestForecast', 'command', 'Creates or refreshes a forecast under a declared objective, target, horizon, context, and policy.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'POST /v1/tenants/:t/domains/:d/prediction/forecasts/issue (prediction.forecast.issue → prediction.issue_forecast)', NULL, 'V3:L6-I01'),
('L6-I02', 6, 'Prediction', 'ForecastProduced', 'domain event', 'Publishes distribution, confidence, calibration, drivers, lineage, and expiry.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'outbox event ForecastIssued (the distribution, lineage and validation state on the FCT object); GraphChanged/forecast.superseded (0065) for a recomputation; no consumer of ForecastIssued', 'v1', 'V3:L6-I02'),
('L6-I03', 6, 'Prediction', 'ForecastFitnessChanged', 'domain event', 'Signals drift, calibration failure, data shift, or operating-envelope breach.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'backtests and outcome scoring record calibration; forecast attention marks; no fitness event', NULL, 'V3:L6-I03'),
('L6-I04', 6, 'Prediction', 'BacktestForecast', 'command', 'Evaluates historical versions without contaminating prior decision context.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'POST /v1/tenants/:t/domains/:d/prediction/backtests/run (known-at discipline)', NULL, 'V3:L6-I04'),
('L6-I05', 6, 'Prediction', 'ForecastWithdrawn', 'domain event', 'Marks a version unfit and propagates impact to scenarios, warnings, simulations, and decisions.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'forecast supersession publishes GraphChanged/forecast.superseded (0065) to the scenario and decision consumers; withdrawal has no event', 'v1', 'V3:L6-I05'),
('L7-I01', 7, 'Scenario Intelligence', 'CreateScenario', 'command', 'Declares baseline, branch logic, assumptions, drivers, owners, indicators, and review policy.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'POST /v1/tenants/:t/domains/:d/prediction/scenarios/declare (prediction.scenario.declare)', NULL, 'V3:L7-I01'),
('L7-I02', 7, 'Scenario Intelligence', 'BranchScenario', 'command', 'Creates a versioned upside, downside, disruption, or user-defined alternative.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'partial', 'branches declared with the scenario (the eight-kind vocabulary, 0058); no add-branch command after declaration', NULL, 'V3:L7-I02'),
('L7-I03', 7, 'Scenario Intelligence', 'ScenarioIndicatorChanged', 'domain event', 'Updates branch relevance when a monitored signpost moves.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'bound', 'indicator evaluation flips the branch with a receipt and raises the warning (EarlyWarningRaised)', 'v1', 'V3:L7-I03'),
('L7-I04', 7, 'Scenario Intelligence', 'ScenarioCoherenceFailed', 'domain event', 'Identifies internal inconsistency, invalid assumption, or incompatible dependency.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'scenario attention (input_unverified) marked by the scenario consumer; no coherence event', NULL, 'V3:L7-I04'),
('L7-I05', 7, 'Scenario Intelligence', 'ScenarioReviewed', 'workflow event', 'Records human review, dissent, continuation, retirement, or promotion to simulation.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'unbound', NULL, NULL, 'V3:L7-I05'),
('L8-I01', 8, 'Simulation', 'SubmitExperiment', 'command', 'Validates declared state, versions, constraints, budgets, policy, and expected outputs.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'POST /v1/tenants/:t/domains/:d/twins/simulations/run (simulation.run → simulation.open_run / complete_run)', NULL, 'V3:L8-I01'),
('L8-I02', 8, 'Simulation', 'SimulationStarted', 'domain event', 'Records resolved artifacts, execution identity, environment, seed, and run state.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'simulation.run_events run.opened — a ledger, not a published event', NULL, 'V3:L8-I02'),
('L8-I03', 8, 'Simulation', 'SimulationCompleted', 'domain event', 'Publishes outputs, impacts, uncertainty, sensitivity, validation, and resource evidence.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'simulation.run_events run.completed and the SIM object — a ledger, not a published event', NULL, 'V3:L8-I03'),
('L8-I04', 8, 'Simulation', 'ChallengeSimulation', 'workflow command', 'Re-runs or disputes assumptions, models, constraints, and interpretation.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'partial', 'reproduction (POST /v1/tenants/:t/domains/:d/twins/simulations/:runId/reproduce) and correction runs (corrects_run_id); no dispute workflow', NULL, 'V3:L8-I04'),
('L8-I05', 8, 'Simulation', 'SimulationInvalidated', 'domain event', 'Marks results unfit and identifies dependent decision packages.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'run.unverified on the run ledger; the decision consumer notes a cited run reached by a change; no invalidation event', NULL, 'V3:L8-I05'),
('L9-I01', 9, 'Decision Intelligence', 'OpenDecision', 'command', 'Declares question, accountable authority, scope, objectives, options, stakeholders, and required evidence.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'POST /v1/tenants/:t/domains/:d/decisions/declare (decision.package.declare)', NULL, 'V3:L9-I01'),
('L9-I02', 9, 'Decision Intelligence', 'DecisionPackageReady', 'domain event', 'Publishes a complete reviewable package with uncertainty, alternatives, dissent, and provenance.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'the proposal (decision.propose_version binds the digests; the room shows the package); the readiness is a state on the package, not a published event', NULL, 'V3:L9-I02'),
('L9-I03', 9, 'Decision Intelligence', 'ApproveDecision', 'human command', 'Records authenticated approval, rationale, obligations, overrides, and commitment state.', 'human', 'Exactly-once institutional effect through idempotency and durable workflow', 'Reject stale authority, context, version, or approval', 'bound', 'decision.approve / decision.commit_package (one instant; a revocation after commitment is observed history)', NULL, 'V3:L9-I03'),
('L9-I04', 9, 'Decision Intelligence', 'DecisionCommitted', 'domain event', 'Activates commitments, execution handoff, monitoring conditions, and replay snapshot.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'decision.commit_package: commitments, monitoring conditions and the replay snapshot in one write; the commitment is a state, not a published event', NULL, 'V3:L9-I04'),
('L9-I05', 9, 'Decision Intelligence', 'DecisionReopened', 'workflow event', 'Re-enters the decision lifecycle when evidence, assumptions, policy, or monitoring conditions change.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'input.invalidated / input.recomputed notes on the package (the decision consumer, 0063/0065); condition breaches; the owner re-opens a version by hand', NULL, 'V3:L9-I05'),
('L10-I01', 10, 'Executive Operating System', 'PublishBriefing', 'command', 'Creates a live briefing bound to evidence, changes, objectives, decisions, and audience policy.', 'command', 'Idempotent acceptance and one authoritative effect', 'Reject conflict; retry only with same idempotency boundary', 'bound', 'POST /v1/tenants/:t/domains/:d/briefings/compose (briefing.compose, 0044) — a briefing composed from cited objects with its audience', NULL, 'V3:L10-I01'),
('L10-I02', 10, 'Executive Operating System', 'MaterialChangeRaised', 'domain event', 'Routes change to accountable roles based on consequence, confidence, urgency, and attention policy.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'EarlyWarningRaised with its level and urgency (0061); material_change exposed on a decision package (0065); no attention-policy engine', 'v1', 'V3:L10-I02'),
('L10-I03', 10, 'Executive Operating System', 'ReviewConvened', 'workflow event', 'Opens a governed review around a declared objective, decision, scenario, commitment, or outcome.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'decision rooms and approvals (0042); intelligence review cases; no review-convened event', NULL, 'V3:L10-I03'),
('L10-I04', 10, 'Executive Operating System', 'ExecutiveActionRequested', 'human command', 'Requests analysis, scenario, simulation, decision, delegation, suppression, or follow-up.', 'human', 'Exactly-once institutional effect through idempotency and durable workflow', 'Reject stale authority, context, version, or approval', 'unbound', NULL, NULL, 'V3:L10-I04'),
('L10-I05', 10, 'Executive Operating System', 'AttentionPolicyChanged', 'governance event', 'Versions materiality, escalation, suppression, and notification rules.', 'event', 'At-least-once delivery; consumer deduplication and checkpoint', 'Quarantine invalid event; reconcile committed publication', 'partial', 'the warning-level vocabulary versions (0061) and the subscription''s declared materiality rule (0065); no attention-policy object', NULL, 'V3:L10-I05');

-- THE LOG'S RETENTION CONTRACT, declared where the sequence is declared. Nothing purges objects.object_outbox (no role
-- holds DELETE; the rows are immutable by trigger): the log is retained for the LIFETIME of the database and the
-- retained floor of every partition is its first sequence. A replay names a point; a point before the partition's
-- retained floor is REFUSED with the discontinuity exposed (the floor, the point) — never resolved to the earliest
-- surviving row as if the range were complete. A registration that replays the backlog serves from the floor.
ALTER TABLE objects.outbox_partitions
  ADD COLUMN retained_from_seq bigint NOT NULL DEFAULT 1 CHECK (retained_from_seq >= 1),
  ADD COLUMN retention_policy  text NOT NULL DEFAULT 'lifetime' CHECK (retention_policy IN ('lifetime', 'declared')),
  ADD COLUMN retention_note    text;
COMMENT ON COLUMN objects.outbox_partitions.retained_from_seq IS 'The partition''s retained floor: rows at or after this sequence are guaranteed retained; a replay from before it is refused with the discontinuity exposed. 1 under the lifetime policy (nothing purges the log) — B8 §6.';
COMMENT ON COLUMN objects.outbox_partitions.retention_policy IS 'lifetime: the log is kept for the lifetime of the database (no purge exists, no role holds DELETE); declared: a governed retention act moved the floor (the note says which) — B8 §6.';

-- The partitions as the operator sees them: the head of each partition, whether it is held (blocked) and by how much,
-- the dead letters and the oldest pending age — computed over the WHOLE partition (a domain reader of a multi-domain
-- tenant sees the tenant partition's true head, not the head of its own visible rows), for the invoker's own tenant
-- (every tenant under a PLATFORM context). A function, not a view: objects.outbox_partitions carries every tenant's
-- key and counter and is granted to no runtime role.
CREATE OR REPLACE FUNCTION objects.outbox_partition_telemetry()
RETURNS TABLE (partition_key text, last_seq bigint, pending bigint, head_seq bigint, head_leased_until timestamptz, head_attempts int, blocked boolean,
               dead_letters bigint, published bigint, oldest_pending_ms bigint, last_published_at timestamptz, retained_from_seq bigint, retention_policy text, retention_note text)
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' AND public.eye_tenant() IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.partition_key,
         p.next_seq - 1 AS last_seq,
         count(o.id) FILTER (WHERE o.status = 'pending') AS pending,
         min(o.partition_seq) FILTER (WHERE o.status = 'pending') AS head_seq,
         (SELECT h.leased_until FROM objects.object_outbox h WHERE h.partition_key = p.partition_key AND h.status = 'pending' ORDER BY h.partition_seq LIMIT 1) AS head_leased_until,
         (SELECT h.attempts FROM objects.object_outbox h WHERE h.partition_key = p.partition_key AND h.status = 'pending' ORDER BY h.partition_seq LIMIT 1) AS head_attempts,
         coalesce((SELECT h.leased_until >= clock_timestamp() FROM objects.object_outbox h WHERE h.partition_key = p.partition_key AND h.status = 'pending' ORDER BY h.partition_seq LIMIT 1), false) AS blocked,
         count(o.id) FILTER (WHERE o.status = 'dead_letter') AS dead_letters,
         count(o.id) FILTER (WHERE o.status = 'published') AS published,
         (EXTRACT(EPOCH FROM (clock_timestamp() - min(o.created_at) FILTER (WHERE o.status = 'pending'))) * 1000)::bigint AS oldest_pending_ms,
         max(o.published_at) AS last_published_at,
         p.retained_from_seq, p.retention_policy, p.retention_note
    FROM objects.outbox_partitions p
    LEFT JOIN objects.object_outbox o ON o.partition_key = p.partition_key
   WHERE public.eye_scope() = 'PLATFORM' OR p.partition_key = 'tenant:' || public.eye_tenant()::text
   GROUP BY p.partition_key, p.next_seq, p.retained_from_seq, p.retention_policy, p.retention_note;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_partition_telemetry() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_partition_telemetry() TO eye_app, eye_commit;
COMMENT ON FUNCTION objects.outbox_partition_telemetry() IS 'Per partition of the invoker''s tenant (every partition under a PLATFORM context): pending rows, the head sequence and its lease (blocked = the head is held by a live lease, so the partition waits behind it), dead letters, the oldest pending age, the retention contract — B8 §1/§6.';

-- The floor of a partition (1 when the partition has never been declared).
CREATE OR REPLACE FUNCTION objects.outbox_retained_floor(p_partition_key text) RETURNS bigint
STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT p.retained_from_seq FROM objects.outbox_partitions p WHERE p.partition_key = p_partition_key), 1::bigint);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION objects.outbox_retained_floor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_retained_floor(text) TO eye_app, eye_commit;

-- A replay is bounded by the retained floor: a point before it is refused, the discontinuity named. The point is a
-- SEQUENCE in the tenant's partition (the core below); the (created_at, id) form resolves its row to the sequence;
-- the from-sequence form passes the sequence itself (a domain's rows are sparse in the tenant's partition — the point
-- named is the point replayed, never another domain's row); from the beginning = from the floor.
CREATE OR REPLACE FUNCTION graph.subscription_replay_core(
  p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_from_seq bigint, p_from_created_at timestamptz, p_from_event_id uuid, p_reason text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS TABLE (event_id uuid, event_type text, change_kind text, outbox_created_at timestamptz, correlation_id uuid, causation_id uuid, replay_seq int)
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.subscriptions%ROWTYPE; v_seq int; v_reopened int; v_from_seq bigint; v_served_after bigint; v_floor bigint; v_cp_at timestamptz; v_cp_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.subscription.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'a replay states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM graph.subscriptions WHERE subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no subscription % in this domain', p_subscription_id USING ERRCODE = '23503'; END IF;
  IF s.status <> 'active' THEN RAISE EXCEPTION 'replay rejected: the subscription is %', s.status USING ERRCODE = '23503'; END IF;
  -- WITHIN RETENTION (B8 §6): the replayed range starts after the point (from the floor when none is named); it must lie at or above the floor.
  v_floor := objects.outbox_retained_floor('tenant:' || p_tenant::text);
  v_from_seq := coalesce(p_from_seq, v_floor - 1);
  IF v_from_seq + 1 < v_floor THEN
    RAISE EXCEPTION 'replay rejected: the point (sequence %) precedes the partition''s retained floor (sequence %) — the range % .. % is not retained; a replay from sequence % or later is within retention',
      v_from_seq + 1, v_floor, v_from_seq + 1, v_floor - 1, v_floor - 1 USING ERRCODE = '22023';
  END IF;
  v_seq := s.replay_seq + 1;
  -- THE CURSOR ONLY MOVES BACK (0064): a point beyond it would carry the cursor over open work and strand it; a cursor that
  -- is NULL (nothing applied yet) stays NULL — a replay never moves it forward.
  IF s.checkpoint_seq IS NOT NULL AND v_from_seq < s.checkpoint_seq THEN
    -- the (created_at, id) pair of the cursor: the latest row of THIS domain at or before the point, when one exists
    SELECT x.created_at, x.id INTO v_cp_at, v_cp_id FROM objects.object_outbox x
     WHERE x.partition_key = 'tenant:' || p_tenant::text AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.partition_seq <= v_from_seq
     ORDER BY x.partition_seq DESC LIMIT 1;
    UPDATE graph.subscriptions SET replay_seq = v_seq, checkpoint_created_at = v_cp_at, checkpoint_event_id = v_cp_id, checkpoint_seq = v_from_seq WHERE subscription_id = p_subscription_id;
  ELSE
    UPDATE graph.subscriptions SET replay_seq = v_seq WHERE subscription_id = p_subscription_id;
  END IF;
  -- THE SERVED POINT MOVES BACK TOO (B7-F2): the rows after the point are this subscription's from now on — the never-received
  -- ones included, durably, so a restart's reconciliation still finds them. It never moves forward.
  v_served_after := least(s.served_from_seq, v_from_seq + 1);
  UPDATE graph.subscriptions
     SET served_from_seq = v_served_after,
         served_from = least(served_from, coalesce(p_from_created_at, '-infinity'::timestamptz))
   WHERE subscription_id = p_subscription_id;
  UPDATE graph.subscription_deliveries d
     SET state = 'received', finished_at = NULL, items_applied = '[]'::jsonb, items_unresolved = '[]'::jsonb, unresolved_since = NULL, failure_class = NULL, disposition = NULL,
         last_error = NULL, replay_seq = v_seq, last_delivered_at = clock_timestamp()
   WHERE d.subscription_id = p_subscription_id AND d.partition_seq > v_from_seq;
  GET DIAGNOSTICS v_reopened = ROW_COUNT;
  INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
  SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, d.event_id, d.subscription_id, 'replayed', p_actor, jsonb_build_object('replay_seq', v_seq, 'reason', p_reason), p_correlation
    FROM graph.subscription_deliveries d WHERE d.subscription_id = p_subscription_id AND d.replay_seq = v_seq;
  INSERT INTO graph.subscription_events (event_id, scope, tenant_id, domain_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_subscription_id, 'subscription.replayed', p_actor,
          jsonb_build_object('replay_seq', v_seq, 'from_created_at', p_from_created_at, 'from_event_id', p_from_event_id, 'from_partition_seq', v_from_seq, 'requested_from_seq', p_from_seq, 'reopened', v_reopened,
                             'served_from_seq_before', s.served_from_seq, 'served_from_seq_after', v_served_after, 'retained_floor_seq', v_floor,
                             'never_received', (SELECT count(*) FROM objects.object_outbox x
                                                 WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'published' AND x.event_type = ANY (s.event_types)
                                                   AND (NOT (s.filter ? 'change_kinds') OR s.filter -> 'change_kinds' ? coalesce(x.payload #>> '{change,kind}', ''))
                                                   AND x.partition_seq > v_from_seq
                                                   AND NOT EXISTS (SELECT 1 FROM graph.subscription_deliveries d WHERE d.event_id = x.id AND d.subscription_id = p_subscription_id)),
                             'reason', p_reason), p_correlation);
  RETURN QUERY
    SELECT x.id, x.event_type, coalesce(x.payload #>> '{change,kind}', ''), x.created_at, x.correlation_id, x.causation_id, v_seq
      FROM objects.object_outbox x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'published' AND x.event_type = ANY (s.event_types)
       AND (NOT (s.filter ? 'change_kinds') OR s.filter -> 'change_kinds' ? coalesce(x.payload #>> '{change,kind}', ''))
       AND x.partition_seq > v_from_seq
     ORDER BY x.partition_key, x.partition_seq;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_replay_core(uuid,uuid,uuid,bigint,timestamptz,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_replay_core(uuid,uuid,uuid,bigint,timestamptz,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- The (created_at, id) form: the row named must be a published event of this domain; its sequence is the point.
CREATE OR REPLACE FUNCTION graph.subscription_replay(
  p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_from_created_at timestamptz, p_from_event_id uuid, p_reason text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS TABLE (event_id uuid, event_type text, change_kind text, outbox_created_at timestamptz, correlation_id uuid, causation_id uuid, replay_seq int)
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_from_seq bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.subscription.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_from_event_id IS NOT NULL THEN
    SELECT x.partition_seq INTO v_from_seq FROM objects.object_outbox x WHERE x.id = p_from_event_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF v_from_seq IS NULL THEN RAISE EXCEPTION 'replay rejected: % is not a published event of this domain', p_from_event_id USING ERRCODE = '23503'; END IF;
  END IF;
  RETURN QUERY SELECT * FROM graph.subscription_replay_core(p_subscription_id, p_tenant, p_domain, v_from_seq, p_from_created_at, p_from_event_id, p_reason, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- The from-sequence form: the sequence named is the point (rows after it are replayed), bounded by the floor.
CREATE OR REPLACE FUNCTION graph.subscription_replay_from_seq(
  p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_from_seq bigint, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS TABLE (event_id uuid, event_type text, change_kind text, outbox_created_at timestamptz, correlation_id uuid, causation_id uuid, replay_seq int)
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz; v_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.subscription.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  -- the row of this domain at the point, when the point is one of its rows (for the record; the point itself is what is replayed)
  SELECT x.created_at, x.id INTO v_at, v_id FROM objects.object_outbox x
   WHERE x.partition_key = 'tenant:' || p_tenant::text AND x.partition_seq = p_from_seq AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  RETURN QUERY SELECT * FROM graph.subscription_replay_core(p_subscription_id, p_tenant, p_domain, p_from_seq, v_at, v_id, p_reason, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_replay_from_seq(uuid,uuid,uuid,bigint,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_replay_from_seq(uuid,uuid,uuid,bigint,text,uuid,uuid,uuid) TO eye_commit;

-- The reconciliation: a row this subscription NEVER received at or after its served point is always its to receive — the
-- checkpoint and the look-back bound nothing here (a replay moved the served point back deliberately; the rows are finite
-- and each is excluded once it has a delivery). 0064's shape otherwise.
CREATE OR REPLACE FUNCTION graph.subscription_deliveries_to_reconcile(p_include_refused boolean, p_lookback interval, p_recheck interval)
RETURNS TABLE (tenant_id uuid, domain_id uuid, event_id uuid, event_type text, change_kind text, outbox_created_at timestamptz, correlation_id uuid, causation_id uuid, subscription_id uuid, delivery_state text, partition_seq bigint)
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT s.tenant_id, s.domain_id, x.id, x.event_type, coalesce(x.payload #>> '{change,kind}', ''), x.created_at, x.correlation_id, x.causation_id, s.subscription_id, d.state, x.partition_seq
      FROM graph.subscriptions s
      JOIN objects.object_outbox x ON x.tenant_id = s.tenant_id AND x.domain_id = s.domain_id
       AND x.status = 'published' AND x.event_type = ANY (s.event_types)
       AND (NOT (s.filter ? 'change_kinds') OR s.filter -> 'change_kinds' ? coalesce(x.payload #>> '{change,kind}', ''))
      LEFT JOIN graph.subscription_deliveries d ON d.event_id = x.id AND d.subscription_id = s.subscription_id
     WHERE s.status = 'active'
       AND ((d.event_id IS NULL AND x.partition_seq >= s.served_from_seq)
         OR d.state IN ('received', 'failed')
         OR (d.state = 'unresolved' AND d.last_delivered_at <= clock_timestamp() - coalesce(p_recheck, interval '0'))
         OR (p_include_refused AND d.state = 'refused'))
     ORDER BY x.partition_key, x.partition_seq;
END $$ LANGUAGE plpgsql;

-- A registration that replays its backlog serves from the floor, never from before it (0064's body otherwise unchanged).
CREATE OR REPLACE FUNCTION graph.register_subscription(
  p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_consumer_kind text, p_event_types text[], p_filter jsonb,
  p_principal uuid, p_version text, p_code_digest text, p_owner uuid, p_budgets jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, identity, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text; v_from timestamptz; v_from_seq bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.subscription.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = p_principal AND tenant_id = p_tenant;
  IF NOT FOUND OR v_kind <> 'agent' OR v_status <> 'active' THEN
    RAISE EXCEPTION 'subscription rejected: the principal must be an active principal of kind agent in this tenant' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals WHERE id = p_owner AND kind = 'human' AND status = 'active') THEN
    RAISE EXCEPTION 'subscription rejected: the accountable owner must be an active human principal' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM graph.subscriptions WHERE tenant_id = p_tenant AND domain_id = p_domain AND consumer_kind = p_consumer_kind AND status <> 'revoked') THEN
    RAISE EXCEPTION 'subscription rejected: this domain already has a live % subscription; revoke it first', p_consumer_kind USING ERRCODE = '23505';
  END IF;
  -- The backlog policy is a served-from point ON THE SEQUENCE: 'leave' serves from the partition's next sequence
  -- (the registration's own write is a sequence too — the point is the one after it), 'replay' from the partition's
  -- RETAINED FLOOR (B8 §6: the beginning of what is retained, never before it) — each past row once.
  IF coalesce(p_budgets ->> 'backlog_policy', 'leave') = 'replay' THEN
    v_from := '-infinity'::timestamptz; v_from_seq := objects.outbox_retained_floor('tenant:' || p_tenant::text);
  ELSE
    v_from := clock_timestamp();
    INSERT INTO objects.outbox_partitions (partition_key) VALUES ('tenant:' || p_tenant::text) ON CONFLICT (partition_key) DO NOTHING;
    SELECT p.next_seq INTO v_from_seq FROM objects.outbox_partitions p WHERE p.partition_key = 'tenant:' || p_tenant::text;
  END IF;
  INSERT INTO graph.subscriptions (subscription_id, scope, tenant_id, domain_id, consumer_kind, event_types, filter, principal_id, consumer_version, code_digest, owner_principal_id, budgets, served_from, served_from_seq, created_by, correlation_id)
  VALUES (p_subscription_id, 'DOMAIN', p_tenant, p_domain, p_consumer_kind, p_event_types, coalesce(p_filter, '{}'::jsonb), p_principal, p_version, p_code_digest, p_owner, p_budgets, v_from, v_from_seq, p_actor, p_correlation);
  INSERT INTO graph.subscription_events (event_id, scope, tenant_id, domain_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_subscription_id, 'subscription.registered', p_actor,
          jsonb_build_object('consumer_kind', p_consumer_kind, 'event_types', to_jsonb(p_event_types), 'filter', coalesce(p_filter, '{}'::jsonb), 'principal_id', p_principal,
                             'version', p_version, 'code_digest', p_code_digest, 'owner', p_owner, 'budgets', p_budgets, 'served_from', v_from, 'served_from_seq', v_from_seq), p_correlation);
  RETURN jsonb_build_object('subscription_id', p_subscription_id, 'consumer_kind', p_consumer_kind, 'principal_id', p_principal, 'version', p_version, 'code_digest', p_code_digest, 'budgets', p_budgets, 'served_from', v_from, 'served_from_seq', v_from_seq);
END $$ LANGUAGE plpgsql;


-- ============================================================
-- §7 Inferred relationships are REASSESSED on evidence or model change (AU-DP-0041, V7 TT-04). An edge is an inferred
--    relationship: its inference record is the claim version, the evidence, the method and run that produced it (0024).
--    When that record's basis moves — the evidence or the claim corrected (MemoryCorrected), or the extraction METHOD
--    that produced the claim suspended or retired (a model change) — the edge is opened for REASSESSMENT: a state on
--    the relationship itself, with the trigger, the reason and the cause, closed when the relationship is re-derived
--    (superseded by the builder's next run), retracted, or decided by a person on its mapping proposal. A model change
--    publishes GraphChanged/edge.reassessment_opened so the derivatives resting on the edge (forecasts, twins) learn of
--    it through their subscriptions — no operator-initiated walk.
-- ============================================================
ALTER TABLE graph.edges_current
  ADD COLUMN reassessment_state    text NOT NULL DEFAULT 'none' CHECK (reassessment_state IN ('none', 'pending', 'reassessed')),
  ADD COLUMN reassessment_trigger  text CHECK (reassessment_trigger IS NULL OR reassessment_trigger IN ('evidence', 'claim', 'model')),
  ADD COLUMN reassessment_reason   text,
  ADD COLUMN reassessment_cause_id uuid,
  ADD COLUMN reassessment_causes  jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reassessment_causes) = 'array'),
  ADD COLUMN reassessment_opened_at timestamptz,
  ADD COLUMN reassessed_at         timestamptz,
  ADD COLUMN reassessment_outcome  text CHECK (reassessment_outcome IS NULL OR reassessment_outcome IN ('superseded', 'retracted', 'decided:accepted', 'decided:rejected', 'decided:kept'));
COMMENT ON COLUMN graph.edges_current.reassessment_state IS 'TT-04: none | pending (the inference record''s basis moved — evidence, claim or model — and the relationship awaits re-derivation, retraction or a decision) | reassessed (closed, see reassessment_outcome) — B8 §7.';
CREATE INDEX edg_reassessment_pending ON graph.edges_current (tenant_id, domain_id) WHERE reassessment_state = 'pending';
ALTER TABLE graph.edge_events DROP CONSTRAINT IF EXISTS edge_events_event_check;
ALTER TABLE graph.edge_events ADD CONSTRAINT edge_events_event_check CHECK (event IN ('edge.asserted', 'edge.retracted', 'edge.superseded', 'edge.reassessment_opened', 'edge.reassessed'));

-- Open a reassessment (idempotent while pending). Under the mapping subscriber's action (an evidence or claim change
-- reaching the edge through its subscription), the method authority (a model change) or the propagation walk.
CREATE OR REPLACE FUNCTION graph.open_edge_reassessment(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_trigger text, p_reason text, p_cause_id uuid, p_actor uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.mapping.subscription.apply', 'intelligence.method.activate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_trigger NOT IN ('evidence', 'claim', 'model') THEN RAISE EXCEPTION 'a reassessment names its trigger: evidence, claim or model' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'a reassessment states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT reassessment_state INTO v_state FROM graph.edges_current WHERE edge_id = p_edge_id AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'asserted' FOR UPDATE;
  IF v_state IS NULL THEN RETURN false; END IF;
  IF v_state = 'pending' THEN
    -- A SECOND CAUSE while one is pending is recorded on the relationship (the causes accumulate) and published like the first.
    UPDATE graph.edges_current
       SET reassessment_reason = reassessment_reason || '; ' || p_reason,
           reassessment_causes = reassessment_causes || jsonb_build_object('trigger', p_trigger, 'cause_id', p_cause_id, 'reason', p_reason, 'at', clock_timestamp())
     WHERE edge_id = p_edge_id;
  ELSE
    UPDATE graph.edges_current
       SET reassessment_state = 'pending', reassessment_trigger = p_trigger, reassessment_reason = p_reason, reassessment_cause_id = p_cause_id,
           reassessment_causes = jsonb_build_array(jsonb_build_object('trigger', p_trigger, 'cause_id', p_cause_id, 'reason', p_reason, 'at', clock_timestamp())),
           reassessment_opened_at = clock_timestamp(), reassessed_at = NULL, reassessment_outcome = NULL
     WHERE edge_id = p_edge_id;
  END IF;
  INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.reassessment_opened', p_actor,
          jsonb_build_object('trigger', p_trigger, 'reason', p_reason, 'cause_id', p_cause_id, 'already_pending', v_state = 'pending'), p_correlation);
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.open_edge_reassessment(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.open_edge_reassessment(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- A pending reassessment CLOSES when the relationship leaves the asserted state — re-derived (superseded by the builder's
-- next assertion for the corrected claim, 0026) or retracted — recorded on the row and as its own event.
CREATE OR REPLACE FUNCTION graph.edge_reassessment_closes() RETURNS trigger
SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
BEGIN
  IF OLD.reassessment_state = 'pending' AND NEW.reassessment_state = 'pending' AND OLD.state = 'asserted' AND NEW.state IN ('superseded', 'retracted') THEN
    NEW.reassessment_state := 'reassessed';
    NEW.reassessed_at := clock_timestamp();
    NEW.reassessment_outcome := NEW.state;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER edg_reassessment_closes BEFORE UPDATE ON graph.edges_current FOR EACH ROW EXECUTE FUNCTION graph.edge_reassessment_closes();
-- The closing EVENT is written at commit (a deferred constraint trigger), after the retraction's or supersession's own
-- event — the ledger reads cause, then consequence.
CREATE OR REPLACE FUNCTION graph.edge_reassessment_closed_event() RETURNS trigger
SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid;
BEGIN
  IF OLD.reassessment_state = 'pending' AND NEW.reassessment_state = 'reassessed' AND NEW.reassessment_outcome IN ('superseded', 'retracted') THEN
    v_actor := coalesce(NEW.retracted_by, (SELECT s.asserted_by FROM graph.edges_current s WHERE s.edge_id = NEW.superseded_by), NEW.asserted_by);
    INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.edge_id, 'edge.reassessed', v_actor,
            jsonb_build_object('outcome', NEW.reassessment_outcome, 'trigger', NEW.reassessment_trigger, 'cause_id', NEW.reassessment_cause_id, 'superseded_by', NEW.superseded_by), NEW.correlation_id);
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER edg_reassessment_closed_event AFTER UPDATE ON graph.edges_current DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION graph.edge_reassessment_closed_event();

-- A person's decision on the edge's mapping proposal closes the reassessment too (0063's body otherwise unchanged).
CREATE OR REPLACE FUNCTION graph.decide_mapping_reconciliation(
  p_reconciliation_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_subject uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.resolution.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_state NOT IN ('accepted', 'rejected') THEN RAISE EXCEPTION 'a mapping reconciliation is accepted or rejected' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'a mapping decision states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE graph.mapping_reconciliations
     SET state = p_state, decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = p_reason
   WHERE reconciliation_id = p_reconciliation_id AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'proposed'
   RETURNING subject_kind, subject_id INTO v_kind, v_subject;
  IF NOT FOUND THEN RAISE EXCEPTION 'mapping decision rejected: no open proposal % in this domain', p_reconciliation_id USING ERRCODE = '23503'; END IF;
  IF v_kind = 'edge' THEN
    UPDATE graph.edges_current
       SET reassessment_state = 'reassessed', reassessed_at = clock_timestamp(), reassessment_outcome = 'decided:' || p_state
     WHERE edge_id = v_subject AND tenant_id = p_tenant AND domain_id = p_domain AND reassessment_state = 'pending';
    IF FOUND THEN
      INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_subject, 'edge.reassessed', p_actor,
              jsonb_build_object('outcome', 'decided:' || p_state, 'reconciliation_id', p_reconciliation_id, 'reason', p_reason), p_correlation);
    END IF;
  END IF;
END $$ LANGUAGE plpgsql;

-- A person may also decide the reassessment on the relationship itself — the relationship STANDS under the changed basis
-- (a model retired, evidence corrected): the route for a model-change reassessment, which has no mapping proposal to decide.
CREATE OR REPLACE FUNCTION graph.keep_edge_under_reassessment(p_edge_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.resolution.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'a reassessment decision states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE graph.edges_current
     SET reassessment_state = 'reassessed', reassessed_at = clock_timestamp(), reassessment_outcome = 'decided:kept'
   WHERE edge_id = p_edge_id AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'asserted' AND reassessment_state = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'reassessment decision rejected: no asserted edge % pending reassessment in this domain', p_edge_id USING ERRCODE = '23503'; END IF;
  INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.reassessed', p_actor, jsonb_build_object('outcome', 'decided:kept', 'reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.keep_edge_under_reassessment(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.keep_edge_under_reassessment(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- A MODEL CHANGE: suspending or retiring an extraction method opens a reassessment on every asserted edge whose claim
-- version that method produced (through the claim's lineage). The transition returns the edges so the write can publish
-- GraphChanged/edge.reassessment_opened for them (0023's body otherwise unchanged).
DROP FUNCTION IF EXISTS intelligence.transition_method(uuid,uuid,uuid,text,uuid,text,uuid,uuid);
CREATE FUNCTION intelligence.transition_method(
  p_method_id uuid, p_tenant uuid, p_domain uuid, p_to text, p_actor uuid, p_reason text,
  p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = intelligence, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; v_event text; v_key text; e record; v_edges jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.method.activate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT lifecycle_state, method_key INTO v_state, v_key FROM intelligence.methods_current
   WHERE method_id = p_method_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'method transition rejected: no such method in this domain' USING ERRCODE = '23503';
  END IF;
  v_event := CASE p_to WHEN 'active' THEN 'method.activated'
                       WHEN 'suspended' THEN 'method.suspended'
                       WHEN 'retired' THEN 'method.retired' END;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'method transition rejected: % is not a reachable state', p_to USING ERRCODE = '22023';
  END IF;
  IF p_to = 'active' AND v_state <> 'approved' AND v_state <> 'suspended' THEN
    RAISE EXCEPTION 'method transition rejected: % cannot become active', v_state USING ERRCODE = '22023';
  END IF;
  UPDATE intelligence.methods_current
     SET lifecycle_state = p_to, updated_at = clock_timestamp() WHERE method_id = p_method_id;
  INSERT INTO intelligence.method_events (
    event_id, scope, tenant_id, domain_id, method_id, method_version, event,
    actor_principal_id, details, correlation_id
  ) VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_method_id, 1, v_event,
            p_actor, jsonb_build_object('reason', p_reason, 'from', v_state), p_correlation);
  IF p_to IN ('suspended', 'retired') THEN
    FOR e IN SELECT x.edge_id, x.subject_entity_id, x.object_entity_id, x.predicate, x.claim_object_id, x.claim_version, x.valid_from, x.valid_to
               FROM graph.edges_current x
               JOIN intelligence.claim_lineage l ON l.claim_object_id = x.claim_object_id AND l.claim_version = x.claim_version
              WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'asserted' AND l.method_id = p_method_id
              ORDER BY x.asserted_at LOOP
      IF graph.open_edge_reassessment(e.edge_id, p_tenant, p_domain, 'model',
           format('the extraction method %s that produced claim %s v%s was %s: %s', v_key, e.claim_object_id, e.claim_version, p_to, p_reason), p_method_id, p_actor, p_correlation) THEN
        v_edges := v_edges || jsonb_build_object('edge_id', e.edge_id, 'subject_entity_id', e.subject_entity_id, 'object_entity_id', e.object_entity_id, 'predicate', e.predicate,
                                                 'claim_object_id', e.claim_object_id, 'claim_version', e.claim_version, 'valid_from', e.valid_from, 'valid_to', e.valid_to,
                                                 -- what declares it rests on the edge (a decision, a forecast …): the event carries the dependency so the consumers select by it
                                                 'dependencies', (SELECT coalesce(jsonb_agg(jsonb_build_object('dependency_id', d.dependency_id, 'dependent_object_id', d.dependent_object_id, 'dependent_type', d.dependent_type, 'depends_on_kind', d.depends_on_kind, 'depends_on_id', d.depends_on_id)), '[]'::jsonb)
                                                                    FROM graph.dependencies d WHERE d.depends_on_kind = 'edge' AND d.depends_on_id = e.edge_id AND d.state = 'active'));
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('method_id', p_method_id, 'event', v_event, 'from', v_state, 'to', p_to, 'edges_reassessment_opened', v_edges);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.transition_method(uuid,uuid,uuid,text,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.transition_method(uuid,uuid,uuid,text,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §8 The impact set reaches WARNINGS and BRIEFINGS (AU-MEM-0031): a warning rests on its forecast and on the evidence
--    that flipped its branch (dependency rows at the raise); a briefing rests on what it cites (dependency rows at the
--    composition, from its recorded sources); the walk reaches both, and the assessment marks the warning for attention
--    and RE-FLAGS the briefing by event (both rows are immutable; the briefing keeps its digest and its known-at).
--    Commitments and simulations were already reached (0035); memory items and evaluation datasets have no tables yet.
-- ============================================================
ALTER TABLE prediction.warnings_current
  ADD COLUMN attention_state  text NOT NULL DEFAULT 'none' CHECK (attention_state IN ('none', 'input_unverified')),
  ADD COLUMN attention_reason text;
ALTER TABLE prediction.warning_events DROP CONSTRAINT IF EXISTS warning_events_event_check;
ALTER TABLE prediction.warning_events ADD CONSTRAINT warning_events_event_check CHECK (event IN ('warning.raised', 'warning.acknowledged', 'warning.expired', 'warning.closed', 'warning.attention'));
ALTER TABLE graph.invalidations_current
  ADD COLUMN affected_warnings  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN affected_briefings jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE executive.briefing_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  briefing_id        uuid NOT NULL REFERENCES executive.briefings(briefing_id),
  event              text NOT NULL CHECK (event IN ('briefing.re_flagged')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT xbe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xbe_briefing ON executive.briefing_events (briefing_id, occurred_at);
ALTER TABLE executive.briefing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive.briefing_events FORCE ROW LEVEL SECURITY;
CREATE POLICY executive_isolation ON executive.briefing_events USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON executive.briefing_events TO eye_app, eye_commit;
COMMENT ON TABLE executive.briefing_events IS 'What happened to a briefing after its composition: re-flagged when a correction or invalidation reached what it cites (the snapshot itself is immutable) — B8 §8.';

-- Briefings are dependents; a warning is something to rest on (a briefing cites it).
ALTER TABLE graph.dependencies DROP CONSTRAINT dependencies_dependent_type_check;
ALTER TABLE graph.dependencies ADD CONSTRAINT dependencies_dependent_type_check
  CHECK (dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT', 'FCT', 'SCN', 'WRN', 'TWN', 'SIM', 'BRF'));
ALTER TABLE graph.dependencies DROP CONSTRAINT dependencies_depends_on_kind_check;
ALTER TABLE graph.dependencies ADD CONSTRAINT dependencies_depends_on_kind_check
  CHECK (depends_on_kind IN ('claim', 'entity', 'edge', 'strategy', 'forecast', 'evidence', 'twin', 'run', 'warning'));
CREATE OR REPLACE FUNCTION graph.dependency_dependent_exists() RETURNS trigger
SET search_path = graph, prediction, twin, simulation, executive, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT') THEN
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: % % is not a strategy object', NEW.dependent_type, NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'FCT' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: FCT % is not a forecast', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'SCN' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: SCN % is not a scenario', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'WRN' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.warnings_current w WHERE w.warning_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: WRN % is not a warning', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'TWN' THEN
    IF NOT EXISTS (SELECT 1 FROM twin.twins_current t WHERE t.twin_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: TWN % is not a twin', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'SIM' THEN
    IF NOT EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.run_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: SIM % is not a simulation run', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'BRF' THEN
    IF NOT EXISTS (SELECT 1 FROM executive.briefings b WHERE b.briefing_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: BRF % is not a briefing', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- A composed briefing RESTS on what it cites: its recorded sources (evidence:<id>@<v>, claim:<id>@<v>, run:<id>@<v>,
-- warning:<id> — the warning itself, so a change reaching the warning reaches the briefing through it — and the
-- warning's forecast) become dependency rows in the composing transaction.
CREATE OR REPLACE FUNCTION executive.briefing_dependencies() RETURNS trigger
SECURITY DEFINER SET search_path = executive, graph, prediction, pg_catalog, pg_temp AS $$
DECLARE s text; m text[]; v_forecast uuid;
BEGIN
  FOR s IN SELECT x #>> '{}' FROM jsonb_array_elements(NEW.sources) x LOOP
    m := regexp_match(s, '^(evidence|claim|run|warning)(?:-acknowledged)?:([0-9a-fA-F-]{36})(?:@\d+)?$');
    IF m IS NULL THEN CONTINUE; END IF;
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.briefing_id, 'BRF', m[1], m[2]::uuid, 'the briefing cites this ' || m[1] || ' (' || s || ')', 'active', NEW.composed_by, NEW.correlation_id)
    ON CONFLICT DO NOTHING;
    IF m[1] = 'warning' THEN
      SELECT w.forecast_id INTO v_forecast FROM prediction.warnings_current w WHERE w.warning_id = m[2]::uuid;
      IF v_forecast IS NOT NULL THEN
        INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
        VALUES (gen_random_uuid(), NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.briefing_id, 'BRF', 'forecast', v_forecast, 'the briefing cites a warning raised on this forecast (' || s || ')', 'active', NEW.composed_by, NEW.correlation_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xbr_dependencies AFTER INSERT ON executive.briefings FOR EACH ROW EXECUTE FUNCTION executive.briefing_dependencies();

-- The warning is raised with its dependencies (0061's body otherwise unchanged).
CREATE OR REPLACE FUNCTION prediction.raise_warning(
  p_warning_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_indicator_id uuid, p_forecast_id uuid,
  p_title text, p_evidence jsonb, p_consequence text, p_confidence numeric,
  p_opens_at timestamptz, p_closes_at timestamptz, p_routed_to uuid,
  p_flip_event_id uuid, p_raised_as_of timestamptz, p_timing_mode text, p_decision_deadline timestamptz,
  p_timely boolean, p_decision_missed boolean, p_controls jsonb,
  p_consequence_class text, p_consequence_class_source text, p_level text, p_level_version int, p_urgency text, p_op_class text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_declared text; v_found boolean; v_class text; v_source text; d record; v_op text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_routed_to AND p.status = 'active'
                   AND p.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'warning rejected: it must route to a named, active principal in this tenant' USING ERRCODE = '23503';
  END IF;
  -- The deadline and the timeliness must agree: raised at or after the deadline is a missed decision, never timely.
  IF p_decision_deadline IS NOT NULL AND p_raised_as_of >= p_decision_deadline AND (p_timely IS DISTINCT FROM false OR p_decision_missed IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'warning rejected: raised at or after its decision deadline but not recorded as a missed decision' USING ERRCODE = '22023';
  END IF;
  IF p_decision_deadline IS NOT NULL AND p_raised_as_of < p_decision_deadline AND p_timely IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'warning rejected: raised before its decision deadline but not recorded as timely' USING ERRCODE = '22023';
  END IF;
  -- THE CLASS IS THE BRANCH'S DECLARATION, OR ASSUMED BY THE VERSION'S RULE — never the caller's choice.
  IF p_branch_id IS NOT NULL THEN
    SELECT b.consequence_class, true INTO v_declared, v_found FROM prediction.branches_current b
     WHERE b.branch_id = p_branch_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    IF v_found IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'warning rejected: no such branch in this domain' USING ERRCODE = '23503';
    END IF;
    v_class := coalesce(v_declared, 'C2');
    v_source := CASE WHEN v_declared IS NULL THEN 'assumed' ELSE 'declared' END;
  ELSE
    IF p_consequence_class IS NULL THEN
      RAISE EXCEPTION 'warning rejected: a warning that rests on no branch must declare its consequence class' USING ERRCODE = '22023';
    END IF;
    v_class := p_consequence_class; v_source := 'declared';
  END IF;
  IF p_consequence_class IS DISTINCT FROM v_class OR p_consequence_class_source IS DISTINCT FROM v_source THEN
    RAISE EXCEPTION 'warning rejected: consequence class %/% disagrees with the branch''s declaration (% %)',
      coalesce(p_consequence_class, '<null>'), coalesce(p_consequence_class_source, '<null>'), v_class, v_source USING ERRCODE = '22023';
  END IF;
  -- THE LEVEL IS DERIVED HERE; what the caller wrote into the canonical object must agree, or nothing is admitted.
  SELECT * INTO d FROM prediction.derive_warning_level(v_class, NULL);
  IF p_level IS DISTINCT FROM d.out_level OR p_level_version IS DISTINCT FROM d.out_version OR p_urgency IS DISTINCT FROM d.out_urgency THEN
    RAISE EXCEPTION 'warning rejected: level % (v%) urgency % disagrees with derivation v% for class %: level %, urgency %',
      coalesce(p_level, '<null>'), coalesce(p_level_version::text, '<null>'), coalesce(p_urgency, '<null>'), d.out_version, v_class, d.out_level, d.out_urgency USING ERRCODE = '22023';
  END IF;
  -- THE AUTHORITY CLASS IS THE CONTEXT'S, recorded beside the label (0042/0043 precedent); the label is not consulted.
  v_op := public.eye_op_class();
  IF v_op IS NULL OR v_op NOT IN ('C0','C1','C2','C3','C4') THEN
    RAISE EXCEPTION 'warning rejected: raised outside a classed authority context (%)', coalesce(v_op, 'none') USING ERRCODE = '42501';
  END IF;
  IF p_op_class IS DISTINCT FROM v_op THEN
    RAISE EXCEPTION 'warning rejected: the recorded authority class % is not the context''s %', coalesce(p_op_class, '<null>'), v_op USING ERRCODE = '22023';
  END IF;
  -- ONE WARNING PER FLIP. A second raise for the same flip is refused by the unique index.
  INSERT INTO prediction.warnings_current (
    warning_id, scope, tenant_id, domain_id, branch_id, indicator_id, forecast_id, title, evidence,
    consequence, confidence, response_window_opens_at, response_window_closes_at, routed_to,
    raised_by, state, correlation_id, flip_event_id, raised_as_of, timing_mode, decision_deadline, timely,
    decision_missed, controls, consequence_class, consequence_class_source, level, level_version, urgency, op_class
  ) VALUES (
    p_warning_id, 'DOMAIN', p_tenant, p_domain, p_branch_id, p_indicator_id, p_forecast_id, p_title,
    p_evidence, p_consequence, p_confidence, p_opens_at, p_closes_at, p_routed_to, p_actor, 'raised',
    p_correlation, p_flip_event_id, coalesce(p_raised_as_of, clock_timestamp()), coalesce(p_timing_mode, 'live'),
    p_decision_deadline, p_timely, coalesce(p_decision_missed, false), coalesce(p_controls, '{}'::jsonb),
    v_class, v_source, d.out_level, d.out_version, d.out_urgency, v_op);
  INSERT INTO prediction.warning_events (
    event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_warning_id, 'warning.raised', p_actor,
    jsonb_build_object('routed_to', p_routed_to, 'closes_at', p_closes_at, 'branch_id', p_branch_id,
                       'confidence', p_confidence, 'title', p_title, 'flip_event_id', p_flip_event_id,
                       'raised_as_of', p_raised_as_of, 'timing_mode', p_timing_mode,
                       'decision_deadline', p_decision_deadline, 'timely', p_timely,
                       'decision_missed', coalesce(p_decision_missed, false),
                       'consequence_class', v_class, 'consequence_class_source', v_source,
                       'level', d.out_level, 'level_version', d.out_version, 'urgency', d.out_urgency, 'response', d.out_response,
                       'op_class', v_op),
    p_correlation);
  -- B8 §8 (AU-MEM-0031): the warning RESTS on the forecast it names and on the evidence that flipped its branch — recorded
  -- as dependencies, so a correction of that evidence (or a change to that forecast) reaches the warning through the walk.
  IF p_forecast_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning_id, 'WRN', 'forecast', p_forecast_id, 'the warning was raised on this forecast''s scenario', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
  FOR d IN SELECT DISTINCT (e ->> 'evidence_object_id')::uuid AS evd FROM jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) e WHERE (e ->> 'evidence_object_id') ~* '^[0-9a-f-]{36}$' LOOP
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning_id, 'WRN', 'evidence', d.evd, 'the observation that flipped the branch was read from this evidence', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  IF p_branch_id IS NOT NULL THEN
    UPDATE prediction.branches_current SET warning_state = 'raised' WHERE branch_id = p_branch_id;
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning_id, 'WRN', 'strategy',
      (SELECT s.scenario_id FROM prediction.branches_current b JOIN prediction.scenarios_current s USING (scenario_id)
        WHERE b.branch_id = p_branch_id),
      'the warning was raised because this scenario''s branch flipped', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;


-- The assessment marks reached warnings and re-flags reached briefings (0035's body otherwise unchanged; the old shape dropped).
DROP FUNCTION IF EXISTS graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid);
CREATE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_forecasts jsonb, p_twins jsonb, p_simulations jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid,
  p_warnings jsonb, p_briefings jsonb
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, prediction, twin, simulation, executive, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; cov record; f jsonb; t jsonb; r jsonb; w jsonb; b jsonb; v_versions int[]; v_version int; v_marked jsonb := '[]'::jsonb; v_routes text[]; v_trigger_kind text; v_trigger_id uuid;
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
         affected_warnings    = coalesce(p_warnings,    '[]'::jsonb),
         affected_briefings   = coalesce(p_briefings,   '[]'::jsonb),
         statement = p_statement,
         truncated = coalesce(p_truncated, false),
         unexplored = coalesce(p_unexplored, '[]'::jsonb),
         state = 'assessed', assessed_at = clock_timestamp()
   WHERE invalidation_id = p_invalidation_id
   RETURNING correction_case_id, trigger_kind, trigger_object_id INTO v_case, v_trigger_kind, v_trigger_id;
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

  FOR t IN SELECT * FROM jsonb_array_elements(coalesce(p_twins, '[]'::jsonb)) LOOP
    -- every route: `via_ids` when the walk recorded several, `via_id` for one
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[]) INTO v_routes
      FROM (SELECT t ->> 'via_id' AS x WHERE (t ->> 'via_id') IS NOT NULL
            UNION ALL SELECT y #>> '{}' FROM jsonb_array_elements(coalesce(t -> 'via_ids', '[]'::jsonb)) y) s WHERE x IS NOT NULL;
    SELECT coalesce(array_agg(DISTINCT v.version ORDER BY v.version), ARRAY[]::int[]) INTO v_versions
      FROM twin.twin_versions v
      JOIN twin.state_elements e ON e.twin_id = v.twin_id AND e.version = v.version
     WHERE v.twin_id = (t ->> 'twin_id')::uuid AND v.tenant_id = p_tenant AND v.domain_id = p_domain
       AND v.state = 'admitted' AND v.verification_state = 'verified'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c WHERE (c ->> 'id') = ANY (v_routes));
    FOREACH v_version IN ARRAY v_versions LOOP
      PERFORM twin.mark_unverified((t ->> 'twin_id')::uuid, p_tenant, p_domain, v_version,
        format('invalidation %s: %s', p_invalidation_id, t ->> 'reached_via'), p_invalidation_id, p_actor, gen_random_uuid(), p_correlation);
      v_marked := v_marked || jsonb_build_object('twin_id', t ->> 'twin_id', 'version', v_version);
    END LOOP;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_simulations, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM simulation.runs_current s WHERE s.run_id = (r ->> 'run_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (r ->> 'run_id')::uuid, 'run.unverified', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', r ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;

  -- B8 §8 (AU-MEM-0031): a WARNING the walk reached is marked for attention (once; the warning row's own fields stay immutable),
  -- a BRIEFING composed before the change is RE-FLAGGED by event (the briefing is append-only; its content keeps its digest).
  FOR w IN SELECT * FROM jsonb_array_elements(coalesce(p_warnings, '[]'::jsonb)) LOOP
    UPDATE prediction.warnings_current
       SET attention_state = 'input_unverified', attention_reason = format('invalidation %s: %s', p_invalidation_id, w ->> 'reached_via')
     WHERE warning_id = (w ->> 'warning_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain AND attention_state = 'none' AND state IN ('raised', 'acknowledged');
    IF FOUND THEN
      INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (w ->> 'warning_id')::uuid, 'warning.attention', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', w ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;
  FOR b IN SELECT * FROM jsonb_array_elements(coalesce(p_briefings, '[]'::jsonb)) LOOP
    -- a briefing composed BEFORE the change it rests on: for a corrected object, the object has a version recorded after the
    -- briefing's known-at (a briefing composed on the corrected version is not re-flagged by the correction it already saw)
    IF EXISTS (SELECT 1 FROM executive.briefings x
                WHERE x.briefing_id = (b ->> 'briefing_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain
                  AND (v_trigger_kind NOT IN ('evidence_correction', 'claim_correction', 'claim_withdrawal')
                       OR EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_trigger_id AND o.recorded_at > x.known_at)))
       AND NOT EXISTS (SELECT 1 FROM executive.briefing_events e WHERE e.briefing_id = (b ->> 'briefing_id')::uuid AND e.event = 'briefing.re_flagged' AND e.details ->> 'invalidation_id' = p_invalidation_id::text) THEN
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (b ->> 'briefing_id')::uuid, 'briefing.re_flagged', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', b ->> 'reached_via', 'correction_case_id', v_case), p_correlation);
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
      'warnings',    jsonb_array_length(coalesce(p_warnings,    '[]'::jsonb)),
      'briefings',   jsonb_array_length(coalesce(p_briefings,   '[]'::jsonb)),
      'truncated', coalesce(p_truncated, false),
      'unexplored', jsonb_array_length(coalesce(p_unexplored, '[]'::jsonb)),
      'correction_case_id', v_case, 'case_propagation_state', v_cov_state,
      'roots', v_cov_roots, 'roots_covered', v_cov_covered,
      'roots_outstanding', v_cov_outstanding, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb) TO eye_commit;

-- The warnings projection's rebuild (0029, the A11 property): the state follows the last STATE event; an attention mark
-- (0065 §8) is not a state transition and is left out of the derivation (the body is 0029's otherwise).
CREATE OR REPLACE FUNCTION prediction.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint)
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid;
BEGIN
  v_tenant := public.eye_tenant(); v_domain := public.eye_domain();
  RETURN QUERY
    WITH issued AS (SELECT DISTINCT forecast_id FROM prediction.forecast_events
                     WHERE tenant_id = v_tenant AND domain_id = v_domain AND event = 'forecast.issued'),
         live AS (SELECT forecast_id FROM prediction.forecasts_current WHERE tenant_id = v_tenant AND domain_id = v_domain)
    SELECT 'forecasts_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM issued),
           (SELECT count(*) FROM (SELECT forecast_id FROM issued EXCEPT SELECT forecast_id FROM live) x)
         + (SELECT count(*) FROM (SELECT forecast_id FROM live EXCEPT SELECT forecast_id FROM issued) y);
  RETURN QUERY
    WITH flips AS (SELECT DISTINCT branch_id FROM prediction.scenario_events
                    WHERE tenant_id = v_tenant AND domain_id = v_domain AND event = 'branch.flipped'),
         live AS (SELECT branch_id FROM prediction.branches_current
                   WHERE tenant_id = v_tenant AND domain_id = v_domain AND state = 'flipped')
    SELECT 'branches_current(flipped)'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM flips),
           (SELECT count(*) FROM (SELECT branch_id FROM flips EXCEPT SELECT branch_id FROM live) x)
         + (SELECT count(*) FROM (SELECT branch_id FROM live EXCEPT SELECT branch_id FROM flips) y);
  RETURN QUERY
    WITH last AS (SELECT DISTINCT ON (warning_id) warning_id, event FROM prediction.warning_events
                   WHERE tenant_id = v_tenant AND domain_id = v_domain AND event <> 'warning.attention' ORDER BY warning_id, occurred_at DESC),
         expect AS (SELECT warning_id, CASE event WHEN 'warning.raised' THEN 'raised' WHEN 'warning.acknowledged' THEN 'acknowledged'
                                                  WHEN 'warning.expired' THEN 'expired' ELSE 'closed' END AS state FROM last),
         live AS (SELECT warning_id, state FROM prediction.warnings_current WHERE tenant_id = v_tenant AND domain_id = v_domain)
    SELECT 'warnings_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
           (SELECT count(*) FROM (SELECT * FROM expect EXCEPT SELECT * FROM live) x)
         + (SELECT count(*) FROM (SELECT * FROM live EXCEPT SELECT * FROM expect) y);
END $$ LANGUAGE plpgsql;

-- The graph projections' rebuild (0024/0063 §10, the A11 property; the retrieval consumer's check): the edge state follows the
-- last STATE event — a reassessment opened or closed (0065 §7) is left out of the derivation (the body is 0063's otherwise).
CREATE OR REPLACE FUNCTION graph.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint)
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid;
BEGIN
  -- 0063: the retrieval subscriber verifies the projections after a change; its action is accepted here.
  PERFORM observation.assert_authority(ARRAY['graph.read', 'observation.read', 'graph.retrieval.subscription.apply']);
  v_tenant := public.eye_tenant();
  v_domain := public.eye_domain();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'projection rebuild rejected: no tenant is established in this context'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH last_entity AS (
    SELECT DISTINCT ON (e.entity_id) e.entity_id, e.event
      FROM graph.entity_events e
     WHERE e.event IN ('entity.created','entity.split','entity.superseded','entity.retired')
       AND e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.entity_id, e.occurred_at DESC, e.event_id DESC
  ), expect_entity AS (
    SELECT le.entity_id,
           CASE le.event WHEN 'entity.superseded' THEN 'superseded'
                         WHEN 'entity.retired'    THEN 'retired'
                         ELSE 'active' END AS state
      FROM last_entity le
  )
  SELECT 'entities_current'::text,
         (SELECT count(*) FROM graph.entities_current x
           WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
         (SELECT count(*) FROM expect_entity),
         (SELECT count(*) FROM graph.entities_current x
            JOIN expect_entity y ON y.entity_id = x.entity_id
           WHERE x.lifecycle_state IS DISTINCT FROM y.state);

  RETURN QUERY
  WITH last_res AS (
    SELECT DISTINCT ON (e.resolution_id) e.resolution_id, e.event
      FROM graph.resolution_events e
     WHERE e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.resolution_id, e.occurred_at DESC, e.event_id DESC
  ), expect_res AS (
    SELECT lr.resolution_id,
           CASE lr.event WHEN 'resolution.proposed'      THEN 'proposed'
                         WHEN 'resolution.auto_accepted' THEN 'accepted'
                         WHEN 'resolution.accepted'      THEN 'accepted'
                         WHEN 'resolution.rejected'      THEN 'rejected'
                         ELSE 'superseded' END AS state
      FROM last_res lr
  )
  SELECT 'resolutions_current'::text,
         (SELECT count(*) FROM graph.resolutions_current x
           WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
         (SELECT count(*) FROM expect_res),
         (SELECT count(*) FROM graph.resolutions_current x
            JOIN expect_res y ON y.resolution_id = x.resolution_id
           WHERE x.state IS DISTINCT FROM y.state);

  RETURN QUERY
  WITH last_edge AS (
    -- the state follows the last STATE event; a reassessment opened or closed (0065 §7) is not a state transition
    SELECT DISTINCT ON (e.edge_id) e.edge_id, e.event
      FROM graph.edge_events e
     WHERE e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
       AND e.event NOT IN ('edge.reassessment_opened', 'edge.reassessed')
     ORDER BY e.edge_id, e.occurred_at DESC, e.event_id DESC
  ), expect_edge AS (
    SELECT le.edge_id,
           CASE le.event WHEN 'edge.asserted'   THEN 'asserted'
                         WHEN 'edge.retracted'  THEN 'retracted'
                         ELSE 'superseded' END AS state
      FROM last_edge le
  )
  SELECT 'edges_current'::text,
         (SELECT count(*) FROM graph.edges_current x
           WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
         (SELECT count(*) FROM expect_edge),
         (SELECT count(*) FROM graph.edges_current x
            JOIN expect_edge y ON y.edge_id = x.edge_id
           WHERE x.state IS DISTINCT FROM y.state);

  RETURN QUERY
  WITH last_asu AS (
    SELECT DISTINCT ON (e.strategy_object_id) e.strategy_object_id, e.event
      FROM graph.strategy_events e
     WHERE e.event IN ('strategy.declared','assumption.verified','assumption.unverified',
                       'assumption.invalidated')
       AND e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.strategy_object_id, e.occurred_at DESC, e.event_id DESC
  ), expect_asu AS (
    SELECT la.strategy_object_id,
           CASE la.event WHEN 'assumption.verified'    THEN 'verified'
                         WHEN 'assumption.unverified'  THEN 'unverified'
                         WHEN 'assumption.invalidated' THEN 'invalidated'
                         ELSE NULL END AS state
      FROM last_asu la
  )
  SELECT 'strategy_current'::text,
         (SELECT count(*) FROM graph.strategy_current x
           WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
         (SELECT count(*) FROM expect_asu),
         (SELECT count(*) FROM graph.strategy_current x
            JOIN expect_asu y ON y.strategy_object_id = x.strategy_object_id
           WHERE x.object_type = 'ASU' AND y.state IS NOT NULL
             AND x.verification_state IS DISTINCT FROM y.state);

  RETURN QUERY
  WITH last_inv AS (
    SELECT DISTINCT ON (e.invalidation_id) e.invalidation_id, e.event
      FROM graph.invalidation_events e
     WHERE e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.invalidation_id, e.occurred_at DESC, e.event_id DESC
  ), expect_inv AS (
    SELECT li.invalidation_id,
           CASE li.event WHEN 'invalidation.opened'   THEN 'open'
                         WHEN 'invalidation.assessed' THEN 'assessed'
                         ELSE 'closed' END AS state
      FROM last_inv li
  )
  SELECT 'invalidations_current'::text,
         (SELECT count(*) FROM graph.invalidations_current x
           WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
         (SELECT count(*) FROM expect_inv),
         (SELECT count(*) FROM graph.invalidations_current x
            JOIN expect_inv y ON y.invalidation_id = x.invalidation_id
           WHERE x.state IS DISTINCT FROM y.state);
END $$ LANGUAGE plpgsql;
