-- 0018: Gate-2.2 C5 — govern the verifier, seal and integrity-incident ports.
--
-- GOVERNED FORWARD MIGRATION. 0001–0017 remain byte-identical.
--
-- Finding: audit.open_integrity_incident, lock_head_for_seal and append_seal
-- (from 0008) carried NO capability check — a holder of the eye_verifier role
-- could freeze any partition or append a seal with no verify/seal capability at
-- all, against any partition. commit_integrity_event asserted a verify capability
-- but was not bound to the partition it was recording.
--
-- Correction: each verifier/seal/integrity port now asserts the correct verify
-- or seal capability BOUND TO THE EXACT PARTITION (the verify capability carries
-- the partition as its bound target, and distinguishes verify vs seal by
-- operation class). Sealing still re-derives the head under the lock, so the
-- sealed head is the COMPUTED head, never a caller-declared value.

-- A verify-class capability (verify OR seal op-class) bound to this partition.
CREATE OR REPLACE FUNCTION ctx.assert_verify_capability(p_partition text)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_ctx_mode() <> 'verify' THEN
    RAISE EXCEPTION 'verify capability denied: verify mode required (context is %)',
      coalesce(public.eye_ctx_mode(),'none') USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_target() IS DISTINCT FROM p_partition THEN
    RAISE EXCEPTION 'verify capability denied: capability is bound to partition %, not %',
      coalesce(public.eye_bound_target(),'<none>'), p_partition USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_verify_capability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_verify_capability(text) TO eye_verifier;

-- A SEAL capability specifically (op-class 'seal') bound to this partition.
CREATE OR REPLACE FUNCTION ctx.assert_seal_capability(p_partition text)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_ctx_mode() <> 'verify' OR public.eye_op_class() <> 'seal' THEN
    RAISE EXCEPTION 'seal capability denied: a seal capability is required (context is %/%)',
      coalesce(public.eye_ctx_mode(),'none'), coalesce(public.eye_op_class(),'none') USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_target() IS DISTINCT FROM p_partition THEN
    RAISE EXCEPTION 'seal capability denied: capability is bound to partition %, not %',
      coalesce(public.eye_bound_target(),'<none>'), p_partition USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_seal_capability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_seal_capability(text) TO eye_verifier;

-- Freezing a partition + opening an incident: verify capability, partition-bound.
CREATE OR REPLACE FUNCTION audit.open_integrity_incident(
  p_id uuid, p_partition text, p_start bigint, p_end bigint, p_details jsonb
) RETURNS void
SECURITY DEFINER SET search_path = audit, ctx, public, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_verify_capability(p_partition);
  UPDATE audit.audit_chain_heads SET frozen = true, updated_at = now() WHERE partition_id = p_partition;
  INSERT INTO audit.integrity_incidents (id, partition_id, range_start_seq, range_end_seq, details)
    VALUES (p_id, p_partition, p_start, p_end, p_details);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.open_integrity_incident(uuid, text, bigint, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.open_integrity_incident(uuid, text, bigint, bigint, jsonb) TO eye_verifier;

-- Lock the head for sealing: seal capability, partition-bound.
CREATE OR REPLACE FUNCTION audit.lock_head_for_seal(p_partition text)
RETURNS TABLE (next_seq bigint, head_hash text, frozen boolean)
SECURITY DEFINER SET search_path = audit, ctx, public, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_seal_capability(p_partition);
  RETURN QUERY
    SELECT h.next_seq, h.head_hash, h.frozen
    FROM audit.audit_chain_heads h WHERE h.partition_id = p_partition FOR UPDATE;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.lock_head_for_seal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.lock_head_for_seal(text) TO eye_verifier;

-- Append a seal: seal capability, partition-bound; head is RE-DERIVED under the
-- lock, so what is sealed is the computed head, not a caller-supplied value.
CREATE OR REPLACE FUNCTION audit.append_seal(
  p_id uuid, p_partition text, p_start bigint, p_end bigint, p_head text, p_sealer text
) RETURNS void
SECURITY DEFINER SET search_path = audit, ctx, public, pg_temp AS $$
DECLARE r RECORD;
BEGIN
  PERFORM ctx.assert_seal_capability(p_partition);
  SELECT * INTO r FROM audit.audit_chain_heads WHERE partition_id = p_partition FOR UPDATE;
  IF r.frozen THEN RAISE EXCEPTION 'seal rejected: partition frozen'; END IF;
  IF r.next_seq - 1 <> p_end OR r.head_hash <> p_head THEN
    RAISE EXCEPTION 'seal rejected: head moved since verification';
  END IF;
  IF EXISTS (SELECT 1 FROM audit.integrity_incidents WHERE partition_id = p_partition) THEN
    RAISE EXCEPTION 'seal rejected: open integrity incident';
  END IF;
  INSERT INTO audit.audit_seals (id, partition_id, range_start_seq, range_end_seq, head_hash, sealer)
    VALUES (p_id, p_partition, p_start, p_end, p_head, p_sealer);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.append_seal(uuid, text, bigint, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.append_seal(uuid, text, bigint, bigint, text, text) TO eye_verifier;

-- Integrity event: verify capability BOUND TO THE PARTITION it records.
CREATE OR REPLACE FUNCTION audit.commit_integrity_event(
  p_partition text, p_outcome text, p_result_code text, p_correlation uuid, p_detail jsonb
) RETURNS bigint
SECURITY DEFINER SET search_path = audit, canon, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_event jsonb; v_head RECORD; v_hash text; v_jcs text;
BEGIN
  PERFORM ctx.assert_verify_capability(p_partition);
  IF p_outcome NOT IN ('success','failure','denied') THEN
    RAISE EXCEPTION 'integrity audit rejected: invalid outcome' USING ERRCODE = '22023';
  END IF;
  v_event := jsonb_build_object(
    'event_type', 'audit.integrity', 'outcome', p_outcome, 'scope', 'PLATFORM',
    'tenant_id', NULL, 'domain_id', NULL, 'actor', 'workload:system.audit-verifier',
    'delegation_id', NULL, 'action', public.eye_bound_action(), 'target_type', 'AUD',
    'target_id', p_partition, 'target_version', NULL, 'purpose_id', 'audit.integrity',
    'policy_decision_id', NULL, 'policy_version', NULL, 'result_code', p_result_code,
    'occurred_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'clock_quality', 'trusted', 'correlation_id', p_correlation, 'causation_id', NULL,
    'trace_id', NULL, 'request_digest', NULL, 'session_id', NULL,
    'context_mode', 'verify', 'metadata', coalesce(p_detail, '{}'::jsonb)
  );
  SELECT * INTO v_head FROM audit.advance_chain_head('platform');
  v_jcs := canon.jcs(v_event);
  v_hash := canon.audit_row_hash('platform', v_head.seq, v_head.prev_hash, v_jcs::jsonb);
  INSERT INTO audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
    VALUES ('platform', v_head.seq, v_jcs, v_head.prev_hash, v_hash);
  PERFORM audit.commit_chain_head('platform', v_head.seq, v_hash);
  RETURN v_head.seq;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.commit_integrity_event(text,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.commit_integrity_event(text,text,text,uuid,jsonb) TO eye_verifier;
