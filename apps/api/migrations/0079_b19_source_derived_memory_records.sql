-- 0079 — CP-6 B19: SOURCE-DERIVED MEMORY RECORDS — a MEM version DERIVED from a claim version (ENT/EVT/CLM/REL/ASM) or a
-- warning, with its provenance (the basis version and digest, the evidence versions with their digests and byte spans, the
-- source contract, the method, the statement digest), the controls inherited, the review gate, the basis FOLLOWED (corrected
-- upstream, withdrawn upstream) and the deletion of the evidence it copies from PAUSED (2026-09-17).
--
-- THE GAP. After 0078 a memory item's source.kind named document | communication | telemetry beside human, and nothing verified
-- the source, derived the content or followed it: memory.record_item took a person's statement whatever the kind, the service
-- stamped a typed "telemetry" record observed (memory.service.ts:142 — a truth state only a series may claim), and only human
-- records were ever recorded (AU-MEM-0065's last clause; V02-T-118, V00-T-039, DP-37-001/002/005). A record resting on a claim
-- named no version of it and no digest of its evidence, and had no way to learn that the claim was corrected upstream, withdrawn
-- by a review, revoked by its origin, or that its evidence was withdrawn by a correction; the deletion of the evidence a record
-- copied from resolved as if nothing rested on it.
--
-- THE MECHANISM.
-- (D1) WHO DERIVES: a PERSON under memory.item.derive (human-gated; the memory.item.record holders), the server computing the
--   content and the port RE-VERIFYING it (§4: statement_digest = sha256 of the statement's UTF-8 bytes — a derived statement is
--   computed by the method memory-derive@1.0.0, never typed) — and a person derives from a basis they may read (the applied
--   classification within the deriver's clearance; the service's line). A re-derivation on a newer basis version is
--   memory.item.supersede with payload.basis. The derive action has its own canonical-write row (MEM) and NO
--   canonical_write_exclusions row (0069's exclusions are keyed by the generic actions; a memory action is not one).
-- (D2) THE BASIS is a CLAIM version or a WARNING, named in the DERIVATION BLOCK on memory.items_current (§1): basis {kind, id,
--   version, content_digest, object_type}, evidence [{object_id, version, digest, byte_start, byte_end}], source {the contract},
--   method_ref, derived_at, statement_digest, truth_state_of_basis, review_state_of_basis, series_keys (telemetry), indicator (a
--   warning). mem_source_basis: a human record carries NO derivation; a document, communication or telemetry record carries one.
--   The observed series-window basis is the stated residual (a module boundary: graph never imports prediction).
-- (D3) THE KIND is declared by the person with one verifiable rule (the service's): telemetry names a source with a registered
--   series (the derivation carries the series keys — §3 checks their presence); a warning basis is telemetry only (§3).
-- (D4) THE CONTROLS inherited (ES-29-002 as a floor): the most restrictive classification of the declared audience, the basis and
--   its evidence, said as declared/inherited/applied; synthetic state, rights, residency and retention inherited; the truth state
--   the basis's (extracted / asserted / inferred — never observed); the evidence VERSION the highest carrying the lineage's
--   digest. The service's rules; the schema MEM@v2 (§2) declares the derivation block for a DERIVED record (backward: every v1
--   payload validates; a person's record keeps MEM@v1). objects.admit_version does not validate against the registry (0069) —
--   the harness's Ajv check is the proof the row is honest.
-- (D5) THE BASIS FOLLOWED: attention_state gains basis_withdrawn beside none and basis_corrected (§1) — SERVED with the
--   declaration (availability.basis_state), never refused; the record's own withdrawal stays the record authority's act. Three
--   writers: memory.mark_basis_withdrawn (§5 — the import revocation's claim batch under retention.import.revoke and the
--   corrections path under observation.correction.apply, each in its own transaction; the port marks DERIVED records only: a
--   person's record cites, it does not copy); graph.record_impact (§6 — a claim_withdrawal walk marks basis_withdrawn when the
--   trigger object's LATEST version is withdrawn, else basis_corrected, and never downgrades a withdrawn mark; the walk reads no
--   derivation — it marks a person's record too, as it has since 0066); the ledger event memory.basis_withdrawn joins
--   item_events. STATED: a warning-based record is not marked when its forecast is withdrawn as unfit (0078 marks the warning
--   input_unverified and stops there) — mark_basis_withdrawn('warning', …) has no caller in B19.
-- (D6) THE DELETION PAUSE: retention.load_bearing_references gains branch (f) (§7), VERSION-AWARE — an ACTIVE derived record whose
--   derivation names one of the versions being deleted among its evidence, or whose basis claim's lineage names the bytes, is a
--   dependent of kind memory_item with the route (withdraw the record or supersede it on other evidence). A person's record citing
--   the evidence stays a dependency residual (the B11 control). resolve_scope and the execution's re-check call the function by
--   name and are untouched.
-- (D7) THE REGISTER: L3-I01's bound_to gains the derivation clause; no row moves — 36 bound / 14 partial / 0 unbound asserted (§8).
--
--   §1 memory.items_current — the derivation block, mem_source_basis, the basis index, the attention states, the ledger event;
--      the canonical-write action memory.item.derive.
--   §2 MEM@v2 in objects.schema_registry.
--   §3 memory.assert_derivation — the block's rules, in one place (the definer's; not granted).
--   §4 memory.record_item re-declared with p_derivation (a signature change: DROP FUNCTION + CREATE, the 0030/0078 idiom).
--   §5 memory.mark_basis_withdrawn.
--   §6 graph.record_impact re-declared (the memory loop alone changes).
--   §7 retention.load_bearing_references re-declared (branch (f); memory on the search path).
--   §8 the interface register.
--
-- The refusals: every port text keeps the 'memory item rejected: …' prefix (the 422 family of observation-errors.ts); the texts
-- that are the RECORD'S STATE — 'version 1 is recorded under …', 'a later version is recorded under …', 'a derived record is
-- superseded by a re-derivation …' — take the 409 family (the mapper carries the new row); the shape and digest texts are 22023,
-- the action texts 42501. memory.assert_derivation wraps every text operand in coalesce(…, '') so an ABSENT field fails the
-- shape check it advertises (an OR chain of NULLs would pass it), casts a number only behind a CASE that proved the digits (a
-- boolean chain promises no left-to-right order) and guards derived_at by a regex and an exception block before the cast — a
-- malformed block is refused in the port's words, never as an unmapped SQLSTATE.
--
-- Read-only checks after migrating a fresh database (0001–0079), each verified on eye_verify_b19_mig:
--   select count(*) from memory.items_current where (source_kind = 'human') <> (derivation is null)                        → 0
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--     where pronamespace = 'memory'::regnamespace and proname in ('record_item', 'mark_basis_withdrawn', 'assert_derivation')
--                                                                          → the three; record_item with p_derivation jsonb tenth
--   select (36,14,0) = (count(*) filter (where binding_state = 'bound'), count(*) filter (where binding_state = 'partial'),
--     count(*) filter (where binding_state = 'unbound')) from objects.interface_register                                    → true
--   select count(*) from objects.schema_registry → 37;  select count(*) from public.schema_migrations → 79
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conname in ('items_current_attention_state_check', 'item_events_event_check', 'mem_source_basis')               → the three texts of §1

-- ============================================================
-- §1 memory.items_current: the derivation block; the basis's state among the attention states; the ledger's new event
-- ============================================================
ALTER TABLE memory.items_current ADD COLUMN derivation jsonb CHECK (derivation IS NULL OR jsonb_typeof(derivation) = 'object');
COMMENT ON COLUMN memory.items_current.derivation IS 'B19 (0079): NULL for a person''s own record (source_kind human); for a document, communication or telemetry record the block memory.record_item validated — basis {kind claim|warning, id, version, content_digest, object_type}, evidence [{object_id, version, digest, byte_start, byte_end}], source {source_id, source_key, contract_version, connector_kind, media_type, authority_class, data_origin}, method_ref, derived_at, statement_digest (sha256 of the statement — re-verified by the port), truth_state_of_basis, review_state_of_basis, series_keys (telemetry), indicator (a warning basis).';
-- Every row on the demonstration and on a fresh database is human with no derivation (verified on eye_verify_b18_nb: 5 rows, all human):
-- the constraint validates on the spot; never NOT VALID.
ALTER TABLE memory.items_current ADD CONSTRAINT mem_source_basis CHECK ((source_kind = 'human') = (derivation IS NULL));
CREATE INDEX mem_items_basis ON memory.items_current (((derivation -> 'basis' ->> 'id'))) WHERE derivation IS NOT NULL;
-- The basis's state: corrected upstream (a walk) or withdrawn upstream (a withdrawal, a revocation, a claim_withdrawal walk).
-- The constraint names are the database's own (read from pg_constraint on eye_verify_b18_nb).
ALTER TABLE memory.items_current DROP CONSTRAINT items_current_attention_state_check;
ALTER TABLE memory.items_current ADD CONSTRAINT items_current_attention_state_check CHECK (attention_state IN ('none', 'basis_corrected', 'basis_withdrawn'));
ALTER TABLE memory.item_events DROP CONSTRAINT item_events_event_check;
ALTER TABLE memory.item_events ADD CONSTRAINT item_events_event_check CHECK (event IN ('memory.recorded', 'memory.superseded', 'memory.withdrawn', 'memory.attention', 'memory.retrieved', 'memory.basis_withdrawn'));

-- The derive action's own canonical-write row; no canonical_write_exclusions row (those are keyed by the generic actions — 0069).
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('memory.item.derive', ARRAY['MEM'], 'Deriving a memory record from a claim version or a warning admits its first canonical MEM version (MEM@v2, the derivation block) and nothing else (B19, 0079)')
ON CONFLICT (action) DO NOTHING;

-- ============================================================
-- §2 MEM@v2 in objects.schema_registry — the catalogue; backward (every v1 payload validates; a DERIVED record carries derivation)
-- ============================================================
-- v1's ten property blocks are copied verbatim from 0066; only derivation is new. A person's record keeps schema_ref MEM@v1.
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('MEM', 'v2', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["record_class","title","statement","source","audience","validity","retention","cites"],
  "properties": {
    "record_class": { "enum": ["institutional","strategic"] },
    "title": { "type": "string", "minLength": 3, "maxLength": 200 },
    "statement": { "type": "string", "minLength": 8 },
    "source": { "type": "object", "required": ["kind"], "properties": { "kind": { "enum": ["human","document","communication","telemetry"] }, "ref": { "type": ["string","null"] } } },
    "audience": { "type": "object", "required": ["classification"], "properties": { "classification": { "enum": ["public","internal","confidential","restricted"] }, "roles": { "type": "array", "items": { "type": "string" } }, "purposes": { "type": "array", "items": { "type": "string" } } } },
    "validity": { "type": "object", "required": ["from"], "properties": { "from": { "type": "string" }, "to": { "type": ["string","null"] } } },
    "retention": { "type": "object", "required": ["profile"], "properties": { "profile": { "type": "string", "minLength": 1 }, "retain_until": { "type": ["string","null"] }, "basis": { "type": ["string","null"] } } },
    "cites": { "type": "array", "items": { "type": "object", "required": ["kind","id","rationale"], "properties": { "kind": { "enum": ["evidence","claim","strategy","entity","edge","forecast","warning"] }, "id": { "type": "string" }, "version": { "type": ["integer","null"] }, "rationale": { "type": "string", "minLength": 8 } } } },
    "related": { "type": "object", "properties": { "decision_id": { "type": ["string","null"] }, "objective_id": { "type": ["string","null"] } } },
    "supersession": { "type": "object", "required": ["reason"], "properties": { "reason": { "type": "string", "minLength": 8 }, "effective_at": { "type": ["string","null"] } } },
    "derivation": {
      "type": "object",
      "required": ["basis","evidence","source","method_ref","derived_at","statement_digest","truth_state_of_basis","review_state_of_basis"],
      "properties": {
        "basis": { "type": "object", "required": ["kind","id","version","content_digest","object_type"], "properties": { "kind": { "enum": ["claim","warning"] }, "id": { "type": "string" }, "version": { "type": "integer", "minimum": 1 }, "content_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" }, "object_type": { "enum": ["ENT","EVT","CLM","REL","ASM","WRN"] } } },
        "evidence": { "type": "array", "minItems": 1, "items": { "type": "object", "required": ["object_id","version","digest"], "properties": { "object_id": { "type": "string" }, "version": { "type": "integer", "minimum": 1 }, "digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" }, "byte_start": { "type": ["integer","null"] }, "byte_end": { "type": ["integer","null"] } } } },
        "source": { "type": "object", "required": ["source_id","source_key","contract_version","connector_kind","authority_class","data_origin"], "properties": { "source_id": { "type": "string" }, "source_key": { "type": "string" }, "contract_version": { "type": "integer" }, "connector_kind": { "type": "string" }, "media_type": { "type": ["string","null"] }, "authority_class": { "type": "string" }, "data_origin": { "type": "string" } } },
        "method_ref": { "type": "string" },
        "derived_at": { "type": "string" },
        "statement_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
        "truth_state_of_basis": { "type": "string" },
        "review_state_of_basis": { "type": "string" },
        "series_keys": { "type": "array", "items": { "type": "string" } },
        "indicator": { "type": ["object","null"] }
      }
    }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

-- ============================================================
-- §3 memory.assert_derivation — the derivation block as memory.record_item admits it (called by the definer; not granted)
-- ============================================================
-- Every text operand is coalesced to '' so an ABSENT field fails the check (an OR chain of NULLs would pass it); a number is cast
-- only behind a CASE that proved the digits (a numeric, so no length overflows it); derived_at is guarded by a regex and an
-- exception block before the cast. sha256(bytea) is the built-in (canon.sha256_hex is revoked from PUBLIC and unnecessary).
-- withdrawn is NOT an admitted truth_state_of_basis: the service refuses a withdrawn basis before the port.
CREATE OR REPLACE FUNCTION memory.assert_derivation(p_derivation jsonb, p_source_kind text, p_statement text) RETURNS void
SET search_path = memory, pg_catalog, pg_temp AS $$
DECLARE b jsonb; s jsonb; e jsonb; v_n int := 0; v_at text;
BEGIN
  IF p_source_kind = 'human' THEN
    IF p_derivation IS NOT NULL THEN RAISE EXCEPTION 'memory item rejected: a person''s own record (source kind human) carries no derivation' USING ERRCODE = '22023'; END IF;
    RETURN;
  END IF;
  IF coalesce(p_source_kind, '') NOT IN ('document', 'communication', 'telemetry') THEN RAISE EXCEPTION 'memory item rejected: source kind is one of human, document, communication, telemetry (not %)', coalesce(p_source_kind, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_derivation IS NULL OR jsonb_typeof(p_derivation) <> 'object' THEN RAISE EXCEPTION 'memory item rejected: a document, communication or telemetry record is derived from its source (memory.item.derive); a person''s own record is source kind human' USING ERRCODE = '22023'; END IF;
  -- the basis
  b := p_derivation -> 'basis';
  IF b IS NULL OR jsonb_typeof(b) <> 'object'
     OR coalesce(b ->> 'kind', '') NOT IN ('claim', 'warning')
     OR coalesce(b ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR coalesce(b ->> 'version', '') !~ '^[0-9]+$'
     OR (CASE WHEN coalesce(b ->> 'version', '') ~ '^[0-9]+$' THEN (b ->> 'version')::numeric ELSE 0 END) < 1
     OR coalesce(b ->> 'content_digest', '') !~ '^[0-9a-f]{64}$'
     OR coalesce(b ->> 'object_type', '') NOT IN ('ENT', 'EVT', 'CLM', 'REL', 'ASM', 'WRN') THEN
    RAISE EXCEPTION 'memory item rejected: the derivation names its basis {kind claim|warning, id, version, content_digest, object_type}' USING ERRCODE = '22023';
  END IF;
  IF (b ->> 'kind') = 'warning' AND p_source_kind <> 'telemetry' THEN RAISE EXCEPTION 'memory item rejected: a warning rests on a series; its record is source kind telemetry (not %)', p_source_kind USING ERRCODE = '22023'; END IF;
  IF ((b ->> 'kind') = 'warning' AND (b ->> 'object_type') <> 'WRN') OR ((b ->> 'kind') = 'claim' AND (b ->> 'object_type') = 'WRN') THEN RAISE EXCEPTION 'memory item rejected: the basis kind and its object type disagree (% / %)', b ->> 'kind', b ->> 'object_type' USING ERRCODE = '22023'; END IF;
  -- the evidence versions the basis rests on
  IF (CASE WHEN jsonb_typeof(p_derivation -> 'evidence') = 'array' THEN jsonb_array_length(p_derivation -> 'evidence') ELSE 0 END) = 0 THEN
    RAISE EXCEPTION 'memory item rejected: the derivation names the evidence version(s) the basis rests on (at least one)' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_derivation -> 'evidence') LOOP
    v_n := v_n + 1;
    IF jsonb_typeof(e) <> 'object'
       OR coalesce(e ->> 'object_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e ->> 'version', '') !~ '^[0-9]+$'
       OR (CASE WHEN coalesce(e ->> 'version', '') ~ '^[0-9]+$' THEN (e ->> 'version')::numeric ELSE 0 END) < 1
       OR coalesce(e ->> 'digest', '') !~ '^[0-9a-f]{64}$'
       OR (e ? 'byte_start' AND jsonb_typeof(e -> 'byte_start') NOT IN ('number', 'null'))
       OR (e ? 'byte_end' AND jsonb_typeof(e -> 'byte_end') NOT IN ('number', 'null')) THEN
      RAISE EXCEPTION 'memory item rejected: evidence % of the derivation names {object_id, version, digest, byte_start?, byte_end?}', v_n USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- the source contract the evidence was acquired under
  s := p_derivation -> 'source';
  IF s IS NULL OR jsonb_typeof(s) <> 'object'
     OR coalesce(s ->> 'source_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR coalesce(length(btrim(s ->> 'source_key')), 0) = 0
     OR coalesce(s ->> 'contract_version', '') !~ '^[0-9]+$'
     OR coalesce(length(btrim(s ->> 'connector_kind')), 0) = 0
     OR coalesce(length(btrim(s ->> 'authority_class')), 0) = 0
     OR coalesce(length(btrim(s ->> 'data_origin')), 0) = 0 THEN
    RAISE EXCEPTION 'memory item rejected: the derivation names the source contract {source_id, source_key, contract_version, connector_kind, authority_class, data_origin}' USING ERRCODE = '22023';
  END IF;
  -- the method and the instant
  IF coalesce(p_derivation ->> 'method_ref', '') NOT LIKE 'memory-derive@%' THEN RAISE EXCEPTION 'memory item rejected: a derivation names its method (memory-derive@<version>)' USING ERRCODE = '22023'; END IF;
  v_at := p_derivation ->> 'derived_at';
  IF coalesce(v_at, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN
    RAISE EXCEPTION 'memory item rejected: a derivation states when it was derived (an ISO 8601 instant)' USING ERRCODE = '22023';
  END IF;
  BEGIN
    PERFORM v_at::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'memory item rejected: a derivation states when it was derived (% is not an instant)', v_at USING ERRCODE = '22023';
  END;
  -- the statement digest: a derived statement is re-verifiable from the record itself
  IF (p_derivation ->> 'statement_digest') IS DISTINCT FROM encode(sha256(convert_to(coalesce(p_statement, ''), 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'memory item rejected: the statement digest does not bind the derived statement (a derived statement is computed by the method, never typed)' USING ERRCODE = '22023';
  END IF;
  -- the basis's states as the derivation saw them
  IF coalesce(p_derivation ->> 'truth_state_of_basis', '') NOT IN ('observed', 'asserted', 'extracted', 'inferred', 'assessed', 'synthetic', 'decided', 'disputed') THEN RAISE EXCEPTION 'memory item rejected: the basis'' truth state is a canonical one (not %)', coalesce(p_derivation ->> 'truth_state_of_basis', '<none>') USING ERRCODE = '22023'; END IF;
  IF coalesce(p_derivation ->> 'review_state_of_basis', '') NOT IN ('approved', 'not_required', 'corrected', 'raised', 'acknowledged') THEN RAISE EXCEPTION 'memory item rejected: a memory record is derived from a decided basis (review approved, not_required or corrected; a warning raised or acknowledged) — not %', coalesce(p_derivation ->> 'review_state_of_basis', '<none>') USING ERRCODE = '22023'; END IF;
  -- telemetry rests on a registered series
  IF p_source_kind = 'telemetry' AND (CASE WHEN jsonb_typeof(p_derivation -> 'series_keys') = 'array' THEN jsonb_array_length(p_derivation -> 'series_keys') ELSE 0 END) = 0 THEN
    RAISE EXCEPTION 'memory item rejected: telemetry names a source with a registered series; the derivation carries none' USING ERRCODE = '22023';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION memory.assert_derivation(jsonb, text, text) FROM PUBLIC;

-- ============================================================
-- §4 memory.record_item re-declared with p_derivation (the signature changes: DROP + CREATE; the 0066 body with the B19 lines marked)
-- ============================================================
DROP FUNCTION IF EXISTS memory.record_item(uuid,uuid,uuid,int,jsonb,jsonb,uuid,uuid,uuid);
-- Record (version 1 — memory.item.record for a person's record, memory.item.derive for a derived one) or supersede (version n+1 —
-- memory.item.supersede, a re-statement or a re-derivation) the item's projection; the canonical MEM version is admitted by the
-- same write through objects.admit_version. Cites become dependency rows (the impact set); a supersession retires the rows of
-- the prior version that the new version no longer cites and adds the new ones.
-- B19 (0079): a derived record carries its DERIVATION (memory.assert_derivation); the basis and its evidence become dependency
-- rows whether or not the caller cited them (the walk reaches the record through both); the kind class never changes across a
-- supersession (a derived record is re-derived, a person's record re-stated). p_derivation keeps a DEFAULT NULL; the capability
-- passes null::jsonb explicitly for a person's record. v_action is assert_authority's return (the bound action — 0022).
CREATE FUNCTION memory.record_item(
  p_item_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_record jsonb, p_cites jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid, p_derivation jsonb DEFAULT NULL
) RETURNS void
SECURITY DEFINER SET search_path = memory, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur memory.items_current%ROWTYPE; c jsonb; v_kind text; v_id uuid; v_rationale text; v_action text; v_source_kind text; e jsonb; v_derivation_summary jsonb;
BEGIN
  v_action := observation.assert_authority(ARRAY['memory.item.record', 'memory.item.derive', 'memory.item.supersede']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_version IS NULL OR p_version < 1 THEN RAISE EXCEPTION 'memory item rejected: a version is a positive number' USING ERRCODE = '22023'; END IF;
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object' THEN RAISE EXCEPTION 'memory item rejected: the record is an object' USING ERRCODE = '22023'; END IF;
  IF p_cites IS NULL OR jsonb_typeof(p_cites) <> 'array' THEN RAISE EXCEPTION 'memory item rejected: cites is a list' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_record ->> 'retention_profile')), 0) = 0 THEN RAISE EXCEPTION 'memory item rejected: a retention profile is declared at record time' USING ERRCODE = '22023'; END IF;
  v_source_kind := p_record ->> 'source_kind';
  PERFORM memory.assert_derivation(p_derivation, v_source_kind, p_record ->> 'statement');                                              -- B19
  IF v_action = 'memory.item.derive' AND p_derivation IS NULL THEN RAISE EXCEPTION 'memory item rejected: memory.item.derive records a derived record; a person''s own record is memory.item.record' USING ERRCODE = '42501'; END IF;   -- B19
  IF v_action = 'memory.item.record' AND p_derivation IS NOT NULL THEN RAISE EXCEPTION 'memory item rejected: a derived record is recorded under memory.item.derive, not memory.item.record' USING ERRCODE = '42501'; END IF;        -- B19
  v_derivation_summary := CASE WHEN p_derivation IS NULL THEN NULL ELSE jsonb_build_object('basis', p_derivation -> 'basis', 'source', p_derivation -> 'source', 'method_ref', p_derivation ->> 'method_ref', 'statement_digest', p_derivation ->> 'statement_digest', 'evidence', jsonb_array_length(p_derivation -> 'evidence'), 'series_keys', p_derivation -> 'series_keys') END;   -- B19
  SELECT * INTO cur FROM memory.items_current x WHERE x.item_id = p_item_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF p_version = 1 THEN
    IF FOUND THEN RAISE EXCEPTION 'memory item rejected: % is already recorded (version %)', p_item_id, cur.object_version USING ERRCODE = '23505'; END IF;
    IF v_action NOT IN ('memory.item.record', 'memory.item.derive') THEN RAISE EXCEPTION 'memory item rejected: version 1 is recorded under memory.item.record or memory.item.derive, not %', v_action USING ERRCODE = '42501'; END IF;   -- B19 (0066: record only)
    INSERT INTO memory.items_current (item_id, scope, tenant_id, domain_id, object_version, record_class, title, statement, source_kind, source_ref, owner_principal_id,
                                      classification, audience_roles, audience_purposes, valid_from, valid_to, retention_profile, retain_until, retention_basis,
                                      related_decision_id, related_objective_id, recorded_by, correlation_id, derivation)
    VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, 1, p_record ->> 'record_class', p_record ->> 'title', p_record ->> 'statement', v_source_kind, p_record ->> 'source_ref',
            coalesce((p_record ->> 'owner_principal_id')::uuid, p_actor),
            p_record ->> 'classification', coalesce((SELECT array_agg(x #>> '{}') FROM jsonb_array_elements(coalesce(p_record -> 'audience_roles', '[]'::jsonb)) x), '{}'),
            coalesce((SELECT array_agg(x #>> '{}') FROM jsonb_array_elements(coalesce(p_record -> 'audience_purposes', '[]'::jsonb)) x), '{}'),
            (p_record ->> 'valid_from')::timestamptz, (p_record ->> 'valid_to')::timestamptz, p_record ->> 'retention_profile', (p_record ->> 'retain_until')::timestamptz, p_record ->> 'retention_basis',
            (p_record ->> 'related_decision_id')::uuid, (p_record ->> 'related_objective_id')::uuid, p_actor, p_correlation, p_derivation);
    INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_item_id, 'memory.recorded', 1, p_actor,
            jsonb_build_object('record_class', p_record ->> 'record_class', 'title', p_record ->> 'title', 'classification', p_record ->> 'classification', 'retention_profile', p_record ->> 'retention_profile', 'cites', jsonb_array_length(p_cites),
                               'source_kind', v_source_kind, 'action', v_action, 'derivation', v_derivation_summary), p_correlation);
  ELSE
    IF NOT FOUND THEN RAISE EXCEPTION 'memory item rejected: % is not recorded; version % has no predecessor', p_item_id, p_version USING ERRCODE = '23503'; END IF;
    IF v_action <> 'memory.item.supersede' THEN RAISE EXCEPTION 'memory item rejected: a later version is recorded under memory.item.supersede, not %', v_action USING ERRCODE = '42501'; END IF;
    IF cur.state <> 'active' THEN RAISE EXCEPTION 'memory item rejected: % is %; a withdrawn item is not superseded', p_item_id, cur.state USING ERRCODE = '22023'; END IF;
    IF p_version <> cur.object_version + 1 THEN RAISE EXCEPTION 'memory item rejected: the next version of % is %, not %', p_item_id, cur.object_version + 1, p_version USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(p_record #>> '{supersession,reason}')), 0) < 8 THEN RAISE EXCEPTION 'memory item rejected: a supersession states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
    IF (cur.derivation IS NULL) <> (p_derivation IS NULL) THEN RAISE EXCEPTION 'memory item rejected: a derived record is superseded by a re-derivation (payload.basis) and a person''s record by a person''s statement; the kind class of % does not change', p_item_id USING ERRCODE = '22023'; END IF;   -- B19
    UPDATE memory.items_current
       SET object_version = p_version, record_class = p_record ->> 'record_class', title = p_record ->> 'title', statement = p_record ->> 'statement',
           source_kind = v_source_kind, source_ref = p_record ->> 'source_ref', classification = p_record ->> 'classification',
           audience_roles = coalesce((SELECT array_agg(x #>> '{}') FROM jsonb_array_elements(coalesce(p_record -> 'audience_roles', '[]'::jsonb)) x), '{}'),
           audience_purposes = coalesce((SELECT array_agg(x #>> '{}') FROM jsonb_array_elements(coalesce(p_record -> 'audience_purposes', '[]'::jsonb)) x), '{}'),
           valid_from = (p_record ->> 'valid_from')::timestamptz, valid_to = (p_record ->> 'valid_to')::timestamptz,
           retention_profile = p_record ->> 'retention_profile', retain_until = (p_record ->> 'retain_until')::timestamptz, retention_basis = p_record ->> 'retention_basis',
           related_decision_id = (p_record ->> 'related_decision_id')::uuid, related_objective_id = (p_record ->> 'related_objective_id')::uuid,
           attention_state = 'none', attention_reason = NULL, superseded_versions = superseded_versions + 1, last_superseded_at = clock_timestamp(),
           recorded_at = clock_timestamp(), recorded_by = p_actor, correlation_id = p_correlation, derivation = p_derivation
     WHERE item_id = p_item_id;
    INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_item_id, 'memory.superseded', p_version, p_actor,
            jsonb_build_object('prior_version', cur.object_version, 'reason', p_record #>> '{supersession,reason}', 'effective_at', p_record #>> '{supersession,effective_at}', 'cites', jsonb_array_length(p_cites),
                               'source_kind', v_source_kind, 'derivation', v_derivation_summary), p_correlation);
    -- The prior version's dependency rows not cited any more are retired; the record time keeps them. (B19: the derivation's own basis and evidence count as cited.)
    UPDATE graph.dependencies d SET state = 'removed'
     WHERE d.dependent_type = 'MEM' AND d.dependent_object_id = p_item_id AND d.state = 'active'
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_cites) cc WHERE cc ->> 'kind' = d.depends_on_kind AND (cc ->> 'id')::uuid = d.depends_on_id)
       AND NOT (p_derivation IS NOT NULL AND d.depends_on_kind = (p_derivation -> 'basis' ->> 'kind') AND d.depends_on_id = (p_derivation -> 'basis' ->> 'id')::uuid)
       AND NOT (p_derivation IS NOT NULL AND d.depends_on_kind = 'evidence' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_derivation -> 'evidence') ev WHERE (ev ->> 'object_id')::uuid = d.depends_on_id));
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_cites) LOOP
    v_kind := c ->> 'kind'; v_id := (c ->> 'id')::uuid; v_rationale := c ->> 'rationale';
    IF v_kind NOT IN ('evidence', 'claim', 'strategy', 'entity', 'edge', 'forecast', 'warning') THEN RAISE EXCEPTION 'memory item rejected: a cite names one of evidence, claim, strategy, entity, edge, forecast, warning (not %)', v_kind USING ERRCODE = '22023'; END IF;
    IF v_id IS NULL OR coalesce(length(btrim(v_rationale)), 0) < 8 THEN RAISE EXCEPTION 'memory item rejected: each cite names an id and a rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_item_id, 'MEM', v_kind, v_id, v_rationale, 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  -- B19: the basis and its evidence are dependency rows whether or not the caller cited them — the walk reaches the record through both
  -- (dep_unique_active makes ON CONFLICT DO NOTHING the guard: a basis or evidence the caller already cited is not inserted twice).
  IF p_derivation IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_item_id, 'MEM', p_derivation -> 'basis' ->> 'kind', (p_derivation -> 'basis' ->> 'id')::uuid,
            format('derived from %s %s@%s by %s', p_derivation -> 'basis' ->> 'object_type', p_derivation -> 'basis' ->> 'id', p_derivation -> 'basis' ->> 'version', p_derivation ->> 'method_ref'), 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
    FOR e IN SELECT * FROM jsonb_array_elements(p_derivation -> 'evidence') LOOP
      INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_item_id, 'MEM', 'evidence', (e ->> 'object_id')::uuid,
              format('the evidence the basis rests on: EVD %s@%s (bytes %s)', e ->> 'object_id', e ->> 'version', left(e ->> 'digest', 16)), 'active', p_actor, p_correlation)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION memory.record_item(uuid,uuid,uuid,int,jsonb,jsonb,uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memory.record_item(uuid,uuid,uuid,int,jsonb,jsonb,uuid,uuid,uuid,jsonb) TO eye_commit;

-- ============================================================
-- §5 memory.mark_basis_withdrawn — the direct mark for the paths that withdraw a basis without a walk
-- ============================================================
-- THE BASIS WITHDRAWN (B19): every ACTIVE derived record resting on the withdrawn object is marked basis_withdrawn once, with the
-- event — called by the import revocation's claim batch (retention.import.revoke; one call per withdrawn claim, in the batch's
-- transaction) and by the corrections path for an evidence withdrawal (observation.correction.apply; in the applying transaction).
-- These two are the callers and the allowed set (the walk marks through graph.record_impact, §6, under its own action). The record
-- itself is never rewritten: its withdrawal or re-derivation stays the record authority's act. A person's own record (no derivation)
-- is untouched by THIS port — it cites, it does not copy (the walk, which reads no derivation, marks a person's record too).
CREATE OR REPLACE FUNCTION memory.mark_basis_withdrawn(p_tenant uuid, p_domain uuid, p_basis_kind text, p_basis_id uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = memory, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_marked jsonb := '[]'::jsonb; v_count int := 0; x record;
BEGIN
  v_action := observation.assert_authority(ARRAY['retention.import.revoke', 'observation.correction.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_basis_kind IS NULL OR p_basis_kind NOT IN ('claim', 'warning', 'evidence') THEN RAISE EXCEPTION 'memory item rejected: a withdrawn basis is a claim, a warning or evidence (not %)', coalesce(p_basis_kind, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_basis_id IS NULL THEN RAISE EXCEPTION 'memory item rejected: the withdrawn basis is named by its id' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'memory item rejected: a basis withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT m.item_id, m.object_version FROM memory.items_current m
            WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'active' AND m.derivation IS NOT NULL AND m.attention_state <> 'basis_withdrawn'
              AND ((p_basis_kind IN ('claim', 'warning') AND (m.derivation -> 'basis' ->> 'kind') = p_basis_kind AND (m.derivation -> 'basis' ->> 'id') = p_basis_id::text)
                   OR (p_basis_kind = 'evidence' AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(m.derivation -> 'evidence', '[]'::jsonb)) e WHERE (e ->> 'object_id') = p_basis_id::text)))
            ORDER BY m.recorded_at, m.item_id FOR UPDATE OF m LOOP
    UPDATE memory.items_current SET attention_state = 'basis_withdrawn', attention_reason = left(format('basis withdrawn (%s %s, under %s): %s', p_basis_kind, p_basis_id, v_action, p_reason), 500) WHERE item_id = x.item_id;
    INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.item_id, 'memory.basis_withdrawn', x.object_version, p_actor,
            jsonb_build_object('basis_kind', p_basis_kind, 'basis_id', p_basis_id, 'reason', p_reason, 'via', v_action), p_correlation);
    v_count := v_count + 1;
    IF v_count <= 200 THEN v_marked := v_marked || to_jsonb(x.item_id::text); END IF;
  END LOOP;
  RETURN jsonb_build_object('basis_kind', p_basis_kind, 'basis_id', p_basis_id, 'marked', v_marked, 'count', v_count, 'truncated', v_count > 200, 'via', v_action);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION memory.mark_basis_withdrawn(uuid,uuid,text,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memory.mark_basis_withdrawn(uuid,uuid,text,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §6 graph.record_impact re-declared — the memory loop distinguishes a withdrawal and never downgrades the withdrawn mark
-- ============================================================
-- The 0066 declaration (its latest; the nineteen-argument signature) copied whole; the ONLY change is the memory-item loop: a
-- claim_withdrawal walk marks basis_withdrawn when the trigger object's LATEST version IS withdrawn (a live, merely corrected claim
-- propagated as claim_withdrawal marks basis_corrected — the walk never declares a withdrawal the object does not carry); an item
-- already basis_withdrawn keeps that mark; the memory.attention event's attention_state is read AFTER the update and says which.
-- The loop reads no derivation: a person's record reached by the walk is marked as it has been since 0066 (the page shows
-- basis_state for derived records alone; a person's record's mark is the listing's Attention column).
CREATE OR REPLACE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_forecasts jsonb, p_twins jsonb, p_simulations jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid,
  p_warnings jsonb, p_briefings jsonb, p_memory_items jsonb DEFAULT '[]'::jsonb
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, prediction, twin, simulation, executive, memory, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; cov record; f jsonb; t jsonb; r jsonb; w jsonb; b jsonb; mi jsonb; v_versions int[]; v_version int; v_marked jsonb := '[]'::jsonb; v_routes text[]; v_trigger_kind text; v_trigger_id uuid;
  v_cov_state text; v_cov_roots int := 0; v_cov_covered int := 0; v_cov_outstanding int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE graph.invalidations_current
     SET affected_assumptions = coalesce(p_assumptions, '[]'::jsonb),
         affected_objectives  = coalesce(p_objectives,  '[]'::jsonb),
         affected_decisions   = coalesce(p_decisions,   '[]'::jsonb),
         affected_commitments = coalesce(p_commitments, '[]'::jsonb),
         affected_forecasts   = coalesce(p_forecasts,   '[]'::jsonb),
         affected_twins       = coalesce(p_twins,       '[]'::jsonb),
         affected_simulations = coalesce(p_simulations, '[]'::jsonb),
         affected_warnings    = coalesce(p_warnings,    '[]'::jsonb),
         affected_briefings   = coalesce(p_briefings,   '[]'::jsonb),
         affected_memory_items = coalesce(p_memory_items, '[]'::jsonb),
         statement = p_statement,
         truncated = coalesce(p_truncated, false),
         unexplored = coalesce(p_unexplored, '[]'::jsonb),
         state = 'assessed', assessed_at = clock_timestamp()
   WHERE invalidation_id = p_invalidation_id
   RETURNING correction_case_id, trigger_kind, trigger_object_id INTO v_case, v_trigger_kind, v_trigger_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'impact rejected: no such invalidation' USING ERRCODE = '23503';
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(p_forecasts, '[]'::jsonb)) LOOP
    UPDATE prediction.forecasts_current
       SET attention_state = 'assumption_unverified',
           attention_reason = format('invalidation %s: %s', p_invalidation_id, f ->> 'reached_via'),
           updated_at = clock_timestamp()
     WHERE forecast_id = (f ->> 'forecast_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain
       AND state IN ('issued');
    IF FOUND THEN
      INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (f ->> 'forecast_id')::uuid, 'forecast.attention', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', f ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;

  FOR t IN SELECT * FROM jsonb_array_elements(coalesce(p_twins, '[]'::jsonb)) LOOP
    -- every route: `via_ids` when the walk recorded several, `via_id` for one
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[]) INTO v_routes
      FROM (SELECT t ->> 'via_id' AS x WHERE (t ->> 'via_id') IS NOT NULL
            UNION ALL SELECT y #>> '{}' FROM jsonb_array_elements(coalesce(t -> 'via_ids', '[]'::jsonb)) y) s WHERE x IS NOT NULL;
    SELECT coalesce(array_agg(DISTINCT v.version ORDER BY v.version), ARRAY[]::int[]) INTO v_versions
      FROM twin.twin_versions v
      JOIN twin.state_elements e ON e.twin_id = v.twin_id AND e.version = v.version
     WHERE v.twin_id = (t ->> 'twin_id')::uuid AND v.tenant_id = p_tenant AND v.domain_id = p_domain
       AND v.state = 'admitted' AND v.verification_state = 'verified'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c WHERE (c ->> 'id') = ANY (v_routes));
    FOREACH v_version IN ARRAY v_versions LOOP
      PERFORM twin.mark_unverified((t ->> 'twin_id')::uuid, p_tenant, p_domain, v_version,
        format('invalidation %s: %s', p_invalidation_id, t ->> 'reached_via'), p_invalidation_id, p_actor, gen_random_uuid(), p_correlation);
      v_marked := v_marked || jsonb_build_object('twin_id', t ->> 'twin_id', 'version', v_version);
    END LOOP;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_simulations, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM simulation.runs_current s WHERE s.run_id = (r ->> 'run_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (r ->> 'run_id')::uuid, 'run.unverified', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', r ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;

  -- B8 §8 (AU-MEM-0031): a WARNING the walk reached is marked for attention (once; the warning row's own fields stay immutable),
  -- a BRIEFING composed before the change is RE-FLAGGED by event (the briefing is append-only; its content keeps its digest).
  FOR w IN SELECT * FROM jsonb_array_elements(coalesce(p_warnings, '[]'::jsonb)) LOOP
    UPDATE prediction.warnings_current
       SET attention_state = 'input_unverified', attention_reason = format('invalidation %s: %s', p_invalidation_id, w ->> 'reached_via')
     WHERE warning_id = (w ->> 'warning_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain AND attention_state = 'none' AND state IN ('raised', 'acknowledged');
    IF FOUND THEN
      INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (w ->> 'warning_id')::uuid, 'warning.attention', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', w ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;
  FOR b IN SELECT * FROM jsonb_array_elements(coalesce(p_briefings, '[]'::jsonb)) LOOP
    -- a briefing composed BEFORE the change it rests on: for a corrected object, the object has a version recorded after the
    -- briefing's known-at (a briefing composed on the corrected version is not re-flagged by the correction it already saw)
    IF EXISTS (SELECT 1 FROM executive.briefings x
                WHERE x.briefing_id = (b ->> 'briefing_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain
                  AND (v_trigger_kind NOT IN ('evidence_correction', 'claim_correction', 'claim_withdrawal')
                       OR EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_trigger_id AND o.recorded_at > x.known_at)))
       AND NOT EXISTS (SELECT 1 FROM executive.briefing_events e WHERE e.briefing_id = (b ->> 'briefing_id')::uuid AND e.event = 'briefing.re_flagged' AND e.details ->> 'invalidation_id' = p_invalidation_id::text) THEN
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (b ->> 'briefing_id')::uuid, 'briefing.re_flagged', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', b ->> 'reached_via', 'correction_case_id', v_case), p_correlation);
    END IF;
  END LOOP;

  -- 0066 §3: memory items resting on what changed — an ACTIVE item recorded before the change (for a corrected object, the
  -- object has a version recorded after the item's record instant) is marked for the knowledge owner's attention once per
  -- invalidation; the item itself (a version of the institutional record) is never rewritten by a walk.
  -- B19 (0079): a claim_withdrawal walk marks basis_withdrawn when the trigger object's LATEST version is withdrawn (else
  -- basis_corrected: the walk reached the item, but no withdrawal stands); an item already basis_withdrawn keeps that mark (a
  -- later correction walk of the same object does not downgrade it) — the event still records the invalidation, with the
  -- trigger kind and the state left on the item.
  FOR mi IN SELECT * FROM jsonb_array_elements(coalesce(p_memory_items, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM memory.items_current x
                WHERE x.item_id = (mi ->> 'item_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active'
                  AND (v_trigger_kind NOT IN ('evidence_correction', 'claim_correction', 'claim_withdrawal')
                       OR EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_trigger_id AND o.recorded_at > x.recorded_at)))
       AND NOT EXISTS (SELECT 1 FROM memory.item_events e WHERE e.item_id = (mi ->> 'item_id')::uuid AND e.event = 'memory.attention' AND e.details ->> 'invalidation_id' = p_invalidation_id::text) THEN
      UPDATE memory.items_current
         SET attention_state = CASE WHEN attention_state = 'basis_withdrawn'
                                      OR (v_trigger_kind = 'claim_withdrawal'
                                          AND coalesce((SELECT o.lifecycle_state FROM objects.canonical_objects o
                                                         WHERE o.object_id = v_trigger_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                                                         ORDER BY o.object_version DESC LIMIT 1), '') = 'withdrawn')
                                    THEN 'basis_withdrawn' ELSE 'basis_corrected' END,
             attention_reason = left('invalidation ' || p_invalidation_id::text || ': ' || coalesce(mi ->> 'reached_via', 'what this record rests on changed'), 500)
       WHERE item_id = (mi ->> 'item_id')::uuid;
      INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
      SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.item_id, 'memory.attention', x.object_version, p_actor,
             jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', mi ->> 'reached_via', 'correction_case_id', v_case, 'trigger_kind', v_trigger_kind, 'attention_state', x.attention_state), p_correlation
        FROM memory.items_current x WHERE x.item_id = (mi ->> 'item_id')::uuid;
    END IF;
  END LOOP;

  IF v_case IS NOT NULL THEN
    SELECT * INTO cov FROM graph.case_propagation_coverage(v_case);
    v_cov_state := coalesce(cov.state, 'partial');
    v_cov_roots := coalesce(cov.roots, 0);
    v_cov_covered := coalesce(cov.covered, 0);
    v_cov_outstanding := coalesce(cov.missing, 0) + coalesce(cov.truncated_latest, 0);
    UPDATE observation.correction_current
       SET propagation_unresolved = coalesce(cov.sentence, p_statement),
           propagation_assessment_id = p_invalidation_id,
           propagation_state = v_cov_state
     WHERE case_id = v_case AND tenant_id = p_tenant AND domain_id = p_domain;
  END IF;

  INSERT INTO graph.invalidation_events (event_id, scope, tenant_id, domain_id, invalidation_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_invalidation_id, 'invalidation.assessed', p_actor, jsonb_build_object(
      'assumptions', jsonb_array_length(coalesce(p_assumptions, '[]'::jsonb)),
      'objectives',  jsonb_array_length(coalesce(p_objectives,  '[]'::jsonb)),
      'decisions',   jsonb_array_length(coalesce(p_decisions,   '[]'::jsonb)),
      'commitments', jsonb_array_length(coalesce(p_commitments, '[]'::jsonb)),
      'forecasts',   jsonb_array_length(coalesce(p_forecasts,   '[]'::jsonb)),
      'twins',       jsonb_array_length(coalesce(p_twins,       '[]'::jsonb)),
      'twin_versions_unverified', v_marked,
      'simulations', jsonb_array_length(coalesce(p_simulations, '[]'::jsonb)),
      'warnings',    jsonb_array_length(coalesce(p_warnings,    '[]'::jsonb)),
      'briefings',   jsonb_array_length(coalesce(p_briefings,   '[]'::jsonb)),
      'memory_items', jsonb_array_length(coalesce(p_memory_items, '[]'::jsonb)),
      'truncated', coalesce(p_truncated, false),
      'unexplored', jsonb_array_length(coalesce(p_unexplored, '[]'::jsonb)),
      'correction_case_id', v_case, 'case_propagation_state', v_cov_state,
      'roots', v_cov_roots, 'roots_covered', v_cov_covered,
      'roots_outstanding', v_cov_outstanding, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb) TO eye_commit;

-- ============================================================
-- §7 retention.load_bearing_references re-declared — branch (f), version-aware, derived records only
-- ============================================================
-- The 0070 declaration (its latest) copied whole with memory added to the search path and branch (f) before the return; STABLE,
-- no EXECUTE grant, called by the definer from resolve_scope and the execution's re-check (both untouched — they call it by name).
-- The definer eye reads memory.items_current (FORCE RLS) as it reads every other FORCE RLS table the function inventories.
--
-- The references that make the bytes of manifest M LOAD-BEARING (V03-T-100). p_versions = every EVD version whose payload names M (a
-- correction keeps the manifest under the next version — D9; a revision admits the next version under a NEW manifest, so V(M) may be one
-- version of an object whose later versions carry other bytes); p_content_digest = M's digest. Returns a jsonb array of dependents, each
-- {kind, ref, version_aware, route, ...}; empty when the scope is provable. Private to the resolution and the execution's re-check (no
-- EXECUTE grant; called by the definer).
CREATE OR REPLACE FUNCTION retention.load_bearing_references(p_tenant uuid, p_domain uuid, p_evd_object_id uuid, p_versions bigint[], p_content_digest text)
RETURNS jsonb
STABLE SET search_path = retention, observation, objects, graph, intelligence, executive, decision, memory, pg_catalog, pg_temp AS $$
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
  -- (f) B19 (0079), VERSION-AWARE — a DERIVED memory record (it copies content out of the evidence — DP-37-005's "pause deletion when referential
  --     scope cannot be proven"): an ACTIVE item whose derivation names one of these versions among its evidence, or whose basis claim's lineage names
  --     these bytes. A person's own record citing the evidence stays a dependency residual (its words are the person's; resolve_scope inventories the row).
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'memory_item', 'ref', m.item_id::text, 'version_aware', true, 'record_version', m.object_version, 'source_kind', m.source_kind, 'attention_state', m.attention_state,
                                               'basis', (m.derivation -> 'basis' ->> 'object_type') || ':' || (m.derivation -> 'basis' ->> 'id') || '@' || (m.derivation -> 'basis' ->> 'version'),
                                               'route', 'withdraw the memory record (memory.item.withdraw) or supersede it on other evidence (memory.item.supersede); then resolve again') ORDER BY m.recorded_at, m.item_id), '[]'::jsonb) INTO v_part
    FROM memory.items_current m
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'active' AND m.derivation IS NOT NULL
     AND (EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(m.derivation -> 'evidence', '[]'::jsonb)) e
                   WHERE (e ->> 'object_id') = p_evd_object_id::text
                     AND (CASE WHEN coalesce(e ->> 'version', '') ~ '^[0-9]+$' THEN (e ->> 'version')::bigint END) = ANY (p_versions))
          OR ((m.derivation -> 'basis' ->> 'kind') = 'claim' AND EXISTS (SELECT 1 FROM intelligence.claim_lineage l
                   WHERE l.claim_object_id = (m.derivation -> 'basis' ->> 'id')::uuid AND l.claim_version = (m.derivation -> 'basis' ->> 'version')::bigint
                     AND l.evidence_object_id = p_evd_object_id AND l.evidence_digest = p_content_digest)));
  v_out := v_out || v_part;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.load_bearing_references(uuid,uuid,uuid,bigint[],text) FROM PUBLIC;

-- ============================================================
-- §8 the interface register: L3-I01 CommitMemory now also commits a DERIVED memory version; no row moves (36/14/0)
-- ============================================================
UPDATE objects.interface_register
   SET bound_to = bound_to || '; B19 (0079): a MEM version DERIVED from a claim version (ENT/EVT/CLM/REL/ASM) or a warning — memory.item.derive → memory.record_item with the derivation block (the basis version and digest, the evidence versions with their digests and byte spans, the source contract, the method memory-derive@1.0.0, the statement digest re-verified by the port), by a person who may read the basis (the applied classification within the deriver''s clearance), the controls inherited (ES-29-002: the most restrictive classification said as declared/inherited/applied; synthetic state, rights, residency, retention), the truth state the basis''s, the review gate (a queued, rejected, case-corrected, withdrawn or imported basis refused; a withdrawn evidence version grounds no record), the basis followed (attention basis_corrected by the walk, basis_withdrawn by memory.mark_basis_withdrawn from the revocation and the corrections path and by a claim_withdrawal walk of a withdrawn object; served with availability.basis_state; a warning-based record is not marked when its forecast is withdrawn as unfit — stated) and the deletion pause (retention.load_bearing_references branch (f): a derived record blocks the deletion of the evidence version it copies from; a person''s record stays a residual); a re-derivation is memory.item.supersede with payload.basis; L3-I02 stays partial (the purpose-bound context query)'
 WHERE interface_id = 'L3-I01';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (36, 14, 0) THEN
    RAISE EXCEPTION 'interface register after 0079: expected 36 bound, 14 partial, 0 unbound (no row moves in B19); found %, %, %', v_bound, v_partial, v_unbound;
  END IF;
END $$;
