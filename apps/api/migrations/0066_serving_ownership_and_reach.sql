-- 0066 — CP-6 batch B9: ownership across in-flight effects and take-over (the serving lifecycle of 0065 §3 closed);
--        then the next capabilities of PHASE6_REPORT §21.6 (sections §2 onward, each named where it begins).
--
-- WHY (Codex's two B8 findings, 2026-09-12, reproduced at the database/queue boundary —
--      evidence/cp6/repro-serving-lifecycle-before.txt, apps/api/test/int/phase6-repro-serving-lifecycle.test.ts).
--   B8-F1  A handler that found its serving claim lapsed AWAITED ITS OWN COMPLETION: it awaited the scheduler's
--          worker stop, which awaited the worker's graceful close, which (as BullMQ documents) waits for the active
--          job — that handler. The job stayed ACTIVE for ever, the worker never closed, the process could not recover
--          the domain without a restart.
--   B8-F2  Ownership was checked ONLY AT THE JOB'S ENTRY. A delivery admitted just before its process's claim lapsed
--          resolved its items, applied them and finished AFTER another process had taken the domain over: item 2 and
--          the 'applied' landed 2.3 s after the take-over event, under the old holder — two holders' effects
--          overlapped, and the subscriber's separate session grant (a run session of its own lifetime) said nothing
--          about which process was serving. Per-item idempotency for one event does not make the serving exclusive.
--
-- WHAT
--   §1 ONE OWNERSHIP BOUNDARY, BOUND TO EVERY EFFECT TRANSACTION. The serving claim carries a GENERATION (a new
--      claim or a take-over advances it; a renewal does not). Every governed transaction of a delivery — the event's
--      read, the receipt, the items' resolution, each item's write, the finish — first takes the domain's serving row
--      FOR KEY SHARE under the holder and generation the job was admitted with (`graph.subscription_serving_fence`):
--      a claim by another holder, another generation, or a lapsed claim refuses the transaction ('serving lost'), so
--      nothing of a stale holder's is written; a take-over rewrites the row FOR UPDATE and therefore WAITS for the
--      effects already in flight under the old claim to commit — effects never overlap and the new holder resumes
--      the unfinished delivery from the ledger's checkpoint. A renewal locks the row FOR NO KEY UPDATE, which effects
--      (KEY SHARE) do not block. The fence records the holder and generation on the transaction, and a trigger on
--      the delivery ledger names them on every event it writes: completion accounting says who finished what.
--      The stale handler settles at once (the dispatcher no longer awaits the worker's close from inside the job it
--      would wait for; the close is detached and tracked), the job returns to the queue and is delivered by the holder.
-- ============================================================

-- ============================================================
-- §1 The serving generation; the fence; the ledger names the holder.
-- ============================================================
ALTER TABLE graph.subscription_domain_serving ADD COLUMN generation bigint NOT NULL DEFAULT 1;
COMMENT ON COLUMN graph.subscription_domain_serving.generation IS 'Advances on every new claim and every take-over (never on a renewal), monotonic per domain across releases: the ownership a delivery was admitted under, checked by every effect transaction of that delivery (0066 §1).';
-- The generation is MONOTONIC PER DOMAIN across releases (a released claim deletes its row): a holder that lost the domain,
-- saw it released and claimed it again never meets the generation its stale transaction was admitted under.
CREATE TABLE graph.subscription_domain_generations (
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  last_generation bigint NOT NULL,
  PRIMARY KEY (tenant_id, domain_id)
);
REVOKE ALL ON graph.subscription_domain_generations FROM PUBLIC;
-- Read by the claim port only (SECURITY DEFINER); under FORCE row-level security like every graph table (the C7 control).
ALTER TABLE graph.subscription_domain_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.subscription_domain_generations FORCE ROW LEVEL SECURITY;
CREATE POLICY graph_isolation ON graph.subscription_domain_generations USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
INSERT INTO graph.subscription_domain_generations (tenant_id, domain_id, last_generation)
  SELECT tenant_id, domain_id, 1 FROM graph.subscription_domain_serving ON CONFLICT DO NOTHING;
CREATE FUNCTION graph.subscription_next_generation(p_tenant uuid, p_domain uuid) RETURNS bigint
SET search_path = graph, pg_catalog, pg_temp AS $$
  INSERT INTO graph.subscription_domain_generations (tenant_id, domain_id, last_generation) VALUES (p_tenant, p_domain, 1)
  ON CONFLICT (tenant_id, domain_id) DO UPDATE SET last_generation = graph.subscription_domain_generations.last_generation + 1
  RETURNING last_generation;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION graph.subscription_next_generation(uuid, uuid) FROM PUBLIC;

DROP FUNCTION IF EXISTS graph.subscription_domain_claim(uuid, uuid, text, int, text);
CREATE FUNCTION graph.subscription_domain_claim(p_tenant uuid, p_domain uuid, p_holder text, p_ttl_seconds int, p_take_over_from text DEFAULT NULL)
RETURNS TABLE (holder text, claimed_until timestamptz, mine boolean, taken_over boolean, generation bigint)
SECURITY DEFINER SET search_path = graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.subscription_domain_serving%ROWTYPE; v_ttl int := least(greatest(coalesce(p_ttl_seconds, 150), 5), 3600); v_prev text; v_event text; v_inserted int;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_holder IS NULL OR length(btrim(p_holder)) < 4 THEN RAISE EXCEPTION 'a serving claim names its holder' USING ERRCODE = '22023'; END IF;
  -- Two processes claiming a never-claimed domain at once: the insert is idempotent and the row is then locked by both in turn.
  -- A never-claimed (or released) domain: the row is inserted under the next generation; a losing racer's insert does nothing
  -- (its generation number is consumed, never used — generations need only be monotonic, not dense).
  INSERT INTO graph.subscription_domain_serving (tenant_id, domain_id, holder, claimed_until, generation)
  SELECT p_tenant, p_domain, p_holder, clock_timestamp() + make_interval(secs => v_ttl), graph.subscription_next_generation(p_tenant, p_domain)
   WHERE NOT EXISTS (SELECT 1 FROM graph.subscription_domain_serving x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain)
  ON CONFLICT (tenant_id, domain_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  -- A renewal changes no key and must not wait for the effects in flight under this very claim (they hold KEY SHARE).
  SELECT * INTO r FROM graph.subscription_domain_serving x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain FOR NO KEY UPDATE;
  IF v_inserted = 1 AND r.holder = p_holder THEN
    v_event := 'claimed';
  ELSIF r.holder = p_holder THEN
    UPDATE graph.subscription_domain_serving x SET claimed_until = clock_timestamp() + make_interval(secs => v_ttl), renewals = x.renewals + 1
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain RETURNING * INTO r;
    v_event := 'renewed';
  ELSIF r.claimed_until < clock_timestamp() OR (p_take_over_from IS NOT NULL AND r.holder = p_take_over_from) THEN
    -- lapsed — or held by a holder the caller states is DEAD (a process of the caller's own host whose pid is gone; the reason is recorded).
    -- THE OWNERSHIP BOUNDARY: the take-over locks the row FOR UPDATE and so WAITS for every effect transaction still
    -- in flight under the old claim (each holds KEY SHARE); once it commits, the next effect of the old holder is refused.
    SELECT * INTO r FROM graph.subscription_domain_serving x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
    v_prev := r.holder;
    UPDATE graph.subscription_domain_serving x SET holder = p_holder, claimed_at = clock_timestamp(), claimed_until = clock_timestamp() + make_interval(secs => v_ttl), renewals = 0, generation = graph.subscription_next_generation(p_tenant, p_domain)
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain RETURNING * INTO r;
    v_event := 'taken_over';
  ELSE
    RETURN QUERY SELECT r.holder, r.claimed_until, false, false, r.generation;
    RETURN;
  END IF;
  IF v_event <> 'renewed' THEN
    INSERT INTO graph.subscription_serving_events (tenant_id, domain_id, event, holder, previous, details)
    VALUES (p_tenant, p_domain, v_event, p_holder, v_prev, jsonb_build_object('claimed_until', r.claimed_until, 'generation', r.generation, 'reason', CASE WHEN v_event = 'taken_over' AND p_take_over_from IS NOT NULL THEN 'the holder''s process is not alive on this host' WHEN v_event = 'taken_over' THEN 'the claim lapsed' END));
  END IF;
  RETURN QUERY SELECT r.holder, r.claimed_until, true, v_event = 'taken_over', r.generation;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_domain_claim(uuid, uuid, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_domain_claim(uuid, uuid, text, int, text) TO eye_commit;

-- The domains to serve now report the generation too.
DROP FUNCTION IF EXISTS graph.subscription_domains_to_serve();
CREATE FUNCTION graph.subscription_domains_to_serve()
RETURNS TABLE (tenant_id uuid, domain_id uuid, subscriptions int, holder text, claimed_until timestamptz, generation bigint)
SECURITY DEFINER SET search_path = graph, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT s.tenant_id, s.domain_id, count(*)::int, v.holder, v.claimed_until, v.generation
      FROM graph.subscriptions s
      LEFT JOIN graph.subscription_domain_serving v ON v.tenant_id = s.tenant_id AND v.domain_id = s.domain_id
     WHERE s.status = 'active'
     GROUP BY s.tenant_id, s.domain_id, v.holder, v.claimed_until, v.generation
     ORDER BY s.tenant_id, s.domain_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_domains_to_serve() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_domains_to_serve() TO eye_commit;

-- THE FENCE. Called first in every transaction a delivery performs: the dispatcher's own (under the scheduler's
-- capability — the event's read, the receipt, the finish) and the subscriber's (under its run session — the items'
-- resolution and each item's write). It takes the serving row FOR KEY SHARE for the rest of the transaction, so a
-- take-over (FOR UPDATE) waits for it, and refuses the transaction unless the row still names this holder and
-- generation with a live claim. SQLSTATE P0S01 ('serving lost') is the dispatcher's signal to return the job.
CREATE FUNCTION graph.subscription_serving_fence(p_tenant uuid, p_domain uuid, p_holder text, p_generation bigint)
RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r RECORD;
BEGIN
  IF public.eye_ctx_mode() = 'schedule' THEN
    PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  ELSE
    PERFORM observation.assert_scope(p_tenant, p_domain);
  END IF;
  IF p_holder IS NULL OR p_generation IS NULL THEN RAISE EXCEPTION 'a serving fence names the holder and generation the job was admitted under' USING ERRCODE = '22023'; END IF;
  SELECT x.holder, x.generation, x.claimed_until INTO r FROM graph.subscription_domain_serving x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'serving lost: nobody serves %/% (this delivery was admitted under % generation %)', p_tenant, p_domain, p_holder, p_generation USING ERRCODE = 'P0S01';
  END IF;
  IF r.holder <> p_holder OR r.generation <> p_generation THEN
    RAISE EXCEPTION 'serving lost: %/% is served by % (generation %); this delivery was admitted under % (generation %)', p_tenant, p_domain, r.holder, r.generation, p_holder, p_generation USING ERRCODE = 'P0S01';
  END IF;
  IF r.claimed_until < clock_timestamp() THEN
    RAISE EXCEPTION 'serving lost: the claim of % on %/% lapsed at % (generation %)', p_holder, p_tenant, p_domain, r.claimed_until, p_generation USING ERRCODE = 'P0S01';
  END IF;
  -- The rest of this transaction is attributed: the ledger's events name the holder and generation (the trigger below).
  PERFORM set_config('eye.serving_holder', p_holder, true);
  PERFORM set_config('eye.serving_generation', p_generation::text, true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_serving_fence(uuid, uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_serving_fence(uuid, uuid, text, bigint) TO eye_commit;

-- Completion accounting: every delivery ledger event written inside a fenced transaction names the holder and
-- generation that wrote it (an event written outside one — a registration's, a replay's — names none).
CREATE OR REPLACE FUNCTION graph.subscription_delivery_events_served_by() RETURNS trigger
SET search_path = graph, public, pg_catalog, pg_temp AS $$
BEGIN
  NEW.details := coalesce(NEW.details, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'served_by', nullif(current_setting('eye.serving_holder', true), ''),
    'serving_generation', nullif(current_setting('eye.serving_generation', true), '')::bigint));
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER subscription_delivery_events_served_by BEFORE INSERT ON graph.subscription_delivery_events
  FOR EACH ROW EXECUTE FUNCTION graph.subscription_delivery_events_served_by();

-- ============================================================
-- §2 A pending inferred relationship is RE-DERIVED automatically through the builder's governed run (AU-DP-0041, V7:TT-04).
-- ============================================================
-- WHY. 0065 §7 opened a reassessment on an edge whose basis moved and left its closing to a retraction, a supersession or a
-- person's decision. The supersession the register asks for — the builder re-running for the corrected claim and asserting
-- the relationship anew — was operator-initiated only (POST …/graph/edges/build). Here it becomes a SUBSCRIPTION CONSUMER
-- of MemoryCorrected/claim.corrected: the `relationships` consumer, an agent of its own role holding exactly one action,
-- registered like the six of 0063, that derives the edge for the corrected claim version under the builder's rules (both
-- ends resolved to exactly one accepted entity each, no self-edge, a claim decided in review, evidence lineage present) and
-- asserts it through the same port the builder uses: graph.assert_edge supersedes the pending edge (0026), the trigger
-- of 0065 §7 closes the reassessment as `superseded`, and the new edge is published as GraphChanged/edge.asserted so that
-- what rested on the old edge is re-verified through its own subscriptions. A claim the builder cannot re-derive (an end
-- unresolved or ambiguous, a self-edge, no lineage, a claim queued or rejected in review) leaves the item UNRESOLVED
-- (unresolved_dependency → human_review) with the builder's own reason, re-checked on every re-drive; the reassessment
-- stays pending for the person. An evidence correction makes no new claim version and is therefore not re-derivable
-- by the builder (a limit, recorded); a retired method cannot re-run (a limit, recorded).
--
-- The consumer actions are a TABLE now (the three ledger ports read it): a later kind is one row, not three re-declarations.
CREATE TABLE graph.subscription_consumer_actions (
  consumer_kind text PRIMARY KEY,
  action        text NOT NULL UNIQUE,
  role_code     text NOT NULL,
  since         text NOT NULL
);
REVOKE ALL ON graph.subscription_consumer_actions FROM PUBLIC;
-- A platform vocabulary, not tenant data: readable in every scope, written by migrations alone — under FORCE row-level security like every graph table (the C7 control), the policy saying so explicitly.
ALTER TABLE graph.subscription_consumer_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.subscription_consumer_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_consumer_actions_shared ON graph.subscription_consumer_actions FOR SELECT USING (true);
GRANT SELECT ON graph.subscription_consumer_actions TO eye_app, eye_commit;
INSERT INTO graph.subscription_consumer_actions (consumer_kind, action, role_code, since) VALUES
  ('twins', 'twin.subscription.apply', 'twin_subscriber', '0063'),
  ('forecasts', 'prediction.forecast.subscription.apply', 'forecast_subscriber', '0063'),
  ('scenarios', 'prediction.scenario.subscription.apply', 'scenario_subscriber', '0063'),
  ('decisions', 'decision.subscription.apply', 'decision_subscriber', '0063'),
  ('retrieval', 'graph.retrieval.subscription.apply', 'retrieval_subscriber', '0063'),
  ('memory-mappings', 'graph.mapping.subscription.apply', 'mapping_subscriber', '0063'),
  ('relationships', 'graph.relationship.subscription.apply', 'relationship_subscriber', '0066');
INSERT INTO identity.roles (code, scope, description) VALUES
  ('relationship_subscriber', 'DOMAIN', 'The relationships subscription consumer (B9): re-derives an inferred relationship for a corrected claim through the builder''s rules and asserts it — exactly graph.relationship.subscription.apply')
ON CONFLICT (code) DO NOTHING;
ALTER TABLE graph.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_consumer_kind_check;
ALTER TABLE graph.subscriptions ADD CONSTRAINT subscriptions_consumer_kind_check CHECK (consumer_kind IN ('twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships'));

-- The three ledger ports, re-declared to read the table (bodies as 0063/0064 wrote them, the action list replaced).
CREATE OR REPLACE FUNCTION graph.subscription_delivery_items(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_items jsonb, p_action text)
RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d graph.subscription_deliveries%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM graph.subscription_consumer_actions a WHERE a.action = p_action) THEN
    RAISE EXCEPTION 'delivery items rejected: % is not a consumer action', p_action USING ERRCODE = '22023';
  END IF;
  PERFORM observation.assert_authority(ARRAY[p_action]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'delivery items is a list' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM graph.subscription_deliveries WHERE event_id = p_event_id AND subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery items rejected: no delivery for event % to subscription %', p_event_id, p_subscription_id USING ERRCODE = '23503'; END IF;
  IF d.principal_id IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'delivery items rejected: the applying principal is not the subscriber the delivery was received for' USING ERRCODE = '42501';
  END IF;
  IF jsonb_array_length(d.items) > 0 THEN RETURN d.items; END IF;   -- set once; a resumed delivery keeps its list
  UPDATE graph.subscription_deliveries SET items = p_items WHERE event_id = p_event_id AND subscription_id = p_subscription_id;
  RETURN p_items;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION graph.subscription_item_begin(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_item text, p_action text)
RETURNS boolean
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d graph.subscription_deliveries%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM graph.subscription_consumer_actions a WHERE a.action = p_action) THEN
    RAISE EXCEPTION 'subscription item rejected: % is not a consumer action', p_action USING ERRCODE = '22023';
  END IF;
  PERFORM observation.assert_authority(ARRAY[p_action]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO d FROM graph.subscription_deliveries WHERE event_id = p_event_id AND subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription item rejected: no delivery for event % to subscription %', p_event_id, p_subscription_id USING ERRCODE = '23503'; END IF;
  IF d.state = 'applied' THEN RETURN false; END IF;
  IF NOT (d.items ? p_item) THEN RAISE EXCEPTION 'subscription item rejected: % is not an item of this delivery', p_item USING ERRCODE = '22023'; END IF;
  -- Already applied for this delivery: a typed skip, never a second effect.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d.items_applied) w WHERE w ->> 'item' = p_item) THEN RETURN false; END IF;
  IF d.principal_id IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'subscription item rejected: the applying principal is not the subscriber the delivery was received for' USING ERRCODE = '42501';
  END IF;
  IF jsonb_array_length(d.items_applied) = 0 THEN
    UPDATE graph.subscription_deliveries SET attempts = attempts + 1 WHERE event_id = p_event_id AND subscription_id = p_subscription_id;
    INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, p_subscription_id, 'applying', public.eye_principal(),
            jsonb_build_object('attempt', d.attempts + 1, 'items', jsonb_array_length(d.items)), d.correlation_id);
  END IF;
  RETURN true;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION graph.subscription_item_unresolved(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_item text, p_action text, p_effect text, p_effect_ref uuid, p_reason text, p_details jsonb)
RETURNS int
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d graph.subscription_deliveries%ROWTYPE; v_prev jsonb; v_checks int := 1; v_first timestamptz := clock_timestamp();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM graph.subscription_consumer_actions a WHERE a.action = p_action) THEN
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

-- The builder's port admits the consumer's action beside the operator's (the same rules, the same supersession).
CREATE OR REPLACE FUNCTION graph.assert_edge(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_subject uuid, p_predicate text,
  p_object uuid, p_valid_from timestamptz, p_valid_to timestamptz,
  p_claim_object_id uuid, p_claim_version bigint, p_evidence_object_id uuid,
  p_evidence_digest text, p_method_id uuid, p_run_id uuid, p_mode text,
  p_confidence numeric, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_review text; v_now timestamptz := clock_timestamp(); r record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.edge.assert', 'graph.relationship.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_subject)
     OR NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_object) THEN
    RAISE EXCEPTION 'edge rejected: both ends must be resolved entities in this domain'
      USING ERRCODE = '23503';
  END IF;

  SELECT c.payload -> 'review' ->> 'state' INTO v_review
    FROM objects.canonical_objects c
   WHERE c.object_id = p_claim_object_id AND c.object_version = p_claim_version;
  IF v_review IN ('queued', 'rejected') THEN
    RAISE EXCEPTION 'edge rejected: the claim behind it is % for review; a claim a person has not decided is not promoted into the graph',
      v_review USING ERRCODE = '42501';
  END IF;

  INSERT INTO graph.edges_current (
    edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id,
    valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id,
    evidence_digest, method_id, run_id, mode, confidence, asserted_by, correlation_id
  ) VALUES (
    p_edge_id, 'DOMAIN', p_tenant, p_domain, p_subject, p_predicate, p_object,
    p_valid_from, p_valid_to, 'asserted', p_claim_object_id, p_claim_version,
    p_evidence_object_id, p_evidence_digest, p_method_id, p_run_id, p_mode,
    p_confidence, p_actor, p_correlation);
  INSERT INTO graph.edge_events (
    event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.asserted', p_actor,
    jsonb_build_object('predicate', p_predicate, 'subject', p_subject, 'object', p_object,
                       'valid_from', p_valid_from, 'valid_to', p_valid_to,
                       'mode', p_mode, 'claim_object_id', p_claim_object_id,
                       'claim_version', p_claim_version, 'review_state', v_review),
    p_correlation);

  -- Every still-asserted edge from an EARLIER version of the same claim is now
  -- obsolete. Each is superseded individually so each leaves its own event.
  FOR r IN SELECT e.edge_id FROM graph.edges_current e
            WHERE e.claim_object_id = p_claim_object_id
              AND e.claim_version < p_claim_version
              AND e.state = 'asserted'
            FOR UPDATE
  LOOP
    UPDATE graph.edges_current
       SET state = 'superseded', superseded_by = p_edge_id, superseded_at = v_now
     WHERE edge_id = r.edge_id;
    INSERT INTO graph.edge_events (
      event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id,
      details, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.edge_id, 'edge.superseded', p_actor,
      jsonb_build_object('superseded_by', p_edge_id, 'claim_object_id', p_claim_object_id,
                         'corrected_to_version', p_claim_version,
                         'reason', 'the claim this edge rests on was corrected'),
      p_correlation);
  END LOOP;
END $$ LANGUAGE plpgsql;

-- The reassessment opener admits the consumer too: it opens (or accumulates a cause on) the pending edge before asserting
-- its successor, so the closing is recorded as `superseded` whatever the delivery order of the other consumers.
CREATE OR REPLACE FUNCTION graph.open_edge_reassessment(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_trigger text, p_reason text, p_cause_id uuid, p_actor uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.mapping.subscription.apply', 'intelligence.method.activate', 'graph.relationship.subscription.apply']);
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

-- ============================================================
-- §3 The Memory item (AU-MEM-0065; V8 OBJ-14/15/16, PR-20-001/002, CAP-UM-07) and its place in the impact set (AU-MEM-0031).
-- ============================================================
-- A Memory item is an institutional or strategic record a knowledge owner RECORDS (source, audience, validity,
-- retention), a purpose-authorised reader or agent RETRIEVES without mutation with the access audited (a row in the
-- item's own access ledger inside the read's transaction, naming purpose, version served and the policy decision),
-- and the record authority SUPERSEDES with the prior version replayable (each version is a canonical MEM object;
-- a known-at read serves the version that was current then). What an item cites (evidence, claims, strategy
-- objects, entities, edges, forecasts, warnings) are dependency rows, so a correction walk reaches the item and marks
-- it for the owner's attention (graph.record_impact, above) — the impact set now reaches memory items.
INSERT INTO identity.roles (code, scope, description) VALUES
  ('knowledge_owner', 'DOMAIN', 'Records memory items into the Enterprise Memory workspace (memory.item.record): institutional and strategic records with their source, audience, validity and retention'),
  ('record_authority', 'DOMAIN', 'Supersedes and withdraws memory items (memory.item.supersede): the prior version stays replayable')
ON CONFLICT (code) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS memory;
GRANT USAGE ON SCHEMA memory TO eye_app, eye_commit;

CREATE TABLE memory.items_current (
  item_id              uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  object_version       int NOT NULL CHECK (object_version >= 1),
  record_class         text NOT NULL CHECK (record_class IN ('institutional', 'strategic')),
  title                text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  statement            text NOT NULL CHECK (length(btrim(statement)) >= 8),
  source_kind          text NOT NULL CHECK (source_kind IN ('human', 'document', 'communication', 'telemetry')),
  source_ref           text,
  owner_principal_id   uuid NOT NULL,
  classification       text NOT NULL CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  audience_roles       text[] NOT NULL DEFAULT '{}',
  audience_purposes    text[] NOT NULL DEFAULT '{}',
  valid_from           timestamptz NOT NULL,
  valid_to             timestamptz,
  retention_profile    text NOT NULL CHECK (length(btrim(retention_profile)) >= 1),
  retain_until         timestamptz,
  retention_basis      text,
  related_decision_id  uuid,
  related_objective_id uuid,
  state                text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'withdrawn')),
  attention_state      text NOT NULL DEFAULT 'none' CHECK (attention_state IN ('none', 'basis_corrected')),
  attention_reason     text,
  index_state          text NOT NULL DEFAULT 'projected' CHECK (index_state IN ('projected', 'stale')),
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_by          uuid NOT NULL,
  superseded_versions  int NOT NULL DEFAULT 0,
  last_superseded_at   timestamptz,
  correlation_id       uuid NOT NULL,
  CONSTRAINT mem_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT mem_validity CHECK (valid_to IS NULL OR valid_to > valid_from)
);
COMMENT ON TABLE memory.items_current IS 'The current version of each Memory item (every version is a canonical MEM object; a known-at read replays the prior one) — B9 §3.';
CREATE INDEX mem_items_domain ON memory.items_current (tenant_id, domain_id, state, recorded_at);
CREATE TABLE memory.item_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  item_id             uuid NOT NULL,
  event               text NOT NULL CHECK (event IN ('memory.recorded', 'memory.superseded', 'memory.withdrawn', 'memory.attention', 'memory.retrieved')),
  object_version      int NOT NULL,
  actor_principal_id  uuid,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT meme_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX mem_events_item ON memory.item_events (item_id, occurred_at);
CREATE TRIGGER memory_item_events_append_only BEFORE UPDATE OR DELETE ON memory.item_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
-- OBJ-15: every retrieval is a row — who read which version under which purpose, authorised by which policy decision, as of when.
CREATE TABLE memory.item_access (
  access_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  item_id             uuid NOT NULL,
  object_version      int NOT NULL,
  reader_principal_id uuid NOT NULL,
  purpose_id          text NOT NULL,
  policy_decision_id  uuid,
  read_as_of          timestamptz,
  accessed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT mema_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX mem_access_item ON memory.item_access (item_id, accessed_at);
CREATE TRIGGER memory_item_access_append_only BEFORE UPDATE OR DELETE ON memory.item_access FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
REVOKE ALL ON memory.items_current, memory.item_events, memory.item_access FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['items_current', 'item_events', 'item_access'] LOOP
    EXECUTE format('ALTER TABLE memory.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE memory.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY memory_isolation ON memory.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON memory.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- Record (version 1) or supersede (version n+1) the item's projection; the canonical MEM version is admitted by the same
-- write through objects.admit_version. Cites become dependency rows (the impact set); a supersession retires the rows of
-- the prior version that the new version no longer cites and adds the new ones.
CREATE OR REPLACE FUNCTION memory.record_item(
  p_item_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_record jsonb, p_cites jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = memory, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur memory.items_current%ROWTYPE; c jsonb; v_kind text; v_id uuid; v_rationale text; v_action text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['memory.item.record', 'memory.item.supersede']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_action := public.eye_bound_action();
  IF p_version IS NULL OR p_version < 1 THEN RAISE EXCEPTION 'memory item rejected: a version is a positive number' USING ERRCODE = '22023'; END IF;
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object' THEN RAISE EXCEPTION 'memory item rejected: the record is an object' USING ERRCODE = '22023'; END IF;
  IF p_cites IS NULL OR jsonb_typeof(p_cites) <> 'array' THEN RAISE EXCEPTION 'memory item rejected: cites is a list' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_record ->> 'retention_profile')), 0) = 0 THEN RAISE EXCEPTION 'memory item rejected: a retention profile is declared at record time' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM memory.items_current x WHERE x.item_id = p_item_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF p_version = 1 THEN
    IF FOUND THEN RAISE EXCEPTION 'memory item rejected: % is already recorded (version %)', p_item_id, cur.object_version USING ERRCODE = '23505'; END IF;
    IF v_action <> 'memory.item.record' THEN RAISE EXCEPTION 'memory item rejected: version 1 is recorded under memory.item.record, not %', v_action USING ERRCODE = '42501'; END IF;
    INSERT INTO memory.items_current (item_id, scope, tenant_id, domain_id, object_version, record_class, title, statement, source_kind, source_ref, owner_principal_id,
                                      classification, audience_roles, audience_purposes, valid_from, valid_to, retention_profile, retain_until, retention_basis,
                                      related_decision_id, related_objective_id, recorded_by, correlation_id)
    VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, 1, p_record ->> 'record_class', p_record ->> 'title', p_record ->> 'statement', p_record ->> 'source_kind', p_record ->> 'source_ref',
            coalesce((p_record ->> 'owner_principal_id')::uuid, p_actor),
            p_record ->> 'classification', coalesce((SELECT array_agg(x #>> '{}') FROM jsonb_array_elements(coalesce(p_record -> 'audience_roles', '[]'::jsonb)) x), '{}'),
            coalesce((SELECT array_agg(x #>> '{}') FROM jsonb_array_elements(coalesce(p_record -> 'audience_purposes', '[]'::jsonb)) x), '{}'),
            (p_record ->> 'valid_from')::timestamptz, (p_record ->> 'valid_to')::timestamptz, p_record ->> 'retention_profile', (p_record ->> 'retain_until')::timestamptz, p_record ->> 'retention_basis',
            (p_record ->> 'related_decision_id')::uuid, (p_record ->> 'related_objective_id')::uuid, p_actor, p_correlation);
    INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_item_id, 'memory.recorded', 1, p_actor,
            jsonb_build_object('record_class', p_record ->> 'record_class', 'title', p_record ->> 'title', 'classification', p_record ->> 'classification', 'retention_profile', p_record ->> 'retention_profile', 'cites', jsonb_array_length(p_cites)), p_correlation);
  ELSE
    IF NOT FOUND THEN RAISE EXCEPTION 'memory item rejected: % is not recorded; version % has no predecessor', p_item_id, p_version USING ERRCODE = '23503'; END IF;
    IF v_action <> 'memory.item.supersede' THEN RAISE EXCEPTION 'memory item rejected: a later version is recorded under memory.item.supersede, not %', v_action USING ERRCODE = '42501'; END IF;
    IF cur.state <> 'active' THEN RAISE EXCEPTION 'memory item rejected: % is %; a withdrawn item is not superseded', p_item_id, cur.state USING ERRCODE = '22023'; END IF;
    IF p_version <> cur.object_version + 1 THEN RAISE EXCEPTION 'memory item rejected: the next version of % is %, not %', p_item_id, cur.object_version + 1, p_version USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(p_record #>> '{supersession,reason}')), 0) < 8 THEN RAISE EXCEPTION 'memory item rejected: a supersession states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
    UPDATE memory.items_current
       SET object_version = p_version, record_class = p_record ->> 'record_class', title = p_record ->> 'title', statement = p_record ->> 'statement',
           source_kind = p_record ->> 'source_kind', source_ref = p_record ->> 'source_ref', classification = p_record ->> 'classification',
           audience_roles = coalesce((SELECT array_agg(x #>> '{}') FROM jsonb_array_elements(coalesce(p_record -> 'audience_roles', '[]'::jsonb)) x), '{}'),
           audience_purposes = coalesce((SELECT array_agg(x #>> '{}') FROM jsonb_array_elements(coalesce(p_record -> 'audience_purposes', '[]'::jsonb)) x), '{}'),
           valid_from = (p_record ->> 'valid_from')::timestamptz, valid_to = (p_record ->> 'valid_to')::timestamptz,
           retention_profile = p_record ->> 'retention_profile', retain_until = (p_record ->> 'retain_until')::timestamptz, retention_basis = p_record ->> 'retention_basis',
           related_decision_id = (p_record ->> 'related_decision_id')::uuid, related_objective_id = (p_record ->> 'related_objective_id')::uuid,
           attention_state = 'none', attention_reason = NULL, superseded_versions = superseded_versions + 1, last_superseded_at = clock_timestamp(),
           recorded_at = clock_timestamp(), recorded_by = p_actor, correlation_id = p_correlation
     WHERE item_id = p_item_id;
    INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_item_id, 'memory.superseded', p_version, p_actor,
            jsonb_build_object('prior_version', cur.object_version, 'reason', p_record #>> '{supersession,reason}', 'effective_at', p_record #>> '{supersession,effective_at}', 'cites', jsonb_array_length(p_cites)), p_correlation);
    -- The prior version's dependency rows not cited any more are retired; the record time keeps them.
    UPDATE graph.dependencies d SET state = 'removed'
     WHERE d.dependent_type = 'MEM' AND d.dependent_object_id = p_item_id AND d.state = 'active'
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_cites) cc WHERE cc ->> 'kind' = d.depends_on_kind AND (cc ->> 'id')::uuid = d.depends_on_id);
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_cites) LOOP
    v_kind := c ->> 'kind'; v_id := (c ->> 'id')::uuid; v_rationale := c ->> 'rationale';
    IF v_kind NOT IN ('evidence', 'claim', 'strategy', 'entity', 'edge', 'forecast', 'warning') THEN RAISE EXCEPTION 'memory item rejected: a cite names one of evidence, claim, strategy, entity, edge, forecast, warning (not %)', v_kind USING ERRCODE = '22023'; END IF;
    IF v_id IS NULL OR coalesce(length(btrim(v_rationale)), 0) < 8 THEN RAISE EXCEPTION 'memory item rejected: each cite names an id and a rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_item_id, 'MEM', v_kind, v_id, v_rationale, 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION memory.record_item(uuid,uuid,uuid,int,jsonb,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memory.record_item(uuid,uuid,uuid,int,jsonb,jsonb,uuid,uuid,uuid) TO eye_commit;

-- Withdraw: the record authority takes the item out of circulation; every version stays replayable, the dependencies retire.
CREATE OR REPLACE FUNCTION memory.withdraw_item(p_item_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = memory, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur memory.items_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['memory.item.supersede']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'memory item rejected: a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM memory.items_current x WHERE x.item_id = p_item_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'memory item rejected: % is not recorded', p_item_id USING ERRCODE = '23503'; END IF;
  IF cur.state = 'withdrawn' THEN RETURN; END IF;
  UPDATE memory.items_current SET state = 'withdrawn' WHERE item_id = p_item_id;
  UPDATE graph.dependencies SET state = 'removed' WHERE dependent_type = 'MEM' AND dependent_object_id = p_item_id AND state = 'active';
  INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_item_id, 'memory.withdrawn', cur.object_version, p_actor, jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION memory.withdraw_item(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memory.withdraw_item(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- The access ledger (OBJ-15): written inside the retrieval's own transaction, under the retrieve action; the policy decision
-- that authorised the read is the transaction's.
CREATE OR REPLACE FUNCTION memory.record_access(p_item_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_purpose text, p_reader uuid, p_as_of timestamptz, p_correlation uuid)
RETURNS uuid
SECURITY DEFINER SET search_path = memory, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['memory.item.retrieve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_purpose)), 0) = 0 THEN RAISE EXCEPTION 'memory retrieval rejected: a purpose is declared' USING ERRCODE = '22023'; END IF;
  INSERT INTO memory.item_access (access_id, scope, tenant_id, domain_id, item_id, object_version, reader_principal_id, purpose_id, policy_decision_id, read_as_of, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_item_id, p_version, p_reader, p_purpose, public.eye_policy_decision(), p_as_of, p_correlation);
  INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_item_id, 'memory.retrieved', p_version, p_reader, jsonb_build_object('purpose', p_purpose, 'as_of', p_as_of, 'access_id', v_id), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION memory.record_access(uuid,uuid,uuid,int,text,uuid,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memory.record_access(uuid,uuid,uuid,int,text,uuid,timestamptz,uuid) TO eye_commit;

INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('memory.item.record', ARRAY['MEM'], 'Recording a memory item admits its first canonical version and nothing else'),
  ('memory.item.supersede', ARRAY['MEM'], 'Superseding a memory item admits its next canonical version; the prior stays replayable')
ON CONFLICT (action) DO NOTHING;
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('MEM', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["record_class","title","statement","source","audience","validity","retention","cites"],
  "properties": {
    "record_class": { "enum": ["institutional","strategic"] },
    "title": { "type": "string", "minLength": 3, "maxLength": 200 },
    "statement": { "type": "string", "minLength": 8 },
    "source": { "type": "object", "required": ["kind"], "properties": { "kind": { "enum": ["human","document","communication","telemetry"] }, "ref": { "type": ["string","null"] } } },
    "audience": { "type": "object", "required": ["classification"], "properties": { "classification": { "enum": ["public","internal","confidential","restricted"] }, "roles": { "type": "array", "items": { "type": "string" } }, "purposes": { "type": "array", "items": { "type": "string" } } } },
    "validity": { "type": "object", "required": ["from"], "properties": { "from": { "type": "string" }, "to": { "type": ["string","null"] } } },
    "retention": { "type": "object", "required": ["profile"], "properties": { "profile": { "type": "string", "minLength": 1 }, "retain_until": { "type": ["string","null"] }, "basis": { "type": ["string","null"] } } },
    "cites": { "type": "array", "items": { "type": "object", "required": ["kind","id","rationale"], "properties": { "kind": { "enum": ["evidence","claim","strategy","entity","edge","forecast","warning"] }, "id": { "type": "string" }, "version": { "type": ["integer","null"] }, "rationale": { "type": "string", "minLength": 8 } } } },
    "related": { "type": "object", "properties": { "decision_id": { "type": ["string","null"] }, "objective_id": { "type": ["string","null"] } } },
    "supersession": { "type": "object", "required": ["reason"], "properties": { "reason": { "type": "string", "minLength": 8 }, "effective_at": { "type": ["string","null"] } } }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

-- Memory items are dependents in the impact set.
ALTER TABLE graph.dependencies DROP CONSTRAINT dependencies_dependent_type_check;
ALTER TABLE graph.dependencies ADD CONSTRAINT dependencies_dependent_type_check
  CHECK (dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT', 'FCT', 'SCN', 'WRN', 'TWN', 'SIM', 'BRF', 'MEM'));
CREATE OR REPLACE FUNCTION graph.dependency_dependent_exists() RETURNS trigger
SET search_path = graph, prediction, twin, simulation, executive, memory, pg_catalog, pg_temp AS $$
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
  ELSIF NEW.dependent_type = 'MEM' THEN
    IF NOT EXISTS (SELECT 1 FROM memory.items_current m WHERE m.item_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: MEM % is not a memory item', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
ALTER TABLE graph.invalidations_current ADD COLUMN affected_memory_items jsonb NOT NULL DEFAULT '[]'::jsonb;
DROP FUNCTION IF EXISTS graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb);
CREATE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_forecasts jsonb, p_twins jsonb, p_simulations jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid,
  p_warnings jsonb, p_briefings jsonb, p_memory_items jsonb DEFAULT '[]'::jsonb
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, prediction, twin, simulation, executive, memory, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; cov record; f jsonb; t jsonb; r jsonb; w jsonb; b jsonb; mi jsonb; v_versions int[]; v_version int; v_marked jsonb := '[]'::jsonb; v_routes text[]; v_trigger_kind text; v_trigger_id uuid;
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
         affected_memory_items = coalesce(p_memory_items, '[]'::jsonb),
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

  -- 0066 §3: memory items resting on what changed — an ACTIVE item recorded before the change (for a corrected object, the
  -- object has a version recorded after the item's record instant) is marked for the knowledge owner's attention once per
  -- invalidation; the item itself (a version of the institutional record) is never rewritten by a walk.
  FOR mi IN SELECT * FROM jsonb_array_elements(coalesce(p_memory_items, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM memory.items_current x
                WHERE x.item_id = (mi ->> 'item_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active'
                  AND (v_trigger_kind NOT IN ('evidence_correction', 'claim_correction', 'claim_withdrawal')
                       OR EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_trigger_id AND o.recorded_at > x.recorded_at)))
       AND NOT EXISTS (SELECT 1 FROM memory.item_events e WHERE e.item_id = (mi ->> 'item_id')::uuid AND e.event = 'memory.attention' AND e.details ->> 'invalidation_id' = p_invalidation_id::text) THEN
      UPDATE memory.items_current SET attention_state = 'basis_corrected', attention_reason = left('invalidation ' || p_invalidation_id::text || ': ' || coalesce(mi ->> 'reached_via', 'what this record rests on changed'), 500)
       WHERE item_id = (mi ->> 'item_id')::uuid;
      INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
      SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.item_id, 'memory.attention', x.object_version, p_actor,
             jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', mi ->> 'reached_via', 'correction_case_id', v_case), p_correlation
        FROM memory.items_current x WHERE x.item_id = (mi ->> 'item_id')::uuid;
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
      'memory_items', jsonb_array_length(coalesce(p_memory_items, '[]'::jsonb)),
      'truncated', coalesce(p_truncated, false),
      'unexplored', jsonb_array_length(coalesce(p_unexplored, '[]'::jsonb)),
      'correction_case_id', v_case, 'case_propagation_state', v_cov_state,
      'roots', v_cov_roots, 'roots_covered', v_cov_covered,
      'roots_outstanding', v_cov_outstanding, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb) TO eye_commit;

-- ============================================================
-- §4 Governed retention (ES-29-004; AU-DP-0090/0091/0094 clauses, AU-MEM-0059/0060/0061; the interfaces L3-I04 RetentionActionDue and L3-I05 DeletionVerified).
-- ============================================================
-- A retention action is a DURABLE WORKFLOW with scope resolution, holds, approvals, execution evidence, residual
-- inventory and verification — never a job that deletes. Its states are moved only by governed acts, one per route:
--   opened → scope_resolved (the scope items with their dispositions: execute | held by a legal hold | excluded) or held
--   (every item held) or paused (a referential scope that cannot be proven) → approved (the retention authority, on the
--   scope's digest, never the opener) → executed (the steward, never an approver: tombstones through the observation
--   port that now refuses held manifests; the log's floor through the outbox port) → verified | verified_with_residuals
--   (what remains by policy — lineage, dependencies, delivery ledgers — is inventoried, never silently passed).
-- Two target kinds in this batch: EVIDENCE (deletion of superseded evidence bytes — the manifest and its tombstone stay;
-- AU-DP-0093's tombstone gains its verified residual closure) and the LOG PARTITION (the outbox's retained floor moved
-- by a governed act — what 0065 §6 declared and left to this batch: the act refuses while a subscription's served point
-- or cursor, or an unpublished row, lies below the new floor). RetentionActionDue is published when an action opens (by
-- a person, or by the schedule evaluation over declared schedules); DeletionVerified when it verifies.
INSERT INTO identity.roles (code, scope, description) VALUES
  ('retention_steward', 'DOMAIN', 'Opens, resolves, executes and verifies retention actions (retention.action.open/resolve/execute/verify); never approves them'),
  ('retention_authority', 'TENANT', 'Approves retention actions on their resolved scope (retention.action.approve); never opens or executes them')
ON CONFLICT (code) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS retention;
GRANT USAGE ON SCHEMA retention TO eye_app, eye_commit;

CREATE TABLE retention.schedules (
  schedule_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  retention_profile  text NOT NULL CHECK (length(btrim(retention_profile)) >= 1),
  target_kind        text NOT NULL CHECK (target_kind IN ('evidence', 'log_partition')),
  action_kind        text NOT NULL CHECK (action_kind IN ('review', 'deletion', 'archive', 'log_floor', 'customer_export')),
  due_after          interval NOT NULL,
  selector           jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_principal_id uuid NOT NULL,
  state              text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_evaluated_at  timestamptz,
  correlation_id     uuid NOT NULL,
  CONSTRAINT rsch_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TABLE retention.actions_current (
  action_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('review', 'deletion', 'archive', 'log_floor', 'customer_export')),
  target_kind        text NOT NULL CHECK (target_kind IN ('evidence', 'log_partition')),
  selector           jsonb NOT NULL,
  schedule_id        uuid,
  retention_profile  text,
  due_from           timestamptz NOT NULL DEFAULT clock_timestamp(),
  state              text NOT NULL DEFAULT 'opened' CHECK (state IN ('opened', 'scope_resolved', 'held', 'paused', 'approved', 'executing', 'executed', 'verified', 'verified_with_residuals', 'withdrawn', 'rejected', 'failed')),
  scope_digest       text CHECK (scope_digest IS NULL OR scope_digest ~ '^[0-9a-f]{64}$'),
  scope_summary      jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at        timestamptz,
  approved_at        timestamptz,
  executed_at        timestamptz,
  verified_at        timestamptz,
  failure_class      text CHECK (failure_class IS NULL OR failure_class IN ('legal_hold', 'unresolved_dependency', 'authority_disputed', 'infrastructure')),
  disposition        text CHECK (disposition IS NULL OR disposition IN ('retry', 'compensation', 'challenge', 'human_review')),
  failure_reason     text,
  residual_summary   jsonb NOT NULL DEFAULT '[]'::jsonb,
  closed_at          timestamptz,
  correlation_id     uuid NOT NULL,
  CONSTRAINT rta_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT rta_selector CHECK (jsonb_typeof(selector) = 'object')
);
CREATE INDEX rta_domain_state ON retention.actions_current (tenant_id, domain_id, state);
CREATE TABLE retention.action_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  action_id          uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('action.opened', 'scope.resolved', 'action.held', 'action.paused', 'approval.recorded', 'approval.revoked', 'execution.started', 'execution.item', 'execution.finished', 'residual.recorded', 'verification.passed', 'verification.residuals', 'action.withdrawn', 'action.rejected', 'action.failed')),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT rte_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX rte_action ON retention.action_events (action_id, occurred_at);
CREATE TRIGGER retention_action_events_append_only BEFORE UPDATE OR DELETE ON retention.action_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TABLE retention.scope_items (
  item_id            uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  action_id          uuid NOT NULL,
  item_kind          text NOT NULL CHECK (item_kind IN ('manifest', 'outbox_range', 'subscription_cursor', 'unpublished_row')),
  ref                text NOT NULL,
  dependency_order   int NOT NULL DEFAULT 0,
  disposition        text NOT NULL CHECK (disposition IN ('execute', 'held', 'excluded', 'blocking')),
  hold_id            uuid,
  reason             text,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT rsi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX rsi_action ON retention.scope_items (action_id, dependency_order);
CREATE TABLE retention.approvals (
  approval_id           uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  action_id             uuid NOT NULL,
  scope_digest          text NOT NULL,
  approver_principal_id uuid NOT NULL,
  rationale             text NOT NULL CHECK (length(btrim(rationale)) >= 8),
  recorded_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at            timestamptz NOT NULL,
  revoked_at            timestamptz,
  revoke_reason         text,
  correlation_id        uuid NOT NULL,
  CONSTRAINT rap_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX rap_action ON retention.approvals (action_id);
CREATE TABLE retention.executions (
  execution_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  action_id          uuid NOT NULL,
  item_id            uuid,
  port               text NOT NULL,
  outcome            text NOT NULL CHECK (outcome IN ('done', 'refused', 'skipped')),
  evidence           jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_by        uuid NOT NULL,
  executed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT rex_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX rex_action ON retention.executions (action_id, executed_at);
CREATE TRIGGER retention_executions_append_only BEFORE UPDATE OR DELETE ON retention.executions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TABLE retention.residual_inventory (
  residual_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  action_id          uuid NOT NULL,
  kind               text NOT NULL,
  ref                text,
  count              int NOT NULL DEFAULT 0,
  status             text NOT NULL CHECK (status IN ('retained_by_policy', 'pending', 'unknown')),
  note               text,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT rri_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX rri_action ON retention.residual_inventory (action_id);
CREATE TABLE retention.verifications (
  verification_id    uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  action_id          uuid NOT NULL,
  check_name         text NOT NULL,
  expected           jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed           jsonb NOT NULL DEFAULT '{}'::jsonb,
  passed             boolean NOT NULL,
  verified_by        uuid NOT NULL,
  verified_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT rvf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX rvf_action ON retention.verifications (action_id);
CREATE TRIGGER retention_verifications_append_only BEFORE UPDATE OR DELETE ON retention.verifications FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
REVOKE ALL ON retention.schedules, retention.actions_current, retention.action_events, retention.scope_items, retention.approvals, retention.executions, retention.residual_inventory, retention.verifications FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedules', 'actions_current', 'action_events', 'scope_items', 'approvals', 'executions', 'residual_inventory', 'verifications'] LOOP
    EXECUTE format('ALTER TABLE retention.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE retention.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY retention_isolation ON retention.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON retention.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION retention.event(p_action_id uuid, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
SET search_path = retention, pg_catalog, pg_temp AS $$
  INSERT INTO retention.action_events (event_id, scope, tenant_id, domain_id, action_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.event(uuid,uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC;

-- Declare a schedule: what falls due after how long under a retention profile; the evaluation opens the actions.
CREATE OR REPLACE FUNCTION retention.declare_schedule(p_schedule_id uuid, p_tenant uuid, p_domain uuid, p_retention_profile text, p_target_kind text, p_action_kind text, p_due_after interval, p_selector jsonb, p_owner uuid, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.schedule.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_due_after IS NULL OR p_due_after < interval '0' THEN RAISE EXCEPTION 'retention schedule rejected: due_after is a non-negative interval' USING ERRCODE = '22023'; END IF;
  INSERT INTO retention.schedules (schedule_id, scope, tenant_id, domain_id, retention_profile, target_kind, action_kind, due_after, selector, owner_principal_id, declared_by, correlation_id)
  VALUES (p_schedule_id, 'DOMAIN', p_tenant, p_domain, p_retention_profile, p_target_kind, p_action_kind, p_due_after, coalesce(p_selector, '{}'::jsonb), coalesce(p_owner, p_actor), p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.declare_schedule(uuid,uuid,uuid,text,text,text,interval,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.declare_schedule(uuid,uuid,uuid,text,text,text,interval,jsonb,uuid,uuid,uuid) TO eye_commit;

-- Open an action (a person, or the schedule evaluation): the workflow's first durable state; RetentionActionDue is the write's event.
CREATE OR REPLACE FUNCTION retention.open_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_target_kind text, p_selector jsonb, p_retention_profile text, p_schedule_id uuid, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.open', 'retention.schedule.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_selector IS NULL OR jsonb_typeof(p_selector) <> 'object' THEN RAISE EXCEPTION 'retention action rejected: the selector is an object' USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'log_partition' AND p_kind <> 'log_floor' THEN RAISE EXCEPTION 'retention action rejected: the log partition takes the log_floor action' USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'evidence' AND p_kind NOT IN ('review', 'deletion', 'archive', 'customer_export') THEN RAISE EXCEPTION 'retention action rejected: % is not an evidence action', p_kind USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'log_partition' AND (p_selector ->> 'partition_key') IS DISTINCT FROM ('tenant:' || p_tenant::text) THEN
    RAISE EXCEPTION 'retention action rejected: the log partition of this tenant is tenant:%', p_tenant USING ERRCODE = '22023';
  END IF;
  INSERT INTO retention.actions_current (action_id, scope, tenant_id, domain_id, kind, target_kind, selector, schedule_id, retention_profile, opened_by, correlation_id)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_target_kind, p_selector, p_schedule_id, p_retention_profile, p_actor, p_correlation);
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.opened', p_actor, jsonb_build_object('kind', p_kind, 'target_kind', p_target_kind, 'selector', p_selector, 'schedule_id', p_schedule_id), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.open_action(uuid,uuid,uuid,text,text,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.open_action(uuid,uuid,uuid,text,text,jsonb,text,uuid,uuid,uuid) TO eye_commit;

-- The schedule evaluation (AU-MEM-0059): every evidence object past its schedule's due-after that no open action covers
-- raises an action (and its RetentionActionDue); nothing is deleted. Returns the actions opened.
CREATE OR REPLACE FUNCTION retention.evaluate_schedules(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s retention.schedules%ROWTYPE; m RECORD; v_action uuid; v_out jsonb := '[]'::jsonb; v_selector jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.schedule.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR s IN SELECT * FROM retention.schedules x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active' ORDER BY x.declared_at LOOP
    IF s.target_kind = 'evidence' THEN
      -- Due: a manifest of this profile (optionally of the selector's source) created before now − due_after, not tombstoned,
      -- and not already the target of an open action of this kind.
      FOR m IN SELECT bm.manifest_id, bm.source_id, bm.created_at FROM observation.blob_manifests bm
                WHERE bm.tenant_id = p_tenant AND bm.domain_id = p_domain AND bm.vault = 'evidence' AND bm.retention_profile = s.retention_profile
                  AND (s.selector ->> 'source_id' IS NULL OR bm.source_id = (s.selector ->> 'source_id')::uuid)
                  AND bm.created_at <= clock_timestamp() - s.due_after
                  AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = bm.manifest_id)
                  AND NOT EXISTS (SELECT 1 FROM retention.actions_current a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind = s.action_kind
                                    AND a.state NOT IN ('withdrawn', 'rejected', 'failed', 'verified', 'verified_with_residuals')
                                    AND a.selector ->> 'manifest_id' = bm.manifest_id::text)
                ORDER BY bm.created_at LOOP
        v_action := gen_random_uuid();
        v_selector := jsonb_build_object('manifest_id', m.manifest_id, 'source_id', m.source_id);
        INSERT INTO retention.actions_current (action_id, scope, tenant_id, domain_id, kind, target_kind, selector, schedule_id, retention_profile, due_from, opened_by, correlation_id)
        VALUES (v_action, 'DOMAIN', p_tenant, p_domain, s.action_kind, 'evidence', v_selector, s.schedule_id, s.retention_profile, m.created_at + s.due_after, p_actor, p_correlation);
        PERFORM retention.event(v_action, p_tenant, p_domain, 'action.opened', p_actor, jsonb_build_object('kind', s.action_kind, 'target_kind', 'evidence', 'selector', v_selector, 'schedule_id', s.schedule_id, 'due_from', m.created_at + s.due_after), p_correlation);
        v_out := v_out || jsonb_build_object('action_id', v_action, 'kind', s.action_kind, 'target_kind', 'evidence', 'selector', v_selector, 'schedule_id', s.schedule_id, 'retention_profile', s.retention_profile, 'due_from', m.created_at + s.due_after);
      END LOOP;
    END IF;
    UPDATE retention.schedules SET last_evaluated_at = clock_timestamp() WHERE schedule_id = s.schedule_id;
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.evaluate_schedules(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.evaluate_schedules(uuid,uuid,uuid,uuid) TO eye_commit;

-- SCOPE RESOLUTION: what the action would touch, each item with its disposition; holds and blocks decide the state.
CREATE OR REPLACE FUNCTION retention.resolve_scope(p_action_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, graph, intelligence, executive, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; m RECORD; v_hold uuid; v_items int := 0; v_held int := 0; v_blocking int := 0; v_execute int := 0; v_digest text; v_state text;
        v_partition text; v_to bigint; v_floor bigint; v_next bigint; v_ord int := 0; r RECORD; v_summary jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention action rejected: % is not open in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state NOT IN ('opened', 'scope_resolved', 'held', 'paused') THEN RAISE EXCEPTION 'retention action rejected: % is %, its scope is not resolved again', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  DELETE FROM retention.scope_items WHERE action_id = p_action_id;
  DELETE FROM retention.residual_inventory WHERE action_id = p_action_id;
  IF a.target_kind = 'evidence' THEN
    -- The manifests in scope: one named manifest, or every manifest of a source whose evidence is no longer current — the
    -- evidence object's LATEST version is corrected, superseded or withdrawn (a correction restates the object; the original
    -- bytes are then history). A manifest whose evidence is still current (latest version admitted/active) is EXCLUDED,
    -- never retired by a deletion; the evidence must be corrected or withdrawn first.
    FOR m IN
      SELECT DISTINCT bm.manifest_id, bm.locator, bm.source_id, bm.created_at, bm.legal_hold, bm.byte_length,
             lv.object_id AS evd_object_id, lv.object_version AS evd_version, lv.lifecycle_state AS evd_state
        FROM observation.blob_manifests bm
        LEFT JOIN LATERAL (SELECT o.object_id, o.object_version, o.lifecycle_state FROM objects.canonical_objects o
                            WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = bm.manifest_id
                            ORDER BY o.object_version DESC LIMIT 1) lv ON true
       WHERE bm.tenant_id = p_tenant AND bm.domain_id = p_domain AND bm.vault = 'evidence'
         AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = bm.manifest_id)
         AND ((a.selector ->> 'manifest_id') IS NOT NULL AND bm.manifest_id = (a.selector ->> 'manifest_id')::uuid
              OR (a.selector ->> 'manifest_id') IS NULL AND (a.selector ->> 'source_id') IS NOT NULL AND bm.source_id = (a.selector ->> 'source_id')::uuid
                  AND lv.lifecycle_state IN ('corrected', 'superseded', 'withdrawn'))
       ORDER BY bm.created_at
    LOOP
      v_ord := v_ord + 1; v_items := v_items + 1;
      -- A hold placed on the manifest, or through the evidence object (every version of the object is held).
      SELECT h.hold_id INTO v_hold FROM observation.legal_holds h WHERE (h.manifest_id = m.manifest_id OR (m.evd_object_id IS NOT NULL AND h.evd_object_id = m.evd_object_id)) AND h.lifted_at IS NULL ORDER BY h.placed_at LIMIT 1;
      IF m.evd_state IS NULL OR m.evd_state NOT IN ('corrected', 'superseded', 'withdrawn') THEN
        -- The bytes of CURRENT evidence are never retired by a deletion action: correct or withdraw the evidence first.
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded', 'the evidence resting on these bytes is current (its latest version is ' || coalesce(m.evd_state, 'unknown') || '); a deletion retires corrected, superseded or withdrawn evidence only', jsonb_build_object('locator', m.locator, 'evd_object_id', m.evd_object_id, 'evd_version', m.evd_version, 'byte_length', m.byte_length));
      ELSIF m.legal_hold OR v_hold IS NOT NULL THEN
        v_held := v_held + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'held', v_hold, 'a legal hold takes precedence over deletion (AU-MEM-0060)', jsonb_build_object('locator', m.locator, 'evd_object_id', m.evd_object_id, 'evd_version', m.evd_version, 'byte_length', m.byte_length));
      ELSE
        v_execute := v_execute + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', 'superseded evidence bytes past their retention', jsonb_build_object('locator', m.locator, 'evd_object_id', m.evd_object_id, 'evd_version', m.evd_version, 'byte_length', m.byte_length));
      END IF;
      -- Residuals that policy retains whatever the deletion does: the lineage that names the evidence, what rests on it, the briefings that cite it.
      IF m.evd_object_id IS NOT NULL THEN
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'claim_lineage', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'the claims extracted from this evidence keep their lineage rows (accountability); the bytes are gone, the record of their reading stays'
          FROM intelligence.claim_lineage l WHERE l.evidence_object_id = m.evd_object_id HAVING count(*) > 0;
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'dependency', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'objects resting on this evidence keep their dependency rows (the impact set remains addressable)'
          FROM graph.dependencies d WHERE d.depends_on_kind = 'evidence' AND d.depends_on_id = m.evd_object_id AND d.state = 'active' HAVING count(*) > 0;
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'canonical_version', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'the evidence object''s canonical versions (header, digest, custody) stay: a tombstone, never an erasure of the record'
          FROM objects.canonical_objects o WHERE o.object_id = m.evd_object_id HAVING count(*) > 0;
      END IF;
    END LOOP;
    v_state := CASE WHEN v_items = 0 THEN 'paused' WHEN v_execute = 0 AND v_held > 0 THEN 'held' WHEN v_execute = 0 THEN 'paused' ELSE 'scope_resolved' END;
  ELSE
    v_partition := a.selector ->> 'partition_key'; v_to := (a.selector ->> 'to_seq')::bigint;
    SELECT p.retained_from_seq, p.next_seq INTO v_floor, v_next FROM objects.outbox_partitions p WHERE p.partition_key = v_partition;
    IF v_floor IS NULL THEN RAISE EXCEPTION 'retention action rejected: partition % has no row', v_partition USING ERRCODE = '23503'; END IF;
    IF v_to IS NULL OR v_to <= v_floor OR v_to > v_next THEN RAISE EXCEPTION 'retention action rejected: to_seq % must lie above the floor % and at most the next sequence %', v_to, v_floor, v_next USING ERRCODE = '22023'; END IF;
    v_ord := 1; v_items := 1;
    -- The range itself: published rows below the new floor by status.
    SELECT count(*) FILTER (WHERE status = 'published') AS published, count(*) FILTER (WHERE status IN ('pending', 'failed')) AS unpublished, count(*) FILTER (WHERE status = 'dead_letter') AS dead INTO r
      FROM objects.object_outbox o WHERE o.partition_key = v_partition AND o.partition_seq >= v_floor AND o.partition_seq < v_to;
    INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'outbox_range', v_partition || ':' || v_floor || '-' || (v_to - 1), 1, 'execute', 'the retained floor moves to this sequence; replay below it is no longer guaranteed', jsonb_build_object('from_seq', v_floor, 'to_seq', v_to, 'published', r.published, 'unpublished', r.unpublished, 'dead_letter', r.dead));
    v_execute := 1;
    -- Blocks (DP-54-005, "pause unsafe deletion"): unpublished history below the floor; a subscription served from, or checkpointed, below it.
    IF r.unpublished + r.dead > 0 THEN
      v_ord := v_ord + 1; v_items := v_items + 1; v_blocking := v_blocking + 1;
      INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'unpublished_row', v_partition, v_ord, 'blocking', 'rows below the new floor are not yet published (or dead-lettered): history the log has not delivered is not retired', jsonb_build_object('unpublished', r.unpublished, 'dead_letter', r.dead));
    END IF;
    FOR m IN SELECT s.subscription_id, s.consumer_kind, s.served_from_seq, s.checkpoint_seq FROM graph.subscriptions s
              WHERE s.tenant_id = p_tenant AND s.status <> 'revoked' AND (s.served_from_seq < v_to OR (s.checkpoint_seq IS NOT NULL AND s.checkpoint_seq < v_to - 1))
              ORDER BY s.consumer_kind LOOP
      v_ord := v_ord + 1; v_items := v_items + 1; v_blocking := v_blocking + 1;
      INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'subscription_cursor', m.subscription_id::text, v_ord, 'blocking', 'a subscription is served from, or checkpointed, below the new floor: moving it would cut history the subscription is owed (replay it to the floor first, or let it catch up)', jsonb_build_object('consumer_kind', m.consumer_kind, 'served_from_seq', m.served_from_seq, 'checkpoint_seq', m.checkpoint_seq));
    END LOOP;
    -- Residuals by policy: the delivery and attempt ledgers keep the event ids they reference below the floor.
    INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'delivery_ledger', v_partition, count(*)::int, 'retained_by_policy', 'delivery ledger rows keep the ids of events below the floor (accountability; no foreign key to the log)'
      FROM graph.subscription_deliveries d JOIN objects.object_outbox o ON o.id = d.event_id WHERE o.partition_key = v_partition AND o.partition_seq < v_to HAVING count(*) > 0;
    INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'propagation_ledger', v_partition, count(*)::int, 'retained_by_policy', 'propagation attempt rows keep the ids of events below the floor'
      FROM graph.propagation_attempts d JOIN objects.object_outbox o ON o.id = d.event_id WHERE o.partition_key = v_partition AND o.partition_seq < v_to HAVING count(*) > 0;
    v_state := CASE WHEN v_blocking > 0 THEN 'paused' ELSE 'scope_resolved' END;
  END IF;
  -- The digest the approval signs: the ordered items with their dispositions.
  SELECT encode(sha256(convert_to(coalesce(string_agg(i.item_kind || '|' || i.ref || '|' || i.disposition || '|' || coalesce(i.hold_id::text, ''), E'\n' ORDER BY i.dependency_order, i.ref), ''), 'UTF8')), 'hex') INTO v_digest
    FROM retention.scope_items i WHERE i.action_id = p_action_id;
  v_summary := jsonb_build_object('items', v_items, 'execute', v_execute, 'held', v_held, 'blocking', v_blocking,
                                  'residuals', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'count', ri.count, 'status', ri.status)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id));
  UPDATE retention.actions_current
     SET state = v_state, scope_digest = v_digest, scope_summary = v_summary, resolved_at = clock_timestamp(),
         failure_class = CASE v_state WHEN 'held' THEN 'legal_hold' WHEN 'paused' THEN 'unresolved_dependency' ELSE NULL END,
         disposition = CASE v_state WHEN 'held' THEN 'challenge' WHEN 'paused' THEN 'human_review' ELSE NULL END,
         failure_reason = CASE v_state WHEN 'held' THEN 'every item in scope is under a legal hold' WHEN 'paused' THEN CASE WHEN v_items = 0 THEN 'nothing in scope: the selector resolves to no superseded evidence' ELSE 'the scope cannot be retired safely: ' || v_blocking || ' blocking item(s)' END ELSE NULL END
   WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, CASE v_state WHEN 'held' THEN 'action.held' WHEN 'paused' THEN 'action.paused' ELSE 'scope.resolved' END, p_actor, v_summary || jsonb_build_object('scope_digest', v_digest), p_correlation);
  RETURN v_summary || jsonb_build_object('state', v_state, 'scope_digest', v_digest);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.resolve_scope(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.resolve_scope(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- APPROVAL: on the scope digest the approver read; never the opener; one live approval is the quorum in this batch.
CREATE OR REPLACE FUNCTION retention.record_approval(p_approval_id uuid, p_action_id uuid, p_tenant uuid, p_domain uuid, p_scope_digest text, p_rationale text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention approval rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'scope_resolved' THEN RAISE EXCEPTION 'retention approval rejected: % is % — only a resolved scope is approved', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  IF a.scope_digest IS DISTINCT FROM p_scope_digest THEN RAISE EXCEPTION 'retention approval rejected: the digest approved (%) is not the resolved scope (%)', coalesce(p_scope_digest, '<none>'), a.scope_digest USING ERRCODE = '22023'; END IF;
  IF p_actor = a.opened_by THEN RAISE EXCEPTION 'retention approval rejected: the opener of an action does not approve it' USING ERRCODE = '42501'; END IF;
  IF p_actor <> public.eye_principal() THEN RAISE EXCEPTION 'retention approval rejected: the approver is the acting principal' USING ERRCODE = '42501'; END IF;
  INSERT INTO retention.approvals (approval_id, scope, tenant_id, domain_id, action_id, scope_digest, approver_principal_id, rationale, expires_at, correlation_id)
  VALUES (p_approval_id, 'DOMAIN', p_tenant, p_domain, p_action_id, p_scope_digest, p_actor, p_rationale, clock_timestamp() + interval '30 days', p_correlation);
  UPDATE retention.actions_current SET state = 'approved', approved_at = clock_timestamp() WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'approval.recorded', p_actor, jsonb_build_object('approval_id', p_approval_id, 'scope_digest', p_scope_digest, 'rationale', p_rationale), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_approval(uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_approval(uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- EXECUTION, begun: the executor is neither the approver nor absent of a live approval; the action locks; returns the items to execute in order.
CREATE OR REPLACE FUNCTION retention.begin_execution(p_action_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; v_live int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'approved' THEN RAISE EXCEPTION 'retention execution rejected: % is % — only an approved action executes', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_live FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.scope_digest = a.scope_digest AND ap.revoked_at IS NULL AND ap.expires_at > clock_timestamp();
  IF v_live < 1 THEN RAISE EXCEPTION 'retention execution rejected: no live approval on the resolved scope' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.approver_principal_id = p_actor AND ap.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'retention execution rejected: an approver of the action does not execute it' USING ERRCODE = '42501';
  END IF;
  UPDATE retention.actions_current SET state = 'executing' WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'execution.started', p_actor, jsonb_build_object('scope_digest', a.scope_digest), p_correlation);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'item_kind', i.item_kind, 'ref', i.ref, 'disposition', i.disposition, 'hold_id', i.hold_id, 'details', i.details) ORDER BY i.dependency_order), '[]'::jsonb)
            FROM retention.scope_items i WHERE i.action_id = p_action_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.begin_execution(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.begin_execution(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION retention.record_execution(p_execution_id uuid, p_action_id uuid, p_tenant uuid, p_domain uuid, p_item_id uuid, p_port text, p_outcome text, p_evidence jsonb, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'executing') THEN
    RAISE EXCEPTION 'retention execution rejected: % is not executing', p_action_id USING ERRCODE = '22023';
  END IF;
  INSERT INTO retention.executions (execution_id, scope, tenant_id, domain_id, action_id, item_id, port, outcome, evidence, executed_by, correlation_id)
  VALUES (p_execution_id, 'DOMAIN', p_tenant, p_domain, p_action_id, p_item_id, p_port, p_outcome, coalesce(p_evidence, '{}'::jsonb), p_actor, p_correlation);
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'execution.item', p_actor, jsonb_build_object('execution_id', p_execution_id, 'item_id', p_item_id, 'port', p_port, 'outcome', p_outcome) || coalesce(p_evidence, '{}'::jsonb), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_execution(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_execution(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION retention.finish_execution(p_action_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_outcome NOT IN ('executed', 'failed') THEN RAISE EXCEPTION 'retention execution rejected: the outcome is executed or failed' USING ERRCODE = '22023'; END IF;
  UPDATE retention.actions_current
     SET state = p_outcome, executed_at = CASE WHEN p_outcome = 'executed' THEN clock_timestamp() ELSE executed_at END,
         failure_class = CASE WHEN p_outcome = 'failed' THEN 'infrastructure' ELSE failure_class END, disposition = CASE WHEN p_outcome = 'failed' THEN 'retry' ELSE disposition END, failure_reason = CASE WHEN p_outcome = 'failed' THEN p_reason ELSE failure_reason END
   WHERE action_id = p_action_id AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'executing';
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not executing', p_action_id USING ERRCODE = '22023'; END IF;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, CASE WHEN p_outcome = 'executed' THEN 'execution.finished' ELSE 'action.failed' END, p_actor, jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.finish_execution(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.finish_execution(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- VERIFICATION: each check with what was expected and what was observed (the caller observed the vault); the residual
-- inventory is re-counted; the action closes verified, or verified_with_residuals when a residual is pending; the
-- DeletionVerified payload is returned for the write's event.
CREATE OR REPLACE FUNCTION retention.verify_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_observed jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; i RECORD; v_pass boolean; v_all boolean := true; v_checks jsonb := '[]'::jsonb; v_floor bigint; v_pending int; v_state text; ob jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.verify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention verification rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'executed' THEN RAISE EXCEPTION 'retention verification rejected: % is % — only an executed action is verified', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  FOR i IN SELECT * FROM retention.scope_items x WHERE x.action_id = p_action_id ORDER BY x.dependency_order LOOP
    IF i.item_kind = 'manifest' AND i.disposition = 'execute' THEN
      ob := coalesce(p_observed -> i.ref, '{}'::jsonb);
      v_pass := EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, true) = false;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': tombstoned and its bytes gone', jsonb_build_object('tombstone', true, 'bytes_present', false),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present'), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'held' THEN
      ob := coalesce(p_observed -> i.ref, '{}'::jsonb);
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, false) = true;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': held — untouched, its bytes present', jsonb_build_object('tombstone', false, 'bytes_present', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present', 'hold_id', i.hold_id), v_pass, p_actor);
    ELSIF i.item_kind = 'outbox_range' THEN
      SELECT p.retained_from_seq INTO v_floor FROM objects.outbox_partitions p WHERE p.partition_key = a.selector ->> 'partition_key';
      v_pass := v_floor = (a.selector ->> 'to_seq')::bigint;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'the retained floor of ' || (a.selector ->> 'partition_key') || ' stands at to_seq', jsonb_build_object('retained_from_seq', (a.selector ->> 'to_seq')::bigint), jsonb_build_object('retained_from_seq', v_floor), v_pass, p_actor);
    ELSE
      CONTINUE;
    END IF;
    v_all := v_all AND v_pass;
    v_checks := v_checks || jsonb_build_object('item', i.ref, 'kind', i.item_kind, 'disposition', i.disposition, 'passed', v_pass);
  END LOOP;
  IF NOT v_all THEN
    UPDATE retention.actions_current SET failure_class = 'infrastructure', disposition = 'retry', failure_reason = 'a verification check failed; the action stays executed until it passes' WHERE action_id = p_action_id;
    PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.failed', p_actor, jsonb_build_object('checks', v_checks, 'verification', 'failed'), p_correlation);
    RETURN jsonb_build_object('state', 'executed', 'verified', false, 'checks', v_checks);
  END IF;
  SELECT count(*) INTO v_pending FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id AND ri.status = 'pending';
  v_state := CASE WHEN v_pending > 0 THEN 'verified_with_residuals' ELSE 'verified' END;
  UPDATE retention.actions_current
     SET state = v_state, verified_at = clock_timestamp(), closed_at = clock_timestamp(), failure_class = NULL, disposition = NULL, failure_reason = NULL,
         residual_summary = (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'ref', ri.ref, 'count', ri.count, 'status', ri.status, 'note', ri.note)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id)
   WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, CASE WHEN v_pending > 0 THEN 'verification.residuals' ELSE 'verification.passed' END, p_actor, jsonb_build_object('checks', v_checks, 'residuals_pending', v_pending), p_correlation);
  RETURN jsonb_build_object('state', v_state, 'verified', true, 'checks', v_checks,
    'scope_digest', a.scope_digest, 'kind', a.kind, 'target_kind', a.target_kind, 'selector', a.selector,
    'authorized_by', (SELECT coalesce(jsonb_agg(ap.approval_id), '[]'::jsonb) FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.revoked_at IS NULL),
    'executed', (SELECT count(*) FROM retention.executions e WHERE e.action_id = p_action_id AND e.outcome = 'done'),
    'held', (SELECT count(*) FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.disposition = 'held'),
    'excluded', (SELECT count(*) FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.disposition = 'excluded'),
    'residual', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'count', ri.count, 'status', ri.status)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.verify_action(uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.verify_action(uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION retention.withdraw_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'retention withdrawal rejected: a reason of 8+ characters' USING ERRCODE = '22023'; END IF;
  UPDATE retention.actions_current SET state = 'withdrawn', closed_at = clock_timestamp(), failure_reason = p_reason
   WHERE action_id = p_action_id AND tenant_id = p_tenant AND domain_id = p_domain AND state IN ('opened', 'scope_resolved', 'held', 'paused', 'approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'retention withdrawal rejected: % is not withdrawable in its state', p_action_id USING ERRCODE = '22023'; END IF;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.withdrawn', p_actor, jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.withdraw_action(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.withdraw_action(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- The log's floor moved by a governed act (0065 §6 "declared"): monotone, at most the next sequence, the caller's own
-- tenant partition only, and only while an executing retention action names exactly this move.
CREATE OR REPLACE FUNCTION objects.outbox_declare_floor(p_partition_key text, p_to_seq bigint, p_action_id uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = objects, retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_floor bigint; v_next bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  IF p_partition_key IS NULL OR p_to_seq IS NULL OR p_action_id IS NULL THEN RAISE EXCEPTION 'floor declaration rejected: partition, sequence and action are named' USING ERRCODE = '22023'; END IF;
  IF p_partition_key IS DISTINCT FROM ('tenant:' || public.eye_tenant()::text) THEN RAISE EXCEPTION 'floor declaration rejected: % is not this tenant''s partition', p_partition_key USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM retention.actions_current a WHERE a.action_id = p_action_id AND a.tenant_id = public.eye_tenant() AND a.state = 'executing' AND a.kind = 'log_floor'
                    AND a.selector ->> 'partition_key' = p_partition_key AND (a.selector ->> 'to_seq')::bigint = p_to_seq) THEN
    RAISE EXCEPTION 'floor declaration rejected: no executing log_floor action names this move' USING ERRCODE = '42501';
  END IF;
  SELECT p.retained_from_seq, p.next_seq INTO v_floor, v_next FROM objects.outbox_partitions p WHERE p.partition_key = p_partition_key FOR UPDATE;
  IF v_floor IS NULL THEN RAISE EXCEPTION 'floor declaration rejected: partition % has no row', p_partition_key USING ERRCODE = '23503'; END IF;
  IF p_to_seq <= v_floor OR p_to_seq > v_next THEN RAISE EXCEPTION 'floor declaration rejected: % must lie above the floor % and at most the next sequence %', p_to_seq, v_floor, v_next USING ERRCODE = '22023'; END IF;
  UPDATE objects.outbox_partitions SET retained_from_seq = p_to_seq, retention_policy = 'declared', retention_note = 'retention action ' || p_action_id::text || ' moved the floor from ' || v_floor || ' to ' || p_to_seq || ' at ' || clock_timestamp()::text
   WHERE partition_key = p_partition_key;
  RETURN jsonb_build_object('partition_key', p_partition_key, 'floor_before', v_floor, 'floor_after', p_to_seq, 'next_seq', v_next);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_declare_floor(text, bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_declare_floor(text, bigint, uuid) TO eye_commit;

-- The tombstone port refuses a held manifest and admits the retention executor (AU-MEM-0060).
CREATE OR REPLACE FUNCTION observation.tombstone_blob(
  p_tombstone_id uuid, p_tenant uuid, p_domain uuid, p_manifest_id uuid,
  p_reason text, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_inserted boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY[
    'observation.item.admit', 'observation.sweeper.reconcile', 'observation.quarantine.review', 'retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM observation.blob_manifests
                  WHERE manifest_id = p_manifest_id AND tenant_id = p_tenant AND domain_id = p_domain) THEN
    RAISE EXCEPTION 'tombstone rejected: no such manifest in this domain' USING ERRCODE = '23503';
  END IF;
  -- 0066 §4 (AU-MEM-0060): a LEGAL HOLD takes precedence over any deletion — the manifest's flag, or an unlifted hold row.
  IF EXISTS (SELECT 1 FROM observation.blob_manifests m WHERE m.manifest_id = p_manifest_id AND m.legal_hold)
     OR EXISTS (SELECT 1 FROM observation.legal_holds h WHERE h.lifted_at IS NULL
                 AND (h.manifest_id = p_manifest_id
                      OR h.evd_object_id IN (SELECT o.object_id FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = p_manifest_id))) THEN
    RAISE EXCEPTION 'tombstone refused: manifest % is under a legal hold (hold %); the hold takes precedence over deletion', p_manifest_id,
      (SELECT h.hold_id FROM observation.legal_holds h WHERE h.lifted_at IS NULL AND (h.manifest_id = p_manifest_id OR h.evd_object_id IN (SELECT o.object_id FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = p_manifest_id)) ORDER BY h.placed_at LIMIT 1) USING ERRCODE = 'P0R01';
  END IF;
  INSERT INTO observation.blob_tombstones (
    tombstone_id, scope, tenant_id, domain_id, manifest_id, reason, actor_principal_id, correlation_id
  ) VALUES (p_tombstone_id, 'DOMAIN', p_tenant, p_domain, p_manifest_id, p_reason,
            public.eye_principal(), p_correlation)
  ON CONFLICT (manifest_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$ LANGUAGE plpgsql;

-- The interface register: L3-I04 and L3-I05 are bound to what now publishes them (the moves are collected in §10).

-- ============================================================
-- §5 ContradictionDetected (interface L2-I03; AU-INT-0025 clause): incompatible assertions LINKED, never collapsed.
-- ============================================================
-- Two admitted claims with the same subject and predicate and an incompatible object value are a CONTRADICTION: a row
-- links them (each keeps its own truth state; neither is rewritten), the newer claim is queued for review with the reason
-- `contradiction`, the new claim's header names the other in contradiction_refs, and ContradictionDetected is published
-- from the admitting write. A person adjudicates through the review route (both stand; one withdrawn; superseded) —
-- V03-T-286: contradictory claims coexist until governed adjudication.
CREATE TABLE intelligence.contradictions (
  contradiction_id  uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('claim.value')),
  a_object_id       uuid NOT NULL,
  a_version         bigint NOT NULL,
  b_object_id       uuid NOT NULL,
  b_version         bigint NOT NULL,
  subject           text NOT NULL,
  predicate         text NOT NULL,
  a_value           text,
  b_value           text,
  basis             jsonb NOT NULL DEFAULT '{}'::jsonb,
  state             text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'adjudicated')),
  review_case_id    uuid,
  detected_by       uuid NOT NULL,
  detected_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  adjudicated_by    uuid,
  adjudicated_at    timestamptz,
  adjudication      text CHECK (adjudication IS NULL OR adjudication IN ('both_stand', 'a_withdrawn', 'b_withdrawn', 'superseded')),
  adjudication_reason text,
  correlation_id    uuid NOT NULL,
  CONSTRAINT ctr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ctr_distinct CHECK (a_object_id <> b_object_id OR a_version <> b_version),
  CONSTRAINT ctr_adjudicated CHECK (state = 'open' OR (adjudicated_by IS NOT NULL AND adjudication IS NOT NULL AND length(btrim(adjudication_reason)) >= 8))
);
CREATE UNIQUE INDEX ctr_pair ON intelligence.contradictions (tenant_id, domain_id, a_object_id, a_version, b_object_id, b_version);
CREATE INDEX ctr_open ON intelligence.contradictions (tenant_id, domain_id, state);
REVOKE ALL ON intelligence.contradictions FROM PUBLIC;
ALTER TABLE intelligence.contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.contradictions FORCE ROW LEVEL SECURITY;
CREATE POLICY intelligence_isolation ON intelligence.contradictions USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON intelligence.contradictions TO eye_app, eye_commit;
-- The only mutation after detection is the adjudication (a lift-only shape, as legal holds).
CREATE OR REPLACE FUNCTION intelligence.contradictions_adjudicate_only() RETURNS trigger
SET search_path = intelligence, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'contradictions are never deleted' USING ERRCODE = '42501'; END IF;
  IF OLD.state = 'adjudicated' THEN RAISE EXCEPTION 'an adjudicated contradiction is not changed' USING ERRCODE = '42501'; END IF;
  IF NEW.a_object_id <> OLD.a_object_id OR NEW.b_object_id <> OLD.b_object_id OR NEW.a_version <> OLD.a_version OR NEW.b_version <> OLD.b_version OR NEW.subject <> OLD.subject OR NEW.predicate <> OLD.predicate OR NEW.detected_at <> OLD.detected_at THEN
    RAISE EXCEPTION 'a contradiction''s link is immutable; only its adjudication is recorded' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ctr_adjudicate_only BEFORE UPDATE OR DELETE ON intelligence.contradictions FOR EACH ROW EXECUTE FUNCTION intelligence.contradictions_adjudicate_only();
ALTER TABLE intelligence.review_current DROP CONSTRAINT review_current_queued_reason_check;
ALTER TABLE intelligence.review_current ADD CONSTRAINT review_current_queued_reason_check CHECK (queued_reason IN ('below_review_threshold', 'abstained', 'method_flagged', 'contradiction', 'challenged'));

CREATE OR REPLACE FUNCTION intelligence.record_contradiction(p_contradiction_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_a_object_id uuid, p_a_version bigint, p_b_object_id uuid, p_b_version bigint, p_subject text, p_predicate text, p_a_value text, p_b_value text, p_basis jsonb, p_review_case_id uuid, p_actor uuid, p_correlation uuid)
RETURNS boolean
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_inserted int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.claim.admit', 'intelligence.review.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_kind IS NULL OR p_a_object_id IS NULL OR p_b_object_id IS NULL THEN RAISE EXCEPTION 'a contradiction links two assertions' USING ERRCODE = '22023'; END IF;
  INSERT INTO intelligence.contradictions (contradiction_id, scope, tenant_id, domain_id, kind, a_object_id, a_version, b_object_id, b_version, subject, predicate, a_value, b_value, basis, review_case_id, detected_by, correlation_id)
  VALUES (p_contradiction_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_a_object_id, p_a_version, p_b_object_id, p_b_version, p_subject, p_predicate, p_a_value, p_b_value, coalesce(p_basis, '{}'::jsonb), p_review_case_id, p_actor, p_correlation)
  ON CONFLICT (tenant_id, domain_id, a_object_id, a_version, b_object_id, b_version) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.record_contradiction(uuid,uuid,uuid,text,uuid,bigint,uuid,bigint,text,text,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.record_contradiction(uuid,uuid,uuid,text,uuid,bigint,uuid,bigint,text,text,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION intelligence.adjudicate_contradiction(p_contradiction_id uuid, p_tenant uuid, p_domain uuid, p_adjudication text, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.review.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_adjudication NOT IN ('both_stand', 'a_withdrawn', 'b_withdrawn', 'superseded') THEN RAISE EXCEPTION 'an adjudication is both_stand, a_withdrawn, b_withdrawn or superseded' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'an adjudication states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE intelligence.contradictions SET state = 'adjudicated', adjudicated_by = p_actor, adjudicated_at = clock_timestamp(), adjudication = p_adjudication, adjudication_reason = p_reason
   WHERE contradiction_id = p_contradiction_id AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'contradiction % is not open in this domain', p_contradiction_id USING ERRCODE = '23503'; END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.adjudicate_contradiction(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.adjudicate_contradiction(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- A CHALLENGE (V00-T-037): a person opens a review case on an admitted claim version (reason `challenged`), the route
-- by which a correction of an admitted claim — and so a claim.corrected re-derivation — becomes possible outside extraction.
CREATE OR REPLACE FUNCTION intelligence.request_review(p_case_id uuid, p_tenant uuid, p_domain uuid, p_claim_object_id uuid, p_claim_version bigint, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_run uuid; v_method uuid; v_conf numeric;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.review.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'a challenge states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_claim_object_id AND o.object_version = p_claim_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type IN ('ENT', 'EVT', 'CLM', 'REL', 'ASM')) THEN
    RAISE EXCEPTION 'challenge rejected: no claim %@% in this domain', p_claim_object_id, p_claim_version USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM intelligence.review_current r WHERE r.claim_object_id = p_claim_object_id AND r.claim_version = p_claim_version AND r.state = 'queued') THEN
    RAISE EXCEPTION 'challenge rejected: claim %@% is already queued for review', p_claim_object_id, p_claim_version USING ERRCODE = '23505';
  END IF;
  SELECT l.run_id, l.method_id, l.confidence INTO v_run, v_method, v_conf FROM intelligence.claim_lineage l WHERE l.claim_object_id = p_claim_object_id AND l.claim_version = p_claim_version LIMIT 1;
  IF v_run IS NULL THEN RAISE EXCEPTION 'challenge rejected: claim %@% has no lineage (no run to review it under)', p_claim_object_id, p_claim_version USING ERRCODE = '23503'; END IF;
  INSERT INTO intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, correlation_id)
  VALUES (p_case_id, 'DOMAIN', p_tenant, p_domain, p_claim_object_id, p_claim_version, v_run, v_method, 'challenged', v_conf, 'queued', p_correlation);
  INSERT INTO intelligence.review_events (event_id, scope, tenant_id, domain_id, case_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_case_id, 'case.queued', p_actor, jsonb_build_object('reason', 'challenged', 'challenge', p_reason, 'claim_object_id', p_claim_object_id, 'claim_version', p_claim_version), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.request_review(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.request_review(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §6 TransformationEvaluated (interface L2-I05; AU-INT-0112 clause; ES-32-008): the producing version's quality, safety, cost, latency and fitness.
-- ============================================================
-- An evaluation is a governed act on a method version: the measures are computed FROM THE LEDGERS inside the write
-- (the gateway calls — outcomes and latency; the runs; the review yield of its claims; the contradictions its claims
-- entered; the claims' confidence), the fitness verdict is the evaluator's (fit | unfit | indeterminate, with the
-- reason), the record is append-only, and the verdict CONSTRAINS DOWNSTREAM USE: an unfit version admits no more
-- claims (lock_active_method) and is not activated (transition_method) until a later evaluation says otherwise.
-- TransformationEvaluated is the write's event.
CREATE TABLE intelligence.method_evaluations (
  evaluation_id  uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  method_id      uuid NOT NULL,
  method_version int NOT NULL,
  window_from    timestamptz NOT NULL,
  window_to      timestamptz NOT NULL,
  measures       jsonb NOT NULL,
  fitness_state  text NOT NULL CHECK (fitness_state IN ('fit', 'unfit', 'indeterminate')),
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 8),
  evaluated_by   uuid NOT NULL,
  evaluated_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT mev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT mev_window CHECK (window_to >= window_from)
);
CREATE INDEX mev_method ON intelligence.method_evaluations (method_id, evaluated_at);
CREATE TRIGGER method_evaluations_append_only BEFORE UPDATE OR DELETE ON intelligence.method_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
REVOKE ALL ON intelligence.method_evaluations FROM PUBLIC;
ALTER TABLE intelligence.method_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.method_evaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY intelligence_isolation ON intelligence.method_evaluations USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON intelligence.method_evaluations TO eye_app, eye_commit;
ALTER TABLE intelligence.methods_current ADD COLUMN fitness_state text NOT NULL DEFAULT 'none' CHECK (fitness_state IN ('none', 'fit', 'unfit', 'indeterminate'));
ALTER TABLE intelligence.methods_current ADD COLUMN fitness_evaluation_id uuid;
ALTER TABLE intelligence.method_events DROP CONSTRAINT method_events_event_check;
ALTER TABLE intelligence.method_events ADD CONSTRAINT method_events_event_check CHECK (event IN ('method.registered', 'method.approved', 'method.activated', 'method.suspended', 'method.retired', 'method.rejected', 'method.evaluated'));

CREATE OR REPLACE FUNCTION intelligence.evaluate_method(p_evaluation_id uuid, p_tenant uuid, p_domain uuid, p_method_id uuid, p_window_from timestamptz, p_window_to timestamptz, p_fitness text, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m intelligence.methods_current%ROWTYPE; v_from timestamptz; v_to timestamptz; v_measures jsonb; calls RECORD; runs RECORD; rev RECORD; v_claims int; v_conf numeric; v_contra int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.method.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_fitness NOT IN ('fit', 'unfit', 'indeterminate') THEN RAISE EXCEPTION 'an evaluation states fitness: fit, unfit or indeterminate' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'an evaluation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM intelligence.methods_current x WHERE x.method_id = p_method_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'evaluation rejected: no such method in this domain' USING ERRCODE = '23503'; END IF;
  v_from := coalesce(p_window_from, m.registered_at); v_to := coalesce(p_window_to, clock_timestamp());
  IF v_to < v_from THEN RAISE EXCEPTION 'evaluation rejected: the window ends before it begins' USING ERRCODE = '22023'; END IF;
  SELECT count(*) AS n, count(*) FILTER (WHERE outcome = 'completed') AS completed, count(*) FILTER (WHERE outcome = 'abstained') AS abstained,
         count(*) FILTER (WHERE outcome = 'refused') AS refused, count(*) FILTER (WHERE outcome = 'failed') AS failed,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95, max(latency_ms) AS max_ms
    INTO calls FROM intelligence.gateway_calls g WHERE g.method_id = p_method_id AND g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.occurred_at >= v_from AND g.occurred_at <= v_to;
  SELECT count(*) AS n, count(*) FILTER (WHERE state = 'completed') AS completed, count(*) FILTER (WHERE state IN ('failed', 'budget_exceeded')) AS failed, coalesce(sum(claims_admitted), 0) AS claims_admitted, coalesce(sum(evidence_read), 0) AS evidence_read
    INTO runs FROM intelligence.runs_current r WHERE r.method_id = p_method_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.started_at >= v_from AND r.started_at <= v_to;
  SELECT count(*) AS n, count(*) FILTER (WHERE state = 'approved') AS approved, count(*) FILTER (WHERE state = 'corrected') AS corrected, count(*) FILTER (WHERE state = 'rejected') AS rejected, count(*) FILTER (WHERE state = 'queued') AS queued,
         count(*) FILTER (WHERE queued_reason = 'contradiction') AS contradiction_cases
    INTO rev FROM intelligence.review_current rc WHERE rc.method_id = p_method_id AND rc.tenant_id = p_tenant AND rc.domain_id = p_domain AND rc.opened_at >= v_from AND rc.opened_at <= v_to;
  SELECT count(*), avg(confidence) INTO v_claims, v_conf FROM intelligence.claim_lineage l WHERE l.method_id = p_method_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.recorded_at >= v_from AND l.recorded_at <= v_to;
  SELECT count(*) INTO v_contra FROM intelligence.contradictions c JOIN intelligence.claim_lineage l ON l.claim_object_id = c.b_object_id AND l.claim_version = c.b_version
   WHERE l.method_id = p_method_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.detected_at >= v_from AND c.detected_at <= v_to;
  v_measures := jsonb_build_object(
    'window', jsonb_build_object('from', v_from, 'to', v_to),
    'quality', jsonb_build_object('claims', v_claims, 'mean_confidence', round(coalesce(v_conf, 0)::numeric, 4), 'review_yield', jsonb_build_object('cases', rev.n, 'approved', rev.approved, 'corrected', rev.corrected, 'rejected', rev.rejected, 'queued', rev.queued),
                                   'contradictions_entered', v_contra, 'abstention_rate', CASE WHEN calls.n = 0 THEN NULL ELSE round(calls.abstained::numeric / calls.n, 4) END),
    'safety', jsonb_build_object('refused', calls.refused, 'failed_calls', calls.failed, 'failed_runs', runs.failed),
    'cost', jsonb_build_object('calls', calls.n, 'budget_calls', m.budget_calls, 'runs', runs.n, 'evidence_read', runs.evidence_read, 'claims_admitted', runs.claims_admitted),
    'latency', jsonb_build_object('p50_ms', calls.p50, 'p95_ms', calls.p95, 'max_ms', calls.max_ms),
    'fitness', jsonb_build_object('state', p_fitness, 'reason', p_reason, 'evaluated_by', p_actor));
  INSERT INTO intelligence.method_evaluations (evaluation_id, scope, tenant_id, domain_id, method_id, method_version, window_from, window_to, measures, fitness_state, reason, evaluated_by, correlation_id)
  VALUES (p_evaluation_id, 'DOMAIN', p_tenant, p_domain, p_method_id, m.method_version, v_from, v_to, v_measures, p_fitness, p_reason, p_actor, p_correlation);
  UPDATE intelligence.methods_current SET fitness_state = p_fitness, fitness_evaluation_id = p_evaluation_id, updated_at = clock_timestamp() WHERE method_id = p_method_id;
  INSERT INTO intelligence.method_events (event_id, scope, tenant_id, domain_id, method_id, method_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_method_id, m.method_version, 'method.evaluated', p_actor, jsonb_build_object('evaluation_id', p_evaluation_id, 'fitness', p_fitness, 'reason', p_reason, 'window_from', v_from, 'window_to', v_to), p_correlation);
  RETURN v_measures || jsonb_build_object('evaluation_id', p_evaluation_id, 'method_version', m.method_version, 'method_key', m.method_key);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.evaluate_method(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.evaluate_method(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,uuid,uuid) TO eye_commit;

-- An unfit version produces nothing more and is not activated; an evaluation is not a lifecycle transition (the rebuild).
CREATE OR REPLACE FUNCTION intelligence.lock_active_method(
  p_method_id uuid, p_tenant uuid, p_domain uuid
) RETURNS TABLE (
  method_key text, method_version int, gateway_mode text, model_id text,
  model_weights_digest text, runtime_version text, prompt_ref text, prompt_version text,
  prompt_text text, prompt_digest text, decoding_digest text,
  confidence_floor numeric, review_below numeric,
  budget_calls int, budget_seconds int, target_types text[], source_id uuid
)
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.run.start', 'intelligence.claim.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT m.lifecycle_state INTO v_state FROM intelligence.methods_current m
   WHERE m.method_id = p_method_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'extraction rejected: no such method' USING ERRCODE = '23503';
  END IF;
  IF v_state <> 'active' THEN
    RAISE EXCEPTION 'extraction rejected: method is %, not active', v_state USING ERRCODE = '42501';
  END IF;
  -- 0066 §6 (ES-32-008): an evaluation that found the producing version UNFIT constrains downstream use — no extraction runs on it.
  IF EXISTS (SELECT 1 FROM intelligence.methods_current m WHERE m.method_id = p_method_id AND m.fitness_state = 'unfit') THEN
    RAISE EXCEPTION 'extraction rejected: method version is unfit per its evaluation % — re-evaluate it before it produces again',
      (SELECT m.fitness_evaluation_id FROM intelligence.methods_current m WHERE m.method_id = p_method_id) USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.method_key, m.method_version, m.gateway_mode, m.model_id,
           m.model_weights_digest, m.runtime_version, m.prompt_ref, m.prompt_version,
           m.prompt_text, m.prompt_digest, m.decoding_digest, m.confidence_floor, m.review_below,
           m.budget_calls, m.budget_seconds, m.target_types, m.source_id
      FROM intelligence.methods_current m WHERE m.method_id = p_method_id;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION intelligence.transition_method(
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
  -- 0066 §6: a version evaluated UNFIT is not activated until a later evaluation says otherwise.
  IF p_to = 'active' AND EXISTS (SELECT 1 FROM intelligence.methods_current m WHERE m.method_id = p_method_id AND m.fitness_state = 'unfit') THEN
    RAISE EXCEPTION 'method transition rejected: the version is unfit per its evaluation; evaluate it fit before activating' USING ERRCODE = '22023';
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
CREATE OR REPLACE FUNCTION intelligence.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint)
SECURITY DEFINER SET search_path = intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.read', 'observation.read']);

  /*
   * SCOPE IT EXPLICITLY.
   *
   * This function is SECURITY DEFINER, so it runs as its owner and row-level
   * security is not a boundary it can rely on. Without these predicates a caller
   * in one domain would receive counts covering every tenant in the cluster —
   * not content, but still a cross-tenant disclosure, and an answer that is
   * simply wrong about the domain the caller asked about.
   *
   * The scope comes from the ESTABLISHED CONTEXT, never from an argument.
   */
  v_tenant := public.eye_tenant();
  v_domain := public.eye_domain();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'projection rebuild rejected: no tenant is established in this context'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH last_method AS (
    SELECT DISTINCT ON (e.method_id) e.method_id, e.event
      FROM intelligence.method_events e
     WHERE e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
       -- 0066 §6: an evaluation is not a state transition (the lifecycle stays what the last transition made it)
       AND e.event <> 'method.evaluated'
     ORDER BY e.method_id, e.occurred_at DESC, e.event_id DESC
  ), expect_method AS (
    SELECT lm.method_id,
           CASE lm.event WHEN 'method.registered' THEN 'draft'
                         WHEN 'method.approved'   THEN 'approved'
                         WHEN 'method.activated'  THEN 'active'
                         WHEN 'method.suspended'  THEN 'suspended'
                         WHEN 'method.retired'    THEN 'retired' END AS state
      FROM last_method lm
  )
  SELECT 'methods_current'::text,
         (SELECT count(*) FROM intelligence.methods_current m
           WHERE m.tenant_id = v_tenant AND (v_domain IS NULL OR m.domain_id = v_domain)),
         (SELECT count(*) FROM expect_method),
         (SELECT count(*) FROM intelligence.methods_current m
            JOIN expect_method x ON x.method_id = m.method_id
           WHERE m.lifecycle_state IS DISTINCT FROM x.state);

  RETURN QUERY
  WITH last_run AS (
    SELECT DISTINCT ON (e.run_id) e.run_id, e.event
      FROM intelligence.run_events e
     WHERE e.event IN ('run.started','run.finished','run.failed','run.budget_exceeded')
       AND e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.run_id, e.occurred_at DESC, e.event_id DESC
  ), expect_run AS (
    SELECT lr.run_id,
           CASE lr.event WHEN 'run.started' THEN 'running'
                         WHEN 'run.finished' THEN 'completed'
                         WHEN 'run.budget_exceeded' THEN 'budget_exceeded'
                         ELSE 'failed' END AS state
      FROM last_run lr
  )
  SELECT 'runs_current'::text,
         (SELECT count(*) FROM intelligence.runs_current r
           WHERE r.tenant_id = v_tenant AND (v_domain IS NULL OR r.domain_id = v_domain)),
         (SELECT count(*) FROM expect_run),
         (SELECT count(*) FROM intelligence.runs_current r
            JOIN expect_run x ON x.run_id = r.run_id
           WHERE r.state IS DISTINCT FROM x.state);

  RETURN QUERY
  WITH last_case AS (
    SELECT DISTINCT ON (e.case_id) e.case_id, e.event
      FROM intelligence.review_events e
     WHERE e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.case_id, e.occurred_at DESC, e.event_id DESC
  ), expect_case AS (
    SELECT lc.case_id,
           CASE lc.event WHEN 'case.queued' THEN 'queued'
                         WHEN 'case.approved' THEN 'approved'
                         WHEN 'case.corrected' THEN 'corrected'
                         ELSE 'rejected' END AS state
      FROM last_case lc
  )
  SELECT 'review_current'::text,
         (SELECT count(*) FROM intelligence.review_current c
           WHERE c.tenant_id = v_tenant AND (v_domain IS NULL OR c.domain_id = v_domain)),
         (SELECT count(*) FROM expect_case),
         (SELECT count(*) FROM intelligence.review_current c
            JOIN expect_case x ON x.case_id = c.case_id
           WHERE c.state IS DISTINCT FROM x.state);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §7 OntologyChangeProposed (interface L4-I05; AU-MEM-0026; V00-T-046, V03-T-105): a versioned vocabulary, a proposal with its compatibility analysis, a steward's decision.
-- ============================================================
-- The domain's ontology is a VERSIONED VOCABULARY: entity types and predicates (each predicate with the entity types it
-- admits at either end). A change is PROPOSED as the next version with its rationale and alternatives; the proposal's
-- compatibility analysis is computed inside the write over what the domain holds (the asserted edges each removed or
-- narrowed predicate would strand; the methods declaring target types; the strategy objects resting on those edges) —
-- additive when nothing existing is affected, breaking otherwise — and four reviews open on it (compatibility,
-- migration, domain, governance). The steward decides (never the proposer; a breaking proposal is refused while any
-- impacted edge is still asserted); approval activates the version and supersedes the prior one; once a domain has an
-- active version, assert_edge admits only its predicates. OntologyChangeProposed is the proposing write's event.
INSERT INTO identity.roles (code, scope, description) VALUES
  ('ontology_steward', 'DOMAIN', 'Decides ontology change proposals (graph.ontology.decide) after their compatibility, migration, domain and governance reviews; never the proposer')
ON CONFLICT (code) DO NOTHING;
CREATE TABLE graph.ontology_versions (
  version_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  namespace       text NOT NULL DEFAULT 'domain',
  version         int NOT NULL CHECK (version >= 1),
  entity_types    text[] NOT NULL,
  predicates      jsonb NOT NULL CHECK (jsonb_typeof(predicates) = 'array'),
  state           text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'active', 'superseded', 'rejected')),
  compatibility   text NOT NULL CHECK (compatibility IN ('additive', 'breaking')),
  change          jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis        jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale       text NOT NULL CHECK (length(btrim(rationale)) >= 8),
  alternatives    jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviews         jsonb NOT NULL DEFAULT '{}'::jsonb,
  migration_plan  text,
  proposed_by     uuid NOT NULL,
  proposed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_reason text,
  activated_at    timestamptz,
  superseded_at   timestamptz,
  correlation_id  uuid NOT NULL,
  CONSTRAINT ont_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ont_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);
CREATE UNIQUE INDEX ont_one_active ON graph.ontology_versions (tenant_id, domain_id, namespace) WHERE state = 'active';
CREATE UNIQUE INDEX ont_version ON graph.ontology_versions (tenant_id, domain_id, namespace, version);
CREATE TABLE graph.ontology_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  version_id         uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('ontology.proposed', 'ontology.approved', 'ontology.rejected', 'ontology.activated', 'ontology.superseded')),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT onte_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX onte_version ON graph.ontology_events (version_id, occurred_at);
CREATE TRIGGER ontology_events_append_only BEFORE UPDATE OR DELETE ON graph.ontology_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
REVOKE ALL ON graph.ontology_versions, graph.ontology_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ontology_versions', 'ontology_events'] LOOP
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

CREATE OR REPLACE FUNCTION graph.propose_ontology_version(p_version_id uuid, p_tenant uuid, p_domain uuid, p_namespace text, p_entity_types text[], p_predicates jsonb, p_rationale text, p_alternatives jsonb, p_migration_plan text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = graph, intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur graph.ontology_versions%ROWTYPE; v_version int := 1; v_added_types text[]; v_removed_types text[]; v_added_preds jsonb; v_removed_preds jsonb; v_narrowed jsonb := '[]'::jsonb;
        v_edges jsonb := '[]'::jsonb; v_edge_count int := 0; v_strategy int := 0; v_methods jsonb := '[]'::jsonb; v_compat text; pr jsonb; r RECORD; v_analysis jsonb; v_change jsonb; v_entity_count int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.ontology.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_predicates IS NULL OR jsonb_typeof(p_predicates) <> 'array' THEN RAISE EXCEPTION 'an ontology version lists its predicates' USING ERRCODE = '22023'; END IF;
  IF p_entity_types IS NULL OR cardinality(p_entity_types) = 0 THEN RAISE EXCEPTION 'an ontology version lists its entity types' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_rationale)), 0) < 8 THEN RAISE EXCEPTION 'a proposal states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM graph.ontology_versions v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.namespace = coalesce(p_namespace, 'domain') AND v.state = 'proposed') THEN
    RAISE EXCEPTION 'a proposal is already open for this namespace; decide it first' USING ERRCODE = '23505';
  END IF;
  FOR pr IN SELECT * FROM jsonb_array_elements(p_predicates) LOOP
    IF coalesce(length(btrim(pr ->> 'predicate')), 0) = 0 THEN RAISE EXCEPTION 'every predicate names itself' USING ERRCODE = '22023'; END IF;
  END LOOP;
  SELECT * INTO cur FROM graph.ontology_versions v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.namespace = coalesce(p_namespace, 'domain') AND v.state = 'active';
  -- Version numbers are never reused: a rejected proposal keeps the number it was proposed under.
  SELECT coalesce(max(v.version), 0) + 1 INTO v_version FROM graph.ontology_versions v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.namespace = coalesce(p_namespace, 'domain');
  IF FOUND AND cur.version_id IS NOT NULL THEN
    SELECT coalesce(array_agg(t), '{}') INTO v_added_types FROM unnest(p_entity_types) t WHERE NOT (t = ANY (cur.entity_types));
    SELECT coalesce(array_agg(t), '{}') INTO v_removed_types FROM unnest(cur.entity_types) t WHERE NOT (t = ANY (p_entity_types));
    SELECT coalesce(jsonb_agg(np), '[]'::jsonb) INTO v_added_preds FROM jsonb_array_elements(p_predicates) np WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(cur.predicates) op WHERE op ->> 'predicate' = np ->> 'predicate');
    SELECT coalesce(jsonb_agg(op), '[]'::jsonb) INTO v_removed_preds FROM jsonb_array_elements(cur.predicates) op WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_predicates) np WHERE np ->> 'predicate' = op ->> 'predicate');
    -- Narrowed: a predicate kept but with a smaller set of admitted subject or object types.
    SELECT coalesce(jsonb_agg(jsonb_build_object('predicate', np ->> 'predicate', 'from', op, 'to', np)), '[]'::jsonb) INTO v_narrowed
      FROM jsonb_array_elements(p_predicates) np JOIN jsonb_array_elements(cur.predicates) op ON op ->> 'predicate' = np ->> 'predicate'
     WHERE ((op -> 'subject_types') IS NOT NULL AND (np -> 'subject_types') IS NOT NULL AND NOT ((np -> 'subject_types') @> (op -> 'subject_types')))
        OR ((op -> 'object_types') IS NOT NULL AND (np -> 'object_types') IS NOT NULL AND NOT ((np -> 'object_types') @> (op -> 'object_types')));
  ELSE
    v_added_types := p_entity_types; v_removed_types := '{}'; v_added_preds := p_predicates; v_removed_preds := '[]'::jsonb;
  END IF;
  -- THE COMPATIBILITY ANALYSIS: what a removed or narrowed predicate, or a removed entity type, would strand.
  FOR r IN SELECT DISTINCT e.predicate, count(*) OVER (PARTITION BY e.predicate) AS n, e.edge_id
             FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.state = 'asserted'
              AND (e.predicate IN (SELECT rp ->> 'predicate' FROM jsonb_array_elements(v_removed_preds) rp) OR e.predicate IN (SELECT nn ->> 'predicate' FROM jsonb_array_elements(v_narrowed) nn))
            ORDER BY e.predicate LIMIT 20 LOOP
    v_edges := v_edges || jsonb_build_object('edge_id', r.edge_id, 'predicate', r.predicate);
  END LOOP;
  SELECT count(*) INTO v_edge_count FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.state = 'asserted'
    AND (e.predicate IN (SELECT rp ->> 'predicate' FROM jsonb_array_elements(v_removed_preds) rp) OR e.predicate IN (SELECT nn ->> 'predicate' FROM jsonb_array_elements(v_narrowed) nn));
  SELECT count(*) INTO v_strategy FROM graph.dependencies d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_kind = 'edge'
    AND d.depends_on_id IN (SELECT e.edge_id FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.state = 'asserted'
                              AND (e.predicate IN (SELECT rp ->> 'predicate' FROM jsonb_array_elements(v_removed_preds) rp) OR e.predicate IN (SELECT nn ->> 'predicate' FROM jsonb_array_elements(v_narrowed) nn)));
  SELECT count(*) INTO v_entity_count FROM graph.entities_current en WHERE en.tenant_id = p_tenant AND en.domain_id = p_domain AND en.entity_type = ANY (v_removed_types);
  v_compat := CASE WHEN cardinality(v_removed_types) > 0 OR jsonb_array_length(v_removed_preds) > 0 OR jsonb_array_length(v_narrowed) > 0 THEN 'breaking' ELSE 'additive' END;
  v_change := jsonb_build_object('added', jsonb_build_object('entity_types', to_jsonb(v_added_types), 'predicates', v_added_preds), 'removed', jsonb_build_object('entity_types', to_jsonb(v_removed_types), 'predicates', v_removed_preds), 'narrowed', v_narrowed);
  v_analysis := jsonb_build_object('class', v_compat, 'edges', jsonb_build_object('count', v_edge_count, 'sample', v_edges), 'entities_of_removed_types', v_entity_count, 'strategy_dependencies_on_edges', v_strategy,
                                   'from_version', CASE WHEN cur.version_id IS NULL THEN NULL ELSE cur.version END, 'to_version', v_version);
  INSERT INTO graph.ontology_versions (version_id, scope, tenant_id, domain_id, namespace, version, entity_types, predicates, compatibility, change, analysis, rationale, alternatives, reviews, migration_plan, proposed_by, correlation_id)
  VALUES (p_version_id, 'DOMAIN', p_tenant, p_domain, coalesce(p_namespace, 'domain'), v_version, p_entity_types, p_predicates, v_compat, v_change, v_analysis, p_rationale, coalesce(p_alternatives, '[]'::jsonb),
          jsonb_build_object('compatibility', CASE WHEN v_compat = 'additive' THEN 'passed' ELSE 'open' END, 'migration', CASE WHEN v_compat = 'additive' THEN 'not_required' ELSE 'open' END, 'domain', 'open', 'governance', 'open'), p_migration_plan, p_actor, p_correlation);
  INSERT INTO graph.ontology_events (event_id, scope, tenant_id, domain_id, version_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_version_id, 'ontology.proposed', p_actor, jsonb_build_object('version', v_version, 'compatibility', v_compat, 'change', v_change, 'analysis', v_analysis), p_correlation);
  RETURN jsonb_build_object('version_id', p_version_id, 'namespace', coalesce(p_namespace, 'domain'), 'from_version', CASE WHEN cur.version_id IS NULL THEN NULL ELSE cur.version END, 'to_version', v_version, 'compatibility', v_compat, 'change', v_change, 'analysis', v_analysis,
                            'reviews', jsonb_build_object('compatibility', CASE WHEN v_compat = 'additive' THEN 'passed' ELSE 'open' END, 'migration', CASE WHEN v_compat = 'additive' THEN 'not_required' ELSE 'open' END, 'domain', 'open', 'governance', 'open'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propose_ontology_version(uuid,uuid,uuid,text,text[],jsonb,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propose_ontology_version(uuid,uuid,uuid,text,text[],jsonb,text,jsonb,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.decide_ontology_proposal(p_version_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_reason text, p_reviews jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v graph.ontology_versions%ROWTYPE; v_prior uuid; v_impacted int; v_reviews jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.ontology.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'a decision is approve or reject' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM graph.ontology_versions x WHERE x.version_id = p_version_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no ontology proposal % in this domain', p_version_id USING ERRCODE = '23503'; END IF;
  IF v.state <> 'proposed' THEN RAISE EXCEPTION 'proposal % is %, not open', p_version_id, v.state USING ERRCODE = '22023'; END IF;
  IF v.proposed_by = p_actor THEN RAISE EXCEPTION 'the proposer of an ontology change does not decide it' USING ERRCODE = '42501'; END IF;
  v_reviews := v.reviews || coalesce(p_reviews, '{}'::jsonb);
  IF p_decision = 'reject' THEN
    UPDATE graph.ontology_versions SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = p_reason, reviews = v_reviews WHERE version_id = p_version_id;
    INSERT INTO graph.ontology_events (event_id, scope, tenant_id, domain_id, version_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_version_id, 'ontology.rejected', p_actor, jsonb_build_object('reason', p_reason, 'reviews', v_reviews), p_correlation);
    RETURN jsonb_build_object('version_id', p_version_id, 'state', 'rejected');
  END IF;
  -- A breaking change is not approved while what it would strand is still asserted (the migration comes first).
  IF v.compatibility = 'breaking' THEN
    SELECT count(*) INTO v_impacted FROM graph.edges_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.state = 'asserted'
      AND (e.predicate IN (SELECT rp ->> 'predicate' FROM jsonb_array_elements(v.change -> 'removed' -> 'predicates') rp) OR e.predicate IN (SELECT nn ->> 'predicate' FROM jsonb_array_elements(v.change -> 'narrowed') nn));
    IF v_impacted > 0 THEN
      RAISE EXCEPTION 'proposal refused: a breaking change with % asserted edge(s) still on the predicates it removes or narrows; retract or re-derive them (the migration) before approval', v_impacted USING ERRCODE = '22023';
    END IF;
    IF (v_reviews ->> 'compatibility') IS DISTINCT FROM 'passed' OR (v_reviews ->> 'migration') NOT IN ('passed', 'not_required') THEN
      RAISE EXCEPTION 'proposal refused: a breaking change is approved only after its compatibility and migration reviews passed (reviews: %)', v_reviews USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT x.version_id INTO v_prior FROM graph.ontology_versions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.namespace = v.namespace AND x.state = 'active';
  IF v_prior IS NOT NULL THEN
    UPDATE graph.ontology_versions SET state = 'superseded', superseded_at = clock_timestamp() WHERE version_id = v_prior;
    INSERT INTO graph.ontology_events (event_id, scope, tenant_id, domain_id, version_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_prior, 'ontology.superseded', p_actor, jsonb_build_object('by', p_version_id), p_correlation);
  END IF;
  UPDATE graph.ontology_versions SET state = 'active', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = p_reason, activated_at = clock_timestamp(), reviews = v_reviews || jsonb_build_object('domain', coalesce(v_reviews ->> 'domain', 'passed'), 'governance', 'passed') WHERE version_id = p_version_id;
  INSERT INTO graph.ontology_events (event_id, scope, tenant_id, domain_id, version_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_version_id, 'ontology.approved', p_actor, jsonb_build_object('reason', p_reason, 'reviews', v_reviews), p_correlation),
         (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_version_id, 'ontology.activated', p_actor, jsonb_build_object('supersedes', v_prior), p_correlation);
  RETURN jsonb_build_object('version_id', p_version_id, 'state', 'active', 'supersedes', v_prior, 'version', v.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.decide_ontology_proposal(uuid,uuid,uuid,text,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.decide_ontology_proposal(uuid,uuid,uuid,text,text,jsonb,uuid,uuid) TO eye_commit;

-- The builder's port, FINAL for this file: §2's authority (the consumer beside the operator) AND §7's vocabulary check.
CREATE OR REPLACE FUNCTION graph.assert_edge(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_subject uuid, p_predicate text,
  p_object uuid, p_valid_from timestamptz, p_valid_to timestamptz,
  p_claim_object_id uuid, p_claim_version bigint, p_evidence_object_id uuid,
  p_evidence_digest text, p_method_id uuid, p_run_id uuid, p_mode text,
  p_confidence numeric, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_review text; v_now timestamptz := clock_timestamp(); r record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.edge.assert', 'graph.relationship.subscription.apply']);
  -- 0066 §7 (L4-I05): a domain with an ACTIVE ontology version admits only the predicates it declares (a domain without one keeps
  -- the pre-B9 behaviour: nothing is refused until a version is proposed and approved).
  IF EXISTS (SELECT 1 FROM graph.ontology_versions v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'active')
     AND NOT EXISTS (SELECT 1 FROM graph.ontology_versions v, jsonb_array_elements(v.predicates) pr
                      WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'active' AND pr ->> 'predicate' = p_predicate) THEN
    RAISE EXCEPTION 'edge rejected: predicate % is not in the domain''s active ontology version; propose it (graph.ontology.propose) before asserting it', p_predicate USING ERRCODE = '22023';
  END IF;
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_subject)
     OR NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_object) THEN
    RAISE EXCEPTION 'edge rejected: both ends must be resolved entities in this domain'
      USING ERRCODE = '23503';
  END IF;

  SELECT c.payload -> 'review' ->> 'state' INTO v_review
    FROM objects.canonical_objects c
   WHERE c.object_id = p_claim_object_id AND c.object_version = p_claim_version;
  IF v_review IN ('queued', 'rejected') THEN
    RAISE EXCEPTION 'edge rejected: the claim behind it is % for review; a claim a person has not decided is not promoted into the graph',
      v_review USING ERRCODE = '42501';
  END IF;

  INSERT INTO graph.edges_current (
    edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id,
    valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id,
    evidence_digest, method_id, run_id, mode, confidence, asserted_by, correlation_id
  ) VALUES (
    p_edge_id, 'DOMAIN', p_tenant, p_domain, p_subject, p_predicate, p_object,
    p_valid_from, p_valid_to, 'asserted', p_claim_object_id, p_claim_version,
    p_evidence_object_id, p_evidence_digest, p_method_id, p_run_id, p_mode,
    p_confidence, p_actor, p_correlation);
  INSERT INTO graph.edge_events (
    event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.asserted', p_actor,
    jsonb_build_object('predicate', p_predicate, 'subject', p_subject, 'object', p_object,
                       'valid_from', p_valid_from, 'valid_to', p_valid_to,
                       'mode', p_mode, 'claim_object_id', p_claim_object_id,
                       'claim_version', p_claim_version, 'review_state', v_review),
    p_correlation);

  -- Every still-asserted edge from an EARLIER version of the same claim is now
  -- obsolete. Each is superseded individually so each leaves its own event.
  FOR r IN SELECT e.edge_id FROM graph.edges_current e
            WHERE e.claim_object_id = p_claim_object_id
              AND e.claim_version < p_claim_version
              AND e.state = 'asserted'
            FOR UPDATE
  LOOP
    UPDATE graph.edges_current
       SET state = 'superseded', superseded_by = p_edge_id, superseded_at = v_now
     WHERE edge_id = r.edge_id;
    INSERT INTO graph.edge_events (
      event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id,
      details, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.edge_id, 'edge.superseded', p_actor,
      jsonb_build_object('superseded_by', p_edge_id, 'claim_object_id', p_claim_object_id,
                         'corrected_to_version', p_claim_version,
                         'reason', 'the claim this edge rests on was corrected'),
      p_correlation);
  END LOOP;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §8 ScenarioReviewed (interface L7-I05; AU-PRD-0027 harness clauses; V03-T-336/340, V04-T-032): the human review of a scenario — dissent, continuation, retirement, promotion to simulation.
-- ============================================================
-- A review is a governed human act on a scenario: CONTINUE (the next review is due per the cadence, or when named),
-- DISSENT (a position and its rationale, recorded on the scenario without changing it), RETIRE (the scenario leaves the
-- portfolio; its open branches close; its version history and decision links stay; a retired branch is refused by
-- simulation), PROMOTE_TO_SIMULATION (a branch marked as the simulation candidate). Each review is an event on the
-- scenario's own log and ScenarioReviewed is the write's event.
ALTER TABLE prediction.scenarios_current DROP CONSTRAINT scenarios_current_state_check;
ALTER TABLE prediction.scenarios_current ADD CONSTRAINT scenarios_current_state_check CHECK (state IN ('active', 'closed', 'retired'));
ALTER TABLE prediction.scenarios_current ADD COLUMN last_reviewed_at timestamptz;
ALTER TABLE prediction.scenarios_current ADD COLUMN next_review_due_at timestamptz;
ALTER TABLE prediction.scenarios_current ADD COLUMN reviews int NOT NULL DEFAULT 0;
ALTER TABLE prediction.scenarios_current ADD COLUMN retired_at timestamptz;
ALTER TABLE prediction.scenarios_current ADD COLUMN retirement_reason text;
ALTER TABLE prediction.branches_current ADD COLUMN simulation_candidate_at timestamptz;
ALTER TABLE prediction.scenario_events DROP CONSTRAINT scenario_events_event_check;
ALTER TABLE prediction.scenario_events ADD CONSTRAINT scenario_events_event_check CHECK (event IN (
  'scenario.declared', 'branch.added', 'branch.flipped', 'branch.closed', 'scenario.closed', 'scenario.attention', 'scenario.reviewed', 'scenario.retired'));

CREATE OR REPLACE FUNCTION prediction.review_scenario(p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_outcome text, p_note text, p_dissent jsonb, p_next_review_by timestamptz, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; b prediction.branches_current%ROWTYPE; v_next timestamptz; v_closed int := 0; v_ordinal int; v_cadence interval; v_links jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_outcome NOT IN ('continue', 'dissent', 'retire', 'promote_to_simulation') THEN RAISE EXCEPTION 'a review outcome is continue, dissent, retire or promote_to_simulation' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_note)), 0) < 8 THEN RAISE EXCEPTION 'a review states its note (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no scenario % in this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
  IF s.state = 'retired' THEN RAISE EXCEPTION 'scenario % is retired; a retired scenario is not reviewed again (declare a successor)', p_scenario_id USING ERRCODE = '22023'; END IF;
  IF p_outcome = 'dissent' AND (p_dissent IS NULL OR coalesce(length(btrim(p_dissent ->> 'position')), 0) < 4 OR coalesce(length(btrim(p_dissent ->> 'rationale')), 0) < 8) THEN
    RAISE EXCEPTION 'a dissent states its position and rationale' USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.scenario_id = p_scenario_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'branch % is not a branch of scenario %', p_branch_id, p_scenario_id USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_outcome = 'promote_to_simulation' THEN
    IF p_branch_id IS NULL THEN RAISE EXCEPTION 'promotion to simulation names the branch' USING ERRCODE = '22023'; END IF;
    IF b.state = 'closed' THEN RAISE EXCEPTION 'branch % is closed; a closed branch is not promoted to simulation', p_branch_id USING ERRCODE = '22023'; END IF;
    UPDATE prediction.branches_current SET simulation_candidate_at = clock_timestamp() WHERE branch_id = p_branch_id;
  END IF;
  -- The cadence names the next review: a named instant wins; otherwise the cadence's interval from now (weekly/monthly/quarterly/daily; other cadences leave it open).
  v_cadence := CASE lower(coalesce(s.review_cadence, '')) WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '7 days' WHEN 'monthly' THEN interval '1 month' WHEN 'quarterly' THEN interval '3 months' ELSE NULL END;
  v_next := coalesce(p_next_review_by, CASE WHEN v_cadence IS NULL THEN NULL ELSE clock_timestamp() + v_cadence END);
  v_ordinal := s.reviews + 1;
  IF p_outcome = 'retire' THEN
    -- Open branches close (a flipped branch keeps its state: the flip is history); the scenario leaves the portfolio.
    FOR b IN SELECT * FROM prediction.branches_current x WHERE x.scenario_id = p_scenario_id AND x.state = 'open' LOOP
      UPDATE prediction.branches_current SET state = 'closed' WHERE branch_id = b.branch_id;
      INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, b.branch_id, 'branch.closed', p_actor, jsonb_build_object('reason', 'the scenario was retired by review', 'review_ordinal', v_ordinal), p_correlation);
      v_closed := v_closed + 1;
    END LOOP;
    UPDATE prediction.scenarios_current SET state = 'retired', retired_at = clock_timestamp(), retirement_reason = p_note, last_reviewed_at = clock_timestamp(), next_review_due_at = NULL, reviews = v_ordinal WHERE scenario_id = p_scenario_id;
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.retired', p_actor, jsonb_build_object('reason', p_note, 'branches_closed', v_closed, 'review_ordinal', v_ordinal), p_correlation);
  ELSE
    UPDATE prediction.scenarios_current SET last_reviewed_at = clock_timestamp(), next_review_due_at = v_next, reviews = v_ordinal WHERE scenario_id = p_scenario_id;
  END IF;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'scenario.reviewed', p_actor,
          jsonb_build_object('outcome', p_outcome, 'note', p_note, 'dissent', p_dissent, 'review_ordinal', v_ordinal, 'next_review_due_at', v_next, 'overdue_before', s.next_review_due_at IS NOT NULL AND s.next_review_due_at < clock_timestamp()), p_correlation);
  v_links := jsonb_build_object(
    'forecast_id', s.forecast_id,
    'decision_objects', (SELECT coalesce(jsonb_agg(DISTINCT d.dependent_object_id), '[]'::jsonb) FROM graph.dependencies d WHERE d.depends_on_kind = 'strategy' AND d.depends_on_id = p_scenario_id AND d.state = 'active'),
    'dependents', (SELECT coalesce(jsonb_agg(jsonb_build_object('type', d.dependent_type, 'id', d.dependent_object_id)), '[]'::jsonb) FROM graph.dependencies d WHERE d.dependent_type = 'SCN' AND d.dependent_object_id = p_scenario_id AND d.state = 'active'),
    'simulation_runs', (SELECT coalesce(jsonb_agg(r.run_id), '[]'::jsonb) FROM simulation.runs_current r WHERE r.scenario_id = p_scenario_id));
  RETURN jsonb_build_object('scenario_id', p_scenario_id, 'outcome', p_outcome, 'review_ordinal', v_ordinal, 'state_after', CASE WHEN p_outcome = 'retire' THEN 'retired' ELSE s.state END,
                            'branch', CASE WHEN p_branch_id IS NULL THEN NULL ELSE jsonb_build_object('branch_id', p_branch_id, 'kind', b.kind, 'state_after', CASE WHEN p_outcome = 'retire' AND b.state = 'open' THEN 'closed' ELSE b.state END) END,
                            'next_review_due_at', CASE WHEN p_outcome = 'retire' THEN NULL ELSE v_next END, 'branches_closed', v_closed, 'cadence', s.review_cadence, 'links', v_links);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.review_scenario(uuid,uuid,uuid,uuid,text,text,jsonb,timestamptz,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.review_scenario(uuid,uuid,uuid,uuid,text,text,jsonb,timestamptz,uuid,uuid,uuid) TO eye_commit;

-- A retired scenario's branches do not enter simulation (the run port, 0037's body otherwise).
CREATE OR REPLACE FUNCTION simulation.open_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_twin_version int, p_run_kind text, p_control_run_id uuid, p_corrects uuid,
  p_scenario_id uuid, p_scenario_branch_id uuid, p_scenario_version int, p_scenario_branch_state text, p_shock boolean, p_shock_basis text, p_component text,
  p_model_ref text, p_implementation_digest text, p_environment_digest text, p_environment jsonb,
  p_stochastic_mode text, p_rng text, p_seed bigint, p_samples int, p_jitter jsonb,
  p_interventions jsonb, p_constraints jsonb, p_assumptions jsonb, p_inputs_digest text, p_validation_status text, p_controls jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v twin.twin_versions%ROWTYPE; v_state jsonb; v_digest text; c simulation.runs_current%ROWTYPE; v_pinned text; v_controls jsonb; v_synthetic boolean;
  v_unusable jsonb; v_unavailable jsonb; b prediction.branches_current%ROWTYPE; v_scn_version int; v_branch_state text; v_expected_basis text; v_flip uuid;
  v_flip_observed date;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM twin.twin_versions WHERE twin_id = p_twin_id AND version = p_twin_version AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND OR v.state <> 'admitted' THEN
    RAISE EXCEPTION 'run rejected: version % of twin % is not an admitted version in this domain', p_twin_version, p_twin_id USING ERRCODE = '23503';
  END IF;
  IF v.completeness <> 'complete' THEN
    RAISE EXCEPTION 'run rejected: twin version % is incomplete (missing %); a run cannot use inputs the twin does not hold', p_twin_version, v.missing_keys::text USING ERRCODE = '22023';
  END IF;
  IF v.observed_through IS NULL THEN
    RAISE EXCEPTION 'run rejected: twin version % has no world-time cut-off (observed_through); a run reads the twin under two cut-offs', p_twin_version USING ERRCODE = '22023';
  END IF;
  v_unusable := twin.unusable_inputs(p_twin_id, p_twin_version, p_component);
  IF jsonb_array_length(v_unusable) > 0 THEN
    RAISE EXCEPTION 'run rejected: inputs for component % are not usable: %', p_component, v_unusable::text USING ERRCODE = '22023';
  END IF;
  v_unavailable := twin.unavailable_inputs(p_twin_id, p_twin_version, p_component);
  IF jsonb_array_length(v_unavailable) > 0 THEN
    RAISE EXCEPTION 'run rejected: required inputs for component % are no longer available: %', p_component, v_unavailable::text USING ERRCODE = '22023';
  END IF;
  SELECT implementation_digest INTO v_pinned FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF v_pinned IS NULL THEN
    RAISE EXCEPTION 'run rejected: behaviour model % has no pinned implementation', p_model_ref USING ERRCODE = '22023';
  END IF;
  IF v_pinned <> p_implementation_digest THEN
    RAISE EXCEPTION 'run rejected: the implementation offered (%) is not the pinned implementation of % (%)', p_implementation_digest, p_model_ref, v_pinned USING ERRCODE = '22023';
  END IF;
  IF p_run_kind = 'control' AND (p_control_run_id IS NOT NULL OR p_interventions <> '[{"type": "none"}]'::jsonb) THEN
    RAISE EXCEPTION 'run rejected: a control run applies `none` and references no control' USING ERRCODE = '22023';
  END IF;
  IF p_scenario_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'run rejected: scenario % is not an authorized scenario in this domain', p_scenario_id USING ERRCODE = '23503';
    END IF;
    -- 0066 §8 (V04-T-032): a RETIRED scenario's branches do not enter simulation; its history stays for replay.
    IF EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.state = 'retired') THEN
      RAISE EXCEPTION 'run rejected: scenario % was retired by review; a retired branch is not simulated (declare a successor scenario)', p_scenario_id USING ERRCODE = '22023';
    END IF;
    SELECT * INTO b FROM prediction.branches_current WHERE branch_id = p_scenario_branch_id AND scenario_id = p_scenario_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'run rejected: branch % is not a branch of scenario %', p_scenario_branch_id, p_scenario_id USING ERRCODE = '22023';
    END IF;
    v_scn_version := prediction.scenario_version_as_of(p_scenario_id, v.known_at);
    IF v_scn_version IS NULL THEN
      RAISE EXCEPTION 'run rejected: scenario % was recorded after this version''s known_at (%); it was not known at record time', p_scenario_id, v.known_at USING ERRCODE = '22023';
    END IF;
    IF v_scn_version IS DISTINCT FROM p_scenario_version THEN
      RAISE EXCEPTION 'run rejected: scenario % stood at version % at this version''s known_at (%), not %', p_scenario_id, v_scn_version, v.known_at, p_scenario_version USING ERRCODE = '22023';
    END IF;
    /* BOTH CLOCKS: written by this run's record cut-off, and observed within its world. */
    v_branch_state := prediction.branch_state_as_of(p_scenario_branch_id, v.known_at, v.observed_through);
    v_flip_observed := prediction.branch_flip_observed_at(p_scenario_branch_id);
    IF v_branch_state IS DISTINCT FROM p_scenario_branch_state THEN
      RAISE EXCEPTION 'run rejected: branch % was % under this run''s cut-offs (known_at %, observations through %; the flip was recorded % and observed %), not %',
        p_scenario_branch_id, v_branch_state, v.known_at, v.observed_through, b.flipped_at, v_flip_observed, p_scenario_branch_state USING ERRCODE = '22023';
    END IF;
    IF p_shock <> (v_branch_state = 'flipped') THEN
      RAISE EXCEPTION 'run rejected: the shock contradicts the bound branch: branch % was % under this run''s cut-offs (a shock without a flipped branch is a hypothetical and names no scenario)', p_scenario_branch_id, v_branch_state USING ERRCODE = '22023';
    END IF;
    v_flip := CASE WHEN v_branch_state = 'flipped' THEN b.flip_event_id ELSE NULL END;
    v_expected_basis := CASE WHEN p_shock THEN 'scenario-branch-flipped' ELSE 'none' END;
  ELSE
    IF p_scenario_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'run rejected: a scenario branch was named without its scenario' USING ERRCODE = '22023';
    END IF;
    v_expected_basis := CASE WHEN p_shock THEN 'hypothetical' ELSE 'none' END;
  END IF;
  IF p_shock_basis IS DISTINCT FROM v_expected_basis THEN
    RAISE EXCEPTION 'run rejected: the shock basis offered (%) is not what the binding establishes (%)', p_shock_basis, v_expected_basis USING ERRCODE = '22023';
  END IF;
  v_controls := coalesce(p_controls, v.controls);
  IF simulation.classification_rank(v_controls ->> 'classification') < simulation.classification_rank(v.controls ->> 'classification')
     OR (coalesce((v.controls ->> 'synthetic_state')::boolean, false) AND NOT coalesce((v_controls ->> 'synthetic_state')::boolean, false)) THEN
    RAISE EXCEPTION 'run rejected: the controls offered are less restricted than the twin version''s' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value, 'unit', e.unit,
                                               'material', e.material, 'citations', e.citations, 'health', e.health, 'valid_from', e.valid_from,
                                               'valid_to', e.valid_to, 'confidence', e.confidence, 'synthetic_state', e.synthetic_state, 'controls', e.controls,
                                               'inherited_validation', e.inherited_validation)
                            ORDER BY e.key), '[]'::jsonb)
    INTO v_state FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_twin_version;
  v_digest := encode(sha256(convert_to(v_state::text, 'UTF8')), 'hex');
  IF p_run_kind = 'intervention' THEN
    SELECT * INTO c FROM simulation.runs_current WHERE run_id = p_control_run_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected: control run % is not an authorized run in this domain', p_control_run_id USING ERRCODE = '23503'; END IF;
    IF c.run_kind <> 'control' THEN RAISE EXCEPTION 'run rejected: % is not a control run', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.state <> 'completed' THEN RAISE EXCEPTION 'run rejected: control run % is not completed', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.twin_id <> p_twin_id OR c.twin_version <> p_twin_version OR c.initial_state_digest <> v_digest OR c.implementation_digest <> p_implementation_digest
       OR c.assumptions <> p_assumptions OR c.constraints <> p_constraints OR c.shock <> p_shock OR c.component <> p_component
       OR c.scenario_id IS DISTINCT FROM p_scenario_id OR c.scenario_branch_id IS DISTINCT FROM p_scenario_branch_id
       OR c.scenario_version IS DISTINCT FROM p_scenario_version OR c.shock_basis <> p_shock_basis THEN
      RAISE EXCEPTION 'run rejected: control run % is not compatible (it must share the twin version, initial state, implementation, assumptions, constraints, scenario binding, shock and component)', p_control_run_id
        USING ERRCODE = '22023';
    END IF;
  END IF;
  v_synthetic := coalesce((v_controls ->> 'synthetic_state')::boolean, v.synthetic_state);
  INSERT INTO simulation.runs_current (
    run_id, scope, tenant_id, domain_id, twin_id, twin_version, branch_id, run_kind, control_run_id, corrects_run_id,
    scenario_id, scenario_branch_id, scenario_version, scenario_branch_state, scenario_flip_event, shock, shock_basis, component,
    known_at, observed_through, initial_state, initial_state_digest, model_ref, implementation_digest, environment_digest, environment,
    stochastic_mode, rng, seed, samples, jitter, interventions, constraints, assumptions, inputs_digest, validation_status, state, controls,
    operator_principal_id, correlation_id
  ) VALUES (
    p_run_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_twin_version, v.branch_id, p_run_kind, p_control_run_id, p_corrects,
    p_scenario_id, p_scenario_branch_id, p_scenario_version, p_scenario_branch_state, v_flip, p_shock, p_shock_basis, p_component,
    v.known_at, v.observed_through, v_state, v_digest, p_model_ref, p_implementation_digest, p_environment_digest, p_environment,
    p_stochastic_mode, p_rng, p_seed, p_samples, p_jitter, p_interventions, p_constraints, p_assumptions, p_inputs_digest,
    p_validation_status || CASE WHEN v.verification_state = 'unverified' THEN '; twin version UNVERIFIED (a cited input was corrected)' ELSE '' END,
    'opened', v_controls, p_actor, p_correlation);
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.opened', p_actor,
          jsonb_build_object('twin_id', p_twin_id, 'twin_version', p_twin_version, 'run_kind', p_run_kind, 'control_run_id', p_control_run_id,
                             'initial_state_digest', v_digest, 'inputs_digest', p_inputs_digest, 'stochastic_mode', p_stochastic_mode,
                             'scenario_id', p_scenario_id, 'scenario_version', p_scenario_version, 'scenario_branch_id', p_scenario_branch_id,
                             'scenario_branch_state', p_scenario_branch_state, 'shock_basis', p_shock_basis,
                             'flip_recorded_at', b.flipped_at, 'flip_observed_at', v_flip_observed), p_correlation);
  RETURN jsonb_build_object('initial_state', v_state, 'initial_state_digest', v_digest, 'known_at', v.known_at, 'observed_through', v.observed_through,
                            'branch_id', v.branch_id, 'synthetic_state', v_synthetic, 'controls', v_controls, 'verification_state', v.verification_state,
                            'scenario_flip_event', v_flip, 'flip_observed_at', v_flip_observed);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §9 ExecutiveActionRequested (interface L10-I04; AU-EXO-0051; V03 executive state "notification, suppression, delegation and acknowledgement history", control "suppression and delegation remain visible"; V8 "suppress under policy").
-- ============================================================
-- A typed request is a person's command with an exactly-once institutional effect: the requester's `request_key` is the
-- idempotency boundary (the same key with the same request digest returns the recorded request; the same key with a
-- different request is refused), the request is a durable row on its own log, and it is ROUTED to the responsible
-- capability — `analysis` to an agent run under the agent's own session (trigger kind `request`), `scenario` to the
-- forecast owner's declaration, `simulation` to the twin owner's run, `decision` to the decision owner's package — or takes
-- its effect in the same write: a `delegation` (a member's room standing lent to another principal for a bounded time —
-- membership-level: the delegate reviews the room within the window if the policy admits them to the act; the policy is
-- not changed by a delegation), a `suppression` (a raised warning kept raised and visibly suppressed until an instant),
-- a `follow_up` (an owned, dated item on the package's agenda). Stale context is refused: a subject version that is not
-- the current one, a decision request on a package already committed, a suppression of a warning that is not open.
ALTER TABLE executive.agent_runs DROP CONSTRAINT agent_runs_trigger_kind_check;
ALTER TABLE executive.agent_runs ADD CONSTRAINT agent_runs_trigger_kind_check CHECK (trigger_kind IN ('operator', 'scheduler', 'request'));

CREATE TABLE executive.requests (
  request_id             uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  kind                   text NOT NULL CHECK (kind IN ('analysis', 'scenario', 'simulation', 'decision', 'delegation', 'suppression', 'follow_up')),
  request_key            text NOT NULL CHECK (length(btrim(request_key)) BETWEEN 1 AND 200),
  request_digest         text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  subject                jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(subject) = 'object'),
  instruction            text NOT NULL CHECK (length(btrim(instruction)) BETWEEN 4 AND 4096),
  delegate_principal_id  uuid,
  owner_principal_id     uuid,
  due_at                 timestamptz,
  until_at               timestamptz,
  requester_principal_id uuid NOT NULL,
  routed_to              text NOT NULL,
  routed_ref             uuid,
  state                  text NOT NULL DEFAULT 'routed' CHECK (state IN ('routed', 'fulfilled', 'refused', 'withdrawn')),
  refusal                text,
  requested_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  fulfilled_at           timestamptz,
  fulfilled_by           uuid,
  withdrawn_at           timestamptz,
  correlation_id         uuid NOT NULL,
  CONSTRAINT xrq_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xrq_key_once UNIQUE (tenant_id, domain_id, requester_principal_id, request_key)
);
CREATE INDEX xrq_domain ON executive.requests (tenant_id, domain_id, requested_at);
COMMENT ON TABLE executive.requests IS 'L10-I04 ExecutiveActionRequested (0066 §9): a person''s typed request, idempotent on (requester, request_key) with the request digest, routed to the responsible capability or effected in the write (delegation, suppression, follow-up).';

CREATE TABLE executive.request_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  request_id         uuid NOT NULL REFERENCES executive.requests(request_id),
  event              text NOT NULL CHECK (event IN ('request.opened', 'request.repeated', 'request.fulfilled', 'request.withdrawn', 'request.refused', 'follow_up.completed')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT xre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xre_request ON executive.request_events (request_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.request_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.delegations (
  delegation_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  request_id        uuid NOT NULL REFERENCES executive.requests(request_id),
  room_id           uuid NOT NULL REFERENCES executive.rooms_current(room_id),
  action            text NOT NULL,
  from_principal_id uuid NOT NULL,
  to_principal_id   uuid NOT NULL,
  from_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  until_at          timestamptz NOT NULL,
  state             text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'revoked')),
  revoked_at        timestamptz,
  correlation_id    uuid NOT NULL,
  CONSTRAINT xdl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xdl_window CHECK (until_at > from_at),
  CONSTRAINT xdl_not_self CHECK (to_principal_id <> from_principal_id)
);
CREATE INDEX xdl_room ON executive.delegations (room_id, to_principal_id, state);
COMMENT ON TABLE executive.delegations IS 'A member''s room standing lent to another principal for a bounded window (0066 §9): visible on the room; honoured by the room''s membership test; the policy decides the act itself — a delegate without a qualifying role is refused by the policy as before.';

CREATE TABLE executive.follow_ups (
  follow_up_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  request_id         uuid NOT NULL REFERENCES executive.requests(request_id),
  package_id         uuid REFERENCES decision.packages_current(package_id),
  room_id            uuid REFERENCES executive.rooms_current(room_id),
  instruction        text NOT NULL,
  owner_principal_id uuid NOT NULL,
  due_at             timestamptz NOT NULL,
  state              text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'done', 'withdrawn')),
  done_at            timestamptz,
  done_by            uuid,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xfu_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xfu_package ON executive.follow_ups (package_id, state, due_at);

CREATE TABLE prediction.warning_suppressions (
  suppression_id  uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  request_id      uuid NOT NULL REFERENCES executive.requests(request_id),
  warning_id      uuid NOT NULL REFERENCES prediction.warnings_current(warning_id),
  until_at        timestamptz NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  by_principal_id uuid NOT NULL,
  state           text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'lifted')),
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  lifted_at       timestamptz,
  correlation_id  uuid NOT NULL,
  CONSTRAINT wsp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX wsp_warning ON prediction.warning_suppressions (warning_id, state, until_at);
COMMENT ON TABLE prediction.warning_suppressions IS 'A warning suppressed under policy (0066 §9; V8): the warning''s own state is untouched — it stays raised; the list and the briefing mark it suppressed until the instant; visible, reversible, expiring.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['requests', 'request_events', 'delegations', 'follow_ups'] LOOP
    EXECUTE format('ALTER TABLE executive.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE executive.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY executive_isolation ON executive.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON executive.%I TO eye_app, eye_commit', t);
  END LOOP;
  ALTER TABLE prediction.warning_suppressions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE prediction.warning_suppressions FORCE ROW LEVEL SECURITY;
  CREATE POLICY prediction_isolation ON prediction.warning_suppressions USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
  GRANT SELECT ON prediction.warning_suppressions TO eye_app, eye_commit;
END $$;

CREATE OR REPLACE FUNCTION executive.request_event(p_request_id uuid, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
SET search_path = executive, pg_catalog, pg_temp AS $$
  INSERT INTO executive.request_events (event_id, scope, tenant_id, domain_id, request_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_request_id, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.request_event(uuid,uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC;

-- The room's membership test honours a live delegation: the delegate stands as a member of THAT room within the window.
CREATE OR REPLACE FUNCTION executive.is_member(p_room uuid, p_principal uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM executive.rooms_current r WHERE r.room_id = p_room AND r.owner_principal_id = p_principal)
      OR EXISTS (SELECT 1 FROM executive.room_members m WHERE m.room_id = p_room AND m.principal_id = p_principal AND m.removed_at IS NULL)
      OR EXISTS (SELECT 1 FROM executive.delegations d WHERE d.room_id = p_room AND d.to_principal_id = p_principal AND d.state = 'active' AND d.from_at <= now() AND d.until_at > now());
$$ LANGUAGE sql;

-- Open a request: idempotent on (requester, key) under the request digest; the subject's version checked against the
-- record; routed, or effected in the write for delegation, suppression and follow-up.
CREATE OR REPLACE FUNCTION executive.open_request(p_request_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_request_key text, p_request_digest text, p_subject jsonb, p_instruction text, p_delegate uuid, p_owner uuid, p_due_at timestamptz, p_until timestamptz, p_requester uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, objects, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.requests%ROWTYPE; v_type text; v_id uuid; v_version int; v_current int; v_routed_to text; v_ref uuid; v_state text := 'routed'; v_pkg decision.packages_current%ROWTYPE; v_room executive.rooms_current%ROWTYPE; v_wrn prediction.warnings_current%ROWTYPE; v_effect jsonb := '{}'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_requester IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'request rejected: recorded by the requesting principal' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('analysis', 'scenario', 'simulation', 'decision', 'delegation', 'suppression', 'follow_up') THEN RAISE EXCEPTION 'request rejected: the kind is analysis, scenario, simulation, decision, delegation, suppression or follow_up' USING ERRCODE = '22023'; END IF;
  -- Exactly once: the same key with the same request returns the request already recorded; a different request under the key is refused.
  SELECT * INTO r FROM executive.requests x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.requester_principal_id = p_requester AND x.request_key = p_request_key FOR UPDATE;
  IF FOUND THEN
    IF r.request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'request rejected: request key % was already used by this requester for a different request (digest % recorded, % offered); a new request takes a new key', p_request_key, left(r.request_digest, 12), left(p_request_digest, 12) USING ERRCODE = '22023';
    END IF;
    PERFORM executive.request_event(r.request_id, p_tenant, p_domain, 'request.repeated', p_requester, jsonb_build_object('offered_request_id', p_request_id), p_correlation);
    RETURN jsonb_build_object('request_id', r.request_id, 'repeated', true, 'kind', r.kind, 'state', r.state, 'routed_to', r.routed_to, 'routed_ref', r.routed_ref, 'requested_at', r.requested_at, 'effect', '{}'::jsonb);
  END IF;
  v_type := p_subject ->> 'object_type'; v_id := (p_subject ->> 'object_id')::uuid; v_version := (p_subject ->> 'version')::int;
  -- Stale context: a subject that names a version is checked against the record's current version.
  IF v_id IS NOT NULL AND v_version IS NOT NULL THEN
    SELECT max(o.object_version)::int INTO v_current FROM objects.canonical_objects o WHERE o.object_id = v_id AND o.tenant_id = p_tenant;
    IF v_current IS NULL THEN RAISE EXCEPTION 'request rejected (stale_context): subject % is not a recorded object of this tenant', v_id USING ERRCODE = '22023'; END IF;
    IF v_current <> v_version THEN RAISE EXCEPTION 'request rejected (stale_version): subject %:% stands at version %, the request names version %', v_type, v_id, v_current, v_version USING ERRCODE = '22023'; END IF;
  END IF;
  -- The request row first (the effects reference it), routed; an in-write effect then marks it fulfilled.
  v_routed_to := CASE p_kind WHEN 'analysis' THEN 'agent.run:' || coalesce(p_subject ->> 'task', 'briefing') WHEN 'scenario' THEN 'prediction.scenario.declare' WHEN 'simulation' THEN 'simulation.run'
                             WHEN 'decision' THEN 'decision.package.declare' WHEN 'delegation' THEN 'executive.delegation' WHEN 'suppression' THEN 'prediction.warning.suppress' ELSE 'executive.follow_up' END;
  INSERT INTO executive.requests (request_id, scope, tenant_id, domain_id, kind, request_key, request_digest, subject, instruction, delegate_principal_id, owner_principal_id, due_at, until_at, requester_principal_id, routed_to, state, correlation_id)
  VALUES (p_request_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_request_key, p_request_digest, coalesce(p_subject, '{}'::jsonb), p_instruction, p_delegate, p_owner, p_due_at, p_until, p_requester, v_routed_to, 'routed', p_correlation);
  CASE p_kind
    WHEN 'analysis' THEN NULL;
    WHEN 'scenario' THEN NULL;
    WHEN 'simulation' THEN NULL;
    WHEN 'decision' THEN
      IF v_type = 'DPK' AND v_id IS NOT NULL THEN
        SELECT * INTO v_pkg FROM decision.packages_current p WHERE p.package_id = v_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain;
        IF NOT FOUND THEN RAISE EXCEPTION 'request rejected (stale_context): package % is not a package of this domain', v_id USING ERRCODE = '22023'; END IF;
        IF v_pkg.state IN ('committed', 'monitoring', 'closed', 'rejected', 'withdrawn') THEN
          RAISE EXCEPTION 'request rejected (stale_approval): package % is already % — a decision request opens or reviews a package still deciding', v_id, v_pkg.state USING ERRCODE = '22023';
        END IF;
        v_routed_to := 'decision.package.review';
      END IF;
    WHEN 'delegation' THEN
      IF p_delegate IS NULL THEN RAISE EXCEPTION 'request rejected: a delegation names the delegate' USING ERRCODE = '22023'; END IF;
      IF p_delegate = p_requester THEN RAISE EXCEPTION 'request rejected: a delegation is to another principal' USING ERRCODE = '22023'; END IF;
      IF p_until IS NULL OR p_until <= clock_timestamp() THEN RAISE EXCEPTION 'request rejected: a delegation names the instant it ends, in the future' USING ERRCODE = '22023'; END IF;
      IF v_type IS DISTINCT FROM 'DRM' OR v_id IS NULL THEN RAISE EXCEPTION 'request rejected: a delegation names the room (subject object_type DRM)' USING ERRCODE = '22023'; END IF;
      SELECT * INTO v_room FROM executive.rooms_current x WHERE x.room_id = v_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND THEN RAISE EXCEPTION 'request rejected (stale_context): room % is not a room of this domain', v_id USING ERRCODE = '23503'; END IF;
      IF NOT (EXISTS (SELECT 1 FROM executive.rooms_current x WHERE x.room_id = v_id AND x.owner_principal_id = p_requester)
              OR EXISTS (SELECT 1 FROM executive.room_members m WHERE m.room_id = v_id AND m.principal_id = p_requester AND m.removed_at IS NULL)) THEN
        RAISE EXCEPTION 'request rejected (stale_authority): only a member of room % lends their standing in it', v_id USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_delegate AND p.tenant_id = p_tenant AND p.status = 'active') THEN
        RAISE EXCEPTION 'request rejected: delegate % is not an active principal of this tenant', p_delegate USING ERRCODE = '23503';
      END IF;
      v_ref := gen_random_uuid();
      INSERT INTO executive.delegations (delegation_id, scope, tenant_id, domain_id, request_id, room_id, action, from_principal_id, to_principal_id, until_at, correlation_id)
      VALUES (v_ref, 'DOMAIN', p_tenant, p_domain, p_request_id, v_id, coalesce(p_subject ->> 'action', 'decision.review'), p_requester, p_delegate, p_until, p_correlation);
      v_state := 'fulfilled';
      v_effect := jsonb_build_object('delegation_id', v_ref, 'room_id', v_id, 'to', p_delegate, 'until', p_until, 'note', 'membership-level: the delegate stands as a member of the room within the window; the policy decides the act');
    WHEN 'suppression' THEN
      IF v_type IS DISTINCT FROM 'WRN' OR v_id IS NULL THEN RAISE EXCEPTION 'request rejected: a suppression names the warning (subject object_type WRN)' USING ERRCODE = '22023'; END IF;
      IF p_until IS NULL OR p_until <= clock_timestamp() THEN RAISE EXCEPTION 'request rejected: a suppression names the instant it ends, in the future' USING ERRCODE = '22023'; END IF;
      SELECT * INTO v_wrn FROM prediction.warnings_current w WHERE w.warning_id = v_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'request rejected (stale_context): warning % is not a warning of this domain', v_id USING ERRCODE = '23503'; END IF;
      IF v_wrn.state NOT IN ('raised', 'acknowledged') THEN RAISE EXCEPTION 'request rejected (stale_context): warning % is %, not open', v_id, v_wrn.state USING ERRCODE = '22023'; END IF;
      IF EXISTS (SELECT 1 FROM prediction.warning_suppressions s WHERE s.warning_id = v_id AND s.state = 'active' AND s.until_at > clock_timestamp()) THEN
        RAISE EXCEPTION 'request rejected: warning % is already suppressed; lift or let the suppression expire first', v_id USING ERRCODE = '22023';
      END IF;
      v_ref := gen_random_uuid();
      INSERT INTO prediction.warning_suppressions (suppression_id, scope, tenant_id, domain_id, request_id, warning_id, until_at, reason, by_principal_id, correlation_id)
      VALUES (v_ref, 'DOMAIN', p_tenant, p_domain, p_request_id, v_id, p_until, p_instruction, p_requester, p_correlation);
      v_state := 'fulfilled';
      v_effect := jsonb_build_object('suppression_id', v_ref, 'warning_id', v_id, 'until', p_until, 'warning_state', v_wrn.state, 'note', 'the warning stays ' || v_wrn.state || '; the list and the briefing mark it suppressed until the instant');
    WHEN 'follow_up' THEN
      IF p_due_at IS NULL THEN RAISE EXCEPTION 'request rejected: a follow-up names when it is due' USING ERRCODE = '22023'; END IF;
      IF v_type = 'DPK' AND v_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decision.packages_current p WHERE p.package_id = v_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain) THEN
        RAISE EXCEPTION 'request rejected (stale_context): package % is not a package of this domain', v_id USING ERRCODE = '23503';
      END IF;
      IF v_type = 'DRM' AND v_id IS NOT NULL THEN
        SELECT * INTO v_room FROM executive.rooms_current x WHERE x.room_id = v_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
        IF NOT FOUND THEN RAISE EXCEPTION 'request rejected (stale_context): room % is not a room of this domain', v_id USING ERRCODE = '23503'; END IF;
      END IF;
      v_ref := gen_random_uuid();
      INSERT INTO executive.follow_ups (follow_up_id, scope, tenant_id, domain_id, request_id, package_id, room_id, instruction, owner_principal_id, due_at, correlation_id)
      VALUES (v_ref, 'DOMAIN', p_tenant, p_domain, p_request_id, CASE WHEN v_type = 'DPK' THEN v_id WHEN v_type = 'DRM' THEN v_room.package_id ELSE NULL END, CASE WHEN v_type = 'DRM' THEN v_id ELSE NULL END, p_instruction, coalesce(p_owner, p_requester), p_due_at, p_correlation);
      v_state := 'fulfilled';
      v_effect := jsonb_build_object('follow_up_id', v_ref, 'owner', coalesce(p_owner, p_requester), 'due_at', p_due_at);
  END CASE;
  IF v_state = 'fulfilled' THEN
    UPDATE executive.requests SET state = 'fulfilled', routed_ref = v_ref, fulfilled_at = clock_timestamp(), fulfilled_by = p_requester WHERE request_id = p_request_id;
  ELSIF v_routed_to <> (SELECT routed_to FROM executive.requests WHERE request_id = p_request_id) THEN
    UPDATE executive.requests SET routed_to = v_routed_to WHERE request_id = p_request_id;
  END IF;
  PERFORM executive.request_event(p_request_id, p_tenant, p_domain, 'request.opened', p_requester, jsonb_build_object('kind', p_kind, 'routed_to', v_routed_to, 'routed_ref', v_ref, 'state', v_state, 'request_key', p_request_key), p_correlation);
  IF v_state = 'fulfilled' THEN
    PERFORM executive.request_event(p_request_id, p_tenant, p_domain, 'request.fulfilled', p_requester, jsonb_build_object('routed_ref', v_ref, 'in_write', true), p_correlation);
  END IF;
  RETURN jsonb_build_object('request_id', p_request_id, 'repeated', false, 'kind', p_kind, 'state', v_state, 'routed_to', v_routed_to, 'routed_ref', v_ref, 'requested_at', clock_timestamp(), 'effect', v_effect);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_request(uuid,uuid,uuid,text,text,text,jsonb,text,uuid,uuid,timestamptz,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_request(uuid,uuid,uuid,text,text,text,jsonb,text,uuid,uuid,timestamptz,timestamptz,uuid,uuid) TO eye_commit;

-- Fulfil a routed request: the act that answered it (the run, the scenario, the simulation run, the package) names the request; recorded by the requester or the responsible owner's own governed act.
CREATE OR REPLACE FUNCTION executive.fulfil_request(p_request_id uuid, p_tenant uuid, p_domain uuid, p_routed_ref uuid, p_note text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.requests%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.request.fulfil', 'executive.request', 'prediction.scenario.declare', 'simulation.run', 'decision.package.declare', 'decision.package.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'fulfilment rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM executive.requests x WHERE x.request_id = p_request_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fulfilment rejected: no request % in this domain', p_request_id USING ERRCODE = '23503'; END IF;
  IF r.state <> 'routed' THEN RAISE EXCEPTION 'fulfilment rejected: request % is %, not routed', p_request_id, r.state USING ERRCODE = '22023'; END IF;
  IF p_routed_ref IS NULL THEN RAISE EXCEPTION 'fulfilment rejected: the act that answered the request is named' USING ERRCODE = '22023'; END IF;
  UPDATE executive.requests SET state = 'fulfilled', routed_ref = p_routed_ref, fulfilled_at = clock_timestamp(), fulfilled_by = p_actor WHERE request_id = p_request_id;
  PERFORM executive.request_event(p_request_id, p_tenant, p_domain, 'request.fulfilled', p_actor, jsonb_build_object('routed_ref', p_routed_ref, 'note', p_note), p_correlation);
  RETURN jsonb_build_object('request_id', p_request_id, 'kind', r.kind, 'state', 'fulfilled', 'routed_to', r.routed_to, 'routed_ref', p_routed_ref);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.fulfil_request(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.fulfil_request(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- Withdraw a request: the requester's; a routed request is withdrawn, an in-write effect is reversed (the delegation revoked, the suppression lifted, the follow-up withdrawn); an act already done stands.
CREATE OR REPLACE FUNCTION executive.withdraw_request(p_request_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = executive, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.requests%ROWTYPE; v_reversed text := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.request.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'withdrawal rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 4 THEN RAISE EXCEPTION 'withdrawal rejected: a reason is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM executive.requests x WHERE x.request_id = p_request_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal rejected: no request % in this domain', p_request_id USING ERRCODE = '23503'; END IF;
  IF r.requester_principal_id <> p_actor THEN RAISE EXCEPTION 'withdrawal rejected: a request is withdrawn by its requester' USING ERRCODE = '42501'; END IF;
  IF r.state IN ('withdrawn', 'refused') THEN RAISE EXCEPTION 'withdrawal rejected: request % is already %', p_request_id, r.state USING ERRCODE = '22023'; END IF;
  IF r.state = 'fulfilled' AND r.kind IN ('analysis', 'scenario', 'simulation', 'decision') THEN
    RAISE EXCEPTION 'withdrawal rejected: request % was fulfilled by % — the act stands; withdraw its result through its own governed act', p_request_id, r.routed_ref USING ERRCODE = '22023';
  END IF;
  IF r.kind = 'follow_up' AND EXISTS (SELECT 1 FROM executive.follow_ups f WHERE f.request_id = p_request_id AND f.state = 'done') THEN
    RAISE EXCEPTION 'withdrawal rejected: the follow-up of request % was completed — the act stands', p_request_id USING ERRCODE = '22023';
  END IF;
  IF r.kind = 'delegation' THEN UPDATE executive.delegations SET state = 'revoked', revoked_at = clock_timestamp() WHERE request_id = p_request_id AND state = 'active'; v_reversed := 'delegation revoked';
  ELSIF r.kind = 'suppression' THEN UPDATE prediction.warning_suppressions SET state = 'lifted', lifted_at = clock_timestamp() WHERE request_id = p_request_id AND state = 'active'; v_reversed := 'suppression lifted';
  ELSIF r.kind = 'follow_up' THEN UPDATE executive.follow_ups SET state = 'withdrawn' WHERE request_id = p_request_id AND state = 'open'; v_reversed := 'follow-up withdrawn';
  END IF;
  UPDATE executive.requests SET state = 'withdrawn', withdrawn_at = clock_timestamp(), refusal = p_reason WHERE request_id = p_request_id;
  PERFORM executive.request_event(p_request_id, p_tenant, p_domain, 'request.withdrawn', p_actor, jsonb_build_object('reason', p_reason, 'reversed', v_reversed), p_correlation);
  RETURN jsonb_build_object('request_id', p_request_id, 'kind', r.kind, 'state', 'withdrawn', 'reversed', v_reversed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.withdraw_request(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.withdraw_request(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- A follow-up is completed by its owner (or the requester) with a note; overdue is a reading (due_at passed while open), never a state written by a clock.
CREATE OR REPLACE FUNCTION executive.complete_follow_up(p_follow_up_id uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f executive.follow_ups%ROWTYPE; r executive.requests%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.follow_up.complete']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'completion rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_note)), 0) < 4 THEN RAISE EXCEPTION 'completion rejected: a note says what was done' USING ERRCODE = '22023'; END IF;
  SELECT * INTO f FROM executive.follow_ups x WHERE x.follow_up_id = p_follow_up_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'completion rejected: no follow-up % in this domain', p_follow_up_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO r FROM executive.requests x WHERE x.request_id = f.request_id;
  IF p_actor <> f.owner_principal_id AND p_actor <> r.requester_principal_id THEN RAISE EXCEPTION 'completion rejected: a follow-up is completed by its owner or its requester' USING ERRCODE = '42501'; END IF;
  IF f.state <> 'open' THEN RAISE EXCEPTION 'completion rejected: follow-up % is %', p_follow_up_id, f.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.follow_ups SET state = 'done', done_at = clock_timestamp(), done_by = p_actor, note = p_note WHERE follow_up_id = p_follow_up_id;
  PERFORM executive.request_event(f.request_id, p_tenant, p_domain, 'follow_up.completed', p_actor, jsonb_build_object('follow_up_id', p_follow_up_id, 'note', p_note, 'was_overdue', f.due_at < clock_timestamp()), p_correlation);
  RETURN jsonb_build_object('follow_up_id', p_follow_up_id, 'state', 'done', 'was_overdue', f.due_at < clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.complete_follow_up(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.complete_follow_up(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §10 The interface register: the six interfaces this migration binds, each to the surface that publishes it (AU-DP-0071 / V04-T-005); the binding's head recorded.
-- ============================================================
ALTER TABLE objects.interface_register ADD COLUMN bound_at timestamptz;
ALTER TABLE objects.interface_register ADD COLUMN bound_in text;
COMMENT ON COLUMN objects.interface_register.bound_in IS 'The migration that bound the interface (0066 for the six of CP-6 B9); NULL for the bindings recorded with the register itself (0065).';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0066',
  bound_to = 'ContradictionDetected@v1 from the extraction admission and the review correction that produced a contradicting assertion (intelligence.record_contradiction; intelligence.contradictions; the newer claim queued for review with reason contradiction, header contradiction_refs); adjudicated through POST …/intelligence/contradictions/:id/adjudicate; a challenge through POST …/intelligence/review/request'
  WHERE interface_id = 'L2-I03';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0066',
  bound_to = 'TransformationEvaluated@v1 from POST …/intelligence/methods/:methodId/evaluate (intelligence.method.evaluate → intelligence.evaluate_method; measures from the gateway calls, runs, review yield, contradictions and confidence over the window; fitness recorded on methods_current, an unfit version admits no claims and is not activated)'
  WHERE interface_id = 'L2-I05';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0066',
  bound_to = 'RetentionActionDue@v1 from POST …/retention/actions/open and POST …/retention/schedules/evaluate (retention.open_action / retention.evaluate_schedules; the action a durable workflow: scope resolved with holds honoured, approved by the retention authority on the scope digest, executed by the steward through the tombstone and outbox-floor ports, verified with the residual inventory)'
  WHERE interface_id = 'L3-I04';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0066',
  bound_to = 'DeletionVerified@v1 from POST …/retention/actions/:id/verify (retention.verify_action: each scope item checked against the observed bytes, verified or verified_with_residuals with the residual inventory; the approval, execution evidence and residual references cited)'
  WHERE interface_id = 'L3-I05';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0066',
  bound_to = 'OntologyChangeProposed@v1 from POST …/graph/ontology/propose (graph.ontology.propose → graph.propose_ontology_version: the diff against the active version, the compatibility analysis over asserted edges and strategy, the four reviews opened); decided by the steward through POST …/graph/ontology/:versionId/decide; the active version honoured by graph.assert_edge'
  WHERE interface_id = 'L4-I05';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0066',
  bound_to = 'ScenarioReviewed@v1 from POST …/prediction/scenarios/:id/review (prediction.scenario.review, human-gated → prediction.review_scenario: continue, dissent, retire, promote_to_simulation; the scenario''s links named; a retired scenario refused by simulation.open_run)'
  WHERE interface_id = 'L7-I05';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0066',
  bound_to = 'POST …/executive/requests (executive.request, human-gated; request_key + request digest idempotency → executive.open_request → executive.requests; analysis routed to an agent run with trigger kind request, scenario/simulation/decision to the owners'' acts which fulfil the request, delegation to executive.delegations (membership-level), suppression to prediction.warning_suppressions, follow-up to executive.follow_ups; outbox event ExecutiveActionRequested@v1)'
  WHERE interface_id = 'L10-I04';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (26, 24, 0) THEN
    RAISE EXCEPTION 'interface register after 0066: expected 26 bound, 24 partial, 0 unbound; found %, %, %', v_bound, v_partial, v_unbound;
  END IF;
END $$;

-- ============================================================
-- §11 A warning raised before a level derivation existed stays updatable (found on the demonstration during B9's act).
-- ============================================================
-- 0061 bound the level to rows RAISED from then on with a NOT VALID check (`level IS NOT NULL`) and said a warning raised
-- before a derivation existed keeps NULL. PostgreSQL enforces a NOT VALID constraint on every row that is inserted OR
-- updated, so the record's one pre-0061 warning could never be updated again: the correction walk of 0065 §8 marking it
-- for attention failed with `wrn_level_derived` and the propagation of that correction (01a0968b on the demonstration)
-- failed on every retry. The intent is kept exactly and moved to where it belongs: a RAISE (an insert) without a level
-- is refused; an update of a legacy row is not.
ALTER TABLE prediction.warnings_current DROP CONSTRAINT wrn_level_derived;
CREATE OR REPLACE FUNCTION prediction.warnings_level_required_on_raise() RETURNS trigger
SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.level IS NULL THEN
    RAISE EXCEPTION 'warning rejected: a warning raised since 0061 carries its derived level (level, level_version, urgency, consequence_class, op_class)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER wrn_level_required_on_raise BEFORE INSERT ON prediction.warnings_current
  FOR EACH ROW EXECUTE FUNCTION prediction.warnings_level_required_on_raise();
COMMENT ON TRIGGER wrn_level_required_on_raise ON prediction.warnings_current IS '0066 §11: the 0061 rule (a raise carries its derived level) as an insert-time rule, so a warning raised before the derivation existed (level NULL) can still be acknowledged, marked for attention or closed.';
