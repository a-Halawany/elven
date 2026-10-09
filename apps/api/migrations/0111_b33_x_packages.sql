-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §PK THE DOMAIN-PACKAGE FRAMEWORK (F-P4-15 ch.31/36: PR-31-001/-002/-003/-005/-006, CAP-FW-08..11, AT-31, WS-10, UX-36-001..006).
-- Prefix dpk_; schema `domain`; actions domain.package.* / domain.assessment.* / domain.watchlist.* / domain.event.* / domain.alert.* /
-- domain.link.*; TS apps/api/src/domains/packages/. Applies ALONE on top of 0111 §0 (the prelude's package tables, the PACKAGE_GATE seam
-- domain.package_function_state and the routed raise/close helpers are USED, never re-declared). Re-declares NOTHING of another stage's.
--
-- WHAT IS BUILT HERE: the PORTS on the prelude's domain.packages / domain.package_versions (declare, version, section approval, certify,
-- activate, retire, health, enable), the per-section specialist certification (the ontology section also through the graph's own ontology
-- gate: an ACTIVE graph.ontology_versions row of namespace pkg:<key> decided by the ontology steward — two keys), the conformance/acceptance
-- run ledger (the suite is computed by the TS service from the facts these functions expose; the port records it, recomputes the verdict
-- from the blocking checks, binds it to the manifest digest), health (an INCOMPATIBLE FUNCTION disabled, the conflict exposed, a migration
-- record opened and routed as `domain.package`), assessments (versioned, source diversity measured, specialist/analyst approval of a
-- material one, DAS per approved version, as-of replay), watchlists, domain events, alerts (raised `domain.alert` under the published policy
-- through executive.b33_raise_routed) and links to B32 exposures / B25 forecasts / B27 scenarios / indicators. Every package-bound write
-- consults the PACKAGE_GATE seam and refuses `<noun> rejected (package): <reason>`.
--
-- BOUNDARY (R7, said in the code and the records): package SIGNING and publisher identity → B77 (F-P7C-01); extension namespaces in EVERY
-- layer (connectors, policies, twin templates, model suites, agent capabilities, executive views) → B78 (F-P7C-07); marketplace and
-- purchase → B112 (ENT-13); cross-profile parity → B111; the SIGNED acceptance record (AT-31, PR-31-006, UX-36-006) → R2. A package here is
-- in-tenant data declared through these ports; the four package definitions (geopolitical, technology, cyber, financial) are TS data
-- declared through them by the harness and the act — not SQL seeds. Every figure a harness or an act writes through this file is SYNTHETIC
-- unless its source contract says `real`.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §PK.1 THE VOCABULARY ─────────────────────────────────────────────────────────────────────────────────────────────────────
/* The five sections a domain specialist certifies (PR-31-003: ontology, methodology, assessment, escalation, use boundaries). */
CREATE OR REPLACE FUNCTION domain.dpk_sections() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['ontology', 'methodology', 'assessment', 'escalation', 'use_boundary'] $$;
/* The package FUNCTIONS the gate is consulted for (the incompatible one is disabled, never the whole package — PR-31-005). */
CREATE OR REPLACE FUNCTION domain.dpk_functions() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['assess', 'event', 'watch', 'alert', 'forecast', 'scenario', 'exposure', 'indicator'] $$;
/* The core's fixed entity types (0024:133-135): a package MAPS onto them, it never adds one (R8). */
CREATE OR REPLACE FUNCTION domain.dpk_core_types() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['organization', 'place', 'asset', 'product', 'vessel', 'route', 'person', 'other'] $$;
GRANT EXECUTE ON FUNCTION domain.dpk_sections(), domain.dpk_functions(), domain.dpk_core_types() TO eye_app, eye_commit;

/* What a SECTION of a manifest is — the slice a specialist approves, digested: ontology = the ontology extension (namespace, mappings,
   predicates, event kinds); methodology = the source set, indicators and models; assessment = the assessment templates and the risk meaning;
   escalation = the watchlist templates and the escalation rules; use_boundary = the controls (purposes, classification, retention, scope,
   the inputs statement) and the release (semver, compatibility, requires/conflicts, migration). jsonb's text form is canonical (sorted keys). */
CREATE OR REPLACE FUNCTION domain.dpk_section_body(p_manifest jsonb, p_section text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p_section
    WHEN 'ontology'     THEN jsonb_build_object('ontology_extension', p_manifest -> 'ontology_extension')
    WHEN 'methodology'  THEN jsonb_build_object('source_set', p_manifest -> 'source_set', 'indicators', p_manifest -> 'indicators', 'models', p_manifest -> 'models')
    WHEN 'assessment'   THEN jsonb_build_object('assessment_templates', p_manifest -> 'assessment_templates', 'risk_meaning', p_manifest -> 'risk_meaning')
    WHEN 'escalation'   THEN jsonb_build_object('watchlist_templates', p_manifest -> 'watchlist_templates', 'escalation', p_manifest -> 'escalation')
    WHEN 'use_boundary' THEN jsonb_build_object('controls', p_manifest -> 'controls', 'release', p_manifest -> 'release')
  END $$;
CREATE OR REPLACE FUNCTION domain.dpk_section_digest(p_manifest jsonb, p_section text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to(p_section || ':' || domain.dpk_section_body(p_manifest, p_section)::text, 'UTF8')), 'hex') $$;
CREATE OR REPLACE FUNCTION domain.dpk_manifest_digest(p_manifest jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog, pg_temp AS $$ SELECT encode(sha256(convert_to(p_manifest::text, 'UTF8')), 'hex') $$;
GRANT EXECUTE ON FUNCTION domain.dpk_section_body(jsonb, text), domain.dpk_section_digest(jsonb, text), domain.dpk_manifest_digest(jsonb) TO eye_app, eye_commit;

-- §PK.2 THE TABLES ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE SECTION APPROVALS (PR-31-003, UX-36-004): a named domain specialist approves (or rejects) ONE section of ONE version AT ITS DIGEST, with
   a reason and an expiry; never the version's proposer, never an agent. The ontology section names the graph ontology version it rests on
   (the second key). Append-only: a re-proposed section (a new version, a new digest) re-opens by construction; the standing decision of a
   (version, section) is its latest row. */
CREATE TABLE domain.package_sections (
  approval_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  section             text NOT NULL CHECK (section IN ('ontology', 'methodology', 'assessment', 'escalation', 'use_boundary')),
  section_digest      text NOT NULL CHECK (section_digest ~ '^[0-9a-f]{64}$'),
  decision            text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  ontology_version_id uuid,
  approver_principal_id uuid NOT NULL,
  decided_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at          timestamptz NOT NULL,
  correlation_id      uuid NOT NULL,
  CONSTRAINT dpk_sec_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_sec_version FOREIGN KEY (package_id, version) REFERENCES domain.package_versions (package_id, version),
  CONSTRAINT dpk_sec_expiry CHECK (expires_at > decided_at),
  CONSTRAINT dpk_sec_ontology CHECK (section <> 'ontology' OR decision <> 'approved' OR ontology_version_id IS NOT NULL)
);
CREATE INDEX dpk_sec_lookup ON domain.package_sections (package_id, version, section, decided_at DESC);

/* THE RUNS (PR-31-006, AT-31, UX-36-006 — the software part): append-only. mode certification (the run certification rests on), diagnostic
   (an agent's or an owner's run that certifies nothing), health (the re-check, PK4) and acceptance (the package kind's MEASURED acceptance
   focus, PK6). checks = [{check, passed, severity: blocking|advisory, findings: [...], measured?: {...}}]; passed = every blocking check
   passed (recomputed by the port, never taken from the caller). Bound to the manifest digest it ran on. */
CREATE TABLE domain.package_conformance_runs (
  run_id           uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  package_id       uuid NOT NULL,
  version          int  NOT NULL,
  manifest_digest  text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  mode             text NOT NULL CHECK (mode IN ('certification', 'diagnostic', 'health', 'acceptance')),
  suite_version    text NOT NULL CHECK (length(suite_version) BETWEEN 3 AND 40),
  checks           jsonb NOT NULL CHECK (jsonb_typeof(checks) = 'array' AND jsonb_array_length(checks) >= 1),
  passed           boolean NOT NULL,
  facts_digest     text NOT NULL CHECK (facts_digest ~ '^[0-9a-f]{64}$'),
  facts_read_at    timestamptz NOT NULL,
  run_by           uuid NOT NULL,
  run_by_kind      text NOT NULL,
  ran_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT dpk_run_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_run_version FOREIGN KEY (package_id, version) REFERENCES domain.package_versions (package_id, version)
);
CREATE INDEX dpk_run_lookup ON domain.package_conformance_runs (package_id, version, mode, ran_at DESC);
CREATE TRIGGER dpk_run_append_only BEFORE UPDATE OR DELETE ON domain.package_conformance_runs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER dpk_sec_append_only BEFORE UPDATE OR DELETE ON domain.package_sections FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE MIGRATION RECORDS (PR-31-005 "route package governance and migration"): opened by the health port when a function is disabled or a
   conflict exposed; routed as a `domain.package` item (subject = the migration) to the owner and the specialists; completed when the
   functions are re-enabled (a passing re-run + the specialist's approval) or a new version is activated; abandoned when the package retires. */
CREATE TABLE domain.package_migrations (
  migration_id    uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL,
  from_version    int  NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  functions       text[] NOT NULL DEFAULT '{}',
  conflict        boolean NOT NULL DEFAULT false,
  findings        jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan            text NOT NULL CHECK (length(btrim(plan)) >= 8),
  state           text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'completed', 'abandoned')),
  item_id         uuid,
  opened_by       uuid NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  to_version      int,
  closed_by       uuid,
  closed_at       timestamptz,
  close_reason    text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT dpk_mig_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_mig_closed CHECK ((state = 'open') = (closed_at IS NULL) AND (closed_at IS NULL) = (closed_by IS NULL) AND (closed_at IS NULL) = (close_reason IS NULL))
);
CREATE INDEX dpk_mig_package ON domain.package_migrations (package_id, state);

/* THE LEDGER of every governed act of the framework (append-only; the package's own events — nothing is added to a pinned ledger). */
CREATE TABLE domain.package_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL,
  subject_kind    text NOT NULL CHECK (subject_kind IN ('package', 'version', 'section', 'run', 'migration', 'assessment', 'watchlist', 'event', 'alert', 'link')),
  subject_id      uuid NOT NULL,
  version         int,
  event           text NOT NULL CHECK (event ~ '^[a-z_]+\.[a-z_.]+$'),
  actor_principal_id uuid NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT dpk_ev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dpk_ev_package ON domain.package_events (package_id, occurred_at);
CREATE INDEX dpk_ev_subject ON domain.package_events (subject_id, occurred_at);
CREATE TRIGGER dpk_ev_append_only BEFORE UPDATE OR DELETE ON domain.package_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE ASSESSMENTS (PR-31-002 assessment; UX-36-003 assess/replay): versioned; each version names its template (of the package's active
   manifest), the subject ENTITIES (graph entities of the domain), the statement, a confidence, the EVIDENCE it cites (canonical EVD objects
   at their digests) and the SOURCE DIVERSITY measured over them (distinct publishers and contracts; correlated and single-origin sources
   flagged). proposed (a human or the agent) → approved (material: a named analyst or the package's specialist, never the proposer or an
   agent) | rejected; approved below the template's diversity threshold → LIMITED (never presented as complete); approved → limited (a
   challenge, stale coverage) → superseded by a later approved version. A DAS object per approved/limited version. As-of REPLAY by the
   instants recorded (decided_at, limited_at, superseded_at). */
CREATE TABLE domain.assessments (
  assessment_id     uuid NOT NULL,
  version           int  NOT NULL CHECK (version >= 1),
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  package_id        uuid NOT NULL,
  package_key       text NOT NULL,
  package_version   int  NOT NULL,
  template          text NOT NULL CHECK (template ~ '^[a-z][a-z0-9_.-]{1,62}$'),
  subject_entities  uuid[] NOT NULL CHECK (cardinality(subject_entities) BETWEEN 1 AND 50),
  statement         text NOT NULL CHECK (length(btrim(statement)) BETWEEN 8 AND 4000),
  confidence        numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence          jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) BETWEEN 1 AND 100),
  source_diversity  jsonb NOT NULL CHECK (jsonb_typeof(source_diversity) = 'object'),
  material          boolean NOT NULL,
  state             text NOT NULL CHECK (state IN ('proposed', 'approved', 'rejected', 'limited', 'superseded')),
  limited_reason    text,
  proposed_by       uuid NOT NULL,
  proposed_by_kind  text NOT NULL,
  proposed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_note     text,
  limited_at        timestamptz,
  superseded_at     timestamptz,
  object_version    int,
  correlation_id    uuid NOT NULL,
  PRIMARY KEY (assessment_id, version),
  CONSTRAINT dpk_as_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_as_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT dpk_as_limited CHECK (state <> 'limited' OR (limited_reason IS NOT NULL AND limited_at IS NOT NULL)),
  CONSTRAINT dpk_as_object CHECK (state NOT IN ('approved', 'limited') OR object_version IS NOT NULL),
  CONSTRAINT dpk_as_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);
CREATE UNIQUE INDEX dpk_as_one_standing ON domain.assessments (assessment_id) WHERE state IN ('approved', 'limited');
CREATE UNIQUE INDEX dpk_as_one_open ON domain.assessments (assessment_id) WHERE state = 'proposed';
CREATE INDEX dpk_as_package ON domain.assessments (package_id, state);

/* THE WATCHLISTS (PR-31-002 watchlist; UX-36-003 alert): versioned; the entities and indicators watched, the RULES an approved assessment or a
   confirmed event is matched against, the coverage freshness, the OWNER (the named human the alert is routed to). */
CREATE TABLE domain.watchlists (
  watchlist_id       uuid NOT NULL,
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_id         uuid NOT NULL,
  package_key        text NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  owner_principal_id uuid NOT NULL,
  entities           uuid[] NOT NULL DEFAULT '{}',
  indicators         text[] NOT NULL DEFAULT '{}',
  rules              jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) BETWEEN 1 AND 20),
  freshness_days     int  NOT NULL CHECK (freshness_days BETWEEN 1 AND 3660),
  state              text NOT NULL CHECK (state IN ('active', 'superseded', 'retired')),
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at      timestamptz,
  retired_at         timestamptz,
  retire_reason      text,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (watchlist_id, version),
  CONSTRAINT dpk_wl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_wl_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retire_reason IS NULL))
);
CREATE UNIQUE INDEX dpk_wl_one_current ON domain.watchlists (watchlist_id) WHERE state IN ('active', 'retired');
CREATE INDEX dpk_wl_package ON domain.watchlists (package_id, state);

/* THE DOMAIN EVENTS (PR-31-002; a sanction listed, a campaign observed, a filing published …): proposed by a human or the agent with evidence,
   CONFIRMED by a named analyst or specialist (never the proposer); a confirmed event is matched against the watchlists. */
CREATE TABLE domain.events (
  event_id          uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  package_id        uuid NOT NULL,
  package_key       text NOT NULL,
  package_version   int  NOT NULL,
  kind              text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_.-]{1,62}$'),
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 300),
  subject_entities  uuid[] NOT NULL CHECK (cardinality(subject_entities) BETWEEN 1 AND 50),
  occurred_on       date NOT NULL,
  evidence          jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) BETWEEN 1 AND 100),
  state             text NOT NULL CHECK (state IN ('proposed', 'confirmed', 'rejected')),
  proposed_by       uuid NOT NULL,
  proposed_by_kind  text NOT NULL,
  proposed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_note     text,
  correlation_id    uuid NOT NULL,
  CONSTRAINT dpk_de_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_de_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT dpk_de_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);
CREATE INDEX dpk_de_package ON domain.events (package_id, state);

/* THE ALERTS (UX-36-003 alert): one per (watchlist, rule, cause). RAISED as a `domain.alert` attention item (subject_kind `watchlist`, subject =
   the watchlist, cause = the alert) under the domain's PUBLISHED policy with the watchlist's owner named; WITHHELD (listed, with the reason)
   when the package's `alert` function is not active; adjudicated true/false positive by a named human (the cyber package's false-positive
   analysis); resolved by the watchlist's owner (the items closed with the reason). */
CREATE TABLE domain.alerts (
  alert_id          uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  package_id        uuid NOT NULL,
  package_key       text NOT NULL,
  watchlist_id      uuid NOT NULL,
  watchlist_version int  NOT NULL,
  rule_key          text NOT NULL,
  cause_kind        text NOT NULL CHECK (cause_kind IN ('assessment', 'event')),
  cause_id          uuid NOT NULL,
  cause_version     int  NOT NULL,
  title             text NOT NULL,
  subject_entities  uuid[] NOT NULL,
  state             text NOT NULL CHECK (state IN ('raised', 'withheld', 'resolved')),
  withheld_reason   text,
  item_id           uuid,
  item_state        text,
  owner_principal_id uuid NOT NULL,
  adjudication      text CHECK (adjudication IS NULL OR adjudication IN ('true_positive', 'false_positive')),
  adjudicated_by    uuid,
  adjudicated_at    timestamptz,
  adjudication_note text,
  resolved_by       uuid,
  resolved_at       timestamptz,
  resolve_reason    text,
  raised_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT dpk_al_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_al_once UNIQUE (watchlist_id, rule_key, cause_kind, cause_id, cause_version),
  CONSTRAINT dpk_al_withheld CHECK (state <> 'withheld' OR withheld_reason IS NOT NULL),
  CONSTRAINT dpk_al_adjudicated CHECK ((adjudication IS NULL) = (adjudicated_by IS NULL) AND (adjudicated_by IS NULL) = (adjudicated_at IS NULL)),
  CONSTRAINT dpk_al_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL))
);
CREATE INDEX dpk_al_watchlist ON domain.alerts (watchlist_id, state);
CREATE INDEX dpk_al_package ON domain.alerts (package_id, raised_at DESC);

/* THE LINKS (PR-31-002 risk / opportunity / forecast / scenario): a package REFERENCES the core's objects, never forks them (PR-31-001):
   exposure → a B32 exposure (its category in the package's risk meaning), forecast → a B25 forecast (on a target the package declares),
   scenario → a B27 scenario, indicator → a prediction indicator (on a series the package declares). */
CREATE TABLE domain.package_links (
  link_id         uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL,
  package_key     text NOT NULL,
  assessment_id   uuid,
  link_kind       text NOT NULL CHECK (link_kind IN ('exposure', 'forecast', 'scenario', 'indicator')),
  target_id       uuid NOT NULL,
  note            text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 1000),
  state           text NOT NULL CHECK (state IN ('active', 'withdrawn')),
  linked_by       uuid NOT NULL,
  linked_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  withdrawn_by    uuid,
  withdrawn_at    timestamptz,
  withdraw_reason text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT dpk_ln_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_ln_withdrawn CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL) AND (withdrawn_at IS NULL) = (withdrawn_by IS NULL) AND (withdrawn_at IS NULL) = (withdraw_reason IS NULL))
);
CREATE UNIQUE INDEX dpk_ln_once ON domain.package_links (package_id, link_kind, target_id) WHERE state = 'active';

-- RLS and grants: the prelude's loop idiom (policy domain_isolation; SELECT to eye_app and eye_commit; no write grant — the definer ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['package_sections', 'package_conformance_runs', 'package_migrations', 'package_events', 'assessments', 'watchlists', 'events', 'alerts', 'package_links'] LOOP
    EXECUTE format('REVOKE ALL ON domain.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE domain.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE domain.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY domain_isolation ON domain.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON domain.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- the canonical write actions that admit the part's objects (the 0095 idiom): a package version's DPG (proposal, activation), an assessment's DAS
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('domain.package.version', ARRAY['DPG'], 'B33 §PK: proposing a domain package version admits its DPG object (the manifest, digested, state proposed) and nothing else'),
  ('domain.package.activate', ARRAY['DPG'], 'B33 §PK: activating a certified domain package version admits its DPG object (state active, the section approvals and the conformance run named) and nothing else'),
  ('domain.assessment.approve', ARRAY['DAS'], 'B33 §PK: approving a domain assessment version admits its DAS object (approved or limited, with its source diversity) and nothing else')
ON CONFLICT (action) DO NOTHING;

-- §PK.3 SHARED HELPERS (internal) ────────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal is the one recorded. */
CREATE OR REPLACE FUNCTION domain.dpk_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_assert_actor(text, uuid) FROM PUBLIC;

/* The kind of a principal (human, agent, workload, system), or NULL when not active. */
CREATE OR REPLACE FUNCTION domain.dpk_kind(p_principal uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT p.kind FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active'
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION domain.dpk_kind(uuid) FROM PUBLIC;

/* A named, active HUMAN of the tenant holding one of the roles in the domain (or at the tenant). */
CREATE OR REPLACE FUNCTION domain.dpk_human_with(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION domain.dpk_human_with(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* A principal (any kind) holding one of the roles in the domain. */
CREATE OR REPLACE FUNCTION domain.dpk_holds(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION domain.dpk_holds(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* THE GATE, consulted by every package-bound write: the prelude's seam domain.package_function_state; not active → `<noun> rejected (package)`. */
CREATE OR REPLACE FUNCTION domain.dpk_gate(p_tenant uuid, p_domain uuid, p_key text, p_function text, p_noun text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE s jsonb := domain.package_function_state(p_tenant, p_domain, p_key, p_function);
BEGIN
  IF s ->> 'state' <> 'active' THEN RAISE EXCEPTION '% rejected (package): %', p_noun, s ->> 'reason' USING ERRCODE = '22023'; END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_gate(uuid, uuid, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION domain.dpk_event(p_tenant uuid, p_domain uuid, p_package uuid, p_kind text, p_subject uuid, p_version int, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SET search_path = domain, pg_catalog, pg_temp AS $$
  INSERT INTO domain.package_events (event_id, scope, tenant_id, domain_id, package_id, subject_kind, subject_id, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package, p_kind, p_subject, p_version, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION domain.dpk_event(uuid, uuid, uuid, text, uuid, int, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The package of a key in this domain, locked for the act (unknown → 404; retired → 409). */
CREATE OR REPLACE FUNCTION domain.dpk_package(p_tenant uuid, p_domain uuid, p_package uuid, p_noun text, p_lock boolean DEFAULT true) RETURNS domain.packages
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE;
BEGIN
  IF p_lock THEN SELECT * INTO k FROM domain.packages x WHERE x.package_id = p_package AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  ELSE SELECT * INTO k FROM domain.packages x WHERE x.package_id = p_package AND x.tenant_id = p_tenant AND x.domain_id = p_domain; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_package): no package % in this domain', p_noun, p_package USING ERRCODE = '23503'; END IF;
  IF k.state = 'retired' THEN RAISE EXCEPTION '% rejected (state): package % is retired', p_noun, k.package_key USING ERRCODE = '22023'; END IF;
  RETURN k;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_package(uuid, uuid, uuid, text, boolean) FROM PUBLIC;

/* The ACTIVE version of a package key (the manifest a package-bound write reads its templates and rules from). */
CREATE OR REPLACE FUNCTION domain.dpk_active(p_tenant uuid, p_domain uuid, p_key text) RETURNS domain.package_versions
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT v.* FROM domain.package_versions v JOIN domain.packages k ON k.package_id = v.package_id
   WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.package_key = p_key AND k.state = 'declared' AND v.state = 'active'
$$;
REVOKE ALL ON FUNCTION domain.dpk_active(uuid, uuid, text) FROM PUBLIC;

/* THE MANIFEST'S FORM (PK1). A well-formed manifest is ADMITTED as a proposal; what it CLAIMS (that its types map onto the core, that its
   sources and models are approved, that its release is compatible …) is the conformance suite's to measure, so a non-conforming but
   well-formed manifest can be proposed and its findings shown. Refused `domain package rejected (manifest)`. */
CREATE OR REPLACE FUNCTION domain.dpk_assert_manifest(p_key text, p_semver text, m jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE e jsonb; bad text;
BEGIN
  bad := CASE
    WHEN m IS NULL OR jsonb_typeof(m) <> 'object' THEN 'the manifest is an object'
    WHEN jsonb_typeof(m -> 'release') <> 'object' OR (m #>> '{release,semver}') IS DISTINCT FROM p_semver THEN format('release.semver names the version''s semver (%s)', p_semver)
    WHEN jsonb_typeof(m -> 'ontology_extension') <> 'object' THEN 'ontology_extension is an object'
    WHEN (m #>> '{ontology_extension,namespace}') IS DISTINCT FROM ('pkg:' || p_key) THEN format('ontology_extension.namespace is pkg:%s (a package extends its own namespace)', p_key)
    WHEN jsonb_typeof(m #> '{ontology_extension,mappings}') <> 'array' OR jsonb_array_length(m #> '{ontology_extension,mappings}') = 0 THEN 'ontology_extension.mappings lists the package''s types and the core types they map onto'
    WHEN jsonb_typeof(m #> '{ontology_extension,predicates}') IS DISTINCT FROM 'array' THEN 'ontology_extension.predicates is a list'
    WHEN jsonb_typeof(m -> 'source_set') <> 'array' OR jsonb_array_length(m -> 'source_set') = 0 THEN 'source_set names at least one source'
    WHEN jsonb_typeof(m -> 'indicators') IS DISTINCT FROM 'array' THEN 'indicators is a list'
    WHEN jsonb_typeof(m -> 'models') IS DISTINCT FROM 'array' THEN 'models is a list'
    WHEN jsonb_typeof(m -> 'assessment_templates') <> 'array' OR jsonb_array_length(m -> 'assessment_templates') = 0 THEN 'assessment_templates names at least one template'
    WHEN jsonb_typeof(m -> 'watchlist_templates') IS DISTINCT FROM 'array' THEN 'watchlist_templates is a list'
    WHEN jsonb_typeof(m -> 'controls') <> 'object' THEN 'controls is an object'
    WHEN jsonb_typeof(m #> '{controls,purposes}') <> 'array' OR jsonb_array_length(m #> '{controls,purposes}') = 0 THEN 'controls.purposes names the package''s use boundary'
    WHEN coalesce(m #>> '{controls,classification_ceiling}', '') NOT IN ('public', 'internal', 'confidential', 'restricted') THEN 'controls.classification_ceiling is public, internal, confidential or restricted'
    WHEN jsonb_typeof(m -> 'risk_meaning') IS DISTINCT FROM 'array' THEN 'risk_meaning is a list (category mappings onto the domain''s risk taxonomy)'
  END;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'domain package rejected (manifest): %', bad USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(m #> '{ontology_extension,mappings}') LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'type', '') !~ '^[a-z][a-z0-9_]{1,40}$' OR coalesce(e ->> 'maps_to', '') = '' THEN
      RAISE EXCEPTION 'domain package rejected (manifest): every mapping is {type, maps_to} (got %)', left(e::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(m -> 'source_set') LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'source_key', '') = '' OR jsonb_typeof(e -> 'purposes') <> 'array' OR jsonb_array_length(e -> 'purposes') = 0 THEN
      RAISE EXCEPTION 'domain package rejected (manifest): every source names its source_key and the purposes it is used for (got %)', left(e::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(m -> 'models') LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'kind', '') NOT IN ('forecast', 'behaviour') OR coalesce(e ->> 'ref', '') = '' THEN
      RAISE EXCEPTION 'domain package rejected (manifest): every model is {kind: forecast|behaviour, ref} (got %)', left(e::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(m -> 'assessment_templates') LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'key', '') !~ '^[a-z][a-z0-9_.-]{1,62}$' THEN
      RAISE EXCEPTION 'domain package rejected (manifest): every assessment template has a key (got %)', left(e::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_assert_manifest(text, text, jsonb) FROM PUBLIC;

/* The EVIDENCE a write cites: each {kind:'evidence', id, version, digest} an EVD object of the domain at that version and content digest. */
CREATE OR REPLACE FUNCTION domain.dpk_assert_evidence(p_noun text, p_tenant uuid, p_domain uuid, p_evidence jsonb) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = domain, objects, pg_catalog, pg_temp AS $$
DECLARE c jsonb;
BEGIN
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' OR jsonb_array_length(p_evidence) = 0 THEN
    RAISE EXCEPTION '% rejected (evidence): it cites at least one evidence object', p_noun USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_evidence) LOOP
    IF jsonb_typeof(c) <> 'object' OR c ->> 'kind' IS DISTINCT FROM 'evidence' OR coalesce(c ->> 'id', '') !~ '^[0-9a-f-]{36}$'
       OR jsonb_typeof(c -> 'version') <> 'number' OR coalesce(c ->> 'digest', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION '% rejected (evidence): a citation is {kind: evidence, id, version, digest} (got %)', p_noun, left(c::text, 200) USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::bigint
                     AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.content_digest = c ->> 'digest') THEN
      RAISE EXCEPTION '% rejected (unknown_evidence): no evidence %@% at that digest in this domain', p_noun, c ->> 'id', c ->> 'version' USING ERRCODE = '23503';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_assert_evidence(text, uuid, uuid, jsonb) FROM PUBLIC;

/* The subject ENTITIES of a write: active graph entities of the domain (a mistaken or retired identity is refused here). */
CREATE OR REPLACE FUNCTION domain.dpk_assert_entities(p_noun text, p_tenant uuid, p_domain uuid, p_entities uuid[]) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = domain, graph, pg_catalog, pg_temp AS $$
DECLARE e uuid;
BEGIN
  IF p_entities IS NULL OR cardinality(p_entities) = 0 THEN RAISE EXCEPTION '% rejected (subjects): it names at least one subject entity', p_noun USING ERRCODE = '22023'; END IF;
  FOREACH e IN ARRAY p_entities LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.entities_current x WHERE x.entity_id = e AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.lifecycle_state = 'active') THEN
      RAISE EXCEPTION '% rejected (unknown_entity): % is not an active entity of this domain', p_noun, e USING ERRCODE = '23503';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_assert_entities(text, uuid, uuid, uuid[]) FROM PUBLIC;

/* SOURCE DIVERSITY over cited evidence (CAP-FW-09 evidence diversity; PR-29-005 correlated sources): each evidence's source contract
   (EVD provenance SRC:<id>@<v>), its publisher and data origin; distinct publishers and contracts; CORRELATED when two contracts share a
   publisher; SINGLE-ORIGIN when one publisher carries all; `meets` against the threshold (distinct publishers ≥ p_min). INVOKER (read). */
CREATE OR REPLACE FUNCTION domain.dpk_source_diversity(p_tenant uuid, p_domain uuid, p_evidence jsonb, p_min int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, objects, observation, pg_catalog, pg_temp AS $$
  WITH cited AS (
    SELECT (c ->> 'id')::uuid AS id, (c ->> 'version')::bigint AS v FROM jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) c
     WHERE c ->> 'kind' = 'evidence' AND coalesce(c ->> 'id', '') ~ '^[0-9a-f-]{36}$'
  ), src AS (
    SELECT ci.id, substring(o.provenance_ref from '^SRC:([0-9a-f-]{36})')::uuid AS source_id
      FROM cited ci JOIN objects.canonical_objects o ON o.object_id = ci.id AND o.object_version = ci.v AND o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain
  ), cont AS (
    SELECT s.id, s.source_id, c.source_key, c.publisher, c.data_origin
      FROM src s LEFT JOIN LATERAL (SELECT x.source_key, x.publisher, x.data_origin FROM observation.source_contracts_current x
                                     WHERE x.source_id = s.source_id AND x.tenant_id = p_tenant ORDER BY x.contract_version DESC LIMIT 1) c ON true
  ), agg AS (
    SELECT count(*)::int AS evidence, count(DISTINCT source_id)::int AS contracts, count(DISTINCT publisher)::int AS publishers,
           coalesce(jsonb_agg(DISTINCT jsonb_build_object('source_key', source_key, 'publisher', publisher, 'data_origin', data_origin)) FILTER (WHERE source_key IS NOT NULL), '[]'::jsonb) AS sources,
           count(*) FILTER (WHERE source_key IS NULL)::int AS unattributed
      FROM cont
  ), corr AS (
    SELECT coalesce(jsonb_agg(publisher ORDER BY publisher), '[]'::jsonb) AS correlated FROM (SELECT publisher FROM cont WHERE publisher IS NOT NULL GROUP BY publisher HAVING count(DISTINCT source_id) > 1) z
  )
  SELECT jsonb_build_object('evidence', a.evidence, 'contracts', a.contracts, 'publishers', a.publishers, 'sources', a.sources, 'unattributed', a.unattributed,
                            'correlated_publishers', c.correlated, 'single_origin', a.publishers <= 1, 'threshold', greatest(coalesce(p_min, 1), 1),
                            'meets', a.publishers >= greatest(coalesce(p_min, 1), 1) AND a.unattributed = 0)
    FROM agg a, corr c
$$;
GRANT EXECUTE ON FUNCTION domain.dpk_source_diversity(uuid, uuid, jsonb, int) TO eye_app, eye_commit;

-- §PK.4 THE PACKAGE PORTS (PK1, PK2) ─────────────────────────────────────────────────────────────────────────────────────────
/* DECLARE a package (domain.package.declare): its key, kind, title and OWNER (a named, active human of the tenant). */
CREATE OR REPLACE FUNCTION domain.declare_package(p_package uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_title text, p_owner uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, decision, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'domain package rejected (actor): a package is declared by a named human' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9-]{1,40}$' THEN RAISE EXCEPTION 'domain package rejected (key): a package key is lower-case letters, digits and dashes (2–41 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_kind, '') NOT IN ('competitor', 'supply_chain', 'geopolitical', 'technology', 'cyber', 'financial') THEN
    RAISE EXCEPTION 'domain package rejected (kind): the kind is competitor, supply_chain, geopolitical, technology, cyber or financial' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'domain package rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN
    RAISE EXCEPTION 'domain package rejected (owner): the owner is a named, active human of the tenant' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO k FROM domain.packages x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.package_key = p_key;
  IF FOUND THEN RAISE EXCEPTION 'domain package rejected (duplicate): package % is already declared in this domain (%)', p_key, k.state USING ERRCODE = '23505'; END IF;
  INSERT INTO domain.packages (package_id, scope, tenant_id, domain_id, package_key, domain_kind, title, owner_principal_id, created_by, correlation_id)
  VALUES (p_package, 'DOMAIN', p_tenant, p_domain, p_key, p_kind, btrim(p_title), p_owner, p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'package', p_package, NULL, 'package.declared', p_actor,
                           jsonb_build_object('package_key', p_key, 'domain_kind', p_kind, 'owner', p_owner, 'boundary', 'in-tenant package; signing → B77, all-layer namespaces → B78, marketplace → B112'), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.packages x WHERE x.package_id = p_package);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.declare_package(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.declare_package(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid) TO eye_commit;

/* PROPOSE a version (domain.package.version): the owner (a named human) proposes the next version's MANIFEST at a semver; the digest is the
   port's; the DPG object (state proposed) is admitted beside it in the same write (p_object_version names it, checked here). A proposal while
   another is open (proposed or certified, not yet active) is refused — one version moves through certification at a time. The certification
   pending is routed as a `domain.package` item (subject = the package) to the specialists under the published policy. */
CREATE OR REPLACE FUNCTION domain.propose_package_version(p_package uuid, p_tenant uuid, p_domain uuid, p_semver text, p_manifest jsonb, p_object_version int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v_next int; o domain.package_versions%ROWTYPE; v_digest text; v_item jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.version']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  IF p_actor <> k.owner_principal_id THEN RAISE EXCEPTION 'domain package rejected (ownership): a version of % is proposed by its owner', k.package_key USING ERRCODE = '42501'; END IF;
  IF coalesce(p_semver, '') !~ '^[0-9]+\.[0-9]+\.[0-9]+$' THEN RAISE EXCEPTION 'domain package rejected (semver): the version is x.y.z' USING ERRCODE = '22023'; END IF;
  PERFORM domain.dpk_assert_manifest(k.package_key, p_semver, p_manifest);
  SELECT * INTO o FROM domain.package_versions x WHERE x.package_id = p_package AND x.state IN ('proposed', 'certified') ORDER BY x.version DESC LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'domain package rejected (state): version % (%) of % is still open; it is certified and activated, or retired, before the next', o.version, o.state, k.package_key USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM domain.package_versions x WHERE x.package_id = p_package AND x.semver = p_semver) THEN
    RAISE EXCEPTION 'domain package rejected (duplicate): % % is already a version of the package', k.package_key, p_semver USING ERRCODE = '23505';
  END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_next FROM domain.package_versions x WHERE x.package_id = p_package;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_type = 'DPG' AND c.object_id = p_package AND c.object_version = p_object_version AND c.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'domain package rejected (object): the DPG object version % of the package was not admitted in this write', p_object_version USING ERRCODE = '22023';
  END IF;
  v_digest := domain.dpk_manifest_digest(p_manifest);
  INSERT INTO domain.package_versions (package_id, version, scope, tenant_id, domain_id, semver, manifest, manifest_digest, object_version, proposed_by, correlation_id)
  VALUES (p_package, v_next, 'DOMAIN', p_tenant, p_domain, p_semver, p_manifest, v_digest, p_object_version, p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, v_next, 'version.proposed', p_actor,
                           jsonb_build_object('semver', p_semver, 'manifest_digest', v_digest, 'object_version', p_object_version,
                                              'sections', (SELECT jsonb_object_agg(s, domain.dpk_section_digest(p_manifest, s)) FROM unnest(domain.dpk_sections()) s)), p_correlation);
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'domain.package', 'domain_package', p_package,
              format('Package %s %s awaits certification (five sections, the conformance run)', k.package_key, p_semver),
              jsonb_build_array(format('version %s proposed by the owner; a domain specialist approves each section at its digest and certifies after a passing conformance run', v_next)),
              k.owner_principal_id, gen_random_uuid(), 'domain.package.version_proposed',
              jsonb_build_object('package_id', p_package, 'package_key', k.package_key, 'version', v_next, 'semver', p_semver, 'pending', 'certification'), NULL, p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('item', v_item) FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = v_next);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.propose_package_version(uuid,uuid,uuid,text,jsonb,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.propose_package_version(uuid,uuid,uuid,text,jsonb,int,uuid,uuid) TO eye_commit;

/* APPROVE (or reject) a SECTION (domain.package.approve, human-gated): a named domain_specialist of the domain, never the version's proposer and
   never an agent, decides ONE section AT THE DIGEST it read (a stale digest is refused), with a reason and an expiry (1–730 days). The
   ONTOLOGY section is the second key: it is approved only when the graph's own gate has an ACTIVE ontology version of namespace pkg:<key>
   (decided by the ontology steward, graph.decide_ontology_proposal) whose entity types are the core types the manifest maps onto and whose
   predicates are the manifest's — the version is named on the approval. */
CREATE OR REPLACE FUNCTION domain.approve_package_section(p_approval uuid, p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_section text, p_digest text,
                                                          p_decision text, p_reason text, p_valid_days int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, graph, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; v_expected text; ont graph.ontology_versions%ROWTYPE; v_types text[]; v_preds text[]; v_ont uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'domain package rejected (actor): a section is certified by a named human domain specialist; an agent or a system never certifies' USING ERRCODE = '42501';
  END IF;
  IF NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_specialist']) THEN
    RAISE EXCEPTION 'domain package rejected (authority): the acting human is not a domain specialist of this domain' USING ERRCODE = '42501';
  END IF;
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.proposed_by = p_actor THEN RAISE EXCEPTION 'domain package rejected (separation_of_duties): the proposer of version % does not certify its sections', p_version USING ERRCODE = '42501'; END IF;
  IF v.state <> 'proposed' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %; sections are decided while it is proposed', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF NOT (coalesce(p_section, '') = ANY (domain.dpk_sections())) THEN
    RAISE EXCEPTION 'domain package rejected (section): the section is one of %', array_to_string(domain.dpk_sections(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'domain package rejected (decision): the decision is approved or rejected' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a section decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_valid_days IS NULL OR p_valid_days NOT BETWEEN 1 AND 730 THEN RAISE EXCEPTION 'domain package rejected (expiry): an approval holds for 1–730 days' USING ERRCODE = '22023'; END IF;
  v_expected := domain.dpk_section_digest(v.manifest, p_section);
  IF p_digest IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'domain package rejected (stale): the % section of version % is at digest %…, not the one decided (%…)', p_section, p_version, left(v_expected, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  IF p_section = 'ontology' AND p_decision = 'approved' THEN
    SELECT * INTO ont FROM graph.ontology_versions o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.namespace = v.manifest #>> '{ontology_extension,namespace}' AND o.state = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'domain package rejected (ontology): namespace % has no active ontology version — the ontology steward decides its proposal (graph.ontology.propose / graph.ontology.decide) before the section is certified', v.manifest #>> '{ontology_extension,namespace}' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT m ->> 'maps_to' ORDER BY m ->> 'maps_to'), '{}') INTO v_types FROM jsonb_array_elements(v.manifest #> '{ontology_extension,mappings}') m;
    SELECT coalesce(array_agg(DISTINCT p ->> 'predicate' ORDER BY p ->> 'predicate'), '{}') INTO v_preds FROM jsonb_array_elements(v.manifest #> '{ontology_extension,predicates}') p;
    IF NOT (ont.entity_types @> v_types AND v_types @> ont.entity_types)
       OR NOT ((SELECT coalesce(array_agg(DISTINCT p ->> 'predicate'), '{}') FROM jsonb_array_elements(ont.predicates) p) @> v_preds
               AND v_preds @> (SELECT coalesce(array_agg(DISTINCT p ->> 'predicate'), '{}') FROM jsonb_array_elements(ont.predicates) p)) THEN
      RAISE EXCEPTION 'domain package rejected (ontology): the active ontology version % of % (types %, predicates %) is not the manifest''s extension (types %, predicates %)',
        ont.version, ont.namespace, ont.entity_types, (SELECT array_agg(p ->> 'predicate') FROM jsonb_array_elements(ont.predicates) p), v_types, v_preds USING ERRCODE = '22023';
    END IF;
    v_ont := ont.version_id;
  END IF;
  INSERT INTO domain.package_sections (approval_id, scope, tenant_id, domain_id, package_id, version, section, section_digest, decision, reason, ontology_version_id, approver_principal_id, expires_at, correlation_id)
  VALUES (p_approval, 'DOMAIN', p_tenant, p_domain, p_package, p_version, p_section, v_expected, p_decision, btrim(p_reason), v_ont, p_actor, clock_timestamp() + make_interval(days => p_valid_days), p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'section', p_approval, p_version, 'section.' || p_decision, p_actor,
                           jsonb_build_object('section', p_section, 'digest', v_expected, 'ontology_version_id', v_ont, 'valid_days', p_valid_days), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.package_sections x WHERE x.approval_id = p_approval);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.approve_package_section(uuid,uuid,uuid,uuid,int,text,text,text,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.approve_package_section(uuid,uuid,uuid,uuid,int,text,text,text,text,int,uuid,uuid) TO eye_commit;

/* The standing section decisions of a version: per section, the latest decision at the version's CURRENT digest, and whether it holds now. */
CREATE OR REPLACE FUNCTION domain.dpk_section_state(p_package uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(s.section, CASE WHEN d.approval_id IS NULL THEN jsonb_build_object('state', 'open', 'digest', s.digest)
                                               ELSE jsonb_build_object('state', CASE WHEN d.decision = 'approved' AND d.expires_at <= clock_timestamp() THEN 'expired' ELSE d.decision END,
                                                                       'digest', s.digest, 'approver', d.approver_principal_id, 'decided_at', d.decided_at, 'expires_at', d.expires_at,
                                                                       'reason', d.reason, 'ontology_version_id', d.ontology_version_id, 'approval_id', d.approval_id) END), '{}'::jsonb)
    FROM (SELECT sec AS section, domain.dpk_section_digest(v.manifest, sec) AS digest FROM domain.package_versions v, unnest(domain.dpk_sections()) sec
           WHERE v.package_id = p_package AND v.version = p_version) s
    LEFT JOIN LATERAL (SELECT * FROM domain.package_sections x WHERE x.package_id = p_package AND x.version = p_version AND x.section = s.section AND x.section_digest = s.digest
                        ORDER BY x.decided_at DESC, x.approval_id DESC LIMIT 1) d ON true
$$;
GRANT EXECUTE ON FUNCTION domain.dpk_section_state(uuid, int) TO eye_app, eye_commit;

/* RECORD a run (domain.package.conformance / domain.package.acceptance): the suite the TS service computed from the facts it read, bound to
   the version's manifest digest. An AGENT's run is DIAGNOSTIC (it never certifies — the port says so); a certification run is a named human's
   (the owner, a specialist, an analyst, the administrator). The verdict is the port's: every blocking check passed. */
CREATE OR REPLACE FUNCTION domain.record_package_run(p_run uuid, p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_mode text, p_suite_version text, p_checks jsonb,
                                                     p_facts_digest text, p_facts_read_at timestamptz, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; v_kind text := domain.dpk_kind(p_actor); c jsonb; v_passed boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.conformance', 'domain.package.acceptance']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('package conformance', p_actor);
  IF (public.eye_bound_action() = 'domain.package.conformance' AND p_mode NOT IN ('certification', 'diagnostic'))
     OR (public.eye_bound_action() = 'domain.package.acceptance' AND p_mode <> 'acceptance') THEN
    RAISE EXCEPTION 'package conformance rejected (mode): the route % records % runs only', public.eye_bound_action(),
      CASE public.eye_bound_action() WHEN 'domain.package.acceptance' THEN 'acceptance' ELSE 'certification or diagnostic' END USING ERRCODE = '22023';
  END IF;
  IF v_kind IS DISTINCT FROM 'human' AND p_mode <> 'diagnostic' THEN
    RAISE EXCEPTION 'package conformance rejected (actor): an agent''s run is diagnostic — it never certifies and never records acceptance' USING ERRCODE = '42501';
  END IF;
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'package conformance', false);
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'package conformance rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state IN ('superseded', 'retired') THEN RAISE EXCEPTION 'package conformance rejected (state): version % is %', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_mode = 'certification' AND v.state <> 'proposed' THEN
    RAISE EXCEPTION 'package conformance rejected (state): a certification run is on a proposed version (version % is %)', p_version, v.state USING ERRCODE = '22023';
  END IF;
  IF p_mode = 'acceptance' AND v.state <> 'active' THEN
    RAISE EXCEPTION 'package conformance rejected (state): the acceptance focus is measured on the active version (version % is %)', p_version, v.state USING ERRCODE = '22023';
  END IF;
  IF p_checks IS NULL OR jsonb_typeof(p_checks) <> 'array' OR jsonb_array_length(p_checks) = 0 THEN
    RAISE EXCEPTION 'package conformance rejected (checks): a run records its checks' USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_checks) LOOP
    IF jsonb_typeof(c) <> 'object' OR coalesce(c ->> 'check', '') = '' OR jsonb_typeof(c -> 'passed') <> 'boolean' OR coalesce(c ->> 'severity', '') NOT IN ('blocking', 'advisory')
       OR jsonb_typeof(c -> 'findings') <> 'array' THEN
      RAISE EXCEPTION 'package conformance rejected (checks): every check is {check, passed, severity: blocking|advisory, findings[]} (got %)', left(c::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(p_facts_digest, '') !~ '^[0-9a-f]{64}$' OR p_facts_read_at IS NULL OR p_facts_read_at > clock_timestamp() THEN
    RAISE EXCEPTION 'package conformance rejected (facts): a run names the digest and the instant of the facts it read' USING ERRCODE = '22023';
  END IF;
  SELECT bool_and((x ->> 'passed')::boolean) INTO v_passed FROM jsonb_array_elements(p_checks) x WHERE x ->> 'severity' = 'blocking';
  INSERT INTO domain.package_conformance_runs (run_id, scope, tenant_id, domain_id, package_id, version, manifest_digest, mode, suite_version, checks, passed, facts_digest, facts_read_at, run_by, run_by_kind, correlation_id)
  VALUES (p_run, 'DOMAIN', p_tenant, p_domain, p_package, p_version, v.manifest_digest, p_mode, p_suite_version, p_checks, coalesce(v_passed, true), p_facts_digest, p_facts_read_at, p_actor, coalesce(v_kind, 'system'), p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'run', p_run, p_version, 'run.' || p_mode, p_actor,
                           jsonb_build_object('passed', coalesce(v_passed, true), 'suite_version', p_suite_version,
                                              'failed', (SELECT coalesce(jsonb_agg(x ->> 'check'), '[]'::jsonb) FROM jsonb_array_elements(p_checks) x WHERE NOT (x ->> 'passed')::boolean)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.package_conformance_runs x WHERE x.run_id = p_run);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.record_package_run(uuid,uuid,uuid,uuid,int,text,text,jsonb,text,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.record_package_run(uuid,uuid,uuid,uuid,int,text,text,jsonb,text,timestamptz,uuid,uuid) TO eye_commit;

/* CERTIFY (domain.package.certify, human-gated): a named domain specialist, never the proposer, certifies a PROPOSED version when every section
   is approved at its current digest and unexpired AND the LAST certification run on this manifest passed. The certification-pending item of
   the package is closed by this act. */
CREATE OR REPLACE FUNCTION domain.certify_package_version(p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; s jsonb; r domain.package_conformance_runs%ROWTYPE; v_open text[]; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.certify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_specialist']) THEN
    RAISE EXCEPTION 'domain package rejected (authority): a version is certified by a named human domain specialist of this domain' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a certification states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.proposed_by = p_actor THEN RAISE EXCEPTION 'domain package rejected (separation_of_duties): the proposer of version % does not certify it', p_version USING ERRCODE = '42501'; END IF;
  IF v.state <> 'proposed' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %; a proposed version is certified', p_version, v.state USING ERRCODE = '22023'; END IF;
  s := domain.dpk_section_state(p_package, p_version);
  SELECT coalesce(array_agg(key || '=' || (value ->> 'state') ORDER BY key), '{}') INTO v_open FROM jsonb_each(s) WHERE value ->> 'state' <> 'approved';
  IF cardinality(v_open) > 0 THEN
    RAISE EXCEPTION 'domain package rejected (sections): every section is approved at its digest and unexpired before certification (%)', array_to_string(v_open, ', ') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM domain.package_conformance_runs x WHERE x.package_id = p_package AND x.version = p_version AND x.mode = 'certification' ORDER BY x.ran_at DESC, x.run_id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (conformance): version % has no certification run; the conformance suite runs first', p_version USING ERRCODE = '22023'; END IF;
  IF NOT r.passed OR r.manifest_digest <> v.manifest_digest THEN
    RAISE EXCEPTION 'domain package rejected (conformance): the last certification run of version % (%) did not pass (failed: %)', p_version, r.run_id,
      (SELECT string_agg(x ->> 'check', ', ') FROM jsonb_array_elements(r.checks) x WHERE x ->> 'severity' = 'blocking' AND NOT (x ->> 'passed')::boolean) USING ERRCODE = '22023';
  END IF;
  UPDATE domain.package_versions SET state = 'certified', certified_by = p_actor, certified_at = clock_timestamp() WHERE package_id = p_package AND version = p_version;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'domain.package', 'domain_package', p_package, format('version %s (%s) certified: %s', p_version, v.semver, btrim(p_reason)), p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'version.certified', p_actor,
                           jsonb_build_object('reason', btrim(p_reason), 'run_id', r.run_id, 'sections', s, 'closed_items', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('closed_items', v_closed, 'run_id', r.run_id) FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.certify_package_version(uuid,uuid,uuid,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.certify_package_version(uuid,uuid,uuid,int,text,uuid,uuid) TO eye_commit;

/* ACTIVATE (domain.package.activate, human-gated): the package OWNER activates a CERTIFIED version whose section approvals still hold; the
   prior active version is superseded (its disabled functions and conflict stay recorded on it); the open migrations of the package are
   completed by this version; the DPG object (state active) is admitted in the same write (p_object_version names it). */
CREATE OR REPLACE FUNCTION domain.activate_package_version(p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_object_version int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; prior domain.package_versions%ROWTYPE; s jsonb; v_lapsed text[]; m record; v_closed jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.activate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  IF p_actor <> k.owner_principal_id OR domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'domain package rejected (ownership): % is activated by its owner (a named human)', k.package_key USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state <> 'certified' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %; a certified version is activated', p_version, v.state USING ERRCODE = '22023'; END IF;
  s := domain.dpk_section_state(p_package, p_version);
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO v_lapsed FROM jsonb_each(s) WHERE value ->> 'state' <> 'approved';
  IF cardinality(v_lapsed) > 0 THEN
    RAISE EXCEPTION 'domain package rejected (stale): the approval of section(s) % of version % no longer holds; a new version is proposed and certified', array_to_string(v_lapsed, ', '), p_version USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_type = 'DPG' AND c.object_id = p_package AND c.object_version = p_object_version AND c.tenant_id = p_tenant
                    AND c.payload ->> 'state' = 'active' AND (c.payload ->> 'version')::int = p_version) THEN
    RAISE EXCEPTION 'domain package rejected (object): the DPG object version % (state active, version %) was not admitted in this write', p_object_version, p_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO prior FROM domain.package_versions x WHERE x.package_id = p_package AND x.state = 'active' FOR UPDATE;
  IF FOUND THEN
    UPDATE domain.package_versions SET state = 'superseded', superseded_at = clock_timestamp() WHERE package_id = p_package AND version = prior.version;
    PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, prior.version, 'version.superseded', p_actor, jsonb_build_object('by', p_version), p_correlation);
  END IF;
  UPDATE domain.package_versions SET state = 'active', activated_by = p_actor, activated_at = clock_timestamp(), object_version = p_object_version WHERE package_id = p_package AND version = p_version;
  FOR m IN SELECT * FROM domain.package_migrations x WHERE x.package_id = p_package AND x.state = 'open' FOR UPDATE LOOP
    UPDATE domain.package_migrations SET state = 'completed', to_version = p_version, closed_by = p_actor, closed_at = clock_timestamp(),
           close_reason = format('version %s (%s) activated in place of version %s', p_version, v.semver, m.from_version) WHERE migration_id = m.migration_id;
    v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, 'domain.package', 'domain_package', m.migration_id, format('migration completed by version %s (%s)', p_version, v.semver), p_actor, p_correlation);
    PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'migration', m.migration_id, p_version, 'migration.completed', p_actor, jsonb_build_object('to_version', p_version), p_correlation);
  END LOOP;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'version.activated', p_actor,
                           jsonb_build_object('supersedes', prior.version, 'object_version', p_object_version, 'closed_items', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('supersedes', prior.version, 'closed_items', v_closed) FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.activate_package_version(uuid,uuid,uuid,int,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.activate_package_version(uuid,uuid,uuid,int,int,uuid,uuid) TO eye_commit;

/* RETIRE the package (domain.package.retire, human-gated): its owner or the domain's administrator, with a reason (8+). Every open version is
   retired, open migrations abandoned, the package's items closed; what it recorded stays readable ("preserve accessible state"). */
CREATE OR REPLACE FUNCTION domain.retire_package(p_package uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; m record; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT (p_actor = k.owner_principal_id OR domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_admin'])) THEN
    RAISE EXCEPTION 'domain package rejected (ownership): % is retired by its owner or the domain''s administrator', k.package_key USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a retirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE domain.package_versions SET state = 'retired', retired_at = clock_timestamp() WHERE package_id = p_package AND state IN ('proposed', 'certified', 'active');
  v_closed := executive.b33_close_items(p_tenant, p_domain, NULL, 'domain_package', p_package, format('package %s retired: %s', k.package_key, btrim(p_reason)), p_actor, p_correlation);
  FOR m IN SELECT * FROM domain.package_migrations x WHERE x.package_id = p_package AND x.state = 'open' FOR UPDATE LOOP
    UPDATE domain.package_migrations SET state = 'abandoned', closed_by = p_actor, closed_at = clock_timestamp(), close_reason = format('package retired: %s', btrim(p_reason)) WHERE migration_id = m.migration_id;
    v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, NULL, 'domain_package', m.migration_id, format('package %s retired', k.package_key), p_actor, p_correlation);
  END LOOP;
  UPDATE domain.packages SET state = 'retired', retired_at = clock_timestamp(), retired_by = p_actor, retire_reason = btrim(p_reason) WHERE package_id = p_package;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'package', p_package, NULL, 'package.retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'closed_items', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('closed_items', v_closed) FROM domain.packages x WHERE x.package_id = p_package);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.retire_package(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.retire_package(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- §PK.5 HEALTH (PK4: PR-31-005, UX-36-005, WS-10 "disable incompatible domain packages") ───────────────────────────────────────
/* RECORD a health re-check of the ACTIVE version (domain.package.health — the owner, the specialists, the administrator, or the attention
   agent's after-tick hook `domain-package-health`): the faults the TS service evaluated from the facts it read. Each INCOMPATIBLE FUNCTION is
   added to disabled_functions with its reason and cause (never the whole package; reads keep working); a conflict is EXPOSED (state
   conflicted, the reason on every read). Nothing is re-enabled here — a passing re-run is recorded, and the specialist's approval
   (domain.enable_package_function) re-enables. A NEW disablement or conflict opens a MIGRATION record and routes it as `domain.package` (subject
   = the migration) to the owner and the policy's roles. A run is written when the findings changed since the last health run (a tick that
   finds the same thing again writes nothing). */
CREATE OR REPLACE FUNCTION domain.record_package_health(p_run uuid, p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_checks jsonb, p_disable jsonb, p_conflict jsonb,
                                                        p_facts_digest text, p_facts_read_at timestamptz, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; last domain.package_conformance_runs%ROWTYPE; fn text; v_new_fns text[] := '{}'; v_disabled jsonb;
        v_conflict jsonb; v_new_conflict boolean := false; v_passed boolean; v_mig uuid; v_item jsonb := NULL; v_reason text; c jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.health']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state <> 'active' THEN RAISE EXCEPTION 'domain package rejected (state): health is re-checked on the active version (version % is %)', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_checks IS NULL OR jsonb_typeof(p_checks) <> 'array' OR jsonb_array_length(p_checks) = 0 THEN RAISE EXCEPTION 'domain package rejected (checks): a health run records its checks' USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_checks) LOOP
    IF jsonb_typeof(c) <> 'object' OR coalesce(c ->> 'check', '') = '' OR jsonb_typeof(c -> 'passed') <> 'boolean' OR coalesce(c ->> 'severity', '') NOT IN ('blocking', 'advisory') OR jsonb_typeof(c -> 'findings') <> 'array' THEN
      RAISE EXCEPTION 'domain package rejected (checks): every check is {check, passed, severity, findings[]}' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_disable IS NULL OR jsonb_typeof(p_disable) <> 'object' THEN RAISE EXCEPTION 'domain package rejected (checks): the disabled functions are an object {function: {reason, cause}}' USING ERRCODE = '22023'; END IF;
  FOR fn IN SELECT jsonb_object_keys(p_disable) LOOP
    IF NOT (fn = ANY (domain.dpk_functions())) OR length(btrim(coalesce(p_disable -> fn ->> 'reason', ''))) < 8 THEN
      RAISE EXCEPTION 'domain package rejected (checks): % is not a package function, or its reason is missing (functions: %)', fn, array_to_string(domain.dpk_functions(), ', ') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_conflict IS NOT NULL AND (jsonb_typeof(p_conflict) <> 'object' OR length(btrim(coalesce(p_conflict ->> 'reason', ''))) < 8) THEN
    RAISE EXCEPTION 'domain package rejected (checks): a conflict is {reason (8+), functions?}' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO last FROM domain.package_conformance_runs x WHERE x.package_id = p_package AND x.version = p_version AND x.mode = 'health' ORDER BY x.ran_at DESC, x.run_id DESC LIMIT 1;
  SELECT coalesce(bool_and((x ->> 'passed')::boolean), true) INTO v_passed FROM jsonb_array_elements(p_checks) x WHERE x ->> 'severity' = 'blocking';
  -- the disablements and the conflict this run adds (nothing is removed here)
  v_disabled := v.disabled_functions;
  FOR fn IN SELECT jsonb_object_keys(p_disable) LOOP
    IF NOT (v_disabled ? fn) THEN
      v_disabled := v_disabled || jsonb_build_object(fn, (p_disable -> fn) || jsonb_build_object('disabled_at', clock_timestamp(), 'disabled_by', p_actor, 'run_id', p_run));
      v_new_fns := v_new_fns || fn;
    END IF;
  END LOOP;
  v_conflict := v.conflict;
  IF p_conflict IS NOT NULL AND v.conflict IS NULL THEN
    v_conflict := p_conflict || jsonb_build_object('exposed_at', clock_timestamp(), 'exposed_by', p_actor, 'run_id', p_run); v_new_conflict := true;
  END IF;
  IF last.run_id IS NOT NULL AND last.facts_digest = p_facts_digest AND cardinality(v_new_fns) = 0 AND NOT v_new_conflict THEN
    RETURN jsonb_build_object('recorded', false, 'unchanged_since', last.run_id, 'passed', last.passed, 'disabled_functions', v.disabled_functions, 'conflict', v.conflict);
  END IF;
  INSERT INTO domain.package_conformance_runs (run_id, scope, tenant_id, domain_id, package_id, version, manifest_digest, mode, suite_version, checks, passed, facts_digest, facts_read_at, run_by, run_by_kind, correlation_id)
  VALUES (p_run, 'DOMAIN', p_tenant, p_domain, p_package, p_version, v.manifest_digest, 'health', 'health/1',
          p_checks || jsonb_build_array(jsonb_build_object('check', 'faults', 'passed', p_disable = '{}'::jsonb AND p_conflict IS NULL, 'severity', 'blocking',
                                                           'findings', jsonb_build_array(jsonb_build_object('disable', p_disable, 'conflict', p_conflict)))),
          v_passed AND p_disable = '{}'::jsonb AND p_conflict IS NULL, p_facts_digest, p_facts_read_at, p_actor, coalesce(domain.dpk_kind(p_actor), 'system'), p_correlation);
  IF cardinality(v_new_fns) > 0 OR v_new_conflict THEN
    UPDATE domain.package_versions SET disabled_functions = v_disabled, conflict = v_conflict WHERE package_id = p_package AND version = p_version;
    v_reason := concat_ws('; ', CASE WHEN cardinality(v_new_fns) > 0 THEN format('function(s) %s disabled: %s', array_to_string(v_new_fns, ', '),
                                                                                (SELECT string_agg(f || ' — ' || (p_disable -> f ->> 'reason'), '; ') FROM unnest(v_new_fns) f)) END,
                                      CASE WHEN v_new_conflict THEN format('conflict exposed: %s', p_conflict ->> 'reason') END);
    v_mig := gen_random_uuid();
    INSERT INTO domain.package_migrations (migration_id, scope, tenant_id, domain_id, package_id, from_version, reason, functions, conflict, findings, plan, opened_by, correlation_id)
    VALUES (v_mig, 'DOMAIN', p_tenant, p_domain, p_package, p_version, v_reason, v_new_fns, v_new_conflict, p_checks,
            'the owner proposes a version that removes the incompatibility (it is certified and activated), or the cause is repaired, the health re-run passes and a domain specialist re-enables the function',
            p_actor, p_correlation);
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'domain.package', 'domain_package', v_mig,
                format('Package %s v%s: %s', k.package_key, p_version, left(v_reason, 400)),
                jsonb_build_array(v_reason, 'package governance and migration routed (PR-31-005)'), k.owner_principal_id, v_mig, 'domain.package.health',
                jsonb_build_object('package_id', p_package, 'package_key', k.package_key, 'version', p_version, 'migration_id', v_mig, 'functions', to_jsonb(v_new_fns), 'conflict', v_new_conflict),
                NULL, p_actor, p_correlation);
    UPDATE domain.package_migrations SET item_id = (v_item ->> 'item_id')::uuid WHERE migration_id = v_mig;
    PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'migration', v_mig, p_version, 'migration.opened', p_actor,
                             jsonb_build_object('reason', v_reason, 'functions', to_jsonb(v_new_fns), 'conflict', v_new_conflict, 'item', v_item), p_correlation);
    IF cardinality(v_new_fns) > 0 THEN
      PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'function.disabled', p_actor, jsonb_build_object('functions', to_jsonb(v_new_fns), 'disable', p_disable), p_correlation);
    END IF;
    IF v_new_conflict THEN PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'conflict.exposed', p_actor, jsonb_build_object('conflict', p_conflict), p_correlation); END IF;
  END IF;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'run', p_run, p_version, 'run.health', p_actor, jsonb_build_object('passed', v_passed AND p_disable = '{}'::jsonb AND p_conflict IS NULL), p_correlation);
  RETURN jsonb_build_object('recorded', true, 'run_id', p_run, 'passed', v_passed AND p_disable = '{}'::jsonb AND p_conflict IS NULL, 'newly_disabled', to_jsonb(v_new_fns),
                            'conflict_exposed', v_new_conflict, 'migration_id', v_mig, 'item', v_item, 'disabled_functions', v_disabled, 'conflict', v_conflict);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.record_package_health(uuid,uuid,uuid,uuid,int,jsonb,jsonb,jsonb,text,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.record_package_health(uuid,uuid,uuid,uuid,int,jsonb,jsonb,jsonb,text,timestamptz,uuid,uuid) TO eye_commit;

/* RE-ENABLE (domain.package.enable, human-gated): a named domain specialist re-enables disabled functions (and/or clears the conflict) ONLY when
   the LAST health run of the version — recorded after the disablement — PASSED for them (the cause is gone). When nothing stays disabled
   or conflicted, the open migrations are completed and their items closed. */
CREATE OR REPLACE FUNCTION domain.enable_package_function(p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_functions text[], p_clear_conflict boolean, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; last domain.package_conformance_runs%ROWTYPE; fn text; v_disabled jsonb; v_conflict jsonb; m record; v_closed jsonb := '[]'::jsonb;
        v_last_disable jsonb; v_last_conflict jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.enable']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_specialist']) THEN
    RAISE EXCEPTION 'domain package rejected (authority): a disabled function is re-enabled by a named human domain specialist' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a re-enablement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state <> 'active' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF coalesce(cardinality(p_functions), 0) = 0 AND NOT coalesce(p_clear_conflict, false) THEN
    RAISE EXCEPTION 'domain package rejected (functions): name the function(s) to re-enable or clear the conflict' USING ERRCODE = '22023';
  END IF;
  FOREACH fn IN ARRAY coalesce(p_functions, '{}') LOOP
    IF NOT (v.disabled_functions ? fn) THEN RAISE EXCEPTION 'domain package rejected (state): function % of version % is not disabled', fn, p_version USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF coalesce(p_clear_conflict, false) AND v.conflict IS NULL THEN RAISE EXCEPTION 'domain package rejected (state): version % carries no conflict', p_version USING ERRCODE = '22023'; END IF;
  SELECT * INTO last FROM domain.package_conformance_runs x WHERE x.package_id = p_package AND x.version = p_version AND x.mode = 'health' ORDER BY x.ran_at DESC, x.run_id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (health): no health run of version % is recorded; re-run the health check first', p_version USING ERRCODE = '22023'; END IF;
  SELECT f -> 'findings' -> 0 -> 'disable', f -> 'findings' -> 0 -> 'conflict' INTO v_last_disable, v_last_conflict FROM jsonb_array_elements(last.checks) f WHERE f ->> 'check' = 'faults';
  FOREACH fn IN ARRAY coalesce(p_functions, '{}') LOOP
    IF last.ran_at <= ((v.disabled_functions -> fn ->> 'disabled_at')::timestamptz) OR coalesce(v_last_disable, '{}'::jsonb) ? fn THEN
      RAISE EXCEPTION 'domain package rejected (health): the last health run (%) still finds function % incompatible, or ran before it was disabled — the cause is repaired and the re-run passes first', last.run_id, fn USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(p_clear_conflict, false) AND (last.ran_at <= (v.conflict ->> 'exposed_at')::timestamptz OR (v_last_conflict IS NOT NULL AND v_last_conflict <> 'null'::jsonb)) THEN
    RAISE EXCEPTION 'domain package rejected (health): the last health run (%) still finds the conflict, or ran before it was exposed', last.run_id USING ERRCODE = '22023';
  END IF;
  v_disabled := v.disabled_functions;
  FOREACH fn IN ARRAY coalesce(p_functions, '{}') LOOP v_disabled := v_disabled - fn; END LOOP;
  v_conflict := CASE WHEN coalesce(p_clear_conflict, false) THEN NULL ELSE v.conflict END;
  UPDATE domain.package_versions SET disabled_functions = v_disabled, conflict = v_conflict WHERE package_id = p_package AND version = p_version;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'function.enabled', p_actor,
                           jsonb_build_object('functions', to_jsonb(coalesce(p_functions, '{}')), 'conflict_cleared', coalesce(p_clear_conflict, false), 'run_id', last.run_id, 'reason', btrim(p_reason)), p_correlation);
  IF v_disabled = '{}'::jsonb AND v_conflict IS NULL THEN
    FOR m IN SELECT * FROM domain.package_migrations x WHERE x.package_id = p_package AND x.state = 'open' FOR UPDATE LOOP
      UPDATE domain.package_migrations SET state = 'completed', to_version = p_version, closed_by = p_actor, closed_at = clock_timestamp(),
             close_reason = format('re-enabled by a domain specialist after the passing health run %s: %s', last.run_id, btrim(p_reason)) WHERE migration_id = m.migration_id;
      v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, 'domain.package', 'domain_package', m.migration_id, format('re-enabled after the passing health run: %s', btrim(p_reason)), p_actor, p_correlation);
      PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'migration', m.migration_id, p_version, 'migration.completed', p_actor, jsonb_build_object('re_enabled', true), p_correlation);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('disabled_functions', v_disabled, 'conflict', v_conflict, 'run_id', last.run_id, 'closed_items', v_closed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.enable_package_function(uuid,uuid,uuid,int,text[],boolean,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.enable_package_function(uuid,uuid,uuid,int,text[],boolean,text,uuid,uuid) TO eye_commit;

-- §PK.6 THE FACTS the suite, the health check and the acceptance focus are computed from (INVOKER, plain SQL under the caller's RLS — N-01) ─
/* Everything a manifest names, as the core holds it NOW: the package and the version; the package's active version (contract compatibility);
   the core's fixed types and the domain's active `domain` ontology (canonical mapping, no core predicate redefined); the namespace's active
   ontology version (the graph's gate); each named SOURCE's latest contract (state, rights, purposes, origin, publisher, freshness) and its last
   evidence instant (coverage); each named forecast METHOD in the effective registry (approved, retired, quarantined) and each BEHAVIOUR model
   (implementation pinned); the risk TAXONOMY in force; every other package's active release (requires / conflicts). */
CREATE OR REPLACE FUNCTION domain.package_facts(p_package uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, graph, observation, objects, prediction, twin, pg_catalog, pg_temp AS $$
  WITH k AS (SELECT * FROM domain.packages x WHERE x.package_id = p_package),
  v AS (SELECT x.* FROM domain.package_versions x, k WHERE x.package_id = k.package_id AND x.version = p_version),
  a AS (SELECT x.* FROM domain.package_versions x, k WHERE x.package_id = k.package_id AND x.state = 'active' AND x.version <> p_version),
  srcs AS (
    SELECT DISTINCT s ->> 'source_key' AS source_key FROM v, jsonb_array_elements(v.manifest -> 'source_set') s
  ),
  src AS (
    SELECT sk.source_key, c.source_id, c.contract_version, c.lifecycle_state, c.rights_state, c.purposes, c.data_origin, c.publisher, c.freshness_threshold_seconds,
           c.classification_ceiling, c.acquisition_mode, c.authority_class,
           (SELECT max(o.recorded_at) FROM objects.canonical_objects o, k WHERE o.tenant_id = k.tenant_id AND o.domain_id = k.domain_id AND o.object_type = 'EVD'
               AND c.source_id IS NOT NULL AND o.provenance_ref LIKE 'SRC:' || c.source_id::text || '@%') AS last_evidence_at,
           (SELECT max(o.observation_time) FROM objects.canonical_objects o, k WHERE o.tenant_id = k.tenant_id AND o.domain_id = k.domain_id AND o.object_type = 'OBS'
               AND c.source_id IS NOT NULL AND o.provenance_ref LIKE 'SRC:' || c.source_id::text || '@%') AS last_observation_time,
           (SELECT max(o.recorded_at) FROM objects.canonical_objects o, k WHERE o.tenant_id = k.tenant_id AND o.domain_id = k.domain_id AND o.object_type = 'OBS'
               AND c.source_id IS NOT NULL AND o.provenance_ref LIKE 'SRC:' || c.source_id::text || '@%') AS last_observation_recorded_at
      FROM srcs sk CROSS JOIN k
      LEFT JOIN LATERAL (SELECT x.* FROM observation.source_contracts_current x WHERE x.tenant_id = k.tenant_id AND x.domain_id = k.domain_id AND x.source_key = sk.source_key
                          ORDER BY x.contract_version DESC LIMIT 1) c ON true
  ),
  meth AS (
    SELECT m ->> 'ref' AS ref, e.state, e.state_reason, e.horizons, e.builtin
      FROM v CROSS JOIN k CROSS JOIN LATERAL jsonb_array_elements(v.manifest -> 'models') m
      LEFT JOIN LATERAL (SELECT * FROM prediction.effective_forecast_methods(k.tenant_id, k.domain_id) f WHERE f.method_ref = m ->> 'ref' LIMIT 1) e ON true
     WHERE m ->> 'kind' = 'forecast'
  ),
  beh AS (
    SELECT m ->> 'ref' AS ref, b.implementation_digest, b.method_ref IS NOT NULL AS known
      FROM v, jsonb_array_elements(v.manifest -> 'models') m LEFT JOIN twin.behaviour_models b ON b.method_ref = m ->> 'ref'
     WHERE m ->> 'kind' = 'behaviour'
  ),
  ont AS (SELECT o.* FROM graph.ontology_versions o, k, v WHERE o.tenant_id = k.tenant_id AND o.domain_id = k.domain_id AND o.namespace = v.manifest #>> '{ontology_extension,namespace}' AND o.state = 'active'),
  core AS (SELECT o.* FROM graph.ontology_versions o, k WHERE o.tenant_id = k.tenant_id AND o.domain_id = k.domain_id AND o.namespace = 'domain' AND o.state = 'active'),
  tax AS (SELECT t.* FROM k, LATERAL (SELECT * FROM prediction.risk_taxonomy t WHERE t.tenant_id = k.tenant_id AND t.domain_id = k.domain_id ORDER BY t.version DESC LIMIT 1) t),
  others AS (
    SELECT jsonb_agg(jsonb_build_object('package_key', ok.package_key, 'domain_kind', ok.domain_kind, 'version', ov.version, 'semver', ov.semver,
                                        'requires', coalesce(ov.manifest #> '{release,requires}', '[]'::jsonb), 'conflicts', coalesce(ov.manifest #> '{release,conflicts}', '[]'::jsonb)) ORDER BY ok.package_key) AS j
      FROM domain.packages ok JOIN domain.package_versions ov ON ov.package_id = ok.package_id AND ov.state = 'active', k
     WHERE ok.tenant_id = k.tenant_id AND ok.domain_id = k.domain_id AND ok.package_id <> k.package_id AND ok.state = 'declared'
  )
  SELECT jsonb_build_object(
    'now', clock_timestamp(),
    'package', (SELECT jsonb_build_object('package_id', k.package_id, 'package_key', k.package_key, 'domain_kind', k.domain_kind, 'title', k.title, 'owner', k.owner_principal_id, 'state', k.state) FROM k),
    'version', (SELECT jsonb_build_object('version', v.version, 'semver', v.semver, 'state', v.state, 'manifest', v.manifest, 'manifest_digest', v.manifest_digest, 'proposed_by', v.proposed_by,
                                          'disabled_functions', v.disabled_functions, 'conflict', v.conflict) FROM v),
    'active', (SELECT jsonb_build_object('version', a.version, 'semver', a.semver, 'manifest', a.manifest) FROM a),
    'core', jsonb_build_object('entity_types', to_jsonb(domain.dpk_core_types()),
                               'ontology', (SELECT jsonb_build_object('version', c.version, 'predicates', (SELECT coalesce(jsonb_agg(p ->> 'predicate'), '[]'::jsonb) FROM jsonb_array_elements(c.predicates) p)) FROM core c)),
    'namespace_ontology', (SELECT jsonb_build_object('version_id', o.version_id, 'version', o.version, 'entity_types', to_jsonb(o.entity_types),
                                                     'predicates', (SELECT coalesce(jsonb_agg(p ->> 'predicate'), '[]'::jsonb) FROM jsonb_array_elements(o.predicates) p), 'activated_at', o.activated_at) FROM ont o),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object('source_key', s.source_key, 'known', s.source_id IS NOT NULL, 'source_id', s.source_id, 'contract_version', s.contract_version,
                                                             'lifecycle_state', s.lifecycle_state, 'rights_state', s.rights_state, 'purposes', s.purposes, 'data_origin', s.data_origin,
                                                             'publisher', s.publisher, 'freshness_threshold_seconds', s.freshness_threshold_seconds, 'classification_ceiling', s.classification_ceiling,
                                                             'acquisition_mode', s.acquisition_mode, 'authority_class', s.authority_class, 'last_evidence_at', s.last_evidence_at,
                                                             'last_observation_time', s.last_observation_time, 'last_observation_recorded_at', s.last_observation_recorded_at) ORDER BY s.source_key) FROM src s), '[]'::jsonb),
    'methods', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', m.ref, 'known', m.state IS NOT NULL, 'state', m.state, 'state_reason', m.state_reason, 'horizons', to_jsonb(m.horizons), 'builtin', m.builtin) ORDER BY m.ref) FROM meth m), '[]'::jsonb),
    'behaviour', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', b.ref, 'known', b.known, 'pinned', b.implementation_digest IS NOT NULL) ORDER BY b.ref) FROM beh b), '[]'::jsonb),
    'taxonomy', (SELECT jsonb_build_object('version', t.version, 'keys', (SELECT coalesce(jsonb_agg(c ->> 'key'), '[]'::jsonb) FROM jsonb_array_elements(t.categories) c)) FROM tax t),
    'packages', coalesce((SELECT j FROM others), '[]'::jsonb),
    'sections', domain.dpk_section_state(p_package, p_version)
  ) WHERE EXISTS (SELECT 1 FROM v)
$$;
GRANT EXECUTE ON FUNCTION domain.package_facts(uuid, int) TO eye_app, eye_commit;

/* The ACCEPTANCE facts (PK6) beside the package facts: the indicators' series (registered, last indicator observation, breach), the package's
   assessments (state, source diversity, subjects), its confirmed events' subjects, its alerts' adjudications, its active links, the method
   validations of the series and horizons its models claim (B25 registry), and the latest certification run. INVOKER. */
CREATE OR REPLACE FUNCTION domain.package_acceptance_facts(p_package uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, prediction, pg_catalog, pg_temp AS $$
  WITH k AS (SELECT * FROM domain.packages x WHERE x.package_id = p_package),
  v AS (SELECT x.* FROM domain.package_versions x, k WHERE x.package_id = k.package_id AND x.version = p_version),
  ind AS (
    SELECT i ->> 'key' AS key, i ->> 'series_key' AS series_key,
           (SELECT r.unit FROM prediction.series_registry r, k WHERE r.tenant_id = k.tenant_id AND r.domain_id = k.domain_id AND r.series_key = i ->> 'series_key') AS unit,
           (SELECT r.source_key FROM prediction.series_registry r, k WHERE r.tenant_id = k.tenant_id AND r.domain_id = k.domain_id AND r.series_key = i ->> 'series_key') AS source_key,
           (SELECT max(n.last_observation_at) FROM prediction.indicators_current n, k WHERE n.tenant_id = k.tenant_id AND n.domain_id = k.domain_id AND n.series_key = i ->> 'series_key' AND n.state = 'active') AS last_observation_at,
           (SELECT bool_or(n.breached) FROM prediction.indicators_current n, k WHERE n.tenant_id = k.tenant_id AND n.domain_id = k.domain_id AND n.series_key = i ->> 'series_key' AND n.state = 'active') AS breached
      FROM v, jsonb_array_elements(v.manifest -> 'indicators') i
  ),
  val AS (
    SELECT m ->> 'ref' AS ref, m ->> 'series_key' AS series_key, h AS horizon,
           EXISTS (SELECT 1 FROM prediction.method_validations mv, k WHERE mv.tenant_id = k.tenant_id AND mv.domain_id = k.domain_id AND mv.method_ref = m ->> 'ref'
                     AND mv.series_key = m ->> 'series_key' AND mv.horizon_code = h AND mv.passed) AS validated,
           (SELECT count(*)::int FROM prediction.method_validations mv, k WHERE mv.tenant_id = k.tenant_id AND mv.domain_id = k.domain_id AND mv.method_ref = m ->> 'ref'
                     AND mv.series_key = m ->> 'series_key' AND mv.horizon_code = h) AS records
      FROM v, jsonb_array_elements(v.manifest -> 'models') m, jsonb_array_elements_text(coalesce(m -> 'horizons', '[]'::jsonb)) h
     WHERE m ->> 'kind' = 'forecast'
  )
  SELECT jsonb_build_object(
    'indicators', coalesce((SELECT jsonb_agg(jsonb_build_object('key', i.key, 'series_key', i.series_key, 'registered', i.unit IS NOT NULL, 'source_key', i.source_key,
                                                                'last_observation_at', i.last_observation_at, 'breached', i.breached) ORDER BY i.key) FROM ind i), '[]'::jsonb),
    'validations', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', x.ref, 'series_key', x.series_key, 'horizon', x.horizon, 'validated', x.validated, 'records', x.records)) FROM val x), '[]'::jsonb),
    'assessments', coalesce((SELECT jsonb_agg(jsonb_build_object('assessment_id', a.assessment_id, 'version', a.version, 'state', a.state, 'template', a.template, 'material', a.material,
                                                                 'source_diversity', a.source_diversity, 'subjects', to_jsonb(a.subject_entities)) ORDER BY a.proposed_at)
                             FROM domain.assessments a WHERE a.package_id = p_package AND a.state IN ('approved', 'limited')), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', e.event_id, 'kind', e.kind, 'subjects', to_jsonb(e.subject_entities)) ORDER BY e.proposed_at)
                        FROM domain.events e WHERE e.package_id = p_package AND e.state = 'confirmed'), '[]'::jsonb),
    'alerts', coalesce((SELECT jsonb_agg(jsonb_build_object('alert_id', al.alert_id, 'state', al.state, 'adjudication', al.adjudication) ORDER BY al.raised_at)
                        FROM domain.alerts al WHERE al.package_id = p_package), '[]'::jsonb),
    'links', coalesce((SELECT jsonb_agg(jsonb_build_object('link_kind', l.link_kind, 'target_id', l.target_id) ORDER BY l.linked_at) FROM domain.package_links l WHERE l.package_id = p_package AND l.state = 'active'), '[]'::jsonb),
    'certification', (SELECT jsonb_build_object('run_id', r.run_id, 'passed', r.passed, 'ran_at', r.ran_at) FROM domain.package_conformance_runs r
                       WHERE r.package_id = p_package AND r.version = p_version AND r.mode = 'certification' ORDER BY r.ran_at DESC LIMIT 1)
  ) WHERE EXISTS (SELECT 1 FROM v)
$$;
GRANT EXECUTE ON FUNCTION domain.package_acceptance_facts(uuid, int) TO eye_app, eye_commit;

-- §PK.7 ASSESSMENTS, WATCHLISTS, EVENTS, ALERTS, LINKS (PK5) ───────────────────────────────────────────────────────────────────
/* THE ALERT RAISE (internal): an approved MATERIAL assessment or a confirmed event matched against every ACTIVE watchlist of the package —
   a rule {rule_key, on: assessment|event, templates?|kinds?} matches its cause, and the watchlist's entities (when it names any) meet the
   cause's subjects. One alert per (watchlist, rule, cause). The `alert` function not active → the alert is WITHHELD with the gate's reason
   (listed, never hidden); otherwise RAISED as `domain.alert` under the published policy, named owner = the watchlist's owner. FOR §CI (after
   the fold): any definer port of the domain schema may call this with its own cause (the cause kinds widened by the integrator). */
CREATE OR REPLACE FUNCTION domain.dpk_raise_watchlist_alerts(p_tenant uuid, p_domain uuid, p_package uuid, p_key text, p_cause_kind text, p_cause_id uuid, p_cause_version int,
                                                            p_subjects uuid[], p_match text, p_title text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, executive, pg_catalog, pg_temp AS $$
DECLARE w record; r jsonb; v_alert uuid; v_gate jsonb := domain.package_function_state(p_tenant, p_domain, p_key, 'alert'); v_item jsonb; v_out jsonb := '[]'::jsonb; v_title text;
BEGIN
  FOR w IN SELECT * FROM domain.watchlists x WHERE x.package_id = p_package AND x.state = 'active' AND x.tenant_id = p_tenant AND x.domain_id = p_domain
            AND (cardinality(x.entities) = 0 OR x.entities && p_subjects) ORDER BY x.declared_at, x.watchlist_id LOOP
    FOR r IN SELECT * FROM jsonb_array_elements(w.rules) LOOP
      CONTINUE WHEN r ->> 'on' IS DISTINCT FROM p_cause_kind;
      CONTINUE WHEN p_cause_kind = 'assessment' AND jsonb_typeof(r -> 'templates') = 'array' AND jsonb_array_length(r -> 'templates') > 0 AND NOT ((r -> 'templates') ? p_match);
      CONTINUE WHEN p_cause_kind = 'event' AND jsonb_typeof(r -> 'kinds') = 'array' AND jsonb_array_length(r -> 'kinds') > 0 AND NOT ((r -> 'kinds') ? p_match);
      CONTINUE WHEN EXISTS (SELECT 1 FROM domain.alerts a WHERE a.watchlist_id = w.watchlist_id AND a.rule_key = r ->> 'rule_key' AND a.cause_kind = p_cause_kind AND a.cause_id = p_cause_id AND a.cause_version = p_cause_version);
      v_alert := gen_random_uuid();
      v_title := left(format('%s — %s', w.title, p_title), 512);
      IF v_gate ->> 'state' <> 'active' THEN
        INSERT INTO domain.alerts (alert_id, scope, tenant_id, domain_id, package_id, package_key, watchlist_id, watchlist_version, rule_key, cause_kind, cause_id, cause_version, title, subject_entities,
                                   state, withheld_reason, owner_principal_id, correlation_id)
        VALUES (v_alert, 'DOMAIN', p_tenant, p_domain, p_package, p_key, w.watchlist_id, w.version, r ->> 'rule_key', p_cause_kind, p_cause_id, p_cause_version, v_title, p_subjects,
                'withheld', v_gate ->> 'reason', w.owner_principal_id, p_correlation);
        PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'alert', v_alert, NULL, 'alert.withheld', p_actor, jsonb_build_object('reason', v_gate ->> 'reason', 'watchlist_id', w.watchlist_id), p_correlation);
        v_out := v_out || jsonb_build_object('alert_id', v_alert, 'watchlist_id', w.watchlist_id, 'state', 'withheld', 'reason', v_gate ->> 'reason');
      ELSE
        v_item := executive.b33_raise_routed(p_tenant, p_domain, 'domain.alert', 'watchlist', w.watchlist_id, v_title,
                    jsonb_build_array(format('watchlist rule %s matched the %s %s', r ->> 'rule_key', p_cause_kind, p_cause_id)), w.owner_principal_id, v_alert, 'domain.alert.' || p_cause_kind,
                    jsonb_build_object('alert_id', v_alert, 'watchlist_id', w.watchlist_id, 'watchlist_version', w.version, 'rule_key', r ->> 'rule_key', 'package_key', p_key,
                                       'cause', jsonb_build_object('kind', p_cause_kind, 'id', p_cause_id, 'version', p_cause_version, 'match', p_match), 'subjects', to_jsonb(p_subjects)),
                    NULL, p_actor, p_correlation);
        INSERT INTO domain.alerts (alert_id, scope, tenant_id, domain_id, package_id, package_key, watchlist_id, watchlist_version, rule_key, cause_kind, cause_id, cause_version, title, subject_entities,
                                   state, item_id, item_state, owner_principal_id, correlation_id)
        VALUES (v_alert, 'DOMAIN', p_tenant, p_domain, p_package, p_key, w.watchlist_id, w.version, r ->> 'rule_key', p_cause_kind, p_cause_id, p_cause_version, v_title, p_subjects,
                'raised', (v_item ->> 'item_id')::uuid, v_item ->> 'state', w.owner_principal_id, p_correlation);
        PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'alert', v_alert, NULL, 'alert.raised', p_actor, jsonb_build_object('watchlist_id', w.watchlist_id, 'item', v_item), p_correlation);
        v_out := v_out || jsonb_build_object('alert_id', v_alert, 'watchlist_id', w.watchlist_id, 'state', 'raised', 'item', v_item);
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_raise_watchlist_alerts(uuid,uuid,uuid,text,text,uuid,int,uuid[],text,text,uuid,uuid) FROM PUBLIC;

/* PROPOSE an assessment version (domain.assessment.propose — a human or the Domain Intelligence Agent; the `assess` function active): the
   template is one of the active manifest's; the subjects are active entities; the evidence is cited at its digests; the source diversity is
   measured now (and again at approval). An existing assessment's next version is proposed while none is open. */
CREATE OR REPLACE FUNCTION domain.propose_assessment(p_assessment uuid, p_tenant uuid, p_domain uuid, p_key text, p_template text, p_subjects uuid[], p_statement text, p_confidence numeric,
                                                     p_evidence jsonb, p_material boolean, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a domain.package_versions%ROWTYPE; t jsonb; v_next int; v_div jsonb; v_kind text := domain.dpk_kind(p_actor);
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.assessment.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain assessment', p_actor);
  PERFORM domain.dpk_gate(p_tenant, p_domain, p_key, 'assess', 'domain assessment');
  a := domain.dpk_active(p_tenant, p_domain, p_key);
  SELECT x INTO t FROM jsonb_array_elements(a.manifest -> 'assessment_templates') x WHERE x ->> 'key' = p_template;
  IF t IS NULL THEN RAISE EXCEPTION 'domain assessment rejected (template): % is not a template of package % v%', coalesce(p_template, '<none>'), p_key, a.version USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_statement, ''))) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'domain assessment rejected (statement): a statement has 8–4000 characters' USING ERRCODE = '22023'; END IF;
  IF p_confidence IS NULL OR p_confidence < 0 OR p_confidence > 1 THEN RAISE EXCEPTION 'domain assessment rejected (confidence): the confidence is between 0 and 1' USING ERRCODE = '22023'; END IF;
  PERFORM domain.dpk_assert_entities('domain assessment', p_tenant, p_domain, p_subjects);
  PERFORM domain.dpk_assert_evidence('domain assessment', p_tenant, p_domain, p_evidence);
  IF EXISTS (SELECT 1 FROM domain.assessments x WHERE x.assessment_id = p_assessment AND (x.tenant_id <> p_tenant OR x.domain_id <> p_domain OR x.package_key <> p_key)) THEN
    RAISE EXCEPTION 'domain assessment rejected (unknown_assessment): % is not an assessment of package % in this domain', p_assessment, p_key USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM domain.assessments x WHERE x.assessment_id = p_assessment AND x.state = 'proposed') THEN
    RAISE EXCEPTION 'domain assessment rejected (state): a version of assessment % is already proposed; it is decided first', p_assessment USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_next FROM domain.assessments x WHERE x.assessment_id = p_assessment;
  v_div := domain.dpk_source_diversity(p_tenant, p_domain, p_evidence, coalesce((t ->> 'min_publishers')::int, 1));
  INSERT INTO domain.assessments (assessment_id, version, scope, tenant_id, domain_id, package_id, package_key, package_version, template, subject_entities, statement, confidence, evidence,
                                  source_diversity, material, state, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_assessment, v_next, 'DOMAIN', p_tenant, p_domain, a.package_id, p_key, a.version, p_template, p_subjects, btrim(p_statement), p_confidence, p_evidence,
          v_div, coalesce(p_material, coalesce((t ->> 'material')::boolean, true)), 'proposed', p_actor, coalesce(v_kind, 'system'), p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, a.package_id, 'assessment', p_assessment, v_next, 'assessment.proposed', p_actor,
                           jsonb_build_object('template', p_template, 'proposed_by_kind', v_kind, 'source_diversity', v_div), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.assessments x WHERE x.assessment_id = p_assessment AND x.version = v_next);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.propose_assessment(uuid,uuid,uuid,text,text,uuid[],text,numeric,jsonb,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.propose_assessment(uuid,uuid,uuid,text,text,uuid[],text,numeric,jsonb,boolean,uuid,uuid) TO eye_commit;

/* DECIDE a proposed version (domain.assessment.approve, human-gated): a named HUMAN — for a MATERIAL assessment a domain analyst or a domain
   specialist of the domain; for an immaterial one also the package's owner — never the proposer, never an agent. APPROVED when its source
   diversity meets the template's threshold, LIMITED (with the reason) when not; the prior standing version superseded; the DAS object of the
   standing version admitted in the same write (p_object_version, its state checked). An approved MATERIAL assessment is matched against the
   package's watchlists (alerts). */
CREATE OR REPLACE FUNCTION domain.decide_assessment(p_assessment uuid, p_tenant uuid, p_domain uuid, p_version int, p_decision text, p_note text, p_object_version int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x domain.assessments%ROWTYPE; k domain.packages%ROWTYPE; a domain.package_versions%ROWTYPE; t jsonb; v_div jsonb; v_state text; v_alerts jsonb := '[]'::jsonb; prior domain.assessments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.assessment.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain assessment', p_actor);
  SELECT * INTO x FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.version = p_version AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain assessment rejected (unknown_assessment): no version % of assessment % in this domain', p_version, p_assessment USING ERRCODE = '23503'; END IF;
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'domain assessment rejected (actor): an assessment is approved by a named human; an agent proposes, it never approves' USING ERRCODE = '42501';
  END IF;
  IF x.proposed_by = p_actor THEN RAISE EXCEPTION 'domain assessment rejected (separation_of_duties): the proposer of version % does not decide it', p_version USING ERRCODE = '42501'; END IF;
  SELECT * INTO k FROM domain.packages y WHERE y.package_id = x.package_id;
  IF NOT (domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'domain_specialist']) OR (NOT x.material AND p_actor = k.owner_principal_id)) THEN
    RAISE EXCEPTION 'domain assessment rejected (authority): a % assessment is decided by a named domain analyst or domain specialist%', CASE WHEN x.material THEN 'material' ELSE 'non-material' END,
      CASE WHEN x.material THEN '' ELSE ' (or the package''s owner)' END USING ERRCODE = '42501';
  END IF;
  IF x.state <> 'proposed' THEN RAISE EXCEPTION 'domain assessment rejected (state): version % is %', p_version, x.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'domain assessment rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'domain assessment rejected (note): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'reject' THEN
    UPDATE domain.assessments SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note) WHERE assessment_id = p_assessment AND version = p_version;
    PERFORM domain.dpk_event(p_tenant, p_domain, x.package_id, 'assessment', p_assessment, p_version, 'assessment.rejected', p_actor, jsonb_build_object('note', btrim(p_note)), p_correlation);
    RETURN (SELECT to_jsonb(y) FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.version = p_version);
  END IF;
  PERFORM domain.dpk_gate(p_tenant, p_domain, x.package_key, 'assess', 'domain assessment');
  a := domain.dpk_active(p_tenant, p_domain, x.package_key);
  SELECT y INTO t FROM jsonb_array_elements(a.manifest -> 'assessment_templates') y WHERE y ->> 'key' = x.template;
  IF t IS NULL THEN RAISE EXCEPTION 'domain assessment rejected (template): % is no longer a template of the active package version %', x.template, a.version USING ERRCODE = '22023'; END IF;
  v_div := domain.dpk_source_diversity(p_tenant, p_domain, x.evidence, coalesce((t ->> 'min_publishers')::int, 1));
  v_state := CASE WHEN (v_div ->> 'meets')::boolean THEN 'approved' ELSE 'limited' END;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_type = 'DAS' AND c.object_id = p_assessment AND c.object_version = p_object_version AND c.tenant_id = p_tenant
                   AND c.payload ->> 'state' = v_state AND (c.payload ->> 'version')::int = p_version) THEN
    RAISE EXCEPTION 'domain assessment rejected (object): the DAS object version % (state %, version %) was not admitted in this write', p_object_version, v_state, p_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO prior FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.state IN ('approved', 'limited') FOR UPDATE;
  IF FOUND THEN
    UPDATE domain.assessments SET state = 'superseded', superseded_at = clock_timestamp() WHERE assessment_id = p_assessment AND version = prior.version;
    PERFORM domain.dpk_event(p_tenant, p_domain, x.package_id, 'assessment', p_assessment, prior.version, 'assessment.superseded', p_actor, jsonb_build_object('by', p_version), p_correlation);
  END IF;
  UPDATE domain.assessments SET state = v_state, decided_by = p_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note), source_diversity = v_div, object_version = p_object_version,
         limited_reason = CASE WHEN v_state = 'limited' THEN format('source diversity below the template''s threshold: %s distinct publisher(s), %s required%s', v_div ->> 'publishers', v_div ->> 'threshold',
                                                                    CASE WHEN (v_div ->> 'unattributed')::int > 0 THEN format(', %s evidence object(s) without a source contract', v_div ->> 'unattributed') ELSE '' END) END,
         limited_at = CASE WHEN v_state = 'limited' THEN clock_timestamp() END
   WHERE assessment_id = p_assessment AND version = p_version;
  IF x.material THEN
    v_alerts := domain.dpk_raise_watchlist_alerts(p_tenant, p_domain, x.package_id, x.package_key, 'assessment', p_assessment, p_version, x.subject_entities, x.template,
                                                  left(x.statement, 200), p_actor, p_correlation);
  END IF;
  PERFORM domain.dpk_event(p_tenant, p_domain, x.package_id, 'assessment', p_assessment, p_version, 'assessment.' || v_state, p_actor,
                           jsonb_build_object('note', btrim(p_note), 'source_diversity', v_div, 'object_version', p_object_version, 'alerts', v_alerts), p_correlation);
  RETURN (SELECT to_jsonb(y) || jsonb_build_object('alerts', v_alerts) FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.version = p_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.decide_assessment(uuid,uuid,uuid,int,text,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.decide_assessment(uuid,uuid,uuid,int,text,text,int,uuid,uuid) TO eye_commit;

/* LIMIT the standing version (domain.assessment.limit, human-gated): a named analyst or specialist marks it LIMITED with the reason (a
   challenge, stale coverage, a mistaken identity …) — it is never again presented as complete; the conflicting evidence stays cited. */
CREATE OR REPLACE FUNCTION domain.limit_assessment(p_assessment uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x domain.assessments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.assessment.limit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain assessment', p_actor);
  IF NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'domain_specialist']) THEN
    RAISE EXCEPTION 'domain assessment rejected (authority): an assessment is limited by a named domain analyst or specialist' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain assessment rejected (reason): a limitation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.tenant_id = p_tenant AND y.domain_id = p_domain AND y.state IN ('approved', 'limited') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain assessment rejected (unknown_assessment): assessment % has no standing version in this domain', p_assessment USING ERRCODE = '23503'; END IF;
  IF x.state = 'limited' THEN RAISE EXCEPTION 'domain assessment rejected (state): version % is already limited (%)', x.version, x.limited_reason USING ERRCODE = '22023'; END IF;
  UPDATE domain.assessments SET state = 'limited', limited_reason = btrim(p_reason), limited_at = clock_timestamp() WHERE assessment_id = p_assessment AND version = x.version;
  PERFORM domain.dpk_event(p_tenant, p_domain, x.package_id, 'assessment', p_assessment, x.version, 'assessment.limited', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(y) FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.version = x.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.limit_assessment(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.limit_assessment(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* AS-OF REPLAY (UX-36-003 replay): the version of an assessment that STOOD at an instant and its state then (approved or limited), from the
   recorded instants — what was believed at T. INVOKER (RLS). */
CREATE OR REPLACE FUNCTION domain.assessment_as_of(p_assessment uuid, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(a) - 'state' || jsonb_build_object('state_then', CASE WHEN a.limited_at IS NOT NULL AND a.limited_at <= p_at THEN 'limited' ELSE 'approved' END,
                                                    'state_now', a.state, 'as_of', p_at)
    FROM domain.assessments a
   WHERE a.assessment_id = p_assessment AND a.decided_at IS NOT NULL AND a.decided_at <= p_at AND a.state IN ('approved', 'limited', 'superseded')
     AND (a.superseded_at IS NULL OR a.superseded_at > p_at)
   ORDER BY a.version DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION domain.assessment_as_of(uuid, timestamptz) TO eye_app, eye_commit;

/* DECLARE a watchlist / its next version (domain.watchlist.declare; the `watch` function active): its owner is the acting named human; the
   entities are active entities; the rules name what raises (on assessment: templates of the package; on event: event kinds). */
CREATE OR REPLACE FUNCTION domain.declare_watchlist(p_watchlist uuid, p_tenant uuid, p_domain uuid, p_key text, p_title text, p_entities uuid[], p_indicators text[], p_rules jsonb, p_freshness_days int,
                                                    p_expected_version int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a domain.package_versions%ROWTYPE; cur domain.watchlists%ROWTYPE; r jsonb; v_next int := 1; v_tpl text[]; v_kinds text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.watchlist.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('watchlist', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'watchlist rejected (actor): a watchlist is owned by a named human' USING ERRCODE = '42501'; END IF;
  PERFORM domain.dpk_gate(p_tenant, p_domain, p_key, 'watch', 'watchlist');
  a := domain.dpk_active(p_tenant, p_domain, p_key);
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'watchlist rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_freshness_days IS NULL OR p_freshness_days NOT BETWEEN 1 AND 3660 THEN RAISE EXCEPTION 'watchlist rejected (freshness): the coverage freshness is 1–3660 days' USING ERRCODE = '22023'; END IF;
  IF coalesce(cardinality(p_entities), 0) > 0 THEN PERFORM domain.dpk_assert_entities('watchlist', p_tenant, p_domain, p_entities); END IF;
  SELECT coalesce(array_agg(x ->> 'key'), '{}') INTO v_tpl FROM jsonb_array_elements(a.manifest -> 'assessment_templates') x;
  SELECT coalesce(array_agg(x), '{}') INTO v_kinds FROM jsonb_array_elements_text(coalesce(a.manifest #> '{ontology_extension,event_kinds}', '[]'::jsonb)) x;
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array' OR jsonb_array_length(p_rules) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'watchlist rejected (rules): a watchlist has 1–20 rules' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rules) LOOP
    IF jsonb_typeof(r) <> 'object' OR coalesce(r ->> 'rule_key', '') !~ '^[a-z][a-z0-9_.-]{1,62}$' OR coalesce(r ->> 'on', '') NOT IN ('assessment', 'event') THEN
      RAISE EXCEPTION 'watchlist rejected (rules): a rule is {rule_key, on: assessment|event, templates?|kinds?} (got %)', left(r::text, 200) USING ERRCODE = '22023';
    END IF;
    IF r ->> 'on' = 'assessment' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(r -> 'templates', '[]'::jsonb)) z WHERE NOT (z = ANY (v_tpl))) THEN
      RAISE EXCEPTION 'watchlist rejected (rules): rule % names a template the package does not declare (templates: %)', r ->> 'rule_key', array_to_string(v_tpl, ', ') USING ERRCODE = '22023';
    END IF;
    IF r ->> 'on' = 'event' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(r -> 'kinds', '[]'::jsonb)) z WHERE NOT (z = ANY (v_kinds))) THEN
      RAISE EXCEPTION 'watchlist rejected (rules): rule % names an event kind the package does not declare (kinds: %)', r ->> 'rule_key', array_to_string(v_kinds, ', ') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT * INTO cur FROM domain.watchlists x WHERE x.watchlist_id = p_watchlist AND x.state IN ('active', 'retired') FOR UPDATE;
  IF FOUND THEN
    IF cur.tenant_id <> p_tenant OR cur.domain_id <> p_domain OR cur.package_key <> p_key THEN RAISE EXCEPTION 'watchlist rejected (unknown_watchlist): % is not a watchlist of package %', p_watchlist, p_key USING ERRCODE = '23503'; END IF;
    IF cur.state = 'retired' THEN RAISE EXCEPTION 'watchlist rejected (state): watchlist % is retired', p_watchlist USING ERRCODE = '22023'; END IF;
    IF cur.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'watchlist rejected (ownership): watchlist % is revised by its owner', p_watchlist USING ERRCODE = '42501'; END IF;
    IF p_expected_version IS DISTINCT FROM cur.version THEN RAISE EXCEPTION 'watchlist rejected (stale): watchlist % stands at version %, not %', p_watchlist, cur.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023'; END IF;
    UPDATE domain.watchlists SET state = 'superseded', superseded_at = clock_timestamp() WHERE watchlist_id = p_watchlist AND version = cur.version;
    v_next := cur.version + 1;
  ELSIF coalesce(p_expected_version, 0) <> 0 THEN
    RAISE EXCEPTION 'watchlist rejected (unknown_watchlist): no watchlist % to revise', p_watchlist USING ERRCODE = '23503';
  END IF;
  INSERT INTO domain.watchlists (watchlist_id, version, scope, tenant_id, domain_id, package_id, package_key, title, owner_principal_id, entities, indicators, rules, freshness_days, state, declared_by, correlation_id)
  VALUES (p_watchlist, v_next, 'DOMAIN', p_tenant, p_domain, a.package_id, p_key, btrim(p_title), p_actor, coalesce(p_entities, '{}'), coalesce(p_indicators, '{}'), p_rules, p_freshness_days, 'active', p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, a.package_id, 'watchlist', p_watchlist, v_next, CASE WHEN v_next = 1 THEN 'watchlist.declared' ELSE 'watchlist.revised' END, p_actor,
                           jsonb_build_object('rules', p_rules, 'entities', to_jsonb(coalesce(p_entities, '{}'))), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.watchlists x WHERE x.watchlist_id = p_watchlist AND x.version = v_next);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.declare_watchlist(uuid,uuid,uuid,text,text,uuid[],text[],jsonb,int,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.declare_watchlist(uuid,uuid,uuid,text,text,uuid[],text[],jsonb,int,int,uuid,uuid) TO eye_commit;

/* RETIRE a watchlist (domain.watchlist.retire): its owner, with a reason; its open alert items closed. */
CREATE OR REPLACE FUNCTION domain.retire_watchlist(p_watchlist uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur domain.watchlists%ROWTYPE; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.watchlist.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('watchlist', p_actor);
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'watchlist rejected (reason): a retirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM domain.watchlists x WHERE x.watchlist_id = p_watchlist AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('active', 'retired') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'watchlist rejected (unknown_watchlist): no watchlist % in this domain', p_watchlist USING ERRCODE = '23503'; END IF;
  IF cur.state = 'retired' THEN RAISE EXCEPTION 'watchlist rejected (state): watchlist % is already retired', p_watchlist USING ERRCODE = '22023'; END IF;
  IF cur.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'watchlist rejected (ownership): watchlist % is retired by its owner', p_watchlist USING ERRCODE = '42501'; END IF;
  UPDATE domain.watchlists SET state = 'retired', retired_at = clock_timestamp(), retire_reason = btrim(p_reason) WHERE watchlist_id = p_watchlist AND version = cur.version;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'domain.alert', 'watchlist', p_watchlist, format('watchlist retired: %s', btrim(p_reason)), p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, cur.package_id, 'watchlist', p_watchlist, cur.version, 'watchlist.retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'closed_items', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('closed_items', v_closed) FROM domain.watchlists x WHERE x.watchlist_id = p_watchlist AND x.version = cur.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.retire_watchlist(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.retire_watchlist(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* RECORD a domain event (domain.event.record — a human or the agent PROPOSES it; the `event` function active): the kind is one the package's
   ontology extension declares; subjects active entities; evidence cited at its digests. */
CREATE OR REPLACE FUNCTION domain.record_domain_event(p_event uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_title text, p_subjects uuid[], p_occurred_on date, p_evidence jsonb,
                                                      p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a domain.package_versions%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.event.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain event', p_actor);
  PERFORM domain.dpk_gate(p_tenant, p_domain, p_key, 'event', 'domain event');
  a := domain.dpk_active(p_tenant, p_domain, p_key);
  IF NOT coalesce((a.manifest #> '{ontology_extension,event_kinds}') ? p_kind, false) THEN
    RAISE EXCEPTION 'domain event rejected (kind): % is not an event kind of package % (kinds: %)', coalesce(p_kind, '<none>'), p_key, coalesce(a.manifest #>> '{ontology_extension,event_kinds}', '[]') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 300 THEN RAISE EXCEPTION 'domain event rejected (title): a title has 4–300 characters' USING ERRCODE = '22023'; END IF;
  IF p_occurred_on IS NULL OR p_occurred_on > (clock_timestamp() AT TIME ZONE 'UTC')::date + 1 THEN RAISE EXCEPTION 'domain event rejected (date): an event has the day it occurred (not in the future)' USING ERRCODE = '22023'; END IF;
  PERFORM domain.dpk_assert_entities('domain event', p_tenant, p_domain, p_subjects);
  PERFORM domain.dpk_assert_evidence('domain event', p_tenant, p_domain, p_evidence);
  INSERT INTO domain.events (event_id, scope, tenant_id, domain_id, package_id, package_key, package_version, kind, title, subject_entities, occurred_on, evidence, state, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_event, 'DOMAIN', p_tenant, p_domain, a.package_id, p_key, a.version, p_kind, btrim(p_title), p_subjects, p_occurred_on, p_evidence, 'proposed', p_actor, coalesce(domain.dpk_kind(p_actor), 'system'), p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, a.package_id, 'event', p_event, NULL, 'event.proposed', p_actor, jsonb_build_object('kind', p_kind, 'occurred_on', p_occurred_on), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.events x WHERE x.event_id = p_event);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.record_domain_event(uuid,uuid,uuid,text,text,text,uuid[],date,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.record_domain_event(uuid,uuid,uuid,text,text,text,uuid[],date,jsonb,uuid,uuid) TO eye_commit;

/* CONFIRM (or reject) a proposed event (domain.event.confirm, human-gated): a named analyst or specialist, never the proposer; a confirmed
   event is matched against the package's watchlists (alerts). */
CREATE OR REPLACE FUNCTION domain.confirm_domain_event(p_event uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e domain.events%ROWTYPE; v_alerts jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.event.confirm']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain event', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'domain_specialist']) THEN
    RAISE EXCEPTION 'domain event rejected (authority): an event is confirmed by a named domain analyst or specialist' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO e FROM domain.events x WHERE x.event_id = p_event AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain event rejected (unknown_event): no event % in this domain', p_event USING ERRCODE = '23503'; END IF;
  IF e.proposed_by = p_actor THEN RAISE EXCEPTION 'domain event rejected (separation_of_duties): the proposer of event % does not confirm it', p_event USING ERRCODE = '42501'; END IF;
  IF e.state <> 'proposed' THEN RAISE EXCEPTION 'domain event rejected (state): event % is %', p_event, e.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('confirm', 'reject') THEN RAISE EXCEPTION 'domain event rejected (decision): the decision is confirm or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'domain event rejected (note): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'confirm' THEN PERFORM domain.dpk_gate(p_tenant, p_domain, e.package_key, 'event', 'domain event'); END IF;
  UPDATE domain.events SET state = CASE p_decision WHEN 'confirm' THEN 'confirmed' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note) WHERE event_id = p_event;
  IF p_decision = 'confirm' THEN
    v_alerts := domain.dpk_raise_watchlist_alerts(p_tenant, p_domain, e.package_id, e.package_key, 'event', p_event, 1, e.subject_entities, e.kind, e.title, p_actor, p_correlation);
  END IF;
  PERFORM domain.dpk_event(p_tenant, p_domain, e.package_id, 'event', p_event, NULL, CASE p_decision WHEN 'confirm' THEN 'event.confirmed' ELSE 'event.rejected' END, p_actor,
                           jsonb_build_object('note', btrim(p_note), 'alerts', v_alerts), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('alerts', v_alerts) FROM domain.events x WHERE x.event_id = p_event);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.confirm_domain_event(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.confirm_domain_event(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* ADJUDICATE an alert (domain.alert.adjudicate, human-gated): a named analyst, specialist or the watchlist's owner records true or false
   positive with a note — the measured false-positive analysis (cyber) reads these, never a guess. */
CREATE OR REPLACE FUNCTION domain.adjudicate_alert(p_alert uuid, p_tenant uuid, p_domain uuid, p_adjudication text, p_note text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE al domain.alerts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.alert.adjudicate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('watchlist', p_actor);
  SELECT * INTO al FROM domain.alerts x WHERE x.alert_id = p_alert AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'watchlist rejected (unknown_alert): no alert % in this domain', p_alert USING ERRCODE = '23503'; END IF;
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT (p_actor = al.owner_principal_id OR domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'domain_specialist'])) THEN
    RAISE EXCEPTION 'watchlist rejected (authority): an alert is adjudicated by a named analyst, specialist or the watchlist''s owner' USING ERRCODE = '42501';
  END IF;
  IF al.state = 'withheld' THEN RAISE EXCEPTION 'watchlist rejected (state): alert % was withheld (%); nothing reached anyone to adjudicate', p_alert, al.withheld_reason USING ERRCODE = '22023'; END IF;
  IF al.adjudication IS NOT NULL THEN RAISE EXCEPTION 'watchlist rejected (duplicate): alert % is already adjudicated %', p_alert, al.adjudication USING ERRCODE = '23505'; END IF;
  IF p_adjudication NOT IN ('true_positive', 'false_positive') THEN RAISE EXCEPTION 'watchlist rejected (adjudication): true_positive or false_positive' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'watchlist rejected (note): an adjudication states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE domain.alerts SET adjudication = p_adjudication, adjudicated_by = p_actor, adjudicated_at = clock_timestamp(), adjudication_note = btrim(p_note) WHERE alert_id = p_alert;
  PERFORM domain.dpk_event(p_tenant, p_domain, al.package_id, 'alert', p_alert, NULL, 'alert.adjudicated', p_actor, jsonb_build_object('adjudication', p_adjudication, 'note', btrim(p_note)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.alerts x WHERE x.alert_id = p_alert);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.adjudicate_alert(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.adjudicate_alert(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* RESOLVE a watchlist's raised alerts (domain.alert.resolve, human-gated): its owner, with a reason; the `domain.alert` items of the watchlist
   closed (item.closed with the reason). The response DECISION is the decision layer's — this records that the alert was seen and handled. */
CREATE OR REPLACE FUNCTION domain.resolve_alerts(p_watchlist uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w domain.watchlists%ROWTYPE; v_ids jsonb; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.alert.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('watchlist', p_actor);
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'watchlist rejected (reason): a resolution states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO w FROM domain.watchlists x WHERE x.watchlist_id = p_watchlist AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('active', 'retired');
  IF NOT FOUND THEN RAISE EXCEPTION 'watchlist rejected (unknown_watchlist): no watchlist % in this domain', p_watchlist USING ERRCODE = '23503'; END IF;
  IF w.owner_principal_id <> p_actor AND NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_admin']) THEN
    RAISE EXCEPTION 'watchlist rejected (ownership): the alerts of watchlist % are resolved by its owner', p_watchlist USING ERRCODE = '42501';
  END IF;
  WITH u AS (UPDATE domain.alerts SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(), resolve_reason = btrim(p_reason)
              WHERE watchlist_id = p_watchlist AND state = 'raised' RETURNING alert_id)
  SELECT coalesce(jsonb_agg(alert_id), '[]'::jsonb) INTO v_ids FROM u;
  IF jsonb_array_length(v_ids) = 0 THEN RAISE EXCEPTION 'watchlist rejected (state): watchlist % has no raised alert to resolve', p_watchlist USING ERRCODE = '22023'; END IF;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'domain.alert', 'watchlist', p_watchlist, format('alerts resolved by the watchlist owner: %s', btrim(p_reason)), p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, w.package_id, 'watchlist', p_watchlist, w.version, 'alert.resolved', p_actor, jsonb_build_object('alerts', v_ids, 'closed_items', v_closed, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('resolved', v_ids, 'closed_items', v_closed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.resolve_alerts(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.resolve_alerts(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* DECLARE a link (domain.link.declare; the matching function active): a REFERENCE to the core's object, never a copy. exposure → a B32
   exposure whose category is in the package's risk meaning; forecast → a B25 forecast whose target or series the package's models declare;
   scenario → a B27 scenario of the domain (active); indicator → an indicator on a series the package declares. */
CREATE OR REPLACE FUNCTION domain.declare_package_link(p_link uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_target uuid, p_assessment uuid, p_note text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, prediction, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a domain.package_versions%ROWTYPE; v_cat text; v_series text; v_target text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.link.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF coalesce(p_kind, '') NOT IN ('exposure', 'forecast', 'scenario', 'indicator') THEN RAISE EXCEPTION 'domain package rejected (link): the link kind is exposure, forecast, scenario or indicator' USING ERRCODE = '22023'; END IF;
  PERFORM domain.dpk_gate(p_tenant, p_domain, p_key, p_kind, 'domain package');
  a := domain.dpk_active(p_tenant, p_domain, p_key);
  IF length(btrim(coalesce(p_note, ''))) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'domain package rejected (note): a link states why (8–1000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_assessment IS NOT NULL AND NOT EXISTS (SELECT 1 FROM domain.assessments x WHERE x.assessment_id = p_assessment AND x.package_id = a.package_id) THEN
    RAISE EXCEPTION 'domain package rejected (unknown_assessment): % is not an assessment of package %', p_assessment, p_key USING ERRCODE = '23503';
  END IF;
  IF p_kind = 'exposure' THEN
    SELECT e.category_key INTO v_cat FROM prediction.exposure_current e WHERE e.exposure_id = p_target AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_target): % is not an exposure of this domain', p_target USING ERRCODE = '23503'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.manifest -> 'risk_meaning') r WHERE r ->> 'category_key' = v_cat) THEN
      RAISE EXCEPTION 'domain package rejected (risk): exposure % is in category %, which the package''s risk meaning does not map', p_target, v_cat USING ERRCODE = '22023';
    END IF;
  ELSIF p_kind = 'forecast' THEN
    SELECT f.series_key, f.target_key INTO v_series, v_target FROM prediction.forecasts_current f WHERE f.forecast_id = p_target AND f.tenant_id = p_tenant AND f.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_target): % is not a forecast of this domain', p_target USING ERRCODE = '23503'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.manifest -> 'models') m WHERE m ->> 'kind' = 'forecast' AND (m ->> 'series_key' = v_series OR (v_target IS NOT NULL AND m ->> 'target_key' = v_target))) THEN
      RAISE EXCEPTION 'domain package rejected (target): forecast % (series %, target %) is not on a series or target the package''s models declare', p_target, v_series, coalesce(v_target, '<none>') USING ERRCODE = '22023';
    END IF;
  ELSIF p_kind = 'scenario' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_target AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.state = 'active') THEN
      RAISE EXCEPTION 'domain package rejected (unknown_target): % is not an active scenario of this domain', p_target USING ERRCODE = '23503';
    END IF;
  ELSE
    SELECT n.series_key INTO v_series FROM prediction.indicators_current n WHERE n.indicator_id = p_target AND n.tenant_id = p_tenant AND n.domain_id = p_domain AND n.state = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_target): % is not an active indicator of this domain', p_target USING ERRCODE = '23503'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.manifest -> 'indicators') i WHERE i ->> 'series_key' = v_series) THEN
      RAISE EXCEPTION 'domain package rejected (target): indicator % reads series %, which the package''s indicators do not declare', p_target, v_series USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM domain.package_links l WHERE l.package_id = a.package_id AND l.link_kind = p_kind AND l.target_id = p_target AND l.state = 'active') THEN
    RAISE EXCEPTION 'domain package rejected (duplicate): the package already links % %', p_kind, p_target USING ERRCODE = '23505';
  END IF;
  INSERT INTO domain.package_links (link_id, scope, tenant_id, domain_id, package_id, package_key, assessment_id, link_kind, target_id, note, state, linked_by, correlation_id)
  VALUES (p_link, 'DOMAIN', p_tenant, p_domain, a.package_id, p_key, p_assessment, p_kind, p_target, btrim(p_note), 'active', p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, a.package_id, 'link', p_link, NULL, 'link.declared', p_actor, jsonb_build_object('kind', p_kind, 'target', p_target, 'assessment', p_assessment), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.package_links x WHERE x.link_id = p_link);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.declare_package_link(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.declare_package_link(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* WITHDRAW a link (domain.link.withdraw): its declarer or the package's owner, with a reason. Not gated by the function (a withdrawal is always possible). */
CREATE OR REPLACE FUNCTION domain.withdraw_package_link(p_link uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l domain.package_links%ROWTYPE; k domain.packages%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.link.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO l FROM domain.package_links x WHERE x.link_id = p_link AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_link): no link % in this domain', p_link USING ERRCODE = '23503'; END IF;
  IF l.state <> 'active' THEN RAISE EXCEPTION 'domain package rejected (state): link % is already withdrawn', p_link USING ERRCODE = '22023'; END IF;
  SELECT * INTO k FROM domain.packages x WHERE x.package_id = l.package_id;
  IF p_actor <> l.linked_by AND p_actor <> k.owner_principal_id THEN RAISE EXCEPTION 'domain package rejected (ownership): a link is withdrawn by its declarer or the package''s owner' USING ERRCODE = '42501'; END IF;
  UPDATE domain.package_links SET state = 'withdrawn', withdrawn_by = p_actor, withdrawn_at = clock_timestamp(), withdraw_reason = btrim(p_reason) WHERE link_id = p_link;
  PERFORM domain.dpk_event(p_tenant, p_domain, l.package_id, 'link', p_link, NULL, 'link.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.package_links x WHERE x.link_id = p_link);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.withdraw_package_link(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.withdraw_package_link(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;
-- end §PK
