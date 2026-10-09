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
