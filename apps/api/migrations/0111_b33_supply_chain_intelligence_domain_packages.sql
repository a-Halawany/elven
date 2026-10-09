-- 0111 — CP-6 B33 (2026-10-09): SUPPLY-CHAIN INTELLIGENCE AND DOMAIN PACKAGES — F-P4-14 (multi-tier mapping, hidden-dependency inference with
-- human validation, disruption mapping, the alternatives workspace), F-P4-15 (the certified domain-package framework; competitor, geopolitical,
-- technology, cyber and financial packages; the domain intelligence workspace WS-10), F-P5-03's B33 pieces (merges between non-actual branches,
-- the scenario citation, the scenario-element form) and F-P5-02's / F-P5-04's B33 pieces (the estimate citation, the cross-twin dependency check,
-- the topology harness, the routed items closed on decision, open_run's envelope wording). This file is built as a PRELUDE (§0, the integrator)
-- and four parts folded in apply order: §TW the twin pieces · §SC supply-chain intelligence · §PK the package framework and the four packages ·
-- §CI competitor intelligence. 0001–0110 are applied and frozen and untouched (0110 is B33-J's journal-only audit recovery, its own PR).
-- Every figure a harness or an act seeds through this file is SYNTHETIC. The interface register stays 50/0/0.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §0 PRELUDE — the shared vocabulary, roles, agent kind, citation kinds, the package core and its gate seam, the routed raise/close helpers,
-- the object types and the catalogue's `domain.` claim (the integrator, before the parts)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §0.1 THE ROLES (DOMAIN). A domain specialist certifies a package's sections (ontology, methodology, assessment templates, escalation rules,
-- use boundaries) and approves material domain assessments of its package — a named human, never the proposer, never an agent (§PK's ports
-- re-check it). The Domain Intelligence Agent reads and PROPOSES (events, profile updates, interpretations) — it never approves and never
-- certifies (§CI's scan; its PDP rows hold no approval). The supply relationship's validator stays the existing domain_analyst; the
-- supply network's writer stays the twin's owner (§SC).
INSERT INTO identity.roles (code, scope, description) VALUES
  ('domain_specialist', 'DOMAIN', 'The domain specialist (B33, PR-31-003): certifies a domain package''s ontology, methodology, assessment templates, escalation rules and use boundaries, and approves material domain assessments of its package — a named human, never the proposer, never an agent'),
  ('domain_intelligence_agent', 'DOMAIN', 'The Domain Intelligence Agent (B33, PR-29-003): reads new claims and evidence on watched subjects and PROPOSES events, profile updates and interpretations — never approves, never certifies')
ON CONFLICT (code) DO NOTHING;

-- §0.2 THE ATTENTION VOCABULARY (0108 §0.4b's function and both CHECKs, copied whole, plus B33's): supply.dependency (an inferred hidden
-- dependency awaiting a named validator), supply.disruption (a disruption mapped to an affected line), domain.alert (a watchlist or competitor
-- alert), domain.package (package governance: a certification pending, a conflict, a function disabled, a migration). Subject kinds:
-- supply_inference, supply_disruption, domain_package, domain_assessment, competitor_profile, watchlist. The policy port refuses a class not in
-- this list (0083:345); an item of a class the published policy does not name is deprioritized — listed, never hidden.
CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  -- B34 (0090)
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  -- B36 (0094)
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  -- B90 (0095)
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  -- B27 (0097)
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  -- B31 (0099)
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  -- B35 (0101)
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due',
  -- B30 (0103)
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint',
  -- B91 (0105)
  'commercial.usage', 'commercial.entitlement',
  -- B25 (0108)
  'forecast.disagreement',
  -- B33 (0111)
  'supply.dependency', 'supply.disruption', 'domain.alert', 'domain.package'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due',
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint',
  'commercial.usage', 'commercial.entitlement',
  'forecast.disagreement',
  -- B33 (0111)
  'supply.dependency', 'supply.disruption', 'domain.alert', 'domain.package'));
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_subject_kind_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (
  'forecast', 'scenario', 'warning', 'source', 'claim', 'package', 'review',
  'exposure', 'health_change', 'commitment_item',
  'plan', 'publication', 'strategy_object', 'queue',
  'product', 'subscription', 'metric', 'asset',
  'branch', 'scenario_set',
  -- B31 (0099)
  'run', 'experiment',
  -- B35 (0101)
  'recommendation', 'appeal_case', 'outcome_assessment',
  -- B30 (0103)
  'twin', 'twin_version', 'twin_estimate', 'twin_branch', 'behaviour_model',
  -- B91 (0105)
  'meter', 'budget', 'entitlement', 'contract',
  -- B25 (0108)
  'ensemble_run',
  -- B33 (0111)
  'supply_inference', 'supply_disruption', 'domain_package', 'domain_assessment', 'competitor_profile', 'watchlist'));

-- §0.3 THE AGENT KIND domain_intelligence AND ITS TASK domain_scan (the Supply Chain and Reconciliation Agents' precedent, 0092 §0.6 / 0103
-- §0.2): the two CHECKs widened, and executive.register_agent / executive.open_agent_run RE-DECLARED, copied whole from their LAST bodies
-- (0103:1865 / 0103:1924), each change marked `-- B33 §0`: the kind; max_items enforced by its scan; the task run by this kind and no other.
-- The Supply Chain Agent keeps supply_chain / supply_scan (§SC extends its scan, not its kind).
ALTER TABLE executive.agents DROP CONSTRAINT IF EXISTS agents_agent_kind_check;
ALTER TABLE executive.agents ADD CONSTRAINT agents_agent_kind_check CHECK (agent_kind IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal', 'risk', 'opportunity',
                                                                                            /* B29 (0092) */ 'supply_chain',
                                                                                            /* B30 (0103) */ 'reconciliation',
                                                                                            /* B33 (0111) */ 'domain_intelligence'));
ALTER TABLE executive.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_task_check;
ALTER TABLE executive.agent_runs ADD CONSTRAINT agent_runs_task_check CHECK (task IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan', 'risk_assess', 'opportunity_assess',
                                                                                      /* B29 (0092) */ 'supply_scan',
                                                                                      /* B30 (0103) */ 'reconcile_scan',
                                                                                      /* B33 (0111) */ 'domain_scan'));

-- 0103 §ES.0 copied whole (0092 §B.2 + B30 estimation); B33 §0: the kind domain_intelligence (max_items enforced by its scan)
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
  IF p_kind NOT IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal', 'risk', 'opportunity', /* B29 (0092) */ 'supply_chain', /* B30 estimation */ 'reconciliation', /* B33 §0 */ 'domain_intelligence') THEN RAISE EXCEPTION 'agent rejected: kind is decision, briefing, reporting, attention, weak_signal, risk, opportunity, supply_chain, reconciliation or domain_intelligence' USING ERRCODE = '22023'; END IF;   -- B33 §0: the Domain Intelligence Agent's kind
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
    -- B33 §0: max_items on the domain scan too (the proposals one run makes; the rest wait for the next run — §CI's scan enforces it)
    IF (sc ->> 'kind') = 'max_items' AND p_kind NOT IN ('decision', 'briefing', 'weak_signal', /* B32 (0089) */ 'risk', 'opportunity', /* B29 (0092) */ 'supply_chain', /* B30 estimation */ 'reconciliation', /* B33 §0 */ 'domain_intelligence') THEN
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

-- 0103 §ES.0 copied whole (0089 §R2 + B29 §B + B30 estimation); B33 §0: the task domain_scan, run by a domain_intelligence agent and by no
-- other kind (the refusal texts keep the 0046 phrases the refusal row reads)
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
  IF p_task NOT IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan', /* B32 (0089) */ 'risk_assess', 'opportunity_assess', /* B29 (0092) */ 'supply_scan', /* B30 estimation */ 'reconcile_scan', /* B33 §0 */ 'domain_scan') THEN RAISE EXCEPTION 'run rejected: task is draft, briefing, report or monitor (or attention_tick for an attention agent, signal_scan for a weak_signal agent, risk_assess for a risk agent, opportunity_assess for an opportunity agent, supply_scan for a supply_chain agent, reconcile_scan for a reconciliation agent, domain_scan for a domain_intelligence agent)' USING ERRCODE = '22023'; END IF;   -- B33 §0
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
     OR (a.agent_kind = 'reconciliation' AND p_task <> 'reconcile_scan') OR (a.agent_kind <> 'reconciliation' AND p_task = 'reconcile_scan')
     -- B33 §0: the domain scan by a domain_intelligence agent, and by no other kind
     OR (a.agent_kind = 'domain_intelligence' AND p_task <> 'domain_scan') OR (a.agent_kind <> 'domain_intelligence' AND p_task = 'domain_scan') THEN
    RAISE EXCEPTION 'run rejected: a % agent does not run the task %', a.agent_kind, p_task USING ERRCODE = '42501';
  END IF;
  INSERT INTO executive.agent_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_kind, agent_version, code_digest, task, trigger_kind, trigger_principal_id, trigger_ref, room_id, package_id, budget, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, a.principal_id, a.agent_kind, a.agent_version, a.code_digest, p_task, p_trigger_kind, p_trigger_principal, p_trigger_ref, p_room_id, p_package_id, a.budgets, p_correlation);
  RETURN jsonb_build_object('run_id', p_run_id, 'budget', a.budgets, 'stop_conditions', a.stop_conditions, 'escalation_principal_id', a.escalation_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_agent_run(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- §0.4 THE CITATION KINDS `scenario` AND `estimate`: twin.citations_ok copied whole from LAST 0092:62-76, the kind list widened and the two
-- kinds' shapes checked — WIDENING ONLY, every array valid before stays valid. Shapes:
--   {kind:'scenario', id:<scenario_id = the SCN object id>, version:<SCN version>, digest:<SCN content digest>, branch?:<scenario branch id>}
--   {kind:'estimate', id:<estimate_id>, version:1, digest:<twin.estimates.inputs_digest>}
-- The basis rules stay: a reconciled merge value still rests on evidence or an assumption (tbr_mr_reconciled_basis, unchanged) — a scenario or
-- an estimate is never the basis of ACTUAL state through a merge. §TW verifies what each citation names (the SCN version exact in the domain,
-- the branch a branch of that scenario; the estimate the one being decided).
CREATE OR REPLACE FUNCTION twin.citations_ok(p jsonb) RETURNS boolean
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE c jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN false; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(c) <> 'object' THEN RETURN false; END IF;
    IF NOT (c ? 'kind' AND c ? 'id' AND c ? 'version' AND c ? 'digest') THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'kind') <> 'string' OR NOT ((c ->> 'kind') IN ('evidence', 'claim', 'entity', 'forecast', 'assumption', 'run', /* B29 (0092) */ 'twin', /* B33 §0 */ 'scenario', 'estimate')) THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'id') <> 'string' OR NOT ((c ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'version') <> 'number' OR (c ->> 'version') !~ '^[0-9]+$' OR (c ->> 'version')::int < 1 THEN RETURN false; END IF;
    IF jsonb_typeof(c -> 'digest') <> 'string' OR NOT ((c ->> 'digest') ~ '^[0-9a-f]{64}$') THEN RETURN false; END IF;
    -- B33 §0: the two new kinds' shapes — a scenario citation names the SCN object (id = scenario_id, its version and content digest) and,
    -- optionally, the scenario branch (a uuid); an estimate citation names twin.estimates (id = estimate_id, version 1, digest = inputs_digest)
    IF (c ->> 'kind') = 'scenario' AND c ? 'branch' AND (jsonb_typeof(c -> 'branch') <> 'string' OR NOT ((c ->> 'branch') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) THEN RETURN false; END IF;   -- B33 §0
    IF (c ->> 'kind') = 'estimate' AND (c ->> 'version')::int <> 1 THEN RETURN false; END IF;   -- B33 §0
  END LOOP;
  RETURN true;
END $$ LANGUAGE plpgsql;

-- tse_material_substantiated (0032:243-246) DROPPED and re-ADDED counting `estimate` and `scenario` too: a material complete element may rest
-- on an estimate or a scenario citation (every row valid before stays valid — the count only grows).
ALTER TABLE twin.state_elements DROP CONSTRAINT tse_material_substantiated;
ALTER TABLE twin.state_elements ADD CONSTRAINT tse_material_substantiated CHECK (
    material = false OR health <> 'complete'
    OR (twin.citation_count(citations, 'evidence') + twin.citation_count(citations, 'claim') + twin.citation_count(citations, 'forecast')
        + twin.citation_count(citations, 'assumption') + twin.citation_count(citations, 'run')
        + /* B33 §0 */ twin.citation_count(citations, 'estimate') + twin.citation_count(citations, 'scenario')) >= 1);

-- What an admitted version RESTS ON (graph.dependencies, written by twin.admit_version from the TS grounding): a scenario citation is recorded as
-- `strategy` on the scenario id (the 0065:340 reach convention — a scenario's consumers are found as `strategy` dependencies); an ESTIMATE
-- citation needs its own kind. The CHECK copied whole from LAST 0065:955-957, widened by `estimate` (every row valid before stays valid).
ALTER TABLE graph.dependencies DROP CONSTRAINT dependencies_depends_on_kind_check;
ALTER TABLE graph.dependencies ADD CONSTRAINT dependencies_depends_on_kind_check
  CHECK (depends_on_kind IN ('claim', 'entity', 'edge', 'strategy', 'forecast', 'evidence', 'twin', 'run', 'warning', /* B33 §0 */ 'estimate'));

-- §0.5 THE PACKAGE CORE (schema `domain`, new): the TABLES are the prelude's, their PORTS are §PK's (declare / version / approve / certify /
-- activate / health / retire). FORCE RLS by the 0081 loop idiom; SELECT to eye_app and eye_commit; writes only through definer ports.
-- BOUNDARY: this is F-P4-15's in-tenant certified package framework. Package SIGNING and publisher identity → B77 (F-P7C-01); extension
-- namespaces in every layer → B78 (F-P7C-07); marketplace and purchase → B112; cross-profile parity → B111.
CREATE SCHEMA IF NOT EXISTS domain;
GRANT USAGE ON SCHEMA domain TO eye_app, eye_commit;

/* A PACKAGE — one per (tenant, domain, package_key); declared by its owner (a named human), retired once. */
CREATE TABLE domain.packages (
  package_id         uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_key        text NOT NULL CHECK (package_key ~ '^[a-z][a-z0-9-]{1,40}$'),
  domain_kind        text NOT NULL CHECK (domain_kind IN ('competitor', 'supply_chain', 'geopolitical', 'technology', 'cyber', 'financial')),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  owner_principal_id uuid NOT NULL,
  state              text NOT NULL DEFAULT 'declared' CHECK (state IN ('declared', 'retired')),
  retired_at         timestamptz,
  retired_by         uuid,
  retire_reason      text,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dom_pkg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dom_pkg_key_once UNIQUE (tenant_id, domain_id, package_key),
  CONSTRAINT dom_pkg_retired_bound CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL)
                                         AND (retired_at IS NULL) = (retire_reason IS NULL) AND (retire_reason IS NULL OR length(btrim(retire_reason)) >= 8))
);

/* A PACKAGE VERSION — its MANIFEST (§PK's form: ontology_extension, source_set, indicators, models, assessment_templates, watchlist templates,
   controls, risk_meaning, release) digested; the lifecycle proposed → certified → active → superseded | retired, forward only; one ACTIVE
   version per package. disabled_functions = {<function>: {reason, disabled_at, disabled_by, ...}} — an INCOMPATIBLE FUNCTION disabled, never
   the whole package (PR-31-005); conflict = {reason, functions?: [...], ...} — a conflict exposed on every read (absent `functions`: every
   function of the version is conflicted). Both written by §PK's health port; the gate seam below reads them. object_version: the DPG version. */
CREATE TABLE domain.package_versions (
  package_id         uuid NOT NULL REFERENCES domain.packages (package_id),
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  semver             text NOT NULL CHECK (semver ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  manifest           jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  manifest_digest    text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'certified', 'active', 'superseded', 'retired')),
  disabled_functions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(disabled_functions) = 'object'),
  conflict           jsonb CHECK (conflict IS NULL OR (jsonb_typeof(conflict) = 'object' AND length(btrim(coalesce(conflict ->> 'reason', ''))) >= 8)),
  object_version     int CHECK (object_version IS NULL OR object_version >= 1),
  proposed_by        uuid NOT NULL,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  certified_by       uuid,
  certified_at       timestamptz,
  activated_by       uuid,
  activated_at       timestamptz,
  superseded_at      timestamptz,
  retired_at         timestamptz,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (package_id, version),
  CONSTRAINT dom_pv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dom_pv_certified_bound CHECK ((certified_at IS NULL) = (certified_by IS NULL)),
  CONSTRAINT dom_pv_activated_bound CHECK ((activated_at IS NULL) = (activated_by IS NULL)),
  CONSTRAINT dom_pv_certified_state CHECK (state NOT IN ('certified', 'active') OR certified_at IS NOT NULL),
  CONSTRAINT dom_pv_active_state CHECK (state <> 'active' OR activated_at IS NOT NULL),
  CONSTRAINT dom_pv_superseded_bound CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  CONSTRAINT dom_pv_retired_bound CHECK ((state = 'retired') = (retired_at IS NOT NULL))
);
CREATE UNIQUE INDEX dom_pv_one_active ON domain.package_versions (package_id) WHERE state = 'active';
CREATE UNIQUE INDEX dom_pv_semver_once ON domain.package_versions (package_id, semver);
CREATE INDEX dom_pv_scope_idx ON domain.package_versions (tenant_id, domain_id, state);

/* The guards: nothing is deleted; a package's identity never changes and its retirement is written once; a version's manifest, digest, semver,
   proposer and scope never change; its state moves FORWARD only (proposed → certified | superseded | retired; certified → active | superseded |
   retired; active → superseded | retired; superseded and retired are terminal). The disabled functions, the conflict, the object version and
   the lifecycle stamps are the only other columns a port writes. */
CREATE OR REPLACE FUNCTION domain.dom_package_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'domain package rejected (state): a package is never deleted (it is retired)' USING ERRCODE = '2F002'; END IF;
  IF NEW.package_id <> OLD.package_id OR NEW.scope <> OLD.scope OR NEW.tenant_id <> OLD.tenant_id OR NEW.domain_id <> OLD.domain_id OR NEW.package_key <> OLD.package_key
     OR NEW.domain_kind <> OLD.domain_kind OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'domain package rejected (state): a package''s identity (key, kind, scope, creator) never changes' USING ERRCODE = '2F002';
  END IF;
  IF OLD.state = 'retired' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'domain package rejected (state): package % is retired; a retirement is recorded once', OLD.package_key USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION domain.dom_package_guard() FROM PUBLIC;
CREATE TRIGGER dom_package_guard BEFORE UPDATE OR DELETE ON domain.packages FOR EACH ROW EXECUTE FUNCTION domain.dom_package_guard();

CREATE OR REPLACE FUNCTION domain.dom_version_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'domain package rejected (state): a package version is never deleted (it is superseded or retired)' USING ERRCODE = '2F002'; END IF;
  IF NEW.package_id <> OLD.package_id OR NEW.version <> OLD.version OR NEW.scope <> OLD.scope OR NEW.tenant_id <> OLD.tenant_id OR NEW.domain_id <> OLD.domain_id
     OR NEW.semver <> OLD.semver OR NEW.manifest <> OLD.manifest OR NEW.manifest_digest <> OLD.manifest_digest OR NEW.proposed_by <> OLD.proposed_by OR NEW.proposed_at <> OLD.proposed_at THEN
    RAISE EXCEPTION 'domain package rejected (state): version % of the package is immutable (manifest, digest, semver, proposer); a change is a new version', OLD.version USING ERRCODE = '2F002';
  END IF;
  IF NEW.state <> OLD.state AND NOT (
       (OLD.state = 'proposed' AND NEW.state IN ('certified', 'superseded', 'retired'))
    OR (OLD.state = 'certified' AND NEW.state IN ('active', 'superseded', 'retired'))
    OR (OLD.state = 'active' AND NEW.state IN ('superseded', 'retired'))) THEN
    RAISE EXCEPTION 'domain package rejected (state): a package version moves forward only (% → % refused)', OLD.state, NEW.state USING ERRCODE = '2F002';
  END IF;
  IF OLD.state IN ('superseded', 'retired') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'domain package rejected (state): version % is %; it is kept as it was', OLD.version, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION domain.dom_version_guard() FROM PUBLIC;
CREATE TRIGGER dom_version_guard BEFORE UPDATE OR DELETE ON domain.package_versions FOR EACH ROW EXECUTE FUNCTION domain.dom_version_guard();

-- RLS and grants: the 0081 loop idiom (policy domain_isolation; SELECT to eye_app and eye_commit; no write grant — the definer ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['packages', 'package_versions'] LOOP
    EXECUTE format('REVOKE ALL ON domain.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE domain.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE domain.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY domain_isolation ON domain.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON domain.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

/* THE PACKAGE_GATE SEAM — what a package-bound function may do NOW: {state, package_key, package_id, package_version, semver, function, reason}
   with state:
     not_installed  no package of that key in this domain, or it is retired;
     uncertified    the package has no ACTIVE (certified and activated) version;
     disabled       the active version disables this function (its reason);
     conflicted     the active version carries a conflict covering this function (its reason);
     active         the function may run under the active version.
   INVOKER, plain SQL: the caller's RLS decides what it can see (the N-01 rule) and the tenant/domain arguments are matched explicitly too.
   Every package-bound write of §PK and §CI consults it and refuses `<noun> rejected (package): <reason>` otherwise. DEFAULT-OFF: only B33's
   new functions read it; nothing that exists consults it. p_function NULL asks about the package as a whole (disabled never answers). */
CREATE OR REPLACE FUNCTION domain.package_function_state(p_tenant uuid, p_domain uuid, p_package_key text, p_function text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  WITH p AS (
    SELECT k.package_id, k.package_key, k.state FROM domain.packages k
     WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.package_key = p_package_key
  ), a AS (
    SELECT v.* FROM domain.package_versions v JOIN p ON p.package_id = v.package_id WHERE v.state = 'active'
  ), latest AS (
    SELECT v.version, v.state FROM domain.package_versions v JOIN p ON p.package_id = v.package_id ORDER BY v.version DESC LIMIT 1
  )
  SELECT jsonb_build_object('package_key', p_package_key, 'function', p_function) || CASE
    WHEN NOT EXISTS (SELECT 1 FROM p) THEN
      jsonb_build_object('state', 'not_installed', 'package_id', NULL, 'package_version', NULL, 'semver', NULL,
                         'reason', format('no package %s is installed in this domain', p_package_key))
    WHEN (SELECT state FROM p) = 'retired' THEN
      jsonb_build_object('state', 'not_installed', 'package_id', (SELECT package_id FROM p), 'package_version', NULL, 'semver', NULL,
                         'reason', format('package %s is retired in this domain', p_package_key))
    WHEN NOT EXISTS (SELECT 1 FROM a) THEN
      jsonb_build_object('state', 'uncertified', 'package_id', (SELECT package_id FROM p), 'package_version', NULL, 'semver', NULL,
                         'reason', coalesce((SELECT format('package %s has no active certified version (its latest, v%s, is %s)', p_package_key, l.version, l.state) FROM latest l),
                                            format('package %s has no version yet', p_package_key)))
    WHEN p_function IS NOT NULL AND (SELECT a.disabled_functions ? p_function FROM a) THEN
      (SELECT jsonb_build_object('state', 'disabled', 'package_id', a.package_id, 'package_version', a.version, 'semver', a.semver,
                                 'reason', format('function %s of package %s v%s is disabled: %s', p_function, p_package_key, a.version,
                                                  coalesce(a.disabled_functions -> p_function ->> 'reason', 'no reason recorded'))) FROM a)
    WHEN (SELECT a.conflict IS NOT NULL AND (jsonb_typeof(a.conflict -> 'functions') IS DISTINCT FROM 'array' OR p_function IS NULL
                                              OR (a.conflict -> 'functions') ? p_function) FROM a) THEN
      (SELECT jsonb_build_object('state', 'conflicted', 'package_id', a.package_id, 'package_version', a.version, 'semver', a.semver,
                                 'reason', format('package %s v%s is conflicted: %s', p_package_key, a.version, a.conflict ->> 'reason')) FROM a)
    ELSE
      (SELECT jsonb_build_object('state', 'active', 'package_id', a.package_id, 'package_version', a.version, 'semver', a.semver,
                                 'reason', format('package %s v%s (%s) is active', p_package_key, a.version, a.semver)) FROM a)
  END $$;
REVOKE ALL ON FUNCTION domain.package_function_state(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.package_function_state(uuid, uuid, text, text) TO eye_app, eye_commit;

/* THE ROUTED RAISE (shared by §TW, §SC, §PK and §CI — no part re-implements it): the prelude.pen_escalate / 0107 idiom. The item is EVALUATED
   under the domain's PUBLISHED attention policy (executive.evaluate_attention; the dims default to consequence C2, confidence 1, 72 hours, and
   p_dims overrides them) and ROUTED by executive.attention_route; the NAMED OWNER is kept when an active human of the tenant; a class the
   policy does not name abstains → DEPRIORITIZED (listed, never hidden); a material item with no owner and no role holder is UNROUTED (or
   ESCALATED where the policy escalates) — ES-47's semantics. The evaluation, the policy id/version and the part's own reasons are recorded on
   the item and its routing event. One item per (class, subject, cause event) (xai_once): the same cause raised twice answers the first item
   (`existing: true`). Internal: SECURITY DEFINER, REVOKE PUBLIC, granted to no runtime role — the parts' definer ports and their triggers call
   it inside a governed write. Returns {item_id, state, outcome, owner, route_roles, policy_id, policy_version, due_at, existing}. */
CREATE OR REPLACE FUNCTION executive.b33_raise_routed(p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject_id uuid, p_title text, p_reasons jsonb,
                                                      p_named_owner uuid, p_cause_event uuid, p_cause_type text, p_details jsonb, p_dims jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_owner uuid;
        v_reasons jsonb := CASE WHEN jsonb_typeof(p_reasons) = 'array' THEN p_reasons WHEN p_reasons IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p_reasons) END;
        v_cause uuid := p_cause_event; v_old executive.attention_items%ROWTYPE; v_corr uuid := coalesce(p_correlation, gen_random_uuid());
BEGIN
  IF p_tenant IS NULL OR p_domain IS NULL OR p_subject_id IS NULL THEN RAISE EXCEPTION 'attention item rejected: a B33 item names its tenant, domain and subject' USING ERRCODE = '22023'; END IF;
  IF p_class IS NULL OR NOT (p_class = ANY (executive.attention_signal_classes())) THEN
    RAISE EXCEPTION 'attention item rejected: % is not a signal class', coalesce(p_class, '<none>') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 4 THEN RAISE EXCEPTION 'attention item rejected: an item has a title (4+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_cause_type IS NULL OR length(btrim(p_cause_type)) < 3 THEN RAISE EXCEPTION 'attention item rejected: an item names its cause''s type' USING ERRCODE = '22023'; END IF;
  IF v_cause IS NULL THEN v_cause := gen_random_uuid(); END IF;
  SELECT * INTO v_old FROM executive.attention_items i
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = p_class AND i.subject_id = p_subject_id AND i.cause_event_id = v_cause;
  IF FOUND THEN
    RETURN jsonb_build_object('item_id', v_old.item_id, 'state', v_old.state, 'outcome', v_old.outcome, 'owner', v_old.owner_principal_id, 'route_roles', to_jsonb(v_old.route_roles),
                              'policy_id', v_old.policy_id, 'policy_version', v_old.policy_version, 'due_at', v_old.due_at, 'existing', true);
  END IF;
  v_owner := CASE WHEN p_named_owner IS NOT NULL AND decision.is_active_human(p_named_owner, p_tenant) THEN p_named_owner END;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, p_class,
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 72) || CASE WHEN jsonb_typeof(p_dims) = 'object' THEN p_dims ELSE '{}'::jsonb END)
            || jsonb_build_object('policy_version', pol.version, 'raised_reasons', v_reasons);
  v_route := executive.attention_route(pol.rules, p_class, v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles,
                                         policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, p_class, p_subject_kind, p_subject_id, v_cause, p_cause_type, left(btrim(p_title), 512), v_eval ->> 'outcome', v_state,
          v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
          jsonb_build_object('raised_by', 'b33', 'named_owner', p_named_owner) || CASE WHEN jsonb_typeof(p_details) = 'object' THEN p_details ELSE '{}'::jsonb END,
          (v_route ->> 'due_at')::timestamptz, coalesce((v_route ->> 'escalations')::int, 0), v_corr);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END, p_actor,
            jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'raised_reasons', v_reasons, 'policy_version', pol.version, 'owner', v_owner,
                               'route_roles', v_route -> 'route_roles', 'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', p_cause_type,
                               'unrouted', coalesce((v_route ->> 'unrouted')::boolean, v_state = 'unrouted'), 'subject_kind', p_subject_kind, 'subject_id', p_subject_id), v_corr);
  RETURN jsonb_build_object('item_id', v_item, 'state', v_state, 'outcome', v_eval ->> 'outcome', 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                            'policy_id', pol.policy_id, 'policy_version', pol.version, 'due_at', v_route -> 'due_at', 'existing', false);
END $$;
REVOKE ALL ON FUNCTION executive.b33_raise_routed(uuid, uuid, text, text, uuid, text, jsonb, uuid, uuid, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;

/* THE CLOSURE ON DECISION (the 0097:840-846 idiom): every not-closed item of the subject (of the class, or of every class when p_class is NULL)
   CLOSED by the deciding act, with an `item.closed` event carrying the reason. Locks the items it closes (FOR UPDATE) — call it from the
   deciding port's own transaction, never from inside an attention sweep that holds them (R4). Internal like the raise. Returns the closed item
   ids (a jsonb array; empty when none was open). */
CREATE OR REPLACE FUNCTION executive.b33_close_items(p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject_id uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE i record; v_items jsonb := '[]'::jsonb; v_corr uuid := coalesce(p_correlation, gen_random_uuid());
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'attention item rejected: a closure names the principal whose act closed it' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 4 THEN RAISE EXCEPTION 'attention item rejected: a closure states its reason (4+ characters)' USING ERRCODE = '22023'; END IF;
  FOR i IN SELECT it.item_id, it.signal_class FROM executive.attention_items it
            WHERE it.tenant_id = p_tenant AND it.domain_id = p_domain AND it.subject_id = p_subject_id
              AND (p_subject_kind IS NULL OR it.subject_kind = p_subject_kind) AND (p_class IS NULL OR it.signal_class = p_class) AND it.state <> 'closed'
            ORDER BY it.created_at, it.item_id
            FOR UPDATE LOOP
    UPDATE executive.attention_items SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, suppressed_until = NULL, updated_at = clock_timestamp() WHERE item_id = i.item_id;
    PERFORM executive.attention_event(i.item_id, p_tenant, p_domain, 'item.closed', p_actor,
              jsonb_build_object('reason', btrim(p_reason), 'signal_class', i.signal_class, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'closed_by', 'b33'), v_corr);
    v_items := v_items || jsonb_build_array(i.item_id);
  END LOOP;
  RETURN v_items;
END $$;
REVOKE ALL ON FUNCTION executive.b33_close_items(uuid, uuid, text, text, uuid, text, uuid, uuid) FROM PUBLIC;

-- §0.6 THE CANONICAL OBJECT TYPES: DPG v1 (a domain package version's manifest), CPF v1 (a competitor profile version), DAS v1 (a domain
-- assessment version). Each names its required core and leaves room for its part's sections (no additionalProperties: false — a part adds
-- sections without a new schema version). The canonical write actions that admit them are the parts' (§PK: DPG, DAS; §CI: CPF), registered in
-- their sections. A validated supply dependency (SDP) is §SC's choice: carried as supply-network twin elements (TWN) or registered as SDP v1 in §SC.
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('DPG', 'v1', $dpg${"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object",
  "required": ["package_id", "package_key", "domain_kind", "version", "semver", "state", "owner_principal_id", "manifest", "manifest_digest"],
  "properties": {
    "package_id": {"type": "string"}, "package_key": {"type": "string", "pattern": "^[a-z][a-z0-9-]{1,40}$"},
    "domain_kind": {"enum": ["competitor", "supply_chain", "geopolitical", "technology", "cyber", "financial"]},
    "title": {"type": "string"}, "version": {"type": "integer", "minimum": 1}, "semver": {"type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"},
    "state": {"enum": ["proposed", "certified", "active", "superseded", "retired"]}, "owner_principal_id": {"type": "string"},
    "manifest": {"type": "object", "properties": {
      "ontology_extension": {"type": "object"}, "source_set": {"type": "array"}, "indicators": {"type": "array"}, "models": {"type": "array"},
      "assessment_templates": {"type": "array"}, "watchlist_templates": {"type": "array"}, "controls": {"type": "object"}, "risk_meaning": {"type": ["object", "array"]},
      "release": {"type": "object"}}},
    "manifest_digest": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    "sections": {"type": "array", "items": {"type": "object", "required": ["section", "digest"]}},
    "conformance": {"type": ["object", "null"]}, "disabled_functions": {"type": "object"}, "conflict": {"type": ["object", "null"]},
    "boundary": {"type": "string"}}}$dpg$::jsonb, 'additive'),
('CPF', 'v1', $cpf${"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object",
  "required": ["competitor_id", "entity_id", "name", "version", "effective_from", "facts", "package"],
  "properties": {
    "competitor_id": {"type": "string"}, "entity_id": {"type": "string"}, "name": {"type": "string", "minLength": 2},
    "version": {"type": "integer", "minimum": 1}, "effective_from": {"type": "string"}, "effective_to": {"type": ["string", "null"]},
    "facts": {"type": "array", "items": {"type": "object", "required": ["kind", "value", "citations"], "properties": {
      "kind": {"type": "string"}, "value": {}, "citations": {"type": "array"}, "confidence": {"type": ["number", "null"], "minimum": 0, "maximum": 1}, "limited": {"type": ["boolean", "null"]}}}},
    "package": {"type": "object", "required": ["package_key", "version"]},
    "approved_by": {"type": ["string", "null"]}, "approved_at": {"type": ["string", "null"]}, "supersedes": {"type": ["integer", "null"]}}}$cpf$::jsonb, 'additive'),
('DAS', 'v1', $das${"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object",
  "required": ["assessment_id", "version", "template", "subject_entities", "statement", "confidence", "evidence", "state", "package"],
  "properties": {
    "assessment_id": {"type": "string"}, "version": {"type": "integer", "minimum": 1}, "template": {"type": "string"},
    "subject_entities": {"type": "array", "items": {"type": "string"}}, "statement": {"type": "string", "minLength": 8},
    "confidence": {"type": "number", "minimum": 0, "maximum": 1}, "evidence": {"type": "array", "minItems": 1},
    "source_diversity": {"type": ["object", "null"]}, "state": {"enum": ["approved", "limited", "superseded"]},
    "material": {"type": ["boolean", "null"]}, "package": {"type": "object", "required": ["package_key", "version"]},
    "approved_by": {"type": ["string", "null"]}, "approved_at": {"type": ["string", "null"]}}}$das$::jsonb, 'additive')
ON CONFLICT (object_type, schema_version) DO NOTHING;

-- §0.7 THE ENTITLEMENT, decided once: `domain_package` v2 (built, action prefixes {domain.}) supersedes 0105 §EN.3's v1 ("not built (P7-C)",
-- no prefixes), so `domain.*` is never an uncatalogued hole. §SC's actions stay under `twin.supply.` (the simulation capability); §PK's and
-- §CI's are `domain.*`. Consequence: on a CONTRACTED tenant whose live licence lacks domain_package, every non-exempt `domain.*` write answers
-- EYE-ENT-001 / 403 (`capability unavailable (entitlement)`); human-gated acts, reads and corrections stay exempt; an uncontracted tenant is
-- never gated. NORDWERK's licence v2 lacks it — the act's FIRST step is the commercial authority's reissue (v3 = v2 + domain_package). Recorded
-- as capability.declared with its reason (SYNTHETIC vendor data, as the v1 seed). Written once: skipped when the live row already claims `domain.`.
DO $$
DECLARE cur commercial.capabilities%ROWTYPE; v_reason text := 'B33 (0111 §0.7): the in-tenant certified domain-package framework is built — domain_package claims the domain. action prefix so domain.* writes are gated by the licence (F-P4-15; ENT-13 purchase and marketplace stay B112)';
        v_descr text := 'Governed ontology extension, sources, indicators, models, conformance, specialist certification, competitor and domain intelligence per domain — the in-tenant certified package framework (B33). Package signing and publisher identity (B77), all-layer namespaces (B78), marketplace and purchase (B112) are not built.';
BEGIN
  SELECT * INTO cur FROM commercial.capabilities c WHERE c.capability_key = 'domain_package' AND c.status <> 'superseded';
  IF cur.capability_key IS NULL OR 'domain.' = ANY (cur.action_prefixes) THEN RETURN; END IF;
  UPDATE commercial.capabilities SET status = 'superseded', superseded_at = clock_timestamp() WHERE capability_key = 'domain_package' AND version = cur.version;
  INSERT INTO commercial.capabilities (capability_key, version, label, description, action_prefixes, included_in, core, entitlement_unit, tier, built, spec_refs,
                                       cannot_remove, status, declared_by, reason, provenance, digest)
  VALUES ('domain_package', cur.version + 1, cur.label, v_descr, ARRAY['domain.'], NULL, false, cur.entitlement_unit, cur.tier, true, cur.spec_refs || ARRAY['F-P4-15'],
          cur.cannot_remove, 'active', '00000000-0000-0000-0000-000000000000'::uuid, v_reason,
          jsonb_build_object('seeded_by', 'migration 0111 §0.7', 'synthetic', true, 'supersedes', cur.version),
          commercial.cen_digest(jsonb_build_object('key', 'domain_package', 'version', cur.version + 1, 'prefixes', to_jsonb(ARRAY['domain.']), 'core', false, 'included_in', NULL::text,
                                                   'unit', cur.entitlement_unit, 'tier', cur.tier, 'status', 'active')));
  INSERT INTO commercial.entitlement_events (event_id, tenant_id, subject_kind, subject_key, version, event, actor, reason, details)
  VALUES (gen_random_uuid(), NULL, 'capability', 'domain_package', cur.version + 1, 'capability.declared', '00000000-0000-0000-0000-000000000000'::uuid, v_reason,
          jsonb_build_object('prefixes', to_jsonb(ARRAY['domain.']), 'supersedes', cur.version, 'built', true, 'seeded', true, 'migration', '0111 §0.7'));
END $$;


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §TW — THE TWIN PIECES (F-P5-03 completes; F-P5-02 and F-P5-04 advance) — prefix twx_; owns simulation.open_run, twin.open_merge (+ overload), resolve_merge_key, complete_merge, tbr_merge_admitted, tbr_merge_bypass, propose_estimate, decide_estimate
-- (folded at integration from the part-local file 0111_b33_x_twin.sql, unchanged; apply order §0, §TW, §SC, §PK, §CI)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════
-- section `twin` (§TW) — CP-6 B33 part `twin`, the twin pieces (the part file 0111_b33_x_twin.sql; it applies alone after 0111 §0 and is folded
-- into 0111 in the apply order §0, §TW, §SC, §PK, §CI). F-P5-03 COMPLETES (merges between non-actual branches, the scenario citation, the
-- scenario-element web form); F-P5-02 and F-P5-04 ADVANCE (the estimate citation, the cross-twin dependency check before publish, the topology
-- harness, the routed items closed on decision, open_run's envelope refusal wording). Prefix `twx_`. Every figure a harness or an act seeds
-- here is SYNTHETIC (NORDWERK's data is the demonstration's).
--
--   §TW1  MERGES BETWEEN NON-ACTUAL BRANCHES: twin.branch_merges.target_branch a branch name ≠ the source (the source is never actual:
--         refreshing a branch FROM actual is a draft carrying from actual, not a merge); tbr_bm_one_live → (twin, source, target),
--         tbr_bm_one_completing → (twin, target); twin.twx_common_base (the nearest common version through forked_from_version) the base of a
--         merge between two non-actual branches (into actual the base stays the fork point — B30's rule, unchanged). RE-DECLARED, each copied
--         whole with the change marked `B33 twin`: twin.open_merge (a NEW overload naming the target; the nine-argument B30 signature kept as a
--         wrapper passing 'actual'), twin.resolve_merge_key (the scenario refusal only into actual), twin.complete_merge (heads, draft and plan
--         on the target), twin.tbr_merge_admitted (+ its trigger, on any branch: the merge INTO the admitted branch), twin.tbr_merge_bypass
--         (generalised to the target). The merge's twin.reconciliation item CLOSED when the merge is merged, refused or withdrawn (trigger
--         twx_merge_item_closes — recommended by MAP TW1, the same idiom as TW7).
--   §TW2  THE SCENARIO CITATION (0111 §0.4's kind): grounded by the scenario-element route (TS, BranchService.groundScenario) — the SCN object
--         exact in this domain, the branch a branch of that scenario and open; tbr_scenario_basis already counts it. No SQL here.
--   §TW3  THE SCENARIO-ELEMENT WEB FORM: web only (apps/web/app/twins/explorer, apps/web/lib/branches-b30.ts's `B33 twin` block).
--   §TW4  THE ESTIMATE CITATION (0111 §0.4's kind): twin.decide_estimate RE-DECLARED (LAST 0106:130, copied whole): the admitted element carries
--         exactly this estimate's citation {kind: estimate, id, version 1, digest: inputs_digest} — else `estimate rejected (citation)` (422).
--   §TW5  THE CROSS-TWIN DEPENDENCY CHECK BEFORE PUBLISH (V03-T-308): twin.propose_estimate RE-DECLARED (0103:2502, copied whole): the head's
--         dependency read (twin.version_freshness) — uncertain → an ambiguity reason per upstream (no_head / stale / unverified / behind),
--         recorded in constraint_check.dependency; the decision (§TW4's port) re-reads it at publication: no head / unverified →
--         `estimate rejected (dependency)` (409), stale / behind → the owner's note.
--   §TW6  THE TOPOLOGY RULE ON A ROUTE-BEARING HEAD: harness only (phase6-twin-b33 TW6) — no SQL.
--   §TW7  THE ITEMS CLOSED ON DECISION (triggers; no port re-declared — the siv_run_* precedent; each writes attention rows only, in the deciding
--         act's own transaction, through the prelude's executive.b33_close_items / b33_raise_routed — R4): the routed estimate item
--         (twin.reconciliation / twin_estimate) closed when the estimate is approved, declined or superseded; the exploratory admission's item
--         (twin.envelope / run) closed by the method steward's concurrence; a NEW twin.envelope item raised when a run FINISHES OUTSIDE its
--         envelope — "awaiting a twin owner's exploratory admission", named owner the twin's owner, routed under the domain's published
--         policy — closed by the exploratory admission or by the run's retirement.
--         The items such decisions left open BEFORE B33 are closed once by the migration (twin.twx_close_decided_items — eye_demo's
--         approved 62 % estimate's item among them), each with a reason that says so.
--         INTERPRETATION (confirmed by the coordinator, B33): F-P5-04's "an item on the completion of an OUTSIDE run" is this NEW item — 0103
--         §0.1 names "an outside-envelope run awaiting exploratory admission" for twin.envelope, and nothing raised it before B33.
--   §TW8  simulation.open_run RE-DECLARED (LAST 0092:1888-2131, copied whole): the two envelope refusal texts name the holder B30 made it —
--         a twin owner (no longer "or the domain administrator").
--
-- Forward only; 0001–0110 and 0111 §0 untouched; the prelude's objects USED, never re-declared. No event is added to twin.twin_events,
-- simulation.run_events or simulation.experiment_events: the merge lifecycle stays in twin.branch_events, the estimate's in
-- twin.estimation_events; the items' in executive.attention_item_events (item.routed / item.deprioritized / item.closed). Default-off: a merge
-- into actual, an estimate on a twin with no upstream link and a run inside its envelope behave and answer exactly as before (one exception,
-- by design: an outside-envelope run's completion now raises its awaiting-admission item — MAP R6 names the pins it moves).
-- ═════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- §TW1 MERGES BETWEEN NON-ACTUAL BRANCHES
-- ─────────────────────────────────────────────────────────────────────
/* The TARGET is actual (B30) or another branch of the twin, never the source (0103:189's CHECK (target_branch = 'actual') dropped). The source
   stays ≠ actual (0103:188, unchanged). Every row before B33 targets actual and stays valid. */
ALTER TABLE twin.branch_merges DROP CONSTRAINT branch_merges_target_branch_check;
ALTER TABLE twin.branch_merges ADD CONSTRAINT twx_bm_target CHECK (target_branch ~ '^[a-z][a-z0-9-]{0,40}$' AND target_branch <> source_branch);
/* One live merge per (source, target) — was per source; one completing merge per TARGET — was per twin (each target is held by its own). */
DROP INDEX twin.tbr_bm_one_live;
CREATE UNIQUE INDEX tbr_bm_one_live ON twin.branch_merges (twin_id, source_branch, target_branch) WHERE state IN ('open', 'reconciled', 'completing');
DROP INDEX twin.tbr_bm_one_completing;
CREATE UNIQUE INDEX tbr_bm_one_completing ON twin.branch_merges (twin_id, target_branch) WHERE state = 'completing';

/* A branch head's LINEAGE: the admitted versions the head descends from — the branch's own admitted versions up to the head, then, at its fork
   point (the forked_from_version of the branch's FIRST version, tbr_fork_base's rule), the lineage of the version it forked from, recursively
   (bounded at 64 forks). */
CREATE OR REPLACE FUNCTION twin.twx_lineage(p_twin uuid, p_branch text, p_upto int) RETURNS TABLE (version int)
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH RECURSIVE l(branch_id, upto, depth) AS (
    SELECT p_branch, p_upto, 0 WHERE p_upto IS NOT NULL
    UNION ALL
    SELECT fv.branch_id, fv.version, l.depth + 1
      FROM l
      CROSS JOIN LATERAL (SELECT v.forked_from_version AS f FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.branch_id = l.branch_id ORDER BY v.version LIMIT 1) first
      JOIN twin.twin_versions fv ON fv.twin_id = p_twin AND fv.version = first.f
     WHERE l.depth < 64)
  SELECT DISTINCT v.version FROM l JOIN twin.twin_versions v ON v.twin_id = p_twin AND v.branch_id = l.branch_id AND v.version <= l.upto AND v.state = 'admitted'
$$;
/* THE COMMON BASE of two branches: the NEAREST common version of their heads' lineages (the highest version both descend from; NULL when they
   share none — then every differing key is the source's change, tbr_diverging's NULL-base rule). Into actual a merge keeps B30's base (the
   source's fork point); between two non-actual branches this is the base. */
CREATE OR REPLACE FUNCTION twin.twx_common_base(p_twin uuid, p_a text, p_b text) RETURNS int
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT max(a.version) FROM twin.twx_lineage(p_twin, p_a, twin.tbr_head(p_twin, p_a)) a JOIN twin.twx_lineage(p_twin, p_b, twin.tbr_head(p_twin, p_b)) b ON b.version = a.version
$$;
REVOKE ALL ON FUNCTION twin.twx_lineage(uuid, text, int), twin.twx_common_base(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.twx_lineage(uuid, text, int), twin.twx_common_base(uuid, text, text) TO eye_app, eye_commit;


/* OPEN A MERGE (twin.branch.merge) — 0103:508 copied whole, the B33 twin changes marked: a NEW OVERLOAD naming the TARGET branch. A holder of
   the action asks to merge branch X into a target — `actual` (B30's merge, unchanged: the base is X's fork point) or ANOTHER non-actual branch
   (B33: the base is the two heads' nearest common version, twin.twx_common_base); the server computes the diverging keys from the two admitted
   heads and the base and routes twin.reconciliation to the twin's owner. The source is never actual: refreshing a branch FROM actual is a
   draft on the branch carrying from actual, not a merge. */
CREATE OR REPLACE FUNCTION twin.open_merge(
  p_merge_id uuid, p_twin uuid, p_tenant uuid, p_domain uuid, p_source_branch text, p_target_branch text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_src int; v_tgt int; v_base int; v_div jsonb; m twin.branch_merges%ROWTYPE; v_ev uuid; v_item uuid; v_live uuid;
        v_target text := coalesce(p_target_branch, 'actual');   -- B33 twin
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.merge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch merge rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'branch merge');
  PERFORM 1 FROM twin.twins_current x WHERE x.twin_id = p_twin FOR UPDATE;
  IF p_source_branch IS NULL OR p_source_branch !~ '^[a-z][a-z0-9-]{0,40}$' OR p_source_branch = 'actual' THEN
    IF v_target = 'actual' THEN   -- B33 twin: B30's text for a merge into actual, word for word
      RAISE EXCEPTION 'branch merge rejected (branch): a merge takes a branch other than actual back into actual' USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'branch merge rejected (branch): a merge takes a branch other than actual into another branch; refreshing a branch FROM actual is not a merge (open a draft on the branch carrying from actual)' USING ERRCODE = '22023';   -- B33 twin
  END IF;
  -- B33 twin: the target is actual or another branch of the twin, never the source itself
  IF v_target !~ '^[a-z][a-z0-9-]{0,40}$' OR v_target = p_source_branch THEN
    RAISE EXCEPTION 'branch merge rejected (branch): the target is actual or another branch of the twin than the source (%)', p_source_branch USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'branch merge rejected (reason): a merge says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  v_src := twin.tbr_head(p_twin, p_source_branch);
  IF v_src IS NULL THEN RAISE EXCEPTION 'branch merge rejected (unknown_branch): branch % of this twin has no admitted version', p_source_branch USING ERRCODE = '23503'; END IF;
  v_tgt := twin.tbr_head(p_twin, v_target);   -- B33 twin: the target's head
  IF v_tgt IS NULL THEN
    IF v_target = 'actual' THEN RAISE EXCEPTION 'branch merge rejected (unknown_branch): actual has no admitted version to merge into' USING ERRCODE = '23503'; END IF;
    RAISE EXCEPTION 'branch merge rejected (unknown_branch): branch % of this twin has no admitted version to merge into', v_target USING ERRCODE = '23503';   -- B33 twin
  END IF;
  -- B33 twin: one live merge per (source, target)
  SELECT x.merge_id INTO v_live FROM twin.branch_merges x WHERE x.twin_id = p_twin AND x.source_branch = p_source_branch AND x.target_branch = v_target AND x.state IN ('open', 'reconciled', 'completing');
  IF FOUND THEN
    IF v_target = 'actual' THEN RAISE EXCEPTION 'branch merge rejected (duplicate): branch % already has merge % in progress', p_source_branch, v_live USING ERRCODE = '23505'; END IF;
    RAISE EXCEPTION 'branch merge rejected (duplicate): branch % already has merge % into % in progress', p_source_branch, v_live, v_target USING ERRCODE = '23505';   -- B33 twin
  END IF;
  -- B33 twin: into actual the base stays the branch's fork point (B30); between two non-actual branches it is their nearest common version
  v_base := CASE WHEN v_target = 'actual' THEN twin.tbr_fork_base(p_twin, p_source_branch) ELSE twin.twx_common_base(p_twin, p_source_branch, v_target) END;
  v_div := twin.tbr_diverging(p_twin, v_src, v_tgt, v_base);
  IF jsonb_array_length(v_div) = 0 THEN
    RAISE EXCEPTION 'branch merge rejected (state): branch % (v%) changes nothing that differs from % (v%); there is nothing to merge', p_source_branch, v_src, v_target, v_tgt USING ERRCODE = '22023';   -- B33 twin: the target named
  END IF;
  INSERT INTO twin.branch_merges (merge_id, scope, tenant_id, domain_id, twin_id, source_branch, target_branch, source_version, target_version, base_version, diverging, state, reason, opened_by, correlation_id)
  VALUES (p_merge_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_source_branch, v_target /* B33 twin */, v_src, v_tgt, v_base, v_div, 'open', btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO m;
  v_ev := twin.tbr_event(p_tenant, p_domain, p_twin, p_merge_id, 'merge.opened', p_actor,
    jsonb_build_object('source_branch', p_source_branch, 'source_version', v_src, 'target_version', v_tgt, 'base_version', v_base,
                       'diverging_keys', (SELECT jsonb_agg(d -> 'key') FROM jsonb_array_elements(v_div) d), 'reason', btrim(p_reason))
    || CASE WHEN v_target = 'actual' THEN '{}'::jsonb ELSE jsonb_build_object('target_branch', v_target, 'base', 'common_version') END,   -- B33 twin: B30's details unchanged for actual
    p_correlation, p_event_id);
  v_item := twin.tbr_notify(p_tenant, p_domain, 'twin.reconciliation', 'twin_branch', p_merge_id,
    format('Merge of branch %s into %s awaits reconciliation of %s diverging key(s) — %s', p_source_branch, v_target /* B33 twin */, jsonb_array_length(v_div), t.title),
    jsonb_build_array('merge_requires_reconciliation'), t.owner_principal_id, v_ev, 'twin.branch_merge.opened',
    jsonb_build_object('twin_id', p_twin, 'merge_id', p_merge_id, 'source_branch', p_source_branch, 'diverging', jsonb_array_length(v_div))
    || CASE WHEN v_target = 'actual' THEN '{}'::jsonb ELSE jsonb_build_object('target_branch', v_target) END,   -- B33 twin
    interval '3 days', p_actor, p_correlation);
  RETURN (to_jsonb(m) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('unresolved', to_jsonb(twin.tbr_unresolved(p_merge_id)), 'attention_item_id', v_item);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.open_merge(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.open_merge(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,uuid) TO eye_commit;

/* The B30 signature (0103:508) kept as a WRAPPER passing 'actual' — B30's TS, harness and any caller of the nine-argument port stand
   unchanged (same answers, same refusals). */
CREATE OR REPLACE FUNCTION twin.open_merge(
  p_merge_id uuid, p_twin uuid, p_tenant uuid, p_domain uuid, p_source_branch text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY INVOKER SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT twin.open_merge(p_merge_id, p_twin, p_tenant, p_domain, p_source_branch, 'actual'::text, p_reason, p_actor, p_event_id, p_correlation)
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION twin.open_merge(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.open_merge(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

/* RESOLVE ONE DIVERGING KEY (twin.branch.reconcile) — 0103:552 copied whole, the B33 twin change marked: the scenario refusal applies only when
   the merge's target is actual (a scenario value moves between scenario branches). */
CREATE OR REPLACE FUNCTION twin.resolve_merge_key(
  p_merge uuid, p_tenant uuid, p_domain uuid, p_key text, p_resolution text, p_kind text, p_value jsonb, p_unit text, p_citations jsonb, p_note text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; t twin.twins_current%ROWTYPE; d jsonb; c jsonb; v_ord int; v_unres text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch merge rejected (unknown_merge): % is not a merge of this domain', p_merge USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(m.twin_id, p_tenant, p_domain, 'branch merge');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'branch merge', 'reconciling a merge');
  IF m.state NOT IN ('open', 'reconciled') THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is %; a key is resolved while the merge is open or reconciled', p_merge, m.state USING ERRCODE = '2F002';
  END IF;
  SELECT x INTO d FROM jsonb_array_elements(m.diverging) x WHERE x ->> 'key' = p_key;
  IF d IS NULL THEN RAISE EXCEPTION 'branch merge rejected (unknown_key): % is not a diverging key of merge %', p_key, p_merge USING ERRCODE = '23503'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('keep_target', 'take_branch', 'reconciled') THEN
    RAISE EXCEPTION 'branch merge rejected (resolution): a key is resolved keep_target, take_branch or reconciled' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'branch merge rejected (note): a resolution says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  -- B33 twin: a scenario value never becomes ACTUAL state; between two scenario branches it moves (take_branch into a non-actual target)
  IF p_resolution = 'take_branch' AND (d -> 'source' ->> 'kind') = 'scenario' AND m.target_branch = 'actual' THEN
    RAISE EXCEPTION 'branch merge rejected (scenario): % is a SCENARIO value on branch %; a scenario value does not become actual state — keep actual''s value or reconcile it with evidence', p_key, m.source_branch USING ERRCODE = '22023';
  END IF;
  IF p_resolution <> 'reconciled' THEN
    IF p_value IS NOT NULL OR p_kind IS NOT NULL OR coalesce(jsonb_array_length(p_citations), 0) > 0 THEN
      RAISE EXCEPTION 'branch merge rejected (resolution): only a reconciled key states a value, a kind and citations' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_kind IS NULL OR p_kind NOT IN ('assumed', 'estimated') THEN
      RAISE EXCEPTION 'branch merge rejected (kind): a reconciled value is assumed or estimated — the owner''s judgement, never observed' USING ERRCODE = '22023';
    END IF;
    IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN RAISE EXCEPTION 'branch merge rejected (value): a reconciled key states its value' USING ERRCODE = '22023'; END IF;
    IF NOT twin.citations_ok(p_citations) OR jsonb_array_length(p_citations) = 0 OR twin.citation_count(p_citations, 'claim') > 0
       OR twin.citation_count(p_citations, 'evidence') + twin.citation_count(p_citations, 'assumption') = 0 THEN
      RAISE EXCEPTION 'branch merge rejected (citations): a reconciled value cites the evidence or the assumption it rests on — exact {kind, id, version, digest}' USING ERRCODE = '22023';
    END IF;
    FOR c IN SELECT * FROM jsonb_array_elements(p_citations) LOOP
      IF (c ->> 'kind') <> 'entity' AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
           WHERE o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int AND o.content_digest = (c ->> 'digest')
             AND o.tenant_id = p_tenant AND o.domain_id = p_domain) THEN
        RAISE EXCEPTION 'branch merge rejected (unknown_citation): % %@% is not an exact object of this domain', c ->> 'kind', c ->> 'id', c ->> 'version' USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;
  SELECT coalesce(max(r.ordinal), 0) + 1 INTO v_ord FROM twin.merge_resolutions r WHERE r.merge_id = p_merge AND r.key = p_key;
  INSERT INTO twin.merge_resolutions (merge_id, key, ordinal, scope, tenant_id, domain_id, resolution, kind, value, unit, citations, note, resolved_by, correlation_id)
  VALUES (p_merge, p_key, v_ord, 'DOMAIN', p_tenant, p_domain, p_resolution, CASE WHEN p_resolution = 'reconciled' THEN p_kind END,
          CASE WHEN p_resolution = 'reconciled' THEN p_value END, CASE WHEN p_resolution = 'reconciled' THEN p_unit END,
          CASE WHEN p_resolution = 'reconciled' THEN p_citations ELSE '[]'::jsonb END, btrim(p_note), p_actor, p_correlation);
  PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.key_resolved', p_actor,
    jsonb_build_object('key', p_key, 'ordinal', v_ord, 'resolution', p_resolution, 'conflict', d -> 'conflict', 'change', d -> 'change'), p_correlation, p_event_id);
  v_unres := twin.tbr_unresolved(p_merge);
  IF cardinality(v_unres) = 0 AND m.state = 'open' THEN
    UPDATE twin.branch_merges SET state = 'reconciled' WHERE merge_id = p_merge;
    PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.reconciled', p_actor,
      jsonb_build_object('keys', jsonb_array_length(m.diverging)), p_correlation);
  END IF;
  RETURN (SELECT (to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('unresolved', to_jsonb(v_unres), 'key', p_key, 'ordinal', v_ord)
            FROM twin.branch_merges x WHERE x.merge_id = p_merge);
END $$ LANGUAGE plpgsql;

/* COMPLETE A MERGE (twin.branch.merge) — 0103:623 copied whole, the B33 twin changes marked: the heads compared, the open draft looked for and
   the plan's draft opened on the merge's TARGET branch (actual, or a non-actual branch); the words for actual unchanged. */
CREATE OR REPLACE FUNCTION twin.complete_merge(p_merge uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; t twin.twins_current%ROWTYPE; v_unres text[]; v_draft int; v_expected jsonb; v_target jsonb; v_except text[]; v_ground jsonb;
        v_into text;   -- B33 twin: 'back into actual' or 'into <target>' (B30's words for actual)
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.merge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch merge rejected (unknown_merge): % is not a merge of this domain', p_merge USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(m.twin_id, p_tenant, p_domain, 'branch merge');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'branch merge', 'completing a merge');
  IF m.state NOT IN ('open', 'reconciled', 'completing') THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is %', p_merge, m.state USING ERRCODE = '2F002';
  END IF;
  v_into := CASE WHEN m.target_branch = 'actual' THEN 'back into actual' ELSE 'into ' || m.target_branch END;   -- B33 twin
  v_unres := twin.tbr_unresolved(p_merge);
  IF cardinality(v_unres) > 0 THEN
    RAISE EXCEPTION 'branch merge rejected (unreconciled): merging branch % % is refused until reconciliation — % of % diverging key(s) unresolved: %',   -- B33 twin: the target named
      m.source_branch, v_into, cardinality(v_unres), jsonb_array_length(m.diverging), array_to_string(v_unres, ', ') USING ERRCODE = '2F002';
  END IF;
  IF twin.tbr_head(m.twin_id, m.source_branch) IS DISTINCT FROM m.source_version OR twin.tbr_head(m.twin_id, m.target_branch) IS DISTINCT FROM m.target_version THEN   -- B33 twin: the target's head
    RAISE EXCEPTION 'branch merge rejected (stale): the heads moved since merge % was opened (branch % v% → v%, % v% → v%); withdraw it and open a new merge',
      p_merge, m.source_branch, m.source_version, twin.tbr_head(m.twin_id, m.source_branch), m.target_branch, m.target_version, twin.tbr_head(m.twin_id, m.target_branch) USING ERRCODE = '2F002';
  END IF;
  SELECT v.version INTO v_draft FROM twin.twin_versions v WHERE v.twin_id = m.twin_id AND v.branch_id = m.target_branch AND v.state = 'draft';   -- B33 twin: the draft on the target
  IF m.state <> 'completing' THEN
    IF v_draft IS NOT NULL THEN
      RAISE EXCEPTION 'branch merge rejected (state): % has an open draft v%; admit or withdraw it before the merge is completed', m.target_branch, v_draft USING ERRCODE = '2F002';   -- B33 twin
    END IF;
    UPDATE twin.branch_merges SET state = 'completing', completing_by = p_actor, completing_at = clock_timestamp() WHERE merge_id = p_merge;
    PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.completing', p_actor,
      jsonb_build_object('target_version', m.target_version, 'source_version', m.source_version), p_correlation, p_event_id);
  ELSIF m.completing_by IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is being completed by %', p_merge, m.completing_by USING ERRCODE = '2F002';
  END IF;
  v_expected := twin.tbr_merge_expected(p_merge);
  v_target := twin.tbr_element_map(m.twin_id, m.target_version);
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_except
    FROM (SELECT jsonb_object_keys(v_target) k) x WHERE (v_expected -> k) IS DISTINCT FROM (v_target -> k);
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'resolution', r.resolution, 'kind', r.kind, 'value', r.value, 'unit', r.unit, 'citations', r.citations) ORDER BY r.key), '[]'::jsonb)
    INTO v_ground
    FROM twin.tbr_resolutions(p_merge) r
   WHERE (r.resolution = 'take_branch' AND v_expected ? r.key) OR r.resolution = 'reconciled';
  RETURN (SELECT (to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id') FROM twin.branch_merges x WHERE x.merge_id = p_merge)
         || jsonb_build_object('plan', jsonb_build_object('carry_from', m.target_version, 'except', to_jsonb(v_except), 'ground', v_ground, 'expected', v_expected,
                                                          'open_draft', v_draft, 'branch_id', m.target_branch /* B33 twin: the branch the draft opens on */));
END $$ LANGUAGE plpgsql;

/* THE MERGE'S ADMISSION — 0103:1009 copied whole, the B33 twin change marked: an admission on ANY branch while a merge INTO that branch is
   COMPLETING must carry its plan — then the merge is merged in the same transaction; otherwise the admission is refused (the target is held).
   The trigger is re-created WHEN any draft is admitted (was: on actual only). */
CREATE OR REPLACE FUNCTION twin.tbr_merge_admitted() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; v_expected jsonb; v_have jsonb; v_diff text[];
BEGIN
  SELECT * INTO m FROM twin.branch_merges x WHERE x.twin_id = NEW.twin_id AND x.state = 'completing' AND x.target_branch = NEW.branch_id FOR UPDATE;   -- B33 twin: the merge whose TARGET is this branch
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_expected := twin.tbr_merge_expected(m.merge_id);
  v_have := twin.tbr_element_map(NEW.twin_id, NEW.version);
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_diff
    FROM (SELECT jsonb_object_keys(v_expected) k UNION SELECT jsonb_object_keys(v_have)) x WHERE (v_expected -> k) IS DISTINCT FROM (v_have -> k);
  IF cardinality(v_diff) > 0 OR NEW.supersedes IS DISTINCT FROM m.target_version THEN
    RAISE EXCEPTION 'branch merge rejected (state): % is held by merge % (branch %) being completed; v% does not carry its reconciled plan (differs on: %)',   -- B33 twin: the target named
      NEW.branch_id, m.merge_id, m.source_branch, NEW.version, CASE WHEN cardinality(v_diff) = 0 THEN 'the version it supersedes' ELSE array_to_string(v_diff, ', ') END USING ERRCODE = '2F002';
  END IF;
  UPDATE twin.branch_merges SET state = 'merged', merged_version = NEW.version, merged_at = clock_timestamp() WHERE merge_id = m.merge_id;
  PERFORM twin.tbr_event(m.tenant_id, m.domain_id, m.twin_id, m.merge_id, 'merge.merged', public.eye_principal(),
    jsonb_build_object('merged_version', NEW.version, 'source_branch', m.source_branch, 'source_version', m.source_version, 'target_version', m.target_version,
                       'state_set_digest', NEW.state_set_digest)
    || CASE WHEN m.target_branch = 'actual' THEN '{}'::jsonb ELSE jsonb_build_object('target_branch', m.target_branch) END,   -- B33 twin: the target named (B30's details unchanged for actual)
    m.correlation_id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER tbr_merge_admitted ON twin.twin_versions;
CREATE TRIGGER tbr_merge_admitted AFTER UPDATE OF state ON twin.twin_versions
  FOR EACH ROW WHEN (OLD.state = 'draft' AND NEW.state = 'admitted' /* B33 twin: any branch (was: AND NEW.branch_id = 'actual') */) EXECUTE FUNCTION twin.tbr_merge_admitted();

/* NO MERGE AROUND THE MERGE — 0103:1034 copied whole, the B33 twin change marked (generalised to the target): a draft opened on branch T
   carrying from a version of branch S while a merge S → T is in progress is refused — merging S into T goes through its merge, refused until
   reconciliation. (Carry across branches stays open for every pair with no merge in progress.) */
CREATE OR REPLACE FUNCTION twin.tbr_merge_bypass() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_from text; m twin.branch_merges%ROWTYPE; v_to text := NEW.details ->> 'branch_id';   -- B33 twin
BEGIN
  IF v_to IS NULL OR NEW.details ->> 'carried_from' IS NULL THEN RETURN NEW; END IF;   -- B33 twin: a draft on ANY branch (was: on actual only)
  SELECT v.branch_id INTO v_from FROM twin.twin_versions v WHERE v.twin_id = NEW.twin_id AND v.version = (NEW.details ->> 'carried_from')::int;
  IF v_from IS NULL OR v_from = v_to THEN RETURN NEW; END IF;   -- B33 twin (was: v_from = 'actual'; a branch never merges from actual, so this is the same for a draft on actual)
  SELECT * INTO m FROM twin.branch_merges x WHERE x.twin_id = NEW.twin_id AND x.source_branch = v_from AND x.target_branch = v_to AND x.state IN ('open', 'reconciled', 'completing');   -- B33 twin: the merge from that branch INTO this one
  IF FOUND THEN
    RAISE EXCEPTION 'branch merge rejected (unreconciled): branch % has merge % in progress (%); merging it % goes through the merge, refused until reconciliation',
      v_from, m.merge_id, m.state, CASE WHEN v_to = 'actual' THEN 'back into actual' ELSE 'into ' || v_to END USING ERRCODE = '2F002';   -- B33 twin: the target named (B30's words for actual)
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

/* THE MERGE'S ITEM CLOSED (MAP TW1's recommendation, the TW7 idiom): when a merge is MERGED (tbr_merge_admitted's update, in the admission's
   transaction), REFUSED or WITHDRAWN (twin.close_merge's update), its twin.reconciliation item (subject twin_branch) is closed with the outcome
   as the reason — attention rows only, through the prelude's executive.b33_close_items. */
CREATE OR REPLACE FUNCTION twin.twx_merge_item_closes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = twin, executive, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM executive.b33_close_items(NEW.tenant_id, NEW.domain_id, 'twin.reconciliation', 'twin_branch', NEW.merge_id,
    CASE NEW.state WHEN 'merged' THEN format('merge %s of branch %s into %s merged as v%s', NEW.merge_id, NEW.source_branch, NEW.target_branch, NEW.merged_version)
                   ELSE format('merge %s of branch %s into %s %s: %s', NEW.merge_id, NEW.source_branch, NEW.target_branch, NEW.state, NEW.close_reason) END,
    coalesce(NEW.closed_by, public.eye_principal(), NEW.completing_by, NEW.opened_by), NULL);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION twin.twx_merge_item_closes() FROM PUBLIC;
CREATE TRIGGER twx_merge_item_closes AFTER UPDATE OF state ON twin.branch_merges
  FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state AND NEW.state IN ('merged', 'refused', 'withdrawn')) EXECUTE FUNCTION twin.twx_merge_item_closes();

-- ─────────────────────────────────────────────────────────────────────
-- §TW2 / §TW3 THE SCENARIO CITATION AND THE SCENARIO-ELEMENT FORM — TS and web only (BranchService.groundScenario cites the SCN object beside
-- or instead of the branch's assumption; the prelude's twin.citations_ok accepts the kind, tbr_scenario_basis (0103) already counts it).
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- §TW4 / §TW5 THE ESTIMATE CITATION AND THE CROSS-TWIN DEPENDENCY CHECK BEFORE PUBLISH
-- ─────────────────────────────────────────────────────────────────────
/*
 * PROPOSE an estimate (twin.estimate.propose) — 0103:2502 copied whole, ONE B33 twin change marked (TW5): the CROSS-TWIN DEPENDENCY CHECK
 * before publish (the head's dependency read; uncertain → an ambiguity reason naming each upstream; recorded in constraint_check.dependency).
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
        v_dep jsonb; v_up jsonb; v_constraint jsonb := p_constraint;   -- B33 twin (TW5)
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
  -- B33 twin (TW5, V03-T-308 "cross-twin dependencies"): THE CROSS-TWIN DEPENDENCY CHECK BEFORE PUBLISH — the head's dependency read
  -- (twin.version_freshness, over the live twin links into this twin): UNCERTAIN → an ambiguity reason naming each upstream and why (no_head,
  -- stale, unverified, behind), so a material or not the estimate is routed and approved only with the owner's note; the read is recorded in
  -- constraint_check.dependency (a twin with no upstream records nothing: B30's rows unchanged). The decision re-reads it at publication.
  IF h.version IS NOT NULL THEN v_dep := twin.version_freshness(p_twin, h.version) -> 'dependency'; END IF;
  IF v_dep IS NOT NULL AND coalesce(v_dep ->> 'state', 'none') <> 'none' THEN
    v_constraint := p_constraint || jsonb_build_object('dependency', jsonb_build_object('state', v_dep -> 'state', 'head_version', h.version, 'upstream', v_dep -> 'upstream', 'rule', v_dep -> 'rule'));
    IF v_dep ->> 'state' = 'uncertain' THEN
      FOR v_up IN SELECT * FROM jsonb_array_elements(v_dep -> 'upstream') LOOP
        IF v_up ->> 'freshness' IN ('stale', 'no_head') OR v_up ->> 'verification_state' = 'unverified' OR coalesce((v_up ->> 'behind')::boolean, false) THEN
          v_amb_reasons := v_amb_reasons || to_jsonb(format('the cross-twin dependency on %s (%s) is uncertain: %s', v_up ->> 'title', v_up ->> 'twin_id',
            concat_ws(', ', CASE WHEN v_up ->> 'freshness' = 'no_head' THEN 'no_head (the upstream has no admitted head)' END,
                            CASE WHEN v_up ->> 'freshness' = 'stale' THEN format('stale (%s days, against its own policy)', v_up ->> 'age_days') END,
                            CASE WHEN v_up ->> 'verification_state' = 'unverified' THEN 'unverified (a cited input of its head was corrected)' END,
                            CASE WHEN coalesce((v_up ->> 'behind')::boolean, false) THEN format('behind (this head cites v%s, the upstream head is v%s)', v_up ->> 'cited_version', v_up ->> 'head_version') END)));
        END IF;
      END LOOP;
    END IF;
  END IF;
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
          v_cands, v_spread, jsonb_build_object('qualified_estimators', v_n_q, 'disqualified_estimators', v_n_d), v_constraint /* B33 twin (was: p_constraint) */, v_outcome, v_range, v_mat, v_material,
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

/*
 * DECIDE an estimate (twin.estimate.decide) — LAST 0106:130 (0104's contract at publication, 0106's shared contract lock) copied whole, the
 * B33 twin changes marked: TW5 — the cross-twin dependency re-read at publication (no head / unverified upstream → dependency 409; stale /
 * behind → the owner's note); TW4 — the admitted element carries exactly this estimate's citation (else citation 422). The routed item is
 * closed by the trigger twx_estimate_item_closes (TW7), not here.
 */
CREATE OR REPLACE FUNCTION twin.decide_estimate(p_estimate_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_new_version integer, p_actor uuid, p_correlation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'twin', 'observation', 'simulation', 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE x twin.estimates%ROWTYPE; v_owner uuid; nv twin.twin_versions%ROWTYPE; el twin.state_elements%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), '');
        v_pin jsonb; v_set simulation.constraint_sets%ROWTYPE; v_cur_digest text; v_pinned text[]; v_selected text[]; v_late record;   -- 0104
        v_dep jsonb; v_hard text; v_soft text; v_cite jsonb;   -- B33 twin (TW4, TW5)
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
  -- 0104 (B30 publication concern, 2026-10-04): THE CONSTRAINT CONTRACT AT PUBLICATION. The stored check above is the proposal's HISTORY (kept
  -- as it was); the approval publishes only under the SAME live contract: every set version the proposal was checked against is still the live,
  -- current version of a live set (the digest compared), and no set the primary estimator selects came to apply after the proposal unpinned.
  -- A changed contract refuses the approval — and with it the whole transaction (the draft, the grounding and the admission roll back).
  IF p_decision = 'approved' THEN
    PERFORM simulation.lock_constraint_contract(x.tenant_id, x.domain_id, false);   -- 0106: the contract, SHARED, before any of the reads below
    FOR v_pin IN SELECT * FROM jsonb_array_elements(coalesce(x.constraint_check -> 'pins', '[]'::jsonb)) LOOP
      SELECT * INTO v_set FROM simulation.constraint_sets s WHERE s.set_id = (v_pin ->> 'set_id')::uuid AND s.tenant_id = x.tenant_id AND s.domain_id = x.domain_id;
      IF NOT FOUND OR v_set.state <> 'live' THEN
        RAISE EXCEPTION 'estimate rejected (contract): constraint set % (v%) that estimate % was checked against is %; propose again under the live contract',
          v_pin ->> 'set_key', v_pin ->> 'version', p_estimate_id, coalesce(v_set.state, 'not found') USING ERRCODE = '22023';
      END IF;
      SELECT v.digest INTO v_cur_digest FROM simulation.constraint_set_versions v WHERE v.set_id = v_set.set_id AND v.version = v_set.current_version;
      IF v_set.current_version IS DISTINCT FROM (v_pin ->> 'version')::int OR v_cur_digest IS DISTINCT FROM v_pin ->> 'digest' THEN
        RAISE EXCEPTION 'estimate rejected (contract): constraint set % was v% when estimate % was checked and is v% now; propose again under the live contract',
          v_pin ->> 'set_key', v_pin ->> 'version', p_estimate_id, v_set.current_version USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_pinned := ARRAY(SELECT p ->> 'set_key' FROM jsonb_array_elements(coalesce(x.constraint_check -> 'pins', '[]'::jsonb)) p);
    SELECT e.constraint_sets INTO v_selected FROM twin.estimators e
     WHERE e.estimator_id = (x.primary_estimator ->> 'estimator_id')::uuid AND e.version = (x.primary_estimator ->> 'version')::int;
    SELECT s.set_key, s.current_version INTO v_late FROM simulation.constraint_sets s JOIN simulation.constraint_set_versions v ON v.set_id = s.set_id AND v.version = s.current_version
     WHERE s.tenant_id = x.tenant_id AND s.domain_id = x.domain_id AND s.state = 'live' AND NOT (s.set_key = ANY (v_pinned))
       AND (coalesce(cardinality(v_selected), 0) = 0 OR s.set_key = ANY (v_selected))
       AND v.declared_at > x.proposed_at
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(v.constraints) c WHERE NOT (c ? 'applies_to') OR c -> 'applies_to' ? 'run_input')
     ORDER BY s.set_key LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'estimate rejected (contract): constraint set % (v%) came to apply after estimate % was checked; propose again under the live contract',
        v_late.set_key, v_late.current_version, p_estimate_id USING ERRCODE = '22023';
    END IF;
  END IF;
  -- B33 twin (TW5, V03-T-308): THE CROSS-TWIN DEPENDENCY RE-READ AT PUBLICATION (twin.version_freshness of the head the estimate was computed
  -- against, over the live links into this twin): an upstream with NO admitted head or UNVERIFIED refuses the publication (dependency, 409 —
  -- the whole approval rolls back); a STALE or BEHIND upstream is the ambiguous rule — approved only with the owner's note.
  IF p_decision = 'approved' AND x.head_version IS NOT NULL THEN
    v_dep := twin.version_freshness(x.twin_id, x.head_version) -> 'dependency';
    IF v_dep IS NOT NULL AND v_dep ->> 'state' = 'uncertain' THEN
      SELECT string_agg(format('%s (%s): %s', u ->> 'title', u ->> 'twin_id',
                               concat_ws(', ', CASE WHEN u ->> 'freshness' = 'no_head' THEN 'no admitted head' END,
                                               CASE WHEN u ->> 'verification_state' = 'unverified' THEN 'unverified' END)), '; ' ORDER BY u ->> 'title')
        INTO v_hard FROM jsonb_array_elements(v_dep -> 'upstream') u WHERE u ->> 'freshness' = 'no_head' OR u ->> 'verification_state' = 'unverified';
      IF v_hard IS NOT NULL THEN
        RAISE EXCEPTION 'estimate rejected (dependency): estimate % rests on twin % v%, whose upstream twin dependency is unavailable — %; publish once the upstream has a verified admitted head',
          p_estimate_id, x.twin_id, x.head_version, v_hard USING ERRCODE = '22023';
      END IF;
      SELECT string_agg(format('%s (%s): %s', u ->> 'title', u ->> 'twin_id',
                               concat_ws(', ', CASE WHEN u ->> 'freshness' = 'stale' THEN 'stale' END,
                                               CASE WHEN coalesce((u ->> 'behind')::boolean, false) THEN format('behind (cites v%s, head v%s)', u ->> 'cited_version', u ->> 'head_version') END)), '; ' ORDER BY u ->> 'title')
        INTO v_soft FROM jsonb_array_elements(v_dep -> 'upstream') u WHERE u ->> 'freshness' = 'stale' OR coalesce((u ->> 'behind')::boolean, false);
      IF v_soft IS NOT NULL AND coalesce(length(v_note), 0) < 8 THEN
        RAISE EXCEPTION 'estimate rejected (note): the cross-twin dependency is uncertain (%); an estimate on it is approved with the owner''s note (at least 8 characters)', v_soft USING ERRCODE = '22023';
      END IF;
    END IF;
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
  -- B33 twin (TW4): the ESTIMATE CITATION KIND — the admitted element carries exactly this estimate's citation {kind: estimate, id, version 1,
  -- digest: the estimate's inputs_digest} (beside the evidence its qualified inputs read); anything else refuses the approval (citation, 422).
  SELECT c INTO v_cite FROM jsonb_array_elements(el.citations) c WHERE c ->> 'kind' = 'estimate';
  IF (SELECT count(*) FROM jsonb_array_elements(el.citations) c WHERE c ->> 'kind' = 'estimate') <> 1
     OR v_cite ->> 'id' IS DISTINCT FROM p_estimate_id::text OR (v_cite ->> 'version') IS DISTINCT FROM '1' OR v_cite ->> 'digest' IS DISTINCT FROM x.inputs_digest THEN
    RAISE EXCEPTION 'estimate rejected (citation): version % carries % without exactly this estimate''s citation {kind: estimate, id: %, version: 1, digest: %}',
      p_new_version, x.key, p_estimate_id, x.inputs_digest USING ERRCODE = '22023';
  END IF;
  UPDATE twin.estimates SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note, applied_version = p_new_version WHERE estimate_id = p_estimate_id;
  PERFORM twin.tes_event(p_tenant, p_domain, x.twin_id, x.key, NULL, p_estimate_id, NULL, 'estimate.approved', p_actor,
    jsonb_build_object('applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'value', x.proposed_value, 'unit', x.unit, 'note', v_note,
                       'state_set_digest', nv.state_set_digest, 'material', x.material, 'ambiguous', x.ambiguous), p_correlation);
  RETURN jsonb_build_object('estimate_id', p_estimate_id, 'state', 'approved', 'twin_id', x.twin_id, 'key', x.key, 'value', x.proposed_value, 'unit', x.unit,
                            'applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'note', v_note);
END $function$;

-- §TW6 THE TOPOLOGY RULE ON A ROUTE-BEARING HEAD — harness only (phase6-twin-b33 TW6): no SQL.

-- ─────────────────────────────────────────────────────────────────────
-- §TW7 THE ITEMS CLOSED ON DECISION — triggers, no port re-declared (the siv_run_* precedent). Each writes ATTENTION ROWS ONLY, in the deciding
-- act's own transaction, through the prelude's executive.b33_close_items / b33_raise_routed (R4: no port calls another port that locks the
-- same rows; the attention sweep never calls these).
-- ─────────────────────────────────────────────────────────────────────

/* THE ROUTED ESTIMATE ITEM (F-P5-02; V03-T-309's note): the twin.reconciliation item of subject twin_estimate (propose_estimate's tes_notify)
   is CLOSED when the estimate leaves `proposed` — approved (the owner's decision, into its snapshot), declined (the owner's reason) or
   superseded (a later proposal of the same twin × key). */
CREATE OR REPLACE FUNCTION twin.twx_estimate_item_closes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = twin, executive, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM executive.b33_close_items(NEW.tenant_id, NEW.domain_id, 'twin.reconciliation', 'twin_estimate', NEW.estimate_id,
    CASE NEW.state WHEN 'approved' THEN format('estimate %s approved by the twin''s owner into v%s', NEW.estimate_id, NEW.applied_version)
                   WHEN 'declined' THEN format('estimate %s declined by the twin''s owner: %s', NEW.estimate_id, NEW.decision_note)
                   ELSE format('estimate %s superseded by estimate %s', NEW.estimate_id, NEW.superseded_by) END,
    coalesce(NEW.decided_by, public.eye_principal(), NEW.proposed_by), NULL);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION twin.twx_estimate_item_closes() FROM PUBLIC;
CREATE TRIGGER twx_estimate_item_closes AFTER UPDATE OF state ON twin.estimates
  FOR EACH ROW WHEN (OLD.state = 'proposed' AND NEW.state IN ('approved', 'declined', 'superseded')) EXECUTE FUNCTION twin.twx_estimate_item_closes();

/* THE OUTSIDE RUN'S ITEM (F-P5-04). INTERPRETATION (confirmed by the coordinator, B33): "an item on the completion of an OUTSIDE run" is a NEW
   twin.envelope item — raised when a run FINISHES (completed or partial) outside its operating envelope: "awaiting a twin owner's exploratory
   admission" (subject `run`, named owner the twin's owner, evaluated and routed under the domain's PUBLISHED attention policy by
   executive.b33_raise_routed — deprioritized, never hidden, when the policy does not name twin.envelope). One per run (its cause is the run
   itself). Closed by the exploratory admission (below) or by the run's retirement. */
CREATE OR REPLACE FUNCTION simulation.twx_outside_run_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = simulation, twin, executive, public, pg_catalog, pg_temp AS $$
DECLARE v_owner uuid; v_title text; v_keys text;
BEGIN
  SELECT t.owner_principal_id, t.title INTO v_owner, v_title FROM twin.twins_current t WHERE t.twin_id = NEW.twin_id;
  SELECT string_agg(k || ' = ' || (x ->> 'value') || ' outside [' || coalesce(x -> 'range' ->> 0, '') || ', ' || coalesce(x -> 'range' ->> 1, '') || ']', '; ' ORDER BY k) INTO v_keys
    FROM jsonb_each(coalesce(NEW.envelope_check -> 'keys', '{}'::jsonb)) e(k, x) WHERE (x ->> 'verdict') = 'outside';
  PERFORM executive.b33_raise_routed(NEW.tenant_id, NEW.domain_id, 'twin.envelope', 'run', NEW.run_id,
    format('Outside-envelope run on %s (%s) — awaiting a twin owner''s exploratory admission', coalesce(v_title, NEW.twin_id::text), NEW.state),
    jsonb_build_array(jsonb_build_object('class', 'outside_envelope', 'detail',
      format('the run finished %s outside the operating envelope of %s (%s); it is disabled for decision use until a twin owner admits it as exploratory', NEW.state, NEW.model_ref, coalesce(v_keys, 'keys not stated')))),
    v_owner, NEW.run_id, 'simulation.run.finished_outside_envelope',
    jsonb_build_object('run_id', NEW.run_id, 'twin_id', NEW.twin_id, 'twin_version', NEW.twin_version, 'model_ref', NEW.model_ref, 'run_state', NEW.state, 'outside', v_keys,
                       'awaiting', 'exploratory_admission', 'synthetic_state', NEW.controls -> 'synthetic_state'),
    NULL, coalesce(public.eye_principal(), NEW.operator_principal_id), NEW.correlation_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION simulation.twx_outside_run_item() FROM PUBLIC;
CREATE TRIGGER twx_outside_run_item AFTER UPDATE OF state ON simulation.runs_current
  FOR EACH ROW WHEN (OLD.state NOT IN ('completed', 'partial') AND NEW.state IN ('completed', 'partial') AND NEW.envelope_state = 'outside')
  EXECUTE FUNCTION simulation.twx_outside_run_item();

/* …closed by the EXPLORATORY ADMISSION: the twin owner's admission (simulation.admit_exploratory inserts the row, then raises its own item for
   the method stewards — this AFTER INSERT fires before that, so it closes the awaiting-admission item only). */
CREATE OR REPLACE FUNCTION simulation.twx_admission_closes_run_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = simulation, executive, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM executive.b33_close_items(NEW.tenant_id, NEW.domain_id, 'twin.envelope', 'run', NEW.run_id,
    format('run %s admitted as exploratory by a twin owner (admission %s)', NEW.run_id, NEW.admission_id), NEW.admitted_by, NEW.correlation_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION simulation.twx_admission_closes_run_item() FROM PUBLIC;
CREATE TRIGGER twx_admission_closes_run_item AFTER INSERT ON simulation.exploratory_admissions
  FOR EACH ROW EXECUTE FUNCTION simulation.twx_admission_closes_run_item();

/* …or by the run's RETIREMENT (§EX's port writes runs_current.retired_*): a retired run is never admitted (admit_exploratory refuses it) — its
   awaiting-admission item closes. A run already admitted keeps the admission's own item for the concurrence. */
CREATE OR REPLACE FUNCTION simulation.twx_retired_run_item_closes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = simulation, executive, public, pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM simulation.exploratory_admissions a WHERE a.run_id = NEW.run_id) THEN RETURN NEW; END IF;
  PERFORM executive.b33_close_items(NEW.tenant_id, NEW.domain_id, 'twin.envelope', 'run', NEW.run_id,
    format('run %s retired: %s', NEW.run_id, NEW.retire_reason), coalesce(NEW.retired_by, public.eye_principal()), NULL);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION simulation.twx_retired_run_item_closes() FROM PUBLIC;
CREATE TRIGGER twx_retired_run_item_closes AFTER UPDATE OF retired_at ON simulation.runs_current
  FOR EACH ROW WHEN (OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL AND NEW.envelope_state = 'outside') EXECUTE FUNCTION simulation.twx_retired_run_item_closes();

/* THE EXPLORATORY ADMISSION'S ITEM (F-P5-04): the twin.envelope item admit_exploratory raised for the method stewards (subject run) is CLOSED
   by the steward's concurrence (simulation.concur_exploratory's update of concurred_at). */
CREATE OR REPLACE FUNCTION simulation.twx_admission_item_closes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = simulation, executive, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM executive.b33_close_items(NEW.tenant_id, NEW.domain_id, 'twin.envelope', 'run', NEW.run_id,
    format('exploratory admission %s of run %s concurred by a method steward: %s', NEW.admission_id, NEW.run_id, NEW.concurrence_note), NEW.concurred_by, NEW.correlation_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION simulation.twx_admission_item_closes() FROM PUBLIC;
CREATE TRIGGER twx_admission_item_closes AFTER UPDATE OF concurred_at ON simulation.exploratory_admissions
  FOR EACH ROW WHEN (OLD.concurred_at IS NULL AND NEW.concurred_at IS NOT NULL) EXECUTE FUNCTION simulation.twx_admission_item_closes();

/* THE ITEMS LEFT OPEN BY DECISIONS TAKEN BEFORE B33 (the backfill — data, once, then idempotent): an estimate already approved, declined or
   superseded, a merge already merged, refused or withdrawn, an exploratory admission already concurred — each decision's item is closed
   now with a reason that says so (eye_demo: the approved 62 % estimate's item and the earlier ones, "deprioritized" and never closed). The
   closer named is the decision's own maker (decided_by / closed_by / concurred_by, else the proposer / opener / admitter). Internal (no
   grant): the migration calls it once; a harness may call it again (nothing left: 0). Returns the number of items closed. */
CREATE OR REPLACE FUNCTION twin.twx_close_decided_items() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = twin, simulation, executive, public, pg_catalog, pg_temp AS $$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN SELECT e.tenant_id, e.domain_id, e.estimate_id AS id, e.state, coalesce(e.decided_by, e.proposed_by) AS actor FROM twin.estimates e
            WHERE e.state <> 'proposed' AND EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.tenant_id = e.tenant_id AND i.domain_id = e.domain_id AND i.subject_id = e.estimate_id
                                                      AND i.signal_class = 'twin.reconciliation' AND i.subject_kind = 'twin_estimate' AND i.state <> 'closed') LOOP
    v_n := v_n + jsonb_array_length(executive.b33_close_items(r.tenant_id, r.domain_id, 'twin.reconciliation', 'twin_estimate', r.id,
             format('estimate %s was %s before B33 — its review item closed by 0111 §TW7', r.id, r.state), r.actor, NULL));
  END LOOP;
  FOR r IN SELECT m.tenant_id, m.domain_id, m.merge_id AS id, m.state, coalesce(m.closed_by, m.completing_by, m.opened_by) AS actor FROM twin.branch_merges m
            WHERE m.state IN ('merged', 'refused', 'withdrawn') AND EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.tenant_id = m.tenant_id AND i.domain_id = m.domain_id
                                                      AND i.subject_id = m.merge_id AND i.signal_class = 'twin.reconciliation' AND i.subject_kind = 'twin_branch' AND i.state <> 'closed') LOOP
    v_n := v_n + jsonb_array_length(executive.b33_close_items(r.tenant_id, r.domain_id, 'twin.reconciliation', 'twin_branch', r.id,
             format('merge %s was %s before B33 — its item closed by 0111 §TW7', r.id, r.state), r.actor, NULL));
  END LOOP;
  FOR r IN SELECT a.tenant_id, a.domain_id, a.run_id AS id, coalesce(a.concurred_by, a.admitted_by) AS actor FROM simulation.exploratory_admissions a
            WHERE a.concurred_at IS NOT NULL AND EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.tenant_id = a.tenant_id AND i.domain_id = a.domain_id
                                                      AND i.subject_id = a.run_id AND i.signal_class = 'twin.envelope' AND i.subject_kind = 'run' AND i.state <> 'closed') LOOP
    v_n := v_n + jsonb_array_length(executive.b33_close_items(r.tenant_id, r.domain_id, 'twin.envelope', 'run', r.id,
             format('the exploratory admission of run %s was concurred before B33 — its item closed by 0111 §TW7', r.id), r.actor, NULL));
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION twin.twx_close_decided_items() FROM PUBLIC;
SELECT twin.twx_close_decided_items();

-- ─────────────────────────────────────────────────────────────────────
-- §TW8 simulation.open_run's ENVELOPE REFUSAL WORDING
-- ─────────────────────────────────────────────────────────────────────
/* simulation.open_run — LAST 0092:1888-2131 copied WHOLE (signature unchanged, every other refusal word for word), the two B33 twin (TW8)
   changes marked: the envelope refusal TEXTS name the holder B30 made it (twin.envelope_ack_holder, 0103 §EN.2 — a twin owner of the
   domain only); they still said "or the domain administrator". Nothing else changes. */
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
      -- B33 twin (TW8): the holder named as it is since B30 (0103's envelope_ack_holder) — a twin owner; no longer "or the domain administrator"
      RAISE EXCEPTION 'run rejected (envelope): outside the operating envelope of % (%); a run outside the envelope needs a twin owner''s acknowledgement (envelope.acknowledge true with a reason of 8+ characters)', p_model_ref, v_outside USING ERRCODE = '22023';
    END IF;
    IF NOT twin.envelope_ack_holder(p_actor, p_tenant, p_domain) THEN
      -- B33 twin (TW8): the acknowledgement is a twin owner's of this domain (0103's envelope_ack_holder)
      RAISE EXCEPTION 'run rejected (envelope_ack): the acknowledgement of an envelope breach is a twin owner''s of this domain; the acting principal is not one (%)', v_outside USING ERRCODE = '42501';
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
-- end section `twin` (§TW)
-- ── end of the folded §TW ──


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SC — SUPPLY-CHAIN INTELLIGENCE (F-P4-14) — prefix tsc_, schema twin, actions twin.supply.*; owns twin.draft_agent_proposals
-- (folded at integration from the part-local file 0111_b33_x_supply.sql, unchanged; apply order §0, §TW, §SC, §PK, §CI)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

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
  -- the port's own bookkeeping in the same state: the routed item it raised is recorded on the row, nothing else changes
  IF OLD.state = NEW.state AND OLD.state <> 'validated' THEN
    IF (to_jsonb(NEW) - 'item_id') <> (to_jsonb(OLD) - 'item_id') THEN
      RAISE EXCEPTION 'supply inference rejected (state): inference % is %; only its routed item is recorded in place', OLD.inference_id, OLD.state USING ERRCODE = '2F002';
    END IF;
    RETURN NEW;
  END IF;
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
  -- the port's own bookkeeping in the same state: the routed item it raised is recorded on the row, nothing else changes
  IF OLD.state = NEW.state AND OLD.state IN ('proposed', 'open') AND (to_jsonb(NEW) - 'item_id') = (to_jsonb(OLD) - 'item_id') THEN RETURN NEW; END IF;
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
-- ── end of the folded §SC ──


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §PK — THE DOMAIN-PACKAGE FRAMEWORK AND THE FOUR PACKAGES (F-P4-15 ch.31/36, WS-10) — prefix dpk_, schema domain; re-declares nothing
-- (folded at integration from the part-local file 0111_b33_x_packages.sql, unchanged; apply order §0, §TW, §SC, §PK, §CI)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §PK THE DOMAIN-PACKAGE FRAMEWORK (F-P4-15 ch.31/36: PR-31-001/-002/-003/-005/-006, CAP-FW-08..11, AT-31, WS-10, UX-36-001..006).
-- Prefix dpk_; schema `domain`; actions domain.package.* / domain.assessment.* / domain.watchlist.* / domain.event.* / domain.alert.* /
-- domain.link.*; TS apps/api/src/domains/packages/. Applies ALONE on top of 0111 §0 (the prelude's package tables, the PACKAGE_GATE seam
-- domain.package_function_state and the routed raise/close helpers are USED, never re-declared). Re-declares NOTHING of another stage's.
--
-- WHAT IS BUILT HERE: the PORTS on the prelude's domain.packages / domain.package_versions (declare, version, section approval, certify,
-- activate, retire, health, enable), the per-section specialist certification (the ontology section also through the graph's own ontology
-- gate: an ACTIVE graph.ontology_versions row of namespace pkg:<key> decided by the ontology steward — two keys), the conformance/acceptance
-- run ledger (the suite is computed by the TS service from the facts these functions expose; the port records it, recomputes the verdict
-- from the blocking checks, binds it to the manifest digest), health (an INCOMPATIBLE FUNCTION disabled, the conflict exposed, a migration
-- record opened and routed as `domain.package`), assessments (versioned, source diversity measured, specialist/analyst approval of a
-- material one, DAS per approved version, as-of replay), watchlists, domain events, alerts (raised `domain.alert` under the published policy
-- through executive.b33_raise_routed) and links to B32 exposures / B25 forecasts / B27 scenarios / indicators. Every package-bound write
-- consults the PACKAGE_GATE seam and refuses `<noun> rejected (package): <reason>`.
--
-- BOUNDARY (R7, said in the code and the records): package SIGNING and publisher identity → B77 (F-P7C-01); extension namespaces in EVERY
-- layer (connectors, policies, twin templates, model suites, agent capabilities, executive views) → B78 (F-P7C-07); marketplace and
-- purchase → B112 (ENT-13); cross-profile parity → B111; the SIGNED acceptance record (AT-31, PR-31-006, UX-36-006) → R2. A package here is
-- in-tenant data declared through these ports; the four package definitions (geopolitical, technology, cyber, financial) are TS data
-- declared through them by the harness and the act — not SQL seeds. Every figure a harness or an act writes through this file is SYNTHETIC
-- unless its source contract says `real`.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §PK.1 THE VOCABULARY ─────────────────────────────────────────────────────────────────────────────────────────────────────
/* The five sections a domain specialist certifies (PR-31-003: ontology, methodology, assessment, escalation, use boundaries). */
CREATE OR REPLACE FUNCTION domain.dpk_sections() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['ontology', 'methodology', 'assessment', 'escalation', 'use_boundary'] $$;
/* The package FUNCTIONS the gate is consulted for (the incompatible one is disabled, never the whole package — PR-31-005). */
CREATE OR REPLACE FUNCTION domain.dpk_functions() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['assess', 'event', 'watch', 'alert', 'forecast', 'scenario', 'exposure', 'indicator'] $$;
/* The core's fixed entity types (0024:133-135): a package MAPS onto them, it never adds one (R8). */
CREATE OR REPLACE FUNCTION domain.dpk_core_types() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['organization', 'place', 'asset', 'product', 'vessel', 'route', 'person', 'other'] $$;
GRANT EXECUTE ON FUNCTION domain.dpk_sections(), domain.dpk_functions(), domain.dpk_core_types() TO eye_app, eye_commit;

/* What a SECTION of a manifest is — the slice a specialist approves, digested: ontology = the ontology extension (namespace, mappings,
   predicates, event kinds); methodology = the source set, indicators and models; assessment = the assessment templates and the risk meaning;
   escalation = the watchlist templates and the escalation rules; use_boundary = the controls (purposes, classification, retention, scope,
   the inputs statement) and the release (semver, compatibility, requires/conflicts, migration). jsonb's text form is canonical (sorted keys). */
CREATE OR REPLACE FUNCTION domain.dpk_section_body(p_manifest jsonb, p_section text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p_section
    WHEN 'ontology'     THEN jsonb_build_object('ontology_extension', p_manifest -> 'ontology_extension')
    WHEN 'methodology'  THEN jsonb_build_object('source_set', p_manifest -> 'source_set', 'indicators', p_manifest -> 'indicators', 'models', p_manifest -> 'models')
    WHEN 'assessment'   THEN jsonb_build_object('assessment_templates', p_manifest -> 'assessment_templates', 'risk_meaning', p_manifest -> 'risk_meaning')
    WHEN 'escalation'   THEN jsonb_build_object('watchlist_templates', p_manifest -> 'watchlist_templates', 'escalation', p_manifest -> 'escalation')
    WHEN 'use_boundary' THEN jsonb_build_object('controls', p_manifest -> 'controls', 'release', p_manifest -> 'release')
  END $$;
CREATE OR REPLACE FUNCTION domain.dpk_section_digest(p_manifest jsonb, p_section text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to(p_section || ':' || domain.dpk_section_body(p_manifest, p_section)::text, 'UTF8')), 'hex') $$;
CREATE OR REPLACE FUNCTION domain.dpk_manifest_digest(p_manifest jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog, pg_temp AS $$ SELECT encode(sha256(convert_to(p_manifest::text, 'UTF8')), 'hex') $$;
GRANT EXECUTE ON FUNCTION domain.dpk_section_body(jsonb, text), domain.dpk_section_digest(jsonb, text), domain.dpk_manifest_digest(jsonb) TO eye_app, eye_commit;

-- §PK.2 THE TABLES ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE SECTION APPROVALS (PR-31-003, UX-36-004): a named domain specialist approves (or rejects) ONE section of ONE version AT ITS DIGEST, with
   a reason and an expiry; never the version's proposer, never an agent. The ontology section names the graph ontology version it rests on
   (the second key). Append-only: a re-proposed section (a new version, a new digest) re-opens by construction; the standing decision of a
   (version, section) is its latest row. */
CREATE TABLE domain.package_sections (
  approval_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  package_id          uuid NOT NULL,
  version             int  NOT NULL,
  section             text NOT NULL CHECK (section IN ('ontology', 'methodology', 'assessment', 'escalation', 'use_boundary')),
  section_digest      text NOT NULL CHECK (section_digest ~ '^[0-9a-f]{64}$'),
  decision            text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  ontology_version_id uuid,
  approver_principal_id uuid NOT NULL,
  decided_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at          timestamptz NOT NULL,
  correlation_id      uuid NOT NULL,
  CONSTRAINT dpk_sec_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_sec_version FOREIGN KEY (package_id, version) REFERENCES domain.package_versions (package_id, version),
  CONSTRAINT dpk_sec_expiry CHECK (expires_at > decided_at),
  CONSTRAINT dpk_sec_ontology CHECK (section <> 'ontology' OR decision <> 'approved' OR ontology_version_id IS NOT NULL)
);
CREATE INDEX dpk_sec_lookup ON domain.package_sections (package_id, version, section, decided_at DESC);

/* THE RUNS (PR-31-006, AT-31, UX-36-006 — the software part): append-only. mode certification (the run certification rests on), diagnostic
   (an agent's or an owner's run that certifies nothing), health (the re-check, PK4) and acceptance (the package kind's MEASURED acceptance
   focus, PK6). checks = [{check, passed, severity: blocking|advisory, findings: [...], measured?: {...}}]; passed = every blocking check
   passed (recomputed by the port, never taken from the caller). Bound to the manifest digest it ran on. */
CREATE TABLE domain.package_conformance_runs (
  run_id           uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  package_id       uuid NOT NULL,
  version          int  NOT NULL,
  manifest_digest  text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  mode             text NOT NULL CHECK (mode IN ('certification', 'diagnostic', 'health', 'acceptance')),
  suite_version    text NOT NULL CHECK (length(suite_version) BETWEEN 3 AND 40),
  checks           jsonb NOT NULL CHECK (jsonb_typeof(checks) = 'array' AND jsonb_array_length(checks) >= 1),
  passed           boolean NOT NULL,
  facts_digest     text NOT NULL CHECK (facts_digest ~ '^[0-9a-f]{64}$'),
  facts_read_at    timestamptz NOT NULL,
  run_by           uuid NOT NULL,
  run_by_kind      text NOT NULL,
  ran_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT dpk_run_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_run_version FOREIGN KEY (package_id, version) REFERENCES domain.package_versions (package_id, version)
);
CREATE INDEX dpk_run_lookup ON domain.package_conformance_runs (package_id, version, mode, ran_at DESC);
CREATE TRIGGER dpk_run_append_only BEFORE UPDATE OR DELETE ON domain.package_conformance_runs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER dpk_sec_append_only BEFORE UPDATE OR DELETE ON domain.package_sections FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE MIGRATION RECORDS (PR-31-005 "route package governance and migration"): opened by the health port when a function is disabled or a
   conflict exposed; routed as a `domain.package` item (subject = the migration) to the owner and the specialists; completed when the
   functions are re-enabled (a passing re-run + the specialist's approval) or a new version is activated; abandoned when the package retires. */
CREATE TABLE domain.package_migrations (
  migration_id    uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL,
  from_version    int  NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  functions       text[] NOT NULL DEFAULT '{}',
  conflict        boolean NOT NULL DEFAULT false,
  findings        jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan            text NOT NULL CHECK (length(btrim(plan)) >= 8),
  state           text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'completed', 'abandoned')),
  item_id         uuid,
  opened_by       uuid NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  to_version      int,
  closed_by       uuid,
  closed_at       timestamptz,
  close_reason    text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT dpk_mig_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_mig_closed CHECK ((state = 'open') = (closed_at IS NULL) AND (closed_at IS NULL) = (closed_by IS NULL) AND (closed_at IS NULL) = (close_reason IS NULL))
);
CREATE INDEX dpk_mig_package ON domain.package_migrations (package_id, state);

/* THE LEDGER of every governed act of the framework (append-only; the package's own events — nothing is added to a pinned ledger). */
CREATE TABLE domain.package_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL,
  subject_kind    text NOT NULL CHECK (subject_kind IN ('package', 'version', 'section', 'run', 'migration', 'assessment', 'watchlist', 'event', 'alert', 'link')),
  subject_id      uuid NOT NULL,
  version         int,
  event           text NOT NULL CHECK (event ~ '^[a-z_]+\.[a-z_.]+$'),
  actor_principal_id uuid NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT dpk_ev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dpk_ev_package ON domain.package_events (package_id, occurred_at);
CREATE INDEX dpk_ev_subject ON domain.package_events (subject_id, occurred_at);
CREATE TRIGGER dpk_ev_append_only BEFORE UPDATE OR DELETE ON domain.package_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE ASSESSMENTS (PR-31-002 assessment; UX-36-003 assess/replay): versioned; each version names its template (of the package's active
   manifest), the subject ENTITIES (graph entities of the domain), the statement, a confidence, the EVIDENCE it cites (canonical EVD objects
   at their digests) and the SOURCE DIVERSITY measured over them (distinct publishers and contracts; correlated and single-origin sources
   flagged). proposed (a human or the agent) → approved (material: a named analyst or the package's specialist, never the proposer or an
   agent) | rejected; approved below the template's diversity threshold → LIMITED (never presented as complete); approved → limited (a
   challenge, stale coverage) → superseded by a later approved version. A DAS object per approved/limited version. As-of REPLAY by the
   instants recorded (decided_at, limited_at, superseded_at). */
CREATE TABLE domain.assessments (
  assessment_id     uuid NOT NULL,
  version           int  NOT NULL CHECK (version >= 1),
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  package_id        uuid NOT NULL,
  package_key       text NOT NULL,
  package_version   int  NOT NULL,
  template          text NOT NULL CHECK (template ~ '^[a-z][a-z0-9_.-]{1,62}$'),
  subject_entities  uuid[] NOT NULL CHECK (cardinality(subject_entities) BETWEEN 1 AND 50),
  statement         text NOT NULL CHECK (length(btrim(statement)) BETWEEN 8 AND 4000),
  confidence        numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence          jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) BETWEEN 1 AND 100),
  source_diversity  jsonb NOT NULL CHECK (jsonb_typeof(source_diversity) = 'object'),
  material          boolean NOT NULL,
  state             text NOT NULL CHECK (state IN ('proposed', 'approved', 'rejected', 'limited', 'superseded')),
  limited_reason    text,
  proposed_by       uuid NOT NULL,
  proposed_by_kind  text NOT NULL,
  proposed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_note     text,
  limited_at        timestamptz,
  superseded_at     timestamptz,
  object_version    int,
  correlation_id    uuid NOT NULL,
  PRIMARY KEY (assessment_id, version),
  CONSTRAINT dpk_as_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_as_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT dpk_as_limited CHECK (state <> 'limited' OR (limited_reason IS NOT NULL AND limited_at IS NOT NULL)),
  CONSTRAINT dpk_as_object CHECK (state NOT IN ('approved', 'limited') OR object_version IS NOT NULL),
  CONSTRAINT dpk_as_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);
CREATE UNIQUE INDEX dpk_as_one_standing ON domain.assessments (assessment_id) WHERE state IN ('approved', 'limited');
CREATE UNIQUE INDEX dpk_as_one_open ON domain.assessments (assessment_id) WHERE state = 'proposed';
CREATE INDEX dpk_as_package ON domain.assessments (package_id, state);

/* THE WATCHLISTS (PR-31-002 watchlist; UX-36-003 alert): versioned; the entities and indicators watched, the RULES an approved assessment or a
   confirmed event is matched against, the coverage freshness, the OWNER (the named human the alert is routed to). */
CREATE TABLE domain.watchlists (
  watchlist_id       uuid NOT NULL,
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_id         uuid NOT NULL,
  package_key        text NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  owner_principal_id uuid NOT NULL,
  entities           uuid[] NOT NULL DEFAULT '{}',
  indicators         text[] NOT NULL DEFAULT '{}',
  rules              jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) BETWEEN 1 AND 20),
  freshness_days     int  NOT NULL CHECK (freshness_days BETWEEN 1 AND 3660),
  state              text NOT NULL CHECK (state IN ('active', 'superseded', 'retired')),
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at      timestamptz,
  retired_at         timestamptz,
  retire_reason      text,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (watchlist_id, version),
  CONSTRAINT dpk_wl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_wl_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retire_reason IS NULL))
);
CREATE UNIQUE INDEX dpk_wl_one_current ON domain.watchlists (watchlist_id) WHERE state IN ('active', 'retired');
CREATE INDEX dpk_wl_package ON domain.watchlists (package_id, state);

/* THE DOMAIN EVENTS (PR-31-002; a sanction listed, a campaign observed, a filing published …): proposed by a human or the agent with evidence,
   CONFIRMED by a named analyst or specialist (never the proposer); a confirmed event is matched against the watchlists. */
CREATE TABLE domain.events (
  event_id          uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  package_id        uuid NOT NULL,
  package_key       text NOT NULL,
  package_version   int  NOT NULL,
  kind              text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_.-]{1,62}$'),
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 300),
  subject_entities  uuid[] NOT NULL CHECK (cardinality(subject_entities) BETWEEN 1 AND 50),
  occurred_on       date NOT NULL,
  evidence          jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) BETWEEN 1 AND 100),
  state             text NOT NULL CHECK (state IN ('proposed', 'confirmed', 'rejected')),
  proposed_by       uuid NOT NULL,
  proposed_by_kind  text NOT NULL,
  proposed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_note     text,
  correlation_id    uuid NOT NULL,
  CONSTRAINT dpk_de_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_de_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT dpk_de_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);
CREATE INDEX dpk_de_package ON domain.events (package_id, state);

/* THE ALERTS (UX-36-003 alert): one per (watchlist, rule, cause). RAISED as a `domain.alert` attention item (subject_kind `watchlist`, subject =
   the watchlist, cause = the alert) under the domain's PUBLISHED policy with the watchlist's owner named; WITHHELD (listed, with the reason)
   when the package's `alert` function is not active; adjudicated true/false positive by a named human (the cyber package's false-positive
   analysis); resolved by the watchlist's owner (the items closed with the reason). */
CREATE TABLE domain.alerts (
  alert_id          uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  package_id        uuid NOT NULL,
  package_key       text NOT NULL,
  watchlist_id      uuid NOT NULL,
  watchlist_version int  NOT NULL,
  rule_key          text NOT NULL,
  cause_kind        text NOT NULL CHECK (cause_kind IN ('assessment', 'event')),
  cause_id          uuid NOT NULL,
  cause_version     int  NOT NULL,
  title             text NOT NULL,
  subject_entities  uuid[] NOT NULL,
  state             text NOT NULL CHECK (state IN ('raised', 'withheld', 'resolved')),
  withheld_reason   text,
  item_id           uuid,
  item_state        text,
  owner_principal_id uuid NOT NULL,
  adjudication      text CHECK (adjudication IS NULL OR adjudication IN ('true_positive', 'false_positive')),
  adjudicated_by    uuid,
  adjudicated_at    timestamptz,
  adjudication_note text,
  resolved_by       uuid,
  resolved_at       timestamptz,
  resolve_reason    text,
  raised_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT dpk_al_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_al_once UNIQUE (watchlist_id, rule_key, cause_kind, cause_id, cause_version),
  CONSTRAINT dpk_al_withheld CHECK (state <> 'withheld' OR withheld_reason IS NOT NULL),
  CONSTRAINT dpk_al_adjudicated CHECK ((adjudication IS NULL) = (adjudicated_by IS NULL) AND (adjudicated_by IS NULL) = (adjudicated_at IS NULL)),
  CONSTRAINT dpk_al_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL))
);
CREATE INDEX dpk_al_watchlist ON domain.alerts (watchlist_id, state);
CREATE INDEX dpk_al_package ON domain.alerts (package_id, raised_at DESC);

/* THE LINKS (PR-31-002 risk / opportunity / forecast / scenario): a package REFERENCES the core's objects, never forks them (PR-31-001):
   exposure → a B32 exposure (its category in the package's risk meaning), forecast → a B25 forecast (on a target the package declares),
   scenario → a B27 scenario, indicator → a prediction indicator (on a series the package declares). */
CREATE TABLE domain.package_links (
  link_id         uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL,
  package_key     text NOT NULL,
  assessment_id   uuid,
  link_kind       text NOT NULL CHECK (link_kind IN ('exposure', 'forecast', 'scenario', 'indicator')),
  target_id       uuid NOT NULL,
  note            text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 1000),
  state           text NOT NULL CHECK (state IN ('active', 'withdrawn')),
  linked_by       uuid NOT NULL,
  linked_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  withdrawn_by    uuid,
  withdrawn_at    timestamptz,
  withdraw_reason text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT dpk_ln_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dpk_ln_withdrawn CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL) AND (withdrawn_at IS NULL) = (withdrawn_by IS NULL) AND (withdrawn_at IS NULL) = (withdraw_reason IS NULL))
);
CREATE UNIQUE INDEX dpk_ln_once ON domain.package_links (package_id, link_kind, target_id) WHERE state = 'active';

-- RLS and grants: the prelude's loop idiom (policy domain_isolation; SELECT to eye_app and eye_commit; no write grant — the definer ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['package_sections', 'package_conformance_runs', 'package_migrations', 'package_events', 'assessments', 'watchlists', 'events', 'alerts', 'package_links'] LOOP
    EXECUTE format('REVOKE ALL ON domain.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE domain.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE domain.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY domain_isolation ON domain.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON domain.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- the canonical write actions that admit the part's objects (the 0095 idiom): a package version's DPG (proposal, activation), an assessment's DAS
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('domain.package.version', ARRAY['DPG'], 'B33 §PK: proposing a domain package version admits its DPG object (the manifest, digested, state proposed) and nothing else'),
  ('domain.package.activate', ARRAY['DPG'], 'B33 §PK: activating a certified domain package version admits its DPG object (state active, the section approvals and the conformance run named) and nothing else'),
  ('domain.assessment.approve', ARRAY['DAS'], 'B33 §PK: approving a domain assessment version admits its DAS object (approved or limited, with its source diversity) and nothing else')
ON CONFLICT (action) DO NOTHING;

-- §PK.3 SHARED HELPERS (internal) ────────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal is the one recorded. */
CREATE OR REPLACE FUNCTION domain.dpk_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_assert_actor(text, uuid) FROM PUBLIC;

/* The kind of a principal (human, agent, workload, system), or NULL when not active. */
CREATE OR REPLACE FUNCTION domain.dpk_kind(p_principal uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT p.kind FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active'
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION domain.dpk_kind(uuid) FROM PUBLIC;

/* A named, active HUMAN of the tenant holding one of the roles in the domain (or at the tenant). */
CREATE OR REPLACE FUNCTION domain.dpk_human_with(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION domain.dpk_human_with(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* A principal (any kind) holding one of the roles in the domain. */
CREATE OR REPLACE FUNCTION domain.dpk_holds(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION domain.dpk_holds(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* THE GATE, consulted by every package-bound write: the prelude's seam domain.package_function_state; not active → `<noun> rejected (package)`. */
CREATE OR REPLACE FUNCTION domain.dpk_gate(p_tenant uuid, p_domain uuid, p_key text, p_function text, p_noun text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE s jsonb := domain.package_function_state(p_tenant, p_domain, p_key, p_function);
BEGIN
  IF s ->> 'state' <> 'active' THEN RAISE EXCEPTION '% rejected (package): %', p_noun, s ->> 'reason' USING ERRCODE = '22023'; END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_gate(uuid, uuid, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION domain.dpk_event(p_tenant uuid, p_domain uuid, p_package uuid, p_kind text, p_subject uuid, p_version int, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SET search_path = domain, pg_catalog, pg_temp AS $$
  INSERT INTO domain.package_events (event_id, scope, tenant_id, domain_id, package_id, subject_kind, subject_id, version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package, p_kind, p_subject, p_version, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION domain.dpk_event(uuid, uuid, uuid, text, uuid, int, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The package of a key in this domain, locked for the act (unknown → 404; retired → 409). */
CREATE OR REPLACE FUNCTION domain.dpk_package(p_tenant uuid, p_domain uuid, p_package uuid, p_noun text, p_lock boolean DEFAULT true) RETURNS domain.packages
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE;
BEGIN
  IF p_lock THEN SELECT * INTO k FROM domain.packages x WHERE x.package_id = p_package AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  ELSE SELECT * INTO k FROM domain.packages x WHERE x.package_id = p_package AND x.tenant_id = p_tenant AND x.domain_id = p_domain; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_package): no package % in this domain', p_noun, p_package USING ERRCODE = '23503'; END IF;
  IF k.state = 'retired' THEN RAISE EXCEPTION '% rejected (state): package % is retired', p_noun, k.package_key USING ERRCODE = '22023'; END IF;
  RETURN k;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_package(uuid, uuid, uuid, text, boolean) FROM PUBLIC;

/* The ACTIVE version of a package key (the manifest a package-bound write reads its templates and rules from). */
CREATE OR REPLACE FUNCTION domain.dpk_active(p_tenant uuid, p_domain uuid, p_key text) RETURNS domain.package_versions
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT v.* FROM domain.package_versions v JOIN domain.packages k ON k.package_id = v.package_id
   WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.package_key = p_key AND k.state = 'declared' AND v.state = 'active'
$$;
REVOKE ALL ON FUNCTION domain.dpk_active(uuid, uuid, text) FROM PUBLIC;

/* THE MANIFEST'S FORM (PK1). A well-formed manifest is ADMITTED as a proposal; what it CLAIMS (that its types map onto the core, that its
   sources and models are approved, that its release is compatible …) is the conformance suite's to measure, so a non-conforming but
   well-formed manifest can be proposed and its findings shown. Refused `domain package rejected (manifest)`. */
CREATE OR REPLACE FUNCTION domain.dpk_assert_manifest(p_key text, p_semver text, m jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE e jsonb; bad text;
BEGIN
  bad := CASE
    WHEN m IS NULL OR jsonb_typeof(m) <> 'object' THEN 'the manifest is an object'
    WHEN jsonb_typeof(m -> 'release') <> 'object' OR (m #>> '{release,semver}') IS DISTINCT FROM p_semver THEN format('release.semver names the version''s semver (%s)', p_semver)
    WHEN jsonb_typeof(m -> 'ontology_extension') <> 'object' THEN 'ontology_extension is an object'
    WHEN (m #>> '{ontology_extension,namespace}') IS DISTINCT FROM ('pkg:' || p_key) THEN format('ontology_extension.namespace is pkg:%s (a package extends its own namespace)', p_key)
    WHEN jsonb_typeof(m #> '{ontology_extension,mappings}') <> 'array' OR jsonb_array_length(m #> '{ontology_extension,mappings}') = 0 THEN 'ontology_extension.mappings lists the package''s types and the core types they map onto'
    WHEN jsonb_typeof(m #> '{ontology_extension,predicates}') IS DISTINCT FROM 'array' THEN 'ontology_extension.predicates is a list'
    WHEN jsonb_typeof(m -> 'source_set') <> 'array' OR jsonb_array_length(m -> 'source_set') = 0 THEN 'source_set names at least one source'
    WHEN jsonb_typeof(m -> 'indicators') IS DISTINCT FROM 'array' THEN 'indicators is a list'
    WHEN jsonb_typeof(m -> 'models') IS DISTINCT FROM 'array' THEN 'models is a list'
    WHEN jsonb_typeof(m -> 'assessment_templates') <> 'array' OR jsonb_array_length(m -> 'assessment_templates') = 0 THEN 'assessment_templates names at least one template'
    WHEN jsonb_typeof(m -> 'watchlist_templates') IS DISTINCT FROM 'array' THEN 'watchlist_templates is a list'
    WHEN jsonb_typeof(m -> 'controls') <> 'object' THEN 'controls is an object'
    WHEN jsonb_typeof(m #> '{controls,purposes}') <> 'array' OR jsonb_array_length(m #> '{controls,purposes}') = 0 THEN 'controls.purposes names the package''s use boundary'
    WHEN coalesce(m #>> '{controls,classification_ceiling}', '') NOT IN ('public', 'internal', 'confidential', 'restricted') THEN 'controls.classification_ceiling is public, internal, confidential or restricted'
    WHEN jsonb_typeof(m -> 'risk_meaning') IS DISTINCT FROM 'array' THEN 'risk_meaning is a list (category mappings onto the domain''s risk taxonomy)'
  END;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'domain package rejected (manifest): %', bad USING ERRCODE = '22023'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(m #> '{ontology_extension,mappings}') LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'type', '') !~ '^[a-z][a-z0-9_]{1,40}$' OR coalesce(e ->> 'maps_to', '') = '' THEN
      RAISE EXCEPTION 'domain package rejected (manifest): every mapping is {type, maps_to} (got %)', left(e::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(m -> 'source_set') LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'source_key', '') = '' OR jsonb_typeof(e -> 'purposes') <> 'array' OR jsonb_array_length(e -> 'purposes') = 0 THEN
      RAISE EXCEPTION 'domain package rejected (manifest): every source names its source_key and the purposes it is used for (got %)', left(e::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(m -> 'models') LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'kind', '') NOT IN ('forecast', 'behaviour') OR coalesce(e ->> 'ref', '') = '' THEN
      RAISE EXCEPTION 'domain package rejected (manifest): every model is {kind: forecast|behaviour, ref} (got %)', left(e::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(m -> 'assessment_templates') LOOP
    IF jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'key', '') !~ '^[a-z][a-z0-9_.-]{1,62}$' THEN
      RAISE EXCEPTION 'domain package rejected (manifest): every assessment template has a key (got %)', left(e::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_assert_manifest(text, text, jsonb) FROM PUBLIC;

/* The EVIDENCE a write cites: each {kind:'evidence', id, version, digest} an EVD object of the domain at that version and content digest. */
CREATE OR REPLACE FUNCTION domain.dpk_assert_evidence(p_noun text, p_tenant uuid, p_domain uuid, p_evidence jsonb) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = domain, objects, pg_catalog, pg_temp AS $$
DECLARE c jsonb;
BEGIN
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' OR jsonb_array_length(p_evidence) = 0 THEN
    RAISE EXCEPTION '% rejected (evidence): it cites at least one evidence object', p_noun USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_evidence) LOOP
    IF jsonb_typeof(c) <> 'object' OR c ->> 'kind' IS DISTINCT FROM 'evidence' OR coalesce(c ->> 'id', '') !~ '^[0-9a-f-]{36}$'
       OR jsonb_typeof(c -> 'version') <> 'number' OR coalesce(c ->> 'digest', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION '% rejected (evidence): a citation is {kind: evidence, id, version, digest} (got %)', p_noun, left(c::text, 200) USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::bigint
                     AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.content_digest = c ->> 'digest') THEN
      RAISE EXCEPTION '% rejected (unknown_evidence): no evidence %@% at that digest in this domain', p_noun, c ->> 'id', c ->> 'version' USING ERRCODE = '23503';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_assert_evidence(text, uuid, uuid, jsonb) FROM PUBLIC;

/* The subject ENTITIES of a write: active graph entities of the domain (a mistaken or retired identity is refused here). */
CREATE OR REPLACE FUNCTION domain.dpk_assert_entities(p_noun text, p_tenant uuid, p_domain uuid, p_entities uuid[]) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = domain, graph, pg_catalog, pg_temp AS $$
DECLARE e uuid;
BEGIN
  IF p_entities IS NULL OR cardinality(p_entities) = 0 THEN RAISE EXCEPTION '% rejected (subjects): it names at least one subject entity', p_noun USING ERRCODE = '22023'; END IF;
  FOREACH e IN ARRAY p_entities LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.entities_current x WHERE x.entity_id = e AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.lifecycle_state = 'active') THEN
      RAISE EXCEPTION '% rejected (unknown_entity): % is not an active entity of this domain', p_noun, e USING ERRCODE = '23503';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_assert_entities(text, uuid, uuid, uuid[]) FROM PUBLIC;

/* SOURCE DIVERSITY over cited evidence (CAP-FW-09 evidence diversity; PR-29-005 correlated sources): each evidence's source contract
   (EVD provenance SRC:<id>@<v>), its publisher and data origin; distinct publishers and contracts; CORRELATED when two contracts share a
   publisher; SINGLE-ORIGIN when one publisher carries all; `meets` against the threshold (distinct publishers ≥ p_min). INVOKER (read). */
CREATE OR REPLACE FUNCTION domain.dpk_source_diversity(p_tenant uuid, p_domain uuid, p_evidence jsonb, p_min int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, objects, observation, pg_catalog, pg_temp AS $$
  WITH cited AS (
    SELECT (c ->> 'id')::uuid AS id, (c ->> 'version')::bigint AS v FROM jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) c
     WHERE c ->> 'kind' = 'evidence' AND coalesce(c ->> 'id', '') ~ '^[0-9a-f-]{36}$'
  ), src AS (
    SELECT ci.id, substring(o.provenance_ref from '^SRC:([0-9a-f-]{36})')::uuid AS source_id
      FROM cited ci JOIN objects.canonical_objects o ON o.object_id = ci.id AND o.object_version = ci.v AND o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain
  ), cont AS (
    SELECT s.id, s.source_id, c.source_key, c.publisher, c.data_origin
      FROM src s LEFT JOIN LATERAL (SELECT x.source_key, x.publisher, x.data_origin FROM observation.source_contracts_current x
                                     WHERE x.source_id = s.source_id AND x.tenant_id = p_tenant ORDER BY x.contract_version DESC LIMIT 1) c ON true
  ), agg AS (
    SELECT count(*)::int AS evidence, count(DISTINCT source_id)::int AS contracts, count(DISTINCT publisher)::int AS publishers,
           coalesce(jsonb_agg(DISTINCT jsonb_build_object('source_key', source_key, 'publisher', publisher, 'data_origin', data_origin)) FILTER (WHERE source_key IS NOT NULL), '[]'::jsonb) AS sources,
           count(*) FILTER (WHERE source_key IS NULL)::int AS unattributed
      FROM cont
  ), corr AS (
    SELECT coalesce(jsonb_agg(publisher ORDER BY publisher), '[]'::jsonb) AS correlated FROM (SELECT publisher FROM cont WHERE publisher IS NOT NULL GROUP BY publisher HAVING count(DISTINCT source_id) > 1) z
  )
  SELECT jsonb_build_object('evidence', a.evidence, 'contracts', a.contracts, 'publishers', a.publishers, 'sources', a.sources, 'unattributed', a.unattributed,
                            'correlated_publishers', c.correlated, 'single_origin', a.publishers <= 1, 'threshold', greatest(coalesce(p_min, 1), 1),
                            'meets', a.publishers >= greatest(coalesce(p_min, 1), 1) AND a.unattributed = 0)
    FROM agg a, corr c
$$;
GRANT EXECUTE ON FUNCTION domain.dpk_source_diversity(uuid, uuid, jsonb, int) TO eye_app, eye_commit;

-- §PK.4 THE PACKAGE PORTS (PK1, PK2) ─────────────────────────────────────────────────────────────────────────────────────────
/* DECLARE a package (domain.package.declare): its key, kind, title and OWNER (a named, active human of the tenant). */
CREATE OR REPLACE FUNCTION domain.declare_package(p_package uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_title text, p_owner uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, decision, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'domain package rejected (actor): a package is declared by a named human' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9-]{1,40}$' THEN RAISE EXCEPTION 'domain package rejected (key): a package key is lower-case letters, digits and dashes (2–41 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_kind, '') NOT IN ('competitor', 'supply_chain', 'geopolitical', 'technology', 'cyber', 'financial') THEN
    RAISE EXCEPTION 'domain package rejected (kind): the kind is competitor, supply_chain, geopolitical, technology, cyber or financial' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'domain package rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN
    RAISE EXCEPTION 'domain package rejected (owner): the owner is a named, active human of the tenant' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO k FROM domain.packages x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.package_key = p_key;
  IF FOUND THEN RAISE EXCEPTION 'domain package rejected (duplicate): package % is already declared in this domain (%)', p_key, k.state USING ERRCODE = '23505'; END IF;
  INSERT INTO domain.packages (package_id, scope, tenant_id, domain_id, package_key, domain_kind, title, owner_principal_id, created_by, correlation_id)
  VALUES (p_package, 'DOMAIN', p_tenant, p_domain, p_key, p_kind, btrim(p_title), p_owner, p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'package', p_package, NULL, 'package.declared', p_actor,
                           jsonb_build_object('package_key', p_key, 'domain_kind', p_kind, 'owner', p_owner, 'boundary', 'in-tenant package; signing → B77, all-layer namespaces → B78, marketplace → B112'), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.packages x WHERE x.package_id = p_package);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.declare_package(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.declare_package(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid) TO eye_commit;

/* PROPOSE a version (domain.package.version): the owner (a named human) proposes the next version's MANIFEST at a semver; the digest is the
   port's; the DPG object (state proposed) is admitted beside it in the same write (p_object_version names it, checked here). A proposal while
   another is open (proposed or certified, not yet active) is refused — one version moves through certification at a time. The certification
   pending is routed as a `domain.package` item (subject = the package) to the specialists under the published policy. */
CREATE OR REPLACE FUNCTION domain.propose_package_version(p_package uuid, p_tenant uuid, p_domain uuid, p_semver text, p_manifest jsonb, p_object_version int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v_next int; o domain.package_versions%ROWTYPE; v_digest text; v_item jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.version']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  IF p_actor <> k.owner_principal_id THEN RAISE EXCEPTION 'domain package rejected (ownership): a version of % is proposed by its owner', k.package_key USING ERRCODE = '42501'; END IF;
  IF coalesce(p_semver, '') !~ '^[0-9]+\.[0-9]+\.[0-9]+$' THEN RAISE EXCEPTION 'domain package rejected (semver): the version is x.y.z' USING ERRCODE = '22023'; END IF;
  PERFORM domain.dpk_assert_manifest(k.package_key, p_semver, p_manifest);
  SELECT * INTO o FROM domain.package_versions x WHERE x.package_id = p_package AND x.state IN ('proposed', 'certified') ORDER BY x.version DESC LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'domain package rejected (state): version % (%) of % is still open; it is certified and activated, or retired, before the next', o.version, o.state, k.package_key USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM domain.package_versions x WHERE x.package_id = p_package AND x.semver = p_semver) THEN
    RAISE EXCEPTION 'domain package rejected (duplicate): % % is already a version of the package', k.package_key, p_semver USING ERRCODE = '23505';
  END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_next FROM domain.package_versions x WHERE x.package_id = p_package;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_type = 'DPG' AND c.object_id = p_package AND c.object_version = p_object_version AND c.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'domain package rejected (object): the DPG object version % of the package was not admitted in this write', p_object_version USING ERRCODE = '22023';
  END IF;
  v_digest := domain.dpk_manifest_digest(p_manifest);
  INSERT INTO domain.package_versions (package_id, version, scope, tenant_id, domain_id, semver, manifest, manifest_digest, object_version, proposed_by, correlation_id)
  VALUES (p_package, v_next, 'DOMAIN', p_tenant, p_domain, p_semver, p_manifest, v_digest, p_object_version, p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, v_next, 'version.proposed', p_actor,
                           jsonb_build_object('semver', p_semver, 'manifest_digest', v_digest, 'object_version', p_object_version,
                                              'sections', (SELECT jsonb_object_agg(s, domain.dpk_section_digest(p_manifest, s)) FROM unnest(domain.dpk_sections()) s)), p_correlation);
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'domain.package', 'domain_package', p_package,
              format('Package %s %s awaits certification (five sections, the conformance run)', k.package_key, p_semver),
              jsonb_build_array(format('version %s proposed by the owner; a domain specialist approves each section at its digest and certifies after a passing conformance run', v_next)),
              k.owner_principal_id, gen_random_uuid(), 'domain.package.version_proposed',
              jsonb_build_object('package_id', p_package, 'package_key', k.package_key, 'version', v_next, 'semver', p_semver, 'pending', 'certification'), NULL, p_actor, p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('item', v_item) FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = v_next);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.propose_package_version(uuid,uuid,uuid,text,jsonb,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.propose_package_version(uuid,uuid,uuid,text,jsonb,int,uuid,uuid) TO eye_commit;

/* APPROVE (or reject) a SECTION (domain.package.approve, human-gated): a named domain_specialist of the domain, never the version's proposer and
   never an agent, decides ONE section AT THE DIGEST it read (a stale digest is refused), with a reason and an expiry (1–730 days). The
   ONTOLOGY section is the second key: it is approved only when the graph's own gate has an ACTIVE ontology version of namespace pkg:<key>
   (decided by the ontology steward, graph.decide_ontology_proposal) whose entity types are the core types the manifest maps onto and whose
   predicates are the manifest's — the version is named on the approval. */
CREATE OR REPLACE FUNCTION domain.approve_package_section(p_approval uuid, p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_section text, p_digest text,
                                                          p_decision text, p_reason text, p_valid_days int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, graph, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; v_expected text; ont graph.ontology_versions%ROWTYPE; v_types text[]; v_preds text[]; v_ont uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'domain package rejected (actor): a section is certified by a named human domain specialist; an agent or a system never certifies' USING ERRCODE = '42501';
  END IF;
  IF NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_specialist']) THEN
    RAISE EXCEPTION 'domain package rejected (authority): the acting human is not a domain specialist of this domain' USING ERRCODE = '42501';
  END IF;
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.proposed_by = p_actor THEN RAISE EXCEPTION 'domain package rejected (separation_of_duties): the proposer of version % does not certify its sections', p_version USING ERRCODE = '42501'; END IF;
  IF v.state <> 'proposed' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %; sections are decided while it is proposed', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF NOT (coalesce(p_section, '') = ANY (domain.dpk_sections())) THEN
    RAISE EXCEPTION 'domain package rejected (section): the section is one of %', array_to_string(domain.dpk_sections(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'domain package rejected (decision): the decision is approved or rejected' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a section decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_valid_days IS NULL OR p_valid_days NOT BETWEEN 1 AND 730 THEN RAISE EXCEPTION 'domain package rejected (expiry): an approval holds for 1–730 days' USING ERRCODE = '22023'; END IF;
  v_expected := domain.dpk_section_digest(v.manifest, p_section);
  IF p_digest IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'domain package rejected (stale): the % section of version % is at digest %…, not the one decided (%…)', p_section, p_version, left(v_expected, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  IF p_section = 'ontology' AND p_decision = 'approved' THEN
    SELECT * INTO ont FROM graph.ontology_versions o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.namespace = v.manifest #>> '{ontology_extension,namespace}' AND o.state = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'domain package rejected (ontology): namespace % has no active ontology version — the ontology steward decides its proposal (graph.ontology.propose / graph.ontology.decide) before the section is certified', v.manifest #>> '{ontology_extension,namespace}' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT m ->> 'maps_to' ORDER BY m ->> 'maps_to'), '{}') INTO v_types FROM jsonb_array_elements(v.manifest #> '{ontology_extension,mappings}') m;
    SELECT coalesce(array_agg(DISTINCT p ->> 'predicate' ORDER BY p ->> 'predicate'), '{}') INTO v_preds FROM jsonb_array_elements(v.manifest #> '{ontology_extension,predicates}') p;
    IF NOT (ont.entity_types @> v_types AND v_types @> ont.entity_types)
       OR NOT ((SELECT coalesce(array_agg(DISTINCT p ->> 'predicate'), '{}') FROM jsonb_array_elements(ont.predicates) p) @> v_preds
               AND v_preds @> (SELECT coalesce(array_agg(DISTINCT p ->> 'predicate'), '{}') FROM jsonb_array_elements(ont.predicates) p)) THEN
      RAISE EXCEPTION 'domain package rejected (ontology): the active ontology version % of % (types %, predicates %) is not the manifest''s extension (types %, predicates %)',
        ont.version, ont.namespace, ont.entity_types, (SELECT array_agg(p ->> 'predicate') FROM jsonb_array_elements(ont.predicates) p), v_types, v_preds USING ERRCODE = '22023';
    END IF;
    v_ont := ont.version_id;
  END IF;
  INSERT INTO domain.package_sections (approval_id, scope, tenant_id, domain_id, package_id, version, section, section_digest, decision, reason, ontology_version_id, approver_principal_id, expires_at, correlation_id)
  VALUES (p_approval, 'DOMAIN', p_tenant, p_domain, p_package, p_version, p_section, v_expected, p_decision, btrim(p_reason), v_ont, p_actor, clock_timestamp() + make_interval(days => p_valid_days), p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'section', p_approval, p_version, 'section.' || p_decision, p_actor,
                           jsonb_build_object('section', p_section, 'digest', v_expected, 'ontology_version_id', v_ont, 'valid_days', p_valid_days), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.package_sections x WHERE x.approval_id = p_approval);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.approve_package_section(uuid,uuid,uuid,uuid,int,text,text,text,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.approve_package_section(uuid,uuid,uuid,uuid,int,text,text,text,text,int,uuid,uuid) TO eye_commit;

/* The standing section decisions of a version: per section, the latest decision at the version's CURRENT digest, and whether it holds now. */
CREATE OR REPLACE FUNCTION domain.dpk_section_state(p_package uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(s.section, CASE WHEN d.approval_id IS NULL THEN jsonb_build_object('state', 'open', 'digest', s.digest)
                                               ELSE jsonb_build_object('state', CASE WHEN d.decision = 'approved' AND d.expires_at <= clock_timestamp() THEN 'expired' ELSE d.decision END,
                                                                       'digest', s.digest, 'approver', d.approver_principal_id, 'decided_at', d.decided_at, 'expires_at', d.expires_at,
                                                                       'reason', d.reason, 'ontology_version_id', d.ontology_version_id, 'approval_id', d.approval_id) END), '{}'::jsonb)
    FROM (SELECT sec AS section, domain.dpk_section_digest(v.manifest, sec) AS digest FROM domain.package_versions v, unnest(domain.dpk_sections()) sec
           WHERE v.package_id = p_package AND v.version = p_version) s
    LEFT JOIN LATERAL (SELECT * FROM domain.package_sections x WHERE x.package_id = p_package AND x.version = p_version AND x.section = s.section AND x.section_digest = s.digest
                        ORDER BY x.decided_at DESC, x.approval_id DESC LIMIT 1) d ON true
$$;
GRANT EXECUTE ON FUNCTION domain.dpk_section_state(uuid, int) TO eye_app, eye_commit;

/* RECORD a run (domain.package.conformance / domain.package.acceptance): the suite the TS service computed from the facts it read, bound to
   the version's manifest digest. An AGENT's run is DIAGNOSTIC (it never certifies — the port says so); a certification run is a named human's
   (the owner, a specialist, an analyst, the administrator). The verdict is the port's: every blocking check passed. */
CREATE OR REPLACE FUNCTION domain.record_package_run(p_run uuid, p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_mode text, p_suite_version text, p_checks jsonb,
                                                     p_facts_digest text, p_facts_read_at timestamptz, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; v_kind text := domain.dpk_kind(p_actor); c jsonb; v_passed boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.conformance', 'domain.package.acceptance']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('package conformance', p_actor);
  IF (public.eye_bound_action() = 'domain.package.conformance' AND p_mode NOT IN ('certification', 'diagnostic'))
     OR (public.eye_bound_action() = 'domain.package.acceptance' AND p_mode <> 'acceptance') THEN
    RAISE EXCEPTION 'package conformance rejected (mode): the route % records % runs only', public.eye_bound_action(),
      CASE public.eye_bound_action() WHEN 'domain.package.acceptance' THEN 'acceptance' ELSE 'certification or diagnostic' END USING ERRCODE = '22023';
  END IF;
  IF v_kind IS DISTINCT FROM 'human' AND p_mode <> 'diagnostic' THEN
    RAISE EXCEPTION 'package conformance rejected (actor): an agent''s run is diagnostic — it never certifies and never records acceptance' USING ERRCODE = '42501';
  END IF;
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'package conformance', false);
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'package conformance rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state IN ('superseded', 'retired') THEN RAISE EXCEPTION 'package conformance rejected (state): version % is %', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_mode = 'certification' AND v.state <> 'proposed' THEN
    RAISE EXCEPTION 'package conformance rejected (state): a certification run is on a proposed version (version % is %)', p_version, v.state USING ERRCODE = '22023';
  END IF;
  IF p_mode = 'acceptance' AND v.state <> 'active' THEN
    RAISE EXCEPTION 'package conformance rejected (state): the acceptance focus is measured on the active version (version % is %)', p_version, v.state USING ERRCODE = '22023';
  END IF;
  IF p_checks IS NULL OR jsonb_typeof(p_checks) <> 'array' OR jsonb_array_length(p_checks) = 0 THEN
    RAISE EXCEPTION 'package conformance rejected (checks): a run records its checks' USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_checks) LOOP
    IF jsonb_typeof(c) <> 'object' OR coalesce(c ->> 'check', '') = '' OR jsonb_typeof(c -> 'passed') <> 'boolean' OR coalesce(c ->> 'severity', '') NOT IN ('blocking', 'advisory')
       OR jsonb_typeof(c -> 'findings') <> 'array' THEN
      RAISE EXCEPTION 'package conformance rejected (checks): every check is {check, passed, severity: blocking|advisory, findings[]} (got %)', left(c::text, 200) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(p_facts_digest, '') !~ '^[0-9a-f]{64}$' OR p_facts_read_at IS NULL OR p_facts_read_at > clock_timestamp() THEN
    RAISE EXCEPTION 'package conformance rejected (facts): a run names the digest and the instant of the facts it read' USING ERRCODE = '22023';
  END IF;
  SELECT bool_and((x ->> 'passed')::boolean) INTO v_passed FROM jsonb_array_elements(p_checks) x WHERE x ->> 'severity' = 'blocking';
  INSERT INTO domain.package_conformance_runs (run_id, scope, tenant_id, domain_id, package_id, version, manifest_digest, mode, suite_version, checks, passed, facts_digest, facts_read_at, run_by, run_by_kind, correlation_id)
  VALUES (p_run, 'DOMAIN', p_tenant, p_domain, p_package, p_version, v.manifest_digest, p_mode, p_suite_version, p_checks, coalesce(v_passed, true), p_facts_digest, p_facts_read_at, p_actor, coalesce(v_kind, 'system'), p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'run', p_run, p_version, 'run.' || p_mode, p_actor,
                           jsonb_build_object('passed', coalesce(v_passed, true), 'suite_version', p_suite_version,
                                              'failed', (SELECT coalesce(jsonb_agg(x ->> 'check'), '[]'::jsonb) FROM jsonb_array_elements(p_checks) x WHERE NOT (x ->> 'passed')::boolean)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.package_conformance_runs x WHERE x.run_id = p_run);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.record_package_run(uuid,uuid,uuid,uuid,int,text,text,jsonb,text,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.record_package_run(uuid,uuid,uuid,uuid,int,text,text,jsonb,text,timestamptz,uuid,uuid) TO eye_commit;

/* CERTIFY (domain.package.certify, human-gated): a named domain specialist, never the proposer, certifies a PROPOSED version when every section
   is approved at its current digest and unexpired AND the LAST certification run on this manifest passed. The certification-pending item of
   the package is closed by this act. */
CREATE OR REPLACE FUNCTION domain.certify_package_version(p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; s jsonb; r domain.package_conformance_runs%ROWTYPE; v_open text[]; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.certify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_specialist']) THEN
    RAISE EXCEPTION 'domain package rejected (authority): a version is certified by a named human domain specialist of this domain' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a certification states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.proposed_by = p_actor THEN RAISE EXCEPTION 'domain package rejected (separation_of_duties): the proposer of version % does not certify it', p_version USING ERRCODE = '42501'; END IF;
  IF v.state <> 'proposed' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %; a proposed version is certified', p_version, v.state USING ERRCODE = '22023'; END IF;
  s := domain.dpk_section_state(p_package, p_version);
  SELECT coalesce(array_agg(key || '=' || (value ->> 'state') ORDER BY key), '{}') INTO v_open FROM jsonb_each(s) WHERE value ->> 'state' <> 'approved';
  IF cardinality(v_open) > 0 THEN
    RAISE EXCEPTION 'domain package rejected (sections): every section is approved at its digest and unexpired before certification (%)', array_to_string(v_open, ', ') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM domain.package_conformance_runs x WHERE x.package_id = p_package AND x.version = p_version AND x.mode = 'certification' ORDER BY x.ran_at DESC, x.run_id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (conformance): version % has no certification run; the conformance suite runs first', p_version USING ERRCODE = '22023'; END IF;
  IF NOT r.passed OR r.manifest_digest <> v.manifest_digest THEN
    RAISE EXCEPTION 'domain package rejected (conformance): the last certification run of version % (%) did not pass (failed: %)', p_version, r.run_id,
      (SELECT string_agg(x ->> 'check', ', ') FROM jsonb_array_elements(r.checks) x WHERE x ->> 'severity' = 'blocking' AND NOT (x ->> 'passed')::boolean) USING ERRCODE = '22023';
  END IF;
  UPDATE domain.package_versions SET state = 'certified', certified_by = p_actor, certified_at = clock_timestamp() WHERE package_id = p_package AND version = p_version;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'domain.package', 'domain_package', p_package, format('version %s (%s) certified: %s', p_version, v.semver, btrim(p_reason)), p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'version.certified', p_actor,
                           jsonb_build_object('reason', btrim(p_reason), 'run_id', r.run_id, 'sections', s, 'closed_items', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('closed_items', v_closed, 'run_id', r.run_id) FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.certify_package_version(uuid,uuid,uuid,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.certify_package_version(uuid,uuid,uuid,int,text,uuid,uuid) TO eye_commit;

/* ACTIVATE (domain.package.activate, human-gated): the package OWNER activates a CERTIFIED version whose section approvals still hold; the
   prior active version is superseded (its disabled functions and conflict stay recorded on it); the open migrations of the package are
   completed by this version; the DPG object (state active) is admitted in the same write (p_object_version names it). */
CREATE OR REPLACE FUNCTION domain.activate_package_version(p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_object_version int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; prior domain.package_versions%ROWTYPE; s jsonb; v_lapsed text[]; m record; v_closed jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.activate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  IF p_actor <> k.owner_principal_id OR domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'domain package rejected (ownership): % is activated by its owner (a named human)', k.package_key USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state <> 'certified' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %; a certified version is activated', p_version, v.state USING ERRCODE = '22023'; END IF;
  s := domain.dpk_section_state(p_package, p_version);
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO v_lapsed FROM jsonb_each(s) WHERE value ->> 'state' <> 'approved';
  IF cardinality(v_lapsed) > 0 THEN
    RAISE EXCEPTION 'domain package rejected (stale): the approval of section(s) % of version % no longer holds; a new version is proposed and certified', array_to_string(v_lapsed, ', '), p_version USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_type = 'DPG' AND c.object_id = p_package AND c.object_version = p_object_version AND c.tenant_id = p_tenant
                    AND c.payload ->> 'state' = 'active' AND (c.payload ->> 'version')::int = p_version) THEN
    RAISE EXCEPTION 'domain package rejected (object): the DPG object version % (state active, version %) was not admitted in this write', p_object_version, p_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO prior FROM domain.package_versions x WHERE x.package_id = p_package AND x.state = 'active' FOR UPDATE;
  IF FOUND THEN
    UPDATE domain.package_versions SET state = 'superseded', superseded_at = clock_timestamp() WHERE package_id = p_package AND version = prior.version;
    PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, prior.version, 'version.superseded', p_actor, jsonb_build_object('by', p_version), p_correlation);
  END IF;
  UPDATE domain.package_versions SET state = 'active', activated_by = p_actor, activated_at = clock_timestamp(), object_version = p_object_version WHERE package_id = p_package AND version = p_version;
  FOR m IN SELECT * FROM domain.package_migrations x WHERE x.package_id = p_package AND x.state = 'open' FOR UPDATE LOOP
    UPDATE domain.package_migrations SET state = 'completed', to_version = p_version, closed_by = p_actor, closed_at = clock_timestamp(),
           close_reason = format('version %s (%s) activated in place of version %s', p_version, v.semver, m.from_version) WHERE migration_id = m.migration_id;
    v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, 'domain.package', 'domain_package', m.migration_id, format('migration completed by version %s (%s)', p_version, v.semver), p_actor, p_correlation);
    PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'migration', m.migration_id, p_version, 'migration.completed', p_actor, jsonb_build_object('to_version', p_version), p_correlation);
  END LOOP;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'version.activated', p_actor,
                           jsonb_build_object('supersedes', prior.version, 'object_version', p_object_version, 'closed_items', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('supersedes', prior.version, 'closed_items', v_closed) FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.activate_package_version(uuid,uuid,uuid,int,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.activate_package_version(uuid,uuid,uuid,int,int,uuid,uuid) TO eye_commit;

/* RETIRE the package (domain.package.retire, human-gated): its owner or the domain's administrator, with a reason (8+). Every open version is
   retired, open migrations abandoned, the package's items closed; what it recorded stays readable ("preserve accessible state"). */
CREATE OR REPLACE FUNCTION domain.retire_package(p_package uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; m record; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT (p_actor = k.owner_principal_id OR domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_admin'])) THEN
    RAISE EXCEPTION 'domain package rejected (ownership): % is retired by its owner or the domain''s administrator', k.package_key USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a retirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE domain.package_versions SET state = 'retired', retired_at = clock_timestamp() WHERE package_id = p_package AND state IN ('proposed', 'certified', 'active');
  v_closed := executive.b33_close_items(p_tenant, p_domain, NULL, 'domain_package', p_package, format('package %s retired: %s', k.package_key, btrim(p_reason)), p_actor, p_correlation);
  FOR m IN SELECT * FROM domain.package_migrations x WHERE x.package_id = p_package AND x.state = 'open' FOR UPDATE LOOP
    UPDATE domain.package_migrations SET state = 'abandoned', closed_by = p_actor, closed_at = clock_timestamp(), close_reason = format('package retired: %s', btrim(p_reason)) WHERE migration_id = m.migration_id;
    v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, NULL, 'domain_package', m.migration_id, format('package %s retired', k.package_key), p_actor, p_correlation);
  END LOOP;
  UPDATE domain.packages SET state = 'retired', retired_at = clock_timestamp(), retired_by = p_actor, retire_reason = btrim(p_reason) WHERE package_id = p_package;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'package', p_package, NULL, 'package.retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'closed_items', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('closed_items', v_closed) FROM domain.packages x WHERE x.package_id = p_package);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.retire_package(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.retire_package(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* WITHDRAW an open version (domain.package.withdraw): the owner withdraws a PROPOSED or CERTIFIED version (never the active one — the package
   is retired, or a later version supersedes it) with a reason; it is kept, retired; the certification-pending item is closed. The next
   version may then be proposed. */
CREATE OR REPLACE FUNCTION domain.withdraw_package_version(p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  IF p_actor <> k.owner_principal_id THEN RAISE EXCEPTION 'domain package rejected (ownership): a version of % is withdrawn by its owner', k.package_key USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state NOT IN ('proposed', 'certified') THEN
    RAISE EXCEPTION 'domain package rejected (state): version % is %; a proposed or certified version is withdrawn (the active one is superseded or the package retired)', p_version, v.state USING ERRCODE = '22023';
  END IF;
  UPDATE domain.package_versions SET state = 'retired', retired_at = clock_timestamp() WHERE package_id = p_package AND version = p_version;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'domain.package', 'domain_package', p_package, format('version %s withdrawn by the owner: %s', p_version, btrim(p_reason)), p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'version.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason), 'was', v.state, 'closed_items', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'manifest' || jsonb_build_object('closed_items', v_closed) FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.withdraw_package_version(uuid,uuid,uuid,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.withdraw_package_version(uuid,uuid,uuid,int,text,uuid,uuid) TO eye_commit;

-- §PK.5 HEALTH (PK4: PR-31-005, UX-36-005, WS-10 "disable incompatible domain packages") ───────────────────────────────────────
/* RECORD a health re-check of the ACTIVE version (domain.package.health — the owner, the specialists, the administrator, or the attention
   agent's after-tick hook `domain-package-health`): the faults the TS service evaluated from the facts it read. Each INCOMPATIBLE FUNCTION is
   added to disabled_functions with its reason and cause (never the whole package; reads keep working); a conflict is EXPOSED (state
   conflicted, the reason on every read). Nothing is re-enabled here — a passing re-run is recorded, and the specialist's approval
   (domain.enable_package_function) re-enables. A NEW disablement or conflict opens a MIGRATION record and routes it as `domain.package` (subject
   = the migration) to the owner and the policy's roles. A run is written when the findings changed since the last health run (a tick that
   finds the same thing again writes nothing). */
CREATE OR REPLACE FUNCTION domain.record_package_health(p_run uuid, p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_checks jsonb, p_disable jsonb, p_conflict jsonb,
                                                        p_facts_digest text, p_facts_read_at timestamptz, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; last domain.package_conformance_runs%ROWTYPE; fn text; v_new_fns text[] := '{}'; v_disabled jsonb;
        v_conflict jsonb; v_new_conflict boolean := false; v_passed boolean; v_mig uuid; v_item jsonb := NULL; v_reason text; c jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.health']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state <> 'active' THEN RAISE EXCEPTION 'domain package rejected (state): health is re-checked on the active version (version % is %)', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_checks IS NULL OR jsonb_typeof(p_checks) <> 'array' OR jsonb_array_length(p_checks) = 0 THEN RAISE EXCEPTION 'domain package rejected (checks): a health run records its checks' USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_checks) LOOP
    IF jsonb_typeof(c) <> 'object' OR coalesce(c ->> 'check', '') = '' OR jsonb_typeof(c -> 'passed') <> 'boolean' OR coalesce(c ->> 'severity', '') NOT IN ('blocking', 'advisory') OR jsonb_typeof(c -> 'findings') <> 'array' THEN
      RAISE EXCEPTION 'domain package rejected (checks): every check is {check, passed, severity, findings[]}' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_disable IS NULL OR jsonb_typeof(p_disable) <> 'object' THEN RAISE EXCEPTION 'domain package rejected (checks): the disabled functions are an object {function: {reason, cause}}' USING ERRCODE = '22023'; END IF;
  FOR fn IN SELECT fk FROM jsonb_object_keys(p_disable) fk ORDER BY fk LOOP
    IF NOT (fn = ANY (domain.dpk_functions())) OR length(btrim(coalesce(p_disable -> fn ->> 'reason', ''))) < 8 THEN
      RAISE EXCEPTION 'domain package rejected (checks): % is not a package function, or its reason is missing (functions: %)', fn, array_to_string(domain.dpk_functions(), ', ') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_conflict IS NOT NULL AND (jsonb_typeof(p_conflict) <> 'object' OR length(btrim(coalesce(p_conflict ->> 'reason', ''))) < 8) THEN
    RAISE EXCEPTION 'domain package rejected (checks): a conflict is {reason (8+), functions?}' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO last FROM domain.package_conformance_runs x WHERE x.package_id = p_package AND x.version = p_version AND x.mode = 'health' ORDER BY x.ran_at DESC, x.run_id DESC LIMIT 1;
  SELECT coalesce(bool_and((x ->> 'passed')::boolean), true) INTO v_passed FROM jsonb_array_elements(p_checks) x WHERE x ->> 'severity' = 'blocking';
  -- the disablements and the conflict this run adds (nothing is removed here)
  v_disabled := v.disabled_functions;
  FOR fn IN SELECT fk FROM jsonb_object_keys(p_disable) fk ORDER BY fk LOOP
    IF NOT (v_disabled ? fn) THEN
      v_disabled := v_disabled || jsonb_build_object(fn, (p_disable -> fn) || jsonb_build_object('disabled_at', clock_timestamp(), 'disabled_by', p_actor, 'run_id', p_run));
      v_new_fns := v_new_fns || fn;
    END IF;
  END LOOP;
  v_conflict := v.conflict;
  IF p_conflict IS NOT NULL AND v.conflict IS NULL THEN
    v_conflict := p_conflict || jsonb_build_object('exposed_at', clock_timestamp(), 'exposed_by', p_actor, 'run_id', p_run); v_new_conflict := true;
  END IF;
  IF last.run_id IS NOT NULL AND last.facts_digest = p_facts_digest AND cardinality(v_new_fns) = 0 AND NOT v_new_conflict THEN
    RETURN jsonb_build_object('recorded', false, 'unchanged_since', last.run_id, 'passed', last.passed, 'disabled_functions', v.disabled_functions, 'conflict', v.conflict);
  END IF;
  INSERT INTO domain.package_conformance_runs (run_id, scope, tenant_id, domain_id, package_id, version, manifest_digest, mode, suite_version, checks, passed, facts_digest, facts_read_at, run_by, run_by_kind, correlation_id)
  VALUES (p_run, 'DOMAIN', p_tenant, p_domain, p_package, p_version, v.manifest_digest, 'health', 'health/1',
          p_checks || jsonb_build_array(jsonb_build_object('check', 'faults', 'passed', p_disable = '{}'::jsonb AND p_conflict IS NULL, 'severity', 'blocking',
                                                           'findings', jsonb_build_array(jsonb_build_object('disable', p_disable, 'conflict', p_conflict)))),
          v_passed AND p_disable = '{}'::jsonb AND p_conflict IS NULL, p_facts_digest, p_facts_read_at, p_actor, coalesce(domain.dpk_kind(p_actor), 'system'), p_correlation);
  IF cardinality(v_new_fns) > 0 OR v_new_conflict THEN
    UPDATE domain.package_versions SET disabled_functions = v_disabled, conflict = v_conflict WHERE package_id = p_package AND version = p_version;
    v_reason := concat_ws('; ', CASE WHEN cardinality(v_new_fns) > 0 THEN format('function(s) %s disabled: %s', array_to_string(v_new_fns, ', '),
                                                                                (SELECT string_agg(f || ' — ' || (p_disable -> f ->> 'reason'), '; ') FROM unnest(v_new_fns) f)) END,
                                      CASE WHEN v_new_conflict THEN format('conflict exposed: %s', p_conflict ->> 'reason') END);
    v_mig := gen_random_uuid();
    INSERT INTO domain.package_migrations (migration_id, scope, tenant_id, domain_id, package_id, from_version, reason, functions, conflict, findings, plan, opened_by, correlation_id)
    VALUES (v_mig, 'DOMAIN', p_tenant, p_domain, p_package, p_version, v_reason, v_new_fns, v_new_conflict, p_checks,
            'the owner proposes a version that removes the incompatibility (it is certified and activated), or the cause is repaired, the health re-run passes and a domain specialist re-enables the function',
            p_actor, p_correlation);
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'domain.package', 'domain_package', v_mig,
                format('Package %s v%s: %s', k.package_key, p_version, left(v_reason, 400)),
                jsonb_build_array(v_reason, 'package governance and migration routed (PR-31-005)'), k.owner_principal_id, v_mig, 'domain.package.health',
                jsonb_build_object('package_id', p_package, 'package_key', k.package_key, 'version', p_version, 'migration_id', v_mig, 'functions', to_jsonb(v_new_fns), 'conflict', v_new_conflict),
                NULL, p_actor, p_correlation);
    UPDATE domain.package_migrations SET item_id = (v_item ->> 'item_id')::uuid WHERE migration_id = v_mig;
    PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'migration', v_mig, p_version, 'migration.opened', p_actor,
                             jsonb_build_object('reason', v_reason, 'functions', to_jsonb(v_new_fns), 'conflict', v_new_conflict, 'item', v_item), p_correlation);
    IF cardinality(v_new_fns) > 0 THEN
      PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'function.disabled', p_actor, jsonb_build_object('functions', to_jsonb(v_new_fns), 'disable', p_disable), p_correlation);
    END IF;
    IF v_new_conflict THEN PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'conflict.exposed', p_actor, jsonb_build_object('conflict', p_conflict), p_correlation); END IF;
  END IF;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'run', p_run, p_version, 'run.health', p_actor, jsonb_build_object('passed', v_passed AND p_disable = '{}'::jsonb AND p_conflict IS NULL), p_correlation);
  RETURN jsonb_build_object('recorded', true, 'run_id', p_run, 'passed', v_passed AND p_disable = '{}'::jsonb AND p_conflict IS NULL, 'newly_disabled', to_jsonb(v_new_fns),
                            'conflict_exposed', v_new_conflict, 'migration_id', v_mig, 'item', v_item, 'disabled_functions', v_disabled, 'conflict', v_conflict);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.record_package_health(uuid,uuid,uuid,uuid,int,jsonb,jsonb,jsonb,text,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.record_package_health(uuid,uuid,uuid,uuid,int,jsonb,jsonb,jsonb,text,timestamptz,uuid,uuid) TO eye_commit;

/* RE-ENABLE (domain.package.enable, human-gated): a named domain specialist re-enables disabled functions (and/or clears the conflict) ONLY when
   the LAST health run of the version — recorded after the disablement — PASSED for them (the cause is gone). When nothing stays disabled
   or conflicted, the open migrations are completed and their items closed. */
CREATE OR REPLACE FUNCTION domain.enable_package_function(p_package uuid, p_tenant uuid, p_domain uuid, p_version int, p_functions text[], p_clear_conflict boolean, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k domain.packages%ROWTYPE; v domain.package_versions%ROWTYPE; last domain.package_conformance_runs%ROWTYPE; fn text; v_disabled jsonb; v_conflict jsonb; m record; v_closed jsonb := '[]'::jsonb;
        v_last_disable jsonb; v_last_conflict jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.package.enable']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_specialist']) THEN
    RAISE EXCEPTION 'domain package rejected (authority): a disabled function is re-enabled by a named human domain specialist' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a re-enablement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  k := domain.dpk_package(p_tenant, p_domain, p_package, 'domain package');
  SELECT * INTO v FROM domain.package_versions x WHERE x.package_id = p_package AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_version): % has no version %', k.package_key, p_version USING ERRCODE = '23503'; END IF;
  IF v.state <> 'active' THEN RAISE EXCEPTION 'domain package rejected (state): version % is %', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF coalesce(cardinality(p_functions), 0) = 0 AND NOT coalesce(p_clear_conflict, false) THEN
    RAISE EXCEPTION 'domain package rejected (functions): name the function(s) to re-enable or clear the conflict' USING ERRCODE = '22023';
  END IF;
  FOREACH fn IN ARRAY coalesce(p_functions, '{}') LOOP
    IF NOT (v.disabled_functions ? fn) THEN RAISE EXCEPTION 'domain package rejected (state): function % of version % is not disabled', fn, p_version USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF coalesce(p_clear_conflict, false) AND v.conflict IS NULL THEN RAISE EXCEPTION 'domain package rejected (state): version % carries no conflict', p_version USING ERRCODE = '22023'; END IF;
  SELECT * INTO last FROM domain.package_conformance_runs x WHERE x.package_id = p_package AND x.version = p_version AND x.mode = 'health' ORDER BY x.ran_at DESC, x.run_id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (health): no health run of version % is recorded; re-run the health check first', p_version USING ERRCODE = '22023'; END IF;
  SELECT f -> 'findings' -> 0 -> 'disable', f -> 'findings' -> 0 -> 'conflict' INTO v_last_disable, v_last_conflict FROM jsonb_array_elements(last.checks) f WHERE f ->> 'check' = 'faults';
  FOREACH fn IN ARRAY coalesce(p_functions, '{}') LOOP
    IF last.ran_at <= ((v.disabled_functions -> fn ->> 'disabled_at')::timestamptz) OR coalesce(v_last_disable, '{}'::jsonb) ? fn THEN
      RAISE EXCEPTION 'domain package rejected (health): the last health run (%) still finds function % incompatible, or ran before it was disabled — the cause is repaired and the re-run passes first', last.run_id, fn USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(p_clear_conflict, false) AND (last.ran_at <= (v.conflict ->> 'exposed_at')::timestamptz OR (v_last_conflict IS NOT NULL AND v_last_conflict <> 'null'::jsonb)) THEN
    RAISE EXCEPTION 'domain package rejected (health): the last health run (%) still finds the conflict, or ran before it was exposed', last.run_id USING ERRCODE = '22023';
  END IF;
  v_disabled := v.disabled_functions;
  FOREACH fn IN ARRAY coalesce(p_functions, '{}') LOOP v_disabled := v_disabled - fn; END LOOP;
  v_conflict := CASE WHEN coalesce(p_clear_conflict, false) THEN NULL ELSE v.conflict END;
  UPDATE domain.package_versions SET disabled_functions = v_disabled, conflict = v_conflict WHERE package_id = p_package AND version = p_version;
  PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'version', p_package, p_version, 'function.enabled', p_actor,
                           jsonb_build_object('functions', to_jsonb(coalesce(p_functions, '{}')), 'conflict_cleared', coalesce(p_clear_conflict, false), 'run_id', last.run_id, 'reason', btrim(p_reason)), p_correlation);
  IF v_disabled = '{}'::jsonb AND v_conflict IS NULL THEN
    FOR m IN SELECT * FROM domain.package_migrations x WHERE x.package_id = p_package AND x.state = 'open' FOR UPDATE LOOP
      UPDATE domain.package_migrations SET state = 'completed', to_version = p_version, closed_by = p_actor, closed_at = clock_timestamp(),
             close_reason = format('re-enabled by a domain specialist after the passing health run %s: %s', last.run_id, btrim(p_reason)) WHERE migration_id = m.migration_id;
      v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, 'domain.package', 'domain_package', m.migration_id, format('re-enabled after the passing health run: %s', btrim(p_reason)), p_actor, p_correlation);
      PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'migration', m.migration_id, p_version, 'migration.completed', p_actor, jsonb_build_object('re_enabled', true), p_correlation);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('disabled_functions', v_disabled, 'conflict', v_conflict, 'run_id', last.run_id, 'closed_items', v_closed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.enable_package_function(uuid,uuid,uuid,int,text[],boolean,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.enable_package_function(uuid,uuid,uuid,int,text[],boolean,text,uuid,uuid) TO eye_commit;

-- §PK.6 THE FACTS the suite, the health check and the acceptance focus are computed from (INVOKER, plain SQL under the caller's RLS — N-01) ─
/* Everything a manifest names, as the core holds it NOW: the package and the version; the package's active version (contract compatibility);
   the core's fixed types and the domain's active `domain` ontology (canonical mapping, no core predicate redefined); the namespace's active
   ontology version (the graph's gate); each named SOURCE's latest contract (state, rights, purposes, origin, publisher, freshness) and its last
   evidence instant (coverage); each named forecast METHOD in the effective registry (approved, retired, quarantined) and each BEHAVIOUR model
   (implementation pinned); the risk TAXONOMY in force; every other package's active release (requires / conflicts). */
CREATE OR REPLACE FUNCTION domain.package_facts(p_package uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, graph, observation, objects, prediction, twin, pg_catalog, pg_temp AS $$
  WITH k AS (SELECT * FROM domain.packages x WHERE x.package_id = p_package),
  v AS (SELECT x.* FROM domain.package_versions x, k WHERE x.package_id = k.package_id AND x.version = p_version),
  a AS (SELECT x.* FROM domain.package_versions x, k WHERE x.package_id = k.package_id AND x.state = 'active' AND x.version <> p_version),
  srcs AS (
    SELECT DISTINCT s ->> 'source_key' AS source_key FROM v, jsonb_array_elements(v.manifest -> 'source_set') s
  ),
  src AS (
    SELECT sk.source_key, c.source_id, c.contract_version, c.lifecycle_state, c.rights_state, c.purposes, c.data_origin, c.publisher, c.freshness_threshold_seconds,
           c.classification_ceiling, c.acquisition_mode, c.authority_class,
           (SELECT max(o.recorded_at) FROM objects.canonical_objects o, k WHERE o.tenant_id = k.tenant_id AND o.domain_id = k.domain_id AND o.object_type = 'EVD'
               AND c.source_id IS NOT NULL AND o.provenance_ref LIKE 'SRC:' || c.source_id::text || '@%') AS last_evidence_at,
           lo.as_of AS last_observation_time, lo.recorded_at AS last_observation_recorded_at
      FROM srcs sk CROSS JOIN k
      LEFT JOIN LATERAL (SELECT x.* FROM observation.source_contracts_current x WHERE x.tenant_id = k.tenant_id AND x.domain_id = k.domain_id AND x.source_key = sk.source_key
                          ORDER BY x.contract_version DESC LIMIT 1) c ON true
      -- the LATEST observation of the source (by when it was recorded): the publisher's own instant for it (event_time; the observation time when
      -- the publisher states none) = its AS-OF, and when it was recorded — the publication lag is the difference (CAP-FW-11 timing)
      LEFT JOIN LATERAL (SELECT coalesce(o.event_time, o.observation_time) AS as_of, o.recorded_at FROM objects.canonical_objects o
                          WHERE o.tenant_id = k.tenant_id AND o.domain_id = k.domain_id AND o.object_type = 'OBS' AND c.source_id IS NOT NULL
                            AND o.provenance_ref LIKE 'SRC:' || c.source_id::text || '@%' ORDER BY o.recorded_at DESC LIMIT 1) lo ON true
  ),
  meth AS (
    SELECT m ->> 'ref' AS ref, e.state, e.state_reason, e.horizons, e.builtin
      FROM v CROSS JOIN k CROSS JOIN LATERAL jsonb_array_elements(v.manifest -> 'models') m
      LEFT JOIN LATERAL (SELECT * FROM prediction.effective_forecast_methods(k.tenant_id, k.domain_id) f WHERE f.method_ref = m ->> 'ref' LIMIT 1) e ON true
     WHERE m ->> 'kind' = 'forecast'
  ),
  beh AS (
    SELECT m ->> 'ref' AS ref, b.implementation_digest, b.method_ref IS NOT NULL AS known
      FROM v, jsonb_array_elements(v.manifest -> 'models') m LEFT JOIN twin.behaviour_models b ON b.method_ref = m ->> 'ref'
     WHERE m ->> 'kind' = 'behaviour'
  ),
  ont AS (SELECT o.* FROM graph.ontology_versions o, k, v WHERE o.tenant_id = k.tenant_id AND o.domain_id = k.domain_id AND o.namespace = v.manifest #>> '{ontology_extension,namespace}' AND o.state = 'active'),
  core AS (SELECT o.* FROM graph.ontology_versions o, k WHERE o.tenant_id = k.tenant_id AND o.domain_id = k.domain_id AND o.namespace = 'domain' AND o.state = 'active'),
  tax AS (SELECT t.* FROM k, LATERAL prediction.risk_taxonomy_current(k.tenant_id, k.domain_id) t WHERE t.taxonomy_id IS NOT NULL),   -- the taxonomy IN FORCE (B34: the latest activated)
  others AS (
    SELECT jsonb_agg(jsonb_build_object('package_key', ok.package_key, 'domain_kind', ok.domain_kind, 'version', ov.version, 'semver', ov.semver,
                                        'requires', coalesce(ov.manifest #> '{release,requires}', '[]'::jsonb), 'conflicts', coalesce(ov.manifest #> '{release,conflicts}', '[]'::jsonb)) ORDER BY ok.package_key) AS j
      FROM domain.packages ok JOIN domain.package_versions ov ON ov.package_id = ok.package_id AND ov.state = 'active', k
     WHERE ok.tenant_id = k.tenant_id AND ok.domain_id = k.domain_id AND ok.package_id <> k.package_id AND ok.state = 'declared'
  )
  SELECT jsonb_build_object(
    'now', clock_timestamp(),
    'package', (SELECT jsonb_build_object('package_id', k.package_id, 'package_key', k.package_key, 'domain_kind', k.domain_kind, 'title', k.title, 'owner', k.owner_principal_id, 'state', k.state) FROM k),
    'version', (SELECT jsonb_build_object('version', v.version, 'semver', v.semver, 'state', v.state, 'manifest', v.manifest, 'manifest_digest', v.manifest_digest, 'proposed_by', v.proposed_by,
                                          'disabled_functions', v.disabled_functions, 'conflict', v.conflict) FROM v),
    'active', (SELECT jsonb_build_object('version', a.version, 'semver', a.semver, 'manifest', a.manifest) FROM a),
    'core', jsonb_build_object('entity_types', to_jsonb(domain.dpk_core_types()),
                               'ontology', (SELECT jsonb_build_object('version', c.version, 'predicates', (SELECT coalesce(jsonb_agg(p ->> 'predicate'), '[]'::jsonb) FROM jsonb_array_elements(c.predicates) p)) FROM core c)),
    'namespace_ontology', (SELECT jsonb_build_object('version_id', o.version_id, 'version', o.version, 'entity_types', to_jsonb(o.entity_types),
                                                     'predicates', (SELECT coalesce(jsonb_agg(p ->> 'predicate'), '[]'::jsonb) FROM jsonb_array_elements(o.predicates) p), 'activated_at', o.activated_at) FROM ont o),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object('source_key', s.source_key, 'known', s.source_id IS NOT NULL, 'source_id', s.source_id, 'contract_version', s.contract_version,
                                                             'lifecycle_state', s.lifecycle_state, 'rights_state', s.rights_state, 'purposes', s.purposes, 'data_origin', s.data_origin,
                                                             'publisher', s.publisher, 'freshness_threshold_seconds', s.freshness_threshold_seconds, 'classification_ceiling', s.classification_ceiling,
                                                             'acquisition_mode', s.acquisition_mode, 'authority_class', s.authority_class, 'last_evidence_at', s.last_evidence_at,
                                                             'last_observation_time', s.last_observation_time, 'last_observation_recorded_at', s.last_observation_recorded_at) ORDER BY s.source_key) FROM src s), '[]'::jsonb),
    'methods', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', m.ref, 'known', m.state IS NOT NULL, 'state', m.state, 'state_reason', m.state_reason, 'horizons', to_jsonb(m.horizons), 'builtin', m.builtin) ORDER BY m.ref) FROM meth m), '[]'::jsonb),
    'behaviour', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', b.ref, 'known', b.known, 'pinned', b.implementation_digest IS NOT NULL) ORDER BY b.ref) FROM beh b), '[]'::jsonb),
    'taxonomy', (SELECT jsonb_build_object('version', t.version, 'keys', (SELECT coalesce(jsonb_agg(c ->> 'key'), '[]'::jsonb) FROM jsonb_array_elements(t.categories) c)) FROM tax t),
    'packages', coalesce((SELECT j FROM others), '[]'::jsonb),
    'sections', domain.dpk_section_state(p_package, p_version)
  ) WHERE EXISTS (SELECT 1 FROM v)
$$;
GRANT EXECUTE ON FUNCTION domain.package_facts(uuid, int) TO eye_app, eye_commit;

/* The ACCEPTANCE facts (PK6) beside the package facts: the indicators' series (registered, last indicator observation, breach), the package's
   assessments (state, source diversity, subjects), its confirmed events' subjects, its alerts' adjudications, its active links, the method
   validations of the series and horizons its models claim (B25 registry), and the latest certification run. INVOKER. */
CREATE OR REPLACE FUNCTION domain.package_acceptance_facts(p_package uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, prediction, pg_catalog, pg_temp AS $$
  WITH k AS (SELECT * FROM domain.packages x WHERE x.package_id = p_package),
  v AS (SELECT x.* FROM domain.package_versions x, k WHERE x.package_id = k.package_id AND x.version = p_version),
  ind AS (
    SELECT i ->> 'key' AS key, i ->> 'series_key' AS series_key,
           (SELECT r.unit FROM prediction.series_registry r, k WHERE r.tenant_id = k.tenant_id AND r.domain_id = k.domain_id AND r.series_key = i ->> 'series_key') AS unit,
           (SELECT r.source_key FROM prediction.series_registry r, k WHERE r.tenant_id = k.tenant_id AND r.domain_id = k.domain_id AND r.series_key = i ->> 'series_key') AS source_key,
           (SELECT max(n.last_observation_at) FROM prediction.indicators_current n, k WHERE n.tenant_id = k.tenant_id AND n.domain_id = k.domain_id AND n.series_key = i ->> 'series_key' AND n.state = 'active') AS last_observation_at,
           (SELECT bool_or(n.breached) FROM prediction.indicators_current n, k WHERE n.tenant_id = k.tenant_id AND n.domain_id = k.domain_id AND n.series_key = i ->> 'series_key' AND n.state = 'active') AS breached
      FROM v, jsonb_array_elements(v.manifest -> 'indicators') i
  ),
  val AS (
    SELECT m ->> 'ref' AS ref, m ->> 'series_key' AS series_key, h AS horizon,
           EXISTS (SELECT 1 FROM prediction.method_validations mv, k WHERE mv.tenant_id = k.tenant_id AND mv.domain_id = k.domain_id AND mv.method_ref = m ->> 'ref'
                     AND mv.series_key = m ->> 'series_key' AND mv.horizon_code = h AND mv.passed) AS validated,
           (SELECT count(*)::int FROM prediction.method_validations mv, k WHERE mv.tenant_id = k.tenant_id AND mv.domain_id = k.domain_id AND mv.method_ref = m ->> 'ref'
                     AND mv.series_key = m ->> 'series_key' AND mv.horizon_code = h) AS records
      FROM v, jsonb_array_elements(v.manifest -> 'models') m, jsonb_array_elements_text(coalesce(m -> 'horizons', '[]'::jsonb)) h
     WHERE m ->> 'kind' = 'forecast'
  )
  SELECT jsonb_build_object(
    'series', coalesce((SELECT jsonb_agg(DISTINCT r.series_key) FROM prediction.series_registry r, k
                         WHERE r.tenant_id = k.tenant_id AND r.domain_id = k.domain_id
                           AND r.series_key IN (SELECT i ->> 'series_key' FROM v, jsonb_array_elements(v.manifest -> 'indicators') i
                                                UNION SELECT x FROM v, jsonb_array_elements(v.manifest -> 'indicators') i, jsonb_array_elements_text(coalesce(i #> '{calculation,inputs}', '[]'::jsonb)) x)), '[]'::jsonb),
    'indicators', coalesce((SELECT jsonb_agg(jsonb_build_object('key', i.key, 'series_key', i.series_key, 'registered', i.unit IS NOT NULL, 'source_key', i.source_key,
                                                                'last_observation_at', i.last_observation_at, 'breached', i.breached) ORDER BY i.key) FROM ind i), '[]'::jsonb),
    'validations', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', x.ref, 'series_key', x.series_key, 'horizon', x.horizon, 'validated', x.validated, 'records', x.records)) FROM val x), '[]'::jsonb),
    'assessments', coalesce((SELECT jsonb_agg(jsonb_build_object('assessment_id', a.assessment_id, 'version', a.version, 'state', a.state, 'template', a.template, 'material', a.material,
                                                                 'source_diversity', a.source_diversity, 'subjects', to_jsonb(a.subject_entities)) ORDER BY a.proposed_at)
                             FROM domain.assessments a WHERE a.package_id = p_package AND a.state IN ('approved', 'limited')), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', e.event_id, 'kind', e.kind, 'subjects', to_jsonb(e.subject_entities)) ORDER BY e.proposed_at)
                        FROM domain.events e WHERE e.package_id = p_package AND e.state = 'confirmed'), '[]'::jsonb),
    'alerts', coalesce((SELECT jsonb_agg(jsonb_build_object('alert_id', al.alert_id, 'state', al.state, 'adjudication', al.adjudication) ORDER BY al.raised_at)
                        FROM domain.alerts al WHERE al.package_id = p_package), '[]'::jsonb),
    'links', coalesce((SELECT jsonb_agg(jsonb_build_object('link_kind', l.link_kind, 'target_id', l.target_id) ORDER BY l.linked_at) FROM domain.package_links l WHERE l.package_id = p_package AND l.state = 'active'), '[]'::jsonb),
    'certification', (SELECT jsonb_build_object('run_id', r.run_id, 'passed', r.passed, 'ran_at', r.ran_at) FROM domain.package_conformance_runs r
                       WHERE r.package_id = p_package AND r.version = p_version AND r.mode = 'certification' ORDER BY r.ran_at DESC LIMIT 1)
  ) WHERE EXISTS (SELECT 1 FROM v)
$$;
GRANT EXECUTE ON FUNCTION domain.package_acceptance_facts(uuid, int) TO eye_app, eye_commit;

-- §PK.7 ASSESSMENTS, WATCHLISTS, EVENTS, ALERTS, LINKS (PK5) ───────────────────────────────────────────────────────────────────
/* THE ALERT RAISE (internal): an approved MATERIAL assessment or a confirmed event matched against every ACTIVE watchlist of the package —
   a rule {rule_key, on: assessment|event, templates?|kinds?} matches its cause, and the watchlist's entities (when it names any) meet the
   cause's subjects. One alert per (watchlist, rule, cause). The `alert` function not active → the alert is WITHHELD with the gate's reason
   (listed, never hidden); otherwise RAISED as `domain.alert` under the published policy, named owner = the watchlist's owner. FOR §CI (after
   the fold): any definer port of the domain schema may call this with its own cause (the cause kinds widened by the integrator). */
CREATE OR REPLACE FUNCTION domain.dpk_raise_watchlist_alerts(p_tenant uuid, p_domain uuid, p_package uuid, p_key text, p_cause_kind text, p_cause_id uuid, p_cause_version int,
                                                            p_subjects uuid[], p_match text, p_title text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, executive, pg_catalog, pg_temp AS $$
DECLARE w record; r jsonb; v_alert uuid; v_gate jsonb := domain.package_function_state(p_tenant, p_domain, p_key, 'alert'); v_item jsonb; v_out jsonb := '[]'::jsonb; v_title text;
BEGIN
  FOR w IN SELECT * FROM domain.watchlists x WHERE x.package_id = p_package AND x.state = 'active' AND x.tenant_id = p_tenant AND x.domain_id = p_domain
            AND (cardinality(x.entities) = 0 OR x.entities && p_subjects) ORDER BY x.declared_at, x.watchlist_id LOOP
    FOR r IN SELECT * FROM jsonb_array_elements(w.rules) LOOP
      CONTINUE WHEN r ->> 'on' IS DISTINCT FROM p_cause_kind;
      CONTINUE WHEN p_cause_kind = 'assessment' AND jsonb_typeof(r -> 'templates') = 'array' AND jsonb_array_length(r -> 'templates') > 0 AND NOT ((r -> 'templates') ? p_match);
      CONTINUE WHEN p_cause_kind = 'event' AND jsonb_typeof(r -> 'kinds') = 'array' AND jsonb_array_length(r -> 'kinds') > 0 AND NOT ((r -> 'kinds') ? p_match);
      CONTINUE WHEN EXISTS (SELECT 1 FROM domain.alerts a WHERE a.watchlist_id = w.watchlist_id AND a.rule_key = r ->> 'rule_key' AND a.cause_kind = p_cause_kind AND a.cause_id = p_cause_id AND a.cause_version = p_cause_version);
      v_alert := gen_random_uuid();
      v_title := left(format('%s — %s', w.title, p_title), 512);
      IF v_gate ->> 'state' <> 'active' THEN
        INSERT INTO domain.alerts (alert_id, scope, tenant_id, domain_id, package_id, package_key, watchlist_id, watchlist_version, rule_key, cause_kind, cause_id, cause_version, title, subject_entities,
                                   state, withheld_reason, owner_principal_id, correlation_id)
        VALUES (v_alert, 'DOMAIN', p_tenant, p_domain, p_package, p_key, w.watchlist_id, w.version, r ->> 'rule_key', p_cause_kind, p_cause_id, p_cause_version, v_title, p_subjects,
                'withheld', v_gate ->> 'reason', w.owner_principal_id, p_correlation);
        PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'alert', v_alert, NULL, 'alert.withheld', p_actor, jsonb_build_object('reason', v_gate ->> 'reason', 'watchlist_id', w.watchlist_id), p_correlation);
        v_out := v_out || jsonb_build_object('alert_id', v_alert, 'watchlist_id', w.watchlist_id, 'state', 'withheld', 'reason', v_gate ->> 'reason');
      ELSE
        v_item := executive.b33_raise_routed(p_tenant, p_domain, 'domain.alert', 'watchlist', w.watchlist_id, v_title,
                    jsonb_build_array(format('watchlist rule %s matched the %s %s', r ->> 'rule_key', p_cause_kind, p_cause_id)), w.owner_principal_id, v_alert, 'domain.alert.' || p_cause_kind,
                    jsonb_build_object('alert_id', v_alert, 'watchlist_id', w.watchlist_id, 'watchlist_version', w.version, 'rule_key', r ->> 'rule_key', 'package_key', p_key,
                                       'cause', jsonb_build_object('kind', p_cause_kind, 'id', p_cause_id, 'version', p_cause_version, 'match', p_match), 'subjects', to_jsonb(p_subjects)),
                    NULL, p_actor, p_correlation);
        INSERT INTO domain.alerts (alert_id, scope, tenant_id, domain_id, package_id, package_key, watchlist_id, watchlist_version, rule_key, cause_kind, cause_id, cause_version, title, subject_entities,
                                   state, item_id, item_state, owner_principal_id, correlation_id)
        VALUES (v_alert, 'DOMAIN', p_tenant, p_domain, p_package, p_key, w.watchlist_id, w.version, r ->> 'rule_key', p_cause_kind, p_cause_id, p_cause_version, v_title, p_subjects,
                'raised', (v_item ->> 'item_id')::uuid, v_item ->> 'state', w.owner_principal_id, p_correlation);
        PERFORM domain.dpk_event(p_tenant, p_domain, p_package, 'alert', v_alert, NULL, 'alert.raised', p_actor, jsonb_build_object('watchlist_id', w.watchlist_id, 'item', v_item), p_correlation);
        v_out := v_out || jsonb_build_object('alert_id', v_alert, 'watchlist_id', w.watchlist_id, 'state', 'raised', 'item', v_item);
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION domain.dpk_raise_watchlist_alerts(uuid,uuid,uuid,text,text,uuid,int,uuid[],text,text,uuid,uuid) FROM PUBLIC;

/* PROPOSE an assessment version (domain.assessment.propose — a human or the Domain Intelligence Agent; the `assess` function active): the
   template is one of the active manifest's; the subjects are active entities; the evidence is cited at its digests; the source diversity is
   measured now (and again at approval). An existing assessment's next version is proposed while none is open. */
CREATE OR REPLACE FUNCTION domain.propose_assessment(p_assessment uuid, p_tenant uuid, p_domain uuid, p_key text, p_template text, p_subjects uuid[], p_statement text, p_confidence numeric,
                                                     p_evidence jsonb, p_material boolean, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a domain.package_versions%ROWTYPE; t jsonb; v_next int; v_div jsonb; v_kind text := domain.dpk_kind(p_actor);
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.assessment.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain assessment', p_actor);
  PERFORM domain.dpk_gate(p_tenant, p_domain, p_key, 'assess', 'domain assessment');
  a := domain.dpk_active(p_tenant, p_domain, p_key);
  SELECT x INTO t FROM jsonb_array_elements(a.manifest -> 'assessment_templates') x WHERE x ->> 'key' = p_template;
  IF t IS NULL THEN RAISE EXCEPTION 'domain assessment rejected (template): % is not a template of package % v%', coalesce(p_template, '<none>'), p_key, a.version USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_statement, ''))) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'domain assessment rejected (statement): a statement has 8–4000 characters' USING ERRCODE = '22023'; END IF;
  IF p_confidence IS NULL OR p_confidence < 0 OR p_confidence > 1 THEN RAISE EXCEPTION 'domain assessment rejected (confidence): the confidence is between 0 and 1' USING ERRCODE = '22023'; END IF;
  PERFORM domain.dpk_assert_entities('domain assessment', p_tenant, p_domain, p_subjects);
  PERFORM domain.dpk_assert_evidence('domain assessment', p_tenant, p_domain, p_evidence);
  IF EXISTS (SELECT 1 FROM domain.assessments x WHERE x.assessment_id = p_assessment AND (x.tenant_id <> p_tenant OR x.domain_id <> p_domain OR x.package_key <> p_key)) THEN
    RAISE EXCEPTION 'domain assessment rejected (unknown_assessment): % is not an assessment of package % in this domain', p_assessment, p_key USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM domain.assessments x WHERE x.assessment_id = p_assessment AND x.state = 'proposed') THEN
    RAISE EXCEPTION 'domain assessment rejected (state): a version of assessment % is already proposed; it is decided first', p_assessment USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(max(x.version), 0) + 1 INTO v_next FROM domain.assessments x WHERE x.assessment_id = p_assessment;
  v_div := domain.dpk_source_diversity(p_tenant, p_domain, p_evidence, coalesce((t ->> 'min_publishers')::int, 1));
  INSERT INTO domain.assessments (assessment_id, version, scope, tenant_id, domain_id, package_id, package_key, package_version, template, subject_entities, statement, confidence, evidence,
                                  source_diversity, material, state, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_assessment, v_next, 'DOMAIN', p_tenant, p_domain, a.package_id, p_key, a.version, p_template, p_subjects, btrim(p_statement), p_confidence, p_evidence,
          v_div, coalesce(p_material, coalesce((t ->> 'material')::boolean, true)), 'proposed', p_actor, coalesce(v_kind, 'system'), p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, a.package_id, 'assessment', p_assessment, v_next, 'assessment.proposed', p_actor,
                           jsonb_build_object('template', p_template, 'proposed_by_kind', v_kind, 'source_diversity', v_div), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.assessments x WHERE x.assessment_id = p_assessment AND x.version = v_next);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.propose_assessment(uuid,uuid,uuid,text,text,uuid[],text,numeric,jsonb,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.propose_assessment(uuid,uuid,uuid,text,text,uuid[],text,numeric,jsonb,boolean,uuid,uuid) TO eye_commit;

/* DECIDE a proposed version (domain.assessment.approve, human-gated): a named HUMAN — for a MATERIAL assessment a domain analyst or a domain
   specialist of the domain; for an immaterial one also the package's owner — never the proposer, never an agent. APPROVED when its source
   diversity meets the template's threshold, LIMITED (with the reason) when not; the prior standing version superseded; the DAS object of the
   standing version admitted in the same write (p_object_version, its state checked). An approved MATERIAL assessment (not a limited one) is matched
   against the package's watchlists (alerts). */
CREATE OR REPLACE FUNCTION domain.decide_assessment(p_assessment uuid, p_tenant uuid, p_domain uuid, p_version int, p_decision text, p_note text, p_object_version int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x domain.assessments%ROWTYPE; k domain.packages%ROWTYPE; a domain.package_versions%ROWTYPE; t jsonb; v_div jsonb; v_state text; v_alerts jsonb := '[]'::jsonb; prior domain.assessments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.assessment.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain assessment', p_actor);
  SELECT * INTO x FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.version = p_version AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain assessment rejected (unknown_assessment): no version % of assessment % in this domain', p_version, p_assessment USING ERRCODE = '23503'; END IF;
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'domain assessment rejected (actor): an assessment is approved by a named human; an agent proposes, it never approves' USING ERRCODE = '42501';
  END IF;
  IF x.proposed_by = p_actor THEN RAISE EXCEPTION 'domain assessment rejected (separation_of_duties): the proposer of version % does not decide it', p_version USING ERRCODE = '42501'; END IF;
  SELECT * INTO k FROM domain.packages y WHERE y.package_id = x.package_id;
  IF NOT (domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'domain_specialist']) OR (NOT x.material AND p_actor = k.owner_principal_id)) THEN
    RAISE EXCEPTION 'domain assessment rejected (authority): a % assessment is decided by a named domain analyst or domain specialist%', CASE WHEN x.material THEN 'material' ELSE 'non-material' END,
      CASE WHEN x.material THEN '' ELSE ' (or the package''s owner)' END USING ERRCODE = '42501';
  END IF;
  IF x.state <> 'proposed' THEN RAISE EXCEPTION 'domain assessment rejected (state): version % is %', p_version, x.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'domain assessment rejected (decision): the decision is approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'domain assessment rejected (note): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'reject' THEN
    UPDATE domain.assessments SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note) WHERE assessment_id = p_assessment AND version = p_version;
    PERFORM domain.dpk_event(p_tenant, p_domain, x.package_id, 'assessment', p_assessment, p_version, 'assessment.rejected', p_actor, jsonb_build_object('note', btrim(p_note)), p_correlation);
    RETURN (SELECT to_jsonb(y) FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.version = p_version);
  END IF;
  PERFORM domain.dpk_gate(p_tenant, p_domain, x.package_key, 'assess', 'domain assessment');
  a := domain.dpk_active(p_tenant, p_domain, x.package_key);
  SELECT y INTO t FROM jsonb_array_elements(a.manifest -> 'assessment_templates') y WHERE y ->> 'key' = x.template;
  IF t IS NULL THEN RAISE EXCEPTION 'domain assessment rejected (template): % is no longer a template of the active package version %', x.template, a.version USING ERRCODE = '22023'; END IF;
  v_div := domain.dpk_source_diversity(p_tenant, p_domain, x.evidence, coalesce((t ->> 'min_publishers')::int, 1));
  v_state := CASE WHEN (v_div ->> 'meets')::boolean THEN 'approved' ELSE 'limited' END;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_type = 'DAS' AND c.object_id = p_assessment AND c.object_version = p_object_version AND c.tenant_id = p_tenant
                   AND c.payload ->> 'state' = v_state AND (c.payload ->> 'version')::int = p_version) THEN
    RAISE EXCEPTION 'domain assessment rejected (object): the DAS object version % (state %, version %) was not admitted in this write', p_object_version, v_state, p_version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO prior FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.state IN ('approved', 'limited') FOR UPDATE;
  IF FOUND THEN
    UPDATE domain.assessments SET state = 'superseded', superseded_at = clock_timestamp() WHERE assessment_id = p_assessment AND version = prior.version;
    PERFORM domain.dpk_event(p_tenant, p_domain, x.package_id, 'assessment', p_assessment, prior.version, 'assessment.superseded', p_actor, jsonb_build_object('by', p_version), p_correlation);
  END IF;
  UPDATE domain.assessments SET state = v_state, decided_by = p_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note), source_diversity = v_div, object_version = p_object_version,
         limited_reason = CASE WHEN v_state = 'limited' THEN format('source diversity below the template''s threshold: %s distinct publisher(s), %s required%s', v_div ->> 'publishers', v_div ->> 'threshold',
                                                                    CASE WHEN (v_div ->> 'unattributed')::int > 0 THEN format(', %s evidence object(s) without a source contract', v_div ->> 'unattributed') ELSE '' END) END,
         limited_at = CASE WHEN v_state = 'limited' THEN clock_timestamp() END
   WHERE assessment_id = p_assessment AND version = p_version;
  -- a LIMITED assessment is never presented as complete: it raises no alert (the watchlist sees approved material assessments only)
  IF x.material AND v_state = 'approved' THEN
    v_alerts := domain.dpk_raise_watchlist_alerts(p_tenant, p_domain, x.package_id, x.package_key, 'assessment', p_assessment, p_version, x.subject_entities, x.template,
                                                  left(x.statement, 200), p_actor, p_correlation);
  END IF;
  PERFORM domain.dpk_event(p_tenant, p_domain, x.package_id, 'assessment', p_assessment, p_version, 'assessment.' || v_state, p_actor,
                           jsonb_build_object('note', btrim(p_note), 'source_diversity', v_div, 'object_version', p_object_version, 'alerts', v_alerts), p_correlation);
  RETURN (SELECT to_jsonb(y) || jsonb_build_object('alerts', v_alerts) FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.version = p_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.decide_assessment(uuid,uuid,uuid,int,text,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.decide_assessment(uuid,uuid,uuid,int,text,text,int,uuid,uuid) TO eye_commit;

/* LIMIT the standing version (domain.assessment.limit, human-gated): a named analyst or specialist marks it LIMITED with the reason (a
   challenge, stale coverage, a mistaken identity …) — it is never again presented as complete; the conflicting evidence stays cited. */
CREATE OR REPLACE FUNCTION domain.limit_assessment(p_assessment uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x domain.assessments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.assessment.limit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain assessment', p_actor);
  IF NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'domain_specialist']) THEN
    RAISE EXCEPTION 'domain assessment rejected (authority): an assessment is limited by a named domain analyst or specialist' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain assessment rejected (reason): a limitation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.tenant_id = p_tenant AND y.domain_id = p_domain AND y.state IN ('approved', 'limited') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain assessment rejected (unknown_assessment): assessment % has no standing version in this domain', p_assessment USING ERRCODE = '23503'; END IF;
  IF x.state = 'limited' THEN RAISE EXCEPTION 'domain assessment rejected (state): version % is already limited (%)', x.version, x.limited_reason USING ERRCODE = '22023'; END IF;
  UPDATE domain.assessments SET state = 'limited', limited_reason = btrim(p_reason), limited_at = clock_timestamp() WHERE assessment_id = p_assessment AND version = x.version;
  PERFORM domain.dpk_event(p_tenant, p_domain, x.package_id, 'assessment', p_assessment, x.version, 'assessment.limited', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(y) FROM domain.assessments y WHERE y.assessment_id = p_assessment AND y.version = x.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.limit_assessment(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.limit_assessment(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* AS-OF REPLAY (UX-36-003 replay): the version of an assessment that STOOD at an instant and its state then (approved or limited), from the
   recorded instants — what was believed at T. INVOKER (RLS). */
CREATE OR REPLACE FUNCTION domain.assessment_as_of(p_assessment uuid, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(a) - 'state' || jsonb_build_object('state_then', CASE WHEN a.limited_at IS NOT NULL AND a.limited_at <= p_at THEN 'limited' ELSE 'approved' END,
                                                    'state_now', a.state, 'as_of', p_at)
    FROM domain.assessments a
   WHERE a.assessment_id = p_assessment AND a.decided_at IS NOT NULL AND a.decided_at <= p_at AND a.state IN ('approved', 'limited', 'superseded')
     AND (a.superseded_at IS NULL OR a.superseded_at > p_at)
   ORDER BY a.version DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION domain.assessment_as_of(uuid, timestamptz) TO eye_app, eye_commit;

/* DECLARE a watchlist / its next version (domain.watchlist.declare; the `watch` function active): its owner is the acting named human; the
   entities are active entities; the rules name what raises (on assessment: templates of the package; on event: event kinds). */
CREATE OR REPLACE FUNCTION domain.declare_watchlist(p_watchlist uuid, p_tenant uuid, p_domain uuid, p_key text, p_title text, p_entities uuid[], p_indicators text[], p_rules jsonb, p_freshness_days int,
                                                    p_expected_version int, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a domain.package_versions%ROWTYPE; cur domain.watchlists%ROWTYPE; r jsonb; v_next int := 1; v_tpl text[]; v_kinds text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.watchlist.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('watchlist', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'watchlist rejected (actor): a watchlist is owned by a named human' USING ERRCODE = '42501'; END IF;
  PERFORM domain.dpk_gate(p_tenant, p_domain, p_key, 'watch', 'watchlist');
  a := domain.dpk_active(p_tenant, p_domain, p_key);
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'watchlist rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_freshness_days IS NULL OR p_freshness_days NOT BETWEEN 1 AND 3660 THEN RAISE EXCEPTION 'watchlist rejected (freshness): the coverage freshness is 1–3660 days' USING ERRCODE = '22023'; END IF;
  IF coalesce(cardinality(p_entities), 0) > 0 THEN PERFORM domain.dpk_assert_entities('watchlist', p_tenant, p_domain, p_entities); END IF;
  SELECT coalesce(array_agg(x ->> 'key'), '{}') INTO v_tpl FROM jsonb_array_elements(a.manifest -> 'assessment_templates') x;
  SELECT coalesce(array_agg(x), '{}') INTO v_kinds FROM jsonb_array_elements_text(coalesce(a.manifest #> '{ontology_extension,event_kinds}', '[]'::jsonb)) x;
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array' OR jsonb_array_length(p_rules) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'watchlist rejected (rules): a watchlist has 1–20 rules' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rules) LOOP
    IF jsonb_typeof(r) <> 'object' OR coalesce(r ->> 'rule_key', '') !~ '^[a-z][a-z0-9_.-]{1,62}$' OR coalesce(r ->> 'on', '') NOT IN ('assessment', 'event') THEN
      RAISE EXCEPTION 'watchlist rejected (rules): a rule is {rule_key, on: assessment|event, templates?|kinds?} (got %)', left(r::text, 200) USING ERRCODE = '22023';
    END IF;
    IF r ->> 'on' = 'assessment' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(r -> 'templates', '[]'::jsonb)) z WHERE NOT (z = ANY (v_tpl))) THEN
      RAISE EXCEPTION 'watchlist rejected (rules): rule % names a template the package does not declare (templates: %)', r ->> 'rule_key', array_to_string(v_tpl, ', ') USING ERRCODE = '22023';
    END IF;
    IF r ->> 'on' = 'event' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(r -> 'kinds', '[]'::jsonb)) z WHERE NOT (z = ANY (v_kinds))) THEN
      RAISE EXCEPTION 'watchlist rejected (rules): rule % names an event kind the package does not declare (kinds: %)', r ->> 'rule_key', array_to_string(v_kinds, ', ') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT * INTO cur FROM domain.watchlists x WHERE x.watchlist_id = p_watchlist AND x.state IN ('active', 'retired') FOR UPDATE;
  IF FOUND THEN
    IF cur.tenant_id <> p_tenant OR cur.domain_id <> p_domain OR cur.package_key <> p_key THEN RAISE EXCEPTION 'watchlist rejected (unknown_watchlist): % is not a watchlist of package %', p_watchlist, p_key USING ERRCODE = '23503'; END IF;
    IF cur.state = 'retired' THEN RAISE EXCEPTION 'watchlist rejected (state): watchlist % is retired', p_watchlist USING ERRCODE = '22023'; END IF;
    IF cur.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'watchlist rejected (ownership): watchlist % is revised by its owner', p_watchlist USING ERRCODE = '42501'; END IF;
    IF p_expected_version IS DISTINCT FROM cur.version THEN RAISE EXCEPTION 'watchlist rejected (stale): watchlist % stands at version %, not %', p_watchlist, cur.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023'; END IF;
    UPDATE domain.watchlists SET state = 'superseded', superseded_at = clock_timestamp() WHERE watchlist_id = p_watchlist AND version = cur.version;
    v_next := cur.version + 1;
  ELSIF coalesce(p_expected_version, 0) <> 0 THEN
    RAISE EXCEPTION 'watchlist rejected (unknown_watchlist): no watchlist % to revise', p_watchlist USING ERRCODE = '23503';
  END IF;
  INSERT INTO domain.watchlists (watchlist_id, version, scope, tenant_id, domain_id, package_id, package_key, title, owner_principal_id, entities, indicators, rules, freshness_days, state, declared_by, correlation_id)
  VALUES (p_watchlist, v_next, 'DOMAIN', p_tenant, p_domain, a.package_id, p_key, btrim(p_title), p_actor, coalesce(p_entities, '{}'), coalesce(p_indicators, '{}'), p_rules, p_freshness_days, 'active', p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, a.package_id, 'watchlist', p_watchlist, v_next, CASE WHEN v_next = 1 THEN 'watchlist.declared' ELSE 'watchlist.revised' END, p_actor,
                           jsonb_build_object('rules', p_rules, 'entities', to_jsonb(coalesce(p_entities, '{}'))), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.watchlists x WHERE x.watchlist_id = p_watchlist AND x.version = v_next);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.declare_watchlist(uuid,uuid,uuid,text,text,uuid[],text[],jsonb,int,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.declare_watchlist(uuid,uuid,uuid,text,text,uuid[],text[],jsonb,int,int,uuid,uuid) TO eye_commit;

/* RETIRE a watchlist (domain.watchlist.retire): its owner, with a reason; its open alert items closed. */
CREATE OR REPLACE FUNCTION domain.retire_watchlist(p_watchlist uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur domain.watchlists%ROWTYPE; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.watchlist.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('watchlist', p_actor);
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'watchlist rejected (reason): a retirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM domain.watchlists x WHERE x.watchlist_id = p_watchlist AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('active', 'retired') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'watchlist rejected (unknown_watchlist): no watchlist % in this domain', p_watchlist USING ERRCODE = '23503'; END IF;
  IF cur.state = 'retired' THEN RAISE EXCEPTION 'watchlist rejected (state): watchlist % is already retired', p_watchlist USING ERRCODE = '22023'; END IF;
  IF cur.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'watchlist rejected (ownership): watchlist % is retired by its owner', p_watchlist USING ERRCODE = '42501'; END IF;
  UPDATE domain.watchlists SET state = 'retired', retired_at = clock_timestamp(), retire_reason = btrim(p_reason) WHERE watchlist_id = p_watchlist AND version = cur.version;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'domain.alert', 'watchlist', p_watchlist, format('watchlist retired: %s', btrim(p_reason)), p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, cur.package_id, 'watchlist', p_watchlist, cur.version, 'watchlist.retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'closed_items', v_closed), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('closed_items', v_closed) FROM domain.watchlists x WHERE x.watchlist_id = p_watchlist AND x.version = cur.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.retire_watchlist(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.retire_watchlist(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* RECORD a domain event (domain.event.record — a human or the agent PROPOSES it; the `event` function active): the kind is one the package's
   ontology extension declares; subjects active entities; evidence cited at its digests. */
CREATE OR REPLACE FUNCTION domain.record_domain_event(p_event uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_title text, p_subjects uuid[], p_occurred_on date, p_evidence jsonb,
                                                      p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a domain.package_versions%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.event.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain event', p_actor);
  PERFORM domain.dpk_gate(p_tenant, p_domain, p_key, 'event', 'domain event');
  a := domain.dpk_active(p_tenant, p_domain, p_key);
  IF NOT coalesce((a.manifest #> '{ontology_extension,event_kinds}') ? p_kind, false) THEN
    RAISE EXCEPTION 'domain event rejected (kind): % is not an event kind of package % (kinds: %)', coalesce(p_kind, '<none>'), p_key, coalesce(a.manifest #>> '{ontology_extension,event_kinds}', '[]') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 300 THEN RAISE EXCEPTION 'domain event rejected (title): a title has 4–300 characters' USING ERRCODE = '22023'; END IF;
  IF p_occurred_on IS NULL OR p_occurred_on > (clock_timestamp() AT TIME ZONE 'UTC')::date + 1 THEN RAISE EXCEPTION 'domain event rejected (date): an event has the day it occurred (not in the future)' USING ERRCODE = '22023'; END IF;
  PERFORM domain.dpk_assert_entities('domain event', p_tenant, p_domain, p_subjects);
  PERFORM domain.dpk_assert_evidence('domain event', p_tenant, p_domain, p_evidence);
  INSERT INTO domain.events (event_id, scope, tenant_id, domain_id, package_id, package_key, package_version, kind, title, subject_entities, occurred_on, evidence, state, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_event, 'DOMAIN', p_tenant, p_domain, a.package_id, p_key, a.version, p_kind, btrim(p_title), p_subjects, p_occurred_on, p_evidence, 'proposed', p_actor, coalesce(domain.dpk_kind(p_actor), 'system'), p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, a.package_id, 'event', p_event, NULL, 'event.proposed', p_actor, jsonb_build_object('kind', p_kind, 'occurred_on', p_occurred_on), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.events x WHERE x.event_id = p_event);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.record_domain_event(uuid,uuid,uuid,text,text,text,uuid[],date,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.record_domain_event(uuid,uuid,uuid,text,text,text,uuid[],date,jsonb,uuid,uuid) TO eye_commit;

/* CONFIRM (or reject) a proposed event (domain.event.confirm, human-gated): a named analyst or specialist, never the proposer; a confirmed
   event is matched against the package's watchlists (alerts). */
CREATE OR REPLACE FUNCTION domain.confirm_domain_event(p_event uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e domain.events%ROWTYPE; v_alerts jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.event.confirm']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain event', p_actor);
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'domain_specialist']) THEN
    RAISE EXCEPTION 'domain event rejected (authority): an event is confirmed by a named domain analyst or specialist' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO e FROM domain.events x WHERE x.event_id = p_event AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain event rejected (unknown_event): no event % in this domain', p_event USING ERRCODE = '23503'; END IF;
  IF e.proposed_by = p_actor THEN RAISE EXCEPTION 'domain event rejected (separation_of_duties): the proposer of event % does not confirm it', p_event USING ERRCODE = '42501'; END IF;
  IF e.state <> 'proposed' THEN RAISE EXCEPTION 'domain event rejected (state): event % is %', p_event, e.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('confirm', 'reject') THEN RAISE EXCEPTION 'domain event rejected (decision): the decision is confirm or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'domain event rejected (note): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'confirm' THEN PERFORM domain.dpk_gate(p_tenant, p_domain, e.package_key, 'event', 'domain event'); END IF;
  UPDATE domain.events SET state = CASE p_decision WHEN 'confirm' THEN 'confirmed' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note) WHERE event_id = p_event;
  IF p_decision = 'confirm' THEN
    v_alerts := domain.dpk_raise_watchlist_alerts(p_tenant, p_domain, e.package_id, e.package_key, 'event', p_event, 1, e.subject_entities, e.kind, e.title, p_actor, p_correlation);
  END IF;
  PERFORM domain.dpk_event(p_tenant, p_domain, e.package_id, 'event', p_event, NULL, CASE p_decision WHEN 'confirm' THEN 'event.confirmed' ELSE 'event.rejected' END, p_actor,
                           jsonb_build_object('note', btrim(p_note), 'alerts', v_alerts), p_correlation);
  RETURN (SELECT to_jsonb(x) || jsonb_build_object('alerts', v_alerts) FROM domain.events x WHERE x.event_id = p_event);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.confirm_domain_event(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.confirm_domain_event(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* ADJUDICATE an alert (domain.alert.adjudicate, human-gated): a named analyst, specialist or the watchlist's owner records true or false
   positive with a note — the measured false-positive analysis (cyber) reads these, never a guess. */
CREATE OR REPLACE FUNCTION domain.adjudicate_alert(p_alert uuid, p_tenant uuid, p_domain uuid, p_adjudication text, p_note text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE al domain.alerts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.alert.adjudicate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('watchlist', p_actor);
  SELECT * INTO al FROM domain.alerts x WHERE x.alert_id = p_alert AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'watchlist rejected (unknown_alert): no alert % in this domain', p_alert USING ERRCODE = '23503'; END IF;
  IF domain.dpk_kind(p_actor) IS DISTINCT FROM 'human' OR NOT (p_actor = al.owner_principal_id OR domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'domain_specialist'])) THEN
    RAISE EXCEPTION 'watchlist rejected (authority): an alert is adjudicated by a named analyst, specialist or the watchlist''s owner' USING ERRCODE = '42501';
  END IF;
  IF al.state = 'withheld' THEN RAISE EXCEPTION 'watchlist rejected (state): alert % was withheld (%); nothing reached anyone to adjudicate', p_alert, al.withheld_reason USING ERRCODE = '22023'; END IF;
  IF al.adjudication IS NOT NULL THEN RAISE EXCEPTION 'watchlist rejected (duplicate): alert % is already adjudicated %', p_alert, al.adjudication USING ERRCODE = '23505'; END IF;
  IF p_adjudication NOT IN ('true_positive', 'false_positive') THEN RAISE EXCEPTION 'watchlist rejected (adjudication): true_positive or false_positive' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'watchlist rejected (note): an adjudication states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE domain.alerts SET adjudication = p_adjudication, adjudicated_by = p_actor, adjudicated_at = clock_timestamp(), adjudication_note = btrim(p_note) WHERE alert_id = p_alert;
  PERFORM domain.dpk_event(p_tenant, p_domain, al.package_id, 'alert', p_alert, NULL, 'alert.adjudicated', p_actor, jsonb_build_object('adjudication', p_adjudication, 'note', btrim(p_note)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.alerts x WHERE x.alert_id = p_alert);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.adjudicate_alert(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.adjudicate_alert(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* RESOLVE a watchlist's raised alerts (domain.alert.resolve, human-gated): its owner, with a reason; the `domain.alert` items of the watchlist
   closed (item.closed with the reason). The response DECISION is the decision layer's — this records that the alert was seen and handled. */
CREATE OR REPLACE FUNCTION domain.resolve_alerts(p_watchlist uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, executive, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w domain.watchlists%ROWTYPE; v_ids jsonb; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.alert.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('watchlist', p_actor);
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'watchlist rejected (reason): a resolution states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO w FROM domain.watchlists x WHERE x.watchlist_id = p_watchlist AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('active', 'retired');
  IF NOT FOUND THEN RAISE EXCEPTION 'watchlist rejected (unknown_watchlist): no watchlist % in this domain', p_watchlist USING ERRCODE = '23503'; END IF;
  IF w.owner_principal_id <> p_actor AND NOT domain.dpk_human_with(p_actor, p_tenant, p_domain, ARRAY['domain_admin']) THEN
    RAISE EXCEPTION 'watchlist rejected (ownership): the alerts of watchlist % are resolved by its owner', p_watchlist USING ERRCODE = '42501';
  END IF;
  WITH u AS (UPDATE domain.alerts SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(), resolve_reason = btrim(p_reason)
              WHERE watchlist_id = p_watchlist AND state = 'raised' RETURNING alert_id)
  SELECT coalesce(jsonb_agg(alert_id), '[]'::jsonb) INTO v_ids FROM u;
  IF jsonb_array_length(v_ids) = 0 THEN RAISE EXCEPTION 'watchlist rejected (state): watchlist % has no raised alert to resolve', p_watchlist USING ERRCODE = '22023'; END IF;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'domain.alert', 'watchlist', p_watchlist, format('alerts resolved by the watchlist owner: %s', btrim(p_reason)), p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, w.package_id, 'watchlist', p_watchlist, w.version, 'alert.resolved', p_actor, jsonb_build_object('alerts', v_ids, 'closed_items', v_closed, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('resolved', v_ids, 'closed_items', v_closed);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.resolve_alerts(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.resolve_alerts(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* DECLARE a link (domain.link.declare; the matching function active): a REFERENCE to the core's object, never a copy. exposure → a B32
   exposure whose category is in the package's risk meaning; forecast → a B25 forecast whose target or series the package's models declare;
   scenario → a B27 scenario of the domain (active); indicator → an indicator on a series the package declares. */
CREATE OR REPLACE FUNCTION domain.declare_package_link(p_link uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_target uuid, p_assessment uuid, p_note text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, prediction, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a domain.package_versions%ROWTYPE; v_cat text; v_series text; v_target text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.link.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF coalesce(p_kind, '') NOT IN ('exposure', 'forecast', 'scenario', 'indicator') THEN RAISE EXCEPTION 'domain package rejected (link): the link kind is exposure, forecast, scenario or indicator' USING ERRCODE = '22023'; END IF;
  PERFORM domain.dpk_gate(p_tenant, p_domain, p_key, p_kind, 'domain package');
  a := domain.dpk_active(p_tenant, p_domain, p_key);
  IF length(btrim(coalesce(p_note, ''))) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'domain package rejected (note): a link states why (8–1000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_assessment IS NOT NULL AND NOT EXISTS (SELECT 1 FROM domain.assessments x WHERE x.assessment_id = p_assessment AND x.package_id = a.package_id) THEN
    RAISE EXCEPTION 'domain package rejected (unknown_assessment): % is not an assessment of package %', p_assessment, p_key USING ERRCODE = '23503';
  END IF;
  IF p_kind = 'exposure' THEN
    SELECT e.category_key INTO v_cat FROM prediction.exposure_current e WHERE e.exposure_id = p_target AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_target): % is not an exposure of this domain', p_target USING ERRCODE = '23503'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.manifest -> 'risk_meaning') r WHERE r ->> 'category_key' = v_cat) THEN
      RAISE EXCEPTION 'domain package rejected (risk): exposure % is in category %, which the package''s risk meaning does not map', p_target, v_cat USING ERRCODE = '22023';
    END IF;
  ELSIF p_kind = 'forecast' THEN
    SELECT f.series_key, f.target_key INTO v_series, v_target FROM prediction.forecasts_current f WHERE f.forecast_id = p_target AND f.tenant_id = p_tenant AND f.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_target): % is not a forecast of this domain', p_target USING ERRCODE = '23503'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.manifest -> 'models') m WHERE m ->> 'kind' = 'forecast' AND (m ->> 'series_key' = v_series OR (v_target IS NOT NULL AND m ->> 'target_key' = v_target))) THEN
      RAISE EXCEPTION 'domain package rejected (target): forecast % (series %, target %) is not on a series or target the package''s models declare', p_target, v_series, coalesce(v_target, '<none>') USING ERRCODE = '22023';
    END IF;
  ELSIF p_kind = 'scenario' THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_target AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.state = 'active') THEN
      RAISE EXCEPTION 'domain package rejected (unknown_target): % is not an active scenario of this domain', p_target USING ERRCODE = '23503';
    END IF;
  ELSE
    SELECT n.series_key INTO v_series FROM prediction.indicators_current n WHERE n.indicator_id = p_target AND n.tenant_id = p_tenant AND n.domain_id = p_domain AND n.state = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_target): % is not an active indicator of this domain', p_target USING ERRCODE = '23503'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.manifest -> 'indicators') i WHERE i ->> 'series_key' = v_series) THEN
      RAISE EXCEPTION 'domain package rejected (target): indicator % reads series %, which the package''s indicators do not declare', p_target, v_series USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM domain.package_links l WHERE l.package_id = a.package_id AND l.link_kind = p_kind AND l.target_id = p_target AND l.state = 'active') THEN
    RAISE EXCEPTION 'domain package rejected (duplicate): the package already links % %', p_kind, p_target USING ERRCODE = '23505';
  END IF;
  INSERT INTO domain.package_links (link_id, scope, tenant_id, domain_id, package_id, package_key, assessment_id, link_kind, target_id, note, state, linked_by, correlation_id)
  VALUES (p_link, 'DOMAIN', p_tenant, p_domain, a.package_id, p_key, p_assessment, p_kind, p_target, btrim(p_note), 'active', p_actor, p_correlation);
  PERFORM domain.dpk_event(p_tenant, p_domain, a.package_id, 'link', p_link, NULL, 'link.declared', p_actor, jsonb_build_object('kind', p_kind, 'target', p_target, 'assessment', p_assessment), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.package_links x WHERE x.link_id = p_link);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.declare_package_link(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.declare_package_link(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* WITHDRAW a link (domain.link.withdraw): its declarer or the package's owner, with a reason. Not gated by the function (a withdrawal is always possible). */
CREATE OR REPLACE FUNCTION domain.withdraw_package_link(p_link uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb SECURITY DEFINER SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l domain.package_links%ROWTYPE; k domain.packages%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.link.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dpk_assert_actor('domain package', p_actor);
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'domain package rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO l FROM domain.package_links x WHERE x.link_id = p_link AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'domain package rejected (unknown_link): no link % in this domain', p_link USING ERRCODE = '23503'; END IF;
  IF l.state <> 'active' THEN RAISE EXCEPTION 'domain package rejected (state): link % is already withdrawn', p_link USING ERRCODE = '22023'; END IF;
  SELECT * INTO k FROM domain.packages x WHERE x.package_id = l.package_id;
  IF p_actor <> l.linked_by AND p_actor <> k.owner_principal_id THEN RAISE EXCEPTION 'domain package rejected (ownership): a link is withdrawn by its declarer or the package''s owner' USING ERRCODE = '42501'; END IF;
  UPDATE domain.package_links SET state = 'withdrawn', withdrawn_by = p_actor, withdrawn_at = clock_timestamp(), withdraw_reason = btrim(p_reason) WHERE link_id = p_link;
  PERFORM domain.dpk_event(p_tenant, p_domain, l.package_id, 'link', p_link, NULL, 'link.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM domain.package_links x WHERE x.link_id = p_link);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION domain.withdraw_package_link(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.withdraw_package_link(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;
-- end §PK
-- ── end of the folded §PK ──


-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CI — COMPETITOR INTELLIGENCE (F-P4-15 ch.29) — prefix dci_, schema domain, actions domain.competitor.*; re-declares nothing
-- (folded at integration from the part-local file 0111_b33_x_competitor.sql, unchanged; apply order §0, §TW, §SC, §PK, §CI)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CI COMPETITOR INTELLIGENCE (F-P4-15 chapter 29: PR-29-001/-002/-003/-005/-006, CAP-FW-06 v08+v09, AT-29, JRN-10 v08+v09; F-P5-01's
-- "families populated" — the competitor and market twins). Part-local file of 0111 (applied after §0; folded last, after §PK). Prefix `dci_`
-- (triggers, indexes, private functions); tables in schema `domain`; actions `domain.competitor.*`; refusals in the CLASS form
-- `competitor profile|competitor comparison|competitor assessment|competitor watchlist rejected (<class>): …`.
--
-- WHAT IT IS. A competitor is bound to a graph ORGANIZATION entity (identity through the graph's own resolution: a fact rests on evidence whose
-- mentions the graph resolved to that entity). Its PROFILE is temporal and versioned (each version effective from a day, recorded at an
-- instant — "what was believed at T" replays by record time; "what held on day D" by effective time); each fact cites claims/evidence with a
-- confidence. The Domain Intelligence Agent (task domain_scan, its own session) and named people PROPOSE events, profile updates and
-- interpretations; a NAMED ANALYST (domain_analyst, never the proposer, never an agent; digest-bound) APPROVES a material assessment → a new
-- profile version (a CPF object), its events, its interpretation (an assessment). An approved change matching a WATCHLIST rule raises
-- `domain.alert` under the PUBLISHED attention policy (executive.b33_raise_routed, the watchlist's owner named). COMPARISONS rest on a
-- declared, versioned BASIS (metric definitions, units, period, population): incompatible definitions are REFUSED, a comparison whose basis or
-- profile moved is SUSPENDED. SOURCE DIVERSITY is measured (distinct publishers and contracts; correlated and single-origin sources flagged;
-- below the package's threshold → LIMITED). THE CONTINUITY CONTRACT (PR-29-005): a mistaken identity (a resolution superseded by a split, a
-- mention rejected), correlated/manipulated sources, incompatible definitions, conflicting evidence (intelligence.contradictions) and stale
-- coverage (the watchlist's freshness) mark the profile/assessment LIMITED (a new version; nothing rewritten), preserve the conflicting
-- evidence, suspend invalid comparisons and ROUTE revalidation. The executives' RESPONSE is a decision in the decision layer — nothing here
-- decides; decision use is recorded (which decision package cited which profile version).
--
-- Every write consults the PACKAGE_GATE seam (domain.package_function_state) for the competitor's package and the function it serves:
-- profile · collect · assess · compare · alert · twin. Refused `<noun> rejected (package): <reason>` (422).
-- BOUNDARY (R7): package signing/publisher → B77; all-layer namespaces → B78; marketplace/purchase → B112; parity → B111; the signed
-- acceptance record (AT-29 / PR-29-006) → R2 — this file holds the SOFTWARE part (fixtures in phase6-competitor-b33). Every figure a harness
-- or an act seeds through it is SYNTHETIC; a public feed (GDELT) never closes a licensed-source clause.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CI.1 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/* A COMPETITOR — bound to one graph ORGANIZATION entity of the domain, under one competitor package; its owner is the analyst who answers for
   the profile. twin_id: the competitor twin it populates (CI8), bound by that twin's owner. */
CREATE TABLE domain.competitors (
  competitor_id      uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_key        text NOT NULL CHECK (package_key ~ '^[a-z][a-z0-9-]{1,40}$'),
  entity_id          uuid NOT NULL,
  name               text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
  owner_principal_id uuid NOT NULL,
  twin_id            uuid,
  twin_bound_by      uuid,
  twin_bound_at      timestamptz,
  state              text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  retired_at         timestamptz,
  retired_by         uuid,
  retire_reason      text,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_comp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_comp_twin_bound CHECK ((twin_id IS NULL) = (twin_bound_at IS NULL) AND (twin_bound_at IS NULL) = (twin_bound_by IS NULL)),
  CONSTRAINT dci_comp_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL)
                                     AND (retire_reason IS NULL OR length(btrim(retire_reason)) >= 8))
);
CREATE UNIQUE INDEX dci_comp_one_per_entity ON domain.competitors (tenant_id, domain_id, entity_id) WHERE state = 'active';

/* A PROPOSAL — events, profile changes and an interpretation PROPOSED by the agent (inside its running scan) or a person; decided by a named
   analyst. content = {effective_from, events: [{kind, place_entity_id?, place?, market?, effective_date, details, citations}],
   changes: [{op: add|replace|end, fact: {key, kind, value, citations, confidence}}], interpretation: {statement, confidence} | null}.
   The proposal records, at proposal time, the source diversity, the identity basis of every cited evidence and the open contradictions. */
CREATE TABLE domain.competitor_proposals (
  proposal_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  base_version       int,
  content            jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_digest     text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  material           boolean NOT NULL,
  material_reasons   jsonb NOT NULL DEFAULT '[]'::jsonb,
  citations          jsonb NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
  source_diversity   jsonb NOT NULL,
  identity           jsonb NOT NULL,
  contradictions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  package_version    int NOT NULL,
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'declined', 'withdrawn', 'superseded')),
  proposed_by        uuid NOT NULL,
  proposed_via       text NOT NULL CHECK (proposed_via IN ('person', 'agent')),
  agent_id           uuid,
  run_id             uuid,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  result_version     int,
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_prop_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_prop_agent CHECK ((proposed_via = 'agent') = (agent_id IS NOT NULL AND run_id IS NOT NULL)),
  CONSTRAINT dci_prop_decided CHECK ((state IN ('proposed')) = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL)),
  CONSTRAINT dci_prop_reason CHECK (state NOT IN ('declined', 'withdrawn', 'superseded') OR length(btrim(coalesce(decision_reason, ''))) >= 8),
  CONSTRAINT dci_prop_result CHECK ((state = 'approved') = (result_version IS NOT NULL))
);
CREATE UNIQUE INDEX dci_prop_one_open ON domain.competitor_proposals (competitor_id, content_digest) WHERE state = 'proposed';
CREATE INDEX dci_prop_scope_idx ON domain.competitor_proposals (tenant_id, domain_id, state, proposed_at DESC);

/* A PROFILE VERSION — TEMPORAL (effective_from: the day it holds from; recorded_at: when it was believed) and immutable once written: a
   change is a new version (approved | limited), the prior one superseded. facts = [{key, kind, value, citations, confidence, limited,
   limited_reasons, from_proposal}]. A CPF canonical object per version (cpf_digest bound in the same transaction). */
CREATE TABLE domain.competitor_profile_versions (
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  version            int NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  effective_from     date NOT NULL,
  facts              jsonb NOT NULL CHECK (jsonb_typeof(facts) = 'array'),
  state              text NOT NULL CHECK (state IN ('approved', 'limited', 'superseded')),
  limited_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  cause              text NOT NULL CHECK (cause IN ('approval', 'revalidation')),
  proposal_id        uuid,
  approved_by        uuid NOT NULL,
  approved_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  supersedes         int,
  superseded_at      timestamptz,
  package_version    int NOT NULL,
  source_diversity   jsonb NOT NULL DEFAULT '{}'::jsonb,
  identity           jsonb NOT NULL DEFAULT '{}'::jsonb,
  cpf_digest         text CHECK (cpf_digest IS NULL OR cpf_digest ~ '^[0-9a-f]{64}$'),
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (competitor_id, version),
  CONSTRAINT dci_pv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_pv_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  CONSTRAINT dci_pv_limited CHECK (state <> 'limited' OR jsonb_array_length(limited_reasons) >= 1)
);
CREATE UNIQUE INDEX dci_pv_one_head ON domain.competitor_profile_versions (competitor_id) WHERE state <> 'superseded';

/* AN EVENT — an action or movement of the competitor (a plant opened at a PLACE entity, a product launched, a market entered …), effective
   on a day, recorded by the approval that accepted it. limited when the evidence it rests on is found wanting (revalidation). */
CREATE TABLE domain.competitor_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  kind               text NOT NULL CHECK (kind IN ('plant_opened', 'plant_closed', 'capacity_change', 'product_launched', 'market_entry', 'market_exit',
                                                   'acquisition', 'partnership', 'pricing_move', 'other')),
  place_entity_id    uuid,
  effective_date     date NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  citations          jsonb NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
  proposal_id        uuid NOT NULL,
  profile_version    int NOT NULL,
  state              text NOT NULL DEFAULT 'recorded' CHECK (state IN ('recorded', 'limited')),
  limited_reason     text,
  approved_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_ev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_ev_limited CHECK ((state = 'limited') = (limited_reason IS NOT NULL))
);
CREATE INDEX dci_ev_comp ON domain.competitor_events (competitor_id, effective_date);

/* AN ASSESSMENT — the approved INTERPRETATION of a proposal (kind interpretation), versioned: a challenge upheld supersedes it with a new
   version; a revalidation limits it. */
CREATE TABLE domain.competitor_assessments (
  assessment_id      uuid NOT NULL,
  version            int NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  kind               text NOT NULL CHECK (kind IN ('interpretation')),
  statement          text NOT NULL CHECK (length(btrim(statement)) >= 8),
  confidence         numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  material           boolean NOT NULL,
  evidence           jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1),
  source_diversity   jsonb NOT NULL,
  state              text NOT NULL CHECK (state IN ('approved', 'limited', 'superseded')),
  limited_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposal_id        uuid,
  challenge_id       uuid,
  profile_version    int NOT NULL,
  approved_by        uuid NOT NULL,
  approved_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at      timestamptz,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (assessment_id, version),
  CONSTRAINT dci_as_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_as_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  CONSTRAINT dci_as_limited CHECK (state <> 'limited' OR jsonb_array_length(limited_reasons) >= 1)
);
CREATE UNIQUE INDEX dci_as_one_head ON domain.competitor_assessments (assessment_id) WHERE state <> 'superseded';

/* A COMPARISON BASIS — declared and VERSIONED: metrics [{key, fact_kind, definition, unit, period, population}]. A new version supersedes
   the prior; the comparisons on a superseded basis whose definitions changed are SUSPENDED. */
CREATE TABLE domain.competitor_comparison_bases (
  basis_key          text NOT NULL CHECK (basis_key ~ '^[a-z][a-z0-9-]{1,60}$'),
  version            int NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) >= 4),
  metrics            jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'array' AND jsonb_array_length(metrics) >= 1),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state              text NOT NULL CHECK (state IN ('active', 'superseded')),
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at      timestamptz,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (tenant_id, domain_id, basis_key, version),
  CONSTRAINT dci_cb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_cb_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX dci_cb_one_active ON domain.competitor_comparison_bases (tenant_id, domain_id, basis_key) WHERE state = 'active';

/* A COMPARISON — competitors compared on one basis version: rows [{competitor_id, profile_version, metric, value, unit, period, population,
   citations}]; state current | limited (diversity below threshold, a limited profile) | suspended (the basis or a profile moved on). */
CREATE TABLE domain.competitor_comparisons (
  comparison_id      uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  basis_key          text NOT NULL,
  basis_version      int NOT NULL,
  competitor_ids     uuid[] NOT NULL CHECK (cardinality(competitor_ids) >= 2),
  rows               jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  source_diversity   jsonb NOT NULL,
  state              text NOT NULL CHECK (state IN ('current', 'limited', 'suspended')),
  limited_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  suspended_reason   text,
  suspended_at       timestamptz,
  compared_by        uuid NOT NULL,
  compared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_cmp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_cmp_suspended CHECK ((state = 'suspended') = (suspended_at IS NOT NULL) AND (suspended_at IS NULL) = (suspended_reason IS NULL)),
  FOREIGN KEY (tenant_id, domain_id, basis_key, basis_version) REFERENCES domain.competitor_comparison_bases (tenant_id, domain_id, basis_key, version)
);

/* A COMPETITOR WATCHLIST (CI5's choice: §CI keeps its own — §PK's domain.watchlists is not the prelude's seam): its owner (named on every
   alert), the competitors it watches (empty = every competitor of the package), rules [{rule_key, event_kinds, fact_kinds, markets}] and the
   FRESHNESS of its coverage (days; a watched competitor with no evidence that recent is STALE). */
CREATE TABLE domain.competitor_watchlists (
  watchlist_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_key        text NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  owner_principal_id uuid NOT NULL,
  competitor_ids     uuid[] NOT NULL DEFAULT '{}',
  rules              jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) >= 1),
  freshness_days     int NOT NULL CHECK (freshness_days BETWEEN 1 AND 3650),
  state              text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at         timestamptz,
  retired_by         uuid,
  retire_reason      text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_wl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_wl_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL))
);

/* AN ALERT — one per (watchlist, rule, approval): the routed item it raised (domain.alert, subject competitor_profile = the competitor). */
CREATE TABLE domain.competitor_alerts (
  alert_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  watchlist_id       uuid NOT NULL REFERENCES domain.competitor_watchlists (watchlist_id),
  rule_key           text NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  proposal_id        uuid NOT NULL,
  profile_version    int NOT NULL,
  item_id            uuid NOT NULL,
  item_state         text NOT NULL,
  limited            boolean NOT NULL,
  raised_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_al_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_al_once UNIQUE (watchlist_id, rule_key, proposal_id)
);

/* A REVALIDATION — routed when identity is mistaken, coverage stale or evidence in conflict; resolved by a later approved profile version. */
CREATE TABLE domain.competitor_revalidations (
  revalidation_id    uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  profile_version    int,
  reason_class       text NOT NULL CHECK (reason_class IN ('identity', 'coverage', 'contradiction')),
  details            jsonb NOT NULL,
  item_id            uuid,
  state              text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_by        uuid,
  resolved_at        timestamptz,
  resolution         text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_rv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_rv_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL))
);
CREATE UNIQUE INDEX dci_rv_one_open ON domain.competitor_revalidations (competitor_id, reason_class) WHERE state = 'open';

/* AN ANALYST CHALLENGE of an assessment version: upheld (by another analyst) → a superseding version; dismissed → recorded with its reason. */
CREATE TABLE domain.competitor_challenges (
  challenge_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  assessment_id      uuid NOT NULL,
  assessment_version int NOT NULL,
  challenger         uuid NOT NULL,
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  proposed           jsonb NOT NULL CHECK (jsonb_typeof(proposed) = 'object'),
  state              text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'upheld', 'dismissed')),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  result_version     int,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_ch_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_ch_decided CHECK ((state = 'open') = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL)
                                   AND (state = 'open' OR length(btrim(coalesce(decision_reason, ''))) >= 8)),
  CONSTRAINT dci_ch_upheld CHECK ((state = 'upheld') = (result_version IS NOT NULL)),
  FOREIGN KEY (assessment_id, assessment_version) REFERENCES domain.competitor_assessments (assessment_id, version)
);
CREATE UNIQUE INDEX dci_ch_one_open ON domain.competitor_challenges (assessment_id) WHERE state = 'open';

/* DECISION-USE EVIDENCE — which decision package cited which profile version (the response is the executives', decided in the decision layer). */
CREATE TABLE domain.competitor_decision_uses (
  use_id             uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  profile_version    int NOT NULL,
  package_id         uuid NOT NULL,
  note               text NOT NULL CHECK (length(btrim(note)) >= 8),
  cited_by           uuid NOT NULL,
  cited_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_du_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_du_once UNIQUE (package_id, competitor_id, profile_version),
  FOREIGN KEY (competitor_id, profile_version) REFERENCES domain.competitor_profile_versions (competitor_id, version)
);

/* A CAPACITY CHANGE PROPOSED TO THE COMPETITOR TWIN'S OWNER (CI8): raised by the approval of a capacity-bearing event; the twin's owner
   applies it through the existing twin version/ground/admit routes (the owner's own act) and records it applied against the admitted
   version, or declines it with a reason. */
CREATE TABLE domain.competitor_twin_proposals (
  proposal_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  twin_id            uuid NOT NULL,
  key                text NOT NULL,
  unit               text NOT NULL,
  current_value      numeric,
  delta              numeric NOT NULL,
  proposed_value     numeric NOT NULL,
  basis              jsonb NOT NULL,
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'applied', 'declined', 'superseded')),
  decided_by         uuid,
  decided_at         timestamptz,
  note               text,
  applied_version    int,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_tp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_tp_applied CHECK ((state = 'applied') = (applied_version IS NOT NULL)),
  CONSTRAINT dci_tp_decided CHECK ((state IN ('applied', 'declined')) = (decided_by IS NOT NULL))
);

/* THE AGENT'S SCAN MARKS (append-only): per run and competitor, the record-time watermark it read to and what it found. */
CREATE TABLE domain.competitor_scan_marks (
  mark_id            uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  agent_id           uuid NOT NULL,
  run_id             uuid NOT NULL,
  watermark          timestamptz NOT NULL,
  claims_seen        int NOT NULL CHECK (claims_seen >= 0),
  proposed           int NOT NULL CHECK (proposed >= 0),
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_sm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dci_sm_comp ON domain.competitor_scan_marks (competitor_id, watermark DESC);

/* THE LEDGER (append-only): every lifecycle step of §CI's records, with its actor. */
CREATE TABLE domain.competitor_ledger (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid,
  subject_kind       text NOT NULL CHECK (subject_kind IN ('competitor', 'proposal', 'profile', 'assessment', 'basis', 'comparison', 'watchlist', 'alert',
                                                           'revalidation', 'challenge', 'decision_use', 'twin_proposal')),
  subject_id         uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('competitor.declared', 'competitor.retired', 'competitor.twin_bound',
    'proposal.proposed', 'proposal.approved', 'proposal.declined', 'proposal.withdrawn', 'proposal.superseded',
    'profile.versioned', 'profile.limited', 'assessment.approved', 'assessment.limited', 'assessment.superseded',
    'basis.declared', 'comparison.recorded', 'comparison.suspended', 'watchlist.declared', 'watchlist.retired', 'alert.raised',
    'revalidation.opened', 'revalidation.resolved', 'challenge.opened', 'challenge.upheld', 'challenge.dismissed',
    'decision.cited', 'twin.proposed', 'twin.applied', 'twin.declined', 'twin.superseded')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_lg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dci_lg_comp ON domain.competitor_ledger (competitor_id, occurred_at);
CREATE TRIGGER dci_ledger_append_only BEFORE UPDATE OR DELETE ON domain.competitor_ledger FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER dci_scan_marks_append_only BEFORE UPDATE OR DELETE ON domain.competitor_scan_marks FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §CI.2 THE GUARDS — nothing is deleted; identity and content columns never change; states move forward only. ──────────────────────────
CREATE OR REPLACE FUNCTION domain.dci_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE v_noun text := CASE TG_TABLE_NAME WHEN 'competitor_comparisons' THEN 'competitor comparison' WHEN 'competitor_comparison_bases' THEN 'competitor comparison'
                                          WHEN 'competitor_assessments' THEN 'competitor assessment' WHEN 'competitor_challenges' THEN 'competitor assessment'
                                          WHEN 'competitor_watchlists' THEN 'competitor watchlist' ELSE 'competitor profile' END;
        o jsonb; n jsonb; k text; v_mutable text[];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rejected (state): a % row is never deleted (it is superseded, retired or resolved)', v_noun, TG_TABLE_NAME USING ERRCODE = '2F002'; END IF;
  v_mutable := CASE TG_TABLE_NAME
    WHEN 'competitors' THEN ARRAY['twin_id', 'twin_bound_by', 'twin_bound_at', 'state', 'retired_at', 'retired_by', 'retire_reason']
    WHEN 'competitor_proposals' THEN ARRAY['state', 'decided_by', 'decided_at', 'decision_reason', 'result_version']
    WHEN 'competitor_profile_versions' THEN ARRAY['state', 'superseded_at', 'cpf_digest']
    WHEN 'competitor_events' THEN ARRAY['state', 'limited_reason']
    WHEN 'competitor_assessments' THEN ARRAY['state', 'superseded_at']
    WHEN 'competitor_comparison_bases' THEN ARRAY['state', 'superseded_at']
    WHEN 'competitor_comparisons' THEN ARRAY['state', 'suspended_reason', 'suspended_at']
    WHEN 'competitor_watchlists' THEN ARRAY['state', 'retired_at', 'retired_by', 'retire_reason']
    WHEN 'competitor_alerts' THEN ARRAY['item_state']
    WHEN 'competitor_revalidations' THEN ARRAY['state', 'resolved_by', 'resolved_at', 'resolution', 'item_id']
    WHEN 'competitor_challenges' THEN ARRAY['state', 'decided_by', 'decided_at', 'decision_reason', 'result_version']
    WHEN 'competitor_twin_proposals' THEN ARRAY['state', 'decided_by', 'decided_at', 'note', 'applied_version']
    ELSE ARRAY[]::text[] END;
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  FOR k IN SELECT jsonb_object_keys(o) LOOP
    IF NOT (k = ANY (v_mutable)) AND (o -> k) IS DISTINCT FROM (n -> k) THEN
      RAISE EXCEPTION '% rejected (state): column % of % never changes (a change is a new version or a new record)', v_noun, k, TG_TABLE_NAME USING ERRCODE = '2F002';
    END IF;
  END LOOP;
  -- a write-once binding stays as written; a terminal state is kept as it was
  IF TG_TABLE_NAME = 'competitor_profile_versions' AND (o ->> 'cpf_digest') IS NOT NULL AND (n ->> 'cpf_digest') IS DISTINCT FROM (o ->> 'cpf_digest') THEN
    RAISE EXCEPTION 'competitor profile rejected (state): version % carries its CPF object already', o ->> 'version' USING ERRCODE = '2F002';
  END IF;
  IF TG_TABLE_NAME = 'competitors' AND (o ->> 'twin_id') IS NOT NULL AND (n ->> 'twin_id') IS DISTINCT FROM (o ->> 'twin_id') THEN
    RAISE EXCEPTION 'competitor profile rejected (state): the competitor is bound to twin % already', o ->> 'twin_id' USING ERRCODE = '2F002';
  END IF;
  IF (o ->> 'state') IN ('retired', 'superseded', 'declined', 'withdrawn', 'resolved', 'upheld', 'dismissed', 'applied')
     AND (o ->> 'state') IS DISTINCT FROM (n ->> 'state') THEN
    RAISE EXCEPTION '% rejected (state): a % row in state % is kept as it was', v_noun, TG_TABLE_NAME, o ->> 'state' USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION domain.dci_guard() FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['competitors', 'competitor_proposals', 'competitor_profile_versions', 'competitor_events', 'competitor_assessments',
                           'competitor_comparison_bases', 'competitor_comparisons', 'competitor_watchlists', 'competitor_alerts', 'competitor_revalidations',
                           'competitor_challenges', 'competitor_twin_proposals', 'competitor_decision_uses'] LOOP
    EXECUTE format('CREATE TRIGGER dci_guard BEFORE UPDATE OR DELETE ON domain.%I FOR EACH ROW EXECUTE FUNCTION domain.dci_guard()', t);
  END LOOP;
END $$;

-- RLS and grants: the 0081 loop idiom (policy domain_isolation — the prelude's text for schema domain; SELECT to eye_app and eye_commit;
-- no write grant: the definer ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['competitors', 'competitor_proposals', 'competitor_profile_versions', 'competitor_events', 'competitor_assessments',
                           'competitor_comparison_bases', 'competitor_comparisons', 'competitor_watchlists', 'competitor_alerts', 'competitor_revalidations',
                           'competitor_challenges', 'competitor_decision_uses', 'competitor_twin_proposals', 'competitor_scan_marks', 'competitor_ledger'] LOOP
    EXECUTE format('REVOKE ALL ON domain.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE domain.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE domain.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY domain_isolation ON domain.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON domain.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- The CPF canonical write (§0.6: the competitor profile version's object is §CI's): the two acts that write a profile version admit its CPF.
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('domain.competitor.assessment.approve', ARRAY['CPF'], 'B33 §CI (0111): an analyst''s approval of a material assessment admits the new competitor profile version as a CPF object'),
  ('domain.competitor.revalidate', ARRAY['CPF'], 'B33 §CI (0111): a revalidation that finds a fact resting on a mistaken identity or conflicting evidence admits the LIMITED profile version as a CPF object')
ON CONFLICT (action) DO NOTHING;

-- §CI.3 THE READS (INVOKER, plain SQL under the caller's RLS — the N-01 rule) ──────────────────────────────────────────────────────

/* THE COMPETITOR PACKAGE'S MANIFEST SECTION (the active version's `competitor` section; the defaults when the package declares none). */
CREATE OR REPLACE FUNCTION domain.dci_manifest(p_tenant uuid, p_domain uuid, p_package_key text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
           'material', jsonb_build_object('event_kinds', '["plant_opened","plant_closed","capacity_change","market_entry","market_exit","acquisition"]'::jsonb,
                                          'fact_kinds', '["facility","capability","market"]'::jsonb, 'min_confidence', 0.8),
           'diversity', jsonb_build_object('min_publishers', 2),
           'coverage', jsonb_build_object('default_freshness_days', 30),
           'twin', jsonb_build_object('key', 'capacity.per_month', 'unit', 'units/month', 'capacity_detail', 'capacity_per_month'))
         || coalesce((SELECT v.manifest -> 'competitor' FROM domain.package_versions v JOIN domain.packages k ON k.package_id = v.package_id
                       WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.package_key = p_package_key AND v.state = 'active'
                         AND jsonb_typeof(v.manifest -> 'competitor') = 'object'), '{}'::jsonb)
$$;
REVOKE ALL ON FUNCTION domain.dci_manifest(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_manifest(uuid, uuid, text) TO eye_app, eye_commit;

/* The EVIDENCE a citation list rests on: evidence cited directly and the evidence each cited claim was extracted from (its lineage). */
CREATE OR REPLACE FUNCTION domain.dci_evidence_of(p_tenant uuid, p_domain uuid, p_citations jsonb) RETURNS TABLE (evidence_id uuid, via text, claim_id uuid)
LANGUAGE sql STABLE SET search_path = domain, objects, pg_catalog, pg_temp AS $$
  SELECT DISTINCT (c ->> 'id')::uuid, 'evidence', NULL::uuid FROM jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) c WHERE c ->> 'kind' = 'evidence'
  UNION
  SELECT DISTINCT (o.payload -> 'lineage' ->> 'evidence_object_id')::uuid, 'claim', o.object_id
    FROM jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) c
    JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::bigint
   WHERE c ->> 'kind' = 'claim' AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.payload -> 'lineage' ? 'evidence_object_id'
$$;
REVOKE ALL ON FUNCTION domain.dci_evidence_of(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_evidence_of(uuid, uuid, jsonb) TO eye_app, eye_commit;

/* SOURCE DIVERSITY of a citation list: the evidence → its observation → the source contract and its PUBLISHER. Distinct publishers and
   contracts are counted; CORRELATED sources are flagged — two evidence items of one publisher, or the same bytes (content digest) arriving
   through different sources (a republished release counts once). Below the package's threshold (min_publishers) → below_threshold, and the
   assessment resting on it is LIMITED. Every figure is a count over the records; nothing is imputed. */
CREATE OR REPLACE FUNCTION domain.dci_source_diversity(p_tenant uuid, p_domain uuid, p_citations jsonb, p_min_publishers int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, objects, observation, pg_catalog, pg_temp AS $$
  WITH ev AS (
    SELECT DISTINCT e.evidence_id FROM domain.dci_evidence_of(p_tenant, p_domain, p_citations) e WHERE e.evidence_id IS NOT NULL
  ), rec AS (
    SELECT ev.evidence_id, d.payload ->> 'content_digest' AS bytes, obs.payload ->> 'source_id' AS source_id,
           (SELECT sc.publisher FROM observation.source_contracts_current sc WHERE sc.source_id::text = obs.payload ->> 'source_id' ORDER BY sc.contract_version DESC LIMIT 1) AS publisher,
           (SELECT sc.source_key FROM observation.source_contracts_current sc WHERE sc.source_id::text = obs.payload ->> 'source_id' ORDER BY sc.contract_version DESC LIMIT 1) AS source_key,
           (SELECT sc.data_origin FROM observation.source_contracts_current sc WHERE sc.source_id::text = obs.payload ->> 'source_id' ORDER BY sc.contract_version DESC LIMIT 1) AS data_origin
      FROM ev
      LEFT JOIN LATERAL (SELECT x.payload, x.source_object_ids FROM objects.canonical_objects x WHERE x.object_id = ev.evidence_id AND x.object_type = 'EVD'
                          AND x.tenant_id = p_tenant ORDER BY x.object_version DESC LIMIT 1) d ON true
      LEFT JOIN LATERAL (SELECT y.payload FROM objects.canonical_objects y
                          WHERE y.object_type = 'OBS' AND y.tenant_id = p_tenant
                            AND y.object_id = (SELECT substr(s, 5)::uuid FROM jsonb_array_elements_text(coalesce(d.source_object_ids, '[]'::jsonb)) s WHERE s LIKE 'OBS:%' LIMIT 1)
                          ORDER BY y.object_version DESC LIMIT 1) obs ON true
  ), agg AS (
    SELECT count(*)::int AS evidence, count(DISTINCT publisher)::int AS publishers,
           count(DISTINCT source_key)::int AS contracts,
           coalesce(jsonb_agg(DISTINCT publisher) FILTER (WHERE publisher IS NOT NULL), '[]'::jsonb) AS publisher_list,
           coalesce(jsonb_agg(DISTINCT source_key) FILTER (WHERE source_key IS NOT NULL), '[]'::jsonb) AS contract_list,
           coalesce(jsonb_agg(DISTINCT data_origin) FILTER (WHERE data_origin IS NOT NULL), '[]'::jsonb) AS origins,
           count(*) FILTER (WHERE publisher IS NULL)::int AS unknown_origin
      FROM rec
  ), corr AS (
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) AS correlated FROM (
      SELECT jsonb_build_object('kind', 'same_publisher', 'publisher', publisher, 'evidence', jsonb_agg(evidence_id ORDER BY evidence_id)) AS x
        FROM rec WHERE publisher IS NOT NULL GROUP BY publisher HAVING count(*) > 1
      UNION ALL
      SELECT jsonb_build_object('kind', 'same_bytes', 'content_digest', bytes, 'evidence', jsonb_agg(evidence_id ORDER BY evidence_id), 'sources', jsonb_agg(DISTINCT source_key))
        FROM rec WHERE bytes IS NOT NULL GROUP BY bytes HAVING count(DISTINCT coalesce(source_key, '')) > 1) q
  ), indep AS (
    -- the INDEPENDENT origins: known publishers, after the same-bytes republications are folded onto the first publisher that carried them;
    -- evidence of unknown origin counts toward none (it is listed as unknown_origin)
    SELECT count(DISTINCT first_pub)::int AS independent FROM (
      SELECT coalesce((SELECT min(r2.publisher) FROM rec r2 WHERE r2.bytes = r.bytes), r.publisher) AS first_pub FROM rec r) z
  )
  SELECT jsonb_build_object('evidence', agg.evidence, 'publishers', agg.publishers, 'contracts', agg.contracts, 'independent_publishers', indep.independent,
                            'publisher_list', agg.publisher_list, 'contract_list', agg.contract_list, 'data_origins', agg.origins, 'unknown_origin', agg.unknown_origin,
                            'correlated', corr.correlated, 'single_origin', indep.independent <= 1, 'threshold', p_min_publishers,
                            'below_threshold', indep.independent < p_min_publishers)
    FROM agg, corr, indep
$$;
REVOKE ALL ON FUNCTION domain.dci_source_diversity(uuid, uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_source_diversity(uuid, uuid, jsonb, int) TO eye_app, eye_commit;

/* IDENTITY through the graph's resolution: per evidence item, whether a mention extracted from it is ACCEPTED as the competitor's entity
   (resolved), WAS and no longer is — superseded by a split, or rejected (mistaken), or never was (unresolved). */
CREATE OR REPLACE FUNCTION domain.dci_identity(p_tenant uuid, p_domain uuid, p_entity uuid, p_citations jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, graph, pg_catalog, pg_temp AS $$
  WITH ev AS (SELECT DISTINCT e.evidence_id FROM domain.dci_evidence_of(p_tenant, p_domain, p_citations) e WHERE e.evidence_id IS NOT NULL),
  per AS (
    SELECT ev.evidence_id,
           EXISTS (SELECT 1 FROM graph.resolutions_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.evidence_object_id = ev.evidence_id
                     AND r.entity_id = p_entity AND r.state = 'accepted') AS resolved,
           (SELECT jsonb_agg(jsonb_build_object('resolution_id', r.resolution_id, 'state', r.state, 'mention', r.mention_text,
                                                'now_entity', (SELECT r2.entity_id FROM graph.resolutions_current r2 WHERE r2.resolution_id = r.superseded_by)) ORDER BY r.resolution_id)
              FROM graph.resolutions_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.evidence_object_id = ev.evidence_id
               AND r.entity_id = p_entity AND r.state IN ('superseded', 'rejected')) AS lost
      FROM ev
  )
  SELECT jsonb_build_object(
    'entity_id', p_entity,
    'evidence', coalesce(jsonb_agg(jsonb_build_object('evidence_id', per.evidence_id,
                   'state', CASE WHEN per.resolved THEN 'resolved' WHEN per.lost IS NOT NULL THEN 'mistaken' ELSE 'unresolved' END,
                   'lost', per.lost) ORDER BY per.evidence_id), '[]'::jsonb),
    'resolved', count(*) FILTER (WHERE per.resolved),
    'mistaken', count(*) FILTER (WHERE NOT per.resolved AND per.lost IS NOT NULL),
    'unresolved', count(*) FILTER (WHERE NOT per.resolved AND per.lost IS NULL),
    'state', CASE WHEN count(*) FILTER (WHERE NOT per.resolved AND per.lost IS NOT NULL) > 0 THEN 'mistaken'
                  WHEN count(*) FILTER (WHERE NOT per.resolved) > 0 THEN 'unresolved' ELSE 'resolved' END)
  FROM per
$$;
REVOKE ALL ON FUNCTION domain.dci_identity(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_identity(uuid, uuid, uuid, jsonb) TO eye_app, eye_commit;

/* CONFLICTING EVIDENCE: the OPEN contradictions (intelligence.contradictions) touching any claim the citations name — preserved, never resolved here. */
CREATE OR REPLACE FUNCTION domain.dci_contradictions(p_tenant uuid, p_domain uuid, p_citations jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, intelligence, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('contradiction_id', x.contradiction_id, 'subject', x.subject, 'predicate', x.predicate,
                                                       'a', jsonb_build_object('id', x.a_object_id, 'version', x.a_version, 'value', x.a_value),
                                                       'b', jsonb_build_object('id', x.b_object_id, 'version', x.b_version, 'value', x.b_value))), '[]'::jsonb)
    FROM intelligence.contradictions x
    JOIN jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) c ON c ->> 'kind' = 'claim' AND (x.a_object_id = (c ->> 'id')::uuid OR x.b_object_id = (c ->> 'id')::uuid)
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'open'
$$;
REVOKE ALL ON FUNCTION domain.dci_contradictions(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_contradictions(uuid, uuid, jsonb) TO eye_app, eye_commit;

/* COVERAGE FRESHNESS of a competitor: the newest evidence its identity rests on (an accepted mention of its entity) against the freshness of
   the watchlists that watch it (the strictest), else the package default. stale = no evidence within that many days of the DATABASE's now. */
CREATE OR REPLACE FUNCTION domain.dci_coverage(p_tenant uuid, p_domain uuid, p_competitor uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, graph, objects, pg_catalog, pg_temp AS $$
  WITH c AS (SELECT * FROM domain.competitors x WHERE x.competitor_id = p_competitor AND x.tenant_id = p_tenant AND x.domain_id = p_domain),
  f AS (
    SELECT coalesce((SELECT min(w.freshness_days) FROM domain.competitor_watchlists w, c WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state = 'active'
                       AND w.package_key = c.package_key AND (cardinality(w.competitor_ids) = 0 OR c.competitor_id = ANY (w.competitor_ids))),
                    (SELECT (domain.dci_manifest(p_tenant, p_domain, c.package_key) -> 'coverage' ->> 'default_freshness_days')::int FROM c)) AS days
  ),
  newest AS (
    SELECT max(o.recorded_at) AS at FROM c JOIN graph.resolutions_current r ON r.entity_id = c.entity_id AND r.state = 'accepted' AND r.tenant_id = p_tenant
      JOIN objects.canonical_objects o ON o.object_id = r.evidence_object_id AND o.object_type = 'EVD' AND o.tenant_id = p_tenant
  )
  SELECT jsonb_build_object('freshness_days', f.days, 'newest_evidence_at', newest.at,
                            'state', CASE WHEN newest.at IS NULL THEN 'none' WHEN newest.at < clock_timestamp() - make_interval(days => f.days) THEN 'stale' ELSE 'fresh' END,
                            'as_of', clock_timestamp())
    FROM f, newest
$$;
REVOKE ALL ON FUNCTION domain.dci_coverage(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_coverage(uuid, uuid, uuid) TO eye_app, eye_commit;

-- §CI.4 THE PRIVATE CHECKS (no grant to a runtime role) ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION domain.dci_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION domain.dci_assert_actor(text, uuid) FROM PUBLIC;

/* A named, active HUMAN holding one of the roles in the domain (or its tenant). */
CREATE OR REPLACE FUNCTION domain.dci_is_human_with(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SET search_path = domain, identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$;
REVOKE ALL ON FUNCTION domain.dci_is_human_with(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* The named human act: the acting principal, a human (never an agent), holding one of the roles. */
CREATE OR REPLACE FUNCTION domain.dci_assert_human(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = domain, identity, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM domain.dci_assert_actor(p_noun, p_actor);
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act; an agent or a system principal never performs it', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT domain.dci_is_human_with(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % needs one of % in this domain; the acting human holds none', p_noun, p_what, array_to_string(p_roles, ', ') USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION domain.dci_assert_human(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* THE PACKAGE GATE for a competitor function (the prelude's seam): refused `<noun> rejected (package): <reason>` (22023 → 422). */
CREATE OR REPLACE FUNCTION domain.dci_gate(p_noun text, p_tenant uuid, p_domain uuid, p_package_key text, p_function text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE s jsonb := domain.package_function_state(p_tenant, p_domain, p_package_key, p_function);
BEGIN
  IF s ->> 'state' <> 'active' THEN RAISE EXCEPTION '% rejected (package): %', p_noun, s ->> 'reason' USING ERRCODE = '22023'; END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION domain.dci_gate(text, uuid, uuid, text, text) FROM PUBLIC;

/* The competitor, in this domain, locked for the act. */
CREATE OR REPLACE FUNCTION domain.dci_competitor(p_noun text, p_tenant uuid, p_domain uuid, p_competitor uuid, p_lock boolean) RETURNS domain.competitors
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE c domain.competitors%ROWTYPE;
BEGIN
  IF p_lock THEN SELECT * INTO c FROM domain.competitors x WHERE x.competitor_id = p_competitor AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  ELSE SELECT * INTO c FROM domain.competitors x WHERE x.competitor_id = p_competitor AND x.tenant_id = p_tenant AND x.domain_id = p_domain; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_competitor): no competitor % in this domain', p_noun, p_competitor USING ERRCODE = '23503'; END IF;
  IF c.state <> 'active' THEN RAISE EXCEPTION '% rejected (state): competitor % is retired', p_noun, c.name USING ERRCODE = '22023'; END IF;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION domain.dci_competitor(text, uuid, uuid, uuid, boolean) FROM PUBLIC;

/* Every citation names an existing claim (ENT/EVT/CLM/REL) or evidence (EVD) object of this domain at that exact version and digest. */
CREATE OR REPLACE FUNCTION domain.dci_assert_citations(p_noun text, p_tenant uuid, p_domain uuid, p_citations jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = domain, objects, pg_catalog, pg_temp AS $$
DECLARE c jsonb; v_digest text; v_type text;
BEGIN
  IF jsonb_typeof(p_citations) <> 'array' OR jsonb_array_length(p_citations) = 0 THEN
    RAISE EXCEPTION '% rejected (citation): every fact, event and interpretation cites the claims or evidence it rests on', p_noun USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_citations) LOOP
    IF NOT (c ->> 'kind' IN ('claim', 'evidence')) OR (c ->> 'id') !~ '^[0-9a-f-]{36}$' OR jsonb_typeof(c -> 'version') <> 'number' OR coalesce(c ->> 'digest', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION '% rejected (citation): a citation is {kind: claim | evidence, id, version, digest} (got %)', p_noun, left(c::text, 200) USING ERRCODE = '22023';
    END IF;
    SELECT o.content_digest, o.object_type INTO v_digest, v_type FROM objects.canonical_objects o
     WHERE o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::bigint AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
    IF NOT FOUND OR (c ->> 'kind' = 'evidence' AND v_type <> 'EVD') OR (c ->> 'kind' = 'claim' AND NOT (v_type IN ('ENT', 'EVT', 'CLM', 'REL'))) THEN
      RAISE EXCEPTION '% rejected (unknown_citation): no % % version % in this domain', p_noun, c ->> 'kind', c ->> 'id', c ->> 'version' USING ERRCODE = '23503';
    END IF;
    IF v_digest <> c ->> 'digest' THEN
      RAISE EXCEPTION '% rejected (citation): % % version % has digest %…, not the cited %…', p_noun, c ->> 'kind', c ->> 'id', c ->> 'version', left(v_digest, 12), left(c ->> 'digest', 12) USING ERRCODE = '22023';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION domain.dci_assert_citations(text, uuid, uuid, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION domain.dci_log(p_tenant uuid, p_domain uuid, p_competitor uuid, p_kind text, p_subject uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SET search_path = domain, pg_catalog, pg_temp AS $$
  INSERT INTO domain.competitor_ledger (event_id, scope, tenant_id, domain_id, competitor_id, subject_kind, subject_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_competitor, p_kind, p_subject, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION domain.dci_log(uuid, uuid, uuid, text, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The head (latest not-superseded) profile version. */
CREATE OR REPLACE FUNCTION domain.dci_head(p_competitor uuid) RETURNS domain.competitor_profile_versions
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT * FROM domain.competitor_profile_versions v WHERE v.competitor_id = p_competitor AND v.state <> 'superseded'
$$;
REVOKE ALL ON FUNCTION domain.dci_head(uuid) FROM PUBLIC;

/* ROUTE A REVALIDATION (one open per competitor and reason): a `domain.alert` item under the published policy, the competitor's owner named. */
CREATE OR REPLACE FUNCTION domain.dci_route_revalidation(c domain.competitors, p_version int, p_class text, p_details jsonb, p_title text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE v_id uuid; v_item jsonb; v_old domain.competitor_revalidations%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM domain.competitor_revalidations r WHERE r.competitor_id = c.competitor_id AND r.reason_class = p_class AND r.state = 'open';
  IF FOUND THEN RETURN jsonb_build_object('revalidation_id', v_old.revalidation_id, 'item_id', v_old.item_id, 'existing', true); END IF;
  v_id := gen_random_uuid();
  v_item := executive.b33_raise_routed(c.tenant_id, c.domain_id, 'domain.alert', 'competitor_profile', v_id, p_title,
              jsonb_build_array(format('revalidation (%s) of the profile of %s', p_class, c.name)), c.owner_principal_id, v_id, 'competitor.revalidation',
              jsonb_build_object('competitor_id', c.competitor_id, 'reason_class', p_class, 'profile_version', p_version, 'revalidation_id', v_id) || coalesce(p_details, '{}'::jsonb),
              NULL, p_actor, p_correlation);
  INSERT INTO domain.competitor_revalidations (revalidation_id, scope, tenant_id, domain_id, competitor_id, profile_version, reason_class, details, item_id, opened_by, correlation_id)
  VALUES (v_id, 'DOMAIN', c.tenant_id, c.domain_id, c.competitor_id, p_version, p_class, coalesce(p_details, '{}'::jsonb), (v_item ->> 'item_id')::uuid, p_actor, p_correlation);
  PERFORM domain.dci_log(c.tenant_id, c.domain_id, c.competitor_id, 'revalidation', v_id, 'revalidation.opened', p_actor,
                         jsonb_build_object('reason_class', p_class, 'profile_version', p_version, 'item', v_item), p_correlation);
  RETURN jsonb_build_object('revalidation_id', v_id, 'item_id', v_item ->> 'item_id', 'item_state', v_item ->> 'state', 'existing', false);
END $$;
REVOKE ALL ON FUNCTION domain.dci_route_revalidation(domain.competitors, int, text, jsonb, text, uuid, uuid) FROM PUBLIC;

/* SUSPEND the current/limited comparisons resting on a competitor's profile versions below p_from_version (their profile moved on under them). */
CREATE OR REPLACE FUNCTION domain.dci_suspend_comparisons(c domain.competitors, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE x record; v_ids jsonb := '[]'::jsonb;
BEGIN
  FOR x IN SELECT k.comparison_id FROM domain.competitor_comparisons k WHERE k.tenant_id = c.tenant_id AND k.domain_id = c.domain_id AND k.state <> 'suspended'
             AND c.competitor_id = ANY (k.competitor_ids) ORDER BY k.compared_at FOR UPDATE LOOP
    UPDATE domain.competitor_comparisons SET state = 'suspended', suspended_at = clock_timestamp(), suspended_reason = p_reason WHERE comparison_id = x.comparison_id;
    PERFORM domain.dci_log(c.tenant_id, c.domain_id, c.competitor_id, 'comparison', x.comparison_id, 'comparison.suspended', p_actor, jsonb_build_object('reason', p_reason), p_correlation);
    v_ids := v_ids || jsonb_build_array(x.comparison_id);
  END LOOP;
  RETURN v_ids;
END $$;
REVOKE ALL ON FUNCTION domain.dci_suspend_comparisons(domain.competitors, text, uuid, uuid) FROM PUBLIC;

-- §CI.5 THE PORTS (SECURITY DEFINER; the bound action asserted; the scope asserted; the acting principal recorded) ─────────────────────

/* DECLARE a competitor (domain.competitor.declare): bound to an ACTIVE graph ORGANIZATION entity of the domain (identity is the graph's);
   its owner a named analyst or strategy owner; the package's `profile` function active. One active competitor per entity. */
CREATE OR REPLACE FUNCTION domain.dci_declare_competitor(p_competitor uuid, p_tenant uuid, p_domain uuid, p_package_key text, p_entity uuid, p_name text, p_owner uuid,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, graph, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e graph.entities_current%ROWTYPE; g jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  g := domain.dci_gate('competitor profile', p_tenant, p_domain, p_package_key, 'profile');
  SELECT * INTO e FROM graph.entities_current x WHERE x.entity_id = p_entity AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_entity): no graph entity % in this domain', p_entity USING ERRCODE = '23503'; END IF;
  IF e.entity_type <> 'organization' THEN
    RAISE EXCEPTION 'competitor profile rejected (identity): entity % is a %, not an organization — a competitor is an organization of the graph', e.canonical_name, e.entity_type USING ERRCODE = '22023';
  END IF;
  IF e.lifecycle_state <> 'active' THEN
    RAISE EXCEPTION 'competitor profile rejected (identity): entity % is % (its identity moved on: %)', e.canonical_name, e.lifecycle_state, coalesce(e.superseded_by::text, 'retired') USING ERRCODE = '22023';
  END IF;
  IF NOT domain.dci_is_human_with(p_owner, p_tenant, p_domain, ARRAY['domain_analyst', 'strategy_owner']) THEN
    RAISE EXCEPTION 'competitor profile rejected (owner): the owner of a competitor profile is a named analyst or strategy owner of this domain' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM domain.competitors x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.entity_id = p_entity AND x.state = 'active') THEN
    RAISE EXCEPTION 'competitor profile rejected (duplicate): entity % is already a competitor of this domain', e.canonical_name USING ERRCODE = '23505';
  END IF;
  INSERT INTO domain.competitors (competitor_id, scope, tenant_id, domain_id, package_key, entity_id, name, owner_principal_id, created_by, correlation_id)
  VALUES (p_competitor, 'DOMAIN', p_tenant, p_domain, p_package_key, p_entity, btrim(p_name), p_owner, p_actor, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, p_competitor, 'competitor', p_competitor, 'competitor.declared', p_actor,
                         jsonb_build_object('entity_id', p_entity, 'entity_name', e.canonical_name, 'package', g), p_correlation);
  RETURN jsonb_build_object('competitor_id', p_competitor, 'entity_id', p_entity, 'entity_name', e.canonical_name, 'package', g);
END $$;
REVOKE ALL ON FUNCTION domain.dci_declare_competitor(uuid, uuid, uuid, text, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_declare_competitor(uuid, uuid, uuid, text, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* PROPOSE (domain.competitor.propose): events, profile changes and an interpretation, by a person or by the Domain Intelligence Agent INSIDE
   its own running domain_scan (its principal, its run). The proposal's citations are checked exactly; its MATERIALITY, SOURCE DIVERSITY,
   IDENTITY basis and open CONTRADICTIONS are computed here and recorded (never taken from the caller). One open proposal per content digest. */
CREATE OR REPLACE FUNCTION domain.dci_propose(p_proposal uuid, p_tenant uuid, p_domain uuid, p_competitor uuid, p_content jsonb,
                                              p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, executive, objects, graph, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c domain.competitors%ROWTYPE; g jsonb; h domain.competitor_profile_versions%ROWTYPE; m jsonb; v_cites jsonb := '[]'::jsonb; x jsonb;
        v_material boolean := false; v_reasons jsonb := '[]'::jsonb; v_div jsonb; v_ident jsonb; v_contra jsonb; a executive.agents%ROWTYPE; r executive.agent_runs%ROWTYPE;
        v_events jsonb := coalesce(p_content -> 'events', '[]'::jsonb); v_changes jsonb := coalesce(p_content -> 'changes', '[]'::jsonb); v_interp jsonb := p_content -> 'interpretation';
        p_content_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  c := domain.dci_competitor('competitor profile', p_tenant, p_domain, p_competitor, false);
  -- the agent proposes only inside its own running scan, under its own principal (the Supply Chain Agent's rule)
  IF p_agent IS NOT NULL OR p_run IS NOT NULL THEN
    SELECT * INTO a FROM executive.agents x WHERE x.agent_id = p_agent AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND OR a.status <> 'active' OR a.agent_kind <> 'domain_intelligence' OR a.principal_id <> p_actor THEN
      RAISE EXCEPTION 'competitor profile rejected (actor): an agent proposal is the active Domain Intelligence Agent''s, under its own principal' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO r FROM executive.agent_runs x WHERE x.run_id = p_run AND x.agent_id = p_agent;
    IF NOT FOUND OR r.outcome <> 'running' OR r.task <> 'domain_scan' THEN
      RAISE EXCEPTION 'competitor profile rejected (actor): an agent proposes inside its own running domain_scan (run % is not one)', p_run USING ERRCODE = '42501';
    END IF;
    g := domain.dci_gate('competitor profile', p_tenant, p_domain, c.package_key, 'collect');
  ELSE
    IF EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind <> 'human') THEN
      RAISE EXCEPTION 'competitor profile rejected (actor): an agent proposes only inside its own running domain_scan' USING ERRCODE = '42501';
    END IF;
    g := domain.dci_gate('competitor profile', p_tenant, p_domain, c.package_key, 'profile');
  END IF;
  IF jsonb_typeof(p_content) <> 'object' OR jsonb_typeof(v_events) <> 'array' OR jsonb_typeof(v_changes) <> 'array'
     OR (v_interp IS NOT NULL AND jsonb_typeof(v_interp) NOT IN ('object', 'null')) THEN
    RAISE EXCEPTION 'competitor profile rejected (request): content is {effective_from, events[], changes[], interpretation?}' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_events) + jsonb_array_length(v_changes) = 0 AND jsonb_typeof(coalesce(v_interp, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'competitor profile rejected (request): a proposal carries at least one event, profile change or interpretation' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_content ->> 'effective_from', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'competitor profile rejected (request): effective_from is the day the change holds from (YYYY-MM-DD)' USING ERRCODE = '22023';
  END IF;
  -- the DIGEST is the port's (over the stored jsonb text): the analyst's decision names it back
  p_content_digest := encode(sha256(convert_to(p_content::text, 'UTF8')), 'hex');
  m := domain.dci_manifest(p_tenant, p_domain, c.package_key);
  h := domain.dci_head(p_competitor);
  -- every event, change and the interpretation cite; the citations exist exactly
  FOR x IN SELECT * FROM jsonb_array_elements(v_events) LOOP
    PERFORM domain.dci_assert_citations('competitor profile', p_tenant, p_domain, x -> 'citations');
    IF coalesce(x ->> 'effective_date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'competitor profile rejected (request): an event names the day it took effect (effective_date)' USING ERRCODE = '22023'; END IF;
    IF NOT (x ->> 'kind' IN ('plant_opened', 'plant_closed', 'capacity_change', 'product_launched', 'market_entry', 'market_exit', 'acquisition', 'partnership', 'pricing_move', 'other')) THEN
      RAISE EXCEPTION 'competitor profile rejected (request): event kind % is not one of the competitor package''s', x ->> 'kind' USING ERRCODE = '22023';
    END IF;
    IF x ? 'place_entity_id' AND x ->> 'place_entity_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = (x ->> 'place_entity_id')::uuid
         AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.entity_type = 'place') THEN
      RAISE EXCEPTION 'competitor profile rejected (unknown_place): no place entity % in this domain', x ->> 'place_entity_id' USING ERRCODE = '23503';
    END IF;
    v_cites := v_cites || (x -> 'citations');
    IF (m -> 'material' -> 'event_kinds') ? (x ->> 'kind') THEN v_material := true; v_reasons := v_reasons || jsonb_build_array(format('event %s', x ->> 'kind')); END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(v_changes) LOOP
    IF NOT (x ->> 'op' IN ('add', 'replace', 'end')) OR coalesce(x -> 'fact' ->> 'key', '') !~ '^[a-z][a-z0-9_]*:[A-Za-z0-9_.-]+$' THEN
      RAISE EXCEPTION 'competitor profile rejected (request): a change is {op: add | replace | end, fact: {key: <kind>:<name>, kind, value, citations, confidence}}' USING ERRCODE = '22023';
    END IF;
    IF split_part(x -> 'fact' ->> 'key', ':', 1) <> coalesce(x -> 'fact' ->> 'kind', '') THEN
      RAISE EXCEPTION 'competitor profile rejected (request): fact key % does not start with its kind %', x -> 'fact' ->> 'key', x -> 'fact' ->> 'kind' USING ERRCODE = '22023';
    END IF;
    IF NOT (x -> 'fact' ->> 'kind' IN ('product', 'market', 'capability', 'objective', 'facility', 'movement', 'dependency', 'strategy')) THEN
      RAISE EXCEPTION 'competitor profile rejected (request): fact kind % is not one of product, market, capability, objective, facility, movement, dependency, strategy', x -> 'fact' ->> 'kind' USING ERRCODE = '22023';
    END IF;
    IF x ->> 'op' IN ('replace', 'end') AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(h.facts, '[]'::jsonb)) f WHERE f ->> 'key' = x -> 'fact' ->> 'key') THEN
      RAISE EXCEPTION 'competitor profile rejected (stale): the profile holds no fact % to %', x -> 'fact' ->> 'key', x ->> 'op' USING ERRCODE = '22023';
    END IF;
    IF x ->> 'op' = 'add' AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(h.facts, '[]'::jsonb)) f WHERE f ->> 'key' = x -> 'fact' ->> 'key') THEN
      RAISE EXCEPTION 'competitor profile rejected (request): the profile holds fact % already (replace it)', x -> 'fact' ->> 'key' USING ERRCODE = '22023';
    END IF;
    IF x ->> 'op' <> 'end' THEN
      PERFORM domain.dci_assert_citations('competitor profile', p_tenant, p_domain, x -> 'fact' -> 'citations');
      IF jsonb_typeof(x -> 'fact' -> 'confidence') <> 'number' OR (x -> 'fact' ->> 'confidence')::numeric NOT BETWEEN 0 AND 1 THEN
        RAISE EXCEPTION 'competitor profile rejected (request): fact % states its confidence (0–1)', x -> 'fact' ->> 'key' USING ERRCODE = '22023';
      END IF;
      v_cites := v_cites || (x -> 'fact' -> 'citations');
    END IF;
    IF (m -> 'material' -> 'fact_kinds') ? (x -> 'fact' ->> 'kind') THEN v_material := true; v_reasons := v_reasons || jsonb_build_array(format('%s fact %s', x ->> 'op', x -> 'fact' ->> 'key')); END IF;
  END LOOP;
  IF jsonb_typeof(coalesce(v_interp, 'null'::jsonb)) = 'object' THEN
    IF length(btrim(coalesce(v_interp ->> 'statement', ''))) < 8 OR jsonb_typeof(v_interp -> 'confidence') <> 'number' OR (v_interp ->> 'confidence')::numeric NOT BETWEEN 0 AND 1 THEN
      RAISE EXCEPTION 'competitor profile rejected (request): an interpretation is {statement (8+), confidence (0–1), citations}' USING ERRCODE = '22023';
    END IF;
    PERFORM domain.dci_assert_citations('competitor profile', p_tenant, p_domain, v_interp -> 'citations');
    v_cites := v_cites || (v_interp -> 'citations');
    IF (v_interp ->> 'confidence')::numeric >= coalesce((m -> 'material' ->> 'min_confidence')::numeric, 0.8) THEN
      v_material := true; v_reasons := v_reasons || jsonb_build_array('interpretation at or above the material confidence');
    END IF;
  END IF;
  SELECT coalesce(jsonb_agg(DISTINCT y), '[]'::jsonb) INTO v_cites FROM jsonb_array_elements(v_cites) y;
  v_div := domain.dci_source_diversity(p_tenant, p_domain, v_cites, coalesce((m -> 'diversity' ->> 'min_publishers')::int, 2));
  v_ident := domain.dci_identity(p_tenant, p_domain, c.entity_id, v_cites);
  v_contra := domain.dci_contradictions(p_tenant, p_domain, v_cites);
  IF p_agent IS NOT NULL AND v_ident ->> 'state' <> 'resolved' THEN
    RAISE EXCEPTION 'competitor profile rejected (identity): the agent proposes only from evidence the graph resolved to % (%: % unresolved, % mistaken)', c.name, v_ident ->> 'state',
      v_ident ->> 'unresolved', v_ident ->> 'mistaken' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM domain.competitor_proposals x WHERE x.competitor_id = p_competitor AND x.content_digest = p_content_digest AND x.state = 'proposed') THEN
    RAISE EXCEPTION 'competitor profile rejected (duplicate): the same change is already proposed for %', c.name USING ERRCODE = '23505';
  END IF;
  INSERT INTO domain.competitor_proposals (proposal_id, scope, tenant_id, domain_id, competitor_id, base_version, content, content_digest, material, material_reasons, citations,
                                           source_diversity, identity, contradictions, package_version, proposed_by, proposed_via, agent_id, run_id, correlation_id)
  VALUES (p_proposal, 'DOMAIN', p_tenant, p_domain, p_competitor, h.version, p_content, p_content_digest, v_material, v_reasons, v_cites, v_div, v_ident, v_contra,
          (g ->> 'package_version')::int, p_actor, CASE WHEN p_agent IS NULL THEN 'person' ELSE 'agent' END, p_agent, p_run, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, p_competitor, 'proposal', p_proposal, 'proposal.proposed', p_actor,
                         jsonb_build_object('material', v_material, 'via', CASE WHEN p_agent IS NULL THEN 'person' ELSE 'agent' END, 'agent_id', p_agent, 'run_id', p_run,
                                            'base_version', h.version, 'digest', p_content_digest), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal, 'competitor_id', p_competitor, 'base_version', h.version, 'material', v_material, 'material_reasons', v_reasons,
                            'source_diversity', v_div, 'identity', v_ident, 'contradictions', v_contra, 'content_digest', p_content_digest, 'package', g);
END $$;
REVOKE ALL ON FUNCTION domain.dci_propose(uuid, uuid, uuid, uuid, jsonb, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_propose(uuid, uuid, uuid, uuid, jsonb, uuid, uuid, uuid, uuid) TO eye_commit;

/* WITHDRAW one's own open proposal (domain.competitor.propose — the proposer; a person, or the agent inside its scan). */
CREATE OR REPLACE FUNCTION domain.dci_withdraw_proposal(p_proposal uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p domain.competitor_proposals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  SELECT * INTO p FROM domain.competitor_proposals x WHERE x.proposal_id = p_proposal AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_proposal): no proposal % in this domain', p_proposal USING ERRCODE = '23503'; END IF;
  IF p.proposed_by <> p_actor THEN RAISE EXCEPTION 'competitor profile rejected (ownership): a proposal is withdrawn by its proposer' USING ERRCODE = '42501'; END IF;
  IF p.state <> 'proposed' THEN RAISE EXCEPTION 'competitor profile rejected (state): proposal % is %', p_proposal, p.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'competitor profile rejected (reason): a withdrawal says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE domain.competitor_proposals SET state = 'withdrawn', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE proposal_id = p_proposal;
  PERFORM domain.dci_log(p_tenant, p_domain, p.competitor_id, 'proposal', p_proposal, 'proposal.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal, 'state', 'withdrawn');
END $$;
REVOKE ALL ON FUNCTION domain.dci_withdraw_proposal(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_withdraw_proposal(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* THE MERGE of a profile's facts with a proposal's changes (pure): replaced/ended keys removed, added/replaced facts appended with their limits. */
CREATE OR REPLACE FUNCTION domain.dci_merge_facts(p_base jsonb, p_changes jsonb, p_proposal uuid, p_limits jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(f ORDER BY f ->> 'key'), '[]'::jsonb) FROM (
    SELECT b AS f FROM jsonb_array_elements(coalesce(p_base, '[]'::jsonb)) b
     WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) x WHERE x -> 'fact' ->> 'key' = b ->> 'key')
    UNION ALL
    SELECT jsonb_build_object('key', x -> 'fact' ->> 'key', 'kind', x -> 'fact' ->> 'kind', 'value', x -> 'fact' -> 'value', 'citations', x -> 'fact' -> 'citations',
                              'confidence', x -> 'fact' -> 'confidence', 'from_proposal', p_proposal,
                              'limited', jsonb_array_length(coalesce(p_limits, '[]'::jsonb)) > 0, 'limited_reasons', coalesce(p_limits, '[]'::jsonb))
      FROM jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) x WHERE x ->> 'op' IN ('add', 'replace')) q
$$;
REVOKE ALL ON FUNCTION domain.dci_merge_facts(jsonb, jsonb, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_merge_facts(jsonb, jsonb, uuid, jsonb) TO eye_app, eye_commit;

/* DECIDE A PROPOSAL — THE MATERIAL ASSESSMENT APPROVAL (domain.competitor.assessment.approve; human-gated at the PDP): a NAMED ANALYST
   (domain_analyst; a human; never the proposer; never the agent) approves or declines, bound to the content digest; the package's `assess`
   function active; the profile not moved since the proposal (else stale). APPROVED → profile version n+1 (limited when the identity is not
   resolved through the graph, the sources are below the diversity threshold or the evidence is in open conflict — the conflicting evidence
   preserved in the version), its events, its interpretation (an assessment version), the open revalidations of the competitor resolved when
   the new version is approved in full, a WATCHLIST alert raised under the published policy for each rule it matches, and — when the
   competitor has a twin and an approved event carries a capacity — a capacity change PROPOSED to the twin's owner. The CPF object of the new
   version is admitted by the caller in this transaction (dci_bind_profile_object). */
CREATE OR REPLACE FUNCTION domain.dci_decide_proposal(p_proposal uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, executive, twin, graph, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p domain.competitor_proposals%ROWTYPE; c domain.competitors%ROWTYPE; h domain.competitor_profile_versions%ROWTYPE; g jsonb; m jsonb; v_version int; v_limits jsonb := '[]'::jsonb;
        v_ident jsonb; v_div jsonb; v_plimits jsonb; v_pstate text; v_contra jsonb; v_facts jsonb; v_state text; x jsonb; w record; rl jsonb; v_alerts jsonb := '[]'::jsonb; v_item jsonb; v_assessment uuid;
        v_events jsonb := '[]'::jsonb; v_event uuid; v_match boolean; v_twin jsonb := NULL; v_cap numeric; v_cur numeric; v_tp uuid; v_resolved jsonb := '[]'::jsonb; rv record;
        v_place text; v_closed jsonb; v_alert_state jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.assessment.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_human('competitor assessment', p_actor, p_tenant, p_domain, ARRAY['domain_analyst'], 'approving a material competitor assessment');
  SELECT * INTO p FROM domain.competitor_proposals x WHERE x.proposal_id = p_proposal AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor assessment rejected (unknown_proposal): no proposal % in this domain', p_proposal USING ERRCODE = '23503'; END IF;
  c := domain.dci_competitor('competitor assessment', p_tenant, p_domain, p.competitor_id, true);
  IF p.proposed_by = p_actor THEN
    RAISE EXCEPTION 'competitor assessment rejected (separation_of_duties): the analyst who proposed a change does not approve it' USING ERRCODE = '42501';
  END IF;
  IF p.state <> 'proposed' THEN RAISE EXCEPTION 'competitor assessment rejected (state): proposal % is %', p_proposal, p.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM p.content_digest THEN
    RAISE EXCEPTION 'competitor assessment rejected (stale): the decision names digest %…; the proposal''s content is %… — read it again', left(coalesce(p_digest, '<none>'), 12), left(p.content_digest, 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('approved', 'declined') THEN RAISE EXCEPTION 'competitor assessment rejected (request): the decision is approved or declined' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'declined' THEN
    IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'competitor assessment rejected (reason): a declined proposal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
    UPDATE domain.competitor_proposals SET state = 'declined', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE proposal_id = p_proposal;
    PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'proposal', p_proposal, 'proposal.declined', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
    RETURN jsonb_build_object('proposal_id', p_proposal, 'state', 'declined');
  END IF;
  g := domain.dci_gate('competitor assessment', p_tenant, p_domain, c.package_key, 'assess');
  h := domain.dci_head(c.competitor_id);
  IF h.version IS DISTINCT FROM p.base_version THEN
    RAISE EXCEPTION 'competitor assessment rejected (stale): the profile of % moved to version % since the proposal (made on version %); the change is proposed again on the current profile',
      c.name, coalesce(h.version, 0), coalesce(p.base_version, 0) USING ERRCODE = '22023';
  END IF;
  m := domain.dci_manifest(p_tenant, p_domain, c.package_key);
  -- re-judged NOW (not taken from the proposal): identity through the graph, source diversity, open contradictions
  v_ident := domain.dci_identity(p_tenant, p_domain, c.entity_id, p.citations);
  v_div := domain.dci_source_diversity(p_tenant, p_domain, p.citations, coalesce((m -> 'diversity' ->> 'min_publishers')::int, 2));
  v_contra := domain.dci_contradictions(p_tenant, p_domain, p.citations);
  IF v_ident ->> 'state' <> 'resolved' THEN v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'identity', 'state', v_ident ->> 'state',
       'reason', format('%s of the cited evidence is not resolved to %s through the graph (%s mistaken, %s unresolved)', (v_ident ->> 'mistaken')::int + (v_ident ->> 'unresolved')::int, c.name, v_ident ->> 'mistaken', v_ident ->> 'unresolved'))); END IF;
  IF (v_div ->> 'below_threshold')::boolean THEN v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'source_diversity',
       'reason', format('%s independent publisher(s), below the package''s threshold of %s (correlated: %s)', v_div ->> 'independent_publishers', v_div ->> 'threshold', jsonb_array_length(v_div -> 'correlated')))); END IF;
  IF jsonb_array_length(v_contra) > 0 THEN v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'contradiction',
       'reason', format('%s open contradiction(s) on the cited claims — the conflicting evidence is preserved', jsonb_array_length(v_contra)), 'contradictions', v_contra)); END IF;
  v_plimits := v_limits; v_pstate := CASE WHEN jsonb_array_length(v_plimits) > 0 THEN 'limited' ELSE 'approved' END;
  v_version := coalesce(h.version, 0) + 1;
  v_facts := domain.dci_merge_facts(h.facts, p.content -> 'changes', p_proposal, v_plimits);
  -- a version is approved IN FULL only when none of its facts (the carried ones included) is limited: a carried limit stays a limit until a
  -- change replaces or ends the fact it is on
  v_limits := v_limits || coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('class', 'carried', 'fact', f ->> 'key', 'reason', format('fact %s is limited (%s)', f ->> 'key',
                (SELECT string_agg(DISTINCT l ->> 'class', ', ') FROM jsonb_array_elements(coalesce(f -> 'limited_reasons', '[]'::jsonb)) l))))
                FROM jsonb_array_elements(v_facts) f WHERE coalesce((f ->> 'limited')::boolean, false) AND (f ->> 'from_proposal') IS DISTINCT FROM p_proposal::text), '[]'::jsonb);
  v_state := CASE WHEN jsonb_array_length(v_limits) > 0 THEN 'limited' ELSE 'approved' END;
  IF h.version IS NOT NULL THEN
    UPDATE domain.competitor_profile_versions SET state = 'superseded', superseded_at = clock_timestamp() WHERE competitor_id = c.competitor_id AND version = h.version;
  END IF;
  INSERT INTO domain.competitor_profile_versions (competitor_id, version, scope, tenant_id, domain_id, effective_from, facts, state, limited_reasons, cause, proposal_id, approved_by,
                                                  supersedes, package_version, source_diversity, identity, correlation_id)
  VALUES (c.competitor_id, v_version, 'DOMAIN', p_tenant, p_domain, (p.content ->> 'effective_from')::date, v_facts, v_state, v_limits, 'approval', p_proposal, p_actor,
          h.version, (g ->> 'package_version')::int, v_div, v_ident, p_correlation);
  -- the events
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p.content -> 'events', '[]'::jsonb)) LOOP
    v_event := gen_random_uuid();
    INSERT INTO domain.competitor_events (event_id, scope, tenant_id, domain_id, competitor_id, kind, place_entity_id, effective_date, details, citations, proposal_id, profile_version,
                                          state, limited_reason, approved_by, correlation_id)
    VALUES (v_event, 'DOMAIN', p_tenant, p_domain, c.competitor_id, x ->> 'kind', NULLIF(x ->> 'place_entity_id', '')::uuid, (x ->> 'effective_date')::date,
            coalesce(x -> 'details', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('place', x ->> 'place', 'market', x ->> 'market')), x -> 'citations', p_proposal, v_version,
            CASE WHEN v_pstate = 'limited' THEN 'limited' ELSE 'recorded' END,
            CASE WHEN v_pstate = 'limited' THEN (SELECT string_agg(l ->> 'reason', '; ') FROM jsonb_array_elements(v_plimits) l) END, p_actor, p_correlation);
    v_events := v_events || jsonb_build_array(jsonb_build_object('event_id', v_event, 'kind', x ->> 'kind', 'effective_date', x ->> 'effective_date', 'place', x ->> 'place', 'market', x ->> 'market',
                                                                 'capacity', x -> 'details' -> (m -> 'twin' ->> 'capacity_detail'), 'place_entity_id', x ->> 'place_entity_id'));
  END LOOP;
  -- the interpretation → an assessment version
  IF jsonb_typeof(p.content -> 'interpretation') = 'object' THEN
    v_assessment := gen_random_uuid();
    INSERT INTO domain.competitor_assessments (assessment_id, version, scope, tenant_id, domain_id, competitor_id, kind, statement, confidence, material, evidence, source_diversity,
                                               state, limited_reasons, proposal_id, profile_version, approved_by, correlation_id)
    VALUES (v_assessment, 1, 'DOMAIN', p_tenant, p_domain, c.competitor_id, 'interpretation', btrim(p.content -> 'interpretation' ->> 'statement'),
            (p.content -> 'interpretation' ->> 'confidence')::numeric, p.material, p.content -> 'interpretation' -> 'citations', v_div, v_pstate, v_plimits, p_proposal, v_version, p_actor, p_correlation);
    PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'assessment', v_assessment, CASE WHEN v_pstate = 'limited' THEN 'assessment.limited' ELSE 'assessment.approved' END, p_actor,
                           jsonb_build_object('version', 1, 'profile_version', v_version, 'limited_reasons', v_plimits), p_correlation);
  END IF;
  UPDATE domain.competitor_proposals SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = NULLIF(btrim(coalesce(p_reason, '')), ''), result_version = v_version
   WHERE proposal_id = p_proposal;
  -- the other open proposals made on the superseded profile are SUPERSEDED (stale: they are proposed again on the current profile)
  UPDATE domain.competitor_proposals SET state = 'superseded', decided_by = p_actor, decided_at = clock_timestamp(),
         decision_reason = format('superseded: the profile moved to version %s by proposal %s', v_version, p_proposal)
   WHERE competitor_id = c.competitor_id AND state = 'proposed' AND proposal_id <> p_proposal;
  PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'proposal', p_proposal, 'proposal.approved', p_actor,
                         jsonb_build_object('version', v_version, 'state', v_state, 'digest', p.content_digest, 'material', p.material), p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'profile', c.competitor_id, CASE WHEN v_state = 'limited' THEN 'profile.limited' ELSE 'profile.versioned' END, p_actor,
                         jsonb_build_object('version', v_version, 'supersedes', h.version, 'limited_reasons', v_limits, 'effective_from', p.content ->> 'effective_from'), p_correlation);
  -- the open revalidations are resolved by a version approved in full; their items closed by this act
  IF v_state = 'approved' THEN
    FOR rv IN SELECT * FROM domain.competitor_revalidations r WHERE r.competitor_id = c.competitor_id AND r.state = 'open' ORDER BY r.opened_at FOR UPDATE LOOP
      UPDATE domain.competitor_revalidations SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(),
             resolution = format('profile version %s approved in full by proposal %s', v_version, p_proposal) WHERE revalidation_id = rv.revalidation_id;
      v_closed := executive.b33_close_items(p_tenant, p_domain, 'domain.alert', 'competitor_profile', rv.revalidation_id,
                                            format('revalidated: profile version %s approved in full', v_version), p_actor, p_correlation);
      PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'revalidation', rv.revalidation_id, 'revalidation.resolved', p_actor,
                             jsonb_build_object('version', v_version, 'closed_items', v_closed), p_correlation);
      v_resolved := v_resolved || jsonb_build_array(jsonb_build_object('revalidation_id', rv.revalidation_id, 'closed_items', v_closed));
    END LOOP;
  END IF;
  -- THE WATCHLISTS: an approved MATERIAL change matching a rule raises `domain.alert` under the published policy, the watchlist's owner named
  -- (the `alert` function disabled: the approval stands and the alerts are WITHHELD with the package's reason — the incompatible function
  --  disabled, the accessible state preserved, PR-31-005)
  v_alert_state := domain.package_function_state(p_tenant, p_domain, c.package_key, 'alert');
  IF p.material AND v_alert_state ->> 'state' <> 'active' THEN
    v_alerts := jsonb_build_array(jsonb_build_object('withheld', true, 'reason', v_alert_state ->> 'reason'));
  END IF;
  IF p.material AND v_alert_state ->> 'state' = 'active' THEN
    FOR w IN SELECT * FROM domain.competitor_watchlists x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active' AND x.package_key = c.package_key
               AND (cardinality(x.competitor_ids) = 0 OR c.competitor_id = ANY (x.competitor_ids)) ORDER BY x.created_at LOOP
      FOR rl IN SELECT * FROM jsonb_array_elements(w.rules) LOOP
        v_match := false; v_place := NULL;
        FOR x IN SELECT * FROM jsonb_array_elements(v_events) LOOP
          IF coalesce(rl -> 'event_kinds', '[]'::jsonb) ? (x ->> 'kind')
             AND (jsonb_array_length(coalesce(rl -> 'markets', '[]'::jsonb)) = 0
                  OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(rl -> 'markets') mk
                              WHERE position(lower(mk) IN lower(coalesce(x ->> 'place', '') || ' ' || coalesce(x ->> 'market', ''))) > 0)) THEN
            v_match := true; v_place := coalesce(x ->> 'place', x ->> 'market');
          END IF;
        END LOOP;
        FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p.content -> 'changes', '[]'::jsonb)) LOOP
          IF x ->> 'op' IN ('add', 'replace') AND coalesce(rl -> 'fact_kinds', '[]'::jsonb) ? (x -> 'fact' ->> 'kind')
             AND (jsonb_array_length(coalesce(rl -> 'markets', '[]'::jsonb)) = 0
                  OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(rl -> 'markets') mk WHERE position(lower(mk) IN lower((x -> 'fact' -> 'value')::text)) > 0)) THEN
            v_match := true;
          END IF;
        END LOOP;
        CONTINUE WHEN NOT v_match;
        v_item := executive.b33_raise_routed(p_tenant, p_domain, 'domain.alert', 'competitor_profile', c.competitor_id,
                    format('%s: %s%s — profile v%s%s', c.name, coalesce(rl ->> 'title', rl ->> 'rule_key'), CASE WHEN v_place IS NULL THEN '' ELSE ' (' || v_place || ')' END, v_version,
                           CASE WHEN v_state = 'limited' THEN ' (LIMITED)' ELSE '' END),
                    jsonb_build_array(format('watchlist %s rule %s matched the approved change', w.title, rl ->> 'rule_key')) || p.material_reasons,
                    w.owner_principal_id, p_proposal, 'competitor.assessment_approved',
                    jsonb_build_object('competitor_id', c.competitor_id, 'watchlist_id', w.watchlist_id, 'rule_key', rl ->> 'rule_key', 'profile_version', v_version,
                                       'events', v_events, 'limited', v_state = 'limited', 'limited_reasons', v_limits, 'approved_by', p_actor,
                                       'response', 'the response is the executives'' decision in the decision layer'),
                    NULL, p_actor, p_correlation);
        INSERT INTO domain.competitor_alerts (alert_id, scope, tenant_id, domain_id, watchlist_id, rule_key, competitor_id, proposal_id, profile_version, item_id, item_state, limited, correlation_id)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, w.watchlist_id, rl ->> 'rule_key', c.competitor_id, p_proposal, v_version, (v_item ->> 'item_id')::uuid, v_item ->> 'state',
                v_state = 'limited', p_correlation)
        ON CONFLICT (watchlist_id, rule_key, proposal_id) DO NOTHING;
        PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'alert', (v_item ->> 'item_id')::uuid, 'alert.raised', p_actor,
                               jsonb_build_object('watchlist_id', w.watchlist_id, 'rule_key', rl ->> 'rule_key', 'item', v_item), p_correlation);
        v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('watchlist_id', w.watchlist_id, 'rule_key', rl ->> 'rule_key', 'item', v_item));
      END LOOP;
    END LOOP;
  END IF;
  -- CI8: a capacity-bearing approved event on a competitor with a twin → a capacity change PROPOSED to the twin's owner (never written here)
  IF c.twin_id IS NOT NULL AND v_state = 'approved' THEN
    SELECT sum((e ->> 'capacity')::numeric) INTO v_cap FROM jsonb_array_elements(v_events) e WHERE jsonb_typeof(e -> 'capacity') = 'number' AND e ->> 'kind' IN ('plant_opened', 'capacity_change');
    IF v_cap IS NOT NULL THEN
      SELECT (s.value #>> '{}')::numeric INTO v_cur FROM twin.twin_versions tv JOIN twin.state_elements s ON s.twin_id = tv.twin_id AND s.version = tv.version
       WHERE tv.twin_id = c.twin_id AND tv.branch_id = 'actual' AND tv.state = 'admitted' AND s.key = (m -> 'twin' ->> 'key') AND jsonb_typeof(s.value) = 'number'
       ORDER BY tv.version DESC LIMIT 1;
      UPDATE domain.competitor_twin_proposals SET state = 'superseded' WHERE competitor_id = c.competitor_id AND state = 'proposed';
      v_tp := gen_random_uuid();
      INSERT INTO domain.competitor_twin_proposals (proposal_id, scope, tenant_id, domain_id, competitor_id, twin_id, key, unit, current_value, delta, proposed_value, basis, correlation_id)
      VALUES (v_tp, 'DOMAIN', p_tenant, p_domain, c.competitor_id, c.twin_id, m -> 'twin' ->> 'key', m -> 'twin' ->> 'unit', v_cur, v_cap, coalesce(v_cur, 0) + v_cap,
              jsonb_build_object('competitor_proposal', p_proposal, 'profile_version', v_version, 'events', v_events, 'citations', p.citations), p_correlation);
      PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'twin_proposal', v_tp, 'twin.proposed', p_actor,
                             jsonb_build_object('twin_id', c.twin_id, 'current', v_cur, 'delta', v_cap, 'proposed', coalesce(v_cur, 0) + v_cap), p_correlation);
      v_twin := jsonb_build_object('proposal_id', v_tp, 'twin_id', c.twin_id, 'key', m -> 'twin' ->> 'key', 'current_value', v_cur, 'delta', v_cap, 'proposed_value', coalesce(v_cur, 0) + v_cap);
    END IF;
  END IF;
  RETURN jsonb_build_object('proposal_id', p_proposal, 'state', 'approved', 'competitor_id', c.competitor_id, 'version', v_version, 'profile_state', v_state, 'limited_reasons', v_limits,
                            'facts', v_facts, 'effective_from', p.content ->> 'effective_from', 'events', v_events, 'assessment_id', v_assessment, 'alerts', v_alerts, 'twin_proposal', v_twin,
                            'revalidations_resolved', v_resolved, 'identity', v_ident, 'source_diversity', v_div, 'supersedes', h.version, 'package_version', (g ->> 'package_version')::int,
                            'cpf', domain.dci_cpf_payload(c.competitor_id, v_version));
END $$;

/* THE CPF PAYLOAD of a profile version (§0.6's CPF v1 shape + the version's state and limits). */
CREATE OR REPLACE FUNCTION domain.dci_cpf_payload(p_competitor uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('competitor_id', c.competitor_id, 'entity_id', c.entity_id, 'name', c.name, 'version', v.version, 'effective_from', to_char(v.effective_from, 'YYYY-MM-DD'),
                            'effective_to', NULL, 'facts', v.facts, 'package', jsonb_build_object('package_key', c.package_key, 'version', v.package_version),
                            'approved_by', v.approved_by, 'approved_at', to_char(v.approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'supersedes', v.supersedes,
                            'state', v.state, 'limited_reasons', v.limited_reasons, 'cause', v.cause, 'source_diversity', v.source_diversity, 'identity', v.identity)
    FROM domain.competitor_profile_versions v JOIN domain.competitors c ON c.competitor_id = v.competitor_id
   WHERE v.competitor_id = p_competitor AND v.version = p_version
$$;
REVOKE ALL ON FUNCTION domain.dci_cpf_payload(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_cpf_payload(uuid, int) TO eye_app, eye_commit;

REVOKE ALL ON FUNCTION domain.dci_decide_proposal(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_decide_proposal(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* BIND the admitted CPF object to its profile version (the act that wrote the version, in its transaction; write-once). */
CREATE OR REPLACE FUNCTION domain.dci_bind_profile_object(p_competitor uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_actor uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v domain.competitor_profile_versions%ROWTYPE; v_obj text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.assessment.approve', 'domain.competitor.revalidate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  SELECT * INTO v FROM domain.competitor_profile_versions x WHERE x.competitor_id = p_competitor AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_version): competitor % has no profile version %', p_competitor, p_version USING ERRCODE = '23503'; END IF;
  SELECT o.content_digest INTO v_obj FROM objects.canonical_objects o WHERE o.object_type = 'CPF' AND o.object_id = p_competitor AND o.object_version = p_version AND o.tenant_id = p_tenant;
  IF v_obj IS NULL OR v_obj <> p_digest THEN
    RAISE EXCEPTION 'competitor profile rejected (digest): no CPF object % version % with digest %… was admitted', p_competitor, p_version, left(coalesce(p_digest, ''), 12) USING ERRCODE = '22023';
  END IF;
  UPDATE domain.competitor_profile_versions SET cpf_digest = p_digest WHERE competitor_id = p_competitor AND version = p_version;
  RETURN jsonb_build_object('competitor_id', p_competitor, 'version', p_version, 'cpf_digest', p_digest);
END $$;
REVOKE ALL ON FUNCTION domain.dci_bind_profile_object(uuid, uuid, uuid, int, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_bind_profile_object(uuid, uuid, uuid, int, text, uuid) TO eye_commit;

/* REVALIDATE (domain.competitor.revalidate — an analyst, or the agent in its scan): the head profile re-judged NOW. A fact resting on a MISTAKEN
   identity (its evidence's resolution to the competitor's entity superseded by a split or rejected) or on claims now in OPEN CONFLICT is marked
   LIMITED in a NEW version (nothing rewritten; the prior version stays replayable), the events on that evidence limited, the comparisons
   resting on the competitor SUSPENDED and a revalidation ROUTED (domain.alert, the competitor's owner named). STALE coverage routes a
   revalidation without a new version (reads present the profile as limited while it lasts). Answers what it found; nothing found → nothing written. */
CREATE OR REPLACE FUNCTION domain.dci_revalidate(p_competitor uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, executive, graph, objects, intelligence, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c domain.competitors%ROWTYPE; h domain.competitor_profile_versions%ROWTYPE; g jsonb; f jsonb; v_facts jsonb := '[]'::jsonb; v_hits jsonb := '[]'::jsonb; v_id jsonb; v_ct jsonb;
        v_reasons jsonb; v_all jsonb := '[]'::jsonb; v_version int := NULL; v_cov jsonb; v_routed jsonb := '[]'::jsonb; v_susp jsonb := '[]'::jsonb; v_ev record; v_ident_any boolean := false;
        v_contra_any boolean := false; v_as domain.competitor_assessments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.revalidate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  c := domain.dci_competitor('competitor profile', p_tenant, p_domain, p_competitor, true);
  g := domain.dci_gate('competitor profile', p_tenant, p_domain, c.package_key, 'profile');
  h := domain.dci_head(c.competitor_id);
  IF h.version IS NOT NULL THEN
    FOR f IN SELECT * FROM jsonb_array_elements(h.facts) LOOP
      v_id := domain.dci_identity(p_tenant, p_domain, c.entity_id, f -> 'citations');
      v_ct := domain.dci_contradictions(p_tenant, p_domain, f -> 'citations');
      v_reasons := '[]'::jsonb;
      IF v_id ->> 'state' = 'mistaken' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f -> 'limited_reasons', '[]'::jsonb)) l WHERE l ->> 'class' = 'identity' AND l ->> 'state' = 'mistaken') THEN
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('class', 'identity', 'state', 'mistaken',
                       'reason', format('the evidence of %s is no longer resolved to %s (a resolution superseded or rejected)', f ->> 'key', c.name), 'evidence', v_id -> 'evidence'));
        v_ident_any := true;
      END IF;
      IF jsonb_array_length(v_ct) > 0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f -> 'limited_reasons', '[]'::jsonb)) l WHERE l ->> 'class' = 'contradiction') THEN
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('class', 'contradiction', 'reason', format('%s open contradiction(s) on the claims of %s — both sides preserved', jsonb_array_length(v_ct), f ->> 'key'),
                                                                       'contradictions', v_ct));
        v_contra_any := true;
      END IF;
      IF jsonb_array_length(v_reasons) > 0 THEN
        f := f || jsonb_build_object('limited', true, 'limited_reasons', coalesce(f -> 'limited_reasons', '[]'::jsonb) || v_reasons);
        v_hits := v_hits || jsonb_build_array(jsonb_build_object('key', f ->> 'key', 'reasons', v_reasons));
        v_all := v_all || v_reasons;
      END IF;
      v_facts := v_facts || jsonb_build_array(f);
    END LOOP;
    IF jsonb_array_length(v_hits) > 0 THEN
      v_version := h.version + 1;
      UPDATE domain.competitor_profile_versions SET state = 'superseded', superseded_at = clock_timestamp() WHERE competitor_id = c.competitor_id AND version = h.version;
      INSERT INTO domain.competitor_profile_versions (competitor_id, version, scope, tenant_id, domain_id, effective_from, facts, state, limited_reasons, cause, proposal_id, approved_by,
                                                      supersedes, package_version, source_diversity, identity, correlation_id)
      VALUES (c.competitor_id, v_version, 'DOMAIN', p_tenant, p_domain, h.effective_from, v_facts, 'limited', h.limited_reasons || v_all, 'revalidation', NULL, p_actor,
              h.version, (g ->> 'package_version')::int, h.source_diversity, domain.dci_identity(p_tenant, p_domain, c.entity_id,
                (SELECT coalesce(jsonb_agg(y), '[]'::jsonb) FROM jsonb_array_elements(v_facts) ff, jsonb_array_elements(ff -> 'citations') y)), p_correlation);
      -- the events resting on the evidence found wanting are limited; the assessments of the competitor too (a new limited version each)
      FOR v_ev IN SELECT e.event_id FROM domain.competitor_events e WHERE e.competitor_id = c.competitor_id AND e.state = 'recorded'
                    AND (domain.dci_identity(p_tenant, p_domain, c.entity_id, e.citations) ->> 'state' = 'mistaken'
                         OR jsonb_array_length(domain.dci_contradictions(p_tenant, p_domain, e.citations)) > 0) FOR UPDATE LOOP
        UPDATE domain.competitor_events SET state = 'limited', limited_reason = 'revalidation: its evidence is no longer resolved to the competitor or is in open conflict' WHERE event_id = v_ev.event_id;
      END LOOP;
      FOR v_as IN SELECT * FROM domain.competitor_assessments a WHERE a.competitor_id = c.competitor_id AND a.state = 'approved'
                    AND (domain.dci_identity(p_tenant, p_domain, c.entity_id, a.evidence) ->> 'state' = 'mistaken' OR jsonb_array_length(domain.dci_contradictions(p_tenant, p_domain, a.evidence)) > 0)
                    ORDER BY a.assessment_id FOR UPDATE LOOP
        UPDATE domain.competitor_assessments SET state = 'superseded', superseded_at = clock_timestamp() WHERE assessment_id = v_as.assessment_id AND version = v_as.version;
        INSERT INTO domain.competitor_assessments (assessment_id, version, scope, tenant_id, domain_id, competitor_id, kind, statement, confidence, material, evidence, source_diversity,
                                                   state, limited_reasons, proposal_id, profile_version, approved_by, correlation_id)
        VALUES (v_as.assessment_id, v_as.version + 1, v_as.scope, v_as.tenant_id, v_as.domain_id, v_as.competitor_id, v_as.kind, v_as.statement, v_as.confidence, v_as.material, v_as.evidence,
                v_as.source_diversity, 'limited', v_as.limited_reasons || v_all, v_as.proposal_id, v_version, p_actor, p_correlation);
        PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'assessment', v_as.assessment_id, 'assessment.limited', p_actor,
                               jsonb_build_object('version', v_as.version + 1, 'supersedes', v_as.version, 'cause', 'revalidation'), p_correlation);
      END LOOP;
      PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'profile', c.competitor_id, 'profile.limited', p_actor,
                             jsonb_build_object('version', v_version, 'supersedes', h.version, 'facts', v_hits), p_correlation);
      v_susp := domain.dci_suspend_comparisons(c, format('the profile of %s was limited at version %s (revalidation)', c.name, v_version), p_actor, p_correlation);
      IF v_ident_any THEN
        v_routed := v_routed || jsonb_build_array(domain.dci_route_revalidation(c, v_version, 'identity', jsonb_build_object('facts', v_hits),
                      format('Revalidate %s: a profile fact rests on a mistaken identity', c.name), p_actor, p_correlation));
      END IF;
      IF v_contra_any THEN
        v_routed := v_routed || jsonb_build_array(domain.dci_route_revalidation(c, v_version, 'contradiction', jsonb_build_object('facts', v_hits),
                      format('Revalidate %s: conflicting evidence on the profile', c.name), p_actor, p_correlation));
      END IF;
    END IF;
  END IF;
  v_cov := domain.dci_coverage(p_tenant, p_domain, c.competitor_id);
  IF v_cov ->> 'state' IN ('stale', 'none') AND h.version IS NOT NULL THEN
    v_routed := v_routed || jsonb_build_array(domain.dci_route_revalidation(c, coalesce(v_version, h.version), 'coverage', jsonb_build_object('coverage', v_cov),
                  format('Revalidate %s: coverage is %s (no evidence within %s days)', c.name, v_cov ->> 'state', v_cov ->> 'freshness_days'), p_actor, p_correlation));
  END IF;
  RETURN jsonb_build_object('competitor_id', c.competitor_id, 'head_version', h.version, 'version', v_version, 'limited_facts', v_hits, 'coverage', v_cov, 'routed', v_routed,
                            'suspended_comparisons', v_susp, 'cpf', CASE WHEN v_version IS NULL THEN NULL ELSE domain.dci_cpf_payload(c.competitor_id, v_version) END);
END $$;
REVOKE ALL ON FUNCTION domain.dci_revalidate(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_revalidate(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* A COMPARISON BASIS (domain.competitor.compare): declared or re-declared as a new version; the comparisons on the prior version are
   SUSPENDED when a metric's definition, unit, period or population changed (an incompatible basis is not compared across). */
CREATE OR REPLACE FUNCTION domain.dci_declare_basis(p_tenant uuid, p_domain uuid, p_package_key text, p_basis_key text, p_title text, p_metrics jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE prior domain.competitor_comparison_bases%ROWTYPE; x jsonb; v_version int; v_digest text; v_changed boolean := false; k record; v_susp jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.compare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor comparison', p_actor);
  PERFORM domain.dci_gate('competitor comparison', p_tenant, p_domain, p_package_key, 'compare');
  IF coalesce(p_basis_key, '') !~ '^[a-z][a-z0-9-]{1,60}$' OR length(btrim(coalesce(p_title, ''))) < 4 THEN
    RAISE EXCEPTION 'competitor comparison rejected (basis): a basis has a key (lowercase) and a title (4+)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_metrics) <> 'array' OR jsonb_array_length(p_metrics) = 0 THEN
    RAISE EXCEPTION 'competitor comparison rejected (basis): a basis declares its metrics [{key, fact_kind, definition, unit, period, population}]' USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(p_metrics) LOOP
    IF coalesce(x ->> 'key', '') !~ '^[a-z][a-z0-9_]{1,40}$' OR NOT (x ->> 'fact_kind' IN ('product', 'market', 'capability', 'objective', 'facility', 'movement', 'dependency', 'strategy'))
       OR length(btrim(coalesce(x ->> 'definition', ''))) < 8 OR length(btrim(coalesce(x ->> 'unit', ''))) < 1 OR length(btrim(coalesce(x ->> 'period', ''))) < 1
       OR length(btrim(coalesce(x ->> 'population', ''))) < 2 THEN
      RAISE EXCEPTION 'competitor comparison rejected (basis): metric % declares key, fact_kind, definition (8+), unit, period and population', coalesce(x ->> 'key', '?') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT * INTO prior FROM domain.competitor_comparison_bases b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.basis_key = p_basis_key AND b.state = 'active' FOR UPDATE;
  v_digest := encode(sha256(convert_to(p_metrics::text, 'UTF8')), 'hex');
  IF FOUND THEN
    IF prior.digest = v_digest THEN RAISE EXCEPTION 'competitor comparison rejected (duplicate): basis % version % declares these metrics already', p_basis_key, prior.version USING ERRCODE = '23505'; END IF;
    UPDATE domain.competitor_comparison_bases SET state = 'superseded', superseded_at = clock_timestamp() WHERE tenant_id = p_tenant AND domain_id = p_domain AND basis_key = p_basis_key AND version = prior.version;
    -- incompatible when any metric of the prior version is absent or redefined
    SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(prior.metrics) a WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_metrics) b WHERE b ->> 'key' = a ->> 'key'
             AND b ->> 'fact_kind' = a ->> 'fact_kind' AND b ->> 'unit' = a ->> 'unit' AND b ->> 'period' = a ->> 'period' AND b ->> 'population' = a ->> 'population'
             AND b ->> 'definition' = a ->> 'definition')) INTO v_changed;
    IF v_changed THEN
      FOR k IN SELECT comparison_id FROM domain.competitor_comparisons x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.basis_key = p_basis_key AND x.basis_version = prior.version
                 AND x.state <> 'suspended' FOR UPDATE LOOP
        UPDATE domain.competitor_comparisons SET state = 'suspended', suspended_at = clock_timestamp(),
               suspended_reason = format('basis %s version %s superseded by version %s with changed definitions — not comparable across', p_basis_key, prior.version, prior.version + 1)
         WHERE comparison_id = k.comparison_id;
        PERFORM domain.dci_log(p_tenant, p_domain, NULL, 'comparison', k.comparison_id, 'comparison.suspended', p_actor, jsonb_build_object('basis', p_basis_key, 'from_version', prior.version), p_correlation);
        v_susp := v_susp || jsonb_build_array(k.comparison_id);
      END LOOP;
    END IF;
  END IF;
  v_version := coalesce(prior.version, 0) + 1;
  INSERT INTO domain.competitor_comparison_bases (basis_key, version, scope, tenant_id, domain_id, title, metrics, digest, state, declared_by, correlation_id)
  VALUES (p_basis_key, v_version, 'DOMAIN', p_tenant, p_domain, btrim(p_title), p_metrics, v_digest, 'active', p_actor, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, NULL, 'basis', p_correlation, 'basis.declared', p_actor,
                         jsonb_build_object('basis_key', p_basis_key, 'version', v_version, 'digest', v_digest, 'suspended', v_susp), p_correlation);
  RETURN jsonb_build_object('basis_key', p_basis_key, 'version', v_version, 'digest', v_digest, 'supersedes', prior.version, 'incompatible_change', v_changed, 'suspended', v_susp);
END $$;
REVOKE ALL ON FUNCTION domain.dci_declare_basis(uuid, uuid, text, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_declare_basis(uuid, uuid, text, text, text, jsonb, uuid, uuid) TO eye_commit;

/* COMPARE (domain.competitor.compare): the competitors' CURRENT profiles on the ACTIVE basis version. Each metric's fact (fact kind, key
   `<kind>:<metric key>`) must report the basis's unit, period and population — otherwise REFUSED (incompatible definitions are never
   compared). The comparison's source diversity is measured; below the threshold, or resting on a limited profile → LIMITED. */
CREATE OR REPLACE FUNCTION domain.dci_compare(p_comparison uuid, p_tenant uuid, p_domain uuid, p_basis_key text, p_competitors uuid[], p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b domain.competitor_comparison_bases%ROWTYPE; c domain.competitors%ROWTYPE; h domain.competitor_profile_versions%ROWTYPE; mt jsonb; f jsonb; v_rows jsonb := '[]'::jsonb;
        v_cites jsonb := '[]'::jsonb; v_div jsonb; v_limits jsonb := '[]'::jsonb; v_pkg text := NULL; v_id uuid; m jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.compare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor comparison', p_actor);
  IF p_competitors IS NULL OR cardinality(p_competitors) < 2 OR cardinality(p_competitors) <> (SELECT count(DISTINCT u) FROM unnest(p_competitors) u) THEN
    RAISE EXCEPTION 'competitor comparison rejected (request): a comparison names two or more distinct competitors' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO b FROM domain.competitor_comparison_bases x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.basis_key = p_basis_key AND x.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor comparison rejected (unknown_basis): no active comparison basis % in this domain', p_basis_key USING ERRCODE = '23503'; END IF;
  FOREACH v_id IN ARRAY p_competitors LOOP
    c := domain.dci_competitor('competitor comparison', p_tenant, p_domain, v_id, false);
    IF v_pkg IS NULL THEN v_pkg := c.package_key; PERFORM domain.dci_gate('competitor comparison', p_tenant, p_domain, v_pkg, 'compare'); END IF;
    h := domain.dci_head(c.competitor_id);
    IF h.version IS NULL THEN RAISE EXCEPTION 'competitor comparison rejected (state): % has no approved profile to compare', c.name USING ERRCODE = '22023'; END IF;
    IF h.state = 'limited' THEN v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'limited_profile', 'reason', format('the profile of %s (v%s) is limited', c.name, h.version))); END IF;
    FOR mt IN SELECT * FROM jsonb_array_elements(b.metrics) LOOP
      SELECT y INTO f FROM jsonb_array_elements(h.facts) y WHERE y ->> 'key' = (mt ->> 'fact_kind') || ':' || (mt ->> 'key');
      IF f IS NULL THEN
        RAISE EXCEPTION 'competitor comparison rejected (basis): % reports no %:% — the basis % v% cannot compare it', c.name, mt ->> 'fact_kind', mt ->> 'key', b.basis_key, b.version USING ERRCODE = '22023';
      END IF;
      IF coalesce(f -> 'value' ->> 'unit', '') <> mt ->> 'unit' OR coalesce(f -> 'value' ->> 'period', '') <> mt ->> 'period' OR coalesce(f -> 'value' ->> 'population', '') <> mt ->> 'population' THEN
        RAISE EXCEPTION 'competitor comparison rejected (basis): % reports % in % per % over "%"; basis % v% defines % per % over "%" — incompatible definitions are not compared',
          c.name, mt ->> 'key', coalesce(f -> 'value' ->> 'unit', '?'), coalesce(f -> 'value' ->> 'period', '?'), coalesce(f -> 'value' ->> 'population', '?'),
          b.basis_key, b.version, mt ->> 'unit', mt ->> 'period', mt ->> 'population' USING ERRCODE = '22023';
      END IF;
      IF coalesce((f ->> 'limited')::boolean, false) THEN
        v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'limited_fact', 'reason', format('%s of %s is limited', f ->> 'key', c.name)));
      END IF;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('competitor_id', c.competitor_id, 'name', c.name, 'profile_version', h.version, 'metric', mt ->> 'key',
                  'value', f -> 'value' -> 'amount', 'unit', mt ->> 'unit', 'period', mt ->> 'period', 'population', mt ->> 'population', 'confidence', f -> 'confidence',
                  'citations', f -> 'citations', 'limited', coalesce((f ->> 'limited')::boolean, false)));
      v_cites := v_cites || coalesce(f -> 'citations', '[]'::jsonb);
    END LOOP;
  END LOOP;
  m := domain.dci_manifest(p_tenant, p_domain, v_pkg);
  v_div := domain.dci_source_diversity(p_tenant, p_domain, v_cites, coalesce((m -> 'diversity' ->> 'min_publishers')::int, 2));
  IF (v_div ->> 'below_threshold')::boolean THEN
    v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'source_diversity', 'reason', format('%s independent publisher(s), below the threshold of %s', v_div ->> 'independent_publishers', v_div ->> 'threshold')));
  END IF;
  INSERT INTO domain.competitor_comparisons (comparison_id, scope, tenant_id, domain_id, basis_key, basis_version, competitor_ids, rows, source_diversity, state, limited_reasons, compared_by, correlation_id)
  VALUES (p_comparison, 'DOMAIN', p_tenant, p_domain, b.basis_key, b.version, p_competitors, v_rows, v_div, CASE WHEN jsonb_array_length(v_limits) > 0 THEN 'limited' ELSE 'current' END, v_limits,
          p_actor, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, NULL, 'comparison', p_comparison, 'comparison.recorded', p_actor,
                         jsonb_build_object('basis', b.basis_key, 'basis_version', b.version, 'competitors', to_jsonb(p_competitors), 'limited_reasons', v_limits), p_correlation);
  RETURN jsonb_build_object('comparison_id', p_comparison, 'basis_key', b.basis_key, 'basis_version', b.version, 'rows', v_rows, 'source_diversity', v_div,
                            'state', CASE WHEN jsonb_array_length(v_limits) > 0 THEN 'limited' ELSE 'current' END, 'limited_reasons', v_limits);
END $$;
REVOKE ALL ON FUNCTION domain.dci_compare(uuid, uuid, uuid, text, uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_compare(uuid, uuid, uuid, text, uuid[], uuid, uuid) TO eye_commit;

/* A WATCHLIST (domain.competitor.watchlist): declared by its owner (a named strategy owner or analyst — named on every alert it raises) or retired. */
CREATE OR REPLACE FUNCTION domain.dci_declare_watchlist(p_watchlist uuid, p_tenant uuid, p_domain uuid, p_package_key text, p_title text, p_owner uuid, p_competitors uuid[], p_rules jsonb,
                                                        p_freshness_days int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x jsonb; v_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.watchlist']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor watchlist', p_actor);
  PERFORM domain.dci_gate('competitor watchlist', p_tenant, p_domain, p_package_key, 'alert');
  IF NOT domain.dci_is_human_with(p_owner, p_tenant, p_domain, ARRAY['strategy_owner', 'domain_analyst']) THEN
    RAISE EXCEPTION 'competitor watchlist rejected (owner): a watchlist''s owner is a named strategy owner or analyst of this domain' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 4 THEN RAISE EXCEPTION 'competitor watchlist rejected (request): a watchlist has a title (4+)' USING ERRCODE = '22023'; END IF;
  IF p_freshness_days IS NULL OR p_freshness_days NOT BETWEEN 1 AND 3650 THEN RAISE EXCEPTION 'competitor watchlist rejected (request): freshness_days is 1–3650' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_rules) <> 'array' OR jsonb_array_length(p_rules) = 0 THEN RAISE EXCEPTION 'competitor watchlist rejected (request): a watchlist has at least one rule' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(p_rules) LOOP
    IF coalesce(x ->> 'rule_key', '') !~ '^[a-z][a-z0-9-]{1,40}$' OR (jsonb_array_length(coalesce(x -> 'event_kinds', '[]'::jsonb)) + jsonb_array_length(coalesce(x -> 'fact_kinds', '[]'::jsonb))) = 0 THEN
      RAISE EXCEPTION 'competitor watchlist rejected (request): a rule is {rule_key, title?, event_kinds[], fact_kinds[], markets[]} with at least one kind' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH v_id IN ARRAY coalesce(p_competitors, '{}'::uuid[]) LOOP
    PERFORM domain.dci_competitor('competitor watchlist', p_tenant, p_domain, v_id, false);
  END LOOP;
  INSERT INTO domain.competitor_watchlists (watchlist_id, scope, tenant_id, domain_id, package_key, title, owner_principal_id, competitor_ids, rules, freshness_days, created_by, correlation_id)
  VALUES (p_watchlist, 'DOMAIN', p_tenant, p_domain, p_package_key, btrim(p_title), p_owner, coalesce(p_competitors, '{}'::uuid[]), p_rules, p_freshness_days, p_actor, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, NULL, 'watchlist', p_watchlist, 'watchlist.declared', p_actor, jsonb_build_object('owner', p_owner, 'rules', p_rules), p_correlation);
  RETURN jsonb_build_object('watchlist_id', p_watchlist, 'owner', p_owner, 'rules', p_rules, 'freshness_days', p_freshness_days);
END $$;
REVOKE ALL ON FUNCTION domain.dci_declare_watchlist(uuid, uuid, uuid, text, text, uuid, uuid[], jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_declare_watchlist(uuid, uuid, uuid, text, text, uuid, uuid[], jsonb, int, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION domain.dci_retire_watchlist(p_watchlist uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w domain.competitor_watchlists%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.watchlist']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor watchlist', p_actor);
  SELECT * INTO w FROM domain.competitor_watchlists x WHERE x.watchlist_id = p_watchlist AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor watchlist rejected (unknown_watchlist): no watchlist % in this domain', p_watchlist USING ERRCODE = '23503'; END IF;
  IF w.owner_principal_id <> p_actor AND w.created_by <> p_actor THEN RAISE EXCEPTION 'competitor watchlist rejected (ownership): a watchlist is retired by its owner or its declarer' USING ERRCODE = '42501'; END IF;
  IF w.state <> 'active' THEN RAISE EXCEPTION 'competitor watchlist rejected (state): watchlist % is %', w.title, w.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'competitor watchlist rejected (reason): a retirement says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE domain.competitor_watchlists SET state = 'retired', retired_at = clock_timestamp(), retired_by = p_actor, retire_reason = btrim(p_reason) WHERE watchlist_id = p_watchlist;
  PERFORM domain.dci_log(p_tenant, p_domain, NULL, 'watchlist', p_watchlist, 'watchlist.retired', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('watchlist_id', p_watchlist, 'state', 'retired');
END $$;
REVOKE ALL ON FUNCTION domain.dci_retire_watchlist(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_retire_watchlist(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* AN ANALYST CHALLENGE of an assessment's current version (domain.competitor.challenge; human-gated): its reason and what it proposes instead
   ({statement?, confidence?, limit?: true}). One open challenge per assessment. */
CREATE OR REPLACE FUNCTION domain.dci_challenge(p_challenge uuid, p_tenant uuid, p_domain uuid, p_assessment uuid, p_reason text, p_proposed jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a domain.competitor_assessments%ROWTYPE; c domain.competitors%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.challenge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_human('competitor assessment', p_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'strategy_owner'], 'challenging an assessment');
  SELECT * INTO a FROM domain.competitor_assessments x WHERE x.assessment_id = p_assessment AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state <> 'superseded';
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor assessment rejected (unknown_assessment): no current assessment % in this domain', p_assessment USING ERRCODE = '23503'; END IF;
  c := domain.dci_competitor('competitor assessment', p_tenant, p_domain, a.competitor_id, false);
  PERFORM domain.dci_gate('competitor assessment', p_tenant, p_domain, c.package_key, 'assess');
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'competitor assessment rejected (reason): a challenge states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_proposed) <> 'object' OR NOT (p_proposed ? 'statement' OR p_proposed ? 'confidence' OR coalesce((p_proposed ->> 'limit')::boolean, false)) THEN
    RAISE EXCEPTION 'competitor assessment rejected (request): a challenge proposes a statement, a confidence, or limit: true' USING ERRCODE = '22023';
  END IF;
  IF p_proposed ? 'statement' AND length(btrim(coalesce(p_proposed ->> 'statement', ''))) < 8 THEN
    RAISE EXCEPTION 'competitor assessment rejected (request): a proposed statement has 8+ characters' USING ERRCODE = '22023';
  END IF;
  IF p_proposed ? 'confidence' AND (jsonb_typeof(p_proposed -> 'confidence') <> 'number' OR (p_proposed ->> 'confidence')::numeric NOT BETWEEN 0 AND 1) THEN
    RAISE EXCEPTION 'competitor assessment rejected (request): a proposed confidence is 0–1' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM domain.competitor_challenges x WHERE x.assessment_id = p_assessment AND x.state = 'open') THEN
    RAISE EXCEPTION 'competitor assessment rejected (duplicate): assessment % is under an open challenge', p_assessment USING ERRCODE = '23505';
  END IF;
  INSERT INTO domain.competitor_challenges (challenge_id, scope, tenant_id, domain_id, assessment_id, assessment_version, challenger, reason, proposed, correlation_id)
  VALUES (p_challenge, 'DOMAIN', p_tenant, p_domain, p_assessment, a.version, p_actor, btrim(p_reason), p_proposed, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, a.competitor_id, 'challenge', p_challenge, 'challenge.opened', p_actor,
                         jsonb_build_object('assessment_id', p_assessment, 'version', a.version, 'reason', btrim(p_reason), 'proposed', p_proposed), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge, 'assessment_id', p_assessment, 'assessment_version', a.version, 'state', 'open');
END $$;
REVOKE ALL ON FUNCTION domain.dci_challenge(uuid, uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_challenge(uuid, uuid, uuid, uuid, text, jsonb, uuid, uuid) TO eye_commit;

/* DECIDE A CHALLENGE (domain.competitor.challenge.decide; human-gated): another named analyst (never the challenger). UPHELD → the
   assessment's next version (the challenged one superseded; statement/confidence as proposed; limited when it asked to limit) — the challenge
   recorded on it; DISMISSED → recorded with its reason. */
CREATE OR REPLACE FUNCTION domain.dci_decide_challenge(p_challenge uuid, p_tenant uuid, p_domain uuid, p_decision text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE ch domain.competitor_challenges%ROWTYPE; a domain.competitor_assessments%ROWTYPE; c domain.competitors%ROWTYPE; v_limit boolean; v_limits jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.challenge.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_human('competitor assessment', p_actor, p_tenant, p_domain, ARRAY['domain_analyst'], 'deciding a challenge');
  SELECT * INTO ch FROM domain.competitor_challenges x WHERE x.challenge_id = p_challenge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor assessment rejected (unknown_challenge): no challenge % in this domain', p_challenge USING ERRCODE = '23503'; END IF;
  IF ch.challenger = p_actor THEN RAISE EXCEPTION 'competitor assessment rejected (separation_of_duties): the analyst who challenged an assessment does not decide the challenge' USING ERRCODE = '42501'; END IF;
  IF ch.state <> 'open' THEN RAISE EXCEPTION 'competitor assessment rejected (state): challenge % is %', p_challenge, ch.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('upheld', 'dismissed') THEN RAISE EXCEPTION 'competitor assessment rejected (request): a challenge is upheld or dismissed' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'competitor assessment rejected (reason): a challenge decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM domain.competitor_assessments x WHERE x.assessment_id = ch.assessment_id AND x.version = ch.assessment_version FOR UPDATE;
  c := domain.dci_competitor('competitor assessment', p_tenant, p_domain, a.competitor_id, false);
  PERFORM domain.dci_gate('competitor assessment', p_tenant, p_domain, c.package_key, 'assess');
  IF p_decision = 'dismissed' THEN
    UPDATE domain.competitor_challenges SET state = 'dismissed', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE challenge_id = p_challenge;
    PERFORM domain.dci_log(p_tenant, p_domain, a.competitor_id, 'challenge', p_challenge, 'challenge.dismissed', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
    RETURN jsonb_build_object('challenge_id', p_challenge, 'state', 'dismissed');
  END IF;
  IF a.state = 'superseded' THEN
    RAISE EXCEPTION 'competitor assessment rejected (stale): assessment % moved past version % since the challenge', a.assessment_id, a.version USING ERRCODE = '22023';
  END IF;
  v_limit := coalesce((ch.proposed ->> 'limit')::boolean, false) OR a.state = 'limited';
  v_limits := a.limited_reasons || CASE WHEN coalesce((ch.proposed ->> 'limit')::boolean, false)
                 THEN jsonb_build_array(jsonb_build_object('class', 'challenge', 'reason', format('challenge upheld: %s', ch.reason), 'challenge_id', p_challenge)) ELSE '[]'::jsonb END;
  UPDATE domain.competitor_assessments SET state = 'superseded', superseded_at = clock_timestamp() WHERE assessment_id = a.assessment_id AND version = a.version;
  INSERT INTO domain.competitor_assessments (assessment_id, version, scope, tenant_id, domain_id, competitor_id, kind, statement, confidence, material, evidence, source_diversity,
                                             state, limited_reasons, proposal_id, challenge_id, profile_version, approved_by, correlation_id)
  VALUES (a.assessment_id, a.version + 1, 'DOMAIN', p_tenant, p_domain, a.competitor_id, a.kind, coalesce(btrim(ch.proposed ->> 'statement'), a.statement),
          coalesce((ch.proposed ->> 'confidence')::numeric, a.confidence), a.material, a.evidence, a.source_diversity, CASE WHEN v_limit THEN 'limited' ELSE 'approved' END,
          v_limits, a.proposal_id, p_challenge, a.profile_version, p_actor, p_correlation);
  UPDATE domain.competitor_challenges SET state = 'upheld', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), result_version = a.version + 1 WHERE challenge_id = p_challenge;
  PERFORM domain.dci_log(p_tenant, p_domain, a.competitor_id, 'challenge', p_challenge, 'challenge.upheld', p_actor,
                         jsonb_build_object('assessment_id', a.assessment_id, 'from_version', a.version, 'to_version', a.version + 1, 'reason', btrim(p_reason)), p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, a.competitor_id, 'assessment', a.assessment_id, 'assessment.superseded', p_actor,
                         jsonb_build_object('version', a.version, 'by_version', a.version + 1, 'challenge_id', p_challenge), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge, 'state', 'upheld', 'assessment_id', a.assessment_id, 'version', a.version + 1,
                            'assessment_state', CASE WHEN v_limit THEN 'limited' ELSE 'approved' END);
END $$;
REVOKE ALL ON FUNCTION domain.dci_decide_challenge(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_decide_challenge(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* DECISION-USE EVIDENCE (domain.competitor.decision.cite; human-gated): a decision package of this domain cites a profile version — recorded,
   never decided here (the package's owner or a decision authority records the use). */
CREATE OR REPLACE FUNCTION domain.dci_cite_in_decision(p_use uuid, p_tenant uuid, p_domain uuid, p_competitor uuid, p_version int, p_package uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, decision, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c domain.competitors%ROWTYPE; v domain.competitor_profile_versions%ROWTYPE; k decision.packages_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.decision.cite']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_human('competitor profile', p_actor, p_tenant, p_domain, ARRAY['decision_owner', 'decision_authority', 'strategy_owner'], 'recording a decision''s use of a profile');
  c := domain.dci_competitor('competitor profile', p_tenant, p_domain, p_competitor, false);
  PERFORM domain.dci_gate('competitor profile', p_tenant, p_domain, c.package_key, 'profile');
  SELECT * INTO v FROM domain.competitor_profile_versions x WHERE x.competitor_id = p_competitor AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_version): % has no profile version %', c.name, p_version USING ERRCODE = '23503'; END IF;
  SELECT * INTO k FROM decision.packages_current x WHERE x.package_id = p_package AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_package): no decision package % in this domain', p_package USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'competitor profile rejected (reason): a decision use says how the profile is used (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM domain.competitor_decision_uses x WHERE x.package_id = p_package AND x.competitor_id = p_competitor AND x.profile_version = p_version) THEN
    RAISE EXCEPTION 'competitor profile rejected (duplicate): decision package % already cites % v%', k.title, c.name, p_version USING ERRCODE = '23505';
  END IF;
  INSERT INTO domain.competitor_decision_uses (use_id, scope, tenant_id, domain_id, competitor_id, profile_version, package_id, note, cited_by, correlation_id)
  VALUES (p_use, 'DOMAIN', p_tenant, p_domain, p_competitor, p_version, p_package, btrim(p_note), p_actor, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, p_competitor, 'decision_use', p_use, 'decision.cited', p_actor,
                         jsonb_build_object('package_id', p_package, 'package_title', k.title, 'profile_version', p_version, 'profile_state', v.state), p_correlation);
  RETURN jsonb_build_object('use_id', p_use, 'package_id', p_package, 'profile_version', p_version, 'profile_state', v.state);
END $$;
REVOKE ALL ON FUNCTION domain.dci_cite_in_decision(uuid, uuid, uuid, uuid, int, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_cite_in_decision(uuid, uuid, uuid, uuid, int, uuid, text, uuid, uuid) TO eye_commit;

/* BIND THE COMPETITOR TWIN (domain.competitor.twin.bind; CI8): the twin's OWNER binds a twin of kind `competitor` (the 0092 family) to the
   competitor; its required dependency `market` is reported (twin.dependency_completeness) — a twin is populated, never generalised (B78). */
CREATE OR REPLACE FUNCTION domain.dci_bind_twin(p_competitor uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, twin, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c domain.competitors%ROWTYPE; t twin.twins_current%ROWTYPE; v_family text; v_dep jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.twin.bind']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  c := domain.dci_competitor('competitor profile', p_tenant, p_domain, p_competitor, true);
  PERFORM domain.dci_gate('competitor profile', p_tenant, p_domain, c.package_key, 'twin');
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_twin): no twin % in this domain', p_twin USING ERRCODE = '23503'; END IF;
  SELECT family INTO v_family FROM twin.twin_kind_schemas k WHERE k.kind = t.kind;
  IF coalesce(v_family, '') <> 'competitor' THEN RAISE EXCEPTION 'competitor profile rejected (twin): twin % is of family %, not competitor', t.title, coalesce(v_family, '?') USING ERRCODE = '22023'; END IF;
  IF t.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'competitor profile rejected (ownership): the competitor twin is bound by its owner' USING ERRCODE = '42501'; END IF;
  IF c.twin_id IS NOT NULL THEN RAISE EXCEPTION 'competitor profile rejected (state): % is bound to twin % already', c.name, c.twin_id USING ERRCODE = '22023'; END IF;
  UPDATE domain.competitors SET twin_id = p_twin, twin_bound_by = p_actor, twin_bound_at = clock_timestamp() WHERE competitor_id = p_competitor;
  v_dep := twin.dependency_completeness(p_tenant, p_domain, p_twin);
  PERFORM domain.dci_log(p_tenant, p_domain, p_competitor, 'competitor', p_competitor, 'competitor.twin_bound', p_actor, jsonb_build_object('twin_id', p_twin, 'dependencies', v_dep), p_correlation);
  RETURN jsonb_build_object('competitor_id', p_competitor, 'twin_id', p_twin, 'dependencies', v_dep);
END $$;
REVOKE ALL ON FUNCTION domain.dci_bind_twin(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_bind_twin(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* DECIDE THE TWIN PROPOSAL (domain.competitor.twin.decide; human-gated): the twin's OWNER only. APPLIED — against an ADMITTED actual version of
   the twin (applied by the owner through the twin's own version/ground/admit routes) whose element carries the proposed value; DECLINED — a reason. */
CREATE OR REPLACE FUNCTION domain.dci_decide_twin_proposal(p_proposal uuid, p_tenant uuid, p_domain uuid, p_decision text, p_version int, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, twin, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE tp domain.competitor_twin_proposals%ROWTYPE; t twin.twins_current%ROWTYPE; v_val numeric; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.twin.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_human('competitor profile', p_actor, p_tenant, p_domain, ARRAY['twin_owner'], 'deciding a twin capacity proposal');
  SELECT * INTO tp FROM domain.competitor_twin_proposals x WHERE x.proposal_id = p_proposal AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_twin_proposal): no twin proposal % in this domain', p_proposal USING ERRCODE = '23503'; END IF;
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = tp.twin_id;
  IF t.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'competitor profile rejected (ownership): a capacity change to twin % is the twin owner''s decision', t.title USING ERRCODE = '42501'; END IF;
  IF tp.state <> 'proposed' THEN RAISE EXCEPTION 'competitor profile rejected (state): twin proposal % is %', p_proposal, tp.state USING ERRCODE = '22023'; END IF;
  IF p_decision = 'declined' THEN
    IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'competitor profile rejected (reason): a declined twin proposal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
    UPDATE domain.competitor_twin_proposals SET state = 'declined', decided_by = p_actor, decided_at = clock_timestamp(), note = btrim(p_note) WHERE proposal_id = p_proposal;
    PERFORM domain.dci_log(p_tenant, p_domain, tp.competitor_id, 'twin_proposal', p_proposal, 'twin.declined', p_actor, jsonb_build_object('note', btrim(p_note)), p_correlation);
    RETURN jsonb_build_object('proposal_id', p_proposal, 'state', 'declined');
  END IF;
  IF p_decision <> 'applied' THEN RAISE EXCEPTION 'competitor profile rejected (request): a twin proposal is applied or declined' USING ERRCODE = '22023'; END IF;
  SELECT tv.state INTO v_state FROM twin.twin_versions tv WHERE tv.twin_id = tp.twin_id AND tv.version = p_version AND tv.branch_id = 'actual';
  IF v_state IS DISTINCT FROM 'admitted' THEN
    RAISE EXCEPTION 'competitor profile rejected (twin): version % of twin % is not an admitted actual version (apply the change through the twin''s version, ground and admit routes first)', p_version, t.title USING ERRCODE = '22023';
  END IF;
  SELECT (s.value #>> '{}')::numeric INTO v_val FROM twin.state_elements s WHERE s.twin_id = tp.twin_id AND s.version = p_version AND s.key = tp.key AND jsonb_typeof(s.value) = 'number';
  IF v_val IS DISTINCT FROM tp.proposed_value THEN
    RAISE EXCEPTION 'competitor profile rejected (twin): version % of twin % holds % = %, not the proposed %', p_version, t.title, tp.key, coalesce(v_val::text, 'nothing'), tp.proposed_value USING ERRCODE = '22023';
  END IF;
  UPDATE domain.competitor_twin_proposals SET state = 'applied', decided_by = p_actor, decided_at = clock_timestamp(), note = NULLIF(btrim(coalesce(p_note, '')), ''), applied_version = p_version
   WHERE proposal_id = p_proposal;
  PERFORM domain.dci_log(p_tenant, p_domain, tp.competitor_id, 'twin_proposal', p_proposal, 'twin.applied', p_actor, jsonb_build_object('version', p_version, 'value', v_val), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal, 'state', 'applied', 'applied_version', p_version, 'value', v_val);
END $$;
REVOKE ALL ON FUNCTION domain.dci_decide_twin_proposal(uuid, uuid, uuid, text, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_decide_twin_proposal(uuid, uuid, uuid, text, int, text, uuid, uuid) TO eye_commit;

/* THE AGENT'S SCAN MARK (domain.competitor.propose — inside its running domain_scan): the watermark it read to, per competitor. */
CREATE OR REPLACE FUNCTION domain.dci_record_scan(p_tenant uuid, p_domain uuid, p_competitor uuid, p_agent uuid, p_run uuid, p_watermark timestamptz, p_seen int, p_proposed int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE; r executive.agent_runs%ROWTYPE; v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  PERFORM domain.dci_competitor('competitor profile', p_tenant, p_domain, p_competitor, false);
  SELECT * INTO a FROM executive.agents x WHERE x.agent_id = p_agent AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  SELECT * INTO r FROM executive.agent_runs x WHERE x.run_id = p_run AND x.agent_id = p_agent;
  IF a.agent_id IS NULL OR a.principal_id <> p_actor OR a.agent_kind <> 'domain_intelligence' OR r.run_id IS NULL OR r.outcome <> 'running' THEN
    RAISE EXCEPTION 'competitor profile rejected (actor): a scan mark is the Domain Intelligence Agent''s, inside its own running scan' USING ERRCODE = '42501';
  END IF;
  INSERT INTO domain.competitor_scan_marks (mark_id, scope, tenant_id, domain_id, competitor_id, agent_id, run_id, watermark, claims_seen, proposed, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_competitor, p_agent, p_run, p_watermark, greatest(p_seen, 0), greatest(p_proposed, 0), p_correlation);
  RETURN jsonb_build_object('mark_id', v_id, 'watermark', p_watermark);
END $$;
REVOKE ALL ON FUNCTION domain.dci_record_scan(uuid, uuid, uuid, uuid, uuid, timestamptz, int, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_record_scan(uuid, uuid, uuid, uuid, uuid, timestamptz, int, int, uuid, uuid) TO eye_commit;

/* WHAT THE AGENT READS (INVOKER, under its read context): per WATCHED competitor of an active package, the claims (EVT/CLM/REL, their latest
   versions, not withdrawn) extracted from evidence one of whose mentions the graph RESOLVED (accepted) to the competitor's entity, recorded
   after the competitor's last scan mark — oldest first; and the place entities resolved from the same evidence. The read is bounded (p_limit). */
CREATE OR REPLACE FUNCTION domain.dci_scan_backlog(p_tenant uuid, p_domain uuid, p_limit int) RETURNS TABLE (competitor_id uuid, package_key text, entity_id uuid, name text, watermark timestamptz,
  claim_id uuid, claim_version bigint, claim_type text, claim_digest text, payload jsonb, recorded_at timestamptz, evidence_id uuid, evidence_version bigint, evidence_digest text, places jsonb)
LANGUAGE sql STABLE SET search_path = domain, graph, objects, intelligence, pg_catalog, pg_temp AS $$
  WITH watched AS (
    SELECT c.* FROM domain.competitors c
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state = 'active'
       AND domain.package_function_state(p_tenant, p_domain, c.package_key, 'collect') ->> 'state' = 'active'
       AND EXISTS (SELECT 1 FROM domain.competitor_watchlists w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state = 'active' AND w.package_key = c.package_key
                     AND (cardinality(w.competitor_ids) = 0 OR c.competitor_id = ANY (w.competitor_ids)))
  ), marks AS (
    SELECT w.competitor_id, coalesce((SELECT max(m.watermark) FROM domain.competitor_scan_marks m WHERE m.competitor_id = w.competitor_id), '-infinity'::timestamptz) AS watermark FROM watched w
  ), ev AS (
    SELECT DISTINCT w.competitor_id, r.evidence_object_id FROM watched w JOIN graph.resolutions_current r ON r.entity_id = w.entity_id AND r.state = 'accepted'
     WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain
  ), claims AS (
    SELECT DISTINCT ON (o.object_id) ev.competitor_id, o.object_id, o.object_version, o.object_type, o.content_digest, o.payload, o.recorded_at, o.lifecycle_state, ev.evidence_object_id
      FROM ev JOIN objects.canonical_objects o ON o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type IN ('EVT', 'CLM', 'REL')
           AND (o.payload -> 'lineage' ->> 'evidence_object_id') = ev.evidence_object_id::text
     ORDER BY o.object_id, o.object_version DESC
  )
  SELECT w.competitor_id, w.package_key, w.entity_id, w.name, mk.watermark, cl.object_id, cl.object_version, cl.object_type, cl.content_digest, cl.payload, cl.recorded_at,
         cl.evidence_object_id, d.object_version, d.content_digest,
         (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('entity_id', e.entity_id, 'name', e.canonical_name)), '[]'::jsonb)
            FROM graph.resolutions_current r2 JOIN graph.entities_current e ON e.entity_id = r2.entity_id AND e.entity_type = 'place'
           WHERE r2.evidence_object_id = cl.evidence_object_id AND r2.state = 'accepted' AND r2.tenant_id = p_tenant)
    FROM claims cl JOIN watched w ON w.competitor_id = cl.competitor_id JOIN marks mk ON mk.competitor_id = cl.competitor_id
    LEFT JOIN LATERAL (SELECT x.object_version, x.content_digest FROM objects.canonical_objects x WHERE x.object_id = cl.evidence_object_id AND x.object_type = 'EVD' AND x.tenant_id = p_tenant
                        ORDER BY x.object_version DESC LIMIT 1) d ON true
   WHERE cl.recorded_at > mk.watermark AND cl.lifecycle_state NOT IN ('withdrawn', 'retracted')
     -- the losing side of an ADJUDICATED contradiction is not read again (both sides stay preserved where they were cited)
     AND NOT EXISTS (SELECT 1 FROM intelligence.contradictions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'adjudicated'
                       AND ((x.adjudication = 'a_withdrawn' AND x.a_object_id = cl.object_id) OR (x.adjudication = 'b_withdrawn' AND x.b_object_id = cl.object_id)))
   ORDER BY cl.recorded_at, cl.object_id
   LIMIT greatest(coalesce(p_limit, 200), 1)
$$;
REVOKE ALL ON FUNCTION domain.dci_scan_backlog(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_scan_backlog(uuid, uuid, int) TO eye_app, eye_commit;
/* WHAT NEEDS REVALIDATION NOW (INVOKER): per active competitor with a profile, a head fact whose evidence is no longer resolved to it (mistaken)
   or in open conflict and not yet limited for that, or coverage stale/none without an open coverage revalidation. The agent's scan and the
   after-tick hook read it (a revalidation writes only when something is found). */
CREATE OR REPLACE FUNCTION domain.dci_needs_revalidation(p_tenant uuid, p_domain uuid) RETURNS TABLE (competitor_id uuid, name text, reasons jsonb)
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT c.competitor_id, c.name, r.reasons
    FROM domain.competitors c
    JOIN domain.competitor_profile_versions h ON h.competitor_id = c.competitor_id AND h.state <> 'superseded'
    CROSS JOIN LATERAL (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) AS reasons FROM (
        SELECT jsonb_build_object('class', 'identity', 'fact', f ->> 'key') AS x FROM jsonb_array_elements(h.facts) f
         WHERE domain.dci_identity(p_tenant, p_domain, c.entity_id, f -> 'citations') ->> 'state' = 'mistaken'
           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f -> 'limited_reasons', '[]'::jsonb)) l WHERE l ->> 'class' = 'identity' AND l ->> 'state' = 'mistaken')
        UNION ALL
        SELECT jsonb_build_object('class', 'contradiction', 'fact', f ->> 'key') FROM jsonb_array_elements(h.facts) f
         WHERE jsonb_array_length(domain.dci_contradictions(p_tenant, p_domain, f -> 'citations')) > 0
           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f -> 'limited_reasons', '[]'::jsonb)) l WHERE l ->> 'class' = 'contradiction')
        UNION ALL
        SELECT jsonb_build_object('class', 'coverage', 'state', domain.dci_coverage(p_tenant, p_domain, c.competitor_id) ->> 'state')
         WHERE domain.dci_coverage(p_tenant, p_domain, c.competitor_id) ->> 'state' IN ('stale', 'none')
           AND NOT EXISTS (SELECT 1 FROM domain.competitor_revalidations v WHERE v.competitor_id = c.competitor_id AND v.reason_class = 'coverage' AND v.state = 'open')) q) r
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state = 'active' AND jsonb_array_length(r.reasons) > 0
$$;
REVOKE ALL ON FUNCTION domain.dci_needs_revalidation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_needs_revalidation(uuid, uuid) TO eye_app, eye_commit;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- end §CI
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ── end of the folded §CI ──
