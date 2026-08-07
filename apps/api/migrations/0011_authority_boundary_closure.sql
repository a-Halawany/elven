-- 0011: Gate-2.1 part 1 — remove every direct authoritative privilege and
-- replace the universal system context with OPERATION-SPECIFIC capabilities.
-- GOVERNED FORWARD MIGRATION: 0001–0010 are untouched; all applied digests
-- remain valid. No rebaseline.
--
-- Findings closed here:
--   F1  ctx.issue_system(reason) handed unrestricted PLATFORM authority to five
--       roles on the strength of free text.
--   F2  eye_commit/eye_identity kept direct INSERT on audit_events /
--       policy_decisions and direct EXECUTE on the chain-head allocator pair.
--   F3  eye_verifier could execute audit.commit_event (append arbitrary events).
--   F4  eye_publisher held general UPDATE on object_outbox, bypassing CAS.
--
-- Principle applied throughout: a SECURITY DEFINER port does not need the caller
-- to hold the underlying table privilege. Therefore no runtime role holds any
-- authoritative DML at all — every write goes through a narrowly typed,
-- role-specific port whose bound capability is checked inside the boundary.

-- ============================================================
-- 1. Strip ALL direct authoritative DML from every runtime role.
-- ============================================================
-- Evidence tables: definer ports only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit.audit_events
  FROM eye_commit, eye_identity, eye_verifier, eye_publisher, eye_app, eye_recovery, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON policy.policy_decisions
  FROM eye_commit, eye_identity, eye_verifier, eye_publisher, eye_app, eye_recovery, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit.audit_seals, audit.integrity_incidents
  FROM eye_commit, eye_identity, eye_verifier, eye_publisher, eye_app, eye_recovery, PUBLIC;

-- Chain-head allocator: reachable only from inside the audit definer ports,
-- which are owned by roles that already hold what they need.
REVOKE ALL ON FUNCTION audit.advance_chain_head(text)
  FROM eye_commit, eye_identity, eye_verifier, eye_publisher, eye_app, eye_recovery, PUBLIC;
REVOKE ALL ON FUNCTION audit.commit_chain_head(text, bigint, text)
  FROM eye_commit, eye_identity, eye_verifier, eye_publisher, eye_app, eye_recovery, PUBLIC;
REVOKE ALL ON audit.audit_chain_heads
  FROM eye_commit, eye_identity, eye_verifier, eye_publisher, eye_app, PUBLIC;

-- Business tables: the commit role writes ONLY through tenancy/objects ports.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tenancy.tenants, tenancy.domains, tenancy.lifecycle_events
  FROM eye_commit, eye_identity, eye_app, eye_verifier, eye_publisher, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON objects.canonical_objects, objects.object_outbox, objects.schema_registry
  FROM eye_commit, eye_identity, eye_app, eye_verifier, PUBLIC;
REVOKE ALL ON objects.object_outbox FROM eye_publisher;           -- CAS port only (see §5)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON policy.policy_bundles
  FROM eye_commit, eye_identity, eye_app, eye_verifier, eye_publisher, PUBLIC;

-- Identity tables: the identity role writes ONLY through identity ports.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON identity.principals, identity.role_bindings,
  identity.credentials, identity.sessions, identity.refresh_tokens, identity.break_glass_grants
  FROM eye_identity, eye_commit, eye_app, eye_verifier, eye_publisher, PUBLIC;
REVOKE ALL ON identity.credentials, identity.sessions, identity.refresh_tokens,
  identity.break_glass_grants FROM eye_commit, eye_verifier, eye_publisher, eye_recovery;

-- The retired eye_system role keeps nothing anywhere.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_system') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA identity, tenancy, policy, audit, objects, config FROM eye_system';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA identity, tenancy, policy, audit, objects, public, ctx FROM eye_system';
    EXECUTE 'REVOKE ALL ON SCHEMA identity, tenancy, policy, audit, objects, config, ctx FROM eye_system';
  END IF;
END $$;

-- Verifier must not append audit events.
REVOKE ALL ON FUNCTION audit.commit_event(text,text,text,text,text,text,text,uuid,text,uuid,uuid,text,text,text,jsonb)
  FROM eye_verifier, eye_publisher, eye_app, eye_recovery, PUBLIC;

-- Blanket PUBLIC sweep over every authoritative function created so far.
DO $$ DECLARE f record;
BEGIN
  FOR f IN
    SELECT n.nspname AS s, p.proname AS fn,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('identity','tenancy','policy','audit','objects','ctx','canon')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', f.s, f.fn, f.args);
  END LOOP;
END $$;

-- ============================================================
-- 2. ENABLE row level security explicitly wherever it is intended.
--    FORCE alone is inert on a table where RLS was never enabled.
-- ============================================================
DO $$ DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('tenancy','tenants'), ('tenancy','domains'), ('tenancy','lifecycle_events'),
      ('identity','principals'), ('identity','role_bindings'), ('identity','credentials'),
      ('identity','sessions'), ('identity','refresh_tokens'), ('identity','break_glass_grants'),
      ('policy','policy_decisions'), ('policy','policy_bundles'),
      ('audit','audit_events'), ('audit','audit_seals'), ('audit','integrity_incidents'),
      ('audit','audit_chain_heads'), ('audit','availability_incidents'), ('audit','intake_suppression'),
      ('objects','canonical_objects'), ('objects','object_outbox'), ('objects','schema_registry'),
      ('objects','canonical_field_registry'), ('config','runtime_profile'),
      ('identity','bootstrap_claim'), ('ctx','issued'), ('ctx','context_secret')
    ) AS v(s,t)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.s, t.t);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.s, t.t);
  END LOOP;
END $$;

-- Enabling RLS on a table with NO policy is deny-all. That is exactly right for
-- the tables whose only legitimate reader is a SECURITY DEFINER function owned by
-- the migrate superuser (identity.credentials, identity.sessions,
-- ctx.context_secret, …): the superuser bypasses RLS, so the ports keep working
-- while every runtime role loses direct row access even if a stray grant existed.
--
-- It is NOT right for the audit ALLOCATOR tables. audit.advance_chain_head and
-- friends are definer functions owned by eye_audit_allocator, which is neither a
-- superuser nor BYPASSRLS — deny-all would break sequence allocation. And a role
-- holding a legitimate SELECT grant (degraded-journal reload, verifier reports)
-- would silently read ZERO rows, which is worse than an error because a caller
-- cannot tell "no incidents" from "cannot see incidents".
--
-- So each allocator table gets policies that mirror its GRANTS exactly: the
-- allocator may act, and a grantee may read. Row filtering is not the boundary
-- here — the role plus the definer port is — and the policies say so explicitly.
DROP POLICY IF EXISTS allocator_manages_heads ON audit.audit_chain_heads;
CREATE POLICY allocator_manages_heads ON audit.audit_chain_heads
  FOR ALL TO eye_audit_allocator USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS recovery_reads_heads ON audit.audit_chain_heads;
CREATE POLICY recovery_reads_heads ON audit.audit_chain_heads
  FOR SELECT TO eye_recovery USING (true);

DROP POLICY IF EXISTS allocator_manages_seals ON audit.audit_seals;
CREATE POLICY allocator_manages_seals ON audit.audit_seals
  FOR ALL TO eye_audit_allocator USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS verifier_reads_seals ON audit.audit_seals;
CREATE POLICY verifier_reads_seals ON audit.audit_seals
  FOR SELECT TO eye_verifier USING (true);

DROP POLICY IF EXISTS allocator_manages_integrity ON audit.integrity_incidents;
CREATE POLICY allocator_manages_integrity ON audit.integrity_incidents
  FOR ALL TO eye_audit_allocator USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS verifier_reads_integrity ON audit.integrity_incidents;
CREATE POLICY verifier_reads_integrity ON audit.integrity_incidents
  FOR SELECT TO eye_verifier USING (true);

DROP POLICY IF EXISTS allocator_manages_availability ON audit.availability_incidents;
CREATE POLICY allocator_manages_availability ON audit.availability_incidents
  FOR ALL TO eye_audit_allocator USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS readers_read_availability ON audit.availability_incidents;
CREATE POLICY readers_read_availability ON audit.availability_incidents
  FOR SELECT TO eye_app, eye_commit, eye_identity, eye_verifier USING (true);

DROP POLICY IF EXISTS allocator_manages_suppression ON audit.intake_suppression;
-- Global REFERENCE data. objects.schema_registry is the schema catalog every
-- canonical write validates against: it is not tenant-scoped and has no owner, so
-- deny-all would make every write fail with "no registered schema" — a silent
-- outage dressed up as a validation error. Reads are open to the runtime roles
-- that validate against it; writes stay revoked everywhere (§1), so the catalog
-- is readable and immutable rather than invisible and immutable.
DROP POLICY IF EXISTS readers_read_schema_registry ON objects.schema_registry;
CREATE POLICY readers_read_schema_registry ON objects.schema_registry
  FOR SELECT TO eye_app, eye_commit, eye_identity, eye_verifier USING (true);

DROP POLICY IF EXISTS readers_read_field_registry ON objects.canonical_field_registry;
CREATE POLICY readers_read_field_registry ON objects.canonical_field_registry
  FOR SELECT TO eye_app, eye_commit, eye_identity, eye_verifier USING (true);

DROP POLICY IF EXISTS readers_read_policy_bundles ON policy.policy_bundles;
CREATE POLICY readers_read_policy_bundles ON policy.policy_bundles
  FOR SELECT TO eye_app, eye_commit, eye_identity, eye_verifier USING (true);

CREATE POLICY allocator_manages_suppression ON audit.intake_suppression
  FOR ALL TO eye_audit_allocator USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS readers_read_suppression ON audit.intake_suppression;
CREATE POLICY readers_read_suppression ON audit.intake_suppression
  FOR SELECT TO eye_commit, eye_identity USING (true);

-- ============================================================
-- 3. Operation-specific capabilities replace ctx.issue_system.
--
-- A capability context is bound to: operation class, action, target, correlation
-- id, policy-decision id, bundle version, session, principal, scope, purpose and
-- consequence class. A port asserts BOTH the mode and the bound action, so one
-- context can never authorize a different operation inside the same transaction.
--
-- Layout (18 fields):
--   v3|session|principal|scope|tenant|domain|assurance|purpose|iat|exp|nonce|
--   epoch|mode|opclass|action|target|correlation|pid|txid|polid|bundle|sig
-- (mode ∈ authority | evidence | publish | verify | identity_op | bootstrap)
-- ============================================================
ALTER TABLE ctx.issued ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
ALTER TABLE ctx.issued ADD COLUMN IF NOT EXISTS op_class text;
ALTER TABLE ctx.issued ADD COLUMN IF NOT EXISTS bound_action text;

CREATE OR REPLACE FUNCTION ctx.build(
  p_session uuid, p_principal uuid, p_scope text, p_tenant uuid, p_domain uuid,
  p_assurance text, p_purpose text, p_epoch bigint, p_mode text, p_opclass text,
  p_action text, p_target text, p_correlation uuid, p_policy_decision uuid,
  p_bundle text, p_ttl_seconds int
) RETURNS text
SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp
AS $$
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
  IF p_mode NOT IN ('authority','evidence','publish','verify','identity_op','bootstrap') THEN
    RAISE EXCEPTION 'context denied: unknown mode %', p_mode USING ERRCODE = '42501';
  END IF;
  DELETE FROM ctx.issued WHERE expires_at < clock_timestamp() - interval '1 hour';
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
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.build(uuid,uuid,text,uuid,uuid,text,text,bigint,text,text,text,text,uuid,uuid,text,int) FROM PUBLIC;

-- Verified accessor for the v3 layout. Returns a field ONLY when the signature,
-- the WALL-CLOCK expiry, the backend and the issuing transaction all hold.
CREATE OR REPLACE FUNCTION public.eye_ctx3(p_idx int)
RETURNS text
SECURITY DEFINER SET search_path = public, ctx, pg_catalog, pg_temp
AS $$
DECLARE
  raw text := current_setting('eye.ctx3', true);
  parts text[];
  payload text;
BEGIN
  IF raw IS NULL OR raw = '' THEN RETURN NULL; END IF;
  parts := string_to_array(raw, '|');
  IF array_length(parts, 1) <> 22 OR parts[1] <> 'v3' THEN RETURN NULL; END IF;
  payload := array_to_string(parts[1:21], '|');
  IF parts[22] IS DISTINCT FROM ctx.sign_payload(payload) THEN RETURN NULL; END IF;
  IF parts[18] IS DISTINCT FROM pg_backend_pid()::text THEN RETURN NULL; END IF;
  IF parts[19] IS DISTINCT FROM pg_current_xact_id()::text THEN RETURN NULL; END IF;
  -- WALL CLOCK expiry: a one-second context dies one second later even inside a
  -- single long transaction.
  IF parts[10]::timestamptz <= clock_timestamp() THEN RETURN NULL; END IF;
  RETURN NULLIF(parts[p_idx], '');
END $$ LANGUAGE plpgsql STABLE;
REVOKE ALL ON FUNCTION public.eye_ctx3(int) FROM PUBLIC;

-- Field accessors (v3). The v2 accessors are dropped at the end of this file.
CREATE OR REPLACE FUNCTION public.eye_scope() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT COALESCE(public.eye_ctx3(4), 'NONE') $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_tenant() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(5)::uuid $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_domain() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(6)::uuid $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_session() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(2)::uuid $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_principal() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(3)::uuid $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_assurance() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(7) $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_purpose() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(8) $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_ctx_mode() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT COALESCE(public.eye_ctx3(13), 'none') $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_op_class() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT COALESCE(public.eye_ctx3(14), 'none') $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_bound_action() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(15) $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_bound_target() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(16) $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_correlation() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(17)::uuid $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_policy_decision() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(20)::uuid $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_bundle_version() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(21) $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_ctx_nonce() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx3(11)::uuid $$ LANGUAGE sql STABLE;

DO $$ DECLARE f text; r text;
BEGIN
  FOR f IN SELECT unnest(ARRAY[
    'public.eye_scope()','public.eye_tenant()','public.eye_domain()','public.eye_session()',
    'public.eye_principal()','public.eye_assurance()','public.eye_purpose()',
    'public.eye_ctx_mode()','public.eye_op_class()','public.eye_bound_action()',
    'public.eye_bound_target()','public.eye_correlation()','public.eye_policy_decision()',
    'public.eye_bundle_version()','public.eye_ctx_nonce()','public.eye_ctx3(int)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    FOR r IN SELECT unnest(ARRAY['eye_app','eye_commit','eye_identity','eye_publisher','eye_verifier','eye_recovery']) LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, r);
    END LOOP;
  END LOOP;
END $$;

-- ---- Live-authority revalidation, callable at any write boundary ------------
-- Rechecks the CURRENT state, not the state at issuance: active session, session
-- expiry (wall clock), active principal, current revocation epoch, and a current
-- qualifying binding for the context's scope. A context minted in transaction A
-- therefore stops working the moment transaction B revokes the session, removes
-- the binding or rotates the credential.
CREATE OR REPLACE FUNCTION ctx.assert_live_authority()
RETURNS void
SECURITY DEFINER SET search_path = ctx, identity, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_mode text := public.eye_ctx_mode();
  v_session uuid := public.eye_session();
  v_principal uuid := public.eye_principal();
  v_scope text := public.eye_scope();
  v_tenant uuid := public.eye_tenant();
  v_domain uuid := public.eye_domain();
  v_epoch_ctx bigint := NULLIF(public.eye_ctx3(12), '')::bigint;
  s RECORD; v_epoch bigint; v_ok boolean;
BEGIN
  IF v_mode IN ('publish','verify','bootstrap') THEN
    RETURN;  -- machine capabilities carry no session; scope is fixed by the port
  END IF;
  -- identity_op is SESSION-LESS BY CONSTRUCTION: the request that most needs
  -- evidence is the one with no session at all (a failed login, a rejected
  -- envelope, a refused capability). Its authority is the identity role plus the
  -- operation allowlist plus the issuance record — not a session. The bound
  -- subject is EVIDENCE METADATA, and is deliberately not revalidated here: a
  -- deactivated principal's rejection must still be recordable, or deactivating a
  -- principal would silently switch off the evidence about it.
  IF v_mode = 'identity_op' THEN
    RETURN;
  END IF;
  IF v_session IS NULL OR v_principal IS NULL THEN
    RAISE EXCEPTION 'authority revoked: context carries no subject' USING ERRCODE = '42501';
  END IF;
  SELECT id, principal_id, status, expires_at, assurance INTO s
    FROM identity.sessions WHERE id = v_session FOR SHARE;
  IF s.id IS NULL OR s.status <> 'active' OR s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'authority revoked: session is not active' USING ERRCODE = '42501';
  END IF;
  IF s.principal_id IS DISTINCT FROM v_principal THEN
    RAISE EXCEPTION 'authority revoked: session/principal mismatch' USING ERRCODE = '42501';
  END IF;
  -- A bootstrap-assurance session may not ACT, but its refusals must still be
  -- recordable: evidence mode can only ever write denial/failure rows (see
  -- audit.commit_event and policy.commit_decision), so permitting it here cannot
  -- produce a fabricated success — while forbidding it would leave the one case
  -- that most needs evidence with none at all.
  IF s.assurance = 'bootstrap_rotation' AND v_mode NOT IN ('identity_op','evidence') THEN
    RAISE EXCEPTION 'authority revoked: bootstrap assurance cannot act' USING ERRCODE = '42501';
  END IF;
  SELECT revocation_epoch INTO v_epoch FROM identity.principals
   WHERE id = v_principal AND status = 'active' FOR SHARE;
  IF v_epoch IS NULL THEN
    RAISE EXCEPTION 'authority revoked: principal is not active' USING ERRCODE = '42501';
  END IF;
  IF v_epoch_ctx IS DISTINCT FROM v_epoch THEN
    RAISE EXCEPTION 'authority revoked: revocation epoch changed' USING ERRCODE = '42501';
  END IF;
  -- A CURRENT qualifying binding must still exist for the context's scope.
  IF v_scope = 'PLATFORM' THEN
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                    WHERE b.principal_id = v_principal AND b.scope = 'PLATFORM' AND b.revoked_at IS NULL)
      INTO v_ok;
  ELSIF v_scope = 'TENANT' THEN
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                    WHERE b.principal_id = v_principal AND b.revoked_at IS NULL
                      AND (b.scope = 'PLATFORM' OR (b.scope = 'TENANT' AND b.tenant_id = v_tenant)))
      INTO v_ok;
  ELSIF v_scope = 'DOMAIN' THEN
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                    WHERE b.principal_id = v_principal AND b.revoked_at IS NULL
                      AND (b.scope = 'PLATFORM'
                           OR (b.scope = 'TENANT' AND b.tenant_id = v_tenant)
                           OR (b.scope = 'DOMAIN' AND b.tenant_id = v_tenant AND b.domain_id = v_domain)))
      INTO v_ok;
  ELSE
    v_ok := false;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'authority revoked: no current qualifying binding' USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_live_authority() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_live_authority()
  TO eye_commit, eye_identity, eye_verifier, eye_publisher, eye_app;

-- Assert the bound capability matches the operation being attempted.
CREATE OR REPLACE FUNCTION ctx.assert_capability(p_mode text, p_op_class text, p_action text)
RETURNS void
SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_ctx_mode() IS DISTINCT FROM p_mode THEN
    RAISE EXCEPTION 'capability denied: mode % required (context is %)',
      p_mode, public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF p_op_class IS NOT NULL AND public.eye_op_class() IS DISTINCT FROM p_op_class THEN
    RAISE EXCEPTION 'capability denied: operation class % required (context is %)',
      p_op_class, public.eye_op_class() USING ERRCODE = '42501';
  END IF;
  -- The SAME context must not authorize a different action.
  IF p_action IS NOT NULL AND public.eye_bound_action() IS DISTINCT FROM p_action THEN
    RAISE EXCEPTION 'capability denied: context is bound to action %, not %',
      coalesce(public.eye_bound_action(),'<none>'), p_action USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.assert_capability(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.assert_capability(text, text, text)
  TO eye_commit, eye_identity, eye_verifier, eye_publisher, eye_app;

-- ---- The capability minters -------------------------------------------------
-- COMMIT: bound to the authenticated request AND the PDP result.
CREATE OR REPLACE FUNCTION ctx.issue_commit(
  p_session uuid, p_context_key text, p_scope text, p_tenant uuid, p_domain uuid,
  p_purpose text, p_action text, p_target text, p_correlation uuid,
  p_policy_decision uuid, p_bundle text, p_consequence text, p_ttl_seconds int DEFAULT 60
) RETURNS void
SECURITY DEFINER SET search_path = ctx, identity, public, pg_catalog, pg_temp
AS $$
DECLARE s RECORD; v_epoch bigint; v_ok boolean := false;
BEGIN
  -- Gate-2.1 §1: the mintable ACTION SET is bound to the minting ROLE (see the
  -- matching rule in ctx.issue_evidence). identity.* belongs to the identity
  -- authority; everything else belongs to the commit authority.
  IF session_user = 'eye_identity' AND p_action NOT LIKE 'identity.%' THEN
    RAISE EXCEPTION 'context denied: the identity authority cannot mint a capability for action %', p_action
      USING ERRCODE = '42501';
  END IF;
  IF session_user = 'eye_commit' AND p_action LIKE 'identity.%' THEN
    RAISE EXCEPTION 'context denied: the commit authority cannot mint an identity capability (action %)', p_action
      USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'context denied: invalid scope %', p_scope USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_correlation IS NULL OR p_policy_decision IS NULL OR p_bundle IS NULL THEN
    RAISE EXCEPTION 'context denied: commit capability requires action, correlation, policy decision and bundle version'
      USING ERRCODE = '42501';
  END IF;
  IF p_context_key IS NULL OR length(p_context_key) < 20 THEN
    RAISE EXCEPTION 'context denied: proof of possession required' USING ERRCODE = '42501';
  END IF;
  SELECT s2.id, s2.principal_id, s2.assurance, s2.status, s2.expires_at, s2.context_key_hash, s2.bound_epoch
    INTO s FROM identity.sessions s2 WHERE s2.id = p_session;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'context denied: no such session' USING ERRCODE = '42501';
  END IF;
  IF s.context_key_hash IS DISTINCT FROM encode(public.digest(convert_to(p_context_key,'UTF8'),'sha256'),'hex') THEN
    RAISE EXCEPTION 'context denied: invalid session proof' USING ERRCODE = '42501';
  END IF;
  IF s.status <> 'active' OR s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'context denied: session not active' USING ERRCODE = '42501';
  END IF;
  IF s.assurance = 'bootstrap_rotation' THEN
    RAISE EXCEPTION 'context denied: bootstrap assurance must complete forced rotation first' USING ERRCODE = '42501';
  END IF;
  SELECT p.revocation_epoch INTO v_epoch FROM identity.principals p
   WHERE p.id = s.principal_id AND p.status = 'active';
  IF v_epoch IS NULL THEN
    RAISE EXCEPTION 'context denied: principal not active' USING ERRCODE = '42501';
  END IF;
  IF s.bound_epoch IS DISTINCT FROM v_epoch THEN
    RAISE EXCEPTION 'context denied: authority epoch changed (re-authenticate)' USING ERRCODE = '42501';
  END IF;
  IF p_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'context denied: platform scope carries identifiers' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
      WHERE b.principal_id = s.principal_id AND b.scope='PLATFORM' AND b.revoked_at IS NULL) INTO v_ok;
  ELSIF p_scope = 'TENANT' THEN
    IF p_tenant IS NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'context denied: tenant scope identifiers invalid' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
      WHERE b.principal_id = s.principal_id AND b.revoked_at IS NULL
        AND (b.scope='PLATFORM' OR (b.scope='TENANT' AND b.tenant_id=p_tenant))) INTO v_ok;
  ELSE
    IF p_tenant IS NULL OR p_domain IS NULL THEN
      RAISE EXCEPTION 'context denied: domain scope identifiers invalid' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
      WHERE b.principal_id = s.principal_id AND b.revoked_at IS NULL
        AND (b.scope='PLATFORM' OR (b.scope='TENANT' AND b.tenant_id=p_tenant)
             OR (b.scope='DOMAIN' AND b.tenant_id=p_tenant AND b.domain_id=p_domain))) INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'context denied: no qualifying binding for requested scope' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    p_session, s.principal_id, p_scope, p_tenant, p_domain, s.assurance, p_purpose,
    v_epoch, 'authority', coalesce(p_consequence,'C1'), p_action, p_target,
    p_correlation, p_policy_decision, p_bundle, p_ttl_seconds), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_commit(uuid,text,text,uuid,uuid,text,text,text,uuid,uuid,text,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_commit(uuid,text,text,uuid,uuid,text,text,text,uuid,uuid,text,text,int)
  TO eye_commit, eye_identity;

-- PUBLISH: may publish only. No session, no scope authority, no business writes.
CREATE OR REPLACE FUNCTION ctx.issue_publish(p_event_id uuid)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM set_config('eye.ctx3', ctx.build(
    NULL, NULL, 'NONE', NULL, NULL, 'machine', 'outbox.publication', 0,
    'publish', 'outbox', 'objects.outbox.publish', coalesce(p_event_id::text,'*'),
    NULL, NULL, NULL, 60), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_publish(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_publish(uuid) TO eye_publisher;

-- VERIFY: may verify/seal only.
CREATE OR REPLACE FUNCTION ctx.issue_verify(p_partition text, p_seal boolean DEFAULT false)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_partition IS NULL OR length(p_partition) < 3 THEN
    RAISE EXCEPTION 'verify capability requires a partition' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    NULL, NULL, 'PLATFORM', NULL, NULL, 'machine', 'audit.integrity', 0,
    'verify', CASE WHEN p_seal THEN 'seal' ELSE 'verify' END,
    CASE WHEN p_seal THEN 'audit.seal' ELSE 'audit.verify' END,
    p_partition, NULL, NULL, NULL, 120), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_verify(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_verify(text, boolean) TO eye_verifier;

-- IDENTITY_OP: one declared identity operation, nothing else.
CREATE OR REPLACE FUNCTION ctx.issue_identity_op(
  p_operation text, p_subject uuid, p_correlation uuid, p_ttl_seconds int DEFAULT 60
) RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_operation NOT IN ('identity.authenticate','identity.session.create',
                         'identity.session.refresh','identity.credential.rotate',
                         'identity.credential.revoke','identity.principal.create',
                         'identity.security.intake') THEN
    RAISE EXCEPTION 'identity capability denied: unknown operation %', p_operation USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    NULL, NULL, 'PLATFORM', NULL, NULL, 'machine', 'authentication', 0,
    'identity_op', 'identity', p_operation, coalesce(p_subject::text,''),
    p_correlation, NULL, NULL, p_ttl_seconds), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_identity_op(text, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_identity_op(text, uuid, uuid, int) TO eye_identity;

-- BOOTSTRAP: single-use, claim-gated, nothing else.
CREATE OR REPLACE FUNCTION ctx.issue_bootstrap(p_correlation uuid)
RETURNS void SECURITY DEFINER SET search_path = ctx, identity, config, public, pg_catalog, pg_temp AS $$
DECLARE v_profile text;
BEGIN
  SELECT profile INTO v_profile FROM config.runtime_profile WHERE id = 1;
  IF v_profile NOT IN ('local','test') THEN
    RAISE EXCEPTION 'bootstrap capability refused: runtime profile %', v_profile USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    NULL, NULL, 'PLATFORM', NULL, NULL, 'machine', 'platform.bootstrap', 0,
    'bootstrap', 'bootstrap', 'identity.bootstrap.platform_admin', '',
    p_correlation, NULL, NULL, 120), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_bootstrap(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_bootstrap(uuid) TO eye_identity;

-- ============================================================
-- 4. The universal system context and the v2 layout are REMOVED.
-- ============================================================
DROP FUNCTION IF EXISTS ctx.issue_system(text, int);
DROP FUNCTION IF EXISTS ctx.issue(uuid, text, text, uuid, uuid, text, int);
DROP FUNCTION IF EXISTS public.eye_ctx_field(int);

-- ============================================================
-- 5. Outbox: claim/lease + CAS acknowledgement are the ONLY transitions.
-- ============================================================
ALTER TABLE objects.object_outbox
  ADD COLUMN IF NOT EXISTS lease_id uuid,
  ADD COLUMN IF NOT EXISTS leased_until timestamptz,
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION objects.outbox_lease(p_limit int, p_lease_seconds int DEFAULT 60)
RETURNS TABLE (id uuid, lease_id uuid, event_type text, payload jsonb,
               correlation_id uuid, causation_id uuid, tenant_id uuid, domain_id uuid)
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
DECLARE v_lease uuid := gen_random_uuid();
BEGIN
  PERFORM ctx.assert_capability('publish', 'outbox', 'objects.outbox.publish');
  RETURN QUERY
  WITH claimed AS (
    SELECT o.id FROM objects.object_outbox o
     WHERE o.status = 'pending'
       AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp())
     ORDER BY o.created_at
     LIMIT least(greatest(coalesce(p_limit, 50), 1), 500)
     FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE objects.object_outbox o
       SET lease_id = v_lease,
           leased_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
           attempts = o.attempts + 1
      FROM claimed c WHERE o.id = c.id
      RETURNING o.id, o.lease_id, o.event_type, o.payload, o.correlation_id,
                o.causation_id, o.tenant_id, o.domain_id
  )
  SELECT * FROM leased;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_lease(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_lease(int, int) TO eye_publisher;

-- CAS acknowledgement tied to the LEASE: without the matching lease id and the
-- expected current status, nothing moves. published_at is set by the database.
CREATE OR REPLACE FUNCTION objects.outbox_ack_leased(
  p_id uuid, p_lease_id uuid, p_from text, p_to text
) RETURNS boolean
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
DECLARE v_n int;
BEGIN
  PERFORM ctx.assert_capability('publish', 'outbox', 'objects.outbox.publish');
  IF p_from <> 'pending' OR p_to NOT IN ('published','failed') THEN
    RAISE EXCEPTION 'outbox ack rejected: transition %->% is not permitted', p_from, p_to
      USING ERRCODE = '42501';
  END IF;
  UPDATE objects.object_outbox
     SET status = p_to,
         published_at = CASE WHEN p_to = 'published' THEN clock_timestamp() ELSE published_at END,
         lease_id = NULL, leased_until = NULL
   WHERE id = p_id AND status = p_from AND lease_id = p_lease_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.outbox_ack_leased(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.outbox_ack_leased(uuid, uuid, text, text) TO eye_publisher;

-- The old unleased ack and claim are withdrawn.
DROP FUNCTION IF EXISTS objects.outbox_ack(uuid, text, text);
DROP FUNCTION IF EXISTS objects.outbox_claim(int);

-- Enqueue may never create a pre-published row, and only under commit authority.
CREATE OR REPLACE FUNCTION objects.enqueue_event(
  p_id uuid, p_event_type text, p_payload jsonb, p_correlation uuid, p_causation uuid
) RETURNS void
SECURITY DEFINER SET search_path = objects, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_tenant uuid := public.eye_tenant();
  v_domain uuid := public.eye_domain();
BEGIN
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'outbox rejected: authority mode required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
  IF NOT public.eye_row_writable(v_scope, v_tenant, v_domain) THEN
    RAISE EXCEPTION 'outbox rejected: context not authorized' USING ERRCODE = '42501';
  END IF;
  -- status/published_at/lease are database-controlled, never caller-supplied.
  INSERT INTO objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload,
                                     correlation_id, causation_id, status, published_at)
  VALUES (p_id, v_scope, v_tenant, v_domain, p_event_type, p_payload,
          p_correlation, p_causation, 'pending', NULL);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.enqueue_event(uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.enqueue_event(uuid, text, jsonb, uuid, uuid) TO eye_commit;

-- Immutability now also covers status/published_at forgery outside the ports:
-- any UPDATE arriving without the publish capability is refused outright.
CREATE OR REPLACE FUNCTION objects.enforce_outbox_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = objects, public, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.causation_id IS DISTINCT FROM OLD.causation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'outbox event identity and content are immutable after insertion'
      USING ERRCODE = '42501';
  END IF;
  IF public.eye_op_class() IS DISTINCT FROM 'outbox' THEN
    RAISE EXCEPTION 'outbox status changes require the publish capability' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
