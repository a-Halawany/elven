-- 0062_propagation_recovery.sql — the propagation consumer recovers INTERRUPTED attempts.
--
-- Codex (2026-09-12) showed on the actual function that 0060's graph.propagations_to_reconcile()
-- selected only events with NO attempt or a FAILED one. A process interrupted after it had
-- received an event (state 'received') or after it had committed a root (state 'walking')
-- records nothing further — the interruption is the point — and when Redis is lost with it the
-- job is gone too: the attempt was stranded and the case stayed outstanding until an operator
-- walked it. The reconciliation now re-drives every attempt that is not terminal:
--
--   state         re-driven?   why
--   (none)        yes          never delivered
--   received      yes          interrupted after receipt, before any root
--   walking       yes          interrupted after a committed root; the next delivery resumes
--                              from roots_walked (propagation_root_begin refuses a walked root)
--   failed        yes          as before (a governance refusal is re-tried only by a re-drive)
--   complete      no           terminal
--   partial       no           terminal for this event; the case stays listed for the operator
--
-- NO CONFLICT WITH A LIVE WORKER: a re-drive is an add with the outbox row id as the job id,
-- which BullMQ ignores while a job of that id is waiting, delayed or active — so a process that
-- is still walking keeps its job and the re-drive is a no-op; and the walk itself is serialised
-- per event by the attempt row's FOR UPDATE lock inside each root's transaction, so even two
-- workers holding the same event (Redis lost and rebuilt under a live worker) cannot walk one
-- root twice. Forward only; the function is replaced, nothing else changes.
CREATE OR REPLACE FUNCTION graph.propagations_to_reconcile()
RETURNS TABLE (tenant_id uuid, domain_id uuid, event_id uuid, case_id uuid, event_type text, correlation_id uuid, causation_id uuid, attempt_state text)
SECURITY DEFINER SET search_path = graph, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY
    SELECT c.tenant_id, c.domain_id, o.id, c.case_id, o.event_type, o.correlation_id, o.causation_id, t.state
      FROM graph.propagation_agents a
      JOIN observation.correction_current c ON c.tenant_id = a.tenant_id AND c.domain_id = a.domain_id
       AND c.state = 'applied' AND c.propagation_state <> 'complete'
      JOIN LATERAL (
        SELECT x.id, x.event_type, x.correlation_id, x.causation_id FROM objects.object_outbox x
         WHERE x.tenant_id = c.tenant_id AND x.domain_id = c.domain_id AND (x.payload ->> 'case_id') = c.case_id::text
           AND (x.event_type = 'CorrectionApplied'
                OR (coalesce(a.budgets ->> 'backlog_policy', 'leave') = 'walk'
                    AND x.event_type = 'CorrectionReceived'
                    AND jsonb_array_length(coalesce(x.payload #> '{propagation_scope,resolved}', '[]'::jsonb)) > 0))
         ORDER BY x.created_at DESC LIMIT 1) o ON true
      LEFT JOIN graph.propagation_attempts t ON t.event_id = o.id
     WHERE a.status = 'active' AND (t.event_id IS NULL OR t.state IN ('received', 'walking', 'failed'))
     ORDER BY c.received_at;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propagations_to_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propagations_to_reconcile() TO eye_commit;
