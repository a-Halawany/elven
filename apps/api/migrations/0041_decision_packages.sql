-- 0041 · Phase 6, P6-M1 — decision packages (PHASE6_BUILD_PLAN.md §3, §11; F1, the
-- dissent half of F3, the DPK admission boundaries).
--
-- A decision package is what a named human will be asked to approve: objectives,
-- options whose consequences cite completed simulation runs on one common baseline,
-- the uncertainty derived from what those runs and forecasts actually say, the
-- monitoring conditions, the approver policy — and THE CHOICE: which option, why (in
-- the human's own words), by when, at what accepted trade-off, owned by whom, judged
-- against which measurable outcome. Approving a menu is not an approval; the choice
-- and its conditions are inside the digest an approval signs (0042).
--
-- What this migration does NOT do: it writes nothing into Phase 3's strategy graph. A
-- package BINDS to a DEC a strategy owner declared through Phase 3's own port; the
-- bounded CMT and OUT writes arrive in 0042/0043 through their own ports.
--
--   §1  roles              decision_owner, decision_approver, decision_authority, executive,
--                          decision_agent, briefing_agent, reporting_agent
--   §2  packages           events + projection, bound to an existing DEC
--   §3  versions           draft → proposed; immutable once proposed; the choice
--   §4  options            typed consequence citations — CHECKs that fail closed
--   §5  dissent            append-only, humans only
--   §6  ports              declare, open version, set option, set terms, set choice, dissent, propose
--   §7  write action, schema DPK@v1, RLS, projection rebuild
-- ============================================================

-- ============================================================
-- 1. Roles.
-- ============================================================
INSERT INTO identity.roles (code, scope, description) VALUES
  ('decision_owner', 'DOMAIN', 'Decision owner — declares packages against a declared DEC, opens versions, sets options, terms and the choice, proposes, records outcomes and closes. Cannot approve or commit.'),
  ('decision_approver', 'DOMAIN', 'Decision approver — a named human who approves or rejects a proposed package version. Cannot approve a version they authored, proposed or own the actions of.'),
  ('decision_authority', 'DOMAIN', 'Decision authority — the named human who COMMITS an approved package version under the exact C3 action decision.commit. Distinct from approving.'),
  ('executive', 'DOMAIN', 'Executive — reads packages, briefings, rooms and replays; owns rooms and review cadence.'),
  ('decision_agent', 'DOMAIN', 'Decision agent (bounded) — drafts option cards into a DRAFT package version from completed runs, forecasts and claims. Can never propose, approve, dissent or commit.'),
  ('briefing_agent', 'DOMAIN', 'Executive Briefing agent (bounded) — composes briefing snapshots from stored records within its budget. Writes nothing else.'),
  ('reporting_agent', 'DOMAIN', 'Reporting agent (bounded) — renders reports and exports from stored records with controls intact. Writes no decision.')
ON CONFLICT (code) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS decision;
GRANT USAGE ON SCHEMA decision TO eye_app, eye_commit;

-- ============================================================
-- 2. Packages: events + projection.
-- ============================================================
CREATE TABLE decision.package_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_id         uuid NOT NULL,
  event              text NOT NULL CHECK (event IN (
    'package.declared', 'version.opened', 'option.set', 'terms.set', 'choice.set', 'dissent.recorded', 'version.proposed',
    'review.recorded', 'version.approved', 'approval.revoked', 'version.rejected', 'package.committed', 'package.withdrawn',
    'outcome.recorded', 'package.closed', 'commit.refused')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dpe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dpe_package ON decision.package_events (package_id, occurred_at);
CREATE TRIGGER dpe_append_only BEFORE UPDATE OR DELETE ON decision.package_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE decision.packages_current (
  package_id          uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  /* The DEC a strategy owner declared through Phase 3's own port. A package never declares one. */
  decision_object_id  uuid NOT NULL REFERENCES graph.strategy_current(strategy_object_id),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  statement           text NOT NULL CHECK (length(btrim(statement)) BETWEEN 2 AND 4096),
  owner_principal_id  uuid NOT NULL,
  state               text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'proposed', 'under_review', 'approved', 'committed', 'monitoring', 'closed', 'rejected', 'withdrawn')),
  current_version     int,
  committed_version   int,
  decided_at          timestamptz,
  synthetic_state     boolean NOT NULL DEFAULT false,
  controls            jsonb NOT NULL DEFAULT '{}'::jsonb,
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dpk_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_committed_bound CHECK ((state IN ('committed', 'monitoring', 'closed')) = (committed_version IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX dpk_dec ON decision.packages_current (decision_object_id);

-- ============================================================
-- 3. Versions: a draft until proposed, immutable after; the choice lives here.
-- ============================================================
CREATE TABLE decision.package_versions (
  package_id          uuid NOT NULL REFERENCES decision.packages_current(package_id),
  version             int  NOT NULL CHECK (version >= 1),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  supersedes          int  CHECK (supersedes IS NULL OR supersedes >= 1),
  state               text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'proposed', 'under_review', 'approved', 'committed', 'rejected', 'superseded')),
  /* RECORD-time and WORLD-time cut-offs under which the cited runs and evidence were read. */
  known_at            timestamptz NOT NULL,
  observed_through    date,
  objectives          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(objectives) = 'array'),
  constraints         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(constraints) = 'array'),
  approver_policy     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(approver_policy) = 'object'),
  monitoring_conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(monitoring_conditions) = 'array'),
  /* THE CHOICE: option_key, rationale, decision_deadline, accepted_trade_offs[], action_owner, outcome_criteria[]. */
  choice              jsonb CHECK (choice IS NULL OR jsonb_typeof(choice) = 'object'),
  reversibility       text,
  information_value   text,
  second_order        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(second_order) = 'array'),
  risks               jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(risks) = 'array'),
  opportunities       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(opportunities) = 'array'),
  /* The one common baseline every simulated consequence rests on (the control run), derived at proposal. */
  baseline_run_id     uuid,
  version_digest      text CHECK (version_digest IS NULL OR version_digest ~ '^[0-9a-f]{64}$'),
  header_digest       text CHECK (header_digest IS NULL OR header_digest ~ '^[0-9a-f]{64}$'),
  synthetic_state     boolean NOT NULL DEFAULT false,
  controls            jsonb NOT NULL DEFAULT '{}'::jsonb,
  author_principal_id uuid NOT NULL,
  proposed_by         uuid,
  proposed_at         timestamptz,
  opened_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (package_id, version),
  CONSTRAINT dpv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpv_proposed_bound CHECK (state = 'draft' OR (version_digest IS NOT NULL AND header_digest IS NOT NULL AND proposed_at IS NOT NULL AND proposed_by IS NOT NULL AND choice IS NOT NULL))
);

/*
 * IMMUTABILITY BY TRIGGER. A draft may become proposed exactly once (binding its
 * digests). A proposed row may change ONLY its state, along the workflow, through the
 * ports that write the event first. Its content — objectives, options' terms, the
 * choice, the policy, the conditions, the cut-offs, the digests — never changes:
 * a different choice is a different version.
 */
CREATE OR REPLACE FUNCTION decision.versions_immutable() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'decision package versions are append-only: DELETE prohibited' USING ERRCODE = '2F002';
  END IF;
  IF OLD.state <> 'draft' THEN
    IF NEW.known_at <> OLD.known_at OR NEW.observed_through IS DISTINCT FROM OLD.observed_through
       OR NEW.objectives <> OLD.objectives OR NEW.constraints <> OLD.constraints OR NEW.approver_policy <> OLD.approver_policy
       OR NEW.monitoring_conditions <> OLD.monitoring_conditions OR NEW.choice IS DISTINCT FROM OLD.choice
       OR NEW.reversibility IS DISTINCT FROM OLD.reversibility OR NEW.information_value IS DISTINCT FROM OLD.information_value
       OR NEW.second_order <> OLD.second_order OR NEW.risks <> OLD.risks OR NEW.opportunities <> OLD.opportunities
       OR NEW.baseline_run_id IS DISTINCT FROM OLD.baseline_run_id OR NEW.version_digest IS DISTINCT FROM OLD.version_digest
       OR NEW.header_digest IS DISTINCT FROM OLD.header_digest OR NEW.synthetic_state <> OLD.synthetic_state OR NEW.controls <> OLD.controls
       OR NEW.author_principal_id <> OLD.author_principal_id OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
       OR NEW.proposed_at IS DISTINCT FROM OLD.proposed_at OR NEW.supersedes IS DISTINCT FROM OLD.supersedes THEN
      RAISE EXCEPTION 'version % of package % is proposed and immutable; a different choice is a new version', OLD.version, OLD.package_id
        USING ERRCODE = '2F002';
    END IF;
    IF NEW.state <> OLD.state AND NOT (
         (OLD.state = 'proposed' AND NEW.state IN ('under_review', 'approved', 'rejected', 'superseded'))
      OR (OLD.state = 'under_review' AND NEW.state IN ('approved', 'rejected', 'superseded', 'proposed'))
      OR (OLD.state = 'approved' AND NEW.state IN ('committed', 'rejected', 'superseded', 'proposed'))) THEN
      RAISE EXCEPTION 'version % of package %: % → % is not a workflow transition', OLD.version, OLD.package_id, OLD.state, NEW.state
        USING ERRCODE = '2F002';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dpv_immutable BEFORE UPDATE OR DELETE ON decision.package_versions
  FOR EACH ROW EXECUTE FUNCTION decision.versions_immutable();

-- ============================================================
-- 4. Options: typed consequence citations, failing closed.
-- ============================================================
/* A consequence citation binds an exact object: kind, uuid id, integer version, 64-hex digest. Null or malformed anywhere → false. */
CREATE OR REPLACE FUNCTION decision.citations_ok(p jsonb) RETURNS boolean
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE c jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN false; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(c) <> 'object' THEN RETURN false; END IF;
    IF NOT (c ? 'kind' AND c ? 'id' AND c ? 'version' AND c ? 'digest') THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'kind') <> 'string' OR NOT ((c ->> 'kind') IN ('run', 'forecast', 'claim', 'evidence', 'assumption', 'warning')) THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'id') <> 'string' OR NOT ((c ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'version') <> 'number' OR (c ->> 'version') !~ '^[0-9]+$' OR (c ->> 'version')::int < 1 THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'digest') <> 'string' OR NOT ((c ->> 'digest') ~ '^[0-9a-f]{64}$') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decision.citation_count(p jsonb, p_kind text) RETURNS int
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN 0
              ELSE (SELECT count(*)::int FROM jsonb_array_elements(p) c WHERE jsonb_typeof(c) = 'object' AND (c ->> 'kind') = p_kind) END;
$$ LANGUAGE sql;

CREATE TABLE decision.options (
  option_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  key                 text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{0,40}$'),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  kind                text NOT NULL CHECK (kind IN ('intervention', 'status_quo')),
  consequences        jsonb NOT NULL CHECK (decision.citations_ok(consequences)),
  /* TRUE when at least one consequence cites a completed run; otherwise the option says why it is unsimulated. */
  simulated           boolean NOT NULL,
  unsimulated_reason  text,
  /* DERIVED by the port and the service from the cited objects — never taken from the caller. */
  uncertainty         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(uncertainty) = 'object'),
  second_order        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(second_order) = 'array'),
  risks               jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(risks) = 'array'),
  opportunities       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(opportunities) = 'array'),
  reversibility       text,
  synthetic_state     boolean NOT NULL DEFAULT false,
  controls            jsonb NOT NULL DEFAULT '{}'::jsonb,
  set_by              uuid NOT NULL,
  set_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dop_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dop_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions(package_id, version),
  CONSTRAINT dop_unique_key UNIQUE (package_id, version, key),
  CONSTRAINT dop_simulated_cites_run CHECK ((simulated AND decision.citation_count(consequences, 'run') >= 1) OR (NOT simulated AND unsimulated_reason IS NOT NULL AND length(btrim(unsimulated_reason)) >= 8))
);
CREATE TRIGGER dop_append_only BEFORE UPDATE OR DELETE ON decision.options
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
/* An option enters a DRAFT version only; a proposed version's options are part of its digest. */
CREATE OR REPLACE FUNCTION decision.options_only_into_drafts() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = NEW.package_id AND v.version = NEW.version AND v.state = 'draft') THEN
    RAISE EXCEPTION 'option rejected: version % of package % is not an open draft', NEW.version, NEW.package_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dop_into_drafts BEFORE INSERT ON decision.options
  FOR EACH ROW EXECUTE FUNCTION decision.options_only_into_drafts();

-- ============================================================
-- 5. Dissent: append-only, humans only (the port checks the principal kind).
-- ============================================================
CREATE TABLE decision.dissent (
  dissent_id          uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  principal_id        uuid NOT NULL,
  position            text NOT NULL CHECK (length(btrim(position)) BETWEEN 2 AND 256),
  rationale           text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 4096),
  citation            jsonb CHECK (citation IS NULL OR decision.citations_ok(jsonb_build_array(citation))),
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dds_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dds_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions(package_id, version)
);
CREATE INDEX dds_version_idx ON decision.dissent (package_id, version, recorded_at);
CREATE TRIGGER dds_append_only BEFORE UPDATE OR DELETE ON decision.dissent
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 6. Ports.
-- ============================================================
/* A human, active, in this tenant — the shape approvers, committers, dissenters and action owners must have. */
CREATE OR REPLACE FUNCTION decision.is_active_human(p_principal uuid, p_tenant uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_principal AND p.kind = 'human' AND p.status = 'active' AND p.tenant_id = p_tenant);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION decision.is_active_human(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.is_active_human(uuid, uuid) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION decision.declare_package(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_decision_object uuid, p_title text, p_statement text, p_owner uuid,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_type text; v_status text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT object_type, status INTO v_type, v_status FROM graph.strategy_current s
   WHERE s.strategy_object_id = p_decision_object AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'package rejected: the package must bind to a DEC a strategy owner declared in this domain' USING ERRCODE = '23503';
  END IF;
  IF v_type <> 'DEC' THEN
    RAISE EXCEPTION 'package rejected: strategy object % is a %, not a DEC', p_decision_object, v_type USING ERRCODE = '22023';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'package rejected: the DEC is %, not active', v_status USING ERRCODE = '22023';
  END IF;
  IF NOT decision.is_active_human(p_owner, p_tenant) THEN
    RAISE EXCEPTION 'package rejected: the owner must be a named, active human principal in this tenant' USING ERRCODE = '23503';
  END IF;
  INSERT INTO decision.packages_current (package_id, scope, tenant_id, domain_id, decision_object_id, title, statement, owner_principal_id, declared_by, correlation_id)
  VALUES (p_package_id, 'DOMAIN', p_tenant, p_domain, p_decision_object, p_title, p_statement, p_owner, p_actor, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.declared', p_actor,
          jsonb_build_object('decision_object_id', p_decision_object, 'title', p_title, 'owner', p_owner), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.declare_package(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.declare_package(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,uuid) TO eye_commit;

/*
 * Open a DRAFT version. A package holds one open draft at a time; a new version
 * supersedes the latest non-draft version. `p_carry_from` copies that version's
 * objectives, terms, policy, conditions and options into the draft — NOT the choice,
 * which is always made afresh — so a changed choice is always a new version.
 */
CREATE OR REPLACE FUNCTION decision.open_version(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_known_at timestamptz, p_observed_through date, p_carry_from int,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS int
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; v_supersedes int; v_open int; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.version']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT state INTO v_state FROM decision.packages_current p WHERE p.package_id = p_package_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF v_state IN ('committed', 'monitoring', 'closed', 'withdrawn') THEN
    RAISE EXCEPTION 'version rejected: package is %; a committed decision is not re-opened, a new package is declared', v_state USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_open FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.state = 'draft';
  IF v_open > 0 THEN RAISE EXCEPTION 'version rejected: the package already has an open draft; propose it or withdraw it' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_next FROM decision.package_versions WHERE package_id = p_package_id;
  SELECT max(version) INTO v_supersedes FROM decision.package_versions WHERE package_id = p_package_id AND state <> 'draft';
  INSERT INTO decision.package_versions (package_id, version, scope, tenant_id, domain_id, supersedes, state, known_at, observed_through, author_principal_id, correlation_id)
  VALUES (p_package_id, v_next, 'DOMAIN', p_tenant, p_domain, v_supersedes, 'draft', p_known_at, p_observed_through, p_actor, p_correlation);
  IF p_carry_from IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_carry_from AND v.state <> 'draft') THEN
      RAISE EXCEPTION 'version rejected: carry-from source % is not a proposed version of this package', p_carry_from USING ERRCODE = '23503';
    END IF;
    UPDATE decision.package_versions n
       SET objectives = o.objectives, constraints = o.constraints, approver_policy = o.approver_policy, monitoring_conditions = o.monitoring_conditions,
           reversibility = o.reversibility, information_value = o.information_value, second_order = o.second_order, risks = o.risks, opportunities = o.opportunities
      FROM decision.package_versions o
     WHERE n.package_id = p_package_id AND n.version = v_next AND o.package_id = p_package_id AND o.version = p_carry_from;
    INSERT INTO decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason,
                                  uncertainty, second_order, risks, opportunities, reversibility, synthetic_state, controls, set_by, correlation_id)
    SELECT gen_random_uuid(), o.scope, o.tenant_id, o.domain_id, o.package_id, v_next, o.key, o.title, o.kind, o.consequences, o.simulated, o.unsimulated_reason,
           o.uncertainty, o.second_order, o.risks, o.opportunities, o.reversibility, o.synthetic_state, o.controls, p_actor, p_correlation
      FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_carry_from;
  END IF;
  UPDATE decision.packages_current SET current_version = v_next WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.opened', p_actor,
          jsonb_build_object('version', v_next, 'supersedes', v_supersedes, 'known_at', p_known_at, 'observed_through', p_observed_through, 'carried_from', p_carry_from), p_correlation);
  RETURN v_next;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.open_version(uuid,uuid,uuid,timestamptz,date,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.open_version(uuid,uuid,uuid,timestamptz,date,int,uuid,uuid,uuid) TO eye_commit;

/* An option into a DRAFT, once per key; a run it cites must be a COMPLETED run in this domain. */
CREATE OR REPLACE FUNCTION decision.set_option(
  p_option_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_key text, p_title text, p_kind text,
  p_consequences jsonb, p_simulated boolean, p_unsimulated_reason text, p_uncertainty jsonb, p_second_order jsonb, p_risks jsonb, p_opportunities jsonb,
  p_reversibility text, p_synthetic boolean, p_controls jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c jsonb; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.option', 'decision.package.draft']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT v.state INTO v_state FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'option rejected: no such package version in this domain' USING ERRCODE = '23503'; END IF;
  IF v_state <> 'draft' THEN RAISE EXCEPTION 'option rejected: version % is % and immutable; open a new version', p_version, v_state USING ERRCODE = '2F002'; END IF;
  IF NOT decision.citations_ok(p_consequences) THEN RAISE EXCEPTION 'option rejected: consequences must be typed citations with id, version and digest' USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_consequences) LOOP
    IF (c ->> 'kind') = 'run' AND NOT EXISTS (SELECT 1 FROM simulation.runs_current r
        WHERE r.run_id = (c ->> 'id')::uuid AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'completed') THEN
      RAISE EXCEPTION 'option rejected: run % is not a completed run in this domain', c ->> 'id' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  INSERT INTO decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason,
                                uncertainty, second_order, risks, opportunities, reversibility, synthetic_state, controls, set_by, correlation_id)
  VALUES (p_option_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_key, p_title, p_kind, p_consequences, p_simulated, p_unsimulated_reason,
          coalesce(p_uncertainty, '{}'::jsonb), coalesce(p_second_order, '[]'::jsonb), coalesce(p_risks, '[]'::jsonb), coalesce(p_opportunities, '[]'::jsonb),
          p_reversibility, coalesce(p_synthetic, false), coalesce(p_controls, '{}'::jsonb), p_actor, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'option.set', p_actor,
          jsonb_build_object('version', p_version, 'key', p_key, 'kind', p_kind, 'simulated', p_simulated, 'consequences', p_consequences), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.set_option(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,boolean,text,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.set_option(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,boolean,text,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid) TO eye_commit;

/* The terms of a DRAFT: objectives, constraints, approver policy, monitoring conditions, reversibility, information value, second-order effects, risks, opportunities. */
CREATE OR REPLACE FUNCTION decision.set_terms(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_objectives jsonb, p_constraints jsonb, p_policy jsonb, p_conditions jsonb,
  p_reversibility text, p_information_value text, p_second_order jsonb, p_risks jsonb, p_opportunities jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, graph, prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; o jsonb; a jsonb; m jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.terms']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT v.state INTO v_state FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'terms rejected: no such package version in this domain' USING ERRCODE = '23503'; END IF;
  IF v_state <> 'draft' THEN RAISE EXCEPTION 'terms rejected: version % is % and immutable', p_version, v_state USING ERRCODE = '2F002'; END IF;
  IF p_objectives IS NULL OR jsonb_typeof(p_objectives) <> 'array' THEN RAISE EXCEPTION 'terms rejected: objectives must be an array of OBJ ids' USING ERRCODE = '22023'; END IF;
  FOR o IN SELECT * FROM jsonb_array_elements(p_objectives) LOOP
    IF jsonb_typeof(o) <> 'string' OR NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = (o #>> '{}')::uuid
        AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ') THEN
      RAISE EXCEPTION 'terms rejected: objective % is not an OBJ in this domain', o USING ERRCODE = '23503';
    END IF;
  END LOOP;
  IF p_policy IS NULL OR jsonb_typeof(p_policy) <> 'object' THEN RAISE EXCEPTION 'terms rejected: approver_policy must be an object' USING ERRCODE = '22023'; END IF;
  IF NOT (p_policy ? 'quorum') OR jsonb_typeof(p_policy -> 'quorum') <> 'number' OR (p_policy ->> 'quorum')::int < 1 THEN
    RAISE EXCEPTION 'terms rejected: approver_policy.quorum must be a positive integer' USING ERRCODE = '22023';
  END IF;
  IF coalesce(jsonb_array_length(p_policy -> 'principals'), 0) + coalesce(jsonb_array_length(p_policy -> 'roles'), 0) = 0 THEN
    RAISE EXCEPTION 'terms rejected: approver_policy must name at least one human principal or one role' USING ERRCODE = '22023';
  END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p_policy -> 'principals', '[]'::jsonb)) LOOP
    IF jsonb_typeof(a) <> 'string' OR NOT decision.is_active_human((a #>> '{}')::uuid, p_tenant) THEN
      RAISE EXCEPTION 'terms rejected: approver % is not an active human principal in this tenant', a USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p_policy -> 'roles', '[]'::jsonb)) LOOP
    IF jsonb_typeof(a) <> 'string' OR NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = (a #>> '{}')) THEN
      RAISE EXCEPTION 'terms rejected: approver role % is not a registered role', a USING ERRCODE = '23503';
    END IF;
  END LOOP;
  IF p_conditions IS NULL OR jsonb_typeof(p_conditions) <> 'array' THEN RAISE EXCEPTION 'terms rejected: monitoring_conditions must be an array' USING ERRCODE = '22023'; END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
    IF jsonb_typeof(m) <> 'object' OR NOT (m ? 'kind' AND m ? 'owner') THEN
      RAISE EXCEPTION 'terms rejected: each monitoring condition names its kind and owner' USING ERRCODE = '22023';
    END IF;
    IF NOT decision.is_active_human((m ->> 'owner')::uuid, p_tenant) THEN
      RAISE EXCEPTION 'terms rejected: monitoring condition owner % is not an active human principal', m ->> 'owner' USING ERRCODE = '23503';
    END IF;
    IF (m ->> 'kind') = 'indicator' THEN
      IF NOT EXISTS (SELECT 1 FROM prediction.indicators_current i WHERE i.indicator_id = (m ->> 'indicator_id')::uuid AND i.tenant_id = p_tenant AND i.domain_id = p_domain) THEN
        RAISE EXCEPTION 'terms rejected: monitoring condition names indicator % which does not exist in this domain', m ->> 'indicator_id' USING ERRCODE = '23503';
      END IF;
    ELSIF (m ->> 'kind') = 'warning' THEN
      IF NOT (m ? 'branch_id') OR NOT EXISTS (SELECT 1 FROM prediction.branches_current b WHERE b.branch_id = (m ->> 'branch_id')::uuid AND b.tenant_id = p_tenant AND b.domain_id = p_domain) THEN
        RAISE EXCEPTION 'terms rejected: a warning condition names a scenario branch that exists in this domain' USING ERRCODE = '23503';
      END IF;
    ELSIF (m ->> 'kind') = 'review' THEN
      IF NOT (m ? 'every_days') OR jsonb_typeof(m -> 'every_days') <> 'number' OR (m ->> 'every_days')::int < 1 THEN
        RAISE EXCEPTION 'terms rejected: a review condition names every_days' USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'terms rejected: monitoring condition kind % is not indicator, warning or review', m ->> 'kind' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  UPDATE decision.package_versions
     SET objectives = p_objectives, constraints = coalesce(p_constraints, '[]'::jsonb), approver_policy = p_policy, monitoring_conditions = p_conditions,
         reversibility = p_reversibility, information_value = p_information_value, second_order = coalesce(p_second_order, '[]'::jsonb),
         risks = coalesce(p_risks, '[]'::jsonb), opportunities = coalesce(p_opportunities, '[]'::jsonb)
   WHERE package_id = p_package_id AND version = p_version;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'terms.set', p_actor,
          jsonb_build_object('version', p_version, 'objectives', p_objectives, 'approver_policy', p_policy, 'monitoring_conditions', p_conditions), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.set_terms(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.set_terms(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,jsonb,uuid,uuid,uuid) TO eye_commit;

/*
 * THE CHOICE, into a DRAFT: which option, why (the human's own words), by when, at what
 * accepted trade-off, owned by which named human, judged against which measurable
 * outcome criteria. Every criterion carries key, quantity, unit, target, comparator and a
 * date, and names the twin element or indicator it will be observed on.
 */
CREATE OR REPLACE FUNCTION decision.set_choice(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_choice jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; k jsonb; t jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.choice']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT v.state INTO v_state FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'choice rejected: no such package version in this domain' USING ERRCODE = '23503'; END IF;
  IF v_state <> 'draft' THEN RAISE EXCEPTION 'choice rejected: version % is % and immutable; a different choice is a new version', p_version, v_state USING ERRCODE = '2F002'; END IF;
  IF p_choice IS NULL OR jsonb_typeof(p_choice) <> 'object' THEN RAISE EXCEPTION 'choice rejected: the choice must be an object' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = (p_choice ->> 'option_key')) THEN
    RAISE EXCEPTION 'choice rejected: option % is not an option of this version', p_choice ->> 'option_key' USING ERRCODE = '23503';
  END IF;
  IF length(btrim(coalesce(p_choice ->> 'rationale', ''))) < 8 THEN RAISE EXCEPTION 'choice rejected: the rationale is the human''s own words, at least eight characters' USING ERRCODE = '22023'; END IF;
  IF (p_choice ->> 'decision_deadline') IS NULL OR (p_choice ->> 'decision_deadline') !~ '^\d{4}-\d{2}-\d{2}' THEN RAISE EXCEPTION 'choice rejected: decision_deadline must be a date' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_choice -> 'accepted_trade_offs') <> 'array' THEN RAISE EXCEPTION 'choice rejected: accepted_trade_offs must be an array' USING ERRCODE = '22023'; END IF;
  IF NOT decision.is_active_human((p_choice ->> 'action_owner')::uuid, p_tenant) THEN RAISE EXCEPTION 'choice rejected: action_owner must be a named, active human principal in this tenant' USING ERRCODE = '23503'; END IF;
  IF jsonb_typeof(p_choice -> 'outcome_criteria') <> 'array' OR jsonb_array_length(p_choice -> 'outcome_criteria') = 0 THEN
    RAISE EXCEPTION 'choice rejected: at least one measurable outcome criterion is required' USING ERRCODE = '22023';
  END IF;
  FOR k IN SELECT * FROM jsonb_array_elements(p_choice -> 'outcome_criteria') LOOP
    IF jsonb_typeof(k) <> 'object' OR NOT (k ? 'key' AND k ? 'quantity' AND k ? 'unit' AND k ? 'target' AND k ? 'comparator' AND k ? 'by' AND k ? 'observed_on') THEN
      RAISE EXCEPTION 'choice rejected: each outcome criterion carries key, quantity, unit, target, comparator, by and observed_on' USING ERRCODE = '22023';
    END IF;
    IF NOT ((k ->> 'comparator') IN ('<=', '>=', '=', '<', '>')) THEN RAISE EXCEPTION 'choice rejected: comparator must be one of <=, >=, =, <, >' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(k -> 'target') <> 'number' THEN RAISE EXCEPTION 'choice rejected: an outcome target is a number' USING ERRCODE = '22023'; END IF;
  END LOOP;
  UPDATE decision.package_versions SET choice = p_choice WHERE package_id = p_package_id AND version = p_version;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'choice.set', p_actor, jsonb_build_object('version', p_version, 'choice', p_choice), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.set_choice(uuid,uuid,uuid,int,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.set_choice(uuid,uuid,uuid,int,jsonb,uuid,uuid,uuid) TO eye_commit;

/* Dissent: a named HUMAN, on a version that is still open to it; append-only; never removed by approval or commitment. */
CREATE OR REPLACE FUNCTION decision.record_dissent(
  p_dissent_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_principal uuid, p_position text, p_rationale text, p_citation jsonb,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.dissent']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'dissent rejected: dissent is recorded by the acting principal, not on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_principal, p_tenant) THEN
    RAISE EXCEPTION 'dissent rejected: only a named, active human principal may dissent' USING ERRCODE = '42501';
  END IF;
  SELECT v.state INTO v_state FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'dissent rejected: no such package version in this domain' USING ERRCODE = '23503'; END IF;
  IF v_state NOT IN ('draft', 'proposed', 'under_review', 'approved') THEN
    RAISE EXCEPTION 'dissent rejected: version % is %; dissent is recorded before commitment', p_version, v_state USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.dissent (dissent_id, scope, tenant_id, domain_id, package_id, version, principal_id, position, rationale, citation, correlation_id)
  VALUES (p_dissent_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_principal, p_position, p_rationale, p_citation, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'dissent.recorded', p_principal,
          jsonb_build_object('version', p_version, 'dissent_id', p_dissent_id, 'position', p_position), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_dissent(uuid,uuid,uuid,uuid,int,uuid,text,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_dissent(uuid,uuid,uuid,uuid,int,uuid,text,text,jsonb,uuid,uuid) TO eye_commit;

/* The version digest: everything an approval signs — objectives, constraints, options, choice, policy, conditions, terms, cut-offs. */
CREATE OR REPLACE FUNCTION decision.version_digest(p_package_id uuid, p_version int) RETURNS text
STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to((
    SELECT jsonb_build_object(
      'package_id', v.package_id, 'version', v.version, 'known_at', v.known_at, 'observed_through', v.observed_through,
      'objectives', v.objectives, 'constraints', v.constraints, 'approver_policy', v.approver_policy, 'monitoring_conditions', v.monitoring_conditions,
      'choice', v.choice, 'reversibility', v.reversibility, 'information_value', v.information_value,
      'second_order', v.second_order, 'risks', v.risks, 'opportunities', v.opportunities,
      'options', coalesce((SELECT jsonb_agg(jsonb_build_object('key', o.key, 'title', o.title, 'kind', o.kind, 'consequences', o.consequences, 'simulated', o.simulated,
                                                           'unsimulated_reason', o.unsimulated_reason, 'uncertainty', o.uncertainty, 'second_order', o.second_order,
                                                           'risks', o.risks, 'opportunities', o.opportunities, 'reversibility', o.reversibility, 'synthetic_state', o.synthetic_state) ORDER BY o.key)
                          FROM decision.options o WHERE o.package_id = v.package_id AND o.version = v.version), '[]'::jsonb))::text
      FROM decision.package_versions v WHERE v.package_id = p_package_id AND v.version = p_version), 'UTF8')), 'hex');
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.version_digest(uuid,int) TO eye_app, eye_commit;

/*
 * PROPOSAL binds the version: complete or refused (F1). In the same transaction the
 * service admitted the DPK canonical version under the same bound action; the port
 * recomputes the digest and refuses if it differs from what the header carried.
 */
CREATE OR REPLACE FUNCTION decision.propose_version(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_expected_digest text, p_header_digest text, p_baseline_run uuid,
  p_synthetic boolean, p_controls jsonb, p_dependencies jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; v_digest text; v_options int; v_status_quo int; v_bad int; v_baselines int; v_prior int; d jsonb; v_dec uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND OR v.state <> 'draft' THEN RAISE EXCEPTION 'proposal rejected: version % of package % is not an open draft in this domain', p_version, p_package_id USING ERRCODE = '2F002'; END IF;
  IF jsonb_array_length(v.objectives) = 0 THEN RAISE EXCEPTION 'proposal rejected: a package version names at least one objective' USING ERRCODE = '22023'; END IF;
  SELECT count(*), count(*) FILTER (WHERE kind = 'status_quo') INTO v_options, v_status_quo FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version;
  IF v_options < 2 THEN RAISE EXCEPTION 'proposal rejected: a decision compares at least two options' USING ERRCODE = '22023'; END IF;
  IF v_status_quo <> 1 THEN RAISE EXCEPTION 'proposal rejected: exactly one option is the explicit status quo (do nothing)' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_bad FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version AND o.uncertainty = '{}'::jsonb;
  IF v_bad > 0 THEN RAISE EXCEPTION 'proposal rejected: % option(s) carry no uncertainty block', v_bad USING ERRCODE = '22023'; END IF;
  IF v.choice IS NULL THEN RAISE EXCEPTION 'proposal rejected: the choice — option, rationale, deadline, trade-offs, action owner, outcome criteria — is what is proposed; it is missing' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = (v.choice ->> 'option_key')) THEN
    RAISE EXCEPTION 'proposal rejected: the chosen option % is not among this version''s options', v.choice ->> 'option_key' USING ERRCODE = '22023';
  END IF;
  IF v.approver_policy = '{}'::jsonb THEN RAISE EXCEPTION 'proposal rejected: the approver policy is missing' USING ERRCODE = '22023'; END IF;
  -- The author cannot be the only possible approver.
  IF coalesce(jsonb_array_length(v.approver_policy -> 'roles'), 0) = 0
     AND (SELECT count(*) FROM jsonb_array_elements_text(coalesce(v.approver_policy -> 'principals', '[]'::jsonb)) a WHERE a::uuid <> v.author_principal_id) = 0 THEN
    RAISE EXCEPTION 'proposal rejected: the author cannot be the only approver named by the policy' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v.monitoring_conditions) = 0 THEN RAISE EXCEPTION 'proposal rejected: a committed decision is watched — at least one monitoring condition is required' USING ERRCODE = '22023'; END IF;
  -- ONE COMMON BASELINE: every simulated consequence rests on the same control run.
  SELECT count(DISTINCT coalesce(r.control_run_id, r.run_id)) INTO v_baselines
    FROM decision.options o, jsonb_array_elements(o.consequences) c
    JOIN simulation.runs_current r ON r.run_id = (c ->> 'id')::uuid
   WHERE o.package_id = p_package_id AND o.version = p_version AND (c ->> 'kind') = 'run';
  IF v_baselines > 1 THEN RAISE EXCEPTION 'proposal rejected: the options'' simulated consequences rest on % different baselines; one control run is the common baseline', v_baselines USING ERRCODE = '22023'; END IF;
  IF v_baselines = 1 AND p_baseline_run IS DISTINCT FROM (SELECT coalesce(r.control_run_id, r.run_id) FROM decision.options o, jsonb_array_elements(o.consequences) c
      JOIN simulation.runs_current r ON r.run_id = (c ->> 'id')::uuid WHERE o.package_id = p_package_id AND o.version = p_version AND (c ->> 'kind') = 'run' LIMIT 1) THEN
    RAISE EXCEPTION 'proposal rejected: the declared baseline is not the control the cited runs rest on' USING ERRCODE = '22023';
  END IF;
  UPDATE decision.package_versions SET baseline_run_id = p_baseline_run WHERE package_id = p_package_id AND version = p_version;
  v_digest := decision.version_digest(p_package_id, p_version);
  IF p_expected_digest IS NULL OR v_digest <> p_expected_digest THEN
    RAISE EXCEPTION 'proposal rejected: the version changed between digesting and proposing (% vs %)', p_expected_digest, v_digest USING ERRCODE = '22023';
  END IF;
  UPDATE decision.package_versions
     SET state = 'proposed', version_digest = v_digest, header_digest = p_header_digest, synthetic_state = coalesce(p_synthetic, false),
         controls = coalesce(p_controls, '{}'::jsonb), proposed_by = p_actor, proposed_at = clock_timestamp()
   WHERE package_id = p_package_id AND version = p_version;
  -- Any earlier version still open to approval is superseded: approvals do not carry forward.
  UPDATE decision.package_versions SET state = 'superseded'
   WHERE package_id = p_package_id AND version <> p_version AND state IN ('proposed', 'under_review', 'approved');
  UPDATE decision.packages_current
     SET state = 'proposed', current_version = p_version, synthetic_state = synthetic_state OR coalesce(p_synthetic, false), controls = coalesce(p_controls, controls)
   WHERE package_id = p_package_id;
  -- What the DEC rests on, in the SAME dependency table Phase 3 walks: the package is reached through its DEC.
  SELECT decision_object_id INTO v_dec FROM decision.packages_current WHERE package_id = p_package_id;
  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_dependencies, '[]'::jsonb)) LOOP
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_dec, 'DEC', d ->> 'kind', (d ->> 'id')::uuid,
            format('decision package %s version %s option %s cites it', p_package_id, p_version, d ->> 'key'), 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.proposed', p_actor,
          jsonb_build_object('version', p_version, 'version_digest', v_digest, 'header_digest', p_header_digest, 'choice', v.choice, 'baseline_run_id', p_baseline_run, 'synthetic_state', coalesce(p_synthetic, false)), p_correlation);
  RETURN jsonb_build_object('version_digest', v_digest, 'baseline_run_id', p_baseline_run);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.propose_version(uuid,uuid,uuid,int,text,text,uuid,boolean,jsonb,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.propose_version(uuid,uuid,uuid,int,text,text,uuid,boolean,jsonb,jsonb,uuid,uuid,uuid) TO eye_commit;

/* Withdraw a package that is not committed: terminal, by event. */
CREATE OR REPLACE FUNCTION decision.withdraw_package(
  p_package_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT state INTO v_state FROM decision.packages_current WHERE package_id = p_package_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF v_state IN ('committed', 'monitoring', 'closed') THEN RAISE EXCEPTION 'withdrawal rejected: a committed decision is not withdrawn; it is closed with its outcome' USING ERRCODE = '22023'; END IF;
  UPDATE decision.package_versions SET state = 'superseded' WHERE package_id = p_package_id AND state IN ('proposed', 'under_review', 'approved');
  UPDATE decision.packages_current SET state = 'withdrawn' WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.withdrawn', p_actor, jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.withdraw_package(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.withdraw_package(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 7. Write action, schema DPK@v1, RLS, projection rebuild.
-- ============================================================
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('decision.package.propose', ARRAY['DPK'], 'Proposing a decision package version admits a decision package object and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('DPK', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["decision_object_id","title","statement","owner","version","known_at","observed_through","objectives","options","choice",
               "approver_policy","monitoring_conditions","version_digest","baseline_run_id","synthetic_world"],
  "properties": {
    "decision_object_id": { "type": "string" },
    "title": { "type": "string", "minLength": 2 },
    "statement": { "type": "string", "minLength": 2 },
    "owner": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "supersedes": { "type": ["integer","null"] },
    "known_at": { "type": "string" },
    "observed_through": { "type": ["string","null"] },
    "objectives": { "type": "array", "minItems": 1, "items": { "type": "string" } },
    "constraints": { "type": "array" },
    "options": { "type": "array", "minItems": 2, "items": { "type": "object",
      "required": ["key","title","kind","consequences","simulated","uncertainty"],
      "properties": { "key": { "type": "string" }, "title": { "type": "string" }, "kind": { "enum": ["intervention","status_quo"] },
                      "consequences": { "type": "array", "items": { "type": "object", "required": ["kind","id","version","digest"],
                        "properties": { "kind": { "enum": ["run","forecast","claim","evidence","assumption","warning"] }, "id": { "type": "string" },
                                        "version": { "type": "integer", "minimum": 1 }, "digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" } } } },
                      "simulated": { "type": "boolean" }, "unsimulated_reason": { "type": ["string","null"] }, "uncertainty": { "type": "object" },
                      "second_order": { "type": "array" }, "risks": { "type": "array" }, "opportunities": { "type": "array" }, "reversibility": { "type": ["string","null"] },
                      "synthetic_state": { "type": "boolean" } } } },
    "choice": { "type": "object", "required": ["option_key","rationale","decision_deadline","accepted_trade_offs","action_owner","outcome_criteria"],
      "properties": { "option_key": { "type": "string" }, "rationale": { "type": "string" }, "decision_deadline": { "type": "string" },
                      "accepted_trade_offs": { "type": "array" }, "action_owner": { "type": "string" },
                      "outcome_criteria": { "type": "array", "minItems": 1, "items": { "type": "object", "required": ["key","quantity","unit","target","comparator","by","observed_on"] } } } },
    "approver_policy": { "type": "object", "required": ["quorum"] },
    "monitoring_conditions": { "type": "array", "minItems": 1 },
    "reversibility": { "type": ["string","null"] },
    "information_value": { "type": ["string","null"] },
    "second_order": { "type": "array" }, "risks": { "type": "array" }, "opportunities": { "type": "array" },
    "version_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "baseline_run_id": { "type": ["string","null"] },
    "synthetic_world": { "type": "boolean" }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['package_events', 'packages_current', 'package_versions', 'options', 'dissent'] LOOP
    EXECUTE format('ALTER TABLE decision.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE decision.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY decision_isolation ON decision.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON decision.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION decision.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint)
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid;
BEGIN
  v_tenant := public.eye_tenant(); v_domain := public.eye_domain();
  RETURN QUERY
    WITH declared AS (SELECT DISTINCT package_id FROM decision.package_events WHERE tenant_id = v_tenant AND domain_id = v_domain AND event = 'package.declared'),
         live AS (SELECT package_id FROM decision.packages_current WHERE tenant_id = v_tenant AND domain_id = v_domain)
    SELECT 'packages_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM declared),
           (SELECT count(*) FROM (SELECT package_id FROM declared EXCEPT SELECT package_id FROM live) x);
  RETURN QUERY
    WITH proposed AS (SELECT DISTINCT package_id, (details ->> 'version')::int AS version FROM decision.package_events
                       WHERE tenant_id = v_tenant AND domain_id = v_domain AND event = 'version.proposed'),
         live AS (SELECT package_id, version FROM decision.package_versions WHERE tenant_id = v_tenant AND domain_id = v_domain AND state <> 'draft')
    SELECT 'package_versions(proposed)'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM proposed),
           (SELECT count(*) FROM (SELECT * FROM proposed EXCEPT SELECT * FROM live) x);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.rebuild_projections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.rebuild_projections() TO eye_app, eye_commit;
