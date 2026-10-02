-- 0103 — CP-6 B30 (2026-10-02): TWIN STATE, RECONCILIATION, ENVELOPE AND CALIBRATION — F-P5-02 (state estimation and continuous
-- reconciliation: input qualification, declared estimators producing candidate state with disagreement retained, constraint validation
-- before publish, the owner's review of material changes, the Reconciliation Agent proposing only, triggers beyond graph corrections, requests
-- for new observations), F-P5-03 (the branch-aware state store: checkpoint restore, branch merge requiring reconciliation, component
-- confidence, staleness by age and dependency, the frozen validated snapshot with its freshness warning and expiry, the scenario element
-- kind, the ontology/policy revision on commits, the explorer with time travel), F-P5-04 (behaviours outside the calibrated envelope disabled
-- for decision use, raised approval thresholds, calibration against observed outcomes, the behaviour model's stewardship lifecycle, the
-- envelope exposed to AI consumers, degraded modes with fault tests); and the B30 carryovers of F-P5-06 (chunked method-fabric experiments,
-- checkpoint indicators acted on, retirement) and F-P5-07 (nonlinear response across the envelope; rare events, model discrepancy and
-- benchmark validation).
--
-- One migration in five sections: the prelude (§0) written first by the integrator, the four parts built and proven on their own in parallel
-- worktrees (harnesses phase6-{branches,envelope,estimation,experiments}-b30), then combined here in the apply order (§0, §BR branches, §EN
-- envelope, §ES estimation, §EX experiments). Forward-only; 0001–0102 untouched. Each part keeps its own ledger: the pinned event lists
-- (twin.twin_events on existing paths, simulation.run_events, simulation.experiment_events on the B31 fixtures) are not touched on any existing
-- path. The interface register stays 50/0/0.

-- ═════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ═════════════════════════════════════════════════════════════════════
-- §0.1 THE ATTENTION CLASSES AND SUBJECT KINDS (0101 §0.1's lists whole, plus B30's): twin.reconciliation (an estimate, a merge or a
-- reconciliation awaiting the twin owner), twin.freshness (a snapshot past its freshness SLO, a frozen snapshot near or past expiry),
-- twin.envelope (an outside-envelope run awaiting exploratory admission, a model's calibration drifting), twin.observation_request (missing or
-- stale elements: a new observation requested), simulation.checkpoint (an unstable or violated checkpoint acted on). Subject kinds: twin,
-- twin_version, twin_estimate, twin_branch, behaviour_model.
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
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due',
  'twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint'));
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
  'twin', 'twin_version', 'twin_estimate', 'twin_branch', 'behaviour_model'));

-- §0.2 THE RECONCILIATION AGENT: a role, an agent kind and its task (the Supply Chain Agent's precedent, 0092 §0.1/§0.6). It PROPOSES
-- estimates; it never approves, never opens, grounds or admits a twin version (twin.agent_write_boundary stands).
INSERT INTO identity.roles (code, scope, description) VALUES
  ('reconciliation_agent', 'DOMAIN', 'The Reconciliation Agent (B30): reads qualified inputs and PROPOSES candidate twin state (estimates) to the twin''s owner — never approves, never writes a twin version')
ON CONFLICT (code) DO NOTHING;
ALTER TABLE executive.agents DROP CONSTRAINT IF EXISTS agents_agent_kind_check;
ALTER TABLE executive.agents ADD CONSTRAINT agents_agent_kind_check CHECK (agent_kind IN ('decision', 'briefing', 'reporting', 'attention', 'weak_signal', 'risk', 'opportunity',
                                                                                            /* B29 (0092) */ 'supply_chain',
                                                                                            /* B30 (0103) */ 'reconciliation'));
ALTER TABLE executive.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_task_check;
ALTER TABLE executive.agent_runs ADD CONSTRAINT agent_runs_task_check CHECK (task IN ('draft', 'briefing', 'report', 'monitor', 'attention_tick', 'signal_scan', 'risk_assess', 'opportunity_assess',
                                                                                      /* B29 (0092) */ 'supply_scan',
                                                                                      /* B30 (0103) */ 'reconcile_scan'));

-- §0.3 THE SCENARIO ELEMENT KIND (ADR-0011 V4): a twin element may be a SCENARIO value — kept apart from observed, estimated, assumed,
-- predicted and simulated state. Its basis rule is §BR's.
ALTER TABLE twin.state_elements DROP CONSTRAINT state_elements_kind_check;
ALTER TABLE twin.state_elements ADD CONSTRAINT state_elements_kind_check
  CHECK (kind IN ('observed', 'estimated', 'assumed', 'predicted', 'simulated', /* B30 (0103) */ 'scenario'));

-- §0.4 RUN RETIREMENT (PR-35-001): the columns §EX's retirement writes and §EN's decision-use read reads. NULL on every existing run.
-- simulation.runs_immutable (0099:56) is re-declared, copied whole, so a FINISHED run's retirement is written once (the three columns join
-- the exclusions of the frozen row; the second write is refused; an unfinished run is never retired) — marked B30.
ALTER TABLE simulation.runs_current ADD COLUMN retired_at timestamptz;
ALTER TABLE simulation.runs_current ADD COLUMN retired_by uuid;
ALTER TABLE simulation.runs_current ADD COLUMN retire_reason text;
ALTER TABLE simulation.runs_current ADD CONSTRAINT sim_retired_bound CHECK ((retired_at IS NULL) = (retired_by IS NULL) AND (retired_at IS NULL) = (retire_reason IS NULL)
                                                                           AND (retire_reason IS NULL OR length(btrim(retire_reason)) >= 8));

CREATE OR REPLACE FUNCTION simulation.runs_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'simulation', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'simulation runs are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state IN ('completed', 'failed', 'partial') THEN   -- B31 (0099 §0): a partial run is frozen as a failed one is
    IF NEW.state <> OLD.state OR (to_jsonb(NEW) - ARRAY['validity', 'invalidated_at', 'invalidated_by', 'invalidation', 'fitness_state', 'promoted_for', 'promotion_id', /* B30 (0103) */ 'retired_at', 'retired_by', 'retire_reason']) <> (to_jsonb(OLD) - ARRAY['validity', 'invalidated_at', 'invalidated_by', 'invalidation', 'fitness_state', 'promoted_for', 'promotion_id', /* B30 (0103) */ 'retired_at', 'retired_by', 'retire_reason']) THEN
      RAISE EXCEPTION 'simulation run % is % and immutable; a correction is a new run that names it — only its validity (once) and its fitness change, by event (0078, 0081)', OLD.run_id, OLD.state USING ERRCODE = '2F002';
    END IF;
    IF OLD.validity = 'invalidated' AND (NEW.validity <> 'invalidated' OR NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at OR NEW.invalidated_by IS DISTINCT FROM OLD.invalidated_by OR NEW.invalidation IS DISTINCT FROM OLD.invalidation) THEN
      RAISE EXCEPTION 'simulation run % was invalidated at %; an invalidation is recorded once', OLD.run_id, OLD.invalidated_at USING ERRCODE = '2F002';
    END IF;
    IF OLD.promotion_id IS NOT NULL AND (NEW.promotion_id IS DISTINCT FROM OLD.promotion_id OR NEW.promoted_for IS DISTINCT FROM OLD.promoted_for) THEN
      RAISE EXCEPTION 'simulation run % was promoted at %; a promotion is recorded once (an upheld challenge changes the fitness, never the promotion)', OLD.run_id, OLD.promotion_id USING ERRCODE = '2F002';
    END IF;
    -- B30 (0103 §0.4): a retirement is recorded once, on a finished run only (the B31 partial and the failed included)
    IF OLD.retired_at IS NOT NULL AND (NEW.retired_at IS DISTINCT FROM OLD.retired_at OR NEW.retired_by IS DISTINCT FROM OLD.retired_by OR NEW.retire_reason IS DISTINCT FROM OLD.retire_reason) THEN
      RAISE EXCEPTION 'simulation run % was retired at %; a retirement is recorded once', OLD.run_id, OLD.retired_at USING ERRCODE = '2F002';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.retired_at IS NOT NULL THEN RAISE EXCEPTION 'simulation run % is %, not finished; only a finished run is retired', OLD.run_id, OLD.state USING ERRCODE = '2F002'; END IF;   -- B30 (0103 §0.4)
  IF NEW.validity <> 'valid' THEN RAISE EXCEPTION 'simulation run % is %, not completed; only a completed result is invalidated', OLD.run_id, OLD.state USING ERRCODE = '2F002'; END IF;
  IF NEW.run_id <> OLD.run_id OR NEW.twin_id <> OLD.twin_id OR NEW.twin_version <> OLD.twin_version OR NEW.initial_state <> OLD.initial_state
     OR NEW.initial_state_digest <> OLD.initial_state_digest OR NEW.inputs_digest <> OLD.inputs_digest OR NEW.interventions <> OLD.interventions
     OR NEW.constraints <> OLD.constraints OR NEW.assumptions <> OLD.assumptions OR NEW.implementation_digest <> OLD.implementation_digest
     OR NEW.environment_digest <> OLD.environment_digest OR NEW.stochastic_mode <> OLD.stochastic_mode OR NEW.seed IS DISTINCT FROM OLD.seed
     OR NEW.samples IS DISTINCT FROM OLD.samples OR NEW.control_run_id IS DISTINCT FROM OLD.control_run_id OR NEW.run_kind <> OLD.run_kind
     OR NEW.scenario_id IS DISTINCT FROM OLD.scenario_id OR NEW.scenario_branch_id IS DISTINCT FROM OLD.scenario_branch_id
     OR NEW.scenario_version IS DISTINCT FROM OLD.scenario_version OR NEW.scenario_branch_state IS DISTINCT FROM OLD.scenario_branch_state
     OR NEW.shock <> OLD.shock OR NEW.shock_basis <> OLD.shock_basis OR NEW.controls <> OLD.controls
     OR NEW.twin_fitness <> OLD.twin_fitness OR NEW.envelope_state <> OLD.envelope_state OR NEW.envelope_check IS DISTINCT FROM OLD.envelope_check OR NEW.envelope_ack IS DISTINCT FROM OLD.envelope_ack OR NEW.challenge_id IS DISTINCT FROM OLD.challenge_id THEN
    RAISE EXCEPTION 'the experiment contract of run % is bound at opening and cannot change', OLD.run_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $function$;
