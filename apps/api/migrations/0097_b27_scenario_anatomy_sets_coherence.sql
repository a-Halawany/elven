-- 0097 — CP-6 B27 (2026-09-30): SCENARIO ANATOMY, SETS AND COHERENCE — F-P4-07 (drivers, actors, mechanisms, the assumption register,
-- suspension), F-P4-08 (scenario sets, comparison, the portfolio review, living scenarios), F-P4-09 (semantic coherence, quality measures,
-- degraded behaviours, governed branch probabilities).
--
-- One migration in four sections, the prelude written first by the integrator, the three parts built and proven on their own in parallel
-- worktrees (their harnesses phase6-{anatomy,sets,quality}-b27), then combined here in the apply order every fresh-database run used
-- (§0, then the part files alphabetically: §A anatomy, §Q quality, §S sets):
--   §0  the prelude: the SUSPENDED branch state (with who, when, why and the cause) and its reinstatement columns; the widened scenario event
--       vocabulary (every part's names); the attention classes and subject kinds the parts raise; the helper prediction.branch_live(state)
--   §A  anatomy (F-P4-07)   §Q  quality and coherence v2 (F-P4-09)   §S  sets (F-P4-08)
--   §I  the integrator: §Q's temporal ordering reads §A's timing keys; §S's probability read uses §Q's current view
-- Forward-only; 0029–0096 untouched. The coherence rule v1 (0081) and its findings are NOT changed — §Q's measures are a separate,
-- versioned evaluation. Every figure a harness seeds is SYNTHETIC.

-- ═════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ═════════════════════════════════════════════════════════════════════
-- §0.1 THE SUSPENDED BRANCH (F-P4-07 "suspend a branch — not only flag — when a critical assumption is invalidated")
ALTER TABLE prediction.branches_current DROP CONSTRAINT IF EXISTS branches_current_state_check;
ALTER TABLE prediction.branches_current ADD CONSTRAINT branches_current_state_check CHECK (state IN ('open', 'flipped', 'closed', 'suspended'));
ALTER TABLE prediction.branches_current
  ADD COLUMN suspended_at        timestamptz,
  ADD COLUMN suspended_by        uuid,                      -- the acting principal (a person, or the agent of the consumer that applied the invalidation)
  ADD COLUMN suspension_reason   text,
  ADD COLUMN suspension_cause    jsonb CHECK (suspension_cause IS NULL OR jsonb_typeof(suspension_cause) = 'object'),   -- {kind: 'assumption'|'element'|'operator', id, ...}
  ADD COLUMN suspended_from      text CHECK (suspended_from IS NULL OR suspended_from IN ('open', 'flipped')),          -- the state a reinstatement returns to
  ADD COLUMN reinstated_at       timestamptz,
  ADD COLUMN reinstated_by       uuid,
  ADD COLUMN reinstatement_note  text;
ALTER TABLE prediction.branches_current ADD CONSTRAINT brn_suspended_bound CHECK (
  (state = 'suspended') = (suspended_at IS NOT NULL AND suspended_by IS NOT NULL AND suspension_reason IS NOT NULL AND suspended_from IS NOT NULL)
  OR (state <> 'suspended' AND suspended_at IS NOT NULL AND reinstated_at IS NOT NULL AND reinstated_at >= suspended_at));
COMMENT ON COLUMN prediction.branches_current.suspended_from IS 'B27 (0097 §0): the state the branch held when it was suspended; a reinstatement returns it there (open or flipped). A suspended branch is not live: no flip, no simulation, not decision-active.';

/* Whether a branch state is LIVE (it may flip, be simulated, be cited as decision-active): open or flipped — never suspended or closed. */
CREATE OR REPLACE FUNCTION prediction.branch_live(p_state text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p_state IN ('open', 'flipped') $$;
GRANT EXECUTE ON FUNCTION prediction.branch_live(text) TO eye_app, eye_commit;

-- §0.2 THE SCENARIO EVENT VOCABULARY (0084:2092's list whole, plus B27's names — every part's, declared here once)
ALTER TABLE prediction.scenario_events DROP CONSTRAINT IF EXISTS scenario_events_event_check;
ALTER TABLE prediction.scenario_events ADD CONSTRAINT scenario_events_event_check CHECK (event IN (
  'scenario.declared', 'branch.added', 'branch.flipped', 'branch.closed', 'scenario.closed', 'scenario.attention', 'scenario.reviewed', 'scenario.retired',
  'scenario.coherence_checked', 'scenario.branched', 'scenario.branch_repeated',
  -- B27 (0097) §0 / §A anatomy: the suspension, the elements, the assumption register, the records
  'branch.suspended', 'branch.reinstated', 'scenario.element_declared', 'scenario.element_retired', 'scenario.assumption_linked', 'scenario.assumption_unlinked',
  'scenario.record_added',
  -- §S sets: the set, its members, the plurality check, the portfolio review, relevance, proposals
  'scenario.set_member_added', 'scenario.set_member_removed', 'scenario.relevance_scored', 'scenario.signpost_notified', 'scenario.proposed', 'scenario.proposal_resolved',
  -- §Q quality: the evaluation, the governed probability
  'scenario.quality_evaluated', 'branch.probability_set', 'branch.probability_withdrawn'));

-- §0.3 THE ATTENTION CLASSES AND SUBJECT KINDS (0095 §0.2's lists whole, plus B27's)
CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  -- B34 (0090)
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  -- B36 (0094)
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  -- B90 (0095)
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  -- B27 (0097)
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal'));
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_subject_kind_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (
  'forecast', 'scenario', 'warning', 'source', 'claim', 'package', 'review',
  'exposure', 'health_change', 'commitment_item',
  'plan', 'publication', 'strategy_object', 'queue',
  'product', 'subscription', 'metric', 'asset',
  -- B27 (0097)
  'branch', 'scenario_set'));

-- ═════════════════════════════════════════════════════════════════════
-- section `anatomy` (§A) — the part-local file 0097_b27_x_anatomy.sql, combined here at integration in the apply order every fresh-database run used (§0, §A, §Q, §S)
-- ═════════════════════════════════════════════════════════════════════
-- 0097 §A — CP-6 B27 part `anatomy` (F-P4-07): the scenario's ANATOMY — drivers, actors, mechanisms, interventions and impacts per
-- scenario and per branch (versioned, retired, never deleted); the versioned ASSUMPTION REGISTER linked to the Knowledge Graph's ASU
-- objects, each link with a CRITICAL flag and an INVALIDATION CONDITION; the SUSPENSION of every live branch whose critical link names an
-- assumption that is invalidated, the branch owner TASKED (attention class scenario.suspension, subject kind branch) and the REINSTATEMENT
-- under the owner's word; NARRATIVE, IMPLICATION and OPTION records per scenario (PR-33-002). Uses §0's objects (the suspended state and
-- its columns, prediction.branch_live, the widened scenario event vocabulary, the attention class and subject kind); declares none of them.
--
--   §A1 the tables: prediction.scenario_elements (current) + prediction.scenario_element_versions (append-only), prediction.scenario_assumptions
--       (current, versioned; its history on the scenario ledger), prediction.scenario_records (append-only; a revision supersedes)
--   §A2 the shared checks (private): the actor, the scenario, the branch, the graph reference, the element dependencies
--   §A3 the element ports: prediction.declare_scenario_element (declare or revise), prediction.retire_scenario_element
--   §A4 the register ports: prediction.link_scenario_assumption (link, revise, relink), prediction.unlink_scenario_assumption
--   §A5 the record port: prediction.add_scenario_record
--   §A6 THE SUSPENSION: the private core (prediction.psa_suspend_branch), the invalidation's application (prediction.psa_apply_invalidation),
--       the ports prediction.suspend_branch (a person, with a reason), prediction.apply_assumption_invalidation (a person re-applies),
--       prediction.reinstate_branch (the branch or scenario owner); THE TRIGGER on graph.strategy_events (assumption.invalidated)
--   §A7 THE RUN'S GATE: a BEFORE INSERT trigger on simulation.runs_current — `run rejected (branch_suspended)` (open_run not re-declared)
--   §A8 the read prediction.scenario_anatomy(scenario_id)
--
-- WHY A TRIGGER, NOT A CONSUMER (the MAP's choice): graph.set_assumption_state (0090:6350, the only writer of assumption.invalidated, under
-- graph.assumption.verify — a person — or graph.impact.propagate / graph.strategy.declare) is NOT re-declared; an AFTER INSERT trigger on
-- graph.strategy_events for `assumption.invalidated` applies the suspension IN THE SAME TRANSACTION as the invalidation — no window in which
-- a branch built on a critical assumption that no longer holds stays live, flips, is simulated or is cited; no new consumer, principal,
-- role, subscription or GraphChanged kind (the consumer registry and the event pins are untouched). It locks only the branch rows it
-- suspends (graph.set_assumption_state locks the strategy row; no path locks a branch and then that row). The trigger touches nothing when
-- no CRITICAL link names the assumption, so every older suite that invalidates an assumption writes exactly what it wrote before.
--
-- Refusal families (observation-errors.ts `/* B27 anatomy */`): `scenario element rejected (<class>)`, `scenario assumption rejected
-- (<class>)`, `scenario record rejected (<class>)`, `branch suspension rejected (<class>)`, and `run rejected (branch_suspended)`.
-- Every figure a harness seeds is SYNTHETIC.

-- ═════════════════════════════════════════════════════════════════════
-- section `anatomy`
-- ═════════════════════════════════════════════════════════════════════

-- §A1 THE TABLES ─────────────────────────────────────────────────────────
CREATE TABLE prediction.scenario_elements (
  element_id          uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  scenario_id         uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  branch_id           uuid REFERENCES prediction.branches_current (branch_id),          -- NULL: the whole scenario
  kind                text NOT NULL CHECK (kind IN ('driver', 'actor', 'mechanism', 'intervention', 'impact')),
  name                text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 128),
  description         text NOT NULL CHECK (length(btrim(description)) BETWEEN 8 AND 4096),
  attributes          jsonb NOT NULL CHECK (jsonb_typeof(attributes) = 'object'),        -- agency / exogenous / cause-effect / targets / on-direction-magnitude-horizon / dependencies / timing
  graph_refs          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(graph_refs) = 'array'),  -- [{kind: entity|strategy, id}]
  version             int NOT NULL CHECK (version >= 1),
  state               text NOT NULL CHECK (state IN ('active', 'retired')),
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by          uuid,
  retired_at          timestamptz,
  retirement_reason   text,
  correlation_id      uuid NOT NULL,
  CONSTRAINT psa_element_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psa_element_retired_bound CHECK ((state = 'retired') = (retired_at IS NOT NULL AND retired_by IS NOT NULL AND retirement_reason IS NOT NULL))
);
CREATE INDEX psa_elements_scenario ON prediction.scenario_elements (scenario_id, branch_id, kind, state);
CREATE UNIQUE INDEX psa_elements_name_once ON prediction.scenario_elements (scenario_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(btrim(name))) WHERE state = 'active';
COMMENT ON TABLE prediction.scenario_elements IS 'B27 (0097 §A; F-P4-07): the scenario''s anatomy — a driver, actor, mechanism, intervention or impact of the whole scenario (branch_id NULL) or of one branch; the current version of each (every version in scenario_element_versions); retired, never deleted.';

CREATE TABLE prediction.scenario_element_versions (
  element_id          uuid NOT NULL REFERENCES prediction.scenario_elements (element_id),
  version             int NOT NULL CHECK (version >= 1),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  scenario_id         uuid NOT NULL,
  branch_id           uuid,
  kind                text NOT NULL,
  name                text NOT NULL,
  description         text NOT NULL,
  attributes          jsonb NOT NULL,
  graph_refs          jsonb NOT NULL,
  state               text NOT NULL CHECK (state IN ('active', 'retired')),
  change              text NOT NULL CHECK (change IN ('declared', 'revised', 'retired')),
  reason              text,
  actor_principal_id  uuid NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (element_id, version),
  CONSTRAINT psa_element_version_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER psa_element_versions_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_element_versions
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_element_versions IS 'B27 (0097 §A): every version of every scenario element (declared, revised, retired) with who and why; append-only.';

CREATE TABLE prediction.scenario_assumptions (
  link_id                uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  scenario_id            uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  branch_id              uuid REFERENCES prediction.branches_current (branch_id),      -- NULL: every branch of the scenario
  assumption_id          uuid NOT NULL,                                                -- graph.strategy_current, object_type ASU
  critical               boolean NOT NULL,
  invalidation_condition jsonb NOT NULL CHECK (jsonb_typeof(invalidation_condition) = 'object' AND invalidation_condition ->> 'kind' IN ('state', 'claim', 'indicator')),
  rationale              text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 2048),
  version                int NOT NULL CHECK (version >= 1),
  state                  text NOT NULL CHECK (state IN ('linked', 'unlinked')),
  linked_by              uuid NOT NULL,
  linked_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  unlinked_by            uuid,
  unlinked_at            timestamptz,
  unlink_reason          text,
  correlation_id         uuid NOT NULL,
  CONSTRAINT psa_link_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psa_link_unlinked_bound CHECK ((state = 'unlinked') = (unlinked_at IS NOT NULL AND unlinked_by IS NOT NULL AND unlink_reason IS NOT NULL))
);
CREATE UNIQUE INDEX psa_links_once ON prediction.scenario_assumptions (scenario_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), assumption_id);
CREATE INDEX psa_links_assumption ON prediction.scenario_assumptions (assumption_id) WHERE state = 'linked';
COMMENT ON TABLE prediction.scenario_assumptions IS 'B27 (0097 §A; F-P4-07): the scenario''s ASSUMPTION REGISTER — a link from the scenario (or one branch) to a live ASU of the Knowledge Graph, CRITICAL or not, with the condition that invalidates it; one row per (scenario, branch, assumption), versioned (link, revise, unlink, relink — each a scenario.assumption_linked / _unlinked event carrying the version); an invalidated critical assumption SUSPENDS the live branches it names.';

CREATE TABLE prediction.scenario_records (
  record_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  scenario_id         uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  branch_id           uuid REFERENCES prediction.branches_current (branch_id),         -- NULL: the whole scenario
  kind                text NOT NULL CHECK (kind IN ('narrative', 'implication', 'option')),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  body                text NOT NULL CHECK (length(btrim(body)) BETWEEN 8 AND 8000),
  cites               jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cites) = 'array'),   -- [{kind: claim|evidence|entity|strategy, id}]
  version             int NOT NULL CHECK (version >= 1),
  supersedes          uuid REFERENCES prediction.scenario_records (record_id),
  author_principal_id uuid NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT psa_record_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psa_record_version_chain CHECK ((supersedes IS NULL) = (version = 1)),
  CONSTRAINT psa_record_superseded_once UNIQUE (supersedes)
);
CREATE INDEX psa_records_scenario ON prediction.scenario_records (scenario_id, recorded_at);
CREATE TRIGGER psa_records_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_records
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_records IS 'B27 (0097 §A; PR-33-002): the NARRATIVE, IMPLICATION and OPTION records of a scenario (or one branch) with their author and validated citations; append-only — a revision is a new record that supersedes the previous one (version + 1).';

-- RLS: the 0081 prediction_isolation idiom (0029:420-425 verbatim)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scenario_elements', 'scenario_element_versions', 'scenario_assumptions', 'scenario_records'] LOOP
    EXECUTE format('REVOKE ALL ON prediction.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE prediction.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE prediction.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY prediction_isolation ON prediction.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON prediction.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §A2 THE SHARED CHECKS (private: no grant) ─────────────────────────────
/* The acting principal: recorded by the one acting, a named active member (an agent drafts nothing here). */
CREATE OR REPLACE FUNCTION prediction.psa_assert_actor(p_family text, p_actor uuid, p_tenant uuid) RETURNS void
SET search_path = prediction, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_family USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION '% rejected (actor): a named, active member records the scenario''s anatomy', p_family USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psa_assert_actor(text, uuid, uuid) FROM PUBLIC;

/* The scenario (locked) and — when named — its branch: absent 404, not active 409, a closed branch 409. */
CREATE OR REPLACE FUNCTION prediction.psa_scenario_branch(p_family text, p_tenant uuid, p_domain uuid, p_scenario uuid, p_branch uuid) RETURNS prediction.scenarios_current
SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; b prediction.branches_current%ROWTYPE;
BEGIN
  SELECT * INTO s FROM prediction.scenarios_current c WHERE c.scenario_id = p_scenario AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_scenario): no scenario % in this domain', p_family, p_scenario USING ERRCODE = '23503'; END IF;
  IF s.state <> 'active' THEN
    RAISE EXCEPTION '% rejected (state): scenario % is %; only an active scenario''s anatomy changes', p_family, p_scenario, s.state USING ERRCODE = '22023';
  END IF;
  IF p_branch IS NOT NULL THEN
    SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch AND x.scenario_id = p_scenario;
    IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_branch): branch % is not a branch of scenario %', p_family, p_branch, p_scenario USING ERRCODE = '23503'; END IF;
    IF b.state = 'closed' THEN RAISE EXCEPTION '% rejected (state): branch "%" is closed', p_family, b.name USING ERRCODE = '22023'; END IF;
  END IF;
  RETURN s;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psa_scenario_branch(text, uuid, uuid, uuid, uuid) FROM PUBLIC;

/* A graph reference {kind: entity|strategy, id}: an entity of the domain that is not retired, or a strategy object of the domain that is active. */
CREATE OR REPLACE FUNCTION prediction.psa_assert_graph_ref(p_family text, p_tenant uuid, p_domain uuid, p_ref jsonb) RETURNS jsonb
SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
DECLARE v_kind text := p_ref ->> 'kind'; v_id uuid; v_label text;
BEGIN
  IF jsonb_typeof(p_ref) IS DISTINCT FROM 'object' OR v_kind IS NULL OR v_kind NOT IN ('entity', 'strategy') OR coalesce(p_ref ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION '% rejected (graph_ref): a graph reference is {kind: entity|strategy, id: <uuid>}', p_family USING ERRCODE = '22023';
  END IF;
  v_id := (p_ref ->> 'id')::uuid;
  IF v_kind = 'entity' THEN
    SELECT e.canonical_name INTO v_label FROM graph.entities_current e WHERE e.entity_id = v_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.lifecycle_state <> 'retired';
  ELSE
    SELECT s.object_type || ' ' || s.title INTO v_label FROM graph.strategy_current s WHERE s.strategy_object_id = v_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.status = 'active';
  END IF;
  IF v_label IS NULL THEN
    RAISE EXCEPTION '% rejected (unknown_ref): % % is not a live % of this domain', p_family, v_kind, v_id, CASE v_kind WHEN 'entity' THEN 'entity' ELSE 'strategy object' END USING ERRCODE = '23503';
  END IF;
  RETURN jsonb_build_object('kind', v_kind, 'id', v_id, 'label', v_label);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psa_assert_graph_ref(text, uuid, uuid, jsonb) FROM PUBLIC;

/* An element's attributes by kind, the dependencies and targets resolved (active elements of the same scenario, visible from the branch:
   scenario-wide or the same branch; never itself), the timing checked. Returns the normalised attributes. */
CREATE OR REPLACE FUNCTION prediction.psa_element_attributes(p_tenant uuid, p_domain uuid, p_scenario uuid, p_branch uuid, p_element uuid, p_kind text, p_attributes jsonb) RETURNS jsonb
SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE a jsonb := coalesce(p_attributes, '{}'::jsonb); v_list text; x jsonb; v_id uuid; e prediction.scenario_elements%ROWTYPE; v_ids jsonb; v_out jsonb := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(a) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'scenario element rejected (attributes): the attributes are an object' USING ERRCODE = '22023'; END IF;
  CASE p_kind
    WHEN 'driver' THEN
      IF jsonb_typeof(a -> 'exogenous') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'scenario element rejected (attributes): a driver says whether it is exogenous (a shock from outside the system) or endogenous (exogenous: true|false)' USING ERRCODE = '22023';
      END IF;
      v_out := jsonb_build_object('exogenous', (a ->> 'exogenous')::boolean);
    WHEN 'actor' THEN
      IF coalesce(a ->> 'agency', '') NOT IN ('high', 'medium', 'low') THEN
        RAISE EXCEPTION 'scenario element rejected (attributes): an actor states its agency — how far it can change the course (agency: high|medium|low)' USING ERRCODE = '22023';
      END IF;
      v_out := jsonb_build_object('agency', a ->> 'agency');
      IF NULLIF(btrim(coalesce(a ->> 'interest', '')), '') IS NOT NULL THEN v_out := v_out || jsonb_build_object('interest', left(btrim(a ->> 'interest'), 512)); END IF;
    WHEN 'mechanism' THEN
      IF length(btrim(coalesce(a ->> 'cause', ''))) < 4 OR length(btrim(coalesce(a ->> 'effect', ''))) < 4 THEN
        RAISE EXCEPTION 'scenario element rejected (attributes): a mechanism states its cause and its effect (cause → effect, 4+ characters each)' USING ERRCODE = '22023';
      END IF;
      v_out := jsonb_build_object('cause', left(btrim(a ->> 'cause'), 512), 'effect', left(btrim(a ->> 'effect'), 512));
    WHEN 'intervention' THEN
      IF length(btrim(coalesce(a ->> 'by', ''))) < 2 OR length(btrim(coalesce(a ->> 'expected_effect', ''))) < 4 THEN
        RAISE EXCEPTION 'scenario element rejected (attributes): an intervention names who acts (by) and its expected effect (expected_effect)' USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(a -> 'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(a -> 'targets') = 0 THEN
        RAISE EXCEPTION 'scenario element rejected (attributes): an intervention acts on at least one driver or mechanism of the scenario (targets: [element ids])' USING ERRCODE = '22023';
      END IF;
      v_out := jsonb_build_object('by', left(btrim(a ->> 'by'), 256), 'expected_effect', left(btrim(a ->> 'expected_effect'), 512));
    WHEN 'impact' THEN
      IF jsonb_typeof(a -> 'on') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'scenario element rejected (attributes): an impact names what it falls on — an entity or an objective of the domain (on: {kind, id})' USING ERRCODE = '22023';
      END IF;
      IF coalesce(a ->> 'direction', '') NOT IN ('adverse', 'favourable', 'mixed') OR coalesce(a ->> 'magnitude', '') NOT IN ('low', 'moderate', 'high', 'severe')
         OR length(btrim(coalesce(a ->> 'horizon', ''))) NOT BETWEEN 1 AND 32 THEN
        RAISE EXCEPTION 'scenario element rejected (attributes): an impact states its direction (adverse|favourable|mixed), its magnitude band (low|moderate|high|severe) and its horizon (e.g. 30d)' USING ERRCODE = '22023';
      END IF;
      v_out := jsonb_build_object('on', prediction.psa_assert_graph_ref('scenario element', p_tenant, p_domain, a -> 'on'), 'direction', a ->> 'direction', 'magnitude', a ->> 'magnitude', 'horizon', btrim(a ->> 'horizon'));
    ELSE
      RAISE EXCEPTION 'scenario element rejected (kind): % is not an element kind (driver, actor, mechanism, intervention, impact)', coalesce(p_kind, '<null>') USING ERRCODE = '22023';
  END CASE;
  -- the element ids it rests on (dependencies, and an intervention's targets): active elements of this scenario visible from its branch
  FOREACH v_list IN ARRAY ARRAY['dependencies', 'targets'] LOOP
    CONTINUE WHEN v_list = 'targets' AND p_kind <> 'intervention';
    v_ids := '[]'::jsonb;
    IF a ? v_list AND jsonb_typeof(a -> v_list) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'scenario element rejected (attributes): % is a list of element ids', v_list USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(coalesce(a -> v_list, '[]'::jsonb)) > 32 THEN RAISE EXCEPTION 'scenario element rejected (attributes): at most 32 %', v_list USING ERRCODE = '22023'; END IF;
    FOR x IN SELECT value FROM jsonb_array_elements(coalesce(a -> v_list, '[]'::jsonb)) LOOP
      IF jsonb_typeof(x) IS DISTINCT FROM 'string' OR (x #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'scenario element rejected (attributes): % holds element ids', v_list USING ERRCODE = '22023';
      END IF;
      v_id := (x #>> '{}')::uuid;
      IF v_id = p_element THEN RAISE EXCEPTION 'scenario element rejected (attributes): an element does not rest on itself' USING ERRCODE = '22023'; END IF;
      SELECT * INTO e FROM prediction.scenario_elements el WHERE el.element_id = v_id AND el.scenario_id = p_scenario AND el.tenant_id = p_tenant AND el.domain_id = p_domain AND el.state = 'active'
        AND (el.branch_id IS NULL OR el.branch_id IS NOT DISTINCT FROM p_branch);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'scenario element rejected (unknown_dependency): % is not an active element of this scenario visible from %', v_id, CASE WHEN p_branch IS NULL THEN 'the whole scenario' ELSE 'this branch' END USING ERRCODE = '23503';
      END IF;
      IF v_list = 'targets' AND e.kind NOT IN ('driver', 'mechanism') THEN
        RAISE EXCEPTION 'scenario element rejected (attributes): an intervention acts on a driver or a mechanism; "%" is a%', e.name, CASE WHEN e.kind IN ('actor', 'intervention', 'impact') THEN 'n ' || e.kind ELSE ' ' || e.kind END USING ERRCODE = '22023';
      END IF;
      IF NOT v_ids @> jsonb_build_array(v_id) THEN v_ids := v_ids || jsonb_build_array(v_id); END IF;
    END LOOP;
    IF v_list = 'targets' OR jsonb_array_length(v_ids) > 0 THEN v_out := v_out || jsonb_build_object(v_list, v_ids); END IF;
  END LOOP;
  -- timing (optional; §Q's temporal ordering reads it): {start?: date, end?: date, lag_days?: int ≥ 0}, start ≤ end
  IF a ? 'timing' THEN
    IF jsonb_typeof(a -> 'timing') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'scenario element rejected (timing): timing is {start?, end?, lag_days?}' USING ERRCODE = '22023'; END IF;
    BEGIN
      IF (a -> 'timing' ->> 'start') IS NOT NULL AND (a -> 'timing' ->> 'end') IS NOT NULL AND (a -> 'timing' ->> 'start')::date > (a -> 'timing' ->> 'end')::date THEN
        RAISE EXCEPTION 'scenario element rejected (timing): the start (%) lies after the end (%)', a -> 'timing' ->> 'start', a -> 'timing' ->> 'end' USING ERRCODE = '22023';
      END IF;
      IF (a -> 'timing' ->> 'lag_days') IS NOT NULL AND (a -> 'timing' ->> 'lag_days')::int < 0 THEN
        RAISE EXCEPTION 'scenario element rejected (timing): lag_days is a whole number of days, 0 or more' USING ERRCODE = '22023';
      END IF;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'scenario element rejected (timing): start and end are dates (YYYY-MM-DD), lag_days a whole number' USING ERRCODE = '22023';
    END;
    v_out := v_out || jsonb_build_object('timing', jsonb_strip_nulls(jsonb_build_object('start', (a -> 'timing' ->> 'start')::date, 'end', (a -> 'timing' ->> 'end')::date, 'lag_days', (a -> 'timing' ->> 'lag_days')::int)));
  END IF;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psa_element_attributes(uuid, uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;

/* The element as the ports and the read return it. */
CREATE OR REPLACE FUNCTION prediction.psa_element_json(e prediction.scenario_elements) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('element_id', e.element_id, 'scenario_id', e.scenario_id, 'branch_id', e.branch_id, 'kind', e.kind, 'name', e.name, 'description', e.description,
    'attributes', e.attributes, 'graph_refs', e.graph_refs, 'version', e.version, 'state', e.state, 'declared_by', e.declared_by, 'declared_at', e.declared_at,
    'updated_by', e.updated_by, 'updated_at', e.updated_at, 'retired_by', e.retired_by, 'retired_at', e.retired_at, 'retirement_reason', e.retirement_reason)
$$;
GRANT EXECUTE ON FUNCTION prediction.psa_element_json(prediction.scenario_elements) TO eye_app, eye_commit;

-- §A3 THE ELEMENT PORTS ──────────────────────────────────────────────────
/* DECLARE (a new element: version 1) or REVISE (an existing one, naming the version it read: version + 1; kind, scenario and branch fixed). */
CREATE OR REPLACE FUNCTION prediction.declare_scenario_element(
  p_element_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_branch_id uuid, p_kind text, p_name text, p_description text,
  p_attributes jsonb, p_graph_refs jsonb, p_expected_version int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; e prediction.scenario_elements%ROWTYPE; v_attr jsonb; v_refs jsonb := '[]'::jsonb; x jsonb; v_version int; v_revise boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.anatomy.element']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('scenario element', p_actor, p_tenant);
  SELECT * INTO e FROM prediction.scenario_elements el WHERE el.element_id = p_element_id FOR UPDATE;
  v_revise := FOUND;
  IF v_revise THEN
    IF e.tenant_id <> p_tenant OR e.domain_id <> p_domain THEN RAISE EXCEPTION 'scenario element rejected (unknown_element): no element % in this domain', p_element_id USING ERRCODE = '23503'; END IF;
    IF e.scenario_id <> p_scenario_id OR e.branch_id IS DISTINCT FROM p_branch_id OR e.kind <> p_kind THEN
      RAISE EXCEPTION 'scenario element rejected (fixed): a revision keeps the element''s scenario, branch and kind (a % of %); declare a new element instead', e.kind, CASE WHEN e.branch_id IS NULL THEN 'the whole scenario' ELSE 'branch ' || e.branch_id END USING ERRCODE = '22023';
    END IF;
    IF e.state <> 'active' THEN RAISE EXCEPTION 'scenario element rejected (state): element "%" is retired; a retired element is not revised', e.name USING ERRCODE = '22023'; END IF;
    IF p_expected_version IS DISTINCT FROM e.version THEN
      RAISE EXCEPTION 'scenario element rejected (stale): element "%" stands at version %, the revision names version %; reload and revise the current version', e.name, e.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
    END IF;
  ELSIF p_expected_version IS NOT NULL THEN
    RAISE EXCEPTION 'scenario element rejected (unknown_element): no element % in this domain to revise', p_element_id USING ERRCODE = '23503';
  END IF;
  s := prediction.psa_scenario_branch('scenario element', p_tenant, p_domain, p_scenario_id, p_branch_id);
  IF length(btrim(coalesce(p_name, ''))) NOT BETWEEN 2 AND 128 THEN RAISE EXCEPTION 'scenario element rejected (name): the name is 2-128 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_description, ''))) NOT BETWEEN 8 AND 4096 THEN RAISE EXCEPTION 'scenario element rejected (description): the description is 8-4096 characters' USING ERRCODE = '22023'; END IF;
  v_attr := prediction.psa_element_attributes(p_tenant, p_domain, p_scenario_id, p_branch_id, p_element_id, p_kind, p_attributes);
  IF p_graph_refs IS NOT NULL AND jsonb_typeof(p_graph_refs) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'scenario element rejected (graph_ref): graph_refs is a list' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(coalesce(p_graph_refs, '[]'::jsonb)) > 16 THEN RAISE EXCEPTION 'scenario element rejected (graph_ref): at most 16 graph references' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p_graph_refs, '[]'::jsonb)) LOOP
    v_refs := v_refs || jsonb_build_array(prediction.psa_assert_graph_ref('scenario element', p_tenant, p_domain, x));
  END LOOP;
  IF EXISTS (SELECT 1 FROM prediction.scenario_elements o WHERE o.scenario_id = p_scenario_id AND o.branch_id IS NOT DISTINCT FROM p_branch_id AND o.kind = p_kind
               AND o.state = 'active' AND lower(btrim(o.name)) = lower(btrim(p_name)) AND o.element_id <> p_element_id) THEN
    RAISE EXCEPTION 'scenario element rejected (duplicate): a % named "%" is already active here; revise it instead', p_kind, btrim(p_name) USING ERRCODE = '22023';
  END IF;
  IF v_revise THEN
    v_version := e.version + 1;
    UPDATE prediction.scenario_elements SET name = btrim(p_name), description = btrim(p_description), attributes = v_attr, graph_refs = v_refs, version = v_version,
           updated_by = p_actor, updated_at = clock_timestamp(), correlation_id = p_correlation
     WHERE element_id = p_element_id RETURNING * INTO e;
  ELSE
    v_version := 1;
    INSERT INTO prediction.scenario_elements (element_id, scope, tenant_id, domain_id, scenario_id, branch_id, kind, name, description, attributes, graph_refs, version, state,
                                              declared_by, updated_by, correlation_id)
    VALUES (p_element_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, p_kind, btrim(p_name), btrim(p_description), v_attr, v_refs, 1, 'active', p_actor, p_actor, p_correlation)
    RETURNING * INTO e;
  END IF;
  INSERT INTO prediction.scenario_element_versions (element_id, version, scope, tenant_id, domain_id, scenario_id, branch_id, kind, name, description, attributes, graph_refs, state, change,
                                                    actor_principal_id, correlation_id)
  VALUES (e.element_id, e.version, 'DOMAIN', p_tenant, p_domain, e.scenario_id, e.branch_id, e.kind, e.name, e.description, e.attributes, e.graph_refs, e.state,
          CASE WHEN v_revise THEN 'revised' ELSE 'declared' END, p_actor, p_correlation);
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, e.scenario_id, e.branch_id, 'scenario.element_declared', p_actor,
          jsonb_build_object('element_id', e.element_id, 'kind', e.kind, 'name', e.name, 'version', e.version, 'change', CASE WHEN v_revise THEN 'revised' ELSE 'declared' END), p_correlation);
  RETURN prediction.psa_element_json(e) || jsonb_build_object('change', CASE WHEN v_revise THEN 'revised' ELSE 'declared' END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_scenario_element(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_scenario_element(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,int,uuid,uuid,uuid) TO eye_commit;

/* RETIRE (reasoned; never deleted): refused while an active element still rests on it (its dependencies or an intervention's targets). */
CREATE OR REPLACE FUNCTION prediction.retire_scenario_element(
  p_element_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e prediction.scenario_elements%ROWTYPE; v_users text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.anatomy.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('scenario element', p_actor, p_tenant);
  SELECT * INTO e FROM prediction.scenario_elements el WHERE el.element_id = p_element_id AND el.tenant_id = p_tenant AND el.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario element rejected (unknown_element): no element % in this domain', p_element_id USING ERRCODE = '23503'; END IF;
  IF e.state = 'retired' THEN RAISE EXCEPTION 'scenario element rejected (state): element "%" was retired at %', e.name, e.retired_at USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'scenario element rejected (reason): a retirement states why (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT string_agg(format('%s "%s"', o.kind, o.name), ', ' ORDER BY o.name) INTO v_users FROM prediction.scenario_elements o
   WHERE o.scenario_id = e.scenario_id AND o.state = 'active' AND o.element_id <> e.element_id
     AND (coalesce(o.attributes -> 'dependencies', '[]'::jsonb) @> jsonb_build_array(e.element_id) OR coalesce(o.attributes -> 'targets', '[]'::jsonb) @> jsonb_build_array(e.element_id));
  IF v_users IS NOT NULL THEN
    RAISE EXCEPTION 'scenario element rejected (in_use): % rests on "%"; revise or retire them first', v_users, e.name USING ERRCODE = '22023';
  END IF;
  UPDATE prediction.scenario_elements SET state = 'retired', version = e.version + 1, retired_by = p_actor, retired_at = clock_timestamp(), retirement_reason = btrim(p_reason),
         updated_by = p_actor, updated_at = clock_timestamp(), correlation_id = p_correlation
   WHERE element_id = e.element_id RETURNING * INTO e;
  INSERT INTO prediction.scenario_element_versions (element_id, version, scope, tenant_id, domain_id, scenario_id, branch_id, kind, name, description, attributes, graph_refs, state, change, reason,
                                                    actor_principal_id, correlation_id)
  VALUES (e.element_id, e.version, 'DOMAIN', p_tenant, p_domain, e.scenario_id, e.branch_id, e.kind, e.name, e.description, e.attributes, e.graph_refs, e.state, 'retired', e.retirement_reason, p_actor, p_correlation);
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, e.scenario_id, e.branch_id, 'scenario.element_retired', p_actor,
          jsonb_build_object('element_id', e.element_id, 'kind', e.kind, 'name', e.name, 'version', e.version, 'reason', e.retirement_reason), p_correlation);
  RETURN prediction.psa_element_json(e);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.retire_scenario_element(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.retire_scenario_element(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- §A4 THE ASSUMPTION REGISTER ────────────────────────────────────────────
/* The invalidation condition, normalised: {kind: 'state'} (the ASU's verification becoming invalidated), {kind: 'claim', claim_id} (a claim
   of the domain disputed or withdrawn), {kind: 'indicator', indicator_id} (an indicator of the domain breached); each with its text. */
CREATE OR REPLACE FUNCTION prediction.psa_condition(p_tenant uuid, p_domain uuid, p_condition jsonb) RETURNS jsonb
SET search_path = prediction, objects, pg_catalog, pg_temp AS $$
DECLARE c jsonb := coalesce(p_condition, jsonb_build_object('kind', 'state')); v_kind text; v_text text; v_id uuid; v_label text;
BEGIN
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'scenario assumption rejected (condition): the invalidation condition is {kind: state|claim|indicator, …, text}' USING ERRCODE = '22023'; END IF;
  v_kind := coalesce(c ->> 'kind', 'state'); v_text := btrim(coalesce(c ->> 'text', ''));
  IF v_kind NOT IN ('state', 'claim', 'indicator') THEN
    RAISE EXCEPTION 'scenario assumption rejected (condition): % is not a condition kind (state, claim, indicator)', v_kind USING ERRCODE = '22023';
  END IF;
  IF length(v_text) NOT BETWEEN 8 AND 1024 THEN
    RAISE EXCEPTION 'scenario assumption rejected (condition): the condition says in words what invalidates the assumption (text, 8-1024 characters)' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'state' THEN RETURN jsonb_build_object('kind', 'state', 'text', v_text); END IF;
  IF coalesce(c ->> (v_kind || '_id'), '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'scenario assumption rejected (condition): a % condition names the % (%_id)', v_kind, v_kind, v_kind USING ERRCODE = '22023';
  END IF;
  v_id := (c ->> (v_kind || '_id'))::uuid;
  IF v_kind = 'claim' THEN
    SELECT left(coalesce(o.payload ->> 'statement', o.payload ->> 'text', 'claim'), 256) INTO v_label FROM objects.canonical_objects o
     WHERE o.object_type = 'CLM' AND o.object_id = v_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario assumption rejected (unknown_claim): % is not a claim of this domain', v_id USING ERRCODE = '23503'; END IF;
    RETURN jsonb_build_object('kind', 'claim', 'claim_id', v_id, 'text', v_text);
  END IF;
  SELECT i.description INTO v_label FROM prediction.indicators_current i WHERE i.indicator_id = v_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario assumption rejected (unknown_indicator): % is not an active indicator of this domain', v_id USING ERRCODE = '23503'; END IF;
  RETURN jsonb_build_object('kind', 'indicator', 'indicator_id', v_id, 'text', v_text);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psa_condition(uuid, uuid, jsonb) FROM PUBLIC;

/* Whether a link's condition is MET now (the read's; the state kind reads the ASU's verification, the claim kind the claim's latest version,
   the indicator kind its breach). Invoker: under the reader's RLS. */
CREATE OR REPLACE FUNCTION prediction.psa_condition_met(p_condition jsonb, p_assumption uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE p_condition ->> 'kind'
    WHEN 'state' THEN EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = p_assumption AND s.verification_state = 'invalidated')
    WHEN 'claim' THEN coalesce((SELECT o.lifecycle_state IN ('disputed', 'withdrawn') OR o.truth_state IN ('disputed', 'withdrawn') FROM objects.canonical_objects o
                                 WHERE o.object_type = 'CLM' AND o.object_id = (p_condition ->> 'claim_id')::uuid ORDER BY o.object_version DESC LIMIT 1), false)
    WHEN 'indicator' THEN coalesce((SELECT i.breached FROM prediction.indicators_current i WHERE i.indicator_id = (p_condition ->> 'indicator_id')::uuid), false)
    ELSE false END
$$;
GRANT EXECUTE ON FUNCTION prediction.psa_condition_met(jsonb, uuid) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.psa_link_json(l prediction.scenario_assumptions) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('link_id', l.link_id, 'scenario_id', l.scenario_id, 'branch_id', l.branch_id, 'assumption_id', l.assumption_id, 'critical', l.critical,
    'invalidation_condition', l.invalidation_condition, 'rationale', l.rationale, 'version', l.version, 'state', l.state, 'linked_by', l.linked_by, 'linked_at', l.linked_at,
    'unlinked_by', l.unlinked_by, 'unlinked_at', l.unlinked_at, 'unlink_reason', l.unlink_reason)
$$;
GRANT EXECUTE ON FUNCTION prediction.psa_link_json(prediction.scenario_assumptions) TO eye_app, eye_commit;

/* LINK an ASU to the scenario (branch NULL) or one branch: new (version 1), REVISED while linked, or RELINKED after an unlink — the last two
   name the version they read. The ASU is a live ASU of the domain; a CRITICAL link to an assumption already INVALIDATED is refused (a
   branch is not built on an assumption known not to hold). A revision or relink states its reason (the rationale). */
CREATE OR REPLACE FUNCTION prediction.link_scenario_assumption(
  p_link_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_branch_id uuid, p_assumption_id uuid, p_critical boolean, p_condition jsonb,
  p_rationale text, p_expected_version int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; a graph.strategy_current%ROWTYPE; l prediction.scenario_assumptions%ROWTYPE; v_cond jsonb; v_change text; v_found boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.anatomy.assumption']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('scenario assumption', p_actor, p_tenant);
  s := prediction.psa_scenario_branch('scenario assumption', p_tenant, p_domain, p_scenario_id, p_branch_id);
  SELECT * INTO a FROM graph.strategy_current x WHERE x.strategy_object_id = p_assumption_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = 'ASU';
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario assumption rejected (unknown_assumption): % is not an assumption (ASU) of this domain''s Knowledge Graph', p_assumption_id USING ERRCODE = '23503'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'scenario assumption rejected (state): assumption "%" is %; only a live assumption is linked', a.title, a.status USING ERRCODE = '22023'; END IF;
  IF p_critical IS NULL THEN RAISE EXCEPTION 'scenario assumption rejected (critical): the link says whether the assumption is critical (critical: true|false)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_rationale, ''))) NOT BETWEEN 8 AND 2048 THEN RAISE EXCEPTION 'scenario assumption rejected (rationale): the link states why the scenario rests on the assumption (8-2048 characters)' USING ERRCODE = '22023'; END IF;
  v_cond := prediction.psa_condition(p_tenant, p_domain, p_condition);
  IF p_critical AND a.verification_state = 'invalidated' THEN
    RAISE EXCEPTION 'scenario assumption rejected (invalidated): assumption "%" is invalidated (%); a branch is not built on a critical assumption known not to hold — verify it again first', a.title, coalesce(a.verification_reason, 'no reason recorded') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO l FROM prediction.scenario_assumptions x WHERE x.scenario_id = p_scenario_id AND x.branch_id IS NOT DISTINCT FROM p_branch_id AND x.assumption_id = p_assumption_id FOR UPDATE;
  v_found := FOUND;
  IF v_found THEN
    IF p_expected_version IS DISTINCT FROM l.version THEN
      RAISE EXCEPTION 'scenario assumption rejected (%): the link of "%" stands at version % (%), the request names version %; reload and revise the current version',
        CASE WHEN p_expected_version IS NULL THEN 'duplicate' ELSE 'stale' END, a.title, l.version, l.state, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
    END IF;
    v_change := CASE l.state WHEN 'linked' THEN 'revised' ELSE 'relinked' END;
    UPDATE prediction.scenario_assumptions SET critical = p_critical, invalidation_condition = v_cond, rationale = btrim(p_rationale), version = l.version + 1, state = 'linked',
           linked_by = p_actor, linked_at = clock_timestamp(), unlinked_by = NULL, unlinked_at = NULL, unlink_reason = NULL, correlation_id = p_correlation
     WHERE link_id = l.link_id RETURNING * INTO l;
  ELSE
    IF p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'scenario assumption rejected (unknown_link): no link of assumption % here to revise', p_assumption_id USING ERRCODE = '23503'; END IF;
    v_change := 'linked';
    INSERT INTO prediction.scenario_assumptions (link_id, scope, tenant_id, domain_id, scenario_id, branch_id, assumption_id, critical, invalidation_condition, rationale, version, state, linked_by, correlation_id)
    VALUES (p_link_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, p_assumption_id, p_critical, v_cond, btrim(p_rationale), 1, 'linked', p_actor, p_correlation)
    RETURNING * INTO l;
  END IF;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, l.scenario_id, l.branch_id, 'scenario.assumption_linked', p_actor,
          prediction.psa_link_json(l) || jsonb_build_object('change', v_change, 'assumption_title', a.title, 'verification_state', a.verification_state), p_correlation);
  RETURN prediction.psa_link_json(l) || jsonb_build_object('change', v_change, 'assumption', jsonb_build_object('title', a.title, 'verification_state', a.verification_state));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.link_scenario_assumption(uuid,uuid,uuid,uuid,uuid,uuid,boolean,jsonb,text,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.link_scenario_assumption(uuid,uuid,uuid,uuid,uuid,uuid,boolean,jsonb,text,int,uuid,uuid,uuid) TO eye_commit;

/* UNLINK (reasoned; the row stays, versioned). Unlinking the critical link of an invalidated assumption is how a branch owner may reinstate a
   branch the assumption no longer carries. */
CREATE OR REPLACE FUNCTION prediction.unlink_scenario_assumption(
  p_link_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l prediction.scenario_assumptions%ROWTYPE; s prediction.scenarios_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.anatomy.assumption']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('scenario assumption', p_actor, p_tenant);
  SELECT * INTO l FROM prediction.scenario_assumptions x WHERE x.link_id = p_link_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario assumption rejected (unknown_link): no assumption link % in this domain', p_link_id USING ERRCODE = '23503'; END IF;
  IF l.state <> 'linked' THEN RAISE EXCEPTION 'scenario assumption rejected (state): link % was unlinked at %', p_link_id, l.unlinked_at USING ERRCODE = '22023'; END IF;
  s := prediction.psa_scenario_branch('scenario assumption', p_tenant, p_domain, l.scenario_id, NULL);
  IF length(btrim(coalesce(p_reason, ''))) < 16 THEN RAISE EXCEPTION 'scenario assumption rejected (reason): an unlink states why the scenario no longer rests on the assumption (16+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE prediction.scenario_assumptions SET state = 'unlinked', version = l.version + 1, unlinked_by = p_actor, unlinked_at = clock_timestamp(), unlink_reason = btrim(p_reason), correlation_id = p_correlation
   WHERE link_id = l.link_id RETURNING * INTO l;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, l.scenario_id, l.branch_id, 'scenario.assumption_unlinked', p_actor, prediction.psa_link_json(l), p_correlation);
  RETURN prediction.psa_link_json(l);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.unlink_scenario_assumption(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.unlink_scenario_assumption(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- §A5 THE RECORDS ─────────────────────────────────────────────────────────
/* A NARRATIVE, IMPLICATION or OPTION record (PR-33-002) by a named author, on the scenario or one branch, its citations validated (a claim or
   evidence object of the domain, an entity, a strategy object); a revision supersedes the record it names (version + 1; once). */
CREATE OR REPLACE FUNCTION prediction.add_scenario_record(
  p_record_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_branch_id uuid, p_kind text, p_title text, p_body text, p_cites jsonb,
  p_supersedes uuid, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; prev prediction.scenario_records%ROWTYPE; r prediction.scenario_records%ROWTYPE; x jsonb; v_cites jsonb := '[]'::jsonb;
        v_kind text; v_id uuid; v_ok boolean; v_version int := 1;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.anatomy.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('scenario record', p_actor, p_tenant);
  s := prediction.psa_scenario_branch('scenario record', p_tenant, p_domain, p_scenario_id, p_branch_id);
  IF p_kind IS NULL OR p_kind NOT IN ('narrative', 'implication', 'option') THEN
    RAISE EXCEPTION 'scenario record rejected (kind): % is not a record kind (narrative, implication, option)', coalesce(p_kind, '<null>') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'scenario record rejected (title): the title is 2-256 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_body, ''))) NOT BETWEEN 8 AND 8000 THEN RAISE EXCEPTION 'scenario record rejected (body): the body is 8-8000 characters' USING ERRCODE = '22023'; END IF;
  IF p_cites IS NOT NULL AND jsonb_typeof(p_cites) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'scenario record rejected (cites): cites is a list of {kind, id}' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(coalesce(p_cites, '[]'::jsonb)) > 32 THEN RAISE EXCEPTION 'scenario record rejected (cites): at most 32 citations' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p_cites, '[]'::jsonb)) LOOP
    v_kind := x ->> 'kind';
    IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR v_kind IS NULL OR v_kind NOT IN ('claim', 'evidence', 'entity', 'strategy')
       OR coalesce(x ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'scenario record rejected (cites): a citation is {kind: claim|evidence|entity|strategy, id: <uuid>}' USING ERRCODE = '22023';
    END IF;
    v_id := (x ->> 'id')::uuid;
    v_ok := CASE v_kind
      WHEN 'claim' THEN EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = 'CLM' AND o.object_id = v_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain)
      WHEN 'evidence' THEN EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.object_id = v_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain)
      WHEN 'entity' THEN EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = v_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain)
      ELSE EXISTS (SELECT 1 FROM graph.strategy_current g WHERE g.strategy_object_id = v_id AND g.tenant_id = p_tenant AND g.domain_id = p_domain) END;
    IF NOT v_ok THEN RAISE EXCEPTION 'scenario record rejected (unknown_citation): % % is not recorded in this domain', v_kind, v_id USING ERRCODE = '23503'; END IF;
    IF NOT v_cites @> jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id)) THEN v_cites := v_cites || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id)); END IF;
  END LOOP;
  IF p_supersedes IS NOT NULL THEN
    SELECT * INTO prev FROM prediction.scenario_records x WHERE x.record_id = p_supersedes AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario record rejected (unknown_record): no record % in this domain', p_supersedes USING ERRCODE = '23503'; END IF;
    IF prev.scenario_id <> p_scenario_id OR prev.branch_id IS DISTINCT FROM p_branch_id OR prev.kind <> p_kind THEN
      RAISE EXCEPTION 'scenario record rejected (fixed): a revision keeps the record''s scenario, branch and kind (a % record)', prev.kind USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM prediction.scenario_records n WHERE n.supersedes = prev.record_id) THEN
      RAISE EXCEPTION 'scenario record rejected (state): record "%" (version %) was already superseded; revise its latest version', prev.title, prev.version USING ERRCODE = '22023';
    END IF;
    v_version := prev.version + 1;
  END IF;
  INSERT INTO prediction.scenario_records (record_id, scope, tenant_id, domain_id, scenario_id, branch_id, kind, title, body, cites, version, supersedes, author_principal_id, correlation_id)
  VALUES (p_record_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, p_kind, btrim(p_title), btrim(p_body), v_cites, v_version, p_supersedes, p_actor, p_correlation)
  RETURNING * INTO r;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, r.scenario_id, r.branch_id, 'scenario.record_added', p_actor,
          jsonb_build_object('record_id', r.record_id, 'kind', r.kind, 'title', r.title, 'version', r.version, 'supersedes', r.supersedes, 'cites', r.cites), p_correlation);
  RETURN to_jsonb(r) - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.add_scenario_record(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.add_scenario_record(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid) TO eye_commit;

-- §A6 THE SUSPENSION ─────────────────────────────────────────────────────
/* The core (private): one LIVE branch (locked by the caller) → suspended, with who, when, why, the cause and the state a reinstatement returns
   to; branch.suspended on the scenario ledger; the BRANCH OWNER tasked — an attention item of class scenario.suspension, subject kind branch
   (the 0095 notify idiom: open when the owner is an active human, else unrouted), due within the branch's response window. */
CREATE OR REPLACE FUNCTION prediction.psa_suspend_branch(b prediction.branches_current, p_reason text, p_cause jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, pg_catalog, pg_temp AS $$
DECLARE v_event uuid := gen_random_uuid(); v_item uuid := gen_random_uuid(); v_state text; v_title text; v_reasons jsonb; v_due timestamptz; v_scn text;
BEGIN
  UPDATE prediction.branches_current SET state = 'suspended', suspended_at = clock_timestamp(), suspended_by = p_actor, suspension_reason = p_reason, suspension_cause = p_cause,
         suspended_from = b.state, reinstated_at = NULL, reinstated_by = NULL, reinstatement_note = NULL
   WHERE branch_id = b.branch_id;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (v_event, 'DOMAIN', b.tenant_id, b.domain_id, b.scenario_id, b.branch_id, 'branch.suspended', p_actor,
          jsonb_build_object('name', b.name, 'suspended_from', b.state, 'reason', p_reason, 'cause', p_cause), p_correlation);
  SELECT s.title INTO v_scn FROM prediction.scenarios_current s WHERE s.scenario_id = b.scenario_id;
  v_state := CASE WHEN decision.is_active_human(b.owner_principal_id, b.tenant_id) THEN 'open' ELSE 'unrouted' END;
  v_title := left(format('Branch suspended: %s (%s) — %s', b.name, v_scn, CASE p_cause ->> 'kind' WHEN 'assumption' THEN format('critical assumption "%s" invalidated', p_cause ->> 'title') ELSE 'suspended by a person' END), 512);
  v_reasons := jsonb_build_array(p_reason,
    'the branch is not live: it does not flip, is not simulated and is not decision-active until its owner (or the scenario owner) reinstates it',
    CASE p_cause ->> 'kind' WHEN 'assumption' THEN 'reinstatement waits until the assumption is verified again or its critical link is unlinked with a reason' ELSE 'the owner reinstates it with a note' END);
  v_due := clock_timestamp() + make_interval(hours => b.response_window_hours);
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', b.tenant_id, b.domain_id, 'scenario.suspension', 'branch', b.branch_id, v_event, 'branch.suspended', v_title, 'material', v_state,
          b.owner_principal_id, '{}',
          jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', b.consequence_class, 'confidence', 1)),
          jsonb_build_object('branch_id', b.branch_id, 'branch_name', b.name, 'scenario_id', b.scenario_id, 'suspended_from', b.state, 'cause', p_cause, 'reason', p_reason),
          v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, b.tenant_id, b.domain_id, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', b.owner_principal_id, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                               'cause_event_id', v_event, 'cause_event_type', 'branch.suspended', 'unrouted', v_state = 'unrouted', 'branch_id', b.branch_id), p_correlation);
  RETURN jsonb_build_object('branch_id', b.branch_id, 'scenario_id', b.scenario_id, 'name', b.name, 'suspended_from', b.state, 'event_id', v_event, 'attention_item_id', v_item,
                            'owner_principal_id', b.owner_principal_id, 'item_state', v_state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psa_suspend_branch(prediction.branches_current, text, jsonb, uuid, uuid) FROM PUBLIC;

/* The invalidation APPLIED (private): every LIVE branch of an ACTIVE scenario whose CRITICAL, linked assumption link names the assumption (the
   branch's own link, or a scenario-wide one) is suspended, once; a branch already suspended or closed is left as it is. Non-critical links are
   untouched (the read notes them). Returns the branches suspended. */
CREATE OR REPLACE FUNCTION prediction.psa_apply_invalidation(p_tenant uuid, p_domain uuid, p_assumption uuid, p_actor uuid, p_cause_event uuid, p_via text, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
DECLARE a graph.strategy_current%ROWTYPE; b prediction.branches_current%ROWTYPE; v_out jsonb := '[]'::jsonb; v_links jsonb; v_reason text;
BEGIN
  SELECT * INTO a FROM graph.strategy_current x WHERE x.strategy_object_id = p_assumption;
  FOR b IN
    SELECT br.* FROM prediction.branches_current br
      JOIN prediction.scenarios_current sc ON sc.scenario_id = br.scenario_id AND sc.state = 'active'
     WHERE br.tenant_id = p_tenant AND br.domain_id = p_domain AND prediction.branch_live(br.state)
       AND EXISTS (SELECT 1 FROM prediction.scenario_assumptions l WHERE l.assumption_id = p_assumption AND l.state = 'linked' AND l.critical
                     AND l.scenario_id = br.scenario_id AND (l.branch_id IS NULL OR l.branch_id = br.branch_id))
     ORDER BY br.scenario_id, br.branch_id
       FOR UPDATE OF br
  LOOP
    SELECT jsonb_agg(l.link_id ORDER BY l.link_id) INTO v_links FROM prediction.scenario_assumptions l
     WHERE l.assumption_id = p_assumption AND l.state = 'linked' AND l.critical AND l.scenario_id = b.scenario_id AND (l.branch_id IS NULL OR l.branch_id = b.branch_id);
    v_reason := left(format('the critical assumption "%s" was invalidated: %s', a.title, coalesce(a.verification_reason, 'no reason recorded')), 2048);
    v_out := v_out || jsonb_build_array(prediction.psa_suspend_branch(b, v_reason,
      jsonb_build_object('kind', 'assumption', 'id', p_assumption, 'title', a.title, 'link_ids', v_links, 'strategy_event_id', p_cause_event, 'via', p_via,
                         'verification_reason', a.verification_reason), p_actor, p_correlation));
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psa_apply_invalidation(uuid, uuid, uuid, uuid, uuid, text, uuid) FROM PUBLIC;

/* THE TRIGGER: an ASU's invalidation (graph.set_assumption_state writes assumption.invalidated — a person under graph.assumption.verify, or
   impact propagation) suspends, in the same transaction, the live branches its critical links name. Its actor is the invalidation's actor. */
CREATE OR REPLACE FUNCTION prediction.psa_on_assumption_invalidated() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM prediction.scenario_assumptions l WHERE l.assumption_id = NEW.strategy_object_id AND l.state = 'linked' AND l.critical) THEN
    PERFORM prediction.psa_apply_invalidation(NEW.tenant_id, NEW.domain_id, NEW.strategy_object_id, NEW.actor_principal_id, NEW.event_id,
                                              coalesce(public.eye_bound_action(), 'graph.assumption.state'), NEW.correlation_id);
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psa_on_assumption_invalidated() FROM PUBLIC;
CREATE TRIGGER psa_assumption_invalidated AFTER INSERT ON graph.strategy_events
  FOR EACH ROW WHEN (NEW.event = 'assumption.invalidated') EXECUTE FUNCTION prediction.psa_on_assumption_invalidated();

/* A PERSON suspends a live branch with a reason (cause operator — or element, naming the scenario element that motivates it). */
CREATE OR REPLACE FUNCTION prediction.suspend_branch(
  p_tenant uuid, p_domain uuid, p_branch_id uuid, p_reason text, p_element_id uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; s prediction.scenarios_current%ROWTYPE; e prediction.scenario_elements%ROWTYPE; v_cause jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.anatomy.suspend']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('branch suspension', p_actor, p_tenant);
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch suspension rejected (unknown_branch): no branch % in this domain', p_branch_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current c WHERE c.scenario_id = b.scenario_id;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'branch suspension rejected (state): scenario "%" is %', s.title, s.state USING ERRCODE = '22023'; END IF;
  IF NOT prediction.branch_live(b.state) THEN
    RAISE EXCEPTION 'branch suspension rejected (state): branch "%" is %; only a live (open or flipped) branch is suspended', b.name, b.state USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 16 THEN RAISE EXCEPTION 'branch suspension rejected (reason): a suspension states why the branch no longer holds (16+ characters)' USING ERRCODE = '22023'; END IF;
  v_cause := jsonb_build_object('kind', 'operator', 'id', p_actor);
  IF p_element_id IS NOT NULL THEN
    SELECT * INTO e FROM prediction.scenario_elements x WHERE x.element_id = p_element_id AND x.scenario_id = b.scenario_id AND x.state = 'active' AND (x.branch_id IS NULL OR x.branch_id = b.branch_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'branch suspension rejected (unknown_element): % is not an active element of this branch or its scenario', p_element_id USING ERRCODE = '23503'; END IF;
    v_cause := jsonb_build_object('kind', 'element', 'id', e.element_id, 'element_kind', e.kind, 'name', e.name, 'by', p_actor);
  END IF;
  RETURN prediction.psa_suspend_branch(b, btrim(p_reason), v_cause, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.suspend_branch(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.suspend_branch(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* A PERSON re-applies an assumption's invalidation (the trigger's own path, by hand — e.g. after a critical link is revised): refused unless
   the ASU is invalidated; idempotent (branches already suspended are left). */
CREATE OR REPLACE FUNCTION prediction.apply_assumption_invalidation(
  p_tenant uuid, p_domain uuid, p_assumption_id uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a graph.strategy_current%ROWTYPE; v_ev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.anatomy.suspend']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('branch suspension', p_actor, p_tenant);
  SELECT * INTO a FROM graph.strategy_current x WHERE x.strategy_object_id = p_assumption_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = 'ASU';
  IF NOT FOUND THEN RAISE EXCEPTION 'branch suspension rejected (unknown_assumption): % is not an assumption (ASU) of this domain', p_assumption_id USING ERRCODE = '23503'; END IF;
  IF a.verification_state <> 'invalidated' THEN
    RAISE EXCEPTION 'branch suspension rejected (state): assumption "%" is %, not invalidated; nothing to apply', a.title, a.verification_state USING ERRCODE = '22023';
  END IF;
  SELECT e.event_id INTO v_ev FROM graph.strategy_events e WHERE e.strategy_object_id = p_assumption_id AND e.event = 'assumption.invalidated' ORDER BY e.occurred_at DESC LIMIT 1;
  RETURN jsonb_build_object('assumption_id', p_assumption_id, 'title', a.title, 'suspended', prediction.psa_apply_invalidation(p_tenant, p_domain, p_assumption_id, p_actor, v_ev, 'prediction.scenario.anatomy.suspend', p_correlation));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.apply_assumption_invalidation(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.apply_assumption_invalidation(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* REINSTATE under the owner's word: the branch's owner or the scenario's owner, with a note; refused while a CRITICAL linked assumption of the
   branch (its own or scenario-wide) is still INVALIDATED (verify it again, or unlink it with a reason, first). Returns the branch to the state
   it was suspended from (open or flipped); the owner's open suspension items are closed. */
CREATE OR REPLACE FUNCTION prediction.reinstate_branch(
  p_tenant uuid, p_domain uuid, p_branch_id uuid, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; s prediction.scenarios_current%ROWTYPE; v_blocking text; v_items jsonb; i record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.anatomy.reinstate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('branch suspension', p_actor, p_tenant);
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch suspension rejected (unknown_branch): no branch % in this domain', p_branch_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current c WHERE c.scenario_id = b.scenario_id;
  IF p_actor IS DISTINCT FROM b.owner_principal_id AND p_actor IS DISTINCT FROM s.owner_principal_id THEN
    RAISE EXCEPTION 'branch suspension rejected (ownership): branch "%" is reinstated by its owner or the scenario''s owner', b.name USING ERRCODE = '42501';
  END IF;
  IF b.state <> 'suspended' THEN RAISE EXCEPTION 'branch suspension rejected (state): branch "%" is %, not suspended', b.name, b.state USING ERRCODE = '22023'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'branch suspension rejected (state): scenario "%" is %', s.title, s.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 16 THEN RAISE EXCEPTION 'branch suspension rejected (note): a reinstatement states why the branch holds again (16+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT string_agg(format('"%s"', a.title), ', ' ORDER BY a.title) INTO v_blocking
    FROM prediction.scenario_assumptions l JOIN graph.strategy_current a ON a.strategy_object_id = l.assumption_id
   WHERE l.scenario_id = b.scenario_id AND (l.branch_id IS NULL OR l.branch_id = b.branch_id) AND l.state = 'linked' AND l.critical AND a.verification_state = 'invalidated';
  IF v_blocking IS NOT NULL THEN
    RAISE EXCEPTION 'branch suspension rejected (invalidated): the critical assumption % is still invalidated; verify it again or unlink it with a reason before the branch is reinstated', v_blocking USING ERRCODE = '22023';
  END IF;
  UPDATE prediction.branches_current SET state = b.suspended_from, reinstated_at = clock_timestamp(), reinstated_by = p_actor, reinstatement_note = btrim(p_note)
   WHERE branch_id = b.branch_id RETURNING * INTO b;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'branch.reinstated', p_actor,
          jsonb_build_object('name', b.name, 'state', b.state, 'note', b.reinstatement_note, 'suspended_at', b.suspended_at, 'cause', b.suspension_cause), p_correlation);
  v_items := '[]'::jsonb;
  FOR i IN SELECT it.item_id FROM executive.attention_items it
            WHERE it.tenant_id = p_tenant AND it.domain_id = p_domain AND it.signal_class = 'scenario.suspension' AND it.subject_kind = 'branch' AND it.subject_id = b.branch_id AND it.state <> 'closed'
            FOR UPDATE LOOP
    UPDATE executive.attention_items SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, suppressed_until = NULL, updated_at = clock_timestamp() WHERE item_id = i.item_id;
    PERFORM executive.attention_event(i.item_id, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('reason', 'the branch was reinstated', 'branch_id', b.branch_id, 'event_id', p_event_id), p_correlation);
    v_items := v_items || jsonb_build_array(i.item_id);
  END LOOP;
  RETURN jsonb_build_object('branch_id', b.branch_id, 'scenario_id', b.scenario_id, 'name', b.name, 'state', b.state, 'reinstated_at', b.reinstated_at, 'reinstated_by', b.reinstated_by,
                            'reinstatement_note', b.reinstatement_note, 'suspended_at', b.suspended_at, 'closed_items', v_items);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.reinstate_branch(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.reinstate_branch(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- §A7 THE RUN'S GATE ─────────────────────────────────────────────────────
/* A suspended branch is NOT SIMULATED: open_run (0092:1888) is not re-declared; the run's row is refused before it is written. */
CREATE OR REPLACE FUNCTION prediction.psa_run_refuses_suspended() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE;
BEGIN
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = NEW.scenario_branch_id;
  IF FOUND AND b.state = 'suspended' THEN
    RAISE EXCEPTION 'run rejected (branch_suspended): branch "%" of scenario % is suspended since % (%); a suspended branch is not simulated until its owner reinstates it',
      b.name, b.scenario_id, b.suspended_at, b.suspension_reason USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psa_run_refuses_suspended() FROM PUBLIC;
CREATE TRIGGER psa_run_branch_live BEFORE INSERT ON simulation.runs_current
  FOR EACH ROW WHEN (NEW.scenario_branch_id IS NOT NULL) EXECUTE FUNCTION prediction.psa_run_refuses_suspended();

-- §A8 THE READ ───────────────────────────────────────────────────────────
/* The scenario's anatomy under the reader's RLS (invoker): the scenario; each branch (live, decision-active, the suspension with its cause and
   who; the reinstatement); the elements (scenario-wide and per branch, active and retired); the assumption register (each link with its ASU's
   current verification state and whether its condition is met; a non-critical invalidated link is NOTED); the records (newest version of
   each chain marked); the open suspension items. NULL when the scenario is not visible. The service maps interventions → mechanisms → impacts. */
CREATE OR REPLACE FUNCTION prediction.scenario_anatomy(p_scenario_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, graph, executive, identity, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'scenario', jsonb_build_object('scenario_id', s.scenario_id, 'title', s.title, 'statement', s.statement, 'state', s.state, 'owner_principal_id', s.owner_principal_id,
                                   'owner_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = s.owner_principal_id), 'current_version', s.current_version,
                                   'coherence_state', s.coherence_state),
    'branches', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'branch_id', b.branch_id, 'name', b.name, 'kind', b.kind, 'kind_label', b.kind_label, 'statement', b.statement, 'state', b.state,
        'live', prediction.branch_live(b.state), 'decision_active', prediction.branch_live(b.state) AND s.state = 'active',
        'owner_principal_id', b.owner_principal_id, 'owner_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = b.owner_principal_id),
        'indicator_id', b.indicator_id, 'consequence_class', b.consequence_class,
        'suspension', CASE WHEN b.suspended_at IS NULL THEN NULL ELSE jsonb_build_object('suspended_at', b.suspended_at, 'suspended_by', b.suspended_by,
                         'suspended_by_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = b.suspended_by), 'reason', b.suspension_reason, 'cause', b.suspension_cause,
                         'suspended_from', b.suspended_from, 'current', b.state = 'suspended',
                         'reinstated_at', b.reinstated_at, 'reinstated_by', b.reinstated_by, 'reinstated_by_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = b.reinstated_by),
                         'reinstatement_note', b.reinstatement_note) END,
        'open_items', coalesce((SELECT jsonb_agg(jsonb_build_object('item_id', it.item_id, 'state', it.state, 'owner_principal_id', it.owner_principal_id, 'due_at', it.due_at, 'title', it.title) ORDER BY it.created_at)
                                  FROM executive.attention_items it WHERE it.subject_kind = 'branch' AND it.subject_id = b.branch_id AND it.signal_class = 'scenario.suspension' AND it.state <> 'closed'), '[]'::jsonb)
      ) ORDER BY b.added_at, b.name) FROM prediction.branches_current b WHERE b.scenario_id = s.scenario_id), '[]'::jsonb),
    'elements', coalesce((SELECT jsonb_agg(prediction.psa_element_json(e) ORDER BY e.kind, e.declared_at, e.name) FROM prediction.scenario_elements e WHERE e.scenario_id = s.scenario_id), '[]'::jsonb),
    'assumptions', coalesce((SELECT jsonb_agg(prediction.psa_link_json(l) || jsonb_build_object(
        'assumption', jsonb_build_object('title', a.title, 'statement', a.statement, 'status', a.status, 'verification_state', a.verification_state, 'verification_reason', a.verification_reason, 'verified_at', a.verified_at),
        'condition_met', l.state = 'linked' AND prediction.psa_condition_met(l.invalidation_condition, l.assumption_id),
        'invalidated', a.verification_state = 'invalidated',
        'note', CASE WHEN l.state = 'linked' AND NOT l.critical AND a.verification_state = 'invalidated' THEN 'a non-critical assumption is invalidated: the branch stays live; review it'
                     WHEN l.state = 'linked' AND l.critical AND a.verification_state = 'invalidated' THEN 'a critical assumption is invalidated: the branch it names is suspended'
                     ELSE NULL END) ORDER BY l.critical DESC, a.title)
        FROM prediction.scenario_assumptions l LEFT JOIN graph.strategy_current a ON a.strategy_object_id = l.assumption_id WHERE l.scenario_id = s.scenario_id), '[]'::jsonb),
    'records', coalesce((SELECT jsonb_agg((to_jsonb(r) - 'scope' - 'correlation_id') || jsonb_build_object(
        'author_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = r.author_principal_id),
        'latest', NOT EXISTS (SELECT 1 FROM prediction.scenario_records n WHERE n.supersedes = r.record_id)) ORDER BY r.recorded_at)
        FROM prediction.scenario_records r WHERE r.scenario_id = s.scenario_id), '[]'::jsonb))
  FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id
$$;
GRANT EXECUTE ON FUNCTION prediction.scenario_anatomy(uuid) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- section `quality` (§Q) — the part-local file 0097_b27_x_quality.sql, combined here at integration in the apply order every fresh-database run used (§0, §A, §Q, §S)
-- ═════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `quality` (§Q) — the part-local file 0097_b27_x_quality.sql (combined into 0097 at integration after §0 and §A)
-- ═════════════════════════════════════════════════════════════════════
-- 0097 §Q — CP-6 B27 PART Q (2026-09-30): SCENARIO QUALITY AND COHERENCE v2 (F-P4-09; L7-C06, L7-I04, V03-T-142/-143/-334/-341,
-- ES-37-007/-008/-009, V04-T-031/-032, AI-49-003/-004, PR-33-005, FEX-12). Built on the prelude (§0: prediction.branch_live, the widened
-- scenario event vocabulary, the attention class scenario.quality) and nothing else of B27: §A's elements and assumption register and §S's
-- set plurality policies are read by to_regclass (dynamic SQL inside an exception block), so the part stands alone.
--
--   Q.1 THE RULES: prediction.scenario_quality_rules (versioned; the v1 row inserted here) — SEPARATE from the coherence rule v1
--       (prediction.scenario_coherence_rule(), 0081), which is NOT changed, reordered or extended: its findings arrays stay as pinned.
--   Q.2 THE RECORD: prediction.scenario_quality_evaluations (append-only; trigger declare | branch | operator | tick; the measures, the
--       findings naming branches, the outcome, the prior outcome, whether the failure is NEW, the attention item raised),
--       prediction.frequency_probability_maps (the FREQUENCY-TO-PROBABILITY mapping object deferred since B21: named, versioned, owned; a
--       re-declaration of a name is its next version and supersedes the prior), prediction.branch_probabilities (append-only: a `set` row
--       or a `withdrawn` row; the view prediction.branch_probabilities_current names each branch's standing probability).
--   Q.3 THE MEASURES (pure reads; prediction.scenario_quality_compute): DISTINCTIVENESS (indistinct_branches: two live branches whose
--       assumptions, elements, indicator and divergence are the same and whose statements' normalised token sets overlap at or above the
--       rule's threshold — the wording is all that differs), COLLAPSE (collapse_to_one_forecast: every live non-baseline branch — at least two —
--       rests on one indicator threshold), PROHIBITED CONTRADICTION (a branch asserting X and not-X among its assumptions, or an antonym
--       pair the rule declares, or contradicting a scenario-level element), TEMPORAL ORDERING of elements with timing attributes
--       (element_temporal_order), COVERAGE (baseline / adverse / stress, and a set's plurality requirement when §S names one), BIAS
--       (all adverse / all benign), the QUALITY INDICATORS (assumption coverage, branch diversity, INDICATOR FRESHNESS — missing and stale
--       named —, signpost discrimination, review timeliness).
--   Q.4 THE PORTS: evaluate_scenario_quality (prediction.scenario.quality.evaluate — a person's act), sweep_scenario_quality
--       (executive.attention.tick — the step `scenario-quality`, order 68: re-evaluates an ACTIVE scenario already evaluated once whose
--       version changed or whose indicator freshness changed; a NEW failure raises `scenario.quality` to the owner once), declare_frequency_map
--       (prediction.scenario.probability.map), set_branch_probability (prediction.scenario.probability.set — a named human, a method and its
--       basis; never from narrative text), withdraw_branch_probability (prediction.scenario.probability.withdraw).
--   Q.5 THE READ: prediction.scenario_quality(scenario_id) (an invoker read under the caller's RLS): the latest evaluation, the measures AS OF
--       NOW, the decision-activity (FEX-12: a failed coherence check OR a failed quality evaluation reads NOT decision-active), the standing
--       probabilities with method and basis and the live lows' sum, the domain's maps.
--   THE FRESHNESS RULE (stated): an indicator's cadence is consecutive_days × its series' seasonality_days (1 when the series is not
--   registered); it is STALE when the database's today minus its last observation date exceeds cadence + the rule's freshness_grace_days
--   (v1: 7), or — never observed — when it was defined longer ago than that; AWAITING when never observed and defined within it; MISSING when
--   a live branch of a kind that needs a signpost (every kind but baseline and counterfactual) names no indicator, or names one that is
--   retired or expired. A missing or stale indicator FAILS the evaluation (the branch cannot be watched).
--   Refusal families: `scenario quality rejected (<class>)`, `branch probability rejected (<class>)`, `frequency map rejected (<class>)` —
--   actor | authority → 403, unknown_* → 404, state → 409, the rest → 422. Every figure a harness seeds is SYNTHETIC. Forward-only.

-- ═════════════════════════════════════════════════════════════════════
-- §Q.1 THE RULES
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.scenario_quality_rules (
  version      text PRIMARY KEY CHECK (version ~ '^[0-9]+$'),
  rules        jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'object'),
  declared_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER psq_rules_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_quality_rules FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_quality_rules IS 'B27 (0097 §Q): the versioned scenario QUALITY rules (F-P4-09) — separate from the coherence rule v1 (0081), which is not changed; append-only; the highest version is in force.';
INSERT INTO prediction.scenario_quality_rules (version, rules) VALUES ('1', $json${
  "version": "1",
  "fail": ["indistinct_branches", "collapse_to_one_forecast", "prohibited_contradiction", "element_temporal_order", "indicator_missing", "indicator_stale"],
  "note": ["coverage", "bias", "signpost_shared", "review_overdue"],
  "params": {
    "wording_overlap_threshold": 0.75,
    "stop_words": ["a", "an", "the", "of", "for", "to", "in", "on", "at", "by", "with", "and", "or", "is", "are", "be", "been", "will", "would", "shall", "it", "its", "this", "that", "as", "over", "from", "into", "than", "then", "there", "their", "they", "do", "does", "did", "has", "have", "had", "so"],
    "negations": ["not", "no", "never", "none", "without", "cannot"],
    "antonyms": [["open", "closed"], ["open", "close"], ["rise", "fall"], ["above", "below"], ["increase", "decrease"], ["halt", "resume"], ["expand", "contract"], ["gain", "lose"]],
    "freshness_grace_days": 7,
    "indicator_required_kinds": ["upside", "downside", "disruption", "stress", "adversarial", "user-defined"],
    "coverage": {"baseline": ["baseline"], "adverse": ["downside", "disruption", "stress", "adversarial"], "stress": ["stress"]},
    "bias": {"adverse": ["downside", "disruption", "stress", "adversarial"], "benign": ["upside"], "min_branches": 2}
  },
  "statement": "Wording is normalised (lower case, punctuation removed, stop words dropped, the endings -ing/-ed/-s stripped from words longer than 5/4/3 letters) and two statements overlap by the Jaccard index of their token sets. A contradiction is two statements whose tokens, negations removed, are equal and whose negation counts differ in parity, or whose tokens differ by exactly one declared antonym pair."
}$json$::jsonb);
-- A rule is not tenant data, but every prediction table is under FORCED row-level security (0058's idiom for the kind vocabulary): a shared read.
REVOKE ALL ON prediction.scenario_quality_rules FROM PUBLIC;
ALTER TABLE prediction.scenario_quality_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.scenario_quality_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY scenario_quality_rules_shared ON prediction.scenario_quality_rules FOR SELECT USING (true);

/* The rule in force (the highest version). */
CREATE OR REPLACE FUNCTION prediction.scenario_quality_rule() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT r.rules || jsonb_build_object('version', r.version) FROM prediction.scenario_quality_rules r ORDER BY r.version::int DESC LIMIT 1 $$;
GRANT SELECT ON prediction.scenario_quality_rules TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.scenario_quality_rule() TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §Q.2 THE RECORD
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.scenario_quality_evaluations (
  evaluation_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  scenario_id       uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  scenario_version  int,
  rule_version      text NOT NULL,
  trigger           text NOT NULL CHECK (trigger IN ('declare', 'branch', 'operator', 'tick')),
  measures          jsonb NOT NULL CHECK (jsonb_typeof(measures) = 'object'),
  findings          jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),     -- [{rule, outcome fail|note, branch_ids, detail}]
  outcome           text NOT NULL CHECK (outcome IN ('passed', 'failed')),
  prior_outcome     text CHECK (prior_outcome IS NULL OR prior_outcome IN ('passed', 'failed')),
  fingerprint       text[] NOT NULL DEFAULT '{}',                                -- the failing (rule:branches) set, sorted
  freshness_key     text[] NOT NULL DEFAULT '{}',                                -- the branches' indicator states, sorted (the tick's change test)
  new_failure       boolean NOT NULL,
  attention_item_id uuid,
  evaluated_by      uuid NOT NULL,
  evaluated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT psq_eval_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psq_eval_new_failure CHECK (NOT new_failure OR outcome = 'failed')
);
CREATE INDEX psq_eval_scenario ON prediction.scenario_quality_evaluations (scenario_id, evaluated_at DESC);
CREATE TRIGGER psq_eval_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_quality_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_quality_evaluations IS 'B27 (0097 §Q; F-P4-09): every QUALITY evaluation of a scenario under a quality rule version — the measures, the findings naming branches, the outcome; append-only; separate from scenario_coherence_checks (v1, pinned). A failed evaluation makes the scenario not decision-active (FEX-12).';

CREATE TABLE prediction.frequency_probability_maps (
  map_id             uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  name               text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 128),
  version            int NOT NULL CHECK (version >= 1),
  bands              jsonb NOT NULL CHECK (jsonb_typeof(bands) = 'array' AND jsonb_array_length(bands) >= 1),
  horizon            text NOT NULL CHECK (length(btrim(horizon)) BETWEEN 2 AND 64),   -- the window the probability speaks of ('the next 12 months')
  owner_principal_id uuid NOT NULL,
  state              text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'superseded')),
  supersedes         uuid REFERENCES prediction.frequency_probability_maps (map_id),
  superseded_at      timestamptz,
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT psq_fpm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psq_fpm_version UNIQUE (tenant_id, domain_id, name, version),
  CONSTRAINT psq_fpm_superseded_bound CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
/* A map version is IMMUTABLE: its bands, owner and name never change; only active → superseded (once) when the next version is declared. */
CREATE OR REPLACE FUNCTION prediction.psq_fpm_forward() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'frequency map rejected (state): a map version is never deleted' USING ERRCODE = '22023'; END IF;
  IF (to_jsonb(NEW) - 'state' - 'superseded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'superseded_at') OR OLD.state <> 'active' OR NEW.state <> 'superseded' THEN
    RAISE EXCEPTION 'frequency map rejected (state): a map version is immutable; only active → superseded by its next version' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER psq_fpm_forward BEFORE UPDATE OR DELETE ON prediction.frequency_probability_maps FOR EACH ROW EXECUTE FUNCTION prediction.psq_fpm_forward();
CREATE INDEX psq_fpm_name ON prediction.frequency_probability_maps (tenant_id, domain_id, name, version DESC);
COMMENT ON TABLE prediction.frequency_probability_maps IS 'B27 (0097 §Q; deferred since B21): the FREQUENCY-TO-PROBABILITY mapping object — named, versioned, owned by a named human; bands [{frequency_label, min_per_year, max_per_year (null = unbounded), probability_low, probability_high}], contiguous, ascending, the probabilities non-decreasing; the next version supersedes the prior.';

CREATE TABLE prediction.branch_probabilities (
  probability_id     uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  scenario_id        uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  branch_id          uuid NOT NULL REFERENCES prediction.branches_current (branch_id),
  action             text NOT NULL CHECK (action IN ('set', 'withdrawn')),
  probability_low    numeric CHECK (probability_low IS NULL OR probability_low BETWEEN 0 AND 1),
  probability_high   numeric CHECK (probability_high IS NULL OR probability_high BETWEEN 0 AND 1),
  method             text CHECK (method IS NULL OR method IN ('frequency_map', 'expert_elicitation', 'model')),
  map_id             uuid REFERENCES prediction.frequency_probability_maps (map_id),
  basis              jsonb CHECK (basis IS NULL OR jsonb_typeof(basis) = 'object'),
  withdraws          uuid REFERENCES prediction.branch_probabilities (probability_id),
  withdrawal_reason  text,
  actor_principal_id uuid NOT NULL,          -- the named human who set (or withdrew) it
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT psq_bp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT psq_bp_set_bound CHECK (action <> 'set' OR (probability_low IS NOT NULL AND probability_high IS NOT NULL AND probability_low <= probability_high AND method IS NOT NULL AND basis IS NOT NULL
                                                         AND withdraws IS NULL AND withdrawal_reason IS NULL AND ((method = 'frequency_map') = (map_id IS NOT NULL)))),
  CONSTRAINT psq_bp_withdrawn_bound CHECK (action <> 'withdrawn' OR (withdraws IS NOT NULL AND withdrawal_reason IS NOT NULL AND length(btrim(withdrawal_reason)) >= 8
                                                                     AND probability_low IS NULL AND probability_high IS NULL AND method IS NULL AND basis IS NULL AND map_id IS NULL))
);
CREATE INDEX psq_bp_branch ON prediction.branch_probabilities (branch_id, recorded_at DESC);
CREATE INDEX psq_bp_scenario ON prediction.branch_probabilities (scenario_id, recorded_at DESC);
CREATE TRIGGER psq_bp_append_only BEFORE UPDATE OR DELETE ON prediction.branch_probabilities FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.branch_probabilities IS 'B27 (0097 §Q; F-P4-09): SEPARATELY GOVERNED branch probabilities — a band set by a named human with a method (frequency_map | expert_elicitation | model) and its basis, never derived from narrative text; append-only (a set row, or a withdrawn row naming the set row it withdraws, with a reason). The standing one: prediction.branch_probabilities_current.';

-- RLS and grants (the 0081 loop idiom; the 0089 prediction_isolation policy text; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scenario_quality_evaluations', 'frequency_probability_maps', 'branch_probabilities'] LOOP
    EXECUTE format('REVOKE ALL ON prediction.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE prediction.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE prediction.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY prediction_isolation ON prediction.%I USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = ''TENANT'' OR domain_id = public.eye_domain()))', t);
    EXECUTE format('GRANT SELECT ON prediction.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

/* The STANDING probability of each branch: its latest row, when that row is a `set` (a later `withdrawn` row ends it). Under the caller's RLS. */
CREATE VIEW prediction.branch_probabilities_current WITH (security_invoker = true) AS
  SELECT x.probability_id, x.scope, x.tenant_id, x.domain_id, x.scenario_id, x.branch_id, x.probability_low, x.probability_high, x.method, x.map_id, x.basis,
         x.actor_principal_id AS set_by, x.recorded_at AS set_at, x.correlation_id
    FROM (SELECT DISTINCT ON (p.branch_id) p.* FROM prediction.branch_probabilities p ORDER BY p.branch_id, p.recorded_at DESC, p.probability_id DESC) x
   WHERE x.action = 'set';
GRANT SELECT ON prediction.branch_probabilities_current TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §Q.3 THE MEASURES (pure reads; no port)
-- ═════════════════════════════════════════════════════════════════════
/* A statement's words, cleaned: lower case; won't / can't / n't opened into will not / cannot / not (the apostrophe straight or curved);
   anything but letters, digits and spaces becomes a space. */
CREATE OR REPLACE FUNCTION prediction.psq_clean(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT regexp_replace(replace(replace(replace(translate(lower(coalesce(p_text, '')), '’', ''''), 'won''t', 'will not'), 'can''t', 'cannot'), 'n''t', ' not'), '[^a-z0-9 ]+', ' ', 'g') $$;
GRANT EXECUTE ON FUNCTION prediction.psq_clean(text) TO eye_app, eye_commit;

/* A statement's normalised TOKENS under the rule (sorted, distinct): psq_clean (lower case, the negating contractions opened, punctuation removed); stop words dropped;
   -ing / -ed / -s stripped from words longer than 5 / 4 / 3 letters. With p_keep_negations false the negation words are dropped too. */
CREATE OR REPLACE FUNCTION prediction.psq_tokens(p_text text, p_rule jsonb, p_keep_negations boolean DEFAULT true) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH w AS (
    SELECT x AS word FROM regexp_split_to_table(prediction.psq_clean(p_text), '\s+') x WHERE x <> ''),
  s AS (
    SELECT CASE WHEN length(word) > 5 AND word ~ 'ing$' THEN left(word, -3)
                WHEN length(word) > 4 AND word ~ 'ed$' THEN left(word, -2)
                WHEN length(word) > 3 AND word ~ 's$' AND word !~ 'ss$' THEN left(word, -1)
                ELSE word END AS t
      FROM w
     WHERE NOT (word = ANY (ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'stop_words'))))
       AND (p_keep_negations OR NOT (word = ANY (ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'negations'))))))
  SELECT coalesce(array_agg(DISTINCT t ORDER BY t), '{}'::text[]) FROM s $$;

/* The count of negation words in a statement (its parity decides X vs not-X). */
CREATE OR REPLACE FUNCTION prediction.psq_negations(p_text text, p_rule jsonb) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT count(*)::int FROM regexp_split_to_table(prediction.psq_clean(p_text), '\s+') x
   WHERE x = ANY (ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'negations'))) $$;

/* The Jaccard overlap of two token sets (1 when both are empty). */
CREATE OR REPLACE FUNCTION prediction.psq_overlap(a text[], b text[]) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN cardinality(a) = 0 AND cardinality(b) = 0 THEN 1::numeric
              ELSE round((SELECT count(*) FROM (SELECT unnest(a) INTERSECT SELECT unnest(b)) i)::numeric
                         / NULLIF((SELECT count(*) FROM (SELECT unnest(a) UNION SELECT unnest(b)) u), 0), 4) END $$;

/* Whether two statements CONTRADICT under the rule: the same tokens without negations and a different negation parity; or tokens that
   differ by exactly one declared antonym pair (with the same parity). */
CREATE OR REPLACE FUNCTION prediction.psq_contradicts(p_a text, p_b text, p_rule jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE a text[] := prediction.psq_tokens(p_a, p_rule, false); b text[] := prediction.psq_tokens(p_b, p_rule, false); da text[]; db text[]; pa int; pb int;
BEGIN
  IF cardinality(a) = 0 OR cardinality(b) = 0 THEN RETURN false; END IF;
  pa := prediction.psq_negations(p_a, p_rule) % 2; pb := prediction.psq_negations(p_b, p_rule) % 2;
  IF a = b THEN RETURN pa <> pb; END IF;
  IF pa <> pb THEN RETURN false; END IF;
  da := ARRAY(SELECT unnest(a) EXCEPT SELECT unnest(b)); db := ARRAY(SELECT unnest(b) EXCEPT SELECT unnest(a));
  IF cardinality(da) <> 1 OR cardinality(db) <> 1 THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM jsonb_array_elements(p_rule -> 'params' -> 'antonyms') p
                  WHERE (prediction.psq_tokens(p ->> 0, p_rule, false) = ARRAY[da[1]] AND prediction.psq_tokens(p ->> 1, p_rule, false) = ARRAY[db[1]])
                     OR (prediction.psq_tokens(p ->> 1, p_rule, false) = ARRAY[da[1]] AND prediction.psq_tokens(p ->> 0, p_rule, false) = ARRAY[db[1]]));
END $$;
GRANT EXECUTE ON FUNCTION prediction.psq_tokens(text, jsonb, boolean) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.psq_negations(text, jsonb) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.psq_overlap(text[], text[]) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.psq_contradicts(text, text, jsonb) TO eye_app, eye_commit;

/* §A's rows when §A is present (to_regclass; the part stands alone): the ACTIVE elements of a scenario
   [{element_id, branch_id, kind, name, description, attributes}] and the LINKED assumptions [{branch_id, assumption_id, critical}]. */
CREATE OR REPLACE FUNCTION prediction.psq_elements(p_scenario_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF to_regclass('prediction.scenario_elements') IS NULL THEN RETURN '[]'::jsonb; END IF;
  BEGIN
    EXECUTE $q$SELECT coalesce(jsonb_agg(jsonb_build_object('element_id', e.element_id, 'branch_id', e.branch_id, 'kind', e.kind, 'name', e.name, 'description', e.description,
                                                         'attributes', coalesce(e.attributes, '{}'::jsonb)) ORDER BY e.name, e.element_id), '[]'::jsonb)
                 FROM prediction.scenario_elements e WHERE e.scenario_id = $1 AND e.state = 'active'$q$ INTO v USING p_scenario_id;
  EXCEPTION WHEN undefined_column OR undefined_table OR invalid_text_representation THEN v := '[]'::jsonb;
  END;
  RETURN coalesce(v, '[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION prediction.psq_linked_assumptions(p_scenario_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF to_regclass('prediction.scenario_assumptions') IS NULL THEN RETURN '[]'::jsonb; END IF;
  BEGIN
    EXECUTE $q$SELECT coalesce(jsonb_agg(jsonb_build_object('branch_id', a.branch_id, 'assumption_id', a.assumption_id, 'critical', a.critical) ORDER BY a.assumption_id), '[]'::jsonb)
                 FROM prediction.scenario_assumptions a WHERE a.scenario_id = $1 AND a.state = 'linked'$q$ INTO v USING p_scenario_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v := '[]'::jsonb;
  END;
  RETURN coalesce(v, '[]'::jsonb);
END $$;
/* §S's plurality requirement when §S is present: the kinds every ACTIVE set holding the scenario requires (to_regclass). */
CREATE OR REPLACE FUNCTION prediction.psq_set_requirements(p_scenario_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v text[];
BEGIN
  IF to_regclass('prediction.scenario_sets') IS NULL OR to_regclass('prediction.scenario_set_members') IS NULL THEN RETURN '{}'::text[]; END IF;
  BEGIN
    EXECUTE $q$SELECT coalesce(array_agg(DISTINCT k ORDER BY k), '{}'::text[])
                 FROM prediction.scenario_sets s JOIN prediction.scenario_set_members m ON m.set_id = s.set_id,
                      jsonb_array_elements_text(coalesce(s.plurality_policy -> 'require', '[]'::jsonb)) k
                WHERE m.scenario_id = $1 AND m.removed_at IS NULL AND s.state = 'active'$q$ INTO v USING p_scenario_id;
  EXCEPTION WHEN undefined_column OR undefined_table OR invalid_parameter_value THEN v := '{}'::text[];
  END;
  RETURN coalesce(v, '{}'::text[]);
END $$;
GRANT EXECUTE ON FUNCTION prediction.psq_elements(uuid) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.psq_linked_assumptions(uuid) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.psq_set_requirements(uuid) TO eye_app, eye_commit;

/* THE INDICATOR FRESHNESS of each branch of a scenario (the rule stated in the header), as of the database's instant:
   [{branch_id, name, kind, branch_state, live, indicator_id, series_key, state fresh|awaiting|stale|missing|not_required, last_observation_at,
     cadence_days, max_age_days, age_days, reason}]. */
CREATE OR REPLACE FUNCTION prediction.psq_freshness(p_scenario_id uuid, p_rule jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  WITH b AS (
    SELECT x.branch_id, x.name, x.kind, x.state, prediction.branch_live(x.state) AS live, x.indicator_id, i.series_key, i.state AS indicator_state, i.expires_at, i.last_observation_at,
           i.defined_at, i.consecutive_days, coalesce(sr.seasonality_days, 1) AS step,
           (x.kind = ANY (ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'indicator_required_kinds')))) AS needs,
           (p_rule -> 'params' ->> 'freshness_grace_days')::int AS grace, (clock_timestamp())::date AS today
      FROM prediction.branches_current x
      LEFT JOIN prediction.indicators_current i ON i.indicator_id = x.indicator_id
      LEFT JOIN prediction.series_registry sr ON sr.tenant_id = i.tenant_id AND sr.domain_id = i.domain_id AND sr.series_key = i.series_key
     WHERE x.scenario_id = p_scenario_id AND x.state <> 'closed'),
  c AS (
    SELECT b.*, b.consecutive_days * b.step AS cadence_days, b.consecutive_days * b.step + b.grace AS max_age_days,
           CASE WHEN b.last_observation_at IS NOT NULL THEN b.today - b.last_observation_at WHEN b.defined_at IS NOT NULL THEN b.today - b.defined_at::date END AS age_days
      FROM b)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'branch_id', c.branch_id, 'name', c.name, 'kind', c.kind, 'branch_state', c.state, 'live', c.live, 'indicator_id', c.indicator_id, 'series_key', c.series_key,
           'last_observation_at', c.last_observation_at, 'cadence_days', c.cadence_days, 'max_age_days', c.max_age_days, 'age_days', c.age_days,
           'state', CASE WHEN c.indicator_id IS NULL THEN CASE WHEN c.needs THEN 'missing' ELSE 'not_required' END
                         WHEN c.indicator_state = 'retired' OR (c.expires_at IS NOT NULL AND c.expires_at < clock_timestamp()) THEN 'missing'
                         WHEN c.age_days > c.max_age_days THEN 'stale'
                         WHEN c.last_observation_at IS NULL THEN 'awaiting'
                         ELSE 'fresh' END,
           'reason', CASE WHEN c.indicator_id IS NULL THEN CASE WHEN c.needs THEN format('branch "%s" (%s) names no indicator; a %s branch needs a signpost to be watched', c.name, c.kind, c.kind) ELSE format('a %s branch needs no signpost', c.kind) END
                          WHEN c.indicator_state = 'retired' THEN format('indicator %s (%s) of "%s" is retired', c.indicator_id, c.series_key, c.name)
                          WHEN c.expires_at IS NOT NULL AND c.expires_at < clock_timestamp() THEN format('indicator %s (%s) of "%s" expired at %s', c.indicator_id, c.series_key, c.name, c.expires_at)
                          WHEN c.age_days > c.max_age_days AND c.last_observation_at IS NULL THEN format('indicator %s (%s) of "%s" was defined %s days ago and has never been observed (cadence %s days + %s days grace)', c.indicator_id, c.series_key, c.name, c.age_days, c.cadence_days, c.grace)
                          WHEN c.age_days > c.max_age_days THEN format('indicator %s (%s) of "%s" was last observed %s, %s days ago (cadence %s days + %s days grace)', c.indicator_id, c.series_key, c.name, c.last_observation_at, c.age_days, c.cadence_days, c.grace)
                          WHEN c.last_observation_at IS NULL THEN format('indicator %s (%s) of "%s" is awaiting its first observation (defined %s days ago)', c.indicator_id, c.series_key, c.name, c.age_days)
                          ELSE format('indicator %s (%s) of "%s" was last observed %s (%s days; within %s)', c.indicator_id, c.series_key, c.name, c.last_observation_at, c.age_days, c.max_age_days) END)
         ORDER BY c.name, c.branch_id), '[]'::jsonb)
    FROM c $$;
GRANT EXECUTE ON FUNCTION prediction.psq_freshness(uuid, jsonb) TO eye_app, eye_commit;

/* THE COMPUTATION of the measures and findings of a scenario under a rule, as of the database's instant (a pure read; the evaluation
   port records it, the read shows it live). Returns {measures, findings, outcome, fingerprint, freshness_key}. */
CREATE OR REPLACE FUNCTION prediction.scenario_quality_compute(p_scenario_id uuid, p_rule jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s record; v_findings jsonb := '[]'::jsonb; v_elements jsonb := prediction.psq_elements(p_scenario_id); v_links jsonb := prediction.psq_linked_assumptions(p_scenario_id);
        v_fresh jsonb := prediction.psq_freshness(p_scenario_id, p_rule); v_threshold numeric := (p_rule -> 'params' ->> 'wording_overlap_threshold')::numeric;
        x record; y record; f jsonb; a jsonb; a2 jsonb; e jsonb; d jsonb; v_live int; v_suspended int; v_with_assumption int; v_kinds int; v_indicators int; v_with_indicator int;
        v_present text[]; v_required text[]; v_missing text[]; v_cov jsonb; v_adverse text[]; v_benign text[]; v_n_adv int; v_n_ben int; v_bias text;
        v_groups jsonb; v_b jsonb; v_fp text[]; v_fkey text[]; v_outcome text; v_ov numeric; v_from timestamptz; v_until timestamptz; v_dep_from timestamptz; v_distinct_thresholds int; v_nonbase int;
BEGIN
  SELECT sc.scenario_id, sc.title, sc.state, sc.owner_principal_id, sc.next_review_due_at, sc.current_version INTO s FROM prediction.scenarios_current sc WHERE sc.scenario_id = p_scenario_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- the live branches (open | flipped), each with its normalised statement, divergence, assumptions, links, elements and indicator threshold
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'branch_id', bx.branch_id, 'name', bx.name, 'kind', bx.kind,
           'tokens', to_jsonb(prediction.psq_tokens(bx.statement, p_rule)),
           'divergence', to_jsonb(prediction.psq_tokens(bx.divergence, p_rule)),
           'assumptions', to_jsonb(ARRAY(SELECT array_to_string(prediction.psq_tokens(q ->> 'statement', p_rule), ' ') FROM jsonb_array_elements(coalesce(bx.assumptions, '[]'::jsonb)) q ORDER BY 1)),
           'raw_assumptions', coalesce(bx.assumptions, '[]'::jsonb),
           'linked', to_jsonb(ARRAY(SELECT l ->> 'assumption_id' FROM jsonb_array_elements(v_links) l WHERE (l ->> 'branch_id') = bx.branch_id::text ORDER BY 1)),
           'elements', to_jsonb(ARRAY(SELECT (el ->> 'kind') || ':' || lower(btrim(el ->> 'name')) FROM jsonb_array_elements(v_elements) el WHERE (el ->> 'branch_id') = bx.branch_id::text ORDER BY 1)),
           'indicator_id', bx.indicator_id,
           'signature', (SELECT i.series_key || ' ' || i.comparator || ' ' || i.threshold::text FROM prediction.indicators_current i WHERE i.indicator_id = bx.indicator_id))
         ORDER BY bx.name, bx.branch_id), '[]'::jsonb)
    INTO v_b FROM prediction.branches_current bx WHERE bx.scenario_id = p_scenario_id AND prediction.branch_live(bx.state);
  v_live := jsonb_array_length(v_b);
  SELECT count(*) INTO v_suspended FROM prediction.branches_current bx WHERE bx.scenario_id = p_scenario_id AND bx.state = 'suspended';

  -- (1) DISTINCTIVENESS: the same assumptions, elements, indicator and divergence; statements differing only in wording
  FOR x IN SELECT p ->> 'branch_id' AS a_id, p ->> 'name' AS a_name, q ->> 'branch_id' AS b_id, q ->> 'name' AS b_name,
                  prediction.psq_overlap(ARRAY(SELECT jsonb_array_elements_text(p -> 'tokens')), ARRAY(SELECT jsonb_array_elements_text(q -> 'tokens'))) AS ov
             FROM jsonb_array_elements(v_b) p JOIN jsonb_array_elements(v_b) q ON (q ->> 'branch_id') > (p ->> 'branch_id')
            WHERE p -> 'assumptions' = q -> 'assumptions' AND p -> 'linked' = q -> 'linked' AND p -> 'elements' = q -> 'elements'
              AND (p ->> 'indicator_id') IS NOT DISTINCT FROM (q ->> 'indicator_id') AND p -> 'divergence' = q -> 'divergence'
            ORDER BY p ->> 'name', q ->> 'name' LOOP
    IF x.ov >= v_threshold THEN
      v_findings := v_findings || jsonb_build_object('rule', 'indistinct_branches', 'outcome', 'fail', 'branch_ids', jsonb_build_array(x.a_id, x.b_id),
        'detail', format('branches "%s" and "%s" share their assumptions, elements, indicator and divergence, and their statements overlap %s (threshold %s): they differ only in wording', x.a_name, x.b_name, x.ov, v_threshold),
        'overlap', x.ov);
    END IF;
  END LOOP;

  -- (2) COLLAPSE: every live non-baseline branch (at least two) rests on one indicator threshold
  SELECT count(*), count(DISTINCT coalesce(l ->> 'signature', 'none:' || (l ->> 'branch_id'))) INTO v_nonbase, v_distinct_thresholds FROM jsonb_array_elements(v_b) l WHERE l ->> 'kind' <> 'baseline';
  IF v_nonbase >= 2 AND v_distinct_thresholds = 1 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_b) l WHERE l ->> 'kind' <> 'baseline' AND l ->> 'signature' IS NULL) THEN
    v_findings := v_findings || jsonb_build_object('rule', 'collapse_to_one_forecast', 'outcome', 'fail',
      'branch_ids', (SELECT jsonb_agg(l -> 'branch_id') FROM jsonb_array_elements(v_b) l WHERE l ->> 'kind' <> 'baseline'),
      'detail', format('all %s live branches beside the baseline rest on one indicator threshold (%s): the tree collapses to one forecast', v_nonbase, (SELECT min(l ->> 'signature') FROM jsonb_array_elements(v_b) l WHERE l ->> 'kind' <> 'baseline')));
  END IF;

  -- (3) PROHIBITED CONTRADICTION: within a branch's assumptions; against a scenario-level element
  FOR x IN SELECT l ->> 'branch_id' AS branch_id, l ->> 'name' AS name, l -> 'raw_assumptions' AS raw_assumptions FROM jsonb_array_elements(v_b) l ORDER BY l ->> 'name' LOOP
    FOR a IN SELECT q FROM jsonb_array_elements(x.raw_assumptions) WITH ORDINALITY t(q, n) ORDER BY n LOOP
      FOR a2 IN SELECT q FROM jsonb_array_elements(x.raw_assumptions) WITH ORDINALITY t(q, n) ORDER BY n LOOP
        IF (a ->> 'statement') < (a2 ->> 'statement') AND prediction.psq_contradicts(a ->> 'statement', a2 ->> 'statement', p_rule) THEN
          v_findings := v_findings || jsonb_build_object('rule', 'prohibited_contradiction', 'outcome', 'fail', 'branch_ids', jsonb_build_array(x.branch_id),
            'detail', format('branch "%s" assumes both "%s" and "%s"', x.name, left(a ->> 'statement', 160), left(a2 ->> 'statement', 160)));
        END IF;
      END LOOP;
      FOR e IN SELECT el FROM jsonb_array_elements(v_elements) el WHERE (el ->> 'branch_id') IS NULL ORDER BY el ->> 'name' LOOP
        IF prediction.psq_contradicts(a ->> 'statement', coalesce(e ->> 'description', e ->> 'name'), p_rule) THEN
          v_findings := v_findings || jsonb_build_object('rule', 'prohibited_contradiction', 'outcome', 'fail', 'branch_ids', jsonb_build_array(x.branch_id), 'element_id', e ->> 'element_id',
            'detail', format('branch "%s" assumes "%s", contradicting the scenario-level %s "%s"', x.name, left(a ->> 'statement', 160), e ->> 'kind', e ->> 'name'));
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- (4) TEMPORAL ORDERING of elements with timing attributes (§A): from after until; a dependency starting after the element it causes
  FOR e IN SELECT el FROM jsonb_array_elements(v_elements) el ORDER BY el ->> 'name' LOOP
    BEGIN
      v_from := NULLIF(coalesce(e -> 'attributes' -> 'timing' ->> 'start', e -> 'attributes' -> 'timing' ->> 'from'), '')::timestamptz; v_until := NULLIF(coalesce(e -> 'attributes' -> 'timing' ->> 'end', e -> 'attributes' -> 'timing' ->> 'until'), '')::timestamptz; -- §I: §A's keys are start/end (from/until accepted)
    EXCEPTION WHEN OTHERS THEN v_from := NULL; v_until := NULL;
    END;
    IF v_from IS NOT NULL AND v_until IS NOT NULL AND v_from > v_until THEN
      v_findings := v_findings || jsonb_build_object('rule', 'element_temporal_order', 'outcome', 'fail', 'branch_ids', CASE WHEN e ->> 'branch_id' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(e ->> 'branch_id') END,
        'element_id', e ->> 'element_id', 'detail', format('%s "%s" is timed from %s until %s: it ends before it begins', e ->> 'kind', e ->> 'name', v_from, v_until));
    END IF;
    IF v_from IS NOT NULL AND jsonb_typeof(e -> 'attributes' -> 'dependencies') = 'array' THEN
      FOR d IN SELECT el2 FROM jsonb_array_elements(v_elements) el2 WHERE (el2 ->> 'element_id') IN (SELECT jsonb_array_elements_text(e -> 'attributes' -> 'dependencies')) ORDER BY el2 ->> 'name' LOOP
        BEGIN v_dep_from := NULLIF(coalesce(d -> 'attributes' -> 'timing' ->> 'start', d -> 'attributes' -> 'timing' ->> 'from'), '')::timestamptz; EXCEPTION WHEN OTHERS THEN v_dep_from := NULL; END;
        IF v_dep_from IS NOT NULL AND v_dep_from > v_from THEN
          v_findings := v_findings || jsonb_build_object('rule', 'element_temporal_order', 'outcome', 'fail', 'branch_ids', CASE WHEN e ->> 'branch_id' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(e ->> 'branch_id') END,
            'element_id', e ->> 'element_id', 'detail', format('%s "%s" (from %s) depends on %s "%s", which begins later (%s): the effect precedes its cause', e ->> 'kind', e ->> 'name', v_from, d ->> 'kind', d ->> 'name', v_dep_from));
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- (5) INDICATOR FRESHNESS: missing and stale named (live branches only; a suspended branch is shown, not judged)
  FOR f IN SELECT q FROM jsonb_array_elements(v_fresh) q WHERE (q ->> 'live')::boolean AND (q ->> 'state') IN ('missing', 'stale') ORDER BY q ->> 'name' LOOP
    v_findings := v_findings || jsonb_build_object('rule', 'indicator_' || (f ->> 'state'), 'outcome', 'fail', 'branch_ids', jsonb_build_array(f ->> 'branch_id'), 'indicator_id', f -> 'indicator_id', 'detail', f ->> 'reason');
  END LOOP;

  -- (6) COVERAGE (a note): baseline / adverse / stress, and the plurality a set holding the scenario requires (§S)
  SELECT coalesce(array_agg(DISTINCT l ->> 'kind' ORDER BY l ->> 'kind'), '{}'::text[]) INTO v_present FROM jsonb_array_elements(v_b) l;
  v_missing := '{}'::text[];
  FOR x IN SELECT k.key AS cat, ARRAY(SELECT jsonb_array_elements_text(k.value)) AS kinds FROM jsonb_each(p_rule -> 'params' -> 'coverage') k ORDER BY k.key LOOP
    IF NOT (x.kinds && v_present) THEN v_missing := v_missing || x.cat; END IF;
  END LOOP;
  v_required := prediction.psq_set_requirements(p_scenario_id);
  v_missing := v_missing || ARRAY(SELECT r FROM unnest(v_required) r WHERE NOT (r = ANY (v_present)) AND NOT (r = ANY (v_missing)) ORDER BY r);
  v_cov := jsonb_build_object('present', to_jsonb(v_present), 'missing', to_jsonb(v_missing), 'set_requires', to_jsonb(v_required));
  IF cardinality(v_missing) > 0 THEN
    v_findings := v_findings || jsonb_build_object('rule', 'coverage', 'outcome', 'note', 'branch_ids', '[]'::jsonb, 'missing', to_jsonb(v_missing),
      'detail', format('the live branches cover %s; missing: %s', CASE WHEN cardinality(v_present) = 0 THEN 'no kind' ELSE array_to_string(v_present, ', ') END, array_to_string(v_missing, ', ')));
  END IF;

  -- (7) BIAS (a note): all adverse, or all benign
  v_adverse := ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'bias' -> 'adverse')); v_benign := ARRAY(SELECT jsonb_array_elements_text(p_rule -> 'params' -> 'bias' -> 'benign'));
  SELECT count(*) FILTER (WHERE (l ->> 'kind') = ANY (v_adverse)), count(*) FILTER (WHERE (l ->> 'kind') = ANY (v_benign)) INTO v_n_adv, v_n_ben FROM jsonb_array_elements(v_b) l;
  v_bias := CASE WHEN v_n_adv >= (p_rule -> 'params' -> 'bias' ->> 'min_branches')::int AND v_n_ben = 0 THEN 'all_adverse'
                 WHEN v_n_ben >= (p_rule -> 'params' -> 'bias' ->> 'min_branches')::int AND v_n_adv = 0 THEN 'all_benign' END;
  IF v_bias IS NOT NULL THEN
    v_findings := v_findings || jsonb_build_object('rule', 'bias', 'outcome', 'note', 'branch_ids', (SELECT jsonb_agg(l -> 'branch_id') FROM jsonb_array_elements(v_b) l WHERE (l ->> 'kind') = ANY (v_adverse || v_benign)), 'bias', v_bias,
      'detail', CASE v_bias WHEN 'all_adverse' THEN format('all %s classified branches are adverse; no benign branch is considered', v_n_adv) ELSE format('all %s classified branches are benign; no adverse branch is considered', v_n_ben) END);
  END IF;

  -- (8) SIGNPOST DISCRIMINATION (a note): live branches sharing one indicator cannot be told apart by it
  SELECT coalesce(jsonb_agg(jsonb_build_object('indicator_id', g.indicator_id, 'branch_ids', g.ids) ORDER BY g.indicator_id), '[]'::jsonb) INTO v_groups
    FROM (SELECT l ->> 'indicator_id' AS indicator_id, jsonb_agg(l -> 'branch_id') AS ids FROM jsonb_array_elements(v_b) l WHERE l ->> 'indicator_id' IS NOT NULL GROUP BY l ->> 'indicator_id' HAVING count(*) > 1) g;
  FOR d IN SELECT q FROM jsonb_array_elements(v_groups) q LOOP
    v_findings := v_findings || jsonb_build_object('rule', 'signpost_shared', 'outcome', 'note', 'branch_ids', d -> 'branch_ids', 'indicator_id', d -> 'indicator_id',
      'detail', format('%s live branches watch the same indicator %s: its movement does not discriminate between them', jsonb_array_length(d -> 'branch_ids'), d ->> 'indicator_id'));
  END LOOP;

  -- (9) REVIEW TIMELINESS (a note)
  IF s.next_review_due_at IS NOT NULL AND s.next_review_due_at < clock_timestamp() THEN
    v_findings := v_findings || jsonb_build_object('rule', 'review_overdue', 'outcome', 'note', 'branch_ids', '[]'::jsonb,
      'detail', format('the scenario''s review was due %s (%s days ago)', s.next_review_due_at, (clock_timestamp()::date - s.next_review_due_at::date)));
  END IF;

  -- THE MEASURES
  SELECT count(*) FILTER (WHERE jsonb_array_length(l -> 'assumptions') > 0 OR jsonb_array_length(l -> 'linked') > 0), count(DISTINCT l ->> 'kind'), count(DISTINCT l ->> 'indicator_id'),
         count(*) FILTER (WHERE l ->> 'indicator_id' IS NOT NULL)
    INTO v_with_assumption, v_kinds, v_indicators, v_with_indicator FROM jsonb_array_elements(v_b) l;
  SELECT coalesce(array_agg(DISTINCT (q ->> 'rule') || ':' || coalesce((SELECT string_agg(b, ',' ORDER BY b) FROM jsonb_array_elements_text(q -> 'branch_ids') b), '') ORDER BY (q ->> 'rule') || ':' || coalesce((SELECT string_agg(b, ',' ORDER BY b) FROM jsonb_array_elements_text(q -> 'branch_ids') b), '')), '{}'::text[])
    INTO v_fp FROM jsonb_array_elements(v_findings) q WHERE q ->> 'outcome' = 'fail';
  SELECT coalesce(array_agg((q ->> 'branch_id') || ':' || (q ->> 'state') ORDER BY q ->> 'branch_id'), '{}'::text[]) INTO v_fkey FROM jsonb_array_elements(v_fresh) q;
  v_outcome := CASE WHEN cardinality(v_fp) > 0 THEN 'failed' ELSE 'passed' END;
  RETURN jsonb_build_object(
    'scenario_id', s.scenario_id, 'scenario_version', s.current_version, 'rule_version', p_rule ->> 'version', 'outcome', v_outcome, 'findings', v_findings,
    'fingerprint', to_jsonb(v_fp), 'freshness_key', to_jsonb(v_fkey), 'at', clock_timestamp(),
    'measures', jsonb_build_object(
      'live_branches', v_live, 'suspended_branches', v_suspended,
      'assumption_coverage', jsonb_build_object('with_assumption', v_with_assumption, 'live', v_live, 'ratio', CASE WHEN v_live = 0 THEN NULL ELSE round(v_with_assumption::numeric / v_live, 4) END),
      'branch_diversity', jsonb_build_object('kinds', v_kinds, 'live', v_live, 'ratio', CASE WHEN v_live = 0 THEN NULL ELSE round(v_kinds::numeric / v_live, 4) END),
      'indicator_freshness', v_fresh,
      'indicators', jsonb_build_object('missing', (SELECT count(*) FROM jsonb_array_elements(v_fresh) q WHERE (q ->> 'live')::boolean AND q ->> 'state' = 'missing'),
                                       'stale', (SELECT count(*) FROM jsonb_array_elements(v_fresh) q WHERE (q ->> 'live')::boolean AND q ->> 'state' = 'stale')),
      'signpost_discrimination', jsonb_build_object('distinct_indicators', v_indicators, 'branches_with_indicator', v_with_indicator,
                                                    'ratio', CASE WHEN v_with_indicator = 0 THEN NULL ELSE round(v_indicators::numeric / v_with_indicator, 4) END, 'shared', v_groups),
      'coverage', v_cov, 'bias', v_bias,
      'review_timeliness', jsonb_build_object('next_review_due_at', s.next_review_due_at, 'overdue', s.next_review_due_at IS NOT NULL AND s.next_review_due_at < clock_timestamp()),
      'elements_read', to_regclass('prediction.scenario_elements') IS NOT NULL, 'elements', jsonb_array_length(v_elements)));
END $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_quality_compute(uuid, jsonb) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §Q.4 THE PORTS
-- ═════════════════════════════════════════════════════════════════════
/* THE RECORDING (private; called by the evaluation port and the tick's sweep, never a port itself — no authority is asserted here and no
   scenario row is locked): the evaluation row, scenario.quality_evaluated, and — on a NEW failure (failed, and a failing set other than the
   prior evaluation's) — the owner's attention item of class scenario.quality (the 0095 idiom), once. */
CREATE OR REPLACE FUNCTION prediction.psq_record_evaluation(p_evaluation_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_trigger text, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS jsonb SET search_path = prediction, executive, identity, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; r jsonb := prediction.scenario_quality_rule(); c jsonb; prev prediction.scenario_quality_evaluations%ROWTYPE; v_fp text[]; v_fkey text[];
        v_new boolean; v_item uuid; v_state text; v_title text; v_reasons jsonb; v_fails jsonb;
BEGIN
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id;
  c := prediction.scenario_quality_compute(p_scenario_id, r);
  SELECT * INTO prev FROM prediction.scenario_quality_evaluations x WHERE x.scenario_id = p_scenario_id ORDER BY x.evaluated_at DESC, x.evaluation_id DESC LIMIT 1;
  v_fp := ARRAY(SELECT jsonb_array_elements_text(c -> 'fingerprint')); v_fkey := ARRAY(SELECT jsonb_array_elements_text(c -> 'freshness_key'));
  v_new := (c ->> 'outcome') = 'failed' AND (prev.evaluation_id IS NULL OR prev.outcome <> 'failed' OR prev.fingerprint IS DISTINCT FROM v_fp);
  IF v_new THEN
    v_item := gen_random_uuid();
    SELECT coalesce(jsonb_agg(q ->> 'detail'), '[]'::jsonb), coalesce(jsonb_agg(q), '[]'::jsonb) INTO v_reasons, v_fails FROM jsonb_array_elements(c -> 'findings') q WHERE q ->> 'outcome' = 'fail';
    v_state := CASE WHEN EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = s.owner_principal_id AND p.kind = 'human' AND p.status = 'active') THEN 'open' ELSE 'unrouted' END;
    v_title := left(format('Scenario quality failed: %s (%s)', s.title, (SELECT string_agg(DISTINCT q ->> 'rule', ', ') FROM jsonb_array_elements(v_fails) q)), 512);
  END IF;
  INSERT INTO prediction.scenario_quality_evaluations (evaluation_id, scope, tenant_id, domain_id, scenario_id, scenario_version, rule_version, trigger, measures, findings, outcome, prior_outcome,
                                                       fingerprint, freshness_key, new_failure, attention_item_id, evaluated_by, correlation_id)
  VALUES (p_evaluation_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, (c ->> 'scenario_version')::int, r ->> 'version', p_trigger, c -> 'measures', c -> 'findings', c ->> 'outcome', prev.outcome,
          v_fp, v_fkey, v_new, v_item, p_actor, p_correlation);
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.quality_evaluated', p_actor,
          jsonb_build_object('evaluation_id', p_evaluation_id, 'outcome', c ->> 'outcome', 'prior_outcome', prev.outcome, 'new_failure', v_new, 'trigger', p_trigger, 'rule_version', r ->> 'version',
                             'fail', (SELECT count(*) FROM jsonb_array_elements(c -> 'findings') q WHERE q ->> 'outcome' = 'fail'), 'findings', jsonb_array_length(c -> 'findings'), 'attention_item_id', v_item), p_correlation);
  IF v_new THEN
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'scenario.quality', 'scenario', p_scenario_id, p_event_id, 'scenario.quality_evaluated', v_title, 'material', v_state, s.owner_principal_id, '{}',
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
            jsonb_build_object('evaluation_id', p_evaluation_id, 'scenario_id', p_scenario_id, 'scenario_version', (c ->> 'scenario_version')::int, 'rule_version', r ->> 'version', 'trigger', p_trigger,
                               'findings', v_fails, 'decision_active', false),
            clock_timestamp() + interval '72 hours', 0, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
              jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', s.owner_principal_id, 'route_roles', '[]'::jsonb, 'due_at', clock_timestamp() + interval '72 hours',
                                 'cause_event_id', p_event_id, 'cause_event_type', 'scenario.quality_evaluated', 'unrouted', v_state = 'unrouted', 'scenario_id', p_scenario_id), p_correlation);
  END IF;
  RETURN jsonb_build_object('evaluation_id', p_evaluation_id, 'scenario_id', p_scenario_id, 'title', s.title, 'owner', s.owner_principal_id, 'trigger', p_trigger, 'prior_outcome', prev.outcome,
                            'new_failure', v_new, 'attention_item_id', v_item) || (c - 'fingerprint' - 'freshness_key');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.psq_record_evaluation(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;

/* EVALUATE (prediction.scenario.quality.evaluate): a PERSON's evaluation of an active scenario — recorded whatever the outcome; the trigger
   names what prompted it (declare | branch | operator; the tick has its own sweep). The acting principal records it. */
CREATE OR REPLACE FUNCTION prediction.evaluate_scenario_quality(
  p_evaluation_id uuid, p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_trigger text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.quality.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario quality rejected (actor): an evaluation is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_trigger IS NULL OR p_trigger NOT IN ('declare', 'branch', 'operator') THEN
    RAISE EXCEPTION 'scenario quality rejected (trigger): a person''s evaluation is prompted by declare, branch or operator (the tick evaluates under its own step)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario quality rejected (unknown_scenario): % is not a scenario of this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'scenario quality rejected (state): scenario % is %; only an active scenario is evaluated (declare a successor)', p_scenario_id, s.state USING ERRCODE = '22023'; END IF;
  RETURN prediction.psq_record_evaluation(p_evaluation_id, p_tenant, p_domain, p_scenario_id, p_trigger, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.evaluate_scenario_quality(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.evaluate_scenario_quality(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* THE SWEEP (executive.attention.tick — the step `scenario-quality`, order 68): every ACTIVE scenario of the domain that has been evaluated
   at least once (a person opted it in; the tick never evaluates a scenario nobody evaluated — the older suites' event logs stay as pinned)
   and whose SCN version changed since, or whose branches' indicator states (fresh / awaiting / stale / missing) changed since, is evaluated
   again with trigger `tick` under the attention agent; a NEW failure raises scenario.quality to the owner once. */
CREATE OR REPLACE FUNCTION prediction.sweep_scenario_quality(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x record; r jsonb := prediction.scenario_quality_rule(); v_key text[]; v_res jsonb; v_out jsonb := '[]'::jsonb; v_seen int := 0; v_eval int := 0; v_new int := 0; v_reason text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR x IN SELECT sc.scenario_id, sc.current_version, e.scenario_version AS last_version, e.freshness_key AS last_key
             FROM prediction.scenarios_current sc
             JOIN LATERAL (SELECT q.scenario_version, q.freshness_key FROM prediction.scenario_quality_evaluations q WHERE q.scenario_id = sc.scenario_id ORDER BY q.evaluated_at DESC, q.evaluation_id DESC LIMIT 1) e ON true
            WHERE sc.tenant_id = p_tenant AND sc.domain_id = p_domain AND sc.state = 'active' ORDER BY sc.declared_at, sc.scenario_id LOOP
    v_seen := v_seen + 1;
    SELECT coalesce(array_agg((q ->> 'branch_id') || ':' || (q ->> 'state') ORDER BY q ->> 'branch_id'), '{}'::text[]) INTO v_key FROM jsonb_array_elements(prediction.psq_freshness(x.scenario_id, r)) q;
    v_reason := CASE WHEN x.current_version IS DISTINCT FROM x.last_version THEN 'version' WHEN v_key IS DISTINCT FROM x.last_key THEN 'freshness' END;
    IF v_reason IS NULL THEN CONTINUE; END IF;
    v_res := prediction.psq_record_evaluation(gen_random_uuid(), p_tenant, p_domain, x.scenario_id, 'tick', p_actor, gen_random_uuid(), p_correlation);
    v_eval := v_eval + 1;
    IF (v_res ->> 'new_failure')::boolean THEN v_new := v_new + 1; END IF;
    v_out := v_out || jsonb_build_object('scenario_id', x.scenario_id, 'reason', v_reason, 'outcome', v_res ->> 'outcome', 'new_failure', (v_res ->> 'new_failure')::boolean, 'attention_item_id', v_res -> 'attention_item_id');
  END LOOP;
  RETURN jsonb_build_object('considered', v_seen, 'evaluated', v_eval, 'new_failures', v_new, 'scenarios', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.sweep_scenario_quality(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.sweep_scenario_quality(uuid,uuid,uuid,uuid) TO eye_commit;

/* DECLARE A FREQUENCY-TO-PROBABILITY MAP (prediction.scenario.probability.map): a named human's act; the owner a named, active human of
   the tenant (default: the declarer). Bands: [{frequency_label, min_per_year, max_per_year (null = unbounded, last band only),
   probability_low, probability_high}] — contiguous (each band's min is the previous band's max), ascending, starting at 0, lows and highs
   non-decreasing, low ≤ high, all in [0, 1]. A name already declared → its next version (the prior superseded). */
CREATE OR REPLACE FUNCTION prediction.declare_frequency_map(
  p_map_id uuid, p_tenant uuid, p_domain uuid, p_name text, p_horizon text, p_bands jsonb, p_owner uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b jsonb; n int := 0; v_prev_max numeric; v_prev_low numeric := 0; v_prev_high numeric := 0; v_min numeric; v_max numeric; v_low numeric; v_high numeric; v_prior prediction.frequency_probability_maps%ROWTYPE;
        v_version int := 1; v_owner uuid := coalesce(p_owner, p_actor); m prediction.frequency_probability_maps%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.probability.map']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'frequency map rejected (actor): a map is declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'frequency map rejected (authority): a map is declared by a named, active human' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v_owner AND p.kind = 'human' AND p.status = 'active' AND p.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'frequency map rejected (unknown_owner): the owner % is not a named, active human of this tenant', v_owner USING ERRCODE = '23503';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 3 AND 128 THEN RAISE EXCEPTION 'frequency map rejected (name): a map is named (3 to 128 characters)' USING ERRCODE = '22023'; END IF;
  IF p_horizon IS NULL OR length(btrim(p_horizon)) NOT BETWEEN 2 AND 64 THEN RAISE EXCEPTION 'frequency map rejected (horizon): a map names the window its probabilities speak of (2 to 64 characters)' USING ERRCODE = '22023'; END IF;
  IF p_bands IS NULL OR coalesce(jsonb_typeof(p_bands), 'absent') <> 'array' OR jsonb_array_length(p_bands) = 0 THEN RAISE EXCEPTION 'frequency map rejected (bands): a map has at least one band' USING ERRCODE = '22023'; END IF;
  FOR b IN SELECT x FROM jsonb_array_elements(p_bands) x LOOP
    n := n + 1;
    IF coalesce(jsonb_typeof(b), 'absent') <> 'object' OR coalesce(jsonb_typeof(b -> 'frequency_label'), 'absent') <> 'string' OR length(btrim(b ->> 'frequency_label')) < 2 OR coalesce(jsonb_typeof(b -> 'min_per_year'), 'absent') <> 'number'
       OR (b ? 'max_per_year' AND coalesce(jsonb_typeof(b -> 'max_per_year'), 'absent') NOT IN ('number', 'null')) OR coalesce(jsonb_typeof(b -> 'probability_low'), 'absent') <> 'number' OR coalesce(jsonb_typeof(b -> 'probability_high'), 'absent') <> 'number' THEN
      RAISE EXCEPTION 'frequency map rejected (bands): band % names a frequency_label, min_per_year, max_per_year (a number, or null for the last band) and probability_low / probability_high', n USING ERRCODE = '22023';
    END IF;
    v_min := (b ->> 'min_per_year')::numeric; v_max := (b ->> 'max_per_year')::numeric; v_low := (b ->> 'probability_low')::numeric; v_high := (b ->> 'probability_high')::numeric;
    IF (n = 1 AND v_min <> 0) OR (n > 1 AND v_min IS DISTINCT FROM v_prev_max) THEN
      RAISE EXCEPTION 'frequency map rejected (bands): band % starts at % per year; the bands are contiguous from 0 (each starts where the previous ends)', n, v_min USING ERRCODE = '22023';
    END IF;
    IF v_max IS NULL AND n < jsonb_array_length(p_bands) THEN RAISE EXCEPTION 'frequency map rejected (bands): only the last band is unbounded' USING ERRCODE = '22023'; END IF;
    IF v_max IS NOT NULL AND v_max <= v_min THEN RAISE EXCEPTION 'frequency map rejected (bands): band % ends (%) at or before it starts (%)', n, v_max, v_min USING ERRCODE = '22023'; END IF;
    IF v_low < 0 OR v_high > 1 OR v_low > v_high THEN RAISE EXCEPTION 'frequency map rejected (bands): band % maps to [%, %]; a probability band lies in [0, 1] with low ≤ high', n, v_low, v_high USING ERRCODE = '22023'; END IF;
    IF v_low < v_prev_low OR v_high < v_prev_high THEN RAISE EXCEPTION 'frequency map rejected (bands): band % maps a higher frequency to a lower probability than band %', n, n - 1 USING ERRCODE = '22023'; END IF;
    v_prev_max := v_max; v_prev_low := v_low; v_prev_high := v_high;
  END LOOP;
  SELECT * INTO v_prior FROM prediction.frequency_probability_maps x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.name = btrim(p_name) AND x.state = 'active' FOR UPDATE;
  IF FOUND THEN
    v_version := v_prior.version + 1;
    UPDATE prediction.frequency_probability_maps SET state = 'superseded', superseded_at = clock_timestamp() WHERE map_id = v_prior.map_id;
  END IF;
  INSERT INTO prediction.frequency_probability_maps (map_id, scope, tenant_id, domain_id, name, version, bands, horizon, owner_principal_id, supersedes, declared_by, correlation_id)
  VALUES (p_map_id, 'DOMAIN', p_tenant, p_domain, btrim(p_name), v_version, p_bands, btrim(p_horizon), v_owner, v_prior.map_id, p_actor, p_correlation) RETURNING * INTO m;
  RETURN to_jsonb(m) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_frequency_map(uuid,uuid,uuid,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_frequency_map(uuid,uuid,uuid,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* SET A BRANCH PROBABILITY (prediction.scenario.probability.set): a NAMED HUMAN's act — the scenario's owner, the branch's owner, or a domain
   / platform administrator — with a METHOD and its BASIS, never from narrative text:
     frequency_map       — p_map_id (the ACTIVE version of a map of this domain) and basis {frequency_per_year ≥ 0, observation (where the
                           frequency was observed, ≥ 8 characters)}; the band is COMPUTED from the map (a caller's band is refused);
     expert_elicitation  — basis {elicitation: {experts [≥1 names], question, elicited_at (an instant), record (≥ 16 characters)}} and the band;
     model               — basis {run_id: a simulation run of this domain, completed and not invalidated} and the band.
   A basis carrying `narrative` is refused (a probability is never derived from narrative text). The branch: open, flipped or suspended
   (a closed one takes none); the scenario active. The sum of the LIVE branches' standing lows (this one's new low in place of its old)
   must not exceed 1; a suspended branch's probability is recorded and shown but not summed. */
CREATE OR REPLACE FUNCTION prediction.set_branch_probability(
  p_probability_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_method text, p_low numeric, p_high numeric, p_map_id uuid, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, simulation, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; s prediction.scenarios_current%ROWTYPE; m prediction.frequency_probability_maps%ROWTYPE; band jsonb; v_freq numeric; v_low numeric := p_low; v_high numeric := p_high;
        v_sum numeric; e jsonb; v_prior uuid; v_basis jsonb := p_basis; v_run record; v_at timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.probability.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch probability rejected (actor): a probability is set by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch probability rejected (unknown_branch): % is not a branch of this domain', p_branch_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = b.scenario_id;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active')
     OR NOT (p_actor = s.owner_principal_id OR p_actor = b.owner_principal_id OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin'])) THEN
    RAISE EXCEPTION 'branch probability rejected (authority): a probability is set by a named human — the scenario''s owner, the branch''s owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'branch probability rejected (state): scenario % is %; only an active scenario''s branches take a probability', s.scenario_id, s.state USING ERRCODE = '22023'; END IF;
  IF b.state = 'closed' THEN RAISE EXCEPTION 'branch probability rejected (state): branch "%" is closed; a closed branch takes no probability', b.name USING ERRCODE = '22023'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('frequency_map', 'expert_elicitation', 'model') THEN
    RAISE EXCEPTION 'branch probability rejected (method): the method is frequency_map, expert_elicitation or model' USING ERRCODE = '22023';
  END IF;
  IF v_basis IS NULL OR coalesce(jsonb_typeof(v_basis), 'absent') <> 'object' THEN RAISE EXCEPTION 'branch probability rejected (basis): a probability states its basis (an object)' USING ERRCODE = '22023'; END IF;
  IF v_basis ? 'narrative' THEN
    RAISE EXCEPTION 'branch probability rejected (narrative): a probability is never derived from narrative text — state the observed frequency, the elicitation record or the model run' USING ERRCODE = '22023';
  END IF;
  IF p_method = 'frequency_map' THEN
    IF p_low IS NOT NULL OR p_high IS NOT NULL THEN RAISE EXCEPTION 'branch probability rejected (band): the frequency_map method computes the band from the map; state the frequency, not the band' USING ERRCODE = '22023'; END IF;
    IF p_map_id IS NULL THEN RAISE EXCEPTION 'branch probability rejected (map): the frequency_map method names the map' USING ERRCODE = '22023'; END IF;
    SELECT * INTO m FROM prediction.frequency_probability_maps x WHERE x.map_id = p_map_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'branch probability rejected (unknown_map): % is not a frequency map of this domain', p_map_id USING ERRCODE = '23503'; END IF;
    IF m.state <> 'active' THEN RAISE EXCEPTION 'branch probability rejected (state): map "%" version % is superseded; use its current version', m.name, m.version USING ERRCODE = '22023'; END IF;
    IF coalesce(jsonb_typeof(v_basis -> 'frequency_per_year'), 'absent') <> 'number' OR (v_basis ->> 'frequency_per_year')::numeric < 0 THEN
      RAISE EXCEPTION 'branch probability rejected (basis): the frequency_map method states frequency_per_year (a number ≥ 0)' USING ERRCODE = '22023';
    END IF;
    IF coalesce(jsonb_typeof(v_basis -> 'observation'), 'absent') <> 'string' OR length(btrim(v_basis ->> 'observation')) < 8 THEN
      RAISE EXCEPTION 'branch probability rejected (basis): the frequency_map method states where the frequency was observed (observation, ≥ 8 characters)' USING ERRCODE = '22023';
    END IF;
    v_freq := (v_basis ->> 'frequency_per_year')::numeric;
    SELECT x INTO band FROM jsonb_array_elements(m.bands) x WHERE (x ->> 'min_per_year')::numeric <= v_freq AND ((x ->> 'max_per_year') IS NULL OR v_freq < (x ->> 'max_per_year')::numeric) LIMIT 1;
    IF band IS NULL THEN RAISE EXCEPTION 'branch probability rejected (basis): % per year falls in no band of map "%"', v_freq, m.name USING ERRCODE = '22023'; END IF;
    v_low := (band ->> 'probability_low')::numeric; v_high := (band ->> 'probability_high')::numeric;
    v_basis := v_basis || jsonb_build_object('map', jsonb_build_object('map_id', m.map_id, 'name', m.name, 'version', m.version, 'horizon', m.horizon), 'band', band);
  ELSE
    IF p_map_id IS NOT NULL THEN RAISE EXCEPTION 'branch probability rejected (map): only the frequency_map method names a map' USING ERRCODE = '22023'; END IF;
    IF p_low IS NULL OR p_high IS NULL OR p_low < 0 OR p_high > 1 OR p_low > p_high THEN
      RAISE EXCEPTION 'branch probability rejected (band): the % method states the band (low ≤ high, both in [0, 1])', p_method USING ERRCODE = '22023';
    END IF;
    IF p_method = 'expert_elicitation' THEN
      e := v_basis -> 'elicitation';
      IF e IS NULL OR coalesce(jsonb_typeof(e), 'absent') <> 'object' OR coalesce(jsonb_typeof(e -> 'experts'), 'absent') <> 'array' OR jsonb_array_length(e -> 'experts') = 0
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(e -> 'experts') q WHERE coalesce(jsonb_typeof(q), 'absent') <> 'string' OR length(btrim(q #>> '{}')) < 2)
         OR coalesce(jsonb_typeof(e -> 'question'), 'absent') <> 'string' OR length(btrim(e ->> 'question')) < 8 OR coalesce(jsonb_typeof(e -> 'record'), 'absent') <> 'string' OR length(btrim(e ->> 'record')) < 16
         OR coalesce(jsonb_typeof(e -> 'elicited_at'), 'absent') <> 'string' THEN
        RAISE EXCEPTION 'branch probability rejected (basis): the expert_elicitation method carries the elicitation record {experts (named), question, elicited_at, record (≥ 16 characters)}' USING ERRCODE = '22023';
      END IF;
      BEGIN v_at := (e ->> 'elicited_at')::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'branch probability rejected (basis): elicited_at is an instant' USING ERRCODE = '22023'; END;
      IF v_at > clock_timestamp() THEN RAISE EXCEPTION 'branch probability rejected (basis): the elicitation (%) lies in the future', v_at USING ERRCODE = '22023'; END IF;
    ELSE
      IF coalesce(jsonb_typeof(v_basis -> 'run_id'), 'absent') <> 'string' OR (v_basis ->> 'run_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'branch probability rejected (basis): the model method names the simulation run (run_id)' USING ERRCODE = '22023';
      END IF;
      SELECT r.run_id, r.state, r.validity INTO v_run FROM simulation.runs_current r WHERE r.run_id = (v_basis ->> 'run_id')::uuid AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
      IF v_run.run_id IS NULL THEN RAISE EXCEPTION 'branch probability rejected (unknown_run): % is not a simulation run of this domain', v_basis ->> 'run_id' USING ERRCODE = '23503'; END IF;
      IF v_run.state <> 'completed' OR v_run.validity = 'invalidated' THEN
        RAISE EXCEPTION 'branch probability rejected (basis): run % is % (%); a probability rests on a completed, valid run', v_run.run_id, v_run.state, v_run.validity USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;
  -- the sum of the LIVE branches' standing lows (this one's new low in place of its old; a suspended branch is not summed)
  SELECT coalesce(sum(c.probability_low), 0) INTO v_sum FROM prediction.branch_probabilities_current c JOIN prediction.branches_current x ON x.branch_id = c.branch_id
   WHERE c.scenario_id = b.scenario_id AND c.branch_id <> b.branch_id AND prediction.branch_live(x.state);
  IF prediction.branch_live(b.state) AND v_sum + v_low > 1 THEN
    RAISE EXCEPTION 'branch probability rejected (sum): the live branches'' lows would sum to % (the others % + this %); they must not exceed 1', v_sum + v_low, v_sum, v_low USING ERRCODE = '22023';
  END IF;
  SELECT c.probability_id INTO v_prior FROM prediction.branch_probabilities_current c WHERE c.branch_id = b.branch_id;
  INSERT INTO prediction.branch_probabilities (probability_id, scope, tenant_id, domain_id, scenario_id, branch_id, action, probability_low, probability_high, method, map_id, basis, actor_principal_id, correlation_id)
  VALUES (p_probability_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'set', v_low, v_high, p_method, CASE WHEN p_method = 'frequency_map' THEN m.map_id END, v_basis, p_actor, p_correlation);
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'branch.probability_set', p_actor,
          jsonb_build_object('probability_id', p_probability_id, 'low', v_low, 'high', v_high, 'method', p_method, 'map_id', CASE WHEN p_method = 'frequency_map' THEN m.map_id END, 'replaces', v_prior,
                             'live', prediction.branch_live(b.state)), p_correlation);
  RETURN jsonb_build_object('probability_id', p_probability_id, 'scenario_id', b.scenario_id, 'branch_id', b.branch_id, 'branch', b.name, 'branch_state', b.state, 'probability_low', v_low, 'probability_high', v_high,
                            'method', p_method, 'map_id', CASE WHEN p_method = 'frequency_map' THEN m.map_id END, 'basis', v_basis, 'set_by', p_actor, 'replaces', v_prior,
                            'summed', prediction.branch_live(b.state), 'live_low_sum', CASE WHEN prediction.branch_live(b.state) THEN v_sum + v_low ELSE v_sum END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.set_branch_probability(uuid,uuid,uuid,uuid,text,numeric,numeric,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.set_branch_probability(uuid,uuid,uuid,uuid,text,numeric,numeric,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

/* WITHDRAW A BRANCH PROBABILITY (prediction.scenario.probability.withdraw): the same named humans, with a reason (≥ 8 characters); the
   standing probability ends (a `withdrawn` row naming it); a branch with none is refused. */
CREATE OR REPLACE FUNCTION prediction.withdraw_branch_probability(
  p_withdrawal_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; s prediction.scenarios_current%ROWTYPE; c record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.probability.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch probability rejected (actor): a withdrawal is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch probability rejected (unknown_branch): % is not a branch of this domain', p_branch_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = b.scenario_id;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active')
     OR NOT (p_actor = s.owner_principal_id OR p_actor = b.owner_principal_id OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin'])) THEN
    RAISE EXCEPTION 'branch probability rejected (authority): a probability is withdrawn by a named human — the scenario''s owner, the branch''s owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'branch probability rejected (reason): a withdrawal says why (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM prediction.branch_probabilities_current x WHERE x.branch_id = b.branch_id;
  IF c.probability_id IS NULL THEN RAISE EXCEPTION 'branch probability rejected (state): branch "%" has no standing probability to withdraw', b.name USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.branch_probabilities (probability_id, scope, tenant_id, domain_id, scenario_id, branch_id, action, withdraws, withdrawal_reason, actor_principal_id, correlation_id)
  VALUES (p_withdrawal_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'withdrawn', c.probability_id, btrim(p_reason), p_actor, p_correlation);
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, b.branch_id, 'branch.probability_withdrawn', p_actor,
          jsonb_build_object('withdrawal_id', p_withdrawal_id, 'withdraws', c.probability_id, 'reason', btrim(p_reason), 'low', c.probability_low, 'high', c.probability_high, 'method', c.method), p_correlation);
  RETURN jsonb_build_object('withdrawal_id', p_withdrawal_id, 'withdraws', c.probability_id, 'scenario_id', b.scenario_id, 'branch_id', b.branch_id, 'branch', b.name, 'reason', btrim(p_reason), 'withdrawn_by', p_actor);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.withdraw_branch_probability(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.withdraw_branch_probability(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §Q.5 THE READ (an invoker read under the caller's RLS)
-- ═════════════════════════════════════════════════════════════════════
/* THE SCENARIO'S QUALITY: the scenario; the LATEST evaluation (null when none); the measures and findings AS OF NOW (live); the
   decision-activity (FEX-12: active, the coherence check not failed and the latest quality evaluation not failed — each reason named);
   each branch's standing probability with its method and basis (a suspended branch's shown, not summed) and the live lows' sum; the
   domain's active maps. Null when the scenario is not visible to the caller. */
CREATE OR REPLACE FUNCTION prediction.scenario_quality(p_scenario_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; l prediction.scenario_quality_evaluations%ROWTYPE; v_live jsonb; v_reasons jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM prediction.scenario_quality_evaluations x WHERE x.scenario_id = p_scenario_id ORDER BY x.evaluated_at DESC, x.evaluation_id DESC LIMIT 1;
  v_live := prediction.scenario_quality_compute(p_scenario_id, prediction.scenario_quality_rule());
  IF s.state <> 'active' THEN v_reasons := v_reasons || to_jsonb(format('the scenario is %s', s.state)); END IF;
  IF s.coherence_state = 'failed' THEN v_reasons := v_reasons || to_jsonb('the coherence check (v1) failed'::text); END IF;
  IF l.outcome = 'failed' THEN v_reasons := v_reasons || to_jsonb(format('the quality evaluation of %s failed: %s', l.evaluated_at,
                                  (SELECT string_agg(DISTINCT q ->> 'rule', ', ') FROM jsonb_array_elements(l.findings) q WHERE q ->> 'outcome' = 'fail'))); END IF;
  RETURN jsonb_build_object(
    'at', clock_timestamp(),
    'scenario', jsonb_build_object('scenario_id', s.scenario_id, 'title', s.title, 'statement', s.statement, 'state', s.state, 'owner', s.owner_principal_id, 'current_version', s.current_version,
                                   'coherence_state', s.coherence_state, 'next_review_due_at', s.next_review_due_at),
    'rule', prediction.scenario_quality_rule(),
    'latest', CASE WHEN l.evaluation_id IS NULL THEN NULL ELSE to_jsonb(l) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' END,
    'evaluations', (SELECT count(*) FROM prediction.scenario_quality_evaluations x WHERE x.scenario_id = p_scenario_id),
    'live', v_live - 'fingerprint' - 'freshness_key',
    'quality_state', coalesce(l.outcome, 'unevaluated'),
    'decision_active', jsonb_build_object('value', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons),
    'branches', (SELECT coalesce(jsonb_agg(jsonb_build_object('branch_id', b.branch_id, 'name', b.name, 'kind', b.kind, 'kind_label', b.kind_label, 'state', b.state, 'live', prediction.branch_live(b.state),
                                                              'owner', b.owner_principal_id, 'indicator_id', b.indicator_id,
                                                              'probability', (SELECT to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' FROM prediction.branch_probabilities_current c WHERE c.branch_id = b.branch_id))
                                          ORDER BY b.added_at, b.name), '[]'::jsonb)
                   FROM prediction.branches_current b WHERE b.scenario_id = p_scenario_id AND b.state <> 'closed'),
    'probability_sum', jsonb_build_object('live_low', (SELECT coalesce(sum(c.probability_low), 0) FROM prediction.branch_probabilities_current c JOIN prediction.branches_current b ON b.branch_id = c.branch_id
                                                        WHERE c.scenario_id = p_scenario_id AND prediction.branch_live(b.state)),
                                          'live_high', (SELECT coalesce(sum(c.probability_high), 0) FROM prediction.branch_probabilities_current c JOIN prediction.branches_current b ON b.branch_id = c.branch_id
                                                        WHERE c.scenario_id = p_scenario_id AND prediction.branch_live(b.state)),
                                          'not_summed', (SELECT count(*) FROM prediction.branch_probabilities_current c JOIN prediction.branches_current b ON b.branch_id = c.branch_id
                                                          WHERE c.scenario_id = p_scenario_id AND NOT prediction.branch_live(b.state))),
    'history', (SELECT coalesce(jsonb_agg(to_jsonb(p) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' ORDER BY p.recorded_at DESC), '[]'::jsonb) FROM prediction.branch_probabilities p WHERE p.scenario_id = p_scenario_id),
    'maps', (SELECT coalesce(jsonb_agg(to_jsonb(m) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' ORDER BY m.name), '[]'::jsonb) FROM prediction.frequency_probability_maps m
              WHERE m.tenant_id = s.tenant_id AND m.domain_id = s.domain_id AND m.state = 'active'));
END $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_quality(uuid) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- section `sets` (§S) — the part-local file 0097_b27_x_sets.sql, combined here at integration in the apply order every fresh-database run used (§0, §A, §Q, §S)
-- ═════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════
-- section `sets` (§S) — the part-local file 0097_b27_x_sets.sql (combined into 0097 at integration after §A and §Q)
-- ═════════════════════════════════════════════════════════════════════
-- 0097 §S — CP-6 B27 PART S (2026-09-30): SCENARIO SETS, THE COMPARATOR AND THE PORTFOLIO REVIEW (F-P4-08; C-022, V00-T-056/-057,
-- V01-T-015, V02-T-067/-073, L7-C01/-C03/-C08, L7-I02/-I05, SCN, ADR-0013, V03-T-144/-333/-336/-340/-343, AG-020, PR-33-001/-003/-006,
-- CAP-DS-01/-02, AT-33, WS-12, JRN-13, ADR-012). Built on the prelude (§0: prediction.branch_live, the widened scenario event vocabulary,
-- the attention classes scenario.set_gap / scenario.signpost / scenario.proposal and the subject kinds branch / scenario_set) and nothing
-- else of B27: §A's elements and §Q's governed probabilities are READ by to_regclass so this part stands alone.
--
--   S.1 THE SET: prediction.scenario_sets (a title, a purpose, a named OWNER, the decision package it serves, the PLURALITY POLICY
--       {require: [kinds], min_branches, min_adverse}, draft → active → retired, versioned by membership), prediction.scenario_set_members
--       (a scenario — every live branch of it — or one branch; who added / removed it and when, in which set version),
--       prediction.scenario_set_events (the set's own append-only ledger).
--   S.2 THE PLURALITY CHECK (ADR-012): prediction.scenario_set_plurality(set) — the pure evaluation (only LIVE branches count:
--       prediction.branch_live; a suspended or closed branch and a retired scenario's are named, never counted); the recorded check
--       prediction.check_scenario_set_plurality (prediction.scenario_set_checks, append-only); a NEW gap raises `scenario.set_gap` to the set
--       owner, a passing check closes the open gap items. THE GATE: decision.package_scenario_sets binds a set to a package
--       (prediction.bind_scenario_set); a BEFORE INSERT trigger on decision.package_events for `version.proposed` refuses the proposal of a
--       package bound to a set whose check fails — `recommendation rejected (plurality): …` — without re-declaring decision.propose_version
--       (0090:4577). A refused proposal rolls back whole, so the gap ITEM is raised by the check (the owner's, the binding's, the
--       activation's, a member change on an active set), never by the refusal.
--   S.3 THE COMPARATOR (CAP-DS-02): prediction.scenario_set_compare(set) — an INVOKER read: the set's live and not-live branches side by
--       side (kind, kind label, state — suspended shown with its reason —, statement, divergence, assumptions, §A's elements when present,
--       the indicator with its freshness, the consequence and its class, §Q's governed probability when present).
--   S.4 THE PORTFOLIO REVIEW: prediction.review_scenario_portfolio — a named human's review: relevance and consequence per member, the option
--       × branch PAYOFF matrix (the bound package's options by key, or named options), per option ROBUSTNESS (the worst payoff) and
--       maximum REGRET (max over branches of best-in-branch − this option's payoff) computed HERE, the missing kinds named from the policy,
--       retirements PROPOSED (a retirement stays the scenario owner's review — the existing retire outcome).
--   S.5 LIVING SCENARIOS: prediction.score_scenario_relevance — the tick step `scenario-relevance` (order 67) and an operator's act: each
--       active scenario that is a MEMBER OF AN ACTIVE SET (the living portfolio — scenarios outside every set are not scored, so no older
--       suite's tick writes a row or an item) scored from indicator movement toward the thresholds, signposts breached and review
--       timeliness; a row only when the score or its basis changed; the scenario owner notified ONCE per signpost breach (`scenario.signpost`).
--   S.6 CREATION TRIGGERS (V03-T-343): prediction.propose_scenario — a forecast shift (a forecast whose predecessor's median moved beyond a
--       stated band), a weak signal (0088's escalated signal), a risk (0089's accepted exposure whose residual breaches its appetite), a
--       planning cycle (0094's cadence reset) — each source VALIDATED; routed as `scenario.proposal` to the domain's strategy owners;
--       prediction.resolve_scenario_proposal (accepted | dismissed with a note, by a strategy owner who did not propose it) — accepting never
--       declares a scenario (the owner declares through the existing route).
--   Refusal families: `scenario set rejected (<class>)`, `portfolio review rejected (<class>)`, `scenario proposal rejected (<class>)`,
--   `recommendation rejected (<class>)` — actor | authority | separation_of_duties → 403, unknown_* → 404, state | duplicate | plurality |
--   bound → 409, the rest → 422. Every figure a harness seeds is SYNTHETIC. Forward-only; nothing earlier edited.

-- ═════════════════════════════════════════════════════════════════════
-- §S.1 THE SET
-- ═════════════════════════════════════════════════════════════════════
/* The ADVERSE kinds of vocabulary v1 (the plurality policy's min_adverse counts live branches of these kinds). */
CREATE OR REPLACE FUNCTION prediction.scenario_set_adverse_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['downside', 'disruption', 'stress', 'adversarial'] $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_adverse_kinds() TO eye_app, eye_commit;

CREATE TABLE prediction.scenario_sets (
  set_id              uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  purpose             text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 8 AND 2000),
  owner_principal_id  uuid NOT NULL,
  package_id          uuid,                                   -- the decision package the set serves (named; the GATE is the binding)
  plurality_policy    jsonb NOT NULL CHECK (jsonb_typeof(plurality_policy) = 'object'),   -- {require: [kinds], min_branches, min_adverse}
  state               text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'retired')),
  version             int  NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_check_id       uuid,
  last_check_outcome  text CHECK (last_check_outcome IS NULL OR last_check_outcome IN ('passed', 'failed')),
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  activated_by        uuid,
  activated_at        timestamptz,
  retired_by          uuid,
  retired_at          timestamptz,
  retirement_reason   text,
  updated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_activated CHECK ((activated_at IS NULL) = (activated_by IS NULL) AND (state = 'draft') = (activated_at IS NULL)),
  CONSTRAINT pss_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL AND retired_by IS NOT NULL AND retirement_reason IS NOT NULL)),
  CONSTRAINT pss_checked CHECK ((last_check_id IS NULL) = (last_check_outcome IS NULL))
);
CREATE INDEX pss_domain ON prediction.scenario_sets (tenant_id, domain_id, state, declared_at DESC);
CREATE TRIGGER pss_no_delete BEFORE DELETE ON prediction.scenario_sets FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_sets IS 'B27 (0097 §S; F-P4-08, ADR-012, CAP-DS-01): a SET of scenarios and branches with a named owner, a purpose, the decision package it serves and a PLURALITY policy {require, min_branches, min_adverse}; draft → active → retired; the version moves with every membership change. Never deleted.';

CREATE TABLE prediction.scenario_set_members (
  member_id           uuid PRIMARY KEY,
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  scenario_id         uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  branch_id           uuid REFERENCES prediction.branches_current (branch_id),   -- NULL: every live branch of the scenario
  added_by            uuid NOT NULL,
  added_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  added_in_version    int NOT NULL CHECK (added_in_version >= 1),
  removed_by          uuid,
  removed_at          timestamptz,
  removal_reason      text,
  removed_in_version  int,
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_member_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_member_removed CHECK ((removed_at IS NULL) = (removed_by IS NULL) AND (removed_at IS NULL) = (removal_reason IS NULL) AND (removed_at IS NULL) = (removed_in_version IS NULL))
);
CREATE UNIQUE INDEX pss_member_once ON prediction.scenario_set_members (set_id, scenario_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE removed_at IS NULL;
CREATE INDEX pss_member_scenario ON prediction.scenario_set_members (scenario_id) WHERE removed_at IS NULL;
/* A membership is written once and removed once: only the removal columns change, and only from NULL. */
CREATE OR REPLACE FUNCTION prediction.pss_member_guard() RETURNS trigger
SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'scenario set rejected (append_only): a membership is never deleted; it is removed with a reason' USING ERRCODE = '23514'; END IF;
  IF OLD.removed_at IS NOT NULL
     OR (to_jsonb(NEW) - ARRAY['removed_by', 'removed_at', 'removal_reason', 'removed_in_version']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['removed_by', 'removed_at', 'removal_reason', 'removed_in_version']) THEN
    RAISE EXCEPTION 'scenario set rejected (append_only): membership % is written once and removed once', OLD.member_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pss_member_guard BEFORE UPDATE OR DELETE ON prediction.scenario_set_members FOR EACH ROW EXECUTE FUNCTION prediction.pss_member_guard();
COMMENT ON TABLE prediction.scenario_set_members IS 'B27 (0097 §S): the members of a scenario set — a scenario (every live branch of it) or one branch — with who added and removed them, when, and in which set version.';

CREATE TABLE prediction.scenario_set_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  event               text NOT NULL CHECK (event IN ('set.declared', 'set.activated', 'set.retired', 'set.member_added', 'set.member_removed', 'set.checked', 'set.bound', 'set.reviewed')),
  set_version         int NOT NULL CHECK (set_version >= 1),
  actor_principal_id  uuid NOT NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pss_event_set ON prediction.scenario_set_events (set_id, occurred_at);
CREATE TRIGGER pss_event_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_set_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_set_events IS 'B27 (0097 §S): the scenario set''s own ledger — declared, activated, retired, members added and removed, checked, bound to a package, reviewed — append-only.';

-- ═════════════════════════════════════════════════════════════════════
-- §S.2 THE PLURALITY CHECK AND THE GATE
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.scenario_set_checks (
  check_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  set_version         int NOT NULL CHECK (set_version >= 1),
  trigger             text NOT NULL CHECK (trigger IN ('operator', 'activate', 'bind', 'member')),
  outcome             text NOT NULL CHECK (outcome IN ('passed', 'failed')),
  missing_kinds       text[] NOT NULL DEFAULT ARRAY[]::text[],
  live_branches       int NOT NULL CHECK (live_branches >= 0),
  adverse_branches    int NOT NULL CHECK (adverse_branches >= 0),
  kinds_present       text[] NOT NULL DEFAULT ARRAY[]::text[],
  findings            jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),
  policy              jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  as_of               timestamptz NOT NULL,
  checked_by          uuid NOT NULL,
  item_id             uuid,                                   -- the scenario.set_gap item a NEW gap raised
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_check_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_check_outcome CHECK (outcome = 'failed' OR cardinality(missing_kinds) = 0)
);
CREATE INDEX pss_check_set ON prediction.scenario_set_checks (set_id, as_of DESC);
CREATE TRIGGER pss_check_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_set_checks FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_set_checks IS 'B27 (0097 §S; ADR-012): the recorded PLURALITY checks of a set — the outcome, the missing kinds, the live and adverse branch counts, the findings (the not-live branches named), the policy as judged, the instant — append-only.';

/* THE BINDING (a new table in the decision schema — never a column on a Phase-6 table another suite pins): a package names the scenario
   set its recommendation must be plural over; the plurality gate reads it when a version is proposed. */
CREATE TABLE decision.package_scenario_sets (
  binding_id          uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL REFERENCES decision.packages_current (package_id),
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  bound_by            uuid NOT NULL,
  bound_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_binding_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX pss_binding_once ON decision.package_scenario_sets (package_id, set_id);
CREATE INDEX pss_binding_set ON decision.package_scenario_sets (set_id);
CREATE TRIGGER pss_binding_append_only BEFORE UPDATE OR DELETE ON decision.package_scenario_sets FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE decision.package_scenario_sets IS 'B27 (0097 §S; ADR-012): a decision package BOUND to a scenario set — a version of the package is not proposed while the set''s plurality check fails (the trigger pss_plurality_gate on decision.package_events). Append-only.';

-- ═════════════════════════════════════════════════════════════════════
-- §S.4 / §S.5 / §S.6 THE RECORDS (the portfolio reviews, the relevance scores, the proposals)
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE prediction.portfolio_reviews (
  review_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  set_id              uuid NOT NULL REFERENCES prediction.scenario_sets (set_id),
  set_version         int NOT NULL CHECK (set_version >= 1),
  package_id          uuid,
  package_version     int,
  reviewer            uuid NOT NULL,
  members             jsonb NOT NULL CHECK (jsonb_typeof(members) = 'array'),        -- [{member_id, scenario_id, branch_id, relevance, consequence, note}]
  branches            jsonb NOT NULL CHECK (jsonb_typeof(branches) = 'array'),       -- the live branches the matrix is over [{branch_id, scenario_id, name, kind, kind_label}]
  options             jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),        -- [{key, title, source}]
  payoffs             jsonb NOT NULL CHECK (jsonb_typeof(payoffs) = 'object'),       -- {option_key: {branch_id: number}}
  robustness          jsonb NOT NULL CHECK (jsonb_typeof(robustness) = 'object'),    -- {option_key: the worst payoff}
  regret              jsonb NOT NULL CHECK (jsonb_typeof(regret) = 'object'),        -- {option_key: the maximum regret}
  most_robust         text[] NOT NULL,
  least_regret        text[] NOT NULL,
  missing_kinds       text[] NOT NULL DEFAULT ARRAY[]::text[],
  plurality           jsonb NOT NULL CHECK (jsonb_typeof(plurality) = 'object'),
  retirements_proposed jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(retirements_proposed) = 'array'),
  payoff_unit         text NOT NULL CHECK (length(btrim(payoff_unit)) BETWEEN 1 AND 64),
  note                text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 4000),
  reviewed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_review_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_review_package CHECK ((package_id IS NULL) = (package_version IS NULL))
);
CREATE INDEX pss_review_set ON prediction.portfolio_reviews (set_id, reviewed_at DESC);
CREATE TRIGGER pss_review_append_only BEFORE UPDATE OR DELETE ON prediction.portfolio_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.portfolio_reviews IS 'B27 (0097 §S; PR-33-003/-006): a named human''s PORTFOLIO REVIEW of a set — relevance and consequence per member, the option × branch payoff matrix, robustness (worst payoff) and maximum regret per option computed by the port, the missing kinds, the retirements proposed (still the scenario owner''s review) — append-only.';

CREATE TABLE prediction.scenario_relevance (
  relevance_id        uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  scenario_id         uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  score               numeric NOT NULL CHECK (score >= 0 AND score <= 1),
  basis               jsonb NOT NULL CHECK (jsonb_typeof(basis) = 'object'),
  trigger             text NOT NULL CHECK (trigger IN ('tick', 'operator')),
  scored_by           uuid NOT NULL,
  scored_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_relevance_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pss_relevance_scenario ON prediction.scenario_relevance (scenario_id, scored_at DESC);
CREATE TRIGGER pss_relevance_append_only BEFORE UPDATE OR DELETE ON prediction.scenario_relevance FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.scenario_relevance IS 'B27 (0097 §S; living scenarios): the relevance of a scenario of the living portfolio (a member of an active set) — indicator movement toward the thresholds, signposts breached, review timeliness — a row only when the score or its basis changed; append-only.';

CREATE TABLE prediction.scenario_proposals (
  proposal_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('forecast_shift', 'weak_signal', 'risk', 'planning_cycle')),
  source_ref          jsonb NOT NULL CHECK (jsonb_typeof(source_ref) = 'object'),
  source_key          text NOT NULL,                        -- the source object's id (the dedupe key with the kind)
  source_facts        jsonb NOT NULL CHECK (jsonb_typeof(source_facts) = 'object'),   -- what the port VALIDATED about the source
  related_scenario_id uuid REFERENCES prediction.scenarios_current (scenario_id),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 256),
  rationale           text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 4000),
  proposed_by         uuid NOT NULL,
  proposed_kind       text NOT NULL CHECK (proposed_kind IN ('human', 'agent')),
  proposed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  state               text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'accepted', 'dismissed')),
  resolved_by         uuid,
  resolved_at         timestamptz,
  resolution_note     text,
  item_id             uuid,
  correlation_id      uuid NOT NULL,
  CONSTRAINT pss_proposal_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pss_proposal_resolved CHECK ((state = 'open') = (resolved_at IS NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL) AND (resolved_at IS NULL) = (resolution_note IS NULL))
);
CREATE UNIQUE INDEX pss_proposal_open_once ON prediction.scenario_proposals (tenant_id, domain_id, kind, source_key) WHERE state = 'open';
CREATE INDEX pss_proposal_domain ON prediction.scenario_proposals (tenant_id, domain_id, state, proposed_at DESC);
/* A proposal is resolved once: only the state and the resolution columns change, and only from open. */
CREATE OR REPLACE FUNCTION prediction.pss_proposal_guard() RETURNS trigger
SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'scenario proposal rejected (append_only): a proposal is never deleted; it is dismissed with a note' USING ERRCODE = '23514'; END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'resolved_by', 'resolved_at', 'resolution_note', 'item_id']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'resolved_by', 'resolved_at', 'resolution_note', 'item_id'])
     OR (OLD.state <> 'open' AND NEW.state IS DISTINCT FROM OLD.state) OR (OLD.item_id IS NOT NULL AND NEW.item_id IS DISTINCT FROM OLD.item_id) THEN
    RAISE EXCEPTION 'scenario proposal rejected (append_only): proposal % is written once and resolved once', OLD.proposal_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pss_proposal_guard BEFORE UPDATE OR DELETE ON prediction.scenario_proposals FOR EACH ROW EXECUTE FUNCTION prediction.pss_proposal_guard();
COMMENT ON TABLE prediction.scenario_proposals IS 'B27 (0097 §S; V03-T-343): scenario CREATION TRIGGERS — a proposal from a forecast shift, a weak signal, a risk or a planning cycle, its source validated and recorded, routed to the strategy owners (scenario.proposal), resolved accepted or dismissed with a note; accepting never declares a scenario.';

-- RLS and grants (the 0081 loop idiom; the prediction tables' policy text of 0089; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scenario_sets', 'scenario_set_members', 'scenario_set_events', 'scenario_set_checks', 'portfolio_reviews', 'scenario_relevance', 'scenario_proposals'] LOOP
    EXECUTE format('REVOKE ALL ON prediction.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE prediction.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE prediction.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY prediction_isolation ON prediction.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON prediction.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
REVOKE ALL ON decision.package_scenario_sets FROM PUBLIC;
ALTER TABLE decision.package_scenario_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision.package_scenario_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY decision_isolation ON decision.package_scenario_sets USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON decision.package_scenario_sets TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §S.2 (cont.) THE EVALUATION, THE HELPERS AND THE GATE
-- ═════════════════════════════════════════════════════════════════════
/* The set's BRANCHES as its members name them (a scenario member names every branch of the scenario; a branch member its one branch),
   each once, with whether it COUNTS (live — prediction.branch_live — in an active scenario) and, when not, why. Read under the caller's
   rights (the gate and the ports run as the definer; a reader under its RLS). */
CREATE OR REPLACE FUNCTION prediction.scenario_set_branches(p_set_id uuid)
RETURNS TABLE (branch_id uuid, scenario_id uuid, scenario_title text, scenario_state text, name text, kind text, kind_label text, state text, counts boolean, reason text)
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (b.branch_id) b.branch_id, s.scenario_id, s.title, s.state, b.name, b.kind, b.kind_label, b.state,
         (s.state = 'active' AND prediction.branch_live(b.state)) AS counts,
         CASE WHEN s.state <> 'active' THEN format('the scenario is %s', s.state)
              WHEN b.state = 'suspended' THEN format('suspended%s', coalesce(' — ' || b.suspension_reason, ''))
              WHEN NOT prediction.branch_live(b.state) THEN format('the branch is %s', b.state) END AS reason
    FROM prediction.scenario_set_members m
    JOIN prediction.scenarios_current s ON s.scenario_id = m.scenario_id
    JOIN prediction.branches_current b ON b.scenario_id = m.scenario_id AND (m.branch_id IS NULL OR b.branch_id = m.branch_id)
   WHERE m.set_id = p_set_id AND m.removed_at IS NULL
   ORDER BY b.branch_id $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_branches(uuid) TO eye_app, eye_commit;

/* THE PLURALITY EVALUATION (pure; ADR-012): the policy's required kinds against the kinds of the LIVE branches, the live count against
   min_branches, the adverse count against min_adverse; the not-counted branches named as a note. {passed, missing_kinds, live_branches,
   adverse_branches, kinds_present, findings, policy}. */
CREATE OR REPLACE FUNCTION prediction.scenario_set_plurality(p_set_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v_policy jsonb; v_required text[]; v_min_b int; v_min_a int; v_kinds text[]; v_live int; v_adverse int; v_missing text[]; v_findings jsonb := '[]'::jsonb; v_not jsonb; k text;
BEGIN
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_policy := s.plurality_policy;
  v_required := ARRAY(SELECT jsonb_array_elements_text(coalesce(v_policy -> 'require', '[]'::jsonb)));
  v_min_b := coalesce((v_policy ->> 'min_branches')::int, 2);
  v_min_a := coalesce((v_policy ->> 'min_adverse')::int, 0);
  SELECT coalesce(array_agg(DISTINCT x.kind ORDER BY x.kind) FILTER (WHERE x.counts), ARRAY[]::text[]), count(*) FILTER (WHERE x.counts)::int,
         count(*) FILTER (WHERE x.counts AND x.kind = ANY (prediction.scenario_set_adverse_kinds()))::int,
         coalesce(jsonb_agg(jsonb_build_object('branch_id', x.branch_id, 'scenario_id', x.scenario_id, 'name', x.name, 'kind', x.kind, 'state', x.state, 'reason', x.reason) ORDER BY x.name) FILTER (WHERE NOT x.counts), '[]'::jsonb)
    INTO v_kinds, v_live, v_adverse, v_not FROM prediction.scenario_set_branches(p_set_id) x;
  v_missing := ARRAY(SELECT r FROM unnest(v_required) r WHERE r <> ALL (v_kinds) ORDER BY array_position(v_required, r));
  IF v_live = 0 THEN v_findings := v_findings || jsonb_build_object('rule', 'no_live_branch', 'outcome', 'fail', 'detail', 'the set counts no live branch'); END IF;
  FOREACH k IN ARRAY v_missing LOOP
    v_findings := v_findings || jsonb_build_object('rule', 'required_kind', 'outcome', 'fail', 'kind', k, 'detail', format('no live %s branch in the set (the policy requires one)', k));
  END LOOP;
  IF v_live < v_min_b THEN v_findings := v_findings || jsonb_build_object('rule', 'min_branches', 'outcome', 'fail', 'detail', format('%s live branch(es); the policy requires at least %s', v_live, v_min_b)); END IF;
  IF v_adverse < v_min_a THEN v_findings := v_findings || jsonb_build_object('rule', 'min_adverse', 'outcome', 'fail', 'detail', format('%s live adverse branch(es) (%s); the policy requires at least %s', v_adverse, array_to_string(prediction.scenario_set_adverse_kinds(), ', '), v_min_a)); END IF;
  IF jsonb_array_length(v_not) > 0 THEN v_findings := v_findings || jsonb_build_object('rule', 'not_counted', 'outcome', 'note', 'branches', v_not, 'detail', format('%s branch(es) of the members are not live and not counted', jsonb_array_length(v_not))); END IF;
  RETURN jsonb_build_object('passed', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_findings) f WHERE f ->> 'outcome' = 'fail'),
                            'missing_kinds', to_jsonb(v_missing), 'live_branches', v_live, 'adverse_branches', v_adverse, 'kinds_present', to_jsonb(v_kinds),
                            'findings', v_findings, 'policy', jsonb_build_object('require', to_jsonb(v_required), 'min_branches', v_min_b, 'min_adverse', v_min_a), 'set_version', s.version);
END $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_plurality(uuid) TO eye_app, eye_commit;

/* The policy's SHAPE (the declaration's rule): require ⊆ vocabulary v1's kinds (no repeats), min_branches ≥ 2 (a plural set), min_adverse ≥ 0. NULL = valid. */
CREATE OR REPLACE FUNCTION prediction.scenario_set_policy_problem(p jsonb) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_kinds text[]; k text; x text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the plurality policy is an object {require: [kinds], min_branches, min_adverse}'; END IF;
  FOR x IN SELECT jsonb_object_keys(p) LOOP
    IF x NOT IN ('require', 'min_branches', 'min_adverse') THEN RETURN format('%s is not a term of the plurality policy (require, min_branches, min_adverse)', x); END IF;
  END LOOP;
  SELECT kinds INTO v_kinds FROM prediction.scenario_kind_versions WHERE version = 1;
  IF jsonb_typeof(coalesce(p -> 'require', '[]'::jsonb)) <> 'array' THEN RETURN 'require is a list of scenario kinds'; END IF;
  FOR k IN SELECT jsonb_array_elements_text(coalesce(p -> 'require', '[]'::jsonb)) LOOP
    IF k <> ALL (v_kinds) THEN RETURN format('%s is not a kind of scenario kind vocabulary v1 (%s)', k, array_to_string(v_kinds, ', ')); END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements_text(coalesce(p -> 'require', '[]'::jsonb))) <> (SELECT count(DISTINCT e) FROM jsonb_array_elements_text(coalesce(p -> 'require', '[]'::jsonb)) e) THEN RETURN 'require names each kind once'; END IF;
  IF p ? 'min_branches' AND (jsonb_typeof(p -> 'min_branches') <> 'number' OR (p ->> 'min_branches') !~ '^[0-9]+$' OR (p ->> 'min_branches')::int < 2 OR (p ->> 'min_branches')::int > 64) THEN
    RETURN 'min_branches is a whole number in 2..64 (a set is plural)';
  END IF;
  IF p ? 'min_adverse' AND (jsonb_typeof(p -> 'min_adverse') <> 'number' OR (p ->> 'min_adverse') !~ '^[0-9]+$' OR (p ->> 'min_adverse')::int > 64) THEN
    RETURN 'min_adverse is a whole number in 0..64';
  END IF;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_policy_problem(jsonb) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.scenario_set_json(r prediction.scenario_sets) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope' $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_json(prediction.scenario_sets) TO eye_app, eye_commit;

/* The set's ledger (a helper; never a port). */
CREATE OR REPLACE FUNCTION prediction.pss_event(p_set uuid, p_tenant uuid, p_domain uuid, p_event text, p_version int, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO prediction.scenario_set_events (event_id, scope, tenant_id, domain_id, set_id, event, set_version, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', p_tenant, p_domain, p_set, p_event, p_version, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pss_event(uuid,uuid,uuid,text,int,uuid,jsonb,uuid) FROM PUBLIC;

/* The owner-or-administrator test of the set's acts (the owner, or a domain / platform administrator). */
CREATE OR REPLACE FUNCTION prediction.pss_owner_or_admin(p_owner uuid, p_actor uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = executive, identity, pg_catalog, pg_temp AS $$
  SELECT p_owner = p_actor OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']) $$;
REVOKE ALL ON FUNCTION prediction.pss_owner_or_admin(uuid,uuid,uuid,uuid) FROM PUBLIC;

/* RECORD A CHECK (a helper the ports call; never a port): the evaluation written to the check ledger and the set's row; a NEW gap (the
   first failure, a failure after a pass, or a failure whose missing kinds or failing rules changed) raises `scenario.set_gap` to the set
   owner; a PASS closes the open gap items of the set. The caller holds the set row. */
CREATE OR REPLACE FUNCTION prediction.pss_record_check(p_check_id uuid, p_set_id uuid, p_tenant uuid, p_domain uuid, p_trigger text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SET search_path = prediction, executive, identity, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v jsonb; prior prediction.scenario_set_checks%ROWTYPE; v_new_gap boolean := false; v_item uuid; v_state text; v_reasons jsonb; v_due timestamptz; v_closed int := 0; it record;
        v_fail_rules text[]; v_prior_rules text[];
BEGIN
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id;
  v := prediction.scenario_set_plurality(p_set_id);
  SELECT * INTO prior FROM prediction.scenario_set_checks x WHERE x.set_id = p_set_id ORDER BY x.as_of DESC, x.check_id DESC LIMIT 1;
  v_fail_rules := ARRAY(SELECT (f ->> 'rule') || coalesce(':' || (f ->> 'kind'), '') FROM jsonb_array_elements(v -> 'findings') f WHERE f ->> 'outcome' = 'fail' ORDER BY 1);
  IF prior.check_id IS NOT NULL THEN v_prior_rules := ARRAY(SELECT (f ->> 'rule') || coalesce(':' || (f ->> 'kind'), '') FROM jsonb_array_elements(prior.findings) f WHERE f ->> 'outcome' = 'fail' ORDER BY 1); END IF;
  IF NOT (v ->> 'passed')::boolean THEN
    v_new_gap := prior.check_id IS NULL OR prior.outcome = 'passed' OR v_prior_rules IS DISTINCT FROM v_fail_rules;
  END IF;
  IF v_new_gap THEN
    v_item := gen_random_uuid();
    v_state := CASE WHEN EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = s.owner_principal_id AND p.kind = 'human' AND p.status = 'active') THEN 'open' ELSE 'unrouted' END;
    v_due := clock_timestamp() + interval '24 hours';
    v_reasons := jsonb_build_array(
      CASE WHEN jsonb_array_length(v -> 'missing_kinds') > 0 THEN format('the set counts no live branch of the kind(s) %s its plurality policy requires', (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v -> 'missing_kinds') x))
           ELSE format('the set''s plurality check fails: %s', (SELECT string_agg(f ->> 'detail', '; ') FROM jsonb_array_elements(v -> 'findings') f WHERE f ->> 'outcome' = 'fail')) END,
      'a package bound to this set is not proposed until the check passes (ADR-012): add the missing branch (a scenario declared with it, or a member that holds it), then check again');
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'scenario.set_gap', 'scenario_set', p_set_id, p_check_id, 'ScenarioSetPluralityFailed',
            left(format('Scenario set not plural: %s — missing %s', s.title, coalesce(nullif((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v -> 'missing_kinds') x), ''), array_to_string(v_fail_rules, ', '))), 512),
            'material', v_state, s.owner_principal_id, '{}',
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
            jsonb_build_object('set_id', p_set_id, 'check_id', p_check_id, 'missing_kinds', v -> 'missing_kinds', 'live_branches', v -> 'live_branches', 'package_id', s.package_id),
            v_due, 0, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
              jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', s.owner_principal_id, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                                 'cause_event_id', p_check_id, 'cause_event_type', 'ScenarioSetPluralityFailed', 'unrouted', v_state = 'unrouted', 'set_id', p_set_id), p_correlation);
  END IF;
  INSERT INTO prediction.scenario_set_checks (check_id, scope, tenant_id, domain_id, set_id, set_version, trigger, outcome, missing_kinds, live_branches, adverse_branches, kinds_present, findings, policy, as_of, checked_by, item_id, correlation_id)
  VALUES (p_check_id, 'DOMAIN', p_tenant, p_domain, p_set_id, s.version, p_trigger, CASE WHEN (v ->> 'passed')::boolean THEN 'passed' ELSE 'failed' END,
          ARRAY(SELECT jsonb_array_elements_text(v -> 'missing_kinds')), (v ->> 'live_branches')::int, (v ->> 'adverse_branches')::int, ARRAY(SELECT jsonb_array_elements_text(v -> 'kinds_present')),
          v -> 'findings', v -> 'policy', clock_timestamp(), p_actor, v_item, p_correlation);
  IF (v ->> 'passed')::boolean THEN
    FOR it IN SELECT item_id FROM executive.attention_items x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.signal_class = 'scenario.set_gap' AND x.subject_id = p_set_id AND x.state NOT IN ('closed') LOOP
      UPDATE executive.attention_items SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, suppressed_until = NULL, updated_at = clock_timestamp() WHERE item_id = it.item_id;
      PERFORM executive.attention_event(it.item_id, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('reason', 'the set''s plurality check passed', 'check_id', p_check_id), p_correlation);
      v_closed := v_closed + 1;
    END LOOP;
  END IF;
  UPDATE prediction.scenario_sets SET last_check_id = p_check_id, last_check_outcome = CASE WHEN (v ->> 'passed')::boolean THEN 'passed' ELSE 'failed' END, updated_at = clock_timestamp() WHERE set_id = p_set_id;
  PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.checked', s.version, p_actor,
            jsonb_build_object('check_id', p_check_id, 'trigger', p_trigger, 'outcome', CASE WHEN (v ->> 'passed')::boolean THEN 'passed' ELSE 'failed' END, 'missing_kinds', v -> 'missing_kinds', 'item_id', v_item, 'gap_items_closed', v_closed), p_correlation);
  RETURN jsonb_build_object('check_id', p_check_id, 'set_id', p_set_id, 'set_version', s.version, 'trigger', p_trigger, 'outcome', CASE WHEN (v ->> 'passed')::boolean THEN 'passed' ELSE 'failed' END,
                            'new_gap', v_new_gap, 'item_id', v_item, 'gap_items_closed', v_closed) || (v - 'passed' - 'set_version');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pss_record_check(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;

/* THE PLURALITY GATE (ADR-012; decision.propose_version is NOT re-declared): a BEFORE INSERT trigger on decision.package_events for
   `version.proposed` — the proposal's last write — runs the evaluation of every set the package is bound to (a retired set gates nothing:
   a set is not retired while bound to a package in flight) and refuses the proposal while one fails. The refusal rolls back the whole
   proposal (the version stays a draft). */
CREATE OR REPLACE FUNCTION prediction.pss_plurality_gate() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, decision, pg_catalog, pg_temp AS $$
DECLARE b record; v jsonb;
BEGIN
  FOR b IN SELECT ps.set_id, s.title, s.state FROM decision.package_scenario_sets ps JOIN prediction.scenario_sets s ON s.set_id = ps.set_id
            WHERE ps.package_id = NEW.package_id ORDER BY ps.bound_at, ps.set_id LOOP
    IF b.state = 'retired' THEN CONTINUE; END IF;
    v := prediction.scenario_set_plurality(b.set_id);
    IF NOT (v ->> 'passed')::boolean THEN
      RAISE EXCEPTION 'recommendation rejected (plurality): package % version % is bound to the scenario set "%" (%), whose plurality check fails — %; add the missing branch and check the set again (ADR-012)',
        NEW.package_id, NEW.details ->> 'version', b.title, b.set_id,
        coalesce(nullif((SELECT string_agg(f ->> 'detail', '; ') FROM jsonb_array_elements(v -> 'findings') f WHERE f ->> 'outcome' = 'fail'), ''), 'the set is not plural')
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pss_plurality_gate() FROM PUBLIC;
CREATE TRIGGER pss_plurality_gate BEFORE INSERT ON decision.package_events FOR EACH ROW WHEN (NEW.event = 'version.proposed') EXECUTE FUNCTION prediction.pss_plurality_gate();

-- ═════════════════════════════════════════════════════════════════════
-- §S.1 (cont.) THE SET'S PORTS
-- ═════════════════════════════════════════════════════════════════════
/* DECLARE (prediction.scenario.set.declare): a named human declares a set — the title, the purpose, the OWNER (a named, active human of
   the domain holding strategy_owner, forecast_owner, decision_owner or an administrator's role), the package it serves (optional; a
   package of this domain), the plurality policy. Draft, version 1. */
CREATE OR REPLACE FUNCTION prediction.declare_scenario_set(
  p_set_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_purpose text, p_owner uuid, p_policy jsonb, p_package_id uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v_problem text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario set rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'scenario set rejected (title): a set has a title of 2 to 256 characters' USING ERRCODE = '22023'; END IF;
  IF p_purpose IS NULL OR length(btrim(p_purpose)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'scenario set rejected (purpose): a set states its purpose (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF NOT executive.holds_role(p_owner, p_tenant, p_domain, ARRAY['strategy_owner', 'forecast_owner', 'decision_owner', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'scenario set rejected (owner): the owner % is not a named, active human holding strategy_owner, forecast_owner or decision_owner in this domain', p_owner USING ERRCODE = '22023';
  END IF;
  v_problem := prediction.scenario_set_policy_problem(p_policy);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'scenario set rejected (policy): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_package_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'scenario set rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.scenario_sets x WHERE x.set_id = p_set_id) THEN RAISE EXCEPTION 'scenario set rejected (duplicate): set % is already declared', p_set_id USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.scenario_sets (set_id, scope, tenant_id, domain_id, title, purpose, owner_principal_id, package_id, plurality_policy, declared_by, correlation_id)
  VALUES (p_set_id, 'DOMAIN', p_tenant, p_domain, btrim(p_title), btrim(p_purpose), p_owner, p_package_id,
          jsonb_build_object('require', coalesce(p_policy -> 'require', '[]'::jsonb), 'min_branches', coalesce((p_policy ->> 'min_branches')::int, 2), 'min_adverse', coalesce((p_policy ->> 'min_adverse')::int, 0)),
          p_actor, p_correlation) RETURNING * INTO s;
  PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.declared', 1, p_actor, jsonb_build_object('title', s.title, 'owner', p_owner, 'package_id', p_package_id, 'policy', s.plurality_policy), p_correlation);
  RETURN prediction.scenario_set_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_scenario_set(uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_scenario_set(uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,uuid) TO eye_commit;

/* ADD or REMOVE a member (prediction.scenario.set.member): the set's owner (or an administrator) on a draft or active set; a member is an
   ACTIVE scenario of this domain, or one of its branches; the set version moves; the scenario's own ledger records it; on an ACTIVE set
   the plurality check runs (trigger member). p_remove names the membership to remove (with a reason). */
CREATE OR REPLACE FUNCTION prediction.change_scenario_set_member(
  p_set_id uuid, p_tenant uuid, p_domain uuid, p_member_id uuid, p_scenario_id uuid, p_branch_id uuid, p_remove boolean, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; m prediction.scenario_set_members%ROWTYPE; sc prediction.scenarios_current%ROWTYPE; v_branch_scenario uuid; v_check jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.member']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario set rejected (actor): changed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  IF NOT prediction.pss_owner_or_admin(s.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'scenario set rejected (authority): the members of a set are changed by its owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF s.state = 'retired' THEN RAISE EXCEPTION 'scenario set rejected (state): set % is retired; its members are not changed', p_set_id USING ERRCODE = '22023'; END IF;
  IF coalesce(p_remove, false) THEN
    SELECT * INTO m FROM prediction.scenario_set_members x WHERE x.member_id = p_member_id AND x.set_id = p_set_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_member): % is not a member of set %', p_member_id, p_set_id USING ERRCODE = '23503'; END IF;
    IF m.removed_at IS NOT NULL THEN RAISE EXCEPTION 'scenario set rejected (state): member % was removed at %', p_member_id, m.removed_at USING ERRCODE = '22023'; END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'scenario set rejected (reason): a removal says why (8+ characters)' USING ERRCODE = '22023'; END IF;
    UPDATE prediction.scenario_sets SET version = version + 1, updated_at = clock_timestamp() WHERE set_id = p_set_id RETURNING * INTO s;
    UPDATE prediction.scenario_set_members SET removed_by = p_actor, removed_at = clock_timestamp(), removal_reason = btrim(p_reason), removed_in_version = s.version WHERE member_id = p_member_id RETURNING * INTO m;
    PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.member_removed', s.version, p_actor, jsonb_build_object('member_id', m.member_id, 'scenario_id', m.scenario_id, 'branch_id', m.branch_id, 'reason', btrim(p_reason)), p_correlation);
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, m.scenario_id, m.branch_id, 'scenario.set_member_removed', p_actor, jsonb_build_object('set_id', p_set_id, 'set_version', s.version, 'member_id', m.member_id, 'reason', btrim(p_reason)), p_correlation);
  ELSE
    SELECT * INTO sc FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_scenario): % is not a scenario of this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
    IF sc.state <> 'active' THEN RAISE EXCEPTION 'scenario set rejected (state): scenario % is %; only an active scenario joins a set', p_scenario_id, sc.state USING ERRCODE = '22023'; END IF;
    IF p_branch_id IS NOT NULL THEN
      SELECT b.scenario_id INTO v_branch_scenario FROM prediction.branches_current b WHERE b.branch_id = p_branch_id;
      IF v_branch_scenario IS DISTINCT FROM p_scenario_id THEN RAISE EXCEPTION 'scenario set rejected (unknown_branch): % is not a branch of scenario %', p_branch_id, p_scenario_id USING ERRCODE = '23503'; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM prediction.scenario_set_members x WHERE x.set_id = p_set_id AND x.scenario_id = p_scenario_id AND x.branch_id IS NOT DISTINCT FROM p_branch_id AND x.removed_at IS NULL) THEN
      RAISE EXCEPTION 'scenario set rejected (duplicate): % is already a member of set %', coalesce(p_branch_id, p_scenario_id), p_set_id USING ERRCODE = '22023';
    END IF;
    UPDATE prediction.scenario_sets SET version = version + 1, updated_at = clock_timestamp() WHERE set_id = p_set_id RETURNING * INTO s;
    INSERT INTO prediction.scenario_set_members (member_id, set_id, scope, tenant_id, domain_id, scenario_id, branch_id, added_by, added_in_version, correlation_id)
    VALUES (p_member_id, p_set_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, p_actor, s.version, p_correlation) RETURNING * INTO m;
    PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.member_added', s.version, p_actor, jsonb_build_object('member_id', m.member_id, 'scenario_id', p_scenario_id, 'branch_id', p_branch_id, 'scenario_title', sc.title), p_correlation);
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'scenario.set_member_added', p_actor, jsonb_build_object('set_id', p_set_id, 'set_version', s.version, 'member_id', m.member_id), p_correlation);
  END IF;
  IF s.state = 'active' THEN v_check := prediction.pss_record_check(gen_random_uuid(), p_set_id, p_tenant, p_domain, 'member', p_actor, p_correlation); END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id;
  RETURN jsonb_build_object('set', prediction.scenario_set_json(s), 'member', to_jsonb(m) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope', 'check', v_check);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.change_scenario_set_member(uuid,uuid,uuid,uuid,uuid,uuid,boolean,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.change_scenario_set_member(uuid,uuid,uuid,uuid,uuid,uuid,boolean,text,uuid,uuid) TO eye_commit;

/* ACTIVATE (prediction.scenario.set.activate) / RETIRE (prediction.scenario.set.retire): the owner (or an administrator). Activation
   needs a member and runs the check (trigger activate — a failing set is activated and its gap flagged); a retirement says why and is
   refused while the set is bound to a package still in flight (draft, proposed, under review, approved — a retirement never opens the
   gate). p_state names the target: active | retired. */
CREATE OR REPLACE FUNCTION prediction.transition_scenario_set(p_set_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v_check jsonb := NULL; v_live_pkg text;
BEGIN
  PERFORM observation.assert_authority(ARRAY[CASE WHEN p_state = 'retired' THEN 'prediction.scenario.set.retire' ELSE 'prediction.scenario.set.activate' END]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario set rejected (actor): transitioned by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_state IS NULL OR p_state NOT IN ('active', 'retired') THEN RAISE EXCEPTION 'scenario set rejected (transition): a set is activated or retired' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  IF NOT prediction.pss_owner_or_admin(s.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'scenario set rejected (authority): a set is activated and retired by its owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF p_state = 'active' THEN
    IF s.state <> 'draft' THEN RAISE EXCEPTION 'scenario set rejected (state): set % is %; only a draft set is activated', p_set_id, s.state USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM prediction.scenario_set_members x WHERE x.set_id = p_set_id AND x.removed_at IS NULL) THEN
      RAISE EXCEPTION 'scenario set rejected (empty): set % has no member; a set is activated over scenarios', p_set_id USING ERRCODE = '22023';
    END IF;
    UPDATE prediction.scenario_sets SET state = 'active', activated_by = p_actor, activated_at = clock_timestamp(), updated_at = clock_timestamp() WHERE set_id = p_set_id RETURNING * INTO s;
    PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.activated', s.version, p_actor, '{}'::jsonb, p_correlation);
    v_check := prediction.pss_record_check(gen_random_uuid(), p_set_id, p_tenant, p_domain, 'activate', p_actor, p_correlation);
    SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id;
  ELSE
    IF s.state = 'retired' THEN RAISE EXCEPTION 'scenario set rejected (state): set % was retired at %', p_set_id, s.retired_at USING ERRCODE = '22023'; END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'scenario set rejected (reason): a retirement says why (8+ characters)' USING ERRCODE = '22023'; END IF;
    SELECT string_agg(format('%s (%s)', p.title, p.state), ', ') INTO v_live_pkg FROM decision.package_scenario_sets ps JOIN decision.packages_current p ON p.package_id = ps.package_id
     WHERE ps.set_id = p_set_id AND p.state IN ('draft', 'proposed', 'under_review', 'approved', 'reopened');
    IF v_live_pkg IS NOT NULL THEN
      RAISE EXCEPTION 'scenario set rejected (bound): set % is bound to package(s) still in flight — %; it is not retired while it gates a recommendation', p_set_id, v_live_pkg USING ERRCODE = '22023';
    END IF;
    UPDATE prediction.scenario_sets SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retirement_reason = btrim(p_reason), updated_at = clock_timestamp() WHERE set_id = p_set_id RETURNING * INTO s;
    PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.retired', s.version, p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  END IF;
  RETURN jsonb_build_object('set', prediction.scenario_set_json(s), 'check', v_check);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.transition_scenario_set(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.transition_scenario_set(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* CHECK (prediction.scenario.set.check): a person's plurality check of an active set, recorded whatever the outcome (a new gap raises the
   owner's item; a pass closes the open ones). */
CREATE OR REPLACE FUNCTION prediction.check_scenario_set_plurality(p_check_id uuid, p_set_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.check']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario set rejected (actor): checked by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'scenario set rejected (state): set % is %; an active set is checked', p_set_id, s.state USING ERRCODE = '22023'; END IF;
  RETURN prediction.pss_record_check(p_check_id, p_set_id, p_tenant, p_domain, 'operator', p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.check_scenario_set_plurality(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.check_scenario_set_plurality(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* BIND (prediction.scenario.set.bind): the package's owner (or an administrator) binds an ACTIVE set to a package of this domain that is
   still open to a proposal (draft, proposed, under review, reopened); once per package and set; the check runs (trigger bind) so a gap is
   flagged to the set owner before anyone proposes. */
CREATE OR REPLACE FUNCTION prediction.bind_scenario_set(p_binding_id uuid, p_set_id uuid, p_package_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; p decision.packages_current%ROWTYPE; v_check jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.bind']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario set rejected (actor): bound by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario set rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503'; END IF;
  IF NOT prediction.pss_owner_or_admin(p.owner_principal_id, p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'scenario set rejected (authority): a set is bound to a package by the package''s owner or an administrator' USING ERRCODE = '42501';
  END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'scenario set rejected (state): set % is %; an active set is bound', p_set_id, s.state USING ERRCODE = '22023'; END IF;
  IF p.state NOT IN ('draft', 'proposed', 'under_review', 'reopened') THEN
    RAISE EXCEPTION 'scenario set rejected (state): package % is %; a set is bound to a package still open to a proposal', p_package_id, p.state USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.package_scenario_sets x WHERE x.package_id = p_package_id AND x.set_id = p_set_id) THEN
    RAISE EXCEPTION 'scenario set rejected (duplicate): set % is already bound to package %', p_set_id, p_package_id USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.package_scenario_sets (binding_id, scope, tenant_id, domain_id, package_id, set_id, bound_by, correlation_id)
  VALUES (p_binding_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_set_id, p_actor, p_correlation);
  PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.bound', s.version, p_actor, jsonb_build_object('binding_id', p_binding_id, 'package_id', p_package_id, 'package_title', p.title), p_correlation);
  v_check := prediction.pss_record_check(gen_random_uuid(), p_set_id, p_tenant, p_domain, 'bind', p_actor, p_correlation);
  RETURN jsonb_build_object('binding_id', p_binding_id, 'set_id', p_set_id, 'package_id', p_package_id, 'bound_by', p_actor, 'check', v_check);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.bind_scenario_set(uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.bind_scenario_set(uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §S.3 THE COMPARATOR AND THE READS (invoker reads under the caller's RLS)
-- ═════════════════════════════════════════════════════════════════════
/* The comparator's freshness threshold: an indicator whose last observation is older than this many days is shown STALE (a display rule
   of the comparator; §Q judges freshness against each indicator's cadence). */
CREATE OR REPLACE FUNCTION prediction.scenario_set_stale_days() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 14 $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_stale_days() TO eye_app, eye_commit;

/* §A's elements of a branch (and its scenario's scenario-level elements), when §A's table exists (to_regclass — this part stands alone);
   NULL when it does not. */
CREATE OR REPLACE FUNCTION prediction.pss_elements_of(p_scenario_id uuid, p_branch_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF to_regclass('prediction.scenario_elements') IS NULL THEN RETURN NULL; END IF;
  BEGIN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(e) - ''tenant_id'' - ''domain_id'' - ''correlation_id'' - ''scope'' ORDER BY e.kind, e.name), ''[]''::jsonb)
               FROM prediction.scenario_elements e WHERE e.scenario_id = $1 AND (e.branch_id IS NULL OR e.branch_id = $2) AND e.state = ''active'''
      INTO v USING p_scenario_id, p_branch_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN RETURN jsonb_build_object('unavailable', 'the anatomy table does not carry the columns this read expects');
  END;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION prediction.pss_elements_of(uuid, uuid) TO eye_app, eye_commit;

/* §Q's governed probability of a branch (its newest row: the band, the method, the basis, whether withdrawn), when §Q's table exists;
   NULL when it does not or no probability was set. Never derived here. */
CREATE OR REPLACE FUNCTION prediction.pss_probability_of(p_branch_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  -- §I (the integrator): §Q's CURRENT view — the latest set, a withdrawn probability not shown (its ledger has recorded_at, not set_at)
  IF to_regclass('prediction.branch_probabilities_current') IS NULL THEN RETURN NULL; END IF;
  BEGIN
    EXECUTE 'SELECT to_jsonb(p) - ''tenant_id'' - ''domain_id'' - ''correlation_id'' - ''scope'' FROM prediction.branch_probabilities_current p WHERE p.branch_id = $1 ORDER BY p.set_at DESC LIMIT 1'
      INTO v USING p_branch_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN RETURN jsonb_build_object('unavailable', 'the probability table does not carry the columns this read expects');
  END;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION prediction.pss_probability_of(uuid) TO eye_app, eye_commit;

/* THE COMPARATOR (CAP-DS-02): the set's branches SIDE BY SIDE — live first by kind, then the not-live ones with the reason — each with
   its scenario, kind, kind label, state (suspended with its reason and instant), statement, divergence, assumptions, §A's elements, the
   indicator with its freshness, the signpost, the consequence and its class, §Q's governed probability; the plurality verdict beside. */
CREATE OR REPLACE FUNCTION prediction.scenario_set_compare(p_set_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN s.set_id IS NULL THEN NULL ELSE jsonb_build_object(
    'set', prediction.scenario_set_json(s),
    'as_of', clock_timestamp(),
    'plurality', prediction.scenario_set_plurality(s.set_id),
    'anatomy_available', to_regclass('prediction.scenario_elements') IS NOT NULL,
    'probability_available', to_regclass('prediction.branch_probabilities') IS NOT NULL,
    'stale_after_days', prediction.scenario_set_stale_days(),
    'branches', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'branch_id', b.branch_id, 'scenario_id', b.scenario_id, 'scenario_title', sc.title, 'scenario_state', sc.state, 'scenario_version', sc.current_version,
               'coherence_state', sc.coherence_state, 'name', b.name, 'kind', b.kind, 'kind_label', b.kind_label, 'state', b.state, 'live', x.counts, 'not_counted_reason', x.reason,
               'suspended_at', b.suspended_at, 'suspension_reason', b.suspension_reason,
               'statement', b.statement, 'divergence', b.divergence, 'assumptions', b.assumptions, 'signpost', b.signpost,
               'consequence', b.consequence, 'consequence_class', b.consequence_class, 'owner_principal_id', b.owner_principal_id, 'added_in_version', b.added_in_version,
               'indicator', CASE WHEN i.indicator_id IS NULL THEN NULL ELSE jsonb_build_object(
                  'indicator_id', i.indicator_id, 'series_key', i.series_key, 'comparator', i.comparator, 'threshold', i.threshold, 'consecutive_days', i.consecutive_days,
                  'last_value', i.last_value, 'last_observation_at', i.last_observation_at, 'last_evaluated_at', i.last_evaluated_at, 'streak', i.streak, 'breached', i.breached,
                  'breached_at', i.breached_at, 'state', i.state, 'next_review_at', i.next_review_at,
                  'age_days', CASE WHEN i.last_observation_at IS NULL THEN NULL ELSE (clock_timestamp()::date - i.last_observation_at) END,
                  'freshness', CASE WHEN i.last_observation_at IS NULL THEN 'missing'
                                    WHEN (clock_timestamp()::date - i.last_observation_at) > prediction.scenario_set_stale_days() THEN 'stale' ELSE 'fresh' END) END,
               'elements', prediction.pss_elements_of(b.scenario_id, b.branch_id),
               'probability', prediction.pss_probability_of(b.branch_id))
             ORDER BY x.counts DESC, array_position(ARRAY['baseline', 'upside', 'downside', 'disruption', 'stress', 'adversarial', 'counterfactual', 'user-defined'], b.kind), sc.title, b.name)
        FROM prediction.scenario_set_branches(s.set_id) x
        JOIN prediction.branches_current b ON b.branch_id = x.branch_id
        JOIN prediction.scenarios_current sc ON sc.scenario_id = b.scenario_id
        LEFT JOIN prediction.indicators_current i ON i.indicator_id = b.indicator_id), '[]'::jsonb)) END
    FROM (SELECT 1) one LEFT JOIN prediction.scenario_sets s ON s.set_id = p_set_id $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_compare(uuid) TO eye_app, eye_commit;

/* THE SET (a read): the row, its members (current and removed), the latest checks, the bindings, the latest portfolio reviews, the ledger's tail. */
CREATE OR REPLACE FUNCTION prediction.scenario_set_read(p_set_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, decision, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN s.set_id IS NULL THEN NULL ELSE prediction.scenario_set_json(s) || jsonb_build_object(
    'members', coalesce((SELECT jsonb_agg((to_jsonb(m) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope') || jsonb_build_object('scenario_title', sc.title, 'scenario_state', sc.state, 'branch_name', b.name, 'branch_kind', b.kind)
                                          ORDER BY m.removed_at NULLS FIRST, m.added_at)
                         FROM prediction.scenario_set_members m JOIN prediction.scenarios_current sc ON sc.scenario_id = m.scenario_id LEFT JOIN prediction.branches_current b ON b.branch_id = m.branch_id
                        WHERE m.set_id = s.set_id), '[]'::jsonb),
    'checks', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope' ORDER BY c.as_of DESC)
                        FROM (SELECT * FROM prediction.scenario_set_checks c0 WHERE c0.set_id = s.set_id ORDER BY c0.as_of DESC LIMIT 10) c), '[]'::jsonb),
    'bindings', coalesce((SELECT jsonb_agg(jsonb_build_object('binding_id', ps.binding_id, 'package_id', ps.package_id, 'package_title', p.title, 'package_state', p.state, 'current_version', p.current_version, 'bound_by', ps.bound_by, 'bound_at', ps.bound_at) ORDER BY ps.bound_at)
                          FROM decision.package_scenario_sets ps LEFT JOIN decision.packages_current p ON p.package_id = ps.package_id WHERE ps.set_id = s.set_id), '[]'::jsonb),
    'reviews', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope' ORDER BY r.reviewed_at DESC)
                         FROM (SELECT * FROM prediction.portfolio_reviews r0 WHERE r0.set_id = s.set_id ORDER BY r0.reviewed_at DESC LIMIT 5) r), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event', e.event, 'set_version', e.set_version, 'actor', e.actor_principal_id, 'details', e.details, 'occurred_at', e.occurred_at) ORDER BY e.occurred_at DESC, e.event_id)
                        FROM (SELECT * FROM prediction.scenario_set_events e0 WHERE e0.set_id = s.set_id ORDER BY e0.occurred_at DESC, e0.event_id LIMIT 30) e), '[]'::jsonb)) END
    FROM (SELECT 1) one LEFT JOIN prediction.scenario_sets s ON s.set_id = p_set_id $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_read(uuid) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §S.4 THE PORTFOLIO REVIEW
-- ═════════════════════════════════════════════════════════════════════
/* REVIEW (prediction.scenario.set.review): a named human's review of an ACTIVE set. p_members rates EVERY current member
   [{member_id, relevance: low|medium|high, consequence: C0..C4, note?}]; p_options names the options [{key, title}] — or NULL/[] to take the
   options of the bound package's current version (by key); p_payoffs is the option × branch matrix {option_key: {branch_id: number}} over
   EVERY live branch of the set (p_unit names the payoff's unit); p_retirements PROPOSES retirements [{scenario_id, note}] of member
   scenarios (the scenario owner's review retires). The port computes ROBUSTNESS (the worst payoff of an option over the live branches) and
   the maximum REGRET (max over branches of best-in-branch − the option's payoff), the most robust and least-regret options, and names the
   kinds the plurality policy misses. */
CREATE OR REPLACE FUNCTION prediction.review_scenario_portfolio(
  p_review_id uuid, p_set_id uuid, p_tenant uuid, p_domain uuid, p_members jsonb, p_options jsonb, p_payoffs jsonb, p_unit text, p_retirements jsonb, p_note text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenario_sets%ROWTYPE; v_plural jsonb; v_branches jsonb; v_options jsonb; v_members jsonb := '[]'::jsonb; v_pkg uuid; v_pkg_version int; e jsonb; m prediction.scenario_set_members%ROWTYPE;
        o record; b record; v_val numeric; v_rob jsonb := '{}'::jsonb; v_reg jsonb := '{}'::jsonb; v_best numeric; v_worst numeric; v_max_reg numeric; v_top numeric; v_low numeric;
        v_most text[]; v_least text[]; v_ret jsonb := '[]'::jsonb; v_keys text[]; v_live uuid[]; v_out prediction.portfolio_reviews%ROWTYPE; v_payoffs jsonb := '{}'::jsonb; row_obj jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.set.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'portfolio review rejected (actor): reviewed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_actor AND x.kind = 'human' AND x.status = 'active') THEN
    RAISE EXCEPTION 'portfolio review rejected (actor): a portfolio review is a named human''s act' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM prediction.scenario_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'portfolio review rejected (unknown_set): % is not a scenario set of this domain', p_set_id USING ERRCODE = '23503'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'portfolio review rejected (state): set % is %; an active set is reviewed', p_set_id, s.state USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'portfolio review rejected (note): a review states its conclusion (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_unit IS NULL OR length(btrim(p_unit)) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'portfolio review rejected (unit): the payoffs name their unit (1 to 64 characters)' USING ERRCODE = '22023'; END IF;
  -- the MEMBERS: every current member rated once — relevance and consequence
  IF p_members IS NULL OR jsonb_typeof(p_members) <> 'array' THEN RAISE EXCEPTION 'portfolio review rejected (members): the review rates every member [{member_id, relevance, consequence}]' USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_members) x LOOP
    IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'member_id') <> 'string' OR (e ->> 'member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'portfolio review rejected (members): each rating names a member_id' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO m FROM prediction.scenario_set_members x WHERE x.member_id = (e ->> 'member_id')::uuid AND x.set_id = p_set_id AND x.removed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'portfolio review rejected (unknown_member): % is not a current member of set %', e ->> 'member_id', p_set_id USING ERRCODE = '23503'; END IF;
    IF coalesce(e ->> 'relevance', '') NOT IN ('low', 'medium', 'high') THEN RAISE EXCEPTION 'portfolio review rejected (relevance): member % is rated low, medium or high', m.member_id USING ERRCODE = '22023'; END IF;
    IF coalesce(e ->> 'consequence', '') NOT IN ('C0', 'C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'portfolio review rejected (consequence): member % carries a consequence class C0..C4', m.member_id USING ERRCODE = '22023'; END IF;
    v_members := v_members || jsonb_build_object('member_id', m.member_id, 'scenario_id', m.scenario_id, 'branch_id', m.branch_id, 'relevance', e ->> 'relevance', 'consequence', e ->> 'consequence', 'note', nullif(btrim(coalesce(e ->> 'note', '')), ''));
  END LOOP;
  IF (SELECT count(DISTINCT x ->> 'member_id') FROM jsonb_array_elements(v_members) x) <> jsonb_array_length(v_members)
     OR jsonb_array_length(v_members) <> (SELECT count(*) FROM prediction.scenario_set_members x WHERE x.set_id = p_set_id AND x.removed_at IS NULL) THEN
    RAISE EXCEPTION 'portfolio review rejected (members): every current member of the set is rated exactly once (% rating(s) for % member(s))', jsonb_array_length(v_members),
      (SELECT count(*) FROM prediction.scenario_set_members x WHERE x.set_id = p_set_id AND x.removed_at IS NULL) USING ERRCODE = '22023';
  END IF;
  -- the OPTIONS: named, or the bound package's current version's
  IF p_options IS NULL OR (jsonb_typeof(p_options) = 'array' AND jsonb_array_length(p_options) = 0) THEN
    SELECT ps.package_id, p.current_version INTO v_pkg, v_pkg_version FROM decision.package_scenario_sets ps JOIN decision.packages_current p ON p.package_id = ps.package_id
     WHERE ps.set_id = p_set_id ORDER BY ps.bound_at DESC LIMIT 1;
    IF v_pkg IS NULL OR v_pkg_version IS NULL THEN RAISE EXCEPTION 'portfolio review rejected (options): the set is bound to no package with a version; name the options [{key, title}]' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', o2.key, 'title', o2.title, 'source', 'package') ORDER BY o2.key), '[]'::jsonb) INTO v_options FROM decision.options o2 WHERE o2.package_id = v_pkg AND o2.version = v_pkg_version;
  ELSE
    IF jsonb_typeof(p_options) <> 'array' THEN RAISE EXCEPTION 'portfolio review rejected (options): the options are a list [{key, title}]' USING ERRCODE = '22023'; END IF;
    v_options := '[]'::jsonb;
    FOR e IN SELECT x FROM jsonb_array_elements(p_options) x LOOP
      IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'key', '') !~ '^[a-z0-9][a-z0-9_-]{0,63}$' OR length(btrim(coalesce(e ->> 'title', ''))) NOT BETWEEN 2 AND 256 THEN
        RAISE EXCEPTION 'portfolio review rejected (options): each option has a key (lower-case, 1-64) and a title (2-256 characters)' USING ERRCODE = '22023';
      END IF;
      v_options := v_options || jsonb_build_object('key', e ->> 'key', 'title', btrim(e ->> 'title'), 'source', 'named');
    END LOOP;
  END IF;
  v_keys := ARRAY(SELECT x ->> 'key' FROM jsonb_array_elements(v_options) x);
  IF cardinality(v_keys) < 2 OR cardinality(v_keys) > 12 OR cardinality(v_keys) <> (SELECT count(DISTINCT k) FROM unnest(v_keys) k) THEN
    RAISE EXCEPTION 'portfolio review rejected (options): a review compares 2 to 12 options, each key once (% given)', cardinality(v_keys) USING ERRCODE = '22023';
  END IF;
  -- the LIVE branches the matrix is over
  SELECT coalesce(array_agg(x.branch_id ORDER BY x.branch_id), ARRAY[]::uuid[]), coalesce(jsonb_agg(jsonb_build_object('branch_id', x.branch_id, 'scenario_id', x.scenario_id, 'name', x.name, 'kind', x.kind, 'kind_label', x.kind_label) ORDER BY x.branch_id), '[]'::jsonb)
    INTO v_live, v_branches FROM prediction.scenario_set_branches(p_set_id) x WHERE x.counts;
  IF cardinality(v_live) = 0 THEN RAISE EXCEPTION 'portfolio review rejected (state): set % counts no live branch; nothing to weigh the options against', p_set_id USING ERRCODE = '22023'; END IF;
  -- the PAYOFF matrix: every option × every live branch a number; nothing else
  IF p_payoffs IS NULL OR jsonb_typeof(p_payoffs) <> 'object' THEN RAISE EXCEPTION 'portfolio review rejected (payoffs): the payoffs are an object {option_key: {branch_id: number}}' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payoffs) k WHERE k <> ALL (v_keys)) THEN
    RAISE EXCEPTION 'portfolio review rejected (payoffs): % is not an option of this review (%)', (SELECT k FROM jsonb_object_keys(p_payoffs) k WHERE k <> ALL (v_keys) LIMIT 1), array_to_string(v_keys, ', ') USING ERRCODE = '22023';
  END IF;
  FOREACH row_obj IN ARRAY ARRAY(SELECT jsonb_build_object('k', k) FROM unnest(v_keys) k) LOOP
    IF jsonb_typeof(p_payoffs -> (row_obj ->> 'k')) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'portfolio review rejected (payoffs): option % has no payoff row {branch_id: number}', row_obj ->> 'k' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payoffs -> (row_obj ->> 'k')) bk WHERE bk !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR bk::uuid <> ALL (v_live)) THEN
      RAISE EXCEPTION 'portfolio review rejected (payoffs): option % names a branch that is not a live branch of the set', row_obj ->> 'k' USING ERRCODE = '22023';
    END IF;
    FOR b IN SELECT unnest(v_live) AS branch_id LOOP
      IF jsonb_typeof(p_payoffs -> (row_obj ->> 'k') -> b.branch_id::text) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'portfolio review rejected (payoffs): option % has no payoff for the live branch % (every option is weighed against every live branch)', row_obj ->> 'k', b.branch_id USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_payoffs := v_payoffs || jsonb_build_object(row_obj ->> 'k', p_payoffs -> (row_obj ->> 'k'));
  END LOOP;
  -- ROBUSTNESS (the worst payoff) and the maximum REGRET (max over branches of best-in-branch − the option's payoff)
  FOR o IN SELECT unnest(v_keys) AS k LOOP
    v_worst := NULL; v_max_reg := 0;
    FOR b IN SELECT unnest(v_live) AS branch_id LOOP
      v_val := (v_payoffs -> o.k ->> b.branch_id::text)::numeric;
      SELECT max((v_payoffs -> k2 ->> b.branch_id::text)::numeric) INTO v_best FROM unnest(v_keys) k2;
      v_worst := CASE WHEN v_worst IS NULL THEN v_val ELSE least(v_worst, v_val) END;
      v_max_reg := greatest(v_max_reg, v_best - v_val);
    END LOOP;
    v_rob := v_rob || jsonb_build_object(o.k, v_worst);
    v_reg := v_reg || jsonb_build_object(o.k, v_max_reg);
  END LOOP;
  SELECT max((v_rob ->> k)::numeric), min((v_reg ->> k)::numeric) INTO v_top, v_low FROM unnest(v_keys) k;
  v_most := ARRAY(SELECT k FROM unnest(v_keys) k WHERE (v_rob ->> k)::numeric = v_top ORDER BY k);
  v_least := ARRAY(SELECT k FROM unnest(v_keys) k WHERE (v_reg ->> k)::numeric = v_low ORDER BY k);
  -- the RETIREMENTS proposed (member scenarios only)
  IF p_retirements IS NOT NULL AND jsonb_typeof(p_retirements) <> 'array' THEN RAISE EXCEPTION 'portfolio review rejected (retirements): retirements are a list [{scenario_id, note}]' USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(coalesce(p_retirements, '[]'::jsonb)) x LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'scenario_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR length(btrim(coalesce(e ->> 'note', ''))) < 8 THEN
      RAISE EXCEPTION 'portfolio review rejected (retirements): each proposed retirement names a scenario_id and a note (8+ characters)' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM prediction.scenario_set_members x WHERE x.set_id = p_set_id AND x.scenario_id = (e ->> 'scenario_id')::uuid AND x.removed_at IS NULL) THEN
      RAISE EXCEPTION 'portfolio review rejected (unknown_member): scenario % is not a member of set %', e ->> 'scenario_id', p_set_id USING ERRCODE = '23503';
    END IF;
    v_ret := v_ret || jsonb_build_object('scenario_id', (e ->> 'scenario_id')::uuid, 'note', btrim(e ->> 'note'), 'owner', (SELECT owner_principal_id FROM prediction.scenarios_current WHERE scenario_id = (e ->> 'scenario_id')::uuid),
                                         'act', 'the scenario owner retires it through the review (outcome retire)');
  END LOOP;
  v_plural := prediction.scenario_set_plurality(p_set_id);
  IF v_pkg IS NULL THEN
    SELECT ps.package_id, p.current_version INTO v_pkg, v_pkg_version FROM decision.package_scenario_sets ps JOIN decision.packages_current p ON p.package_id = ps.package_id
     WHERE ps.set_id = p_set_id AND p.current_version IS NOT NULL ORDER BY ps.bound_at DESC LIMIT 1;
  END IF;
  INSERT INTO prediction.portfolio_reviews (review_id, scope, tenant_id, domain_id, set_id, set_version, package_id, package_version, reviewer, members, branches, options, payoffs, robustness, regret,
                                            most_robust, least_regret, missing_kinds, plurality, retirements_proposed, payoff_unit, note, correlation_id)
  VALUES (p_review_id, 'DOMAIN', p_tenant, p_domain, p_set_id, s.version, v_pkg, v_pkg_version, p_actor, v_members, v_branches, v_options, v_payoffs, v_rob, v_reg,
          v_most, v_least, ARRAY(SELECT jsonb_array_elements_text(v_plural -> 'missing_kinds')), v_plural, v_ret, btrim(p_unit), btrim(p_note), p_correlation) RETURNING * INTO v_out;
  PERFORM prediction.pss_event(p_set_id, p_tenant, p_domain, 'set.reviewed', s.version, p_actor,
            jsonb_build_object('review_id', p_review_id, 'most_robust', to_jsonb(v_most), 'least_regret', to_jsonb(v_least), 'missing_kinds', v_plural -> 'missing_kinds', 'retirements_proposed', jsonb_array_length(v_ret)), p_correlation);
  RETURN to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.review_scenario_portfolio(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.review_scenario_portfolio(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,jsonb,text,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §S.5 LIVING SCENARIOS
-- ═════════════════════════════════════════════════════════════════════
/* THE RELEVANCE of one scenario (pure; the rule v1): movement = the largest, over the scenario's live non-baseline branches, of 1 for an
   indicator with a breach on record (breached now, or breached_at set — evaluate_indicator resets `breached` once the run ends, the
   instant stays) and streak / consecutive_days otherwise (how far the run toward the threshold has gone); signposts = the live branches
   whose indicator has a breach on record; review_due = next_review_due_at has passed. score = min(1, 0.6·movement + 0.2·[signposts > 0] +
   0.2·[review_due]), rounded to 3 places. */
CREATE OR REPLACE FUNCTION prediction.scenario_relevance_of(p_scenario_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  WITH br AS (
    SELECT b.branch_id, b.name, b.kind, i.indicator_id, i.breached, i.breached_at, i.streak, i.consecutive_days, i.last_value, i.threshold, i.comparator,
           CASE WHEN i.indicator_id IS NULL THEN 0::numeric WHEN i.breached OR i.breached_at IS NOT NULL THEN 1::numeric ELSE least(1::numeric, greatest(0, i.streak)::numeric / greatest(1, i.consecutive_days)) END AS movement
      FROM prediction.branches_current b LEFT JOIN prediction.indicators_current i ON i.indicator_id = b.indicator_id
     WHERE b.scenario_id = p_scenario_id AND prediction.branch_live(b.state) AND b.kind <> 'baseline'),
  agg AS (SELECT coalesce(max(movement), 0) AS movement, count(*) FILTER (WHERE breached OR breached_at IS NOT NULL) AS signposts,
                 coalesce(jsonb_agg(jsonb_build_object('branch_id', branch_id, 'name', name, 'kind', kind, 'indicator_id', indicator_id, 'movement', round(movement, 3), 'breached', coalesce(breached, false) OR breached_at IS NOT NULL,
                                                       'breached_at', breached_at, 'streak', streak, 'consecutive_days', consecutive_days, 'last_value', last_value, 'comparator', comparator, 'threshold', threshold) ORDER BY name), '[]'::jsonb) AS branches
            FROM br),
  sc AS (SELECT s.next_review_due_at, s.next_review_due_at IS NOT NULL AND s.next_review_due_at < clock_timestamp() AS review_due FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id)
  SELECT jsonb_build_object(
    'score', round(least(1::numeric, 0.6 * agg.movement + CASE WHEN agg.signposts > 0 THEN 0.2 ELSE 0 END + CASE WHEN sc.review_due THEN 0.2 ELSE 0 END), 3),
    'basis', jsonb_build_object('rule', 'relevance v1: min(1, 0.6·movement + 0.2·signpost breached + 0.2·review due)', 'movement', round(agg.movement, 3), 'signposts_breached', agg.signposts,
                                'review_due', sc.review_due, 'next_review_due_at', sc.next_review_due_at, 'branches', agg.branches))
    FROM agg, sc $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_relevance_of(uuid) TO eye_app, eye_commit;

/* SCORE (the tick step `scenario-relevance`, executive.attention.tick; or a person's act, prediction.scenario.relevance.score): every
   ACTIVE scenario that is a member of an ACTIVE set of this domain (the living portfolio) is scored; a row and the scenario's
   `scenario.relevance_scored` only when the score or its basis changed since the last row; each live branch whose signpost (indicator) is
   breached notifies the scenario OWNER ONCE per breach (`scenario.signpost_notified` on the scenario's ledger, the attention item of class
   scenario.signpost on the branch). */
CREATE OR REPLACE FUNCTION prediction.score_scenario_relevance(p_tenant uuid, p_domain uuid, p_trigger text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x record; br record; v jsonb; last prediction.scenario_relevance%ROWTYPE; v_scored int := 0; v_changed int := 0; v_notified int := 0; v_ev uuid; v_item uuid; v_state text; v_due timestamptz;
        v_out jsonb := '[]'::jsonb; v_reasons jsonb; v_basis_cmp jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick', 'prediction.scenario.relevance.score']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_trigger IS NULL OR p_trigger NOT IN ('tick', 'operator') THEN RAISE EXCEPTION 'scenario set rejected (trigger): relevance is scored by the tick or an operator' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT DISTINCT sc.scenario_id, sc.title, sc.owner_principal_id FROM prediction.scenarios_current sc
             JOIN prediction.scenario_set_members m ON m.scenario_id = sc.scenario_id AND m.removed_at IS NULL
             JOIN prediction.scenario_sets s ON s.set_id = m.set_id AND s.state = 'active'
            WHERE sc.tenant_id = p_tenant AND sc.domain_id = p_domain AND sc.state = 'active' ORDER BY sc.scenario_id LOOP
    v := prediction.scenario_relevance_of(x.scenario_id);
    v_scored := v_scored + 1;
    SELECT * INTO last FROM prediction.scenario_relevance r WHERE r.scenario_id = x.scenario_id ORDER BY r.scored_at DESC, r.relevance_id DESC LIMIT 1;
    -- the basis compared without the instants that move by themselves
    v_basis_cmp := (v -> 'basis') - 'next_review_due_at';
    IF last.relevance_id IS NULL OR last.score <> (v ->> 'score')::numeric OR (last.basis - 'next_review_due_at') IS DISTINCT FROM v_basis_cmp THEN
      INSERT INTO prediction.scenario_relevance (relevance_id, scope, tenant_id, domain_id, scenario_id, score, basis, trigger, scored_by, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.scenario_id, (v ->> 'score')::numeric, v -> 'basis', p_trigger, p_actor, p_correlation);
      INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.scenario_id, 'scenario.relevance_scored', p_actor, jsonb_build_object('score', (v ->> 'score')::numeric, 'prior', last.score, 'trigger', p_trigger), p_correlation);
      v_changed := v_changed + 1;
    END IF;
    -- the SIGNPOSTS: once per breach (the branch, the indicator's breached_at)
    FOR br IN SELECT b.branch_id, b.name, i.indicator_id, i.breached_at, i.series_key, i.comparator, i.threshold, i.last_value
                FROM prediction.branches_current b JOIN prediction.indicators_current i ON i.indicator_id = b.indicator_id
               WHERE b.scenario_id = x.scenario_id AND prediction.branch_live(b.state) AND i.breached_at IS NOT NULL ORDER BY b.branch_id LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM prediction.scenario_events e WHERE e.scenario_id = x.scenario_id AND e.event = 'scenario.signpost_notified'
                              AND e.branch_id = br.branch_id AND (e.details ->> 'breached_at')::timestamptz = br.breached_at);
      v_ev := gen_random_uuid(); v_item := gen_random_uuid(); v_due := clock_timestamp() + interval '24 hours';
      v_state := CASE WHEN EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = x.owner_principal_id AND p.kind = 'human' AND p.status = 'active') THEN 'open' ELSE 'unrouted' END;
      INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
      VALUES (v_ev, 'DOMAIN', p_tenant, p_domain, x.scenario_id, br.branch_id, 'scenario.signpost_notified', p_actor,
              jsonb_build_object('indicator_id', br.indicator_id, 'breached_at', br.breached_at, 'item_id', v_item, 'owner', x.owner_principal_id), p_correlation);
      v_reasons := jsonb_build_array(format('the signpost of branch "%s" is breached: %s %s %s (last %s) since %s', br.name, br.series_key, br.comparator, br.threshold, coalesce(br.last_value::text, '—'), br.breached_at),
                                     'the scenario is a member of an active set: review its relevance and the set''s portfolio');
      INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
      VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'scenario.signpost', 'branch', br.branch_id, v_ev, 'ScenarioSignpostBreached',
              left(format('Signpost breached: %s — %s', x.title, br.name), 512), 'material', v_state, x.owner_principal_id, '{}',
              jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
              jsonb_build_object('scenario_id', x.scenario_id, 'branch_id', br.branch_id, 'indicator_id', br.indicator_id, 'breached_at', br.breached_at), v_due, 0, p_correlation);
      PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
                jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', x.owner_principal_id, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                                   'cause_event_id', v_ev, 'cause_event_type', 'ScenarioSignpostBreached', 'unrouted', v_state = 'unrouted', 'scenario_id', x.scenario_id), p_correlation);
      v_notified := v_notified + 1;
    END LOOP;
    v_out := v_out || jsonb_build_object('scenario_id', x.scenario_id, 'score', (v ->> 'score')::numeric, 'changed', last.relevance_id IS NULL OR last.score <> (v ->> 'score')::numeric OR (last.basis - 'next_review_due_at') IS DISTINCT FROM v_basis_cmp);
  END LOOP;
  RETURN jsonb_build_object('scored', v_scored, 'changed', v_changed, 'signposts_notified', v_notified, 'scenarios', v_out);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.score_scenario_relevance(uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.score_scenario_relevance(uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §S.6 CREATION TRIGGERS
-- ═════════════════════════════════════════════════════════════════════
/* PROPOSE (prediction.scenario.proposal.propose): a person (or an agent holding the action) proposes that a scenario be declared, naming
   the SOURCE the port validates:
     forecast_shift  {forecast_id, band_pct}: the forecast superseded an earlier one of its series and horizon and its median moved beyond
                     band_pct (0 < band_pct ≤ 10, a fraction of the earlier median) — the scenarios built on the earlier forecast are named;
     weak_signal     {signal_id}: a weak signal of this domain a named human ESCALATED (0088);
     risk            {exposure_id}: an ACCEPTED exposure whose newest residual breaches its appetite (0089);
     planning_cycle  {cadence_id}: a cadence of this domain that was RESET (0094) — the reset event is the source.
   One OPEN proposal per source; routed to the domain's strategy owners (scenario.proposal); the related scenario's ledger records it. */
CREATE OR REPLACE FUNCTION prediction.propose_scenario(
  p_proposal_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_source jsonb, p_title text, p_rationale text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_key text; v_facts jsonb; v_related uuid; f prediction.forecasts_current%ROWTYPE; prev prediction.forecasts_current%ROWTYPE; v_band numeric; v_shift numeric;
        sig prediction.signals_current%ROWTYPE; ex record; res record; cad record; v_kind text; v_item uuid; v_state text; v_reasons jsonb; v_due timestamptz; r prediction.scenario_proposals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.proposal.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario proposal rejected (actor): proposed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT kind INTO v_kind FROM identity.principals WHERE id = p_actor;
  IF p_kind IS NULL OR p_kind NOT IN ('forecast_shift', 'weak_signal', 'risk', 'planning_cycle') THEN
    RAISE EXCEPTION 'scenario proposal rejected (kind): a proposal comes from a forecast_shift, a weak_signal, a risk or a planning_cycle' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 4 AND 256 THEN RAISE EXCEPTION 'scenario proposal rejected (title): a proposal names the scenario it proposes (4 to 256 characters)' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'scenario proposal rejected (rationale): a proposal says why (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_source IS NULL OR jsonb_typeof(p_source) <> 'object' THEN RAISE EXCEPTION 'scenario proposal rejected (source): the source is an object naming the object it rests on' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'forecast_shift' THEN
    IF coalesce(p_source ->> 'forecast_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR jsonb_typeof(p_source -> 'band_pct') <> 'number' THEN
      RAISE EXCEPTION 'scenario proposal rejected (source): a forecast shift names {forecast_id, band_pct}' USING ERRCODE = '22023';
    END IF;
    v_band := (p_source ->> 'band_pct')::numeric;
    IF v_band <= 0 OR v_band > 10 THEN RAISE EXCEPTION 'scenario proposal rejected (source): band_pct is a fraction of the earlier median in (0, 10]' USING ERRCODE = '22023'; END IF;
    SELECT * INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = (p_source ->> 'forecast_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario proposal rejected (unknown_forecast): % is not a forecast of this domain', p_source ->> 'forecast_id' USING ERRCODE = '23503'; END IF;
    SELECT * INTO prev FROM prediction.forecasts_current x WHERE x.superseded_by = f.forecast_id ORDER BY x.issued_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario proposal rejected (source): forecast % superseded no earlier forecast of its series and horizon; a shift is measured against the one it replaced', f.forecast_id USING ERRCODE = '22023'; END IF;
    v_shift := abs((f.quantiles ->> 'q50')::numeric - (prev.quantiles ->> 'q50')::numeric) / nullif(abs((prev.quantiles ->> 'q50')::numeric), 0);
    IF v_shift IS NOT NULL AND v_shift <= v_band THEN
      RAISE EXCEPTION 'scenario proposal rejected (within_band): the median moved % → % (a shift of %), within the stated band %', prev.quantiles ->> 'q50', f.quantiles ->> 'q50', round(v_shift, 4), v_band USING ERRCODE = '22023';
    END IF;
    v_key := f.forecast_id::text;
    SELECT s.scenario_id INTO v_related FROM prediction.scenarios_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.state = 'active' AND s.forecast_id IN (prev.forecast_id, f.forecast_id) ORDER BY s.declared_at LIMIT 1;
    v_facts := jsonb_build_object('forecast_id', f.forecast_id, 'series_key', f.series_key, 'horizon', f.horizon_code, 'q50', (f.quantiles ->> 'q50')::numeric, 'superseded_forecast_id', prev.forecast_id,
                                  'prior_q50', (prev.quantiles ->> 'q50')::numeric, 'shift', CASE WHEN v_shift IS NULL THEN NULL ELSE round(v_shift, 4) END, 'band_pct', v_band,
                                  'scenarios_on_earlier_forecast', (SELECT coalesce(jsonb_agg(s.scenario_id), '[]'::jsonb) FROM prediction.scenarios_current s WHERE s.forecast_id = prev.forecast_id AND s.state = 'active'));
  ELSIF p_kind = 'weak_signal' THEN
    IF coalesce(p_source ->> 'signal_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'scenario proposal rejected (source): a weak signal names {signal_id}' USING ERRCODE = '22023'; END IF;
    SELECT * INTO sig FROM prediction.signals_current x WHERE x.signal_id = (p_source ->> 'signal_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario proposal rejected (unknown_signal): % is not a weak signal of this domain', p_source ->> 'signal_id' USING ERRCODE = '23503'; END IF;
    IF sig.disposition IS DISTINCT FROM 'escalate' THEN
      RAISE EXCEPTION 'scenario proposal rejected (source): signal % is % (disposition %); a proposal rests on an ESCALATED weak signal', sig.signal_id, sig.maturity, coalesce(sig.disposition, 'none') USING ERRCODE = '22023';
    END IF;
    v_key := sig.signal_id::text;
    v_facts := jsonb_build_object('signal_id', sig.signal_id, 'title', sig.title, 'maturity', sig.maturity, 'disposition', sig.disposition, 'disposition_by', sig.disposition_by, 'disposition_at', sig.disposition_at, 'candidate_id', sig.candidate_id);
  ELSIF p_kind = 'risk' THEN
    IF coalesce(p_source ->> 'exposure_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'scenario proposal rejected (source): a risk names {exposure_id}' USING ERRCODE = '22023'; END IF;
    SELECT x.exposure_id, g.title, x.state, x.accepted_version, x.polarity INTO ex FROM prediction.exposure_current x JOIN graph.strategy_current g ON g.strategy_object_id = x.exposure_id
     WHERE x.exposure_id = (p_source ->> 'exposure_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF ex.exposure_id IS NULL THEN RAISE EXCEPTION 'scenario proposal rejected (unknown_exposure): % is not an exposure of this domain', p_source ->> 'exposure_id' USING ERRCODE = '23503'; END IF;
    SELECT r2.residual_high, r2.threshold, r2.breach, r2.unit, r2.computed_at INTO res FROM prediction.exposure_residuals r2 WHERE r2.exposure_id = ex.exposure_id ORDER BY r2.computed_at DESC LIMIT 1;
    IF ex.polarity <> 'risk' THEN RAISE EXCEPTION 'scenario proposal rejected (source): exposure % is an opportunity; a risk proposal rests on a risk', ex.exposure_id USING ERRCODE = '22023'; END IF;
    IF ex.state <> 'accepted' OR res.breach IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'scenario proposal rejected (source): exposure % is % and its newest residual is %; a proposal rests on an accepted exposure above its appetite', ex.exposure_id, ex.state,
        CASE WHEN res.breach IS TRUE THEN 'outside appetite' WHEN res.breach IS FALSE THEN 'within appetite' ELSE 'not judged against an appetite' END USING ERRCODE = '22023';
    END IF;
    v_key := ex.exposure_id::text;
    v_facts := jsonb_build_object('exposure_id', ex.exposure_id, 'title', ex.title, 'state', ex.state, 'accepted_version', ex.accepted_version, 'residual_high', res.residual_high, 'threshold', res.threshold, 'unit', res.unit, 'computed_at', res.computed_at);
  ELSE
    IF coalesce(p_source ->> 'cadence_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'scenario proposal rejected (source): a planning cycle names {cadence_id}' USING ERRCODE = '22023'; END IF;
    SELECT e.event_id, e.event, e.occurred_at, e.cadence_id INTO cad FROM executive.cadence_events e WHERE e.cadence_id = (p_source ->> 'cadence_id')::uuid AND e.tenant_id = p_tenant AND e.domain_id = p_domain
       AND e.event IN ('cadence.reset', 'cadence.reset_confirmed') ORDER BY e.occurred_at DESC LIMIT 1;
    IF cad.event_id IS NULL THEN RAISE EXCEPTION 'scenario proposal rejected (source): cadence % of this domain has not been reset; a planning-cycle proposal rests on a reset', p_source ->> 'cadence_id' USING ERRCODE = '22023'; END IF;
    v_key := cad.event_id::text;
    v_facts := jsonb_build_object('cadence_id', cad.cadence_id, 'reset_event_id', cad.event_id, 'reset', cad.event, 'reset_at', cad.occurred_at);
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.scenario_proposals x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = p_kind AND x.source_key = v_key AND x.state = 'open') THEN
    RAISE EXCEPTION 'scenario proposal rejected (duplicate): a proposal from this % (%) is already open; resolve it first', p_kind, v_key USING ERRCODE = '22023';
  END IF;
  v_item := gen_random_uuid(); v_due := clock_timestamp() + interval '72 hours';
  v_state := CASE WHEN executive.role_holders(p_tenant, p_domain, ARRAY['strategy_owner']) > 0 THEN 'open' ELSE 'unrouted' END;
  INSERT INTO prediction.scenario_proposals (proposal_id, scope, tenant_id, domain_id, kind, source_ref, source_key, source_facts, related_scenario_id, title, rationale, proposed_by, proposed_kind, item_id, correlation_id)
  VALUES (p_proposal_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_source, v_key, v_facts, v_related, btrim(p_title), btrim(p_rationale), p_actor, CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'human' END, v_item, p_correlation)
  RETURNING * INTO r;
  v_reasons := jsonb_build_array(format('a %s proposes the scenario "%s"', replace(p_kind, '_', ' '), btrim(p_title)), btrim(p_rationale),
                                 'accepting records the decision to declare it; the scenario is declared by its owner through the scenario route');
  -- the subject: the proposal (subject kind scenario — the would-be scenario; the details name the proposal)
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'scenario.proposal', 'scenario', p_proposal_id, p_proposal_id, 'ScenarioProposed',
          left(format('Scenario proposed (%s): %s', replace(p_kind, '_', ' '), btrim(p_title)), 512), 'material', v_state, NULL, ARRAY['strategy_owner'],
          jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          jsonb_build_object('proposal_id', p_proposal_id, 'kind', p_kind, 'source', v_facts, 'related_scenario_id', v_related), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', NULL, 'route_roles', to_jsonb(ARRAY['strategy_owner']), 'due_at', v_due,
                               'cause_event_id', p_proposal_id, 'cause_event_type', 'ScenarioProposed', 'unrouted', v_state = 'unrouted', 'proposal_id', p_proposal_id), p_correlation);
  IF v_related IS NOT NULL THEN
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_related, 'scenario.proposed', p_actor, jsonb_build_object('proposal_id', p_proposal_id, 'kind', p_kind, 'title', btrim(p_title)), p_correlation);
  END IF;
  RETURN to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.propose_scenario(uuid,uuid,uuid,text,jsonb,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.propose_scenario(uuid,uuid,uuid,text,jsonb,text,text,uuid,uuid) TO eye_commit;

/* RESOLVE (prediction.scenario.proposal.resolve): a named STRATEGY OWNER (or an administrator) who did not propose it accepts or dismisses
   an OPEN proposal with a note; the routed item closes; accepting never declares a scenario. */
CREATE OR REPLACE FUNCTION prediction.resolve_scenario_proposal(p_proposal_id uuid, p_tenant uuid, p_domain uuid, p_resolution text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r prediction.scenario_proposals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.proposal.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'scenario proposal rejected (actor): resolved by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM prediction.scenario_proposals x WHERE x.proposal_id = p_proposal_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario proposal rejected (unknown_proposal): % is not a proposal of this domain', p_proposal_id USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['strategy_owner', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'scenario proposal rejected (authority): a proposal is resolved by a named strategy owner of the domain' USING ERRCODE = '42501';
  END IF;
  IF r.proposed_by = p_actor THEN RAISE EXCEPTION 'scenario proposal rejected (separation_of_duties): the proposer of a scenario does not resolve the proposal' USING ERRCODE = '42501'; END IF;
  IF r.state <> 'open' THEN RAISE EXCEPTION 'scenario proposal rejected (state): proposal % was % at %', p_proposal_id, r.state, r.resolved_at USING ERRCODE = '22023'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('accepted', 'dismissed') THEN RAISE EXCEPTION 'scenario proposal rejected (resolution): a proposal is accepted or dismissed' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'scenario proposal rejected (note): a resolution says why (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE prediction.scenario_proposals SET state = p_resolution, resolved_by = p_actor, resolved_at = clock_timestamp(), resolution_note = btrim(p_note) WHERE proposal_id = p_proposal_id RETURNING * INTO r;
  IF r.item_id IS NOT NULL AND EXISTS (SELECT 1 FROM executive.attention_items x WHERE x.item_id = r.item_id AND x.state <> 'closed') THEN
    UPDATE executive.attention_items SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, suppressed_until = NULL, updated_at = clock_timestamp() WHERE item_id = r.item_id;
    PERFORM executive.attention_event(r.item_id, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('reason', format('the proposal was %s', p_resolution), 'proposal_id', p_proposal_id), p_correlation);
  END IF;
  IF r.related_scenario_id IS NOT NULL THEN
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.related_scenario_id, 'scenario.proposal_resolved', p_actor, jsonb_build_object('proposal_id', p_proposal_id, 'resolution', p_resolution, 'note', btrim(p_note)), p_correlation);
  END IF;
  RETURN (to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope') || jsonb_build_object('declares', 'nothing — the owner declares the scenario through the scenario route');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.resolve_scenario_proposal(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.resolve_scenario_proposal(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;
