-- 0015: Gate-2.2 C7 — outbox suppression / publishing hardening.
--
-- GOVERNED FORWARD MIGRATION. 0001–0014 remain byte-identical.
--
-- Findings:
--   * objects.outbox_lease passed p_lease_seconds straight into make_interval,
--     so a single publish could take a lease for an arbitrary duration —
--     e.g. 10^9 seconds — permanently suppressing delivery of a row.
--   * `attempts` was incremented on every lease but never bounded: a row that
--     could never be published (poison payload) would be re-leased forever with
--     no dead-letter, another form of silent suppression.
--
-- Correction: a bounded lease TTL, a retry budget with a governed dead-letter
-- transition, and terminal-vs-retryable acknowledgement — all still gated by the
-- publish capability and tied to the lease token (compare-and-set).

-- Terminal dead-letter state for retry-exhausted rows.
ALTER TABLE objects.object_outbox DROP CONSTRAINT IF EXISTS object_outbox_status_check;
ALTER TABLE objects.object_outbox ADD CONSTRAINT object_outbox_status_check
  CHECK (status = ANY (ARRAY['pending','published','failed','dead_letter']));

-- Bounded lease + automatic dead-lettering of retry-exhausted rows.
-- The retry budget is 10: a row that has been leased 10 times without being
-- acknowledged published is poison and is moved to dead_letter rather than being
-- leased an 11th time. The lease TTL is clamped to [1, 300] seconds so no single
-- publish can suppress a row beyond five minutes.
CREATE OR REPLACE FUNCTION objects.outbox_lease(p_limit int, p_lease_seconds int DEFAULT 60)
RETURNS TABLE (id uuid, lease_id uuid, event_type text, payload jsonb,
               correlation_id uuid, causation_id uuid, tenant_id uuid, domain_id uuid)
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
DECLARE
  v_lease uuid := gen_random_uuid();
  v_ttl int := least(greatest(coalesce(p_lease_seconds, 60), 1), 300);
  v_budget constant int := 10;
BEGIN
  PERFORM ctx.assert_capability('publish', 'outbox', 'objects.outbox.publish');

  -- Retry budget: retire poison rows to dead_letter BEFORE handing out leases,
  -- so they can never be re-leased once exhausted.
  UPDATE objects.object_outbox o
     SET status = 'dead_letter', lease_id = NULL, leased_until = NULL
   WHERE o.status = 'pending'
     AND o.attempts >= v_budget
     AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp());

  RETURN QUERY
  WITH claimed AS (
    SELECT o.id FROM objects.object_outbox o
     WHERE o.status = 'pending'
       AND o.attempts < v_budget
       AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp())
     ORDER BY o.created_at
     LIMIT least(greatest(coalesce(p_limit, 50), 1), 500)
     FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE objects.object_outbox o
       SET lease_id = v_lease,
           leased_until = clock_timestamp() + make_interval(secs => v_ttl),
           attempts = o.attempts + 1
      FROM claimed c WHERE o.id = c.id
      RETURNING o.id, o.lease_id, o.event_type, o.payload, o.correlation_id,
                o.causation_id, o.tenant_id, o.domain_id
  )
  SELECT * FROM leased;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_lease(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_lease(int, int) TO eye_publisher;

-- Acknowledgement is compare-and-set on the LEASE, and the terminal target is
-- restricted: published (success) or dead_letter (terminal failure). A retryable
-- failure uses outbox_release instead, which returns the row to the pool.
CREATE OR REPLACE FUNCTION objects.outbox_ack_leased(
  p_id uuid, p_lease_id uuid, p_from text, p_to text
) RETURNS boolean
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
DECLARE v_n int;
BEGIN
  PERFORM ctx.assert_capability('publish', 'outbox', 'objects.outbox.publish');
  IF p_from <> 'pending' OR p_to NOT IN ('published','failed','dead_letter') THEN
    RAISE EXCEPTION 'outbox ack rejected: transition %->% is not permitted', p_from, p_to
      USING ERRCODE = '42501';
  END IF;
  UPDATE objects.object_outbox
     SET status = p_to,
         published_at = CASE WHEN p_to = 'published' THEN clock_timestamp() ELSE published_at END,
         lease_id = NULL, leased_until = NULL
   WHERE id = p_id AND status = p_from AND lease_id = p_lease_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_ack_leased(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_ack_leased(uuid, uuid, text, text) TO eye_publisher;

-- Retryable release: give a leased row back to the pool WITHOUT consuming a
-- terminal transition (the attempt was already counted at lease time). Tied to
-- the lease token, so only the holder can release.
CREATE OR REPLACE FUNCTION objects.outbox_release(p_id uuid, p_lease_id uuid)
RETURNS boolean
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
DECLARE v_n int;
BEGIN
  PERFORM ctx.assert_capability('publish', 'outbox', 'objects.outbox.publish');
  UPDATE objects.object_outbox
     SET lease_id = NULL, leased_until = NULL
   WHERE id = p_id AND status = 'pending' AND lease_id = p_lease_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_release(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_release(uuid, uuid) TO eye_publisher;
