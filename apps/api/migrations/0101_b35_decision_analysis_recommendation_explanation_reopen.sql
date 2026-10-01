-- 0101 — CP-6 B35 (2026-10-01): DECISION ANALYSIS, RECOMMENDATION, EXPLANATION AND APPEAL, REOPEN AND REPLAY — F-P6-01 (option analysis:
-- criteria with exposed weights and sensitivity, constraints and obligations evaluated per option, trade-offs and value of information as
-- computed products, option generation, the package assembled from its inputs), F-P6-02 (the recommendation as a distinct explained object,
-- its review comparing AI and human recommendations, accept-for-consideration, the human-led incomplete-package mode), F-P6-03 (the governed
-- explanation object, its faithfulness check, contest and appeal cases), F-P6-06 (reopen re-versioning the scenario, outcome assessment
-- separating observed result, inferred contribution, counterfactual and changed conditions, decision metrics, replay initiator and reason);
-- and the "B35:" pieces of F-P4-08, F-P4-09, F-P5-06 and F-P5-07.
--
-- One migration in five sections: the prelude (§0) written first by the integrator, the four parts built and proven on their own in parallel
-- worktrees (harnesses phase6-{analysis,recommendation,explanation,reopen}-b35), then combined here in the apply order (§0, then the part files
-- alphabetically: §A analysis, §E explanation, §P reopen, §R recommendation). Forward-only; 0001–0100 untouched. The decision ledger's exact
-- event lists (decision.package_events, pinned by phase6-decisions, -approvals, -briefings, -replay and interfaces-b18) are NOT widened:
-- each part keeps its own ledger. The interface register stays 50/0/0.

-- ═════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ═════════════════════════════════════════════════════════════════════
-- §0.1 THE ATTENTION CLASSES AND SUBJECT KINDS (0099 §0.2's lists whole, plus B35's): decision.recommendation (a recommendation awaiting
-- review → the package owner and the reviewers), decision.appeal (a contest or appeal case opened, its deadline near or passed → the
-- adjudicator), decision.reversion (a reopened decision's scenario to re-version → its owner), decision.review_due (a scenario set's or a
-- decision's review cadence missed → its owner). Subject kinds: recommendation, appeal_case, outcome_assessment.
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
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal',
  'simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information',
  'decision.recommendation', 'decision.appeal', 'decision.reversion', 'decision.review_due'));
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
  'recommendation', 'appeal_case', 'outcome_assessment'));
