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
