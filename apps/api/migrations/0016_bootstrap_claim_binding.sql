-- 0016: Gate-2.2 C3 — database-enforced, capability-bound single-use bootstrap.
--
-- GOVERNED FORWARD MIGRATION. 0001–0015 remain byte-identical.
--
-- What was already true (0009): bootstrap is atomic (one transaction: claim →
-- create admin → issue credential → mark one-time → evidence), concurrency-safe
-- (the single-row primary key serializes racers, exactly one wins), single-use,
-- and eligibility comes from config.runtime_profile — never a caller env label.
--
-- What this migration adds (C3): the claim is now BOUND TO THE BOOTSTRAP
-- CAPABILITY. claim_bootstrap requires bootstrap mode and records the
-- capability's correlation as the claim NONCE; the claim can only be COMPLETED
-- (target principal bound, claim marked consumed) by the same capability that
-- won it. A forged or mismatched nonce, a call without the bootstrap capability,
-- or a direct call by any other role is refused.

ALTER TABLE identity.bootstrap_claim
  ADD COLUMN IF NOT EXISTS nonce uuid,
  ADD COLUMN IF NOT EXISTS consumed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

-- Claim: bootstrap capability required; the winner records its capability nonce.
CREATE OR REPLACE FUNCTION identity.claim_bootstrap()
RETURNS boolean SECURITY DEFINER SET search_path = identity, ctx, config, public, pg_catalog, pg_temp AS $$
DECLARE v_profile text; v_won boolean; v_nonce uuid := public.eye_correlation();
BEGIN
  -- The bootstrap CAPABILITY is required — not merely the identity role. A caller
  -- under any other context (or none) cannot claim.
  IF public.eye_ctx_mode() <> 'bootstrap' THEN
    RAISE EXCEPTION 'bootstrap claim refused: bootstrap capability required (context is %)',
      coalesce(public.eye_ctx_mode(),'none') USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_capability('bootstrap', 'bootstrap', 'identity.bootstrap.platform_admin');
  IF v_nonce IS NULL THEN
    RAISE EXCEPTION 'bootstrap claim refused: capability carries no correlation nonce' USING ERRCODE = '42501';
  END IF;
  -- Structural eligibility from the database, never a caller-supplied label.
  SELECT profile INTO v_profile FROM config.runtime_profile WHERE id = 1;
  IF v_profile NOT IN ('local','test') THEN
    RAISE EXCEPTION 'bootstrap refused: runtime profile % is not local/test', v_profile USING ERRCODE = '42501';
  END IF;
  -- The single-row primary key IS the concurrency guard: under simultaneous
  -- attempts exactly one INSERT succeeds, and the winner stamps its nonce.
  INSERT INTO identity.bootstrap_claim (id, nonce) VALUES (1, v_nonce) ON CONFLICT (id) DO NOTHING;
  v_won := FOUND;
  RETURN v_won;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.claim_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.claim_bootstrap() TO eye_identity;

-- Complete the claim: only the capability that WON it (matching nonce) may bind
-- the target principal and mark the claim consumed. Both happen in the same
-- transaction as the claim and the admin creation, so any failure rolls the
-- whole thing back — the claim included.
CREATE OR REPLACE FUNCTION identity.record_bootstrap_principal(p_principal uuid)
RETURNS void SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_claim RECORD; v_nonce uuid := public.eye_correlation();
BEGIN
  IF public.eye_ctx_mode() <> 'bootstrap' THEN
    RAISE EXCEPTION 'bootstrap completion refused: bootstrap capability required (context is %)',
      coalesce(public.eye_ctx_mode(),'none') USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_capability('bootstrap', 'bootstrap', 'identity.bootstrap.platform_admin');
  SELECT * INTO v_claim FROM identity.bootstrap_claim WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bootstrap completion refused: no claim exists' USING ERRCODE = '42501';
  END IF;
  IF v_claim.consumed THEN
    RAISE EXCEPTION 'bootstrap completion refused: the claim is already consumed' USING ERRCODE = '42501';
  END IF;
  IF v_claim.nonce IS DISTINCT FROM v_nonce THEN
    RAISE EXCEPTION 'bootstrap completion refused: this capability does not own the claim' USING ERRCODE = '42501';
  END IF;
  UPDATE identity.bootstrap_claim
     SET principal_id = p_principal, consumed = true, consumed_at = clock_timestamp()
   WHERE id = 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.record_bootstrap_principal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.record_bootstrap_principal(uuid) TO eye_identity;
