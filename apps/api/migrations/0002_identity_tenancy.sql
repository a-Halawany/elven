-- 0002: identity + tenancy schemas (ADR-P0-04).
-- Control records (principals, credentials, sessions, bindings, tenants, domains)
-- are mutable governed state — every change is audited at the service layer.
-- Lifecycle event tables are append-only evidence.
-- RLS is the independent second enforcement (ES-51, ADR-P0-10): eye_app has no
-- BYPASSRLS; scope context arrives via SET LOCAL eye.scope / eye.tenant_id /
-- eye.domain_id set from the AUTHENTICATED principal (never client input).

-- ===== identity =====

CREATE TABLE identity.principals (
  id            uuid PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('human', 'workload', 'agent')),
  scope         text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id     uuid,
  domain_id     uuid,
  display_name  text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'retired')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT principals_scope_ids CHECK (
    (scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR
    (scope = 'TENANT'   AND tenant_id IS NOT NULL AND domain_id IS NULL) OR
    (scope = 'DOMAIN'   AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)
  )
);

CREATE TABLE identity.credentials (
  id            uuid PRIMARY KEY,
  principal_id  uuid NOT NULL REFERENCES identity.principals(id),
  type          text NOT NULL CHECK (type IN ('password')),
  secret_hash   text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotated', 'revoked')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  rotated_at    timestamptz
);

CREATE TABLE identity.sessions (
  id                 uuid PRIMARY KEY,
  principal_id       uuid NOT NULL REFERENCES identity.principals(id),
  assurance          text NOT NULL CHECK (assurance IN ('password', 'break_glass')),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  refresh_token_hash text NOT NULL,
  issued_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz
);

CREATE TABLE identity.roles (
  code        text PRIMARY KEY,
  scope       text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  description text NOT NULL
);

INSERT INTO identity.roles (code, scope, description) VALUES
  ('platform_admin', 'PLATFORM', 'Platform administration — technical access only; never business decision authority (PER-18/19)'),
  ('tenant_admin',   'TENANT',   'Customer tenant administrator'),
  ('domain_admin',   'DOMAIN',   'Customer Intelligence Domain administrator'),
  ('domain_analyst', 'DOMAIN',   'Domain analyst — read/propose within domain'),
  ('auditor',        'TENANT',   'Auditor of record — read-only evidence access; cannot alter evidence (PER-17)');

CREATE TABLE identity.role_bindings (
  id            uuid PRIMARY KEY,
  principal_id  uuid NOT NULL REFERENCES identity.principals(id),
  role_code     text NOT NULL REFERENCES identity.roles(code),
  scope         text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id     uuid,
  domain_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  CONSTRAINT role_bindings_scope_ids CHECK (
    (scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR
    (scope = 'TENANT'   AND tenant_id IS NOT NULL AND domain_id IS NULL) OR
    (scope = 'DOMAIN'   AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)
  )
);

CREATE TABLE identity.break_glass_grants (
  id            uuid PRIMARY KEY,
  principal_id  uuid NOT NULL REFERENCES identity.principals(id),
  reason        text NOT NULL,
  granted_by    text NOT NULL,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  revoked_at    timestamptz
);

-- ===== tenancy =====

CREATE TABLE tenancy.tenants (
  id                 uuid PRIMARY KEY,
  name               text NOT NULL UNIQUE,
  status             text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'active', 'suspended', 'deleting', 'deleted')),
  residency_profile  text NOT NULL DEFAULT 'local-dev',
  retention_profile  text NOT NULL DEFAULT 'default',
  created_at         timestamptz NOT NULL DEFAULT now(),
  activated_at       timestamptz
);

CREATE TABLE tenancy.domains (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenancy.tenants(id),
  name               text NOT NULL,
  status             text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'active', 'suspended', 'deleting', 'deleted')),
  residency_profile  text NOT NULL DEFAULT 'local-dev',
  retention_profile  text NOT NULL DEFAULT 'default',
  created_at         timestamptz NOT NULL DEFAULT now(),
  activated_at       timestamptz,
  UNIQUE (tenant_id, name)
);

-- Append-only lifecycle evidence.
CREATE TABLE tenancy.lifecycle_events (
  id          uuid PRIMARY KEY,
  scope       text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id   uuid,
  domain_id   uuid,
  event       text NOT NULL,
  actor       text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TRIGGER lifecycle_events_append_only
  BEFORE UPDATE OR DELETE ON tenancy.lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ===== grants =====

GRANT SELECT, INSERT, UPDATE ON identity.principals, identity.credentials,
  identity.sessions, identity.role_bindings, identity.break_glass_grants TO eye_app;
GRANT SELECT ON identity.roles TO eye_app;
GRANT SELECT, INSERT, UPDATE ON tenancy.tenants, tenancy.domains TO eye_app;
GRANT SELECT, INSERT ON tenancy.lifecycle_events TO eye_app;
-- No DELETE anywhere; lifecycle_events additionally has no UPDATE.

-- ===== RLS (independent second enforcement) =====

ALTER TABLE tenancy.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.role_bindings ENABLE ROW LEVEL SECURITY;

-- Helper: current request scope context (set from authenticated principal only).
CREATE OR REPLACE FUNCTION public.eye_scope() RETURNS text AS $$
  SELECT COALESCE(NULLIF(current_setting('eye.scope', true), ''), 'NONE')
$$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION public.eye_tenant() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('eye.tenant_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

-- PLATFORM context sees everything (platform authority); TENANT/DOMAIN context
-- sees only its tenant. Missing context ('NONE') sees nothing — fail closed.
CREATE POLICY tenants_isolation ON tenancy.tenants
  USING (public.eye_scope() = 'PLATFORM' OR id = public.eye_tenant());
CREATE POLICY domains_isolation ON tenancy.domains
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY lifecycle_isolation ON tenancy.lifecycle_events
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY principals_isolation ON identity.principals
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant()
         OR (scope = 'PLATFORM' AND public.eye_scope() = 'PLATFORM'));
CREATE POLICY role_bindings_isolation ON identity.role_bindings
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());

-- Write-path policies mirror the read policies.
CREATE POLICY tenants_write ON tenancy.tenants FOR INSERT
  WITH CHECK (public.eye_scope() = 'PLATFORM');
CREATE POLICY tenants_update ON tenancy.tenants FOR UPDATE
  USING (public.eye_scope() = 'PLATFORM');
CREATE POLICY domains_write ON tenancy.domains FOR INSERT
  WITH CHECK (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY domains_update ON tenancy.domains FOR UPDATE
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY lifecycle_write ON tenancy.lifecycle_events FOR INSERT
  WITH CHECK (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY principals_write ON identity.principals FOR INSERT
  WITH CHECK (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY principals_update ON identity.principals FOR UPDATE
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY role_bindings_write ON identity.role_bindings FOR INSERT
  WITH CHECK (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY role_bindings_update ON identity.role_bindings FOR UPDATE
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());

-- ===== bounded authentication lookups (SECURITY DEFINER) =====
-- Authentication happens BEFORE scope context exists (ADR-P0-08 step 2 precedes
-- step 3), so principal lookup cannot depend on RLS context. These two bounded
-- functions are the ONLY identity read path available without scope context.

CREATE OR REPLACE FUNCTION identity.auth_lookup(p_username text)
RETURNS TABLE (
  principal_id uuid, kind text, scope text, tenant_id uuid, domain_id uuid,
  status text, credential_id uuid, secret_hash text
) SECURITY DEFINER SET search_path = identity, pg_temp AS $$
  SELECT p.id, p.kind, p.scope, p.tenant_id, p.domain_id, p.status, c.id, c.secret_hash
  FROM principals p
  JOIN credentials c ON c.principal_id = p.id AND c.status = 'active' AND c.type = 'password'
  WHERE p.display_name = p_username AND p.status = 'active'
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION identity.auth_principal(p_id uuid)
RETURNS TABLE (
  principal_id uuid, kind text, scope text, tenant_id uuid, domain_id uuid, status text
) SECURITY DEFINER SET search_path = identity, pg_temp AS $$
  SELECT p.id, p.kind, p.scope, p.tenant_id, p.domain_id, p.status
  FROM principals p WHERE p.id = p_id
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION identity.auth_bindings(p_id uuid)
RETURNS TABLE (role_code text, scope text, tenant_id uuid, domain_id uuid)
SECURITY DEFINER SET search_path = identity, pg_temp AS $$
  SELECT rb.role_code, rb.scope, rb.tenant_id, rb.domain_id
  FROM role_bindings rb WHERE rb.principal_id = p_id AND rb.revoked_at IS NULL
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION identity.auth_lookup(text), identity.auth_principal(uuid),
  identity.auth_bindings(uuid) TO eye_app;
