-- 0012: Gate-2.1 part 2 — capability-free evidence mode, authority-bound business
-- ports, AUD↔POL linkage, live revalidation at every port, and closure of the
-- identity/metadata leakage paths. GOVERNED FORWARD MIGRATION (0001–0011 intact).
--
-- Findings closed here:
--   F5  evidence mode could reach PLATFORM business mutations through
--       eye_scope()='PLATFORM' shortcuts in the business ports.
--   F7  a minted context stayed usable after concurrent revocation/rotation,
--       because no port revalidated live authority.
--   §3  no constraint tied a request AUD record to its POL record.
--   §5  auth_principal/auth_bindings/session_get_active accepted arbitrary UUIDs;
--       audit.my_partition_status leaked tenant-global integrity state to DOMAIN.
--   §7  audit.verify could produce a generic success record for an unknown or
--       damaged partition.

-- ============================================================
-- 1. Capability-bearing write predicate: ONLY 'authority' mode may write
--    business state. Machine capabilities (publish/verify/identity_op/bootstrap)
--    and 'evidence' mode carry no business-write authority whatsoever.
-- ============================================================
CREATE OR REPLACE FUNCTION public.eye_row_writable(p_scope text, p_tenant uuid, p_domain uuid)
RETURNS boolean SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN public.eye_ctx_mode() <> 'authority' THEN false
    ELSE CASE public.eye_scope()
      WHEN 'PLATFORM' THEN true
      WHEN 'TENANT'   THEN p_tenant IS NOT NULL AND p_tenant = public.eye_tenant()
                           AND p_scope IN ('TENANT','DOMAIN')
      WHEN 'DOMAIN'   THEN p_scope = 'DOMAIN'
                           AND p_tenant IS NOT NULL AND p_tenant = public.eye_tenant()
                           AND p_domain IS NOT NULL AND p_domain = public.eye_domain()
      ELSE false
    END
  END
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.eye_row_visible(p_tenant uuid, p_domain uuid)
RETURNS boolean SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT CASE public.eye_scope()
    WHEN 'PLATFORM' THEN true
    WHEN 'TENANT'   THEN p_tenant IS NOT NULL AND p_tenant = public.eye_tenant()
    WHEN 'DOMAIN'   THEN p_tenant IS NOT NULL AND p_tenant = public.eye_tenant()
                         AND p_domain IS NOT NULL AND p_domain = public.eye_domain()
    ELSE false
  END
$$ LANGUAGE sql STABLE;

-- Shared guard for every business port: authority mode + bound action + live
-- authority. This is what makes the PLATFORM shortcuts safe.
CREATE OR REPLACE FUNCTION ctx.assert_business_authority(p_action text)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'business write rejected: authority mode required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_action() IS DISTINCT FROM p_action THEN
    RAISE EXCEPTION 'business write rejected: context is bound to action %, not %',
      coalesce(public.eye_bound_action(),'<none>'), p_action USING ERRCODE = '42501';
  END IF;
  -- The nonce recorded at issuance is CONSULTED here: a fabricated context whose
  -- nonce was never issued, or whose issuance has expired, is refused. (This is a
  -- liveness check, not a single-use claim — see the honest description in
  -- GATE2_1_PLAN.md §C5: the context is transaction- and connection-bound.)
  IF NOT EXISTS (
    SELECT 1 FROM ctx.issued i
     WHERE i.nonce = public.eye_ctx_nonce()
       AND i.expires_at > clock_timestamp()
       AND i.bound_action IS NOT DISTINCT FROM p_action
  ) THEN
    RAISE EXCEPTION 'business write rejected: context nonce is unknown or expired' USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_business_authority(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_business_authority(text) TO eye_commit, eye_identity;

-- ============================================================
-- 2. Business ports: authority mode + bound action, no PLATFORM shortcut.
-- ============================================================
CREATE OR REPLACE FUNCTION tenancy.create_tenant(p_id uuid, p_name text, p_residency text, p_actor text)
RETURNS void SECURITY DEFINER SET search_path = tenancy, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_business_authority('tenancy.tenant.create');
  IF public.eye_scope() <> 'PLATFORM' THEN
    RAISE EXCEPTION 'tenant creation rejected: platform authority required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at)
    VALUES (p_id, p_name, 'active', p_residency, 'default', clock_timestamp());
  INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
    VALUES (gen_random_uuid(), 'TENANT', p_id, NULL, 'tenant.created', p_actor,
            jsonb_build_object('name', p_name, 'residency_profile', p_residency));
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tenancy.create_domain(p_id uuid, p_tenant uuid, p_name text, p_actor text)
RETURNS void SECURITY DEFINER SET search_path = tenancy, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_business_authority('tenancy.domain.create');
  IF NOT (public.eye_scope() = 'PLATFORM'
          OR (public.eye_scope() = 'TENANT' AND p_tenant = public.eye_tenant())) THEN
    RAISE EXCEPTION 'domain creation rejected: tenant-level authority required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO tenancy.domains (id, tenant_id, name, status, activated_at)
    VALUES (p_id, p_tenant, p_name, 'active', clock_timestamp());
  INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_id, 'domain.created', p_actor,
            jsonb_build_object('name', p_name));
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION identity.create_principal(
  p_id uuid, p_kind text, p_scope text, p_tenant uuid, p_domain uuid,
  p_display_name text, p_login_name text, p_secret_hash text, p_role_code text
) RETURNS void
SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_grantor uuid := public.eye_principal();
BEGIN
  -- Bootstrap is the one caller without a session; it holds the bootstrap
  -- capability instead, and nothing else.
  IF public.eye_ctx_mode() = 'bootstrap' THEN
    PERFORM ctx.assert_capability('bootstrap', 'bootstrap', 'identity.bootstrap.platform_admin');
    v_grantor := NULL;
  ELSE
    PERFORM ctx.assert_business_authority('identity.principal.create');
    IF NOT ((public.eye_scope() = 'PLATFORM' AND p_scope = 'PLATFORM' AND p_tenant IS NULL)
            OR public.eye_row_writable(p_scope, p_tenant, p_domain)) THEN
      RAISE EXCEPTION 'principal creation rejected: context not authorized for that scope'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_secret_hash IS NOT NULL AND p_kind <> 'human' THEN
    RAISE EXCEPTION 'password credentials are restricted to human principals' USING ERRCODE = '42501';
  END IF;
  IF p_secret_hash IS NOT NULL AND (p_login_name IS NULL OR length(p_login_name) < 3) THEN
    RAISE EXCEPTION 'a unique login_name is required for password principals' USING ERRCODE = '22023';
  END IF;
  INSERT INTO identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
    VALUES (p_id, p_kind, p_scope, p_tenant, p_domain, p_display_name,
            CASE WHEN p_kind = 'human' THEN p_login_name ELSE NULL END, 'active');
  IF p_secret_hash IS NOT NULL THEN
    INSERT INTO identity.credentials (id, principal_id, type, secret_hash, status)
      VALUES (gen_random_uuid(), p_id, 'password', p_secret_hash, 'active');
  END IF;
  IF p_role_code IS NOT NULL THEN
    INSERT INTO identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id,
                                        granted_by_principal, granted_by_scope)
      VALUES (gen_random_uuid(), p_id, p_role_code, p_scope, p_tenant, p_domain,
              v_grantor, public.eye_scope());
  END IF;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 3. POL / AUD: authority-bound, derived, and LINKED to each other.
-- ============================================================
-- Gate-2.1 §3: a decision records HOW it was written. An evidence-mode decision is
-- marked permanently, and audit.commit_event refuses to let a SUCCESS reference it
-- — in this transaction or any later one. That is strictly stronger than refusing
-- to record allow-class decisions in evidence mode, which had the perverse effect
-- of erasing the true decision from a request that was allowed and then FAILED.
ALTER TABLE policy.policy_decisions
  ADD COLUMN IF NOT EXISTS evidence_only boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION policy.commit_decision(
  p_id uuid, p_action text, p_object_type text, p_object_id uuid,
  p_consequence_class text, p_decision text, p_obligations jsonb,
  p_input_digest text, p_bundle_version text, p_exception_ref text,
  p_expires_at timestamptz, p_revocation_state text, p_reason text,
  p_correlation uuid, p_delegation text, p_environment jsonb
) RETURNS uuid
SECURITY DEFINER SET search_path = policy, ctx, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_mode text := public.eye_ctx_mode();
  v_scope text := public.eye_scope();
  v_tenant uuid := public.eye_tenant();
  v_domain uuid := public.eye_domain();
  v_principal uuid := public.eye_principal();
  v_purpose text := public.eye_purpose();
BEGIN
  IF v_mode NOT IN ('authority','evidence') THEN
    RAISE EXCEPTION 'policy rejected: authority or evidence context required (context is %)', v_mode
      USING ERRCODE = '42501';
  END IF;
  -- Evidence mode records the TRUE decision and is marked evidence_only, which
  -- makes it unusable as the authorization for any successful event, forever.
  -- (A request that was allowed and then failed must still be able to show the
  -- decision it was allowed under.)
  IF public.eye_bound_action() IS DISTINCT FROM p_action THEN
    RAISE EXCEPTION 'policy rejected: context is bound to action %, not %',
      coalesce(public.eye_bound_action(),'<none>'), p_action USING ERRCODE = '42501';
  END IF;
  IF public.eye_correlation() IS DISTINCT FROM p_correlation THEN
    RAISE EXCEPTION 'policy rejected: correlation does not match the bound request' USING ERRCODE = '42501';
  END IF;
  IF v_mode = 'authority' AND public.eye_policy_decision() IS DISTINCT FROM p_id THEN
    RAISE EXCEPTION 'policy rejected: decision id does not match the bound capability' USING ERRCODE = '42501';
  END IF;
  IF v_mode = 'authority' AND public.eye_bundle_version() IS DISTINCT FROM p_bundle_version THEN
    RAISE EXCEPTION 'policy rejected: bundle version does not match the bound capability' USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
  IF (v_scope = 'PLATFORM' AND (v_tenant IS NOT NULL OR v_domain IS NOT NULL))
     OR (v_scope = 'TENANT' AND (v_tenant IS NULL OR v_domain IS NOT NULL))
     OR (v_scope = 'DOMAIN' AND (v_tenant IS NULL OR v_domain IS NULL)) THEN
    RAISE EXCEPTION 'policy rejected: malformed scope/identifier combination' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('allow','allow_with_obligations','deny','indeterminate') THEN
    RAISE EXCEPTION 'policy rejected: invalid decision %', p_decision USING ERRCODE = '22023';
  END IF;
  INSERT INTO policy.policy_decisions (
    id, scope, tenant_id, domain_id, decision, obligations, principal_id, delegation_id,
    action, object_type, object_id, purpose_id, consequence_class, environment,
    input_digest, bundle_version, exception_ref, expires_at, revocation_state, reason, correlation_id,
    evidence_only
  ) VALUES (
    p_id, v_scope, v_tenant, v_domain, p_decision, coalesce(p_obligations,'[]'::jsonb),
    'principal:' || v_principal::text, p_delegation,
    p_action, p_object_type, p_object_id, v_purpose, p_consequence_class,
    coalesce(p_environment,'{}'::jsonb), p_input_digest, p_bundle_version,
    p_exception_ref, p_expires_at, coalesce(p_revocation_state,'none'), p_reason, p_correlation,
    (v_mode = 'evidence')
  );
  RETURN p_id;
END $$ LANGUAGE plpgsql;

-- AUD: derived authority, capability-checked, and (for request events) LINKED to
-- the POL row by principal, action, scope, correlation, decision and bundle.
CREATE OR REPLACE FUNCTION audit.commit_event(
  p_event_type text, p_action text, p_outcome text, p_result_code text,
  p_target_type text, p_target_id text, p_target_version text,
  p_policy_decision_id uuid, p_policy_version text,
  p_correlation uuid, p_causation uuid, p_trace text, p_request_digest text,
  p_delegation text, p_metadata jsonb
) RETURNS TABLE (partition_id text, audit_seq bigint, row_hash text)
SECURITY DEFINER SET search_path = audit, canon, ctx, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_mode text := public.eye_ctx_mode();
  v_scope text := public.eye_scope();
  v_tenant uuid := public.eye_tenant();
  v_domain uuid := public.eye_domain();
  v_session uuid := public.eye_session();
  v_principal uuid := public.eye_principal();
  v_purpose text := public.eye_purpose();
  v_partition text; v_actor text; v_event jsonb; v_head RECORD;
  v_hash text; v_jcs text; v_pol RECORD;
BEGIN
  IF v_mode NOT IN ('authority','evidence') THEN
    RAISE EXCEPTION 'audit rejected: authority or evidence context required (context is %)', v_mode
      USING ERRCODE = '42501';
  END IF;
  -- Evidence mode records ONLY denial/failure. Fabricated success is impossible.
  IF v_mode = 'evidence' AND p_outcome NOT IN ('denied','failure','indeterminate') THEN
    RAISE EXCEPTION 'audit rejected: evidence mode cannot record outcome %', p_outcome
      USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('success','denied','failure','indeterminate') THEN
    RAISE EXCEPTION 'audit rejected: invalid outcome %', p_outcome USING ERRCODE = '22023';
  END IF;
  IF public.eye_bound_action() IS DISTINCT FROM p_action THEN
    RAISE EXCEPTION 'audit rejected: context is bound to action %, not %',
      coalesce(public.eye_bound_action(),'<none>'), p_action USING ERRCODE = '42501';
  END IF;
  IF public.eye_correlation() IS DISTINCT FROM p_correlation THEN
    RAISE EXCEPTION 'audit rejected: correlation does not match the bound request' USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
  IF (v_scope = 'PLATFORM' AND (v_tenant IS NOT NULL OR v_domain IS NOT NULL))
     OR (v_scope = 'TENANT' AND (v_tenant IS NULL OR v_domain IS NOT NULL))
     OR (v_scope = 'DOMAIN' AND (v_tenant IS NULL OR v_domain IS NULL)) THEN
    RAISE EXCEPTION 'audit rejected: malformed scope/identifier combination' USING ERRCODE = '42501';
  END IF;

  -- §3 LINKAGE: a request event carrying a policy decision must match that POL
  -- row on principal, action, scope, correlation, decision class and bundle.
  IF p_policy_decision_id IS NOT NULL THEN
    SELECT * INTO v_pol FROM policy.policy_decisions WHERE id = p_policy_decision_id;
    IF v_pol.id IS NULL THEN
      RAISE EXCEPTION 'audit rejected: referenced policy decision does not exist' USING ERRCODE = '42501';
    END IF;
    IF v_pol.principal_id IS DISTINCT FROM 'principal:' || v_principal::text
       OR v_pol.action IS DISTINCT FROM p_action
       OR v_pol.scope IS DISTINCT FROM v_scope
       OR v_pol.tenant_id IS DISTINCT FROM v_tenant
       OR v_pol.domain_id IS DISTINCT FROM v_domain
       OR v_pol.correlation_id IS DISTINCT FROM p_correlation
       OR v_pol.bundle_version IS DISTINCT FROM p_policy_version THEN
      RAISE EXCEPTION 'audit rejected: evidence does not match its policy decision' USING ERRCODE = '42501';
    END IF;
    -- An evidence-written decision can never authorize a success — not here, and
    -- not from a later transaction either.
    IF p_outcome = 'success' AND v_pol.evidence_only THEN
      RAISE EXCEPTION 'audit rejected: a success cannot reference an evidence-only policy decision'
        USING ERRCODE = '42501';
    END IF;
    -- Outcome class must agree with the decision class.
    IF (p_outcome = 'success' AND v_pol.decision NOT IN ('allow','allow_with_obligations'))
       OR (p_outcome = 'denied' AND v_pol.decision NOT IN ('deny','indeterminate')) THEN
      RAISE EXCEPTION 'audit rejected: outcome % contradicts decision %', p_outcome, v_pol.decision
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_event_type = 'api.request' AND p_outcome = 'success' THEN
    RAISE EXCEPTION 'audit rejected: a successful request event must reference its policy decision'
      USING ERRCODE = '42501';
  END IF;

  v_partition := CASE WHEN v_scope = 'PLATFORM' THEN 'platform' ELSE 'tenant:' || v_tenant::text END;
  v_actor := CASE WHEN v_principal IS NULL
                  THEN 'workload:system.commit-pipeline'
                  ELSE 'principal:' || v_principal::text END;

  v_event := jsonb_build_object(
    'event_type', p_event_type, 'outcome', p_outcome, 'scope', v_scope,
    'tenant_id', v_tenant, 'domain_id', v_domain, 'actor', v_actor,
    'delegation_id', p_delegation, 'action', p_action, 'target_type', p_target_type,
    'target_id', p_target_id, 'target_version', p_target_version, 'purpose_id', v_purpose,
    'policy_decision_id', p_policy_decision_id, 'policy_version', p_policy_version,
    'result_code', p_result_code,
    'occurred_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'clock_quality', 'trusted', 'correlation_id', p_correlation, 'causation_id', p_causation,
    'trace_id', p_trace, 'request_digest', p_request_digest, 'session_id', v_session,
    'context_mode', v_mode, 'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
  SELECT * INTO v_head FROM audit.advance_chain_head(v_partition);
  v_jcs := canon.jcs(v_event);
  v_hash := canon.audit_row_hash(v_partition, v_head.seq, v_head.prev_hash, v_jcs::jsonb);
  INSERT INTO audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
    VALUES (v_partition, v_head.seq, v_jcs, v_head.prev_hash, v_hash);
  PERFORM audit.commit_chain_head(v_partition, v_head.seq, v_hash);
  RETURN QUERY SELECT v_partition, v_head.seq, v_hash;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.commit_event(text,text,text,text,text,text,text,uuid,text,uuid,uuid,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.commit_event(text,text,text,text,text,text,text,uuid,text,uuid,uuid,text,text,text,jsonb)
  TO eye_commit;

-- Identity-flow events: identity_op capability only, actor derived from a
-- verified principal row.
CREATE OR REPLACE FUNCTION audit.commit_identity_event(
  p_principal uuid, p_session uuid, p_event_type text, p_action text, p_outcome text,
  p_result_code text, p_correlation uuid, p_metadata jsonb
) RETURNS TABLE (partition_id text, audit_seq bigint, row_hash text)
SECURITY DEFINER SET search_path = audit, canon, ctx, identity, public, pg_catalog, pg_temp
AS $$
DECLARE v_actor text; v_event jsonb; v_head RECORD; v_hash text; v_jcs text;
BEGIN
  IF public.eye_ctx_mode() NOT IN ('identity_op','bootstrap') THEN
    RAISE EXCEPTION 'identity audit rejected: identity capability required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  -- Gate-2.1 §4: the SHARED assertion, so this port revalidates exactly like every
  -- other authoritative port instead of carrying its own partial copy of the rules.
  PERFORM ctx.assert_capability(public.eye_ctx_mode(), NULL, p_action);
  IF p_outcome NOT IN ('success','denied','failure') THEN
    RAISE EXCEPTION 'identity audit rejected: invalid outcome' USING ERRCODE = '22023';
  END IF;
  IF p_principal IS NULL THEN
    v_actor := 'anonymous';
  ELSE
    IF NOT EXISTS (SELECT 1 FROM identity.principals WHERE id = p_principal) THEN
      RAISE EXCEPTION 'identity audit rejected: unknown principal' USING ERRCODE = '42501';
    END IF;
    IF p_session IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM identity.sessions WHERE id = p_session AND principal_id = p_principal
    ) THEN
      RAISE EXCEPTION 'identity audit rejected: session does not belong to the principal'
        USING ERRCODE = '42501';
    END IF;
    v_actor := 'principal:' || p_principal::text;
  END IF;
  v_event := jsonb_build_object(
    'event_type', p_event_type, 'outcome', p_outcome, 'scope', 'PLATFORM',
    'tenant_id', NULL, 'domain_id', NULL, 'actor', v_actor, 'delegation_id', NULL,
    'action', p_action, 'target_type', 'SES', 'target_id', p_session, 'target_version', NULL,
    'purpose_id', 'authentication', 'policy_decision_id', NULL, 'policy_version', NULL,
    'result_code', p_result_code,
    'occurred_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'clock_quality', 'trusted', 'correlation_id', p_correlation, 'causation_id', NULL,
    'trace_id', NULL, 'request_digest', NULL, 'session_id', p_session,
    'context_mode', public.eye_ctx_mode(), 'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
  SELECT * INTO v_head FROM audit.advance_chain_head('platform');
  v_jcs := canon.jcs(v_event);
  v_hash := canon.audit_row_hash('platform', v_head.seq, v_head.prev_hash, v_jcs::jsonb);
  INSERT INTO audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
    VALUES ('platform', v_head.seq, v_jcs, v_head.prev_hash, v_hash);
  PERFORM audit.commit_chain_head('platform', v_head.seq, v_hash);
  RETURN QUERY SELECT 'platform'::text, v_head.seq, v_hash;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.commit_identity_event(uuid,uuid,text,text,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.commit_identity_event(uuid,uuid,text,text,text,text,uuid,jsonb) TO eye_identity;

-- Verifier's own evidence port: integrity outcomes ONLY, under verify capability.
CREATE OR REPLACE FUNCTION audit.commit_integrity_event(
  p_partition text, p_outcome text, p_result_code text, p_correlation uuid, p_detail jsonb
) RETURNS bigint
SECURITY DEFINER SET search_path = audit, canon, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_event jsonb; v_head RECORD; v_hash text; v_jcs text;
BEGIN
  PERFORM ctx.assert_capability('verify', NULL, NULL);
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

-- ============================================================
-- 4. Evidence-mode capability: subject derived from the live session, scope
--    validated against subject AND attempted route, typed denial only.
-- ============================================================
CREATE OR REPLACE FUNCTION ctx.issue_evidence(
  p_session uuid, p_context_key text, p_scope text, p_tenant uuid, p_domain uuid,
  p_purpose text, p_action text, p_route_scope text, p_route_tenant uuid,
  p_route_domain uuid, p_correlation uuid, p_ttl_seconds int DEFAULT 60
) RETURNS void
SECURITY DEFINER SET search_path = ctx, identity, public, pg_catalog, pg_temp
AS $$
DECLARE s RECORD; v_epoch bigint;
BEGIN
  -- Gate-2.1 §1: the mintable ACTION SET is bound to the minting ROLE. session_user
  -- (not current_user) is the CONNECTED role: inside a SECURITY DEFINER function
  -- current_user is the function owner, which would make this check vacuous. The
  -- identity authority serves identity.* requests and nothing else; the commit
  -- authority serves everything else. So a role that holds the evidence ports can
  -- only ever produce evidence for the requests it is entitled to serve, and
  -- granting those ports to the identity authority adds no reachable power.
  IF session_user = 'eye_identity' AND p_action NOT LIKE 'identity.%' THEN
    RAISE EXCEPTION 'context denied: the identity authority cannot mint a capability for action %', p_action
      USING ERRCODE = '42501';
  END IF;
  IF session_user = 'eye_commit' AND p_action LIKE 'identity.%' THEN
    RAISE EXCEPTION 'context denied: the commit authority cannot mint an identity capability (action %)', p_action
      USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'evidence context denied: invalid scope %', p_scope USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'evidence context denied: action and correlation are required' USING ERRCODE = '42501';
  END IF;
  -- The subject is DERIVED from the live session; the caller cannot nominate one.
  SELECT s2.id, s2.principal_id, s2.assurance, s2.status, s2.expires_at, s2.context_key_hash, s2.bound_epoch
    INTO s FROM identity.sessions s2 WHERE s2.id = p_session;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'evidence context denied: no such session' USING ERRCODE = '42501';
  END IF;
  IF s.context_key_hash IS DISTINCT FROM encode(public.digest(convert_to(p_context_key,'UTF8'),'sha256'),'hex') THEN
    RAISE EXCEPTION 'evidence context denied: invalid session proof' USING ERRCODE = '42501';
  END IF;
  IF s.status <> 'active' OR s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'evidence context denied: session not active' USING ERRCODE = '42501';
  END IF;
  SELECT p.revocation_epoch INTO v_epoch FROM identity.principals p
   WHERE p.id = s.principal_id AND p.status = 'active';
  IF v_epoch IS NULL THEN
    RAISE EXCEPTION 'evidence context denied: principal not active' USING ERRCODE = '42501';
  END IF;
  IF s.bound_epoch IS DISTINCT FROM v_epoch THEN
    RAISE EXCEPTION 'evidence context denied: authority epoch changed' USING ERRCODE = '42501';
  END IF;
  -- The requested scope must match the ATTEMPTED ROUTE, so a denial cannot be
  -- recorded against an elevated scope the subject never attempted.
  IF p_scope IS DISTINCT FROM p_route_scope
     OR p_tenant IS DISTINCT FROM p_route_tenant
     OR p_domain IS DISTINCT FROM p_route_domain THEN
    RAISE EXCEPTION 'evidence context denied: requested scope does not match the attempted route'
      USING ERRCODE = '42501';
  END IF;
  -- The subject must be *related* to the scope: a principal may only have a
  -- denial recorded within its own tenant/domain reach, or at platform level if
  -- it is a platform principal.
  IF p_scope <> 'PLATFORM' AND NOT EXISTS (
    SELECT 1 FROM identity.principals p
     WHERE p.id = s.principal_id
       AND (p.scope = 'PLATFORM'
            OR (p.tenant_id = p_tenant AND (p.domain_id IS NULL OR p.domain_id = p_domain)))
  ) THEN
    RAISE EXCEPTION 'evidence context denied: subject is unrelated to the requested scope'
      USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    p_session, s.principal_id, p_scope, p_tenant, p_domain, s.assurance, p_purpose,
    v_epoch, 'evidence', 'denial', p_action, NULL, p_correlation, NULL, NULL,
    p_ttl_seconds), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_evidence(uuid,text,text,uuid,uuid,text,text,text,uuid,uuid,uuid,int) FROM PUBLIC;
-- Both request-serving authorities may mint evidence capabilities; the role/action
-- binding above decides which requests each one can produce evidence FOR.
GRANT EXECUTE ON FUNCTION ctx.issue_evidence(uuid,text,text,uuid,uuid,text,text,text,uuid,uuid,uuid,int)
  TO eye_commit, eye_identity;
-- The old 7-argument evidence minter (which accepted an arbitrary scope) is gone.
DROP FUNCTION IF EXISTS ctx.issue_evidence(uuid, text, text, uuid, uuid, text, int);

-- Unauthenticated failure evidence (security intake) — identity capability, no
-- session, always 'failure'.
CREATE OR REPLACE FUNCTION audit.commit_intake_event(
  p_event_type text, p_action text, p_result_code text, p_correlation uuid,
  p_subject uuid, p_metadata jsonb
) RETURNS bigint
SECURITY DEFINER SET search_path = audit, canon, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_event jsonb; v_head RECORD; v_hash text; v_jcs text;
  v_outcome text; v_actor text;
BEGIN
  PERFORM ctx.assert_capability('identity_op', 'identity', 'identity.security.intake');
  -- The event type is an ALLOWLIST, not caller text: the identity capability can
  -- record exactly these refusals on the platform partition and nothing else. No
  -- 'success' outcome exists here at all, so this port cannot manufacture one.
  IF (p_event_type, p_action) NOT IN (
       ('security.intake',       'request.rejected'),
       ('request.scope_denied',  'request.scope_denied'),
       ('request.rejected',      'request.rejected'),
       ('request.capability_denied', 'request.capability_denied')
     ) THEN
    RAISE EXCEPTION 'intake rejected: event type %/% is not a permitted refusal record',
      p_event_type, p_action USING ERRCODE = '42501';
  END IF;
  v_outcome := CASE WHEN p_event_type = 'security.intake' THEN 'failure' ELSE 'denied' END;
  -- The actor is DERIVED: anonymous unless the capability was minted with a
  -- subject, in which case it is that subject and nothing else.
  v_actor := CASE WHEN p_subject IS NULL THEN 'anonymous' ELSE 'principal:' || p_subject::text END;
  IF p_subject IS NOT NULL
     AND coalesce(public.eye_bound_target(),'') <> p_subject::text THEN
    RAISE EXCEPTION 'intake rejected: subject does not match the bound capability'
      USING ERRCODE = '42501';
  END IF;
  IF public.eye_correlation() IS DISTINCT FROM p_correlation THEN
    RAISE EXCEPTION 'intake rejected: correlation does not match the bound capability'
      USING ERRCODE = '42501';
  END IF;
  v_event := jsonb_build_object(
    'event_type', p_event_type, 'outcome', v_outcome, 'scope', 'PLATFORM',
    'tenant_id', NULL, 'domain_id', NULL, 'actor', v_actor, 'delegation_id', NULL,
    'action', p_action, 'target_type', NULL, 'target_id', NULL,
    'target_version', NULL, 'purpose_id', NULL, 'policy_decision_id', NULL,
    'policy_version', NULL, 'result_code', p_result_code,
    'occurred_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'clock_quality', 'trusted', 'correlation_id', p_correlation, 'causation_id', NULL,
    'trace_id', NULL, 'request_digest', NULL, 'session_id', NULL,
    'context_mode', 'identity_op', 'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
  SELECT * INTO v_head FROM audit.advance_chain_head('platform');
  v_jcs := canon.jcs(v_event);
  v_hash := canon.audit_row_hash('platform', v_head.seq, v_head.prev_hash, v_jcs::jsonb);
  INSERT INTO audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
    VALUES ('platform', v_head.seq, v_jcs, v_head.prev_hash, v_hash);
  PERFORM audit.commit_chain_head('platform', v_head.seq, v_hash);
  RETURN v_head.seq;
END $$ LANGUAGE plpgsql;
DROP FUNCTION IF EXISTS audit.commit_intake_event(text, uuid, jsonb);
REVOKE ALL ON FUNCTION audit.commit_intake_event(text,text,text,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.commit_intake_event(text,text,text,uuid,uuid,jsonb) TO eye_identity;

-- ============================================================
-- 5. Canonical admission under authority + bound action.
-- ============================================================
CREATE OR REPLACE FUNCTION objects.admit_version(
  p_header jsonb, p_payload jsonb, p_digest text
) RETURNS TABLE (object_id uuid, object_version bigint, content_digest text)
SECURITY DEFINER SET search_path = objects, canon, ctx, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_missing text; v_extra text; v_recomputed text;
  v_scope text := p_header->>'scope';
  v_tenant uuid := NULLIF(p_header->>'tenant_id','')::uuid;
  v_domain uuid := NULLIF(p_header->>'domain_id','')::uuid;
BEGIN
  -- Authority mode + the bound canonical action; system/evidence modes fail.
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'admission rejected: authority mode required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_action() NOT IN ('objects.create','objects.correct') THEN
    RAISE EXCEPTION 'admission rejected: context is bound to action %, not a canonical write',
      coalesce(public.eye_bound_action(),'<none>') USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();

  SELECT string_agg(field_name, ', ') INTO v_missing
    FROM objects.canonical_field_registry r WHERE NOT (p_header ? r.field_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header missing required field(s): %', v_missing
      USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(k, ', ') INTO v_extra
    FROM jsonb_object_keys(p_header) AS k
   WHERE NOT EXISTS (SELECT 1 FROM objects.canonical_field_registry r WHERE r.field_name = k);
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header carries unregistered field(s): %', v_extra
      USING ERRCODE = '22023';
  END IF;

  -- Full header SEMANTICS, not merely key presence (Gate-2.1 §8).
  PERFORM objects.assert_header_semantics(p_header);

  v_recomputed := canon.sha256_hex(canon.jcs(jsonb_build_object('header', p_header, 'payload', p_payload)));
  IF p_digest IS DISTINCT FROM v_recomputed THEN
    RAISE EXCEPTION 'admission rejected: content digest does not bind the header and payload'
      USING ERRCODE = '42501';
  END IF;
  IF NOT ((public.eye_scope() = 'PLATFORM' AND v_scope = 'PLATFORM' AND v_tenant IS NULL)
          OR public.eye_row_writable(v_scope, v_tenant, v_domain)) THEN
    RAISE EXCEPTION 'admission rejected: context not authorized for the object scope'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO objects.canonical_objects (
    object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state,
    owning_component, accountable_owner, source_object_ids, event_time, observation_time,
    valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state,
    synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref,
    contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope,
    rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile,
    quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes,
    withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest
  ) VALUES (
    (p_header->>'object_id')::uuid, p_header->>'object_type', v_tenant, v_domain, v_scope,
    (p_header->>'object_version')::bigint, p_header->>'lifecycle_state',
    p_header->>'owning_component', p_header->>'accountable_owner',
    coalesce(p_header->'source_object_ids','[]'::jsonb),
    NULLIF(p_header->>'event_time','')::timestamptz, NULLIF(p_header->>'observation_time','')::timestamptz,
    NULLIF(p_header->>'valid_from','')::timestamptz, NULLIF(p_header->>'valid_to','')::timestamptz,
    (p_header->>'recorded_at')::timestamptz, p_header->>'time_precision',
    p_header->>'source_clock_quality', p_header->>'truth_state',
    (p_header->>'synthetic_state')::boolean, p_header->'confidence', p_header->'uncertainty',
    coalesce(p_header->'evidence_refs','[]'::jsonb), p_header->>'provenance_ref', p_header->>'method_ref',
    coalesce(p_header->'contradiction_refs','[]'::jsonb), coalesce(p_header->'corroboration_refs','[]'::jsonb),
    coalesce(p_header->'human_refs','[]'::jsonb), p_header->>'classification', p_header->>'purpose_scope',
    p_header->>'rights_profile', p_header->>'residency_profile', p_header->>'retention_profile',
    p_header->>'access_policy_ref', p_header->>'quality_profile', p_header->'quality_state',
    p_header->'freshness_state', p_header->>'schema_ref', p_header->>'ontology_ref',
    p_header->>'correction_of', p_header->>'supersedes', p_header->>'withdrawal_reason',
    (p_header->>'audit_correlation_id')::uuid, p_header->>'content_ref',
    p_payload, v_recomputed
  );
  RETURN QUERY SELECT (p_header->>'object_id')::uuid, (p_header->>'object_version')::bigint, v_recomputed;
END $$ LANGUAGE plpgsql;

-- Header semantics: enums, temporal constraints, structured quality/confidence,
-- schema reference shape and authoritative recorded_at handling.
CREATE OR REPLACE FUNCTION objects.assert_header_semantics(p_header jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := p_header->>'scope';
  v_recorded timestamptz;
  v_vf timestamptz := NULLIF(p_header->>'valid_from','')::timestamptz;
  v_vt timestamptz := NULLIF(p_header->>'valid_to','')::timestamptz;
BEGIN
  IF v_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'header semantics: scope % is not a canonical scope', v_scope USING ERRCODE = '22023';
  END IF;
  IF (v_scope = 'PLATFORM' AND (p_header->>'tenant_id' IS NOT NULL OR p_header->>'domain_id' IS NOT NULL))
     OR (v_scope = 'TENANT' AND (p_header->>'tenant_id' IS NULL OR p_header->>'domain_id' IS NOT NULL))
     OR (v_scope = 'DOMAIN' AND (p_header->>'tenant_id' IS NULL OR p_header->>'domain_id' IS NULL)) THEN
    RAISE EXCEPTION 'header semantics: scope/identifier combination is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'object_type' !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'header semantics: object_type must be three uppercase letters' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'object_version' !~ '^[1-9][0-9]{0,17}$' THEN
    RAISE EXCEPTION 'header semantics: object_version must be a positive integer string' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'lifecycle_state' NOT IN
     ('proposed','admitted','active','disputed','corrected','withdrawn','superseded','archived','deleted') THEN
    RAISE EXCEPTION 'header semantics: lifecycle_state % is not permitted', p_header->>'lifecycle_state'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'truth_state' NOT IN
     ('observed','asserted','extracted','inferred','assessed','synthetic','decided','disputed','withdrawn') THEN
    RAISE EXCEPTION 'header semantics: truth_state % is not canonical', p_header->>'truth_state'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'time_precision' NOT IN
     ('exact','second','minute','hour','day','month','year','approximate','unknown') THEN
    RAISE EXCEPTION 'header semantics: time_precision % is not permitted', p_header->>'time_precision'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'source_clock_quality' NOT IN ('trusted','degraded','unknown') THEN
    RAISE EXCEPTION 'header semantics: source_clock_quality % is not permitted',
      p_header->>'source_clock_quality' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_header->'synthetic_state') <> 'boolean' THEN
    RAISE EXCEPTION 'header semantics: synthetic_state must be boolean' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'truth_state' = 'synthetic' AND (p_header->>'synthetic_state')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'header semantics: synthetic truth state requires synthetic_state' USING ERRCODE = '22023';
  END IF;
  -- Structured values must be objects (or null), never scalars smuggled in.
  IF jsonb_typeof(p_header->'confidence') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'uncertainty') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'quality_state') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'freshness_state') NOT IN ('object','null') THEN
    RAISE EXCEPTION 'header semantics: confidence/uncertainty/quality_state/freshness_state must be objects or null'
      USING ERRCODE = '22023';
  END IF;
  -- Reference arrays must be arrays of strings.
  IF jsonb_typeof(p_header->'evidence_refs') <> 'array'
     OR jsonb_typeof(p_header->'source_object_ids') <> 'array'
     OR jsonb_typeof(p_header->'contradiction_refs') <> 'array'
     OR jsonb_typeof(p_header->'corroboration_refs') <> 'array'
     OR jsonb_typeof(p_header->'human_refs') <> 'array' THEN
    RAISE EXCEPTION 'header semantics: reference fields must be arrays' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'schema_ref' !~ '^[A-Z]{3}@v[0-9]+$' THEN
    RAISE EXCEPTION 'header semantics: schema_ref % must be <TYPE>@v<N>', p_header->>'schema_ref'
      USING ERRCODE = '22023';
  END IF;
  IF left(p_header->>'schema_ref', 3) <> p_header->>'object_type' THEN
    RAISE EXCEPTION 'header semantics: schema_ref does not match object_type' USING ERRCODE = '22023';
  END IF;
  -- Temporal constraints.
  IF v_vt IS NOT NULL AND v_vf IS NULL THEN
    RAISE EXCEPTION 'header semantics: valid_to requires valid_from' USING ERRCODE = '22023';
  END IF;
  IF v_vt IS NOT NULL AND v_vf IS NOT NULL AND v_vt <= v_vf THEN
    RAISE EXCEPTION 'header semantics: valid_to must be after valid_from' USING ERRCODE = '22023';
  END IF;
  -- Authoritative recorded_at: present, parseable, and not from the future.
  BEGIN
    v_recorded := (p_header->>'recorded_at')::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'header semantics: recorded_at is not a valid instant' USING ERRCODE = '22023';
  END;
  IF v_recorded IS NULL THEN
    RAISE EXCEPTION 'header semantics: recorded_at is required' USING ERRCODE = '22023';
  END IF;
  IF v_recorded > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'header semantics: recorded_at is in the future' USING ERRCODE = '22023';
  END IF;
  IF (p_header->>'audit_correlation_id') IS NULL THEN
    RAISE EXCEPTION 'header semantics: audit_correlation_id is required' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_header->>'classification','') = '' OR coalesce(p_header->>'purpose_scope','') = ''
     OR coalesce(p_header->>'owning_component','') = '' OR coalesce(p_header->>'accountable_owner','') = '' THEN
    RAISE EXCEPTION 'header semantics: classification, purpose_scope, owning_component and accountable_owner are required'
      USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION objects.assert_header_semantics(jsonb) FROM PUBLIC;

-- ============================================================
-- 6. Close identity/metadata leakage (§5).
-- ============================================================
-- Caller-bound identity lookups: eye_app may resolve ONLY the subject of the
-- session it presents, never an arbitrary UUID.
CREATE OR REPLACE FUNCTION identity.session_subject(p_session uuid, p_context_key text)
RETURNS TABLE (session_id uuid, principal_id uuid, assurance text, kind text,
               scope text, tenant_id uuid, domain_id uuid, status text, revocation_epoch bigint)
SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT s.id, p.id, s.assurance, p.kind, p.scope, p.tenant_id, p.domain_id, p.status, p.revocation_epoch
    FROM identity.sessions s
    JOIN identity.principals p ON p.id = s.principal_id
   WHERE s.id = p_session
     AND s.status = 'active'
     AND s.expires_at > clock_timestamp()
     AND s.context_key_hash = encode(public.digest(convert_to(p_context_key,'UTF8'),'sha256'),'hex')
     AND p.status = 'active'
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION identity.session_subject(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.session_subject(uuid, text) TO eye_app, eye_identity;

CREATE OR REPLACE FUNCTION identity.session_bindings(p_session uuid, p_context_key text)
RETURNS TABLE (role_code text, scope text, tenant_id uuid, domain_id uuid)
SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT b.role_code, b.scope, b.tenant_id, b.domain_id
    FROM identity.sessions s
    JOIN identity.role_bindings b ON b.principal_id = s.principal_id AND b.revoked_at IS NULL
   WHERE s.id = p_session
     AND s.status = 'active'
     AND s.expires_at > clock_timestamp()
     AND s.context_key_hash = encode(public.digest(convert_to(p_context_key,'UTF8'),'sha256'),'hex')
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION identity.session_bindings(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.session_bindings(uuid, text) TO eye_app, eye_identity;

-- The unbounded lookups are withdrawn from the application role entirely.
REVOKE ALL ON FUNCTION identity.auth_principal(uuid) FROM eye_app, eye_commit, PUBLIC;
REVOKE ALL ON FUNCTION identity.auth_bindings(uuid) FROM eye_app, eye_commit, PUBLIC;
REVOKE ALL ON FUNCTION identity.session_get_active(uuid) FROM eye_app, eye_commit, PUBLIC;

-- Domain-specific integrity projection: a DOMAIN principal learns about its OWN
-- domain's evidence only — never tenant-global heads, counts, seals or incidents.
DROP FUNCTION IF EXISTS audit.my_partition_status(text);
CREATE OR REPLACE FUNCTION audit.my_domain_integrity()
RETURNS TABLE (scope text, tenant_id uuid, domain_id uuid, events bigint, last_occurred_at text)
SECURITY DEFINER SET search_path = audit, public, pg_catalog, pg_temp AS $$
  SELECT public.eye_scope(), public.eye_tenant(), public.eye_domain(),
         count(*)::bigint, max(e.occurred_at)
    FROM audit.audit_events e
   WHERE public.eye_scope() = 'DOMAIN'
     AND e.tenant_id = public.eye_tenant()
     AND e.domain_id = public.eye_domain()
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION audit.my_domain_integrity() FROM PUBLIC;
-- Granted to the authority that actually performs governed reads. eye_app can
-- mint no capability, so these views would always be empty for it — a grant that
-- can only ever return nothing is dead surface, not least privilege.
GRANT EXECUTE ON FUNCTION audit.my_domain_integrity() TO eye_commit;

-- Tenant/platform integrity summary: never available to a DOMAIN context.
CREATE OR REPLACE FUNCTION audit.my_partition_integrity(p_partition text)
RETURNS TABLE (partition_id text, next_seq bigint, frozen boolean, has_incident boolean)
SECURITY DEFINER SET search_path = audit, public, pg_catalog, pg_temp AS $$
  SELECT h.partition_id, h.next_seq, h.frozen,
         EXISTS (SELECT 1 FROM audit.integrity_incidents i WHERE i.partition_id = h.partition_id)
    FROM audit.audit_chain_heads h
   WHERE h.partition_id = p_partition
     AND (public.eye_scope() = 'PLATFORM'
          OR (public.eye_scope() = 'TENANT'
              AND p_partition = 'tenant:' || public.eye_tenant()::text))
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION audit.my_partition_integrity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.my_partition_integrity(text) TO eye_commit, eye_verifier;

-- ============================================================
-- 7. Degraded-state reconciliation across restarts (§7).
-- ============================================================
ALTER TABLE audit.availability_incidents
  ADD COLUMN IF NOT EXISTS reconciled_by text,
  ADD COLUMN IF NOT EXISTS journal_ref text;

CREATE OR REPLACE FUNCTION audit.open_availability_incidents()
RETURNS TABLE (id uuid, detected_at timestamptz, kind text, partition_hint text,
               correlation_id uuid, details jsonb)
SECURITY DEFINER SET search_path = audit, pg_catalog, pg_temp AS $$
  SELECT a.id, a.detected_at, a.kind, a.partition_hint, a.correlation_id, a.details
    FROM audit.availability_incidents a
   WHERE a.reconciled_at IS NULL AND a.kind <> 'degraded_recovered'
   ORDER BY a.detected_at
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION audit.open_availability_incidents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.open_availability_incidents()
  TO eye_app, eye_commit, eye_identity, eye_verifier;

CREATE OR REPLACE FUNCTION audit.reconcile_availability_incident(p_id uuid, p_by text, p_note text)
RETURNS boolean SECURITY DEFINER SET search_path = audit, pg_catalog, pg_temp AS $$
DECLARE n int;
BEGIN
  UPDATE audit.availability_incidents
     SET reconciled_at = clock_timestamp(), reconciled_by = p_by,
         details = details || jsonb_build_object('reconciliation_note', p_note)
   WHERE id = p_id AND reconciled_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.reconcile_availability_incident(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.reconcile_availability_incident(uuid, text, text) TO eye_verifier;

CREATE OR REPLACE FUNCTION audit.record_availability_incident(
  p_id uuid, p_kind text, p_partition_hint text, p_correlation uuid, p_details jsonb
) RETURNS void SECURITY DEFINER SET search_path = audit, pg_catalog, pg_temp AS $$
  INSERT INTO audit.availability_incidents (id, kind, partition_hint, correlation_id, details)
  VALUES (p_id, p_kind, p_partition_hint, p_correlation, coalesce(p_details,'{}'::jsonb))
  ON CONFLICT (id) DO NOTHING
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION audit.record_availability_incident(uuid,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.record_availability_incident(uuid,text,text,uuid,jsonb)
  TO eye_commit, eye_identity, eye_verifier;

-- Suppression accounting stays reachable for the identity capability only.
REVOKE ALL ON FUNCTION audit.bump_suppression(text, boolean) FROM eye_commit, PUBLIC;
GRANT EXECUTE ON FUNCTION audit.bump_suppression(text, boolean) TO eye_identity;

-- ============================================================
-- 8. REAL RFC 8785 canonicalization (Gate-2.1 §8, finding 9).
--
-- The previous canon.jcs rejected non-integral numbers and non-ASCII keys and
-- was therefore NOT RFC 8785. This replaces it with a conformant implementation:
--   * numbers rendered per ECMAScript Number::toString (RFC 8785 §3.2.2.3),
--     covering fractional values, exponent forms and negative zero;
--   * object members ordered by UTF-16 CODE UNIT sequence (§3.2.3), which differs
--     from code-point order for supplementary-plane keys;
--   * Unicode keys and multilingual values pass through unescaped;
--   * control characters escaped with the shortest JSON form;
--   * IEEE-754/I-JSON validity: non-finite and out-of-range values are refused.
-- The identical corpus runs against this and the TypeScript implementation.
-- ============================================================

-- UTF-16 code-unit sort key: fixed 4 hex digits per code unit, so lexicographic
-- comparison of the key equals UTF-16 code-unit comparison of the string.
CREATE OR REPLACE FUNCTION canon.utf16_sortkey(s text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(string_agg(
    CASE WHEN cp < 65536 THEN lpad(to_hex(cp), 4, '0')
         ELSE lpad(to_hex(55296 + ((cp - 65536) / 1024)), 4, '0')
           || lpad(to_hex(56320 + ((cp - 65536) % 1024)), 4, '0')
    END, '' ORDER BY ord), '')
  FROM (
    SELECT ascii(ch) AS cp, ord
      FROM unnest(regexp_split_to_array(s, '')) WITH ORDINALITY AS t(ch, ord)
     WHERE ch <> ''
  ) x
$$;
REVOKE ALL ON FUNCTION canon.utf16_sortkey(text) FROM PUBLIC;

-- ECMAScript Number::toString — the serialization RFC 8785 mandates.
CREATE OR REPLACE FUNCTION canon.number_es(p numeric)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  d float8; t text; neg boolean := false;
  mant text; ex int := 0; ipart text; fpart text := '';
  digits text; n int; k int; epos int; dpos int;
BEGIN
  d := p::float8;
  IF d IS NULL OR d = 'NaN'::float8 OR d = 'Infinity'::float8 OR d = '-Infinity'::float8 THEN
    RAISE EXCEPTION 'canon.number_es: value is not a finite IEEE-754 double (I-JSON)' USING ERRCODE = '22023';
  END IF;
  -- Negative zero canonicalizes to "0" (ECMAScript ToString of -0).
  IF d = 0::float8 THEN RETURN '0'; END IF;
  IF d < 0 THEN neg := true; d := -d; END IF;

  -- PostgreSQL float8 output is shortest-round-trip, the same digit sequence
  -- ECMAScript derives; only the FORMATTING rules differ, applied below.
  t := d::text;
  epos := position('e' in t);
  IF epos > 0 THEN
    mant := left(t, epos - 1);
    ex := substr(t, epos + 1)::int;
  ELSE
    mant := t;
  END IF;
  dpos := position('.' in mant);
  IF dpos > 0 THEN
    ipart := left(mant, dpos - 1);
    fpart := substr(mant, dpos + 1);
  ELSE
    ipart := mant;
  END IF;

  digits := ipart || fpart;
  -- n = position of the decimal point relative to the start of `digits`
  n := length(ipart) + ex;
  -- strip leading zeros (each one shifts the point left)
  WHILE length(digits) > 1 AND left(digits, 1) = '0' LOOP
    digits := substr(digits, 2);
    n := n - 1;
  END LOOP;
  -- strip trailing zeros (does not move the point)
  WHILE length(digits) > 1 AND right(digits, 1) = '0' LOOP
    digits := left(digits, length(digits) - 1);
  END LOOP;
  IF digits = '0' THEN RETURN '0'; END IF;
  k := length(digits);

  -- ECMAScript Number::toString formatting cases.
  IF k <= n AND n <= 21 THEN
    t := digits || repeat('0', n - k);
  ELSIF 0 < n AND n <= 21 THEN
    t := left(digits, n) || '.' || substr(digits, n + 1);
  ELSIF -6 < n AND n <= 0 THEN
    t := '0.' || repeat('0', -n) || digits;
  ELSE
    t := CASE WHEN k = 1 THEN digits ELSE left(digits, 1) || '.' || substr(digits, 2) END
      || 'e' || CASE WHEN n - 1 >= 0 THEN '+' ELSE '-' END || abs(n - 1)::text;
  END IF;
  RETURN CASE WHEN neg THEN '-' || t ELSE t END;
END $$;
REVOKE ALL ON FUNCTION canon.number_es(numeric) FROM PUBLIC;

-- Conformant canonicalizer.
CREATE OR REPLACE FUNCTION canon.jcs(v jsonb)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = canon, pg_catalog, pg_temp
AS $$
DECLARE
  t text := jsonb_typeof(v);
  parts text[] := '{}';
  k text;
  e jsonb;
BEGIN
  IF t = 'null' THEN RETURN 'null'; END IF;
  IF t = 'boolean' THEN RETURN CASE WHEN v = 'true'::jsonb THEN 'true' ELSE 'false' END; END IF;
  IF t = 'number' THEN RETURN canon.number_es((v #>> '{}')::numeric); END IF;
  IF t = 'string' THEN
    -- to_jsonb(text)::text applies exactly the RFC 8785 string rules: escape
    -- only " \ and C0 controls (shortest forms \b \t \n \f \r, else \u00XX);
    -- all other Unicode, including supplementary planes, passes through.
    RETURN to_jsonb(v #>> '{}')::text;
  END IF;
  IF t = 'array' THEN
    FOR e IN SELECT value FROM jsonb_array_elements(v) LOOP
      parts := parts || canon.jcs(e);
    END LOOP;
    RETURN '[' || array_to_string(parts, ',') || ']';
  END IF;
  IF t = 'object' THEN
    -- Ordering by the UTF-16 code-unit sort key (NOT byte or code-point order).
    FOR k IN
      SELECT key FROM jsonb_object_keys(v) AS key
       ORDER BY canon.utf16_sortkey(key) COLLATE "C"
    LOOP
      parts := parts || (to_jsonb(k)::text || ':' || canon.jcs(v -> k));
    END LOOP;
    RETURN '{' || array_to_string(parts, ',') || '}';
  END IF;
  RAISE EXCEPTION 'canon.jcs: unsupported jsonb type %', t USING ERRCODE = '22023';
END $$;
REVOKE ALL ON FUNCTION canon.jcs(jsonb) FROM PUBLIC;

-- ============================================================
-- 8b. Bootstrap one-time credential marking.
--
-- Gate-2.1 §1: the bootstrap flow previously ran a raw UPDATE on
-- identity.credentials from application code — direct identity DML that no role
-- may hold any more. This port performs exactly that one act (mark the seeded
-- credential single-use with a 24h expiry) and requires the BOOTSTRAP
-- capability, so it is unreachable outside the claim-gated bootstrap window.
-- ============================================================
CREATE OR REPLACE FUNCTION identity.bootstrap_mark_one_time(p_principal uuid)
RETURNS void SECURITY DEFINER SET search_path = identity, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_ctx_mode() <> 'bootstrap' THEN
    RAISE EXCEPTION 'bootstrap marking rejected: bootstrap capability required (context is %)',
      coalesce(public.eye_ctx_mode(),'none') USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_capability('bootstrap', 'bootstrap', 'identity.bootstrap.platform_admin');
  UPDATE identity.credentials
     SET status = 'must_rotate', expires_at = clock_timestamp() + interval '24 hours'
   WHERE principal_id = p_principal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bootstrap marking rejected: principal % has no credential', p_principal
      USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.bootstrap_mark_one_time(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.bootstrap_mark_one_time(uuid) TO eye_identity;

-- ============================================================
-- 8c. identity.roles — the last governed table still outside RLS.
--
-- It is the static role CATALOG: reference data, read by the request authorities
-- to resolve a role code. RLS is enabled and forced for uniformity (so no table in
-- a governed schema is outside the mechanism) with an explicit read policy that
-- says what the boundary actually is: readable by the runtime roles, writable by
-- nobody.
-- ============================================================
ALTER TABLE identity.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS readers_read_roles ON identity.roles;
CREATE POLICY readers_read_roles ON identity.roles
  FOR SELECT TO eye_app, eye_commit, eye_identity, eye_verifier USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON identity.roles
  FROM eye_app, eye_commit, eye_identity, eye_publisher, eye_verifier, eye_recovery, PUBLIC;

-- ============================================================
-- 9. Final grant sweep.
--
-- CREATE OR REPLACE FUNCTION preserves privileges granted to an earlier version,
-- so grants made in 0010 survive a redefinition here. They are withdrawn
-- explicitly, and the operational bookkeeping tables are moved fully behind
-- their definer ports as well (record_availability_incident / bump_suppression /
-- reconcile_availability_incident), leaving no direct DML anywhere.
-- ============================================================
REVOKE ALL ON FUNCTION audit.commit_event(text,text,text,text,text,text,text,uuid,text,uuid,uuid,text,text,text,jsonb)
  FROM eye_verifier, eye_publisher, eye_app, eye_recovery, PUBLIC;
-- The VERIFIER never appends (finding F3). Both request-serving authorities do,
-- because POL + AUD + effect must be ONE transaction — and the role/action binding
-- in the minters means the identity authority can only ever carry identity.*
-- capabilities, so its reach through this port is identity requests and nothing
-- else. Without this grant an identity request could not record its own evidence
-- atomically, which is a worse failure than the narrow grant.
GRANT EXECUTE ON FUNCTION audit.commit_event(text,text,text,text,text,text,text,uuid,text,uuid,uuid,text,text,text,jsonb)
  TO eye_commit, eye_identity;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit.availability_incidents, audit.intake_suppression
  FROM eye_app, eye_commit, eye_identity, eye_publisher, eye_verifier, eye_recovery, PUBLIC;
-- Read access stays where a legitimate reader needs it (startup reconciliation).
GRANT SELECT ON audit.availability_incidents TO eye_app, eye_commit, eye_identity, eye_verifier;
GRANT SELECT ON audit.intake_suppression TO eye_identity;

-- Nothing may reach the context secret or the issuance ledger directly.
REVOKE ALL ON ctx.context_secret, ctx.issued
  FROM eye_app, eye_commit, eye_identity, eye_publisher, eye_verifier, eye_recovery, PUBLIC;
