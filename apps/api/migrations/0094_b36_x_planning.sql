-- 0094 §P — CP-6 B36 part `planning` (2026-09-30): STRATEGIC PLANNING AND INITIATIVE GOVERNANCE (F-P6-10; V8 PR-45-001..006, CAP-EO-07,
-- AT-45, WS-16; V9 UX-45). Built on the §0 prelude (executive.record_signature / signature_of with kind plan_baseline; the attention
-- class plan.variance and the subject kind plan; the package event initiative.cited) and on 0089's Strategy Graph (graph.strategy_current
-- — an INITIATIVE is the 0089 `INI` object: executive.initiatives BINDS to it by id, one object with two views, never a parallel copy;
-- graph.measures — a plan measure is a graph.measures row bound by id, never a copy). Forward-only; nothing earlier is edited.
--
--   §P1  the role planning_agent (proposes only — never funds, approves, baselines), the canonical object PLN (schema PLN@v1) and the two
--        canonical write actions (executive.plan.baseline admits PLN; executive.initiative.approve admits a new INI version)
--   §P2  the tables: executive.plans (a plan for an objective set and a horizon; the budget with its AUTHORITY CEILING and currency),
--        executive.plan_versions (a BASELINE: a signed version — append-only), executive.initiatives (the INI object's planning view:
--        objective linkage, sponsor, owner, budget share, state), executive.initiative_objectives, executive.initiative_transitions
--        (append-only: propose → align → prioritise → fund → approve → baseline → pause → close; the replay reads them), executive.milestones,
--        executive.initiative_dependencies (finish_to_start | shares_resource; a cycle refused), executive.plan_measures (bound to
--        graph.measures), executive.plan_runs (the scenario runs a plan is read against), executive.plan_variances (append-only),
--        executive.plan_breaches, executive.plan_events (append-only); decision.packages_current.initiative_id (the citation)
--   §P3  the plan ports: declare_plan, set_plan_authority (the CONTINUITY rule: a ceiling lowered below the funded sum is a BREACH, never a
--        silent acceptance), review_plan, baseline_plan (the version whose digest the executive signs; PLN admitted by the service)
--   §P4  the initiative transitions UNDER HUMAN AUTHORITY: propose (the strategy lead or the planning agent), align, prioritise (the lead;
--        an unaligned initiative cannot be prioritised), fund (the executive or the decision authority, within the plan's authority —
--        over it `initiative rejected (budget_authority)`), approve (a second named human: never the proposer), pause / close (the sponsor)
--   §P5  milestones, dependencies (a cycle refused), plan measures, plan runs
--   §P6  the breaches: acknowledge_plan_breach (the executive authorizes a commitment while a breach stands), the commitment HOLD (a
--        commitment on a package citing an initiative of a plan with an OPEN breach is refused before the tracker seeds), cite_initiative
--   §P7  the tick step `plan-variance` (order 55): executive.detect_plan_variance — a milestone's measure (the latest observation once the
--        milestone is due) or an attached run's output at the milestone's date vs the target → a variance, ROUTED as an attention item of
--        class plan.variance to the initiative's owner; the five breach kinds opened once per cause and resolved when the cause is gone
--   §P8  the reads: plan_view (the workspace), plan_as_of (the REPLAY), plan_sensitivity (a run's outputs on the plan's measures)
--   §P9  RLS (the 0081 loop idiom) and grants
-- Every refusal is one family `<noun> rejected (<class>): …` (nouns: plan, initiative, milestone, plan dependency, plan measure, plan run,
-- plan breach, plan commitment, initiative citation; classes actor/not_sponsor/separation/not_owner → 403, unknown_* → 404, state/duplicate/
-- breach_open/closed → 409, the rest → 422), mapped in observation-errors.ts inside the `/* B36 planning */` block.
-- Every figure a harness or a scene seeds here is SYNTHETIC.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P1 THE ROLE, THE CANONICAL OBJECT PLN, THE WRITE ACTIONS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO identity.roles (code, scope, description) VALUES
  ('planning_agent', 'DOMAIN', 'The Planning Agent (B36 §P): drafts and proposes initiatives into a plan — never aligns, prioritises, funds, approves, baselines, pauses or closes one')
ON CONFLICT (code) DO NOTHING;

INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('executive.plan.baseline', ARRAY['PLN'], 'Baselining a plan admits the signed plan version as a PLN object and nothing else'),
  ('executive.initiative.approve', ARRAY['INI'], 'Approving an initiative admits the next version of its INI object (the planning approval carried in metrics.planning) and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('PLN', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["plan_id","version","title","horizon","objectives","initiatives","milestones","measures","dependencies","budget","baseline_digest","baselined_by"],
  "properties": {
    "plan_id": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "title": { "type": "string", "minLength": 2, "maxLength": 256 },
    "statement": { "type": ["string","null"] },
    "horizon": { "enum": ["30d","90d","12m","36m"] },
    "classification": { "enum": ["public","internal","confidential","restricted"] },
    "objectives": { "type": "array", "items": { "type": "string" } },
    "initiatives": { "type": "array", "items": { "type": "object" } },
    "milestones": { "type": "array", "items": { "type": "object" } },
    "measures": { "type": "array", "items": { "type": "object" } },
    "dependencies": { "type": "array", "items": { "type": "object" } },
    "budget": { "type": "object" },
    "baseline_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "baselined_by": { "type": "string" },
    "baselined_at": { "type": ["string","null"] },
    "note": { "type": ["string","null"] }
  }
}'::jsonb, 'backward')
ON CONFLICT (object_type, schema_version) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P2 THE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.plans (
  plan_id               uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  title                 text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  statement             text NOT NULL CHECK (length(btrim(statement)) BETWEEN 2 AND 4096),
  horizon               text NOT NULL CHECK (horizon IN ('30d', '90d', '12m', '36m')),
  /* the objective set: live OBJ objects of graph.strategy_current (at least one) */
  objective_ids         uuid[] NOT NULL CHECK (cardinality(objective_ids) >= 1),
  owner_principal_id    uuid NOT NULL,
  /* money: ISO-4217 text + numeric(18,2), never a float; the AUTHORITY CEILING is what the funded shares may not exceed */
  budget_currency       text NOT NULL CHECK (budget_currency ~ '^[A-Z]{3}$'),
  budget_total          numeric(18,2) NOT NULL CHECK (budget_total >= 0),
  budget_authority      numeric(18,2) NOT NULL CHECK (budget_authority >= 0),
  classification        text NOT NULL DEFAULT 'internal' CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  review_cadence_days   int  NOT NULL DEFAULT 30 CHECK (review_cadence_days BETWEEN 1 AND 366),
  last_reviewed_at      timestamptz,
  state                 text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'baselined', 'closed')),
  current_version       int  NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by           uuid NOT NULL,
  declared_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT xpl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xpl_domain ON executive.plans (tenant_id, domain_id, state);
COMMENT ON TABLE executive.plans IS 'B36 §P (0094): a plan for an objective set and a horizon, owned by the strategy lead, with its budget (ISO-4217 + numeric(18,2)) and the AUTHORITY CEILING the funded shares may not exceed; baselined as signed versions (executive.plan_versions).';

CREATE TABLE executive.plan_versions (
  version_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  version         int  NOT NULL CHECK (version >= 1),
  /* the baseline: the initiatives, milestones, measures, dependencies and budget AS OF the baseline, and its digest — what the executive signs */
  snapshot        jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  note            text CHECK (note IS NULL OR length(note) <= 2000),
  baselined_by    uuid NOT NULL,
  baselined_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xpv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpv_once UNIQUE (plan_id, version)
);
CREATE TRIGGER xpv_append_only BEFORE UPDATE OR DELETE ON executive.plan_versions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.initiatives (
  /* THE INI OBJECT ITSELF (0089 §1: graph.strategy_current object_type INI) — one object, two views */
  initiative_id         uuid PRIMARY KEY REFERENCES graph.strategy_current (strategy_object_id),
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  plan_id               uuid NOT NULL REFERENCES executive.plans (plan_id),
  /* the primary objective (a live OBJ); further objectives in executive.initiative_objectives — at least this one is required */
  objective_id          uuid NOT NULL REFERENCES graph.strategy_current (strategy_object_id),
  /* the planning label as proposed (the Strategy Graph's title is the object's own; this is the view's caption, read by Part S's plan links) */
  title                 text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  sponsor_principal_id  uuid NOT NULL,
  owner_principal_id    uuid NOT NULL,
  budget_share          numeric(18,2) NOT NULL DEFAULT 0 CHECK (budget_share >= 0),
  funded_amount         numeric(18,2) CHECK (funded_amount IS NULL OR funded_amount >= 0),
  priority              int CHECK (priority IS NULL OR priority >= 1),
  state                 text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'aligned', 'prioritised', 'funded', 'approved', 'paused', 'closed')),
  /* the state before a pause (a pause is undone by the sponsor's close only in this batch; kept for the replay) */
  proposed_by           uuid NOT NULL,
  proposed_by_kind      text NOT NULL CHECK (proposed_by_kind IN ('human', 'agent')),
  proposed_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by           uuid,
  approved_at           timestamptz,
  approved_object_version bigint,
  pause_reason          text,
  close_reason          text,
  version               int NOT NULL DEFAULT 1 CHECK (version >= 1),
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT xin_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xin_funded CHECK (state NOT IN ('funded', 'approved') OR funded_amount IS NOT NULL),
  CONSTRAINT xin_approved CHECK ((state <> 'approved' AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL) OR state IN ('paused', 'closed'))
);
CREATE INDEX xin_plan ON executive.initiatives (plan_id, state);
CREATE INDEX xin_objective ON executive.initiatives (tenant_id, domain_id, objective_id);
COMMENT ON TABLE executive.initiatives IS 'B36 §P (0094): the planning view of an INI strategy object (bound by id to graph.strategy_current — never a parallel copy): its plan, objective linkage, sponsor, owner, budget share, the funded amount and the governed state.';

CREATE TABLE executive.initiative_objectives (
  initiative_id   uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  objective_id    uuid NOT NULL REFERENCES graph.strategy_current (strategy_object_id),
  linked_by       uuid NOT NULL,
  linked_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (initiative_id, objective_id)
);

CREATE TABLE executive.initiative_transitions (
  transition_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  initiative_id   uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  transition      text NOT NULL CHECK (transition IN ('propose', 'align', 'prioritise', 'fund', 'approve', 'baseline', 'pause', 'close')),
  from_state      text,
  to_state        text NOT NULL,
  actor_principal_id uuid NOT NULL,
  actor_kind      text NOT NULL CHECK (actor_kind IN ('human', 'agent')),
  reason          text,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xit_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xit_initiative ON executive.initiative_transitions (initiative_id, occurred_at);
CREATE TRIGGER xit_append_only BEFORE UPDATE OR DELETE ON executive.initiative_transitions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.milestones (
  milestone_id    uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  initiative_id   uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 256),
  due_date        date NOT NULL,
  /* the measure that proves it (a graph.measures row of this domain) and the value it must reach by the due date */
  measure_id      uuid NOT NULL REFERENCES graph.measures (measure_id),
  target_value    numeric NOT NULL,
  state           text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'at_risk', 'met', 'missed', 'cancelled')),
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xms_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xms_initiative ON executive.milestones (initiative_id, due_date);
CREATE INDEX xms_plan ON executive.milestones (plan_id, due_date);

CREATE TABLE executive.initiative_dependencies (
  dependency_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  plan_id             uuid NOT NULL REFERENCES executive.plans (plan_id),
  from_initiative_id  uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  to_initiative_id    uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  kind                text NOT NULL CHECK (kind IN ('finish_to_start', 'shares_resource')),
  rationale           text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 2000),
  state               text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by          uuid,
  retired_at          timestamptz,
  correlation_id      uuid NOT NULL,
  CONSTRAINT xid_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xid_no_self CHECK (from_initiative_id <> to_initiative_id),
  CONSTRAINT xid_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL))
);
CREATE UNIQUE INDEX xid_one_active ON executive.initiative_dependencies (from_initiative_id, to_initiative_id, kind) WHERE state = 'active';
CREATE INDEX xid_plan ON executive.initiative_dependencies (plan_id, state);

CREATE TABLE executive.plan_measures (
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  measure_id      uuid NOT NULL REFERENCES graph.measures (measure_id),
  /* the key by which a scenario run's OUTPUT QUANTITY (simulation.service.ts outputQuantities: a series column or <balance>.closing) maps onto this measure; NULL = not mapped */
  quantity_key    text CHECK (quantity_key IS NULL OR length(btrim(quantity_key)) BETWEEN 1 AND 128),
  bound_by        uuid NOT NULL,
  bound_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (plan_id, measure_id)
);
COMMENT ON TABLE executive.plan_measures IS 'B36 §P (0094): the Strategy Graph measures a plan reads (graph.measures rows bound by id — never a copy), each with the run output key its scenario sensitivity maps.';

CREATE TABLE executive.plan_runs (
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  run_id          uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  attached_by     uuid NOT NULL,
  attached_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (plan_id, run_id)
);

CREATE TABLE executive.plan_variances (
  variance_id     uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  initiative_id   uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  milestone_id    uuid NOT NULL REFERENCES executive.milestones (milestone_id),
  measure_id      uuid NOT NULL REFERENCES graph.measures (measure_id),
  basis_kind      text NOT NULL CHECK (basis_kind IN ('observation', 'run')),
  basis_id        uuid NOT NULL,
  basis_digest    text,
  basis_date      date,
  observed_value  numeric NOT NULL,
  target_value    numeric NOT NULL,
  direction       text NOT NULL CHECK (direction IN ('higher_better', 'lower_better')),
  /* signed toward the direction: negative = adverse (a higher_better measure below target, a lower_better one above it) */
  variance        numeric NOT NULL,
  adverse         boolean NOT NULL,
  owner_principal_id uuid,
  routed_item_id  uuid,
  routing         jsonb NOT NULL DEFAULT '{}'::jsonb,
  raised_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  raised_by       uuid NOT NULL,
  correlation_id  uuid NOT NULL,
  CONSTRAINT xpvr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpvr_once UNIQUE (milestone_id, basis_kind, basis_id)
);
CREATE INDEX xpvr_plan ON executive.plan_variances (plan_id, raised_at DESC);
CREATE TRIGGER xpvr_append_only BEFORE UPDATE OR DELETE ON executive.plan_variances FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.plan_breaches (
  breach_id        uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  plan_id          uuid NOT NULL REFERENCES executive.plans (plan_id),
  initiative_id    uuid REFERENCES executive.initiatives (initiative_id),
  kind             text NOT NULL CHECK (kind IN ('lost_linkage', 'infeasible', 'budget_over_authority', 'conflicting_dependencies', 'drift_without_review')),
  cause_key        text NOT NULL,
  detail           text NOT NULL,
  /* what is forecast to be impacted: the initiatives, milestones and amounts the breach bears on */
  forecast_impact  jsonb NOT NULL DEFAULT '{}'::jsonb,
  state            text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'acknowledged', 'resolved')),
  opened_by        uuid NOT NULL,
  opened_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_by  uuid,
  acknowledged_at  timestamptz,
  authorization_note text,
  resolved_at      timestamptz,
  resolved_by      uuid,
  resolution       text,
  correlation_id   uuid NOT NULL,
  CONSTRAINT xpb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpb_ack CHECK ((acknowledged_at IS NULL) = (acknowledged_by IS NULL) AND (acknowledged_at IS NULL) = (authorization_note IS NULL)),
  CONSTRAINT xpb_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL))
);
CREATE UNIQUE INDEX xpb_one_open ON executive.plan_breaches (plan_id, kind, cause_key) WHERE state <> 'resolved';
CREATE INDEX xpb_plan ON executive.plan_breaches (plan_id, state);

CREATE TABLE executive.plan_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  subject_kind    text NOT NULL CHECK (subject_kind IN ('plan', 'version', 'initiative', 'milestone', 'dependency', 'measure', 'run', 'variance', 'breach', 'citation')),
  subject_id      uuid NOT NULL,
  event           text NOT NULL CHECK (event IN (
    'plan.declared', 'plan.authority_set', 'plan.reviewed', 'plan.baselined', 'plan.closed',
    'initiative.proposed', 'initiative.aligned', 'initiative.prioritised', 'initiative.funded', 'initiative.approved', 'initiative.paused', 'initiative.closed',
    'milestone.set', 'milestone.state_changed', 'dependency.declared', 'dependency.retired', 'measure.bound', 'run.attached',
    'variance.raised', 'breach.opened', 'breach.acknowledged', 'breach.resolved', 'initiative.cited')),
  actor_principal_id uuid NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xpe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xpe_plan ON executive.plan_events (plan_id, occurred_at);
CREATE TRIGGER xpe_append_only BEFORE UPDATE OR DELETE ON executive.plan_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* The citation: a decision package that cites an initiative (feature-detected by the commitment hold and the seed; NULL = no citation). */
ALTER TABLE decision.packages_current ADD COLUMN initiative_id uuid REFERENCES executive.initiatives (initiative_id);
CREATE INDEX dpk_initiative ON decision.packages_current (initiative_id) WHERE initiative_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- the internal helpers (never granted; called by the ports of this section only)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive._plan_event(p_plan uuid, p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO executive.plan_events (event_id, scope, tenant_id, domain_id, plan_id, subject_kind, subject_id, event, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_plan, p_subject_kind, p_subject, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._plan_event(uuid, uuid, uuid, text, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The plan row, locked for the caller's write; refuses an unknown plan (404) and a closed one (409) when p_open is set. */
CREATE OR REPLACE FUNCTION executive._plan_locked(p_plan uuid, p_tenant uuid, p_domain uuid, p_open boolean) RETURNS executive.plans
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE;
BEGIN
  SELECT * INTO pl FROM executive.plans p WHERE p.plan_id = p_plan AND p.tenant_id = p_tenant AND p.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan rejected (unknown_plan): % is not a plan of this domain', p_plan USING ERRCODE = '23503'; END IF;
  IF p_open AND pl.state = 'closed' THEN RAISE EXCEPTION 'plan rejected (closed): plan "%" is closed', pl.title USING ERRCODE = '22023'; END IF;
  RETURN pl;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._plan_locked(uuid, uuid, uuid, boolean) FROM PUBLIC;

/* The initiative row locked, with its plan locked first (one lock order everywhere: plan → initiative). */
CREATE OR REPLACE FUNCTION executive._initiative_locked(p_initiative uuid, p_tenant uuid, p_domain uuid) RETURNS executive.initiatives
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE; v_plan uuid;
BEGIN
  SELECT plan_id INTO v_plan FROM executive.initiatives x WHERE x.initiative_id = p_initiative AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'initiative rejected (unknown_initiative): % is not an initiative of a plan of this domain', p_initiative USING ERRCODE = '23503'; END IF;
  PERFORM 1 FROM executive.plans p WHERE p.plan_id = v_plan FOR UPDATE;
  SELECT * INTO i FROM executive.initiatives x WHERE x.initiative_id = p_initiative FOR UPDATE;
  RETURN i;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._initiative_locked(uuid, uuid, uuid) FROM PUBLIC;

/* A live OBJ of this domain. */
CREATE OR REPLACE FUNCTION executive._objective_live(p_objective uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = p_objective AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.status = 'active')
$$;
REVOKE ALL ON FUNCTION executive._objective_live(uuid, uuid, uuid) FROM PUBLIC;

/* The digest of an initiative's planning view (the version the approver reads). */
CREATE OR REPLACE FUNCTION executive._initiative_digest(i executive.initiatives) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog AS $$
  SELECT encode(digest(concat_ws('|', i.initiative_id::text, i.plan_id::text, i.objective_id::text, i.title, i.sponsor_principal_id::text, i.owner_principal_id::text,
                                       i.budget_share::text, coalesce(i.funded_amount::text, ''), coalesce(i.priority::text, ''), i.state, i.version::text), 'sha256'), 'hex')
$$;
REVOKE ALL ON FUNCTION executive._initiative_digest(executive.initiatives) FROM PUBLIC;

/* The funded sum of a plan's live initiatives (funded or approved; a paused or closed one no longer draws on the authority). */
CREATE OR REPLACE FUNCTION executive._funded_sum(p_plan uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(sum(i.funded_amount), 0)::numeric(18,2) FROM executive.initiatives i WHERE i.plan_id = p_plan AND i.state IN ('funded', 'approved')
$$;
REVOKE ALL ON FUNCTION executive._funded_sum(uuid) FROM PUBLIC;

/* Open a breach once per (plan, kind, cause); answers the breach id (the existing one when already open). */
CREATE OR REPLACE FUNCTION executive._open_breach(p_plan uuid, p_tenant uuid, p_domain uuid, p_initiative uuid, p_kind text, p_cause text, p_detail text, p_impact jsonb, p_actor uuid, p_correlation uuid)
RETURNS uuid
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  SELECT breach_id INTO v_id FROM executive.plan_breaches b WHERE b.plan_id = p_plan AND b.kind = p_kind AND b.cause_key = p_cause AND b.state <> 'resolved';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  v_id := gen_random_uuid();
  INSERT INTO executive.plan_breaches (breach_id, scope, tenant_id, domain_id, plan_id, initiative_id, kind, cause_key, detail, forecast_impact, opened_by, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_plan, p_initiative, p_kind, p_cause, p_detail, coalesce(p_impact, '{}'::jsonb), p_actor, p_correlation);
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'breach', v_id, 'breach.opened', p_actor,
                                jsonb_build_object('kind', p_kind, 'cause_key', p_cause, 'initiative_id', p_initiative, 'detail', p_detail, 'forecast_impact', p_impact), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._open_breach(uuid, uuid, uuid, uuid, text, text, text, jsonb, uuid, uuid) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P3 THE PLAN PORTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.declare_plan(
  p_plan uuid, p_tenant uuid, p_domain uuid, p_title text, p_statement text, p_horizon text, p_objectives uuid[], p_currency text, p_budget_total numeric,
  p_budget_authority numeric, p_classification text, p_review_cadence_days int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o uuid; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_objectives IS NULL OR cardinality(p_objectives) = 0 THEN RAISE EXCEPTION 'plan rejected (objectives): a plan is for at least one objective' USING ERRCODE = '22023'; END IF;
  FOREACH o IN ARRAY p_objectives LOOP
    IF NOT executive._objective_live(o, p_tenant, p_domain) THEN RAISE EXCEPTION 'plan rejected (unknown_objective): % is not a live objective (OBJ) of this domain', o USING ERRCODE = '23503'; END IF;
  END LOOP;
  IF p_horizon IS NULL OR p_horizon NOT IN ('30d', '90d', '12m', '36m') THEN RAISE EXCEPTION 'plan rejected (horizon): the horizon is one of 30d, 90d, 12m, 36m' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'plan rejected (currency): the currency is an ISO-4217 code' USING ERRCODE = '22023'; END IF;
  IF p_budget_total IS NULL OR p_budget_total < 0 OR p_budget_authority IS NULL OR p_budget_authority < 0 THEN RAISE EXCEPTION 'plan rejected (budget): the budget and its authority ceiling are amounts >= 0' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM executive.plans p WHERE p.plan_id = p_plan) THEN RAISE EXCEPTION 'plan rejected (duplicate): % is already a plan', p_plan USING ERRCODE = '22023'; END IF;
  v_digest := encode(digest(concat_ws('|', p_plan::text, p_title, p_horizon, array_to_string(p_objectives, ','), p_currency, p_budget_total::numeric(18,2)::text, p_budget_authority::numeric(18,2)::text, '0'), 'sha256'), 'hex');
  INSERT INTO executive.plans (plan_id, scope, tenant_id, domain_id, title, statement, horizon, objective_ids, owner_principal_id, budget_currency, budget_total, budget_authority, classification,
                               review_cadence_days, digest, declared_by, correlation_id)
  VALUES (p_plan, 'DOMAIN', p_tenant, p_domain, btrim(p_title), btrim(p_statement), p_horizon, p_objectives, p_actor, p_currency, p_budget_total, p_budget_authority,
          coalesce(p_classification, 'internal'), coalesce(p_review_cadence_days, 30), v_digest, p_actor, p_correlation);
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'plan', p_plan, 'plan.declared', p_actor,
                                jsonb_build_object('title', p_title, 'horizon', p_horizon, 'objectives', to_jsonb(p_objectives), 'currency', p_currency, 'budget_total', p_budget_total, 'budget_authority', p_budget_authority), p_correlation);
  RETURN (SELECT to_jsonb(p) - 'scope' FROM executive.plans p WHERE p.plan_id = p_plan);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.declare_plan(uuid,uuid,uuid,text,text,text,uuid[],text,numeric,numeric,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.declare_plan(uuid,uuid,uuid,text,text,text,uuid[],text,numeric,numeric,text,int,uuid,uuid) TO eye_commit;

/* THE AUTHORITY CEILING and its CONTINUITY: lowering it below the funded sum is recorded as a budget_over_authority BREACH (with what is
   forecast to be impacted), never silently accepted and never refused — the executive's decision stands, and its consequence is shown. */
CREATE OR REPLACE FUNCTION executive.set_plan_authority(p_plan uuid, p_tenant uuid, p_domain uuid, p_authority numeric, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; v_funded numeric; v_breach uuid; v_prior numeric;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.authority.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan rejected (actor): the authority is set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_authority IS NULL OR p_authority < 0 THEN RAISE EXCEPTION 'plan rejected (budget): the authority ceiling is an amount >= 0' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'plan rejected (reason): a change of authority says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  v_prior := pl.budget_authority;
  UPDATE executive.plans SET budget_authority = p_authority, updated_at = clock_timestamp(),
         digest = encode(digest(concat_ws('|', plan_id::text, title, horizon, array_to_string(objective_ids, ','), budget_currency, budget_total::text, p_authority::numeric(18,2)::text, current_version::text), 'sha256'), 'hex')
   WHERE plan_id = p_plan;
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'plan', p_plan, 'plan.authority_set', p_actor, jsonb_build_object('from', v_prior, 'to', p_authority, 'reason', p_reason), p_correlation);
  v_funded := executive._funded_sum(p_plan);
  IF v_funded > p_authority THEN
    v_breach := executive._open_breach(p_plan, p_tenant, p_domain, NULL, 'budget_over_authority', format('funded %s > authority %s', v_funded::text, p_authority::numeric(18,2)::text),
      format('the funded shares of plan "%s" sum to %s %s, above the authority ceiling of %s %s set at %s (%s)', pl.title, v_funded::text, pl.budget_currency, p_authority::numeric(18,2)::text, pl.budget_currency, clock_timestamp(), p_reason),
      jsonb_build_object('funded', v_funded, 'authority', p_authority, 'over_by', (v_funded - p_authority), 'currency', pl.budget_currency,
                         'initiatives', (SELECT coalesce(jsonb_agg(jsonb_build_object('initiative_id', i.initiative_id, 'title', i.title, 'funded_amount', i.funded_amount, 'state', i.state) ORDER BY i.priority NULLS LAST, i.proposed_at), '[]'::jsonb)
                                           FROM executive.initiatives i WHERE i.plan_id = p_plan AND i.state IN ('funded', 'approved')),
                         'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object('milestone_id', m.milestone_id, 'name', m.name, 'due_date', m.due_date, 'initiative_id', m.initiative_id) ORDER BY m.due_date), '[]'::jsonb)
                                          FROM executive.milestones m JOIN executive.initiatives i ON i.initiative_id = m.initiative_id WHERE m.plan_id = p_plan AND i.state IN ('funded', 'approved') AND m.state NOT IN ('met', 'cancelled'))),
      p_actor, p_correlation);
  END IF;
  RETURN jsonb_build_object('plan_id', p_plan, 'budget_authority', p_authority, 'prior_authority', v_prior, 'funded', v_funded, 'currency', pl.budget_currency,
                            'breach_id', v_breach, 'continuity', CASE WHEN v_breach IS NULL THEN 'within authority' ELSE 'breach: the funded sum exceeds the new ceiling' END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_plan_authority(uuid,uuid,uuid,numeric,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_plan_authority(uuid,uuid,uuid,numeric,text,uuid,uuid) TO eye_commit;

/* A review of the plan by the strategy lead or the executive: the drift window restarts; an open drift breach resolves. */
CREATE OR REPLACE FUNCTION executive.review_plan(p_plan uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; v_now timestamptz := clock_timestamp(); v_resolved int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan rejected (actor): reviewed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'plan rejected (note): a review records what was reviewed (8 characters or more)' USING ERRCODE = '22023'; END IF;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  UPDATE executive.plans SET last_reviewed_at = v_now, updated_at = v_now WHERE plan_id = p_plan;
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'plan', p_plan, 'plan.reviewed', p_actor, jsonb_build_object('note', p_note, 'reviewed_at', v_now), p_correlation);
  WITH r AS (UPDATE executive.plan_breaches SET state = 'resolved', resolved_at = v_now, resolved_by = p_actor, resolution = format('reviewed at %s: %s', v_now, p_note)
              WHERE plan_id = p_plan AND kind = 'drift_without_review' AND state <> 'resolved' RETURNING breach_id)
  SELECT count(*) INTO v_resolved FROM r;
  RETURN jsonb_build_object('plan_id', p_plan, 'reviewed_at', v_now, 'drift_breaches_resolved', v_resolved);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.review_plan(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.review_plan(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* THE BASELINE: a signed version. The port writes the version (the initiatives, milestones, measures, dependencies and budget as of now,
   and the digest the executive signs); the service then records the signature (§0 record_signature, kind plan_baseline, under this same
   action) and admits the PLN object. At least one initiative must be APPROVED — a plan of proposals is not a baseline. */
CREATE OR REPLACE FUNCTION executive.baseline_plan(p_version uuid, p_plan uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; v_version int; v_snapshot jsonb; v_digest text; v_now timestamptz := clock_timestamp(); i record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.baseline']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan baseline rejected (actor): baselined by the acting principal' USING ERRCODE = '42501'; END IF;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  IF NOT EXISTS (SELECT 1 FROM executive.initiatives x WHERE x.plan_id = p_plan AND x.state = 'approved') THEN
    RAISE EXCEPTION 'plan baseline rejected (state): plan "%" has no approved initiative — a baseline binds approved initiatives', pl.title USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.plan_breaches b WHERE b.plan_id = p_plan AND b.state = 'open') THEN
    RAISE EXCEPTION 'plan baseline rejected (breach_open): plan "%" has an open breach; acknowledge or resolve it before a baseline', pl.title USING ERRCODE = '22023';
  END IF;
  v_version := pl.current_version + 1;
  v_snapshot := jsonb_build_object(
    'plan_id', p_plan, 'version', v_version, 'title', pl.title, 'statement', pl.statement, 'horizon', pl.horizon, 'classification', pl.classification,
    'objectives', to_jsonb(pl.objective_ids),
    'initiatives', (SELECT coalesce(jsonb_agg(jsonb_build_object('initiative_id', x.initiative_id, 'title', x.title, 'objective_id', x.objective_id, 'state', x.state, 'sponsor', x.sponsor_principal_id, 'owner', x.owner_principal_id,
                                                                 'budget_share', x.budget_share, 'funded_amount', x.funded_amount, 'priority', x.priority, 'version', x.version, 'digest', x.digest,
                                                                 'objectives', (SELECT coalesce(jsonb_agg(io.objective_id ORDER BY io.objective_id), '[]'::jsonb) FROM executive.initiative_objectives io WHERE io.initiative_id = x.initiative_id))
                                              ORDER BY x.priority NULLS LAST, x.proposed_at), '[]'::jsonb)
                      FROM executive.initiatives x WHERE x.plan_id = p_plan AND x.state <> 'closed'),
    'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object('milestone_id', m.milestone_id, 'initiative_id', m.initiative_id, 'name', m.name, 'due_date', m.due_date, 'measure_id', m.measure_id, 'target_value', m.target_value, 'state', m.state) ORDER BY m.due_date, m.name), '[]'::jsonb)
                     FROM executive.milestones m WHERE m.plan_id = p_plan AND m.state <> 'cancelled'),
    'measures', (SELECT coalesce(jsonb_agg(jsonb_build_object('measure_id', pm.measure_id, 'quantity_key', pm.quantity_key, 'definition_version', g.definition_version, 'definition_digest', g.definition_digest, 'target_value', g.target_value, 'target_date', g.target_date, 'unit', g.unit, 'direction', g.direction) ORDER BY pm.measure_id), '[]'::jsonb)
                   FROM executive.plan_measures pm JOIN graph.measures g ON g.measure_id = pm.measure_id WHERE pm.plan_id = p_plan),
    'dependencies', (SELECT coalesce(jsonb_agg(jsonb_build_object('dependency_id', d.dependency_id, 'from', d.from_initiative_id, 'to', d.to_initiative_id, 'kind', d.kind) ORDER BY d.declared_at), '[]'::jsonb)
                       FROM executive.initiative_dependencies d WHERE d.plan_id = p_plan AND d.state = 'active'),
    'budget', jsonb_build_object('currency', pl.budget_currency, 'total', pl.budget_total, 'authority', pl.budget_authority, 'funded', executive._funded_sum(p_plan)),
    'baselined_by', p_actor::text, 'baselined_at', v_now, 'note', p_note);
  v_digest := encode(digest(v_snapshot::text, 'sha256'), 'hex');
  v_snapshot := v_snapshot || jsonb_build_object('baseline_digest', v_digest);
  INSERT INTO executive.plan_versions (version_id, scope, tenant_id, domain_id, plan_id, version, snapshot, digest, note, baselined_by, baselined_at, correlation_id)
  VALUES (p_version, 'DOMAIN', p_tenant, p_domain, p_plan, v_version, v_snapshot, v_digest, p_note, p_actor, v_now, p_correlation);
  UPDATE executive.plans SET state = 'baselined', current_version = v_version, last_reviewed_at = coalesce(last_reviewed_at, v_now), updated_at = v_now,
         digest = encode(digest(concat_ws('|', plan_id::text, title, horizon, array_to_string(objective_ids, ','), budget_currency, budget_total::text, budget_authority::text, v_version::text), 'sha256'), 'hex')
   WHERE plan_id = p_plan;
  FOR i IN SELECT x.initiative_id, x.state FROM executive.initiatives x WHERE x.plan_id = p_plan AND x.state = 'approved' LOOP
    INSERT INTO executive.initiative_transitions (transition_id, scope, tenant_id, domain_id, initiative_id, transition, from_state, to_state, actor_principal_id, actor_kind, reason, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, i.initiative_id, 'baseline', i.state, i.state, p_actor, 'human', p_note, jsonb_build_object('plan_version', v_version, 'version_id', p_version, 'digest', v_digest), p_correlation);
  END LOOP;
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'version', p_version, 'plan.baselined', p_actor, jsonb_build_object('version', v_version, 'digest', v_digest, 'note', p_note), p_correlation);
  RETURN jsonb_build_object('version_id', p_version, 'plan_id', p_plan, 'version', v_version, 'digest', v_digest, 'baselined_at', v_now, 'snapshot', v_snapshot);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.baseline_plan(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.baseline_plan(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P4 THE INITIATIVE TRANSITIONS UNDER HUMAN AUTHORITY
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* PROPOSE: the strategy lead or the Planning Agent (PDP: no human gate on this one act; the port records the proposer's kind). The
   initiative IS the INI object of the Strategy Graph; it must be active and not yet in a plan; the objective a live OBJ; sponsor and owner
   active humans. */
CREATE OR REPLACE FUNCTION executive.propose_initiative(
  p_initiative uuid, p_tenant uuid, p_domain uuid, p_plan uuid, p_objective uuid, p_sponsor uuid, p_owner uuid, p_budget_share numeric, p_rationale text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; s graph.strategy_current%ROWTYPE; v_kind text; i executive.initiatives%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): proposed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT p.kind INTO v_kind FROM identity.principals p WHERE p.id = p_actor;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  SELECT * INTO s FROM graph.strategy_current x WHERE x.strategy_object_id = p_initiative AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR s.object_type <> 'INI' THEN RAISE EXCEPTION 'initiative rejected (unknown_initiative): % is not an initiative (INI) of the Strategy Graph of this domain', p_initiative USING ERRCODE = '23503'; END IF;
  IF s.status <> 'active' THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is % in the Strategy Graph', s.title, s.status USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM executive.initiatives x WHERE x.initiative_id = p_initiative) THEN RAISE EXCEPTION 'initiative rejected (duplicate): initiative "%" is already proposed into a plan', s.title USING ERRCODE = '22023'; END IF;
  IF NOT executive._objective_live(p_objective, p_tenant, p_domain) THEN RAISE EXCEPTION 'initiative rejected (unknown_objective): % is not a live objective (OBJ) of this domain', p_objective USING ERRCODE = '23503'; END IF;
  IF NOT (p_objective = ANY (pl.objective_ids)) THEN RAISE EXCEPTION 'initiative rejected (objectives): objective % is not in the objective set of plan "%"', p_objective, pl.title USING ERRCODE = '22023'; END IF;
  IF p_sponsor IS NULL OR NOT decision.is_active_human(p_sponsor, p_tenant) THEN RAISE EXCEPTION 'initiative rejected (sponsor): the sponsor is an active human principal of this tenant' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN RAISE EXCEPTION 'initiative rejected (owner): the owner is an active human principal of this tenant' USING ERRCODE = '22023'; END IF;
  IF p_budget_share IS NULL OR p_budget_share < 0 THEN RAISE EXCEPTION 'initiative rejected (budget): the budget share is an amount >= 0' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): a proposal says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.initiatives (initiative_id, scope, tenant_id, domain_id, plan_id, objective_id, title, sponsor_principal_id, owner_principal_id, budget_share, proposed_by, proposed_by_kind, digest, correlation_id)
  VALUES (p_initiative, 'DOMAIN', p_tenant, p_domain, p_plan, p_objective, s.title, p_sponsor, p_owner, p_budget_share, p_actor, CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'human' END, repeat('0', 64), p_correlation);
  INSERT INTO executive.initiative_objectives (initiative_id, objective_id, linked_by) VALUES (p_initiative, p_objective, p_actor);
  SELECT * INTO i FROM executive.initiatives x WHERE x.initiative_id = p_initiative;
  UPDATE executive.initiatives SET digest = executive._initiative_digest(i) WHERE initiative_id = p_initiative;
  INSERT INTO executive.initiative_transitions (transition_id, scope, tenant_id, domain_id, initiative_id, transition, from_state, to_state, actor_principal_id, actor_kind, reason, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_initiative, 'propose', NULL, 'proposed', p_actor, CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'human' END, p_rationale,
          jsonb_build_object('plan_id', p_plan, 'objective_id', p_objective, 'sponsor', p_sponsor, 'owner', p_owner, 'budget_share', p_budget_share), p_correlation);
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'initiative', p_initiative, 'initiative.proposed', p_actor, jsonb_build_object('title', s.title, 'objective_id', p_objective, 'proposed_by_kind', CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'human' END), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'scope' FROM executive.initiatives x WHERE x.initiative_id = p_initiative);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.propose_initiative(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.propose_initiative(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,uuid) TO eye_commit;

/* The transition record (internal). */
CREATE OR REPLACE FUNCTION executive._transition(i executive.initiatives, p_transition text, p_to text, p_actor uuid, p_reason text, p_details jsonb, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid(); x executive.initiatives%ROWTYPE;
BEGIN
  INSERT INTO executive.initiative_transitions (transition_id, scope, tenant_id, domain_id, initiative_id, transition, from_state, to_state, actor_principal_id, actor_kind, reason, details, correlation_id)
  VALUES (v_id, 'DOMAIN', i.tenant_id, i.domain_id, i.initiative_id, p_transition, i.state, p_to, p_actor, 'human', p_reason, coalesce(p_details, '{}'::jsonb), p_correlation);
  SELECT * INTO x FROM executive.initiatives y WHERE y.initiative_id = i.initiative_id;
  UPDATE executive.initiatives SET digest = executive._initiative_digest(x) WHERE initiative_id = i.initiative_id;
  PERFORM executive._plan_event(i.plan_id, i.tenant_id, i.domain_id, 'initiative', i.initiative_id, 'initiative.' || CASE p_transition WHEN 'propose' THEN 'proposed' WHEN 'align' THEN 'aligned' WHEN 'prioritise' THEN 'prioritised' WHEN 'fund' THEN 'funded' WHEN 'approve' THEN 'approved' WHEN 'pause' THEN 'paused' ELSE 'closed' END,
                                p_actor, jsonb_build_object('from', i.state, 'to', p_to, 'reason', p_reason) || coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN (SELECT to_jsonb(y) - 'scope' || jsonb_build_object('transition_id', v_id) FROM executive.initiatives y WHERE y.initiative_id = i.initiative_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._transition(executive.initiatives, text, text, uuid, text, jsonb, uuid) FROM PUBLIC;

/* ALIGN: the strategy lead links the objectives (each a live OBJ of the plan's set; the primary kept); proposed → aligned. */
CREATE OR REPLACE FUNCTION executive.align_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_objectives uuid[], p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE; pl executive.plans%ROWTYPE; o uuid; v_objs uuid[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.align']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): aligned by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): an alignment says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  SELECT * INTO pl FROM executive.plans p WHERE p.plan_id = i.plan_id;
  IF i.state NOT IN ('proposed', 'aligned') THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is %, not proposed', i.title, i.state USING ERRCODE = '22023'; END IF;
  v_objs := ARRAY[i.objective_id] || coalesce(p_objectives, '{}'::uuid[]);
  FOREACH o IN ARRAY v_objs LOOP
    IF NOT executive._objective_live(o, p_tenant, p_domain) THEN RAISE EXCEPTION 'initiative rejected (unknown_objective): % is not a live objective (OBJ) of this domain', o USING ERRCODE = '23503'; END IF;
    IF NOT (o = ANY (pl.objective_ids)) THEN RAISE EXCEPTION 'initiative rejected (objectives): objective % is not in the objective set of plan "%"', o, pl.title USING ERRCODE = '22023'; END IF;
    INSERT INTO executive.initiative_objectives (initiative_id, objective_id, linked_by) VALUES (p_initiative, o, p_actor) ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE executive.initiatives SET state = 'aligned', version = version + 1, updated_at = clock_timestamp() WHERE initiative_id = p_initiative;
  RETURN executive._transition(i, 'align', 'aligned', p_actor, p_rationale, jsonb_build_object('objectives', to_jsonb(v_objs)), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.align_initiative(uuid,uuid,uuid,uuid[],text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.align_initiative(uuid,uuid,uuid,uuid[],text,uuid,uuid) TO eye_commit;

/* PRIORITISE: the strategy lead ranks an ALIGNED initiative (an unaligned one is refused); aligned | prioritised → prioritised. */
CREATE OR REPLACE FUNCTION executive.prioritise_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_priority int, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.prioritise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): prioritised by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_priority IS NULL OR p_priority < 1 THEN RAISE EXCEPTION 'initiative rejected (priority): a priority is a rank >= 1' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): a prioritisation says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  IF i.state = 'proposed' THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is not aligned to an objective yet — align it before it is prioritised', i.title USING ERRCODE = '22023'; END IF;
  IF i.state NOT IN ('aligned', 'prioritised') THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is %, not aligned', i.title, i.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.initiatives SET state = 'prioritised', priority = p_priority, version = version + 1, updated_at = clock_timestamp() WHERE initiative_id = p_initiative;
  RETURN executive._transition(i, 'prioritise', 'prioritised', p_actor, p_rationale, jsonb_build_object('priority', p_priority), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.prioritise_initiative(uuid,uuid,uuid,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.prioritise_initiative(uuid,uuid,uuid,int,text,uuid,uuid) TO eye_commit;

/* FUND: the executive or the decision authority funds a PRIORITISED initiative WITHIN THE PLAN'S AUTHORITY — the funded sum of the plan's
   live initiatives plus this amount may not exceed the ceiling (`initiative rejected (budget_authority)`). */
CREATE OR REPLACE FUNCTION executive.fund_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_amount numeric, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE; pl executive.plans%ROWTYPE; v_funded numeric;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.fund']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): funded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'initiative rejected (budget): the funded amount is an amount >= 0' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): a funding says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  SELECT * INTO pl FROM executive.plans p WHERE p.plan_id = i.plan_id;
  IF i.state <> 'prioritised' THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is %, not prioritised — the lead prioritises before the executive funds', i.title, i.state USING ERRCODE = '22023'; END IF;
  v_funded := executive._funded_sum(i.plan_id);
  IF v_funded + p_amount > pl.budget_authority THEN
    RAISE EXCEPTION 'initiative rejected (budget_authority): funding % % for "%" would bring the funded sum of plan "%" to % %, above its authority ceiling of % %',
      p_amount::numeric(18,2), pl.budget_currency, i.title, pl.title, (v_funded + p_amount)::numeric(18,2), pl.budget_currency, pl.budget_authority, pl.budget_currency USING ERRCODE = '22023';
  END IF;
  UPDATE executive.initiatives SET state = 'funded', funded_amount = p_amount, version = version + 1, updated_at = clock_timestamp() WHERE initiative_id = p_initiative;
  RETURN executive._transition(i, 'fund', 'funded', p_actor, p_rationale, jsonb_build_object('funded_amount', p_amount, 'currency', pl.budget_currency, 'funded_sum_after', v_funded + p_amount, 'authority', pl.budget_authority), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.fund_initiative(uuid,uuid,uuid,numeric,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.fund_initiative(uuid,uuid,uuid,numeric,text,uuid,uuid) TO eye_commit;

/* APPROVE: the human boundary. A second named human (never the proposer) approves a FUNDED initiative; the service then admits the next
   INI version (the approval in metrics.planning) under this action. */
CREATE OR REPLACE FUNCTION executive.approve_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): approved by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): an approval says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  IF i.proposed_by = p_actor THEN RAISE EXCEPTION 'initiative rejected (separation): initiative "%" is approved by someone other than its proposer', i.title USING ERRCODE = '42501'; END IF;
  IF i.state <> 'funded' THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is %, not funded — funding precedes approval', i.title, i.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.initiatives SET state = 'approved', approved_by = p_actor, approved_at = v_now, version = version + 1, updated_at = v_now WHERE initiative_id = p_initiative;
  RETURN executive._transition(i, 'approve', 'approved', p_actor, p_rationale, jsonb_build_object('approved_at', v_now), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.approve_initiative(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.approve_initiative(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* The approved INI version's number, recorded by the service after the admission (the object's planning view names it). */
CREATE OR REPLACE FUNCTION executive.record_initiative_object_version(p_initiative uuid, p_tenant uuid, p_domain uuid, p_version bigint, p_actor uuid) RETURNS void
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  UPDATE executive.initiatives SET approved_object_version = p_version WHERE initiative_id = p_initiative AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'approved' AND approved_by = p_actor;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_initiative_object_version(uuid,uuid,uuid,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_initiative_object_version(uuid,uuid,uuid,bigint,uuid) TO eye_commit;

/* PAUSE and CLOSE: the SPONSOR's acts, with a reason. A paused or closed initiative no longer draws on the authority. */
CREATE OR REPLACE FUNCTION executive.pause_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.pause']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): paused by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): a pause says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  IF i.sponsor_principal_id <> p_actor THEN RAISE EXCEPTION 'initiative rejected (not_sponsor): initiative "%" is paused by its sponsor', i.title USING ERRCODE = '42501'; END IF;
  IF i.state IN ('paused', 'closed') THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is already %', i.title, i.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.initiatives SET state = 'paused', pause_reason = p_reason, version = version + 1, updated_at = clock_timestamp() WHERE initiative_id = p_initiative;
  RETURN executive._transition(i, 'pause', 'paused', p_actor, p_reason, '{}'::jsonb, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.pause_initiative(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.pause_initiative(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION executive.close_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): closed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): a close says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  IF i.sponsor_principal_id <> p_actor THEN RAISE EXCEPTION 'initiative rejected (not_sponsor): initiative "%" is closed by its sponsor', i.title USING ERRCODE = '42501'; END IF;
  IF i.state = 'closed' THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is already closed', i.title USING ERRCODE = '22023'; END IF;
  UPDATE executive.initiatives SET state = 'closed', close_reason = p_reason, version = version + 1, updated_at = clock_timestamp() WHERE initiative_id = p_initiative;
  UPDATE executive.milestones SET state = 'cancelled', updated_at = clock_timestamp() WHERE initiative_id = p_initiative AND state IN ('planned', 'at_risk');
  RETURN executive._transition(i, 'close', 'closed', p_actor, p_reason, '{}'::jsonb, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.close_initiative(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.close_initiative(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P5 MILESTONES, DEPENDENCIES, PLAN MEASURES, PLAN RUNS (the strategy lead's planning edits)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A milestone: its measure is a graph.measures row of the domain that measures one of the initiative's objectives; the measure is bound
   into the plan's measures when not yet. */
CREATE OR REPLACE FUNCTION executive.set_milestone(p_milestone uuid, p_tenant uuid, p_domain uuid, p_initiative uuid, p_name text, p_due date, p_measure uuid, p_target numeric, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE; g graph.measures%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.milestone.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'milestone rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_name IS NULL OR length(btrim(p_name)) < 2 THEN RAISE EXCEPTION 'milestone rejected (name): a milestone is named (2 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_due IS NULL THEN RAISE EXCEPTION 'milestone rejected (due_date): a milestone has a due date' USING ERRCODE = '22023'; END IF;
  IF p_target IS NULL THEN RAISE EXCEPTION 'milestone rejected (target): a milestone names the value its measure must reach' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  IF i.state = 'closed' THEN RAISE EXCEPTION 'milestone rejected (state): initiative "%" is closed', i.title USING ERRCODE = '22023'; END IF;
  SELECT * INTO g FROM graph.measures m WHERE m.measure_id = p_measure AND m.tenant_id = p_tenant AND m.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'milestone rejected (unknown_measure): % is not a measure (MSR) of this domain', p_measure USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.initiative_objectives io WHERE io.initiative_id = p_initiative AND io.objective_id = g.objective_id) THEN
    RAISE EXCEPTION 'milestone rejected (measure_objective): measure % measures objective %, which initiative "%" is not aligned to', p_measure, g.objective_id, i.title USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.milestones m WHERE m.milestone_id = p_milestone) THEN RAISE EXCEPTION 'milestone rejected (duplicate): % is already a milestone', p_milestone USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.milestones (milestone_id, scope, tenant_id, domain_id, plan_id, initiative_id, name, due_date, measure_id, target_value, declared_by, correlation_id)
  VALUES (p_milestone, 'DOMAIN', p_tenant, p_domain, i.plan_id, p_initiative, btrim(p_name), p_due, p_measure, p_target, p_actor, p_correlation);
  INSERT INTO executive.plan_measures (plan_id, measure_id, quantity_key, bound_by) VALUES (i.plan_id, p_measure, NULL, p_actor) ON CONFLICT DO NOTHING;
  PERFORM executive._plan_event(i.plan_id, p_tenant, p_domain, 'milestone', p_milestone, 'milestone.set', p_actor, jsonb_build_object('initiative_id', p_initiative, 'name', p_name, 'due_date', p_due, 'measure_id', p_measure, 'target_value', p_target), p_correlation);
  RETURN (SELECT to_jsonb(m) - 'scope' FROM executive.milestones m WHERE m.milestone_id = p_milestone);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_milestone(uuid,uuid,uuid,uuid,text,date,uuid,numeric,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_milestone(uuid,uuid,uuid,uuid,text,date,uuid,numeric,uuid,uuid) TO eye_commit;

/* A dependency between two initiatives of the same plan; a finish_to_start CYCLE is refused. */
CREATE OR REPLACE FUNCTION executive.declare_initiative_dependency(p_dependency uuid, p_tenant uuid, p_domain uuid, p_from uuid, p_to uuid, p_kind text, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.initiatives%ROWTYPE; b executive.initiatives%ROWTYPE; v_cycle uuid[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.dependency.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan dependency rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('finish_to_start', 'shares_resource') THEN RAISE EXCEPTION 'plan dependency rejected (kind): the kind is finish_to_start or shares_resource' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'plan dependency rejected (reason): a dependency says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'plan dependency rejected (self): an initiative does not depend on itself' USING ERRCODE = '22023'; END IF;
  a := executive._initiative_locked(p_from, p_tenant, p_domain);
  SELECT * INTO b FROM executive.initiatives x WHERE x.initiative_id = p_to AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan dependency rejected (unknown_initiative): % is not an initiative of a plan of this domain', p_to USING ERRCODE = '23503'; END IF;
  IF a.plan_id <> b.plan_id THEN RAISE EXCEPTION 'plan dependency rejected (plan): "%" and "%" are in different plans', a.title, b.title USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM executive.initiative_dependencies d WHERE d.from_initiative_id = p_from AND d.to_initiative_id = p_to AND d.kind = p_kind AND d.state = 'active') THEN
    RAISE EXCEPTION 'plan dependency rejected (duplicate): "%" → "%" (%) is already declared', a.title, b.title, p_kind USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'finish_to_start' THEN
    WITH RECURSIVE walk AS (
      SELECT d.to_initiative_id AS node, ARRAY[p_to, d.to_initiative_id] AS path FROM executive.initiative_dependencies d WHERE d.from_initiative_id = p_to AND d.kind = 'finish_to_start' AND d.state = 'active'
      UNION ALL
      SELECT d.to_initiative_id, w.path || d.to_initiative_id FROM walk w JOIN executive.initiative_dependencies d ON d.from_initiative_id = w.node AND d.kind = 'finish_to_start' AND d.state = 'active'
       WHERE NOT (d.to_initiative_id = ANY (w.path)))
    SELECT path INTO v_cycle FROM walk WHERE node = p_from LIMIT 1;
    IF v_cycle IS NOT NULL THEN
      RAISE EXCEPTION 'plan dependency rejected (cycle): "%" → "%" would close a finish_to_start cycle (%)', a.title, b.title, array_to_string(v_cycle, ' → ') USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO executive.initiative_dependencies (dependency_id, scope, tenant_id, domain_id, plan_id, from_initiative_id, to_initiative_id, kind, rationale, declared_by, correlation_id)
  VALUES (p_dependency, 'DOMAIN', p_tenant, p_domain, a.plan_id, p_from, p_to, p_kind, btrim(p_rationale), p_actor, p_correlation);
  PERFORM executive._plan_event(a.plan_id, p_tenant, p_domain, 'dependency', p_dependency, 'dependency.declared', p_actor, jsonb_build_object('from', p_from, 'to', p_to, 'kind', p_kind, 'rationale', p_rationale), p_correlation);
  RETURN (SELECT to_jsonb(d) - 'scope' FROM executive.initiative_dependencies d WHERE d.dependency_id = p_dependency);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.declare_initiative_dependency(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.declare_initiative_dependency(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* A plan measure: a graph.measures row bound by id (the Strategy Graph's — never a copy), with the run output key its sensitivity maps. */
CREATE OR REPLACE FUNCTION executive.bind_plan_measure(p_plan uuid, p_tenant uuid, p_domain uuid, p_measure uuid, p_quantity_key text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; g graph.measures%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.measure.bind']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan measure rejected (actor): bound by the acting principal' USING ERRCODE = '42501'; END IF;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  SELECT * INTO g FROM graph.measures m WHERE m.measure_id = p_measure AND m.tenant_id = p_tenant AND m.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan measure rejected (unknown_measure): % is not a measure (MSR) of this domain', p_measure USING ERRCODE = '23503'; END IF;
  IF NOT (g.objective_id = ANY (pl.objective_ids)) THEN RAISE EXCEPTION 'plan measure rejected (objectives): measure % measures objective %, which is not in the objective set of plan "%"', p_measure, g.objective_id, pl.title USING ERRCODE = '22023'; END IF;
  IF p_quantity_key IS NOT NULL AND length(btrim(p_quantity_key)) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'plan measure rejected (quantity_key): a run output key is 1 to 128 characters' USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.plan_measures (plan_id, measure_id, quantity_key, bound_by) VALUES (p_plan, p_measure, NULLIF(btrim(p_quantity_key), ''), p_actor)
  ON CONFLICT (plan_id, measure_id) DO UPDATE SET quantity_key = EXCLUDED.quantity_key, bound_by = EXCLUDED.bound_by, bound_at = clock_timestamp();
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'measure', p_measure, 'measure.bound', p_actor, jsonb_build_object('quantity_key', p_quantity_key, 'definition_version', g.definition_version), p_correlation);
  RETURN jsonb_build_object('plan_id', p_plan, 'measure_id', p_measure, 'quantity_key', NULLIF(btrim(p_quantity_key), ''), 'objective_id', g.objective_id, 'unit', g.unit, 'direction', g.direction, 'target_value', g.target_value, 'target_date', g.target_date);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.bind_plan_measure(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.bind_plan_measure(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* A scenario run attached to the plan: the runs the variance step reads and the workspace's sensitivity offers. A completed run of this domain. */
CREATE OR REPLACE FUNCTION executive.attach_plan_run(p_plan uuid, p_tenant uuid, p_domain uuid, p_run uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, simulation, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; r simulation.runs_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.run.attach']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan run rejected (actor): attached by the acting principal' USING ERRCODE = '42501'; END IF;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan run rejected (unknown_run): % is not a simulation run of this domain', p_run USING ERRCODE = '23503'; END IF;
  IF r.state <> 'completed' OR r.outputs IS NULL THEN RAISE EXCEPTION 'plan run rejected (state): run % is %, not completed with outputs', p_run, r.state USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.plan_runs (plan_id, run_id, attached_by) VALUES (p_plan, p_run, p_actor) ON CONFLICT DO NOTHING;
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'run', p_run, 'run.attached', p_actor, jsonb_build_object('model_ref', r.model_ref, 'outputs_digest', r.outputs_digest, 'scenario_id', r.scenario_id, 'component', r.component), p_correlation);
  RETURN jsonb_build_object('plan_id', p_plan, 'run_id', p_run, 'model_ref', r.model_ref, 'outputs_digest', r.outputs_digest, 'scenario_id', r.scenario_id, 'completed_at', r.completed_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attach_plan_run(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attach_plan_run(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P6 THE BREACHES: the acknowledgement, the commitment HOLD, the citation
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The executive (or the decision authority) ACKNOWLEDGES an open breach with an authorization: the breach stays recorded (shown), and a
   commitment on the plan's initiatives is no longer held by it. */
CREATE OR REPLACE FUNCTION executive.acknowledge_plan_breach(p_breach uuid, p_tenant uuid, p_domain uuid, p_authorization text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b executive.plan_breaches%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.breach.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan breach rejected (actor): acknowledged by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_authorization IS NULL OR length(btrim(p_authorization)) < 8 THEN RAISE EXCEPTION 'plan breach rejected (authorization): an acknowledgement names the authority for the commitments it permits (8 characters or more)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO b FROM executive.plan_breaches x WHERE x.breach_id = p_breach AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan breach rejected (unknown_breach): % is not a breach of a plan of this domain', p_breach USING ERRCODE = '23503'; END IF;
  IF b.state <> 'open' THEN RAISE EXCEPTION 'plan breach rejected (state): breach % is %, not open', p_breach, b.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.plan_breaches SET state = 'acknowledged', acknowledged_by = p_actor, acknowledged_at = v_now, authorization_note = btrim(p_authorization) WHERE breach_id = p_breach;
  PERFORM executive._plan_event(b.plan_id, p_tenant, p_domain, 'breach', p_breach, 'breach.acknowledged', p_actor, jsonb_build_object('kind', b.kind, 'authorization', p_authorization), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'scope' FROM executive.plan_breaches x WHERE x.breach_id = p_breach);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.acknowledge_plan_breach(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.acknowledge_plan_breach(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* THE CITATION: a decision package cites the initiative it commits to (the owner's or the lead's act); the package event initiative.cited. */
CREATE OR REPLACE FUNCTION executive.cite_initiative(p_package uuid, p_tenant uuid, p_domain uuid, p_initiative uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; i executive.initiatives%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.initiative.cite']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative citation rejected (actor): cited by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'initiative citation rejected (unknown_package): % is not a decision package of this domain', p_package USING ERRCODE = '23503'; END IF;
  IF p.state NOT IN ('draft', 'proposed', 'under_review', 'approved') THEN RAISE EXCEPTION 'initiative citation rejected (state): package "%" is %; a citation is made before commitment', p.title, p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM executive.initiatives x WHERE x.initiative_id = p_initiative AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'initiative citation rejected (unknown_initiative): % is not an initiative of a plan of this domain', p_initiative USING ERRCODE = '23503'; END IF;
  IF p.owner_principal_id <> p_actor AND NOT EXISTS (SELECT 1 FROM executive.plans pl WHERE pl.plan_id = i.plan_id AND pl.owner_principal_id = p_actor) THEN
    RAISE EXCEPTION 'initiative citation rejected (not_owner): package "%" is cited by its owner or the plan''s lead', p.title USING ERRCODE = '42501';
  END IF;
  UPDATE decision.packages_current SET initiative_id = p_initiative WHERE package_id = p_package;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package, 'initiative.cited', p_actor, jsonb_build_object('initiative_id', p_initiative, 'plan_id', i.plan_id, 'title', i.title), p_correlation);
  PERFORM executive._plan_event(i.plan_id, p_tenant, p_domain, 'citation', p_package, 'initiative.cited', p_actor, jsonb_build_object('package_id', p_package, 'initiative_id', p_initiative, 'package_title', p.title), p_correlation);
  RETURN jsonb_build_object('package_id', p_package, 'initiative_id', p_initiative, 'plan_id', i.plan_id, 'title', i.title);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.cite_initiative(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.cite_initiative(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* THE COMMITMENT HOLD: BEFORE the tracker seeds (0090 §C2's AFTER INSERT trigger), a commitment on a package that cites an initiative of a
   plan with an OPEN breach is refused — the unauthorized commitment is HELD until the executive acknowledges the breach (the authority
   named) or the breach resolves. The citation is feature-detected on the package (NULL = no citation, nothing held). */
CREATE OR REPLACE FUNCTION executive.hold_commitment_on_breach() RETURNS trigger
SECURITY DEFINER SET search_path = executive, decision, pg_catalog, pg_temp AS $$
DECLARE v_initiative uuid; i executive.initiatives%ROWTYPE; v_breaches text;
BEGIN
  SELECT initiative_id INTO v_initiative FROM decision.packages_current p WHERE p.package_id = NEW.package_id;
  IF v_initiative IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO i FROM executive.initiatives x WHERE x.initiative_id = v_initiative;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT string_agg(format('%s [%s]', b.kind, b.cause_key), '; ' ORDER BY b.opened_at) INTO v_breaches FROM executive.plan_breaches b WHERE b.plan_id = i.plan_id AND b.state = 'open';
  IF v_breaches IS NOT NULL THEN
    RAISE EXCEPTION 'plan commitment rejected (breach_open): package % cites initiative "%" of a plan with open breach(es) — %; the commitment is held until the executive acknowledges the breach or it resolves', NEW.package_id, i.title, v_breaches USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER a_hold_on_plan_breach BEFORE INSERT ON decision.commitments FOR EACH ROW EXECUTE FUNCTION executive.hold_commitment_on_breach();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P7 THE TICK STEP `plan-variance` (order 55): VARIANCES routed, BREACHES opened and resolved
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The value a run's outputs give a key at a date: the last series row dated on or before p_date (the supply-flow model's `days`, a
   method's `series`); NULL when the run has no such row or the cell is not a number. */
CREATE OR REPLACE FUNCTION executive.run_quantity_at(p_outputs jsonb, p_key text, p_date date) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT (SELECT jsonb_build_object('date', row ->> 'date', 'value', (row ->> p_key)::numeric)
            FROM jsonb_array_elements(coalesce(p_outputs -> 'series', p_outputs -> 'days', '[]'::jsonb)) row
           WHERE (row ->> 'date') ~ '^\d{4}-\d{2}-\d{2}' AND (row ->> 'date')::date <= p_date AND (row ->> p_key) ~ '^-?[0-9]+(\.[0-9]+)?$'
           ORDER BY (row ->> 'date')::date DESC LIMIT 1)
$$;
GRANT EXECUTE ON FUNCTION executive.run_quantity_at(jsonb, text, date) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.detect_plan_variance(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, simulation, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_now timestamptz := clock_timestamp(); v_today date := clock_timestamp()::date; c record; b record; pol executive.attention_policies%ROWTYPE;
        v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid; v_var uuid; v_variance numeric; v_adverse boolean; v_title text;
        v_raised jsonb := '[]'::jsonb; v_opened jsonb := '[]'::jsonb; v_resolved jsonb := '[]'::jsonb; v_id uuid; v_causes jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';

  -- ── VARIANCES: a milestone's measure vs its target, from the latest observation (once the milestone is due) or from each attached run ──
  FOR c IN
    SELECT 'observation'::text AS basis_kind, o.observation_id AS basis_id, NULL::text AS basis_digest, o.observed_at::date AS basis_date, o.value AS observed,
           m.milestone_id, m.initiative_id, m.plan_id, m.measure_id, m.target_value, m.name, m.due_date, g.direction, g.unit, i.owner_principal_id AS owner, i.title AS initiative_title
      FROM executive.milestones m
      JOIN executive.initiatives i ON i.initiative_id = m.initiative_id AND i.state NOT IN ('closed', 'paused')
      JOIN executive.plans pl ON pl.plan_id = m.plan_id AND pl.state <> 'closed'
      JOIN graph.measures g ON g.measure_id = m.measure_id
      JOIN LATERAL (SELECT x.observation_id, x.value, x.observed_at FROM graph.measure_observations x WHERE x.measure_id = m.measure_id ORDER BY x.observed_at DESC, x.recorded_at DESC LIMIT 1) o ON true
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state IN ('planned', 'at_risk') AND m.due_date <= v_today
    UNION ALL
    SELECT 'run', r.run_id, r.outputs_digest, (qq.q ->> 'date')::date, (qq.q ->> 'value')::numeric,
           m.milestone_id, m.initiative_id, m.plan_id, m.measure_id, m.target_value, m.name, m.due_date, g.direction, g.unit, i.owner_principal_id, i.title
      FROM executive.milestones m
      JOIN executive.initiatives i ON i.initiative_id = m.initiative_id AND i.state NOT IN ('closed', 'paused')
      JOIN executive.plans pl ON pl.plan_id = m.plan_id AND pl.state <> 'closed'
      JOIN graph.measures g ON g.measure_id = m.measure_id
      JOIN executive.plan_measures pm ON pm.plan_id = m.plan_id AND pm.measure_id = m.measure_id AND pm.quantity_key IS NOT NULL
      JOIN executive.plan_runs pr ON pr.plan_id = m.plan_id
      JOIN simulation.runs_current r ON r.run_id = pr.run_id AND r.state = 'completed' AND r.outputs IS NOT NULL
      JOIN LATERAL (SELECT executive.run_quantity_at(r.outputs, pm.quantity_key, m.due_date) AS q) qq ON qq.q IS NOT NULL
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state IN ('planned', 'at_risk')
  LOOP
    IF EXISTS (SELECT 1 FROM executive.plan_variances v WHERE v.milestone_id = c.milestone_id AND v.basis_kind = c.basis_kind AND v.basis_id = c.basis_id) THEN CONTINUE; END IF;
    v_variance := CASE WHEN c.direction = 'higher_better' THEN c.observed - c.target_value ELSE c.target_value - c.observed END;
    v_adverse := v_variance < 0;
    IF NOT v_adverse THEN
      -- a met milestone from an observation on or after its due date is recorded as met; a favourable run reading raises nothing
      IF c.basis_kind = 'observation' THEN
        UPDATE executive.milestones SET state = 'met', updated_at = v_now WHERE milestone_id = c.milestone_id AND state IN ('planned', 'at_risk');
        PERFORM executive._plan_event(c.plan_id, p_tenant, p_domain, 'milestone', c.milestone_id, 'milestone.state_changed', p_actor, jsonb_build_object('state', 'met', 'basis', 'observation', 'observation_id', c.basis_id, 'value', c.observed), p_correlation);
      END IF;
      CONTINUE;
    END IF;
    v_var := gen_random_uuid(); v_item := gen_random_uuid();
    v_title := left(format('plan variance: %s — %s %s vs target %s %s (%s)', c.name, c.observed::text, c.unit, c.target_value::text, c.unit, CASE c.basis_kind WHEN 'run' THEN 'scenario run' ELSE 'observed' END), 512);
    -- THE ROUTING (the queue's rule, 0083 §5 / 0094 §S7's idiom): the initiative's owner when an active human, else the class's roles under the active policy
    v_owner := CASE WHEN c.owner IS NOT NULL AND decision.is_active_human(c.owner, p_tenant) THEN c.owner END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'plan.variance',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', CASE WHEN c.due_date >= v_today THEN (c.due_date - v_today) * 24 ELSE 0 END)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'plan.variance', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'plan.variance', 'plan', c.plan_id, v_var, 'PlanVarianceRaised', v_title, v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('variance_id', v_var, 'plan_id', c.plan_id, 'initiative_id', c.initiative_id, 'initiative_title', c.initiative_title, 'milestone_id', c.milestone_id, 'milestone', c.name, 'due_date', c.due_date,
                               'measure_id', c.measure_id, 'basis_kind', c.basis_kind, 'basis_id', c.basis_id, 'basis_digest', c.basis_digest, 'basis_date', c.basis_date,
                               'observed_value', c.observed, 'target_value', c.target_value, 'direction', c.direction, 'variance', v_variance, 'unit', c.unit, 'raised_at', v_now, 'by', 'the attention tick step plan-variance'),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_var, 'cause_event_type', 'PlanVarianceRaised', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    INSERT INTO executive.plan_variances (variance_id, scope, tenant_id, domain_id, plan_id, initiative_id, milestone_id, measure_id, basis_kind, basis_id, basis_digest, basis_date, observed_value, target_value, direction,
                                          variance, adverse, owner_principal_id, routed_item_id, routing, raised_at, raised_by, correlation_id)
    VALUES (v_var, 'DOMAIN', p_tenant, p_domain, c.plan_id, c.initiative_id, c.milestone_id, c.measure_id, c.basis_kind, c.basis_id, c.basis_digest, c.basis_date, c.observed, c.target_value, c.direction,
            v_variance, true, v_owner, v_item, jsonb_build_object('state', v_state, 'outcome', v_eval ->> 'outcome', 'route_roles', v_route -> 'route_roles', 'policy_version', pol.version, 'due_at', v_route -> 'due_at'), v_now, p_actor, p_correlation);
    UPDATE executive.milestones SET state = CASE WHEN c.basis_kind = 'observation' THEN 'missed' ELSE 'at_risk' END, updated_at = v_now WHERE milestone_id = c.milestone_id AND state IN ('planned', 'at_risk');
    PERFORM executive._plan_event(c.plan_id, p_tenant, p_domain, 'variance', v_var, 'variance.raised', p_actor,
                                  jsonb_build_object('milestone_id', c.milestone_id, 'initiative_id', c.initiative_id, 'basis_kind', c.basis_kind, 'basis_id', c.basis_id, 'variance', v_variance, 'item_id', v_item, 'owner', v_owner, 'state', v_state), p_correlation);
    v_raised := v_raised || jsonb_build_object('variance_id', v_var, 'milestone_id', c.milestone_id, 'initiative_id', c.initiative_id, 'basis_kind', c.basis_kind, 'basis_id', c.basis_id, 'variance', v_variance, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;

  -- ── BREACHES: each kind once per cause while it holds; resolved when it no longer holds ──
  SELECT coalesce(jsonb_agg(to_jsonb(cz)), '[]'::jsonb) INTO v_causes FROM (
    -- LOST LINKAGE: an initiative (not closed) whose objective is no longer active in the Strategy Graph
    SELECT i.plan_id, i.initiative_id, 'lost_linkage', io.objective_id::text,
           format('initiative "%s" is linked to objective "%s", which is %s in the Strategy Graph', i.title, s.title, s.status),
           jsonb_build_object('objective_id', io.objective_id, 'objective_status', s.status, 'initiative_id', i.initiative_id, 'initiative_state', i.state, 'funded_amount', i.funded_amount,
                              'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object('milestone_id', m.milestone_id, 'name', m.name, 'due_date', m.due_date)), '[]'::jsonb) FROM executive.milestones m WHERE m.initiative_id = i.initiative_id AND m.state IN ('planned', 'at_risk')))
      FROM executive.initiatives i JOIN executive.plans pl ON pl.plan_id = i.plan_id AND pl.state <> 'closed'
      JOIN executive.initiative_objectives io ON io.initiative_id = i.initiative_id
      JOIN graph.strategy_current s ON s.strategy_object_id = io.objective_id
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state <> 'closed' AND s.status <> 'active'
    UNION ALL
    -- INFEASIBLE: a finish_to_start dependency whose predecessor's last milestone is due after the successor's first
    SELECT d.plan_id, d.to_initiative_id, 'infeasible', d.dependency_id::text,
           format('"%s" must finish before "%s" starts, but its last milestone is due %s and the successor''s first %s', a.title, b.title, ma.last_due, mb.first_due),
           jsonb_build_object('dependency_id', d.dependency_id, 'from', d.from_initiative_id, 'to', d.to_initiative_id, 'predecessor_last_due', ma.last_due, 'successor_first_due', mb.first_due, 'slip_days', (ma.last_due - mb.first_due))
      FROM executive.initiative_dependencies d
      JOIN executive.initiatives a ON a.initiative_id = d.from_initiative_id AND a.state <> 'closed'
      JOIN executive.initiatives b ON b.initiative_id = d.to_initiative_id AND b.state <> 'closed'
      JOIN executive.plans pl ON pl.plan_id = d.plan_id AND pl.state <> 'closed'
      JOIN LATERAL (SELECT max(m.due_date) AS last_due FROM executive.milestones m WHERE m.initiative_id = d.from_initiative_id AND m.state <> 'cancelled') ma ON ma.last_due IS NOT NULL
      JOIN LATERAL (SELECT min(m.due_date) AS first_due FROM executive.milestones m WHERE m.initiative_id = d.to_initiative_id AND m.state <> 'cancelled') mb ON mb.first_due IS NOT NULL
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.kind = 'finish_to_start' AND d.state = 'active' AND ma.last_due > mb.first_due
    UNION ALL
    -- BUDGET OVER AUTHORITY: the funded sum above the ceiling (the continuity rule's standing check)
    SELECT pl.plan_id, NULL::uuid, 'budget_over_authority', format('funded %s > authority %s', f.funded::text, pl.budget_authority::text),
           format('the funded shares of plan "%s" sum to %s %s, above the authority ceiling of %s %s', pl.title, f.funded::text, pl.budget_currency, pl.budget_authority::text, pl.budget_currency),
           jsonb_build_object('funded', f.funded, 'authority', pl.budget_authority, 'over_by', f.funded - pl.budget_authority, 'currency', pl.budget_currency,
                              'initiatives', (SELECT coalesce(jsonb_agg(jsonb_build_object('initiative_id', i.initiative_id, 'title', i.title, 'funded_amount', i.funded_amount, 'state', i.state) ORDER BY i.priority NULLS LAST), '[]'::jsonb) FROM executive.initiatives i WHERE i.plan_id = pl.plan_id AND i.state IN ('funded', 'approved')))
      FROM executive.plans pl JOIN LATERAL (SELECT executive._funded_sum(pl.plan_id) AS funded) f ON true
     WHERE pl.tenant_id = p_tenant AND pl.domain_id = p_domain AND pl.state <> 'closed' AND f.funded > pl.budget_authority
    UNION ALL
    -- CONFLICTING DEPENDENCIES: two live initiatives of the plan declared in conflict in the Strategy Graph (an active conflicts_with alignment)
    SELECT a.plan_id, a.initiative_id, 'conflicting_dependencies', al.alignment_id::text,
           format('initiatives "%s" and "%s" of the plan are in conflict (alignment %s: %s)', a.title, b.title, al.alignment_id, al.rationale),
           jsonb_build_object('alignment_id', al.alignment_id, 'initiatives', jsonb_build_array(a.initiative_id, b.initiative_id), 'funded', coalesce(a.funded_amount, 0) + coalesce(b.funded_amount, 0))
      FROM graph.alignments al
      JOIN executive.initiatives a ON a.initiative_id = al.from_id AND a.state <> 'closed'
      JOIN executive.initiatives b ON b.initiative_id = al.to_id AND b.state <> 'closed' AND b.plan_id = a.plan_id
      JOIN executive.plans pl ON pl.plan_id = a.plan_id AND pl.state <> 'closed'
     WHERE al.tenant_id = p_tenant AND al.domain_id = p_domain AND al.kind = 'conflicts_with' AND al.state = 'active'
    UNION ALL
    -- DRIFT WITHOUT REVIEW: a baselined plan with no review inside its cadence window
    SELECT pl.plan_id, NULL::uuid, 'drift_without_review', format('since %s', coalesce(pl.last_reviewed_at, pl.updated_at)::text),
           format('plan "%s" was last reviewed %s; its review cadence is %s day(s)', pl.title, coalesce(pl.last_reviewed_at, pl.updated_at), pl.review_cadence_days),
           jsonb_build_object('last_reviewed_at', pl.last_reviewed_at, 'review_cadence_days', pl.review_cadence_days, 'overdue_days', extract(epoch FROM (v_now - coalesce(pl.last_reviewed_at, pl.updated_at))) / 86400 - pl.review_cadence_days)
      FROM executive.plans pl
     WHERE pl.tenant_id = p_tenant AND pl.domain_id = p_domain AND pl.state = 'baselined' AND coalesce(pl.last_reviewed_at, pl.updated_at) < v_now - make_interval(days => pl.review_cadence_days)
  ) cz (plan_id, initiative_id, kind, cause_key, detail, impact);
  -- resolve what no longer holds
  FOR b IN SELECT x.breach_id, x.plan_id, x.kind, x.cause_key FROM executive.plan_breaches x
            WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state <> 'resolved'
              AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_causes) c2 WHERE (c2 ->> 'plan_id')::uuid = x.plan_id AND c2 ->> 'kind' = x.kind AND c2 ->> 'cause_key' = x.cause_key) LOOP
    UPDATE executive.plan_breaches SET state = 'resolved', resolved_at = v_now, resolved_by = p_actor, resolution = format('the condition no longer held at %s (the attention tick step plan-variance)', v_now) WHERE breach_id = b.breach_id;
    PERFORM executive._plan_event(b.plan_id, p_tenant, p_domain, 'breach', b.breach_id, 'breach.resolved', p_actor, jsonb_build_object('kind', b.kind, 'cause_key', b.cause_key), p_correlation);
    v_resolved := v_resolved || jsonb_build_object('breach_id', b.breach_id, 'kind', b.kind, 'plan_id', b.plan_id);
  END LOOP;
  -- open what holds and is not yet open
  FOR b IN SELECT * FROM jsonb_to_recordset(v_causes) AS z (plan_id uuid, initiative_id uuid, kind text, cause_key text, detail text, impact jsonb) LOOP
    IF EXISTS (SELECT 1 FROM executive.plan_breaches x WHERE x.plan_id = b.plan_id AND x.kind = b.kind AND x.cause_key = b.cause_key AND x.state <> 'resolved') THEN CONTINUE; END IF;
    v_id := executive._open_breach(b.plan_id, p_tenant, p_domain, b.initiative_id, b.kind, b.cause_key, b.detail, b.impact, p_actor, p_correlation);
    v_opened := v_opened || jsonb_build_object('breach_id', v_id, 'kind', b.kind, 'plan_id', b.plan_id, 'initiative_id', b.initiative_id, 'cause_key', b.cause_key);
  END LOOP;
  RETURN jsonb_build_object('raised_at', v_now, 'variances', v_raised, 'variance_count', jsonb_array_length(v_raised), 'breaches_opened', v_opened, 'breaches_resolved', v_resolved, 'policy_version', pol.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.detect_plan_variance(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.detect_plan_variance(uuid, uuid, uuid, uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P8 THE READS (invokers, under the caller's RLS): the workspace, the REPLAY, the SCENARIO SENSITIVITY
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.plan_view(p_plan uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, graph, simulation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN pl.plan_id IS NULL THEN NULL ELSE
    (to_jsonb(pl) - 'scope') || jsonb_build_object(
      'at', clock_timestamp(),
      'funded', executive._funded_sum(pl.plan_id),
      'objectives', (SELECT coalesce(jsonb_agg(jsonb_build_object('objective_id', s.strategy_object_id, 'title', s.title, 'status', s.status, 'owner', s.owner_principal_id) ORDER BY s.title), '[]'::jsonb)
                       FROM graph.strategy_current s WHERE s.strategy_object_id = ANY (pl.objective_ids)),
      'initiatives', (SELECT coalesce(jsonb_agg((to_jsonb(i) - 'scope') || jsonb_build_object(
                          'graph_status', s.status, 'graph_version', s.object_version,
                          'objectives', (SELECT coalesce(jsonb_agg(jsonb_build_object('objective_id', io.objective_id, 'title', so.title, 'status', so.status) ORDER BY so.title), '[]'::jsonb)
                                           FROM executive.initiative_objectives io JOIN graph.strategy_current so ON so.strategy_object_id = io.objective_id WHERE io.initiative_id = i.initiative_id),
                          'transitions', (SELECT coalesce(jsonb_agg(jsonb_build_object('transition', t.transition, 'from', t.from_state, 'to', t.to_state, 'actor', t.actor_principal_id, 'actor_kind', t.actor_kind, 'reason', t.reason, 'at', t.occurred_at, 'details', t.details) ORDER BY t.occurred_at), '[]'::jsonb)
                                            FROM executive.initiative_transitions t WHERE t.initiative_id = i.initiative_id),
                          'milestones', (SELECT coalesce(jsonb_agg((to_jsonb(m) - 'scope') || jsonb_build_object('measure_title', sm.title, 'unit', g.unit, 'direction', g.direction) ORDER BY m.due_date, m.name), '[]'::jsonb)
                                           FROM executive.milestones m JOIN graph.measures g ON g.measure_id = m.measure_id JOIN graph.strategy_current sm ON sm.strategy_object_id = m.measure_id WHERE m.initiative_id = i.initiative_id))
                        ORDER BY i.priority NULLS LAST, i.proposed_at), '[]'::jsonb)
                        FROM executive.initiatives i JOIN graph.strategy_current s ON s.strategy_object_id = i.initiative_id WHERE i.plan_id = pl.plan_id),
      'dependencies', (SELECT coalesce(jsonb_agg((to_jsonb(d) - 'scope') || jsonb_build_object('from_title', a.title, 'to_title', b.title) ORDER BY d.declared_at), '[]'::jsonb)
                         FROM executive.initiative_dependencies d JOIN executive.initiatives a ON a.initiative_id = d.from_initiative_id JOIN executive.initiatives b ON b.initiative_id = d.to_initiative_id WHERE d.plan_id = pl.plan_id AND d.state = 'active'),
      'measures', (SELECT coalesce(jsonb_agg(jsonb_build_object('measure_id', pm.measure_id, 'quantity_key', pm.quantity_key, 'title', sm.title, 'objective_id', g.objective_id, 'unit', g.unit, 'direction', g.direction,
                                                                'target_value', g.target_value, 'target_date', g.target_date, 'definition_version', g.definition_version, 'approval_state', g.approval_state,
                                                                'last_value', lo.value, 'last_observed_at', lo.observed_at, 'bound_at', pm.bound_at) ORDER BY sm.title), '[]'::jsonb)
                     FROM executive.plan_measures pm JOIN graph.measures g ON g.measure_id = pm.measure_id JOIN graph.strategy_current sm ON sm.strategy_object_id = pm.measure_id
                     LEFT JOIN LATERAL (SELECT o.value, o.observed_at FROM graph.measure_observations o WHERE o.measure_id = pm.measure_id ORDER BY o.observed_at DESC, o.recorded_at DESC LIMIT 1) lo ON true
                    WHERE pm.plan_id = pl.plan_id),
      'runs', (SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', pr.run_id, 'model_ref', r.model_ref, 'outputs_digest', r.outputs_digest, 'scenario_id', r.scenario_id, 'component', r.component, 'completed_at', r.completed_at, 'attached_at', pr.attached_at) ORDER BY pr.attached_at DESC), '[]'::jsonb)
                 FROM executive.plan_runs pr JOIN simulation.runs_current r ON r.run_id = pr.run_id WHERE pr.plan_id = pl.plan_id),
      'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('version_id', v.version_id, 'version', v.version, 'digest', v.digest, 'note', v.note, 'baselined_by', v.baselined_by, 'baselined_at', v.baselined_at,
                                                                'signatures', executive.signature_of('plan_baseline', v.plan_id, v.version)) ORDER BY v.version), '[]'::jsonb)
                     FROM executive.plan_versions v WHERE v.plan_id = pl.plan_id),
      'variances', (SELECT coalesce(jsonb_agg((to_jsonb(v) - 'scope') || jsonb_build_object('milestone', m.name, 'initiative_title', i.title) ORDER BY v.raised_at DESC), '[]'::jsonb)
                      FROM executive.plan_variances v JOIN executive.milestones m ON m.milestone_id = v.milestone_id JOIN executive.initiatives i ON i.initiative_id = v.initiative_id WHERE v.plan_id = pl.plan_id),
      'breaches', (SELECT coalesce(jsonb_agg((to_jsonb(b) - 'scope') ORDER BY (b.state = 'resolved'), b.opened_at DESC), '[]'::jsonb) FROM executive.plan_breaches b WHERE b.plan_id = pl.plan_id),
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'subject_kind', e.subject_kind, 'subject_id', e.subject_id, 'actor', e.actor_principal_id, 'at', e.occurred_at, 'details', e.details) ORDER BY e.occurred_at DESC), '[]'::jsonb)
                   FROM (SELECT * FROM executive.plan_events x WHERE x.plan_id = pl.plan_id ORDER BY x.occurred_at DESC LIMIT 200) e))
  END
  FROM (SELECT p_plan AS id) k LEFT JOIN executive.plans pl ON pl.plan_id = k.id
$$;
GRANT EXECUTE ON FUNCTION executive.plan_view(uuid) TO eye_app, eye_commit;

/* THE REPLAY: the plan as it stood at an instant — the versions baselined by then, each initiative's state from its transitions by then,
   the milestones, measures, dependencies, variances and breaches recorded by then. A plan declared after the instant answers `exists false`. */
CREATE OR REPLACE FUNCTION executive.plan_as_of(p_plan uuid, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN pl.plan_id IS NULL THEN NULL WHEN pl.declared_at > p_at THEN jsonb_build_object('plan_id', p_plan, 'as_of', p_at, 'exists', false, 'declared_at', pl.declared_at) ELSE
    jsonb_build_object(
      'plan_id', pl.plan_id, 'as_of', p_at, 'exists', true, 'title', pl.title, 'horizon', pl.horizon, 'objectives', to_jsonb(pl.objective_ids), 'currency', pl.budget_currency, 'budget_total', pl.budget_total,
      'budget_authority', coalesce((SELECT (e.details ->> 'to')::numeric FROM executive.plan_events e WHERE e.plan_id = pl.plan_id AND e.event = 'plan.authority_set' AND e.occurred_at <= p_at ORDER BY e.occurred_at DESC LIMIT 1),
                                   (SELECT (e.details ->> 'budget_authority')::numeric FROM executive.plan_events e WHERE e.plan_id = pl.plan_id AND e.event = 'plan.declared' LIMIT 1), pl.budget_authority),
      'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('version_id', v.version_id, 'version', v.version, 'digest', v.digest, 'baselined_by', v.baselined_by, 'baselined_at', v.baselined_at, 'snapshot', v.snapshot,
                                                                'signatures', executive.signature_of('plan_baseline', v.plan_id, v.version)) ORDER BY v.version), '[]'::jsonb)
                     FROM executive.plan_versions v WHERE v.plan_id = pl.plan_id AND v.baselined_at <= p_at),
      'current_version', coalesce((SELECT max(v.version) FROM executive.plan_versions v WHERE v.plan_id = pl.plan_id AND v.baselined_at <= p_at), 0),
      'state', CASE WHEN EXISTS (SELECT 1 FROM executive.plan_versions v WHERE v.plan_id = pl.plan_id AND v.baselined_at <= p_at) THEN 'baselined' ELSE 'open' END,
      'initiatives', (SELECT coalesce(jsonb_agg(jsonb_build_object('initiative_id', i.initiative_id, 'title', i.title, 'objective_id', i.objective_id, 'sponsor', i.sponsor_principal_id, 'owner', i.owner_principal_id,
                                                                   'state', t.to_state, 'as_of_transition', t.transition, 'transition_at', t.occurred_at, 'actor', t.actor_principal_id, 'actor_kind', t.actor_kind,
                                                                   'funded_amount', (SELECT (x.details ->> 'funded_amount')::numeric FROM executive.initiative_transitions x WHERE x.initiative_id = i.initiative_id AND x.transition = 'fund' AND x.occurred_at <= p_at ORDER BY x.occurred_at DESC LIMIT 1),
                                                                   'priority', (SELECT (x.details ->> 'priority')::int FROM executive.initiative_transitions x WHERE x.initiative_id = i.initiative_id AND x.transition = 'prioritise' AND x.occurred_at <= p_at ORDER BY x.occurred_at DESC LIMIT 1),
                                                                   'transitions', (SELECT coalesce(jsonb_agg(jsonb_build_object('transition', x.transition, 'from', x.from_state, 'to', x.to_state, 'actor', x.actor_principal_id, 'actor_kind', x.actor_kind, 'reason', x.reason, 'at', x.occurred_at) ORDER BY x.occurred_at), '[]'::jsonb)
                                                                                     FROM executive.initiative_transitions x WHERE x.initiative_id = i.initiative_id AND x.occurred_at <= p_at))
                                                ORDER BY i.proposed_at), '[]'::jsonb)
                        FROM executive.initiatives i
                        JOIN LATERAL (SELECT x.to_state, x.transition, x.occurred_at, x.actor_principal_id, x.actor_kind FROM executive.initiative_transitions x WHERE x.initiative_id = i.initiative_id AND x.occurred_at <= p_at ORDER BY x.occurred_at DESC LIMIT 1) t ON true
                       WHERE i.plan_id = pl.plan_id AND i.proposed_at <= p_at),
      'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object('milestone_id', m.milestone_id, 'initiative_id', m.initiative_id, 'name', m.name, 'due_date', m.due_date, 'measure_id', m.measure_id, 'target_value', m.target_value,
                                                                  'state', coalesce((SELECT e.details ->> 'state' FROM executive.plan_events e WHERE e.subject_kind = 'milestone' AND e.subject_id = m.milestone_id AND e.event = 'milestone.state_changed' AND e.occurred_at <= p_at ORDER BY e.occurred_at DESC LIMIT 1),
                                                                                    CASE WHEN EXISTS (SELECT 1 FROM executive.plan_variances v WHERE v.milestone_id = m.milestone_id AND v.raised_at <= p_at AND v.basis_kind = 'observation') THEN 'missed'
                                                                                         WHEN EXISTS (SELECT 1 FROM executive.plan_variances v WHERE v.milestone_id = m.milestone_id AND v.raised_at <= p_at) THEN 'at_risk' ELSE 'planned' END)) ORDER BY m.due_date), '[]'::jsonb)
                       FROM executive.milestones m WHERE m.plan_id = pl.plan_id AND m.declared_at <= p_at),
      'measures', (SELECT coalesce(jsonb_agg(jsonb_build_object('measure_id', pm.measure_id, 'quantity_key', pm.quantity_key, 'bound_at', pm.bound_at) ORDER BY pm.bound_at), '[]'::jsonb) FROM executive.plan_measures pm WHERE pm.plan_id = pl.plan_id AND pm.bound_at <= p_at),
      'dependencies', (SELECT coalesce(jsonb_agg(jsonb_build_object('dependency_id', d.dependency_id, 'from', d.from_initiative_id, 'to', d.to_initiative_id, 'kind', d.kind, 'state', CASE WHEN d.retired_at IS NOT NULL AND d.retired_at <= p_at THEN 'retired' ELSE 'active' END) ORDER BY d.declared_at), '[]'::jsonb)
                         FROM executive.initiative_dependencies d WHERE d.plan_id = pl.plan_id AND d.declared_at <= p_at),
      'variances', (SELECT coalesce(jsonb_agg((to_jsonb(v) - 'scope') ORDER BY v.raised_at), '[]'::jsonb) FROM executive.plan_variances v WHERE v.plan_id = pl.plan_id AND v.raised_at <= p_at),
      'breaches', (SELECT coalesce(jsonb_agg(jsonb_build_object('breach_id', b.breach_id, 'kind', b.kind, 'cause_key', b.cause_key, 'detail', b.detail, 'opened_at', b.opened_at,
                                                                'state', CASE WHEN b.resolved_at IS NOT NULL AND b.resolved_at <= p_at THEN 'resolved' WHEN b.acknowledged_at IS NOT NULL AND b.acknowledged_at <= p_at THEN 'acknowledged' ELSE 'open' END) ORDER BY b.opened_at), '[]'::jsonb)
                     FROM executive.plan_breaches b WHERE b.plan_id = pl.plan_id AND b.opened_at <= p_at),
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'subject_kind', e.subject_kind, 'subject_id', e.subject_id, 'actor', e.actor_principal_id, 'at', e.occurred_at) ORDER BY e.occurred_at), '[]'::jsonb)
                   FROM executive.plan_events e WHERE e.plan_id = pl.plan_id AND e.occurred_at <= p_at))
  END
  FROM (SELECT p_plan AS id) k LEFT JOIN executive.plans pl ON pl.plan_id = k.id
$$;
GRANT EXECUTE ON FUNCTION executive.plan_as_of(uuid, timestamptz) TO eye_app, eye_commit;

/* THE SCENARIO SENSITIVITY: a run's output quantities (its series by the plan measures' keys) applied to the plan's milestones — each at
   risk or on track under that scenario at its due date, the run's outputs digest named. A read; nothing is recorded. */
CREATE OR REPLACE FUNCTION executive.plan_sensitivity(p_plan uuid, p_run uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, graph, simulation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN pl.plan_id IS NULL THEN jsonb_build_object('available', false, 'reason', 'no such plan in this domain')
              WHEN r.run_id IS NULL THEN jsonb_build_object('available', false, 'reason', 'no such completed run in this domain', 'plan_id', p_plan)
         ELSE jsonb_build_object(
    'available', true, 'plan_id', pl.plan_id, 'plan_title', pl.title, 'run_id', r.run_id, 'model_ref', r.model_ref, 'outputs_digest', r.outputs_digest, 'scenario_id', r.scenario_id, 'component', r.component,
    'run_completed_at', r.completed_at, 'at', clock_timestamp(),
    'attached', EXISTS (SELECT 1 FROM executive.plan_runs pr WHERE pr.plan_id = pl.plan_id AND pr.run_id = r.run_id),
    'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'milestone_id', m.milestone_id, 'name', m.name, 'initiative_id', m.initiative_id, 'initiative_title', i.title, 'due_date', m.due_date, 'measure_id', m.measure_id, 'measure_title', sm.title,
        'target_value', m.target_value, 'unit', g.unit, 'direction', g.direction, 'quantity_key', pm.quantity_key,
        'value', q.q ->> 'value', 'value_date', q.q ->> 'date',
        'status', CASE WHEN pm.quantity_key IS NULL THEN 'unmapped' WHEN q.q IS NULL THEN 'no_value'
                       WHEN (g.direction = 'higher_better' AND (q.q ->> 'value')::numeric < m.target_value) OR (g.direction = 'lower_better' AND (q.q ->> 'value')::numeric > m.target_value) THEN 'at_risk' ELSE 'on_track' END,
        'variance', CASE WHEN q.q IS NULL THEN NULL WHEN g.direction = 'higher_better' THEN (q.q ->> 'value')::numeric - m.target_value ELSE m.target_value - (q.q ->> 'value')::numeric END)
      ORDER BY m.due_date, m.name), '[]'::jsonb)
      FROM executive.milestones m
      JOIN executive.initiatives i ON i.initiative_id = m.initiative_id
      JOIN graph.measures g ON g.measure_id = m.measure_id
      JOIN graph.strategy_current sm ON sm.strategy_object_id = m.measure_id
      LEFT JOIN executive.plan_measures pm ON pm.plan_id = m.plan_id AND pm.measure_id = m.measure_id
      LEFT JOIN LATERAL (SELECT CASE WHEN pm.quantity_key IS NULL THEN NULL ELSE executive.run_quantity_at(r.outputs, pm.quantity_key, m.due_date) END AS q) q ON true
     WHERE m.plan_id = pl.plan_id AND m.state <> 'cancelled' AND i.state <> 'closed'))
  END
  FROM (SELECT p_plan AS id) k LEFT JOIN executive.plans pl ON pl.plan_id = k.id
  LEFT JOIN simulation.runs_current r ON r.run_id = p_run AND r.tenant_id = pl.tenant_id AND r.domain_id = pl.domain_id AND r.state = 'completed' AND r.outputs IS NOT NULL
$$;
GRANT EXECUTE ON FUNCTION executive.plan_sensitivity(uuid, uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P9 RLS (the 0081 loop idiom) AND GRANTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plans', 'plan_versions', 'initiatives', 'initiative_transitions', 'milestones', 'initiative_dependencies', 'plan_variances', 'plan_breaches', 'plan_events'] LOOP
    EXECUTE format('REVOKE ALL ON executive.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE executive.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE executive.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY executive_isolation ON executive.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON executive.%I TO eye_app, eye_commit', t);
  END LOOP;
  -- the link tables carry no tenant column: they are reached through their parents' rows (RLS on the parent; the ports write them)
  FOREACH t IN ARRAY ARRAY['initiative_objectives', 'plan_measures', 'plan_runs'] LOOP
    EXECUTE format('REVOKE ALL ON executive.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE executive.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE executive.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
  CREATE POLICY executive_isolation ON executive.initiative_objectives USING (EXISTS (SELECT 1 FROM executive.initiatives i WHERE i.initiative_id = initiative_objectives.initiative_id));
  CREATE POLICY executive_isolation ON executive.plan_measures USING (EXISTS (SELECT 1 FROM executive.plans p WHERE p.plan_id = plan_measures.plan_id));
  CREATE POLICY executive_isolation ON executive.plan_runs USING (EXISTS (SELECT 1 FROM executive.plans p WHERE p.plan_id = plan_runs.plan_id));
  GRANT SELECT ON executive.initiative_objectives, executive.plan_measures, executive.plan_runs TO eye_app, eye_commit;
END $$;
