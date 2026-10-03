-- 0096 — CP-6 B90-F1 (2026-09-30, the owner's bounded B90 review): THE SUBSCRIPTION CATCH-UP. Forward only: 0095 is applied on the
-- demonstration and untouched here; the Phase 0 schemas gain nothing.
--
-- The finding: a subscription flagged LAGGING could not read its backlog (the read refuses paused and lagging subscriptions; a replay needs
-- an active one; the owner's resumption refused while the backlog exceeded the policy), yet the consumer could ACKNOWLEDGE past events it had
-- never been served — so the only way out of the pause was to move the checkpoint over unread data (DP-43-005: never infer recovered data
-- state; DP-43-006: lag and replay admission).
--
-- The correction, inside the existing authority model:
--   1. THE AUTHORIZED BACKLOG is frozen when the tick flags a subscription lagging: event_subscriptions.catchup_head = the head the tick
--      measured, catchup_served_through = the checkpoint (evaluate_subscription_lag re-declared with that one change).
--   2. THE CATCH-UP (products.catch_up_subscription_events, action products.subscription.catch_up): the CONSUMER's own act on a LAGGING
--      subscription only — serves the backlog after the checkpoint (or after a given sequence ≥ it) and never past catchup_head, in bounded
--      batches (≤ 100 rows), with EXACTLY the ordinary read's controls: the granted fields' projection, the time window, the filters, the
--      retention floor, the correction withholding. Every batch is a row of products.subscription_catchups (the sequences served, a digest of
--      the served payloads) and `events.caught_up` on the product's ledger. Ordinary delivery stays PAUSED: the read still refuses a lagging
--      subscription, and nothing past the frozen head is served by the catch-up.
--   3. ACKNOWLEDGEMENT WHILE LAGGING only through what the catch-up served (advance_checkpoint re-declared: `(backlog)` refusal).
--   4. CONFORMANCE of a lag pause requires the backlog acknowledged (checkpoint ≥ catchup_head) — the declaration is kept as before
--      (conform_subscription re-declared with that one check); RESUMPTION stays the owner's word and requires the same (resume_subscription
--      re-declared: judged against the frozen backlog, not the moving head — events arrived since are ordinary delivery after resumption, and
--      the next tick judges them against the policy again). The read's lagging refusal names the catch-up route (read re-declared: the text only).
-- A schema pause, an owner pause, revocation and replay are unchanged.

ALTER TABLE products.event_subscriptions ADD COLUMN catchup_head bigint CHECK (catchup_head IS NULL OR catchup_head >= 0);
ALTER TABLE products.event_subscriptions ADD COLUMN catchup_served_through bigint CHECK (catchup_served_through IS NULL OR catchup_served_through >= 0);
COMMENT ON COLUMN products.event_subscriptions.catchup_head IS 'B90-F1 (0096): the stream head when the tick last flagged the subscription lagging — the authorized backlog the catch-up may serve';
COMMENT ON COLUMN products.event_subscriptions.catchup_served_through IS 'B90-F1 (0096): the highest sequence the catch-up has served since the lag (reset to the checkpoint when the lag is flagged); a lagging acknowledgement may not pass it';
-- a subscription lagging when this migration applies: its backlog frozen at the current head, nothing served yet
UPDATE products.event_subscriptions s
   SET catchup_head = coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = s.product_id), s.checkpoint_sequence), catchup_served_through = s.checkpoint_sequence
 WHERE s.state = 'lagging';

CREATE TABLE products.subscription_catchups (
  catchup_id        uuid PRIMARY KEY,
  subscription_id   uuid NOT NULL REFERENCES products.event_subscriptions (subscription_id),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  after_sequence    bigint NOT NULL CHECK (after_sequence >= 0),
  through_sequence  bigint NOT NULL CHECK (through_sequence >= after_sequence),   -- everything the consumer is entitled to through here was served
  backlog_head      bigint NOT NULL CHECK (backlog_head >= through_sequence),
  sequences         bigint[] NOT NULL,                                            -- the sequences served, in order
  served            int NOT NULL CHECK (served >= 0),
  omitted           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(omitted) = 'object'),
  payload_digest    text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),       -- sha256 of the served events array
  served_to         uuid NOT NULL,
  served_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL
);
CREATE INDEX pev_cu_subscription ON products.subscription_catchups (subscription_id, served_at);
CREATE TRIGGER pev_cu_append_only BEFORE UPDATE OR DELETE ON products.subscription_catchups FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.subscription_catchups IS 'B90-F1 (0096): every catch-up batch served to a lagging subscription''s consumer — the sequences, the digest of the served payloads, the backlog bound. Append-only.';
REVOKE ALL ON products.subscription_catchups FROM PUBLIC;
ALTER TABLE products.subscription_catchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE products.subscription_catchups FORCE ROW LEVEL SECURITY;
CREATE POLICY products_isolation ON products.subscription_catchups
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON products.subscription_catchups TO eye_app, eye_commit;

-- the product ledger's vocabulary (0095 §0's list whole, plus events.caught_up)
ALTER TABLE products.product_events DROP CONSTRAINT IF EXISTS product_events_event_check;
ALTER TABLE products.product_events ADD CONSTRAINT product_events_event_check CHECK (event IN (
  'product.registered', 'product.declared', 'product.reviewed', 'product.released',
  'product.degraded', 'product.restored', 'product.withdrawn', 'product.retired',
  'consumer.registered', 'consumer.accepted', 'consumer.rejected', 'consumer.revoked', 'consumer.migrated', 'contract_test.recorded', 'scorecard.computed', 'cost.attributed',
  'event_product.declared', 'events.emitted', 'subscription.registered', 'subscription.authorized', 'subscription.paused', 'subscription.resumed', 'subscription.revoked',
  'subscription.lagging', 'subscription.conformed', 'checkpoint.advanced', 'events.replayed',
  -- B90-F1 (0096)
  'events.caught_up',
  'metric.declared', 'metric.certified', 'metric.certification_withdrawn', 'metric.definition_changed', 'metric.recalculated',
  'asset.catalogued', 'asset.flagged', 'asset.reconciled', 'asset.recertified'));

/* THE CATCH-UP (products.subscription.catch_up): the CONSUMER reads its authorized backlog while LAGGING — bounded, recorded, never past the
   frozen head, under the ordinary read's projection / window / filters / retention / correction rules. */
CREATE OR REPLACE FUNCTION products.catch_up_subscription_events(p_catchup_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_after_sequence bigint, p_limit int, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; ep products.event_products%ROWTYPE; r products.products_current%ROWTYPE; v_after bigint; v_limit int; v_floor timestamptz;
        v_from timestamptz; v_to timestamptz; v_kinds text[]; v_okeys text[]; v_subjects uuid[]; v_fields text[]; v_events jsonb; v_seqs bigint[]; v_served int; v_omitted int;
        v_last bigint; v_rows int; v_through bigint; v_excluded boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.catch_up']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): a catch-up is read by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'subscription rejected (not_consumer): the backlog of a subscription is read by its consumer' USING ERRCODE = '42501'; END IF;
  IF s.state <> 'lagging' OR s.catchup_head IS NULL THEN
    RAISE EXCEPTION 'subscription rejected (state): subscription % is %; the catch-up serves the authorized backlog of a LAGGING subscription only (an active one reads; a revoked, registered or otherwise paused one is served nothing)', p_subscription_id, s.state USING ERRCODE = '22023';
  END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  v_after := coalesce(p_after_sequence, s.checkpoint_sequence);
  IF v_after < s.checkpoint_sequence THEN
    RAISE EXCEPTION 'subscription rejected (window): a catch-up from sequence % is before the checkpoint %; a replay moves the checkpoint back (DP-43-002)', v_after, s.checkpoint_sequence USING ERRCODE = '22023';
  END IF;
  IF v_after > s.catchup_head THEN
    RAISE EXCEPTION 'subscription rejected (backlog): sequence % is beyond the authorized backlog through %', v_after, s.catchup_head USING ERRCODE = '22023';
  END IF;
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 100);
  v_floor := clock_timestamp() - make_interval(days => ep.retention_days);
  v_from := CASE WHEN jsonb_typeof(s.granted -> 'from') = 'string' THEN (s.granted ->> 'from')::timestamptz END;
  v_to := CASE WHEN jsonb_typeof(s.granted -> 'to') = 'string' THEN (s.granted ->> 'to')::timestamptz END;
  SELECT array_agg(f) INTO v_fields FROM jsonb_array_elements_text(s.granted -> 'fields') f;
  IF jsonb_typeof(s.filters -> 'event_kinds') = 'array' AND jsonb_array_length(s.filters -> 'event_kinds') > 0 THEN SELECT array_agg(k) INTO v_kinds FROM jsonb_array_elements_text(s.filters -> 'event_kinds') k; END IF;
  IF jsonb_typeof(s.filters -> 'ordering_keys') = 'array' AND jsonb_array_length(s.filters -> 'ordering_keys') > 0 THEN SELECT array_agg(k) INTO v_okeys FROM jsonb_array_elements_text(s.filters -> 'ordering_keys') k; END IF;
  IF jsonb_typeof(s.filters -> 'subject_ids') = 'array' AND jsonb_array_length(s.filters -> 'subject_ids') > 0 THEN SELECT array_agg(k::uuid) INTO v_subjects FROM jsonb_array_elements_text(s.filters -> 'subject_ids') k; END IF;
  v_excluded := coalesce(jsonb_typeof(s.filters -> 'subject_kinds') = 'array' AND jsonb_array_length(s.filters -> 'subject_kinds') > 0
                         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(s.filters -> 'subject_kinds') k WHERE k = ep.subject_kind), false);
  -- the batch: the first v_limit stream rows after v_after within the backlog (the scan bound), then the entitlement filters over them
  WITH scanned AS (
    SELECT x.* FROM products.event_stream x
     WHERE x.product_id = s.product_id AND x.sequence > v_after AND x.sequence <= s.catchup_head
     ORDER BY x.sequence LIMIT v_limit),
  entitled AS (
    SELECT c.* FROM scanned c
     WHERE NOT v_excluded AND c.occurred_at >= v_floor
       AND (v_from IS NULL OR c.occurred_at >= v_from) AND (v_to IS NULL OR c.occurred_at <= v_to)
       AND (v_kinds IS NULL OR c.event_kind = ANY (v_kinds)) AND (v_okeys IS NULL OR c.ordering_key = ANY (v_okeys)) AND (v_subjects IS NULL OR c.subject_id = ANY (v_subjects)))
  SELECT (SELECT count(*) FROM scanned), (SELECT max(sequence) FROM scanned),
         coalesce((SELECT jsonb_agg(jsonb_build_object('sequence', c.sequence, 'event_kind', c.event_kind, 'source_event', c.source_event, 'subject_id', c.subject_id, 'subject_kind', ep.subject_kind, 'ordering_key', c.ordering_key,
                                                      'occurred_at', c.occurred_at, 'schema_version', c.schema_version, 'payload', products.event_projection(c.payload, v_fields)) ORDER BY c.sequence)
                     FROM entitled c WHERE s.handles_corrections OR c.event_kind <> 'correction'), '[]'::jsonb),
         coalesce((SELECT array_agg(c.sequence ORDER BY c.sequence) FROM entitled c WHERE s.handles_corrections OR c.event_kind <> 'correction'), '{}'::bigint[]),
         (SELECT count(*) FROM entitled c WHERE NOT s.handles_corrections AND c.event_kind = 'correction')
    INTO v_rows, v_last, v_events, v_seqs, v_omitted;
  v_served := coalesce(array_length(v_seqs, 1), 0);
  -- everything the consumer is entitled to through v_through has now been served: the scan's last row, or the backlog head when the scan
  -- reached its end (rows outside the grant are not the consumer's data and are passed over, as the ordinary read passes them over)
  v_through := CASE WHEN v_rows < v_limit THEN s.catchup_head ELSE v_last END;
  v_through := greatest(v_through, v_after);
  INSERT INTO products.subscription_catchups (catchup_id, subscription_id, tenant_id, domain_id, after_sequence, through_sequence, backlog_head, sequences, served, omitted, payload_digest, served_to, correlation_id)
  VALUES (p_catchup_id, p_subscription_id, p_tenant, p_domain, v_after, v_through, s.catchup_head, v_seqs, v_served,
          jsonb_build_object('corrections', v_omitted), encode(digest(v_events::text, 'sha256'), 'hex'), p_actor, p_correlation);
  UPDATE products.event_subscriptions SET catchup_served_through = greatest(coalesce(catchup_served_through, checkpoint_sequence), v_through), updated_at = clock_timestamp()
   WHERE subscription_id = p_subscription_id RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, s.product_id, 'events.caught_up', p_actor,
          jsonb_build_object('subscription_id', p_subscription_id, 'catchup_id', p_catchup_id, 'after', v_after, 'through', v_through, 'backlog_head', s.catchup_head, 'served', v_served, 'sequences', to_jsonb(v_seqs)), p_correlation);
  RETURN jsonb_build_object('catchup_id', p_catchup_id, 'subscription_id', p_subscription_id, 'product_id', s.product_id, 'product_key', r.product_key, 'state', s.state,
                            'after', v_after, 'through', v_through, 'next_after', v_through, 'backlog_head', s.catchup_head, 'remaining', s.catchup_head - v_through, 'checkpoint', s.checkpoint_sequence,
                            'served', v_served, 'omitted', jsonb_build_object('corrections', v_omitted, 'reason', CASE WHEN v_omitted > 0 THEN 'this subscription declared it cannot process corrections; the correction rows are withheld and counted' END),
                            'retention_floor', v_floor, 'window', jsonb_build_object('from', v_from, 'to', v_to), 'fields', to_jsonb(v_fields), 'events', v_events,
                            'note', CASE WHEN v_excluded THEN 'the subject kind filter excludes this product''s subject kind ' || ep.subject_kind END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.catch_up_subscription_events(uuid,uuid,uuid,uuid,bigint,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.catch_up_subscription_events(uuid,uuid,uuid,uuid,bigint,int,uuid,uuid,uuid) TO eye_commit;

-- the five ports re-declared (each copied whole from 0095 §E; the B90-F1 changes marked in each)
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
    RAISE EXCEPTION 'subscription rejected (state): subscription % is % (%); delivery is paused with the checkpoint % preserved — the consumer''s conformance and the owner''s resumption are required before reading%', p_subscription_id, s.state, s.paused_reason, s.checkpoint_sequence,
      CASE WHEN s.state = 'lagging' THEN format(' (the authorized backlog through sequence %s is served by the catch-up route)', s.catchup_head) ELSE '' END USING ERRCODE = '22023';
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
  -- B90-F1 (0096): while LAGGING the consumer acknowledges only what the CATCH-UP served it — never past an event it was not given
  IF s.state = 'lagging' AND p_sequence > s.catchup_served_through THEN
    RAISE EXCEPTION 'subscription rejected (backlog): subscription % is lagging; sequence % is beyond what the catch-up has served (through %) — the backlog through % is read through the catch-up route and processed before it is acknowledged', p_subscription_id, p_sequence, s.catchup_served_through, s.catchup_head USING ERRCODE = '22023';
  END IF;
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
      -- B90-F1 (0096): the AUTHORIZED BACKLOG frozen at the head the tick measured; the catch-up serves it, nothing past it
      UPDATE products.event_subscriptions SET state = 'lagging', paused_reason = 'lag', paused_at = clock_timestamp(), pause_note = format('%s events and %s seconds behind (policy %s / %s)', v_lag, v_secs, v_max_e, v_max_s),
             catchup_head = v_head, catchup_served_through = s.checkpoint_sequence, updated_at = clock_timestamp()
       WHERE subscription_id = s.subscription_id RETURNING * INTO s;
      INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
      VALUES (v_ev, 'DOMAIN', p_tenant, p_domain, s.product_id, 'subscription.lagging', p_actor, jsonb_build_object('subscription_id', s.subscription_id, 'consumer', s.consumer_principal_id, 'checkpoint', s.checkpoint_sequence, 'catchup_head', v_head) || v_measure, p_correlation);
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
  -- B90-F1 (0096): a LAG conformance is a fact, not only a declaration — the backlog frozen at the lag was served by the catch-up and acknowledged
  IF s.paused_reason = 'lag' AND s.checkpoint_sequence < s.catchup_head THEN
    RAISE EXCEPTION 'subscription rejected (backlog): subscription % is lagging at checkpoint %; the authorized backlog through % is read through the catch-up route, processed and acknowledged before conformance', p_subscription_id, s.checkpoint_sequence, s.catchup_head USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'subscription rejected (schema_pending): subscription % still accepts schema % while the product serves % (breaking); the consumer conforms to the current version first', p_subscription_id, s.schema_version, ep.schema_version USING ERRCODE = '22023';
  END IF;
  -- B90-F1 (0096): a lag pause is lifted once the AUTHORIZED BACKLOG (frozen at the lag) is acknowledged — events that arrived since are
  -- ordinary delivery after the resumption (the next tick judges them against the policy again), so the recovery cannot chase its own head
  IF s.paused_reason = 'lag' THEN
    v_head := coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = s.product_id), 0);
    IF s.checkpoint_sequence < s.catchup_head THEN
      RAISE EXCEPTION 'subscription rejected (lag): subscription % is at checkpoint %, short of the authorized backlog through % (the head is %; policy %); the consumer catches up before the owner resumes', p_subscription_id, s.checkpoint_sequence, s.catchup_head, v_head, s.lag_policy ->> 'max_lag_events' USING ERRCODE = '22023';
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
