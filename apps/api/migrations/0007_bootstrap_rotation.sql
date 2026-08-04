-- 0007: bootstrap credential hardening (security correction, ADR-P0-17).
-- The bootstrap credential is one-time: environment-supplied (never committed,
-- never logged), expires if unused, and FORCES rotation on first use. A
-- bootstrap-rotation session may perform credential rotation only.

ALTER TABLE identity.credentials DROP CONSTRAINT credentials_status_check;
ALTER TABLE identity.credentials ADD CONSTRAINT credentials_status_check
  CHECK (status IN ('active', 'must_rotate', 'rotated', 'revoked'));
ALTER TABLE identity.credentials ADD COLUMN expires_at timestamptz;

ALTER TABLE identity.sessions DROP CONSTRAINT sessions_assurance_check;
ALTER TABLE identity.sessions ADD CONSTRAINT sessions_assurance_check
  CHECK (assurance IN ('password', 'break_glass', 'bootstrap_rotation'));

-- auth_lookup now surfaces credential status + expiry so login can enforce
-- one-time semantics (expired must_rotate credentials are revoked, not usable).
DROP FUNCTION identity.auth_lookup(text);
CREATE FUNCTION identity.auth_lookup(p_username text)
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
  WHERE p.display_name = p_username AND p.status = 'active'
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION identity.auth_lookup(text) TO eye_app;
