-- 0003: policy schema (ADR-P0-10).
-- policy_bundles: versioned rule sets (v1 is code-defined; the row records its digest).
-- policy_decisions: POL records — append-only evidence with exception/expiry/
-- revocation context (Vol 3 Ch.22), written only via the bounded internal port.

CREATE TABLE policy.policy_bundles (
  version     text PRIMARY KEY,
  digest      text NOT NULL,
  description text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE policy.policy_decisions (
  id                uuid PRIMARY KEY,
  scope             text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id         uuid,
  domain_id         uuid,
  decision          text NOT NULL CHECK (decision IN ('allow', 'deny', 'indeterminate', 'allow_with_obligations')),
  obligations       jsonb NOT NULL DEFAULT '[]'::jsonb,
  principal_id      text NOT NULL,
  delegation_id     text,
  action            text NOT NULL,
  object_type       text,
  object_id         uuid,
  purpose_id        text,
  consequence_class text NOT NULL CHECK (consequence_class IN ('C0', 'C1', 'C2', 'C3', 'C4')),
  environment       jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_digest      text NOT NULL,
  bundle_version    text NOT NULL REFERENCES policy.policy_bundles(version),
  exception_ref     text,
  expires_at        timestamptz,
  revocation_state  text NOT NULL DEFAULT 'none' CHECK (revocation_state IN ('none', 'revoked')),
  reason            text NOT NULL,
  correlation_id    uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX policy_decisions_corr ON policy.policy_decisions (correlation_id);
CREATE INDEX policy_decisions_tenant ON policy.policy_decisions (tenant_id, created_at);

CREATE TRIGGER policy_decisions_append_only
  BEFORE UPDATE OR DELETE ON policy.policy_decisions
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

GRANT SELECT, INSERT ON policy.policy_bundles TO eye_app;
GRANT SELECT, INSERT ON policy.policy_decisions TO eye_app;

ALTER TABLE policy.policy_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY policy_decisions_isolation ON policy.policy_decisions
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY policy_decisions_write ON policy.policy_decisions FOR INSERT
  WITH CHECK (true);  -- writes only via internal port under the commit pipeline's resolved context

INSERT INTO policy.policy_bundles (version, digest, description)
VALUES ('bundle-v1', 'code-defined', 'Phase 0 RBAC rules expressed in the ABAC decision model (ADR-P0-10)');
