-- 0089 — CP-6 B32 (2026-09-28): THE STRATEGY GRAPH'S CAPABILITIES, INITIATIVES, RESOURCES, MEASURES AND STAKEHOLDERS WITH ALIGNMENT; RISK AND
-- OPPORTUNITY INTELLIGENCE; THE DECOMPOSABLE STRATEGIC HEALTH SCORE.
--
-- One migration in five sections, the prelude written first by the integrator, the three parts built and proven on their own in parallel
-- worktrees (their harnesses phase6-{graph,exposures,health}-b32), then combined here — no function is re-declared by two sections:
--   §0  the prelude: SIX STRATEGY TYPES (CAP capability, INI initiative, RSC resource, MSR measure, STK stakeholder, RSK risk/opportunity)
--       widened everywhere the five are listed (the CHECKs, the dependency trigger, the canonical write action, the schema registry,
--       graph.expected_strategy, graph.rebuild_projection — which keeps an owner transfer), the event strategy.owner_assigned, the roles
--       risk_owner, opportunity_sponsor, risk_agent, opportunity_agent, and THE HEALTH INPUT CONTRACT (the indicator branch)
--   §R  (exposures, F-P4-13) RISK AND OPPORTUNITY INTELLIGENCE: the taxonomy and appetite, the register (versions, drivers, controls,
--       residuals, correlations, aggregation without double counting, hypotheses, responses), the owner's acceptance and the sponsor's
--       sponsorship (human gates), the Risk and Opportunity Agents (estimate only), the warning origin `exposure`, the priority, the health branch
--   §G  (graph, F-P6-09) ALIGNMENT: typed alignments mirrored into the dependencies, measures with observations and freshness, the gap view,
--       detections with declared continuity (conflict, stale measure, cycle, missing owner), the human authority's acts, owner transfer,
--       graph.record_impact recording the new types, the health branch
--   §H  (health, F-P6-08) THE DECOMPOSABLE STRATEGIC HEALTH SCORE: two-person-approved definitions, the pure composition (missing and
--       stale declared, a critical component never averaged away, an indeterminate aggregate NULL), snapshots, changes with acknowledge /
--       challenge / decide under separation, anti-gaming flags, baseline comparison (peer declared absent)
--   §I  the integrator: the health input contract complete (the UNION of the three branches)
-- The interface register stays 50/0/0 (B32 adds no interface). Forward-only; nothing earlier is edited.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0089 §0 — CP-6 B32 PRELUDE (the integrator, 2026-09-28): the shared vocabulary the three B32 parts build on, written FIRST so no two
-- parts re-declare the same object. F-P6-09 (the Strategy Graph's capabilities, initiatives, resources, measures, stakeholders and
-- alignment), F-P4-13 (risk and opportunity intelligence) and F-P6-08 (the decomposable Strategic Health Score).
--
--   * SIX NEW STRATEGY TYPES, widened everywhere the five are listed (the type CHECK, the dependency CHECK and its trigger, the canonical
--     write action, the schema registry, the projection derivation graph.expected_strategy and the rebuild graph.rebuild_projection):
--       CAP capability · INI initiative · RSC resource (RES is taken: resolutions) · MSR measure · STK stakeholder · RSK risk/opportunity
--       (an exposure; `polarity` risk|opportunity on its payload). No new type is ever coded ASU: 0088 §R's assumption reach is unchanged.
--   * the strategy event `strategy.owner_assigned` (an owner transfer — the graph part's port);
--   * the roles risk_owner, opportunity_sponsor, risk_agent, opportunity_agent;
--   * THE HEALTH INPUT CONTRACT executive.health_measure_inputs(tenant, domain, at): the one read the Strategic Health Score composes from.
--     This section returns the INDICATOR branch (buildable now). The graph part provides graph.health_inputs(tenant, domain, at) (measures)
--     and the exposure part prediction.health_inputs(tenant, domain, at) (risks and opportunities) with EXACTLY this RETURNS TABLE; the
--     integrator's §I re-declares executive.health_measure_inputs as the UNION of the three. Nothing is imputed: a NULL is "no input".
--
-- NOT HERE (stated): every part's own tables, ports, routes and pages; the impact-walk buckets for the new types (the graph part's); a
-- warning origin for exposures (the exposure part's); the interface register (unchanged, 50/0/0).

INSERT INTO identity.roles (code, scope, description) VALUES
  ('risk_owner', 'DOMAIN', 'The owner of a risk or opportunity (B32): accepts its assessment, residual exposure and appetite decisions — a named human'),
  ('opportunity_sponsor', 'DOMAIN', 'The sponsor of an opportunity (B32): sponsors its evaluation — a named human'),
  ('risk_agent', 'DOMAIN', 'The Risk Agent (B32): estimates and recommends only — never accepts an assessment'),
  ('opportunity_agent', 'DOMAIN', 'The Opportunity Agent (B32): estimates and recommends only — never sponsors')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE graph.strategy_current DROP CONSTRAINT strategy_current_object_type_check;
ALTER TABLE graph.strategy_current ADD CONSTRAINT strategy_current_object_type_check
  CHECK (object_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT', /* B32 (0089) */ 'CAP', 'INI', 'RSC', 'MSR', 'STK', 'RSK'));
ALTER TABLE graph.strategy_events DROP CONSTRAINT strategy_events_event_check;
ALTER TABLE graph.strategy_events ADD CONSTRAINT strategy_events_event_check CHECK (event IN (
  'strategy.declared', 'strategy.linked', 'strategy.unlinked',
  'assumption.verified', 'assumption.unverified', 'assumption.invalidated',
  'strategy.closed', 'strategy.withdrawn',
  -- B32 (0089)
  'strategy.owner_assigned'));
ALTER TABLE graph.dependencies DROP CONSTRAINT dependencies_dependent_type_check;
ALTER TABLE graph.dependencies ADD CONSTRAINT dependencies_dependent_type_check
  CHECK (dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT', 'FCT', 'SCN', 'WRN', 'TWN', 'SIM', 'BRF', 'MEM', /* B32 (0089) */ 'CAP', 'INI', 'RSC', 'MSR', 'STK', 'RSK'));
-- 0066's body (the latest), the strategy branch widened
CREATE OR REPLACE FUNCTION graph.dependency_dependent_exists() RETURNS trigger
SET search_path = graph, prediction, twin, simulation, executive, memory, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT', /* B32 (0089) */ 'CAP', 'INI', 'RSC', 'MSR', 'STK', 'RSK') THEN
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
    IF NOT EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.run_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: SIM % is not a simulation run', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'BRF' THEN
    IF NOT EXISTS (SELECT 1 FROM executive.briefings b WHERE b.briefing_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: BRF % is not a briefing', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.dependent_type = 'MEM' THEN
    IF NOT EXISTS (SELECT 1 FROM memory.items_current m WHERE m.item_id = NEW.dependent_object_id) THEN
      RAISE EXCEPTION 'dependency rejected: MEM % is not a memory item', NEW.dependent_object_id USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

UPDATE observation.canonical_write_actions
   SET object_types = ARRAY['OBJ','ASU','DEC','CMT','OUT','CAP','INI','RSC','MSR','STK','RSK'],
       rationale = 'Strategy Graph declaration admits objectives, assumptions, decisions, commitments, outcomes and (B32) capabilities, initiatives, resources, measures, stakeholders and risks/opportunities, and nothing else'
 WHERE action = 'graph.strategy.declare';

-- The six new types share the strategy body (0024) with the kind enum widened and an optional `polarity` (risk|opportunity) for RSK.
DO $$
DECLARE
  v_strategy_schema jsonb := '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["strategy_kind","title","statement","status","rests_on"],
  "properties": {
    "strategy_kind": { "enum": ["objective","assumption","decision","commitment","outcome","capability","initiative","resource","measure","stakeholder","exposure"] },
    "polarity": { "enum": ["risk","opportunity"] },
    "title": { "type": "string", "minLength": 2, "maxLength": 256 },
    "statement": { "type": "string", "minLength": 2, "maxLength": 4096 },
    "status": { "enum": ["active","closed","withdrawn"] },
    "horizon": { "type": ["string","null"] },
    "owner": { "type": ["string","null"] },
    "parent_objective_id": { "type": ["string","null"] },
    "verification": {
      "type": "object",
      "additionalProperties": false,
      "required": ["state"],
      "properties": {
        "state": { "enum": ["verified","unverified","invalidated","not_applicable"] },
        "reason": { "type": ["string","null"] },
        "at": { "type": ["string","null"] }
      }
    },
    "rests_on": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind","id","rationale"],
        "properties": {
          "kind": { "enum": ["claim","entity","edge","strategy"] },
          "id": { "type": "string" },
          "rationale": { "type": "string", "minLength": 8 }
        }
      }
    },
    "metrics": { "type": "object" }
  }
}'::jsonb;
BEGIN
  INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
    ('CAP', 'v1', v_strategy_schema, 'backward'), ('INI', 'v1', v_strategy_schema, 'backward'), ('RSC', 'v1', v_strategy_schema, 'backward'),
    ('MSR', 'v1', v_strategy_schema, 'backward'), ('STK', 'v1', v_strategy_schema, 'backward'), ('RSK', 'v1', v_strategy_schema, 'backward');
END $$;

-- 0080's projection derivation, the canonical types widened (a new-type row is derivable from its canonical object, as the five are)
CREATE OR REPLACE FUNCTION graph.expected_strategy(p_tenant uuid, p_domain uuid)
RETURNS TABLE (strategy_object_id uuid, tenant_id uuid, domain_id uuid, state text, object_type text, title text, object_version bigint, status text,
               verification_reason text, verified_at timestamptz, declared_at timestamptz, declared_by uuid, correlation_id uuid, last_event text, last_event_at timestamptz, row_derivable boolean)
LANGUAGE sql STABLE AS $$
  WITH last_state AS (
    SELECT DISTINCT ON (e.strategy_object_id) e.strategy_object_id, e.tenant_id, e.domain_id, e.event, e.occurred_at, e.actor_principal_id, e.details
      FROM graph.strategy_events e
     WHERE e.event IN ('strategy.declared', 'assumption.verified', 'assumption.unverified', 'assumption.invalidated')
       AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.strategy_object_id, e.occurred_at DESC, e.event_id DESC
  ), declared AS (
    SELECT DISTINCT ON (e.strategy_object_id) e.strategy_object_id, e.occurred_at, e.actor_principal_id, e.correlation_id, e.details
      FROM graph.strategy_events e
     WHERE e.event = 'strategy.declared' AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.strategy_object_id, e.occurred_at DESC, e.event_id DESC     -- the latest declaration: a re-declared version (0024:1177-1181 ON CONFLICT DO UPDATE)
  )
  SELECT ls.strategy_object_id, ls.tenant_id, ls.domain_id,
         CASE ls.event WHEN 'assumption.verified' THEN 'verified' WHEN 'assumption.unverified' THEN 'unverified' WHEN 'assumption.invalidated' THEN 'invalidated' ELSE NULL END,
         d.details ->> 'object_type', d.details ->> 'title', (d.details ->> 'version')::bigint, d.details ->> 'status',
         CASE WHEN ls.event <> 'strategy.declared' THEN ls.details ->> 'reason' END,
         CASE WHEN ls.event <> 'strategy.declared' THEN ls.occurred_at END,
         d.occurred_at, d.actor_principal_id, d.correlation_id, ls.event, ls.occurred_at,
         EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = ls.strategy_object_id AND o.object_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT', /* B32 (0089) */ 'CAP', 'INI', 'RSC', 'MSR', 'STK', 'RSK'))   -- the canonical object carries the row (strategy.service.ts:126-142)
    FROM last_state ls
    LEFT JOIN declared d ON d.strategy_object_id = ls.strategy_object_id
$$;

-- invalidation.opened details: trigger_kind, trigger_object_id, correction_case_id (0027:80-91). An ASSESSED row's affected lists are
-- not in its log (0065:1246-1262 carries counts): only an OPEN row is derivable.

-- 0080's rebuild (declared there only), the canonical types widened in its strategy re-insert — nothing else changes
CREATE OR REPLACE FUNCTION graph.rebuild_projection(
  p_rebuild_id uuid, p_tenant uuid, p_domain uuid, p_projection text, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, memory, objects, intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE part graph.projection_partitions%ROWTYPE; v_updated int := 0; v_inserted int := 0; v_removed int := 0; v_n int; v_ids jsonb;
        v_restored jsonb := '[]'::jsonb; v_unrebuildable jsonb := '[]'::jsonb; v_referenced jsonb := '[]'::jsonb; v_dangling jsonb := '[]'::jsonb;
        v_check jsonb; v_refusal text; v_event text; v_report jsonb;
        v_now timestamptz := clock_timestamp(); v_current text := graph.projection_representation_version();
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.projection.rebuild']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'projection rebuild rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_projection IS NULL OR p_projection NOT IN ('entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current') THEN
    RAISE EXCEPTION 'projection rebuild rejected: % is not a projection of this domain (one of entities_current, resolutions_current, edges_current, strategy_current, invalidations_current, memory_items_current)', coalesce(p_projection, '<none>') USING ERRCODE = '23503';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'projection rebuild rejected: a rebuild states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.projection.rebuild:' || p_domain::text || ':' || p_projection, 0));
  INSERT INTO graph.projection_partitions (tenant_id, domain_id, projection) VALUES (p_tenant, p_domain, p_projection) ON CONFLICT DO NOTHING;
  SELECT * INTO part FROM graph.projection_partitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.projection = p_projection FOR UPDATE;
  IF part.state <> 'withdrawn' THEN
    RAISE EXCEPTION 'projection rebuild rejected: the % partition of this domain is serving; withdraw it first (graph.projection.withdraw) or let the retrieval check withdraw it', p_projection USING ERRCODE = '22023';
  END IF;

  -- (1) A POISONED ROW THAT IS HELD — refused before anything is written; a person decides. Each holder is CLASSIFIED: derived (the log derives it;
  --     a person decides) or poisoned (itself an unexpected row of ITS partition — rebuild that partition first, which removes it). Beyond the
  --     foreign keys, the rows that would DANGLE after a removal are NAMED in the report, never refused on (no constraint holds them):
  --     graph.dependencies (depends_on_kind entity | edge | strategy; a dependent strategy object) and the prediction rows whose
  --     subject_entity_id names the entity; a twin's boundary (a JSON list in the twin version) is not consulted — stated in §9.
  --     The per-holder EXISTS over graph.expected_* runs once per holder of a poisoned row — rare rows; acceptable.
  IF p_projection = 'entities_current' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.entity_id, 'canonical_name', q.canonical_name, 'referenced_by', q.refs,
                                                 'held_by_derived', (SELECT count(*) FROM jsonb_array_elements(q.refs) x WHERE (x ->> 'derived')::boolean),
                                                 'held_by_poisoned', (SELECT count(*) FROM jsonb_array_elements(q.refs) x WHERE NOT (x ->> 'derived')::boolean))), '[]'::jsonb) INTO v_referenced
      FROM (SELECT l.entity_id, l.canonical_name,
                   coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'edge', 'id', x.edge_id, 'state', x.state, 'derived', EXISTS (SELECT 1 FROM graph.expected_edges(p_tenant, p_domain) e WHERE e.edge_id = x.edge_id)))
                               FROM graph.edges_current x WHERE x.subject_entity_id = l.entity_id OR x.object_entity_id = l.entity_id), '[]'::jsonb)
                   || coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'resolution', 'id', x.resolution_id, 'state', x.state, 'derived', EXISTS (SELECT 1 FROM graph.expected_resolutions(p_tenant, p_domain) e WHERE e.resolution_id = x.resolution_id)))
                               FROM graph.resolutions_current x WHERE x.entity_id = l.entity_id), '[]'::jsonb)
                   || coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'identifier', 'id', x.identifier_id, 'derived', true))
                               FROM graph.entity_identifiers x WHERE x.entity_id = l.entity_id), '[]'::jsonb) AS refs
              FROM graph.entities_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id)) q
     WHERE jsonb_array_length(q.refs) > 0;
    IF jsonb_array_length(v_referenced) > 0 THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_referenced) r WHERE (r ->> 'held_by_derived')::int > 0) THEN
        v_refusal := format('projection rebuild refused: %s poisoned entity row(s) of this domain are held by rows the log derives (an edge, a resolution or an identifier) and cannot be removed — a person decides them; nothing was written', jsonb_array_length(v_referenced))
                     || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_referenced) r WHERE (r ->> 'held_by_poisoned')::int > 0) THEN '; some holders are themselves unexpected rows — rebuild edges_current / resolutions_current first' ELSE '' END;
      ELSE
        v_refusal := format('projection rebuild refused: %s poisoned entity row(s) of this domain are held only by rows the log does not know either (unexpected edges or resolutions) — rebuild edges_current / resolutions_current first, which removes them; nothing was written', jsonb_array_length(v_referenced));
      END IF;
    END IF;
  ELSIF p_projection = 'strategy_current' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.strategy_object_id, 'title', q.title, 'referenced_by', q.refs, 'held_by_derived', jsonb_array_length(q.refs), 'held_by_poisoned', 0)), '[]'::jsonb) INTO v_referenced
      FROM (SELECT l.strategy_object_id, l.title,
                   coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'package', 'id', x.package_id, 'state', x.state, 'derived', true)) FROM decision.packages_current x WHERE x.decision_object_id = l.strategy_object_id), '[]'::jsonb) AS refs
              FROM graph.strategy_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_strategy(p_tenant, p_domain) e WHERE e.strategy_object_id = l.strategy_object_id)) q
     WHERE jsonb_array_length(q.refs) > 0;
    IF jsonb_array_length(v_referenced) > 0 THEN
      v_refusal := format('projection rebuild refused: %s poisoned strategy row(s) of this domain are cited by decision packages and cannot be removed — a person decides them; nothing was written', jsonb_array_length(v_referenced));
    END IF;
  END IF;
  -- THE REFERENCES THAT DANGLE after the removal of the unexpected rows (named; the removal proceeds): cut at 200 in the report.
  IF p_projection IN ('entities_current', 'edges_current', 'strategy_current') THEN
    SELECT coalesce(jsonb_agg(q.x), '[]'::jsonb) INTO v_dangling FROM (
      SELECT jsonb_build_object('kind', 'dependency', 'id', d.dependency_id, 'dependent', d.dependent_object_id, 'depends_on_kind', d.depends_on_kind, 'depends_on', d.depends_on_id, 'state', d.state) AS x
        FROM graph.dependencies d
       WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active'
         AND ((p_projection = 'entities_current' AND d.depends_on_kind = 'entity' AND EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = d.depends_on_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id)))
           OR (p_projection = 'edges_current' AND d.depends_on_kind = 'edge' AND EXISTS (SELECT 1 FROM graph.edges_current l WHERE l.edge_id = d.depends_on_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_edges(p_tenant, p_domain) e WHERE e.edge_id = l.edge_id)))
           OR (p_projection = 'strategy_current' AND EXISTS (SELECT 1 FROM graph.strategy_current l WHERE (l.strategy_object_id = d.dependent_object_id OR (d.depends_on_kind = 'strategy' AND l.strategy_object_id = d.depends_on_id)) AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_strategy(p_tenant, p_domain) e WHERE e.strategy_object_id = l.strategy_object_id))))
      UNION ALL
      SELECT jsonb_build_object('kind', 'series', 'id', s.series_key, 'subject_entity_id', s.subject_entity_id)
        FROM prediction.series_registry s
       WHERE p_projection = 'entities_current' AND s.tenant_id = p_tenant AND s.domain_id = p_domain
         AND EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = s.subject_entity_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id))
      UNION ALL
      SELECT jsonb_build_object('kind', 'forecast', 'id', f.forecast_id, 'subject_entity_id', f.subject_entity_id)
        FROM prediction.forecasts_current f
       WHERE p_projection = 'entities_current' AND f.tenant_id = p_tenant AND f.domain_id = p_domain
         AND EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = f.subject_entity_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id))
      UNION ALL
      SELECT jsonb_build_object('kind', 'scenario', 'id', c.scenario_id, 'subject_entity_id', c.subject_entity_id)
        FROM prediction.scenarios_current c
       WHERE p_projection = 'entities_current' AND c.tenant_id = p_tenant AND c.domain_id = p_domain
         AND EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = c.subject_entity_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id))
    ) q;
  END IF;

  -- (2) THE WRITES, then the check — in ONE subtransaction; a failure of either rolls back both and is recorded as the refusal.
  IF v_refusal IS NULL THEN
    BEGIN
      CASE p_projection
        WHEN 'entities_current' THEN
          WITH x AS (
            UPDATE graph.entities_current l
               SET lifecycle_state = e.state, superseded_by = CASE WHEN e.state = 'superseded' THEN coalesce(e.superseded_by, l.superseded_by) ELSE l.superseded_by END, updated_at = v_now
              FROM graph.expected_entities(p_tenant, p_domain) e
             WHERE l.entity_id = e.entity_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.lifecycle_state IS DISTINCT FROM e.state
             RETURNING l.entity_id AS id, e.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.entity_id, 'reason', 'the entity.created event carries no entity_type, canonical_name or normalized_name (or the superseded event names no successor); the row is not derivable')), '[]'::jsonb) INTO v_ids
            FROM graph.expected_entities(p_tenant, p_domain) e WHERE NOT e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = e.entity_id);
          v_unrebuildable := v_unrebuildable || v_ids;
          -- created_by and correlation_id are the creation event's; updated_at is max(occurred_at) over ALL the entity's events (N2)
          WITH ins AS (
            INSERT INTO graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, split_from, superseded_by, created_at, updated_at, created_by, correlation_id)
            SELECT e.entity_id, 'DOMAIN', e.tenant_id, e.domain_id, e.entity_type, e.canonical_name, e.normalized_name, e.state, e.split_from, e.superseded_by, e.created_at, coalesce(e.updated_at, e.created_at), e.created_by, e.correlation_id
              FROM graph.expected_entities(p_tenant, p_domain) e
             WHERE e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = e.entity_id)
            RETURNING entity_id AS id, lifecycle_state AS state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', ins.id, 'change', 'inserted', 'to', ins.state)), '[]'::jsonb) INTO v_n, v_ids FROM ins;
          v_inserted := v_n; v_restored := v_restored || v_ids;
          WITH del AS (
            DELETE FROM graph.entities_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id)
            RETURNING l.entity_id AS id, l.lifecycle_state AS state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;

        WHEN 'resolutions_current' THEN
          WITH x AS (
            UPDATE graph.resolutions_current l
               SET state = e.state,
                   accepted_at = CASE WHEN e.state = 'accepted' THEN coalesce(l.accepted_at, e.last_event_at) ELSE NULL END,
                   decided_by = CASE WHEN e.last_event IN ('resolution.accepted', 'resolution.rejected') THEN e.last_actor WHEN e.state = 'proposed' THEN NULL ELSE l.decided_by END,
                   decided_at = CASE WHEN e.last_event IN ('resolution.accepted', 'resolution.rejected') THEN e.last_event_at WHEN e.state = 'proposed' THEN NULL ELSE l.decided_at END,
                   decision_reason = CASE WHEN e.last_event IN ('resolution.accepted', 'resolution.rejected') THEN coalesce(e.last_details ->> 'reason', l.decision_reason) WHEN e.state = 'proposed' THEN NULL ELSE l.decision_reason END,
                   superseded_by = CASE WHEN e.state = 'superseded' THEN coalesce((e.last_details ->> 'successor')::uuid, l.superseded_by) ELSE NULL END,
                   superseded_at = CASE WHEN e.state = 'superseded' THEN coalesce(l.superseded_at, e.last_event_at) ELSE NULL END
              FROM graph.expected_resolutions(p_tenant, p_domain) e
             WHERE l.resolution_id = e.resolution_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.state IS DISTINCT FROM e.state
             RETURNING l.resolution_id AS id, e.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.resolution_id, 'reason', 'the resolution log carries neither the mention, the claim, the evidence nor the method of a resolution; the row is the proposer''s record and is not derivable')), '[]'::jsonb) INTO v_ids
            FROM graph.expected_resolutions(p_tenant, p_domain) e WHERE NOT EXISTS (SELECT 1 FROM graph.resolutions_current l WHERE l.resolution_id = e.resolution_id);
          v_unrebuildable := v_unrebuildable || v_ids;
          WITH del AS (
            DELETE FROM graph.resolutions_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_resolutions(p_tenant, p_domain) e WHERE e.resolution_id = l.resolution_id)
            RETURNING l.resolution_id AS id, l.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;

        WHEN 'edges_current' THEN
          WITH x AS (
            UPDATE graph.edges_current l
               SET state = e.state,
                   retracted_at = CASE WHEN e.state = 'retracted' THEN coalesce(e.retracted_at, l.retracted_at) ELSE NULL END,
                   retracted_by = CASE WHEN e.state = 'retracted' THEN coalesce(e.retracted_by, l.retracted_by) ELSE NULL END,
                   retraction_reason = CASE WHEN e.state = 'retracted' THEN coalesce(e.retraction_reason, l.retraction_reason) ELSE NULL END,
                   superseded_by = CASE WHEN e.state = 'superseded' THEN coalesce(e.superseded_by, l.superseded_by) ELSE NULL END,
                   superseded_at = CASE WHEN e.state = 'superseded' THEN coalesce(e.superseded_at, l.superseded_at) ELSE NULL END
              FROM graph.expected_edges(p_tenant, p_domain) e
             WHERE l.edge_id = e.edge_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.state IS DISTINCT FROM e.state
             RETURNING l.edge_id AS id, e.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.edge_id, 'reason',
                   CASE WHEN m.reassessment_events > 0 THEN 'reassessment events exist on this edge; the reassessment record is not derivable from the state log'
                        WHEN NOT m.row_derivable THEN 'the edge.asserted event carries no full row (subject, predicate, object, valid_from, claim, mode)'
                        WHEN m.lineage_evidence IS NULL THEN format('no claim lineage row for claim %s@%s: the provenance columns (evidence, its digest, the method, the run, the confidence) cannot be derived', m.claim_object_id, m.claim_version)
                        ELSE 'both ends must be entities of this domain' END)), '[]'::jsonb) INTO v_ids
            FROM (SELECT e.*, l.evidence_object_id AS lineage_evidence
                    FROM graph.expected_edges(p_tenant, p_domain) e
                    LEFT JOIN intelligence.claim_lineage l ON l.claim_object_id = e.claim_object_id AND l.claim_version = e.claim_version
                   WHERE NOT EXISTS (SELECT 1 FROM graph.edges_current x WHERE x.edge_id = e.edge_id)) m
           WHERE m.reassessment_events > 0 OR NOT m.row_derivable OR m.lineage_evidence IS NULL
              OR NOT EXISTS (SELECT 1 FROM graph.entities_current s WHERE s.entity_id = m.subject_entity_id) OR NOT EXISTS (SELECT 1 FROM graph.entities_current o WHERE o.entity_id = m.object_entity_id);
          v_unrebuildable := v_unrebuildable || v_ids;
          -- the provenance columns the log lacks come from the claim's lineage row (one per (claim, version) — its primary key)
          WITH ins AS (
            INSERT INTO graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, asserted_at, retracted_at, state, claim_object_id, claim_version,
                                             evidence_object_id, evidence_digest, method_id, run_id, mode, confidence, asserted_by, retracted_by, retraction_reason, superseded_by, superseded_at, correlation_id)
            SELECT e.edge_id, 'DOMAIN', e.tenant_id, e.domain_id, e.subject_entity_id, e.predicate, e.object_entity_id, e.valid_from, e.valid_to, e.asserted_at, e.retracted_at, e.state, e.claim_object_id, e.claim_version,
                   l.evidence_object_id, l.evidence_digest, l.method_id, l.run_id, e.mode, l.confidence, e.asserted_by, e.retracted_by, e.retraction_reason, e.superseded_by, e.superseded_at, e.correlation_id
              FROM graph.expected_edges(p_tenant, p_domain) e
              JOIN intelligence.claim_lineage l ON l.claim_object_id = e.claim_object_id AND l.claim_version = e.claim_version
             WHERE e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.edges_current x WHERE x.edge_id = e.edge_id)
               AND EXISTS (SELECT 1 FROM graph.entities_current s WHERE s.entity_id = e.subject_entity_id) AND EXISTS (SELECT 1 FROM graph.entities_current o WHERE o.entity_id = e.object_entity_id)
            RETURNING edge_id AS id, state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', ins.id, 'change', 'inserted', 'to', ins.state)), '[]'::jsonb) INTO v_n, v_ids FROM ins;
          v_inserted := v_n; v_restored := v_restored || v_ids;
          WITH del AS (
            DELETE FROM graph.edges_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_edges(p_tenant, p_domain) e WHERE e.edge_id = l.edge_id)
            RETURNING l.edge_id AS id, l.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;

        WHEN 'strategy_current' THEN
          WITH x AS (
            UPDATE graph.strategy_current l
               SET verification_state = e.state, verification_reason = coalesce(e.verification_reason, l.verification_reason), verified_at = coalesce(e.verified_at, l.verified_at), updated_at = v_now
              FROM graph.expected_strategy(p_tenant, p_domain) e
             WHERE l.strategy_object_id = e.strategy_object_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.object_type = 'ASU' AND e.state IS NOT NULL AND l.verification_state IS DISTINCT FROM e.state
             RETURNING l.strategy_object_id AS id, e.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.strategy_object_id, 'reason', 'no canonical strategy object carries this strategy row; it is not derivable')), '[]'::jsonb) INTO v_ids
            FROM graph.expected_strategy(p_tenant, p_domain) e WHERE NOT e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.strategy_current l WHERE l.strategy_object_id = e.strategy_object_id);
          v_unrebuildable := v_unrebuildable || v_ids;
          -- the canonical object's latest version carries the row (strategy.service.ts:126-142: title, statement, status, parent_objective_id, verification.state)
          WITH ins AS (
            INSERT INTO graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, verification_reason, verified_at, parent_objective_id, owner_principal_id, declared_at, updated_at, correlation_id)
            SELECT e.strategy_object_id, 'DOMAIN', e.tenant_id, e.domain_id, o.object_type, o.object_version, o.payload ->> 'title', o.payload ->> 'statement', o.payload ->> 'status',
                   CASE WHEN o.object_type = 'ASU' THEN coalesce(e.state, o.payload #>> '{verification,state}', 'unverified') ELSE 'not_applicable' END, e.verification_reason, e.verified_at,
                   (o.payload ->> 'parent_objective_id')::uuid,
                   -- B32 (0089): an owner transfer (strategy.owner_assigned, the graph part's port) is not on the canonical object; the latest one wins
                   coalesce((SELECT (ev.details ->> 'to')::uuid FROM graph.strategy_events ev
                              WHERE ev.strategy_object_id = e.strategy_object_id AND ev.tenant_id = e.tenant_id AND ev.event = 'strategy.owner_assigned'
                              ORDER BY ev.occurred_at DESC, ev.event_id DESC LIMIT 1),
                            CASE WHEN o.accountable_owner ~ '^principal:[0-9a-f-]{36}$' THEN substr(o.accountable_owner, 11)::uuid END, e.declared_by),
                   coalesce(e.declared_at, o.recorded_at), v_now, coalesce(e.correlation_id, o.audit_correlation_id)
              FROM graph.expected_strategy(p_tenant, p_domain) e
              JOIN LATERAL (SELECT c.* FROM objects.canonical_objects c WHERE c.object_id = e.strategy_object_id AND c.object_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT', /* B32 (0089) */ 'CAP', 'INI', 'RSC', 'MSR', 'STK', 'RSK') ORDER BY c.object_version DESC LIMIT 1) o ON true
             WHERE e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.strategy_current l WHERE l.strategy_object_id = e.strategy_object_id)
            RETURNING strategy_object_id AS id, verification_state AS state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', ins.id, 'change', 'inserted', 'to', ins.state)), '[]'::jsonb) INTO v_n, v_ids FROM ins;
          v_inserted := v_n; v_restored := v_restored || v_ids;
          WITH del AS (
            DELETE FROM graph.strategy_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_strategy(p_tenant, p_domain) e WHERE e.strategy_object_id = l.strategy_object_id)
            RETURNING l.strategy_object_id AS id, l.verification_state AS state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;

        WHEN 'invalidations_current' THEN
          WITH x AS (
            UPDATE graph.invalidations_current l
               SET state = e.state, assessed_at = CASE WHEN e.state IN ('assessed', 'closed') THEN coalesce(l.assessed_at, e.last_event_at) ELSE NULL END
              FROM graph.expected_invalidations(p_tenant, p_domain) e
             WHERE l.invalidation_id = e.invalidation_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.state IS DISTINCT FROM e.state
             RETURNING l.invalidation_id AS id, e.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.invalidation_id, 'reason', CASE WHEN e.state = 'open' THEN 'the invalidation.opened event carries no trigger' ELSE 'an assessed invalidation''s affected lists are counts in its log; the assessment is the row itself and is not derivable' END)), '[]'::jsonb) INTO v_ids
            FROM graph.expected_invalidations(p_tenant, p_domain) e WHERE NOT e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.invalidations_current l WHERE l.invalidation_id = e.invalidation_id);
          v_unrebuildable := v_unrebuildable || v_ids;
          WITH ins AS (
            INSERT INTO graph.invalidations_current (invalidation_id, scope, tenant_id, domain_id, trigger_kind, trigger_object_id, correction_case_id, opened_at, opened_by, statement, state, correlation_id)
            SELECT e.invalidation_id, 'DOMAIN', e.tenant_id, e.domain_id, e.trigger_kind, e.trigger_object_id, e.correction_case_id, e.opened_at, e.opened_by, 'dependency walk opened; nothing has been assessed yet', 'open', e.correlation_id
              FROM graph.expected_invalidations(p_tenant, p_domain) e
             WHERE e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.invalidations_current l WHERE l.invalidation_id = e.invalidation_id)
            RETURNING invalidation_id AS id, state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', ins.id, 'change', 'inserted', 'to', ins.state)), '[]'::jsonb) INTO v_n, v_ids FROM ins;
          v_inserted := v_n; v_restored := v_restored || v_ids;
          WITH del AS (
            DELETE FROM graph.invalidations_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_invalidations(p_tenant, p_domain) e WHERE e.invalidation_id = l.invalidation_id)
            RETURNING l.invalidation_id AS id, l.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;

        WHEN 'memory_items_current' THEN
          -- a drifted item (state, version or a policy column — C6) is RE-PROJECTED from the canonical version its log names (the content
          -- columns follow that version — memory.record_item's own mapping, 0079:266-290; the policy columns are the §2 derivation's, the
          -- same values the check compared)
          WITH x AS (
            UPDATE memory.items_current l
               SET state = e.state, object_version = e.object_version,
                   record_class = o.payload ->> 'record_class', title = o.payload ->> 'title', statement = o.payload ->> 'statement',
                   source_kind = o.payload #>> '{source,kind}', source_ref = o.payload #>> '{source,ref}',
                   classification = e.classification, audience_roles = e.audience_roles, audience_purposes = e.audience_purposes,
                   valid_from = (o.payload #>> '{validity,from}')::timestamptz, valid_to = (o.payload #>> '{validity,to}')::timestamptz,
                   retention_profile = o.payload #>> '{retention,profile}', retain_until = (o.payload #>> '{retention,retain_until}')::timestamptz, retention_basis = o.payload #>> '{retention,basis}',
                   related_decision_id = (o.payload #>> '{related,decision_id}')::uuid, related_objective_id = (o.payload #>> '{related,objective_id}')::uuid,
                   derivation = o.payload -> 'derivation', superseded_versions = e.superseded_versions, last_superseded_at = e.last_superseded_at,
                   recorded_at = coalesce(e.recorded_at, l.recorded_at), recorded_by = coalesce(e.recorded_by, l.recorded_by)
              FROM memory.expected_items(p_tenant, p_domain) e
              JOIN objects.canonical_objects o ON o.object_id = e.item_id AND o.object_type = 'MEM' AND o.object_version = e.object_version
             WHERE l.item_id = e.item_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain
               AND (l.state IS DISTINCT FROM e.state OR l.object_version IS DISTINCT FROM e.object_version
                    OR l.classification IS DISTINCT FROM e.classification OR l.audience_roles IS DISTINCT FROM e.audience_roles OR l.audience_purposes IS DISTINCT FROM e.audience_purposes)
             RETURNING l.item_id AS id, e.state, e.object_version)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state || '@' || x.object_version::text)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          -- N4: a missing row OR a drifted row whose named version has no canonical record is named, never "refused with counts only"
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.item_id, 'reason', format('no canonical MEM version %s carries this item; the row is not derivable', e.object_version))), '[]'::jsonb) INTO v_ids
            FROM memory.expected_items(p_tenant, p_domain) e
           WHERE NOT e.row_derivable AND NOT EXISTS (SELECT 1 FROM memory.items_current l WHERE l.item_id = e.item_id AND l.state IS NOT DISTINCT FROM e.state AND l.object_version IS NOT DISTINCT FROM e.object_version);
          v_unrebuildable := v_unrebuildable || v_ids;
          WITH ins AS (
            INSERT INTO memory.items_current (item_id, scope, tenant_id, domain_id, object_version, record_class, title, statement, source_kind, source_ref, owner_principal_id, classification, audience_roles, audience_purposes,
                                              valid_from, valid_to, retention_profile, retain_until, retention_basis, related_decision_id, related_objective_id, state, attention_state, recorded_at, recorded_by, superseded_versions, last_superseded_at, correlation_id, derivation)
            SELECT e.item_id, 'DOMAIN', e.tenant_id, e.domain_id, e.object_version, o.payload ->> 'record_class', o.payload ->> 'title', o.payload ->> 'statement', o.payload #>> '{source,kind}', o.payload #>> '{source,ref}',
                   coalesce(e.owner_principal_id, e.recorded_by), e.classification, e.audience_roles, e.audience_purposes,
                   (o.payload #>> '{validity,from}')::timestamptz, (o.payload #>> '{validity,to}')::timestamptz, o.payload #>> '{retention,profile}', (o.payload #>> '{retention,retain_until}')::timestamptz, o.payload #>> '{retention,basis}',
                   (o.payload #>> '{related,decision_id}')::uuid, (o.payload #>> '{related,objective_id}')::uuid, e.state, e.attention_state, coalesce(e.recorded_at, o.recorded_at), coalesce(e.recorded_by, e.owner_principal_id),
                   e.superseded_versions, e.last_superseded_at, coalesce(e.first_correlation_id, o.audit_correlation_id), o.payload -> 'derivation'
              FROM memory.expected_items(p_tenant, p_domain) e
              JOIN objects.canonical_objects o ON o.object_id = e.item_id AND o.object_type = 'MEM' AND o.object_version = e.object_version
             WHERE e.row_derivable AND NOT EXISTS (SELECT 1 FROM memory.items_current l WHERE l.item_id = e.item_id)
            RETURNING item_id AS id, state, object_version)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', ins.id, 'change', 'inserted', 'to', ins.state || '@' || ins.object_version::text)), '[]'::jsonb) INTO v_n, v_ids FROM ins;
          v_inserted := v_n; v_restored := v_restored || v_ids;
          WITH del AS (
            DELETE FROM memory.items_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM memory.expected_items(p_tenant, p_domain) e WHERE e.item_id = l.item_id)
            RETURNING l.item_id AS id, l.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;
      END CASE;

      IF jsonb_array_length(v_unrebuildable) > 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0B20', MESSAGE = format('%s row(s) the log has cannot be written from what the log or the canonical record carries (named); nothing was written', jsonb_array_length(v_unrebuildable));
      END IF;
      -- the representation is the current rule's BEFORE the re-check (representation_ok is part of it); the inner check runs under the
      -- write's own context (eye_domain() = p_domain) and admits graph.projection.rebuild (§4)
      UPDATE graph.projection_partitions SET representation_version = v_current WHERE tenant_id = p_tenant AND domain_id = p_domain AND projection = p_projection;
      SELECT jsonb_build_object('live_rows', r.live_rows, 'rebuilt_rows', r.rebuilt_rows, 'mismatched', r.mismatched, 'missing', r.missing, 'unexpected', r.unexpected, 'representation_ok', r.representation_ok)
        INTO v_check FROM graph.rebuild_projections() r WHERE r.projection = p_projection;
      IF (v_check ->> 'mismatched')::int + (v_check ->> 'missing')::int + (v_check ->> 'unexpected')::int > 0 OR NOT (v_check ->> 'representation_ok')::boolean THEN
        RAISE EXCEPTION USING ERRCODE = 'P0B20', MESSAGE = format('the check after the rebuild still fails (mismatched %s, missing %s, unexpected %s, representation %s); nothing was written',
                                                                 v_check ->> 'mismatched', v_check ->> 'missing', v_check ->> 'unexpected', CASE WHEN (v_check ->> 'representation_ok')::boolean THEN 'ok' ELSE 'outdated' END);
      END IF;
    EXCEPTION
      WHEN SQLSTATE 'P0B20' THEN v_refusal := 'projection rebuild refused: ' || SQLERRM;
      WHEN check_violation OR foreign_key_violation OR not_null_violation OR unique_violation OR invalid_text_representation THEN
        v_refusal := format('projection rebuild refused: a rebuilt row of %s violates the projection''s own constraints (%s: %s); nothing was written', p_projection, SQLSTATE, left(SQLERRM, 300));
    END;
  END IF;

  IF v_refusal IS NOT NULL THEN
    INSERT INTO graph.projection_events (event_id, scope, tenant_id, domain_id, projection, event, actor_principal_id, details, correlation_id)
    VALUES (p_rebuild_id, 'DOMAIN', p_tenant, p_domain, p_projection, 'projection.rebuild_refused', p_actor,
            jsonb_build_object('reason', p_reason, 'refusal', v_refusal, 'unrebuildable', v_unrebuildable, 'referenced', v_referenced, 'dangling', v_dangling, 'check', v_check,
                               'attempted', jsonb_build_object('updated', v_updated, 'inserted', v_inserted, 'removed', v_removed), 'representation_version', part.representation_version), p_correlation);
    UPDATE graph.projection_partitions SET updated_at = v_now WHERE tenant_id = p_tenant AND domain_id = p_domain AND projection = p_projection;
    RETURN jsonb_build_object('outcome', 'refused', 'projection', p_projection, 'state', 'withdrawn', 'rebuild_id', p_rebuild_id, 'reason', p_reason, 'refusal', v_refusal,
                              'unrebuildable', v_unrebuildable, 'referenced', v_referenced, 'dangling', v_dangling, 'check', v_check, 'attempted', jsonb_build_object('updated', v_updated, 'inserted', v_inserted, 'removed', v_removed),
                              'withdrawn_since', part.withdrawn_at, 'withdrawn_reason', part.withdrawn_reason, 'representation_version', part.representation_version);
  END IF;

  v_event := CASE WHEN v_updated + v_inserted + v_removed > 0 THEN 'projection.rebuilt' ELSE 'projection.restored' END;
  UPDATE graph.projection_partitions
     SET state = 'serving', withdrawn_at = NULL, withdrawn_by = NULL, withdrawn_reason = NULL, withdrawn_by_check = NULL, representation_version = v_current,
         last_rebuild_id = p_rebuild_id, rebuilt_at = v_now, updated_at = v_now, correlation_id = p_correlation
   WHERE tenant_id = p_tenant AND domain_id = p_domain AND projection = p_projection;
  -- the restored and dangling lists are cut at 200 in the report (LIFECYCLE_EVENT_LIST_MAX — the event builder cuts the same list again); the ledger event keeps the WHOLE dangling list (C8)
  v_report := jsonb_build_object('outcome', CASE v_event WHEN 'projection.rebuilt' THEN 'rebuilt' ELSE 'restored' END, 'projection', p_projection, 'state', 'serving', 'rebuild_id', p_rebuild_id, 'reason', p_reason,
                                 'updated', v_updated, 'inserted', v_inserted, 'removed', v_removed,
                                 'restored', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(v_restored) x LIMIT 200) q),
                                 'restored_truncated', jsonb_array_length(v_restored) > 200,
                                 'dangling', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(v_dangling) x LIMIT 200) q),
                                 'dangling_truncated', jsonb_array_length(v_dangling) > 200,
                                 'check', v_check, 'representation_version', v_current,
                                 'withdrawn_since', part.withdrawn_at, 'withdrawn_reason', part.withdrawn_reason, 'withdrawn_by_check', part.withdrawn_by_check, 'rebuilt_at', v_now);
  INSERT INTO graph.projection_events (event_id, scope, tenant_id, domain_id, projection, event, actor_principal_id, details, correlation_id)
  VALUES (p_rebuild_id, 'DOMAIN', p_tenant, p_domain, p_projection, v_event, p_actor, v_report || jsonb_build_object('dangling', v_dangling, 'dangling_truncated', false), p_correlation);
  RETURN v_report;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.rebuild_projection(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.rebuild_projection(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- THE HEALTH INPUT CONTRACT — the indicator branch. Columns (the contract the graph and exposure parts' branches match exactly):
--   input_kind 'indicator'|'measure'|'risk'|'opportunity'; input_id; input_version; label; value; unit; direction 'higher_better'|'lower_better';
--   observed_at; expected_every_days (NULL = no cadence declared); confidence (NULL = no input); evidence [{object_id, version}];
--   objective_ids; exposure {kind, id, amount, unit, basis} | NULL; basis (in words).
CREATE OR REPLACE FUNCTION executive.health_measure_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  SELECT 'indicator'::text, i.indicator_id, NULL::bigint, i.description, ev.value, NULL::text,
         CASE WHEN i.comparator IN ('<', '<=') THEN 'higher_better' ELSE 'lower_better' END,
         ev.observation_at::timestamptz, NULL::numeric, NULL::numeric,
         CASE WHEN ev.evidence_object_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('object_id', ev.evidence_object_id, 'version', ev.evidence_version)) END,
         '{}'::uuid[], NULL::jsonb,
         format('indicator %s on series %s, its latest evaluation at or before the instant (no cadence declared on the indicator; no confidence input)', i.indicator_id, i.series_key)
    FROM prediction.indicators_current i
    LEFT JOIN LATERAL (SELECT e.value, e.observation_at, e.evidence_object_id, e.evidence_version FROM prediction.indicator_evaluations e
                        WHERE e.indicator_id = i.indicator_id AND e.known_at <= p_at ORDER BY e.observation_at DESC, e.known_at DESC LIMIT 1) ev ON true
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'active';
$$;
REVOKE ALL ON FUNCTION executive.health_measure_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_measure_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `exposures`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0089 §R — CP-6 B32, part `exposures` (2026-09-28): RISK AND OPPORTUNITY INTELLIGENCE (F-P4-13; V00-T-098, V01-T-022, V03-T-265,
-- AI-52-001..005, AG-023/-024, PER-10, PR-27-001..006, PR-28-001..006, CAP-FW-04/-05, AT-27/-28, JRN-08/-09, OBJ-22/-23, WS-09, UX-35-*).
--
-- A risk and an opportunity are ONE object with a polarity (the prelude's strategy type RSK — declared through the EXISTING path,
-- graph.declare_strategy / POST …/graph/strategy/declare; its rests_on are its DRIVERS: entity, claim, strategy). The ASSESSMENT changes
-- and is judged, so it is kept HERE, beside the object, never in graph.strategy_current (a rebuilt projection) nor on the canonical
-- payload (the shared schema admits no property beyond `polarity`). Both polarities get the same discipline (AI-52-001): the same
-- versions, evidence, owner, review cadence, monitoring and closure; the consequence semantics differ (a risk's residual is reduced by
-- controls and judged against an appetite; an opportunity's value range is sponsored).
--
--   (R1) THE WARNING ORIGIN `exposure`: both origin CHECKs widened; prediction.submit_warning_candidate (0088 §0) re-declared whole with ONE
--        block — the kind admitted and the authority prediction.exposure.route; prediction.warning_candidate_preflight (0088 §W, its B28
--        integrator body) re-declared whole with ONE block — an exposure's warning routes to the EXPOSURE'S OWNER (PER-10) first.
--   (R2) THE RISK AND OPPORTUNITY AGENTS: executive agent kinds `risk` and `opportunity` (roles risk_agent / opportunity_agent, the prelude),
--        tasks `risk_assess` and `opportunity_assess`; executive.register_agent and executive.open_agent_run re-declared whole (0088 §S6) —
--        the kinds, the tasks, max_items enforced by their estimate. They ESTIMATE and RECOMMEND only (proposed versions, correlation
--        estimates); their attempts to accept or sponsor are refused at the PDP and recorded on the run (the Weak Signal Agent's precedent).
--   (R3) THE TAXONOMY and THE APPETITE: prediction.risk_taxonomy (versioned, append-only; the latest version is in force) and
--        prediction.risk_appetites (versioned per category, append-only; a threshold on RESIDUAL exposure in a unit; approved by a named,
--        active human).
--   (R4) THE REGISTER: prediction.exposure_current (one row per RSK: polarity, category, the OWNER — a named, active risk_owner, PER-10 —,
--        the sponsor, the review cadence, state), prediction.exposure_versions (the assessments, immutable except their state:
--        mechanism, probability bracket or plausibility, impact / value range with its unit, horizon, response window, velocity,
--        reversibility, controllability, options, evidence, confidence; assessed by a human or an agent; proposed | accepted | superseded |
--        contested), prediction.exposure_events (the exposure.* vocabulary — append-only; B34's attention class reads it), the drivers
--        (seeded from the RSK's rests_on, append-only), the controls (effectiveness bracket, owner), the RESIDUALS (inherent reduced by
--        controls, stored WITH their computation, the appetite judged), the correlations (declared by a human or estimated by an agent,
--        with basis), the aggregations (the MAX over shared drivers — the comonotone bound; a sum only where a human declared
--        independence; REFUSED when a member is unowned, unaccepted, contested, stale or closed), the opportunity hypotheses (statement,
--        falsifier, value range, timing, options, required capabilities → CAP nodes), the responses (a DEC resting on the RSK and its
--        package: mitigate | exploit | accept | transfer | avoid — the outcome is the decision's own, 0045 record_outcome).
--   (R5) THE PORTS: register, assess (a human), estimate (an agent), contest, accept (the OWNER, human-gated, the exact version by its
--        digest, a consequence preview beside it), add a control, route (an appetite breach → a warning candidate, origin `exposure`),
--        declare a hypothesis, sponsor (an opportunity_sponsor, human-gated — the route then opens the evaluation: a DEC + a package),
--        record a response, close, declare a correlation, aggregate.
--   (R6) THE PRIORITY: prediction.exposure_priority (IMMUTABLE): lexicographic over transparent dimensions with the explanation, a
--        dimension with no input last — no weighted score (ES-47-002).
--   (R7) THE HEALTH BRANCH: prediction.health_inputs(tenant, domain, at) with EXACTLY executive.health_measure_inputs' RETURNS TABLE (0089 §0).
--
-- NOT HERE (stated): the RSK type and its schema (the prelude's); a re-widened strategy CHECK (none); the attention OPPORTUNITY class
-- (B34's — this section emits exposure.* events only, into prediction.exposure_events); executive.attention_dimensions (unchanged: the
-- exposure inputs already exist there as counts); the interface register (unchanged, 50/0/0 — B32 adds no interface); control
-- retirement (a control is added, never edited); a scheduled cadence for the two agents (an operator's trigger runs them); learning from
-- outcomes (nothing learns — the estimate rule is versioned code); peer or cross-domain aggregation (no cross-domain read under RLS).
-- NAMING: `RSK` is also the objectType the retention signing-key routes put on their audit rows (retention.controller.ts); the two are
-- told apart by the ACTION (prediction.exposure.* vs retention.*), never by the type.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R1 THE WARNING ORIGIN `exposure`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE prediction.warnings_current DROP CONSTRAINT warnings_current_origin_kind_check;
ALTER TABLE prediction.warnings_current ADD CONSTRAINT warnings_current_origin_kind_check
  CHECK (origin_kind IN ('indicator_breach', 'stream_rule', 'weak_signal', 'graph_impact', 'forecast_revision', 'twin_degradation', /* B32 (0089) */ 'exposure'));
ALTER TABLE prediction.warning_candidates DROP CONSTRAINT warning_candidates_origin_kind_check;
ALTER TABLE prediction.warning_candidates ADD CONSTRAINT warning_candidates_origin_kind_check
  CHECK (origin_kind IN ('stream_rule', 'weak_signal', 'graph_impact', 'forecast_revision', 'twin_degradation', /* B32 (0089) */ 'exposure'));

-- 0088 §0 copied whole; B32: ONE block — the origin kind `exposure` and its authority prediction.exposure.route.
CREATE OR REPLACE FUNCTION prediction.submit_warning_candidate(
  p_tenant uuid, p_domain uuid, p_origin_kind text, p_origin_key text, p_origin_ref jsonb, p_title text, p_consequence text, p_confidence numeric,
  p_cause_key text, p_affected jsonb, p_evidence jsonb, p_window_hours int, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid; c prediction.warning_candidates%ROWTYPE; e jsonb;
BEGIN
  /* B32 (0089) exposures: the exposure origin — an appetite breach routed under prediction.exposure.route */
  PERFORM observation.assert_authority(ARRAY['prediction.stream.subscription.apply', 'prediction.signal.escalate', 'prediction.warning.subscription.apply', 'prediction.warning.raise', 'prediction.exposure.route']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_origin_kind IS NULL OR p_origin_kind NOT IN ('stream_rule', 'weak_signal', 'graph_impact', 'forecast_revision', 'twin_degradation', 'exposure') THEN
    RAISE EXCEPTION 'warning candidate rejected: origin_kind is one of stream_rule, weak_signal, graph_impact, forecast_revision, twin_degradation, exposure' USING ERRCODE = '22023';
  END IF;
  /* end B32 exposures */
  IF p_origin_key IS NULL OR length(p_origin_key) NOT BETWEEN 1 AND 300 OR p_cause_key IS NULL OR length(p_cause_key) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'warning candidate rejected: an origin key and a cause key of 1..300 characters are required' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'warning candidate rejected: a title of 3..300 characters is required' USING ERRCODE = '22023'; END IF;
  IF p_consequence IS NULL OR p_consequence NOT IN ('C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'warning candidate rejected: the consequence class is C1..C4' USING ERRCODE = '22023'; END IF;
  IF p_confidence IS NOT NULL AND (p_confidence < 0 OR p_confidence > 1) THEN RAISE EXCEPTION 'warning candidate rejected: confidence is in 0..1' USING ERRCODE = '22023'; END IF;
  IF p_origin_ref IS NULL OR jsonb_typeof(p_origin_ref) <> 'object' OR (p_affected IS NOT NULL AND jsonb_typeof(p_affected) <> 'object')
     OR (p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'array') THEN
    RAISE EXCEPTION 'warning candidate rejected: origin_ref and affected are objects, evidence an array' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) LOOP
    IF jsonb_typeof(e) <> 'object' OR (e ->> 'object_id') IS NULL OR coalesce(e ->> 'stance', 'supporting') NOT IN ('supporting', 'contradicting') THEN
      RAISE EXCEPTION 'warning candidate rejected: each evidence item is {object_id, version?, source_id?, stance: supporting|contradicting}' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_window_hours IS NOT NULL AND (p_window_hours < 1 OR p_window_hours > 8760) THEN RAISE EXCEPTION 'warning candidate rejected: the response window is 1..8760 hours' USING ERRCODE = '22023'; END IF;
  -- the affected contract (§W's own check, prediction.warning_affected_problem — resolved at call time): a malformed block is refused HERE,
  -- at submission, never accepted and refused later (integrator, 0088 §I — the streams origin had sent its own keys)
  e := to_jsonb(prediction.warning_affected_problem(coalesce(p_affected, '{}'::jsonb)));
  IF e IS NOT NULL AND jsonb_typeof(e) = 'string' THEN RAISE EXCEPTION 'warning candidate rejected: %', e #>> '{}' USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.warning_candidates (candidate_id, scope, tenant_id, domain_id, origin_kind, origin_key, origin_ref, title, consequence_class, confidence, cause_key,
                                             affected, evidence, response_window_hours, submitted_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_origin_kind, p_origin_key, p_origin_ref, btrim(p_title), p_consequence, p_confidence, p_cause_key,
          coalesce(p_affected, '{}'::jsonb), coalesce(p_evidence, '[]'::jsonb), p_window_hours, p_actor, p_correlation)
  ON CONFLICT ON CONSTRAINT pwc_once DO NOTHING
  RETURNING candidate_id INTO v_id;
  IF v_id IS NULL THEN
    SELECT * INTO c FROM prediction.warning_candidates x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.origin_kind = p_origin_kind AND x.origin_key = p_origin_key;
    RETURN jsonb_build_object('candidate_id', c.candidate_id, 'state', c.state, 'warning_id', c.warning_id, 'repeated', true);
  END IF;
  RETURN jsonb_build_object('candidate_id', v_id, 'state', 'pending', 'warning_id', NULL, 'repeated', false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.submit_warning_candidate(uuid,uuid,text,text,jsonb,text,text,numeric,text,jsonb,jsonb,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.submit_warning_candidate(uuid,uuid,text,text,jsonb,text,text,numeric,text,jsonb,jsonb,int,uuid,uuid) TO eye_commit;

-- The EXPOSURE REGISTER is declared before the preflight reads it (below, §R4); the preflight is re-declared after it.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R2 THE RISK AND OPPORTUNITY AGENTS: the kinds and their tasks
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE executive.agents DROP CONSTRAINT IF EXISTS agents_agent_kind_check;
ALTER TABLE executive.agents ADD CONSTRAINT agents_agent_kind_check CHECK (agent_kind IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal', /* B32 (0089) */ 'risk', 'opportunity'));
ALTER TABLE executive.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_task_check;
ALTER TABLE executive.agent_runs ADD CONSTRAINT agent_runs_task_check CHECK (task IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan', /* B32 (0089) */ 'risk_assess', 'opportunity_assess'));

-- 0088 §S6 copied whole (0086 §T + B28); B32: the kinds risk and opportunity (roles risk_agent / opportunity_agent, 0089 §0), max_items
-- enforced by their estimate (the exposures one run re-estimates; the rest wait for the next run).
CREATE OR REPLACE FUNCTION executive.register_agent(
  p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_kind text, p_version text, p_code_digest text, p_owner uuid, p_escalation uuid,
  p_budgets jsonb, p_stop_conditions jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text; sc jsonb; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  /* B32 (0089) exposures: the Risk and Opportunity Agents */
  IF p_kind NOT IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal', 'risk', 'opportunity') THEN RAISE EXCEPTION 'agent rejected: kind is decision, briefing, reporting, attention, weak_signal, risk or opportunity' USING ERRCODE = '22023'; END IF;
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
    IF (sc ->> 'kind') = 'max_items' AND p_kind NOT IN ('decision', 'briefing', 'weak_signal', /* B32 (0089) */ 'risk', 'opportunity') THEN
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

-- 0088 §S6 copied whole (0086 §T + B28); B32: the tasks risk_assess and opportunity_assess, each run by its own kind and by no other (the
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
  IF p_task NOT IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan', /* B32 (0089) */ 'risk_assess', 'opportunity_assess') THEN RAISE EXCEPTION 'run rejected: task is draft, briefing, report or monitor (or attention_tick for an attention agent, signal_scan for a weak_signal agent, risk_assess for a risk agent, opportunity_assess for an opportunity agent)' USING ERRCODE = '22023'; END IF;
  IF (a.agent_kind = 'decision' AND p_task <> 'draft') OR (a.agent_kind = 'briefing' AND p_task NOT IN ('briefing', 'monitor')) OR (a.agent_kind = 'reporting' AND p_task <> 'report')
     OR (a.agent_kind = 'attention' AND p_task <> 'attention_tick') OR (a.agent_kind <> 'attention' AND p_task = 'attention_tick')
     -- B28 (0088 §S6): the weak-signal scan, run by a weak_signal agent and by no other kind
     OR (a.agent_kind = 'weak_signal' AND p_task <> 'signal_scan') OR (a.agent_kind <> 'weak_signal' AND p_task = 'signal_scan')
     -- B32 (0089): the risk estimate by a risk agent, the opportunity estimate by an opportunity agent, and by no other kind
     OR (a.agent_kind = 'risk' AND p_task <> 'risk_assess') OR (a.agent_kind <> 'risk' AND p_task = 'risk_assess')
     OR (a.agent_kind = 'opportunity' AND p_task <> 'opportunity_assess') OR (a.agent_kind <> 'opportunity' AND p_task = 'opportunity_assess') THEN
    RAISE EXCEPTION 'run rejected: a % agent does not run the task %', a.agent_kind, p_task USING ERRCODE = '42501';
  END IF;
  INSERT INTO executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_principal_id, trigger_ref, room_id, package_id, budget, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, a.principal_id, a.agent_kind, a.agent_version, a.code_digest, p_task, p_trigger_kind, p_trigger_principal, p_trigger_ref, p_room_id, p_package_id, a.budgets, p_correlation);
  RETURN jsonb_build_object('run_id', p_run_id, 'budget', a.budgets, 'stop_conditions', a.stop_conditions, 'escalation_principal_id', a.escalation_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R3 THE TAXONOMY AND THE APPETITE (versioned, append-only)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- THE TAXONOMY: the categories a domain files its exposures under, each for risks, opportunities or both. The LATEST version is in force;
-- an earlier one is kept (an exposure names the version it was filed under).
CREATE TABLE prediction.risk_taxonomy (
  taxonomy_id    uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  version        int  NOT NULL CHECK (version >= 1),
  categories     jsonb NOT NULL CHECK (jsonb_typeof(categories) = 'array' AND jsonb_array_length(categories) BETWEEN 1 AND 200),   -- [{key, label, polarity: risk|opportunity|both, parent?}]
  reason         text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  published_by   uuid NOT NULL,
  published_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT prt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT prt_version UNIQUE (tenant_id, domain_id, version)
);
COMMENT ON TABLE prediction.risk_taxonomy IS 'B32 (0089 §R3): the versioned risk and opportunity taxonomy of a domain — append-only; the latest version is in force (PR-27-002 category, AT-27 taxonomy fixtures)';
CREATE TRIGGER prt_append_only BEFORE UPDATE OR DELETE ON prediction.risk_taxonomy FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.risk_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.risk_taxonomy FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.risk_taxonomy USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.risk_taxonomy TO eye_app, eye_commit;

-- THE APPETITE: per category, a threshold on RESIDUAL exposure in a unit — approved by a named, active human; versioned, append-only (the
-- latest version of a category is in force).
CREATE TABLE prediction.risk_appetites (
  appetite_id      uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  category_key     text NOT NULL CHECK (length(category_key) BETWEEN 1 AND 64),
  version          int  NOT NULL CHECK (version >= 1),
  taxonomy_version int  NOT NULL,
  threshold        numeric NOT NULL CHECK (threshold >= 0),
  unit             text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 32),
  statement        text NOT NULL CHECK (length(btrim(statement)) BETWEEN 8 AND 2000),
  reason           text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  approved_by      uuid NOT NULL,
  approved_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT pra_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pra_version UNIQUE (tenant_id, domain_id, category_key, version)
);
COMMENT ON TABLE prediction.risk_appetites IS 'B32 (0089 §R3): the risk appetite per category — a threshold on residual exposure, approved by a named human (PR-27-003); versioned, append-only';
CREATE TRIGGER pra_append_only BEFORE UPDATE OR DELETE ON prediction.risk_appetites FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.risk_appetites ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.risk_appetites FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.risk_appetites USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.risk_appetites TO eye_app, eye_commit;

-- The taxonomy in force (the latest version), or NULL.
CREATE OR REPLACE FUNCTION prediction.risk_taxonomy_current(p_tenant uuid, p_domain uuid) RETURNS prediction.risk_taxonomy
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT * FROM prediction.risk_taxonomy t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain ORDER BY t.version DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION prediction.risk_taxonomy_current(uuid, uuid) TO eye_app, eye_commit;

-- PUBLISH a taxonomy version (a named human; the next version; the categories' keys unique, each a polarity).
CREATE OR REPLACE FUNCTION prediction.publish_risk_taxonomy(p_taxonomy_id uuid, p_tenant uuid, p_domain uuid, p_expected_version int, p_categories jsonb, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_cur int; c jsonb; v_keys text[] := '{}';
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.taxonomy.publish']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'risk taxonomy rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'risk taxonomy rejected: a taxonomy is published by a named, active human' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('prediction.risk_taxonomy:' || p_domain::text, 0));
  SELECT coalesce(max(version), 0) INTO v_cur FROM prediction.risk_taxonomy WHERE tenant_id = p_tenant AND domain_id = p_domain;
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'risk taxonomy rejected (stale_version): the taxonomy stands at version %, not %', v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_categories IS NULL OR jsonb_typeof(p_categories) <> 'array' OR jsonb_array_length(p_categories) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'risk taxonomy rejected: categories is a list of 1..200 {key, label, polarity: risk|opportunity|both, parent?}' USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_categories) LOOP
    IF jsonb_typeof(c) <> 'object' OR coalesce(c ->> 'key', '') !~ '^[a-z][a-z0-9_.-]{0,63}$' OR length(btrim(coalesce(c ->> 'label', ''))) NOT BETWEEN 2 AND 128
       OR coalesce(c ->> 'polarity', '') NOT IN ('risk', 'opportunity', 'both') THEN
      RAISE EXCEPTION 'risk taxonomy rejected: each category is {key: [a-z][a-z0-9_.-]*, label: 2..128 characters, polarity: risk|opportunity|both, parent?}' USING ERRCODE = '22023';
    END IF;
    IF (c ->> 'key') = ANY (v_keys) THEN RAISE EXCEPTION 'risk taxonomy rejected: the category key % is named twice', c ->> 'key' USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || (c ->> 'key');
  END LOOP;
  FOR c IN SELECT value FROM jsonb_array_elements(p_categories) WHERE value ? 'parent' AND jsonb_typeof(value -> 'parent') <> 'null' LOOP
    IF NOT ((c ->> 'parent') = ANY (v_keys)) OR (c ->> 'parent') = (c ->> 'key') THEN
      RAISE EXCEPTION 'risk taxonomy rejected: the parent % of category % is not another category of this version', c ->> 'parent', c ->> 'key' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'risk taxonomy rejected: a version states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.risk_taxonomy (taxonomy_id, scope, tenant_id, domain_id, version, categories, reason, published_by, correlation_id)
  VALUES (p_taxonomy_id, 'DOMAIN', p_tenant, p_domain, v_cur + 1, p_categories, btrim(p_reason), p_actor, p_correlation);
  RETURN jsonb_build_object('taxonomy_id', p_taxonomy_id, 'version', v_cur + 1, 'categories', p_categories, 'supersedes', NULLIF(v_cur, 0));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.publish_risk_taxonomy(uuid,uuid,uuid,int,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.publish_risk_taxonomy(uuid,uuid,uuid,int,jsonb,text,uuid,uuid) TO eye_commit;

-- APPROVE an appetite version for a RISK category of the taxonomy in force (a named, active human: the executive, a domain administrator
-- or a risk owner — PR-27-003 "accountable human risk owners accept … appetite decisions").
CREATE OR REPLACE FUNCTION prediction.approve_risk_appetite(p_appetite_id uuid, p_tenant uuid, p_domain uuid, p_category text, p_expected_version int, p_threshold numeric, p_unit text,
                                                           p_statement text, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t prediction.risk_taxonomy%ROWTYPE; v_cur int; v_pol text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.appetite.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'risk appetite rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'risk_owner', 'platform_admin']) THEN
    RAISE EXCEPTION 'risk appetite rejected: an appetite is approved by a named, active human — the executive, a domain administrator or a risk owner' USING ERRCODE = '42501';
  END IF;
  t := prediction.risk_taxonomy_current(p_tenant, p_domain);
  IF t.taxonomy_id IS NULL THEN RAISE EXCEPTION 'risk appetite rejected (no_taxonomy): this domain has no risk taxonomy; publish one first' USING ERRCODE = '22023'; END IF;
  SELECT c ->> 'polarity' INTO v_pol FROM jsonb_array_elements(t.categories) c WHERE c ->> 'key' = p_category;
  IF v_pol IS NULL THEN RAISE EXCEPTION 'risk appetite rejected: no category % in taxonomy version %', coalesce(p_category, '<none>'), t.version USING ERRCODE = '23503'; END IF;
  IF v_pol = 'opportunity' THEN RAISE EXCEPTION 'risk appetite rejected: category % files opportunities; an appetite bounds a risk''s residual exposure', p_category USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('prediction.risk_appetite:' || p_domain::text || ':' || p_category, 0));
  SELECT coalesce(max(version), 0) INTO v_cur FROM prediction.risk_appetites WHERE tenant_id = p_tenant AND domain_id = p_domain AND category_key = p_category;
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'risk appetite rejected (stale_version): the appetite of % stands at version %, not %', p_category, v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_threshold IS NULL OR p_threshold < 0 THEN RAISE EXCEPTION 'risk appetite rejected: the threshold is a number ≥ 0 on residual exposure' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_unit)), 0) NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'risk appetite rejected: the threshold names its unit (1..32 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_statement)), 0) NOT BETWEEN 8 AND 2000 OR coalesce(length(btrim(p_reason)), 0) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'risk appetite rejected: the appetite states its statement and its reason (8..2000 characters each)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO prediction.risk_appetites (appetite_id, scope, tenant_id, domain_id, category_key, version, taxonomy_version, threshold, unit, statement, reason, approved_by, correlation_id)
  VALUES (p_appetite_id, 'DOMAIN', p_tenant, p_domain, p_category, v_cur + 1, t.version, p_threshold, btrim(p_unit), btrim(p_statement), btrim(p_reason), p_actor, p_correlation);
  RETURN jsonb_build_object('appetite_id', p_appetite_id, 'category_key', p_category, 'version', v_cur + 1, 'taxonomy_version', t.version, 'threshold', p_threshold, 'unit', btrim(p_unit),
                            'approved_by', p_actor, 'supersedes', NULLIF(v_cur, 0));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.approve_risk_appetite(uuid,uuid,uuid,text,int,numeric,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.approve_risk_appetite(uuid,uuid,uuid,text,int,numeric,text,text,text,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R4 THE REGISTER
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ONE ROW PER EXPOSURE: the exposure IS its RSK (exposure_id = the RSK's strategy_object_id). The owner is a named, active human holding
-- risk_owner (PER-10: "cannot leave material risk or opportunity unowned"); the state moves only through the ports' events.
CREATE TABLE prediction.exposure_current (
  exposure_id          uuid PRIMARY KEY REFERENCES graph.strategy_current (strategy_object_id),
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  polarity             text NOT NULL CHECK (polarity IN ('risk', 'opportunity')),
  category_key         text NOT NULL CHECK (length(category_key) BETWEEN 1 AND 64),
  taxonomy_version     int  NOT NULL,
  owner_principal_id   uuid NOT NULL,
  sponsor_principal_id uuid,
  sponsored_version    int,
  sponsorship          jsonb CHECK (sponsorship IS NULL OR jsonb_typeof(sponsorship) = 'object'),
  sponsored_at         timestamptz,
  review_every_days    int CHECK (review_every_days IS NULL OR review_every_days BETWEEN 1 AND 366),
  state                text NOT NULL DEFAULT 'identified' CHECK (state IN ('identified', 'assessed', 'accepted', 'contested', 'sponsored', 'closed')),
  current_version      int NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  accepted_version     int,
  accepted_by          uuid,
  accepted_at          timestamptz,
  routed_candidate_id  uuid,
  closure              jsonb CHECK (closure IS NULL OR jsonb_typeof(closure) = 'object'),
  closed_at            timestamptz,
  registered_by        uuid NOT NULL,
  registered_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT pex_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pex_accepted CHECK ((accepted_version IS NULL) = (accepted_by IS NULL) AND (accepted_version IS NULL) = (accepted_at IS NULL)),
  CONSTRAINT pex_sponsor CHECK ((sponsor_principal_id IS NULL) = (sponsored_at IS NULL) AND (sponsor_principal_id IS NULL OR polarity = 'opportunity')),
  CONSTRAINT pex_closed CHECK ((state = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX pex_domain ON prediction.exposure_current (tenant_id, domain_id, polarity, state);
COMMENT ON TABLE prediction.exposure_current IS 'B32 (0089 §R4): the risk and opportunity register — one row per RSK (F-P4-13; PR-27-001/PR-28-001, CAP-FW-04/-05, WS-09); owner a named, active risk_owner (PER-10)';
ALTER TABLE prediction.exposure_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_current FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_current USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_current TO eye_app, eye_commit;

-- THE ASSESSMENTS. A version is IMMUTABLE but for its state (proposed → accepted | superseded | contested; contested → accepted |
-- superseded) — guarded by a trigger; never deleted. `digest` is what the owner accepts (OBJ-22: the exact version).
CREATE TABLE prediction.exposure_versions (
  exposure_id            uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  version                int  NOT NULL CHECK (version >= 1),
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  mechanism              text NOT NULL CHECK (length(btrim(mechanism)) BETWEEN 8 AND 4096),
  probability_low        numeric CHECK (probability_low IS NULL OR probability_low BETWEEN 0 AND 1),
  probability_high       numeric CHECK (probability_high IS NULL OR probability_high BETWEEN 0 AND 1),
  plausibility           text CHECK (plausibility IS NULL OR plausibility IN ('low', 'medium', 'high')),
  impact_low             numeric NOT NULL CHECK (impact_low >= 0),
  impact_high            numeric NOT NULL,
  unit                   text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 32),
  horizon                text NOT NULL CHECK (length(btrim(horizon)) BETWEEN 1 AND 64),
  response_window_hours  int CHECK (response_window_hours IS NULL OR response_window_hours BETWEEN 1 AND 8760),
  velocity               text CHECK (velocity IS NULL OR velocity IN ('days', 'weeks', 'months', 'years')),
  reversibility          text CHECK (reversibility IS NULL OR reversibility IN ('reversible', 'partly_reversible', 'irreversible')),
  controllability        text CHECK (controllability IS NULL OR controllability IN ('high', 'medium', 'low')),
  options                jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  evidence               jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  confidence             numeric CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  basis                  text,
  assessment             jsonb NOT NULL CHECK (jsonb_typeof(assessment) = 'object'),
  digest                 text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  assessed_by            uuid NOT NULL,
  assessed_kind          text NOT NULL CHECK (assessed_kind IN ('human', 'agent')),
  agent_run_id           uuid,
  estimate_rule          text,
  based_on_version       int,
  assessed_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  state                  text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'accepted', 'superseded', 'contested')),
  state_changed_at       timestamptz,
  state_changed_by       uuid,
  state_reason           text,
  correlation_id         uuid NOT NULL,
  PRIMARY KEY (exposure_id, version),
  CONSTRAINT pexv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pexv_bracket CHECK ((probability_low IS NULL) = (probability_high IS NULL) AND (probability_low IS NULL OR probability_low <= probability_high) AND impact_low <= impact_high),
  CONSTRAINT pexv_likelihood CHECK (probability_low IS NOT NULL OR plausibility IS NOT NULL),
  CONSTRAINT pexv_agent CHECK ((assessed_kind = 'agent') = (agent_run_id IS NOT NULL))
);
COMMENT ON TABLE prediction.exposure_versions IS 'B32 (0089 §R4): the assessments of an exposure (AI-52-002: mechanism, probability or plausibility, consequence or value, horizon, response window, options, evidence) — immutable but for their state; an agent''s version is an ESTIMATE, never accepted by the agent';
ALTER TABLE prediction.exposure_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_versions USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_versions TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.exposure_versions_guard() RETURNS trigger
SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'exposure assessment rejected: an assessment version is never deleted' USING ERRCODE = '23514'; END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'state_changed_at', 'state_changed_by', 'state_reason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'state_changed_at', 'state_changed_by', 'state_reason']) THEN
    RAISE EXCEPTION 'exposure assessment rejected: version % of exposure % is immutable; only its state changes', OLD.version, OLD.exposure_id USING ERRCODE = '23514';
  END IF;
  IF NOT ((OLD.state = 'proposed' AND NEW.state IN ('accepted', 'superseded', 'contested')) OR (OLD.state = 'contested' AND NEW.state IN ('accepted', 'superseded'))
          OR (OLD.state = 'accepted' AND NEW.state IN ('superseded', 'contested'))) THEN
    RAISE EXCEPTION 'exposure assessment rejected: version % of exposure % does not move from % to %', OLD.version, OLD.exposure_id, OLD.state, NEW.state USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pexv_guard BEFORE UPDATE OR DELETE ON prediction.exposure_versions FOR EACH ROW EXECUTE FUNCTION prediction.exposure_versions_guard();

-- THE EVENTS (append-only): the exposure.* vocabulary — what B34's attention class and the page read.
CREATE TABLE prediction.exposure_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  exposure_id        uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('exposure.registered', 'exposure.assessed', 'exposure.estimated', 'exposure.assessment_contested', 'exposure.assessment_accepted',
                                                    'exposure.control_added', 'exposure.residual_computed', 'exposure.appetite_breached', 'exposure.routed', 'exposure.hypothesis_declared',
                                                    'exposure.sponsored', 'exposure.response_opened', 'exposure.correlation_recorded', 'exposure.closed')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pexe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pexe_exposure ON prediction.exposure_events (exposure_id, occurred_at);
CREATE INDEX pexe_domain ON prediction.exposure_events (tenant_id, domain_id, occurred_at);
COMMENT ON TABLE prediction.exposure_events IS 'B32 (0089 §R4): the exposure.* events (append-only) — the register''s history and the input B34''s attention class reads';
CREATE TRIGGER pexe_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_events FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_events USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_events TO eye_app, eye_commit;

-- THE DRIVERS (append-only): what the exposure rests on — seeded from the RSK's rests_on at registration (source `rests_on`), and any a
-- person adds (source `declared`). Two exposures sharing a driver are one loss (or gain) event counted once in an aggregation.
CREATE TABLE prediction.exposure_drivers (
  driver_row_id  uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  exposure_id    uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  driver_kind    text NOT NULL CHECK (driver_kind IN ('entity', 'claim', 'edge', 'strategy')),
  driver_id      uuid NOT NULL,
  source         text NOT NULL CHECK (source IN ('rests_on', 'declared')),
  note           text,
  declared_by    uuid NOT NULL,
  declared_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT pexd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pexd_once UNIQUE (exposure_id, driver_kind, driver_id)
);
CREATE INDEX pexd_driver ON prediction.exposure_drivers (tenant_id, domain_id, driver_kind, driver_id);
CREATE TRIGGER pexd_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_drivers FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_drivers FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_drivers USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_drivers TO eye_app, eye_commit;

-- THE CONTROLS (append-only): a risk's controls, each with an effectiveness BRACKET (the share of the exposure it removes) and an owner.
CREATE TABLE prediction.exposure_controls (
  control_id         uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  exposure_id        uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 256),
  control_kind       text NOT NULL CHECK (control_kind IN ('preventive', 'detective', 'corrective')),
  effectiveness_low  numeric NOT NULL CHECK (effectiveness_low BETWEEN 0 AND 1),
  effectiveness_high numeric NOT NULL CHECK (effectiveness_high BETWEEN 0 AND 1),
  owner_principal_id uuid NOT NULL,
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pexc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pexc_bracket CHECK (effectiveness_low <= effectiveness_high)
);
CREATE INDEX pexc_exposure ON prediction.exposure_controls (exposure_id, declared_at);
CREATE TRIGGER pexc_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_controls FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_controls FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_controls USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_controls TO eye_app, eye_commit;

-- THE RESIDUALS (append-only): computed from an ACCEPTED version and the controls standing at the instant, STORED WITH THEIR COMPUTATION,
-- the appetite judged (risk only). A later control or acceptance computes a new row; nothing is edited.
CREATE TABLE prediction.exposure_residuals (
  residual_id      uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  exposure_id      uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  version          int  NOT NULL,
  inherent_low     numeric NOT NULL,
  inherent_high    numeric NOT NULL,
  residual_low     numeric NOT NULL,
  residual_high    numeric NOT NULL,
  unit             text NOT NULL,
  controls         jsonb NOT NULL CHECK (jsonb_typeof(controls) = 'array'),
  computation      text NOT NULL,
  appetite_id      uuid,
  appetite_version int,
  threshold        numeric,
  breach           boolean,
  computed_by      uuid NOT NULL,
  computed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  cause            text NOT NULL CHECK (cause IN ('acceptance', 'control')),
  correlation_id   uuid NOT NULL,
  CONSTRAINT pexr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pexr_version FOREIGN KEY (exposure_id, version) REFERENCES prediction.exposure_versions (exposure_id, version),
  CONSTRAINT pexr_appetite CHECK ((appetite_id IS NULL) = (breach IS NULL) AND (appetite_id IS NULL) = (threshold IS NULL))
);
CREATE INDEX pexr_exposure ON prediction.exposure_residuals (exposure_id, computed_at);
CREATE TRIGGER pexr_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_residuals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_residuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_residuals FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_residuals USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_residuals TO eye_app, eye_commit;

-- THE CORRELATIONS (append-only; the latest row of a pair stands): declared by a human, or ESTIMATED by an agent with its basis. Only a
-- human's declaration is used by an aggregation (a human's `independent` admits a sum; a human's `correlated`/`comonotone` merges); an
-- agent's estimate is shown beside, never used.
CREATE TABLE prediction.exposure_correlations (
  correlation_row_id uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  exposure_a         uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  exposure_b         uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  relation           text NOT NULL CHECK (relation IN ('independent', 'correlated', 'comonotone')),
  coefficient        numeric CHECK (coefficient IS NULL OR coefficient BETWEEN -1 AND 1),
  basis              text NOT NULL CHECK (length(btrim(basis)) BETWEEN 8 AND 2000),
  estimated_kind     text NOT NULL CHECK (estimated_kind IN ('human', 'agent')),
  agent_run_id       uuid,
  recorded_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pexk_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pexk_order CHECK (exposure_a < exposure_b),
  CONSTRAINT pexk_agent CHECK ((estimated_kind = 'agent') = (agent_run_id IS NOT NULL))
);
CREATE INDEX pexk_pair ON prediction.exposure_correlations (exposure_a, exposure_b, recorded_at);
CREATE TRIGGER pexk_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_correlations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_correlations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_correlations FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_correlations USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_correlations TO eye_app, eye_commit;

-- THE AGGREGATIONS (append-only): what a roll-up computed and HOW — the clusters (shared drivers and human-declared dependence), the
-- method (max | sum | bounded), the members' residuals as read.
CREATE TABLE prediction.exposure_aggregations (
  aggregation_id uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  polarity       text NOT NULL CHECK (polarity IN ('risk', 'opportunity')),
  unit           text NOT NULL,
  members        jsonb NOT NULL CHECK (jsonb_typeof(members) = 'array'),
  clusters       jsonb NOT NULL CHECK (jsonb_typeof(clusters) = 'array'),
  method         text NOT NULL CHECK (method IN ('max', 'sum', 'bounded')),
  total_low      numeric NOT NULL,
  total_high     numeric NOT NULL,
  naive_sum_high numeric NOT NULL,
  basis          text NOT NULL,
  agent_estimates_not_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_by    uuid NOT NULL,
  computed_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT pexa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER pexa_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_aggregations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_aggregations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_aggregations FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_aggregations USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_aggregations TO eye_app, eye_commit;

-- THE OPPORTUNITY HYPOTHESES (append-only; versioned per opportunity): the statement, the FALSIFIER, the value range, the timing, the
-- options and the capabilities it needs (CAP nodes of the Strategy Graph).
CREATE TABLE prediction.opportunity_hypotheses (
  hypothesis_id          uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  exposure_id            uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  version                int  NOT NULL CHECK (version >= 1),
  statement              text NOT NULL CHECK (length(btrim(statement)) BETWEEN 8 AND 4096),
  falsifier              text NOT NULL CHECK (length(btrim(falsifier)) BETWEEN 8 AND 2000),
  value_low              numeric NOT NULL CHECK (value_low >= 0),
  value_high             numeric NOT NULL,
  unit                   text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 32),
  timing                 jsonb NOT NULL CHECK (jsonb_typeof(timing) = 'object'),
  options                jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  required_capabilities  uuid[] NOT NULL DEFAULT '{}',
  declared_by            uuid NOT NULL,
  declared_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT poh_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT poh_range CHECK (value_low <= value_high),
  CONSTRAINT poh_version UNIQUE (exposure_id, version)
);
CREATE TRIGGER poh_append_only BEFORE UPDATE OR DELETE ON prediction.opportunity_hypotheses FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.opportunity_hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.opportunity_hypotheses FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.opportunity_hypotheses USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.opportunity_hypotheses TO eye_app, eye_commit;

-- THE RESPONSES (append-only): the decision a response opened — a DEC resting on the RSK and its package. The outcome is the decision's
-- (0045 decision.record_outcome), read beside the response: nothing is copied.
CREATE TABLE prediction.exposure_responses (
  response_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  exposure_id        uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  response_kind      text NOT NULL CHECK (response_kind IN ('mitigate', 'exploit', 'accept', 'transfer', 'avoid')),
  decision_object_id uuid NOT NULL REFERENCES graph.strategy_current (strategy_object_id),
  package_id         uuid NOT NULL REFERENCES decision.packages_current (package_id),
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pexq_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pexq_once UNIQUE (exposure_id, package_id)
);
CREATE TRIGGER pexq_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_responses FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_responses USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_responses TO eye_app, eye_commit;

-- ── internal helpers ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prediction.exposure_event(p_exposure uuid, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO prediction.exposure_events (event_id, scope, tenant_id, domain_id, exposure_id, event, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_exposure, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.exposure_event(uuid,uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC;

-- The objectives an exposure rests on (its RSK's strategy dependencies that are objectives) — the affected objectives of its warning and
-- the objective_ids of its health row.
CREATE OR REPLACE FUNCTION prediction.exposure_objectives(p_exposure uuid) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT s.strategy_object_id ORDER BY s.strategy_object_id), '{}'::uuid[])
    FROM graph.dependencies d JOIN graph.strategy_current s ON s.strategy_object_id = d.depends_on_id AND s.object_type = 'OBJ'
   WHERE d.dependent_object_id = p_exposure AND d.depends_on_kind = 'strategy' AND d.state = 'active'
$$;
GRANT EXECUTE ON FUNCTION prediction.exposure_objectives(uuid) TO eye_app, eye_commit;

-- A named, active human holding risk_owner in this domain (PER-10's owner).
CREATE OR REPLACE FUNCTION prediction.is_exposure_owner_eligible(p_principal uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
  SELECT executive.holds_role(p_principal, p_tenant, p_domain, ARRAY['risk_owner'])
$$;
REVOKE ALL ON FUNCTION prediction.is_exposure_owner_eligible(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.is_exposure_owner_eligible(uuid,uuid,uuid) TO eye_app, eye_commit;

-- THE RESIDUAL OF A VERSION as it would be computed now (STABLE; the acceptance preview reads it, the ports store it):
--   inherent = the probability bracket × the impact bracket (low × low, high × high); a plausibility-only version keeps the impact range
--              UN-WEIGHTED (no probability is invented) and says so;
--   residual = inherent reduced by every control standing (risk only): low × Π(1 − effectiveness_high), high × Π(1 − effectiveness_low) —
--              the conservative end stays conservative;
--   the appetite (risk only) = the latest approved version of the exposure's category, judged on residual_high when the units match —
--              a unit mismatch judges nothing (breach NULL) and says so.
CREATE OR REPLACE FUNCTION prediction.exposure_residual_of(p_exposure uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v prediction.exposure_versions%ROWTYPE; a prediction.risk_appetites%ROWTYPE;
        v_il numeric; v_ih numeric; v_rl numeric; v_rh numeric; v_keep_low numeric := 1; v_keep_high numeric := 1; v_controls jsonb := '[]'::jsonb; c record;
        v_comp text; v_breach boolean; v_app jsonb := NULL;
BEGIN
  SELECT * INTO x FROM prediction.exposure_current WHERE exposure_id = p_exposure;
  SELECT * INTO v FROM prediction.exposure_versions WHERE exposure_id = p_exposure AND version = p_version;
  IF x.exposure_id IS NULL OR v.exposure_id IS NULL THEN RETURN NULL; END IF;
  IF v.probability_low IS NOT NULL THEN
    v_il := v.probability_low * v.impact_low; v_ih := v.probability_high * v.impact_high;
    v_comp := format('inherent = probability [%s, %s] × %s [%s, %s] %s', v.probability_low, v.probability_high, CASE x.polarity WHEN 'risk' THEN 'impact' ELSE 'value' END, v.impact_low, v.impact_high, v.unit);
  ELSE
    v_il := v.impact_low; v_ih := v.impact_high;
    v_comp := format('inherent = the %s range [%s, %s] %s un-weighted (plausibility %s — no probability stated, none invented)', CASE x.polarity WHEN 'risk' THEN 'impact' ELSE 'value' END, v.impact_low, v.impact_high, v.unit, v.plausibility);
  END IF;
  IF x.polarity = 'risk' THEN
    FOR c IN SELECT * FROM prediction.exposure_controls k WHERE k.exposure_id = p_exposure ORDER BY k.declared_at, k.control_id LOOP
      v_keep_low := v_keep_low * (1 - c.effectiveness_high);
      v_keep_high := v_keep_high * (1 - c.effectiveness_low);
      v_controls := v_controls || jsonb_build_object('control_id', c.control_id, 'title', c.title, 'kind', c.control_kind, 'effectiveness', jsonb_build_array(c.effectiveness_low, c.effectiveness_high), 'owner', c.owner_principal_id);
    END LOOP;
    v_rl := round(v_il * v_keep_low, 6); v_rh := round(v_ih * v_keep_high, 6);
    v_comp := v_comp || CASE WHEN jsonb_array_length(v_controls) = 0 THEN '; no control declared: residual = inherent'
                             ELSE format('; residual = inherent × Π(1 − effectiveness) over %s control(s): low × %s, high × %s (the conservative end stays conservative)', jsonb_array_length(v_controls), round(v_keep_low, 6), round(v_keep_high, 6)) END;
    SELECT * INTO a FROM prediction.risk_appetites r WHERE r.tenant_id = x.tenant_id AND r.domain_id = x.domain_id AND r.category_key = x.category_key ORDER BY r.version DESC LIMIT 1;
    IF a.appetite_id IS NULL THEN
      v_comp := v_comp || format('; no appetite approved for category %s: nothing judged', x.category_key);
    ELSIF a.unit <> v.unit THEN
      v_comp := v_comp || format('; the appetite of %s is stated in %s, the assessment in %s: nothing judged (no conversion invented)', x.category_key, a.unit, v.unit);
    ELSE
      v_breach := v_rh > a.threshold;
      v_app := jsonb_build_object('appetite_id', a.appetite_id, 'version', a.version, 'threshold', a.threshold, 'unit', a.unit, 'statement', a.statement, 'approved_by', a.approved_by);
      v_comp := v_comp || format('; appetite %s v%s: residual high %s %s %s the threshold %s', x.category_key, a.version, v_rh, v.unit, CASE WHEN v_breach THEN 'exceeds' ELSE 'is within' END, a.threshold);
    END IF;
  ELSE
    v_rl := round(v_il, 6); v_rh := round(v_ih, 6);
    v_comp := v_comp || '; an opportunity''s value is not reduced by controls and is not judged against a risk appetite: residual = inherent';
  END IF;
  RETURN jsonb_build_object('exposure_id', p_exposure, 'version', p_version, 'polarity', x.polarity, 'inherent_low', round(v_il, 6), 'inherent_high', round(v_ih, 6),
                            'residual_low', v_rl, 'residual_high', v_rh, 'unit', v.unit, 'controls', v_controls, 'computation', v_comp,
                            'appetite', v_app, 'breach', v_breach);
END $$;
GRANT EXECUTE ON FUNCTION prediction.exposure_residual_of(uuid, int) TO eye_app, eye_commit;

-- STORE a residual (internal: the acceptance and the control ports) — the row, `exposure.residual_computed`, and on a breach
-- `exposure.appetite_breached` (routing is its own governed write: prediction.route_exposure).
CREATE OR REPLACE FUNCTION prediction.exposure_store_residual(p_exposure uuid, p_cause text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; r jsonb; v_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO x FROM prediction.exposure_current WHERE exposure_id = p_exposure;
  IF x.accepted_version IS NULL THEN RETURN NULL; END IF;
  r := prediction.exposure_residual_of(p_exposure, x.accepted_version);
  INSERT INTO prediction.exposure_residuals (residual_id, scope, tenant_id, domain_id, exposure_id, version, inherent_low, inherent_high, residual_low, residual_high, unit, controls, computation,
                                            appetite_id, appetite_version, threshold, breach, computed_by, cause, correlation_id)
  VALUES (v_id, 'DOMAIN', x.tenant_id, x.domain_id, p_exposure, x.accepted_version, (r ->> 'inherent_low')::numeric, (r ->> 'inherent_high')::numeric, (r ->> 'residual_low')::numeric,
          (r ->> 'residual_high')::numeric, r ->> 'unit', r -> 'controls', r ->> 'computation', (r #>> '{appetite,appetite_id}')::uuid, (r #>> '{appetite,version}')::int,
          (r #>> '{appetite,threshold}')::numeric, (r ->> 'breach')::boolean, p_actor, p_cause, p_correlation);
  PERFORM prediction.exposure_event(p_exposure, x.tenant_id, x.domain_id, 'exposure.residual_computed', p_actor,
    jsonb_build_object('residual_id', v_id, 'version', x.accepted_version, 'cause', p_cause, 'residual', jsonb_build_array(r -> 'residual_low', r -> 'residual_high'), 'unit', r ->> 'unit', 'breach', r -> 'breach'), p_correlation);
  IF (r ->> 'breach')::boolean IS TRUE THEN
    PERFORM prediction.exposure_event(p_exposure, x.tenant_id, x.domain_id, 'exposure.appetite_breached', p_actor,
      jsonb_build_object('residual_id', v_id, 'residual_high', r -> 'residual_high', 'unit', r ->> 'unit', 'appetite', r -> 'appetite', 'category', x.category_key), p_correlation);
  END IF;
  RETURN r || jsonb_build_object('residual_id', v_id, 'cause', p_cause);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.exposure_store_residual(uuid,text,uuid,uuid) FROM PUBLIC;

-- ADD A VERSION (internal: the human assessment and the agent estimate). The shape is checked here — the caller's request (22023); the
-- evidence must be objects of this domain (23503).
CREATE OR REPLACE FUNCTION prediction.exposure_add_version(p_exposure uuid, p_tenant uuid, p_domain uuid, p_a jsonb, p_kind text, p_run uuid, p_rule text, p_based_on int,
                                                          p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, objects, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v_n int; e jsonb; k text; v_digest text; v_keys text[] := '{}';
        v_pl numeric; v_ph numeric; v_il numeric; v_ih numeric;
BEGIN
  SELECT * INTO x FROM prediction.exposure_current WHERE exposure_id = p_exposure FOR UPDATE;
  IF p_a IS NULL OR jsonb_typeof(p_a) <> 'object' THEN RAISE EXCEPTION 'exposure assessment rejected: the assessment is an object' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_a) LOOP
    IF k NOT IN ('mechanism', 'probability', 'plausibility', 'impact', 'horizon', 'response_window_hours', 'velocity', 'reversibility', 'controllability', 'options', 'evidence', 'confidence', 'basis') THEN
      RAISE EXCEPTION 'exposure assessment rejected: the assessment carries the unknown key %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF length(btrim(coalesce(p_a ->> 'mechanism', ''))) NOT BETWEEN 8 AND 4096 THEN RAISE EXCEPTION 'exposure assessment rejected: the mechanism is stated (8..4096 characters) — how the change becomes a loss or a gain' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_a -> 'probability') = 'object' THEN
    IF jsonb_typeof(p_a #> '{probability,low}') <> 'number' OR jsonb_typeof(p_a #> '{probability,high}') <> 'number' THEN RAISE EXCEPTION 'exposure assessment rejected: the probability is a bracket {low, high} in [0, 1]' USING ERRCODE = '22023'; END IF;
    v_pl := (p_a #>> '{probability,low}')::numeric; v_ph := (p_a #>> '{probability,high}')::numeric;
    IF v_pl < 0 OR v_ph > 1 OR v_pl > v_ph THEN RAISE EXCEPTION 'exposure assessment rejected: the probability is a bracket {low, high} in [0, 1] with low ≤ high' USING ERRCODE = '22023'; END IF;
  ELSIF p_a ? 'probability' AND jsonb_typeof(p_a -> 'probability') <> 'null' THEN
    RAISE EXCEPTION 'exposure assessment rejected: the probability is a bracket {low, high} in [0, 1] (a point estimate is false precision — state a bracket)' USING ERRCODE = '22023';
  END IF;
  IF p_a ? 'plausibility' AND jsonb_typeof(p_a -> 'plausibility') <> 'null' AND coalesce(p_a ->> 'plausibility', '') NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'exposure assessment rejected: plausibility is low, medium or high' USING ERRCODE = '22023';
  END IF;
  IF v_pl IS NULL AND coalesce(p_a ->> 'plausibility', '') NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'exposure assessment rejected: a probability bracket or a plausibility is stated — the likelihood is never left out' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_a -> 'impact') <> 'object' OR jsonb_typeof(p_a #> '{impact,low}') <> 'number' OR jsonb_typeof(p_a #> '{impact,high}') <> 'number'
     OR length(btrim(coalesce(p_a #>> '{impact,unit}', ''))) NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'exposure assessment rejected: the impact (a risk''s consequence, an opportunity''s value) is a range {low, high, unit}' USING ERRCODE = '22023';
  END IF;
  v_il := (p_a #>> '{impact,low}')::numeric; v_ih := (p_a #>> '{impact,high}')::numeric;
  IF v_il < 0 OR v_il > v_ih THEN RAISE EXCEPTION 'exposure assessment rejected: the impact range has 0 ≤ low ≤ high' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_a ->> 'horizon', ''))) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'exposure assessment rejected: the horizon is stated (1..64 characters)' USING ERRCODE = '22023'; END IF;
  IF p_a ? 'response_window_hours' AND jsonb_typeof(p_a -> 'response_window_hours') <> 'null'
     AND (jsonb_typeof(p_a -> 'response_window_hours') <> 'number' OR (p_a ->> 'response_window_hours')::numeric NOT BETWEEN 1 AND 8760 OR (p_a ->> 'response_window_hours')::numeric <> floor((p_a ->> 'response_window_hours')::numeric)) THEN
    RAISE EXCEPTION 'exposure assessment rejected: the response window is a whole number of hours in [1, 8760]' USING ERRCODE = '22023';
  END IF;
  IF p_a ? 'velocity' AND jsonb_typeof(p_a -> 'velocity') <> 'null' AND coalesce(p_a ->> 'velocity', '') NOT IN ('days', 'weeks', 'months', 'years') THEN RAISE EXCEPTION 'exposure assessment rejected: velocity is days, weeks, months or years' USING ERRCODE = '22023'; END IF;
  IF p_a ? 'reversibility' AND jsonb_typeof(p_a -> 'reversibility') <> 'null' AND coalesce(p_a ->> 'reversibility', '') NOT IN ('reversible', 'partly_reversible', 'irreversible') THEN RAISE EXCEPTION 'exposure assessment rejected: reversibility is reversible, partly_reversible or irreversible' USING ERRCODE = '22023'; END IF;
  IF p_a ? 'controllability' AND jsonb_typeof(p_a -> 'controllability') <> 'null' AND coalesce(p_a ->> 'controllability', '') NOT IN ('high', 'medium', 'low') THEN RAISE EXCEPTION 'exposure assessment rejected: controllability is high, medium or low' USING ERRCODE = '22023'; END IF;
  IF p_a ? 'confidence' AND jsonb_typeof(p_a -> 'confidence') <> 'null' AND (jsonb_typeof(p_a -> 'confidence') <> 'number' OR (p_a ->> 'confidence')::numeric NOT BETWEEN 0 AND 1) THEN RAISE EXCEPTION 'exposure assessment rejected: confidence is in [0, 1]' USING ERRCODE = '22023'; END IF;
  IF p_a ? 'options' AND (jsonb_typeof(p_a -> 'options') <> 'array' OR jsonb_array_length(p_a -> 'options') > 20) THEN RAISE EXCEPTION 'exposure assessment rejected: options is a list of at most 20 {key, label, kind, cost?}' USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_a -> 'options', '[]'::jsonb)) LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'key', '') !~ '^[a-z][a-z0-9_-]{0,63}$' OR length(btrim(coalesce(e ->> 'label', ''))) NOT BETWEEN 2 AND 256
       OR coalesce(e ->> 'kind', '') NOT IN ('mitigate', 'exploit', 'accept', 'transfer', 'avoid', 'defer')
       OR (e ? 'cost' AND jsonb_typeof(e -> 'cost') NOT IN ('number', 'null')) THEN
      RAISE EXCEPTION 'exposure assessment rejected: each option is {key: [a-z][a-z0-9_-]*, label, kind: mitigate|exploit|accept|transfer|avoid|defer, cost?: number}' USING ERRCODE = '22023';
    END IF;
    IF (e ->> 'key') = ANY (v_keys) THEN RAISE EXCEPTION 'exposure assessment rejected: the option key % is named twice', e ->> 'key' USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || (e ->> 'key');
  END LOOP;
  IF p_a ? 'evidence' AND (jsonb_typeof(p_a -> 'evidence') <> 'array' OR jsonb_array_length(p_a -> 'evidence') > 50) THEN RAISE EXCEPTION 'exposure assessment rejected: evidence is a list of at most 50 {object_id, version?}' USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_a -> 'evidence', '[]'::jsonb)) LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'object_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR (e ? 'version' AND jsonb_typeof(e -> 'version') <> 'number') THEN
      RAISE EXCEPTION 'exposure assessment rejected: each evidence item is {object_id: uuid, version?: number}' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = (e ->> 'object_id')::uuid AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                     AND (NOT (e ? 'version') OR o.object_version = (e ->> 'version')::bigint)) THEN
      RAISE EXCEPTION 'exposure assessment rejected: no such evidence object % in this domain', e ->> 'object_id' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  v_n := x.current_version + 1;
  v_digest := encode(sha256(convert_to(jsonb_build_object('exposure_id', p_exposure, 'version', v_n, 'assessment', p_a, 'assessed_kind', p_kind)::text, 'UTF8')), 'hex');
  INSERT INTO prediction.exposure_versions (exposure_id, version, scope, tenant_id, domain_id, mechanism, probability_low, probability_high, plausibility, impact_low, impact_high, unit, horizon,
                                            response_window_hours, velocity, reversibility, controllability, options, evidence, confidence, basis, assessment, digest, assessed_by, assessed_kind,
                                            agent_run_id, estimate_rule, based_on_version, correlation_id)
  VALUES (p_exposure, v_n, 'DOMAIN', p_tenant, p_domain, btrim(p_a ->> 'mechanism'), v_pl, v_ph, NULLIF(p_a ->> 'plausibility', ''), v_il, v_ih, btrim(p_a #>> '{impact,unit}'), btrim(p_a ->> 'horizon'),
          (p_a ->> 'response_window_hours')::int, p_a ->> 'velocity', p_a ->> 'reversibility', p_a ->> 'controllability', coalesce(p_a -> 'options', '[]'::jsonb), coalesce(p_a -> 'evidence', '[]'::jsonb),
          (p_a ->> 'confidence')::numeric, p_a ->> 'basis', p_a, v_digest, p_actor, p_kind, p_run, p_rule, p_based_on, p_correlation);
  UPDATE prediction.exposure_current SET current_version = v_n, state = CASE WHEN state = 'identified' THEN 'assessed' ELSE state END, updated_at = clock_timestamp() WHERE exposure_id = p_exposure;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, CASE p_kind WHEN 'agent' THEN 'exposure.estimated' ELSE 'exposure.assessed' END, p_actor,
    jsonb_build_object('version', v_n, 'digest', v_digest, 'assessed_kind', p_kind, 'agent_run_id', p_run, 'estimate_rule', p_rule, 'based_on_version', p_based_on,
                       'competes_with_accepted', x.accepted_version IS NOT NULL), p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'version', v_n, 'digest', v_digest, 'state', 'proposed', 'assessed_kind', p_kind, 'competes_with_accepted', x.accepted_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.exposure_add_version(uuid,uuid,uuid,jsonb,text,uuid,text,int,uuid,uuid) FROM PUBLIC;

-- ── the ports ──────────────────────────────────────────────────────────────────────────────────────────────────────────
-- REGISTER an exposure on a declared RSK (identify, JRN-08/-09 entry): the polarity, the category of the taxonomy in force, the OWNER
-- (a named, active risk_owner — never left unowned), the review cadence; the drivers seeded from the RSK's rests_on.
CREATE OR REPLACE FUNCTION prediction.register_exposure(p_exposure uuid, p_tenant uuid, p_domain uuid, p_polarity text, p_category text, p_owner uuid, p_review_every_days int,
                                                       p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, identity, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.strategy_current%ROWTYPE; t prediction.risk_taxonomy%ROWTYPE; v_pol text; v_n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM graph.strategy_current x WHERE x.strategy_object_id = p_exposure AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR s.object_type <> 'RSK' THEN RAISE EXCEPTION 'exposure rejected: no such RSK % in this domain (declare it through the Strategy Graph first)', p_exposure USING ERRCODE = '23503'; END IF;
  IF s.status <> 'active' THEN RAISE EXCEPTION 'exposure rejected (not_active): RSK % is %, not active', p_exposure, s.status USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM prediction.exposure_current x WHERE x.exposure_id = p_exposure) THEN
    RAISE EXCEPTION 'exposure rejected (duplicate): RSK % is registered already', p_exposure USING ERRCODE = '22023';
  END IF;
  IF p_polarity IS NULL OR p_polarity NOT IN ('risk', 'opportunity') THEN RAISE EXCEPTION 'exposure rejected: polarity is risk or opportunity' USING ERRCODE = '22023'; END IF;
  t := prediction.risk_taxonomy_current(p_tenant, p_domain);
  IF t.taxonomy_id IS NULL THEN RAISE EXCEPTION 'exposure rejected (no_taxonomy): this domain has no risk taxonomy; an exposure is filed under a category' USING ERRCODE = '22023'; END IF;
  SELECT c ->> 'polarity' INTO v_pol FROM jsonb_array_elements(t.categories) c WHERE c ->> 'key' = p_category;
  IF v_pol IS NULL THEN RAISE EXCEPTION 'exposure rejected: no category % in taxonomy version %', coalesce(p_category, '<none>'), t.version USING ERRCODE = '23503'; END IF;
  IF v_pol NOT IN (p_polarity, 'both') THEN RAISE EXCEPTION 'exposure rejected: category % files the polarity %, not %', p_category, v_pol, p_polarity USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT prediction.is_exposure_owner_eligible(p_owner, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'exposure rejected (owner): the owner % is not a named, active risk owner of this domain — a material risk or opportunity is never left unowned', coalesce(p_owner::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_review_every_days IS NOT NULL AND p_review_every_days NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'exposure rejected: the review cadence is 1..366 days' USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.exposure_current (exposure_id, scope, tenant_id, domain_id, polarity, category_key, taxonomy_version, owner_principal_id, review_every_days, registered_by, correlation_id)
  VALUES (p_exposure, 'DOMAIN', p_tenant, p_domain, p_polarity, p_category, t.version, p_owner, p_review_every_days, p_actor, p_correlation);
  INSERT INTO prediction.exposure_drivers (driver_row_id, scope, tenant_id, domain_id, exposure_id, driver_kind, driver_id, source, note, declared_by, correlation_id)
  SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_exposure, d.depends_on_kind, d.depends_on_id, 'rests_on', d.rationale, p_actor, p_correlation
    FROM graph.dependencies d
   WHERE d.dependent_object_id = p_exposure AND d.state = 'active' AND d.depends_on_kind IN ('entity', 'claim', 'edge', 'strategy')
  ON CONFLICT ON CONSTRAINT pexd_once DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.registered', p_actor,
    jsonb_build_object('polarity', p_polarity, 'category', p_category, 'taxonomy_version', t.version, 'owner', p_owner, 'review_every_days', p_review_every_days, 'drivers', v_n, 'title', s.title), p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'polarity', p_polarity, 'category', p_category, 'taxonomy_version', t.version, 'owner', p_owner, 'state', 'identified', 'drivers', v_n, 'title', s.title);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.register_exposure(uuid,uuid,uuid,text,text,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.register_exposure(uuid,uuid,uuid,text,text,uuid,int,uuid,uuid) TO eye_commit;

-- ASSESS (a named human proposes a version; an accepted version stands until its owner accepts another — the competing assessment is
-- PRESERVED beside it, never overwritten: PR-27-005).
CREATE OR REPLACE FUNCTION prediction.assess_exposure(p_exposure uuid, p_tenant uuid, p_domain uuid, p_expected_version int, p_assessment jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.assess']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure assessment rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'exposure assessment rejected: an assessment is a named human''s act; an agent estimates under its own run' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure assessment rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure assessment rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS DISTINCT FROM x.current_version THEN
    RAISE EXCEPTION 'exposure assessment rejected (stale_version): the exposure stands at version %, not %', x.current_version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
  END IF;
  RETURN prediction.exposure_add_version(p_exposure, p_tenant, p_domain, p_assessment, 'human', NULL, NULL, NULLIF(x.current_version, 0), p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.assess_exposure(uuid,uuid,uuid,int,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.assess_exposure(uuid,uuid,uuid,int,jsonb,uuid,uuid) TO eye_commit;

-- CONTEST a version (the JRN-08 challenge): someone other than its assessor, with a reason. A contested ACCEPTED version marks the
-- exposure contested: it is refused by an aggregation until its owner accepts a version again.
CREATE OR REPLACE FUNCTION prediction.contest_exposure_assessment(p_exposure uuid, p_tenant uuid, p_domain uuid, p_version int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v prediction.exposure_versions%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.contest']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure assessment rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure assessment rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM prediction.exposure_versions w WHERE w.exposure_id = p_exposure AND w.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure assessment rejected: no such version % of exposure %', p_version, p_exposure USING ERRCODE = '23503'; END IF;
  IF v.assessed_by = p_actor THEN RAISE EXCEPTION 'exposure assessment rejected: the assessor of version % does not contest it (a challenge is another person''s)', p_version USING ERRCODE = '42501'; END IF;
  IF v.state NOT IN ('proposed', 'accepted') THEN RAISE EXCEPTION 'exposure assessment rejected (state): version % is %; only a proposed or accepted version is contested', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'exposure assessment rejected: a challenge states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE prediction.exposure_versions SET state = 'contested', state_changed_at = clock_timestamp(), state_changed_by = p_actor, state_reason = btrim(p_reason)
   WHERE exposure_id = p_exposure AND version = p_version;
  IF v.state = 'accepted' AND x.state <> 'closed' THEN UPDATE prediction.exposure_current SET state = 'contested', updated_at = clock_timestamp() WHERE exposure_id = p_exposure; END IF;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.assessment_contested', p_actor,
    jsonb_build_object('version', p_version, 'was', v.state, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'version', p_version, 'state', 'contested', 'was', v.state, 'exposure_state', CASE WHEN v.state = 'accepted' THEN 'contested' ELSE x.state END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.contest_exposure_assessment(uuid,uuid,uuid,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.contest_exposure_assessment(uuid,uuid,uuid,int,text,uuid,uuid) TO eye_commit;

-- ACCEPT the assessment (OBJ-22: the risk owner accepts the current exposure model — the EXACT version by its digest, eligibility, the
-- consequence previewed beside it): the OWNER only (a named, active human); the version proposed or contested; the earlier accepted and
-- the earlier open versions superseded; the residual stored with its computation and the appetite judged.
CREATE OR REPLACE FUNCTION prediction.accept_exposure_assessment(p_exposure uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v prediction.exposure_versions%ROWTYPE; r jsonb; v_sup int[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.accept']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure acceptance rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure acceptance rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF x.owner_principal_id IS DISTINCT FROM p_actor OR NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'exposure acceptance rejected: the assessment is accepted by the exposure''s owner (%), a named, active human — never by another person or an agent', x.owner_principal_id USING ERRCODE = '42501';
  END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure acceptance rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM prediction.exposure_versions w WHERE w.exposure_id = p_exposure AND w.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure acceptance rejected: no such version % of exposure %', p_version, p_exposure USING ERRCODE = '23503'; END IF;
  IF v.state = 'accepted' THEN RAISE EXCEPTION 'exposure acceptance rejected (already_accepted): version % is the accepted assessment since %', p_version, x.accepted_at USING ERRCODE = '22023'; END IF;
  IF v.state = 'superseded' THEN RAISE EXCEPTION 'exposure acceptance rejected (superseded): version % was superseded', p_version USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM v.digest THEN
    RAISE EXCEPTION 'exposure acceptance rejected (stale_digest): the digest accepted is not version %''s (%…) — preview the version again', p_version, left(v.digest, 12) USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_rationale)), 0) < 8 THEN RAISE EXCEPTION 'exposure acceptance rejected: an acceptance states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(array_agg(w.version ORDER BY w.version), '{}') INTO v_sup FROM prediction.exposure_versions w
   WHERE w.exposure_id = p_exposure AND w.version <> p_version AND (w.state = 'accepted' OR (w.state IN ('proposed', 'contested') AND w.version < p_version));
  UPDATE prediction.exposure_versions SET state = 'superseded', state_changed_at = clock_timestamp(), state_changed_by = p_actor, state_reason = format('superseded by the acceptance of version %s', p_version)
   WHERE exposure_id = p_exposure AND version = ANY (v_sup);
  UPDATE prediction.exposure_versions SET state = 'accepted', state_changed_at = clock_timestamp(), state_changed_by = p_actor, state_reason = btrim(p_rationale)
   WHERE exposure_id = p_exposure AND version = p_version;
  UPDATE prediction.exposure_current SET accepted_version = p_version, accepted_by = p_actor, accepted_at = clock_timestamp(),
         state = CASE WHEN state = 'sponsored' THEN 'sponsored' ELSE 'accepted' END, updated_at = clock_timestamp()
   WHERE exposure_id = p_exposure;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.assessment_accepted', p_actor,
    jsonb_build_object('version', p_version, 'digest', v.digest, 'rationale', btrim(p_rationale), 'superseded', to_jsonb(v_sup), 'assessed_kind', v.assessed_kind, 'assessed_by', v.assessed_by), p_correlation);
  r := prediction.exposure_store_residual(p_exposure, 'acceptance', p_actor, p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'version', p_version, 'digest', v.digest, 'state', 'accepted', 'superseded', to_jsonb(v_sup), 'residual', r,
                            'route_due', (r ->> 'breach')::boolean IS TRUE);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.accept_exposure_assessment(uuid,uuid,uuid,int,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.accept_exposure_assessment(uuid,uuid,uuid,int,text,text,uuid,uuid) TO eye_commit;

-- THE CONSEQUENCE PREVIEW (a read; OBJ-22/UX-35-004): what accepting version N would do — the version and its digest, the residual it would
-- compute now with the appetite judged, the versions it would supersede, whom a breach routes to — nothing written.
CREATE OR REPLACE FUNCTION prediction.preview_exposure_acceptance(p_exposure uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v prediction.exposure_versions%ROWTYPE; r jsonb; v_sup int[];
BEGIN
  SELECT * INTO x FROM prediction.exposure_current WHERE exposure_id = p_exposure;
  SELECT * INTO v FROM prediction.exposure_versions WHERE exposure_id = p_exposure AND version = p_version;
  IF x.exposure_id IS NULL OR v.exposure_id IS NULL THEN RETURN NULL; END IF;
  r := prediction.exposure_residual_of(p_exposure, p_version);
  -- the residual of THIS version with the controls standing (exposure_residual_of reads the version asked, not the accepted one)
  SELECT coalesce(array_agg(w.version ORDER BY w.version), '{}') INTO v_sup FROM prediction.exposure_versions w
   WHERE w.exposure_id = p_exposure AND w.version <> p_version AND (w.state = 'accepted' OR (w.state IN ('proposed', 'contested') AND w.version < p_version));
  RETURN jsonb_build_object('exposure_id', p_exposure, 'version', p_version, 'digest', v.digest, 'state', v.state, 'assessed_kind', v.assessed_kind, 'assessed_by', v.assessed_by,
                            'eligible', jsonb_build_object('owner', x.owner_principal_id, 'rule', 'the exposure''s owner — a named, active risk owner — accepts; an agent never does'),
                            'acceptable', v.state IN ('proposed', 'contested') AND x.state <> 'closed',
                            'would_supersede', to_jsonb(v_sup), 'residual', r,
                            'consequence', CASE WHEN (r ->> 'breach')::boolean IS TRUE THEN format('the residual exceeds the appetite of %s: accepting records the breach and routes a warning candidate to the owner', x.category_key)
                                                WHEN x.polarity = 'opportunity' THEN 'the value range becomes the accepted assessment the sponsor sees; nothing is routed'
                                                WHEN (r ->> 'breach') IS NULL THEN 'no appetite judged: the residual is recorded; nothing is routed'
                                                ELSE 'the residual is within appetite: recorded; nothing is routed' END);
END $$;
GRANT EXECUTE ON FUNCTION prediction.preview_exposure_acceptance(uuid, int) TO eye_app, eye_commit;

-- ADD A CONTROL (risk only): the effectiveness bracket and its owner (a named, active human); an accepted exposure's residual is computed
-- again (a new row; a breach re-judged).
CREATE OR REPLACE FUNCTION prediction.add_exposure_control(p_control_id uuid, p_exposure uuid, p_tenant uuid, p_domain uuid, p_title text, p_kind text, p_eff_low numeric, p_eff_high numeric,
                                                          p_owner uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; r jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.control.add']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure control rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure control rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF x.polarity <> 'risk' THEN RAISE EXCEPTION 'exposure control rejected: a control reduces a risk''s exposure; % is an opportunity', p_exposure USING ERRCODE = '22023'; END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure control rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_title)), 0) NOT BETWEEN 3 AND 256 THEN RAISE EXCEPTION 'exposure control rejected: a control has a title (3..256 characters)' USING ERRCODE = '22023'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('preventive', 'detective', 'corrective') THEN RAISE EXCEPTION 'exposure control rejected: the kind is preventive, detective or corrective' USING ERRCODE = '22023'; END IF;
  IF p_eff_low IS NULL OR p_eff_high IS NULL OR p_eff_low < 0 OR p_eff_high > 1 OR p_eff_low > p_eff_high THEN
    RAISE EXCEPTION 'exposure control rejected: the effectiveness is a bracket {low, high} in [0, 1] with low ≤ high' USING ERRCODE = '22023';
  END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN RAISE EXCEPTION 'exposure control rejected (owner): a control is owned by a named, active human' USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.exposure_controls (control_id, scope, tenant_id, domain_id, exposure_id, title, control_kind, effectiveness_low, effectiveness_high, owner_principal_id, declared_by, correlation_id)
  VALUES (p_control_id, 'DOMAIN', p_tenant, p_domain, p_exposure, btrim(p_title), p_kind, p_eff_low, p_eff_high, p_owner, p_actor, p_correlation);
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.control_added', p_actor,
    jsonb_build_object('control_id', p_control_id, 'title', btrim(p_title), 'kind', p_kind, 'effectiveness', jsonb_build_array(p_eff_low, p_eff_high), 'owner', p_owner), p_correlation);
  r := prediction.exposure_store_residual(p_exposure, 'control', p_actor, p_correlation);
  RETURN jsonb_build_object('control_id', p_control_id, 'exposure_id', p_exposure, 'residual', r, 'route_due', (r ->> 'breach')::boolean IS TRUE);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.add_exposure_control(uuid,uuid,uuid,uuid,text,text,numeric,numeric,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.add_exposure_control(uuid,uuid,uuid,uuid,text,text,numeric,numeric,uuid,uuid,uuid) TO eye_commit;

-- ROUTE an appetite breach (AI-52-005: a material exposure routes to its accountable owner and the warning workflow): the LATEST residual,
-- when it breaches, is SUBMITTED as a warning candidate (0088 §0 intake, origin `exposure`, key exposure:<id>:residual:<residual>) — the
-- lifecycle (§W) clusters or raises it, routed to the exposure's owner; a repeat answers `repeated` with the same candidate.
CREATE OR REPLACE FUNCTION prediction.route_exposure(p_exposure uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; r prediction.exposure_residuals%ROWTYPE; v prediction.exposure_versions%ROWTYPE; s graph.strategy_current%ROWTYPE; v_cand jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.route']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure routing rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure routing rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure routing rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM prediction.exposure_residuals k WHERE k.exposure_id = p_exposure ORDER BY k.computed_at DESC, k.residual_id DESC LIMIT 1;
  IF r.residual_id IS NULL OR r.breach IS NOT TRUE THEN
    RAISE EXCEPTION 'exposure routing rejected (no_breach): exposure %''s latest residual %', p_exposure,
      CASE WHEN r.residual_id IS NULL THEN 'is not computed (no accepted assessment)' WHEN r.breach IS NULL THEN 'is not judged against an appetite' ELSE 'is within appetite' END USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM prediction.exposure_versions w WHERE w.exposure_id = p_exposure AND w.version = r.version;
  SELECT * INTO s FROM graph.strategy_current g WHERE g.strategy_object_id = p_exposure;
  v_cand := prediction.submit_warning_candidate(p_tenant, p_domain, 'exposure', format('exposure:%s:residual:%s', p_exposure, r.residual_id),
    jsonb_build_object('exposure_id', p_exposure, 'residual_id', r.residual_id, 'version', r.version, 'polarity', x.polarity, 'category', x.category_key, 'owner', x.owner_principal_id,
                       'appetite_id', r.appetite_id, 'appetite_version', r.appetite_version, 'threshold', r.threshold, 'residual_high', r.residual_high, 'unit', r.unit, 'synthetic', false),
    left(format('Exposure "%s" outside appetite (%s): residual up to %s %s against %s', s.title, x.category_key, r.residual_high, r.unit, r.threshold), 300),
    'C3', v.confidence, format('exposure:%s', p_exposure),
    jsonb_build_object('objectives', to_jsonb(prediction.exposure_objectives(p_exposure)), 'assets', '[]'::jsonb, 'actors', '[]'::jsonb, 'geographies', '[]'::jsonb, 'horizon', v.horizon),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('object_id', e ->> 'object_id', 'version', e -> 'version', 'stance', 'supporting')), '[]'::jsonb) FROM jsonb_array_elements(v.evidence) e),
    v.response_window_hours, p_actor, p_correlation);
  UPDATE prediction.exposure_current SET routed_candidate_id = (v_cand ->> 'candidate_id')::uuid, updated_at = clock_timestamp() WHERE exposure_id = p_exposure;
  IF (v_cand ->> 'repeated')::boolean IS NOT TRUE THEN
    PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.routed', p_actor,
      jsonb_build_object('candidate_id', v_cand ->> 'candidate_id', 'residual_id', r.residual_id, 'routed_to', x.owner_principal_id, 'consequence', 'C3'), p_correlation);
  END IF;
  RETURN jsonb_build_object('exposure_id', p_exposure, 'residual_id', r.residual_id, 'candidate', v_cand, 'routed_to', x.owner_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.route_exposure(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.route_exposure(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- DECLARE AN OPPORTUNITY HYPOTHESIS (JRN-09 discover → evidence → option → value range): a new version per opportunity; the required
-- capabilities are CAP nodes of the Strategy Graph in this domain.
CREATE OR REPLACE FUNCTION prediction.declare_opportunity_hypothesis(p_hypothesis_id uuid, p_exposure uuid, p_tenant uuid, p_domain uuid, p_statement text, p_falsifier text, p_value jsonb,
                                                                    p_timing jsonb, p_options jsonb, p_capabilities uuid[], p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v_n int; c uuid; k text; e jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.hypothesis.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure hypothesis rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure hypothesis rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF x.polarity <> 'opportunity' THEN RAISE EXCEPTION 'exposure hypothesis rejected: a hypothesis states an opportunity; % is a risk', p_exposure USING ERRCODE = '22023'; END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure hypothesis rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_statement)), 0) NOT BETWEEN 8 AND 4096 OR coalesce(length(btrim(p_falsifier)), 0) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'exposure hypothesis rejected: a hypothesis states itself (8..4096 characters) and what would falsify it (8..2000)' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'object' OR jsonb_typeof(p_value -> 'low') <> 'number' OR jsonb_typeof(p_value -> 'high') <> 'number'
     OR (p_value ->> 'low')::numeric < 0 OR (p_value ->> 'low')::numeric > (p_value ->> 'high')::numeric OR length(btrim(coalesce(p_value ->> 'unit', ''))) NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'exposure hypothesis rejected: the value is a range {low, high, unit} with 0 ≤ low ≤ high — a single number is an unsupported value claim' USING ERRCODE = '22023';
  END IF;
  IF p_timing IS NULL OR jsonb_typeof(p_timing) <> 'object' OR length(btrim(coalesce(p_timing ->> 'window', ''))) NOT BETWEEN 2 AND 128 THEN
    RAISE EXCEPTION 'exposure hypothesis rejected: the timing names its window {window, from?, to?}' USING ERRCODE = '22023';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_timing) LOOP
    IF k NOT IN ('window', 'from', 'to') THEN RAISE EXCEPTION 'exposure hypothesis rejected: the timing carries the unknown key %', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' OR jsonb_array_length(p_options) > 20 THEN RAISE EXCEPTION 'exposure hypothesis rejected: options is a list of at most 20 {key, label}' USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_options) LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'key', '') !~ '^[a-z][a-z0-9_-]{0,63}$' OR length(btrim(coalesce(e ->> 'label', ''))) NOT BETWEEN 2 AND 256 THEN
      RAISE EXCEPTION 'exposure hypothesis rejected: each option is {key: [a-z][a-z0-9_-]*, label}' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH c IN ARRAY coalesce(p_capabilities, '{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = c AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'CAP') THEN
      RAISE EXCEPTION 'exposure hypothesis rejected: no such capability % in this domain (a CAP node of the Strategy Graph)', c USING ERRCODE = '23503';
    END IF;
  END LOOP;
  SELECT coalesce(max(version), 0) + 1 INTO v_n FROM prediction.opportunity_hypotheses h WHERE h.exposure_id = p_exposure;
  INSERT INTO prediction.opportunity_hypotheses (hypothesis_id, scope, tenant_id, domain_id, exposure_id, version, statement, falsifier, value_low, value_high, unit, timing, options, required_capabilities, declared_by, correlation_id)
  VALUES (p_hypothesis_id, 'DOMAIN', p_tenant, p_domain, p_exposure, v_n, btrim(p_statement), btrim(p_falsifier), (p_value ->> 'low')::numeric, (p_value ->> 'high')::numeric, btrim(p_value ->> 'unit'),
          p_timing, p_options, coalesce(p_capabilities, '{}'), p_actor, p_correlation);
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.hypothesis_declared', p_actor,
    jsonb_build_object('hypothesis_id', p_hypothesis_id, 'version', v_n, 'value', p_value, 'capabilities', to_jsonb(coalesce(p_capabilities, '{}'))), p_correlation);
  RETURN jsonb_build_object('hypothesis_id', p_hypothesis_id, 'exposure_id', p_exposure, 'version', v_n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_opportunity_hypothesis(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,uuid[],uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_opportunity_hypothesis(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,uuid[],uuid,uuid) TO eye_commit;

-- SPONSOR an opportunity (OBJ-23: an eligible sponsor creates an owned evaluation — objective, option, budget, conditions): a named,
-- active opportunity_sponsor; the EXACT version by its digest; never an agent's unaccepted estimate nor a contested version; the option
-- named is one of the version's. The evaluation (a DEC resting on the RSK and its package) is opened by the route right after, each its
-- own governed write, and linked by prediction.record_exposure_response.
CREATE OR REPLACE FUNCTION prediction.sponsor_opportunity(p_exposure uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_terms jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v prediction.exposure_versions%ROWTYPE; k text; e jsonb; v_terms jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.sponsor']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure sponsorship rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['opportunity_sponsor']) THEN
    RAISE EXCEPTION 'exposure sponsorship rejected: an opportunity is sponsored by a named, active opportunity sponsor — never by an agent' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM prediction.exposure_current e2 WHERE e2.exposure_id = p_exposure AND e2.tenant_id = p_tenant AND e2.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure sponsorship rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF x.polarity <> 'opportunity' THEN RAISE EXCEPTION 'exposure sponsorship rejected: % is a risk; a risk is accepted by its owner, not sponsored', p_exposure USING ERRCODE = '22023'; END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure sponsorship rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  IF x.sponsor_principal_id IS NOT NULL THEN RAISE EXCEPTION 'exposure sponsorship rejected (already_sponsored): exposure % was sponsored at % by %', p_exposure, x.sponsored_at, x.sponsor_principal_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM prediction.exposure_versions w WHERE w.exposure_id = p_exposure AND w.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure sponsorship rejected: no such version % of exposure %', p_version, p_exposure USING ERRCODE = '23503'; END IF;
  IF p_digest IS DISTINCT FROM v.digest THEN RAISE EXCEPTION 'exposure sponsorship rejected (stale_digest): the digest sponsored is not version %''s (%…)', p_version, left(v.digest, 12) USING ERRCODE = '22023'; END IF;
  IF v.state IN ('superseded', 'contested') THEN RAISE EXCEPTION 'exposure sponsorship rejected (state): version % is %; a superseded or contested value range is not sponsored', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF v.assessed_kind = 'agent' AND v.state <> 'accepted' THEN
    RAISE EXCEPTION 'exposure sponsorship rejected (agent_estimate): version % is the Opportunity Agent''s unaccepted estimate — a sponsor sponsors a human''s assessment or an accepted one', p_version USING ERRCODE = '22023';
  END IF;
  IF p_terms IS NULL OR jsonb_typeof(p_terms) <> 'object' THEN RAISE EXCEPTION 'exposure sponsorship rejected: the terms are {option_key, rationale, conditions, budget?, objective_id?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_terms) LOOP
    IF k NOT IN ('option_key', 'rationale', 'conditions', 'budget', 'objective_id') THEN RAISE EXCEPTION 'exposure sponsorship rejected: the terms carry the unknown key %', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.options) o WHERE o ->> 'key' = p_terms ->> 'option_key') THEN
    RAISE EXCEPTION 'exposure sponsorship rejected: the option % is not one of version %''s options', coalesce(p_terms ->> 'option_key', '<none>'), p_version USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_terms ->> 'rationale', ''))) < 8 THEN RAISE EXCEPTION 'exposure sponsorship rejected: a sponsorship states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_terms -> 'conditions') <> 'array' OR jsonb_array_length(p_terms -> 'conditions') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'exposure sponsorship rejected: a sponsorship states its conditions (1..20 lines)' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_terms -> 'conditions') LOOP
    IF jsonb_typeof(e) <> 'string' OR length(btrim(e #>> '{}')) < 4 THEN RAISE EXCEPTION 'exposure sponsorship rejected: each condition is a line of 4+ characters' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_terms ? 'budget' AND jsonb_typeof(p_terms -> 'budget') <> 'null'
     AND (jsonb_typeof(p_terms -> 'budget') <> 'object' OR jsonb_typeof(p_terms #> '{budget,amount}') <> 'number' OR (p_terms #>> '{budget,amount}')::numeric < 0 OR length(btrim(coalesce(p_terms #>> '{budget,unit}', ''))) NOT BETWEEN 1 AND 32) THEN
    RAISE EXCEPTION 'exposure sponsorship rejected: the budget is {amount ≥ 0, unit}' USING ERRCODE = '22023';
  END IF;
  IF p_terms ? 'objective_id' AND jsonb_typeof(p_terms -> 'objective_id') <> 'null' THEN
    IF coalesce(p_terms ->> 'objective_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = (p_terms ->> 'objective_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ') THEN
      RAISE EXCEPTION 'exposure sponsorship rejected: no such objective % in this domain', p_terms ->> 'objective_id' USING ERRCODE = '23503';
    END IF;
  END IF;
  v_terms := p_terms || jsonb_build_object('version', p_version, 'digest', v.digest, 'value', jsonb_build_object('low', v.impact_low, 'high', v.impact_high, 'unit', v.unit));
  UPDATE prediction.exposure_current SET sponsor_principal_id = p_actor, sponsored_version = p_version, sponsorship = v_terms, sponsored_at = clock_timestamp(), state = 'sponsored', updated_at = clock_timestamp()
   WHERE exposure_id = p_exposure;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.sponsored', p_actor, v_terms, p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'sponsor', p_actor, 'version', p_version, 'digest', v.digest, 'terms', v_terms, 'state', 'sponsored', 'evaluation_owed', true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.sponsor_opportunity(uuid,uuid,uuid,int,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.sponsor_opportunity(uuid,uuid,uuid,int,text,jsonb,uuid,uuid) TO eye_commit;

-- RECORD A RESPONSE (the link from an exposure to the decision that answers it): the exposure's owner, its sponsor or a domain
-- administrator; the DEC must REST ON the RSK (a strategy dependency) and the package must bind that DEC. mitigate | transfer | avoid are a
-- risk's, exploit an opportunity's, accept either's.
CREATE OR REPLACE FUNCTION prediction.record_exposure_response(p_response_id uuid, p_exposure uuid, p_tenant uuid, p_domain uuid, p_kind text, p_decision uuid, p_package uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v_pkg_dec uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.respond']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure response rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure response rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF p_actor IS DISTINCT FROM x.owner_principal_id AND p_actor IS DISTINCT FROM x.sponsor_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'exposure response rejected: a response is opened by the exposure''s owner (%), its sponsor or a domain administrator', x.owner_principal_id USING ERRCODE = '42501';
  END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure response rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('mitigate', 'exploit', 'accept', 'transfer', 'avoid') THEN RAISE EXCEPTION 'exposure response rejected: the kind is mitigate, exploit, accept, transfer or avoid' USING ERRCODE = '22023'; END IF;
  IF (x.polarity = 'risk' AND p_kind = 'exploit') OR (x.polarity = 'opportunity' AND p_kind IN ('mitigate', 'transfer', 'avoid')) THEN
    RAISE EXCEPTION 'exposure response rejected: % is not a response to this %', p_kind, x.polarity USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = p_decision AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'DEC') THEN
    RAISE EXCEPTION 'exposure response rejected: no such decision % in this domain', p_decision USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM graph.dependencies d WHERE d.dependent_object_id = p_decision AND d.depends_on_kind = 'strategy' AND d.depends_on_id = p_exposure AND d.state = 'active') THEN
    RAISE EXCEPTION 'exposure response rejected: decision % does not rest on exposure % (the DEC names the RSK in its rests_on)', p_decision, p_exposure USING ERRCODE = '22023';
  END IF;
  SELECT pk.decision_object_id INTO v_pkg_dec FROM decision.packages_current pk WHERE pk.package_id = p_package AND pk.tenant_id = p_tenant AND pk.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure response rejected: no such package % in this domain', p_package USING ERRCODE = '23503'; END IF;
  IF v_pkg_dec <> p_decision THEN RAISE EXCEPTION 'exposure response rejected: package % binds decision %, not %', p_package, v_pkg_dec, p_decision USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM prediction.exposure_responses q WHERE q.exposure_id = p_exposure AND q.package_id = p_package) THEN
    RETURN (SELECT jsonb_build_object('response_id', q.response_id, 'exposure_id', q.exposure_id, 'kind', q.response_kind, 'decision_object_id', q.decision_object_id, 'package_id', q.package_id, 'repeated', true)
              FROM prediction.exposure_responses q WHERE q.exposure_id = p_exposure AND q.package_id = p_package);
  END IF;
  INSERT INTO prediction.exposure_responses (response_id, scope, tenant_id, domain_id, exposure_id, response_kind, decision_object_id, package_id, opened_by, correlation_id)
  VALUES (p_response_id, 'DOMAIN', p_tenant, p_domain, p_exposure, p_kind, p_decision, p_package, p_actor, p_correlation);
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.response_opened', p_actor,
    jsonb_build_object('response_id', p_response_id, 'kind', p_kind, 'decision_object_id', p_decision, 'package_id', p_package), p_correlation);
  RETURN jsonb_build_object('response_id', p_response_id, 'exposure_id', p_exposure, 'kind', p_kind, 'decision_object_id', p_decision, 'package_id', p_package, 'repeated', false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_exposure_response(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_exposure_response(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) TO eye_commit;

-- CLOSE an exposure with its criterion and reason (PR-28-005 "close it with reason"): the owner, the sponsor or a domain administrator.
CREATE OR REPLACE FUNCTION prediction.close_exposure(p_exposure uuid, p_tenant uuid, p_domain uuid, p_criterion text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; v_closure jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure closure rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure closure rejected: no such exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF p_actor IS DISTINCT FROM x.owner_principal_id AND p_actor IS DISTINCT FROM x.sponsor_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'exposure closure rejected: an exposure is closed by its owner (%), its sponsor or a domain administrator', x.owner_principal_id USING ERRCODE = '42501';
  END IF;
  IF x.state = 'closed' THEN RAISE EXCEPTION 'exposure closure rejected (closed): exposure % was closed at %', p_exposure, x.closed_at USING ERRCODE = '22023'; END IF;
  IF p_criterion IS NULL OR p_criterion NOT IN ('resolved', 'mitigated', 'realized', 'expired', 'pursued', 'abandoned', 'duplicate', 'withdrawn') THEN
    RAISE EXCEPTION 'exposure closure rejected: the criterion is resolved, mitigated, realized, expired, pursued, abandoned, duplicate or withdrawn' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'exposure closure rejected: a closure states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_closure := jsonb_build_object('criterion', p_criterion, 'reason', btrim(p_reason), 'by', p_actor, 'state_before', x.state);
  UPDATE prediction.exposure_current SET state = 'closed', closure = v_closure, closed_at = clock_timestamp(), updated_at = clock_timestamp() WHERE exposure_id = p_exposure;
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.closed', p_actor, v_closure, p_correlation);
  RETURN jsonb_build_object('exposure_id', p_exposure, 'state', 'closed', 'closure', v_closure);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.close_exposure(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.close_exposure(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- A CORRELATION ROW (internal): the pair ordered, both exposures of this domain and of one polarity.
CREATE OR REPLACE FUNCTION prediction.exposure_record_correlation(p_row uuid, p_tenant uuid, p_domain uuid, p_a uuid, p_b uuid, p_relation text, p_coefficient numeric, p_basis text,
                                                                  p_kind text, p_run uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_a uuid := least(p_a, p_b); v_b uuid := greatest(p_a, p_b); pa text; pb text;
BEGIN
  IF p_a IS NULL OR p_b IS NULL OR p_a = p_b THEN RAISE EXCEPTION 'exposure correlation rejected: a correlation names two different exposures' USING ERRCODE = '22023'; END IF;
  SELECT polarity INTO pa FROM prediction.exposure_current WHERE exposure_id = v_a AND tenant_id = p_tenant AND domain_id = p_domain;
  SELECT polarity INTO pb FROM prediction.exposure_current WHERE exposure_id = v_b AND tenant_id = p_tenant AND domain_id = p_domain;
  IF pa IS NULL OR pb IS NULL THEN RAISE EXCEPTION 'exposure correlation rejected: no such exposure % in this domain', CASE WHEN pa IS NULL THEN v_a ELSE v_b END USING ERRCODE = '23503'; END IF;
  IF p_relation IS NULL OR p_relation NOT IN ('independent', 'correlated', 'comonotone') THEN RAISE EXCEPTION 'exposure correlation rejected: the relation is independent, correlated or comonotone' USING ERRCODE = '22023'; END IF;
  IF p_coefficient IS NOT NULL AND (p_coefficient < -1 OR p_coefficient > 1) THEN RAISE EXCEPTION 'exposure correlation rejected: the coefficient is in [-1, 1]' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_basis)), 0) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'exposure correlation rejected: a correlation states its basis (8..2000 characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO prediction.exposure_correlations (correlation_row_id, scope, tenant_id, domain_id, exposure_a, exposure_b, relation, coefficient, basis, estimated_kind, agent_run_id, recorded_by, correlation_id)
  VALUES (p_row, 'DOMAIN', p_tenant, p_domain, v_a, v_b, p_relation, p_coefficient, btrim(p_basis), p_kind, p_run, p_actor, p_correlation);
  PERFORM prediction.exposure_event(v_a, p_tenant, p_domain, 'exposure.correlation_recorded', p_actor,
    jsonb_build_object('correlation_row_id', p_row, 'with', v_b, 'relation', p_relation, 'coefficient', p_coefficient, 'estimated_kind', p_kind, 'agent_run_id', p_run), p_correlation);
  RETURN jsonb_build_object('correlation_row_id', p_row, 'exposure_a', v_a, 'exposure_b', v_b, 'relation', p_relation, 'coefficient', p_coefficient, 'estimated_kind', p_kind, 'basis', btrim(p_basis));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.exposure_record_correlation(uuid,uuid,uuid,uuid,uuid,text,numeric,text,text,uuid,uuid,uuid) FROM PUBLIC;

-- DECLARE a correlation (a named human; the only kind an aggregation uses).
CREATE OR REPLACE FUNCTION prediction.declare_exposure_correlation(p_row uuid, p_tenant uuid, p_domain uuid, p_a uuid, p_b uuid, p_relation text, p_coefficient numeric, p_basis text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.correlation.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure correlation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'exposure correlation rejected: a declared correlation is a named human''s act; an agent estimates under its own run' USING ERRCODE = '42501';
  END IF;
  RETURN prediction.exposure_record_correlation(p_row, p_tenant, p_domain, p_a, p_b, p_relation, p_coefficient, p_basis, 'human', NULL, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_exposure_correlation(uuid,uuid,uuid,uuid,uuid,text,numeric,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_exposure_correlation(uuid,uuid,uuid,uuid,uuid,text,numeric,text,uuid,uuid) TO eye_commit;

-- AGGREGATE (PR-27-005, WS-09 "prevent invalid aggregation"): members of ONE polarity and ONE unit, each OWNED, with an ACCEPTED,
-- uncontested, unclosed assessment inside its review cadence — any other member REFUSES the roll-up, every reason named.
--   CLUSTERS: members joined by a SHARED DRIVER or by a HUMAN-declared `correlated` / `comonotone` relation are one cluster; a cluster
--             counts ONCE — its MAX residual (the comonotone bound: the same driver is one event, never two losses);
--   BETWEEN CLUSTERS: a SUM only where a human declared every cross-cluster pair `independent`; otherwise the total is a RANGE from the
--             largest cluster (full dependence) to the sum of the clusters (no diversification assumed) — method `bounded`, never a
--             single number that assumes what nobody declared. An agent's estimate is listed, never used.
CREATE OR REPLACE FUNCTION prediction.aggregate_exposures(p_aggregation_id uuid, p_tenant uuid, p_domain uuid, p_members uuid[], p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m uuid; x prediction.exposure_current%ROWTYPE; r prediction.exposure_residuals%ROWTYPE; v_pol text; v_unit text; v_problems text[] := '{}';
        v_members jsonb := '[]'::jsonb; v_label jsonb := '{}'::jsonb; v_changed boolean := true; a uuid; b uuid; la text; lb text;
        v_clusters jsonb := '[]'::jsonb; c record; v_all_indep boolean := true; v_n_clusters int; v_low numeric; v_high numeric; v_max_low numeric; v_method text; v_basis text;
        v_agent jsonb; v_distinct uuid[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.aggregate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure aggregation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT array_agg(DISTINCT u) INTO v_distinct FROM unnest(coalesce(p_members, '{}')) u;
  IF coalesce(array_length(v_distinct, 1), 0) < 2 OR array_length(v_distinct, 1) > 100 OR array_length(v_distinct, 1) <> array_length(p_members, 1) THEN
    RAISE EXCEPTION 'exposure aggregation rejected: an aggregation names 2..100 different exposures' USING ERRCODE = '22023';
  END IF;
  FOREACH m IN ARRAY v_distinct LOOP
    SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = m AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'exposure aggregation rejected: no such exposure % in this domain', m USING ERRCODE = '23503'; END IF;
    IF v_pol IS NULL THEN v_pol := x.polarity; ELSIF v_pol <> x.polarity THEN RAISE EXCEPTION 'exposure aggregation rejected: risks and opportunities are not rolled up together' USING ERRCODE = '22023'; END IF;
    IF NOT prediction.is_exposure_owner_eligible(x.owner_principal_id, p_tenant, p_domain) THEN v_problems := v_problems || format('%s unowned (its owner is no longer an active risk owner)', m); END IF;
    IF x.state = 'closed' THEN v_problems := v_problems || format('%s closed', m);
    ELSIF x.accepted_version IS NULL THEN
      v_problems := v_problems || format('%s unaccepted (%s)', m, CASE WHEN x.current_version = 0 THEN 'never assessed'
                                                                  WHEN EXISTS (SELECT 1 FROM prediction.exposure_versions w WHERE w.exposure_id = m AND w.assessed_kind = 'agent' AND w.state = 'proposed') THEN 'only proposed versions — an agent''s estimate among them is a recommendation, never an input'
                                                                  ELSE 'only proposed versions' END);
    ELSIF x.state = 'contested' THEN v_problems := v_problems || format('%s contested (its accepted assessment is challenged; competing assessments are preserved, not rolled up)', m);
    ELSIF x.review_every_days IS NOT NULL AND x.accepted_at + make_interval(days => x.review_every_days) < clock_timestamp() THEN
      v_problems := v_problems || format('%s stale (accepted %s, review every %s days)', m, to_char(x.accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), x.review_every_days);
    END IF;
    SELECT * INTO r FROM prediction.exposure_residuals k WHERE k.exposure_id = m AND k.version = x.accepted_version ORDER BY k.computed_at DESC, k.residual_id DESC LIMIT 1;
    IF x.accepted_version IS NOT NULL AND r.residual_id IS NULL THEN v_problems := v_problems || format('%s has no residual computed', m); END IF;
    IF r.residual_id IS NOT NULL THEN
      IF v_unit IS NULL THEN v_unit := r.unit; ELSIF v_unit <> r.unit THEN v_problems := v_problems || format('%s is stated in %s, not %s (no conversion invented)', m, r.unit, v_unit); END IF;
      v_members := v_members || jsonb_build_object('exposure_id', m, 'residual_id', r.residual_id, 'version', r.version, 'low', r.residual_low, 'high', r.residual_high, 'unit', r.unit);
    END IF;
    v_label := v_label || jsonb_build_object(m::text, m::text);
  END LOOP;
  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'exposure aggregation rejected (invalid_members): % — nothing is rolled up; each owner resolves their exposure first', array_to_string(v_problems, '; ') USING ERRCODE = '22023';
  END IF;
  -- CLUSTERS: label propagation over the shared drivers and the human-declared dependence (the latest human row of a pair stands).
  WHILE v_changed LOOP
    v_changed := false;
    FOR a, b IN
      SELECT d1.exposure_id, d2.exposure_id FROM prediction.exposure_drivers d1 JOIN prediction.exposure_drivers d2 ON d1.driver_kind = d2.driver_kind AND d1.driver_id = d2.driver_id AND d1.exposure_id < d2.exposure_id
       WHERE d1.exposure_id = ANY (v_distinct) AND d2.exposure_id = ANY (v_distinct)
      UNION
      SELECT q.exposure_a, q.exposure_b FROM (SELECT DISTINCT ON (k.exposure_a, k.exposure_b) k.* FROM prediction.exposure_correlations k
                                                WHERE k.estimated_kind = 'human' AND k.exposure_a = ANY (v_distinct) AND k.exposure_b = ANY (v_distinct)
                                                ORDER BY k.exposure_a, k.exposure_b, k.recorded_at DESC, k.correlation_row_id DESC) q
       WHERE q.relation IN ('correlated', 'comonotone')
    LOOP
      la := v_label ->> a::text; lb := v_label ->> b::text;
      IF la <> lb THEN
        v_label := (SELECT jsonb_object_agg(key, CASE WHEN value #>> '{}' IN (la, lb) THEN to_jsonb(least(la, lb)) ELSE value END) FROM jsonb_each(v_label));
        v_changed := true;
      END IF;
    END LOOP;
  END LOOP;
  FOR c IN
    SELECT l.value #>> '{}' AS cluster, array_agg(l.key::uuid ORDER BY l.key) AS members,
           max((mm ->> 'low')::numeric) AS low, max((mm ->> 'high')::numeric) AS high, sum((mm ->> 'high')::numeric) AS sum_high
      FROM jsonb_each(v_label) l JOIN jsonb_array_elements(v_members) mm ON mm ->> 'exposure_id' = l.key
     GROUP BY l.value #>> '{}' ORDER BY 1
  LOOP
    v_clusters := v_clusters || jsonb_build_object('members', to_jsonb(c.members), 'low', c.low, 'high', c.high, 'members_sum_high', c.sum_high,
      'shared_drivers', (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('kind', d1.driver_kind, 'id', d1.driver_id)), '[]'::jsonb)
                           FROM prediction.exposure_drivers d1 JOIN prediction.exposure_drivers d2 ON d1.driver_kind = d2.driver_kind AND d1.driver_id = d2.driver_id AND d1.exposure_id < d2.exposure_id
                          WHERE d1.exposure_id = ANY (c.members) AND d2.exposure_id = ANY (c.members)),
      'rule', CASE WHEN array_length(c.members, 1) = 1 THEN 'one member: its residual' ELSE 'shared drivers or declared dependence: counted ONCE — the largest member''s residual (the comonotone bound)' END);
  END LOOP;
  v_n_clusters := jsonb_array_length(v_clusters);
  -- independence across clusters: every cross-cluster pair's latest human row says `independent`
  FOR a, b IN SELECT x1.key::uuid, x2.key::uuid FROM jsonb_each(v_label) x1 JOIN jsonb_each(v_label) x2 ON x1.key < x2.key AND x1.value <> x2.value LOOP
    IF NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (k.exposure_a, k.exposure_b) k.relation FROM prediction.exposure_correlations k
                                   WHERE k.estimated_kind = 'human' AND k.exposure_a = least(a, b) AND k.exposure_b = greatest(a, b)
                                   ORDER BY k.exposure_a, k.exposure_b, k.recorded_at DESC, k.correlation_row_id DESC) q WHERE q.relation = 'independent') THEN
      v_all_indep := false;
    END IF;
  END LOOP;
  SELECT sum((cl ->> 'low')::numeric), sum((cl ->> 'high')::numeric), max((cl ->> 'low')::numeric) INTO v_low, v_high, v_max_low FROM jsonb_array_elements(v_clusters) cl;
  IF v_n_clusters = 1 THEN
    v_method := 'max'; v_low := (v_clusters -> 0 ->> 'low')::numeric; v_high := (v_clusters -> 0 ->> 'high')::numeric;
    v_basis := 'one cluster: every member shares a driver or a declared dependence — counted once, its largest residual';
  ELSIF v_all_indep THEN
    v_method := 'sum';
    v_basis := format('%s clusters, every cross-cluster pair declared independent by a named human: the clusters'' residuals add', v_n_clusters);
  ELSE
    v_method := 'bounded'; v_low := v_max_low;   -- the largest cluster's low (full dependence); the high stays the clusters' sum
    v_basis := format('%s clusters whose dependence nobody declared: the total runs from the largest cluster (full dependence) to the sum of the clusters (no diversification assumed) — not a single number', v_n_clusters);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('pair', jsonb_build_array(q.exposure_a, q.exposure_b), 'relation', q.relation, 'coefficient', q.coefficient, 'basis', q.basis, 'agent_run_id', q.agent_run_id)), '[]'::jsonb) INTO v_agent
    FROM (SELECT DISTINCT ON (k.exposure_a, k.exposure_b) k.* FROM prediction.exposure_correlations k
           WHERE k.estimated_kind = 'agent' AND k.exposure_a = ANY (v_distinct) AND k.exposure_b = ANY (v_distinct)
           ORDER BY k.exposure_a, k.exposure_b, k.recorded_at DESC, k.correlation_row_id DESC) q;
  INSERT INTO prediction.exposure_aggregations (aggregation_id, scope, tenant_id, domain_id, polarity, unit, members, clusters, method, total_low, total_high, naive_sum_high, basis, agent_estimates_not_used, computed_by, correlation_id)
  VALUES (p_aggregation_id, 'DOMAIN', p_tenant, p_domain, v_pol, v_unit, v_members, v_clusters, v_method, v_low, v_high,
          (SELECT sum((mm ->> 'high')::numeric) FROM jsonb_array_elements(v_members) mm), v_basis, v_agent, p_actor, p_correlation);
  RETURN jsonb_build_object('aggregation_id', p_aggregation_id, 'polarity', v_pol, 'unit', v_unit, 'method', v_method, 'total', jsonb_build_object('low', v_low, 'high', v_high),
                            'naive_sum_high', (SELECT sum((mm ->> 'high')::numeric) FROM jsonb_array_elements(v_members) mm), 'clusters', v_clusters, 'members', v_members, 'basis', v_basis,
                            'agent_estimates_not_used', v_agent);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.aggregate_exposures(uuid,uuid,uuid,uuid[],uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.aggregate_exposures(uuid,uuid,uuid,uuid[],uuid,uuid) TO eye_commit;

-- THE AGENTS' ESTIMATE (AG-023/-024: identify exposure, likelihood, consequence and options; cannot accept residual risk nor commit
-- resources) — under prediction.exposure.estimate, by the agent in its OWN open run of its own kind. Rule `exposure-estimate@1`:
--   RE-ESTIMATE: an open exposure of the run's polarity with a human-assessed base version (the accepted one, else the latest human one):
--     every OPEN warning on an objective the exposure rests on (or routed from this exposure) moves the likelihood UP — the probability
--     bracket's upper bound halfway to 1 (a plausibility one level), once — and is cited as evidence; with no such warning nothing new is
--     known: the exposure is left UNCHANGED (no version). At most p_max versions; the rest WAIT for the next run. An exposure with no human
--     assessment WAITS (nothing to re-estimate — the agent invents no first estimate).
--   CORRELATE: every pair of open exposures of the polarity sharing a driver — `correlated` (`comonotone` when their driver sets are
--     equal) with the Jaccard overlap as the coefficient and the shared drivers as the basis; a pair whose latest agent row already says
--     the same is not repeated.
-- Everything it writes is PROPOSED: a version waits for the owner's acceptance; a correlation estimate is never used by an aggregation.
CREATE OR REPLACE FUNCTION prediction.estimate_exposures(p_tenant uuid, p_domain uuid, p_polarity text, p_run uuid, p_max int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; b prediction.exposure_versions%ROWTYPE; v_run executive.agent_runs%ROWTYPE; v_warn jsonb; v_a jsonb; v_out jsonb;
        v_estimated jsonb := '[]'::jsonb; v_waiting jsonb := '[]'::jsonb; v_unchanged jsonb := '[]'::jsonb; v_corr jsonb := '[]'::jsonb; v_n int := 0; v_max int := coalesce(p_max, 1000000);
        v_pl numeric; v_ph numeric; v_plaus text; pr record; v_rel text; v_jac numeric; v_basis text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.estimate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure estimate rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_polarity IS NULL OR p_polarity NOT IN ('risk', 'opportunity') THEN RAISE EXCEPTION 'exposure estimate rejected: the polarity is risk or opportunity' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_run FROM executive.agent_runs r WHERE r.run_id = p_run AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
  IF NOT FOUND OR v_run.principal_id IS DISTINCT FROM p_actor OR v_run.outcome <> 'running'
     OR v_run.agent_kind IS DISTINCT FROM p_polarity THEN   -- the agent kinds are named as the polarities: risk, opportunity
    RAISE EXCEPTION 'exposure estimate rejected: an estimate is made by the % agent in its own open run', p_polarity USING ERRCODE = '42501';
  END IF;
  IF p_max IS NOT NULL AND p_max < 0 THEN RAISE EXCEPTION 'exposure estimate rejected: max_items is ≥ 0' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT * FROM prediction.exposure_current e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.polarity = p_polarity AND e.state <> 'closed'
            ORDER BY e.registered_at, e.exposure_id LOOP
    SELECT * INTO b FROM prediction.exposure_versions w WHERE w.exposure_id = x.exposure_id AND w.assessed_kind = 'human' AND w.state <> 'superseded'
     ORDER BY (w.state = 'accepted') DESC, w.version DESC LIMIT 1;
    IF b.exposure_id IS NULL THEN
      v_waiting := v_waiting || jsonb_build_object('exposure_id', x.exposure_id, 'reason', 'no human assessment to re-estimate — the agent invents no first estimate');
      CONTINUE;
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('warning_id', w.warning_id, 'title', w.title, 'confidence', w.confidence) ORDER BY w.warning_id), '[]'::jsonb) INTO v_warn
      FROM prediction.warnings_current w
     WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state <> 'closed'
       AND ((w.origin_kind = 'exposure' AND w.origin_ref ->> 'exposure_id' = x.exposure_id::text)
            OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(w.affected -> 'objectives') = 'array' THEN w.affected -> 'objectives' ELSE '[]'::jsonb END) o
                        WHERE o = ANY (SELECT unnest(prediction.exposure_objectives(x.exposure_id))::text)));
    IF jsonb_array_length(v_warn) = 0 THEN
      v_unchanged := v_unchanged || jsonb_build_object('exposure_id', x.exposure_id, 'base_version', b.version, 'reason', 'no open warning on its objectives: nothing new is known — no estimate proposed');
      CONTINUE;
    END IF;
    -- the same base and the same warnings already estimated by this rule: nothing new
    IF EXISTS (SELECT 1 FROM prediction.exposure_versions w WHERE w.exposure_id = x.exposure_id AND w.assessed_kind = 'agent' AND w.based_on_version = b.version
                 AND w.assessment -> 'basis' = to_jsonb(format('exposure-estimate@1 over base v%s and warnings %s', b.version, (SELECT string_agg(e ->> 'warning_id', ',') FROM jsonb_array_elements(v_warn) e)))) THEN
      v_unchanged := v_unchanged || jsonb_build_object('exposure_id', x.exposure_id, 'base_version', b.version, 'reason', 'estimated already from the same base and the same warnings');
      CONTINUE;
    END IF;
    IF v_n >= v_max THEN
      v_waiting := v_waiting || jsonb_build_object('exposure_id', x.exposure_id, 'reason', format('max_items %s reached in this run: it waits for the next', v_max));
      CONTINUE;
    END IF;
    v_pl := b.probability_low; v_ph := CASE WHEN b.probability_high IS NULL THEN NULL ELSE round(b.probability_high + (1 - b.probability_high) / 2, 4) END;
    v_plaus := CASE b.plausibility WHEN 'low' THEN 'medium' WHEN 'medium' THEN 'high' WHEN 'high' THEN 'high' ELSE NULL END;
    v_a := b.assessment
           || jsonb_build_object('mechanism', left(b.mechanism || ' — re-estimated by the ' || p_polarity || ' agent: open warning(s) on the objectives it rests on raise the likelihood', 4096),
                                 'probability', CASE WHEN v_ph IS NULL THEN NULL ELSE jsonb_build_object('low', v_pl, 'high', v_ph) END,
                                 'plausibility', v_plaus,
                                 'evidence', coalesce(b.evidence, '[]'::jsonb) || (SELECT coalesce(jsonb_agg(jsonb_build_object('object_id', e ->> 'warning_id')), '[]'::jsonb)
                                                                                     FROM jsonb_array_elements(v_warn) e
                                                                                    WHERE EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = (e ->> 'warning_id')::uuid AND o.tenant_id = p_tenant AND o.domain_id = p_domain)),
                                 'basis', format('exposure-estimate@1 over base v%s and warnings %s', b.version, (SELECT string_agg(e ->> 'warning_id', ',') FROM jsonb_array_elements(v_warn) e)));
    IF v_ph IS NULL THEN v_a := v_a - 'probability'; END IF;
    IF v_plaus IS NULL THEN v_a := v_a - 'plausibility'; END IF;
    v_out := prediction.exposure_add_version(x.exposure_id, p_tenant, p_domain, v_a, 'agent', p_run, 'exposure-estimate@1', b.version, p_actor, p_correlation);
    v_estimated := v_estimated || (v_out || jsonb_build_object('base_version', b.version, 'warnings', v_warn));
    v_n := v_n + 1;
  END LOOP;
  -- CORRELATE the pairs that share a driver
  FOR pr IN
    SELECT d1.exposure_id AS a, d2.exposure_id AS b,
           (SELECT count(*) FROM prediction.exposure_drivers s1 JOIN prediction.exposure_drivers s2 ON s1.driver_kind = s2.driver_kind AND s1.driver_id = s2.driver_id WHERE s1.exposure_id = d1.exposure_id AND s2.exposure_id = d2.exposure_id) AS shared,
           (SELECT count(*) FROM (SELECT driver_kind, driver_id FROM prediction.exposure_drivers WHERE exposure_id IN (d1.exposure_id, d2.exposure_id) GROUP BY 1, 2) u) AS unioned,
           jsonb_agg(jsonb_build_object('kind', d1.driver_kind, 'id', d1.driver_id)) AS drivers
      FROM prediction.exposure_drivers d1 JOIN prediction.exposure_drivers d2 ON d1.driver_kind = d2.driver_kind AND d1.driver_id = d2.driver_id AND d1.exposure_id < d2.exposure_id
      JOIN prediction.exposure_current e1 ON e1.exposure_id = d1.exposure_id AND e1.polarity = p_polarity AND e1.state <> 'closed'
      JOIN prediction.exposure_current e2 ON e2.exposure_id = d2.exposure_id AND e2.polarity = p_polarity AND e2.state <> 'closed'
     WHERE d1.tenant_id = p_tenant AND d1.domain_id = p_domain
     GROUP BY d1.exposure_id, d2.exposure_id
     ORDER BY 1, 2
  LOOP
    v_jac := round(pr.shared::numeric / greatest(pr.unioned, 1), 4);
    v_rel := CASE WHEN pr.shared = pr.unioned THEN 'comonotone' ELSE 'correlated' END;
    v_basis := format('exposure-estimate@1: %s shared driver(s) of %s (Jaccard %s): %s', pr.shared, pr.unioned, v_jac, pr.drivers::text);
    IF EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (k.exposure_a, k.exposure_b) k.* FROM prediction.exposure_correlations k WHERE k.estimated_kind = 'agent' AND k.exposure_a = pr.a AND k.exposure_b = pr.b
                              ORDER BY k.exposure_a, k.exposure_b, k.recorded_at DESC, k.correlation_row_id DESC) q WHERE q.relation = v_rel AND q.coefficient = v_jac) THEN
      CONTINUE;
    END IF;
    v_corr := v_corr || prediction.exposure_record_correlation(gen_random_uuid(), p_tenant, p_domain, pr.a, pr.b, v_rel, v_jac, v_basis, 'agent', p_run, p_actor, p_correlation);
  END LOOP;
  RETURN jsonb_build_object('rule', 'exposure-estimate@1', 'polarity', p_polarity, 'run_id', p_run, 'estimated', v_estimated, 'waiting', v_waiting, 'unchanged', v_unchanged, 'correlations', v_corr,
                            'max_items', p_max, 'marked', 'agent-produced: proposed, never accepted by the agent');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.estimate_exposures(uuid,uuid,text,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.estimate_exposures(uuid,uuid,text,uuid,int,uuid,uuid) TO eye_commit;

-- ── the preflight (0088 §W) — re-declared AFTER the register it reads ──────────────────────────────────────────────────
-- 0088 §W copied whole (with its B28 integrator block); B32: ONE block — an exposure's warning routes to the EXPOSURE'S OWNER first
-- (PER-10: the accountable risk or opportunity owner), before the first affected objective's owner.
CREATE OR REPLACE FUNCTION prediction.warning_candidate_preflight(p_candidate uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c prediction.warning_candidates%ROWTYPE; d jsonb; v_owner uuid; v_fct uuid; v_deadline timestamptz;
        /* B28 integrator */ v_route uuid; v_by text; /* end B28 integrator */
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO c FROM prediction.warning_candidates x WHERE x.candidate_id = p_candidate AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'warning cluster rejected: no such candidate % in this domain', p_candidate USING ERRCODE = '23503'; END IF;
  IF c.state <> 'pending' THEN RETURN jsonb_build_object('decision', 'done', 'candidate_id', c.candidate_id, 'state', c.state, 'warning_id', c.warning_id, 'outcome', c.outcome); END IF;
  d := prediction.warning_decide_candidate(c, 0, p_actor, p_correlation);
  IF d ->> 'decision' <> 'raise' THEN RETURN d; END IF;
  SELECT s.owner_principal_id INTO v_owner FROM graph.strategy_current s JOIN identity.principals p ON p.id = s.owner_principal_id AND p.kind = 'human' AND p.status = 'active'
   WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ'
     AND s.strategy_object_id::text IN (SELECT jsonb_array_elements_text(prediction.warning_affected_list(c.affected, 'objectives')))
   ORDER BY s.strategy_object_id LIMIT 1;
  IF (c.origin_ref ->> 'forecast_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT f.forecast_id INTO v_fct FROM prediction.forecasts_current f WHERE f.forecast_id = (c.origin_ref ->> 'forecast_id')::uuid AND f.tenant_id = p_tenant AND f.domain_id = p_domain;
  END IF;
  BEGIN v_deadline := (c.origin_ref ->> 'decision_deadline')::timestamptz; EXCEPTION WHEN others THEN v_deadline := NULL; END;
  /* B28 integrator (found by the act: the attention agent raising after its tick became the routed owner): a warning is routed to a NAMED,
     ACTIVE HUMAN — the first affected objective's owner; else the acting person when a human; else the candidate's submitter when a human
     (the escalating analyst); else the origin's accountable owner (a stream rule's owner, a signal's disposer); none → the candidate stays
     PENDING, deferred with the reason (never routed to an agent). */
  v_route := v_owner; v_by := 'the first affected objective''s owner';
  /* B32 (0089) exposures: an exposure's warning routes to the EXPOSURE'S OWNER first (PER-10) — a named, active human; else as before */
  IF c.origin_kind = 'exposure' AND EXISTS (SELECT 1 FROM prediction.exposure_current x JOIN identity.principals p ON p.id = x.owner_principal_id AND p.kind = 'human' AND p.status = 'active'
                                             WHERE x.exposure_id::text = c.origin_ref ->> 'exposure_id' AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    SELECT x.owner_principal_id INTO v_route FROM prediction.exposure_current x WHERE x.exposure_id::text = c.origin_ref ->> 'exposure_id' AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    v_by := 'the exposure''s owner (PER-10: the accountable risk or opportunity owner)';
  END IF;
  /* end B32 exposures */
  IF v_route IS NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    v_route := p_actor; v_by := 'the acting person (no affected objective has an active human owner)';
  END IF;
  IF v_route IS NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = c.submitted_by AND p.kind = 'human' AND p.status = 'active') THEN
    v_route := c.submitted_by; v_by := 'the person who submitted the candidate (no affected objective has an active human owner)';
  END IF;
  IF v_route IS NULL AND c.origin_kind = 'stream_rule' AND (c.origin_ref ->> 'rule_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT r.owner_principal_id INTO v_route FROM prediction.stream_rules r JOIN identity.principals p ON p.id = r.owner_principal_id AND p.kind = 'human' AND p.status = 'active'
     WHERE r.rule_id = (c.origin_ref ->> 'rule_id')::uuid AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
    IF v_route IS NOT NULL THEN v_by := 'the stream rule''s owner (no affected objective has an active human owner)'; END IF;
  END IF;
  IF v_route IS NULL AND c.origin_kind = 'weak_signal' AND (c.origin_ref ->> 'signal_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT s.disposition_by INTO v_route FROM prediction.signals_current s JOIN identity.principals p ON p.id = s.disposition_by AND p.kind = 'human' AND p.status = 'active'
     WHERE s.signal_id = (c.origin_ref ->> 'signal_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    IF v_route IS NOT NULL THEN v_by := 'the person who escalated the signal (no affected objective has an active human owner)'; END IF;
  END IF;
  IF v_route IS NULL THEN
    RETURN jsonb_build_object('decision', 'deferred', 'candidate_id', c.candidate_id,
                              'reason', 'no named, active human to route the warning to (no affected objective owner; the actor, the submitter and the origin''s owner are not active humans) — it stays pending');
  END IF;
  /* end B28 integrator */
  RETURN d || jsonb_build_object('candidate', to_jsonb(c), 'routed_to', v_route, 'routed_by', v_by,
                                 'forecast_id', v_fct, 'decision_deadline', v_deadline, 'stance', prediction.warning_candidate_stance(c.evidence), 'now', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.warning_candidate_preflight(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.warning_candidate_preflight(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R6 THE PRIORITY — lexicographic over transparent dimensions (AI-52-003; ES-47-002: no opaque score)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- The sort key, ASCENDING = first: [appetite breach first, hours to the response window (sooner first), likelihood (higher first — the
-- probability bracket's upper bound, else the plausibility on the same axis: high 0.75, medium 0.5, low 0.25 — shown as words, never as a
-- probability), residual impact (higher first, in its own unit), irreversibility (irreversible first), controllability (low first),
-- strategic relevance (the objectives it rests on, more first)]. A NULL sorts after every number — a dimension with no input ranks last.
CREATE OR REPLACE FUNCTION prediction.exposure_priority_key(p_dims jsonb) RETURNS numeric[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT ARRAY[
    CASE WHEN jsonb_typeof(p_dims -> 'breach') = 'boolean' THEN CASE WHEN (p_dims ->> 'breach')::boolean THEN 0 ELSE 1 END END,
    CASE WHEN jsonb_typeof(p_dims -> 'hours_to_window') = 'number' THEN (p_dims ->> 'hours_to_window')::numeric END,
    CASE WHEN jsonb_typeof(p_dims -> 'probability_high') = 'number' THEN -((p_dims ->> 'probability_high')::numeric)
         WHEN p_dims ->> 'plausibility' = 'high' THEN -0.75 WHEN p_dims ->> 'plausibility' = 'medium' THEN -0.5 WHEN p_dims ->> 'plausibility' = 'low' THEN -0.25 END,
    CASE WHEN jsonb_typeof(p_dims -> 'residual_high') = 'number' THEN -((p_dims ->> 'residual_high')::numeric) END,
    CASE p_dims ->> 'reversibility' WHEN 'irreversible' THEN 0 WHEN 'partly_reversible' THEN 1 WHEN 'reversible' THEN 2 END,
    CASE p_dims ->> 'controllability' WHEN 'low' THEN 0 WHEN 'medium' THEN 1 WHEN 'high' THEN 2 END,
    CASE WHEN jsonb_typeof(p_dims -> 'objectives') = 'number' AND (p_dims ->> 'objectives')::numeric > 0 THEN -((p_dims ->> 'objectives')::numeric) END]
$$;
GRANT EXECUTE ON FUNCTION prediction.exposure_priority_key(jsonb) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.exposure_priority(p_dims jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  WITH d AS (SELECT coalesce(p_dims, '{}'::jsonb) AS x)
  SELECT jsonb_build_object(
    'key', to_jsonb(prediction.exposure_priority_key(x)),
    'order', jsonb_build_array('appetite breach (breached first)', 'hours to the response window (sooner first)', 'likelihood (higher first)', 'residual impact (higher first, in its own unit)',
                               'irreversibility (irreversible first)', 'controllability (low first)', 'strategic relevance (more objectives first)'),
    'rule', 'lexicographic: the first dimension that differs decides; a dimension with no input ranks after one with; no weighted score',
    'explanation', concat_ws(' · ',
      CASE WHEN jsonb_typeof(x -> 'breach') = 'boolean' THEN CASE WHEN (x ->> 'breach')::boolean THEN 'outside appetite' ELSE 'within appetite' END ELSE 'appetite: not judged' END,
      CASE WHEN jsonb_typeof(x -> 'hours_to_window') = 'number' THEN format('%s h response window', round((x ->> 'hours_to_window')::numeric, 1)) ELSE 'response window: no input' END,
      CASE WHEN jsonb_typeof(x -> 'probability_high') = 'number' THEN format('probability up to %s', x ->> 'probability_high')
           WHEN x ->> 'plausibility' IN ('low', 'medium', 'high') THEN format('plausibility %s', x ->> 'plausibility') ELSE 'likelihood: no input' END,
      CASE WHEN jsonb_typeof(x -> 'residual_high') = 'number' THEN format('residual up to %s %s', x ->> 'residual_high', coalesce(x ->> 'unit', '')) ELSE 'residual: no input' END,
      coalesce(x ->> 'reversibility', 'reversibility: no input'),
      CASE WHEN x ->> 'controllability' IN ('low', 'medium', 'high') THEN format('controllability %s', x ->> 'controllability') ELSE 'controllability: no input' END,
      CASE WHEN jsonb_typeof(x -> 'objectives') = 'number' AND (x ->> 'objectives')::numeric > 0 THEN format('%s objective(s)', x ->> 'objectives') ELSE 'strategic relevance: no input' END))
  FROM d
$$;
GRANT EXECUTE ON FUNCTION prediction.exposure_priority(jsonb) TO eye_app, eye_commit;

-- The dimensions of one exposure as they stand (the read the priority list and the page use): the ACCEPTED version when there is one,
-- else nothing (an unaccepted estimate is no input — shown as such).
CREATE OR REPLACE FUNCTION prediction.exposure_dimensions(p_exposure uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
           'breach', r.breach, 'hours_to_window', v.response_window_hours, 'probability_high', v.probability_high, 'plausibility', v.plausibility,
           'residual_high', r.residual_high, 'unit', coalesce(r.unit, v.unit), 'reversibility', v.reversibility, 'controllability', v.controllability,
           'objectives', cardinality(prediction.exposure_objectives(x.exposure_id))))
    FROM prediction.exposure_current x
    LEFT JOIN prediction.exposure_versions v ON v.exposure_id = x.exposure_id AND v.version = x.accepted_version
    LEFT JOIN LATERAL (SELECT k.* FROM prediction.exposure_residuals k WHERE k.exposure_id = x.exposure_id AND k.version = x.accepted_version ORDER BY k.computed_at DESC, k.residual_id DESC LIMIT 1) r ON true
   WHERE x.exposure_id = p_exposure
$$;
GRANT EXECUTE ON FUNCTION prediction.exposure_dimensions(uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §R7 THE HEALTH BRANCH — EXACTLY executive.health_measure_inputs' RETURNS TABLE (0089 §0)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- One row per exposure whose assessment was ACCEPTED at or before the instant and which was not closed by then: input_kind its polarity;
-- the value its RESIDUAL (upper end; the latest residual of that version computed at or before the instant — NULL when none: no input);
-- direction lower_better for a risk, higher_better for an opportunity; observed_at the accepted version's instant (when it was assessed);
-- expected_every_days its review cadence (NULL: none declared); confidence the assessment's own (NULL: none stated); the evidence the
-- version cites; the objectives the RSK rests on; the exposure block; the basis in words (a contested acceptance is said).
CREATE OR REPLACE FUNCTION prediction.health_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
  WITH acc AS (
    SELECT DISTINCT ON (e.exposure_id) e.exposure_id, (e.details ->> 'version')::int AS version, e.occurred_at AS accepted_at
      FROM prediction.exposure_events e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'exposure.assessment_accepted' AND e.occurred_at <= p_at
     ORDER BY e.exposure_id, e.occurred_at DESC, e.event_id DESC
  )
  SELECT x.polarity, x.exposure_id, acc.version::bigint, s.title, r.residual_high, v.unit,
         CASE x.polarity WHEN 'risk' THEN 'lower_better' ELSE 'higher_better' END,
         v.assessed_at, x.review_every_days::numeric, v.confidence,
         (SELECT coalesce(jsonb_agg(jsonb_build_object('object_id', ev ->> 'object_id', 'version', ev -> 'version')), '[]'::jsonb) FROM jsonb_array_elements(v.evidence) ev),
         prediction.exposure_objectives(x.exposure_id),
         CASE WHEN r.residual_id IS NULL THEN NULL
              ELSE jsonb_build_object('kind', x.polarity, 'id', x.exposure_id, 'amount', r.residual_high, 'unit', r.unit, 'basis', r.computation) END,
         format('%s %s (%s), version %s accepted %s%s; value = %s', x.polarity, x.exposure_id, x.category_key, acc.version, to_char(acc.accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                CASE WHEN EXISTS (SELECT 1 FROM prediction.exposure_events c WHERE c.exposure_id = x.exposure_id AND c.event = 'exposure.assessment_contested' AND c.occurred_at > acc.accepted_at AND c.occurred_at <= p_at
                                    AND (c.details ->> 'version')::int = acc.version)
                     THEN ' — CONTESTED since (a competing assessment pending)' ELSE '' END,
                CASE WHEN r.residual_id IS NULL THEN 'no residual computed at the instant (no input)'
                     ELSE format('the residual''s upper end %s %s (%s)', r.residual_high, r.unit, CASE WHEN r.breach IS TRUE THEN 'outside appetite' WHEN r.breach IS FALSE THEN 'within appetite' ELSE 'appetite not judged' END) END)
    FROM acc
    JOIN prediction.exposure_current x ON x.exposure_id = acc.exposure_id
    JOIN prediction.exposure_versions v ON v.exposure_id = acc.exposure_id AND v.version = acc.version
    JOIN graph.strategy_current s ON s.strategy_object_id = x.exposure_id
    LEFT JOIN LATERAL (SELECT k.* FROM prediction.exposure_residuals k WHERE k.exposure_id = acc.exposure_id AND k.version = acc.version AND k.computed_at <= p_at
                        ORDER BY k.computed_at DESC, k.residual_id DESC LIMIT 1) r ON true
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain
     AND NOT (x.closed_at IS NOT NULL AND x.closed_at <= p_at)
$$;
REVOKE ALL ON FUNCTION prediction.health_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.health_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `graph`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0089 §G — CP-6 B32 part `graph` (F-P6-09: the Strategy Graph's capabilities, initiatives, resources, measures, stakeholders and
-- alignment; V8 PR-37-001..006, CAP-DS-08, AT-37, PER-09). The prelude (§0) added the six TYPES; this section builds what they mean.
--
--   §G1 THE ALIGNMENTS — graph.alignments (+ graph.alignment_events, append-only): a person's declared relationship between two ACTIVE
--       strategy objects of this domain, typed by its ends — supports OBJ→CAP, builds INI→CAP, resources RSC→INI, measures MSR→OBJ,
--       affects STK→OBJ, conflicts_with OBJ↔OBJ or INI↔INI — with its declared strength, the claims and evidence it cites (resolved to
--       canonical objects of this domain) and its rationale. Every kind but conflicts_with is MIRRORED into graph.dependencies
--       (depends_on_kind 'strategy'; the dependent is the end that RESTS ON the other: the objective on the capability it needs, the
--       capability on the initiative building it, the initiative on its resource, the objective on its measure, the stakeholder on the
--       objective that affects them) so the impact walk and every GraphChanged reach reach them — never ASU (the ends are typed; 0088
--       §R's assumption reach is unchanged). A conflict is not a dependency (no mirror; it is a detection). Retirement removes the mirror
--       the alignment created (never one a declaration's rests_on created). Ports graph.declare_alignment / graph.retire_alignment.
--   §G2 THE MEASURES — graph.measures (the MSR object's measure: the measured objective, unit, direction, target value and date, the
--       freshness window, the definition version and digest, the approval state), graph.measure_observations (append-only: value, the
--       instant observed, the claim or evidence it was read from — a canonical object of this domain —, the recorder) and
--       graph.measure_events (append-only). graph.measure_freshness(tenant, domain, at): fresh | stale | no_observation per measure, and
--       whether a human authority's approval of the CURRENT definition stands at the instant. Ports graph.define_measure (records the
--       `measures` alignment with its mirror; a redefinition resets the approval) / graph.record_measure_observation (idempotent on
--       (measure, observed_at, source); a different value for the same key refused).
--   §G3 HUMAN AUTHORITY (PR-37-003) — graph.strategy_authority_acts (append-only, the 0042 decision.approvals shape): set_objective |
--       approve_measure | approve_tradeoff | allocate_resource, the DIGEST of the subject version the approver read (a stale digest
--       refused), eligible_by (the role the port found), expires_at, rationale, SEPARATION (the approver is never the subject's
--       declarer) — recorded only by a named, active human holding executive, decision_authority, domain_admin or strategy_owner
--       (human-gated at the PDP; an agent's attempt is refused there and its denial recorded). A subject with no active human owner is
--       refused (continuity: an owner is assigned first). Port graph.record_strategy_authority_act.
--   §G4 OWNERSHIP — graph.assign_strategy_owner: an owner transfer to an ACTIVE HUMAN holding a planning role in this domain
--       (strategy_owner, domain_admin, executive, decision_owner, decision_authority), by the current (active) owner or a strategy owner /
--       domain administrator, with its reason — the prelude's event `strategy.owner_assigned`. graph.strategy_review_route: where an
--       ownerless or contested object is routed (its owner; else its parent objective's owner; else the domain's strategy owners and
--       administrators) — never an agent.
--   §G5 THE DETECTIONS — graph.strategy_detections(tenant, domain, at): conflict (an active conflicts_with; resolved by an unexpired
--       approve_tradeoff act on its digest), stale_measure (stale or never observed), cycle (a recursive walk over the active strategy
--       dependencies, which carry the mirrors, with the PATH), missing_owner (an active object whose owner is not an active human — the
--       predicate 0088's warning routing uses) — each with its DECLARED CONTINUITY: `hold` (conflict, cycle: no health or alignment
--       claim is made over the held objects; both alternatives are preserved), `expose_affected_scope` (stale_measure: the measured
--       objectives named; the measure's input declared stale, never current), `route_to_owner` (missing_owner: routed to the planning
--       review) — and whom it is routed to.
--   §G6 THE GAP VIEW — graph.alignment_gaps(tenant, domain, objective?, at): per active objective × supporting capability (or the
--       objective alone, `no_capability`): the capability's evidence (count, the strongest truth state, the refs), the initiatives
--       building it (active, resourced by an APPROVED allocation), the objective's measures (approved, fresh), whether the objective is
--       SET by a human authority, the five criteria of alignment_rule@1 each with its basis, the count met (a transparent count, never
--       a weighted score), the gap reasons (capability_under_evidenced, …) and the open detections HOLDING the row — ordered
--       lexicographically (held first, then fewest criteria met, then the titles).
--   §G7 THE HEALTH INPUT — graph.health_inputs(tenant, domain, at) with EXACTLY the RETURNS TABLE of executive.health_measure_inputs
--       (0089 §0): one `measure` row per MSR whose current definition a human authority's approval covers at the instant — its latest
--       observation at or before the instant (value, observed_at, the source as evidence; NULLs when none: never imputed), direction,
--       unit, expected_every_days from the freshness window, the measured objectives, no confidence input, the basis in words.
--   §G8 graph.record_impact RE-DECLARED (0079 §6's body, the latest, copied whole): a TWENTIETH argument p_strategy_nodes (default
--       '[]') recorded on the new column invalidations_current.affected_strategy_nodes — the capabilities, initiatives, resources,
--       measures, stakeholders and risks/opportunities the walk reached — and counted in the invalidation.assessed details. Nothing
--       else changes; nothing is marked on the new types (they are listed for human review, as objectives are).
--
-- NOT HERE (stated): a GraphChanged kind for an alignment, a measure or an owner transfer (GRAPH_CHANGE_KINDS is unchanged — the
--   mirrors carry every later reach; no consumer's selection method changes, so no METHOD_REF moves); a revocation of an authority act
--   (append-only; an act lapses at its expiry, and a redefinition or a re-declaration makes the digest stale); gamed-measure detection
--   (the health part's anti-gaming); a scheduler for the detections (computed on read, as of the instant); graph.expected_strategy /
--   graph.rebuild_projection (the prelude's): a strategy row RE-INSERTED by a rebuild takes the canonical accountable owner, not a later
--   `strategy.owner_assigned` (the integrator's call); the interface register (unchanged, 50/0/0); no prediction.* / executive.* object.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G1 THE ALIGNMENTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE graph.alignments (
  alignment_id    uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('supports', 'builds', 'resources', 'measures', 'affects', 'conflicts_with')),
  from_id         uuid NOT NULL REFERENCES graph.strategy_current (strategy_object_id),
  from_type       text NOT NULL,
  to_id           uuid NOT NULL REFERENCES graph.strategy_current (strategy_object_id),
  to_type         text NOT NULL,
  strength        text NOT NULL CHECK (strength IN ('weak', 'moderate', 'strong')),
  evidence        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  rationale       text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 2000),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  -- the mirror row in graph.dependencies (NULL for conflicts_with); mirror_created: this alignment inserted it (retirement removes only such a row)
  dependency_id   uuid,
  mirror_created  boolean NOT NULL DEFAULT false,
  state           text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by      uuid,
  retired_at      timestamptz,
  retired_reason  text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT gal_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gal_no_self CHECK (from_id <> to_id),
  CONSTRAINT gal_mirror CHECK ((kind = 'conflicts_with') = (dependency_id IS NULL)),
  CONSTRAINT gal_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL) AND (retired_at IS NULL) = (retired_reason IS NULL))
);
CREATE UNIQUE INDEX gal_one_active ON graph.alignments (tenant_id, domain_id, kind, from_id, to_id) WHERE state = 'active';
CREATE INDEX gal_from ON graph.alignments (from_id, kind, state);
CREATE INDEX gal_to ON graph.alignments (to_id, kind, state);
COMMENT ON TABLE graph.alignments IS 'B32 (0089 §G1): a person''s declared alignment between two active strategy objects (supports OBJ→CAP, builds INI→CAP, resources RSC→INI, measures MSR→OBJ, affects STK→OBJ, conflicts_with OBJ↔OBJ | INI↔INI) with its strength, cited evidence and rationale; every kind but conflicts_with mirrored into graph.dependencies so the impact walk reaches it.';

CREATE TABLE graph.alignment_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  alignment_id       uuid NOT NULL REFERENCES graph.alignments (alignment_id),
  event              text NOT NULL CHECK (event IN ('alignment.declared', 'alignment.retired', 'alignment.tradeoff_decided', 'alignment.allocation_decided')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gale_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gale_alignment ON graph.alignment_events (alignment_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.alignment_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G2 THE MEASURES
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE graph.measures (
  measure_id         uuid PRIMARY KEY REFERENCES graph.strategy_current (strategy_object_id),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  objective_id       uuid NOT NULL REFERENCES graph.strategy_current (strategy_object_id),
  unit               text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 64),
  direction          text NOT NULL CHECK (direction IN ('higher_better', 'lower_better')),
  target_value       numeric NOT NULL,
  target_date        date,
  freshness_days     numeric NOT NULL CHECK (freshness_days > 0 AND freshness_days <= 3660),
  definition_version int NOT NULL CHECK (definition_version >= 1),
  definition_digest  text NOT NULL CHECK (definition_digest ~ '^[0-9a-f]{64}$'),
  approval_state     text NOT NULL DEFAULT 'proposed' CHECK (approval_state IN ('proposed', 'approved', 'rejected')),
  approval_act_id    uuid,
  defined_by         uuid NOT NULL,
  defined_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gms_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gms_approval CHECK ((approval_state = 'proposed') = (approval_act_id IS NULL))
);
CREATE INDEX gms_objective ON graph.measures (objective_id);
COMMENT ON TABLE graph.measures IS 'B32 (0089 §G2): the measure of an MSR strategy object — the measured objective, unit, direction, target value and date, freshness window, the definition version and digest a human authority approves (graph.strategy_authority_acts approve_measure); a redefinition resets the approval to proposed.';

CREATE TABLE graph.measure_observations (
  observation_id     uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  measure_id         uuid NOT NULL REFERENCES graph.measures (measure_id),
  value              numeric NOT NULL,
  observed_at        timestamptz NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  source_kind        text NOT NULL CHECK (source_kind IN ('claim', 'evidence')),
  source_id          uuid NOT NULL,
  source_version     bigint NOT NULL CHECK (source_version >= 1),
  note               text CHECK (note IS NULL OR length(note) <= 2000),
  recorded_by        uuid NOT NULL,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gmo_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX gmo_key ON graph.measure_observations (measure_id, observed_at, source_kind, source_id);
CREATE INDEX gmo_latest ON graph.measure_observations (measure_id, observed_at DESC, recorded_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.measure_observations
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.measure_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  measure_id         uuid NOT NULL REFERENCES graph.measures (measure_id),
  event              text NOT NULL CHECK (event IN ('measure.defined', 'measure.redefined', 'measure.approved', 'measure.rejected', 'measure.observed')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gmse_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gmse_measure ON graph.measure_events (measure_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.measure_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G3 HUMAN AUTHORITY (the 0042 decision.approvals shape)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE graph.strategy_authority_acts (
  act_id                uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  act_kind              text NOT NULL CHECK (act_kind IN ('set_objective', 'approve_measure', 'approve_tradeoff', 'allocate_resource')),
  subject_kind          text NOT NULL CHECK (subject_kind IN ('strategy', 'measure', 'alignment')),
  subject_id            uuid NOT NULL,
  subject_version       bigint NOT NULL CHECK (subject_version >= 1),
  /* The digest the approver read. It equals the subject version's own digest at recording time. */
  subject_digest        text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  decision              text NOT NULL CHECK (decision IN ('approve', 'reject')),
  rationale             text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 4096),
  /* How the port admitted the approver: 'role:<code>' (the first of executive, decision_authority, domain_admin, strategy_owner held). */
  eligible_by           text NOT NULL,
  approver_principal_id uuid NOT NULL,
  declarer_principal_id uuid NOT NULL,
  expires_at            timestamptz NOT NULL,
  recorded_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT gsa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gsa_separation CHECK (approver_principal_id <> declarer_principal_id),
  CONSTRAINT gsa_expiry CHECK (expires_at > recorded_at),
  CONSTRAINT gsa_kind_subject CHECK ((act_kind = 'set_objective' AND subject_kind = 'strategy') OR (act_kind = 'approve_measure' AND subject_kind = 'measure')
                                     OR (act_kind IN ('approve_tradeoff', 'allocate_resource') AND subject_kind = 'alignment'))
);
CREATE INDEX gsa_subject ON graph.strategy_authority_acts (subject_id, act_kind, recorded_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.strategy_authority_acts
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE graph.strategy_authority_acts IS 'B32 (0089 §G3, PR-37-003): the human authority''s acts on the Strategy Graph — set an objective, approve a measure, approve a trade-off, allocate a resource — each on the digest of the subject version read, by a named active human eligible by role, never the subject''s declarer, expiring; append-only.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['alignments', 'alignment_events', 'measures', 'measure_observations', 'measure_events', 'strategy_authority_acts'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- the shared helpers
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Who acts: the acting principal, a named active human (the refusal names the port's own phrase).
CREATE OR REPLACE FUNCTION graph.assert_strategy_actor(p_tenant uuid, p_actor uuid, p_phrase text) RETURNS void
STABLE SECURITY DEFINER SET search_path = graph, decision, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '%: recorded by the acting principal, never on behalf of another', p_phrase USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION '%: a named, active human acts on the Strategy Graph''s alignment, measures and authority', p_phrase USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.assert_strategy_actor(uuid, uuid, text) FROM PUBLIC;

-- A cited claim or evidence object: a canonical object of this domain (CLM for a claim, EVD for evidence) — its latest version, its
-- truth and lifecycle state; NULL when there is none (RLS-scoped for a reader; the ports call it after asserting the scope).
CREATE OR REPLACE FUNCTION graph.strategy_cited_object(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid)
RETURNS TABLE (object_id uuid, object_version bigint, truth_state text, lifecycle_state text)
LANGUAGE sql STABLE AS $$
  SELECT o.object_id, o.object_version::bigint, o.truth_state, o.lifecycle_state
    FROM objects.canonical_objects o
   WHERE o.object_id = p_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain
     AND o.object_type = CASE p_kind WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' END
   ORDER BY o.object_version DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION graph.strategy_cited_object(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.strategy_cited_object(uuid, uuid, text, uuid) TO eye_app, eye_commit;

-- The evidential strength of a truth state (alignment_rule@1): observed 5 > extracted 4 > asserted/decided 3 > assessed 2 > inferred 1;
-- synthetic, disputed and withdrawn are not evidence (0).
CREATE OR REPLACE FUNCTION graph.strategy_truth_rank(p_truth text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_truth WHEN 'observed' THEN 5 WHEN 'extracted' THEN 4 WHEN 'asserted' THEN 3 WHEN 'decided' THEN 3 WHEN 'assessed' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END;
$$;
GRANT EXECUTE ON FUNCTION graph.strategy_truth_rank(text) TO eye_app, eye_commit;

-- The subject an authority act names: its version, its digest, its declarer and its owner (NULL rows when absent).
--   strategy  the object's latest canonical version and its content digest; the declarer = the latest strategy.declared actor
--   measure   the definition version and digest; the declarer = the definer; the owner = the MSR object's owner
--   alignment version 1 (an alignment is re-declared, never edited) and its digest; the declarer = the declaring person
CREATE OR REPLACE FUNCTION graph.strategy_subject_state(p_tenant uuid, p_domain uuid, p_subject_kind text, p_id uuid)
RETURNS TABLE (subject_type text, subject_status text, subject_version bigint, subject_digest text, declarer uuid, owner uuid, detail text)
LANGUAGE sql STABLE AS $$
  SELECT s.object_type, s.status, o.object_version::bigint, o.content_digest,
         (SELECT e.actor_principal_id FROM graph.strategy_events e WHERE e.strategy_object_id = s.strategy_object_id AND e.event = 'strategy.declared' ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1),
         s.owner_principal_id, s.title
    FROM graph.strategy_current s
    JOIN LATERAL (SELECT c.object_version, c.content_digest FROM objects.canonical_objects c WHERE c.object_id = s.strategy_object_id ORDER BY c.object_version DESC LIMIT 1) o ON true
   WHERE p_subject_kind = 'strategy' AND s.strategy_object_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain
  UNION ALL
  SELECT 'MSR', s.status, m.definition_version::bigint, m.definition_digest, m.defined_by, s.owner_principal_id, s.title
    FROM graph.measures m JOIN graph.strategy_current s ON s.strategy_object_id = m.measure_id
   WHERE p_subject_kind = 'measure' AND m.measure_id = p_id AND m.tenant_id = p_tenant AND m.domain_id = p_domain
  UNION ALL
  SELECT a.kind, a.state, 1::bigint, a.digest, a.declared_by, NULL::uuid, a.kind || ' ' || a.from_type || '→' || a.to_type
    FROM graph.alignments a
   WHERE p_subject_kind = 'alignment' AND a.alignment_id = p_id AND a.tenant_id = p_tenant AND a.domain_id = p_domain;
$$;
REVOKE ALL ON FUNCTION graph.strategy_subject_state(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.strategy_subject_state(uuid, uuid, text, uuid) TO eye_app, eye_commit;

-- WHERE AN OWNERLESS OR CONTESTED OBJECT IS ROUTED: its owner when an active human; else its parent objective's owner when an active
-- human; else the domain's active humans holding strategy_owner or domain_admin (the accountable planning review) — never an agent.
-- Answers only for the caller's own context (another tenant's or domain's call answers an empty list).
CREATE OR REPLACE FUNCTION graph.strategy_review_route(p_tenant uuid, p_domain uuid, p_object uuid) RETURNS uuid[]
STABLE SECURITY DEFINER SET search_path = graph, identity, decision, public, pg_catalog, pg_temp AS $$
DECLARE s graph.strategy_current%ROWTYPE; v_parent uuid; v_found boolean;
BEGIN
  IF p_tenant IS DISTINCT FROM public.eye_tenant() OR (coalesce(public.eye_scope(), '') <> 'TENANT' AND p_domain IS DISTINCT FROM public.eye_domain()) THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  SELECT * INTO s FROM graph.strategy_current x WHERE x.strategy_object_id = p_object AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  v_found := FOUND;
  IF v_found AND decision.is_active_human(s.owner_principal_id, p_tenant) THEN RETURN ARRAY[s.owner_principal_id]; END IF;
  IF v_found AND s.parent_objective_id IS NOT NULL THEN
    SELECT x.owner_principal_id INTO v_parent FROM graph.strategy_current x WHERE x.strategy_object_id = s.parent_objective_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF v_parent IS NOT NULL AND decision.is_active_human(v_parent, p_tenant) THEN RETURN ARRAY[v_parent]; END IF;
  END IF;
  RETURN coalesce((SELECT array_agg(DISTINCT b.principal_id ORDER BY b.principal_id)
                     FROM identity.role_bindings b
                    WHERE b.tenant_id = p_tenant AND b.revoked_at IS NULL AND b.role_code IN ('strategy_owner', 'domain_admin')
                      AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT')
                      AND decision.is_active_human(b.principal_id, p_tenant)), ARRAY[]::uuid[]);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.strategy_review_route(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.strategy_review_route(uuid, uuid, uuid) TO eye_app, eye_commit;

-- The ends each kind admits, and which end RESTS ON the other (the mirror's dependent). Internal.
CREATE OR REPLACE FUNCTION graph.alignment_shape(p_kind text, OUT from_types text[], OUT to_types text[], OUT dependent_end text, OUT words text)
LANGUAGE sql IMMUTABLE AS $$
  SELECT x.f, x.t, x.d, x.w FROM (VALUES
    ('supports',       ARRAY['OBJ'], ARRAY['CAP'], 'from', 'a supports alignment runs from an objective (OBJ) to the capability (CAP) it needs'),
    ('builds',         ARRAY['INI'], ARRAY['CAP'], 'to',   'a builds alignment runs from an initiative (INI) to the capability (CAP) it builds'),
    ('resources',      ARRAY['RSC'], ARRAY['INI'], 'to',   'a resources alignment runs from a resource (RSC) to the initiative (INI) it resources'),
    ('measures',       ARRAY['MSR'], ARRAY['OBJ'], 'to',   'a measures alignment runs from a measure (MSR) to the objective (OBJ) it measures'),
    ('affects',        ARRAY['STK'], ARRAY['OBJ'], 'from', 'an affects alignment runs from a stakeholder (STK) to the objective (OBJ) that affects them'),
    ('conflicts_with', ARRAY['OBJ', 'INI'], ARRAY['OBJ', 'INI'], NULL, 'a conflicts_with alignment runs between two objectives (OBJ) or two initiatives (INI)')
  ) x(k, f, t, d, w) WHERE x.k = p_kind;
$$;

-- THE INSERT an alignment is (after the port's own checks): the digest, the mirror (reused when an identical active dependency exists —
-- then this alignment did not create it), the strategy.linked event of the dependent, the row, its event. Internal (no grant).
CREATE OR REPLACE FUNCTION graph.alignment_insert(
  p_alignment_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_from graph.strategy_current, p_to graph.strategy_current,
  p_strength text, p_evidence jsonb, p_rationale text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, public, pg_catalog, pg_temp AS $$
DECLARE v_shape record; v_dependent graph.strategy_current; v_target graph.strategy_current; v_dep uuid; v_created boolean := false; v_digest text;
BEGIN
  SELECT * INTO v_shape FROM graph.alignment_shape(p_kind);
  v_digest := encode(sha256(convert_to(jsonb_build_object('alignment_id', p_alignment_id, 'kind', p_kind, 'from', p_from.strategy_object_id, 'to', p_to.strategy_object_id,
                                                          'strength', p_strength, 'evidence', p_evidence, 'rationale', p_rationale)::text, 'UTF8')), 'hex');
  IF v_shape.dependent_end IS NOT NULL THEN
    IF v_shape.dependent_end = 'from' THEN v_dependent := p_from; v_target := p_to; ELSE v_dependent := p_to; v_target := p_from; END IF;
    SELECT d.dependency_id INTO v_dep FROM graph.dependencies d
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.dependent_object_id = v_dependent.strategy_object_id
       AND d.depends_on_kind = 'strategy' AND d.depends_on_id = v_target.strategy_object_id AND d.state = 'active';
    IF v_dep IS NULL THEN
      v_dep := gen_random_uuid(); v_created := true;
      INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      VALUES (v_dep, 'DOMAIN', p_tenant, p_domain, v_dependent.strategy_object_id, v_dependent.object_type, 'strategy', v_target.strategy_object_id,
              left(format('%s alignment %s: %s', p_kind, p_alignment_id, p_rationale), 4000), 'active', p_actor, p_correlation);
      INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_dependent.strategy_object_id, 'strategy.linked', p_actor,
              jsonb_build_object('depends_on_kind', 'strategy', 'depends_on_id', v_target.strategy_object_id, 'rationale', p_rationale, 'alignment_id', p_alignment_id, 'alignment_kind', p_kind),
              p_correlation);
    END IF;
  END IF;
  BEGIN
    INSERT INTO graph.alignments (alignment_id, scope, tenant_id, domain_id, kind, from_id, from_type, to_id, to_type, strength, evidence, rationale, digest, dependency_id, mirror_created,
                                  state, declared_by, correlation_id)
    VALUES (p_alignment_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_from.strategy_object_id, p_from.object_type, p_to.strategy_object_id, p_to.object_type, p_strength, p_evidence,
            p_rationale, v_digest, v_dep, v_created, 'active', p_actor, p_correlation);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'strategy alignment rejected (duplicate): an active % alignment from % to % was declared concurrently', p_kind, p_from.strategy_object_id, p_to.strategy_object_id USING ERRCODE = '22023';
  END;
  INSERT INTO graph.alignment_events (event_id, scope, tenant_id, domain_id, alignment_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_alignment_id, 'alignment.declared', p_actor,
          jsonb_build_object('kind', p_kind, 'from', p_from.strategy_object_id, 'to', p_to.strategy_object_id, 'strength', p_strength, 'evidence', p_evidence,
                             'dependency_id', v_dep, 'mirror_created', v_created, 'digest', v_digest), p_correlation);
  RETURN jsonb_build_object('alignment_id', p_alignment_id, 'kind', p_kind, 'from_id', p_from.strategy_object_id, 'from_type', p_from.object_type,
                            'to_id', p_to.strategy_object_id, 'to_type', p_to.object_type, 'strength', p_strength, 'evidence', p_evidence, 'digest', v_digest,
                            'dependency', CASE WHEN v_dep IS NULL THEN NULL ELSE jsonb_build_object('dependency_id', v_dep, 'dependent', v_dependent.strategy_object_id,
                                                                                                    'depends_on', v_target.strategy_object_id, 'created', v_created) END,
                            'state', 'active');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.alignment_insert(uuid, uuid, uuid, text, graph.strategy_current, graph.strategy_current, text, jsonb, text, uuid, uuid) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G1 ports
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION graph.declare_alignment(
  p_alignment_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_from uuid, p_to uuid, p_strength text, p_evidence jsonb, p_rationale text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, objects, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_shape record; f graph.strategy_current%ROWTYPE; t graph.strategy_current%ROWTYPE; x jsonb; v_ev jsonb := '[]'::jsonb; c record; v_existing uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.alignment.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM graph.assert_strategy_actor(p_tenant, p_actor, 'strategy alignment rejected');
  SELECT * INTO v_shape FROM graph.alignment_shape(p_kind);
  IF p_kind IS NULL OR v_shape.words IS NULL THEN
    RAISE EXCEPTION 'strategy alignment rejected (kind): % is not an alignment kind (supports, builds, resources, measures, affects, conflicts_with)', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_strength IS NULL OR p_strength NOT IN ('weak', 'moderate', 'strong') THEN
    RAISE EXCEPTION 'strategy alignment rejected (strength): the declared strength is weak, moderate or strong' USING ERRCODE = '22023';
  END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 OR length(p_rationale) > 2000 THEN
    RAISE EXCEPTION 'strategy alignment rejected (rationale): a rationale of 8 to 2000 characters says why the two are aligned' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
    RAISE EXCEPTION 'strategy alignment rejected (endpoint): an alignment names two different strategy objects' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO f FROM graph.strategy_current s WHERE s.strategy_object_id = p_from AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy alignment rejected (unknown_object): no strategy object % in this domain', p_from USING ERRCODE = '23503'; END IF;
  SELECT * INTO t FROM graph.strategy_current s WHERE s.strategy_object_id = p_to AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy alignment rejected (unknown_object): no strategy object % in this domain', p_to USING ERRCODE = '23503'; END IF;
  IF NOT (f.object_type = ANY (v_shape.from_types)) OR NOT (t.object_type = ANY (v_shape.to_types)) OR (p_kind = 'conflicts_with' AND f.object_type <> t.object_type) THEN
    RAISE EXCEPTION 'strategy alignment rejected (endpoint): %; % is % and % is %', v_shape.words, p_from, f.object_type, p_to, t.object_type USING ERRCODE = '22023';
  END IF;
  IF f.status <> 'active' OR t.status <> 'active' THEN
    RAISE EXCEPTION 'strategy alignment rejected (inactive): % is % and % is %; only active strategy objects are aligned', p_from, f.status, p_to, t.status USING ERRCODE = '22023';
  END IF;
  -- the cited claims and evidence: at most 32, each a canonical CLM or EVD object of this domain (its latest version recorded)
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'array' THEN
    RAISE EXCEPTION 'strategy alignment rejected (evidence): evidence is a list of {kind: claim | evidence, id}' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(coalesce(p_evidence, '[]'::jsonb)) > 32 THEN
    RAISE EXCEPTION 'strategy alignment rejected (evidence): an alignment cites at most 32 claims or evidence objects' USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) LOOP
    IF jsonb_typeof(x) <> 'object' OR coalesce(x ->> 'kind', '') NOT IN ('claim', 'evidence') OR coalesce(x ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'strategy alignment rejected (evidence): each cited item is {kind: claim | evidence, id: uuid}' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO c FROM graph.strategy_cited_object(p_tenant, p_domain, x ->> 'kind', (x ->> 'id')::uuid);
    IF c.object_id IS NULL THEN
      RAISE EXCEPTION 'strategy alignment rejected (unknown_evidence): no % % in this domain', x ->> 'kind', x ->> 'id' USING ERRCODE = '23503';
    END IF;
    IF NOT v_ev @> jsonb_build_array(jsonb_build_object('kind', x ->> 'kind', 'id', c.object_id)) THEN
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('kind', x ->> 'kind', 'id', c.object_id, 'version', c.object_version));
    END IF;
  END LOOP;
  SELECT a.alignment_id INTO v_existing FROM graph.alignments a
   WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active' AND a.kind = p_kind
     AND ((a.from_id = p_from AND a.to_id = p_to) OR (p_kind = 'conflicts_with' AND a.from_id = p_to AND a.to_id = p_from));
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'strategy alignment rejected (duplicate): alignment % already records this % alignment; retire it before declaring another', v_existing, p_kind USING ERRCODE = '22023';
  END IF;
  RETURN graph.alignment_insert(p_alignment_id, p_tenant, p_domain, p_kind, f, t, p_strength, v_ev, p_rationale, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.declare_alignment(uuid, uuid, uuid, text, uuid, uuid, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.declare_alignment(uuid, uuid, uuid, text, uuid, uuid, text, jsonb, text, uuid, uuid) TO eye_commit;

-- RETIRE: the alignment stays as history; the mirror it CREATED is removed (strategy.unlinked) unless another active alignment shares it.
CREATE OR REPLACE FUNCTION graph.retire_alignment(p_alignment_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a graph.alignments%ROWTYPE; v_removed boolean := false; d graph.dependencies%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.alignment.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM graph.assert_strategy_actor(p_tenant, p_actor, 'strategy alignment rejected');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'strategy alignment rejected (reason): a reason of 8 to 2000 characters says why the alignment no longer stands' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM graph.alignments x WHERE x.alignment_id = p_alignment_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy alignment rejected (unknown_alignment): no alignment % in this domain', p_alignment_id USING ERRCODE = '23503'; END IF;
  IF a.state = 'retired' THEN
    RAISE EXCEPTION 'strategy alignment rejected (retired): alignment % was retired at %', p_alignment_id, a.retired_at USING ERRCODE = '22023';
  END IF;
  UPDATE graph.alignments SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retired_reason = p_reason WHERE alignment_id = p_alignment_id;
  IF a.mirror_created AND a.dependency_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM graph.alignments o WHERE o.dependency_id = a.dependency_id AND o.state = 'active' AND o.alignment_id <> a.alignment_id) THEN
    UPDATE graph.dependencies SET state = 'removed', removed_at = clock_timestamp(), removed_by = p_actor
     WHERE dependency_id = a.dependency_id AND state = 'active' RETURNING * INTO d;
    IF FOUND THEN
      v_removed := true;
      INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, d.dependent_object_id, 'strategy.unlinked', p_actor,
              jsonb_build_object('depends_on_kind', 'strategy', 'depends_on_id', d.depends_on_id, 'reason', p_reason, 'alignment_id', a.alignment_id, 'alignment_kind', a.kind), p_correlation);
    END IF;
  END IF;
  INSERT INTO graph.alignment_events (event_id, scope, tenant_id, domain_id, alignment_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_alignment_id, 'alignment.retired', p_actor,
          jsonb_build_object('reason', p_reason, 'dependency_id', a.dependency_id, 'dependency_removed', v_removed), p_correlation);
  RETURN jsonb_build_object('alignment_id', p_alignment_id, 'kind', a.kind, 'state', 'retired', 'reason', p_reason, 'dependency_id', a.dependency_id, 'dependency_removed', v_removed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.retire_alignment(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.retire_alignment(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G2 ports and the freshness read
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION graph.define_measure(
  p_measure uuid, p_tenant uuid, p_domain uuid, p_objective uuid, p_unit text, p_direction text, p_target_value numeric, p_target_date date,
  p_freshness_days numeric, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.strategy_current%ROWTYPE; o graph.strategy_current%ROWTYPE; m graph.measures%ROWTYPE; v_version int; v_digest text; v_align jsonb; v_existing uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.measure.define']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM graph.assert_strategy_actor(p_tenant, p_actor, 'strategy measure rejected');
  IF p_unit IS NULL OR length(btrim(p_unit)) < 1 OR length(p_unit) > 64 THEN
    RAISE EXCEPTION 'strategy measure rejected (unit): a measure names its unit (1 to 64 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_direction IS NULL OR p_direction NOT IN ('higher_better', 'lower_better') THEN
    RAISE EXCEPTION 'strategy measure rejected (direction): the direction is higher_better or lower_better' USING ERRCODE = '22023';
  END IF;
  IF p_target_value IS NULL THEN
    RAISE EXCEPTION 'strategy measure rejected (target): a measure names its target value' USING ERRCODE = '22023';
  END IF;
  IF p_freshness_days IS NULL OR p_freshness_days <= 0 OR p_freshness_days > 3660 THEN
    RAISE EXCEPTION 'strategy measure rejected (freshness): the freshness window is a number of days in (0, 3660]' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM graph.strategy_current x WHERE x.strategy_object_id = p_measure AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy measure rejected (unknown_object): no strategy object % in this domain', p_measure USING ERRCODE = '23503'; END IF;
  IF s.object_type <> 'MSR' THEN
    RAISE EXCEPTION 'strategy measure rejected (not_a_measure): % is %; a measure is defined on an MSR object', p_measure, s.object_type USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM graph.strategy_current x WHERE x.strategy_object_id = p_objective AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy measure rejected (unknown_object): no strategy object % in this domain', p_objective USING ERRCODE = '23503'; END IF;
  IF o.object_type <> 'OBJ' THEN
    RAISE EXCEPTION 'strategy measure rejected (objective): % is %; a measure measures an objective (OBJ)', p_objective, o.object_type USING ERRCODE = '22023';
  END IF;
  IF s.status <> 'active' OR o.status <> 'active' THEN
    RAISE EXCEPTION 'strategy measure rejected (inactive): the measure is % and the objective is %; only active objects are measured', s.status, o.status USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM graph.measures x WHERE x.measure_id = p_measure FOR UPDATE;
  IF FOUND AND m.objective_id = p_objective AND m.unit = p_unit AND m.direction = p_direction AND m.target_value = p_target_value
     AND m.target_date IS NOT DISTINCT FROM p_target_date AND m.freshness_days = p_freshness_days THEN
    -- the same definition again (a retry): nothing changes
    RETURN jsonb_build_object('measure_id', p_measure, 'objective_id', m.objective_id, 'definition_version', m.definition_version, 'definition_digest', m.definition_digest,
                              'approval_state', m.approval_state, 'repeated', true);
  END IF;
  v_version := CASE WHEN m.measure_id IS NULL THEN 1 ELSE m.definition_version + 1 END;
  v_digest := encode(sha256(convert_to(jsonb_build_object('measure_id', p_measure, 'version', v_version, 'objective_id', p_objective, 'unit', p_unit, 'direction', p_direction,
                                                          'target_value', p_target_value::text, 'target_date', p_target_date, 'freshness_days', p_freshness_days::text)::text, 'UTF8')), 'hex');
  IF m.measure_id IS NULL THEN
    INSERT INTO graph.measures (measure_id, scope, tenant_id, domain_id, objective_id, unit, direction, target_value, target_date, freshness_days, definition_version, definition_digest,
                                approval_state, defined_by, correlation_id)
    VALUES (p_measure, 'DOMAIN', p_tenant, p_domain, p_objective, p_unit, p_direction, p_target_value, p_target_date, p_freshness_days, v_version, v_digest, 'proposed', p_actor, p_correlation);
  ELSE
    UPDATE graph.measures SET objective_id = p_objective, unit = p_unit, direction = p_direction, target_value = p_target_value, target_date = p_target_date,
                              freshness_days = p_freshness_days, definition_version = v_version, definition_digest = v_digest, approval_state = 'proposed', approval_act_id = NULL,
                              defined_by = p_actor, updated_at = clock_timestamp(), correlation_id = p_correlation
     WHERE measure_id = p_measure;
  END IF;
  INSERT INTO graph.measure_events (event_id, scope, tenant_id, domain_id, measure_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_measure, CASE WHEN v_version = 1 THEN 'measure.defined' ELSE 'measure.redefined' END, p_actor,
          jsonb_build_object('definition_version', v_version, 'definition_digest', v_digest, 'objective_id', p_objective, 'unit', p_unit, 'direction', p_direction,
                             'target_value', p_target_value, 'target_date', p_target_date, 'freshness_days', p_freshness_days,
                             'prior_approval', CASE WHEN m.measure_id IS NULL THEN NULL ELSE m.approval_state END), p_correlation);
  -- the measured objective is a `measures` alignment (MSR→OBJ, mirrored: the objective rests on its measure); recorded once
  SELECT a.alignment_id INTO v_existing FROM graph.alignments a
   WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind = 'measures' AND a.from_id = p_measure AND a.to_id = p_objective AND a.state = 'active';
  IF v_existing IS NULL THEN
    v_align := graph.alignment_insert(gen_random_uuid(), p_tenant, p_domain, 'measures', s, o, 'strong', '[]'::jsonb,
                                      'the measure defined for this objective (graph.define_measure)', p_actor, p_correlation);
  ELSE
    v_align := jsonb_build_object('alignment_id', v_existing, 'kind', 'measures', 'state', 'active', 'existing', true);
  END IF;
  RETURN jsonb_build_object('measure_id', p_measure, 'objective_id', p_objective, 'definition_version', v_version, 'definition_digest', v_digest,
                            'approval_state', 'proposed', 'alignment', v_align, 'repeated', false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.define_measure(uuid, uuid, uuid, uuid, text, text, numeric, date, numeric, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.define_measure(uuid, uuid, uuid, uuid, text, text, numeric, date, numeric, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.record_measure_observation(
  p_observation_id uuid, p_tenant uuid, p_domain uuid, p_measure uuid, p_value numeric, p_observed_at timestamptz, p_source_kind text, p_source_id uuid,
  p_note text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m graph.measures%ROWTYPE; v_status text; c record; prior graph.measure_observations%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.measure.observe']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'strategy measure rejected: recorded by the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM graph.measures x WHERE x.measure_id = p_measure AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy measure rejected (unknown_measure): no measure is defined for % in this domain', p_measure USING ERRCODE = '23503'; END IF;
  SELECT s.status INTO v_status FROM graph.strategy_current s WHERE s.strategy_object_id = p_measure;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'strategy measure rejected (inactive): measure % is %; an inactive measure is not observed', p_measure, v_status USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL OR p_value = 'NaN'::numeric THEN
    RAISE EXCEPTION 'strategy measure rejected (value): an observation carries a finite value' USING ERRCODE = '22023';
  END IF;
  IF p_observed_at IS NULL OR p_observed_at > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'strategy measure rejected (observed_at): an observation names the instant it was observed, never a future one' USING ERRCODE = '22023';
  END IF;
  IF p_source_kind IS NULL OR p_source_kind NOT IN ('claim', 'evidence') OR p_source_id IS NULL THEN
    RAISE EXCEPTION 'strategy measure rejected (source): an observation names the claim or evidence it was read from' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 2000 THEN
    RAISE EXCEPTION 'strategy measure rejected (note): a note is at most 2000 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM graph.strategy_cited_object(p_tenant, p_domain, p_source_kind, p_source_id);
  IF c.object_id IS NULL THEN
    RAISE EXCEPTION 'strategy measure rejected (unknown_source): no % % in this domain', p_source_kind, p_source_id USING ERRCODE = '23503';
  END IF;
  IF c.lifecycle_state = 'withdrawn' OR c.truth_state = 'withdrawn' THEN
    RAISE EXCEPTION 'strategy measure rejected (source_withdrawn): % % is withdrawn; a withdrawn object is no source for a measure', p_source_kind, p_source_id USING ERRCODE = '22023';
  END IF;
  SELECT * INTO prior FROM graph.measure_observations x WHERE x.measure_id = p_measure AND x.observed_at = p_observed_at AND x.source_kind = p_source_kind AND x.source_id = p_source_id;
  IF FOUND THEN
    IF prior.value = p_value THEN
      RETURN jsonb_build_object('observation_id', prior.observation_id, 'measure_id', p_measure, 'value', prior.value, 'observed_at', prior.observed_at,
                                'source', jsonb_build_object('kind', prior.source_kind, 'id', prior.source_id, 'version', prior.source_version), 'repeated', true);
    END IF;
    RAISE EXCEPTION 'strategy measure rejected (value_conflict): observation % already records % for this instant and source; a different value is a correction of the source, not a second observation', prior.observation_id, prior.value USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.measure_observations (observation_id, scope, tenant_id, domain_id, measure_id, value, observed_at, source_kind, source_id, source_version, note, recorded_by, correlation_id)
  VALUES (p_observation_id, 'DOMAIN', p_tenant, p_domain, p_measure, p_value, p_observed_at, p_source_kind, p_source_id, c.object_version, p_note, p_actor, p_correlation);
  INSERT INTO graph.measure_events (event_id, scope, tenant_id, domain_id, measure_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_measure, 'measure.observed', p_actor,
          jsonb_build_object('observation_id', p_observation_id, 'value', p_value, 'observed_at', p_observed_at, 'source_kind', p_source_kind, 'source_id', p_source_id, 'source_version', c.object_version),
          p_correlation);
  RETURN jsonb_build_object('observation_id', p_observation_id, 'measure_id', p_measure, 'value', p_value, 'observed_at', p_observed_at,
                            'source', jsonb_build_object('kind', p_source_kind, 'id', p_source_id, 'version', c.object_version), 'repeated', false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_measure_observation(uuid, uuid, uuid, uuid, numeric, timestamptz, text, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_measure_observation(uuid, uuid, uuid, uuid, numeric, timestamptz, text, uuid, text, uuid, uuid) TO eye_commit;

-- FRESHNESS AT AN INSTANT: the latest observation observed and recorded at or before it; fresh while its age ≤ the window; the approval
-- standing at the instant — the latest act on the CURRENT definition's digest recorded by then is an approval that has not expired.
CREATE OR REPLACE FUNCTION graph.measure_freshness(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (measure_id uuid, title text, status text, owner_principal_id uuid, objective_ids uuid[], unit text, direction text, target_value numeric, target_date date,
               freshness_days numeric, definition_version int, definition_digest text, approval_state text, approved_now boolean, approval_act_id uuid,
               approval_expires_at timestamptz, last_value numeric, last_observed_at timestamptz, last_source jsonb, observations int, age_days numeric, state text)
LANGUAGE sql STABLE AS $$
  SELECT m.measure_id, s.title, s.status, s.owner_principal_id,
         ARRAY(SELECT a.to_id FROM graph.alignments a WHERE a.kind = 'measures' AND a.from_id = m.measure_id AND a.state = 'active' AND a.tenant_id = m.tenant_id AND a.domain_id = m.domain_id ORDER BY a.declared_at, a.to_id),
         m.unit, m.direction, m.target_value, m.target_date, m.freshness_days, m.definition_version, m.definition_digest, m.approval_state,
         coalesce(act.decision = 'approve' AND act.expires_at > p_at, false), act.act_id, act.expires_at,
         o.value, o.observed_at,
         CASE WHEN o.observation_id IS NULL THEN NULL ELSE jsonb_build_object('kind', o.source_kind, 'id', o.source_id, 'version', o.source_version) END,
         (SELECT count(*)::int FROM graph.measure_observations x WHERE x.measure_id = m.measure_id AND x.observed_at <= p_at AND x.recorded_at <= p_at),
         CASE WHEN o.observation_id IS NULL THEN NULL ELSE round((extract(epoch FROM (p_at - o.observed_at)) / 86400.0)::numeric, 2) END,
         CASE WHEN o.observation_id IS NULL THEN 'no_observation'
              WHEN extract(epoch FROM (p_at - o.observed_at)) > m.freshness_days * 86400 THEN 'stale' ELSE 'fresh' END
    FROM graph.measures m
    JOIN graph.strategy_current s ON s.strategy_object_id = m.measure_id
    LEFT JOIN LATERAL (SELECT x.* FROM graph.measure_observations x WHERE x.measure_id = m.measure_id AND x.observed_at <= p_at AND x.recorded_at <= p_at
                        ORDER BY x.observed_at DESC, x.recorded_at DESC LIMIT 1) o ON true
    LEFT JOIN LATERAL (SELECT t.* FROM graph.strategy_authority_acts t WHERE t.act_kind = 'approve_measure' AND t.subject_id = m.measure_id AND t.subject_digest = m.definition_digest
                          AND t.recorded_at <= p_at ORDER BY t.recorded_at DESC LIMIT 1) act ON true
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain
   ORDER BY s.title, m.measure_id;
$$;
REVOKE ALL ON FUNCTION graph.measure_freshness(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.measure_freshness(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G3 port
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION graph.record_strategy_authority_act(
  p_act_id uuid, p_tenant uuid, p_domain uuid, p_act_kind text, p_subject uuid, p_subject_digest text, p_decision text, p_rationale text,
  p_expires_at timestamptz, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, objects, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_subject_kind text; st record; v_eligible text; r text; v_prior uuid; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.strategy.authority.act']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM graph.assert_strategy_actor(p_tenant, p_actor, 'strategy authority rejected');
  v_subject_kind := CASE p_act_kind WHEN 'set_objective' THEN 'strategy' WHEN 'approve_measure' THEN 'measure' WHEN 'approve_tradeoff' THEN 'alignment' WHEN 'allocate_resource' THEN 'alignment' END;
  IF v_subject_kind IS NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (act_kind): % is not an authority act (set_objective, approve_measure, approve_tradeoff, allocate_resource)', coalesce(p_act_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'strategy authority rejected (decision): the decision is approve or reject' USING ERRCODE = '22023';
  END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 OR length(p_rationale) > 4096 THEN
    RAISE EXCEPTION 'strategy authority rejected (rationale): a rationale of 8 to 4096 characters says why' USING ERRCODE = '22023';
  END IF;
  IF p_subject_digest IS NULL OR p_subject_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'strategy authority rejected (digest): the act names the digest of the subject version the approver read (64 hex)' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= v_now OR p_expires_at > v_now + interval '366 days' THEN
    RAISE EXCEPTION 'strategy authority rejected (expiry): an act expires after now and within 366 days' USING ERRCODE = '22023';
  END IF;
  -- ELIGIBILITY: the first planning authority the approver holds in this domain (the PDP admitted the action; the port names the role)
  FOREACH r IN ARRAY ARRAY['executive', 'decision_authority', 'domain_admin', 'strategy_owner'] LOOP
    IF decision.holds_role(p_actor, p_tenant, p_domain, r) THEN v_eligible := 'role:' || r; EXIT; END IF;
  END LOOP;
  IF v_eligible IS NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (not_eligible): principal % holds none of executive, decision_authority, domain_admin, strategy_owner in this domain', p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO st FROM graph.strategy_subject_state(p_tenant, p_domain, v_subject_kind, p_subject);
  IF st.subject_digest IS NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (unknown_subject): no % % in this domain', CASE v_subject_kind WHEN 'measure' THEN 'measure defined for' ELSE v_subject_kind END, p_subject USING ERRCODE = '23503';
  END IF;
  IF (p_act_kind = 'set_objective' AND st.subject_type <> 'OBJ') OR (p_act_kind = 'approve_tradeoff' AND st.subject_type <> 'conflicts_with')
     OR (p_act_kind = 'allocate_resource' AND st.subject_type <> 'resources') THEN
    RAISE EXCEPTION 'strategy authority rejected (subject): % names % (a %); set_objective names an objective, approve_tradeoff a conflicts_with alignment, allocate_resource a resources alignment',
      p_act_kind, p_subject, st.subject_type USING ERRCODE = '22023';
  END IF;
  IF st.subject_status NOT IN ('active') THEN
    RAISE EXCEPTION 'strategy authority rejected (inactive): % is %; an authority act names an active subject', p_subject, st.subject_status USING ERRCODE = '22023';
  END IF;
  IF v_subject_kind IN ('strategy', 'measure') AND NOT decision.is_active_human(st.owner, p_tenant) THEN
    RAISE EXCEPTION 'strategy authority rejected (missing_owner): % has no active human owner; an owner is assigned first (graph.assign_strategy_owner)', p_subject USING ERRCODE = '22023';
  END IF;
  IF st.subject_digest <> p_subject_digest THEN
    RAISE EXCEPTION 'strategy authority rejected (stale_digest): the approver read %; % is now version % (%)', p_subject_digest, p_subject, st.subject_version, st.subject_digest USING ERRCODE = '22023';
  END IF;
  IF st.declarer = p_actor THEN
    RAISE EXCEPTION 'strategy authority rejected (separation): principal % declared %; the declarer never records the authority act on it', p_actor, p_subject USING ERRCODE = '42501';
  END IF;
  SELECT t.act_id INTO v_prior FROM graph.strategy_authority_acts t
   WHERE t.subject_id = p_subject AND t.act_kind = p_act_kind AND t.subject_digest = p_subject_digest AND t.approver_principal_id = p_actor AND t.expires_at > v_now
   ORDER BY t.recorded_at DESC LIMIT 1;
  IF v_prior IS NOT NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (duplicate): act % already records this approver''s % on this version', v_prior, p_act_kind USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.strategy_authority_acts (act_id, scope, tenant_id, domain_id, act_kind, subject_kind, subject_id, subject_version, subject_digest, decision, rationale,
                                             eligible_by, approver_principal_id, declarer_principal_id, expires_at, correlation_id)
  VALUES (p_act_id, 'DOMAIN', p_tenant, p_domain, p_act_kind, v_subject_kind, p_subject, st.subject_version, p_subject_digest, p_decision, p_rationale,
          v_eligible, p_actor, st.declarer, p_expires_at, p_correlation);
  IF p_act_kind = 'approve_measure' THEN
    UPDATE graph.measures SET approval_state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, approval_act_id = p_act_id, updated_at = v_now
     WHERE measure_id = p_subject;
    INSERT INTO graph.measure_events (event_id, scope, tenant_id, domain_id, measure_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_subject, CASE p_decision WHEN 'approve' THEN 'measure.approved' ELSE 'measure.rejected' END, p_actor,
            jsonb_build_object('act_id', p_act_id, 'definition_version', st.subject_version, 'definition_digest', p_subject_digest, 'expires_at', p_expires_at, 'eligible_by', v_eligible), p_correlation);
  ELSIF v_subject_kind = 'alignment' THEN
    INSERT INTO graph.alignment_events (event_id, scope, tenant_id, domain_id, alignment_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_subject, CASE p_act_kind WHEN 'approve_tradeoff' THEN 'alignment.tradeoff_decided' ELSE 'alignment.allocation_decided' END, p_actor,
            jsonb_build_object('act_id', p_act_id, 'decision', p_decision, 'expires_at', p_expires_at, 'eligible_by', v_eligible), p_correlation);
  END IF;
  RETURN jsonb_build_object('act_id', p_act_id, 'act_kind', p_act_kind, 'subject_kind', v_subject_kind, 'subject_id', p_subject, 'subject_version', st.subject_version,
                            'subject_digest', p_subject_digest, 'decision', p_decision, 'eligible_by', v_eligible, 'approver', p_actor, 'declarer', st.declarer,
                            'expires_at', p_expires_at, 'recorded_at', v_now);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_strategy_authority_act(uuid, uuid, uuid, text, uuid, text, text, text, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_strategy_authority_act(uuid, uuid, uuid, text, uuid, text, text, text, timestamptz, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G4 ownership
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION graph.assign_strategy_owner(
  p_object uuid, p_tenant uuid, p_domain uuid, p_owner uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s graph.strategy_current%ROWTYPE; v_from_active boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.strategy.owner.assign']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM graph.assert_strategy_actor(p_tenant, p_actor, 'strategy owner rejected');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'strategy owner rejected (reason): a reason of 8 to 2000 characters says why the ownership moves' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM graph.strategy_current x WHERE x.strategy_object_id = p_object AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy owner rejected (unknown_object): no strategy object % in this domain', p_object USING ERRCODE = '23503'; END IF;
  IF s.status = 'withdrawn' THEN
    RAISE EXCEPTION 'strategy owner rejected (inactive): % is withdrawn; a withdrawn object is not re-owned', p_object USING ERRCODE = '22023';
  END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant)
     OR NOT (decision.holds_role(p_owner, p_tenant, p_domain, 'strategy_owner') OR decision.holds_role(p_owner, p_tenant, p_domain, 'domain_admin')
             OR decision.holds_role(p_owner, p_tenant, p_domain, 'executive') OR decision.holds_role(p_owner, p_tenant, p_domain, 'decision_owner')
             OR decision.holds_role(p_owner, p_tenant, p_domain, 'decision_authority')) THEN
    RAISE EXCEPTION 'strategy owner rejected (owner): % is not an active human holding strategy_owner, domain_admin, executive, decision_owner or decision_authority in this domain', coalesce(p_owner::text, '<none>') USING ERRCODE = '22023';
  END IF;
  v_from_active := decision.is_active_human(s.owner_principal_id, p_tenant);
  IF NOT ((v_from_active AND s.owner_principal_id = p_actor) OR decision.holds_role(p_actor, p_tenant, p_domain, 'strategy_owner') OR decision.holds_role(p_actor, p_tenant, p_domain, 'domain_admin')) THEN
    RAISE EXCEPTION 'strategy owner rejected (not_authority): principal % is neither the owner of % nor a strategy owner or domain administrator of this domain', p_actor, p_object USING ERRCODE = '42501';
  END IF;
  IF s.owner_principal_id = p_owner THEN
    RAISE EXCEPTION 'strategy owner rejected (unchanged): % already owns %', p_owner, p_object USING ERRCODE = '22023';
  END IF;
  UPDATE graph.strategy_current SET owner_principal_id = p_owner, updated_at = clock_timestamp() WHERE strategy_object_id = p_object;
  INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_object, 'strategy.owner_assigned', p_actor,
          jsonb_build_object('from', s.owner_principal_id, 'from_active_human', v_from_active, 'to', p_owner, 'reason', p_reason), p_correlation);
  RETURN jsonb_build_object('strategy_object_id', p_object, 'object_type', s.object_type, 'from', s.owner_principal_id, 'from_active_human', v_from_active, 'to', p_owner, 'reason', p_reason);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.assign_strategy_owner(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.assign_strategy_owner(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G5 THE DETECTIONS, each with its declared continuity
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION graph.strategy_detections(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (detection_kind text, detection_key text, state text, subject_ids uuid[], subjects jsonb, detail text, continuity text, continuity_detail text,
               affected_ids uuid[], routed_to uuid[], path jsonb, resolved_by uuid)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE s AS (
    SELECT x.* FROM graph.strategy_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain
  ), subj AS (
    SELECT s.strategy_object_id AS id, jsonb_build_object('id', s.strategy_object_id, 'type', s.object_type, 'title', s.title, 'status', s.status,
                                                          'owner', s.owner_principal_id, 'owner_active_human', decision.is_active_human(s.owner_principal_id, p_tenant)) AS j
      FROM s
  ), conflicts AS (
    SELECT a.alignment_id, a.from_id, a.to_id, a.digest,
           (SELECT t.act_id FROM graph.strategy_authority_acts t
             WHERE t.act_kind = 'approve_tradeoff' AND t.subject_id = a.alignment_id AND t.subject_digest = a.digest AND t.recorded_at <= p_at
             ORDER BY t.recorded_at DESC LIMIT 1) AS last_act
      FROM graph.alignments a
     WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind = 'conflicts_with' AND a.state = 'active'
  ), edges AS (
    SELECT DISTINCT d.dependent_object_id AS a, d.depends_on_id AS b
      FROM graph.dependencies d
      JOIN s sa ON sa.strategy_object_id = d.dependent_object_id AND sa.status = 'active'
      JOIN s sb ON sb.strategy_object_id = d.depends_on_id AND sb.status = 'active'
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_kind = 'strategy'
  ), walk(start, node, path, closed) AS (
    SELECT e.a, e.b, ARRAY[e.a, e.b], false FROM edges e
    UNION ALL
    SELECT w.start, e.b, w.path || e.b, e.b = w.start
      FROM walk w JOIN edges e ON e.a = w.node
     WHERE NOT w.closed AND (e.b = w.start OR NOT e.b = ANY (w.path)) AND cardinality(w.path) < 64
  ), cycles AS (
    SELECT DISTINCT w.path FROM walk w
     WHERE w.closed AND w.start::text = (SELECT min(x::text) FROM unnest(w.path) x)
  ), fr AS (
    SELECT f.* FROM graph.measure_freshness(p_tenant, p_domain, p_at) f WHERE f.status = 'active' AND f.state <> 'fresh'
  )
  SELECT q.detection_kind, q.detection_key, q.state, q.subject_ids, q.subjects, q.detail, q.continuity, q.continuity_detail, q.affected_ids, q.routed_to, q.path, q.resolved_by FROM (
    -- CONFLICT: two objectives (or initiatives) declared in conflict; HOLD — no health or alignment claim over either while it stands,
    -- both alternatives preserved; routed to both owners for a trade-off; resolved by an unexpired approve_tradeoff act on its digest.
    SELECT 'conflict'::text, 'conflict:' || c.alignment_id::text,
           CASE WHEN act.decision = 'approve' AND act.expires_at > p_at THEN 'resolved' ELSE 'open' END,
           ARRAY[c.from_id, c.to_id],
           (SELECT jsonb_agg(subj.j ORDER BY subj.id) FROM subj WHERE subj.id IN (c.from_id, c.to_id)),
           format('alignment %s declares %s and %s in conflict%s', c.alignment_id, c.from_id, c.to_id,
                  CASE WHEN act.act_id IS NULL THEN '; no trade-off has been decided'
                       WHEN act.decision = 'approve' AND act.expires_at > p_at THEN format('; trade-off approved by act %s until %s', act.act_id, act.expires_at)
                       WHEN act.decision = 'approve' THEN format('; the trade-off approved by act %s expired at %s', act.act_id, act.expires_at)
                       ELSE format('; the trade-off was rejected by act %s', act.act_id) END),
           'hold'::text,
           'no health or alignment claim is made over either object while the conflict stands; both alternatives are preserved; a human authority decides the trade-off (approve_tradeoff)'::text,
           ARRAY[c.from_id, c.to_id],
           (SELECT coalesce(array_agg(DISTINCT u.r ORDER BY u.r), ARRAY[]::uuid[]) FROM unnest(graph.strategy_review_route(p_tenant, p_domain, c.from_id) || graph.strategy_review_route(p_tenant, p_domain, c.to_id)) AS u(r)),
           NULL::jsonb,
           CASE WHEN act.decision = 'approve' AND act.expires_at > p_at THEN act.act_id END,
           CASE WHEN act.decision = 'approve' AND act.expires_at > p_at THEN 1 ELSE 0 END AS o_state, 1 AS o_cont
      FROM conflicts c LEFT JOIN graph.strategy_authority_acts act ON act.act_id = c.last_act
    UNION ALL
    -- CYCLE: a dependency cycle among active strategy objects (the mirrors included); HOLD — no alignment claim over the objects on it
    -- until a link is removed (retire an alignment); routed to their owners.
    SELECT 'cycle', 'cycle:' || array_to_string(cy.path[1:cardinality(cy.path) - 1], '>'), 'open',
           cy.path[1:cardinality(cy.path) - 1],
           (SELECT jsonb_agg(subj.j ORDER BY subj.id) FROM subj WHERE subj.id = ANY (cy.path)),
           format('a dependency cycle of %s strategy objects: %s', cardinality(cy.path) - 1,
                  (SELECT string_agg(coalesce(s.object_type || ' "' || s.title || '"', n::text), ' rests on ' ORDER BY i) FROM unnest(cy.path) WITH ORDINALITY u(n, i) LEFT JOIN s ON s.strategy_object_id = u.n)),
           'hold',
           'the objects on the cycle are held: no alignment or health claim rests on a circular justification; a person removes a link (retires an alignment or a dependency)',
           cy.path[1:cardinality(cy.path) - 1],
           (SELECT coalesce(array_agg(DISTINCT v.r ORDER BY v.r), ARRAY[]::uuid[]) FROM unnest(cy.path) AS u(n), unnest(graph.strategy_review_route(p_tenant, p_domain, u.n)) AS v(r)),
           (SELECT jsonb_agg(jsonb_build_object('id', u.n, 'type', s.object_type, 'title', s.title) ORDER BY u.i) FROM unnest(cy.path) WITH ORDINALITY u(n, i) LEFT JOIN s ON s.strategy_object_id = u.n),
           NULL::uuid, 0, 1
      FROM cycles cy
    UNION ALL
    -- MISSING OWNER: an active object whose owner is not an active human; ROUTE TO OWNER — the planning review assigns one; authority
    -- acts naming it are refused until then.
    SELECT 'missing_owner', 'missing_owner:' || s.strategy_object_id::text, 'open',
           ARRAY[s.strategy_object_id],
           (SELECT jsonb_agg(subj.j) FROM subj WHERE subj.id = s.strategy_object_id),
           format('%s "%s" is owned by %s, who is not an active human', s.object_type, s.title, s.owner_principal_id),
           'route_to_owner',
           'routed to the accountable planning review (the parent objective''s owner, else the domain''s strategy owners and administrators) to assign an owner; authority acts naming it are refused until one is',
           ARRAY[s.strategy_object_id],
           graph.strategy_review_route(p_tenant, p_domain, s.strategy_object_id),
           NULL::jsonb, NULL::uuid, 0, 2
      FROM s WHERE s.status = 'active' AND NOT decision.is_active_human(s.owner_principal_id, p_tenant)
    UNION ALL
    -- STALE MEASURE: a measure never observed or older than its window; EXPOSE AFFECTED SCOPE — the measured objectives named, the
    -- measure's input declared stale (never current); routed to the measure's owner.
    SELECT 'stale_measure', 'stale_measure:' || f.measure_id::text, 'open',
           ARRAY[f.measure_id],
           (SELECT jsonb_agg(subj.j ORDER BY subj.id) FROM subj WHERE subj.id = f.measure_id OR subj.id = ANY (f.objective_ids)),
           CASE WHEN f.state = 'no_observation' THEN format('measure "%s" has no observation at or before %s (window %s day(s))', f.title, p_at, f.freshness_days)
                ELSE format('measure "%s" was last observed %s day(s) before %s (window %s day(s))', f.title, f.age_days, p_at, f.freshness_days) END,
           'expose_affected_scope',
           'the measured objectives are named as affected; the measure is an input declared stale, never presented as current; the owner refreshes it',
           ARRAY[f.measure_id] || f.objective_ids,
           graph.strategy_review_route(p_tenant, p_domain, f.measure_id),
           NULL::jsonb, NULL::uuid, 0, 3
      FROM fr f
  ) q(detection_kind, detection_key, state, subject_ids, subjects, detail, continuity, continuity_detail, affected_ids, routed_to, path, resolved_by, o_state, o_cont)
  ORDER BY q.o_state, q.o_cont, q.detection_key;
$$;
REVOKE ALL ON FUNCTION graph.strategy_detections(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.strategy_detections(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G6 THE GAP VIEW (alignment_rule@1)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION graph.alignment_gaps(p_tenant uuid, p_domain uuid, p_objective uuid, p_at timestamptz)
RETURNS TABLE (objective_id uuid, objective_title text, objective_owner uuid, objective_subject jsonb, objective_set jsonb, capability_id uuid, capability_title text,
               alignment_id uuid, strength text, evidence_count int, strongest_truth text, evidence jsonb, initiatives jsonb, initiatives_active int, initiatives_resourced int,
               measures jsonb, criteria jsonb, criteria_met int, criteria_total int, gap_reasons text[], held_by jsonb, alignment_claim text, rule text)
LANGUAGE sql STABLE AS $$
  WITH o AS (
    SELECT x.* FROM graph.strategy_current x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = 'OBJ' AND x.status = 'active' AND (p_objective IS NULL OR x.strategy_object_id = p_objective)
  ), det AS (
    SELECT d.* FROM graph.strategy_detections(p_tenant, p_domain, p_at) d WHERE d.state = 'open' AND d.continuity = 'hold'
  ), fr AS (
    SELECT f.* FROM graph.measure_freshness(p_tenant, p_domain, p_at) f WHERE f.status = 'active'
  ), pairs AS (
    SELECT o.strategy_object_id AS oid, o.title AS otitle, o.owner_principal_id AS oowner, c.strategy_object_id AS cid, c.title AS ctitle, a.alignment_id, a.strength, a.evidence AS aev
      FROM o
      LEFT JOIN graph.alignments a ON a.kind = 'supports' AND a.from_id = o.strategy_object_id AND a.state = 'active' AND a.tenant_id = p_tenant AND a.domain_id = p_domain
      LEFT JOIN graph.strategy_current c ON c.strategy_object_id = a.to_id AND c.status = 'active'
  ), rows AS (
    SELECT p.*,
           ss.subject_version AS oversion, ss.subject_digest AS odigest,
           setact.act_id AS set_act, setact.decision AS set_decision, setact.expires_at AS set_expires,
           coalesce(ev.refs, '[]'::jsonb) AS refs, coalesce(ev.n, 0) AS ev_n, ev.best AS ev_best,
           coalesce(ini.list, '[]'::jsonb) AS ini_list, coalesce(ini.active, 0) AS ini_active, coalesce(ini.resourced, 0) AS ini_resourced,
           coalesce(ms.list, '[]'::jsonb) AS ms_list, coalesce(ms.n, 0) AS ms_n, coalesce(ms.approved, 0) AS ms_approved, coalesce(ms.current, 0) AS ms_current,
           coalesce(hold.list, '[]'::jsonb) AS hold_list
      FROM pairs p
      LEFT JOIN LATERAL (SELECT * FROM graph.strategy_subject_state(p_tenant, p_domain, 'strategy', p.oid)) ss ON true
      LEFT JOIN LATERAL (SELECT t.* FROM graph.strategy_authority_acts t
                          WHERE t.act_kind = 'set_objective' AND t.subject_id = p.oid AND t.subject_digest = ss.subject_digest AND t.recorded_at <= p_at
                          ORDER BY t.recorded_at DESC LIMIT 1) setact ON true
      -- the capability's evidence: what it rests on (claims, evidence) and what the supports alignment cites — each resolved, withdrawn excluded
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('kind', r.kind, 'id', r.id, 'version', co.object_version, 'truth_state', co.truth_state, 'lifecycle_state', co.lifecycle_state,
                                            'counted', co.object_id IS NOT NULL AND co.lifecycle_state <> 'withdrawn' AND graph.strategy_truth_rank(co.truth_state) > 0) ORDER BY r.kind, r.id) AS refs,
               count(*) FILTER (WHERE co.object_id IS NOT NULL AND co.lifecycle_state <> 'withdrawn' AND graph.strategy_truth_rank(co.truth_state) > 0)::int AS n,
               (array_agg(co.truth_state ORDER BY graph.strategy_truth_rank(co.truth_state) DESC) FILTER (WHERE co.object_id IS NOT NULL AND co.lifecycle_state <> 'withdrawn' AND graph.strategy_truth_rank(co.truth_state) > 0))[1] AS best
          FROM (SELECT DISTINCT d.depends_on_kind AS kind, d.depends_on_id AS id FROM graph.dependencies d
                 WHERE p.cid IS NOT NULL AND d.dependent_object_id = p.cid AND d.state = 'active' AND d.depends_on_kind IN ('claim', 'evidence')
                UNION
                SELECT e ->> 'kind', (e ->> 'id')::uuid FROM jsonb_array_elements(coalesce(p.aev, '[]'::jsonb)) e WHERE p.cid IS NOT NULL) r
          LEFT JOIN LATERAL (SELECT * FROM graph.strategy_cited_object(p_tenant, p_domain, r.kind, r.id)) co ON true
      ) ev ON true
      -- the initiatives building it: active; resourced = an active resources alignment whose allocation a human authority approved (unexpired, on its digest)
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('initiative_id', i.strategy_object_id, 'title', i.title, 'status', i.status, 'resourced', rs.ok, 'resources', rs.list) ORDER BY i.title) AS list,
               count(*) FILTER (WHERE i.status = 'active')::int AS active,
               count(*) FILTER (WHERE i.status = 'active' AND rs.ok)::int AS resourced
          FROM graph.alignments b
          JOIN graph.strategy_current i ON i.strategy_object_id = b.from_id
          LEFT JOIN LATERAL (
            SELECT coalesce(bool_or(al.ok), false) AS ok,
                   coalesce(jsonb_agg(jsonb_build_object('alignment_id', al.alignment_id, 'resource_id', al.from_id, 'title', al.title, 'allocation_act', al.act_id, 'allocation_approved', al.ok)), '[]'::jsonb) AS list
              FROM (SELECT ra.alignment_id, ra.from_id, rsc.title, act.act_id, coalesce(act.decision = 'approve' AND act.expires_at > p_at, false) AS ok
                      FROM graph.alignments ra
                      JOIN graph.strategy_current rsc ON rsc.strategy_object_id = ra.from_id AND rsc.status = 'active'
                      LEFT JOIN LATERAL (SELECT t.* FROM graph.strategy_authority_acts t WHERE t.act_kind = 'allocate_resource' AND t.subject_id = ra.alignment_id AND t.subject_digest = ra.digest
                                           AND t.recorded_at <= p_at ORDER BY t.recorded_at DESC LIMIT 1) act ON true
                     WHERE ra.kind = 'resources' AND ra.to_id = i.strategy_object_id AND ra.state = 'active') al
          ) rs ON true
         WHERE p.cid IS NOT NULL AND b.kind = 'builds' AND b.to_id = p.cid AND b.state = 'active'
      ) ini ON true
      -- the objective's measures: approved at the instant and fresh
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('measure_id', f.measure_id, 'title', f.title, 'approved', f.approved_now, 'approval_state', f.approval_state, 'state', f.state,
                                            'age_days', f.age_days, 'freshness_days', f.freshness_days, 'last_value', f.last_value, 'unit', f.unit, 'target_value', f.target_value) ORDER BY f.title) AS list,
               count(*)::int AS n, count(*) FILTER (WHERE f.approved_now)::int AS approved, count(*) FILTER (WHERE f.approved_now AND f.state = 'fresh')::int AS current
          FROM fr f WHERE p.oid = ANY (f.objective_ids)
      ) ms ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('kind', d.detection_kind, 'key', d.detection_key, 'continuity', d.continuity) ORDER BY d.detection_key) AS list
          FROM det d WHERE p.oid = ANY (d.subject_ids) OR (p.cid IS NOT NULL AND p.cid = ANY (d.subject_ids))
      ) hold ON true
  ), judged AS (
    SELECT r.*,
           (r.set_decision = 'approve' AND r.set_expires > p_at) AS c_set,
           (r.cid IS NOT NULL AND r.ev_n >= 2 AND graph.strategy_truth_rank(r.ev_best) >= 4) AS c_evidence,
           (r.ini_active > 0) AS c_ini,
           (r.ini_resourced > 0) AS c_res,
           (r.ms_current > 0) AS c_ms
      FROM rows r
  )
  SELECT j.oid, j.otitle, j.oowner, jsonb_build_object('kind', 'strategy', 'version', j.oversion, 'digest', j.odigest),
         jsonb_build_object('set', coalesce(j.c_set, false), 'act_id', j.set_act, 'decision', j.set_decision, 'expires_at', j.set_expires),
         j.cid, j.ctitle, j.alignment_id, j.strength, j.ev_n, j.ev_best, j.refs, j.ini_list, j.ini_active, j.ini_resourced, j.ms_list,
         jsonb_build_array(
           jsonb_build_object('criterion', 'objective_set', 'met', coalesce(j.c_set, false),
                              'basis', CASE WHEN coalesce(j.c_set, false) THEN format('set by act %s until %s', j.set_act, j.set_expires)
                                            WHEN j.set_act IS NULL THEN 'no human authority has set this objective version'
                                            WHEN j.set_decision = 'reject' THEN format('act %s rejected it', j.set_act) ELSE format('act %s expired at %s', j.set_act, j.set_expires) END),
           jsonb_build_object('criterion', 'capability_evidenced', 'met', j.c_evidence,
                              'basis', CASE WHEN j.cid IS NULL THEN 'no capability supports this objective'
                                            ELSE format('%s counted evidence ref(s), the strongest %s (the rule: at least 2, one observed or extracted)', j.ev_n, coalesce(j.ev_best, 'none')) END),
           jsonb_build_object('criterion', 'initiative_active', 'met', j.c_ini, 'basis', format('%s active initiative(s) build the capability', j.ini_active)),
           jsonb_build_object('criterion', 'initiative_resourced', 'met', j.c_res, 'basis', format('%s initiative(s) with an allocation approved by a human authority', j.ini_resourced)),
           jsonb_build_object('criterion', 'measure_current', 'met', j.c_ms,
                              'basis', format('%s measure(s): %s approved at the instant, %s approved and fresh', j.ms_n, j.ms_approved, j.ms_current))),
         (coalesce(j.c_set, false)::int + j.c_evidence::int + j.c_ini::int + j.c_res::int + j.c_ms::int),
         5,
         array_remove(ARRAY[
           CASE WHEN NOT coalesce(j.c_set, false) THEN 'objective_not_set' END,
           CASE WHEN j.cid IS NULL THEN 'no_capability' WHEN NOT j.c_evidence THEN 'capability_under_evidenced' END,
           CASE WHEN j.cid IS NOT NULL AND NOT j.c_ini THEN 'no_active_initiative' END,
           CASE WHEN j.cid IS NOT NULL AND j.c_ini AND NOT j.c_res THEN 'initiative_unresourced' END,
           CASE WHEN j.ms_n = 0 THEN 'no_measure' WHEN j.ms_approved = 0 THEN 'measure_unapproved' WHEN NOT j.c_ms THEN 'measure_stale' END,
           CASE WHEN jsonb_array_length(j.hold_list) > 0 THEN 'held_by_detection' END], NULL),
         j.hold_list,
         CASE WHEN jsonb_array_length(j.hold_list) > 0 THEN 'held'
              WHEN coalesce(j.c_set, false) AND j.c_evidence AND j.c_ini AND j.c_res AND j.c_ms THEN 'supported' ELSE 'gap' END,
         'alignment_rule@1: set by a human authority; the capability evidenced by at least 2 counted refs, one observed or extracted; an active initiative builds it; an allocation approved by a human authority resources it; an approved measure is fresh — each criterion shown, none averaged'::text
    FROM judged j
   ORDER BY (jsonb_array_length(j.hold_list) > 0) DESC,
            (coalesce(j.c_set, false)::int + j.c_evidence::int + j.c_ini::int + j.c_res::int + j.c_ms::int),
            j.otitle, j.ctitle NULLS FIRST, j.cid;
$$;
REVOKE ALL ON FUNCTION graph.alignment_gaps(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.alignment_gaps(uuid, uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G7 THE HEALTH INPUT (the contract's `measure` branch — EXACTLY executive.health_measure_inputs' RETURNS TABLE)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION graph.health_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  SELECT 'measure'::text, f.measure_id, f.definition_version::bigint, f.title, f.last_value, f.unit, f.direction, f.last_observed_at,
         f.freshness_days, NULL::numeric,
         CASE WHEN f.last_source IS NULL THEN '[]'::jsonb
              ELSE jsonb_build_array(jsonb_build_object('object_id', f.last_source ->> 'id', 'version', (f.last_source ->> 'version')::bigint)) END,
         f.objective_ids, NULL::jsonb,
         format('measure %s (definition version %s, approved by act %s until %s): %s; target %s %s%s (%s); expected every %s day(s); no confidence input',
                f.measure_id, f.definition_version, f.approval_act_id, f.approval_expires_at,
                CASE WHEN f.last_observed_at IS NULL THEN 'no observation at or before the instant (no value is imputed)'
                     ELSE format('its latest observation at or before the instant, %s at %s (%s)', f.last_value, f.last_observed_at, f.state) END,
                f.target_value, f.unit, CASE WHEN f.target_date IS NULL THEN '' ELSE ' by ' || f.target_date::text END, f.direction, f.freshness_days)
    FROM graph.measure_freshness(p_tenant, p_domain, p_at) f
   WHERE f.approved_now AND f.status = 'active';
$$;
REVOKE ALL ON FUNCTION graph.health_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.health_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §G8 graph.record_impact re-declared — the new strategy types the walk reached, recorded
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0079 §6's body (the latest) copied whole; the ONLY changes: the twentieth argument p_strategy_nodes (the capabilities, initiatives,
-- resources, measures, stakeholders and risks/opportunities the walk reached — listed for human review, nothing marked), written to
-- affected_strategy_nodes and counted as `strategy_nodes` in the invalidation.assessed details. The nineteen-argument signature is
-- dropped (a call naming nineteen still resolves: the twentieth defaults to '[]').
ALTER TABLE graph.invalidations_current ADD COLUMN affected_strategy_nodes jsonb NOT NULL DEFAULT '[]'::jsonb;
DROP FUNCTION IF EXISTS graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb);
CREATE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_forecasts jsonb, p_twins jsonb, p_simulations jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid,
  p_warnings jsonb, p_briefings jsonb, p_memory_items jsonb DEFAULT '[]'::jsonb,
  /* B32 (0089) graph */ p_strategy_nodes jsonb DEFAULT '[]'::jsonb /* end B32 graph */
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, prediction, twin, simulation, executive, memory, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; cov record; f jsonb; t jsonb; r jsonb; w jsonb; b jsonb; mi jsonb; v_versions int[]; v_version int; v_marked jsonb := '[]'::jsonb; v_routes text[]; v_trigger_kind text; v_trigger_id uuid;
  v_cov_state text; v_cov_roots int := 0; v_cov_covered int := 0; v_cov_outstanding int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE graph.invalidations_current
     SET affected_assumptions = coalesce(p_assumptions, '[]'::jsonb),
         affected_objectives  = coalesce(p_objectives,  '[]'::jsonb),
         affected_decisions   = coalesce(p_decisions,   '[]'::jsonb),
         affected_commitments = coalesce(p_commitments, '[]'::jsonb),
         affected_forecasts   = coalesce(p_forecasts,   '[]'::jsonb),
         affected_twins       = coalesce(p_twins,       '[]'::jsonb),
         affected_simulations = coalesce(p_simulations, '[]'::jsonb),
         affected_warnings    = coalesce(p_warnings,    '[]'::jsonb),
         affected_briefings   = coalesce(p_briefings,   '[]'::jsonb),
         affected_memory_items = coalesce(p_memory_items, '[]'::jsonb),
         /* B32 (0089) graph */ affected_strategy_nodes = coalesce(p_strategy_nodes, '[]'::jsonb), /* end B32 graph */
         statement = p_statement,
         truncated = coalesce(p_truncated, false),
         unexplored = coalesce(p_unexplored, '[]'::jsonb),
         state = 'assessed', assessed_at = clock_timestamp()
   WHERE invalidation_id = p_invalidation_id
   RETURNING correction_case_id, trigger_kind, trigger_object_id INTO v_case, v_trigger_kind, v_trigger_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'impact rejected: no such invalidation' USING ERRCODE = '23503';
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(p_forecasts, '[]'::jsonb)) LOOP
    UPDATE prediction.forecasts_current
       SET attention_state = 'assumption_unverified',
           attention_reason = format('invalidation %s: %s', p_invalidation_id, f ->> 'reached_via'),
           updated_at = clock_timestamp()
     WHERE forecast_id = (f ->> 'forecast_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain
       AND state IN ('issued');
    IF FOUND THEN
      INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (f ->> 'forecast_id')::uuid, 'forecast.attention', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', f ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;

  FOR t IN SELECT * FROM jsonb_array_elements(coalesce(p_twins, '[]'::jsonb)) LOOP
    -- every route: `via_ids` when the walk recorded several, `via_id` for one
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[]) INTO v_routes
      FROM (SELECT t ->> 'via_id' AS x WHERE (t ->> 'via_id') IS NOT NULL
            UNION ALL SELECT y #>> '{}' FROM jsonb_array_elements(coalesce(t -> 'via_ids', '[]'::jsonb)) y) s WHERE x IS NOT NULL;
    SELECT coalesce(array_agg(DISTINCT v.version ORDER BY v.version), ARRAY[]::int[]) INTO v_versions
      FROM twin.twin_versions v
      JOIN twin.state_elements e ON e.twin_id = v.twin_id AND e.version = v.version
     WHERE v.twin_id = (t ->> 'twin_id')::uuid AND v.tenant_id = p_tenant AND v.domain_id = p_domain
       AND v.state = 'admitted' AND v.verification_state = 'verified'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c WHERE (c ->> 'id') = ANY (v_routes));
    FOREACH v_version IN ARRAY v_versions LOOP
      PERFORM twin.mark_unverified((t ->> 'twin_id')::uuid, p_tenant, p_domain, v_version,
        format('invalidation %s: %s', p_invalidation_id, t ->> 'reached_via'), p_invalidation_id, p_actor, gen_random_uuid(), p_correlation);
      v_marked := v_marked || jsonb_build_object('twin_id', t ->> 'twin_id', 'version', v_version);
    END LOOP;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_simulations, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM simulation.runs_current s WHERE s.run_id = (r ->> 'run_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (r ->> 'run_id')::uuid, 'run.unverified', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', r ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;

  -- B8 §8 (AU-MEM-0031): a WARNING the walk reached is marked for attention (once; the warning row's own fields stay immutable),
  -- a BRIEFING composed before the change is RE-FLAGGED by event (the briefing is append-only; its content keeps its digest).
  FOR w IN SELECT * FROM jsonb_array_elements(coalesce(p_warnings, '[]'::jsonb)) LOOP
    UPDATE prediction.warnings_current
       SET attention_state = 'input_unverified', attention_reason = format('invalidation %s: %s', p_invalidation_id, w ->> 'reached_via')
     WHERE warning_id = (w ->> 'warning_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain AND attention_state = 'none' AND state IN ('raised', 'acknowledged');
    IF FOUND THEN
      INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (w ->> 'warning_id')::uuid, 'warning.attention', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', w ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;
  FOR b IN SELECT * FROM jsonb_array_elements(coalesce(p_briefings, '[]'::jsonb)) LOOP
    -- a briefing composed BEFORE the change it rests on: for a corrected object, the object has a version recorded after the
    -- briefing's known-at (a briefing composed on the corrected version is not re-flagged by the correction it already saw)
    IF EXISTS (SELECT 1 FROM executive.briefings x
                WHERE x.briefing_id = (b ->> 'briefing_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain
                  AND (v_trigger_kind NOT IN ('evidence_correction', 'claim_correction', 'claim_withdrawal')
                       OR EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_trigger_id AND o.recorded_at > x.known_at)))
       AND NOT EXISTS (SELECT 1 FROM executive.briefing_events e WHERE e.briefing_id = (b ->> 'briefing_id')::uuid AND e.event = 'briefing.re_flagged' AND e.details ->> 'invalidation_id' = p_invalidation_id::text) THEN
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (b ->> 'briefing_id')::uuid, 'briefing.re_flagged', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', b ->> 'reached_via', 'correction_case_id', v_case), p_correlation);
    END IF;
  END LOOP;

  -- 0066 §3: memory items resting on what changed — an ACTIVE item recorded before the change (for a corrected object, the
  -- object has a version recorded after the item's record instant) is marked for the knowledge owner's attention once per
  -- invalidation; the item itself (a version of the institutional record) is never rewritten by a walk.
  -- B19 (0079): a claim_withdrawal walk marks basis_withdrawn when the trigger object's LATEST version is withdrawn (else
  -- basis_corrected: the walk reached the item, but no withdrawal stands); an item already basis_withdrawn keeps that mark (a
  -- later correction walk of the same object does not downgrade it) — the event still records the invalidation, with the
  -- trigger kind and the state left on the item.
  FOR mi IN SELECT * FROM jsonb_array_elements(coalesce(p_memory_items, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM memory.items_current x
                WHERE x.item_id = (mi ->> 'item_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active'
                  AND (v_trigger_kind NOT IN ('evidence_correction', 'claim_correction', 'claim_withdrawal')
                       OR EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_trigger_id AND o.recorded_at > x.recorded_at)))
       AND NOT EXISTS (SELECT 1 FROM memory.item_events e WHERE e.item_id = (mi ->> 'item_id')::uuid AND e.event = 'memory.attention' AND e.details ->> 'invalidation_id' = p_invalidation_id::text) THEN
      UPDATE memory.items_current
         SET attention_state = CASE WHEN attention_state = 'basis_withdrawn'
                                      OR (v_trigger_kind = 'claim_withdrawal'
                                          AND coalesce((SELECT o.lifecycle_state FROM objects.canonical_objects o
                                                         WHERE o.object_id = v_trigger_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                                                         ORDER BY o.object_version DESC LIMIT 1), '') = 'withdrawn')
                                    THEN 'basis_withdrawn' ELSE 'basis_corrected' END,
             attention_reason = left('invalidation ' || p_invalidation_id::text || ': ' || coalesce(mi ->> 'reached_via', 'what this record rests on changed'), 500)
       WHERE item_id = (mi ->> 'item_id')::uuid;
      INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
      SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.item_id, 'memory.attention', x.object_version, p_actor,
             jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', mi ->> 'reached_via', 'correction_case_id', v_case, 'trigger_kind', v_trigger_kind, 'attention_state', x.attention_state), p_correlation
        FROM memory.items_current x WHERE x.item_id = (mi ->> 'item_id')::uuid;
    END IF;
  END LOOP;

  IF v_case IS NOT NULL THEN
    SELECT * INTO cov FROM graph.case_propagation_coverage(v_case);
    v_cov_state := coalesce(cov.state, 'partial');
    v_cov_roots := coalesce(cov.roots, 0);
    v_cov_covered := coalesce(cov.covered, 0);
    v_cov_outstanding := coalesce(cov.missing, 0) + coalesce(cov.truncated_latest, 0);
    UPDATE observation.correction_current
       SET propagation_unresolved = coalesce(cov.sentence, p_statement),
           propagation_assessment_id = p_invalidation_id,
           propagation_state = v_cov_state
     WHERE case_id = v_case AND tenant_id = p_tenant AND domain_id = p_domain;
  END IF;

  INSERT INTO graph.invalidation_events (event_id, scope, tenant_id, domain_id, invalidation_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_invalidation_id, 'invalidation.assessed', p_actor, jsonb_build_object(
      'assumptions', jsonb_array_length(coalesce(p_assumptions, '[]'::jsonb)),
      'objectives',  jsonb_array_length(coalesce(p_objectives,  '[]'::jsonb)),
      'decisions',   jsonb_array_length(coalesce(p_decisions,   '[]'::jsonb)),
      'commitments', jsonb_array_length(coalesce(p_commitments, '[]'::jsonb)),
      'forecasts',   jsonb_array_length(coalesce(p_forecasts,   '[]'::jsonb)),
      'twins',       jsonb_array_length(coalesce(p_twins,       '[]'::jsonb)),
      'twin_versions_unverified', v_marked,
      'simulations', jsonb_array_length(coalesce(p_simulations, '[]'::jsonb)),
      'warnings',    jsonb_array_length(coalesce(p_warnings,    '[]'::jsonb)),
      'briefings',   jsonb_array_length(coalesce(p_briefings,   '[]'::jsonb)),
      'memory_items', jsonb_array_length(coalesce(p_memory_items, '[]'::jsonb)),
      /* B32 (0089) graph */ 'strategy_nodes', jsonb_array_length(coalesce(p_strategy_nodes, '[]'::jsonb)), /* end B32 graph */
      'truncated', coalesce(p_truncated, false),
      'unexplored', jsonb_array_length(coalesce(p_unexplored, '[]'::jsonb)),
      'correction_case_id', v_case, 'case_propagation_state', v_cov_state,
      'roots', v_cov_roots, 'roots_covered', v_cov_covered,
      'roots_outstanding', v_cov_outstanding, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `health`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §H (section `health`)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0089 §H (B32 part `health`) — CP-6 B32: THE DECOMPOSABLE STRATEGIC HEALTH SCORE (2026-09-28). F-P6-08; V0 C-034, V00-T-099; V1
-- V01-T-025; V2 V02-T-220/-221; V3 V03-T-186, L10-C02 (the Strategic Health Score beside the materiality engine); V5 AI-56-004; V8
-- ADR-018, PR-43-001..006, CAP-EO-05, AT-43; V9 UX-43-001..006, VIZ-12 ("gauge without decomposition" is the anti-pattern).
--
-- THE GAP. No health score existed (no code, table or page). The register's words: a score SHALL expose component measures, weights,
-- evidence, confidence, trend and sensitivity and never replace the underlying analysis (C-034); humans approve dimensions, measures,
-- weights and thresholds — AI may compute and explain (PR-43-003); stale or missing inputs, disputed weights, gamed metrics, low
-- confidence or an aggregation masking a critical failure mark the score PARTIAL or INDETERMINATE and prevent misleading comparison
-- (PR-43-005, ADR-018).
--
-- THE MECHANISM.
-- (H1) THE DEFINITION: executive.health_score_definitions — one row per VERSION of a domain's score model {dimensions (key, label,
--   weight, objective_ids, threshold bands), components (key, dimension, input_kind + input_id, weight, direction, normalisation
--   {worst, best}, stale_after_days, critical, critical_below), min_coverage, min_confidence, change_points}; the formula version; the
--   model digest; the changed sections against the version it would supersede; a reason. TWO PEOPLE: a named human PROPOSES it
--   (executive, domain_admin, strategy_owner, platform_admin) and ANOTHER approves (executive, domain_admin, platform_admin) or refuses
--   it — the proposer never decides their own proposal (xhsd_separation, the 0086 §G1 idiom). Approval ACTIVATES it (one active per
--   domain; the prior active superseded); immutable but for its decision and its supersession. Weights sum to 1 per dimension and across
--   dimensions; every objective an active OBJ of the domain; one component per input. ANTI-GAMING: a proposal moving a weight by more
--   than the policy delta (0.15), a threshold by more than 10 points, lowering the coverage floor or removing a critical flag is flagged
--   gaming_review_required with its reasons — its approver records the anti-gaming review (a note) or the approval is refused.
-- (H2) THE COMPOSITION (a PURE IMMUTABLE function, executive.health_compose): each component reads its input from the contract rows it
--   is handed; an input absent at the instant, with no value, observed after the instant or in the other direction is MISSING or
--   INCONSISTENT; an input older than the component's stale_after_days (or its own declared cadence) is STALE — both EXCLUDED and
--   DECLARED with their reasons, never imputed. A dimension is the weight-renormalised mean over its included components with its
--   COVERAGE (the included weight); below min_coverage it is INDETERMINATE (no value). A critical component unavailable or below its
--   floor is a CRITICAL FAILURE: the dimension is PARTIAL and its band the lowest — never averaged away. The aggregate is the
--   dimension-weighted mean, NULL (INDETERMINATE) when any dimension is. Each component carries its evidence, confidence (NULL = no
--   input, stated), trend against the prior snapshot, freshness, its contribution and its SENSITIVITY (executive.health_sensitivity:
--   the dimension's value at ±10 % weight and its bounds at 0 and 100 — for an excluded component, the missing-data analysis).
-- (H3) THE SNAPSHOT: executive.compute_health_score reads ONLY executive.health_measure_inputs (0089 §0; the graph and exposure parts'
--   branches are unioned in by the integrator) — the rows the model names, recorded with their digest — composes them under the active
--   definition and records executive.health_score_snapshots (append-only; status complete | partial | indeterminate; the aggregate NULL
--   when indeterminate) and executive.health_score_components (append-only), with the decision links (the DEC objects resting on the
--   dimension's and the input's objectives — graph.dependencies, the lineage read) and the lineage. A snapshot at an instant after every
--   current snapshot of its definition is CURRENT; one at an earlier instant is AS_OF (a temporal replay: it raises nothing and says
--   whether it REPRODUCES the snapshot at the same instant — the same inputs and result digests).
-- (H4) THE CHANGES: executive.health_score_changes + the append-only executive.health_score_change_events — a current snapshot compared
--   with the prior current snapshot of the SAME definition raises a change per dimension (and the aggregate) that crosses a band, moves
--   by more than change_points or becomes (in)determinate (NORDWERK's supply resilience 71 → 58). ACKNOWLEDGE (a receipt, never
--   agreement — OBJ-20); CHALLENGE (input | weight | threshold | formula | interpretation, a statement) → UPHELD | DISMISSED by a person
--   who is neither the challenger nor the approver of the definition (xhsc_separation, in the record), or WITHDRAWN by the challenger.
--   ANTI-GAMING flags on the change, SHOWN and gating nothing: an input RESTATED inside the window before a favourable change (the same
--   observation instant, another value) and a value SITTING ON its threshold (within 1 point above a band's floor). An upheld challenge
--   never rewrites the snapshot: the remedy is a new definition version (two people) or a corrected input.
--
-- NOT HERE (stated): executive.health_measure_inputs (the prelude's; the integrator's §I union); an attention signal class for a score
-- change and every executive.attention_* object (B34 consumes the score); peer comparison (no peer input exists in this product — the
-- comparison answers {peer: null, reason}); a scheduled computation (a person or an agent computes on demand); the "owner of the
-- measured input" clause of the anti-gaming rule (the contract carries no owner column — asked of the prelude); an outbox event (the
-- interface register stays 50/0/0 — B32 adds no interface).

-- ============================================================
-- §H0 THE CONSTANTS
-- ============================================================
CREATE OR REPLACE FUNCTION executive.health_formula_version() RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'shs-weighted-coverage@1'::text $$;
GRANT EXECUTE ON FUNCTION executive.health_formula_version() TO eye_app, eye_commit;
-- The anti-gaming policy of a proposal: the moves a proposal may make without its approver recording an anti-gaming review, and the
-- margin a value "sits on" a threshold within.
CREATE OR REPLACE FUNCTION executive.health_gaming_policy() RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('max_weight_move', 0.15, 'max_threshold_move', 10, 'on_threshold_points', 1) $$;
GRANT EXECUTE ON FUNCTION executive.health_gaming_policy() TO eye_app, eye_commit;
CREATE OR REPLACE FUNCTION executive.health_input_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['indicator', 'measure', 'risk', 'opportunity'] $$;
GRANT EXECUTE ON FUNCTION executive.health_input_kinds() TO eye_app, eye_commit;

-- ============================================================
-- §H1 THE DEFINITION
-- ============================================================
CREATE TABLE executive.health_score_definitions (
  definition_id          uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  version                int  NOT NULL CHECK (version >= 1),
  state                  text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'active', 'superseded', 'refused')),
  model                  jsonb NOT NULL CHECK (jsonb_typeof(model) = 'object'),
  model_digest           text NOT NULL CHECK (model_digest ~ '^[0-9a-f]{64}$'),
  formula_version        text NOT NULL,
  changed_sections       text[] NOT NULL DEFAULT '{}',
  reason                 text NOT NULL CHECK (length(btrim(reason)) >= 8),
  /* the active version when it was proposed (NULL for a domain's first) — the version it would supersede */
  basis_version          int,
  gaming_review_required boolean NOT NULL DEFAULT false,
  gaming_reasons         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(gaming_reasons) = 'array'),
  proposed_by            uuid NOT NULL,
  proposed_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by            uuid,
  approved_at            timestamptz,
  approval_note          text,
  gaming_review_note     text,
  supersedes             int,
  refused_by             uuid,
  refused_at             timestamptz,
  refusal_reason         text,
  superseded_at          timestamptz,
  correlation_id         uuid NOT NULL,
  CONSTRAINT xhsd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xhsd_version_once UNIQUE (tenant_id, domain_id, version),
  CONSTRAINT xhsd_approved CHECK ((state IN ('active', 'superseded')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL AND length(btrim(coalesce(approval_note, ''))) >= 8)),
  CONSTRAINT xhsd_refused CHECK ((state = 'refused') = (refused_by IS NOT NULL AND refused_at IS NOT NULL AND length(btrim(coalesce(refusal_reason, ''))) >= 8)),
  CONSTRAINT xhsd_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  -- TWO PEOPLE, in the record itself: the proposer never approves or refuses their own definition
  CONSTRAINT xhsd_separation CHECK ((approved_by IS NULL OR approved_by <> proposed_by) AND (refused_by IS NULL OR refused_by <> proposed_by)),
  -- a flagged proposal is approved only with its anti-gaming review recorded
  CONSTRAINT xhsd_gaming_review CHECK (NOT (gaming_review_required AND approved_by IS NOT NULL) OR length(btrim(coalesce(gaming_review_note, ''))) >= 8)
);
CREATE UNIQUE INDEX xhsd_one_active ON executive.health_score_definitions (tenant_id, domain_id) WHERE state = 'active';
CREATE UNIQUE INDEX xhsd_one_proposed ON executive.health_score_definitions (tenant_id, domain_id) WHERE state = 'proposed';
COMMENT ON TABLE executive.health_score_definitions IS 'B32 (0089 §H1; F-P6-08, PR-43-002/003, ADR-018): the Strategic Health Score''s model of a domain, one row per VERSION — dimensions, components, measures (the contract''s inputs), weights, thresholds, normalisation, freshness bounds, the formula version and the model digest; proposed by one named human and approved (activated) or refused by ANOTHER; immutable but for its decision and its supersession.';
-- A version is never rewritten: proposed → active | refused (the decision's own fields, once), active → superseded (once); nothing is deleted.
CREATE OR REPLACE FUNCTION executive.health_definition_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'health score definitions are never deleted' USING ERRCODE = '55000'; END IF;
  IF OLD.state = 'proposed' AND NEW.state = 'active'
     AND (to_jsonb(NEW) - ARRAY['state', 'approved_by', 'approved_at', 'approval_note', 'gaming_review_note', 'supersedes'])
       = (to_jsonb(OLD) - ARRAY['state', 'approved_by', 'approved_at', 'approval_note', 'gaming_review_note', 'supersedes']) THEN RETURN NEW; END IF;
  IF OLD.state = 'proposed' AND NEW.state = 'refused'
     AND (to_jsonb(NEW) - ARRAY['state', 'refused_by', 'refused_at', 'refusal_reason']) = (to_jsonb(OLD) - ARRAY['state', 'refused_by', 'refused_at', 'refusal_reason']) THEN RETURN NEW; END IF;
  IF OLD.state = 'active' AND NEW.state = 'superseded'
     AND (to_jsonb(NEW) - ARRAY['state', 'superseded_at']) = (to_jsonb(OLD) - ARRAY['state', 'superseded_at']) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'health score definition version % is % and immutable; a change is a new version', OLD.version, OLD.state USING ERRCODE = '55000';
END $$;
CREATE TRIGGER xhsd_immutable BEFORE UPDATE OR DELETE ON executive.health_score_definitions FOR EACH ROW EXECUTE FUNCTION executive.health_definition_immutable();

-- THE MODEL, validated whole: every key known, every bound in its range, the weights summing to 1 (22023 naming the key).
CREATE OR REPLACE FUNCTION executive.validate_health_model(p_model jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE d jsonb; c jsonb; b jsonb; k text; v_prev numeric; v_last numeric; v_sum numeric; v_dims text[] := '{}'; v_comps text[] := '{}'; v_inputs text[] := '{}';
        v_bkeys text[]; v_key text; v_n int; v_w numeric; v_worst numeric; v_best numeric;
BEGIN
  IF p_model IS NULL OR jsonb_typeof(p_model) <> 'object' THEN RAISE EXCEPTION 'health definition rejected: the model is an object {dimensions, components, min_coverage, change_points, min_confidence?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_model) LOOP
    IF k NOT IN ('dimensions', 'components', 'min_coverage', 'min_confidence', 'change_points') THEN RAISE EXCEPTION 'health definition rejected: unknown key % (the model carries dimensions, components, min_coverage, change_points and optionally min_confidence)', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF jsonb_typeof(p_model -> 'min_coverage') IS DISTINCT FROM 'number' OR (p_model ->> 'min_coverage')::numeric <= 0 OR (p_model ->> 'min_coverage')::numeric > 1 THEN
    RAISE EXCEPTION 'health definition rejected: min_coverage is a number in (0, 1] — the included weight below which a dimension is indeterminate' USING ERRCODE = '22023';
  END IF;
  IF p_model ? 'min_confidence' AND jsonb_typeof(p_model -> 'min_confidence') <> 'null'
     AND (jsonb_typeof(p_model -> 'min_confidence') <> 'number' OR (p_model ->> 'min_confidence')::numeric < 0 OR (p_model ->> 'min_confidence')::numeric > 1) THEN
    RAISE EXCEPTION 'health definition rejected: min_confidence is a number in [0, 1] or null' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'change_points') IS DISTINCT FROM 'number' OR (p_model ->> 'change_points')::numeric <= 0 OR (p_model ->> 'change_points')::numeric > 100 THEN
    RAISE EXCEPTION 'health definition rejected: change_points is a number in (0, 100] — the move that raises a score change' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'dimensions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_model -> 'dimensions') NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'health definition rejected: dimensions is a list of 1 to 12 dimensions' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'components') IS DISTINCT FROM 'array' OR jsonb_array_length(p_model -> 'components') NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'health definition rejected: components is a list of 1 to 60 components' USING ERRCODE = '22023';
  END IF;
  v_sum := 0;
  FOR d IN SELECT value FROM jsonb_array_elements(p_model -> 'dimensions') LOOP
    IF jsonb_typeof(d) <> 'object' THEN RAISE EXCEPTION 'health definition rejected: a dimension is an object {key, label, weight, objective_ids, bands}' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(d) LOOP
      IF k NOT IN ('key', 'label', 'weight', 'objective_ids', 'bands') THEN RAISE EXCEPTION 'health definition rejected: dimension % carries the unknown key %', coalesce(d ->> 'key', '?'), k USING ERRCODE = '22023'; END IF;
    END LOOP;
    v_key := d ->> 'key';
    IF jsonb_typeof(d -> 'key') IS DISTINCT FROM 'string' OR v_key !~ '^[a-z][a-z0-9_]{1,62}$' THEN RAISE EXCEPTION 'health definition rejected: a dimension key is lower_snake_case (2–63 characters)' USING ERRCODE = '22023'; END IF;
    IF v_key = ANY (v_dims) THEN RAISE EXCEPTION 'health definition rejected: dimension % is declared twice', v_key USING ERRCODE = '22023'; END IF;
    v_dims := v_dims || v_key;
    IF jsonb_typeof(d -> 'label') IS DISTINCT FROM 'string' OR length(btrim(d ->> 'label')) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'health definition rejected: dimension % label is 2–120 characters', v_key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(d -> 'weight') IS DISTINCT FROM 'number' OR (d ->> 'weight')::numeric <= 0 OR (d ->> 'weight')::numeric > 1 THEN RAISE EXCEPTION 'health definition rejected: dimension % weight is a number in (0, 1]', v_key USING ERRCODE = '22023'; END IF;
    v_sum := v_sum + (d ->> 'weight')::numeric;
    IF jsonb_typeof(d -> 'objective_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(d -> 'objective_ids') = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'objective_ids') o WHERE jsonb_typeof(o) <> 'string' OR (o #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'health definition rejected: dimension % objective_ids is a non-empty list of objective ids (every roll-up decomposes to objectives — V03-T-186)', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(d -> 'bands') IS DISTINCT FROM 'array' OR jsonb_array_length(d -> 'bands') NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'health definition rejected: dimension % bands is a list of 1 to 6 {key, min}, highest first, the last at 0', v_key USING ERRCODE = '22023'; END IF;
    v_prev := NULL; v_bkeys := '{}';
    FOR b IN SELECT value FROM jsonb_array_elements(d -> 'bands') LOOP
      IF jsonb_typeof(b) <> 'object' OR jsonb_typeof(b -> 'key') IS DISTINCT FROM 'string' OR (b ->> 'key') !~ '^[a-z][a-z0-9_]{1,30}$' OR jsonb_typeof(b -> 'min') IS DISTINCT FROM 'number'
         OR (SELECT count(*) FROM jsonb_object_keys(b)) <> 2 THEN
        RAISE EXCEPTION 'health definition rejected: dimension % band is {key, min} (a lower_snake_case key, a number)', v_key USING ERRCODE = '22023';
      END IF;
      IF (b ->> 'key') = ANY (v_bkeys) THEN RAISE EXCEPTION 'health definition rejected: dimension % band % is declared twice', v_key, b ->> 'key' USING ERRCODE = '22023'; END IF;
      v_bkeys := v_bkeys || (b ->> 'key');
      IF (b ->> 'min')::numeric < 0 OR (b ->> 'min')::numeric > 100 OR (v_prev IS NOT NULL AND (b ->> 'min')::numeric >= v_prev) THEN
        RAISE EXCEPTION 'health definition rejected: dimension % bands descend strictly in [0, 100] (highest first)', v_key USING ERRCODE = '22023';
      END IF;
      v_prev := (b ->> 'min')::numeric;
    END LOOP;
    IF v_prev <> 0 THEN RAISE EXCEPTION 'health definition rejected: dimension % last band starts at 0 (every value falls in a band)', v_key USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF abs(v_sum - 1) > 0.0001 THEN RAISE EXCEPTION 'health definition rejected: the dimension weights sum to % — they sum to 1', v_sum USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_model -> 'components') LOOP
    IF jsonb_typeof(c) <> 'object' THEN RAISE EXCEPTION 'health definition rejected: a component is an object' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(c) LOOP
      IF k NOT IN ('key', 'label', 'dimension', 'input_kind', 'input_id', 'weight', 'direction', 'normalisation', 'stale_after_days', 'critical', 'critical_below') THEN
        RAISE EXCEPTION 'health definition rejected: component % carries the unknown key %', coalesce(c ->> 'key', '?'), k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_key := c ->> 'key';
    IF jsonb_typeof(c -> 'key') IS DISTINCT FROM 'string' OR v_key !~ '^[a-z][a-z0-9_]{1,62}$' THEN RAISE EXCEPTION 'health definition rejected: a component key is lower_snake_case (2–63 characters)' USING ERRCODE = '22023'; END IF;
    IF v_key = ANY (v_comps) THEN RAISE EXCEPTION 'health definition rejected: component % is declared twice', v_key USING ERRCODE = '22023'; END IF;
    v_comps := v_comps || v_key;
    IF jsonb_typeof(c -> 'label') IS DISTINCT FROM 'string' OR length(btrim(c ->> 'label')) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'health definition rejected: component % label is 2–120 characters', v_key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(c -> 'dimension') IS DISTINCT FROM 'string' OR NOT ((c ->> 'dimension') = ANY (v_dims)) THEN RAISE EXCEPTION 'health definition rejected: component % names the dimension %, which the model does not declare', v_key, coalesce(c ->> 'dimension', 'none') USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(c -> 'input_kind') IS DISTINCT FROM 'string' OR NOT ((c ->> 'input_kind') = ANY (executive.health_input_kinds())) THEN
      RAISE EXCEPTION 'health definition rejected: component % input_kind is one of % (the contract''s kinds)', v_key, array_to_string(executive.health_input_kinds(), ', ') USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(c -> 'input_id') IS DISTINCT FROM 'string' OR (c ->> 'input_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'health definition rejected: component % input_id is the id of the contract input it reads', v_key USING ERRCODE = '22023'; END IF;
    IF (c ->> 'input_kind') || ':' || lower(c ->> 'input_id') = ANY (v_inputs) THEN
      RAISE EXCEPTION 'health definition rejected: component % reads % %, which another component already reads (one component per input — no double counting)', v_key, c ->> 'input_kind', c ->> 'input_id' USING ERRCODE = '22023';
    END IF;
    v_inputs := v_inputs || ((c ->> 'input_kind') || ':' || lower(c ->> 'input_id'));
    IF jsonb_typeof(c -> 'weight') IS DISTINCT FROM 'number' OR (c ->> 'weight')::numeric <= 0 OR (c ->> 'weight')::numeric > 1 THEN RAISE EXCEPTION 'health definition rejected: component % weight is a number in (0, 1]', v_key USING ERRCODE = '22023'; END IF;
    IF coalesce(c ->> 'direction', '') NOT IN ('higher_better', 'lower_better') THEN RAISE EXCEPTION 'health definition rejected: component % direction is higher_better or lower_better', v_key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(c -> 'normalisation') IS DISTINCT FROM 'object' OR jsonb_typeof(c #> '{normalisation,worst}') IS DISTINCT FROM 'number' OR jsonb_typeof(c #> '{normalisation,best}') IS DISTINCT FROM 'number'
       OR (SELECT count(*) FROM jsonb_object_keys(c -> 'normalisation')) <> 2 THEN
      RAISE EXCEPTION 'health definition rejected: component % normalisation is {worst, best} — the input values scored 0 and 100', v_key USING ERRCODE = '22023';
    END IF;
    v_worst := (c #>> '{normalisation,worst}')::numeric; v_best := (c #>> '{normalisation,best}')::numeric;
    IF (c ->> 'direction' = 'higher_better' AND v_best <= v_worst) OR (c ->> 'direction' = 'lower_better' AND v_best >= v_worst) THEN
      RAISE EXCEPTION 'health definition rejected: component % normalisation contradicts its direction % (best % against worst %)', v_key, c ->> 'direction', v_best, v_worst USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(c -> 'stale_after_days') IS DISTINCT FROM 'number' OR (c ->> 'stale_after_days')::numeric <= 0 OR (c ->> 'stale_after_days')::numeric > 3650 THEN
      RAISE EXCEPTION 'health definition rejected: component % stale_after_days is a number in (0, 3650] — an input older is stale, excluded and declared', v_key USING ERRCODE = '22023';
    END IF;
    IF c ? 'critical' AND jsonb_typeof(c -> 'critical') <> 'boolean' THEN RAISE EXCEPTION 'health definition rejected: component % critical is a boolean', v_key USING ERRCODE = '22023'; END IF;
    IF c ? 'critical_below' AND jsonb_typeof(c -> 'critical_below') <> 'null' THEN
      IF NOT coalesce((c ->> 'critical')::boolean, false) THEN RAISE EXCEPTION 'health definition rejected: component % critical_below applies to a critical component only', v_key USING ERRCODE = '22023'; END IF;
      IF jsonb_typeof(c -> 'critical_below') <> 'number' OR (c ->> 'critical_below')::numeric < 0 OR (c ->> 'critical_below')::numeric > 100 THEN RAISE EXCEPTION 'health definition rejected: component % critical_below is a normalised value in [0, 100]', v_key USING ERRCODE = '22023'; END IF;
    END IF;
  END LOOP;
  FOR v_key IN SELECT unnest(v_dims) LOOP
    SELECT count(*), coalesce(sum((c2 ->> 'weight')::numeric), 0) INTO v_n, v_w FROM jsonb_array_elements(p_model -> 'components') c2 WHERE c2 ->> 'dimension' = v_key;
    IF v_n = 0 THEN RAISE EXCEPTION 'health definition rejected: dimension % has no component (a dimension decomposes into its measures)', v_key USING ERRCODE = '22023'; END IF;
    IF abs(v_w - 1) > 0.0001 THEN RAISE EXCEPTION 'health definition rejected: the component weights of dimension % sum to % — they sum to 1', v_key, v_w USING ERRCODE = '22023'; END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION executive.validate_health_model(jsonb) TO eye_app, eye_commit;

-- ============================================================
-- §H2 THE COMPOSITION — pure (IMMUTABLE): the model, the contract rows, the instant and the prior result in; the decomposition out
-- ============================================================
-- An input value on the 0–100 scale (worst → 0, best → 100, clamped; the direction is carried by the order of worst and best).
CREATE OR REPLACE FUNCTION executive.health_normalise(p_value numeric, p_worst numeric, p_best numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_value IS NULL OR p_worst IS NULL OR p_best IS NULL OR p_worst = p_best THEN NULL
              ELSE round(greatest(0::numeric, least(100::numeric, (p_value - p_worst) / (p_best - p_worst) * 100)), 4) END
$$;
GRANT EXECUTE ON FUNCTION executive.health_normalise(numeric, numeric, numeric) TO eye_app, eye_commit;

-- The band a value falls in: the first band (highest first) whose floor it reaches; NULL for no value.
CREATE OR REPLACE FUNCTION executive.health_band(p_bands jsonb, p_value numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_value IS NULL THEN NULL ELSE
    (SELECT b ->> 'key' FROM jsonb_array_elements(p_bands) WITH ORDINALITY x(b, n) WHERE p_value >= (b ->> 'min')::numeric ORDER BY n LIMIT 1) END
$$;
GRANT EXECUTE ON FUNCTION executive.health_band(jsonb, numeric) TO eye_app, eye_commit;

-- A weighted value over parts [{w, n}] (n NULL = excluded): {value, coverage} — the value renormalised over the included weight, NULL
-- when the included weight is below the floor (INDETERMINATE: nothing is imputed).
CREATE OR REPLACE FUNCTION executive.health_weighted(p_parts jsonb, p_min_coverage numeric) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  WITH p AS (SELECT (x ->> 'w')::numeric w, CASE WHEN jsonb_typeof(x -> 'n') = 'number' THEN (x ->> 'n')::numeric END n FROM jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) x),
       s AS (SELECT coalesce(sum(w) FILTER (WHERE n IS NOT NULL), 0) cov, sum(w * n) FILTER (WHERE n IS NOT NULL) num FROM p)
  SELECT jsonb_build_object('coverage', round(cov, 4),
                            'value', CASE WHEN cov > 0 AND cov >= p_min_coverage THEN round(num / cov, 2) END) FROM s
$$;
GRANT EXECUTE ON FUNCTION executive.health_weighted(jsonb, numeric) TO eye_app, eye_commit;

-- SENSITIVITY of a weighted value to each part (aligned with the parts): the value with the part's weight +10 % and −10 % (the other
-- weights rescaled so the total is unchanged), the swing between them, and the value were the part's score 0 or 100 — for an excluded
-- part this is the MISSING-DATA ANALYSIS (where the value could lie had the input been available).
CREATE OR REPLACE FUNCTION executive.health_sensitivity(p_parts jsonb, p_min_coverage numeric) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_out jsonb := '[]'::jsonb; v_n int := jsonb_array_length(coalesce(p_parts, '[]'::jsonb)); i int; j int; v_wi numeric; v_up jsonb; v_down jsonb; v_zero jsonb; v_full jsonb;
        x jsonb; v_wu numeric; v_wd numeric; v_u numeric; v_d numeric;
BEGIN
  FOR i IN 0 .. v_n - 1 LOOP
    v_wi := (p_parts -> i ->> 'w')::numeric;
    v_wu := least(1::numeric, v_wi * 1.1); v_wd := v_wi * 0.9;
    v_up := '[]'::jsonb; v_down := '[]'::jsonb; v_zero := '[]'::jsonb; v_full := '[]'::jsonb;
    FOR j IN 0 .. v_n - 1 LOOP
      x := p_parts -> j;
      IF j = i THEN
        v_up := v_up || jsonb_build_object('w', v_wu, 'n', x -> 'n');
        v_down := v_down || jsonb_build_object('w', v_wd, 'n', x -> 'n');
        v_zero := v_zero || jsonb_build_object('w', x -> 'w', 'n', 0);
        v_full := v_full || jsonb_build_object('w', x -> 'w', 'n', 100);
      ELSE
        v_up := v_up || jsonb_build_object('w', CASE WHEN v_wi >= 1 THEN (x ->> 'w')::numeric ELSE (x ->> 'w')::numeric * (1 - v_wu) / (1 - v_wi) END, 'n', x -> 'n');
        v_down := v_down || jsonb_build_object('w', CASE WHEN v_wi >= 1 THEN (x ->> 'w')::numeric ELSE (x ->> 'w')::numeric * (1 - v_wd) / (1 - v_wi) END, 'n', x -> 'n');
        v_zero := v_zero || x; v_full := v_full || x;
      END IF;
    END LOOP;
    v_u := (executive.health_weighted(v_up, p_min_coverage) ->> 'value')::numeric;
    v_d := (executive.health_weighted(v_down, p_min_coverage) ->> 'value')::numeric;
    v_out := v_out || jsonb_build_object('key', p_parts -> i -> 'key', 'weight_plus_10pct', v_u, 'weight_minus_10pct', v_d,
                                         'swing', CASE WHEN v_u IS NOT NULL AND v_d IS NOT NULL THEN round(abs(v_u - v_d), 2) END,
                                         'if_0', (executive.health_weighted(v_zero, p_min_coverage) ->> 'value')::numeric,
                                         'if_100', (executive.health_weighted(v_full, p_min_coverage) ->> 'value')::numeric);
  END LOOP;
  RETURN v_out;
END $$;
GRANT EXECUTE ON FUNCTION executive.health_sensitivity(jsonb, numeric) TO eye_app, eye_commit;

-- THE COMPOSITION. p_inputs: the contract rows (to_jsonb of executive.health_measure_inputs) the model names; p_prior: the prior current
-- snapshot's result of the same definition (or NULL). Pure: no table is read, nothing is imputed, every exclusion carries its reason.
CREATE OR REPLACE FUNCTION executive.health_compose(p_model jsonb, p_inputs jsonb, p_at timestamptz, p_prior jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE c jsonb; d jsonb; i jsonb; v_comps jsonb := '[]'::jsonb; v_dims jsonb := '[]'::jsonb; v_extra jsonb := '{}'::jsonb;
        v_min_cov numeric := (p_model ->> 'min_coverage')::numeric; v_min_conf numeric;
        v_state text; v_reason text; v_value numeric; v_norm numeric; v_obs timestamptz; v_fresh numeric; v_bound numeric; v_conf numeric; v_crit boolean; v_crit_below numeric;
        v_crit_fail boolean; v_low boolean; v_prior_n numeric; v_parts jsonb; v_w jsonb; v_sens jsonb; v_cov numeric; v_dv numeric; v_status text; v_band text; v_basis text;
        v_fails jsonb; v_lows jsonb; v_reasons jsonb; v_prior_v numeric; v_all_reasons jsonb := '[]'::jsonb; v_zero jsonb; v_full jsonb; k int;
        v_agg numeric; v_agg_cov numeric; v_agg_status text; v_dparts jsonb := '[]'::jsonb; v_any_indet boolean := false; v_all_complete boolean := true; v_prior_agg numeric;
        v_counts jsonb;
BEGIN
  v_min_conf := CASE WHEN jsonb_typeof(p_model -> 'min_confidence') = 'number' THEN (p_model ->> 'min_confidence')::numeric END;
  -- 1. THE COMPONENTS, each read from its contract row
  FOR c IN SELECT value FROM jsonb_array_elements(p_model -> 'components') LOOP
    SELECT x INTO i FROM jsonb_array_elements(coalesce(p_inputs, '[]'::jsonb)) x
     WHERE x ->> 'input_kind' = c ->> 'input_kind' AND lower(x ->> 'input_id') = lower(c ->> 'input_id')
     ORDER BY (x ->> 'observed_at')::timestamptz DESC NULLS LAST LIMIT 1;
    v_state := 'included'; v_reason := NULL; v_norm := NULL; v_fresh := NULL; v_obs := NULL; v_value := NULL; v_conf := NULL; v_low := false;
    v_bound := (c ->> 'stale_after_days')::numeric;
    IF i IS NULL THEN
      v_state := 'missing'; v_reason := format('no %s input %s in the contract at the instant (none recorded, retired, or not visible in this domain)', c ->> 'input_kind', c ->> 'input_id');
    ELSE
      v_value := CASE WHEN jsonb_typeof(i -> 'value') = 'number' THEN (i ->> 'value')::numeric END;
      v_obs := CASE WHEN jsonb_typeof(i -> 'observed_at') = 'string' THEN (i ->> 'observed_at')::timestamptz END;
      v_conf := CASE WHEN jsonb_typeof(i -> 'confidence') = 'number' THEN (i ->> 'confidence')::numeric END;
      IF jsonb_typeof(i -> 'expected_every_days') = 'number' THEN v_bound := least(v_bound, (i ->> 'expected_every_days')::numeric); END IF;
      IF v_value IS NULL THEN
        v_state := 'missing'; v_reason := 'the input has no value at or before the instant (never observed)';
      ELSIF v_obs IS NULL THEN
        v_state := 'missing'; v_reason := 'the input carries no observation instant — its freshness cannot be judged';
      ELSIF v_obs > p_at THEN
        v_state := 'inconsistent'; v_reason := format('the input was observed at %s, after the instant %s', v_obs, p_at);
      ELSIF i ->> 'direction' IS DISTINCT FROM c ->> 'direction' THEN
        v_state := 'inconsistent'; v_reason := format('the input says %s, the definition %s — the component is not scored until one of them is corrected', coalesce(i ->> 'direction', 'no direction'), c ->> 'direction');
      ELSE
        v_fresh := round(extract(epoch FROM (p_at - v_obs)) / 86400, 2);
        IF v_fresh > v_bound THEN
          v_state := 'stale'; v_reason := format('observed %s days before the instant; stale after %s days', floor(v_fresh), v_bound);
        ELSE
          v_norm := executive.health_normalise(v_value, (c #>> '{normalisation,worst}')::numeric, (c #>> '{normalisation,best}')::numeric);
          v_low := v_conf IS NOT NULL AND v_min_conf IS NOT NULL AND v_conf < v_min_conf;
        END IF;
      END IF;
      IF v_fresh IS NULL AND v_obs IS NOT NULL AND v_obs <= p_at THEN v_fresh := round(extract(epoch FROM (p_at - v_obs)) / 86400, 2); END IF;
    END IF;
    v_crit := coalesce((c ->> 'critical')::boolean, false);
    v_crit_below := CASE WHEN jsonb_typeof(c -> 'critical_below') = 'number' THEN (c ->> 'critical_below')::numeric END;
    v_crit_fail := v_crit AND (v_state <> 'included' OR (v_crit_below IS NOT NULL AND v_norm < v_crit_below));
    v_prior_n := (SELECT CASE WHEN jsonb_typeof(x -> 'normalised') = 'number' THEN (x ->> 'normalised')::numeric END FROM jsonb_array_elements(coalesce(p_prior -> 'components', '[]'::jsonb)) x WHERE x ->> 'key' = c ->> 'key' LIMIT 1);
    v_comps := v_comps || jsonb_build_object(
      'key', c ->> 'key', 'label', c ->> 'label', 'dimension', c ->> 'dimension', 'input_kind', c ->> 'input_kind', 'input_id', lower(c ->> 'input_id'),
      'input_version', i -> 'input_version', 'input_label', i -> 'label', 'value', v_value, 'unit', i -> 'unit', 'direction', c ->> 'direction',
      'normalisation', c -> 'normalisation', 'normalised', v_norm, 'weight', (c ->> 'weight')::numeric,
      'evidence', coalesce(i -> 'evidence', '[]'::jsonb), 'confidence', v_conf, 'confidence_basis', CASE WHEN i IS NULL THEN 'no input' WHEN v_conf IS NULL THEN 'no confidence input (declared, never assumed)' ELSE 'the input''s own' END,
      'low_confidence', v_low, 'observed_at', v_obs, 'freshness_days', v_fresh, 'stale_after_days', v_bound,
      'state', v_state, 'stale', v_state = 'stale', 'missing', v_state IN ('missing', 'inconsistent'), 'reason', v_reason,
      'critical', v_crit, 'critical_below', v_crit_below, 'critical_failure', v_crit_fail,
      'trend', CASE WHEN v_norm IS NOT NULL AND v_prior_n IS NOT NULL THEN jsonb_build_object('prior_normalised', v_prior_n, 'delta', round(v_norm - v_prior_n, 4)) END,
      'lineage', jsonb_build_object('input_kind', c ->> 'input_kind', 'input_id', lower(c ->> 'input_id'), 'input_version', i -> 'input_version',
                                    'objective_ids', coalesce(i -> 'objective_ids', '[]'::jsonb), 'exposure', i -> 'exposure', 'basis', i -> 'basis', 'evidence', coalesce(i -> 'evidence', '[]'::jsonb)));
  END LOOP;
  -- 2. THE DIMENSIONS
  FOR d IN SELECT value FROM jsonb_array_elements(p_model -> 'dimensions') LOOP
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', x ->> 'key', 'w', x -> 'weight', 'n', x -> 'normalised') ORDER BY n), '[]'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object('key', x ->> 'key', 'w', x -> 'weight', 'n', CASE WHEN x ->> 'state' = 'included' THEN x -> 'normalised' ELSE '0'::jsonb END) ORDER BY n), '[]'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object('key', x ->> 'key', 'w', x -> 'weight', 'n', CASE WHEN x ->> 'state' = 'included' THEN x -> 'normalised' ELSE '100'::jsonb END) ORDER BY n), '[]'::jsonb),
           coalesce(jsonb_agg(x ->> 'key') FILTER (WHERE (x ->> 'critical_failure')::boolean), '[]'::jsonb),
           coalesce(jsonb_agg(x ->> 'key') FILTER (WHERE (x ->> 'low_confidence')::boolean), '[]'::jsonb),
           coalesce(jsonb_agg(CASE WHEN x ->> 'state' <> 'included' THEN format('%s %s: %s', x ->> 'key', x ->> 'state', x ->> 'reason')
                                   WHEN (x ->> 'critical_failure')::boolean THEN format('%s critical: its score %s is below its floor %s', x ->> 'key', x ->> 'normalised', x ->> 'critical_below')
                                   WHEN (x ->> 'low_confidence')::boolean THEN format('%s low confidence: %s below %s', x ->> 'key', x ->> 'confidence', v_min_conf) END ORDER BY n)
                    FILTER (WHERE x ->> 'state' <> 'included' OR (x ->> 'critical_failure')::boolean OR (x ->> 'low_confidence')::boolean), '[]'::jsonb)
      INTO v_parts, v_zero, v_full, v_fails, v_lows, v_reasons
      FROM jsonb_array_elements(v_comps) WITH ORDINALITY q(x, n) WHERE x ->> 'dimension' = d ->> 'key';
    v_w := executive.health_weighted(v_parts, v_min_cov);
    v_cov := (v_w ->> 'coverage')::numeric; v_dv := (v_w ->> 'value')::numeric;
    v_sens := executive.health_sensitivity(v_parts, v_min_cov);
    v_status := CASE WHEN v_dv IS NULL THEN 'indeterminate' WHEN v_cov < 1 OR jsonb_array_length(v_fails) > 0 OR jsonb_array_length(v_lows) > 0 THEN 'partial' ELSE 'complete' END;
    IF v_dv IS NULL THEN
      v_band := NULL; v_basis := format('indeterminate: coverage %s is below the floor %s — no value is shown', v_cov, v_min_cov);
      v_reasons := v_reasons || to_jsonb(format('coverage %s below the floor %s', v_cov, v_min_cov));
    ELSIF jsonb_array_length(v_fails) > 0 THEN
      v_band := (SELECT b ->> 'key' FROM jsonb_array_elements(d -> 'bands') WITH ORDINALITY y(b, m) ORDER BY m DESC LIMIT 1);
      v_basis := format('the lowest band: critical component(s) %s failing — a critical failure is never averaged away', (SELECT string_agg(e #>> '{}', ', ') FROM jsonb_array_elements(v_fails) e));
    ELSE
      v_band := executive.health_band(d -> 'bands', v_dv);
      v_basis := format('the value %s reaches the floor %s of band %s', v_dv, (SELECT b ->> 'min' FROM jsonb_array_elements(d -> 'bands') b WHERE b ->> 'key' = v_band LIMIT 1), v_band);
    END IF;
    v_prior_v := (SELECT CASE WHEN jsonb_typeof(x -> 'value') = 'number' THEN (x ->> 'value')::numeric END FROM jsonb_array_elements(coalesce(p_prior -> 'dimensions', '[]'::jsonb)) x WHERE x ->> 'key' = d ->> 'key' LIMIT 1);
    -- each component's contribution (its share of the dimension's value; the contributions sum to the value) and its sensitivity
    FOR k IN 0 .. jsonb_array_length(v_parts) - 1 LOOP
      v_extra := v_extra || jsonb_build_object(v_parts -> k ->> 'key', jsonb_build_object(
        'contribution', CASE WHEN v_dv IS NOT NULL AND jsonb_typeof(v_parts -> k -> 'n') = 'number' THEN round((v_parts -> k ->> 'w')::numeric * (v_parts -> k ->> 'n')::numeric / v_cov, 4) END,
        'sensitivity', v_sens -> k));
    END LOOP;
    v_dims := v_dims || jsonb_build_object(
      'key', d ->> 'key', 'label', d ->> 'label', 'weight', (d ->> 'weight')::numeric, 'objective_ids', d -> 'objective_ids', 'bands', d -> 'bands',
      'value', v_dv, 'coverage', v_cov, 'status', v_status, 'band', v_band, 'band_basis', v_basis, 'critical_failures', v_fails, 'low_confidence', v_lows, 'reasons', v_reasons,
      'components', (SELECT jsonb_agg(p ->> 'key') FROM jsonb_array_elements(v_parts) p),
      -- the missing-data analysis: the value were every excluded component at 0, or at 100
      'bounds', jsonb_build_object('if_excluded_at_0', (executive.health_weighted(v_zero, 0) ->> 'value')::numeric, 'if_excluded_at_100', (executive.health_weighted(v_full, 0) ->> 'value')::numeric),
      'trend', CASE WHEN v_dv IS NOT NULL AND v_prior_v IS NOT NULL THEN jsonb_build_object('prior_value', v_prior_v, 'delta', round(v_dv - v_prior_v, 2)) END);
    v_dparts := v_dparts || jsonb_build_object('key', d ->> 'key', 'w', (d ->> 'weight')::numeric, 'n', v_dv, 'cov', v_cov);
    v_any_indet := v_any_indet OR v_dv IS NULL;
    v_all_complete := v_all_complete AND v_status = 'complete';
    v_all_reasons := v_all_reasons || (SELECT coalesce(jsonb_agg(to_jsonb(format('%s — %s', d ->> 'key', r #>> '{}'))), '[]'::jsonb) FROM jsonb_array_elements(v_reasons) r);
  END LOOP;
  SELECT jsonb_agg(x || coalesce(v_extra -> (x ->> 'key'), '{}'::jsonb) ORDER BY n) INTO v_comps FROM jsonb_array_elements(v_comps) WITH ORDINALITY q(x, n);
  -- 3. THE AGGREGATE: the dimension-weighted mean; NULL (indeterminate) when any dimension is — a missing dimension is never averaged over
  v_agg_cov := round((SELECT sum((p ->> 'w')::numeric * (p ->> 'cov')::numeric) FROM jsonb_array_elements(v_dparts) p), 4);
  IF v_any_indet THEN
    v_agg := NULL; v_agg_status := 'indeterminate';
    v_all_reasons := v_all_reasons || to_jsonb('the aggregate is withheld: a dimension is indeterminate'::text);
  ELSE
    v_agg := round((SELECT sum((p ->> 'w')::numeric * (p ->> 'n')::numeric) FROM jsonb_array_elements(v_dparts) p), 2);
    v_agg_status := CASE WHEN v_all_complete THEN 'complete' ELSE 'partial' END;
  END IF;
  v_prior_agg := CASE WHEN jsonb_typeof(p_prior -> 'aggregate') = 'number' THEN (p_prior ->> 'aggregate')::numeric END;
  SELECT jsonb_build_object('components', count(*), 'included', count(*) FILTER (WHERE x ->> 'state' = 'included'), 'stale', count(*) FILTER (WHERE x ->> 'state' = 'stale'),
                            'missing', count(*) FILTER (WHERE x ->> 'state' = 'missing'), 'inconsistent', count(*) FILTER (WHERE x ->> 'state' = 'inconsistent'),
                            'critical_failures', count(*) FILTER (WHERE (x ->> 'critical_failure')::boolean), 'low_confidence', count(*) FILTER (WHERE (x ->> 'low_confidence')::boolean),
                            'no_confidence_input', count(*) FILTER (WHERE jsonb_typeof(x -> 'confidence') IS DISTINCT FROM 'number'))
    INTO v_counts FROM jsonb_array_elements(v_comps) x;
  RETURN jsonb_build_object(
    'formula_version', executive.health_formula_version(), 'at', p_at, 'status', v_agg_status, 'aggregate', v_agg, 'coverage', v_agg_cov,
    'rule', 'a dimension is the weight-renormalised mean of its included components (0–100), indeterminate below min_coverage; a critical failure forces partial and the lowest band; the aggregate is the dimension-weighted mean, withheld when any dimension is indeterminate; stale, missing and inconsistent inputs are excluded and declared, never imputed',
    'min_coverage', v_min_cov, 'min_confidence', v_min_conf, 'counts', v_counts, 'reasons', v_all_reasons,
    'aggregate_trend', CASE WHEN v_agg IS NOT NULL AND v_prior_agg IS NOT NULL THEN jsonb_build_object('prior_value', v_prior_agg, 'delta', round(v_agg - v_prior_agg, 2)) END,
    'aggregate_sensitivity', CASE WHEN v_agg IS NOT NULL THEN executive.health_sensitivity((SELECT jsonb_agg(jsonb_build_object('key', p ->> 'key', 'w', p -> 'w', 'n', p -> 'n')) FROM jsonb_array_elements(v_dparts) p), 0) END,
    'dimensions', v_dims, 'components', v_comps,
    'peer', jsonb_build_object('peer', NULL, 'reason', 'no peer input in this product'));
END $$;
GRANT EXECUTE ON FUNCTION executive.health_compose(jsonb, jsonb, timestamptz, jsonb) TO eye_app, eye_commit;

-- ============================================================
-- §H3 THE SNAPSHOTS AND THEIR COMPONENTS (append-only)
-- ============================================================
CREATE TABLE executive.health_score_snapshots (
  snapshot_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  definition_id      uuid NOT NULL REFERENCES executive.health_score_definitions (definition_id),
  definition_version int  NOT NULL,
  formula_version    text NOT NULL,
  model_digest       text NOT NULL,
  at                 timestamptz NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  kind               text NOT NULL CHECK (kind IN ('current', 'as_of')),
  prior_snapshot_id  uuid REFERENCES executive.health_score_snapshots (snapshot_id),
  replay_of          uuid REFERENCES executive.health_score_snapshots (snapshot_id),
  reproduced         boolean,
  status             text NOT NULL CHECK (status IN ('complete', 'partial', 'indeterminate')),
  aggregate          numeric CHECK (aggregate IS NULL OR aggregate BETWEEN 0 AND 100),
  coverage           numeric NOT NULL CHECK (coverage BETWEEN 0 AND 1),
  result             jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  inputs             jsonb NOT NULL CHECK (jsonb_typeof(inputs) = 'array'),
  inputs_digest      text NOT NULL CHECK (inputs_digest ~ '^[0-9a-f]{64}$'),
  result_digest      text NOT NULL CHECK (result_digest ~ '^[0-9a-f]{64}$'),
  computed_by        uuid NOT NULL,
  correlation_id     uuid NOT NULL,
  CONSTRAINT xhss_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  -- NO OPAQUE NUMBER: an indeterminate score has no aggregate, and a determinate one always has
  CONSTRAINT xhss_aggregate CHECK ((status = 'indeterminate') = (aggregate IS NULL)),
  CONSTRAINT xhss_replay CHECK ((replay_of IS NULL) = (reproduced IS NULL) AND (replay_of IS NULL OR kind = 'as_of')),
  CONSTRAINT xhss_at CHECK (at <= computed_at)
);
CREATE INDEX xhss_definition ON executive.health_score_snapshots (definition_id, kind, at);
CREATE INDEX xhss_domain ON executive.health_score_snapshots (tenant_id, domain_id, computed_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.health_score_snapshots FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.health_score_snapshots IS 'B32 (0089 §H3; F-P6-08, PR-43-002/005): a Strategic Health Score computed at an instant under a named definition version and formula version from the contract rows it read (recorded with their digest): complete | partial | indeterminate, the aggregate NULL when indeterminate, the coverage, the decomposition; current (after every earlier one) or as_of (a temporal replay — reproduced or not); append-only.';

CREATE TABLE executive.health_score_components (
  snapshot_id      uuid NOT NULL REFERENCES executive.health_score_snapshots (snapshot_id),
  component_key    text NOT NULL,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  dimension_key    text NOT NULL,
  label            text NOT NULL,
  input_kind       text NOT NULL,
  input_id         uuid NOT NULL,
  input_version    bigint,
  value            numeric,
  unit             text,
  direction        text NOT NULL CHECK (direction IN ('higher_better', 'lower_better')),
  normalised       numeric CHECK (normalised IS NULL OR normalised BETWEEN 0 AND 100),
  weight           numeric NOT NULL CHECK (weight > 0 AND weight <= 1),
  contribution     numeric,
  evidence         jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  confidence       numeric,
  low_confidence   boolean NOT NULL,
  trend            numeric,
  observed_at      timestamptz,
  freshness_days   numeric,
  stale_after_days numeric NOT NULL,
  state            text NOT NULL CHECK (state IN ('included', 'stale', 'missing', 'inconsistent')),
  stale            boolean NOT NULL,
  missing          boolean NOT NULL,
  reason           text,
  critical         boolean NOT NULL,
  critical_failure boolean NOT NULL,
  sensitivity      jsonb,
  decision_links   jsonb NOT NULL CHECK (jsonb_typeof(decision_links) = 'array'),
  lineage          jsonb NOT NULL CHECK (jsonb_typeof(lineage) = 'object'),
  PRIMARY KEY (snapshot_id, component_key),
  CONSTRAINT xhsk_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  -- MISSING DATA NEVER HIDDEN: only an included component has a score; every other carries its reason
  CONSTRAINT xhsk_state CHECK ((state = 'included') = (normalised IS NOT NULL) AND (state = 'included' OR reason IS NOT NULL)
                               AND stale = (state = 'stale') AND missing = (state IN ('missing', 'inconsistent')))
);
CREATE INDEX xhsk_input ON executive.health_score_components (input_kind, input_id);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.health_score_components FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.health_score_components IS 'B32 (0089 §H3; V02-T-221, C-034): one component of a snapshot — its input and its version, value, score, weight, contribution, evidence, confidence, trend, freshness, stale/missing with the reason, criticality, sensitivity (±10 % weight, the bounds at 0 and 100), the decisions it informs and its lineage; append-only.';

-- ============================================================
-- §H4 THE CHANGES AND THEIR LOG
-- ============================================================
CREATE TABLE executive.health_score_changes (
  change_id              uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  snapshot_id            uuid NOT NULL REFERENCES executive.health_score_snapshots (snapshot_id),
  prior_snapshot_id      uuid NOT NULL REFERENCES executive.health_score_snapshots (snapshot_id),
  definition_id          uuid NOT NULL REFERENCES executive.health_score_definitions (definition_id),
  definition_version     int  NOT NULL,
  /* the approver of the definition the scores were computed under — never the decider of a challenge to them */
  definition_approved_by uuid NOT NULL,
  subject                text NOT NULL CHECK (subject = 'aggregate' OR subject ~ '^dimension:[a-z][a-z0-9_]{1,62}$'),
  subject_label          text NOT NULL,
  from_value             numeric,
  to_value               numeric,
  delta                  numeric,
  from_band              text,
  to_band                text,
  triggers               text[] NOT NULL CHECK (cardinality(triggers) >= 1 AND triggers <@ ARRAY['band_crossing', 'move', 'determinacy']),
  direction              text NOT NULL CHECK (direction IN ('favourable', 'unfavourable', 'determinacy')),
  gaming_flags           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(gaming_flags) = 'array'),
  state                  text NOT NULL DEFAULT 'raised' CHECK (state IN ('raised', 'acknowledged', 'challenged', 'upheld', 'dismissed', 'withdrawn')),
  raised_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_by        uuid,
  acknowledged_at        timestamptz,
  acknowledgement_note   text,
  challenge_kind         text CHECK (challenge_kind IS NULL OR challenge_kind IN ('input', 'weight', 'threshold', 'formula', 'interpretation')),
  challenge_statement    text,
  challenged_by          uuid,
  challenged_at          timestamptz,
  decided_by             uuid,
  decided_at             timestamptz,
  decision_note          text,
  withdrawn_at           timestamptz,
  withdrawal_reason      text,
  correlation_id         uuid NOT NULL,
  CONSTRAINT xhsc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xhsc_ack CHECK ((acknowledged_by IS NULL) = (acknowledged_at IS NULL) AND (state <> 'acknowledged' OR acknowledged_by IS NOT NULL)),
  CONSTRAINT xhsc_challenge CHECK ((state IN ('challenged', 'upheld', 'dismissed', 'withdrawn')) = (challenged_by IS NOT NULL AND challenged_at IS NOT NULL AND challenge_kind IS NOT NULL AND length(btrim(coalesce(challenge_statement, ''))) >= 8)),
  CONSTRAINT xhsc_decided CHECK ((state IN ('upheld', 'dismissed')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL AND length(btrim(coalesce(decision_note, ''))) >= 8)),
  CONSTRAINT xhsc_withdrawn CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL AND length(btrim(coalesce(withdrawal_reason, ''))) >= 8)),
  -- SEPARATION OF DUTIES, in the record itself: neither the challenger nor the definition's approver decides a challenge
  CONSTRAINT xhsc_separation CHECK (decided_by IS NULL OR (decided_by <> challenged_by AND decided_by <> definition_approved_by)),
  CONSTRAINT xhsc_one_per_subject UNIQUE (snapshot_id, subject)
);
CREATE INDEX xhsc_domain ON executive.health_score_changes (tenant_id, domain_id, raised_at);
COMMENT ON TABLE executive.health_score_changes IS 'B32 (0089 §H4; UX-43-003, V01-T-025): a score change a current snapshot raised against the prior current snapshot of the same definition (a band crossing, a move beyond change_points, a (de)termination) — acknowledged (a receipt), challenged and decided (upheld | dismissed) by a person who is neither the challenger nor the definition''s approver, or withdrawn; its anti-gaming flags shown and gating nothing. A score change triggers review, never action.';
-- A change moves forward only, each act's own fields once: raised → acknowledged; raised | acknowledged → challenged; challenged → upheld | dismissed | withdrawn.
CREATE OR REPLACE FUNCTION executive.health_change_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_fields text[];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'health score changes are never deleted' USING ERRCODE = '55000'; END IF;
  v_fields := CASE
    WHEN OLD.state = 'raised' AND NEW.state = 'acknowledged' THEN ARRAY['state', 'acknowledged_by', 'acknowledged_at', 'acknowledgement_note']
    WHEN OLD.state IN ('raised', 'acknowledged') AND NEW.state = 'challenged' THEN ARRAY['state', 'challenge_kind', 'challenge_statement', 'challenged_by', 'challenged_at']
    WHEN OLD.state = 'challenged' AND NEW.state IN ('upheld', 'dismissed') THEN ARRAY['state', 'decided_by', 'decided_at', 'decision_note']
    WHEN OLD.state = 'challenged' AND NEW.state = 'withdrawn' THEN ARRAY['state', 'withdrawn_at', 'withdrawal_reason']
  END;
  IF v_fields IS NOT NULL AND (to_jsonb(NEW) - v_fields) = (to_jsonb(OLD) - v_fields) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'health score change % is %; a change moves forward once per act and is never rewritten', OLD.change_id, OLD.state USING ERRCODE = '55000';
END $$;
CREATE TRIGGER xhsc_transition BEFORE UPDATE OR DELETE ON executive.health_score_changes FOR EACH ROW EXECUTE FUNCTION executive.health_change_transition();

CREATE TABLE executive.health_score_change_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  change_id          uuid NOT NULL REFERENCES executive.health_score_changes (change_id),
  event              text NOT NULL CHECK (event IN ('change.raised', 'change.acknowledged', 'change.challenged', 'change.upheld', 'change.dismissed', 'change.withdrawn')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xhse_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xhse_change ON executive.health_score_change_events (change_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON executive.health_score_change_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['health_score_definitions', 'health_score_snapshots', 'health_score_components', 'health_score_changes', 'health_score_change_events'] LOOP
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
END $$;

-- ============================================================
-- §H5 THE DEFINITION PORTS — propose (one named human), approve | refuse (ANOTHER)
-- ============================================================
CREATE OR REPLACE FUNCTION executive.health_definition_answer(x executive.health_score_definitions) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('definition_id', x.definition_id, 'version', x.version, 'state', x.state, 'model', x.model, 'model_digest', x.model_digest, 'formula_version', x.formula_version,
                            'changed_sections', to_jsonb(x.changed_sections), 'reason', x.reason, 'basis_version', x.basis_version, 'gaming_review_required', x.gaming_review_required,
                            'gaming_reasons', x.gaming_reasons, 'proposed_by', x.proposed_by, 'proposed_at', x.proposed_at, 'approved_by', x.approved_by, 'approved_at', x.approved_at,
                            'approval_note', x.approval_note, 'gaming_review_note', x.gaming_review_note, 'supersedes', x.supersedes, 'refused_by', x.refused_by, 'refused_at', x.refused_at,
                            'refusal_reason', x.refusal_reason, 'superseded_at', x.superseded_at);
$$;
REVOKE ALL ON FUNCTION executive.health_definition_answer(executive.health_score_definitions) FROM PUBLIC;

-- Every objective a dimension names is an ACTIVE objective (OBJ) of this domain (23503 naming it).
CREATE OR REPLACE FUNCTION executive.health_assert_objectives(p_tenant uuid, p_domain uuid, p_model jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = executive, graph, pg_catalog, pg_temp AS $$
DECLARE o text;
BEGIN
  FOR o IN SELECT DISTINCT lower(e #>> '{}') FROM jsonb_array_elements(p_model -> 'dimensions') d, jsonb_array_elements(d -> 'objective_ids') e LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = o::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.status = 'active') THEN
      RAISE EXCEPTION 'health definition rejected: no such objective % in this domain (a dimension names active OBJ objects)', o USING ERRCODE = '23503';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION executive.health_assert_objectives(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_assert_objectives(uuid, uuid, jsonb) TO eye_commit;

-- What a proposal changes against the version it would supersede (the sections), and whether it needs an anti-gaming review (the reasons).
CREATE OR REPLACE FUNCTION executive.health_model_diff(p_old jsonb, p_new jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_sections text[] := '{}'; v_reasons jsonb := '[]'::jsonb; g jsonb := executive.health_gaming_policy(); o jsonb; n jsonb; b jsonb; ob jsonb; k text;
BEGIN
  IF p_old IS NULL THEN RETURN jsonb_build_object('sections', to_jsonb(ARRAY['dimensions', 'components', 'weights', 'thresholds']), 'gaming_reasons', '[]'::jsonb); END IF;
  IF (SELECT jsonb_agg(jsonb_build_object('key', x -> 'key', 'label', x -> 'label', 'objective_ids', x -> 'objective_ids') ORDER BY x ->> 'key') FROM jsonb_array_elements(p_old -> 'dimensions') x)
     IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('key', x -> 'key', 'label', x -> 'label', 'objective_ids', x -> 'objective_ids') ORDER BY x ->> 'key') FROM jsonb_array_elements(p_new -> 'dimensions') x) THEN
    v_sections := v_sections || 'dimensions'::text; END IF;
  IF (SELECT jsonb_agg(jsonb_build_object('key', x -> 'key', 'label', x -> 'label', 'dimension', x -> 'dimension', 'input_kind', x -> 'input_kind', 'input_id', lower(x ->> 'input_id')) ORDER BY x ->> 'key') FROM jsonb_array_elements(p_old -> 'components') x)
     IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('key', x -> 'key', 'label', x -> 'label', 'dimension', x -> 'dimension', 'input_kind', x -> 'input_kind', 'input_id', lower(x ->> 'input_id')) ORDER BY x ->> 'key') FROM jsonb_array_elements(p_new -> 'components') x) THEN
    v_sections := v_sections || 'components'::text; END IF;
  IF (SELECT jsonb_agg(jsonb_build_array(x -> 'key', x -> 'weight') ORDER BY x ->> 'key') FROM jsonb_array_elements((p_old -> 'dimensions') || (p_old -> 'components')) x)
     IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_array(x -> 'key', x -> 'weight') ORDER BY x ->> 'key') FROM jsonb_array_elements((p_new -> 'dimensions') || (p_new -> 'components')) x) THEN
    v_sections := v_sections || 'weights'::text; END IF;
  IF (SELECT jsonb_agg(jsonb_build_array(x -> 'key', x -> 'bands', x -> 'critical', x -> 'critical_below') ORDER BY x ->> 'key') FROM jsonb_array_elements((p_old -> 'dimensions') || (p_old -> 'components')) x)
     IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_array(x -> 'key', x -> 'bands', x -> 'critical', x -> 'critical_below') ORDER BY x ->> 'key') FROM jsonb_array_elements((p_new -> 'dimensions') || (p_new -> 'components')) x)
     OR (p_old -> 'min_coverage') IS DISTINCT FROM (p_new -> 'min_coverage') OR (p_old -> 'min_confidence') IS DISTINCT FROM (p_new -> 'min_confidence') OR (p_old -> 'change_points') IS DISTINCT FROM (p_new -> 'change_points') THEN
    v_sections := v_sections || 'thresholds'::text; END IF;
  IF (SELECT jsonb_agg(jsonb_build_array(x -> 'key', x -> 'direction', x -> 'normalisation') ORDER BY x ->> 'key') FROM jsonb_array_elements(p_old -> 'components') x)
     IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_array(x -> 'key', x -> 'direction', x -> 'normalisation') ORDER BY x ->> 'key') FROM jsonb_array_elements(p_new -> 'components') x) THEN
    v_sections := v_sections || 'normalisation'::text; END IF;
  IF (SELECT jsonb_agg(jsonb_build_array(x -> 'key', x -> 'stale_after_days') ORDER BY x ->> 'key') FROM jsonb_array_elements(p_old -> 'components') x)
     IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_array(x -> 'key', x -> 'stale_after_days') ORDER BY x ->> 'key') FROM jsonb_array_elements(p_new -> 'components') x) THEN
    v_sections := v_sections || 'freshness'::text; END IF;
  -- ANTI-GAMING: the moves beyond the policy's deltas, named
  FOR n IN SELECT value FROM jsonb_array_elements((p_new -> 'dimensions') || (p_new -> 'components')) LOOP
    SELECT x INTO o FROM jsonb_array_elements((p_old -> 'dimensions') || (p_old -> 'components')) x WHERE x ->> 'key' = n ->> 'key' AND (x ? 'bands') = (n ? 'bands') LIMIT 1;
    IF o IS NULL THEN CONTINUE; END IF;
    IF abs((n ->> 'weight')::numeric - (o ->> 'weight')::numeric) > (g ->> 'max_weight_move')::numeric THEN
      v_reasons := v_reasons || jsonb_build_object('rule', 'weight_move', 'key', n ->> 'key', 'from', (o ->> 'weight')::numeric, 'to', (n ->> 'weight')::numeric, 'limit', g -> 'max_weight_move');
    END IF;
    IF coalesce((o ->> 'critical')::boolean, false) AND NOT coalesce((n ->> 'critical')::boolean, false) THEN
      v_reasons := v_reasons || jsonb_build_object('rule', 'critical_removed', 'key', n ->> 'key');
    END IF;
    IF jsonb_typeof(o -> 'critical_below') = 'number' AND coalesce((n ->> 'critical')::boolean, false)
       AND (o ->> 'critical_below')::numeric - coalesce((n ->> 'critical_below')::numeric, 0) > (g ->> 'max_threshold_move')::numeric THEN
      v_reasons := v_reasons || jsonb_build_object('rule', 'threshold_move', 'key', n ->> 'key', 'threshold', 'critical_below', 'from', (o ->> 'critical_below')::numeric, 'to', (n ->> 'critical_below')::numeric, 'limit', g -> 'max_threshold_move');
    END IF;
    IF n ? 'bands' THEN
      FOR b IN SELECT value FROM jsonb_array_elements(n -> 'bands') LOOP
        SELECT y INTO ob FROM jsonb_array_elements(o -> 'bands') y WHERE y ->> 'key' = b ->> 'key' LIMIT 1;
        IF ob IS NOT NULL AND abs((b ->> 'min')::numeric - (ob ->> 'min')::numeric) > (g ->> 'max_threshold_move')::numeric THEN
          v_reasons := v_reasons || jsonb_build_object('rule', 'threshold_move', 'key', n ->> 'key', 'threshold', b ->> 'key', 'from', (ob ->> 'min')::numeric, 'to', (b ->> 'min')::numeric, 'limit', g -> 'max_threshold_move');
        END IF;
        ob := NULL;
      END LOOP;
    END IF;
    o := NULL;
  END LOOP;
  IF (p_new ->> 'min_coverage')::numeric < (p_old ->> 'min_coverage')::numeric THEN
    v_reasons := v_reasons || jsonb_build_object('rule', 'coverage_floor_lowered', 'from', (p_old ->> 'min_coverage')::numeric, 'to', (p_new ->> 'min_coverage')::numeric);
  END IF;
  RETURN jsonb_build_object('sections', to_jsonb(v_sections), 'gaming_reasons', v_reasons);
END $$;
GRANT EXECUTE ON FUNCTION executive.health_model_diff(jsonb, jsonb) TO eye_app, eye_commit;

-- PROPOSE: a new VERSION, validated whole, awaiting a SECOND person (one pending proposal per domain).
CREATE OR REPLACE FUNCTION executive.propose_health_definition(p_definition uuid, p_tenant uuid, p_domain uuid, p_model jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.health_score_definitions%ROWTYPE; q executive.health_score_definitions%ROWTYPE; v_digest text; v_version int; v_diff jsonb; v_row executive.health_score_definitions%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.definition.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health definition rejected: proposed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'strategy_owner', 'platform_admin']) THEN
    RAISE EXCEPTION 'health definition rejected: a definition is proposed by a named human holding executive, domain_admin, strategy_owner or platform_admin (PR-43-003)' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'health definition rejected: a reason of at least 8 characters says why the definition changes' USING ERRCODE = '22023'; END IF;
  PERFORM executive.validate_health_model(p_model);
  PERFORM executive.health_assert_objectives(p_tenant, p_domain, p_model);
  PERFORM pg_advisory_xact_lock(hashtextextended('executive.health_score_definitions:' || p_tenant::text || ':' || p_domain::text, 0));
  SELECT * INTO q FROM executive.health_score_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'proposed';
  IF FOUND THEN
    RAISE EXCEPTION 'health definition rejected (pending): proposal % (version %) awaits a decision; it is approved or refused first', q.definition_id, q.version USING ERRCODE = '23505';
  END IF;
  SELECT * INTO a FROM executive.health_score_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active';
  v_digest := encode(sha256(convert_to(p_model::text, 'UTF8')), 'hex');
  IF a.definition_id IS NOT NULL AND a.model_digest = v_digest THEN
    RAISE EXCEPTION 'health definition rejected (unchanged): the model is unchanged from the active version %; a version records a change', a.version USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_version FROM executive.health_score_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain;
  v_diff := executive.health_model_diff(a.model, p_model);
  INSERT INTO executive.health_score_definitions (definition_id, scope, tenant_id, domain_id, version, state, model, model_digest, formula_version, changed_sections, reason, basis_version,
                                                  gaming_review_required, gaming_reasons, proposed_by, correlation_id)
  VALUES (p_definition, 'DOMAIN', p_tenant, p_domain, v_version, 'proposed', p_model, v_digest, executive.health_formula_version(),
          ARRAY(SELECT jsonb_array_elements_text(v_diff -> 'sections')), btrim(p_reason), a.version,
          jsonb_array_length(v_diff -> 'gaming_reasons') > 0, v_diff -> 'gaming_reasons', p_actor, p_correlation)
  RETURNING * INTO v_row;
  RETURN executive.health_definition_answer(v_row) || jsonb_build_object('awaits', 'a second person holding executive, domain_admin or platform_admin approves or refuses it');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.propose_health_definition(uuid,uuid,uuid,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.propose_health_definition(uuid,uuid,uuid,jsonb,text,uuid,uuid) TO eye_commit;

-- APPROVE: ANOTHER person activates the proposal — never the proposer; the anti-gaming review recorded where the proposal is flagged;
-- the version it was proposed against must still be the active one.
CREATE OR REPLACE FUNCTION executive.approve_health_definition(p_definition uuid, p_tenant uuid, p_domain uuid, p_note text, p_gaming_review text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE q executive.health_score_definitions%ROWTYPE; a executive.health_score_definitions%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.definition.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health definition rejected: decided by the acting principal' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('executive.health_score_definitions:' || p_tenant::text || ':' || p_domain::text, 0));
  SELECT * INTO q FROM executive.health_score_definitions x WHERE x.definition_id = p_definition AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'health definition rejected: no such definition in this domain' USING ERRCODE = '23503'; END IF;
  IF q.state <> 'proposed' THEN RAISE EXCEPTION 'health definition rejected (not_proposed): definition % (version %) is %; only a proposal is approved or refused', p_definition, q.version, q.state USING ERRCODE = '22023'; END IF;
  IF q.proposed_by = p_actor THEN
    RAISE EXCEPTION 'health definition rejected (separation): the proposer does not approve their own definition; a second person holding executive, domain_admin or platform_admin approves it' USING ERRCODE = '42501';
  END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'health definition rejected: a definition is approved by a named human holding executive, domain_admin or platform_admin (PR-43-003)' USING ERRCODE = '42501';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'health definition rejected: an approval carries a note of at least 8 characters' USING ERRCODE = '22023'; END IF;
  IF q.gaming_review_required AND coalesce(length(btrim(p_gaming_review)), 0) < 8 THEN
    RAISE EXCEPTION 'health definition rejected (gaming_review): version % moves % beyond the anti-gaming policy; the approver records the anti-gaming review (at least 8 characters)',
      q.version, (SELECT string_agg(coalesce(r ->> 'key', '') || ' ' || (r ->> 'rule'), ', ') FROM jsonb_array_elements(q.gaming_reasons) r) USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM executive.health_score_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active' FOR UPDATE;
  IF a.version IS DISTINCT FROM q.basis_version THEN
    RAISE EXCEPTION 'health definition rejected (stale_basis): version % was proposed against version %, and version % is active now; it is proposed again', q.version, coalesce(q.basis_version::text, 'none'), coalesce(a.version::text, 'none') USING ERRCODE = '22023';
  END IF;
  PERFORM executive.health_assert_objectives(p_tenant, p_domain, q.model);
  IF a.definition_id IS NOT NULL THEN UPDATE executive.health_score_definitions SET state = 'superseded', superseded_at = v_at WHERE definition_id = a.definition_id; END IF;
  UPDATE executive.health_score_definitions SET state = 'active', approved_by = p_actor, approved_at = v_at, approval_note = btrim(p_note),
         gaming_review_note = CASE WHEN q.gaming_review_required THEN btrim(p_gaming_review) END, supersedes = a.version
   WHERE definition_id = p_definition RETURNING * INTO q;
  RETURN executive.health_definition_answer(q) || jsonb_build_object('superseded_definition_id', a.definition_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.approve_health_definition(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.approve_health_definition(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- REFUSE: ANOTHER person refuses the proposal, saying why (the version number stays taken; the active version is untouched).
CREATE OR REPLACE FUNCTION executive.refuse_health_definition(p_definition uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE q executive.health_score_definitions%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.definition.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health definition rejected: decided by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO q FROM executive.health_score_definitions x WHERE x.definition_id = p_definition AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'health definition rejected: no such definition in this domain' USING ERRCODE = '23503'; END IF;
  IF q.state <> 'proposed' THEN RAISE EXCEPTION 'health definition rejected (not_proposed): definition % (version %) is %; only a proposal is approved or refused', p_definition, q.version, q.state USING ERRCODE = '22023'; END IF;
  IF q.proposed_by = p_actor THEN
    RAISE EXCEPTION 'health definition rejected (separation): the proposer does not refuse their own definition; a second person decides it' USING ERRCODE = '42501';
  END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'health definition rejected: a definition is approved by a named human holding executive, domain_admin or platform_admin (PR-43-003)' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'health definition rejected: a refusal carries a reason of at least 8 characters' USING ERRCODE = '22023'; END IF;
  UPDATE executive.health_score_definitions SET state = 'refused', refused_by = p_actor, refused_at = clock_timestamp(), refusal_reason = btrim(p_reason) WHERE definition_id = p_definition RETURNING * INTO q;
  RETURN executive.health_definition_answer(q);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.refuse_health_definition(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.refuse_health_definition(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §H6 THE COMPUTATION — reads ONLY executive.health_measure_inputs; records the snapshot, its components and the changes
-- ============================================================
CREATE OR REPLACE FUNCTION executive.health_change_answer(c executive.health_score_changes) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('change_id', c.change_id, 'snapshot_id', c.snapshot_id, 'prior_snapshot_id', c.prior_snapshot_id, 'definition_id', c.definition_id, 'definition_version', c.definition_version,
                            'definition_approved_by', c.definition_approved_by, 'subject', c.subject, 'subject_label', c.subject_label, 'from_value', c.from_value, 'to_value', c.to_value,
                            'delta', c.delta, 'from_band', c.from_band, 'to_band', c.to_band, 'triggers', to_jsonb(c.triggers), 'direction', c.direction, 'gaming_flags', c.gaming_flags,
                            'state', c.state, 'raised_at', c.raised_at, 'acknowledged_by', c.acknowledged_by, 'acknowledged_at', c.acknowledged_at, 'acknowledgement_note', c.acknowledgement_note,
                            'challenge_kind', c.challenge_kind, 'challenge_statement', c.challenge_statement, 'challenged_by', c.challenged_by, 'challenged_at', c.challenged_at,
                            'decided_by', c.decided_by, 'decided_at', c.decided_at, 'decision_note', c.decision_note, 'withdrawn_at', c.withdrawn_at, 'withdrawal_reason', c.withdrawal_reason,
                            'authorizes_action', false);
$$;
REVOKE ALL ON FUNCTION executive.health_change_answer(executive.health_score_changes) FROM PUBLIC;

-- The decisions a set of objectives informs: the active DEC objects resting on them (graph.dependencies — the lineage read, not an input).
CREATE OR REPLACE FUNCTION executive.health_decision_links(p_tenant uuid, p_domain uuid, p_objectives jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = executive, graph, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('decision_id', s.strategy_object_id, 'title', s.title, 'via_objective', dep.depends_on_id)), '[]'::jsonb)
    FROM graph.dependencies dep JOIN graph.strategy_current s ON s.strategy_object_id = dep.dependent_object_id
   WHERE dep.tenant_id = p_tenant AND dep.domain_id = p_domain AND dep.state = 'active' AND dep.depends_on_kind = 'strategy' AND dep.dependent_type = 'DEC'
     AND s.status = 'active' AND dep.depends_on_id IN (SELECT (e #>> '{}')::uuid FROM jsonb_array_elements(coalesce(p_objectives, '[]'::jsonb)) e);
$$;
REVOKE ALL ON FUNCTION executive.health_decision_links(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_decision_links(uuid, uuid, jsonb) TO eye_commit;

CREATE OR REPLACE FUNCTION executive.compute_health_score(p_snapshot uuid, p_tenant uuid, p_domain uuid, p_at timestamptz, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.health_score_definitions%ROWTYPE; pr executive.health_score_snapshots%ROWTYPE; same executive.health_score_snapshots%ROWTYPE;
        v_now timestamptz := clock_timestamp(); v_at timestamptz; v_inputs jsonb; v_inputs_digest text; v_result jsonb; v_result_digest text; v_latest timestamptz; v_kind text;
        v_dim jsonb; v_comp jsonb; v_links jsonb; v_dims jsonb := '[]'::jsonb; v_comps jsonb := '[]'::jsonb; v_changes jsonb := '[]'::jsonb;
        v_subjects jsonb; s jsonb; v_from numeric; v_to numeric; v_fb text; v_tb text; v_triggers text[]; v_flags jsonb; v_change uuid; v_label text; v_bands jsonb; g jsonb := executive.health_gaming_policy();
        v_ch executive.health_score_changes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.compute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health score rejected: computed by the acting principal' USING ERRCODE = '42501'; END IF;
  v_at := coalesce(p_at, v_now);
  IF v_at > v_now THEN RAISE EXCEPTION 'health score rejected: the instant % is after now; a score is computed at or before now', v_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.health_score_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'health score rejected (no_definition): no approved definition is active in this domain; one person proposes a definition and another approves it' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('executive.health_score_snapshots:' || d.definition_id::text, 0));
  -- THE ONLY INPUT: the contract rows the model names, at the instant (nothing else is read as a measure)
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.input_kind, i.input_id, i.observed_at), '[]'::jsonb) INTO v_inputs
    FROM executive.health_measure_inputs(p_tenant, p_domain, v_at) i
   WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(d.model -> 'components') mc WHERE mc ->> 'input_kind' = i.input_kind AND lower(mc ->> 'input_id') = i.input_id::text);
  v_inputs_digest := encode(sha256(convert_to(v_inputs::text, 'UTF8')), 'hex');
  SELECT max(x.at) INTO v_latest FROM executive.health_score_snapshots x WHERE x.definition_id = d.definition_id AND x.kind = 'current';
  v_kind := CASE WHEN v_latest IS NULL OR v_at > v_latest THEN 'current' ELSE 'as_of' END;
  SELECT * INTO pr FROM executive.health_score_snapshots x WHERE x.definition_id = d.definition_id AND x.kind = 'current' AND x.at < v_at ORDER BY x.at DESC LIMIT 1;
  v_result := executive.health_compose(d.model, v_inputs, v_at, pr.result);
  v_result_digest := encode(sha256(convert_to(v_result::text, 'UTF8')), 'hex');
  -- the decisions each dimension and component informs (the lineage read; outside the result digest — the graph moves on its own)
  FOR v_dim IN SELECT value FROM jsonb_array_elements(v_result -> 'dimensions') LOOP
    v_dims := v_dims || (v_dim || jsonb_build_object('decision_links', executive.health_decision_links(p_tenant, p_domain, v_dim -> 'objective_ids')));
  END LOOP;
  FOR v_comp IN SELECT value FROM jsonb_array_elements(v_result -> 'components') LOOP
    v_links := executive.health_decision_links(p_tenant, p_domain,
                 (SELECT x -> 'objective_ids' FROM jsonb_array_elements(v_result -> 'dimensions') x WHERE x ->> 'key' = v_comp ->> 'dimension') || coalesce(v_comp #> '{lineage,objective_ids}', '[]'::jsonb));
    v_comps := v_comps || (v_comp || jsonb_build_object('decision_links', v_links));
  END LOOP;
  v_result := v_result || jsonb_build_object('dimensions', v_dims, 'components', v_comps);
  IF v_kind = 'as_of' THEN
    SELECT * INTO same FROM executive.health_score_snapshots x WHERE x.definition_id = d.definition_id AND x.at = v_at ORDER BY x.computed_at LIMIT 1;
  END IF;
  INSERT INTO executive.health_score_snapshots (snapshot_id, scope, tenant_id, domain_id, definition_id, definition_version, formula_version, model_digest, at, computed_at, kind,
                                                prior_snapshot_id, replay_of, reproduced, status, aggregate, coverage, result, inputs, inputs_digest, result_digest, computed_by, correlation_id)
  VALUES (p_snapshot, 'DOMAIN', p_tenant, p_domain, d.definition_id, d.version, d.formula_version, d.model_digest, v_at, v_now, v_kind,
          pr.snapshot_id, same.snapshot_id, CASE WHEN same.snapshot_id IS NULL THEN NULL ELSE same.inputs_digest = v_inputs_digest AND same.result_digest = v_result_digest END,
          v_result ->> 'status', (v_result ->> 'aggregate')::numeric, (v_result ->> 'coverage')::numeric, v_result, v_inputs, v_inputs_digest, v_result_digest, p_actor, p_correlation);
  INSERT INTO executive.health_score_components (snapshot_id, component_key, scope, tenant_id, domain_id, dimension_key, label, input_kind, input_id, input_version, value, unit, direction,
                                                 normalised, weight, contribution, evidence, confidence, low_confidence, trend, observed_at, freshness_days, stale_after_days, state, stale, missing,
                                                 reason, critical, critical_failure, sensitivity, decision_links, lineage)
  SELECT p_snapshot, x ->> 'key', 'DOMAIN', p_tenant, p_domain, x ->> 'dimension', x ->> 'label', x ->> 'input_kind', (x ->> 'input_id')::uuid, (x ->> 'input_version')::bigint,
         (x ->> 'value')::numeric, x ->> 'unit', x ->> 'direction', (x ->> 'normalised')::numeric, (x ->> 'weight')::numeric, (x ->> 'contribution')::numeric, x -> 'evidence',
         (x ->> 'confidence')::numeric, (x ->> 'low_confidence')::boolean, (x #>> '{trend,delta}')::numeric, (x ->> 'observed_at')::timestamptz, (x ->> 'freshness_days')::numeric,
         (x ->> 'stale_after_days')::numeric, x ->> 'state', (x ->> 'stale')::boolean, (x ->> 'missing')::boolean, x ->> 'reason', (x ->> 'critical')::boolean, (x ->> 'critical_failure')::boolean,
         x -> 'sensitivity', x -> 'decision_links', x -> 'lineage'
    FROM jsonb_array_elements(v_comps) x;
  -- THE CHANGES: a CURRENT snapshot against the prior current snapshot of the same definition (an as_of replay raises nothing)
  IF v_kind = 'current' AND pr.snapshot_id IS NOT NULL THEN
    v_subjects := jsonb_build_array(jsonb_build_object('subject', 'aggregate', 'label', 'the aggregate', 'from', pr.result -> 'aggregate', 'to', v_result -> 'aggregate', 'from_band', NULL, 'to_band', NULL, 'bands', '[]'::jsonb))
      || coalesce((SELECT jsonb_agg(jsonb_build_object('subject', 'dimension:' || (n ->> 'key'), 'key', n ->> 'key', 'label', n ->> 'label', 'from', o -> 'value', 'to', n -> 'value',
                                                        'from_band', o -> 'band', 'to_band', n -> 'band', 'bands', n -> 'bands') ORDER BY m)
                     FROM jsonb_array_elements(v_result -> 'dimensions') WITH ORDINALITY y(n, m)
                     JOIN jsonb_array_elements(pr.result -> 'dimensions') o ON o ->> 'key' = n ->> 'key'), '[]'::jsonb);
    FOR s IN SELECT value FROM jsonb_array_elements(v_subjects) LOOP
      v_from := CASE WHEN jsonb_typeof(s -> 'from') = 'number' THEN (s ->> 'from')::numeric END;
      v_to := CASE WHEN jsonb_typeof(s -> 'to') = 'number' THEN (s ->> 'to')::numeric END;
      v_fb := CASE WHEN jsonb_typeof(s -> 'from_band') = 'string' THEN s ->> 'from_band' END;
      v_tb := CASE WHEN jsonb_typeof(s -> 'to_band') = 'string' THEN s ->> 'to_band' END;
      v_triggers := '{}';
      IF (v_from IS NULL) <> (v_to IS NULL) THEN v_triggers := v_triggers || 'determinacy'::text; END IF;
      IF v_fb IS NOT NULL AND v_tb IS NOT NULL AND v_fb <> v_tb THEN v_triggers := v_triggers || 'band_crossing'::text; END IF;
      IF v_from IS NOT NULL AND v_to IS NOT NULL AND abs(v_to - v_from) > (d.model ->> 'change_points')::numeric THEN v_triggers := v_triggers || 'move'::text; END IF;
      IF cardinality(v_triggers) = 0 THEN CONTINUE; END IF;
      -- ANTI-GAMING (shown, gating nothing): an input RESTATED before a favourable change; a value SITTING ON a band's floor
      v_flags := '[]'::jsonb;
      IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to > v_from THEN
        v_flags := v_flags || coalesce((SELECT jsonb_agg(jsonb_build_object('flag', 'restated_input', 'component', n ->> 'key', 'input_kind', n ->> 'input_kind', 'input_id', n ->> 'input_id',
                                                                          'observed_at', n -> 'observed_at', 'from_value', o -> 'value', 'to_value', n -> 'value',
                                                                          'detail', 'the same observation instant carries another value than at the prior snapshot — the input was restated inside the window before a favourable change'))
                                         FROM jsonb_array_elements(v_result -> 'components') n JOIN jsonb_array_elements(pr.result -> 'components') o ON o ->> 'key' = n ->> 'key'
                                        WHERE (s ->> 'subject' = 'aggregate' OR n ->> 'dimension' = s ->> 'key')
                                          AND n ->> 'observed_at' IS NOT NULL AND (n ->> 'observed_at')::timestamptz = (o ->> 'observed_at')::timestamptz AND (n -> 'value') IS DISTINCT FROM (o -> 'value')), '[]'::jsonb);
      END IF;
      IF v_to IS NOT NULL THEN
        v_flags := v_flags || coalesce((SELECT jsonb_agg(jsonb_build_object('flag', 'on_threshold', 'band', b ->> 'key', 'floor', (b ->> 'min')::numeric, 'value', v_to,
                                                                          'detail', format('the value %s sits within %s point(s) above the floor %s of band %s', v_to, g ->> 'on_threshold_points', b ->> 'min', b ->> 'key')))
                                         FROM jsonb_array_elements(s -> 'bands') b
                                        WHERE (b ->> 'min')::numeric > 0 AND v_to >= (b ->> 'min')::numeric AND v_to - (b ->> 'min')::numeric <= (g ->> 'on_threshold_points')::numeric), '[]'::jsonb);
      END IF;
      v_change := gen_random_uuid();
      INSERT INTO executive.health_score_changes (change_id, scope, tenant_id, domain_id, snapshot_id, prior_snapshot_id, definition_id, definition_version, definition_approved_by, subject, subject_label,
                                                  from_value, to_value, delta, from_band, to_band, triggers, direction, gaming_flags, raised_at, correlation_id)
      VALUES (v_change, 'DOMAIN', p_tenant, p_domain, p_snapshot, pr.snapshot_id, d.definition_id, d.version, d.approved_by, s ->> 'subject', s ->> 'label',
              v_from, v_to, CASE WHEN v_from IS NOT NULL AND v_to IS NOT NULL THEN round(v_to - v_from, 2) END, v_fb, v_tb, v_triggers,
              CASE WHEN v_from IS NULL OR v_to IS NULL THEN 'determinacy' WHEN v_to > v_from THEN 'favourable' ELSE 'unfavourable' END, v_flags, v_now, p_correlation)
      RETURNING * INTO v_ch;
      INSERT INTO executive.health_score_change_events (event_id, scope, tenant_id, domain_id, change_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_change, 'change.raised', p_actor,
              jsonb_build_object('subject', s ->> 'subject', 'from_value', v_from, 'to_value', v_to, 'from_band', v_fb, 'to_band', v_tb, 'triggers', to_jsonb(v_triggers), 'gaming_flags', v_flags,
                                 'snapshot_id', p_snapshot, 'prior_snapshot_id', pr.snapshot_id), p_correlation);
      v_changes := v_changes || executive.health_change_answer(v_ch);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('snapshot_id', p_snapshot, 'definition_id', d.definition_id, 'definition_version', d.version, 'formula_version', d.formula_version, 'model_digest', d.model_digest,
                            'at', v_at, 'computed_at', v_now, 'kind', v_kind, 'prior_snapshot_id', pr.snapshot_id, 'replay_of', same.snapshot_id,
                            'reproduced', CASE WHEN same.snapshot_id IS NULL THEN NULL ELSE same.inputs_digest = v_inputs_digest AND same.result_digest = v_result_digest END,
                            'status', v_result ->> 'status', 'aggregate', v_result -> 'aggregate', 'coverage', v_result -> 'coverage', 'inputs_digest', v_inputs_digest, 'result_digest', v_result_digest,
                            'inputs_read', jsonb_array_length(v_inputs), 'result', v_result, 'changes', v_changes);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.compute_health_score(uuid,uuid,uuid,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.compute_health_score(uuid,uuid,uuid,timestamptz,uuid,uuid) TO eye_commit;

-- ============================================================
-- §H7 THE CHANGE PORTS — acknowledge (a receipt), challenge, withdraw (the challenger), decide (neither the challenger nor the approver)
-- ============================================================
CREATE OR REPLACE FUNCTION executive.health_change_roles() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['platform_admin', 'domain_admin', 'executive', 'strategy_owner', 'decision_owner', 'decision_authority', 'risk_owner', 'opportunity_sponsor', 'domain_analyst'] $$;
GRANT EXECUTE ON FUNCTION executive.health_change_roles() TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.acknowledge_health_change(p_change uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.health_score_changes%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.change.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health change rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.health_change_roles()) THEN
    RAISE EXCEPTION 'health change rejected: a score change is acknowledged or challenged by a named human of the domain''s strategy and decision roles' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM executive.health_score_changes x WHERE x.change_id = p_change AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'health change rejected: no such change in this domain' USING ERRCODE = '23503'; END IF;
  IF c.state <> 'raised' THEN RAISE EXCEPTION 'health change rejected (not_raised): change % is %; a change is acknowledged while raised', p_change, c.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.health_score_changes SET state = 'acknowledged', acknowledged_by = p_actor, acknowledged_at = v_at, acknowledgement_note = nullif(btrim(coalesce(p_note, '')), '')
   WHERE change_id = p_change RETURNING * INTO c;
  INSERT INTO executive.health_score_change_events (event_id, scope, tenant_id, domain_id, change_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_change, 'change.acknowledged', p_actor, jsonb_build_object('note', c.acknowledgement_note, 'receipt_not_agreement', true), p_correlation);
  RETURN executive.health_change_answer(c);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.acknowledge_health_change(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.acknowledge_health_change(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION executive.challenge_health_change(p_change uuid, p_tenant uuid, p_domain uuid, p_kind text, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.health_score_changes%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.change.challenge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health change rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.health_change_roles()) THEN
    RAISE EXCEPTION 'health change rejected: a score change is acknowledged or challenged by a named human of the domain''s strategy and decision roles' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('input', 'weight', 'threshold', 'formula', 'interpretation') THEN RAISE EXCEPTION 'health change rejected: a challenge disputes an input, a weight, a threshold, the formula or the interpretation' USING ERRCODE = '22023'; END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) < 8 THEN RAISE EXCEPTION 'health change rejected: a challenge states its case (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM executive.health_score_changes x WHERE x.change_id = p_change AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'health change rejected: no such change in this domain' USING ERRCODE = '23503'; END IF;
  IF c.state NOT IN ('raised', 'acknowledged') THEN RAISE EXCEPTION 'health change rejected (not_open): change % is %; a change carries one challenge', p_change, c.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.health_score_changes SET state = 'challenged', challenge_kind = p_kind, challenge_statement = btrim(p_statement), challenged_by = p_actor, challenged_at = v_at
   WHERE change_id = p_change RETURNING * INTO c;
  INSERT INTO executive.health_score_change_events (event_id, scope, tenant_id, domain_id, change_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_change, 'change.challenged', p_actor, jsonb_build_object('kind', p_kind, 'statement', btrim(p_statement)), p_correlation);
  RETURN executive.health_change_answer(c) || jsonb_build_object('decided_by', 'a holder of executive, domain_admin or platform_admin who is neither the challenger nor the definition''s approver');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.challenge_health_change(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.challenge_health_change(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION executive.withdraw_health_challenge(p_change uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.health_score_changes%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.change.challenge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health change rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'health change rejected: a withdrawal states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM executive.health_score_changes x WHERE x.change_id = p_change AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'health change rejected: no such change in this domain' USING ERRCODE = '23503'; END IF;
  IF c.state <> 'challenged' THEN RAISE EXCEPTION 'health change rejected (not_challenged): change % is %; only a live challenge is withdrawn or decided', p_change, c.state USING ERRCODE = '22023'; END IF;
  IF c.challenged_by <> p_actor THEN RAISE EXCEPTION 'health change rejected: a challenge is withdrawn by its challenger' USING ERRCODE = '42501'; END IF;
  UPDATE executive.health_score_changes SET state = 'withdrawn', withdrawn_at = v_at, withdrawal_reason = btrim(p_reason) WHERE change_id = p_change RETURNING * INTO c;
  INSERT INTO executive.health_score_change_events (event_id, scope, tenant_id, domain_id, change_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_change, 'change.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN executive.health_change_answer(c);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.withdraw_health_challenge(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.withdraw_health_challenge(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- DECIDE: upheld | dismissed by a named human holding executive, domain_admin or platform_admin who is NEITHER the challenger NOR the
-- approver of the definition the scores were computed under. An upheld challenge never rewrites the snapshot (append-only): the remedy
-- is a corrected input or a new definition version, proposed and approved by two people.
CREATE OR REPLACE FUNCTION executive.decide_health_change(p_change uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.health_score_changes%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.change.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health change rejected: decided by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('upheld', 'dismissed') THEN RAISE EXCEPTION 'health change rejected: a decision upholds or dismisses the challenge' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'health change rejected: a decision states its note (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'health change rejected: a challenge is decided by a named human holding executive, domain_admin or platform_admin' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM executive.health_score_changes x WHERE x.change_id = p_change AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'health change rejected: no such change in this domain' USING ERRCODE = '23503'; END IF;
  IF c.state <> 'challenged' THEN RAISE EXCEPTION 'health change rejected (not_challenged): change % is %; only a live challenge is withdrawn or decided', p_change, c.state USING ERRCODE = '22023'; END IF;
  IF c.challenged_by = p_actor THEN RAISE EXCEPTION 'health change rejected (separation): the challenger does not decide their own challenge' USING ERRCODE = '42501'; END IF;
  IF c.definition_approved_by = p_actor THEN
    RAISE EXCEPTION 'health change rejected (separation): the approver of definition version % does not decide a challenge to the scores it produced', c.definition_version USING ERRCODE = '42501';
  END IF;
  UPDATE executive.health_score_changes SET state = p_decision, decided_by = p_actor, decided_at = v_at, decision_note = btrim(p_note) WHERE change_id = p_change RETURNING * INTO c;
  INSERT INTO executive.health_score_change_events (event_id, scope, tenant_id, domain_id, change_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_change, 'change.' || p_decision, p_actor,
          jsonb_build_object('note', btrim(p_note), 'challenged_by', c.challenged_by, 'challenge_kind', c.challenge_kind), p_correlation);
  RETURN executive.health_change_answer(c) || jsonb_build_object('what_follows', CASE p_decision
    WHEN 'upheld' THEN 'the snapshot stands as recorded (append-only); the remedy is a corrected input or a new definition version, proposed by one person and approved by another'
    ELSE 'the change stands as recorded' END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.decide_health_change(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.decide_health_change(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `integrator`
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0089 §I — THE B32 INTEGRATOR (A1). After the prelude (§0) and the three parts (§R exposures, §G graph, §H health).
--
-- THE HEALTH INPUT CONTRACT, COMPLETE: executive.health_measure_inputs(tenant, domain, at) — the prelude declared it with the indicator branch only
-- so that the parts could build in parallel; the graph part supplied graph.health_inputs (the 'measure' rows: approved measures, the latest
-- observation at or before the instant) and the exposures part prediction.health_inputs (the 'risk' / 'opportunity' rows: accepted
-- assessments, the residual exposure). Every branch has exactly the contract's columns (each part's harness pins its own with
-- pg_get_function_result); the contract is their UNION ALL — nothing merged, nothing imputed, nothing deduplicated across kinds (an input's
-- identity is (input_kind, input_id)). The health score (§H) reads this function and nothing else.
CREATE OR REPLACE FUNCTION executive.health_measure_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  SELECT 'indicator'::text, i.indicator_id, NULL::bigint, i.description, ev.value, NULL::text,
         CASE WHEN i.comparator IN ('<', '<=') THEN 'higher_better' ELSE 'lower_better' END,
         ev.observation_at::timestamptz, NULL::numeric, NULL::numeric,
         CASE WHEN ev.evidence_object_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('object_id', ev.evidence_object_id, 'version', ev.evidence_version)) END,
         '{}'::uuid[], NULL::jsonb,
         format('indicator %s on series %s, its latest evaluation at or before the instant (no cadence declared on the indicator; no confidence input)', i.indicator_id, i.series_key)
    FROM prediction.indicators_current i
    LEFT JOIN LATERAL (SELECT e.value, e.observation_at, e.evidence_object_id, e.evidence_version FROM prediction.indicator_evaluations e
                        WHERE e.indicator_id = i.indicator_id AND e.known_at <= p_at ORDER BY e.observation_at DESC, e.known_at DESC LIMIT 1) ev ON true
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'active'
  UNION ALL
  SELECT g.* FROM graph.health_inputs(p_tenant, p_domain, p_at) g
  UNION ALL
  SELECT x.* FROM prediction.health_inputs(p_tenant, p_domain, p_at) x;
$$;
REVOKE ALL ON FUNCTION executive.health_measure_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_measure_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;
