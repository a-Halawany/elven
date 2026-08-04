-- 0005: rebuild_chain_heads must read the full ledger regardless of session
-- scope context — it is a bounded recovery function (ADR-P0-09). Sets an
-- explicit PLATFORM context transaction-locally inside the function.
CREATE OR REPLACE FUNCTION audit.rebuild_chain_heads()
RETURNS void
SECURITY DEFINER SET search_path = audit, pg_temp AS $$
BEGIN
  PERFORM set_config('eye.scope', 'PLATFORM', true);
  UPDATE audit_chain_heads h
    SET next_seq = COALESCE(e.max_seq, 0) + 1,
        head_hash = COALESCE(e.last_hash, repeat('0', 64)),
        updated_at = now()
    FROM (
      SELECT partition_id,
             MAX(audit_seq) AS max_seq,
             (ARRAY_AGG(row_hash ORDER BY audit_seq DESC))[1] AS last_hash
      FROM audit_events GROUP BY partition_id
    ) e
    WHERE h.partition_id = e.partition_id;
END $$ LANGUAGE plpgsql;
ALTER FUNCTION audit.rebuild_chain_heads() OWNER TO eye_audit_allocator;
