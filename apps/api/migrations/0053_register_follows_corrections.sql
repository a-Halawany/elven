-- ============================================================
-- 0053 · The admission register indexes evidence that STANDS.
--
-- The register of 0051 §3 holds one row per (source, deterministic item key) naming
-- the evidence object currently admitted under it. A governed correction can take that
-- object out of the standing record — a withdrawal, or a supersession of a duplicate
-- copy — and the register would go on naming it: a later re-walk would then record
-- "already held" against evidence a correction had set aside.
--
-- So a correction RE-POINTS the register: to the newest surviving admission for the
-- same item key, or, when nothing survives, the row is removed and the next walk
-- admits the window afresh. The correction itself is untouched by this — nothing here
-- withdraws, deletes or revives anything; it only decides which standing object the
-- index names.
--
-- Section 2 applies the same rule once to rows that already index superseded evidence,
-- which is the state the 2,133 duplicate copies of §9.6.1 leave behind.
--
-- Forward only.
-- ============================================================

-- ============================================================
-- 1. The port the correction path calls, once per affected evidence object.
-- ============================================================
CREATE OR REPLACE FUNCTION observation.reindex_admitted_item(
  p_tenant uuid, p_domain uuid, p_source_id uuid, p_evd_object_id uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_row observation.admitted_items%ROWTYPE;
  v_next record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.correction.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  -- Only a row that actually names this object is touched. A correction on evidence
  -- the register never indexed (a forward poll, an already re-pointed key) is a no-op.
  SELECT * INTO v_row FROM observation.admitted_items
   WHERE source_id = p_source_id AND evd_object_id = p_evd_object_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('reindexed', false, 'reason', 'the register does not index this evidence object');
  END IF;

  /*
   * THE NEWEST SURVIVING ADMISSION UNDER THE SAME ITEM KEY. "Surviving" is read from
   * the object's own LATEST version: corrected and withdrawn do not stand. The digest
   * comes from that object, so idempotency continues to compare incoming bytes against
   * evidence that is really there.
   */
  SELECT e.object_id, e.object_version, e.payload ->> 'content_digest' AS content_digest,
         o.object_id AS obs_object_id, o.recorded_at
    INTO v_next
    FROM objects.canonical_objects o
    JOIN LATERAL (
      SELECT * FROM objects.canonical_objects x
       WHERE x.object_type = 'EVD' AND x.payload ->> 'obs_object_id' = o.object_id::text
       ORDER BY x.object_version DESC LIMIT 1) e ON true
   WHERE o.object_type = 'OBS'
     AND o.object_version = 1
     AND o.payload ->> 'source_id' = p_source_id::text
     AND o.payload ->> 'item_key' = v_row.item_key
     AND e.object_id <> p_evd_object_id
     AND e.lifecycle_state NOT IN ('corrected', 'withdrawn')
   ORDER BY o.recorded_at DESC, e.object_version DESC
   LIMIT 1;

  IF NOT FOUND THEN
    -- Nothing stands under this key any more. The row is removed rather than left
    -- pointing at set-aside evidence, so the next walk admits the window afresh —
    -- which is exactly what a withdrawal of the only copy should cause.
    DELETE FROM observation.admitted_items
     WHERE source_id = p_source_id AND item_key = v_row.item_key;
    RETURN jsonb_build_object('reindexed', true, 'item_key', v_row.item_key,
                              'from_evd_object_id', p_evd_object_id, 'to_evd_object_id', NULL,
                              'note', 'no surviving admission under this item key: the register no longer indexes it');
  END IF;

  UPDATE observation.admitted_items
     SET evd_object_id = v_next.object_id, obs_object_id = v_next.obs_object_id,
         object_version = v_next.object_version, content_digest = v_next.content_digest
   WHERE source_id = p_source_id AND item_key = v_row.item_key;
  RETURN jsonb_build_object('reindexed', true, 'item_key', v_row.item_key,
                            'from_evd_object_id', p_evd_object_id,
                            'to_evd_object_id', v_next.object_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.reindex_admitted_item(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.reindex_admitted_item(uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 2. The same rule, applied once to what is already in the register.
-- ============================================================
/*
 * A row indexing evidence whose latest version is corrected or withdrawn is re-pointed
 * to the newest surviving admission under its key. Rows with nothing surviving are left
 * exactly as they are HERE, deliberately: a migration deleting index rows for evidence
 * an operator withdrew would decide, silently and in bulk, that those windows should be
 * collected again. The port above makes that decision one correction at a time, where
 * an operator is present.
 */
WITH stale AS (
  SELECT a.source_id, a.item_key, a.evd_object_id
    FROM observation.admitted_items a
    JOIN LATERAL (
      SELECT c.lifecycle_state
        FROM objects.canonical_objects c
       WHERE c.object_id = a.evd_object_id AND c.object_type = 'EVD'
       ORDER BY c.object_version DESC LIMIT 1) c ON true
   WHERE c.lifecycle_state IN ('corrected', 'withdrawn')
),
survivor AS (
  SELECT DISTINCT ON (s.source_id, s.item_key)
         s.source_id, s.item_key, e.object_id, e.object_version,
         e.payload ->> 'content_digest' AS content_digest, o.object_id AS obs_object_id
    FROM stale s
    JOIN objects.canonical_objects o
      ON o.object_type = 'OBS' AND o.object_version = 1
     AND o.payload ->> 'source_id' = s.source_id::text
     AND o.payload ->> 'item_key' = s.item_key
    JOIN LATERAL (
      SELECT * FROM objects.canonical_objects x
       WHERE x.object_type = 'EVD' AND x.payload ->> 'obs_object_id' = o.object_id::text
       ORDER BY x.object_version DESC LIMIT 1) e ON true
   WHERE e.lifecycle_state NOT IN ('corrected', 'withdrawn')
   ORDER BY s.source_id, s.item_key, o.recorded_at DESC, e.object_version DESC
)
UPDATE observation.admitted_items a
   SET evd_object_id = s.object_id, obs_object_id = s.obs_object_id,
       object_version = s.object_version, content_digest = s.content_digest
  FROM survivor s
 WHERE a.source_id = s.source_id AND a.item_key = s.item_key
   AND a.evd_object_id <> s.object_id;
