-- 0092 — CP-6 B29 (2026-09-29): TWIN FAMILIES, COMPOSITION AND SIMULATION METHODS — the twin family portfolio and twin composition
-- (F-P5-01) and the simulation method portfolio and constraint runtime (F-P5-05).
--
-- Built as B34 was: the integrator's §0 PRELUDE (the shared vocabulary every part writes against — roles, the event vocabularies, the
-- kind and method registry columns, the citation kind `twin`, the agent kind), then FOUR PARTS in parallel worktrees under part-local
-- 0092_b29_x_<part>.sql, combined here as §A (families, composition, extension), §B (the multi-tier supply network and the Supply Chain
-- Agent), §C (the method fabric and the generalised runtime — the ONLY redefinition of simulation.open_run), §D (the constraint engine),
-- then the integrator's §I. The sections appear in the order the parts were applied and verified together (their part-local files'
-- order): §A, §D, §C, §B. The Phase 0 schemas (identity, ctx, policy, audit, objects, public, config) gain nothing but role ROWS.
--
-- Every scene of the demonstration that uses this is SYNTHETIC (NORDWERK's data is the demonstration's); the method adapters are the
-- product's own in-process implementations — a real external solver or simulator is not integrated here and closes nothing that
-- requires one.

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §0 PRELUDE ──────────────────────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════════════════════

-- §0.1 ROLES
INSERT INTO identity.roles (code, scope, description) VALUES
  ('supply_chain_agent', 'DOMAIN', 'The Supply Chain Agent (B29): reads the supply-network twins and PROPOSES capacity and bottleneck findings to the twin''s owner — never admits a version, never writes another twin'),
  ('method_steward', 'DOMAIN', 'Stewards the simulation method portfolio (B29): reinstates a quarantined method adapter after its probe passes — a named human, never the run''s operator'),
  ('constraint_steward', 'DOMAIN', 'Declares and versions the domain''s constraint sets (B29): topology, conservation and business rules that plans and runs are checked against')
ON CONFLICT (code) DO NOTHING;

-- §0.2 THE EVENT VOCABULARIES (widened here once; no part redefines them)
ALTER TABLE twin.twin_events DROP CONSTRAINT twin_events_event_check;
ALTER TABLE twin.twin_events ADD CONSTRAINT twin_events_event_check
  CHECK (event IN ('twin.declared', 'version.opened', 'element.grounded', 'version.admitted', 'version.unverified', 'version.reverified', 'version.validated',
                   /* B29 (0092) */ 'contract.published', 'contract.retired', 'link.declared', 'link.retired', 'coupling.proposed', 'coupling.applied', 'coupling.declined',
                   'kind.registered', 'method.bound', 'method.unbound', 'proposal.drafted', 'proposal.decided'));
ALTER TABLE simulation.run_events DROP CONSTRAINT run_events_event_check;
ALTER TABLE simulation.run_events ADD CONSTRAINT run_events_event_check
  CHECK (event IN ('run.opened', 'run.completed', 'run.failed', 'run.reproduced', 'run.unverified', 'run.invalidated', 'run.promoted',
                   /* B29 (0092) */ 'adapter.faulted', 'adapter.quarantined', 'adapter.reinstated', 'constraint.checked', 'constraint.refused'));

-- §0.3 THE KIND REGISTRY: a family, an element schema and the kind's required dependencies and default methods; the EXTENSION SURFACE
-- (V03-T-473): a tenant or domain registers its own kind, always named x-… so it never collides with (or shadows) a product kind; a
-- product kind has tenant_id NULL. twin.twins_current.kind keeps its foreign key to this table's primary key (unchanged).
ALTER TABLE twin.twin_kind_schemas
  ADD COLUMN family                text CHECK (family IS NULL OR family IN ('supply-chain', 'supply-network', 'enterprise', 'market', 'competitor', 'product', 'process',
                                                                           'infrastructure', 'regulation', 'organisation', 'extension')),
  ADD COLUMN element_schema        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN required_dependencies text[] NOT NULL DEFAULT '{}',
  ADD COLUMN default_methods       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN tenant_id             uuid,
  ADD COLUMN domain_id             uuid,
  ADD COLUMN registered_by         uuid,
  ADD CONSTRAINT tks_extension CHECK ((tenant_id IS NULL AND domain_id IS NULL AND kind !~ '^x-')
                                      OR (tenant_id IS NOT NULL AND kind ~ '^x-[a-z0-9-]{2,40}$' AND family = 'extension' AND registered_by IS NOT NULL));
UPDATE twin.twin_kind_schemas SET family = 'supply-chain' WHERE kind = 'supply-chain';

-- §0.4 THE METHOD REGISTRY: each behaviour model is a member of a METHOD FAMILY, run by a named ADAPTER under a CONTAINMENT policy
-- (§C: out of process, time and memory bounds, the fault count that quarantines it).
ALTER TABLE twin.behaviour_models
  ADD COLUMN family      text NOT NULL DEFAULT 'flow' CHECK (family IN ('flow', 'discrete-event', 'system-dynamics', 'agent-based', 'optimisation', 'war-gaming', 'counterfactual')),
  ADD COLUMN adapter     text NOT NULL DEFAULT 'in-process' CHECK (adapter ~ '^[a-z][a-z0-9-]{1,40}$'),
  ADD COLUMN containment jsonb NOT NULL DEFAULT '{"isolated": false}'::jsonb;

-- §0.5 THE CITATION KIND `twin` (a coupled element cites the upstream twin's admitted version it came from). 0032's body with ONE
-- change: the kind list gains 'twin'. Widening only — every array valid before stays valid.
CREATE OR REPLACE FUNCTION twin.citations_ok(p jsonb) RETURNS boolean
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE c jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN false; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(c) <> 'object' THEN RETURN false; END IF;
    IF NOT (c ? 'kind' AND c ? 'id' AND c ? 'version' AND c ? 'digest') THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'kind') <> 'string' OR NOT ((c ->> 'kind') IN ('evidence', 'claim', 'entity', 'forecast', 'assumption', 'run', /* B29 (0092) */ 'twin')) THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'id') <> 'string' OR NOT ((c ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'version') <> 'number' OR (c ->> 'version') !~ '^[0-9]+$' OR (c ->> 'version')::int < 1 THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'digest') <> 'string' OR NOT ((c ->> 'digest') ~ '^[0-9a-f]{64}$') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$ LANGUAGE plpgsql;

-- §0.6 THE AGENT KIND supply_chain (the role supply_chain_agent) and its task supply_scan
ALTER TABLE executive.agents DROP CONSTRAINT IF EXISTS agents_agent_kind_check;
ALTER TABLE executive.agents ADD CONSTRAINT agents_agent_kind_check CHECK (agent_kind IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal', 'risk', 'opportunity',
                                                                                            /* B29 (0092) */ 'supply_chain'));
ALTER TABLE executive.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_task_check;
ALTER TABLE executive.agent_runs ADD CONSTRAINT agent_runs_task_check CHECK (task IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan', 'risk_assess', 'opportunity_assess',
                                                                                      /* B29 (0092) */ 'supply_scan'));

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §A FAMILIES, COMPOSITION AND THE EXTENSION SURFACE (part b29/composition) ─────────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════════════════════
-- §A TWIN FAMILIES, COMPOSITION AND THE EXTENSION SURFACE (F-P5-01; L5-C06; V03-T-473) — part A of 0092 (B29, 2026-09-29)
-- ═════════════════════════════════════════════════════════════════════════════════════
-- Part-local file (the integrator combines it into 0092 as §A). Forward only: no earlier migration and no §0 statement is edited; the Phase 0
-- schemas gain nothing. What this part adds, in the order the clauses name it:
--
--   A.1 THE EIGHT FAMILIES as product kinds (tenant_id NULL): enterprise, market, competitor, product, process, infrastructure, regulation,
--       organisation — each with its element schema {prefix: {unit, description, required}}, the material keys (its required prefixes), the
--       families it must be linked to for dependency completeness ('a|b' = either) and its default method families. The TS family validators
--       (twin/families/) read the schema at admission; the supply-chain kind keeps an empty schema and admits exactly as before. Part B owns
--       the supply-network row.
--   A.2 THE EXTENSION SURFACE: the kind registry becomes row-level secured (a product kind is everyone's; an x- kind is its tenant's and
--       domain's), twin.register_kind (twin.kind.register, human-gated by the PDP) inserts an x- kind, and a trigger on twin.twins_current
--       refuses a twin of an x- kind outside the tenant and domain that registered it (the foreign key to the kind stays as it was).
--   A.3 COMPOSITION CONTRACTS (twin.twin_contracts): a twin's interface — the element keys it exposes (unit, cadence) and its APPROVED USES
--       (the method families and the decision classes it may serve) — versioned, published by the twin's OWNER (twin.contract.publish,
--       event contract.published), mirrored into twins_current.interfaces.contract. twin.use_approved(twin, family) is the run check part C
--       calls: a twin without a contract restricts nothing (the pre-B29 behaviour); a twin with one serves only its approved method families.
--   A.4 DEPENDENCY LINKS (twin.twin_links): a DOWNSTREAM twin consumes named keys of an UPSTREAM twin's current contract for an approved
--       decision class, declared by the downstream owner (twin.link.declare); refused on an uncontracted key, an unapproved use, a cycle, a
--       key or unit the downstream kind does not declare; retired by the downstream owner (twin.link.retire), which stops propagation.
--   A.5 COUPLED STATE (twin.coupling_proposals): when an upstream version on branch `actual` is ADMITTED (a trigger on the admission's own
--       UPDATE of twin.twin_versions — the admission path, in its transaction; no consumer kind is added), each live link gets a PROPOSAL:
--       the mapped elements, each carrying the upstream element's kind, value, unit and citations plus the citation kind `twin` naming the
--       upstream version and its TWN digest. The downstream owner APPLIES it (twin.coupling.apply: the existing twin.open_version and
--       twin.ground_element ports, redefined here with ONE change each — they also serve the bound action twin.coupling.apply — open or
--       extend the downstream draft) or DECLINES it (twin.coupling.decline). The upstream owner never writes the downstream twin.
--   A.6 twin.dependency_completeness(tenant, domain, twin) — the L5-C06 measure: the required families, the families linked (upstream,
--       transitively, over live links), the missing ones and the ratio.

-- ============================================================
-- A.1 THE EIGHT FAMILIES (product kinds)
-- ============================================================
INSERT INTO twin.twin_kind_schemas (kind, description, material_keys, family, element_schema, required_dependencies, default_methods) VALUES
  ('enterprise', 'An enterprise: its demand, and the line and supply capacity of the processes it runs (coupled from its process twins); capacity utilisation is derived.',
   ARRAY['demand.per_day'], 'enterprise',
   '{"demand.per_day": {"unit": "units/day", "description": "the demand the enterprise serves per day", "required": true},
     "process.line_capacity_per_day": {"unit": "units/day", "description": "a process twin''s line capacity (suffix: the process)", "required": false},
     "process.supply_capacity_per_day": {"unit": "units/day", "description": "the supply capacity reaching a process (suffix: the process)", "required": false},
     "market.demand_index": {"unit": "index", "description": "the market''s demand index", "required": false},
     "finance.revenue_per_unit": {"unit": "EUR", "description": "revenue per unit sold", "required": false}}'::jsonb,
   ARRAY['process', 'supply-chain|supply-network', 'market'], ARRAY['system-dynamics', 'optimisation']),
  ('market', 'A market: its volume, price level and the enterprise''s share of it.',
   ARRAY['demand.volume_per_month'], 'market',
   '{"demand.volume_per_month": {"unit": "units/month", "description": "the market''s volume per month", "required": true},
     "demand.index": {"unit": "index", "description": "the market''s demand index (base 100)", "required": false},
     "price.index": {"unit": "index", "description": "the market''s price index", "required": false},
     "share.own": {"unit": "ratio", "description": "the enterprise''s share of the market (0–1)", "required": false}}'::jsonb,
   ARRAY[]::text[], ARRAY['system-dynamics', 'agent-based']),
  ('competitor', 'A competitor: its capacity, price level and market share.',
   ARRAY['capacity.per_month'], 'competitor',
   '{"capacity.per_month": {"unit": "units/month", "description": "the competitor''s capacity per month", "required": true},
     "price.index": {"unit": "index", "description": "the competitor''s price index", "required": false},
     "share": {"unit": "ratio", "description": "the competitor''s market share (0–1)", "required": false}}'::jsonb,
   ARRAY['market'], ARRAY['war-gaming', 'agent-based']),
  ('product', 'A product: its unit cost, unit price and bill of materials.',
   ARRAY['unit.cost'], 'product',
   '{"unit.cost": {"unit": "EUR", "description": "the cost of one unit", "required": true},
     "unit.price": {"unit": "EUR", "description": "the price of one unit", "required": false},
     "bom.component": {"unit": "units", "description": "units of a component per product (suffix: the component)", "required": false}}'::jsonb,
   ARRAY['process'], ARRAY['optimisation', 'counterfactual']),
  ('process', 'A production process: its line capacity and availability, and the supply capacity reaching it (coupled from its supply twin); line throughput per day is derived.',
   ARRAY['line.capacity_per_day'], 'process',
   '{"line.capacity_per_day": {"unit": "units/day", "description": "the line''s capacity per day (suffix: the line)", "required": true},
     "line.availability": {"unit": "ratio", "description": "the share of the day the line runs (0–1)", "required": false},
     "line.shifts_per_day": {"unit": "shifts", "description": "shifts worked per day", "required": false},
     "supply.capacity_per_day": {"unit": "units/day", "description": "the supply capacity reaching the process per day", "required": false}}'::jsonb,
   ARRAY['supply-chain|supply-network'], ARRAY['discrete-event', 'flow']),
  ('infrastructure', 'An infrastructure asset (a warehouse, a port, a grid connection): its capacity, load and availability.',
   ARRAY['asset.capacity'], 'infrastructure',
   '{"asset.capacity": {"unit": "units/day", "description": "the asset''s capacity per day", "required": true},
     "asset.load": {"unit": "units/day", "description": "the load on the asset per day", "required": false},
     "asset.availability": {"unit": "ratio", "description": "the share of the time the asset is available (0–1)", "required": false}}'::jsonb,
   ARRAY[]::text[], ARRAY['discrete-event', 'system-dynamics']),
  ('regulation', 'A regulation: when a rule takes effect, the limit it sets and the penalty for a breach.',
   ARRAY['rule.effective_from'], 'regulation',
   '{"rule.effective_from": {"unit": "date", "description": "the day the rule takes effect (YYYY-MM-DD)", "required": true},
     "rule.limit": {"unit": "units", "description": "the limit the rule sets", "required": false},
     "rule.penalty": {"unit": "EUR", "description": "the penalty for a breach", "required": false}}'::jsonb,
   ARRAY[]::text[], ARRAY['counterfactual', 'war-gaming']),
  ('organisation', 'An organisation: its headcount and the roles it requires and has filled.',
   ARRAY['headcount'], 'organisation',
   '{"headcount": {"unit": "people", "description": "people employed", "required": true},
     "roles.required": {"unit": "people", "description": "roles the organisation requires (suffix: the function)", "required": false},
     "roles.filled": {"unit": "people", "description": "roles filled (suffix: the function)", "required": false}}'::jsonb,
   ARRAY[]::text[], ARRAY['agent-based'])
ON CONFLICT (kind) DO NOTHING;
UPDATE twin.twin_kind_schemas SET default_methods = ARRAY['flow'] WHERE kind = 'supply-chain' AND default_methods = '{}';

-- ============================================================
-- A.2 THE EXTENSION SURFACE
-- ============================================================
/* The registry is row-level secured from here: a PRODUCT kind (tenant_id NULL) is visible to everyone; an x- kind only in the tenant (and
   domain, when it names one) that registered it. The foreign key twins_current.kind → kind is unchanged (a key check ignores the policy). */
ALTER TABLE twin.twin_kind_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE twin.twin_kind_schemas FORCE ROW LEVEL SECURITY;
CREATE POLICY twin_kind_visibility ON twin.twin_kind_schemas
  USING (tenant_id IS NULL OR (tenant_id = public.eye_tenant() AND (domain_id IS NULL OR public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())));

/* The stable identity of a kind in the twin event log (twin_events.twin_id names the subject; a kind registration's subject is the kind). */
CREATE OR REPLACE FUNCTION twin.kind_subject(p_kind text) RETURNS uuid
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT md5('twin-kind:' || p_kind)::uuid $$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.kind_subject(text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION twin.register_kind(
  p_kind text, p_tenant uuid, p_domain uuid, p_description text, p_element_schema jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e record; v_material text[] := ARRAY[]::text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.kind.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'twin kind rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind !~ '^x-[a-z0-9-]{2,39}$' THEN
    RAISE EXCEPTION 'twin kind rejected (name): a domain''s own kind is named x-<name> (lower-case letters, digits and dashes, 2–39 characters) so it never shadows a product kind' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_description)), 0) < 8 THEN RAISE EXCEPTION 'twin kind rejected (description): a kind states what it represents (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  -- Kind names are one namespace (the key twins reference): a name taken anywhere is taken. Nothing else of the holder is disclosed.
  IF EXISTS (SELECT 1 FROM twin.twin_kind_schemas k WHERE lower(k.kind) = lower(p_kind)) THEN
    RAISE EXCEPTION 'twin kind rejected (duplicate): a kind named % is already registered; choose another name', p_kind USING ERRCODE = '23505';
  END IF;
  IF p_element_schema IS NULL OR jsonb_typeof(p_element_schema) <> 'object' OR p_element_schema = '{}'::jsonb THEN
    RAISE EXCEPTION 'twin kind rejected (schema): the element schema is an object of element prefixes, each {unit, description, required}' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT key, value FROM jsonb_each(p_element_schema) LOOP
    IF e.key !~ '^[a-z][a-z0-9_.-]*$' OR jsonb_typeof(e.value) <> 'object'
       OR NOT (e.value ? 'unit') OR NOT (jsonb_typeof(e.value -> 'unit') IN ('string', 'null'))
       OR jsonb_typeof(e.value -> 'description') IS DISTINCT FROM 'string' OR jsonb_typeof(e.value -> 'required') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'twin kind rejected (schema): element % must be a lower-case prefix with {unit: text or null, description: text, required: boolean}', e.key USING ERRCODE = '22023';
    END IF;
    IF (e.value ->> 'required')::boolean THEN v_material := v_material || e.key; END IF;
  END LOOP;
  IF cardinality(v_material) = 0 THEN
    RAISE EXCEPTION 'twin kind rejected (schema): at least one element is required — the required prefixes are the kind''s material keys' USING ERRCODE = '22023';
  END IF;
  INSERT INTO twin.twin_kind_schemas (kind, description, material_keys, family, element_schema, required_dependencies, default_methods, tenant_id, domain_id, registered_by)
  VALUES (p_kind, btrim(p_description), (SELECT array_agg(x ORDER BY x) FROM unnest(v_material) x), 'extension', p_element_schema, ARRAY[]::text[], ARRAY[]::text[], p_tenant, p_domain, p_actor);
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, twin.kind_subject(p_kind), 'kind.registered', p_actor,
          jsonb_build_object('kind', p_kind, 'family', 'extension', 'material_keys', to_jsonb(v_material), 'element_schema', p_element_schema), p_correlation);
  RETURN jsonb_build_object('kind', p_kind, 'family', 'extension', 'material_keys', (SELECT to_jsonb(array_agg(x ORDER BY x)) FROM unnest(v_material) x),
                            'tenant_id', p_tenant, 'domain_id', p_domain, 'subject', twin.kind_subject(p_kind));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.register_kind(text,uuid,uuid,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.register_kind(text,uuid,uuid,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* A twin of an x- kind is declared only in the tenant (and domain) that registered the kind — whatever path inserts it. Explicit on the
   tenant and domain (never on the policy alone: a definer that bypasses row security still refuses). */
CREATE OR REPLACE FUNCTION twin.twin_kind_in_scope() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.kind ~ '^x-' AND NOT EXISTS (SELECT 1 FROM twin.twin_kind_schemas k
      WHERE k.kind = NEW.kind AND k.tenant_id = NEW.tenant_id AND (k.domain_id IS NULL OR k.domain_id = NEW.domain_id)) THEN
    RAISE EXCEPTION 'twin kind rejected (scope): kind % is not registered in this tenant and domain; a twin of an x- kind is declared only where the kind was registered', NEW.kind
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER twn_kind_in_scope BEFORE INSERT OR UPDATE OF kind ON twin.twins_current
  FOR EACH ROW EXECUTE FUNCTION twin.twin_kind_in_scope();

-- ============================================================
-- A.3 COMPOSITION CONTRACTS
-- ============================================================
CREATE TABLE twin.twin_contracts (
  twin_id          uuid NOT NULL REFERENCES twin.twins_current(twin_id),
  contract_version int  NOT NULL CHECK (contract_version >= 1),
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  /* {key: {unit, cadence}} — the element keys the twin exposes to its dependants. */
  exposed          jsonb NOT NULL CHECK (jsonb_typeof(exposed) = 'object' AND exposed <> '{}'::jsonb),
  /* {method_families: [...], decision_classes: [...]} — what the twin may serve. */
  approved_uses    jsonb NOT NULL CHECK (jsonb_typeof(approved_uses) = 'object' AND jsonb_typeof(approved_uses -> 'method_families') = 'array'
                                         AND jsonb_typeof(approved_uses -> 'decision_classes') = 'array'),
  state            text NOT NULL CHECK (state IN ('current', 'superseded')),
  published_by     uuid NOT NULL,
  published_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (twin_id, contract_version),
  CONSTRAINT twc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX twc_one_current ON twin.twin_contracts (twin_id) WHERE state = 'current';

CREATE TABLE twin.twin_links (
  link_id            uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  upstream_twin_id   uuid NOT NULL REFERENCES twin.twins_current(twin_id),
  downstream_twin_id uuid NOT NULL REFERENCES twin.twins_current(twin_id),
  /* [{from: upstream key (in the contract), to: downstream key}] */
  mapping            jsonb NOT NULL CHECK (jsonb_typeof(mapping) = 'array' AND jsonb_array_length(mapping) >= 1),
  /* The decision class the coupling serves — one of the upstream contract's approved decision classes. */
  use_class          text NOT NULL CHECK (use_class ~ '^[a-z][a-z0-9-]{1,40}$'),
  contract_version   int  NOT NULL,
  state              text NOT NULL CHECK (state IN ('live', 'retired')),
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by         uuid,
  retired_at         timestamptz,
  retire_reason      text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT twl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT twl_not_self CHECK (upstream_twin_id <> downstream_twin_id),
  CONSTRAINT twl_retired CHECK ((state = 'live') = (retired_at IS NULL)),
  FOREIGN KEY (upstream_twin_id, contract_version) REFERENCES twin.twin_contracts(twin_id, contract_version)
);
CREATE UNIQUE INDEX twl_one_live_pair ON twin.twin_links (upstream_twin_id, downstream_twin_id) WHERE state = 'live';
CREATE INDEX twl_downstream ON twin.twin_links (downstream_twin_id) WHERE state = 'live';

CREATE TABLE twin.coupling_proposals (
  proposal_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  link_id            uuid NOT NULL REFERENCES twin.twin_links(link_id),
  upstream_twin_id   uuid NOT NULL,
  upstream_version   int  NOT NULL,
  downstream_twin_id uuid NOT NULL,
  /* The citation (kind `twin`) every coupled element carries: the upstream twin, its admitted version and that version's TWN digest. */
  upstream_citation  jsonb NOT NULL CHECK (twin.citations_ok(jsonb_build_array(upstream_citation)) AND upstream_citation ->> 'kind' = 'twin'),
  /* [{key (downstream), from_key, kind, basis_truth_state, value, unit, citations, valid_from, valid_to, confidence, synthetic_state, controls, inherited_validation}] */
  elements           jsonb NOT NULL CHECK (jsonb_typeof(elements) = 'array' AND jsonb_array_length(elements) >= 1),
  state              text NOT NULL CHECK (state IN ('proposed', 'applied', 'declined', 'superseded')),
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_note      text,
  applied_version    int,
  correlation_id     uuid NOT NULL,
  CONSTRAINT cpl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT cpl_applied CHECK (state <> 'applied' OR (applied_version IS NOT NULL AND decided_by IS NOT NULL)),
  CONSTRAINT cpl_declined CHECK (state <> 'declined' OR (decided_by IS NOT NULL AND decision_note IS NOT NULL))
);
CREATE INDEX cpl_downstream ON twin.coupling_proposals (downstream_twin_id, state);
CREATE INDEX cpl_link ON twin.coupling_proposals (link_id, state);

/* The three records move one way each and are never deleted: a contract current → superseded; a link live → retired; a proposal
   proposed → applied | declined | superseded. Nothing else of a row changes. */
CREATE OR REPLACE FUNCTION twin.composition_rows_forward() RETURNS trigger
SET search_path = twin, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are append-only: DELETE prohibited', TG_TABLE_NAME USING ERRCODE = '2F002'; END IF;
  IF TG_TABLE_NAME = 'twin_contracts' THEN
    IF NOT (OLD.state = 'current' AND NEW.state = 'superseded') OR (to_jsonb(NEW) - 'state' - 'superseded_at') <> (to_jsonb(OLD) - 'state' - 'superseded_at') THEN
      RAISE EXCEPTION 'twin contract % of % is immutable; a new contract version supersedes it', OLD.contract_version, OLD.twin_id USING ERRCODE = '2F002';
    END IF;
  ELSIF TG_TABLE_NAME = 'twin_links' THEN
    IF NOT (OLD.state = 'live' AND NEW.state = 'retired') OR (to_jsonb(NEW) - 'state' - 'retired_by' - 'retired_at' - 'retire_reason') <> (to_jsonb(OLD) - 'state' - 'retired_by' - 'retired_at' - 'retire_reason') THEN
      RAISE EXCEPTION 'twin link % is immutable once retired, and only its retirement changes it', OLD.link_id USING ERRCODE = '2F002';
    END IF;
  ELSE
    IF OLD.state <> 'proposed' OR NEW.state = 'proposed'
       OR (to_jsonb(NEW) - 'state' - 'decided_by' - 'decided_at' - 'decision_note' - 'applied_version') <> (to_jsonb(OLD) - 'state' - 'decided_by' - 'decided_at' - 'decision_note' - 'applied_version') THEN
      RAISE EXCEPTION 'coupling proposal % is decided once and never rewritten', OLD.proposal_id USING ERRCODE = '2F002';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER twc_forward BEFORE UPDATE OR DELETE ON twin.twin_contracts FOR EACH ROW EXECUTE FUNCTION twin.composition_rows_forward();
CREATE TRIGGER twl_forward BEFORE UPDATE OR DELETE ON twin.twin_links FOR EACH ROW EXECUTE FUNCTION twin.composition_rows_forward();
CREATE TRIGGER cpl_forward BEFORE UPDATE OR DELETE ON twin.coupling_proposals FOR EACH ROW EXECUTE FUNCTION twin.composition_rows_forward();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['twin_contracts', 'twin_links', 'coupling_proposals'] LOOP
    EXECUTE format('ALTER TABLE twin.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE twin.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY twin_isolation ON twin.%I USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);  -- the 0032:634-639 idiom
    EXECUTE format('GRANT SELECT ON twin.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

/* The kind's declared element schema, as the contract and the link check it: NULL when the kind declares none (supply-chain: no check). */
CREATE OR REPLACE FUNCTION twin.schema_unit_of(p_twin_id uuid, p_key text) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN k.element_schema = '{}'::jsonb THEN NULL
              WHEN k.element_schema ? split_part(p_key, ':', 1) THEN jsonb_build_object('declared', true, 'unit', k.element_schema -> split_part(p_key, ':', 1) -> 'unit')
              ELSE jsonb_build_object('declared', false) END
    FROM twin.twins_current t JOIN twin.twin_kind_schemas k ON k.kind = t.kind WHERE t.twin_id = p_twin_id;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION twin.schema_unit_of(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.schema_unit_of(uuid,text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION twin.publish_contract(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_exposed jsonb, p_approved jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; e record; s jsonb; f jsonb; v_next int; l record; m jsonb; v_prior int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.contract.publish']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'twin contract rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'twin contract rejected: no such twin % in this domain', p_twin_id USING ERRCODE = '23503'; END IF;
  -- OWNERSHIP: a twin's interface is published by its owner, never by a dependant.
  IF t.owner_principal_id <> p_actor THEN
    RAISE EXCEPTION 'twin contract rejected (ownership): the contract of twin % is published by its owner', p_twin_id USING ERRCODE = '42501';
  END IF;
  IF p_exposed IS NULL OR jsonb_typeof(p_exposed) <> 'object' OR p_exposed = '{}'::jsonb THEN
    RAISE EXCEPTION 'twin contract rejected (exposed): a contract exposes at least one element key as {key: {unit, cadence}}' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT key, value FROM jsonb_each(p_exposed) LOOP
    IF e.key !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' OR jsonb_typeof(e.value) <> 'object' OR NOT (e.value ? 'unit')
       OR NOT (jsonb_typeof(e.value -> 'unit') IN ('string', 'null'))
       OR NOT (coalesce(e.value ->> 'cadence', '') IN ('on-admission', 'daily', 'weekly', 'monthly', 'quarterly')) THEN
      RAISE EXCEPTION 'twin contract rejected (exposed): key % must be an element key with {unit: text or null, cadence: on-admission | daily | weekly | monthly | quarterly}', e.key USING ERRCODE = '22023';
    END IF;
    s := twin.schema_unit_of(p_twin_id, e.key);
    IF s IS NOT NULL AND NOT (s ->> 'declared')::boolean THEN
      RAISE EXCEPTION 'twin contract rejected (schema): key % is not an element the % kind declares', e.key, t.kind USING ERRCODE = '22023';
    END IF;
    IF s IS NOT NULL AND (s -> 'unit') IS DISTINCT FROM (e.value -> 'unit') THEN
      RAISE EXCEPTION 'twin contract rejected (schema): key % is exposed in %, the % kind declares it in %', e.key, e.value -> 'unit', t.kind, s -> 'unit' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_approved IS NULL OR jsonb_typeof(p_approved) <> 'object' OR jsonb_typeof(p_approved -> 'method_families') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_approved -> 'decision_classes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'twin contract rejected (uses): approved uses are {method_families: [...], decision_classes: [...]}' USING ERRCODE = '22023';
  END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(p_approved -> 'method_families') LOOP
    IF jsonb_typeof(f) <> 'string' OR NOT ((f #>> '{}') IN ('flow', 'discrete-event', 'system-dynamics', 'agent-based', 'optimisation', 'war-gaming', 'counterfactual')) THEN
      RAISE EXCEPTION 'twin contract rejected (uses): % is not a method family', f USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR f IN SELECT * FROM jsonb_array_elements(p_approved -> 'decision_classes') LOOP
    IF jsonb_typeof(f) <> 'string' OR (f #>> '{}') !~ '^[a-z][a-z0-9-]{1,40}$' THEN
      RAISE EXCEPTION 'twin contract rejected (uses): decision class % must be a short lower-case name', f USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- A new version never strands a live dependant: every key a live link consumes stays exposed, every live link's use stays approved.
  FOR l IN SELECT * FROM twin.twin_links x WHERE x.upstream_twin_id = p_twin_id AND x.state = 'live' LOOP
    FOR m IN SELECT * FROM jsonb_array_elements(l.mapping) LOOP
      IF NOT (p_exposed ? (m ->> 'from')) THEN
        RAISE EXCEPTION 'twin contract rejected (live_link): live link % consumes key %, which this version no longer exposes; its owner retires the link first', l.link_id, m ->> 'from' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF NOT ((p_approved -> 'decision_classes') ? l.use_class) THEN
      RAISE EXCEPTION 'twin contract rejected (live_link): live link % serves %, which this version no longer approves; its owner retires the link first', l.link_id, l.use_class USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT max(c.contract_version) INTO v_prior FROM twin.twin_contracts c WHERE c.twin_id = p_twin_id;
  v_next := coalesce(v_prior, 0) + 1;
  UPDATE twin.twin_contracts SET state = 'superseded', superseded_at = clock_timestamp() WHERE twin_id = p_twin_id AND state = 'current';
  INSERT INTO twin.twin_contracts (twin_id, contract_version, scope, tenant_id, domain_id, exposed, approved_uses, state, published_by, correlation_id)
  VALUES (p_twin_id, v_next, 'DOMAIN', p_tenant, p_domain, p_exposed,
          jsonb_build_object('method_families', p_approved -> 'method_families', 'decision_classes', p_approved -> 'decision_classes'), 'current', p_actor, p_correlation);
  -- The declared-but-unused interfaces column mirrors the current contract's summary (the declaration's own keys are kept beside it).
  UPDATE twin.twins_current SET interfaces = interfaces || jsonb_build_object('contract', jsonb_build_object(
           'version', v_next, 'exposed', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(p_exposed) k),
           'method_families', p_approved -> 'method_families', 'decision_classes', p_approved -> 'decision_classes'))
   WHERE twin_id = p_twin_id;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'contract.published', p_actor,
          jsonb_build_object('contract_version', v_next, 'supersedes', v_prior, 'exposed', p_exposed, 'approved_uses', p_approved), p_correlation);
  RETURN jsonb_build_object('twin_id', p_twin_id, 'contract_version', v_next, 'supersedes', v_prior, 'exposed', p_exposed,
                            'approved_uses', jsonb_build_object('method_families', p_approved -> 'method_families', 'decision_classes', p_approved -> 'decision_classes'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.publish_contract(uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.publish_contract(uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,uuid) TO eye_commit;

/*
 * THE RUN CHECK part C calls (twin.use_approved(p_twin uuid, p_family text) → boolean): may a run of method family p_family use twin
 * p_twin? A twin with NO contract restricts nothing (every twin declared before B29 runs as it did); a twin WITH a current contract serves
 * only the method families it approves. A NULL family is never approved. Definer, so the answer never depends on the caller's visibility
 * (an unseen contract must not read as "no contract").
 */
CREATE OR REPLACE FUNCTION twin.use_approved(p_twin uuid, p_family text) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_twin IS NULL OR p_family IS NULL THEN false
              WHEN NOT EXISTS (SELECT 1 FROM twin.twin_contracts c WHERE c.twin_id = p_twin AND c.state = 'current') THEN true
              ELSE EXISTS (SELECT 1 FROM twin.twin_contracts c WHERE c.twin_id = p_twin AND c.state = 'current' AND (c.approved_uses -> 'method_families') ? p_family) END;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION twin.use_approved(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.use_approved(uuid,text) TO eye_app, eye_commit;

-- ============================================================
-- A.4 DEPENDENCY LINKS
-- ============================================================
CREATE OR REPLACE FUNCTION twin.declare_link(
  p_link_id uuid, p_tenant uuid, p_domain uuid, p_upstream uuid, p_downstream uuid, p_mapping jsonb, p_use text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE up twin.twins_current%ROWTYPE; dn twin.twins_current%ROWTYPE; c twin.twin_contracts%ROWTYPE; m jsonb; s jsonb; v_to text[] := ARRAY[]::text[]; v_cycle boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.link.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'twin link rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO dn FROM twin.twins_current x WHERE x.twin_id = p_downstream AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'twin link rejected: no such downstream twin % in this domain', p_downstream USING ERRCODE = '23503'; END IF;
  SELECT * INTO up FROM twin.twins_current x WHERE x.twin_id = p_upstream AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'twin link rejected: no such upstream twin % in this domain', p_upstream USING ERRCODE = '23503'; END IF;
  -- OWNERSHIP: a dependency is declared by the twin that DEPENDS — the downstream owner; the upstream owner offers a contract, nothing more.
  IF dn.owner_principal_id <> p_actor THEN
    RAISE EXCEPTION 'twin link rejected (ownership): a link into twin % is declared by that twin''s owner', p_downstream USING ERRCODE = '42501';
  END IF;
  IF p_upstream = p_downstream THEN RAISE EXCEPTION 'twin link rejected (cycle): a twin does not depend on itself' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM twin.twin_contracts x WHERE x.twin_id = p_upstream AND x.state = 'current';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'twin link rejected (uncontracted): twin % publishes no contract; its owner publishes one before anything depends on it', p_upstream USING ERRCODE = '22023';
  END IF;
  IF p_mapping IS NULL OR jsonb_typeof(p_mapping) <> 'array' OR jsonb_array_length(p_mapping) = 0 THEN
    RAISE EXCEPTION 'twin link rejected (mapping): a link maps at least one upstream key to a downstream key, [{from, to}]' USING ERRCODE = '22023';
  END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(p_mapping) LOOP
    IF jsonb_typeof(m) <> 'object' OR jsonb_typeof(m -> 'from') IS DISTINCT FROM 'string' OR jsonb_typeof(m -> 'to') IS DISTINCT FROM 'string'
       OR (m ->> 'to') !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' THEN
      RAISE EXCEPTION 'twin link rejected (mapping): every entry is {from: an upstream key, to: a downstream element key}' USING ERRCODE = '22023';
    END IF;
    IF NOT (c.exposed ? (m ->> 'from')) THEN
      RAISE EXCEPTION 'twin link rejected (uncontracted_key): key % is not in the current contract (version %) of twin %', m ->> 'from', c.contract_version, p_upstream USING ERRCODE = '22023';
    END IF;
    IF (m ->> 'to') = ANY (v_to) THEN RAISE EXCEPTION 'twin link rejected (mapping): downstream key % is mapped twice', m ->> 'to' USING ERRCODE = '22023'; END IF;
    v_to := v_to || (m ->> 'to');
    s := twin.schema_unit_of(p_downstream, m ->> 'to');
    IF s IS NOT NULL AND NOT (s ->> 'declared')::boolean THEN
      RAISE EXCEPTION 'twin link rejected (schema): % is not an element the % kind declares', m ->> 'to', dn.kind USING ERRCODE = '22023';
    END IF;
    IF s IS NOT NULL AND (s -> 'unit') IS DISTINCT FROM (c.exposed -> (m ->> 'from') -> 'unit') THEN
      RAISE EXCEPTION 'twin link rejected (schema): % arrives in % and the % kind declares % in %', m ->> 'from', c.exposed -> (m ->> 'from') -> 'unit', dn.kind, m ->> 'to', s -> 'unit' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- APPROVED USES: the coupling serves a decision class the upstream's contract approves.
  IF p_use IS NULL OR p_use !~ '^[a-z][a-z0-9-]{1,40}$' OR NOT ((c.approved_uses -> 'decision_classes') ? p_use) THEN
    RAISE EXCEPTION 'twin link rejected (use_not_approved): twin %''s contract (version %) does not approve the use %; approved: %', p_upstream, c.contract_version, coalesce(p_use, '<none>'), c.approved_uses -> 'decision_classes'
      USING ERRCODE = '22023';
  END IF;
  -- NO CYCLES: the new edge upstream → downstream closes a cycle when the downstream already reaches the upstream over live links.
  WITH RECURSIVE reach(twin_id, depth) AS (
    SELECT l.downstream_twin_id, 1 FROM twin.twin_links l WHERE l.upstream_twin_id = p_downstream AND l.state = 'live'
    UNION
    SELECT l.downstream_twin_id, r.depth + 1 FROM twin.twin_links l JOIN reach r ON l.upstream_twin_id = r.twin_id WHERE l.state = 'live' AND r.depth < 64)
  SELECT EXISTS (SELECT 1 FROM reach WHERE twin_id = p_upstream) INTO v_cycle;
  IF v_cycle THEN
    RAISE EXCEPTION 'twin link rejected (cycle): twin % already depends, over live links, on twin %; this link would close a cycle', p_upstream, p_downstream USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM twin.twin_links l WHERE l.upstream_twin_id = p_upstream AND l.downstream_twin_id = p_downstream AND l.state = 'live') THEN
    RAISE EXCEPTION 'twin link rejected (duplicate): twin % already consumes twin % over a live link; retire it to change the mapping', p_downstream, p_upstream USING ERRCODE = '23505';
  END IF;
  INSERT INTO twin.twin_links (link_id, scope, tenant_id, domain_id, upstream_twin_id, downstream_twin_id, mapping, use_class, contract_version, state, declared_by, correlation_id)
  VALUES (p_link_id, 'DOMAIN', p_tenant, p_domain, p_upstream, p_downstream, p_mapping, p_use, c.contract_version, 'live', p_actor, p_correlation);
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_downstream, 'link.declared', p_actor,
          jsonb_build_object('link_id', p_link_id, 'upstream_twin_id', p_upstream, 'mapping', p_mapping, 'use', p_use, 'contract_version', c.contract_version), p_correlation);
  RETURN jsonb_build_object('link_id', p_link_id, 'upstream_twin_id', p_upstream, 'downstream_twin_id', p_downstream, 'mapping', p_mapping, 'use', p_use,
                            'contract_version', c.contract_version, 'state', 'live');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.declare_link(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.declare_link(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION twin.retire_link(p_link_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l twin.twin_links%ROWTYPE; v_owner uuid; v_withdrawn int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.link.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'twin link rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM twin.twin_links x WHERE x.link_id = p_link_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'twin link rejected: no such link % in this domain', p_link_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = l.downstream_twin_id;
  IF v_owner <> p_actor THEN RAISE EXCEPTION 'twin link rejected (ownership): link % is retired by the downstream twin''s owner', p_link_id USING ERRCODE = '42501'; END IF;
  IF l.state <> 'live' THEN RAISE EXCEPTION 'twin link rejected (retired): link % was retired at %', p_link_id, l.retired_at USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'twin link rejected (reason): a retirement states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE twin.twin_links SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = btrim(p_reason) WHERE link_id = p_link_id;
  -- A retired link propagates nothing more: its undecided proposals are superseded (never applied later).
  UPDATE twin.coupling_proposals SET state = 'superseded', decided_at = clock_timestamp(), decision_note = 'the link was retired' WHERE link_id = p_link_id AND state = 'proposed';
  GET DIAGNOSTICS v_withdrawn = ROW_COUNT;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, l.downstream_twin_id, 'link.retired', p_actor,
          jsonb_build_object('link_id', p_link_id, 'upstream_twin_id', l.upstream_twin_id, 'reason', btrim(p_reason), 'proposals_superseded', v_withdrawn), p_correlation);
  RETURN jsonb_build_object('link_id', p_link_id, 'state', 'retired', 'proposals_superseded', v_withdrawn);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.retire_link(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.retire_link(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- A.5 COUPLED STATE
-- ============================================================
/*
 * PROPOSE on admission. Fires in the admission's own transaction (twin.admit_version's UPDATE draft → admitted), for a version on branch
 * `actual` only (a scenario branch couples nothing into the actual state of a dependant). Per live link out of the admitted twin: the
 * mapped elements present and complete in the version, each with the upstream element's kind, basis, value, unit and citations (the
 * provenance the coupled value rests on — it satisfies the downstream element CHECKs exactly as it satisfied the upstream's), and the
 * `twin` citation naming the admitted version by its TWN digest. An undecided older proposal of the same link is superseded.
 */
CREATE OR REPLACE FUNCTION twin.propose_couplings() RETURNS trigger
SECURITY DEFINER SET search_path = twin, objects, public, pg_catalog, pg_temp AS $$
DECLARE l record; m jsonb; e record; v_elements jsonb; v_digest text; v_citation jsonb; v_proposal uuid; v_actor uuid; v_corr uuid;
BEGIN
  IF NEW.branch_id <> 'actual' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.twin_links x WHERE x.upstream_twin_id = NEW.twin_id AND x.state = 'live') THEN RETURN NEW; END IF;
  SELECT o.content_digest INTO v_digest FROM objects.canonical_objects o
   WHERE o.object_type = 'TWN' AND o.object_id = NEW.twin_id AND o.object_version = NEW.version AND o.tenant_id = NEW.tenant_id;
  -- A coupled element cites an EXACT object: an admission without its TWN canonical version (the admit route writes it first) proposes
  -- nothing it could not bind — it is refused, never cited by some other digest.
  IF v_digest IS NULL THEN
    RAISE EXCEPTION 'coupling rejected: version % of twin % has no canonical TWN version to cite; its dependants cannot be proposed a value', NEW.version, NEW.twin_id USING ERRCODE = '23503';
  END IF;
  v_citation := jsonb_build_object('kind', 'twin', 'id', NEW.twin_id::text, 'version', NEW.version, 'digest', v_digest);
  v_actor := coalesce(public.eye_principal(), NEW.opened_by);
  v_corr := coalesce(public.eye_correlation(), NEW.correlation_id);
  FOR l IN SELECT * FROM twin.twin_links x WHERE x.upstream_twin_id = NEW.twin_id AND x.state = 'live' ORDER BY x.link_id LOOP
    v_elements := '[]'::jsonb;
    FOR m IN SELECT * FROM jsonb_array_elements(l.mapping) LOOP
      SELECT * INTO e FROM twin.state_elements s WHERE s.twin_id = NEW.twin_id AND s.version = NEW.version AND s.key = (m ->> 'from') AND s.health = 'complete';
      IF FOUND THEN
        v_elements := v_elements || jsonb_build_array(jsonb_build_object(
          'key', m ->> 'to', 'from_key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value, 'unit', e.unit,
          'citations', e.citations, 'valid_from', e.valid_from, 'valid_to', e.valid_to, 'confidence', e.confidence, 'synthetic_state', e.synthetic_state,
          'controls', e.controls, 'inherited_validation', e.inherited_validation));
      END IF;
    END LOOP;
    CONTINUE WHEN jsonb_array_length(v_elements) = 0;
    UPDATE twin.coupling_proposals SET state = 'superseded', decided_at = clock_timestamp(), decision_note = format('superseded by version %s of the upstream twin', NEW.version)
     WHERE link_id = l.link_id AND state = 'proposed';
    v_proposal := gen_random_uuid();
    INSERT INTO twin.coupling_proposals (proposal_id, scope, tenant_id, domain_id, link_id, upstream_twin_id, upstream_version, downstream_twin_id,
                                         upstream_citation, elements, state, correlation_id)
    VALUES (v_proposal, 'DOMAIN', NEW.tenant_id, NEW.domain_id, l.link_id, NEW.twin_id, NEW.version, l.downstream_twin_id, v_citation, v_elements, 'proposed', v_corr);
    INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', NEW.tenant_id, NEW.domain_id, l.downstream_twin_id, 'coupling.proposed', v_actor,
            jsonb_build_object('proposal_id', v_proposal, 'link_id', l.link_id, 'upstream', v_citation,
                               'keys', (SELECT jsonb_agg(x ->> 'key' ORDER BY x ->> 'key') FROM jsonb_array_elements(v_elements) x)), v_corr);
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER twv_propose_couplings AFTER UPDATE OF state ON twin.twin_versions
  FOR EACH ROW WHEN (OLD.state = 'draft' AND NEW.state = 'admitted') EXECUTE FUNCTION twin.propose_couplings();

/*
 * The existing VERSION and GROUND ports, each with ONE change: the bound action twin.coupling.apply is served beside the port's own
 * (twin.version / twin.ground), so a coupling is applied THROUGH them — the same draft rules, carry-forward re-judgement, materiality and
 * citation checks — never around them. Bodies are 0035's verbatim otherwise.
 */
CREATE OR REPLACE FUNCTION twin.open_version(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_branch text, p_forked_from int, p_known_at timestamptz, p_observed_through date,
  p_carry_from int, p_except text[], p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS int
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; v_supersedes int; v_open int; v_health jsonb := '{}'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.version', /* B29 (0092) */ 'twin.coupling.apply']);
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
      health, valid_from, valid_to, confidence, synthetic_state, controls, inherited_validation, grounded_by, correlation_id)
    SELECT gen_random_uuid(), e.scope, e.tenant_id, e.domain_id, e.twin_id, v_next, e.key, e.kind, e.basis_truth_state, e.value, e.unit,
           e.material, e.citations,
           CASE
             WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c
                            JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                                                             AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                           WHERE (c ->> 'kind') <> 'entity' AND o.lifecycle_state IN ('withdrawn', 'retired')) THEN 'unreadable'
             WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c
                            JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                                                             AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                           WHERE (c ->> 'kind') <> 'entity' AND o.recorded_at > p_known_at) THEN 'incomplete'
             WHEN e.kind IN ('observed', 'estimated') AND p_observed_through IS NOT NULL AND e.valid_from IS NOT NULL AND e.valid_from > p_observed_through THEN 'incomplete'
             WHEN e.kind IN ('observed', 'estimated') AND p_observed_through IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c
                            JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                                                             AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                           WHERE (c ->> 'kind') = 'evidence' AND o.event_time IS NOT NULL AND (o.event_time AT TIME ZONE 'UTC')::date > p_observed_through) THEN 'incomplete'
             WHEN p_observed_through IS NOT NULL AND e.valid_to IS NOT NULL AND e.valid_to < p_observed_through THEN 'stale'
             ELSE e.health END,
           e.valid_from, e.valid_to, e.confidence, e.synthetic_state, e.controls, e.inherited_validation, p_actor, p_correlation
      FROM twin.state_elements e
     WHERE e.twin_id = p_twin_id AND e.version = p_carry_from AND NOT (e.key = ANY (coalesce(p_except, ARRAY[]::text[])));
    UPDATE twin.twin_versions SET element_count = (SELECT count(*) FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = v_next)
     WHERE twin_id = p_twin_id AND version = v_next;
    SELECT coalesce(jsonb_object_agg(h, n), '{}'::jsonb) INTO v_health
      FROM (SELECT e.health h, count(*) n FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = v_next GROUP BY e.health) x;
  END IF;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'version.opened', p_actor,
          jsonb_build_object('version', v_next, 'branch_id', p_branch, 'forked_from_version', p_forked_from, 'supersedes', v_supersedes,
                             'known_at', p_known_at, 'observed_through', p_observed_through, 'carried_from', p_carry_from, 'except', to_jsonb(p_except),
                             'carried_health', v_health), p_correlation);
  RETURN v_next;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION twin.ground_element(
  p_element_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_version int, p_key text, p_kind text, p_basis text,
  p_value jsonb, p_unit text, p_citations jsonb, p_health text, p_valid_from date, p_valid_to date, p_confidence numeric,
  p_synthetic boolean, p_controls jsonb, p_inherited_validation text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_material boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.ground', /* B29 (0092) */ 'twin.coupling.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin_id AND v.version = p_version
                   AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'draft') THEN
    RAISE EXCEPTION 'grounding rejected: version % of twin % is not an open draft in this domain', p_version, p_twin_id USING ERRCODE = '2F002';
  END IF;
  IF NOT twin.citations_ok(p_citations) THEN
    RAISE EXCEPTION 'grounding rejected: citations must be an array of {kind, id, version, digest} binding exact objects' USING ERRCODE = '22023';
  END IF;
  IF twin.citation_count(p_citations, 'claim') > 0 AND p_basis IS NULL THEN
    RAISE EXCEPTION 'grounding rejected: % cites a claim and names no truth state for it — a derived claim keeps its truth state', p_key USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'predicted' AND p_inherited_validation IS NULL THEN
    RAISE EXCEPTION 'grounding rejected: % is predicted and carries no validation state from its forecast', p_key USING ERRCODE = '22023';
  END IF;
  v_material := twin.key_is_material(p_twin_id, p_key);
  IF v_material AND (twin.citation_count(p_citations, 'evidence') + twin.citation_count(p_citations, 'claim') + twin.citation_count(p_citations, 'forecast')
                     + twin.citation_count(p_citations, 'assumption') + twin.citation_count(p_citations, 'run')) = 0 THEN
    RAISE EXCEPTION 'grounding rejected: % is material for this twin and is substantiated by nothing but an entity — an entity names a subject, it substantiates no value', p_key
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO twin.state_elements (
    element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, basis_truth_state, value, unit, material, citations,
    health, valid_from, valid_to, confidence, synthetic_state, controls, inherited_validation, grounded_by, correlation_id
  ) VALUES (
    p_element_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_version, p_key, p_kind, p_basis, p_value, p_unit, v_material, p_citations,
    p_health, p_valid_from, p_valid_to, p_confidence, coalesce(p_synthetic, false), coalesce(p_controls, '{}'::jsonb), p_inherited_validation, p_actor, p_correlation);
  UPDATE twin.twin_versions SET element_count = element_count + 1 WHERE twin_id = p_twin_id AND version = p_version;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'element.grounded', p_actor,
          jsonb_build_object('version', p_version, 'key', p_key, 'kind', p_kind, 'material', v_material, 'health', p_health,
                             'citations', p_citations, 'synthetic_state', coalesce(p_synthetic, false), 'inherited_validation', p_inherited_validation), p_correlation);
  RETURN v_material;
END $$ LANGUAGE plpgsql;

/*
 * APPLY: the DOWNSTREAM owner takes a proposal into the downstream twin — extending its open draft on `actual` (when that draft was opened
 * after the upstream version was admitted and holds none of the coupled keys) or opening one (known now, carrying the latest admitted
 * version on `actual` except the coupled keys) — and grounds every coupled element through twin.ground_element with the upstream element's
 * citations plus the `twin` citation. Admission stays the owner's own act (the admit route). The UPSTREAM owner never writes here.
 */
CREATE OR REPLACE FUNCTION twin.apply_coupling(p_proposal_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p twin.coupling_proposals%ROWTYPE; l twin.twin_links%ROWTYPE; v_down uuid; v_up uuid; d twin.twin_versions%ROWTYPE; prior twin.twin_versions%ROWTYPE;
        v_version int; v_opened boolean := false; v_keys text[]; v_admitted timestamptz; e jsonb; v_clash text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.coupling.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'coupling rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM twin.coupling_proposals x WHERE x.proposal_id = p_proposal_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coupling rejected: no such proposal % in this domain', p_proposal_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_down FROM twin.twins_current WHERE twin_id = p.downstream_twin_id;
  SELECT owner_principal_id INTO v_up FROM twin.twins_current WHERE twin_id = p.upstream_twin_id;
  -- THE OWNERSHIP BOUNDARY: only the downstream twin's owner writes the downstream twin — the upstream owner never, whatever roles they hold.
  IF v_down <> p_actor THEN
    IF v_up = p_actor THEN
      RAISE EXCEPTION 'coupling rejected (ownership_boundary): the owner of upstream twin % does not write downstream twin %; its owner applies or declines the proposal', p.upstream_twin_id, p.downstream_twin_id
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'coupling rejected (ownership): proposal % is applied by the owner of downstream twin %', p_proposal_id, p.downstream_twin_id USING ERRCODE = '42501';
  END IF;
  IF p.state <> 'proposed' THEN RAISE EXCEPTION 'coupling rejected (state): proposal % is %, not proposed', p_proposal_id, p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO l FROM twin.twin_links x WHERE x.link_id = p.link_id;
  IF l.state <> 'live' THEN RAISE EXCEPTION 'coupling rejected (link_retired): link % was retired; its proposals are not applied', p.link_id USING ERRCODE = '22023'; END IF;
  SELECT array_agg(x ->> 'key' ORDER BY x ->> 'key') INTO v_keys FROM jsonb_array_elements(p.elements) x;
  SELECT admitted_at INTO v_admitted FROM twin.twin_versions WHERE twin_id = p.upstream_twin_id AND version = p.upstream_version;
  SELECT * INTO d FROM twin.twin_versions x WHERE x.twin_id = p.downstream_twin_id AND x.branch_id = 'actual' AND x.state = 'draft' FOR UPDATE;
  IF FOUND THEN
    -- EXTEND the open draft — only when it was opened knowing the upstream version (the record-time rule) and holds none of the coupled keys.
    IF d.known_at < v_admitted THEN
      RAISE EXCEPTION 'coupling rejected (draft_conflict): the open draft (version %) of twin % is known at %, before upstream version % was admitted at %; admit or ground it, then apply',
        d.version, p.downstream_twin_id, d.known_at, p.upstream_version, v_admitted USING ERRCODE = '22023';
    END IF;
    SELECT min(s.key) INTO v_clash FROM twin.state_elements s WHERE s.twin_id = d.twin_id AND s.version = d.version AND s.key = ANY (v_keys);
    IF v_clash IS NOT NULL THEN
      RAISE EXCEPTION 'coupling rejected (draft_conflict): the open draft (version %) of twin % already holds %; admit it, then apply', d.version, p.downstream_twin_id, v_clash USING ERRCODE = '22023';
    END IF;
    v_version := d.version;
  ELSE
    SELECT * INTO prior FROM twin.twin_versions x WHERE x.twin_id = p.downstream_twin_id AND x.branch_id = 'actual' AND x.state = 'admitted' ORDER BY x.version DESC LIMIT 1;
    v_version := twin.open_version(p.downstream_twin_id, p_tenant, p_domain, 'actual', NULL, clock_timestamp(), prior.observed_through, prior.version, v_keys,
                                   p_actor, gen_random_uuid(), p_correlation);
    v_opened := true;
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p.elements) LOOP
    PERFORM twin.ground_element(gen_random_uuid(), p_tenant, p_domain, p.downstream_twin_id, v_version, e ->> 'key', e ->> 'kind', e ->> 'basis_truth_state',
      e -> 'value', e ->> 'unit', (e -> 'citations') || jsonb_build_array(p.upstream_citation), 'complete',
      (e ->> 'valid_from')::date, (e ->> 'valid_to')::date, (e ->> 'confidence')::numeric, coalesce((e ->> 'synthetic_state')::boolean, false),
      coalesce(e -> 'controls', '{}'::jsonb), e ->> 'inherited_validation', p_actor, gen_random_uuid(), p_correlation);
  END LOOP;
  UPDATE twin.coupling_proposals SET state = 'applied', decided_by = p_actor, decided_at = clock_timestamp(), applied_version = v_version WHERE proposal_id = p_proposal_id;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p.downstream_twin_id, 'coupling.applied', p_actor,
          jsonb_build_object('proposal_id', p_proposal_id, 'link_id', p.link_id, 'upstream', p.upstream_citation, 'version', v_version, 'opened', v_opened, 'keys', to_jsonb(v_keys)), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal_id, 'downstream_twin_id', p.downstream_twin_id, 'version', v_version, 'opened', v_opened, 'keys', to_jsonb(v_keys),
                            'upstream', p.upstream_citation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.apply_coupling(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.apply_coupling(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION twin.decline_coupling(p_proposal_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p twin.coupling_proposals%ROWTYPE; v_down uuid; v_up uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.coupling.decline']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'coupling rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM twin.coupling_proposals x WHERE x.proposal_id = p_proposal_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coupling rejected: no such proposal % in this domain', p_proposal_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_down FROM twin.twins_current WHERE twin_id = p.downstream_twin_id;
  SELECT owner_principal_id INTO v_up FROM twin.twins_current WHERE twin_id = p.upstream_twin_id;
  IF v_down <> p_actor THEN
    IF v_up = p_actor THEN
      RAISE EXCEPTION 'coupling rejected (ownership_boundary): the owner of upstream twin % does not decide for downstream twin %', p.upstream_twin_id, p.downstream_twin_id USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'coupling rejected (ownership): proposal % is declined by the owner of downstream twin %', p_proposal_id, p.downstream_twin_id USING ERRCODE = '42501';
  END IF;
  IF p.state <> 'proposed' THEN RAISE EXCEPTION 'coupling rejected (state): proposal % is %, not proposed', p_proposal_id, p.state USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'coupling rejected (reason): a declined proposal states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE twin.coupling_proposals SET state = 'declined', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = btrim(p_reason) WHERE proposal_id = p_proposal_id;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p.downstream_twin_id, 'coupling.declined', p_actor,
          jsonb_build_object('proposal_id', p_proposal_id, 'link_id', p.link_id, 'upstream', p.upstream_citation, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal_id, 'state', 'declined');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.decline_coupling(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.decline_coupling(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/*
 * THE OWNERSHIP BOUNDARY on every write path, not only the coupling's: a twin's state is written through ports that each record their
 * act in twin.twin_events (version.opened, element.grounded, version.admitted), so the boundary is held where they all meet. The owner of
 * a LIVE UPSTREAM of a twin, who is not that twin's owner, never opens, grounds or admits it — whatever domain role they hold. Nothing
 * changes for a twin nothing depends on upstream of (every pre-B29 twin), nor for a person who owns both ends.
 */
CREATE OR REPLACE FUNCTION twin.upstream_owner_boundary() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_upstream uuid;
BEGIN
  IF NEW.event NOT IN ('version.opened', 'element.grounded', 'version.admitted') THEN RETURN NEW; END IF;
  SELECT l.upstream_twin_id INTO v_upstream
    FROM twin.twin_links l JOIN twin.twins_current u ON u.twin_id = l.upstream_twin_id JOIN twin.twins_current d ON d.twin_id = l.downstream_twin_id
   WHERE l.downstream_twin_id = NEW.twin_id AND l.state = 'live' AND u.owner_principal_id = NEW.actor_principal_id AND d.owner_principal_id <> NEW.actor_principal_id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'coupling rejected (ownership_boundary): the owner of upstream twin % does not write downstream twin % (% refused); its owner applies what the upstream proposes',
      v_upstream, NEW.twin_id, NEW.event USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER twe_upstream_owner_boundary BEFORE INSERT ON twin.twin_events
  FOR EACH ROW EXECUTE FUNCTION twin.upstream_owner_boundary();

-- ============================================================
-- A.6 DEPENDENCY COMPLETENESS (L5-C06)
-- ============================================================
/* required: the kind's required_dependencies ('a|b' = either family); linked: the families of the twins it depends on over live links,
   directly or through its upstreams (a supply chain reached through a process counts for the enterprise); missing: the required entries no
   linked family satisfies; ratio: satisfied / required (1 when nothing is required). Invoker's rights: it reads what the caller may see. */
CREATE OR REPLACE FUNCTION twin.dependency_completeness(p_tenant uuid, p_domain uuid, p_twin uuid) RETURNS jsonb
STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH RECURSIVE t AS (
    SELECT x.twin_id, x.kind, k.family, k.required_dependencies FROM twin.twins_current x JOIN twin.twin_kind_schemas k ON k.kind = x.kind
     WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain),
  up(twin_id, depth) AS (
    SELECT l.upstream_twin_id, 1 FROM twin.twin_links l WHERE l.downstream_twin_id = p_twin AND l.state = 'live' AND l.tenant_id = p_tenant AND l.domain_id = p_domain
    UNION
    SELECT l.upstream_twin_id, u.depth + 1 FROM twin.twin_links l JOIN up u ON l.downstream_twin_id = u.twin_id
     WHERE l.state = 'live' AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND u.depth < 64),
  fam AS (
    SELECT DISTINCT coalesce(k.family, x.kind) AS family, min(u.depth) OVER (PARTITION BY coalesce(k.family, x.kind)) AS depth
      FROM up u JOIN twin.twins_current x ON x.twin_id = u.twin_id JOIN twin.twin_kind_schemas k ON k.kind = x.kind),
  req AS (SELECT r, EXISTS (SELECT 1 FROM fam f WHERE f.family = ANY (string_to_array(r, '|'))) AS ok FROM t, unnest(t.required_dependencies) r)
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM t) THEN NULL ELSE jsonb_build_object(
    'twin_id', p_twin, 'kind', (SELECT kind FROM t), 'family', (SELECT family FROM t),
    'required', coalesce((SELECT jsonb_agg(r ORDER BY r) FROM req), '[]'::jsonb),
    'linked', coalesce((SELECT jsonb_agg(DISTINCT family) FROM fam), '[]'::jsonb),
    'direct', coalesce((SELECT jsonb_agg(DISTINCT family) FROM fam WHERE depth = 1), '[]'::jsonb),
    'satisfied', coalesce((SELECT jsonb_agg(r ORDER BY r) FROM req WHERE ok), '[]'::jsonb),
    'missing', coalesce((SELECT jsonb_agg(r ORDER BY r) FROM req WHERE NOT ok), '[]'::jsonb),
    'required_count', (SELECT count(*) FROM req), 'satisfied_count', (SELECT count(*) FROM req WHERE ok),
    'ratio', CASE WHEN (SELECT count(*) FROM req) = 0 THEN 1 ELSE round((SELECT count(*) FROM req WHERE ok)::numeric / (SELECT count(*) FROM req), 4) END) END;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.dependency_completeness(uuid,uuid,uuid) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §D THE CONSTRAINT ENGINE (part b29/constraints) ─────────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════════
-- §D THE CONSTRAINT ENGINE (F-P5-05 clause 3: general constraint declaration and satisfaction — topology, conservation, business rules)
--    — part D of 0092 (B29, 2026-09-29)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Part-local file (the integrator combines it into 0092 as §D). Forward only: no earlier migration and no §0 statement is edited; the
-- Phase 0 schemas gain nothing (ctx.build and ctx.assert_capability are CALLED, never changed). What this part adds:
--
--   D.1 DECLARED CONSTRAINT SETS: simulation.constraint_sets (set_key unique per domain, a title, the STEWARD who owns it, live | retired,
--       the current version), simulation.constraint_set_versions (the constraints jsonb, its digest, who declared it and when — immutable)
--       and simulation.constraint_set_events (set.declared | set.versioned | set.retired). A constraint is {key, kind, …}:
--         topology      — targets reachable from sources over the subject's edges; no route through an avoided (retired) site; required edges;
--         conservation  — per stock key: opening + inflow − outflow = closing within a tolerance, the closing of one day the opening of the
--                         next, and no negative stock;
--         business_rule — a bound per day on a quantity key (<=, >=, between) in a unit the subject's quantities must match.
--       simulation.constraints_ok(jsonb) is the STRUCTURAL check (the TS evaluator, twin/constraints/evaluator.ts, validates in full before
--       the port and evaluates; the port refuses anything that is not a well-formed list of uniquely keyed constraints of the three kinds).
--   D.2 THE PORTS: simulation.declare_constraint_set (simulation.constraint.declare — a constraint steward declares a set they steward; a
--       domain administrator may name another steward), simulation.version_constraint_set (simulation.constraint.version — the set's own
--       steward, or a domain administrator; ANOTHER steward is refused; expected-version guarded) and simulation.retire_constraint_set
--       (simulation.constraint.retire — the same people). Each writes its event.
--   D.3 THE CHECK RECORD: simulation.plan_checks — every verdict the engine gives on a PLAN (through the route; or handed to the gate — a
--       run's inputs and outputs are recorded by §C on the run, simulation.run_constraint_checks, not here): the subject as checked
--       (kind, ref, the quantities and edges, their digest), the set versions it ran against (id, key,
--       version, digest — PINNED, so the check is reproducible after the set is re-versioned), the outcome, every violation, the reason an
--       outcome is indeterminate, the budget and the time taken, who checked (a person on the route; NULL for the gate) and when. Append-only.
--       simulation.record_plan_check serves TWO contexts: a person's plan check (simulation.plan.check, checked_by the acting
--       principal) and THE GATE's machine capability (below; checked_by NULL). It verifies every pin against the declared versions. A
--       domain that declares nothing for the subject satisfies it VACUOUSLY when every live set was asked for (no pins; the integrator's
--       rule of 2026-09-29, so an ordinary run is not held); named sets that were not checked never satisfy.
--   D.4 THE GATE'S MACHINE CAPABILITY: §C asks the gate OUTSIDE any write and with a scope only (the frozen ConstraintGate.check(scope, …) —
--       no principal travels with it). simulation.issue_constraint_gate_capability(tenant, domain, reason) mints — for the transaction only —
--       a DOMAIN-scoped machine context in the machine-capability mode 0038 taught ctx ('schedule': no session, no principal, scope fixed by
--       the minter; no new ctx mode — ctx is Phase 0), operation class 'constraint_gate', bound to the ONE action simulation.constraint.gate.
--       Under it the gate READS the sets through their row security (this domain's only — its read path outside any write) and, for a plan,
--       records through record_plan_check; no other port serves that action.
--       Granted to eye_commit only (the 0039 grant).

-- ─── D.1 the structural check ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION simulation.constraint_selector_ok(p jsonb) RETURNS boolean
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT p IS NOT NULL AND jsonb_typeof(p) = 'object'
     AND ((p ? 'nodes' AND jsonb_typeof(p -> 'nodes') = 'array' AND jsonb_array_length(p -> 'nodes') BETWEEN 1 AND 500
           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p -> 'nodes') n WHERE jsonb_typeof(n) <> 'string'))
       OR (p ? 'prefix' AND jsonb_typeof(p -> 'prefix') = 'string' AND length(p ->> 'prefix') BETWEEN 1 AND 120));
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION simulation.constraints_ok(p jsonb) RETURNS boolean
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE c jsonb; v_keys text[] := ARRAY[]::text[]; v_kind text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) < 1 OR jsonb_array_length(p) > 200 THEN RETURN false; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(c) <> 'object' OR jsonb_typeof(c -> 'key') IS DISTINCT FROM 'string' OR jsonb_typeof(c -> 'kind') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    IF (c ->> 'key') !~ '^[a-z][a-z0-9_.:-]{1,80}$' OR (c ->> 'key') = ANY (v_keys) THEN RETURN false; END IF;
    v_keys := v_keys || (c ->> 'key');
    v_kind := c ->> 'kind';
    IF c ? 'applies_to' AND (jsonb_typeof(c -> 'applies_to') <> 'array' OR jsonb_array_length(c -> 'applies_to') = 0
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(c -> 'applies_to') a WHERE jsonb_typeof(a) <> 'string' OR (a #>> '{}') NOT IN ('plan', 'run_input', 'run_output'))) THEN
      RETURN false;
    END IF;
    IF v_kind = 'business_rule' THEN
      IF jsonb_typeof(c -> 'quantity') IS DISTINCT FROM 'string' OR jsonb_typeof(c -> 'unit') IS DISTINCT FROM 'string' OR length(c ->> 'unit') < 1
         OR (c ->> 'op') IS NULL OR (c ->> 'op') NOT IN ('<=', '>=', 'between') OR coalesce(c ->> 'per', 'day') <> 'day' THEN RETURN false; END IF;
      IF (c ->> 'op') = 'between' AND NOT (jsonb_typeof(c -> 'min') = 'number' AND jsonb_typeof(c -> 'max') = 'number' AND (c ->> 'min')::numeric <= (c ->> 'max')::numeric) THEN RETURN false; END IF;
      IF (c ->> 'op') <> 'between' AND jsonb_typeof(c -> 'value') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    ELSIF v_kind = 'conservation' THEN
      IF NOT ((jsonb_typeof(c -> 'stocks') = 'array' AND jsonb_array_length(c -> 'stocks') >= 1
               AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c -> 'stocks') s WHERE jsonb_typeof(s) <> 'string'))
              OR (jsonb_typeof(c -> 'stock_prefix') = 'string' AND length(c ->> 'stock_prefix') >= 1)) THEN RETURN false; END IF;
      IF jsonb_typeof(c -> 'tolerance') IS DISTINCT FROM 'number' OR (c ->> 'tolerance')::numeric < 0 OR jsonb_typeof(c -> 'unit') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    ELSIF v_kind = 'topology' THEN
      IF NOT (simulation.constraint_selector_ok(c -> 'sources') AND simulation.constraint_selector_ok(c -> 'targets')) THEN RETURN false; END IF;
      IF c ? 'avoid' AND (jsonb_typeof(c -> 'avoid') <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(c -> 'avoid') a WHERE jsonb_typeof(a) <> 'string')) THEN RETURN false; END IF;
      IF c ? 'required_edges' AND (jsonb_typeof(c -> 'required_edges') <> 'array'
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(c -> 'required_edges') e WHERE jsonb_typeof(e -> 'from') IS DISTINCT FROM 'string' OR jsonb_typeof(e -> 'to') IS DISTINCT FROM 'string')) THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END $$ LANGUAGE plpgsql;

-- ─── D.1 the tables ─────────────────────────────────────────────────────────────
CREATE TABLE simulation.constraint_sets (
  set_id              uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  set_key             text NOT NULL CHECK (set_key ~ '^[a-z][a-z0-9-]{2,60}$'),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  steward_principal_id uuid NOT NULL,
  state               text NOT NULL CHECK (state IN ('live', 'retired')),
  current_version     int NOT NULL CHECK (current_version >= 1),
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by          uuid,
  retired_at          timestamptz,
  retire_reason       text,
  correlation_id      uuid NOT NULL,
  CONSTRAINT cset_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT cset_retired CHECK ((state = 'retired') = (retired_by IS NOT NULL AND retired_at IS NOT NULL AND retire_reason IS NOT NULL))
);
CREATE UNIQUE INDEX cset_key_unique ON simulation.constraint_sets (tenant_id, domain_id, set_key);

CREATE TABLE simulation.constraint_set_versions (
  set_id       uuid NOT NULL REFERENCES simulation.constraint_sets (set_id),
  version      int NOT NULL CHECK (version >= 1),
  scope        text NOT NULL,
  tenant_id    uuid NOT NULL,
  domain_id    uuid NOT NULL,
  constraints  jsonb NOT NULL CHECK (simulation.constraints_ok(constraints)),
  /* sha256 of constraints::text (jsonb's own normal form: the same constraints give the same digest) */
  digest       text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  note         text NOT NULL CHECK (length(btrim(note)) >= 3),
  declared_by  uuid NOT NULL,
  declared_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  PRIMARY KEY (set_id, version),
  CONSTRAINT csv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

CREATE TABLE simulation.constraint_set_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  set_id             uuid NOT NULL REFERENCES simulation.constraint_sets (set_id),
  event              text NOT NULL CHECK (event IN ('set.declared', 'set.versioned', 'set.retired')),
  version            int,
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT cse_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX cse_set ON simulation.constraint_set_events (set_id, occurred_at);

CREATE TABLE simulation.plan_checks (
  check_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  subject_kind        text NOT NULL CHECK (subject_kind IN ('plan', 'run_input', 'run_output')),
  subject_ref         text NOT NULL CHECK (length(subject_ref) BETWEEN 1 AND 200),
  /* the subject AS CHECKED — {quantities, edges} — so the verdict can be re-derived */
  subject             jsonb NOT NULL CHECK (jsonb_typeof(subject) = 'object'),
  subject_digest      text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  /* the PINNED set versions: [{set_id, set_key, version, digest}] — verified against constraint_set_versions at recording */
  sets                jsonb NOT NULL CHECK (jsonb_typeof(sets) = 'array'),
  outcome             text NOT NULL CHECK (outcome IN ('satisfied', 'violated', 'indeterminate')),
  violations          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(violations) = 'array'),
  indeterminate_reason text,
  budget_ms           int NOT NULL CHECK (budget_ms >= 0),
  elapsed_ms          int NOT NULL CHECK (elapsed_ms >= 0),
  checked_via         text NOT NULL CHECK (checked_via IN ('route', 'gate')),
  /* a person on the route; NULL for the gate (a machine capability — no principal travels with §C's call) */
  checked_by          uuid,
  checked_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT pchk_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pchk_who CHECK ((checked_via = 'route') = (checked_by IS NOT NULL)),
  CONSTRAINT pchk_violated CHECK ((outcome = 'violated') = (jsonb_array_length(violations) > 0)),
  CONSTRAINT pchk_indeterminate CHECK ((outcome = 'indeterminate') = (indeterminate_reason IS NOT NULL))
);
CREATE INDEX pchk_subject ON simulation.plan_checks (tenant_id, domain_id, subject_kind, subject_ref, checked_at);

-- Versions, events and checks are append-only; a set changes only its state (once, live → retired) and its current version (+1).
CREATE OR REPLACE FUNCTION simulation.constraint_append_only() RETURNS trigger
SET search_path = simulation, pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'simulation.% is append-only: % prohibited (B29 §D)', TG_TABLE_NAME, TG_OP USING ERRCODE = '2F002';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER csv_append_only BEFORE UPDATE OR DELETE ON simulation.constraint_set_versions FOR EACH ROW EXECUTE FUNCTION simulation.constraint_append_only();
CREATE TRIGGER cse_append_only BEFORE UPDATE OR DELETE ON simulation.constraint_set_events FOR EACH ROW EXECUTE FUNCTION simulation.constraint_append_only();
CREATE TRIGGER pchk_append_only BEFORE UPDATE OR DELETE ON simulation.plan_checks FOR EACH ROW EXECUTE FUNCTION simulation.constraint_append_only();

CREATE OR REPLACE FUNCTION simulation.constraint_sets_guard() RETURNS trigger
SET search_path = simulation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'simulation.constraint_sets is append-only: DELETE prohibited (B29 §D)' USING ERRCODE = '2F002'; END IF;
  IF NEW.set_id <> OLD.set_id OR NEW.scope <> OLD.scope OR NEW.tenant_id <> OLD.tenant_id OR NEW.domain_id <> OLD.domain_id OR NEW.set_key <> OLD.set_key
     OR NEW.steward_principal_id <> OLD.steward_principal_id OR NEW.declared_by <> OLD.declared_by OR NEW.declared_at <> OLD.declared_at OR NEW.correlation_id <> OLD.correlation_id THEN
    RAISE EXCEPTION 'constraint set % keeps its identity, key and steward (B29 §D)', OLD.set_id USING ERRCODE = '2F002';
  END IF;
  IF OLD.state = 'retired' THEN RAISE EXCEPTION 'constraint set % is retired and immutable (B29 §D)', OLD.set_id USING ERRCODE = '2F002'; END IF;
  IF NEW.current_version NOT IN (OLD.current_version, OLD.current_version + 1) THEN
    RAISE EXCEPTION 'constraint set % moves one version at a time (% → %)', OLD.set_id, OLD.current_version, NEW.current_version USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER cset_guard BEFORE UPDATE OR DELETE ON simulation.constraint_sets FOR EACH ROW EXECUTE FUNCTION simulation.constraint_sets_guard();

-- RLS and grants: the 0081 loop idiom (policy simulation_isolation; SELECT to eye_app, eye_commit; no write grant — the ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['constraint_sets', 'constraint_set_versions', 'constraint_set_events', 'plan_checks'] LOOP
    EXECUTE format('REVOKE ALL ON simulation.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE simulation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE simulation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY simulation_isolation ON simulation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON simulation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ─── D.2 the declaration ports ──────────────────────────────────────────────────
-- The refusal family is `constraint set rejected (<class>): …` — the class in parentheses maps the HTTP answer (observation-errors.ts §D).
CREATE OR REPLACE FUNCTION simulation.declare_constraint_set(
  p_set_id uuid, p_tenant uuid, p_domain uuid, p_set_key text, p_title text, p_steward uuid, p_constraints jsonb, p_note text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_steward uuid := coalesce(p_steward, p_actor); v_digest text; v_existing uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.constraint.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'constraint set rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF v_steward <> p_actor AND NOT executive.holds_any_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin']) THEN
    RAISE EXCEPTION 'constraint set rejected (steward): a constraint steward declares the sets they steward; naming another steward is the domain administrator''s act' USING ERRCODE = '42501';
  END IF;
  IF NOT executive.holds_any_role(v_steward, p_tenant, p_domain, ARRAY['constraint_steward', 'domain_admin']) THEN
    RAISE EXCEPTION 'constraint set rejected (steward_role): the steward % holds neither constraint_steward nor domain_admin in this domain', v_steward USING ERRCODE = '22023';
  END IF;
  IF p_set_key IS NULL OR p_set_key !~ '^[a-z][a-z0-9-]{2,60}$' THEN RAISE EXCEPTION 'constraint set rejected (key): a set key is 3–61 lower-case letters, digits and dashes' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_title)), 0) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'constraint set rejected (title): a set has a title (3–200 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_note)), 0) < 3 THEN RAISE EXCEPTION 'constraint set rejected (note): a version says why it is declared (at least 3 characters)' USING ERRCODE = '22023'; END IF;
  IF NOT simulation.constraints_ok(p_constraints) THEN
    RAISE EXCEPTION 'constraint set rejected (constraints): 1–200 uniquely keyed constraints of kind topology, conservation or business_rule, each with its fields' USING ERRCODE = '22023';
  END IF;
  SELECT s.set_id INTO v_existing FROM simulation.constraint_sets s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.set_key = p_set_key;
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'constraint set rejected (duplicate): the key % names set % in this domain (a new version is declared on it)', p_set_key, v_existing USING ERRCODE = '23505'; END IF;
  v_digest := encode(sha256(convert_to(p_constraints::text, 'UTF8')), 'hex');
  INSERT INTO simulation.constraint_sets (set_id, scope, tenant_id, domain_id, set_key, title, steward_principal_id, state, current_version, declared_by, declared_at, correlation_id)
  VALUES (p_set_id, 'DOMAIN', p_tenant, p_domain, p_set_key, btrim(p_title), v_steward, 'live', 1, p_actor, v_at, p_correlation);
  INSERT INTO simulation.constraint_set_versions (set_id, version, scope, tenant_id, domain_id, constraints, digest, note, declared_by, declared_at, correlation_id)
  VALUES (p_set_id, 1, 'DOMAIN', p_tenant, p_domain, p_constraints, v_digest, btrim(p_note), p_actor, v_at, p_correlation);
  INSERT INTO simulation.constraint_set_events (event_id, scope, tenant_id, domain_id, set_id, event, version, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_set_id, 'set.declared', 1, p_actor,
          jsonb_build_object('set_key', p_set_key, 'steward', v_steward, 'digest', v_digest, 'constraints', jsonb_array_length(p_constraints)), p_correlation);
  RETURN jsonb_build_object('set_id', p_set_id, 'set_key', p_set_key, 'title', btrim(p_title), 'steward_principal_id', v_steward, 'state', 'live', 'version', 1,
                            'digest', v_digest, 'constraints', p_constraints, 'declared_by', p_actor, 'declared_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.declare_constraint_set(uuid,uuid,uuid,text,text,uuid,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.declare_constraint_set(uuid,uuid,uuid,text,text,uuid,jsonb,text,uuid,uuid,uuid) TO eye_commit;

/* Who may change a set: its own steward, or a domain administrator of its domain — never another steward. */
CREATE OR REPLACE FUNCTION simulation.constraint_set_for_change(p_set_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_what text)
RETURNS simulation.constraint_sets
SECURITY DEFINER SET search_path = simulation, public, pg_catalog, pg_temp AS $$
DECLARE s simulation.constraint_sets%ROWTYPE;
BEGIN
  SELECT * INTO s FROM simulation.constraint_sets x WHERE x.set_id = p_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'constraint set rejected (unknown_set): no such set % in this domain', p_set_id USING ERRCODE = '23503'; END IF;
  IF s.steward_principal_id <> p_actor AND NOT executive.holds_any_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin']) THEN
    RAISE EXCEPTION 'constraint set rejected (not_steward): set % (%) is stewarded by %; only its steward or a domain administrator %s it', s.set_key, p_set_id, s.steward_principal_id, p_what USING ERRCODE = '42501';
  END IF;
  IF s.state = 'retired' THEN RAISE EXCEPTION 'constraint set rejected (retired): set % was retired at % — its versions stay readable, nothing is declared on it', s.set_key, s.retired_at USING ERRCODE = '22023'; END IF;
  RETURN s;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.constraint_set_for_change(uuid,uuid,uuid,uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION simulation.version_constraint_set(
  p_set_id uuid, p_tenant uuid, p_domain uuid, p_expected_version int, p_constraints jsonb, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, public, pg_catalog, pg_temp AS $$
DECLARE s simulation.constraint_sets%ROWTYPE; v_at timestamptz := clock_timestamp(); v_digest text; v_prior text; v_version int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.constraint.version']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'constraint set rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  s := simulation.constraint_set_for_change(p_set_id, p_tenant, p_domain, p_actor, 'version');
  IF p_expected_version IS DISTINCT FROM s.current_version THEN
    RAISE EXCEPTION 'constraint set rejected (stale_version): set % is at version %, not % — read it and version on the current one', s.set_key, s.current_version, p_expected_version USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_note)), 0) < 3 THEN RAISE EXCEPTION 'constraint set rejected (note): a version says why it is declared (at least 3 characters)' USING ERRCODE = '22023'; END IF;
  IF NOT simulation.constraints_ok(p_constraints) THEN
    RAISE EXCEPTION 'constraint set rejected (constraints): 1–200 uniquely keyed constraints of kind topology, conservation or business_rule, each with its fields' USING ERRCODE = '22023';
  END IF;
  v_digest := encode(sha256(convert_to(p_constraints::text, 'UTF8')), 'hex');
  SELECT v.digest INTO v_prior FROM simulation.constraint_set_versions v WHERE v.set_id = p_set_id AND v.version = s.current_version;
  IF v_prior = v_digest THEN RAISE EXCEPTION 'constraint set rejected (unchanged): version % of set % already holds these constraints (digest %)', s.current_version, s.set_key, v_digest USING ERRCODE = '22023'; END IF;
  v_version := s.current_version + 1;
  INSERT INTO simulation.constraint_set_versions (set_id, version, scope, tenant_id, domain_id, constraints, digest, note, declared_by, declared_at, correlation_id)
  VALUES (p_set_id, v_version, 'DOMAIN', p_tenant, p_domain, p_constraints, v_digest, btrim(p_note), p_actor, v_at, p_correlation);
  UPDATE simulation.constraint_sets SET current_version = v_version WHERE set_id = p_set_id;
  INSERT INTO simulation.constraint_set_events (event_id, scope, tenant_id, domain_id, set_id, event, version, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_set_id, 'set.versioned', v_version, p_actor,
          jsonb_build_object('set_key', s.set_key, 'prior_version', s.current_version, 'prior_digest', v_prior, 'digest', v_digest, 'note', btrim(p_note),
                             'by_steward', p_actor = s.steward_principal_id), p_correlation);
  RETURN jsonb_build_object('set_id', p_set_id, 'set_key', s.set_key, 'title', s.title, 'steward_principal_id', s.steward_principal_id, 'state', 'live', 'version', v_version,
                            'prior_version', s.current_version, 'digest', v_digest, 'constraints', p_constraints, 'declared_by', p_actor, 'declared_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.version_constraint_set(uuid,uuid,uuid,int,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.version_constraint_set(uuid,uuid,uuid,int,jsonb,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION simulation.retire_constraint_set(p_set_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, public, pg_catalog, pg_temp AS $$
DECLARE s simulation.constraint_sets%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.constraint.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'constraint set rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  s := simulation.constraint_set_for_change(p_set_id, p_tenant, p_domain, p_actor, 'retire');
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'constraint set rejected (reason): a retirement states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE simulation.constraint_sets SET state = 'retired', retired_by = p_actor, retired_at = v_at, retire_reason = btrim(p_reason) WHERE set_id = p_set_id;
  INSERT INTO simulation.constraint_set_events (event_id, scope, tenant_id, domain_id, set_id, event, version, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_set_id, 'set.retired', s.current_version, p_actor, jsonb_build_object('set_key', s.set_key, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('set_id', p_set_id, 'set_key', s.set_key, 'state', 'retired', 'version', s.current_version, 'retired_by', p_actor, 'retired_at', v_at, 'retire_reason', btrim(p_reason));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.retire_constraint_set(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.retire_constraint_set(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ─── D.4 the gate's machine capability ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION simulation.issue_constraint_gate_capability(p_tenant uuid, p_domain uuid, p_reason text, p_ttl_seconds int DEFAULT 30)
RETURNS void SECURITY DEFINER SET search_path = simulation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_tenant IS NULL OR p_domain IS NULL THEN RAISE EXCEPTION 'constraint gate capability requires a tenant and a domain' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(p_reason) < 3 THEN RAISE EXCEPTION 'constraint gate capability requires a reason' USING ERRCODE = '42501'; END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 60 THEN RAISE EXCEPTION 'constraint gate capability ttl out of bounds' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('eye.ctx3', ctx.build(
    NULL, NULL, 'DOMAIN', p_tenant, p_domain, 'machine', 'simulation.constraint_gate', 0,
    'schedule', 'constraint_gate', 'simulation.constraint.gate', '*',
    NULL, NULL, NULL, p_ttl_seconds), true);
  PERFORM set_config('eye.ctx_reason', p_reason, true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.issue_constraint_gate_capability(uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.issue_constraint_gate_capability(uuid, uuid, text, int) TO eye_commit;

-- ─── D.3 the check record ───────────────────────────────────────────────────────
-- Refusal family `plan check rejected (<class>): …`. Two contexts, nothing else: a person's plan check (simulation.plan.check; the
-- actor is the acting principal) or the gate's machine capability (the actor is NULL). Every pin names a declared version of this domain
-- with its digest — a verdict cannot claim a set version it did not run against.
CREATE OR REPLACE FUNCTION simulation.record_plan_check(
  p_check_id uuid, p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject_ref text, p_subject jsonb, p_sets jsonb,
  p_outcome text, p_violations jsonb, p_reason text, p_budget_ms int, p_elapsed_ms int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_via text; v_at timestamptz := clock_timestamp(); v_pin jsonb; v_digest text;
BEGIN
  IF public.eye_ctx_mode() = 'schedule' THEN
    PERFORM ctx.assert_capability('schedule', 'constraint_gate', 'simulation.constraint.gate');
    IF p_actor IS NOT NULL THEN RAISE EXCEPTION 'plan check rejected (actor): the gate records no principal' USING ERRCODE = '42501'; END IF;
    v_via := 'gate';
  ELSE
    PERFORM observation.assert_authority(ARRAY['simulation.plan.check']);
    IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan check rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
    IF p_subject_kind <> 'plan' THEN RAISE EXCEPTION 'plan check rejected (subject): the plan check route checks plans; a run''s inputs and outputs are checked by the gate' USING ERRCODE = '22023'; END IF;
    v_via := 'route';
  END IF;
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_subject_kind IS NULL OR p_subject_kind NOT IN ('plan', 'run_input', 'run_output') THEN RAISE EXCEPTION 'plan check rejected (subject): a subject is a plan, a run''s inputs or a run''s outputs' USING ERRCODE = '22023'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('satisfied', 'violated', 'indeterminate') THEN RAISE EXCEPTION 'plan check rejected (outcome): satisfied, violated or indeterminate' USING ERRCODE = '22023'; END IF;
  IF p_sets IS NULL OR jsonb_typeof(p_sets) <> 'array' THEN RAISE EXCEPTION 'plan check rejected (pins): the set versions checked against are a list' USING ERRCODE = '22023'; END IF;
  IF p_outcome = 'satisfied' AND jsonb_array_length(p_sets) = 0 AND p_subject ? 'set_keys' THEN
    RAISE EXCEPTION 'plan check rejected (pins): named sets that were not checked do not satisfy a subject' USING ERRCODE = '22023';
  END IF;
  FOR v_pin IN SELECT * FROM jsonb_array_elements(p_sets) LOOP
    SELECT v.digest INTO v_digest FROM simulation.constraint_set_versions v JOIN simulation.constraint_sets s ON s.set_id = v.set_id
     WHERE v.set_id = (v_pin ->> 'set_id')::uuid AND v.version = (v_pin ->> 'version')::int AND s.set_key = v_pin ->> 'set_key'
       AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
    IF v_digest IS NULL THEN RAISE EXCEPTION 'plan check rejected (unknown_pin): set % version % is not declared in this domain', v_pin ->> 'set_key', v_pin ->> 'version' USING ERRCODE = '23503'; END IF;
    IF v_digest <> v_pin ->> 'digest' THEN RAISE EXCEPTION 'plan check rejected (stale_pin): set % version % has digest %, not %', v_pin ->> 'set_key', v_pin ->> 'version', v_digest, v_pin ->> 'digest' USING ERRCODE = '22023'; END IF;
  END LOOP;
  INSERT INTO simulation.plan_checks (check_id, scope, tenant_id, domain_id, subject_kind, subject_ref, subject, subject_digest, sets, outcome, violations, indeterminate_reason,
                                      budget_ms, elapsed_ms, checked_via, checked_by, checked_at, correlation_id)
  VALUES (p_check_id, 'DOMAIN', p_tenant, p_domain, p_subject_kind, p_subject_ref, p_subject, encode(sha256(convert_to(p_subject::text, 'UTF8')), 'hex'), p_sets, p_outcome,
          coalesce(p_violations, '[]'::jsonb), CASE WHEN p_outcome = 'indeterminate' THEN coalesce(p_reason, 'no reason given') END,
          greatest(coalesce(p_budget_ms, 0), 0), greatest(coalesce(p_elapsed_ms, 0), 0), v_via, p_actor, v_at, p_correlation);
  RETURN jsonb_build_object('check_id', p_check_id, 'subject_kind', p_subject_kind, 'subject_ref', p_subject_ref, 'outcome', p_outcome, 'sets', p_sets,
                            'violations', coalesce(p_violations, '[]'::jsonb), 'indeterminate_reason', CASE WHEN p_outcome = 'indeterminate' THEN coalesce(p_reason, 'no reason given') END,
                            'checked_via', v_via, 'checked_by', p_actor, 'checked_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.record_plan_check(uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text,int,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.record_plan_check(uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text,int,int,uuid,uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §C THE METHOD FABRIC AND THE GENERALISED RUNTIME (part b29/methods) ─────────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════════════════════
-- §C THE METHOD FABRIC AND THE GENERALISED RUNTIME (part `methods`; F-P5-05 clauses 1, 2, 4) ─────────────────────────────
-- ═════════════════════════════════════════════════════════════════════════════════════
-- 0092 §C (B29 part `methods`) — CP-6 B29 (2026-09-29). Part-local file: the integrator combines it into 0092 as §C.
--
--   §C.1 THE METHOD REGISTRY ROWS — the six families' behaviour models (discrete-event, system-dynamics, agent-based, optimisation,
--        war-gaming, counterfactual), each run by the out-of-process worker (`adapter` method-worker) under a CONTAINMENT policy
--        {isolated, timeout_ms, max_old_space_mb, quarantine_after} and pinned to its implementation digest (the sha256 of
--        apps/api/src/twin/methods/<family>.ts, recomputed by the unit control). supply-flow@1's row is UNTOUCHED (the §0 defaults
--        give it family `flow`, adapter `in-process`, containment {"isolated": false}).
--   §C.2 THE BINDINGS — twin.twin_method_bindings: a twin's owner binds a method to the twin (simulation.method.bind) or unbinds it
--        (simulation.method.unbind); a binding is refused when the method's family is not among the twin's approved uses
--        (twin.use_approved — §A's; a guarded stub stands in when §A is absent). The twin's own behaviour_model_ref stays its
--        IMPLICIT binding.
--   §C.3 CONTAINMENT — simulation.adapter_health (per domain and model: consecutive faults, healthy | quarantined, the last fault),
--        its ledger simulation.adapter_events, the probes (simulation.adapter_probes) and the constraint verdicts recorded on a run
--        (simulation.run_constraint_checks, §D's ConstraintGate at opening and completion).
--   §C.4 THE MODEL-AWARE INPUT RULES — twin.unusable_inputs / twin.required_citations / twin.unavailable_inputs / twin.envelope_check
--        with the method named (p_model_ref): an explicitly bound method's REQUIRED INPUTS and ENVELOPE; the old signatures unchanged.
--   §C.5 THE PORTS — bind, unbind, the fault, the success, the probe, the reinstatement, the constraint verdict.
--   §C.6 simulation.open_run — the ONLY redefinition of it in B29: 0086 §M5's live body copied WHOLE with the binding, the approved
--        use, the quarantine and the model-aware input and envelope rules (every existing refusal kept, word for word).
--
-- The adapters are the product's own in-process implementations run in a child process — a real external solver or simulator is not
-- integrated here and closes nothing that requires one.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §C.1 THE METHOD REGISTRY ROWS
-- ─────────────────────────────────────────────────────────────────────────────────────
INSERT INTO twin.behaviour_models (method_ref, name, version, required_inputs, parameter_schema, operating_envelope, validation_notes, implementation_digest, family, adapter, containment) VALUES
  ('discrete-event@1', 'Discrete-event production line: stations with cycle times, finite buffers, a component consumed per unit started, daily inbound deliveries, a supply shortage window; daily throughput, backlog, starvation, line stops and buffer levels', 1,
   ARRAY['line.station', 'line.buffer', 'line.minutes_per_day', 'bom.per_unit', 'inventory.on_hand', 'inbound.daily', 'demand.daily'],
   '{"component": {"type": "string"}, "start_date": {"type": "string", "format": "date"}, "shortage": {"start_day": "integer >= 0", "days": "integer >= 1", "fraction": "0..1"}, "stochastic": {"mode": ["deterministic", "seeded"], "rng": "xoshiro128**@1", "draws": "cycle-time variation per station"}}'::jsonb,
   '{"horizon_days": [1, 365], "line.minutes_per_day": [60, 1440], "notes": "working time only (a day is line.minutes_per_day minutes); no breakdowns, changeovers or scrap; one component constrains the first station"}'::jsonb,
   'CP-6 B29 §C (0092). Validation status: unvalidated (synthetic grounding) — no claim of accuracy against a real line.',
   '14006316c0c3c54269495dd6fcd8782d100b4bee50993d71202a8da306be3327', 'discrete-event', 'method-worker', '{"isolated": true, "timeout_ms": 20000, "max_old_space_mb": 256, "quarantine_after": 3}'::jsonb),
  ('system-dynamics@1', 'System dynamics: order backlog and production capacity as stocks, Euler-integrated; capacity adjusts toward the backlog''s need with a first-order delay; demand steps and capacity losses', 1,
   ARRAY['sd.capacity', 'sd.adjust_days', 'sd.target_delivery_days', 'demand.daily'],
   '{"start_date": {"type": "string", "format": "date"}, "dt": [1, 0.5, 0.25, 0.125, 0.0625], "demand_step": {"day": "integer >= 0", "factor": "0..10"}, "capacity_loss": {"start_day": "integer >= 0", "days": "integer >= 1", "fraction": "0..1"}}'::jsonb,
   '{"horizon_days": [1, 365], "sd.adjust_days": [1, 180], "notes": "two stocks; shipments bounded by one day of backlog; deterministic"}'::jsonb,
   'CP-6 B29 §C (0092). Validation status: unvalidated (synthetic grounding).',
   '637e325e3fea7d2d4d97777913a1a2af4c31125c012c85a52c9ccacece66e1a4', 'system-dynamics', 'method-worker', '{"isolated": true, "timeout_ms": 20000, "max_old_space_mb": 256, "quarantine_after": 3}'::jsonb),
  ('agent-based@1', 'Agent-based supply market: suppliers with daily capacity fill their buyers pro rata; a buyer below its fill threshold switches to the supplier with the most spare capacity; seeded yield noise and a supplier disruption', 1,
   ARRAY['supplier.capacity', 'buyer.demand'],
   '{"start_date": {"type": "string", "format": "date"}, "switch_threshold": "0..1", "noise": "0..0.5 (seeded)", "disruption": {"supplier": "a supplier id", "start_day": "integer >= 0", "days": "integer >= 1", "fraction": "0..1"}}'::jsonb,
   '{"horizon_days": [1, 365], "notes": "unmet demand is lost; one preferred supplier per buyer"}'::jsonb,
   'CP-6 B29 §C (0092). Validation status: unvalidated (synthetic grounding).',
   'b2ad3a2c45e114006efbb3501f5397417b3dc4e414abb231d9db8e5ece898cc1', 'agent-based', 'method-worker', '{"isolated": true, "timeout_ms": 20000, "max_old_space_mb": 256, "quarantine_after": 3}'::jsonb),
  ('optimisation@1', 'Optimisation: the daily allocation of a scarce component across production lines maximising weighted throughput (the bounded knapsack LP, solved greedily; the integer allocation floored and the LP bound reported)', 1,
   ARRAY['line.throughput_cap', 'line.bearings_per_unit', 'inventory.on_hand', 'inbound.daily'],
   '{"component": {"type": "string"}, "start_date": {"type": "string", "format": "date"}, "shortage": {"start_day": "integer >= 0", "days": "integer >= 1", "fraction": "0..1"}}'::jsonb,
   '{"horizon_days": [1, 365], "notes": "one scarce resource; leftover carried to the next day; deterministic"}'::jsonb,
   'CP-6 B29 §C (0092). Validation status: unvalidated (synthetic grounding).',
   '5426cac9bd2a1a4aef8ada341cba2548290f5d62f007331bc30555fb819b0697', 'optimisation', 'method-worker', '{"isolated": true, "timeout_ms": 20000, "max_old_space_mb": 256, "quarantine_after": 3}'::jsonb),
  ('war-gaming@1', 'War-gaming: an adversary''s moves (greedy or seeded random) against the plan''s responses, turn by turn; residual damage, the score and the verdict against a tolerance', 1,
   ARRAY['threat.impact', 'plan.response'],
   '{"turns": "1..50", "adversary": ["greedy", "random"], "tolerance": "number >= 0"}'::jsonb,
   '{"horizon_days": [1, 50], "notes": "the horizon is the number of turns; responses are finite uses, no replenishment"}'::jsonb,
   'CP-6 B29 §C (0092). Validation status: unvalidated (synthetic grounding).',
   '1d752244cde00598772b8149a273a9e2ed75beaa7d0a1a2880b6b41b79655c19', 'war-gaming', 'method-worker', '{"isolated": true, "timeout_ms": 20000, "max_old_space_mb": 256, "quarantine_after": 3}'::jsonb),
  ('counterfactual@1', 'Counterfactual: one structural supply-production-backlog model run as the control world and under a do-intervention on supply, capacity or demand, with shared exogenous noise; the difference reported', 1,
   ARRAY['inbound.daily', 'inventory.on_hand', 'bom.per_unit', 'demand.daily', 'line.capacity_daily'],
   '{"component": {"type": "string"}, "start_date": {"type": "string", "format": "date"}, "intervention": {"variable": ["supply", "capacity", "demand"], "value": "integer >= 0", "from_day": "integer >= 0", "to_day": "> from_day"}, "shortage": {"start_day": "integer >= 0", "days": "integer >= 1", "fraction": "0..1"}, "noise": "0..0.5 (seeded)"}'::jsonb,
   '{"horizon_days": [1, 365], "notes": "one step per day; the intervention replaces one structural equation"}'::jsonb,
   'CP-6 B29 §C (0092). Validation status: unvalidated (synthetic grounding).',
   'c6acab10c0858ef117eedb42cd4a2dd0833b72b13f4de4fa6020e3e53a6c6ea0', 'counterfactual', 'method-worker', '{"isolated": true, "timeout_ms": 20000, "max_old_space_mb": 256, "quarantine_after": 3}'::jsonb)
ON CONFLICT (method_ref) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §C.2 THE BINDINGS
-- ─────────────────────────────────────────────────────────────────────────────────────
/* §A's approved-use rule, CALLED here (the bind port and open_run). When §A has defined it (the combined 0092 runs §A first), this
   block does nothing; alone (this part's worktree) a stub stands in that approves every family. */
DO $$
BEGIN
  IF to_regprocedure('twin.use_approved(uuid,text)') IS NULL THEN
    -- B29 part A replaces this
    CREATE FUNCTION twin.use_approved(p_twin uuid, p_family text) RETURNS boolean
    STABLE SET search_path = twin, pg_catalog, pg_temp AS $f$ SELECT p_twin IS NOT NULL AND p_family IS NOT NULL $f$ LANGUAGE sql;
    COMMENT ON FUNCTION twin.use_approved(uuid,text) IS 'B29 part A replaces this: the stub of part C''s worktree approves every family';
    GRANT EXECUTE ON FUNCTION twin.use_approved(uuid,text) TO eye_app, eye_commit;
  END IF;
END $$;

CREATE TABLE twin.twin_method_bindings (
  binding_id         uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  twin_id            uuid NOT NULL REFERENCES twin.twins_current(twin_id),
  model_ref          text NOT NULL REFERENCES twin.behaviour_models(method_ref),
  /* the method's family AT BINDING (the registry row's; a model's family never changes — a new family is a new model reference) */
  family             text NOT NULL,
  state              text NOT NULL CHECK (state IN ('active', 'unbound')),
  reason             text,
  bound_by           uuid NOT NULL,
  bound_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  unbound_by         uuid,
  unbound_at         timestamptz,
  unbind_reason      text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT tmb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tmb_unbound_says_why CHECK (state <> 'unbound' OR (unbound_by IS NOT NULL AND unbound_at IS NOT NULL AND length(btrim(coalesce(unbind_reason, ''))) >= 8))
);
CREATE UNIQUE INDEX tmb_one_active ON twin.twin_method_bindings (twin_id, model_ref) WHERE state = 'active';
CREATE INDEX tmb_twin ON twin.twin_method_bindings (twin_id, state);
/* A binding is immutable but for its ONE transition, active → unbound (the history is also in twin_events: method.bound / method.unbound). */
CREATE OR REPLACE FUNCTION twin.method_binding_transition() RETURNS trigger
SET search_path = twin, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'method binding % is a record; it is unbound, never deleted', OLD.binding_id USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'active' OR NEW.state <> 'unbound'
     OR (to_jsonb(NEW) - ARRAY['state', 'unbound_by', 'unbound_at', 'unbind_reason']) <> (to_jsonb(OLD) - ARRAY['state', 'unbound_by', 'unbound_at', 'unbind_reason']) THEN
    RAISE EXCEPTION 'method binding % is %; its only change is active → unbound, once', OLD.binding_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tmb_transition BEFORE UPDATE OR DELETE ON twin.twin_method_bindings FOR EACH ROW EXECUTE FUNCTION twin.method_binding_transition();
REVOKE ALL ON twin.twin_method_bindings FROM PUBLIC;
ALTER TABLE twin.twin_method_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE twin.twin_method_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY twin_isolation ON twin.twin_method_bindings USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));  -- the 0032:634-639 idiom, verbatim
GRANT SELECT ON twin.twin_method_bindings TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §C.3 CONTAINMENT: health, its ledger, the probes; the constraint verdicts on a run
-- ─────────────────────────────────────────────────────────────────────────────────────
/* One row per (domain, method) once the method has run contained or been probed there: the fault streak and the state. Written only by
   the §C.5 ports (no UPDATE grant); every change is also an adapter_events row. Per DOMAIN, so one domain's faults never quarantine a
   method for another. */
CREATE TABLE simulation.adapter_health (
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  model_ref             text NOT NULL REFERENCES twin.behaviour_models(method_ref),
  state                 text NOT NULL DEFAULT 'healthy' CHECK (state IN ('healthy', 'quarantined')),
  consecutive_faults    int  NOT NULL DEFAULT 0 CHECK (consecutive_faults >= 0),
  total_faults          int  NOT NULL DEFAULT 0 CHECK (total_faults >= 0),
  /* {kind, message, run_id, probe_id, at} — the last fault, said */
  last_fault            jsonb,
  last_fault_at         timestamptz,
  /* the operator of the run whose fault was last (null for a probe's): the reinstatement's separation of duties */
  last_fault_operator   uuid,
  quarantined_at        timestamptz,
  /* the run whose fault crossed the threshold (null when a probe's did) */
  quarantined_by_run    uuid,
  last_probe_id         uuid,
  last_probe_passed_at  timestamptz,
  reinstated_at         timestamptz,
  reinstated_by         uuid,
  reinstated_probe_id   uuid,
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, domain_id, model_ref),
  CONSTRAINT sah_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sah_quarantine_says_when CHECK (state <> 'quarantined' OR (quarantined_at IS NOT NULL AND last_fault IS NOT NULL))
);
CREATE TABLE simulation.adapter_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  model_ref          text NOT NULL,
  event              text NOT NULL CHECK (event IN ('faulted', 'quarantined', 'probed', 'reinstated')),
  run_id             uuid,
  probe_id           uuid,
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT sae_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sae_model ON simulation.adapter_events (tenant_id, domain_id, model_ref, occurred_at);
CREATE TRIGGER sae_append_only BEFORE UPDATE OR DELETE ON simulation.adapter_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
/* A PROBE: the method run on its fixed probe input (the adapter's own, builtin.ts), contained, by a method steward — the evidence a
   reinstatement rests on. */
CREATE TABLE simulation.adapter_probes (
  probe_id               uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  model_ref              text NOT NULL REFERENCES twin.behaviour_models(method_ref),
  implementation_digest  text NOT NULL CHECK (implementation_digest ~ '^[0-9a-f]{64}$'),
  passed                 boolean NOT NULL,
  outputs_digest         text CHECK (outputs_digest IS NULL OR outputs_digest ~ '^[0-9a-f]{64}$'),
  fault_kind             text CHECK (fault_kind IS NULL OR fault_kind IN ('timeout', 'crash', 'memory', 'invalid_output')),
  fault                  text,
  elapsed_ms             int,
  pid                    int,
  probed_by              uuid NOT NULL,
  probed_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT sap_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sap_outcome_said CHECK ((passed AND outputs_digest IS NOT NULL AND fault_kind IS NULL) OR (NOT passed AND fault_kind IS NOT NULL AND fault IS NOT NULL))
);
CREATE INDEX sap_model ON simulation.adapter_probes (tenant_id, domain_id, model_ref, probed_at DESC);
CREATE TRIGGER sap_append_only BEFORE UPDATE OR DELETE ON simulation.adapter_probes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
/* §D's verdict ON THE RUN: the ConstraintGate at opening (a violated verdict refuses the run before it exists, so an opening row is
   satisfied or indeterminate) and at completion (over the run's outputs). Every run's verdicts are here, supply-flow@1's included; a
   method-fabric run also announces them in run_events (constraint.checked / constraint.refused) — supply-flow@1's event ledger stays
   the vocabulary B18 pinned. INDETERMINATE is recorded as such and is never read as satisfied. */
CREATE TABLE simulation.run_constraint_checks (
  check_id              uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  run_id                uuid NOT NULL REFERENCES simulation.runs_current(run_id),
  stage                 text NOT NULL CHECK (stage IN ('opening', 'completion')),
  outcome               text NOT NULL CHECK (outcome IN ('satisfied', 'violated', 'indeterminate')),
  set_id                text,
  set_version           int,
  violations            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(violations) = 'array'),
  indeterminate_reason  text,
  checked_by            uuid NOT NULL,
  checked_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT rcc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT rcc_opening_not_violated CHECK (stage <> 'opening' OR outcome <> 'violated'),
  CONSTRAINT rcc_indeterminate_says_why CHECK (outcome <> 'indeterminate' OR indeterminate_reason IS NOT NULL),
  CONSTRAINT rcc_violated_names CHECK (outcome <> 'violated' OR jsonb_array_length(violations) > 0)
);
CREATE UNIQUE INDEX rcc_one_per_stage ON simulation.run_constraint_checks (run_id, stage);
CREATE TRIGGER rcc_append_only BEFORE UPDATE OR DELETE ON simulation.run_constraint_checks FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
-- RLS and grants: the 0033:383-388 loop idiom (policy simulation_isolation; GRANT SELECT TO eye_app, eye_commit); the ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['adapter_health', 'adapter_events', 'adapter_probes', 'run_constraint_checks'] LOOP
    EXECUTE format('REVOKE ALL ON simulation.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE simulation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE simulation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY simulation_isolation ON simulation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON simulation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §C.4 THE MODEL-AWARE INPUT RULES (the old three-argument forms are unchanged and stay the implicit binding's)
-- ─────────────────────────────────────────────────────────────────────────────────────
-- The required prefixes of a run of method p_model_ref on the twin: for the twin's OWN model, the kind's material keys and the model's
-- required inputs (the 0035/0036 rule, identical); for any other method, the METHOD's required inputs only — what it declares it reads
-- (the kind's material keys are the twin's completeness, already required of an admitted, complete version). The selection of the
-- component's elements is 0035's, verbatim.
CREATE OR REPLACE FUNCTION twin.method_required_prefixes(p_twin_id uuid, p_model_ref text) RETURNS text[]
STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[]) FROM (
    SELECT unnest(CASE WHEN t.behaviour_model_ref = p_model_ref THEN k.material_keys || m.required_inputs ELSE m.required_inputs END) AS x
      FROM twin.twins_current t JOIN twin.twin_kind_schemas k ON k.kind = t.kind JOIN twin.behaviour_models m ON m.method_ref = p_model_ref
     WHERE t.twin_id = p_twin_id) r;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.method_required_prefixes(uuid,text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION twin.unusable_inputs(p_twin_id uuid, p_version int, p_component text, p_model_ref text) RETURNS jsonb
STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH req AS (SELECT DISTINCT unnest(twin.method_required_prefixes(p_twin_id, p_model_ref)) AS prefix),
  comps AS (
    SELECT DISTINCT split_part(e.key, ':', 2) AS c FROM twin.state_elements e
     WHERE e.twin_id = p_twin_id AND e.version = p_version AND e.key LIKE 'inventory.on_hand:%'),
  cand AS (
    SELECT r.prefix, e.key, e.health
      FROM req r
      LEFT JOIN twin.state_elements e
        ON e.twin_id = p_twin_id AND e.version = p_version AND split_part(e.key, ':', 1) = r.prefix
       AND (e.key = r.prefix OR split_part(e.key, ':', 2) = p_component
            OR (r.prefix <> 'shipment' AND split_part(e.key, ':', 2) <> '' AND NOT EXISTS (SELECT 1 FROM comps WHERE comps.c = split_part(e.key, ':', 2)))
            OR (r.prefix = 'shipment' AND coalesce(e.value ->> 'component', p_component) = p_component))),
  verdict AS (
    SELECT prefix,
           CASE WHEN count(key) = 0 THEN 'missing'
                WHEN bool_or(health = 'complete') THEN NULL
                ELSE (array_agg(health ORDER BY CASE health WHEN 'unreadable' THEN 0 WHEN 'stale' THEN 1 ELSE 2 END))[1] END AS problem,
           coalesce(jsonb_agg(jsonb_build_object('key', key, 'health', health)) FILTER (WHERE key IS NOT NULL), '[]'::jsonb) AS candidates
      FROM cand GROUP BY prefix)
  SELECT coalesce(jsonb_agg(jsonb_build_object('input', prefix, 'problem', problem, 'candidates', candidates) ORDER BY prefix), '[]'::jsonb)
    FROM verdict WHERE problem IS NOT NULL;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.unusable_inputs(uuid,int,text,text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION twin.required_citations(p_twin_id uuid, p_version int, p_component text, p_model_ref text) RETURNS jsonb
STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH req AS (SELECT DISTINCT unnest(twin.method_required_prefixes(p_twin_id, p_model_ref)) AS prefix),
  comps AS (
    SELECT DISTINCT split_part(e.key, ':', 2) AS c FROM twin.state_elements e
     WHERE e.twin_id = p_twin_id AND e.version = p_version AND e.key LIKE 'inventory.on_hand:%'),
  used AS (
    SELECT e.key, e.citations
      FROM req r
      JOIN twin.state_elements e
        ON e.twin_id = p_twin_id AND e.version = p_version AND split_part(e.key, ':', 1) = r.prefix
       AND (e.key = r.prefix OR split_part(e.key, ':', 2) = p_component
            OR (r.prefix <> 'shipment' AND split_part(e.key, ':', 2) <> '' AND NOT EXISTS (SELECT 1 FROM comps WHERE comps.c = split_part(e.key, ':', 2)))
            OR (r.prefix = 'shipment' AND coalesce(e.value ->> 'component', p_component) = p_component)))
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('key', u.key, 'kind', c ->> 'kind', 'id', c ->> 'id',
                                                        'version', (c ->> 'version')::int, 'digest', c ->> 'digest')), '[]'::jsonb)
    FROM used u, LATERAL jsonb_array_elements(u.citations) c
   WHERE (c ->> 'kind') <> 'entity';
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.required_citations(uuid,int,text,text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION twin.unavailable_inputs(p_twin_id uuid, p_version int, p_component text, p_model_ref text) RETURNS jsonb
STABLE SET search_path = twin, objects, pg_catalog, pg_temp AS $$
  WITH cited AS (SELECT value AS c FROM jsonb_array_elements(twin.required_citations(p_twin_id, p_version, p_component, p_model_ref))),
  latest AS (
    SELECT cited.c AS c, (SELECT o.lifecycle_state FROM objects.canonical_objects o
                           WHERE o.object_id = (cited.c ->> 'id')::uuid
                           ORDER BY o.object_version DESC LIMIT 1) AS state
      FROM cited)
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', l.c ->> 'key', 'kind', l.c ->> 'kind', 'id', l.c ->> 'id',
                                               'version', l.c ->> 'version', 'problem', coalesce(l.state, 'not available to this reader'))
                            ORDER BY l.c ->> 'key'), '[]'::jsonb)
    FROM latest l WHERE l.state IS NULL OR l.state IN ('withdrawn', 'retired');
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION twin.unavailable_inputs(uuid,int,text,text) TO eye_app, eye_commit;

-- 0081 §3's envelope rule with the METHOD named: the method's declared ranges, the same matching (a run parameter, else the version's
-- first numeric element named K, K:<suffix>, shock.K or shock.K:<suffix>). The three-argument form stays the twin's own model's.
CREATE OR REPLACE FUNCTION twin.envelope_check(p_twin_id uuid, p_version int, p_extra jsonb, p_model_ref text) RETURNS jsonb
SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_env jsonb; v_model text; k text; rng jsonb; lo numeric; hi numeric; val numeric; src text; ek text; ev jsonb;
        keys jsonb := '{}'::jsonb; n_out int := 0; n_in int := 0; verdict text;
BEGIN
  SELECT bm.operating_envelope, bm.method_ref INTO v_env, v_model FROM twin.behaviour_models bm WHERE bm.method_ref = p_model_ref;
  IF v_env IS NULL THEN RETURN jsonb_build_object('state', 'unchecked', 'model', p_model_ref, 'keys', keys, 'note', 'the behaviour model declares no operating envelope'); END IF;
  FOR k, rng IN SELECT e.key, e.value FROM jsonb_each(v_env) e WHERE jsonb_typeof(e.value) = 'array' AND jsonb_array_length(e.value) = 2 ORDER BY e.key LOOP
    lo := (rng ->> 0)::numeric; hi := (rng ->> 1)::numeric; val := NULL; src := NULL;
    IF jsonb_typeof(coalesce(p_extra, '{}'::jsonb) -> k) = 'number' THEN
      val := (p_extra ->> k)::numeric; src := 'run';
    ELSE
      SELECT e.key, e.value INTO ek, ev FROM twin.state_elements e
       WHERE e.twin_id = p_twin_id AND e.version = p_version AND jsonb_typeof(e.value) = 'number'
         AND (e.key = k OR left(e.key, length(k) + 1) = k || ':' OR e.key = 'shock.' || k OR left(e.key, length(k) + 7) = 'shock.' || k || ':')
       ORDER BY e.key LIMIT 1;
      IF FOUND THEN val := (ev::text)::numeric; src := ek; END IF;
    END IF;
    verdict := CASE WHEN val IS NULL THEN 'unchecked' WHEN val < lo OR val > hi THEN 'outside' ELSE 'inside' END;
    IF verdict = 'outside' THEN n_out := n_out + 1; ELSIF verdict = 'inside' THEN n_in := n_in + 1; END IF;
    keys := keys || jsonb_build_object(k, jsonb_build_object('range', rng, 'value', val, 'source', src, 'verdict', verdict));
  END LOOP;
  RETURN jsonb_build_object('state', CASE WHEN n_out > 0 THEN 'outside' WHEN n_in > 0 THEN 'inside' ELSE 'unchecked' END, 'model', v_model, 'keys', keys,
                            'rule', 'a key matches the run parameter of the same name, else the version''s first numeric element named K, K:<suffix>, shock.K or shock.K:<suffix>; a key with no numeric value is unchecked');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.envelope_check(uuid,int,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.envelope_check(uuid,int,jsonb,text) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §C.5 THE PORTS
-- ─────────────────────────────────────────────────────────────────────────────────────
-- BIND (simulation.method.bind): the twin's OWNER binds a method with a pinned implementation to the twin; refused when the twin is
-- not in the domain, the actor is not its owner, the method is the twin's own model (bound implicitly) or bound already, or its
-- family is not among the twin's approved uses (§A's twin.use_approved).
CREATE OR REPLACE FUNCTION simulation.bind_method(p_binding_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_model_ref text, p_reason text,
                                                  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; m twin.behaviour_models%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.method.bind']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO t FROM twin.twins_current WHERE twin_id = p_twin_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'method binding rejected: no twin % in this domain', p_twin_id USING ERRCODE = '23503'; END IF;
  IF t.owner_principal_id <> p_actor THEN
    RAISE EXCEPTION 'method binding rejected (not_owner): the methods of twin % are bound by its owner; the acting principal is not', p_twin_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'method binding rejected: no behaviour model % is registered', p_model_ref USING ERRCODE = '23503'; END IF;
  IF m.implementation_digest IS NULL THEN RAISE EXCEPTION 'method binding rejected: behaviour model % has no pinned implementation', p_model_ref USING ERRCODE = '22023'; END IF;
  IF p_model_ref = t.behaviour_model_ref THEN
    RAISE EXCEPTION 'method binding rejected (already_bound): % is the behaviour model of twin % (bound implicitly)', p_model_ref, p_twin_id USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM twin.twin_method_bindings b WHERE b.twin_id = p_twin_id AND b.model_ref = p_model_ref AND b.state = 'active') THEN
    RAISE EXCEPTION 'method binding rejected (already_bound): % is already bound to twin %', p_model_ref, p_twin_id USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(twin.use_approved(p_twin_id, m.family), false) THEN
    RAISE EXCEPTION 'method binding rejected (method_family): the % family (%) is not among the approved uses of twin %', m.family, p_model_ref, p_twin_id USING ERRCODE = '22023';
  END IF;
  INSERT INTO twin.twin_method_bindings (binding_id, scope, tenant_id, domain_id, twin_id, model_ref, family, state, reason, bound_by, bound_at, correlation_id)
  VALUES (p_binding_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_model_ref, m.family, 'active', nullif(btrim(coalesce(p_reason, '')), ''), p_actor, v_at, p_correlation);
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'method.bound', p_actor,
          jsonb_build_object('binding_id', p_binding_id, 'model_ref', p_model_ref, 'family', m.family, 'implementation_digest', m.implementation_digest, 'reason', p_reason), p_correlation);
  RETURN jsonb_build_object('binding_id', p_binding_id, 'twin_id', p_twin_id, 'model_ref', p_model_ref, 'family', m.family, 'state', 'active',
                            'implementation_digest', m.implementation_digest, 'bound_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.bind_method(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.bind_method(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- UNBIND (simulation.method.unbind): the owner ends an active binding, with a reason; the runs already opened on it stand.
CREATE OR REPLACE FUNCTION simulation.unbind_method(p_tenant uuid, p_domain uuid, p_twin_id uuid, p_model_ref text, p_reason text,
                                                    p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; b twin.twin_method_bindings%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.method.unbind']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO t FROM twin.twins_current WHERE twin_id = p_twin_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'method binding rejected: no twin % in this domain', p_twin_id USING ERRCODE = '23503'; END IF;
  IF t.owner_principal_id <> p_actor THEN
    RAISE EXCEPTION 'method binding rejected (not_owner): the methods of twin % are unbound by its owner; the acting principal is not', p_twin_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM twin.twin_method_bindings x WHERE x.twin_id = p_twin_id AND x.model_ref = p_model_ref AND x.state = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'method binding rejected: % is not bound to twin % (no active binding)', p_model_ref, p_twin_id USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'method binding rejected: an unbinding says why (a reason of 8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE twin.twin_method_bindings SET state = 'unbound', unbound_by = p_actor, unbound_at = v_at, unbind_reason = btrim(p_reason) WHERE binding_id = b.binding_id;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'method.unbound', p_actor,
          jsonb_build_object('binding_id', b.binding_id, 'model_ref', p_model_ref, 'family', b.family, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('binding_id', b.binding_id, 'twin_id', p_twin_id, 'model_ref', p_model_ref, 'state', 'unbound', 'unbound_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.unbind_method(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.unbind_method(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- THE FAULT of a contained adapter — a timeout, a crash, an exhausted heap or an invalid output — recorded in the write that fails the
-- run (simulation.run.complete), records a failed reproduction (simulation.reproduce) or records a failed probe
-- (simulation.adapter.probe): the streak grows; at the registry row's `quarantine_after` consecutive faults the adapter is QUARANTINED
-- in this domain (adapter.quarantined) and open_run refuses every new run of it.
CREATE OR REPLACE FUNCTION simulation.record_adapter_fault(p_tenant uuid, p_domain uuid, p_model_ref text, p_run_id uuid, p_probe_id uuid, p_kind text, p_message text,
                                                           p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.behaviour_models%ROWTYPE; h simulation.adapter_health%ROWTYPE; v_after int; v_operator uuid; v_at timestamptz := clock_timestamp(); v_quarantined boolean := false; v_fault jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run.complete', 'simulation.reproduce', 'simulation.adapter.probe']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_kind IS NULL OR p_kind NOT IN ('timeout', 'crash', 'memory', 'invalid_output') THEN
    RAISE EXCEPTION 'adapter fault rejected: a fault is a timeout, a crash, memory or an invalid output (not %)', p_kind USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_message, ''))) = 0 THEN RAISE EXCEPTION 'adapter fault rejected: a fault says what happened' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'adapter fault rejected: no behaviour model % is registered', p_model_ref USING ERRCODE = '23503'; END IF;
  IF (p_run_id IS NULL) = (p_probe_id IS NULL) THEN RAISE EXCEPTION 'adapter fault rejected: a fault belongs to one run or one probe' USING ERRCODE = '22023'; END IF;
  IF p_run_id IS NOT NULL THEN
    SELECT r.operator_principal_id INTO v_operator FROM simulation.runs_current r WHERE r.run_id = p_run_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.model_ref = p_model_ref;
    IF NOT FOUND THEN RAISE EXCEPTION 'adapter fault rejected: run % is not a run of % in this domain', p_run_id, p_model_ref USING ERRCODE = '23503'; END IF;
  END IF;
  v_after := greatest(1, least(100, coalesce((m.containment ->> 'quarantine_after')::int, 3)));
  v_fault := jsonb_build_object('kind', p_kind, 'message', left(p_message, 500), 'run_id', p_run_id, 'probe_id', p_probe_id, 'at', v_at);
  INSERT INTO simulation.adapter_health (scope, tenant_id, domain_id, model_ref) VALUES ('DOMAIN', p_tenant, p_domain, p_model_ref) ON CONFLICT DO NOTHING;
  SELECT * INTO h FROM simulation.adapter_health WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref FOR UPDATE;
  h.consecutive_faults := h.consecutive_faults + 1;
  IF h.state = 'healthy' AND h.consecutive_faults >= v_after THEN v_quarantined := true; END IF;
  UPDATE simulation.adapter_health
     SET consecutive_faults = h.consecutive_faults, total_faults = total_faults + 1, last_fault = v_fault, last_fault_at = v_at, last_fault_operator = v_operator,
         state = CASE WHEN v_quarantined THEN 'quarantined' ELSE state END,
         quarantined_at = CASE WHEN v_quarantined THEN v_at ELSE quarantined_at END,
         quarantined_by_run = CASE WHEN v_quarantined THEN p_run_id ELSE quarantined_by_run END, updated_at = v_at
   WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref;
  INSERT INTO simulation.adapter_events (event_id, scope, tenant_id, domain_id, model_ref, event, run_id, probe_id, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_model_ref, 'faulted', p_run_id, p_probe_id, p_actor,
          v_fault || jsonb_build_object('consecutive_faults', h.consecutive_faults, 'quarantine_after', v_after), p_correlation);
  IF p_run_id IS NOT NULL THEN
    INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'adapter.faulted', p_actor,
            v_fault || jsonb_build_object('model_ref', p_model_ref, 'consecutive_faults', h.consecutive_faults, 'quarantine_after', v_after), p_correlation);
  END IF;
  IF v_quarantined THEN
    INSERT INTO simulation.adapter_events (event_id, scope, tenant_id, domain_id, model_ref, event, run_id, probe_id, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_model_ref, 'quarantined', p_run_id, p_probe_id, p_actor,
            jsonb_build_object('consecutive_faults', h.consecutive_faults, 'quarantine_after', v_after, 'last_fault', v_fault), p_correlation);
    IF p_run_id IS NOT NULL THEN
      INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_run_id, 'adapter.quarantined', p_actor,
              jsonb_build_object('model_ref', p_model_ref, 'consecutive_faults', h.consecutive_faults, 'quarantine_after', v_after), p_correlation);
    END IF;
  END IF;
  RETURN jsonb_build_object('model_ref', p_model_ref, 'state', CASE WHEN v_quarantined OR h.state = 'quarantined' THEN 'quarantined' ELSE 'healthy' END,
                            'consecutive_faults', h.consecutive_faults, 'quarantine_after', v_after, 'quarantined', v_quarantined, 'fault', v_fault);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.record_adapter_fault(uuid,uuid,text,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.record_adapter_fault(uuid,uuid,text,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- A contained run that COMPLETED ends the fault streak of a healthy adapter (consecutive means consecutive); a quarantined one stays so.
CREATE OR REPLACE FUNCTION simulation.record_adapter_success(p_tenant uuid, p_domain uuid, p_model_ref text) RETURNS void
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run.complete', 'simulation.reproduce']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE simulation.adapter_health SET consecutive_faults = 0, updated_at = clock_timestamp()
   WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref AND state = 'healthy' AND consecutive_faults > 0;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.record_adapter_success(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.record_adapter_success(uuid,uuid,text) TO eye_commit;

-- THE PROBE (simulation.adapter.probe): the method run, contained, on its FIXED probe input by a method steward; the answer recorded as
-- evidence. A failing probe is a fault like any other (the streak grows; a healthy adapter may be quarantined by it); a passing one
-- ends a healthy adapter's streak and is what a reinstatement rests on. Refused for a method that is not contained (nothing to probe)
-- or when the implementation probed is not the pinned one.
CREATE OR REPLACE FUNCTION simulation.record_probe(p_probe_id uuid, p_tenant uuid, p_domain uuid, p_model_ref text, p_implementation_digest text, p_passed boolean,
                                                   p_outputs_digest text, p_fault_kind text, p_fault text, p_elapsed_ms int, p_pid int,
                                                   p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.behaviour_models%ROWTYPE; v_at timestamptz := clock_timestamp(); v_fault jsonb := NULL; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.adapter.probe']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO m FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'adapter probe rejected: no behaviour model % is registered', p_model_ref USING ERRCODE = '23503'; END IF;
  IF coalesce((m.containment ->> 'isolated')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'adapter probe rejected: % is not a contained method (containment.isolated is false); nothing is probed', p_model_ref USING ERRCODE = '22023';
  END IF;
  IF m.implementation_digest IS DISTINCT FROM p_implementation_digest THEN
    RAISE EXCEPTION 'adapter probe rejected: the implementation probed (%) is not the pinned implementation of % (%)', p_implementation_digest, p_model_ref, m.implementation_digest USING ERRCODE = '22023';
  END IF;
  INSERT INTO simulation.adapter_probes (probe_id, scope, tenant_id, domain_id, model_ref, implementation_digest, passed, outputs_digest, fault_kind, fault, elapsed_ms, pid, probed_by, probed_at, correlation_id)
  VALUES (p_probe_id, 'DOMAIN', p_tenant, p_domain, p_model_ref, p_implementation_digest, p_passed, CASE WHEN p_passed THEN p_outputs_digest END,
          CASE WHEN NOT p_passed THEN p_fault_kind END, CASE WHEN NOT p_passed THEN left(p_fault, 500) END, p_elapsed_ms, p_pid, p_actor, v_at, p_correlation);
  INSERT INTO simulation.adapter_health (scope, tenant_id, domain_id, model_ref) VALUES ('DOMAIN', p_tenant, p_domain, p_model_ref) ON CONFLICT DO NOTHING;
  INSERT INTO simulation.adapter_events (event_id, scope, tenant_id, domain_id, model_ref, event, run_id, probe_id, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_model_ref, 'probed', NULL, p_probe_id, p_actor,
          jsonb_build_object('passed', p_passed, 'outputs_digest', p_outputs_digest, 'fault_kind', p_fault_kind, 'elapsed_ms', p_elapsed_ms), p_correlation);
  IF p_passed THEN
    UPDATE simulation.adapter_health SET last_probe_id = p_probe_id, last_probe_passed_at = v_at,
           consecutive_faults = CASE WHEN state = 'healthy' THEN 0 ELSE consecutive_faults END, updated_at = v_at
     WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref;
  ELSE
    v_fault := simulation.record_adapter_fault(p_tenant, p_domain, p_model_ref, NULL, p_probe_id, p_fault_kind, coalesce(p_fault, 'the probe failed'), p_actor, gen_random_uuid(), p_correlation);
    UPDATE simulation.adapter_health SET last_probe_id = p_probe_id, updated_at = v_at WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref;
  END IF;
  SELECT state INTO v_state FROM simulation.adapter_health WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref;
  RETURN jsonb_build_object('probe_id', p_probe_id, 'model_ref', p_model_ref, 'passed', p_passed, 'outputs_digest', p_outputs_digest, 'state', v_state, 'fault', v_fault, 'probed_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.record_probe(uuid,uuid,uuid,text,text,boolean,text,text,text,int,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.record_probe(uuid,uuid,uuid,text,text,boolean,text,text,text,int,int,uuid,uuid,uuid) TO eye_commit;

-- THE REINSTATEMENT (simulation.adapter.reinstate, human-gated, a method steward): a quarantined adapter becomes healthy again — refused
-- unless a probe of the PINNED implementation PASSED after the last fault, and refused to the operator of the run whose fault was last
-- (separation of duties: the steward who reinstates is never that run's operator).
CREATE OR REPLACE FUNCTION simulation.reinstate_adapter(p_tenant uuid, p_domain uuid, p_model_ref text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h simulation.adapter_health%ROWTYPE; pr simulation.adapter_probes%ROWTYPE; v_pinned text; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.adapter.reinstate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO h FROM simulation.adapter_health WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref FOR UPDATE;
  IF NOT FOUND OR h.state <> 'quarantined' THEN
    RAISE EXCEPTION 'adapter reinstatement rejected: the adapter of % is not quarantined in this domain (%)', p_model_ref, coalesce(h.state, 'never faulted') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'adapter reinstatement rejected: a reinstatement says why (a reason of 8+ characters)' USING ERRCODE = '22023'; END IF;
  IF h.last_fault_operator IS NOT NULL AND h.last_fault_operator = p_actor THEN
    RAISE EXCEPTION 'adapter reinstatement rejected (separation): the operator of the run whose fault was last may not reinstate its adapter' USING ERRCODE = '42501';
  END IF;
  SELECT implementation_digest INTO v_pinned FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  SELECT * INTO pr FROM simulation.adapter_probes p
   WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.model_ref = p_model_ref AND p.passed AND p.implementation_digest = v_pinned AND p.probed_at > h.last_fault_at
   ORDER BY p.probed_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'adapter reinstatement rejected (no_probe): no probe of % has passed since its last fault (%); probe it first (simulation.adapter.probe)', p_model_ref, h.last_fault_at USING ERRCODE = '22023';
  END IF;
  UPDATE simulation.adapter_health SET state = 'healthy', consecutive_faults = 0, reinstated_at = v_at, reinstated_by = p_actor, reinstated_probe_id = pr.probe_id, updated_at = v_at
   WHERE tenant_id = p_tenant AND domain_id = p_domain AND model_ref = p_model_ref;
  INSERT INTO simulation.adapter_events (event_id, scope, tenant_id, domain_id, model_ref, event, run_id, probe_id, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_model_ref, 'reinstated', h.quarantined_by_run, pr.probe_id, p_actor,
          jsonb_build_object('reason', btrim(p_reason), 'probe_id', pr.probe_id, 'probed_at', pr.probed_at, 'quarantined_at', h.quarantined_at, 'last_fault', h.last_fault), p_correlation);
  -- announced on the run whose fault quarantined the adapter (a probe's quarantine has no run: the adapter ledger alone carries it)
  IF h.quarantined_by_run IS NOT NULL THEN
    INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, h.quarantined_by_run, 'adapter.reinstated', p_actor,
            jsonb_build_object('model_ref', p_model_ref, 'probe_id', pr.probe_id, 'reason', btrim(p_reason)), p_correlation);
  END IF;
  RETURN jsonb_build_object('model_ref', p_model_ref, 'state', 'healthy', 'reinstated_at', v_at, 'probe_id', pr.probe_id, 'quarantined_at', h.quarantined_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.reinstate_adapter(uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.reinstate_adapter(uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- THE CONSTRAINT VERDICT ON THE RUN (§D's ConstraintGate, asked by the service BEFORE the write — the gate may record its own check
-- and never runs inside this transaction): at opening (in the opening write, after open_run) or at completion (in the completing
-- write). A violated verdict at opening refused the run before it existed and is never recorded on an opened one. `p_announce`
-- writes run_events constraint.checked / constraint.refused (a method-fabric run; supply-flow@1's ledger keeps B18's vocabulary).
CREATE OR REPLACE FUNCTION simulation.record_constraint_check(p_check_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_stage text, p_outcome text,
                                                              p_set_id text, p_set_version int, p_violations jsonb, p_reason text, p_announce boolean,
                                                              p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run', 'simulation.run.complete']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM simulation.runs_current WHERE run_id = p_run_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'constraint check rejected: no run % in this domain', p_run_id USING ERRCODE = '23503'; END IF;
  IF p_stage NOT IN ('opening', 'completion') OR p_outcome NOT IN ('satisfied', 'violated', 'indeterminate') THEN
    RAISE EXCEPTION 'constraint check rejected: stage is opening or completion, outcome satisfied, violated or indeterminate' USING ERRCODE = '22023';
  END IF;
  IF p_stage = 'opening' AND p_outcome = 'violated' THEN
    RAISE EXCEPTION 'constraint check rejected: a violated verdict at opening refuses the run; it is never recorded on an opened run' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'indeterminate' AND length(btrim(coalesce(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'constraint check rejected: an indeterminate verdict says why' USING ERRCODE = '22023';
  END IF;
  INSERT INTO simulation.run_constraint_checks (check_id, scope, tenant_id, domain_id, run_id, stage, outcome, set_id, set_version, violations, indeterminate_reason, checked_by, correlation_id)
  VALUES (p_check_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_stage, p_outcome, p_set_id, p_set_version, coalesce(p_violations, '[]'::jsonb),
          CASE WHEN p_outcome = 'indeterminate' THEN btrim(p_reason) END, p_actor, p_correlation);
  IF coalesce(p_announce, false) THEN
    INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, CASE WHEN p_outcome = 'violated' THEN 'constraint.refused' ELSE 'constraint.checked' END, p_actor,
            jsonb_build_object('check_id', p_check_id, 'stage', p_stage, 'outcome', p_outcome, 'set_id', p_set_id, 'set_version', p_set_version,
                               'violations', coalesce(p_violations, '[]'::jsonb), 'indeterminate_reason', CASE WHEN p_outcome = 'indeterminate' THEN btrim(p_reason) END,
                               'read_as_satisfied', p_outcome = 'satisfied'), p_correlation);
  END IF;
  RETURN jsonb_build_object('check_id', p_check_id, 'stage', p_stage, 'outcome', p_outcome);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.record_constraint_check(uuid,uuid,uuid,uuid,text,text,text,int,jsonb,text,boolean,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.record_constraint_check(uuid,uuid,uuid,uuid,text,text,text,int,jsonb,text,boolean,uuid,uuid,uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- §C.6 simulation.open_run — THE ONLY REDEFINITION IN B29: 0086 §M5's live body (0086_b24_attention_completion.sql, the §M5 block)
-- copied WHOLE, with the B29 §C blocks marked: the method BINDING (implicit — the twin's own behaviour_model_ref, every run before
-- B29 — or explicit and active), the APPROVED USE of its family (§A's rule), the QUARANTINE, and the model-aware input and envelope
-- rules for an explicit binding. Every existing refusal is kept word for word; the signature is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION simulation.open_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_twin_version int, p_run_kind text, p_control_run_id uuid, p_corrects uuid,
  p_scenario_id uuid, p_scenario_branch_id uuid, p_scenario_version int, p_scenario_branch_state text, p_shock boolean, p_shock_basis text, p_component text,
  p_model_ref text, p_implementation_digest text, p_environment_digest text, p_environment jsonb,
  p_stochastic_mode text, p_rng text, p_seed bigint, p_samples int, p_jitter jsonb,
  p_interventions jsonb, p_constraints jsonb, p_assumptions jsonb, p_inputs_digest text, p_validation_status text, p_controls jsonb, p_envelope_ack jsonb, p_challenge_id uuid,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v twin.twin_versions%ROWTYPE; v_state jsonb; v_digest text; c simulation.runs_current%ROWTYPE; v_pinned text; v_controls jsonb; v_synthetic boolean;
  v_unusable jsonb; v_unavailable jsonb; b prediction.branches_current%ROWTYPE; v_scn_version int; v_branch_state text; v_expected_basis text; v_flip uuid;
  v_flip_observed date; v_envelope jsonb; v_outside text; v_ack jsonb; ch simulation.challenges%ROWTYPE;
  v_si_forecast uuid; v_si_markers jsonb; v_si_blocked boolean; v_si jsonb; /* B24 (0086) markers */
  v_twin_model text; v_implicit boolean; v_family text; hq simulation.adapter_health%ROWTYPE; /* B29 (0092) §C the method binding */
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM twin.twin_versions WHERE twin_id = p_twin_id AND version = p_twin_version AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND OR v.state <> 'admitted' THEN
    RAISE EXCEPTION 'run rejected: version % of twin % is not an admitted version in this domain', p_twin_version, p_twin_id USING ERRCODE = '23503';
  END IF;
  IF v.completeness <> 'complete' THEN
    RAISE EXCEPTION 'run rejected: twin version % is incomplete (missing %); a run cannot use inputs the twin does not hold', p_twin_version, v.missing_keys::text USING ERRCODE = '22023';
  END IF;
  IF v.observed_through IS NULL THEN
    RAISE EXCEPTION 'run rejected: twin version % has no world-time cut-off (observed_through); a run reads the twin under two cut-offs', p_twin_version USING ERRCODE = '22023';
  END IF;
  -- B21 (0081, D3 a; AU-TWN-0014, V03-T-120): an UNFIT version opens no run — its behaviours are disabled until a later validation finds otherwise.
  IF v.fitness_state = 'unfit' THEN
    RAISE EXCEPTION 'run rejected (unfit_twin): twin version % of twin % is unfit (validation %); behaviours are disabled until a later validation finds it fit or indeterminate', p_twin_version, p_twin_id, v.fitness_validation_id USING ERRCODE = '22023';
  END IF;
  /* B29 (0092) §C — THE METHOD BINDING. The run names its method (p_model_ref); the twin's own behaviour model is its IMPLICIT binding
     (every run before B29 — supply-flow@1 keeps working, its checks unchanged below); any other method must be BOUND to the twin by its
     owner (twin.twin_method_bindings, active) and its family among the twin's approved uses (twin.use_approved — §A's contract rule). */
  SELECT t.behaviour_model_ref INTO v_twin_model FROM twin.twins_current t WHERE t.twin_id = p_twin_id;
  v_implicit := (p_model_ref = v_twin_model);
  IF NOT v_implicit THEN
    IF NOT EXISTS (SELECT 1 FROM twin.twin_method_bindings mb WHERE mb.twin_id = p_twin_id AND mb.model_ref = p_model_ref AND mb.state = 'active'
                     AND mb.tenant_id = p_tenant AND mb.domain_id = p_domain) THEN
      RAISE EXCEPTION 'run rejected (unbound_method): method % is not bound to twin %; the twin''s owner binds a method before a run uses it (simulation.method.bind)', p_model_ref, p_twin_id
        USING ERRCODE = '22023';
    END IF;
    SELECT bm.family INTO v_family FROM twin.behaviour_models bm WHERE bm.method_ref = p_model_ref;
    IF NOT coalesce(twin.use_approved(p_twin_id, v_family), false) THEN
      RAISE EXCEPTION 'run rejected (method_family): the % family (%) is not among the approved uses of twin %', v_family, p_model_ref, p_twin_id USING ERRCODE = '22023';
    END IF;
  END IF;
  /* B29 (0092) §C — CONTAINMENT: a QUARANTINED adapter opens no run in this domain until a method steward reinstates it after a passing probe. */
  SELECT * INTO hq FROM simulation.adapter_health h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.model_ref = p_model_ref;
  IF FOUND AND hq.state = 'quarantined' THEN
    RAISE EXCEPTION 'run rejected (quarantined): the adapter of % is quarantined in this domain since % after % consecutive faults (last: %); a method steward reinstates it after a probe passes',
      p_model_ref, hq.quarantined_at, hq.consecutive_faults, hq.last_fault ->> 'kind' USING ERRCODE = '22023';
  END IF;
  /* end B29 §C binding; the input checks below read the METHOD's required inputs for an explicit binding (the model-aware forms, 0092 §C) */
  v_unusable := CASE WHEN v_implicit THEN twin.unusable_inputs(p_twin_id, p_twin_version, p_component) ELSE twin.unusable_inputs(p_twin_id, p_twin_version, p_component, p_model_ref) END;
  IF jsonb_array_length(v_unusable) > 0 THEN
    RAISE EXCEPTION 'run rejected: inputs for component % are not usable: %', p_component, v_unusable::text USING ERRCODE = '22023';
  END IF;
  v_unavailable := CASE WHEN v_implicit THEN twin.unavailable_inputs(p_twin_id, p_twin_version, p_component) ELSE twin.unavailable_inputs(p_twin_id, p_twin_version, p_component, p_model_ref) END;
  IF jsonb_array_length(v_unavailable) > 0 THEN
    RAISE EXCEPTION 'run rejected: required inputs for component % are no longer available: %', p_component, v_unavailable::text USING ERRCODE = '22023';
  END IF;
  SELECT implementation_digest INTO v_pinned FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF v_pinned IS NULL THEN
    RAISE EXCEPTION 'run rejected: behaviour model % has no pinned implementation', p_model_ref USING ERRCODE = '22023';
  END IF;
  IF v_pinned <> p_implementation_digest THEN
    RAISE EXCEPTION 'run rejected: the implementation offered (%) is not the pinned implementation of % (%)', p_implementation_digest, p_model_ref, v_pinned USING ERRCODE = '22023';
  END IF;
  IF p_run_kind = 'control' AND (p_control_run_id IS NOT NULL OR p_interventions <> '[{"type": "none"}]'::jsonb) THEN
    RAISE EXCEPTION 'run rejected: a control run applies `none` and references no control' USING ERRCODE = '22023';
  END IF;
  IF p_scenario_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'run rejected: scenario % is not an authorized scenario in this domain', p_scenario_id USING ERRCODE = '23503';
    END IF;
    -- 0066 §8 (V04-T-032): a RETIRED scenario's branches do not enter simulation; its history stays for replay.
    IF EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.state = 'retired') THEN
      RAISE EXCEPTION 'run rejected: scenario % was retired by review; a retired branch is not simulated (declare a successor scenario)', p_scenario_id USING ERRCODE = '22023';
    END IF;
    -- B21 (0081, D10; FEX-12, V03-T-143, AI-49-004): an incoherent scenario's branches do not enter simulation.
    IF EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.coherence_state = 'failed') THEN
      RAISE EXCEPTION 'run rejected (incoherent_scenario): scenario % failed its coherence check % (%); a branch of an incoherent scenario is not simulated until a review resolves it', p_scenario_id,
        (SELECT s.coherence_check_id FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id),
        (SELECT string_agg(DISTINCT x ->> 'rule', ', ') FROM prediction.scenarios_current s JOIN prediction.scenario_coherence_checks k ON k.check_id = s.coherence_check_id, jsonb_array_elements(k.findings) x WHERE s.scenario_id = p_scenario_id AND (x ->> 'severity') = 'fail')
        USING ERRCODE = '22023';
    END IF;
    SELECT * INTO b FROM prediction.branches_current WHERE branch_id = p_scenario_branch_id AND scenario_id = p_scenario_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'run rejected: branch % is not a branch of scenario %', p_scenario_branch_id, p_scenario_id USING ERRCODE = '22023';
    END IF;
    v_scn_version := prediction.scenario_version_as_of(p_scenario_id, v.known_at);
    IF v_scn_version IS NULL THEN
      RAISE EXCEPTION 'run rejected: scenario % was recorded after this version''s known_at (%); it was not known at record time', p_scenario_id, v.known_at USING ERRCODE = '22023';
    END IF;
    IF v_scn_version IS DISTINCT FROM p_scenario_version THEN
      RAISE EXCEPTION 'run rejected: scenario % stood at version % at this version''s known_at (%), not %', p_scenario_id, v_scn_version, v.known_at, p_scenario_version USING ERRCODE = '22023';
    END IF;
    -- B23 (0084, L7-I02): a branch ADDED after the declaration (BranchScenario) belongs to the version that added it; a run whose record
    -- cut-off binds an earlier version of the tree did not know it (the membership above reads the current rows, which carry it).
    IF b.added_in_version > v_scn_version THEN
      RAISE EXCEPTION 'run rejected (branch_added_later): branch % was added in version % of scenario %, after version % that this twin version''s known_at (%) binds; it was not in the tree this run knew',
        p_scenario_branch_id, b.added_in_version, p_scenario_id, v_scn_version, v.known_at USING ERRCODE = '22023';
    END IF;
    /* BOTH CLOCKS: written by this run's record cut-off, and observed within its world. */
    v_branch_state := prediction.branch_state_as_of(p_scenario_branch_id, v.known_at, v.observed_through);
    v_flip_observed := prediction.branch_flip_observed_at(p_scenario_branch_id);
    IF v_branch_state IS DISTINCT FROM p_scenario_branch_state THEN
      RAISE EXCEPTION 'run rejected: branch % was % under this run''s cut-offs (known_at %, observations through %; the flip was recorded % and observed %), not %',
        p_scenario_branch_id, v_branch_state, v.known_at, v.observed_through, b.flipped_at, v_flip_observed, p_scenario_branch_state USING ERRCODE = '22023';
    END IF;
    IF p_shock <> (v_branch_state = 'flipped') THEN
      RAISE EXCEPTION 'run rejected: the shock contradicts the bound branch: branch % was % under this run''s cut-offs (a shock without a flipped branch is a hypothetical and names no scenario)', p_scenario_branch_id, v_branch_state USING ERRCODE = '22023';
    END IF;
    v_flip := CASE WHEN v_branch_state = 'flipped' THEN b.flip_event_id ELSE NULL END;
    v_expected_basis := CASE WHEN p_shock THEN 'scenario-branch-flipped' ELSE 'none' END;
  ELSE
    IF p_scenario_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'run rejected: a scenario branch was named without its scenario' USING ERRCODE = '22023';
    END IF;
    v_expected_basis := CASE WHEN p_shock THEN 'hypothetical' ELSE 'none' END;
  END IF;
  IF p_shock_basis IS DISTINCT FROM v_expected_basis THEN
    RAISE EXCEPTION 'run rejected: the shock basis offered (%) is not what the binding establishes (%)', p_shock_basis, v_expected_basis USING ERRCODE = '22023';
  END IF;
  v_controls := coalesce(p_controls, v.controls);
  IF simulation.classification_rank(v_controls ->> 'classification') < simulation.classification_rank(v.controls ->> 'classification')
     OR (coalesce((v.controls ->> 'synthetic_state')::boolean, false) AND NOT coalesce((v_controls ->> 'synthetic_state')::boolean, false)) THEN
    RAISE EXCEPTION 'run rejected: the controls offered are less restricted than the twin version''s' USING ERRCODE = '22023';
  END IF;
  /* B24 (0086) markers — F-P6-07 (V03-T-077): a run bound to a scenario rests on the scenario's forecast and on the sources of its series.
     An ACTIVE source-impact marker on that forecast (or on the scenario itself) that is FAILED or SUSPENDED refuses the run; DEGRADED or
     UNKNOWN admits it with controls.source_impact DECLARED on the run (the markers, the worst state) — the port declares it, never the
     caller — and marks the new run itself (one marker per source), so a package citing the run meets the commitment gate. */
  v_controls := v_controls - 'source_impact';
  IF p_scenario_id IS NOT NULL THEN
    SELECT s.forecast_id INTO v_si_forecast FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', m.marker_id, 'source_id', m.source_id, 'subject_kind', m.subject_kind, 'subject_id', m.subject_id,
                                                 'health_state', m.health_state, 'reason', m.reason, 'set_at', m.set_at) ORDER BY m.set_at, m.marker_id), '[]'::jsonb),
           coalesce(bool_or(m.health_state IN ('failed', 'suspended')), false)
      INTO v_si_markers, v_si_blocked
      FROM observation.source_impact_markers m
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'active'
       AND ((m.subject_kind = 'forecast' AND m.subject_id = v_si_forecast) OR (m.subject_kind = 'scenario' AND m.subject_id = p_scenario_id));
    IF v_si_blocked THEN
      RAISE EXCEPTION 'run rejected (source_impact): scenario % rests on forecast % whose source is % (%); a branch resting on a failed or suspended source is not simulated until the source recovers',
        p_scenario_id, v_si_forecast,
        (SELECT string_agg(DISTINCT (x ->> 'health_state'), ', ') FROM jsonb_array_elements(v_si_markers) x WHERE (x ->> 'health_state') IN ('failed', 'suspended')),
        (SELECT string_agg(DISTINCT 'source ' || (x ->> 'source_id') || ' ' || (x ->> 'health_state'), '; ') FROM jsonb_array_elements(v_si_markers) x)
        USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_si_markers) > 0 THEN
      v_si := jsonb_build_object('health_state', CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_si_markers) x WHERE (x ->> 'health_state') = 'degraded') THEN 'degraded' ELSE 'unknown' END,
                                 'scenario_id', p_scenario_id, 'forecast_id', v_si_forecast, 'markers', v_si_markers, 'declared_at', clock_timestamp(),
                                 'note', 'admitted on a degraded or unknown source: the run''s result rests on it until the source recovers');
      v_controls := v_controls || jsonb_build_object('source_impact', v_si);
      INSERT INTO observation.source_impact_markers (marker_id, scope, tenant_id, domain_id, source_id, subject_kind, subject_id, health_state, reason, set_by_event, correlation_id)
      SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.source_id, 'run', p_run_id, x.health_state, 'the run was opened on a scenario resting on this source (run.opened)', p_event_id, p_correlation
        FROM (SELECT DISTINCT ON ((e ->> 'source_id')::uuid) (e ->> 'source_id')::uuid AS source_id, e ->> 'health_state' AS health_state
                FROM jsonb_array_elements(v_si_markers) e ORDER BY (e ->> 'source_id')::uuid, (e ->> 'health_state') = 'degraded' DESC) x
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  /* end B24 markers */
  -- B21 (0081, D3 b): THE RUN'S OWN CONTRACT against the envelope — one rule with the validation (twin.envelope_check); outside needs the acknowledgement.
  v_envelope := CASE WHEN v_implicit THEN twin.envelope_check(p_twin_id, p_twin_version, jsonb_build_object('horizon_days', (p_constraints ->> 'horizon_days')::numeric))
                     /* B29 (0092) §C: an explicitly bound method is checked against ITS operating envelope */
                     ELSE twin.envelope_check(p_twin_id, p_twin_version, jsonb_build_object('horizon_days', (p_constraints ->> 'horizon_days')::numeric), p_model_ref) END;
  v_ack := NULL;
  IF (v_envelope ->> 'state') = 'outside' THEN
    SELECT string_agg(k || ' = ' || (x ->> 'value') || ' outside [' || (x -> 'range' ->> 0) || ', ' || (x -> 'range' ->> 1) || ']', '; ' ORDER BY k) INTO v_outside FROM jsonb_each(v_envelope -> 'keys') e(k, x) WHERE (x ->> 'verdict') = 'outside';
    -- the acknowledgement is read as TEXT, never cast: a non-boolean, "yes", 1 or a missing key all read as "not acknowledged" (no 22P02)
    IF p_envelope_ack IS NULL OR (p_envelope_ack ->> 'acknowledge') IS DISTINCT FROM 'true' OR coalesce(length(btrim(p_envelope_ack ->> 'reason')), 0) < 8 THEN
      RAISE EXCEPTION 'run rejected (envelope): outside the operating envelope of % (%); a run outside the envelope needs a twin owner''s or the domain administrator''s acknowledgement (envelope.acknowledge true with a reason of 8+ characters)', p_model_ref, v_outside USING ERRCODE = '22023';
    END IF;
    IF NOT twin.envelope_ack_holder(p_actor, p_tenant, p_domain) THEN
      RAISE EXCEPTION 'run rejected (envelope_ack): the acknowledgement of an envelope breach is a twin owner''s or the domain administrator''s; the acting principal holds neither role in this domain (%)', v_outside USING ERRCODE = '42501';
    END IF;
    v_ack := jsonb_build_object('acknowledged_by', p_actor, 'acknowledged_at', clock_timestamp(), 'reason', p_envelope_ack ->> 'reason', 'keys', v_outside);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value, 'unit', e.unit,
                                               'material', e.material, 'citations', e.citations, 'health', e.health, 'valid_from', e.valid_from,
                                               'valid_to', e.valid_to, 'confidence', e.confidence, 'synthetic_state', e.synthetic_state, 'controls', e.controls,
                                               'inherited_validation', e.inherited_validation)
                            ORDER BY e.key), '[]'::jsonb)
    INTO v_state FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_twin_version;
  v_digest := encode(sha256(convert_to(v_state::text, 'UTF8')), 'hex');
  IF p_run_kind = 'intervention' THEN
    SELECT * INTO c FROM simulation.runs_current WHERE run_id = p_control_run_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected: control run % is not an authorized run in this domain', p_control_run_id USING ERRCODE = '23503'; END IF;
    IF c.run_kind <> 'control' THEN RAISE EXCEPTION 'run rejected: % is not a control run', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.state <> 'completed' THEN RAISE EXCEPTION 'run rejected: control run % is not completed', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.twin_id <> p_twin_id OR c.twin_version <> p_twin_version OR c.initial_state_digest <> v_digest OR c.implementation_digest <> p_implementation_digest
       OR c.assumptions <> p_assumptions OR c.constraints <> p_constraints OR c.shock <> p_shock OR c.component <> p_component
       OR c.scenario_id IS DISTINCT FROM p_scenario_id OR c.scenario_branch_id IS DISTINCT FROM p_scenario_branch_id
       OR c.scenario_version IS DISTINCT FROM p_scenario_version OR c.shock_basis <> p_shock_basis THEN
      RAISE EXCEPTION 'run rejected: control run % is not compatible (it must share the twin version, initial state, implementation, assumptions, constraints, scenario binding, shock and component)', p_control_run_id
        USING ERRCODE = '22023';
    END IF;
  END IF;
  -- B21 (0081, D11): a RE-RUN answering a challenge names it; the challenge must await a re-run of the run this run corrects; one re-run per challenge.
  -- (the aliases here and in the incoherent-scenario block avoid `c`: this body declares c simulation.runs_current%ROWTYPE, and §7 gave that row a challenge_id)
  IF p_challenge_id IS NOT NULL THEN
    SELECT * INTO ch FROM simulation.challenges x WHERE x.challenge_id = p_challenge_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected (challenge): no such challenge % in this domain', p_challenge_id USING ERRCODE = '23503'; END IF;
    IF p_corrects IS DISTINCT FROM ch.run_id THEN RAISE EXCEPTION 'run rejected (challenge): challenge % disputes run %; a re-run names it as the run it corrects (correctsRunId)', p_challenge_id, ch.run_id USING ERRCODE = '22023'; END IF;
    IF ch.state <> 'rerun_requested' THEN RAISE EXCEPTION 'run rejected (challenge): challenge % is not awaiting a re-run (state %)', p_challenge_id, ch.state USING ERRCODE = '22023'; END IF;
    IF ch.rerun_run_id IS NOT NULL THEN RAISE EXCEPTION 'run rejected (challenge): challenge % is not awaiting a re-run (run % is its re-run)', p_challenge_id, ch.rerun_run_id USING ERRCODE = '22023'; END IF;
  END IF;
  v_synthetic := coalesce((v_controls ->> 'synthetic_state')::boolean, v.synthetic_state);
  INSERT INTO simulation.runs_current (
    run_id, scope, tenant_id, domain_id, twin_id, twin_version, branch_id, run_kind, control_run_id, corrects_run_id,
    scenario_id, scenario_branch_id, scenario_version, scenario_branch_state, scenario_flip_event, shock, shock_basis, component,
    known_at, observed_through, initial_state, initial_state_digest, model_ref, implementation_digest, environment_digest, environment,
    stochastic_mode, rng, seed, samples, jitter, interventions, constraints, assumptions, inputs_digest, validation_status, state, controls,
    operator_principal_id, correlation_id, twin_fitness, envelope_state, envelope_check, envelope_ack, challenge_id
  ) VALUES (
    p_run_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_twin_version, v.branch_id, p_run_kind, p_control_run_id, p_corrects,
    p_scenario_id, p_scenario_branch_id, p_scenario_version, p_scenario_branch_state, v_flip, p_shock, p_shock_basis, p_component,
    v.known_at, v.observed_through, v_state, v_digest, p_model_ref, p_implementation_digest, p_environment_digest, p_environment,
    p_stochastic_mode, p_rng, p_seed, p_samples, p_jitter, p_interventions, p_constraints, p_assumptions, p_inputs_digest,
    p_validation_status || CASE WHEN v.verification_state = 'unverified' THEN '; twin version UNVERIFIED (a cited input was corrected)' ELSE '' END,
    'opened', v_controls, p_actor, p_correlation, v.fitness_state, v_envelope ->> 'state', v_envelope, v_ack, p_challenge_id);
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.opened', p_actor,
          jsonb_build_object('twin_id', p_twin_id, 'twin_version', p_twin_version, 'run_kind', p_run_kind, 'control_run_id', p_control_run_id,
                             'initial_state_digest', v_digest, 'inputs_digest', p_inputs_digest, 'stochastic_mode', p_stochastic_mode,
                             'scenario_id', p_scenario_id, 'scenario_version', p_scenario_version, 'scenario_branch_id', p_scenario_branch_id,
                             'scenario_branch_state', p_scenario_branch_state, 'shock_basis', p_shock_basis,
                             'flip_recorded_at', b.flipped_at, 'flip_observed_at', v_flip_observed,
                             'twin_fitness', v.fitness_state, 'envelope_state', v_envelope ->> 'state', 'envelope_ack', v_ack, 'challenge_id', p_challenge_id), p_correlation);
  IF p_challenge_id IS NOT NULL THEN
    UPDATE simulation.challenges SET rerun_run_id = p_run_id WHERE challenge_id = p_challenge_id;
    INSERT INTO simulation.challenge_events (event_id, scope, tenant_id, domain_id, challenge_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_challenge_id, ch.run_id, 'challenge.rerun_opened', p_actor, jsonb_build_object('rerun_run_id', p_run_id, 'corrects_run_id', p_corrects), p_correlation);
  END IF;
  RETURN jsonb_build_object('initial_state', v_state, 'initial_state_digest', v_digest, 'known_at', v.known_at, 'observed_through', v.observed_through,
                            'branch_id', v.branch_id, 'synthetic_state', v_synthetic, 'controls', v_controls, 'verification_state', v.verification_state,
                            'scenario_flip_event', v_flip, 'flip_observed_at', v_flip_observed,
                            'twin_fitness', v.fitness_state, 'envelope', v_envelope, 'envelope_ack', v_ack, 'challenge_id', p_challenge_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid) TO eye_commit;
-- end §C

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §B THE SUPPLY NETWORK AND THE SUPPLY CHAIN AGENT (part b29/supply-network) ─────────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════════════════════
-- §B THE MULTI-TIER SUPPLY NETWORK AND THE SUPPLY CHAIN AGENT (F-P5-01 clause 3) — part B of 0092 (B29, 2026-09-29)
-- ═════════════════════════════════════════════════════════════════════════════════════
-- Part-local file (the integrator combines it into 0092 as §B). Forward only: no earlier migration and no §0 statement is edited; the Phase 0
-- schemas gain nothing. What this part adds, in the order the clause names it:
--
--   B.1 THE KIND `supply-network` (family supply-network, a product kind — tenant_id NULL): the element schema of its five prefixes —
--       tier:, site:, material:, route:, capacity: (a site's capacity for a material per day, in the material's unit per day: the schema's
--       `unit_pattern`, which §A's schema check honours) — the TS validator (twin/supply-network/network.ts, registered beside §A's eight)
--       runs at grounding (the schema) and at admission (the family's rules), and its measures (tier coverage, the capacity bottleneck,
--       single-source exposure) are read by the composition measures route and by the agent. The supply-chain kind is untouched (its
--       material_keys stay as 0032 seeded them; its seeded twin stays complete).
--   B.2 THE SUPPLY CHAIN AGENT's registration and runs: executive.register_agent and executive.open_agent_run RE-DECLARED from their latest
--       bodies (0089 §R2), copied whole with ONE change each — the kind supply_chain (max_items enforced by its scan) and its task
--       supply_scan, run by a supply_chain agent and by no other kind. These are the ONLY redefinitions in B29 §B.
--   B.3 THE AGENT'S PROPOSALS (twin.agent_proposals): a FINDING about a supply-network twin — bottleneck | single_source | coverage_gap — the
--       version it was read from (cited: kind `twin`, the version's TWN digest), the measure's numbers and a rationale; drafted by the agent
--       (twin.proposal.draft → twin.draft_agent_proposals) to the twin's OWNER, who decides it (twin.proposal.decide →
--       twin.decide_agent_proposal): proposed → accepted | dismissed (| superseded, when the agent reads a changed measure of the same
--       finding while it is still proposed). The same measure is never proposed twice — a dismissed finding comes back only when its measure
--       changes. The SCAN MARKS (twin.agent_scans) record which admitted version each agent has read through: the next run starts from the
--       versions not yet read (the backlog), so an interrupted run resumes and nothing is drafted twice.
--   B.4 THE AGENT'S BOUNDARY at the port: an agent principal never declares a twin, opens, grounds or admits a version — a trigger on
--       twin.twin_events (where those four ports record their act) refuses it whatever bound action the session holds (the PDP refuses it
--       first: the supply_chain_agent role holds twin.read and twin.proposal.draft and nothing else of the twin).

-- ============================================================
-- B.1 THE KIND supply-network
-- ============================================================
INSERT INTO twin.twin_kind_schemas (kind, description, material_keys, family, element_schema, required_dependencies, default_methods) VALUES
  ('supply-network', 'A multi-tier supply network serving one terminal site: its tiers, sites (with their bills of materials), materials, routes and each site''s capacity per material per day; the capacity bottleneck, tier coverage and single-source exposure are derived.',
   ARRAY['capacity', 'material', 'route', 'site', 'tier'], 'supply-network',
   '{"tier": {"unit": null, "description": "a declared tier (tier:1 … tier:n); value: its label", "required": true}, "site": {"unit": null, "description": "a site (site:<id>); value { tier (0 = the terminal site), name, bom? }", "required": true}, "material": {"unit": null, "description": "a material (material:<id>); value { name, unit }", "required": true}, "route": {"unit": null, "description": "a route (route:<id>); value { from: <site>, to: <site>, material }", "required": true}, "capacity": {"unit": "units/day", "unit_pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,19}/day$", "description": "a site''s capacity for a material per day (capacity:<site>.<material>), in the material''s unit per day", "required": true}}'::jsonb,
   ARRAY[]::text[], ARRAY['discrete-event', 'optimisation'])
ON CONFLICT (kind) DO NOTHING;

-- ============================================================
-- B.2 THE SUPPLY CHAIN AGENT: its kind and its task
-- ============================================================
-- 0089 §R2 copied whole (0088 §S6 + 0086 §T + B32); B29 §B: the kind supply_chain (role supply_chain_agent, 0092 §0.1), max_items enforced
-- by its scan (the findings one run drafts; the rest wait for the next run).
CREATE OR REPLACE FUNCTION executive.register_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_kind text, p_version text, p_code_digest text, p_owner uuid, p_escalation uuid,
  p_budgets jsonb, p_stop_conditions jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text; sc jsonb; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  /* B32 (0089) exposures: the Risk and Opportunity Agents; B29 (0092) §B: the Supply Chain Agent */
  IF p_kind NOT IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal', 'risk', 'opportunity', /* B29 (0092) */ 'supply_chain') THEN RAISE EXCEPTION 'agent rejected: kind is decision, briefing, reporting, attention, weak_signal, risk, opportunity or supply_chain' USING ERRCODE = '22023'; END IF;
  /* end B32 exposures */
  SELECT kind, status INTO v_kind, v_status FROM identity.principals WHERE id = p_principal AND tenant_id = p_tenant;
  IF NOT FOUND OR v_kind <> 'agent' OR v_status <> 'active' THEN RAISE EXCEPTION 'agent rejected: the principal must be an active principal of kind agent in this tenant' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_owner, p_tenant) THEN RAISE EXCEPTION 'agent rejected: the owner is the accountable human, never another agent' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_escalation, p_tenant) THEN RAISE EXCEPTION 'agent rejected: the escalation target is a named human' USING ERRCODE = '42501'; END IF;
  IF p_budgets IS NULL OR jsonb_typeof(p_budgets) <> 'object' OR NOT (p_budgets ? 'max_reads' AND p_budgets ? 'max_gateway_calls' AND p_budgets ? 'max_elapsed_ms') THEN
    RAISE EXCEPTION 'agent rejected: budgets name max_reads, max_gateway_calls and max_elapsed_ms' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['max_reads', 'max_gateway_calls', 'max_elapsed_ms'] LOOP
    IF jsonb_typeof(p_budgets -> k) <> 'number' OR (p_budgets ->> k)::numeric < 0 OR (p_budgets ->> k)::numeric <> floor((p_budgets ->> k)::numeric) THEN
      RAISE EXCEPTION 'agent rejected: budget % is a non-negative integer', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- B24 (0086 §T): the attention timer's cadence — a whole number of seconds in [60, 86400]; no other kind carries it
  IF p_budgets ? 'tick_every_seconds' THEN
    IF p_kind <> 'attention' THEN RAISE EXCEPTION 'agent rejected: budget tick_every_seconds is the attention timer''s cadence; a % agent has none', p_kind USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_budgets -> 'tick_every_seconds') <> 'number' OR (p_budgets ->> 'tick_every_seconds')::numeric <> floor((p_budgets ->> 'tick_every_seconds')::numeric)
       OR (p_budgets ->> 'tick_every_seconds')::numeric < 60 OR (p_budgets ->> 'tick_every_seconds')::numeric > 86400 THEN
      RAISE EXCEPTION 'agent rejected: budget tick_every_seconds is a whole number of seconds in [60, 86400]' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_stop_conditions IS NOT NULL AND jsonb_typeof(p_stop_conditions) <> 'array' THEN RAISE EXCEPTION 'agent rejected: stop_conditions is an array' USING ERRCODE = '22023'; END IF;
  FOR sc IN SELECT * FROM jsonb_array_elements(coalesce(p_stop_conditions, '[]'::jsonb)) LOOP
    IF jsonb_typeof(sc) <> 'object' OR (sc ->> 'kind') NOT IN ('max_items', 'on_degraded') THEN
      RAISE EXCEPTION 'agent rejected: stop condition % is not one this runtime supports (max_items, on_degraded)', coalesce(sc ->> 'kind', sc::text) USING ERRCODE = '22023';
    END IF;
    -- every accepted condition is one this agent kind's task enforces: max_items on the decision draft and the briefing; on_degraded on the briefing
    -- B28 (0088 §S6): max_items on the weak-signal scan too (the nominations one run makes; the rest wait for the next scan)
    -- B32 (0089): max_items on the risk and opportunity estimates too (the exposures one run re-estimates; the rest wait for the next run)
    -- B29 (0092) §B: max_items on the supply scan too (the findings one run drafts; the rest wait for the next run)
    IF (sc ->> 'kind') = 'max_items' AND p_kind NOT IN ('decision', 'briefing', 'weak_signal', /* B32 (0089) */ 'risk', 'opportunity', /* B29 (0092) */ 'supply_chain') THEN
      RAISE EXCEPTION 'agent rejected: stop condition max_items is not enforced by a % agent''s task; an unenforced control is not accepted', p_kind USING ERRCODE = '22023';
    END IF;
    IF (sc ->> 'kind') = 'on_degraded' AND p_kind <> 'briefing' THEN
      RAISE EXCEPTION 'agent rejected: stop condition on_degraded is not enforced by a % agent''s task; an unenforced control is not accepted', p_kind USING ERRCODE = '22023';
    END IF;
    IF (sc ->> 'kind') = 'max_items' AND (jsonb_typeof(sc -> 'value') <> 'number' OR (sc ->> 'value')::numeric < 0) THEN
      RAISE EXCEPTION 'agent rejected: stop condition max_items names a non-negative value' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  INSERT INTO executive.agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_kind, agent_version, code_digest, owner_principal_id, escalation_principal_id, budgets, stop_conditions, created_by, correlation_id)
  VALUES (p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_kind, p_version, p_code_digest, p_owner, p_escalation, p_budgets, coalesce(p_stop_conditions, '[]'::jsonb), p_actor, p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'principal_id', p_principal, 'kind', p_kind);
END $$ LANGUAGE plpgsql;

-- 0089 §R2 copied whole (0088 §S6 + 0086 §T + B32); B29 §B: the task supply_scan, run by a supply_chain agent and by no other kind (the
-- refusal texts keep the 0046 phrases the refusal row reads — `task is draft, briefing, report or monitor`, `a % agent does not run the task`).
CREATE OR REPLACE FUNCTION executive.open_agent_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_agent_id uuid, p_task text, p_trigger_kind text, p_trigger_principal uuid, p_trigger_ref text, p_room_id uuid, p_package_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM executive.agents WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND OR a.status <> 'active' THEN RAISE EXCEPTION 'run rejected: no active agent % in this domain', p_agent_id USING ERRCODE = '42501'; END IF;
  IF a.principal_id IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'run rejected: a run is opened by the agent itself, under its own session' USING ERRCODE = '42501'; END IF;
  IF p_task NOT IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan', /* B32 (0089) */ 'risk_assess', 'opportunity_assess', /* B29 (0092) */ 'supply_scan') THEN RAISE EXCEPTION 'run rejected: task is draft, briefing, report or monitor (or attention_tick for an attention agent, signal_scan for a weak_signal agent, risk_assess for a risk agent, opportunity_assess for an opportunity agent, supply_scan for a supply_chain agent)' USING ERRCODE = '22023'; END IF;
  IF (a.agent_kind = 'decision' AND p_task <> 'draft') OR (a.agent_kind = 'briefing' AND p_task NOT IN ('briefing', 'monitor')) OR (a.agent_kind = 'reporting' AND p_task <> 'report')
     OR (a.agent_kind = 'attention' AND p_task <> 'attention_tick') OR (a.agent_kind <> 'attention' AND p_task = 'attention_tick')
     -- B28 (0088 §S6): the weak-signal scan, run by a weak_signal agent and by no other kind
     OR (a.agent_kind = 'weak_signal' AND p_task <> 'signal_scan') OR (a.agent_kind <> 'weak_signal' AND p_task = 'signal_scan')
     -- B32 (0089): the risk estimate by a risk agent, the opportunity estimate by an opportunity agent, and by no other kind
     OR (a.agent_kind = 'risk' AND p_task <> 'risk_assess') OR (a.agent_kind <> 'risk' AND p_task = 'risk_assess')
     OR (a.agent_kind = 'opportunity' AND p_task <> 'opportunity_assess') OR (a.agent_kind <> 'opportunity' AND p_task = 'opportunity_assess')
     -- B29 (0092) §B: the supply scan by a supply_chain agent, and by no other kind
     OR (a.agent_kind = 'supply_chain' AND p_task <> 'supply_scan') OR (a.agent_kind <> 'supply_chain' AND p_task = 'supply_scan') THEN
    RAISE EXCEPTION 'run rejected: a % agent does not run the task %', a.agent_kind, p_task USING ERRCODE = '42501';
  END IF;
  INSERT INTO executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_principal_id, trigger_ref, room_id, package_id, budget, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, a.principal_id, a.agent_kind, a.agent_version, a.code_digest, p_task, p_trigger_kind, p_trigger_principal, p_trigger_ref, p_room_id, p_package_id, a.budgets, p_correlation);
  RETURN jsonb_build_object('run_id', p_run_id, 'budget', a.budgets, 'stop_conditions', a.stop_conditions, 'escalation_principal_id', a.escalation_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- B.3 THE AGENT'S PROPOSALS AND SCAN MARKS
-- ============================================================
CREATE TABLE twin.agent_proposals (
  proposal_id       uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  twin_id           uuid NOT NULL,
  twin_version      int  NOT NULL CHECK (twin_version >= 1),
  /* The version the finding was read from: kind `twin`, the twin, the admitted version and its TWN digest. */
  version_citation  jsonb NOT NULL CHECK (twin.citations_ok(jsonb_build_array(version_citation)) AND version_citation ->> 'kind' = 'twin'),
  finding_kind      text NOT NULL CHECK (finding_kind IN ('bottleneck', 'single_source', 'coverage_gap')),
  /* What the finding is about: `<site>.<material>` (a bottleneck, a single source) or `tier:<n>` (a coverage gap). */
  subject           text NOT NULL CHECK (subject ~ '^[A-Za-z0-9:._-]{1,130}$'),
  /* The measure's numbers, and their digest: the same digest is never proposed twice for the same finding. */
  measure           jsonb NOT NULL CHECK (jsonb_typeof(measure) = 'object'),
  measure_digest    text NOT NULL CHECK (measure_digest ~ '^[0-9a-f]{64}$'),
  rationale         text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 2000),
  state             text NOT NULL CHECK (state IN ('proposed', 'accepted', 'dismissed', 'superseded')),
  agent_id          uuid NOT NULL,
  run_id            uuid NOT NULL,
  drafted_by        uuid NOT NULL,
  drafted_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_note     text,
  superseded_by     uuid,
  correlation_id    uuid NOT NULL,
  CONSTRAINT tap_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tap_decided CHECK (state NOT IN ('accepted', 'dismissed') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT tap_dismissed CHECK (state <> 'dismissed' OR decision_note IS NOT NULL),
  CONSTRAINT tap_superseded CHECK (state <> 'superseded' OR superseded_by IS NOT NULL)
);
CREATE INDEX tap_twin ON twin.agent_proposals (twin_id, state);
CREATE INDEX tap_finding ON twin.agent_proposals (twin_id, finding_kind, subject, drafted_at);
/* One OPEN proposal per finding: a changed measure supersedes the open one, it never stands beside it. */
CREATE UNIQUE INDEX tap_one_open ON twin.agent_proposals (twin_id, finding_kind, subject) WHERE state = 'proposed';

CREATE TABLE twin.agent_scans (
  scan_id        uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  twin_id        uuid NOT NULL,
  twin_version   int  NOT NULL CHECK (twin_version >= 1),
  agent_id       uuid NOT NULL,
  run_id         uuid NOT NULL,
  /* complete: every finding of the version was drafted or found unchanged; incomplete: max_items cut the version short (it stays in the backlog). */
  complete       boolean NOT NULL,
  drafted        int NOT NULL CHECK (drafted >= 0),
  unchanged      int NOT NULL CHECK (unchanged >= 0),
  scanned_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT tas_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX tas_backlog ON twin.agent_scans (agent_id, twin_id, twin_version) WHERE complete;
CREATE TRIGGER tas_append_only BEFORE UPDATE OR DELETE ON twin.agent_scans FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A proposal moves one way, once: proposed → accepted | dismissed | superseded; nothing else of the row changes; never deleted. */
CREATE OR REPLACE FUNCTION twin.agent_proposals_forward() RETURNS trigger
SET search_path = twin, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'agent_proposals rows are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'proposed' OR NEW.state = 'proposed'
     OR (to_jsonb(NEW) - 'state' - 'decided_by' - 'decided_at' - 'decision_note' - 'superseded_by') <> (to_jsonb(OLD) - 'state' - 'decided_by' - 'decided_at' - 'decision_note' - 'superseded_by') THEN
    RAISE EXCEPTION 'agent proposal % is decided once and never rewritten', OLD.proposal_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tap_forward BEFORE UPDATE OR DELETE ON twin.agent_proposals FOR EACH ROW EXECUTE FUNCTION twin.agent_proposals_forward();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_proposals', 'agent_scans'] LOOP
    EXECUTE format('ALTER TABLE twin.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE twin.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY twin_isolation ON twin.%I USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);  -- the 0032:634-639 idiom
    EXECUTE format('GRANT SELECT ON twin.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

/*
 * THE DRAFT (twin.proposal.draft): the domain's active Supply Chain Agent, under its own session and inside its own running supply_scan
 * run, drafts the findings it read from ONE admitted version of a supply-network twin. Per finding: the same measure as the finding's
 * latest record (proposed, accepted or dismissed) → UNCHANGED (never proposed twice — a dismissed finding comes back only when its
 * measure changes); a changed measure while one is still proposed → the open one SUPERSEDED by the new one; else a new proposal. The scan
 * mark records whether the version was read through (complete) or cut short by max_items (it stays in the backlog). Each proposal is
 * a `proposal.drafted` event on the twin. Nothing of the twin is written: the finding goes to its owner.
 */
CREATE OR REPLACE FUNCTION twin.draft_agent_proposals(
  p_tenant uuid, p_domain uuid, p_twin uuid, p_version int, p_findings jsonb, p_complete boolean, p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, executive, identity, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_family text; v_digest text; v_citation jsonb; f jsonb; v_measure_digest text; prior twin.agent_proposals%ROWTYPE;
        v_found boolean; v_supersedes uuid; v_id uuid; v_drafted jsonb := '[]'::jsonb; v_unchanged jsonb := '[]'::jsonb; v_superseded jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.proposal.draft']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'twin proposal rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.agents a JOIN identity.principals pr ON pr.id = a.principal_id AND pr.kind = 'agent' AND pr.status = 'active'
                  WHERE a.agent_id = p_agent AND a.principal_id = p_actor AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'supply_chain' AND a.status = 'active') THEN
    RAISE EXCEPTION 'twin proposal rejected (not_agent): a finding is drafted by the domain''s active Supply Chain Agent, under its own session — never by a person or another agent' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.agent_runs r WHERE r.run_id = p_run AND r.agent_id = p_agent AND r.task = 'supply_scan' AND r.outcome = 'running') THEN
    RAISE EXCEPTION 'twin proposal rejected (run): run % is not this agent''s running supply scan', p_run USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'twin proposal rejected: no such twin % in this domain', p_twin USING ERRCODE = '23503'; END IF;
  SELECT k.family INTO v_family FROM twin.twin_kind_schemas k WHERE k.kind = t.kind;
  IF v_family IS DISTINCT FROM 'supply-network' THEN RAISE EXCEPTION 'twin proposal rejected (family): twin % is a % twin; the agent proposes on supply networks', p_twin, t.kind USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.version = p_version AND v.branch_id = 'actual' AND v.state = 'admitted') THEN
    RAISE EXCEPTION 'twin proposal rejected (version): version % of twin % is not an admitted version on actual', p_version, p_twin USING ERRCODE = '22023';
  END IF;
  SELECT o.content_digest INTO v_digest FROM objects.canonical_objects o
   WHERE o.object_type = 'TWN' AND o.object_id = p_twin AND o.object_version = p_version AND o.tenant_id = p_tenant;
  IF v_digest IS NULL THEN RAISE EXCEPTION 'twin proposal rejected (version): version % of twin % has no canonical TWN version to cite', p_version, p_twin USING ERRCODE = '22023'; END IF;
  v_citation := jsonb_build_object('kind', 'twin', 'id', p_twin::text, 'version', p_version, 'digest', v_digest);
  IF p_findings IS NULL OR jsonb_typeof(p_findings) <> 'array' THEN RAISE EXCEPTION 'twin proposal rejected: findings is an array' USING ERRCODE = '22023'; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(p_findings) LOOP
    IF jsonb_typeof(f) <> 'object' OR coalesce(f ->> 'finding_kind', '') NOT IN ('bottleneck', 'single_source', 'coverage_gap') THEN
      RAISE EXCEPTION 'twin proposal rejected: a finding is a bottleneck, a single_source or a coverage_gap' USING ERRCODE = '22023';
    END IF;
    IF coalesce(f ->> 'subject', '') !~ '^[A-Za-z0-9:._-]{1,130}$' THEN RAISE EXCEPTION 'twin proposal rejected: a finding names its subject (<site>.<material> or tier:<n>)' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(f -> 'measure') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'twin proposal rejected: a finding carries the measure''s numbers' USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(f ->> 'rationale')), 0) < 8 THEN RAISE EXCEPTION 'twin proposal rejected: a finding states its rationale (at least 8 characters)' USING ERRCODE = '22023'; END IF;
    v_measure_digest := encode(sha256(convert_to((f -> 'measure')::text, 'UTF8')), 'hex');
    SELECT * INTO prior FROM twin.agent_proposals x
     WHERE x.twin_id = p_twin AND x.finding_kind = f ->> 'finding_kind' AND x.subject = f ->> 'subject' AND x.state <> 'superseded'
     ORDER BY x.drafted_at DESC, x.proposal_id DESC LIMIT 1 FOR UPDATE;
    v_found := FOUND; v_supersedes := NULL;
    IF v_found AND prior.measure_digest = v_measure_digest THEN
      v_unchanged := v_unchanged || jsonb_build_array(jsonb_build_object('proposal_id', prior.proposal_id, 'finding_kind', prior.finding_kind, 'subject', prior.subject, 'state', prior.state));
      CONTINUE;
    END IF;
    v_id := gen_random_uuid();
    IF v_found AND prior.state = 'proposed' THEN
      v_supersedes := prior.proposal_id;
      UPDATE twin.agent_proposals SET state = 'superseded', superseded_by = v_id WHERE proposal_id = prior.proposal_id;
      v_superseded := v_superseded || jsonb_build_array(jsonb_build_object('proposal_id', prior.proposal_id, 'superseded_by', v_id));
    END IF;
    INSERT INTO twin.agent_proposals (proposal_id, scope, tenant_id, domain_id, twin_id, twin_version, version_citation, finding_kind, subject, measure, measure_digest, rationale,
                                      state, agent_id, run_id, drafted_by, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_version, v_citation, f ->> 'finding_kind', f ->> 'subject', f -> 'measure', v_measure_digest, btrim(f ->> 'rationale'),
            'proposed', p_agent, p_run, p_actor, p_correlation);
    INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_twin, 'proposal.drafted', p_actor,
            jsonb_build_object('proposal_id', v_id, 'finding_kind', f ->> 'finding_kind', 'subject', f ->> 'subject', 'version', v_citation, 'measure_digest', v_measure_digest,
                               'owner', t.owner_principal_id, 'agent_id', p_agent, 'run_id', p_run, 'supersedes', v_supersedes),
            p_correlation);
    v_drafted := v_drafted || jsonb_build_array(jsonb_build_object('proposal_id', v_id, 'finding_kind', f ->> 'finding_kind', 'subject', f ->> 'subject', 'measure_digest', v_measure_digest));
  END LOOP;
  INSERT INTO twin.agent_scans (scan_id, scope, tenant_id, domain_id, twin_id, twin_version, agent_id, run_id, complete, drafted, unchanged, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_twin, p_version, p_agent, p_run, coalesce(p_complete, false), jsonb_array_length(v_drafted), jsonb_array_length(v_unchanged), p_correlation);
  RETURN jsonb_build_object('twin_id', p_twin, 'version', p_version, 'owner', t.owner_principal_id, 'citation', v_citation, 'complete', coalesce(p_complete, false),
                            'drafted', v_drafted, 'unchanged', v_unchanged, 'superseded', v_superseded);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.draft_agent_proposals(uuid,uuid,uuid,int,jsonb,boolean,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.draft_agent_proposals(uuid,uuid,uuid,int,jsonb,boolean,uuid,uuid,uuid,uuid) TO eye_commit;

/* THE DECISION (twin.proposal.decide): the twin's OWNER accepts or dismisses an open finding (a dismissal states its reason). */
CREATE OR REPLACE FUNCTION twin.decide_agent_proposal(
  p_proposal_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p twin.agent_proposals%ROWTYPE; v_owner uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.proposal.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'twin proposal rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM twin.agent_proposals x WHERE x.proposal_id = p_proposal_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'twin proposal rejected: no such proposal % in this domain', p_proposal_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = p.twin_id;
  IF v_owner IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'twin proposal rejected (ownership): the finding on twin % is decided by the twin''s owner', p.twin_id USING ERRCODE = '42501';
  END IF;
  IF p.state <> 'proposed' THEN RAISE EXCEPTION 'twin proposal rejected (state): proposal % is %, not proposed', p_proposal_id, p.state USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'dismissed') THEN RAISE EXCEPTION 'twin proposal rejected: a decision is accepted or dismissed' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'dismissed' AND coalesce(length(btrim(p_note)), 0) < 8 THEN
    RAISE EXCEPTION 'twin proposal rejected: a dismissed finding states its reason (at least 8 characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE twin.agent_proposals SET state = p_decision, decided_by = p_actor, decided_at = clock_timestamp(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
   WHERE proposal_id = p_proposal_id;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p.twin_id, 'proposal.decided', p_actor,
          jsonb_build_object('proposal_id', p_proposal_id, 'finding_kind', p.finding_kind, 'subject', p.subject, 'decision', p_decision, 'note', nullif(btrim(coalesce(p_note, '')), ''),
                             'version', p.version_citation, 'measure_digest', p.measure_digest), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal_id, 'state', p_decision, 'twin_id', p.twin_id, 'finding_kind', p.finding_kind, 'subject', p.subject);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.decide_agent_proposal(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.decide_agent_proposal(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- B.4 THE AGENT'S BOUNDARY AT THE PORT
-- ============================================================
/* An AGENT principal never declares a twin nor opens, grounds or admits a version — whatever bound action its session holds and whichever
   port it reaches (each records its act here). Held where they all meet, as §A holds the upstream owner's boundary. */
CREATE OR REPLACE FUNCTION twin.agent_write_boundary() RETURNS trigger
SECURITY DEFINER SET search_path = twin, identity, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.event NOT IN ('twin.declared', 'version.opened', 'element.grounded', 'version.admitted') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = NEW.actor_principal_id AND p.kind = 'agent') THEN
    RAISE EXCEPTION 'twin write rejected (agent): principal % is an agent; an agent proposes to the twin''s owner and never declares, opens, grounds or admits a twin (% refused)',
      NEW.actor_principal_id, NEW.event USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER twe_agent_write_boundary BEFORE INSERT ON twin.twin_events
  FOR EACH ROW EXECUTE FUNCTION twin.agent_write_boundary();

-- ═════════════════════════════════════════════════════════════════════════════════════
-- §I THE INTEGRATOR ───────────────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════════════════════
-- No SQL of its own. Recorded here:
--   * §D.4 simulation.issue_constraint_gate_capability REVIEWED: the scheduler's minter pattern (0039 observation.issue_schedule_capability —
--     the same `schedule` machine mode ctx.build already knows, eye_commit only, a reason, a bounded ttl) NARROWED to one tenant and domain
--     and one bound action (simulation.constraint.gate): the gate reads a domain's constraint sets outside any person's write; a set write
--     under it is refused by the ports (the §D harness). The ctx schema is called, not changed.
--   * The redefinitions, one owner each: twin.open_version and twin.ground_element (§A, from 0035, + the twin.coupling.apply action);
--     simulation.open_run (§C, from 0086's live body); executive.register_agent and executive.open_agent_run (§B, from 0089).
--   * The family check at GROUNDING also runs on the series path (twin.service.ts groundFromSeries, the integrator's TS change).
