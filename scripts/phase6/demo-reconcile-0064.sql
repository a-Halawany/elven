-- ============================================================================================
-- DEMONSTRATION DATABASE ONLY: reconcile eye_demo's 0064 with the committed 0064.
--
-- What happened. On 2026-09-12 11:48 UTC the demonstration database (eye_demo) was migrated
-- through a DEVELOPMENT ITERATION of 0064_subscription_resolution_and_partition_order.sql
-- (recorded digest 9da00200…), before that file took its committed form at a852c65 (digest
-- 509395a8…, unchanged since). The migrator rightly refuses to continue ("migrations are
-- immutable"), so 0065 could not be applied to eye_demo. No verification database is affected:
-- every harness run and the upgrade proof migrate a fresh database from the committed chain.
--
-- What this script does. It is the exact difference between the two states, taken from a schema
-- diff of eye_demo against a database migrated with the committed 0064 (eye_verify8_20260912),
-- limited to the objects 0065 does not itself redefine (0065 drops and recreates the lease
-- functions and replaces register_subscription, subscription_deliveries_to_reconcile and
-- subscription_replay_from_seq). Every definition below is copied verbatim from the committed
-- 0064. The subscriptions' served point on the sequence is derived the way the committed 0064
-- derives it for existing subscriptions, from the instant the iteration recorded. The recorded
-- digest is then set to the committed file's, so the migrator applies 0065 and beyond normally.
--
-- Guarded: refuses unless the recorded 0064 digest is the iteration's. One transaction.
-- Run as the migrate role:  node <dbexec> eye_demo scripts/phase6/demo-reconcile-0064.sql
-- Recorded in evidence/cp6/act-b8.txt and PHASE6_REPORT.md §21.2.
-- ============================================================================================
BEGIN;

DO $$
DECLARE v_digest text;
BEGIN
  SELECT digest INTO v_digest FROM public.schema_migrations WHERE filename = '0064_subscription_resolution_and_partition_order.sql';
  IF v_digest IS DISTINCT FROM '9da00200dd4a40598c36882d3bd1fd3ecefaa8d647330f7c62f5741e711811d0' THEN
    RAISE EXCEPTION 'demo-reconcile-0064 applies only to a database whose 0064 is the 2026-09-12 iteration (recorded digest %)', coalesce(v_digest, 'none');
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename >= '0065') THEN
    RAISE EXCEPTION 'demo-reconcile-0064 runs before 0065';
  END IF;
END $$;

-- §2 of the committed 0064: the served point ON THE SEQUENCE (the iteration served from an instant only).
ALTER TABLE graph.subscriptions ADD COLUMN IF NOT EXISTS served_from_seq bigint NOT NULL DEFAULT 0;
COMMENT ON COLUMN graph.subscriptions.served_from IS NULL; -- the iteration's comment; the committed file carries none on the instant
COMMENT ON COLUMN graph.subscriptions.served_from_seq IS 'Outbox rows of the tenant''s partition at or after this SEQUENCE are this subscription''s: the partition''s next sequence at registration for backlog_policy leave (a write still open at registration that has not taken its sequence is included; one that has is the backlog), 0 for replay. The sequence is the declared cursor; served_from (an instant) is the record of when.';
-- The iteration recorded served_from = the registration instant for 'leave', -infinity for 'replay'; the sequence is the
-- first row at or after that instant (the partition's next sequence when none follows), 0 for a replay — as the committed
-- 0064 derives it for subscriptions that existed before it.
UPDATE graph.subscriptions s SET served_from_seq = CASE WHEN coalesce(budgets ->> 'backlog_policy', 'leave') = 'leave'
  THEN coalesce((SELECT min(x.partition_seq) FROM objects.object_outbox x WHERE x.partition_key = 'tenant:' || s.tenant_id::text AND x.created_at >= s.served_from), (SELECT p.next_seq FROM objects.outbox_partitions p WHERE p.partition_key = 'tenant:' || s.tenant_id::text), 1)
  ELSE 0 END;

-- §3 of the committed 0064: receipt routed by the served sequence or an explicit scope; the previous outcome cleared on redelivery.
CREATE OR REPLACE FUNCTION graph.subscription_delivery_receive(
  p_event_id uuid, p_tenant uuid, p_domain uuid, p_event_type text, p_change_kind text, p_outbox_created_at timestamptz,
  p_only uuid[], p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.subscriptions%ROWTYPE; d graph.subscription_deliveries%ROWTYPE; v_out jsonb := '[]'::jsonb; v_seq bigint;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_tenant IS NULL OR p_domain IS NULL OR p_event_id IS NULL OR p_event_type NOT IN ('GraphChanged', 'MemoryCorrected') THEN
    RAISE EXCEPTION 'subscription delivery requires a scoped GraphChanged or MemoryCorrected event' USING ERRCODE = '23514';
  END IF;
  SELECT partition_seq INTO v_seq FROM objects.object_outbox WHERE id = p_event_id;
  FOR s IN SELECT * FROM graph.subscriptions x
            WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'active'
              AND p_event_type = ANY (x.event_types)
              AND (NOT (x.filter ? 'change_kinds') OR x.filter -> 'change_kinds' ? p_change_kind)
              AND (CASE WHEN p_only IS NULL THEN v_seq >= x.served_from_seq ELSE x.subscription_id = ANY (p_only) END)
            ORDER BY x.consumer_kind LOOP
    INSERT INTO graph.subscription_deliveries (event_id, subscription_id, scope, tenant_id, domain_id, consumer_kind, event_type, change_kind, outbox_created_at, partition_seq, state, deliveries, attempts, principal_id, replay_seq, correlation_id)
    VALUES (p_event_id, s.subscription_id, 'DOMAIN', p_tenant, p_domain, s.consumer_kind, p_event_type, p_change_kind, p_outbox_created_at, v_seq, 'received', 1, 0, s.principal_id, s.replay_seq, p_correlation)
    ON CONFLICT (event_id, subscription_id) DO UPDATE
       SET deliveries = graph.subscription_deliveries.deliveries + 1,
           last_delivered_at = clock_timestamp(),
           -- a terminal APPLIED delivery is never reopened by a redelivery; a failed, refused, unresolved or interrupted one is,
           -- and its previous outcome's class, route and reason go with it (the event log keeps them; the next finish sets its own)
           state = CASE WHEN graph.subscription_deliveries.state = 'applied' THEN 'applied' ELSE 'received' END,
           finished_at = CASE WHEN graph.subscription_deliveries.state = 'applied' THEN graph.subscription_deliveries.finished_at ELSE NULL END,
           failure_class = CASE WHEN graph.subscription_deliveries.state = 'applied' THEN graph.subscription_deliveries.failure_class ELSE NULL END,
           disposition   = CASE WHEN graph.subscription_deliveries.state = 'applied' THEN graph.subscription_deliveries.disposition ELSE NULL END,
           last_error    = CASE WHEN graph.subscription_deliveries.state = 'applied' THEN graph.subscription_deliveries.last_error ELSE NULL END,
           principal_id = s.principal_id
    RETURNING * INTO d;
    INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, s.subscription_id, 'received', NULL,
            jsonb_build_object('delivery', d.deliveries, 'state', d.state, 'replay_seq', d.replay_seq, 'partition_seq', v_seq, 'scoped', p_only IS NOT NULL), p_correlation);
    v_out := v_out || jsonb_build_object(
      'subscription_id', s.subscription_id, 'consumer_kind', s.consumer_kind, 'principal_id', s.principal_id,
      'consumer_version', s.consumer_version, 'code_digest', s.code_digest, 'budgets', s.budgets,
      'state', d.state, 'deliveries', d.deliveries, 'attempts', d.attempts, 'items', d.items, 'items_applied', d.items_applied, 'items_unresolved', d.items_unresolved, 'replay_seq', d.replay_seq);
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS graph.subscription_delivery_receive(uuid,uuid,uuid,text,text,timestamptz,uuid,int,uuid);
REVOKE ALL ON FUNCTION graph.subscription_delivery_receive(uuid,uuid,uuid,text,text,timestamptz,uuid[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_delivery_receive(uuid,uuid,uuid,text,text,timestamptz,uuid[],uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.subscription_outbox_failures()
RETURNS TABLE (tenant_id uuid, domain_id uuid, event_id uuid, event_type text, created_at timestamptz)
SECURITY DEFINER SET search_path = graph, objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT DISTINCT s.tenant_id, s.domain_id, x.id, x.event_type, x.created_at
      FROM graph.subscriptions s
      JOIN objects.object_outbox x ON x.tenant_id = s.tenant_id AND x.domain_id = s.domain_id AND x.status IN ('failed', 'dead_letter') AND x.event_type = ANY (s.event_types)
     WHERE s.status = 'active' ORDER BY x.created_at;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION graph.subscription_event_row(p_event_id uuid, p_tenant uuid, p_domain uuid)
RETURNS TABLE (event_type text, payload jsonb, created_at timestamptz)
SECURITY DEFINER SET search_path = graph, objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY SELECT x.event_type, x.payload, x.created_at FROM objects.object_outbox x
    WHERE x.id = p_event_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status IN ('pending', 'published') AND x.event_type IN ('GraphChanged', 'MemoryCorrected')
      AND (x.status = 'published' OR x.lease_id IS NOT NULL);
END $$ LANGUAGE plpgsql;

-- §4 of the committed 0064: the telemetry views (publication latency; the propagation failure classes' spellings).
-- The delivery view gains columns in the middle of its list, which CREATE OR REPLACE VIEW refuses; nothing depends on it.
DROP VIEW IF EXISTS graph.subscription_delivery_telemetry;
CREATE VIEW graph.subscription_delivery_telemetry WITH (security_invoker = true) AS
SELECT d.tenant_id, d.domain_id, d.event_id, d.subscription_id, d.consumer_kind, d.event_type, d.change_kind, d.partition_seq, d.state,
       d.failure_class, d.disposition, d.deliveries, d.attempts, d.replay_seq,
       jsonb_array_length(d.items) AS items, jsonb_array_length(d.items_applied) AS items_applied, jsonb_array_length(d.items_unresolved) AS items_unresolved,
       d.outbox_created_at, d.first_received_at, d.last_delivered_at, d.finished_at, d.unresolved_since,
       (SELECT min(e.occurred_at) FROM graph.subscription_delivery_events e WHERE e.outbox_event_id = d.event_id AND e.subscription_id = d.subscription_id AND e.event = 'applying') AS first_applying_at,
       (SELECT max(e.occurred_at) FROM graph.subscription_delivery_events e WHERE e.outbox_event_id = d.event_id AND e.subscription_id = d.subscription_id AND e.event = 'received') AS last_received_at,
       x.published_at,
       (EXTRACT(EPOCH FROM (coalesce(x.published_at, d.first_received_at) - d.outbox_created_at)) * 1000)::bigint AS publish_ms,
       greatest(0, (EXTRACT(EPOCH FROM (d.first_received_at - coalesce(x.published_at, d.outbox_created_at))) * 1000)::bigint) AS queue_wait_ms,
       (EXTRACT(EPOCH FROM (coalesce(d.finished_at, clock_timestamp()) - coalesce((SELECT min(e.occurred_at) FROM graph.subscription_delivery_events e WHERE e.outbox_event_id = d.event_id AND e.subscription_id = d.subscription_id AND e.event = 'applying'), d.first_received_at))) * 1000)::bigint AS apply_ms,
       (EXTRACT(EPOCH FROM (coalesce(d.finished_at, clock_timestamp()) - d.outbox_created_at)) * 1000)::bigint AS end_to_end_ms,
       (d.state IN ('applied', 'failed', 'refused', 'unresolved')) AS completed,
       (d.deliveries - 1) AS retries
  FROM graph.subscription_deliveries d
  LEFT JOIN objects.object_outbox x ON x.id = d.event_id;
GRANT SELECT ON graph.subscription_delivery_telemetry TO eye_app, eye_commit;

CREATE OR REPLACE VIEW graph.propagation_attempt_telemetry WITH (security_invoker = true) AS
SELECT a.tenant_id, a.domain_id, a.event_id, a.case_id, a.agent_id, a.state, a.deliveries, a.attempts,
       jsonb_array_length(a.roots) AS roots, jsonb_array_length(a.roots_walked) AS roots_walked,
       a.first_received_at, a.last_delivered_at, a.finished_at,
       x.created_at AS outbox_created_at, x.partition_seq,
       (EXTRACT(EPOCH FROM (a.first_received_at - x.created_at)) * 1000)::bigint AS queue_wait_ms,
       (EXTRACT(EPOCH FROM (coalesce(a.finished_at, clock_timestamp()) - a.first_received_at)) * 1000)::bigint AS walk_ms,
       (EXTRACT(EPOCH FROM (coalesce(a.finished_at, clock_timestamp()) - x.created_at)) * 1000)::bigint AS end_to_end_ms,
       (a.state IN ('complete', 'partial', 'failed')) AS completed,
       (a.deliveries - 1) AS retries,
       CASE a.state WHEN 'partial' THEN 'unresolved_dependency' WHEN 'failed' THEN
         CASE WHEN a.last_error ~* 'budget' THEN 'budget' WHEN a.last_error ~* 'no (active )?(propagation )?agent|consumer' THEN 'consumer_unavailable' WHEN a.last_error ~* 'refused|grant|authority' THEN 'authority_disputed' ELSE 'infrastructure' END END AS failure_class
  FROM graph.propagation_attempts a
  LEFT JOIN objects.object_outbox x ON x.id = a.event_id;
GRANT SELECT ON graph.propagation_attempt_telemetry TO eye_app, eye_commit;

-- The record: 0064 is now, in effect, the committed file.
UPDATE public.schema_migrations
   SET digest = '509395a892557bc8985885310bbd8c8577dbc1127a8e00a731d46dedfb2520c2'
 WHERE filename = '0064_subscription_resolution_and_partition_order.sql'
   AND digest = '9da00200dd4a40598c36882d3bd1fd3ecefaa8d647330f7c62f5741e711811d0';

COMMIT;
