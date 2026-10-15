-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0115 §RG — CP-6 B107: THE REGISTRIES, BIDIRECTIONAL TRACEABILITY, ORPHAN DETECTION, DETERMINISTIC CHANGE IMPACT, THE VERIFICATION RECORD
-- AND THE FIXTURE REGISTRY (F-P7D-25 V03-T-474, ES-01-002, ES-02-001/-005, ES-03-001..004, ES-06-001..005, ES-67-001, V04-T-012, V04-T-017,
-- IA-02-001/-002/-003/-006, IA-06-001/-002/-003/-005/-006, V06-T-008, DP-02-001/-002/-003/-006, DP-07-001/-002/-003/-005/-006,
-- DP-67-002/-005; F-P7-F-12 PR-08-001/-002/-003/-005/-006, CAP-AU-09, AT-08, ADR-004). Applies alone on 0001–0114 + the prelude (§0).
--
-- WHAT IS BUILT
--   * THE IMPORTERS (read-only): a TS reader (src/governance/registries/importers.ts) parses the repository's registers —
--     audit/requirements/*.csv (requirements, their chapters, the V8 App A capabilities and App D journeys), audit/delivery/feature-rowmap.csv
--     (+ FEATURE_TRACKER.csv titles), DECISIONS.md (decision records), EXCEPTIONS.md (the ENGINEERING exception class — §PG governs the
--     in-product registry) — and objects.interface_register / objects.schema_registry, and feeds ONE governed PLATFORM port per source
--     (governance.rg_import) run by the conformance steward. Each run records the source's sha256 and is IDEMPOTENT (an unchanged source writes
--     nothing; an unchanged row writes nothing). A changed row is a NEW VERSION (the old one stays resolvable — ES-03-004); a row gone from
--     the source is a RETIRED version (never deleted). THE SOURCES ARE NEVER WRITTEN: the product never writes the CSVs, never marks a unit
--     verified:all, and an in-product record is never a leg pointer; the in-product status of a requirement is the register's, imported.
--   * THE NORMATIVE-ARTIFACT REGISTRY (ES-02-001, IA-02-001..003, DP-02-001..003, PR-08-003): identity, authority class, owner, lifecycle,
--     version, effective time, supersession, dependents (the incoming live links); THE CONTROL ORDER (governance.rg_authority_rank): a lower
--     authority never supersedes, governs or is inherited by a higher one, and a derived requirement never weakens its parent (ES-03-003).
--   * TRACE LINKS (the prelude's governance.links, written here with the versions and digests of both ends — machine-readable, versioned,
--     append-only, audited: ES-06-001/-005) and BIDIRECTIONAL queries, as of any instant (governance.rg_trace).
--   * ORPHANS (governance.rg_orphans): every artifact lacking a required link, by a closed rule list — listed, never hidden.
--   * DETERMINISTIC CHANGE IMPACT (governance.rg_impact / rg_record_impact — ES-02-005, ES-06-004): a changed (or proposed) artifact → its
--     dependents through the live links, breadth-first, ordered (depth, kind, key, id), digested: the same input over the same links gives the
--     same digest. Recorded impacts mark the dependent verifications STALE and HOLD the dependent release candidates (evidence_stale).
--   * INHERITANCE (governance.rg_inheritance / rg_reconcile_inheritance — IA-06-005, DP-07-005, PR-08-005): incomplete, circular, stale,
--     unverifiable, conflicting or out-of-order inheritance makes the artifact NON-CONFORMANT and HOLDS it and the capabilities depending on it
--     (capability acceptance held), names the affected journeys and release candidates and the highest controlling authority; a closed chain
--     LIFTS the holds. Nothing is inferred healthy: an artifact never checked reads `unchecked`.
--   * THE ADMISSION CHECK (governance.rg_admission_check — IA-02-006, IA-06-006, DP-02-006, DP-07-006): bidirectional closure, orphans, holds,
--     stale and missing verification for a subject; PRODUCTION ADMISSION IS R1 and is never claimed here.
--   * THE VERIFICATION RECORD (V04-T-012, ES-67-001): vitest / playwright JSON reports and gate receipts ingested as `evidence` (the record)
--     and `test` artifacts with IDENTITY / EXECUTION / VALIDITY dimensions; tests VERIFY the requirements their titles cite by EXACT id
--     (never by prose similarity); an accountable REVIEW by independent assurance (never the ingester or runner, never an agent).
--   * THE FIXTURE REGISTRY (DP-67-002/-005): identity, purpose, generator/source, schema, seed, classification, expected results, environment
--     scope, expiry; APPROVED by independent assurance (never a builder of the fixture); QUARANTINED when stale, non-representative,
--     contaminated, privacy-unsafe, irreproducible or indistinguishable — its dependent evidence INVALIDATED; REBUILT as a new version from an
--     approved generator; dependent verification re-run.
--   * THE BUILD IDENTITY read (ES-06-003; the migration head here, the head SHA / policy bundle / manifest digest in TS) stamped on the
--     declared set of §RG's own outputs: every import, impact and verification record.
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this code and phase6-registries-b107); DEMONSTRATED OPERATION (the act on eye_demo with SYNTHETIC
-- personas); REAL ACCEPTANCE / PRODUCTION ADMISSION (R1/R2/H3 — named authorities; never claimed: the admission check says so, a verification
-- record's claim is construction or demonstration only).
-- Re-declared here: nothing of 0001–0114 or the prelude. Added to the prelude's tables: three indexes (gln_source, gln_retires, gar_req_id).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §RG.1 INDEXES on the shared core (lookups the importer, the as-of reads and the citation resolution need) ──────────────────────────────────
CREATE INDEX IF NOT EXISTS gln_source ON governance.links ((attributes->>'source')) WHERE NOT retired;
CREATE INDEX IF NOT EXISTS gln_retires ON governance.links (retires_link);  -- every "not retired by a later row" test (links_live included) probes it
CREATE INDEX IF NOT EXISTS gar_req_id ON governance.artifacts ((split_part(external_key, ':', 2))) WHERE kind = 'requirement' AND superseded_at IS NULL;

-- §RG.2 THE VOCABULARY ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE CONTROL ORDER. Volume 0 (the product constitution) and Volume 2 (the controlled technical baseline) override every other document; the
   executive narrative (V1), the architecture (V3), engineering (V4), AI (V5), infrastructure and data (V6, V7 — peers), product and experience
   (V8, V9 — peers: "Volume 8 … may not redefine … future visual-system authority", PR-08-003), the commercial thesis (V10); then the project's
   decisions and engineering exceptions ("refine, and may never contradict, Volume 0 and Volume 3" — DECISIONS.md), manifests, implementation,
   verification and operational evidence (IA-02-001: "from Volume 0 through infrastructure manifests, implementation, verification, and
   operational evidence"). A lower number controls. Two classes of the SAME rank are peers: neither controls the other. */
CREATE OR REPLACE FUNCTION governance.rg_authority_rank(p_class text) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT CASE p_class
  WHEN 'constitutional' THEN 0 WHEN 'technical_baseline' THEN 1 WHEN 'doctrine' THEN 2 WHEN 'architecture' THEN 3 WHEN 'engineering' THEN 4
  WHEN 'ai' THEN 5 WHEN 'infrastructure' THEN 6 WHEN 'data' THEN 6 WHEN 'product' THEN 7 WHEN 'experience' THEN 7 WHEN 'commercial' THEN 8
  WHEN 'project_decision' THEN 9 WHEN 'project_exception' THEN 9 WHEN 'manifest' THEN 10 WHEN 'implementation' THEN 11 WHEN 'verification' THEN 12
  WHEN 'operational_evidence' THEN 13 END $$;
CREATE OR REPLACE FUNCTION governance.rg_volume_class(p_volume text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT CASE p_volume
  WHEN 'V0' THEN 'constitutional' WHEN 'V1' THEN 'doctrine' WHEN 'V2' THEN 'technical_baseline' WHEN 'V3' THEN 'architecture' WHEN 'V4' THEN 'engineering'
  WHEN 'V5' THEN 'ai' WHEN 'V6' THEN 'infrastructure' WHEN 'V7' THEN 'data' WHEN 'V8' THEN 'product' WHEN 'V9' THEN 'experience' WHEN 'V10' THEN 'commercial' END $$;
/* May `p_lower` inherit from / be governed by / be superseded by `p_upper`? (the upper controls: a strictly lower rank, or the SAME class) */
CREATE OR REPLACE FUNCTION governance.rg_controls(p_upper text, p_lower text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT p_upper IS NOT NULL AND p_lower IS NOT NULL AND governance.rg_authority_rank(p_upper) IS NOT NULL AND governance.rg_authority_rank(p_lower) IS NOT NULL
     AND (p_upper = p_lower OR governance.rg_authority_rank(p_upper) < governance.rg_authority_rank(p_lower)) $$;

/* THE DEPENDENCY DIRECTION of each relation: the side that is IMPACTED when the other side changes ('from' = "from depends on to");
   NULL = the relation does not propagate a change (ownership, supersession, a declared conflict). */
CREATE OR REPLACE FUNCTION governance.rg_dependent_side(p_relation text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT CASE
  WHEN p_relation IN ('implements', 'verifies', 'depends_on', 'derives_from', 'cites', 'covers', 'accepted_in', 'excepts', 'deploys', 'consumes',
                      'maps_to', 'evidences', 'contributes_to', 'part_of') THEN 'from'
  WHEN p_relation = 'governs' THEN 'to'
  ELSE NULL END $$;

/* The relation's kind constraints (NULL = admitted, else the reason). The links §RG records: a test or a record VERIFIES; a record EVIDENCES;
   supersession stays within a kind; a release DEPLOYS. Other parts' links are theirs. */
CREATE OR REPLACE FUNCTION governance.rg_relation_problem(p_relation text, p_from_kind text, p_to_kind text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT CASE
  WHEN p_relation = 'verifies' AND p_from_kind NOT IN ('test', 'evidence') THEN 'only a test or a verification record verifies'
  WHEN p_relation = 'evidences' AND p_from_kind <> 'evidence' THEN 'only evidence evidences'
  WHEN p_relation = 'supersedes' AND p_from_kind <> p_to_kind THEN 'an artifact supersedes only an artifact of its own kind'
  WHEN p_relation = 'deploys' AND p_from_kind NOT IN ('release_candidate', 'deployable_unit', 'manifest') THEN 'only a release candidate, a deployable unit or a manifest deploys'
  WHEN p_relation = 'derives_from' AND p_from_kind <> p_to_kind AND NOT (p_from_kind = 'standard' AND p_to_kind = 'requirement') AND NOT (p_from_kind = 'requirement' AND p_to_kind = 'standard')
    THEN 'derivation is between requirements or standards'
  ELSE NULL END $$;

/* THE REQUIRED LINKS (the orphan rules, a closed list): an artifact of `kind` (narrowed by `only_role`, never a `exempt_class` one) with no
   LIVE link of `relation` on `side` (out: it is the from; in: it is the to) to a current artifact of `other_kinds`, is an ORPHAN. */
CREATE OR REPLACE FUNCTION governance.rg_link_rules() RETURNS TABLE (rule_id text, kind text, relation text, side text, other_kinds text[], only_role text, exempt_class text, description text, basis text)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ VALUES
  ('RG-O01', 'requirement', 'implements', 'in', ARRAY['feature', 'component', 'deployable_unit', 'capability', 'interface', 'schema'], NULL, NULL, 'a requirement no feature or component implements', 'ES-01-002, ES-67-001 (the rowmap maps every row to a feature)'),
  ('RG-O02', 'requirement', 'part_of', 'out', ARRAY['standard'], NULL, NULL, 'a requirement not placed in its controlling chapter', 'V06-T-008: a requirement inherits every anchor of its chapter'),
  ('RG-O03', 'standard', 'derives_from', 'out', NULL, 'chapter', 'constitutional', 'a chapter with no upward anchor (constitutional invariant or controlling requirement)', 'V04-T-017, V06-T-008, V03-T-474'),
  ('RG-O04', 'capability', 'maps_to', 'out', ARRAY['requirement'], NULL, NULL, 'a capability with no requirement row', 'PR-08-001, CAP-AU-09'),
  ('RG-O05', 'journey', 'maps_to', 'out', ARRAY['requirement'], NULL, NULL, 'a journey with no requirement row', 'PR-08-002'),
  ('RG-O06', 'test', 'verifies', 'out', ARRAY['requirement', 'capability', 'journey', 'component', 'interface', 'schema', 'deployable_unit'], NULL, NULL, 'a test that verifies nothing named', 'ES-67-001, V04-T-012'),
  ('RG-O07', 'evidence', 'evidences', 'out', NULL, NULL, NULL, 'evidence that evidences nothing', 'V04-T-012'),
  ('RG-O08', 'fixture', 'consumes', 'in', ARRAY['test'], NULL, NULL, 'a fixture no test consumes', 'DP-67-002'),
  ('RG-O09', 'component', 'implements', 'out', ARRAY['requirement', 'capability', 'interface'], NULL, NULL, 'a component that implements no requirement', 'IA-06-001, ES-01-002'),
  ('RG-O10', 'deployable_unit', 'implements', 'out', ARRAY['requirement', 'capability', 'component', 'interface'], NULL, NULL, 'a deployable unit that implements nothing named', 'ES-06-002'),
  ('RG-O11', 'release_candidate', 'deploys', 'out', NULL, NULL, NULL, 'a release candidate that deploys nothing', 'ES-06-002, IA-06-006'),
  ('RG-O12', 'feature', 'implements', 'out', ARRAY['requirement'], NULL, NULL, 'a feature with no requirement row', 'PR-08-002'),
  ('RG-O13', 'exception', 'excepts', 'out', NULL, NULL, NULL, 'an exception that names no requirement it excepts', 'IA-02-002'),
  ('RG-O14', 'decision_record', 'cites', 'out', NULL, NULL, NULL, 'a decision record with no resolvable anchor', 'ES-02-001'),
  ('RG-O15', 'interface', 'maps_to', 'out', ARRAY['requirement'], NULL, NULL, 'an interface with no requirement row', 'V04-T-005, IA-06-001') $$;
GRANT EXECUTE ON FUNCTION governance.rg_authority_rank(text), governance.rg_volume_class(text), governance.rg_controls(text, text), governance.rg_dependent_side(text),
  governance.rg_relation_problem(text, text, text), governance.rg_link_rules() TO eye_app, eye_commit;

/* The deterministic identity of a registry artifact (ADR-004: stable identities): the same kind and key give the same id in every
   database — the act, the rehearsal and the harness agree; an identity is never re-keyed (a new key IS a new artifact). */
CREATE OR REPLACE FUNCTION governance.rg_artifact_id(p_kind text, p_key text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT md5('governance.rg:' || p_kind || ':' || p_key)::uuid $$;
/* The NORMATIVE digest (what a change means): the register's status (`attributes.register`) and a fixture's governance state (`approved_by`,
   `quarantine`) are carried — and versioned — but never change the digest (a link to it stays current). */
CREATE OR REPLACE FUNCTION governance.rg_content_digest(p_kind text, p_key text, p_title text, p_class text, p_volume text, p_attributes jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT governance.digest(jsonb_build_object('kind', p_kind, 'key', p_key, 'title', p_title, 'authority_class', p_class, 'controlling_volume', p_volume,
                                              'attributes', coalesce(p_attributes, '{}'::jsonb) - 'register' - 'approved_by' - 'quarantine')) $$;
GRANT EXECUTE ON FUNCTION governance.rg_artifact_id(text, text), governance.rg_content_digest(text, text, text, text, text, jsonb) TO eye_app, eye_commit;

-- §RG.3 THE TABLES ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* One row per import RUN that changed something (an unchanged source writes nothing): the source and its sha256, what changed. */
CREATE TABLE governance.rg_imports (
  import_id       uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id       uuid CHECK (tenant_id IS NULL),
  domain_id       uuid CHECK (domain_id IS NULL),
  source_kind     text NOT NULL CHECK (source_kind IN ('requirements', 'rowmap', 'decisions', 'exceptions', 'interfaces', 'schemas')),
  source_path     text NOT NULL CHECK (source_path ~ '^[A-Za-z0-9_][A-Za-z0-9_./-]{0,199}$' AND source_path !~ '\.\.'),
  source_digest   text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  parser_version  text NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count       int NOT NULL CHECK (row_count >= 0),
  counts          jsonb NOT NULL,
  changed         uuid[] NOT NULL DEFAULT '{}',
  unresolved      jsonb NOT NULL DEFAULT '[]'::jsonb,
  build_identity  jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_by     uuid NOT NULL,
  imported_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL
);
CREATE INDEX rgi_source ON governance.rg_imports (source_path, imported_at DESC);

/* A recorded CHANGE IMPACT (ES-02-005, ES-06-004): the ordered dependents and their digest; the stale verifications; the holds opened. */
CREATE TABLE governance.rg_impacts (
  impact_id       uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id       uuid CHECK (tenant_id IS NULL),
  domain_id       uuid CHECK (domain_id IS NULL),
  trigger         text NOT NULL CHECK (trigger IN ('import', 'register', 'change', 'proposal')),
  trigger_ref     uuid,
  input           jsonb NOT NULL,
  dependents      jsonb NOT NULL,
  counts          jsonb NOT NULL,
  stale_verifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  held            jsonb NOT NULL DEFAULT '[]'::jsonb,
  depth_limit     int NOT NULL CHECK (depth_limit BETWEEN 1 AND 12),
  truncated       boolean NOT NULL DEFAULT false,
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  build_identity  jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL
);

/* THE VERIFICATION RECORD (V04-T-012): identity, execution and validity of one report; its cases below. claim: construction (a harness or CI
   run) or demonstration (the act) — never acceptance. */
CREATE TABLE governance.rg_verification_records (
  record_id       uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id       uuid CHECK (tenant_id IS NULL),
  domain_id       uuid CHECK (domain_id IS NULL),
  source_kind     text NOT NULL CHECK (source_kind IN ('vitest', 'playwright', 'gate_receipt')),
  source_name     text NOT NULL CHECK (length(btrim(source_name)) BETWEEN 1 AND 200),
  source_digest   text NOT NULL UNIQUE CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  identity        jsonb NOT NULL,
  execution       jsonb NOT NULL,
  validity        jsonb NOT NULL,
  totals          jsonb NOT NULL,
  result          text NOT NULL CHECK (result IN ('passed', 'failed', 'mixed', 'unstated')),
  valid_until     timestamptz NOT NULL,
  claim           text NOT NULL CHECK (claim IN ('construction', 'demonstration')),
  build_identity  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_by     uuid NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL
);
CREATE TABLE governance.rg_verification_cases (
  record_id       uuid NOT NULL REFERENCES governance.rg_verification_records (record_id),
  case_no         int NOT NULL CHECK (case_no >= 1),
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id       uuid CHECK (tenant_id IS NULL),
  domain_id       uuid CHECK (domain_id IS NULL),
  test_artifact   uuid NOT NULL,
  test_version    int NOT NULL,
  status          text NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'todo', 'flaky', 'unstated')),
  duration_ms     numeric,
  cited           text[] NOT NULL DEFAULT '{}',
  resolved        uuid[] NOT NULL DEFAULT '{}',
  fixtures        uuid[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (record_id, case_no)
);
CREATE INDEX rgc_test ON governance.rg_verification_cases (test_artifact);
/* The accountable REVIEW of a record (ES-03-001: "independently reviewable"): independent assurance, never the ingester or the runner. */
CREATE TABLE governance.rg_verification_reviews (
  review_id       uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id       uuid CHECK (tenant_id IS NULL),
  domain_id       uuid CHECK (domain_id IS NULL),
  record_id       uuid NOT NULL REFERENCES governance.rg_verification_records (record_id),
  decision        text NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  record_digest   text NOT NULL CHECK (record_digest ~ '^[0-9a-f]{64}$'),
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  reviewer        uuid NOT NULL,
  reviewed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT rgr_one_per_reviewer UNIQUE (record_id, reviewer)
);
/* EVIDENCE INVALIDATED (DP-67-005): a record whose fixture was quarantined (or lapsed) is not evidence any more — recorded, never deleted. */
CREATE TABLE governance.rg_invalidations (
  invalidation_id uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id       uuid CHECK (tenant_id IS NULL),
  domain_id       uuid CHECK (domain_id IS NULL),
  record_id       uuid NOT NULL REFERENCES governance.rg_verification_records (record_id),
  cause_kind      text NOT NULL CHECK (cause_kind IN ('fixture_quarantined')),
  cause_artifact  uuid NOT NULL,
  cause_version   int NOT NULL,
  reason          text NOT NULL,
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT rgv_once UNIQUE (record_id, cause_artifact, cause_version)
);
/* The FIXTURE decisions (approve / quarantine / rebuild): the trail beside the fixture's versions. */
CREATE TABLE governance.rg_fixture_decisions (
  decision_id     uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id       uuid CHECK (tenant_id IS NULL),
  domain_id       uuid CHECK (domain_id IS NULL),
  fixture_artifact uuid NOT NULL,
  fixture_version int NOT NULL,
  decision        text NOT NULL CHECK (decision IN ('registered', 'approved', 'quarantined', 'rebuilt')),
  reason_class    text CHECK (reason_class IS NULL OR reason_class IN ('stale', 'non_representative', 'contaminated', 'privacy_unsafe', 'irreproducible', 'indistinguishable')),
  reason          text NOT NULL,
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  actor           uuid NOT NULL,
  decided_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL
);
/* Which holds §RG opened and why (the prelude's holds carry no origin): an inheritance finding on an artifact, or a recorded impact. */
CREATE TABLE governance.rg_hold_origins (
  hold_id         uuid PRIMARY KEY REFERENCES governance.holds (hold_id),
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id       uuid CHECK (tenant_id IS NULL),
  domain_id       uuid CHECK (domain_id IS NULL),
  origin          text NOT NULL CHECK (origin IN ('inheritance', 'impact')),
  origin_artifact uuid,
  impact_id       uuid REFERENCES governance.rg_impacts (impact_id),
  findings        jsonb NOT NULL DEFAULT '[]'::jsonb,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['governance.rg_imports', 'governance.rg_impacts', 'governance.rg_verification_records', 'governance.rg_verification_cases',
                           'governance.rg_verification_reviews', 'governance.rg_invalidations', 'governance.rg_fixture_decisions', 'governance.rg_hold_origins'] LOOP
    EXECUTE format('CREATE TRIGGER %s BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.raise_append_only()', replace(t, 'governance.', '') || '_append_only', t);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY governance_visibility ON %s USING (
      (scope = 'PLATFORM' AND public.eye_scope() <> 'NONE')
      OR (scope = 'TENANT' AND tenant_id = public.eye_tenant())
      OR (scope = 'DOMAIN' AND tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))
      OR public.eye_scope() = 'PLATFORM')$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §RG.4 THE INTERNAL WRITERS (not granted: only the ports below call them) ───────────────────────────────────────────────────────────────────
/* PUT an artifact: unchanged → nothing written; changed (content, lifecycle, owner or the register's status) → the current version superseded
   and version n+1 inserted at the same instant (ES-03-004: the old version stays resolvable as of its time). */
CREATE OR REPLACE FUNCTION governance.rg_put_artifact(p_kind text, p_key text, p_title text, p_class text, p_volume text, p_lifecycle text, p_attributes jsonb,
  p_owner uuid, p_owner_role text, p_source jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := governance.rg_artifact_id(p_kind, p_key); cur governance.artifacts%ROWTYPE; v_digest text; v_now timestamptz := clock_timestamp(); v_version int;
BEGIN
  v_digest := governance.rg_content_digest(p_kind, p_key, p_title, p_class, p_volume, p_attributes);
  SELECT * INTO cur FROM governance.artifacts a WHERE a.artifact_id = v_id AND a.superseded_at IS NULL FOR UPDATE;
  IF cur.artifact_id IS NOT NULL AND cur.digest = v_digest AND cur.lifecycle = p_lifecycle AND cur.attributes = coalesce(p_attributes, '{}'::jsonb) AND cur.title = p_title
     AND cur.owner_principal_id IS NOT DISTINCT FROM p_owner AND cur.owner_role IS NOT DISTINCT FROM p_owner_role THEN
    RETURN jsonb_build_object('artifact_id', v_id, 'version', cur.version, 'digest', cur.digest, 'changed', false, 'normative_change', false, 'created', false);
  END IF;
  IF cur.artifact_id IS NULL AND EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.kind = p_kind AND a.external_key = p_key AND a.scope = 'PLATFORM' AND a.superseded_at IS NULL) THEN
    RAISE EXCEPTION 'requirement registry rejected (duplicate): % % is registered under another identity', p_kind, p_key USING ERRCODE = '23505';
  END IF;
  v_version := coalesce(cur.version, 0) + 1;
  IF cur.artifact_id IS NOT NULL THEN
    UPDATE governance.artifacts SET superseded_at = v_now WHERE artifact_id = v_id AND version = cur.version;
  END IF;
  INSERT INTO governance.artifacts (artifact_id, version, scope, kind, external_key, title, owner_principal_id, owner_role, authority_class, controlling_volume, lifecycle,
                                    attributes, source, digest, effective_from, recorded_by, correlation_id)
  VALUES (v_id, v_version, 'PLATFORM', p_kind, p_key, p_title, p_owner, p_owner_role, p_class, p_volume, p_lifecycle, coalesce(p_attributes, '{}'::jsonb),
          coalesce(p_source, '{}'::jsonb), v_digest, v_now, p_actor, p_correlation);
  RETURN jsonb_build_object('artifact_id', v_id, 'version', v_version, 'digest', v_digest, 'changed', true, 'created', cur.artifact_id IS NULL,
                            'normative_change', cur.artifact_id IS NOT NULL AND cur.digest <> v_digest, 'previous_version', cur.version, 'previous_lifecycle', cur.lifecycle);
END $$;
REVOKE ALL ON FUNCTION governance.rg_put_artifact(text, text, text, text, text, text, jsonb, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* PUT a link (versioned: the versions and normative digests of both ends recorded): an identical LIVE link (same ends, relation and end
   digests) is kept; a link to an older version of an end is RE-ASSERTED (the old one retired by a later row, never updated). */
CREATE OR REPLACE FUNCTION governance.rg_put_link(p_from uuid, p_to uuid, p_relation text, p_attributes jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE f governance.artifacts%ROWTYPE; t governance.artifacts%ROWTYPE; v_old uuid; v_id uuid := gen_random_uuid(); v_attrs jsonb;
BEGIN
  SELECT * INTO f FROM governance.artifacts WHERE artifact_id = p_from AND superseded_at IS NULL;
  SELECT * INTO t FROM governance.artifacts WHERE artifact_id = p_to AND superseded_at IS NULL;
  SELECT l.link_id INTO v_old FROM governance.links_live l WHERE l.from_artifact = p_from AND l.to_artifact = p_to AND l.relation = p_relation
     AND l.attributes->>'from_digest' IS NOT DISTINCT FROM f.digest AND l.attributes->>'to_digest' IS NOT DISTINCT FROM t.digest ORDER BY l.recorded_at LIMIT 1;
  IF v_old IS NOT NULL THEN RETURN jsonb_build_object('link_id', v_old, 'created', false); END IF;
  -- an older assertion of the same link (an end moved): retired by a later row, then re-asserted
  INSERT INTO governance.links (link_id, scope, from_artifact, to_artifact, relation, retired, retires_link, attributes, recorded_by, correlation_id)
  SELECT gen_random_uuid(), 'PLATFORM', l.from_artifact, l.to_artifact, l.relation, true, l.link_id,
         jsonb_build_object('source', l.attributes->>'source', 'reason', 're-asserted over the current versions of its ends'), p_actor, p_correlation
    FROM governance.links_live l WHERE l.from_artifact = p_from AND l.to_artifact = p_to AND l.relation = p_relation;
  v_attrs := coalesce(p_attributes, '{}'::jsonb) || jsonb_build_object('from_version', f.version, 'to_version', t.version, 'from_digest', f.digest, 'to_digest', t.digest);
  INSERT INTO governance.links (link_id, scope, from_artifact, to_artifact, relation, attributes, recorded_by, correlation_id)
  VALUES (v_id, 'PLATFORM', p_from, p_to, p_relation, v_attrs, p_actor, p_correlation);
  RETURN jsonb_build_object('link_id', v_id, 'created', true);
END $$;
REVOKE ALL ON FUNCTION governance.rg_put_link(uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

-- §RG.5 THE READS (INVOKER: the caller's RLS — PLATFORM rows are readable by every authenticated context; another tenant's rows are not) ─────
/* The migration head (ES-06-003's schema version) — the build identity's database half; the head SHA, policy bundle and manifest digest are
   read by the API (build-identity.ts). Never inferred: an absent value reads null. */
CREATE OR REPLACE FUNCTION governance.rg_build_identity() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('migration_head', (SELECT max(filename) FROM public.schema_migrations), 'migrations', (SELECT count(*) FROM public.schema_migrations)) $$;
REVOKE ALL ON FUNCTION governance.rg_build_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_build_identity() TO eye_app, eye_commit;

/* A principal's display name for the registry pages: a PLATFORM-homed principal to a PLATFORM reader, or a principal of the reader's own
   tenant (products.catalog_principal_name answers only the latter — a vendor's steward would read blank). Nothing else is revealed. */
CREATE OR REPLACE FUNCTION governance.rg_principal_name(p_principal uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT p.display_name FROM identity.principals p
   WHERE p.id = p_principal AND ((p.scope = 'PLATFORM' AND public.eye_scope() = 'PLATFORM') OR (p.tenant_id IS NOT NULL AND p.tenant_id = public.eye_tenant())) $$;
REVOKE ALL ON FUNCTION governance.rg_principal_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_principal_name(uuid) TO eye_app, eye_commit;

/* An artifact as of an instant (the version in force then), or NULL. */
CREATE OR REPLACE FUNCTION governance.rg_at(p_artifact uuid, p_as_of timestamptz) RETURNS governance.artifacts
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT a.* FROM governance.artifacts a WHERE a.artifact_id = p_artifact AND a.effective_from <= p_as_of AND (a.superseded_at IS NULL OR a.superseded_at > p_as_of)
   ORDER BY a.version DESC LIMIT 1 $$;
GRANT EXECUTE ON FUNCTION governance.rg_at(uuid, timestamptz) TO eye_app, eye_commit;

/* THE WALK (breadth-first, deterministic): from the roots, `up` toward what they depend on (their authorities), `down` toward their
   dependents, over the links LIVE AS OF p_as_of (recorded by then and not retired by then), to the artifacts in force then. A node is
   reported once, at its least depth, through its first parent in (key, relation, link) order. `p_cap` bounds the answer; a truncated
   walk SAYS so. A link is STALE when an end's normative digest moved since it was asserted. */
CREATE OR REPLACE FUNCTION governance.rg_walk(p_roots uuid[], p_direction text, p_depth int, p_as_of timestamptz, p_cap int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v_seen jsonb := '{}'::jsonb; v_frontier uuid[]; v_level int := 0; v_rows jsonb := '[]'::jsonb; v_level_rows jsonb; v_lb jsonb; v_t timestamptz := coalesce(p_as_of, clock_timestamp());
        v_count int := 0; v_trunc boolean := false; v_back jsonb := '[]'::jsonb; v_cap int := greatest(coalesce(p_cap, 2000), 1); v_max int := least(greatest(coalesce(p_depth, 4), 1), 12); r uuid;
BEGIN
  IF p_direction IS NULL OR p_direction NOT IN ('up', 'down') THEN RAISE EXCEPTION 'trace link rejected (direction): a walk goes up or down' USING ERRCODE = '22023'; END IF;
  FOREACH r IN ARRAY coalesce(p_roots, '{}') LOOP v_seen := v_seen || jsonb_build_object(r::text, 0); END LOOP;
  v_frontier := coalesce(p_roots, '{}');
  WHILE v_level < v_max AND cardinality(v_frontier) > 0 LOOP
    v_level := v_level + 1;
    WITH live AS (
      SELECT l.link_id, l.relation, l.from_artifact, l.to_artifact, l.attributes AS lattrs FROM governance.links l
       WHERE NOT l.retired AND l.recorded_at <= v_t AND (l.from_artifact = ANY (v_frontier) OR l.to_artifact = ANY (v_frontier))
         AND NOT EXISTS (SELECT 1 FROM governance.links x WHERE x.retires_link = l.link_id AND x.recorded_at <= v_t)
    ), steps AS (
      SELECT e.*,
             CASE WHEN (coalesce(governance.rg_dependent_side(e.relation), 'from') = 'from') = (p_direction = 'up') THEN e.from_artifact ELSE e.to_artifact END AS here,
             CASE WHEN (coalesce(governance.rg_dependent_side(e.relation), 'from') = 'from') = (p_direction = 'up') THEN e.to_artifact ELSE e.from_artifact END AS there
        FROM live e
    ), hits AS (
      SELECT s.link_id, s.relation, s.here, s.there, s.lattrs, (governance.rg_at(s.here, v_t)).external_key AS here_key,
             n.kind AS n_kind, n.external_key AS n_key, n.title AS n_title, n.version AS n_version, n.lifecycle AS n_lifecycle, n.authority_class AS n_class,
             n.controlling_volume AS n_volume, n.digest AS n_digest, n.attributes->>'evidence_kind' AS n_evidence_kind, n.scope AS n_scope, n.tenant_id AS n_tenant, n.domain_id AS n_domain,
             (governance.rg_at(s.from_artifact, v_t)).digest AS fd, (governance.rg_at(s.to_artifact, v_t)).digest AS td
        FROM steps s CROSS JOIN LATERAL governance.rg_at(s.there, v_t) n
       WHERE s.here = ANY (v_frontier) AND n.artifact_id IS NOT NULL
         -- a recorded change impact is an analysis OF its subjects, never a dependent of them
         AND NOT (p_direction = 'down' AND n.kind = 'evidence' AND coalesce(n.attributes->>'evidence_kind', '') = 'change_impact')
    ), firsts AS (
      SELECT DISTINCT ON (h.there) h.* FROM hits h WHERE NOT (v_seen ? h.there::text) ORDER BY h.there, h.here_key, h.relation, h.link_id
    )
    SELECT (SELECT coalesce(jsonb_agg(jsonb_build_object(
               'depth', v_level, 'artifact_id', f.there, 'kind', f.n_kind, 'key', f.n_key, 'title', f.n_title, 'version', f.n_version, 'lifecycle', f.n_lifecycle,
               'authority_class', f.n_class, 'controlling_volume', f.n_volume, 'digest', f.n_digest, 'relation', f.relation, 'via', f.here, 'link_id', f.link_id,
               'scope', f.n_scope, 'tenant_id', f.n_tenant, 'domain_id', f.n_domain,
               'stale', (f.lattrs ? 'to_digest') AND (f.lattrs->>'to_digest' IS DISTINCT FROM f.td OR f.lattrs->>'from_digest' IS DISTINCT FROM f.fd))
             ORDER BY f.n_kind, f.n_key, f.there), '[]'::jsonb) FROM firsts f),
           (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('root', h.there, 'from', h.here, 'relation', h.relation)), '[]'::jsonb)
              FROM hits h WHERE h.there = ANY (p_roots) AND governance.rg_dependent_side(h.relation) IS NOT NULL)
      INTO v_level_rows, v_lb;
    v_back := v_back || v_lb;
    IF jsonb_array_length(v_level_rows) = 0 THEN EXIT; END IF;
    IF v_count + jsonb_array_length(v_level_rows) > v_cap THEN
      v_level_rows := (SELECT coalesce(jsonb_agg(x ORDER BY o), '[]'::jsonb) FROM jsonb_array_elements(v_level_rows) WITH ORDINALITY AS e(x, o) WHERE o <= v_cap - v_count);
      v_trunc := true;
    END IF;
    v_rows := v_rows || v_level_rows; v_count := v_count + jsonb_array_length(v_level_rows);
    IF v_trunc THEN EXIT; END IF;
    v_seen := v_seen || (SELECT jsonb_object_agg(x->>'artifact_id', v_level) FROM jsonb_array_elements(v_level_rows) x);
    v_frontier := ARRAY(SELECT (x->>'artifact_id')::uuid FROM jsonb_array_elements(v_level_rows) x);
  END LOOP;
  RETURN jsonb_build_object('direction', p_direction, 'as_of', v_t, 'depth', v_level, 'count', v_count, 'truncated', v_trunc, 'nodes', v_rows, 'back_to_root', v_back);
END $$;
GRANT EXECUTE ON FUNCTION governance.rg_walk(uuid[], text, int, timestamptz, int) TO eye_app, eye_commit;

/* BIDIRECTIONAL TRACE (ES-06-001, PR-08-001, CAP-AU-09): the artifact as of the instant, its upward chain (authorities) and its downward
   dependents (tests, evidence, components, releases …). */
CREATE OR REPLACE FUNCTION governance.rg_trace(p_artifact uuid, p_depth int, p_as_of timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v_t timestamptz := coalesce(p_as_of, clock_timestamp()); a governance.artifacts;
BEGIN
  a := governance.rg_at(p_artifact, v_t);
  IF a.artifact_id IS NULL THEN RAISE EXCEPTION 'trace link rejected (unknown_artifact): no artifact % is in force as of %', p_artifact, v_t USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('artifact', to_jsonb(a), 'as_of', v_t,
    'up', governance.rg_walk(ARRAY[p_artifact], 'up', coalesce(p_depth, 4), v_t, 2000),
    'down', governance.rg_walk(ARRAY[p_artifact], 'down', coalesce(p_depth, 4), v_t, 2000),
    'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('version', v.version, 'lifecycle', v.lifecycle, 'digest', v.digest, 'effective_from', v.effective_from, 'superseded_at', v.superseded_at)
                                           ORDER BY v.version), '[]'::jsonb) FROM governance.artifacts v WHERE v.artifact_id = p_artifact));
END $$;
GRANT EXECUTE ON FUNCTION governance.rg_trace(uuid, int, timestamptz) TO eye_app, eye_commit;

/* DETERMINISTIC CHANGE IMPACT (ES-02-005, ES-06-004): the input normalised (sorted, each with its current version and digest and the proposed
   digest if any), the dependents (the downward walk over the live links, ordered depth, kind, key, id), the classes the clause names
   (requirements, tests and evidence — the verifications now STALE —, components, capabilities, journeys, releases, decision-active products),
   and ONE digest over input + dependents. The same input over the same links and versions gives the same digest. */
CREATE OR REPLACE FUNCTION governance.rg_impact(p_changes jsonb, p_depth int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v_input jsonb; v_roots uuid[]; v_walk jsonb; v_deps jsonb; v_reqs jsonb; v_depth int := least(greatest(coalesce(p_depth, 8), 1), 12);
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0 OR jsonb_array_length(p_changes) > 500 THEN
    RAISE EXCEPTION 'change impact rejected (changes): name 1–500 changed artifacts' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('artifact_id', a.artifact_id, 'kind', a.kind, 'key', a.external_key, 'version', a.version, 'digest', a.digest,
                                      'proposed_digest', c.proposed) ORDER BY a.kind, a.external_key, a.artifact_id),
         array_agg(a.artifact_id ORDER BY a.artifact_id)
    INTO v_input, v_roots
    FROM (SELECT DISTINCT ON ((x->>'artifact_id')) (x->>'artifact_id')::uuid AS id, nullif(x->>'proposed_digest', '') AS proposed FROM jsonb_array_elements(p_changes) x
           WHERE coalesce(x->>'artifact_id', '') ~ '^[0-9a-f-]{36}$' ORDER BY (x->>'artifact_id'), x->>'proposed_digest') c
    JOIN governance.artifacts a ON a.artifact_id = c.id AND a.superseded_at IS NULL;
  IF v_roots IS NULL OR cardinality(v_roots) <> (SELECT count(DISTINCT x->>'artifact_id') FROM jsonb_array_elements(p_changes) x) THEN
    RAISE EXCEPTION 'change impact rejected (unknown_artifact): every changed artifact is a current registry artifact' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_input) x WHERE x->>'proposed_digest' IS NOT NULL AND x->>'proposed_digest' !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'change impact rejected (digest): a proposed digest is 64 hex' USING ERRCODE = '22023';
  END IF;
  v_walk := governance.rg_walk(v_roots, 'down', v_depth, NULL, 20000);
  -- the REQUIREMENTS whose conformance is re-evaluated: those the changed artifacts and their dependent components, units, interfaces,
  -- schemas and capabilities realise (upward, 3 steps)
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('artifact_id', n->>'artifact_id', 'key', n->>'key', 'version', (n->>'version')::int, 'digest', n->>'digest')), '[]'::jsonb)
    INTO v_reqs FROM jsonb_array_elements((governance.rg_walk(v_roots || ARRAY(SELECT (x->>'artifact_id')::uuid FROM jsonb_array_elements(v_walk->'nodes') x
                                                                              WHERE x->>'kind' IN ('component', 'deployable_unit', 'interface', 'schema', 'capability') ORDER BY 1),
                                                             'up', 3, NULL, 5000))->'nodes') n WHERE n->>'kind' = 'requirement';
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'key', x->>'artifact_id'), '[]'::jsonb) INTO v_reqs FROM jsonb_array_elements(v_reqs) x;
  SELECT coalesce(jsonb_agg(jsonb_build_object('artifact_id', n->>'artifact_id', 'kind', n->>'kind', 'key', n->>'key', 'title', n->>'title', 'version', (n->>'version')::int,
                                               'digest', n->>'digest', 'depth', (n->>'depth')::int, 'relation', n->>'relation', 'via', n->>'via', 'lifecycle', n->>'lifecycle',
                                               'scope', n->>'scope', 'tenant_id', n->>'tenant_id', 'domain_id', n->>'domain_id')
                            ORDER BY (n->>'depth')::int, n->>'kind', n->>'key', n->>'artifact_id'), '[]'::jsonb)
    INTO v_deps FROM jsonb_array_elements(v_walk->'nodes') n;
  RETURN jsonb_build_object(
    'input', v_input, 'depth_limit', v_depth, 'truncated', (v_walk->>'truncated')::boolean, 'dependents', v_deps,
    'counts', (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (SELECT d->>'kind' AS k, count(*) AS n FROM jsonb_array_elements(v_deps) d GROUP BY 1) s),
    'stale_verifications', (SELECT coalesce(jsonb_agg(d ORDER BY d->>'kind', d->>'key'), '[]'::jsonb) FROM jsonb_array_elements(v_deps) d WHERE d->>'kind' IN ('test', 'evidence')),
    'release_candidates', (SELECT coalesce(jsonb_agg(d ORDER BY d->>'key'), '[]'::jsonb) FROM jsonb_array_elements(v_deps) d WHERE d->>'kind' = 'release_candidate'),
    'decision_active', (SELECT coalesce(jsonb_agg(d ORDER BY d->>'key'), '[]'::jsonb) FROM jsonb_array_elements(v_deps) d WHERE d->>'kind' IN ('data_product', 'decision_record', 'acceptance_record', 'baseline')),
    'requirements_to_reverify', v_reqs,
    'digest', governance.digest(jsonb_build_object('input', v_input, 'depth_limit', v_depth, 'requirements', v_reqs,
              'dependents', (SELECT coalesce(jsonb_agg(jsonb_build_array(d->>'artifact_id', d->'version', d->>'digest', d->'depth', d->>'relation', d->>'via')
                                                       ORDER BY (d->>'depth')::int, d->>'kind', d->>'key', d->>'artifact_id'), '[]'::jsonb) FROM jsonb_array_elements(v_deps) d))));
END $$;
GRANT EXECUTE ON FUNCTION governance.rg_impact(jsonb, int) TO eye_app, eye_commit;

/* ORPHANS (ES-06-001, IA-06-006, PR-08-006, CAP-AU-09 "orphan-free"): per rule, the current artifacts lacking the required live link (and the
   mandatory requirements with neither a verification method nor a verifying test — ES-03-001, ES-67-001: rule RG-V01). Counted and listed;
   never hidden. p_ids narrows to a set (the admission check); p_rule to one rule. */
CREATE OR REPLACE FUNCTION governance.rg_orphan_rows(p_ids uuid[], p_rule text) RETURNS TABLE (rule_id text, artifact_id uuid, kind text, external_key text, title text)
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT r.rule_id, a.artifact_id, a.kind, a.external_key, a.title
    FROM governance.rg_link_rules() r
    JOIN governance.artifacts a ON a.kind = r.kind AND a.superseded_at IS NULL AND a.lifecycle IN ('active', 'proposed', 'deprecated')
                               AND (r.only_role IS NULL OR a.attributes->>'role' = r.only_role) AND (r.exempt_class IS NULL OR a.authority_class IS DISTINCT FROM r.exempt_class)
   WHERE (p_rule IS NULL OR r.rule_id = p_rule) AND (p_ids IS NULL OR a.artifact_id = ANY (p_ids)) AND r.side = 'out'
     AND NOT EXISTS (SELECT 1 FROM governance.links l JOIN governance.artifacts o ON o.artifact_id = l.to_artifact AND o.superseded_at IS NULL AND o.lifecycle NOT IN ('retired', 'superseded')
                      WHERE l.from_artifact = a.artifact_id AND l.relation = r.relation AND NOT l.retired AND (r.other_kinds IS NULL OR o.kind = ANY (r.other_kinds))
                        AND NOT EXISTS (SELECT 1 FROM governance.links x WHERE x.retires_link = l.link_id))
  UNION ALL
  SELECT r.rule_id, a.artifact_id, a.kind, a.external_key, a.title
    FROM governance.rg_link_rules() r
    JOIN governance.artifacts a ON a.kind = r.kind AND a.superseded_at IS NULL AND a.lifecycle IN ('active', 'proposed', 'deprecated')
                               AND (r.only_role IS NULL OR a.attributes->>'role' = r.only_role) AND (r.exempt_class IS NULL OR a.authority_class IS DISTINCT FROM r.exempt_class)
   WHERE (p_rule IS NULL OR r.rule_id = p_rule) AND (p_ids IS NULL OR a.artifact_id = ANY (p_ids)) AND r.side = 'in'
     AND NOT EXISTS (SELECT 1 FROM governance.links l JOIN governance.artifacts o ON o.artifact_id = l.from_artifact AND o.superseded_at IS NULL AND o.lifecycle NOT IN ('retired', 'superseded')
                      WHERE l.to_artifact = a.artifact_id AND l.relation = r.relation AND NOT l.retired AND (r.other_kinds IS NULL OR o.kind = ANY (r.other_kinds))
                        AND NOT EXISTS (SELECT 1 FROM governance.links x WHERE x.retires_link = l.link_id))
  UNION ALL
  SELECT 'RG-V01', a.artifact_id, a.kind, a.external_key, a.title
    FROM governance.artifacts a
   WHERE (p_rule IS NULL OR p_rule = 'RG-V01') AND (p_ids IS NULL OR a.artifact_id = ANY (p_ids))
     AND a.kind = 'requirement' AND a.superseded_at IS NULL AND a.lifecycle IN ('active', 'proposed') AND coalesce(a.attributes->>'mandatory', 'false') = 'true'
     AND coalesce(a.attributes->>'verification_method', '') = ''
     AND NOT EXISTS (SELECT 1 FROM governance.links l WHERE l.to_artifact = a.artifact_id AND l.relation = 'verifies' AND NOT l.retired
                        AND NOT EXISTS (SELECT 1 FROM governance.links x WHERE x.retires_link = l.link_id)) $$;
GRANT EXECUTE ON FUNCTION governance.rg_orphan_rows(uuid[], text) TO eye_app, eye_commit;
CREATE OR REPLACE FUNCTION governance.rg_orphans(p_rule text, p_limit int, p_offset int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  WITH o AS (SELECT * FROM governance.rg_orphan_rows(NULL, p_rule)),
  rules AS (SELECT r.rule_id, r.kind, r.relation, r.side, r.description, r.basis FROM governance.rg_link_rules() r
            UNION ALL SELECT 'RG-V01', 'requirement', 'verifies', 'in', 'a mandatory requirement with neither a verification method nor a verifying test', 'ES-03-001, ES-67-001')
  SELECT jsonb_build_object('evaluated_at', clock_timestamp(), 'total', (SELECT count(*) FROM o),
    'rules', (SELECT jsonb_agg(jsonb_build_object('rule_id', r.rule_id, 'kind', r.kind, 'relation', r.relation, 'side', r.side, 'description', r.description, 'basis', r.basis,
                 'count', (SELECT count(*) FROM o WHERE o.rule_id = r.rule_id),
                 'orphans', (SELECT coalesce(jsonb_agg(jsonb_build_object('artifact_id', x.artifact_id, 'kind', x.kind, 'key', x.external_key, 'title', x.title) ORDER BY x.external_key), '[]'::jsonb)
                               FROM (SELECT * FROM o WHERE o.rule_id = r.rule_id ORDER BY o.external_key, o.artifact_id LIMIT least(greatest(coalesce(p_limit, 25), 0), 500) OFFSET greatest(coalesce(p_offset, 0), 0)) x))
               ORDER BY r.rule_id) FROM rules r WHERE p_rule IS NULL OR r.rule_id = p_rule)) $$;
GRANT EXECUTE ON FUNCTION governance.rg_orphans(text, int, int) TO eye_app, eye_commit;

/* The OBLIGATION strength of a requirement (SHALL / MUST > SHOULD > MAY) and the threshold's strictness, for the "never weaken" rule. */
CREATE OR REPLACE FUNCTION governance.rg_strength(p_attributes jsonb) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT CASE upper(coalesce(p_attributes->>'obligation', ''))
  WHEN 'SHALL' THEN 3 WHEN 'MUST' THEN 3 WHEN 'SHALL NOT' THEN 3 WHEN 'MUST NOT' THEN 3 WHEN 'SHOULD' THEN 2 WHEN 'SHOULD NOT' THEN 2 WHEN 'MAY' THEN 1 ELSE NULL END $$;
/* Does the child's declared threshold weaken the parent's? ({value, direction: min|max}: a `min` threshold weakens when lower, a `max` when higher.) */
CREATE OR REPLACE FUNCTION governance.rg_weakens(p_child jsonb, p_parent jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE c jsonb := p_child->'threshold'; p jsonb := p_parent->'threshold';
BEGIN
  IF governance.rg_strength(p_parent) IS NOT NULL AND (governance.rg_strength(p_child) IS NULL OR governance.rg_strength(p_child) < governance.rg_strength(p_parent)) THEN
    RETURN format('the obligation %s is weaker than the parent''s %s', coalesce(p_child->>'obligation', '<none>'), p_parent->>'obligation');
  END IF;
  IF p IS NOT NULL AND jsonb_typeof(p) = 'object' THEN
    IF c IS NULL OR jsonb_typeof(c) <> 'object' OR c->>'direction' IS DISTINCT FROM p->>'direction' OR jsonb_typeof(c->'value') <> 'number' THEN
      RETURN 'the parent declares an acceptance threshold the derived requirement does not carry in the same direction';
    END IF;
    IF (p->>'direction' = 'min' AND (c->>'value')::numeric < (p->>'value')::numeric) OR (p->>'direction' = 'max' AND (c->>'value')::numeric > (p->>'value')::numeric) THEN
      RETURN format('the threshold %s (%s) is weaker than the parent''s %s', c->>'value', c->>'direction', p->>'value');
    END IF;
  END IF;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION governance.rg_strength(jsonb), governance.rg_weakens(jsonb, jsonb) TO eye_app, eye_commit;

/* THE LINT (ES-02-001, ES-03-002/-003, IA-02-003, DP-02-003, PR-08-003): every live link that breaks the control order (supersedes, governs,
   derives_from, part_of: the controlling end must control); every derived requirement that weakens its parent; every requirement whose text
   carries more than one controlling obligation (compound — ES-03-002, as the importer counted it); every normative artifact without a
   declared owner; every circular derivation. Listed, counted — never fixed by inference. */
CREATE OR REPLACE FUNCTION governance.rg_lint(p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  WITH live AS (SELECT l.* FROM governance.links l WHERE NOT l.retired AND NOT EXISTS (SELECT 1 FROM governance.links x WHERE x.retires_link = l.link_id)
                  AND l.relation IN ('supersedes', 'governs', 'derives_from', 'part_of')),
  pairs AS (SELECT l.link_id, l.relation, f.artifact_id AS from_id, f.external_key AS from_key, f.authority_class AS from_class, f.attributes AS from_attrs, f.kind AS from_kind,
                   t.artifact_id AS to_id, t.external_key AS to_key, t.authority_class AS to_class, t.attributes AS to_attrs, t.kind AS to_kind
              FROM live l JOIN governance.artifacts f ON f.artifact_id = l.from_artifact AND f.superseded_at IS NULL
                          JOIN governance.artifacts t ON t.artifact_id = l.to_artifact AND t.superseded_at IS NULL),
  order_v AS (SELECT p.*, CASE p.relation WHEN 'governs' THEN NOT governance.rg_controls(p.from_class, p.to_class)
                                         WHEN 'supersedes' THEN NOT governance.rg_controls(p.from_class, p.to_class)
                                         ELSE NOT governance.rg_controls(p.to_class, p.from_class) END AS bad FROM pairs p),
  weak AS (SELECT p.*, governance.rg_weakens(p.from_attrs, p.to_attrs) AS why FROM pairs p WHERE p.relation = 'derives_from' AND p.from_kind = 'requirement' AND p.to_kind = 'requirement'),
  compound AS (SELECT a.artifact_id, a.external_key FROM governance.artifacts a WHERE a.kind = 'requirement' AND a.superseded_at IS NULL AND coalesce((a.attributes->>'obligations')::int, 0) > 1),
  ownerless AS (SELECT a.artifact_id, a.kind, a.external_key FROM governance.artifacts a WHERE a.superseded_at IS NULL AND a.scope = 'PLATFORM' AND a.lifecycle IN ('active', 'proposed')
                  AND a.kind IN ('requirement', 'standard', 'capability', 'journey', 'policy_bundle', 'decision_record', 'component', 'interface', 'schema')
                  AND a.owner_principal_id IS NULL AND a.owner_role IS NULL AND coalesce(a.attributes->>'owner_declared', '') = ''),
  cyc AS (
    WITH RECURSIVE w(start, node, path, cyc) AS (
      SELECT l.from_artifact, l.to_artifact, ARRAY[l.from_artifact, l.to_artifact], l.from_artifact = l.to_artifact
        FROM live l WHERE l.relation IN ('derives_from', 'supersedes', 'part_of')
      UNION ALL
      SELECT w.start, l.to_artifact, w.path || l.to_artifact, l.to_artifact = ANY (w.path)
        FROM w JOIN live l ON l.from_artifact = w.node AND l.relation IN ('derives_from', 'supersedes', 'part_of')
       WHERE NOT w.cyc AND cardinality(w.path) < 24)
    SELECT DISTINCT start FROM w WHERE cyc AND node = start)
  SELECT jsonb_build_object('evaluated_at', clock_timestamp(),
    'control_order', jsonb_build_object('count', (SELECT count(*) FROM order_v WHERE bad), 'findings', (SELECT coalesce(jsonb_agg(jsonb_build_object('link_id', o.link_id, 'relation', o.relation,
         'from', o.from_key, 'from_class', o.from_class, 'to', o.to_key, 'to_class', o.to_class) ORDER BY o.from_key, o.to_key), '[]'::jsonb)
         FROM (SELECT * FROM order_v WHERE bad ORDER BY from_key, to_key LIMIT coalesce(p_limit, 50)) o)),
    'weakening', jsonb_build_object('count', (SELECT count(*) FROM weak WHERE why IS NOT NULL), 'findings', (SELECT coalesce(jsonb_agg(jsonb_build_object('link_id', w.link_id, 'from', w.from_key, 'to', w.to_key, 'why', w.why) ORDER BY w.from_key), '[]'::jsonb)
         FROM (SELECT * FROM weak WHERE why IS NOT NULL ORDER BY from_key LIMIT coalesce(p_limit, 50)) w)),
    'compound', jsonb_build_object('count', (SELECT count(*) FROM compound), 'sample', (SELECT coalesce(jsonb_agg(c.external_key ORDER BY c.external_key), '[]'::jsonb)
         FROM (SELECT * FROM compound ORDER BY external_key LIMIT coalesce(p_limit, 50)) c)),
    'ownerless', jsonb_build_object('count', (SELECT count(*) FROM ownerless), 'sample', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', o.kind, 'key', o.external_key) ORDER BY o.kind, o.external_key), '[]'::jsonb)
         FROM (SELECT * FROM ownerless ORDER BY kind, external_key LIMIT coalesce(p_limit, 50)) o)),
    'circular', jsonb_build_object('count', (SELECT count(*) FROM cyc), 'artifacts', (SELECT coalesce(jsonb_agg(c.start ORDER BY c.start), '[]'::jsonb) FROM cyc c))) $$;
GRANT EXECUTE ON FUNCTION governance.rg_lint(int) TO eye_app, eye_commit;

/* Is a test's verification CURRENT? The newest record evidencing the test's CURRENT version, passed, unexpired, not invalidated. */
CREATE OR REPLACE FUNCTION governance.rg_test_evidence(p_test uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT jsonb_build_object('record_id', r.record_id, 'status', c.status, 'ingested_at', r.ingested_at, 'valid_until', r.valid_until,
            'current', c.test_version = t.version AND c.status = 'passed' AND r.valid_until > clock_timestamp()
                       AND NOT EXISTS (SELECT 1 FROM governance.rg_invalidations i WHERE i.record_id = r.record_id),
            'expired', r.valid_until <= clock_timestamp(), 'invalidated', EXISTS (SELECT 1 FROM governance.rg_invalidations i WHERE i.record_id = r.record_id),
            'version_moved', c.test_version <> t.version)
         FROM governance.rg_verification_cases c JOIN governance.rg_verification_records r ON r.record_id = c.record_id
         JOIN governance.artifacts t ON t.artifact_id = c.test_artifact AND t.superseded_at IS NULL
        WHERE c.test_artifact = p_test ORDER BY r.ingested_at DESC, r.record_id LIMIT 1),
    jsonb_build_object('record_id', NULL, 'current', false, 'status', 'never_verified')) $$;
GRANT EXECUTE ON FUNCTION governance.rg_test_evidence(uuid) TO eye_app, eye_commit;

/* INHERITANCE (IA-06-005, DP-07-005, PR-08-005, V04-T-017, V06-T-008): the artifact's upward chain must reach a CONSTITUTIONAL authority,
   without a cycle, with every link current (no end moved since it was asserted, no end retired, superseded or quarantined), verifiable
   (a requirement: a method or a verifying test; a test: current passing evidence), free of a declared conflict and of a control-order
   break. The highest controlling authority among the chain is named; the affected capabilities, journeys and release candidates (the
   downward walk) are exposed. A finding never makes a guess: an unreachable anchor reads `incomplete`. */
CREATE OR REPLACE FUNCTION governance.rg_inheritance(p_artifact uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE a governance.artifacts; v_up jsonb; v_down jsonb; v_findings jsonb := '[]'::jsonb; v_ids uuid[]; v_ctrl jsonb; v_ev jsonb;
BEGIN
  SELECT * INTO a FROM governance.artifacts WHERE artifact_id = p_artifact AND superseded_at IS NULL;
  IF a.artifact_id IS NULL THEN RAISE EXCEPTION 'trace link rejected (unknown_artifact): no current artifact %', p_artifact USING ERRCODE = '22023'; END IF;
  v_up := governance.rg_walk(ARRAY[p_artifact], 'up', 10, NULL, 2000);
  v_down := governance.rg_walk(ARRAY[p_artifact], 'down', 6, NULL, 2000);
  v_ids := ARRAY(SELECT (n->>'artifact_id')::uuid FROM jsonb_array_elements(v_up->'nodes') n) || p_artifact;
  -- incomplete: no constitutional authority up the chain (a constitutional artifact anchors itself)
  IF a.authority_class IS DISTINCT FROM 'constitutional' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_up->'nodes') n WHERE n->>'authority_class' = 'constitutional') THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object('class', 'incomplete', 'detail', 'the upward chain reaches no constitutional authority (Volume 0)',
      'artifacts', (SELECT coalesce(jsonb_agg(n->>'key' ORDER BY (n->>'depth')::int, n->>'key'), '[]'::jsonb) FROM jsonb_array_elements(v_up->'nodes') n)));
  END IF;
  IF jsonb_array_length(v_up->'back_to_root') > 0 THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object('class', 'circular', 'detail', 'the chain returns to the artifact itself', 'artifacts', v_up->'back_to_root'));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_up->'nodes') n WHERE (n->>'stale')::boolean OR n->>'lifecycle' IN ('retired', 'superseded', 'quarantined')) THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object('class', 'stale', 'detail', 'an authority up the chain moved since the link was asserted, or is retired, superseded or quarantined',
      'artifacts', (SELECT jsonb_agg(n->>'key' ORDER BY n->>'key') FROM jsonb_array_elements(v_up->'nodes') n WHERE (n->>'stale')::boolean OR n->>'lifecycle' IN ('retired', 'superseded', 'quarantined'))));
  END IF;
  IF a.kind = 'requirement' AND coalesce(a.attributes->>'verification_method', '') = ''
     AND NOT EXISTS (SELECT 1 FROM governance.links_live l WHERE l.to_artifact = p_artifact AND l.relation = 'verifies') THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object('class', 'unverifiable', 'detail', 'neither a verification method nor a verifying test (ES-03-001)', 'artifacts', jsonb_build_array(a.external_key)));
  ELSIF a.kind = 'test' THEN
    v_ev := governance.rg_test_evidence(p_artifact);
    IF NOT coalesce((v_ev->>'current')::boolean, false) THEN
      v_findings := v_findings || jsonb_build_array(jsonb_build_object('class', 'unverifiable', 'detail', 'no current passing evidence for this test version', 'evidence', v_ev));
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM governance.links_live l WHERE l.relation = 'conflicts_with' AND l.from_artifact = ANY (v_ids) AND l.to_artifact = ANY (v_ids)) THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object('class', 'conflicting', 'detail', 'a declared conflict inside the chain; the highest controlling authority decides',
      'links', (SELECT jsonb_agg(l.link_id) FROM governance.links_live l WHERE l.relation = 'conflicts_with' AND l.from_artifact = ANY (v_ids) AND l.to_artifact = ANY (v_ids))));
  END IF;
  IF EXISTS (SELECT 1 FROM governance.links_live l JOIN governance.artifacts f ON f.artifact_id = l.from_artifact AND f.superseded_at IS NULL
                     JOIN governance.artifacts t ON t.artifact_id = l.to_artifact AND t.superseded_at IS NULL
              WHERE l.from_artifact = ANY (v_ids) AND l.relation IN ('derives_from', 'part_of') AND NOT governance.rg_controls(t.authority_class, f.authority_class)) THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object('class', 'control_order', 'detail', 'a lower authority is placed above a higher one in the chain'));
  END IF;
  SELECT jsonb_build_object('artifact_id', x.artifact_id, 'key', x.external_key, 'authority_class', x.authority_class, 'rank', governance.rg_authority_rank(x.authority_class)) INTO v_ctrl
    FROM governance.artifacts x WHERE x.artifact_id = ANY (v_ids) AND x.superseded_at IS NULL AND governance.rg_authority_rank(x.authority_class) IS NOT NULL
   ORDER BY governance.rg_authority_rank(x.authority_class), x.external_key LIMIT 1;
  RETURN jsonb_build_object('artifact', jsonb_build_object('artifact_id', a.artifact_id, 'kind', a.kind, 'key', a.external_key, 'version', a.version, 'authority_class', a.authority_class),
    'conformant', jsonb_array_length(v_findings) = 0, 'findings', v_findings, 'controlling_authority', v_ctrl, 'upward', v_up->'count',
    'affected', jsonb_build_object(
      'capabilities', (SELECT coalesce(jsonb_agg(jsonb_build_object('artifact_id', n->>'artifact_id', 'key', n->>'key') ORDER BY n->>'key'), '[]'::jsonb) FROM jsonb_array_elements(v_down->'nodes') n WHERE n->>'kind' = 'capability'),
      'journeys', (SELECT coalesce(jsonb_agg(jsonb_build_object('artifact_id', n->>'artifact_id', 'key', n->>'key') ORDER BY n->>'key'), '[]'::jsonb) FROM jsonb_array_elements(v_down->'nodes') n WHERE n->>'kind' = 'journey'),
      'release_candidates', (SELECT coalesce(jsonb_agg(jsonb_build_object('artifact_id', n->>'artifact_id', 'key', n->>'key') ORDER BY n->>'key'), '[]'::jsonb) FROM jsonb_array_elements(v_down->'nodes') n WHERE n->>'kind' = 'release_candidate'),
      'decision_active', (SELECT coalesce(jsonb_agg(jsonb_build_object('artifact_id', n->>'artifact_id', 'key', n->>'key') ORDER BY n->>'key'), '[]'::jsonb) FROM jsonb_array_elements(v_down->'nodes') n WHERE n->>'kind' IN ('data_product', 'decision_record', 'acceptance_record')),
      'services', (SELECT coalesce(jsonb_agg(jsonb_build_object('artifact_id', n->>'artifact_id', 'key', n->>'key') ORDER BY n->>'key'), '[]'::jsonb) FROM jsonb_array_elements(v_down->'nodes') n WHERE n->>'kind' IN ('component', 'deployable_unit', 'interface'))),
    'open_holds', (SELECT coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'reason_kind', h.reason_kind, 'reason', h.reason, 'opened_at', h.opened_at) ORDER BY h.opened_at), '[]'::jsonb)
                     FROM governance.holds h WHERE h.subject_artifact = p_artifact AND h.lifted_at IS NULL));
END $$;
GRANT EXECUTE ON FUNCTION governance.rg_inheritance(uuid) TO eye_app, eye_commit;

/* Has a recorded impact been CLEARED? Every stale test it named has, since the impact, current passing evidence for its current version. */
CREATE OR REPLACE FUNCTION governance.rg_impact_open(p_impact uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(s->>'key' ORDER BY s->>'key'), '[]'::jsonb)
    FROM governance.rg_impacts i, jsonb_array_elements(i.stale_verifications) s
   WHERE i.impact_id = p_impact AND s->>'kind' = 'test'
     AND NOT EXISTS (SELECT 1 FROM governance.rg_verification_cases c JOIN governance.rg_verification_records r ON r.record_id = c.record_id
                       JOIN governance.artifacts t ON t.artifact_id = c.test_artifact AND t.superseded_at IS NULL
                      WHERE c.test_artifact = (s->>'artifact_id')::uuid AND r.ingested_at > i.recorded_at AND c.status = 'passed' AND c.test_version = t.version
                        AND r.valid_until > clock_timestamp() AND NOT EXISTS (SELECT 1 FROM governance.rg_invalidations v WHERE v.record_id = r.record_id)) $$;
GRANT EXECUTE ON FUNCTION governance.rg_impact_open(uuid) TO eye_app, eye_commit;

/* THE ADMISSION CHECK (IA-02-006, IA-06-006, DP-02-006, DP-07-006 — the construction half; production admission is R1): the subject and its
   upward closure — orphans among them, open holds on any, stale links, requirements with no verification, tests with no current evidence. */
CREATE OR REPLACE FUNCTION governance.rg_admission_check(p_subject uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE a governance.artifacts; v_up jsonb; v_ids uuid[]; v_blocking jsonb := '[]'::jsonb; v_x jsonb;
BEGIN
  SELECT * INTO a FROM governance.artifacts WHERE artifact_id = p_subject AND superseded_at IS NULL;
  IF a.artifact_id IS NULL THEN RAISE EXCEPTION 'trace link rejected (unknown_artifact): no current artifact %', p_subject USING ERRCODE = '22023'; END IF;
  v_up := governance.rg_walk(ARRAY[p_subject], 'up', 10, NULL, 5000);
  v_ids := ARRAY(SELECT (n->>'artifact_id')::uuid FROM jsonb_array_elements(v_up->'nodes') n) || p_subject;
  IF (v_up->>'truncated')::boolean THEN v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('class', 'truncated', 'detail', 'the closure exceeded 5000 artifacts; nothing is inferred beyond it')); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('rule_id', o.rule_id, 'key', o.external_key) ORDER BY o.rule_id, o.external_key), '[]'::jsonb) INTO v_x FROM governance.rg_orphan_rows(v_ids, NULL) o;
  IF jsonb_array_length(v_x) > 0 THEN v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('class', 'orphans', 'items', v_x)); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'subject', h.subject_artifact, 'reason_kind', h.reason_kind, 'reason', h.reason) ORDER BY h.opened_at), '[]'::jsonb) INTO v_x
    FROM governance.holds h WHERE h.subject_artifact = ANY (v_ids) AND h.lifted_at IS NULL;
  IF jsonb_array_length(v_x) > 0 THEN v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('class', 'held', 'items', v_x)); END IF;
  SELECT coalesce(jsonb_agg(n->>'key' ORDER BY n->>'key'), '[]'::jsonb) INTO v_x FROM jsonb_array_elements(v_up->'nodes') n WHERE (n->>'stale')::boolean OR n->>'lifecycle' IN ('retired', 'superseded', 'quarantined');
  IF jsonb_array_length(v_x) > 0 THEN v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('class', 'stale', 'items', v_x)); END IF;
  -- the tests in the closure AND every test verifying an artifact of it: each needs current passing evidence for its current version
  SELECT coalesce(jsonb_agg(t.external_key ORDER BY t.external_key), '[]'::jsonb) INTO v_x FROM governance.artifacts t
   WHERE t.superseded_at IS NULL AND t.kind = 'test' AND t.lifecycle = 'active'
     AND (t.artifact_id = ANY (v_ids) OR t.artifact_id IN (SELECT l.from_artifact FROM governance.links_live l WHERE l.relation = 'verifies' AND l.to_artifact = ANY (v_ids)))
     AND NOT coalesce((governance.rg_test_evidence(t.artifact_id)->>'current')::boolean, false);
  IF jsonb_array_length(v_x) > 0 THEN v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('class', 'unverified_tests', 'items', v_x)); END IF;
  RETURN jsonb_build_object('subject', jsonb_build_object('artifact_id', a.artifact_id, 'kind', a.kind, 'key', a.external_key, 'version', a.version, 'digest', a.digest),
    'closure', cardinality(v_ids), 'admissible', jsonb_array_length(v_blocking) = 0, 'blocking', v_blocking, 'claim', 'construction',
    'production_admission', 'R1 — production admission and continued operation are external; this check is the construction half and admits nothing to production',
    'evaluated_at', clock_timestamp());
END $$;
GRANT EXECUTE ON FUNCTION governance.rg_admission_check(uuid) TO eye_app, eye_commit;

/* THE REGISTRY SNAPSHOT (ES-06-002): the current versions of the named kinds and their digest — a release candidate records the requirement set
   it was built from by this digest (§CM). */
CREATE OR REPLACE FUNCTION governance.rg_snapshot(p_kinds text[]) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kinds', to_jsonb(p_kinds), 'as_of', clock_timestamp(), 'count', count(*),
    'digest', governance.digest(coalesce(jsonb_agg(jsonb_build_array(a.artifact_id, a.version, a.digest, a.lifecycle) ORDER BY a.artifact_id), '[]'::jsonb)))
    FROM governance.artifacts a WHERE a.superseded_at IS NULL AND a.scope = 'PLATFORM' AND a.kind = ANY (coalesce(p_kinds, ARRAY['requirement'])) $$;
GRANT EXECUTE ON FUNCTION governance.rg_snapshot(text[]) TO eye_app, eye_commit;

-- §RG.6 THE PORTS (SECURITY DEFINER; PLATFORM; the action asserted first, then the scope and the acting principal) ────────────────────────────
/* IMPORT one source (ES-03-001..004, ES-67-001, PR-08-002, ADR-004): the steward's governed write of what the TS reader parsed. The source's
   sha256 decides the fast path (the same digest and parser → nothing written: idempotent); otherwise every row is diffed (set-based):
   new → version 1, changed → n+1 (the old one superseded, resolvable), gone → a RETIRED version; the source's links re-asserted over the
   current versions of their ends, the ones it no longer declares retired by a later row; unresolved link ends are listed, never guessed. */
CREATE OR REPLACE FUNCTION governance.rg_import(p_source_kind text, p_source_path text, p_source_digest text, p_parser text, p_detail jsonb, p_items jsonb, p_links jsonb,
  p_build jsonb, p_actor uuid, p_import_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE prev governance.rg_imports%ROWTYPE; v_now timestamptz := clock_timestamp(); v_bad text; v_new int := 0; v_versioned int := 0; v_retired int := 0; v_unchanged int := 0;
        v_links_added int := 0; v_links_retired int := 0; v_unres jsonb; v_unres_n int; v_changed uuid[]; v_normative uuid[]; v_row governance.rg_imports%ROWTYPE; v_n int;
        c_kinds CONSTANT text[] := ARRAY['requirement', 'standard', 'capability', 'journey', 'feature', 'decision_record', 'exception', 'interface', 'schema'];
BEGIN
  PERFORM governance.assert_platform('governance.registry.import', p_actor, 'requirement registry');
  IF p_source_kind IS NULL OR p_source_kind NOT IN ('requirements', 'rowmap', 'decisions', 'exceptions', 'interfaces', 'schemas') THEN
    RAISE EXCEPTION 'requirement registry rejected (source): % is not a registered source kind', coalesce(p_source_kind, '<null>') USING ERRCODE = '22023';
  END IF;
  IF p_source_path IS NULL OR p_source_path !~ '^[A-Za-z0-9_][A-Za-z0-9_./-]{0,199}$' OR p_source_path ~ '\.\.' THEN
    RAISE EXCEPTION 'requirement registry rejected (source): the source is a repository-relative path' USING ERRCODE = '22023';
  END IF;
  IF p_source_digest IS NULL OR p_source_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'requirement registry rejected (digest): the source''s sha256 is 64 hex' USING ERRCODE = '22023'; END IF;
  IF p_parser IS NULL OR length(p_parser) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'requirement registry rejected (parser): the parser version is named' USING ERRCODE = '22023'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 20000 THEN RAISE EXCEPTION 'requirement registry rejected (items): at most 20000 rows per source' USING ERRCODE = '22023'; END IF;
  IF p_links IS NULL OR jsonb_typeof(p_links) <> 'array' OR jsonb_array_length(p_links) > 60000 THEN RAISE EXCEPTION 'requirement registry rejected (links): at most 60000 links per source' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.rg_import:' || p_source_path, 0));
  SELECT * INTO prev FROM governance.rg_imports i WHERE i.source_path = p_source_path ORDER BY i.imported_at DESC, i.import_id DESC LIMIT 1;
  -- the fast path: the same bytes and parser, and nothing the last import left unresolved (a link end that a LATER source registers is
  -- resolved by re-diffing — which writes nothing when nothing resolves)
  IF prev.import_id IS NOT NULL AND prev.source_digest = p_source_digest AND prev.parser_version = p_parser AND jsonb_array_length(prev.unresolved) = 0 THEN
    RETURN jsonb_build_object('unchanged', true, 'source_path', p_source_path, 'source_digest', p_source_digest, 'import', to_jsonb(prev) - 'changed');
  END IF;

  -- the rows: well-formed, one per (kind, key), never another part's kind, the class the volume carries (PR-08-003)
  SELECT CASE
      WHEN i.k IS NULL OR length(btrim(i.k)) NOT BETWEEN 1 AND 200 THEN 'a row has no key (1–200 characters)'
      WHEN i.kind IS NULL OR NOT (i.kind = ANY (c_kinds)) THEN format('%s: the kind %s is not imported by this registry', i.k, coalesce(i.kind, '<null>'))
      WHEN i.title IS NULL OR length(btrim(i.title)) NOT BETWEEN 1 AND 500 THEN format('%s: the title is 1–500 characters', i.k)
      WHEN governance.rg_authority_rank(i.authority_class) IS NULL THEN format('%s: the authority class %s is not in the control order', i.k, coalesce(i.authority_class, '<null>'))
      WHEN i.controlling_volume IS NOT NULL AND governance.rg_volume_class(i.controlling_volume) IS NOT NULL AND i.kind IN ('requirement', 'standard')
           AND governance.rg_volume_class(i.controlling_volume) <> i.authority_class THEN format('%s: a %s row carries %s authority, never %s (PR-08-003)', i.k, i.controlling_volume, governance.rg_volume_class(i.controlling_volume), i.authority_class)
      WHEN coalesce(i.lifecycle, 'active') NOT IN ('proposed', 'active', 'deprecated', 'retired') THEN format('%s: an imported row is proposed, active, deprecated or retired', i.k)
      WHEN i.attributes IS NOT NULL AND jsonb_typeof(i.attributes) <> 'object' THEN format('%s: attributes are an object', i.k)
      WHEN i.owner_role IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = i.owner_role) THEN format('%s: the owner role %s is unknown', i.k, i.owner_role)
    END INTO v_bad
    FROM jsonb_to_recordset(p_items) AS i(kind text, k text, title text, authority_class text, controlling_volume text, lifecycle text, attributes jsonb, owner_role text)
   WHERE i.k IS NULL OR i.kind IS NULL OR NOT (i.kind = ANY (c_kinds)) OR i.title IS NULL OR length(btrim(i.title)) NOT BETWEEN 1 AND 500 OR length(btrim(i.k)) NOT BETWEEN 1 AND 200
      OR governance.rg_authority_rank(i.authority_class) IS NULL OR coalesce(i.lifecycle, 'active') NOT IN ('proposed', 'active', 'deprecated', 'retired')
      OR (i.controlling_volume IS NOT NULL AND governance.rg_volume_class(i.controlling_volume) IS NOT NULL AND i.kind IN ('requirement', 'standard') AND governance.rg_volume_class(i.controlling_volume) <> i.authority_class)
      OR (i.attributes IS NOT NULL AND jsonb_typeof(i.attributes) <> 'object')
      OR (i.owner_role IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = i.owner_role))
   LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'requirement registry rejected (items): %', v_bad USING ERRCODE = '22023'; END IF;
  SELECT format('%s %s', x.kind, x.k) INTO v_bad FROM jsonb_to_recordset(p_items) AS x(kind text, k text) GROUP BY x.kind, x.k HAVING count(*) > 1 LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'requirement registry rejected (items): % appears twice in one source', v_bad USING ERRCODE = '22023'; END IF;
  SELECT format('%s %s', a.kind, a.external_key) INTO v_bad FROM jsonb_to_recordset(p_items) AS x(kind text, k text)
    JOIN governance.artifacts a ON a.kind = x.kind AND a.external_key = x.k AND a.scope = 'PLATFORM' AND a.superseded_at IS NULL AND a.artifact_id <> governance.rg_artifact_id(x.kind, x.k) LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'requirement registry rejected (duplicate): % is registered under another identity', v_bad USING ERRCODE = '23505'; END IF;

  -- the diff (set-based): what is new, what changed, what is unchanged
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.rg_inc (id uuid PRIMARY KEY, kind text, k text, title text, authority_class text, controlling_volume text, lifecycle text, attributes jsonb,
                                          owner_role text, digest text, cur_version int, cur_digest text, state text) ON COMMIT DROP;
  TRUNCATE pg_temp.rg_inc;
  INSERT INTO pg_temp.rg_inc (id, kind, k, title, authority_class, controlling_volume, lifecycle, attributes, owner_role, digest, cur_version, cur_digest, state)
  SELECT governance.rg_artifact_id(i.kind, i.k), i.kind, i.k, btrim(i.title), i.authority_class, i.controlling_volume, coalesce(i.lifecycle, 'active'), coalesce(i.attributes, '{}'::jsonb), i.owner_role,
         governance.rg_content_digest(i.kind, i.k, btrim(i.title), i.authority_class, i.controlling_volume, coalesce(i.attributes, '{}'::jsonb)), a.version, a.digest,
         CASE WHEN a.artifact_id IS NULL THEN 'new'
              WHEN a.digest = governance.rg_content_digest(i.kind, i.k, btrim(i.title), i.authority_class, i.controlling_volume, coalesce(i.attributes, '{}'::jsonb))
                   AND a.lifecycle = coalesce(i.lifecycle, 'active') AND a.attributes = coalesce(i.attributes, '{}'::jsonb) AND a.title = btrim(i.title)
                   AND a.owner_role IS NOT DISTINCT FROM i.owner_role AND a.source->>'path' IS NOT DISTINCT FROM p_source_path THEN 'unchanged'
              ELSE 'changed' END
    FROM jsonb_to_recordset(p_items) AS i(kind text, k text, title text, authority_class text, controlling_volume text, lifecycle text, attributes jsonb, owner_role text)
    LEFT JOIN governance.artifacts a ON a.artifact_id = governance.rg_artifact_id(i.kind, i.k) AND a.superseded_at IS NULL;
  SELECT count(*) FILTER (WHERE state = 'new'), count(*) FILTER (WHERE state = 'changed'), count(*) FILTER (WHERE state = 'unchanged') INTO v_new, v_versioned, v_unchanged FROM pg_temp.rg_inc;
  v_normative := ARRAY(SELECT id FROM pg_temp.rg_inc WHERE state = 'changed' AND cur_digest IS DISTINCT FROM digest ORDER BY id);
  UPDATE governance.artifacts a SET superseded_at = v_now FROM pg_temp.rg_inc i WHERE i.state = 'changed' AND a.artifact_id = i.id AND a.superseded_at IS NULL;
  INSERT INTO governance.artifacts (artifact_id, version, scope, kind, external_key, title, owner_role, authority_class, controlling_volume, lifecycle, attributes, source, digest,
                                    effective_from, recorded_by, correlation_id)
  SELECT i.id, coalesce(i.cur_version, 0) + 1, 'PLATFORM', i.kind, i.k, i.title, i.owner_role, i.authority_class, i.controlling_volume, i.lifecycle, i.attributes,
         jsonb_build_object('path', p_source_path, 'source_digest', p_source_digest, 'import_id', p_import_id), i.digest, v_now, p_actor, p_correlation
    FROM pg_temp.rg_inc i WHERE i.state IN ('new', 'changed');
  -- what the source no longer declares: a RETIRED version (never deleted; resolvable as of its time)
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.rg_gone (id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp.rg_gone;
  INSERT INTO pg_temp.rg_gone SELECT a.artifact_id FROM governance.artifacts a
   WHERE a.superseded_at IS NULL AND a.scope = 'PLATFORM' AND a.source->>'path' = p_source_path AND a.lifecycle <> 'retired' AND a.kind = ANY (c_kinds)
     AND NOT EXISTS (SELECT 1 FROM pg_temp.rg_inc i WHERE i.id = a.artifact_id);
  GET DIAGNOSTICS v_retired = ROW_COUNT;
  IF v_retired > 0 THEN
    CREATE TEMP TABLE IF NOT EXISTS pg_temp.rg_gone_rows ON COMMIT DROP AS SELECT * FROM governance.artifacts WITH NO DATA;
    TRUNCATE pg_temp.rg_gone_rows;
    INSERT INTO pg_temp.rg_gone_rows SELECT a.* FROM governance.artifacts a JOIN pg_temp.rg_gone g ON g.id = a.artifact_id WHERE a.superseded_at IS NULL;
    UPDATE governance.artifacts a SET superseded_at = v_now FROM pg_temp.rg_gone g WHERE a.artifact_id = g.id AND a.superseded_at IS NULL;
    INSERT INTO governance.artifacts (artifact_id, version, scope, kind, external_key, title, owner_principal_id, owner_role, authority_class, controlling_volume, lifecycle, attributes,
                                      source, digest, effective_from, recorded_by, correlation_id)
    SELECT r.artifact_id, r.version + 1, 'PLATFORM', r.kind, r.external_key, r.title, r.owner_principal_id, r.owner_role, r.authority_class, r.controlling_volume, 'retired', r.attributes,
           r.source || jsonb_build_object('retired_by_import', p_import_id), r.digest, v_now, p_actor, p_correlation FROM pg_temp.rg_gone_rows r;
  END IF;
  v_changed := v_normative || ARRAY(SELECT id FROM pg_temp.rg_gone ORDER BY id);

  -- the links the source declares: resolved by (kind, key) to CURRENT artifacts (any source); unresolved ends listed
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.rg_lnk (from_id uuid, to_id uuid, relation text, attributes jsonb, from_ok boolean, to_ok boolean, from_kind text, from_key text, to_kind text, to_key text) ON COMMIT DROP;
  TRUNCATE pg_temp.rg_lnk;
  INSERT INTO pg_temp.rg_lnk
  SELECT governance.rg_artifact_id(l.from_kind, l.from_key), governance.rg_artifact_id(l.to_kind, l.to_key), l.relation, coalesce(l.attributes, '{}'::jsonb),
         EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = governance.rg_artifact_id(l.from_kind, l.from_key) AND a.superseded_at IS NULL AND a.lifecycle <> 'retired'),
         EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = governance.rg_artifact_id(l.to_kind, l.to_key) AND a.superseded_at IS NULL AND a.lifecycle <> 'retired'),
         l.from_kind, l.from_key, l.to_kind, l.to_key
    FROM jsonb_to_recordset(p_links) AS l(from_kind text, from_key text, to_kind text, to_key text, relation text, attributes jsonb);
  SELECT format('%s → %s (%s)', from_key, to_key, coalesce(relation, '<null>')) INTO v_bad FROM pg_temp.rg_lnk
   WHERE relation IS NULL OR NOT (relation = ANY (governance.link_relations())) OR from_id = to_id OR governance.rg_relation_problem(relation, from_kind, to_kind) IS NOT NULL LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'requirement registry rejected (links): % is not an admissible link', v_bad USING ERRCODE = '22023'; END IF;
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('from', from_kind || ' ' || from_key, 'to', to_kind || ' ' || to_key, 'relation', relation) ORDER BY from_key, to_key) FILTER (WHERE rn <= 200), '[]'::jsonb)
    INTO v_unres_n, v_unres
    FROM (SELECT x.*, row_number() OVER (ORDER BY x.from_key, x.to_key, x.relation) AS rn FROM pg_temp.rg_lnk x WHERE NOT (x.from_ok AND x.to_ok)) u;
  DELETE FROM pg_temp.rg_lnk WHERE NOT (from_ok AND to_ok);
  -- keep an identical live link of this source; retire the ones it no longer declares (or whose ends moved), insert the new assertions
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.rg_want (from_id uuid, to_id uuid, relation text, attributes jsonb, from_digest text, to_digest text, from_version int, to_version int, keep uuid) ON COMMIT DROP;
  TRUNCATE pg_temp.rg_want;
  INSERT INTO pg_temp.rg_want
  SELECT DISTINCT ON (w.from_id, w.to_id, w.relation) w.from_id, w.to_id, w.relation, w.attributes, f.digest, t.digest, f.version, t.version, NULL::uuid
    FROM pg_temp.rg_lnk w JOIN governance.artifacts f ON f.artifact_id = w.from_id AND f.superseded_at IS NULL JOIN governance.artifacts t ON t.artifact_id = w.to_id AND t.superseded_at IS NULL
   ORDER BY w.from_id, w.to_id, w.relation;
  UPDATE pg_temp.rg_want w SET keep = l.link_id FROM governance.links l
   WHERE l.attributes->>'source' = p_source_path AND NOT l.retired AND l.from_artifact = w.from_id AND l.to_artifact = w.to_id AND l.relation = w.relation
     AND l.attributes->>'from_digest' = w.from_digest AND l.attributes->>'to_digest' = w.to_digest AND l.attributes - 'source' - 'import_id' - 'from_version' - 'to_version' - 'from_digest' - 'to_digest' = w.attributes
     AND NOT EXISTS (SELECT 1 FROM governance.links x WHERE x.retires_link = l.link_id);
  INSERT INTO governance.links (link_id, scope, from_artifact, to_artifact, relation, retired, retires_link, attributes, recorded_by, correlation_id)
  SELECT gen_random_uuid(), 'PLATFORM', l.from_artifact, l.to_artifact, l.relation, true, l.link_id, jsonb_build_object('source', p_source_path, 'import_id', p_import_id, 'reason', 'no longer declared by the source over the current versions of its ends'),
         p_actor, p_correlation
    FROM governance.links l
   WHERE l.attributes->>'source' = p_source_path AND NOT l.retired AND NOT EXISTS (SELECT 1 FROM governance.links x WHERE x.retires_link = l.link_id)
     AND NOT EXISTS (SELECT 1 FROM pg_temp.rg_want w WHERE w.keep = l.link_id);
  GET DIAGNOSTICS v_links_retired = ROW_COUNT;
  INSERT INTO governance.links (link_id, scope, from_artifact, to_artifact, relation, attributes, recorded_by, correlation_id)
  SELECT gen_random_uuid(), 'PLATFORM', w.from_id, w.to_id, w.relation,
         w.attributes || jsonb_build_object('source', p_source_path, 'import_id', p_import_id, 'from_version', w.from_version, 'to_version', w.to_version, 'from_digest', w.from_digest, 'to_digest', w.to_digest),
         p_actor, p_correlation
    FROM pg_temp.rg_want w WHERE w.keep IS NULL;
  GET DIAGNOSTICS v_links_added = ROW_COUNT;

  -- the same bytes and parser, nothing new resolved: nothing is recorded (idempotent). A source whose bytes changed while nothing it declares
  -- did (a column this registry does not read) is still recorded, so its digest is current.
  IF prev.import_id IS NOT NULL AND prev.source_digest = p_source_digest AND prev.parser_version = p_parser
     AND v_new + v_versioned + v_retired + v_links_added + v_links_retired = 0 THEN
    RETURN jsonb_build_object('unchanged', true, 'source_path', p_source_path, 'source_digest', p_source_digest, 'import', to_jsonb(prev) - 'changed', 'unresolved_remaining', v_unres_n);
  END IF;
  INSERT INTO governance.rg_imports (import_id, source_kind, source_path, source_digest, parser_version, detail, row_count, counts, changed, unresolved, build_identity, imported_by, correlation_id)
  VALUES (p_import_id, p_source_kind, p_source_path, p_source_digest, p_parser, coalesce(p_detail, '{}'::jsonb), jsonb_array_length(p_items),
          jsonb_build_object('registered', v_new, 'versioned', v_versioned, 'retired', v_retired, 'unchanged', v_unchanged, 'normative_changes', cardinality(v_normative),
                             'links_declared', jsonb_array_length(p_links), 'links_added', v_links_added, 'links_retired', v_links_retired, 'unresolved', v_unres_n),
          v_changed, v_unres, coalesce(p_build, '{}'::jsonb) || governance.rg_build_identity(), p_actor, p_correlation)
  RETURNING * INTO v_row;
  PERFORM governance.ledger(NULL, NULL, 'registry_import', p_import_id, NULL, 'registry.imported', p_actor,
    jsonb_build_object('source_path', p_source_path, 'source_digest', p_source_digest, 'counts', v_row.counts), p_correlation);
  RETURN jsonb_build_object('unchanged', false, 'source_path', p_source_path, 'source_digest', p_source_digest, 'import', to_jsonb(v_row));
END $$;
REVOKE ALL ON FUNCTION governance.rg_import(text, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_import(text, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid, uuid, uuid) TO eye_commit;

/* REGISTER one normative artifact (ES-02-001, ES-03-001..004, IA-02-001..003, DP-02-001..003, PR-08-003, ADR-004): identity (kind + key,
   never re-keyed, a retired identity never reused), authority class (a requirement or a standard carries its VOLUME's class — a Volume 8
   row never claims a higher authority), owner, lifecycle, version (expected — stale refused), effective time; a SUPERSESSION (the target
   of the same kind, controlled by the new artifact's class) and a PARENT (a derived requirement: the parent exists, controls it and is not
   weakened); a mandatory requirement names its verification method and states one controlling obligation. Unchanged → nothing written. */
CREATE OR REPLACE FUNCTION governance.rg_register(p_kind text, p_key text, p_expected_version int, p_title text, p_class text, p_volume text, p_lifecycle text, p_attributes jsonb,
  p_supersedes uuid, p_parent uuid, p_owner uuid, p_owner_role text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.artifacts%ROWTYPE; sup governance.artifacts%ROWTYPE; par governance.artifacts%ROWTYPE; v_put jsonb; v_attrs jsonb := coalesce(p_attributes, '{}'::jsonb);
        v_why text; v_links jsonb := '[]'::jsonb; v_id uuid;
BEGIN
  PERFORM governance.assert_platform('governance.registry.register', p_actor, 'requirement registry');
  IF p_kind IS NULL OR p_kind NOT IN ('requirement', 'standard', 'capability', 'journey', 'feature', 'component', 'deployable_unit', 'interface', 'schema', 'policy_bundle', 'decision_record') THEN
    RAISE EXCEPTION 'requirement registry rejected (kind): % is registered by its own part, not by the registry', coalesce(p_kind, '<null>') USING ERRCODE = '22023';
  END IF;
  IF p_key IS NULL OR length(btrim(p_key)) NOT BETWEEN 1 AND 200 OR p_key <> btrim(p_key) THEN RAISE EXCEPTION 'requirement registry rejected (key): a stable key of 1–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'requirement registry rejected (title): a title of 1–500 characters' USING ERRCODE = '22023'; END IF;
  IF governance.rg_authority_rank(p_class) IS NULL THEN RAISE EXCEPTION 'requirement registry rejected (authority_class): % is not in the control order', coalesce(p_class, '<null>') USING ERRCODE = '22023'; END IF;
  IF p_kind IN ('requirement', 'standard') AND (p_volume IS NULL OR governance.rg_volume_class(p_volume) IS NULL) THEN
    RAISE EXCEPTION 'requirement registry rejected (volume): a % names its controlling volume (V0–V10)', p_kind USING ERRCODE = '22023';
  END IF;
  IF p_volume IS NOT NULL AND governance.rg_volume_class(p_volume) IS NOT NULL AND p_kind IN ('requirement', 'standard') AND governance.rg_volume_class(p_volume) <> p_class THEN
    RAISE EXCEPTION 'requirement registry rejected (control_order): a % row carries % authority — it never claims % (PR-08-003: a volume never redefines a higher authority)', p_volume, governance.rg_volume_class(p_volume), p_class USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_lifecycle, 'active') NOT IN ('proposed', 'active', 'deprecated') THEN RAISE EXCEPTION 'requirement registry rejected (lifecycle): a registration is proposed, active or deprecated (retirement is a supersession or the source''s)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_attrs) <> 'object' THEN RAISE EXCEPTION 'requirement registry rejected (attributes): attributes are an object' USING ERRCODE = '22023'; END IF;
  IF p_owner_role IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = p_owner_role) THEN RAISE EXCEPTION 'requirement registry rejected (owner): % is not a role', p_owner_role USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL AND p_owner_role IS NULL AND coalesce(v_attrs->>'owner_declared', '') = '' THEN
    RAISE EXCEPTION 'requirement registry rejected (owner): a normative artifact declares its owner (a principal, a role or the register''s declared owner — ES-02-001)' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'requirement' THEN
    IF coalesce(v_attrs->>'mandatory', 'false') = 'true' AND coalesce(v_attrs->>'verification_method', '') = '' THEN
      RAISE EXCEPTION 'requirement registry rejected (verification_method): a mandatory requirement names an executable or independently reviewable verification method (ES-03-001)' USING ERRCODE = '22023';
    END IF;
    IF coalesce((v_attrs->>'obligations')::int, 1) > 1 THEN
      RAISE EXCEPTION 'requirement registry rejected (compound): the text states % controlling obligations; one requirement states one (ES-03-002)', v_attrs->>'obligations' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_id := governance.rg_artifact_id(p_kind, p_key);
  SELECT * INTO cur FROM governance.artifacts WHERE artifact_id = v_id AND superseded_at IS NULL FOR UPDATE;
  IF cur.artifact_id IS NOT NULL AND cur.lifecycle IN ('retired', 'superseded') THEN
    RAISE EXCEPTION 'requirement registry rejected (state): % % was %; a retired identity is never reused (ADR-004) — register a new key', p_kind, p_key, cur.lifecycle USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_expected_version, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'requirement registry rejected (stale): % % is at version %, not %', p_kind, p_key, coalesce(cur.version, 0), coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_supersedes IS NOT NULL THEN
    SELECT * INTO sup FROM governance.artifacts WHERE artifact_id = p_supersedes AND superseded_at IS NULL FOR UPDATE;
    IF sup.artifact_id IS NULL OR sup.scope <> 'PLATFORM' THEN RAISE EXCEPTION 'requirement registry rejected (unknown_artifact): the superseded artifact is not a current registry artifact' USING ERRCODE = '22023'; END IF;
    IF sup.artifact_id = v_id THEN RAISE EXCEPTION 'requirement registry rejected (supersedes): an artifact never supersedes itself (a change is a new version)' USING ERRCODE = '22023'; END IF;
    IF sup.kind <> p_kind THEN RAISE EXCEPTION 'requirement registry rejected (supersedes): an artifact supersedes only an artifact of its own kind' USING ERRCODE = '22023'; END IF;
    IF sup.lifecycle IN ('retired', 'superseded') THEN RAISE EXCEPTION 'requirement registry rejected (state): % is already %', sup.external_key, sup.lifecycle USING ERRCODE = '22023'; END IF;
    IF NOT governance.rg_controls(p_class, sup.authority_class) THEN
      RAISE EXCEPTION 'requirement registry rejected (control_order): % authority never supersedes % authority (a lower artifact may add precision, never replace a higher one — IA-02-003)', p_class, sup.authority_class USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_parent IS NOT NULL THEN
    SELECT * INTO par FROM governance.artifacts WHERE artifact_id = p_parent AND superseded_at IS NULL;
    IF par.artifact_id IS NULL OR par.scope <> 'PLATFORM' OR par.lifecycle IN ('retired', 'superseded') THEN
      RAISE EXCEPTION 'requirement registry rejected (unknown_parent): a derived requirement references a current parent (ES-03-003)' USING ERRCODE = '22023';
    END IF;
    IF par.artifact_id = v_id THEN RAISE EXCEPTION 'requirement registry rejected (circular): an artifact never derives from itself' USING ERRCODE = '22023'; END IF;
    IF par.kind <> p_kind THEN RAISE EXCEPTION 'requirement registry rejected (unknown_parent): a derived % derives from a % (its parent is %)', p_kind, p_kind, par.kind USING ERRCODE = '22023'; END IF;
    IF NOT governance.rg_controls(par.authority_class, p_class) THEN
      RAISE EXCEPTION 'requirement registry rejected (control_order): % authority never derives from % authority (inheritance goes upward)', p_class, par.authority_class USING ERRCODE = '22023';
    END IF;
    v_why := governance.rg_weakens(v_attrs, par.attributes);
    IF v_why IS NOT NULL THEN RAISE EXCEPTION 'requirement registry rejected (weakens): % — a derived requirement never weakens its parent (ES-03-003)', v_why USING ERRCODE = '22023'; END IF;
    v_attrs := v_attrs || jsonb_build_object('parent', par.external_key);
  END IF;
  v_put := governance.rg_put_artifact(p_kind, p_key, btrim(p_title), p_class, p_volume, coalesce(p_lifecycle, 'active'), v_attrs, p_owner, p_owner_role,
                                      jsonb_build_object('path', 'registered', 'by', p_actor), p_actor, p_correlation);
  IF p_parent IS NOT NULL THEN
    IF EXISTS (WITH RECURSIVE w(n, d) AS (SELECT p_parent, 0 UNION SELECT l.to_artifact, w.d + 1 FROM w JOIN governance.links_live l ON l.from_artifact = w.n AND l.relation = 'derives_from' WHERE w.d < 32)
               SELECT 1 FROM w WHERE n = v_id) THEN
      RAISE EXCEPTION 'requirement registry rejected (circular): deriving % from % closes a cycle', p_key, par.external_key USING ERRCODE = '22023';
    END IF;
    v_links := v_links || jsonb_build_array(governance.rg_put_link(v_id, p_parent, 'derives_from', jsonb_build_object('source', 'registered'), p_actor, p_correlation));
  END IF;
  IF p_supersedes IS NOT NULL THEN
    PERFORM governance.rg_put_artifact(sup.kind, sup.external_key, sup.title, sup.authority_class, sup.controlling_volume, 'superseded', sup.attributes || jsonb_build_object('superseded_by', p_key),
                                       sup.owner_principal_id, sup.owner_role, sup.source || jsonb_build_object('superseded_by', v_id), p_actor, p_correlation);
    v_links := v_links || jsonb_build_array(governance.rg_put_link(v_id, p_supersedes, 'supersedes', jsonb_build_object('source', 'registered'), p_actor, p_correlation));
  END IF;
  IF (v_put->>'changed')::boolean OR jsonb_array_length(v_links) > 0 THEN
    PERFORM governance.ledger(NULL, NULL, 'artifact', v_id, (v_put->>'version')::int, 'registry.registered', p_actor,
      jsonb_build_object('kind', p_kind, 'key', p_key, 'authority_class', p_class, 'supersedes', p_supersedes, 'parent', p_parent, 'digest', v_put->>'digest'), p_correlation);
  END IF;
  RETURN v_put || jsonb_build_object('kind', p_kind, 'key', p_key, 'links', v_links,
    'changed_artifacts', to_jsonb(ARRAY(SELECT x FROM unnest(ARRAY[CASE WHEN (v_put->>'normative_change')::boolean THEN v_id END, p_supersedes]) x WHERE x IS NOT NULL)));
END $$;
REVOKE ALL ON FUNCTION governance.rg_register(text, text, int, text, text, text, text, jsonb, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_register(text, text, int, text, text, text, text, jsonb, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* RECORD a trace link (ES-06-001, IA-06-001..003, DP-07-001..003): both ends current PLATFORM registry artifacts (a tenant's artifact is
   never linked from the vendor's registry), the relation admissible for the kinds, the CONTROL ORDER kept (derives_from / part_of upward,
   governs / supersedes downward), no cycle closed through a derivation, no duplicate live link. The versions and digests of both ends are
   recorded; the link is append-only. */
CREATE OR REPLACE FUNCTION governance.rg_link(p_from uuid, p_to uuid, p_relation text, p_attributes jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE f governance.artifacts%ROWTYPE; t governance.artifacts%ROWTYPE; v_why text; v jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.trace.link', p_actor, 'trace link');
  IF p_relation IS NULL OR NOT (p_relation = ANY (governance.link_relations())) THEN RAISE EXCEPTION 'trace link rejected (relation): % is not a link relation', coalesce(p_relation, '<null>') USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'trace link rejected (reason): a link states its basis (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_attributes IS NOT NULL AND jsonb_typeof(p_attributes) <> 'object' THEN RAISE EXCEPTION 'trace link rejected (attributes): attributes are an object' USING ERRCODE = '22023'; END IF;
  SELECT * INTO f FROM governance.artifacts WHERE artifact_id = p_from AND superseded_at IS NULL;
  SELECT * INTO t FROM governance.artifacts WHERE artifact_id = p_to AND superseded_at IS NULL;
  IF f.artifact_id IS NULL OR t.artifact_id IS NULL THEN RAISE EXCEPTION 'trace link rejected (unknown_artifact): both ends are current registry artifacts' USING ERRCODE = '22023'; END IF;
  IF f.scope <> 'PLATFORM' OR t.scope <> 'PLATFORM' THEN RAISE EXCEPTION 'trace link rejected (scope): the vendor''s registry links only its own (PLATFORM) artifacts — a tenant''s record is never linked from here' USING ERRCODE = '22023'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'trace link rejected (circular): an artifact is never linked to itself' USING ERRCODE = '22023'; END IF;
  IF f.lifecycle IN ('retired', 'superseded') OR t.lifecycle IN ('retired', 'superseded') THEN RAISE EXCEPTION 'trace link rejected (state): a retired or superseded artifact takes no new link (it stays resolvable)' USING ERRCODE = '22023'; END IF;
  v_why := governance.rg_relation_problem(p_relation, f.kind, t.kind);
  IF v_why IS NOT NULL THEN RAISE EXCEPTION 'trace link rejected (relation): %', v_why USING ERRCODE = '22023'; END IF;
  IF (p_relation IN ('derives_from', 'part_of') AND NOT governance.rg_controls(t.authority_class, f.authority_class))
     OR (p_relation IN ('governs', 'supersedes') AND NOT governance.rg_controls(f.authority_class, t.authority_class)) THEN
    RAISE EXCEPTION 'trace link rejected (control_order): % (%) % % (%) breaks the control order — a lower authority may add precision, never weaken or replace a higher one',
      f.external_key, f.authority_class, p_relation, t.external_key, t.authority_class USING ERRCODE = '22023';
  END IF;
  IF p_relation = 'derives_from' AND f.kind = 'requirement' AND t.kind = 'requirement' THEN
    v_why := governance.rg_weakens(f.attributes, t.attributes);
    IF v_why IS NOT NULL THEN RAISE EXCEPTION 'trace link rejected (weakens): %', v_why USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_relation IN ('derives_from', 'part_of', 'supersedes', 'depends_on') AND EXISTS (
       WITH RECURSIVE w(n, d) AS (SELECT p_to, 0 UNION SELECT l.to_artifact, w.d + 1 FROM w JOIN governance.links_live l ON l.from_artifact = w.n AND l.relation = p_relation WHERE w.d < 32)
       SELECT 1 FROM w WHERE n = p_from) THEN
    RAISE EXCEPTION 'trace link rejected (circular): % % % closes a cycle', f.external_key, p_relation, t.external_key USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM governance.links_live l WHERE l.from_artifact = p_from AND l.to_artifact = p_to AND l.relation = p_relation
               AND l.attributes->>'from_digest' IS NOT DISTINCT FROM f.digest AND l.attributes->>'to_digest' IS NOT DISTINCT FROM t.digest) THEN
    RAISE EXCEPTION 'trace link rejected (duplicate): % % % is already a live link over these versions', f.external_key, p_relation, t.external_key USING ERRCODE = '22023';
  END IF;
  v := governance.rg_put_link(p_from, p_to, p_relation, coalesce(p_attributes, '{}'::jsonb) || jsonb_build_object('source', 'recorded', 'reason', btrim(p_reason)), p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'trace_link', (v->>'link_id')::uuid, NULL, 'trace.linked', p_actor,
    jsonb_build_object('from', f.external_key, 'to', t.external_key, 'relation', p_relation, 'reason', btrim(p_reason)), p_correlation);
  RETURN v || jsonb_build_object('from', f.external_key, 'to', t.external_key, 'relation', p_relation);
END $$;
REVOKE ALL ON FUNCTION governance.rg_link(uuid, uuid, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_link(uuid, uuid, text, jsonb, text, uuid, uuid) TO eye_commit;

/* RETIRE a recorded link (a later row; never an update or a delete). An imported link is the source's — re-import to change it. */
CREATE OR REPLACE FUNCTION governance.rg_retire_link(p_link uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE l governance.links%ROWTYPE; v_id uuid := gen_random_uuid();
BEGIN
  PERFORM governance.assert_platform('governance.trace.link', p_actor, 'trace link');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'trace link rejected (reason): a retirement states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO l FROM governance.links WHERE link_id = p_link FOR UPDATE;
  IF l.link_id IS NULL OR l.retired OR l.scope <> 'PLATFORM' THEN RAISE EXCEPTION 'trace link rejected (unknown_link): no live registry link %', p_link USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM governance.links x WHERE x.retires_link = p_link) THEN RAISE EXCEPTION 'trace link rejected (state): the link is already retired' USING ERRCODE = '22023'; END IF;
  IF l.attributes->>'source' IS DISTINCT FROM 'recorded' THEN
    RAISE EXCEPTION 'trace link rejected (state): this link is declared by % — the source is authoritative; change it there and re-import', coalesce(l.attributes->>'source', 'another part') USING ERRCODE = '22023';
  END IF;
  INSERT INTO governance.links (link_id, scope, from_artifact, to_artifact, relation, retired, retires_link, attributes, recorded_by, correlation_id)
  VALUES (v_id, 'PLATFORM', l.from_artifact, l.to_artifact, l.relation, true, p_link, jsonb_build_object('source', 'recorded', 'reason', btrim(p_reason)), p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'trace_link', p_link, NULL, 'trace.link_retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'retired_by', v_id), p_correlation);
  RETURN jsonb_build_object('link_id', p_link, 'retired_by', v_id);
END $$;
REVOKE ALL ON FUNCTION governance.rg_retire_link(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_retire_link(uuid, text, uuid, uuid) TO eye_commit;

/* RECORD a change impact (ES-02-005, ES-06-004): recomputed in the port over the links as they stand; when the caller names the digest it was
   shown, a different answer is STALE (the links moved since). The impact is registered as `evidence` evidencing the changed artifacts; an
   actual change (not a proposal) HOLDS each dependent release candidate (evidence_stale) until its stale verifications are current again. */
CREATE OR REPLACE FUNCTION governance.rg_record_impact(p_impact uuid, p_changes jsonb, p_depth int, p_expected_digest text, p_trigger text, p_trigger_ref uuid, p_build jsonb,
  p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb; v_held jsonb := '[]'::jsonb; rc jsonb; v_hold uuid; v_key text; r jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.impact.record', p_actor, 'change impact');
  IF p_trigger IS NULL OR p_trigger NOT IN ('import', 'register', 'change', 'proposal') THEN RAISE EXCEPTION 'change impact rejected (trigger): an impact is recorded for an import, a registration, a change or a proposal' USING ERRCODE = '22023'; END IF;
  v := governance.rg_impact(p_changes, p_depth);
  IF p_expected_digest IS NOT NULL AND p_expected_digest <> v->>'digest' THEN
    RAISE EXCEPTION 'change impact rejected (stale): the links or versions moved since the impact % was shown (now %)', left(p_expected_digest, 12), left(v->>'digest', 12) USING ERRCODE = '22023';
  END IF;
  INSERT INTO governance.rg_impacts (impact_id, trigger, trigger_ref, input, dependents, counts, stale_verifications, held, depth_limit, truncated, digest, build_identity, recorded_by, correlation_id)
  VALUES (p_impact, p_trigger, p_trigger_ref, v->'input', v->'dependents', v->'counts', v->'stale_verifications', '[]'::jsonb, (v->>'depth_limit')::int, (v->>'truncated')::boolean, v->>'digest',
          coalesce(p_build, '{}'::jsonb) || governance.rg_build_identity(), p_actor, p_correlation);
  v_key := 'impact:' || p_impact::text;
  PERFORM governance.rg_put_artifact('evidence', v_key, format('Change impact %s (%s): %s dependents', left(v->>'digest', 12), p_trigger, jsonb_array_length(v->'dependents')),
            'verification', NULL, 'active', jsonb_build_object('evidence_kind', 'change_impact', 'impact_id', p_impact, 'digest', v->>'digest', 'trigger', p_trigger, 'counts', v->'counts'),
            NULL, 'conformance_steward', jsonb_build_object('path', 'impact', 'impact_id', p_impact), p_actor, p_correlation);
  FOR r IN SELECT x FROM jsonb_array_elements(v->'input') x LOOP
    PERFORM governance.rg_put_link(governance.rg_artifact_id('evidence', v_key), (r->>'artifact_id')::uuid, 'evidences', jsonb_build_object('source', 'impact'), p_actor, p_correlation);
  END LOOP;
  IF p_trigger <> 'proposal' THEN
    FOR rc IN SELECT x FROM jsonb_array_elements(v->'release_candidates') x LOOP
      v_hold := gen_random_uuid();
      INSERT INTO governance.holds (hold_id, scope, subject_artifact, reason_kind, source_artifact, reason, opened_by, correlation_id)
      VALUES (v_hold, 'PLATFORM', (rc->>'artifact_id')::uuid, 'evidence_stale', governance.rg_artifact_id('evidence', v_key),
              format('change impact %s: a controlling artifact changed under %s; its dependent verifications are stale until re-run', left(v->>'digest', 12), rc->>'key'), p_actor, p_correlation);
      INSERT INTO governance.rg_hold_origins (hold_id, origin, origin_artifact, impact_id, findings) VALUES (v_hold, 'impact', (rc->>'artifact_id')::uuid, p_impact, v->'stale_verifications');
      v_held := v_held || jsonb_build_array(jsonb_build_object('hold_id', v_hold, 'subject', rc->>'artifact_id', 'key', rc->>'key'));
    END LOOP;
  END IF;
  PERFORM governance.ledger(NULL, NULL, 'change_impact', p_impact, NULL, 'impact.recorded', p_actor,
    jsonb_build_object('digest', v->>'digest', 'trigger', p_trigger, 'counts', v->'counts', 'held', v_held), p_correlation);
  RETURN v || jsonb_build_object('impact_id', p_impact, 'trigger', p_trigger, 'held', v_held, 'evidence_artifact', governance.rg_artifact_id('evidence', v_key));
END $$;
REVOKE ALL ON FUNCTION governance.rg_record_impact(uuid, jsonb, int, text, text, uuid, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_record_impact(uuid, jsonb, int, text, text, uuid, jsonb, uuid, uuid) TO eye_commit;

/* RECONCILE INHERITANCE (IA-06-005, DP-07-005, PR-08-005): for each artifact (≤ 200), its inheritance re-evaluated. NON-CONFORMANT → a hold
   on the artifact (its acceptance/promotion denied: evidence_missing for incomplete/unverifiable, evidence_stale for stale, conflict for
   circular/conflicting/control_order) and on every CAPABILITY depending on it (capability acceptance held), the affected journeys and
   release candidates named; CONFORMANT (a closed chain) → §RG's open inheritance holds on it LIFTED, and an impact hold on it lifted once
   every stale verification that impact named is current again. */
CREATE OR REPLACE FUNCTION governance.rg_reconcile_inheritance(p_artifacts uuid[], p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid; v_inh jsonb; v_out jsonb := '[]'::jsonb; v_kinds text[]; v_kind text; v_subjects uuid[]; s uuid; v_hold uuid; v_held jsonb; v_lifted jsonb; h record; v_open jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.trace.check', p_actor, 'trace link');
  IF p_artifacts IS NULL OR cardinality(p_artifacts) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'trace link rejected (artifacts): name 1–200 artifacts' USING ERRCODE = '22023'; END IF;
  FOREACH v_id IN ARRAY (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_artifacts) x) LOOP
    IF NOT EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = v_id AND a.superseded_at IS NULL AND a.scope = 'PLATFORM') THEN
      RAISE EXCEPTION 'trace link rejected (unknown_artifact): % is not a current registry artifact', v_id USING ERRCODE = '22023';
    END IF;
    v_inh := governance.rg_inheritance(v_id); v_held := '[]'::jsonb; v_lifted := '[]'::jsonb;
    IF NOT (v_inh->>'conformant')::boolean THEN
      v_kinds := ARRAY(SELECT DISTINCT CASE f->>'class' WHEN 'stale' THEN 'evidence_stale' WHEN 'incomplete' THEN 'evidence_missing' WHEN 'unverifiable' THEN 'evidence_missing' ELSE 'conflict' END
                         FROM jsonb_array_elements(v_inh->'findings') f ORDER BY 1);
      v_subjects := ARRAY[v_id] || ARRAY(SELECT (c->>'artifact_id')::uuid FROM jsonb_array_elements(v_inh->'affected'->'capabilities') c);
      FOREACH s IN ARRAY v_subjects LOOP
        FOREACH v_kind IN ARRAY v_kinds LOOP
          IF NOT EXISTS (SELECT 1 FROM governance.holds hh JOIN governance.rg_hold_origins o ON o.hold_id = hh.hold_id
                          WHERE hh.subject_artifact = s AND hh.lifted_at IS NULL AND hh.reason_kind = v_kind AND o.origin = 'inheritance' AND o.origin_artifact = v_id) THEN
            v_hold := gen_random_uuid();
            INSERT INTO governance.holds (hold_id, scope, subject_artifact, reason_kind, source_artifact, reason, opened_by, correlation_id)
            VALUES (v_hold, 'PLATFORM', s, v_kind, v_id, format('the inheritance of %s is not closed (%s): acceptance and promotion held until the chain is restored',
                    v_inh->'artifact'->>'key', (SELECT string_agg(DISTINCT f->>'class', ', ') FROM jsonb_array_elements(v_inh->'findings') f)), p_actor, p_correlation);
            INSERT INTO governance.rg_hold_origins (hold_id, origin, origin_artifact, findings) VALUES (v_hold, 'inheritance', v_id, v_inh->'findings');
            v_held := v_held || jsonb_build_array(jsonb_build_object('hold_id', v_hold, 'subject', s, 'reason_kind', v_kind));
          END IF;
        END LOOP;
      END LOOP;
      IF jsonb_array_length(v_held) > 0 THEN
        PERFORM governance.ledger(NULL, NULL, 'artifact', v_id, (v_inh->'artifact'->>'version')::int, 'inheritance.held', p_actor,
          jsonb_build_object('findings', v_inh->'findings', 'held', v_held, 'controlling_authority', v_inh->'controlling_authority', 'affected', v_inh->'affected'), p_correlation);
      END IF;
    ELSE
      FOR h IN SELECT hh.hold_id FROM governance.holds hh JOIN governance.rg_hold_origins o ON o.hold_id = hh.hold_id
                WHERE hh.lifted_at IS NULL AND o.origin = 'inheritance' AND o.origin_artifact = v_id ORDER BY hh.opened_at LOOP
        UPDATE governance.holds SET lifted_at = clock_timestamp(), lifted_by = p_actor, lift_reason = 'the evidence chain is closed (inheritance reconciled)' WHERE hold_id = h.hold_id;
        v_lifted := v_lifted || jsonb_build_array(h.hold_id);
      END LOOP;
    END IF;
    -- an impact hold on this artifact: lifted once every stale verification the impact named is current again
    FOR h IN SELECT hh.hold_id, o.impact_id FROM governance.holds hh JOIN governance.rg_hold_origins o ON o.hold_id = hh.hold_id
              WHERE hh.subject_artifact = v_id AND hh.lifted_at IS NULL AND o.origin = 'impact' ORDER BY hh.opened_at LOOP
      v_open := governance.rg_impact_open(h.impact_id);
      IF jsonb_array_length(v_open) = 0 THEN
        UPDATE governance.holds SET lifted_at = clock_timestamp(), lifted_by = p_actor, lift_reason = 'every verification the change impact made stale is current again' WHERE hold_id = h.hold_id;
        v_lifted := v_lifted || jsonb_build_array(h.hold_id);
      END IF;
    END LOOP;
    IF jsonb_array_length(v_lifted) > 0 THEN
      PERFORM governance.ledger(NULL, NULL, 'artifact', v_id, (v_inh->'artifact'->>'version')::int, 'inheritance.restored', p_actor, jsonb_build_object('lifted', v_lifted), p_correlation);
    END IF;
    v_out := v_out || jsonb_build_array(v_inh || jsonb_build_object('held', v_held, 'lifted', v_lifted,
      'still_open', (SELECT coalesce(jsonb_agg(hh.hold_id), '[]'::jsonb) FROM governance.holds hh WHERE hh.subject_artifact = v_id AND hh.lifted_at IS NULL)));
  END LOOP;
  RETURN jsonb_build_object('results', v_out);
END $$;
REVOKE ALL ON FUNCTION governance.rg_reconcile_inheritance(uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_reconcile_inheritance(uuid[], uuid, uuid) TO eye_commit;

/* INGEST a verification record (V04-T-012, ES-67-001, ES-03-001): a report the API normalised (reports.ts), with its sha256 — the same
   digest again is the SAME record (idempotent). Each case registers its `test` (by file and full name), VERIFIES the requirements its title
   cites by EXACT id (resolved against the registry; unresolved tokens counted, never guessed) and CONSUMES the fixtures named (a quarantined
   or unapproved fixture is refused — evidence on it is never admitted); the record is `evidence` EVIDENCING each test with its status. */
CREATE OR REPLACE FUNCTION governance.rg_ingest_verification(p_record uuid, p jsonb, p_build jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE prev governance.rg_verification_records%ROWTYPE; c jsonb; i int := 0; v_test jsonb; v_key text; v_title text; v_req uuid; v_fx uuid; v_fixtures uuid[]; v_resolved uuid[];
        v_passed int := 0; v_failed int := 0; v_other int := 0; v_result text; v_until timestamptz; v_ev text; v_unres int := 0; f text; fx governance.artifacts%ROWTYPE; v_row governance.rg_verification_records%ROWTYPE;
BEGIN
  PERFORM governance.assert_platform('governance.verification.ingest', p_actor, 'verification record');
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'verification record rejected (report): the report is an object' USING ERRCODE = '22023'; END IF;
  IF coalesce(p->>'source_digest', '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'verification record rejected (digest): the report''s sha256 is 64 hex' USING ERRCODE = '22023'; END IF;
  SELECT * INTO prev FROM governance.rg_verification_records r WHERE r.source_digest = p->>'source_digest';
  IF prev.record_id IS NOT NULL THEN RETURN jsonb_build_object('duplicate', true, 'record', to_jsonb(prev)); END IF;
  IF coalesce(p->>'source_kind', '') NOT IN ('vitest', 'playwright', 'gate_receipt') THEN RAISE EXCEPTION 'verification record rejected (source): vitest, playwright or gate_receipt' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p->>'source_name')), 0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'verification record rejected (name): the report is named (1–200 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(p->>'claim', '') NOT IN ('construction', 'demonstration') THEN
    RAISE EXCEPTION 'verification record rejected (claim): a record is construction or demonstration evidence — never acceptance (R2/H3)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p->'cases') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'cases') = 0 OR jsonb_array_length(p->'cases') > 5000 THEN
    RAISE EXCEPTION 'verification record rejected (cases): a record carries 1–5000 cases (an empty report verifies nothing)' USING ERRCODE = '22023';
  END IF;
  FOREACH f IN ARRAY ARRAY['identity', 'execution', 'validity'] LOOP
    IF jsonb_typeof(p->f) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'verification record rejected (%): the % dimension is stated (V04-T-012)', f, f USING ERRCODE = '22023'; END IF;
  END LOOP;
  BEGIN v_until := (p->>'valid_until')::timestamptz; EXCEPTION WHEN others THEN v_until := NULL; END;
  IF v_until IS NULL OR v_until <= clock_timestamp() OR v_until > clock_timestamp() + interval '400 days' THEN
    RAISE EXCEPTION 'verification record rejected (validity): a record is valid until a future instant within 400 days — evidence expires' USING ERRCODE = '22023';
  END IF;
  v_ev := 'verification:' || (p->>'source_digest');
  FOR c IN SELECT x FROM jsonb_array_elements(p->'cases') x LOOP
    i := i + 1;
    IF coalesce(c->>'status', '') NOT IN ('passed', 'failed', 'skipped', 'todo', 'flaky', 'unstated') THEN
      RAISE EXCEPTION 'verification record rejected (cases): case % has status %', i, coalesce(c->>'status', '<null>') USING ERRCODE = '22023';
    END IF;
    IF coalesce(length(btrim(c->>'key')), 0) NOT BETWEEN 1 AND 200 OR coalesce(length(btrim(c->>'title')), 0) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'verification record rejected (cases): case % has no test identity (key 1–200, title 1–500)', i USING ERRCODE = '22023';
    END IF;
    v_fixtures := '{}';
    FOR f IN SELECT jsonb_array_elements_text(coalesce(c->'fixtures', '[]'::jsonb)) LOOP
      SELECT * INTO fx FROM governance.artifacts WHERE artifact_id = governance.rg_artifact_id('fixture', f) AND superseded_at IS NULL;
      IF fx.artifact_id IS NULL THEN RAISE EXCEPTION 'verification record rejected (unknown_fixture): % is not a registered fixture', f USING ERRCODE = '22023'; END IF;
      IF fx.lifecycle <> 'active' THEN
        RAISE EXCEPTION 'verification record rejected (state): fixture % is % — evidence on an unapproved or quarantined fixture is never admitted (DP-67-005)', f, fx.lifecycle USING ERRCODE = '22023';
      END IF;
      IF (fx.attributes->>'valid_until')::timestamptz <= clock_timestamp() THEN
        RAISE EXCEPTION 'verification record rejected (expired): fixture % expired on % — quarantine and rebuild it first', f, fx.attributes->>'valid_until' USING ERRCODE = '22023';
      END IF;
      v_fixtures := v_fixtures || fx.artifact_id;
    END LOOP;
    v_test := governance.rg_put_artifact('test', btrim(c->>'key'), left(btrim(c->>'title'), 500), 'verification', NULL, 'active',
                jsonb_build_object('file', c->>'file', 'full_name', c->>'full_name', 'runner', p->>'source_kind'), NULL, 'conformance_steward',
                jsonb_build_object('path', 'verification', 'record_id', p_record), p_actor, p_correlation);
    v_resolved := ARRAY(SELECT DISTINCT a.artifact_id FROM governance.artifacts a
                         WHERE a.kind = 'requirement' AND a.superseded_at IS NULL AND a.lifecycle IN ('active', 'proposed', 'deprecated')
                           AND split_part(a.external_key, ':', 2) = ANY (ARRAY(SELECT jsonb_array_elements_text(coalesce(c->'cited', '[]'::jsonb)))) ORDER BY 1);
    v_unres := v_unres + (SELECT count(*) FROM jsonb_array_elements_text(coalesce(c->'cited', '[]'::jsonb)) t(x)
                           WHERE NOT EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.kind = 'requirement' AND a.superseded_at IS NULL AND split_part(a.external_key, ':', 2) = t.x))::int;
    FOREACH v_req IN ARRAY v_resolved LOOP
      PERFORM governance.rg_put_link((v_test->>'artifact_id')::uuid, v_req, 'verifies', jsonb_build_object('source', 'verification', 'record_id', p_record), p_actor, p_correlation);
    END LOOP;
    FOREACH v_fx IN ARRAY v_fixtures LOOP
      PERFORM governance.rg_put_link((v_test->>'artifact_id')::uuid, v_fx, 'consumes', jsonb_build_object('source', 'verification', 'record_id', p_record), p_actor, p_correlation);
    END LOOP;
    IF c->>'status' = 'passed' THEN v_passed := v_passed + 1; ELSIF c->>'status' IN ('failed', 'flaky') THEN v_failed := v_failed + 1; ELSE v_other := v_other + 1; END IF;
    c := c || jsonb_build_object('_test', v_test, '_resolved', to_jsonb(v_resolved), '_fixtures', to_jsonb(v_fixtures), '_no', i);
    p := jsonb_set(p, ARRAY['cases', (i - 1)::text], c);
  END LOOP;
  -- the result is computed here from the cases — never taken from the report's own summary
  v_result := CASE WHEN p->>'source_kind' = 'gate_receipt' AND coalesce(p->>'declared_result', '') NOT IN ('passed', 'failed') THEN 'unstated'
                   WHEN v_failed = 0 AND v_passed > 0 THEN 'passed' WHEN v_passed = 0 AND v_failed > 0 THEN 'failed' WHEN v_passed = 0 AND v_failed = 0 THEN 'unstated' ELSE 'mixed' END;
  INSERT INTO governance.rg_verification_records (record_id, source_kind, source_name, source_digest, identity, execution, validity, totals, result, valid_until, claim, build_identity, ingested_by, correlation_id)
  VALUES (p_record, p->>'source_kind', btrim(p->>'source_name'), p->>'source_digest', p->'identity', p->'execution', p->'validity',
          jsonb_build_object('cases', i, 'passed', v_passed, 'failed', v_failed, 'other', v_other, 'unresolved_citations', v_unres), v_result, v_until, p->>'claim',
          coalesce(p_build, '{}'::jsonb) || governance.rg_build_identity(), p_actor, p_correlation)
  RETURNING * INTO v_row;
  INSERT INTO governance.rg_verification_cases (record_id, case_no, test_artifact, test_version, status, duration_ms, cited, resolved, fixtures)
  SELECT p_record, (x->>'_no')::int, (x->'_test'->>'artifact_id')::uuid, (x->'_test'->>'version')::int, x->>'status', nullif(x->>'duration_ms', '')::numeric,
         ARRAY(SELECT jsonb_array_elements_text(coalesce(x->'cited', '[]'::jsonb))), ARRAY(SELECT (jsonb_array_elements_text(x->'_resolved'))::uuid),
         ARRAY(SELECT (jsonb_array_elements_text(x->'_fixtures'))::uuid)
    FROM jsonb_array_elements(p->'cases') x;
  PERFORM governance.rg_put_artifact('evidence', v_ev, format('%s %s — %s (%s cases)', p->>'source_kind', btrim(p->>'source_name'), v_result, i), 'verification', NULL, 'active',
            jsonb_build_object('evidence_kind', 'verification_record', 'record_id', p_record, 'source_kind', p->>'source_kind', 'result', v_result, 'valid_until', v_until, 'claim', p->>'claim'),
            NULL, 'conformance_steward', jsonb_build_object('path', 'verification', 'record_id', p_record), p_actor, p_correlation);
  PERFORM governance.rg_put_link(governance.rg_artifact_id('evidence', v_ev), (x->'_test'->>'artifact_id')::uuid, 'evidences',
            jsonb_build_object('source', 'verification', 'record_id', p_record, 'status', x->>'status'), p_actor, p_correlation)
     FROM jsonb_array_elements(p->'cases') x;
  PERFORM governance.ledger(NULL, NULL, 'verification_record', p_record, NULL, 'verification.ingested', p_actor,
    jsonb_build_object('source_kind', p->>'source_kind', 'source_digest', p->>'source_digest', 'result', v_result, 'totals', v_row.totals), p_correlation);
  RETURN jsonb_build_object('duplicate', false, 'record', to_jsonb(v_row), 'evidence_artifact', governance.rg_artifact_id('evidence', v_ev));
END $$;
REVOKE ALL ON FUNCTION governance.rg_ingest_verification(uuid, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_ingest_verification(uuid, jsonb, jsonb, uuid, uuid) TO eye_commit;

/* REVIEW a verification record (ES-03-001 "independently reviewable"): independent assurance — a named human, never the ingester, never the
   runner the record names, never an agent — on the record's exact digest. */
CREATE OR REPLACE FUNCTION governance.rg_review_verification(p_record uuid, p_decision text, p_digest text, p_reason text, p_review uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE r governance.rg_verification_records%ROWTYPE; v_builders uuid[]; v_row governance.rg_verification_reviews%ROWTYPE;
BEGIN
  PERFORM governance.assert_platform('governance.verification.review', p_actor, 'verification record');
  SELECT * INTO r FROM governance.rg_verification_records WHERE record_id = p_record;
  IF r.record_id IS NULL THEN RAISE EXCEPTION 'verification record rejected (unknown_record): no record %', p_record USING ERRCODE = '22023'; END IF;
  v_builders := ARRAY[r.ingested_by] || CASE WHEN coalesce(r.execution->>'runner_principal', '') ~ '^[0-9a-f-]{36}$' THEN ARRAY[(r.execution->>'runner_principal')::uuid] ELSE '{}'::uuid[] END;
  PERFORM governance.assert_approver('verification record', p_actor, NULL, NULL, ARRAY['independent_assurance'], r.ingested_by, v_builders, 'the accountable review of a verification record');
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'rejected') THEN RAISE EXCEPTION 'verification record rejected (decision): accepted or rejected' USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM r.source_digest THEN RAISE EXCEPTION 'verification record rejected (stale): the review names the record''s exact digest' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'verification record rejected (reason): a review states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM governance.rg_verification_reviews v WHERE v.record_id = p_record AND v.reviewer = p_actor) THEN
    RAISE EXCEPTION 'verification record rejected (duplicate): this reviewer already reviewed the record' USING ERRCODE = '22023';
  END IF;
  INSERT INTO governance.rg_verification_reviews (review_id, record_id, decision, record_digest, reason, reviewer, correlation_id)
  VALUES (p_review, p_record, p_decision, p_digest, btrim(p_reason), p_actor, p_correlation) RETURNING * INTO v_row;
  PERFORM governance.ledger(NULL, NULL, 'verification_record', p_record, NULL, 'verification.reviewed', p_actor, jsonb_build_object('decision', p_decision, 'review_id', p_review), p_correlation);
  RETURN to_jsonb(v_row);
END $$;
REVOKE ALL ON FUNCTION governance.rg_review_verification(uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_review_verification(uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* REGISTER (or REBUILD) a fixture (DP-67-002): identity, purpose, generator or approved source, schema, seed, classification (synthetic,
   anonymised or public only — a privacy-unsafe fixture is never registered), expected results, environment scope, expiry; builders declared.
   A new version is PROPOSED (unapproved: no evidence may use it). Over a QUARANTINED fixture this is the REBUILD: from a named generator, with
   a different content (the contaminated one is never re-registered as is). */
CREATE OR REPLACE FUNCTION governance.rg_register_fixture(p_key text, p_expected_version int, p_title text, p_attributes jsonb, p_reason text, p_decision uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.artifacts%ROWTYPE; a jsonb := coalesce(p_attributes, '{}'::jsonb); v_until timestamptz; v_put jsonb; f text; v_rebuild boolean;
BEGIN
  PERFORM governance.assert_platform('governance.fixture.register', p_actor, 'governance fixture');
  IF p_key IS NULL OR p_key !~ '^[a-z0-9][a-z0-9._:/-]{1,150}$' THEN RAISE EXCEPTION 'governance fixture rejected (key): a fixture key is lower-case (2–151 characters)' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'governance fixture rejected (title): a title of 1–500 characters' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'governance fixture rejected (reason): a registration states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(a) <> 'object' THEN RAISE EXCEPTION 'governance fixture rejected (attributes): attributes are an object' USING ERRCODE = '22023'; END IF;
  FOREACH f IN ARRAY ARRAY['purpose', 'schema', 'seed', 'classification', 'expected_results'] LOOP
    IF coalesce(btrim(a->>f), '') = '' THEN RAISE EXCEPTION 'governance fixture rejected (%): a fixture declares its % (DP-67-002)', f, replace(f, '_', ' ') USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF coalesce(btrim(a->>'generator'), '') = '' AND coalesce(btrim(a->>'source'), '') = '' THEN
    RAISE EXCEPTION 'governance fixture rejected (generator): a fixture names its generator or its approved source' USING ERRCODE = '22023';
  END IF;
  IF a->>'classification' NOT IN ('synthetic', 'anonymised', 'public') THEN
    RAISE EXCEPTION 'governance fixture rejected (classification): % — a fixture is synthetic, anonymised or public; a privacy-unsafe fixture is never registered', a->>'classification' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(a->'environment_scope') IS DISTINCT FROM 'array' OR jsonb_array_length(a->'environment_scope') = 0 THEN
    RAISE EXCEPTION 'governance fixture rejected (environment_scope): a fixture names the environments it may be used in' USING ERRCODE = '22023';
  END IF;
  IF a ? 'builders' AND (jsonb_typeof(a->'builders') <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(a->'builders') b WHERE b !~ '^[0-9a-f-]{36}$')) THEN
    RAISE EXCEPTION 'governance fixture rejected (builders): the builders are principal ids' USING ERRCODE = '22023';
  END IF;
  BEGIN v_until := (a->>'valid_until')::timestamptz; EXCEPTION WHEN others THEN v_until := NULL; END;
  IF v_until IS NULL OR v_until <= clock_timestamp() THEN RAISE EXCEPTION 'governance fixture rejected (validity): a fixture expires at a future instant' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM governance.artifacts WHERE artifact_id = governance.rg_artifact_id('fixture', p_key) AND superseded_at IS NULL FOR UPDATE;
  IF coalesce(p_expected_version, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'governance fixture rejected (stale): % is at version %, not %', p_key, coalesce(cur.version, 0), coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF cur.lifecycle = 'retired' THEN RAISE EXCEPTION 'governance fixture rejected (state): % is retired; a retired identity is never reused' , p_key USING ERRCODE = '22023'; END IF;
  v_rebuild := cur.lifecycle = 'quarantined';
  IF v_rebuild AND governance.rg_content_digest('fixture', p_key, btrim(p_title), 'verification', NULL, a || jsonb_build_object('builders', coalesce(a->'builders', '[]'::jsonb))) = cur.digest THEN
    -- (the digest leaves out the governance state — approval, quarantine — so the same seed and source give the same digest)
    RAISE EXCEPTION 'governance fixture rejected (rebuild): a quarantined fixture is rebuilt from its generator with a new content (seed or source) — never re-registered as is' USING ERRCODE = '22023';
  END IF;
  v_put := governance.rg_put_artifact('fixture', p_key, btrim(p_title), 'verification', NULL, 'proposed', a || jsonb_build_object('builders', coalesce(a->'builders', '[]'::jsonb)), NULL, 'conformance_steward',
                                      jsonb_build_object('path', 'fixture'), p_actor, p_correlation);
  IF NOT (v_put->>'changed')::boolean THEN RETURN v_put || jsonb_build_object('unchanged', true); END IF;
  INSERT INTO governance.rg_fixture_decisions (decision_id, fixture_artifact, fixture_version, decision, reason, digest, actor, correlation_id)
  VALUES (p_decision, (v_put->>'artifact_id')::uuid, (v_put->>'version')::int, CASE WHEN v_rebuild THEN 'rebuilt' ELSE 'registered' END, btrim(p_reason), v_put->>'digest', p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'fixture', (v_put->>'artifact_id')::uuid, (v_put->>'version')::int, CASE WHEN v_rebuild THEN 'fixture.rebuilt' ELSE 'fixture.registered' END, p_actor,
    jsonb_build_object('key', p_key, 'digest', v_put->>'digest'), p_correlation);
  RETURN v_put || jsonb_build_object('key', p_key, 'lifecycle', 'proposed', 'rebuilt', v_rebuild);
END $$;
REVOKE ALL ON FUNCTION governance.rg_register_fixture(text, int, text, jsonb, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_register_fixture(text, int, text, jsonb, text, uuid, uuid, uuid) TO eye_commit;

/* APPROVE a fixture version for use (DP-67-005 "rebuild from approved sources or generators"): independent assurance — a named human, never
   the steward who registered any version of it, never a declared builder, never an agent — on the version's exact digest. */
CREATE OR REPLACE FUNCTION governance.rg_approve_fixture(p_fixture uuid, p_version int, p_digest text, p_reason text, p_decision uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.artifacts%ROWTYPE; v_builders uuid[]; v_proposer uuid; v_put jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.fixture.approve', p_actor, 'governance fixture');
  SELECT * INTO cur FROM governance.artifacts WHERE artifact_id = p_fixture AND superseded_at IS NULL AND kind = 'fixture' FOR UPDATE;
  IF cur.artifact_id IS NULL THEN RAISE EXCEPTION 'governance fixture rejected (unknown_fixture): no fixture %', p_fixture USING ERRCODE = '22023'; END IF;
  -- the builders: whoever registered or rebuilt any version (an approver or a quarantining steward did not build it), and the declared ones
  SELECT array_agg(DISTINCT x) INTO v_builders FROM (SELECT d.actor AS x FROM governance.rg_fixture_decisions d WHERE d.fixture_artifact = p_fixture AND d.decision IN ('registered', 'rebuilt')
                                                      UNION SELECT b::uuid FROM jsonb_array_elements_text(coalesce(cur.attributes->'builders', '[]'::jsonb)) b) s;
  SELECT d.actor INTO v_proposer FROM governance.rg_fixture_decisions d WHERE d.fixture_artifact = p_fixture AND d.fixture_version = cur.version AND d.decision IN ('registered', 'rebuilt') LIMIT 1;
  PERFORM governance.assert_approver('governance fixture', p_actor, NULL, NULL, ARRAY['independent_assurance'], v_proposer, v_builders, 'approving a fixture for use');
  IF cur.lifecycle <> 'proposed' THEN RAISE EXCEPTION 'governance fixture rejected (state): % is %; only a proposed version is approved', cur.external_key, cur.lifecycle USING ERRCODE = '22023'; END IF;
  IF p_version IS DISTINCT FROM cur.version OR p_digest IS DISTINCT FROM cur.digest THEN
    RAISE EXCEPTION 'governance fixture rejected (stale): the approval names version % and its exact digest', cur.version USING ERRCODE = '22023';
  END IF;
  IF (cur.attributes->>'valid_until')::timestamptz <= clock_timestamp() THEN RAISE EXCEPTION 'governance fixture rejected (expired): % expired before its approval', cur.external_key USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'governance fixture rejected (reason): an approval states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  v_put := governance.rg_put_artifact('fixture', cur.external_key, cur.title, cur.authority_class, cur.controlling_volume, 'active', cur.attributes || jsonb_build_object('approved_by', p_actor),
                                      cur.owner_principal_id, cur.owner_role, cur.source, p_actor, p_correlation);
  INSERT INTO governance.rg_fixture_decisions (decision_id, fixture_artifact, fixture_version, decision, reason, digest, actor, correlation_id)
  VALUES (p_decision, p_fixture, (v_put->>'version')::int, 'approved', btrim(p_reason), cur.digest, p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'fixture', p_fixture, (v_put->>'version')::int, 'fixture.approved', p_actor, jsonb_build_object('approved_version', cur.version, 'digest', cur.digest), p_correlation);
  RETURN v_put || jsonb_build_object('key', cur.external_key, 'lifecycle', 'active');
END $$;
REVOKE ALL ON FUNCTION governance.rg_approve_fixture(uuid, int, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_approve_fixture(uuid, int, text, text, uuid, uuid, uuid) TO eye_commit;

/* QUARANTINE a fixture (DP-67-005): stale, non-representative, contaminated, privacy-unsafe, irreproducible or indistinguishable → a new
   version `quarantined`; EVERY record that evidences a test consuming it is INVALIDATED (recorded); the tests to re-run are named. */
CREATE OR REPLACE FUNCTION governance.rg_quarantine_fixture(p_fixture uuid, p_reason_class text, p_reason text, p_decision uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.artifacts%ROWTYPE; v_put jsonb; v_inv jsonb; v_tests jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.fixture.quarantine', p_actor, 'governance fixture');
  IF p_reason_class IS NULL OR p_reason_class NOT IN ('stale', 'non_representative', 'contaminated', 'privacy_unsafe', 'irreproducible', 'indistinguishable') THEN
    RAISE EXCEPTION 'governance fixture rejected (reason_class): stale, non_representative, contaminated, privacy_unsafe, irreproducible or indistinguishable' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'governance fixture rejected (reason): a quarantine states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM governance.artifacts WHERE artifact_id = p_fixture AND superseded_at IS NULL AND kind = 'fixture' FOR UPDATE;
  IF cur.artifact_id IS NULL THEN RAISE EXCEPTION 'governance fixture rejected (unknown_fixture): no fixture %', p_fixture USING ERRCODE = '22023'; END IF;
  IF cur.lifecycle IN ('quarantined', 'retired') THEN RAISE EXCEPTION 'governance fixture rejected (state): % is already %', cur.external_key, cur.lifecycle USING ERRCODE = '22023'; END IF;
  v_put := governance.rg_put_artifact('fixture', cur.external_key, cur.title, cur.authority_class, cur.controlling_volume, 'quarantined',
                                      cur.attributes || jsonb_build_object('quarantine', jsonb_build_object('class', p_reason_class, 'reason', btrim(p_reason))),
                                      cur.owner_principal_id, cur.owner_role, cur.source, p_actor, p_correlation);
  WITH ev AS (
    SELECT DISTINCT c.record_id FROM governance.rg_verification_cases c WHERE p_fixture = ANY (c.fixtures)
  ), ins AS (
    INSERT INTO governance.rg_invalidations (invalidation_id, record_id, cause_kind, cause_artifact, cause_version, reason, recorded_by, correlation_id)
    SELECT gen_random_uuid(), ev.record_id, 'fixture_quarantined', p_fixture, cur.version, format('%s: %s', p_reason_class, btrim(p_reason)), p_actor, p_correlation FROM ev
    ON CONFLICT ON CONSTRAINT rgv_once DO NOTHING RETURNING record_id)
  SELECT coalesce(jsonb_agg(record_id ORDER BY record_id), '[]'::jsonb) INTO v_inv FROM ins;
  SELECT coalesce(jsonb_agg(DISTINCT t.external_key), '[]'::jsonb) INTO v_tests FROM governance.rg_verification_cases c JOIN governance.artifacts t ON t.artifact_id = c.test_artifact AND t.superseded_at IS NULL
   WHERE p_fixture = ANY (c.fixtures);
  INSERT INTO governance.rg_fixture_decisions (decision_id, fixture_artifact, fixture_version, decision, reason_class, reason, digest, actor, correlation_id)
  VALUES (p_decision, p_fixture, (v_put->>'version')::int, 'quarantined', p_reason_class, btrim(p_reason), cur.digest, p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'fixture', p_fixture, (v_put->>'version')::int, 'fixture.quarantined', p_actor,
    jsonb_build_object('class', p_reason_class, 'invalidated', v_inv, 'rerun', v_tests), p_correlation);
  RETURN v_put || jsonb_build_object('key', cur.external_key, 'lifecycle', 'quarantined', 'invalidated', v_inv, 'rerun', v_tests);
END $$;
REVOKE ALL ON FUNCTION governance.rg_quarantine_fixture(uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_quarantine_fixture(uuid, text, text, uuid, uuid, uuid) TO eye_commit;

/* DECLARE A DECISION-ACTIVE PRODUCT (ES-06-004 "decision-active products", DP-07-003): a domain's own briefing, decision package or forecast
   CITES the vendor's contracts (a schema, an interface, a component, a requirement or a capability) — declared by the domain's
   administrator or executive, in the DOMAIN (tenant/domain isolation: another tenant never sees it; the vendor's PLATFORM impact reads it), the
   object verified to exist IN THAT DOMAIN, recorded as a DOMAIN `data_product` artifact with its `cites` links (append-only; re-declaring the
   same citations writes nothing). A change to a cited contract then lists the product among its impact's decision-active dependents. */
CREATE OR REPLACE FUNCTION governance.rg_declare_domain_product(p_tenant uuid, p_domain uuid, p_product_kind text, p_object uuid, p_title text, p_cites uuid[], p_reason text,
  p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_key text; v_id uuid; cur governance.artifacts%ROWTYPE; v_digest text; v_attrs jsonb; v_version int; v_now timestamptz := clock_timestamp(); c uuid; t governance.artifacts%ROWTYPE;
        v_links jsonb := '[]'::jsonb; v_exists boolean; v_lid uuid; f governance.artifacts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.trace.domain_cite']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'trace link rejected (actor): the act is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_product_kind IS NULL OR p_product_kind NOT IN ('briefing', 'decision_package', 'forecast') THEN
    RAISE EXCEPTION 'trace link rejected (product_kind): a decision-active product is a briefing, a decision package or a forecast' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'trace link rejected (reason): a declaration states its basis (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'trace link rejected (title): a title of 1–300 characters' USING ERRCODE = '22023'; END IF;
  IF p_cites IS NULL OR cardinality(p_cites) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'trace link rejected (cites): a product cites 1–50 registry artifacts' USING ERRCODE = '22023'; END IF;
  v_exists := CASE p_product_kind
    WHEN 'briefing' THEN EXISTS (SELECT 1 FROM executive.briefings b WHERE b.briefing_id = p_object AND b.tenant_id = p_tenant AND b.domain_id = p_domain)
    WHEN 'decision_package' THEN EXISTS (SELECT 1 FROM decision.packages_current x WHERE x.package_id = p_object AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    ELSE EXISTS (SELECT 1 FROM prediction.forecasts_current x WHERE x.forecast_id = p_object AND x.tenant_id = p_tenant AND x.domain_id = p_domain) END;
  IF NOT v_exists THEN RAISE EXCEPTION 'trace link rejected (unknown_object): no % % in this domain', p_product_kind, p_object USING ERRCODE = '22023'; END IF;
  FOREACH c IN ARRAY p_cites LOOP
    SELECT * INTO t FROM governance.artifacts WHERE artifact_id = c AND superseded_at IS NULL;
    IF t.artifact_id IS NULL OR t.scope <> 'PLATFORM' OR t.lifecycle IN ('retired', 'superseded') THEN
      RAISE EXCEPTION 'trace link rejected (unknown_artifact): % is not a current registry artifact of the vendor', c USING ERRCODE = '22023';
    END IF;
    IF t.kind NOT IN ('schema', 'interface', 'component', 'requirement', 'capability', 'policy_bundle') THEN
      RAISE EXCEPTION 'trace link rejected (relation): a product cites a schema, an interface, a component, a requirement, a capability or a policy bundle — not a %', t.kind USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_key := p_product_kind || ':' || p_object::text;
  v_id := governance.rg_artifact_id('data_product', p_tenant::text || ':' || p_domain::text || ':' || v_key);
  v_attrs := jsonb_build_object('product_kind', p_product_kind, 'object_id', p_object, 'declared_reason', btrim(p_reason), 'owner_declared', 'the domain');
  v_digest := governance.rg_content_digest('data_product', v_key, btrim(p_title), 'operational_evidence', NULL, v_attrs);
  SELECT * INTO cur FROM governance.artifacts WHERE artifact_id = v_id AND superseded_at IS NULL FOR UPDATE;
  IF cur.artifact_id IS NULL OR cur.digest <> v_digest THEN
    v_version := coalesce(cur.version, 0) + 1;
    IF cur.artifact_id IS NOT NULL THEN UPDATE governance.artifacts SET superseded_at = v_now WHERE artifact_id = v_id AND version = cur.version; END IF;
    INSERT INTO governance.artifacts (artifact_id, version, scope, tenant_id, domain_id, kind, external_key, title, owner_principal_id, authority_class, lifecycle, attributes, source, digest,
                                      effective_from, recorded_by, correlation_id)
    VALUES (v_id, v_version, 'DOMAIN', p_tenant, p_domain, 'data_product', v_key, btrim(p_title), p_actor, 'operational_evidence', 'active', v_attrs,
            jsonb_build_object('path', 'domain_declaration'), v_digest, v_now, p_actor, p_correlation);
  END IF;
  SELECT * INTO f FROM governance.artifacts WHERE artifact_id = v_id AND superseded_at IS NULL;
  FOREACH c IN ARRAY (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_cites) x) LOOP
    SELECT * INTO t FROM governance.artifacts WHERE artifact_id = c AND superseded_at IS NULL;
    IF NOT EXISTS (SELECT 1 FROM governance.links_live l WHERE l.from_artifact = v_id AND l.to_artifact = c AND l.relation = 'cites'
                     AND l.attributes->>'to_digest' = t.digest AND l.attributes->>'from_digest' = f.digest) THEN
      INSERT INTO governance.links (link_id, scope, tenant_id, domain_id, from_artifact, to_artifact, relation, retired, retires_link, attributes, recorded_by, correlation_id)
      SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, l.from_artifact, l.to_artifact, l.relation, true, l.link_id, jsonb_build_object('source', 'domain_declaration', 'reason', 're-declared'), p_actor, p_correlation
        FROM governance.links_live l WHERE l.from_artifact = v_id AND l.to_artifact = c AND l.relation = 'cites';
      v_lid := gen_random_uuid();
      INSERT INTO governance.links (link_id, scope, tenant_id, domain_id, from_artifact, to_artifact, relation, attributes, recorded_by, correlation_id)
      VALUES (v_lid, 'DOMAIN', p_tenant, p_domain, v_id, c, 'cites', jsonb_build_object('source', 'domain_declaration', 'reason', btrim(p_reason), 'from_version', f.version, 'to_version', t.version,
              'from_digest', f.digest, 'to_digest', t.digest), p_actor, p_correlation);
      v_links := v_links || jsonb_build_array(jsonb_build_object('link_id', v_lid, 'cites', t.external_key));
    END IF;
  END LOOP;
  IF jsonb_array_length(v_links) > 0 OR cur.artifact_id IS NULL OR cur.digest <> v_digest THEN
    PERFORM governance.ledger(p_tenant, p_domain, 'artifact', v_id, f.version, 'trace.product_declared', p_actor,
      jsonb_build_object('product_kind', p_product_kind, 'object_id', p_object, 'links', v_links), p_correlation);
  END IF;
  RETURN jsonb_build_object('artifact_id', v_id, 'version', f.version, 'key', v_key, 'links', v_links, 'unchanged', jsonb_array_length(v_links) = 0 AND cur.artifact_id IS NOT NULL AND cur.digest = v_digest);
END $$;
REVOKE ALL ON FUNCTION governance.rg_declare_domain_product(uuid, uuid, text, uuid, text, uuid[], text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.rg_declare_domain_product(uuid, uuid, text, uuid, text, uuid[], text, uuid, uuid) TO eye_commit;
