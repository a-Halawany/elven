-- 0097 — CP-6 B27 (2026-09-30): SCENARIO ANATOMY, SETS AND COHERENCE — F-P4-07 (drivers, actors, mechanisms, the assumption register,
-- suspension), F-P4-08 (scenario sets, comparison, the portfolio review, living scenarios), F-P4-09 (semantic coherence, quality measures,
-- degraded behaviours, governed branch probabilities).
--
-- One migration in four sections, the prelude written first by the integrator, the three parts built and proven on their own in parallel
-- worktrees (their harnesses phase6-{anatomy,sets,quality}-b27), then combined here in the apply order every fresh-database run used:
--   §0  the prelude: the SUSPENDED branch state (with who, when, why and the cause) and its reinstatement columns; the widened scenario event
--       vocabulary (every part's names); the attention classes and subject kinds the parts raise; the helper prediction.branch_live(state)
--   §A  anatomy (F-P4-07)   §S  sets (F-P4-08)   §Q  quality and coherence v2 (F-P4-09)
-- Forward-only; 0029–0096 untouched. The coherence rule v1 (0081) and its findings are NOT changed — §Q's measures are a separate,
-- versioned evaluation. Every figure a harness seeds is SYNTHETIC.

-- ═════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ═════════════════════════════════════════════════════════════════════
-- §0.1 THE SUSPENDED BRANCH (F-P4-07 "suspend a branch — not only flag — when a critical assumption is invalidated")
ALTER TABLE prediction.branches_current DROP CONSTRAINT IF EXISTS branches_current_state_check;
ALTER TABLE prediction.branches_current ADD CONSTRAINT branches_current_state_check CHECK (state IN ('open', 'flipped', 'closed', 'suspended'));
ALTER TABLE prediction.branches_current
  ADD COLUMN suspended_at        timestamptz,
  ADD COLUMN suspended_by        uuid,                      -- the acting principal (a person, or the agent of the consumer that applied the invalidation)
  ADD COLUMN suspension_reason   text,
  ADD COLUMN suspension_cause    jsonb CHECK (suspension_cause IS NULL OR jsonb_typeof(suspension_cause) = 'object'),   -- {kind: 'assumption'|'element'|'operator', id, ...}
  ADD COLUMN suspended_from      text CHECK (suspended_from IS NULL OR suspended_from IN ('open', 'flipped')),          -- the state a reinstatement returns to
  ADD COLUMN reinstated_at       timestamptz,
  ADD COLUMN reinstated_by       uuid,
  ADD COLUMN reinstatement_note  text;
ALTER TABLE prediction.branches_current ADD CONSTRAINT brn_suspended_bound CHECK (
  (state = 'suspended') = (suspended_at IS NOT NULL AND suspended_by IS NOT NULL AND suspension_reason IS NOT NULL AND suspended_from IS NOT NULL)
  OR (state <> 'suspended' AND suspended_at IS NOT NULL AND reinstated_at IS NOT NULL AND reinstated_at >= suspended_at));
COMMENT ON COLUMN prediction.branches_current.suspended_from IS 'B27 (0097 §0): the state the branch held when it was suspended; a reinstatement returns it there (open or flipped). A suspended branch is not live: no flip, no simulation, not decision-active.';

/* Whether a branch state is LIVE (it may flip, be simulated, be cited as decision-active): open or flipped — never suspended or closed. */
CREATE OR REPLACE FUNCTION prediction.branch_live(p_state text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p_state IN ('open', 'flipped') $$;
GRANT EXECUTE ON FUNCTION prediction.branch_live(text) TO eye_app, eye_commit;

-- §0.2 THE SCENARIO EVENT VOCABULARY (0084:2092's list whole, plus B27's names — every part's, declared here once)
ALTER TABLE prediction.scenario_events DROP CONSTRAINT IF EXISTS scenario_events_event_check;
ALTER TABLE prediction.scenario_events ADD CONSTRAINT scenario_events_event_check CHECK (event IN (
  'scenario.declared', 'branch.added', 'branch.flipped', 'branch.closed', 'scenario.closed', 'scenario.attention', 'scenario.reviewed', 'scenario.retired',
  'scenario.coherence_checked', 'scenario.branched', 'scenario.branch_repeated',
  -- B27 (0097) §0 / §A anatomy: the suspension, the elements, the assumption register, the records
  'branch.suspended', 'branch.reinstated', 'scenario.element_declared', 'scenario.element_retired', 'scenario.assumption_linked', 'scenario.assumption_unlinked',
  'scenario.record_added',
  -- §S sets: the set, its members, the plurality check, the portfolio review, relevance, proposals
  'scenario.set_member_added', 'scenario.set_member_removed', 'scenario.relevance_scored', 'scenario.signpost_notified', 'scenario.proposed', 'scenario.proposal_resolved',
  -- §Q quality: the evaluation, the governed probability
  'scenario.quality_evaluated', 'branch.probability_set', 'branch.probability_withdrawn'));

-- §0.3 THE ATTENTION CLASSES AND SUBJECT KINDS (0095 §0.2's lists whole, plus B27's)
CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  -- B34 (0090)
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  -- B36 (0094)
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  -- B90 (0095)
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  -- B27 (0097)
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance',
  'product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage',
  'scenario.suspension', 'scenario.set_gap', 'scenario.quality', 'scenario.signpost', 'scenario.proposal'));
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_subject_kind_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (
  'forecast', 'scenario', 'warning', 'source', 'claim', 'package', 'review',
  'exposure', 'health_change', 'commitment_item',
  'plan', 'publication', 'strategy_object', 'queue',
  'product', 'subscription', 'metric', 'asset',
  -- B27 (0097)
  'branch', 'scenario_set'));
