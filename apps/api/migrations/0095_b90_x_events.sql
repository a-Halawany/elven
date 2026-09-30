-- ═════════════════════════════════════════════════════════════════════
-- section `events`
-- ═════════════════════════════════════════════════════════════════════
-- 0095 §E — CP-6 B90 PART E (2026-09-30): EVENT PRODUCTS AND SUBSCRIPTIONS — F-P7-F-09's event half (V7 ch43 DP-43-001..006; App A
-- DAT-SV-03; App G DPD-13; App B DZ-16 "event products"). Built on the prelude (§0: products_current, product_versions, product_reviews,
-- slo_observations, product_events, observe_slo) and nothing else of the registry; the outbox and the graph subscriptions (0006, 0063) are
-- the platform's INTERNAL consumers and are not touched — an event PRODUCT is served by PULL from its own stream.
--
--   E.1 THE VOCABULARY: the WHITELIST of the platform's own ledgers an event product may read (never a table the caller names), the six
--       event kinds (change | signal | correction | lifecycle | quality | strategic) and the mapping from a ledger's event name to a kind,
--       the projection of a source row's details to the declared schema's fields (never the whole row).
--   E.2 THE RECORD: products.event_products (the event declaration of a product of kind event: the VERSIONED schema — a registered
--       reference or declared fields —, the producer domain, the subject kind, the ordering key, pull delivery, the retention, the replay
--       policy, the SOURCE ledger; its compatibility with the prior declaration), products.event_stream (the DENSE per-product sequence:
--       kind, subject, ordering key value, occurred instant, the PROJECTED payload, the schema version, the source row once; append-only;
--       retention enforced on read, never by deletion here), products.event_subscriptions (the consumer, the PURPOSE, the DATA scope, the
--       TIME window, the CONSEQUENCE class, the filters, the accepted schema version, the LAG POLICY, the correction / replay capability;
--       registered → active → paused | lagging → active | revoked; the checkpoint PRESERVED on every state), products.subscription_checkpoints
--       (every acknowledgement and every replay, append-only), products.subscription_replays (append-only).
--   E.3 THE PORTS: declare_event_product (products.event_product.declare), emit_events (executive.attention.tick — the step `event-products`),
--       register_subscription / authorize_subscription / read_subscription_events / advance_checkpoint / pause_subscription /
--       conform_subscription / resume_subscription / replay_subscription / revoke_subscription (products.subscription.*),
--       evaluate_subscription_lag (executive.attention.tick — the step `subscription-lag`: the lag against the policy, the schema
--       compatibility, the attention item to the product owner, the SLO observations lag_events / lag_seconds on the prelude's ledger),
--       the reads event_product_read and subscription_read (invoker reads under the caller's RLS).
--   THE AUTHORITY BOUNDARY (DP-43-002): a subscription grants only the declared data (a subset of the schema's fields), purpose (one of
--   the product's policy purposes), time (the window), tenant (a named, active human of THIS tenant) and consequence scope; a read never
--   serves before the checkpoint ("consumers may not infer broader access from topic reachability"). THE CONTINUITY RULE (DP-43-006): a
--   subscription lagging beyond its policy, or accepting a schema the product broke, is PAUSED with its offset preserved, its owner
--   notified, and RESUMES only after the consumer's conformance and the owner's word.
--   Refusal family: `event product rejected (<class>)` and `subscription rejected (<class>)` — actor | authority | not_consumer → 403,
--   unknown_* → 404, state | lag | schema (on resume) → 409, the rest → 422. Every figure a harness seeds is SYNTHETIC. Forward-only.

-- ═════════════════════════════════════════════════════════════════════
-- §E.1 THE VOCABULARY
-- ═════════════════════════════════════════════════════════════════════
/* The whitelist: the platform's own ledgers an event product may read. The emitter's CASE dispatches on this name; nothing else is read. */
CREATE OR REPLACE FUNCTION products.event_source_ledgers() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['prediction.warning_events', 'prediction.forecast_events', 'decision.package_events', 'prediction.exposure_events',
  'graph.strategy_detections', 'executive.briefing_events', 'products.product_events'] $$;

/* The six event kinds of ch43 ("versioned change, signal, correction, lifecycle, quality and strategic events"). */
CREATE OR REPLACE FUNCTION products.event_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['change', 'signal', 'correction', 'lifecycle', 'quality', 'strategic'] $$;

/* A ledger's event NAME → the event KIND, mechanically: a corrected / correction / re_flagged / contested / retracted name is a correction;
   a warning.* / signal.* name (and an *.attention, *.appetite_breached) is a signal; strategy.* / exposure.* are strategic; a quality /
   unfit / coverage / stale / gamed / degraded name is quality; a terminal or opening verb is lifecycle; the rest is change. */
CREATE OR REPLACE FUNCTION products.event_kind_of(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_name ~ '(corrected|correction|re_flagged|contested|retracted)' THEN 'correction'
    WHEN p_name ~ '^(warning|signal)\.' OR p_name ~ '\.(attention|appetite_breached)$' THEN 'signal'
    WHEN p_name ~ '^(strategy|exposure)\.' THEN 'strategic'
    WHEN p_name ~ '(quality|unfit|coverage|stale|gamed|degraded)' THEN 'quality'
    WHEN p_name ~ '\.(registered|declared|opened|issued|raised|closed|withdrawn|retired|committed|released|resolved|superseded|expired|proposed|approved|rejected|sponsored|restored|revoked|authorized|reopened)$' THEN 'lifecycle'
    ELSE 'change' END $$;

/* Whether a source (its ledger, or the kinds it narrows to) carries correction events: the three ledgers whose vocabulary names one
   (warning.retracted, exposure.assessment_contested, briefing.re_flagged), or any narrowed kind that maps to a correction. */
CREATE OR REPLACE FUNCTION products.event_source_emits_corrections(p_source jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_source -> 'kinds') = 'array' AND jsonb_array_length(p_source -> 'kinds') > 0
      THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_source -> 'kinds') k WHERE products.event_kind_of(k) = 'correction')
    ELSE (p_source ->> 'ledger') IN ('prediction.warning_events', 'prediction.exposure_events', 'executive.briefing_events') END $$;

/* The PROJECTION: a source row's details reduced to the named fields — never the whole row (DP-43-002 "only declared data"). */
CREATE OR REPLACE FUNCTION products.event_projection(p_details jsonb, p_fields text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(coalesce(p_details, '{}'::jsonb)) e WHERE e.key = ANY (p_fields)), '{}'::jsonb) $$;

/* The declared schema's FIELDS: a registered reference's json_schema properties, or the declared fields' names (NULL when neither names one). */
CREATE OR REPLACE FUNCTION products.event_schema_fields(p_ref jsonb, p_json jsonb) RETURNS text[]
LANGUAGE sql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_ref IS NOT NULL THEN (SELECT array_agg(k ORDER BY k) FROM objects.schema_registry s, jsonb_object_keys(coalesce(s.json_schema -> 'properties', '{}'::jsonb)) k
                                  WHERE s.object_type = p_ref ->> 'object_type' AND s.schema_version = p_ref ->> 'schema_version')
    WHEN jsonb_typeof(p_json -> 'fields') = 'array' THEN (SELECT array_agg(f ->> 'name' ORDER BY f ->> 'name') FROM jsonb_array_elements(p_json -> 'fields') f WHERE jsonb_typeof(f -> 'name') = 'string')
    ELSE NULL END $$;

GRANT EXECUTE ON FUNCTION products.event_source_ledgers() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.event_kinds() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.event_kind_of(text) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.event_source_emits_corrections(jsonb) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.event_projection(jsonb, text[]) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.event_schema_fields(jsonb, jsonb) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §E.2 THE RECORD
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE products.event_products (
  product_id           uuid PRIMARY KEY REFERENCES products.products_current (product_id),
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  declaration_version  int  NOT NULL DEFAULT 1 CHECK (declaration_version >= 1),
  schema_ref           jsonb CHECK (schema_ref IS NULL OR jsonb_typeof(schema_ref) = 'object'),      -- {object_type, schema_version} of objects.schema_registry
  schema_json          jsonb CHECK (schema_json IS NULL OR jsonb_typeof(schema_json) = 'object'),    -- {version, fields: [{name, type, …}]}
  schema_version       text NOT NULL CHECK (schema_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  schema_fields        text[] NOT NULL CHECK (cardinality(schema_fields) >= 1),                     -- the projection (E.1)
  compatibility        text NOT NULL DEFAULT 'additive' CHECK (compatibility IN ('additive', 'breaking')),  -- of THIS declaration with the prior one
  producer_domain_id   uuid NOT NULL,                                                                -- this domain (the producer is the platform's own ledger)
  subject_kind         text NOT NULL CHECK (subject_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  ordering_key         text NOT NULL DEFAULT 'subject_id' CHECK (ordering_key ~ '^[a-z][a-z0-9_]{1,63}$'),   -- subject_id, or a details key
  delivery             text NOT NULL DEFAULT 'pull' CHECK (delivery = 'pull'),
  retention_days       int  NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  replay_policy        jsonb NOT NULL DEFAULT '{"allowed": true}'::jsonb CHECK (jsonb_typeof(replay_policy) = 'object'),
  source               jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object' AND (source ->> 'ledger') = ANY (products.event_source_ledgers())),  -- {ledger, kinds?, since}
  declared_by          uuid NOT NULL,
  declared_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT pev_ep_schema_one CHECK ((schema_ref IS NULL) <> (schema_json IS NULL))
);
COMMENT ON TABLE products.event_products IS 'B90 (0095 §E): the event declaration of a product of kind event (DP-43-001: schema, producer, subject, ordering key, delivery, retention, replay policy) and its SOURCE — one of the platform''s own ledgers (the whitelist); re-declared by version, never deleted.';
CREATE TRIGGER pev_ep_no_delete BEFORE DELETE ON products.event_products FOR EACH ROW EXECUTE FUNCTION products.no_delete();

CREATE TABLE products.event_stream (
  product_id       uuid NOT NULL REFERENCES products.event_products (product_id),
  sequence         bigint NOT NULL CHECK (sequence >= 1),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  event_kind       text NOT NULL CHECK (event_kind = ANY (products.event_kinds())),
  source_event     text NOT NULL,                       -- the ledger's own event name
  subject_id       uuid NOT NULL,
  ordering_key     text,                                -- the ordering key's VALUE on this row
  occurred_at      timestamptz NOT NULL,
  payload          jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),   -- the source details PROJECTED to the schema's fields
  schema_version   text NOT NULL,
  source_event_id  uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (product_id, sequence),
  CONSTRAINT pev_es_source_once UNIQUE (product_id, source_event_id)
);
CREATE INDEX pev_es_occurred ON products.event_stream (product_id, occurred_at);
CREATE TRIGGER pev_es_append_only BEFORE UPDATE OR DELETE ON products.event_stream FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.event_stream IS 'B90 (0095 §E): the stream of an event product — a DENSE per-product sequence written by the emitter (the tick step event-products) from the declared source ledger; append-only; retention is enforced on read (older rows are not served), never by deletion here.';

CREATE TABLE products.event_subscriptions (
  subscription_id        uuid PRIMARY KEY,
  product_id             uuid NOT NULL REFERENCES products.event_products (product_id),
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  consumer_principal_id  uuid NOT NULL,                  -- a named, active human of THIS tenant
  consumer_domain_id     uuid NOT NULL,
  purpose                text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 2 AND 120),
  granted                jsonb NOT NULL CHECK (jsonb_typeof(granted) = 'object'),    -- {fields, from, to, consequence}
  filters                jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),   -- {event_kinds?, ordering_keys?, subject_ids?, subject_kinds?}
  schema_version         text NOT NULL,                  -- the version the consumer accepts
  lag_policy             jsonb NOT NULL CHECK (jsonb_typeof(lag_policy) = 'object'), -- {max_lag_events, max_lag_seconds}
  handles_corrections    boolean NOT NULL,
  handles_replays        boolean NOT NULL,
  state                  text NOT NULL DEFAULT 'registered' CHECK (state IN ('registered', 'active', 'paused', 'lagging', 'revoked')),
  checkpoint_sequence    bigint NOT NULL DEFAULT 0 CHECK (checkpoint_sequence >= 0),   -- PRESERVED through every pause, lag and revocation
  checkpoint_at          timestamptz,
  paused_reason          text CHECK (paused_reason IS NULL OR paused_reason IN ('lag', 'schema', 'owner')),
  pause_note             text,
  paused_at              timestamptz,
  conformance            jsonb CHECK (conformance IS NULL OR jsonb_typeof(conformance) = 'object'),
  conformed_at           timestamptz,
  revoked_at             timestamptz,
  revoked_by             uuid,
  revocation_reason      text,
  registered_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  registered_by          uuid NOT NULL,
  authorized_at          timestamptz,
  authorized_by          uuid,
  updated_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT pev_sub_paused_bound CHECK ((state IN ('paused', 'lagging')) = (paused_reason IS NOT NULL AND paused_at IS NOT NULL) OR state = 'revoked'),
  CONSTRAINT pev_sub_revoked_bound CHECK ((state = 'revoked') = (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)),
  CONSTRAINT pev_sub_authorized_bound CHECK ((state = 'registered') = (authorized_at IS NULL) OR state = 'revoked'),
  CONSTRAINT pev_sub_checkpoint_pair CHECK ((checkpoint_sequence = 0) OR checkpoint_at IS NOT NULL)
);
CREATE INDEX pev_sub_product ON products.event_subscriptions (product_id, state);
CREATE INDEX pev_sub_consumer ON products.event_subscriptions (tenant_id, consumer_principal_id);
CREATE TRIGGER pev_sub_no_delete BEFORE DELETE ON products.event_subscriptions FOR EACH ROW EXECUTE FUNCTION products.no_delete();
COMMENT ON TABLE products.event_subscriptions IS 'B90 (0095 §E): a REGISTERED subscription under the authority boundary (DP-43-002: only the declared data, purpose, time, tenant and consequence scope); registered → active (the owner''s authorization) → paused | lagging (the continuity rule, the offset preserved) → active (conformance, then the owner''s resumption) → revoked. Never deleted.';

CREATE TABLE products.subscription_checkpoints (
  checkpoint_id    uuid PRIMARY KEY,
  subscription_id  uuid NOT NULL REFERENCES products.event_subscriptions (subscription_id),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('advance', 'replay')),
  from_sequence    bigint NOT NULL CHECK (from_sequence >= 0),
  to_sequence      bigint NOT NULL CHECK (to_sequence >= 0),
  acknowledged_by  uuid NOT NULL,
  acknowledged_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT pev_ck_direction CHECK ((kind = 'advance' AND to_sequence > from_sequence) OR (kind = 'replay' AND to_sequence < from_sequence))
);
CREATE INDEX pev_ck_subscription ON products.subscription_checkpoints (subscription_id, acknowledged_at);
CREATE TRIGGER pev_ck_append_only BEFORE UPDATE OR DELETE ON products.subscription_checkpoints FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.subscription_checkpoints IS 'B90 (0095 §E): every move of a subscription''s checkpoint — an acknowledgement (forward only) or a replay (backward, within retention) — append-only.';

CREATE TABLE products.subscription_replays (
  replay_id        uuid PRIMARY KEY,
  subscription_id  uuid NOT NULL REFERENCES products.event_subscriptions (subscription_id),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  from_sequence    bigint NOT NULL CHECK (from_sequence >= 0),   -- the checkpoint before the replay
  to_sequence      bigint NOT NULL CHECK (to_sequence >= 0),     -- the checkpoint after it (the consumer re-reads from here)
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  requested_by     uuid NOT NULL,
  requested_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT pev_rp_backward CHECK (to_sequence < from_sequence)
);
CREATE INDEX pev_rp_subscription ON products.subscription_replays (subscription_id, requested_at);
CREATE TRIGGER pev_rp_append_only BEFORE UPDATE OR DELETE ON products.subscription_replays FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.subscription_replays IS 'B90 (0095 §E): a consumer''s replays — the checkpoint moved back within retention, with the reason (DP-43-006 replay semantics) — append-only.';

-- RLS and grants (the 0081 loop idiom; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_products', 'event_stream', 'event_subscriptions', 'subscription_checkpoints', 'subscription_replays'] LOOP
    EXECUTE format('REVOKE ALL ON products.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE products.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE products.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY products_isolation ON products.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON products.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- §E.3 THE PORTS
-- ═════════════════════════════════════════════════════════════════════
/* The rows as JSON (every read and every port's answer): the row minus its tenant, domain and correlation. */
CREATE OR REPLACE FUNCTION products.event_product_json(r products.event_products) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' $$;
CREATE OR REPLACE FUNCTION products.subscription_json(s products.event_subscriptions) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT to_jsonb(s) - 'tenant_id' - 'domain_id' - 'correlation_id' $$;
GRANT EXECUTE ON FUNCTION products.event_product_json(products.event_products) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION products.subscription_json(products.event_subscriptions) TO eye_app, eye_commit;

/* The owner-or-steward test every owner's act uses (the prelude's idiom): the product's owner, or a named human holding data_steward,
   domain_admin or platform_admin in the domain. */
CREATE OR REPLACE FUNCTION products.event_owner_or_steward(p_owner uuid, p_actor uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = executive, identity, pg_catalog, pg_temp AS $$
  SELECT p_owner = p_actor OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) $$;
REVOKE ALL ON FUNCTION products.event_owner_or_steward(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.event_owner_or_steward(uuid,uuid,uuid,uuid) TO eye_commit;

/* DECLARE THE EVENT PRODUCT (products.event_product.declare): the owner's or a steward's act on a product of kind event (registered,
   released or degraded — never withdrawn or retired). The declaration: schema {ref: {object_type, schema_version}} (a registry row whose
   properties are the fields) or {version, fields: [{name, type}]}; subject_kind; ordering_key (subject_id or a details key); delivery pull;
   retention_days 1..3650; replay_policy {allowed}; source {ledger ∈ the whitelist, kinds?: [names], since?: instant}; compatibility
   additive | breaking (with the PRIOR declaration — the tick pauses the subscriptions a breaking one strands). A re-declaration is the
   next declaration_version; the source's `since` is kept from the first declaration unless named. */
CREATE OR REPLACE FUNCTION products.declare_event_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_declaration jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE; d jsonb := p_declaration; s jsonb; v_ref jsonb; v_json jsonb; v_version text; v_fields text[];
        v_subject text; v_okey text; v_delivery text; v_retention int; v_replay jsonb; v_source jsonb; v_compat text; e jsonb; v_since timestamptz; v_prior_version text; v_next int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.event_product.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'event product rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF NOT products.event_owner_or_steward(r.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'event product rejected (authority): an event product is declared by the product''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF r.kind <> 'event' THEN RAISE EXCEPTION 'event product rejected (kind): product % is of kind %; an event declaration belongs to a product of kind event (DPD-13)', r.product_key, r.kind USING ERRCODE = '22023'; END IF;
  IF r.state IN ('withdrawn', 'retired') THEN RAISE EXCEPTION 'event product rejected (state): product % is %; a withdrawn or retired product takes no event declaration', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN RAISE EXCEPTION 'event product rejected (declaration): an event declaration is an object' USING ERRCODE = '22023'; END IF;
  -- the schema: a registered reference, or declared fields with a version
  s := d -> 'schema';
  IF s IS NULL OR jsonb_typeof(s) <> 'object' THEN RAISE EXCEPTION 'event product rejected (schema): an event declaration carries a schema object ({ref: {object_type, schema_version}} or {version, fields})' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(s -> 'ref') = 'object' THEN
    v_ref := s -> 'ref';
    IF jsonb_typeof(v_ref -> 'object_type') <> 'string' OR jsonb_typeof(v_ref -> 'schema_version') <> 'string' THEN
      RAISE EXCEPTION 'event product rejected (schema): a schema reference names an object_type and a schema_version' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM objects.schema_registry x WHERE x.object_type = v_ref ->> 'object_type' AND x.schema_version = v_ref ->> 'schema_version') THEN
      RAISE EXCEPTION 'event product rejected (schema): schema %@% is not in the schema registry', v_ref ->> 'object_type', v_ref ->> 'schema_version' USING ERRCODE = '22023';
    END IF;
    v_ref := jsonb_build_object('object_type', v_ref ->> 'object_type', 'schema_version', v_ref ->> 'schema_version');
    v_version := (v_ref ->> 'object_type') || '@' || (v_ref ->> 'schema_version');
  ELSIF jsonb_typeof(s -> 'fields') = 'array' AND jsonb_array_length(s -> 'fields') >= 1 THEN
    IF jsonb_typeof(s -> 'version') <> 'string' OR (s ->> 'version') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
      RAISE EXCEPTION 'event product rejected (schema): declared fields carry a version (letters, digits, dots, dashes)' USING ERRCODE = '22023';
    END IF;
    FOR e IN SELECT x FROM jsonb_array_elements(s -> 'fields') x LOOP
      IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'name') <> 'string' OR (e ->> 'name') !~ '^[a-z][a-z0-9_]{0,63}$' OR jsonb_typeof(e -> 'type') <> 'string' THEN
        RAISE EXCEPTION 'event product rejected (schema): each declared field names a name (a lower-case identifier) and a type' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_json := jsonb_build_object('version', s ->> 'version', 'fields', s -> 'fields');
    v_version := s ->> 'version';
  ELSE
    RAISE EXCEPTION 'event product rejected (schema): a schema is a registered reference (ref) or declared fields (version, fields)' USING ERRCODE = '22023';
  END IF;
  v_fields := products.event_schema_fields(v_ref, v_json);
  IF v_fields IS NULL OR cardinality(v_fields) = 0 THEN RAISE EXCEPTION 'event product rejected (schema): schema % names no fields to project', v_version USING ERRCODE = '22023'; END IF;
  -- the subject, the ordering key, the delivery, the retention, the replay policy
  v_subject := d ->> 'subject_kind';
  IF v_subject IS NULL OR v_subject !~ '^[a-z][a-z0-9_]{1,63}$' THEN RAISE EXCEPTION 'event product rejected (subject): an event declaration names its subject kind (a lower-case identifier)' USING ERRCODE = '22023'; END IF;
  v_okey := coalesce(d ->> 'ordering_key', 'subject_id');
  IF v_okey !~ '^[a-z][a-z0-9_]{1,63}$' THEN RAISE EXCEPTION 'event product rejected (ordering_key): the ordering key is subject_id or a details key (a lower-case identifier)' USING ERRCODE = '22023'; END IF;
  v_delivery := coalesce(d ->> 'delivery', 'pull');
  IF v_delivery <> 'pull' THEN RAISE EXCEPTION 'event product rejected (delivery): an event product is served by pull from its own stream; % is not offered', v_delivery USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(d -> 'retention_days') <> 'number' OR (d ->> 'retention_days') !~ '^[0-9]+$' OR (d ->> 'retention_days')::int NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION 'event product rejected (retention): retention_days is a whole number of days in 1..3650' USING ERRCODE = '22023';
  END IF;
  v_retention := (d ->> 'retention_days')::int;
  v_replay := coalesce(d -> 'replay_policy', '{"allowed": true}'::jsonb);
  IF jsonb_typeof(v_replay) <> 'object' OR jsonb_typeof(v_replay -> 'allowed') <> 'boolean' THEN RAISE EXCEPTION 'event product rejected (replay_policy): the replay policy is an object naming whether a replay is allowed' USING ERRCODE = '22023'; END IF;
  -- the source: a whitelisted ledger, the kinds it narrows to, the instant it streams from
  v_source := d -> 'source';
  IF v_source IS NULL OR jsonb_typeof(v_source) <> 'object' OR jsonb_typeof(v_source -> 'ledger') <> 'string' THEN
    RAISE EXCEPTION 'event product rejected (source): an event declaration names its source ledger' USING ERRCODE = '22023';
  END IF;
  IF (v_source ->> 'ledger') <> ALL (products.event_source_ledgers()) THEN
    RAISE EXCEPTION 'event product rejected (source): % is not one of the platform ledgers an event product may read (%)', v_source ->> 'ledger', array_to_string(products.event_source_ledgers(), ', ') USING ERRCODE = '22023';
  END IF;
  IF v_source ? 'kinds' THEN
    IF jsonb_typeof(v_source -> 'kinds') <> 'array' THEN RAISE EXCEPTION 'event product rejected (source): kinds is an array of the ledger''s event names' USING ERRCODE = '22023'; END IF;
    FOR e IN SELECT x FROM jsonb_array_elements(v_source -> 'kinds') x LOOP
      IF jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' THEN RAISE EXCEPTION 'event product rejected (source): % is not an event name', e USING ERRCODE = '22023'; END IF;
    END LOOP;
  END IF;
  IF v_source ? 'since' THEN
    BEGIN v_since := (v_source ->> 'since')::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'event product rejected (source): since is an instant' USING ERRCODE = '22023'; END;
  END IF;
  v_compat := coalesce(d ->> 'compatibility', 'additive');
  IF v_compat NOT IN ('additive', 'breaking') THEN RAISE EXCEPTION 'event product rejected (compatibility): compatibility is additive or breaking' USING ERRCODE = '22023'; END IF;
  -- the row: the first declaration, or the next version
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    v_since := coalesce(v_since, clock_timestamp());
    INSERT INTO products.event_products (product_id, tenant_id, domain_id, declaration_version, schema_ref, schema_json, schema_version, schema_fields, compatibility, producer_domain_id, subject_kind,
                                         ordering_key, delivery, retention_days, replay_policy, source, declared_by, correlation_id)
    VALUES (p_product_id, p_tenant, p_domain, 1, v_ref, v_json, v_version, v_fields, 'additive', p_domain, v_subject, v_okey, v_delivery, v_retention, v_replay,
            (v_source - 'since') || jsonb_build_object('since', v_since), p_actor, p_correlation) RETURNING * INTO ep;
    v_next := 1;
  ELSE
    v_prior_version := ep.schema_version;
    v_since := coalesce(v_since, (ep.source ->> 'since')::timestamptz);
    v_next := ep.declaration_version + 1;
    UPDATE products.event_products
       SET declaration_version = v_next, schema_ref = v_ref, schema_json = v_json, schema_version = v_version, schema_fields = v_fields, compatibility = v_compat, subject_kind = v_subject,
           ordering_key = v_okey, delivery = v_delivery, retention_days = v_retention, replay_policy = v_replay, source = (v_source - 'since') || jsonb_build_object('since', v_since),
           declared_by = p_actor, updated_at = clock_timestamp(), correlation_id = p_correlation
     WHERE product_id = p_product_id RETURNING * INTO ep;
  END IF;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'event_product.declared', p_actor,
          jsonb_build_object('declaration_version', v_next, 'schema_version', v_version, 'prior_schema_version', v_prior_version, 'compatibility', ep.compatibility, 'ledger', v_source ->> 'ledger',
                             'fields', to_jsonb(v_fields), 'retention_days', v_retention, 'emits_corrections', products.event_source_emits_corrections(ep.source)), p_correlation);
  RETURN products.event_product_json(ep) || jsonb_build_object('product_key', r.product_key, 'product_state', r.state, 'emits_corrections', products.event_source_emits_corrections(ep.source));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.declare_event_product(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.declare_event_product(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

/* THE SOURCE ROWS of a ledger not yet in a product's stream, in the ledger's own (occurred instant, id) order — the CASE on the whitelisted
   name is the ONLY place a ledger is read; a name outside it answers nothing. A definer read of the platform's ledgers, so the tenant and
   the domain are filtered explicitly. Private to the emitter. */
CREATE OR REPLACE FUNCTION products.event_source_rows(p_ledger text, p_tenant uuid, p_domain uuid, p_since timestamptz, p_kinds text[], p_product_id uuid, p_limit int)
RETURNS TABLE (event_id uuid, subject_id uuid, event text, occurred_at timestamptz, details jsonb)
SECURITY DEFINER SET search_path = products, prediction, decision, graph, executive, pg_catalog, pg_temp AS $$
BEGIN
  CASE p_ledger
    WHEN 'prediction.warning_events' THEN
      RETURN QUERY SELECT e.event_id, e.warning_id, e.event, e.occurred_at, e.details FROM prediction.warning_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    WHEN 'prediction.forecast_events' THEN
      RETURN QUERY SELECT e.event_id, e.forecast_id, e.event, e.occurred_at, e.details FROM prediction.forecast_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    WHEN 'decision.package_events' THEN
      RETURN QUERY SELECT e.event_id, e.package_id, e.event, e.occurred_at, e.details FROM decision.package_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    WHEN 'prediction.exposure_events' THEN
      RETURN QUERY SELECT e.event_id, e.exposure_id, e.event, e.occurred_at, e.details FROM prediction.exposure_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    WHEN 'graph.strategy_detections' THEN
      RETURN QUERY SELECT e.detection_id, e.subject_id, 'strategy.' || e.kind, e.raised_at,
                          jsonb_build_object('kind', e.kind, 'detail', e.detail, 'subject_type', e.subject_type, 'measure_id', e.measure_id, 'cause_key', e.cause_key, 'owner_principal_id', e.owner_principal_id, 'routed_item_id', e.routed_item_id)
        FROM graph.strategy_detections e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.raised_at >= p_since AND (p_kinds IS NULL OR ('strategy.' || e.kind) = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.detection_id)
        ORDER BY e.raised_at, e.detection_id LIMIT p_limit;
    WHEN 'executive.briefing_events' THEN
      RETURN QUERY SELECT e.event_id, e.briefing_id, e.event, e.occurred_at, e.details FROM executive.briefing_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    WHEN 'products.product_events' THEN
      RETURN QUERY SELECT e.event_id, e.product_id, e.event, e.occurred_at, e.details FROM products.product_events e
        WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_since AND (p_kinds IS NULL OR e.event = ANY (p_kinds))
          AND NOT EXISTS (SELECT 1 FROM products.event_stream s WHERE s.product_id = p_product_id AND s.source_event_id = e.event_id)
        ORDER BY e.occurred_at, e.event_id LIMIT p_limit;
    ELSE
      RETURN;
  END CASE;
END $$ LANGUAGE plpgsql STABLE;
REVOKE ALL ON FUNCTION products.event_source_rows(text,uuid,uuid,timestamptz,text[],uuid,int) FROM PUBLIC;

/* EMIT (executive.attention.tick — the step `event-products`, order 61): every source row since the last emitted becomes a stream row with
   the next DENSE sequence (the event product's row locked for the batch), its kind by name, the subject, the ordering key's value, the
   occurred instant, the payload PROJECTED to the schema's fields, the schema version; `events.emitted` on product_events with the count
   (when any). Only a released (or degraded) event product with an event declaration streams. */
CREATE OR REPLACE FUNCTION products.emit_events(p_product_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE; src record; v_next bigint; v_from bigint; v_n int := 0; v_kinds text[]; v_since timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'event product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'event product rejected (state): product % is %; only a released event product streams', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event product rejected (state): product % has no event declaration', r.product_key USING ERRCODE = '22023'; END IF;
  v_next := coalesce((SELECT max(s.sequence) FROM products.event_stream s WHERE s.product_id = p_product_id), 0) + 1;
  v_from := v_next;
  v_since := coalesce((ep.source ->> 'since')::timestamptz, ep.declared_at);
  IF jsonb_typeof(ep.source -> 'kinds') = 'array' AND jsonb_array_length(ep.source -> 'kinds') > 0 THEN
    SELECT array_agg(k) INTO v_kinds FROM jsonb_array_elements_text(ep.source -> 'kinds') k;
  END IF;
  FOR src IN SELECT * FROM products.event_source_rows(ep.source ->> 'ledger', p_tenant, p_domain, v_since, v_kinds, p_product_id, 1000) LOOP
    INSERT INTO products.event_stream (product_id, sequence, tenant_id, domain_id, event_kind, source_event, subject_id, ordering_key, occurred_at, payload, schema_version, source_event_id, correlation_id)
    VALUES (p_product_id, v_next, p_tenant, p_domain, products.event_kind_of(src.event), src.event, src.subject_id,
            CASE ep.ordering_key WHEN 'subject_id' THEN src.subject_id::text ELSE src.details ->> ep.ordering_key END,
            src.occurred_at, products.event_projection(src.details, ep.schema_fields), ep.schema_version, src.event_id, p_correlation);
    v_next := v_next + 1; v_n := v_n + 1;
  END LOOP;
  IF v_n > 0 THEN
    INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_product_id, 'events.emitted', p_actor,
            jsonb_build_object('count', v_n, 'from_sequence', v_from, 'to_sequence', v_next - 1, 'ledger', ep.source ->> 'ledger', 'schema_version', ep.schema_version), p_correlation);
  END IF;
  RETURN jsonb_build_object('product_id', p_product_id, 'product_key', r.product_key, 'emitted', v_n, 'head', v_next - 1, 'ledger', ep.source ->> 'ledger');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.emit_events(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.emit_events(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* REGISTER A SUBSCRIPTION (products.subscription.register): the consumer's own act (or a steward's for a named consumer) on a RELEASED
   event product, under the AUTHORITY BOUNDARY — the consumer a named, active human of THIS tenant; the purpose one of the product's policy
   purposes; the granted fields a subset of the schema's; the time window instants or null; the consequence class named; the filters
   (event_kinds, ordering_keys, subject_ids, subject_kinds); the accepted schema version the product's current; the lag policy
   {max_lag_events, max_lag_seconds}; whether corrections and replays can be processed. Opens `registered`; the owner authorizes. */
CREATE OR REPLACE FUNCTION products.register_subscription(
  p_subscription_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_consumer uuid, p_purpose text, p_granted jsonb, p_filters jsonb, p_schema_version text, p_lag_policy jsonb,
  p_handles_corrections boolean, p_handles_replays boolean, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE; s products.event_subscriptions%ROWTYPE; c identity.principals%ROWTYPE; e jsonb; v_from timestamptz; v_to timestamptz; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): registered by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_consumer IS DISTINCT FROM p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'subscription rejected (authority): a subscription is registered by its consumer, or by a data steward for a named consumer' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM identity.principals x WHERE x.id = p_consumer;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_consumer): % is not a principal', p_consumer USING ERRCODE = '22023'; END IF;
  IF c.tenant_id IS DISTINCT FROM p_tenant OR c.kind <> 'human' OR c.status <> 'active' THEN
    RAISE EXCEPTION 'subscription rejected (authority): the authority boundary (DP-43-002) — a subscription is granted to a named, active human of this tenant; % is not one', p_consumer USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.kind <> 'event' THEN RAISE EXCEPTION 'subscription rejected (kind): product % is of kind %; a subscription is on an event product', r.product_key, r.kind USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'subscription rejected (state): product % is %; a subscription is registered on a released event product', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (state): product % has no event declaration', r.product_key USING ERRCODE = '22023'; END IF;
  IF p_purpose IS NULL OR length(btrim(p_purpose)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'subscription rejected (purpose): a subscription states its purpose' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(r.declaration #> '{policy,purposes}', '[]'::jsonb)) p WHERE p = btrim(p_purpose)) THEN
    RAISE EXCEPTION 'subscription rejected (purpose): purpose % is outside the product''s policy purposes (%)', btrim(p_purpose), (SELECT string_agg(p, ', ') FROM jsonb_array_elements_text(coalesce(r.declaration #> '{policy,purposes}', '[]'::jsonb)) p) USING ERRCODE = '22023';
  END IF;
  -- the DATA scope: fields ⊆ the schema's
  IF p_granted IS NULL OR jsonb_typeof(p_granted) <> 'object' OR jsonb_typeof(p_granted -> 'fields') <> 'array' OR jsonb_array_length(p_granted -> 'fields') = 0 THEN
    RAISE EXCEPTION 'subscription rejected (fields): the grant names the fields it needs (a non-empty subset of the schema''s: %)', array_to_string(ep.schema_fields, ', ') USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_granted -> 'fields') x LOOP
    IF jsonb_typeof(e) <> 'string' OR (e #>> '{}') <> ALL (ep.schema_fields) THEN
      RAISE EXCEPTION 'subscription rejected (fields): % is not a field of schema % (%); a subscription grants only declared data', e, ep.schema_version, array_to_string(ep.schema_fields, ', ') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- the CONSEQUENCE class and the TIME window
  IF jsonb_typeof(p_granted -> 'consequence') <> 'string' OR (p_granted ->> 'consequence') NOT IN ('C0', 'C1', 'C2', 'C3', 'C4') THEN
    RAISE EXCEPTION 'subscription rejected (consequence): the grant names the consequence class the consumer may act on (C0..C4)' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_from := CASE WHEN jsonb_typeof(p_granted -> 'from') = 'string' THEN (p_granted ->> 'from')::timestamptz ELSE NULL END;
    v_to := CASE WHEN jsonb_typeof(p_granted -> 'to') = 'string' THEN (p_granted ->> 'to')::timestamptz ELSE NULL END;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'subscription rejected (window): the time window''s from and to are instants or null' USING ERRCODE = '22023'; END;
  IF (p_granted ? 'from' AND jsonb_typeof(p_granted -> 'from') NOT IN ('string', 'null')) OR (p_granted ? 'to' AND jsonb_typeof(p_granted -> 'to') NOT IN ('string', 'null')) OR (v_from IS NOT NULL AND v_to IS NOT NULL AND v_from >= v_to) THEN
    RAISE EXCEPTION 'subscription rejected (window): the time window''s from and to are instants or null, from before to' USING ERRCODE = '22023';
  END IF;
  -- the FILTERS
  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) <> 'object' THEN RAISE EXCEPTION 'subscription rejected (filters): the filters are an object {event_kinds?, ordering_keys?, subject_ids?, subject_kinds?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) LOOP
    IF k NOT IN ('event_kinds', 'ordering_keys', 'subject_ids', 'subject_kinds') OR jsonb_typeof(p_filters -> k) <> 'array' THEN
      RAISE EXCEPTION 'subscription rejected (filters): % is not a filter (event_kinds, ordering_keys, subject_ids, subject_kinds — each an array)', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_filters -> 'event_kinds', '[]'::jsonb)) x WHERE x <> ALL (products.event_kinds())) THEN
    RAISE EXCEPTION 'subscription rejected (filters): an event kind filter names change, signal, correction, lifecycle, quality or strategic' USING ERRCODE = '22023';
  END IF;
  -- the SCHEMA version accepted, the LAG policy, the capabilities
  IF p_schema_version IS DISTINCT FROM ep.schema_version THEN
    RAISE EXCEPTION 'subscription rejected (schema): product % serves schema version %; a subscription accepts the current version (% was named)', r.product_key, ep.schema_version, coalesce(p_schema_version, 'null') USING ERRCODE = '22023';
  END IF;
  IF p_lag_policy IS NULL OR jsonb_typeof(p_lag_policy) <> 'object'
     OR jsonb_typeof(p_lag_policy -> 'max_lag_events') <> 'number' OR (p_lag_policy ->> 'max_lag_events') !~ '^[0-9]+$' OR (p_lag_policy ->> 'max_lag_events')::bigint < 1
     OR jsonb_typeof(p_lag_policy -> 'max_lag_seconds') <> 'number' OR (p_lag_policy ->> 'max_lag_seconds') !~ '^[0-9]+$' OR (p_lag_policy ->> 'max_lag_seconds')::bigint < 1 THEN
    RAISE EXCEPTION 'subscription rejected (lag_policy): the lag policy names max_lag_events and max_lag_seconds (whole numbers ≥ 1)' USING ERRCODE = '22023';
  END IF;
  IF p_handles_corrections IS NULL OR p_handles_replays IS NULL THEN RAISE EXCEPTION 'subscription rejected (capability): a subscription declares whether it can process corrections and replays' USING ERRCODE = '22023'; END IF;
  INSERT INTO products.event_subscriptions (subscription_id, product_id, tenant_id, domain_id, consumer_principal_id, consumer_domain_id, purpose, granted, filters, schema_version, lag_policy,
                                            handles_corrections, handles_replays, registered_by, correlation_id)
  VALUES (p_subscription_id, p_product_id, p_tenant, p_domain, p_consumer, coalesce(c.domain_id, p_domain), btrim(p_purpose),
          jsonb_build_object('fields', p_granted -> 'fields', 'consequence', p_granted ->> 'consequence', 'from', v_from, 'to', v_to),
          coalesce(p_filters, '{}'::jsonb), p_schema_version, jsonb_build_object('max_lag_events', (p_lag_policy ->> 'max_lag_events')::bigint, 'max_lag_seconds', (p_lag_policy ->> 'max_lag_seconds')::bigint),
          p_handles_corrections, p_handles_replays, p_actor, p_correlation) RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'subscription.registered', p_actor,
          jsonb_build_object('subscription_id', p_subscription_id, 'consumer', p_consumer, 'purpose', btrim(p_purpose), 'fields', p_granted -> 'fields', 'consequence', p_granted ->> 'consequence', 'schema_version', p_schema_version), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.register_subscription(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,boolean,boolean,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.register_subscription(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,boolean,boolean,uuid,uuid,uuid) TO eye_commit;

/* AUTHORIZE (products.subscription.authorize): the owner's or a steward's act on a registered subscription; a product whose source carries
   correction events is refused to a consumer that cannot process them (DP-43-006). registered → active. */
CREATE OR REPLACE FUNCTION products.authorize_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.authorize']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): authorized by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  IF NOT products.event_owner_or_steward(r.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'subscription rejected (authority): a subscription is authorized by the product''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF s.state <> 'registered' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; only a registered subscription is authorized', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'subscription rejected (state): product % is %; a subscription is authorized on a released event product', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF NOT s.handles_corrections AND products.event_source_emits_corrections(ep.source) THEN
    RAISE EXCEPTION 'subscription rejected (capability): the source ledger % of product % carries correction events; a consumer that cannot process corrections is not authorized (DP-43-006)', ep.source ->> 'ledger', r.product_key USING ERRCODE = '22023';
  END IF;
  UPDATE products.event_subscriptions SET state = 'active', authorized_at = clock_timestamp(), authorized_by = p_actor, updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.authorized', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'consumer', s.consumer_principal_id), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.authorize_subscription(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.authorize_subscription(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* READ (products.subscription.read) — THE CONSUMER's own act: the stream rows after the checkpoint (or after p_after_sequence, never
   before the checkpoint), within the time window and the retention, FILTERED, each payload PROJECTED to the granted fields; a correction
   row is withheld from a consumer that cannot process corrections and COUNTED as omitted; refused on a paused, lagging or revoked
   subscription with the reason (conformance and the owner's resumption are required first). */
CREATE OR REPLACE FUNCTION products.read_subscription_events(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_after_sequence bigint, p_limit int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; ep products.event_products%ROWTYPE; r products.products_current%ROWTYPE; v_after bigint; v_limit int; v_floor timestamptz; v_head bigint;
        v_from timestamptz; v_to timestamptz; v_kinds text[]; v_okeys text[]; v_subjects uuid[]; v_fields text[]; v_events jsonb; v_served int; v_omitted int; v_next bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.read']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): read by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'subscription rejected (not_consumer): the events of a subscription are read by its consumer' USING ERRCODE = '42501'; END IF;
  IF s.state = 'registered' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is registered and not yet authorized by the product''s owner', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.state = 'revoked' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % was revoked at % (%); nothing is served (the checkpoint % is preserved)', p_subscription_id, s.revoked_at, s.revocation_reason, s.checkpoint_sequence USING ERRCODE = '22023'; END IF;
  IF s.state IN ('paused', 'lagging') THEN
    RAISE EXCEPTION 'subscription rejected (state): subscription % is % (%); delivery is paused with the checkpoint % preserved — the consumer''s conformance and the owner''s resumption are required before reading', p_subscription_id, s.state, s.paused_reason, s.checkpoint_sequence USING ERRCODE = '22023';
  END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  v_after := coalesce(p_after_sequence, s.checkpoint_sequence);
  IF v_after < s.checkpoint_sequence THEN
    RAISE EXCEPTION 'subscription rejected (window): reading from sequence % is before the checkpoint %; a replay moves the checkpoint back (DP-43-002: consumers may not infer broader access)', v_after, s.checkpoint_sequence USING ERRCODE = '22023';
  END IF;
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_floor := clock_timestamp() - make_interval(days => ep.retention_days);
  v_head := coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = s.product_id), 0);
  v_from := CASE WHEN jsonb_typeof(s.granted -> 'from') = 'string' THEN (s.granted ->> 'from')::timestamptz END;
  v_to := CASE WHEN jsonb_typeof(s.granted -> 'to') = 'string' THEN (s.granted ->> 'to')::timestamptz END;
  SELECT array_agg(f) INTO v_fields FROM jsonb_array_elements_text(s.granted -> 'fields') f;
  IF jsonb_typeof(s.filters -> 'event_kinds') = 'array' AND jsonb_array_length(s.filters -> 'event_kinds') > 0 THEN SELECT array_agg(k) INTO v_kinds FROM jsonb_array_elements_text(s.filters -> 'event_kinds') k; END IF;
  IF jsonb_typeof(s.filters -> 'ordering_keys') = 'array' AND jsonb_array_length(s.filters -> 'ordering_keys') > 0 THEN SELECT array_agg(k) INTO v_okeys FROM jsonb_array_elements_text(s.filters -> 'ordering_keys') k; END IF;
  IF jsonb_typeof(s.filters -> 'subject_ids') = 'array' AND jsonb_array_length(s.filters -> 'subject_ids') > 0 THEN SELECT array_agg(k::uuid) INTO v_subjects FROM jsonb_array_elements_text(s.filters -> 'subject_ids') k; END IF;
  IF jsonb_typeof(s.filters -> 'subject_kinds') = 'array' AND jsonb_array_length(s.filters -> 'subject_kinds') > 0
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(s.filters -> 'subject_kinds') k WHERE k = ep.subject_kind) THEN
    RETURN jsonb_build_object('subscription_id', p_subscription_id, 'product_id', s.product_id, 'product_key', r.product_key, 'after', v_after, 'next_after', v_after, 'head', v_head, 'checkpoint', s.checkpoint_sequence,
                              'served', 0, 'omitted', jsonb_build_object('corrections', 0), 'retention_floor', v_floor, 'window', jsonb_build_object('from', v_from, 'to', v_to), 'events', '[]'::jsonb,
                              'note', 'the subject kind filter excludes this product''s subject kind ' || ep.subject_kind);
  END IF;
  WITH candidates AS (
    SELECT x.* FROM products.event_stream x
     WHERE x.product_id = s.product_id AND x.sequence > v_after AND x.occurred_at >= v_floor
       AND (v_from IS NULL OR x.occurred_at >= v_from) AND (v_to IS NULL OR x.occurred_at <= v_to)
       AND (v_kinds IS NULL OR x.event_kind = ANY (v_kinds)) AND (v_okeys IS NULL OR x.ordering_key = ANY (v_okeys)) AND (v_subjects IS NULL OR x.subject_id = ANY (v_subjects))
     ORDER BY x.sequence LIMIT v_limit)
  SELECT coalesce(jsonb_agg(jsonb_build_object('sequence', c.sequence, 'event_kind', c.event_kind, 'source_event', c.source_event, 'subject_id', c.subject_id, 'subject_kind', ep.subject_kind, 'ordering_key', c.ordering_key,
                                              'occurred_at', c.occurred_at, 'schema_version', c.schema_version, 'payload', products.event_projection(c.payload, v_fields)) ORDER BY c.sequence)
                  FILTER (WHERE s.handles_corrections OR c.event_kind <> 'correction'), '[]'::jsonb),
         count(*) FILTER (WHERE s.handles_corrections OR c.event_kind <> 'correction'), count(*) FILTER (WHERE NOT s.handles_corrections AND c.event_kind = 'correction'), coalesce(max(c.sequence), v_after)
    INTO v_events, v_served, v_omitted, v_next
    FROM candidates c;
  RETURN jsonb_build_object('subscription_id', p_subscription_id, 'product_id', s.product_id, 'product_key', r.product_key, 'after', v_after, 'next_after', v_next, 'head', v_head, 'checkpoint', s.checkpoint_sequence,
                            'served', v_served, 'omitted', jsonb_build_object('corrections', v_omitted, 'reason', CASE WHEN v_omitted > 0 THEN 'this subscription declared it cannot process corrections; the correction rows are withheld and counted' END),
                            'retention_floor', v_floor, 'window', jsonb_build_object('from', v_from, 'to', v_to), 'fields', to_jsonb(v_fields), 'events', v_events);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.read_subscription_events(uuid,uuid,uuid,bigint,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.read_subscription_events(uuid,uuid,uuid,bigint,int,uuid,uuid) TO eye_commit;

/* ACKNOWLEDGE (products.subscription.checkpoint): the consumer's own act; the checkpoint ADVANCES only, never beyond the head; on an
   active or a lagging (catching-up) subscription — catching up never resumes on its own (the owner's word). Append-only ledger row. */
CREATE OR REPLACE FUNCTION products.advance_checkpoint(p_checkpoint_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_sequence bigint, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; v_head bigint; v_from bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.checkpoint']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): acknowledged by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'subscription rejected (not_consumer): a checkpoint is acknowledged by the subscription''s consumer' USING ERRCODE = '42501'; END IF;
  IF s.state NOT IN ('active', 'lagging') THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; a checkpoint moves on an active or a lagging (catching-up) subscription', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  IF p_sequence IS NULL OR p_sequence <= s.checkpoint_sequence THEN RAISE EXCEPTION 'subscription rejected (sequence): a checkpoint advances; % is not beyond the checkpoint %', coalesce(p_sequence::text, 'null'), s.checkpoint_sequence USING ERRCODE = '22023'; END IF;
  v_head := coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = s.product_id), 0);
  IF p_sequence > v_head THEN RAISE EXCEPTION 'subscription rejected (head): sequence % is beyond the stream head %', p_sequence, v_head USING ERRCODE = '22023'; END IF;
  v_from := s.checkpoint_sequence;
  INSERT INTO products.subscription_checkpoints (checkpoint_id, subscription_id, tenant_id, domain_id, kind, from_sequence, to_sequence, acknowledged_by, correlation_id)
  VALUES (p_checkpoint_id, p_subscription_id, p_tenant, p_domain, 'advance', v_from, p_sequence, p_actor, p_correlation);
  UPDATE products.event_subscriptions SET checkpoint_sequence = p_sequence, checkpoint_at = clock_timestamp(), updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'checkpoint.advanced', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'from_sequence', v_from, 'to_sequence', p_sequence, 'head', v_head, 'state', s.state), p_correlation);
  RETURN products.subscription_json(s) || jsonb_build_object('head', v_head, 'lag_events', v_head - p_sequence);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.advance_checkpoint(uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.advance_checkpoint(uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid) TO eye_commit;

/* The owner's NOTICE (private; under the tick's action): an attention item of class subscription.lag, subject the subscription, owned by the
   PRODUCT OWNER (the 0094 §D notify idiom), due in 24 hours; its cause the product_events row that recorded the pause. */
CREATE OR REPLACE FUNCTION products.notify_subscription_owner(p_tenant uuid, p_domain uuid, s products.event_subscriptions, r products.products_current, p_reason text, p_cause_event uuid, p_cause_type text, p_measure jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
SET search_path = executive, identity, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_title text; v_reasons jsonb;
BEGIN
  v_state := CASE WHEN EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = r.owner_principal_id AND p.kind = 'human' AND p.status = 'active') THEN 'open' ELSE 'unrouted' END;
  v_title := left(CASE p_reason WHEN 'lag' THEN format('Subscription lagging beyond policy: %s (consumer %s)', r.title, left(s.consumer_principal_id::text, 8))
                                ELSE format('Subscription paused on a breaking schema: %s (consumer %s)', r.title, left(s.consumer_principal_id::text, 8)) END, 512);
  v_reasons := CASE p_reason
    WHEN 'lag' THEN jsonb_build_array(format('the consumer is %s events behind the head (policy: %s) and %s seconds behind the oldest unacknowledged event (policy: %s)', p_measure ->> 'lag_events', p_measure ->> 'max_lag_events', p_measure ->> 'lag_seconds', p_measure ->> 'max_lag_seconds'),
                                      'delivery is paused with the offset preserved; the consumer declares conformance, then the owner resumes (DP-43-006)')
    ELSE jsonb_build_array(format('the product now serves schema version %s (breaking) and the subscription accepted %s', p_measure ->> 'current_schema', p_measure ->> 'accepted_schema'),
                           'delivery is paused with the offset preserved; the consumer conforms to the new schema, then the owner resumes (DP-43-006)') END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'subscription.lag', 'subscription', s.subscription_id, p_cause_event, p_cause_type, v_title, 'material', v_state, r.owner_principal_id, '{}',
          jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', s.granted ->> 'consequence', 'confidence', 1)),
          jsonb_build_object('reason', p_reason, 'subscription_id', s.subscription_id, 'product_id', r.product_id, 'product_key', r.product_key, 'consumer', s.consumer_principal_id, 'checkpoint', s.checkpoint_sequence) || p_measure,
          clock_timestamp() + interval '24 hours', 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', r.owner_principal_id, 'route_roles', '[]'::jsonb, 'due_at', clock_timestamp() + interval '24 hours',
                               'cause_event_id', p_cause_event, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted', 'subscription_id', s.subscription_id), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.notify_subscription_owner(uuid,uuid,products.event_subscriptions,products.products_current,text,uuid,text,jsonb,uuid,uuid) FROM PUBLIC;

/* EVALUATE THE LAG (executive.attention.tick — the step `subscription-lag`, order 63): for every ACTIVE subscription of a released event
   product — (e) the schema: accepted an older version the current declaration BREAKS → paused (schema), the owner notified once;
   (d) the lag: head − checkpoint (events) and now − the oldest unacknowledged row's occurred instant (seconds) against the policy →
   beyond it: `lagging` (delivery paused, the OFFSET PRESERVED), `subscription.lagging` on product_events, the owner's attention item, and
   the SLO observation lag_events met false on the prelude's ledger; within it: lag_events met true (the scorecard's attainment). Both
   measures observed every tick for every active subscription (lag_events, lag_seconds). */
CREATE OR REPLACE FUNCTION products.evaluate_subscription_lag(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; ep products.event_products%ROWTYPE; r products.products_current%ROWTYPE; x record; v_head bigint; v_lag bigint; v_oldest timestamptz; v_secs numeric; v_floor timestamptz;
        v_max_e bigint; v_max_s bigint; v_over boolean; v_ev uuid; v_item uuid; v_measure jsonb; v_out jsonb := '[]'::jsonb; v_evaluated int := 0; v_lagging int := 0; v_schema int := 0; v_healthy int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR x IN SELECT sub.subscription_id FROM products.event_subscriptions sub JOIN products.products_current pc ON pc.product_id = sub.product_id
            WHERE sub.tenant_id = p_tenant AND sub.domain_id = p_domain AND sub.state = 'active' AND pc.state IN ('released', 'degraded') ORDER BY sub.registered_at, sub.subscription_id LOOP
    SELECT * INTO s FROM products.event_subscriptions y WHERE y.subscription_id = x.subscription_id FOR UPDATE;
    SELECT * INTO ep FROM products.event_products y WHERE y.product_id = s.product_id;
    SELECT * INTO r FROM products.products_current y WHERE y.product_id = s.product_id;
    v_evaluated := v_evaluated + 1;
    -- (e) the schema compatibility
    IF s.schema_version <> ep.schema_version AND ep.compatibility = 'breaking' THEN
      v_ev := gen_random_uuid();
      v_measure := jsonb_build_object('current_schema', ep.schema_version, 'accepted_schema', s.schema_version, 'declaration_version', ep.declaration_version);
      UPDATE products.event_subscriptions SET state = 'paused', paused_reason = 'schema', paused_at = clock_timestamp(), pause_note = format('the product now serves schema %s (breaking); the subscription accepted %s', ep.schema_version, s.schema_version), updated_at = clock_timestamp()
       WHERE subscription_id = s.subscription_id RETURNING * INTO s;
      INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
      VALUES (v_ev, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.paused', p_actor, jsonb_build_object('subscription_id', s.subscription_id, 'reason', 'schema', 'checkpoint', s.checkpoint_sequence) || v_measure, p_correlation);
      v_item := products.notify_subscription_owner(p_tenant, p_domain, s, r, 'schema', v_ev, 'subscription.paused', v_measure, p_actor, p_correlation);
      v_schema := v_schema + 1;
      v_out := v_out || jsonb_build_object('subscription_id', s.subscription_id, 'outcome', 'paused_schema', 'item_id', v_item);
      CONTINUE;
    END IF;
    -- (d) the lag against the policy
    v_floor := clock_timestamp() - make_interval(days => ep.retention_days);
    v_head := coalesce((SELECT max(y.sequence) FROM products.event_stream y WHERE y.product_id = s.product_id), 0);
    v_lag := greatest(v_head - s.checkpoint_sequence, 0);
    SELECT min(y.occurred_at) INTO v_oldest FROM products.event_stream y WHERE y.product_id = s.product_id AND y.sequence > s.checkpoint_sequence AND y.occurred_at >= v_floor;
    v_secs := CASE WHEN v_oldest IS NULL THEN 0 ELSE round(extract(epoch FROM clock_timestamp() - v_oldest)::numeric, 3) END;
    v_max_e := (s.lag_policy ->> 'max_lag_events')::bigint; v_max_s := (s.lag_policy ->> 'max_lag_seconds')::bigint;
    v_over := v_lag > v_max_e OR v_secs > v_max_s;
    v_measure := jsonb_build_object('lag_events', v_lag, 'max_lag_events', v_max_e, 'lag_seconds', v_secs, 'max_lag_seconds', v_max_s, 'head', v_head, 'oldest_unacknowledged_at', v_oldest);
    PERFORM products.observe_slo(gen_random_uuid(), s.product_id, p_tenant, p_domain, 'lag_events', v_lag, v_max_e, v_lag <= v_max_e, 'subscription-lag tick',
                                 jsonb_build_object('subscription_id', s.subscription_id, 'consumer', s.consumer_principal_id, 'head', v_head, 'checkpoint', s.checkpoint_sequence), p_actor, p_correlation);
    PERFORM products.observe_slo(gen_random_uuid(), s.product_id, p_tenant, p_domain, 'lag_seconds', v_secs, v_max_s, v_secs <= v_max_s, 'subscription-lag tick',
                                 jsonb_build_object('subscription_id', s.subscription_id, 'consumer', s.consumer_principal_id, 'oldest_unacknowledged_at', v_oldest), p_actor, p_correlation);
    IF v_over THEN
      v_ev := gen_random_uuid();
      UPDATE products.event_subscriptions SET state = 'lagging', paused_reason = 'lag', paused_at = clock_timestamp(), pause_note = format('%s events and %s seconds behind (policy %s / %s)', v_lag, v_secs, v_max_e, v_max_s), updated_at = clock_timestamp()
       WHERE subscription_id = s.subscription_id RETURNING * INTO s;
      INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
      VALUES (v_ev, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.lagging', p_actor, jsonb_build_object('subscription_id', s.subscription_id, 'consumer', s.consumer_principal_id, 'checkpoint', s.checkpoint_sequence) || v_measure, p_correlation);
      v_item := products.notify_subscription_owner(p_tenant, p_domain, s, r, 'lag', v_ev, 'subscription.lagging', v_measure, p_actor, p_correlation);
      v_lagging := v_lagging + 1;
      v_out := v_out || jsonb_build_object('subscription_id', s.subscription_id, 'outcome', 'lagging', 'item_id', v_item, 'lag_events', v_lag, 'lag_seconds', v_secs);
    ELSE
      v_healthy := v_healthy + 1;
      v_out := v_out || jsonb_build_object('subscription_id', s.subscription_id, 'outcome', 'healthy', 'lag_events', v_lag, 'lag_seconds', v_secs);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('evaluated', v_evaluated, 'lagging', v_lagging, 'paused_schema', v_schema, 'healthy', v_healthy, 'subscriptions', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.evaluate_subscription_lag(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.evaluate_subscription_lag(uuid,uuid,uuid,uuid) TO eye_commit;

/* PAUSE (products.subscription.pause): the owner's or a steward's act on an active subscription, with a reason; the offset preserved. */
CREATE OR REPLACE FUNCTION products.pause_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; r products.products_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.pause']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): paused by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  IF NOT products.event_owner_or_steward(r.owner_principal_id, p_actor, p_tenant, p_domain) THEN RAISE EXCEPTION 'subscription rejected (authority): a subscription is paused by the product''s owner or by a data steward' USING ERRCODE = '42501'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; only an active subscription is paused', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'subscription rejected (reason): a pause says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE products.event_subscriptions SET state = 'paused', paused_reason = 'owner', pause_note = btrim(p_reason), paused_at = clock_timestamp(), updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.paused', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'reason', 'owner', 'note', btrim(p_reason), 'checkpoint', s.checkpoint_sequence), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.pause_subscription(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.pause_subscription(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* CONFORM (products.subscription.conform): the CONSUMER's own declaration on a paused or lagging subscription — it caught up and can
   process ({caught_up, can_process, note?, schema_version?, handles_corrections?}); a named schema version must be the product's current
   (the subscription then accepts it); the row keeps the declaration. Resumption stays the owner's word. */
CREATE OR REPLACE FUNCTION products.conform_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_declaration jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; ep products.event_products%ROWTYPE; v_schema text; v_hc boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.conform']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): conformance is declared by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'subscription rejected (not_consumer): conformance is declared by the subscription''s consumer' USING ERRCODE = '42501'; END IF;
  IF s.state NOT IN ('paused', 'lagging') THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; conformance is declared on a paused or lagging subscription', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  IF p_declaration IS NULL OR jsonb_typeof(p_declaration) <> 'object' OR jsonb_typeof(p_declaration -> 'caught_up') <> 'boolean' OR jsonb_typeof(p_declaration -> 'can_process') <> 'boolean' THEN
    RAISE EXCEPTION 'subscription rejected (conformance): a conformance declares caught_up and can_process (booleans), optionally a note, the schema_version now accepted and handles_corrections' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_declaration ->> 'caught_up')::boolean OR NOT (p_declaration ->> 'can_process')::boolean THEN
    RAISE EXCEPTION 'subscription rejected (conformance): a consumer that has not caught up or cannot process the stream has not conformed' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  v_schema := s.schema_version;
  IF p_declaration ? 'schema_version' THEN
    IF jsonb_typeof(p_declaration -> 'schema_version') <> 'string' OR (p_declaration ->> 'schema_version') <> ep.schema_version THEN
      RAISE EXCEPTION 'subscription rejected (schema): the product serves schema version %; a conformance accepts the current version', ep.schema_version USING ERRCODE = '22023';
    END IF;
    v_schema := ep.schema_version;
  END IF;
  v_hc := s.handles_corrections;
  IF p_declaration ? 'handles_corrections' THEN
    IF jsonb_typeof(p_declaration -> 'handles_corrections') <> 'boolean' THEN RAISE EXCEPTION 'subscription rejected (conformance): handles_corrections is a boolean' USING ERRCODE = '22023'; END IF;
    v_hc := (p_declaration ->> 'handles_corrections')::boolean;
    IF NOT v_hc AND products.event_source_emits_corrections(ep.source) THEN RAISE EXCEPTION 'subscription rejected (capability): the source ledger % carries correction events; a consumer that cannot process corrections has not conformed', ep.source ->> 'ledger' USING ERRCODE = '22023'; END IF;
  END IF;
  UPDATE products.event_subscriptions
     SET conformance = p_declaration || jsonb_build_object('declared_at', clock_timestamp(), 'declared_by', p_actor, 'paused_reason', s.paused_reason, 'checkpoint', s.checkpoint_sequence),
         conformed_at = clock_timestamp(), schema_version = v_schema, handles_corrections = v_hc, updated_at = clock_timestamp()
   WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.conformed', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'paused_reason', s.paused_reason, 'schema_version', v_schema, 'checkpoint', s.checkpoint_sequence, 'declaration', p_declaration), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.conform_subscription(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.conform_subscription(uuid,uuid,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

/* RESUME (products.subscription.resume): the owner's or a steward's word on a paused or lagging subscription — refused before the
   consumer's conformance (declared after the pause), while a lag pause still exceeds the policy, or while a schema pause's accepted
   version is still the broken one. The checkpoint is where it was. */
CREATE OR REPLACE FUNCTION products.resume_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE; v_head bigint; v_reason text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.resume']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): resumed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  IF NOT products.event_owner_or_steward(r.owner_principal_id, p_actor, p_tenant, p_domain) THEN RAISE EXCEPTION 'subscription rejected (authority): a subscription is resumed by the product''s owner or by a data steward' USING ERRCODE = '42501'; END IF;
  IF s.state NOT IN ('paused', 'lagging') THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; only a paused or lagging subscription is resumed', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  IF s.conformed_at IS NULL OR s.conformed_at < s.paused_at THEN
    RAISE EXCEPTION 'subscription rejected (state): subscription % is % (%) and its consumer has not declared conformance since the pause; conformance is required before resumption (DP-43-006)', p_subscription_id, s.state, s.paused_reason USING ERRCODE = '22023';
  END IF;
  IF s.paused_reason = 'schema' AND s.schema_version <> ep.schema_version THEN
    RAISE EXCEPTION 'subscription rejected (schema): subscription % still accepts schema % while the product serves % (breaking); the consumer conforms to the current version first', p_subscription_id, s.schema_version, ep.schema_version USING ERRCODE = '22023';
  END IF;
  IF s.paused_reason = 'lag' THEN
    v_head := coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = s.product_id), 0);
    IF v_head - s.checkpoint_sequence > (s.lag_policy ->> 'max_lag_events')::bigint THEN
      RAISE EXCEPTION 'subscription rejected (lag): subscription % is still % events behind the head (policy %); the consumer catches up before the owner resumes', p_subscription_id, v_head - s.checkpoint_sequence, s.lag_policy ->> 'max_lag_events' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_reason := s.paused_reason;
  UPDATE products.event_subscriptions SET state = 'active', paused_reason = NULL, pause_note = NULL, paused_at = NULL, updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.resumed', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'cleared_reason', v_reason, 'conformed_at', s.conformed_at, 'checkpoint', s.checkpoint_sequence), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.resume_subscription(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.resume_subscription(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* REPLAY (products.subscription.replay): the consumer's own act on an active subscription that can process replays, under the product's
   replay policy — the checkpoint moves BACK to p_from_sequence (the consumer re-reads from there), within retention; recorded with the
   from / to sequences and the reason. */
CREATE OR REPLACE FUNCTION products.replay_subscription(p_replay_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_from_sequence bigint, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; ep products.event_products%ROWTYPE; v_floor timestamptz; v_at timestamptz; v_from bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): a replay is requested by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'subscription rejected (not_consumer): a replay is requested by the subscription''s consumer' USING ERRCODE = '42501'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is %; a replay is requested on an active subscription', p_subscription_id, s.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  IF NOT s.handles_replays THEN RAISE EXCEPTION 'subscription rejected (capability): subscription % declared it cannot process replays', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF NOT coalesce((ep.replay_policy ->> 'allowed')::boolean, false) THEN RAISE EXCEPTION 'subscription rejected (replay_policy): the event product''s replay policy does not allow a replay' USING ERRCODE = '22023'; END IF;
  IF p_from_sequence IS NULL OR p_from_sequence < 0 OR p_from_sequence >= s.checkpoint_sequence THEN
    RAISE EXCEPTION 'subscription rejected (sequence): a replay moves the checkpoint back; % is not before the checkpoint %', coalesce(p_from_sequence::text, 'null'), s.checkpoint_sequence USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'subscription rejected (reason): a replay says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_floor := clock_timestamp() - make_interval(days => ep.retention_days);
  SELECT x.occurred_at INTO v_at FROM products.event_stream x WHERE x.product_id = s.product_id AND x.sequence = p_from_sequence + 1;
  IF v_at IS NULL OR v_at < v_floor THEN RAISE EXCEPTION 'subscription rejected (retention): sequence % is older than the product''s retention of % days (or not in the stream); a replay stays within retention', p_from_sequence + 1, ep.retention_days USING ERRCODE = '22023'; END IF;
  v_from := s.checkpoint_sequence;
  INSERT INTO products.subscription_replays (replay_id, subscription_id, tenant_id, domain_id, from_sequence, to_sequence, reason, requested_by, correlation_id)
  VALUES (p_replay_id, p_subscription_id, p_tenant, p_domain, v_from, p_from_sequence, btrim(p_reason), p_actor, p_correlation);
  INSERT INTO products.subscription_checkpoints (checkpoint_id, subscription_id, tenant_id, domain_id, kind, from_sequence, to_sequence, acknowledged_by, correlation_id)
  VALUES (gen_random_uuid(), p_subscription_id, p_tenant, p_domain, 'replay', v_from, p_from_sequence, p_actor, p_correlation);
  UPDATE products.event_subscriptions SET checkpoint_sequence = p_from_sequence, checkpoint_at = clock_timestamp(), updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'events.replayed', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'replay_id', p_replay_id, 'from_sequence', v_from, 'to_sequence', p_from_sequence, 'reason', btrim(p_reason)), p_correlation);
  RETURN products.subscription_json(s) || jsonb_build_object('replay_id', p_replay_id, 'replayed_from', v_from);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.replay_subscription(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.replay_subscription(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid) TO eye_commit;

/* REVOKE (products.subscription.revoke): the owner's or a steward's act, with a reason; the offsets preserved on the row; every later
   read refused. Terminal. */
CREATE OR REPLACE FUNCTION products.revoke_subscription(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; r products.products_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): revoked by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  IF NOT products.event_owner_or_steward(r.owner_principal_id, p_actor, p_tenant, p_domain) THEN RAISE EXCEPTION 'subscription rejected (authority): a subscription is revoked by the product''s owner or by a data steward' USING ERRCODE = '42501'; END IF;
  IF s.state = 'revoked' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % was revoked at %', p_subscription_id, s.revoked_at USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'subscription rejected (reason): a revocation says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE products.event_subscriptions SET state = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_actor, revocation_reason = btrim(p_reason), updated_at = clock_timestamp() WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.revoked', p_actor, jsonb_build_object('subscription_id', p_subscription_id, 'reason', btrim(p_reason), 'checkpoint_preserved', s.checkpoint_sequence, 'consumer', s.consumer_principal_id), p_correlation);
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.revoke_subscription(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.revoke_subscription(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* THE READS (invoker reads under the caller's RLS): the event product with its stream head, its retention floor and its subscriptions with
   their lag; a subscription with its product, head, lag, checkpoints and replays. NULL outside the caller's scope. */
CREATE OR REPLACE FUNCTION products.event_product_read(p_product_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT products.product_json(r)
         || jsonb_build_object(
              'event', products.event_product_json(ep),
              'emits_corrections', products.event_source_emits_corrections(ep.source),
              'head', coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = r.product_id), 0),
              'retention_floor', clock_timestamp() - make_interval(days => ep.retention_days),
              'stream', (SELECT jsonb_build_object('rows', count(*), 'within_retention', count(*) FILTER (WHERE x.occurred_at >= clock_timestamp() - make_interval(days => ep.retention_days)),
                                                   'oldest_at', min(x.occurred_at), 'newest_at', max(x.occurred_at),
                                                   'by_kind', (SELECT coalesce(jsonb_object_agg(k.event_kind, k.n), '{}'::jsonb) FROM (SELECT y.event_kind, count(*) n FROM products.event_stream y WHERE y.product_id = r.product_id GROUP BY y.event_kind) k))
                           FROM products.event_stream x WHERE x.product_id = r.product_id),
              'subscriptions', coalesce((SELECT jsonb_agg(products.subscription_json(s) || jsonb_build_object(
                                                   'lag_events', greatest(coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = r.product_id), 0) - s.checkpoint_sequence, 0),
                                                   'oldest_unacknowledged_at', (SELECT min(x.occurred_at) FROM products.event_stream x WHERE x.product_id = r.product_id AND x.sequence > s.checkpoint_sequence)) ORDER BY s.registered_at)
                                          FROM products.event_subscriptions s WHERE s.product_id = r.product_id), '[]'::jsonb),
              'slo', coalesce((SELECT jsonb_object_agg(m.measure, jsonb_build_object('value', m.value, 'threshold', m.threshold, 'met', m.met, 'observed_at', m.observed_at, 'source', m.source, 'details', m.details))
                                 FROM (SELECT DISTINCT ON (o.measure) o.* FROM products.slo_observations o WHERE o.product_id = r.product_id AND o.measure IN ('lag_events', 'lag_seconds') ORDER BY o.measure, o.observed_at DESC) m), '{}'::jsonb))
    FROM products.products_current r JOIN products.event_products ep ON ep.product_id = r.product_id WHERE r.product_id = p_product_id
$$;
GRANT EXECUTE ON FUNCTION products.event_product_read(uuid) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION products.subscription_read(p_subscription_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT products.subscription_json(s)
         || jsonb_build_object(
              'product', jsonb_build_object('product_id', r.product_id, 'product_key', r.product_key, 'title', r.title, 'state', r.state, 'owner_principal_id', r.owner_principal_id,
                                            'schema_version', ep.schema_version, 'compatibility', ep.compatibility, 'retention_days', ep.retention_days, 'subject_kind', ep.subject_kind, 'emits_corrections', products.event_source_emits_corrections(ep.source)),
              'head', coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = r.product_id), 0),
              'lag_events', greatest(coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = r.product_id), 0) - s.checkpoint_sequence, 0),
              'oldest_unacknowledged_at', (SELECT min(x.occurred_at) FROM products.event_stream x WHERE x.product_id = r.product_id AND x.sequence > s.checkpoint_sequence),
              'retention_floor', clock_timestamp() - make_interval(days => ep.retention_days),
              'checkpoints', coalesce((SELECT jsonb_agg((to_jsonb(c) - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY c.acknowledged_at DESC) FROM (SELECT * FROM products.subscription_checkpoints y WHERE y.subscription_id = s.subscription_id ORDER BY y.acknowledged_at DESC LIMIT 20) c), '[]'::jsonb),
              'replays', coalesce((SELECT jsonb_agg((to_jsonb(y) - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY y.requested_at DESC) FROM products.subscription_replays y WHERE y.subscription_id = s.subscription_id), '[]'::jsonb))
    FROM products.event_subscriptions s JOIN products.products_current r ON r.product_id = s.product_id JOIN products.event_products ep ON ep.product_id = s.product_id
   WHERE s.subscription_id = p_subscription_id
$$;
GRANT EXECUTE ON FUNCTION products.subscription_read(uuid) TO eye_app, eye_commit;
-- end section `events`
