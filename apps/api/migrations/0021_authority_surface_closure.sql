-- 0021: Gate-2.2 C13 — close the authority surface the CATALOG GATE discovered.
--
-- GOVERNED FORWARD MIGRATION. 0001–0020 are IMMUTABLE and untouched.
--
-- These findings were produced by scripts/authority-inventory.mjs reading the LIVE
-- catalogs — not by reviewing a handwritten list. That is the point of C13: a
-- handwritten list kept passing while this surface survived.
--
-- 1. THREE LEGACY IDENTITY LOOKUP PORTS STILL EXISTED AND WERE STILL GRANTED.
--    Gate-2.1 withdrew identity.auth_principal / auth_bindings / session_get_active
--    from the APPLICATION role and replaced them with the caller-bound
--    session_subject / session_bindings (which require proof of possession of that
--    session's context key). The withdrawal was real, but the FUNCTIONS remained and
--    eye_identity still held EXECUTE on all three — an unbounded
--    principal/binding/session lookup by arbitrary UUID, reachable by the identity
--    authority. Nothing in the application calls them any more, so they are DROPPED
--    rather than re-narrowed: an unused authority is pure attack surface.
--
-- 2. THE RETIRED eye_system ROLE COULD STILL LOG IN. Its privileges were stripped in
--    0011, but a login-capable role with a password in the cluster is a credential
--    that can be presented. It is set NOLOGIN here (C19 posture, applied now because
--    the authority gate legitimately fails on it).

-- ── 1. Drop the superseded, unbounded identity lookups ──────────────────────
DROP FUNCTION IF EXISTS identity.auth_principal(uuid);
DROP FUNCTION IF EXISTS identity.auth_bindings(uuid);
DROP FUNCTION IF EXISTS identity.session_get_active(uuid);

-- ── 2. Retired / non-connecting roles must not be able to log in ────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('eye_system')          -- retired in 0011
       AND rolcanlogin
  LOOP
    EXECUTE format('ALTER ROLE %I NOLOGIN', r.rolname);
    RAISE NOTICE 'authority surface: % set NOLOGIN (retired role)', r.rolname;
  END LOOP;
END $$;

-- The audit allocator is reached ONLY as the owner of the chain-head definer
-- functions; no process connects as it. Removing its login removes a live
-- credential without touching the definer path (function ownership is unaffected
-- by the login attribute).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eye_audit_allocator' AND rolcanlogin) THEN
    EXECUTE 'ALTER ROLE eye_audit_allocator NOLOGIN';
    RAISE NOTICE 'authority surface: eye_audit_allocator set NOLOGIN (definer-owner only)';
  END IF;
END $$;
