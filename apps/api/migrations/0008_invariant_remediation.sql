-- 0008: Phase 0 invariant remediation (R1, R2, R4, R5, R6 of
-- PHASE0_INVARIANT_REMEDIATION_PLAN.md). Non-waivable isolation and privilege
-- corrections. Applies cleanly only on a database whose roles were created by
-- the placeholder-substituting migration runner (0001 rebased pre-production).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- R1a. Signed request context: eye_app cannot self-elevate via GUCs.
-- ============================================================
CREATE SCHEMA IF NOT EXISTS ctx;

CREATE TABLE ctx.context_secret (
  id     int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  secret bytea NOT NULL
);
INSERT INTO ctx.context_secret (secret) VALUES (gen_random_bytes(32));
REVOKE ALL ON SCHEMA ctx FROM PUBLIC;
REVOKE ALL ON ctx.context_secret FROM PUBLIC;

CREATE OR REPLACE FUNCTION ctx.sign(p_scope text, p_tenant text, p_domain text)
RETURNS text SECURITY DEFINER SET search_path = ctx, pg_temp AS $$
  SELECT encode(public.hmac(
    convert_to(p_scope || '|' || coalesce(p_tenant,'') || '|' || coalesce(p_domain,''), 'UTF8'),
    (SELECT secret FROM context_secret), 'sha256'), 'hex')
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION ctx.sign(text, text, text) FROM PUBLIC;
-- NOTE: no role receives EXECUTE on ctx.sign — only other SECURITY DEFINER
-- functions owned by the migration role may call it.

-- Context accessors: valid only when the signature verifies. A forged
-- set_config('eye.ctx', ...) yields scope NONE => RLS sees nothing (fail closed).
CREATE OR REPLACE FUNCTION public.eye_ctx_part(p_idx int) RETURNS text
SECURITY DEFINER SET search_path = public, ctx, pg_temp AS $$
DECLARE
  raw text := current_setting('eye.ctx', true);
  parts text[];
BEGIN
  IF raw IS NULL OR raw = '' THEN RETURN NULL; END IF;
  parts := string_to_array(raw, '|');
  IF array_length(parts, 1) <> 4 THEN RETURN NULL; END IF;
  IF parts[4] IS DISTINCT FROM ctx.sign(parts[1], NULLIF(parts[2],''), NULLIF(parts[3],'')) THEN
    RETURN NULL;  -- invalid signature: no context
  END IF;
  RETURN NULLIF(parts[p_idx], '');
END $$ LANGUAGE plpgsql STABLE;
REVOKE ALL ON FUNCTION public.eye_ctx_part(int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.eye_scope() RETURNS text
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(public.eye_ctx_part(1), 'NONE')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.eye_tenant() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.eye_ctx_part(2)::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.eye_domain() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.eye_ctx_part(3)::uuid
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION public.eye_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eye_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eye_domain() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eye_scope(), public.eye_tenant(), public.eye_domain() TO eye_app;

-- Bounded context establishment: derives authority from the ACTIVE SESSION,
-- the principal's bindings, and the requested (trusted-routing) target.
CREATE OR REPLACE FUNCTION public.eye_set_context(
  p_session uuid, p_scope text, p_tenant uuid, p_domain uuid
) RETURNS void
SECURITY DEFINER SET search_path = public, identity, ctx, pg_temp AS $$
DECLARE
  v_principal uuid;
  v_ok boolean := false;
BEGIN
  IF p_scope NOT IN ('PLATFORM', 'TENANT', 'DOMAIN') THEN
    RAISE EXCEPTION 'invalid scope %', p_scope;
  END IF;
  SELECT s.principal_id INTO v_principal
    FROM identity.sessions s
    JOIN identity.principals p ON p.id = s.principal_id AND p.status = 'active'
    WHERE s.id = p_session AND s.status = 'active' AND s.expires_at > now();
  IF v_principal IS NULL THEN
    RAISE EXCEPTION 'context denied: no active session';
  END IF;

  IF p_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'context denied: platform scope carries identifiers';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                   WHERE b.principal_id = v_principal AND b.scope = 'PLATFORM' AND b.revoked_at IS NULL)
      INTO v_ok;
  ELSIF p_scope = 'TENANT' THEN
    IF p_tenant IS NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'context denied: tenant scope identifiers invalid';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                   WHERE b.principal_id = v_principal AND b.revoked_at IS NULL
                     AND (b.scope = 'PLATFORM' OR (b.scope = 'TENANT' AND b.tenant_id = p_tenant)))
      INTO v_ok;
  ELSE
    IF p_tenant IS NULL OR p_domain IS NULL THEN
      RAISE EXCEPTION 'context denied: domain scope identifiers invalid';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                   WHERE b.principal_id = v_principal AND b.revoked_at IS NULL
                     AND (b.scope = 'PLATFORM'
                          OR (b.scope = 'TENANT' AND b.tenant_id = p_tenant)
                          OR (b.scope = 'DOMAIN' AND b.tenant_id = p_tenant AND b.domain_id = p_domain)))
      INTO v_ok;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'context denied: no qualifying binding for requested scope';
  END IF;
  PERFORM set_config('eye.ctx',
    p_scope || '|' || coalesce(p_tenant::text,'') || '|' || coalesce(p_domain::text,'') || '|' ||
    ctx.sign(p_scope, p_tenant::text, p_domain::text), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION public.eye_set_context(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eye_set_context(uuid, text, uuid, uuid) TO eye_app;

-- System context: bootstrap / outbox publisher / verifier / governed recovery.
-- EXECUTE is granted to the dedicated eye_system role ONLY — never eye_app.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_system') THEN
    CREATE ROLE eye_system LOGIN PASSWORD '__EYE_DB_SYSTEM_PASSWORD__';
  END IF;
END $$;
GRANT USAGE ON SCHEMA identity, tenancy, policy, audit, objects, config TO eye_system;
GRANT EXECUTE ON FUNCTION public.eye_scope(), public.eye_tenant(), public.eye_domain() TO eye_system;

CREATE OR REPLACE FUNCTION public.eye_set_system_context(p_reason text)
RETURNS void SECURITY DEFINER SET search_path = public, ctx, pg_temp AS $$
BEGIN
  IF p_reason IS NULL OR length(p_reason) < 3 THEN
    RAISE EXCEPTION 'system context requires a reason';
  END IF;
  PERFORM set_config('eye.ctx', 'PLATFORM|||' || ctx.sign('PLATFORM', NULL, NULL), true);
  PERFORM set_config('eye.ctx_reason', p_reason, true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION public.eye_set_system_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eye_set_system_context(text) TO eye_system;

-- ============================================================
-- R1b. DOMAIN-aware RLS + FORCE on every scoped table.
-- DOMAIN ctx sees ONLY its (tenant, domain) rows plus tenant-level rows
-- (domain_id IS NULL) of its own tenant. Domain A never sees domain B.
-- ============================================================
CREATE OR REPLACE FUNCTION public.eye_row_visible(p_tenant uuid, p_domain uuid)
RETURNS boolean SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE public.eye_scope()
    WHEN 'PLATFORM' THEN true
    WHEN 'TENANT'   THEN p_tenant = public.eye_tenant()
    WHEN 'DOMAIN'   THEN p_tenant = public.eye_tenant()
                         AND (p_domain IS NULL OR p_domain = public.eye_domain())
    ELSE false
  END
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION public.eye_row_visible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eye_row_visible(uuid, uuid) TO eye_app, eye_system;

-- tenancy
DROP POLICY IF EXISTS tenants_isolation ON tenancy.tenants;
CREATE POLICY tenants_isolation ON tenancy.tenants
  USING (public.eye_scope() = 'PLATFORM' OR id = public.eye_tenant());
DROP POLICY IF EXISTS domains_isolation ON tenancy.domains;
CREATE POLICY domains_isolation ON tenancy.domains
  USING (public.eye_row_visible(tenant_id, id));
DROP POLICY IF EXISTS lifecycle_isolation ON tenancy.lifecycle_events;
CREATE POLICY lifecycle_isolation ON tenancy.lifecycle_events
  USING (public.eye_row_visible(tenant_id, domain_id));
DROP POLICY IF EXISTS lifecycle_write ON tenancy.lifecycle_events;
CREATE POLICY lifecycle_write ON tenancy.lifecycle_events FOR INSERT
  WITH CHECK (public.eye_row_visible(tenant_id, domain_id));
ALTER TABLE tenancy.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.domains FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.lifecycle_events FORCE ROW LEVEL SECURITY;

-- identity (principals / role_bindings)
DROP POLICY IF EXISTS principals_isolation ON identity.principals;
CREATE POLICY principals_isolation ON identity.principals
  USING (public.eye_row_visible(tenant_id, domain_id)
         OR (scope = 'PLATFORM' AND public.eye_scope() = 'PLATFORM'));
DROP POLICY IF EXISTS principals_write ON identity.principals;
CREATE POLICY principals_write ON identity.principals FOR INSERT
  WITH CHECK (public.eye_scope() = 'PLATFORM' OR public.eye_row_visible(tenant_id, domain_id));
DROP POLICY IF EXISTS principals_update ON identity.principals;
CREATE POLICY principals_update ON identity.principals FOR UPDATE
  USING (public.eye_scope() = 'PLATFORM' OR public.eye_row_visible(tenant_id, domain_id));
DROP POLICY IF EXISTS role_bindings_isolation ON identity.role_bindings;
CREATE POLICY role_bindings_isolation ON identity.role_bindings
  USING (public.eye_scope() = 'PLATFORM' OR public.eye_row_visible(tenant_id, domain_id));
DROP POLICY IF EXISTS role_bindings_write ON identity.role_bindings;
CREATE POLICY role_bindings_write ON identity.role_bindings FOR INSERT
  WITH CHECK (public.eye_scope() = 'PLATFORM' OR public.eye_row_visible(tenant_id, domain_id));
DROP POLICY IF EXISTS role_bindings_update ON identity.role_bindings;
CREATE POLICY role_bindings_update ON identity.role_bindings FOR UPDATE
  USING (public.eye_scope() = 'PLATFORM' OR public.eye_row_visible(tenant_id, domain_id));
ALTER TABLE identity.principals FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.role_bindings FORCE ROW LEVEL SECURITY;

-- policy decisions
DROP POLICY IF EXISTS policy_decisions_isolation ON policy.policy_decisions;
CREATE POLICY policy_decisions_isolation ON policy.policy_decisions
  USING (public.eye_row_visible(tenant_id, domain_id));
ALTER TABLE policy.policy_decisions FORCE ROW LEVEL SECURITY;

-- audit events
DROP POLICY IF EXISTS audit_events_isolation ON audit.audit_events;
CREATE POLICY audit_events_isolation ON audit.audit_events
  USING (public.eye_row_visible(tenant_id, domain_id));

-- canonical objects + outbox
DROP POLICY IF EXISTS canonical_isolation ON objects.canonical_objects;
CREATE POLICY canonical_isolation ON objects.canonical_objects
  USING (public.eye_row_visible(tenant_id, domain_id));
DROP POLICY IF EXISTS canonical_write ON objects.canonical_objects;
CREATE POLICY canonical_write ON objects.canonical_objects FOR INSERT
  WITH CHECK (
    (public.eye_scope() = 'PLATFORM' AND scope = 'PLATFORM' AND tenant_id IS NULL) OR
    public.eye_row_visible(tenant_id, domain_id)
  );
ALTER TABLE objects.canonical_objects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_isolation ON objects.object_outbox;
CREATE POLICY outbox_isolation ON objects.object_outbox
  USING (public.eye_row_visible(tenant_id, domain_id));
DROP POLICY IF EXISTS outbox_write ON objects.object_outbox;
CREATE POLICY outbox_write ON objects.object_outbox FOR INSERT
  WITH CHECK (public.eye_row_visible(tenant_id, domain_id));
DROP POLICY IF EXISTS outbox_update ON objects.object_outbox;
CREATE POLICY outbox_update ON objects.object_outbox FOR UPDATE
  USING (public.eye_row_visible(tenant_id, domain_id));
ALTER TABLE objects.object_outbox FORCE ROW LEVEL SECURITY;
-- Outbox scope/identifier consistency (R1d):
ALTER TABLE objects.object_outbox ADD CONSTRAINT outbox_scope_ids CHECK (
  (scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR
  (scope = 'TENANT'   AND tenant_id IS NOT NULL AND domain_id IS NULL) OR
  (scope = 'DOMAIN'   AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)
);

-- eye_system table grants (RLS still governs; system ctx = PLATFORM):
GRANT SELECT ON tenancy.tenants, tenancy.domains, tenancy.lifecycle_events,
  identity.principals, identity.role_bindings, identity.roles,
  policy.policy_decisions, audit.audit_events, audit.audit_seals,
  audit.integrity_incidents, audit.audit_chain_heads,
  objects.canonical_objects, objects.schema_registry TO eye_system;
GRANT SELECT, UPDATE ON objects.object_outbox TO eye_system;
GRANT INSERT ON identity.principals, identity.role_bindings TO eye_system;  -- bootstrap
GRANT SELECT, INSERT ON tenancy.lifecycle_events TO eye_system;
GRANT EXECUTE ON FUNCTION audit.advance_chain_head(text) TO eye_system;

-- ============================================================
-- R2a. Privilege boundary: revoke PUBLIC from every SECURITY DEFINER function;
-- remove direct evidence-table and secret-table access from eye_app.
-- ============================================================
REVOKE ALL ON FUNCTION identity.auth_lookup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.auth_principal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.auth_bindings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.advance_chain_head(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.commit_chain_head(text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.freeze_partition(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.rebuild_chain_heads() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raise_append_only() FROM PUBLIC;

-- eye_app loses: freeze/rebuild, direct evidence inserts, secret tables.
REVOKE EXECUTE ON FUNCTION audit.freeze_partition(text) FROM eye_app;
REVOKE EXECUTE ON FUNCTION audit.rebuild_chain_heads() FROM eye_app;
REVOKE EXECUTE ON FUNCTION audit.commit_chain_head(text, bigint, text) FROM eye_app;
REVOKE INSERT ON audit.audit_events FROM eye_app;
REVOKE INSERT ON audit.audit_seals FROM eye_app;
REVOKE INSERT ON audit.integrity_incidents FROM eye_app;
REVOKE INSERT ON policy.policy_decisions FROM eye_app;
REVOKE ALL ON identity.credentials FROM eye_app;
REVOKE ALL ON identity.sessions FROM eye_app;
REVOKE ALL ON identity.break_glass_grants FROM eye_app;
-- Allocator role: exactly heads ownership; nothing else.
REVOKE ALL ON audit.audit_events FROM eye_audit_allocator;

-- Chain-head rebuild is a GOVERNED RECOVERY operation (migrate/recovery role
-- only). Re-owned away from the allocator; the old raw-GUC context is gone —
-- the migrate role reads the ledger as table owner (bounded recovery path).
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
-- Re-own to the migrate/recovery role (was eye_audit_allocator, which no longer
-- holds any audit_events privilege): the definer must be able to read the
-- immutable ledger to rebuild the heads.
ALTER FUNCTION audit.rebuild_chain_heads() OWNER TO eye;
REVOKE ALL ON FUNCTION audit.rebuild_chain_heads() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit.rebuild_chain_heads() FROM eye_audit_allocator;

-- ============================================================
-- R2b. Bounded authoritative append ports (scope-consistent by construction).
-- ============================================================
CREATE OR REPLACE FUNCTION audit.append_event(
  p_partition text, p_seq bigint, p_event jsonb, p_prev text, p_hash text
) RETURNS void
SECURITY DEFINER SET search_path = audit, public, pg_temp AS $$
DECLARE
  v_scope text := p_event->>'scope';
  v_tenant uuid := NULLIF(p_event->>'tenant_id','')::uuid;
  v_domain uuid := NULLIF(p_event->>'domain_id','')::uuid;
  v_expected_partition text;
BEGIN
  -- Partition must be derived from the event's own scope/tenant.
  v_expected_partition := CASE WHEN v_scope = 'PLATFORM' THEN 'platform'
                               ELSE 'tenant:' || v_tenant::text END;
  IF p_partition IS DISTINCT FROM v_expected_partition THEN
    RAISE EXCEPTION 'audit append rejected: partition/event scope mismatch';
  END IF;
  -- The caller's signed context must be allowed to write this evidence.
  IF NOT (
    (public.eye_scope() = 'PLATFORM') OR
    (public.eye_scope() = 'TENANT' AND v_tenant = public.eye_tenant()) OR
    (public.eye_scope() = 'DOMAIN' AND v_tenant = public.eye_tenant()
       AND (v_domain IS NULL OR v_domain = public.eye_domain()))
  ) THEN
    RAISE EXCEPTION 'audit append rejected: context not authorized for event scope';
  END IF;
  INSERT INTO audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
    VALUES (p_partition, p_seq, p_event::text, p_prev, p_hash);
  PERFORM audit.commit_chain_head(p_partition, p_seq, p_hash);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.append_event(text, bigint, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.append_event(text, bigint, jsonb, text, text) TO eye_app, eye_system;

CREATE OR REPLACE FUNCTION policy.append_decision(p jsonb) RETURNS void
SECURITY DEFINER SET search_path = policy, public, pg_temp AS $$
DECLARE
  v_scope text := p->>'scope';
  v_tenant uuid := NULLIF(p->>'tenant_id','')::uuid;
  v_domain uuid := NULLIF(p->>'domain_id','')::uuid;
BEGIN
  IF NOT (
    (public.eye_scope() = 'PLATFORM' AND v_scope = 'PLATFORM' AND v_tenant IS NULL) OR
    (v_scope IN ('TENANT','DOMAIN') AND public.eye_row_visible(v_tenant, v_domain)
       AND public.eye_scope() = v_scope AND v_tenant = public.eye_tenant()
       AND (v_scope = 'TENANT' OR v_domain = public.eye_domain()))
  ) THEN
    RAISE EXCEPTION 'policy append rejected: context/decision scope mismatch';
  END IF;
  INSERT INTO policy_decisions (
    id, scope, tenant_id, domain_id, decision, obligations, principal_id, delegation_id,
    action, object_type, object_id, purpose_id, consequence_class, environment,
    input_digest, bundle_version, exception_ref, expires_at, revocation_state, reason, correlation_id
  ) VALUES (
    (p->>'id')::uuid, v_scope, v_tenant, v_domain, p->>'decision', coalesce(p->'obligations','[]'::jsonb),
    p->>'principal_id', p->>'delegation_id', p->>'action', p->>'object_type',
    NULLIF(p->>'object_id','')::uuid, p->>'purpose_id', p->>'consequence_class',
    coalesce(p->'environment','{}'::jsonb), p->>'input_digest', p->>'bundle_version',
    p->>'exception_ref', NULLIF(p->>'expires_at','')::timestamptz,
    coalesce(p->>'revocation_state','none'), p->>'reason', (p->>'correlation_id')::uuid
  );
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION policy.append_decision(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION policy.append_decision(jsonb) TO eye_app, eye_system;

-- Tamper handling: freeze ONLY together with a recorded incident (never silent).
CREATE OR REPLACE FUNCTION audit.open_integrity_incident(
  p_id uuid, p_partition text, p_start bigint, p_end bigint, p_details jsonb
) RETURNS void
SECURITY DEFINER SET search_path = audit, pg_temp AS $$
BEGIN
  UPDATE audit_chain_heads SET frozen = true, updated_at = now() WHERE partition_id = p_partition;
  INSERT INTO integrity_incidents (id, partition_id, range_start_seq, range_end_seq, details)
    VALUES (p_id, p_partition, p_start, p_end, p_details);
END $$ LANGUAGE plpgsql;
-- Verifier/governed-recovery separation (R2): the general application role
-- holds NONE of the tamper-handling or sealing ports — verifier runs as
-- eye_system; rebuild stays migrate/recovery-only.
REVOKE ALL ON FUNCTION audit.open_integrity_incident(uuid, text, bigint, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.open_integrity_incident(uuid, text, bigint, bigint, jsonb) TO eye_system;

-- Concurrency-safe sealing: lock the head, verify to exactly that head, seal it.
CREATE OR REPLACE FUNCTION audit.lock_head_for_seal(p_partition text)
RETURNS TABLE (next_seq bigint, head_hash text, frozen boolean)
SECURITY DEFINER SET search_path = audit, pg_temp AS $$
  SELECT h.next_seq, h.head_hash, h.frozen
  FROM audit_chain_heads h WHERE h.partition_id = p_partition FOR UPDATE
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION audit.lock_head_for_seal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.lock_head_for_seal(text) TO eye_system;

CREATE OR REPLACE FUNCTION audit.append_seal(
  p_id uuid, p_partition text, p_start bigint, p_end bigint, p_head text, p_sealer text
) RETURNS void
SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE r RECORD;
BEGIN
  -- Caller must hold the head lock (lock_head_for_seal) in this transaction;
  -- re-check under that lock that we seal exactly the verified head.
  SELECT * INTO r FROM audit_chain_heads WHERE partition_id = p_partition FOR UPDATE;
  IF r.frozen THEN RAISE EXCEPTION 'seal rejected: partition frozen'; END IF;
  IF r.next_seq - 1 <> p_end OR r.head_hash <> p_head THEN
    RAISE EXCEPTION 'seal rejected: head moved since verification';
  END IF;
  IF EXISTS (SELECT 1 FROM integrity_incidents WHERE partition_id = p_partition) THEN
    RAISE EXCEPTION 'seal rejected: open integrity incident';
  END IF;
  INSERT INTO audit_seals (id, partition_id, range_start_seq, range_end_seq, head_hash, sealer)
    VALUES (p_id, p_partition, p_start, p_end, p_head, p_sealer);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION audit.append_seal(uuid, text, bigint, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.append_seal(uuid, text, bigint, bigint, text, text) TO eye_system;

-- ============================================================
-- R6. Identity integrity.
-- ============================================================
-- Unique login identifier (display_name becomes display-only).
ALTER TABLE identity.principals ADD COLUMN login_name text;
UPDATE identity.principals SET login_name = display_name WHERE kind = 'human';
CREATE UNIQUE INDEX principals_login_name_key ON identity.principals (login_name) WHERE login_name IS NOT NULL;

-- Domain-belongs-to-tenant proofs (composite FKs).
ALTER TABLE tenancy.domains ADD CONSTRAINT domains_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE identity.principals
  ADD CONSTRAINT principals_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenancy.tenants(id),
  ADD CONSTRAINT principals_domain_fk FOREIGN KEY (tenant_id, domain_id)
    REFERENCES tenancy.domains(tenant_id, id);
ALTER TABLE identity.role_bindings
  ADD CONSTRAINT role_bindings_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenancy.tenants(id),
  ADD CONSTRAINT role_bindings_domain_fk FOREIGN KEY (tenant_id, domain_id)
    REFERENCES tenancy.domains(tenant_id, id);

-- Role bindings constrained to the role's declared scope.
ALTER TABLE identity.roles ADD CONSTRAINT roles_code_scope_key UNIQUE (code, scope);
ALTER TABLE identity.role_bindings
  ADD CONSTRAINT role_bindings_role_scope_fk FOREIGN KEY (role_code, scope)
    REFERENCES identity.roles(code, scope);

-- Refresh rotation state (R4).
ALTER TABLE identity.sessions ADD COLUMN prev_refresh_token_hash text;

-- auth_lookup by unique login_name (humans only can hold password credentials).
DROP FUNCTION identity.auth_lookup(text);
CREATE FUNCTION identity.auth_lookup(p_login text)
RETURNS TABLE (
  principal_id uuid, kind text, scope text, tenant_id uuid, domain_id uuid,
  status text, credential_id uuid, secret_hash text,
  credential_status text, credential_expires_at timestamptz
) SECURITY DEFINER SET search_path = identity, pg_temp AS $$
  SELECT p.id, p.kind, p.scope, p.tenant_id, p.domain_id, p.status,
         c.id, c.secret_hash, c.status, c.expires_at
  FROM principals p
  JOIN credentials c ON c.principal_id = p.id
    AND c.status IN ('active', 'must_rotate') AND c.type = 'password'
  WHERE p.login_name = p_login AND p.status = 'active' AND p.kind = 'human'
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION identity.auth_lookup(text) FROM PUBLIC;
-- Authentication flows run on the SYSTEM pool (atomic session+audit, R3);
-- eye_app retains lookup for continuous re-verification paths.
GRANT EXECUTE ON FUNCTION identity.auth_lookup(text) TO eye_app, eye_system;
GRANT EXECUTE ON FUNCTION identity.auth_principal(uuid), identity.auth_bindings(uuid) TO eye_app, eye_system;

-- Narrow session/credential ports (direct table access is revoked above).
CREATE OR REPLACE FUNCTION identity.session_create(
  p_id uuid, p_principal uuid, p_assurance text, p_refresh_hash text, p_expires timestamptz
) RETURNS void SECURITY DEFINER SET search_path = identity, pg_temp AS $$
  INSERT INTO sessions (id, principal_id, assurance, status, refresh_token_hash, expires_at)
    VALUES (p_id, p_principal, p_assurance, 'active', p_refresh_hash, p_expires)
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION identity.session_get_active(p_id uuid)
RETURNS TABLE (id uuid, principal_id uuid, assurance text)
SECURITY DEFINER SET search_path = identity, pg_temp AS $$
  SELECT s.id, s.principal_id, s.assurance FROM sessions s
  WHERE s.id = p_id AND s.status = 'active' AND s.expires_at > now()
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION identity.sessions_revoke_all(p_principal uuid)
RETURNS int SECURITY DEFINER SET search_path = identity, pg_temp AS $$
  WITH u AS (
    UPDATE sessions SET status = 'revoked', revoked_at = now()
    WHERE principal_id = p_principal AND status = 'active' RETURNING 1
  ) SELECT count(*)::int FROM u
$$ LANGUAGE sql;

-- Refresh rotation with one-step reuse detection (R4). Outcomes:
--   'rotated'  — old hash matched active token; atomically replaced
--   'reuse'    — old hash matches the PREVIOUS token => theft signal; session revoked
--   'invalid'  — unknown/expired
CREATE OR REPLACE FUNCTION identity.refresh_rotate(p_old_hash text, p_new_hash text)
RETURNS TABLE (outcome text, session_id uuid, principal_id uuid, assurance text)
SECURITY DEFINER SET search_path = identity, pg_temp AS $$
DECLARE r RECORD;
BEGIN
  UPDATE sessions s
    SET prev_refresh_token_hash = s.refresh_token_hash, refresh_token_hash = p_new_hash
    WHERE s.refresh_token_hash = p_old_hash AND s.status = 'active' AND s.expires_at > now()
    RETURNING s.id, s.principal_id, s.assurance INTO r;
  IF FOUND THEN
    RETURN QUERY SELECT 'rotated'::text, r.id, r.principal_id, r.assurance; RETURN;
  END IF;
  SELECT s.id, s.principal_id, s.assurance INTO r FROM sessions s
    WHERE s.prev_refresh_token_hash = p_old_hash AND s.status = 'active';
  IF FOUND THEN
    UPDATE sessions SET status = 'revoked', revoked_at = now() WHERE id = r.id;
    RETURN QUERY SELECT 'reuse'::text, r.id, r.principal_id, r.assurance; RETURN;
  END IF;
  RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION identity.credential_get_active(p_principal uuid)
RETURNS TABLE (id uuid, secret_hash text, status text)
SECURITY DEFINER SET search_path = identity, pg_temp AS $$
  SELECT c.id, c.secret_hash, c.status FROM credentials c
  WHERE c.principal_id = p_principal AND c.status IN ('active','must_rotate') AND c.type = 'password'
$$ LANGUAGE sql STABLE;

-- Rotation port: marks old rotated + installs new + revokes sessions, atomically.
CREATE OR REPLACE FUNCTION identity.credential_rotate(
  p_principal uuid, p_old_id uuid, p_new_id uuid, p_new_hash text
) RETURNS void SECURITY DEFINER SET search_path = identity, pg_temp AS $$
BEGIN
  UPDATE credentials SET status = 'rotated', rotated_at = now()
    WHERE id = p_old_id AND principal_id = p_principal;
  IF NOT FOUND THEN RAISE EXCEPTION 'rotation rejected: credential mismatch'; END IF;
  INSERT INTO credentials (id, principal_id, type, secret_hash, status)
    VALUES (p_new_id, p_principal, 'password', p_new_hash, 'active');
  UPDATE sessions SET status = 'revoked', revoked_at = now()
    WHERE principal_id = p_principal AND status = 'active';
END $$ LANGUAGE plpgsql;

-- Credential issuance: humans only; expiry only for must_rotate bootstrap secrets.
CREATE OR REPLACE FUNCTION identity.credential_issue(
  p_id uuid, p_principal uuid, p_hash text, p_status text, p_expires timestamptz
) RETURNS void SECURITY DEFINER SET search_path = identity, pg_temp AS $$
DECLARE v_kind text;
BEGIN
  SELECT kind INTO v_kind FROM principals WHERE id = p_principal;
  IF v_kind IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'password credentials are restricted to human principals';
  END IF;
  IF p_status NOT IN ('active','must_rotate') THEN
    RAISE EXCEPTION 'invalid credential status %', p_status;
  END IF;
  INSERT INTO credentials (id, principal_id, type, secret_hash, status, expires_at)
    VALUES (p_id, p_principal, 'password', p_hash, p_status, p_expires);
END $$ LANGUAGE plpgsql;

-- Bootstrap credential revocation on unused expiry.
CREATE OR REPLACE FUNCTION identity.credential_revoke(p_id uuid)
RETURNS void SECURITY DEFINER SET search_path = identity, pg_temp AS $$
  UPDATE credentials SET status = 'revoked' WHERE id = p_id
$$ LANGUAGE sql;

DO $$ DECLARE f text;
BEGIN
  FOR f IN SELECT unnest(ARRAY[
    'identity.session_create(uuid,uuid,text,text,timestamptz)',
    'identity.session_get_active(uuid)',
    'identity.sessions_revoke_all(uuid)',
    'identity.refresh_rotate(text,text)',
    'identity.credential_get_active(uuid)',
    'identity.credential_rotate(uuid,uuid,uuid,text)',
    'identity.credential_issue(uuid,uuid,text,text,timestamptz)',
    'identity.credential_revoke(uuid)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO eye_app, eye_system', f);
  END LOOP;
END $$;

-- ============================================================
-- R5. Temporal consistency on canonical objects.
-- ============================================================
ALTER TABLE objects.canonical_objects
  ADD CONSTRAINT valid_interval_order CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from);
