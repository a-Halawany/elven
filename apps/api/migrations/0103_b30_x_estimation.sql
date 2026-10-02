-- 0103 §ES — CP-6 B30, part `estimation` (F-P5-02 complete): twin state ESTIMATION and continuous RECONCILIATION. Applied after the prelude
-- (§0) and, once combined by the integrator, after §BR and §EN. Forward-only; nothing earlier is edited. Every figure a harness or an act
-- seeds through this part is SYNTHETIC.
--
--   §ES.0 THE RECONCILIATION AGENT's registration and runs: executive.register_agent and executive.open_agent_run RE-DECLARED, copied whole
--         from their latest bodies (0092 §B.2), ONE change each (marked `B30 estimation`): the kind reconciliation (the prelude's; max_items
--         enforced by its scan) and its task reconcile_scan, run by a reconciliation agent and by no other kind.
--   §ES.1 THE TABLES (schema twin, prefix tes_): estimators (declared, versioned), estimates (CANDIDATE state, every estimator's candidate
--         kept), input_qualifications, observation_requests, estimation_events (the ledger).
--   §ES.2 HELPERS: the ledger row, the notice (the 0099 sio_notify idiom), the actor and proposer checks, the head, INPUT QUALIFICATION.
--   §ES.3 THE PORTS: declare_estimator / retire_estimator (twin.estimator.declare), propose_estimate (twin.estimate.propose), decide_estimate
--         (twin.estimate.decide), request_observations / cancel_observation_request (twin.observation.request), queue_estimation_triggers
--         (twin.estimation.trigger), and the invoker read estimation_pending.
--   §ES.4 PUBLICATION THROUGH THE EXISTING PORTS: the owner's approval opens, grounds and admits the new snapshot in ONE transaction under
--         twin.estimate.decide — twin.open_version and twin.ground_element (0092:628/696) and twin.admit_version (0032:458) RE-DECLARED,
--         copied whole, ONE change each (they also serve the bound action twin.estimate.decide; the B29 twin.coupling.apply precedent), and
--         the canonical write action twin.estimate.decide → TWN. (§BR's merge needs the same three ports for its own action: the integrator
--         folds both additions into one re-declaration each.)

-- ═════════════════════════════════════════════════════════════════════
-- section `estimation`
-- ═════════════════════════════════════════════════════════════════════

-- ============================================================
-- §ES.0 THE RECONCILIATION AGENT: its kind and its task (0092 §B.2 copied whole — B30 estimation: reconciliation / reconcile_scan)
-- ============================================================
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
  IF p_kind NOT IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal', 'risk', 'opportunity', /* B29 (0092) */ 'supply_chain', /* B30 estimation */ 'reconciliation') THEN RAISE EXCEPTION 'agent rejected: kind is decision, briefing, reporting, attention, weak_signal, risk, opportunity, supply_chain or reconciliation' USING ERRCODE = '22023'; END IF;
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
    -- B30 estimation: max_items on the reconcile scan too (the estimates one run proposes; the rest wait for the next run)
    IF (sc ->> 'kind') = 'max_items' AND p_kind NOT IN ('decision', 'briefing', 'weak_signal', /* B32 (0089) */ 'risk', 'opportunity', /* B29 (0092) */ 'supply_chain', /* B30 estimation */ 'reconciliation') THEN
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
  IF p_task NOT IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan', /* B32 (0089) */ 'risk_assess', 'opportunity_assess', /* B29 (0092) */ 'supply_scan', /* B30 estimation */ 'reconcile_scan') THEN RAISE EXCEPTION 'run rejected: task is draft, briefing, report or monitor (or attention_tick for an attention agent, signal_scan for a weak_signal agent, risk_assess for a risk agent, opportunity_assess for an opportunity agent, supply_scan for a supply_chain agent, reconcile_scan for a reconciliation agent)' USING ERRCODE = '22023'; END IF;
  IF (a.agent_kind = 'decision' AND p_task <> 'draft') OR (a.agent_kind = 'briefing' AND p_task NOT IN ('briefing', 'monitor')) OR (a.agent_kind = 'reporting' AND p_task <> 'report')
     OR (a.agent_kind = 'attention' AND p_task <> 'attention_tick') OR (a.agent_kind <> 'attention' AND p_task = 'attention_tick')
     -- B28 (0088 §S6): the weak-signal scan, run by a weak_signal agent and by no other kind
     OR (a.agent_kind = 'weak_signal' AND p_task <> 'signal_scan') OR (a.agent_kind <> 'weak_signal' AND p_task = 'signal_scan')
     -- B32 (0089): the risk estimate by a risk agent, the opportunity estimate by an opportunity agent, and by no other kind
     OR (a.agent_kind = 'risk' AND p_task <> 'risk_assess') OR (a.agent_kind <> 'risk' AND p_task = 'risk_assess')
     OR (a.agent_kind = 'opportunity' AND p_task <> 'opportunity_assess') OR (a.agent_kind <> 'opportunity' AND p_task = 'opportunity_assess')
     -- B29 (0092) §B: the supply scan by a supply_chain agent, and by no other kind
     OR (a.agent_kind = 'supply_chain' AND p_task <> 'supply_scan') OR (a.agent_kind <> 'supply_chain' AND p_task = 'supply_scan')
     -- B30 estimation: the reconcile scan by a reconciliation agent, and by no other kind
     OR (a.agent_kind = 'reconciliation' AND p_task <> 'reconcile_scan') OR (a.agent_kind <> 'reconciliation' AND p_task = 'reconcile_scan') THEN
    RAISE EXCEPTION 'run rejected: a % agent does not run the task %', a.agent_kind, p_task USING ERRCODE = '42501';
  END IF;
  INSERT INTO executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_principal_id, trigger_ref, room_id, package_id, budget, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, a.principal_id, a.agent_kind, a.agent_version, a.code_digest, p_task, p_trigger_kind, p_trigger_principal, p_trigger_ref, p_room_id, p_package_id, a.budgets, p_correlation);
  RETURN jsonb_build_object('run_id', p_run_id, 'budget', a.budgets, 'stop_conditions', a.stop_conditions, 'escalation_principal_id', a.escalation_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §ES.1 THE TABLES (schema twin, prefix tes_)
-- ============================================================
/* ESTIMATORS — declared per twin × key by the twin's owner; versioned (a re-declaration of the same name is version n+1, the prior
   superseded); one PRIMARY per twin × key (its candidate is the proposal), any number of CHALLENGERS (their candidates are kept beside it:
   the disagreement retained). The method and its parameters, the inputs (series of the domain or elements of the twin's head), the unit of
   the estimated element, the declared bounds (the RANGE rule), the materiality and ambiguity thresholds (relative), the constraint sets that
   validate it before publish (empty: every live set of the domain). */
CREATE TABLE twin.estimators (
  estimator_id         uuid NOT NULL,
  version              int  NOT NULL CHECK (version >= 1),
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  twin_id              uuid NOT NULL,
  key                  text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$'),
  name                 text NOT NULL CHECK (name ~ '^[a-z][a-z0-9-]{1,60}$'),
  role                 text NOT NULL CHECK (role IN ('primary', 'challenger')),
  method               text NOT NULL CHECK (method IN ('last_observation', 'moving_average', 'ratio_to_baseline', 'kalman_1d')),
  parameters           jsonb NOT NULL CHECK (jsonb_typeof(parameters) = 'object'),
  inputs               jsonb NOT NULL CHECK (jsonb_typeof(inputs) = 'array' AND jsonb_array_length(inputs) BETWEEN 1 AND 5),
  unit                 text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
  bounds               jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(bounds) = 'object'),
  materiality          numeric NOT NULL CHECK (materiality > 0 AND materiality <= 10),
  ambiguity            numeric NOT NULL CHECK (ambiguity > 0 AND ambiguity <= 10),
  constraint_sets      text[] NOT NULL DEFAULT '{}',
  owner_principal_id   uuid NOT NULL,
  digest               text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  note                 text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  state                text NOT NULL CHECK (state IN ('active', 'superseded', 'retired')),
  declared_by          uuid NOT NULL,
  declared_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_by             uuid,
  ended_at             timestamptz,
  end_reason           text,
  correlation_id       uuid NOT NULL,
  PRIMARY KEY (estimator_id, version),
  CONSTRAINT tes_estimator_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tes_estimator_ended CHECK ((state = 'active') = (ended_at IS NULL) AND (ended_at IS NULL) = (ended_by IS NULL))
);
CREATE UNIQUE INDEX tes_estimator_one_active ON twin.estimators (twin_id, key, name) WHERE state = 'active';
CREATE UNIQUE INDEX tes_estimator_one_primary ON twin.estimators (twin_id, key) WHERE state = 'active' AND role = 'primary';
CREATE INDEX tes_estimator_twin ON twin.estimators (twin_id, key, state);

/* ESTIMATES — CANDIDATE state: never a twin version, never an element of the active snapshot. Every active estimator's candidate kept
   (DISAGREEMENT RETAINED: the excluded ones with the reason, the spread stated); the qualification summary (the rows in
   input_qualifications); the constraint check before publish (the engine's verdict on the estimate's quantities as a run_input subject,
   the set versions pinned) and the range check (the primary's declared bounds); the materiality against the head's value. proposed →
   approved (the twin owner: a NEW SNAPSHOT, applied_version) | declined | superseded (a later proposal for the same twin × key). */
CREATE TABLE twin.estimates (
  estimate_id          uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  twin_id              uuid NOT NULL,
  key                  text NOT NULL,
  head_version         int,
  head_value           jsonb,
  head_unit            text,
  as_of                date NOT NULL,
  proposed_value       numeric NOT NULL,
  unit                 text NOT NULL,
  confidence           numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  primary_estimator    jsonb NOT NULL CHECK (jsonb_typeof(primary_estimator) = 'object'),
  candidates           jsonb NOT NULL CHECK (jsonb_typeof(candidates) = 'array' AND jsonb_array_length(candidates) >= 1),
  spread               jsonb NOT NULL CHECK (jsonb_typeof(spread) = 'object'),
  qualification        jsonb NOT NULL CHECK (jsonb_typeof(qualification) = 'object'),
  constraint_check     jsonb NOT NULL CHECK (jsonb_typeof(constraint_check) = 'object'),
  constraint_outcome   text NOT NULL CHECK (constraint_outcome IN ('satisfied', 'violated', 'indeterminate')),
  range_check          jsonb NOT NULL CHECK (jsonb_typeof(range_check) = 'object'),
  materiality          jsonb NOT NULL CHECK (jsonb_typeof(materiality) = 'object'),
  material             boolean NOT NULL,
  ambiguous            boolean NOT NULL,
  ambiguity_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  routed               boolean NOT NULL DEFAULT false,
  attention_item_id    uuid,
  evidence             jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  inputs_digest        text NOT NULL CHECK (inputs_digest ~ '^[0-9a-f]{64}$'),
  trigger              jsonb NOT NULL DEFAULT '{}'::jsonb,
  state                text NOT NULL CHECK (state IN ('proposed', 'approved', 'declined', 'superseded')),
  proposed_by          uuid NOT NULL,
  proposer_kind        text NOT NULL CHECK (proposer_kind IN ('human', 'agent')),
  agent_id             uuid,
  run_id               uuid,
  proposed_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by           uuid,
  decided_at           timestamptz,
  decision_note        text,
  applied_version      int,
  superseded_by        uuid,
  correlation_id       uuid NOT NULL,
  CONSTRAINT tes_estimate_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tes_estimate_agent CHECK ((proposer_kind = 'agent') = (agent_id IS NOT NULL AND run_id IS NOT NULL)),
  CONSTRAINT tes_estimate_decided CHECK (state NOT IN ('approved', 'declined') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT tes_estimate_applied CHECK ((state = 'approved') = (applied_version IS NOT NULL)),
  CONSTRAINT tes_estimate_declined CHECK (state <> 'declined' OR decision_note IS NOT NULL),
  CONSTRAINT tes_estimate_superseded CHECK ((state = 'superseded') = (superseded_by IS NOT NULL))
);
CREATE UNIQUE INDEX tes_estimate_one_open ON twin.estimates (twin_id, key) WHERE state = 'proposed';
CREATE INDEX tes_estimate_twin ON twin.estimates (twin_id, key, proposed_at);

/* INPUT QUALIFICATIONS — per estimate, per estimator, per input: the source's health now, the cadence (the input's latest point against the
   reference date — the head's world cut-off — and the declared cadence), the unit (the series' registered unit, or the element's, against
   the declared one), the truth state (the cited evidence's, or the element's kind), and the verdict. Estimation runs ONLY on qualified
   inputs: an estimator with a disqualified input contributes no candidate (it is kept, excluded, with the reason). Append-only. */
CREATE TABLE twin.input_qualifications (
  qualification_id     uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  estimate_id          uuid NOT NULL,
  estimator_id         uuid NOT NULL,
  estimator_version    int  NOT NULL,
  input_index          int  NOT NULL CHECK (input_index >= 0),
  input                jsonb NOT NULL,
  source_id            uuid,
  source_health        jsonb NOT NULL,
  cadence              jsonb NOT NULL,
  unit_check           jsonb NOT NULL,
  truth_state          jsonb NOT NULL,
  verdict              text NOT NULL CHECK (verdict IN ('qualified', 'disqualified')),
  reasons              jsonb NOT NULL DEFAULT '[]'::jsonb,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT tes_qual_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX tes_qual_estimate ON twin.input_qualifications (estimate_id, estimator_id, input_index);
CREATE TRIGGER tes_qual_append_only BEFORE UPDATE OR DELETE ON twin.input_qualifications FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* OBSERVATION REQUESTS (V02-T-013) — a request for new observations of a missing or stale input of a twin: through the COLLECTION SCHEDULER
   where the source is scheduled (the entry recorded with the request: its scheduler id and cadence — the next collection answers it), else
   an attention item (twin.observation_request) to the source's steward (its approver), else the twin's owner. open → fulfilled (a new
   evidence version of the source recorded after the request — found by the after-tick check) | cancelled. One open request per twin × input. */
CREATE TABLE twin.observation_requests (
  request_id           uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  twin_id              uuid NOT NULL,
  key                  text,
  estimator_id         uuid,
  input                jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  input_ref            text NOT NULL CHECK (input_ref ~ '^(series|element):.{1,200}$'),
  source_id            uuid,
  reason_class         text NOT NULL CHECK (reason_class IN ('missing', 'stale', 'disqualified')),
  note                 text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  via                  text NOT NULL CHECK (via IN ('scheduler', 'attention')),
  scheduler            jsonb,
  attention_item_id    uuid,
  routed_to            uuid,
  state                text NOT NULL CHECK (state IN ('open', 'fulfilled', 'cancelled')),
  requested_by         uuid NOT NULL,
  requester_kind       text NOT NULL CHECK (requester_kind IN ('human', 'agent')),
  agent_id             uuid,
  run_id               uuid,
  requested_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at            timestamptz,
  closed_by            uuid,
  closure              jsonb,
  correlation_id       uuid NOT NULL,
  CONSTRAINT tes_req_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tes_req_via CHECK ((via = 'scheduler') = (scheduler IS NOT NULL)),
  CONSTRAINT tes_req_closed CHECK ((state = 'open') = (closed_at IS NULL))
);
CREATE UNIQUE INDEX tes_req_one_open ON twin.observation_requests (twin_id, input_ref) WHERE state = 'open';

/* THE LEDGER — every act of the estimation lifecycle, its own table (the pinned twin_events lists are not touched): an estimator declared,
   superseded or retired; an estimate proposed, routed, superseded, approved (with the snapshot it opened) or declined; a trigger queued
   (telemetry: a new evidence version of an input's source; internal_change: an upstream twin's admitted version; ontology_revision: the
   domain's ontology activated anew) and consumed (by a proposal for the twin × key); an observation requested, fulfilled or cancelled. */
CREATE TABLE twin.estimation_events (
  event_id             uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  twin_id              uuid NOT NULL,
  key                  text,
  estimator_id         uuid,
  estimate_id          uuid,
  request_id           uuid,
  event                text NOT NULL CHECK (event IN ('estimator.declared', 'estimator.superseded', 'estimator.retired',
                                                      'estimate.proposed', 'estimate.routed', 'estimate.superseded', 'estimate.approved', 'estimate.declined',
                                                      'trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision', 'trigger.consumed',
                                                      'observation.requested', 'observation.fulfilled', 'observation.cancelled')),
  actor_principal_id   uuid,
  details              jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT tes_evt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX tes_evt_twin ON twin.estimation_events (twin_id, key, event, occurred_at);
CREATE INDEX tes_evt_estimator ON twin.estimation_events (estimator_id, event, occurred_at);
CREATE TRIGGER tes_evt_append_only BEFORE UPDATE OR DELETE ON twin.estimation_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* Forward-only rows: an estimator moves active → superseded | retired once (its ended_* written); an estimate proposed → approved | declined
   | superseded once (the decision columns, the routing written at proposal); a request open → fulfilled | cancelled once. Nothing else of a
   row changes; nothing is deleted. */
CREATE OR REPLACE FUNCTION twin.tes_forward() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_free text[];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are append-only: DELETE prohibited', TG_TABLE_NAME USING ERRCODE = '2F002'; END IF;
  IF TG_TABLE_NAME = 'estimators' THEN
    IF OLD.state <> 'active' OR NEW.state = 'active' THEN RAISE EXCEPTION 'estimator % v% is %; an estimator is ended once and never rewritten', OLD.estimator_id, OLD.version, OLD.state USING ERRCODE = '2F002'; END IF;
    v_free := ARRAY['state', 'ended_by', 'ended_at', 'end_reason'];
  ELSIF TG_TABLE_NAME = 'estimates' THEN
    IF OLD.state <> 'proposed' OR NEW.state = 'proposed' THEN RAISE EXCEPTION 'estimate % is %; an estimate is decided once and never rewritten', OLD.estimate_id, OLD.state USING ERRCODE = '2F002'; END IF;
    v_free := ARRAY['state', 'decided_by', 'decided_at', 'decision_note', 'applied_version', 'superseded_by'];
  ELSE
    IF OLD.state <> 'open' OR NEW.state = 'open' THEN RAISE EXCEPTION 'observation request % is %; a request is closed once and never rewritten', OLD.request_id, OLD.state USING ERRCODE = '2F002'; END IF;
    v_free := ARRAY['state', 'closed_at', 'closed_by', 'closure'];
  END IF;
  IF (to_jsonb(NEW) - v_free) <> (to_jsonb(OLD) - v_free) THEN
    RAISE EXCEPTION '% row is closed by its state columns only; nothing else of it changes', TG_TABLE_NAME USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.tes_forward() FROM PUBLIC;
CREATE TRIGGER tes_estimator_forward BEFORE UPDATE OR DELETE ON twin.estimators FOR EACH ROW EXECUTE FUNCTION twin.tes_forward();
CREATE TRIGGER tes_estimate_forward BEFORE UPDATE OR DELETE ON twin.estimates FOR EACH ROW EXECUTE FUNCTION twin.tes_forward();
CREATE TRIGGER tes_req_forward BEFORE UPDATE OR DELETE ON twin.observation_requests FOR EACH ROW EXECUTE FUNCTION twin.tes_forward();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['estimators', 'estimates', 'input_qualifications', 'observation_requests', 'estimation_events'] LOOP
    EXECUTE format('ALTER TABLE twin.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE twin.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY twin_isolation ON twin.%I USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);  -- the 0032:634-639 idiom
    EXECUTE format('REVOKE ALL ON twin.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON twin.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- §ES.2 HELPERS
-- ============================================================
/* The ledger row. */
CREATE OR REPLACE FUNCTION twin.tes_event(p_tenant uuid, p_domain uuid, p_twin uuid, p_key text, p_estimator uuid, p_estimate uuid, p_request uuid, p_event text,
                                          p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO twin.estimation_events (event_id, scope, tenant_id, domain_id, twin_id, key, estimator_id, estimate_id, request_id, event, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', p_tenant, p_domain, p_twin, p_key, p_estimator, p_estimate, p_request, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.tes_event(uuid, uuid, uuid, text, uuid, uuid, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The NOTICE (the 0099 sio_notify idiom): an attention item of the class, owned by a person (open when an active human, else unrouted);
   its cause the estimation_events row. */
CREATE OR REPLACE FUNCTION twin.tes_notify(p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject uuid, p_title text, p_reasons jsonb, p_owner uuid,
                                           p_cause_event uuid, p_details jsonb, p_due interval, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + p_due;
BEGIN
  v_state := CASE WHEN p_owner IS NOT NULL AND decision.is_active_human(p_owner, p_tenant) THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, p_class, p_subject_kind, p_subject, p_cause_event, 'twin.estimation_events', left(p_title, 512), 'material', v_state, p_owner, '{}',
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          coalesce(p_details, '{}'::jsonb), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', p_owner, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                               'cause_event_id', p_cause_event, 'cause_event_type', 'twin.estimation_events', 'unrouted', v_state = 'unrouted'), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.tes_notify(uuid, uuid, text, text, uuid, text, jsonb, uuid, uuid, jsonb, interval, uuid, uuid) FROM PUBLIC;

/* The acting principal is the context's (every port). */
CREATE OR REPLACE FUNCTION twin.tes_assert_actor(p_noun text, p_actor uuid) RETURNS void
SET search_path = twin, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501'; END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.tes_assert_actor(text, uuid) FROM PUBLIC;

/* Whether the acting principal is an agent; when it is, it must be the domain's active Reconciliation Agent inside its own running
   reconcile_scan (the Supply Chain Agent's rule, 0092 §B.3) — a person names no agent and no run. Answers the proposer kind. */
CREATE OR REPLACE FUNCTION twin.tes_proposer_kind(p_noun text, p_tenant uuid, p_domain uuid, p_actor uuid, p_agent uuid, p_run uuid) RETURNS text
SECURITY DEFINER SET search_path = twin, executive, identity, pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'agent') THEN
    IF NOT EXISTS (SELECT 1 FROM executive.agents a WHERE a.agent_id = p_agent AND a.principal_id = p_actor AND a.tenant_id = p_tenant AND a.domain_id = p_domain
                     AND a.agent_kind = 'reconciliation' AND a.status = 'active') THEN
      RAISE EXCEPTION '% rejected (actor): an agent acts here only as the domain''s active Reconciliation Agent, under its own session', p_noun USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM executive.agent_runs r WHERE r.run_id = p_run AND r.agent_id = p_agent AND r.task = 'reconcile_scan' AND r.outcome = 'running') THEN
      RAISE EXCEPTION '% rejected (actor): run % is not this agent''s running reconcile scan', p_noun, p_run USING ERRCODE = '42501';
    END IF;
    RETURN 'agent';
  END IF;
  IF p_agent IS NOT NULL OR p_run IS NOT NULL THEN RAISE EXCEPTION '% rejected (actor): a person names no agent and no agent run', p_noun USING ERRCODE = '42501'; END IF;
  RETURN 'human';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.tes_proposer_kind(text, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;

/* The twin's head on `actual`: the latest admitted version (NULL when none). */
CREATE OR REPLACE FUNCTION twin.tes_head(p_twin uuid) RETURNS twin.twin_versions
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT v.* FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.branch_id = 'actual' AND v.state = 'admitted' ORDER BY v.version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION twin.tes_head(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.tes_head(uuid) TO eye_app, eye_commit;

/*
 * INPUT QUALIFICATION (an INVOKER read — the tables' row security decides what it sees; the propose port calls the same function, so the
 * verdict the page shows and the verdict the port records are one rule). Per input of one estimator version, against the REFERENCE DATE (the
 * head's world cut-off, else the database's day):
 *   series   the series registered in the domain; its source (the contract carrying the series' source key); the SOURCE HEALTH now
 *            (observation.source_health_now: healthy — degraded only when the input accepts it; failed, suspended, unknown disqualify);
 *            the UNIT (the registered unit = the declared one — never converted); the TRUTH STATE (every cited evidence version is an
 *            EVD of that source, readable, its truth state among the input's allowed ones, default observed); the CADENCE (the latest
 *            point no older than cadence_days × tolerance before the reference date; no unreadable evidence; at least one point).
 *            The facts the database cannot know (the parsed points' latest date and count, the evidence versions read, the unreadable
 *            count) come from the caller's series assembly: { index, points, last_date, evidence: [{id, version}], unreadable }.
 *   element  the head's element of that key: complete health, the declared unit, an observed or estimated kind (or the input's allowed
 *            kinds), and its valid_to (else valid_from) no older than max_age_days before the reference date.
 * Answers [{ index, input, source_id, source_health, cadence, unit_check, truth_state, verdict, reasons }].
 */
CREATE OR REPLACE FUNCTION twin.tes_qualify(p_tenant uuid, p_domain uuid, p_estimator_id uuid, p_version int, p_facts jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = twin, prediction, observation, objects, public, pg_catalog, pg_temp AS $$
DECLARE e twin.estimators%ROWTYPE; h twin.twin_versions%ROWTYPE; v_ref date; i int; inp jsonb; f jsonb; v_out jsonb := '[]'::jsonb;
        v_reasons jsonb; v_series prediction.series_registry%ROWTYPE; v_source uuid; v_health jsonb; v_cadence jsonb; v_unit jsonb; v_truth jsonb;
        v_last date; v_lag int; v_cad numeric; v_tol numeric; v_allowed text[]; v_bad int; v_n int; v_el twin.state_elements%ROWTYPE; v_age_ref date;
BEGIN
  SELECT * INTO e FROM twin.estimators x WHERE x.estimator_id = p_estimator_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN NULL; END IF;
  h := twin.tes_head(e.twin_id);
  v_ref := coalesce(h.observed_through, (clock_timestamp() AT TIME ZONE 'UTC')::date);
  FOR i IN 0 .. jsonb_array_length(e.inputs) - 1 LOOP
    inp := e.inputs -> i; v_reasons := '[]'::jsonb; v_source := NULL; f := NULL;
    v_health := jsonb_build_object('state', 'not_applicable'); v_cadence := '{}'::jsonb; v_unit := '{}'::jsonb; v_truth := '{}'::jsonb;
    SELECT x INTO f FROM jsonb_array_elements(coalesce(p_facts, '[]'::jsonb)) x WHERE (x ->> 'index')::int = i LIMIT 1;
    IF inp ->> 'kind' = 'series' THEN
      SELECT * INTO v_series FROM prediction.series_registry s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.series_key = inp ->> 'series_key';
      IF NOT FOUND THEN
        v_reasons := v_reasons || to_jsonb(format('series %s is not registered in this domain', inp ->> 'series_key'));
      ELSE
        SELECT c.source_id INTO v_source FROM observation.source_contracts_current c
         WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = v_series.source_key
         ORDER BY (c.lifecycle_state = 'active') DESC, c.contract_version DESC LIMIT 1;
        IF v_source IS NULL THEN
          v_reasons := v_reasons || to_jsonb(format('no source contract carries the series'' source key %s', v_series.source_key));
        ELSE
          v_health := observation.source_health_now(p_tenant, p_domain, v_source);
          IF NOT (v_health ->> 'state' = 'healthy' OR (v_health ->> 'state' = 'degraded' AND coalesce((inp ->> 'accept_degraded')::boolean, false))) THEN
            v_reasons := v_reasons || to_jsonb(format('source health is %s (%s)', v_health ->> 'state', coalesce(v_health ->> 'basis', 'none')));
          END IF;
        END IF;
        v_unit := jsonb_build_object('declared', inp ->> 'unit', 'actual', v_series.unit, 'verdict', CASE WHEN v_series.unit = inp ->> 'unit' THEN 'match' ELSE 'mismatch' END);
        IF v_series.unit IS DISTINCT FROM inp ->> 'unit' THEN
          v_reasons := v_reasons || to_jsonb(format('unit mismatch: the series is in %s, the input declares %s (never converted)', v_series.unit, inp ->> 'unit'));
        END IF;
      END IF;
      v_allowed := coalesce(ARRAY(SELECT jsonb_array_elements_text(inp -> 'truth_states')), ARRAY['observed']);
      IF cardinality(v_allowed) = 0 THEN v_allowed := ARRAY['observed']; END IF;
      v_n := coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(f -> 'evidence') = 'array' THEN f -> 'evidence' ELSE '[]'::jsonb END), 0);
      SELECT count(*) INTO v_bad FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f -> 'evidence') = 'array' THEN f -> 'evidence' ELSE '[]'::jsonb END) c
       WHERE NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
                          WHERE o.object_type = 'EVD' AND o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int
                            AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND v_source IS NOT NULL AND o.provenance_ref LIKE 'SRC:' || v_source::text || '@%'
                            AND o.lifecycle_state NOT IN ('withdrawn', 'retired') AND o.truth_state = ANY (v_allowed));
      v_truth := jsonb_build_object('allowed', to_jsonb(v_allowed), 'evidence', v_n, 'not_admissible', v_bad, 'verdict', CASE WHEN v_n > 0 AND v_bad = 0 THEN 'admissible' ELSE 'inadmissible' END);
      IF v_n = 0 THEN v_reasons := v_reasons || to_jsonb('no evidence version of the series was read'::text);
      ELSIF v_bad > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s cited evidence version(s) are not readable %s evidence of the series'' source', v_bad, array_to_string(v_allowed, '/'))); END IF;
      v_last := CASE WHEN coalesce(f ->> 'last_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (f ->> 'last_date')::date END;
      v_cad := coalesce((inp ->> 'cadence_days')::numeric, 1); v_tol := coalesce((inp ->> 'cadence_tolerance')::numeric, 2);
      v_lag := CASE WHEN v_last IS NULL THEN NULL ELSE v_ref - v_last END;
      v_cadence := jsonb_build_object('reference_date', v_ref, 'last_point', v_last, 'points', coalesce((f ->> 'points')::int, 0), 'lag_days', v_lag,
                                      'cadence_days', v_cad, 'tolerance', v_tol, 'unreadable', coalesce((f ->> 'unreadable')::int, 0),
                                      'verdict', CASE WHEN v_last IS NULL THEN 'missing' WHEN v_lag > v_cad * v_tol THEN 'stale' ELSE 'on_cadence' END);
      IF v_last IS NULL OR coalesce((f ->> 'points')::int, 0) < 1 THEN v_reasons := v_reasons || to_jsonb('the series has no point under its cut-offs (missing)'::text);
      ELSIF v_lag > v_cad * v_tol THEN v_reasons := v_reasons || to_jsonb(format('stale: the latest point %s is %s day(s) before the reference date %s; the cadence allows %s', v_last, v_lag, v_ref, v_cad * v_tol)); END IF;
      IF coalesce((f ->> 'unreadable')::int, 0) > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s evidence version(s) of the series could not be read', (f ->> 'unreadable')::int)); END IF;
    ELSE
      v_allowed := coalesce(ARRAY(SELECT jsonb_array_elements_text(inp -> 'kinds')), ARRAY['observed', 'estimated']);
      IF cardinality(v_allowed) = 0 THEN v_allowed := ARRAY['observed', 'estimated']; END IF;
      IF h.version IS NULL THEN
        v_reasons := v_reasons || to_jsonb('the twin has no admitted version on actual (missing)'::text);
      ELSE
        SELECT * INTO v_el FROM twin.state_elements x WHERE x.twin_id = e.twin_id AND x.version = h.version AND x.key = inp ->> 'key';
        IF NOT FOUND THEN
          v_reasons := v_reasons || to_jsonb(format('the head (v%s) has no element %s (missing)', h.version, inp ->> 'key'));
        ELSE
          IF v_el.health <> 'complete' THEN v_reasons := v_reasons || to_jsonb(format('element %s is %s', v_el.key, v_el.health)); END IF;
          v_unit := jsonb_build_object('declared', inp ->> 'unit', 'actual', v_el.unit, 'verdict', CASE WHEN inp ->> 'unit' IS NULL OR v_el.unit = inp ->> 'unit' THEN 'match' ELSE 'mismatch' END);
          IF inp ->> 'unit' IS NOT NULL AND v_el.unit IS DISTINCT FROM inp ->> 'unit' THEN v_reasons := v_reasons || to_jsonb(format('unit mismatch: element %s is in %s, the input declares %s', v_el.key, v_el.unit, inp ->> 'unit')); END IF;
          v_truth := jsonb_build_object('allowed', to_jsonb(v_allowed), 'kind', v_el.kind, 'basis_truth_state', v_el.basis_truth_state, 'verdict', CASE WHEN v_el.kind = ANY (v_allowed) THEN 'admissible' ELSE 'inadmissible' END);
          IF NOT (v_el.kind = ANY (v_allowed)) THEN v_reasons := v_reasons || to_jsonb(format('element %s is %s, not %s', v_el.key, v_el.kind, array_to_string(v_allowed, ' or '))); END IF;
          v_age_ref := coalesce(v_el.valid_to, v_el.valid_from);
          v_lag := CASE WHEN v_age_ref IS NULL THEN NULL ELSE v_ref - v_age_ref END;
          v_cad := coalesce((inp ->> 'max_age_days')::numeric, 30);
          v_cadence := jsonb_build_object('reference_date', v_ref, 'valid_through', v_age_ref, 'lag_days', v_lag, 'max_age_days', v_cad,
                                          'verdict', CASE WHEN v_lag IS NOT NULL AND v_lag > v_cad THEN 'stale' ELSE 'on_cadence' END);
          IF v_lag IS NOT NULL AND v_lag > v_cad THEN v_reasons := v_reasons || to_jsonb(format('stale: element %s holds through %s, %s day(s) before %s; at most %s allowed', v_el.key, v_age_ref, v_lag, v_ref, v_cad)); END IF;
        END IF;
      END IF;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('index', i, 'input', inp, 'source_id', v_source, 'source_health', v_health, 'cadence', v_cadence, 'unit_check', v_unit,
                                                           'truth_state', v_truth, 'verdict', CASE WHEN jsonb_array_length(v_reasons) = 0 THEN 'qualified' ELSE 'disqualified' END, 'reasons', v_reasons));
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION twin.tes_qualify(uuid, uuid, uuid, int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.tes_qualify(uuid, uuid, uuid, int, jsonb) TO eye_app, eye_commit;

-- ============================================================
-- §ES.3 THE PORTS
-- ============================================================
/*
 * DECLARE an estimator (twin.estimator.declare): the twin's OWNER declares — or re-declares, as version n+1 superseding the active one of
 * the same name — a method over inputs for one key of the twin. The declaration is validated here (the method's parameters, the inputs,
 * the bounds, the thresholds) and digested; one PRIMARY per twin × key (a second primary is refused while the first is active: declare it a
 * challenger, or retire the primary). Nothing of the twin is written.
 */
CREATE OR REPLACE FUNCTION twin.declare_estimator(
  p_estimator_id uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_key text, p_name text, p_role text, p_method text, p_parameters jsonb, p_inputs jsonb,
  p_unit text, p_bounds jsonb, p_materiality numeric, p_ambiguity numeric, p_constraint_sets text[], p_note text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; prior twin.estimators%ROWTYPE; v_id uuid := p_estimator_id; v_version int := 1; v_digest text; inp jsonb; i int;
        v_primary twin.estimators%ROWTYPE; p jsonb := coalesce(p_parameters, '{}'::jsonb); b jsonb := coalesce(p_bounds, '{}'::jsonb); v_event uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimator.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimator', p_actor);
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimator rejected (unknown_twin): % is not a twin of this domain', p_twin USING ERRCODE = '23503'; END IF;
  IF t.owner_principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'estimator rejected (ownership): an estimator of twin % is declared by the twin''s owner', p_twin USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' THEN RAISE EXCEPTION 'estimator rejected (key): the key names a twin element (like corridor.capacity_share)' USING ERRCODE = '22023'; END IF;
  IF p_name IS NULL OR p_name !~ '^[a-z][a-z0-9-]{1,60}$' THEN RAISE EXCEPTION 'estimator rejected (name): the name is 2–61 lower-case letters, digits and dashes' USING ERRCODE = '22023'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('primary', 'challenger') THEN RAISE EXCEPTION 'estimator rejected (role): an estimator is the primary or a challenger' USING ERRCODE = '22023'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('last_observation', 'moving_average', 'ratio_to_baseline', 'kalman_1d') THEN
    RAISE EXCEPTION 'estimator rejected (method): the method is last_observation, moving_average, ratio_to_baseline or kalman_1d' USING ERRCODE = '22023';
  END IF;
  -- the method's parameters (the TypeScript methods read exactly these): window (points), baseline (> 0, in the input's unit), scale (> 0), the Kalman variances
  IF jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'estimator rejected (parameters): parameters is an object' USING ERRCODE = '22023'; END IF;
  IF p ? 'window' AND (jsonb_typeof(p -> 'window') <> 'number' OR (p ->> 'window')::numeric <> floor((p ->> 'window')::numeric) OR (p ->> 'window')::int NOT BETWEEN 1 AND 365) THEN
    RAISE EXCEPTION 'estimator rejected (parameters): window is a whole number of points in [1, 365]' USING ERRCODE = '22023';
  END IF;
  IF p_method = 'moving_average' AND NOT (p ? 'window' AND (p ->> 'window')::int >= 2) THEN RAISE EXCEPTION 'estimator rejected (parameters): a moving average names its window (at least 2 points)' USING ERRCODE = '22023'; END IF;
  IF p ? 'baseline' AND (jsonb_typeof(p -> 'baseline') <> 'number' OR (p ->> 'baseline')::numeric <= 0) THEN RAISE EXCEPTION 'estimator rejected (parameters): baseline is a positive number in the input''s unit' USING ERRCODE = '22023'; END IF;
  IF p_method = 'ratio_to_baseline' AND NOT p ? 'baseline' THEN RAISE EXCEPTION 'estimator rejected (parameters): a ratio to baseline names its baseline' USING ERRCODE = '22023'; END IF;
  IF p ? 'scale' AND (jsonb_typeof(p -> 'scale') <> 'number' OR (p ->> 'scale')::numeric <= 0) THEN RAISE EXCEPTION 'estimator rejected (parameters): scale is a positive number (100 states a ratio in per cent)' USING ERRCODE = '22023'; END IF;
  IF p_method = 'kalman_1d' AND NOT (jsonb_typeof(p -> 'process_variance') = 'number' AND (p ->> 'process_variance')::numeric > 0
                                     AND jsonb_typeof(p -> 'measurement_variance') = 'number' AND (p ->> 'measurement_variance')::numeric > 0) THEN
    RAISE EXCEPTION 'estimator rejected (parameters): a Kalman filter names its process_variance and measurement_variance (both > 0)' USING ERRCODE = '22023';
  END IF;
  IF p ? 'balance_stock' AND (jsonb_typeof(p -> 'balance_stock') <> 'string' OR (p ->> 'balance_stock') !~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,120}$') THEN
    RAISE EXCEPTION 'estimator rejected (parameters): balance_stock names the stock the estimate''s balance is checked under' USING ERRCODE = '22023';
  END IF;
  IF p_inputs IS NULL OR jsonb_typeof(p_inputs) <> 'array' OR jsonb_array_length(p_inputs) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'estimator rejected (inputs): inputs lists 1 to 5 series or elements (the first is the measured one)' USING ERRCODE = '22023';
  END IF;
  FOR i IN 0 .. jsonb_array_length(p_inputs) - 1 LOOP
    inp := p_inputs -> i;
    IF jsonb_typeof(inp) <> 'object' OR coalesce(inp ->> 'kind', '') NOT IN ('series', 'element') THEN RAISE EXCEPTION 'estimator rejected (inputs): input % is a series or an element', i USING ERRCODE = '22023'; END IF;
    IF inp ->> 'kind' = 'series' AND (coalesce(inp ->> 'series_key', '') = '' OR length(inp ->> 'series_key') > 200 OR coalesce(length(btrim(inp ->> 'unit')), 0) = 0
                                      OR jsonb_typeof(inp -> 'cadence_days') IS DISTINCT FROM 'number' OR (inp ->> 'cadence_days')::numeric <= 0) THEN
      RAISE EXCEPTION 'estimator rejected (inputs): series input % names its series_key, its unit and its cadence_days (> 0)', i USING ERRCODE = '22023';
    END IF;
    IF inp ->> 'kind' = 'element' AND coalesce(inp ->> 'key', '') !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' THEN
      RAISE EXCEPTION 'estimator rejected (inputs): element input % names the key of the twin''s element', i USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_inputs -> 0 ->> 'kind' <> 'series' AND p_method <> 'last_observation' THEN
    RAISE EXCEPTION 'estimator rejected (inputs): the first input of a % estimator is a series (its points are what the method reads)', p_method USING ERRCODE = '22023';
  END IF;
  IF p_unit IS NULL OR length(btrim(p_unit)) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'estimator rejected (unit): the estimated element''s unit is stated' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(b) <> 'object' OR (b ? 'min' AND jsonb_typeof(b -> 'min') <> 'number') OR (b ? 'max' AND jsonb_typeof(b -> 'max') <> 'number')
     OR (b ? 'min' AND b ? 'max' AND (b ->> 'min')::numeric > (b ->> 'max')::numeric) THEN
    RAISE EXCEPTION 'estimator rejected (bounds): bounds is { min?, max? } with min ≤ max' USING ERRCODE = '22023';
  END IF;
  IF p_materiality IS NULL OR p_materiality <= 0 OR p_materiality > 10 OR p_ambiguity IS NULL OR p_ambiguity <= 0 OR p_ambiguity > 10 THEN
    RAISE EXCEPTION 'estimator rejected (thresholds): materiality and ambiguity are relative thresholds in (0, 10]' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_note)), 0) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'estimator rejected (note): the declaration says why (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_constraint_sets, '{}')) k WHERE k !~ '^[a-z][a-z0-9-]{2,60}$') THEN
    RAISE EXCEPTION 'estimator rejected (constraint_sets): constraint_sets lists set keys' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO prior FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.name = p_name AND x.state = 'active' FOR UPDATE;
  IF FOUND THEN v_id := prior.estimator_id; v_version := prior.version + 1; END IF;
  IF p_role = 'primary' THEN
    SELECT * INTO v_primary FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.role = 'primary' AND x.state = 'active' AND x.name <> p_name;
    IF FOUND THEN
      RAISE EXCEPTION 'estimator rejected (duplicate): % is the primary estimator of % on this twin; declare this one a challenger, or retire it first', v_primary.name, p_key USING ERRCODE = '23505';
    END IF;
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('twin', p_twin, 'key', p_key, 'name', p_name, 'role', p_role, 'method', p_method, 'parameters', p,
                                                          'inputs', p_inputs, 'unit', p_unit, 'bounds', b, 'materiality', p_materiality, 'ambiguity', p_ambiguity,
                                                          'constraint_sets', to_jsonb(coalesce(p_constraint_sets, '{}')))::text, 'UTF8')), 'hex');
  IF prior.estimator_id IS NOT NULL THEN
    IF prior.digest = v_digest THEN
      RAISE EXCEPTION 'estimator rejected (duplicate): % v% already declares exactly this', p_name, prior.version USING ERRCODE = '23505';
    END IF;
    UPDATE twin.estimators SET state = 'superseded', ended_by = p_actor, ended_at = clock_timestamp(), end_reason = format('superseded by version %s', v_version)
     WHERE estimator_id = prior.estimator_id AND version = prior.version;
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, prior.estimator_id, NULL, NULL, 'estimator.superseded', p_actor, jsonb_build_object('version', prior.version, 'by_version', v_version), p_correlation);
  END IF;
  INSERT INTO twin.estimators (estimator_id, version, scope, tenant_id, domain_id, twin_id, key, name, role, method, parameters, inputs, unit, bounds, materiality, ambiguity,
                               constraint_sets, owner_principal_id, digest, note, state, declared_by, correlation_id)
  VALUES (v_id, v_version, 'DOMAIN', p_tenant, p_domain, p_twin, p_key, p_name, p_role, p_method, p, p_inputs, btrim(p_unit), b, p_materiality, p_ambiguity,
          coalesce(p_constraint_sets, '{}'), t.owner_principal_id, v_digest, btrim(p_note), 'active', p_actor, p_correlation);
  v_event := twin.tes_event(p_tenant, p_domain, p_twin, p_key, v_id, NULL, NULL, 'estimator.declared', p_actor,
                            jsonb_build_object('version', v_version, 'name', p_name, 'role', p_role, 'method', p_method, 'digest', v_digest, 'supersedes', prior.version), p_correlation);
  RETURN jsonb_build_object('estimator_id', v_id, 'version', v_version, 'twin_id', p_twin, 'key', p_key, 'name', p_name, 'role', p_role, 'method', p_method, 'digest', v_digest,
                            'supersedes', prior.version, 'event_id', v_event);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.declare_estimator(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,text,jsonb,numeric,numeric,text[],text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.declare_estimator(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,text,jsonb,numeric,numeric,text[],text,uuid,uuid) TO eye_commit;

/* RETIRE an estimator (twin.estimator.declare): the twin's owner ends its active version with a reason. */
CREATE OR REPLACE FUNCTION twin.retire_estimator(p_estimator_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e twin.estimators%ROWTYPE; v_owner uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimator.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimator', p_actor);
  SELECT * INTO e FROM twin.estimators x WHERE x.estimator_id = p_estimator_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.version DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimator rejected (unknown_estimator): % is not an estimator of this domain', p_estimator_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = e.twin_id;
  IF v_owner IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'estimator rejected (ownership): an estimator is retired by the twin''s owner' USING ERRCODE = '42501'; END IF;
  IF e.state <> 'active' THEN RAISE EXCEPTION 'estimator rejected (state): estimator % v% is %', e.name, e.version, e.state USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'estimator rejected (reason): a retirement says why (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE twin.estimators SET state = 'retired', ended_by = p_actor, ended_at = clock_timestamp(), end_reason = btrim(p_reason) WHERE estimator_id = e.estimator_id AND version = e.version;
  PERFORM twin.tes_event(p_tenant, p_domain, e.twin_id, e.key, e.estimator_id, NULL, NULL, 'estimator.retired', p_actor, jsonb_build_object('version', e.version, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('estimator_id', e.estimator_id, 'version', e.version, 'state', 'retired');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.retire_estimator(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.retire_estimator(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/*
 * PROPOSE an estimate (twin.estimate.propose): a person, or the domain's Reconciliation Agent in its running reconcile_scan, states every
 * active estimator's candidate for one twin × key, computed (twin/estimation/estimators.ts) from the inputs' facts; the port:
 *   1. QUALIFIES every input of every estimator (twin.tes_qualify — the source health, the cadence, the unit, the truth state): an estimator
 *      with a disqualified input contributes no candidate (a value offered for it is refused), the primary's must qualify;
 *   2. keeps EVERY candidate (disagreement retained — the excluded with their reason) and states the spread;
 *   3. records the CONSTRAINT CHECK the caller ran BEFORE publishing (the engine's verdict on the estimate's quantities, a run_input subject,
 *      its set versions pinned) and judges the RANGE (the primary's bounds) and the MATERIALITY against the head's value;
 *   4. supersedes the open proposal of the same twin × key; records the qualification rows and the ledger; consumes the pending triggers;
 *   5. ROUTES a material or ambiguous change to the twin's owner (twin.reconciliation, subject twin_estimate).
 * Nothing of the twin is written: the estimate is candidate state; only the owner's approval opens a snapshot.
 */
CREATE OR REPLACE FUNCTION twin.propose_estimate(
  p_estimate_id uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_key text, p_facts jsonb, p_candidates jsonb, p_constraint jsonb, p_trigger jsonb,
  p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, executive, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; h twin.twin_versions%ROWTYPE; v_kind text; e twin.estimators%ROWTYPE; pe twin.estimators%ROWTYPE; v_q jsonb; q jsonb; c jsonb;
        v_quals jsonb := '[]'::jsonb; v_cands jsonb := '[]'::jsonb; v_disq boolean; v_value numeric; v_primary jsonb; v_head_el twin.state_elements%ROWTYPE; v_head_value numeric;
        v_vals numeric[] := '{}'; v_min numeric; v_max numeric; v_spread jsonb; v_rel numeric; v_range jsonb; v_outcome text; v_mat jsonb; v_material boolean;
        v_amb_reasons jsonb := '[]'::jsonb; v_prior twin.estimates%ROWTYPE; v_evidence jsonb := '[]'::jsonb; v_digest text; v_as_of date; v_conf numeric;
        v_item uuid; v_event uuid; v_through timestamptz; v_consumed jsonb; v_n_q int := 0; v_n_d int := 0; ev jsonb; v_allowed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimate.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimate', p_actor);
  v_kind := twin.tes_proposer_kind('estimate', p_tenant, p_domain, p_actor, p_agent, p_run);
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate rejected (unknown_twin): % is not a twin of this domain', p_twin USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'active') THEN
    RAISE EXCEPTION 'estimate rejected (unknown_estimator): no active estimator is declared for % on twin %', p_key, p_twin USING ERRCODE = '23503';
  END IF;
  SELECT * INTO pe FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'active' AND x.role = 'primary';
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate rejected (state): % on twin % has challengers but no primary estimator; the owner declares one', p_key, p_twin USING ERRCODE = '22023'; END IF;
  IF p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array' THEN RAISE EXCEPTION 'estimate rejected (candidates): candidates is an array' USING ERRCODE = '22023'; END IF;
  IF p_constraint IS NULL OR jsonb_typeof(p_constraint) <> 'object' OR coalesce(p_constraint ->> 'outcome', '') NOT IN ('satisfied', 'violated', 'indeterminate')
     OR jsonb_typeof(p_constraint -> 'pins') IS DISTINCT FROM 'array' OR jsonb_typeof(p_constraint -> 'violations') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'estimate rejected (constraint): the constraint check before publish is stated — { outcome, pins, violations } from the engine' USING ERRCODE = '22023';
  END IF;
  h := twin.tes_head(p_twin);
  -- 1 + 2: qualification and the candidates, estimator by estimator (the primary first)
  FOR e IN SELECT * FROM twin.estimators x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'active' ORDER BY (x.role = 'primary') DESC, x.name LOOP
    c := NULL;
    v_q := twin.tes_qualify(p_tenant, p_domain, e.estimator_id, e.version, coalesce(p_facts -> e.estimator_id::text, '[]'::jsonb));
    v_disq := EXISTS (SELECT 1 FROM jsonb_array_elements(v_q) z WHERE z ->> 'verdict' = 'disqualified');
    v_quals := v_quals || jsonb_build_array(jsonb_build_object('estimator_id', e.estimator_id, 'version', e.version, 'inputs', v_q));
    SELECT x INTO c FROM jsonb_array_elements(p_candidates) x WHERE x ->> 'estimator_id' = e.estimator_id::text LIMIT 1;
    IF c IS NULL OR coalesce((c ->> 'version')::int, -1) <> e.version THEN
      RAISE EXCEPTION 'estimate rejected (candidates): estimator % v% states no candidate — every active estimator''s candidate is kept (disagreement retained)', e.name, e.version USING ERRCODE = '22023';
    END IF;
    v_value := CASE WHEN jsonb_typeof(c -> 'value') = 'number' THEN (c ->> 'value')::numeric END;
    IF v_disq AND v_value IS NOT NULL THEN
      RAISE EXCEPTION 'estimate rejected (unqualified): estimator % offers a value on a disqualified input — %', e.name,
        (SELECT string_agg(r, '; ') FROM jsonb_array_elements(v_q) z, jsonb_array_elements_text(z -> 'reasons') r) USING ERRCODE = '22023';
    END IF;
    IF e.role = 'primary' AND (v_disq OR v_value IS NULL) THEN
      RAISE EXCEPTION 'estimate rejected (unqualified): the primary estimator % has no qualified candidate — %', e.name,
        coalesce((SELECT string_agg(r, '; ') FROM jsonb_array_elements(v_q) z, jsonb_array_elements_text(z -> 'reasons') r), c ->> 'excluded', 'no value') USING ERRCODE = '22023';
    END IF;
    IF v_value IS NULL AND coalesce(length(btrim(c ->> 'excluded')), 0) = 0 AND NOT v_disq THEN
      RAISE EXCEPTION 'estimate rejected (candidates): estimator % states neither a value nor why it has none', e.name USING ERRCODE = '22023';
    END IF;
    IF v_value IS NOT NULL THEN
      -- a candidate rests only on the evidence the qualified facts read
      v_allowed := (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(coalesce(p_facts -> e.estimator_id::text, '[]'::jsonb)) f, jsonb_array_elements(coalesce(f -> 'evidence', '[]'::jsonb)) x);
      FOR ev IN SELECT * FROM jsonb_array_elements(coalesce(c -> 'evidence', '[]'::jsonb)) LOOP
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_allowed) a WHERE a ->> 'id' = ev ->> 'id' AND (a ->> 'version')::int = (ev ->> 'version')::int) THEN
          RAISE EXCEPTION 'estimate rejected (candidates): estimator % cites evidence %@% its qualified inputs did not read', e.name, ev ->> 'id', ev ->> 'version' USING ERRCODE = '22023';
        END IF;
      END LOOP;
      v_vals := v_vals || v_value;
    END IF;
    IF v_disq THEN v_n_d := v_n_d + 1; ELSE v_n_q := v_n_q + 1; END IF;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('estimator_id', e.estimator_id, 'version', e.version, 'name', e.name, 'role', e.role, 'method', e.method,
      'value', CASE WHEN v_disq THEN NULL ELSE c -> 'value' END, 'raw', c -> 'raw', 'confidence', c -> 'confidence', 'window', c -> 'window', 'last_point', c -> 'last_point',
      'evidence', coalesce(c -> 'evidence', '[]'::jsonb), 'qualified', NOT v_disq,
      'excluded', CASE WHEN v_disq THEN (SELECT string_agg(r, '; ') FROM jsonb_array_elements(v_q) z, jsonb_array_elements_text(z -> 'reasons') r) ELSE c ->> 'excluded' END));
    IF e.role = 'primary' THEN
      v_primary := c; v_evidence := coalesce(c -> 'evidence', '[]'::jsonb);
      v_conf := CASE WHEN jsonb_typeof(c -> 'confidence') = 'number' THEN (c ->> 'confidence')::numeric END;
      v_as_of := CASE WHEN coalesce(c -> 'last_point' ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (c -> 'last_point' ->> 'date')::date END;
    END IF;
  END LOOP;
  IF v_conf IS NULL OR v_conf < 0 OR v_conf > 1 THEN RAISE EXCEPTION 'estimate rejected (candidates): the primary candidate states its confidence in [0, 1] (from its data, never narrative)' USING ERRCODE = '22023'; END IF;
  IF v_as_of IS NULL THEN RAISE EXCEPTION 'estimate rejected (candidates): the primary candidate names its latest point (the estimate''s as-of day)' USING ERRCODE = '22023'; END IF;
  v_value := (v_primary ->> 'value')::numeric;
  -- the spread over every stated candidate (the disagreement, kept)
  SELECT min(x), max(x) INTO v_min, v_max FROM unnest(v_vals) x;
  v_rel := CASE WHEN v_value = 0 THEN NULL ELSE round((v_max - v_min) / abs(v_value), 6) END;
  v_spread := jsonb_build_object('n', cardinality(v_vals), 'min', v_min, 'max', v_max, 'abs', v_max - v_min, 'relative', v_rel, 'ambiguity_threshold', pe.ambiguity);
  -- 3: the range (the primary's declared bounds) and the constraint verdict recorded
  v_range := jsonb_build_object('min', pe.bounds -> 'min', 'max', pe.bounds -> 'max', 'value', v_value,
                                'verdict', CASE WHEN (pe.bounds ? 'min' AND v_value < (pe.bounds ->> 'min')::numeric) OR (pe.bounds ? 'max' AND v_value > (pe.bounds ->> 'max')::numeric) THEN 'outside' ELSE 'inside' END);
  v_outcome := p_constraint ->> 'outcome';
  -- the materiality: the change against the head's value of this key
  IF h.version IS NOT NULL THEN SELECT * INTO v_head_el FROM twin.state_elements x WHERE x.twin_id = p_twin AND x.version = h.version AND x.key = p_key; END IF;
  v_head_value := CASE WHEN jsonb_typeof(v_head_el.value) = 'number' THEN (v_head_el.value #>> '{}')::numeric END;
  v_material := v_head_value IS NULL OR (v_head_value = 0 AND v_value <> 0) OR (v_head_value <> 0 AND abs(v_value - v_head_value) / abs(v_head_value) >= pe.materiality)
                OR v_head_el.unit IS DISTINCT FROM pe.unit;
  v_mat := jsonb_build_object('head_version', h.version, 'head_value', v_head_el.value, 'head_unit', v_head_el.unit, 'delta_abs', CASE WHEN v_head_value IS NULL THEN NULL ELSE abs(v_value - v_head_value) END,
                              'delta_relative', CASE WHEN v_head_value IS NULL OR v_head_value = 0 THEN NULL ELSE round(abs(v_value - v_head_value) / abs(v_head_value), 6) END,
                              'threshold', pe.materiality, 'material', v_material,
                              'basis', CASE WHEN v_head_el.key IS NULL THEN 'the head holds no value of this key' WHEN v_head_value IS NULL THEN 'the head''s value is not a number' ELSE 'relative change against the head' END);
  IF v_rel IS NOT NULL AND v_rel > pe.ambiguity THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the estimators disagree: spread %s of the proposal, above %s', v_rel, pe.ambiguity)); END IF;
  IF v_range ->> 'verdict' = 'outside' THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the proposal %s is outside the declared bounds', v_value)); END IF;
  IF v_outcome <> 'satisfied' THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the constraint check is %s', v_outcome)); END IF;
  IF v_head_el.key IS NOT NULL AND v_head_el.unit IS DISTINCT FROM pe.unit THEN v_amb_reasons := v_amb_reasons || to_jsonb(format('the unit changes from %s to %s', v_head_el.unit, pe.unit)); END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('facts', coalesce(p_facts, '{}'::jsonb), 'candidates', v_cands)::text, 'UTF8')), 'hex');
  -- 4: the open proposal of this twin × key is superseded
  SELECT * INTO v_prior FROM twin.estimates x WHERE x.twin_id = p_twin AND x.key = p_key AND x.state = 'proposed' FOR UPDATE;
  IF FOUND THEN
    UPDATE twin.estimates SET state = 'superseded', superseded_by = p_estimate_id WHERE estimate_id = v_prior.estimate_id;
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, NULL, v_prior.estimate_id, NULL, 'estimate.superseded', p_actor, jsonb_build_object('superseded_by', p_estimate_id), p_correlation);
  END IF;
  v_event := twin.tes_event(p_tenant, p_domain, p_twin, p_key, pe.estimator_id, p_estimate_id, NULL, 'estimate.proposed', p_actor,
    jsonb_build_object('value', v_value, 'unit', pe.unit, 'confidence', v_conf, 'head_version', h.version, 'material', v_material, 'ambiguous', jsonb_array_length(v_amb_reasons) > 0,
                       'constraint', v_outcome, 'range', v_range ->> 'verdict', 'candidates', jsonb_array_length(v_cands), 'spread', v_spread, 'proposer_kind', v_kind,
                       'agent_id', p_agent, 'run_id', p_run, 'supersedes', v_prior.estimate_id), p_correlation);
  -- 5: a material or ambiguous change is routed to the twin's owner (the item's cause: the proposal's ledger row)
  IF v_material OR jsonb_array_length(v_amb_reasons) > 0 THEN
    v_item := twin.tes_notify(p_tenant, p_domain, 'twin.reconciliation', 'twin_estimate', p_estimate_id,
      format('Estimate for review — %s on %s: %s %s (head %s)', p_key, t.title, v_value, pe.unit, coalesce(v_head_el.value::text, 'none')),
      jsonb_build_array(CASE WHEN v_material THEN 'a material change against the twin''s head' ELSE 'an ambiguous estimate' END) || v_amb_reasons,
      t.owner_principal_id, v_event,
      jsonb_build_object('estimate_id', p_estimate_id, 'twin_id', p_twin, 'key', p_key, 'value', v_value, 'unit', pe.unit, 'head_version', h.version, 'material', v_material,
                         'ambiguous', jsonb_array_length(v_amb_reasons) > 0, 'constraint', v_outcome, 'proposer_kind', v_kind), interval '3 days', p_actor, p_correlation);
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, NULL, p_estimate_id, NULL, 'estimate.routed', p_actor,
      jsonb_build_object('attention_item_id', v_item, 'owner', t.owner_principal_id, 'class', 'twin.reconciliation'), p_correlation);
  END IF;
  INSERT INTO twin.estimates (estimate_id, scope, tenant_id, domain_id, twin_id, key, head_version, head_value, head_unit, as_of, proposed_value, unit, confidence, primary_estimator,
                              candidates, spread, qualification, constraint_check, constraint_outcome, range_check, materiality, material, ambiguous, ambiguity_reasons, evidence, inputs_digest,
                              trigger, routed, attention_item_id, state, proposed_by, proposer_kind, agent_id, run_id, correlation_id)
  VALUES (p_estimate_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_key, h.version, v_head_el.value, v_head_el.unit, v_as_of, v_value, pe.unit, v_conf,
          jsonb_build_object('estimator_id', pe.estimator_id, 'version', pe.version, 'name', pe.name, 'method', pe.method),
          v_cands, v_spread, jsonb_build_object('qualified_estimators', v_n_q, 'disqualified_estimators', v_n_d), p_constraint, v_outcome, v_range, v_mat, v_material,
          jsonb_array_length(v_amb_reasons) > 0, v_amb_reasons, v_evidence, v_digest, coalesce(p_trigger, '{}'::jsonb), v_item IS NOT NULL, v_item, 'proposed', p_actor, v_kind, p_agent, p_run, p_correlation);
  FOR q IN SELECT * FROM jsonb_array_elements(v_quals) LOOP
    INSERT INTO twin.input_qualifications (qualification_id, scope, tenant_id, domain_id, estimate_id, estimator_id, estimator_version, input_index, input, source_id, source_health,
                                           cadence, unit_check, truth_state, verdict, reasons, correlation_id)
    SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_estimate_id, (q ->> 'estimator_id')::uuid, (q ->> 'version')::int, (z ->> 'index')::int, z -> 'input',
           (z ->> 'source_id')::uuid, z -> 'source_health', z -> 'cadence', z -> 'unit_check', z -> 'truth_state', z ->> 'verdict', z -> 'reasons', p_correlation
      FROM jsonb_array_elements(q -> 'inputs') z;
  END LOOP;
  -- the pending triggers of this twin × key are answered by this proposal
  SELECT max(x.occurred_at) INTO v_through FROM twin.estimation_events x
   WHERE x.twin_id = p_twin AND x.key = p_key AND x.event IN ('trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision')
     AND x.occurred_at > coalesce((SELECT max((y.details ->> 'through')::timestamptz) FROM twin.estimation_events y WHERE y.twin_id = p_twin AND y.key = p_key AND y.event = 'trigger.consumed'), '-infinity'::timestamptz);
  IF v_through IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(x.event_id ORDER BY x.occurred_at), '[]'::jsonb) INTO v_consumed FROM twin.estimation_events x
     WHERE x.twin_id = p_twin AND x.key = p_key AND x.event IN ('trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision') AND x.occurred_at <= v_through
       AND x.occurred_at > coalesce((SELECT max((y.details ->> 'through')::timestamptz) FROM twin.estimation_events y WHERE y.twin_id = p_twin AND y.key = p_key AND y.event = 'trigger.consumed'), '-infinity'::timestamptz);
    PERFORM twin.tes_event(p_tenant, p_domain, p_twin, p_key, NULL, p_estimate_id, NULL, 'trigger.consumed', p_actor, jsonb_build_object('through', v_through, 'triggers', v_consumed), p_correlation);
  END IF;
  RETURN jsonb_build_object('estimate_id', p_estimate_id, 'twin_id', p_twin, 'key', p_key, 'state', 'proposed', 'value', v_value, 'unit', pe.unit, 'confidence', v_conf, 'as_of', v_as_of,
                            'head_version', h.version, 'candidates', v_cands, 'spread', v_spread, 'qualification', v_quals, 'constraint', v_outcome, 'range', v_range,
                            'materiality', v_mat, 'material', v_material, 'ambiguous', jsonb_array_length(v_amb_reasons) > 0, 'ambiguity_reasons', v_amb_reasons,
                            'routed', v_item IS NOT NULL, 'attention_item_id', v_item, 'owner', t.owner_principal_id, 'supersedes', v_prior.estimate_id, 'proposer_kind', v_kind);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.propose_estimate(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.propose_estimate(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,uuid,uuid,uuid) TO eye_commit;

/*
 * DECIDE an estimate (twin.estimate.decide): the twin's OWNER — never the proposer, never an agent — approves or declines an open estimate.
 * A DECLINE states its reason. An APPROVAL publishes the candidate as a NEW SNAPSHOT: the route, in ONE transaction under this bound action,
 * opens a draft on `actual` carrying from the head (the key excepted), grounds the estimate as an ESTIMATED element citing the evidence its
 * qualified inputs read, and admits it — through the existing version, ground and admit ports (each serves twin.estimate.decide beside its
 * own action, §ES.4) — and then calls this port with the admitted version, which verifies it: the version is admitted on `actual`, opened by
 * the approver in this transaction, it supersedes exactly the head the estimate was computed against (else STALE), and it carries the key
 * as an estimated element of the proposed value and unit. Publication is refused unless the constraint check before publish was SATISFIED
 * and the value inside the declared bounds; an ambiguous estimate is approved only with the owner's note.
 */
CREATE OR REPLACE FUNCTION twin.decide_estimate(
  p_estimate_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_new_version int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x twin.estimates%ROWTYPE; v_owner uuid; nv twin.twin_versions%ROWTYPE; el twin.state_elements%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimate.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimate', p_actor);
  SELECT * INTO x FROM twin.estimates e WHERE e.estimate_id = p_estimate_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate rejected (unknown_estimate): % is not an estimate of this domain', p_estimate_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = x.twin_id;
  IF v_owner IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'estimate rejected (ownership): an estimate of twin % is decided by the twin''s owner', x.twin_id USING ERRCODE = '42501';
  END IF;
  IF x.proposed_by = p_actor THEN
    RAISE EXCEPTION 'estimate rejected (separation_of_duties): the proposer of estimate % does not decide it', p_estimate_id USING ERRCODE = '42501';
  END IF;
  IF x.state <> 'proposed' THEN RAISE EXCEPTION 'estimate rejected (state): estimate % is %, not proposed', p_estimate_id, x.state USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'declined') THEN RAISE EXCEPTION 'estimate rejected (decision): a decision is approved or declined' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'declined' THEN
    IF coalesce(length(v_note), 0) < 8 THEN RAISE EXCEPTION 'estimate rejected (note): a declined estimate states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
    IF p_new_version IS NOT NULL THEN RAISE EXCEPTION 'estimate rejected (decision): a declined estimate opens no snapshot' USING ERRCODE = '22023'; END IF;
    UPDATE twin.estimates SET state = 'declined', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note WHERE estimate_id = p_estimate_id;
    PERFORM twin.tes_event(p_tenant, p_domain, x.twin_id, x.key, NULL, p_estimate_id, NULL, 'estimate.declined', p_actor, jsonb_build_object('note', v_note), p_correlation);
    RETURN jsonb_build_object('estimate_id', p_estimate_id, 'state', 'declined', 'twin_id', x.twin_id, 'key', x.key, 'note', v_note);
  END IF;
  -- APPROVAL: the validation before publish
  IF x.constraint_outcome <> 'satisfied' THEN
    RAISE EXCEPTION 'estimate rejected (constraint): the constraint check before publish is % (%); an estimate is published only on a satisfied check — propose again once it is',
      x.constraint_outcome, coalesce((SELECT string_agg(v ->> 'message', '; ') FROM jsonb_array_elements(x.constraint_check -> 'violations') v), x.constraint_check ->> 'reason', 'no applicable constraint') USING ERRCODE = '22023';
  END IF;
  IF x.range_check ->> 'verdict' = 'outside' THEN
    RAISE EXCEPTION 'estimate rejected (range): % % is outside the declared bounds [%, %]', x.proposed_value, x.unit, coalesce(x.range_check ->> 'min', '−∞'), coalesce(x.range_check ->> 'max', '∞') USING ERRCODE = '22023';
  END IF;
  IF x.ambiguous AND coalesce(length(v_note), 0) < 8 THEN
    RAISE EXCEPTION 'estimate rejected (note): an ambiguous estimate (%) is approved with the owner''s note (at least 8 characters)',
      (SELECT string_agg(r, '; ') FROM jsonb_array_elements_text(x.ambiguity_reasons) r) USING ERRCODE = '22023';
  END IF;
  IF p_new_version IS NULL THEN RAISE EXCEPTION 'estimate rejected (decision): an approval names the snapshot it opened' USING ERRCODE = '22023'; END IF;
  SELECT * INTO nv FROM twin.twin_versions v WHERE v.twin_id = x.twin_id AND v.version = p_new_version;
  IF NOT FOUND OR nv.state <> 'admitted' OR nv.branch_id <> 'actual' THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % of twin % is not an admitted version on actual', p_new_version, x.twin_id USING ERRCODE = '22023';
  END IF;
  IF nv.opened_by IS DISTINCT FROM p_actor OR NOT EXISTS (SELECT 1 FROM twin.twin_events te WHERE te.twin_id = x.twin_id AND te.event = 'version.admitted'
                                                           AND (te.details ->> 'version')::int = p_new_version AND te.correlation_id = p_correlation AND te.actor_principal_id = p_actor) THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % was not opened and admitted by the approver in this approval', p_new_version USING ERRCODE = '22023';
  END IF;
  IF nv.supersedes IS DISTINCT FROM x.head_version THEN
    RAISE EXCEPTION 'estimate rejected (stale): estimate % was computed against v% of the twin; the head moved to v% — propose again on the current head', p_estimate_id,
      coalesce(x.head_version::text, 'none'), coalesce(nv.supersedes::text, 'none') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO el FROM twin.state_elements s WHERE s.twin_id = x.twin_id AND s.version = p_new_version AND s.key = x.key;
  IF NOT FOUND OR el.kind <> 'estimated' OR jsonb_typeof(el.value) <> 'number' OR (el.value #>> '{}')::numeric <> x.proposed_value OR el.unit IS DISTINCT FROM x.unit THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % does not carry % as the estimated value % %', p_new_version, x.key, x.proposed_value, x.unit USING ERRCODE = '22023';
  END IF;
  UPDATE twin.estimates SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note, applied_version = p_new_version WHERE estimate_id = p_estimate_id;
  PERFORM twin.tes_event(p_tenant, p_domain, x.twin_id, x.key, NULL, p_estimate_id, NULL, 'estimate.approved', p_actor,
    jsonb_build_object('applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'value', x.proposed_value, 'unit', x.unit, 'note', v_note,
                       'state_set_digest', nv.state_set_digest, 'material', x.material, 'ambiguous', x.ambiguous), p_correlation);
  RETURN jsonb_build_object('estimate_id', p_estimate_id, 'state', 'approved', 'twin_id', x.twin_id, 'key', x.key, 'value', x.proposed_value, 'unit', x.unit,
                            'applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'note', v_note);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.decide_estimate(uuid,uuid,uuid,text,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.decide_estimate(uuid,uuid,uuid,text,text,int,uuid,uuid) TO eye_commit;

/*
 * REQUEST NEW OBSERVATIONS (twin.observation.request; V02-T-013): a person, or the Reconciliation Agent in its running scan, asks for new
 * observations of a MISSING or STALE input of a twin (a series of the domain, or an element of the twin). Where the series' source is
 * SCHEDULED (observation.scheduler_entries, status scheduled) the request rides the collection scheduler: the entry is recorded with the
 * request (its scheduler id, queue, cadence) and the next collection answers it — no new schedule is written (that is the collection
 * manager's observation.schedule.set). Otherwise an attention item (twin.observation_request) goes to the source's steward (the contract's
 * approver, an active human), else to the twin's owner. One open request per twin × input: asking again answers the standing request.
 */
CREATE OR REPLACE FUNCTION twin.request_observations(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_key text, p_estimator uuid, p_input jsonb, p_reason_class text, p_note text,
  p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, prediction, executive, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_kind text; v_ref text; v_source uuid; v_series prediction.series_registry%ROWTYPE; s observation.scheduler_entries%ROWTYPE;
        v_via text; v_sched jsonb; v_route uuid; v_item uuid; v_event uuid; prior twin.observation_requests%ROWTYPE; v_steward uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.observation.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('observation request', p_actor);
  v_kind := twin.tes_proposer_kind('observation request', p_tenant, p_domain, p_actor, p_agent, p_run);
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'observation request rejected (unknown_twin): % is not a twin of this domain', p_twin USING ERRCODE = '23503'; END IF;
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' OR coalesce(p_input ->> 'kind', '') NOT IN ('series', 'element') THEN
    RAISE EXCEPTION 'observation request rejected (input): the input is { kind: series, series_key } or { kind: element, key }' USING ERRCODE = '22023';
  END IF;
  IF p_reason_class IS NULL OR p_reason_class NOT IN ('missing', 'stale', 'disqualified') THEN
    RAISE EXCEPTION 'observation request rejected (reason): the request is for a missing, stale or disqualified input' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_note)), 0) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'observation request rejected (note): the request says what is missing or stale (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_input ->> 'kind' = 'series' THEN
    SELECT * INTO v_series FROM prediction.series_registry x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.series_key = p_input ->> 'series_key';
    IF NOT FOUND THEN RAISE EXCEPTION 'observation request rejected (unknown_series): series % is not registered in this domain', p_input ->> 'series_key' USING ERRCODE = '23503'; END IF;
    v_ref := 'series:' || v_series.series_key;
    SELECT c.source_id, c.approver_principal_id INTO v_source, v_steward FROM observation.source_contracts_current c
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = v_series.source_key ORDER BY (c.lifecycle_state = 'active') DESC, c.contract_version DESC LIMIT 1;
  ELSE
    IF coalesce(p_input ->> 'key', '') !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' THEN RAISE EXCEPTION 'observation request rejected (input): an element input names its key' USING ERRCODE = '22023'; END IF;
    v_ref := 'element:' || (p_input ->> 'key');
  END IF;
  SELECT * INTO prior FROM twin.observation_requests r WHERE r.twin_id = p_twin AND r.input_ref = v_ref AND r.state = 'open';
  IF FOUND THEN
    RETURN jsonb_build_object('request_id', prior.request_id, 'state', 'open', 'standing', true, 'via', prior.via, 'input_ref', v_ref, 'requested_at', prior.requested_at,
                              'attention_item_id', prior.attention_item_id, 'scheduler', prior.scheduler);
  END IF;
  IF v_source IS NOT NULL THEN SELECT * INTO s FROM observation.scheduler_entries x WHERE x.source_id = v_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'scheduled'; END IF;
  v_event := twin.tes_event(p_tenant, p_domain, p_twin, p_key, p_estimator, NULL, p_request_id, 'observation.requested', p_actor,
                            jsonb_build_object('input', p_input, 'input_ref', v_ref, 'reason_class', p_reason_class, 'source_id', v_source, 'requester_kind', v_kind), p_correlation);
  IF s.source_id IS NOT NULL THEN
    v_via := 'scheduler';
    v_sched := jsonb_build_object('scheduler_id', s.scheduler_id, 'queue', s.queue_name, 'cadence_seconds', s.cadence_seconds, 'contract_version', s.contract_version,
                                  'next_collection_within_seconds', s.cadence_seconds + s.jitter_seconds);
  ELSE
    v_via := 'attention';
    v_route := CASE WHEN v_steward IS NOT NULL AND decision.is_active_human(v_steward, p_tenant) THEN v_steward ELSE t.owner_principal_id END;
    v_item := twin.tes_notify(p_tenant, p_domain, 'twin.observation_request', 'twin', p_twin,
      format('New observations requested — %s of %s is %s', v_ref, t.title, p_reason_class),
      jsonb_build_array(format('the input %s is %s', v_ref, p_reason_class), btrim(p_note)), v_route, v_event,
      jsonb_build_object('request_id', p_request_id, 'twin_id', p_twin, 'key', p_key, 'input', p_input, 'source_id', v_source, 'reason_class', p_reason_class,
                         'routed_to', CASE WHEN v_route = t.owner_principal_id THEN 'twin owner' ELSE 'source steward' END), interval '2 days', p_actor, p_correlation);
  END IF;
  INSERT INTO twin.observation_requests (request_id, scope, tenant_id, domain_id, twin_id, key, estimator_id, input, input_ref, source_id, reason_class, note, via, scheduler,
                                         attention_item_id, routed_to, state, requested_by, requester_kind, agent_id, run_id, correlation_id)
  VALUES (p_request_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_key, p_estimator, p_input, v_ref, v_source, p_reason_class, btrim(p_note), v_via, v_sched,
          v_item, v_route, 'open', p_actor, v_kind, p_agent, p_run, p_correlation);
  RETURN jsonb_build_object('request_id', p_request_id, 'state', 'open', 'standing', false, 'via', v_via, 'input_ref', v_ref, 'source_id', v_source, 'scheduler', v_sched,
                            'attention_item_id', v_item, 'routed_to', v_route, 'requester_kind', v_kind);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.request_observations(uuid,uuid,uuid,uuid,text,uuid,jsonb,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.request_observations(uuid,uuid,uuid,uuid,text,uuid,jsonb,text,text,uuid,uuid,uuid,uuid) TO eye_commit;

/* CANCEL an open request (twin.observation.request): its requester or the twin's owner, with a reason. */
CREATE OR REPLACE FUNCTION twin.cancel_observation_request(p_request_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r twin.observation_requests%ROWTYPE; v_owner uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.observation.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('observation request', p_actor);
  SELECT * INTO r FROM twin.observation_requests x WHERE x.request_id = p_request_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'observation request rejected (unknown_request): % is not a request of this domain', p_request_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = r.twin_id;
  IF p_actor IS DISTINCT FROM r.requested_by AND p_actor IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'observation request rejected (ownership): a request is cancelled by its requester or the twin''s owner' USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'open' THEN RAISE EXCEPTION 'observation request rejected (state): request % is %', p_request_id, r.state USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'observation request rejected (note): a cancellation says why (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE twin.observation_requests SET state = 'cancelled', closed_at = clock_timestamp(), closed_by = p_actor, closure = jsonb_build_object('reason', btrim(p_reason)) WHERE request_id = p_request_id;
  PERFORM twin.tes_event(p_tenant, p_domain, r.twin_id, r.key, r.estimator_id, NULL, p_request_id, 'observation.cancelled', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('request_id', p_request_id, 'state', 'cancelled');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.cancel_observation_request(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.cancel_observation_request(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/*
 * THE TRIGGERS (twin.estimation.trigger — the attention agent, after its tick; the after-tick hook `twin-estimation`). Per twin × key with an
 * active estimator, a proposal check is QUEUED (a trigger row in the ledger) on:
 *   telemetry          a new evidence version of a series input's source, recorded after the last trigger of that kind for the twin × key
 *                      (else after the earliest active estimator's declaration) — a new PortWatch transit count, for instance;
 *   internal_change    an admitted version on `actual` of an UPSTREAM twin (twin.twin_links: this twin downstream) — the internal-system
 *                      change GraphChanged/twin.state_changed announces —, after the same watermark;
 *   ontology_revision  the domain's ontology ACTIVATED anew (graph.ontology_events ontology.activated), after the same watermark.
 * And an open observation request is FULFILLED when its source recorded a new evidence version after the request. Nothing else is written:
 * the proposal itself is the Reconciliation Agent's (or a person's). Answers what was queued and fulfilled, the pending twin × keys, and the
 * domain's active Reconciliation Agents (the hook runs their scan when anything is pending).
 */
CREATE OR REPLACE FUNCTION twin.queue_estimation_triggers(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, objects, graph, executive, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k record; v_mark timestamptz; v_ev record; v_queued jsonb := '[]'::jsonb; v_fulfilled jsonb := '[]'::jsonb; r twin.observation_requests%ROWTYPE; v_new record;
        v_pending jsonb; v_agents jsonb; v_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimation.trigger']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimation trigger', p_actor);
  IF NOT EXISTS (SELECT 1 FROM executive.agents a WHERE a.principal_id = p_actor AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'attention' AND a.status = 'active') THEN
    RAISE EXCEPTION 'estimation trigger rejected (authority): the triggers are queued by the domain''s active attention agent, after its tick' USING ERRCODE = '42501';
  END IF;
  FOR k IN SELECT x.twin_id, x.key, min(x.declared_at) AS since FROM twin.estimators x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active'
            GROUP BY x.twin_id, x.key ORDER BY x.twin_id, x.key LOOP
    -- telemetry: the newest evidence of each series input's source
    SELECT coalesce(max(y.occurred_at), k.since) INTO v_mark FROM twin.estimation_events y WHERE y.twin_id = k.twin_id AND y.key = k.key AND y.event = 'trigger.telemetry';
    FOR v_ev IN
      SELECT DISTINCT ON (c.source_id) c.source_id, o.object_id, o.object_version, o.recorded_at, s.series_key
        FROM twin.estimators x
        CROSS JOIN LATERAL jsonb_array_elements(x.inputs) i
        JOIN prediction.series_registry s ON s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.series_key = i ->> 'series_key'
        JOIN observation.source_contracts_current c ON c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = s.source_key
        JOIN objects.canonical_objects o ON o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.provenance_ref LIKE 'SRC:' || c.source_id::text || '@%'
       WHERE x.twin_id = k.twin_id AND x.key = k.key AND x.state = 'active' AND i ->> 'kind' = 'series' AND o.recorded_at > v_mark
       ORDER BY c.source_id, o.recorded_at DESC
    LOOP
      v_id := twin.tes_event(p_tenant, p_domain, k.twin_id, k.key, NULL, NULL, NULL, 'trigger.telemetry', p_actor,
                             jsonb_build_object('source_id', v_ev.source_id, 'series_key', v_ev.series_key, 'evidence', jsonb_build_object('id', v_ev.object_id, 'version', v_ev.object_version),
                                                'recorded_at', v_ev.recorded_at, 'watermark', v_mark), p_correlation);
      v_queued := v_queued || jsonb_build_array(jsonb_build_object('event_id', v_id, 'kind', 'telemetry', 'twin_id', k.twin_id, 'key', k.key, 'series_key', v_ev.series_key));
    END LOOP;
    -- internal-system change: an upstream twin's admitted version
    SELECT coalesce(max(y.occurred_at), k.since) INTO v_mark FROM twin.estimation_events y WHERE y.twin_id = k.twin_id AND y.key = k.key AND y.event = 'trigger.internal_change';
    FOR v_ev IN
      SELECT DISTINCT ON (l.upstream_twin_id) l.upstream_twin_id, (te.details ->> 'version')::int AS version, te.occurred_at, te.event_id
        FROM twin.twin_links l JOIN twin.twin_events te ON te.twin_id = l.upstream_twin_id AND te.event = 'version.admitted' AND te.details ->> 'branch_id' = 'actual'
       WHERE l.downstream_twin_id = k.twin_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.state = 'live' AND te.occurred_at > v_mark
       ORDER BY l.upstream_twin_id, te.occurred_at DESC
    LOOP
      v_id := twin.tes_event(p_tenant, p_domain, k.twin_id, k.key, NULL, NULL, NULL, 'trigger.internal_change', p_actor,
                             jsonb_build_object('upstream_twin_id', v_ev.upstream_twin_id, 'version', v_ev.version, 'twin_event_id', v_ev.event_id, 'admitted_at', v_ev.occurred_at,
                                                'announced_as', 'GraphChanged/twin.state_changed', 'watermark', v_mark), p_correlation);
      v_queued := v_queued || jsonb_build_array(jsonb_build_object('event_id', v_id, 'kind', 'internal_change', 'twin_id', k.twin_id, 'key', k.key, 'upstream_twin_id', v_ev.upstream_twin_id));
    END LOOP;
    -- ontology revision: the domain's ontology activated anew
    SELECT coalesce(max(y.occurred_at), k.since) INTO v_mark FROM twin.estimation_events y WHERE y.twin_id = k.twin_id AND y.key = k.key AND y.event = 'trigger.ontology_revision';
    FOR v_ev IN
      SELECT oe.event_id, oe.version_id, oe.occurred_at, ov.version FROM graph.ontology_events oe JOIN graph.ontology_versions ov ON ov.version_id = oe.version_id
       WHERE oe.tenant_id = p_tenant AND oe.domain_id = p_domain AND oe.event = 'ontology.activated' AND oe.occurred_at > v_mark ORDER BY oe.occurred_at DESC LIMIT 1
    LOOP
      v_id := twin.tes_event(p_tenant, p_domain, k.twin_id, k.key, NULL, NULL, NULL, 'trigger.ontology_revision', p_actor,
                             jsonb_build_object('ontology_version_id', v_ev.version_id, 'ontology_version', v_ev.version, 'ontology_event_id', v_ev.event_id, 'activated_at', v_ev.occurred_at,
                                                'watermark', v_mark), p_correlation);
      v_queued := v_queued || jsonb_build_array(jsonb_build_object('event_id', v_id, 'kind', 'ontology_revision', 'twin_id', k.twin_id, 'key', k.key, 'ontology_version', v_ev.version));
    END LOOP;
  END LOOP;
  -- an open request is fulfilled by a new evidence version of its source recorded after the request
  FOR r IN SELECT * FROM twin.observation_requests x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'open' AND x.source_id IS NOT NULL FOR UPDATE LOOP
    SELECT o.object_id, o.object_version, o.recorded_at INTO v_new FROM objects.canonical_objects o
     WHERE o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.provenance_ref LIKE 'SRC:' || r.source_id::text || '@%' AND o.recorded_at > r.requested_at
     ORDER BY o.recorded_at DESC LIMIT 1;
    IF v_new.object_id IS NOT NULL THEN
      UPDATE twin.observation_requests SET state = 'fulfilled', closed_at = clock_timestamp(), closed_by = p_actor,
             closure = jsonb_build_object('evidence', jsonb_build_object('id', v_new.object_id, 'version', v_new.object_version), 'recorded_at', v_new.recorded_at)
       WHERE request_id = r.request_id;
      PERFORM twin.tes_event(p_tenant, p_domain, r.twin_id, r.key, r.estimator_id, NULL, r.request_id, 'observation.fulfilled', p_actor,
                             jsonb_build_object('evidence', jsonb_build_object('id', v_new.object_id, 'version', v_new.object_version), 'recorded_at', v_new.recorded_at), p_correlation);
      v_fulfilled := v_fulfilled || jsonb_build_array(jsonb_build_object('request_id', r.request_id, 'twin_id', r.twin_id, 'input_ref', r.input_ref));
    END IF;
    v_new := NULL;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('twin_id', p.twin_id, 'key', p.key, 'triggers', p.n) ORDER BY p.twin_id, p.key), '[]'::jsonb) INTO v_pending
    FROM (SELECT x.twin_id, x.key, count(*) AS n FROM twin.estimation_events x
           WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.event IN ('trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision')
             AND x.occurred_at > coalesce((SELECT max((y.details ->> 'through')::timestamptz) FROM twin.estimation_events y WHERE y.twin_id = x.twin_id AND y.key = x.key AND y.event = 'trigger.consumed'), '-infinity'::timestamptz)
           GROUP BY x.twin_id, x.key) p;
  SELECT coalesce(jsonb_agg(a.agent_id ORDER BY a.created_at), '[]'::jsonb) INTO v_agents FROM executive.agents a
   WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'reconciliation' AND a.status = 'active';
  RETURN jsonb_build_object('queued', v_queued, 'fulfilled', v_fulfilled, 'pending', v_pending, 'reconciliation_agents', v_agents);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.queue_estimation_triggers(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.queue_estimation_triggers(uuid,uuid,uuid,uuid) TO eye_commit;

/* The PENDING proposal checks of the domain (an INVOKER read: the ledger's row security): per twin × key, the triggers not yet answered by a
   proposal — what the Reconciliation Agent's scan reads as its backlog. */
CREATE OR REPLACE FUNCTION twin.estimation_pending() RETURNS TABLE (twin_id uuid, key text, triggers bigint, kinds text[], oldest timestamptz)
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT x.twin_id, x.key, count(*), array_agg(DISTINCT replace(x.event, 'trigger.', '') ORDER BY replace(x.event, 'trigger.', '')), min(x.occurred_at)
    FROM twin.estimation_events x
   WHERE x.event IN ('trigger.telemetry', 'trigger.internal_change', 'trigger.ontology_revision')
     AND x.occurred_at > coalesce((SELECT max((y.details ->> 'through')::timestamptz) FROM twin.estimation_events y WHERE y.twin_id = x.twin_id AND y.key = x.key AND y.event = 'trigger.consumed'), '-infinity'::timestamptz)
   GROUP BY x.twin_id, x.key ORDER BY min(x.occurred_at), x.twin_id, x.key
$$;
REVOKE ALL ON FUNCTION twin.estimation_pending() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.estimation_pending() TO eye_app, eye_commit;

-- ============================================================
-- §ES.4 PUBLICATION THROUGH THE EXISTING PORTS
-- ============================================================
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('twin.estimate.decide', ARRAY['TWN'], 'B30 estimation: the twin owner''s approval of an estimate admits the new twin version (a TWN object) and nothing else')
ON CONFLICT (action) DO NOTHING;

/*
 * The existing VERSION and GROUND ports (0092:628/696, copied whole), each with ONE change: the bound action twin.estimate.decide is served
 * beside the port's own (twin.version / twin.ground) and B29's twin.coupling.apply — so an approved estimate is published THROUGH them (the
 * same draft rules, carry-forward re-judgement, materiality and citation checks), never around them.
 */
CREATE OR REPLACE FUNCTION twin.open_version(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_branch text, p_forked_from int, p_known_at timestamptz, p_observed_through date,
  p_carry_from int, p_except text[], p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS int
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_next int; v_supersedes int; v_open int; v_health jsonb := '{}'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.version', /* B29 (0092) */ 'twin.coupling.apply', /* B30 estimation */ 'twin.estimate.decide']);
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
  PERFORM observation.assert_authority(ARRAY['twin.ground', /* B29 (0092) */ 'twin.coupling.apply', /* B30 estimation */ 'twin.estimate.decide']);
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

/* The existing ADMIT port (0032:458, copied whole) with ONE change: it also serves twin.estimate.decide (the approval's own transaction). */
CREATE OR REPLACE FUNCTION twin.admit_version(
  p_twin_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_expected_digest text, p_header_digest text,
  p_allow_incomplete boolean, p_synthetic boolean, p_controls jsonb, p_dependencies jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_digest text; v_missing jsonb; v_bad int; v_completeness text; d jsonb; v_branch text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.version.admit', /* B30 estimation */ 'twin.estimate.decide']);
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
