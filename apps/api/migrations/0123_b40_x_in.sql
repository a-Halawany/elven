-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0123 §IN — CP-6 B40: INTAKE INSPECTION, QUARANTINE AND THE INTAKE REVIEW QUEUE (F-P1-03). Applies ALONE on 0001–0122 + 0123 §0; folded into
-- 0123_b40_source_platform.sql at the integration (order §0, §RG, §VA, §IN, §AP, §CR). 0001–0122 and 0123 §0 are untouched.
--
--   §IN.1 observation.inspection_verdicts    EVERY engine's verdict on every inspected item, as EVIDENCE beside the record it describes (the
--                                             admission's EVD version or the quarantine case): the engine identity (engine, engine version, the
--                                             OCI image digest, the rule-set digest, the SIGNATURE DATABASES — each name, version, build time and
--                                             digest — and the engine configuration: the database source and update policy named explicitly), the
--                                             outcome (observation.inspection_outcome, §0: clean | detected | unavailable | failed | incomplete) and
--                                             the findings — codes, classes, byte offsets and lengths, NEVER content (D9). Append-only. DESIGN D2:
--                                             an item PASSES only when every engine answered clean — the record port refuses a "pass" carrying any
--                                             other outcome (the rule held in the database, not only in TypeScript).
--   §IN.2 observation.intake_assessments     one row per inspected item: the review reason (safety | authenticity | policy | duplicate | quality |
--                                             rights | integrity | schema | identity), the DUPLICATE state (none | same_digest — the bytes of an
--                                             admitted evidence version of this domain | same_item_other_digest — the source's item key admitted
--                                             before with other bytes), the QUALITY score (completeness, parse confidence, duplication), the upload
--                                             facts (manual upload, the uploader), and the CONSUMER NOTICE (a case opened on a source that products
--                                             rest on — observation.source_derived_products, B22/B28). Append-only. No back-fill: an earlier item has
--                                             no row and every read says "not recorded before B40".
--   §IN.3 observation.upload_approvals       THE UPLOAD APPROVAL WORKFLOW (SP-22): an upload of an SRC@v4 contract outside its auto_admit rule is
--          (+ observation.upload_approval_events)  held — its bytes stay in the quarantine volume under a case — until a SECOND PERSON, never the
--                                             uploader, never an agent, approves or declines it (observation.decide_upload); the release itself is
--                                             the existing quarantine review (close_quarantine_case requires the approval).
--   §IN.4 observation.close_quarantine_case  re-declared WHOLE from its last definition (0022:1403): the reviewer is a named human (never an
--                                             agent); for a MANUAL UPLOAD (the case's run is the operator-upload connector) the reviewer is never
--                                             the uploader (DESIGN D9b — a collected item keeps today's rule, so the hosted journey 8's same-manager
--                                             collect-and-discard stays green); a held upload is released only once approved. Every earlier
--                                             refusal keeps its text; the new ones are in the class form `quarantine review rejected (<class>): …`.
--   §IN.5 the reads                          observation.intake_review_queue (the queue: every case of the domain with its reason, verdicts,
--                                             duplicate state, quality, approval and notice — the two stale eye_demo cases visible and untouched,
--                                             D16: "past expiry, not expired by the sweeper"), observation.intake_case_read (the case's WHY: the
--                                             verdicts with their engine identity and findings, never content — the excerpt is a separate read
--                                             under observation.evidence.retrieve, D9), observation.inspection_verdicts_read (an evidence version's
--                                             verdicts — the evidence page's list). Guarded by observation.assert_read_scope.
-- PDP (pdp.service.ts /* B40 in */): observation.inspection.read (observation.read's human readers — metadata only, D9), observation.upload.approve
-- (collection_manager / domain_admin, human-gated). The record port runs under the admission's and the quarantine's own actions
-- (observation.item.admit / observation.item.quarantine — the collection agent's, unchanged). No role (D14), no CHECK widened (§0's vocabularies).
-- THREE CLAIMS: construction (this file and its harnesses); demonstrated operation (§AC's act on SYNTHETIC personas); real acceptance (B111's
-- shared recording path, then H3/R2) — never claimed. The ClamAV image is NOT admitted (DESIGN "D2 — the admission result"): the clamd engine's
-- verdicts recorded here come from the adapter against an engine the deployment configures; EXC-P1-001 stays OPEN (the owner closes it).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §IN.0 HELPERS (internal: no runtime grant; reached from the definer ports below, which run as the owner) ───────────────────────────────────

/* The review reason a quarantine class falls under (PR-16-001 / CAP-OB-11): the queue's grouping. Every historic class and every §0 class is
   named; an unknown class reads `other` (never guessed into a category). */
CREATE OR REPLACE FUNCTION observation.intake_review_reason(p_class text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_class IS NULL THEN NULL
    WHEN p_class IN ('active_content', 'macro', 'embedded_file', 'hidden_instruction', 'malware_verdict', 'inspection_unavailable', 'inspection_failed',
                     'inspection_incomplete') THEN 'safety'
    WHEN p_class = 'unknown_signer' THEN 'authenticity'
    WHEN p_class IN ('policy_prohibited', 'residency_conflict') THEN 'policy'
    WHEN p_class = 'duplicate' THEN 'duplicate'
    WHEN p_class = 'quality' THEN 'quality'
    WHEN p_class = 'rights' THEN 'rights'
    WHEN p_class IN ('path_traversal', 'expansion_limit', 'entry_limit', 'compression_ratio', 'malformed_archive', 'type_mismatch', 'oversize') THEN 'integrity'
    WHEN p_class = 'schema_drift' THEN 'schema'
    WHEN p_class IN ('destination_identity_changed', 'response_anomaly') THEN 'identity'
    ELSE 'other' END
$$;
REVOKE ALL ON FUNCTION observation.intake_review_reason(text) FROM PUBLIC;

/* The findings of one verdict carry codes, classes, offsets, lengths and a short detail — NEVER content (D9). A finding with any other key, a
   negative offset or a detail over 240 characters is refused by the table's CHECK. */
CREATE OR REPLACE FUNCTION observation.iv_findings_ok(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_typeof(p) = 'array' AND jsonb_array_length(p) <= 200 AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p) f
     WHERE jsonb_typeof(f) <> 'object'
        OR NOT (f ? 'code') OR jsonb_typeof(f -> 'code') <> 'string' OR length(f ->> 'code') NOT BETWEEN 1 AND 160
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN ('code', 'class', 'offset', 'length', 'detail'))
        OR (f ? 'offset' AND (jsonb_typeof(f -> 'offset') <> 'number' OR (f ->> 'offset')::numeric < 0))
        OR (f ? 'length' AND (jsonb_typeof(f -> 'length') <> 'number' OR (f ->> 'length')::numeric < 0))
        OR (f ? 'detail' AND (jsonb_typeof(f -> 'detail') <> 'string' OR length(f ->> 'detail') > 240))
        OR (f ? 'class' AND jsonb_typeof(f -> 'class') <> 'string'))
$$;
REVOKE ALL ON FUNCTION observation.iv_findings_ok(jsonb) FROM PUBLIC;

/* The signature databases an engine reported (or the deployment declared and the engine confirmed): each { name, version, buildTime, digest },
   the unknown parts null — never inferred. */
CREATE OR REPLACE FUNCTION observation.iv_databases_ok(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_typeof(p) = 'array' AND jsonb_array_length(p) <= 32 AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p) d
     WHERE jsonb_typeof(d) <> 'object' OR jsonb_typeof(d -> 'name') <> 'string'
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(d) k WHERE k NOT IN ('name', 'version', 'buildTime', 'digest'))
        OR (d -> 'digest' IS NOT NULL AND jsonb_typeof(d -> 'digest') <> 'null' AND (d ->> 'digest') !~ '^[0-9a-f]{64}$'))
$$;
REVOKE ALL ON FUNCTION observation.iv_databases_ok(jsonb) FROM PUBLIC;

/* The OPERATOR who uploaded the item of a run, or NULL when the run is not a manual upload: the operator-upload connector's run records its
   trigger on run.started (`principal:<uuid>`, orchestrator.collectNow). A scheduled or "Collect now" run of any other connector is not an
   upload (D9b: the reviewer ≠ uploader rule applies to manual uploads only). */
CREATE OR REPLACE FUNCTION observation.in_uploader_of_run(p_run uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN e.details #>> '{trigger,by}' ~ '^principal:[0-9a-fA-F-]{36}$' THEN substr(e.details #>> '{trigger,by}', 11)::uuid END
    FROM observation.collection_run_events e
   WHERE e.run_id = p_run AND e.event = 'run.started' AND e.connector = 'collection.upload'
   ORDER BY e.occurred_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION observation.in_uploader_of_run(uuid) FROM PUBLIC;

-- §IN.1 THE VERDICT LEDGER ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.inspection_verdicts (
  verdict_id           uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  source_id            uuid NOT NULL,
  contract_version     int  NOT NULL,
  run_id               uuid,
  item_key             text NOT NULL,
  content_digest       text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  record_point         text NOT NULL CHECK (record_point IN ('admitted', 'quarantined')),
  evd_object_id        uuid,
  evd_version          int,
  case_id              uuid,
  manifest_id          uuid NOT NULL,
  engine               text NOT NULL CHECK (engine ~ '^[a-z][a-z0-9-]{1,40}$'),
  engine_version       text CHECK (engine_version IS NULL OR length(engine_version) BETWEEN 1 AND 120),
  image_digest         text CHECK (image_digest IS NULL OR image_digest ~ '^sha256:[0-9a-f]{64}$'),
  rule_set_digest      text CHECK (rule_set_digest IS NULL OR rule_set_digest ~ '^[0-9a-f]{64}$'),
  signature_databases  jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (observation.iv_databases_ok(signature_databases)),
  engine_config        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(engine_config) = 'object'),
  outcome              observation.inspection_outcome NOT NULL,
  findings             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (observation.iv_findings_ok(findings)),
  detail               text CHECK (detail IS NULL OR length(detail) <= 500),
  started_at           timestamptz NOT NULL,
  finished_at          timestamptz NOT NULL,
  decision             text NOT NULL CHECK (decision IN ('pass', 'quarantine')),
  decision_class       text,
  recorded_by          uuid NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT iv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT iv_point_bound CHECK ((record_point = 'admitted') = (evd_object_id IS NOT NULL AND evd_version IS NOT NULL)
                                   AND (record_point = 'quarantined') = (case_id IS NOT NULL)),
  CONSTRAINT iv_decision_bound CHECK ((decision = 'pass') = (decision_class IS NULL)),
  -- DESIGN D2 held by the row itself: an item that PASSED was scanned clean by this engine; an admitted item never carries another outcome
  CONSTRAINT iv_pass_is_clean CHECK (decision = 'quarantine' OR outcome = 'clean'),
  CONSTRAINT iv_admitted_passed CHECK (record_point = 'quarantined' OR decision = 'pass'),
  CONSTRAINT iv_time_order CHECK (finished_at >= started_at)
);
COMMENT ON TABLE observation.inspection_verdicts IS 'B40 §IN (F-P1-03; DESIGN D2): every inspection engine''s verdict on every inspected item of an SRC@v4 contract, recorded as evidence beside the admission (EVD version) or the quarantine case it describes — the engine identity (engine, version, image digest, rule-set digest, signature databases with versions / build times / digests, the configuration naming the database source and update policy), the outcome (clean | detected | unavailable | failed | incomplete; only clean passes) and the findings (codes, classes, offsets — never content, D9). Append-only; no back-fill.';
CREATE INDEX iv_evd ON observation.inspection_verdicts (evd_object_id, evd_version) WHERE evd_object_id IS NOT NULL;
CREATE INDEX iv_case ON observation.inspection_verdicts (case_id) WHERE case_id IS NOT NULL;
CREATE INDEX iv_source ON observation.inspection_verdicts (tenant_id, domain_id, source_id, recorded_at DESC);
CREATE TRIGGER iv_append_only BEFORE UPDATE OR DELETE ON observation.inspection_verdicts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §IN.2 THE ASSESSMENT OF EACH INSPECTED ITEM ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.intake_assessments (
  assessment_id        uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  source_id            uuid NOT NULL,
  contract_version     int  NOT NULL,
  run_id               uuid,
  item_key             text NOT NULL,
  content_digest       text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  scanned_digest_verified boolean NOT NULL,
  record_point         text NOT NULL CHECK (record_point IN ('admitted', 'quarantined')),
  evd_object_id        uuid,
  evd_version          int,
  case_id              uuid,
  manifest_id          uuid NOT NULL,
  decision             text NOT NULL CHECK (decision IN ('pass', 'quarantine')),
  decision_class       text,
  review_reason        text CHECK (review_reason IS NULL OR review_reason IN ('safety', 'authenticity', 'policy', 'duplicate', 'quality', 'rights', 'integrity',
                                                                              'schema', 'identity', 'other')),
  engines_required     jsonb NOT NULL CHECK (jsonb_typeof(engines_required) = 'array'),
  content_rules        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content_rules) = 'object'),
  duplicate_state      text NOT NULL CHECK (duplicate_state IN ('none', 'same_digest', 'same_item_other_digest')),
  duplicate_of         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(duplicate_of) = 'array'),
  quality_score        numeric(4, 3) NOT NULL CHECK (quality_score BETWEEN 0 AND 1),
  quality              jsonb NOT NULL CHECK (jsonb_typeof(quality) = 'object'),
  manual_upload        boolean NOT NULL,
  uploader_principal_id uuid,
  consumer_notice      jsonb,
  recorded_by          uuid NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT ia_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ia_point_bound CHECK ((record_point = 'admitted') = (evd_object_id IS NOT NULL AND evd_version IS NOT NULL)
                                   AND (record_point = 'quarantined') = (case_id IS NOT NULL)),
  CONSTRAINT ia_decision_bound CHECK ((decision = 'pass') = (decision_class IS NULL)),
  CONSTRAINT ia_upload_bound CHECK (manual_upload OR uploader_principal_id IS NULL),
  CONSTRAINT ia_notice_on_case CHECK (consumer_notice IS NULL OR record_point = 'quarantined')
);
COMMENT ON TABLE observation.intake_assessments IS 'B40 §IN (PR-16-001/-002, CAP-OB-11, DP-16-001): one row per inspected item of an SRC@v4 contract — the review reason, the duplicate state (same digest admitted in this domain / the source''s item key admitted with other bytes), the quality score (completeness, parse confidence, duplication), the manual-upload facts and the consumer notice (a case opened on a source products rest on). Append-only; earlier items read "not recorded before B40".';
CREATE UNIQUE INDEX ia_case_once ON observation.intake_assessments (case_id) WHERE case_id IS NOT NULL;
CREATE UNIQUE INDEX ia_evd_once ON observation.intake_assessments (evd_object_id, evd_version) WHERE evd_object_id IS NOT NULL;
CREATE INDEX ia_source ON observation.intake_assessments (tenant_id, domain_id, source_id, recorded_at DESC);
CREATE TRIGGER ia_append_only BEFORE UPDATE OR DELETE ON observation.intake_assessments FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §IN.3 THE UPLOAD APPROVAL WORKFLOW (SP-22) ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.upload_approvals (
  approval_id          uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  source_id            uuid NOT NULL,
  contract_version     int  NOT NULL,
  case_id              uuid NOT NULL UNIQUE,
  manifest_id          uuid NOT NULL,
  item_key             text NOT NULL,
  content_digest       text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  byte_length          bigint NOT NULL CHECK (byte_length >= 0),
  media_type           text,
  requester_principal_id uuid NOT NULL,
  purpose              text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 1 AND 200),
  rule                 jsonb NOT NULL CHECK (jsonb_typeof(rule) = 'object'),
  held_because         text NOT NULL CHECK (length(btrim(held_because)) BETWEEN 8 AND 500),
  state                text NOT NULL CHECK (state IN ('pending', 'approved', 'declined', 'expired')),
  requested_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by           uuid,
  decided_at           timestamptz,
  decision_reason      text CHECK (decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 8 AND 2000),
  correlation_id       uuid NOT NULL,
  CONSTRAINT ua_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ua_decided_bound CHECK ((state = 'pending') = (decided_at IS NULL)
                                     AND (state IN ('approved', 'declined')) = (decided_by IS NOT NULL)),
  -- the second person (SP-22, PR-16-003): never the requester — held by the row too
  CONSTRAINT ua_second_person CHECK (decided_by IS NULL OR decided_by <> requester_principal_id)
);
COMMENT ON TABLE observation.upload_approvals IS 'B40 §IN (SP-22, PR-16-003): an operator upload of an SRC@v4 contract outside its auto_admit rule, held in the quarantine volume under its case until a second person (never the uploader, never an agent) approves or declines it; the release is the existing quarantine review. The row''s state moves only through observation.decide_upload and observation.close_quarantine_case; every move is in observation.upload_approval_events.';
CREATE INDEX ua_pending ON observation.upload_approvals (tenant_id, domain_id, requested_at DESC) WHERE state = 'pending';

CREATE TABLE observation.upload_approval_events (
  event_id             uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  approval_id          uuid NOT NULL REFERENCES observation.upload_approvals (approval_id),
  event                text NOT NULL CHECK (event IN ('upload.held', 'upload.approved', 'upload.declined', 'upload.expired')),
  actor                uuid NOT NULL,
  details              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT uae_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.upload_approval_events IS 'B40 §IN: the ledger of the upload approval workflow — held, approved, declined, expired — who and why; append-only.';
CREATE INDEX uae_approval ON observation.upload_approval_events (approval_id, occurred_at);
CREATE TRIGGER uae_append_only BEFORE UPDATE OR DELETE ON observation.upload_approval_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

REVOKE ALL ON observation.inspection_verdicts, observation.intake_assessments, observation.upload_approvals, observation.upload_approval_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inspection_verdicts', 'intake_assessments', 'upload_approvals', 'upload_approval_events'] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY oin_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §IN.1/§IN.2/§IN.3 THE RECORD PORT ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Called by the inspect stage's `record` inside the admission transaction (the EVD version written) or the quarantine transaction (the case
   opened) — under that transaction's own action (observation.item.admit / observation.item.quarantine, the collection agent's). It writes
   every engine's verdict, the item's assessment (duplicate state and the quality computed HERE from the domain's records), the custody entry
   `custody.inspected` (the manifest, the digest the engines scanned, verified against the stored digest), the consumer notice when a case
   opens on a source products rest on, and — for a held upload — the pending upload approval. D2 in the database: a `pass` with any verdict
   other than clean is refused; a pass at the quarantined point names no class; an admission never records a quarantine decision. */
CREATE OR REPLACE FUNCTION observation.record_inspection(
  p_tenant uuid, p_domain uuid, p_source uuid, p_contract_version int, p_run uuid, p_point jsonb, p_decision text, p_decision_class text,
  p_verdicts jsonb, p_assessment jsonb, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, objects, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); v_kind text := p_point ->> 'kind'; v_evd uuid; v_ver int; v_case uuid; v_manifest uuid;
        v_item text := p_point ->> 'itemKey'; v_digest text := p_point ->> 'contentDigest'; v_q observation.quarantine_current%ROWTYPE;
        v jsonb; v_count int := 0; v_dup text := 'none'; v_dup_of jsonb := '[]'::jsonb; v_dup_score numeric; v_completeness numeric;
        v_parse numeric; v_score numeric; v_uploader uuid; v_upload boolean := false; v_notice jsonb := NULL; v_products jsonb;
        v_assessment uuid := gen_random_uuid(); v_approval uuid := NULL; v_verified boolean; v_evd_obs uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.item.admit', 'observation.item.quarantine']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'inspection verdict rejected (actor): a verdict is recorded under the acting principal of the run' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('pass', 'quarantine') THEN
    RAISE EXCEPTION 'inspection verdict rejected (decision): the decision is pass | quarantine (got %)', coalesce(p_decision, '<none>') USING ERRCODE = '22023';
  END IF;
  IF (p_decision = 'pass') <> (p_decision_class IS NULL) THEN
    RAISE EXCEPTION 'inspection verdict rejected (decision): a quarantine decision names its class and a pass names none' USING ERRCODE = '22023';
  END IF;
  IF v_digest IS NULL OR v_digest !~ '^[0-9a-f]{64}$' OR v_item IS NULL OR length(v_item) = 0 THEN
    RAISE EXCEPTION 'inspection verdict rejected (point): the record point names the item key and its content digest' USING ERRCODE = '22023';
  END IF;
  IF p_verdicts IS NULL OR jsonb_typeof(p_verdicts) <> 'array' OR jsonb_array_length(p_verdicts) = 0 THEN
    RAISE EXCEPTION 'inspection verdict rejected (verdicts): an inspected item carries at least one engine verdict' USING ERRCODE = '22023';
  END IF;
  -- DESIGN D2: ONLY clean passes — the database refuses a pass that any engine did not answer clean (the stage's rule, held twice)
  IF p_decision = 'pass' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_verdicts) x WHERE x ->> 'outcome' IS DISTINCT FROM 'clean') THEN
    RAISE EXCEPTION 'inspection verdict rejected (state): an item passes only when every engine answered clean; an unavailable, failed, incomplete or detected scan is never a pass (D2)'
      USING ERRCODE = '23514';
  END IF;
  -- THE RECORD POINT: the admission's EVD version, or the quarantine case — each of THIS source, tenant and domain
  IF v_kind = 'admitted' THEN
    IF p_decision <> 'pass' THEN
      RAISE EXCEPTION 'inspection verdict rejected (state): an admitted item records a pass; a quarantine decision never reaches an admission' USING ERRCODE = '23514';
    END IF;
    v_evd := (p_point ->> 'evdObjectId')::uuid; v_ver := (p_point ->> 'evdVersion')::int; v_manifest := (p_point ->> 'manifestId')::uuid;
    SELECT (o.payload ->> 'obs_object_id')::uuid INTO v_evd_obs FROM objects.canonical_objects o
     WHERE o.object_type = 'EVD' AND o.object_id = v_evd AND o.object_version = v_ver AND o.tenant_id = p_tenant AND o.domain_id = p_domain
       AND o.payload ->> 'manifest_id' = v_manifest::text AND o.payload ->> 'content_digest' = v_digest;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'inspection verdict rejected (unknown_evidence): EVD % v% with this manifest and digest is not recorded in this domain', coalesce(v_evd::text, '<none>'), coalesce(v_ver::text, '<none>')
        USING ERRCODE = '23503';
    END IF;
  ELSIF v_kind = 'quarantined' THEN
    v_case := (p_point ->> 'caseId')::uuid; v_manifest := (p_point ->> 'manifestId')::uuid;
    SELECT * INTO v_q FROM observation.quarantine_current q
     WHERE q.case_id = v_case AND q.tenant_id = p_tenant AND q.domain_id = p_domain AND q.source_id = p_source AND q.contract_version = p_contract_version;
    IF NOT FOUND OR v_q.manifest_id IS DISTINCT FROM v_manifest OR v_q.content_digest IS DISTINCT FROM v_digest THEN
      RAISE EXCEPTION 'inspection verdict rejected (unknown_case): quarantine case % with this manifest and digest is not open for this source in this domain', coalesce(v_case::text, '<none>')
        USING ERRCODE = '23503';
    END IF;
  ELSE
    RAISE EXCEPTION 'inspection verdict rejected (point): the record point is admitted | quarantined (got %)', coalesce(v_kind, '<none>') USING ERRCODE = '22023';
  END IF;

  -- every engine's verdict, WITH its identity (the table's CHECKs refuse content in findings and a malformed identity)
  FOR v IN SELECT x FROM jsonb_array_elements(p_verdicts) x LOOP
    INSERT INTO observation.inspection_verdicts (verdict_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, item_key, content_digest,
      record_point, evd_object_id, evd_version, case_id, manifest_id, engine, engine_version, image_digest, rule_set_digest, signature_databases,
      engine_config, outcome, findings, detail, started_at, finished_at, decision, decision_class, recorded_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, p_contract_version, p_run, v_item, v_digest,
      v_kind, v_evd, v_ver, v_case, v_manifest, v ->> 'engine', v ->> 'engineVersion', v ->> 'imageDigest', v ->> 'ruleSetDigest',
      coalesce(v -> 'signatureDatabases', '[]'::jsonb), coalesce(v -> 'engineConfig', '{}'::jsonb), (v ->> 'outcome')::observation.inspection_outcome,
      coalesce(v -> 'findings', '[]'::jsonb), left(v ->> 'detail', 500), (v ->> 'startedAt')::timestamptz, (v ->> 'finishedAt')::timestamptz,
      p_decision, p_decision_class, v_actor, p_correlation);
    v_count := v_count + 1;
  END LOOP;

  -- THE DUPLICATE STATE, from this domain's records (never from the run's own claim): the same bytes already admitted as evidence; or the
  -- source's same item key admitted before with other bytes
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'manifest', 'manifest_id', m.manifest_id, 'source_id', m.source_id) ORDER BY m.created_at), '[]'::jsonb)
    INTO v_dup_of
    FROM (SELECT m.* FROM observation.blob_manifests m
           WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.vault = 'evidence' AND m.content_digest = v_digest
             AND m.manifest_id IS DISTINCT FROM CASE WHEN v_kind = 'admitted' THEN v_manifest END
           ORDER BY m.created_at LIMIT 5) m;
  IF jsonb_array_length(v_dup_of) > 0 THEN
    v_dup := 'same_digest';
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'evidence', 'evd_object_id', a.evd_object_id, 'item_key', a.item_key) ORDER BY a.first_seen_at), '[]'::jsonb)
      INTO v_dup_of
      FROM (SELECT a.* FROM observation.acquisition_attempts a
             WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.source_id = p_source AND a.item_key = v_item AND a.outcome = 'admitted'
               AND a.evd_object_id IS NOT NULL AND a.evd_object_id IS DISTINCT FROM v_evd
               AND EXISTS (SELECT 1 FROM objects.canonical_objects e WHERE e.object_type = 'EVD' AND e.object_id = a.evd_object_id
                             AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.payload ->> 'content_digest' <> v_digest)
             ORDER BY a.first_seen_at LIMIT 5) a;
    IF jsonb_array_length(v_dup_of) > 0 THEN v_dup := 'same_item_other_digest'; END IF;
  END IF;
  -- THE QUALITY SCORE: completeness and parse confidence measured by the stage (0..1), duplication from the state above; their mean, stated
  v_completeness := least(greatest(coalesce((p_assessment #>> '{quality,completeness}')::numeric, 0), 0), 1);
  v_parse := least(greatest(coalesce((p_assessment #>> '{quality,parse_confidence}')::numeric, 0), 0), 1);
  v_dup_score := CASE v_dup WHEN 'none' THEN 1 WHEN 'same_item_other_digest' THEN 0.5 ELSE 0 END;
  v_score := round((v_completeness + v_parse + v_dup_score) / 3, 3);
  v_verified := (p_assessment ->> 'scannedDigest') = v_digest;

  -- THE MANUAL UPLOAD: the operator who uploaded (the run's trigger on the operator-upload connector)
  v_uploader := observation.in_uploader_of_run(p_run);
  v_upload := (SELECT e.connector = 'collection.upload' FROM observation.collection_run_events e WHERE e.run_id = p_run AND e.event = 'run.started' LIMIT 1);
  v_upload := coalesce(v_upload, false);

  -- THE CONSUMER NOTICE (PR-16-005): a case opened on a source that products rest on — the products counted by kind, for the steward and the
  -- collection managers (B22/B28's walk, unchanged)
  IF v_kind = 'quarantined' THEN
    SELECT coalesce(jsonb_object_agg(k.subject_kind, k.n), '{}'::jsonb) INTO v_products
      FROM (SELECT d.subject_kind, count(*) n FROM observation.source_derived_products(p_tenant, p_domain, p_source) d GROUP BY d.subject_kind) k;
    IF v_products <> '{}'::jsonb THEN
      v_notice := jsonb_build_object('products', v_products,
                                     'product_count', (SELECT sum(x::int) FROM jsonb_each_text(v_products) t(k, x)),
                                     'notify_roles', jsonb_build_array('collection_manager', 'data_steward'),
                                     'steward', (SELECT c.contract #>> '{stewardship,steward}' FROM observation.source_contracts_current c
                                                  WHERE c.source_id = p_source AND c.contract_version = p_contract_version LIMIT 1),
                                     'statement', 'a case opened on a source that products rest on: they are not refreshed from this item until it is reviewed');
    END IF;
  END IF;

  INSERT INTO observation.intake_assessments (assessment_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, item_key, content_digest,
    scanned_digest_verified, record_point, evd_object_id, evd_version, case_id, manifest_id, decision, decision_class, review_reason, engines_required,
    content_rules, duplicate_state, duplicate_of, quality_score, quality, manual_upload, uploader_principal_id, consumer_notice, recorded_by, correlation_id)
  VALUES (v_assessment, 'DOMAIN', p_tenant, p_domain, p_source, p_contract_version, p_run, v_item, v_digest,
    v_verified, v_kind, v_evd, v_ver, v_case, v_manifest, p_decision, p_decision_class, observation.intake_review_reason(p_decision_class),
    coalesce(p_assessment -> 'enginesRequired', '[]'::jsonb), coalesce(p_assessment -> 'contentRules', '{}'::jsonb), v_dup, v_dup_of, v_score,
    jsonb_build_object('completeness', v_completeness, 'parse_confidence', v_parse, 'duplication', v_dup_score,
                       'basis', coalesce(p_assessment #> '{quality,basis}', '[]'::jsonb), 'method', 'mean of completeness, parse confidence and duplication (B40 §IN v1)'),
    v_upload, CASE WHEN v_upload THEN v_uploader END, v_notice, v_actor, p_correlation);

  -- THE CUSTODY ENTRY: the bytes the engines scanned, verified against the stored digest (custody.inspected, §0's event)
  INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version,
    run_id, event, actor, agent_principal_id, content_digest, digest_verified, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_manifest, v_evd_obs, v_evd, p_source, p_contract_version, p_run, 'custody.inspected',
    'principal:' || v_actor::text, v_actor, v_digest, v_verified,
    jsonb_build_object('record_point', v_kind, 'case_id', v_case, 'decision', p_decision, 'decision_class', p_decision_class,
                       'engines', (SELECT jsonb_agg(jsonb_build_object('engine', x ->> 'engine', 'engine_version', x ->> 'engineVersion', 'outcome', x ->> 'outcome'))
                                     FROM jsonb_array_elements(p_verdicts) x),
                       'assessment_id', v_assessment),
    p_correlation);

  -- THE HELD UPLOAD (SP-22): the pending approval a second person decides
  IF v_kind = 'quarantined' AND (p_assessment #>> '{hold,kind}') = 'upload_approval' THEN
    IF NOT v_upload OR v_uploader IS NULL THEN
      RAISE EXCEPTION 'inspection verdict rejected (state): an upload held for approval names its uploader (the run is not an operator upload)' USING ERRCODE = '23514';
    END IF;
    v_approval := gen_random_uuid();
    INSERT INTO observation.upload_approvals (approval_id, scope, tenant_id, domain_id, source_id, contract_version, case_id, manifest_id, item_key,
      content_digest, byte_length, media_type, requester_principal_id, purpose, rule, held_because, state, correlation_id)
    VALUES (v_approval, 'DOMAIN', p_tenant, p_domain, p_source, p_contract_version, v_case, v_manifest, v_item, v_digest,
      coalesce(v_q.byte_length, 0), coalesce(v_q.declared_type, v_q.sniffed_type), v_uploader,
      left(coalesce(nullif(btrim(p_assessment #>> '{hold,purpose}'), ''), 'observation'), 200),
      coalesce(p_assessment #> '{hold,rule}', '{}'::jsonb), left(coalesce(p_assessment #>> '{hold,because}', 'outside the contract''s auto-admit rule'), 500),
      'pending', p_correlation);
    INSERT INTO observation.upload_approval_events (event_id, scope, tenant_id, domain_id, approval_id, event, actor, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_approval, 'upload.held', v_actor,
            jsonb_build_object('case_id', v_case, 'requester', v_uploader, 'because', p_assessment #>> '{hold,because}'), p_correlation);
  END IF;

  RETURN jsonb_build_object('verdicts', v_count, 'assessment_id', v_assessment, 'duplicate_state', v_dup, 'quality_score', v_score,
                            'approval_id', v_approval, 'consumer_notice', v_notice IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION observation.record_inspection(uuid, uuid, uuid, int, uuid, jsonb, text, text, jsonb, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_inspection(uuid, uuid, uuid, int, uuid, jsonb, text, text, jsonb, jsonb, uuid) TO eye_commit;

-- §IN.3 THE APPROVAL ACT ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A SECOND PERSON decides a held upload: a named active human holding collection_manager (or domain_admin) here, never the uploader (the
   requester), never an agent (governance.assert_approver: the class form, 403). Approve → the case may be released by the quarantine review;
   decline → the case may be rejected (the route does both, each through its own governed write). Pending only (409 state). */
CREATE OR REPLACE FUNCTION observation.decide_upload(
  p_approval_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); a observation.upload_approvals%ROWTYPE; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.upload.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_actor IS NULL OR p_actor IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'upload approval rejected (actor): the decision is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM observation.upload_approvals u WHERE u.approval_id = p_approval_id AND u.tenant_id = p_tenant AND u.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'upload approval rejected (unknown_approval): no held upload % in this domain', coalesce(p_approval_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  PERFORM governance.assert_approver('upload approval', v_actor, p_tenant, p_domain, ARRAY['collection_manager', 'domain_admin'], a.requester_principal_id, NULL,
                                     'deciding an operator upload held outside the contract''s auto-admit rule');
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'decline') THEN
    RAISE EXCEPTION 'upload approval rejected (decision): the decision is approve | decline' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'upload approval rejected (reason): a decision carries a reason of at least 8 characters' USING ERRCODE = '22023';
  END IF;
  IF a.state <> 'pending' THEN
    RAISE EXCEPTION 'upload approval rejected (state): the upload is already %', a.state USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM observation.quarantine_current q WHERE q.case_id = a.case_id AND q.state = 'open') THEN
    RAISE EXCEPTION 'upload approval rejected (state): the held upload''s quarantine case is no longer open' USING ERRCODE = '23514';
  END IF;
  v_state := CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'declined' END;
  UPDATE observation.upload_approvals SET state = v_state, decided_by = v_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason)
   WHERE approval_id = a.approval_id;
  INSERT INTO observation.upload_approval_events (event_id, scope, tenant_id, domain_id, approval_id, event, actor, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, a.approval_id, 'upload.' || v_state, v_actor,
          jsonb_build_object('case_id', a.case_id, 'requester', a.requester_principal_id, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('approval_id', a.approval_id, 'case_id', a.case_id, 'state', v_state, 'decided_by', v_actor, 'requester', a.requester_principal_id);
END $$;
REVOKE ALL ON FUNCTION observation.decide_upload(uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.decide_upload(uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

-- §IN.4 observation.close_quarantine_case — 0022:1403, its LAST definition (no later migration re-declares it), copied WHOLE: the signature,
-- SECURITY DEFINER, the search path and the grants unchanged; every existing refusal keeps its text. The additions are marked `-- B40 in`.
CREATE OR REPLACE FUNCTION observation.close_quarantine_case(
  p_case_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_reason text,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, identity, public, pg_catalog, pg_temp AS $$
DECLARE v_row observation.quarantine_current%ROWTYPE; v_actor uuid := public.eye_principal(); v_has_role boolean;
        v_uploader uuid; v_approval observation.upload_approvals%ROWTYPE; v_held boolean := false;   -- B40 in
BEGIN
  IF p_outcome = 'expired' THEN
    PERFORM observation.assert_authority(ARRAY['observation.sweeper.reconcile']);
  ELSE
    PERFORM observation.assert_authority(ARRAY['observation.quarantine.review']);
  END IF;
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_outcome NOT IN ('admitted', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'quarantine close rejected: unknown outcome %', p_outcome USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM observation.quarantine_current
   WHERE case_id = p_case_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quarantine close rejected: no such case' USING ERRCODE = '23503';
  END IF;
  IF v_row.state <> 'open' THEN
    RAISE EXCEPTION 'quarantine close rejected: case is already %', v_row.state USING ERRCODE = '23514';
  END IF;
  IF p_outcome <> 'expired' THEN
    IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
      RAISE EXCEPTION 'quarantine close rejected: a release or rejection requires a recorded reason'
        USING ERRCODE = '23514';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM identity.role_bindings b
       WHERE b.principal_id = v_actor AND b.revoked_at IS NULL
         AND b.role_code = 'collection_manager'
         AND b.tenant_id = p_tenant AND (b.domain_id = p_domain OR b.scope = 'TENANT')
    ) INTO v_has_role;
    IF NOT v_has_role THEN
      RAISE EXCEPTION 'quarantine close rejected: review requires the collection_manager role in this domain'
        USING ERRCODE = '42501';
    END IF;
    -- B40 in: the reviewer is a named human — an agent never releases or rejects a quarantined item
    IF onboarding.principal_kind(v_actor) IS DISTINCT FROM 'human' THEN                                                                      -- B40 in
      RAISE EXCEPTION 'quarantine review rejected (actor): releasing or rejecting a quarantined item is a named human''s act; an agent or a system never reviews'  -- B40 in
        USING ERRCODE = '42501';                                                                                                            -- B40 in
    END IF;                                                                                                                                 -- B40 in
    -- B40 in (DESIGN D9b): a MANUAL UPLOAD is never reviewed by the operator who uploaded it; a collected item keeps the rule above
    v_uploader := observation.in_uploader_of_run(v_row.run_id);                                                                             -- B40 in
    IF v_uploader IS NOT NULL AND v_uploader = v_actor THEN                                                                                 -- B40 in
      RAISE EXCEPTION 'quarantine review rejected (separation_of_duties): the operator who uploaded this item never reviews its quarantine case; a second person releases or rejects it (D9b)'  -- B40 in
        USING ERRCODE = '42501';                                                                                                            -- B40 in
    END IF;                                                                                                                                 -- B40 in
  END IF;

  -- B40 in (SP-22): a held upload is RELEASED only once a second person approved it; a rejection or an expiry closes its approval too
  SELECT * INTO v_approval FROM observation.upload_approvals u WHERE u.case_id = p_case_id FOR UPDATE;                                       -- B40 in
  v_held := FOUND;                                                                                                                          -- B40 in
  IF v_held AND p_outcome = 'admitted' AND v_approval.state <> 'approved' THEN                                                              -- B40 in
    RAISE EXCEPTION 'quarantine review rejected (held): the upload awaits a second person''s approval (approval %, %); it is released only once approved', v_approval.approval_id, v_approval.state  -- B40 in
      USING ERRCODE = '23514';                                                                                                              -- B40 in
  END IF;                                                                                                                                   -- B40 in
  IF v_held AND v_approval.state = 'pending' AND p_outcome IN ('rejected', 'expired') THEN                                                  -- B40 in
    UPDATE observation.upload_approvals                                                                                                     -- B40 in
       SET state = CASE p_outcome WHEN 'rejected' THEN 'declined' ELSE 'expired' END, decided_at = clock_timestamp(),                       -- B40 in
           decided_by = CASE WHEN p_outcome = 'rejected' THEN v_actor END,                                                                   -- B40 in
           decision_reason = CASE WHEN p_outcome = 'rejected' THEN btrim(p_reason) END                                                       -- B40 in
     WHERE approval_id = v_approval.approval_id;                                                                                            -- B40 in
    INSERT INTO observation.upload_approval_events (event_id, scope, tenant_id, domain_id, approval_id, event, actor, details, correlation_id)  -- B40 in
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_approval.approval_id,                                                       -- B40 in
            CASE p_outcome WHEN 'rejected' THEN 'upload.declined' ELSE 'upload.expired' END,                                                -- B40 in
            coalesce(v_actor, v_approval.requester_principal_id),                                                                           -- B40 in
            jsonb_build_object('case_id', p_case_id, 'by', CASE WHEN p_outcome = 'expired' THEN 'sweeper' ELSE 'quarantine review' END, 'reason', p_reason),  -- B40 in
            p_correlation);                                                                                                                 -- B40 in
  END IF;                                                                                                                                   -- B40 in

  UPDATE observation.quarantine_current
     SET state = p_outcome, closed_at = clock_timestamp(),
         review_actor = CASE WHEN p_outcome = 'expired' THEN 'sweeper'
                             ELSE 'principal:' || v_actor::text END,
         review_reason = p_reason
   WHERE case_id = p_case_id;

  INSERT INTO observation.quarantine_events (
    event_id, scope, tenant_id, domain_id, case_id, event, actor, verdict, reason_class, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_case_id,
    CASE p_outcome WHEN 'admitted' THEN 'case.admitted'
                   WHEN 'rejected' THEN 'case.rejected'
                   ELSE 'case.expired' END,
    CASE WHEN p_outcome = 'expired' THEN 'sweeper' ELSE 'principal:' || v_actor::text END,
    p_outcome, v_row.reason_class,
    jsonb_build_object('reason', p_reason, 'opened_by_run', v_row.run_id)
      || CASE WHEN v_uploader IS NOT NULL THEN jsonb_build_object('uploaded_by', v_uploader, 'reviewer_is_not_uploader', true) ELSE '{}'::jsonb END   -- B40 in
      || CASE WHEN v_held THEN jsonb_build_object('upload_approval', v_approval.approval_id) ELSE '{}'::jsonb END,                                    -- B40 in
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.close_quarantine_case(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.close_quarantine_case(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- §IN.5 THE READS (metadata only — D9; guarded by the caller's bound tenant and domain) ──────────────────────────────────────────────────────
/* One verdict row as the readers see it (identity, outcome, findings without content). */
CREATE OR REPLACE FUNCTION observation.iv_json(v observation.inspection_verdicts) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('verdict_id', v.verdict_id, 'engine', v.engine, 'engine_version', v.engine_version, 'image_digest', v.image_digest,
    'rule_set_digest', v.rule_set_digest, 'signature_databases', v.signature_databases, 'engine_config', v.engine_config, 'outcome', v.outcome,
    'findings', v.findings, 'detail', v.detail, 'started_at', v.started_at, 'finished_at', v.finished_at, 'decision', v.decision,
    'decision_class', v.decision_class, 'record_point', v.record_point, 'evd_object_id', v.evd_object_id, 'evd_version', v.evd_version,
    'case_id', v.case_id, 'recorded_at', v.recorded_at)
$$;
REVOKE ALL ON FUNCTION observation.iv_json(observation.inspection_verdicts) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.ia_json(a observation.intake_assessments) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN a.assessment_id IS NULL THEN NULL ELSE jsonb_build_object('assessment_id', a.assessment_id, 'decision', a.decision,
    'decision_class', a.decision_class, 'review_reason', a.review_reason, 'engines_required', a.engines_required, 'content_rules', a.content_rules,
    'duplicate_state', a.duplicate_state, 'duplicate_of', a.duplicate_of, 'quality_score', a.quality_score, 'quality', a.quality,
    'manual_upload', a.manual_upload, 'uploader', a.uploader_principal_id, 'consumer_notice', a.consumer_notice,
    'scanned_digest_verified', a.scanned_digest_verified, 'recorded_at', a.recorded_at) END
$$;
REVOKE ALL ON FUNCTION observation.ia_json(observation.intake_assessments) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.ua_json(u observation.upload_approvals) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN u.approval_id IS NULL THEN NULL ELSE jsonb_build_object('approval_id', u.approval_id, 'state', u.state, 'requester', u.requester_principal_id,
    'purpose', u.purpose, 'rule', u.rule, 'held_because', u.held_because, 'requested_at', u.requested_at, 'decided_by', u.decided_by,
    'decided_at', u.decided_at, 'decision_reason', u.decision_reason, 'media_type', u.media_type, 'byte_length', u.byte_length) END
$$;
REVOKE ALL ON FUNCTION observation.ua_json(observation.upload_approvals) FROM PUBLIC;

/* THE INTAKE REVIEW QUEUE (PR-16-001/-002, CAP-OB-11): the domain's cases (open by default; `all` for every state), newest first, each with its
   reason (class and review reason), the verdicts in brief, the duplicate state and quality (or "not recorded before B40"), the manual-upload
   facts (`you_uploaded`: the caller is the uploader — the review is a second person's), the held upload, the consumer notice, and the expiry
   (`past_expiry`: an open case past its expiry the sweeper has not expired — D16, shown, never touched). */
CREATE OR REPLACE FUNCTION observation.intake_review_queue(p_tenant uuid, p_domain uuid, p_state text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_caller uuid := public.eye_principal(); v_now timestamptz := clock_timestamp(); v_cases jsonb; v_counts jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.inspection.read']);
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the intake review queue');
  IF p_state IS NOT NULL AND p_state NOT IN ('open', 'admitted', 'rejected', 'expired', 'all') THEN
    RAISE EXCEPTION 'intake review rejected (state): the queue lists open | admitted | rejected | expired | all cases' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.opened_at DESC, x.case_id), '[]'::jsonb) INTO v_cases FROM (
    SELECT q.opened_at, q.case_id, jsonb_build_object(
      'case_id', q.case_id, 'source_id', q.source_id, 'source_key', c.source_key, 'source_name', c.contract ->> 'name', 'contract_version', q.contract_version,
      'schema_ref', CASE WHEN c.contract ? 'content_policy' THEN 'SRC@v4' ELSE 'SRC@v1–v3' END,
      'connector_kind', c.connector_kind, 'item_key', q.item_key, 'state', q.state, 'opened_at', q.opened_at, 'expires_at', q.expires_at, 'closed_at', q.closed_at,
      'past_expiry', q.state = 'open' AND q.expires_at < v_now,
      'expiry_statement', CASE WHEN q.state = 'open' AND q.expires_at < v_now THEN 'past expiry ' || to_char(q.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') || ' — not expired by the sweeper'
                               WHEN q.state = 'open' THEN 'expires ' || to_char(q.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') ELSE NULL END,
      'reason_class', q.reason_class, 'reason', q.reason, 'review_reason', observation.intake_review_reason(q.reason_class),
      'declared_type', q.declared_type, 'sniffed_type', q.sniffed_type, 'byte_length', q.byte_length, 'content_digest', q.content_digest,
      'review_actor', q.review_actor, 'review_reason_text', q.review_reason,
      'verdicts', (SELECT coalesce(jsonb_agg(jsonb_build_object('engine', v.engine, 'engine_version', v.engine_version, 'outcome', v.outcome,
                                                                 'finding_codes', (SELECT coalesce(jsonb_agg(DISTINCT f ->> 'code'), '[]'::jsonb) FROM jsonb_array_elements(v.findings) f))
                                             ORDER BY v.engine), '[]'::jsonb)
                     FROM observation.inspection_verdicts v WHERE v.case_id = q.case_id),
      'assessment', observation.ia_json(a),
      'recorded', a.assessment_id IS NOT NULL,
      'not_recorded_statement', CASE WHEN a.assessment_id IS NULL THEN 'inspection, duplicate state and quality not recorded before B40 (or for a v1–v3 contract)' END,
      'manual_upload', coalesce(a.manual_upload, observation.in_uploader_of_run(q.run_id) IS NOT NULL),
      'uploader', coalesce(a.uploader_principal_id, observation.in_uploader_of_run(q.run_id)),
      'you_uploaded', v_caller IS NOT NULL AND coalesce(a.uploader_principal_id, observation.in_uploader_of_run(q.run_id)) = v_caller,
      'upload_approval', observation.ua_json(u)) AS j
      FROM observation.quarantine_current q
      LEFT JOIN observation.source_contracts_current c ON c.source_id = q.source_id AND c.contract_version = q.contract_version
      LEFT JOIN observation.intake_assessments a ON a.case_id = q.case_id
      LEFT JOIN observation.upload_approvals u ON u.case_id = q.case_id
     WHERE q.tenant_id = p_tenant AND q.domain_id = p_domain AND (coalesce(p_state, 'open') = 'all' OR q.state = coalesce(p_state, 'open'))
     ORDER BY q.opened_at DESC, q.case_id LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)) x;
  SELECT jsonb_build_object(
    'open', count(*) FILTER (WHERE q.state = 'open'),
    'past_expiry', count(*) FILTER (WHERE q.state = 'open' AND q.expires_at < v_now),
    'held_uploads', (SELECT count(*) FROM observation.upload_approvals u WHERE u.tenant_id = p_tenant AND u.domain_id = p_domain AND u.state = 'pending'),
    'by_review_reason', (SELECT coalesce(jsonb_object_agg(r, n), '{}'::jsonb) FROM (SELECT coalesce(observation.intake_review_reason(q2.reason_class), 'unclassified') r, count(*) n
                            FROM observation.quarantine_current q2 WHERE q2.tenant_id = p_tenant AND q2.domain_id = p_domain AND q2.state = 'open' GROUP BY 1) t))
    INTO v_counts FROM observation.quarantine_current q WHERE q.tenant_id = p_tenant AND q.domain_id = p_domain;
  RETURN jsonb_build_object('cases', v_cases, 'counts', v_counts, 'as_of', v_now, 'state', coalesce(p_state, 'open'));
END $$;
REVOKE ALL ON FUNCTION observation.intake_review_queue(uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.intake_review_queue(uuid, uuid, text, int) TO eye_app, eye_commit;

/* THE CASE'S WHY: the case, its verdicts with their engine identity and findings (codes, offsets — never content), the assessment, the held
   upload and its events, the case's events, and the custody of its manifest. The excerpt of the bytes is NOT here (D9: it is a read of the
   bytes, under observation.evidence.retrieve — the route's own decision). */
CREATE OR REPLACE FUNCTION observation.intake_case_read(p_tenant uuid, p_domain uuid, p_case uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_caller uuid := public.eye_principal(); q observation.quarantine_current%ROWTYPE; a observation.intake_assessments%ROWTYPE;
        u observation.upload_approvals%ROWTYPE; v_uploader uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.inspection.read']);
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'an intake case');
  SELECT * INTO q FROM observation.quarantine_current x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'intake review rejected (unknown_case): no quarantine case % in this domain', coalesce(p_case::text, '<none>') USING ERRCODE = '23503';
  END IF;
  SELECT * INTO a FROM observation.intake_assessments x WHERE x.case_id = p_case;
  SELECT * INTO u FROM observation.upload_approvals x WHERE x.case_id = p_case;
  v_uploader := coalesce(a.uploader_principal_id, observation.in_uploader_of_run(q.run_id));
  RETURN jsonb_build_object(
    'case', jsonb_build_object('case_id', q.case_id, 'source_id', q.source_id, 'contract_version', q.contract_version, 'run_id', q.run_id,
      'manifest_id', q.manifest_id, 'item_key', q.item_key, 'state', q.state, 'opened_at', q.opened_at, 'expires_at', q.expires_at, 'closed_at', q.closed_at,
      'past_expiry', q.state = 'open' AND q.expires_at < clock_timestamp(),
      'reason_class', q.reason_class, 'reason', q.reason, 'review_reason', observation.intake_review_reason(q.reason_class),
      'declared_type', q.declared_type, 'sniffed_type', q.sniffed_type, 'byte_length', q.byte_length, 'content_digest', q.content_digest,
      'review_actor', q.review_actor, 'review_reason_text', q.review_reason),
    'source', (SELECT jsonb_build_object('source_key', c.source_key, 'name', c.contract ->> 'name', 'connector_kind', c.connector_kind,
                                          'schema_ref', CASE WHEN c.contract ? 'content_policy' THEN 'SRC@v4' ELSE 'SRC@v1–v3' END,
                                          'content_policy', c.contract -> 'content_policy')
                 FROM observation.source_contracts_current c WHERE c.source_id = q.source_id AND c.contract_version = q.contract_version),
    'verdicts', (SELECT coalesce(jsonb_agg(observation.iv_json(v) ORDER BY v.engine, v.recorded_at), '[]'::jsonb) FROM observation.inspection_verdicts v WHERE v.case_id = p_case),
    'assessment', observation.ia_json(a),
    'not_recorded_statement', CASE WHEN a.assessment_id IS NULL THEN 'inspection verdicts, duplicate state and quality not recorded before B40 (or for a v1–v3 contract)' END,
    'manual_upload', v_uploader IS NOT NULL, 'uploader', v_uploader, 'you_uploaded', v_caller IS NOT NULL AND v_uploader = v_caller,
    'upload_approval', observation.ua_json(u),
    'upload_approval_events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor, 'details', e.details, 'occurred_at', e.occurred_at) ORDER BY e.occurred_at), '[]'::jsonb)
                                 FROM observation.upload_approval_events e WHERE e.approval_id = u.approval_id),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor, 'verdict', e.verdict, 'reason_class', e.reason_class, 'occurred_at', e.occurred_at,
                                                           'details', e.details) ORDER BY e.occurred_at), '[]'::jsonb)
                 FROM observation.quarantine_events e WHERE e.case_id = p_case),
    'custody', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', c.event, 'actor', c.actor, 'occurred_at', c.occurred_at, 'content_digest', c.content_digest,
                                                            'digest_verified', c.digest_verified) ORDER BY c.occurred_at), '[]'::jsonb)
                  FROM observation.custody_events c WHERE c.manifest_id = q.manifest_id));
END $$;
REVOKE ALL ON FUNCTION observation.intake_case_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.intake_case_read(uuid, uuid, uuid) TO eye_app, eye_commit;

/* AN EVIDENCE VERSION'S VERDICTS (the evidence page's list — mounted by the integrator): the engines that passed it, with their identity; an
   earlier version reads "not recorded before B40". */
CREATE OR REPLACE FUNCTION observation.inspection_verdicts_read(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE a observation.intake_assessments%ROWTYPE; v_list jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.inspection.read']);
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the inspection verdicts of an evidence version');
  SELECT coalesce(jsonb_agg(observation.iv_json(v) ORDER BY v.engine, v.recorded_at), '[]'::jsonb) INTO v_list
    FROM observation.inspection_verdicts v
   WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.evd_object_id = p_evd AND (p_version IS NULL OR v.evd_version = p_version);
  SELECT * INTO a FROM observation.intake_assessments x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.evd_object_id = p_evd AND (p_version IS NULL OR x.evd_version = p_version)
   ORDER BY x.evd_version DESC LIMIT 1;
  RETURN jsonb_build_object('evd_object_id', p_evd, 'evd_version', p_version, 'verdicts', v_list, 'assessment', observation.ia_json(a),
    'statement', CASE WHEN jsonb_array_length(v_list) = 0 THEN 'no inspection verdict recorded: not recorded before B40, or the contract is v1–v3 (its recorded rule)' END);
END $$;
REVOKE ALL ON FUNCTION observation.inspection_verdicts_read(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.inspection_verdicts_read(uuid, uuid, uuid, int) TO eye_app, eye_commit;
