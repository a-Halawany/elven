-- 0063_graph_subscriptions.sql — CP-6 batch B6: GraphChanged / MemoryCorrected subscriptions and consumers.
--
-- Acceptance unit AU-MEM-0030, in full: "Graph and memory changes publish a GraphChanged/MemoryCorrected
-- event with affected identities, relationships, temporal scopes and subscriptions, and consumers
-- (twins, forecasts, scenarios, decisions, retrieval, memory mappings) are updated through durable
-- workflows without an operator-initiated walk." (V0 C-009/C-017/V00-T-045; V8 JRN-04; V2 V02-T-129;
-- V3 L4-C08/L4-I03; V5 AI-29-005/AI-45-005.)
--
-- Until now a graph write published, at most, a count (EntityResolved, EntitySplit, DependencyInvalidated)
-- to a queue nothing consumed; edges, retractions and strategy declarations published nothing; and the
-- one durable workflow (0060) walked evidence corrections alone. This migration adds:
--
--   §1  SIX SUBSCRIBER ROLES — one per consumer kind, each holding exactly its own apply action and
--       nothing else (the 0044/0060 discipline: one role per agent kind). The one Phase 0 touch.
--   §2  THE SUBSCRIPTION REGISTRY graph.subscriptions — per domain and consumer kind, a grant (an agent
--       principal, a human owner, budgets, revocable, pausable) that is also a CURSOR (the checkpoint of
--       the last outbox event applied in order). Durable, audited, replayable.
--   §3  THE DELIVERY LEDGER graph.subscription_deliveries keyed by (outbox event id, subscription id):
--       received → applied | failed (infrastructure, re-driven) | refused (governance, re-driven only by a
--       registration, a resume or a replay); a per-ITEM checkpoint committed with each consumer effect,
--       locked FOR UPDATE inside the effect's own transaction (the 0060 shape), so a redelivery, a restart
--       or a second worker never applies an item twice; the checkpoint advanced by the database when the
--       applied prefix is contiguous. Reconciliation re-drives every non-terminal delivery (the 0062
--       lesson from the start) AND scans published rows without a delivery inside a bounded look-back,
--       so an out-of-order publication past the checkpoint is never lost.
--   §4  WHAT EACH CONSUMER MAY DO — bounded, idempotent at the port, reporting and never deciding:
--       twins mark citing or boundary-bound versions UNVERIFIED (once per cause); forecasts are marked for
--       attention (once); scenarios gain an attention state (once); decision packages record an
--       input.invalidated event (once per cause) and are never re-decided; retrieval re-verifies the graph
--       projections and records the check (a mismatch is operator work, never a rewrite); memory
--       mappings are PROPOSED for reconciliation and decided by a person through the resolution
--       manager's authority — identifiers are append-only and a merge/split judgement stays human.
--
-- Forward only. No port is added to identity/tenancy/policy/audit/objects/ctx/canon/config (C14).

-- ============================================================
-- §1 Roles.
-- ============================================================
INSERT INTO identity.roles (code, scope, description) VALUES
  ('twin_subscriber', 'DOMAIN', 'Twin subscriber (bounded agent) — on a graph or memory change, marks the citing or boundary-bound twin versions unverified; nothing else.'),
  ('forecast_subscriber', 'DOMAIN', 'Forecast subscriber (bounded agent) — on a graph or memory change, marks the affected issued forecasts for attention; nothing else.'),
  ('scenario_subscriber', 'DOMAIN', 'Scenario subscriber (bounded agent) — on a graph or memory change, marks the affected active scenarios for attention; nothing else.'),
  ('decision_subscriber', 'DOMAIN', 'Decision subscriber (bounded agent) — on a graph or memory change, records an invalidated input on the affected decision packages; never changes a package state.'),
  ('retrieval_subscriber', 'DOMAIN', 'Retrieval subscriber (bounded agent) — on a graph or memory change, re-verifies the graph projections retrieval reads and records the check; never rewrites a projection.'),
  ('mapping_subscriber', 'DOMAIN', 'Memory-mapping subscriber (bounded agent) — on a graph or memory change, proposes identifier and edge reconciliations for a person to decide; never re-points a mapping.')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- §2 The registry.
-- ============================================================
CREATE TABLE graph.subscriptions (
  subscription_id       uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  consumer_kind         text NOT NULL CHECK (consumer_kind IN ('twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings')),
  event_types           text[] NOT NULL CHECK (event_types <@ ARRAY['GraphChanged', 'MemoryCorrected'] AND cardinality(event_types) >= 1),
  filter                jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filter) = 'object'),
  principal_id          uuid NOT NULL UNIQUE,                      -- identity.principals, kind='agent', the kind's role
  consumer_version      text NOT NULL CHECK (consumer_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  code_digest           text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  owner_principal_id    uuid NOT NULL,                             -- the accountable human
  budgets               jsonb NOT NULL CHECK (jsonb_typeof(budgets) = 'object'
                          AND budgets ? 'max_items_per_event' AND budgets ? 'max_elapsed_ms'
                          AND coalesce(budgets ->> 'backlog_policy', 'leave') IN ('replay', 'leave')),
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked')),
  checkpoint_created_at timestamptz,                               -- the last outbox row applied in order …
  checkpoint_event_id   uuid,                                      -- … and its id (the pair is the cursor)
  replay_seq            int NOT NULL DEFAULT 0 CHECK (replay_seq >= 0),
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  paused_at             timestamptz,
  revoked_at            timestamptz,
  correlation_id        uuid NOT NULL,
  CONSTRAINT gsub_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gsub_revoked_has_time CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CONSTRAINT gsub_paused_has_time CHECK (status <> 'paused' OR paused_at IS NOT NULL),
  CONSTRAINT gsub_checkpoint_pair CHECK ((checkpoint_created_at IS NULL) = (checkpoint_event_id IS NULL))
);
CREATE UNIQUE INDEX gsub_one_live_per_kind ON graph.subscriptions (tenant_id, domain_id, consumer_kind) WHERE status <> 'revoked';

CREATE TABLE graph.subscription_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  subscription_id    uuid NOT NULL REFERENCES graph.subscriptions(subscription_id),
  event              text NOT NULL CHECK (event IN ('subscription.registered', 'subscription.paused', 'subscription.resumed', 'subscription.revoked', 'subscription.replayed', 'checkpoint.advanced')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gsube_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gsube_subscription ON graph.subscription_events (subscription_id, occurred_at);
CREATE TRIGGER gsube_append_only BEFORE UPDATE OR DELETE ON graph.subscription_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- §3 The delivery ledger.
-- ============================================================
CREATE TABLE graph.subscription_deliveries (
  event_id           uuid NOT NULL,                                -- objects.object_outbox.id (= the queue job id)
  subscription_id    uuid NOT NULL REFERENCES graph.subscriptions(subscription_id),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  consumer_kind      text NOT NULL,
  event_type         text NOT NULL CHECK (event_type IN ('GraphChanged', 'MemoryCorrected')),
  change_kind        text NOT NULL,
  outbox_created_at  timestamptz NOT NULL,                         -- the cursor's ordinal
  state              text NOT NULL CHECK (state IN ('received', 'applied', 'failed', 'refused')),
  deliveries         int  NOT NULL DEFAULT 1 CHECK (deliveries >= 1),   -- every time the job was handed to a worker
  attempts           int  NOT NULL DEFAULT 0 CHECK (attempts >= 0),     -- every time an apply was begun
  principal_id       uuid,
  items              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),          -- the consumer's resolved work list, set once
  items_applied      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items_applied) = 'array'),  -- [{item, effect_ref, effect, at}]
  last_error         text,
  first_received_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_delivered_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at        timestamptz,
  replay_seq         int NOT NULL DEFAULT 0,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (event_id, subscription_id),
  CONSTRAINT gsd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gsd_finished CHECK ((state IN ('applied', 'failed', 'refused')) = (finished_at IS NOT NULL))
);
CREATE INDEX gsd_subscription_order ON graph.subscription_deliveries (subscription_id, outbox_created_at, event_id);
CREATE INDEX gsd_state ON graph.subscription_deliveries (tenant_id, domain_id, state);

CREATE TABLE graph.subscription_delivery_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  outbox_event_id    uuid NOT NULL,
  subscription_id    uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('received', 'applying', 'item.applied', 'applied', 'failed', 'refused', 'replayed')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gsde_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  FOREIGN KEY (outbox_event_id, subscription_id) REFERENCES graph.subscription_deliveries(event_id, subscription_id)
);
CREATE INDEX gsde_delivery ON graph.subscription_delivery_events (outbox_event_id, subscription_id, occurred_at);
CREATE TRIGGER gsde_append_only BEFORE UPDATE OR DELETE ON graph.subscription_delivery_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- The retrieval consumer's record of a projection verification after a change (append-only).
CREATE TABLE graph.retrieval_checks (
  check_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  outbox_event_id    uuid NOT NULL,
  subscription_id    uuid NOT NULL REFERENCES graph.subscriptions(subscription_id),
  touched            jsonb NOT NULL DEFAULT '{}'::jsonb,           -- the identities/relationships the change named
  projections        jsonb NOT NULL,                                -- [{projection, live_rows, rebuilt_rows, mismatched}]
  mismatched         int NOT NULL CHECK (mismatched >= 0),
  checked_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  checked_by         uuid NOT NULL,
  correlation_id     uuid NOT NULL,
  CONSTRAINT grc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX grc_event ON graph.retrieval_checks (outbox_event_id, subscription_id);
CREATE TRIGGER grc_append_only BEFORE UPDATE OR DELETE ON graph.retrieval_checks
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- The memory-mapping consumer's PROPOSALS: an identifier, edge or resolution whose basis moved, for a person to decide.
CREATE TABLE graph.mapping_reconciliations (
  reconciliation_id  uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  subject_kind       text NOT NULL CHECK (subject_kind IN ('identifier', 'edge', 'resolution')),
  subject_id         uuid NOT NULL,
  from_entity_id     uuid,
  to_entity_id       uuid,
  basis              text NOT NULL CHECK (length(btrim(basis)) >= 8),
  cause_event_id     uuid NOT NULL,                                -- the outbox event that raised it
  subscription_id    uuid NOT NULL REFERENCES graph.subscriptions(subscription_id),
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'accepted', 'rejected')),
  proposed_by        uuid NOT NULL,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gmr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gmr_decided CHECK ((state = 'proposed') = (decided_at IS NULL)),
  CONSTRAINT gmr_decision_explained CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND length(btrim(decision_reason)) >= 8))
);
CREATE UNIQUE INDEX gmr_one_per_cause ON graph.mapping_reconciliations (subject_kind, subject_id, cause_event_id);
CREATE INDEX gmr_open ON graph.mapping_reconciliations (tenant_id, domain_id, state);

-- Row-level security and read grants, exactly as every graph table (0024 §RLS, 0060).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscriptions', 'subscription_events', 'subscription_deliveries', 'subscription_delivery_events', 'retrieval_checks', 'mapping_reconciliations'] LOOP
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

-- Scenarios gain an attention state (the forecast precedent, 0029:135-136); the vocabularies gain one event each.
ALTER TABLE prediction.scenarios_current
  ADD COLUMN attention_state  text NOT NULL DEFAULT 'none' CHECK (attention_state IN ('none', 'input_unverified')),
  ADD COLUMN attention_reason text;
ALTER TABLE prediction.scenario_events DROP CONSTRAINT scenario_events_event_check;
ALTER TABLE prediction.scenario_events ADD CONSTRAINT scenario_events_event_check CHECK (event IN (
  'scenario.declared', 'branch.added', 'branch.flipped', 'branch.closed', 'scenario.closed', 'scenario.attention'));
ALTER TABLE decision.package_events DROP CONSTRAINT package_events_event_check;
ALTER TABLE decision.package_events ADD CONSTRAINT package_events_event_check CHECK (event IN (
  'package.declared', 'version.opened', 'option.set', 'terms.set', 'choice.set', 'dissent.recorded', 'version.proposed',
  'review.recorded', 'version.approved', 'approval.revoked', 'version.rejected', 'package.committed', 'package.withdrawn',
  'outcome.recorded', 'package.closed', 'commit.refused', 'replay.recorded', 'condition.breached', 'review.overdue', 'input.invalidated'));

-- ============================================================
-- §4 Registration, control and the subscriber's own session (commit / identity authorities).
-- ============================================================
CREATE OR REPLACE FUNCTION graph.register_subscription(
  p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_consumer_kind text, p_event_types text[], p_filter jsonb,
  p_principal uuid, p_version text, p_code_digest text, p_owner uuid, p_budgets jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text;
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
  INSERT INTO graph.subscriptions (subscription_id, scope, tenant_id, domain_id, consumer_kind, event_types, filter, principal_id, consumer_version, code_digest, owner_principal_id, budgets, created_by, correlation_id)
  VALUES (p_subscription_id, 'DOMAIN', p_tenant, p_domain, p_consumer_kind, p_event_types, coalesce(p_filter, '{}'::jsonb), p_principal, p_version, p_code_digest, p_owner, p_budgets, p_actor, p_correlation);
  INSERT INTO graph.subscription_events (event_id, scope, tenant_id, domain_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_subscription_id, 'subscription.registered', p_actor,
          jsonb_build_object('consumer_kind', p_consumer_kind, 'event_types', to_jsonb(p_event_types), 'filter', coalesce(p_filter, '{}'::jsonb), 'principal_id', p_principal,
                             'version', p_version, 'code_digest', p_code_digest, 'owner', p_owner, 'budgets', p_budgets), p_correlation);
  RETURN jsonb_build_object('subscription_id', p_subscription_id, 'consumer_kind', p_consumer_kind, 'principal_id', p_principal, 'version', p_version, 'code_digest', p_code_digest, 'budgets', p_budgets);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.register_subscription(uuid,uuid,uuid,text,text[],jsonb,uuid,text,text,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.register_subscription(uuid,uuid,uuid,text,text[],jsonb,uuid,text,text,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.set_subscription_status(
  p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_to text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS text
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.subscriptions%ROWTYPE; v_event text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.subscription.control']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_to NOT IN ('active', 'paused', 'revoked') THEN RAISE EXCEPTION 'subscription status is active, paused or revoked' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM graph.subscriptions WHERE subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription control rejected: no subscription % in this domain', p_subscription_id USING ERRCODE = '23503'; END IF;
  IF s.status = 'revoked' THEN RAISE EXCEPTION 'subscription control rejected: a revoked subscription never returns; register a new one' USING ERRCODE = '23503'; END IF;
  IF s.status = p_to THEN RETURN s.status; END IF;
  v_event := CASE p_to WHEN 'paused' THEN 'subscription.paused' WHEN 'active' THEN 'subscription.resumed' ELSE 'subscription.revoked' END;
  UPDATE graph.subscriptions
     SET status = p_to,
         paused_at = CASE WHEN p_to = 'paused' THEN clock_timestamp() ELSE paused_at END,
         revoked_at = CASE WHEN p_to = 'revoked' THEN clock_timestamp() ELSE NULL END
   WHERE subscription_id = p_subscription_id;
  INSERT INTO graph.subscription_events (event_id, scope, tenant_id, domain_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_subscription_id, v_event, p_actor, jsonb_build_object('reason', p_reason, 'from', s.status), p_correlation);
  RETURN p_to;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.set_subscription_status(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.set_subscription_status(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- The subscriber's own session — the 0060 shape over graph.subscriptions (identity-operation context; the grant
-- active; the consumer's version and digest as registered; the principal an active agent), extended only by progress.
CREATE OR REPLACE FUNCTION graph.subscription_session_open(
  p_session uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_version text, p_code_digest text,
  p_refresh_hash text, p_context_key_hash text, p_expires_at timestamptz, p_family uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = graph, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.subscriptions%ROWTYPE; v_kind text; v_status text;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'subscriber session denied: identity operation capability required (context is %)', public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM graph.subscriptions WHERE subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscriber session denied: no such subscription in this domain' USING ERRCODE = '42501'; END IF;
  IF s.status <> 'active' THEN RAISE EXCEPTION 'subscriber session denied: the subscription is %', s.status USING ERRCODE = '42501'; END IF;
  IF s.consumer_version IS DISTINCT FROM p_version OR s.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'subscriber session denied: consumer instance or code digest does not match the registration' USING ERRCODE = '42501';
  END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = s.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'subscriber session denied: principal is not an active agent principal' USING ERRCODE = '42501';
  END IF;
  PERFORM identity.session_open(p_session, s.principal_id, 'agent_grant', p_refresh_hash, p_context_key_hash, p_expires_at, p_family);
  RETURN s.principal_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_session_open(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_session_open(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) TO eye_identity;

CREATE OR REPLACE FUNCTION graph.subscription_session_extend(
  p_session uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_version text, p_code_digest text, p_expires_at timestamptz
) RETURNS timestamptz
SECURITY DEFINER SET search_path = graph, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE sub graph.subscriptions%ROWTYPE; s identity.sessions%ROWTYPE; v_kind text; v_status text; v_new timestamptz;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'subscriber session extension denied: identity operation capability required (context is %)', public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at > clock_timestamp() + interval '1 day' THEN
    RAISE EXCEPTION 'subscriber session extension denied: an extension is bounded to one day ahead' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO sub FROM graph.subscriptions WHERE subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscriber session extension denied: no such subscription in this domain' USING ERRCODE = '42501'; END IF;
  IF sub.status <> 'active' THEN RAISE EXCEPTION 'subscriber session extension denied: the subscription is %', sub.status USING ERRCODE = '42501'; END IF;
  IF sub.consumer_version IS DISTINCT FROM p_version OR sub.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'subscriber session extension denied: consumer instance or code digest does not match the registration' USING ERRCODE = '42501';
  END IF;
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = sub.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'subscriber session extension denied: principal is not an active agent principal' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM identity.sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR s.principal_id <> sub.principal_id OR s.assurance <> 'agent_grant' THEN
    RAISE EXCEPTION 'subscriber session extension denied: no such run session for this subscriber' USING ERRCODE = '42501';
  END IF;
  IF s.status <> 'active' OR s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'subscriber session extension denied: the run session is no longer active' USING ERRCODE = '42501';
  END IF;
  v_new := greatest(s.expires_at, p_expires_at);
  UPDATE identity.sessions SET expires_at = v_new WHERE id = p_session;
  RETURN v_new;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_session_extend(uuid,uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_session_extend(uuid,uuid,uuid,uuid,text,text,timestamptz) TO eye_identity;

-- What is subscribed to a change at PUBLICATION time — evidence carried by the event, never authority: the consumer
-- re-resolves at delivery. Total: outside a DOMAIN context it answers an empty list rather than refusing the write.
CREATE OR REPLACE FUNCTION graph.subscriptions_matching(p_tenant uuid, p_domain uuid, p_event_type text, p_change_kind text)
RETURNS jsonb
SECURITY DEFINER SET search_path = graph, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF public.eye_scope() IS DISTINCT FROM 'DOMAIN' OR public.eye_tenant() IS DISTINCT FROM p_tenant OR public.eye_domain() IS DISTINCT FROM p_domain THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('subscription_id', s.subscription_id, 'consumer_kind', s.consumer_kind) ORDER BY s.consumer_kind), '[]'::jsonb) INTO v
    FROM graph.subscriptions s
   WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.status = 'active'
     AND p_event_type = ANY (s.event_types)
     AND (NOT (s.filter ? 'change_kinds') OR s.filter -> 'change_kinds' ? p_change_kind);
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscriptions_matching(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscriptions_matching(uuid,uuid,text,text) TO eye_commit;

-- ============================================================
-- §5 The delivery ledger's ports, OUTSIDE the subscriber's authority (a refused grant is still recorded):
--    under the scheduler's bounded machine capability, the 0060 shape.
-- ============================================================
-- Fan-out: one delivery row per active subscription the event matches (or the one named by a replay).
CREATE OR REPLACE FUNCTION graph.subscription_delivery_receive(
  p_event_id uuid, p_tenant uuid, p_domain uuid, p_event_type text, p_change_kind text, p_outbox_created_at timestamptz,
  p_only_subscription uuid, p_replay_seq int, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.subscriptions%ROWTYPE; d graph.subscription_deliveries%ROWTYPE; v_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_tenant IS NULL OR p_domain IS NULL OR p_event_id IS NULL OR p_event_type NOT IN ('GraphChanged', 'MemoryCorrected') THEN
    RAISE EXCEPTION 'subscription delivery requires a scoped GraphChanged or MemoryCorrected event' USING ERRCODE = '23514';
  END IF;
  FOR s IN SELECT * FROM graph.subscriptions x
            WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'active'
              AND p_event_type = ANY (x.event_types)
              AND (NOT (x.filter ? 'change_kinds') OR x.filter -> 'change_kinds' ? p_change_kind)
              AND (p_only_subscription IS NULL OR x.subscription_id = p_only_subscription)
            ORDER BY x.consumer_kind LOOP
    INSERT INTO graph.subscription_deliveries (event_id, subscription_id, scope, tenant_id, domain_id, consumer_kind, event_type, change_kind, outbox_created_at, state, deliveries, attempts, principal_id, replay_seq, correlation_id)
    VALUES (p_event_id, s.subscription_id, 'DOMAIN', p_tenant, p_domain, s.consumer_kind, p_event_type, p_change_kind, p_outbox_created_at, 'received', 1, 0, s.principal_id, coalesce(p_replay_seq, 0), p_correlation)
    ON CONFLICT (event_id, subscription_id) DO UPDATE
       SET deliveries = graph.subscription_deliveries.deliveries + 1,
           last_delivered_at = clock_timestamp(),
           -- a terminal APPLIED delivery is never reopened by a redelivery; a failed, refused or interrupted one is
           state = CASE WHEN graph.subscription_deliveries.state = 'applied' THEN 'applied' ELSE 'received' END,
           finished_at = CASE WHEN graph.subscription_deliveries.state = 'applied' THEN graph.subscription_deliveries.finished_at ELSE NULL END,
           principal_id = s.principal_id
    RETURNING * INTO d;
    INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, s.subscription_id, 'received', NULL,
            jsonb_build_object('delivery', d.deliveries, 'state', d.state, 'replay_seq', d.replay_seq), p_correlation);
    v_out := v_out || jsonb_build_object(
      'subscription_id', s.subscription_id, 'consumer_kind', s.consumer_kind, 'principal_id', s.principal_id,
      'consumer_version', s.consumer_version, 'code_digest', s.code_digest, 'budgets', s.budgets,
      'state', d.state, 'deliveries', d.deliveries, 'attempts', d.attempts, 'items', d.items, 'items_applied', d.items_applied, 'replay_seq', d.replay_seq);
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_delivery_receive(uuid,uuid,uuid,text,text,timestamptz,uuid,int,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_delivery_receive(uuid,uuid,uuid,text,text,timestamptz,uuid,int,uuid) TO eye_commit;

-- The consumer's resolved work list, set once under the subscriber's own action at its first apply (a later delivery
-- resumes the same list; an empty list is a complete delivery with nothing to do).
CREATE OR REPLACE FUNCTION graph.subscription_delivery_items(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_items jsonb, p_action text)
RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d graph.subscription_deliveries%ROWTYPE;
BEGIN
  IF p_action NOT IN ('twin.subscription.apply', 'prediction.forecast.subscription.apply', 'prediction.scenario.subscription.apply',
                      'decision.subscription.apply', 'graph.retrieval.subscription.apply', 'graph.mapping.subscription.apply') THEN
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
REVOKE ALL ON FUNCTION graph.subscription_delivery_items(uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_delivery_items(uuid,uuid,uuid,uuid,jsonb,text) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.subscription_delivery_finish(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_error text)
RETURNS text
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d graph.subscription_deliveries%ROWTYPE; s graph.subscriptions%ROWTYPE; v_state text; v_n int; v_done int; v_error text := p_error; v_advanced boolean := false;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_outcome NOT IN ('applied', 'failed', 'refused') THEN RAISE EXCEPTION 'delivery outcome is applied, failed or refused' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM graph.subscription_deliveries WHERE event_id = p_event_id AND subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery finish rejected: no delivery for event % to subscription %', p_event_id, p_subscription_id USING ERRCODE = '23503'; END IF;
  IF d.state = 'applied' THEN RETURN d.state; END IF;   -- terminal already; a late finish changes nothing
  IF p_outcome = 'applied' THEN
    v_n := jsonb_array_length(d.items); v_done := jsonb_array_length(d.items_applied);
    -- THE DATABASE DECIDES: applied only when every resolved item was applied.
    v_state := CASE WHEN v_done < v_n THEN 'failed' ELSE 'applied' END;
    IF v_done < v_n THEN v_error := format('%s of %s item(s) applied; the rest were not', v_done, v_n); END IF;
  ELSE
    v_state := p_outcome;
  END IF;
  UPDATE graph.subscription_deliveries SET state = v_state, last_error = left(v_error, 500), finished_at = clock_timestamp()
   WHERE event_id = p_event_id AND subscription_id = p_subscription_id;
  INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, p_subscription_id, v_state, d.principal_id,
          jsonb_build_object('error', left(v_error, 500), 'attempts', d.attempts, 'deliveries', d.deliveries, 'items', jsonb_array_length(d.items), 'items_applied', jsonb_array_length(d.items_applied)), d.correlation_id);
  -- THE CHECKPOINT ADVANCES ONLY OVER A CONTIGUOUS APPLIED PREFIX: an earlier delivery of this subscription still
  -- open holds the cursor where it is (visible in status), so a replay from the cursor loses nothing.
  IF v_state = 'applied' THEN
    SELECT * INTO s FROM graph.subscriptions WHERE subscription_id = p_subscription_id FOR UPDATE;
    IF (s.checkpoint_created_at IS NULL OR (d.outbox_created_at, d.event_id) > (s.checkpoint_created_at, s.checkpoint_event_id))
       AND NOT EXISTS (SELECT 1 FROM graph.subscription_deliveries e
                        WHERE e.subscription_id = p_subscription_id AND e.state <> 'applied'
                          AND (e.outbox_created_at, e.event_id) < (d.outbox_created_at, d.event_id)) THEN
      UPDATE graph.subscriptions SET checkpoint_created_at = d.outbox_created_at, checkpoint_event_id = d.event_id WHERE subscription_id = p_subscription_id;
      INSERT INTO graph.subscription_events (event_id, scope, tenant_id, domain_id, subscription_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_subscription_id, 'checkpoint.advanced', d.principal_id,
              jsonb_build_object('event_id', d.event_id, 'outbox_created_at', d.outbox_created_at), d.correlation_id);
      v_advanced := true;
    END IF;
  END IF;
  RETURN v_state;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_delivery_finish(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_delivery_finish(uuid,uuid,uuid,uuid,text,text) TO eye_commit;

-- ============================================================
-- §6 The per-item checkpoint, INSIDE the consumer effect's own transaction under the subscriber's authority.
--    The port takes the kind's action so a capability of another kind cannot drive it.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.subscription_item_begin(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_item text, p_action text)
RETURNS boolean
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d graph.subscription_deliveries%ROWTYPE;
BEGIN
  IF p_action NOT IN ('twin.subscription.apply', 'prediction.forecast.subscription.apply', 'prediction.scenario.subscription.apply',
                      'decision.subscription.apply', 'graph.retrieval.subscription.apply', 'graph.mapping.subscription.apply') THEN
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
REVOKE ALL ON FUNCTION graph.subscription_item_begin(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_item_begin(uuid,uuid,uuid,uuid,text,text) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.subscription_item_done(p_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_item text, p_action text, p_effect text, p_effect_ref uuid, p_details jsonb)
RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d graph.subscription_deliveries%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO d FROM graph.subscription_deliveries WHERE event_id = p_event_id AND subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND OR d.state <> 'received' THEN RAISE EXCEPTION 'subscription item rejected: delivery of event % to subscription % is not being applied', p_event_id, p_subscription_id USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d.items_applied) w WHERE w ->> 'item' = p_item) THEN
    RAISE EXCEPTION 'subscription item rejected: % was already applied for this delivery', p_item USING ERRCODE = '23505';
  END IF;
  UPDATE graph.subscription_deliveries
     SET items_applied = items_applied || jsonb_build_object('item', p_item, 'effect', p_effect, 'effect_ref', p_effect_ref, 'details', coalesce(p_details, '{}'::jsonb), 'at', clock_timestamp())
   WHERE event_id = p_event_id AND subscription_id = p_subscription_id;
  INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_event_id, p_subscription_id, 'item.applied', public.eye_principal(),
          jsonb_build_object('item', p_item, 'effect', p_effect, 'effect_ref', p_effect_ref) || coalesce(p_details, '{}'::jsonb), d.correlation_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_item_done(uuid,uuid,uuid,uuid,text,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_item_done(uuid,uuid,uuid,uuid,text,text,text,uuid,jsonb) TO eye_commit;

-- ============================================================
-- §7 What a cold process must serve and re-drive (schedule capability; read-only).
-- ============================================================
CREATE OR REPLACE FUNCTION graph.subscription_domains_to_serve()
RETURNS TABLE (tenant_id uuid, domain_id uuid, subscriptions int)
SECURITY DEFINER SET search_path = graph, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY SELECT s.tenant_id, s.domain_id, count(*)::int FROM graph.subscriptions s WHERE s.status = 'active' GROUP BY s.tenant_id, s.domain_id ORDER BY s.tenant_id, s.domain_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_domains_to_serve() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_domains_to_serve() TO eye_commit;

-- Every published event of a subscribed type, in a served domain, that has NO delivery to an active subscription it
-- matches or a NON-TERMINAL one (received: never applied or interrupted mid-apply; failed: infrastructure) — past the
-- subscription's checkpoint OR inside the look-back (a row published out of order behind the checkpoint is not lost).
-- 'refused' (governance) rows are included only when asked (a registration, a resume, a replay). The 0062 lesson,
-- from the start: nothing non-terminal is ever left stranded.
CREATE OR REPLACE FUNCTION graph.subscription_deliveries_to_reconcile(p_include_refused boolean, p_lookback interval)
RETURNS TABLE (tenant_id uuid, domain_id uuid, event_id uuid, event_type text, change_kind text, outbox_created_at timestamptz, correlation_id uuid, causation_id uuid, subscription_id uuid, delivery_state text)
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT s.tenant_id, s.domain_id, x.id, x.event_type, coalesce(x.payload #>> '{change,kind}', ''), x.created_at, x.correlation_id, x.causation_id, s.subscription_id, d.state
      FROM graph.subscriptions s
      JOIN objects.object_outbox x ON x.tenant_id = s.tenant_id AND x.domain_id = s.domain_id
       AND x.status = 'published' AND x.event_type = ANY (s.event_types)
       AND (NOT (s.filter ? 'change_kinds') OR s.filter -> 'change_kinds' ? coalesce(x.payload #>> '{change,kind}', ''))
       AND (s.checkpoint_created_at IS NULL OR (x.created_at, x.id) > (s.checkpoint_created_at, s.checkpoint_event_id)
            OR x.created_at > clock_timestamp() - coalesce(p_lookback, interval '24 hours'))
      LEFT JOIN graph.subscription_deliveries d ON d.event_id = x.id AND d.subscription_id = s.subscription_id
     WHERE s.status = 'active'
       AND (d.event_id IS NULL OR d.state IN ('received', 'failed') OR (p_include_refused AND d.state = 'refused'))
     ORDER BY x.created_at, x.id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_deliveries_to_reconcile(boolean, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_deliveries_to_reconcile(boolean, interval) TO eye_commit;

-- The event itself: the job carries only the outbox row id (a re-drive carries nothing else); the dispatcher reads the
-- published row under the scheduler's bounded capability.
CREATE OR REPLACE FUNCTION graph.subscription_event_row(p_event_id uuid, p_tenant uuid, p_domain uuid)
RETURNS TABLE (event_type text, payload jsonb, created_at timestamptz)
SECURITY DEFINER SET search_path = graph, objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY SELECT x.event_type, x.payload, x.created_at FROM objects.object_outbox x
    WHERE x.id = p_event_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'published' AND x.event_type IN ('GraphChanged', 'MemoryCorrected');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_event_row(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_event_row(uuid,uuid,uuid) TO eye_commit;

-- Outbox rows of a subscribed type the publisher gave up on (dead-lettered): visible, never silently absent.
CREATE OR REPLACE FUNCTION graph.subscription_outbox_failures()
RETURNS TABLE (tenant_id uuid, domain_id uuid, event_id uuid, event_type text, created_at timestamptz)
SECURITY DEFINER SET search_path = graph, objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT DISTINCT s.tenant_id, s.domain_id, x.id, x.event_type, x.created_at
      FROM graph.subscriptions s
      JOIN objects.object_outbox x ON x.tenant_id = s.tenant_id AND x.domain_id = s.domain_id AND x.status = 'failed' AND x.event_type = ANY (s.event_types)
     WHERE s.status = 'active' ORDER BY x.created_at;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_outbox_failures() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_outbox_failures() TO eye_commit;

-- ============================================================
-- §8 Replay — a governed act: the cursor moved back, this subscription's deliveries after the point reopened
--    (their applied items cleared; the consumer ports are idempotent, so a replay re-checks and never duplicates),
--    the outbox rows to re-drive returned in order. Other subscriptions' deliveries are untouched.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.subscription_replay(
  p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_from_created_at timestamptz, p_from_event_id uuid, p_reason text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS TABLE (event_id uuid, event_type text, change_kind text, outbox_created_at timestamptz, correlation_id uuid, causation_id uuid, replay_seq int)
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.subscriptions%ROWTYPE; v_seq int; v_reopened int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.subscription.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'a replay states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM graph.subscriptions WHERE subscription_id = p_subscription_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no subscription % in this domain', p_subscription_id USING ERRCODE = '23503'; END IF;
  IF s.status <> 'active' THEN RAISE EXCEPTION 'replay rejected: the subscription is %', s.status USING ERRCODE = '23503'; END IF;
  v_seq := s.replay_seq + 1;
  UPDATE graph.subscriptions SET replay_seq = v_seq, checkpoint_created_at = p_from_created_at, checkpoint_event_id = p_from_event_id WHERE subscription_id = p_subscription_id;
  UPDATE graph.subscription_deliveries d
     SET state = 'received', finished_at = NULL, items_applied = '[]'::jsonb, last_error = NULL, replay_seq = v_seq, last_delivered_at = clock_timestamp()
   WHERE d.subscription_id = p_subscription_id
     AND (p_from_created_at IS NULL OR (d.outbox_created_at, d.event_id) > (p_from_created_at, p_from_event_id));
  GET DIAGNOSTICS v_reopened = ROW_COUNT;
  INSERT INTO graph.subscription_delivery_events (event_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, event, actor_principal_id, details, correlation_id)
  SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, d.event_id, d.subscription_id, 'replayed', p_actor, jsonb_build_object('replay_seq', v_seq, 'reason', p_reason), p_correlation
    FROM graph.subscription_deliveries d WHERE d.subscription_id = p_subscription_id AND d.replay_seq = v_seq;
  INSERT INTO graph.subscription_events (event_id, scope, tenant_id, domain_id, subscription_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_subscription_id, 'subscription.replayed', p_actor,
          jsonb_build_object('replay_seq', v_seq, 'from_created_at', p_from_created_at, 'from_event_id', p_from_event_id, 'reopened', v_reopened, 'reason', p_reason), p_correlation);
  RETURN QUERY
    SELECT x.id, x.event_type, coalesce(x.payload #>> '{change,kind}', ''), x.created_at, x.correlation_id, x.causation_id, v_seq
      FROM objects.object_outbox x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'published' AND x.event_type = ANY (s.event_types)
       AND (NOT (s.filter ? 'change_kinds') OR s.filter -> 'change_kinds' ? coalesce(x.payload #>> '{change,kind}', ''))
       AND (p_from_created_at IS NULL OR (x.created_at, x.id) > (p_from_created_at, p_from_event_id))
     ORDER BY x.created_at, x.id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.subscription_replay(uuid,uuid,uuid,timestamptz,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.subscription_replay(uuid,uuid,uuid,timestamptz,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §9 The consumers' effect ports — each asserting its kind's action, each idempotent per cause.
-- ============================================================
-- twins: a citing or boundary-bound version goes UNVERIFIED once per cause (the outbox event); an already-unverified
-- version, or one this event already marked, is a typed no-op.
CREATE OR REPLACE FUNCTION twin.apply_subscription_mark(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_reason text, p_outbox_event_id uuid, p_subscription_id uuid, p_actor uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT verification_state INTO v_state FROM twin.twin_versions v
   WHERE v.twin_id = p_twin_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'admitted' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_state <> 'verified' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM twin.twin_events e WHERE e.twin_id = p_twin_id AND e.event = 'version.unverified'
               AND (e.details ->> 'version')::int = p_version AND e.details ->> 'outbox_event_id' = p_outbox_event_id::text) THEN
    RETURN false;
  END IF;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_twin_id, 'version.unverified', p_actor,
          jsonb_build_object('version', p_version, 'reason', p_reason, 'outbox_event_id', p_outbox_event_id, 'subscription_id', p_subscription_id, 'automatic', true), p_correlation);
  UPDATE twin.twin_versions SET verification_state = 'unverified' WHERE twin_id = p_twin_id AND version = p_version;
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.apply_subscription_mark(uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.apply_subscription_mark(uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid) TO eye_commit;

-- forecasts: an issued forecast is marked for attention once; a forecast already attending is a typed no-op.
CREATE OR REPLACE FUNCTION prediction.mark_forecast_attention(
  p_forecast_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_outbox_event_id uuid, p_subscription_id uuid, p_actor uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.forecast.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE prediction.forecasts_current
     SET attention_state = 'assumption_unverified', attention_reason = p_reason, updated_at = clock_timestamp()
   WHERE forecast_id = p_forecast_id AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'issued' AND attention_state = 'none';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.attention', p_actor,
          jsonb_build_object('reason', p_reason, 'outbox_event_id', p_outbox_event_id, 'subscription_id', p_subscription_id, 'automatic', true), p_correlation);
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.mark_forecast_attention(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.mark_forecast_attention(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) TO eye_commit;

-- scenarios: an active scenario is marked for attention once (the forecast precedent); nothing is re-declared.
CREATE OR REPLACE FUNCTION prediction.mark_scenario_attention(
  p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_outbox_event_id uuid, p_subscription_id uuid, p_actor uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE prediction.scenarios_current
     SET attention_state = 'input_unverified', attention_reason = p_reason, updated_at = clock_timestamp()
   WHERE scenario_id = p_scenario_id AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'active' AND attention_state = 'none';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.attention', p_actor,
          jsonb_build_object('reason', p_reason, 'outbox_event_id', p_outbox_event_id, 'subscription_id', p_subscription_id, 'automatic', true), p_correlation);
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.mark_scenario_attention(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.mark_scenario_attention(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) TO eye_commit;

-- decisions: an invalidated input is RECORDED on the package once per cause; the package's state, its approval and its
-- commitment are never touched (C-004: no automatic rewrite of a human decision).
CREATE OR REPLACE FUNCTION decision.note_input_invalidated(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_details jsonb, p_outbox_event_id uuid, p_subscription_id uuid, p_actor uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM decision.packages_current p WHERE p.package_id = p_package_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM decision.package_events e WHERE e.package_id = p_package_id AND e.event = 'input.invalidated' AND e.details ->> 'outbox_event_id' = p_outbox_event_id::text) THEN RETURN false; END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'input.invalidated', p_actor,
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('outbox_event_id', p_outbox_event_id, 'subscription_id', p_subscription_id, 'automatic', true), p_correlation);
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.note_input_invalidated(uuid,uuid,uuid,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.note_input_invalidated(uuid,uuid,uuid,jsonb,uuid,uuid,uuid,uuid) TO eye_commit;

-- retrieval: the projections retrieval reads are re-verified from their event logs after a change and the check is
-- recorded; a mismatch is reported, never repaired here.
CREATE OR REPLACE FUNCTION graph.record_retrieval_check(
  p_check_id uuid, p_outbox_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_touched jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_rows jsonb; v_mismatched int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.retrieval.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT coalesce(jsonb_agg(jsonb_build_object('projection', r.projection, 'live_rows', r.live_rows, 'rebuilt_rows', r.rebuilt_rows, 'mismatched', r.mismatched)), '[]'::jsonb),
         coalesce(sum(r.mismatched), 0)::int
    INTO v_rows, v_mismatched
    FROM graph.rebuild_projections() r;
  INSERT INTO graph.retrieval_checks (check_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, touched, projections, mismatched, checked_by, correlation_id)
  VALUES (p_check_id, 'DOMAIN', p_tenant, p_domain, p_outbox_event_id, p_subscription_id, coalesce(p_touched, '{}'::jsonb), v_rows, v_mismatched, p_actor, p_correlation);
  RETURN jsonb_build_object('check_id', p_check_id, 'projections', v_rows, 'mismatched', v_mismatched);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_retrieval_check(uuid,uuid,uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_retrieval_check(uuid,uuid,uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

-- memory mappings: a proposal, once per (subject, cause); a person decides it through the resolution manager's authority.
CREATE OR REPLACE FUNCTION graph.propose_mapping_reconciliation(
  p_reconciliation_id uuid, p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject_id uuid, p_from_entity uuid, p_to_entity uuid,
  p_basis text, p_cause_event_id uuid, p_subscription_id uuid, p_actor uuid, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_existing uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.mapping.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT reconciliation_id INTO v_existing FROM graph.mapping_reconciliations
   WHERE subject_kind = p_subject_kind AND subject_id = p_subject_id AND cause_event_id = p_cause_event_id;
  IF FOUND THEN RETURN NULL; END IF;   -- already proposed for this cause: a typed no-op
  INSERT INTO graph.mapping_reconciliations (reconciliation_id, scope, tenant_id, domain_id, subject_kind, subject_id, from_entity_id, to_entity_id, basis, cause_event_id, subscription_id, proposed_by, correlation_id)
  VALUES (p_reconciliation_id, 'DOMAIN', p_tenant, p_domain, p_subject_kind, p_subject_id, p_from_entity, p_to_entity, p_basis, p_cause_event_id, p_subscription_id, p_actor, p_correlation);
  RETURN p_reconciliation_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propose_mapping_reconciliation(uuid,uuid,uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propose_mapping_reconciliation(uuid,uuid,uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.decide_mapping_reconciliation(
  p_reconciliation_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.resolution.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_state NOT IN ('accepted', 'rejected') THEN RAISE EXCEPTION 'a mapping reconciliation is accepted or rejected' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'a mapping decision states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE graph.mapping_reconciliations
     SET state = p_state, decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = p_reason
   WHERE reconciliation_id = p_reconciliation_id AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'proposed';
  IF NOT FOUND THEN RAISE EXCEPTION 'mapping decision rejected: no open proposal % in this domain', p_reconciliation_id USING ERRCODE = '23503'; END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.decide_mapping_reconciliation(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.decide_mapping_reconciliation(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §10 graph.rebuild_projections accepts the retrieval subscriber's action (the body is 0024's, unchanged).
-- ============================================================
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
    SELECT DISTINCT ON (e.edge_id) e.edge_id, e.event
      FROM graph.edge_events e
     WHERE e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
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
REVOKE ALL ON FUNCTION graph.rebuild_projections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.rebuild_projections() TO eye_app, eye_commit;
