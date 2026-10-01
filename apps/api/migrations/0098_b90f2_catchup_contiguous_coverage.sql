-- 0098 — CP-6 B90-F1, second pass (2026-10-01, the owner's bounded review): the catch-up's COVERAGE made contiguous. Forward only: 0095,
-- 0096 and 0097 are applied (0096 on the demonstration) and untouched; the Phase 0 schemas gain nothing.
--
-- The finding: 0096's products.catch_up_subscription_events accepted any afterSequence between the checkpoint and the frozen backlog head,
-- then advanced catchup_served_through to the scanned endpoint without checking that the skipped prefix had been served. With checkpoint 1,
-- frozen head 4 and events 2–4 unread, a catch-up from 4 served nothing yet marked 4 as served — the acknowledgement of 4, the conformance and
-- the resumption could then succeed over three unread events; a catch-up from 3 served only event 4 while crediting 2–3.
--
-- The correction (the port re-declared — 0096's body whole, ONE check added): a batch starts at or before the served mark
-- (coalesce(catchup_served_through, checkpoint_sequence)); a later start is refused `subscription rejected (backlog)` (409) and the ledger
-- records nothing. A retry (re-reading from the checkpoint or from any earlier served point) is unchanged; rows the grant, the window, the
-- filters or the retention exclude are still passed over WITHIN a contiguous scan, as the ordinary read passes them over; the frozen head,
-- the batch bound, the projection and the correction withholding are unchanged.

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
  -- B90-F1 (0098): CONTIGUOUS COVERAGE from the checkpoint — a batch starts at or before what has already been served (the checkpoint, or
  -- the served-through mark of an earlier batch), never past it: a caller-chosen cursor may re-read (a retry) but may not skip unread events
  -- and have the served mark credit them
  IF v_after > coalesce(s.catchup_served_through, s.checkpoint_sequence) THEN
    RAISE EXCEPTION 'subscription rejected (backlog): a catch-up from sequence % would skip events never served — coverage runs contiguously from the checkpoint % and has reached %; continue from at most %',
      v_after, s.checkpoint_sequence, coalesce(s.catchup_served_through, s.checkpoint_sequence), coalesce(s.catchup_served_through, s.checkpoint_sequence) USING ERRCODE = '22023';
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
