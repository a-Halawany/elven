-- 0099 — CP-6 B31 (2026-10-01): SIMULATION ORCHESTRATION, IMPACT ANALYSIS, VALIDITY — F-P5-06 (orchestration: experiments, budgets,
-- checkpoints, pause/resume, partial runs, admission, the simulation center), F-P5-07 (impact: sensitivity and robustness, second-order
-- effects, value of information, the approved frequency-to-probability mapping), F-P5-09 (validity: the gate on unpromoted runs, labelled
-- diagnostic use, invalidation reaching packages, commitments and evaluation results); and the "B31:" pieces of F-P4-07/-08/-09 (a branch bound
-- to a twin state, the assumption → scenario dependency, claim and indicator suspension, sensitivity on the set comparator, the gates
-- consulting scenario quality and suspension).
--
-- One migration in four sections, the prelude written first by the integrator, the three parts built and proven on their own in parallel
-- worktrees (their harnesses phase6-{orchestration,impact,validity}-b31), then combined here in the apply order (§0, then the part files
-- alphabetically: §I impact, §O orchestration, §V validity). Forward-only; 0033–0098 untouched. The exact run-event vocabulary
-- (simulation.run_events) and the coherence v1 rule are pinned by older harnesses and are NOT widened: each part keeps its own ledger.

-- ═════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ═════════════════════════════════════════════════════════════════════
-- §0.1 THE PARTIAL RUN (F-P5-06 / F-P5-09: a run that stopped — budget, operator, a failed chunk — with declared missing outputs). Only
-- §O's port writes it; a partial run is never decision-active (§V's gate). The column `partial` carries what is missing and why.
ALTER TABLE simulation.runs_current DROP CONSTRAINT IF EXISTS runs_current_state_check;
ALTER TABLE simulation.runs_current ADD CONSTRAINT runs_current_state_check CHECK (state IN ('opened', 'completed', 'failed', 'partial'));
ALTER TABLE simulation.runs_current ADD COLUMN partial jsonb CHECK (partial IS NULL OR jsonb_typeof(partial) = 'object');   -- {reason, missing_outputs: [...], completed_paths, declared_paths}
ALTER TABLE simulation.runs_current ADD CONSTRAINT sim_partial_bound CHECK ((state = 'partial') = (partial IS NOT NULL));
COMMENT ON COLUMN simulation.runs_current.partial IS 'B31 (0099 §0): a PARTIAL run''s declaration — why it stopped, which outputs are missing, how many paths completed of how many declared; never decision-active (§V).';

-- §0.2 THE ATTENTION CLASSES AND SUBJECT KINDS (0097 §0.3's lists whole, plus B31's)
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
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information'));
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_subject_kind_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (
  'forecast', 'scenario', 'warning', 'source', 'claim', 'package', 'review',
  'exposure', 'health_change', 'commitment_item',
  'plan', 'publication', 'strategy_object', 'queue',
  'product', 'subscription', 'metric', 'asset',
  'branch', 'scenario_set',
  -- B31 (0099)
  'run', 'experiment'));

-- §0.3 THE IMMUTABILITY of a finished run extends to a PARTIAL one (0081's runs_immutable copied whole; one change, marked)
CREATE OR REPLACE FUNCTION simulation.runs_immutable() RETURNS trigger
SET search_path = simulation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'simulation runs are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state IN ('completed', 'failed', 'partial') THEN   -- B31 (0099 §0): a partial run is frozen as a failed one is
    IF NEW.state <> OLD.state OR (to_jsonb(NEW) - ARRAY['validity', 'invalidated_at', 'invalidated_by', 'invalidation', 'fitness_state', 'promoted_for', 'promotion_id']) <> (to_jsonb(OLD) - ARRAY['validity', 'invalidated_at', 'invalidated_by', 'invalidation', 'fitness_state', 'promoted_for', 'promotion_id']) THEN
      RAISE EXCEPTION 'simulation run % is % and immutable; a correction is a new run that names it — only its validity (once) and its fitness change, by event (0078, 0081)', OLD.run_id, OLD.state USING ERRCODE = '2F002';
    END IF;
    IF OLD.validity = 'invalidated' AND (NEW.validity <> 'invalidated' OR NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at OR NEW.invalidated_by IS DISTINCT FROM OLD.invalidated_by OR NEW.invalidation IS DISTINCT FROM OLD.invalidation) THEN
      RAISE EXCEPTION 'simulation run % was invalidated at %; an invalidation is recorded once', OLD.run_id, OLD.invalidated_at USING ERRCODE = '2F002';
    END IF;
    IF OLD.promotion_id IS NOT NULL AND (NEW.promotion_id IS DISTINCT FROM OLD.promotion_id OR NEW.promoted_for IS DISTINCT FROM OLD.promoted_for) THEN
      RAISE EXCEPTION 'simulation run % was promoted at %; a promotion is recorded once (an upheld challenge changes the fitness, never the promotion)', OLD.run_id, OLD.promotion_id USING ERRCODE = '2F002';
    END IF;
    RETURN NEW;
  END IF;
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
END $$ LANGUAGE plpgsql;
