-- 0006: canonical objects + transactional outbox + schema registry (M5).
-- Single authoritative representation (ADR-P0-05): the typed row IS the header;
-- payload is validated JSONB; content_digest = SHA-256(JCS({header, payload})).
-- Four-axis temporal model (ADR-P0-07): event/observation/valid/record time.
-- Append-only at the privilege level + trigger (no UPDATE/DELETE for any role).

CREATE TABLE objects.canonical_objects (
  -- Identity block
  object_id           uuid NOT NULL,
  object_type         text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  tenant_id           uuid,
  domain_id           uuid,
  scope               text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  object_version      bigint NOT NULL CHECK (object_version >= 1),
  lifecycle_state     text NOT NULL CHECK (lifecycle_state IN
    ('proposed','admitted','active','disputed','corrected','withdrawn','superseded','archived','deleted')),
  owning_component    text NOT NULL,
  accountable_owner   text NOT NULL,
  source_object_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Temporal block (four axes)
  event_time          timestamptz,
  observation_time    timestamptz,
  valid_from          timestamptz,
  valid_to            timestamptz,
  recorded_at         timestamptz NOT NULL DEFAULT now(),  -- record time: committing component
  time_precision      text NOT NULL DEFAULT 'exact',
  source_clock_quality text NOT NULL DEFAULT 'trusted'
    CHECK (source_clock_quality IN ('trusted','degraded','unknown')),
  -- Epistemic block
  truth_state         text NOT NULL CHECK (truth_state IN
    ('observed','asserted','extracted','inferred','assessed','synthetic','decided','disputed','withdrawn')),
  synthetic_state     boolean NOT NULL DEFAULT false,
  confidence          jsonb,
  uncertainty         jsonb,
  -- Provenance block
  evidence_refs       jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance_ref      text,
  method_ref          text,
  contradiction_refs  jsonb NOT NULL DEFAULT '[]'::jsonb,
  corroboration_refs  jsonb NOT NULL DEFAULT '[]'::jsonb,
  human_refs          jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Policy block
  classification      text NOT NULL,
  purpose_scope       text NOT NULL,
  rights_profile      text,
  residency_profile   text,
  retention_profile   text,
  access_policy_ref   text,
  -- Quality block
  quality_profile     text,
  quality_state       jsonb,
  freshness_state     jsonb,
  -- Schema/semantics block
  schema_ref          text NOT NULL,
  ontology_ref        text,
  -- Correction block
  correction_of       text,   -- '<object_id>@<version>' of the corrected version
  supersedes          text,
  withdrawal_reason   text,
  -- Audit / payload block
  audit_correlation_id uuid NOT NULL,
  content_ref         text,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_digest      text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (object_id, object_version),
  -- Scope rules (ADR-P0-04)
  CONSTRAINT canonical_scope_ids CHECK (
    (scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR
    (scope = 'TENANT'   AND tenant_id IS NOT NULL AND domain_id IS NULL) OR
    (scope = 'DOMAIN'   AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)
  ),
  -- Synthetic consistency (ADR-P0-06)
  CONSTRAINT synthetic_consistency CHECK (truth_state <> 'synthetic' OR synthetic_state = true),
  -- valid_to requires valid_from
  CONSTRAINT valid_interval CHECK (valid_to IS NULL OR valid_from IS NOT NULL),
  -- Minimum provenance at the database level (defense in depth for EYE-PRV-001)
  CONSTRAINT minimum_provenance CHECK (
    jsonb_array_length(evidence_refs) > 0 OR jsonb_array_length(source_object_ids) > 0
    OR method_ref IS NOT NULL OR jsonb_array_length(human_refs) > 0
  )
);

CREATE INDEX canonical_objects_lookup ON objects.canonical_objects (tenant_id, domain_id, object_type, recorded_at);
CREATE INDEX canonical_objects_asof ON objects.canonical_objects (object_id, recorded_at);

CREATE TRIGGER canonical_objects_append_only
  BEFORE UPDATE OR DELETE ON objects.canonical_objects
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- Transactional outbox (ADR-P0-12): inserted atomically with the state change;
-- published asynchronously AFTER commit. `status` transitions are the publisher's
-- own control state (pending -> published|failed) — the row itself stays.
CREATE TABLE objects.object_outbox (
  id             uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid,
  domain_id      uuid,
  event_type     text NOT NULL,
  payload        jsonb NOT NULL,
  correlation_id uuid NOT NULL,
  causation_id   uuid NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz
);
CREATE INDEX object_outbox_pending ON objects.object_outbox (status, created_at) WHERE status = 'pending';

CREATE TABLE objects.schema_registry (
  object_type   text NOT NULL,
  schema_version text NOT NULL,
  json_schema   jsonb NOT NULL,
  compatibility text NOT NULL DEFAULT 'additive',
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (object_type, schema_version)
);

GRANT SELECT, INSERT ON objects.canonical_objects TO eye_app;
GRANT SELECT, INSERT, UPDATE ON objects.object_outbox TO eye_app;  -- outbox status is publisher control state, not evidence
GRANT SELECT, INSERT ON objects.schema_registry TO eye_app;

ALTER TABLE objects.canonical_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY canonical_isolation ON objects.canonical_objects
  USING (
    (public.eye_scope() = 'PLATFORM') OR
    (tenant_id = public.eye_tenant())
  );
CREATE POLICY canonical_write ON objects.canonical_objects FOR INSERT
  WITH CHECK (
    (public.eye_scope() = 'PLATFORM' AND scope = 'PLATFORM' AND tenant_id IS NULL) OR
    (tenant_id = public.eye_tenant())
  );
ALTER TABLE objects.object_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY outbox_isolation ON objects.object_outbox
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY outbox_write ON objects.object_outbox FOR INSERT
  WITH CHECK (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());
CREATE POLICY outbox_update ON objects.object_outbox FOR UPDATE
  USING (public.eye_scope() = 'PLATFORM' OR tenant_id = public.eye_tenant());

-- Seed CLM (Claim) schema v1 — the Phase 0 demonstration object type.
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility)
VALUES ('CLM', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["subject", "predicate", "object_value"],
  "properties": {
    "subject": { "type": "string", "minLength": 1 },
    "predicate": { "type": "string", "minLength": 1 },
    "object_value": { "type": "string", "minLength": 1 },
    "qualifiers": { "type": "object" }
  }
}'::jsonb, 'additive');
