-- 0020: Gate-2.2 C9 — governed degraded recovery.
--
-- GOVERNED FORWARD MIGRATION. 0001–0019 are IMMUTABLE and untouched.
--
-- Finding: audit.reconcile_availability_incident carried NO capability check at
-- all — the eye_verifier role grant alone allowed any holder to mark any
-- availability incident reconciled, which is the act that permits a degraded
-- system to be presented as healthy again. Recovery was therefore assertable
-- rather than governed.
--
-- Correction: reconciliation requires a RECOVERY capability (verify mode, 'recover'
-- operation class) bound to the exact incident id, the reconciliation is evidenced
-- on the platform audit chain in the SAME transaction, and the port reports
-- whether any unreconciled incident remains so a caller can never claim health
-- while the ledger still shows degradation.

CREATE OR REPLACE FUNCTION ctx.issue_recovery(p_incident uuid)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_incident IS NULL THEN
    RAISE EXCEPTION 'recovery capability requires an incident id' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    NULL, NULL, 'PLATFORM', NULL, NULL, 'machine', 'audit.availability', 0,
    'verify', 'recover', 'audit.availability.reconcile', p_incident::text,
    p_incident, NULL, NULL, 120), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_recovery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_recovery(uuid) TO eye_verifier;

CREATE OR REPLACE FUNCTION ctx.assert_recovery_capability(p_incident uuid)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_ctx_mode() <> 'verify' OR public.eye_op_class() <> 'recover' THEN
    RAISE EXCEPTION 'recovery denied: a recovery capability is required (context is %/%)',
      coalesce(public.eye_ctx_mode(),'none'), coalesce(public.eye_op_class(),'none')
      USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_target() IS DISTINCT FROM p_incident::text THEN
    RAISE EXCEPTION 'recovery denied: capability is bound to incident %, not %',
      coalesce(nullif(public.eye_bound_target(),''),'<none>'), p_incident USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_recovery_capability(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_recovery_capability(uuid) TO eye_verifier;

-- Reconciliation is capability-bound, evidenced in the same transaction, and
-- reports the REMAINING unreconciled count so health can never be claimed while
-- the ledger still shows degradation.
CREATE OR REPLACE FUNCTION audit.reconcile_availability_incident_v2(
  p_id uuid, p_by text, p_note text
) RETURNS TABLE (reconciled boolean, remaining_unreconciled int)
SECURITY DEFINER SET search_path = audit, ctx, public, pg_catalog, pg_temp AS $$
DECLARE n int; v_remaining int;
BEGIN
  PERFORM ctx.assert_recovery_capability(p_id);
  UPDATE audit.availability_incidents
     SET reconciled_at = clock_timestamp(), reconciled_by = p_by,
         details = details || jsonb_build_object('reconciliation_note', p_note)
   WHERE id = p_id AND reconciled_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'recovery denied: incident % is unknown or already reconciled', p_id
      USING ERRCODE = '42501';
  END IF;
  -- INSEPARABLE EVIDENCE: the reconciliation and its audit record commit together.
  PERFORM audit.commit_integrity_event(
    'platform', 'success', 'OK', p_id,
    jsonb_build_object('event', 'availability.reconciled', 'incident_id', p_id,
                       'reconciled_by', p_by, 'note', p_note));
  SELECT count(*)::int INTO v_remaining
    FROM audit.availability_incidents WHERE reconciled_at IS NULL;
  RETURN QUERY SELECT true, v_remaining;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.reconcile_availability_incident_v2(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.reconcile_availability_incident_v2(uuid, text, text) TO eye_verifier;

-- The ungoverned v1 port is REMOVED: recovery cannot be asserted any more.
DROP FUNCTION IF EXISTS audit.reconcile_availability_incident(uuid, text, text);

-- Read model so a recovery caller can ask "is the ledger still degraded?" without
-- direct table access.
CREATE OR REPLACE FUNCTION audit.unreconciled_incidents()
RETURNS TABLE (id uuid, kind text, detected_at timestamptz, correlation_id uuid)
SECURITY DEFINER SET search_path = audit, pg_catalog, pg_temp AS $$
  SELECT id, kind, detected_at, correlation_id
    FROM audit.availability_incidents WHERE reconciled_at IS NULL ORDER BY detected_at
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION audit.unreconciled_incidents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.unreconciled_incidents() TO eye_verifier, eye_commit, eye_app;

-- ============================================================
-- Integrity-evidence capability: verify/seal BOUND TO THE PARTITION, or a
-- RECOVERY capability writing its reconciliation evidence to the platform chain.
--
-- Needed because a recovery capability is bound to an INCIDENT id (not a
-- partition), yet its reconciliation evidence must land on the platform audit
-- chain in the same transaction. Without this, the inseparable evidence write
-- inside reconcile_availability_incident_v2 could not satisfy the partition-bound
-- verify assertion and recovery would be impossible — the C5 binding is preserved
-- for verify/seal, and recovery is admitted explicitly rather than by loosening it.
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.assert_integrity_evidence_capability(p_partition text)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_ctx_mode() <> 'verify' THEN
    RAISE EXCEPTION 'integrity evidence denied: verify mode required (context is %)',
      coalesce(public.eye_ctx_mode(),'none') USING ERRCODE = '42501';
  END IF;
  IF public.eye_op_class() = 'recover' THEN
    IF p_partition <> 'platform' THEN
      RAISE EXCEPTION 'integrity evidence denied: recovery evidence belongs on the platform chain, not %',
        p_partition USING ERRCODE = '42501';
    END IF;
    RETURN;                                  -- recovery capability, platform chain
  END IF;
  -- Otherwise the C5 rule stands unchanged: bound to this exact partition.
  IF public.eye_bound_target() IS DISTINCT FROM p_partition THEN
    RAISE EXCEPTION 'verify capability denied: capability is bound to partition %, not %',
      coalesce(nullif(public.eye_bound_target(),''),'<none>'), p_partition USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_integrity_evidence_capability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_integrity_evidence_capability(text) TO eye_verifier;

-- Governed re-emit of commit_integrity_event using the evidence capability check
-- (body otherwise identical to 0018).
CREATE OR REPLACE FUNCTION audit.commit_integrity_event(
  p_partition text, p_outcome text, p_result_code text, p_correlation uuid, p_detail jsonb
) RETURNS bigint
SECURITY DEFINER SET search_path = audit, canon, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_event jsonb; v_head RECORD; v_hash text; v_jcs text;
BEGIN
  PERFORM ctx.assert_integrity_evidence_capability(p_partition);
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
