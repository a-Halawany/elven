-- 0070 — CP-6 B11: the governed credential path; retention executors (archive, customer export) and the safe deletion scope (2026-09-13).
--   §1 SRC@v3 — the v2 schema plus security_and_operations.credential_header: the request header a contract's credential
--      travels in (the reference stays `credential_ref`, a deployment variable EYE_SRC_<NAME>; the value is resolved at
--      egress time by the run and never recorded). Additive: SRC@v1/v2 objects untouched; a contract not naming a header
--      is admitted as before (SOURCE_INTEGRATION_STATUS §6 item 3).
--   §2 vault tiers: observation.blob_tier_records (append-only; a manifest's tier is its latest record, 'hot' when none), observation.manifest_tier;
--      custody events custody.archived / custody.exported; the port observation.archive_blob (an executing archive action only; idempotent).
--   §3 the export package ledger retention.export_packages (revoked once, never deleted); the ports retention.record_export_package and
--      retention.revoke_export; the action events export.built / export.revoked; retention.open_action admits the export's selector.
--   §4 retention.load_bearing_references and retention.resolve_scope re-declared: the archive and export take the preservation scope (0068 §6);
--      the export's redaction gate reads the STRICTER of the manifest's and the exported record's classification, the data-rights gate is an
--      exclusion with its reason; an id of a chosen object set that resolves to no manifest of this domain is an excluded item, never dropped;
--      a DELETION retires the bytes of an evidence OBJECT whose latest version is corrected, superseded or withdrawn (decided on the object, not
--      on the latest version naming the manifest) and pauses when a manifest's evidence version is load-bearing (V03-T-100, AU-MEM-0061) —
--      the item 'blocking', the dependents named, the residual inventory unchanged. The object-level rule counts the latest briefing of a
--      line only: a DEC→evidence dependency row is package-derived and is governed, version-aware, by the package citation (released on
--      supersession, close or withdrawal of the package). An expression index serves every lookup of the manifest an evidence version names.
--   §5 retention.begin_execution re-declared (every kind executes; the export's rights re-checked at execution under a share lock; a tombstone
--      since the approval refuses an archive or an export; a DELETION's safe scope re-proven at execution — a reference created inside the
--      approval window pauses it); retention.pause_action with a failure class; retention.record_export_package re-checks the tombstones and the rights.
--   §6 retention.verify_action re-declared: the archive and export contracts (the export's is the package's own files and recorded digests; the
--      source's state at verification time is recorded, not required).
--   §7 retention.declare_schedule validates a customer_export schedule's ceiling and destination; retention.evaluate_schedules carries a schedule's
--      selector keys into the actions it opens, skips the archived manifests of an archive schedule and opens no export without a ceiling.
--   §8 the interface register: L3-I04's binding text names the five executors (counts unchanged: 26 bound, 24 partial, 0 unbound).
--   §9 retention.withdraw_action asserts retention.action.withdraw (its own named act; the opener's action still admitted) — the retention
--      workspace found the withdraw route bound to retention.action.open.

-- ============================================================
-- §1 SRC@v3
-- ============================================================
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('SRC', 'v3', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["source_key","name","publisher","authority_class","connector_kind","acquisition_mode",
               "data_origin","identity","authority_and_rights","security_and_operations","lifecycle"],
  "properties": {
    "source_key": { "type": "string", "minLength": 2, "maxLength": 128 },
    "name": { "type": "string", "minLength": 2, "maxLength": 256 },
    "publisher": { "type": "string", "minLength": 2, "maxLength": 256 },
    "authority_class": { "enum": ["authoritative", "observational"] },
    "connector_kind": { "enum": ["upload", "rss", "rest"] },
    "acquisition_mode": { "enum": ["replay", "live"] },
    "data_origin": { "enum": ["real", "synthetic"] },
    "identity": {
      "type": "object", "additionalProperties": false,
      "required": ["source_identity","publisher_identity","endpoints","scheme_allowlist","cadence_seconds"],
      "properties": {
        "source_identity": { "type": "string", "minLength": 2 },
        "publisher_identity": { "type": "string", "minLength": 2 },
        "endpoints": { "type": "array", "items": { "type": "string" } },
        "scheme_allowlist": { "type": "array", "items": { "enum": ["https"] } },
        "cadence_seconds": { "type": "integer", "minimum": 60 },
        "jitter_seconds": { "type": "integer", "minimum": 0 },
        "collection_window": { "type": ["string","null"] }
      }
    },
    "authority_and_rights": {
      "type": "object", "additionalProperties": false,
      "required": ["owner","steward","authority","legal_basis","rights_state","licence",
                   "permitted_use","robots_policy","purposes","classification_ceiling",
                   "residency","retention","deletion_obligation"],
      "properties": {
        "owner": { "type": "string" }, "steward": { "type": "string" },
        "attribution": { "type": ["string","null"], "maxLength": 512 },
        "authority": { "type": "string" }, "legal_basis": { "type": "string" },
        "rights_state": { "enum": ["confirmed","pending","withdrawn"] },
        "licence": { "type": "string" },
        "permitted_use": { "type": "array", "items": { "type": "string" } },
        "robots_policy": { "type": "string" },
        "purposes": { "type": "array", "minItems": 1, "items": { "type": "string" } },
        "classification_ceiling": { "type": "string" },
        "residency": { "type": "string" },
        "retention": { "type": "string" },
        "deletion_obligation": { "type": "string" }
      }
    },
    "security_and_operations": {
      "type": "object", "additionalProperties": false,
      "required": ["credential_ref","authentication_method","authenticity_method","budgets",
                   "expected_schema","freshness_expectation","coverage_expectations","correction_channel"],
      "properties": {
        "credential_ref": { "type": ["string","null"] },
        "credential_header": { "type": ["string","null"], "pattern": "^[A-Za-z0-9-]{1,64}$" },
        "authentication_method": { "type": "string" },
        "authenticity_method": {
          "type": "object", "additionalProperties": false,
          "required": ["transport_endpoint","byte_integrity","source_origin","content_authenticity"],
          "properties": {
            "transport_endpoint": { "type": "string" },
            "byte_integrity": { "type": "string" },
            "source_origin": { "type": "string" },
            "content_authenticity": { "type": "string" }
          }
        },
        "budgets": {
          "type": "object", "additionalProperties": false,
          "required": ["max_requests_per_run","max_bytes_per_run","max_concurrency","timeout_ms","max_retries"],
          "properties": {
            "max_requests_per_run": { "type": "integer", "minimum": 1 },
            "max_bytes_per_run": { "type": "integer", "minimum": 1 },
            "max_concurrency": { "type": "integer", "minimum": 1 },
            "timeout_ms": { "type": "integer", "minimum": 100 },
            "max_retries": { "type": "integer", "minimum": 0 },
            "cost_units": { "type": "number", "minimum": 0 }
          }
        },
        "expected_schema": {
          "type": "object", "additionalProperties": false,
          "required": ["media_types","required_fields","drift_tolerance"],
          "properties": {
            "media_types": { "type": "array", "items": { "type": "string" } },
            "required_fields": { "type": "array", "items": { "type": "string" } },
            "drift_tolerance": { "type": "integer", "minimum": 0 },
            "max_bytes": { "type": "integer", "minimum": 1 }
          }
        },
        "freshness_expectation": {
          "type": "object", "additionalProperties": false,
          "required": ["threshold_seconds","expected_interval"],
          "properties": {
            "threshold_seconds": { "type": "integer", "minimum": 1 },
            "expected_interval": { "type": "string" }
          }
        },
        "coverage_expectations": {
          "type": "object", "additionalProperties": false,
          "required": ["universe_version","denominator_derivation"],
          "properties": {
            "universe_version": { "type": "string" },
            "denominator_derivation": { "type": "string" },
            "expected_items_per_window": { "type": ["integer","null"] },
            "not_applicable_dimensions": { "type": "array", "items": { "type": "string" } },
            "not_applicable_reason": { "type": ["string","null"] }
          }
        },
        "correction_channel": { "type": "string" },
        "replay_set": { "type": "string" },
        "backfill": {
          "type": "object", "additionalProperties": false,
          "required": ["strategy","endpoint","from"],
          "properties": {
            "strategy": { "enum": ["period-range","arcgis-offset"] },
            "endpoint": { "type": "string" },
            "from": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
            "to": { "type": ["string","null"] },
            "window_days": { "type": "integer", "minimum": 1, "maximum": 3660 },
            "start_param": { "type": "string" },
            "end_param": { "type": "string" },
            "page_size": { "type": "integer", "minimum": 1, "maximum": 10000 },
            "order_by": { "type": "string" },
            "time_field": { "type": "string" },
            "where": { "type": "string" }
          }
        }
      }
    },
    "lifecycle": {
      "type": "object", "additionalProperties": false,
      "required": ["contract_version","effective_from"],
      "properties": {
        "contract_version": { "type": "integer", "minimum": 1 },
        "effective_from": { "type": "string" },
        "effective_to": { "type": ["string","null"] },
        "supersedes_version": { "type": ["integer","null"] }
      }
    },
    "separation_of_duties": {
      "type": "object", "additionalProperties": true
    }
  }
}'::jsonb, 'additive');

-- ============================================================
-- §2 vault tiers
-- ============================================================
-- The manifest row stays immutable (append-only since 0022); its tier is a companion append-only ledger, one row per move
-- (D1). The archive tier is a second ROOT of the vault under the same opaque scoped locator (D2): every locator check
-- applies unchanged, and verification is literal — the bytes present in the archive root, absent from the hot root.
CREATE TABLE observation.blob_tier_records (
  record_id      uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  manifest_id    uuid NOT NULL REFERENCES observation.blob_manifests (manifest_id),
  from_tier      text NOT NULL CHECK (from_tier IN ('hot', 'archive')),
  tier           text NOT NULL CHECK (tier IN ('hot', 'archive')),
  action_id      uuid NOT NULL,
  content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  moved_by       uuid NOT NULL,
  moved_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT btr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT btr_moves CHECK (from_tier <> tier)
);
CREATE INDEX btr_manifest ON observation.blob_tier_records (manifest_id, moved_at DESC);
CREATE TRIGGER btr_append_only BEFORE UPDATE OR DELETE ON observation.blob_tier_records FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE observation.blob_tier_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation.blob_tier_records FORCE ROW LEVEL SECURITY;
CREATE POLICY observation_isolation ON observation.blob_tier_records
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON observation.blob_tier_records FROM PUBLIC;
GRANT SELECT ON observation.blob_tier_records TO eye_app, eye_commit;

-- A manifest's tier: its latest move; 'hot' when it never moved. (Only 'archive' is written in this release; 'hot' as a target is a later restore port.)
CREATE OR REPLACE FUNCTION observation.manifest_tier(p_manifest_id uuid) RETURNS text
STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT r.tier FROM observation.blob_tier_records r WHERE r.manifest_id = p_manifest_id ORDER BY r.moved_at DESC, r.record_id DESC LIMIT 1), 'hot');
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION observation.manifest_tier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.manifest_tier(uuid) TO eye_app, eye_commit;

ALTER TABLE observation.custody_events DROP CONSTRAINT custody_events_event_check;
ALTER TABLE observation.custody_events ADD CONSTRAINT custody_events_event_check CHECK (event IN (
  'custody.acquired', 'custody.quarantined', 'custody.verified', 'custody.candidate_verified', 'custody.admitted', 'custody.finalized',
  'custody.retrieved', 'custody.tombstoned', 'custody.integrity_failed', 'custody.archived', 'custody.exported'));

-- THE ARCHIVE PORT: records the move to the archive tier — only while an executing ARCHIVE action of this domain names the manifest as an
-- executable item, only for a non-tombstoned evidence manifest, only under the manifest's own digest (the executor verified it on the copy it
-- made before calling). A hold is NOT a refusal here: an archive preserves. Idempotent: a manifest already in the archive tier returns false.
CREATE OR REPLACE FUNCTION observation.archive_blob(
  p_record_id uuid, p_tenant uuid, p_domain uuid, p_manifest_id uuid, p_action_id uuid, p_content_digest text, p_actor uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = observation, objects, retention, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m observation.blob_manifests%ROWTYPE; v_evd uuid; v_obs uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'archive rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM observation.blob_manifests x WHERE x.manifest_id = p_manifest_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.vault = 'evidence';
  IF NOT FOUND THEN RAISE EXCEPTION 'archive rejected: no such evidence manifest in this domain' USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = p_manifest_id) THEN
    RAISE EXCEPTION 'archive refused: manifest % is tombstoned; there are no bytes to move', p_manifest_id USING ERRCODE = '22023';
  END IF;
  IF p_content_digest IS DISTINCT FROM m.content_digest THEN
    RAISE EXCEPTION 'archive refused: the digest verified on the archive copy (%) is not the manifest''s (%)', coalesce(p_content_digest, '<none>'), m.content_digest USING ERRCODE = 'P0R02';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM retention.actions_current a JOIN retention.scope_items i ON i.action_id = a.action_id
                  WHERE a.action_id = p_action_id AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'executing' AND a.kind = 'archive'
                    AND i.item_kind = 'manifest' AND i.ref = p_manifest_id::text AND i.disposition = 'execute') THEN
    RAISE EXCEPTION 'archive refused: no executing archive action names manifest % as an executable item', p_manifest_id USING ERRCODE = '42501';
  END IF;
  IF observation.manifest_tier(p_manifest_id) = 'archive' THEN RETURN false; END IF;
  INSERT INTO observation.blob_tier_records (record_id, scope, tenant_id, domain_id, manifest_id, from_tier, tier, action_id, content_digest, moved_by, correlation_id)
  VALUES (p_record_id, 'DOMAIN', p_tenant, p_domain, p_manifest_id, 'hot', 'archive', p_action_id, m.content_digest, p_actor, p_correlation);
  SELECT o.object_id, (o.payload ->> 'obs_object_id')::uuid INTO v_evd, v_obs FROM objects.canonical_objects o
   WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = p_manifest_id ORDER BY o.object_version DESC LIMIT 1;
  INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_manifest_id, v_obs, v_evd, m.source_id, m.contract_version, m.run_id, 'custody.archived', 'principal:' || p_actor::text, m.content_digest, true,
          jsonb_build_object('action_id', p_action_id, 'from_tier', 'hot', 'to_tier', 'archive', 'tier_record_id', p_record_id, 'locator', m.locator), p_correlation);
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.archive_blob(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.archive_blob(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §3 the export package ledger and its ports
-- ============================================================
-- The package is "signed" by a DIGEST CHAIN bound to the approval (D4): there is no signing facility in the runtime, so
-- manifest.json carries scheme eye-digest-chain/1 — objects_digest = sha256(JCS(objects)), package_digest = sha256(JCS({format,
-- package, authorization, gates, objects_digest, excluded})), bound_to = {action_id, scope_digest, approval_id} — and the same
-- digest is recorded here and in the execution evidence, rows whose governed write is in the audit hash chain. A customer verifies
-- integrity and completeness offline (scripts/retention/verify-export.mjs) and authenticity by presenting the digest to the product.
ALTER TABLE retention.action_events DROP CONSTRAINT action_events_event_check;
ALTER TABLE retention.action_events ADD CONSTRAINT action_events_event_check CHECK (event IN ('action.opened', 'scope.resolved', 'action.held', 'action.paused', 'approval.recorded', 'approval.revoked', 'execution.started', 'execution.item', 'execution.finished', 'residual.recorded', 'verification.passed', 'verification.residuals', 'action.withdrawn', 'action.rejected', 'action.failed', 'export.built', 'export.revoked'));

CREATE TABLE retention.export_packages (
  action_id              uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  destination            text NOT NULL CHECK (destination = 'export'),
  locator_prefix         text NOT NULL,
  scope_digest           text NOT NULL CHECK (scope_digest ~ '^[0-9a-f]{64}$'),
  approval_id            uuid NOT NULL,
  classification_ceiling text NOT NULL CHECK (classification_ceiling IN ('public', 'internal', 'confidential', 'restricted')),
  object_count           int NOT NULL CHECK (object_count >= 1),
  excluded_count         int NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
  byte_total             bigint NOT NULL CHECK (byte_total >= 0),
  manifest_digest        text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  package_digest         text NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  signature              jsonb NOT NULL CHECK (jsonb_typeof(signature) = 'object'),
  built_by               uuid NOT NULL,
  built_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_by             uuid,
  revoked_at             timestamptz,
  revoke_reason          text,
  correlation_id         uuid NOT NULL,
  CONSTRAINT rxp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT rxp_prefix CHECK (locator_prefix = tenant_id::text || '/' || domain_id::text || '/' || action_id::text || '/'),
  CONSTRAINT rxp_revoke_pair CHECK ((revoked_by IS NULL) = (revoked_at IS NULL) AND (revoked_at IS NULL OR length(btrim(revoke_reason)) >= 8))
);
-- The revocation is the ONE change a package row takes, once (the shape of observation.legal_holds_lift_only).
CREATE OR REPLACE FUNCTION retention.export_packages_revoke_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.export_packages is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
     OR NEW.action_id IS DISTINCT FROM OLD.action_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.destination IS DISTINCT FROM OLD.destination OR NEW.locator_prefix IS DISTINCT FROM OLD.locator_prefix OR NEW.scope_digest IS DISTINCT FROM OLD.scope_digest
     OR NEW.approval_id IS DISTINCT FROM OLD.approval_id OR NEW.classification_ceiling IS DISTINCT FROM OLD.classification_ceiling OR NEW.object_count IS DISTINCT FROM OLD.object_count
     OR NEW.excluded_count IS DISTINCT FROM OLD.excluded_count OR NEW.byte_total IS DISTINCT FROM OLD.byte_total OR NEW.manifest_digest IS DISTINCT FROM OLD.manifest_digest
     OR NEW.package_digest IS DISTINCT FROM OLD.package_digest OR NEW.signature IS DISTINCT FROM OLD.signature OR NEW.built_by IS DISTINCT FROM OLD.built_by
     OR NEW.built_at IS DISTINCT FROM OLD.built_at OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'an export package is revoked once; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rxp_revoke_only BEFORE UPDATE OR DELETE ON retention.export_packages FOR EACH ROW EXECUTE FUNCTION retention.export_packages_revoke_only();
ALTER TABLE retention.export_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.export_packages FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.export_packages
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON retention.export_packages FROM PUBLIC;
GRANT SELECT ON retention.export_packages TO eye_app, eye_commit;

-- The package RECORDED by the executor after it wrote the files: one row per action, the digests, the signature block bound to this action,
-- its resolved scope and the live approval; a custody row per exported manifest (the audit gate); the event export.built.
CREATE OR REPLACE FUNCTION retention.record_export_package(
  p_action_id uuid, p_tenant uuid, p_domain uuid, p_approval_id uuid, p_manifest_digest text, p_package_digest text, p_signature jsonb,
  p_object_count int, p_excluded_count int, p_byte_total bigint, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; i RECORD; m RECORD; v_evd uuid; v_obs uuid; v_prefix text; v_execute int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'export rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'executing' OR a.kind <> 'customer_export' THEN RAISE EXCEPTION 'export rejected: % is not an executing customer export', p_action_id USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM retention.approvals ap WHERE ap.approval_id = p_approval_id AND ap.action_id = p_action_id AND ap.scope_digest = a.scope_digest AND ap.revoked_at IS NULL AND ap.expires_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'export rejected: approval % is not a live approval on the resolved scope of %', p_approval_id, p_action_id USING ERRCODE = '42501';
  END IF;
  IF p_manifest_digest !~ '^[0-9a-f]{64}$' OR p_package_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'export rejected: the manifest and package digests are sha-256 hex' USING ERRCODE = '22023'; END IF;
  IF p_signature IS NULL OR jsonb_typeof(p_signature) <> 'object' OR p_signature ->> 'scheme' IS DISTINCT FROM 'eye-digest-chain/1'
     OR p_signature ->> 'package_digest' IS DISTINCT FROM p_package_digest
     OR p_signature #>> '{bound_to,scope_digest}' IS DISTINCT FROM a.scope_digest
     OR p_signature #>> '{bound_to,approval_id}' IS DISTINCT FROM p_approval_id::text
     OR p_signature #>> '{bound_to,action_id}' IS DISTINCT FROM p_action_id::text THEN
    RAISE EXCEPTION 'export rejected: the signature block binds the package digest to this action, its resolved scope and the live approval' USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::int INTO v_execute FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute';
  IF p_object_count IS DISTINCT FROM v_execute THEN
    RAISE EXCEPTION 'export rejected: the package lists % object(s); the approved scope executes %', p_object_count, v_execute USING ERRCODE = '22023';
  END IF;
  -- A tombstoned manifest never enters a recorded package, and a package is never recorded for a source whose rights are no longer confirmed:
  -- begin_execution checked both before the build; the record checks them again at its own instant (the build reads up to 200 blobs).
  IF EXISTS (SELECT 1 FROM retention.scope_items si JOIN observation.blob_tombstones t ON t.manifest_id = si.ref::uuid
              WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute') THEN
    RAISE EXCEPTION 'retention execution rejected (scope_changed): a manifest in the approved scope was tombstoned during the build — %; the scope is resolved again',
      (SELECT string_agg(si.ref, ', ') FROM retention.scope_items si JOIN observation.blob_tombstones t ON t.manifest_id = si.ref::uuid WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
              JOIN observation.source_contracts_current s ON s.source_id = bm.source_id AND s.contract_version = bm.contract_version
              WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' AND s.rights_state <> 'confirmed') THEN
    RAISE EXCEPTION 'retention execution rejected (rights_changed): the rights of a source in the approved scope are no longer confirmed at the record of the package; the scope is resolved again' USING ERRCODE = '22023';
  END IF;
  v_prefix := p_tenant::text || '/' || p_domain::text || '/' || p_action_id::text || '/';
  INSERT INTO retention.export_packages (action_id, scope, tenant_id, domain_id, destination, locator_prefix, scope_digest, approval_id, classification_ceiling, object_count, excluded_count, byte_total, manifest_digest, package_digest, signature, built_by, correlation_id)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, 'export', v_prefix, a.scope_digest, p_approval_id, a.selector ->> 'classification_ceiling', p_object_count, coalesce(p_excluded_count, 0), p_byte_total, p_manifest_digest, p_package_digest, p_signature, p_actor, p_correlation);
  FOR i IN SELECT si.ref FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order LOOP
    SELECT bm.manifest_id, bm.source_id, bm.contract_version, bm.run_id, bm.content_digest, bm.locator INTO m FROM observation.blob_manifests bm WHERE bm.manifest_id = i.ref::uuid;
    SELECT o.object_id, (o.payload ->> 'obs_object_id')::uuid INTO v_evd, v_obs FROM objects.canonical_objects o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.manifest_id ORDER BY o.object_version DESC LIMIT 1;
    INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, m.manifest_id, v_obs, v_evd, m.source_id, m.contract_version, m.run_id, 'custody.exported', 'principal:' || p_actor::text, m.content_digest, true,
            jsonb_build_object('action_id', p_action_id, 'package_digest', p_package_digest, 'destination', 'export', 'locator_prefix', v_prefix, 'file', m.manifest_id::text || '.bin'), p_correlation);
  END LOOP;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'export.built', p_actor, jsonb_build_object('approval_id', p_approval_id, 'manifest_digest', p_manifest_digest, 'package_digest', p_package_digest, 'objects', p_object_count, 'excluded', coalesce(p_excluded_count, 0), 'bytes', p_byte_total, 'locator_prefix', v_prefix), p_correlation);
  RETURN jsonb_build_object('action_id', p_action_id, 'locator_prefix', v_prefix, 'package_digest', p_package_digest, 'manifest_digest', p_manifest_digest, 'objects', p_object_count, 'excluded', coalesce(p_excluded_count, 0), 'bytes', p_byte_total);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_export_package(uuid,uuid,uuid,uuid,text,text,jsonb,int,int,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_export_package(uuid,uuid,uuid,uuid,text,text,jsonb,int,int,bigint,uuid,uuid) TO eye_commit;

-- REVOCATION (V03-T-047 "revocation where supported"): the package is revoked once by the retention authority (retention.export.revoke,
-- human-gated); the bytes are removed by the controller after the commit; a revoked package is refused by the read route and fails verification.
CREATE OR REPLACE FUNCTION retention.revoke_export(p_action_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x retention.export_packages%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention revocation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'retention revocation rejected: a reason of 8+ characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = p_action_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention revocation rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF x.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'retention revocation rejected: the package of % was revoked at %', p_action_id, x.revoked_at USING ERRCODE = '22023'; END IF;
  UPDATE retention.export_packages SET revoked_by = p_actor, revoked_at = clock_timestamp(), revoke_reason = p_reason WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'export.revoked', p_actor, jsonb_build_object('reason', p_reason, 'package_digest', x.package_digest, 'locator_prefix', x.locator_prefix), p_correlation);
  RETURN jsonb_build_object('action_id', p_action_id, 'locator_prefix', x.locator_prefix, 'package_digest', x.package_digest, 'revoked_at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.revoke_export(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.revoke_export(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- open_action re-declared (0066 §4 body + the selector rules of D7): manifest_ids for archive/customer_export only; the export names its ceiling and destination.
CREATE OR REPLACE FUNCTION retention.open_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_target_kind text, p_selector jsonb, p_retention_profile text, p_schedule_id uuid, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.open', 'retention.schedule.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_selector IS NULL OR jsonb_typeof(p_selector) <> 'object' THEN RAISE EXCEPTION 'retention action rejected: the selector is an object' USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'log_partition' AND p_kind <> 'log_floor' THEN RAISE EXCEPTION 'retention action rejected: the log partition takes the log_floor action' USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'evidence' AND p_kind NOT IN ('review', 'deletion', 'archive', 'customer_export') THEN RAISE EXCEPTION 'retention action rejected: % is not an evidence action', p_kind USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'log_partition' AND (p_selector ->> 'partition_key') IS DISTINCT FROM ('tenant:' || p_tenant::text) THEN
    RAISE EXCEPTION 'retention action rejected: the log partition of this tenant is tenant:%', p_tenant USING ERRCODE = '22023';
  END IF;
  IF p_target_kind = 'evidence' THEN
    IF (p_selector ? 'manifest_ids') AND p_kind NOT IN ('archive', 'customer_export') THEN RAISE EXCEPTION 'retention action rejected: a chosen object set (manifest_ids) is an archive''s or a customer export''s selector' USING ERRCODE = '22023'; END IF;
    IF (p_selector ? 'manifest_ids') AND (jsonb_typeof(p_selector -> 'manifest_ids') <> 'array' OR jsonb_array_length(p_selector -> 'manifest_ids') NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'retention action rejected: manifest_ids is an array of 1 to 200 ids' USING ERRCODE = '22023'; END IF;
    IF (p_selector ->> 'manifest_id') IS NULL AND (p_selector ->> 'source_id') IS NULL AND NOT (p_selector ? 'manifest_ids') THEN RAISE EXCEPTION 'retention action rejected: an evidence selector names a manifest_id, a source_id or manifest_ids' USING ERRCODE = '22023'; END IF;
    IF p_kind = 'customer_export' THEN
      IF coalesce(p_selector ->> 'classification_ceiling', '') NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'retention action rejected: a customer export names its classification ceiling (public, internal, confidential, restricted)' USING ERRCODE = '22023'; END IF;
      IF coalesce(p_selector ->> 'destination', 'export') <> 'export' THEN RAISE EXCEPTION 'retention action rejected: the export destination is the export namespace of the vault (destination export)' USING ERRCODE = '22023'; END IF;
    END IF;
  END IF;
  INSERT INTO retention.actions_current (action_id, scope, tenant_id, domain_id, kind, target_kind, selector, schedule_id, retention_profile, opened_by, correlation_id)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_target_kind, CASE WHEN p_kind = 'customer_export' THEN p_selector || jsonb_build_object('destination', 'export') ELSE p_selector END, p_schedule_id, p_retention_profile, p_actor, p_correlation);
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.opened', p_actor, jsonb_build_object('kind', p_kind, 'target_kind', p_target_kind, 'selector', p_selector, 'schedule_id', p_schedule_id), p_correlation);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §4 the safe referential scope and the preservation scopes
-- ============================================================
-- Every lookup of the manifest an evidence version names — the resolution's version set V(M), the archive and export ports, the held-evidence
-- reads — keys on (payload ->> 'manifest_id')::uuid of an EVD row; without an index each is a scan of the domain's canonical rows.
CREATE INDEX IF NOT EXISTS canonical_objects_evd_manifest ON objects.canonical_objects (((payload ->> 'manifest_id')::uuid)) WHERE object_type = 'EVD';

-- The references that make the bytes of manifest M LOAD-BEARING (V03-T-100). p_versions = every EVD version whose payload names M (a
-- correction keeps the manifest under the next version — D9; a revision admits the next version under a NEW manifest, so V(M) may be one
-- version of an object whose later versions carry other bytes); p_content_digest = M's digest. Returns a jsonb array of dependents, each
-- {kind, ref, version_aware, route, ...}; empty when the scope is provable. Private to the resolution and the execution's re-check (no
-- EXECUTE grant; called by the definer).
CREATE OR REPLACE FUNCTION retention.load_bearing_references(p_tenant uuid, p_domain uuid, p_evd_object_id uuid, p_versions bigint[], p_content_digest text)
RETURNS jsonb
STABLE SET search_path = retention, observation, objects, graph, intelligence, executive, decision, pg_catalog, pg_temp AS $$
DECLARE v_out jsonb := '[]'::jsonb; v_part jsonb; v_successor boolean; v_max bigint;
BEGIN
  v_max := (SELECT max(v) FROM unnest(p_versions) v);
  -- (a) VERSION-AWARE — a briefing citing one of these versions in its sources (evidence:<id>@<v> or evidence-acknowledged:<id>@<v>), still the
  --     latest of its line (no later briefing names it as prior) whose decision package, if any, is not closed, rejected or withdrawn.
  SELECT coalesce(jsonb_agg(q.x ORDER BY q.composed_at, q.briefing_id), '[]'::jsonb) INTO v_part FROM (
    SELECT DISTINCT ON (b.briefing_id) b.briefing_id, b.composed_at,
           jsonb_build_object('kind', 'briefing', 'ref', b.briefing_id::text, 'version_aware', true, 'cited_as', s.src, 'room_id', b.room_id, 'package_id', b.package_id,
                              'route', 'compose the next briefing of the line (it names this one as prior_briefing_id and cites the current evidence) or close, reject or withdraw the room''s decision package; then resolve again') AS x
      FROM executive.briefings b
      CROSS JOIN LATERAL (SELECT e #>> '{}' AS src FROM jsonb_array_elements(b.sources) e) s
      CROSS JOIN LATERAL unnest(p_versions) v
     WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain
       AND s.src IN ('evidence:' || p_evd_object_id::text || '@' || v, 'evidence-acknowledged:' || p_evd_object_id::text || '@' || v)
       AND NOT EXISTS (SELECT 1 FROM executive.briefings n WHERE n.prior_briefing_id = b.briefing_id)
       AND (b.package_id IS NULL OR EXISTS (SELECT 1 FROM decision.packages_current p WHERE p.package_id = b.package_id AND p.state NOT IN ('closed', 'rejected', 'withdrawn')))
     ORDER BY b.briefing_id, s.src) q;
  v_out := v_out || v_part;
  -- (b) DIGEST-BEARING — an ASSERTED edge whose provenance names these bytes (its own evidence columns, or the lineage of its claim version).
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'edge', 'ref', e.edge_id::text, 'version_aware', true, 'claim', e.claim_object_id::text || '@' || e.claim_version, 'predicate', e.predicate,
                                               'route', 'retract the edge (graph.edge.retract) or let a correction of its claim re-derive a successor under the current evidence; then resolve again') ORDER BY e.asserted_at, e.edge_id), '[]'::jsonb) INTO v_part
    FROM graph.edges_current e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.state = 'asserted'
     AND ((e.evidence_object_id = p_evd_object_id AND e.evidence_digest = p_content_digest)
          OR EXISTS (SELECT 1 FROM intelligence.claim_lineage l WHERE l.claim_object_id = e.claim_object_id AND l.claim_version = e.claim_version
                       AND l.evidence_object_id = p_evd_object_id AND l.evidence_digest = p_content_digest));
  v_out := v_out || v_part;
  -- (c) DIGEST-BEARING — a LIVE review case (queued) on a claim version whose lineage names these bytes.
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'review_case', 'ref', r.case_id::text, 'version_aware', true, 'claim', r.claim_object_id::text || '@' || r.claim_version, 'queued_reason', r.queued_reason,
                                               'route', 'decide the review case (approve, correct or reject — intelligence.review.decide); then resolve again') ORDER BY r.opened_at, r.case_id), '[]'::jsonb) INTO v_part
    FROM intelligence.review_current r
    JOIN intelligence.claim_lineage l ON l.claim_object_id = r.claim_object_id AND l.claim_version = r.claim_version
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'queued' AND l.evidence_object_id = p_evd_object_id AND l.evidence_digest = p_content_digest;
  v_out := v_out || v_part;
  -- (d) VERSION-AWARE — a decision package whose LIVE version (proposed, under review, approved, committed) cites one of these versions in an
  --     option's consequences, the package itself not closed, rejected or withdrawn. The citation's id is compared case-insensitively: every
  --     gate upstream admits an upper-cased uuid and stores it as sent.
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('kind', 'decision_package', 'ref', o.package_id::text || '@' || o.version, 'version_aware', true, 'option', o.key, 'package_state', p.state,
                                                        'route', 'propose a package version citing the current evidence (the earlier version is superseded) or close, reject or withdraw the package; then resolve again')), '[]'::jsonb) INTO v_part
    FROM decision.options o
    JOIN decision.package_versions pv ON pv.package_id = o.package_id AND pv.version = o.version
    JOIN decision.packages_current p ON p.package_id = o.package_id
    CROSS JOIN LATERAL jsonb_array_elements(o.consequences) c
   WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain
     AND c ->> 'kind' = 'evidence' AND lower(btrim(c ->> 'id')) = p_evd_object_id::text AND (c ->> 'version') ~ '^[0-9]+$' AND (c ->> 'version')::bigint = ANY (p_versions)
     AND pv.state IN ('proposed', 'under_review', 'approved', 'committed') AND p.state NOT IN ('closed', 'rejected', 'withdrawn');
  v_out := v_out || v_part;
  -- (e) OBJECT-LEVEL — a dependency row on the evidence OBJECT (no version) from a latest-of-line briefing (BRF) counts only when no later
  --     version of the object carries different, admitted, non-tombstoned bytes (D9). A briefing already named in (a) is not named twice.
  --     A DEC→evidence dependency row is NOT counted here: the product writes it only from a package proposal (decision.propose_version),
  --     nothing retires it, and no route closes a decision object — so it is governed by (d), version-aware, and released when the citing
  --     version is superseded or the package closed, rejected or withdrawn (the route (d) names).
  SELECT EXISTS (SELECT 1 FROM objects.canonical_objects o2
                  WHERE o2.object_id = p_evd_object_id AND o2.object_version > v_max AND o2.lifecycle_state IN ('admitted', 'active')
                    AND (o2.payload ->> 'manifest_id') IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM observation.blob_manifests bm2 JOIN observation.blob_tombstones t ON t.manifest_id = bm2.manifest_id WHERE bm2.manifest_id = (o2.payload ->> 'manifest_id')::uuid)
                    AND (o2.payload ->> 'content_digest') IS DISTINCT FROM p_content_digest) INTO v_successor;
  IF NOT v_successor THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'briefing', 'ref', d.dependent_object_id::text, 'version_aware', false, 'dependency_id', d.dependency_id::text,
                                                 'route', 'the briefing names the evidence object and no later version carries servable bytes: compose the next briefing of the line (it names this one as prior_briefing_id) or close, reject or withdraw the room''s decision package; then resolve again') ORDER BY d.created_at, d.dependency_id), '[]'::jsonb) INTO v_part
      FROM graph.dependencies d
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_kind = 'evidence' AND d.depends_on_id = p_evd_object_id
       AND d.dependent_type = 'BRF'
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) z WHERE z ->> 'kind' = 'briefing' AND z ->> 'ref' = d.dependent_object_id::text)
       AND EXISTS (SELECT 1 FROM executive.briefings b WHERE b.briefing_id = d.dependent_object_id
                     AND NOT EXISTS (SELECT 1 FROM executive.briefings n WHERE n.prior_briefing_id = b.briefing_id)
                     AND (b.package_id IS NULL OR EXISTS (SELECT 1 FROM decision.packages_current p WHERE p.package_id = b.package_id AND p.state NOT IN ('closed', 'rejected', 'withdrawn'))));
    v_out := v_out || v_part;
  END IF;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.load_bearing_references(uuid,uuid,uuid,bigint[],text) FROM PUBLIC;

-- resolve_scope re-declared (the 0068 §6 body with the evidence branch replaced): a review, an archive and a customer export are scoped by
-- PRESERVATION; the export's redaction gate reads the stricter of the manifest's classification and the exported record's (the latest EVD
-- version naming the manifest — what the package carries), the data-rights gate is an exclusion with its reason; an id of a chosen object
-- set that resolves to no non-tombstoned evidence manifest of this domain is an EXCLUDED item with that reason (never silently dropped);
-- a DELETION retires the bytes of an evidence OBJECT whose latest version is corrected, superseded or withdrawn — decided on the object's
-- latest version, not on the latest version naming the manifest (a revision admits the next version under a new manifest and leaves the
-- earlier one admitted); a deletion item whose evidence version is load-bearing is 'blocking' with the dependents named (the residual
-- inventory unchanged); the log-partition branch is 0068's verbatim.
CREATE OR REPLACE FUNCTION retention.resolve_scope(p_action_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, graph, intelligence, executive, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; m RECORD; v_hold uuid; v_items int := 0; v_held int := 0; v_blocking int := 0; v_execute int := 0; v_excluded int := 0; v_digest text; v_state text;
        v_partition text; v_to bigint; v_floor bigint; v_next bigint; v_ord int := 0; r RECORD; v_summary jsonb;
        v_preserving boolean; v_ceiling text; v_rights text; v_tier text; v_versions bigint[]; v_dependents jsonb; v_names text := ''; v_base jsonb;
        v_class text; v_resolved text[] := ARRAY[]::text[]; v_unresolved text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention action rejected: % is not open in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state NOT IN ('opened', 'scope_resolved', 'held', 'paused') THEN RAISE EXCEPTION 'retention action rejected: % is %, its scope is not resolved again', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  DELETE FROM retention.scope_items WHERE action_id = p_action_id;
  DELETE FROM retention.residual_inventory WHERE action_id = p_action_id;
  IF a.target_kind = 'evidence' THEN
    -- A review, an archive and a customer export are scoped by PRESERVATION (0068 §6): every manifest the selector names, whatever its evidence
    -- state. A deletion is scoped by retirement: the source selector covers corrected, superseded or withdrawn evidence only.
    v_preserving := a.kind IN ('review', 'archive', 'customer_export');
    IF a.kind = 'customer_export' THEN
      v_ceiling := a.selector ->> 'classification_ceiling';
      IF v_ceiling IS NULL OR v_ceiling NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'retention action rejected: a customer export names its classification ceiling (public, internal, confidential, restricted)' USING ERRCODE = '22023'; END IF;
      IF coalesce(a.selector ->> 'destination', 'export') <> 'export' THEN RAISE EXCEPTION 'retention action rejected: the export destination is the export namespace of the vault (destination export)' USING ERRCODE = '22023'; END IF;
    END IF;
    FOR m IN
      SELECT DISTINCT bm.manifest_id, bm.locator, bm.source_id, bm.contract_version, bm.created_at, bm.legal_hold, bm.byte_length, bm.content_digest, bm.classification,
             lv.object_id AS evd_object_id, lv.object_version AS evd_version, lv.lifecycle_state AS evd_state, lv.classification AS record_classification,
             ov.lifecycle_state AS object_state, ov.object_version AS object_version
        FROM observation.blob_manifests bm
        -- the latest EVD version NAMING the manifest (the record an export carries; the version set V(M) starts from its object) …
        LEFT JOIN LATERAL (SELECT o.object_id, o.object_version, o.lifecycle_state, o.classification FROM objects.canonical_objects o
                            WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = bm.manifest_id
                            ORDER BY o.object_version DESC LIMIT 1) lv ON true
        -- … and the OBJECT's latest version, which decides whether the evidence is current (a revision keeps the earlier version admitted under its own manifest).
        LEFT JOIN LATERAL (SELECT o.object_version, o.lifecycle_state FROM objects.canonical_objects o WHERE o.object_id = lv.object_id ORDER BY o.object_version DESC LIMIT 1) ov ON true
       WHERE bm.tenant_id = p_tenant AND bm.domain_id = p_domain AND bm.vault = 'evidence'
         AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = bm.manifest_id)
         AND ((a.selector ->> 'manifest_id') IS NOT NULL AND bm.manifest_id = (a.selector ->> 'manifest_id')::uuid
              OR (a.selector ->> 'manifest_id') IS NULL AND jsonb_typeof(a.selector -> 'manifest_ids') = 'array'
                  AND bm.manifest_id::text IN (SELECT lower(btrim(x)) FROM jsonb_array_elements_text(a.selector -> 'manifest_ids') x)
              OR (a.selector ->> 'manifest_id') IS NULL AND jsonb_typeof(a.selector -> 'manifest_ids') IS DISTINCT FROM 'array'
                  AND (a.selector ->> 'source_id') IS NOT NULL AND bm.source_id = (a.selector ->> 'source_id')::uuid
                  AND (v_preserving OR ov.lifecycle_state IN ('corrected', 'superseded', 'withdrawn')))
       ORDER BY bm.created_at, bm.manifest_id
    LOOP
      v_ord := v_ord + 1; v_items := v_items + 1; v_resolved := v_resolved || m.manifest_id::text;
      SELECT h.hold_id INTO v_hold FROM observation.legal_holds h WHERE (h.manifest_id = m.manifest_id OR (m.evd_object_id IS NOT NULL AND h.evd_object_id = m.evd_object_id)) AND h.lifted_at IS NULL ORDER BY h.placed_at LIMIT 1;
      v_tier := observation.manifest_tier(m.manifest_id);
      v_base := jsonb_build_object('locator', m.locator, 'evd_object_id', m.evd_object_id, 'evd_version', m.evd_version, 'byte_length', m.byte_length, 'content_digest', m.content_digest,
                                   'evd_state', m.evd_state, 'object_version', m.object_version, 'object_state', m.object_state, 'legal_hold', m.legal_hold OR v_hold IS NOT NULL, 'tier', v_tier,
                                   'classification', m.classification, 'record_classification', m.record_classification);
      IF a.kind = 'review' THEN
        v_execute := v_execute + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', v_hold,
                'reviewed in place: the record and its bytes are kept (its evidence is ' || coalesce(m.evd_state, 'unknown') || ')' || CASE WHEN m.legal_hold OR v_hold IS NOT NULL THEN '; under a legal hold, which the review honours by keeping it' ELSE '' END, v_base);
      ELSIF a.kind = 'archive' THEN
        IF v_tier = 'archive' THEN
          v_excluded := v_excluded + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded', v_hold, 'already in the archive tier; an archive moves hot bytes only', v_base);
        ELSE
          v_execute := v_execute + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', v_hold,
                  'archived: the manifest and its digest are kept, the bytes move from the hot tier to the archive tier (its evidence is ' || coalesce(m.evd_state, 'unknown') || ')' || CASE WHEN m.legal_hold OR v_hold IS NOT NULL THEN '; under a legal hold, which the archive honours by preserving it' ELSE '' END, v_base);
        END IF;
      ELSIF a.kind = 'customer_export' THEN
        SELECT s.rights_state INTO v_rights FROM observation.source_contracts_current s WHERE s.source_id = m.source_id AND s.contract_version = m.contract_version;
        -- The REDACTION gate reads the stricter of the manifest's classification (the contract ceiling copied at admission) and the exported
        -- record's (the latest EVD version naming the manifest may have been re-versioned under a higher classification).
        v_class := CASE WHEN decision.classification_rank(coalesce(m.record_classification, m.classification)) > decision.classification_rank(m.classification) THEN m.record_classification ELSE m.classification END;
        IF decision.classification_rank(v_class) > decision.classification_rank(v_ceiling) THEN
          v_excluded := v_excluded + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded', v_hold,
                  'redaction gate: classification ' || v_class || CASE WHEN v_class IS DISTINCT FROM m.classification THEN ' (the exported record''s version ' || m.evd_version || '; the manifest''s is ' || m.classification || ')' ELSE '' END || ' is above the export ceiling ' || v_ceiling,
                  v_base || jsonb_build_object('gate', 'redaction', 'gated_on', CASE WHEN v_class IS DISTINCT FROM m.classification THEN 'record' ELSE 'manifest' END));
        ELSIF v_rights IS DISTINCT FROM 'confirmed' THEN
          v_excluded := v_excluded + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded', v_hold,
                  'data-rights gate: the rights of source contract ' || m.source_id::text || '@' || m.contract_version || ' are ' || coalesce(v_rights, 'unknown') || '; confirmed rights permit reuse', v_base || jsonb_build_object('gate', 'data_rights', 'rights_state', v_rights));
        ELSE
          v_execute := v_execute + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', v_hold,
                  'packaged: the canonical record and the bytes are copied into the export package; the source is untouched' || CASE WHEN m.legal_hold OR v_hold IS NOT NULL THEN '; under a legal hold, which an export leaves in place' ELSE '' END, v_base || jsonb_build_object('rights_state', v_rights));
        END IF;
      ELSIF m.object_state IS NULL OR m.object_state NOT IN ('corrected', 'superseded', 'withdrawn') THEN
        -- Currency is the evidence OBJECT's: its latest version admitted means the object is current, whatever version names this manifest.
        v_excluded := v_excluded + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'excluded',
                'the evidence object resting on these bytes is current (its latest version ' || coalesce(m.object_version::text, '?') || ' is ' || coalesce(m.object_state, 'unknown') || '); a deletion retires corrected, superseded or withdrawn evidence only — correct or withdraw it first', v_base);
      ELSIF m.legal_hold OR v_hold IS NOT NULL THEN
        v_held := v_held + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, hold_id, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'held', v_hold, 'a legal hold takes precedence over deletion (AU-MEM-0060)', v_base);
      ELSE
        -- SAFE SCOPE (V03-T-100; AU-MEM-0061): the bytes of this manifest are retired only when no live reference rests on the evidence versions that name it.
        -- V(M) = the versions of the manifest's evidence object whose payload names it (one manifest lineage per object — D9), by the object's primary key.
        SELECT coalesce(array_agg(o.object_version ORDER BY o.object_version), ARRAY[]::bigint[]) INTO v_versions FROM objects.canonical_objects o
         WHERE o.object_id = m.evd_object_id AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.manifest_id;
        v_dependents := CASE WHEN m.evd_object_id IS NULL THEN '[]'::jsonb ELSE retention.load_bearing_references(p_tenant, p_domain, m.evd_object_id, v_versions, m.content_digest) END;
        IF jsonb_array_length(v_dependents) > 0 THEN
          v_blocking := v_blocking + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'blocking',
                  'the referential scope cannot be proven safe: ' || jsonb_array_length(v_dependents) || ' live reference(s) rest on this evidence version (details.dependents); retire, decide, supersede or close them, then resolve again',
                  v_base || jsonb_build_object('versions', to_jsonb(v_versions), 'dependents', v_dependents));
          v_names := v_names || CASE WHEN v_names = '' THEN '' ELSE '; ' END || 'manifest ' || m.manifest_id::text || ' ← ' ||
                     (SELECT string_agg((d ->> 'kind') || ':' || (d ->> 'ref'), ', ') FROM jsonb_array_elements(v_dependents) d);
        ELSE
          v_execute := v_execute + 1;
          INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
          VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', m.manifest_id::text, v_ord, 'execute', 'superseded evidence bytes past their retention; no live reference rests on this version', v_base || jsonb_build_object('versions', to_jsonb(v_versions)));
        END IF;
      END IF;
      -- Residuals that policy retains whatever the deletion does — UNCHANGED for the non-blocking references (a blocking item keeps its inventory too: it says what stays when the deletion eventually runs).
      IF m.evd_object_id IS NOT NULL AND a.kind = 'deletion' THEN
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'claim_lineage', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'the claims extracted from this evidence keep their lineage rows (accountability); the bytes are gone, the record of their reading stays'
          FROM intelligence.claim_lineage l WHERE l.evidence_object_id = m.evd_object_id HAVING count(*) > 0;
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'dependency', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'objects resting on this evidence keep their dependency rows (the impact set remains addressable)'
          FROM graph.dependencies d WHERE d.depends_on_kind = 'evidence' AND d.depends_on_id = m.evd_object_id AND d.state = 'active' HAVING count(*) > 0;
        INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
        SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'canonical_version', m.evd_object_id::text, count(*)::int, 'retained_by_policy', 'the evidence object''s canonical versions (header, digest, custody) stay: a tombstone, never an erasure of the record'
          FROM objects.canonical_objects o WHERE o.object_id = m.evd_object_id HAVING count(*) > 0;
      END IF;
    END LOOP;
    -- A CHOSEN OBJECT SET (an archive's or an export's manifest_ids): every id the selector names that resolved to no row above — unknown,
    -- tombstoned, or a manifest of another domain (not disclosed which) — is an EXCLUDED item with that reason, counted, in the digest and in
    -- the package's excluded list; nothing requested vanishes from the record.
    IF (a.selector ->> 'manifest_id') IS NULL AND jsonb_typeof(a.selector -> 'manifest_ids') = 'array' THEN
      FOR v_unresolved IN SELECT DISTINCT lower(btrim(x)) FROM jsonb_array_elements_text(a.selector -> 'manifest_ids') x WHERE lower(btrim(x)) <> ALL (v_resolved) ORDER BY 1 LOOP
        v_ord := v_ord + 1; v_items := v_items + 1; v_excluded := v_excluded + 1;
        INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest', v_unresolved, v_ord, 'excluded',
                'resolution gate: the id names no non-tombstoned evidence manifest of this domain (unknown, tombstoned, or outside this domain)',
                jsonb_build_object('gate', 'resolution', 'requested_as', v_unresolved));
      END LOOP;
    END IF;
    v_state := CASE WHEN v_items = 0 THEN 'paused' WHEN v_blocking > 0 THEN 'paused' WHEN v_execute = 0 AND v_held > 0 THEN 'held' WHEN v_execute = 0 THEN 'paused' ELSE 'scope_resolved' END;
  ELSE
    v_partition := a.selector ->> 'partition_key'; v_to := (a.selector ->> 'to_seq')::bigint;
    SELECT p.retained_from_seq, p.next_seq INTO v_floor, v_next FROM objects.outbox_partitions p WHERE p.partition_key = v_partition;
    IF v_floor IS NULL THEN RAISE EXCEPTION 'retention action rejected: partition % has no row', v_partition USING ERRCODE = '23503'; END IF;
    IF v_to IS NULL OR v_to <= v_floor OR v_to > v_next THEN RAISE EXCEPTION 'retention action rejected: to_seq % must lie above the floor % and at most the next sequence %', v_to, v_floor, v_next USING ERRCODE = '22023'; END IF;
    v_ord := 1; v_items := 1;
    -- The range itself: published rows below the new floor by status.
    SELECT count(*) FILTER (WHERE status = 'published') AS published, count(*) FILTER (WHERE status IN ('pending', 'failed')) AS unpublished, count(*) FILTER (WHERE status = 'dead_letter') AS dead INTO r
      FROM objects.object_outbox o WHERE o.partition_key = v_partition AND o.partition_seq >= v_floor AND o.partition_seq < v_to;
    INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'outbox_range', v_partition || ':' || v_floor || '-' || (v_to - 1), 1, 'execute', 'the retained floor moves to this sequence; replay below it is no longer guaranteed', jsonb_build_object('from_seq', v_floor, 'to_seq', v_to, 'published', r.published, 'unpublished', r.unpublished, 'dead_letter', r.dead));
    v_execute := 1;
    -- Blocks (DP-54-005, "pause unsafe deletion"): unpublished history below the floor; a subscription served from, or checkpointed, below it.
    IF r.unpublished + r.dead > 0 THEN
      v_ord := v_ord + 1; v_items := v_items + 1; v_blocking := v_blocking + 1;
      INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'unpublished_row', v_partition, v_ord, 'blocking', 'rows below the new floor are not yet published (or dead-lettered): history the log has not delivered is not retired', jsonb_build_object('unpublished', r.unpublished, 'dead_letter', r.dead));
    END IF;
    FOR m IN SELECT s.subscription_id, s.consumer_kind, s.served_from_seq, s.checkpoint_seq FROM graph.subscriptions s
              WHERE s.tenant_id = p_tenant AND s.status <> 'revoked' AND (s.served_from_seq < v_to OR (s.checkpoint_seq IS NOT NULL AND s.checkpoint_seq < v_to - 1))
              ORDER BY s.consumer_kind LOOP
      v_ord := v_ord + 1; v_items := v_items + 1; v_blocking := v_blocking + 1;
      INSERT INTO retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition, reason, details)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'subscription_cursor', m.subscription_id::text, v_ord, 'blocking', 'a subscription is served from, or checkpointed, below the new floor: moving it would cut history the subscription is owed (replay it to the floor first, or let it catch up)', jsonb_build_object('consumer_kind', m.consumer_kind, 'served_from_seq', m.served_from_seq, 'checkpoint_seq', m.checkpoint_seq));
    END LOOP;
    -- Residuals by policy: the delivery and attempt ledgers keep the event ids they reference below the floor.
    INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'delivery_ledger', v_partition, count(*)::int, 'retained_by_policy', 'delivery ledger rows keep the ids of events below the floor (accountability; no foreign key to the log)'
      FROM graph.subscription_deliveries d JOIN objects.object_outbox o ON o.id = d.event_id WHERE o.partition_key = v_partition AND o.partition_seq < v_to HAVING count(*) > 0;
    INSERT INTO retention.residual_inventory (residual_id, scope, tenant_id, domain_id, action_id, kind, ref, count, status, note)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'propagation_ledger', v_partition, count(*)::int, 'retained_by_policy', 'propagation attempt rows keep the ids of events below the floor'
      FROM graph.propagation_attempts d JOIN objects.object_outbox o ON o.id = d.event_id WHERE o.partition_key = v_partition AND o.partition_seq < v_to HAVING count(*) > 0;
    v_state := CASE WHEN v_blocking > 0 THEN 'paused' ELSE 'scope_resolved' END;
  END IF;
  -- The digest the approval signs: the ordered items with their dispositions (blocking enters it through the disposition, so a route that releases an item changes the digest).
  SELECT encode(sha256(convert_to(coalesce(string_agg(i.item_kind || '|' || i.ref || '|' || i.disposition || '|' || coalesce(i.hold_id::text, ''), E'\n' ORDER BY i.dependency_order, i.ref), ''), 'UTF8')), 'hex') INTO v_digest
    FROM retention.scope_items i WHERE i.action_id = p_action_id;
  v_summary := jsonb_build_object('items', v_items, 'execute', v_execute, 'held', v_held, 'blocking', v_blocking, 'excluded', v_excluded,
                                  'residuals', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'count', ri.count, 'status', ri.status)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id));
  UPDATE retention.actions_current
     SET state = v_state, scope_digest = v_digest, scope_summary = v_summary, resolved_at = clock_timestamp(),
         failure_class = CASE v_state WHEN 'held' THEN 'legal_hold' WHEN 'paused' THEN 'unresolved_dependency' ELSE NULL END,
         disposition = CASE v_state WHEN 'held' THEN 'challenge' WHEN 'paused' THEN 'human_review' ELSE NULL END,
         failure_reason = CASE v_state WHEN 'held' THEN 'every item in scope is under a legal hold'
                                       WHEN 'paused' THEN CASE WHEN v_items = 0 THEN 'nothing in scope: the selector resolves to no ' || CASE WHEN a.kind = 'deletion' THEN 'superseded evidence' ELSE 'evidence' END
                                                               WHEN v_blocking > 0 AND a.target_kind = 'evidence' THEN 'the scope cannot be retired safely: ' || v_blocking || ' blocking item(s) — ' || v_names
                                                               WHEN v_blocking > 0 THEN 'the scope cannot be retired safely: ' || v_blocking || ' blocking item(s)'
                                                               WHEN a.kind = 'customer_export' THEN 'nothing exportable in scope: every object is excluded (the redaction gate, the data-rights gate, or an id naming no manifest of this domain)'
                                                               WHEN a.kind = 'archive' THEN 'nothing to archive: every manifest in scope is already in the archive tier, or an id names no manifest of this domain'
                                                               ELSE 'nothing executes: every item in scope is excluded' END
                                       ELSE NULL END
   WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, CASE v_state WHEN 'held' THEN 'action.held' WHEN 'paused' THEN 'action.paused' ELSE 'scope.resolved' END, p_actor, v_summary || jsonb_build_object('scope_digest', v_digest), p_correlation);
  RETURN v_summary || jsonb_build_object('state', v_state, 'scope_digest', v_digest);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.resolve_scope(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.resolve_scope(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §5 execution: every kind executes; the export's rights re-checked; the pause with a failure class
-- ============================================================
-- Every precondition the resolution proved is re-checked HERE, before the state moves, because an approval lives 30 days and the world moves
-- under it: the export's data rights (D11; the contract rows are share-locked so a withdrawal commits before or after the export, never inside
-- its build), a tombstone on an archive's or an export's manifest (there are no bytes to move or to package), and a DELETION's safe referential
-- scope (a reference created inside the approval window — a challenge queued, an edge asserted, a briefing composed, a package proposed — makes
-- the bytes load-bearing again; the same standard the hold has at the tombstone port). Each refusal names its class in the message; the
-- controller turns it into a pause (rights_changed → authority_disputed; scope_changed / references_changed → unresolved_dependency, human
-- review) with the approvals revoked, so the scope is resolved again with the dependents named.
CREATE OR REPLACE FUNCTION retention.begin_execution(p_action_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; v_live int; v_withdrawn text; v_tombstoned text; m RECORD; v_versions bigint[]; v_dependents jsonb; v_names text := '';
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'approved' THEN RAISE EXCEPTION 'retention execution rejected: % is % — only an approved action executes', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention execution rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  -- B11: every kind has an executor — a deletion (the tombstone port), the log floor (the outbox port), a review (the record), an archive (the
  -- archive port after the copy), a customer export (the package record after the files). The guard stays for a kind the catalogue may add later.
  IF a.kind NOT IN ('deletion', 'log_floor', 'review', 'archive', 'customer_export') THEN RAISE EXCEPTION 'retention execution rejected: a % action has no executor in this release', a.kind USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_live FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.scope_digest = a.scope_digest AND ap.revoked_at IS NULL AND ap.expires_at > clock_timestamp();
  IF v_live < 1 THEN RAISE EXCEPTION 'retention execution rejected: no live approval on the resolved scope' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.approver_principal_id = p_actor AND ap.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'retention execution rejected: an approver of the action does not execute it' USING ERRCODE = '42501';
  END IF;
  -- An ARCHIVE or an EXPORT of a manifest tombstoned since the approval: there are no bytes to move or to package; the scope is resolved again (the tombstoned manifest leaves it).
  IF a.kind IN ('archive', 'customer_export') THEN
    SELECT string_agg(si.ref, ', ' ORDER BY si.dependency_order) INTO v_tombstoned
      FROM retention.scope_items si
     WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute'
       AND EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = si.ref::uuid);
    IF v_tombstoned IS NOT NULL THEN
      RAISE EXCEPTION 'retention execution rejected (scope_changed): manifest(s) in the approved scope were tombstoned since the approval — %; the scope is resolved again', v_tombstoned USING ERRCODE = '22023';
    END IF;
  END IF;
  -- The export's DATA-RIGHTS gate re-checked AT EXECUTION (the rights may have been withdrawn since the approval): the executor rolls back and
  -- pauses (authority_disputed). The contract rows are locked FOR SHARE first, so a withdrawal that commits inside the package build is impossible:
  -- it either committed before this read (refused here) or waits behind the export's commit (the package was built under confirmed rights).
  IF a.kind = 'customer_export' THEN
    PERFORM 1 FROM observation.source_contracts_current s
      WHERE (s.source_id, s.contract_version) IN (SELECT bm.source_id, bm.contract_version FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
                                                    WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute')
      FOR SHARE;
    SELECT string_agg(DISTINCT bm.source_id::text || '@' || bm.contract_version || ' (' || s.rights_state || ')', ', ') INTO v_withdrawn
      FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
      JOIN observation.source_contracts_current s ON s.source_id = bm.source_id AND s.contract_version = bm.contract_version
     WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' AND s.rights_state <> 'confirmed';
    IF v_withdrawn IS NOT NULL THEN
      RAISE EXCEPTION 'retention execution rejected (rights_changed): the rights of a source in the approved scope are no longer confirmed — %; the scope is resolved again', v_withdrawn USING ERRCODE = '22023';
    END IF;
  END IF;
  -- A DELETION's SAFE SCOPE re-proven at execution (V03-T-100): the references are computed as the resolution computed them (the versions
  -- naming the manifest, the manifest's digest); any dependent now means the bytes are load-bearing and the tombstone is refused before it is written.
  IF a.kind = 'deletion' THEN
    FOR m IN SELECT si.ref, si.details FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order LOOP
      CONTINUE WHEN (m.details ->> 'evd_object_id') IS NULL;
      SELECT coalesce(array_agg(o.object_version ORDER BY o.object_version), ARRAY[]::bigint[]) INTO v_versions FROM objects.canonical_objects o
       WHERE o.object_id = (m.details ->> 'evd_object_id')::uuid AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.ref::uuid;
      v_dependents := retention.load_bearing_references(p_tenant, p_domain, (m.details ->> 'evd_object_id')::uuid, v_versions, m.details ->> 'content_digest');
      IF jsonb_array_length(v_dependents) > 0 THEN
        v_names := v_names || CASE WHEN v_names = '' THEN '' ELSE '; ' END || 'manifest ' || m.ref || ' ← ' || (SELECT string_agg((d ->> 'kind') || ':' || (d ->> 'ref'), ', ') FROM jsonb_array_elements(v_dependents) d);
      END IF;
    END LOOP;
    IF v_names <> '' THEN
      RAISE EXCEPTION 'retention execution rejected (references_changed): a live reference was created on the approved scope since it was resolved — %; the scope is resolved again', v_names USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE retention.actions_current SET state = 'executing' WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'execution.started', p_actor, jsonb_build_object('scope_digest', a.scope_digest), p_correlation);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'item_kind', i.item_kind, 'ref', i.ref, 'disposition', i.disposition, 'hold_id', i.hold_id, 'details', i.details) ORDER BY i.dependency_order), '[]'::jsonb)
            FROM retention.scope_items i WHERE i.action_id = p_action_id);
END $$ LANGUAGE plpgsql;

-- The pause with its failure class (0067 §1's port kept as the legal-hold form).
CREATE OR REPLACE FUNCTION retention.pause_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_failure_class text, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention execution rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_failure_class NOT IN ('legal_hold', 'unresolved_dependency', 'authority_disputed', 'infrastructure') THEN RAISE EXCEPTION 'retention execution rejected: the failure class is legal_hold, unresolved_dependency, authority_disputed or infrastructure' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'approved' THEN RAISE EXCEPTION 'retention execution rejected: % is % — only an approved action pauses at execution', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  UPDATE retention.actions_current SET state = 'paused', failure_class = p_failure_class, disposition = CASE WHEN p_failure_class = 'infrastructure' THEN 'retry' ELSE 'human_review' END, failure_reason = p_reason WHERE action_id = p_action_id;
  UPDATE retention.approvals SET revoked_at = clock_timestamp(), revoke_reason = 'the execution was rolled back: ' || left(p_reason, 200) WHERE action_id = p_action_id AND revoked_at IS NULL;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.paused', p_actor, jsonb_build_object('reason', p_reason, 'failure_class', p_failure_class, 'approvals_revoked', true), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.pause_action(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.pause_action(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;
CREATE OR REPLACE FUNCTION retention.pause_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM retention.pause_action(p_action_id, p_tenant, p_domain, 'legal_hold', p_reason, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §6 verification: the archive and export contracts
-- ============================================================
-- The 0068 §2 body with two branches added inside the loop and one package-level check after it; the review, deletion, held and floor branches
-- and the residual closure are verbatim. p_observed per manifest ref: bytes_present means the HOT tier for an archive action and the manifest's
-- CURRENT tier for every other kind; an archive adds archive_present / archive_digest_ok; an export adds export_present / export_digest_ok and
-- the key __package__.
CREATE OR REPLACE FUNCTION retention.verify_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_observed jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; i RECORD; xp retention.export_packages%ROWTYPE; v_pass boolean; v_all boolean := true; v_checks jsonb := '[]'::jsonb; v_floor bigint; v_pending int; v_state text; ob jsonb; v_done boolean; v_tier text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.verify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention verification rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'executed' THEN RAISE EXCEPTION 'retention verification rejected: % is % — only an executed action is verified', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  FOR i IN SELECT * FROM retention.scope_items x WHERE x.action_id = p_action_id ORDER BY x.dependency_order LOOP
    ob := coalesce(p_observed -> i.ref, '{}'::jsonb);
    v_done := EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done');
    IF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'review' THEN
      -- B9-F3: a REVIEW's contract is PRESERVATION — the manifest untouched (no tombstone), its bytes present, and the review recorded.
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, false) = true
                AND EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done');
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': reviewed — untouched, its bytes present', jsonb_build_object('tombstone', false, 'bytes_present', true, 'reviewed', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present', 'reviewed', EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done')), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'archive' THEN
      -- The ARCHIVE contract: no tombstone; the tier recorded as archive; the bytes present in the archive tier under the manifest's digest; the hot copy gone; the move recorded.
      v_tier := observation.manifest_tier(i.ref::uuid);
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND v_tier = 'archive'
                AND coalesce((ob ->> 'bytes_present')::boolean, true) = false
                AND coalesce((ob ->> 'archive_present')::boolean, false) = true AND coalesce((ob ->> 'archive_digest_ok')::boolean, false) = true AND v_done;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': archived — bytes in the archive tier under the manifest''s digest, absent from the hot tier, the tier recorded',
              jsonb_build_object('tombstone', false, 'tier', 'archive', 'bytes_present', false, 'archive_present', true, 'archive_digest_ok', true, 'archived', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'tier', v_tier, 'bytes_present', ob -> 'bytes_present', 'archive_present', ob -> 'archive_present', 'archive_digest_ok', ob -> 'archive_digest_ok', 'archived', v_done, 'hold_id', i.hold_id), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'customer_export' THEN
      -- The EXPORT contract is the PACKAGE's: the object's file present in the package under the manifest's digest and the export recorded.
      -- The source's state NOW (a tombstone, its bytes present in its tier) is observed and recorded beside it, not required: an export left
      -- the source untouched at its execution (no executor of an export removes anything), and a governed deletion of the source afterwards
      -- is its own record — it must not leave the export unverifiable for good.
      v_pass := coalesce((ob ->> 'export_present')::boolean, false) = true AND coalesce((ob ->> 'export_digest_ok')::boolean, false) = true AND v_done;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': exported — listed in the package with its bytes present under the manifest''s digest (the source''s present state recorded, not required)',
              jsonb_build_object('export_present', true, 'export_digest_ok', true, 'exported', true),
              jsonb_build_object('export_present', ob -> 'export_present', 'export_digest_ok', ob -> 'export_digest_ok', 'exported', v_done, 'hold_id', i.hold_id,
                                 'source_now', jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present')), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' THEN
      -- The deletion check (0066/0068 verbatim): tombstoned and bytes_present false — the observer reports the manifest's CURRENT tier, so a deletion of archived bytes verifies against the archive root.
      v_pass := EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, true) = false;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': tombstoned and its bytes gone', jsonb_build_object('tombstone', true, 'bytes_present', false),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present'), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'held' THEN
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, false) = true;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': held — untouched, its bytes present', jsonb_build_object('tombstone', false, 'bytes_present', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present', 'hold_id', i.hold_id), v_pass, p_actor);
    ELSIF i.item_kind = 'outbox_range' THEN
      SELECT p.retained_from_seq INTO v_floor FROM objects.outbox_partitions p WHERE p.partition_key = a.selector ->> 'partition_key';
      v_pass := v_floor >= (a.selector ->> 'to_seq')::bigint; -- a later action may have moved the floor further (B9 review)
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'the retained floor of ' || (a.selector ->> 'partition_key') || ' stands at to_seq or beyond', jsonb_build_object('retained_from_seq', (a.selector ->> 'to_seq')::bigint), jsonb_build_object('retained_from_seq', v_floor), v_pass, p_actor);
    ELSE
      CONTINUE;
    END IF;
    v_all := v_all AND v_pass;
    v_checks := v_checks || jsonb_build_object('item', i.ref, 'kind', i.item_kind, 'disposition', i.disposition, 'passed', v_pass);
  END LOOP;
  IF a.kind = 'customer_export' THEN
    -- The PACKAGE: manifest.json present, its file digest and the package digest as recorded, every listed object present and nothing unlisted, not revoked.
    SELECT * INTO xp FROM retention.export_packages e WHERE e.action_id = p_action_id;
    ob := coalesce(p_observed -> '__package__', '{}'::jsonb);
    v_pass := xp.action_id IS NOT NULL AND xp.revoked_at IS NULL AND coalesce((ob ->> 'manifest_present')::boolean, false) = true
              AND ob ->> 'manifest_digest' = xp.manifest_digest AND ob ->> 'package_digest' = xp.package_digest
              AND coalesce((ob ->> 'objects_listed')::int, -1) = xp.object_count AND coalesce((ob ->> 'files_present')::int, -1) = xp.object_count + 1;
    INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'the export package: manifest.json present with the recorded digests, every listed object present and nothing unlisted, not revoked',
            jsonb_build_object('manifest_present', true, 'manifest_digest', xp.manifest_digest, 'package_digest', xp.package_digest, 'objects_listed', xp.object_count, 'files_present', xp.object_count + 1, 'revoked', false),
            ob || jsonb_build_object('revoked', xp.revoked_at IS NOT NULL, 'recorded', xp.action_id IS NOT NULL), coalesce(v_pass, false), p_actor);
    v_all := v_all AND coalesce(v_pass, false);
    v_checks := v_checks || jsonb_build_object('item', '__package__', 'kind', 'export_package', 'disposition', 'execute', 'passed', coalesce(v_pass, false));
  END IF;
  IF NOT v_all THEN
    UPDATE retention.actions_current SET failure_class = 'infrastructure', disposition = 'retry', failure_reason = 'a verification check failed; the action stays executed until it passes' WHERE action_id = p_action_id;
    PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.failed', p_actor, jsonb_build_object('checks', v_checks, 'verification', 'failed'), p_correlation);
    RETURN jsonb_build_object('state', 'executed', 'verified', false, 'checks', v_checks);
  END IF;
  -- A bytes residual the executor recorded (the vault refused the removal after the record committed) closes when the bytes are observed gone (B9 review).
  UPDATE retention.residual_inventory ri SET status = 'retained_by_policy', note = coalesce(ri.note, '') || '; bytes observed gone at verification ' || clock_timestamp()::text
   WHERE ri.action_id = p_action_id AND ri.kind = 'bytes_present' AND ri.status = 'pending'
     AND coalesce(((p_observed -> ri.ref) ->> 'bytes_present')::boolean, true) = false;
  SELECT count(*) INTO v_pending FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id AND ri.status = 'pending';
  v_state := CASE WHEN v_pending > 0 THEN 'verified_with_residuals' ELSE 'verified' END;
  UPDATE retention.actions_current
     SET state = v_state, verified_at = clock_timestamp(), closed_at = clock_timestamp(), failure_class = NULL, disposition = NULL, failure_reason = NULL,
         residual_summary = (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'ref', ri.ref, 'count', ri.count, 'status', ri.status, 'note', ri.note)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id)
   WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, CASE WHEN v_pending > 0 THEN 'verification.residuals' ELSE 'verification.passed' END, p_actor, jsonb_build_object('checks', v_checks, 'residuals_pending', v_pending), p_correlation);
  RETURN jsonb_build_object('state', v_state, 'verified', true, 'checks', v_checks,
    'scope_digest', a.scope_digest, 'kind', a.kind, 'target_kind', a.target_kind, 'selector', a.selector,
    'authorized_by', (SELECT coalesce(jsonb_agg(ap.approval_id), '[]'::jsonb) FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.revoked_at IS NULL),
    'executed', (SELECT count(*) FROM retention.executions e WHERE e.action_id = p_action_id AND e.outcome = 'done'),
    'held', (SELECT count(*) FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.disposition = 'held'),
    'excluded', (SELECT count(*) FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.disposition = 'excluded'),
    'residual', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'count', ri.count, 'status', ri.status)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id));
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §7 schedules carry their selector keys
-- ============================================================
-- declare_schedule re-declared (0066's body + the D7 rules a schedule's actions must satisfy at resolution): a customer_export schedule
-- declares its classification_ceiling and binds the export namespace as its destination; a chosen object set is an action's selector, not
-- a schedule's. Refused at declaration — the alternative is a schedule that opens one permanently unresolvable action per due manifest.
CREATE OR REPLACE FUNCTION retention.declare_schedule(p_schedule_id uuid, p_tenant uuid, p_domain uuid, p_retention_profile text, p_target_kind text, p_action_kind text, p_due_after interval, p_selector jsonb, p_owner uuid, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_selector jsonb := coalesce(p_selector, '{}'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.schedule.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_due_after IS NULL OR p_due_after < interval '0' THEN RAISE EXCEPTION 'retention schedule rejected: due_after is a non-negative interval' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_selector) <> 'object' THEN RAISE EXCEPTION 'retention schedule rejected: the selector is an object' USING ERRCODE = '22023'; END IF;
  IF v_selector ? 'manifest_ids' OR v_selector ? 'manifest_id' THEN RAISE EXCEPTION 'retention schedule rejected: a schedule selects by retention profile and source; a chosen object set (manifest_ids) or a single manifest is an action''s selector' USING ERRCODE = '22023'; END IF;
  IF p_action_kind = 'customer_export' THEN
    IF coalesce(v_selector ->> 'classification_ceiling', '') NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'retention schedule rejected: a customer_export schedule names its classification_ceiling (public, internal, confidential, restricted)' USING ERRCODE = '22023'; END IF;
    IF coalesce(v_selector ->> 'destination', 'export') <> 'export' THEN RAISE EXCEPTION 'retention schedule rejected: the export destination is the export namespace of the vault (destination export)' USING ERRCODE = '22023'; END IF;
    v_selector := v_selector || jsonb_build_object('destination', 'export');
  END IF;
  INSERT INTO retention.schedules (schedule_id, scope, tenant_id, domain_id, retention_profile, target_kind, action_kind, due_after, selector, owner_principal_id, declared_by, correlation_id)
  VALUES (p_schedule_id, 'DOMAIN', p_tenant, p_domain, p_retention_profile, p_target_kind, p_action_kind, p_due_after, v_selector, coalesce(p_owner, p_actor), p_actor, p_correlation);
END $$ LANGUAGE plpgsql;

-- 0066's body with the actions a schedule opens carrying the schedule's selector keys beyond the source (a customer_export schedule declares
-- classification_ceiling and destination); the dedupe predicate (a.selector ->> 'manifest_id') is unchanged. An ARCHIVE schedule does not
-- re-open a manifest already in the archive tier (an archive moves hot bytes; a verified archive is a closed action, and the tier says the
-- rest). A customer_export schedule declared without a ceiling (before this migration validated it) opens nothing: the action it would open
-- could never be resolved, and its schedule has no retirement route.
CREATE OR REPLACE FUNCTION retention.evaluate_schedules(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s retention.schedules%ROWTYPE; m RECORD; v_action uuid; v_out jsonb := '[]'::jsonb; v_selector jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.schedule.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR s IN SELECT * FROM retention.schedules x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active' ORDER BY x.declared_at LOOP
    IF s.target_kind = 'evidence' AND NOT (s.action_kind = 'customer_export' AND coalesce(s.selector ->> 'classification_ceiling', '') NOT IN ('public', 'internal', 'confidential', 'restricted')) THEN
      -- Due: a manifest of this profile (optionally of the selector's source) created before now − due_after, not tombstoned,
      -- not already in the archive tier for an archive schedule, and not already the target of an open action of this kind.
      FOR m IN SELECT bm.manifest_id, bm.source_id, bm.created_at FROM observation.blob_manifests bm
                WHERE bm.tenant_id = p_tenant AND bm.domain_id = p_domain AND bm.vault = 'evidence' AND bm.retention_profile = s.retention_profile
                  AND (s.selector ->> 'source_id' IS NULL OR bm.source_id = (s.selector ->> 'source_id')::uuid)
                  AND bm.created_at <= clock_timestamp() - s.due_after
                  AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = bm.manifest_id)
                  AND (s.action_kind <> 'archive' OR observation.manifest_tier(bm.manifest_id) <> 'archive')
                  AND NOT EXISTS (SELECT 1 FROM retention.actions_current a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind = s.action_kind
                                    AND a.state NOT IN ('withdrawn', 'rejected', 'failed', 'verified', 'verified_with_residuals')
                                    AND a.selector ->> 'manifest_id' = bm.manifest_id::text)
                ORDER BY bm.created_at LOOP
        v_action := gen_random_uuid();
        v_selector := jsonb_build_object('manifest_id', m.manifest_id, 'source_id', m.source_id) || (coalesce(s.selector, '{}'::jsonb) - 'manifest_id' - 'source_id');
        INSERT INTO retention.actions_current (action_id, scope, tenant_id, domain_id, kind, target_kind, selector, schedule_id, retention_profile, due_from, opened_by, correlation_id)
        VALUES (v_action, 'DOMAIN', p_tenant, p_domain, s.action_kind, 'evidence', v_selector, s.schedule_id, s.retention_profile, m.created_at + s.due_after, p_actor, p_correlation);
        PERFORM retention.event(v_action, p_tenant, p_domain, 'action.opened', p_actor, jsonb_build_object('kind', s.action_kind, 'target_kind', 'evidence', 'selector', v_selector, 'schedule_id', s.schedule_id, 'due_from', m.created_at + s.due_after), p_correlation);
        v_out := v_out || jsonb_build_object('action_id', v_action, 'kind', s.action_kind, 'target_kind', 'evidence', 'selector', v_selector, 'schedule_id', s.schedule_id, 'retention_profile', s.retention_profile, 'due_from', m.created_at + s.due_after);
      END LOOP;
    END IF;
    UPDATE retention.schedules SET last_evaluated_at = clock_timestamp() WHERE schedule_id = s.schedule_id;
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §8 the interface register
-- ============================================================
UPDATE objects.interface_register SET bound_to = bound_to || '; B11 (0070): every kind the interface names executes — archive (observation.archive_blob, the archive tier of the vault), customer export (retention.record_export_package, a digest-chain-signed package under the export namespace, revocable by retention.revoke_export), review, deletion (paused while a live reference rests on the evidence version — retention.load_bearing_references) and the log floor'
  WHERE interface_id = 'L3-I04';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (26, 24, 0) THEN
    RAISE EXCEPTION 'interface register after 0070: expected 26 bound, 24 partial, 0 unbound; found %, %, %', v_bound, v_partial, v_unbound;
  END IF;
END $$;

-- ============================================================
-- §9 a withdrawal is its own named act
-- ============================================================
CREATE OR REPLACE FUNCTION retention.withdraw_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.withdraw', 'retention.action.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'retention withdrawal rejected: a reason of 8+ characters' USING ERRCODE = '22023'; END IF;
  UPDATE retention.actions_current SET state = 'withdrawn', closed_at = clock_timestamp(), failure_reason = p_reason
   WHERE action_id = p_action_id AND tenant_id = p_tenant AND domain_id = p_domain AND state IN ('opened', 'scope_resolved', 'held', 'paused', 'approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'retention withdrawal rejected: % is not withdrawable in its state', p_action_id USING ERRCODE = '22023'; END IF;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.withdrawn', p_actor, jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.withdraw_action(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.withdraw_action(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;
