-- ============================================================
-- 0028 — PHASE 4 · SOURCE CONTRACT v2: a declared backfill and an attribution notice.
--
-- The first forward migration of Phase 4 (Prediction + Scenario Intelligence).
-- Additive: 0022–0027 stand, SRC@v1 objects are untouched, and a contract that
-- declares neither new field is still admitted as SRC@v1.
--
--   §1  SRC@v2 — the v1 schema plus:
--         authority_and_rights.attribution   the notice a licence requires shown
--         security_and_operations.backfill   a closed-range traversal, declared
--   §2  a run may record `item.revised`: a re-walked window whose bytes changed,
--       admitted as the next VERSION of the evidence object already held
--
-- Why a declared backfill: the REST poller polls forward from a checkpoint and
-- has no end condition. A historical backfill walks a closed window in ordered
-- pages and terminates, and an ArcGIS page order is undefined without
-- `orderByFields`. Putting the strategy, the window and the ordering on the
-- contract makes the traversal a reviewed fact rather than a connector's habit.
-- ============================================================
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('SRC', 'v2', '{
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
-- 2. A revision is its own run event.
-- ============================================================
/*
 * A backfill re-run compares each window's bytes with what is already held.
 * Identical bytes are `item.noop` (the event existed); changed bytes are a
 * REVISION — the next version of the same evidence object, superseding the
 * prior — and that deserves its own name in the run log rather than hiding
 * under `item.admitted`.
 */
ALTER TABLE observation.collection_run_events
  DROP CONSTRAINT collection_run_events_event_check;
ALTER TABLE observation.collection_run_events
  ADD CONSTRAINT collection_run_events_event_check CHECK (event IN (
    'run.started', 'item.fetched', 'item.quarantined', 'item.admitted',
    'item.noop', 'item.revised', 'run.checkpointed', 'run.finished', 'run.failed',
    'run.budget_exceeded', 'run.cancelled'));
