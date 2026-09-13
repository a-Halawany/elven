-- ============================================================
-- 0054 · The evidence figures are read through a PORT, because a long scan under
--        row-level security silently loses its own context.
--
-- WHAT WAS FOUND. `public.eye_ctx3` — the reader every row-level policy calls — expires
-- ON THE WALL CLOCK ("a one-second context dies one second later even inside a single
-- long transaction") and verifies an HMAC on every call. A policy quale therefore runs
-- that check ONCE PER ROW, and a statement that scans thousands of rows can cross its
-- own context's expiry PART OF THE WAY THROUGH: the rows scanned before it are visible,
-- the rows after it are not, and the statement returns a SMALLER NUMBER instead of an
-- error. Read back three times against a database nobody was writing to, the
-- demonstration's evidence figure for `imf-portwatch-ports` answered 336, then 314,
-- then 320, against 4,984 objects actually held.
--
-- That is a counting read that cannot be trusted, and it is worse than a slow one: a
-- register that under-reports evidence looks like a source that collected less, not
-- like a read that ran out of time.
--
-- THE FIX IS TO ASK ONCE. The scope check belongs at the boundary — once, for the whole
-- question — exactly as every other observation port asserts authority and scope once
-- and then does its work. This function establishes the caller's scope, then counts
-- without re-deriving the caller's identity for every row it passes.
--
-- The three figures stay three figures: objects held, distinct observations, and what
-- no longer stands as current evidence (0051 §5).
--
-- Forward only.
-- ============================================================
CREATE OR REPLACE FUNCTION observation.evidence_counts(
  p_tenant uuid, p_domain uuid, p_source_id uuid
) RETURNS TABLE (objects_held bigint, distinct_observations bigint, superseded_objects bigint)
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  -- ONCE, at the boundary: the caller's scope must be this tenant and domain. Nothing
  -- below re-derives it, which is the whole point.
  PERFORM observation.assert_scope(p_tenant, p_domain);

  RETURN QUERY
  WITH held AS (
    SELECT DISTINCT ON (e.object_id)
           e.object_id, e.lifecycle_state,
           coalesce(o.payload ->> 'item_key', e.object_id::text) AS item_key
      FROM objects.canonical_objects e
      LEFT JOIN objects.canonical_objects o
        ON o.object_type = 'OBS' AND o.object_id::text = e.payload ->> 'obs_object_id'
       AND o.object_version = 1
     WHERE e.object_type = 'EVD'
       AND e.tenant_id = p_tenant AND e.domain_id = p_domain
       AND e.provenance_ref LIKE 'SRC:' || p_source_id::text || '@%'
     ORDER BY e.object_id, e.object_version DESC)
  SELECT count(*)::bigint,
         count(DISTINCT item_key)::bigint,
         count(*) FILTER (WHERE lifecycle_state IN ('corrected', 'withdrawn'))::bigint
    FROM held;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.evidence_counts(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.evidence_counts(uuid,uuid,uuid) TO eye_app, eye_commit;
