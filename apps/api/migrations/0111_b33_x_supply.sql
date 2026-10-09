-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SC SUPPLY-CHAIN INTELLIGENCE (F-P4-14; F-P5-01's AI-53-003, V01-T-024 (alternatives), AG-026 (the schedule, the race)) — the §SC part of
-- 0111, folded after §0 and §TW (apply order §0, §TW, §SC, §PK, §CI). Applies alone on top of §0 on a fresh database. Tables in schema `twin`,
-- trigger/index/constraint prefix `tsc_`, actions `twin.supply.*` (the `simulation` capability claims `twin.` — licensed on NORDWERK; no new
-- entitlement), refusal nouns `supply inference | supply disruption | supply alternative rejected (<class>)` and the re-declared B29 port's
-- `twin proposal rejected (duplicate)`. Every figure a harness or an act seeds through these ports is SYNTHETIC unless it says otherwise.
--
-- THE PRINCIPLES held here: the Supply Chain Agent INFERS a hidden dependency and PROPOSES it (and may PROPOSE a disruption); a NAMED
-- domain analyst VALIDATES or REJECTS it (a sensitive relationship — a named counterparty, a contract — with a reason, the proposal's digest and
-- an expiry; never the agent, never the person who asked for the scan); the twin's OWNER applies it through the existing open/ground/admit ports
-- (each its own governed write — R4) and this port only RECORDS the application against the admitted version. The supplier, inventory, routing
-- or contractual RESPONSE is a decision of the decision layer: an alternative is EVALUATED here (feasible / infeasible / indeterminate on a
-- scenario branch of the network), never decided. Nothing unvalidated, stale or incomplete is presented as current and complete: an inferred
-- site is never mapped, a stale input makes every option indeterminate, an infeasible option is never recommendable.
--
-- SDP: NOT registered. A validated dependency is carried as supply-network twin ELEMENTS (TWN — the site with provenance `validated` naming
-- its inference, the route, the capacity) and as this part's inference record; objects.schema_registry stays at the prelude's 52.
-- GRAPH: no entity or edge is written here. A counterparty organization / place is created through the graph's own port (graph.entity.create —
-- a resolution manager or the domain administrator) and named on the site (`entity_id`); an EDGE needs a reviewed claim and its evidence
-- (graph.assert_edge) — until one exists the relationship lives on the twin and on the inference record (R8).
-- BOUNDARY: the signed acceptance record, independent assurance and customer attestation of AT-30 / PR-30-006 → R2.
--
--   §SC.1 the kind's element schema (inventory:, obligation:; the optional site/route fields described)
--   §SC.2 the tables: record sources, record reads, inferences, disruptions, disruption maps, alternatives, the supply event ledger
--   §SC.3 the ports: record sources (owner) · draft inferences (agent) · decide (analyst) · apply/revert (owner) · disruptions open / confirm /
--         close / map · alternatives
--   §SC.4 twin.draft_agent_proposals RE-DECLARED (copied whole from LAST 0092:2357): a per-twin advisory lock and the concurrent-draft race
--         answered `twin proposal rejected (duplicate)` (AG-026)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §SC.1 THE KIND'S ELEMENT SCHEMA — a forward UPDATE: two OPTIONAL prefixes and the site/route descriptions naming the optional fields
-- (twin/supply-network/network.ts SUPPLY_NETWORK_SCHEMA_B33 is this object, held equal by test/unit/phase6-supply-b33.test.ts). Every v1
-- element validates unchanged (the validator's rules on the optional fields apply only when a field is present).
UPDATE twin.twin_kind_schemas SET element_schema = '{"tier": {"unit": null, "description": "a declared tier (tier:1 … tier:n); value: its label", "required": true}, "site": {"unit": null, "description": "a site (site:<id>); value { tier (0 = the terminal site), name, bom?, country?, city?, entity_id?, ownership?, contract?, geo?, provenance? }", "required": true}, "material": {"unit": null, "description": "a material (material:<id>); value { name, unit }", "required": true}, "route": {"unit": null, "description": "a route (route:<id>); value { from: <site>, to: <site>, material, mode?, via?, lead_days?, confidence? }", "required": true}, "capacity": {"unit": "units/day", "unit_pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,19}/day$", "description": "a site''s capacity for a material per day (capacity:<site>.<material>), in the material''s unit per day", "required": true}, "inventory": {"unit": "units", "unit_pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,19}$", "description": "the quantity on hand at a site (inventory:<site>.<material>), in the material''s unit", "required": false}, "obligation": {"unit": null, "description": "an obligation (obligation:<id>); value { kind: contract | delivery | service_level, counterparty, material?, quantity_per_day?, until? }", "required": false}}'::jsonb
 WHERE kind = 'supply-network';

-- §SC.2 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/* The RECORD SOURCES the agent's inference reads for one network: declared by the twin's OWNER (a source contract of the domain), retired by
   the owner. The scan reads only these sources' evidence — bounded, governed, never "every record of the domain". */
CREATE TABLE twin.supply_record_sources (
  record_source_id uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  twin_id          uuid NOT NULL REFERENCES twin.twins_current(twin_id),
  source_key       text NOT NULL CHECK (source_key ~ '^[a-z0-9][a-z0-9._-]{1,120}$'),
  note             text CHECK (note IS NULL OR length(note) <= 1000),
  state            text NOT NULL CHECK (state IN ('live', 'retired')),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by       uuid,
  retired_at       timestamptz,
  retire_reason    text,
  correlation_id   uuid NOT NULL,
  CONSTRAINT tsc_rs_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tsc_rs_retired CHECK ((state = 'live') = (retired_at IS NULL) AND (state = 'live' OR (retired_by IS NOT NULL AND length(btrim(coalesce(retire_reason, ''))) >= 8)))
);
CREATE UNIQUE INDEX tsc_rs_one_live ON twin.supply_record_sources (twin_id, source_key) WHERE state = 'live';

/* What the agent READ: one row per evidence version per network — the parsed supply records and the evidence's canonical digest (source
   reconciliation: the inference's evidence is re-read by digest, and a later scan reads only what is new). Append-only. */
CREATE TABLE twin.supply_record_reads (
  read_id          uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  twin_id          uuid NOT NULL,
  source_key       text NOT NULL,
  evidence_id      uuid NOT NULL,
  evidence_version int  NOT NULL CHECK (evidence_version >= 1),
  evidence_digest  text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  recognised       boolean NOT NULL,
  records          jsonb NOT NULL CHECK (jsonb_typeof(records) = 'array'),
  rejected         int NOT NULL DEFAULT 0 CHECK (rejected >= 0),
  agent_id         uuid NOT NULL,
  run_id           uuid NOT NULL,
  read_by          uuid NOT NULL,
  read_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT tsc_rr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX tsc_rr_once ON twin.supply_record_reads (twin_id, evidence_id, evidence_version);
CREATE TRIGGER tsc_rr_append_only BEFORE UPDATE OR DELETE ON twin.supply_record_reads FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A HIDDEN-DEPENDENCY INFERENCE: proposed by the agent → validated | rejected | superseded | withdrawn; a validated one → applied (the owner's
   admitted version carries it) | rejected | superseded | withdrawn; an applied one → revoked (a named analyst's later rejection) → reverted (the
   owner's new version without it). One open (proposed or validated) per (network, vendor, input). */
CREATE TABLE twin.supply_inferences (
  inference_id          uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  twin_id               uuid NOT NULL,
  twin_version          int  NOT NULL CHECK (twin_version >= 1),
  version_citation      jsonb NOT NULL CHECK (twin.citations_ok(jsonb_build_array(version_citation)) AND version_citation ->> 'kind' = 'twin'),
  behind_site           text NOT NULL CHECK (behind_site ~ '^[A-Za-z0-9_-]{1,60}$'),
  behind_tier           int  NOT NULL CHECK (behind_tier >= 1),
  material              text NOT NULL CHECK (material ~ '^[A-Za-z0-9_-]{1,60}$'),
  proposed_site         text NOT NULL CHECK (proposed_site ~ '^[A-Za-z0-9_-]{1,60}$'),
  proposed_value        jsonb NOT NULL CHECK (jsonb_typeof(proposed_value) = 'object'),
  proposed_route        jsonb NOT NULL CHECK (jsonb_typeof(proposed_route) = 'object'),
  observed_flow_per_day numeric CHECK (observed_flow_per_day IS NULL OR observed_flow_per_day >= 0),
  flow_unit             text,
  confidence            numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  sensitive             boolean NOT NULL,
  sensitivity           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sensitivity) = 'array'),
  basis                 jsonb NOT NULL CHECK (jsonb_typeof(basis) = 'object'),
  evidence              jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1 AND twin.citations_ok(evidence)),
  evidence_digest       text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  proposal_digest       text NOT NULL CHECK (proposal_digest ~ '^[0-9a-f]{64}$'),
  isolated              boolean NOT NULL DEFAULT false,
  conflict              jsonb,
  rationale             text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 2000),
  state                 text NOT NULL CHECK (state IN ('proposed', 'validated', 'rejected', 'superseded', 'withdrawn', 'applied', 'revoked', 'reverted')),
  agent_id              uuid NOT NULL,
  run_id                uuid NOT NULL,
  drafted_by            uuid NOT NULL,
  drafted_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  validated_by          uuid,
  validated_at          timestamptz,
  validation_reason     text,
  validation_digest     text,
  valid_until           timestamptz,
  rejected_by           uuid,
  rejected_at           timestamptz,
  rejection_reason      text,
  applied_by            uuid,
  applied_at            timestamptz,
  applied_version       int,
  reverted_by           uuid,
  reverted_at           timestamptz,
  reverted_version      int,
  superseded_by         uuid,
  withdrawn_reason      text,
  item_id               uuid,
  correlation_id        uuid NOT NULL,
  CONSTRAINT tsc_inf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tsc_inf_isolated CHECK (isolated = (conflict IS NOT NULL)),
  CONSTRAINT tsc_inf_validated CHECK (state NOT IN ('validated', 'applied', 'revoked', 'reverted') OR (validated_by IS NOT NULL AND validated_at IS NOT NULL AND valid_until IS NOT NULL
                                                                                                    AND validation_digest = proposal_digest)),
  CONSTRAINT tsc_inf_sensitive CHECK (NOT sensitive OR validated_by IS NULL OR length(btrim(coalesce(validation_reason, ''))) >= 8),
  CONSTRAINT tsc_inf_rejected CHECK (state NOT IN ('rejected', 'revoked', 'reverted') OR (rejected_by IS NOT NULL AND length(btrim(coalesce(rejection_reason, ''))) >= 8)),
  CONSTRAINT tsc_inf_applied CHECK (state NOT IN ('applied', 'revoked', 'reverted') OR (applied_by IS NOT NULL AND applied_version IS NOT NULL)),
  CONSTRAINT tsc_inf_reverted CHECK (state <> 'reverted' OR (reverted_by IS NOT NULL AND reverted_version IS NOT NULL)),
  CONSTRAINT tsc_inf_superseded CHECK (state <> 'superseded' OR superseded_by IS NOT NULL),
  CONSTRAINT tsc_inf_withdrawn CHECK (state <> 'withdrawn' OR length(btrim(coalesce(withdrawn_reason, ''))) >= 8)
);
CREATE UNIQUE INDEX tsc_inf_one_open ON twin.supply_inferences (twin_id, behind_site, material) WHERE state IN ('proposed', 'validated');
CREATE INDEX tsc_inf_twin ON twin.supply_inferences (twin_id, state, drafted_at);

/* A DISRUPTION: opened by a person from a signal (a warning, an indicator, an admitted twin change, or the person's own report), or PROPOSED by
   the agent and confirmed by a person; mapped (one or more maps); closed (resolved) or withdrawn. Its alternatives and maps stay for review. */
CREATE TABLE twin.supply_disruptions (
  disruption_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  signal            jsonb NOT NULL CHECK (jsonb_typeof(signal) = 'object' AND signal ->> 'kind' IN ('warning', 'indicator', 'twin_change', 'person')),
  chokepoints       text[] NOT NULL,
  places            jsonb NOT NULL CHECK (jsonb_typeof(places) = 'array'),
  footprint         text NOT NULL,
  derating          numeric NOT NULL CHECK (derating > 0 AND derating <= 1),
  duration_days     numeric CHECK (duration_days IS NULL OR (duration_days > 0 AND duration_days <= 730)),
  telemetry_twin_id uuid,
  state             text NOT NULL CHECK (state IN ('proposed', 'open', 'mapped', 'closed', 'withdrawn')),
  opened_by         uuid NOT NULL,
  opened_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  proposed_by_agent uuid,
  proposed_run      uuid,
  confirmed_by      uuid,
  confirmed_at      timestamptz,
  map_count         int NOT NULL DEFAULT 0 CHECK (map_count >= 0),
  last_map_id       uuid,
  closed_by         uuid,
  closed_at         timestamptz,
  close_reason      text,
  item_id           uuid,
  correlation_id    uuid NOT NULL,
  CONSTRAINT tsc_dis_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tsc_dis_where CHECK (cardinality(chokepoints) + jsonb_array_length(places) >= 1),
  CONSTRAINT tsc_dis_proposed CHECK ((proposed_by_agent IS NULL) = (proposed_run IS NULL)),
  CONSTRAINT tsc_dis_closed CHECK (state NOT IN ('closed', 'withdrawn') OR (closed_by IS NOT NULL AND closed_at IS NOT NULL AND length(btrim(coalesce(close_reason, ''))) >= 8)),
  CONSTRAINT tsc_dis_mapped CHECK (state <> 'mapped' OR (map_count >= 1 AND last_map_id IS NOT NULL))
);
/* one live disruption per footprint (the same chokepoints and places) in a domain */
CREATE UNIQUE INDEX tsc_dis_one_live ON twin.supply_disruptions (tenant_id, domain_id, footprint) WHERE state IN ('proposed', 'open', 'mapped');

/* THE MAPS of a disruption, append-only and REPLAYABLE: the twin versions read (kind `twin` citations with their TWN digests) and the result. */
CREATE TABLE twin.supply_disruption_maps (
  map_id          uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  disruption_id   uuid NOT NULL REFERENCES twin.supply_disruptions(disruption_id),
  map_no          int NOT NULL CHECK (map_no >= 1),
  pinned          jsonb NOT NULL CHECK (jsonb_typeof(pinned) = 'array' AND jsonb_array_length(pinned) >= 1 AND twin.citations_ok(pinned)),
  result          jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  result_digest   text NOT NULL CHECK (result_digest ~ '^[0-9a-f]{64}$'),
  affected        boolean NOT NULL,
  stale           boolean NOT NULL,
  agent_id        uuid,
  run_id          uuid,
  mapped_by       uuid NOT NULL,
  mapped_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT tsc_map_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tsc_map_twins CHECK (NOT jsonb_path_exists(pinned, '$[*] ? (@.kind != "twin")'))
);
CREATE UNIQUE INDEX tsc_map_no ON twin.supply_disruption_maps (disruption_id, map_no);
CREATE TRIGGER tsc_map_append_only BEFORE UPDATE OR DELETE ON twin.supply_disruption_maps FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* AN ALTERNATIVE of a disruption, evaluated on a SCENARIO BRANCH `alt-<key>` of a mapped network (the branch preserved for review): its verdict
   (feasible | infeasible | indeterminate), the reasons, the coverage limits; recommendable only when feasible. A re-evaluation of the same key
   supersedes the prior row. */
CREATE TABLE twin.supply_alternatives (
  alternative_id    uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  disruption_id     uuid NOT NULL REFERENCES twin.supply_disruptions(disruption_id),
  map_id            uuid NOT NULL REFERENCES twin.supply_disruption_maps(map_id),
  alt_key           text NOT NULL CHECK (alt_key ~ '^[a-z0-9][a-z0-9-]{1,36}$'),
  kind              text NOT NULL CHECK (kind IN ('sourcing', 'inventory', 'routing')),
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  params            jsonb NOT NULL CHECK (jsonb_typeof(params) = 'object'),
  twin_id           uuid NOT NULL,
  branch_id         text NOT NULL,
  branch_version    int  NOT NULL CHECK (branch_version >= 1),
  branch_citation   jsonb NOT NULL CHECK (twin.citations_ok(jsonb_build_array(branch_citation)) AND branch_citation ->> 'kind' = 'twin'),
  evaluation        jsonb NOT NULL CHECK (jsonb_typeof(evaluation) = 'object'),
  evaluation_digest text NOT NULL CHECK (evaluation_digest ~ '^[0-9a-f]{64}$'),
  verdict           text NOT NULL CHECK (verdict IN ('feasible', 'infeasible', 'indeterminate')),
  recommendable     boolean NOT NULL,
  reasons           jsonb NOT NULL CHECK (jsonb_typeof(reasons) = 'array'),
  coverage_limits   jsonb NOT NULL CHECK (jsonb_typeof(coverage_limits) = 'array'),
  constraint_check  jsonb,
  cost              jsonb,
  state             text NOT NULL CHECK (state IN ('evaluated', 'superseded')),
  evaluated_by      uuid NOT NULL,
  evaluated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_by     uuid,
  correlation_id    uuid NOT NULL,
  CONSTRAINT tsc_alt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tsc_alt_branch CHECK (branch_id = 'alt-' || alt_key),
  CONSTRAINT tsc_alt_recommendable CHECK (recommendable = (verdict = 'feasible')),
  CONSTRAINT tsc_alt_reasons CHECK (verdict = 'feasible' OR jsonb_array_length(reasons) >= 1),
  CONSTRAINT tsc_alt_superseded CHECK ((state = 'superseded') = (superseded_by IS NOT NULL))
);
CREATE UNIQUE INDEX tsc_alt_one_live ON twin.supply_alternatives (disruption_id, alt_key) WHERE state = 'evaluated';

/* THE LEDGER of every act above (append-only) — §SC's own lifecycle, never an event on a pinned ledger (twin_events, run_events). */
CREATE TABLE twin.supply_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  subject_kind       text NOT NULL CHECK (subject_kind IN ('record_source', 'inference', 'disruption', 'alternative')),
  subject_id         uuid NOT NULL,
  event              text NOT NULL CHECK (event ~ '^[a-z_]+\.[a-z_]+$'),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT tsc_ev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX tsc_ev_subject ON twin.supply_events (subject_id, occurred_at);
CREATE TRIGGER tsc_ev_append_only BEFORE UPDATE OR DELETE ON twin.supply_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* An inference moves FORWARD only (the lifecycle above); its identity and its proposal never change; never deleted. */
CREATE OR REPLACE FUNCTION twin.tsc_inference_forward() RETURNS trigger
SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE ok boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'supply inference rejected (state): an inference is never deleted' USING ERRCODE = '2F002'; END IF;
  ok := (OLD.state, NEW.state) IN (('proposed', 'validated'), ('proposed', 'rejected'), ('proposed', 'superseded'), ('proposed', 'withdrawn'),
                                   ('validated', 'applied'), ('validated', 'rejected'), ('validated', 'superseded'), ('validated', 'withdrawn'), ('validated', 'validated'),
                                   ('applied', 'revoked'), ('revoked', 'reverted'));
  IF NOT ok THEN RAISE EXCEPTION 'supply inference rejected (state): inference % moves % → %, which its lifecycle does not allow', OLD.inference_id, OLD.state, NEW.state USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'validated_by', 'validated_at', 'validation_reason', 'validation_digest', 'valid_until', 'rejected_by', 'rejected_at', 'rejection_reason',
                            'applied_by', 'applied_at', 'applied_version', 'reverted_by', 'reverted_at', 'reverted_version', 'superseded_by', 'withdrawn_reason', 'item_id'])
     <> (to_jsonb(OLD) - ARRAY['state', 'validated_by', 'validated_at', 'validation_reason', 'validation_digest', 'valid_until', 'rejected_by', 'rejected_at', 'rejection_reason',
                               'applied_by', 'applied_at', 'applied_version', 'reverted_by', 'reverted_at', 'reverted_version', 'superseded_by', 'withdrawn_reason', 'item_id']) THEN
    RAISE EXCEPTION 'supply inference rejected (state): the proposal of inference % is never rewritten', OLD.inference_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tsc_inf_forward BEFORE UPDATE OR DELETE ON twin.supply_inferences FOR EACH ROW EXECUTE FUNCTION twin.tsc_inference_forward();

/* A disruption's identity and footprint never change; its state moves forward (proposed → open → mapped → closed | withdrawn); never deleted. */
CREATE OR REPLACE FUNCTION twin.tsc_disruption_forward() RETURNS trigger
SET search_path = twin, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'supply disruption rejected (state): a disruption is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.state IN ('closed', 'withdrawn') OR NOT ((OLD.state, NEW.state) IN (('proposed', 'open'), ('proposed', 'withdrawn'), ('open', 'mapped'), ('open', 'closed'), ('open', 'withdrawn'),
                                                                        ('mapped', 'mapped'), ('mapped', 'closed'), ('mapped', 'withdrawn'))) THEN
    RAISE EXCEPTION 'supply disruption rejected (state): disruption % moves % → %, which its lifecycle does not allow', OLD.disruption_id, OLD.state, NEW.state USING ERRCODE = '2F002';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'confirmed_by', 'confirmed_at', 'map_count', 'last_map_id', 'closed_by', 'closed_at', 'close_reason', 'item_id'])
     <> (to_jsonb(OLD) - ARRAY['state', 'confirmed_by', 'confirmed_at', 'map_count', 'last_map_id', 'closed_by', 'closed_at', 'close_reason', 'item_id']) THEN
    RAISE EXCEPTION 'supply disruption rejected (state): the declaration of disruption % is never rewritten', OLD.disruption_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tsc_dis_forward BEFORE UPDATE OR DELETE ON twin.supply_disruptions FOR EACH ROW EXECUTE FUNCTION twin.tsc_disruption_forward();

/* An alternative is evaluated once and only ever superseded; a record source is retired once. */
CREATE OR REPLACE FUNCTION twin.tsc_once_forward() RETURNS trigger
SET search_path = twin, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME USING ERRCODE = '2F002'; END IF;
  IF TG_TABLE_NAME = 'supply_alternatives' THEN
    IF OLD.state <> 'evaluated' OR NEW.state <> 'superseded' OR (to_jsonb(NEW) - 'state' - 'superseded_by') <> (to_jsonb(OLD) - 'state' - 'superseded_by') THEN
      RAISE EXCEPTION 'supply alternative rejected (state): an evaluation is never rewritten; a re-evaluation supersedes it' USING ERRCODE = '2F002';
    END IF;
  ELSE
    IF OLD.state <> 'live' OR NEW.state <> 'retired' OR (to_jsonb(NEW) - 'state' - 'retired_by' - 'retired_at' - 'retire_reason') <> (to_jsonb(OLD) - 'state' - 'retired_by' - 'retired_at' - 'retire_reason') THEN
      RAISE EXCEPTION 'supply inference rejected (state): a record source is declared once and retired once' USING ERRCODE = '2F002';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tsc_alt_forward BEFORE UPDATE OR DELETE ON twin.supply_alternatives FOR EACH ROW EXECUTE FUNCTION twin.tsc_once_forward();
CREATE TRIGGER tsc_rs_forward BEFORE UPDATE OR DELETE ON twin.supply_record_sources FOR EACH ROW EXECUTE FUNCTION twin.tsc_once_forward();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supply_record_sources', 'supply_record_reads', 'supply_inferences', 'supply_disruptions', 'supply_disruption_maps', 'supply_alternatives', 'supply_events'] LOOP
    EXECUTE format('ALTER TABLE twin.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE twin.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY twin_isolation ON twin.%I USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);  -- the 0032:634-639 idiom
    EXECUTE format('GRANT SELECT ON twin.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §SC.3 THE PORTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/* internal helpers (not granted): the ledger, the agent check, the human check */
CREATE OR REPLACE FUNCTION twin.tsc_event(p_tenant uuid, p_domain uuid, p_kind text, p_subject uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO twin.supply_events (event_id, scope, tenant_id, domain_id, subject_kind, subject_id, event, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', p_tenant, p_domain, p_kind, p_subject, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION twin.tsc_is_agent(p_principal uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_principal AND p.kind = 'agent')
$$;
/* The domain's active Supply Chain Agent acting under its own session inside its own running supply scan — else `<noun> rejected (authority)`. */
CREATE OR REPLACE FUNCTION twin.tsc_assert_agent_run(p_noun text, p_tenant uuid, p_domain uuid, p_agent uuid, p_run uuid, p_actor uuid) RETURNS void
SET search_path = twin, executive, identity, pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM executive.agents a JOIN identity.principals pr ON pr.id = a.principal_id AND pr.kind = 'agent' AND pr.status = 'active'
                  WHERE a.agent_id = p_agent AND a.principal_id = p_actor AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'supply_chain' AND a.status = 'active') THEN
    RAISE EXCEPTION '% rejected (authority): the domain''s active Supply Chain Agent acts here, under its own session — never a person or another agent', p_noun USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.agent_runs r WHERE r.run_id = p_run AND r.agent_id = p_agent AND r.task = 'supply_scan' AND r.outcome = 'running') THEN
    RAISE EXCEPTION '% rejected (authority): run % is not this agent''s running supply scan', p_noun, p_run USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
/* The admitted TWN version of a twin as a `twin` citation (its canonical digest) — NULL when the version is not admitted or has no TWN. */
CREATE OR REPLACE FUNCTION twin.tsc_twin_citation(p_tenant uuid, p_twin uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, objects, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', 'twin', 'id', p_twin::text, 'version', p_version, 'digest', o.content_digest)
    FROM twin.twin_versions v JOIN objects.canonical_objects o ON o.object_type = 'TWN' AND o.object_id = v.twin_id AND o.object_version = v.version AND o.tenant_id = p_tenant
   WHERE v.twin_id = p_twin AND v.version = p_version AND v.state = 'admitted'
$$;
REVOKE ALL ON FUNCTION twin.tsc_event(uuid,uuid,text,uuid,text,uuid,jsonb,uuid), twin.tsc_is_agent(uuid), twin.tsc_assert_agent_run(text,uuid,uuid,uuid,uuid,uuid),
                       twin.tsc_twin_citation(uuid,uuid,int) FROM PUBLIC;

/* THE RECORD SOURCES (twin.supply.records.declare): the twin's OWN owner names (or retires) a source contract of the domain whose evidence the
   agent's inference reads for this network. */
CREATE OR REPLACE FUNCTION twin.tsc_declare_record_source(
  p_record_source uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_source_key text, p_note text, p_retire boolean, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_family text; r twin.supply_record_sources%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.supply.records.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'supply inference');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'supply inference', 'naming the records a network''s inference reads');
  SELECT k.family INTO v_family FROM twin.twin_kind_schemas k WHERE k.kind = t.kind;
  IF v_family IS DISTINCT FROM 'supply-network' THEN RAISE EXCEPTION 'supply inference rejected (family): twin % is a % twin; records are read for a supply network', p_twin, t.kind USING ERRCODE = '22023'; END IF;
  IF coalesce(p_retire, false) THEN
    SELECT * INTO r FROM twin.supply_record_sources x WHERE x.twin_id = p_twin AND x.source_key = p_source_key AND x.state = 'live' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'supply inference rejected (unknown_source): % is not a live record source of twin %', p_source_key, p_twin USING ERRCODE = '23503'; END IF;
    IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'supply inference rejected (reason): a retirement states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
    UPDATE twin.supply_record_sources SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = btrim(p_reason) WHERE record_source_id = r.record_source_id;
    PERFORM twin.tsc_event(p_tenant, p_domain, 'record_source', r.record_source_id, 'record_source.retired', p_actor, jsonb_build_object('twin_id', p_twin, 'source_key', p_source_key, 'reason', btrim(p_reason)), p_correlation);
    RETURN jsonb_build_object('record_source_id', r.record_source_id, 'twin_id', p_twin, 'source_key', p_source_key, 'state', 'retired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current s WHERE s.source_key = p_source_key AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
    RAISE EXCEPTION 'supply inference rejected (unknown_source): % is not a source contract of this domain', p_source_key USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM twin.supply_record_sources x WHERE x.twin_id = p_twin AND x.source_key = p_source_key AND x.state = 'live') THEN
    RAISE EXCEPTION 'supply inference rejected (duplicate): % is already a live record source of twin %', p_source_key, p_twin USING ERRCODE = '23505';
  END IF;
  INSERT INTO twin.supply_record_sources (record_source_id, scope, tenant_id, domain_id, twin_id, source_key, note, state, declared_by, correlation_id)
  VALUES (p_record_source, 'DOMAIN', p_tenant, p_domain, p_twin, p_source_key, nullif(btrim(coalesce(p_note, '')), ''), 'live', p_actor, p_correlation);
  PERFORM twin.tsc_event(p_tenant, p_domain, 'record_source', p_record_source, 'record_source.declared', p_actor, jsonb_build_object('twin_id', p_twin, 'source_key', p_source_key), p_correlation);
  RETURN jsonb_build_object('record_source_id', p_record_source, 'twin_id', p_twin, 'source_key', p_source_key, 'state', 'live');
END $$ LANGUAGE plpgsql;

/*
 * THE DRAFT (twin.supply.inference.draft): the domain's active Supply Chain Agent, inside its running supply scan, records what it READ (the
 * evidence versions of the network's record sources, each verified against its canonical digest — source reconciliation) and DRAFTS the hidden
 * dependencies its rule infers from every record read so far. Per inference: the same proposal as the open one → UNCHANGED; a changed one
 * SUPERSEDES it (its items closed); else a new proposal, routed as `supply.dependency` under the domain's published policy (to the domain
 * analysts). p_withdraw: open proposals whose basis vanished (the network now declares the input's route), each with its reason. A per-network
 * advisory lock serialises two concurrent scans (AG-026's idiom).
 */
CREATE OR REPLACE FUNCTION twin.tsc_draft_inferences(
  p_tenant uuid, p_domain uuid, p_twin uuid, p_version int, p_reads jsonb, p_inferences jsonb, p_withdraw jsonb, p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, executive, identity, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_family text; v_citation jsonb; rd jsonb; f jsonb; c jsonb; prior twin.supply_inferences%ROWTYPE; v_id uuid; v_core jsonb; v_digest text;
        v_read int := 0; v_drafted jsonb := '[]'::jsonb; v_unchanged jsonb := '[]'::jsonb; v_superseded jsonb := '[]'::jsonb; v_withdrawn jsonb := '[]'::jsonb; v_item jsonb; w jsonb;
        v_behind_name text; v_found boolean; v_prior uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.supply.inference.draft']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'supply inference rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  PERFORM twin.tsc_assert_agent_run('supply inference', p_tenant, p_domain, p_agent, p_run, p_actor);
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'supply inference');
  SELECT k.family INTO v_family FROM twin.twin_kind_schemas k WHERE k.kind = t.kind;
  IF v_family IS DISTINCT FROM 'supply-network' THEN RAISE EXCEPTION 'supply inference rejected (family): twin % is a % twin; the agent infers on supply networks', p_twin, t.kind USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('twin.supply_inferences:' || p_twin::text, 0));
  v_citation := twin.tsc_twin_citation(p_tenant, p_twin, p_version);
  IF v_citation IS NULL OR NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.version = p_version AND v.branch_id = 'actual') THEN
    RAISE EXCEPTION 'supply inference rejected (version): version % of twin % is not an admitted version on actual with a canonical TWN version', p_version, p_twin USING ERRCODE = '22023';
  END IF;
  -- what was read (each evidence version once per network; its digest the canonical one)
  FOR rd IN SELECT * FROM jsonb_array_elements(coalesce(p_reads, '[]'::jsonb)) LOOP
    IF jsonb_typeof(rd) <> 'object' OR jsonb_typeof(rd -> 'records') IS DISTINCT FROM 'array' OR coalesce(rd ->> 'source_key', '') = '' THEN
      RAISE EXCEPTION 'supply inference rejected (read): a read is {source_key, evidence: {id, version, digest}, recognised, records: [...]}' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM twin.supply_record_sources s WHERE s.twin_id = p_twin AND s.source_key = rd ->> 'source_key' AND s.state = 'live') THEN
      RAISE EXCEPTION 'supply inference rejected (read): % is not a live record source of twin %', rd ->> 'source_key', p_twin USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.object_id = (rd #>> '{evidence,id}')::uuid AND o.object_version = (rd #>> '{evidence,version}')::int
                    AND o.content_digest = rd #>> '{evidence,digest}' AND o.tenant_id = p_tenant AND o.domain_id = p_domain) THEN
      RAISE EXCEPTION 'supply inference rejected (evidence): evidence %@% with digest % is not a canonical evidence version of this domain (source reconciliation failed)',
        rd #>> '{evidence,id}', rd #>> '{evidence,version}', left(coalesce(rd #>> '{evidence,digest}', ''), 12) USING ERRCODE = '22023';
    END IF;
    INSERT INTO twin.supply_record_reads (read_id, scope, tenant_id, domain_id, twin_id, source_key, evidence_id, evidence_version, evidence_digest, recognised, records, rejected,
                                          agent_id, run_id, read_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_twin, rd ->> 'source_key', (rd #>> '{evidence,id}')::uuid, (rd #>> '{evidence,version}')::int, rd #>> '{evidence,digest}',
            coalesce((rd ->> 'recognised')::boolean, false), rd -> 'records', coalesce((rd ->> 'rejected')::int, 0), p_agent, p_run, p_actor, p_correlation)
    ON CONFLICT (twin_id, evidence_id, evidence_version) DO NOTHING;
    IF FOUND THEN v_read := v_read + 1; END IF;
  END LOOP;
  -- the inferences
  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(p_inferences, '[]'::jsonb)) LOOP
    IF jsonb_typeof(f) <> 'object' OR coalesce(f ->> 'behind_site', '') !~ '^[A-Za-z0-9_-]{1,60}$' OR coalesce(f ->> 'material', '') !~ '^[A-Za-z0-9_-]{1,60}$'
       OR coalesce(f ->> 'proposed_site', '') !~ '^[A-Za-z0-9_-]{1,60}$' OR jsonb_typeof(f -> 'proposed_value') IS DISTINCT FROM 'object' OR jsonb_typeof(f -> 'proposed_route') IS DISTINCT FROM 'object'
       OR jsonb_typeof(f -> 'confidence') IS DISTINCT FROM 'number' OR (f ->> 'confidence')::numeric NOT BETWEEN 0 AND 1
       OR jsonb_typeof(f -> 'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(f -> 'evidence') = 0 OR NOT twin.citations_ok(f -> 'evidence')
       OR coalesce(length(btrim(f ->> 'rationale')), 0) < 8 OR jsonb_typeof(f -> 'basis') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'supply inference rejected (shape): an inference names the vendor site, the material, the proposed site with its value and route, its confidence (0–1), its evidence (1+), its basis and its rationale' USING ERRCODE = '22023';
    END IF;
    IF f #>> '{proposed_value,provenance,basis}' IS DISTINCT FROM 'inferred' THEN
      RAISE EXCEPTION 'supply inference rejected (shape): an inferred site''s provenance basis is inferred (it becomes validated only when the owner applies a validated inference)' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM twin.state_elements e WHERE e.twin_id = p_twin AND e.version = p_version AND e.key = 'site:' || (f ->> 'behind_site')) THEN
      RAISE EXCEPTION 'supply inference rejected (shape): % is not a site of version % of twin %', f ->> 'behind_site', p_version, p_twin USING ERRCODE = '22023';
    END IF;
    SELECT e.value ->> 'name' INTO v_behind_name FROM twin.state_elements e WHERE e.twin_id = p_twin AND e.version = p_version AND e.key = 'site:' || (f ->> 'behind_site');
    -- every piece of evidence is a canonical evidence version this network's scan READ (the inference rests on nothing else)
    FOR c IN SELECT * FROM jsonb_array_elements(f -> 'evidence') LOOP
      IF c ->> 'kind' <> 'evidence' OR NOT EXISTS (SELECT 1 FROM twin.supply_record_reads r WHERE r.twin_id = p_twin AND r.evidence_id = (c ->> 'id')::uuid
                                                     AND r.evidence_version = (c ->> 'version')::int AND r.evidence_digest = c ->> 'digest') THEN
        RAISE EXCEPTION 'supply inference rejected (evidence): % % is not an evidence version the scan read for twin %', c ->> 'kind', c ->> 'id', p_twin USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_core := jsonb_build_object('twin_id', p_twin, 'behind_site', f ->> 'behind_site', 'material', f ->> 'material', 'proposed_site', f ->> 'proposed_site', 'proposed_value', f -> 'proposed_value',
                                 'proposed_route', f -> 'proposed_route', 'observed_flow_per_day', f -> 'observed_flow_per_day', 'confidence', f -> 'confidence',
                                 'evidence', f -> 'evidence', 'isolated', coalesce((f ->> 'isolated')::boolean, false), 'conflict', f -> 'conflict');
    v_digest := encode(sha256(convert_to(v_core::text, 'UTF8')), 'hex');
    SELECT * INTO prior FROM twin.supply_inferences x WHERE x.twin_id = p_twin AND x.behind_site = f ->> 'behind_site' AND x.material = f ->> 'material' AND x.state IN ('proposed', 'validated') FOR UPDATE;
    v_found := FOUND; v_prior := CASE WHEN v_found THEN prior.inference_id END;
    IF v_found AND prior.proposal_digest = v_digest THEN
      v_unchanged := v_unchanged || jsonb_build_array(jsonb_build_object('inference_id', prior.inference_id, 'state', prior.state, 'behind_site', prior.behind_site, 'material', prior.material));
      CONTINUE;
    END IF;
    v_id := gen_random_uuid();
    IF v_found THEN
      UPDATE twin.supply_inferences SET state = 'superseded', superseded_by = v_id WHERE inference_id = prior.inference_id;
      PERFORM executive.b33_close_items(p_tenant, p_domain, NULL, 'supply_inference', prior.inference_id, 'superseded by a changed inference from the records', p_actor, p_correlation);
      PERFORM twin.tsc_event(p_tenant, p_domain, 'inference', prior.inference_id, 'inference.superseded', p_actor, jsonb_build_object('superseded_by', v_id, 'was', prior.state), p_correlation);
      v_superseded := v_superseded || jsonb_build_array(jsonb_build_object('inference_id', prior.inference_id, 'was', prior.state, 'superseded_by', v_id));
    END IF;
    INSERT INTO twin.supply_inferences (inference_id, scope, tenant_id, domain_id, twin_id, twin_version, version_citation, behind_site, behind_tier, material, proposed_site, proposed_value,
                                        proposed_route, observed_flow_per_day, flow_unit, confidence, sensitive, sensitivity, basis, evidence, evidence_digest, proposal_digest, isolated, conflict,
                                        rationale, state, agent_id, run_id, drafted_by, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_version, v_citation, f ->> 'behind_site', coalesce((f ->> 'behind_tier')::int, 1), f ->> 'material', f ->> 'proposed_site',
            f -> 'proposed_value', f -> 'proposed_route', (f ->> 'observed_flow_per_day')::numeric, f ->> 'flow_unit', (f ->> 'confidence')::numeric, coalesce((f ->> 'sensitive')::boolean, true),
            coalesce(f -> 'sensitivity', '[]'::jsonb), f -> 'basis', f -> 'evidence', coalesce(f ->> 'evidence_digest', v_digest), v_digest, coalesce((f ->> 'isolated')::boolean, false),
            CASE WHEN coalesce((f ->> 'isolated')::boolean, false) THEN coalesce(f -> 'conflict', '{}'::jsonb) END, btrim(f ->> 'rationale'), 'proposed', p_agent, p_run, p_actor, p_correlation);
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'supply.dependency', 'supply_inference', v_id,
                CASE WHEN coalesce((f ->> 'isolated')::boolean, false)
                     THEN format('Hidden supplier behind %s ISOLATED (identity conflict): %s — the network or the records need correcting', coalesce(v_behind_name, f ->> 'behind_site'), f #>> '{proposed_value,name}')
                     ELSE format('Hidden tier-%s supplier inferred behind %s: %s (%s) — awaiting a named analyst''s validation', (f #>> '{proposed_value,tier}'), coalesce(v_behind_name, f ->> 'behind_site'),
                                 f #>> '{proposed_value,name}', f ->> 'material') END,
                jsonb_build_array(jsonb_build_object('rule', 'hidden-tier@1', 'confidence', f -> 'confidence', 'sensitive', coalesce((f ->> 'sensitive')::boolean, true))),
                NULL, v_id, 'supply.inference.drafted',
                jsonb_build_object('twin_id', p_twin, 'behind_site', f ->> 'behind_site', 'material', f ->> 'material', 'proposed_site', f ->> 'proposed_site', 'proposal_digest', v_digest,
                                   'agent_id', p_agent, 'run_id', p_run, 'twin_owner', t.owner_principal_id),
                jsonb_build_object('consequence', 'C2', 'confidence', (f ->> 'confidence')::numeric), p_actor, p_correlation);
    UPDATE twin.supply_inferences SET item_id = (v_item ->> 'item_id')::uuid WHERE inference_id = v_id;
    PERFORM twin.tsc_event(p_tenant, p_domain, 'inference', v_id, 'inference.drafted', p_actor,
              jsonb_build_object('twin_id', p_twin, 'version', v_citation, 'proposal_digest', v_digest, 'agent_id', p_agent, 'run_id', p_run, 'item', v_item,
                                 'supersedes', v_prior), p_correlation);
    v_drafted := v_drafted || jsonb_build_array(jsonb_build_object('inference_id', v_id, 'behind_site', f ->> 'behind_site', 'material', f ->> 'material', 'proposed_site', f ->> 'proposed_site',
                                                                   'proposal_digest', v_digest, 'isolated', coalesce((f ->> 'isolated')::boolean, false), 'item', v_item));
  END LOOP;
  -- withdrawals: an open proposal whose basis vanished
  FOR w IN SELECT * FROM jsonb_array_elements(coalesce(p_withdraw, '[]'::jsonb)) LOOP
    SELECT * INTO prior FROM twin.supply_inferences x WHERE x.inference_id = (w ->> 'inference_id')::uuid AND x.twin_id = p_twin FOR UPDATE;
    IF NOT FOUND OR prior.state NOT IN ('proposed', 'validated') THEN CONTINUE; END IF;
    IF length(btrim(coalesce(w ->> 'reason', ''))) < 8 THEN RAISE EXCEPTION 'supply inference rejected (reason): a withdrawal states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
    UPDATE twin.supply_inferences SET state = 'withdrawn', withdrawn_reason = btrim(w ->> 'reason') WHERE inference_id = prior.inference_id;
    PERFORM executive.b33_close_items(p_tenant, p_domain, NULL, 'supply_inference', prior.inference_id, btrim(w ->> 'reason'), p_actor, p_correlation);
    PERFORM twin.tsc_event(p_tenant, p_domain, 'inference', prior.inference_id, 'inference.withdrawn', p_actor, jsonb_build_object('reason', btrim(w ->> 'reason'), 'was', prior.state), p_correlation);
    v_withdrawn := v_withdrawn || jsonb_build_array(jsonb_build_object('inference_id', prior.inference_id, 'was', prior.state));
  END LOOP;
  RETURN jsonb_build_object('twin_id', p_twin, 'version', p_version, 'citation', v_citation, 'read', v_read, 'drafted', v_drafted, 'unchanged', v_unchanged,
                            'superseded', v_superseded, 'withdrawn', v_withdrawn);
END $$ LANGUAGE plpgsql;

/*
 * THE VALIDATION (twin.supply.inference.validate; human-gated): a NAMED domain analyst — never an agent, never the person who asked for the
 * scan — VALIDATES a proposed inference (quoting its proposal digest; a sensitive relationship needs the reason and an expiry) or REJECTS it (a
 * reason). A validated inference is then the twin's OWNER's to apply (an item to the owner); a validation that expired may be renewed by a named
 * analyst. A rejection of an APPLIED inference REVOKES it: the owner reverts the network through a new version (an item to the owner).
 */
CREATE OR REPLACE FUNCTION twin.tsc_decide_inference(
  p_inference uuid, p_tenant uuid, p_domain uuid, p_decision text, p_reason text, p_digest text, p_valid_until timestamptz, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i twin.supply_inferences%ROWTYPE; t twin.twins_current%ROWTYPE; v_requester uuid; v_until timestamptz; v_item jsonb; v_closed jsonb; v_event uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.supply.inference.validate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'supply inference rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF twin.tsc_is_agent(p_actor) OR NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'supply inference rejected (authority): a named human analyst validates a supply relationship; an agent infers and proposes, never validates' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_actor AND b.role_code = 'domain_analyst' AND b.revoked_at IS NULL
                  AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR b.domain_id = p_domain)) THEN
    RAISE EXCEPTION 'supply inference rejected (authority): the validator of a supply relationship is a domain analyst of this domain' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO i FROM twin.supply_inferences x WHERE x.inference_id = p_inference AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'supply inference rejected (unknown_inference): % is not an inference of this domain', p_inference USING ERRCODE = '23503'; END IF;
  SELECT r.trigger_principal_id INTO v_requester FROM executive.agent_runs r WHERE r.run_id = i.run_id;
  IF v_requester IS NOT NULL AND v_requester = p_actor THEN
    RAISE EXCEPTION 'supply inference rejected (separation_of_duties): % asked for the scan that drafted this inference and does not validate it', p_actor USING ERRCODE = '42501';
  END IF;
  t := twin.tbr_twin(i.twin_id, p_tenant, p_domain, 'supply inference');
  IF p_decision IS NULL OR p_decision NOT IN ('validated', 'rejected') THEN RAISE EXCEPTION 'supply inference rejected (decision): a decision is validated or rejected' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'rejected' THEN
    IF i.state NOT IN ('proposed', 'validated', 'applied') THEN
      RAISE EXCEPTION 'supply inference rejected (state): inference % is %, it is no longer open to a decision', p_inference, i.state USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'supply inference rejected (reason): a rejection states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
    UPDATE twin.supply_inferences SET state = CASE WHEN i.state = 'applied' THEN 'revoked' ELSE 'rejected' END, rejected_by = p_actor, rejected_at = clock_timestamp(), rejection_reason = btrim(p_reason)
     WHERE inference_id = p_inference;
    v_closed := executive.b33_close_items(p_tenant, p_domain, NULL, 'supply_inference', p_inference, format('rejected by a named analyst: %s', btrim(p_reason)), p_actor, p_correlation);
    IF i.state = 'applied' THEN
      v_item := executive.b33_raise_routed(p_tenant, p_domain, 'supply.dependency', 'supply_inference', p_inference,
                  format('Applied supplier %s REVOKED by a named analyst — revert the network through a new version', i.proposed_value ->> 'name'),
                  jsonb_build_array(jsonb_build_object('revoked', true, 'reason', btrim(p_reason))), t.owner_principal_id, v_event, 'supply.inference.revoked',
                  jsonb_build_object('twin_id', i.twin_id, 'applied_version', i.applied_version, 'proposed_site', i.proposed_site), NULL, p_actor, p_correlation);
    END IF;
    PERFORM twin.tsc_event(p_tenant, p_domain, 'inference', p_inference, CASE WHEN i.state = 'applied' THEN 'inference.revoked' ELSE 'inference.rejected' END, p_actor,
              jsonb_build_object('reason', btrim(p_reason), 'was', i.state, 'closed_items', v_closed, 'item', v_item), p_correlation);
    RETURN jsonb_build_object('inference_id', p_inference, 'state', CASE WHEN i.state = 'applied' THEN 'revoked' ELSE 'rejected' END, 'closed_items', v_closed, 'item', v_item);
  END IF;
  -- validated
  IF i.state = 'validated' AND i.valid_until > clock_timestamp() THEN
    RAISE EXCEPTION 'supply inference rejected (state): inference % is already validated until %', p_inference, i.valid_until USING ERRCODE = '22023';
  END IF;
  IF i.state NOT IN ('proposed', 'validated') THEN RAISE EXCEPTION 'supply inference rejected (state): inference % is %, not proposed', p_inference, i.state USING ERRCODE = '22023'; END IF;
  IF i.isolated THEN
    RAISE EXCEPTION 'supply inference rejected (isolated): inference % is isolated by an identity conflict (%) — it is not validated as it stands; correct the network or the records',
      p_inference, coalesce(i.conflict ->> 'reason', 'see the record') USING ERRCODE = '22023';
  END IF;
  IF p_digest IS DISTINCT FROM i.proposal_digest THEN
    RAISE EXCEPTION 'supply inference rejected (stale): the validation quotes digest %, the proposal''s is % — read the proposal again', left(coalesce(p_digest, '<none>'), 12), left(i.proposal_digest, 12) USING ERRCODE = '22023';
  END IF;
  IF i.sensitive AND length(btrim(coalesce(p_reason, ''))) < 8 THEN
    RAISE EXCEPTION 'supply inference rejected (sensitive): % names %; its validation states the validator''s reason (at least 8 characters)', p_inference, i.sensitivity USING ERRCODE = '22023';
  END IF;
  IF i.sensitive AND p_valid_until IS NULL THEN
    RAISE EXCEPTION 'supply inference rejected (sensitive): a sensitive relationship is validated until a stated expiry' USING ERRCODE = '22023';
  END IF;
  v_until := coalesce(p_valid_until, clock_timestamp() + interval '90 days');
  IF v_until <= clock_timestamp() OR v_until > clock_timestamp() + interval '366 days' THEN
    RAISE EXCEPTION 'supply inference rejected (expiry): a validation expires in the future and within a year (got %)', v_until USING ERRCODE = '22023';
  END IF;
  UPDATE twin.supply_inferences SET state = 'validated', validated_by = p_actor, validated_at = clock_timestamp(), validation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         validation_digest = p_digest, valid_until = v_until WHERE inference_id = p_inference;
  v_closed := executive.b33_close_items(p_tenant, p_domain, NULL, 'supply_inference', p_inference, 'validated by a named analyst', p_actor, p_correlation);
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'supply.dependency', 'supply_inference', p_inference,
              format('Validated supplier %s behind %s — awaiting the twin owner''s application to the network', i.proposed_value ->> 'name', i.behind_site),
              jsonb_build_array(jsonb_build_object('validated', true, 'valid_until', v_until)), t.owner_principal_id, v_event, 'supply.inference.validated',
              jsonb_build_object('twin_id', i.twin_id, 'proposed_site', i.proposed_site, 'validated_by', p_actor), NULL, p_actor, p_correlation);
  UPDATE twin.supply_inferences SET item_id = (v_item ->> 'item_id')::uuid WHERE inference_id = p_inference;
  PERFORM twin.tsc_event(p_tenant, p_domain, 'inference', p_inference, 'inference.validated', p_actor,
            jsonb_build_object('digest', p_digest, 'reason', nullif(btrim(coalesce(p_reason, '')), ''), 'valid_until', v_until, 'sensitive', i.sensitive, 'closed_items', v_closed, 'item', v_item,
                               'renewed', i.state = 'validated'), p_correlation);
  RETURN jsonb_build_object('inference_id', p_inference, 'state', 'validated', 'valid_until', v_until, 'closed_items', v_closed, 'item', v_item);
END $$ LANGUAGE plpgsql;

/*
 * THE APPLICATION (twin.supply.inference.apply; the twin's OWNER): RECORDS that an admitted version on actual carries a validated inference — the
 * site `site:<proposed>` with provenance `validated` naming this inference and citing its evidence, and the route from it to the vendor — or, for
 * a REVOKED inference, that a later admitted version no longer carries the site (reverted). The version itself was opened, grounded and admitted
 * by the owner through the existing ports, each its own governed write (R4): this port writes no element.
 */
CREATE OR REPLACE FUNCTION twin.tsc_apply_inference(
  p_inference uuid, p_tenant uuid, p_domain uuid, p_mode text, p_version int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i twin.supply_inferences%ROWTYPE; t twin.twins_current%ROWTYPE; s twin.state_elements%ROWTYPE; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.supply.inference.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO i FROM twin.supply_inferences x WHERE x.inference_id = p_inference AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'supply inference rejected (unknown_inference): % is not an inference of this domain', p_inference USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(i.twin_id, p_tenant, p_domain, 'supply inference');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'supply inference', 'applying a validated supply relationship to the network');
  IF NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = i.twin_id AND v.version = p_version AND v.branch_id = 'actual' AND v.state = 'admitted') THEN
    RAISE EXCEPTION 'supply inference rejected (application): version % of twin % is not an admitted version on actual', p_version, i.twin_id USING ERRCODE = '22023';
  END IF;
  IF p_mode = 'revert' THEN
    IF i.state <> 'revoked' THEN RAISE EXCEPTION 'supply inference rejected (state): only a revoked inference is reverted (inference % is %)', p_inference, i.state USING ERRCODE = '22023'; END IF;
    IF p_version <= i.applied_version THEN RAISE EXCEPTION 'supply inference rejected (application): the revert is a version after the application (v%)', i.applied_version USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM twin.state_elements e WHERE e.twin_id = i.twin_id AND e.version = p_version AND e.key = 'site:' || i.proposed_site) THEN
      RAISE EXCEPTION 'supply inference rejected (application): version % still carries site:% — a revert removes the revoked supplier', p_version, i.proposed_site USING ERRCODE = '22023';
    END IF;
    UPDATE twin.supply_inferences SET state = 'reverted', reverted_by = p_actor, reverted_at = clock_timestamp(), reverted_version = p_version WHERE inference_id = p_inference;
    v_closed := executive.b33_close_items(p_tenant, p_domain, NULL, 'supply_inference', p_inference, format('reverted by the twin owner in version %s', p_version), p_actor, p_correlation);
    PERFORM twin.tsc_event(p_tenant, p_domain, 'inference', p_inference, 'inference.reverted', p_actor, jsonb_build_object('version', p_version, 'closed_items', v_closed), p_correlation);
    RETURN jsonb_build_object('inference_id', p_inference, 'state', 'reverted', 'version', p_version, 'closed_items', v_closed);
  END IF;
  IF p_mode IS DISTINCT FROM 'apply' THEN RAISE EXCEPTION 'supply inference rejected (mode): the mode is apply or revert' USING ERRCODE = '22023'; END IF;
  IF i.state <> 'validated' THEN
    RAISE EXCEPTION 'supply inference rejected (state): inference % is %; only a validated inference is applied', p_inference, i.state USING ERRCODE = '22023';
  END IF;
  IF i.valid_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'supply inference rejected (stale): the validation of inference % expired at % — a named analyst validates it again before it is applied', p_inference, i.valid_until USING ERRCODE = '22023';
  END IF;
  IF p_version <= i.twin_version THEN
    RAISE EXCEPTION 'supply inference rejected (application): version % is not after the version the inference was read from (v%)', p_version, i.twin_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM twin.state_elements e WHERE e.twin_id = i.twin_id AND e.version = p_version AND e.key = 'site:' || i.proposed_site;
  IF NOT FOUND OR s.value #>> '{provenance,basis}' IS DISTINCT FROM 'validated' OR s.value #>> '{provenance,inference_id}' IS DISTINCT FROM p_inference::text THEN
    RAISE EXCEPTION 'supply inference rejected (application): version % carries no site:% with provenance {basis: validated, inference_id: %}', p_version, i.proposed_site, p_inference USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.citations) c, jsonb_array_elements(i.evidence) ev
                  WHERE c ->> 'kind' = 'evidence' AND c ->> 'id' = ev ->> 'id' AND (c ->> 'version')::int = (ev ->> 'version')::int AND c ->> 'digest' = ev ->> 'digest') THEN
    RAISE EXCEPTION 'supply inference rejected (application): site:% in version % cites none of the inference''s evidence', i.proposed_site, p_version USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.state_elements e WHERE e.twin_id = i.twin_id AND e.version = p_version AND e.key LIKE 'route:%'
                  AND e.value ->> 'from' = i.proposed_site AND e.value ->> 'to' = i.behind_site AND e.value ->> 'material' = i.material) THEN
    RAISE EXCEPTION 'supply inference rejected (application): version % carries no route of % from % to %', p_version, i.material, i.proposed_site, i.behind_site USING ERRCODE = '22023';
  END IF;
  UPDATE twin.supply_inferences SET state = 'applied', applied_by = p_actor, applied_at = clock_timestamp(), applied_version = p_version WHERE inference_id = p_inference;
  v_closed := executive.b33_close_items(p_tenant, p_domain, NULL, 'supply_inference', p_inference, format('applied by the twin owner in version %s', p_version), p_actor, p_correlation);
  PERFORM twin.tsc_event(p_tenant, p_domain, 'inference', p_inference, 'inference.applied', p_actor,
            jsonb_build_object('version', p_version, 'citation', twin.tsc_twin_citation(p_tenant, i.twin_id, p_version), 'closed_items', v_closed), p_correlation);
  RETURN jsonb_build_object('inference_id', p_inference, 'state', 'applied', 'version', p_version, 'closed_items', v_closed);
END $$ LANGUAGE plpgsql;

/*
 * A DISRUPTION OPENED (twin.supply.disruption.open): by a person from a signal (state open), or PROPOSED by the domain's Supply Chain Agent inside
 * its running scan (state proposed, routed `supply.disruption` for a person's confirmation). The signal names what it rests on: a warning, an
 * indicator, an admitted twin change (each verified in this domain), or the person's own report.
 */
CREATE OR REPLACE FUNCTION twin.tsc_open_disruption(
  p_disruption uuid, p_tenant uuid, p_domain uuid, p_title text, p_signal jsonb, p_chokepoints text[], p_places jsonb, p_derating numeric, p_duration numeric,
  p_telemetry_twin uuid, p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, executive, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_agent boolean; v_kind text := p_signal ->> 'kind'; v_ref uuid; v_chokes text[]; v_places jsonb; v_footprint text; p jsonb; v_item jsonb; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.supply.disruption.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'supply disruption rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  v_agent := twin.tsc_is_agent(p_actor);
  IF v_agent THEN PERFORM twin.tsc_assert_agent_run('supply disruption', p_tenant, p_domain, p_agent, p_run, p_actor);
  ELSIF p_agent IS NOT NULL OR p_run IS NOT NULL THEN RAISE EXCEPTION 'supply disruption rejected (actor): a person opens a disruption in their own name, not an agent''s run' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'supply disruption rejected (shape): a disruption has a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_signal) IS DISTINCT FROM 'object' OR v_kind IS NULL OR v_kind NOT IN ('warning', 'indicator', 'twin_change', 'person') THEN
    RAISE EXCEPTION 'supply disruption rejected (signal): the signal is {kind: warning | indicator | twin_change | person, ref?, version?, note?}' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'person' AND v_agent THEN RAISE EXCEPTION 'supply disruption rejected (signal): an agent proposes from a recorded signal, never as a person''s report' USING ERRCODE = '22023'; END IF;
  IF v_kind <> 'person' THEN
    IF coalesce(p_signal ->> 'ref', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'supply disruption rejected (signal): a % signal names its ref', v_kind USING ERRCODE = '22023';
    END IF;
    v_ref := (p_signal ->> 'ref')::uuid;
    IF (v_kind = 'warning' AND NOT EXISTS (SELECT 1 FROM prediction.warnings_current w WHERE w.warning_id = v_ref AND w.tenant_id = p_tenant AND w.domain_id = p_domain))
       OR (v_kind = 'indicator' AND NOT EXISTS (SELECT 1 FROM prediction.indicators_current x WHERE x.indicator_id = v_ref AND x.tenant_id = p_tenant AND x.domain_id = p_domain))
       OR (v_kind = 'twin_change' AND NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = v_ref AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'admitted'
                                                   AND (p_signal -> 'version' IS NULL OR v.version = (p_signal ->> 'version')::int))) THEN
      RAISE EXCEPTION 'supply disruption rejected (unknown_signal): the % % is not one of this domain', v_kind, v_ref USING ERRCODE = '23503';
    END IF;
  END IF;
  SELECT coalesce(array_agg(DISTINCT c ORDER BY c), ARRAY[]::text[]) INTO v_chokes FROM unnest(coalesce(p_chokepoints, ARRAY[]::text[])) c;
  IF EXISTS (SELECT 1 FROM unnest(v_chokes) c WHERE c !~ '^[a-z0-9][a-z0-9-]{0,60}$') THEN
    RAISE EXCEPTION 'supply disruption rejected (shape): a chokepoint is a key (lower-case letters, digits, ''-'') as routes name it in via' USING ERRCODE = '22023';
  END IF;
  v_places := coalesce(p_places, '[]'::jsonb);
  IF jsonb_typeof(v_places) <> 'array' THEN RAISE EXCEPTION 'supply disruption rejected (shape): places is a list of {country?, city?}' USING ERRCODE = '22023'; END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(v_places) LOOP
    IF jsonb_typeof(p) <> 'object' OR (p ->> 'country' IS NULL AND p ->> 'city' IS NULL) OR (p ->> 'country' IS NOT NULL AND p ->> 'country' !~ '^[A-Z]{2}$') THEN
      RAISE EXCEPTION 'supply disruption rejected (shape): a place is {country? (ISO alpha-2), city?} naming at least one' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF cardinality(v_chokes) + jsonb_array_length(v_places) = 0 THEN RAISE EXCEPTION 'supply disruption rejected (shape): a disruption names a chokepoint or a place' USING ERRCODE = '22023'; END IF;
  IF p_derating IS NULL OR p_derating <= 0 OR p_derating > 1 THEN RAISE EXCEPTION 'supply disruption rejected (shape): the derating is the share of capacity lost on an affected route, in (0, 1]' USING ERRCODE = '22023'; END IF;
  IF p_duration IS NOT NULL AND (p_duration <= 0 OR p_duration > 730) THEN RAISE EXCEPTION 'supply disruption rejected (shape): the expected duration is (0, 730] days' USING ERRCODE = '22023'; END IF;
  IF p_telemetry_twin IS NOT NULL AND NOT EXISTS (SELECT 1 FROM twin.twins_current x WHERE x.twin_id = p_telemetry_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'supply disruption rejected (unknown_twin): the telemetry twin % is not a twin of this domain', p_telemetry_twin USING ERRCODE = '23503';
  END IF;
  v_footprint := array_to_string(v_chokes, ',') || '|' || coalesce((SELECT string_agg(coalesce(x ->> 'country', '') || '/' || lower(coalesce(x ->> 'city', '')), ',' ORDER BY coalesce(x ->> 'country', ''), lower(coalesce(x ->> 'city', '')))
                                                                    FROM jsonb_array_elements(v_places) x), '');
  IF EXISTS (SELECT 1 FROM twin.supply_disruptions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.footprint = v_footprint AND d.state IN ('proposed', 'open', 'mapped')) THEN
    RAISE EXCEPTION 'supply disruption rejected (duplicate): a live disruption already covers % — map or close it', v_footprint USING ERRCODE = '23505';
  END IF;
  v_state := CASE WHEN v_agent THEN 'proposed' ELSE 'open' END;
  INSERT INTO twin.supply_disruptions (disruption_id, scope, tenant_id, domain_id, title, signal, chokepoints, places, footprint, derating, duration_days, telemetry_twin_id, state, opened_by,
                                       proposed_by_agent, proposed_run, correlation_id)
  VALUES (p_disruption, 'DOMAIN', p_tenant, p_domain, btrim(p_title), p_signal, v_chokes, v_places, v_footprint, p_derating, p_duration, p_telemetry_twin, v_state, p_actor,
          CASE WHEN v_agent THEN p_agent END, CASE WHEN v_agent THEN p_run END, p_correlation);
  IF v_agent THEN
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'supply.disruption', 'supply_disruption', p_disruption,
                format('Disruption proposed by the Supply Chain Agent: %s — awaiting a person''s confirmation', btrim(p_title)),
                jsonb_build_array(jsonb_build_object('proposed', true, 'signal', p_signal)), NULL, p_disruption, 'supply.disruption.proposed',
                jsonb_build_object('chokepoints', to_jsonb(v_chokes), 'places', v_places, 'agent_id', p_agent, 'run_id', p_run), NULL, p_actor, p_correlation);
    UPDATE twin.supply_disruptions SET item_id = (v_item ->> 'item_id')::uuid WHERE disruption_id = p_disruption;
  END IF;
  PERFORM twin.tsc_event(p_tenant, p_domain, 'disruption', p_disruption, CASE WHEN v_agent THEN 'disruption.proposed' ELSE 'disruption.opened' END, p_actor,
            jsonb_build_object('signal', p_signal, 'chokepoints', to_jsonb(v_chokes), 'places', v_places, 'derating', p_derating, 'duration_days', p_duration, 'item', v_item), p_correlation);
  RETURN jsonb_build_object('disruption_id', p_disruption, 'state', v_state, 'footprint', v_footprint, 'item', v_item);
END $$ LANGUAGE plpgsql;

/* CONFIRM (twin.supply.disruption.confirm; a person): an agent-proposed disruption becomes open. CLOSE (twin.supply.disruption.close; a person):
   resolved (closed) or withdrawn with a reason — its items closed; its maps, alternatives and branches stay for review. */
CREATE OR REPLACE FUNCTION twin.tsc_settle_disruption(
  p_disruption uuid, p_tenant uuid, p_domain uuid, p_to text, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d twin.supply_disruptions%ROWTYPE; v_closed jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(CASE WHEN p_to = 'open' THEN ARRAY['twin.supply.disruption.confirm'] ELSE ARRAY['twin.supply.disruption.close'] END);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'supply disruption rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF twin.tsc_is_agent(p_actor) THEN RAISE EXCEPTION 'supply disruption rejected (authority): a person confirms or closes a disruption; the agent only proposes' USING ERRCODE = '42501'; END IF;
  SELECT * INTO d FROM twin.supply_disruptions x WHERE x.disruption_id = p_disruption AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'supply disruption rejected (unknown_disruption): % is not a disruption of this domain', p_disruption USING ERRCODE = '23503'; END IF;
  IF p_to = 'open' THEN
    IF d.state <> 'proposed' THEN RAISE EXCEPTION 'supply disruption rejected (state): disruption % is %; only a proposed disruption is confirmed', p_disruption, d.state USING ERRCODE = '22023'; END IF;
    UPDATE twin.supply_disruptions SET state = 'open', confirmed_by = p_actor, confirmed_at = clock_timestamp() WHERE disruption_id = p_disruption;
    v_closed := executive.b33_close_items(p_tenant, p_domain, 'supply.disruption', 'supply_disruption', p_disruption, 'confirmed by a person', p_actor, p_correlation);
    PERFORM twin.tsc_event(p_tenant, p_domain, 'disruption', p_disruption, 'disruption.confirmed', p_actor, jsonb_build_object('closed_items', v_closed), p_correlation);
    RETURN jsonb_build_object('disruption_id', p_disruption, 'state', 'open', 'closed_items', v_closed);
  END IF;
  IF p_to NOT IN ('closed', 'withdrawn') THEN RAISE EXCEPTION 'supply disruption rejected (shape): a disruption is confirmed (open), closed or withdrawn' USING ERRCODE = '22023'; END IF;
  IF d.state NOT IN ('proposed', 'open', 'mapped') THEN RAISE EXCEPTION 'supply disruption rejected (state): disruption % is already %', p_disruption, d.state USING ERRCODE = '22023'; END IF;
  IF p_to = 'closed' AND d.state = 'proposed' THEN RAISE EXCEPTION 'supply disruption rejected (state): a proposed disruption is confirmed or withdrawn, not closed' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'supply disruption rejected (reason): a closure states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE twin.supply_disruptions SET state = p_to, closed_by = p_actor, closed_at = clock_timestamp(), close_reason = btrim(p_reason) WHERE disruption_id = p_disruption;
  v_closed := executive.b33_close_items(p_tenant, p_domain, NULL, 'supply_disruption', p_disruption, format('%s: %s', p_to, btrim(p_reason)), p_actor, p_correlation);
  -- the "no feasible alternative" items stand on the alternatives' ids
  v_closed := v_closed || coalesce((SELECT jsonb_agg(z) FROM (SELECT jsonb_array_elements(executive.b33_close_items(p_tenant, p_domain, 'supply.disruption', 'supply_disruption', a.alternative_id,
                                                                                      format('%s: %s', p_to, btrim(p_reason)), p_actor, p_correlation)) z
                                                               FROM twin.supply_alternatives a WHERE a.disruption_id = p_disruption) q), '[]'::jsonb);
  PERFORM twin.tsc_event(p_tenant, p_domain, 'disruption', p_disruption, 'disruption.' || p_to, p_actor, jsonb_build_object('reason', btrim(p_reason), 'closed_items', v_closed), p_correlation);
  RETURN jsonb_build_object('disruption_id', p_disruption, 'state', p_to, 'closed_items', v_closed);
END $$ LANGUAGE plpgsql;

/*
 * THE MAP (twin.supply.disruption.map; a person or the agent in its running scan): the result computed BEFORE this write (TS, its own read
 * transaction) recorded with the twin versions it read — each an admitted version with its canonical digest, and still the HEAD (a newer
 * admission between the read and the write refuses the map as stale: re-map). The same result as the last map → unchanged (no new map).
 * The first map that finds the disruption reaching a network routes `supply.disruption` under the policy, the network's owner named; an
 * identity conflict the map isolates routes `supply.dependency`.
 */
CREATE OR REPLACE FUNCTION twin.tsc_record_map(
  p_map uuid, p_tenant uuid, p_domain uuid, p_disruption uuid, p_pinned jsonb, p_result jsonb, p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, executive, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d twin.supply_disruptions%ROWTYPE; c jsonb; v_digest text; v_last twin.supply_disruption_maps%ROWTYPE; v_no int; v_affected boolean; v_stale boolean; v_item jsonb;
        v_owner uuid; n jsonb; iso jsonb; v_items jsonb := '[]'::jsonb; v_agent boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.supply.disruption.map']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'supply disruption rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  v_agent := twin.tsc_is_agent(p_actor);
  IF v_agent THEN PERFORM twin.tsc_assert_agent_run('supply disruption', p_tenant, p_domain, p_agent, p_run, p_actor); END IF;
  SELECT * INTO d FROM twin.supply_disruptions x WHERE x.disruption_id = p_disruption AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'supply disruption rejected (unknown_disruption): % is not a disruption of this domain', p_disruption USING ERRCODE = '23503'; END IF;
  IF d.state = 'proposed' THEN RAISE EXCEPTION 'supply disruption rejected (state): disruption % is proposed — a person confirms it before it is mapped', p_disruption USING ERRCODE = '22023'; END IF;
  IF d.state NOT IN ('open', 'mapped') THEN RAISE EXCEPTION 'supply disruption rejected (state): disruption % is %', p_disruption, d.state USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_pinned) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pinned) = 0 OR NOT twin.citations_ok(p_pinned) THEN
    RAISE EXCEPTION 'supply disruption rejected (map): a map pins the twin versions it read ({kind: twin, id, version, digest}, at least one)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR jsonb_typeof(p_result -> 'networks') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'supply disruption rejected (map): the result is the computed map {networks: [...], affected, stale, …}' USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_pinned) LOOP
    IF c ->> 'kind' <> 'twin' OR twin.tsc_twin_citation(p_tenant, (c ->> 'id')::uuid, (c ->> 'version')::int) IS DISTINCT FROM jsonb_build_object('kind', 'twin', 'id', c ->> 'id', 'version', (c ->> 'version')::int, 'digest', c ->> 'digest') THEN
      RAISE EXCEPTION 'supply disruption rejected (map): % v% is not an admitted twin version of this domain with that digest', c ->> 'id', c ->> 'version' USING ERRCODE = '22023';
    END IF;
    IF (SELECT v.branch_id FROM twin.twin_versions v WHERE v.twin_id = (c ->> 'id')::uuid AND v.version = (c ->> 'version')::int) = 'actual'
       AND twin.tbr_head((c ->> 'id')::uuid, 'actual') > (c ->> 'version')::int THEN
      RAISE EXCEPTION 'supply disruption rejected (stale): the map read v% of twin %, whose head is now v% — map it again', c ->> 'version', c ->> 'id', twin.tbr_head((c ->> 'id')::uuid, 'actual') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_digest := encode(sha256(convert_to((jsonb_build_object('pinned', p_pinned, 'result', p_result))::text, 'UTF8')), 'hex');
  SELECT * INTO v_last FROM twin.supply_disruption_maps m WHERE m.map_id = d.last_map_id;
  IF FOUND AND v_last.result_digest = v_digest THEN
    RETURN jsonb_build_object('disruption_id', p_disruption, 'map_id', v_last.map_id, 'map_no', v_last.map_no, 'unchanged', true, 'result_digest', v_digest);
  END IF;
  v_no := d.map_count + 1;
  v_affected := coalesce((p_result ->> 'affected')::boolean, false); v_stale := coalesce((p_result ->> 'stale')::boolean, false);
  INSERT INTO twin.supply_disruption_maps (map_id, scope, tenant_id, domain_id, disruption_id, map_no, pinned, result, result_digest, affected, stale, agent_id, run_id, mapped_by, correlation_id)
  VALUES (p_map, 'DOMAIN', p_tenant, p_domain, p_disruption, v_no, p_pinned, p_result, v_digest, v_affected, v_stale, CASE WHEN v_agent THEN p_agent END, CASE WHEN v_agent THEN p_run END, p_actor, p_correlation);
  UPDATE twin.supply_disruptions SET state = 'mapped', map_count = v_no, last_map_id = p_map WHERE disruption_id = p_disruption;
  IF v_affected THEN
    SELECT (x ->> 'owner')::uuid INTO v_owner FROM jsonb_array_elements(p_result -> 'networks') x WHERE jsonb_array_length(coalesce(x -> 'affected_routes', '[]'::jsonb)) > 0 LIMIT 1;
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'supply.disruption', 'supply_disruption', p_disruption,
                left(format('Disruption mapped: %s — %s', d.title, coalesce(p_result ->> 'summary', '')), 512),
                jsonb_build_array(jsonb_build_object('map_no', v_no, 'stale', v_stale)), v_owner, p_disruption, 'supply.disruption.mapped',
                jsonb_build_object('map_id', p_map, 'map_no', v_no, 'result_digest', v_digest), jsonb_build_object('consequence', 'C2', 'hours_to_window', 72), p_actor, p_correlation);
    IF d.item_id IS NULL THEN UPDATE twin.supply_disruptions SET item_id = (v_item ->> 'item_id')::uuid WHERE disruption_id = p_disruption; END IF;
  END IF;
  FOR n IN SELECT * FROM jsonb_array_elements(p_result -> 'networks') LOOP
    FOR iso IN SELECT * FROM jsonb_array_elements(coalesce(n -> 'isolated', '[]'::jsonb)) LOOP
      v_items := v_items || jsonb_build_array(executive.b33_raise_routed(p_tenant, p_domain, 'supply.dependency', 'supply_disruption', p_disruption,
                   left(format('Identity conflict isolated in %s: %s', n ->> 'title', iso ->> 'reason'), 512), jsonb_build_array(iso), (n ->> 'owner')::uuid,
                   md5(p_disruption::text || '|identity|' || (iso -> 'sites')::text)::uuid, 'supply.identity.conflict',
                   jsonb_build_object('twin_id', n ->> 'twin_id', 'sites', iso -> 'sites'), NULL, p_actor, p_correlation));
    END LOOP;
  END LOOP;
  PERFORM twin.tsc_event(p_tenant, p_domain, 'disruption', p_disruption, 'disruption.mapped', p_actor,
            jsonb_build_object('map_id', p_map, 'map_no', v_no, 'pinned', p_pinned, 'result_digest', v_digest, 'affected', v_affected, 'stale', v_stale, 'item', v_item, 'identity_items', v_items), p_correlation);
  RETURN jsonb_build_object('disruption_id', p_disruption, 'map_id', p_map, 'map_no', v_no, 'unchanged', false, 'result_digest', v_digest, 'affected', v_affected, 'stale', v_stale,
                            'item', v_item, 'identity_items', v_items);
END $$ LANGUAGE plpgsql;

/*
 * AN ALTERNATIVE EVALUATED (twin.supply.alternative.evaluate; a person): the evaluation computed BEFORE this write (TS: the branch read, the
 * constraint engine through the gate capability in its own read transaction) recorded against the disruption's LATEST map and the option's
 * scenario branch `alt-<key>` of a mapped network (an admitted branch version forked from actual — preserved for review). A re-evaluation of the
 * key supersedes the prior one. When no evaluated option of the disruption is feasible, `supply.disruption` is routed ("no feasible
 * alternative"); a feasible one closes those items. The decision on the response is NOT taken here (the decision layer).
 */
CREATE OR REPLACE FUNCTION twin.tsc_record_alternative(
  p_alternative uuid, p_tenant uuid, p_domain uuid, p_disruption uuid, p_map uuid, p_key text, p_kind text, p_title text, p_params jsonb, p_twin uuid, p_branch_version int,
  p_evaluation jsonb, p_verdict text, p_reasons jsonb, p_limits jsonb, p_constraint jsonb, p_cost jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, executive, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d twin.supply_disruptions%ROWTYPE; m twin.supply_disruption_maps%ROWTYPE; v twin.twin_versions%ROWTYPE; v_cit jsonb; prior twin.supply_alternatives%ROWTYPE; v_digest text;
        v_feasible int; v_total int; v_item jsonb; v_closed jsonb := '[]'::jsonb; v_owner uuid; a record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.supply.alternative.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'supply alternative rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF twin.tsc_is_agent(p_actor) THEN RAISE EXCEPTION 'supply alternative rejected (authority): a person evaluates a response option; the agent proposes dependencies and disruptions only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO d FROM twin.supply_disruptions x WHERE x.disruption_id = p_disruption AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'supply alternative rejected (unknown_disruption): % is not a disruption of this domain', p_disruption USING ERRCODE = '23503'; END IF;
  IF d.state <> 'mapped' THEN RAISE EXCEPTION 'supply alternative rejected (state): disruption % is %; an option is evaluated on a mapped, live disruption', p_disruption, d.state USING ERRCODE = '22023'; END IF;
  IF p_map IS DISTINCT FROM d.last_map_id THEN
    RAISE EXCEPTION 'supply alternative rejected (stale): the evaluation read map %, the disruption''s latest is % — evaluate it again', p_map, d.last_map_id USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM twin.supply_disruption_maps x WHERE x.map_id = p_map;
  IF coalesce(p_key, '') !~ '^[a-z0-9][a-z0-9-]{1,36}$' THEN RAISE EXCEPTION 'supply alternative rejected (shape): the key is lower-case letters, digits and ''-'' (2–37); its branch is alt-<key>' USING ERRCODE = '22023'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('sourcing', 'inventory', 'routing') THEN RAISE EXCEPTION 'supply alternative rejected (shape): an option is sourcing, inventory or routing' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'supply alternative rejected (shape): an option has a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_verdict IS NULL OR p_verdict NOT IN ('feasible', 'infeasible', 'indeterminate') OR jsonb_typeof(p_reasons) IS DISTINCT FROM 'array' OR jsonb_typeof(p_limits) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_evaluation) IS DISTINCT FROM 'object' OR (p_verdict <> 'feasible' AND jsonb_array_length(p_reasons) = 0) THEN
    RAISE EXCEPTION 'supply alternative rejected (shape): an evaluation carries its verdict (feasible | infeasible | indeterminate), its reasons and its coverage limits' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(m.pinned) c WHERE (c ->> 'id')::uuid = p_twin) THEN
    RAISE EXCEPTION 'supply alternative rejected (branch): twin % is not a network the disruption''s map read', p_twin USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin AND x.version = p_branch_version;
  IF NOT FOUND OR v.state <> 'admitted' OR v.branch_id <> 'alt-' || p_key OR v.forked_from_version IS NULL THEN
    RAISE EXCEPTION 'supply alternative rejected (branch): version % of twin % is not an admitted version of the scenario branch alt-% forked from actual', p_branch_version, p_twin, p_key USING ERRCODE = '22023';
  END IF;
  v_cit := twin.tsc_twin_citation(p_tenant, p_twin, p_branch_version);
  IF v_cit IS NULL THEN RAISE EXCEPTION 'supply alternative rejected (branch): version % of twin % has no canonical TWN version', p_branch_version, p_twin USING ERRCODE = '22023'; END IF;
  v_digest := encode(sha256(convert_to(p_evaluation::text, 'UTF8')), 'hex');
  SELECT * INTO prior FROM twin.supply_alternatives x WHERE x.disruption_id = p_disruption AND x.alt_key = p_key AND x.state = 'evaluated' FOR UPDATE;
  IF FOUND THEN
    UPDATE twin.supply_alternatives SET state = 'superseded', superseded_by = p_alternative WHERE alternative_id = prior.alternative_id;
    v_closed := executive.b33_close_items(p_tenant, p_domain, 'supply.disruption', 'supply_disruption', prior.alternative_id, 're-evaluated', p_actor, p_correlation);
    PERFORM twin.tsc_event(p_tenant, p_domain, 'alternative', prior.alternative_id, 'alternative.superseded', p_actor, jsonb_build_object('superseded_by', p_alternative), p_correlation);
  END IF;
  INSERT INTO twin.supply_alternatives (alternative_id, scope, tenant_id, domain_id, disruption_id, map_id, alt_key, kind, title, params, twin_id, branch_id, branch_version, branch_citation,
                                        evaluation, evaluation_digest, verdict, recommendable, reasons, coverage_limits, constraint_check, cost, state, evaluated_by, correlation_id)
  VALUES (p_alternative, 'DOMAIN', p_tenant, p_domain, p_disruption, p_map, p_key, p_kind, btrim(p_title), coalesce(p_params, '{}'::jsonb), p_twin, 'alt-' || p_key, p_branch_version, v_cit,
          p_evaluation, v_digest, p_verdict, p_verdict = 'feasible', p_reasons, p_limits, p_constraint, p_cost, 'evaluated', p_actor, p_correlation);
  SELECT count(*) FILTER (WHERE x.verdict = 'feasible'), count(*) INTO v_feasible, v_total FROM twin.supply_alternatives x WHERE x.disruption_id = p_disruption AND x.state = 'evaluated';
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = p_twin;
  IF v_feasible = 0 THEN
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'supply.disruption', 'supply_disruption', p_alternative,
                left(format('No feasible alternative for %s: %s evaluated option(s), none feasible — the response is constrained', d.title, v_total), 512),
                jsonb_build_array(jsonb_build_object('evaluated', v_total, 'feasible', 0)), v_owner, p_alternative, 'supply.alternatives.none_feasible',
                jsonb_build_object('disruption_id', p_disruption, 'alternative_id', p_alternative), NULL, p_actor, p_correlation);
  ELSIF p_verdict = 'feasible' THEN
    FOR a IN SELECT x.alternative_id FROM twin.supply_alternatives x WHERE x.disruption_id = p_disruption AND x.alternative_id <> p_alternative LOOP
      v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, 'supply.disruption', 'supply_disruption', a.alternative_id, 'a feasible alternative was evaluated', p_actor, p_correlation);
    END LOOP;
  END IF;
  PERFORM twin.tsc_event(p_tenant, p_domain, 'alternative', p_alternative, 'alternative.evaluated', p_actor,
            jsonb_build_object('disruption_id', p_disruption, 'map_id', p_map, 'key', p_key, 'kind', p_kind, 'verdict', p_verdict, 'branch', v_cit, 'evaluation_digest', v_digest,
                               'supersedes', prior.alternative_id, 'item', v_item, 'closed_items', v_closed), p_correlation);
  RETURN jsonb_build_object('alternative_id', p_alternative, 'verdict', p_verdict, 'recommendable', p_verdict = 'feasible', 'branch', v_cit, 'feasible', v_feasible, 'evaluated', v_total,
                            'item', v_item, 'closed_items', v_closed, 'supersedes', prior.alternative_id);
END $$ LANGUAGE plpgsql;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['twin.tsc_declare_record_source(uuid,uuid,uuid,uuid,text,text,boolean,text,uuid,uuid)',
                           'twin.tsc_draft_inferences(uuid,uuid,uuid,int,jsonb,jsonb,jsonb,uuid,uuid,uuid,uuid)',
                           'twin.tsc_decide_inference(uuid,uuid,uuid,text,text,text,timestamptz,uuid,uuid)',
                           'twin.tsc_apply_inference(uuid,uuid,uuid,text,int,uuid,uuid)',
                           'twin.tsc_open_disruption(uuid,uuid,uuid,text,jsonb,text[],jsonb,numeric,numeric,uuid,uuid,uuid,uuid,uuid)',
                           'twin.tsc_settle_disruption(uuid,uuid,uuid,text,text,uuid,uuid)',
                           'twin.tsc_record_map(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,uuid,uuid)',
                           'twin.tsc_record_alternative(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,int,jsonb,text,jsonb,jsonb,jsonb,jsonb,uuid,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO eye_commit', f);
  END LOOP;
END $$;

-- §SC.4 THE RACE (AG-026) ──────────────────────────────────────────────────────────────────────────────────────────────────
/*
 * THE DRAFT (twin.proposal.draft): the domain's active Supply Chain Agent, under its own session and inside its own running supply_scan
 * run, drafts the findings it read from ONE admitted version of a supply-network twin. Per finding: the same measure as the finding's
 * latest record (proposed, accepted or dismissed) → UNCHANGED (never proposed twice — a dismissed finding comes back only when its
 * measure changes); a changed measure while one is still proposed → the open one SUPERSEDED by the new one; else a new proposal. The scan
 * mark records whether the version was read through (complete) or cut short by max_items (it stays in the backlog). Each proposal is
 * a `proposal.drafted` event on the twin. Nothing of the twin is written: the finding goes to its owner.
 * 0092:2357 copied whole; B33 supply: two concurrent scans of the same twin (two runs, a scheduled and a triggered one) are SERIALISED by a
 * per-twin advisory lock — the second reads the first's committed proposals and finds them unchanged — and a unique clash on tap_one_open
 * that still reaches the insert answers `twin proposal rejected (duplicate)` (409), never the generic unique mapping.
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
  -- B33 supply (AG-026): one draft per twin at a time — a concurrent scan waits here and then reads the first one's committed proposals
  PERFORM pg_advisory_xact_lock(hashtextextended('twin.draft_agent_proposals:' || p_twin::text, 0));
  -- end B33 supply
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
    -- B33 supply (AG-026): the open proposal's unique index (tap_one_open) answered in this family's words, never the generic unique mapping
    BEGIN
      INSERT INTO twin.agent_proposals (proposal_id, scope, tenant_id, domain_id, twin_id, twin_version, version_citation, finding_kind, subject, measure, measure_digest, rationale,
                                        state, agent_id, run_id, drafted_by, correlation_id)
      VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_version, v_citation, f ->> 'finding_kind', f ->> 'subject', f -> 'measure', v_measure_digest, btrim(f ->> 'rationale'),
              'proposed', p_agent, p_run, p_actor, p_correlation);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'twin proposal rejected (duplicate): a % finding on % of twin % is already open — a concurrent scan drafted it; this run leaves it to the owner', f ->> 'finding_kind', f ->> 'subject', p_twin
        USING ERRCODE = '23505';
    END;
    -- end B33 supply
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
