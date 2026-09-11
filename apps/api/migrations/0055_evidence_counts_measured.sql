-- ============================================================
-- 0055 · The evidence-count port, measured.
--
-- 0054 moved the three figures behind a port so the caller's scope is established once.
-- Read back against the demonstration it STILL answered 318, then 316, then 302 for a
-- source holding 4,984 objects — so the boundary was not the whole cost. This version
-- computes the same three figures over a set built ONCE and reports, beside them, the
-- plain count of the rows the same predicate selects, so the two can be compared by a
-- reader instead of guessed at.
--
-- Forward only.
-- ============================================================
DROP FUNCTION IF EXISTS observation.evidence_counts(uuid,uuid,uuid);

CREATE OR REPLACE FUNCTION observation.evidence_counts(
  p_tenant uuid, p_domain uuid, p_source_id uuid
) RETURNS TABLE (objects_held bigint, distinct_observations bigint,
                 superseded_objects bigint, rows_matched bigint)
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_prefix text := 'SRC:' || p_source_id::text || '@%';
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);

  RETURN QUERY
  WITH rows_all AS (
    SELECT e.object_id, e.object_version, e.lifecycle_state, e.payload ->> 'obs_object_id' AS obs
      FROM objects.canonical_objects e
     WHERE e.object_type = 'EVD'
       AND e.tenant_id = p_tenant AND e.domain_id = p_domain
       AND e.provenance_ref LIKE v_prefix),
  latest AS (
    SELECT DISTINCT ON (object_id) object_id, lifecycle_state, obs
      FROM rows_all ORDER BY object_id, object_version DESC),
  held AS (
    SELECT l.object_id, l.lifecycle_state,
           coalesce(o.payload ->> 'item_key', l.object_id::text) AS item_key
      FROM latest l
      LEFT JOIN objects.canonical_objects o
        ON o.object_type = 'OBS' AND o.object_id::text = l.obs AND o.object_version = 1)
  SELECT (SELECT count(*) FROM held)::bigint,
         (SELECT count(DISTINCT item_key) FROM held)::bigint,
         (SELECT count(*) FROM held WHERE lifecycle_state IN ('corrected', 'withdrawn'))::bigint,
         (SELECT count(*) FROM rows_all)::bigint;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.evidence_counts(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.evidence_counts(uuid,uuid,uuid) TO eye_app, eye_commit;
