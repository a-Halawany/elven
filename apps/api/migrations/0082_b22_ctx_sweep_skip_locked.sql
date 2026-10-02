-- 0082 — CP-6 B22.1: THE CAPABILITY-NONCE SWEEP NEVER WAITS (2026-09-24).
--
-- THE DEFECT (found by the B21 rehearsal, 2026-09-24; the bounded B21 review's technical decision). Every capability context —
-- ctx.build under issue_commit / issue_identity_op / issue_publish / issue_schedule_capability — first ran
--     DELETE FROM ctx.issued WHERE expires_at < clock_timestamp() - interval '1 hour'
-- an UNCONDITIONAL delete of every nonce expired for more than an hour. The rows it deleted stay row-locked by that transaction until
-- it ends. A governed write that, inside its own transaction, awaits ANOTHER governed operation on another connection (a nested
-- pipeline.write: SimulationService.open → series.retrieveBytes before B21, and still twin.ground and the forecasting writes' series
-- assembly) made that inner operation's ctx.build wait on the outer transaction's row locks while the outer awaited the inner's promise —
-- a wait cycle across two connections PostgreSQL cannot see as a deadlock. Every other minter (every login) then queued behind the
-- inner one. A fresh database never shows it (no nonce is an hour old); the demonstration and every copy of it do (the publisher mints
-- one nonce per second, so a nonce crosses the line every second).
--
-- THE REMEDY (the ONLY change). The sweep takes its victims with FOR UPDATE SKIP LOCKED — a row another transaction holds (because that
-- transaction's own sweep is deleting it) is skipped, never waited on — and it is BOUNDED: at most 500 rows per issuance,
-- oldest first (issued_expires_at_idx, 0057), so no single issuance pays for a backlog. What one issuance leaves, the next ones take.
-- PostgreSQL skips only row locks that cannot be acquired immediately; ordinary table-level locks still apply (the sweep takes ROW
-- EXCLUSIVE on ctx.issued, as the INSERT beside it always did).
--
-- WHAT IS NOT CHANGED. The context's payload, signature, clock (clock_timestamp), TTL bounds (1..300 s), the mode allowlist, the
-- nonce's issuance row and its columns, the transaction/backend binding (pg_backend_pid, pg_current_xact_id in the signed payload), the
-- liveness check of ctx.assert_business_authority (the nonce must be ISSUED and UNEXPIRED — a row the sweep has not yet removed is an
-- EXPIRED row and is refused exactly as before; a removed row is unknown and refused exactly as before), ctx.assert_live_authority and
-- every grant; no function or table is added. The sweep only ever removes rows whose expiry lies more than an hour in the past — rows no check can accept. The
-- function's signature, owner, SECURITY DEFINER and search_path are those of 0038.
--
-- THE PROOF: apps/api/test/int/phase6-nonce-sweep-b22.test.ts (two connections; the pre-0082 statement reproduced waiting; the
-- minter not waiting; the backlog drained in bounded steps; expired and foreign-transaction contexts refused) and the residual nested
-- paths exercised with aged nonces crossing the line (twin grounding, forecast issue, backtest, outcome record).

CREATE OR REPLACE FUNCTION ctx.build(p_session uuid, p_principal uuid, p_scope text, p_tenant uuid, p_domain uuid, p_assurance text, p_purpose text, p_epoch bigint, p_mode text, p_opclass text, p_action text, p_target text, p_correlation uuid, p_policy_decision uuid, p_bundle text, p_ttl_seconds integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_nonce uuid := gen_random_uuid();
  -- clock_timestamp() is WALL CLOCK: transaction-stable now() cannot expire a
  -- context inside a long transaction (Gate-2.1 finding 6).
  v_iat timestamptz := clock_timestamp();
  v_exp timestamptz := clock_timestamp() + make_interval(secs => p_ttl_seconds);
  v_payload text;
BEGIN
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 300 THEN
    RAISE EXCEPTION 'context denied: ttl out of bounds' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('authority','evidence','publish','verify','identity_op','bootstrap','schedule') THEN
    RAISE EXCEPTION 'context denied: unknown mode %', p_mode USING ERRCODE = '42501';
  END IF;
  -- 0082: the sweep never waits on another transaction's rows and is bounded per issuance (the header).
  DELETE FROM ctx.issued d
   USING (SELECT i.nonce FROM ctx.issued i
           WHERE i.expires_at < clock_timestamp() - interval '1 hour'
           ORDER BY i.expires_at
           LIMIT 500
           FOR UPDATE SKIP LOCKED) s
   WHERE d.nonce = s.nonce;
  INSERT INTO ctx.issued (nonce, session_id, expires_at, op_class, bound_action)
    VALUES (v_nonce, coalesce(p_session, '00000000-0000-0000-0000-000000000000'),
            v_exp, p_opclass, p_action);
  v_payload := concat_ws('|', 'v3',
    coalesce(p_session::text,''), coalesce(p_principal::text,''), p_scope,
    coalesce(p_tenant::text,''), coalesce(p_domain::text,''),
    coalesce(p_assurance,''), coalesce(p_purpose,''),
    to_char(v_iat, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    to_char(v_exp, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    v_nonce::text, coalesce(p_epoch,0)::text, p_mode, coalesce(p_opclass,''),
    coalesce(p_action,''), coalesce(p_target,''), coalesce(p_correlation::text,''),
    pg_backend_pid()::text, pg_current_xact_id()::text,
    coalesce(p_policy_decision::text,''), coalesce(p_bundle,''));
  RETURN v_payload || '|' || ctx.sign_payload(v_payload);
END $function$;
