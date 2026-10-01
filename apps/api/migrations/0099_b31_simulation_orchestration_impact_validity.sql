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

-- ═════════════════════════════════════════════════════════════════════
-- section `impact` (§I) — CP-6 B31 part `impact` (2026-10-01): F-P5-07 (impact analysis: sensitivity and robustness, second-order,
-- distributional and timing effects, value of information, the approved frequency-to-probability mapping) and F-P4-08's comparator
-- sensitivity (CAP-DS-02). Rows V00-T-062, V01-T-016, V02-T-082/-167, L8-C07, L8-C08, V03-T-348, AI-50-004/-005, IR-17-003.
--
-- Forward-only; 0033–0098 and the §0 prelude untouched (the prelude's attention class simulation.value_of_information and subject kinds
-- USED, never re-declared). The exact run-event vocabulary (simulation.run_events) is NOT widened: every analysis is its own record.
-- The ONE re-declaration of another stage's function: prediction.scenario_set_compare (0097 §S.3), copied whole, adding the per-branch
-- sensitivity evidence and `sensitivity_available` (marked).
--
-- THE SPLIT OF WORK. A sensitivity sweep and a second-order derivation EXECUTE the pinned model (the service, outside any write — the
-- B29 rule) and the ports here RECORD them, binding the run's outputs digest and checking every shape a port can check (the ranks agree
-- with the swings, the basis links are live and reach from the run's twin, the robustness verdict agrees with the ranks). The value of
-- information and the probability statement are COMPUTED IN THE PORT from governed records (the branch probabilities of 0097 §Q, the
-- portfolio review's matrix, an ACTIVE frequency map) — never from the caller's numbers where a governed record exists.
-- Tables in schema simulation (none in prediction: phase4-acceptance D8's FORCE-RLS count of the prediction schema does not move).
-- ═════════════════════════════════════════════════════════════════════

-- §I.1 THE TABLES ─────────────────────────────────────────────────────────
CREATE TABLE simulation.sensitivity_analyses (
  analysis_id           uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  run_id                uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  run_outputs_digest    text NOT NULL CHECK (run_outputs_digest ~ '^[0-9a-f]{64}$'),
  model_ref             text NOT NULL,
  implementation_digest text NOT NULL CHECK (implementation_digest ~ '^[0-9a-f]{64}$'),
  method                text NOT NULL CHECK (method = 'one_at_a_time'),
  metric                text NOT NULL CHECK (metric ~ '^[a-z][a-z0-9_.]{0,63}$'),
  relative              numeric NOT NULL CHECK (relative > 0 AND relative <= 1),
  base_value            numeric NOT NULL,
  /* [{key (the twin element key or the parameter path), field, kind (parameter | timing), base_value, low {value, metric}, high {value, metric},
       delta_low, delta_high, swing, rank, outside_envelope}] — ranked by swing (rank 1 the widest bar of the tornado) */
  factors               jsonb NOT NULL CHECK (jsonb_typeof(factors) = 'array' AND jsonb_array_length(factors) >= 1),
  seeds                 int[],
  /* {verdict, samples, jitter, ranks: {seed: [keys in rank order]}, stable: [...], unstable: [{key, ranks}]} — or {verdict: not_assessed} */
  robustness            jsonb NOT NULL CHECK (jsonb_typeof(robustness) = 'object'),
  robustness_verdict    text NOT NULL CHECK (robustness_verdict IN ('stable', 'unstable', 'not_assessed')),
  timing_shift_days     int CHECK (timing_shift_days IS NULL OR timing_shift_days BETWEEN 1 AND 90),
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  synthetic_state       boolean NOT NULL,
  requested_by          uuid NOT NULL,
  analysed_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT sii_sa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sii_sa_seeds CHECK ((seeds IS NULL) = (robustness_verdict = 'not_assessed') AND (seeds IS NULL OR cardinality(seeds) >= 3))
);
CREATE INDEX sii_sa_run ON simulation.sensitivity_analyses (run_id, analysed_at DESC);
CREATE TRIGGER sii_sa_append_only BEFORE UPDATE OR DELETE ON simulation.sensitivity_analyses FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE simulation.sensitivity_analyses IS 'B31 §I (0099; L8-C08, V00-T-062, V02-T-081): a SENSITIVITY ANALYSIS product of a completed valid run — one-at-a-time over its parameters (and the timing of its dated interventions: sequencing sensitivity), ranked by swing (the tornado), with ROBUSTNESS across at least three seeds (stable / unstable named per factor); executed by the pinned model, recorded with the run''s outputs digest; append-only.';

CREATE TABLE simulation.second_order_effects (
  effect_id          uuid PRIMARY KEY,
  derivation_id      uuid NOT NULL,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  run_id             uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  run_outputs_digest text NOT NULL CHECK (run_outputs_digest ~ '^[0-9a-f]{64}$'),
  depth              int NOT NULL CHECK (depth BETWEEN 0 AND 4),
  entity_twin_id     uuid NOT NULL REFERENCES twin.twins_current (twin_id),
  entity_label       text NOT NULL CHECK (length(btrim(entity_label)) BETWEEN 1 AND 256),
  via_link_id        uuid REFERENCES twin.twin_links (link_id),
  metric             text NOT NULL CHECK (metric IN ('line_stop_days_added', 'delivery_date_shift_days')),
  unit               text NOT NULL,
  /* {p10, p50, p90, deterministic} — the distribution over the run's samples (paired with the counterfactual's), or one value thrice */
  "values"           jsonb NOT NULL CHECK (jsonb_typeof("values") = 'object'),
  /* {first_affected, back_to_plan, recovery_days, headroom, reason} — the timing effect */
  timing             jsonb NOT NULL CHECK (jsonb_typeof(timing) = 'object'),
  /* {rule: second-order@1, counterfactual, mapping, capacity, demand} — what was traversed and how */
  basis              jsonb NOT NULL CHECK (jsonb_typeof(basis) = 'object'),
  synthetic_state    boolean NOT NULL,
  derived_by         uuid NOT NULL,
  derived_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT sii_so_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sii_so_link CHECK ((depth = 0) = (via_link_id IS NULL)),
  CONSTRAINT sii_so_metric CHECK ((depth = 0) = (metric = 'line_stop_days_added'))
);
CREATE INDEX sii_so_run ON simulation.second_order_effects (run_id, derived_at DESC);
CREATE INDEX sii_so_derivation ON simulation.second_order_effects (derivation_id, depth);
CREATE TRIGGER sii_so_append_only BEFORE UPDATE OR DELETE ON simulation.second_order_effects FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE simulation.second_order_effects IS 'B31 §I (0099; L8-C07, V02-T-082/-167, V03-T-348): ENGINE-PRODUCED second-order, distributional and timing effects of a completed run — the run''s own lost production days against its counterfactual (the stored contract re-executed without the shock) and the delivery-date shift carried over every live twin link from the run''s twin (0092 §A), per percentile, with the recovery the downstream twin''s declared capacity headroom allows (rule second-order@1); one row per entity per derivation; append-only.';

CREATE TABLE simulation.voi_assessments (
  assessment_id      uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_id         uuid REFERENCES decision.packages_current (package_id),
  package_version    int,
  scenario_id        uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  source             text NOT NULL CHECK (source IN ('portfolio_review', 'entered')),
  review_id          uuid REFERENCES prediction.portfolio_reviews (review_id),
  /* [{branch_id, name, kind, probability_id, low, high, method, weight}] — the GOVERNED probabilities, the weights their normalised mid-points */
  branches           jsonb NOT NULL CHECK (jsonb_typeof(branches) = 'array' AND jsonb_array_length(branches) >= 2),
  options            jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2),
  payoffs            jsonb NOT NULL CHECK (jsonb_typeof(payoffs) = 'object'),
  payoff_unit        text NOT NULL CHECK (length(btrim(payoff_unit)) BETWEEN 1 AND 64),
  payoff_basis       text NOT NULL CHECK (length(btrim(payoff_basis)) >= 16),
  /* {label, delay_days, delay_cost, signals: [{key, label, likelihoods: {branch_id: P(signal | branch)}}], likelihood_basis} */
  information        jsonb NOT NULL CHECK (jsonb_typeof(information) = 'object'),
  prior_best         text[] NOT NULL,
  ev_now             numeric NOT NULL,
  ev_perfect         numeric NOT NULL,
  evpi               numeric NOT NULL CHECK (evpi >= 0),
  evsi               numeric NOT NULL CHECK (evsi >= 0),
  delay_cost         numeric NOT NULL CHECK (delay_cost >= 0),
  net_value          numeric NOT NULL,
  /* [{key, label, p_signal, posterior: {branch_id: p}, best: [...], ev}] */
  posteriors         jsonb NOT NULL CHECK (jsonb_typeof(posteriors) = 'array'),
  recommendation     text NOT NULL CHECK (recommendation IN ('wait', 'act')),
  item_id            uuid,
  synthetic_state    boolean NOT NULL DEFAULT true,
  recorded_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT sii_voi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sii_voi_package CHECK ((package_id IS NULL) = (package_version IS NULL)),
  CONSTRAINT sii_voi_source CHECK ((source = 'portfolio_review') = (review_id IS NOT NULL)),
  CONSTRAINT sii_voi_bounds CHECK (evsi <= evpi + 0.000001),
  CONSTRAINT sii_voi_recommendation CHECK ((recommendation = 'wait') = (net_value > 0))
);
CREATE INDEX sii_voi_package ON simulation.voi_assessments (package_id, recorded_at DESC);
CREATE INDEX sii_voi_scenario ON simulation.voi_assessments (scenario_id, recorded_at DESC);
CREATE TRIGGER sii_voi_append_only BEFORE UPDATE OR DELETE ON simulation.voi_assessments FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE simulation.voi_assessments IS 'B31 §I (0099; V01-T-016 "identify information whose acquisition would most improve the decision", V02-T-167): a VALUE-OF-INFORMATION assessment by a named human — the futures weighted ONLY by their governed branch probabilities (0097 §Q; refused when a branch has none — narrative never), the option × branch payoffs from a portfolio review or entered with their basis, the candidate information with its stated likelihood model; EVPI, EVSI, the delay cost and the recommendation (wait | act) computed by the port; a wait routed to the package owner (simulation.value_of_information); append-only.';

CREATE TABLE simulation.probability_statements (
  statement_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  run_id             uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  run_outputs_digest text NOT NULL CHECK (run_outputs_digest ~ '^[0-9a-f]{64}$'),
  map_id             uuid NOT NULL REFERENCES prediction.frequency_probability_maps (map_id),
  map_name           text NOT NULL,
  map_version        int NOT NULL,
  map_horizon        text NOT NULL,
  /* {metric, op, threshold, label} — the event counted over the run's samples */
  event              jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'),
  samples            int NOT NULL CHECK (samples >= 30),
  occurrences        int NOT NULL CHECK (occurrences >= 0 AND occurrences <= samples),
  horizon_days       int NOT NULL CHECK (horizon_days BETWEEN 1 AND 365),
  frequency          numeric NOT NULL CHECK (frequency BETWEEN 0 AND 1),
  per_year           numeric NOT NULL CHECK (per_year >= 0),
  conversion         text NOT NULL,
  band               jsonb NOT NULL CHECK (jsonb_typeof(band) = 'object'),
  probability_low    numeric NOT NULL CHECK (probability_low BETWEEN 0 AND 1),
  probability_high   numeric NOT NULL CHECK (probability_high BETWEEN 0 AND 1 AND probability_high >= probability_low),
  synthetic_state    boolean NOT NULL,
  stated_by          uuid NOT NULL,
  stated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT sii_ps_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sii_ps_run ON simulation.probability_statements (run_id, stated_at DESC);
CREATE TRIGGER sii_ps_append_only BEFORE UPDATE OR DELETE ON simulation.probability_statements FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE simulation.probability_statements IS 'B31 §I (0099; AI-50-005): a run''s SIMULATED FREQUENCY expressed as a probability ONLY through an ACTIVE frequency map (0097 §Q, named, versioned, owned by a named human) — the event counted over the run''s samples, the stated conversion to a yearly frequency, the map''s band; refused without a map, on a deterministic or thin run, on an invalidated one; a named human''s statement; append-only.';

-- RLS and grants: the 0081 loop idiom (policy simulation_isolation; GRANT SELECT TO eye_app, eye_commit); the ports write (no UPDATE/DELETE grant).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sensitivity_analyses', 'second_order_effects', 'voi_assessments', 'probability_statements'] LOOP
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

-- §I.2 THE SHARED CHECK (private: no grant) ────────────────────────────────
/* The run an analysis rests on: of this domain (unknown_run 404), COMPLETED (a partial, failed or opened run is not analysed: state 409 —
   a partial run is diagnostic only, §V), VALID (an invalidated result is not analysed: state 409), its outputs the ones the service
   analysed (a different digest: stale 409). */
CREATE OR REPLACE FUNCTION simulation.sii_run_for_analysis(p_family text, p_tenant uuid, p_domain uuid, p_run_id uuid, p_outputs_digest text) RETURNS simulation.runs_current
SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE;
BEGIN
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_run): % is not a simulation run of this domain', p_family, p_run_id USING ERRCODE = '23503'; END IF;
  IF r.state <> 'completed' THEN
    RAISE EXCEPTION '% rejected (state): run % is %; only a completed run is analysed (a partial run is diagnostic only)', p_family, p_run_id, r.state USING ERRCODE = '22023';
  END IF;
  IF r.validity = 'invalidated' THEN
    RAISE EXCEPTION '% rejected (state): run % was invalidated at %; an invalidated result is not analysed', p_family, p_run_id, r.invalidated_at USING ERRCODE = '22023';
  END IF;
  IF p_outputs_digest IS NULL OR r.outputs_digest IS DISTINCT FROM p_outputs_digest THEN
    RAISE EXCEPTION '% rejected (stale): the analysis was computed over outputs % and run % holds %', p_family, coalesce(left(p_outputs_digest, 12), '<none>'), p_run_id, left(coalesce(r.outputs_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  RETURN r;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sii_run_for_analysis(text,uuid,uuid,uuid,text) FROM PUBLIC;

-- §I.3 THE PORTS ───────────────────────────────────────────────────────────
/* ANALYSE SENSITIVITY (simulation.impact.sensitivity): RECORD the one-at-a-time sweep the service executed with the pinned model over a
   completed valid run. The port checks what a port can: the run (sii_run_for_analysis), the metric, the relative step, every factor's
   shape, that each swing IS the larger of its two deltas from the base, that the ranks ARE the order of the swings (rank 1 the widest),
   and the robustness record — at least three distinct seeds, a rank order for each, the verdict `stable` exactly when no factor's rank
   moved across the seeds. The analysis is the requester's (the acting principal, recorded). */
CREATE OR REPLACE FUNCTION simulation.analyse_sensitivity(
  p_analysis_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_outputs_digest text, p_metric text, p_relative numeric, p_base numeric,
  p_factors jsonb, p_seeds int[], p_robustness jsonb, p_timing_shift_days int, p_digest text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; f jsonb; n int := 0; v_prev numeric; v_swing numeric; v_dl numeric; v_dh numeric; v_verdict text; v_keys text[]; s int; v_order jsonb;
        v_unstable jsonb := '[]'::jsonb; k text; v_ranks jsonb; v_out simulation.sensitivity_analyses%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.impact.sensitivity']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'impact analysis rejected (actor): an analysis is requested by the acting principal' USING ERRCODE = '42501'; END IF;
  r := simulation.sii_run_for_analysis('impact analysis', p_tenant, p_domain, p_run_id, p_outputs_digest);
  IF p_metric IS NULL OR p_metric !~ '^[a-z][a-z0-9_.]{0,63}$' THEN RAISE EXCEPTION 'impact analysis rejected (metric): the metric is a named output of the run' USING ERRCODE = '22023'; END IF;
  IF p_relative IS NULL OR p_relative <= 0 OR p_relative > 1 THEN RAISE EXCEPTION 'impact analysis rejected (relative): the step is a fraction in (0, 1]' USING ERRCODE = '22023'; END IF;
  IF p_base IS NULL THEN RAISE EXCEPTION 'impact analysis rejected (factors): the base value of the metric is stated' USING ERRCODE = '22023'; END IF;
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'impact analysis rejected (digest): the analysis carries its digest' USING ERRCODE = '22023'; END IF;
  IF p_factors IS NULL OR jsonb_typeof(p_factors) <> 'array' OR jsonb_array_length(p_factors) = 0 THEN
    RAISE EXCEPTION 'impact analysis rejected (factors): the run carries no perturbable parameter; nothing to rank' USING ERRCODE = '22023';
  END IF;
  FOR f IN SELECT x FROM jsonb_array_elements(p_factors) x LOOP
    n := n + 1;
    IF jsonb_typeof(f) <> 'object' OR jsonb_typeof(f -> 'key') IS DISTINCT FROM 'string' OR coalesce(f ->> 'kind', '') NOT IN ('parameter', 'timing')
       OR jsonb_typeof(f #> '{low,metric}') IS DISTINCT FROM 'number' OR jsonb_typeof(f #> '{high,metric}') IS DISTINCT FROM 'number'
       OR jsonb_typeof(f -> 'swing') IS DISTINCT FROM 'number' OR jsonb_typeof(f -> 'rank') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'impact analysis rejected (factors): factor % names its key, kind (parameter | timing), low and high {value, metric}, swing and rank', n USING ERRCODE = '22023';
    END IF;
    v_dl := (f #>> '{low,metric}')::numeric - p_base; v_dh := (f #>> '{high,metric}')::numeric - p_base;
    v_swing := (f ->> 'swing')::numeric;
    IF abs(v_swing - greatest(abs(v_dl), abs(v_dh))) > 0.000001 THEN
      RAISE EXCEPTION 'impact analysis rejected (factors): factor % (%) states a swing of %, its deltas from the base are % and %', n, f ->> 'key', v_swing, v_dl, v_dh USING ERRCODE = '22023';
    END IF;
    IF (f ->> 'rank')::numeric <> n OR (v_prev IS NOT NULL AND v_swing > v_prev + 0.000001) THEN
      RAISE EXCEPTION 'impact analysis rejected (factors): factor % (%) is ranked % — the ranks are the order of the swings, widest first', n, f ->> 'key', f ->> 'rank' USING ERRCODE = '22023';
    END IF;
    v_prev := v_swing;
  END LOOP;
  IF (SELECT count(DISTINCT x ->> 'key') FROM jsonb_array_elements(p_factors) x) <> n THEN RAISE EXCEPTION 'impact analysis rejected (factors): each factor once' USING ERRCODE = '22023'; END IF;
  v_keys := ARRAY(SELECT x ->> 'key' FROM jsonb_array_elements(p_factors) x);
  -- ROBUSTNESS: none (not_assessed), or ≥ 3 distinct seeds each with a complete rank order; the verdict follows the ranks
  IF p_robustness IS NULL OR jsonb_typeof(p_robustness) <> 'object' THEN RAISE EXCEPTION 'impact analysis rejected (robustness): the robustness record is an object' USING ERRCODE = '22023'; END IF;
  IF p_seeds IS NULL THEN
    IF coalesce(p_robustness ->> 'verdict', '') <> 'not_assessed' THEN RAISE EXCEPTION 'impact analysis rejected (robustness): without seeds the robustness is not_assessed' USING ERRCODE = '22023'; END IF;
    v_verdict := 'not_assessed';
  ELSE
    IF cardinality(p_seeds) < 3 OR cardinality(p_seeds) <> (SELECT count(DISTINCT x) FROM unnest(p_seeds) x) THEN
      RAISE EXCEPTION 'impact analysis rejected (robustness): robustness is judged across at least three distinct seeds (% given)', cardinality(p_seeds) USING ERRCODE = '22023';
    END IF;
    v_ranks := p_robustness -> 'ranks';
    IF v_ranks IS NULL OR jsonb_typeof(v_ranks) <> 'object' THEN RAISE EXCEPTION 'impact analysis rejected (robustness): the record carries the rank order per seed' USING ERRCODE = '22023'; END IF;
    FOREACH s IN ARRAY p_seeds LOOP
      v_order := v_ranks -> s::text;
      IF v_order IS NULL OR jsonb_typeof(v_order) <> 'array' OR jsonb_array_length(v_order) <> n
         OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_order) x WHERE x <> ALL (v_keys)) THEN
        RAISE EXCEPTION 'impact analysis rejected (robustness): seed % carries no complete rank order of the % factors', s, n USING ERRCODE = '22023';
      END IF;
    END LOOP;
    -- a factor is STABLE when its rank is the same under every seed
    FOREACH k IN ARRAY v_keys LOOP
      IF (SELECT count(DISTINCT pos) FROM (SELECT (SELECT o.ord FROM jsonb_array_elements_text(v_ranks -> sd::text) WITH ORDINALITY o(key, ord) WHERE o.key = k) AS pos FROM unnest(p_seeds) sd) q) > 1 THEN
        v_unstable := v_unstable || jsonb_build_object('key', k, 'ranks', (SELECT jsonb_object_agg(sd::text, (SELECT o.ord FROM jsonb_array_elements_text(v_ranks -> sd::text) WITH ORDINALITY o(key, ord) WHERE o.key = k)) FROM unnest(p_seeds) sd));
      END IF;
    END LOOP;
    v_verdict := CASE WHEN jsonb_array_length(v_unstable) = 0 THEN 'stable' ELSE 'unstable' END;
    IF coalesce(p_robustness ->> 'verdict', '') <> v_verdict THEN
      RAISE EXCEPTION 'impact analysis rejected (robustness): the ranks across the seeds make the verdict %, the record says %', v_verdict, coalesce(p_robustness ->> 'verdict', '<none>') USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO simulation.sensitivity_analyses (analysis_id, scope, tenant_id, domain_id, run_id, run_outputs_digest, model_ref, implementation_digest, method, metric, relative, base_value, factors,
                                              seeds, robustness, robustness_verdict, timing_shift_days, digest, synthetic_state, requested_by, correlation_id)
  VALUES (p_analysis_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_outputs_digest, r.model_ref, r.implementation_digest, 'one_at_a_time', p_metric, p_relative, p_base, p_factors,
          p_seeds, p_robustness || jsonb_build_object('verdict', v_verdict, 'unstable', v_unstable,
                                                      'stable', to_jsonb(ARRAY(SELECT k2 FROM unnest(v_keys) k2 WHERE p_seeds IS NOT NULL AND NOT (v_unstable @> jsonb_build_array(jsonb_build_object('key', k2)))))),
          v_verdict, p_timing_shift_days, p_digest, true, p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.analyse_sensitivity(uuid,uuid,uuid,uuid,text,text,numeric,numeric,jsonb,int[],jsonb,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.analyse_sensitivity(uuid,uuid,uuid,uuid,text,text,numeric,numeric,jsonb,int[],jsonb,int,text,uuid,uuid) TO eye_commit;

/* DERIVE SECOND-ORDER EFFECTS (simulation.impact.second_order): RECORD what the service derived (rule second-order@1) from a completed
   valid run. The port checks the REACH: the run's twin is the entity at depth 0 (its lost production days); every other effect names a LIVE
   link whose downstream is its entity and whose upstream is an entity one level up in this derivation (the run's twin at depth 1); and
   the set of links traversed IS the set of live links reachable from the run's twin (to depth 4) — an analysis that leaves a linked twin
   out is refused (reach). A run whose twin feeds no live link has no second-order reach (links). Every value carries p10 ≤ p50 ≤ p90. */
CREATE OR REPLACE FUNCTION simulation.derive_second_order_effects(
  p_derivation_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_outputs_digest text, p_effects jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; e jsonb; n int := 0; l twin.twin_links%ROWTYPE; v_depth int; v_entity uuid; v_link uuid; v_reach uuid[]; v_given uuid[] := ARRAY[]::uuid[];
        v_label text; v_rows jsonb := '[]'::jsonb; v_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.impact.second_order']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'impact analysis rejected (actor): a derivation is requested by the acting principal' USING ERRCODE = '42501'; END IF;
  r := simulation.sii_run_for_analysis('impact analysis', p_tenant, p_domain, p_run_id, p_outputs_digest);
  WITH RECURSIVE reach(link_id, twin_id, depth) AS (
    SELECT x.link_id, x.downstream_twin_id, 1 FROM twin.twin_links x WHERE x.upstream_twin_id = r.twin_id AND x.state = 'live' AND x.tenant_id = p_tenant AND x.domain_id = p_domain
    UNION
    SELECT x.link_id, x.downstream_twin_id, reach.depth + 1 FROM twin.twin_links x JOIN reach ON x.upstream_twin_id = reach.twin_id WHERE x.state = 'live' AND reach.depth < 4)
  SELECT coalesce(array_agg(DISTINCT link_id), ARRAY[]::uuid[]) INTO v_reach FROM reach;
  IF cardinality(v_reach) = 0 THEN
    RAISE EXCEPTION 'impact analysis rejected (links): twin % feeds no live twin link; a run has no second-order reach until a downstream twin declares a link (0092 §A)', r.twin_id USING ERRCODE = '22023';
  END IF;
  IF p_effects IS NULL OR jsonb_typeof(p_effects) <> 'array' OR jsonb_array_length(p_effects) < 2 THEN
    RAISE EXCEPTION 'impact analysis rejected (effects): a derivation states the run''s own effect and at least one downstream effect' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_effects) x LOOP
    n := n + 1;
    IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'depth') IS DISTINCT FROM 'number' OR coalesce(e ->> 'entity_twin_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(e -> 'values') IS DISTINCT FROM 'object' OR jsonb_typeof(e #> '{values,p10}') IS DISTINCT FROM 'number' OR jsonb_typeof(e #> '{values,p50}') IS DISTINCT FROM 'number'
       OR jsonb_typeof(e #> '{values,p90}') IS DISTINCT FROM 'number' OR jsonb_typeof(e -> 'timing') IS DISTINCT FROM 'object' OR jsonb_typeof(e -> 'basis') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'impact analysis rejected (effects): effect % names its depth, entity_twin_id, values {p10, p50, p90}, timing and basis', n USING ERRCODE = '22023';
    END IF;
    IF (e #>> '{values,p10}')::numeric > (e #>> '{values,p50}')::numeric OR (e #>> '{values,p50}')::numeric > (e #>> '{values,p90}')::numeric THEN
      RAISE EXCEPTION 'impact analysis rejected (effects): effect % states p10 %, p50 %, p90 % — not in order', n, e #>> '{values,p10}', e #>> '{values,p50}', e #>> '{values,p90}' USING ERRCODE = '22023';
    END IF;
    v_depth := (e ->> 'depth')::int; v_entity := (e ->> 'entity_twin_id')::uuid;
    IF v_depth = 0 THEN
      IF v_entity <> r.twin_id OR e ? 'via_link_id' AND e ->> 'via_link_id' IS NOT NULL THEN
        RAISE EXCEPTION 'impact analysis rejected (effects): the effect at depth 0 is the run''s own twin %, reached by no link', r.twin_id USING ERRCODE = '22023';
      END IF;
    ELSE
      IF v_depth < 1 OR v_depth > 4 OR coalesce(e ->> 'via_link_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'impact analysis rejected (effects): effect % at depth % names the link it was reached by (depth 1 to 4)', n, v_depth USING ERRCODE = '22023';
      END IF;
      v_link := (e ->> 'via_link_id')::uuid;
      SELECT * INTO l FROM twin.twin_links x WHERE x.link_id = v_link AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND THEN RAISE EXCEPTION 'impact analysis rejected (unknown_link): % is not a twin link of this domain', v_link USING ERRCODE = '23503'; END IF;
      IF l.state <> 'live' OR l.downstream_twin_id <> v_entity THEN
        RAISE EXCEPTION 'impact analysis rejected (reach): link % is % and leads to %, not to the effect''s twin %', v_link, l.state, l.downstream_twin_id, v_entity USING ERRCODE = '22023';
      END IF;
      IF NOT ((v_depth = 1 AND l.upstream_twin_id = r.twin_id)
              OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_effects) u WHERE (u ->> 'depth')::int = v_depth - 1 AND (u ->> 'entity_twin_id')::uuid = l.upstream_twin_id)) THEN
        RAISE EXCEPTION 'impact analysis rejected (reach): link % starts at twin %, which no effect one level up names', v_link, l.upstream_twin_id USING ERRCODE = '22023';
      END IF;
      IF v_link = ANY (v_given) THEN RAISE EXCEPTION 'impact analysis rejected (reach): link % is traversed twice', v_link USING ERRCODE = '22023'; END IF;
      v_given := v_given || v_link;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(p_effects) x WHERE (x ->> 'depth')::int = 0) <> 1 THEN
    RAISE EXCEPTION 'impact analysis rejected (effects): exactly one effect is the run''s own (depth 0)' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_reach) x WHERE x <> ALL (v_given)) THEN
    RAISE EXCEPTION 'impact analysis rejected (reach): live link % reaches from twin % and is not traversed; a derivation covers every linked twin', (SELECT x FROM unnest(v_reach) x WHERE x <> ALL (v_given) LIMIT 1), r.twin_id USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_given) x WHERE x <> ALL (v_reach)) THEN
    RAISE EXCEPTION 'impact analysis rejected (reach): link % does not reach from twin % over live links', (SELECT x FROM unnest(v_given) x WHERE x <> ALL (v_reach) LIMIT 1), r.twin_id USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_effects) x ORDER BY (x ->> 'depth')::int LOOP
    SELECT t.title INTO v_label FROM twin.twins_current t WHERE t.twin_id = (e ->> 'entity_twin_id')::uuid;
    v_id := gen_random_uuid();
    INSERT INTO simulation.second_order_effects (effect_id, derivation_id, scope, tenant_id, domain_id, run_id, run_outputs_digest, depth, entity_twin_id, entity_label, via_link_id, metric, unit,
                                                "values", timing, basis, synthetic_state, derived_by, correlation_id)
    VALUES (v_id, p_derivation_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_outputs_digest, (e ->> 'depth')::int, (e ->> 'entity_twin_id')::uuid, coalesce(v_label, e ->> 'entity_twin_id'),
            CASE WHEN (e ->> 'depth')::int = 0 THEN NULL ELSE (e ->> 'via_link_id')::uuid END,
            CASE WHEN (e ->> 'depth')::int = 0 THEN 'line_stop_days_added' ELSE 'delivery_date_shift_days' END, 'days',
            e -> 'values', e -> 'timing', e -> 'basis', true, p_actor, p_correlation);
    v_rows := v_rows || jsonb_build_object('effect_id', v_id, 'depth', (e ->> 'depth')::int, 'entity_twin_id', e ->> 'entity_twin_id', 'entity_label', coalesce(v_label, e ->> 'entity_twin_id'),
                                           'via_link_id', CASE WHEN (e ->> 'depth')::int = 0 THEN NULL ELSE e ->> 'via_link_id' END,
                                           'metric', CASE WHEN (e ->> 'depth')::int = 0 THEN 'line_stop_days_added' ELSE 'delivery_date_shift_days' END,
                                           'unit', 'days', 'values', e -> 'values', 'timing', e -> 'timing', 'basis', e -> 'basis');
  END LOOP;
  RETURN jsonb_build_object('derivation_id', p_derivation_id, 'run_id', p_run_id, 'twin_id', r.twin_id, 'links_traversed', cardinality(v_given), 'effects', v_rows, 'derived_by', p_actor, 'synthetic', true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.derive_second_order_effects(uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.derive_second_order_effects(uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid) TO eye_commit;

/* ASSESS THE VALUE OF INFORMATION (simulation.impact.voi): a NAMED HUMAN's assessment, COMPUTED HERE.
     THE FUTURES — the branches of ONE scenario (a partition): p_branch_ids, or every live branch of it; each must be live and carry a
       STANDING governed probability (0097 §Q's current view) — refused when one has none (a probability is never derived from narrative,
       and never assumed here); the weights are the bands' mid-points normalised over the futures weighed (stated on the record).
     THE PAYOFFS — a portfolio review's option × branch matrix (p_review_id: its options, its unit; it must weigh every future here) or a
       matrix entered with its basis (p_options, p_payoffs, p_unit, p_payoff_basis ≥ 16 characters); when a package is named and options are
       entered, each is an option of the package's current version.
     THE INFORMATION — {label, delay_days ≥ 1, delay_cost ≥ 0 (in the payoff unit), signals [≥ 2: {key, label, likelihoods {branch_id:
       P(signal | branch)}}] — for every future the likelihoods sum to 1 —, likelihood_basis ≥ 16 characters: the likelihood model stated}.
   EV(now) = max over options of Σ w·U; EVPI = Σ w · max U − EV(now); EVSI = Σ over signals of P(s) · max over options of the posterior
   expectation − EV(now); net = EVSI − delay cost; WAIT when net > 0, else ACT. A wait on a named package routes an item
   (simulation.value_of_information) to its owner; an act closes the package's open ones. */
CREATE OR REPLACE FUNCTION simulation.assess_value_of_information(
  p_assessment_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_scenario_id uuid, p_branch_ids uuid[], p_review_id uuid,
  p_options jsonb, p_payoffs jsonb, p_unit text, p_payoff_basis text, p_information jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, prediction, decision, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; pk decision.packages_current%ROWTYPE; rv prediction.portfolio_reviews%ROWTYPE; b record; v_branch_ids uuid[]; v_branches jsonb := '[]'::jsonb;
        v_mid_sum numeric := 0; v_options jsonb; v_payoffs jsonb := '{}'::jsonb; v_unit text; v_basis text; v_keys text[]; k text; v_info jsonb := p_information; sg jsonb; v_sig_keys text[] := ARRAY[]::text[];
        v_sum numeric; v_ev numeric; v_ev_now numeric; v_best_now text[]; v_ev_perfect numeric := 0; v_evsi_acc numeric := 0; v_ps numeric; v_post jsonb; v_post_best text[]; v_post_ev numeric;
        v_posteriors jsonb := '[]'::jsonb; v_evpi numeric; v_evsi numeric; v_delay numeric; v_net numeric; v_rec text; v_item uuid; v_state text; v_due timestamptz; v_reasons jsonb; it record;
        v_max numeric; w numeric; v_source text; v_out simulation.voi_assessments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.impact.voi']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'value of information rejected (actor): an assessment is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_actor AND x.kind = 'human' AND x.status = 'active') THEN
    RAISE EXCEPTION 'value of information rejected (authority): an assessment that recommends waiting or acting is a named human''s' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'value of information rejected (unknown_scenario): % is not a scenario of this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'value of information rejected (state): scenario % is %; the futures of an active scenario are weighed', p_scenario_id, s.state USING ERRCODE = '22023'; END IF;
  IF p_package_id IS NOT NULL THEN
    SELECT * INTO pk FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'value of information rejected (unknown_package): % is not a decision package of this domain', p_package_id USING ERRCODE = '23503'; END IF;
    IF pk.current_version IS NULL THEN RAISE EXCEPTION 'value of information rejected (state): package % has no version to inform', p_package_id USING ERRCODE = '22023'; END IF;
    IF pk.state IN ('closed', 'rejected', 'withdrawn') THEN RAISE EXCEPTION 'value of information rejected (state): package % is %; information no longer changes it', p_package_id, pk.state USING ERRCODE = '22023'; END IF;
  END IF;
  -- THE FUTURES and their GOVERNED probabilities
  IF p_branch_ids IS NULL OR cardinality(p_branch_ids) = 0 THEN
    v_branch_ids := ARRAY(SELECT x.branch_id FROM prediction.branches_current x WHERE x.scenario_id = p_scenario_id AND prediction.branch_live(x.state) ORDER BY x.branch_id);
  ELSE
    v_branch_ids := ARRAY(SELECT DISTINCT x FROM unnest(p_branch_ids) x ORDER BY 1);
  END IF;
  IF cardinality(v_branch_ids) < 2 THEN RAISE EXCEPTION 'value of information rejected (branches): information has value only between at least two futures' USING ERRCODE = '22023'; END IF;
  FOR b IN SELECT x.branch_id, x.scenario_id, x.name, x.kind, x.state, c.probability_id, c.probability_low, c.probability_high, c.method
             FROM unnest(v_branch_ids) u(id) LEFT JOIN prediction.branches_current x ON x.branch_id = u.id AND x.tenant_id = p_tenant AND x.domain_id = p_domain
             LEFT JOIN prediction.branch_probabilities_current c ON c.branch_id = x.branch_id ORDER BY u.id LOOP
    IF b.branch_id IS NULL THEN RAISE EXCEPTION 'value of information rejected (unknown_branch): a named branch is not a branch of this domain' USING ERRCODE = '23503'; END IF;
    IF b.scenario_id <> p_scenario_id THEN RAISE EXCEPTION 'value of information rejected (branches): branch "%" is not a branch of scenario % — the futures weighed are one scenario''s (a partition)', b.name, p_scenario_id USING ERRCODE = '22023'; END IF;
    IF NOT prediction.branch_live(b.state) THEN RAISE EXCEPTION 'value of information rejected (state): branch "%" is %; only a live branch is weighed', b.name, b.state USING ERRCODE = '22023'; END IF;
    IF b.probability_id IS NULL THEN
      RAISE EXCEPTION 'value of information rejected (no_probability): branch "%" has no governed probability — set one by a frequency map, an elicitation or a model run (0097 §Q); a probability is never derived from narrative', b.name USING ERRCODE = '22023';
    END IF;
    v_mid_sum := v_mid_sum + (b.probability_low + b.probability_high) / 2;
    v_branches := v_branches || jsonb_build_object('branch_id', b.branch_id, 'name', b.name, 'kind', b.kind, 'probability_id', b.probability_id, 'low', b.probability_low, 'high', b.probability_high,
                                                   'method', b.method, 'mid', (b.probability_low + b.probability_high) / 2);
  END LOOP;
  IF v_mid_sum <= 0 THEN RAISE EXCEPTION 'value of information rejected (no_probability): the governed probabilities of the futures weighed are all zero' USING ERRCODE = '22023'; END IF;
  v_branches := (SELECT jsonb_agg(x || jsonb_build_object('weight', round((x ->> 'mid')::numeric / v_mid_sum, 6)) ORDER BY x ->> 'branch_id') FROM jsonb_array_elements(v_branches) x);
  -- THE PAYOFFS: the review's matrix, or one entered with its basis
  IF p_review_id IS NOT NULL THEN
    SELECT * INTO rv FROM prediction.portfolio_reviews x WHERE x.review_id = p_review_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'value of information rejected (unknown_review): % is not a portfolio review of this domain', p_review_id USING ERRCODE = '23503'; END IF;
    IF p_options IS NOT NULL OR p_payoffs IS NOT NULL THEN RAISE EXCEPTION 'value of information rejected (payoffs): the payoffs come from the review or are entered, not both' USING ERRCODE = '22023'; END IF;
    v_options := rv.options; v_unit := rv.payoff_unit; v_source := 'portfolio_review';
    v_basis := format('portfolio review %s of set %s (v%s) by %s at %s: %s', rv.review_id, rv.set_id, rv.set_version, rv.reviewer, rv.reviewed_at, rv.note);
    v_keys := ARRAY(SELECT x ->> 'key' FROM jsonb_array_elements(v_options) x);
    FOREACH k IN ARRAY v_keys LOOP
      FOR b IN SELECT unnest(v_branch_ids) AS branch_id LOOP
        IF jsonb_typeof(rv.payoffs -> k -> b.branch_id::text) IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'value of information rejected (payoffs): review % weighs no payoff for option % on branch % — weigh the futures the review covers', p_review_id, k, b.branch_id USING ERRCODE = '22023';
        END IF;
        v_payoffs := jsonb_set(CASE WHEN v_payoffs ? k THEN v_payoffs ELSE v_payoffs || jsonb_build_object(k, '{}'::jsonb) END, ARRAY[k, b.branch_id::text], rv.payoffs -> k -> b.branch_id::text);
      END LOOP;
    END LOOP;
  ELSE
    v_source := 'entered';
    IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' THEN RAISE EXCEPTION 'value of information rejected (options): the options are a list [{key, title}] (or name a portfolio review)' USING ERRCODE = '22023'; END IF;
    v_options := '[]'::jsonb;
    FOR sg IN SELECT x FROM jsonb_array_elements(p_options) x LOOP
      IF jsonb_typeof(sg) <> 'object' OR coalesce(sg ->> 'key', '') !~ '^[a-z0-9][a-z0-9_-]{0,63}$' OR length(btrim(coalesce(sg ->> 'title', ''))) NOT BETWEEN 2 AND 256 THEN
        RAISE EXCEPTION 'value of information rejected (options): each option has a key (lower-case, 1-64) and a title (2-256 characters)' USING ERRCODE = '22023';
      END IF;
      IF p_package_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decision.options o WHERE o.package_id = p_package_id AND o.version = pk.current_version AND o.key = sg ->> 'key') THEN
        RAISE EXCEPTION 'value of information rejected (unknown_option): % is not an option of package % version %', sg ->> 'key', p_package_id, pk.current_version USING ERRCODE = '23503';
      END IF;
      v_options := v_options || jsonb_build_object('key', sg ->> 'key', 'title', btrim(sg ->> 'title'));
    END LOOP;
    v_keys := ARRAY(SELECT x ->> 'key' FROM jsonb_array_elements(v_options) x);
    IF p_unit IS NULL OR length(btrim(p_unit)) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'value of information rejected (unit): the payoffs name their unit' USING ERRCODE = '22023'; END IF;
    IF p_payoff_basis IS NULL OR length(btrim(p_payoff_basis)) < 16 THEN
      RAISE EXCEPTION 'value of information rejected (basis): entered payoffs state their basis (the runs or the record they come from; at least 16 characters)' USING ERRCODE = '22023';
    END IF;
    IF p_payoffs IS NULL OR jsonb_typeof(p_payoffs) <> 'object' THEN RAISE EXCEPTION 'value of information rejected (payoffs): the payoffs are {option_key: {branch_id: number}}' USING ERRCODE = '22023'; END IF;
    FOREACH k IN ARRAY v_keys LOOP
      FOR b IN SELECT unnest(v_branch_ids) AS branch_id LOOP
        IF jsonb_typeof(p_payoffs -> k -> b.branch_id::text) IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'value of information rejected (payoffs): option % has no payoff for branch % (every option is weighed against every future)', k, b.branch_id USING ERRCODE = '22023';
        END IF;
      END LOOP;
      v_payoffs := v_payoffs || jsonb_build_object(k, (SELECT jsonb_object_agg(bb::text, p_payoffs -> k -> bb::text) FROM unnest(v_branch_ids) bb));
    END LOOP;
    v_unit := btrim(p_unit); v_basis := btrim(p_payoff_basis);
  END IF;
  IF cardinality(v_keys) < 2 OR cardinality(v_keys) <> (SELECT count(DISTINCT x) FROM unnest(v_keys) x) THEN
    RAISE EXCEPTION 'value of information rejected (options): information has value only between at least two distinct options' USING ERRCODE = '22023';
  END IF;
  -- THE INFORMATION and its likelihood model
  IF v_info IS NULL OR jsonb_typeof(v_info) <> 'object' OR length(btrim(coalesce(v_info ->> 'label', ''))) < 4
     OR jsonb_typeof(v_info -> 'delay_days') IS DISTINCT FROM 'number' OR (v_info ->> 'delay_days')::numeric < 1 OR (v_info ->> 'delay_days')::numeric <> trunc((v_info ->> 'delay_days')::numeric)
     OR jsonb_typeof(v_info -> 'delay_cost') IS DISTINCT FROM 'number' OR (v_info ->> 'delay_cost')::numeric < 0 THEN
    RAISE EXCEPTION 'value of information rejected (information): the information names its label, the whole days it takes (delay_days ≥ 1) and the cost of waiting for it (delay_cost ≥ 0, in the payoff unit)' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(v_info ->> 'likelihood_basis', ''))) < 16 THEN
    RAISE EXCEPTION 'value of information rejected (likelihood): the likelihood model is stated (likelihood_basis, at least 16 characters) — how the information would read under each future' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_info -> 'signals') IS DISTINCT FROM 'array' OR jsonb_array_length(v_info -> 'signals') < 2 THEN
    RAISE EXCEPTION 'value of information rejected (likelihood): the information can read at least two ways (signals)' USING ERRCODE = '22023';
  END IF;
  FOR sg IN SELECT x FROM jsonb_array_elements(v_info -> 'signals') x LOOP
    IF jsonb_typeof(sg) <> 'object' OR coalesce(sg ->> 'key', '') !~ '^[a-z0-9][a-z0-9_-]{0,63}$' OR jsonb_typeof(sg -> 'likelihoods') IS DISTINCT FROM 'object' OR (sg ->> 'key') = ANY (v_sig_keys) THEN
      RAISE EXCEPTION 'value of information rejected (likelihood): each signal has a distinct key and its likelihoods {branch_id: P(signal | branch)}' USING ERRCODE = '22023';
    END IF;
    v_sig_keys := v_sig_keys || (sg ->> 'key');
    FOR b IN SELECT unnest(v_branch_ids) AS branch_id LOOP
      IF jsonb_typeof(sg -> 'likelihoods' -> b.branch_id::text) IS DISTINCT FROM 'number' OR (sg -> 'likelihoods' ->> b.branch_id::text)::numeric NOT BETWEEN 0 AND 1 THEN
        RAISE EXCEPTION 'value of information rejected (likelihood): signal % states no likelihood in [0, 1] under branch %', sg ->> 'key', b.branch_id USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;
  FOR b IN SELECT unnest(v_branch_ids) AS branch_id LOOP
    SELECT sum((x -> 'likelihoods' ->> b.branch_id::text)::numeric) INTO v_sum FROM jsonb_array_elements(v_info -> 'signals') x;
    IF abs(v_sum - 1) > 0.000001 THEN
      RAISE EXCEPTION 'value of information rejected (likelihood): under branch % the signals'' likelihoods sum to %, not 1', b.branch_id, v_sum USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- THE ARITHMETIC (weights w from the governed bands; U from the matrix)
  v_ev_now := NULL;
  FOREACH k IN ARRAY v_keys LOOP
    SELECT sum((x ->> 'weight')::numeric * (v_payoffs -> k ->> (x ->> 'branch_id'))::numeric) INTO v_ev FROM jsonb_array_elements(v_branches) x;
    IF v_ev_now IS NULL OR v_ev > v_ev_now + 0.000000001 THEN v_ev_now := v_ev; v_best_now := ARRAY[k];
    ELSIF abs(v_ev - v_ev_now) <= 0.000000001 THEN v_best_now := v_best_now || k; END IF;
  END LOOP;
  FOR b IN SELECT x ->> 'branch_id' AS branch_id, (x ->> 'weight')::numeric AS weight FROM jsonb_array_elements(v_branches) x LOOP
    SELECT max((v_payoffs -> kk ->> b.branch_id)::numeric) INTO v_max FROM unnest(v_keys) kk;
    v_ev_perfect := v_ev_perfect + b.weight * v_max;
  END LOOP;
  FOR sg IN SELECT x FROM jsonb_array_elements(v_info -> 'signals') x LOOP
    SELECT sum((x ->> 'weight')::numeric * (sg -> 'likelihoods' ->> (x ->> 'branch_id'))::numeric) INTO v_ps FROM jsonb_array_elements(v_branches) x;
    IF v_ps <= 0 THEN
      v_posteriors := v_posteriors || jsonb_build_object('key', sg ->> 'key', 'label', sg ->> 'label', 'p_signal', 0, 'posterior', NULL, 'best', '[]'::jsonb, 'ev', NULL);
      CONTINUE;
    END IF;
    SELECT jsonb_object_agg(x ->> 'branch_id', round((x ->> 'weight')::numeric * (sg -> 'likelihoods' ->> (x ->> 'branch_id'))::numeric / v_ps, 6)) INTO v_post FROM jsonb_array_elements(v_branches) x;
    v_post_ev := NULL; v_post_best := ARRAY[]::text[];
    FOREACH k IN ARRAY v_keys LOOP
      SELECT sum((x ->> 'weight')::numeric * (sg -> 'likelihoods' ->> (x ->> 'branch_id'))::numeric / v_ps * (v_payoffs -> k ->> (x ->> 'branch_id'))::numeric) INTO v_ev FROM jsonb_array_elements(v_branches) x;
      IF v_post_ev IS NULL OR v_ev > v_post_ev + 0.000000001 THEN v_post_ev := v_ev; v_post_best := ARRAY[k];
      ELSIF abs(v_ev - v_post_ev) <= 0.000000001 THEN v_post_best := v_post_best || k; END IF;
    END LOOP;
    v_evsi_acc := v_evsi_acc + v_ps * v_post_ev;
    v_posteriors := v_posteriors || jsonb_build_object('key', sg ->> 'key', 'label', coalesce(sg ->> 'label', sg ->> 'key'), 'p_signal', round(v_ps, 6), 'posterior', v_post, 'best', to_jsonb(v_post_best), 'ev', round(v_post_ev, 6));
  END LOOP;
  v_evpi := round(greatest(v_ev_perfect - v_ev_now, 0), 6);
  v_evsi := round(greatest(v_evsi_acc - v_ev_now, 0), 6);
  v_delay := (v_info ->> 'delay_cost')::numeric;
  v_net := round(v_evsi - v_delay, 6);
  v_rec := CASE WHEN v_net > 0 THEN 'wait' ELSE 'act' END;
  v_info := jsonb_build_object('label', btrim(v_info ->> 'label'), 'delay_days', (v_info ->> 'delay_days')::int, 'delay_cost', v_delay, 'signals', v_info -> 'signals', 'likelihood_basis', btrim(v_info ->> 'likelihood_basis'));
  -- THE ROUTE: a wait on a named package is the owner's to read (simulation.value_of_information); an act closes the package's open ones
  IF p_package_id IS NOT NULL AND v_rec = 'wait' THEN
    v_item := gen_random_uuid();
    v_state := CASE WHEN EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = pk.owner_principal_id AND x.kind = 'human' AND x.status = 'active') THEN 'open' ELSE 'unrouted' END;
    v_due := clock_timestamp() + make_interval(days => (v_info ->> 'delay_days')::int);
    v_reasons := jsonb_build_array(
      format('waiting %s day(s) for "%s" is worth %s %s against a delay cost of %s (EVSI; EVPI %s) — the governed probabilities of %s future(s) weighted', (v_info ->> 'delay_days'), v_info ->> 'label', v_evsi, v_unit, v_delay, v_evpi, cardinality(v_branch_ids)),
      format('acting now would choose %s; the information could change the choice', array_to_string(v_best_now, ', ')));
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'simulation.value_of_information', 'package', p_package_id, p_assessment_id, 'ValueOfInformationAssessed',
            left(format('Worth waiting for: %s — %s (net %s %s)', v_info ->> 'label', pk.title, v_net, v_unit), 512), 'material', v_state, pk.owner_principal_id, '{}',
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
            jsonb_build_object('assessment_id', p_assessment_id, 'package_id', p_package_id, 'scenario_id', p_scenario_id, 'evpi', v_evpi, 'evsi', v_evsi, 'delay_cost', v_delay, 'net_value', v_net,
                               'recommendation', v_rec, 'information', v_info ->> 'label', 'delay_days', (v_info ->> 'delay_days')::int, 'synthetic', true),
            v_due, 0, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
              jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', pk.owner_principal_id, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                                 'cause_event_id', p_assessment_id, 'cause_event_type', 'ValueOfInformationAssessed', 'unrouted', v_state = 'unrouted', 'package_id', p_package_id), p_correlation);
  ELSIF p_package_id IS NOT NULL THEN
    FOR it IN SELECT item_id FROM executive.attention_items x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.signal_class = 'simulation.value_of_information' AND x.subject_id = p_package_id AND x.state <> 'closed' LOOP
      UPDATE executive.attention_items SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, suppressed_until = NULL, updated_at = clock_timestamp() WHERE item_id = it.item_id;
      PERFORM executive.attention_event(it.item_id, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('reason', 'a later value-of-information assessment recommends acting now', 'assessment_id', p_assessment_id), p_correlation);
    END LOOP;
  END IF;
  INSERT INTO simulation.voi_assessments (assessment_id, scope, tenant_id, domain_id, package_id, package_version, scenario_id, source, review_id, branches, options, payoffs, payoff_unit, payoff_basis,
                                          information, prior_best, ev_now, ev_perfect, evpi, evsi, delay_cost, net_value, posteriors, recommendation, item_id, recorded_by, correlation_id)
  VALUES (p_assessment_id, 'DOMAIN', p_tenant, p_domain, p_package_id, CASE WHEN p_package_id IS NULL THEN NULL ELSE pk.current_version END, p_scenario_id, v_source, p_review_id, v_branches, v_options,
          v_payoffs, v_unit, v_basis, v_info, v_best_now, round(v_ev_now, 6), round(v_ev_perfect, 6), v_evpi, v_evsi, v_delay, v_net, v_posteriors, v_rec, v_item, p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN (to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id') || jsonb_build_object('weights', 'the governed bands'' mid-points, normalised over the futures weighed', 'synthetic', true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.assess_value_of_information(uuid,uuid,uuid,uuid,uuid,uuid[],uuid,jsonb,jsonb,text,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.assess_value_of_information(uuid,uuid,uuid,uuid,uuid,uuid[],uuid,jsonb,jsonb,text,text,jsonb,uuid,uuid) TO eye_commit;

/* STATE A RUN'S PROBABILITY (simulation.impact.probability; AI-50-005): a named human expresses a run's SIMULATED FREQUENCY as a probability
   ONLY through an ACTIVE frequency map of this domain — refused without one (frequency_map), with a superseded one (state). The run: a
   completed, valid, SEEDED supply-flow@1 run of at least 30 samples (a deterministic run has no frequency; a thin one too little). The
   event {metric: line_stop_days | days_below_safety_stock | total_cost, op: > | >=, threshold, label} is COUNTED over the run's own sample
   totals; the frequency per horizon window becomes a yearly frequency by the stated conversion (each window of the run's horizon an
   independent trial: per_year = frequency × 365 / horizon_days); the map's band is looked up here. Nothing is calibrated by this act: the
   map's owner answers for the mapping. */
CREATE OR REPLACE FUNCTION simulation.state_run_probability(
  p_statement_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_map_id uuid, p_event jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; m prediction.frequency_probability_maps%ROWTYPE; v_metric text; v_op text; v_th numeric; v_samples int; v_occ int; v_freq numeric; v_per_year numeric;
        v_horizon int; band jsonb; v_conv text; v_out simulation.probability_statements%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.impact.probability']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'impact analysis rejected (actor): a probability statement is made by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_actor AND x.kind = 'human' AND x.status = 'active') THEN
    RAISE EXCEPTION 'impact analysis rejected (authority): a simulated frequency is stated as a probability by a named human' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact analysis rejected (unknown_run): % is not a simulation run of this domain', p_run_id USING ERRCODE = '23503'; END IF;
  r := simulation.sii_run_for_analysis('impact analysis', p_tenant, p_domain, p_run_id, r.outputs_digest);
  IF p_map_id IS NULL THEN
    RAISE EXCEPTION 'impact analysis rejected (frequency_map): a simulated frequency becomes a probability only through an APPROVED frequency map (an active map of this domain, owned by a named human — AI-50-005); name one' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM prediction.frequency_probability_maps x WHERE x.map_id = p_map_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact analysis rejected (unknown_map): % is not a frequency map of this domain', p_map_id USING ERRCODE = '23503'; END IF;
  IF m.state <> 'active' THEN RAISE EXCEPTION 'impact analysis rejected (state): map "%" version % is superseded; a statement uses the map''s active version', m.name, m.version USING ERRCODE = '22023'; END IF;
  IF r.model_ref <> 'supply-flow@1' OR r.stochastic_mode <> 'seeded' OR jsonb_typeof(r.outputs #> '{stochastic,sample_totals}') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'impact analysis rejected (samples): run % is % (%); a frequency is counted over a seeded supply-flow@1 run''s sample totals', p_run_id, r.model_ref, r.stochastic_mode USING ERRCODE = '22023';
  END IF;
  v_samples := jsonb_array_length(r.outputs #> '{stochastic,sample_totals}');
  IF v_samples < 30 THEN RAISE EXCEPTION 'impact analysis rejected (samples): run % holds % sample(s); a frequency is stated over at least 30', p_run_id, v_samples USING ERRCODE = '22023'; END IF;
  IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object' OR coalesce(p_event ->> 'metric', '') NOT IN ('line_stop_days', 'days_below_safety_stock', 'total_cost')
     OR coalesce(p_event ->> 'op', '') NOT IN ('>', '>=') OR jsonb_typeof(p_event -> 'threshold') IS DISTINCT FROM 'number' OR length(btrim(coalesce(p_event ->> 'label', ''))) < 4 THEN
    RAISE EXCEPTION 'impact analysis rejected (event): the event is {metric: line_stop_days | days_below_safety_stock | total_cost, op: > | >=, threshold (a number), label}' USING ERRCODE = '22023';
  END IF;
  v_metric := p_event ->> 'metric'; v_op := p_event ->> 'op'; v_th := (p_event ->> 'threshold')::numeric;
  SELECT count(*) FILTER (WHERE CASE v_op WHEN '>' THEN val > v_th ELSE val >= v_th END)::int INTO v_occ
    FROM (SELECT CASE v_metric WHEN 'total_cost' THEN (t #>> '{cost,total}')::numeric ELSE (t ->> v_metric)::numeric END AS val FROM jsonb_array_elements(r.outputs #> '{stochastic,sample_totals}') t) q;
  v_horizon := (r.constraints ->> 'horizon_days')::int;
  v_freq := round(v_occ::numeric / v_samples, 6);
  v_per_year := round(v_freq * 365 / v_horizon, 6);
  v_conv := format('%s of %s samples (%s per %s-day horizon window); each window an independent trial: %s × 365 / %s = %s per year', v_occ, v_samples, v_freq, v_horizon, v_freq, v_horizon, v_per_year);
  SELECT x INTO band FROM jsonb_array_elements(m.bands) x WHERE (x ->> 'min_per_year')::numeric <= v_per_year AND ((x ->> 'max_per_year') IS NULL OR v_per_year < (x ->> 'max_per_year')::numeric) LIMIT 1;
  IF band IS NULL THEN RAISE EXCEPTION 'impact analysis rejected (frequency_map): % per year falls in no band of map "%"', v_per_year, m.name USING ERRCODE = '22023'; END IF;
  INSERT INTO simulation.probability_statements (statement_id, scope, tenant_id, domain_id, run_id, run_outputs_digest, map_id, map_name, map_version, map_horizon, event, samples, occurrences, horizon_days,
                                                 frequency, per_year, conversion, band, probability_low, probability_high, synthetic_state, stated_by, correlation_id)
  VALUES (p_statement_id, 'DOMAIN', p_tenant, p_domain, p_run_id, r.outputs_digest, m.map_id, m.name, m.version, m.horizon,
          jsonb_build_object('metric', v_metric, 'op', v_op, 'threshold', v_th, 'label', btrim(p_event ->> 'label')), v_samples, v_occ, v_horizon, v_freq, v_per_year, v_conv, band,
          (band ->> 'probability_low')::numeric, (band ->> 'probability_high')::numeric, true, p_actor, p_correlation)
  RETURNING * INTO v_out;
  RETURN (to_jsonb(v_out) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id') || jsonb_build_object('synthetic', true,
    'caveat', 'a SIMULATED frequency mapped through the named map; the run is synthetic and the map''s owner answers for the mapping — not a calibrated real-world probability');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.state_run_probability(uuid,uuid,uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.state_run_probability(uuid,uuid,uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

-- §I.4 THE READS (invoker reads under the caller's RLS) ───────────────────────
/* THE RUN'S IMPACT: the run (state, validity, fitness, the scenario binding), its sensitivity analyses (newest first, 10), its NEWEST
   second-order derivation (every entity row), its probability statements (newest first, 10). Null when the run is not visible. */
CREATE OR REPLACE FUNCTION simulation.run_impact(p_run_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN r.run_id IS NULL THEN NULL ELSE jsonb_build_object(
    'run', jsonb_build_object('run_id', r.run_id, 'twin_id', r.twin_id, 'twin_version', r.twin_version, 'run_kind', r.run_kind, 'control_run_id', r.control_run_id, 'state', r.state,
                              'validity', r.validity, 'fitness_state', r.fitness_state, 'promoted_for', r.promoted_for, 'model_ref', r.model_ref, 'stochastic_mode', r.stochastic_mode,
                              'samples', r.samples, 'shock', r.shock, 'scenario_id', r.scenario_id, 'scenario_branch_id', r.scenario_branch_id, 'outputs_digest', r.outputs_digest,
                              'component', r.component, 'opened_at', r.opened_at),
    'as_of', clock_timestamp(),
    'analyses', coalesce((SELECT jsonb_agg(to_jsonb(a) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' ORDER BY a.analysed_at DESC)
                          FROM (SELECT * FROM simulation.sensitivity_analyses a0 WHERE a0.run_id = r.run_id ORDER BY a0.analysed_at DESC LIMIT 10) a), '[]'::jsonb),
    'second_order', coalesce((SELECT jsonb_agg(to_jsonb(e) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' ORDER BY e.depth, e.entity_label)
                              FROM simulation.second_order_effects e
                             WHERE e.derivation_id = (SELECT e1.derivation_id FROM simulation.second_order_effects e1 WHERE e1.run_id = r.run_id ORDER BY e1.derived_at DESC LIMIT 1)), '[]'::jsonb),
    'probabilities', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'tenant_id' - 'domain_id' - 'scope' - 'correlation_id' ORDER BY p.stated_at DESC)
                               FROM (SELECT * FROM simulation.probability_statements p0 WHERE p0.run_id = r.run_id ORDER BY p0.stated_at DESC LIMIT 10) p), '[]'::jsonb),
    'synthetic', true) END
    FROM (SELECT 1) one LEFT JOIN simulation.runs_current r ON r.run_id = p_run_id $$;
GRANT EXECUTE ON FUNCTION simulation.run_impact(uuid) TO eye_app, eye_commit;

/* THE NEWEST SENSITIVITY ANALYSIS of a run on a branch (F-P4-08 / CAP-DS-02's "sensitivity evidence"): the analysis, its run (validity,
   state), the metric, the three widest factors and the robustness verdict; NULL when no run on the branch was analysed. */
CREATE OR REPLACE FUNCTION simulation.sii_branch_sensitivity(p_branch_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('analysis_id', a.analysis_id, 'run_id', a.run_id, 'run_kind', r.run_kind, 'run_validity', r.validity, 'run_state', r.state, 'metric', a.metric, 'relative', a.relative,
                            'base_value', a.base_value, 'robustness_verdict', a.robustness_verdict, 'analysed_at', a.analysed_at, 'factor_count', jsonb_array_length(a.factors),
                            'top', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', f ->> 'key', 'kind', f ->> 'kind', 'swing', (f ->> 'swing')::numeric, 'rank', (f ->> 'rank')::int) ORDER BY (f ->> 'rank')::int), '[]'::jsonb)
                                      FROM jsonb_array_elements(a.factors) f WHERE (f ->> 'rank')::int <= 3))
    FROM simulation.sensitivity_analyses a JOIN simulation.runs_current r ON r.run_id = a.run_id
   WHERE r.scenario_branch_id = p_branch_id
   ORDER BY a.analysed_at DESC LIMIT 1 $$;
GRANT EXECUTE ON FUNCTION simulation.sii_branch_sensitivity(uuid) TO eye_app, eye_commit;

-- §I.5 THE COMPARATOR WITH ITS SENSITIVITY EVIDENCE (F-P4-08's B31 piece; CAP-DS-02 "comparable-basis and sensitivity evidence")
/* prediction.scenario_set_compare — 0097 §S.3's body copied WHOLE; TWO changes, marked: `sensitivity_available` beside the other
   availability flags, and each branch's `sensitivity` (simulation.sii_branch_sensitivity: the newest analysis of a run on that branch). */
CREATE OR REPLACE FUNCTION prediction.scenario_set_compare(p_set_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN s.set_id IS NULL THEN NULL ELSE jsonb_build_object(
    'set', prediction.scenario_set_json(s),
    'as_of', clock_timestamp(),
    'plurality', prediction.scenario_set_plurality(s.set_id),
    'anatomy_available', to_regclass('prediction.scenario_elements') IS NOT NULL,
    'probability_available', to_regclass('prediction.branch_probabilities') IS NOT NULL,
    'sensitivity_available', true,   -- B31 §I (0099)
    'stale_after_days', prediction.scenario_set_stale_days(),
    'branches', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'branch_id', b.branch_id, 'scenario_id', b.scenario_id, 'scenario_title', sc.title, 'scenario_state', sc.state, 'scenario_version', sc.current_version,
               'coherence_state', sc.coherence_state, 'name', b.name, 'kind', b.kind, 'kind_label', b.kind_label, 'state', b.state, 'live', x.counts, 'not_counted_reason', x.reason,
               'suspended_at', b.suspended_at, 'suspension_reason', b.suspension_reason,
               'statement', b.statement, 'divergence', b.divergence, 'assumptions', b.assumptions, 'signpost', b.signpost,
               'consequence', b.consequence, 'consequence_class', b.consequence_class, 'owner_principal_id', b.owner_principal_id, 'added_in_version', b.added_in_version,
               'indicator', CASE WHEN i.indicator_id IS NULL THEN NULL ELSE jsonb_build_object(
                  'indicator_id', i.indicator_id, 'series_key', i.series_key, 'comparator', i.comparator, 'threshold', i.threshold, 'consecutive_days', i.consecutive_days,
                  'last_value', i.last_value, 'last_observation_at', i.last_observation_at, 'last_evaluated_at', i.last_evaluated_at, 'streak', i.streak, 'breached', i.breached,
                  'breached_at', i.breached_at, 'state', i.state, 'next_review_at', i.next_review_at,
                  'age_days', CASE WHEN i.last_observation_at IS NULL THEN NULL ELSE (clock_timestamp()::date - i.last_observation_at) END,
                  'freshness', CASE WHEN i.last_observation_at IS NULL THEN 'missing'
                                    WHEN (clock_timestamp()::date - i.last_observation_at) > prediction.scenario_set_stale_days() THEN 'stale' ELSE 'fresh' END) END,
               'elements', prediction.pss_elements_of(b.scenario_id, b.branch_id),
               'probability', prediction.pss_probability_of(b.branch_id),
               'sensitivity', simulation.sii_branch_sensitivity(b.branch_id))   -- B31 §I (0099)
             ORDER BY x.counts DESC, array_position(ARRAY['baseline', 'upside', 'downside', 'disruption', 'stress', 'adversarial', 'counterfactual', 'user-defined'], b.kind), sc.title, b.name)
        FROM prediction.scenario_set_branches(s.set_id) x
        JOIN prediction.branches_current b ON b.branch_id = x.branch_id
        JOIN prediction.scenarios_current sc ON sc.scenario_id = b.scenario_id
        LEFT JOIN prediction.indicators_current i ON i.indicator_id = b.indicator_id), '[]'::jsonb)) END
    FROM (SELECT 1) one LEFT JOIN prediction.scenario_sets s ON s.set_id = p_set_id $$;
GRANT EXECUTE ON FUNCTION prediction.scenario_set_compare(uuid) TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- section `orchestration` (§O) — CP-6 B31 part O (2026-10-01): SIMULATION RUN ORCHESTRATION, BUDGETS, CHECKPOINTS AND THE RUN CENTER
-- (F-P5-06: L8-C06, V03-T-149/-153/-155/-344..-347/-354, ES-38-001/-007/-008/-009, V04-T-033/-034, PR-35-001..-005, CAP-DS-04/-05, WS-13, JRN-14).
-- ═════════════════════════════════════════════════════════════════════
-- AN EXPERIMENT is a declared, budgeted, seeded Monte-Carlo execution of a run contract in CHUNKS of paths:
--   declared (the question, the run contract, the measures and expected outputs, the paths, the chunk size, the seed, the BUDGET
--   {max_paths, max_wall_seconds, max_chunks} and the STOP CONDITIONS {paths, converged?}) → approved (a NAMED HUMAN OTHER THAN THE
--   DECLARER approves exactly the budget they read — its digest; JRN-14) → running (ADMISSION: the executor runs the pinned
--   implementation, the method supports deterministic chunking, the domain's capacity, the budget can reach the declared paths; a refused
--   admission is RECORDED with its reasons) → the RUN is opened through the existing open path (simulation.open_run under simulation.run,
--   its contract the experiment's: seeded, samples = the declared paths) and bound → the WORKER (the domain's attention agent, after its
--   tick: simulation.experiment.execute) claims a chunk (FOR UPDATE SKIP LOCKED, a lease), executes it OUT OF PROCESS from the run's stored
--   contract, and records it — the port computes the chunk's aggregate from the paths itself, writes a CHECKPOINT (the running aggregate,
--   a digest chained to the previous checkpoint, the indicators), and decides what follows: the next chunk, a retry (≤ 3 attempts), a stop
--   (budget exceeded, a chunk failed for good, converged) or the finish → completed (the run COMPLETED from the aggregate over every chunk;
--   the SIM object admitted; run.completed — the existing vocabulary) | partial (the run PARTIAL — §0's state — with its declaration:
--   why it stopped, the missing outputs, completed of declared paths) | failed (nothing ran). An operator PAUSES (between chunks; a chunk
--   in flight still lands), RESUMES (from the last checkpoint) or CANCELS (the run partial, or failed when no path ran).
-- The exact run-event vocabulary (simulation.run_events) is NOT widened: the lifecycle lives in simulation.experiment_events. No outbox
-- event type is added. Every figure a harness or the demonstration seeds is SYNTHETIC.

-- §O.1 THE TABLES ─────────────────────────────────────────────────────
CREATE TABLE simulation.experiments (
  experiment_id        uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  title                text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  question             text NOT NULL CHECK (length(btrim(question)) >= 8),
  twin_id              uuid NOT NULL,
  twin_version         int  NOT NULL,
  scenario_id          uuid,
  scenario_branch_id   uuid,
  method_ref           text NOT NULL REFERENCES twin.behaviour_models (method_ref),
  /* the run contract as declared (runKind, controlRunId, shock, component, interventions, horizonDays, sensitivityRelative, scenario) */
  run_intake           jsonb NOT NULL CHECK (jsonb_typeof(run_intake) = 'object'),
  measures             text[] NOT NULL CHECK (cardinality(measures) >= 1 AND measures <@ ARRAY['total_cost', 'line_stop_days', 'days_below_safety_stock']),
  expected_outputs     text[] NOT NULL DEFAULT ARRAY['totals', 'stochastic.summary', 'stochastic.sample_totals']::text[],
  paths                int  NOT NULL CHECK (paths BETWEEN 1 AND 10000),
  chunk_size           int  NOT NULL CHECK (chunk_size >= 1),
  seed                 bigint NOT NULL,
  jitter               jsonb NOT NULL CHECK (jsonb_typeof(jitter) = 'object'),
  budget               jsonb NOT NULL CHECK (jsonb_typeof(budget) = 'object'),
  stop_conditions      jsonb NOT NULL CHECK (jsonb_typeof(stop_conditions) = 'object'),
  pace                 jsonb NOT NULL DEFAULT '{"chunks_per_tick": 1}'::jsonb,
  state                text NOT NULL CHECK (state IN ('declared', 'approved', 'running', 'paused', 'completed', 'partial', 'failed', 'cancelled')),
  declared_by          uuid NOT NULL,
  declared_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by          uuid,
  approved_at          timestamptz,
  approval_note        text,
  approved_budget_digest text,
  started_by           uuid,
  started_at           timestamptz,
  admission            jsonb,
  run_id               uuid REFERENCES simulation.runs_current (run_id),
  /* {paths_done, chunks_done, executions, wall_ms, failures} — the port's tally */
  progress             jsonb NOT NULL DEFAULT '{"paths_done": 0, "chunks_done": 0, "executions": 0, "wall_ms": 0, "failures": 0}'::jsonb,
  aggregate            jsonb NOT NULL DEFAULT '{}'::jsonb,
  indicators           jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* a stop the record port decided and the finish has not yet written: {outcome, reason} */
  stop_pending         jsonb,
  manifest             jsonb,
  outcome              jsonb,
  finished_at          timestamptz,
  correlation_id       uuid NOT NULL,
  FOREIGN KEY (twin_id, twin_version) REFERENCES twin.twin_versions (twin_id, version),
  CONSTRAINT sio_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sio_chunk_le_paths CHECK (chunk_size <= paths),
  CONSTRAINT sio_scenario_pair CHECK ((scenario_id IS NULL) = (scenario_branch_id IS NULL)),
  CONSTRAINT sio_approved_bound CHECK ((approved_by IS NULL) = (approved_at IS NULL) AND (approved_by IS NULL OR approved_by <> declared_by)),
  CONSTRAINT sio_started_bound CHECK ((started_by IS NULL) = (started_at IS NULL)),
  CONSTRAINT sio_finished_bound CHECK ((state IN ('completed', 'partial', 'failed', 'cancelled')) = (finished_at IS NOT NULL))
);
CREATE INDEX sio_experiments_state ON simulation.experiments (tenant_id, domain_id, state, started_at);
CREATE UNIQUE INDEX sio_experiments_run ON simulation.experiments (run_id) WHERE run_id IS NOT NULL;
COMMENT ON TABLE simulation.experiments IS 'B31 §O (0099): a declared, budgeted, seeded experiment executed in chunks of paths by the background worker; its lifecycle in simulation.experiment_events; the run it produced (completed, partial or failed) in run_id; the manifest binds every chunk''s seed offset and digest, the versions and the approved budget.';

CREATE TABLE simulation.experiment_chunks (
  experiment_id        uuid NOT NULL REFERENCES simulation.experiments (experiment_id),
  chunk_index          int  NOT NULL CHECK (chunk_index >= 0),
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  /* the SEED OFFSET: the global index of the chunk's first path in the run's seeded stream (path s draws from seed ^ imul(s + 1, φ)) */
  first_path           int  NOT NULL CHECK (first_path >= 0),
  paths                int  NOT NULL CHECK (paths >= 1),
  state                text NOT NULL CHECK (state IN ('queued', 'running', 'done', 'failed')),
  attempts             int  NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  claimed_by           uuid,
  started_at           timestamptz,
  finished_at          timestamptz,
  wall_ms              int,
  sample_totals        jsonb,
  aggregate            jsonb,
  digest               text CHECK (digest IS NULL OR digest ~ '^[0-9a-f]{64}$'),
  error                text,
  PRIMARY KEY (experiment_id, chunk_index),
  CONSTRAINT sio_chunk_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sio_chunk_done_bound CHECK (state <> 'done' OR (sample_totals IS NOT NULL AND digest IS NOT NULL AND aggregate IS NOT NULL AND finished_at IS NOT NULL))
);
CREATE INDEX sio_chunks_claim ON simulation.experiment_chunks (experiment_id, state, chunk_index);

CREATE TABLE simulation.experiment_checkpoints (
  checkpoint_id        uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  experiment_id        uuid NOT NULL REFERENCES simulation.experiments (experiment_id),
  seq                  int  NOT NULL CHECK (seq >= 1),
  chunk_index          int  NOT NULL,
  paths_done           int  NOT NULL,
  chunks_done          int  NOT NULL,
  /* the running aggregate over every chunk done so far {measure: {n, sum, sumsq, min, max}} */
  aggregate            jsonb NOT NULL,
  /* sha256(previous checkpoint digest | chunk index | chunk digest): the audit continuity of the checkpoints (V03-T-155) */
  digest               text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  indicators           jsonb NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT sio_checkpoint_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sio_checkpoint_once UNIQUE (experiment_id, seq)
);

CREATE TABLE simulation.experiment_events (
  event_id             uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  experiment_id        uuid NOT NULL REFERENCES simulation.experiments (experiment_id),
  event                text NOT NULL CHECK (event IN ('declared', 'approved', 'admission_refused', 'started', 'run_opened', 'checkpointed', 'chunk_failed', 'chunk_reclaimed',
                                                      'paused', 'resumed', 'budget_exceeded', 'converged', 'completed', 'partial', 'failed', 'cancelled')),
  actor_principal_id   uuid NOT NULL,
  details              jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT sio_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sio_events_experiment ON simulation.experiment_events (experiment_id, occurred_at);

-- §O.2 RLS, GRANTS, APPEND-ONLY (the 0081 loop idiom; reads under the caller's RLS; every write through a port below)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['experiments', 'experiment_chunks', 'experiment_checkpoints', 'experiment_events'] LOOP
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
CREATE TRIGGER sio_events_append_only BEFORE UPDATE OR DELETE ON simulation.experiment_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER sio_checkpoints_append_only BEFORE UPDATE OR DELETE ON simulation.experiment_checkpoints FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
/* an experiment and its chunks are current-state rows, never removed */
CREATE OR REPLACE FUNCTION simulation.sio_no_delete() RETURNS trigger
SET search_path = simulation, pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'simulation experiments are kept: DELETE prohibited' USING ERRCODE = '2F002';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sio_experiments_kept BEFORE DELETE ON simulation.experiments FOR EACH ROW EXECUTE FUNCTION simulation.sio_no_delete();
CREATE TRIGGER sio_chunks_kept BEFORE DELETE ON simulation.experiment_chunks FOR EACH ROW EXECUTE FUNCTION simulation.sio_no_delete();

-- §O.3 THE PRIVATE HELPERS ────────────────────────────────────────────
/* The domain's concurrent-experiment CAPACITY (running + paused), a declared constant at version 1 (recorded on every admission). */
CREATE OR REPLACE FUNCTION simulation.sio_capacity() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 2 $$;
/* The attempts a chunk is given before it fails for good, and the methods whose execution is deterministic in chunks of a seeded stream. */
CREATE OR REPLACE FUNCTION simulation.sio_max_attempts() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;
CREATE OR REPLACE FUNCTION simulation.sio_chunkable_methods() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['supply-flow@1'] $$;

/* The budget's digest (what an approver approves: the budget as the read shows it). */
CREATE OR REPLACE FUNCTION simulation.sio_budget_digest(p_budget jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(p_budget::text, 'UTF8')), 'hex')
$$;

/* The aggregate of one chunk, computed HERE from its paths (never taken on the worker's word): {measure: {n, sum, sumsq, min, max}}. */
CREATE OR REPLACE FUNCTION simulation.sio_chunk_aggregate(p_totals jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  WITH x AS (
    SELECT (t -> 'cost' ->> 'total')::numeric AS total_cost, (t ->> 'line_stop_days')::numeric AS line_stop_days, (t ->> 'days_below_safety_stock')::numeric AS days_below_safety_stock
      FROM jsonb_array_elements(p_totals) t
  )
  SELECT jsonb_build_object(
    'total_cost', jsonb_build_object('n', count(*), 'sum', coalesce(sum(total_cost), 0), 'sumsq', coalesce(sum(total_cost * total_cost), 0), 'min', min(total_cost), 'max', max(total_cost)),
    'line_stop_days', jsonb_build_object('n', count(*), 'sum', coalesce(sum(line_stop_days), 0), 'sumsq', coalesce(sum(line_stop_days * line_stop_days), 0), 'min', min(line_stop_days), 'max', max(line_stop_days)),
    'days_below_safety_stock', jsonb_build_object('n', count(*), 'sum', coalesce(sum(days_below_safety_stock), 0), 'sumsq', coalesce(sum(days_below_safety_stock * days_below_safety_stock), 0),
                                                  'min', min(days_below_safety_stock), 'max', max(days_below_safety_stock)))
  FROM x
$$;

/* Two aggregates merged (the running aggregate of a checkpoint). */
CREATE OR REPLACE FUNCTION simulation.sio_merge(a jsonb, b jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_object_agg(k, jsonb_build_object(
           'n', coalesce((a -> k ->> 'n')::numeric, 0) + coalesce((b -> k ->> 'n')::numeric, 0),
           'sum', coalesce((a -> k ->> 'sum')::numeric, 0) + coalesce((b -> k ->> 'sum')::numeric, 0),
           'sumsq', coalesce((a -> k ->> 'sumsq')::numeric, 0) + coalesce((b -> k ->> 'sumsq')::numeric, 0),
           'min', least((a -> k ->> 'min')::numeric, (b -> k ->> 'min')::numeric),
           'max', greatest((a -> k ->> 'max')::numeric, (b -> k ->> 'max')::numeric))), '{}'::jsonb)
    FROM (SELECT jsonb_object_keys(coalesce(a, '{}'::jsonb)) AS k UNION SELECT jsonb_object_keys(coalesce(b, '{}'::jsonb))) ks
$$;

/* NUMERICAL STABILITY of one measure (ES-38-008): the mean, the 95% half-width of its confidence interval (1.96·s/√n), the half-width
   relative to the mean, and the relative change of the mean since the previous checkpoint. indeterminate below 30 paths; stable when the
   relative half-width is ≤ 5% and the mean moved ≤ 2% since the previous checkpoint; unstable otherwise. Rule version 1. */
CREATE OR REPLACE FUNCTION simulation.sio_stability(p_agg jsonb, p_prev jsonb, p_measure text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n numeric := coalesce((p_agg -> p_measure ->> 'n')::numeric, 0); s numeric := coalesce((p_agg -> p_measure ->> 'sum')::numeric, 0);
        ss numeric := coalesce((p_agg -> p_measure ->> 'sumsq')::numeric, 0); m numeric; v numeric; hw numeric; rel numeric; pm numeric; ch numeric; st text;
BEGIN
  IF n < 1 THEN RETURN jsonb_build_object('measure', p_measure, 'n', 0, 'state', 'indeterminate', 'rule', 'sio-stability@1'); END IF;
  m := s / n;
  v := CASE WHEN n > 1 THEN greatest((ss - s * s / n) / (n - 1), 0) ELSE 0 END;
  hw := 1.96 * sqrt(v) / sqrt(n);
  rel := CASE WHEN m = 0 THEN hw ELSE hw / abs(m) END;
  IF p_prev IS NOT NULL AND coalesce((p_prev -> p_measure ->> 'n')::numeric, 0) > 0 THEN
    pm := (p_prev -> p_measure ->> 'sum')::numeric / (p_prev -> p_measure ->> 'n')::numeric;
    ch := CASE WHEN pm = 0 THEN abs(m - pm) ELSE abs(m - pm) / abs(pm) END;
  END IF;
  st := CASE WHEN n < 30 THEN 'indeterminate' WHEN rel <= 0.05 AND (ch IS NULL OR ch <= 0.02) THEN 'stable' ELSE 'unstable' END;
  RETURN jsonb_build_object('measure', p_measure, 'n', n, 'mean', round(m, 6), 'ci_half_width', round(hw, 6), 'relative_half_width', round(rel, 6),
                            'change_since_previous', CASE WHEN ch IS NULL THEN NULL ELSE round(ch, 6) END, 'state', st, 'rule', 'sio-stability@1');
END $$;

/* The JSON an experiment answers with (no chunk's paths: the read is a summary; the run's state, validity and partial declaration beside it). */
CREATE OR REPLACE FUNCTION simulation.sio_experiment_json(e simulation.experiments) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, executive, pg_catalog, pg_temp AS $$
  SELECT (to_jsonb(e) - 'scope' - 'correlation_id')
    || jsonb_build_object(
         'budget_digest', simulation.sio_budget_digest(e.budget),
         'chunks_total', (SELECT count(*) FROM simulation.experiment_chunks c WHERE c.experiment_id = e.experiment_id),
         'budget_use', jsonb_build_object(
            'paths', jsonb_build_object('done', (e.progress ->> 'paths_done')::int, 'declared', e.paths, 'approved_max', (e.budget ->> 'max_paths')::int),
            'wall_seconds', jsonb_build_object('used', round(((e.progress ->> 'wall_ms')::numeric) / 1000, 3), 'approved_max', (e.budget ->> 'max_wall_seconds')::numeric),
            'chunk_executions', jsonb_build_object('used', (e.progress ->> 'executions')::int, 'approved_max', (e.budget ->> 'max_chunks')::int)),
         'chunks', coalesce((SELECT jsonb_agg(jsonb_build_object('chunk_index', c.chunk_index, 'first_path', c.first_path, 'paths', c.paths, 'state', c.state, 'attempts', c.attempts,
                                                                 'wall_ms', c.wall_ms, 'digest', c.digest, 'error', c.error, 'started_at', c.started_at, 'finished_at', c.finished_at) ORDER BY c.chunk_index)
                              FROM simulation.experiment_chunks c WHERE c.experiment_id = e.experiment_id), '[]'::jsonb),
         'checkpoints', coalesce((SELECT jsonb_agg(jsonb_build_object('seq', k.seq, 'chunk_index', k.chunk_index, 'paths_done', k.paths_done, 'chunks_done', k.chunks_done, 'digest', k.digest,
                                                                      'indicators', k.indicators, 'created_at', k.created_at) ORDER BY k.seq)
                                   FROM simulation.experiment_checkpoints k WHERE k.experiment_id = e.experiment_id), '[]'::jsonb),
         'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', x.event_id, 'event', x.event, 'actor', x.actor_principal_id, 'details', x.details, 'occurred_at', x.occurred_at) ORDER BY x.occurred_at, x.event_id)
                              FROM simulation.experiment_events x WHERE x.experiment_id = e.experiment_id), '[]'::jsonb),
         'run', (SELECT jsonb_build_object('run_id', r.run_id, 'state', r.state, 'validity', r.validity, 'fitness_state', r.fitness_state, 'partial', r.partial, 'outputs_digest', r.outputs_digest,
                                           'samples', r.samples, 'seed', r.seed, 'opened_at', r.opened_at, 'completed_at', r.completed_at, 'failure', r.failure)
                   FROM simulation.runs_current r WHERE r.run_id = e.run_id),
         'executor', jsonb_build_object('kind', 'attention agent (after its tick)',
                                        'active', EXISTS (SELECT 1 FROM executive.agents a WHERE a.tenant_id = e.tenant_id AND a.domain_id = e.domain_id AND a.agent_kind = 'attention' AND a.status = 'active')),
         'synthetic', true)
$$;

/* The NOTICE (the 0095 notify idiom): an attention item of the class, subject the experiment, owned by a person (open when an active human,
   else unrouted) or routed to roles (open when the roles have a holder, else unrouted); its cause the experiment_events row. */
CREATE OR REPLACE FUNCTION simulation.sio_notify(e simulation.experiments, p_class text, p_title text, p_reasons jsonb, p_owner uuid, p_roles text[], p_cause_event uuid, p_cause_type text,
                                                 p_details jsonb, p_due interval, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + p_due;
BEGIN
  v_state := CASE WHEN p_owner IS NOT NULL THEN CASE WHEN decision.is_active_human(p_owner, e.tenant_id) THEN 'open' ELSE 'unrouted' END
                  ELSE CASE WHEN executive.role_holders(e.tenant_id, e.domain_id, p_roles) > 0 THEN 'open' ELSE 'unrouted' END END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', e.tenant_id, e.domain_id, p_class, 'experiment', e.experiment_id, p_cause_event, p_cause_type, left(p_title, 512), 'material', v_state, p_owner, coalesce(p_roles, '{}'),
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          jsonb_build_object('experiment_id', e.experiment_id, 'title', e.title, 'run_id', e.run_id, 'synthetic', true) || coalesce(p_details, '{}'::jsonb), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, e.tenant_id, e.domain_id, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', p_owner, 'route_roles', to_jsonb(coalesce(p_roles, '{}')), 'due_at', v_due,
                               'cause_event_id', p_cause_event, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted', 'experiment_id', e.experiment_id), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sio_notify(simulation.experiments, text, text, jsonb, uuid, text[], uuid, text, jsonb, interval, uuid, uuid) FROM PUBLIC;

/* The event row (the experiment's own ledger). */
CREATE OR REPLACE FUNCTION simulation.sio_event(e simulation.experiments, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid, p_event_id uuid DEFAULT NULL) RETURNS uuid
SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE v uuid := coalesce(p_event_id, gen_random_uuid());
BEGIN
  INSERT INTO simulation.experiment_events (event_id, scope, tenant_id, domain_id, experiment_id, event, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', e.tenant_id, e.domain_id, e.experiment_id, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sio_event(simulation.experiments, text, uuid, jsonb, uuid, uuid) FROM PUBLIC;

/* The experiment of this domain, locked (or the refusal). */
CREATE OR REPLACE FUNCTION simulation.sio_lock(p_experiment_id uuid, p_tenant uuid, p_domain uuid) RETURNS simulation.experiments
SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE;
BEGIN
  SELECT * INTO e FROM simulation.experiments x WHERE x.experiment_id = p_experiment_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'experiment rejected (unknown_experiment): % is not an experiment of this domain', p_experiment_id USING ERRCODE = '23503'; END IF;
  RETURN e;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sio_lock(uuid, uuid, uuid) FROM PUBLIC;

/* The acting principal is the context's (every port). */
CREATE OR REPLACE FUNCTION simulation.sio_assert_actor(p_actor uuid) RETURNS void
SET search_path = simulation, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'experiment rejected (actor): recorded by the acting principal' USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sio_assert_actor(uuid) FROM PUBLIC;

/* The WORKER is the domain's active attention agent (the executor of the background chunks). */
CREATE OR REPLACE FUNCTION simulation.sio_assert_worker(p_tenant uuid, p_domain uuid, p_actor uuid) RETURNS void
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM executive.agents a WHERE a.principal_id = p_actor AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'attention' AND a.status = 'active') THEN
    RAISE EXCEPTION 'experiment rejected (authority): the executor of experiment chunks is an active attention agent of this domain' USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sio_assert_worker(uuid, uuid, uuid) FROM PUBLIC;

/* An OPERATOR's act on a started experiment (pause, resume, cancel): its declarer, its starter, or a domain administrator / twin owner. */
CREATE OR REPLACE FUNCTION simulation.sio_assert_operator(e simulation.experiments, p_actor uuid, p_what text) RETURNS void
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM e.declared_by AND p_actor IS DISTINCT FROM e.started_by
     AND NOT executive.holds_role(p_actor, e.tenant_id, e.domain_id, ARRAY['domain_admin', 'twin_owner', 'platform_admin']) THEN
    RAISE EXCEPTION 'experiment rejected (authority): % an experiment is its declarer''s, its starter''s, a twin owner''s or the domain administrator''s act', p_what USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sio_assert_operator(simulation.experiments, uuid, text) FROM PUBLIC;

/* THE MANIFEST (V03-T-345, AI-50-003): the resolved versions, the seed and every chunk's seed offset, paths, attempts and digest, the
   checkpoint chain's head, the approved budget, the indicators — built HERE from the rows. */
CREATE OR REPLACE FUNCTION simulation.sio_manifest(e simulation.experiments, p_outputs_digest text) RETURNS jsonb
SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'manifest', 'sio-manifest@1', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'synthetic', true,
    'twin', jsonb_build_object('twin_id', e.twin_id, 'version', e.twin_version),
    'scenario', CASE WHEN e.scenario_id IS NULL THEN NULL ELSE jsonb_build_object('scenario_id', e.scenario_id, 'branch_id', e.scenario_branch_id, 'version', r.scenario_version, 'branch_state', r.scenario_branch_state) END,
    'method', jsonb_build_object('ref', r.model_ref, 'implementation_digest', r.implementation_digest),
    'environment', jsonb_build_object('digest', r.environment_digest, 'environment', r.environment),
    'inputs_digest', r.inputs_digest, 'initial_state_digest', r.initial_state_digest,
    'stochastic', jsonb_build_object('rng', r.rng, 'seed', r.seed, 'declared_paths', e.paths, 'chunk_size', e.chunk_size, 'jitter', r.jitter,
                                     'stream', 'path s draws from xoshiro128** seeded with seed ^ imul(s + 1, 0x9e3779b1); a chunk is the paths [first_path, first_path + paths)'),
    'chunks', coalesce((SELECT jsonb_agg(jsonb_build_object('chunk_index', c.chunk_index, 'first_path', c.first_path, 'paths', c.paths, 'state', c.state, 'attempts', c.attempts,
                                                            'digest', c.digest, 'wall_ms', c.wall_ms) ORDER BY c.chunk_index)
                        FROM simulation.experiment_chunks c WHERE c.experiment_id = e.experiment_id), '[]'::jsonb),
    'checkpoint_head', (SELECT jsonb_build_object('seq', k.seq, 'digest', k.digest) FROM simulation.experiment_checkpoints k WHERE k.experiment_id = e.experiment_id ORDER BY k.seq DESC LIMIT 1),
    'budget', jsonb_build_object('approved', e.budget, 'digest', e.approved_budget_digest, 'approved_by', e.approved_by, 'approved_at', e.approved_at, 'used', e.progress),
    'stop_conditions', e.stop_conditions, 'admission', e.admission, 'indicators', e.indicators,
    'outputs_digest', p_outputs_digest, 'containment', jsonb_build_object('isolated', true, 'timeout_ms', 60000, 'max_old_space_mb', 256))
  FROM simulation.runs_current r WHERE r.run_id = e.run_id
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION simulation.sio_manifest(simulation.experiments, text) FROM PUBLIC;

/* THE RUN'S RESULT (only §O writes a partial run): completed — as simulation.complete_run writes it (0078: outputs, digests, sensitivity,
   header, resource; run.completed; the run → twin / control / scenario dependencies); partial — §0's state with its declaration and the
   aggregate over the chunks done (no run event: the vocabulary is not widened; the dependencies written so the run is reached by a twin
   correction); failed — as simulation.fail_run writes it (run.failed). */
CREATE OR REPLACE FUNCTION simulation.sio_write_run(e simulation.experiments, p_outcome text, p_reason text, p_partial jsonb, p_outputs jsonb, p_outputs_digest text, p_sensitivity jsonb,
                                                    p_header_digest text, p_resource jsonb, p_actor uuid, p_correlation uuid) RETURNS void
SECURITY DEFINER SET search_path = simulation, graph, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE;
BEGIN
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = e.run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'experiment rejected (state): experiment % has no run', e.experiment_id USING ERRCODE = '2F002'; END IF;
  IF r.state <> 'opened' THEN RAISE EXCEPTION 'experiment rejected (state): run % of experiment % is already %', r.run_id, e.experiment_id, r.state USING ERRCODE = '2F002'; END IF;
  IF p_outcome = 'completed' THEN
    UPDATE simulation.runs_current
       SET outputs = p_outputs, outputs_digest = p_outputs_digest, sensitivity = p_sensitivity, outside_envelope = coalesce((p_sensitivity ->> 'outside_envelope')::boolean, false),
           header_digest = p_header_digest, state = 'completed', completed_at = clock_timestamp(), resource = p_resource
     WHERE run_id = r.run_id;
    INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', r.tenant_id, r.domain_id, r.run_id, 'run.completed', p_actor,
            jsonb_build_object('outputs_digest', p_outputs_digest, 'inputs_digest', r.inputs_digest, 'header_digest', p_header_digest,
                               'outside_envelope', coalesce((p_sensitivity ->> 'outside_envelope')::boolean, false), 'resource', p_resource, 'experiment_id', e.experiment_id), p_correlation);
  ELSIF p_outcome = 'partial' THEN
    UPDATE simulation.runs_current SET state = 'partial', partial = p_partial, outputs = p_outputs, outputs_digest = p_outputs_digest, resource = p_resource WHERE run_id = r.run_id;
  ELSE
    UPDATE simulation.runs_current SET state = 'failed', failure = left(p_reason, 500) WHERE run_id = r.run_id;
    INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', r.tenant_id, r.domain_id, r.run_id, 'run.failed', p_actor, jsonb_build_object('failure', left(p_reason, 500)), p_correlation);
    RETURN;
  END IF;
  INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', r.tenant_id, r.domain_id, r.run_id, 'SIM', 'twin', r.twin_id, format('run on twin version %s (branch %s)', r.twin_version, r.branch_id), 'active', p_actor, p_correlation)
  ON CONFLICT DO NOTHING;
  IF r.control_run_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', r.tenant_id, r.domain_id, r.run_id, 'SIM', 'run', r.control_run_id, 'intervention run compared against this control', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
  IF r.scenario_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', r.tenant_id, r.domain_id, r.run_id, 'SIM', 'strategy', r.scenario_id,
            format('run applied scenario version %s, branch %s (%s)', r.scenario_version, r.scenario_branch_id, r.scenario_branch_state), 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.sio_write_run(simulation.experiments, text, text, jsonb, jsonb, text, jsonb, text, jsonb, uuid, uuid) FROM PUBLIC;

/* THE PARTIAL DECLARATION (V03-T-153): why it stopped, which outputs are missing (the paths not run, and the summary over the declared
   paths), how many paths completed of how many declared. */
CREATE OR REPLACE FUNCTION simulation.sio_partial_declaration(e simulation.experiments, p_reason text) RETURNS jsonb
SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'reason', p_reason, 'experiment_id', e.experiment_id,
    'completed_paths', coalesce((SELECT sum(c.paths) FROM simulation.experiment_chunks c WHERE c.experiment_id = e.experiment_id AND c.state = 'done'), 0)::int,
    'declared_paths', e.paths,
    'missing_paths', coalesce((SELECT jsonb_agg(jsonb_build_object('chunk_index', c.chunk_index, 'from_path', c.first_path, 'to_path', c.first_path + c.paths - 1, 'state', c.state) ORDER BY c.chunk_index)
                               FROM simulation.experiment_chunks c WHERE c.experiment_id = e.experiment_id AND c.state <> 'done'), '[]'::jsonb),
    'missing_outputs', jsonb_build_array(
       format('stochastic.sample_totals for %s of %s declared paths', e.paths - coalesce((SELECT sum(c.paths) FROM simulation.experiment_chunks c WHERE c.experiment_id = e.experiment_id AND c.state = 'done'), 0), e.paths),
       format('stochastic.summary over the %s declared paths (the summary present covers the completed paths only)', e.paths),
       'sensitivity (not computed for a partial run)', 'the SIM canonical object (a partial run is not admitted as a result)'),
    'decision_use', 'diagnostic only: a partial run is never decision-active')
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION simulation.sio_partial_declaration(simulation.experiments, text) FROM PUBLIC;

-- §O.4 THE PORTS ──────────────────────────────────────────────────────
/* DECLARE (simulation.experiment.declare — a twin owner, a simulation operator): the question, the run contract, the measures, the
   expected outputs, the paths, the chunk size, the seed, the budget and the stop conditions (V03-T-344). The method must support
   deterministic chunked execution (supply-flow@1); the twin version must be admitted; the budget must cover the declared paths. The
   APPROVERS are asked: an attention item of class simulation.budget routed to the domain administrators, the strategy owners and the
   twin owners (the declarer never approves its own). */
CREATE OR REPLACE FUNCTION simulation.declare_experiment(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_declaration jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; d jsonb := p_declaration; v_paths int; v_chunk int; v_budget jsonb; v_stop jsonb; v_method text; v_state text; v_conv jsonb; v_item uuid;
        v_measures text[]; v_pace int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'experiment rejected (declaration): the declaration is an object' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(d ->> 'title', ''))) NOT BETWEEN 4 AND 200 OR length(btrim(coalesce(d ->> 'question', ''))) < 8 THEN
    RAISE EXCEPTION 'experiment rejected (declaration): an experiment names its title (4–200 characters) and the question it answers (at least 8)' USING ERRCODE = '22023';
  END IF;
  SELECT v.state INTO v_state FROM twin.twin_versions v WHERE v.twin_id = (d ->> 'twin_id')::uuid AND v.version = (d ->> 'twin_version')::int;
  IF NOT FOUND THEN RAISE EXCEPTION 'experiment rejected (unknown_twin_version): twin % has no version %', d ->> 'twin_id', d ->> 'twin_version' USING ERRCODE = '23503'; END IF;
  IF v_state <> 'admitted' THEN RAISE EXCEPTION 'experiment rejected (state): twin version % is %, not admitted', d ->> 'twin_version', v_state USING ERRCODE = '2F002'; END IF;
  SELECT t.behaviour_model_ref INTO v_method FROM twin.twins_current t WHERE t.twin_id = (d ->> 'twin_id')::uuid;
  v_method := coalesce(nullif(d ->> 'method_ref', ''), v_method);
  IF NOT (v_method = ANY (simulation.sio_chunkable_methods())) THEN
    RAISE EXCEPTION 'experiment rejected (method): % does not support deterministic execution in chunks of a seeded stream (the chunkable methods: %)', v_method, array_to_string(simulation.sio_chunkable_methods(), ', ') USING ERRCODE = '22023';
  END IF;
  v_paths := (d ->> 'paths')::int; v_chunk := (d ->> 'chunk_size')::int;
  IF v_paths IS NULL OR v_paths < 1 OR v_paths > 10000 THEN RAISE EXCEPTION 'experiment rejected (paths): paths is an integer in [1, 10000]' USING ERRCODE = '22023'; END IF;
  IF v_chunk IS NULL OR v_chunk < 1 OR v_chunk > v_paths THEN RAISE EXCEPTION 'experiment rejected (chunk_size): the chunk size is an integer in [1, paths]' USING ERRCODE = '22023'; END IF;
  IF (v_paths + v_chunk - 1) / v_chunk > 200 THEN RAISE EXCEPTION 'experiment rejected (chunk_size): at most 200 chunks (% paths in chunks of % are %)', v_paths, v_chunk, (v_paths + v_chunk - 1) / v_chunk USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(d -> 'seed') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'experiment rejected (determinism): a seeded experiment declares its integer seed' USING ERRCODE = '22023'; END IF;
  v_budget := d -> 'budget';
  IF jsonb_typeof(v_budget) IS DISTINCT FROM 'object' OR jsonb_typeof(v_budget -> 'max_paths') IS DISTINCT FROM 'number' OR jsonb_typeof(v_budget -> 'max_wall_seconds') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_budget -> 'max_chunks') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'experiment rejected (budget): the budget declares max_paths, max_wall_seconds and max_chunks' USING ERRCODE = '22023';
  END IF;
  IF (v_budget ->> 'max_paths')::numeric < v_paths THEN RAISE EXCEPTION 'experiment rejected (budget): the declared % paths exceed the budget''s max_paths %', v_paths, v_budget ->> 'max_paths' USING ERRCODE = '22023'; END IF;
  IF (v_budget ->> 'max_wall_seconds')::numeric <= 0 OR (v_budget ->> 'max_wall_seconds')::numeric > 86400 OR (v_budget ->> 'max_chunks')::numeric < 1 OR (v_budget ->> 'max_chunks')::numeric > 1000 THEN
    RAISE EXCEPTION 'experiment rejected (budget): max_wall_seconds is in (0, 86400] and max_chunks in [1, 1000]' USING ERRCODE = '22023';
  END IF;
  v_budget := jsonb_build_object('max_paths', (v_budget ->> 'max_paths')::int, 'max_wall_seconds', (v_budget ->> 'max_wall_seconds')::numeric, 'max_chunks', (v_budget ->> 'max_chunks')::int);
  SELECT coalesce(array_agg(x ORDER BY x), ARRAY['total_cost']) INTO v_measures FROM jsonb_array_elements_text(coalesce(d -> 'measures', '["total_cost", "line_stop_days"]'::jsonb)) x;
  IF NOT (v_measures <@ ARRAY['total_cost', 'line_stop_days', 'days_below_safety_stock']) OR cardinality(v_measures) < 1 THEN
    RAISE EXCEPTION 'experiment rejected (measures): the measures are among total_cost, line_stop_days, days_below_safety_stock' USING ERRCODE = '22023';
  END IF;
  v_conv := d -> 'stop_conditions' -> 'converged';
  IF v_conv IS NOT NULL AND jsonb_typeof(v_conv) <> 'null' THEN
    IF jsonb_typeof(v_conv) <> 'object' OR NOT ((v_conv ->> 'measure') = ANY (v_measures)) OR jsonb_typeof(v_conv -> 'ci_half_width') IS DISTINCT FROM 'number' OR (v_conv ->> 'ci_half_width')::numeric <= 0
       OR jsonb_typeof(v_conv -> 'min_paths') IS DISTINCT FROM 'number' OR (v_conv ->> 'min_paths')::int < 30 OR (v_conv ->> 'min_paths')::int > v_paths THEN
      RAISE EXCEPTION 'experiment rejected (stop_conditions): converged names a declared measure, a positive ci_half_width and min_paths in [30, paths]' USING ERRCODE = '22023';
    END IF;
    v_conv := jsonb_build_object('measure', v_conv ->> 'measure', 'ci_half_width', (v_conv ->> 'ci_half_width')::numeric, 'min_paths', (v_conv ->> 'min_paths')::int);
  ELSE v_conv := NULL;
  END IF;
  v_stop := jsonb_build_object('paths', v_paths, 'converged', v_conv);
  v_pace := coalesce((d -> 'pace' ->> 'chunks_per_tick')::int, 1);
  IF v_pace < 1 OR v_pace > 50 THEN RAISE EXCEPTION 'experiment rejected (pace): chunks_per_tick is in [1, 50]' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(d -> 'run_intake') IS DISTINCT FROM 'object' OR jsonb_typeof(d -> 'jitter') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'experiment rejected (declaration): the run contract (run_intake) and the jitter distribution are objects' USING ERRCODE = '22023';
  END IF;
  INSERT INTO simulation.experiments (experiment_id, scope, tenant_id, domain_id, title, question, twin_id, twin_version, scenario_id, scenario_branch_id, method_ref, run_intake, measures,
                                      expected_outputs, paths, chunk_size, seed, jitter, budget, stop_conditions, pace, state, declared_by, correlation_id)
  VALUES (p_experiment_id, 'DOMAIN', p_tenant, p_domain, btrim(d ->> 'title'), btrim(d ->> 'question'), (d ->> 'twin_id')::uuid, (d ->> 'twin_version')::int,
          nullif(d ->> 'scenario_id', '')::uuid, nullif(d ->> 'scenario_branch_id', '')::uuid, v_method, d -> 'run_intake', v_measures,
          coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(d -> 'expected_outputs') x), ARRAY['totals', 'stochastic.summary', 'stochastic.sample_totals']::text[]),
          v_paths, v_chunk, (d ->> 'seed')::bigint, d -> 'jitter', v_budget, v_stop, jsonb_build_object('chunks_per_tick', v_pace), 'declared', p_actor, p_correlation)
  RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'declared', p_actor, jsonb_build_object('paths', v_paths, 'chunk_size', v_chunk, 'seed', e.seed, 'budget', v_budget, 'stop_conditions', v_stop, 'method_ref', v_method), p_correlation, p_event_id);
  v_item := simulation.sio_notify(e, 'simulation.budget', format('Simulation budget approval requested: %s (%s paths, %s s, %s chunk executions)', e.title, v_paths, v_budget ->> 'max_wall_seconds', v_budget ->> 'max_chunks'),
              jsonb_build_array(format('%s paths of %s in chunks of %s under seed %s', v_paths, v_method, v_chunk, e.seed),
                                'a named human other than the declarer approves the budget before the experiment may start (JRN-14)'),
              NULL, ARRAY['domain_admin', 'strategy_owner', 'twin_owner'], p_event_id, 'experiment.declared',
              jsonb_build_object('kind', 'approval_requested', 'budget', v_budget, 'declared_by', p_actor), interval '48 hours', p_actor, p_correlation);
  RETURN simulation.sio_experiment_json(e) || jsonb_build_object('attention_item_id', v_item);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.declare_experiment(uuid, uuid, uuid, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.declare_experiment(uuid, uuid, uuid, jsonb, uuid, uuid, uuid) TO eye_commit;

/* APPROVE THE BUDGET (simulation.experiment.approve — human-gated; JRN-14, PR-35-003): a NAMED, ACTIVE HUMAN who is NOT the declarer approves
   EXACTLY the budget they read (its digest); the approval request is closed. */
CREATE OR REPLACE FUNCTION simulation.approve_experiment(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_budget_digest text, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; v_item record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'experiment rejected (authority): a budget is approved by a named, active human' USING ERRCODE = '42501'; END IF;
  IF p_actor = e.declared_by THEN RAISE EXCEPTION 'experiment rejected (separation_of_duties): the declarer of experiment % does not approve its own budget', e.experiment_id USING ERRCODE = '42501'; END IF;
  IF e.state <> 'declared' THEN RAISE EXCEPTION 'experiment rejected (state): experiment % is %, not declared', e.experiment_id, e.state USING ERRCODE = '2F002'; END IF;
  IF p_budget_digest IS DISTINCT FROM simulation.sio_budget_digest(e.budget) THEN
    RAISE EXCEPTION 'experiment rejected (stale): the budget approved (digest %) is not the budget declared (digest %)', left(coalesce(p_budget_digest, '<none>'), 12), left(simulation.sio_budget_digest(e.budget), 12) USING ERRCODE = '2F002';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'experiment rejected (note): an approval says why, in at least 8 characters' USING ERRCODE = '22023'; END IF;
  UPDATE simulation.experiments SET state = 'approved', approved_by = p_actor, approved_at = clock_timestamp(), approval_note = btrim(p_note), approved_budget_digest = p_budget_digest
   WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'approved', p_actor, jsonb_build_object('budget', e.budget, 'budget_digest', p_budget_digest, 'note', btrim(p_note)), p_correlation, p_event_id);
  FOR v_item IN SELECT i.item_id FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'simulation.budget' AND i.subject_id = e.experiment_id
                                                                    AND i.details ->> 'kind' = 'approval_requested' AND i.state <> 'closed' LOOP
    UPDATE executive.attention_items SET state = 'closed', closed_at = clock_timestamp(), closed_by = p_actor, updated_at = clock_timestamp() WHERE item_id = v_item.item_id;
    PERFORM executive.attention_event(v_item.item_id, p_tenant, p_domain, 'item.closed', p_actor, jsonb_build_object('reason', 'the budget was approved', 'experiment_id', e.experiment_id), p_correlation);
  END LOOP;
  RETURN simulation.sio_experiment_json(e);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.approve_experiment(uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.approve_experiment(uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

/* START — THE ADMISSION (simulation.experiment.start; V03-T-346): approved; DETERMINISM (the method chunks deterministically and the
   executor's implementation digest is the pinned one); CAPACITY (running + paused experiments of the domain below sio_capacity());
   FEASIBILITY (the budget's chunk executions and paths reach the declared stop condition). A refused admission is RECORDED
   (admission_refused, its reasons) and answered {admitted: false}; an admitted one queues the chunks (the seed offsets) and runs. The RUN
   is opened next by the route (simulation.run) and bound by bind_experiment_run. */
CREATE OR REPLACE FUNCTION simulation.start_experiment(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_implementation_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; v_reasons jsonb := '[]'::jsonb; v_in_use int; v_pinned text; v_chunks int; v_admission jsonb; i int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.start']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  IF e.state <> 'approved' THEN RAISE EXCEPTION 'experiment rejected (state): experiment % is %, not approved — a budget is approved before an experiment starts', e.experiment_id, e.state USING ERRCODE = '2F002'; END IF;
  SELECT m.implementation_digest INTO v_pinned FROM twin.behaviour_models m WHERE m.method_ref = e.method_ref;
  IF NOT (e.method_ref = ANY (simulation.sio_chunkable_methods())) THEN v_reasons := v_reasons || to_jsonb(format('determinism: %s does not execute deterministically in chunks', e.method_ref)); END IF;
  IF v_pinned IS NULL OR p_implementation_digest IS DISTINCT FROM v_pinned THEN
    v_reasons := v_reasons || to_jsonb(format('determinism: the executor runs implementation %s, the registry pins %s for %s', left(coalesce(p_implementation_digest, '<none>'), 12), left(coalesce(v_pinned, '<none>'), 12), e.method_ref));
  END IF;
  -- the capacity in use is counted under a lock on the domain's running experiments (two starts cannot both take the last slot)
  PERFORM 1 FROM simulation.experiments x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('running', 'paused') FOR UPDATE;
  SELECT count(*) INTO v_in_use FROM simulation.experiments x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('running', 'paused');
  IF v_in_use >= simulation.sio_capacity() THEN v_reasons := v_reasons || to_jsonb(format('capacity: %s of %s concurrent experiments of this domain are running or paused', v_in_use, simulation.sio_capacity())); END IF;
  v_chunks := (e.paths + e.chunk_size - 1) / e.chunk_size;
  IF v_chunks > (e.budget ->> 'max_chunks')::int THEN
    v_reasons := v_reasons || to_jsonb(format('feasibility: the declared %s paths need %s chunk executions; the approved budget allows %s', e.paths, v_chunks, e.budget ->> 'max_chunks'));
  END IF;
  v_admission := jsonb_build_object('admitted', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons, 'capacity', simulation.sio_capacity(), 'in_use', v_in_use,
                                    'deterministic', e.method_ref = ANY (simulation.sio_chunkable_methods()) AND p_implementation_digest IS NOT DISTINCT FROM v_pinned,
                                    'implementation_digest', p_implementation_digest, 'chunks', v_chunks, 'checked_at', clock_timestamp(), 'rule', 'sio-admission@1');
  IF jsonb_array_length(v_reasons) > 0 THEN
    PERFORM simulation.sio_event(e, 'admission_refused', p_actor, v_admission, p_correlation, p_event_id);
    RETURN simulation.sio_experiment_json(e) || jsonb_build_object('admitted', false, 'admission', v_admission);
  END IF;
  FOR i IN 0 .. v_chunks - 1 LOOP
    INSERT INTO simulation.experiment_chunks (experiment_id, chunk_index, scope, tenant_id, domain_id, first_path, paths, state)
    VALUES (e.experiment_id, i, 'DOMAIN', p_tenant, p_domain, i * e.chunk_size, least(e.chunk_size, e.paths - i * e.chunk_size), 'queued');
  END LOOP;
  UPDATE simulation.experiments SET state = 'running', started_by = p_actor, started_at = clock_timestamp(), admission = v_admission WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'started', p_actor, v_admission, p_correlation, p_event_id);
  RETURN simulation.sio_experiment_json(e) || jsonb_build_object('admitted', true, 'admission', v_admission);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.start_experiment(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.start_experiment(uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* BIND THE RUN (in the opening write, under simulation.run): the run the starter just opened through simulation.open_run carries the
   experiment's contract — the twin version, the method, SEEDED with the experiment's seed, its samples the declared paths, its jitter. */
CREATE OR REPLACE FUNCTION simulation.bind_experiment_run(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_run_id uuid, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; r simulation.runs_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  IF e.state <> 'running' OR e.run_id IS NOT NULL THEN RAISE EXCEPTION 'experiment rejected (state): experiment % is % and its run is %', e.experiment_id, e.state, coalesce(e.run_id::text, 'not opened') USING ERRCODE = '2F002'; END IF;
  IF p_actor IS DISTINCT FROM e.started_by THEN RAISE EXCEPTION 'experiment rejected (actor): the run of experiment % is opened by its starter', e.experiment_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'experiment rejected (unknown_run): % is not a run of this domain', p_run_id USING ERRCODE = '23503'; END IF;
  IF r.state <> 'opened' OR r.operator_principal_id <> p_actor OR r.twin_id <> e.twin_id OR r.twin_version <> e.twin_version OR r.model_ref <> e.method_ref
     OR r.stochastic_mode <> 'seeded' OR r.seed IS DISTINCT FROM e.seed OR r.samples IS DISTINCT FROM e.paths OR r.jitter IS DISTINCT FROM e.jitter THEN
    RAISE EXCEPTION 'experiment rejected (contract): run % does not carry the contract of experiment % (an opened run of its starter on twin %@%, %, seeded %, % paths)',
      p_run_id, e.experiment_id, e.twin_id, e.twin_version, e.method_ref, e.seed, e.paths USING ERRCODE = '22023';
  END IF;
  UPDATE simulation.experiments SET run_id = p_run_id WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'run_opened', p_actor, jsonb_build_object('run_id', p_run_id, 'initial_state_digest', r.initial_state_digest, 'inputs_digest', r.inputs_digest,
                                                                            'implementation_digest', r.implementation_digest, 'environment_digest', r.environment_digest), p_correlation, p_event_id);
  RETURN simulation.sio_experiment_json(e);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.bind_experiment_run(uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.bind_experiment_run(uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* THE OPENING REFUSED (simulation.experiment.start): the run gates refused the run (an unfit twin, a suspended or incoherent scenario
   branch, an input no longer available — "fail closed when required versions cannot resolve"); the experiment FAILS with the refusal as
   its reason and the declarer is told. */
CREATE OR REPLACE FUNCTION simulation.fail_experiment_start(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.start']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  IF e.state <> 'running' OR e.run_id IS NOT NULL OR e.started_by IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'experiment rejected (state): experiment % is % with run %; only a start whose run did not open fails here', e.experiment_id, e.state, coalesce(e.run_id::text, 'none') USING ERRCODE = '2F002';
  END IF;
  UPDATE simulation.experiment_chunks SET state = 'failed', error = 'the run did not open' WHERE experiment_id = e.experiment_id AND state = 'queued';
  UPDATE simulation.experiments SET state = 'failed', finished_at = clock_timestamp(), outcome = jsonb_build_object('outcome', 'failed', 'reason', 'run_refused', 'detail', left(p_reason, 1000))
   WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'failed', p_actor, jsonb_build_object('reason', 'run_refused', 'detail', left(p_reason, 1000)), p_correlation, p_event_id);
  PERFORM simulation.sio_notify(e, 'simulation.experiment', format('Simulation experiment failed to start: %s', e.title), jsonb_build_array(left(p_reason, 400), 'no path ran; the run was refused at opening'),
            e.declared_by, NULL, p_event_id, 'experiment.failed', jsonb_build_object('outcome', 'failed', 'reason', 'run_refused'), interval '24 hours', p_actor, p_correlation);
  RETURN simulation.sio_experiment_json(e);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.fail_experiment_start(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.fail_experiment_start(uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* CLAIM (the WORKER's; simulation.experiment.execute): the oldest running experiment of the domain whose run is bound (or the one named)
   answers — {kind: 'finish', outcome, reason} when a stop is pending or every chunk is done; {kind: 'chunk', …, run: the stored contract}
   for its next chunk: a QUEUED one, or a RUNNING one whose lease lapsed (a worker that died mid-chunk: reclaimed, chunk_reclaimed) —
   FOR UPDATE SKIP LOCKED, the attempt counted against the budget's chunk executions; or null (nothing to do). */
CREATE OR REPLACE FUNCTION simulation.claim_experiment_chunk(p_tenant uuid, p_domain uuid, p_experiment_id uuid, p_exclude uuid[], p_lease_seconds int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; c simulation.experiment_chunks%ROWTYPE; r simulation.runs_current%ROWTYPE; v_lease int := greatest(5, least(coalesce(p_lease_seconds, 300), 3600));
        v_left int; v_reclaimed boolean := false;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  PERFORM simulation.sio_assert_worker(p_tenant, p_domain, p_actor);
  SELECT * INTO e FROM simulation.experiments x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'running' AND x.run_id IS NOT NULL AND (p_experiment_id IS NULL OR x.experiment_id = p_experiment_id) AND NOT (x.experiment_id = ANY (coalesce(p_exclude, ARRAY[]::uuid[])))
   ORDER BY x.started_at, x.experiment_id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF e.stop_pending IS NOT NULL THEN RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', e.stop_pending ->> 'outcome', 'reason', e.stop_pending ->> 'reason'); END IF;
  SELECT count(*) INTO v_left FROM simulation.experiment_chunks k WHERE k.experiment_id = e.experiment_id AND k.state <> 'done';
  IF v_left = 0 THEN RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', 'completed', 'reason', 'paths'); END IF;
  SELECT * INTO c FROM simulation.experiment_chunks k
   WHERE k.experiment_id = e.experiment_id AND (k.state = 'queued' OR (k.state = 'running' AND k.started_at < clock_timestamp() - make_interval(secs => v_lease)))
   ORDER BY k.chunk_index LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;   -- every remaining chunk is in flight under a live lease
  v_reclaimed := c.state = 'running';
  IF (e.progress ->> 'executions')::int >= (e.budget ->> 'max_chunks')::int THEN
    UPDATE simulation.experiments SET stop_pending = jsonb_build_object('outcome', CASE WHEN (e.progress ->> 'chunks_done')::int > 0 THEN 'partial' ELSE 'failed' END, 'reason', 'budget_exceeded')
     WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    PERFORM simulation.sio_event(e, 'budget_exceeded', p_actor, jsonb_build_object('budget', 'max_chunks', 'used', e.progress, 'approved', e.budget), p_correlation);
    RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', e.stop_pending ->> 'outcome', 'reason', 'budget_exceeded');
  END IF;
  UPDATE simulation.experiment_chunks SET state = 'running', attempts = attempts + 1, claimed_by = p_actor, started_at = clock_timestamp(), finished_at = NULL, error = NULL
   WHERE experiment_id = c.experiment_id AND chunk_index = c.chunk_index RETURNING * INTO c;
  UPDATE simulation.experiments SET progress = jsonb_set(progress, '{executions}', to_jsonb((progress ->> 'executions')::int + 1)) WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  IF v_reclaimed THEN PERFORM simulation.sio_event(e, 'chunk_reclaimed', p_actor, jsonb_build_object('chunk_index', c.chunk_index, 'attempt', c.attempts, 'lease_seconds', v_lease), p_correlation); END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = e.run_id;
  RETURN jsonb_build_object('kind', 'chunk', 'experiment_id', e.experiment_id, 'chunk_index', c.chunk_index, 'first_path', c.first_path, 'paths', c.paths, 'attempt', c.attempts,
                            'reclaimed', v_reclaimed, 'run_id', e.run_id, 'chunks_per_tick', coalesce((e.pace ->> 'chunks_per_tick')::int, 1),
                            'run', jsonb_build_object('initial_state', r.initial_state, 'component', r.component, 'constraints', r.constraints, 'shock', r.shock, 'stochastic_mode', r.stochastic_mode,
                                                      'seed', r.seed, 'samples', r.samples, 'jitter', r.jitter, 'interventions', r.interventions, 'assumptions', r.assumptions,
                                                      'model_ref', r.model_ref, 'implementation_digest', r.implementation_digest));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.claim_experiment_chunk(uuid, uuid, uuid, uuid[], int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.claim_experiment_chunk(uuid, uuid, uuid, uuid[], int, uuid, uuid) TO eye_commit;

/* RECORD (the WORKER's): the chunk's attempt is FENCED (a reclaimed chunk's late worker is refused — stale); done → the port computes
   the chunk's aggregate from its paths, merges the running aggregate, writes the CHECKPOINT (the digest chained to the previous one, the
   indicators: numerical stability per measure, latency, cost, failures, constraint satisfaction) and checkpointed (the progress event);
   failed → a retry (queued again) until sio_max_attempts(), then the chunk fails for good. Then the STOP RULES, in order: every chunk done
   → finish completed; a chunk failed for good → partial (chunk_failed; failed when nothing completed); the budget's wall seconds or chunk
   executions exhausted with chunks left → budget_exceeded, the declarer told → partial (failed when nothing completed); the declared
   convergence reached before the declared paths → converged → partial. Answers {next: continue | paused | finish, outcome, reason}. */
CREATE OR REPLACE FUNCTION simulation.record_experiment_chunk(p_experiment_id uuid, p_chunk_index int, p_tenant uuid, p_domain uuid, p_attempt int, p_outcome text, p_sample_totals jsonb,
                                                              p_digest text, p_wall_ms int, p_error text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; c simulation.experiment_chunks%ROWTYPE; v_agg jsonb; v_prev jsonb; v_prev_digest text; v_seq int; v_digest text; v_ind jsonb; v_stab jsonb := '{}'::jsonb;
        m text; v_left int; v_stop jsonb; v_cc jsonb; v_conv jsonb; v_failed_final boolean := false; v_item uuid; v_ev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  PERFORM simulation.sio_assert_worker(p_tenant, p_domain, p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  SELECT * INTO c FROM simulation.experiment_chunks k WHERE k.experiment_id = e.experiment_id AND k.chunk_index = p_chunk_index FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'experiment rejected (unknown_chunk): experiment % has no chunk %', e.experiment_id, p_chunk_index USING ERRCODE = '23503'; END IF;
  IF c.state <> 'running' OR c.attempts <> p_attempt OR e.state NOT IN ('running', 'paused') THEN
    RAISE EXCEPTION 'experiment rejected (stale): chunk % of experiment % is % at attempt % (this record is attempt %; the experiment is %)', p_chunk_index, e.experiment_id, c.state, c.attempts, p_attempt, e.state USING ERRCODE = '2F002';
  END IF;
  IF p_outcome NOT IN ('done', 'failed') THEN RAISE EXCEPTION 'experiment rejected (outcome): a chunk is done or failed' USING ERRCODE = '22023'; END IF;
  UPDATE simulation.experiments SET progress = jsonb_set(progress, '{wall_ms}', to_jsonb((progress ->> 'wall_ms')::bigint + greatest(coalesce(p_wall_ms, 0), 0))) WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  IF p_outcome = 'done' THEN
    IF jsonb_typeof(p_sample_totals) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sample_totals) <> c.paths OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'experiment rejected (chunk): chunk % of experiment % carries % paths with its digest (got %)', p_chunk_index, e.experiment_id, c.paths, coalesce(jsonb_array_length(p_sample_totals), 0) USING ERRCODE = '22023';
    END IF;
    v_agg := simulation.sio_chunk_aggregate(p_sample_totals);
    UPDATE simulation.experiment_chunks SET state = 'done', finished_at = clock_timestamp(), wall_ms = p_wall_ms, sample_totals = p_sample_totals, aggregate = v_agg, digest = p_digest, error = NULL
     WHERE experiment_id = c.experiment_id AND chunk_index = c.chunk_index;
    v_prev := e.aggregate;
    SELECT k.seq, k.digest INTO v_seq, v_prev_digest FROM simulation.experiment_checkpoints k WHERE k.experiment_id = e.experiment_id ORDER BY k.seq DESC LIMIT 1;
    v_seq := coalesce(v_seq, 0) + 1;
    v_digest := encode(sha256(convert_to(coalesce(v_prev_digest, 'genesis:' || e.experiment_id::text) || '|' || p_chunk_index::text || '|' || p_digest, 'UTF8')), 'hex');
    e.aggregate := simulation.sio_merge(e.aggregate, v_agg);
    FOREACH m IN ARRAY e.measures LOOP v_stab := v_stab || jsonb_build_object(m, simulation.sio_stability(e.aggregate, CASE WHEN v_prev = '{}'::jsonb THEN NULL ELSE v_prev END, m)); END LOOP;
    SELECT jsonb_build_object('stage', x.stage, 'outcome', x.outcome, 'set_id', x.set_id, 'set_version', x.set_version) INTO v_cc
      FROM simulation.run_constraint_checks x WHERE x.run_id = e.run_id ORDER BY x.checked_at DESC LIMIT 1;
    v_ind := jsonb_build_object(
      'numerical_stability', v_stab,
      'constraint_satisfaction', coalesce(v_cc, jsonb_build_object('outcome', 'not_applicable', 'note', 'no constraint set applied to the run''s inputs')),
      'latency', jsonb_build_object('chunk_wall_ms', p_wall_ms, 'ms_per_path', round(coalesce(p_wall_ms, 0)::numeric / c.paths, 3)),
      'cost', jsonb_build_object('wall_seconds_used', round(((e.progress ->> 'wall_ms')::numeric) / 1000, 3), 'wall_seconds_approved', (e.budget ->> 'max_wall_seconds')::numeric,
                                 'chunk_executions_used', (e.progress ->> 'executions')::int, 'chunk_executions_approved', (e.budget ->> 'max_chunks')::int),
      'failure_containment', jsonb_build_object('chunk_failures', (e.progress ->> 'failures')::int, 'contained', true, 'executor', 'a separate process per chunk, bounded in time and heap'),
      'reproducibility', jsonb_build_object('seeded', true, 'chunk_digest', p_digest, 'checkpoint_digest', v_digest),
      'rule', 'sio-indicators@1');
    UPDATE simulation.experiments
       SET aggregate = e.aggregate, indicators = v_ind,
           progress = progress || jsonb_build_object('paths_done', (progress ->> 'paths_done')::int + c.paths, 'chunks_done', (progress ->> 'chunks_done')::int + 1, 'last_checkpoint', v_seq)
     WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    INSERT INTO simulation.experiment_checkpoints (checkpoint_id, scope, tenant_id, domain_id, experiment_id, seq, chunk_index, paths_done, chunks_done, aggregate, digest, indicators, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, e.experiment_id, v_seq, p_chunk_index, (e.progress ->> 'paths_done')::int, (e.progress ->> 'chunks_done')::int, e.aggregate, v_digest, v_ind, p_correlation);
    PERFORM simulation.sio_event(e, 'checkpointed', p_actor, jsonb_build_object('seq', v_seq, 'chunk_index', p_chunk_index, 'paths_done', (e.progress ->> 'paths_done')::int, 'declared_paths', e.paths,
              'progress', round(((e.progress ->> 'paths_done')::numeric) / e.paths, 4), 'digest', v_digest, 'wall_ms', p_wall_ms, 'stability', v_stab), p_correlation, p_event_id);
  ELSE
    UPDATE simulation.experiments SET progress = jsonb_set(progress, '{failures}', to_jsonb((progress ->> 'failures')::int + 1)) WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    v_failed_final := c.attempts >= simulation.sio_max_attempts();
    UPDATE simulation.experiment_chunks SET state = CASE WHEN v_failed_final THEN 'failed' ELSE 'queued' END, finished_at = clock_timestamp(), wall_ms = p_wall_ms, error = left(coalesce(p_error, 'the chunk failed'), 500)
     WHERE experiment_id = c.experiment_id AND chunk_index = c.chunk_index;
    PERFORM simulation.sio_event(e, 'chunk_failed', p_actor, jsonb_build_object('chunk_index', p_chunk_index, 'attempt', c.attempts, 'final', v_failed_final, 'error', left(coalesce(p_error, ''), 500)), p_correlation, p_event_id);
  END IF;
  -- THE STOP RULES
  SELECT count(*) INTO v_left FROM simulation.experiment_chunks k WHERE k.experiment_id = e.experiment_id AND k.state <> 'done';
  IF v_left = 0 THEN
    v_stop := jsonb_build_object('outcome', 'completed', 'reason', 'paths');
  ELSIF v_failed_final THEN
    v_stop := jsonb_build_object('outcome', CASE WHEN (e.progress ->> 'chunks_done')::int > 0 THEN 'partial' ELSE 'failed' END, 'reason', 'chunk_failed');
  ELSIF (e.progress ->> 'wall_ms')::numeric > (e.budget ->> 'max_wall_seconds')::numeric * 1000 OR (e.progress ->> 'executions')::int >= (e.budget ->> 'max_chunks')::int THEN
    v_stop := jsonb_build_object('outcome', CASE WHEN (e.progress ->> 'chunks_done')::int > 0 THEN 'partial' ELSE 'failed' END, 'reason', 'budget_exceeded');
    v_ev := simulation.sio_event(e, 'budget_exceeded', p_actor, jsonb_build_object('used', e.progress, 'approved', e.budget, 'chunks_left', v_left), p_correlation);
    v_item := simulation.sio_notify(e, 'simulation.budget', format('Simulation budget exceeded: %s (%s of %s paths done)', e.title, e.progress ->> 'paths_done', e.paths),
                jsonb_build_array(format('used %s s of %s s and %s of %s chunk executions with %s chunk(s) left', round(((e.progress ->> 'wall_ms')::numeric) / 1000, 3), e.budget ->> 'max_wall_seconds',
                                         e.progress ->> 'executions', e.budget ->> 'max_chunks', v_left),
                                  'the experiment stops; its run is PARTIAL with the missing outputs declared (never decision-active), or failed when no path completed'),
                e.declared_by, NULL, v_ev, 'experiment.budget_exceeded', jsonb_build_object('kind', 'budget_exceeded', 'used', e.progress, 'approved', e.budget), interval '24 hours', p_actor, p_correlation);
  ELSIF p_outcome = 'done' AND e.stop_conditions -> 'converged' IS NOT NULL AND jsonb_typeof(e.stop_conditions -> 'converged') = 'object' THEN
    v_conv := e.stop_conditions -> 'converged';
    IF (e.progress ->> 'paths_done')::int >= (v_conv ->> 'min_paths')::int
       AND (v_stab -> (v_conv ->> 'measure') ->> 'ci_half_width')::numeric <= (v_conv ->> 'ci_half_width')::numeric THEN
      v_stop := jsonb_build_object('outcome', 'partial', 'reason', 'converged');
      PERFORM simulation.sio_event(e, 'converged', p_actor, jsonb_build_object('measure', v_conv ->> 'measure', 'stability', v_stab -> (v_conv ->> 'measure'), 'condition', v_conv,
                                                                               'paths_done', (e.progress ->> 'paths_done')::int), p_correlation);
    END IF;
  END IF;
  IF v_stop IS NOT NULL THEN
    UPDATE simulation.experiments SET stop_pending = v_stop WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    RETURN jsonb_build_object('next', 'finish', 'outcome', v_stop ->> 'outcome', 'reason', v_stop ->> 'reason', 'experiment', simulation.sio_experiment_json(e));
  END IF;
  RETURN jsonb_build_object('next', CASE WHEN e.state = 'paused' THEN 'paused' ELSE 'continue' END, 'experiment', simulation.sio_experiment_json(e));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.record_experiment_chunk(uuid, int, uuid, uuid, int, text, jsonb, text, int, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.record_experiment_chunk(uuid, int, uuid, uuid, int, text, jsonb, text, int, text, uuid, uuid, uuid) TO eye_commit;

/* FINISH (the WORKER's): the pending stop (or every chunk done) is written — the RUN completed from the aggregate over every chunk (the
   outputs the service assembled from the chunks' paths in path order, their digest, the sensitivity, the admitted SIM object's header
   digest, the resource), PARTIAL with its declaration, or FAILED; the experiment's state, the MANIFEST (built here from the rows), the
   outcome event and the declarer told (simulation.experiment). */
CREATE OR REPLACE FUNCTION simulation.finish_experiment(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_reason text, p_outputs jsonb, p_outputs_digest text, p_sensitivity jsonb,
                                                        p_header_digest text, p_resource jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; v_expected jsonb; v_done int; v_paths int; v_partial jsonb; v_manifest jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  PERFORM simulation.sio_assert_worker(p_tenant, p_domain, p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  IF e.state NOT IN ('running', 'paused') OR e.run_id IS NULL THEN RAISE EXCEPTION 'experiment rejected (state): experiment % is % (run %)', e.experiment_id, e.state, coalesce(e.run_id::text, 'not opened') USING ERRCODE = '2F002'; END IF;
  SELECT count(*) FILTER (WHERE k.state = 'done'), coalesce(sum(k.paths) FILTER (WHERE k.state = 'done'), 0) INTO v_done, v_paths FROM simulation.experiment_chunks k WHERE k.experiment_id = e.experiment_id;
  v_expected := coalesce(e.stop_pending, CASE WHEN v_paths = e.paths THEN jsonb_build_object('outcome', 'completed', 'reason', 'paths') END);
  IF v_expected IS NULL OR p_outcome IS DISTINCT FROM v_expected ->> 'outcome' OR p_reason IS DISTINCT FROM v_expected ->> 'reason' THEN
    RAISE EXCEPTION 'experiment rejected (stale): experiment % has no pending stop %/% (pending: %)', e.experiment_id, p_outcome, p_reason, coalesce(v_expected::text, 'none') USING ERRCODE = '2F002';
  END IF;
  IF p_outcome = 'completed' AND (v_paths <> e.paths OR p_outputs IS NULL OR p_outputs_digest IS NULL OR p_sensitivity IS NULL OR p_header_digest IS NULL
                                  OR jsonb_array_length(coalesce(p_outputs -> 'stochastic' -> 'sample_totals', '[]'::jsonb)) <> e.paths) THEN
    RAISE EXCEPTION 'experiment rejected (outputs): a completed experiment''s run carries the outputs over all % declared paths with their digest, sensitivity and header', e.paths USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'partial' AND (v_done = 0 OR p_outputs IS NULL OR p_outputs_digest IS NULL OR jsonb_array_length(coalesce(p_outputs -> 'stochastic' -> 'sample_totals', '[]'::jsonb)) <> v_paths) THEN
    RAISE EXCEPTION 'experiment rejected (outputs): a partial run carries the outputs over its % completed paths', v_paths USING ERRCODE = '22023';
  END IF;
  v_partial := CASE WHEN p_outcome = 'partial' THEN simulation.sio_partial_declaration(e, p_reason) END;
  PERFORM simulation.sio_write_run(e, p_outcome, CASE WHEN p_outcome = 'failed' THEN format('experiment %s stopped (%s) before any path completed', e.experiment_id, p_reason) ELSE p_reason END,
                                   v_partial, p_outputs, p_outputs_digest, p_sensitivity, p_header_digest, p_resource, p_actor, p_correlation);
  v_manifest := simulation.sio_manifest(e, p_outputs_digest);
  UPDATE simulation.experiment_chunks SET state = 'failed', error = format('not run: the experiment stopped (%s)', p_reason) WHERE experiment_id = e.experiment_id AND state IN ('queued', 'running');
  UPDATE simulation.experiments SET state = p_outcome, finished_at = clock_timestamp(), stop_pending = NULL, manifest = v_manifest,
         outcome = jsonb_build_object('outcome', p_outcome, 'reason', p_reason, 'completed_paths', v_paths, 'declared_paths', e.paths, 'partial', v_partial)
   WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, p_outcome, p_actor, jsonb_build_object('reason', p_reason, 'run_id', e.run_id, 'completed_paths', v_paths, 'declared_paths', e.paths, 'outputs_digest', p_outputs_digest,
                                                                        'checkpoint_head', v_manifest -> 'checkpoint_head'), p_correlation, p_event_id);
  PERFORM simulation.sio_notify(e, 'simulation.experiment', format('Simulation experiment %s: %s (%s of %s paths)', p_outcome, e.title, v_paths, e.paths),
            jsonb_build_array(format('the experiment ended %s (%s); run %s', p_outcome, p_reason, e.run_id),
                              CASE p_outcome WHEN 'completed' THEN 'the run is completed with its manifest; it is decision-active only once it is promoted for a stated use'
                                             WHEN 'partial' THEN 'the run is PARTIAL — diagnostic only, never decision-active; its missing outputs are declared'
                                             ELSE 'no path completed; the run failed' END),
            e.declared_by, NULL, p_event_id, 'experiment.' || p_outcome, jsonb_build_object('outcome', p_outcome, 'reason', p_reason), interval '24 hours', p_actor, p_correlation);
  RETURN simulation.sio_experiment_json(e);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.finish_experiment(uuid, uuid, uuid, text, text, jsonb, text, jsonb, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.finish_experiment(uuid, uuid, uuid, text, text, jsonb, text, jsonb, text, jsonb, uuid, uuid, uuid) TO eye_commit;

/* PAUSE (simulation.experiment.pause): running → paused; honoured between chunks (a chunk in flight still lands and checkpoints). */
CREATE OR REPLACE FUNCTION simulation.pause_experiment(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.pause']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  PERFORM simulation.sio_assert_operator(e, p_actor, 'pausing');
  IF e.state <> 'running' THEN RAISE EXCEPTION 'experiment rejected (state): experiment % is %, not running', e.experiment_id, e.state USING ERRCODE = '2F002'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 4 THEN RAISE EXCEPTION 'experiment rejected (reason): a pause says why' USING ERRCODE = '22023'; END IF;
  UPDATE simulation.experiments SET state = 'paused' WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'paused', p_actor, jsonb_build_object('reason', btrim(p_reason), 'paths_done', (e.progress ->> 'paths_done')::int, 'last_checkpoint', e.progress -> 'last_checkpoint',
                                                                       'in_flight', (SELECT count(*) FROM simulation.experiment_chunks k WHERE k.experiment_id = e.experiment_id AND k.state = 'running')), p_correlation, p_event_id);
  RETURN simulation.sio_experiment_json(e);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.pause_experiment(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.pause_experiment(uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* RESUME (simulation.experiment.resume): paused → running, from the last checkpoint (the next claim takes the first chunk not done). */
CREATE OR REPLACE FUNCTION simulation.resume_experiment(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.resume']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  PERFORM simulation.sio_assert_operator(e, p_actor, 'resuming');
  IF e.state <> 'paused' THEN RAISE EXCEPTION 'experiment rejected (state): experiment % is %, not paused', e.experiment_id, e.state USING ERRCODE = '2F002'; END IF;
  UPDATE simulation.experiments SET state = 'running' WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'resumed', p_actor, jsonb_build_object('reason', btrim(coalesce(p_reason, '')), 'from_checkpoint', e.progress -> 'last_checkpoint', 'paths_done', (e.progress ->> 'paths_done')::int), p_correlation, p_event_id);
  RETURN simulation.sio_experiment_json(e);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.resume_experiment(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.resume_experiment(uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* CANCEL (simulation.experiment.cancel): declared | approved | running | paused → cancelled. A started experiment's run is written: PARTIAL
   over the chunks done (reason cancelled; the outputs the service assembled from those chunks — the chunk set it read is checked against
   the rows: a chunk that landed since is stale), or FAILED when no path completed. Chunks in flight are failed (their late records are
   refused by the fence). */
CREATE OR REPLACE FUNCTION simulation.cancel_experiment(p_experiment_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_done_chunks int[], p_outputs jsonb, p_outputs_digest text, p_resource jsonb,
                                                        p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; v_done int[]; v_paths int; v_partial jsonb; v_outcome text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.cancel']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  e := simulation.sio_lock(p_experiment_id, p_tenant, p_domain);
  PERFORM simulation.sio_assert_operator(e, p_actor, 'cancelling');
  IF e.state NOT IN ('declared', 'approved', 'running', 'paused') THEN RAISE EXCEPTION 'experiment rejected (state): experiment % is % and finished', e.experiment_id, e.state USING ERRCODE = '2F002'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'experiment rejected (reason): a cancellation says why, in at least 8 characters' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(array_agg(k.chunk_index ORDER BY k.chunk_index), ARRAY[]::int[]), coalesce(sum(k.paths), 0) INTO v_done, v_paths FROM simulation.experiment_chunks k WHERE k.experiment_id = e.experiment_id AND k.state = 'done';
  IF e.run_id IS NOT NULL THEN
    IF v_done IS DISTINCT FROM coalesce((SELECT array_agg(x ORDER BY x) FROM unnest(p_done_chunks) x), ARRAY[]::int[]) THEN
      RAISE EXCEPTION 'experiment rejected (stale): the chunks done are now % (the cancellation was assembled over %)', v_done, p_done_chunks USING ERRCODE = '2F002';
    END IF;
    v_outcome := CASE WHEN cardinality(v_done) > 0 THEN 'partial' ELSE 'failed' END;
    IF v_outcome = 'partial' AND (p_outputs IS NULL OR p_outputs_digest IS NULL OR jsonb_array_length(coalesce(p_outputs -> 'stochastic' -> 'sample_totals', '[]'::jsonb)) <> v_paths) THEN
      RAISE EXCEPTION 'experiment rejected (outputs): a partial run carries the outputs over its % completed paths', v_paths USING ERRCODE = '22023';
    END IF;
    v_partial := CASE WHEN v_outcome = 'partial' THEN simulation.sio_partial_declaration(e, 'cancelled') || jsonb_build_object('cancellation', btrim(p_reason)) END;
    PERFORM simulation.sio_write_run(e, v_outcome, format('experiment %s cancelled before any path completed: %s', e.experiment_id, btrim(p_reason)), v_partial, p_outputs, p_outputs_digest, NULL, NULL, p_resource, p_actor, p_correlation);
  END IF;
  UPDATE simulation.experiment_chunks SET state = 'failed', error = 'cancelled' WHERE experiment_id = e.experiment_id AND state IN ('queued', 'running');
  UPDATE simulation.experiments SET state = 'cancelled', finished_at = clock_timestamp(), stop_pending = NULL,
         manifest = CASE WHEN e.run_id IS NULL THEN NULL ELSE simulation.sio_manifest(e, p_outputs_digest) END,
         outcome = jsonb_build_object('outcome', 'cancelled', 'reason', btrim(p_reason), 'run_state', v_outcome, 'completed_paths', v_paths, 'declared_paths', e.paths, 'partial', v_partial)
   WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  PERFORM simulation.sio_event(e, 'cancelled', p_actor, jsonb_build_object('reason', btrim(p_reason), 'run_id', e.run_id, 'run_state', v_outcome, 'completed_paths', v_paths), p_correlation, p_event_id);
  RETURN simulation.sio_experiment_json(e);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.cancel_experiment(uuid, uuid, uuid, text, int[], jsonb, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.cancel_experiment(uuid, uuid, uuid, text, int[], jsonb, text, jsonb, uuid, uuid, uuid) TO eye_commit;

-- §O.5 THE READS (invoker, under the caller's RLS) ─────────────────────
CREATE OR REPLACE FUNCTION simulation.experiment_read(p_experiment_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT simulation.sio_experiment_json(e) FROM simulation.experiments e WHERE e.experiment_id = p_experiment_id
$$;
CREATE OR REPLACE FUNCTION simulation.experiments_list(p_state text, p_limit int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.declared_at DESC), '[]'::jsonb) FROM (
    SELECT (to_jsonb(e) - 'scope' - 'correlation_id' - 'aggregate') || jsonb_build_object('budget_digest', simulation.sio_budget_digest(e.budget),
             'run', (SELECT jsonb_build_object('run_id', r.run_id, 'state', r.state, 'validity', r.validity, 'partial', r.partial) FROM simulation.runs_current r WHERE r.run_id = e.run_id)) AS j, e.declared_at
      FROM simulation.experiments e WHERE p_state IS NULL OR e.state = p_state ORDER BY e.declared_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) x
$$;
/* The chunks' paths of an experiment (the worker's assembly of the run's outputs, and the cancellation's), in path order. */
CREATE OR REPLACE FUNCTION simulation.experiment_chunk_paths(p_experiment_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('chunk_index', c.chunk_index, 'first_path', c.first_path, 'paths', c.paths, 'digest', c.digest, 'wall_ms', c.wall_ms, 'sample_totals', c.sample_totals) ORDER BY c.chunk_index), '[]'::jsonb)
    FROM simulation.experiment_chunks c WHERE c.experiment_id = p_experiment_id AND c.state = 'done'
$$;
GRANT EXECUTE ON FUNCTION simulation.experiment_read(uuid), simulation.experiments_list(text, int), simulation.experiment_chunk_paths(uuid) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION simulation.sio_experiment_json(simulation.experiments), simulation.sio_budget_digest(jsonb) TO eye_app, eye_commit;

-- §O.6 THE SIM OBJECT of an experiment's completed run is admitted by the worker's own write (as simulation.run.complete admits a run's).
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('simulation.experiment.execute', ARRAY['SIM'], 'The executor of an experiment''s chunks completes its run from the aggregate over every chunk and admits that run''s SIM object and nothing else (B31 §O, 0099)')
ON CONFLICT (action) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- section `validity` (§V) — CP-6 B31 part V (2026-10-01): F-P5-09 (FEX-13, L8-I05, PR-35-005, AI-28-005, V03-T-156/-353, OBJ-29) and the
-- "B31:" pieces of F-P4-07 (V00-T-055, AI-49-002, V03-T-332) and F-P4-09 (ES-37-008, PR-33-005, AI-49-004).
--
--   §V1  THE DECISION USE of a run — decision | diagnostic | refused, with the reasons (simulation.run_decision_use); a partial or unpromoted
--        result is DIAGNOSTIC, an invalidated, failed or unfinished one REFUSED. Labelled on this part's reads (the run, the comparison, the
--        package's options).
--   §V2  THE GATE: a domain's DECISION-USE POLICY (simulation.decision_use_policies, versioned, set by a named human) — while it requires a
--        decision-grade result, a package version is neither PROPOSED nor COMMITTED when its recommended option cites a run that is not
--        (the trigger siv_decision_use_gate on decision.package_events, the B27 plurality-gate idiom). decision.derive_option is NOT
--        re-declared: it already refuses an invalidated run and every run that is not completed (a partial one included).
--   §V3  THE INVALIDATION'S REACH on a package (simulation.package_run_validity): every cited run with its validity and use, the option citing
--        an invalidated run marked, the recommended option named.
--   §V4  THE TWIN CORRECTION'S REACH (AI-28-005): when a twin version is UNVERIFIED (twin.twin_events version.unverified), the runs on it, the
--        packages citing them, their COMMITMENTS and the EVALUATION RESULTS resting on them (decision outcomes observed on or simulated by
--        that version, the twin's validations of it) are identified, recorded (simulation.validity_reach, append-only) and their owners
--        tasked (simulation.validity); a person may identify it again (simulation.identify_validity_reach).
--   §V5  F-P4-09: the scenario QUALITY failure (0097 §Q) and the branch SUSPENSION consulted by simulation (run rejected (scenario_quality)),
--        by the promotion to simulation (promotion to simulation rejected (<class>), a trigger on the branch's simulation_candidate_at — the
--        review is not re-declared) and by the warning gate (the warning marked input_unverified, via scenario_quality).
--   §V6  F-P4-07: the ASU → SCN graph.dependencies row written on a register link and retired on the last unlink (a trigger on
--        prediction.scenario_assumptions — link_scenario_assumption is not re-declared).
--   §V7  F-P4-07: the CLAIM and INDICATOR invalidation conditions SUSPEND the live branches their critical links name (triggers on a claim's
--        disputed / withdrawn version and on an indicator's breach, through 0097's suspension core).
--   §V8  F-P4-07 / AI-49-002: a branch BOUND to a baseline twin state (an admitted twin version and its state digest), initial conditions, a
--        constraint set and the factors its critical assumptions move (prediction.branch_twin_bindings — a new PREDICTION table: the
--        phase4-acceptance D8 pin moves 69 → 70); a run on a bound branch must start from that state (run rejected (branch_binding)).
--   §V9  AI-49-004: the SENSITIVITY TO MATERIAL ASSUMPTIONS — a run's sensitivity factors read against the critical assumptions of its
--        branch's register (simulation.run_assumption_sensitivity; §I's sensitivity_analyses read through to_regclass).
-- Nothing earlier is edited; open_run, review_scenario, raise_warning, derive_option, link/unlink_scenario_assumption are not re-declared;
-- the run-event vocabulary is untouched (this part writes no run event). Every figure a harness seeds is SYNTHETIC.

-- ─────────────────────────────────────────────────────────────────────
-- §V1 THE DECISION USE (an invoker read under the caller's RLS)
-- ─────────────────────────────────────────────────────────────────────
/* A run's DECISION USE: `refused` (no result: opened, failed; invalidated; unfit), `diagnostic` (partial; not promoted; a live challenge;
   its branch suspended; its scenario failing coherence or quality), else `decision` (completed, valid, promoted, undisputed). The reasons
   name each cause {class, detail}; the label is what every read that serves the run shows. NULL when the run is not visible. */
CREATE OR REPLACE FUNCTION simulation.run_decision_use(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_refused jsonb := '[]'::jsonb; v_diag jsonb := '[]'::jsonb; v_live int; v_q record; v_b record; v_coh text; v_use text;
BEGIN
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.state = 'opened' THEN v_refused := v_refused || jsonb_build_object('class', 'unfinished', 'detail', 'the run is still open; it has no result'); END IF;
  IF r.state = 'failed' THEN v_refused := v_refused || jsonb_build_object('class', 'failed', 'detail', 'the run failed; it has no result to rest a decision on'); END IF;
  IF r.validity = 'invalidated' THEN
    v_refused := v_refused || jsonb_build_object('class', 'invalidated', 'detail', format('invalidated at %s (%s: %s)', r.invalidated_at, r.invalidation ->> 'trigger', r.invalidation ->> 'reason'));
  ELSIF r.fitness_state = 'unfit' THEN
    v_refused := v_refused || jsonb_build_object('class', 'unfit', 'detail', 'the result was judged unfit');
  END IF;
  IF r.state = 'partial' THEN
    v_diag := v_diag || jsonb_build_object('class', 'partial', 'detail', format('a partial run (%s): %s of %s paths; missing %s', r.partial ->> 'reason', coalesce(r.partial ->> 'completed_paths', '?'),
                                                                     coalesce(r.partial ->> 'declared_paths', '?'), coalesce(r.partial -> 'missing_outputs', '[]'::jsonb)));
  END IF;
  IF r.state IN ('completed', 'partial') AND r.promotion_id IS NULL THEN
    v_diag := v_diag || jsonb_build_object('class', 'unpromoted', 'detail', 'no reviewer has promoted the result as fit for a stated use (OBJ-29)');
  END IF;
  SELECT count(*) INTO v_live FROM simulation.challenges c WHERE c.run_id = p_run_id AND c.state IN ('open', 'rerun_requested');
  IF v_live > 0 THEN v_diag := v_diag || jsonb_build_object('class', 'challenged', 'detail', format('%s live challenge(s): a disputed result', v_live)); END IF;
  IF r.scenario_branch_id IS NOT NULL THEN
    SELECT b.state, b.name, b.suspension_reason INTO v_b FROM prediction.branches_current b WHERE b.branch_id = r.scenario_branch_id;
    IF FOUND AND v_b.state = 'suspended' THEN
      v_diag := v_diag || jsonb_build_object('class', 'branch_suspended', 'detail', format('branch "%s" is suspended: %s', v_b.name, v_b.suspension_reason));
    END IF;
  END IF;
  IF r.scenario_id IS NOT NULL THEN
    SELECT s.coherence_state INTO v_coh FROM prediction.scenarios_current s WHERE s.scenario_id = r.scenario_id;
    IF v_coh = 'failed' THEN v_diag := v_diag || jsonb_build_object('class', 'scenario_incoherent', 'detail', 'the scenario fails its coherence check (v1)'); END IF;
    SELECT e.outcome, e.evaluated_at, e.evaluation_id INTO v_q FROM prediction.scenario_quality_evaluations e WHERE e.scenario_id = r.scenario_id ORDER BY e.evaluated_at DESC, e.evaluation_id DESC LIMIT 1;
    IF FOUND AND v_q.outcome = 'failed' THEN
      v_diag := v_diag || jsonb_build_object('class', 'scenario_quality', 'detail', format('the scenario''s quality evaluation %s of %s failed', v_q.evaluation_id, v_q.evaluated_at));
    END IF;
  END IF;
  v_use := CASE WHEN jsonb_array_length(v_refused) > 0 THEN 'refused' WHEN jsonb_array_length(v_diag) > 0 THEN 'diagnostic' ELSE 'decision' END;
  RETURN jsonb_build_object('run_id', r.run_id, 'use', v_use, 'state', r.state, 'validity', r.validity, 'fitness_state', r.fitness_state, 'promotion_id', r.promotion_id, 'promoted_for', r.promoted_for,
    'reasons', v_refused || v_diag,
    'label', CASE v_use WHEN 'decision' THEN format('DECISION-GRADE: promoted as fit for "%s"', r.promoted_for)
                        WHEN 'diagnostic' THEN 'DIAGNOSTIC ONLY — not decision-active: ' || (SELECT string_agg(x ->> 'class', ', ') FROM jsonb_array_elements(v_diag) x)
                        ELSE 'REFUSED for decision use: ' || (SELECT string_agg(x ->> 'class', ', ') FROM jsonb_array_elements(v_refused) x) END,
    'partial', r.partial, 'invalidated_at', r.invalidated_at, 'invalidation', r.invalidation - 'dependants');
END $$;
GRANT EXECUTE ON FUNCTION simulation.run_decision_use(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §V2 THE DOMAIN'S DECISION-USE POLICY AND THE GATE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE simulation.decision_use_policies (
  policy_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  version            int NOT NULL CHECK (version >= 1),
  require_decision_use boolean NOT NULL,
  rationale          text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 16 AND 2048),
  set_by             uuid NOT NULL,
  set_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT siv_policy_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX siv_policy_version ON simulation.decision_use_policies (tenant_id, domain_id, version);
CREATE TRIGGER siv_policy_append_only BEFORE UPDATE OR DELETE ON simulation.decision_use_policies FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE simulation.decision_use_policies IS 'B31 (0099 §V; F-P5-09, OBJ-29, FEX-13): a domain''s DECISION-USE POLICY, versioned and append-only (the highest version stands), set by a named human — while require_decision_use holds, a package version is neither proposed nor committed when its recommended option cites a run whose decision use is not `decision` (siv_decision_use_gate). No row: the gate is off (older packages keep their behaviour).';

/* The standing policy of a domain (the highest version), or NULL. */
CREATE OR REPLACE FUNCTION simulation.siv_policy_of(p_tenant uuid, p_domain uuid) RETURNS simulation.decision_use_policies
LANGUAGE sql STABLE SET search_path = simulation, pg_catalog, pg_temp AS $$
  SELECT * FROM simulation.decision_use_policies p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain ORDER BY p.version DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION simulation.siv_policy_of(uuid, uuid) TO eye_app, eye_commit;

/* SET the policy (a named human, the acting principal; the next version names the version it read — none for the first). */
CREATE OR REPLACE FUNCTION simulation.set_decision_use_policy(
  p_policy_id uuid, p_tenant uuid, p_domain uuid, p_require boolean, p_rationale text, p_expected_version int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur simulation.decision_use_policies%ROWTYPE; n simulation.decision_use_policies%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.validity.policy']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'run use rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'run use rejected (actor): a named, active member sets the decision-use policy' USING ERRCODE = '42501'; END IF;
  IF p_require IS NULL THEN RAISE EXCEPTION 'run use rejected (require): the policy says whether a decision-grade result is required (require: true|false)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_rationale, ''))) NOT BETWEEN 16 AND 2048 THEN RAISE EXCEPTION 'run use rejected (rationale): the policy states why (16-2048 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM simulation.siv_policy_of(p_tenant, p_domain);
  IF cur.policy_id IS NOT NULL AND p_expected_version IS DISTINCT FROM cur.version THEN
    RAISE EXCEPTION 'run use rejected (stale): the domain''s policy stands at version %, the request names version %; reload and set it again', cur.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
  END IF;
  IF cur.policy_id IS NULL AND p_expected_version IS NOT NULL THEN
    RAISE EXCEPTION 'run use rejected (stale): the domain has no policy yet; the first one names no version' USING ERRCODE = '22023';
  END IF;
  INSERT INTO simulation.decision_use_policies (policy_id, scope, tenant_id, domain_id, version, require_decision_use, rationale, set_by, correlation_id)
  VALUES (p_policy_id, 'DOMAIN', p_tenant, p_domain, coalesce(cur.version, 0) + 1, p_require, btrim(p_rationale), p_actor, p_correlation) RETURNING * INTO n;
  RETURN to_jsonb(n) - 'scope' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.set_decision_use_policy(uuid,uuid,uuid,boolean,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.set_decision_use_policy(uuid,uuid,uuid,boolean,text,int,uuid,uuid) TO eye_commit;

/* THE GATE (BEFORE INSERT on decision.package_events, version.proposed and package.committed): under a policy that requires it, the
   RECOMMENDED option's cited runs must each be decision-grade. A refused use names the run and its reasons; a diagnostic one says the run
   may still be read diagnostically. No policy (or require false): nothing is checked. */
CREATE OR REPLACE FUNCTION simulation.siv_decision_use_gate() RETURNS trigger
SECURITY DEFINER SET search_path = simulation, decision, prediction, pg_catalog, pg_temp AS $$
DECLARE pol simulation.decision_use_policies%ROWTYPE; v_version int; v_key text; o decision.options%ROWTYPE; c jsonb; u jsonb;
BEGIN
  SELECT * INTO pol FROM simulation.siv_policy_of(NEW.tenant_id, NEW.domain_id);
  IF pol.policy_id IS NULL OR NOT pol.require_decision_use THEN RETURN NEW; END IF;
  v_version := (NEW.details ->> 'version')::int;
  v_key := coalesce(NEW.details -> 'choice' ->> 'option_key',
                    (SELECT pv.choice ->> 'option_key' FROM decision.package_versions pv WHERE pv.package_id = NEW.package_id AND pv.version = v_version));
  IF v_key IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO o FROM decision.options x WHERE x.package_id = NEW.package_id AND x.version = v_version AND x.key = v_key;
  IF NOT FOUND THEN RETURN NEW; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(o.consequences) LOOP
    IF (c ->> 'kind') <> 'run' THEN CONTINUE; END IF;
    u := simulation.run_decision_use((c ->> 'id')::uuid);
    IF u IS NULL OR (u ->> 'use') = 'decision' THEN CONTINUE; END IF;
    RAISE EXCEPTION 'run use rejected (%): package % version % recommends option "%", which cites run % — %; the domain''s decision-use policy (v%) requires a decision-grade result at %: %',
      CASE u ->> 'use' WHEN 'refused' THEN 'refused' ELSE 'diagnostic_only' END, NEW.package_id, v_version, v_key, c ->> 'id', u ->> 'label', pol.version,
      CASE NEW.event WHEN 'version.proposed' THEN 'the proposal' ELSE 'the commitment' END,
      CASE u ->> 'use' WHEN 'refused' THEN 'cite another run (a re-run of the corrected case)' ELSE 'promote the result (a reviewer other than its operator) or cite another run; it stays readable as a diagnostic' END
      USING ERRCODE = '22023';
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.siv_decision_use_gate() FROM PUBLIC;
CREATE TRIGGER siv_decision_use_gate BEFORE INSERT ON decision.package_events
  FOR EACH ROW WHEN (NEW.event IN ('version.proposed', 'package.committed')) EXECUTE FUNCTION simulation.siv_decision_use_gate();

-- ─────────────────────────────────────────────────────────────────────
-- §V3 THE INVALIDATION'S REACH ON A PACKAGE (an invoker read)
-- ─────────────────────────────────────────────────────────────────────
/* The package with its current and committed versions' options, each cited run with its validity and DECISION USE; an option citing an
   invalidated run is MARKED input_invalidated (decision.derive_option refuses it at the next set, carry, proposal or reopen); the
   recommended option named; the domain's policy beside it. NULL when the package is not visible. */
CREATE OR REPLACE FUNCTION simulation.package_run_validity(p_package_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = simulation, decision, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; v_versions jsonb := '[]'::jsonb; v int; pv decision.package_versions%ROWTYPE; v_opts jsonb; pol simulation.decision_use_policies%ROWTYPE;
BEGIN
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  FOR v IN SELECT DISTINCT y FROM unnest(ARRAY[p.current_version, p.committed_version]) y WHERE y IS NOT NULL ORDER BY y LOOP
    SELECT * INTO pv FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = v;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'option_id', o.option_id, 'key', o.key, 'title', o.title, 'kind', o.kind, 'recommended', o.key = (pv.choice ->> 'option_key'),
             'runs', runs.list,
             'marked', CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(runs.list) q WHERE q ->> 'validity' = 'invalidated') THEN 'input_invalidated'
                            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(runs.list) q WHERE q ->> 'use' = 'refused') THEN 'input_refused'
                            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(runs.list) q WHERE q ->> 'use' = 'diagnostic') THEN 'diagnostic_only'
                            ELSE NULL END,
             'refused_on_next_derivation', EXISTS (SELECT 1 FROM jsonb_array_elements(runs.list) q WHERE q ->> 'use' = 'refused'))
           ORDER BY o.key), '[]'::jsonb) INTO v_opts
      FROM decision.options o
      CROSS JOIN LATERAL (SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', c ->> 'id', 'validity', u ->> 'validity', 'state', u ->> 'state', 'use', u ->> 'use', 'label', u ->> 'label',
                                                                      'reasons', u -> 'reasons', 'invalidated_at', u -> 'invalidated_at', 'invalidation', u -> 'invalidation')), '[]'::jsonb) AS list
                            FROM jsonb_array_elements(o.consequences) c CROSS JOIN LATERAL (SELECT simulation.run_decision_use((c ->> 'id')::uuid) AS u) uu
                           WHERE (c ->> 'kind') = 'run' AND uu.u IS NOT NULL) AS runs(list)
     WHERE o.package_id = p_package_id AND o.version = v;
    v_versions := v_versions || jsonb_build_object('version', v, 'state', pv.state, 'recommended_option', pv.choice ->> 'option_key', 'options', v_opts);
  END LOOP;
  SELECT * INTO pol FROM simulation.siv_policy_of(p.tenant_id, p.domain_id);
  RETURN jsonb_build_object('package_id', p.package_id, 'title', p.title, 'owner_principal_id', p.owner_principal_id, 'state', p.state, 'current_version', p.current_version,
    'committed_version', p.committed_version, 'versions', v_versions,
    'input_invalidated', EXISTS (SELECT 1 FROM jsonb_array_elements(v_versions) x, jsonb_array_elements(x -> 'options') y WHERE y ->> 'marked' = 'input_invalidated'),
    'policy', CASE WHEN pol.policy_id IS NULL THEN NULL ELSE jsonb_build_object('version', pol.version, 'require_decision_use', pol.require_decision_use, 'set_by', pol.set_by, 'set_at', pol.set_at) END);
END $$;
GRANT EXECUTE ON FUNCTION simulation.package_run_validity(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §V4 THE TWIN CORRECTION'S REACH (AI-28-005)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE simulation.validity_reach (
  reach_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  twin_id            uuid NOT NULL,
  twin_version       int NOT NULL,
  trigger            text NOT NULL CHECK (trigger IN ('twin_unverified', 'operator')),
  cause_event_id     uuid,
  runs               jsonb NOT NULL CHECK (jsonb_typeof(runs) = 'array'),
  packages           jsonb NOT NULL CHECK (jsonb_typeof(packages) = 'array'),
  commitments        jsonb NOT NULL CHECK (jsonb_typeof(commitments) = 'array'),
  evaluation_results jsonb NOT NULL CHECK (jsonb_typeof(evaluation_results) = 'object'),
  items              jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  identified_by      uuid NOT NULL,
  identified_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT siv_reach_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX siv_reach_twin ON simulation.validity_reach (twin_id, twin_version, identified_at DESC);
CREATE TRIGGER siv_reach_append_only BEFORE UPDATE OR DELETE ON simulation.validity_reach FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE simulation.validity_reach IS 'B31 (0099 §V; AI-28-005): each IDENTIFICATION of what a twin version''s correction reaches — the runs on the version, the packages citing them, their commitments (with the open items and owners) and the evaluation results resting on them (decision outcomes observed on the version or simulated by its runs; the twin''s validations of the version) — and the attention items raised to their owners (simulation.validity). Append-only.';

/* What a twin version reaches (pure; the caller's view — the trigger and the port run it as the definer). */
CREATE OR REPLACE FUNCTION simulation.siv_reach_of(p_tenant uuid, p_domain uuid, p_twin uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = simulation, decision, twin, pg_catalog, pg_temp AS $$
  WITH runs AS (
    SELECT r.run_id, r.state, r.validity, r.run_kind, r.opened_at FROM simulation.runs_current r
     WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.twin_id = p_twin AND r.twin_version = p_version
  ), pk AS (
    SELECT p.package_id, p.title, p.owner_principal_id, p.state, p.current_version, p.committed_version, p.declared_at,
           (SELECT array_agg(DISTINCT o.key ORDER BY o.key) FROM decision.options o WHERE o.package_id = p.package_id
               AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE (c ->> 'kind') = 'run' AND (c ->> 'id') IN (SELECT run_id::text FROM runs))) AS keys
      FROM decision.packages_current p
     WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state NOT IN ('rejected', 'withdrawn')
       AND EXISTS (SELECT 1 FROM decision.options o CROSS JOIN LATERAL jsonb_array_elements(o.consequences) c
                    WHERE o.package_id = p.package_id AND (c ->> 'kind') = 'run' AND (c ->> 'id') IN (SELECT run_id::text FROM runs))
  ), cm AS (
    SELECT c.commitment_id, c.package_id, c.version, c.committed_at,
           coalesce((SELECT jsonb_agg(jsonb_build_object('item_id', i.item_id, 'title', i.title, 'kind', i.kind, 'owner_principal_id', i.owner_principal_id, 'state', i.state, 'due_at', i.due_at) ORDER BY i.created_at)
                       FROM decision.commitment_items i WHERE i.commitment_id = c.commitment_id AND i.state NOT IN ('done', 'waived', 'cancelled')), '[]'::jsonb) AS items
      FROM decision.commitments c JOIN pk ON pk.package_id = c.package_id
  ), oc AS (
    SELECT o.outcome_id, o.package_id, o.version, o.criterion_key, o.met, o.recorded_by, o.recorded_at,
           CASE WHEN (o.observed_on ->> 'twin_id') = p_twin::text AND (o.observed_on ->> 'version') = p_version::text THEN 'observed_on' ELSE 'simulated' END AS via
      FROM decision.outcomes o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain
       AND (((o.observed_on ->> 'twin_id') = p_twin::text AND (o.observed_on ->> 'version') = p_version::text)
            OR EXISTS (SELECT 1 FROM runs WHERE runs.run_id::text = o.simulated ->> 'run_id'))
  )
  SELECT jsonb_build_object(
    'runs', coalesce((SELECT jsonb_agg(jsonb_build_object('run_id', run_id, 'state', state, 'validity', validity, 'run_kind', run_kind) ORDER BY opened_at) FROM runs), '[]'::jsonb),
    'packages', coalesce((SELECT jsonb_agg(jsonb_build_object('package_id', package_id, 'title', title, 'owner_principal_id', owner_principal_id, 'state', state, 'current_version', current_version,
                                                               'committed_version', committed_version, 'option_keys', to_jsonb(keys)) ORDER BY declared_at) FROM pk), '[]'::jsonb),
    'commitments', coalesce((SELECT jsonb_agg(jsonb_build_object('commitment_id', commitment_id, 'package_id', package_id, 'version', version, 'committed_at', committed_at, 'open_items', items) ORDER BY committed_at) FROM cm), '[]'::jsonb),
    'evaluation_results', jsonb_build_object(
      'outcomes', coalesce((SELECT jsonb_agg(jsonb_build_object('outcome_id', outcome_id, 'package_id', package_id, 'version', version, 'criterion_key', criterion_key, 'met', met, 'via', via,
                                                                 'recorded_by', recorded_by, 'recorded_at', recorded_at) ORDER BY recorded_at) FROM oc), '[]'::jsonb),
      'twin_validations', coalesce((SELECT jsonb_agg(jsonb_build_object('validation_id', v.validation_id, 'verdict', v.verdict, 'validated_by', v.validated_by, 'validated_at', v.validated_at) ORDER BY v.validated_at)
                                      FROM twin.validations v WHERE v.twin_id = p_twin AND v.version = p_version), '[]'::jsonb)))
$$;
GRANT EXECUTE ON FUNCTION simulation.siv_reach_of(uuid, uuid, uuid, int) TO eye_app, eye_commit;

/* The core (private): record the reach and TASK the owners — one simulation.validity item per affected package that carries a commitment
   or an evaluation result (the package's owner), and one per open commitment item whose owner is someone else (subject commitment_item);
   the 0095 notify idiom (open when the owner is an active human, else unrouted). Nothing is raised when nothing rests on the version. */
CREATE OR REPLACE FUNCTION simulation.siv_record_reach(p_reach_id uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_version int, p_trigger text, p_cause uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, decision, twin, executive, pg_catalog, pg_temp AS $$
DECLARE v_reach jsonb; v_items jsonb := '[]'::jsonb; p jsonb; ci jsonb; v_item uuid; v_state text; v_title text; v_reasons jsonb; v_cause uuid := coalesce(p_cause, p_reach_id);
        v_has boolean; v_twin_title text; v_due timestamptz := clock_timestamp() + interval '72 hours'; v_row simulation.validity_reach%ROWTYPE;
BEGIN
  v_reach := simulation.siv_reach_of(p_tenant, p_domain, p_twin, p_version);
  SELECT t.title INTO v_twin_title FROM twin.twins_current t WHERE t.twin_id = p_twin;
  FOR p IN SELECT * FROM jsonb_array_elements(v_reach -> 'packages') LOOP
    v_has := EXISTS (SELECT 1 FROM jsonb_array_elements(v_reach -> 'commitments') c WHERE c ->> 'package_id' = p ->> 'package_id')
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_reach -> 'evaluation_results' -> 'outcomes') o WHERE o ->> 'package_id' = p ->> 'package_id');
    IF NOT v_has THEN CONTINUE; END IF;
    v_item := gen_random_uuid();
    v_state := CASE WHEN decision.is_active_human((p ->> 'owner_principal_id')::uuid, p_tenant) THEN 'open' ELSE 'unrouted' END;
    v_title := left(format('Twin corrected: "%s" rests on version %s of %s', p ->> 'title', p_version, coalesce(v_twin_title, p_twin::text)), 512);
    v_reasons := jsonb_build_array(format('version %s of twin %s was %s; the runs on it no longer stand verified', p_version, coalesce(v_twin_title, p_twin::text), CASE p_trigger WHEN 'twin_unverified' THEN 'unverified (a cited input was corrected)' ELSE 'identified as corrected by a person' END),
      'the commitments and evaluation results resting on those runs are listed on the validity page; re-run on a verified version and review the commitment');
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'simulation.validity', 'package', (p ->> 'package_id')::uuid, v_cause, 'validity.reach', v_title, 'material', v_state,
            (p ->> 'owner_principal_id')::uuid, '{}',
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C3', 'confidence', 1)),
            jsonb_build_object('reach_id', p_reach_id, 'twin_id', p_twin, 'twin_version', p_version, 'package_id', p ->> 'package_id', 'option_keys', p -> 'option_keys'),
            v_due, 0, p_correlation)
    ON CONFLICT ON CONSTRAINT xai_once DO NOTHING;
    IF FOUND THEN
      PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
                jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'owner', p ->> 'owner_principal_id', 'route_roles', '[]'::jsonb, 'due_at', v_due,
                                   'cause_event_id', v_cause, 'cause_event_type', 'validity.reach', 'unrouted', v_state = 'unrouted', 'reach_id', p_reach_id), p_correlation);
      v_items := v_items || jsonb_build_object('item_id', v_item, 'subject_kind', 'package', 'subject_id', p ->> 'package_id', 'owner_principal_id', p ->> 'owner_principal_id', 'state', v_state);
    END IF;
  END LOOP;
  FOR ci IN SELECT i FROM jsonb_array_elements(v_reach -> 'commitments') c, jsonb_array_elements(c -> 'open_items') i LOOP
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) x WHERE x ->> 'owner_principal_id' = ci ->> 'owner_principal_id') THEN CONTINUE; END IF;
    v_item := gen_random_uuid();
    v_state := CASE WHEN decision.is_active_human((ci ->> 'owner_principal_id')::uuid, p_tenant) THEN 'open' ELSE 'unrouted' END;
    v_reasons := jsonb_build_array(format('the commitment item "%s" rests on runs of version %s of twin %s, which was corrected', ci ->> 'title', p_version, coalesce(v_twin_title, p_twin::text)));
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'simulation.validity', 'commitment_item', (ci ->> 'item_id')::uuid, v_cause, 'validity.reach',
            left(format('Twin corrected: commitment item "%s" rests on version %s', ci ->> 'title', p_version), 512), 'material', v_state,
            (ci ->> 'owner_principal_id')::uuid, '{}',
            jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C3', 'confidence', 1)),
            jsonb_build_object('reach_id', p_reach_id, 'twin_id', p_twin, 'twin_version', p_version, 'item_id', ci ->> 'item_id'), v_due, 0, p_correlation)
    ON CONFLICT ON CONSTRAINT xai_once DO NOTHING;
    IF FOUND THEN
      PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
                jsonb_build_object('outcome', 'material', 'reasons', v_reasons, 'owner', ci ->> 'owner_principal_id', 'cause_event_id', v_cause, 'cause_event_type', 'validity.reach', 'reach_id', p_reach_id), p_correlation);
      v_items := v_items || jsonb_build_object('item_id', v_item, 'subject_kind', 'commitment_item', 'subject_id', ci ->> 'item_id', 'owner_principal_id', ci ->> 'owner_principal_id', 'state', v_state);
    END IF;
  END LOOP;
  INSERT INTO simulation.validity_reach (reach_id, scope, tenant_id, domain_id, twin_id, twin_version, trigger, cause_event_id, runs, packages, commitments, evaluation_results, items, identified_by, correlation_id)
  VALUES (p_reach_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_version, p_trigger, p_cause, v_reach -> 'runs', v_reach -> 'packages', v_reach -> 'commitments', v_reach -> 'evaluation_results', v_items, p_actor, p_correlation)
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.siv_record_reach(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid) FROM PUBLIC;

/* THE TRIGGER: a twin version UNVERIFIED (twin.mark_unverified — a correction of a cited input reaching the twin) identifies its reach in the
   same transaction — recorded only when a run rests on the version. */
CREATE OR REPLACE FUNCTION simulation.siv_on_twin_unverified() RETURNS trigger
SECURITY DEFINER SET search_path = simulation, pg_catalog, pg_temp AS $$
DECLARE v_version int := (NEW.details ->> 'version')::int;
BEGIN
  IF v_version IS NOT NULL AND EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.twin_id = NEW.twin_id AND r.twin_version = v_version) THEN
    PERFORM simulation.siv_record_reach(gen_random_uuid(), NEW.tenant_id, NEW.domain_id, NEW.twin_id, v_version, 'twin_unverified', NEW.event_id, NEW.actor_principal_id, NEW.correlation_id);
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.siv_on_twin_unverified() FROM PUBLIC;
CREATE TRIGGER siv_twin_unverified AFTER INSERT ON twin.twin_events
  FOR EACH ROW WHEN (NEW.event = 'version.unverified') EXECUTE FUNCTION simulation.siv_on_twin_unverified();

/* A PERSON identifies the reach of a twin version again (e.g. a correction found by review): the version must be admitted in this domain. */
CREATE OR REPLACE FUNCTION simulation.identify_validity_reach(p_reach_id uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v twin.twin_versions%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.validity.reach']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'run use rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'run use rejected (unknown_twin_version): version % of twin % is not a version in this domain', p_version, p_twin USING ERRCODE = '23503'; END IF;
  IF v.state <> 'admitted' THEN RAISE EXCEPTION 'run use rejected (state): version % of twin % is %; only an admitted version carries runs', p_version, p_twin, v.state USING ERRCODE = '22023'; END IF;
  RETURN simulation.siv_record_reach(p_reach_id, p_tenant, p_domain, p_twin, p_version, 'operator', NULL, p_actor, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.identify_validity_reach(uuid,uuid,uuid,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.identify_validity_reach(uuid,uuid,uuid,uuid,int,uuid,uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §V5 THE QUALITY FAILURE AND THE SUSPENSION CONSULTED (F-P4-09)
-- ─────────────────────────────────────────────────────────────────────
/* The latest quality evaluation of a scenario when it FAILED (else NULL). */
CREATE OR REPLACE FUNCTION prediction.siv_quality_failure(p_scenario_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN l.outcome = 'failed' THEN jsonb_build_object('evaluation_id', l.evaluation_id, 'evaluated_at', l.evaluated_at,
           'rules', (SELECT coalesce(string_agg(DISTINCT q ->> 'rule', ', '), '') FROM jsonb_array_elements(l.findings) q WHERE q ->> 'outcome' = 'fail')) END
    FROM (SELECT e.* FROM prediction.scenario_quality_evaluations e WHERE e.scenario_id = p_scenario_id ORDER BY e.evaluated_at DESC, e.evaluation_id DESC LIMIT 1) l
$$;
GRANT EXECUTE ON FUNCTION prediction.siv_quality_failure(uuid) TO eye_app, eye_commit;

/* SIMULATION: a run on a scenario whose latest quality evaluation FAILED is refused (open_run is not re-declared; B27's
   psa_run_branch_live is the precedent). A passing re-evaluation lifts it. */
CREATE OR REPLACE FUNCTION simulation.siv_run_refuses_quality_failure() RETURNS trigger
SECURITY DEFINER SET search_path = simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE f jsonb;
BEGIN
  f := prediction.siv_quality_failure(NEW.scenario_id);
  IF f IS NOT NULL THEN
    RAISE EXCEPTION 'run rejected (scenario_quality): scenario % failed its quality evaluation % at % (%); a scenario that fails its quality rules is not simulated until an evaluation passes',
      NEW.scenario_id, f ->> 'evaluation_id', f ->> 'evaluated_at', f ->> 'rules' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.siv_run_refuses_quality_failure() FROM PUBLIC;
CREATE TRIGGER siv_run_scenario_quality BEFORE INSERT ON simulation.runs_current
  FOR EACH ROW WHEN (NEW.scenario_id IS NOT NULL) EXECUTE FUNCTION simulation.siv_run_refuses_quality_failure();

/* PROMOTION TO SIMULATION: review_scenario (0081) marks the branch simulation_candidate_at; a SUSPENDED branch, or a scenario whose latest
   quality evaluation failed, is refused here (the review's whole write rolls back). */
CREATE OR REPLACE FUNCTION prediction.siv_promotion_gate() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE f jsonb;
BEGIN
  IF OLD.state = 'suspended' THEN
    RAISE EXCEPTION 'promotion to simulation rejected (branch_suspended): branch "%" is suspended since % (%); a suspended branch is not promoted to simulation until its owner reinstates it',
      OLD.name, OLD.suspended_at, OLD.suspension_reason USING ERRCODE = '22023';
  END IF;
  f := prediction.siv_quality_failure(NEW.scenario_id);
  IF f IS NOT NULL THEN
    RAISE EXCEPTION 'promotion to simulation rejected (scenario_quality): scenario % failed its quality evaluation % at % (%); resolve the findings and evaluate again before promoting a branch',
      NEW.scenario_id, f ->> 'evaluation_id', f ->> 'evaluated_at', f ->> 'rules' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.siv_promotion_gate() FROM PUBLIC;
CREATE TRIGGER siv_promotion_gate BEFORE UPDATE OF simulation_candidate_at ON prediction.branches_current
  FOR EACH ROW WHEN (NEW.simulation_candidate_at IS NOT NULL AND NEW.simulation_candidate_at IS DISTINCT FROM OLD.simulation_candidate_at) EXECUTE FUNCTION prediction.siv_promotion_gate();

/* THE WARNING GATE: a warning raised on a branch of a scenario whose latest quality evaluation failed (or on a suspended branch) is RAISED
   and MARKED input_unverified with the reason (warning.attention, via scenario_quality) — never suppressed; the coherence block of
   raise_warning (0081) runs after it and keeps its own reason when the coherence check failed too. */
CREATE OR REPLACE FUNCTION prediction.siv_warning_quality_mark() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; f jsonb; v_reason text;
BEGIN
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = NEW.branch_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  f := prediction.siv_quality_failure(b.scenario_id);
  IF f IS NOT NULL THEN
    v_reason := format('scenario %s failed its quality evaluation %s (%s); the warning stands on a scenario that fails its quality rules and is not decision-active until an evaluation passes', b.scenario_id, f ->> 'evaluation_id', f ->> 'rules');
  ELSIF b.state = 'suspended' THEN
    v_reason := format('branch "%s" is suspended (%s); the warning stands on a branch that is not live', b.name, b.suspension_reason);
  ELSE
    RETURN NULL;
  END IF;
  UPDATE prediction.warnings_current SET attention_state = 'input_unverified', attention_reason = v_reason WHERE warning_id = NEW.warning_id;
  INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', NEW.tenant_id, NEW.domain_id, NEW.warning_id, 'warning.attention', NEW.raised_by,
          jsonb_build_object('scenario_id', b.scenario_id, 'quality_evaluation_id', f ->> 'evaluation_id', 'via', CASE WHEN f IS NOT NULL THEN 'scenario_quality' ELSE 'branch_suspended' END, 'reason', v_reason), NEW.correlation_id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.siv_warning_quality_mark() FROM PUBLIC;
CREATE TRIGGER siv_warning_quality AFTER INSERT ON prediction.warnings_current
  FOR EACH ROW WHEN (NEW.branch_id IS NOT NULL) EXECUTE FUNCTION prediction.siv_warning_quality_mark();

-- ─────────────────────────────────────────────────────────────────────
-- §V6 THE ASSUMPTION → SCENARIO DEPENDENCY (F-P4-07)
-- ─────────────────────────────────────────────────────────────────────
/* A register link makes the SCENARIO depend on the ASU in the Knowledge Graph (graph.dependencies: SCN → strategy ASU), once per scenario
   and assumption whatever the number of links; the last unlink retires it (state removed, who and when). */
CREATE OR REPLACE FUNCTION prediction.siv_assumption_dependency() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.state = 'linked' THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', NEW.tenant_id, NEW.domain_id, NEW.scenario_id, 'SCN', 'strategy', NEW.assumption_id,
            left(format('the scenario''s assumption register links this assumption (%s): %s', CASE WHEN NEW.critical THEN 'critical' ELSE 'not critical' END, NEW.rationale), 2048), 'active', NEW.linked_by, NEW.correlation_id)
    ON CONFLICT DO NOTHING;
  ELSIF NOT EXISTS (SELECT 1 FROM prediction.scenario_assumptions l WHERE l.scenario_id = NEW.scenario_id AND l.assumption_id = NEW.assumption_id AND l.state = 'linked') THEN
    UPDATE graph.dependencies SET state = 'removed', removed_at = clock_timestamp(), removed_by = NEW.unlinked_by
     WHERE tenant_id = NEW.tenant_id AND domain_id = NEW.domain_id AND dependent_object_id = NEW.scenario_id AND dependent_type = 'SCN'
       AND depends_on_kind = 'strategy' AND depends_on_id = NEW.assumption_id AND state = 'active';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.siv_assumption_dependency() FROM PUBLIC;
CREATE TRIGGER siv_assumption_dependency AFTER INSERT OR UPDATE ON prediction.scenario_assumptions
  FOR EACH ROW EXECUTE FUNCTION prediction.siv_assumption_dependency();

-- ─────────────────────────────────────────────────────────────────────
-- §V7 THE CLAIM AND INDICATOR CONDITIONS SUSPEND (F-P4-07)
-- ─────────────────────────────────────────────────────────────────────
/* The core (private): every LIVE branch of an ACTIVE scenario whose CRITICAL linked assumption carries a condition of this kind naming this
   object is suspended through 0097's core (psa_suspend_branch: the ledger event, the branch owner tasked scenario.suspension), once;
   suspended or closed branches are left. The cause names the assumption and the condition (kind assumption, via claim|indicator). */
CREATE OR REPLACE FUNCTION prediction.siv_apply_condition(p_tenant uuid, p_domain uuid, p_kind text, p_ref uuid, p_actor uuid, p_detail text, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; l record; v_out jsonb := '[]'::jsonb; v_reason text; v_actor uuid;
BEGIN
  FOR b IN
    SELECT br.* FROM prediction.branches_current br JOIN prediction.scenarios_current sc ON sc.scenario_id = br.scenario_id AND sc.state = 'active'
     WHERE br.tenant_id = p_tenant AND br.domain_id = p_domain AND prediction.branch_live(br.state)
       AND EXISTS (SELECT 1 FROM prediction.scenario_assumptions x WHERE x.scenario_id = br.scenario_id AND (x.branch_id IS NULL OR x.branch_id = br.branch_id) AND x.state = 'linked' AND x.critical
                     AND x.invalidation_condition ->> 'kind' = p_kind AND x.invalidation_condition ->> (p_kind || '_id') = p_ref::text)
     ORDER BY br.scenario_id, br.branch_id FOR UPDATE OF br
  LOOP
    SELECT x.link_id, x.assumption_id, x.linked_by, x.invalidation_condition, a.title INTO l
      FROM prediction.scenario_assumptions x JOIN graph.strategy_current a ON a.strategy_object_id = x.assumption_id
     WHERE x.scenario_id = b.scenario_id AND (x.branch_id IS NULL OR x.branch_id = b.branch_id) AND x.state = 'linked' AND x.critical
       AND x.invalidation_condition ->> 'kind' = p_kind AND x.invalidation_condition ->> (p_kind || '_id') = p_ref::text
     ORDER BY x.linked_at, x.link_id LIMIT 1;
    v_actor := coalesce(p_actor, l.linked_by);
    v_reason := left(format('the invalidation condition of the critical assumption "%s" is met: %s — %s', l.title, l.invalidation_condition ->> 'text', p_detail), 2048);
    v_out := v_out || jsonb_build_array(prediction.psa_suspend_branch(b, v_reason,
      jsonb_build_object('kind', 'assumption', 'id', l.assumption_id, 'title', l.title, 'link_ids', jsonb_build_array(l.link_id), 'via', p_kind, 'condition', l.invalidation_condition, 'detail', p_detail),
      v_actor, p_correlation));
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.siv_apply_condition(uuid, uuid, text, uuid, uuid, text, uuid) FROM PUBLIC;

/* A CLAIM's new version DISPUTED or WITHDRAWN (lifecycle or truth state) meets the claim conditions naming it. */
CREATE OR REPLACE FUNCTION prediction.siv_on_claim_disputed() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM prediction.scenario_assumptions x WHERE x.state = 'linked' AND x.critical AND x.invalidation_condition ->> 'kind' = 'claim' AND x.invalidation_condition ->> 'claim_id' = NEW.object_id::text) THEN
    PERFORM prediction.siv_apply_condition(NEW.tenant_id, NEW.domain_id, 'claim', NEW.object_id, public.eye_principal(),
      format('claim %s is %s at version %s', NEW.object_id, CASE WHEN NEW.lifecycle_state IN ('disputed', 'withdrawn') THEN NEW.lifecycle_state ELSE NEW.truth_state END, NEW.object_version),
      coalesce(NEW.audit_correlation_id, gen_random_uuid()));
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.siv_on_claim_disputed() FROM PUBLIC;
CREATE TRIGGER siv_claim_condition AFTER INSERT ON objects.canonical_objects
  FOR EACH ROW WHEN (NEW.object_type = 'CLM' AND (NEW.lifecycle_state IN ('disputed', 'withdrawn') OR NEW.truth_state IN ('disputed', 'withdrawn')))
  EXECUTE FUNCTION prediction.siv_on_claim_disputed();

/* An INDICATOR's breach (breached false → true) meets the indicator conditions naming it. */
CREATE OR REPLACE FUNCTION prediction.siv_on_indicator_breached() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, public, pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM prediction.scenario_assumptions x WHERE x.state = 'linked' AND x.critical AND x.invalidation_condition ->> 'kind' = 'indicator' AND x.invalidation_condition ->> 'indicator_id' = NEW.indicator_id::text) THEN
    PERFORM prediction.siv_apply_condition(NEW.tenant_id, NEW.domain_id, 'indicator', NEW.indicator_id, public.eye_principal(),
      format('indicator "%s" breached at %s', NEW.description, coalesce(NEW.breached_at, clock_timestamp())), gen_random_uuid());
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.siv_on_indicator_breached() FROM PUBLIC;
CREATE TRIGGER siv_indicator_condition AFTER UPDATE OF breached ON prediction.indicators_current
  FOR EACH ROW WHEN (NEW.breached AND NOT OLD.breached) EXECUTE FUNCTION prediction.siv_on_indicator_breached();

-- ─────────────────────────────────────────────────────────────────────
-- §V8 THE BRANCH'S TWIN BINDING (F-P4-07 / AI-49-002)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE prediction.branch_twin_bindings (
  binding_id           uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  scenario_id          uuid NOT NULL REFERENCES prediction.scenarios_current (scenario_id),
  branch_id            uuid NOT NULL REFERENCES prediction.branches_current (branch_id),
  version              int NOT NULL CHECK (version >= 1),
  twin_id              uuid NOT NULL,
  twin_version         int NOT NULL,
  initial_state_digest text NOT NULL CHECK (initial_state_digest ~ '^[0-9a-f]{64}$'),
  /* [{key, value, unit}] — the elements of the bound state the branch's initial conditions name, with their values at binding */
  initial_conditions   jsonb NOT NULL CHECK (jsonb_typeof(initial_conditions) = 'array'),
  constraint_set_id    uuid REFERENCES simulation.constraint_sets (set_id),
  constraint_set_version int,
  /* [{assumption_id, factor_key, note}] — which run sensitivity factor each linked assumption of the branch's register moves (AI-49-004) */
  assumption_factors   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assumption_factors) = 'array'),
  rationale            text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 2048),
  state                text NOT NULL CHECK (state IN ('active', 'superseded', 'retired')),
  bound_by             uuid NOT NULL,
  bound_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_by             uuid,
  ended_at             timestamptz,
  end_reason           text,
  correlation_id       uuid NOT NULL,
  FOREIGN KEY (twin_id, twin_version) REFERENCES twin.twin_versions (twin_id, version),
  CONSTRAINT siv_binding_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT siv_binding_set_version CHECK ((constraint_set_id IS NULL) = (constraint_set_version IS NULL)),
  CONSTRAINT siv_binding_ended CHECK ((state = 'active') = (ended_at IS NULL AND ended_by IS NULL AND end_reason IS NULL))
);
CREATE UNIQUE INDEX siv_binding_one_active ON prediction.branch_twin_bindings (branch_id) WHERE state = 'active';
CREATE UNIQUE INDEX siv_binding_version ON prediction.branch_twin_bindings (branch_id, version);
COMMENT ON TABLE prediction.branch_twin_bindings IS 'B31 (0099 §V; F-P4-07, AI-49-002): a branch BOUND to its baseline twin state (an admitted twin version and its state digest), the initial conditions it names, the constraint set and the sensitivity factors its assumptions move; versioned (a rebind supersedes, a retirement ends it, never deleted). A run on a bound branch starts from that state (run rejected (branch_binding)).';

/* Only the END of a binding moves a row (active → superseded | retired, once, with who, when and why). */
CREATE OR REPLACE FUNCTION prediction.siv_binding_guard() RETURNS trigger
SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'branch twin bindings are never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'active' OR NEW.state = 'active' OR (to_jsonb(NEW) - ARRAY['state', 'ended_by', 'ended_at', 'end_reason']) <> (to_jsonb(OLD) - ARRAY['state', 'ended_by', 'ended_at', 'end_reason']) THEN
    RAISE EXCEPTION 'branch twin binding % is %; only an active binding ends (superseded or retired), once', OLD.binding_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER siv_binding_guard BEFORE UPDATE OR DELETE ON prediction.branch_twin_bindings FOR EACH ROW EXECUTE FUNCTION prediction.siv_binding_guard();

/* The state digest of a twin version exactly as open_run (0092) computes the run's initial_state_digest. */
CREATE OR REPLACE FUNCTION twin.siv_state_digest(p_twin_id uuid, p_version int) RETURNS text
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value, 'unit', e.unit,
                                               'material', e.material, 'citations', e.citations, 'health', e.health, 'valid_from', e.valid_from,
                                               'valid_to', e.valid_to, 'confidence', e.confidence, 'synthetic_state', e.synthetic_state, 'controls', e.controls,
                                               'inherited_validation', e.inherited_validation)
                            ORDER BY e.key), '[]'::jsonb)::text, 'UTF8')), 'hex')
    FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_version
$$;
GRANT EXECUTE ON FUNCTION twin.siv_state_digest(uuid, int) TO eye_app, eye_commit;

/* BIND a branch (new, or a REBIND naming the active version it read — the prior superseded): the branch's owner, the scenario's owner (or
   an administrator through the PDP's roles is not enough: the port names the owners); the twin version admitted in this domain; each initial
   condition an element of that state (a stated value must equal the element's); the constraint set live; each assumption factor names an
   assumption linked to the branch (or scenario-wide) and a factor key. */
CREATE OR REPLACE FUNCTION prediction.bind_branch_twin(
  p_binding_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_twin_id uuid, p_twin_version int, p_conditions jsonb, p_constraint_set_id uuid,
  p_assumption_factors jsonb, p_rationale text, p_expected_version int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, twin, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; s prediction.scenarios_current%ROWTYPE; v twin.twin_versions%ROWTYPE; cur prediction.branch_twin_bindings%ROWTYPE;
        cs simulation.constraint_sets%ROWTYPE; c jsonb; el record; v_conds jsonb := '[]'::jsonb; f jsonb; v_factors jsonb := '[]'::jsonb; n prediction.branch_twin_bindings%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.validity.bind']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('branch binding', p_actor, p_tenant);
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch binding rejected (unknown_branch): no branch % in this domain', p_branch_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = b.scenario_id;
  IF p_actor IS DISTINCT FROM b.owner_principal_id AND p_actor IS DISTINCT FROM s.owner_principal_id THEN
    RAISE EXCEPTION 'branch binding rejected (ownership): branch "%" is bound by its owner or the scenario''s owner', b.name USING ERRCODE = '42501';
  END IF;
  IF s.state <> 'active' THEN RAISE EXCEPTION 'branch binding rejected (state): scenario "%" is %', s.title, s.state USING ERRCODE = '22023'; END IF;
  IF b.state = 'closed' THEN RAISE EXCEPTION 'branch binding rejected (state): branch "%" is closed', b.name USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_rationale, ''))) NOT BETWEEN 8 AND 2048 THEN RAISE EXCEPTION 'branch binding rejected (rationale): a binding states why the branch starts from this state (8-2048 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin_id AND x.version = p_twin_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch binding rejected (unknown_twin_version): version % of twin % is not a version in this domain', p_twin_version, p_twin_id USING ERRCODE = '23503'; END IF;
  IF v.state <> 'admitted' THEN RAISE EXCEPTION 'branch binding rejected (twin_version): version % of twin % is %; a branch binds an admitted state', p_twin_version, p_twin_id, v.state USING ERRCODE = '22023'; END IF;
  IF v.verification_state <> 'verified' THEN RAISE EXCEPTION 'branch binding rejected (twin_version): version % of twin % is unverified (a cited input was corrected); bind a verified state', p_twin_version, p_twin_id USING ERRCODE = '22023'; END IF;
  IF p_conditions IS NULL OR jsonb_typeof(p_conditions) <> 'array' OR jsonb_array_length(p_conditions) = 0 OR jsonb_array_length(p_conditions) > 50 THEN
    RAISE EXCEPTION 'branch binding rejected (initial_conditions): a binding names 1 to 50 initial conditions [{key, value?}] of the bound state' USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
    IF jsonb_typeof(c) <> 'object' OR coalesce(c ->> 'key', '') = '' THEN RAISE EXCEPTION 'branch binding rejected (initial_conditions): each condition names an element key' USING ERRCODE = '22023'; END IF;
    SELECT e.key, e.value, e.unit INTO el FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_twin_version AND e.key = c ->> 'key';
    IF NOT FOUND THEN RAISE EXCEPTION 'branch binding rejected (unknown_element): % is not an element of version % of twin %', c ->> 'key', p_twin_version, p_twin_id USING ERRCODE = '23503'; END IF;
    IF c ? 'value' AND (c -> 'value') IS DISTINCT FROM to_jsonb(el.value) THEN
      RAISE EXCEPTION 'branch binding rejected (initial_conditions): element % holds % in version % of twin %, not the stated %', c ->> 'key', to_jsonb(el.value), p_twin_version, p_twin_id, c -> 'value' USING ERRCODE = '22023';
    END IF;
    v_conds := v_conds || jsonb_build_object('key', el.key, 'value', to_jsonb(el.value), 'unit', el.unit);
  END LOOP;
  IF p_constraint_set_id IS NOT NULL THEN
    SELECT * INTO cs FROM simulation.constraint_sets x WHERE x.set_id = p_constraint_set_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'branch binding rejected (unknown_constraint_set): no constraint set % in this domain', p_constraint_set_id USING ERRCODE = '23503'; END IF;
    IF cs.state <> 'live' THEN RAISE EXCEPTION 'branch binding rejected (constraint_set): constraint set "%" is %', cs.title, cs.state USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_assumption_factors IS NOT NULL AND jsonb_typeof(p_assumption_factors) <> 'array' THEN RAISE EXCEPTION 'branch binding rejected (assumption_factors): [{assumptionId, factorKey}]' USING ERRCODE = '22023'; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(p_assumption_factors, '[]'::jsonb)) LOOP
    IF coalesce(f ->> 'assumption_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR length(btrim(coalesce(f ->> 'factor_key', ''))) NOT BETWEEN 1 AND 128 THEN
      RAISE EXCEPTION 'branch binding rejected (assumption_factors): each names an assumption_id and a factor_key' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM prediction.scenario_assumptions l WHERE l.scenario_id = b.scenario_id AND (l.branch_id IS NULL OR l.branch_id = b.branch_id) AND l.state = 'linked' AND l.assumption_id = (f ->> 'assumption_id')::uuid) THEN
      RAISE EXCEPTION 'branch binding rejected (unknown_assumption): % is not linked to branch "%" or its scenario', f ->> 'assumption_id', b.name USING ERRCODE = '23503';
    END IF;
    v_factors := v_factors || jsonb_build_object('assumption_id', f ->> 'assumption_id', 'factor_key', btrim(f ->> 'factor_key'), 'note', f ->> 'note');
  END LOOP;
  SELECT * INTO cur FROM prediction.branch_twin_bindings x WHERE x.branch_id = p_branch_id AND x.state = 'active' FOR UPDATE;
  IF FOUND THEN
    IF p_expected_version IS DISTINCT FROM cur.version THEN
      RAISE EXCEPTION 'branch binding rejected (%): branch "%" is bound at version %, the request names version %; reload and rebind the current version',
        CASE WHEN p_expected_version IS NULL THEN 'duplicate' ELSE 'stale' END, b.name, cur.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
    END IF;
    UPDATE prediction.branch_twin_bindings SET state = 'superseded', ended_by = p_actor, ended_at = clock_timestamp(), end_reason = 'rebound: ' || btrim(p_rationale) WHERE binding_id = cur.binding_id;
  ELSIF p_expected_version IS NOT NULL THEN
    RAISE EXCEPTION 'branch binding rejected (stale): branch "%" has no active binding to rebind', b.name USING ERRCODE = '22023';
  END IF;
  INSERT INTO prediction.branch_twin_bindings (binding_id, scope, tenant_id, domain_id, scenario_id, branch_id, version, twin_id, twin_version, initial_state_digest, initial_conditions,
                                               constraint_set_id, constraint_set_version, assumption_factors, rationale, state, bound_by, correlation_id)
  VALUES (p_binding_id, 'DOMAIN', p_tenant, p_domain, b.scenario_id, p_branch_id,
          coalesce((SELECT max(x.version) FROM prediction.branch_twin_bindings x WHERE x.branch_id = p_branch_id), 0) + 1,
          p_twin_id, p_twin_version, twin.siv_state_digest(p_twin_id, p_twin_version), v_conds, p_constraint_set_id, CASE WHEN p_constraint_set_id IS NULL THEN NULL ELSE cs.current_version END,
          v_factors, btrim(p_rationale), 'active', p_actor, p_correlation) RETURNING * INTO n;
  RETURN to_jsonb(n) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' || jsonb_build_object('branch_name', b.name, 'superseded_version', cur.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.bind_branch_twin(uuid,uuid,uuid,uuid,uuid,int,jsonb,uuid,jsonb,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.bind_branch_twin(uuid,uuid,uuid,uuid,uuid,int,jsonb,uuid,jsonb,text,int,uuid,uuid) TO eye_commit;

/* RETIRE the active binding (the same owners; a reason): runs on the branch are no longer held to a state. */
CREATE OR REPLACE FUNCTION prediction.retire_branch_twin(p_tenant uuid, p_domain uuid, p_branch_id uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b prediction.branches_current%ROWTYPE; s prediction.scenarios_current%ROWTYPE; cur prediction.branch_twin_bindings%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.validity.bind']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM prediction.psa_assert_actor('branch binding', p_actor, p_tenant);
  SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch binding rejected (unknown_branch): no branch % in this domain', p_branch_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = b.scenario_id;
  IF p_actor IS DISTINCT FROM b.owner_principal_id AND p_actor IS DISTINCT FROM s.owner_principal_id THEN
    RAISE EXCEPTION 'branch binding rejected (ownership): branch "%" is unbound by its owner or the scenario''s owner', b.name USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 16 THEN RAISE EXCEPTION 'branch binding rejected (reason): a retirement states why the branch no longer starts from the bound state (16+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM prediction.branch_twin_bindings x WHERE x.branch_id = p_branch_id AND x.state = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch binding rejected (state): branch "%" has no active binding', b.name USING ERRCODE = '22023'; END IF;
  UPDATE prediction.branch_twin_bindings SET state = 'retired', ended_by = p_actor, ended_at = clock_timestamp(), end_reason = btrim(p_reason) WHERE binding_id = cur.binding_id RETURNING * INTO cur;
  RETURN to_jsonb(cur) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.retire_branch_twin(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.retire_branch_twin(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* THE RUN'S GATE: a run on a BOUND branch starts from the bound state — the same twin and version, the same state digest, each initial
   condition's value as bound. Unbound branches are untouched. */
CREATE OR REPLACE FUNCTION prediction.siv_run_branch_binding() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE k prediction.branch_twin_bindings%ROWTYPE; c jsonb; v jsonb;
BEGIN
  SELECT * INTO k FROM prediction.branch_twin_bindings x WHERE x.branch_id = NEW.scenario_branch_id AND x.state = 'active';
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.twin_id <> k.twin_id OR NEW.twin_version <> k.twin_version THEN
    RAISE EXCEPTION 'run rejected (branch_binding): branch % is bound (binding v%) to version % of twin %, not version % of twin %; a run on the branch starts from its bound state (or the binding is revised first)',
      NEW.scenario_branch_id, k.version, k.twin_version, k.twin_id, NEW.twin_version, NEW.twin_id USING ERRCODE = '22023';
  END IF;
  IF NEW.initial_state_digest <> k.initial_state_digest THEN
    RAISE EXCEPTION 'run rejected (branch_binding): the run''s initial state % differs from the state % bound to branch % (binding v%)', NEW.initial_state_digest, k.initial_state_digest, NEW.scenario_branch_id, k.version USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(k.initial_conditions) LOOP
    SELECT e -> 'value' INTO v FROM jsonb_array_elements(NEW.initial_state) e WHERE e ->> 'key' = c ->> 'key';
    IF v IS DISTINCT FROM (c -> 'value') THEN
      RAISE EXCEPTION 'run rejected (branch_binding): initial condition % is % in the run, % in the binding of branch % (v%)', c ->> 'key', coalesce(v::text, 'absent'), c -> 'value', NEW.scenario_branch_id, k.version USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.siv_run_branch_binding() FROM PUBLIC;
CREATE TRIGGER siv_run_branch_binding BEFORE INSERT ON simulation.runs_current
  FOR EACH ROW WHEN (NEW.scenario_branch_id IS NOT NULL) EXECUTE FUNCTION prediction.siv_run_branch_binding();

/* The branch's binding read (the active one and the history), with the runs on the branch since and whether each started from it. */
CREATE OR REPLACE FUNCTION prediction.branch_twin_binding_read(p_branch_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = prediction, simulation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN b.branch_id IS NULL THEN NULL ELSE jsonb_build_object(
    'branch', jsonb_build_object('branch_id', b.branch_id, 'name', b.name, 'kind', b.kind, 'state', b.state, 'scenario_id', b.scenario_id, 'owner_principal_id', b.owner_principal_id),
    'active', (SELECT to_jsonb(k) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' FROM prediction.branch_twin_bindings k WHERE k.branch_id = b.branch_id AND k.state = 'active'),
    'history', coalesce((SELECT jsonb_agg(to_jsonb(k) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' ORDER BY k.version DESC) FROM prediction.branch_twin_bindings k WHERE k.branch_id = b.branch_id), '[]'::jsonb),
    'runs', coalesce((SELECT jsonb_agg(jsonb_build_object('run_id', r.run_id, 'state', r.state, 'twin_id', r.twin_id, 'twin_version', r.twin_version, 'initial_state_digest', r.initial_state_digest,
                                                           'opened_at', r.opened_at,
                                                           'from_bound_state', EXISTS (SELECT 1 FROM prediction.branch_twin_bindings k WHERE k.branch_id = b.branch_id AND k.state = 'active'
                                                                                         AND k.twin_id = r.twin_id AND k.twin_version = r.twin_version AND k.initial_state_digest = r.initial_state_digest))
                                         ORDER BY r.opened_at DESC) FROM (SELECT * FROM simulation.runs_current r WHERE r.scenario_branch_id = b.branch_id ORDER BY r.opened_at DESC LIMIT 50) r), '[]'::jsonb)) END
    FROM (SELECT 1) one LEFT JOIN prediction.branches_current b ON b.branch_id = p_branch_id
$$;
GRANT EXECUTE ON FUNCTION prediction.branch_twin_binding_read(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §V9 SENSITIVITY TO MATERIAL ASSUMPTIONS (AI-49-004)
-- ─────────────────────────────────────────────────────────────────────
/* A run's sensitivity factors read against the CRITICAL assumptions of its branch's register: each critical linked assumption with the factor
   its branch binding maps it to, that factor's rank and spread among the run's factors (§I's latest analysis of the run when present —
   simulation.sensitivity_analyses, read through to_regclass —, else the run's own one-at-a-time factors), and MATERIAL when its factor ranks
   in the top three; unmapped critical assumptions are named (their sensitivity is not measured). NULL when the run is not visible. */
CREATE OR REPLACE FUNCTION simulation.run_assumption_sensitivity(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = simulation, prediction, graph, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_factors jsonb := '[]'::jsonb; v_source text := 'run'; v_map jsonb := '[]'::jsonb; v_out jsonb := '[]'::jsonb; a record; m jsonb; v_f jsonb; v_rank int;
BEGIN
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF to_regclass('simulation.sensitivity_analyses') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce((SELECT a.factors FROM simulation.sensitivity_analyses a WHERE a.run_id = $1 ORDER BY a.requested_at DESC NULLS LAST LIMIT 1), ''[]''::jsonb)' INTO v_factors USING p_run_id;
    IF jsonb_array_length(v_factors) > 0 THEN v_source := 'analysis'; END IF;
  END IF;
  IF jsonb_array_length(v_factors) = 0 THEN
    -- the run's own one-at-a-time factors, ranked by the cost spread (the service's sensitivityOf; supply-flow)
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', x.fx ->> 'key', 'spread', (x.fx ->> 'cost_spread')::numeric, 'rank', x.rk) ORDER BY x.rk), '[]'::jsonb) INTO v_factors
      FROM (SELECT fe.fx, row_number() OVER (ORDER BY coalesce((fe.fx ->> 'cost_spread')::numeric, 0) DESC, fe.fx ->> 'key') AS rk FROM jsonb_array_elements(coalesce(r.sensitivity -> 'factors', '[]'::jsonb)) AS fe(fx)) x;
  END IF;
  SELECT coalesce(k.assumption_factors, '[]'::jsonb) INTO v_map FROM prediction.branch_twin_bindings k WHERE k.branch_id = r.scenario_branch_id AND k.state = 'active';
  v_map := coalesce(v_map, '[]'::jsonb);
  FOR a IN SELECT l.assumption_id, l.critical, l.invalidation_condition, s.title, s.verification_state, prediction.psa_condition_met(l.invalidation_condition, l.assumption_id) AS met
             FROM prediction.scenario_assumptions l JOIN graph.strategy_current s ON s.strategy_object_id = l.assumption_id
            WHERE r.scenario_id IS NOT NULL AND l.scenario_id = r.scenario_id AND (l.branch_id IS NULL OR l.branch_id = r.scenario_branch_id) AND l.state = 'linked' AND l.critical
            ORDER BY s.title LOOP
    SELECT x INTO m FROM jsonb_array_elements(v_map) x WHERE x ->> 'assumption_id' = a.assumption_id::text LIMIT 1;
    v_f := NULL; v_rank := NULL;
    IF m IS NOT NULL THEN
      SELECT x INTO v_f FROM jsonb_array_elements(v_factors) x WHERE x ->> 'key' = m ->> 'factor_key' LIMIT 1;
      v_rank := (v_f ->> 'rank')::int;
    END IF;
    v_out := v_out || jsonb_build_object('assumption_id', a.assumption_id, 'title', a.title, 'verification_state', a.verification_state, 'condition', a.invalidation_condition, 'condition_met', a.met,
      'factor_key', m ->> 'factor_key', 'factor', v_f, 'rank', v_rank,
      'material', CASE WHEN m IS NULL OR v_f IS NULL THEN NULL ELSE v_rank <= 3 END,
      'measured', m IS NOT NULL AND v_f IS NOT NULL,
      'note', CASE WHEN m IS NULL THEN 'no factor is mapped to this critical assumption on the branch''s binding: its sensitivity is not measured'
                   WHEN v_f IS NULL THEN format('factor %s is not among the run''s sensitivity factors', m ->> 'factor_key')
                   WHEN v_rank <= 3 THEN format('MATERIAL: the result is sensitive to this assumption (factor %s ranks %s of %s)', m ->> 'factor_key', v_rank, jsonb_array_length(v_factors))
                   ELSE format('not material: factor %s ranks %s of %s', m ->> 'factor_key', v_rank, jsonb_array_length(v_factors)) END);
  END LOOP;
  RETURN jsonb_build_object('run_id', r.run_id, 'scenario_id', r.scenario_id, 'branch_id', r.scenario_branch_id, 'source', v_source, 'factors', v_factors, 'assumptions', v_out,
    'material', (SELECT coalesce(jsonb_agg(x -> 'assumption_id'), '[]'::jsonb) FROM jsonb_array_elements(v_out) x WHERE (x ->> 'material')::boolean),
    'unmeasured', (SELECT coalesce(jsonb_agg(x -> 'assumption_id'), '[]'::jsonb) FROM jsonb_array_elements(v_out) x WHERE NOT (x ->> 'measured')::boolean));
END $$;
GRANT EXECUTE ON FUNCTION simulation.run_assumption_sensitivity(uuid) TO eye_app, eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §V10 RLS AND GRANTS (the 0081 loop idiom; reads by the definer ports and the invoker reads under the caller's RLS)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['decision_use_policies', 'validity_reach'] LOOP
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
REVOKE ALL ON prediction.branch_twin_bindings FROM PUBLIC;
ALTER TABLE prediction.branch_twin_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.branch_twin_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.branch_twin_bindings USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.branch_twin_bindings TO eye_app, eye_commit;
