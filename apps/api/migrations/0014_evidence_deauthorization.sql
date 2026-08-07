-- 0014: Gate-2.2 C2 — evidence de-authorization.
--
-- GOVERNED FORWARD MIGRATION. 0001–0013 remain byte-identical. (C3–C7 follow in
-- 0015+ so each committed migration stays immutable.)
--
-- ============================================================
-- C2 — REMOVE EVIDENCE-MODE AUTHORITY.
--
-- Finding: RLS visibility (eye_row_visible and the tenants/domains/principals/
-- role_bindings policies) gated ONLY on scope, never on the CONTEXT MODE. An
-- evidence context — minted to record a denial — therefore carried the same read
-- reach as an authority context: it could SELECT business rows for its scope,
-- turning "record why this was denied" into "read the data it was denied."
--
-- Correction: business-row visibility now requires a READ-CAPABLE mode. Only an
-- authority context (a real, closed, POL/AUD-governed operation) and a verify
-- context (which legitimately reads the audit ledger it is checking) may see
-- business rows. Evidence, identity_op, publish and bootstrap contexts see
-- nothing through RLS — their legitimate writes go through SECURITY DEFINER ports
-- that do not depend on the caller's own row visibility.
-- ============================================================

CREATE OR REPLACE FUNCTION public.eye_read_mode()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx_mode() IN ('authority', 'verify')
$$;
REVOKE ALL ON FUNCTION public.eye_read_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eye_read_mode()
  TO eye_app, eye_commit, eye_identity, eye_verifier, eye_publisher, eye_recovery;

-- Visibility now fails closed outside a read-capable mode.
CREATE OR REPLACE FUNCTION public.eye_row_visible(p_tenant uuid, p_domain uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_read_mode() AND CASE public.eye_scope()
    WHEN 'PLATFORM' THEN true
    WHEN 'TENANT'   THEN p_tenant IS NOT NULL AND p_tenant = public.eye_tenant()
    WHEN 'DOMAIN'   THEN p_tenant IS NOT NULL AND p_tenant = public.eye_tenant()
                         AND p_domain IS NOT NULL AND p_domain = public.eye_domain()
    ELSE false
  END
$$;

-- The four policies that carry their own scope logic (rather than delegating to
-- eye_row_visible) are re-emitted with the same mode gate.
DROP POLICY IF EXISTS tenants_read ON tenancy.tenants;
CREATE POLICY tenants_read ON tenancy.tenants FOR SELECT USING (
  public.eye_read_mode() AND (
    public.eye_scope() = 'PLATFORM'
    OR (public.eye_scope() = 'TENANT' AND id = public.eye_tenant())
  )
);

DROP POLICY IF EXISTS domains_read ON tenancy.domains;
CREATE POLICY domains_read ON tenancy.domains FOR SELECT USING (
  public.eye_read_mode() AND (
    public.eye_scope() = 'PLATFORM'
    OR (public.eye_scope() = 'TENANT' AND tenant_id = public.eye_tenant())
    OR (public.eye_scope() = 'DOMAIN' AND tenant_id = public.eye_tenant() AND id = public.eye_domain())
  )
);

DROP POLICY IF EXISTS principals_read ON identity.principals;
CREATE POLICY principals_read ON identity.principals FOR SELECT USING (
  public.eye_read_mode() AND (
    public.eye_row_visible(tenant_id, domain_id)
    OR (scope = 'PLATFORM' AND public.eye_scope() = 'PLATFORM')
  )
);

DROP POLICY IF EXISTS role_bindings_read ON identity.role_bindings;
CREATE POLICY role_bindings_read ON identity.role_bindings FOR SELECT USING (
  public.eye_read_mode() AND (
    public.eye_row_visible(tenant_id, domain_id)
    OR (scope = 'PLATFORM' AND public.eye_scope() = 'PLATFORM')
  )
);

-- C2 (continued) — evidence scope must be authorized by the subject's LIVE
-- BINDINGS, exactly like an authority context. The prior port skipped the
-- authority check entirely for PLATFORM scope, so any subject could mint
-- PLATFORM-scoped evidence and (before the RLS mode gate above) read platform
-- data. Now a denial can only ever be recorded within the scope the subject
-- could actually have acted in.
CREATE OR REPLACE FUNCTION ctx.issue_evidence(
  p_session uuid, p_context_key text, p_scope text, p_tenant uuid, p_domain uuid,
  p_purpose text, p_action text, p_route_scope text, p_route_tenant uuid,
  p_route_domain uuid, p_correlation uuid, p_ttl_seconds int DEFAULT 60
) RETURNS void
SECURITY DEFINER SET search_path = ctx, identity, public, pg_catalog, pg_temp
AS $$
DECLARE s RECORD; v_epoch bigint; v_ok boolean := false;
BEGIN
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
  IF p_scope IS DISTINCT FROM p_route_scope
     OR p_tenant IS DISTINCT FROM p_route_tenant
     OR p_domain IS DISTINCT FROM p_route_domain THEN
    RAISE EXCEPTION 'evidence context denied: requested scope does not match the attempted route'
      USING ERRCODE = '42501';
  END IF;
  -- Authority-parity scope check: the requested scope must be covered by a LIVE
  -- qualifying binding — the same rule ctx.issue_commit enforces. No branch is
  -- skipped, so PLATFORM evidence requires a real PLATFORM binding.
  IF p_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'evidence context denied: platform scope carries identifiers' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
      WHERE b.principal_id = s.principal_id AND b.scope='PLATFORM' AND b.revoked_at IS NULL) INTO v_ok;
  ELSIF p_scope = 'TENANT' THEN
    IF p_tenant IS NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'evidence context denied: tenant scope identifiers invalid' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
      WHERE b.principal_id = s.principal_id AND b.revoked_at IS NULL
        AND (b.scope='PLATFORM' OR (b.scope='TENANT' AND b.tenant_id=p_tenant))) INTO v_ok;
  ELSE
    IF p_tenant IS NULL OR p_domain IS NULL THEN
      RAISE EXCEPTION 'evidence context denied: domain scope identifiers invalid' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
      WHERE b.principal_id = s.principal_id AND b.revoked_at IS NULL
        AND (b.scope='PLATFORM' OR (b.scope='TENANT' AND b.tenant_id=p_tenant)
             OR (b.scope='DOMAIN' AND b.tenant_id=p_tenant AND b.domain_id=p_domain))) INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'evidence context denied: no qualifying binding for the requested scope'
      USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    p_session, s.principal_id, p_scope, p_tenant, p_domain, s.assurance, p_purpose,
    v_epoch, 'evidence', 'denial', p_action, NULL, p_correlation, NULL, NULL,
    p_ttl_seconds), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_evidence(uuid,text,text,uuid,uuid,text,text,text,uuid,uuid,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_evidence(uuid,text,text,uuid,uuid,text,text,text,uuid,uuid,uuid,int) TO eye_commit;
