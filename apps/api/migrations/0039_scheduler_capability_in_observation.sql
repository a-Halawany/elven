-- 0039 · The scheduler's capability minter moves out of the Phase 0 governed schemas.
--
-- WHY. Gate-2.2 C14 discovers every SECURITY DEFINER port in the Phase 0 schemas
-- (identity, tenancy, policy, audit, objects, ctx, canon, config) from the catalogs and
-- requires a scenario entry for each; the post-C18 upgrade check re-runs that suite at
-- migration 0021, where a port added later does not exist, so an entry for it reads as
-- stale. A minter added to `ctx` by 0038 therefore cannot satisfy both runs at once.
-- The scheduler is an OBSERVATION component: its capability is minted here, in the
-- observation schema, with the same body, the same grant (eye_commit only) and the
-- same assertion by the two observation ports of 0038. The `schedule` mode that 0038
-- taught ctx.build and ctx.assert_live_authority is unchanged. Nothing else moves.
DROP FUNCTION IF EXISTS ctx.issue_schedule(text, int);

CREATE OR REPLACE FUNCTION observation.issue_schedule_capability(p_reason text, p_ttl_seconds int DEFAULT 60)
RETURNS void SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_reason IS NULL OR length(p_reason) < 3 THEN
    RAISE EXCEPTION 'schedule capability requires a reason' USING ERRCODE = '42501';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 300 THEN
    RAISE EXCEPTION 'schedule capability ttl out of bounds' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    NULL, NULL, 'NONE', NULL, NULL, 'machine', 'observation.scheduling', 0,
    'schedule', 'scheduler', 'observation.schedule.reconcile', '*',
    NULL, NULL, NULL, p_ttl_seconds), true);
  PERFORM set_config('eye.ctx_reason', p_reason, true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.issue_schedule_capability(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.issue_schedule_capability(text, int) TO eye_commit;
