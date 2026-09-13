-- 0064 — CP-6 batch B7: unresolved work stays unresolved; a declared partition and sequence on the outbox;
--        backlog served once; failure classes and telemetry on subscription deliveries.
--
-- WHY (Codex finding 3, 2026-09-12, reproduced at the database/queue boundary — evidence/cp6/repro-retrieval-before.txt).
--   The retrieval consumer records a projection check; when the check found a mismatch the delivery ended `failed` —
--   but the item had been checkpointed as APPLIED inside the same effect, so the re-drive (a restart, a tick) skipped
--   it and finished `applied` with no second check: the failure was cleared, the projection still drifted. From 0064
--   an item whose effect finds operator work is recorded as UNRESOLVED, never as applied: the check is kept (it is
--   evidence), the item stays open, the delivery ends `unresolved`, and every re-drive re-checks it. Only a check that
--   passes applies the item. Ordinary items keep their idempotency (applied once, skipped after); the operator's
--   repair stays the operator's (a subscriber never repairs a projection).
--
-- WHAT ELSE
--   §1 A DECLARED PARTITION AND SEQUENCE on objects.object_outbox (AU-DP-0071). The partition IS the audit chain's
--      partition ('platform' | 'tenant:<id>'): every governed write appends its AUD row under that partition's head
--      lock before it enqueues, and holds the lock to commit — so the sequence assigned at enqueue is the COMMIT order,
--      and consumers may rely on order within a partition and on nothing across partitions (they never did: one
--      worker per domain queue; domains are independent). Every row also carries its event schema version.
--   §2 A subscription serves FROM a point (`served_from`): 'leave' = from its registration, 'replay' = from the
--      beginning; the reconciliation re-drives only rows at or after that point, so a backlog is delivered ONCE
--      (0063 re-drove it twice: the replay's jobs and the reconciliation's own). The cursor gains the partition
--      sequence beside its (created_at, id) pair, and a replay may name a sequence.
--   §3 FAILURE CLASSES (AU-MEM-0039) on every non-applied delivery — authority_disputed, consumer_unavailable,
--      provenance_incomplete, executed_action, legal_hold, material_change, unresolved_dependency, budget,
--      infrastructure — each with its DISPOSITION (retry, compensation, challenge, human_review), so the failure state
--      is exposed with its route rather than as free text.
--   §4 TELEMETRY (AU-MEM-0041): per-delivery and per-attempt execution state (queue wait, apply time, end-to-end age,
--      deliveries, attempts, items, unresolved dependencies, failure class) as views over the ledgers.

-- ============================================================
-- §1 The outbox's declared partition and sequence; the event schema version.
-- ============================================================
CREATE TABLE objects.outbox_partitions (
  partition_key text PRIMARY KEY,               -- 'platform' | 'tenant:<uuid>' — the audit chain's partition id
  next_seq      bigint NOT NULL DEFAULT 1 CHECK (next_seq >= 1),
  updated_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE objects.object_outbox
  ADD COLUMN partition_key  text,
  ADD COLUMN partition_seq  bigint,
  ADD COLUMN schema_version text NOT NULL DEFAULT 'v1';
COMMENT ON COLUMN objects.object_outbox.partition_key IS 'The declared ordering scope: the audit chain partition (platform | tenant:<id>). Order is guaranteed within it, never across.';
COMMENT ON COLUMN objects.object_outbox.partition_seq IS 'The event''s ordinal in its partition — assigned at enqueue under the partition''s lock, after the AUD row under the same partition''s chain-head lock, so it is the commit order.';
COMMENT ON COLUMN objects.object_outbox.schema_version IS 'The event payload''s schema version (payload.schema_version, or v1 for an event that predates versioned payloads).';

-- Backfill: every existing row takes its place in its partition by (created_at, id) — the order the publisher used to
-- hand rows out; the true commit order of rows written before 0064 is not recorded anywhere and is not claimed here.
-- The immutability trigger is the migrator's to suspend for this one statement (no other column moves; the trigger
-- is re-armed below and from then on refuses any change to these columns too).
ALTER TABLE objects.object_outbox DISABLE TRIGGER object_outbox_immutable;
WITH ordered AS (
  SELECT id,
         CASE WHEN scope = 'PLATFORM' OR tenant_id IS NULL THEN 'platform' ELSE 'tenant:' || tenant_id::text END AS pk,
         row_number() OVER (PARTITION BY CASE WHEN scope = 'PLATFORM' OR tenant_id IS NULL THEN 'platform' ELSE 'tenant:' || tenant_id::text END ORDER BY created_at, id) AS seq,
         coalesce(payload ->> 'schema_version', 'v1') AS sv
    FROM objects.object_outbox
)
UPDATE objects.object_outbox o SET partition_key = x.pk, partition_seq = x.seq, schema_version = x.sv FROM ordered x WHERE o.id = x.id;
INSERT INTO objects.outbox_partitions (partition_key, next_seq)
SELECT partition_key, max(partition_seq) + 1 FROM objects.object_outbox WHERE partition_key IS NOT NULL GROUP BY partition_key
ON CONFLICT (partition_key) DO UPDATE SET next_seq = greatest(objects.outbox_partitions.next_seq, EXCLUDED.next_seq);
ALTER TABLE objects.object_outbox ENABLE TRIGGER object_outbox_immutable;
ALTER TABLE objects.object_outbox ALTER COLUMN partition_key SET NOT NULL, ALTER COLUMN partition_seq SET NOT NULL;
CREATE UNIQUE INDEX object_outbox_partition_seq ON objects.object_outbox (partition_key, partition_seq);

-- The backfill above ran as the migrator; the immutability trigger below refuses every later change of these columns.
CREATE OR REPLACE FUNCTION objects.enforce_outbox_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = objects, public, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.causation_id IS DISTINCT FROM OLD.causation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.partition_key IS DISTINCT FROM OLD.partition_key
     OR NEW.partition_seq IS DISTINCT FROM OLD.partition_seq
     OR NEW.schema_version IS DISTINCT FROM OLD.schema_version THEN
    RAISE EXCEPTION 'outbox event identity and content are immutable after insertion'
      USING ERRCODE = '42501';
  END IF;
  IF public.eye_op_class() IS DISTINCT FROM 'outbox' THEN
    RAISE EXCEPTION 'outbox status changes require the publish capability' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- Enqueue assigns the partition and the next sequence under the partition row's lock. The AUD row of the same
-- operation was appended a moment earlier under audit.audit_chain_heads' lock for the same partition and both locks
-- are held to commit, so two writers of one partition never interleave: sequence order is commit order.
CREATE OR REPLACE FUNCTION objects.enqueue_event(
  p_id uuid, p_event_type text, p_payload jsonb, p_correlation uuid, p_causation uuid
) RETURNS void
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_tenant uuid := public.eye_tenant();
  v_domain uuid := public.eye_domain();
  v_pk text; v_seq bigint;
BEGIN
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'outbox rejected: authority mode required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
  IF NOT public.eye_row_writable(v_scope, v_tenant, v_domain) THEN
    RAISE EXCEPTION 'outbox rejected: context not authorized' USING ERRCODE = '42501';
  END IF;
  v_pk := CASE WHEN v_scope = 'PLATFORM' OR v_tenant IS NULL THEN 'platform' ELSE 'tenant:' || v_tenant::text END;
  INSERT INTO objects.outbox_partitions (partition_key) VALUES (v_pk) ON CONFLICT (partition_key) DO NOTHING;
  UPDATE objects.outbox_partitions SET next_seq = next_seq + 1, updated_at = clock_timestamp() WHERE partition_key = v_pk RETURNING next_seq - 1 INTO v_seq;
  -- status/published_at/lease are database-controlled, never caller-supplied.
  INSERT INTO objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, status, published_at,
                                     partition_key, partition_seq, schema_version)
  VALUES (p_id, v_scope, v_tenant, v_domain, p_event_type, p_payload, p_correlation, p_causation, 'pending', NULL,
          v_pk, v_seq, coalesce(p_payload ->> 'schema_version', 'v1'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.enqueue_event(uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.enqueue_event(uuid, text, jsonb, uuid, uuid) TO eye_commit;

-- The publisher's lease hands rows out in PARTITION SEQUENCE order — the commit order within a partition, which the
-- 0015 order by created_at (the transaction's start) was not: a write that started later but committed earlier took
-- a lower sequence and a later created_at, and the domain queue received it out of order. A lower sequence is always
-- committed before a higher one of the same partition (the lock is held to commit), so a snapshot that sees a row
-- sees every earlier row of its partition: ordering by sequence is complete as well as correct. Across partitions the
-- order is the key's and means nothing. The routed job carries the partition and sequence.
DROP FUNCTION IF EXISTS objects.outbox_lease_as_publisher(int, int);
DROP FUNCTION IF EXISTS objects.outbox_lease(int, int);
CREATE FUNCTION objects.outbox_lease(p_limit int, p_lease_seconds int DEFAULT 60)
RETURNS TABLE (id uuid, lease_id uuid, event_type text, payload jsonb,
               correlation_id uuid, causation_id uuid, tenant_id uuid, domain_id uuid, partition_key text, partition_seq bigint, schema_version text)
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
DECLARE
  v_lease uuid := gen_random_uuid();
  v_ttl int := least(greatest(coalesce(p_lease_seconds, 60), 1), 300);
  v_budget constant int := 10;
BEGIN
  PERFORM ctx.assert_capability('publish', 'outbox', 'objects.outbox.publish');
  UPDATE objects.object_outbox o
     SET status = 'dead_letter', lease_id = NULL, leased_until = NULL
   WHERE o.status = 'pending'
     AND o.attempts >= v_budget
     AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp());
  -- FAIR ACROSS PARTITIONS, ORDERED WITHIN: the batch takes each partition's lowest pending sequences first,
  -- round-robin (the first of every partition, then the second of every partition, …), so a partition with a
  -- sustained backlog never starves the others and no partition's later sequence is leased before an earlier one.
  RETURN QUERY
  WITH ranked AS (
    SELECT o.id, o.partition_key, o.partition_seq,
           row_number() OVER (PARTITION BY o.partition_key ORDER BY o.partition_seq) AS rn
      FROM objects.object_outbox o
     WHERE o.status = 'pending'
       AND o.attempts < v_budget
       AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp())
  ), chosen AS (
    SELECT r.id FROM ranked r ORDER BY r.rn, r.partition_key, r.partition_seq LIMIT least(greatest(coalesce(p_limit, 50), 1), 500)
  ), claimed AS (
    SELECT o.id FROM objects.object_outbox o WHERE o.id IN (SELECT c.id FROM chosen c)
       AND o.status = 'pending' AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp())
     FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE objects.object_outbox o
       SET lease_id = v_lease,
           leased_until = clock_timestamp() + make_interval(secs => v_ttl),
           attempts = o.attempts + 1
      FROM claimed c WHERE o.id = c.id
      RETURNING o.id, o.lease_id, o.event_type, o.payload, o.correlation_id,
                o.causation_id, o.tenant_id, o.domain_id, o.partition_key, o.partition_seq, o.schema_version, o.created_at
  )
  SELECT l.id, l.lease_id, l.event_type, l.payload, l.correlation_id, l.causation_id, l.tenant_id, l.domain_id, l.partition_key, l.partition_seq, l.schema_version
    FROM leased l ORDER BY l.partition_key, l.partition_seq;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_lease(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_lease(int, int) TO eye_publisher;

-- 0057's publisher-authority wrapper takes the new shape too (its body unchanged: the publish capability, then the lease).
CREATE FUNCTION objects.outbox_lease_as_publisher(p_limit int, p_lease_seconds int DEFAULT 60)
RETURNS TABLE (id uuid, lease_id uuid, event_type text, payload jsonb,
               correlation_id uuid, causation_id uuid, tenant_id uuid, domain_id uuid, partition_key text, partition_seq bigint, schema_version text)
SECURITY DEFINER SET search_path = objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.issue_publish(NULL::uuid);
  RETURN QUERY SELECT * FROM objects.outbox_lease(p_limit, p_lease_seconds);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_lease_as_publisher(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_lease_as_publisher(int, int) TO eye_publisher;

-- ============================================================
-- §2 Served from a point; the cursor's sequence.
-- ============================================================
ALTER TABLE graph.subscriptions
  ADD COLUMN served_from     timestamptz NOT NULL DEFAULT '-infinity',
  ADD COLUMN served_from_seq bigint NOT NULL DEFAULT 0,
  ADD COLUMN checkpoint_seq  bigint;
COMMENT ON COLUMN graph.subscriptions.served_from_seq IS 'Outbox rows of the tenant''s partition at or after this SEQUENCE are this subscription''s: the partition''s next sequence at registration for backlog_policy leave (a write still open at registration that has not taken its sequence is included; one that has is the backlog), 0 for replay. The sequence is the declared cursor; served_from (an instant) is the record of when.';
-- Existing subscriptions registered to LEAVE their backlog were served from their registration; those registered to replay it, from the beginning.
UPDATE graph.subscriptions s SET served_from = CASE WHEN coalesce(budgets ->> 'backlog_policy', 'leave') = 'leave' THEN created_at ELSE '-infinity'::timestamptz END;
UPDATE graph.subscriptions s SET served_from_seq = CASE WHEN coalesce(budgets ->> 'backlog_policy', 'leave') = 'leave'
  THEN coalesce((SELECT min(x.partition_seq) FROM objects.object_outbox x WHERE x.partition_key = 'tenant:' || s.tenant_id::text AND x.created_at >= s.created_at), (SELECT p.next_seq FROM objects.outbox_partitions p WHERE p.partition_key = 'tenant:' || s.tenant_id::text), 1)
  ELSE 0 END;
UPDATE graph.subscriptions s SET checkpoint_seq = x.partition_seq FROM objects.object_outbox x WHERE x.id = s.checkpoint_event_id;

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
  -- (the registration's own write is a sequence too — the point is the one after it), 'replay' from the beginning — each past row once.
  IF coalesce(p_budgets ->> 'backlog_policy', 'leave') = 'replay' THEN
    v_from := '-infinity'::timestamptz; v_from_seq := 0;
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
-- §3 Unresolved work, failure classes.
-- ============================================================
ALTER TABLE graph.subscription_deliveries DROP CONSTRAINT subscription_deliveries_state_check;
ALTER TABLE graph.subscription_deliveries ADD CONSTRAINT subscription_deliveries_state_check CHECK (state IN ('received', 'applied', 'failed', 'refused', 'unresolved'));
ALTER TABLE graph.subscription_deliveries DROP CONSTRAINT gsd_finished;
ALTER TABLE graph.subscription_deliveries ADD CONSTRAINT gsd_finished CHECK ((state IN ('applied', 'failed', 'refused', 'unresolved')) = (finished_at IS NOT NULL));
ALTER TABLE graph.subscription_deliveries
  ADD COLUMN items_unresolved jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items_unresolved) = 'array'),  -- [{item, effect, effect_ref, reason, checks, first_at, at}]
  ADD COLUMN unresolved_since timestamptz,
  ADD COLUMN failure_class    text CHECK (failure_class IS NULL OR failure_class IN ('authority_disputed', 'consumer_unavailable', 'provenance_incomplete', 'executed_action', 'legal_hold', 'material_change', 'unresolved_dependency', 'budget', 'infrastructure')),
  ADD COLUMN disposition      text CHECK (disposition IS NULL OR disposition IN ('retry', 'compensation', 'challenge', 'human_review')),
  ADD COLUMN partition_seq    bigint;
UPDATE graph.subscription_deliveries d SET partition_seq = x.partition_seq FROM objects.object_outbox x WHERE x.id = d.event_id;
COMMENT ON COLUMN graph.subscription_deliveries.items_unresolved IS 'Items whose effect found OPERATOR WORK (a projection mismatch): recorded, never checkpointed as applied; re-checked at every re-drive until a check passes.';
COMMENT ON COLUMN graph.subscription_deliveries.failure_class IS 'AU-MEM-0039: the class of a non-applied delivery''s failure state, with its disposition — the route it is sent down.';

ALTER TABLE graph.subscription_delivery_events DROP CONSTRAINT subscription_delivery_events_event_check;
ALTER TABLE graph.subscription_delivery_events ADD CONSTRAINT subscription_delivery_events_event_check
  CHECK (event IN ('received', 'applying', 'item.applied', 'item.unresolved', 'applied', 'failed', 'refused', 'unresolved', 'replayed'));

-- An item's effect found operator work: recorded as UNRESOLVED inside the effect's own transaction (the check it made
-- is committed with it — evidence), the item NOT added to items_applied. The next begin answers true again.
CREATE OR REPLACE FUNCTION graph.subscription_item_unresolved(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_item text, p_action text, p_effect text, p_effect_ref uuid, p_reason text, p_details jsonb)
RETURNS int
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d graph.subscription_deliveries%ROWTYPE; v_prev jsonb; v_checks int := 1; v_first timestamptz := clock_timestamp();
BEGIN
  IF p_action NOT IN ('twin.subscription.apply', 'prediction.forecast.subscription.apply', 'prediction.scenario.subscription.apply',
                      'decision.subscription.apply', 'graph.retrieval.subscription.apply', 'graph.mapping.subscription.apply') THEN
    RAISE EXCEPTION 'subscription item rejected: % is not a consumer action', p_action USING ERRCODE = '22023';
  END IF;
  PERFORM observation.assert_authority(ARRAY[p_action]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO d FROM graph.subscription_deliveries WHERE event_id = p_event_id AND subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND OR d.state <> 'received' THEN RAISE EXCEPTION 'subscription item rejected: delivery of event % to subscription % is not being applied', p_event_id, p_subscription_id USING ERRCODE = '22023'; END IF;
  IF NOT (d.items ? p_item) THEN RAISE EXCEPTION 'subscription item rejected: % is not an item of this delivery', p_item USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d.items_applied) w WHERE w ->> 'item' = p_item) THEN
    RAISE EXCEPTION 'subscription item rejected: % was already applied for this delivery', p_item USING ERRCODE = '23505';
  END IF;
  IF d.principal_id IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'subscription item rejected: the applying principal is not the subscriber the delivery was received for' USING ERRCODE = '42501';
  END IF;
  SELECT w INTO v_prev FROM jsonb_array_elements(d.items_unresolved) w WHERE w ->> 'item' = p_item;
  IF v_prev IS NOT NULL THEN v_checks := coalesce((v_prev ->> 'checks')::int, 0) + 1; v_first := coalesce((v_prev ->> 'first_at')::timestamptz, v_first); END IF;
  UPDATE graph.subscription_deliveries
     SET items_unresolved = (SELECT coalesce(jsonb_agg(w), '[]'::jsonb) FROM jsonb_array_elements(items_unresolved) w WHERE w ->> 'item' <> p_item)
                            || jsonb_build_object('item', p_item, 'effect', p_effect, 'effect_ref', p_effect_ref, 'reason', left(p_reason, 500), 'checks', v_checks, 'first_at', v_first, 'at', clock_timestamp(), 'details', coalesce(p_details, '{}'::jsonb)),
         unresolved_since = coalesce(unresolved_since, v_first)
   WHERE event_id = p_event_id AND subscription_id = p_subscription_id;
  INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, p_subscription_id, 'item.unresolved', public.eye_principal(),
          jsonb_build_object('item', p_item, 'effect', p_effect, 'effect_ref', p_effect_ref, 'reason', left(p_reason, 500), 'checks', v_checks) || coalesce(p_details, '{}'::jsonb), d.correlation_id);
  RETURN v_checks;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_item_unresolved(uuid,uuid,uuid,uuid,text,text,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_item_unresolved(uuid,uuid,uuid,uuid,text,text,text,uuid,text,jsonb) TO eye_commit;

-- An item applied after having been unresolved is resolved: it leaves items_unresolved (the record of the checks stays on the event log).
CREATE OR REPLACE FUNCTION graph.subscription_item_done(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_item text, p_action text, p_effect text, p_effect_ref uuid, p_details jsonb)
RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d graph.subscription_deliveries%ROWTYPE; v_was jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO d FROM graph.subscription_deliveries WHERE event_id = p_event_id AND subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND OR d.state <> 'received' THEN RAISE EXCEPTION 'subscription item rejected: delivery of event % to subscription % is not being applied', p_event_id, p_subscription_id USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d.items_applied) w WHERE w ->> 'item' = p_item) THEN
    RAISE EXCEPTION 'subscription item rejected: % was already applied for this delivery', p_item USING ERRCODE = '23505';
  END IF;
  SELECT w INTO v_was FROM jsonb_array_elements(d.items_unresolved) w WHERE w ->> 'item' = p_item;
  UPDATE graph.subscription_deliveries
     SET items_applied = items_applied || jsonb_build_object('item', p_item, 'effect', p_effect, 'effect_ref', p_effect_ref, 'details', coalesce(p_details, '{}'::jsonb), 'at', clock_timestamp(),
                                                             'resolved_after_checks', CASE WHEN v_was IS NULL THEN NULL ELSE (v_was ->> 'checks')::int END),
         items_unresolved = (SELECT coalesce(jsonb_agg(w), '[]'::jsonb) FROM jsonb_array_elements(items_unresolved) w WHERE w ->> 'item' <> p_item)
   WHERE event_id = p_event_id AND subscription_id = p_subscription_id;
  INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, p_subscription_id, 'item.applied', public.eye_principal(),
          jsonb_build_object('item', p_item, 'effect', p_effect, 'effect_ref', p_effect_ref, 'resolved_after_checks', CASE WHEN v_was IS NULL THEN NULL ELSE (v_was ->> 'checks')::int END) || coalesce(p_details, '{}'::jsonb), d.correlation_id);
END $$ LANGUAGE plpgsql;

-- Finish decides the outcome with its class and disposition. 'unresolved': items are open (operator work); the delivery
-- is not terminal for the reconciliation, which re-drives it after the re-check interval. The checkpoint never
-- advances over it. An 'applied' request with unresolved items is 'unresolved', not applied, whatever the caller said.
CREATE OR REPLACE FUNCTION graph.subscription_delivery_finish(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_error text, p_failure_class text, p_disposition text)
RETURNS text
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d graph.subscription_deliveries%ROWTYPE; s graph.subscriptions%ROWTYPE; v_state text; v_n int; v_done int; v_open int; v_error text := p_error;
        v_class text := p_failure_class; v_disp text := p_disposition;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_outcome NOT IN ('applied', 'failed', 'refused', 'unresolved') THEN RAISE EXCEPTION 'delivery outcome is applied, failed, refused or unresolved' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM graph.subscription_deliveries WHERE event_id = p_event_id AND subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery finish rejected: no delivery for event % to subscription %', p_event_id, p_subscription_id USING ERRCODE = '23503'; END IF;
  IF d.state = 'applied' THEN RETURN d.state; END IF;   -- terminal already; a late finish changes nothing
  v_n := jsonb_array_length(d.items); v_done := jsonb_array_length(d.items_applied); v_open := jsonb_array_length(d.items_unresolved);
  IF p_outcome = 'applied' OR p_outcome = 'unresolved' THEN
    -- THE DATABASE DECIDES: applied only when every resolved item was applied; unresolved when the open ones are operator work.
    IF v_done >= v_n AND v_open = 0 THEN v_state := 'applied';
    ELSIF v_open > 0 THEN
      v_state := 'unresolved'; v_class := coalesce(v_class, 'unresolved_dependency'); v_disp := coalesce(v_disp, 'human_review');
      v_error := coalesce(v_error, format('%s item(s) unresolved (operator work); %s of %s applied', v_open, v_done, v_n));
    ELSE
      v_state := 'failed'; v_class := coalesce(v_class, 'infrastructure'); v_disp := coalesce(v_disp, 'retry');
      v_error := coalesce(v_error, format('%s of %s item(s) applied; the rest were not', v_done, v_n));
    END IF;
  ELSE
    v_state := p_outcome;
    v_class := coalesce(v_class, CASE p_outcome WHEN 'refused' THEN 'authority_disputed' ELSE 'infrastructure' END);
    v_disp := coalesce(v_disp, CASE p_outcome WHEN 'refused' THEN 'human_review' ELSE 'retry' END);
  END IF;
  UPDATE graph.subscription_deliveries
     SET state = v_state, last_error = CASE WHEN v_state = 'applied' THEN NULL ELSE left(v_error, 500) END, finished_at = clock_timestamp(),
         failure_class = CASE WHEN v_state = 'applied' THEN NULL ELSE v_class END,
         disposition   = CASE WHEN v_state = 'applied' THEN NULL ELSE v_disp END,
         unresolved_since = CASE WHEN v_state = 'applied' THEN NULL ELSE unresolved_since END
   WHERE event_id = p_event_id AND subscription_id = p_subscription_id;
  INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, p_subscription_id, v_state, d.principal_id,
          jsonb_build_object('error', left(v_error, 500), 'failure_class', CASE WHEN v_state = 'applied' THEN NULL ELSE v_class END, 'disposition', CASE WHEN v_state = 'applied' THEN NULL ELSE v_disp END,
                             'attempts', d.attempts, 'deliveries', d.deliveries, 'items', v_n, 'items_applied', v_done, 'items_unresolved', v_open), d.correlation_id);
  -- THE CURSOR IS THE PARTITION SEQUENCE (AU-DP-0071: never a timestamp): it advances only over a contiguous
  -- applied prefix in sequence order; (created_at, id) is kept beside it for the record.
  IF v_state = 'applied' THEN
    SELECT * INTO s FROM graph.subscriptions WHERE subscription_id = p_subscription_id FOR UPDATE;
    IF (s.checkpoint_seq IS NULL OR d.partition_seq > s.checkpoint_seq)
       AND NOT EXISTS (SELECT 1 FROM graph.subscription_deliveries e
                        WHERE e.subscription_id = p_subscription_id AND e.state <> 'applied'
                          AND e.partition_seq < d.partition_seq) THEN
      UPDATE graph.subscriptions SET checkpoint_created_at = d.outbox_created_at, checkpoint_event_id = d.event_id, checkpoint_seq = d.partition_seq WHERE subscription_id = p_subscription_id;
      INSERT INTO graph.subscription_events (event_id, scope, tenant_id, domain_id, subscription_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_subscription_id, 'checkpoint.advanced', d.principal_id,
              jsonb_build_object('event_id', d.event_id, 'outbox_created_at', d.outbox_created_at, 'partition_seq', d.partition_seq), d.correlation_id);
    END IF;
  END IF;
  RETURN v_state;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_delivery_finish(uuid,uuid,uuid,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_delivery_finish(uuid,uuid,uuid,uuid,text,text,text,text) TO eye_commit;
-- The 0063 shape stays callable (class and disposition defaulted by outcome).
CREATE OR REPLACE FUNCTION graph.subscription_delivery_finish(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_error text)
RETURNS text
SECURITY DEFINER SET search_path = graph, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  RETURN graph.subscription_delivery_finish(p_event_id, p_subscription_id, p_tenant, p_domain, p_outcome, p_error, NULL, NULL);
END $$ LANGUAGE plpgsql;

-- The receive port: a LIVE job (the publisher's, no scope) fans the event out to every active subscription whose
-- served point is at or before the event's sequence; a RE-DRIVE names the subscriptions it is for (p_only) and
-- touches no other — so one subscription's re-check never reopens another's refused or unresolved delivery and a
-- subscription registered to leave its backlog is never handed a past event by someone else's re-drive. A new
-- delivery row carries the subscription's current replay generation.
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

-- The reconciliation: 'unresolved' deliveries are re-driven after the re-check interval (immediately at a start, a
-- registration, a resume or a replay; after p_recheck on the tick); every row is bounded by the subscription's served_from.
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
       -- a row this subscription never received: its own from its served point on, past the cursor (or inside the look-back)
       AND ((d.event_id IS NULL AND x.partition_seq >= s.served_from_seq
             AND (s.checkpoint_seq IS NULL OR x.partition_seq > s.checkpoint_seq OR x.created_at > clock_timestamp() - coalesce(p_lookback, interval '24 hours')))
         -- a delivery that exists is ALWAYS reconciled by its state, wherever its row lies (a replay's, a write that straddled the registration)
         OR d.state IN ('received', 'failed')
         OR (d.state = 'unresolved' AND d.last_delivered_at <= clock_timestamp() - coalesce(p_recheck, interval '0'))
         OR (p_include_refused AND d.state = 'refused'))
     ORDER BY x.partition_key, x.partition_seq;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_deliveries_to_reconcile(boolean, interval, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_deliveries_to_reconcile(boolean, interval, interval) TO eye_commit;
DROP FUNCTION IF EXISTS graph.subscription_deliveries_to_reconcile(boolean, interval);

-- A replay may name a sequence in the partition instead of (created_at, id); it reopens unresolved work too.
CREATE OR REPLACE FUNCTION graph.subscription_replay(
  p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_from_created_at timestamptz, p_from_event_id uuid, p_reason text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS TABLE (event_id uuid, event_type text, change_kind text, outbox_created_at timestamptz, correlation_id uuid, causation_id uuid, replay_seq int)
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.subscriptions%ROWTYPE; v_seq int; v_reopened int; v_from_seq bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.subscription.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'a replay states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM graph.subscriptions WHERE subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no subscription % in this domain', p_subscription_id USING ERRCODE = '23503'; END IF;
  IF s.status <> 'active' THEN RAISE EXCEPTION 'replay rejected: the subscription is %', s.status USING ERRCODE = '23503'; END IF;
  -- The point named by (created_at, id) is resolved to its SEQUENCE; everything after it is replayed in sequence order.
  IF p_from_event_id IS NOT NULL THEN
    SELECT x.partition_seq INTO v_from_seq FROM objects.object_outbox x WHERE x.id = p_from_event_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF v_from_seq IS NULL THEN RAISE EXCEPTION 'replay rejected: % is not a published event of this domain', p_from_event_id USING ERRCODE = '23503'; END IF;
  END IF;
  v_seq := s.replay_seq + 1;
  -- THE CURSOR ONLY MOVES BACK: a point beyond it would carry the cursor over open work and strand it.
  IF s.checkpoint_seq IS NULL OR v_from_seq IS NULL OR v_from_seq < s.checkpoint_seq THEN
    UPDATE graph.subscriptions SET replay_seq = v_seq, checkpoint_created_at = p_from_created_at, checkpoint_event_id = p_from_event_id, checkpoint_seq = v_from_seq WHERE subscription_id = p_subscription_id;
  ELSE
    UPDATE graph.subscriptions SET replay_seq = v_seq WHERE subscription_id = p_subscription_id;
  END IF;
  UPDATE graph.subscription_deliveries d
     SET state = 'received', finished_at = NULL, items_applied = '[]'::jsonb, items_unresolved = '[]'::jsonb, unresolved_since = NULL, failure_class = NULL, disposition = NULL,
         last_error = NULL, replay_seq = v_seq, last_delivered_at = clock_timestamp()
   WHERE d.subscription_id = p_subscription_id
     AND (v_from_seq IS NULL OR d.partition_seq > v_from_seq);
  GET DIAGNOSTICS v_reopened = ROW_COUNT;
  INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
  SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, d.event_id, d.subscription_id, 'replayed', p_actor, jsonb_build_object('replay_seq', v_seq, 'reason', p_reason), p_correlation
    FROM graph.subscription_deliveries d WHERE d.subscription_id = p_subscription_id AND d.replay_seq = v_seq;
  INSERT INTO graph.subscription_events (event_id, scope, tenant_id, domain_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_subscription_id, 'subscription.replayed', p_actor,
          jsonb_build_object('replay_seq', v_seq, 'from_created_at', p_from_created_at, 'from_event_id', p_from_event_id, 'from_partition_seq', v_from_seq, 'reopened', v_reopened, 'reason', p_reason), p_correlation);
  RETURN QUERY
    SELECT x.id, x.event_type, coalesce(x.payload #>> '{change,kind}', ''), x.created_at, x.correlation_id, x.causation_id, v_seq
      FROM objects.object_outbox x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'published' AND x.event_type = ANY (s.event_types)
       AND (NOT (s.filter ? 'change_kinds') OR s.filter -> 'change_kinds' ? coalesce(x.payload #>> '{change,kind}', ''))
       AND (v_from_seq IS NULL OR x.partition_seq > v_from_seq)
     ORDER BY x.partition_key, x.partition_seq;
END $$ LANGUAGE plpgsql;

-- A replay from a SEQUENCE in the partition (the declared cursor): the same act, the point named by its ordinal —
-- resolved to the latest row of THIS domain at or before it (other domains share the tenant's sequence).
CREATE OR REPLACE FUNCTION graph.subscription_replay_from_seq(
  p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_from_seq bigint, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS TABLE (event_id uuid, event_type text, change_kind text, outbox_created_at timestamptz, correlation_id uuid, causation_id uuid, replay_seq int)
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz; v_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.subscription.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT x.created_at, x.id INTO v_at, v_id FROM objects.object_outbox x
   WHERE x.partition_key = 'tenant:' || p_tenant::text AND x.partition_seq <= p_from_seq AND x.tenant_id = p_tenant AND x.domain_id = p_domain
   ORDER BY x.partition_seq DESC LIMIT 1;
  IF v_id IS NULL THEN
    RETURN QUERY SELECT * FROM graph.subscription_replay(p_subscription_id, p_tenant, p_domain, NULL::timestamptz, NULL::uuid, p_reason, p_actor, p_event_id, p_correlation);
  ELSE
    RETURN QUERY SELECT * FROM graph.subscription_replay(p_subscription_id, p_tenant, p_domain, v_at, v_id, p_reason, p_actor, p_event_id, p_correlation);
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_replay_from_seq(uuid,uuid,uuid,bigint,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_replay_from_seq(uuid,uuid,uuid,bigint,text,uuid,uuid,uuid) TO eye_commit;

-- Outbox rows the publisher gave up on are DEAD-LETTERED (0015: status 'dead_letter'); 0063 looked for 'failed', which
-- the publisher never writes, so a retired row of a subscribed type was invisible. Both spellings are reported; the
-- sequence gap a dead letter leaves is visible in the reconciliation report, never silently passed.
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

-- The event row is readable as soon as it is LEASED for publication: the publisher adds the routed job before it
-- acknowledges the row, and a worker that wins that race must not refuse the job as "not published" (0063 did, and
-- the delivery then waited for the reconciliation). The row's content is immutable from insertion; only its status moves.
CREATE OR REPLACE FUNCTION graph.subscription_event_row(p_event_id uuid, p_tenant uuid, p_domain uuid)
RETURNS TABLE (event_type text, payload jsonb, created_at timestamptz)
SECURITY DEFINER SET search_path = graph, objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY SELECT x.event_type, x.payload, x.created_at FROM objects.object_outbox x
    WHERE x.id = p_event_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status IN ('pending', 'published') AND x.event_type IN ('GraphChanged', 'MemoryCorrected')
      AND (x.status = 'published' OR x.lease_id IS NOT NULL);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §4 Telemetry (AU-MEM-0041): execution state per delivery and per propagation attempt, from the ledgers.
-- ============================================================
-- The views run as the INVOKER (security_invoker): the underlying ledgers are under forced RLS (graph_isolation),
-- and a view executed with its owner's rights would read past it — a tenant would see every tenant's telemetry.
CREATE OR REPLACE VIEW graph.subscription_delivery_telemetry WITH (security_invoker = true) AS
SELECT d.tenant_id, d.domain_id, d.event_id, d.subscription_id, d.consumer_kind, d.event_type, d.change_kind, d.partition_seq, d.state,
       d.failure_class, d.disposition, d.deliveries, d.attempts, d.replay_seq,
       jsonb_array_length(d.items) AS items, jsonb_array_length(d.items_applied) AS items_applied, jsonb_array_length(d.items_unresolved) AS items_unresolved,
       d.outbox_created_at, d.first_received_at, d.last_delivered_at, d.finished_at, d.unresolved_since,
       (SELECT min(e.occurred_at) FROM graph.subscription_delivery_events e WHERE e.outbox_event_id = d.event_id AND e.subscription_id = d.subscription_id AND e.event = 'applying') AS first_applying_at,
       (SELECT max(e.occurred_at) FROM graph.subscription_delivery_events e WHERE e.outbox_event_id = d.event_id AND e.subscription_id = d.subscription_id AND e.event = 'received') AS last_received_at,
       -- queue wait: from the change's publication to the first receipt; apply time: first apply to finish; end-to-end: publication to finish (or now, while open)
       x.published_at,
       -- publication latency: the writer's transaction start to the publisher's acknowledgement; queue wait: publication to the first receipt
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

-- RLS: both views are security_invoker over tables under forced RLS (graph_isolation) — nothing widens; a tenant reads its own.

-- ============================================================
-- §5 Legal holds on evidence (AU-MEM-0039: "a legal hold conflicting with deletion").
--    A manifest is immutable (0022, append-only), and its `legal_hold` is the flag it was ADMITTED with. A hold
--    placed later is its own governed, append-only record: placed by a person under `observation.legal_hold.place`,
--    lifted under `observation.legal_hold.lift` by a further row — never an update. A withdrawal correction that
--    would supersede held evidence FAILS before any object is touched (the check in the apply path reads both the
--    admission flag and the active holds); nothing in the correction path lifts a hold.
-- ============================================================
CREATE TABLE observation.legal_holds (
  hold_id        uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  manifest_id    uuid NOT NULL REFERENCES observation.blob_manifests (manifest_id),
  evd_object_id  uuid,                                   -- the evidence object the hold was placed through, when placed by object
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 8),
  placed_by      uuid NOT NULL,
  placed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  lifted_by      uuid,
  lifted_at      timestamptz,
  lift_reason    text,
  correlation_id uuid NOT NULL,
  CONSTRAINT lh_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT lh_lift_pair CHECK ((lifted_by IS NULL) = (lifted_at IS NULL) AND (lifted_at IS NULL OR length(btrim(lift_reason)) >= 8))
);
CREATE INDEX lh_manifest_active ON observation.legal_holds (manifest_id) WHERE lifted_at IS NULL;
-- A lift is the ONE change a hold row takes, once, by the lift port; everything else is append-only.
CREATE OR REPLACE FUNCTION observation.legal_holds_lift_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table observation.legal_holds is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF NEW.hold_id IS DISTINCT FROM OLD.hold_id OR NEW.manifest_id IS DISTINCT FROM OLD.manifest_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.placed_by IS DISTINCT FROM OLD.placed_by OR NEW.placed_at IS DISTINCT FROM OLD.placed_at OR OLD.lifted_at IS NOT NULL THEN
    RAISE EXCEPTION 'a legal hold is lifted once; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lh_lift_only BEFORE UPDATE OR DELETE ON observation.legal_holds FOR EACH ROW EXECUTE FUNCTION observation.legal_holds_lift_only();
ALTER TABLE observation.legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation.legal_holds FORCE ROW LEVEL SECURITY;
CREATE POLICY observation_isolation ON observation.legal_holds
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON observation.legal_holds TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION observation.place_legal_hold(p_hold_id uuid, p_tenant uuid, p_domain uuid, p_evd_object_id uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS uuid
SECURITY DEFINER SET search_path = observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_manifest uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.legal_hold.place']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT (o.payload ->> 'manifest_id')::uuid INTO v_manifest FROM objects.canonical_objects o
   WHERE o.object_id = p_evd_object_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' ORDER BY o.object_version DESC LIMIT 1;
  IF v_manifest IS NULL OR NOT EXISTS (SELECT 1 FROM observation.blob_manifests m WHERE m.manifest_id = v_manifest AND m.tenant_id = p_tenant AND m.domain_id = p_domain) THEN
    RAISE EXCEPTION 'legal hold rejected: no evidence object with a manifest matches in this domain' USING ERRCODE = '23503';
  END IF;
  INSERT INTO observation.legal_holds (hold_id, scope, tenant_id, domain_id, manifest_id, evd_object_id, reason, placed_by, correlation_id)
  VALUES (p_hold_id, 'DOMAIN', p_tenant, p_domain, v_manifest, p_evd_object_id, p_reason, p_actor, p_correlation);
  RETURN v_manifest;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.place_legal_hold(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.place_legal_hold(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.lift_legal_hold(p_hold_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.legal_hold.lift']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE observation.legal_holds SET lifted_by = p_actor, lifted_at = clock_timestamp(), lift_reason = p_reason
   WHERE hold_id = p_hold_id AND tenant_id = p_tenant AND domain_id = p_domain AND lifted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'legal hold lift rejected: no active hold % in this domain', p_hold_id USING ERRCODE = '23503'; END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.lift_legal_hold(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.lift_legal_hold(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;
