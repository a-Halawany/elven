-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §HD — CP-6 B50: CANONICAL HEADER COMPLETENESS, IDENTITY AND TEMPORAL SEMANTICS (F-P3-01). Applies ALONE on 0001–0119 + 0120 §0.
-- 0001–0119 and 0120 §0 are untouched.
--
-- NO HEADER FIELD IS ADDED AND NOTHING IS BACK-FILLED (DESIGN D2 / D3): the 43-field canonical header, its registry
-- (objects.canonical_field_registry) and the digest of every recorded version stay as they are. What a NEW version carries changes — the
-- shared header builder (apps/api/src/objects/header-builder.ts) states what a writer used to null — and what the header cannot hold
-- without widening is written beside it, in the admission's OWN transaction, by objects.admit_version (re-declared whole, §HD.4):
--   objects.version_operations   per version: the operation, its idempotency key and trace id, and the header's BASIS (where each control
--                                profile came from — source contract, evidence, parent, domain — and, for a null, the domain profile that
--                                governs it; the domain's active ontology version; the fields stated as declared absences)
--   objects.time_qualifiers      per version and axis: the time's kind (exact / bounded / approximate / unknown / recurring / conflicting),
--                                bounds, precision, stated zone, source, rule, conflicts and clock quality — DECLARED by the writer (the
--                                upload intake's document time) or DERIVED from the header's own instant and precision
-- The header's time_precision gets a governed vocabulary (§HD.1). Each type has a HEADER PROFILE (§HD.2): its issuing authority, its quality
-- profile, its trust envelope and the fields mandatory before each decision-active use, which objects._header_usable (§0's hook stub, filled
-- here — §HD.5) checks before a package option, a publication, an export or a gate act uses the object (ES-24-003). Reads (§HD.6): the
-- identity declaration of an object (ES-25-002) and the ten layers' contracts (V00-T-030). A version recorded before 0120 has no side-
-- ledger row and reads "recorded before B50 — not populated".
--
-- THREE CLAIMS: construction (this section, the builder and their harnesses); demonstrated operation (the act — SYNTHETIC personas);
-- real acceptance — never claimed. The comprehensive schema-conformance verification is H1's (F-P3-01's verify stage).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §HD.1 THE GOVERNED time_precision VOCABULARY (ES-26-001) ─────────────────────────────────────────────────────────────────────────────────
-- The list is the same in three places, asserted equal by phase6-header-b50: this table (with each word's meaning and granularity), the
-- canonical CHECK, objects.assert_header_semantics (IMMUTABLE — it cannot read a table) and HEADER_TIME_PRECISIONS (packages/contracts).
-- B50 adds part_of_month and quarter; every word in use (exact, day) and every word the Phase 0 schema admitted (approximate) stays.
CREATE TABLE objects.time_precisions (
  code        text PRIMARY KEY CHECK (code ~ '^[a-z_]{3,20}$'),
  ordinal     int NOT NULL UNIQUE,
  granularity interval,
  meaning     text NOT NULL CHECK (length(btrim(meaning)) >= 8)
);
INSERT INTO objects.time_precisions (code, ordinal, granularity, meaning) VALUES
  ('exact',          0, NULL,              'an instant as the stating clock recorded it'),
  ('second',         1, interval '1 second', 'the instant is known to the second'),
  ('minute',         2, interval '1 minute', 'the instant is known to the minute'),
  ('hour',           3, interval '1 hour',   'the instant is known to the hour'),
  ('day',            4, interval '1 day',    'the day is known, not the time of day'),
  ('part_of_month',  5, NULL,              'a named part of a month (early / mid / late); the time value states its bounds'),
  ('month',          6, interval '1 month',  'the month is known, not the day'),
  ('quarter',        7, interval '3 months', 'the quarter is known, not the month'),
  ('year',           8, interval '1 year',   'the year is known, not the month'),
  ('approximate',    9, NULL,              'an approximate instant; the time value states its centre (and tolerance, when known)'),
  ('unknown',       10, NULL,              'no time is known; the header axis carries none and the time value says why');
ALTER TABLE objects.time_precisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects.time_precisions FORCE ROW LEVEL SECURITY;
CREATE POLICY time_precisions_shared ON objects.time_precisions FOR SELECT TO eye_app, eye_commit USING (true);
REVOKE ALL ON objects.time_precisions FROM PUBLIC;
GRANT SELECT ON objects.time_precisions TO eye_app, eye_commit;

-- the canonical CHECK: every recorded value (exact, day on eye_demo) is in the vocabulary, so it validates
ALTER TABLE objects.canonical_objects ADD CONSTRAINT canonical_time_precision CHECK (time_precision IN
  ('exact', 'second', 'minute', 'hour', 'day', 'part_of_month', 'month', 'quarter', 'year', 'approximate', 'unknown'));

-- objects.assert_header_semantics — 0012 line 658, its LAST definition, copied whole; the time_precision list widened (B50 hd).
CREATE OR REPLACE FUNCTION objects.assert_header_semantics(p_header jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := p_header->>'scope';
  v_recorded timestamptz;
  v_vf timestamptz := NULLIF(p_header->>'valid_from','')::timestamptz;
  v_vt timestamptz := NULLIF(p_header->>'valid_to','')::timestamptz;
BEGIN
  IF v_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'header semantics: scope % is not a canonical scope', v_scope USING ERRCODE = '22023';
  END IF;
  IF (v_scope = 'PLATFORM' AND (p_header->>'tenant_id' IS NOT NULL OR p_header->>'domain_id' IS NOT NULL))
     OR (v_scope = 'TENANT' AND (p_header->>'tenant_id' IS NULL OR p_header->>'domain_id' IS NOT NULL))
     OR (v_scope = 'DOMAIN' AND (p_header->>'tenant_id' IS NULL OR p_header->>'domain_id' IS NULL)) THEN
    RAISE EXCEPTION 'header semantics: scope/identifier combination is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'object_type' !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'header semantics: object_type must be three uppercase letters' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'object_version' !~ '^[1-9][0-9]{0,17}$' THEN
    RAISE EXCEPTION 'header semantics: object_version must be a positive integer string' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'lifecycle_state' NOT IN
     ('proposed','admitted','active','disputed','corrected','withdrawn','superseded','archived','deleted') THEN
    RAISE EXCEPTION 'header semantics: lifecycle_state % is not permitted', p_header->>'lifecycle_state'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'truth_state' NOT IN
     ('observed','asserted','extracted','inferred','assessed','synthetic','decided','disputed','withdrawn') THEN
    RAISE EXCEPTION 'header semantics: truth_state % is not canonical', p_header->>'truth_state'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'time_precision' NOT IN
     ('exact','second','minute','hour','day','part_of_month','month','quarter','year','approximate','unknown') THEN  -- B50 hd: the governed vocabulary (objects.time_precisions)
    RAISE EXCEPTION 'header semantics: time_precision % is not permitted', p_header->>'time_precision'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'source_clock_quality' NOT IN ('trusted','degraded','unknown') THEN
    RAISE EXCEPTION 'header semantics: source_clock_quality % is not permitted',
      p_header->>'source_clock_quality' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_header->'synthetic_state') <> 'boolean' THEN
    RAISE EXCEPTION 'header semantics: synthetic_state must be boolean' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'truth_state' = 'synthetic' AND (p_header->>'synthetic_state')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'header semantics: synthetic truth state requires synthetic_state' USING ERRCODE = '22023';
  END IF;
  -- Structured values must be objects (or null), never scalars smuggled in.
  IF jsonb_typeof(p_header->'confidence') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'uncertainty') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'quality_state') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'freshness_state') NOT IN ('object','null') THEN
    RAISE EXCEPTION 'header semantics: confidence/uncertainty/quality_state/freshness_state must be objects or null'
      USING ERRCODE = '22023';
  END IF;
  -- Reference arrays must be arrays of strings.
  IF jsonb_typeof(p_header->'evidence_refs') <> 'array'
     OR jsonb_typeof(p_header->'source_object_ids') <> 'array'
     OR jsonb_typeof(p_header->'contradiction_refs') <> 'array'
     OR jsonb_typeof(p_header->'corroboration_refs') <> 'array'
     OR jsonb_typeof(p_header->'human_refs') <> 'array' THEN
    RAISE EXCEPTION 'header semantics: reference fields must be arrays' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'schema_ref' !~ '^[A-Z]{3}@v[0-9]+$' THEN
    RAISE EXCEPTION 'header semantics: schema_ref % must be <TYPE>@v<N>', p_header->>'schema_ref'
      USING ERRCODE = '22023';
  END IF;
  IF left(p_header->>'schema_ref', 3) <> p_header->>'object_type' THEN
    RAISE EXCEPTION 'header semantics: schema_ref does not match object_type' USING ERRCODE = '22023';
  END IF;
  -- Temporal constraints.
  IF v_vt IS NOT NULL AND v_vf IS NULL THEN
    RAISE EXCEPTION 'header semantics: valid_to requires valid_from' USING ERRCODE = '22023';
  END IF;
  IF v_vt IS NOT NULL AND v_vf IS NOT NULL AND v_vt <= v_vf THEN
    RAISE EXCEPTION 'header semantics: valid_to must be after valid_from' USING ERRCODE = '22023';
  END IF;
  -- Authoritative recorded_at: present, parseable, and not from the future.
  BEGIN
    v_recorded := (p_header->>'recorded_at')::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'header semantics: recorded_at is not a valid instant' USING ERRCODE = '22023';
  END;
  IF v_recorded IS NULL THEN
    RAISE EXCEPTION 'header semantics: recorded_at is required' USING ERRCODE = '22023';
  END IF;
  IF v_recorded > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'header semantics: recorded_at is in the future' USING ERRCODE = '22023';
  END IF;
  IF (p_header->>'audit_correlation_id') IS NULL THEN
    RAISE EXCEPTION 'header semantics: audit_correlation_id is required' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_header->>'classification','') = '' OR coalesce(p_header->>'purpose_scope','') = ''
     OR coalesce(p_header->>'owning_component','') = '' OR coalesce(p_header->>'accountable_owner','') = '' THEN
    RAISE EXCEPTION 'header semantics: classification, purpose_scope, owning_component and accountable_owner are required'
      USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION objects.assert_header_semantics(jsonb) FROM PUBLIC;

-- §HD.2 THE HEADER PROFILES (ES-24-003, ES-25-002, V00-T-076, ADR-0003 V4) ────────────────────────────────────────────────────────────────────
-- One active profile per registered object type: who ISSUES its identities (the owning component and the port family), its quality profile
-- (the header's quality_profile on every new version), its trust envelope, the header fields MANDATORY before each decision-active use, the
-- jsonb fields that must carry a value (a declared absence does not satisfy them) and the type's own absence reasons. The rows mirror
-- HEADER_PROFILES in header-builder.ts (the harness asserts they agree). Versioned, append-only: a changed profile is a new version; the
-- latest active one governs. Platform reference data: readable by every bound principal; no write grant.
CREATE TABLE objects.header_profiles (
  object_type       text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  profile_version   int NOT NULL CHECK (profile_version >= 1),
  issuing_authority text NOT NULL CHECK (issuing_authority ~ '^CP-[A-Z]{3}-[A-Z0-9]{2,3}$'),
  issued_through    text NOT NULL CHECK (length(btrim(issued_through)) >= 3),
  quality_profile   text NOT NULL CHECK (quality_profile ~ '^quality:[A-Z]{3}@[0-9]+$'),
  mandatory         jsonb NOT NULL CHECK (jsonb_typeof(mandatory) = 'object' AND mandatory ?& ARRAY['decision_option', 'publication', 'export', 'gate']),
  value_required    text[] NOT NULL DEFAULT '{}',
  absence           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(absence) = 'object'),
  envelope          text[] NOT NULL DEFAULT ARRAY['object_id', 'tenant_id', 'accountable_owner', 'source_object_ids', 'recorded_at', 'truth_state', 'confidence',
                                                  'uncertainty', 'classification', 'rights_profile', 'valid_to', 'retention_profile', 'quality_state'],
  state             text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  declared_by       text NOT NULL DEFAULT 'migration:0120',
  declared_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (object_type, profile_version)
);
COMMENT ON TABLE objects.header_profiles IS 'B50 §HD (0120): per canonical type — issuing authority, quality profile, trust envelope, the header fields mandatory per decision-active use (objects._header_usable), the fields that must carry a value, the type''s absence reasons. Mirrors header-builder.ts HEADER_PROFILES.';
CREATE TRIGGER header_profiles_append_only BEFORE UPDATE OR DELETE ON objects.header_profiles FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
INSERT INTO objects.header_profiles (object_type, profile_version, issuing_authority, issued_through, quality_profile, mandatory, value_required, absence) VALUES
    ('APR', 1, 'CP-DEC-01', 'decision.approval', 'quality:APR@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('ASM', 1, 'CP-INT-01', 'intelligence.extraction', 'quality:ASM@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('ASU', 1, 'CP-GRA-01', 'graph.strategy', 'quality:ASU@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('BRF', 1, 'CP-EXE-01', 'executive.briefing.compose', 'quality:BRF@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('CAP', 1, 'CP-GRA-01', 'graph.strategy', 'quality:CAP@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('CLM', 1, 'CP-INT-01', 'intelligence.extraction / intelligence.review', 'quality:CLM@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","provenance_ref","method_ref"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","provenance_ref","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","provenance_ref","method_ref"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","provenance_ref","method_ref"]}'::jsonb, ARRAY['confidence']::text[], '{}'::jsonb),
    ('CMT', 1, 'CP-DEC-01', 'decision.commitment', 'quality:CMT@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('CPF', 1, 'CP-DOM-CI', 'domain.competitor', 'quality:CPF@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('DAS', 1, 'CP-DOM-PKG', 'domain.assessment', 'quality:DAS@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('DEC', 1, 'CP-GRA-01', 'graph.strategy', 'quality:DEC@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('DPG', 1, 'CP-DOM-PKG', 'domain.package', 'quality:DPG@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('DPK', 1, 'CP-DEC-01', 'decision.package', 'quality:DPK@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('DPR', 1, 'CP-DAT-01', 'products.release', 'quality:DPR@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('ENT', 1, 'CP-INT-01', 'intelligence.extraction', 'quality:ENT@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('EVD', 1, 'CP-OBS-01', 'observation.acquisition / observation.quarantine.release', 'quality:EVD@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","content_ref"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","content_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","content_ref"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","provenance_ref","content_ref"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('EVT', 1, 'CP-INT-01', 'intelligence.extraction', 'quality:EVT@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('FCT', 1, 'CP-PRD-01', 'prediction.forecast', 'quality:FCT@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","uncertainty","method_ref","valid_from","valid_to"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","uncertainty","method_ref","valid_from","valid_to"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","uncertainty","method_ref","valid_from","valid_to"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","uncertainty","method_ref","valid_from","valid_to"]}'::jsonb, ARRAY['uncertainty']::text[], '{"confidence":{"state":"not_applicable","reason":"a quantile forecast states its uncertainty (q10 / q50 / q90), not a confidence"}}'::jsonb),
    ('INI', 1, 'CP-GRA-01', 'graph.strategy', 'quality:INI@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('MEM', 1, 'CP-MEM-01', 'memory.item.record / memory.item.derive', 'quality:MEM@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('MET', 1, 'CP-DAT-01', 'products.metric.certify', 'quality:MET@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('MSR', 1, 'CP-GRA-01', 'graph.strategy', 'quality:MSR@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('OBJ', 1, 'CP-GRA-01', 'graph.strategy', 'quality:OBJ@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('OBS', 1, 'CP-OBS-01', 'observation.acquisition / observation.quarantine.release', 'quality:OBS@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('OUT', 1, 'CP-DEC-01', 'decision.monitoring', 'quality:OUT@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('PLN', 1, 'CP-EXE-01', 'executive.plan', 'quality:PLN@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('PUB', 1, 'CP-EXE-01', 'executive.publication.approve', 'quality:PUB@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('REL', 1, 'CP-INT-01', 'intelligence.extraction', 'quality:REL@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('RPL', 1, 'CP-DEC-01', 'decision.replay', 'quality:RPL@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('RSC', 1, 'CP-GRA-01', 'graph.strategy', 'quality:RSC@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('RSK', 1, 'CP-GRA-01', 'graph.strategy', 'quality:RSK@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('SCN', 1, 'CP-PRD-01', 'prediction.scenario', 'quality:SCN@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('SIM', 1, 'CP-SIM-01', 'simulation.run', 'quality:SIM@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","method_ref","provenance_ref"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","method_ref","provenance_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","method_ref","provenance_ref"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","method_ref","provenance_ref"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('SRC', 1, 'CP-OBS-01', 'observation.source.register', 'quality:SRC@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('STK', 1, 'CP-GRA-01', 'graph.strategy', 'quality:STK@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('TWN', 1, 'CP-TWN-01', 'twin.version', 'quality:TWN@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at"]}'::jsonb, ARRAY[]::text[], '{}'::jsonb),
    ('WRN', 1, 'CP-PRD-01', 'prediction.warning', 'quality:WRN@1', '{"decision_option":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","valid_from","valid_to","method_ref"],"publication":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","valid_from","valid_to","method_ref"],"export":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","valid_from","valid_to","method_ref"],"gate":["accountable_owner","owning_component","classification","purpose_scope","schema_ref","truth_state","recorded_at","confidence","valid_from","valid_to","method_ref"]}'::jsonb, ARRAY['confidence']::text[], '{}'::jsonb)
;
ALTER TABLE objects.header_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects.header_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY header_profiles_shared ON objects.header_profiles FOR SELECT TO eye_app, eye_commit USING (true);
REVOKE ALL ON objects.header_profiles FROM PUBLIC;
GRANT SELECT ON objects.header_profiles TO eye_app, eye_commit;

-- §HD.3 THE SIDE LEDGERS (DESIGN D2) ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Keyed by (object_id, object_version) and referencing the canonical version; written ONLY by objects.admit_version (SECURITY DEFINER, the
-- owner) in the admission's own transaction — no runtime role holds a write grant; append-only; read under the canonical row's own RLS rule.
CREATE TABLE objects.version_operations (
  object_id          uuid NOT NULL,
  object_version     bigint NOT NULL,
  object_type        text NOT NULL,
  scope              text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id          uuid,
  domain_id          uuid,
  operation_id       uuid,                      -- ctx.operation: the governed operation that admitted the version
  bound_action       text NOT NULL,             -- the canonical-write action the context was bound to
  -- The idempotency key: the writer's DECLARED key, else the single-use authority context's nonce (a context admits once: a replayed
  -- context is refused by ctx.issued, so the nonce is the operation's idempotency token). The universal HTTP store is B100's.
  idempotency_key    text NOT NULL CHECK (length(idempotency_key) BETWEEN 3 AND 240),
  idempotency_basis  text NOT NULL CHECK (idempotency_basis IN ('declared', 'authority_context')),
  -- The trace id: the writer's DECLARED id, else the governed operation's correlation id (the header's audit_correlation_id, bound to the
  -- context); ids from a tracing backend are B63's.
  trace_id           text NOT NULL CHECK (length(trace_id) BETWEEN 8 AND 200),
  trace_source       text NOT NULL CHECK (trace_source IN ('declared', 'correlation')),
  header_basis       jsonb NOT NULL CHECK (jsonb_typeof(header_basis) = 'object'),
  recorded_at        timestamptz NOT NULL,
  written_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (object_id, object_version),
  CONSTRAINT vop_version FOREIGN KEY (object_id, object_version) REFERENCES objects.canonical_objects (object_id, object_version)
);
COMMENT ON TABLE objects.version_operations IS 'B50 §HD (0120, DESIGN D2): one row per canonical version admitted after 0120 — its operation, idempotency key, trace id and header basis (the control profiles'' sources, the domain profile governing a null, the active ontology). Absent for a version recorded before B50.';
CREATE UNIQUE INDEX vop_declared_key ON objects.version_operations (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), object_id, idempotency_key)
  WHERE idempotency_basis = 'declared';
CREATE INDEX vop_scope ON objects.version_operations (tenant_id, domain_id, recorded_at);
CREATE TRIGGER version_operations_append_only BEFORE UPDATE OR DELETE ON objects.version_operations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE objects.time_qualifiers (
  object_id      uuid NOT NULL,
  object_version bigint NOT NULL,
  axis           text NOT NULL CHECK (axis IN ('event', 'observation', 'valid_from', 'valid_to', 'recorded', 'document')),
  object_type    text NOT NULL,
  scope          text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id      uuid,
  domain_id      uuid,
  kind           text NOT NULL CHECK (kind IN ('exact', 'bounded', 'approximate', 'unknown', 'recurring', 'conflicting')),
  instant        timestamptz,
  earliest       timestamptz,
  latest         timestamptz,
  time_precision text NOT NULL REFERENCES objects.time_precisions (code),
  zone           text CHECK (zone IS NULL OR zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$|^UTC$'),   -- the zone the value was STATED in; null: not stated
  source         text NOT NULL CHECK (length(btrim(source)) BETWEEN 2 AND 200),
  rule           text,
  conflicts      jsonb CHECK (conflicts IS NULL OR jsonb_typeof(conflicts) = 'array'),
  clock_quality  text NOT NULL CHECK (clock_quality IN ('trusted', 'degraded', 'unknown')),
  declared       boolean NOT NULL,              -- true: stated by the writer (a TimeValue); false: derived from the header's instant and precision
  recorded_at    timestamptz NOT NULL,
  PRIMARY KEY (object_id, object_version, axis),
  CONSTRAINT tq_version FOREIGN KEY (object_id, object_version) REFERENCES objects.canonical_objects (object_id, object_version),
  CONSTRAINT tq_kind CHECK (
    (kind = 'exact' AND instant IS NOT NULL AND earliest IS NULL AND latest IS NULL)
    OR (kind = 'bounded' AND earliest IS NOT NULL AND latest IS NOT NULL AND latest > earliest AND instant IS NULL)
    OR (kind = 'approximate' AND instant IS NOT NULL)
    OR (kind = 'unknown' AND instant IS NULL AND earliest IS NULL AND latest IS NULL AND time_precision = 'unknown')
    OR (kind = 'recurring' AND rule IS NOT NULL)
    OR (kind = 'conflicting' AND instant IS NULL AND conflicts IS NOT NULL AND jsonb_array_length(conflicts) >= 2))
);
COMMENT ON TABLE objects.time_qualifiers IS 'B50 §HD (0120, ES-26-001/-004): per canonical version and axis, the full statement of its time — kind, bounds, precision, stated zone, source, rule, conflicts, clock quality; declared by the writer or derived from the header. Absent for a version recorded before B50.';
CREATE INDEX tq_scope ON objects.time_qualifiers (tenant_id, domain_id, axis, earliest);
CREATE TRIGGER time_qualifiers_append_only BEFORE UPDATE OR DELETE ON objects.time_qualifiers FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['version_operations', 'time_qualifiers'] LOOP
    EXECUTE format('ALTER TABLE objects.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE objects.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY hd_side_read ON objects.%I FOR SELECT TO eye_app, eye_commit USING (public.eye_row_visible(tenant_id, domain_id))', t);
    EXECUTE format('REVOKE ALL ON objects.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON objects.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §HD.4 THE ADMISSION WRITES THE SIDE LEDGERS ──────────────────────────────────────────────────────────────────────────────────────────────
-- objects._time_value_problems: a TimeValue's shape and its kind's rules (the SQL mirror of packages/contracts time.ts timeValueProblems).
CREATE OR REPLACE FUNCTION objects._time_value_problems(v jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE p text[] := '{}'; k text; v_kind text := v ->> 'kind'; ts timestamptz; e timestamptz; l timestamptz;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN RETURN ARRAY['a time value is an object']; END IF;
  FOR k IN SELECT jsonb_object_keys(v) LOOP
    IF k NOT IN ('axis', 'kind', 'instant', 'earliest', 'latest', 'precision', 'zone', 'source', 'rule', 'conflicts', 'clockQuality') THEN p := p || format('unknown field %s', k); END IF;
  END LOOP;
  IF v_kind IS NULL OR v_kind NOT IN ('exact', 'bounded', 'approximate', 'unknown', 'recurring', 'conflicting') THEN p := p || 'kind must be exact, bounded, approximate, unknown, recurring or conflicting'::text; END IF;
  IF (v ->> 'precision') IS NULL OR (v ->> 'precision') NOT IN ('exact', 'second', 'minute', 'hour', 'day', 'part_of_month', 'month', 'quarter', 'year', 'approximate', 'unknown') THEN
    p := p || 'precision must be in the governed vocabulary'::text;
  END IF;
  IF jsonb_typeof(v -> 'zone') = 'string' AND (v ->> 'zone') !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$|^UTC$' THEN p := p || 'zone is an IANA zone name or null'::text; END IF;
  IF coalesce(length(btrim(v ->> 'source')), 0) NOT BETWEEN 2 AND 200 THEN p := p || 'source names who stated the time (2–200 characters)'::text; END IF;
  IF (v ->> 'clockQuality') IS NOT NULL AND (v ->> 'clockQuality') NOT IN ('trusted', 'degraded', 'unknown') THEN p := p || 'clockQuality is trusted, degraded or unknown'::text; END IF;
  BEGIN
    ts := (v ->> 'instant')::timestamptz; e := (v ->> 'earliest')::timestamptz; l := (v ->> 'latest')::timestamptz;
  EXCEPTION WHEN others THEN RETURN p || 'instant, earliest and latest are ISO 8601 instants'::text;
  END;
  CASE v_kind
    WHEN 'exact' THEN IF ts IS NULL OR e IS NOT NULL OR l IS NOT NULL THEN p := p || 'an exact time names its instant and no bounds'::text; END IF;
    WHEN 'bounded' THEN
      IF e IS NULL OR l IS NULL OR l <= e THEN p := p || 'a bounded time names earliest < latest'::text; END IF;
      IF ts IS NOT NULL THEN p := p || 'a bounded time names no single instant'::text; END IF;
      IF (v ->> 'precision') = 'exact' THEN p := p || 'a bounded time is not of exact precision'::text; END IF;
    WHEN 'approximate' THEN
      IF ts IS NULL THEN p := p || 'an approximate time names its centre instant'::text; END IF;
      IF (v ->> 'precision') = 'exact' THEN p := p || 'an approximate time is not of exact precision'::text; END IF;
    WHEN 'unknown' THEN IF ts IS NOT NULL OR e IS NOT NULL OR l IS NOT NULL OR (v ->> 'precision') IS DISTINCT FROM 'unknown' THEN p := p || 'an unknown time names nothing and has precision unknown'::text; END IF;
    WHEN 'recurring' THEN IF coalesce(v ->> 'rule', '') !~ '^(RRULE:)?FREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,+-]+)*$' THEN p := p || 'a recurring time names its RRULE (FREQ=…)'::text; END IF;
    WHEN 'conflicting' THEN
      IF jsonb_typeof(v -> 'conflicts') IS DISTINCT FROM 'array' OR jsonb_array_length(v -> 'conflicts') < 2 THEN p := p || 'a conflicting time names at least two disagreeing sources'::text; END IF;
      IF ts IS NOT NULL THEN p := p || 'a conflicting time names no single instant'::text; END IF;
    ELSE NULL;
  END CASE;
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION objects._time_value_problems(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects._time_value_problems(jsonb) TO eye_app, eye_commit;

-- objects._header_basis: where each control profile of a header came from (DESIGN D3's chain: source contract → evidence → parent → domain),
-- the domain profile that governs a null one (the header carries none — a null is load-bearing for B36's residency gate and the controls fold),
-- the domain's active ontology version (B51 binds it), and the B50-stated fields that are declared absences. INTERNAL (the admit's).
CREATE OR REPLACE FUNCTION objects._header_basis(p_header jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE
  v_tenant uuid := NULLIF(p_header ->> 'tenant_id', '')::uuid; v_domain uuid := NULLIF(p_header ->> 'domain_id', '')::uuid;
  v_id uuid := (p_header ->> 'object_id')::uuid; v_ver bigint := (p_header ->> 'object_version')::bigint;
  v_dom_res text; v_dom_ret text; v_prior jsonb; v_src jsonb; v_cited jsonb; v_ids uuid[]; v_src_ref text[]; f text; val text; frm text; v_out jsonb := '{}'::jsonb;
  v_joined text; v_stated jsonb := '{}'::jsonb; v_ont text;
BEGIN
  SELECT d.residency_profile, d.retention_profile INTO v_dom_res, v_dom_ret FROM tenancy.domains d WHERE d.id = v_domain;
  SELECT jsonb_build_object('rights_profile', o.rights_profile, 'residency_profile', o.residency_profile, 'retention_profile', o.retention_profile, 'access_policy_ref', o.access_policy_ref)
    INTO v_prior FROM objects.canonical_objects o WHERE o.object_id = v_id AND o.object_version = v_ver - 1;
  -- the source contract: the first SRC:<source>@<version> reference (the SRC canonical version IS the contract)
  SELECT regexp_match(r, '^SRC:([0-9a-f-]{36})@([0-9]+)') INTO v_src_ref
    FROM jsonb_array_elements_text(coalesce(p_header -> 'source_object_ids', '[]'::jsonb) || jsonb_build_array(coalesce(p_header ->> 'provenance_ref', ''))) r
   WHERE r ~ '^SRC:[0-9a-f-]{36}@[0-9]+' LIMIT 1;
  IF v_src_ref IS NOT NULL THEN
    SELECT jsonb_build_object('ref', 'SRC:' || o.object_id || '@' || o.object_version, 'rights_profile', o.rights_profile, 'residency_profile', o.residency_profile, 'retention_profile', o.retention_profile, 'access_policy_ref', o.access_policy_ref)
      INTO v_src FROM objects.canonical_objects o WHERE o.object_type = 'SRC' AND o.object_id = v_src_ref[1]::uuid AND o.object_version = v_src_ref[2]::bigint;
  END IF;
  -- the cited canonical objects (evidence_refs + source_object_ids, at most 64): their latest versions' controls
  SELECT array_agg(DISTINCT m[1]::uuid) INTO v_ids FROM (
    SELECT regexp_match(r, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') m
      FROM jsonb_array_elements_text(coalesce(p_header -> 'evidence_refs', '[]'::jsonb) || coalesce(p_header -> 'source_object_ids', '[]'::jsonb)) r LIMIT 64) x WHERE m IS NOT NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('rights_profile', c.rights_profile, 'residency_profile', c.residency_profile, 'retention_profile', c.retention_profile, 'access_policy_ref', c.access_policy_ref)), '[]'::jsonb)
    INTO v_cited FROM (SELECT DISTINCT ON (o.object_id) o.* FROM objects.canonical_objects o WHERE o.object_id = ANY (coalesce(v_ids, '{}')) AND o.object_id <> v_id ORDER BY o.object_id, o.object_version DESC) c;
  FOREACH f IN ARRAY ARRAY['rights_profile', 'residency_profile', 'retention_profile', 'access_policy_ref'] LOOP
    val := p_header ->> f;
    SELECT string_agg(DISTINCT e ->> f, '; ' ORDER BY e ->> f) INTO v_joined FROM jsonb_array_elements(v_cited) e WHERE coalesce(e ->> f, '') <> '';
    frm := CASE
      WHEN val IS NULL THEN 'none'
      WHEN v_src IS NOT NULL AND val = v_src ->> f THEN 'source_contract'
      WHEN val = v_joined OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_cited) e WHERE e ->> f = val) THEN 'evidence'
      WHEN v_prior IS NOT NULL AND val = v_prior ->> f THEN 'parent'
      WHEN f = 'residency_profile' AND val = v_dom_res THEN 'domain'
      WHEN f = 'retention_profile' AND val = v_dom_ret THEN 'domain'
      ELSE 'declared' END;
    v_out := v_out || jsonb_build_object(f, jsonb_build_object('value', val, 'from', frm)
      || CASE WHEN frm = 'source_contract' THEN jsonb_build_object('ref', v_src ->> 'ref') ELSE '{}'::jsonb END
      || CASE WHEN val IS NULL THEN jsonb_build_object('reason', 'no source contract, cited object or prior version carries one; the header states no narrower restriction')
                || CASE WHEN f = 'residency_profile' THEN jsonb_build_object('domain_profile', v_dom_res)
                        WHEN f = 'retention_profile' THEN jsonb_build_object('domain_profile', v_dom_ret) ELSE '{}'::jsonb END
              ELSE '{}'::jsonb END);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['confidence', 'uncertainty', 'quality_state', 'freshness_state'] LOOP
    IF jsonb_typeof(p_header -> f) = 'object' AND (p_header -> f ->> 'state') IN ('not_assessed', 'not_applicable', 'unknown') AND (p_header -> f) ? 'reason' THEN
      v_stated := v_stated || jsonb_build_object(f, p_header -> f ->> 'state');
    END IF;
  END LOOP;
  SELECT g.namespace || ':v' || g.version INTO v_ont FROM graph.ontology_versions g
   WHERE g.tenant_id = v_tenant AND g.domain_id = v_domain AND g.state = 'active' ORDER BY g.activated_at DESC NULLS LAST LIMIT 1;
  RETURN jsonb_build_object('basis_version', 1, 'controls', v_out,
    'ontology', jsonb_build_object('header', p_header ->> 'ontology_ref', 'domain_active', v_ont,
                                   'note', 'B51 binds ontology_ref to the domain''s active ontology version; until then a new version states ontology:none'),
    'absences', v_stated, 'profile', (SELECT p.quality_profile FROM objects.header_profiles p WHERE p.object_type = p_header ->> 'object_type' AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION objects._header_basis(jsonb) FROM PUBLIC;

-- objects._record_admission: the side-ledger rows of one admitted version. INTERNAL — called once, by objects.admit_version, after its insert.
-- p_decl (from the 4-argument admit): {idempotency_key?, trace_id?, time?: [TimeValue + axis]}; null: everything derived.
CREATE OR REPLACE FUNCTION objects._record_admission(p_header jsonb, p_decl jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_id uuid := (p_header ->> 'object_id')::uuid; v_ver bigint := (p_header ->> 'object_version')::bigint; v_type text := p_header ->> 'object_type';
  v_scope text := p_header ->> 'scope'; v_tenant uuid := NULLIF(p_header ->> 'tenant_id', '')::uuid; v_domain uuid := NULLIF(p_header ->> 'domain_id', '')::uuid;
  v_rec timestamptz := (p_header ->> 'recorded_at')::timestamptz; v_prec text := p_header ->> 'time_precision'; v_clock text := p_header ->> 'source_clock_quality';
  t jsonb; k text; v_probs text[]; v_axis text; v_field text; v_at timestamptz; v_expect timestamptz; v_declared text[] := '{}'; v_kind text; v_unit text; v_e timestamptz; v_l timestamptz;
BEGIN
  IF p_decl IS NOT NULL THEN
    IF jsonb_typeof(p_decl) <> 'object' THEN RAISE EXCEPTION 'admission rejected (declaration): the version declaration is an object' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(p_decl) LOOP
      IF k NOT IN ('idempotency_key', 'trace_id', 'time') THEN RAISE EXCEPTION 'admission rejected (declaration): unknown field %', k USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF p_decl ? 'idempotency_key' AND coalesce(length(btrim(p_decl ->> 'idempotency_key')), 0) NOT BETWEEN 3 AND 200 THEN
      RAISE EXCEPTION 'admission rejected (declaration): an idempotency key is 3–200 characters' USING ERRCODE = '22023';
    END IF;
    IF p_decl ? 'trace_id' AND coalesce(length(btrim(p_decl ->> 'trace_id')), 0) NOT BETWEEN 8 AND 200 THEN
      RAISE EXCEPTION 'admission rejected (declaration): a trace id is 8–200 characters' USING ERRCODE = '22023';
    END IF;
    IF p_decl ? 'time' AND jsonb_typeof(p_decl -> 'time') <> 'array' THEN RAISE EXCEPTION 'admission rejected (declaration): time is an array of stated time values' USING ERRCODE = '22023'; END IF;
  END IF;

  INSERT INTO objects.version_operations (object_id, object_version, object_type, scope, tenant_id, domain_id, operation_id, bound_action,
                                          idempotency_key, idempotency_basis, trace_id, trace_source, header_basis, recorded_at)
  VALUES (v_id, v_ver, v_type, v_scope, v_tenant, v_domain, ctx.current_operation(), coalesce(public.eye_bound_action(), '<none>'),
          coalesce(btrim(p_decl ->> 'idempotency_key'), 'ctx:' || coalesce(public.eye_ctx_nonce()::text, ctx.current_operation()::text, p_header ->> 'audit_correlation_id')),
          CASE WHEN p_decl ? 'idempotency_key' THEN 'declared' ELSE 'authority_context' END,
          coalesce(btrim(p_decl ->> 'trace_id'), p_header ->> 'audit_correlation_id'),
          CASE WHEN p_decl ? 'trace_id' THEN 'declared' ELSE 'correlation' END,
          objects._header_basis(p_header), v_rec);

  -- DECLARED time values: each checked, then matched against the header axis it qualifies (the header instant is the value's lower bound,
  -- centre or instant; an unknown / recurring / conflicting value places none)
  FOR t IN SELECT x FROM jsonb_array_elements(coalesce(p_decl -> 'time', '[]'::jsonb)) x LOOP
    v_axis := t ->> 'axis';
    IF v_axis IS NULL OR v_axis NOT IN ('event', 'observation', 'valid_from', 'valid_to', 'recorded', 'document') THEN
      RAISE EXCEPTION 'admission rejected (time): a stated time names its axis (event, observation, valid_from, valid_to, recorded, document)' USING ERRCODE = '22023';
    END IF;
    IF v_axis = ANY (v_declared) THEN RAISE EXCEPTION 'admission rejected (time): the % time is stated twice', v_axis USING ERRCODE = '22023'; END IF;
    v_probs := objects._time_value_problems(t);
    IF cardinality(v_probs) > 0 THEN RAISE EXCEPTION 'admission rejected (time): the % time — %', v_axis, array_to_string(v_probs, '; ') USING ERRCODE = '22023'; END IF;
    v_field := CASE v_axis WHEN 'event' THEN 'event_time' WHEN 'observation' THEN 'observation_time' WHEN 'valid_from' THEN 'valid_from' WHEN 'valid_to' THEN 'valid_to' WHEN 'recorded' THEN 'recorded_at' END;
    IF v_field IS NOT NULL THEN
      v_at := NULLIF(p_header ->> v_field, '')::timestamptz;
      v_expect := CASE t ->> 'kind' WHEN 'exact' THEN (t ->> 'instant')::timestamptz WHEN 'approximate' THEN (t ->> 'instant')::timestamptz
                                    WHEN 'bounded' THEN (t ->> 'earliest')::timestamptz ELSE NULL END;
      IF v_at IS DISTINCT FROM v_expect THEN
        RAISE EXCEPTION 'admission rejected (time): the header''s % (%) is not the stated % time''s instant (%) — a time is never forced to a false instant', v_field, coalesce(v_at::text, 'none'), v_axis, coalesce(v_expect::text, 'none') USING ERRCODE = '22023';
      END IF;
    END IF;
    INSERT INTO objects.time_qualifiers (object_id, object_version, axis, object_type, scope, tenant_id, domain_id, kind, instant, earliest, latest, time_precision,
                                         zone, source, rule, conflicts, clock_quality, declared, recorded_at)
    VALUES (v_id, v_ver, v_axis, v_type, v_scope, v_tenant, v_domain, t ->> 'kind', (t ->> 'instant')::timestamptz, (t ->> 'earliest')::timestamptz, (t ->> 'latest')::timestamptz,
            t ->> 'precision', t ->> 'zone', btrim(t ->> 'source'), t ->> 'rule', t -> 'conflicts', coalesce(t ->> 'clockQuality', CASE WHEN v_axis = 'recorded' THEN 'trusted' ELSE v_clock END), true, v_rec);
    v_declared := v_declared || v_axis;
  END LOOP;

  -- DERIVED qualifiers for every other axis the header carries: the precision word sets the bounds (a day-precision instant is the day
  -- [d, d+1) in UTC — the zone it was stated in is not known, so none is claimed); observation and record times are the system's clocks.
  FOR v_axis, v_field IN SELECT * FROM (VALUES ('event', 'event_time'), ('observation', 'observation_time'), ('valid_from', 'valid_from'), ('valid_to', 'valid_to'), ('recorded', 'recorded_at')) a(x, y) LOOP
    CONTINUE WHEN v_axis = ANY (v_declared);
    v_at := NULLIF(p_header ->> v_field, '')::timestamptz;
    CONTINUE WHEN v_at IS NULL;
    v_kind := 'exact'; v_e := NULL; v_l := NULL; v_unit := NULL;
    IF v_axis IN ('event', 'valid_from', 'valid_to') AND v_prec <> 'exact' THEN
      v_unit := CASE v_prec WHEN 'second' THEN 'second' WHEN 'minute' THEN 'minute' WHEN 'hour' THEN 'hour' WHEN 'day' THEN 'day' WHEN 'month' THEN 'month' WHEN 'quarter' THEN 'quarter' WHEN 'year' THEN 'year' END;
      IF v_unit IS NOT NULL THEN
        v_kind := 'bounded'; v_e := date_trunc(v_unit, v_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
        v_l := v_e + (SELECT p.granularity FROM objects.time_precisions p WHERE p.code = v_prec);
      ELSE v_kind := 'approximate'; END IF;
    END IF;
    INSERT INTO objects.time_qualifiers (object_id, object_version, axis, object_type, scope, tenant_id, domain_id, kind, instant, earliest, latest, time_precision,
                                         zone, source, rule, conflicts, clock_quality, declared, recorded_at)
    VALUES (v_id, v_ver, v_axis, v_type, v_scope, v_tenant, v_domain, v_kind, CASE WHEN v_kind = 'bounded' THEN NULL ELSE v_at END, v_e, v_l,
            CASE WHEN v_axis IN ('event', 'valid_from', 'valid_to') THEN CASE WHEN v_prec = 'unknown' THEN 'approximate' ELSE v_prec END ELSE 'exact' END,
            NULL, 'header (' || (p_header ->> 'owning_component') || ')', NULL, NULL,
            CASE WHEN v_axis = 'recorded' THEN 'trusted' ELSE v_clock END, false, v_rec);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION objects._record_admission(jsonb, jsonb) FROM PUBLIC;

-- objects.admit_version (3 arguments) — 0069 line 93, its LAST definition, copied whole; + the side ledgers written after the insert, in the
-- same transaction (B50 hd). The declaration the 4-argument form hands over travels in a transaction-local setting it sets and this clears.
CREATE OR REPLACE FUNCTION objects.admit_version(
  p_header jsonb, p_payload jsonb, p_digest text
) RETURNS TABLE (object_id uuid, object_version bigint, content_digest text)
SECURITY DEFINER SET search_path = objects, observation, canon, ctx, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_missing text; v_extra text; v_recomputed text;
  v_scope text := p_header->>'scope';
  v_tenant uuid := NULLIF(p_header->>'tenant_id','')::uuid;
  v_domain uuid := NULLIF(p_header->>'domain_id','')::uuid;
  v_action text := public.eye_bound_action();
  v_types text[];
  v_known boolean;
BEGIN
  IF public.eye_ctx_mode() <> 'authority' THEN
    RAISE EXCEPTION 'admission rejected: authority mode required (context is %)',
      public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  SELECT true, w.object_types INTO v_known, v_types
    FROM observation.canonical_write_actions w WHERE w.action = v_action;
  IF v_known IS NOT TRUE THEN
    RAISE EXCEPTION 'admission rejected: context is bound to action %, not a canonical write',
      coalesce(v_action,'<none>') USING ERRCODE = '42501';
  END IF;
  IF v_types IS NOT NULL AND NOT ((p_header->>'object_type') = ANY (v_types)) THEN
    RAISE EXCEPTION 'admission rejected: action % may not admit a % object',
      v_action, p_header->>'object_type' USING ERRCODE = '42501';
  END IF;
  -- 0069 §2 (B10-F4): a type whose writes are its own port's is NOT admitted by a generic action, whatever the caller's role.
  IF EXISTS (SELECT 1 FROM observation.canonical_write_exclusions x WHERE x.action = v_action AND x.object_type = (p_header->>'object_type')) THEN
    RAISE EXCEPTION 'admission rejected: action % may not admit a % object — it is written through its own port (%)',
      v_action, p_header->>'object_type', (SELECT x.rationale FROM observation.canonical_write_exclusions x WHERE x.action = v_action AND x.object_type = (p_header->>'object_type')) USING ERRCODE = '42501';
  END IF;
  PERFORM ctx.assert_live_authority();
  PERFORM objects.assert_header_binding(p_header);

  SELECT string_agg(field_name, ', ') INTO v_missing
    FROM objects.canonical_field_registry r WHERE NOT (p_header ? r.field_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header missing required field(s): %', v_missing
      USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(k, ', ') INTO v_extra
    FROM jsonb_object_keys(p_header) AS k
   WHERE NOT EXISTS (SELECT 1 FROM objects.canonical_field_registry r WHERE r.field_name = k);
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'admission rejected: header carries unregistered field(s): %', v_extra
      USING ERRCODE = '22023';
  END IF;

  PERFORM objects.assert_header_semantics(p_header);

  v_recomputed := canon.sha256_hex(canon.jcs(jsonb_build_object('header', p_header, 'payload', p_payload)));
  IF p_digest IS DISTINCT FROM v_recomputed THEN
    RAISE EXCEPTION 'admission rejected: content digest does not bind the header and payload'
      USING ERRCODE = '42501';
  END IF;
  IF NOT ((public.eye_scope() = 'PLATFORM' AND v_scope = 'PLATFORM' AND v_tenant IS NULL)
          OR public.eye_row_writable(v_scope, v_tenant, v_domain)) THEN
    RAISE EXCEPTION 'admission rejected: context not authorized for the object scope'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO objects.canonical_objects (
    object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state,
    owning_component, accountable_owner, source_object_ids, event_time, observation_time,
    valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state,
    synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref,
    contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope,
    rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile,
    quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes,
    withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest
  ) VALUES (
    (p_header->>'object_id')::uuid, p_header->>'object_type', v_tenant, v_domain, v_scope,
    (p_header->>'object_version')::bigint, p_header->>'lifecycle_state',
    p_header->>'owning_component', p_header->>'accountable_owner',
    coalesce(p_header->'source_object_ids','[]'::jsonb),
    NULLIF(p_header->>'event_time','')::timestamptz, NULLIF(p_header->>'observation_time','')::timestamptz,
    NULLIF(p_header->>'valid_from','')::timestamptz, NULLIF(p_header->>'valid_to','')::timestamptz,
    (p_header->>'recorded_at')::timestamptz, p_header->>'time_precision',
    p_header->>'source_clock_quality', p_header->>'truth_state',
    (p_header->>'synthetic_state')::boolean, p_header->'confidence', p_header->'uncertainty',
    coalesce(p_header->'evidence_refs','[]'::jsonb), p_header->>'provenance_ref', p_header->>'method_ref',
    coalesce(p_header->'contradiction_refs','[]'::jsonb), coalesce(p_header->'corroboration_refs','[]'::jsonb),
    coalesce(p_header->'human_refs','[]'::jsonb), p_header->>'classification', p_header->>'purpose_scope',
    p_header->>'rights_profile', p_header->>'residency_profile', p_header->>'retention_profile',
    p_header->>'access_policy_ref', p_header->>'quality_profile', p_header->'quality_state',
    p_header->'freshness_state', p_header->>'schema_ref', p_header->>'ontology_ref',
    p_header->>'correction_of', p_header->>'supersedes', p_header->>'withdrawal_reason',
    (p_header->>'audit_correlation_id')::uuid, p_header->>'content_ref',
    p_payload, v_recomputed
  );
  -- B50 hd: the side ledgers (objects.version_operations, objects.time_qualifiers) in this transaction; the 4-argument form's declaration, once.
  PERFORM objects._record_admission(p_header, NULLIF(current_setting('eye.b50_admission', true), '')::jsonb);
  PERFORM set_config('eye.b50_admission', '', true);
  RETURN QUERY SELECT (p_header->>'object_id')::uuid, (p_header->>'object_version')::bigint, v_recomputed;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.admit_version(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.admit_version(jsonb, jsonb, text) TO eye_commit;

-- objects.admit_version (4 arguments, NEW): the same admission with the writer's VERSION DECLARATION — its stated time values (the upload
-- intake's document time), and optionally its idempotency key and trace id. Every check is the 3-argument admit's, which it calls.
CREATE OR REPLACE FUNCTION objects.admit_version(
  p_header jsonb, p_payload jsonb, p_digest text, p_declaration jsonb
) RETURNS TABLE (object_id uuid, object_version bigint, content_digest text)
SECURITY DEFINER SET search_path = objects, observation, canon, ctx, public, pg_catalog, pg_temp
AS $$
BEGIN
  IF p_declaration IS NOT NULL AND jsonb_typeof(p_declaration) <> 'object' THEN
    RAISE EXCEPTION 'admission rejected (declaration): the version declaration is an object' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('eye.b50_admission', coalesce(p_declaration, '{}'::jsonb)::text, true);
  RETURN QUERY SELECT a.object_id, a.object_version, a.content_digest FROM objects.admit_version(p_header, p_payload, p_digest) a;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION objects.admit_version(jsonb, jsonb, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.admit_version(jsonb, jsonb, text, jsonb) TO eye_commit;

-- §HD.5 THE HEADER HALF OF THE KNOWLEDGE HOOK (ES-24-003) ─────────────────────────────────────────────────────────────────────────────────
-- objects._header_usable — 0120 §0.1's stub, re-declared WHOLE (same signature, STABLE, invoker, read-only): before a decision-active use, the
-- type's header profile names the fields that must be present (and the ones that must carry a VALUE, not a declared absence); a version
-- admitted after B50 must also carry every field B50 states. A missing field refuses in the class form, naming the fields and the profile.
-- An unknown object is the CALLER's refusal (every caller resolves its citation first — derive_option, the gate's citations, the publication
-- source, the export manifests): the hook returns.
CREATE OR REPLACE FUNCTION objects._header_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE
  o jsonb; pr objects.header_profiles%ROWTYPE; v_post boolean; f text; v jsonb; v_missing text[] := '{}';
BEGIN
  -- B50 hd: the header profile's mandatory fields for p_use
  SELECT to_jsonb(x) INTO o FROM objects.canonical_objects x WHERE x.object_type = p_type AND x.object_id = p_id AND x.object_version = p_version;
  IF o IS NULL THEN RETURN; END IF;
  SELECT * INTO pr FROM objects.header_profiles p WHERE p.object_type = p_type AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'object use rejected (incomplete_header): % % v% has no header profile, so no field is known mandatory for %; a type is profiled before it is decision-active', p_type, p_id, p_version, p_use USING ERRCODE = '22023';
  END IF;
  v_post := EXISTS (SELECT 1 FROM objects.version_operations w WHERE w.object_id = p_id AND w.object_version = p_version);
  FOR f IN SELECT jsonb_array_elements_text(coalesce(pr.mandatory -> p_use, '[]'::jsonb)) LOOP
    v := o -> f;
    IF v IS NULL OR jsonb_typeof(v) = 'null' OR (jsonb_typeof(v) = 'array' AND jsonb_array_length(v) = 0) OR (jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = '') THEN
      v_missing := v_missing || f;
    ELSIF jsonb_typeof(v) = 'string' AND f = 'provenance_ref' AND (v #>> '{}') LIKE 'none:%' THEN
      v_missing := v_missing || (f || ' (stated none)');
    ELSIF f = ANY (pr.value_required) AND jsonb_typeof(v) = 'object' AND (v ->> 'state') IN ('not_assessed', 'not_applicable', 'unknown') AND v ? 'reason' THEN
      v_missing := v_missing || format('%s (declared %s: %s)', f, v ->> 'state', v ->> 'reason');
    END IF;
  END LOOP;
  IF v_post THEN
    FOREACH f IN ARRAY ARRAY['confidence', 'uncertainty', 'quality_state', 'freshness_state', 'ontology_ref', 'quality_profile', 'provenance_ref'] LOOP
      IF (o -> f) IS NULL OR jsonb_typeof(o -> f) = 'null' THEN v_missing := v_missing || (f || ' (not stated)'); END IF;
    END LOOP;
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'object use rejected (incomplete_header): % % v% lacks % for % (header profile %@%)%', p_type, p_id, p_version, array_to_string(v_missing, ', '), p_use, p_type, pr.profile_version,
      CASE WHEN v_post THEN '' ELSE '; the version was recorded before B50 — the fields B50 states are not populated on it' END USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION objects._header_usable(text, uuid, int, text) FROM PUBLIC;

-- §HD.6 THE READS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- objects.identity_declaration (ES-25-002): how an object's identity is declared — the issuing authority (the type's profile and the version's
-- owning component), the namespace (scope · tenant · domain · type), the creation time (v1's record time), the status (the latest version's
-- lifecycle state), the aliases (an entity's registered identifiers), the merges and splits (an entity's resolutions, its split lineage and
-- supersession) and the supersession chain of its versions. The identifier itself embeds nothing mutable (UUIDv7; ES-25-001). Read within the
-- caller's bound tenant and domain.
CREATE OR REPLACE FUNCTION objects.identity_declaration(p_type text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE f objects.canonical_objects%ROWTYPE; l objects.canonical_objects%ROWTYPE; pr objects.header_profiles%ROWTYPE; v_aliases jsonb := '[]'::jsonb; v_merge jsonb := '[]'::jsonb;
        v_split jsonb := '{}'::jsonb; v_chain jsonb; v_entity uuid;
BEGIN
  SELECT * INTO f FROM objects.canonical_objects x WHERE x.object_type = p_type AND x.object_id = p_id ORDER BY x.object_version LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'identity rejected (unknown_object): no % % is recorded', p_type, p_id USING ERRCODE = '23503'; END IF;
  PERFORM observation.assert_read_scope(f.tenant_id, f.domain_id, 'an identity declaration');
  SELECT * INTO l FROM objects.canonical_objects x WHERE x.object_id = p_id ORDER BY x.object_version DESC LIMIT 1;
  SELECT * INTO pr FROM objects.header_profiles p WHERE p.object_type = p_type AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1;
  -- an ENT's graph identity: the entity resolved from this claim object, or the entity whose id is this object's
  SELECT coalesce((SELECT e.entity_id FROM graph.entities_current e WHERE e.entity_id = p_id),
                  (SELECT r.entity_id FROM graph.resolutions_current r WHERE r.claim_object_id = p_id ORDER BY r.claim_version DESC LIMIT 1)) INTO v_entity;
  IF v_entity IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('system', i.system_key, 'value', i.identifier_value, 'authority', s.authority, 'authoritative', s.is_authoritative, 'recorded_at', i.recorded_at) ORDER BY i.recorded_at), '[]'::jsonb)
      INTO v_aliases FROM graph.entity_identifiers i JOIN graph.identifier_systems s ON s.tenant_id = i.tenant_id AND s.domain_id = i.domain_id AND s.system_key = i.system_key WHERE i.entity_id = v_entity;
    SELECT coalesce(jsonb_agg(jsonb_build_object('resolution_id', r.resolution_id, 'claim', r.claim_object_id || '@' || r.claim_version, 'method', r.method, 'rule', r.rule_id || '@' || r.rule_version, 'score', r.score) ORDER BY r.claim_version), '[]'::jsonb)
      INTO v_merge FROM graph.resolutions_current r WHERE r.entity_id = v_entity;
    SELECT jsonb_build_object('entity_id', e.entity_id, 'lifecycle_state', e.lifecycle_state, 'split_from', e.split_from, 'superseded_by', e.superseded_by,
                              'split_into', (SELECT coalesce(jsonb_agg(c.entity_id), '[]'::jsonb) FROM graph.entities_current c WHERE c.split_from = e.entity_id))
      INTO v_split FROM graph.entities_current e WHERE e.entity_id = v_entity;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('version', x.object_version, 'lifecycle_state', x.lifecycle_state, 'correction_of', x.correction_of, 'supersedes', x.supersedes, 'recorded_at', x.recorded_at,
                                      'header', CASE WHEN EXISTS (SELECT 1 FROM objects.version_operations w WHERE w.object_id = x.object_id AND w.object_version = x.object_version) THEN 'stated' ELSE 'recorded before B50' END)
                   ORDER BY x.object_version) INTO v_chain FROM objects.canonical_objects x WHERE x.object_id = p_id;
  RETURN jsonb_build_object(
    'object', p_type || ':' || p_id,
    'issuing_authority', jsonb_build_object('profile', coalesce(pr.issuing_authority, f.owning_component), 'issued_through', pr.issued_through, 'owning_component', f.owning_component,
                                            'profile_version', pr.profile_version, 'consistent', pr.issuing_authority IS NULL OR pr.issuing_authority = f.owning_component OR f.owning_component = 'CP-OBJ-01'),
    'namespace', jsonb_build_object('scope', f.scope, 'tenant_id', f.tenant_id, 'domain_id', f.domain_id, 'object_type', p_type, 'identifier_scheme', 'uuid (UUIDv7: time-ordered; embeds no name, region, classification, environment or location — ES-25-001)'),
    'created_at', f.recorded_at, 'status', l.lifecycle_state, 'latest_version', l.object_version,
    'aliases', v_aliases, 'merges', v_merge, 'splits', v_split,
    'supersession', coalesce(v_chain, '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION objects.identity_declaration(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.identity_declaration(text, uuid) TO eye_app, eye_commit;

-- objects.layer_contracts (V00-T-030, C-008, V01-T-045): the TEN layers (B107's LAYERS, generate-components-manifest.mjs) with their published
-- contracts — object schemas, events, interfaces, the provenance / time / identity / policy blocks (the 43-field header, one contract for every
-- layer), quality (the header profiles), failure (the failure domains, what their loss affects, and the degraded-mode contracts declared for
-- them) — and, per layer, the contract kinds MISSING (listed, never omitted). Shared reference data, plus the caller's visible degraded contracts.
CREATE TABLE objects.layer_register (
  layer       smallint PRIMARY KEY CHECK (layer BETWEEN 1 AND 10),
  name        text NOT NULL,
  chapter     text NOT NULL CHECK (chapter ~ '^ES-[0-9]{2}$'),
  units       text[] NOT NULL,
  objects     text[] NOT NULL,
  reads       smallint[] NOT NULL,
  failure     text[] NOT NULL,
  affected    text NOT NULL
);
COMMENT ON TABLE objects.layer_register IS 'B50 §HD (0120): the ten canonical layers as B107''s LAYERS (apps/api/src/governance/conformance/generate-components-manifest.mjs) declares them — the harness asserts they agree; navigation is B80''s workspaces, a deliberate mapping, not a rename (the layer note).';
INSERT INTO objects.layer_register (layer, name, chapter, units, objects, reads, failure, affected) VALUES
  (1, 'World Observation', 'ES-31', ARRAY['api.observation', 'worker.collection'], ARRAY['SRC', 'OBS', 'EVD'], ARRAY[]::smallint[], ARRAY['postgres:observation', 'redis:collection-queue', 'connector egress'],
   'observations stop arriving or arrive late: freshness and coverage read stale with the gap DISCLOSED; warnings, forecasts and briefings that depend on the source show their evidence age; nothing is inferred current'),
  (2, 'Intelligence', 'ES-32', ARRAY['api.intelligence', 'worker.extraction-plan'], ARRAY['CLM', 'ENT', 'EVT', 'REL', 'ASM'], ARRAY[1]::smallint[], ARRAY['postgres:intelligence', 'redis:extraction-queue', 'model gateway'],
   'claims, entities and events are not extracted or reviewed: new evidence stays un-transformed and is shown as such; no claim is promoted without its review; truth states are never upgraded by default'),
  (3, 'Enterprise Memory', 'ES-33', ARRAY['api.objects', 'api.retention', 'api.graph'], ARRAY['OBJ', 'MEM', 'APR', 'RPL'], ARRAY[1, 2]::smallint[], ARRAY['postgres:objects', 'postgres:memory', 'vault filesystem roots'],
   'memory commits, retention actions and exports pause: prior versions stay readable with their provenance; corrections are queued, never lost; a deletion or export is never reported complete before it is'),
  (4, 'Knowledge Graph', 'ES-34', ARRAY['api.graph'], ARRAY['ENT', 'REL', 'DPR'], ARRAY[2, 3]::smallint[], ARRAY['postgres:graph', 'redis:subscription-queue'],
   'graph revisions and traversals degrade: paths are returned partial with incompleteness disclosed; GraphChanged consumers lag visibly; identity resolutions are held, never merged by default'),
  (5, 'Digital Twins', 'ES-35', ARRAY['api.twin'], ARRAY['TWN'], ARRAY[3, 4]::smallint[], ARRAY['postgres:twin', 'redis:estimation-queue'],
   'twin state estimates go stale: twins show their freshness and operating-envelope state; synthetic states stay labelled; branches cannot be run on a stale twin without the disclosure'),
  (6, 'Prediction Engine', 'ES-36', ARRAY['api.prediction'], ARRAY['FCT', 'WRN', 'SIM'], ARRAY[1, 3, 4, 5]::smallint[], ARRAY['postgres:prediction', 'redis:forecast-queue', 'model gateway'],
   'forecasts and warnings are not refreshed: the last forecast version shows its age and fitness; unfit forecasts are withheld from decisions; warnings already raised stay visible with their acknowledgement state'),
  (7, 'Scenario Intelligence', 'ES-37', ARRAY['api.prediction', 'api.domains'], ARRAY['SCN', 'ASU'], ARRAY[4, 5, 6]::smallint[], ARRAY['postgres:prediction'],
   'scenarios, signposts and assumptions are not updated: scenario sets show their coherence state as of their last review; signpost movements are not inferred'),
  (8, 'Simulation Engine', 'ES-38', ARRAY['api.twin'], ARRAY['SIM'], ARRAY[5, 6, 7]::smallint[], ARRAY['postgres:simulation', 'redis:experiment-queue', 'compute budget'],
   'experiments queue or stop at their budget: completed runs stay reproducible from their seeds and versions; partial runs are never presented as results'),
  (9, 'Decision Intelligence', 'ES-39', ARRAY['api.decision'], ARRAY['DEC', 'CMT', 'OUT', 'DPK'], ARRAY[4, 6, 7, 8]::smallint[], ARRAY['postgres:decision'],
   'decision packages cannot be assembled or approved: no recommendation is issued without its evidence and foresight; pending approvals stay pending (never auto-approved); recorded decisions and commitments stay intact and replayable'),
  (10, 'Executive Operating System', 'ES-40', ARRAY['api.executive'], ARRAY['BRF', 'PLN', 'PUB', 'CAP', 'INI', 'RSC', 'MSR', 'STK', 'RSK', 'MET'], ARRAY[6, 7, 9]::smallint[], ARRAY['postgres:executive', 'redis:attention-queue', 'local delivery sinks'],
   'briefings, attention routing and rooms degrade: the workspace marks what is stale; attention items already raised stay owned and visible; escalations are held, never silently dropped; a human gate is never bypassed');
CREATE TRIGGER layer_register_append_only BEFORE UPDATE OR DELETE ON objects.layer_register FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE objects.layer_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects.layer_register FORCE ROW LEVEL SECURITY;
CREATE POLICY layer_register_shared ON objects.layer_register FOR SELECT TO eye_app, eye_commit USING (true);
REVOKE ALL ON objects.layer_register FROM PUBLIC;
GRANT SELECT ON objects.layer_register TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION objects.layer_contracts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(c ORDER BY (c ->> 'layer')::int), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'layer', l.layer, 'name', l.name, 'chapter', l.chapter, 'units', to_jsonb(l.units), 'reads', to_jsonb(l.reads),
      'objects', (SELECT coalesce(jsonb_agg(jsonb_build_object('type', t,
                    'schemas', (SELECT coalesce(jsonb_agg(s.schema_version ORDER BY s.schema_version), '[]'::jsonb) FROM objects.schema_registry s WHERE s.object_type = t),
                    'header_profile', (SELECT p.object_type || '@' || p.profile_version FROM objects.header_profiles p WHERE p.object_type = t AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1),
                    'quality_profile', (SELECT p.quality_profile FROM objects.header_profiles p WHERE p.object_type = t AND p.state = 'active' ORDER BY p.profile_version DESC LIMIT 1)) ORDER BY t), '[]'::jsonb)
                  FROM unnest(l.objects) t),
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_type', e.event_type, 'interface', e.interface) ORDER BY e.event_type), '[]'::jsonb)
                   FROM graph.subscribable_event_types e WHERE e.interface LIKE 'L' || l.layer || '-I%'),
      'interfaces', (SELECT jsonb_build_object('total', count(*), 'bound', count(*) FILTER (WHERE i.binding_state = 'bound'), 'partial', count(*) FILTER (WHERE i.binding_state = 'partial'),
                                               'unbound', count(*) FILTER (WHERE i.binding_state = 'unbound')) FROM objects.interface_register i WHERE i.layer = l.layer),
      'header', jsonb_build_object('contract', 'the 43-field canonical header (ADR-0003) — identity, time, truth, provenance, policy, quality, schema, correction, audit blocks',
                                   'registry_fields', (SELECT count(*) FROM objects.canonical_field_registry)),
      'failure', jsonb_build_object('domains', to_jsonb(l.failure), 'affected', l.affected,
                                    'degraded_contracts', (SELECT count(*) FROM shell.degraded_contracts d WHERE d.dependency_key = ANY (l.failure)
                                                             AND (d.scope = 'PLATFORM' OR (d.tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR d.domain_id = public.eye_domain()))))),
      'missing', to_jsonb(array_remove(ARRAY[
          CASE WHEN EXISTS (SELECT 1 FROM unnest(l.objects) t WHERE NOT EXISTS (SELECT 1 FROM objects.schema_registry s WHERE s.object_type = t)) THEN 'object_schema' END,
          CASE WHEN EXISTS (SELECT 1 FROM unnest(l.objects) t WHERE NOT EXISTS (SELECT 1 FROM objects.header_profiles p WHERE p.object_type = t AND p.state = 'active')) THEN 'quality_profile' END,
          CASE WHEN NOT EXISTS (SELECT 1 FROM graph.subscribable_event_types e WHERE e.interface LIKE 'L' || l.layer || '-I%') THEN 'subscribable_event' END,
          CASE WHEN NOT EXISTS (SELECT 1 FROM shell.degraded_contracts d WHERE d.dependency_key = ANY (l.failure)
                                  AND (d.scope = 'PLATFORM' OR (d.tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR d.domain_id = public.eye_domain())))) THEN 'degraded_contract' END], NULL))
    ) c FROM objects.layer_register l) x $$;
REVOKE ALL ON FUNCTION objects.layer_contracts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.layer_contracts() TO eye_app, eye_commit;
