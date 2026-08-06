-- 0009: Gate-2 closure part 1 — real database privilege separation, a bound
-- (non-replayable) authoritative request context, and an exact-match isolation
-- matrix. GOVERNED FORWARD MIGRATION: no earlier migration file is modified;
-- every applied digest from 0001–0008 stays valid.
--
-- Roles (least privilege; each has its own credential):
--   eye_app        — ordinary request/application access: RLS-governed SELECT
--                    only. No authoritative writes, no identity mutation, no
--                    evidence writes, no verifier/recovery, no publish ack.
--   eye_commit     — authoritative commit writer (governed business writes +
--                    bound POL/AUD evidence ports).
--   eye_identity   — identity/credential/session mutation only.
--   eye_publisher  — outbox publication acknowledgement only (compare-and-set).
--   eye_verifier   — audit verification/sealing + tamper evidence.
--   eye_recovery   — break-glass recovery (chain-head rebuild). NOT loaded by
--                    normal runtime code: no application pool uses it.
--   eye_audit_allocator — chain-head allocation (unchanged).
--   eye            — migrate/owner.

-- ============================================================
-- 0. Roles
-- ============================================================
-- Placeholders are substituted TEXTUALLY by the migration runner from the
-- environment (never concatenated at runtime, or substitution would not see
-- them); the runner refuses to run when any required value is unset.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_commit') THEN
    CREATE ROLE eye_commit LOGIN PASSWORD '__EYE_DB_COMMIT_PASSWORD__';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_identity') THEN
    CREATE ROLE eye_identity LOGIN PASSWORD '__EYE_DB_IDENTITY_PASSWORD__';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_publisher') THEN
    CREATE ROLE eye_publisher LOGIN PASSWORD '__EYE_DB_PUBLISHER_PASSWORD__';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_verifier') THEN
    CREATE ROLE eye_verifier LOGIN PASSWORD '__EYE_DB_VERIFIER_PASSWORD__';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_recovery') THEN
    CREATE ROLE eye_recovery LOGIN PASSWORD '__EYE_DB_RECOVERY_PASSWORD__';
  END IF;
END $$;

GRANT USAGE ON SCHEMA identity, tenancy, policy, audit, objects, config, public
  TO eye_commit, eye_identity, eye_publisher, eye_verifier, eye_recovery;
-- Schema USAGE is checked against the CALLING role even for SECURITY DEFINER
-- functions, so every role that establishes context needs ctx USAGE. The
-- context secret and the issuance table remain unreachable: no table privilege
-- is granted, and only the definer ports touch them.
GRANT USAGE ON SCHEMA ctx
  TO eye_app, eye_commit, eye_identity, eye_publisher, eye_verifier, eye_recovery;

-- ============================================================
-- 1. RFC 8785 (JCS) canonicalization INSIDE the trusted boundary.
--    Used to build authoritative evidence bytes and content digests in SQL so
--    the application can never label arbitrary text as canonical.
--    Bounded by design: integral numbers only, ASCII object keys only —
--    anything else is REJECTED rather than risk a divergent encoding.
-- ============================================================
CREATE SCHEMA IF NOT EXISTS canon;
REVOKE ALL ON SCHEMA canon FROM PUBLIC;

CREATE OR REPLACE FUNCTION canon.jcs(v jsonb)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = canon, pg_catalog, pg_temp
AS $$
DECLARE
  t text := jsonb_typeof(v);
  n numeric;
  parts text[] := '{}';
  k text;
  e jsonb;
BEGIN
  IF t = 'null' THEN RETURN 'null'; END IF;
  IF t = 'boolean' THEN RETURN CASE WHEN v = 'true'::jsonb THEN 'true' ELSE 'false' END; END IF;
  IF t = 'number' THEN
    n := (v #>> '{}')::numeric;
    IF n <> trunc(n) THEN
      RAISE EXCEPTION 'canon.jcs: non-integral number % is out of the bounded profile', n;
    END IF;
    RETURN trunc(n)::bigint::text;
  END IF;
  IF t = 'string' THEN
    -- to_jsonb(text)::text uses the same minimal JSON escaping as the
    -- reference implementation (\" \\ \b \f \n \r \t, \u00XX otherwise).
    RETURN to_jsonb(v #>> '{}')::text;
  END IF;
  IF t = 'array' THEN
    FOR e IN SELECT value FROM jsonb_array_elements(v) LOOP
      parts := parts || canon.jcs(e);
    END LOOP;
    RETURN '[' || array_to_string(parts, ',') || ']';
  END IF;
  IF t = 'object' THEN
    -- RFC 8785 sorts by UTF-16 code units; for ASCII keys byte order (C
    -- collation) is identical. Non-ASCII keys are refused.
    FOR k IN SELECT key FROM jsonb_object_keys(v) AS key ORDER BY key COLLATE "C" LOOP
      IF k ~ '[^\x20-\x7e]' THEN
        RAISE EXCEPTION 'canon.jcs: non-ASCII object key is out of the bounded profile';
      END IF;
      parts := parts || (to_jsonb(k)::text || ':' || canon.jcs(v -> k));
    END LOOP;
    RETURN '{' || array_to_string(parts, ',') || '}';
  END IF;
  RAISE EXCEPTION 'canon.jcs: unsupported jsonb type %', t;
END $$;
REVOKE ALL ON FUNCTION canon.jcs(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION canon.sha256_hex(p text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT encode(public.digest(convert_to(p, 'UTF8'), 'sha256'), 'hex')
$$;
REVOKE ALL ON FUNCTION canon.sha256_hex(text) FROM PUBLIC;

-- Domain-separated audit row hash — the SAME structure the contracts package
-- hashes: SHA-256(JCS({version, partition_id, audit_seq, previous_hash, event})).
CREATE OR REPLACE FUNCTION canon.audit_row_hash(
  p_partition text, p_seq bigint, p_prev text, p_event jsonb
) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = canon, pg_catalog, pg_temp AS $$
  SELECT canon.sha256_hex(canon.jcs(jsonb_build_object(
    'version', 'eye-audit-v1',
    'partition_id', p_partition,
    'audit_seq', p_seq,
    'previous_hash', p_prev,
    'event', p_event
  )))
$$;
REVOKE ALL ON FUNCTION canon.audit_row_hash(text, bigint, text, jsonb) FROM PUBLIC;

-- ============================================================
-- 2. Identity state required by the bound context + token family (see 0010).
-- ============================================================
ALTER TABLE identity.principals
  ADD COLUMN IF NOT EXISTS revocation_epoch bigint NOT NULL DEFAULT 1;
ALTER TABLE identity.sessions
  ADD COLUMN IF NOT EXISTS context_key_hash text,
  ADD COLUMN IF NOT EXISTS bound_epoch bigint,
  ADD COLUMN IF NOT EXISTS family_id uuid;

-- ============================================================
-- 3. Bound authoritative request context.
--
-- The previous context was a signature over (scope, tenant, domain) only —
-- effectively a reusable bearer over scope identifiers. It is REPLACED by a
-- context bound to: session, principal, tenant, domain, scope, assurance,
-- purpose, issued-at, expiry, single-use nonce, revocation epoch, and the
-- issuing backend PID.
--
-- Properties:
--  * minted ONLY by ctx.issue(), which re-checks the live session, the
--    principal's bindings, the revocation epoch and the assurance level;
--  * proof-of-possession: the caller must present the session's context key
--    (delivered only inside the verified access token), so holding the app
--    credential alone cannot mint another principal's context;
--  * single-use: the nonce is recorded; a replayed context string is refused;
--  * connection-bound: a context copied to another backend fails the PID check;
--  * short-lived: expiry is enforced on every accessor call;
--  * bootstrap assurance is refused outright — a bootstrap_rotation session can
--    never obtain a governed-action context.
-- ============================================================
CREATE TABLE IF NOT EXISTS ctx.issued (
  nonce      uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  issued_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
REVOKE ALL ON ctx.issued FROM PUBLIC;

CREATE OR REPLACE FUNCTION ctx.sign_payload(p_payload text)
RETURNS text SECURITY DEFINER SET search_path = ctx, pg_catalog, pg_temp AS $$
  SELECT encode(public.hmac(convert_to(p_payload, 'UTF8'),
                            (SELECT secret FROM ctx.context_secret), 'sha256'), 'hex')
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION ctx.sign_payload(text) FROM PUBLIC;

-- Verified accessor core: returns the payload fields ONLY when the signature,
-- the expiry and the backend binding all hold.
CREATE OR REPLACE FUNCTION public.eye_ctx_field(p_idx int)
RETURNS text
SECURITY DEFINER SET search_path = public, ctx, pg_catalog, pg_temp
AS $$
DECLARE
  raw text := current_setting('eye.ctx2', true);
  parts text[];
  payload text;
BEGIN
  IF raw IS NULL OR raw = '' THEN RETURN NULL; END IF;
  parts := string_to_array(raw, '|');
  -- v|session|principal|scope|tenant|domain|assurance|purpose|iat|exp|nonce|epoch|mode|pid|txid|sig
  IF array_length(parts, 1) <> 16 OR parts[1] <> 'v2' THEN RETURN NULL; END IF;
  payload := array_to_string(parts[1:15], '|');
  IF parts[16] IS DISTINCT FROM ctx.sign_payload(payload) THEN RETURN NULL; END IF;
  IF parts[14] IS DISTINCT FROM pg_backend_pid()::text THEN RETURN NULL; END IF;  -- connection-bound
  -- TRANSACTION-bound: a context re-set in a later transaction (even on the same
  -- pooled connection) has a different xid and is refused. This is why a valid
  -- signature alone is never sufficient.
  IF parts[15] IS DISTINCT FROM pg_current_xact_id()::text THEN RETURN NULL; END IF;
  IF parts[10]::timestamptz <= now() THEN RETURN NULL; END IF;                    -- expired
  RETURN NULLIF(parts[p_idx], '');
END $$ LANGUAGE plpgsql STABLE;
REVOKE ALL ON FUNCTION public.eye_ctx_field(int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.eye_scope() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT COALESCE(public.eye_ctx_field(4), 'NONE')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.eye_tenant() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx_field(5)::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.eye_domain() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx_field(6)::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.eye_session() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx_field(2)::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.eye_principal() RETURNS uuid
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx_field(3)::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.eye_assurance() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx_field(7)
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.eye_purpose() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT public.eye_ctx_field(8)
$$ LANGUAGE sql STABLE;

-- Context MODE: 'authority' (a granted capability), 'system' (bounded system
-- path) or 'evidence' (permission to RECORD a decision about this principal,
-- carrying no capability whatsoever — used so a denial can still be audited).
CREATE OR REPLACE FUNCTION public.eye_ctx_mode() RETURNS text
SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT COALESCE(public.eye_ctx_field(13), 'none')
$$ LANGUAGE sql STABLE;

DO $$ DECLARE f text;
BEGIN
  FOR f IN SELECT unnest(ARRAY[
    'public.eye_scope()','public.eye_tenant()','public.eye_domain()',
    'public.eye_session()','public.eye_principal()','public.eye_assurance()','public.eye_purpose()',
    'public.eye_ctx_mode()'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO eye_app, eye_commit, eye_identity, eye_publisher, eye_verifier, eye_recovery', f);
  END LOOP;
END $$;

-- Issuance: the ONLY way to obtain a context. Proof-of-possession + live
-- authority re-check + single-use nonce.
CREATE OR REPLACE FUNCTION ctx.issue(
  p_session uuid, p_context_key text, p_scope text, p_tenant uuid, p_domain uuid,
  p_purpose text, p_ttl_seconds int DEFAULT 60
) RETURNS void
SECURITY DEFINER SET search_path = ctx, identity, public, pg_catalog, pg_temp
AS $$
DECLARE
  s RECORD;
  v_epoch bigint;
  v_ok boolean := false;
  v_nonce uuid := gen_random_uuid();
  v_iat timestamptz := now();
  v_exp timestamptz;
  v_payload text;
BEGIN
  IF p_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'context denied: invalid scope %', p_scope USING ERRCODE = '42501';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 300 THEN
    RAISE EXCEPTION 'context denied: ttl out of bounds' USING ERRCODE = '42501';
  END IF;
  IF p_context_key IS NULL OR length(p_context_key) < 20 THEN
    RAISE EXCEPTION 'context denied: proof of possession required' USING ERRCODE = '42501';
  END IF;
  v_exp := v_iat + make_interval(secs => p_ttl_seconds);

  SELECT s2.id, s2.principal_id, s2.assurance, s2.status, s2.expires_at,
         s2.context_key_hash, s2.bound_epoch
    INTO s
    FROM identity.sessions s2
   WHERE s2.id = p_session;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'context denied: no such session' USING ERRCODE = '42501';
  END IF;
  -- Proof of possession: the context key travels only inside the verified
  -- access token, so the app credential alone cannot mint another principal's
  -- context.
  IF s.context_key_hash IS DISTINCT FROM encode(public.digest(convert_to(p_context_key,'UTF8'),'sha256'),'hex') THEN
    RAISE EXCEPTION 'context denied: invalid session proof' USING ERRCODE = '42501';
  END IF;
  IF s.status <> 'active' OR s.expires_at <= now() THEN
    RAISE EXCEPTION 'context denied: session not active' USING ERRCODE = '42501';
  END IF;
  -- Bootstrap assurance may never obtain a governed-action context.
  IF s.assurance = 'bootstrap_rotation' THEN
    RAISE EXCEPTION 'context denied: bootstrap assurance must complete forced rotation first' USING ERRCODE = '42501';
  END IF;
  SELECT p.revocation_epoch INTO v_epoch
    FROM identity.principals p
   WHERE p.id = s.principal_id AND p.status = 'active';
  IF v_epoch IS NULL THEN
    RAISE EXCEPTION 'context denied: principal not active' USING ERRCODE = '42501';
  END IF;
  -- Credential rotation / binding removal bumps the epoch: stale sessions die.
  IF s.bound_epoch IS DISTINCT FROM v_epoch THEN
    RAISE EXCEPTION 'context denied: authority epoch changed (re-authenticate)' USING ERRCODE = '42501';
  END IF;

  IF p_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'context denied: platform scope carries identifiers' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                    WHERE b.principal_id = s.principal_id AND b.scope = 'PLATFORM' AND b.revoked_at IS NULL)
      INTO v_ok;
  ELSIF p_scope = 'TENANT' THEN
    IF p_tenant IS NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'context denied: tenant scope identifiers invalid' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                    WHERE b.principal_id = s.principal_id AND b.revoked_at IS NULL
                      AND (b.scope = 'PLATFORM' OR (b.scope = 'TENANT' AND b.tenant_id = p_tenant)))
      INTO v_ok;
  ELSE
    IF p_tenant IS NULL OR p_domain IS NULL THEN
      RAISE EXCEPTION 'context denied: domain scope identifiers invalid' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM identity.role_bindings b
                    WHERE b.principal_id = s.principal_id AND b.revoked_at IS NULL
                      AND (b.scope = 'PLATFORM'
                           OR (b.scope = 'TENANT' AND b.tenant_id = p_tenant)
                           OR (b.scope = 'DOMAIN' AND b.tenant_id = p_tenant AND b.domain_id = p_domain)))
      INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'context denied: no qualifying binding for requested scope' USING ERRCODE = '42501';
  END IF;

  -- Single use: a replayed context string cannot be re-issued.
  DELETE FROM ctx.issued WHERE expires_at < now() - interval '1 hour';
  INSERT INTO ctx.issued (nonce, session_id, expires_at) VALUES (v_nonce, p_session, v_exp);

  v_payload := concat_ws('|', 'v2', p_session::text, s.principal_id::text, p_scope,
                         coalesce(p_tenant::text,''), coalesce(p_domain::text,''),
                         s.assurance, coalesce(p_purpose,''),
                         to_char(v_iat, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
                         to_char(v_exp, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
                         v_nonce::text, v_epoch::text, 'authority', pg_backend_pid()::text,
                         pg_current_xact_id()::text);
  PERFORM set_config('eye.ctx2', v_payload || '|' || ctx.sign_payload(v_payload), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue(uuid, text, text, uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue(uuid, text, text, uuid, uuid, text, int)
  TO eye_app, eye_commit, eye_identity;

-- System context for bounded system paths (publisher / verifier / recovery /
-- unauthenticated security intake). Never granted to eye_app.
CREATE OR REPLACE FUNCTION ctx.issue_system(p_reason text, p_ttl_seconds int DEFAULT 60)
RETURNS void SECURITY DEFINER SET search_path = ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_nonce uuid := gen_random_uuid();
  v_iat timestamptz := now();
  v_exp timestamptz;
  v_payload text;
BEGIN
  IF p_reason IS NULL OR length(p_reason) < 3 THEN
    RAISE EXCEPTION 'system context requires a reason' USING ERRCODE = '42501';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 300 THEN
    RAISE EXCEPTION 'system context ttl out of bounds' USING ERRCODE = '42501';
  END IF;
  v_exp := v_iat + make_interval(secs => p_ttl_seconds);
  INSERT INTO ctx.issued (nonce, session_id, expires_at)
    VALUES (v_nonce, '00000000-0000-0000-0000-000000000000', v_exp);
  v_payload := concat_ws('|', 'v2', '00000000-0000-0000-0000-000000000000',
                         '00000000-0000-0000-0000-000000000000', 'PLATFORM', '', '',
                         'system', coalesce(p_reason,''),
                         to_char(v_iat, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
                         to_char(v_exp, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
                         v_nonce::text, '0', 'system', pg_backend_pid()::text,
                         pg_current_xact_id()::text);
  PERFORM set_config('eye.ctx2', v_payload || '|' || ctx.sign_payload(v_payload), true);
  PERFORM set_config('eye.ctx_reason', p_reason, true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_system(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_system(text, int)
  TO eye_identity, eye_publisher, eye_verifier, eye_recovery, eye_commit;

-- Evidence-only context (Gate-2 §6): lets the pipeline record a DENIAL about
-- the authenticated principal even when the denial reason is the principal's own
-- assurance or missing binding. Still requires proof of possession of the live
-- session, so the recorded subject is always the real authenticated principal;
-- carries no capability (eye_row_writable() is false in this mode).
CREATE OR REPLACE FUNCTION ctx.issue_evidence(
  p_session uuid, p_context_key text, p_scope text, p_tenant uuid, p_domain uuid,
  p_purpose text, p_ttl_seconds int DEFAULT 60
) RETURNS void
SECURITY DEFINER SET search_path = ctx, identity, public, pg_catalog, pg_temp
AS $$
DECLARE
  s RECORD;
  v_epoch bigint;
  v_nonce uuid := gen_random_uuid();
  v_iat timestamptz := now();
  v_exp timestamptz;
  v_payload text;
BEGIN
  IF p_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'evidence context denied: invalid scope %', p_scope USING ERRCODE = '42501';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 300 THEN
    RAISE EXCEPTION 'evidence context denied: ttl out of bounds' USING ERRCODE = '42501';
  END IF;
  v_exp := v_iat + make_interval(secs => p_ttl_seconds);

  SELECT s2.id, s2.principal_id, s2.assurance, s2.status, s2.expires_at, s2.context_key_hash
    INTO s FROM identity.sessions s2 WHERE s2.id = p_session;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'evidence context denied: no such session' USING ERRCODE = '42501';
  END IF;
  IF s.context_key_hash IS DISTINCT FROM encode(public.digest(convert_to(p_context_key,'UTF8'),'sha256'),'hex') THEN
    RAISE EXCEPTION 'evidence context denied: invalid session proof' USING ERRCODE = '42501';
  END IF;
  IF s.status <> 'active' OR s.expires_at <= now() THEN
    RAISE EXCEPTION 'evidence context denied: session not active' USING ERRCODE = '42501';
  END IF;
  SELECT p.revocation_epoch INTO v_epoch FROM identity.principals p
   WHERE p.id = s.principal_id AND p.status = 'active';
  IF v_epoch IS NULL THEN
    RAISE EXCEPTION 'evidence context denied: principal not active' USING ERRCODE = '42501';
  END IF;

  DELETE FROM ctx.issued WHERE expires_at < now() - interval '1 hour';
  INSERT INTO ctx.issued (nonce, session_id, expires_at) VALUES (v_nonce, p_session, v_exp);
  v_payload := concat_ws('|', 'v2', p_session::text, s.principal_id::text, p_scope,
                         coalesce(p_tenant::text,''), coalesce(p_domain::text,''),
                         s.assurance, coalesce(p_purpose,''),
                         to_char(v_iat, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
                         to_char(v_exp, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
                         v_nonce::text, v_epoch::text, 'evidence', pg_backend_pid()::text,
                         pg_current_xact_id()::text);
  PERFORM set_config('eye.ctx2', v_payload || '|' || ctx.sign_payload(v_payload), true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctx.issue_evidence(uuid, text, text, uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctx.issue_evidence(uuid, text, text, uuid, uuid, text, int) TO eye_commit;

-- The legacy v1 context minter and its accessor are removed outright: the
-- reusable-bearer mechanism must not remain reachable.
DROP FUNCTION IF EXISTS public.eye_set_context(uuid, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.eye_set_system_context(text);
DROP FUNCTION IF EXISTS public.eye_ctx_part(int);

-- ============================================================
-- 4. Exact-match isolation matrix (no implicit tenant-wide fallback).
--    READ  : PLATFORM → all; TENANT → own tenant; DOMAIN → own (tenant, domain) EXACTLY.
--    WRITE : additionally, DOMAIN may never write a tenant-level (domain_id IS
--            NULL) row, and TENANT may never write another tenant's row.
-- ============================================================
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

CREATE OR REPLACE FUNCTION public.eye_row_writable(p_scope text, p_tenant uuid, p_domain uuid)
RETURNS boolean SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  -- An 'evidence' context carries NO capability: it may only be used to record
  -- a decision about the principal, never to write business state.
  SELECT CASE WHEN public.eye_ctx_mode() NOT IN ('authority','system') THEN false
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

DO $$ DECLARE f text;
BEGIN
  FOR f IN SELECT unnest(ARRAY['public.eye_row_visible(uuid,uuid)','public.eye_row_writable(text,uuid,uuid)']) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO eye_app, eye_commit, eye_identity, eye_publisher, eye_verifier, eye_recovery', f);
  END LOOP;
END $$;

-- Drop EVERY legacy permissive policy on the scoped tables, then rebuild.
DO $$ DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname FROM pg_policies
     WHERE (schemaname, tablename) IN (
       ('tenancy','tenants'), ('tenancy','domains'), ('tenancy','lifecycle_events'),
       ('identity','principals'), ('identity','role_bindings'),
       ('policy','policy_decisions'), ('audit','audit_events'),
       ('objects','canonical_objects'), ('objects','object_outbox'))
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- tenancy.tenants — PLATFORM/TENANT only. A DOMAIN principal reaches tenant
-- identity ONLY through the explicitly authorized read model below.
CREATE POLICY tenants_read ON tenancy.tenants FOR SELECT
  USING (public.eye_scope() = 'PLATFORM'
         OR (public.eye_scope() = 'TENANT' AND id = public.eye_tenant()));
CREATE POLICY tenants_write ON tenancy.tenants FOR INSERT
  WITH CHECK (public.eye_scope() = 'PLATFORM');
CREATE POLICY tenants_update ON tenancy.tenants FOR UPDATE
  USING (public.eye_scope() = 'PLATFORM');

-- tenancy.domains — DOMAIN sees exactly its own domain row.
CREATE POLICY domains_read ON tenancy.domains FOR SELECT
  USING (public.eye_scope() = 'PLATFORM'
         OR (public.eye_scope() = 'TENANT' AND tenant_id = public.eye_tenant())
         OR (public.eye_scope() = 'DOMAIN' AND tenant_id = public.eye_tenant() AND id = public.eye_domain()));
-- Creating a domain is a TENANT-level act: never available to DOMAIN context.
CREATE POLICY domains_write ON tenancy.domains FOR INSERT
  WITH CHECK (public.eye_scope() = 'PLATFORM'
              OR (public.eye_scope() = 'TENANT' AND tenant_id = public.eye_tenant()));
CREATE POLICY domains_update ON tenancy.domains FOR UPDATE
  USING (public.eye_scope() = 'PLATFORM'
         OR (public.eye_scope() = 'TENANT' AND tenant_id = public.eye_tenant()));

CREATE POLICY lifecycle_read ON tenancy.lifecycle_events FOR SELECT
  USING (public.eye_row_visible(tenant_id, domain_id));
CREATE POLICY lifecycle_write ON tenancy.lifecycle_events FOR INSERT
  WITH CHECK (public.eye_row_writable(scope, tenant_id, domain_id));

-- identity.principals / role_bindings — DOMAIN may not create tenant-level
-- principals or TENANT bindings (eye_row_writable enforces the scope label too).
CREATE POLICY principals_read ON identity.principals FOR SELECT
  USING (public.eye_row_visible(tenant_id, domain_id)
         OR (scope = 'PLATFORM' AND public.eye_scope() = 'PLATFORM'));
CREATE POLICY principals_write ON identity.principals FOR INSERT
  WITH CHECK ((public.eye_scope() = 'PLATFORM' AND scope = 'PLATFORM' AND tenant_id IS NULL)
              OR public.eye_row_writable(scope, tenant_id, domain_id));
CREATE POLICY principals_update ON identity.principals FOR UPDATE
  USING ((public.eye_scope() = 'PLATFORM')
         OR public.eye_row_writable(scope, tenant_id, domain_id));

CREATE POLICY role_bindings_read ON identity.role_bindings FOR SELECT
  USING (public.eye_row_visible(tenant_id, domain_id)
         OR (scope = 'PLATFORM' AND public.eye_scope() = 'PLATFORM'));
CREATE POLICY role_bindings_write ON identity.role_bindings FOR INSERT
  WITH CHECK ((public.eye_scope() = 'PLATFORM' AND scope = 'PLATFORM' AND tenant_id IS NULL)
              OR public.eye_row_writable(scope, tenant_id, domain_id));
CREATE POLICY role_bindings_update ON identity.role_bindings FOR UPDATE
  USING ((public.eye_scope() = 'PLATFORM')
         OR public.eye_row_writable(scope, tenant_id, domain_id));

CREATE POLICY policy_decisions_read ON policy.policy_decisions FOR SELECT
  USING (public.eye_row_visible(tenant_id, domain_id));
CREATE POLICY policy_decisions_write ON policy.policy_decisions FOR INSERT
  WITH CHECK (public.eye_row_writable(scope, tenant_id, domain_id));

CREATE POLICY audit_events_read ON audit.audit_events FOR SELECT
  USING (public.eye_row_visible(tenant_id, domain_id));
CREATE POLICY audit_events_write ON audit.audit_events FOR INSERT
  WITH CHECK (public.eye_row_writable(scope, tenant_id, domain_id));

CREATE POLICY canonical_read ON objects.canonical_objects FOR SELECT
  USING (public.eye_row_visible(tenant_id, domain_id));
CREATE POLICY canonical_write ON objects.canonical_objects FOR INSERT
  WITH CHECK ((public.eye_scope() = 'PLATFORM' AND scope = 'PLATFORM' AND tenant_id IS NULL)
              OR public.eye_row_writable(scope, tenant_id, domain_id));

CREATE POLICY outbox_read ON objects.object_outbox FOR SELECT
  USING (public.eye_row_visible(tenant_id, domain_id));
CREATE POLICY outbox_write ON objects.object_outbox FOR INSERT
  WITH CHECK (public.eye_row_writable(scope, tenant_id, domain_id));
CREATE POLICY outbox_update ON objects.object_outbox FOR UPDATE
  USING (public.eye_row_visible(tenant_id, domain_id));

ALTER TABLE tenancy.tenants            FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.domains            FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.lifecycle_events   FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.principals        FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.role_bindings     FORCE ROW LEVEL SECURITY;
ALTER TABLE policy.policy_decisions    FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_events         FORCE ROW LEVEL SECURITY;
ALTER TABLE objects.canonical_objects  FORCE ROW LEVEL SECURITY;
ALTER TABLE objects.object_outbox      FORCE ROW LEVEL SECURITY;

-- Explicitly authorized read model: a DOMAIN principal's own tenant identity
-- (never the general row-visibility predicate, never sibling domains).
CREATE OR REPLACE FUNCTION tenancy.my_tenant()
RETURNS TABLE (id uuid, name text, status text)
SECURITY DEFINER SET search_path = tenancy, public, pg_catalog, pg_temp AS $$
  SELECT t.id, t.name, t.status FROM tenancy.tenants t
   WHERE public.eye_scope() IN ('TENANT','DOMAIN') AND t.id = public.eye_tenant()
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION tenancy.my_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.my_tenant() TO eye_app, eye_commit;

-- Scoped audit-integrity read models replace global visibility (below).
CREATE OR REPLACE FUNCTION audit.my_partition_status(p_partition text)
RETURNS TABLE (partition_id text, next_seq bigint, frozen boolean, has_incident boolean)
SECURITY DEFINER SET search_path = audit, public, pg_catalog, pg_temp AS $$
  SELECT h.partition_id, h.next_seq, h.frozen,
         EXISTS (SELECT 1 FROM audit.integrity_incidents i WHERE i.partition_id = h.partition_id)
    FROM audit.audit_chain_heads h
   WHERE h.partition_id = p_partition
     AND (public.eye_scope() = 'PLATFORM'
          OR (p_partition = 'tenant:' || public.eye_tenant()::text
              AND public.eye_scope() IN ('TENANT','DOMAIN')))
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION audit.my_partition_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.my_partition_status(text) TO eye_app, eye_verifier;

-- ============================================================
-- 5. Role-binding authority constraints — the binding must be compatible with
--    the PRINCIPAL's own scope and with the GRANTOR's authority, not merely
--    carry a matching role-scope label.
-- ============================================================
ALTER TABLE identity.role_bindings
  ADD COLUMN IF NOT EXISTS granted_by_principal uuid,
  ADD COLUMN IF NOT EXISTS granted_by_scope text;

CREATE OR REPLACE FUNCTION identity.enforce_binding_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = identity, public, pg_catalog, pg_temp AS $$
DECLARE p RECORD; g RECORD;
BEGIN
  SELECT scope, tenant_id, domain_id, status INTO p
    FROM identity.principals WHERE id = NEW.principal_id;
  IF p.scope IS NULL THEN
    RAISE EXCEPTION 'binding rejected: unknown principal' USING ERRCODE = '42501';
  END IF;
  -- (a) the binding may never exceed the principal's own scope
  IF p.scope = 'TENANT' AND NEW.scope = 'PLATFORM' THEN
    RAISE EXCEPTION 'binding rejected: tenant principal cannot hold a PLATFORM binding' USING ERRCODE = '42501';
  END IF;
  IF p.scope = 'DOMAIN' AND NEW.scope <> 'DOMAIN' THEN
    RAISE EXCEPTION 'binding rejected: domain principal cannot hold a % binding', NEW.scope USING ERRCODE = '42501';
  END IF;
  IF p.scope IN ('TENANT','DOMAIN') AND NEW.tenant_id IS DISTINCT FROM p.tenant_id THEN
    RAISE EXCEPTION 'binding rejected: binding tenant must match the principal tenant' USING ERRCODE = '42501';
  END IF;
  IF p.scope = 'DOMAIN' AND NEW.domain_id IS DISTINCT FROM p.domain_id THEN
    RAISE EXCEPTION 'binding rejected: binding domain must match the principal domain' USING ERRCODE = '42501';
  END IF;
  -- (b) the grantor's authority must dominate the binding being created
  IF NEW.granted_by_principal IS NOT NULL THEN
    SELECT scope, tenant_id, domain_id INTO g
      FROM identity.principals WHERE id = NEW.granted_by_principal;
    IF g.scope IS NULL THEN
      RAISE EXCEPTION 'binding rejected: unknown grantor' USING ERRCODE = '42501';
    END IF;
    IF g.scope = 'DOMAIN' THEN
      RAISE EXCEPTION 'binding rejected: a DOMAIN principal may not grant role bindings' USING ERRCODE = '42501';
    END IF;
    IF g.scope = 'TENANT' AND (NEW.scope = 'PLATFORM' OR NEW.tenant_id IS DISTINCT FROM g.tenant_id) THEN
      RAISE EXCEPTION 'binding rejected: grantor authority does not dominate the binding' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION identity.enforce_binding_authority() FROM PUBLIC;

DROP TRIGGER IF EXISTS role_bindings_authority ON identity.role_bindings;
CREATE TRIGGER role_bindings_authority
  BEFORE INSERT OR UPDATE ON identity.role_bindings
  FOR EACH ROW EXECUTE FUNCTION identity.enforce_binding_authority();

-- ============================================================
-- 6. Strip the ordinary application role down to RLS-governed reads.
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON tenancy.tenants            FROM eye_app;
REVOKE INSERT, UPDATE, DELETE ON tenancy.domains            FROM eye_app;
REVOKE INSERT, UPDATE, DELETE ON tenancy.lifecycle_events   FROM eye_app;
REVOKE INSERT, UPDATE, DELETE ON identity.principals        FROM eye_app;
REVOKE INSERT, UPDATE, DELETE ON identity.role_bindings     FROM eye_app;
REVOKE INSERT, UPDATE, DELETE ON objects.canonical_objects  FROM eye_app;
REVOKE INSERT, UPDATE, DELETE ON objects.object_outbox      FROM eye_app;
REVOKE INSERT, UPDATE, DELETE ON objects.schema_registry    FROM eye_app;
REVOKE INSERT, UPDATE, DELETE ON policy.policy_bundles      FROM eye_app;
-- Global visibility into audit integrity state is replaced by the scoped read
-- model audit.my_partition_status().
REVOKE ALL ON audit.audit_chain_heads    FROM eye_app;
REVOKE ALL ON audit.audit_seals          FROM eye_app;
REVOKE ALL ON audit.integrity_incidents  FROM eye_app;
-- The former general-purpose evidence ports are withdrawn from every ordinary
-- caller; 0010 installs bound replacements.
REVOKE ALL ON FUNCTION audit.append_event(text, bigint, jsonb, text, text) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION policy.append_decision(jsonb) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION audit.advance_chain_head(text) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION audit.commit_chain_head(text, bigint, text) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION audit.freeze_partition(text) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION audit.lock_head_for_seal(text) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION audit.append_seal(uuid, text, bigint, bigint, text, text) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION audit.open_integrity_incident(uuid, text, bigint, bigint, jsonb) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION identity.session_create(uuid, uuid, text, text, timestamptz) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION identity.sessions_revoke_all(uuid) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION identity.refresh_rotate(text, text) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION identity.credential_issue(uuid, uuid, text, text, timestamptz) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION identity.credential_rotate(uuid, uuid, uuid, text) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION identity.credential_revoke(uuid) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION identity.credential_get_active(uuid) FROM eye_app, eye_system, PUBLIC;
REVOKE ALL ON FUNCTION identity.auth_lookup(text) FROM eye_app, eye_system, PUBLIC;
-- eye_system is fully retired as an authority: 0010 assigns its duties to the
-- dedicated least-privilege roles.
REVOKE ALL ON ALL TABLES IN SCHEMA identity, tenancy, policy, audit, objects FROM eye_system;

-- Ordinary reads (RLS-governed) for the application role.
GRANT SELECT ON tenancy.tenants, tenancy.domains, tenancy.lifecycle_events,
  identity.principals, identity.role_bindings, identity.roles,
  policy.policy_decisions, audit.audit_events,
  objects.canonical_objects, objects.object_outbox, objects.schema_registry,
  policy.policy_bundles TO eye_app;

-- ============================================================
-- 7. Structural local/test eligibility for bootstrap (never a caller-supplied
--    environment label) + database-enforced single-use guard.
-- ============================================================
CREATE TABLE IF NOT EXISTS config.runtime_profile (
  id      int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  profile text NOT NULL CHECK (profile IN ('local','test','production')),
  set_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO config.runtime_profile (id, profile) VALUES (1, 'local')
  ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON config.runtime_profile FROM PUBLIC;
GRANT SELECT ON config.runtime_profile TO eye_app, eye_identity, eye_commit;

CREATE TABLE IF NOT EXISTS identity.bootstrap_claim (
  id           int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  principal_id uuid
);
REVOKE ALL ON identity.bootstrap_claim FROM PUBLIC;

-- Exactly one caller can ever win, even under concurrency: the single-row
-- primary key is the serialization point.
CREATE OR REPLACE FUNCTION identity.claim_bootstrap()
RETURNS boolean SECURITY DEFINER SET search_path = identity, config, pg_catalog, pg_temp AS $$
DECLARE v_profile text; v_won boolean;
BEGIN
  -- Structural eligibility: read from the DATABASE, never a caller-supplied label.
  SELECT profile INTO v_profile FROM config.runtime_profile WHERE id = 1;
  IF v_profile NOT IN ('local','test') THEN
    RAISE EXCEPTION 'bootstrap refused: runtime profile % is not local/test', v_profile USING ERRCODE = '42501';
  END IF;
  -- The single-row primary key IS the concurrency guard: under two simultaneous
  -- attempts exactly one INSERT can succeed, and the loser observes false.
  INSERT INTO identity.bootstrap_claim (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  v_won := FOUND;
  RETURN v_won;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION identity.claim_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.claim_bootstrap() TO eye_identity;

-- Belt-and-braces: a pre-existing platform administrator also blocks bootstrap.
CREATE OR REPLACE FUNCTION identity.platform_admin_exists()
RETURNS boolean SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings
                  WHERE role_code = 'platform_admin' AND revoked_at IS NULL)
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION identity.platform_admin_exists() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.platform_admin_exists() TO eye_identity;

CREATE OR REPLACE FUNCTION identity.record_bootstrap_principal(p_principal uuid)
RETURNS void SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  UPDATE identity.bootstrap_claim SET principal_id = p_principal WHERE id = 1
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION identity.record_bootstrap_principal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.record_bootstrap_principal(uuid) TO eye_identity;
