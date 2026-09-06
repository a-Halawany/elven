-- ============================================================
-- 0032 — PHASE 5 · DIGITAL TWINS (L5), stage P5-M1: the twin registry.
--
-- The `twin` schema: twins declared by a person; versions that are drafts until
-- ADMITTED, immutable after, branchable (branch_id, forked_from_version); state
-- elements whose KIND is one of observed / estimated / assumed / predicted /
-- simulated and never collapsed, each substantiated by typed citations binding
-- exact object ids, versions and digests; materiality derived from the twin-kind
-- schema and the behaviour model's required inputs, never from the caller;
-- component health that says when a required input is missing, unreadable or
-- stale; synthetic state folding UPWARD from whatever is cited. In the shape of
-- 0029–0031: event logs beside projections, scope triple NOT NULL, FORCE ROW
-- LEVEL SECURITY, SECURITY DEFINER ports asserting the caller's own bound
-- action, and the canonical object TWN with the 43-column header.
--
--   §1  roles              twin_owner, simulation_operator
--   §2  registries         twin kinds (material keys) and behaviour models (required inputs)
--   §3  twins              events + projection
--   §4  versions           draft → admitted; branch lineage; verification by event
--   §5  state elements     kinds, citations, health — CHECKs that fail closed
--   §6  ports              declare, open version, ground, state-set digest, admit, mark unverified
--   §7  the Strategy Graph learns TWN as a dependent and `twin` as a target kind
--   §8  write action, schema TWN@v1, RLS, projection rebuild
-- ============================================================

-- ============================================================
-- 1. Roles.
-- ============================================================
INSERT INTO identity.roles (code, scope, description) VALUES
  ('twin_owner', 'DOMAIN',
   'Twin owner — declares twins, opens and grounds versions, admits them, and owns their validation status and limitations.'),
  ('simulation_operator', 'DOMAIN',
   'Simulation operator — runs, reproduces and compares simulations against admitted twin versions. Cannot declare, ground or admit a twin.')
ON CONFLICT (code) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS twin;
GRANT USAGE ON SCHEMA twin TO eye_app, eye_commit;

-- ============================================================
-- 2. Registries: what is MATERIAL is declared here, not by a caller.
-- ============================================================
CREATE TABLE twin.twin_kind_schemas (
  kind            text PRIMARY KEY CHECK (kind ~ '^[a-z][a-z0-9-]{1,40}$'),
  description     text NOT NULL,
  /* Element KEY PREFIXES (the part before ':') that are material for this kind of twin. */
  material_keys   text[] NOT NULL CHECK (array_length(material_keys, 1) >= 1),
  registered_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE twin.behaviour_models (
  method_ref            text PRIMARY KEY CHECK (method_ref ~ '^[a-z0-9-]+@[0-9]+$'),
  name                  text NOT NULL,
  version               int  NOT NULL CHECK (version >= 1),
  /* Element key prefixes the model REQUIRES; a version missing one is incomplete and cannot run. */
  required_inputs       text[] NOT NULL,
  parameter_schema      jsonb NOT NULL,
  operating_envelope    jsonb NOT NULL,
  validation_notes      text NOT NULL,
  /* Bound at P5-M2 to the exact implementation; NULL means no implementation is pinned yet and no run may use it. */
  implementation_digest text CHECK (implementation_digest IS NULL OR implementation_digest ~ '^[0-9a-f]{64}$'),
  registered_at         timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT ON twin.twin_kind_schemas, twin.behaviour_models TO eye_app, eye_commit;

INSERT INTO twin.twin_kind_schemas (kind, description, material_keys) VALUES
  ('supply-chain', 'A supply chain from a supplier through a route and its chokepoints to a plant: inventory, consumption, shipments in flight, route days, contractual terms.',
   ARRAY['inventory.on_hand', 'inventory.safety_stock', 'consumption.weekly', 'shipment', 'route.inland_days',
         'route.reroute_delay_days', 'terms.reroute_cost_per_container', 'terms.units_per_container', 'terms.air_cost_per_kg',
         'terms.kg_per_unit', 'terms.air_lead_days', 'terms.line_stop_cost_per_day', 'shock.corridor_delay_days', 'production.policy']);

INSERT INTO twin.behaviour_models (method_ref, name, version, required_inputs, parameter_schema, operating_envelope, validation_notes) VALUES
  ('supply-flow@1', 'Daily discrete-time supply flow: inventory, consumption, shipments with plant arrivals, safety stock, line stop, costs; seeded lead-time jitter as the only stochastic element', 1,
   ARRAY['inventory.on_hand', 'inventory.safety_stock', 'consumption.weekly', 'shipment', 'route.inland_days',
         'route.reroute_delay_days', 'terms.reroute_cost_per_container', 'terms.units_per_container', 'terms.air_cost_per_kg',
         'terms.kg_per_unit', 'terms.air_lead_days', 'terms.line_stop_cost_per_day', 'shock.corridor_delay_days', 'production.policy'],
   '{"horizon_days": {"type": "integer", "minimum": 1, "maximum": 365}, "stochastic": {"mode": ["deterministic", "seeded"], "rng": "xoshiro128**@1"}}'::jsonb,
   '{"horizon_days": [1, 365], "corridor_delay_days": [0, 60], "consumption.weekly": [0, 100000], "notes": "single component per run; liquidated damages not modelled; calendar days, no working-day calendar"}'::jsonb,
   'PHASE5_BUILD_PLAN.md §6b is the executable specification. Validation status: unvalidated (synthetic grounding) — no claim of accuracy against real outcomes.');

-- ============================================================
-- 3. Twins: events + projection.
-- ============================================================
CREATE TABLE twin.twin_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  twin_id            uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('twin.declared', 'version.opened', 'element.grounded', 'version.admitted', 'version.unverified', 'version.reverified')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT twe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX twe_twin ON twin.twin_events (twin_id, occurred_at);
CREATE TRIGGER twe_append_only BEFORE UPDATE OR DELETE ON twin.twin_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE twin.twins_current (
  twin_id             uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  kind                text NOT NULL REFERENCES twin.twin_kind_schemas(kind),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  statement           text NOT NULL CHECK (length(btrim(statement)) BETWEEN 2 AND 4096),
  /* The boundary: graph entities. An entity names the subject; it substantiates no value. */
  boundary            jsonb NOT NULL CHECK (jsonb_typeof(boundary) = 'array' AND jsonb_array_length(boundary) >= 1),
  owner_principal_id  uuid NOT NULL,
  intended_decisions  jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(intended_decisions) = 'array'),
  interfaces          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(interfaces) = 'object'),
  behaviour_model_ref text NOT NULL REFERENCES twin.behaviour_models(method_ref),
  validation          jsonb NOT NULL CHECK (jsonb_typeof(validation) = 'object' AND (validation ? 'status') AND (validation ? 'limitations')),
  /* Folded UPWARD from what the admitted versions cite; a twin of a synthetic world says so. */
  synthetic_state     boolean NOT NULL DEFAULT false,
  controls            jsonb NOT NULL DEFAULT '{}'::jsonb,
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT twn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

-- ============================================================
-- 4. Versions: a draft until admitted, immutable after, branchable.
-- ============================================================
CREATE TABLE twin.twin_versions (
  twin_id             uuid NOT NULL REFERENCES twin.twins_current(twin_id),
  version             int  NOT NULL CHECK (version >= 1),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  branch_id           text NOT NULL CHECK (branch_id ~ '^[a-z][a-z0-9-]{0,40}$'),
  forked_from_version int  CHECK (forked_from_version IS NULL OR forked_from_version >= 1),
  supersedes          int  CHECK (supersedes IS NULL OR supersedes >= 1),
  state               text NOT NULL CHECK (state IN ('draft', 'admitted')),
  /* RECORD-time cut-off at which the evidence was read, and WORLD-time cut-off; never one for the other. */
  known_at            timestamptz NOT NULL,
  observed_through    date,
  state_set_digest    text CHECK (state_set_digest IS NULL OR state_set_digest ~ '^[0-9a-f]{64}$'),
  header_digest       text CHECK (header_digest IS NULL OR header_digest ~ '^[0-9a-f]{64}$'),
  element_count       int  NOT NULL DEFAULT 0,
  completeness        text NOT NULL DEFAULT 'incomplete' CHECK (completeness IN ('complete', 'incomplete')),
  missing_keys        jsonb NOT NULL DEFAULT '[]'::jsonb,
  synthetic_state     boolean NOT NULL DEFAULT false,
  controls            jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_state  text NOT NULL DEFAULT 'verified' CHECK (verification_state IN ('verified', 'unverified')),
  opened_by           uuid NOT NULL,
  opened_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  admitted_at         timestamptz,
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (twin_id, version),
  CONSTRAINT twv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT twv_admitted_bound CHECK (state <> 'admitted' OR (state_set_digest IS NOT NULL AND header_digest IS NOT NULL AND admitted_at IS NOT NULL)),
  CONSTRAINT twv_fork_not_self CHECK (forked_from_version IS NULL OR forked_from_version < version)
);
CREATE INDEX twv_branch ON twin.twin_versions (twin_id, branch_id, version);

/*
 * IMMUTABILITY BY TRIGGER. A draft row may become admitted exactly once (binding its
 * digests). An admitted row may change ONLY its verification_state, and only through
 * the mark_unverified / reverify ports (which write the event first). Nothing else.
 */
CREATE OR REPLACE FUNCTION twin.versions_immutable() RETURNS trigger
SET search_path = twin, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'twin versions are append-only: DELETE prohibited' USING ERRCODE = '2F002';
  END IF;
  IF OLD.state = 'admitted' THEN
    IF NEW.state <> 'admitted' OR NEW.state_set_digest IS DISTINCT FROM OLD.state_set_digest
       OR NEW.header_digest IS DISTINCT FROM OLD.header_digest OR NEW.element_count <> OLD.element_count
       OR NEW.completeness <> OLD.completeness OR NEW.missing_keys <> OLD.missing_keys
       OR NEW.known_at <> OLD.known_at OR NEW.observed_through IS DISTINCT FROM OLD.observed_through
       OR NEW.branch_id <> OLD.branch_id OR NEW.forked_from_version IS DISTINCT FROM OLD.forked_from_version
       OR NEW.supersedes IS DISTINCT FROM OLD.supersedes OR NEW.synthetic_state <> OLD.synthetic_state
       OR NEW.controls <> OLD.controls OR NEW.admitted_at IS DISTINCT FROM OLD.admitted_at THEN
      RAISE EXCEPTION 'twin version % of % is admitted and immutable; only its verification state may change, by event', OLD.version, OLD.twin_id
        USING ERRCODE = '2F002';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER twv_immutable BEFORE UPDATE OR DELETE ON twin.twin_versions
  FOR EACH ROW EXECUTE FUNCTION twin.versions_immutable();

-- ============================================================
-- 5. State elements: kinds, typed citations, health — failing closed.
-- ============================================================
/* A citation binds an exact object: kind, uuid id, integer version, 64-hex digest. Null or malformed anywhere → false. */
CREATE OR REPLACE FUNCTION twin.citations_ok(p jsonb) RETURNS boolean
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE c jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN false; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(c) <> 'object' THEN RETURN false; END IF;
    IF NOT (c ? 'kind' AND c ? 'id' AND c ? 'version' AND c ? 'digest') THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'kind') <> 'string' OR NOT ((c ->> 'kind') IN ('evidence', 'claim', 'entity', 'forecast', 'assumption', 'run')) THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'id') <> 'string' OR NOT ((c ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'version') <> 'number' OR (c ->> 'version') !~ '^[0-9]+$' OR (c ->> 'version')::int < 1 THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'digest') <> 'string' OR NOT ((c ->> 'digest') ~ '^[0-9a-f]{64}$') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$ LANGUAGE plpgsql;

/* How many citations of a kind; NULL-safe (a malformed array counts nothing). */
CREATE OR REPLACE FUNCTION twin.citation_count(p jsonb, p_kind text) RETURNS int
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN 0
              ELSE (SELECT count(*)::int FROM jsonb_array_elements(p) c WHERE jsonb_typeof(c) = 'object' AND (c ->> 'kind') = p_kind) END;
$$ LANGUAGE sql;

CREATE TABLE twin.state_elements (
  element_id          uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  twin_id             uuid NOT NULL,
  version             int  NOT NULL,
  key                 text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$'),
  kind                text NOT NULL CHECK (kind IN ('observed', 'estimated', 'assumed', 'predicted', 'simulated')),
  /* The truth state of the claim an estimated element was derived from; retained, never laundered. */
  basis_truth_state   text CHECK (basis_truth_state IS NULL OR basis_truth_state IN ('observed', 'asserted', 'extracted', 'inferred', 'assessed', 'synthetic')),
  value               jsonb NOT NULL,
  unit                text,
  /* Derived by the port from the twin-kind schema and the behaviour model; a caller cannot set it. */
  material            boolean NOT NULL,
  citations           jsonb NOT NULL,
  health              text NOT NULL CHECK (health IN ('complete', 'incomplete', 'unreadable', 'stale')),
  valid_from          date,
  valid_to            date,
  confidence          numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  synthetic_state     boolean NOT NULL DEFAULT false,
  controls            jsonb NOT NULL DEFAULT '{}'::jsonb,
  grounded_by         uuid NOT NULL,
  grounded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  FOREIGN KEY (twin_id, version) REFERENCES twin.twin_versions(twin_id, version),
  CONSTRAINT tse_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tse_one_per_key UNIQUE (twin_id, version, key),
  CONSTRAINT tse_citations_typed CHECK (twin.citations_ok(citations)),
  /* An entity names the subject and substantiates nothing: a material element needs a non-entity citation. */
  CONSTRAINT tse_material_substantiated CHECK (
    material = false OR health <> 'complete'
    OR (twin.citation_count(citations, 'evidence') + twin.citation_count(citations, 'claim') + twin.citation_count(citations, 'forecast')
        + twin.citation_count(citations, 'assumption') + twin.citation_count(citations, 'run')) >= 1),
  /* Observed comes only from a directly observed evidence point or an OBSERVED claim. An element that could
     read NOTHING under its cut-offs (health incomplete/unreadable) substantiates nothing and cites nothing. */
  CONSTRAINT tse_observed_basis CHECK (
    kind <> 'observed' OR health <> 'complete' OR twin.citation_count(citations, 'evidence') >= 1
    OR (twin.citation_count(citations, 'claim') >= 1 AND basis_truth_state = 'observed')),
  /* A derived claim keeps its truth state. */
  CONSTRAINT tse_estimated_basis CHECK (
    kind <> 'estimated' OR twin.citation_count(citations, 'claim') = 0 OR basis_truth_state IN ('extracted', 'inferred', 'assessed')),
  CONSTRAINT tse_predicted_basis CHECK (kind <> 'predicted' OR twin.citation_count(citations, 'forecast') = 1),
  CONSTRAINT tse_simulated_basis CHECK (kind <> 'simulated' OR (twin.citation_count(citations, 'run') >= 1 AND synthetic_state = true)),
  CONSTRAINT tse_assumed_basis CHECK (kind <> 'assumed' OR twin.citation_count(citations, 'assumption') + twin.citation_count(citations, 'evidence') >= 1),
  CONSTRAINT tse_validity CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX tse_version ON twin.state_elements (twin_id, version, key);
CREATE TRIGGER tse_append_only BEFORE UPDATE OR DELETE ON twin.state_elements
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* Grounding writes only into a DRAFT version. */
CREATE OR REPLACE FUNCTION twin.elements_only_into_drafts() RETURNS trigger
SET search_path = twin, pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = NEW.twin_id AND v.version = NEW.version AND v.state = 'draft') THEN
    RAISE EXCEPTION 'grounding rejected: version % of twin % is not a draft — open a new version', NEW.version, NEW.twin_id
      USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tse_drafts_only BEFORE INSERT ON twin.state_elements
  FOR EACH ROW EXECUTE FUNCTION twin.elements_only_into_drafts();

-- ============================================================
-- 6. Ports.
-- ============================================================
CREATE OR REPLACE FUNCTION twin.declare_twin(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_title text, p_statement text, p_boundary jsonb,
  p_owner uuid, p_intended jsonb, p_interfaces jsonb, p_model_ref text, p_validation jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = twin, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_owner AND p.status = 'active' AND p.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'twin rejected: the owner must be a named, active principal in this tenant' USING ERRCODE = '23503';
  END IF;
  IF p_boundary IS NULL OR jsonb_typeof(p_boundary) <> 'array' OR jsonb_array_length(p_boundary) = 0 THEN
    RAISE EXCEPTION 'twin rejected: the boundary must name at least one graph entity' USING ERRCODE = '22023';
  END IF;
  FOR b IN SELECT * FROM jsonb_array_elements(p_boundary) LOOP
    IF jsonb_typeof(b) <> 'string' OR NOT EXISTS (SELECT 1 FROM graph.entities_current e
        WHERE e.entity_id = (b #>> '{}')::uuid AND e.tenant_id = p_tenant AND e.domain_id = p_domain) THEN
      RAISE EXCEPTION 'twin rejected: boundary entry % is not a resolved entity in this domain', b USING ERRCODE = '23503';
    END IF;
  END LOOP;
  INSERT INTO twin.twins_current (
    twin_id, scope, tenant_id, domain_id, kind, title, statement, boundary, owner_principal_id, intended_decisions,
    interfaces, behaviour_model_ref, validation, declared_by, correlation_id
  ) VALUES (
    p_twin_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_title, p_statement, p_boundary, p_owner, coalesce(p_intended, '[]'::jsonb),
    coalesce(p_interfaces, '{}'::jsonb), p_model_ref, p_validation, p_actor, p_correlation);
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'twin.declared', p_actor,
          jsonb_build_object('kind', p_kind, 'title', p_title, 'owner', p_owner, 'behaviour_model', p_model_ref), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.declare_twin(uuid,uuid,uuid,text,text,text,jsonb,uuid,jsonb,jsonb,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.declare_twin(uuid,uuid,uuid,text,text,text,jsonb,uuid,jsonb,jsonb,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/*
 * Open a DRAFT version on a branch. A fork names the admitted version it forks from; a
 * continuation supersedes the branch's latest admitted version. `p_carry_from` copies
 * that admitted version's elements into the draft (new element ids, citations kept)
 * except the keys in `p_except`, which the caller then re-grounds — so a change is
 * always a NEW version, never an edit.
 */
CREATE OR REPLACE FUNCTION twin.open_version(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_branch text, p_forked_from int, p_known_at timestamptz, p_observed_through date,
  p_carry_from int, p_except text[], p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS int
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; v_supersedes int; v_open int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.version']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM twin.twins_current t WHERE t.twin_id = p_twin_id AND t.tenant_id = p_tenant AND t.domain_id = p_domain) THEN
    RAISE EXCEPTION 'version rejected: no such twin in this domain' USING ERRCODE = '23503';
  END IF;
  SELECT count(*) INTO v_open FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.branch_id = p_branch AND v.state = 'draft';
  IF v_open > 0 THEN
    RAISE EXCEPTION 'version rejected: branch % already has an open draft; admit it or ground into it', p_branch USING ERRCODE = '22023';
  END IF;
  IF p_forked_from IS NOT NULL AND NOT EXISTS (SELECT 1 FROM twin.twin_versions v
      WHERE v.twin_id = p_twin_id AND v.version = p_forked_from AND v.state = 'admitted') THEN
    RAISE EXCEPTION 'version rejected: fork source % is not an admitted version of this twin', p_forked_from USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_next FROM twin.twin_versions WHERE twin_id = p_twin_id;
  SELECT max(version) INTO v_supersedes FROM twin.twin_versions WHERE twin_id = p_twin_id AND branch_id = p_branch AND state = 'admitted';
  INSERT INTO twin.twin_versions (
    twin_id, version, scope, tenant_id, domain_id, branch_id, forked_from_version, supersedes, state, known_at, observed_through,
    opened_by, correlation_id
  ) VALUES (p_twin_id, v_next, 'DOMAIN', p_tenant, p_domain, p_branch, p_forked_from, v_supersedes, 'draft', p_known_at, p_observed_through,
            p_actor, p_correlation);
  IF p_carry_from IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_carry_from AND v.state = 'admitted') THEN
      RAISE EXCEPTION 'version rejected: carry-from source % is not an admitted version of this twin', p_carry_from USING ERRCODE = '23503';
    END IF;
    INSERT INTO twin.state_elements (
      element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, basis_truth_state, value, unit, material, citations,
      health, valid_from, valid_to, confidence, synthetic_state, controls, grounded_by, correlation_id)
    SELECT gen_random_uuid(), e.scope, e.tenant_id, e.domain_id, e.twin_id, v_next, e.key, e.kind, e.basis_truth_state, e.value, e.unit,
           e.material, e.citations, e.health, e.valid_from, e.valid_to, e.confidence, e.synthetic_state, e.controls, p_actor, p_correlation
      FROM twin.state_elements e
     WHERE e.twin_id = p_twin_id AND e.version = p_carry_from AND NOT (e.key = ANY (coalesce(p_except, ARRAY[]::text[])));
    UPDATE twin.twin_versions SET element_count = (SELECT count(*) FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = v_next)
     WHERE twin_id = p_twin_id AND version = v_next;
  END IF;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'version.opened', p_actor,
          jsonb_build_object('version', v_next, 'branch_id', p_branch, 'forked_from_version', p_forked_from, 'supersedes', v_supersedes,
                             'known_at', p_known_at, 'observed_through', p_observed_through, 'carried_from', p_carry_from, 'except', to_jsonb(p_except)), p_correlation);
  RETURN v_next;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.open_version(uuid,uuid,uuid,text,int,timestamptz,date,int,text[],uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.open_version(uuid,uuid,uuid,text,int,timestamptz,date,int,text[],uuid,uuid,uuid) TO eye_commit;

/* Is this key material for the twin's kind, or required by its behaviour model? Decided HERE. */
CREATE OR REPLACE FUNCTION twin.key_is_material(p_twin_id uuid, p_key text) RETURNS boolean
STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM twin.twins_current t
      JOIN twin.twin_kind_schemas k ON k.kind = t.kind
      JOIN twin.behaviour_models m ON m.method_ref = t.behaviour_model_ref
     WHERE t.twin_id = p_twin_id
       AND (split_part(p_key, ':', 1) = ANY (k.material_keys) OR split_part(p_key, ':', 1) = ANY (m.required_inputs)));
$$ LANGUAGE sql;

/* Ground one element into a draft. Materiality is derived; the caller's opinion of it is not a parameter. */
CREATE OR REPLACE FUNCTION twin.ground_element(
  p_element_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_version int, p_key text, p_kind text, p_basis text,
  p_value jsonb, p_unit text, p_citations jsonb, p_health text, p_valid_from date, p_valid_to date, p_confidence numeric,
  p_synthetic boolean, p_controls jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_material boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.ground']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_version
                   AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'draft') THEN
    RAISE EXCEPTION 'grounding rejected: version % of twin % is not an open draft in this domain', p_version, p_twin_id USING ERRCODE = '2F002';
  END IF;
  IF NOT twin.citations_ok(p_citations) THEN
    RAISE EXCEPTION 'grounding rejected: citations must be an array of {kind, id, version, digest} binding exact objects' USING ERRCODE = '22023';
  END IF;
  v_material := twin.key_is_material(p_twin_id, p_key);
  IF v_material AND (twin.citation_count(p_citations, 'evidence') + twin.citation_count(p_citations, 'claim') + twin.citation_count(p_citations, 'forecast')
                     + twin.citation_count(p_citations, 'assumption') + twin.citation_count(p_citations, 'run')) = 0 THEN
    RAISE EXCEPTION 'grounding rejected: % is material for this twin and is substantiated by nothing but an entity — an entity names a subject, it substantiates no value', p_key
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO twin.state_elements (
    element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, basis_truth_state, value, unit, material, citations,
    health, valid_from, valid_to, confidence, synthetic_state, controls, grounded_by, correlation_id
  ) VALUES (
    p_element_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_version, p_key, p_kind, p_basis, p_value, p_unit, v_material, p_citations,
    p_health, p_valid_from, p_valid_to, p_confidence, coalesce(p_synthetic, false), coalesce(p_controls, '{}'::jsonb), p_actor, p_correlation);
  UPDATE twin.twin_versions SET element_count = element_count + 1 WHERE twin_id = p_twin_id AND version = p_version;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'element.grounded', p_actor,
          jsonb_build_object('version', p_version, 'key', p_key, 'kind', p_kind, 'material', v_material, 'health', p_health,
                             'citations', p_citations, 'synthetic_state', coalesce(p_synthetic, false)), p_correlation);
  RETURN v_material;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.ground_element(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,text,jsonb,text,date,date,numeric,boolean,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.ground_element(uuid,uuid,uuid,uuid,int,text,text,text,jsonb,text,jsonb,text,date,date,numeric,boolean,jsonb,uuid,uuid,uuid) TO eye_commit;

/* The state-set digest: sha256 over the elements in key order, as jsonb text (jsonb normalises key order). */
CREATE OR REPLACE FUNCTION twin.state_set_digest(p_twin_id uuid, p_version int) RETURNS text
STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to(coalesce((
    SELECT jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value,
                                        'unit', e.unit, 'material', e.material, 'citations', e.citations, 'health', e.health,
                                        'valid_from', e.valid_from, 'valid_to', e.valid_to, 'confidence', e.confidence,
                                        'synthetic_state', e.synthetic_state) ORDER BY e.key)::text
      FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_version), '[]'), 'UTF8')), 'hex');
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.state_set_digest(uuid,int) TO eye_app, eye_commit;

/* The required keys a version lacks, or lacks completely. */
CREATE OR REPLACE FUNCTION twin.missing_required_keys(p_twin_id uuid, p_version int) RETURNS jsonb
STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH req AS (
    SELECT DISTINCT unnest(k.material_keys || m.required_inputs) AS prefix
      FROM twin.twins_current t JOIN twin.twin_kind_schemas k ON k.kind = t.kind
      JOIN twin.behaviour_models m ON m.method_ref = t.behaviour_model_ref
     WHERE t.twin_id = p_twin_id),
  have AS (
    SELECT DISTINCT split_part(e.key, ':', 1) AS prefix FROM twin.state_elements e
     WHERE e.twin_id = p_twin_id AND e.version = p_version AND e.health = 'complete')
  SELECT coalesce(jsonb_agg(r.prefix ORDER BY r.prefix), '[]'::jsonb) FROM req r WHERE NOT EXISTS (SELECT 1 FROM have h WHERE h.prefix = r.prefix);
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.missing_required_keys(uuid,int) TO eye_app, eye_commit;

/*
 * ADMISSION binds the complete state set into the version atomically, in the same
 * transaction as objects.admit_version of the TWN canonical version (the service calls
 * that first under the same bound action). The port recomputes the state-set digest
 * and refuses if it differs from what the header carried; it refuses an unsubstantiated
 * material element; an incomplete required set is admitted only when explicitly asked
 * for as incomplete, and stays marked so that no run can use it.
 */
CREATE OR REPLACE FUNCTION twin.admit_version(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_expected_digest text, p_header_digest text,
  p_allow_incomplete boolean, p_synthetic boolean, p_controls jsonb, p_dependencies jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_digest text; v_missing jsonb; v_bad int; v_completeness text; d jsonb; v_branch text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.version.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT branch_id INTO v_branch FROM twin.twin_versions v
   WHERE v.twin_id = p_twin_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'draft' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admission rejected: version % of twin % is not an open draft in this domain', p_version, p_twin_id USING ERRCODE = '2F002';
  END IF;
  SELECT count(*) INTO v_bad FROM twin.state_elements e
   WHERE e.twin_id = p_twin_id AND e.version = p_version AND e.material AND e.health = 'complete'
     AND (twin.citation_count(e.citations, 'evidence') + twin.citation_count(e.citations, 'claim') + twin.citation_count(e.citations, 'forecast')
          + twin.citation_count(e.citations, 'assumption') + twin.citation_count(e.citations, 'run')) = 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'admission rejected: % material element(s) are substantiated by nothing but an entity', v_bad USING ERRCODE = '22023';
  END IF;
  v_digest := twin.state_set_digest(p_twin_id, p_version);
  IF p_expected_digest IS NULL OR v_digest <> p_expected_digest THEN
    RAISE EXCEPTION 'admission rejected: the state set changed between digesting and admitting (% vs %)', p_expected_digest, v_digest USING ERRCODE = '22023';
  END IF;
  v_missing := twin.missing_required_keys(p_twin_id, p_version);
  v_completeness := CASE WHEN jsonb_array_length(v_missing) = 0 THEN 'complete' ELSE 'incomplete' END;
  IF v_completeness = 'incomplete' AND NOT coalesce(p_allow_incomplete, false) THEN
    RAISE EXCEPTION 'admission rejected: required inputs are missing, unreadable or stale: %; admit explicitly as incomplete or ground them', v_missing::text USING ERRCODE = '22023';
  END IF;
  UPDATE twin.twin_versions
     SET state = 'admitted', state_set_digest = v_digest, header_digest = p_header_digest, completeness = v_completeness,
         missing_keys = v_missing, synthetic_state = coalesce(p_synthetic, false), controls = coalesce(p_controls, '{}'::jsonb),
         admitted_at = clock_timestamp()
   WHERE twin_id = p_twin_id AND version = p_version;
  UPDATE twin.twins_current
     SET synthetic_state = synthetic_state OR coalesce(p_synthetic, false), controls = coalesce(p_controls, controls)
   WHERE twin_id = p_twin_id;
  -- What the version rests on, in the SAME dependency table Phase 3 walks.
  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_dependencies, '[]'::jsonb)) LOOP
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id,
      rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_twin_id, 'TWN', d ->> 'kind', (d ->> 'id')::uuid,
      format('twin version %s on branch %s grounds %s on it', p_version, v_branch, d ->> 'key'), 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'version.admitted', p_actor,
          jsonb_build_object('version', p_version, 'branch_id', v_branch, 'state_set_digest', v_digest, 'header_digest', p_header_digest,
                             'completeness', v_completeness, 'missing_keys', v_missing, 'synthetic_state', coalesce(p_synthetic, false)), p_correlation);
  RETURN jsonb_build_object('state_set_digest', v_digest, 'completeness', v_completeness, 'missing_keys', v_missing);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.admit_version(uuid,uuid,uuid,int,text,text,boolean,boolean,jsonb,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.admit_version(uuid,uuid,uuid,int,text,text,boolean,boolean,jsonb,jsonb,uuid,uuid,uuid) TO eye_commit;

/* Verification changes by EVENT, reflected in the projection; the version row is otherwise untouched. */
CREATE OR REPLACE FUNCTION twin.mark_unverified(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_reason text, p_invalidation_id uuid,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate', 'twin.version.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_version
                   AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'admitted') THEN
    RAISE EXCEPTION 'unverify rejected: version % of twin % is not an admitted version in this domain', p_version, p_twin_id USING ERRCODE = '23503';
  END IF;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'version.unverified', p_actor,
          jsonb_build_object('version', p_version, 'reason', p_reason, 'invalidation_id', p_invalidation_id), p_correlation);
  UPDATE twin.twin_versions SET verification_state = 'unverified' WHERE twin_id = p_twin_id AND version = p_version;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.mark_unverified(uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.mark_unverified(uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 7. The Strategy Graph learns TWN as a dependent and `twin` as a target kind.
-- ============================================================
ALTER TABLE graph.dependencies DROP CONSTRAINT dependencies_dependent_type_check;
ALTER TABLE graph.dependencies ADD CONSTRAINT dependencies_dependent_type_check
  CHECK (dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT', 'FCT', 'SCN', 'WRN', 'TWN', 'SIM'));
ALTER TABLE graph.dependencies DROP CONSTRAINT dependencies_depends_on_kind_check;
ALTER TABLE graph.dependencies ADD CONSTRAINT dependencies_depends_on_kind_check
  CHECK (depends_on_kind IN ('claim', 'entity', 'edge', 'strategy', 'forecast', 'evidence', 'twin', 'run'));

CREATE OR REPLACE FUNCTION graph.dependency_dependent_exists() RETURNS trigger
SET search_path = graph, prediction, twin, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT') THEN
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: % % is not a strategy object', NEW.dependent_type, NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'FCT' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: FCT % is not a forecast', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'SCN' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: SCN % is not a scenario', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'WRN' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.warnings_current w WHERE w.warning_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: WRN % is not a warning', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'TWN' THEN
    IF NOT EXISTS (SELECT 1 FROM twin.twins_current t WHERE t.twin_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: TWN % is not a twin', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'SIM' THEN
    -- Simulation runs arrive with P5-M3 (0033); until then no SIM dependent can exist.
    RAISE EXCEPTION 'dependency rejected: SIM dependents are not admitted before the simulation schema exists' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 8. Write action, schema, RLS, projection rebuild.
-- ============================================================
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('twin.version.admit', ARRAY['TWN'], 'Admitting a twin version admits a twin object and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('TWN', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["kind","title","statement","boundary","owner","behaviour_model","validation","branch","version","known_at",
               "observed_through","state_set_digest","elements","completeness","synthetic_world"],
  "properties": {
    "kind": { "type": "string", "minLength": 2 },
    "title": { "type": "string", "minLength": 2 },
    "statement": { "type": "string", "minLength": 2 },
    "boundary": { "type": "array", "minItems": 1, "items": { "type": "string" } },
    "owner": { "type": "string" },
    "intended_decisions": { "type": "array", "items": { "type": "string" } },
    "interfaces": { "type": "object" },
    "behaviour_model": { "type": "object", "required": ["ref"], "properties": { "ref": { "type": "string" }, "implementation_digest": { "type": ["string","null"] } } },
    "validation": { "type": "object", "required": ["status","limitations"],
                    "properties": { "status": { "type": "string" }, "envelope": { "type": "object" }, "limitations": { "type": "array", "items": { "type": "string" } } } },
    "branch": { "type": "object", "required": ["branch_id","forked_from_version"],
                "properties": { "branch_id": { "type": "string" }, "forked_from_version": { "type": ["integer","null"] }, "supersedes": { "type": ["integer","null"] } } },
    "version": { "type": "integer", "minimum": 1 },
    "known_at": { "type": "string" },
    "observed_through": { "type": ["string","null"] },
    "state_set_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "elements": { "type": "array", "items": { "type": "object",
                  "required": ["key","kind","value","material","citations","health"],
                  "properties": { "key": { "type": "string" }, "kind": { "enum": ["observed","estimated","assumed","predicted","simulated"] },
                                  "basis_truth_state": { "type": ["string","null"] }, "value": {}, "unit": { "type": ["string","null"] },
                                  "material": { "type": "boolean" },
                                  "citations": { "type": "array", "items": { "type": "object", "required": ["kind","id","version","digest"],
                                                 "properties": { "kind": { "enum": ["evidence","claim","entity","forecast","assumption","run"] },
                                                                 "id": { "type": "string" }, "version": { "type": "integer", "minimum": 1 },
                                                                 "digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" } } } },
                                  "health": { "enum": ["complete","incomplete","unreadable","stale"] },
                                  "valid_from": { "type": ["string","null"] }, "valid_to": { "type": ["string","null"] },
                                  "confidence": { "type": ["number","null"] }, "synthetic_state": { "type": "boolean" } } } },
    "completeness": { "enum": ["complete","incomplete"] },
    "missing_keys": { "type": "array", "items": { "type": "string" } },
    "synthetic_world": { "type": "boolean" }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['twin_events', 'twins_current', 'twin_versions', 'state_elements'] LOOP
    EXECUTE format('ALTER TABLE twin.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE twin.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY twin_isolation ON twin.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON twin.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION twin.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint)
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid;
BEGIN
  v_tenant := public.eye_tenant(); v_domain := public.eye_domain();
  RETURN QUERY
    WITH declared AS (SELECT DISTINCT twin_id FROM twin.twin_events WHERE tenant_id = v_tenant AND domain_id = v_domain AND event = 'twin.declared'),
         live AS (SELECT twin_id FROM twin.twins_current WHERE tenant_id = v_tenant AND domain_id = v_domain)
    SELECT 'twins_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM declared),
           (SELECT count(*) FROM (SELECT twin_id FROM declared EXCEPT SELECT twin_id FROM live) x);
  RETURN QUERY
    WITH admitted AS (SELECT DISTINCT twin_id, (details ->> 'version')::int AS version FROM twin.twin_events
                       WHERE tenant_id = v_tenant AND domain_id = v_domain AND event = 'version.admitted'),
         live AS (SELECT twin_id, version FROM twin.twin_versions WHERE tenant_id = v_tenant AND domain_id = v_domain AND state = 'admitted')
    SELECT 'twin_versions(admitted)'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM admitted),
           (SELECT count(*) FROM (SELECT * FROM admitted EXCEPT SELECT * FROM live) x);
  RETURN QUERY
    WITH last_state AS (
      SELECT DISTINCT ON (twin_id, (details ->> 'version')::int) twin_id, (details ->> 'version')::int AS version,
             CASE WHEN event = 'version.unverified' THEN 'unverified' ELSE 'verified' END AS st
        FROM twin.twin_events WHERE tenant_id = v_tenant AND domain_id = v_domain AND event IN ('version.admitted', 'version.unverified', 'version.reverified')
       ORDER BY twin_id, (details ->> 'version')::int, occurred_at DESC),
         live AS (SELECT twin_id, version, verification_state AS st FROM twin.twin_versions WHERE tenant_id = v_tenant AND domain_id = v_domain AND state = 'admitted')
    SELECT 'twin_versions(verification)'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM last_state),
           (SELECT count(*) FROM (SELECT * FROM last_state EXCEPT SELECT * FROM live) x);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.rebuild_projections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.rebuild_projections() TO eye_app, eye_commit;
