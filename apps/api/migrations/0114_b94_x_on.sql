-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 §ON — CP-6 B94: THE ONBOARDING PROGRAMME, SPONSOR INTENT, STEPS, THE DRAFT DOMAIN, CONFIGURATION BASELINES AND DRIFT
-- (V1 V01-T-033 [managed configurations]; V8 PR-67-001, PR-67-002 [programme, responsibility pointer, baseline], CAP-DL-04, CAP-DL-05, PER-21
-- [§ON's acts], JRN-01; V9 UX-66-001, UX-66-002, CAP-PD-04, CAP-PD-05). Part-local: applies alone on 0001–0113 + the prelude (0114 §0).
--
-- What this section builds on the prelude's onboarding.programmes and ledger:
--   §ON.1 the programme's ports — open (v1 planned), revise, hold, resume, withdraw; every change a NEW VERSION (digest, effective time); a
--         programme leaves `planned` only with the customer sponsor's recorded intent (JRN-01); accepted is §MG's (its own port, by reading);
--   §ON.2 SPONSOR INTENT — the customer sponsor's own record (a named human holding customer_sponsor; never a lead, never an agent), versioned;
--   §ON.3 STEPS (JRN-01 + JRN-23; reversibility PR-67-001) — a closed list of step keys, each realized by a governed act VALIDATED against its
--         record (a domain of the tenant, a principal, an attention policy version, a source contract, a package version, a workflow
--         definition, a licence/contract version, a responsibility matrix version, a configuration baseline, or a record §MG/§IM ledgered),
--         its evidence and its COMPENSATION (the governed act that reverses it — required for `done`); a revert RECORDS the compensating act by
--         reference and never performs it;
--   §ON.4 THE DRAFT DOMAIN (D4) — tenancy.create_domain_draft: a tenant administrator, the 0019 create_domain idiom, status `draft`, lifecycle
--         `domain.drafted`; the programme's next version names it. tenancy.create_domain (the existing route) is UNCHANGED; activation is §MG's;
--   §ON.5 CONFIGURATION BASELINES (D6, CAP-DL-05) — the digested set of VERSION POINTERS of a domain (attention policy version, approved
--         analytics purposes, active package versions, workflow definitions, active source contracts, the role-binding CENSUS by role — counts,
--         never persons —, the licence version), captured / promoted and proposed by the implementation lead, APPROVED and SIGNED by the
--         onboarding authority (executive.signatures subject kind config_baseline) on the exact digest; DRIFT = the same pointers observed live
--         against the approved baseline (added / removed / changed), recorded only on change with an `onboarding.drift` item; the ROLLBACK
--         PLAN is a read (TypeScript) naming the governed act that restores each drifted pointer — never a direct write.
--
-- THREE CLAIMS: this file is CONSTRUCTION. An approval by a SYNTHETIC persona in the act is DEMONSTRATED OPERATION. Real customer acceptance
-- is R2 and never written here. Production admission and profile parity: R1 / B111.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §ON.0 VOCABULARY AND GUARDS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The step keys, in the order of JRN-01 (context: intent → domain → authority → policy → sources/packages/workflows → licence →
   responsibility → baseline) and JRN-23 (mapping → rehearsal → reconciliation → training → cutover → acceptance). */
CREATE OR REPLACE FUNCTION onboarding.step_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'intent', 'domain', 'authority', 'policy', 'sources', 'packages', 'workflows', 'licence', 'responsibility', 'baseline',
  'mapping', 'rehearsal', 'reconciliation', 'training', 'cutover', 'acceptance'] $$;
GRANT EXECUTE ON FUNCTION onboarding.step_keys() TO eye_app, eye_commit;

/* The realizing record kinds a step key admits. The `ledgered` kinds are §MG's and §IM's records: validated by their ledger (every governed
   act writes its event), since their tables are not this section's. */
CREATE OR REPLACE FUNCTION onboarding.step_realization_kinds(p_step_key text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_step_key
    WHEN 'intent' THEN ARRAY['sponsor_intent']
    WHEN 'domain' THEN ARRAY['domain']
    WHEN 'authority' THEN ARRAY['principal', 'role_binding']
    WHEN 'policy' THEN ARRAY['attention_policy', 'analytics_purpose']
    WHEN 'sources' THEN ARRAY['source_contract']
    WHEN 'packages' THEN ARRAY['package_version']
    WHEN 'workflows' THEN ARRAY['workflow_definition']
    WHEN 'licence' THEN ARRAY['licence', 'contract']
    WHEN 'responsibility' THEN ARRAY['responsibility_matrix']
    WHEN 'baseline' THEN ARRAY['config_baseline']
    WHEN 'mapping' THEN ARRAY['mapping', 'migration_wave']
    WHEN 'rehearsal' THEN ARRAY['rehearsal', 'migration_wave']
    WHEN 'reconciliation' THEN ARRAY['reconciliation', 'migration_wave']
    WHEN 'training' THEN ARRAY['training_path', 'training_record', 'implementation_programme', 'readiness_gate']
    WHEN 'cutover' THEN ARRAY['cutover', 'migration_wave']
    WHEN 'acceptance' THEN ARRAY['acceptance', 'readiness_gate', 'implementation_programme']
    ELSE ARRAY[]::text[] END $$;
GRANT EXECUTE ON FUNCTION onboarding.step_realization_kinds(text) TO eye_app, eye_commit;
CREATE OR REPLACE FUNCTION onboarding.ledgered_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'migration_wave', 'mapping', 'rehearsal', 'reconciliation', 'cutover', 'rollback', 'acceptance', 'training_path', 'training_record',
  'readiness_gate', 'implementation_programme'] $$;

CREATE OR REPLACE FUNCTION onboarding.profiles() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['local-dev', 'saas', 'private-cloud', 'on-premise'] $$;

/* A versioned row is immutable but for the one supersession stamp (superseded_at NULL → a time); never deleted. */
CREATE OR REPLACE FUNCTION onboarding.on_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'table %.% keeps every version (B94 §ON): DELETE prohibited', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.superseded_at IS NULL AND NEW.superseded_at IS NOT NULL AND (to_jsonb(NEW) - 'superseded_at') = (to_jsonb(OLD) - 'superseded_at') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'table %.% keeps every version (B94 §ON): a version is immutable; a change is a new version', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'raise_exception';
END $$;
-- the prelude's programmes table: §ON writes it — every version kept, only its supersession stamped (B94 on)
CREATE TRIGGER obp_version_guard BEFORE UPDATE OR DELETE ON onboarding.programmes FOR EACH ROW EXECUTE FUNCTION onboarding.on_version_guard();

-- §ON.2 SPONSOR INTENT (table) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The customer sponsor's OWN record of why and what (JRN-01): objectives, the scope statement, success measures, constraints, the target
   domain's name and the deployment profile. TENANT-scoped; one intent per programme, versioned (a new version supersedes). */
CREATE TABLE onboarding.sponsor_intents (
  intent_id            uuid NOT NULL,
  version              int  NOT NULL CHECK (version >= 1),
  scope                text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id            uuid NOT NULL REFERENCES tenancy.tenants (id),
  programme_id         uuid NOT NULL,
  sponsor_principal_id uuid NOT NULL,
  objectives           jsonb NOT NULL CHECK (jsonb_typeof(objectives) = 'array' AND jsonb_array_length(objectives) >= 1),
  scope_statement      text NOT NULL CHECK (length(btrim(scope_statement)) BETWEEN 16 AND 4000),
  success_measures     jsonb NOT NULL CHECK (jsonb_typeof(success_measures) = 'array' AND jsonb_array_length(success_measures) >= 1),
  constraints          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(constraints) = 'array'),
  target_domain_name   text NOT NULL CHECK (length(btrim(target_domain_name)) BETWEEN 2 AND 200),
  deployment_profile   text NOT NULL CHECK (deployment_profile IN ('local-dev', 'saas', 'private-cloud', 'on-premise')),
  digest               text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at        timestamptz,
  correlation_id       uuid NOT NULL,
  PRIMARY KEY (intent_id, version)
);
CREATE UNIQUE INDEX osi_one_current ON onboarding.sponsor_intents (programme_id) WHERE superseded_at IS NULL;
CREATE TRIGGER osi_version_guard BEFORE UPDATE OR DELETE ON onboarding.sponsor_intents FOR EACH ROW EXECUTE FUNCTION onboarding.on_version_guard();

-- §ON.3 STEPS (table) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* One row per (programme, step key) — the step's CURRENT state; its every change is a ledger event carrying the full snapshot and digest (the
   replay). realized_by = {kind, id, version?, action, label} of the governed act's record (validated); compensation = {action, description}
   (the governed act that reverses the step — required for `done`); reverted_by = the compensating act RECORDED by reference. */
CREATE TABLE onboarding.steps (
  step_id          uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL REFERENCES tenancy.tenants (id),
  programme_id     uuid NOT NULL,
  step_key         text NOT NULL CHECK (step_key = ANY (onboarding.step_keys())),
  ordinal          int  NOT NULL CHECK (ordinal >= 1),
  version          int  NOT NULL CHECK (version >= 1),
  state            text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'in_progress', 'done', 'held', 'reverted')),
  realized_by      jsonb CHECK (realized_by IS NULL OR jsonb_typeof(realized_by) = 'object'),
  evidence         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  compensation     jsonb CHECK (compensation IS NULL OR jsonb_typeof(compensation) = 'object'),
  held_reason      text,
  reverted_by      jsonb CHECK (reverted_by IS NULL OR jsonb_typeof(reverted_by) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT ost_once UNIQUE (programme_id, step_key),
  CONSTRAINT ost_done CHECK (state <> 'done' OR (realized_by IS NOT NULL AND compensation IS NOT NULL)),
  CONSTRAINT ost_held CHECK (state <> 'held' OR length(btrim(coalesce(held_reason, ''))) >= 8),
  CONSTRAINT ost_reverted CHECK (state <> 'reverted' OR reverted_by IS NOT NULL)
);
CREATE INDEX ost_programme ON onboarding.steps (programme_id, ordinal);
/* A step is never deleted and never moves to another programme or key. */
CREATE OR REPLACE FUNCTION onboarding.ost_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'onboarding.steps keeps every step (B94 §ON): DELETE prohibited' USING ERRCODE = 'raise_exception'; END IF;
  IF NEW.step_id <> OLD.step_id OR NEW.programme_id <> OLD.programme_id OR NEW.step_key <> OLD.step_key OR NEW.tenant_id <> OLD.tenant_id OR NEW.created_by <> OLD.created_by
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'onboarding.steps: a step keeps its identity, programme and key; each change is the next version' USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ost_guard BEFORE UPDATE OR DELETE ON onboarding.steps FOR EACH ROW EXECUTE FUNCTION onboarding.ost_guard();

-- §ON.5 CONFIGURATION BASELINES (tables) ────────────────────────────────────────────────────────────────────────────────────────────────────
/* One lineage per domain (baseline_id constant), versioned: draft (captured or promoted by the implementation lead) → proposed → approved
   (the onboarding authority, digest-bound, SIGNED) | rejected; an approved version is superseded when the next is approved. The pointers and
   the digest of a version never change. */
CREATE TABLE onboarding.config_baselines (
  baseline_id      uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid,
  pointers         jsonb NOT NULL CHECK (jsonb_typeof(pointers) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  basis            text NOT NULL CHECK (basis IN ('capture', 'promotion')),
  promoted_from    int,
  absorbed         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(absorbed) = 'array'),
  state            text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'proposed', 'approved', 'rejected', 'superseded')),
  captured_by      uuid NOT NULL,
  captured_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  proposed_by      uuid,
  proposed_at      timestamptz,
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  signature_id     uuid,
  effective_from   timestamptz,
  superseded_at    timestamptz,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (baseline_id, version),
  CONSTRAINT ocb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ocb_promotion CHECK ((basis = 'promotion') = (promoted_from IS NOT NULL)),
  CONSTRAINT ocb_proposed CHECK (state = 'draft' OR (proposed_by IS NOT NULL AND proposed_at IS NOT NULL)),
  CONSTRAINT ocb_decided CHECK (state IN ('draft', 'proposed') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND length(btrim(coalesce(decision_reason, ''))) >= 8)),
  CONSTRAINT ocb_sod CHECK (decided_by IS NULL OR (decided_by <> captured_by AND decided_by <> proposed_by)),
  CONSTRAINT ocb_signed CHECK (state NOT IN ('approved', 'superseded') OR (signature_id IS NOT NULL AND effective_from IS NOT NULL)),
  CONSTRAINT ocb_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX ocb_domain_version ON onboarding.config_baselines (tenant_id, domain_id, version);
CREATE UNIQUE INDEX ocb_one_approved ON onboarding.config_baselines (tenant_id, domain_id) WHERE state = 'approved';
CREATE UNIQUE INDEX ocb_one_open ON onboarding.config_baselines (tenant_id, domain_id) WHERE state IN ('draft', 'proposed');
CREATE OR REPLACE FUNCTION onboarding.ocb_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'onboarding.config_baselines keeps every version (B94 §ON): DELETE prohibited' USING ERRCODE = 'raise_exception'; END IF;
  IF NEW.baseline_id <> OLD.baseline_id OR NEW.version <> OLD.version OR NEW.tenant_id <> OLD.tenant_id OR NEW.domain_id <> OLD.domain_id OR NEW.pointers <> OLD.pointers
     OR NEW.digest <> OLD.digest OR NEW.basis <> OLD.basis OR NEW.captured_by <> OLD.captured_by OR NEW.captured_at <> OLD.captured_at
     OR NEW.absorbed <> OLD.absorbed OR NEW.promoted_from IS DISTINCT FROM OLD.promoted_from THEN
    RAISE EXCEPTION 'onboarding.config_baselines: the pointers and digest of a version never change; a change is a promotion (a new version)' USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.state IN ('rejected', 'superseded') THEN
    RAISE EXCEPTION 'onboarding.config_baselines: a % version is final', OLD.state USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ocb_guard BEFORE UPDATE OR DELETE ON onboarding.config_baselines FOR EACH ROW EXECUTE FUNCTION onboarding.ocb_guard();

/* DRIFT OBSERVATIONS (append-only): recorded only when the observed state against the approved baseline CHANGES (a new drift, a different
   drift, or back in line). */
CREATE TABLE onboarding.drift_events (
  event_id          uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  baseline_id       uuid NOT NULL,
  baseline_version  int  NOT NULL,
  baseline_digest   text NOT NULL CHECK (baseline_digest ~ '^[0-9a-f]{64}$'),
  observed_digest   text NOT NULL CHECK (observed_digest ~ '^[0-9a-f]{64}$'),
  state             text NOT NULL CHECK (state IN ('drifted', 'in_sync')),
  changes           jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array'),
  observed          jsonb NOT NULL CHECK (jsonb_typeof(observed) = 'object'),
  item              jsonb,
  recorded_by       uuid NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT ode_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ode_changes CHECK ((state = 'drifted') = (jsonb_array_length(changes) > 0))
);
CREATE INDEX ode_domain ON onboarding.drift_events (tenant_id, domain_id, recorded_at DESC);
CREATE TRIGGER ode_append_only BEFORE UPDATE OR DELETE ON onboarding.drift_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants: TENANT rows under the tenant; DOMAIN rows under the domain_isolation idiom; SELECT to eye_app and eye_commit; no write grant.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onboarding.sponsor_intents', 'onboarding.steps'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (tenant_id = public.eye_tenant())', t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['onboarding.config_baselines', 'onboarding.drift_events'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §ON.1 THE PROGRAMME'S PORTS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION onboarding.programme_digest(p onboarding.programmes) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('programme_id', p.programme_id, 'version', p.version, 'programme_key', p.programme_key, 'title', p.title,
    'target_domain_id', p.target_domain_id, 'deployment_profile', p.deployment_profile, 'owner', p.owner_principal_id, 'state', p.state,
    'held_reasons', p.held_reasons, 'plan', p.plan)) $$;

/* The acting principal's live roles among p_roles (for the record of who held what). */
CREATE OR REPLACE FUNCTION onboarding.roles_held(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT b.role_code ORDER BY b.role_code), '{}') FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
   WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
     AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND p_domain IS NOT NULL AND b.domain_id = p_domain)) $$;
REVOKE ALL ON FUNCTION onboarding.roles_held(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* The common head of every §ON TENANT port: the bound action, the tenant context, the acting principal, one of the roles. */
CREATE OR REPLACE FUNCTION onboarding._on_tenant_head(p_action text, p_noun text, p_tenant uuid, p_actor uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  PERFORM onboarding.assert_tenant(p_tenant, p_noun);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is the act of a %', p_noun, p_what, array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION onboarding._on_tenant_head(text, text, uuid, uuid, text[], text) FROM PUBLIC;

/* The next version of a programme (internal): the current version superseded, the next inserted with its digest, the ledger written. */
CREATE OR REPLACE FUNCTION onboarding._programme_next(cur onboarding.programmes, p_title text, p_target uuid, p_profile text, p_state text, p_held jsonb, p_plan jsonb,
                                                     p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS onboarding.programmes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE n onboarding.programmes%ROWTYPE;
BEGIN
  UPDATE onboarding.programmes SET superseded_at = clock_timestamp() WHERE programme_id = cur.programme_id AND version = cur.version;
  n := cur;
  n.version := cur.version + 1; n.title := p_title; n.target_domain_id := p_target; n.deployment_profile := p_profile; n.state := p_state;
  n.held_reasons := p_held; n.plan := p_plan; n.effective_from := clock_timestamp(); n.superseded_at := NULL; n.created_by := p_actor;
  n.created_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := onboarding.programme_digest(n);
  INSERT INTO onboarding.programmes VALUES (n.*);
  PERFORM onboarding.ledger('onboarding', n.tenant_id, NULL, 'onboarding_programme', n.programme_id, n.version, p_event, p_actor,
            coalesce(p_details, '{}'::jsonb) || jsonb_build_object('state', n.state, 'digest', n.digest, 'prior_version', cur.version, 'prior_state', cur.state,
                                                                 'target_domain_id', n.target_domain_id, 'held_reasons', n.held_reasons), p_correlation);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION onboarding._programme_next(onboarding.programmes, text, uuid, text, text, jsonb, jsonb, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The current version of a programme of the tenant, locked (404 when unknown). */
CREATE OR REPLACE FUNCTION onboarding._programme_current(p_programme uuid, p_tenant uuid, p_noun text) RETURNS onboarding.programmes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE;
BEGIN
  SELECT * INTO p FROM onboarding.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_programme): % is not an onboarding programme of this tenant', p_noun, p_programme USING ERRCODE = '22023'; END IF;
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION onboarding._programme_current(uuid, uuid, text) FROM PUBLIC;

/* OPEN (onboarding.programme.open): an implementation lead or the tenant administrator opens v1 `planned`; the owner (the opener unless named)
   holds one of those roles. TENANT-scoped. */
CREATE OR REPLACE FUNCTION onboarding.open_programme(p_programme uuid, p_tenant uuid, p_key text, p_title text, p_profile text, p_plan jsonb, p_owner uuid,
                                                    p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE n onboarding.programmes%ROWTYPE; v_owner uuid := coalesce(p_owner, p_actor);
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.programme.open', 'onboarding programme', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin'], 'opening an onboarding programme');
  IF NOT onboarding.holds_role(v_owner, p_tenant, NULL, ARRAY['implementation_lead', 'tenant_admin']) THEN
    RAISE EXCEPTION 'onboarding programme rejected (ownership): the owner of a programme is an active implementation lead or tenant administrator of the tenant' USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'onboarding programme rejected (key): a programme key is 3–63 lower-case characters (a-z 0-9 _ . -)' USING ERRCODE = '22023'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'onboarding programme rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_profile, 'local-dev') <> ALL (onboarding.profiles()) THEN RAISE EXCEPTION 'onboarding programme rejected (profile): the deployment profile is one of %', array_to_string(onboarding.profiles(), ', ') USING ERRCODE = '22023'; END IF;
  IF p_plan IS NOT NULL AND jsonb_typeof(p_plan) <> 'object' THEN RAISE EXCEPTION 'onboarding programme rejected (plan): the plan is an object' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM onboarding.programmes x WHERE x.tenant_id = p_tenant AND x.programme_key = p_key AND x.superseded_at IS NULL) THEN
    RAISE EXCEPTION 'onboarding programme rejected (duplicate): the tenant already has a programme %', p_key USING ERRCODE = '22023';
  END IF;
  n.programme_id := p_programme; n.version := 1; n.scope := 'TENANT'; n.tenant_id := p_tenant; n.programme_key := p_key; n.title := btrim(p_title);
  n.target_domain_id := NULL; n.deployment_profile := coalesce(p_profile, 'local-dev'); n.owner_principal_id := v_owner; n.state := 'planned';
  n.held_reasons := '[]'::jsonb; n.plan := coalesce(p_plan, '{}'::jsonb); n.effective_from := clock_timestamp(); n.superseded_at := NULL;
  n.created_by := p_actor; n.created_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := onboarding.programme_digest(n);
  INSERT INTO onboarding.programmes VALUES (n.*);
  PERFORM onboarding.ledger('onboarding', p_tenant, NULL, 'onboarding_programme', p_programme, 1, 'programme.opened', p_actor,
            jsonb_build_object('state', 'planned', 'digest', n.digest, 'programme_key', p_key, 'title', n.title, 'owner', v_owner, 'deployment_profile', n.deployment_profile), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.open_programme(uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.open_programme(uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid) TO eye_commit;

/* REVISE (onboarding.programme.revise): the title, plan or deployment profile — a new version; the version read is named (stale → 409). */
CREATE OR REPLACE FUNCTION onboarding.revise_programme(p_programme uuid, p_tenant uuid, p_expected int, p_title text, p_plan jsonb, p_profile text, p_reason text,
                                                      p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; n onboarding.programmes%ROWTYPE; v_changed text[] := '{}';
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.programme.revise', 'onboarding programme', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin'], 'revising an onboarding programme');
  p := onboarding._programme_current(p_programme, p_tenant, 'onboarding programme');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'onboarding programme rejected (state): programme % is %; it is not revised', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_expected IS DISTINCT FROM p.version THEN RAISE EXCEPTION 'onboarding programme rejected (stale): the revision names v%, the programme is at v%', coalesce(p_expected::text, '?'), p.version USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding programme rejected (reason): a revision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_title IS NOT NULL AND length(btrim(p_title)) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'onboarding programme rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_profile IS NOT NULL AND p_profile <> ALL (onboarding.profiles()) THEN RAISE EXCEPTION 'onboarding programme rejected (profile): the deployment profile is one of %', array_to_string(onboarding.profiles(), ', ') USING ERRCODE = '22023'; END IF;
  IF p_plan IS NOT NULL AND jsonb_typeof(p_plan) <> 'object' THEN RAISE EXCEPTION 'onboarding programme rejected (plan): the plan is an object' USING ERRCODE = '22023'; END IF;
  IF p_title IS NOT NULL AND btrim(p_title) <> p.title THEN v_changed := array_append(v_changed, 'title'); END IF;
  IF p_plan IS NOT NULL AND p_plan <> p.plan THEN v_changed := array_append(v_changed, 'plan'); END IF;
  IF p_profile IS NOT NULL AND p_profile <> p.deployment_profile THEN v_changed := array_append(v_changed, 'deployment_profile'); END IF;
  IF cardinality(v_changed) = 0 THEN RAISE EXCEPTION 'onboarding programme rejected (unchanged): the revision changes nothing of v%', p.version USING ERRCODE = '22023'; END IF;
  n := onboarding._programme_next(p, coalesce(btrim(p_title), p.title), p.target_domain_id, coalesce(p_profile, p.deployment_profile), p.state, p.held_reasons, coalesce(p_plan, p.plan),
                                  'programme.revised', p_actor, jsonb_build_object('reason', btrim(p_reason), 'changed', to_jsonb(v_changed)), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.revise_programme(uuid, uuid, int, text, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.revise_programme(uuid, uuid, int, text, jsonb, text, text, uuid, uuid) TO eye_commit;

/* HOLD (onboarding.programme.hold): any accountable party (the lead, the tenant administrator, the customer sponsor, the onboarding
   authority) holds the programme with a reason; a held programme records no step. Holding a held programme adds a reason. */
CREATE OR REPLACE FUNCTION onboarding.hold_programme(p_programme uuid, p_tenant uuid, p_expected int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; n onboarding.programmes%ROWTYPE;
        v_roles text[] := ARRAY['implementation_lead', 'tenant_admin', 'customer_sponsor', 'onboarding_authority'];
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.programme.hold', 'onboarding programme', p_tenant, p_actor, v_roles, 'holding an onboarding programme');
  p := onboarding._programme_current(p_programme, p_tenant, 'onboarding programme');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'onboarding programme rejected (state): programme % is %; it is not held', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_expected IS DISTINCT FROM p.version THEN RAISE EXCEPTION 'onboarding programme rejected (stale): the hold names v%, the programme is at v%', coalesce(p_expected::text, '?'), p.version USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding programme rejected (reason): a hold states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  n := onboarding._programme_next(p, p.title, p.target_domain_id, p.deployment_profile, 'held',
          p.held_reasons || jsonb_build_array(jsonb_build_object('reason', btrim(p_reason), 'held_by', p_actor, 'held_by_roles', to_jsonb(onboarding.roles_held(p_actor, p_tenant, NULL, v_roles)),
                                                                  'held_at', clock_timestamp(), 'state_before', CASE WHEN p.state = 'held' THEN NULL ELSE p.state END)),
          p.plan, 'programme.held', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.hold_programme(uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.hold_programme(uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* RESUME (onboarding.programme.resume): a held programme returns to the state it held from (planned → planned; otherwise in_progress). A hold
   placed by the customer's sponsor or authority is released only by the customer's sponsor or authority (adoption never bypasses authority). */
CREATE OR REPLACE FUNCTION onboarding.resume_programme(p_programme uuid, p_tenant uuid, p_expected int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; n onboarding.programmes%ROWTYPE; v_to text;
        v_roles text[] := ARRAY['implementation_lead', 'tenant_admin', 'customer_sponsor', 'onboarding_authority'];
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.programme.resume', 'onboarding programme', p_tenant, p_actor, v_roles, 'resuming an onboarding programme');
  p := onboarding._programme_current(p_programme, p_tenant, 'onboarding programme');
  IF p.state <> 'held' THEN RAISE EXCEPTION 'onboarding programme rejected (state): programme % is %, not held', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_expected IS DISTINCT FROM p.version THEN RAISE EXCEPTION 'onboarding programme rejected (stale): the resumption names v%, the programme is at v%', coalesce(p_expected::text, '?'), p.version USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding programme rejected (reason): a resumption states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p.held_reasons) h WHERE (h -> 'held_by_roles') ?| ARRAY['customer_sponsor', 'onboarding_authority'])
     AND NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['customer_sponsor', 'onboarding_authority']) THEN
    RAISE EXCEPTION 'onboarding programme rejected (separation_of_duties): a hold placed by the customer''s sponsor or onboarding authority is released only by the customer''s sponsor or authority' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce((SELECT h ->> 'state_before' FROM jsonb_array_elements(p.held_reasons) WITH ORDINALITY x(h, i) WHERE h ->> 'state_before' IS NOT NULL ORDER BY i LIMIT 1), 'planned') INTO v_to;
  n := onboarding._programme_next(p, p.title, p.target_domain_id, p.deployment_profile, v_to, '[]'::jsonb, p.plan, 'programme.resumed', p_actor,
                                  jsonb_build_object('reason', btrim(p_reason), 'released', p.held_reasons), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.resume_programme(uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.resume_programme(uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* WITHDRAW (onboarding.programme.withdraw — human-gated): the customer sponsor or the tenant administrator, a named human, ends the programme.
   Final. A draft domain it created stays draft (never activated). */
CREATE OR REPLACE FUNCTION onboarding.withdraw_programme(p_programme uuid, p_tenant uuid, p_expected int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; n onboarding.programmes%ROWTYPE;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.programme.withdraw', 'onboarding programme', p_tenant, p_actor, ARRAY['customer_sponsor', 'tenant_admin'], 'withdrawing an onboarding programme');
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'onboarding programme rejected (actor): withdrawing a programme is a named human''s act' USING ERRCODE = '42501';
  END IF;
  p := onboarding._programme_current(p_programme, p_tenant, 'onboarding programme');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'onboarding programme rejected (state): programme % is already %', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_expected IS DISTINCT FROM p.version THEN RAISE EXCEPTION 'onboarding programme rejected (stale): the withdrawal names v%, the programme is at v%', coalesce(p_expected::text, '?'), p.version USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding programme rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  n := onboarding._programme_next(p, p.title, p.target_domain_id, p.deployment_profile, 'withdrawn', '[]'::jsonb, p.plan, 'programme.withdrawn', p_actor,
                                  jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.withdraw_programme(uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.withdraw_programme(uuid, uuid, int, text, uuid, uuid) TO eye_commit;

-- §ON.2 SPONSOR INTENT (port) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* RECORD (onboarding.intent.record — human-gated): the CUSTOMER SPONSOR's own record — a named active human holding customer_sponsor, never an
   implementation lead (even one also holding the sponsor role), never an agent. The intent version read is named (0 for the first). */
CREATE OR REPLACE FUNCTION onboarding.record_intent(p_tenant uuid, p_programme uuid, p_expected int, p_objectives jsonb, p_scope text, p_measures jsonb, p_constraints jsonb,
                                                   p_target_name text, p_profile text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; cur onboarding.sponsor_intents%ROWTYPE; n onboarding.sponsor_intents%ROWTYPE; v_bad int;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.intent.record', 'sponsor intent', p_tenant, p_actor, ARRAY['customer_sponsor'], 'the sponsor intent');
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'sponsor intent rejected (actor): the sponsor intent is a named human sponsor''s own record; an agent never records it' USING ERRCODE = '42501';
  END IF;
  IF onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION 'sponsor intent rejected (separation_of_duties): an implementation lead never records the customer sponsor''s intent' USING ERRCODE = '42501';
  END IF;
  p := onboarding._programme_current(p_programme, p_tenant, 'sponsor intent');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'sponsor intent rejected (state): programme % is %', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM onboarding.sponsor_intents i WHERE i.programme_id = p_programme AND i.tenant_id = p_tenant AND i.superseded_at IS NULL FOR UPDATE;
  IF coalesce(p_expected, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'sponsor intent rejected (stale): the record names intent v%, the programme''s intent is at v%', coalesce(p_expected::text, '?'), coalesce(cur.version, 0) USING ERRCODE = '22023';
  END IF;
  IF p_objectives IS NULL OR jsonb_typeof(p_objectives) <> 'array' OR jsonb_array_length(p_objectives) = 0 THEN
    RAISE EXCEPTION 'sponsor intent rejected (objectives): the intent names at least one objective' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_bad FROM jsonb_array_elements(p_objectives) o WHERE jsonb_typeof(o) <> 'string' OR length(btrim(o #>> '{}')) < 4;
  IF v_bad > 0 THEN RAISE EXCEPTION 'sponsor intent rejected (objectives): each objective is a statement of 4+ characters' USING ERRCODE = '22023'; END IF;
  IF p_scope IS NULL OR length(btrim(p_scope)) NOT BETWEEN 16 AND 4000 THEN RAISE EXCEPTION 'sponsor intent rejected (scope): the scope statement is 16–4000 characters' USING ERRCODE = '22023'; END IF;
  IF p_measures IS NULL OR jsonb_typeof(p_measures) <> 'array' OR jsonb_array_length(p_measures) = 0 THEN
    RAISE EXCEPTION 'sponsor intent rejected (success_measures): the intent names at least one success measure' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_bad FROM jsonb_array_elements(p_measures) o WHERE jsonb_typeof(o) <> 'string' OR length(btrim(o #>> '{}')) < 4;
  IF v_bad > 0 THEN RAISE EXCEPTION 'sponsor intent rejected (success_measures): each success measure is a statement of 4+ characters' USING ERRCODE = '22023'; END IF;
  IF p_constraints IS NOT NULL AND jsonb_typeof(p_constraints) <> 'array' THEN RAISE EXCEPTION 'sponsor intent rejected (constraints): constraints are a list' USING ERRCODE = '22023'; END IF;
  IF p_target_name IS NULL OR length(btrim(p_target_name)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'sponsor intent rejected (target): the target domain''s name is 2–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_profile IS NULL OR p_profile <> ALL (onboarding.profiles()) THEN RAISE EXCEPTION 'sponsor intent rejected (profile): the deployment profile is one of %', array_to_string(onboarding.profiles(), ', ') USING ERRCODE = '22023'; END IF;
  IF cur.intent_id IS NOT NULL THEN UPDATE onboarding.sponsor_intents SET superseded_at = clock_timestamp() WHERE intent_id = cur.intent_id AND version = cur.version; END IF;
  n.intent_id := coalesce(cur.intent_id, gen_random_uuid()); n.version := coalesce(cur.version, 0) + 1; n.scope := 'TENANT'; n.tenant_id := p_tenant; n.programme_id := p_programme;
  n.sponsor_principal_id := p_actor; n.objectives := p_objectives; n.scope_statement := btrim(p_scope); n.success_measures := p_measures;
  n.constraints := coalesce(p_constraints, '[]'::jsonb); n.target_domain_name := btrim(p_target_name); n.deployment_profile := p_profile;
  n.recorded_at := clock_timestamp(); n.superseded_at := NULL; n.correlation_id := p_correlation;
  n.digest := onboarding.digest(jsonb_build_object('programme_id', p_programme, 'version', n.version, 'sponsor', p_actor, 'objectives', n.objectives, 'scope_statement', n.scope_statement,
                                                   'success_measures', n.success_measures, 'constraints', n.constraints, 'target_domain_name', n.target_domain_name, 'deployment_profile', n.deployment_profile));
  INSERT INTO onboarding.sponsor_intents VALUES (n.*);
  PERFORM onboarding.ledger('onboarding', p_tenant, NULL, 'sponsor_intent', n.intent_id, n.version, 'intent.recorded', p_actor,
            jsonb_build_object('programme_id', p_programme, 'digest', n.digest, 'supersedes', cur.version), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.record_intent(uuid, uuid, int, jsonb, text, jsonb, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.record_intent(uuid, uuid, int, jsonb, text, jsonb, jsonb, text, text, uuid, uuid) TO eye_commit;

-- §ON.3 STEPS (ports) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION onboarding.step_digest(s onboarding.steps) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('step_id', s.step_id, 'programme_id', s.programme_id, 'version', s.version, 'step_key', s.step_key, 'state', s.state,
    'realized_by', s.realized_by, 'evidence', s.evidence, 'compensation', s.compensation, 'held_reason', s.held_reason, 'reverted_by', s.reverted_by)) $$;

/* A compensation: {action (a governed action name), description (8+)}. */
CREATE OR REPLACE FUNCTION onboarding._compensation(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(p) <> 'object' OR coalesce(p ->> 'action', '') !~ '^[a-z][a-z_]*(\.[a-z_]+)+$' OR length(btrim(coalesce(p ->> 'description', ''))) < 8 THEN
    RAISE EXCEPTION 'onboarding step rejected (compensation): a compensation names the governed act that reverses the step {action, description (8+ characters)}' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('action', p ->> 'action', 'description', btrim(p ->> 'description'));
END $$;

/* THE REALIZATION TEST: a reference {kind, id, version?, action} to the record of the governed act, validated against that record IN THIS TENANT
   (p_step_key NULL: any kind — a revert's compensating act). Answers the reference normalized (the version filled from the record). */
CREATE OR REPLACE FUNCTION onboarding.validate_reference(p_tenant uuid, p_programme onboarding.programmes, p_step_key text, p_ref jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_id uuid; v_ver int; v_action text; v_label text; v_ok boolean := false; v_noun text := 'onboarding step';
        v_kinds text[];
BEGIN
  IF p_ref IS NULL OR jsonb_typeof(p_ref) <> 'object' THEN RAISE EXCEPTION 'onboarding step rejected (realized_by): a reference is {kind, id, version?, action}' USING ERRCODE = '22023'; END IF;
  v_kind := p_ref ->> 'kind'; v_action := p_ref ->> 'action';
  v_kinds := CASE WHEN p_step_key IS NULL
                  THEN ARRAY['sponsor_intent', 'domain', 'principal', 'role_binding', 'attention_policy', 'analytics_purpose', 'source_contract', 'package_version',
                             'workflow_definition', 'licence', 'contract', 'responsibility_matrix', 'config_baseline', 'ledger_event'] || onboarding.ledgered_kinds()
                  ELSE onboarding.step_realization_kinds(p_step_key) END;
  IF v_kind IS NULL OR NOT (v_kind = ANY (v_kinds)) THEN
    RAISE EXCEPTION 'onboarding step rejected (realized_by): %step % is realized by a % — not %', CASE WHEN p_step_key IS NULL THEN 'a compensating act of a ' ELSE '' END,
      coalesce(p_step_key, 'reverted'), array_to_string(v_kinds, ' or '), coalesce(v_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_ref ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'onboarding step rejected (realized_by): the reference names the record''s id' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_action, '') !~ '^[a-z][a-z_]*(\.[a-z_]+)+$' THEN
    RAISE EXCEPTION 'onboarding step rejected (realized_by): the reference names the governed action that produced the record' USING ERRCODE = '22023';
  END IF;
  v_id := (p_ref ->> 'id')::uuid;
  IF p_ref ? 'version' AND p_ref ->> 'version' IS NOT NULL THEN
    IF (p_ref ->> 'version') !~ '^[0-9]{1,9}$' THEN RAISE EXCEPTION 'onboarding step rejected (realized_by): a version is a positive integer' USING ERRCODE = '22023'; END IF;
    v_ver := (p_ref ->> 'version')::int;
  END IF;
  IF v_kind IN ('source_contract', 'package_version', 'licence', 'contract', 'responsibility_matrix', 'config_baseline') AND v_ver IS NULL THEN
    RAISE EXCEPTION 'onboarding step rejected (realized_by): a % reference names its version', v_kind USING ERRCODE = '22023';
  END IF;
  CASE v_kind
    WHEN 'sponsor_intent' THEN
      SELECT i.version, 'sponsor intent v' || i.version INTO v_ver, v_label FROM onboarding.sponsor_intents i
       WHERE i.intent_id = v_id AND i.tenant_id = p_tenant AND i.programme_id = p_programme.programme_id AND i.superseded_at IS NULL;
      v_ok := FOUND;
    WHEN 'domain' THEN
      SELECT NULL::int, d.name || ' (' || d.status || ')' INTO v_ver, v_label FROM tenancy.domains d WHERE d.id = v_id AND d.tenant_id = p_tenant;
      v_ok := FOUND;
      IF v_ok AND p_step_key = 'domain' AND p_programme.target_domain_id IS NOT NULL AND p_programme.target_domain_id <> v_id THEN
        RAISE EXCEPTION 'onboarding step rejected (realized_by): the programme''s target domain is %, not %', p_programme.target_domain_id, v_id USING ERRCODE = '22023';
      END IF;
    WHEN 'principal' THEN
      SELECT NULL::int, p.display_name INTO v_ver, v_label FROM identity.principals p WHERE p.id = v_id AND p.tenant_id = p_tenant AND p.status = 'active';
      v_ok := FOUND;
    WHEN 'role_binding' THEN
      SELECT NULL::int, b.role_code || ' (' || b.scope || ')' INTO v_ver, v_label FROM identity.role_bindings b WHERE b.id = v_id AND b.tenant_id = p_tenant AND b.revoked_at IS NULL;
      v_ok := FOUND;
    WHEN 'attention_policy' THEN
      SELECT a.version, 'attention policy v' || a.version INTO v_ver, v_label FROM executive.attention_policies a WHERE a.policy_id = v_id AND a.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'analytics_purpose' THEN
      SELECT a.version, a.purpose_key || ' v' || a.version INTO v_ver, v_label FROM analytics.purposes a WHERE a.purpose_id = v_id AND a.tenant_id = p_tenant AND a.state IN ('approved', 'superseded');
      v_ok := FOUND;
    WHEN 'source_contract' THEN
      SELECT s.contract_version, s.source_key || ' v' || s.contract_version INTO v_ver, v_label FROM observation.source_contracts_current s
       WHERE s.source_id = v_id AND s.contract_version = v_ver AND s.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'package_version' THEN
      SELECT v.version, k.package_key || ' ' || v.semver || ' (' || v.state || ')' INTO v_ver, v_label FROM domain.package_versions v JOIN domain.packages k ON k.package_id = v.package_id
       WHERE v.package_id = v_id AND v.version = v_ver AND v.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'workflow_definition' THEN
      SELECT w.version, w.def_key || ' v' || w.version INTO v_ver, v_label FROM executive.workflow_definitions w WHERE w.definition_id = v_id AND w.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'licence' THEN
      SELECT l.version, l.package_key || ' v' || l.version || ' (' || l.state || ')' INTO v_ver, v_label FROM commercial.licences l WHERE l.licence_id = v_id AND l.version = v_ver AND l.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'contract' THEN
      SELECT c.version, c.contract_ref || ' v' || c.version INTO v_ver, v_label FROM commercial.contracts c WHERE c.contract_id = v_id AND c.version = v_ver AND c.tenant_id = p_tenant;
      v_ok := FOUND;
    WHEN 'responsibility_matrix' THEN
      SELECT m.version, 'responsibility matrix v' || m.version || ' (' || m.state || ')' INTO v_ver, v_label FROM service.responsibility_matrices m
       WHERE m.matrix_id = v_id AND m.version = v_ver AND m.tenant_id = p_tenant AND m.state IN ('approved', 'superseded');
      v_ok := FOUND;
      IF NOT v_ok THEN RAISE EXCEPTION 'onboarding step rejected (realized_by): responsibility matrix %/v% is not an approved matrix of this tenant', v_id, v_ver USING ERRCODE = '22023'; END IF;
    WHEN 'config_baseline' THEN
      SELECT b.version, 'configuration baseline v' || b.version || ' (' || b.state || ')' INTO v_ver, v_label FROM onboarding.config_baselines b
       WHERE b.baseline_id = v_id AND b.version = v_ver AND b.tenant_id = p_tenant AND b.state IN ('approved', 'superseded');
      v_ok := FOUND;
      IF NOT v_ok THEN RAISE EXCEPTION 'onboarding step rejected (realized_by): configuration baseline %/v% is not an approved (signed) baseline of this tenant', v_id, v_ver USING ERRCODE = '22023'; END IF;
    WHEN 'ledger_event' THEN
      SELECT NULL::int, e.event INTO v_ver, v_label FROM (SELECT x.event, x.tenant_id FROM onboarding.events x WHERE x.event_id = v_id
                                                          UNION ALL SELECT x.event, x.tenant_id FROM implementation.events x WHERE x.event_id = v_id
                                                          UNION ALL SELECT x.event, x.tenant_id FROM service.events x WHERE x.event_id = v_id) e WHERE e.tenant_id = p_tenant LIMIT 1;
      v_ok := FOUND;
    ELSE
      -- §MG's / §IM's records: validated by their ledger (every governed act writes its event)
      SELECT coalesce(v_ver, e.version), e.subject_kind || ' · ' || e.event INTO v_ver, v_label
        FROM (SELECT x.subject_kind, x.event, x.version, x.occurred_at FROM onboarding.events x WHERE x.subject_id = v_id AND x.tenant_id = p_tenant
              UNION ALL SELECT x.subject_kind, x.event, x.version, x.occurred_at FROM implementation.events x WHERE x.subject_id = v_id AND x.tenant_id = p_tenant) e
       ORDER BY e.occurred_at DESC LIMIT 1;
      v_ok := FOUND;
  END CASE;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'onboarding step rejected (unknown_record): no % % is recorded in this tenant', v_kind, v_id || CASE WHEN v_ver IS NULL THEN '' ELSE ' v' || v_ver END USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('kind', v_kind, 'id', v_id, 'version', v_ver, 'action', v_action, 'label', v_label);
END $$;
REVOKE ALL ON FUNCTION onboarding.validate_reference(uuid, onboarding.programmes, text, jsonb) FROM PUBLIC;

/* The common head of the step ports: the step of the tenant, locked; its programme current, open (not withdrawn / accepted) and, for a
   record, not held; the version read named. */
CREATE OR REPLACE FUNCTION onboarding._step_current(p_step uuid, p_tenant uuid, p_expected int, p_for_record boolean) RETURNS onboarding.steps
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE s onboarding.steps%ROWTYPE; p onboarding.programmes%ROWTYPE;
BEGIN
  SELECT * INTO s FROM onboarding.steps x WHERE x.step_id = p_step AND x.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'onboarding step rejected (unknown_step): % is not a step of an onboarding programme of this tenant', p_step USING ERRCODE = '22023'; END IF;
  p := onboarding._programme_current(s.programme_id, p_tenant, 'onboarding step');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'onboarding step rejected (state): programme % is %; its steps no longer change', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_for_record AND p.state = 'held' THEN
    RAISE EXCEPTION 'onboarding step rejected (held): programme % is held (%); no step is recorded until it resumes', p.programme_key,
      (SELECT string_agg(h ->> 'reason', '; ') FROM jsonb_array_elements(p.held_reasons) h) USING ERRCODE = '22023';
  END IF;
  IF p_expected IS DISTINCT FROM s.version THEN
    RAISE EXCEPTION 'onboarding step rejected (stale): the act names step v%, the step is at v%', coalesce(p_expected::text, '?'), s.version USING ERRCODE = '22023';
  END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION onboarding._step_current(uuid, uuid, int, boolean) FROM PUBLIC;

/* Write the step's next version and its ledger event (the full snapshot — the replay). */
CREATE OR REPLACE FUNCTION onboarding._step_write(n onboarding.steps, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid, p_insert boolean) RETURNS onboarding.steps
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  n.updated_by := p_actor; n.updated_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := onboarding.step_digest(n);
  IF p_insert THEN INSERT INTO onboarding.steps VALUES (n.*);
  ELSE
    UPDATE onboarding.steps SET version = n.version, state = n.state, realized_by = n.realized_by, evidence = n.evidence, compensation = n.compensation,
           held_reason = n.held_reason, reverted_by = n.reverted_by, digest = n.digest, updated_by = n.updated_by, updated_at = n.updated_at, correlation_id = n.correlation_id
     WHERE step_id = n.step_id;
  END IF;
  PERFORM onboarding.ledger('onboarding', n.tenant_id, NULL, 'onboarding_step', n.step_id, n.version, p_event, p_actor,
            coalesce(p_details, '{}'::jsonb) || jsonb_build_object('programme_id', n.programme_id, 'step_key', n.step_key, 'state', n.state, 'digest', n.digest,
                                                                 'realized_by', n.realized_by, 'compensation', n.compensation, 'reverted_by', n.reverted_by), p_correlation);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION onboarding._step_write(onboarding.steps, text, uuid, jsonb, uuid, boolean) FROM PUBLIC;

/* PLAN (onboarding.step.plan): the lead or the tenant administrator plans a step of the closed list (once per programme), with the governed act
   that would compensate it (it may be named later — it is required before the step is done). */
CREATE OR REPLACE FUNCTION onboarding.plan_step(p_step uuid, p_tenant uuid, p_programme uuid, p_step_key text, p_compensation jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; n onboarding.steps%ROWTYPE;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.step.plan', 'onboarding step', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin'], 'planning an onboarding step');
  p := onboarding._programme_current(p_programme, p_tenant, 'onboarding step');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'onboarding step rejected (state): programme % is %', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p_step_key IS NULL OR NOT (p_step_key = ANY (onboarding.step_keys())) THEN
    RAISE EXCEPTION 'onboarding step rejected (step_key): a step is one of %', array_to_string(onboarding.step_keys(), ', ') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM onboarding.steps x WHERE x.programme_id = p_programme AND x.step_key = p_step_key) THEN
    RAISE EXCEPTION 'onboarding step rejected (duplicate): programme % already plans the % step', p.programme_key, p_step_key USING ERRCODE = '22023';
  END IF;
  n.step_id := p_step; n.scope := 'TENANT'; n.tenant_id := p_tenant; n.programme_id := p_programme; n.step_key := p_step_key;
  n.ordinal := array_position(onboarding.step_keys(), p_step_key); n.version := 1; n.state := 'planned'; n.realized_by := NULL; n.evidence := '[]'::jsonb;
  n.compensation := onboarding._compensation(p_compensation); n.held_reason := NULL; n.reverted_by := NULL; n.created_by := p_actor; n.created_at := clock_timestamp();
  n := onboarding._step_write(n, 'step.planned', p_actor, '{}'::jsonb, p_correlation, true);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.plan_step(uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.plan_step(uuid, uuid, uuid, text, jsonb, uuid, uuid) TO eye_commit;

/* RECORD (onboarding.step.record): in_progress or done. `done` needs its realizing record (validated) and a compensation. The first step
   recorded on a `planned` programme starts it (in_progress) — only with the sponsor's recorded intent (JRN-01). A done step changes only by
   its revert. */
CREATE OR REPLACE FUNCTION onboarding.record_step(p_step uuid, p_tenant uuid, p_expected int, p_state text, p_realized jsonb, p_evidence jsonb, p_compensation jsonb,
                                                 p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE s onboarding.steps%ROWTYPE; p onboarding.programmes%ROWTYPE; n onboarding.steps%ROWTYPE; v_started jsonb := NULL; v_bad int;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.step.record', 'onboarding step', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin'], 'recording an onboarding step');
  s := onboarding._step_current(p_step, p_tenant, p_expected, true);
  p := onboarding._programme_current(s.programme_id, p_tenant, 'onboarding step');
  IF p_state IS NULL OR p_state NOT IN ('in_progress', 'done') THEN RAISE EXCEPTION 'onboarding step rejected (step_state): a step is recorded in_progress or done' USING ERRCODE = '22023'; END IF;
  IF s.state = 'done' THEN RAISE EXCEPTION 'onboarding step rejected (state): the % step is done; it changes only by its revert (the compensating act)', s.step_key USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'array' THEN RAISE EXCEPTION 'onboarding step rejected (evidence): evidence is a list of references' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NOT NULL THEN
    SELECT count(*) INTO v_bad FROM jsonb_array_elements(p_evidence) e WHERE jsonb_typeof(e) <> 'object' OR length(btrim(coalesce(e ->> 'kind', ''))) < 2 OR length(btrim(coalesce(e ->> 'ref', e ->> 'id', ''))) < 2;
    IF v_bad > 0 THEN RAISE EXCEPTION 'onboarding step rejected (evidence): each evidence item is {kind, ref|id, note?}' USING ERRCODE = '22023'; END IF;
  END IF;
  n := s; n.version := s.version + 1; n.state := p_state; n.held_reason := NULL;
  n.evidence := s.evidence || coalesce(p_evidence, '[]'::jsonb);
  n.compensation := coalesce(onboarding._compensation(p_compensation), s.compensation);
  IF p_realized IS NOT NULL THEN n.realized_by := onboarding.validate_reference(p_tenant, p, s.step_key, p_realized); END IF;
  IF p_state = 'done' AND n.realized_by IS NULL THEN
    RAISE EXCEPTION 'onboarding step rejected (realized_by): a done % step names the record of the governed act that realized it', s.step_key USING ERRCODE = '22023';
  END IF;
  IF p_state = 'done' AND n.compensation IS NULL THEN
    RAISE EXCEPTION 'onboarding step rejected (compensation): a done step names the governed act that would reverse it (PR-67-001)' USING ERRCODE = '22023';
  END IF;
  IF p.state = 'planned' THEN
    IF NOT EXISTS (SELECT 1 FROM onboarding.sponsor_intents i WHERE i.programme_id = p.programme_id AND i.tenant_id = p_tenant AND i.superseded_at IS NULL) THEN
      RAISE EXCEPTION 'onboarding step rejected (state): programme % cannot leave planned without the customer sponsor''s recorded intent (JRN-01)', p.programme_key USING ERRCODE = '22023';
    END IF;
    v_started := to_jsonb(onboarding._programme_next(p, p.title, p.target_domain_id, p.deployment_profile, 'in_progress', '[]'::jsonb, p.plan, 'programme.started', p_actor,
                                                     jsonb_build_object('by_step', s.step_key, 'step_id', s.step_id), p_correlation));
  END IF;
  n := onboarding._step_write(n, 'step.recorded', p_actor, jsonb_build_object('from_state', s.state, 'evidence_added', coalesce(p_evidence, '[]'::jsonb)), p_correlation, false);
  RETURN to_jsonb(n) || jsonb_build_object('programme_started', v_started);
END $$;
REVOKE ALL ON FUNCTION onboarding.record_step(uuid, uuid, int, text, jsonb, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.record_step(uuid, uuid, int, text, jsonb, jsonb, jsonb, uuid, uuid) TO eye_commit;

/* HOLD a step (onboarding.step.hold): a planned or in-progress step held with its reason (any accountable party). */
CREATE OR REPLACE FUNCTION onboarding.hold_step(p_step uuid, p_tenant uuid, p_expected int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE s onboarding.steps%ROWTYPE; p onboarding.programmes%ROWTYPE; n onboarding.steps%ROWTYPE;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.step.hold', 'onboarding step', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin', 'customer_sponsor', 'onboarding_authority'], 'holding an onboarding step');
  s := onboarding._step_current(p_step, p_tenant, p_expected, false);
  p := onboarding._programme_current(s.programme_id, p_tenant, 'onboarding step');
  IF s.state NOT IN ('planned', 'in_progress') THEN RAISE EXCEPTION 'onboarding step rejected (state): the % step is %; only a planned or in-progress step is held', s.step_key, s.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding step rejected (reason): a hold states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  n := s; n.version := s.version + 1; n.state := 'held'; n.held_reason := btrim(p_reason);
  n := onboarding._step_write(n, 'step.held', p_actor, jsonb_build_object('from_state', s.state, 'reason', btrim(p_reason)), p_correlation, false);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.hold_step(uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.hold_step(uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* REVERT (onboarding.step.revert): a done step is reverted by RECORDING its compensating act by reference — the planned compensation's action,
   performed through its own governed route — never performed here. */
CREATE OR REPLACE FUNCTION onboarding.revert_step(p_step uuid, p_tenant uuid, p_expected int, p_compensating jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE s onboarding.steps%ROWTYPE; p onboarding.programmes%ROWTYPE; n onboarding.steps%ROWTYPE; v_ref jsonb;
BEGIN
  PERFORM onboarding._on_tenant_head('onboarding.step.revert', 'onboarding step', p_tenant, p_actor, ARRAY['implementation_lead', 'tenant_admin'], 'reverting an onboarding step');
  s := onboarding._step_current(p_step, p_tenant, p_expected, false);
  p := onboarding._programme_current(s.programme_id, p_tenant, 'onboarding step');
  IF s.state <> 'done' THEN RAISE EXCEPTION 'onboarding step rejected (state): the % step is %; only a done step is reverted', s.step_key, s.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'onboarding step rejected (reason): a revert states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_compensating IS NULL OR coalesce(p_compensating ->> 'action', '') IS DISTINCT FROM (s.compensation ->> 'action') THEN
    RAISE EXCEPTION 'onboarding step rejected (compensation): the % step is reversed by % (its planned compensation); the revert records that act, not %', s.step_key,
      s.compensation ->> 'action', coalesce(p_compensating ->> 'action', '<none>') USING ERRCODE = '22023';
  END IF;
  v_ref := onboarding.validate_reference(p_tenant, p, NULL, p_compensating);
  n := s; n.version := s.version + 1; n.state := 'reverted'; n.reverted_by := v_ref || jsonb_build_object('reason', btrim(p_reason), 'recorded_by', p_actor, 'recorded_at', clock_timestamp());
  n := onboarding._step_write(n, 'step.reverted', p_actor, jsonb_build_object('from_state', s.state, 'reason', btrim(p_reason)), p_correlation, false);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.revert_step(uuid, uuid, int, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.revert_step(uuid, uuid, int, jsonb, text, uuid, uuid) TO eye_commit;

-- §ON.4 THE DRAFT DOMAIN ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* tenancy.create_domain_draft (action tenancy.domain.draft): the 0019 create_domain idiom (the bound action, the bound target, the TENANT
   context of the tenant) for a TENANT ADMINISTRATOR, through an open programme that names no target yet: the domain `draft` (not activated),
   lifecycle `domain.drafted` with the programme, and the programme's next version naming it. The existing tenancy.create_domain is unchanged;
   activation is §MG's (tenancy.activate_domain). A draft domain is not an active domain: 0105 refuses it as a contract decision cell, and
   0102's constraint gate and 0105's entitlement notices pass it by (they read status = 'active'). */
CREATE OR REPLACE FUNCTION tenancy.create_domain_draft(p_id uuid, p_tenant uuid, p_name text, p_programme uuid, p_correlation uuid DEFAULT NULL) RETURNS jsonb
SECURITY DEFINER SET search_path = tenancy, onboarding, ctx, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); p onboarding.programmes%ROWTYPE; n onboarding.programmes%ROWTYPE; v_existing record; v_corr uuid := coalesce(p_correlation, gen_random_uuid());
BEGIN
  PERFORM observation.assert_authority(ARRAY['tenancy.domain.draft']);
  PERFORM ctx.assert_bound_target(p_id::text);
  PERFORM onboarding.assert_tenant(p_tenant, 'domain draft');
  IF v_actor IS NULL OR NOT onboarding.holds_role(v_actor, p_tenant, NULL, ARRAY['tenant_admin']) THEN
    RAISE EXCEPTION 'domain draft rejected (authority): a draft domain is created by the tenant administrator' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'domain draft rejected (name): a domain name is 2–200 characters' USING ERRCODE = '22023'; END IF;
  p := onboarding._programme_current(p_programme, p_tenant, 'domain draft');
  IF p.state IN ('withdrawn', 'accepted') THEN RAISE EXCEPTION 'domain draft rejected (state): programme % is %', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p.target_domain_id IS NOT NULL THEN
    SELECT d.name, d.status INTO v_existing FROM tenancy.domains d WHERE d.id = p.target_domain_id;
    RAISE EXCEPTION 'domain draft rejected (duplicate): programme % already names its target domain % (%)', p.programme_key, coalesce(v_existing.name, p.target_domain_id::text), coalesce(v_existing.status, '?') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.tenant_id = p_tenant AND d.name = btrim(p_name)) THEN
    RAISE EXCEPTION 'domain draft rejected (duplicate): the tenant already has a domain named %', btrim(p_name) USING ERRCODE = '22023';
  END IF;
  INSERT INTO tenancy.domains (id, tenant_id, name, status, activated_at) VALUES (p_id, p_tenant, btrim(p_name), 'draft', NULL);
  n := onboarding._programme_next(p, p.title, p_id, p.deployment_profile, p.state, p.held_reasons, p.plan, 'programme.domain_drafted', v_actor,
                                  jsonb_build_object('domain_id', p_id, 'name', btrim(p_name)), v_corr);
  INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_id, 'domain.drafted', ctx.bound_actor(),
            jsonb_build_object('name', btrim(p_name), 'status', 'draft', 'programme_id', p_programme, 'programme_version', n.version));
  PERFORM onboarding.ledger('onboarding', p_tenant, NULL, 'domain', p_id, NULL, 'domain.drafted', v_actor,
            jsonb_build_object('name', btrim(p_name), 'programme_id', p_programme, 'programme_version', n.version), n.correlation_id);
  RETURN jsonb_build_object('domain', jsonb_build_object('id', p_id, 'tenant_id', p_tenant, 'name', btrim(p_name), 'status', 'draft', 'activated_at', NULL),
                            'programme', to_jsonb(n));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION tenancy.create_domain_draft(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.create_domain_draft(uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §ON.5 CONFIGURATION BASELINES (reads and ports) ───────────────────────────────────────────────────────────────────────────────────────────
/* THE OBSERVED CONFIGURATION of a domain, read LIVE — the version POINTERS (never the content): the active attention policy version, the
   approved analytics purposes (key → version), the active package versions (key → {version, semver}), the workflow definitions (key → latest
   version), the active source contracts (key → contract version), the role-binding CENSUS by role (counts of live holders in the domain,
   DOMAIN or TENANT bindings — never persons), the tenant's live licence version. SECURITY DEFINER under the read-scope guard (identity and
   commercial are read for counts and versions only). */
CREATE OR REPLACE FUNCTION onboarding.observe_config(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the observed configuration of a domain');
  RETURN jsonb_build_object(
    'attention_policy', (SELECT jsonb_build_object('policy_id', a.policy_id, 'version', a.version, 'rules_digest', a.rules_digest) FROM executive.attention_policies a
                          WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active'),
    'analytics_purposes', coalesce((SELECT jsonb_object_agg(a.purpose_key, a.version) FROM analytics.purposes a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'approved'), '{}'::jsonb),
    'packages', coalesce((SELECT jsonb_object_agg(k.package_key, jsonb_build_object('version', v.version, 'semver', v.semver)) FROM domain.packages k
                            JOIN domain.package_versions v ON v.package_id = k.package_id AND v.state = 'active'
                           WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.state = 'declared'), '{}'::jsonb),
    'workflow_definitions', coalesce((SELECT jsonb_object_agg(w.def_key, w.v) FROM (SELECT x.def_key, max(x.version) AS v FROM executive.workflow_definitions x
                                       WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain GROUP BY x.def_key) w), '{}'::jsonb),
    'source_contracts', coalesce((SELECT jsonb_object_agg(s.source_key, s.contract_version) FROM observation.source_contracts_current s
                                   WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.lifecycle_state = 'active'), '{}'::jsonb),
    'role_census', coalesce((SELECT jsonb_object_agg(c.role_code, c.n) FROM (SELECT b.role_code, count(DISTINCT b.principal_id)::int AS n FROM identity.role_bindings b
                                JOIN identity.principals p ON p.id = b.principal_id
                               WHERE b.tenant_id = p_tenant AND b.revoked_at IS NULL AND p.status = 'active' AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain))
                               GROUP BY b.role_code) c), '{}'::jsonb),
    'licence', (SELECT jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'package_key', l.package_key) FROM commercial.licences l
                 WHERE l.tenant_id = p_tenant AND l.state <> 'superseded' ORDER BY l.version DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION onboarding.observe_config(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.observe_config(uuid, uuid) TO eye_app, eye_commit;

/* THE POINTER DIFF (pure): baseline vs observed — per key of the map sections (added / removed / changed), whole-value for the pointer
   sections (attention_policy, licence). Ordered by section, key. */
CREATE OR REPLACE FUNCTION onboarding.pointer_diff(p_baseline jsonb, p_observed jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  WITH maps AS (SELECT unnest(ARRAY['analytics_purposes', 'packages', 'workflow_definitions', 'source_contracts', 'role_census']) AS section),
  map_changes AS (
    SELECT m.section, k.key, coalesce(p_baseline -> m.section, '{}'::jsonb) -> k.key AS b, coalesce(p_observed -> m.section, '{}'::jsonb) -> k.key AS o
      FROM maps m, LATERAL (SELECT jsonb_object_keys(coalesce(p_baseline -> m.section, '{}'::jsonb)) AS key
                            UNION SELECT jsonb_object_keys(coalesce(p_observed -> m.section, '{}'::jsonb))) k),
  ptr AS (SELECT s AS section, NULL::text AS key, nullif(p_baseline -> s, 'null'::jsonb) AS b, nullif(p_observed -> s, 'null'::jsonb) AS o
            FROM unnest(ARRAY['attention_policy', 'licence']) s),
  allc AS (SELECT * FROM map_changes UNION ALL SELECT * FROM ptr)
  SELECT coalesce(jsonb_agg(jsonb_build_object('section', c.section, 'key', c.key,
            'change', CASE WHEN c.b IS NULL THEN 'added' WHEN c.o IS NULL THEN 'removed' ELSE 'changed' END, 'baseline', c.b, 'observed', c.o)
          ORDER BY c.section, c.key NULLS FIRST), '[]'::jsonb)
    FROM allc c WHERE c.b IS DISTINCT FROM c.o $$;
GRANT EXECUTE ON FUNCTION onboarding.pointer_diff(jsonb, jsonb) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION onboarding.baseline_digest(p_baseline uuid, p_version int, p_domain uuid, p_pointers jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('baseline_id', p_baseline, 'version', p_version, 'domain_id', p_domain, 'pointers', p_pointers)) $$;

/* DRIFT (internal): the approved baseline of the domain against the observed configuration — {state: no_baseline | in_sync | drifted, …}. */
CREATE OR REPLACE FUNCTION onboarding._drift(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE b onboarding.config_baselines%ROWTYPE; v_obs jsonb; v_changes jsonb;
BEGIN
  v_obs := onboarding.observe_config(p_tenant, p_domain);
  SELECT * INTO b FROM onboarding.config_baselines x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'approved';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'no_baseline', 'reason', 'the domain has no approved configuration baseline — drift is not inferred', 'observed', v_obs,
                              'observed_digest', onboarding.digest(v_obs), 'changes', '[]'::jsonb);
  END IF;
  v_changes := onboarding.pointer_diff(b.pointers, v_obs);
  RETURN jsonb_build_object('state', CASE WHEN jsonb_array_length(v_changes) = 0 THEN 'in_sync' ELSE 'drifted' END, 'baseline_id', b.baseline_id, 'version', b.version,
                            'digest', b.digest, 'effective_from', b.effective_from, 'observed', v_obs, 'observed_digest', onboarding.digest(v_obs), 'changes', v_changes);
END $$;
REVOKE ALL ON FUNCTION onboarding._drift(uuid, uuid) FROM PUBLIC;
/* The DRIFT read (guarded): the same, for the workspace and the after-tick hook's read-first. */
CREATE OR REPLACE FUNCTION onboarding.baseline_drift(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the configuration drift of a domain');
  RETURN onboarding._drift(p_tenant, p_domain);
END $$;
REVOKE ALL ON FUNCTION onboarding.baseline_drift(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.baseline_drift(uuid, uuid) TO eye_app, eye_commit;

/* The common head of a baseline port: the bound action, the DOMAIN scope, the acting principal, the roles; the domain of the tenant. */
CREATE OR REPLACE FUNCTION onboarding._cb_head(p_action text, p_tenant uuid, p_domain uuid, p_actor uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_status text;
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'config baseline rejected (actor): the act is recorded under the acting principal' USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION 'config baseline rejected (authority): % is the act of a %', p_what, array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
  SELECT d.status INTO v_status FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'config baseline rejected (unknown_domain): % is not a domain of this tenant', p_domain USING ERRCODE = '22023'; END IF;
  IF v_status NOT IN ('draft', 'active') THEN RAISE EXCEPTION 'config baseline rejected (state): the domain is %', v_status USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION onboarding._cb_head(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* CAPTURE (onboarding.baseline.capture): the implementation lead records the domain's FIRST baseline (v1, draft) from the observed pointers;
   later versions are promotions. */
CREATE OR REPLACE FUNCTION onboarding.capture_baseline(p_baseline uuid, p_tenant uuid, p_domain uuid, p_programme uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE n onboarding.config_baselines%ROWTYPE; v_existing uuid; p onboarding.programmes%ROWTYPE;
BEGIN
  PERFORM onboarding._cb_head('onboarding.baseline.capture', p_tenant, p_domain, p_actor, ARRAY['implementation_lead'], 'capturing a configuration baseline');
  SELECT x.baseline_id INTO v_existing FROM onboarding.config_baselines x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'config baseline rejected (duplicate): the domain already has baseline %; a new version is a promotion', v_existing USING ERRCODE = '22023';
  END IF;
  IF p_programme IS NOT NULL THEN
    SELECT * INTO p FROM onboarding.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'config baseline rejected (unknown_programme): % is not an onboarding programme of this tenant', p_programme USING ERRCODE = '22023'; END IF;
    IF p.target_domain_id IS DISTINCT FROM p_domain THEN
      RAISE EXCEPTION 'config baseline rejected (programme): programme % targets %, not this domain', p.programme_key, coalesce(p.target_domain_id::text, 'no domain yet') USING ERRCODE = '22023';
    END IF;
  END IF;
  n.baseline_id := p_baseline; n.version := 1; n.scope := 'DOMAIN'; n.tenant_id := p_tenant; n.domain_id := p_domain; n.programme_id := p_programme;
  n.pointers := onboarding.observe_config(p_tenant, p_domain); n.basis := 'capture'; n.promoted_from := NULL; n.absorbed := '[]'::jsonb; n.state := 'draft';
  n.captured_by := p_actor; n.captured_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := onboarding.baseline_digest(n.baseline_id, n.version, p_domain, n.pointers);
  INSERT INTO onboarding.config_baselines VALUES (n.*);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', p_baseline, 1, 'baseline.captured', p_actor,
            jsonb_build_object('digest', n.digest, 'programme_id', p_programme, 'pointers', n.pointers), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.capture_baseline(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.capture_baseline(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* PROMOTE (onboarding.baseline.promote): the observed state becomes the next version (draft) — only from an approved baseline it differs from;
   the drift it absorbs is recorded. It still needs the authority's approval. */
CREATE OR REPLACE FUNCTION onboarding.promote_baseline(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE a onboarding.config_baselines%ROWTYPE; n onboarding.config_baselines%ROWTYPE; v_obs jsonb; v_changes jsonb; v_open int;
BEGIN
  PERFORM onboarding._cb_head('onboarding.baseline.promote', p_tenant, p_domain, p_actor, ARRAY['implementation_lead'], 'promoting a configuration baseline');
  SELECT * INTO a FROM onboarding.config_baselines x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'config baseline rejected (state): the domain has no approved baseline to promote from (capture, propose and approve one first)' USING ERRCODE = '22023'; END IF;
  SELECT x.version INTO v_open FROM onboarding.config_baselines x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('draft', 'proposed');
  IF v_open IS NOT NULL THEN RAISE EXCEPTION 'config baseline rejected (state): version % is still open (draft or proposed); decide it first', v_open USING ERRCODE = '22023'; END IF;
  v_obs := onboarding.observe_config(p_tenant, p_domain);
  v_changes := onboarding.pointer_diff(a.pointers, v_obs);
  IF jsonb_array_length(v_changes) = 0 THEN
    RAISE EXCEPTION 'config baseline rejected (state): the observed configuration equals approved v%; there is nothing to promote', a.version USING ERRCODE = '22023';
  END IF;
  n.baseline_id := a.baseline_id; n.version := (SELECT max(x.version) + 1 FROM onboarding.config_baselines x WHERE x.baseline_id = a.baseline_id);
  n.scope := 'DOMAIN'; n.tenant_id := p_tenant; n.domain_id := p_domain; n.programme_id := a.programme_id; n.pointers := v_obs; n.basis := 'promotion';
  n.promoted_from := a.version; n.absorbed := v_changes; n.state := 'draft'; n.captured_by := p_actor; n.captured_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := onboarding.baseline_digest(n.baseline_id, n.version, p_domain, n.pointers);
  INSERT INTO onboarding.config_baselines VALUES (n.*);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', n.baseline_id, n.version, 'baseline.promoted', p_actor,
            jsonb_build_object('digest', n.digest, 'promoted_from', a.version, 'absorbed', v_changes), p_correlation);
  RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION onboarding.promote_baseline(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.promote_baseline(uuid, uuid, uuid, uuid) TO eye_commit;

/* PROPOSE (onboarding.baseline.propose): the lead submits the draft at the digest read; the proposer is recorded (never its approver). */
CREATE OR REPLACE FUNCTION onboarding.propose_baseline(p_baseline uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, public, pg_catalog, pg_temp AS $$
DECLARE b onboarding.config_baselines%ROWTYPE;
BEGIN
  PERFORM onboarding._cb_head('onboarding.baseline.propose', p_tenant, p_domain, p_actor, ARRAY['implementation_lead'], 'proposing a configuration baseline');
  SELECT * INTO b FROM onboarding.config_baselines x WHERE x.baseline_id = p_baseline AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'config baseline rejected (unknown_baseline): no version % of baseline % in this domain', p_version, p_baseline USING ERRCODE = '22023'; END IF;
  IF b.state <> 'draft' THEN RAISE EXCEPTION 'config baseline rejected (state): version % is %, not a draft', p_version, b.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM b.digest THEN RAISE EXCEPTION 'config baseline rejected (stale): the proposal names digest %, version % is %', coalesce(left(p_digest, 12), '?'), p_version, left(b.digest, 12) USING ERRCODE = '22023'; END IF;
  UPDATE onboarding.config_baselines SET state = 'proposed', proposed_by = p_actor, proposed_at = clock_timestamp() WHERE baseline_id = p_baseline AND version = p_version;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', p_baseline, p_version, 'baseline.proposed', p_actor, jsonb_build_object('digest', b.digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.config_baselines x WHERE x.baseline_id = p_baseline AND x.version = p_version);
END $$;
REVOKE ALL ON FUNCTION onboarding.propose_baseline(uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.propose_baseline(uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* DECIDE (onboarding.baseline.decide — human-gated): THE CUSTOMER AUTHORITY approves or rejects the proposed version AT ITS DIGEST
   (onboarding.assert_approver: a named active human holding onboarding_authority, never the proposer nor the capturer, never an implementation
   lead, never an agent). An approval is SIGNED (executive.signatures, subject kind config_baseline, signed by the approver under this action
   in the same write) and supersedes the prior approved version; the drift items of the lineage close. */
CREATE OR REPLACE FUNCTION onboarding.decide_baseline(p_baseline uuid, p_tenant uuid, p_domain uuid, p_version int, p_decision text, p_digest text, p_reason text, p_signature uuid,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, executive, public, pg_catalog, pg_temp AS $$
DECLARE b onboarding.config_baselines%ROWTYPE; v_prior int; v_closed jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.baseline.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'config baseline rejected (actor): the decision is recorded under the acting principal' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM onboarding.config_baselines x WHERE x.baseline_id = p_baseline AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'config baseline rejected (unknown_baseline): no version % of baseline % in this domain', p_version, p_baseline USING ERRCODE = '22023'; END IF;
  PERFORM onboarding.assert_approver('config baseline', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], b.proposed_by, 'approving a configuration baseline');
  IF p_actor = b.captured_by THEN
    RAISE EXCEPTION 'config baseline rejected (separation_of_duties): approving a configuration baseline is never the act of the principal who captured it' USING ERRCODE = '42501';
  END IF;
  IF b.state <> 'proposed' THEN RAISE EXCEPTION 'config baseline rejected (state): version % is %, not proposed', p_version, b.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM b.digest THEN
    RAISE EXCEPTION 'config baseline rejected (stale): the decision names digest %, version % is % — read it again', coalesce(left(p_digest, 12), '?'), p_version, left(b.digest, 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'config baseline rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'config baseline rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'reject' THEN
    IF p_signature IS NOT NULL THEN RAISE EXCEPTION 'config baseline rejected (signature): a rejection is not signed as an approval' USING ERRCODE = '22023'; END IF;
    UPDATE onboarding.config_baselines SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason)
     WHERE baseline_id = p_baseline AND version = p_version;
    PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', p_baseline, p_version, 'baseline.rejected', p_actor,
              jsonb_build_object('digest', b.digest, 'reason', btrim(p_reason)), p_correlation);
  ELSE
    IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'config_baseline' AND s.subject_id = p_baseline
                                            AND s.subject_version = p_version AND s.subject_digest = b.digest AND s.signer = p_actor AND s.bound_action = 'onboarding.baseline.decide'
                                            AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'config baseline rejected (signature): an approval carries the approver''s signature over the version''s digest, recorded under this act' USING ERRCODE = '22023';
    END IF;
    SELECT x.version INTO v_prior FROM onboarding.config_baselines x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'approved' FOR UPDATE;
    IF v_prior IS NOT NULL THEN
      UPDATE onboarding.config_baselines SET state = 'superseded', superseded_at = clock_timestamp() WHERE baseline_id = p_baseline AND version = v_prior;
    END IF;
    UPDATE onboarding.config_baselines SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), signature_id = p_signature,
           effective_from = clock_timestamp()
     WHERE baseline_id = p_baseline AND version = p_version;
    v_closed := executive.b33_close_items(p_tenant, p_domain, 'onboarding.drift', 'config_baseline', p_baseline, format('configuration baseline v%s approved: %s', p_version, btrim(p_reason)), p_actor, p_correlation);
    PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', p_baseline, p_version, 'baseline.approved', p_actor,
              jsonb_build_object('digest', b.digest, 'reason', btrim(p_reason), 'signature_id', p_signature, 'supersedes', v_prior, 'closed_items', v_closed), p_correlation);
  END IF;
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('closed_items', v_closed) FROM onboarding.config_baselines x WHERE x.baseline_id = p_baseline AND x.version = p_version);
END $$;
REVOKE ALL ON FUNCTION onboarding.decide_baseline(uuid, uuid, uuid, int, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.decide_baseline(uuid, uuid, uuid, int, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* RECORD DRIFT (onboarding.baseline.drift — the after-tick hook `onboarding-drift`, or a person): the drift re-computed here against the
   observed digest the caller READ FIRST (moved in between → 409 stale); recorded only on CHANGE (a new or different drift, or back in line);
   a drift raises `onboarding.drift` (routed by the domain's attention policy — to the domain administrator) and closes the prior drift items;
   back in line closes them. Nothing is restored here: the rollback plan is a read. */
CREATE OR REPLACE FUNCTION onboarding.record_drift(p_event uuid, p_tenant uuid, p_domain uuid, p_observed_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, executive, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb; last onboarding.drift_events%ROWTYPE; v_state text; v_item jsonb := NULL; v_closed jsonb := '[]'::jsonb; v_baseline uuid; v_version int;
BEGIN
  PERFORM onboarding._cb_head('onboarding.baseline.drift', p_tenant, p_domain, p_actor,
                              ARRAY['attention_agent', 'implementation_lead', 'onboarding_authority', 'tenant_admin', 'domain_admin'], 'recording configuration drift');
  v := onboarding._drift(p_tenant, p_domain);
  v_state := v ->> 'state';
  IF v_state = 'no_baseline' THEN RETURN jsonb_build_object('recorded', false, 'state', v_state, 'reason', v ->> 'reason'); END IF;
  IF p_observed_digest IS DISTINCT FROM (v ->> 'observed_digest') THEN
    RAISE EXCEPTION 'config baseline rejected (stale): the configuration moved since it was read (read %, now %) — read it again', coalesce(left(p_observed_digest, 12), '?'), left(v ->> 'observed_digest', 12) USING ERRCODE = '22023';
  END IF;
  v_baseline := (v ->> 'baseline_id')::uuid; v_version := (v ->> 'version')::int;
  SELECT * INTO last FROM onboarding.drift_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.baseline_id = v_baseline AND e.baseline_version = v_version
   ORDER BY e.recorded_at DESC, e.event_id DESC LIMIT 1;
  IF (last.event_id IS NULL AND v_state = 'in_sync') OR (last.event_id IS NOT NULL AND last.state = v_state AND last.observed_digest = v ->> 'observed_digest') THEN
    RETURN jsonb_build_object('recorded', false, 'state', v_state, 'reason', 'unchanged since the last observation', 'baseline_version', v_version, 'last_event_id', last.event_id);
  END IF;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'onboarding.drift', 'config_baseline', v_baseline,
                CASE WHEN v_state = 'in_sync' THEN format('the domain is back in line with configuration baseline v%s', v_version)
                     ELSE format('superseded by a newer drift observation of baseline v%s', v_version) END, p_actor, p_correlation);
  IF v_state = 'drifted' THEN
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'onboarding.drift', 'config_baseline', v_baseline,
                format('Configuration drift: %s pointer(s) differ from approved baseline v%s', jsonb_array_length(v -> 'changes'), v_version),
                (SELECT coalesce(jsonb_agg(format('%s%s %s', c ->> 'section', CASE WHEN c ->> 'key' IS NULL THEN '' ELSE '.' || (c ->> 'key') END, c ->> 'change')), '[]'::jsonb) FROM jsonb_array_elements(v -> 'changes') c),
                NULL, p_event, 'onboarding.drift_event', jsonb_build_object('baseline_version', v_version, 'observed_digest', v ->> 'observed_digest'), NULL, p_actor, p_correlation);
  END IF;
  INSERT INTO onboarding.drift_events (event_id, tenant_id, domain_id, baseline_id, baseline_version, baseline_digest, observed_digest, state, changes, observed, item, recorded_by, correlation_id)
  VALUES (p_event, p_tenant, p_domain, v_baseline, v_version, v ->> 'digest', v ->> 'observed_digest', v_state, v -> 'changes', v -> 'observed', v_item, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'config_baseline', v_baseline, v_version, 'baseline.drift_recorded', p_actor,
            jsonb_build_object('drift_event_id', p_event, 'state', v_state, 'changes', jsonb_array_length(v -> 'changes'), 'observed_digest', v ->> 'observed_digest', 'item', v_item, 'closed_items', v_closed), p_correlation);
  RETURN jsonb_build_object('recorded', true, 'event_id', p_event, 'state', v_state, 'baseline_version', v_version, 'changes', v -> 'changes', 'item', v_item, 'closed_items', v_closed);
END $$;
REVOKE ALL ON FUNCTION onboarding.record_drift(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.record_drift(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;
