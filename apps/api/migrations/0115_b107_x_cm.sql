-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0115 §CM — CP-6 B107: CONFORMANCE MANIFESTS, THE RELEASE-CANDIDATE RECORD AND ITS EVIDENCE CHECK, THE LOCAL CONFORMANCE MONITOR
-- (F-P7D-25: V03-T-029, V03-T-433, V03-T-452, V03-T-479, ES-01-001/-004/-005, ES-02-002, ES-31..40-002, ES-65-001/-002/-004, ADR-0001,
-- V04-T-001/-004/-018, AI-08-001/-005, IA-01-001/-002/-003/-005/-006, IA-72-003, V06-T-002, DP-65-002/-005, DP-67-006, DAT-GV-09,
-- V07-T-005). Applies alone on top of 0001–0114 and the §0 prelude; nothing of 0001–0114 or §0 is re-declared.
--
--   THE MANIFEST: `conformance/components.manifest.json` is GENERATED from source (apps/api/src/governance/conformance/
--     generate-components-manifest.mjs; the unit tests "regenerated equals committed" and "no unmapped unit" run inside build-test). The
--     conformance steward REGISTERS the committed file (governance.cm_register_manifest): its digest, its index, and every deployable unit and
--     component as an ARTIFACT of the shared core with its LINKS (manifest covers unit/component; unit deploys component; unit depends_on unit;
--     component maps_to its requirement and consumes its interfaces and schemas — §RG's artifacts, linked when §RG has registered them; what is
--     unresolved is COUNTED and returned, never hidden). A manifest carrying an UNMAPPED unit is REFUSED and the non-conformant record is
--     PRESERVED as a finding (IA-01-005, DP-65-005).
--   THE RELEASE CANDIDATE (B65 SUBSTITUTED — explicitly NOT a release, NOT a signed release, NOT production admission): head SHA, migration head
--     (read by the port from public.schema_migrations), policy bundle (version + digest), the registered manifest version and digest, the
--     configuration digest, the deployment profile, the customer scope, the topology (the manifest's units), the period, and the EVIDENCE items
--     (family, kind, ref, digest, bound head SHA, captured_at, valid_until — a registered §RG evidence artifact by id, or a reference). THE CHECK
--     (governance.cm_check_candidate) refuses ABSENT (a required family without an item), STALE (valid_until passed on the database clock),
--     UNVERIFIABLE (no digest, an unknown or superseded artifact, a digest other than the artifact's, a capture in the future, an unknown head)
--     and FOREIGN-VERSION evidence (bound to another head SHA; a manifest or migration head that is no longer what runs), and HOLDS on any open
--     hold of the candidate (an expired exception — §PG's, a conflict — §PG's, a conformance drift — the monitor's). Its evidence holds are
--     opened and lifted by the check itself. ATTESTATION (governance.cm_attest_candidate): independent assurance — a named human, never the
--     proposer, never a builder, never an agent (governance.assert_approver) — signs `manifest_attestation` over the candidate's digest, re-
--     checked at that instant (no open hold, no evidence expired since the check, the manifest still current).
--   THE MONITOR (governance.cm_record_monitor): the after-tick hook `governance-conformance` (the attention agent, its own action
--     governance.conformance.monitor, READ FIRST then this write — B33-H) or the steward; findings by fingerprint (opened / resolved when no
--     longer observed), a `conformance_drift` hold per drift finding on the candidates it concerns, a run recorded on change.
--   PLATFORM rows only (the vendor's registries): readable by every authenticated context, written only by these definer ports. A PLATFORM
--   finding raises no attention item (attention is DOMAIN-scoped): it is shown in the workspace and the ledger.
--
-- THREE CLAIMS: CONSTRUCTION (this file + phase6-conformance-b107); DEMONSTRATED OPERATION (the act — every candidate `claim = 'demonstration'`,
-- `release = 'not_a_release'`); REAL ACCEPTANCE / PRODUCTION ADMISSION / PRODUCTION MONITORING (R1/R2/H2) — never claimed, and no row here can.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CM.1 THE VOCABULARIES ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The conformance evidence families (V03-T-452). REQUIRED by the check: contract, trust, human authority (evidenced by this repository's
   harnesses). Quality, deployment and operations are CARRIED (B64 SLO computation, B106 parity, B63 runbooks): listed, never required, never
   inferred present. */
CREATE OR REPLACE FUNCTION governance.cm_evidence_families() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['contract', 'trust', 'human_authority', 'quality', 'deployment', 'operations'] $$;
CREATE OR REPLACE FUNCTION governance.cm_required_families() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['contract', 'trust', 'human_authority'] $$;
CREATE OR REPLACE FUNCTION governance.cm_finding_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  -- the registration's
  'unmapped_unit',
  -- the monitor's
  'manifest_unregistered', 'manifest_drift', 'manifest_unreadable', 'policy_drift', 'migration_drift', 'head_drift', 'evidence_expired', 'exception_expired', 'exception_expiry_reported'] $$;
CREATE OR REPLACE FUNCTION governance.cm_monitor_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'manifest_unregistered', 'manifest_drift', 'manifest_unreadable', 'policy_drift', 'migration_drift', 'head_drift', 'evidence_expired', 'exception_expired', 'exception_expiry_reported'] $$;
GRANT EXECUTE ON FUNCTION governance.cm_evidence_families(), governance.cm_required_families(), governance.cm_finding_kinds(), governance.cm_monitor_kinds() TO eye_app, eye_commit;

/* The migration head this database runs (the last applied migration, by name). Read by the candidate's port itself — never a caller's word. */
CREATE OR REPLACE FUNCTION governance.cm_migration_head() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp AS $$ SELECT max(filename) FROM public.schema_migrations $$;
REVOKE ALL ON FUNCTION governance.cm_migration_head() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.cm_migration_head() TO eye_app, eye_commit;

/* A principal's display name for the conformance reads: a PLATFORM-homed principal (the vendor's steward, assurance, product authority) or one
   of the caller's own tenant; NULL otherwise (products.catalog_principal_name answers this tenant's only). */
CREATE OR REPLACE FUNCTION governance.cm_principal_name(p_principal uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT p.display_name FROM identity.principals p WHERE p.id = p_principal AND (p.scope = 'PLATFORM' OR p.tenant_id = public.eye_tenant())
$$;
REVOKE ALL ON FUNCTION governance.cm_principal_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.cm_principal_name(uuid) TO eye_app, eye_commit;

-- §CM.2 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE REGISTERED MANIFESTS: one identity (the committed file's path), a version per registered digest; the INDEX is what the ports and the
   conformance service read (units with their components, layers, dependencies; components with their kind, layer, contracts, requirement). */
CREATE TABLE governance.cm_manifests (
  manifest_id     uuid NOT NULL,
  version         int  NOT NULL CHECK (version >= 1),
  path            text NOT NULL CHECK (path ~ '^[A-Za-z0-9_./-]{3,200}$'),
  schema          text NOT NULL CHECK (schema ~ '^eye\.components-manifest/v[0-9]+$'),
  generator       text NOT NULL,
  file_digest     text NOT NULL CHECK (file_digest ~ '^[0-9a-f]{64}$'),
  index_digest    text NOT NULL CHECK (index_digest ~ '^[0-9a-f]{64}$'),
  summary         jsonb NOT NULL CHECK (jsonb_typeof(summary) = 'object'),
  index           jsonb NOT NULL CHECK (jsonb_typeof(index) = 'object' AND jsonb_typeof(index -> 'units') = 'array' AND jsonb_typeof(index -> 'components') = 'array'),
  link_report     jsonb NOT NULL DEFAULT '{}'::jsonb,
  state           text NOT NULL CHECK (state IN ('current', 'superseded')),
  registered_by   uuid NOT NULL,
  registered_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at   timestamptz,
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (manifest_id, version),
  CONSTRAINT cmm_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX cmm_one_current ON governance.cm_manifests ((true)) WHERE state = 'current';

/* THE RELEASE CANDIDATES (B65 SUBSTITUTED: not a release). Versioned: an amendment (renewed evidence) is a new version; the prior one is
   `superseded`. The check's result and the attestation are recorded on the version they concern. */
CREATE TABLE governance.cm_release_candidates (
  candidate_id        uuid NOT NULL,
  version             int  NOT NULL CHECK (version >= 1),
  label               text NOT NULL CHECK (length(btrim(label)) BETWEEN 3 AND 200),
  head_sha            text NOT NULL CHECK (head_sha ~ '^[0-9a-f]{40}$' OR head_sha = 'unknown'),
  migration_head      text NOT NULL,
  policy_bundle       jsonb NOT NULL CHECK (jsonb_typeof(policy_bundle) = 'object' AND (policy_bundle ->> 'digest') ~ '^[0-9a-f]{64}$' AND length(coalesce(policy_bundle ->> 'version', '')) > 0),
  manifest_id         uuid NOT NULL,
  manifest_version    int  NOT NULL,
  manifest_digest     text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  config_digest       text NOT NULL CHECK (config_digest ~ '^[0-9a-f]{64}$'),
  deployment_profile  text NOT NULL CHECK (deployment_profile IN ('local-dev')),
  customer_scope      jsonb NOT NULL CHECK (jsonb_typeof(customer_scope) = 'object' AND customer_scope ->> 'kind' IN ('platform', 'tenants')),
  topology            jsonb NOT NULL CHECK (jsonb_typeof(topology) = 'object'),
  period_from         date NOT NULL,
  period_to           date NOT NULL,
  evidence            jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  evidence_digest     text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  builders            uuid[] NOT NULL DEFAULT '{}',
  digest              text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state               text NOT NULL CHECK (state IN ('assembled', 'conformant', 'refused', 'held', 'attested', 'withdrawn', 'superseded')),
  check_result        jsonb,
  checked_by          uuid,
  checked_at          timestamptz,
  attested_by         uuid,
  attested_at         timestamptz,
  attestation_reason  text,
  signature_id        uuid,
  withdrawn_by        uuid,
  withdrawn_at        timestamptz,
  withdraw_reason     text,
  proposed_by         uuid NOT NULL,
  proposed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  claim               text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  release             text NOT NULL DEFAULT 'not_a_release' CHECK (release = 'not_a_release'),
  production_admission text NOT NULL DEFAULT 'R1: production admission and continued operation are external — this candidate is a local conformance record, never an admission',
  PRIMARY KEY (candidate_id, version),
  CONSTRAINT crc_period CHECK (period_to >= period_from),
  CONSTRAINT crc_attested CHECK ((state = 'attested') = (attested_by IS NOT NULL AND signature_id IS NOT NULL) OR state = 'superseded' OR state = 'withdrawn')
);
CREATE UNIQUE INDEX crc_one_open ON governance.cm_release_candidates (candidate_id) WHERE state <> 'superseded';

/* THE FINDINGS (non-conformance items): one OPEN finding per fingerprint; resolved, never deleted. */
CREATE TABLE governance.cm_findings (
  finding_id       uuid PRIMARY KEY,
  kind             text NOT NULL CHECK (kind = ANY (governance.cm_finding_kinds())),
  fingerprint      text NOT NULL CHECK (length(fingerprint) BETWEEN 3 AND 300),
  subject_artifact uuid,
  summary          text NOT NULL CHECK (length(btrim(summary)) >= 8),
  observed         jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected         jsonb NOT NULL DEFAULT '{}'::jsonb,
  state            text NOT NULL CHECK (state IN ('open', 'resolved')),
  opened_by        uuid NOT NULL,
  opened_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_by      uuid,
  resolved_at      timestamptz,
  resolution       text,
  correlation_id   uuid NOT NULL,
  CONSTRAINT cmf_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution IS NOT NULL))
);
CREATE UNIQUE INDEX cmf_one_open ON governance.cm_findings (fingerprint) WHERE state = 'open';

/* THE MONITOR RUNS (recorded on change: a finding opened or resolved, a hold opened or lifted, or the observation moved). */
CREATE TABLE governance.cm_monitor_runs (
  run_id             uuid PRIMARY KEY,
  via                text NOT NULL CHECK (via IN ('tick', 'steward')),
  ticked_tenant      uuid,
  ticked_domain      uuid,
  observed           jsonb NOT NULL,
  observation_digest text NOT NULL CHECK (observation_digest ~ '^[0-9a-f]{64}$'),
  opened             int NOT NULL DEFAULT 0,
  resolved           int NOT NULL DEFAULT 0,
  holds_opened       int NOT NULL DEFAULT 0,
  holds_lifted       int NOT NULL DEFAULT 0,
  open_after         int NOT NULL DEFAULT 0,
  actor_principal_id uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL
);
CREATE TRIGGER cmr_append_only BEFORE UPDATE OR DELETE ON governance.cm_monitor_runs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['governance.cm_manifests', 'governance.cm_release_candidates', 'governance.cm_findings', 'governance.cm_monitor_runs'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    -- the vendor's registries: readable by every authenticated context (they are not tenant data); written only by the definer ports
    EXECUTE format('CREATE POLICY cm_platform_read ON %s USING (public.eye_scope() <> ''NONE'')', t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §CM.3 THE INTERNAL HELPERS (no grant: called inside the definer ports) ─────────────────────────────────────────────────────────────────────
/* An artifact of the shared core, by (kind, external key) at PLATFORM scope: the current version when its digest is unchanged; a NEW VERSION
   (the prior one superseded) when it changed; a new identity when absent. An artifact another part registered is REUSED as it stands (never
   superseded by §CM). Returns the artifact id. */
CREATE OR REPLACE FUNCTION governance._cm_artifact(p_kind text, p_key text, p_title text, p_attrs jsonb, p_volume text, p_lifecycle text, p_actor uuid, p_correlation uuid, p_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE a governance.artifacts%ROWTYPE; v_digest text := governance.digest(jsonb_build_object('title', p_title, 'attributes', p_attrs, 'lifecycle', p_lifecycle));
BEGIN
  SELECT * INTO a FROM governance.artifacts x WHERE x.kind = p_kind AND x.external_key = p_key AND x.scope = 'PLATFORM' AND x.superseded_at IS NULL FOR UPDATE;
  IF FOUND THEN
    IF coalesce(a.source ->> 'part', '') <> 'cm' OR a.digest = v_digest THEN RETURN a.artifact_id; END IF;
    UPDATE governance.artifacts SET superseded_at = clock_timestamp() WHERE artifact_id = a.artifact_id AND version = a.version;
    INSERT INTO governance.artifacts (artifact_id, version, scope, kind, external_key, title, authority_class, controlling_volume, lifecycle, attributes, source, digest, recorded_by, correlation_id)
    VALUES (a.artifact_id, a.version + 1, 'PLATFORM', p_kind, p_key, left(p_title, 500), 'engineering', p_volume, p_lifecycle, p_attrs, jsonb_build_object('part', 'cm', 'via', 'governance.cm'), v_digest, p_actor, p_correlation);
    RETURN a.artifact_id;
  END IF;
  INSERT INTO governance.artifacts (artifact_id, version, scope, kind, external_key, title, authority_class, controlling_volume, lifecycle, attributes, source, digest, recorded_by, correlation_id)
  VALUES (coalesce(p_id, gen_random_uuid()), 1, 'PLATFORM', p_kind, p_key, left(p_title, 500), 'engineering', p_volume, p_lifecycle, p_attrs, jsonb_build_object('part', 'cm', 'via', 'governance.cm'), v_digest, p_actor, p_correlation)
  RETURNING artifact_id INTO p_id;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION governance._cm_artifact(text, text, text, jsonb, text, text, uuid, uuid, uuid) FROM PUBLIC;

/* A live link, once: inserted only when no live link (from, to, relation) exists. Returns 1 when inserted. */
CREATE OR REPLACE FUNCTION governance._cm_link(p_from uuid, p_to uuid, p_relation text, p_actor uuid, p_correlation uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM governance.links_live l WHERE l.from_artifact = p_from AND l.to_artifact = p_to AND l.relation = p_relation) THEN RETURN 0; END IF;
  INSERT INTO governance.links (link_id, scope, from_artifact, to_artifact, relation, attributes, recorded_by, correlation_id)
  VALUES (gen_random_uuid(), 'PLATFORM', p_from, p_to, p_relation, jsonb_build_object('part', 'cm'), p_actor, p_correlation);
  RETURN 1;
END $$;
REVOKE ALL ON FUNCTION governance._cm_link(uuid, uuid, text, uuid, uuid) FROM PUBLIC;

/* The current PLATFORM artifact of a kind and key, or NULL. */
CREATE OR REPLACE FUNCTION governance._cm_find(p_kind text, p_key text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT a.artifact_id FROM governance.artifacts a WHERE a.kind = p_kind AND a.external_key = p_key AND a.scope = 'PLATFORM' AND a.superseded_at IS NULL LIMIT 1
$$;
REVOKE ALL ON FUNCTION governance._cm_find(text, text) FROM PUBLIC;

/* THE LINK PASS of a registered manifest version: the desired links (manifest covers unit and component; unit deploys component; unit
   depends_on unit; component maps_to its requirement; component consumes its layer's interfaces and the current version of each schema type
   it owns) inserted once; the links §CM recorded earlier that are no longer desired RETIRED by a later row; the references §RG has not
   registered yet COUNTED (stated, never hidden). Re-running it after §RG's import links what has become resolvable. */
CREATE OR REPLACE FUNCTION governance._cm_link_pass(p_manifest uuid, p_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE
  m governance.cm_manifests%ROWTYPE; u jsonb; c jsonb; x text; v_from uuid; v_to uuid; v_added int := 0; v_retired int := 0;
  v_unres_req int := 0; v_unres_if int := 0; v_unres_schema int := 0; v_desired jsonb := '[]'::jsonb; l record; v_key text;
BEGIN
  SELECT * INTO m FROM governance.cm_manifests WHERE manifest_id = p_manifest AND version = p_version;
  FOR u IN SELECT * FROM jsonb_array_elements(m.index -> 'units') LOOP
    v_from := governance._cm_find('deployable_unit', u ->> 'unit_id');
    v_desired := v_desired || jsonb_build_array(jsonb_build_array(p_manifest, v_from, 'covers'));
    FOR x IN SELECT jsonb_array_elements_text(u -> 'component_ids') LOOP
      v_desired := v_desired || jsonb_build_array(jsonb_build_array(v_from, governance._cm_find('component', x), 'deploys'));
    END LOOP;
    FOR x IN SELECT jsonb_array_elements_text(coalesce(u -> 'dependencies', '[]'::jsonb)) LOOP
      v_desired := v_desired || jsonb_build_array(jsonb_build_array(v_from, governance._cm_find('deployable_unit', x), 'depends_on'));
    END LOOP;
  END LOOP;
  FOR c IN SELECT * FROM jsonb_array_elements(m.index -> 'components') LOOP
    v_from := governance._cm_find('component', c ->> 'component_id');
    v_desired := v_desired || jsonb_build_array(jsonb_build_array(p_manifest, v_from, 'covers'));
    IF c ->> 'requirement' IS NOT NULL THEN
      v_to := governance._cm_find('requirement', c ->> 'requirement');
      IF v_to IS NULL THEN v_unres_req := v_unres_req + 1; ELSE v_desired := v_desired || jsonb_build_array(jsonb_build_array(v_from, v_to, 'maps_to')); END IF;
    END IF;
    FOR x IN SELECT jsonb_array_elements_text(coalesce(c -> 'interfaces', '[]'::jsonb)) LOOP
      v_to := governance._cm_find('interface', x);
      IF v_to IS NULL THEN v_unres_if := v_unres_if + 1; ELSE v_desired := v_desired || jsonb_build_array(jsonb_build_array(v_from, v_to, 'consumes')); END IF;
    END LOOP;
    FOR x IN SELECT jsonb_array_elements_text(coalesce(c -> 'schema_types', '[]'::jsonb)) LOOP
      -- the CURRENT schema version of the type (objects.schema_registry is authoritative; §RG registers each version as `TYPE@vN`)
      SELECT a.artifact_id INTO v_to FROM governance.artifacts a
       WHERE a.kind = 'schema' AND a.scope = 'PLATFORM' AND a.superseded_at IS NULL AND a.external_key ~ ('^' || x || '@v[0-9]+$')
       ORDER BY (substring(a.external_key FROM '@v([0-9]+)$'))::int DESC LIMIT 1;
      IF v_to IS NULL THEN v_unres_schema := v_unres_schema + 1; ELSE v_desired := v_desired || jsonb_build_array(jsonb_build_array(v_from, v_to, 'consumes')); END IF;
    END LOOP;
  END LOOP;
  -- insert the desired links once
  SELECT coalesce(sum(governance._cm_link((d ->> 0)::uuid, (d ->> 1)::uuid, d ->> 2, p_actor, p_correlation)), 0) INTO v_added
    FROM jsonb_array_elements(v_desired) d WHERE d ->> 0 IS NOT NULL AND d ->> 1 IS NOT NULL;
  -- retire §CM's live links that are no longer desired (from this manifest's units / components / the manifest itself)
  FOR l IN SELECT * FROM governance.links_live ll WHERE ll.attributes ->> 'part' = 'cm' AND ll.relation IN ('covers', 'deploys', 'depends_on', 'maps_to', 'consumes')
              AND (ll.from_artifact = p_manifest OR EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = ll.from_artifact AND a.kind IN ('deployable_unit', 'component') AND a.source ->> 'part' = 'cm'))
              AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_desired) d WHERE (d ->> 0)::uuid = ll.from_artifact AND (d ->> 1)::uuid = ll.to_artifact AND d ->> 2 = ll.relation) LOOP
    INSERT INTO governance.links (link_id, scope, from_artifact, to_artifact, relation, retired, retires_link, attributes, recorded_by, correlation_id)
    VALUES (gen_random_uuid(), 'PLATFORM', l.from_artifact, l.to_artifact, l.relation, true, l.link_id, jsonb_build_object('part', 'cm', 'why', 'no longer in the registered manifest'), p_actor, p_correlation);
    v_retired := v_retired + 1;
  END LOOP;
  RETURN jsonb_build_object('links_added', v_added, 'links_retired', v_retired, 'unresolved', jsonb_build_object('requirements', v_unres_req, 'interfaces', v_unres_if, 'schemas', v_unres_schema),
                            'note', 'a reference §RG has not registered (requirement V3:/V6:/V7:<id>, interface L<n>-I0<k>, schema <TYPE>@v<n>) is counted here and linked by a later registration');
END $$;
REVOKE ALL ON FUNCTION governance._cm_link_pass(uuid, int, uuid, uuid) FROM PUBLIC;

/* The OPEN holds on a subject (any part's), but the reason kinds excluded. */
CREATE OR REPLACE FUNCTION governance._cm_open_holds(p_subject uuid, p_exclude text[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'reason_kind', h.reason_kind, 'reason', h.reason, 'opened_at', h.opened_at, 'source_artifact', h.source_artifact) ORDER BY h.opened_at), '[]'::jsonb)
    FROM governance.holds h WHERE h.subject_artifact = p_subject AND h.lifted_at IS NULL AND NOT (h.reason_kind = ANY (p_exclude))
$$;
REVOKE ALL ON FUNCTION governance._cm_open_holds(uuid, text[]) FROM PUBLIC;

-- §CM.4 THE MANIFEST REGISTRATION ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/* REGISTER the committed component manifest (the conformance steward; the service reads the committed file, its digest and its index — the
   caller supplies no content). An UNMAPPED unit (mapped=false, no component, or a component id the index does not declare) REFUSES the
   registration and PRESERVES the non-conformant record as an open finding (the route answers 422 after the commit). The same digest again is
   UNCHANGED (the link pass still runs: what §RG registered since is linked). A new digest is a new version: every unit and component an
   artifact (a changed entry a new artifact version; a unit or component gone RETIRED), the links re-derived. */
CREATE OR REPLACE FUNCTION governance.cm_register_manifest(p_path text, p_schema text, p_generator text, p_file_digest text, p_index jsonb, p_summary jsonb,
                                                           p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  cur governance.cm_manifests%ROWTYPE; v_id uuid; v_version int; v_unmapped jsonb; v_known text[]; u jsonb; c jsonb; v_findings jsonb := '[]'::jsonb; v_f uuid;
  v_links jsonb; v_resolved int; v_retired int := 0; a record;
BEGIN
  PERFORM governance.assert_platform('governance.conformance.manifest.register', p_actor, 'conformance manifest');
  IF p_file_digest IS NULL OR p_file_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'conformance manifest rejected (digest): the committed file''s digest is 64 hex' USING ERRCODE = '22023'; END IF;
  IF p_schema IS NULL OR p_schema !~ '^eye\.components-manifest/v[0-9]+$' THEN RAISE EXCEPTION 'conformance manifest rejected (schema): % is not a component manifest schema', coalesce(p_schema, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_index IS NULL OR jsonb_typeof(p_index -> 'units') <> 'array' OR jsonb_typeof(p_index -> 'components') <> 'array' OR jsonb_array_length(p_index -> 'units') = 0 THEN
    RAISE EXCEPTION 'conformance manifest rejected (index): the manifest names its units and components' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.cm.manifest', 0));
  v_known := ARRAY(SELECT x ->> 'component_id' FROM jsonb_array_elements(p_index -> 'components') x);
  -- IA-01-005 / DP-65-005: a unit that cannot resolve to an approved component identity is REFUSED; the non-conformant record PRESERVED
  SELECT coalesce(jsonb_agg(jsonb_build_object('path', x ->> 'path', 'unit_id', x ->> 'unit_id',
           'why', CASE WHEN (x ->> 'mapped') = 'false' THEN coalesce(x ->> 'reason', 'not mapped') WHEN jsonb_array_length(coalesce(x -> 'component_ids', '[]'::jsonb)) = 0 THEN 'it deploys no component'
                       ELSE 'it names a component the manifest does not declare: ' || (SELECT string_agg(y, ', ') FROM jsonb_array_elements_text(x -> 'component_ids') y WHERE NOT (y = ANY (v_known))) END)), '[]'::jsonb)
    INTO v_unmapped
    FROM jsonb_array_elements(p_index -> 'units') x
   WHERE (x ->> 'mapped') = 'false' OR jsonb_array_length(coalesce(x -> 'component_ids', '[]'::jsonb)) = 0
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(x -> 'component_ids', '[]'::jsonb)) y WHERE NOT (y = ANY (v_known)));
  IF jsonb_array_length(v_unmapped) > 0 THEN
    FOR u IN SELECT * FROM jsonb_array_elements(v_unmapped) LOOP
      SELECT finding_id INTO v_f FROM governance.cm_findings WHERE fingerprint = 'unmapped_unit:' || (u ->> 'path') AND state = 'open';
      IF v_f IS NULL THEN
        v_f := gen_random_uuid();
        INSERT INTO governance.cm_findings (finding_id, kind, fingerprint, summary, observed, expected, state, opened_by, correlation_id)
        VALUES (v_f, 'unmapped_unit', 'unmapped_unit:' || (u ->> 'path'), format('the deployable unit %s cannot resolve to an approved component identity: %s', u ->> 'path', u ->> 'why'),
                jsonb_build_object('path', u ->> 'path', 'file_digest', p_file_digest), jsonb_build_object('rule', 'every deployable unit deploys at least one declared component (UNIT_MAP)'), 'open', p_actor, p_correlation);
      END IF;
      v_findings := v_findings || jsonb_build_array(v_f);
    END LOOP;
    PERFORM governance.ledger(NULL, NULL, 'conformance_manifest', coalesce((SELECT manifest_id FROM governance.cm_manifests WHERE state = 'current'), '00000000-0000-0000-0000-000000000000'::uuid), NULL,
                              'manifest.refused', p_actor, jsonb_build_object('file_digest', p_file_digest, 'unmapped', v_unmapped, 'findings', v_findings), p_correlation);
    RETURN jsonb_build_object('refused', true, 'class', 'unmapped_unit', 'unmapped', v_unmapped, 'findings', v_findings, 'file_digest', p_file_digest,
                              'preserved', 'the non-conformant record is kept as an open finding; the registration and any promotion of this manifest are refused');
  END IF;

  SELECT * INTO cur FROM governance.cm_manifests WHERE state = 'current' FOR UPDATE;
  IF FOUND AND cur.file_digest = p_file_digest THEN
    v_links := governance._cm_link_pass(cur.manifest_id, cur.version, p_actor, p_correlation);
    UPDATE governance.cm_manifests SET link_report = v_links WHERE manifest_id = cur.manifest_id AND version = cur.version;
    IF (v_links ->> 'links_added')::int > 0 OR (v_links ->> 'links_retired')::int > 0 THEN
      PERFORM governance.ledger(NULL, NULL, 'conformance_manifest', cur.manifest_id, cur.version, 'manifest.relinked', p_actor, v_links, p_correlation);
    END IF;
    RETURN jsonb_build_object('unchanged', true, 'manifest_id', cur.manifest_id, 'version', cur.version, 'file_digest', cur.file_digest, 'links', v_links);
  END IF;

  v_id := coalesce(cur.manifest_id, governance._cm_find('manifest', p_path), gen_random_uuid());
  v_version := coalesce(cur.version, 0) + 1;
  IF cur.manifest_id IS NOT NULL THEN
    UPDATE governance.cm_manifests SET state = 'superseded', superseded_at = clock_timestamp() WHERE manifest_id = cur.manifest_id AND version = cur.version;
  END IF;
  INSERT INTO governance.cm_manifests (manifest_id, version, path, schema, generator, file_digest, index_digest, summary, index, state, registered_by, correlation_id)
  VALUES (v_id, v_version, p_path, p_schema, coalesce(p_generator, ''), p_file_digest, governance.digest(p_index), coalesce(p_summary, '{}'::jsonb), p_index, 'current', p_actor, p_correlation);
  PERFORM governance._cm_artifact('manifest', p_path, 'The component conformance manifest (generated)', jsonb_build_object('file_digest', p_file_digest, 'version', v_version, 'schema', p_schema, 'summary', p_summary),
                                  'V4', 'active', p_actor, p_correlation, v_id);
  FOR u IN SELECT * FROM jsonb_array_elements(p_index -> 'units') LOOP
    PERFORM governance._cm_artifact('deployable_unit', u ->> 'unit_id', format('%s (%s)', u ->> 'unit_id', u ->> 'path'), u - 'mapped', 'V4', 'active', p_actor, p_correlation);
  END LOOP;
  FOR c IN SELECT * FROM jsonb_array_elements(p_index -> 'components') LOOP
    PERFORM governance._cm_artifact('component', c ->> 'component_id', coalesce(nullif(c ->> 'name', ''), c ->> 'component_id'), c,
                                    CASE c ->> 'kind' WHEN 'logical' THEN 'V3' WHEN 'infrastructure' THEN 'V6' WHEN 'data' THEN 'V7' ELSE 'V4' END, 'active', p_actor, p_correlation);
  END LOOP;
  -- a unit or a component §CM registered that this manifest no longer declares is RETIRED (a new version), never deleted
  FOR a IN SELECT x.* FROM governance.artifacts x WHERE x.scope = 'PLATFORM' AND x.superseded_at IS NULL AND x.source ->> 'part' = 'cm' AND x.lifecycle <> 'retired'
             AND ((x.kind = 'deployable_unit' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_index -> 'units') y WHERE y ->> 'unit_id' = x.external_key))
               OR (x.kind = 'component' AND NOT (x.external_key = ANY (v_known)))) LOOP
    PERFORM governance._cm_artifact(a.kind, a.external_key, a.title, a.attributes, a.controlling_volume, 'retired', p_actor, p_correlation);
    v_retired := v_retired + 1;
  END LOOP;
  v_links := governance._cm_link_pass(v_id, v_version, p_actor, p_correlation);
  UPDATE governance.cm_manifests SET link_report = v_links WHERE manifest_id = v_id AND version = v_version;
  -- the unmapped-unit findings close: this manifest maps every unit
  UPDATE governance.cm_findings SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(), resolution = format('manifest v%s maps every unit', v_version)
   WHERE kind = 'unmapped_unit' AND state = 'open';
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  PERFORM governance.ledger(NULL, NULL, 'conformance_manifest', v_id, v_version, 'manifest.registered', p_actor,
                            jsonb_build_object('file_digest', p_file_digest, 'summary', p_summary, 'links', v_links, 'retired', v_retired, 'findings_resolved', v_resolved), p_correlation);
  RETURN jsonb_build_object('manifest_id', v_id, 'version', v_version, 'file_digest', p_file_digest, 'units', jsonb_array_length(p_index -> 'units'), 'components', jsonb_array_length(p_index -> 'components'),
                            'retired', v_retired, 'links', v_links, 'findings_resolved', v_resolved, 'superseded_version', cur.version);
END $$;
REVOKE ALL ON FUNCTION governance.cm_register_manifest(text, text, text, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.cm_register_manifest(text, text, text, text, jsonb, jsonb, uuid, uuid) TO eye_commit;

-- §CM.5 THE RELEASE CANDIDATE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* ASSEMBLE (or AMEND: a new version over renewed evidence) a release candidate — the conformance steward. The port binds what it can read
   itself: the migration head (public.schema_migrations), the CURRENT registered manifest (its version, file digest and units = the topology).
   The runtime's head SHA and policy bundle come from the service (the server's own build identity, never the client's). The evidence items
   are validated for shape here; their truth is the CHECK's. */
CREATE OR REPLACE FUNCTION governance.cm_assemble_candidate(p_candidate uuid, p_expected_version int, p_label text, p_head_sha text, p_policy jsonb, p_config_digest text, p_profile text,
                                                            p_scope jsonb, p_period_from date, p_period_to date, p_evidence jsonb, p_builders uuid[], p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, tenancy, public, pg_catalog, pg_temp AS $$
DECLARE
  prev governance.cm_release_candidates%ROWTYPE; m governance.cm_manifests%ROWTYPE; v_id uuid := coalesce(p_candidate, gen_random_uuid()); v_version int; v_items jsonb := '[]'::jsonb;
  e jsonb; v_n int := 0; v_topology jsonb; v_identity jsonb; v_digest text; v_scope jsonb; v_art uuid; v_ev uuid;
BEGIN
  PERFORM governance.assert_platform('governance.conformance.candidate.assemble', p_actor, 'release candidate');
  IF length(btrim(coalesce(p_label, ''))) < 3 THEN RAISE EXCEPTION 'release candidate rejected (label): a candidate is labelled (3+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_head_sha IS NULL OR NOT (p_head_sha ~ '^[0-9a-f]{40}$' OR p_head_sha = 'unknown') THEN RAISE EXCEPTION 'release candidate rejected (head): the head SHA is 40 hex (or unknown — then the check refuses it)' USING ERRCODE = '22023'; END IF;
  IF p_policy IS NULL OR (p_policy ->> 'digest') !~ '^[0-9a-f]{64}$' OR length(coalesce(p_policy ->> 'version', '')) = 0 THEN RAISE EXCEPTION 'release candidate rejected (policy): the policy bundle names its version and digest' USING ERRCODE = '22023'; END IF;
  IF p_config_digest IS NULL OR p_config_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'release candidate rejected (config): the configuration digest is 64 hex' USING ERRCODE = '22023'; END IF;
  IF p_profile IS DISTINCT FROM 'local-dev' THEN RAISE EXCEPTION 'release candidate rejected (profile): only local-dev is a real profile here (the profile catalogue is B106/B111)' USING ERRCODE = '22023'; END IF;
  IF p_period_from IS NULL OR p_period_to IS NULL OR p_period_to < p_period_from THEN RAISE EXCEPTION 'release candidate rejected (period): the period under review runs from a day to a later or the same day' USING ERRCODE = '22023'; END IF;
  -- the customer scope: the platform, or named tenants (and domains of them) that exist
  IF p_scope IS NULL OR p_scope ->> 'kind' NOT IN ('platform', 'tenants') THEN RAISE EXCEPTION 'release candidate rejected (scope): the customer scope is platform or named tenants' USING ERRCODE = '22023'; END IF;
  IF p_scope ->> 'kind' = 'tenants' THEN
    IF jsonb_typeof(p_scope -> 'tenants') <> 'array' OR jsonb_array_length(p_scope -> 'tenants') = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_scope -> 'tenants') t WHERE t !~ '^[0-9a-f-]{36}$' OR NOT EXISTS (SELECT 1 FROM tenancy.tenants x WHERE x.id = t::uuid))
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_scope -> 'domains', '[]'::jsonb)) dd WHERE dd !~ '^[0-9a-f-]{36}$'
                   OR NOT EXISTS (SELECT 1 FROM tenancy.domains y WHERE y.id = dd::uuid AND y.tenant_id::text IN (SELECT jsonb_array_elements_text(p_scope -> 'tenants')))) THEN
      RAISE EXCEPTION 'release candidate rejected (scope): every named tenant exists, and every named domain is one of theirs' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_scope := jsonb_build_object('kind', p_scope ->> 'kind', 'tenants', coalesce(p_scope -> 'tenants', '[]'::jsonb), 'domains', coalesce(p_scope -> 'domains', '[]'::jsonb));
  -- the evidence items (shape only; the check judges them)
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' OR jsonb_array_length(p_evidence) > 200 THEN RAISE EXCEPTION 'release candidate rejected (evidence): the evidence is a list of at most 200 items' USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_evidence) LOOP
    v_n := v_n + 1;
    IF jsonb_typeof(e) <> 'object' OR NOT ((e ->> 'family') = ANY (governance.cm_evidence_families())) OR e ->> 'kind' NOT IN ('test_report', 'gate_receipt', 'artifact', 'review_record')
       OR length(btrim(coalesce(e ->> 'ref', ''))) < 3 OR e ->> 'captured_at' IS NULL OR e ->> 'valid_until' IS NULL
       OR (e ->> 'artifact_id' IS NOT NULL AND (e ->> 'artifact_id') !~ '^[0-9a-f-]{36}$') THEN
      RAISE EXCEPTION 'release candidate rejected (evidence): item % names a family (%), a kind (test_report | gate_receipt | artifact | review_record), a ref, captured_at and valid_until',
        v_n, array_to_string(governance.cm_evidence_families(), ' | ') USING ERRCODE = '22023';
    END IF;
    IF (e ->> 'valid_until')::timestamptz <= (e ->> 'captured_at')::timestamptz THEN
      RAISE EXCEPTION 'release candidate rejected (evidence): item % is valid until after it was captured', v_n USING ERRCODE = '22023';
    END IF;
    v_items := v_items || jsonb_build_array(jsonb_build_object('item', v_n, 'family', e ->> 'family', 'kind', e ->> 'kind', 'ref', btrim(e ->> 'ref'), 'artifact_id', e ->> 'artifact_id',
      'digest', e ->> 'digest', 'bound_head_sha', e ->> 'bound_head_sha', 'captured_at', (e ->> 'captured_at')::timestamptz, 'valid_until', (e ->> 'valid_until')::timestamptz,
      'note', e ->> 'note'));
  END LOOP;
  IF p_builders IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_builders) b WHERE NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = b)) THEN
    RAISE EXCEPTION 'release candidate rejected (builders): every declared builder is a principal' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM governance.cm_manifests WHERE state = 'current';
  IF NOT FOUND THEN RAISE EXCEPTION 'release candidate rejected (state): no component manifest is registered — the steward registers the committed manifest first' USING ERRCODE = '23505'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.cm.candidate:' || v_id::text, 0));
  IF p_candidate IS NULL THEN
    IF coalesce(p_expected_version, 0) <> 0 THEN RAISE EXCEPTION 'release candidate rejected (stale): a new candidate expects version 0' USING ERRCODE = '23505'; END IF;
    v_version := 1;
  ELSE
    SELECT * INTO prev FROM governance.cm_release_candidates WHERE candidate_id = p_candidate AND state <> 'superseded' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'release candidate rejected (unknown_candidate): no candidate %', p_candidate USING ERRCODE = '23503'; END IF;
    IF prev.version <> p_expected_version THEN RAISE EXCEPTION 'release candidate rejected (stale): the candidate is at version %, not %', prev.version, p_expected_version USING ERRCODE = '23505'; END IF;
    IF prev.state IN ('attested', 'withdrawn') THEN RAISE EXCEPTION 'release candidate rejected (state): version % is %; assemble a new candidate', prev.version, prev.state USING ERRCODE = '23505'; END IF;
    UPDATE governance.cm_release_candidates SET state = 'superseded' WHERE candidate_id = p_candidate AND version = prev.version;
    v_version := prev.version + 1;
  END IF;
  v_topology := jsonb_build_object('units', (SELECT coalesce(jsonb_agg(u ->> 'unit_id' ORDER BY u ->> 'unit_id'), '[]'::jsonb) FROM jsonb_array_elements(m.index -> 'units') u), 'manifest_index_digest', m.index_digest);
  v_identity := jsonb_build_object('candidate_id', v_id, 'version', v_version, 'label', btrim(p_label), 'head_sha', p_head_sha, 'migration_head', governance.cm_migration_head(),
    'policy_bundle', jsonb_build_object('version', p_policy ->> 'version', 'digest', p_policy ->> 'digest'), 'manifest', jsonb_build_object('id', m.manifest_id, 'version', m.version, 'digest', m.file_digest),
    'config_digest', p_config_digest, 'profile', p_profile, 'scope', v_scope, 'topology', v_topology, 'period', jsonb_build_array(p_period_from, p_period_to),
    'evidence_digest', governance.digest(v_items), 'builders', to_jsonb(coalesce(p_builders, '{}'::uuid[])), 'claim', 'demonstration', 'release', 'not_a_release');
  v_digest := governance.digest(v_identity);
  INSERT INTO governance.cm_release_candidates (candidate_id, version, label, head_sha, migration_head, policy_bundle, manifest_id, manifest_version, manifest_digest, config_digest, deployment_profile,
    customer_scope, topology, period_from, period_to, evidence, evidence_digest, builders, digest, state, proposed_by, correlation_id)
  VALUES (v_id, v_version, btrim(p_label), p_head_sha, governance.cm_migration_head(), v_identity -> 'policy_bundle', m.manifest_id, m.version, m.file_digest, p_config_digest, p_profile,
    v_scope, v_topology, p_period_from, p_period_to, v_items, governance.digest(v_items), coalesce(p_builders, '{}'::uuid[]), v_digest, 'assembled', p_actor, p_correlation);
  v_art := governance._cm_artifact('release_candidate', 'RC:' || v_id::text, format('%s (release candidate — not a release)', btrim(p_label)),
                                   jsonb_build_object('version', v_version, 'digest', v_digest, 'state', 'assembled', 'head_sha', p_head_sha, 'manifest_version', m.version), 'V4', 'proposed', p_actor, p_correlation, v_id);
  PERFORM governance._cm_link(v_art, m.manifest_id, 'covers', p_actor, p_correlation);
  FOR e IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF e ->> 'artifact_id' IS NOT NULL THEN
      v_ev := (SELECT a.artifact_id FROM governance.artifacts a WHERE a.artifact_id = (e ->> 'artifact_id')::uuid AND a.superseded_at IS NULL);
      IF v_ev IS NOT NULL THEN PERFORM governance._cm_link(v_ev, v_art, 'evidences', p_actor, p_correlation); END IF;
    END IF;
  END LOOP;
  PERFORM governance.ledger(NULL, NULL, 'release_candidate', v_id, v_version, CASE WHEN v_version = 1 THEN 'candidate.assembled' ELSE 'candidate.amended' END, p_actor,
                            jsonb_build_object('digest', v_digest, 'label', btrim(p_label), 'head_sha', p_head_sha, 'manifest_version', m.version, 'items', jsonb_array_length(v_items), 'release', 'not_a_release'), p_correlation);
  RETURN (SELECT to_jsonb(c) FROM governance.cm_release_candidates c WHERE c.candidate_id = v_id AND c.version = v_version);
END $$;
REVOKE ALL ON FUNCTION governance.cm_assemble_candidate(uuid, int, text, text, jsonb, text, text, jsonb, date, date, jsonb, uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.cm_assemble_candidate(uuid, int, text, text, jsonb, text, text, jsonb, date, date, jsonb, uuid[], uuid, uuid) TO eye_commit;

/* THE EVIDENCE VERDICT of a candidate version, as of NOW (database clock) — pure reading; the check records it, the attestation re-reads it.
   Each reason: {class: evidence | stale | unverifiable | foreign_version, …}. */
CREATE OR REPLACE FUNCTION governance._cm_verdict(p_candidate uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE c governance.cm_release_candidates%ROWTYPE; r jsonb := '[]'::jsonb; f text; e jsonb; a governance.artifacts%ROWTYPE; m governance.cm_manifests%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO c FROM governance.cm_release_candidates WHERE candidate_id = p_candidate AND version = p_version;
  SELECT * INTO m FROM governance.cm_manifests WHERE state = 'current';
  IF c.head_sha = 'unknown' THEN r := r || jsonb_build_array(jsonb_build_object('class', 'unverifiable', 'what', 'head', 'detail', 'the build''s head SHA is unknown: no evidence can be bound to it')); END IF;
  IF m.manifest_id IS NULL OR m.version <> c.manifest_version OR m.file_digest <> c.manifest_digest THEN
    r := r || jsonb_build_array(jsonb_build_object('class', 'foreign_version', 'what', 'manifest', 'detail', format('the candidate is bound to manifest v%s (%s); the registered manifest is %s', c.manifest_version, left(c.manifest_digest, 12),
                                 coalesce('v' || m.version || ' (' || left(m.file_digest, 12) || ')', 'none'))));
  END IF;
  IF c.migration_head IS DISTINCT FROM governance.cm_migration_head() THEN
    r := r || jsonb_build_array(jsonb_build_object('class', 'foreign_version', 'what', 'migration_head', 'detail', format('the candidate names %s; the database runs %s', c.migration_head, governance.cm_migration_head())));
  END IF;
  FOREACH f IN ARRAY governance.cm_required_families() LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.evidence) x WHERE x ->> 'family' = f) THEN
      r := r || jsonb_build_array(jsonb_build_object('class', 'evidence', 'what', 'family', 'family', f, 'detail', format('no %s evidence: the family is required (absent evidence refuses the candidate)', replace(f, '_', ' '))));
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(c.evidence) LOOP
    IF coalesce(e ->> 'digest', '') !~ '^[0-9a-f]{64}$' THEN
      r := r || jsonb_build_array(jsonb_build_object('class', 'unverifiable', 'what', 'item', 'item', e -> 'item', 'ref', e ->> 'ref', 'detail', 'the item carries no digest (64 hex) — it cannot be verified'));
    END IF;
    IF (e ->> 'captured_at')::timestamptz > v_now THEN
      r := r || jsonb_build_array(jsonb_build_object('class', 'unverifiable', 'what', 'item', 'item', e -> 'item', 'ref', e ->> 'ref', 'detail', 'the item claims a capture in the future'));
    END IF;
    IF (e ->> 'valid_until')::timestamptz <= v_now THEN
      r := r || jsonb_build_array(jsonb_build_object('class', 'stale', 'what', 'item', 'item', e -> 'item', 'ref', e ->> 'ref', 'family', e ->> 'family', 'valid_until', e ->> 'valid_until',
                                                     'detail', format('the %s evidence %s expired at %s', replace(e ->> 'family', '_', ' '), e ->> 'ref', e ->> 'valid_until')));
    END IF;
    IF coalesce(e ->> 'bound_head_sha', '') <> c.head_sha THEN
      r := r || jsonb_build_array(jsonb_build_object('class', 'foreign_version', 'what', 'item', 'item', e -> 'item', 'ref', e ->> 'ref',
                                                     'detail', format('the item is bound to head %s, the candidate is %s', coalesce(left(e ->> 'bound_head_sha', 12), '<none>'), left(c.head_sha, 12))));
    END IF;
    IF e ->> 'artifact_id' IS NOT NULL THEN
      SELECT * INTO a FROM governance.artifacts x WHERE x.artifact_id = (e ->> 'artifact_id')::uuid ORDER BY x.version DESC LIMIT 1;
      IF NOT FOUND THEN
        r := r || jsonb_build_array(jsonb_build_object('class', 'unverifiable', 'what', 'item', 'item', e -> 'item', 'ref', e ->> 'ref', 'detail', 'the evidence artifact is not registered'));
      ELSIF a.superseded_at IS NOT NULL OR a.lifecycle IN ('retired', 'superseded', 'quarantined') THEN
        r := r || jsonb_build_array(jsonb_build_object('class', 'unverifiable', 'what', 'item', 'item', e -> 'item', 'ref', e ->> 'ref', 'detail', format('the evidence artifact is %s', CASE WHEN a.superseded_at IS NOT NULL THEN 'superseded' ELSE a.lifecycle END)));
      ELSIF a.digest <> coalesce(e ->> 'digest', '') AND coalesce(a.attributes ->> 'content_digest', '') <> coalesce(e ->> 'digest', '') THEN
        r := r || jsonb_build_array(jsonb_build_object('class', 'unverifiable', 'what', 'item', 'item', e -> 'item', 'ref', e ->> 'ref', 'detail', 'the item''s digest is not the registered artifact''s'));
      ELSIF a.attributes ? 'head_sha' AND a.attributes ->> 'head_sha' <> c.head_sha THEN
        r := r || jsonb_build_array(jsonb_build_object('class', 'foreign_version', 'what', 'item', 'item', e -> 'item', 'ref', e ->> 'ref', 'detail', format('the evidence artifact was produced at head %s', left(a.attributes ->> 'head_sha', 12))));
      END IF;
    END IF;
  END LOOP;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION governance._cm_verdict(uuid, int) FROM PUBLIC;

/* THE CHECK (the steward): the verdict as of now, the candidate's OPEN holds (an expired exception, a conflict, a conformance drift — any hold
   but the evidence holds this check manages itself), the outcome recorded (conformant | refused | held), the evidence holds opened for what is
   stale (evidence_stale) or absent / unverifiable / foreign (evidence_missing) and lifted when no longer so. The route answers the refusal
   AFTER the commit (the record and its holds stand). */
CREATE OR REPLACE FUNCTION governance.cm_check_candidate(p_candidate uuid, p_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE
  c governance.cm_release_candidates%ROWTYPE; v_reasons jsonb; v_holds jsonb; v_outcome text; v_opened jsonb := '[]'::jsonb; v_lifted int := 0; v_kind text; v_need boolean; v_text text; v_h uuid;
  v_result jsonb; v_n int;
BEGIN
  PERFORM governance.assert_platform('governance.conformance.candidate.check', p_actor, 'release candidate');
  SELECT * INTO c FROM governance.cm_release_candidates WHERE candidate_id = p_candidate AND version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'release candidate rejected (unknown_candidate): no candidate %/v%', p_candidate, p_version USING ERRCODE = '23503'; END IF;
  IF c.state IN ('superseded', 'attested', 'withdrawn') THEN RAISE EXCEPTION 'release candidate rejected (state): version % is %', p_version, c.state USING ERRCODE = '23505'; END IF;
  v_reasons := governance._cm_verdict(p_candidate, p_version);
  -- the evidence holds this check manages: opened for what the verdict finds, lifted when it no longer does
  FOREACH v_kind IN ARRAY ARRAY['evidence_stale', 'evidence_missing'] LOOP
    v_need := EXISTS (SELECT 1 FROM jsonb_array_elements(v_reasons) x WHERE (v_kind = 'evidence_stale' AND x ->> 'class' = 'stale') OR (v_kind = 'evidence_missing' AND x ->> 'class' IN ('evidence', 'unverifiable', 'foreign_version')));
    IF v_need THEN
      IF NOT EXISTS (SELECT 1 FROM governance.holds h WHERE h.subject_artifact = p_candidate AND h.reason_kind = v_kind AND h.lifted_at IS NULL) THEN
        v_text := (SELECT string_agg(x ->> 'detail', '; ') FROM jsonb_array_elements(v_reasons) x
                    WHERE (v_kind = 'evidence_stale' AND x ->> 'class' = 'stale') OR (v_kind = 'evidence_missing' AND x ->> 'class' IN ('evidence', 'unverifiable', 'foreign_version')));
        v_h := gen_random_uuid();
        INSERT INTO governance.holds (hold_id, scope, subject_artifact, reason_kind, reason, opened_by, correlation_id)
        VALUES (v_h, 'PLATFORM', p_candidate, v_kind, left(format('release candidate %s v%s: %s', c.label, p_version, v_text), 2000), p_actor, p_correlation);
        v_opened := v_opened || jsonb_build_array(jsonb_build_object('hold_id', v_h, 'reason_kind', v_kind));
      END IF;
    ELSE
      UPDATE governance.holds SET lifted_at = clock_timestamp(), lifted_by = p_actor, lift_reason = format('the check of v%s finds no %s evidence', p_version, CASE v_kind WHEN 'evidence_stale' THEN 'stale' ELSE 'absent, unverifiable or foreign' END)
       WHERE subject_artifact = p_candidate AND reason_kind = v_kind AND lifted_at IS NULL;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_lifted := v_lifted + v_n;
    END IF;
  END LOOP;
  v_holds := governance._cm_open_holds(p_candidate, ARRAY['evidence_stale', 'evidence_missing']);
  v_outcome := CASE WHEN jsonb_array_length(v_holds) > 0 THEN 'held' WHEN jsonb_array_length(v_reasons) > 0 THEN 'refused' ELSE 'conformant' END;
  v_result := jsonb_build_object('outcome', v_outcome, 'reasons', v_reasons, 'holds', v_holds, 'required_families', to_jsonb(governance.cm_required_families()),
    'carried_families', (SELECT jsonb_agg(f) FROM unnest(governance.cm_evidence_families()) f WHERE NOT (f = ANY (governance.cm_required_families()))),
    'carried_by', 'quality: B64 / H1 · deployment: B106 / B111 · operations: B63 / B64 — never inferred present',
    'checked_at', clock_timestamp(), 'version', p_version, 'digest', c.digest, 'evidence_holds_opened', v_opened, 'evidence_holds_lifted', v_lifted,
    'not_a_release', 'a conformant candidate is a local conformance record — not a release (B65), not production admission (R1)');
  UPDATE governance.cm_release_candidates SET state = v_outcome, check_result = v_result, checked_by = p_actor, checked_at = clock_timestamp()
   WHERE candidate_id = p_candidate AND version = p_version;
  PERFORM governance._cm_artifact('release_candidate', 'RC:' || p_candidate::text, format('%s (release candidate — not a release)', c.label),
                                  jsonb_build_object('version', p_version, 'digest', c.digest, 'state', v_outcome, 'head_sha', c.head_sha, 'manifest_version', c.manifest_version), 'V4', 'proposed', p_actor, p_correlation, p_candidate);
  PERFORM governance.ledger(NULL, NULL, 'release_candidate', p_candidate, p_version, 'candidate.checked', p_actor,
                            jsonb_build_object('outcome', v_outcome, 'reasons', v_reasons, 'holds', v_holds, 'evidence_holds_opened', v_opened), p_correlation);
  RETURN v_result || jsonb_build_object('candidate_id', p_candidate, 'label', c.label);
END $$;
REVOKE ALL ON FUNCTION governance.cm_check_candidate(uuid, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.cm_check_candidate(uuid, int, uuid, uuid) TO eye_commit;

/* ATTEST a conformant candidate (independent assurance — a named human; never the proposer, never a builder, never an agent): on the exact
   digest, RE-CHECKED at this instant (no open hold of any kind, no evidence expired since the check, nothing foreign since), SIGNED
   (`manifest_attestation`, the PLATFORM signature written here after the approver test). Not a release (B65); not production admission (R1). */
CREATE OR REPLACE FUNCTION governance.cm_attest_candidate(p_candidate uuid, p_version int, p_digest text, p_reason text, p_key_id text, p_signature text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE c governance.cm_release_candidates%ROWTYPE; v_now jsonb; v_holds jsonb; v_sig uuid := gen_random_uuid();
BEGIN
  PERFORM governance.assert_platform('governance.conformance.candidate.attest', p_actor, 'release candidate');
  SELECT * INTO c FROM governance.cm_release_candidates WHERE candidate_id = p_candidate AND version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'release candidate rejected (unknown_candidate): no candidate %/v%', p_candidate, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('release candidate', p_actor, NULL, NULL, ARRAY['independent_assurance'], c.proposed_by, c.builders, 'attesting a release candidate''s conformance');
  IF c.state <> 'conformant' THEN RAISE EXCEPTION 'release candidate rejected (state): version % is %; only a conformant check is attested', p_version, c.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM c.digest THEN RAISE EXCEPTION 'release candidate rejected (stale): the attestation names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'release candidate rejected (reason): an attestation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_holds := governance._cm_open_holds(p_candidate, ARRAY[]::text[]);
  IF jsonb_array_length(v_holds) > 0 THEN
    RAISE EXCEPTION 'release candidate rejected (held): % — the candidate is held at this instant', (SELECT string_agg((h ->> 'reason_kind') || ': ' || (h ->> 'reason'), '; ') FROM jsonb_array_elements(v_holds) h) USING ERRCODE = '23505';
  END IF;
  v_now := governance._cm_verdict(p_candidate, p_version);
  IF jsonb_array_length(v_now) > 0 THEN
    RAISE EXCEPTION 'release candidate rejected (stale): the check is no longer true — %', (SELECT string_agg(x ->> 'detail', '; ') FROM jsonb_array_elements(v_now) x) USING ERRCODE = '23505';
  END IF;
  IF p_key_id IS NULL OR p_key_id !~ '^ed25519:[0-9a-f]{16}$' OR p_signature IS NULL OR p_signature !~ '^[A-Za-z0-9+/]{86}==$' THEN
    RAISE EXCEPTION 'release candidate rejected (signature): the attestation carries the attester''s Ed25519 signature over the candidate''s digest' USING ERRCODE = '22023';
  END IF;
  INSERT INTO governance.signatures (signature_id, scope, subject_kind, subject_id, subject_version, subject_digest, signer, signer_role, key_id, algorithm, signature, bound_action, correlation_id)
  VALUES (v_sig, 'PLATFORM', 'manifest_attestation', p_candidate, p_version, c.digest, p_actor, 'independent_assurance', p_key_id, 'ed25519', p_signature, 'governance.conformance.candidate.attest', p_correlation);
  UPDATE governance.cm_release_candidates SET state = 'attested', attested_by = p_actor, attested_at = clock_timestamp(), attestation_reason = btrim(p_reason), signature_id = v_sig
   WHERE candidate_id = p_candidate AND version = p_version;
  PERFORM governance._cm_artifact('release_candidate', 'RC:' || p_candidate::text, format('%s (release candidate — not a release)', c.label),
                                  jsonb_build_object('version', p_version, 'digest', c.digest, 'state', 'attested', 'head_sha', c.head_sha, 'manifest_version', c.manifest_version, 'signature_id', v_sig), 'V4', 'active', p_actor, p_correlation, p_candidate);
  PERFORM governance.ledger(NULL, NULL, 'release_candidate', p_candidate, p_version, 'candidate.attested', p_actor,
                            jsonb_build_object('digest', c.digest, 'signature_id', v_sig, 'reason', btrim(p_reason), 'release', 'not_a_release (B65)', 'production_admission', 'R1'), p_correlation);
  RETURN jsonb_build_object('candidate_id', p_candidate, 'version', p_version, 'state', 'attested', 'digest', c.digest, 'signature_id', v_sig,
                            'boundary', 'attested conformant on local evidence — NOT a release (B65 substituted), NOT production admission (R1), NOT real acceptance (R2)');
END $$;
REVOKE ALL ON FUNCTION governance.cm_attest_candidate(uuid, int, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.cm_attest_candidate(uuid, int, text, text, text, text, uuid, uuid) TO eye_commit;

/* WITHDRAW a candidate (the steward or the product authority): withdrawn, its §CM holds (evidence, drift) lifted with the reason; the holds of
   other parts (an expired exception, a conflict) are theirs to lift. */
CREATE OR REPLACE FUNCTION governance.cm_withdraw_candidate(p_candidate uuid, p_version int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE c governance.cm_release_candidates%ROWTYPE; v_lifted int;
BEGIN
  PERFORM governance.assert_platform('governance.conformance.candidate.withdraw', p_actor, 'release candidate');
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['conformance_steward', 'product_authority']) THEN
    RAISE EXCEPTION 'release candidate rejected (authority): withdrawing a candidate is the conformance steward''s or the product authority''s act' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM governance.cm_release_candidates WHERE candidate_id = p_candidate AND version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'release candidate rejected (unknown_candidate): no candidate %/v%', p_candidate, p_version USING ERRCODE = '23503'; END IF;
  IF c.state IN ('withdrawn', 'superseded') THEN RAISE EXCEPTION 'release candidate rejected (state): version % is %', p_version, c.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'release candidate rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE governance.cm_release_candidates SET state = 'withdrawn', withdrawn_by = p_actor, withdrawn_at = clock_timestamp(), withdraw_reason = btrim(p_reason) WHERE candidate_id = p_candidate AND version = p_version;
  UPDATE governance.holds SET lifted_at = clock_timestamp(), lifted_by = p_actor, lift_reason = 'the release candidate was withdrawn: ' || btrim(p_reason)
   WHERE subject_artifact = p_candidate AND lifted_at IS NULL AND reason_kind IN ('evidence_stale', 'evidence_missing', 'conformance_drift');
  GET DIAGNOSTICS v_lifted = ROW_COUNT;
  PERFORM governance._cm_artifact('release_candidate', 'RC:' || p_candidate::text, format('%s (release candidate — not a release)', c.label),
                                  jsonb_build_object('version', p_version, 'digest', c.digest, 'state', 'withdrawn', 'head_sha', c.head_sha, 'manifest_version', c.manifest_version), 'V4', 'retired', p_actor, p_correlation, p_candidate);
  PERFORM governance.ledger(NULL, NULL, 'release_candidate', p_candidate, p_version, 'candidate.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason), 'holds_lifted', v_lifted), p_correlation);
  RETURN jsonb_build_object('candidate_id', p_candidate, 'version', p_version, 'state', 'withdrawn', 'holds_lifted', v_lifted);
END $$;
REVOKE ALL ON FUNCTION governance.cm_withdraw_candidate(uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.cm_withdraw_candidate(uuid, int, text, uuid, uuid) TO eye_commit;

-- §CM.6 THE CONFORMANCE MONITOR ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/* RECORD what the monitor observed (the after-tick hook under the attention agent — its own action, governance.conformance.monitor, on the
   ticking DOMAIN's route — or the conformance steward at PLATFORM). The service READ FIRST (the build identity, the committed manifest, the
   registered state) and computed the findings; this write reconciles them BY FINGERPRINT: a new one opened (with a `conformance_drift` — or,
   for expired evidence, an `evidence_stale` — hold on its subject candidate when it asks for one; the hold's source is the finding), an open monitor finding no longer observed RESOLVED (its
   hold lifted). A run is recorded on change. PLATFORM rows only (no attention item — the workspace and the ledger show them). */
CREATE OR REPLACE FUNCTION governance.cm_record_monitor(p_observed jsonb, p_findings jsonb, p_via text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  f jsonb; v_id uuid; v_opened int := 0; v_resolved int := 0; v_hopen int := 0; v_hlift int := 0; v_digest text; v_last text; o record; v_subject uuid; v_run uuid := NULL; v_n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.conformance.monitor']);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'conformance finding rejected (actor): the monitor records under the acting principal' USING ERRCODE = '42501';
  END IF;
  IF NOT ((public.eye_scope() = 'PLATFORM' AND governance.holds_role(p_actor, NULL, NULL, ARRAY['conformance_steward']))
          OR (public.eye_scope() = 'DOMAIN' AND governance.holds_role(p_actor, public.eye_tenant(), public.eye_domain(), ARRAY['attention_agent']))) THEN
    RAISE EXCEPTION 'conformance finding rejected (authority): the conformance monitor runs under the attention tick (attention agent) or the conformance steward' USING ERRCODE = '42501';
  END IF;
  IF p_via NOT IN ('tick', 'steward') OR (p_via = 'tick') <> (public.eye_scope() = 'DOMAIN') THEN
    RAISE EXCEPTION 'conformance finding rejected (via): a tick records from a domain''s tick, the steward from PLATFORM' USING ERRCODE = '22023';
  END IF;
  IF p_observed IS NULL OR jsonb_typeof(p_observed) <> 'object' OR p_findings IS NULL OR jsonb_typeof(p_findings) <> 'array' THEN
    RAISE EXCEPTION 'conformance finding rejected (observation): the monitor records its observation and its findings' USING ERRCODE = '22023';
  END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(p_findings) LOOP
    IF NOT ((f ->> 'kind') = ANY (governance.cm_monitor_kinds())) OR length(coalesce(f ->> 'fingerprint', '')) < 3 OR length(btrim(coalesce(f ->> 'summary', ''))) < 8
       OR (f ->> 'subject_artifact' IS NOT NULL AND (f ->> 'subject_artifact') !~ '^[0-9a-f-]{36}$') OR coalesce(f ->> 'hold_kind', 'conformance_drift') NOT IN ('conformance_drift', 'evidence_stale') THEN
      RAISE EXCEPTION 'conformance finding rejected (finding): each finding names a monitor kind (%), a fingerprint, a summary', array_to_string(governance.cm_monitor_kinds(), ' | ') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.cm.monitor', 0));
  -- open what is newly observed
  FOR f IN SELECT * FROM jsonb_array_elements(p_findings) LOOP
    SELECT finding_id INTO v_id FROM governance.cm_findings WHERE fingerprint = f ->> 'fingerprint' AND state = 'open';
    IF v_id IS NULL THEN
      v_id := gen_random_uuid(); v_subject := (f ->> 'subject_artifact')::uuid;
      INSERT INTO governance.cm_findings (finding_id, kind, fingerprint, subject_artifact, summary, observed, expected, state, opened_by, correlation_id)
      VALUES (v_id, f ->> 'kind', f ->> 'fingerprint', v_subject, btrim(f ->> 'summary'), coalesce(f -> 'observed', '{}'::jsonb), coalesce(f -> 'expected', '{}'::jsonb), 'open', p_actor, p_correlation);
      v_opened := v_opened + 1;
      IF (f ->> 'hold') = 'true' AND v_subject IS NOT NULL
         AND EXISTS (SELECT 1 FROM governance.cm_release_candidates c WHERE c.candidate_id = v_subject AND c.state NOT IN ('superseded', 'withdrawn')) THEN
        INSERT INTO governance.holds (hold_id, scope, subject_artifact, reason_kind, source_artifact, reason, opened_by, correlation_id)
        VALUES (gen_random_uuid(), 'PLATFORM', v_subject, coalesce(f ->> 'hold_kind', 'conformance_drift'), v_id,
                left(CASE WHEN f ->> 'hold_kind' = 'evidence_stale' THEN 'evidence expired: ' ELSE 'conformance drift: ' END || btrim(f ->> 'summary'), 2000), p_actor, p_correlation);
        v_hopen := v_hopen + 1;
      END IF;
      PERFORM governance.ledger(NULL, NULL, 'conformance_finding', v_id, NULL, 'finding.opened', p_actor, jsonb_build_object('kind', f ->> 'kind', 'fingerprint', f ->> 'fingerprint', 'subject', v_subject, 'via', p_via), p_correlation);
    END IF;
  END LOOP;
  -- resolve what is no longer observed (the monitor's kinds only; the registration's findings close with a registration)
  FOR o IN SELECT * FROM governance.cm_findings x WHERE x.state = 'open' AND x.kind = ANY (governance.cm_monitor_kinds())
             AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_findings) y WHERE y ->> 'fingerprint' = x.fingerprint) FOR UPDATE LOOP
    UPDATE governance.cm_findings SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(), resolution = 'no longer observed by the monitor' WHERE finding_id = o.finding_id;
    UPDATE governance.holds SET lifted_at = clock_timestamp(), lifted_by = p_actor, lift_reason = 'the conformance finding is no longer observed' WHERE source_artifact = o.finding_id AND lifted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hlift := v_hlift + v_n;
    v_resolved := v_resolved + 1;
    PERFORM governance.ledger(NULL, NULL, 'conformance_finding', o.finding_id, NULL, 'finding.resolved', p_actor, jsonb_build_object('kind', o.kind, 'fingerprint', o.fingerprint, 'via', p_via), p_correlation);
  END LOOP;
  v_digest := governance.digest(p_observed);
  SELECT observation_digest INTO v_last FROM governance.cm_monitor_runs ORDER BY recorded_at DESC LIMIT 1;
  IF v_opened > 0 OR v_resolved > 0 OR v_last IS DISTINCT FROM v_digest THEN
    v_run := gen_random_uuid();
    INSERT INTO governance.cm_monitor_runs (run_id, via, ticked_tenant, ticked_domain, observed, observation_digest, opened, resolved, holds_opened, holds_lifted, open_after, actor_principal_id, correlation_id)
    VALUES (v_run, p_via, CASE WHEN p_via = 'tick' THEN public.eye_tenant() END, CASE WHEN p_via = 'tick' THEN public.eye_domain() END, p_observed, v_digest, v_opened, v_resolved, v_hopen, v_hlift,
            (SELECT count(*) FROM governance.cm_findings WHERE state = 'open'), p_actor, p_correlation);
  END IF;
  RETURN jsonb_build_object('recorded', v_run IS NOT NULL, 'run_id', v_run, 'opened', v_opened, 'resolved', v_resolved, 'holds_opened', v_hopen, 'holds_lifted', v_hlift,
                            'open', (SELECT count(*) FROM governance.cm_findings WHERE state = 'open'), 'observation_digest', v_digest);
END $$;
REVOKE ALL ON FUNCTION governance.cm_record_monitor(jsonb, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.cm_record_monitor(jsonb, jsonb, text, uuid, uuid) TO eye_commit;
