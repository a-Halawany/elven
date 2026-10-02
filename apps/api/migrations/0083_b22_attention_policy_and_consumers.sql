-- 0083 — CP-6 B22: THE ATTENTION POLICY AND THE CONSUMERS (2026-09-24). L10-I05 AttentionPolicyChanged bound; L1-I03, L1-I04 and L2-I02
-- given their registered consumers; L9-I05's package-cause clause (a policy change is a recorded cause) delivered; the fitness,
-- coherence, warning, coverage-loss and review signals ROUTED to accountable people under a versioned, human-set policy.
--
-- THE GAP (the register's own words and the bounded B21 review). ObservationRecorded, SourceHealthChanged, ClaimsExtracted and
-- IntelligenceObjectAdmitted were published to no consumer (0063:57 and :109 admitted GraphChanged/MemoryCorrected only); the
-- "attention policy" was the warning-level vocabulary (0061) and one subscription's materiality budget (0065) — no object, no
-- version, no event; ForecastFitnessChanged, ScenarioCoherenceFailed and EarlyWarningRaised reached nobody as themselves; a policy
-- change had no recorded cause on a package (L9-I05, "L10-I05, B22"); no queue said who must look at what, by when, and why.
--
-- THE MECHANISM.
-- (§1) SUBSCRIBABLE EVENT TYPES: graph.subscribable_event_types (ten; the vocabulary the ledger ports read) and
--   graph.subscription_consumer_events (which types each KIND may select — registration refuses any other). The two literal CHECKs
--   (subscriptions.event_types, subscription_deliveries.event_type) re-declared over the ten; subscription_delivery_receive and
--   subscription_event_row read the vocabulary; register_subscription checks the kind's own types; objects.outbox_lease routes any
--   row whose domain has an active subscription of its type (its literal dropped — the subscription's event_types already bound it;
--   a body change of an existing objects port, no port added: C14). The failure vocabulary gains `invalid_event` (the interface
--   contracts' "quarantine invalid event": an event whose payload is not the contract is left UNRESOLVED as event.quarantined,
--   human_review — never applied, never dropped; the committed publication is the outbox row itself).
-- (§2) FOUR CONSUMER KINDS (one action, one role each — the 0066 idiom): observations (ObservationRecorded → the transformation
--   plan selected), source-health (SourceHealthChanged → impact markers on the derived products and the coverage-loss signal),
--   proposals (ClaimsExtracted, IntelligenceObjectAdmitted → the review queue: each proposed claim held for review routed; nothing
--   promoted), attention (ForecastFitnessChanged, ScenarioCoherenceFailed, EarlyWarningRaised, AttentionPolicyChanged → routed under
--   the policy; a policy change re-evaluates the open items and records the policy cause on the committed packages).
-- (§3) THE ATTENTION POLICY (L10-I05; ES-40-001; PR-44-003): executive.attention_policies — one row per version, immutable but for
--   its supersession; set by a named human holding domain_admin, executive or platform_admin under executive.attention.policy.publish
--   (human-gated); the rules validated whole by the port (executive.validate_attention_rules — every key known, every role real);
--   the changed sections and classes computed against the version it supersedes; AttentionPolicyChanged@v1 from the write.
-- (§4) THE ENGINE (L10-C02; ES-47-002): executive.evaluate_attention(rules, class, dims) — TRANSPARENT dimensions (consequence,
--   confidence, hours to the response window) against the class's thresholds; material | below_threshold | abstained (no policy, or
--   no rule for the class — never a fabricated verdict), with its reasons.
-- (§5) THE QUEUE (PR-44-001/002; UX-44; ES-47 failure semantics; SLO-016): executive.attention_items (one per class, subject and
--   cause) + the append-only executive.attention_item_events. A material item is ROUTED to the subject's owner and the class's
--   roles with an acknowledgement deadline; a below-threshold or abstained item is DEPRIORITIZED — recorded and visible, never
--   dropped; a material item nobody holds is UNROUTED and escalated at once. Acknowledge (receipt, not agreement — OBJ-20), suppress
--   (scope, reason, expiry within the class's maximum, by a person — OBJ-21/PAT-38; lapses), close, escalate-due (overdue →
--   the class's escalation roles, bounded; a lapsed suppression reopens) and re-evaluate (a new policy version).
-- (§6) IMPACT MARKERS (V03-T-077/-079; AU-OBS-0117/-0118): observation.source_impact_markers on the issued forecasts of the source's
--   series, the open warnings on them and the packages whose current version cites them — set on degraded | failed | suspended |
--   unknown, cleared on healthy | active.
-- (§7) THE TRANSFORMATION PLAN (V03-T-291; AU-INT-0016): intelligence.plan_selections — the ACTIVE extraction methods that read the
--   evidence's source (or any source), or no_plan with the reason; the extraction run stays an agent's act (stated).
-- (§8) THE POLICY CAUSE (L9-I05): decision.note_policy_changed (package_events `policy.changed`, once per cause, the version in force
--   at the commitment and the new one); decision.reopen_package admits the cause kind `policy_changed` (after the commitment).
-- (§9) THE REGISTER: L10-I05, L1-I03, L1-I04, L2-I02 bound; L9-I05's clause rewritten — (44, 6, 0).
--
-- NOT HERE (stated): a timer host for escalation (the attention subscriber escalates at each delivery; a person's route does it on
-- demand); external channels (in_app only — the Execution Gateway is not built); per-person preferences; storm grouping beyond one
-- item per (class, subject, cause); an attention section in the briefing (BRF@v1 is closed; B23 with MaterialChangeRaised); the
-- extraction run on ObservationRecorded; L10-I02 MaterialChangeRaised as an event (B23).

-- ============================================================
-- §1 SUBSCRIBABLE EVENT TYPES
-- ============================================================
CREATE TABLE graph.subscribable_event_types (
  event_type text PRIMARY KEY CHECK (event_type ~ '^[A-Z][A-Za-z]+$'),
  interface  text,
  since      text NOT NULL
);
REVOKE ALL ON graph.subscribable_event_types FROM PUBLIC;
ALTER TABLE graph.subscribable_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.subscribable_event_types FORCE ROW LEVEL SECURITY;
CREATE POLICY subscribable_event_types_shared ON graph.subscribable_event_types FOR SELECT USING (true);
GRANT SELECT ON graph.subscribable_event_types TO eye_app, eye_commit;
INSERT INTO graph.subscribable_event_types (event_type, interface, since) VALUES
  ('GraphChanged', 'L4-I05', '0063'), ('MemoryCorrected', 'L3-I05', '0063'),
  ('ObservationRecorded', 'L1-I03', '0083'), ('SourceHealthChanged', 'L1-I04', '0083'),
  ('ClaimsExtracted', 'L2-I02', '0083'), ('IntelligenceObjectAdmitted', 'L2-I02', '0083'),
  ('ForecastFitnessChanged', 'L6-I03', '0083'), ('ScenarioCoherenceFailed', 'L7-I04', '0083'),
  ('EarlyWarningRaised', 'L10-I02', '0083'), ('AttentionPolicyChanged', 'L10-I05', '0083');

ALTER TABLE graph.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_event_types_check;
ALTER TABLE graph.subscriptions ADD CONSTRAINT subscriptions_event_types_check CHECK (cardinality(event_types) >= 1 AND event_types <@ ARRAY[
  'GraphChanged', 'MemoryCorrected', 'ObservationRecorded', 'SourceHealthChanged', 'ClaimsExtracted', 'IntelligenceObjectAdmitted',
  'ForecastFitnessChanged', 'ScenarioCoherenceFailed', 'EarlyWarningRaised', 'AttentionPolicyChanged']);
ALTER TABLE graph.subscription_deliveries DROP CONSTRAINT IF EXISTS subscription_deliveries_event_type_check;
ALTER TABLE graph.subscription_deliveries ADD CONSTRAINT subscription_deliveries_event_type_check CHECK (event_type IN (
  'GraphChanged', 'MemoryCorrected', 'ObservationRecorded', 'SourceHealthChanged', 'ClaimsExtracted', 'IntelligenceObjectAdmitted',
  'ForecastFitnessChanged', 'ScenarioCoherenceFailed', 'EarlyWarningRaised', 'AttentionPolicyChanged'));
-- the quarantine class (the interface contracts' "quarantine invalid event")
ALTER TABLE graph.subscription_deliveries DROP CONSTRAINT IF EXISTS subscription_deliveries_failure_class_check;
ALTER TABLE graph.subscription_deliveries ADD CONSTRAINT subscription_deliveries_failure_class_check CHECK (failure_class IS NULL OR failure_class IN (
  'authority_disputed', 'consumer_unavailable', 'provenance_incomplete', 'executed_action', 'legal_hold', 'material_change', 'unresolved_dependency', 'budget', 'infrastructure', 'invalid_event'));

-- ============================================================
-- §2 FOUR CONSUMER KINDS
-- ============================================================
INSERT INTO graph.subscription_consumer_actions (consumer_kind, action, role_code, since) VALUES
  ('observations', 'intelligence.observation.subscription.apply', 'observation_subscriber', '0083'),
  ('source-health', 'observation.source_health.subscription.apply', 'source_health_subscriber', '0083'),
  ('proposals', 'intelligence.proposal.subscription.apply', 'proposal_subscriber', '0083'),
  ('attention', 'executive.attention.subscription.apply', 'attention_subscriber', '0083');
INSERT INTO identity.roles (code, scope, description) VALUES
  ('observation_subscriber', 'DOMAIN', 'The observations subscription consumer (B22): selects the transformation plan for a recorded observation — exactly intelligence.observation.subscription.apply'),
  ('source_health_subscriber', 'DOMAIN', 'The source-health subscription consumer (B22): sets and clears source-health impact markers on derived products and raises the coverage-loss signal — exactly observation.source_health.subscription.apply'),
  ('proposal_subscriber', 'DOMAIN', 'The proposals subscription consumer (B22): routes each proposed claim held for review to the review queue; promotes nothing — exactly intelligence.proposal.subscription.apply'),
  ('attention_subscriber', 'DOMAIN', 'The attention subscription consumer (B22): routes fitness, coherence and warning signals under the attention policy, re-evaluates on a policy change and records the policy cause on committed packages — exactly executive.attention.subscription.apply')
ON CONFLICT (code) DO NOTHING;
ALTER TABLE graph.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_consumer_kind_check;
ALTER TABLE graph.subscriptions ADD CONSTRAINT subscriptions_consumer_kind_check CHECK (consumer_kind IN (
  'twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships', 'observations', 'source-health', 'proposals', 'attention'));

CREATE TABLE graph.subscription_consumer_events (
  consumer_kind text NOT NULL REFERENCES graph.subscription_consumer_actions(consumer_kind),
  event_type    text NOT NULL REFERENCES graph.subscribable_event_types(event_type),
  since         text NOT NULL,
  PRIMARY KEY (consumer_kind, event_type)
);
REVOKE ALL ON graph.subscription_consumer_events FROM PUBLIC;
ALTER TABLE graph.subscription_consumer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.subscription_consumer_events FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_consumer_events_shared ON graph.subscription_consumer_events FOR SELECT USING (true);
GRANT SELECT ON graph.subscription_consumer_events TO eye_app, eye_commit;
INSERT INTO graph.subscription_consumer_events (consumer_kind, event_type, since)
SELECT k, t, '0063' FROM unnest(ARRAY['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings']) k, unnest(ARRAY['GraphChanged', 'MemoryCorrected']) t;
INSERT INTO graph.subscription_consumer_events (consumer_kind, event_type, since) VALUES
  ('relationships', 'GraphChanged', '0066'), ('relationships', 'MemoryCorrected', '0066'),
  ('observations', 'ObservationRecorded', '0083'),
  ('source-health', 'SourceHealthChanged', '0083'),
  ('proposals', 'ClaimsExtracted', '0083'), ('proposals', 'IntelligenceObjectAdmitted', '0083'),
  ('attention', 'ForecastFitnessChanged', '0083'), ('attention', 'ScenarioCoherenceFailed', '0083'), ('attention', 'EarlyWarningRaised', '0083'),
  ('attention', 'AttentionPolicyChanged', '0083');

-- The four ports that read the vocabulary (bodies as 0064/0065 left them; the literal replaced).
CREATE OR REPLACE FUNCTION graph.subscription_delivery_receive(p_event_id uuid, p_tenant uuid, p_domain uuid, p_event_type text, p_change_kind text, p_outbox_created_at timestamp with time zone, p_only uuid[], p_correlation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'graph', 'observation', 'objects', 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE s graph.subscriptions%ROWTYPE; d graph.subscription_deliveries%ROWTYPE; v_out jsonb := '[]'::jsonb; v_seq bigint;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  -- 0083: any SUBSCRIBABLE event type (graph.subscribable_event_types), no longer the two literals.
  IF p_tenant IS NULL OR p_domain IS NULL OR p_event_id IS NULL OR NOT EXISTS (SELECT 1 FROM graph.subscribable_event_types t WHERE t.event_type = p_event_type) THEN
    RAISE EXCEPTION 'subscription delivery requires a scoped event of a subscribable type (%)', coalesce(p_event_type, '<none>') USING ERRCODE = '23514';
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
END $function$;

CREATE OR REPLACE FUNCTION graph.subscription_event_row(p_event_id uuid, p_tenant uuid, p_domain uuid)
 RETURNS TABLE(event_type text, payload jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'graph', 'objects', 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY SELECT x.event_type, x.payload, x.created_at FROM objects.object_outbox x
    WHERE x.id = p_event_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status IN ('pending', 'published') AND x.event_type IN (SELECT t.event_type FROM graph.subscribable_event_types t)
      AND (x.status = 'published' OR x.lease_id IS NOT NULL);
END $function$;

CREATE OR REPLACE FUNCTION graph.register_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_consumer_kind text, p_event_types text[], p_filter jsonb, p_principal uuid, p_version text, p_code_digest text, p_owner uuid, p_budgets jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'graph', 'observation', 'identity', 'objects', 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
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
  -- 0083: a kind selects only the event types it declares (graph.subscription_consumer_events) — a new consumer is never fed a type it cannot read.
  IF p_event_types IS NULL OR cardinality(p_event_types) = 0 OR EXISTS (SELECT 1 FROM unnest(p_event_types) t(event_type)
       WHERE NOT EXISTS (SELECT 1 FROM graph.subscription_consumer_events e WHERE e.consumer_kind = p_consumer_kind AND e.event_type = t.event_type)) THEN
    RAISE EXCEPTION 'subscription rejected: consumer kind % selects only %', p_consumer_kind,
      coalesce((SELECT string_agg(e.event_type, ', ' ORDER BY e.event_type) FROM graph.subscription_consumer_events e WHERE e.consumer_kind = p_consumer_kind), '<no event type>') USING ERRCODE = '22023';
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
END $function$;

CREATE OR REPLACE FUNCTION objects.outbox_lease(p_limit integer, p_lease_seconds integer DEFAULT 60)
 RETURNS TABLE(id uuid, lease_id uuid, event_type text, payload jsonb, correlation_id uuid, causation_id uuid, tenant_id uuid, domain_id uuid, partition_key text, partition_seq bigint, schema_version text, subscribed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'objects', 'graph', 'public', 'pg_catalog', 'pg_temp'
AS $function$
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
         -- THE ROUTING DECISION, from the registry: a row of a domain with an active subscription of its type (0083: any
         -- subscribable type — the subscription's own event_types, bounded by graph.subscribable_event_types) is routed to the domain's subscription queue by whichever process publishes it.
         (l.tenant_id IS NOT NULL AND l.domain_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM graph.subscriptions s WHERE s.tenant_id = l.tenant_id AND s.domain_id = l.domain_id AND s.status = 'active' AND l.event_type = ANY (s.event_types))) AS subscribed
    FROM leased l ORDER BY l.partition_key, l.partition_seq;
END $function$;

-- ============================================================
-- §3 THE ATTENTION POLICY
-- ============================================================
-- The five signal classes (the NOT catalogue: NOT-15, the L7 degraded behaviour, NOT-06, NOT-10, NOT-09/14).
CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review'] $$;
GRANT EXECUTE ON FUNCTION executive.attention_signal_classes() TO eye_app, eye_commit;

CREATE TABLE executive.attention_policies (
  policy_id        uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  state            text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'superseded')),
  rules            jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'object'),
  rules_digest     text NOT NULL CHECK (rules_digest ~ '^[0-9a-f]{64}$'),
  supersedes       int,
  changed_sections text[] NOT NULL DEFAULT '{}',
  changed_classes  text[] NOT NULL DEFAULT '{}',
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  set_by           uuid NOT NULL,
  effective_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz,
  correlation_id   uuid NOT NULL,
  CONSTRAINT xap_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xap_version_once UNIQUE (tenant_id, domain_id, version),
  CONSTRAINT xap_supersedes CHECK ((version = 1) = (supersedes IS NULL) AND (supersedes IS NULL OR supersedes = version - 1)),
  CONSTRAINT xap_superseded_bound CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX xap_one_active ON executive.attention_policies (tenant_id, domain_id) WHERE state = 'active';
COMMENT ON TABLE executive.attention_policies IS 'L10-I05 (0083): the attention policy of a domain, one row per VERSION — materiality, routing, escalation, suppression and notification rules per signal class; immutable but for its supersession; set by a named human; announced as AttentionPolicyChanged@v1.';
-- A version is never rewritten: the only UPDATE is its supersession (active → superseded, once); nothing is deleted.
CREATE OR REPLACE FUNCTION executive.attention_policy_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'attention policy versions are never deleted' USING ERRCODE = '55000'; END IF;
  IF OLD.state = 'active' AND NEW.state = 'superseded' AND NEW.superseded_at IS NOT NULL
     AND (to_jsonb(NEW) - 'state' - 'superseded_at') = (to_jsonb(OLD) - 'state' - 'superseded_at') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'attention policy version % is immutable; a change is a new version', OLD.version USING ERRCODE = '55000';
END $$;
CREATE TRIGGER xap_immutable BEFORE UPDATE OR DELETE ON executive.attention_policies FOR EACH ROW EXECUTE FUNCTION executive.attention_policy_immutable();

-- THE RULES, validated whole: every key known, every role a real role, every bound inside its range (22023 naming the key).
CREATE OR REPLACE FUNCTION executive.validate_attention_rules(p_rules jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
DECLARE c record; k text; r jsonb; m jsonb; s jsonb; v jsonb;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: the rules are an object {classes, overload?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_rules) LOOP
    IF k NOT IN ('classes', 'overload') THEN RAISE EXCEPTION 'attention policy rejected: unknown key % (the rules carry classes and optionally overload)', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF jsonb_typeof(p_rules -> 'classes') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_rules -> 'classes')) = 0 THEN
    RAISE EXCEPTION 'attention policy rejected: classes is a non-empty object keyed by signal class (%)', array_to_string(executive.attention_signal_classes(), ', ') USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT key, value FROM jsonb_each(p_rules -> 'classes') LOOP
    IF NOT (c.key = ANY (executive.attention_signal_classes())) THEN RAISE EXCEPTION 'attention policy rejected: % is not a signal class (%)', c.key, array_to_string(executive.attention_signal_classes(), ', ') USING ERRCODE = '22023'; END IF;
    r := c.value;
    IF jsonb_typeof(r) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: class % is an object', c.key USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(r) LOOP
      IF k NOT IN ('materiality', 'route_roles', 'ack_within_minutes', 'escalate_to_roles', 'max_escalations', 'suppression', 'notify') THEN
        RAISE EXCEPTION 'attention policy rejected: class % carries the unknown key %', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    m := r -> 'materiality';
    IF jsonb_typeof(m) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'attention policy rejected: class % needs materiality {min_consequence, min_confidence, max_hours_to_window?}', c.key USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(m) LOOP
      IF k NOT IN ('min_consequence', 'min_confidence', 'max_hours_to_window') THEN RAISE EXCEPTION 'attention policy rejected: class % materiality carries the unknown key %', c.key, k USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF coalesce(m ->> 'min_consequence', '') NOT IN ('C0', 'C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'attention policy rejected: class % materiality.min_consequence is C0..C4', c.key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(m -> 'min_confidence') IS DISTINCT FROM 'number' OR (m ->> 'min_confidence')::numeric < 0 OR (m ->> 'min_confidence')::numeric > 1 THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.min_confidence is a number in [0, 1]', c.key USING ERRCODE = '22023';
    END IF;
    IF m ? 'max_hours_to_window' AND jsonb_typeof(m -> 'max_hours_to_window') <> 'null'
       AND (jsonb_typeof(m -> 'max_hours_to_window') <> 'number' OR (m ->> 'max_hours_to_window')::numeric <= 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.max_hours_to_window is a positive number or null', c.key USING ERRCODE = '22023';
    END IF;
    FOR k IN SELECT unnest(ARRAY['route_roles', 'escalate_to_roles']) LOOP
      v := r -> k;
      IF k = 'route_roles' AND (jsonb_typeof(v) IS DISTINCT FROM 'array' OR jsonb_array_length(v) = 0) THEN RAISE EXCEPTION 'attention policy rejected: class % route_roles is a non-empty list of roles', c.key USING ERRCODE = '22023'; END IF;
      IF v IS NOT NULL AND jsonb_typeof(v) <> 'array' THEN RAISE EXCEPTION 'attention policy rejected: class % % is a list of roles', c.key, k USING ERRCODE = '22023'; END IF;
      IF v IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e) <> 'string' OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = e #>> '{}' AND x.code NOT LIKE '%\_subscriber' AND x.code NOT LIKE '%\_agent')) THEN
        RAISE EXCEPTION 'attention policy rejected: class % % names a role that is not a human role of this product', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF jsonb_typeof(r -> 'ack_within_minutes') IS DISTINCT FROM 'number' OR (r ->> 'ack_within_minutes')::numeric <> trunc((r ->> 'ack_within_minutes')::numeric)
       OR (r ->> 'ack_within_minutes')::numeric < 1 OR (r ->> 'ack_within_minutes')::numeric > 10080 THEN
      RAISE EXCEPTION 'attention policy rejected: class % ack_within_minutes is a whole number in [1, 10080]', c.key USING ERRCODE = '22023';
    END IF;
    IF r ? 'max_escalations' AND (jsonb_typeof(r -> 'max_escalations') <> 'number' OR (r ->> 'max_escalations')::numeric NOT IN (0, 1, 2, 3, 4, 5)) THEN
      RAISE EXCEPTION 'attention policy rejected: class % max_escalations is 0..5', c.key USING ERRCODE = '22023';
    END IF;
    IF coalesce((r ->> 'max_escalations')::int, 0) > 0 AND (r -> 'escalate_to_roles' IS NULL OR jsonb_array_length(r -> 'escalate_to_roles') = 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % escalates (max_escalations > 0) to nobody; name escalate_to_roles', c.key USING ERRCODE = '22023';
    END IF;
    s := r -> 'suppression';
    IF s IS NOT NULL THEN
      IF jsonb_typeof(s) <> 'object' OR jsonb_typeof(s -> 'allowed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'attention policy rejected: class % suppression is {allowed, max_hours}', c.key USING ERRCODE = '22023'; END IF;
      IF (s ->> 'allowed')::boolean AND (jsonb_typeof(s -> 'max_hours') IS DISTINCT FROM 'number' OR (s ->> 'max_hours')::numeric < 1 OR (s ->> 'max_hours')::numeric > 720) THEN
        RAISE EXCEPTION 'attention policy rejected: class % suppression.max_hours is in [1, 720] when suppression is allowed', c.key USING ERRCODE = '22023';
      END IF;
    END IF;
    IF r ? 'notify' AND r ->> 'notify' IS DISTINCT FROM 'in_app' THEN RAISE EXCEPTION 'attention policy rejected: class % notify is in_app (no external channel exists)', c.key USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_rules ? 'overload' THEN
    IF jsonb_typeof(p_rules -> 'overload') <> 'object' OR jsonb_typeof(p_rules #> '{overload,max_open_per_role}') IS DISTINCT FROM 'number' OR (p_rules #>> '{overload,max_open_per_role}')::numeric < 1 THEN
      RAISE EXCEPTION 'attention policy rejected: overload is {max_open_per_role ≥ 1}' USING ERRCODE = '22023';
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION executive.validate_attention_rules(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.validate_attention_rules(jsonb) TO eye_commit;

-- Whether an active human of the tenant holds the role at the domain (DOMAIN or TENANT binding) or the platform.
CREATE OR REPLACE FUNCTION executive.holds_role(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL AND b.role_code = ANY (p_roles)
                    AND (b.scope = 'PLATFORM' OR (b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain)))));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.holds_role(uuid, uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.holds_role(uuid, uuid, uuid, text[]) TO eye_app, eye_commit;
-- Whether ANY active human holds one of the roles in the domain (the routing test: nobody → unrouted).
CREATE OR REPLACE FUNCTION executive.role_holders(p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS int
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT count(DISTINCT b.principal_id)::int FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
   WHERE p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL AND b.role_code = ANY (p_roles)
     AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.role_holders(uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.role_holders(uuid, uuid, text[]) TO eye_app, eye_commit;

-- PUBLISH: a new version, validated, superseding the active one; the changed sections and classes computed; the answer is the event's material.
CREATE OR REPLACE FUNCTION executive.publish_attention_policy(
  p_policy_id uuid, p_tenant uuid, p_domain uuid, p_rules jsonb, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.attention_policies%ROWTYPE; v_version int; v_digest text; v_sections text[] := '{}'; v_classes text[] := '{}'; k text; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.policy.publish']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention policy rejected: set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'executive', 'platform_admin']) THEN
    RAISE EXCEPTION 'attention policy rejected: a policy is set by a named human holding domain_admin, executive or platform_admin (PR-44-003)' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'attention policy rejected: a reason of at least 8 characters says why the policy changes' USING ERRCODE = '22023'; END IF;
  PERFORM executive.validate_attention_rules(p_rules);
  v_digest := encode(sha256(convert_to(p_rules::text, 'UTF8')), 'hex');
  SELECT * INTO a FROM executive.attention_policies x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active' FOR UPDATE;
  IF FOUND AND a.rules_digest = v_digest THEN
    RAISE EXCEPTION 'attention policy rejected: the rules are unchanged from version %; a version records a change', a.version USING ERRCODE = '22023';
  END IF;
  v_version := CASE WHEN FOUND THEN a.version + 1 ELSE 1 END;
  IF a.policy_id IS NOT NULL THEN
    UPDATE executive.attention_policies SET state = 'superseded', superseded_at = v_at WHERE policy_id = a.policy_id;
    IF (a.rules -> 'overload') IS DISTINCT FROM (p_rules -> 'overload') THEN v_sections := v_sections || 'overload'::text; END IF;
    FOR k IN SELECT DISTINCT x FROM (SELECT jsonb_object_keys(a.rules -> 'classes') x UNION SELECT jsonb_object_keys(p_rules -> 'classes')) q ORDER BY 1 LOOP
      IF (a.rules #> ARRAY['classes', k]) IS DISTINCT FROM (p_rules #> ARRAY['classes', k]) THEN
        v_classes := v_classes || k;
        IF (a.rules #> ARRAY['classes', k, 'materiality']) IS DISTINCT FROM (p_rules #> ARRAY['classes', k, 'materiality']) AND NOT ('materiality' = ANY (v_sections)) THEN v_sections := v_sections || 'materiality'::text; END IF;
        IF ((a.rules #> ARRAY['classes', k, 'route_roles']) IS DISTINCT FROM (p_rules #> ARRAY['classes', k, 'route_roles'])) AND NOT ('routing' = ANY (v_sections)) THEN v_sections := v_sections || 'routing'::text; END IF;
        IF ((a.rules #> ARRAY['classes', k, 'escalate_to_roles']) IS DISTINCT FROM (p_rules #> ARRAY['classes', k, 'escalate_to_roles'])
            OR (a.rules #> ARRAY['classes', k, 'max_escalations']) IS DISTINCT FROM (p_rules #> ARRAY['classes', k, 'max_escalations'])
            OR (a.rules #> ARRAY['classes', k, 'ack_within_minutes']) IS DISTINCT FROM (p_rules #> ARRAY['classes', k, 'ack_within_minutes'])) AND NOT ('escalation' = ANY (v_sections)) THEN v_sections := v_sections || 'escalation'::text; END IF;
        IF (a.rules #> ARRAY['classes', k, 'suppression']) IS DISTINCT FROM (p_rules #> ARRAY['classes', k, 'suppression']) AND NOT ('suppression' = ANY (v_sections)) THEN v_sections := v_sections || 'suppression'::text; END IF;
        IF (a.rules #> ARRAY['classes', k, 'notify']) IS DISTINCT FROM (p_rules #> ARRAY['classes', k, 'notify']) AND NOT ('notification' = ANY (v_sections)) THEN v_sections := v_sections || 'notification'::text; END IF;
        IF ((a.rules #> ARRAY['classes', k]) IS NULL OR (p_rules #> ARRAY['classes', k]) IS NULL) AND NOT ('classes' = ANY (v_sections)) THEN v_sections := v_sections || 'classes'::text; END IF;
      END IF;
    END LOOP;
  ELSE
    v_sections := ARRAY['classes'] || CASE WHEN p_rules ? 'overload' THEN ARRAY['overload'] ELSE '{}'::text[] END;
    SELECT array_agg(x ORDER BY x) INTO v_classes FROM jsonb_object_keys(p_rules -> 'classes') x;
  END IF;
  INSERT INTO executive.attention_policies (policy_id, scope, tenant_id, domain_id, version, state, rules, rules_digest, supersedes, changed_sections, changed_classes, reason, set_by, effective_at, correlation_id)
  VALUES (p_policy_id, 'DOMAIN', p_tenant, p_domain, v_version, 'active', p_rules, v_digest, CASE WHEN v_version = 1 THEN NULL ELSE v_version - 1 END, v_sections, coalesce(v_classes, '{}'), btrim(p_reason), p_actor, v_at, p_correlation);
  RETURN jsonb_build_object('policy_id', p_policy_id, 'version', v_version, 'supersedes', CASE WHEN v_version = 1 THEN NULL ELSE v_version - 1 END, 'superseded_policy_id', a.policy_id,
                            'rules_digest', v_digest, 'changed_sections', to_jsonb(v_sections), 'changed_classes', to_jsonb(coalesce(v_classes, '{}')), 'effective_at', v_at, 'set_by', p_actor, 'reason', btrim(p_reason));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.publish_attention_policy(uuid,uuid,uuid,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.publish_attention_policy(uuid,uuid,uuid,jsonb,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §4 THE ENGINE — transparent dimensions against the class's thresholds; abstains without a rule
-- ============================================================
CREATE OR REPLACE FUNCTION executive.evaluate_attention(p_rules jsonb, p_class text, p_dims jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r jsonb := p_rules #> ARRAY['classes', p_class]; m jsonb; v_reasons jsonb := '[]'::jsonb; v_ok boolean := true;
        v_cons int; v_min int; v_conf numeric; v_hours numeric; v_max numeric;
BEGIN
  IF p_rules IS NULL THEN
    RETURN jsonb_build_object('outcome', 'abstained', 'reasons', jsonb_build_array('no attention policy is published for this domain'), 'dimensions', p_dims, 'thresholds', NULL);
  END IF;
  IF r IS NULL THEN
    RETURN jsonb_build_object('outcome', 'abstained', 'reasons', jsonb_build_array(format('the policy has no rule for the class %s', p_class)), 'dimensions', p_dims, 'thresholds', NULL);
  END IF;
  m := r -> 'materiality';
  v_cons := CASE WHEN p_dims ->> 'consequence' ~ '^C[0-4]$' THEN substr(p_dims ->> 'consequence', 2)::int ELSE NULL END;
  v_min := substr(m ->> 'min_consequence', 2)::int;
  IF v_cons IS NULL THEN
    RETURN jsonb_build_object('outcome', 'abstained', 'reasons', jsonb_build_array('the signal carries no consequence class to judge'), 'dimensions', p_dims, 'thresholds', m);
  END IF;
  IF v_cons < v_min THEN v_ok := false; v_reasons := v_reasons || to_jsonb(format('consequence C%s below the threshold %s', v_cons, m ->> 'min_consequence'));
  ELSE v_reasons := v_reasons || to_jsonb(format('consequence C%s at or above %s', v_cons, m ->> 'min_consequence')); END IF;
  v_conf := CASE WHEN jsonb_typeof(p_dims -> 'confidence') = 'number' THEN (p_dims ->> 'confidence')::numeric ELSE NULL END;
  IF v_conf IS NULL THEN
    RETURN jsonb_build_object('outcome', 'abstained', 'reasons', v_reasons || to_jsonb('the signal carries no confidence to judge'::text), 'dimensions', p_dims, 'thresholds', m);
  END IF;
  IF v_conf < (m ->> 'min_confidence')::numeric THEN v_ok := false; v_reasons := v_reasons || to_jsonb(format('confidence %s below the threshold %s', v_conf, m ->> 'min_confidence'));
  ELSE v_reasons := v_reasons || to_jsonb(format('confidence %s at or above %s', v_conf, m ->> 'min_confidence')); END IF;
  v_max := CASE WHEN jsonb_typeof(m -> 'max_hours_to_window') = 'number' THEN (m ->> 'max_hours_to_window')::numeric ELSE NULL END;
  IF v_max IS NOT NULL THEN
    v_hours := CASE WHEN jsonb_typeof(p_dims -> 'hours_to_window') = 'number' THEN (p_dims ->> 'hours_to_window')::numeric ELSE NULL END;
    IF v_hours IS NULL THEN v_reasons := v_reasons || to_jsonb('no response window: the window threshold does not apply'::text);
    ELSIF v_hours > v_max THEN v_ok := false; v_reasons := v_reasons || to_jsonb(format('%s hours to the response window, beyond %s', round(v_hours, 1), v_max));
    ELSE v_reasons := v_reasons || to_jsonb(format('%s hours to the response window, within %s', round(v_hours, 1), v_max)); END IF;
  END IF;
  RETURN jsonb_build_object('outcome', CASE WHEN v_ok THEN 'material' ELSE 'below_threshold' END, 'reasons', v_reasons, 'dimensions', p_dims, 'thresholds', m);
END $$;
GRANT EXECUTE ON FUNCTION executive.evaluate_attention(jsonb, text, jsonb) TO eye_app, eye_commit;

-- ============================================================
-- §5 THE QUEUE
-- ============================================================
CREATE TABLE executive.attention_items (
  item_id            uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  signal_class       text NOT NULL CHECK (signal_class IN ('forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review')),
  subject_kind       text NOT NULL CHECK (subject_kind IN ('forecast', 'scenario', 'warning', 'source', 'claim')),
  subject_id         uuid NOT NULL,
  cause_event_id     uuid NOT NULL,
  cause_event_type   text NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 512),
  outcome            text NOT NULL CHECK (outcome IN ('material', 'below_threshold', 'abstained')),
  state              text NOT NULL CHECK (state IN ('open', 'escalated', 'unrouted', 'acknowledged', 'suppressed', 'deprioritized', 'closed')),
  owner_principal_id uuid,
  route_roles        text[] NOT NULL DEFAULT '{}',
  policy_id          uuid REFERENCES executive.attention_policies(policy_id),
  policy_version     int,
  evaluation         jsonb NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  due_at             timestamptz,
  escalations        int NOT NULL DEFAULT 0 CHECK (escalations BETWEEN 0 AND 5),
  suppressed_until   timestamptz,
  acknowledged_at    timestamptz,
  acknowledged_by    uuid,
  closed_at          timestamptz,
  closed_by          uuid,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xai_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xai_once UNIQUE (tenant_id, domain_id, signal_class, subject_id, cause_event_id),
  CONSTRAINT xai_policy_bound CHECK ((policy_id IS NULL) = (policy_version IS NULL)),
  CONSTRAINT xai_material_routed CHECK (outcome = 'material' OR state IN ('deprioritized', 'closed')),
  CONSTRAINT xai_ack_bound CHECK ((acknowledged_at IS NULL) = (acknowledged_by IS NULL)),
  CONSTRAINT xai_closed_bound CHECK ((state = 'closed') = (closed_at IS NOT NULL) AND (closed_at IS NULL) = (closed_by IS NULL)),
  CONSTRAINT xai_suppressed_bound CHECK ((state = 'suppressed') = (suppressed_until IS NOT NULL))
);
CREATE INDEX xai_queue ON executive.attention_items (tenant_id, domain_id, state, due_at);
CREATE INDEX xai_subject ON executive.attention_items (tenant_id, domain_id, subject_kind, subject_id);
COMMENT ON TABLE executive.attention_items IS 'The attention queue (0083; PR-44-001/002): one item per (signal class, subject, cause event), evaluated under an exact policy version with its dimensions and reasons; routed, deprioritized (visible) or unrouted (escalated at once); acknowledged (receipt, not agreement), suppressed (reasoned, expiring), escalated when overdue, closed.';

CREATE TABLE executive.attention_item_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  item_id            uuid NOT NULL REFERENCES executive.attention_items(item_id),
  event              text NOT NULL CHECK (event IN ('item.routed', 'item.deprioritized', 'item.unrouted', 'item.escalated', 'item.acknowledged', 'item.suppressed',
                                                    'item.suppression_lapsed', 'item.reevaluated', 'item.closed', 'item.repeated')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xae_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xae_item ON executive.attention_item_events (item_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.attention_item_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attention_policies', 'attention_items', 'attention_item_events'] LOOP
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
END $$;

CREATE OR REPLACE FUNCTION executive.attention_event(p_item uuid, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
SET search_path = executive, pg_catalog, pg_temp AS $$
  INSERT INTO executive.attention_item_events (event_id, scope, tenant_id, domain_id, item_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_item, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.attention_event(uuid,uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC;

-- The route an evaluated item takes (shared by the first routing and a re-evaluation): material → the owner and the class's roles
-- with the deadline, or UNROUTED (nobody holds the roles and there is no owner) and escalated at once when the escalation roles
-- have a holder; below_threshold / abstained → deprioritized (visible). Returns {state, route_roles, due_at, escalations}.
CREATE OR REPLACE FUNCTION executive.attention_route(p_rules jsonb, p_class text, p_outcome text, p_owner uuid, p_tenant uuid, p_domain uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
DECLARE r jsonb := p_rules #> ARRAY['classes', p_class]; v_roles text[]; v_esc text[]; v_minutes int;
BEGIN
  IF p_outcome <> 'material' THEN RETURN jsonb_build_object('state', 'deprioritized', 'route_roles', '[]'::jsonb, 'due_at', NULL, 'escalations', 0); END IF;
  SELECT coalesce(array_agg(x), '{}') INTO v_roles FROM jsonb_array_elements_text(r -> 'route_roles') x;
  SELECT coalesce(array_agg(x), '{}') INTO v_esc FROM jsonb_array_elements_text(coalesce(r -> 'escalate_to_roles', '[]'::jsonb)) x;
  v_minutes := (r ->> 'ack_within_minutes')::int;
  IF (p_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_owner AND p.kind = 'human' AND p.status = 'active'))
     OR executive.role_holders(p_tenant, p_domain, v_roles) > 0 THEN
    RETURN jsonb_build_object('state', 'open', 'route_roles', to_jsonb(v_roles), 'due_at', clock_timestamp() + make_interval(mins => v_minutes), 'escalations', 0);
  END IF;
  -- ES-47 failure semantics: an unowned material item is not issued as actionable to nobody — the routing failure escalates.
  IF coalesce((r ->> 'max_escalations')::int, 0) > 0 AND executive.role_holders(p_tenant, p_domain, v_esc) > 0 THEN
    RETURN jsonb_build_object('state', 'escalated', 'route_roles', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_roles || v_esc) ORDER BY 1)), 'due_at', clock_timestamp() + make_interval(mins => v_minutes), 'escalations', 1, 'unrouted', true);
  END IF;
  RETURN jsonb_build_object('state', 'unrouted', 'route_roles', to_jsonb(v_roles), 'due_at', NULL, 'escalations', 0);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_route(jsonb,text,text,uuid,uuid,uuid) FROM PUBLIC;

-- ROUTE: an item evaluated under the ACTIVE policy version and routed; idempotent on (class, subject, cause) — a repeated delivery
-- answers the item it made. Driven by the three routing subscribers only.
CREATE OR REPLACE FUNCTION executive.route_attention_item(
  p_item_id uuid, p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject_id uuid, p_cause_event_id uuid, p_cause_event_type text,
  p_owner uuid, p_dims jsonb, p_title text, p_details jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.subscription.apply', 'observation.source_health.subscription.apply', 'intelligence.proposal.subscription.apply']);
  -- the OWNER is a named, active human of the tenant, or nobody (an agent issued the forecast: the class's roles are accountable)
  v_owner := CASE WHEN p_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_owner AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN p_owner ELSE NULL END;
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO x FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = p_class AND i.subject_id = p_subject_id AND i.cause_event_id = p_cause_event_id;
  IF FOUND THEN
    RETURN jsonb_build_object('item_id', x.item_id, 'repeated', true, 'outcome', x.outcome, 'state', x.state, 'policy_version', x.policy_version, 'route_roles', to_jsonb(x.route_roles), 'owner', x.owner_principal_id, 'due_at', x.due_at, 'evaluation', x.evaluation);
  END IF;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, p_class, coalesce(p_dims, '{}'::jsonb)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, p_class, v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, p_class, p_subject_kind, p_subject_id, p_cause_event_id, p_cause_event_type, left(btrim(p_title), 512), v_eval ->> 'outcome', v_state,
          v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval, coalesce(p_details, '{}'::jsonb),
          (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
  PERFORM executive.attention_event(p_item_id, p_tenant, p_domain,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
            p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                        'due_at', v_route -> 'due_at', 'cause_event_id', p_cause_event_id, 'cause_event_type', p_cause_event_type, 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
  RETURN jsonb_build_object('item_id', p_item_id, 'repeated', false, 'outcome', v_eval ->> 'outcome', 'state', v_state, 'policy_version', pol.version, 'route_roles', v_route -> 'route_roles',
                            'owner', v_owner, 'due_at', v_route -> 'due_at', 'evaluation', v_eval, 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, v_state = 'unrouted'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.route_attention_item(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,jsonb,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.route_attention_item(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,jsonb,text,jsonb,uuid,uuid) TO eye_commit;

-- Who may act on an item: its owner, or an active human holding one of its route roles (the escalation roles joined in), or a
-- domain / platform administrator.
CREATE OR REPLACE FUNCTION executive.may_act_on_item(x executive.attention_items, p_actor uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
  SELECT (x.owner_principal_id IS NOT NULL AND x.owner_principal_id = p_actor)
      OR executive.holds_role(p_actor, x.tenant_id, x.domain_id, x.route_roles || ARRAY['domain_admin', 'platform_admin']);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.may_act_on_item(executive.attention_items, uuid) FROM PUBLIC;

-- ACKNOWLEDGE: receipt, never agreement (OBJ-20; the alert command rules) — by the owner or a holder of a routed role.
CREATE OR REPLACE FUNCTION executive.acknowledge_attention_item(p_item uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention item rejected: acknowledged by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention item rejected: no such item in this domain' USING ERRCODE = '23503'; END IF;
  IF NOT executive.may_act_on_item(x, p_actor) THEN RAISE EXCEPTION 'attention item rejected: item % is routed to % (owner %); the acting principal is neither', p_item, array_to_string(x.route_roles, ', '), coalesce(x.owner_principal_id::text, 'none') USING ERRCODE = '42501'; END IF;
  IF x.state NOT IN ('open', 'escalated', 'unrouted') THEN RAISE EXCEPTION 'attention item rejected: item % is %; only an open, escalated or unrouted item is acknowledged', p_item, x.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.attention_items SET state = 'acknowledged', acknowledged_at = v_at, acknowledged_by = p_actor, updated_at = v_at WHERE item_id = p_item;
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.acknowledged', p_actor,
            jsonb_build_object('from_state', x.state, 'note', nullif(btrim(coalesce(p_note, '')), ''), 'within_deadline', x.due_at IS NULL OR v_at <= x.due_at, 'receipt_not_agreement', true), p_correlation);
  RETURN jsonb_build_object('item_id', p_item, 'state', 'acknowledged', 'from_state', x.state, 'acknowledged_at', v_at, 'acknowledged_by', p_actor, 'within_deadline', x.due_at IS NULL OR v_at <= x.due_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.acknowledge_attention_item(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.acknowledge_attention_item(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- SUPPRESS: time-bound, reasoned, scoped to the item, within the class's maximum under the item's OWN policy version, by a person who
-- may act on it; visible (the state and the event), never silent; it lapses (escalate-due reopens it).
CREATE OR REPLACE FUNCTION executive.suppress_attention_item(p_item uuid, p_tenant uuid, p_domain uuid, p_until timestamptz, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; s jsonb; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.suppress']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention item rejected: suppressed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention item rejected: no such item in this domain' USING ERRCODE = '23503'; END IF;
  IF NOT executive.may_act_on_item(x, p_actor) THEN RAISE EXCEPTION 'attention item rejected: item % is routed to % (owner %); the acting principal is neither', p_item, array_to_string(x.route_roles, ', '), coalesce(x.owner_principal_id::text, 'none') USING ERRCODE = '42501'; END IF;
  IF x.state NOT IN ('open', 'escalated', 'unrouted', 'acknowledged') THEN RAISE EXCEPTION 'attention item rejected: item % is %; only a live item is suppressed', p_item, x.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'attention item rejected: a suppression carries a reason of at least 8 characters (no silent mute)' USING ERRCODE = '22023'; END IF;
  SELECT a.rules #> ARRAY['classes', x.signal_class, 'suppression'] INTO s FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
  IF s IS NULL OR NOT coalesce((s ->> 'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'attention item rejected: policy version % does not allow suppressing %', coalesce(x.policy_version::text, 'none'), x.signal_class USING ERRCODE = '22023';
  END IF;
  IF p_until IS NULL OR p_until <= v_at OR p_until > v_at + make_interval(hours => (s ->> 'max_hours')::int) THEN
    RAISE EXCEPTION 'attention item rejected: a suppression expires after now and within % hours (policy version %)', s ->> 'max_hours', x.policy_version USING ERRCODE = '22023';
  END IF;
  UPDATE executive.attention_items SET state = 'suppressed', suppressed_until = p_until, updated_at = v_at WHERE item_id = p_item;
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.suppressed', p_actor,
            jsonb_build_object('from_state', x.state, 'until', p_until, 'reason', btrim(p_reason), 'scope', 'item', 'policy_version', x.policy_version, 'max_hours', s -> 'max_hours'), p_correlation);
  RETURN jsonb_build_object('item_id', p_item, 'state', 'suppressed', 'from_state', x.state, 'until', p_until, 'reason', btrim(p_reason), 'by', p_actor);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.suppress_attention_item(uuid,uuid,uuid,timestamptz,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.suppress_attention_item(uuid,uuid,uuid,timestamptz,text,uuid,uuid) TO eye_commit;

-- CLOSE: the owner or a holder of a routed role, with a note (the closure criterion is the person's).
CREATE OR REPLACE FUNCTION executive.close_attention_item(p_item uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention item rejected: closed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention item rejected: no such item in this domain' USING ERRCODE = '23503'; END IF;
  IF NOT executive.may_act_on_item(x, p_actor) THEN RAISE EXCEPTION 'attention item rejected: item % is routed to % (owner %); the acting principal is neither', p_item, array_to_string(x.route_roles, ', '), coalesce(x.owner_principal_id::text, 'none') USING ERRCODE = '42501'; END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'attention item rejected: item % is already closed', p_item USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 4 THEN RAISE EXCEPTION 'attention item rejected: a closure carries a note of at least 4 characters' USING ERRCODE = '22023'; END IF;
  UPDATE executive.attention_items SET state = 'closed', closed_at = v_at, closed_by = p_actor, suppressed_until = NULL, updated_at = v_at WHERE item_id = p_item;
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('from_state', x.state, 'note', btrim(p_note)), p_correlation);
  RETURN jsonb_build_object('item_id', p_item, 'state', 'closed', 'from_state', x.state, 'closed_at', v_at, 'closed_by', p_actor);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.close_attention_item(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.close_attention_item(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ESCALATE-DUE: every overdue unacknowledged material item escalated (the class's escalation roles joined to its routes, the deadline
-- renewed, bounded by max_escalations under the item's own version); every lapsed suppression reopened. Deterministic and bounded
-- (≤ 200 per call). Driven by the attention subscriber at every delivery and by a person's route — there is no timer host (stated).
CREATE OR REPLACE FUNCTION executive.escalate_attention_due(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; r jsonb; v_at timestamptz := clock_timestamp(); v_esc jsonb := '[]'::jsonb; v_lapsed jsonb := '[]'::jsonb; v_exhausted jsonb := '[]'::jsonb; v_roles text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.escalate', 'executive.attention.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR x IN SELECT * FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'suppressed' AND i.suppressed_until <= v_at ORDER BY i.suppressed_until LIMIT 200 FOR UPDATE LOOP
    SELECT a.rules #> ARRAY['classes', x.signal_class] INTO r FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
    UPDATE executive.attention_items SET state = CASE WHEN x.acknowledged_at IS NULL THEN 'open' ELSE 'acknowledged' END, suppressed_until = NULL,
           due_at = CASE WHEN x.acknowledged_at IS NULL THEN v_at + make_interval(mins => coalesce((r ->> 'ack_within_minutes')::int, 60)) ELSE x.due_at END, updated_at = v_at
     WHERE item_id = x.item_id;
    PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.suppression_lapsed', p_actor, jsonb_build_object('until', x.suppressed_until), p_correlation);
    v_lapsed := v_lapsed || to_jsonb(x.item_id);
  END LOOP;
  FOR x IN SELECT * FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state IN ('open', 'escalated') AND i.due_at IS NOT NULL AND i.due_at <= v_at ORDER BY i.due_at LIMIT 200 FOR UPDATE LOOP
    SELECT a.rules #> ARRAY['classes', x.signal_class] INTO r FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
    IF x.escalations >= coalesce((r ->> 'max_escalations')::int, 0) THEN
      -- the escalation chain is exhausted: the item stays overdue and visible; nobody is paged again (recorded once per deadline)
      IF NOT EXISTS (SELECT 1 FROM executive.attention_item_events e WHERE e.item_id = x.item_id AND e.event = 'item.escalated' AND (e.details ->> 'exhausted')::boolean AND (e.details ->> 'due_at')::timestamptz = x.due_at) THEN
        PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.escalated', p_actor, jsonb_build_object('exhausted', true, 'due_at', x.due_at, 'escalations', x.escalations), p_correlation);
        v_exhausted := v_exhausted || to_jsonb(x.item_id);
      END IF;
      CONTINUE;
    END IF;
    SELECT ARRAY(SELECT DISTINCT unnest(x.route_roles || ARRAY(SELECT jsonb_array_elements_text(coalesce(r -> 'escalate_to_roles', '[]'::jsonb)))) ORDER BY 1) INTO v_roles;
    UPDATE executive.attention_items SET state = 'escalated', escalations = x.escalations + 1, route_roles = v_roles,
           due_at = v_at + make_interval(mins => coalesce((r ->> 'ack_within_minutes')::int, 60)), updated_at = v_at WHERE item_id = x.item_id;
    PERFORM executive.attention_event(x.item_id, p_tenant, p_domain, 'item.escalated', p_actor,
              jsonb_build_object('escalation', x.escalations + 1, 'missed_deadline', x.due_at, 'route_roles', to_jsonb(v_roles), 'policy_version', x.policy_version), p_correlation);
    v_esc := v_esc || to_jsonb(x.item_id);
  END LOOP;
  RETURN jsonb_build_object('escalated', v_esc, 'lapsed', v_lapsed, 'exhausted', v_exhausted, 'at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.escalate_attention_due(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.escalate_attention_due(uuid,uuid,uuid,uuid) TO eye_commit;

-- RE-EVALUATE: a live item judged again under the domain's ACTIVE version (a policy change); idempotent per version; a closed item is
-- history and is left alone; an acknowledged or suppressed item keeps its state and records the new outcome.
CREATE OR REPLACE FUNCTION executive.reevaluate_attention_item(p_item uuid, p_tenant uuid, p_domain uuid, p_cause_event_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('item_id', p_item, 'changed', false, 'note', 'no such item'); END IF;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  IF x.state = 'closed' OR pol.policy_id IS NULL OR x.policy_id IS NOT DISTINCT FROM pol.policy_id THEN
    RETURN jsonb_build_object('item_id', p_item, 'changed', false, 'state', x.state, 'policy_version', x.policy_version, 'note', CASE WHEN x.state = 'closed' THEN 'closed — history' ELSE 'already under the active version' END);
  END IF;
  v_eval := executive.evaluate_attention(pol.rules, x.signal_class, x.evaluation -> 'dimensions') || jsonb_build_object('policy_version', pol.version);
  IF x.state IN ('acknowledged', 'suppressed') THEN
    v_state := CASE WHEN v_eval ->> 'outcome' = 'material' THEN x.state ELSE 'deprioritized' END;
    v_route := jsonb_build_object('route_roles', to_jsonb(x.route_roles), 'due_at', x.due_at, 'escalations', x.escalations);
  ELSE
    v_route := executive.attention_route(pol.rules, x.signal_class, v_eval ->> 'outcome', x.owner_principal_id, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    -- An item ALREADY ROUTED (open, escalated, unrouted) that stays material keeps its escalation history: the count, the deadline it
    -- is running against and the roles it has reached (joined with the new version's) — a policy change never re-pages an exhausted
    -- chain from zero. Only a deprioritized item that becomes material is routed afresh.
    IF x.state IN ('open', 'escalated', 'unrouted') AND v_eval ->> 'outcome' = 'material' THEN
      v_state := CASE WHEN x.state = 'unrouted' THEN v_state ELSE x.state END;
      v_route := jsonb_build_object('route_roles', to_jsonb(ARRAY(SELECT DISTINCT unnest(x.route_roles || ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles'))) ORDER BY 1)),
                                    'due_at', coalesce(x.due_at::text, v_route ->> 'due_at'), 'escalations', greatest(x.escalations, coalesce((v_route ->> 'escalations')::int, 0)));
    END IF;
  END IF;
  UPDATE executive.attention_items
     SET outcome = v_eval ->> 'outcome', state = v_state, policy_id = pol.policy_id, policy_version = pol.version, evaluation = v_eval,
         route_roles = ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')),
         due_at = (v_route ->> 'due_at')::timestamptz, escalations = coalesce((v_route ->> 'escalations')::int, x.escalations),
         suppressed_until = CASE WHEN v_state = 'suppressed' THEN x.suppressed_until ELSE NULL END, updated_at = v_at
   WHERE item_id = p_item;
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.reevaluated', p_actor,
            jsonb_build_object('from_version', x.policy_version, 'to_version', pol.version, 'from_outcome', x.outcome, 'to_outcome', v_eval ->> 'outcome', 'from_state', x.state, 'to_state', v_state,
                               'reasons', v_eval -> 'reasons', 'cause_event_id', p_cause_event_id), p_correlation);
  RETURN jsonb_build_object('item_id', p_item, 'changed', true, 'from_version', x.policy_version, 'to_version', pol.version, 'from_outcome', x.outcome, 'to_outcome', v_eval ->> 'outcome', 'from_state', x.state, 'to_state', v_state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.reevaluate_attention_item(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.reevaluate_attention_item(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §6 SOURCE-HEALTH IMPACT MARKERS
-- ============================================================
CREATE TABLE observation.source_impact_markers (
  marker_id        uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  source_id        uuid NOT NULL,
  subject_kind     text NOT NULL CHECK (subject_kind IN ('forecast', 'warning', 'package')),
  subject_id       uuid NOT NULL,
  health_state     text NOT NULL CHECK (health_state IN ('degraded', 'failed', 'suspended', 'unknown')),
  reason           text,
  state            text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'cleared')),
  set_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  set_by_event     uuid NOT NULL,
  cleared_at       timestamptz,
  cleared_by_event uuid,
  cleared_state    text,
  correlation_id   uuid NOT NULL,
  CONSTRAINT sim_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sim_cleared_bound CHECK ((state = 'cleared') = (cleared_at IS NOT NULL) AND (cleared_at IS NULL) = (cleared_by_event IS NULL))
);
CREATE UNIQUE INDEX sim_one_active ON observation.source_impact_markers (tenant_id, domain_id, source_id, subject_kind, subject_id) WHERE state = 'active';
CREATE INDEX sim_subject ON observation.source_impact_markers (tenant_id, domain_id, subject_kind, subject_id, state);
COMMENT ON TABLE observation.source_impact_markers IS 'V03-T-077/-079 (0083): a derived product carrying the degraded health of a source it rests on — the issued forecasts of the source''s series, the open warnings on them, the packages whose current version cites them; set by the source-health subscriber on degraded | failed | suspended | unknown, cleared on healthy | active.';
ALTER TABLE observation.source_impact_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation.source_impact_markers FORCE ROW LEVEL SECURITY;
CREATE POLICY observation_isolation ON observation.source_impact_markers USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON observation.source_impact_markers TO eye_app, eye_commit;

-- The derived products of a source, as they stand: its series' issued forecasts, the raised/acknowledged warnings on them, the packages
-- (declared → monitoring, reopened) whose CURRENT version's options cite one of them.
CREATE OR REPLACE FUNCTION observation.source_derived_products(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS TABLE (subject_kind text, subject_id uuid, via text)
STABLE SECURITY DEFINER SET search_path = observation, prediction, decision, pg_catalog, pg_temp AS $$
  WITH src AS (SELECT DISTINCT c.source_key FROM observation.source_contracts_current c WHERE c.source_id = p_source_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain),
       f AS (SELECT fc.forecast_id, fc.series_key FROM prediction.forecasts_current fc JOIN prediction.series_registry sr ON sr.series_key = fc.series_key AND sr.tenant_id = fc.tenant_id AND sr.domain_id = fc.domain_id
              WHERE fc.tenant_id = p_tenant AND fc.domain_id = p_domain AND fc.state = 'issued' AND sr.source_key IN (SELECT source_key FROM src))
  SELECT 'forecast', f.forecast_id, 'series ' || f.series_key FROM f
  UNION ALL
  SELECT 'warning', w.warning_id, 'forecast ' || w.forecast_id::text FROM prediction.warnings_current w
   WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state IN ('raised', 'acknowledged') AND w.forecast_id IN (SELECT forecast_id FROM f)
  UNION ALL
  SELECT DISTINCT ON (p.package_id) 'package', p.package_id, 'option ' || o.key || ' cites forecast ' || (cs ->> 'id')
    FROM decision.packages_current p
    JOIN decision.options o ON o.package_id = p.package_id AND o.version = p.current_version
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.consequences) = 'array' THEN o.consequences ELSE '[]'::jsonb END) cs
   WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state NOT IN ('withdrawn', 'closed')
     AND (cs ->> 'id') IN (SELECT forecast_id::text FROM f);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION observation.source_derived_products(uuid, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.mark_source_impact(p_tenant uuid, p_domain uuid, p_source_id uuid, p_health_state text, p_reason text, p_event_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d record; v_set jsonb := '[]'::jsonb; v_kept jsonb := '[]'::jsonb; v_cleared jsonb := '[]'::jsonb; m observation.source_impact_markers%ROWTYPE; v_degraded boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source_health.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_health_state IS NULL OR p_health_state NOT IN ('healthy', 'active', 'degraded', 'failed', 'suspended', 'unknown') THEN
    RAISE EXCEPTION 'source impact rejected: % is not a source health state', coalesce(p_health_state, '<none>') USING ERRCODE = '22023';
  END IF;
  v_degraded := p_health_state IN ('degraded', 'failed', 'suspended', 'unknown');
  IF v_degraded THEN
    FOR d IN SELECT * FROM observation.source_derived_products(p_tenant, p_domain, p_source_id) LOOP
      SELECT * INTO m FROM observation.source_impact_markers x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.subject_kind = d.subject_kind AND x.subject_id = d.subject_id AND x.state = 'active';
      IF FOUND THEN v_kept := v_kept || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id); CONTINUE; END IF;
      INSERT INTO observation.source_impact_markers (marker_id, scope, tenant_id, domain_id, source_id, subject_kind, subject_id, health_state, reason, set_by_event, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, d.subject_kind, d.subject_id, p_health_state, p_reason, p_event_id, p_correlation);
      v_set := v_set || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id, 'via', d.via);
    END LOOP;
  ELSE
    FOR m IN SELECT * FROM observation.source_impact_markers x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.state = 'active' FOR UPDATE LOOP
      UPDATE observation.source_impact_markers SET state = 'cleared', cleared_at = clock_timestamp(), cleared_by_event = p_event_id, cleared_state = p_health_state WHERE marker_id = m.marker_id;
      v_cleared := v_cleared || jsonb_build_object('kind', m.subject_kind, 'id', m.subject_id);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('source_id', p_source_id, 'health_state', p_health_state, 'degraded', v_degraded, 'set', v_set, 'kept', v_kept, 'cleared', v_cleared);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.mark_source_impact(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.mark_source_impact(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §7 THE TRANSFORMATION PLAN
-- ============================================================
CREATE TABLE intelligence.plan_selections (
  selection_id     uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  outbox_event_id  uuid NOT NULL,
  evd_object_id    uuid NOT NULL,
  evd_version      int,
  source_id        uuid,
  acquisition_mode text,
  outcome          text NOT NULL CHECK (outcome IN ('selected', 'no_plan')),
  methods          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(methods) = 'array'),
  reason           text NOT NULL,
  selected_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  correlation_id   uuid NOT NULL,
  CONSTRAINT ips_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ips_once UNIQUE (outbox_event_id, evd_object_id),
  CONSTRAINT ips_outcome_methods CHECK ((outcome = 'selected') = (jsonb_array_length(methods) > 0))
);
CREATE INDEX ips_evd ON intelligence.plan_selections (tenant_id, domain_id, evd_object_id);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON intelligence.plan_selections FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE intelligence.plan_selections IS 'V03-T-291 flow 31.1 (0083): the transformation plan an ObservationRecorded selected — the ACTIVE extraction methods that read the evidence''s source (or any source) — or no_plan with the reason; the extraction run itself remains an agent''s governed act.';
ALTER TABLE intelligence.plan_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.plan_selections FORCE ROW LEVEL SECURITY;
CREATE POLICY intelligence_isolation ON intelligence.plan_selections USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON intelligence.plan_selections TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION intelligence.select_transformation_plan(p_tenant uuid, p_domain uuid, p_event_id uuid, p_evd uuid, p_evd_version int, p_source_id uuid, p_mode text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = intelligence, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s intelligence.plan_selections%ROWTYPE; v_methods jsonb; v_reason text; v_outcome text; v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.observation.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO s FROM intelligence.plan_selections x WHERE x.outbox_event_id = p_event_id AND x.evd_object_id = p_evd;
  IF FOUND THEN RETURN jsonb_build_object('selection_id', s.selection_id, 'repeated', true, 'outcome', s.outcome, 'methods', s.methods, 'reason', s.reason); END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_evd AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD') THEN
    RAISE EXCEPTION 'plan selection rejected: evidence % is not a record of this domain', p_evd USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('method_id', m.method_id, 'method_key', m.method_key, 'method_version', m.method_version, 'target_types', to_jsonb(m.target_types),
                                               'reads', CASE WHEN m.source_id IS NULL THEN 'any source' ELSE 'this source' END) ORDER BY m.method_key, m.method_version), '[]'::jsonb)
    INTO v_methods
    FROM intelligence.methods_current m
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.lifecycle_state = 'active' AND (m.source_id IS NULL OR m.source_id = p_source_id);
  IF jsonb_array_length(v_methods) > 0 THEN
    v_outcome := 'selected'; v_reason := format('%s active extraction method(s) read this source; the run is an extraction agent''s governed act', jsonb_array_length(v_methods));
  ELSE
    v_outcome := 'no_plan';
    v_reason := CASE WHEN EXISTS (SELECT 1 FROM intelligence.methods_current m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND (m.source_id IS NULL OR m.source_id = p_source_id))
                     THEN 'the methods that read this source are not active (draft, approved, suspended or retired)'
                     ELSE 'no extraction method of this domain reads this source' END;
  END IF;
  INSERT INTO intelligence.plan_selections (selection_id, scope, tenant_id, domain_id, outbox_event_id, evd_object_id, evd_version, source_id, acquisition_mode, outcome, methods, reason, actor_principal_id, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_event_id, p_evd, p_evd_version, p_source_id, p_mode, v_outcome, v_methods, v_reason, p_actor, p_correlation);
  RETURN jsonb_build_object('selection_id', v_id, 'repeated', false, 'outcome', v_outcome, 'methods', v_methods, 'reason', v_reason);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.select_transformation_plan(uuid,uuid,uuid,uuid,int,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.select_transformation_plan(uuid,uuid,uuid,uuid,int,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §8 THE POLICY CAUSE (L9-I05)
-- ============================================================
ALTER TABLE decision.package_events DROP CONSTRAINT package_events_event_check;
ALTER TABLE decision.package_events ADD CONSTRAINT package_events_event_check CHECK (event IN (
  'package.declared', 'version.opened', 'option.set', 'terms.set', 'choice.set', 'dissent.recorded', 'version.proposed',
  'review.recorded', 'version.approved', 'approval.revoked', 'version.rejected', 'package.committed', 'package.withdrawn',
  'outcome.recorded', 'package.closed', 'commit.refused', 'replay.recorded', 'condition.breached', 'review.overdue', 'input.invalidated', 'package.reopened',
  'policy.changed'));

-- The attention policy changed: a committed or monitored package is told, once per cause, which version stood at its commitment and
-- which stands now — the recorded cause decision.reopen_package admits (the owner decides; nothing is reopened here).
CREATE OR REPLACE FUNCTION decision.note_policy_changed(p_package_id uuid, p_tenant uuid, p_domain uuid, p_policy_id uuid, p_to_version int, p_details jsonb, p_outbox_event_id uuid, p_subscription_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; c decision.commitments%ROWTYPE; v_from int; v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR p.state NOT IN ('committed', 'monitoring') THEN RETURN jsonb_build_object('noted', false, 'note', 'not a committed or monitored package'); END IF;
  IF EXISTS (SELECT 1 FROM decision.package_events e WHERE e.package_id = p_package_id AND e.event = 'policy.changed' AND e.details ->> 'outbox_event_id' = p_outbox_event_id::text) THEN
    RETURN jsonb_build_object('noted', false, 'note', 'already noted for this cause');
  END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  SELECT a.version INTO v_from FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.effective_at <= c.committed_at ORDER BY a.effective_at DESC LIMIT 1;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'policy.changed', p_actor,
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('policy_id', p_policy_id, 'from_version', v_from, 'to_version', p_to_version, 'committed_version', p.committed_version,
                                                                 'committed_at', c.committed_at, 'outbox_event_id', p_outbox_event_id, 'subscription_id', p_subscription_id, 'automatic', true), p_correlation);
  RETURN jsonb_build_object('noted', true, 'note_id', v_id, 'from_version', v_from, 'to_version', p_to_version, 'committed_version', p.committed_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.note_policy_changed(uuid,uuid,uuid,uuid,int,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.note_policy_changed(uuid,uuid,uuid,uuid,int,jsonb,uuid,uuid,uuid,uuid) TO eye_commit;

-- decision.reopen_package: 0078's body with the third cause kind (policy_changed) — everything else as 0078 left it.
CREATE OR REPLACE FUNCTION decision.reopen_package(p_package_id uuid, p_tenant uuid, p_domain uuid, p_cause jsonb, p_known_at timestamp with time zone, p_observed_through date, p_actor uuid, p_event_id uuid, p_correlation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'decision', 'simulation', 'twin', 'prediction', 'objects', 'observation', 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE p decision.packages_current%ROWTYPE; cv decision.package_versions%ROWTYPE; c decision.commitments%ROWTYPE; n decision.package_events%ROWTYPE; b decision.condition_breaches%ROWTYPE;
        v_kind text; v_ref uuid; v_cause jsonb; v_exposed jsonb := '[]'::jsonb; v_next int; v_open int; opt record; d jsonb; v_carried jsonb := '[]'::jsonb; v_dropped jsonb := '[]'::jsonb;
        v_at timestamptz := clock_timestamp(); v_known timestamptz; v_obs date; v_err text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.reopen']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'reopen rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_cause IS NULL OR jsonb_typeof(p_cause) <> 'object' OR coalesce(p_cause ->> 'kind', '') NOT IN ('input_invalidated', 'condition_breach', 'policy_changed') OR coalesce(p_cause ->> 'ref', '') !~ '^[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'reopen rejected: a cause is a recorded input_invalidated note, a condition_breach or a policy_changed note of this package, named by its id ({kind, ref})' USING ERRCODE = '22023';
  END IF;
  v_kind := p_cause ->> 'kind'; v_ref := (p_cause ->> 'ref')::uuid;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'reopen rejected: the package owner reopens it' USING ERRCODE = '42501'; END IF;
  IF p.state = 'reopened' THEN RAISE EXCEPTION 'reopen rejected: package % is reopened with version % open; propose and commit it before reopening again', p_package_id, p.current_version USING ERRCODE = '22023'; END IF;
  IF p.state = 'closed' THEN RAISE EXCEPTION 'reopen rejected: package % is closed; a closed decision is not reopened — a new package is declared', p_package_id USING ERRCODE = '22023'; END IF;
  IF p.state NOT IN ('committed', 'monitoring') THEN RAISE EXCEPTION 'reopen rejected: package % is %, not committed — a decision is reopened from its commitment; a draft or a proposal is versioned', p_package_id, p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO cv FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p.committed_version;
  IF v_kind = 'input_invalidated' THEN
    SELECT * INTO n FROM decision.package_events e WHERE e.event_id = v_ref AND e.package_id = p_package_id AND e.event = 'input.invalidated';
    IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such note % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF n.occurred_at <= c.committed_at THEN RAISE EXCEPTION 'reopen rejected: no recorded cause — note % was recorded at %, before the commitment at %; what was known at the decision is not a cause to reopen it', v_ref, decision.iso(n.occurred_at), decision.iso(c.committed_at) USING ERRCODE = '22023'; END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', n.occurred_at, 'change_kind', n.details ->> 'change_kind', 'via', n.details -> 'via', 'failure_class', n.details ->> 'failure_class', 'disposition', n.details ->> 'disposition', 'note', n.details ->> 'note', 'outbox_event_id', n.details ->> 'outbox_event_id');
    v_exposed := coalesce(n.details -> 'via', '[]'::jsonb);
  ELSIF v_kind = 'policy_changed' THEN
    -- 0083 (B22; L9-I05's clause): the ATTENTION POLICY changed after the commitment — the note the attention subscriber recorded from
    -- AttentionPolicyChanged, carrying the version in force at the commitment and the version now in force. The same rule as a note:
    -- what was known at the decision is not a cause to reopen it.
    SELECT * INTO n FROM decision.package_events e WHERE e.event_id = v_ref AND e.package_id = p_package_id AND e.event = 'policy.changed';
    IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such policy note % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF n.occurred_at <= c.committed_at THEN RAISE EXCEPTION 'reopen rejected: no recorded cause — policy note % was recorded at %, before the commitment at %; the policy in force at the decision is not a cause to reopen it', v_ref, decision.iso(n.occurred_at), decision.iso(c.committed_at) USING ERRCODE = '22023'; END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', n.occurred_at, 'policy_id', n.details ->> 'policy_id', 'from_version', n.details -> 'from_version', 'to_version', n.details -> 'to_version',
                                  'changed_sections', n.details -> 'changed_sections', 'changed_classes', n.details -> 'changed_classes', 'outbox_event_id', n.details ->> 'outbox_event_id');
    v_exposed := jsonb_build_array(jsonb_build_object('kind', 'attention_policy', 'id', n.details ->> 'policy_id', 'from_version', n.details -> 'from_version', 'to_version', n.details -> 'to_version'));
  ELSE
    SELECT * INTO b FROM decision.condition_breaches x WHERE x.breach_id = v_ref AND x.package_id = p_package_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'reopen rejected: no such breach % on package %', v_ref, p_package_id USING ERRCODE = '23503'; END IF;
    IF b.version <> p.committed_version THEN RAISE EXCEPTION 'reopen rejected: no recorded cause — breach % is of version %, not the standing commitment (version %)', v_ref, b.version, p.committed_version USING ERRCODE = '22023'; END IF;
    v_cause := jsonb_build_object('kind', v_kind, 'ref', v_ref, 'recorded_at', b.detected_at, 'condition_index', b.condition_index, 'condition', b.condition, 'warning_id', b.warning_id, 'routed_to', b.routed_to);
    v_exposed := jsonb_build_array(jsonb_build_object('kind', 'warning', 'id', b.warning_id, 'condition_index', b.condition_index));
  END IF;
  SELECT count(*) INTO v_open FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.state = 'draft';
  IF v_open > 0 THEN RAISE EXCEPTION 'reopen rejected: the package already has an open draft; propose it or withdraw it' USING ERRCODE = '22023'; END IF;
  v_known := coalesce(p_known_at, v_at); v_obs := coalesce(p_observed_through, cv.observed_through);
  SELECT coalesce(max(version), 0) + 1 INTO v_next FROM decision.package_versions WHERE package_id = p_package_id;
  INSERT INTO decision.package_versions (package_id, version, scope, tenant_id, domain_id, supersedes, state, known_at, observed_through, objectives, constraints, approver_policy, monitoring_conditions,
                                         reversibility, information_value, second_order, risks, opportunities, author_principal_id, correlation_id)
  VALUES (p_package_id, v_next, 'DOMAIN', p_tenant, p_domain, p.committed_version, 'draft', v_known, v_obs, cv.objectives, cv.constraints, cv.approver_policy, cv.monitoring_conditions,
          cv.reversibility, cv.information_value, cv.second_order, cv.risks, cv.opportunities, p_actor, p_correlation);
  -- the tolerant carry: each committed option re-derived under the new cut-offs in its own block — dropped and named when it does not enter them
  FOR opt IN SELECT * FROM decision.options x WHERE x.package_id = p_package_id AND x.version = p.committed_version ORDER BY x.key LOOP
    BEGIN
      d := decision.derive_option(p_tenant, p_domain, v_known, v_obs, opt.consequences, opt.unsimulated_reason, format('reopen: carried option %s', opt.key));
      INSERT INTO decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason,
                                    uncertainty, second_order, risks, opportunities, reversibility, synthetic_state, controls, set_by, correlation_id)
      VALUES (gen_random_uuid(), opt.scope, opt.tenant_id, opt.domain_id, opt.package_id, v_next, opt.key, opt.title, opt.kind, opt.consequences, (d ->> 'simulated')::boolean,
              CASE WHEN (d ->> 'simulated')::boolean THEN NULL ELSE opt.unsimulated_reason END,
              d -> 'uncertainty', opt.second_order, opt.risks, opt.opportunities, opt.reversibility, (d ->> 'synthetic_state')::boolean, d -> 'controls', p_actor, p_correlation);
      v_carried := v_carried || to_jsonb(opt.key);
    EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '23503' THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_dropped := v_dropped || jsonb_build_object('key', opt.key, 'reason', v_err);
    END;
  END LOOP;
  UPDATE decision.packages_current
     SET state = 'reopened', current_version = v_next, reopened_at = v_at, reopened_by = p_actor, reopened_from_version = p.committed_version, reopen_cause = v_cause, reopens = reopens + 1
   WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.opened', p_actor,
          jsonb_build_object('version', v_next, 'supersedes', p.committed_version, 'known_at', v_known, 'observed_through', v_obs, 'carried_from', p.committed_version, 'carried_options_rederived', true, 'reopened', true), v_at, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.reopened', p_actor,
          jsonb_build_object('committed_version', p.committed_version, 'commitment_id', c.commitment_id, 'committed_at', c.committed_at, 'new_version', v_next, 'cause', v_cause, 'exposed_inputs', v_exposed,
                             'options_carried', v_carried, 'options_dropped', v_dropped, 'known_at', v_known, 'observed_through', v_obs, 'reopens', p.reopens + 1), p_correlation);
  RETURN jsonb_build_object('package_id', p_package_id, 'committed_version', p.committed_version, 'commitment_id', c.commitment_id, 'committed_at', c.committed_at, 'new_version', v_next, 'cause', v_cause,
                            'exposed_inputs', v_exposed, 'options_carried', v_carried, 'options_dropped', v_dropped, 'reopened_at', v_at, 'reopens', p.reopens + 1, 'known_at', v_known, 'observed_through', v_obs);
END $function$;

-- ============================================================
-- §9 THE INTERFACE REGISTER: L10-I05, L1-I03, L1-I04 and L2-I02 bound; L9-I05's clause delivered; the six that stay partial:
--    L1-I02, L3-I02, L4-I02, L7-I02, L10-I02, L10-I03
-- ============================================================
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0083',
  bound_to = 'AttentionPolicyChanged@v1 from POST …/executive/attention/policy/publish (executive.attention.policy.publish, human-gated → executive.publish_attention_policy): a new VERSION of the domain''s attention policy — per signal class (forecast.unfit, scenario.incoherent, warning.raised, source.coverage_loss, proposal.review) the materiality thresholds (min_consequence, min_confidence, max_hours_to_window), the route roles, the acknowledgement deadline, the escalation roles and bound, the suppression rule and the channel (in_app) — validated whole, set by a named human holding domain_admin, executive or platform_admin, superseding the active version (never rewritten), with the changed sections and classes; consumed by the attention subscriber (executive.attention.subscription.apply): every live attention item RE-EVALUATED under the new version and the policy cause NOTED on every committed or monitored package (L9-I05); the engine executive.evaluate_attention names the version every item was judged under'
  WHERE interface_id = 'L10-I05';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0083',
  bound_to = bound_to || '; B22 (0083): CONSUMED — the observations subscriber (intelligence.observation.subscription.apply) selects the TRANSFORMATION PLAN for each recorded evidence version (intelligence.select_transformation_plan: the active extraction methods that read its source, or no_plan with the reason; once per event and evidence; the run itself stays an extraction agent''s act); an event that is not the contract is QUARANTINED (invalid_event → human_review, never applied)'
  WHERE interface_id = 'L1-I03';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0083',
  bound_to = bound_to || '; B22 (0083): CONSUMED — the source-health subscriber (observation.source_health.subscription.apply) sets IMPACT MARKERS on the derived products (observation.mark_source_impact: the issued forecasts of the source''s series, the open warnings on them, the packages whose current version cites them) on degraded | failed | suspended | unknown and clears them on healthy | active, and routes the COVERAGE LOSS to its accountable roles under the attention policy (source.coverage_loss; NOT-10); both payload shapes read (the coverage evaluation''s new_state, the lifecycle transition''s state); an event that is not the contract is QUARANTINED'
  WHERE interface_id = 'L1-I04';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0083',
  bound_to = bound_to || '; B22 (0083): CONSUMED — the proposals subscriber (intelligence.proposal.subscription.apply) reads each proposed claim of ClaimsExtracted / IntelligenceObjectAdmitted and routes every claim HELD FOR REVIEW (a queued review case) to the review queue under the attention policy (proposal.review); a claim with no review required is recorded as such; nothing is promoted by the subscriber; an event that is not the contract is QUARANTINED'
  WHERE interface_id = 'L2-I02';
UPDATE objects.interface_register SET bound_to = replace(bound_to, 'a policy change has no recorded cause on a package (L10-I05, B22)',
  'B22 (0083): a POLICY CHANGE is a recorded cause — the attention subscriber notes policy.changed on every committed or monitored package from AttentionPolicyChanged (the version in force at the commitment and the version now in force; decision.note_policy_changed, once per cause) and decision.reopen_package admits the cause kind policy_changed (recorded after the commitment), DecisionReopened carrying the policy context')
  WHERE interface_id = 'L9-I05' AND bound_to LIKE '%a policy change has no recorded cause on a package (L10-I05, B22)%';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int; v_ok boolean; v_names text; v_l9 text;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound')
    INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  SELECT count(*) = 6 AND bool_and(interface_id = ANY (ARRAY['L1-I02','L3-I02','L4-I02','L7-I02','L10-I02','L10-I03']))
    INTO v_ok FROM objects.interface_register WHERE binding_state = 'partial';
  SELECT string_agg(interface_id, ',' ORDER BY layer, interface_id) INTO v_names FROM objects.interface_register WHERE binding_state = 'partial';
  IF (v_bound, v_partial, v_unbound) <> (44, 6, 0) OR v_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B22 (0083): the interface register reads %/%/% (bound/partial/unbound; partial: %); 44/6/0 with the six named rows expected', v_bound, v_partial, v_unbound, v_names;
  END IF;
  SELECT bound_to INTO v_l9 FROM objects.interface_register WHERE interface_id = 'L9-I05';
  IF v_l9 NOT LIKE '%a POLICY CHANGE is a recorded cause%' THEN RAISE EXCEPTION 'B22 (0083): L9-I05''s package-cause clause was not rewritten'; END IF;
END $$;
