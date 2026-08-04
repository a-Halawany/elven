-- 0004: audit ledger (ADR-P0-09).
-- audit_events + audit_seals: strictly INSERT-only evidence (privilege + trigger).
-- audit_chain_heads: the ONLY mutable table — allocator state, owned by the
-- dedicated role eye_audit_allocator, NOT canonical evidence, reconstructable
-- from the immutable ledger. The app role advances it exclusively through the
-- SECURITY DEFINER functions below (exact privilege boundary, tested).
-- Single authoritative representation (ADR-P0-05): every typed query column on
-- audit_events is GENERATED from event_jcs — typed columns can never disagree
-- with the canonical bytes.

CREATE TABLE audit.audit_events (
  partition_id     text NOT NULL,
  audit_seq        bigint NOT NULL CHECK (audit_seq >= 1),
  -- Canonical bytes: the exact JCS string that was hashed (event object only).
  event_jcs        text NOT NULL,
  -- Constraint-verified derivations (never independently writable):
  event            jsonb  GENERATED ALWAYS AS (event_jcs::jsonb) STORED,
  scope            text   GENERATED ALWAYS AS ((event_jcs::jsonb)->>'scope') STORED,
  tenant_id        uuid   GENERATED ALWAYS AS (NULLIF((event_jcs::jsonb)->>'tenant_id','')::uuid) STORED,
  domain_id        uuid   GENERATED ALWAYS AS (NULLIF((event_jcs::jsonb)->>'domain_id','')::uuid) STORED,
  event_type       text   GENERATED ALWAYS AS ((event_jcs::jsonb)->>'event_type') STORED,
  outcome          text   GENERATED ALWAYS AS ((event_jcs::jsonb)->>'outcome') STORED,
  actor            text   GENERATED ALWAYS AS ((event_jcs::jsonb)->>'actor') STORED,
  action           text   GENERATED ALWAYS AS ((event_jcs::jsonb)->>'action') STORED,
  result_code      text   GENERATED ALWAYS AS ((event_jcs::jsonb)->>'result_code') STORED,
  correlation_id   uuid   GENERATED ALWAYS AS (((event_jcs::jsonb)->>'correlation_id')::uuid) STORED,
  -- ISO-8601 Z strings sort lexicographically = chronologically; timestamptz cast is not immutable.
  occurred_at      text   GENERATED ALWAYS AS ((event_jcs::jsonb)->>'occurred_at') STORED,
  previous_hash    text NOT NULL CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
  row_hash         text NOT NULL CHECK (row_hash ~ '^[0-9a-f]{64}$'),
  hash_alg_version text NOT NULL DEFAULT 'eye-audit-v1',
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partition_id, audit_seq)
);

CREATE INDEX audit_events_corr ON audit.audit_events (correlation_id);
CREATE INDEX audit_events_tenant ON audit.audit_events (tenant_id, occurred_at);

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- Pre-incident trusted checkpoints (never created over a tampered range).
CREATE TABLE audit.audit_seals (
  id              uuid PRIMARY KEY,
  partition_id    text NOT NULL,
  range_start_seq bigint NOT NULL,
  range_end_seq   bigint NOT NULL,
  head_hash       text NOT NULL CHECK (head_hash ~ '^[0-9a-f]{64}$'),
  sealer          text NOT NULL,
  sealed_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER audit_seals_append_only
  BEFORE UPDATE OR DELETE ON audit.audit_seals
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- Integrity incidents: tamper detection evidence; a partition with an open
-- incident is frozen and its affected range is never re-sealed as trusted.
CREATE TABLE audit.integrity_incidents (
  id             uuid PRIMARY KEY,
  partition_id   text NOT NULL,
  range_start_seq bigint,
  range_end_seq  bigint,
  details        jsonb NOT NULL,
  detected_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER integrity_incidents_append_only
  BEFORE UPDATE OR DELETE ON audit.integrity_incidents
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- Allocator table — mutable ONLY by eye_audit_allocator; not evidence.
CREATE TABLE audit.audit_chain_heads (
  partition_id text PRIMARY KEY,
  next_seq     bigint NOT NULL DEFAULT 1,
  head_hash    text NOT NULL DEFAULT repeat('0', 64),
  frozen       boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit.audit_chain_heads OWNER TO eye_audit_allocator;

-- ===== bounded allocator functions (SECURITY DEFINER, owner = allocator) =====

-- Step A: lock the head row, return (seq, previous_hash). Lock holds until the
-- surrounding transaction commits/aborts — chain appends serialize per partition.
CREATE OR REPLACE FUNCTION audit.advance_chain_head(p_partition text)
RETURNS TABLE (seq bigint, prev_hash text)
SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE
  r RECORD;
BEGIN
  INSERT INTO audit_chain_heads (partition_id) VALUES (p_partition)
    ON CONFLICT (partition_id) DO NOTHING;
  SELECT * INTO r FROM audit_chain_heads WHERE partition_id = p_partition FOR UPDATE;
  IF r.frozen THEN
    RAISE EXCEPTION 'audit partition % is frozen (integrity incident open)', p_partition
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN QUERY SELECT r.next_seq, r.head_hash;
END $$ LANGUAGE plpgsql;
ALTER FUNCTION audit.advance_chain_head(text) OWNER TO eye_audit_allocator;

-- Step B: commit the new head after the app computed the row hash and inserted
-- the immutable row. Verifies the expected sequence under the held lock.
CREATE OR REPLACE FUNCTION audit.commit_chain_head(p_partition text, p_seq bigint, p_new_hash text)
RETURNS void
SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM audit_chain_heads WHERE partition_id = p_partition FOR UPDATE;
  IF r.next_seq <> p_seq THEN
    RAISE EXCEPTION 'audit head sequence mismatch for %: expected %, head at %', p_partition, p_seq, r.next_seq
      USING ERRCODE = 'raise_exception';
  END IF;
  UPDATE audit_chain_heads
    SET next_seq = p_seq + 1, head_hash = p_new_hash, updated_at = now()
    WHERE partition_id = p_partition;
END $$ LANGUAGE plpgsql;
ALTER FUNCTION audit.commit_chain_head(text, bigint, text) OWNER TO eye_audit_allocator;

-- Freeze a partition on tamper detection (fail closed; EYE-AUD-001 for new appends).
CREATE OR REPLACE FUNCTION audit.freeze_partition(p_partition text)
RETURNS void
SECURITY DEFINER SET search_path = audit, pg_temp AS $$
BEGIN
  UPDATE audit_chain_heads SET frozen = true, updated_at = now() WHERE partition_id = p_partition;
END $$ LANGUAGE plpgsql;
ALTER FUNCTION audit.freeze_partition(text) OWNER TO eye_audit_allocator;

-- Recovery: rebuild allocator state from the immutable ledger (ADR-P0-09 —
-- heads are never trusted from backup alone).
CREATE OR REPLACE FUNCTION audit.rebuild_chain_heads()
RETURNS void
SECURITY DEFINER SET search_path = audit, pg_temp AS $$
BEGIN
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

-- ===== grants: exact privilege boundary =====
GRANT SELECT, INSERT ON audit.audit_events TO eye_app;
GRANT SELECT, INSERT ON audit.audit_seals TO eye_app;
GRANT SELECT, INSERT ON audit.integrity_incidents TO eye_app;
GRANT SELECT ON audit.audit_chain_heads TO eye_app;   -- read-only for the app
GRANT EXECUTE ON FUNCTION audit.advance_chain_head(text), audit.commit_chain_head(text, bigint, text),
  audit.freeze_partition(text), audit.rebuild_chain_heads() TO eye_app;
GRANT SELECT, INSERT, UPDATE ON audit.audit_events, audit.audit_chain_heads TO eye_audit_allocator;
-- (allocator INSERT/UPDATE on audit_events is nominal ownership hygiene; the
-- append-only trigger still blocks UPDATE/DELETE for every role.)

-- RLS on evidence queries.
ALTER TABLE audit.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_events_isolation ON audit.audit_events
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY audit_events_write ON audit.audit_events FOR INSERT WITH CHECK (true);
ALTER TABLE audit.audit_events FORCE ROW LEVEL SECURITY;
