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
