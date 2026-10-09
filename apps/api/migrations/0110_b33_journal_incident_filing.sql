-- 0110 — B33-J (2026-10-09): a governed recovery path for durable-journal-only audit failures. 0001–0109 are applied and frozen and are
-- not edited; no existing function is re-declared (the two below are new), and the closed audit framework is unchanged: reconciliation stays
-- ONLY audit.reconcile_availability_incident_v2 under ctx.issue_recovery bound to the exact incident (0020), with its inseparable evidence.
--
-- THE GAP (found on eye_demo 2026-10-09: /readyz audit-degraded on 4 `evidence_write_failed` journal records that the governed entrypoint
-- could not clear). Several fail-closed paths write ONLY the local durable journal (the pipeline's recordEvidenceFailure, the intake's
-- evidence failure, the suppression accounting, the startup ledger read, the B36 denial object) — no ledger incident — so the governed
-- recovery, which reconciles LEDGER incidents only, had nothing to reconcile and the degraded flag could never be cleared through it.
-- The schema already pointed at the link: 0012 §7 added audit.availability_incidents.journal_ref, and the kind check admits
-- `evidence_write_failed`; nothing ever wrote journal_ref.
--
-- THE CORRECTION (SQL half; the TypeScript half files and reconciles):
--   §1 journal_ref is UNIQUE where present — a journal record has at most ONE ledger counterpart, so filing it again (a retry, a restart, a
--      failure-time filing racing a backfill) can never file it twice. Every existing row has journal_ref NULL (nothing wrote it), so the
--      index builds on any live database.
--   §2 audit.file_journal_incident: files the ledger counterpart of ONE journal record — the record's own kind, scope, correlation and time,
--      its id as journal_ref, and the caller's sanitized description — idempotently (ON CONFLICT on journal_ref: the existing counterpart is
--      returned, `filed` false). It is the same authority class as audit.record_availability_incident (0010/0012): a failure-path port
--      reachable by the request/identity/verifier roles WITHOUT a capability, because it must work exactly when evidence cannot be written;
--      it can only ADD an open incident — which keeps readiness degraded — and never reconciles, edits or removes one. It refuses what is
--      not a journal record's counterpart: no id, no journal reference, a reference that is not a journal record id, a kind the journal does
--      not degrade on, a time in the future.
--   §3 audit.journal_incidents: the read model the recovery uses to prove EVERY journal record since the last recovery maps to a RECONCILED
--      ledger incident before the local flag may clear.

-- §1
CREATE UNIQUE INDEX IF NOT EXISTS availability_incidents_journal_ref_key
  ON audit.availability_incidents (journal_ref) WHERE journal_ref IS NOT NULL;

-- §2
CREATE FUNCTION audit.file_journal_incident(
  p_id uuid, p_kind text, p_partition_hint text, p_correlation uuid, p_journal_ref text, p_detected_at timestamptz, p_details jsonb
) RETURNS TABLE (incident_id uuid, filed boolean, reconciled boolean)
SECURITY DEFINER SET search_path = audit, pg_catalog, pg_temp AS $$
DECLARE n int;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'journal incident refused: an incident id is required' USING ERRCODE = '22023';
  END IF;
  IF p_journal_ref IS NULL OR p_journal_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'journal incident refused: the journal reference must be a durable journal record id' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('audit_unavailable', 'evidence_write_failed') THEN
    RAISE EXCEPTION 'journal incident refused: kind % is not a degrading journal record', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_detected_at IS NOT NULL AND p_detected_at > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'journal incident refused: the journal record''s time % is in the future', p_detected_at USING ERRCODE = '22023';
  END IF;
  INSERT INTO audit.availability_incidents (id, detected_at, kind, partition_hint, correlation_id, details, journal_ref)
  VALUES (p_id, coalesce(p_detected_at, clock_timestamp()), p_kind, p_partition_hint, p_correlation,
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('journal_ref', p_journal_ref,
            'filed_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
          p_journal_ref)
  ON CONFLICT (journal_ref) WHERE journal_ref IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT a.id, n = 1, a.reconciled_at IS NOT NULL
                 FROM audit.availability_incidents a WHERE a.journal_ref = p_journal_ref;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.file_journal_incident(uuid, text, text, uuid, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.file_journal_incident(uuid, text, text, uuid, text, timestamptz, jsonb)
  TO eye_commit, eye_identity, eye_verifier;

-- §3
CREATE FUNCTION audit.journal_incidents(p_refs text[])
RETURNS TABLE (journal_ref text, incident_id uuid, kind text, detected_at timestamptz, reconciled_at timestamptz, reconciled_by text)
SECURITY DEFINER SET search_path = audit, pg_catalog, pg_temp AS $$
  SELECT a.journal_ref, a.id, a.kind, a.detected_at, a.reconciled_at, a.reconciled_by
    FROM audit.availability_incidents a
   WHERE a.journal_ref = ANY (coalesce(p_refs, ARRAY[]::text[]))
   ORDER BY a.detected_at
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION audit.journal_incidents(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.journal_incidents(text[]) TO eye_app, eye_commit, eye_identity, eye_verifier;
